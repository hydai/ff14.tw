const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const LAYOUT_FILE = 'tools/character-card/card-layout.js';

// 這支腳本把東西掛在 window 上，所以讓 window 指向 context 本身（同 character-card-state.test.js）。
// 每個 context 各載一份，改了其中一個不會影響另一個。
// withoutSegmenter：模擬沒有 Intl.Segmenter 的舊瀏覽器（Firefox 125 以前）：腳本載入時才決定怎麼切字，
// 所以要在載入之前把這個 context 的 Intl.Segmenter 拿掉（Intl 是每個 context 各一份，不影響別的）
function loadContext(files, { withoutSegmenter = false } = {}) {
    const context = vm.createContext({});
    context.window = context;
    if (withoutSegmenter) {
        vm.runInContext('delete Intl.Segmenter', context);
        assert.equal(vm.runInContext('typeof Intl.Segmenter', context), 'undefined');
    }
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    }
    return context;
}

const context = loadContext([LAYOUT_FILE]);
const { CardLayout } = context;
// 故意用解構取出：頁面不一定用 CardLayout.xxx() 的寫法呼叫，這些函式不能靠 this
const { fitScale, wrapText, layoutChips, coverRect, dragCrop, canPan, textColorOn, contrastRatio, graphemes } = CardLayout;

// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值（不能傳 undefined，也看不出 -0）
const plain = (value) => JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
    for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
    return Object.freeze(value);
}

// 拖曳的換算有除法，浮點數用「差不多」比
function assertNear(actual, expected, message = '') {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message} ${actual} 不等於 ${expected}`.trim());
}

// 對比度的預期值是照公式算出來、寫到小數點後四位的，所以容許 epsilon
function assertNear2(actual, expected, epsilon) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} 不等於 ${expected}`);
}

// 假的量字（字型已經套好的替身）：英數與拉丁字母一個字 0.6 × SIZE 寬，其他（中日韓、全形字、標點、…）一個字 1 × SIZE 寬。
// SIZE 取 10：拉丁字母 6、其他 10，所以「20 字寬」就是 200
const SIZE = 10;
const isLatin = (char) => char.codePointAt(0) < 0x250;
const measure = (text) => Array.from(text).reduce((sum, char) => sum + (isLatin(char) ? 0.6 * SIZE : SIZE), 0);

const CHINESE_60 = '甲乙丙丁戊己庚辛壬癸'.repeat(6); // 60 個字，每個字寬 10
const SENTENCE = 'the quick brown fox jumps over the lazy dog';

// 看起來是一個字、卻不只一個 Unicode 字元的東西。用跳脫寫：編輯器與工具不會悄悄把它們改寫成別的形式（零寬連接符號是看不見的）
const FLAG = '\u{1F1F9}\u{1F1FC}'; // 🇹🇼：兩個區域指示符號（2 個字元）
const FLAG_JP = '\u{1F1EF}\u{1F1F5}'; // 🇯🇵
const FAMILY = '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}'; // 👨‍👩‍👧：三個 emoji 用零寬連接符號接起來（5 個字元）
const E_ACUTE = 'e\u{301}'; // é：e 加上組合用的重音符號（2 個字元）
const THUMB = '\u{1F44D}\u{1F3FD}'; // 👍🏽：加上膚色
const KEYCAP = '1\u{FE0F}\u{20E3}'; // 1️⃣：數字加變體選擇符與外框
// 空格後面接著組合符號：也是一個字素，不是空白（顏文字常有）。Lenny 臉有三個：括號後面、兩顆眼睛之間各一個，
// 組合符號是 U+0361 與 U+035C，接在前面的空格上（不寫成真的字元，理由同上）
const LENNY = '( \u{0361}° \u{035C}ʖ \u{0361}°)';
// 組合用的符號（U+0300～U+036F）的個數：折行之後一個都不能少
const marksOf = (text) => (text.match(/[\u{0300}-\u{036F}]/gu) ?? []).length;

// ---------- 模組 ----------

test('CardLayout：只掛一個全域、模組凍結、只有規定的九個函式', () => {
    assert.equal(Object.isFrozen(CardLayout), true);
    assert.deepEqual(Object.keys(CardLayout).sort(), ['canPan', 'contrastRatio', 'coverRect', 'dragCrop', 'fitScale', 'graphemes', 'layoutChips', 'textColorOn', 'wrapText']);
    for (const [name, fn] of Object.entries(CardLayout)) assert.equal(typeof fn, 'function', name);

    // 只掛 CardLayout 一個全域：常數與小函式都收在立即執行的函式裡，不會和頁面其他腳本的名稱撞在一起；
    // 這個 context 裡沒有 document 與 canvas，函式照樣算得出來，所以不碰 DOM
    const alone = loadContext([LAYOUT_FILE]);
    assert.deepEqual(Object.keys(alone).filter((name) => name !== 'window'), ['CardLayout']);
    assert.equal(alone.document, undefined);
});

// ---------- fitScale ----------

test('fitScale：放得下是 1，放不下照比例縮小，不低於下限 0.55', () => {
    assert.equal(fitScale(100, 200), 1); // 放得下
    assert.equal(fitScale(200, 200), 1); // 剛好放得下
    assert.equal(fitScale(0, 200), 1);
    assert.equal(fitScale(400, 200), 0.55); // 寬兩倍：比例 0.5，比下限小，所以是下限
    assert.equal(fitScale(250, 200), 0.8); // 寬 1.25 倍
    assert.equal(fitScale(1e9, 200), 0.55);

    // 下限可以自己給
    assert.equal(fitScale(400, 200, 0.4), 0.5);
    assert.equal(fitScale(400, 200, 0.6), 0.6);
    assert.equal(fitScale(1000, 200, 0), 0.2);

    // 寬度是 0、負的、量出來不是數字：不丟錯，縮到下限；兩個數有一個不是數字就當成放得下，不縮
    assert.equal(fitScale(100, 0), 0.55);
    assert.equal(fitScale(100, -5), 0.55);
    assert.equal(fitScale(Infinity, 200), 0.55);
    assert.equal(fitScale(NaN, 200), 1);
    assert.equal(fitScale(100, NaN), 1);
    assert.equal(fitScale(100, Infinity), 1);
});

// ---------- graphemes ----------

test('graphemes：國旗、家庭 emoji、組合字、膚色、鍵帽、CRLF 各是一個字素；其他的字一個字元一個字素', () => {
    const text = `${FLAG}${FAMILY}${E_ACUTE}${THUMB}${KEYCAP}\r\n寬\u{20BB7}`;
    assert.deepEqual(plain(graphemes(text)), [FLAG, FAMILY, E_ACUTE, THUMB, KEYCAP, '\r\n', '寬', '\u{20BB7}']);
    // 這幾個字素各自不只一個 Unicode 字元，所以和 Array.from 的切法不一樣
    assert.equal(Array.from(FLAG).length, 2);
    assert.equal(Array.from(FAMILY).length, 5);
    assert.ok(graphemes(text).length < Array.from(text).length);

    // 一般的字（拉丁字母、空白、中日韓、標點、罕用字、單一個 emoji）就是每個字元一個字素，和 Array.from 一樣
    const plainText = 'Ab 你好，ひ\u{1F98A}\u{20BB7}';
    assert.deepEqual(plain(graphemes(plainText)), Array.from(plainText));
    assert.deepEqual(plain(graphemes(plainText)), ['A', 'b', ' ', '你', '好', '，', 'ひ', '\u{1F98A}', '\u{20BB7}']);

    // 接起來還是原文；每次回傳新的陣列
    assert.equal(graphemes(text).join(''), text);
    assert.notEqual(graphemes(text), graphemes(text));

    // 空字串是 []；不是字串也是 []，不丟錯
    assert.deepEqual(plain(graphemes('')), []);
    for (const bad of [null, undefined, 42, true, ['a'], { length: 1 }, Symbol.iterator]) {
        assert.deepEqual(plain(graphemes(bad)), [], util.inspect(bad));
    }
});

test('graphemes：沒有 Intl.Segmenter 時照 Array.from 切（每個 Unicode 字元一項），不丟錯', () => {
    const old = loadContext([LAYOUT_FILE], { withoutSegmenter: true });
    const fallback = old.CardLayout.graphemes;
    assert.equal(typeof fallback, 'function');

    // 國旗是兩個區域指示符號，家庭 emoji 是五個字元
    assert.deepEqual(plain(fallback(FLAG)), ['\u{1F1F9}', '\u{1F1FC}']);
    assert.deepEqual(plain(fallback(FAMILY)), Array.from(FAMILY));
    assert.equal(fallback(FAMILY).length, 5);
    const text = `${FLAG}${FAMILY}${E_ACUTE}${THUMB}${KEYCAP}\r\n寬\u{20BB7}`;
    assert.deepEqual(plain(fallback(text)), Array.from(text));
    // 代理對還是一個字元，不會拆成兩半
    assert.deepEqual(plain(fallback('寬\u{20BB7}\u{1F98A}')), ['寬', '\u{20BB7}', '\u{1F98A}']);

    // 空字串與不是字串的東西，和有 Intl.Segmenter 時一樣
    assert.deepEqual(plain(fallback('')), []);
    for (const bad of [null, undefined, 42, ['a']]) assert.deepEqual(plain(fallback(bad)), [], util.inspect(bad));

    // 折行也回到以前的切法：窄到放不下一顆國旗時，兩個區域指示符號各一行（有 Intl.Segmenter 時一顆國旗一行，見下面）
    assert.deepEqual(plain(old.CardLayout.wrapText(FLAG.repeat(3), SIZE, measure)), Array.from(FLAG.repeat(3)));
    assert.deepEqual(plain(wrapText(FLAG.repeat(3), SIZE, measure)), [FLAG, FLAG, FLAG]);
    // 一般的字照常折，不丟錯
    assert.deepEqual(plain(old.CardLayout.wrapText(CHINESE_60, 20 * SIZE, measure, 10)), [CHINESE_60.slice(0, 20), CHINESE_60.slice(20, 40), CHINESE_60.slice(40)]);
});

// ---------- wrapText ----------

test('wrapText：中文任兩個字之間都能斷：60 字在 20 字寬裡切成 3 行', () => {
    const lines = wrapText(CHINESE_60, 20 * SIZE, measure, 10);
    assert.deepEqual(plain(lines), [CHINESE_60.slice(0, 20), CHINESE_60.slice(20, 40), CHINESE_60.slice(40)]);
    for (const line of lines) assert.equal(measure(line), 200);

    // 最後一行放不滿也照切；多一個字就多一行
    assert.deepEqual(plain(wrapText(CHINESE_60.slice(0, 59), 200, measure, 10)).map((line) => line.length), [20, 20, 19]);
    assert.deepEqual(plain(wrapText(`${CHINESE_60}甲`, 200, measure, 10)).map((line) => line.length), [20, 20, 20, 1]);
    // 放得下就是一行
    assert.deepEqual(plain(wrapText('你好', 200, measure, 10)), ['你好']);
    // maxLines 不傳就不限行數
    assert.equal(wrapText(CHINESE_60, 200, measure).length, 3);
    // 前面有別的字時，第一行的空位也用上（「ab 」18 寬，後面放 18 個字）：這才分得出「任兩個字之間都能斷」和「太長的單字逐字斷」
    assert.deepEqual(plain(wrapText(`ab ${CHINESE_60}`, 200, measure, 10)), [
        `ab ${CHINESE_60.slice(0, 18)}`, CHINESE_60.slice(18, 38), CHINESE_60.slice(38, 58), CHINESE_60.slice(58)
    ]);
});

test('wrapText：超過 maxLines 時最後一行換成放得下的長度並接上 …', () => {
    const lines = wrapText(CHINESE_60, 200, measure, 2);
    // 第 2 行本來 20 字，接上 … 要少一個字才放得下
    assert.deepEqual(plain(lines), [CHINESE_60.slice(0, 20), `${CHINESE_60.slice(20, 39)}…`]);
    assert.ok(lines[1].endsWith('…'));
    assert.ok(measure(lines[1]) <= 200);
    assert.deepEqual(plain(wrapText(CHINESE_60, 200, measure, 1)), [`${CHINESE_60.slice(0, 19)}…`]);

    // 剛好排得完 maxLines 行就沒有 …（後面只剩空白也一樣）
    const exact = [CHINESE_60.slice(0, 20), CHINESE_60.slice(20, 40), CHINESE_60.slice(40)];
    assert.deepEqual(plain(wrapText(CHINESE_60, 200, measure, 3)), exact);
    assert.deepEqual(plain(wrapText(`${CHINESE_60}   `, 200, measure, 3)), exact);
    assert.deepEqual(plain(wrapText(CHINESE_60, 200, measure, 99)), exact);

    // 那一行本來就有空位（在空白斷開的）：接上 … 放得下就整行留著，不多切
    assert.deepEqual(plain(wrapText('aaaa bbbbbbbb', 60, measure, 1)), ['aaaa…']);
    // 要切才放得下 …：一個字一個字往前切
    assert.deepEqual(plain(wrapText('aaaa bbbb cccc', 54, measure, 1)), ['aaaa bb…']);
    // 切到停在空白後面時，空白拿掉再接 …，不會是「ab …」
    assert.deepEqual(plain(wrapText('ab cd efgh', 30, measure, 1)), ['ab…']);
    // 連 … 都放不下：最後一行只剩 …，不會是空的
    assert.deepEqual(plain(wrapText('你好世界', 5, measure, 1)), ['…']);
});

test('wrapText：英文只在空白斷，單一個字比寬度還寬時才逐字斷', () => {
    const lines = wrapText(SENTENCE, 96, measure, 10); // 16 個字母寬
    assert.deepEqual(plain(lines), ['the quick brown', 'fox jumps over', 'the lazy dog']);
    for (const line of lines) assert.ok(measure(line) <= 96);
    assert.equal(lines.join(' '), SENTENCE); // 每個字都是完整的
    assert.deepEqual(plain(wrapText(SENTENCE, 66, measure, 10)), ['the quick', 'brown fox', 'jumps over', 'the lazy', 'dog']);

    // 一個超長的字：34 個字母，一行放得下 16 個
    const long = 'Supercalifragilisticexpialidocious';
    assert.deepEqual(plain(wrapText(long, 100, measure, 10)), [long.slice(0, 16), long.slice(16, 32), long.slice(32)]);
    // 前面的字不受影響：「Hi」先留在自己那一行，長的字從下一行開頭逐字斷，斷完的尾巴跟後面的字接在同一行
    assert.deepEqual(plain(wrapText(`Hi ${long} yo`, 100, measure, 10)), ['Hi', long.slice(0, 16), long.slice(16, 32), `${long.slice(32)} yo`]);
    // 單字放得下一整行就整個放到下一行，不拆開
    assert.deepEqual(plain(wrapText('Hi abcdefghijklmnop', 100, measure, 10)), ['Hi', 'abcdefghijklmnop']);
});

test('wrapText：每行開頭的空白拿掉，換行與 tab 也當成空白', () => {
    assert.deepEqual(plain(wrapText('   hello   world   again', 70, measure, 10)), ['hello', 'world', 'again']);
    // 一行裡面的空白照原樣留著，只拿掉行首與行尾的
    assert.deepEqual(plain(wrapText('   hello   world   again', 80, measure, 10)), ['hello   world', 'again']);
    // 全形空白也是空白
    assert.deepEqual(plain(wrapText('　　你好　世界', 200, measure, 10)), ['你好　世界']);
    assert.deepEqual(plain(wrapText('你好　　世界', 20, measure, 10)), ['你好', '世界']);
    // 輸入框裡的換行與 tab：一行裡不留換行字元（canvas 畫字時本來就當成空白）
    assert.deepEqual(plain(wrapText('hello\nworld', 200, measure, 10)), ['hello world']);
    assert.deepEqual(plain(wrapText('a\tb\r\nc', 200, measure, 10)), ['a b  c']);
    // 每一行的開頭都不是空白，不管在哪裡斷
    for (const width of [30, 40, 50, 60, 70, 80, 90]) {
        for (const line of wrapText('  ab  cd  ef   gh  ij  kl  ', width, measure, 20)) {
            assert.doesNotMatch(line, /^\s|\s$/, `寬度 ${width}：「${line}」`);
        }
    }
});

test('wrapText：中日韓與全形的字任兩個字之間都能斷，其他文字只在空白斷', () => {
    // 光是把一長串字切成幾行，「能在任兩個字之間斷」和「單字太長只好逐字斷」是同一個結果，分不出來。
    // 所以前面放「ab 」（18 寬）：一行 40 寬，後面四個字（各 10 寬）只放得下前兩個。
    // 任兩個字之間都能斷的話，前兩個字留在第一行；只在空白斷的話，整個單字（自己放得下一行）到下一行
    const breakable = {
        'CJK 統一表意文字': '你好世界',
        平假名: 'ひらがな',
        片假名: 'カタカナ',
        韓文音節: '안녕하세',
        全形字: 'ＡＢＣＤ',
        'CJK 擴充 A': String.fromCodePoint(0x3400, 0x3401, 0x3402, 0x3403),
        'CJK 標點': '「「「「',
        // 韓文字母（U+1100 起的組合用字母）：連續的聲母（U+1100～U+1103）會合成一個字素（一個音節塊），所以這裡用收尾子音與聲母交錯的
        // 四個字母，每個字元自己是一個字素，才是「任兩個字之間都能斷」的樣子；真正的音節塊（聲母、母音、收尾子音）見下面
        韓文字母: String.fromCodePoint(0x11a8, 0x1100, 0x11ab, 0x1102),
        韓文相容字母: String.fromCodePoint(0x3131, 0x3132, 0x3133, 0x3134)
    };
    for (const [name, word] of Object.entries(breakable)) {
        const chars = Array.from(word);
        assert.equal(graphemes(word).length, 4, `${name}：四個字素，每個字元自己是一個`);
        assert.deepEqual(plain(wrapText(`ab ${word}`, 40, measure, 10)), [`ab ${chars.slice(0, 2).join('')}`, chars.slice(2).join('')], name);
    }
    // 不在清單裡的文字（拉丁字母、西里爾字母、希臘字母、emoji）只在空白斷：整個單字到下一行
    const spaceOnly = { 拉丁字母: 'abcd', 西里爾字母: 'Прив', 希臘字母: 'Αβγδ', emoji: '🦊🦊🦊🦊' };
    for (const [name, word] of Object.entries(spaceOnly)) {
        assert.deepEqual(plain(wrapText(`ab ${word}`, 40, measure, 10)), ['ab', word], name);
    }
    assert.deepEqual(plain(wrapText('Привет мир', 80, measure, 10)), ['Привет', 'мир']); // 不是「Привет м」「ир」

    // 空白與標點、全形字之間：英文緊貼著中文時，交界也能斷，英文單字自己還是整個
    assert.deepEqual(plain(wrapText('ab Hello世界', 55, measure, 10)), ['ab Hello', '世界']); // 斷在「o」與「世」之間
    assert.deepEqual(plain(wrapText('ab 世界Hello', 45, measure, 10)), ['ab 世界', 'Hello']); // 斷在「界」與「H」之間
    assert.deepEqual(plain(wrapText('Hello世界你好', 35, measure, 10)), ['Hello', '世界你', '好']);
    assert.deepEqual(plain(wrapText('Hello世界你好', 50, measure, 10)), ['Hello世界', '你好']);
});

test('wrapText：行首不放逗號、句號與右引號、右括號，前一個字一起帶到下一行', () => {
    // 照一般排會是 ['你好', '，世', '界']，「，」在第 2 行行首；所以「好」跟著下去
    assert.deepEqual(plain(wrapText('你好，世界', 20, measure, 10)), ['你', '好，', '世界']);
    assert.deepEqual(plain(wrapText('「你好」世界', 30, measure, 10)), ['「你', '好」世', '界']);
    // 連著兩個（。與 」）都不能在行首：兩個一起帶下去的話前面那個字也要跟著
    assert.deepEqual(plain(wrapText('你好。」世界', 30, measure, 10)), ['你', '好。」', '世界']);

    // 清單裡的每一個字（全形與半形）都擋得住，句子一樣接得回去
    for (const mark of Array.from('，。、！？；：」』）〉》,.!?;:)')) {
        const text = `你好${mark}世界`;
        const lines = plain(wrapText(text, 20, measure, 10));
        assert.equal(lines.join(''), text, mark);
        for (const line of lines) assert.notEqual(Array.from(line)[0], mark, `${mark}：${util.inspect(lines)}`);
    }

    // 半形的也一樣。英文單字太長、只能從單字裡斷時，標點前面的字母一起下去
    assert.deepEqual(plain(wrapText('abcdefg,hij', 42, measure, 10)), ['abcdef', 'g,hij']);

    // 第一行是文字本來的開頭，不動它
    assert.deepEqual(plain(wrapText('，你好', 200, measure, 10)), ['，你好']);

    // 怎麼排都擺不進去（一行只放得下一個字，而下一個又是「，」）：照一般排，不留空行、不卡住
    assert.deepEqual(plain(wrapText('你，', 10, measure, 10)), ['你', '，']);
    assert.deepEqual(plain(wrapText('，，，', 20, measure, 10)), ['，，', '，']);
    assert.deepEqual(plain(wrapText('你好。。。', 20, measure, 10)).filter((line) => line === ''), []);
});

test('wrapText：英文單字後面接著全形標點時，整個單字一起到下一行，不把單字拆開', () => {
    // 斷在「V」與「，」之間的話「，」會在行首：整個 FFXIV 一起下去，不是只帶「V」
    assert.deepEqual(plain(wrapText('我喜歡FFXIV，真的', 65, measure, 10)), ['我喜歡', 'FFXIV，真的']);
    // 空白前面的字也一樣
    assert.deepEqual(plain(wrapText('我喜歡 FFXIV，真的', 65, measure, 10)), ['我喜歡', 'FFXIV，真的']);
    // 單字從這一行的第一個字就放到最後、前面沒有別的字可以讓它整個下去：才一個字母一個字母地往前帶
    assert.deepEqual(plain(wrapText('abcdefghij，xyz', 65, measure, 10)), ['abcdefghi', 'j，xyz']);
});

test('wrapText：空字串、只有空白、maxLines 小於 1、不是字串都是 []', () => {
    assert.deepEqual(plain(wrapText('', 200, measure, 10)), []);
    assert.deepEqual(plain(wrapText('   ', 200, measure, 10)), []);
    assert.deepEqual(plain(wrapText(' \n\t　', 200, measure, 10)), []);
    for (const maxLines of [0, -3, NaN, 0.5, null]) {
        assert.deepEqual(plain(wrapText('你好', 200, measure, maxLines)), [], util.inspect(maxLines));
    }
    for (const bad of [null, undefined, 42, ['你好'], {}]) {
        assert.deepEqual(plain(wrapText(bad, 200, measure, 10)), [], util.inspect(bad));
    }
    // maxLines 是小數時無條件捨去，Infinity 是不限
    assert.equal(wrapText(CHINESE_60, 200, measure, 2.9).length, 2);
    assert.equal(wrapText(CHINESE_60, 200, measure, Infinity).length, 3);
});

test('wrapText：寬度放不下一個字時那個字自己一行，不卡住；代理對不會被拆成兩半', () => {
    assert.deepEqual(plain(wrapText('你好', 5, measure, 10)), ['你', '好']);
    assert.deepEqual(plain(wrapText('abc', 0, measure, 10)), ['a', 'b', 'c']);
    assert.deepEqual(plain(wrapText('abc', -1, measure, 10)), ['a', 'b', 'c']);
    // 寬度不是數字（量出來的寬度永遠比不過它）也是一個字一行
    assert.deepEqual(plain(wrapText('你好', NaN, measure, 10)), ['你', '好']);

    // 罕用字（擴充 B 區的「𠮷」）與 emoji 是兩個 UTF-16 單位的一個字：單字太長要從中間斷時不會拆成兩半
    assert.deepEqual(plain(wrapText('𠮷𠮷𠮷𠮷𠮷', 20, measure, 10)), ['𠮷𠮷', '𠮷𠮷', '𠮷']);
    for (const text of ['𠮷𠮷𠮷𠮷𠮷', '🦊🦊🦊🦊🦊', 'a𠮷b🦊c𠮷d🦊e', '你🦊好🦊，🦊世界🦊']) {
        for (const width of [3, 6, 10, 12, 20, 25, 30, 50]) {
            for (const maxLines of [undefined, 1, 2]) {
                for (const line of wrapText(text, width, measure, maxLines)) {
                    assert.ok(line.isWellFormed(), `${text}、寬度 ${width}：${util.inspect(line)}`);
                }
            }
        }
    }
});

// 下面兩個測試用的文字：有中文、英文、日文、韓文、標點、行首與行尾的空白、換行
const SWEEP_TEXTS = [
    CHINESE_60,
    '我喜歡打副本，也喜歡拍照。大家好！歡迎來找我玩（週末晚上最有空）。',
    SENTENCE,
    'Hello, world! How are you? Fine; thanks: (ok) bye.',
    '我喜歡FFXIV，也喜歡Final Fantasy XIV的音樂：特別是「Answers」。',
    'ひらがな、カタカナ、漢字。한국어도 됩니다！',
    '   leading   and   trailing   spaces   ',
    'Supercalifragilisticexpialidocious and Pneumonoultramicroscopicsilicovolcanoconiosis',
    'a\nb\tc　d　　e',
    '你好。」世界，。」』！？'
];
const WIDTHS = Array.from({ length: 80 }, (_, index) => 5 + index * 5); // 5、10、…、400

test('wrapText：怎麼量、怎麼排，每一行都不是空的、不超寬、接起來是原文', () => {
    const calls = [];
    const recording = (text) => {
        calls.push(text);
        return measure(text);
    };
    const stripped = (text) => text.replace(/\s/g, '');
    for (const text of SWEEP_TEXTS) {
        for (const width of WIDTHS) {
            const lines = Array.from(wrapText(text, width, recording));
            const where = `${util.inspect(text)}、寬度 ${width}`;
            assert.ok(lines.length >= 1, where);
            for (const line of lines) {
                assert.notEqual(line, '', `${where}：有空行`);
                assert.equal(line, line.trim(), `${where}：「${line}」前後有空白`);
                // 不超寬；放不下的只有一個字自己就比寬度寬的那種行
                assert.ok(measure(line) <= width || Array.from(line).length === 1, `${where}：「${line}」超寬`);
            }
            assert.equal(stripped(lines.join('')), stripped(text), `${where}：接起來不是原文`);
        }
    }
    // 只用字串呼叫量字函式
    assert.ok(calls.length > 1000);
    assert.ok(calls.every((text) => typeof text === 'string'));
});

test('wrapText：寬度至少兩個字、標點不連著時，第 2 行起沒有以行首禁用的字開頭的', () => {
    const forbidden = new Set(Array.from('，。、！？；：」』）〉》,.!?;:)'));
    const texts = [
        '我喜歡打副本，也喜歡拍照。大家好！歡迎來找我玩，週末晚上最有空。',
        'Hello, world! How are you? Fine; thanks: (ok) bye.',
        '我喜歡FFXIV，也喜歡Final Fantasy XIV的音樂：特別是Answers。',
        '你好「世界」嗎，我是Luna，來自Starlit Hall。很高興認識你！',
        'abcdefghij，klmnopqrstu。vwxyz!'
    ];
    // 前提：沒有兩個行首禁用的字連在一起（中間隔空白也算）。連著的話，寬度只有兩個字時怎麼排都有一個在行首（例如「界」」，」）
    const adjacent = /[，。、！？；：」』）〉》,.!?;:)]\s*[，。、！？；：」』）〉》,.!?;:)]/;
    for (const text of texts) {
        assert.doesNotMatch(text, adjacent, `測試的文字有連著的標點：${text}`);
        for (let width = 20; width <= 400; width += 5) {
            const lines = Array.from(wrapText(text, width, measure));
            lines.slice(1).forEach((line, index) => {
                assert.ok(!forbidden.has(Array.from(line)[0]), `${util.inspect(text)}、寬度 ${width}：第 ${index + 2} 行「${line}」`);
            });
        }
    }
});

test('wrapText：有 maxLines 時，前面的行和不限行數時一樣，最後一行是它的截斷', () => {
    for (const text of SWEEP_TEXTS) {
        for (const width of WIDTHS) {
            const full = Array.from(wrapText(text, width, measure));
            for (const maxLines of [1, 2, 3]) {
                const lines = Array.from(wrapText(text, width, measure, maxLines));
                const where = `${util.inspect(text)}、寬度 ${width}、maxLines ${maxLines}`;
                if (full.length <= maxLines) {
                    assert.deepEqual(lines, full, `${where}：排得完不該有 …`);
                    continue;
                }
                assert.equal(lines.length, maxLines, where);
                assert.deepEqual(lines.slice(0, -1), full.slice(0, maxLines - 1), where);
                const last = lines[maxLines - 1];
                assert.ok(last.endsWith('…'), `${where}：最後一行要以 … 結尾（${last}）`);
                assert.ok(measure(last) <= width || last === '…', `${where}：最後一行超寬（${last}）`);
                assert.ok(full[maxLines - 1].startsWith(last.slice(0, -1)), `${where}：最後一行要是原本那一行的開頭（${last}）`);
            }
        }
    }
});

// 一個字素不管幾個字元，都只能整個在這一行或整個在下一行：折行、接「…」都不會切在中間
test('wrapText 不切開字素：國旗、家庭 emoji、重音符號、空格加組合符號在任何寬度、任何 maxLines 下都是整個的', () => {
    const cases = [
        // 旅人、國旗、家庭 emoji、Caf 加上 é（單一字元）再加一個組合用的重音符號、空白、三面日本國旗
        { text: `旅人${FLAG}${FAMILY}Caf\u{E9}\u{301} ${FLAG_JP.repeat(3)}`, units: 2 + 1 + 1 + 3 + 1 + 1 + 3, note: '字素：旅、人、國旗、家庭、C、a、f、é、空白、三面國旗' },
        // 顏文字：括號、三個空格加組合符號、兩顆眼睛、括號共 8 個字素，前後各有一個單字和一個空白
        { text: `hello ${LENNY} world`, units: 5 + 1 + 8 + 1 + 5, note: '字素：hello、空白、顏文字的 8 個字素、空白、world' }
    ];
    for (const { text, units, note } of cases) {
        const original = plain(graphemes(text));
        assert.equal(original.length, units, note);
        const known = new Set(original);
        const isBlank = (unit) => unit.trim() === '';
        const solid = original.filter((unit) => !isBlank(unit));

        for (let width = 1; width <= 400; width++) {
            const where = `${util.inspect(text)}、寬度 ${width}`;
            // 每一行的每個字素都是原文的字素，或接在最後一行的 …；不會出現被切開的半個國旗、單獨的連接符號或重音符號
            for (const maxLines of [1, 2, 3]) {
                for (const line of wrapText(text, width, measure, maxLines)) {
                    for (const unit of plain(graphemes(line))) {
                        assert.ok(known.has(unit) || unit === '…', `${where}、maxLines ${maxLines}：「${line}」裡的 ${util.inspect(unit)} 不是原文的字素`);
                    }
                }
            }
            // 不限行數：每一行的字素接起來（去掉空白）剛好是原文的字素，一個不少、順序不變（「空格加組合符號」不是空白，一個都不能被拿掉）
            const joined = plain(wrapText(text, width, measure)).flatMap((line) => plain(graphemes(line))).filter((unit) => !isBlank(unit));
            assert.deepEqual(joined, solid, where);
        }
    }
});

// 空格後面接著組合符號是一個字素（顏文字常有），不是空白：不能在行首被當成空白跳過、行尾被拿掉，不然符號就不見了
test('wrapText：空格加組合符號是一個字，不是空白：任何寬度都不會被拿掉，行首與行尾也沒有只由空白組成的字素', () => {
    const text = `hello ${LENNY} world`;
    // 前提：空格加組合符號是一個字素，不是空白
    const units = plain(graphemes(text));
    assert.ok(units.includes(' \u{0361}') && units.includes(' \u{035C}'), '空格加組合符號各是一個字素');
    assert.equal(marksOf(text), 3);
    const isBlank = (unit) => !/\S/.test(unit);

    for (let width = 1; width <= 400; width++) {
        const lines = plain(wrapText(text, width, measure));
        // 每一行接起來（去掉空白）的組合符號，個數和原文一樣
        assert.equal(marksOf(lines.join('').replace(/\s/g, '')), 3, `寬度 ${width}：組合符號不見了`);
        for (const line of lines) {
            const lineUnits = plain(graphemes(line));
            assert.ok(lineUnits.length > 0, `寬度 ${width}：有空行`);
            assert.ok(!isBlank(lineUnits[0]), `寬度 ${width}：「${line}」以只由空白組成的字素開頭`);
            assert.ok(!isBlank(lineUnits[lineUnits.length - 1]), `寬度 ${width}：「${line}」以只由空白組成的字素結尾`);
        }
    }
});

test('wrapText：以「空格加組合符號」開頭的字串，任何寬度都留著那個符號（空格、不換行空白都一樣）', () => {
    for (const space of [' ', '\u{A0}']) {
        const lead = `${space}\u{0301}`;
        const text = `${lead}abc def`;
        assert.deepEqual(plain(graphemes(text)).slice(0, 2), [lead, 'a'], '開頭的空格加符號是一個字素');
        for (let width = 1; width <= 400; width++) {
            const lines = plain(wrapText(text, width, measure));
            assert.equal(marksOf(lines.join('')), 1, `${util.inspect(text)}、寬度 ${width}：符號不見了`);
            assert.ok(lines[0].startsWith(lead), `${util.inspect(text)}、寬度 ${width}：第一行要以「空格加符號」開頭（${util.inspect(lines[0])}）`);
        }
    }
});

test('wrapText：一個字素比整行還寬時它自己一行，不切開；窄到每個字素都放不下時，每一行剛好一個字素', () => {
    // 寬度 5 比任何一個字素都窄（最窄的拉丁字母 6）：每個字素各一行，空白略過
    const text = `旅${FLAG}${FAMILY}Caf\u{E9}\u{301} ${FLAG_JP}`;
    assert.deepEqual(plain(wrapText(text, 5, measure)), plain(graphemes(text)).filter((unit) => unit !== ' '));
    // 家庭 emoji 50 寬：前面的字加它放不下這一行（12 + 50 > 60），它整個到下一行，不是拆開接在 ab 後面
    assert.deepEqual(plain(wrapText(`ab${FAMILY}`, 60, measure)), ['ab', FAMILY]);
    assert.deepEqual(plain(wrapText(`ab ${FAMILY} cd`, 60, measure)), ['ab', FAMILY, 'cd']);
    // 放得下就留在同一行
    assert.deepEqual(plain(wrapText(`ab${FAMILY}`, 70, measure)), [`ab${FAMILY}`]);
});

test('wrapText：長單字只能從字與字之間斷的時候，組合字（e 加重音符號）不拆開，重音符號不會留在行首', () => {
    const word = 'cafe\u{301}'.repeat(4); // c、a、f、é（每個 é 是兩個字元，16 寬）重複四次
    const known = new Set(plain(graphemes(word)));
    assert.equal(known.size, 4);
    for (let width = 6; width <= 140; width++) {
        const lines = plain(wrapText(word, width, measure));
        assert.equal(lines.join(''), word, `寬度 ${width}`);
        for (const line of lines) {
            for (const unit of plain(graphemes(line))) assert.ok(known.has(unit), `寬度 ${width}：「${line}」裡的 ${util.inspect(unit)} 不是原文的字素`);
        }
    }
});

test('wrapText：拆開寫的韓文（聲母、母音、收尾子音）是一個音節塊一個字素，只在音節之間斷', () => {
    // 한：聲母 U+1112、母音 U+1161、收尾子音 U+11AB（3 個字元，量字是 30 寬）。macOS 的檔名之類的來源會用這種拆開的寫法
    const HAN = '\u{1112}\u{1161}\u{11AB}';
    const word = HAN.repeat(4);
    assert.deepEqual(plain(graphemes(word)), [HAN, HAN, HAN, HAN]);
    // 寬 70：ab 加一個音節 48，再一個 78 放不下；音節之間任何位置都能斷（和預先組好的韓文一樣），音節裡面不能
    assert.deepEqual(plain(wrapText(`ab ${word}`, 70, measure, 10)), [`ab ${HAN}`, HAN + HAN, HAN]);
    // 寬 25 比一個音節（30）還窄：每個音節自己一行，不會斷在聲母、母音、收尾子音之間
    assert.deepEqual(plain(wrapText(`ab ${word}`, 25, measure, 10)), ['ab', HAN, HAN, HAN, HAN]);
});

test('wrapText：接「…」時也不切開字素', () => {
    // 三面國旗各 20 寬。寬 45 放得下兩面，接上「…」（10 寬）要少一面：留一面國旗再接 …，不是留半面
    assert.deepEqual(plain(wrapText(FLAG.repeat(3), 45, measure, 1)), [`${FLAG}…`]);
    // 寬 50：兩面加 … 剛好放得下
    assert.deepEqual(plain(wrapText(FLAG.repeat(3), 50, measure, 1)), [`${FLAG}${FLAG}…`]);
    // 家庭 emoji（50 寬）放不下就整個拿掉，不留 👨‍👩‍ 這種斷在連接符號後面的東西
    assert.deepEqual(plain(wrapText(`ab${FAMILY}cd`, 60, measure, 1)), ['ab…']);
    // 組合字：é（e 加重音符號，兩個字元）也是整個留下或整個拿掉，不會變成沒有重音的 e。
    // 寬 40：abc 加一個 é 是 34，再接 … 是 44 放不下，所以 é 整個拿掉
    assert.deepEqual(plain(wrapText(`abc${E_ACUTE.repeat(3)}`, 40, measure, 1)), ['abc…']);
    // 寬 50：abc 加一個 é 再接 … 剛好 44，放得下，é 完整留下
    assert.deepEqual(plain(wrapText(`abc${E_ACUTE.repeat(3)}`, 50, measure, 1)), [`abc${E_ACUTE}…`]);
});

test('wrapText：か加分開寫的濁音符號（U+3099）是一個字素，任何寬度都不會被拆開', () => {
    const KA = 'か\u{3099}'; // か 後面接著獨立的濁音符號，看起來是「が」
    const text = `あ${KA}い${KA}う`;
    assert.deepEqual(plain(graphemes(text)), ['あ', KA, 'い', KA, 'う'], 'か加濁音符號是一個字素');
    const known = new Set(['あ', KA, 'い', 'う']);
    for (let width = 1; width <= 400; width++) {
        const lines = plain(wrapText(text, width, measure));
        assert.equal(lines.join(''), text, `寬度 ${width}：接起來是原文`);
        for (const line of lines) {
            for (const unit of plain(graphemes(line))) assert.ok(known.has(unit), `寬度 ${width}：「${line}」裡的 ${util.inspect(unit)} 不是原文的字素`);
        }
    }
});

test('wrapText：行首禁用的標點接在國旗（或家庭 emoji、組合字）後面時，整個字素跟著它一起到下一行，沒有一行以「，」開頭', () => {
    const comma = '，';
    for (const unit of [FLAG, FAMILY, E_ACUTE]) {
        const text = `ab${unit}${comma}cd`;
        // 字素加標點放得進一行（國旗 20 寬加「，」10 寬是 30）的寬度，才排得出沒有標點開頭的行；
        // 再窄，字素與標點不能在同一行，標點只好在行首（照一般的排法，不留空行）
        for (let width = measure(unit) + measure(comma); width <= 400; width++) {
            for (const line of wrapText(text, width, measure)) {
                assert.ok(!line.startsWith(comma), `${util.inspect(text)}、寬度 ${width}：「${line}」以「，」開頭`);
            }
        }
    }
    // 寬 35：ab 後面放不下國旗加標點（12 + 20 + 10 > 35），國旗帶著標點一起到下一行，不是留下半面國旗
    assert.deepEqual(plain(wrapText(`ab${FLAG}，cd`, 35, measure)), ['ab', `${FLAG}，`, 'cd']);
});

// ---------- layoutChips ----------

// 膠囊用的選項：中文一個字 10 寬、左右內距 5，所以兩個字的膠囊是 20 + 10 = 30 寬
const CHIP = Object.freeze({ maxWidth: 100, height: 20, padX: 5, gap: 4, rowGap: 6 });
const SIX = ['一二', '三四', '五六', '七八', '九十', '甲乙'];

test('layoutChips：一列放不下就換下一列，座標從 (0, 0) 起算', () => {
    const chips = layoutChips(SIX, measure, CHIP);
    // 每顆 30 寬，一列三顆：x 是 0、34、68，最右邊到 98，沒有超過 100；第二列 y = 20 + 6
    assert.deepEqual(plain(chips), [
        { label: '一二', x: 0, y: 0, w: 30, h: 20 },
        { label: '三四', x: 34, y: 0, w: 30, h: 20 },
        { label: '五六', x: 68, y: 0, w: 30, h: 20 },
        { label: '七八', x: 0, y: 26, w: 30, h: 20 },
        { label: '九十', x: 34, y: 26, w: 30, h: 20 },
        { label: '甲乙', x: 68, y: 26, w: 30, h: 20 }
    ]);
    assert.deepEqual([...new Set(chips.map((chip) => chip.y))], [0, 26]); // y 只有兩種值
    for (const chip of chips) assert.ok(chip.x + chip.w <= CHIP.maxWidth, chip.label);

    // 寬度不同的混著排：放不下的整顆換到下一列，不會被切開。A 30、B 50、C 30、D 80
    const mixed = layoutChips(['一二', '一二三四', '一二', '一二三四五六七'], measure, CHIP);
    assert.deepEqual(plain(mixed).map(({ x, y, w }) => [x, y, w]), [[0, 0, 30], [34, 0, 50], [0, 26, 30], [0, 52, 80]]);
});

test('layoutChips：超過 maxRows 的不回傳，後面的也不會補進前面的列', () => {
    // maxRows 1：第二列的不回傳
    assert.deepEqual(plain(layoutChips(SIX, measure, { ...CHIP, maxRows: 1 })).map((chip) => chip.label), ['一二', '三四', '五六']);
    assert.equal(layoutChips(SIX, measure, { ...CHIP, maxRows: 2 }).length, 6);
    assert.equal(layoutChips([...SIX, '丙丁'], measure, { ...CHIP, maxRows: 2 }).length, 6); // 第 7 顆要第 3 列
    assert.deepEqual(plain(layoutChips(SIX, measure, { ...CHIP, maxRows: 0 })), []);
    assert.deepEqual(plain(layoutChips(SIX, measure, { ...CHIP, maxRows: -1 })), []);
    assert.equal(layoutChips(SIX, measure, { ...CHIP, maxRows: 2.9 }).length, 6); // 小數無條件捨去：2 列

    // 一列一列照順序排：第一列剩下的空位，不會補給後面比較窄的膠囊。
    // 「一二」30 寬，「一二三四五六七」80 寬放不下（34 + 80 > 100），要換到第二列，超過 maxRows 1，後面的「三四」也不要
    assert.deepEqual(plain(layoutChips(['一二', '一二三四五六七', '三四'], measure, { ...CHIP, maxRows: 1 })).map((chip) => chip.label), ['一二']);
});

test('layoutChips：一顆就比一整列寬的不縮小、不回傳，別顆照排', () => {
    const wide = '一二三四五六七八九十'; // 100 + 兩邊內距 10 = 110 > 100
    const chips = layoutChips(['一二', wide, '三四'], measure, CHIP);
    assert.deepEqual(plain(chips).map(({ label, x, y }) => [label, x, y]), [['一二', 0, 0], ['三四', 34, 0]]);
    assert.deepEqual(plain(layoutChips([wide], measure, CHIP)), []);
    // 剛好一整列寬（九個字 90 + 10 = 100）放得下，自己一列，下一顆換列
    const exact = layoutChips(['一二三四五六七八九', '一二'], measure, CHIP);
    assert.deepEqual(plain(exact).map(({ w, x, y }) => [w, x, y]), [[100, 0, 0], [30, 0, 26]]);
});

test('layoutChips：沒寫的 padX、gap、rowGap 是 0；不是陣列、不是字串的項目略過；不改傳進來的東西', () => {
    assert.deepEqual(plain(layoutChips(['一二', '三四'], measure, { maxWidth: 100, height: 20 })), [
        { label: '一二', x: 0, y: 0, w: 20, h: 20 },
        { label: '三四', x: 20, y: 0, w: 20, h: 20 }
    ]);
    assert.deepEqual(plain(layoutChips([], measure, CHIP)), []);
    for (const bad of [null, undefined, 'abc', 42, {}]) {
        assert.deepEqual(plain(layoutChips(bad, measure, CHIP)), [], util.inspect(bad));
    }
    assert.deepEqual(plain(layoutChips(['一二', 7, null, undefined, '三四'], measure, CHIP)).map((chip) => chip.label), ['一二', '三四']);

    // 傳凍結的資料也行；重複的名稱照排；每次回傳新的物件
    const labels = deepFreeze(['一二', '一二']);
    const first = layoutChips(labels, measure, CHIP);
    assert.deepEqual(plain(first).map((chip) => chip.x), [0, 34]);
    assert.notEqual(first[0], layoutChips(labels, measure, CHIP)[0]);
    assert.deepEqual(plain(labels), ['一二', '一二']);
});

// ---------- coverRect ----------

// 寬圖放進直框：圖 400 × 200、框 100 × 150 → 縮放 0.75，高度剛好 150，寬度 300（多出 200）
const WIDE = Object.freeze({ imgW: 400, imgH: 200, boxW: 100, boxH: 150 });
const rect = (crop) => coverRect(WIDE.imgW, WIDE.imgH, WIDE.boxW, WIDE.boxH, crop);

test('coverRect：寬圖放進直框時高度剛好，x 決定露出左邊、中間還是右邊', () => {
    assert.deepEqual(plain(rect({ x: 0, y: 0, zoom: 1 })), { dx: -100, dy: 0, dw: 300, dh: 150 });
    const { dw, dh } = rect({ x: 0, y: 0, zoom: 1 });
    assert.equal(dh, WIDE.boxH);
    // x = -1：圖的左邊對齊框的左邊。dx 要是 0，不是 -0（assert.equal 用 Object.is 比，分得出來）
    assert.equal(rect({ x: -1, y: 0, zoom: 1 }).dx, 0);
    // x = 1：圖的右邊對齊框的右邊
    assert.equal(rect({ x: 1, y: 0, zoom: 1 }).dx, WIDE.boxW - dw);
    // 沒有多出來的高度，y 怎麼設 dy 都是 0（也不是 -0）
    for (const y of [-1, -0.5, 0, 0.5, 1]) assert.equal(rect({ x: 0, y, zoom: 1 }).dy, 0, `y ${y}`);
});

test('coverRect：zoom 放大後兩邊都超出框，x、y 各自決定露出哪一塊', () => {
    const zoomed = rect({ x: 0, y: 0, zoom: 2 });
    assert.deepEqual(plain(zoomed), { dx: -250, dy: -75, dw: 600, dh: 300 });
    assert.ok(zoomed.dw > WIDE.boxW && zoomed.dh > WIDE.boxH);

    const corner = rect({ x: 1, y: 1, zoom: 3 });
    assert.deepEqual(plain(corner), { dx: -800, dy: -300, dw: 900, dh: 450 });
    assert.equal(corner.dx, WIDE.boxW - corner.dw);
    assert.equal(corner.dy, WIDE.boxH - corner.dh);

    const origin = rect({ x: -1, y: -1, zoom: 3 });
    assert.equal(origin.dx, 0);
    assert.equal(origin.dy, 0);
});

test('coverRect：高圖放進橫框時寬度剛好；和框同比例的圖剛好填滿', () => {
    assert.deepEqual(plain(coverRect(200, 400, 150, 100, { x: 0, y: 0, zoom: 1 })), { dx: 0, dy: -100, dw: 150, dh: 300 });
    assert.deepEqual(plain(coverRect(1600, 900, 1200, 675, { x: 0.3, y: -0.7, zoom: 1 })), { dx: 0, dy: 0, dw: 1200, dh: 675 });
    // 同比例、不同大小也是填滿，沒有留白（x、y 在中間，圖多出來的一圈對稱）
    const same = coverRect(300, 200, 150, 100, { x: 0, y: 0, zoom: 2 });
    assert.deepEqual(plain(same), { dx: -75, dy: -50, dw: 300, dh: 200 });
});

test('coverRect：沒有位置或位置壞掉時照填滿置中，範圍外的夾進去，大小不對什麼都不畫', () => {
    const centered = plain(rect({ x: 0, y: 0, zoom: 1 }));
    // 少一個欄位、欄位不是有限的數字：整份當成沒設，不是只用好的那幾個
    for (const bad of [
        undefined, null, {}, 'x', 42, [], { x: 0.5, y: 0.5 }, { x: NaN, y: 0.5, zoom: 2 }, { x: 0, y: Infinity, zoom: 2 },
        { x: 0, y: 0, zoom: '2' }, { x: '0.5', y: 0, zoom: 2 }
    ]) {
        assert.deepEqual(plain(rect(bad)), centered, util.inspect(bad));
    }
    // 範圍外：x、y 夾在 -1～1，zoom 夾在 1～3（同 card-state.js）；zoom 不會小於 1，所以不會留白
    assert.deepEqual(plain(rect({ x: 5, y: -5, zoom: 10 })), plain(rect({ x: 1, y: -1, zoom: 3 })));
    assert.deepEqual(plain(rect({ x: 0, y: 0, zoom: 0.5 })), centered);
    assert.deepEqual(plain(rect({ x: 0, y: 0, zoom: -2 })), centered);

    // 圖或框的大小不是正的有限數字：什麼都不畫，不會有 NaN
    for (const sizes of [
        [0, 200, 100, 150], [400, 0, 100, 150], [400, 200, 0, 150], [400, 200, 100, -1],
        [NaN, 200, 100, 150], [400, 200, Infinity, 150], [undefined, 200, 100, 150], ['400', 200, 100, 150]
    ]) {
        assert.deepEqual(plain(coverRect(...sizes, { x: 0, y: 0, zoom: 1 })), { dx: 0, dy: 0, dw: 0, dh: 0 }, util.inspect(sizes));
    }

    // 傳凍結的位置也行，不改它；每次回傳新的物件
    const frozen = deepFreeze({ x: 0.5, y: -0.5, zoom: 2 });
    const first = rect(frozen);
    assert.notEqual(first, rect(frozen));
    assert.deepEqual(plain(frozen), { x: 0.5, y: -0.5, zoom: 2 });
});

// ---------- dragCrop ----------

const drag = (crop, dxPx, dyPx) => dragCrop(crop, dxPx, dyPx, WIDE.imgW, WIDE.imgH, WIDE.boxW, WIDE.boxH);

test('dragCrop：往右拖 crop.x 變小，夾在 -1～1', () => {
    const start = { x: 0, y: 0, zoom: 1 };
    // 圖在框裡往右移 50（dx 從 -100 變成 -50）→ x = -0.5
    assert.equal(drag(start, 50, 0).x, -0.5);
    assert.equal(drag(start, 100, 0).x, -1); // 左邊剛好對齊
    assert.equal(drag(start, 500, 0).x, -1); // 拖過頭：夾在 -1
    assert.equal(drag(start, -100, 0).x, 1); // 往左拖 100：右邊對齊
    assert.equal(drag(start, -500, 0).x, 1);
    assert.equal(drag(start, 0, 0).x, 0); // 沒動
    // 不是從置中開始：x 0.5 的圖（dx = -150），往右拖 50 → dx = -100 → x = 0
    assert.equal(drag({ x: 0.5, y: 0, zoom: 1 }, 50, 0).x, 0);
    // 拖兩次等於拖一次加起來的距離
    assert.equal(drag(drag(start, 30, 0), 20, 0).x, drag(start, 50, 0).x);
});

test('dragCrop：放大後兩個方向都能拖，zoom 照舊', () => {
    // zoom 2：圖 600 × 300，多出 500 × 150；dx 從 -250 變成 -200 → x = -0.2；dy 從 -75 變成 -45 → y = -0.4
    const dragged = drag({ x: 0, y: 0, zoom: 2 }, 50, 30);
    assertNear(dragged.x, -0.2);
    assertNear(dragged.y, -0.4);
    assert.equal(dragged.zoom, 2);
    // 往上、往左拖：x、y 變大，到邊就夾住
    const other = drag({ x: 0, y: 0, zoom: 2 }, -100, -1000);
    assertNear(other.x, 0.4);
    assert.equal(other.y, 1);

    // 拖完之後 coverRect 畫出來的位置剛好移動了 dxPx、dyPx（沒碰到邊的話）：圖跟著手指走
    for (const zoom of [1.5, 2, 3]) {
        const crop = { x: 0.2, y: -0.3, zoom };
        const before = rect(crop);
        const after = rect(drag(crop, 12, -7));
        assertNear(after.dx, before.dx + 12, `zoom ${zoom} dx`);
        assertNear(after.dy, before.dy - 7, `zoom ${zoom} dy`);
        assert.equal(after.dw, before.dw);
        assert.equal(after.dh, before.dh);
    }
});

test('dragCrop：沒有多出來的寬度（或高度）時，那個方向是 0，浮點的誤差不算多出來', () => {
    // 寬圖放進直框：高度剛好。y 怎麼拖都是 0（本來不是 0 也回到 0），x 照拖
    assert.deepEqual(plain(drag({ x: 0, y: 0, zoom: 1 }, 50, 40)), { x: -0.5, y: 0, zoom: 1 });
    assert.equal(drag({ x: 0, y: 0.7, zoom: 1 }, 0, 40).y, 0);
    // 圖和框一樣大：兩個方向都沒有多出來
    assert.deepEqual(plain(dragCrop({ x: 0, y: 0, zoom: 1 }, 30, 30, 100, 100, 100, 100)), { x: 0, y: 0, zoom: 1 });
    assert.deepEqual(plain(dragCrop({ x: 0.5, y: -0.5, zoom: 1 }, 30, 30, 100, 100, 100, 100)), { x: 0, y: 0, zoom: 1 });

    // 7 × 28 的圖放進 29 × 50 的框：寬度縮放 29 / 7，乘回來是 29.000000000000004（誤差，不是真的多出來）；
    // 放進 61 × 50 的框乘回來是 60.99999999999999（少一點點）。這個方向照樣是 0，不會被拖到 -1 或 1
    for (const boxW of [29, 61]) {
        const result = dragCrop({ x: 0, y: 0, zoom: 1 }, 15, 0, 7, 28, boxW, 50);
        assert.equal(result.x, 0, `框寬 ${boxW}`);
        assert.equal(result.y, 0, `框寬 ${boxW}`);
    }
    // 另一個方向（高度真的多出來）照拖：dh 116、多出 66，dy 從 -33 變成 -23
    assertNear(dragCrop({ x: 0, y: 0, zoom: 1 }, 15, 10, 7, 28, 29, 50).y, (2 * 23) / 66 - 1);
});

test('dragCrop：位置壞掉當成置中；距離不是數字當成沒動；大小不對時位置照舊；不改傳進來的東西', () => {
    const centered = plain(drag({ x: 0, y: 0, zoom: 1 }, 50, 0));
    for (const bad of [undefined, null, {}, 'x', { x: NaN, y: 0, zoom: 2 }, { x: 0.5, y: 0.5 }]) {
        assert.deepEqual(plain(drag(bad, 50, 0)), centered, util.inspect(bad));
    }
    // 範圍外的夾進去再算
    assert.deepEqual(plain(drag({ x: 9, y: 0, zoom: 9 }, 0, 0)), plain(drag({ x: 1, y: 0, zoom: 3 }, 0, 0)));
    // 拖的距離不是有限的數字：當成沒拖
    for (const move of [NaN, undefined, null, Infinity, '5']) {
        assert.deepEqual(plain(drag({ x: 0.25, y: 0, zoom: 1 }, move, move)), plain(drag({ x: 0.25, y: 0, zoom: 1 }, 0, 0)), util.inspect(move));
    }

    // 圖或框的大小不是正的有限數字：算不出來，位置原樣還給（夾過、整理過的）
    assert.deepEqual(plain(dragCrop({ x: 0.3, y: -0.2, zoom: 2 }, 10, 10, 0, 0, 100, 100)), { x: 0.3, y: -0.2, zoom: 2 });
    assert.deepEqual(plain(dragCrop({ x: 5, y: -0.2, zoom: 2 }, 10, 10, 400, 200, 0, 100)), { x: 1, y: -0.2, zoom: 2 });
    assert.deepEqual(plain(dragCrop(null, 10, 10, NaN, 200, 100, 100)), { x: 0, y: 0, zoom: 1 });

    // 傳凍結的位置也行，不改它；回傳新的物件，只有 x、y、zoom
    const frozen = deepFreeze({ x: 0, y: 0, zoom: 2 });
    const moved = drag(frozen, 10, 10);
    assert.notEqual(moved, frozen);
    assert.deepEqual(Object.keys(moved).sort(), ['x', 'y', 'zoom']);
    assert.deepEqual(plain(frozen), { x: 0, y: 0, zoom: 2 });
});

// ---------- canPan ----------

test('canPan：照 coverRect 看那個方向有沒有多出來的長度，有才是 true（沒有多出來的方向，位置滑桿也移不動圖）', () => {
    // 4000×1500 放進 1200×675：縮放 0.45，寬 1800（多出 600）、高剛好 675
    assert.deepEqual(plain(canPan(4000, 1500, 1200, 675, 1)), { x: true, y: false });
    // 和框一樣比例的圖：剛好填滿，兩個方向都沒有；放大一點（105%）兩個方向都有
    assert.deepEqual(plain(canPan(1600, 900, 1200, 675, 1)), { x: false, y: false });
    assert.deepEqual(plain(canPan(1600, 900, 1200, 675, 1.05)), { x: true, y: true });
    // 1000×3000 放進 1200×675：縮放 1.2，寬剛好 1200、高 3600（多出 2925）
    assert.deepEqual(plain(canPan(1000, 3000, 1200, 675, 1)), { x: false, y: true });
    // 放大到 150%、300%：兩個方向都有
    assert.deepEqual(plain(canPan(4000, 1500, 1200, 675, 1.5)), { x: true, y: true });
    assert.deepEqual(plain(canPan(1000, 3000, 1200, 675, 3)), { x: true, y: true });
    // 每次回傳新的物件，只有 x、y 兩個 boolean
    const first = canPan(4000, 1500, 1200, 675, 1);
    assert.notEqual(first, canPan(4000, 1500, 1200, 675, 1));
    assert.deepEqual(Object.keys(first).sort(), ['x', 'y']);
    assert.deepEqual(Object.values(first).map((value) => typeof value), ['boolean', 'boolean']);
});

test('canPan：浮點的誤差不算多出來的長度（和 dragCrop 用同一個 EDGE_EPSILON，1e-6 像素）', () => {
    // 7×28 放進 29×50：寬度縮放 29 / 7，乘回來是 29.000000000000004（誤差，不是真的多出來）；放進 61×50 乘回來是 60.99999999999999（少一點點）。
    // 高度真的多出來（116、244），所以上下照樣是 true
    for (const boxW of [29, 61]) assert.deepEqual(plain(canPan(7, 28, boxW, 50, 1)), { x: false, y: true }, `框寬 ${boxW}`);
    // 門檻：多出 0.00001 像素是真的有，多出 0.0000001 像素是誤差
    assert.deepEqual(plain(canPan(100.00001, 100, 100, 100, 1)), { x: true, y: false });
    assert.deepEqual(plain(canPan(100.0000001, 100, 100, 100, 1)), { x: false, y: false });
    // 上下一樣（直的圖放進橫框的寬度剛好）
    assert.deepEqual(plain(canPan(100, 100.00001, 100, 100, 1)), { x: false, y: true });
    assert.deepEqual(plain(canPan(100, 100.0000001, 100, 100, 1)), { x: false, y: false });
});

test('canPan：zoom 不是有限的數字當成 100%、範圍外的夾進去（同 coverRect）；圖或框的大小不對是兩個 false', () => {
    for (const bad of [undefined, null, NaN, Infinity, '1.5', {}]) {
        assert.deepEqual(plain(canPan(4000, 1500, 1200, 675, bad)), { x: true, y: false }, util.inspect(bad));
    }
    // 小於 100% 當成 100%（不會留白），大於 300% 當成 300%
    assert.deepEqual(plain(canPan(1600, 900, 1200, 675, 0.5)), { x: false, y: false });
    assert.deepEqual(plain(canPan(1600, 900, 1200, 675, -2)), { x: false, y: false });
    assert.deepEqual(plain(canPan(1600, 900, 1200, 675, 10)), { x: true, y: true });
    // 大小不是正的有限數字：算不出來，就沒有可以移的
    for (const sizes of [
        [0, 200, 100, 150], [400, 0, 100, 150], [400, 200, 0, 150], [400, 200, 100, -1],
        [NaN, 200, 100, 150], [400, 200, Infinity, 150], [undefined, 200, 100, 150], ['400', 200, 100, 150]
    ]) {
        assert.deepEqual(plain(canPan(...sizes, 2)), { x: false, y: false }, util.inspect(sizes));
    }
});

test('canPan：和 dragCrop 一致：true 的方向拖得動，false 的方向怎麼拖都是 0', () => {
    // 圖：寬的、同比例的、直的、方的、很小的、縮過的（2048 是上傳時的長邊上限）；框：海報橫版與直版、名片與資訊卡橫版與直版的照片框（card-style-a、card-style-c 的 photoBox），
    // 以及上面浮點誤差的兩個框
    const images = [[4000, 1500], [1600, 900], [1000, 3000], [1000, 1000], [7, 28], [768, 2048], [2048, 768]];
    const boxes = [[1200, 675], [1080, 1350], [417.36, 603], [993.6, 543.348], [404.352, 598.2], [29, 50], [61, 50]];
    let can = 0;
    let cannot = 0;
    for (const [imgW, imgH] of images) {
        for (const [boxW, boxH] of boxes) {
            for (const zoom of [1, 1.05, 1.5, 3]) {
                const label = `圖 ${imgW}×${imgH}、框 ${boxW}×${boxH}、zoom ${zoom}`;
                const pan = canPan(imgW, imgH, boxW, boxH, zoom);
                // 從置中拖 7 個像素：拖得動的方向位置會變（不是 0），拖不動的方向是 0
                const moved = dragCrop({ x: 0, y: 0, zoom }, 7, 7, imgW, imgH, boxW, boxH);
                assert.equal(moved.x !== 0, pan.x, `${label}：左右`);
                assert.equal(moved.y !== 0, pan.y, `${label}：上下`);
                for (const direction of [pan.x, pan.y]) {
                    if (direction) can += 1;
                    else cannot += 1;
                }
            }
        }
    }
    assert.ok(can > 20 && cannot > 20, `兩種結果都要掃到（${can} 個能拖、${cannot} 個不能）`);
});

// ---------- textColorOn ----------

test('textColorOn：照 WCAG 對比度，白字或 #141826 挑對比高的那一個', () => {
    // 預期值照 WCAG 的公式另外算過（對白色與 #141826 的對比度，哪個高就是哪個）
    assert.equal(textColorOn('#c99a2e'), '#141826'); // 採集的金色：白字 2.58、深色字 6.85
    assert.equal(textColorOn('#4f74d6'), '#ffffff'); // 坦克的藍：白字 4.37、深色字 4.04
    assert.equal(textColorOn('#3f9e5c'), '#141826'); // 補師的綠：3.36 對 5.27
    assert.equal(textColorOn('#d4574e'), '#141826'); // 近戰、遠程、法系的紅：3.98 對 4.44
    assert.equal(textColorOn('#8a63d2'), '#ffffff'); // 生產的紫：4.38 對 4.04
    assert.equal(textColorOn('#ffffff'), '#141826');
    assert.equal(textColorOn('#ffff00'), '#141826');
    assert.equal(textColorOn('#000000'), '#ffffff');
    assert.equal(textColorOn('#0000ff'), '#ffffff');
    assert.equal(textColorOn('#141826'), '#ffffff'); // 深色字本身的底
    // 灰階的交界在 #7b7b7b（白字 4.23、深色字 4.18）與 #7c7c7c（4.17 對 4.23）之間
    assert.equal(textColorOn('#7b7b7b'), '#ffffff');
    assert.equal(textColorOn('#7c7c7c'), '#141826');
    // 大小寫都行
    assert.equal(textColorOn('#C99A2E'), '#141826');
    assert.equal(textColorOn('#4F74D6'), '#ffffff');
});

test('textColorOn：和照公式另外算的對照組逐色一致（紅綠藍各 6 階，共 216 色）', () => {
    // 對照組直接用公式比對比度，不用 textColorOn 的任何東西
    const linear = (value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const dark = luminance(0x14, 0x18, 0x26);
    const hex = (value) => value.toString(16).padStart(2, '0');
    let darkCount = 0;
    for (const r of [0, 51, 102, 153, 204, 255]) {
        for (const g of [0, 51, 102, 153, 204, 255]) {
            for (const b of [0, 51, 102, 153, 204, 255]) {
                const l = luminance(r, g, b);
                const expected = ratio(l, 1) >= ratio(l, dark) ? '#ffffff' : '#141826';
                if (expected === '#141826') darkCount++;
                assert.equal(textColorOn(`#${hex(r)}${hex(g)}${hex(b)}`), expected, `#${hex(r)}${hex(g)}${hex(b)}`);
            }
        }
    }
    // 兩種結果都有出現，不是整組都同一個答案
    assert.ok(darkCount > 30 && darkCount < 186, `深色字 ${darkCount} 色`);
});

// ---------- contrastRatio ----------

test('contrastRatio：兩個 #rrggbb 的 WCAG 對比度（1～21），和先後無關、大小寫都行，同色是 1，有一個不是 #rrggbb 是 1', () => {
    assert.equal(contrastRatio('#ffffff', '#000000'), 21);
    assert.equal(contrastRatio('#000000', '#ffffff'), 21, '先後不影響');
    assert.equal(contrastRatio('#4f74d6', '#4f74d6'), 1);
    assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
    // 預期值照 WCAG 的公式另外算過（草稿的灰字在 #f4f5fa 上：#7a8195 是 3.57、#8a90a2 是 2.93，換掉之後的 #697084 是 4.54）
    assertNear2(contrastRatio('#7a8195', '#f4f5fa'), 3.5708, 0.0001);
    assertNear2(contrastRatio('#8a90a2', '#f4f5fa'), 2.9261, 0.0001);
    assertNear2(contrastRatio('#697084', '#f4f5fa'), 4.5367, 0.0001);
    assertNear2(contrastRatio('#697084', '#ffffff'), 4.9394, 0.0001);
    assertNear2(contrastRatio('#5b6275', '#f4f5fa'), 5.5927, 0.0001);
    // 大小寫都行
    assert.equal(contrastRatio('#F4F5FA', '#697084'), contrastRatio('#f4f5fa', '#697084'));
    // 不是 #rrggbb（缺 #、長度不對、不是十六進位、rgb()、空白、不是字串）是 1，兩邊哪一個壞都一樣
    for (const bad of ['', 'ffffff', '#fff', '#fffffff', '#gggggg', ' #ffffff', '#ffffff ', 'white', 'rgb(0, 0, 0)', null, undefined, 42, {}, ['#ffffff']]) {
        assert.equal(contrastRatio(bad, '#000000'), 1, util.inspect(bad));
        assert.equal(contrastRatio('#000000', bad), 1, util.inspect(bad));
    }
    assert.equal(contrastRatio('#zzzzzz', '#nnnnnn'), 1, '兩個都壞');
    // 對比度在 1～21 之間，把白字與 #141826 比的結果和 textColorOn 一致（挑對比高的那個）
    for (const hex of ['#c99a2e', '#4f74d6', '#3f9e5c', '#d4574e', '#8a63d2', '#7b7b7b', '#7c7c7c']) {
        const white = contrastRatio(hex, '#ffffff');
        const dark = contrastRatio(hex, '#141826');
        assert.ok(white >= 1 && white <= 21 && dark >= 1 && dark <= 21, hex);
        assert.equal(textColorOn(hex), dark > white ? '#141826' : '#ffffff', hex);
    }
});

test('textColorOn：不是 #rrggbb 的東西一律是白字', () => {
    for (const bad of ['', 'c99a2e', '#c99a2', '#c99a2e0', '#gggggg', ' #c99a2e', '#c99a2e ', 'auto', 'rgb(0, 0, 0)', null, undefined, 42, {}, ['#c99a2e']]) {
        assert.equal(textColorOn(bad), '#ffffff', util.inspect(bad));
    }
});
