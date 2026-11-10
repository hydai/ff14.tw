const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const LAYOUT_FILE = 'tools/character-card/card-layout.js';

// 這支腳本把東西掛在 window 上，所以讓 window 指向 context 本身（同 character-card-state.test.js）。
// 每個 context 各載一份，改了其中一個不會影響另一個
function loadContext(files) {
    const context = vm.createContext({});
    context.window = context;
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    }
    return context;
}

const context = loadContext([LAYOUT_FILE]);
const { CardLayout } = context;
// 故意用解構取出：頁面不一定用 CardLayout.xxx() 的寫法呼叫，這些函式不能靠 this
const { fitScale, wrapText, layoutChips, coverRect, dragCrop, textColorOn } = CardLayout;

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

// 假的量字（字型已經套好的替身）：英數與拉丁字母一個字 0.6 × SIZE 寬，其他（中日韓、全形字、標點、…）一個字 1 × SIZE 寬。
// SIZE 取 10：拉丁字母 6、其他 10，所以「20 字寬」就是 200
const SIZE = 10;
const isLatin = (char) => char.codePointAt(0) < 0x250;
const measure = (text) => Array.from(text).reduce((sum, char) => sum + (isLatin(char) ? 0.6 * SIZE : SIZE), 0);

const CHINESE_60 = '甲乙丙丁戊己庚辛壬癸'.repeat(6); // 60 個字，每個字寬 10
const SENTENCE = 'the quick brown fox jumps over the lazy dog';

// ---------- 模組 ----------

test('CardLayout：只掛一個全域、模組凍結、只有規定的六個函式', () => {
    assert.equal(Object.isFrozen(CardLayout), true);
    assert.deepEqual(Object.keys(CardLayout).sort(), ['coverRect', 'dragCrop', 'fitScale', 'layoutChips', 'textColorOn', 'wrapText']);
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
        韓文字母: String.fromCodePoint(0x1100, 0x1101, 0x1102, 0x1103),
        韓文相容字母: String.fromCodePoint(0x3131, 0x3132, 0x3133, 0x3134)
    };
    for (const [name, word] of Object.entries(breakable)) {
        const chars = Array.from(word);
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

test('textColorOn：不是 #rrggbb 的東西一律是白字', () => {
    for (const bad of ['', 'c99a2e', '#c99a2', '#c99a2e0', '#gggggg', ' #c99a2e', '#c99a2e ', 'auto', 'rgb(0, 0, 0)', null, undefined, 42, {}, ['#c99a2e']]) {
        assert.equal(textColorOn(bad), '#ffffff', util.inspect(bad));
    }
});
