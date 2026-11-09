const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createMacroPage } = require('./helpers/macro-page.js');
const { tagAttrs } = require('./helpers/html-fragment.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const LANGS = ['zh', 'en', 'ja'];
const TRANSLATIONS = 'assets/js/i18n/translations/tools/macro-converter.js';
const KEY = 'ff14tw_macro_target_lang';
const HTML = read('tools/macro-converter/index.html');
const SCRIPT = read('tools/macro-converter/script.js');
const CSS = read('tools/macro-converter/style.css').replace(/\/\*[\s\S]*?\*\//g, '');

const MUSCLE_MEMORY = '/ac "Muscle Memory" <wait.3>';
// 一行有技能沒收錄（第 2 行）、一行指令不認得（第 3 行）的巨集
const WITH_PROBLEMS = '/ac "Muscle Memory"\n/ac Final Appraisal <wait.2>\n/foo bar';

// 在 #targetLang 選一個語言並派送 change（同使用者操作下拉選單）
function chooseTarget(page, lang) {
    const select = page.$('targetLang');
    select.value = lang;
    select.dispatchEvent(new page.window.Event('change', { bubbles: true }));
}
// count 行一樣的巨集（/mlock 是認得的指令，不會有問題）
const macroLines = (count, line = '/mlock') => Array.from({ length: count }, () => line).join('\n');
// source（預設是整份 style.css）裡選擇器清單含 selector 的每一條規則的宣告區，接在一起（找不到是空字串）
const declarations = (selector, source = CSS) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => rule[1].split(',').map((s) => s.trim()).includes(selector))
    .map((rule) => rule[2])
    .join('\n');
// style.css 裡每一個 @media：{ condition: '(min-width: 769px)', body: 大括號裡面的規則, start, end: 在整份樣式裡的位置 }（裡面的規則沒有巢狀）
function mediaBlocks(css) {
    const blocks = [];
    for (let start = css.indexOf('@media'); start !== -1; start = css.indexOf('@media', start + 1)) {
        const open = css.indexOf('{', start);
        let depth = 0;
        let close = open;
        for (; close < css.length; close += 1) {
            if (css[close] === '{') depth += 1;
            else if (css[close] === '}' && (depth -= 1) === 0) break;
        }
        blocks.push({ condition: css.slice(start + '@media'.length, open).trim(), body: css.slice(open + 1, close), start, end: close + 1 });
    }
    return blocks;
}
const MEDIA = mediaBlocks(CSS);
// 拿掉所有 @media 之後剩下的基本規則（從後面往前拿，前面的位置才不會跑掉）
const BASE_CSS = [...MEDIA].reverse().reduce((css, block) => css.slice(0, block.start) + css.slice(block.end), CSS);
// index.html 裡含 id="…" 的開始標籤（含沒有值的布林屬性，tagAttrs 看不到它們）
const openTag = (id) => HTML.match(new RegExp(`<[a-zA-Z][\\w-]*\\b[^>]*\\sid="${id}"[^>]*>`))[0];

test('一打開：輸入框是空的，目標語言是繁體中文，輸出是空的，標題列只有語言名稱', async () => {
    const page = await createMacroPage();
    assert.equal(page.$('inputMacro').value, '');
    assert.equal(page.$('targetLang').value, 'zh');
    assert.equal(page.output(), '');
    assert.equal(page.outputTitle(), '繁體中文');
    assert.deepEqual(page.warnings(), []);
    assert.equal(page.$('macroWarnings').hidden, true, '沒有問題時整塊隱藏');
    assert.equal(page.$('outputMacro').placeholder, '轉換結果會出現在這裡', '輸出框空著時的提示字');
    assert.equal(page.storage.has(KEY), false, '沒改過目標語言就不存');
    assert.deepEqual(page.toasts, []);
    assert.deepEqual(page.consoleErrors, []);
});

test('打字或貼上就立刻轉換，不用按任何按鈕', async () => {
    const page = await createMacroPage();
    page.type(MUSCLE_MEMORY);
    assert.equal(page.output(), '/ac "堅信" <wait.3>');
    // 比較元素與物件一律用 ===：assert.equal 失敗時會展開整份 fake-dom（或整份資料）而卡住不報錯
    assert.ok(page.$('convertBtn') === null, '沒有「轉換」鈕');

    // 每一次輸入都立刻重轉（同一個同步呼叫裡就有結果，沒有計時器）；改掉、刪光都一樣
    page.type('/ac Innovation <wait.2>');
    assert.equal(page.output(), '/ac "改革" <wait.2>');
    page.type('');
    assert.equal(page.output(), '');

    // 沒有 Ctrl／⌘＋Enter 的快速鍵：值是程式放進去的、沒有 input 事件，按了也不會轉
    const input = page.$('inputMacro');
    input.value = MUSCLE_MEMORY;
    for (const modifier of ['ctrlKey', 'metaKey']) {
        input.dispatchEvent(new page.window.Event('keydown', { bubbles: true, cancelable: true, key: 'Enter', [modifier]: true }));
    }
    assert.equal(page.output(), '');
    assert.deepEqual(page.consoleErrors, []);
});

test('輸出標題列寫目標語言與行數；行數只算到最後一個非空行', async () => {
    const page = await createMacroPage();
    page.type('/ac Innovation <wait.2>\n/ac Manipulation <wait.2>\n/mlock\n\n');
    assert.equal(page.outputTitle(), '繁體中文・3 行', '3 行加結尾兩個空行');
    assert.equal(page.output(), '/ac "改革" <wait.2>\n/ac "掌握" <wait.2>\n/mlock\n\n', '輸出的空行照原樣，一行不少');

    // 空行在中間、在最前面都算；結尾只有空白的行（半形、全形、tab、\r）不算
    page.type('/mlock\n\n/merror off');
    assert.equal(page.outputTitle(), '繁體中文・3 行');
    page.type('\n\n/mlock');
    assert.equal(page.outputTitle(), '繁體中文・3 行');
    page.type('/mlock\n   \n\t\n　\n\r');
    assert.equal(page.outputTitle(), '繁體中文・1 行');
    page.type('/mlock\r\n/merror off\r\n\r\n');
    assert.equal(page.outputTitle(), '繁體中文・2 行', 'Windows 的 \\r\\n 換行一樣照算');
    assert.equal(page.output().includes('\r'), false, '輸出不帶 \\r');

    // 整份都是空白：只寫語言名稱，輸出是空的（提示字才看得到）
    page.type('\n  \n\t\n');
    assert.equal(page.outputTitle(), '繁體中文');
    assert.equal(page.output(), '');
    page.type('');
    assert.equal(page.outputTitle(), '繁體中文');
});

test('輸出標題列的語言名稱跟著網站介面語言，行數照單複數；目標語言與介面語言各自獨立', async () => {
    const NAMES = {
        zh: { zh: '繁體中文', en: '英文', ja: '日文' },
        en: { zh: 'Traditional Chinese', en: 'English', ja: 'Japanese' },
        ja: { zh: '繁体字中国語', en: '英語', ja: '日本語' }
    };
    const COUNTS = {
        zh: (count) => `${count} 行`,
        en: (count) => `${count} ${count === 1 ? 'line' : 'lines'}`,
        ja: (count) => `${count} 行`
    };
    // 語言名稱與行數中間的符號是每種語言自己的翻譯：中文、日文是「・」（U+30FB），英文是前後各一個空格的「 · 」（U+00B7）
    const SEPARATORS = { zh: '・', en: ' · ', ja: '・' };
    for (const ui of LANGS) {
        const page = await createMacroPage({ lang: ui });
        assert.equal(page.outputTitle(), NAMES[ui].zh, `${ui} 介面：一打開只有語言名稱`);
        for (const target of LANGS) {
            chooseTarget(page, target);
            page.type('/mlock');
            assert.equal(page.outputTitle(), `${NAMES[ui][target]}${SEPARATORS[ui]}${COUNTS[ui](1)}`, `${ui} 介面、目標 ${target}：1 行`);
            page.type('/mlock\n/merror off');
            assert.equal(page.outputTitle(), `${NAMES[ui][target]}${SEPARATORS[ui]}${COUNTS[ui](2)}`, `${ui} 介面、目標 ${target}：2 行`);
            page.type('');
            assert.equal(page.outputTitle(), NAMES[ui][target], `${ui} 介面、目標 ${target}：清空後只有語言名稱`);
        }
    }
});

test('要注意的行：依行號列出沒有收錄的技能與不認得的指令，沒有問題時整塊隱藏', async () => {
    const page = await createMacroPage();
    page.type(WITH_PROBLEMS);
    assert.deepEqual(page.warnings(), [
        '第 2 行：「Final Appraisal」沒有收錄，照原文保留',
        '第 3 行：「/foo」不是認得的指令，照原文保留'
    ]);
    assert.equal(page.$('macroWarnings').hidden, false);
    assert.equal(page.output(), '/ac "堅信"\n/ac Final Appraisal <wait.2>\n/foo bar', '有問題的行照原文保留，其他行照常轉');

    // 行號從 1 起算，空行、\r\n 換行都占一個行號
    page.type('\n/ac Foo\r\n\r\n/bar');
    assert.deepEqual(page.warnings(), [
        '第 2 行：「Foo」沒有收錄，照原文保留',
        '第 4 行：「/bar」不是認得的指令，照原文保留'
    ]);

    // 改好就不再提醒；清空後整塊隱藏，舊的 li 也不留
    page.type('/ac "Muscle Memory"\n/ac Manipulation <wait.2>\n/mlock');
    assert.deepEqual(page.warnings(), []);
    assert.equal(page.$('macroWarnings').hidden, true);
    page.type(WITH_PROBLEMS);
    page.type('');
    assert.deepEqual(page.warnings(), []);
    assert.equal(page.$('macroWarnings').hidden, true);
    assert.equal(page.$('macroWarnings').querySelectorAll('li').length, 0, '舊的 li 不留');

    // 改目標語言之後問題照樣依行號列出（技能、指令在每一種語言的資料裡都有）
    page.type(WITH_PROBLEMS);
    chooseTarget(page, 'en');
    assert.deepEqual(page.warnings(), [
        '第 2 行：「Final Appraisal」沒有收錄，照原文保留',
        '第 3 行：「/foo」不是認得的指令，照原文保留'
    ]);
});

test('要注意的行：不是指令的行（貼上的標題、表格的編號、# 備註）也列出來，依行號與其他兩種排在一起', async () => {
    const page = await createMacroPage();
    const warnText = (line, text) => `第 ${line} 行：「${text}」不是指令，遊戲裡會當成聊天訊息送出`;
    // 全形空白（U+3000）：用 fromCharCode 寫，看得出這一個字是什麼
    const wideSpace = String.fromCharCode(0x3000);

    // 攻略常見的貼法：標題、表格複製下來的編號、# 備註，和沒收錄的技能、不認得的指令混在一起；空白行不是問題
    const lines = ['マクロ1', MUSCLE_MEMORY, '1\t/ac 確信 <wait.3>', '/ac Final Appraisal <wait.2>', '# 備註', '/foo bar', '', '   ', wideSpace];
    page.type(lines.join('\n'));
    assert.deepEqual(page.warnings(), [
        warnText(1, 'マクロ1'),
        warnText(3, '1\t/ac 確信 <wait.3>'),
        '第 4 行：「Final Appraisal」沒有收錄，照原文保留',
        warnText(5, '# 備註'),
        '第 6 行：「/foo」不是認得的指令，照原文保留'
    ]);
    assert.equal(page.$('macroWarnings').hidden, false);
    // 這些行照原文留在輸出裡，不轉換；標題與編號也算輸出的一行（行數只算到最後一個非空行）
    assert.equal(page.output(), [lines[0], '/ac "堅信" <wait.3>', ...lines.slice(2)].join('\n'));
    assert.equal(page.outputTitle(), '繁體中文・6 行');

    // 問題的文字是去掉前後空白（含全形空白）的整行，輸出照原樣
    page.type(`${wideSpace}  マクロ1  ${wideSpace}\n/mlock`);
    assert.deepEqual(page.warnings(), [warnText(1, 'マクロ1')]);
    assert.equal(page.output(), `${wideSpace}  マクロ1  ${wideSpace}\n/mlock`);

    // 只有空白的行（半形、tab、全形空白）不是問題；沒有問題時整塊隱藏
    page.type(`/mlock\n   \n\t\n${wideSpace}\n/mlock`);
    assert.deepEqual(page.warnings(), []);
    assert.equal(page.$('macroWarnings').hidden, true);

    // 15 行的巨集上面多一行標題：標題也是輸出的一行，所以是 16 行、要分成 2 個巨集；標題那一條在前，超過 15 行的提醒在最後
    page.type(`マクロ1\n${macroLines(15)}`);
    assert.equal(page.outputTitle(), '繁體中文・16 行');
    assert.deepEqual(page.warnings(), [
        warnText(1, 'マクロ1'),
        '共 16 行：遊戲裡一個巨集最多 15 行，要分成 2 個巨集'
    ]);

    // 目標語言不影響；Windows 的 \r\n 換行照算，問題的文字不含 \r
    chooseTarget(page, 'en');
    page.type('マクロ1\r\n/mlock\r\n');
    assert.deepEqual(page.warnings(), [warnText(1, 'マクロ1')]);
    assert.equal(page.output(), 'マクロ1\n/mlock\n');
    assert.deepEqual(page.consoleErrors, []);
});

test('要注意的行：不是指令的行跟著網站介面語言，文字當成文字顯示，不會變成標籤', async () => {
    const page = await createMacroPage();
    page.type('マクロ1\n/mlock');
    assert.deepEqual(page.warnings(), ['第 1 行：「マクロ1」不是指令，遊戲裡會當成聊天訊息送出']);

    page.setLang('en');
    assert.deepEqual(page.warnings(), ['Line 1: "マクロ1" is not a command, so the game would send it as a chat message']);
    page.setLang('ja');
    assert.deepEqual(page.warnings(), ['1 行目：「マクロ1」はコマンドではないため、ゲームではチャットとして送信されます']);
    page.setLang('zh');
    assert.deepEqual(page.warnings(), ['第 1 行：「マクロ1」不是指令，遊戲裡會當成聊天訊息送出']);

    // 整行的原文可能有 <me> 這類尖括號：一條裡只有文字節點，不能多出元素
    page.type('<me> 第一段\n/mlock');
    assert.deepEqual(page.warnings(), ['第 1 行：「<me> 第一段」不是指令，遊戲裡會當成聊天訊息送出']);
    const list = page.$('macroWarnings');
    assert.equal(list.querySelectorAll('me').length, 0, '<me> 不能變成元素');
    const items = list.querySelectorAll('li');
    assert.equal(items.length, 1);
    assert.ok(items[0].childNodes.every((node) => node.nodeType === 3), '每一條裡只有文字節點');
    assert.deepEqual(page.consoleErrors, []);
});

test('超過 15 行時最後一條提醒要分成幾個巨集', async () => {
    const page = await createMacroPage();
    page.type(macroLines(15));
    assert.deepEqual(page.warnings(), [], '剛好 15 行沒有這一條');
    assert.equal(page.$('macroWarnings').hidden, true);

    const tooLong = (lines, macros) => `共 ${lines} 行：遊戲裡一個巨集最多 15 行，要分成 ${macros} 個巨集`;
    for (const [lines, macros] of [[16, 2], [18, 2], [30, 2], [31, 3], [45, 3], [46, 4]]) {
        page.type(macroLines(lines));
        assert.deepEqual(page.warnings(), [tooLong(lines, macros)], `${lines} 行要分成 ${macros} 個巨集`);
        assert.equal(page.$('macroWarnings').hidden, false, '只有這一條時整塊也要顯示');
        assert.equal(page.outputTitle(), `繁體中文・${lines} 行`);
    }

    // 排在最後一條：前面是各行的問題
    page.type(`/foo\n${macroLines(17)}`);
    assert.deepEqual(page.warnings(), ['第 1 行：「/foo」不是認得的指令，照原文保留', tooLong(18, 2)]);

    // 結尾有好幾個空行：行數只算到最後一個非空行，不會多跳「超過 15 行」
    page.type(`${macroLines(15)}\n\n\n`);
    assert.deepEqual(page.warnings(), []);
    assert.equal(page.outputTitle(), '繁體中文・15 行');
    page.type(`${macroLines(15)}\n  \n\r\n`);
    assert.deepEqual(page.warnings(), []);
    page.type(`${macroLines(16)}\n\n\n`);
    assert.deepEqual(page.warnings(), [tooLong(16, 2)]);
    assert.equal(page.outputTitle(), '繁體中文・16 行');
    // 空行在前面、中間時照算：它們是巨集的一部分
    page.type(`\n${macroLines(15)}`);
    assert.deepEqual(page.warnings(), [tooLong(16, 2)]);
});

test('警告裡的尖括號當成文字顯示，不會變成標籤', async () => {
    const page = await createMacroPage();
    page.type('/foo <me>');
    assert.ok(page.warnings()[0].includes('「/foo」'), page.warnings()[0]);
    assert.equal(page.$('macroWarnings').querySelectorAll('me').length, 0);

    // 問題的文字裡真的有 <me>：指令與技能名都是
    page.type('/foo<me>');
    assert.deepEqual(page.warnings(), ['第 1 行：「/foo<me>」不是認得的指令，照原文保留']);
    page.type('/ac "Foo <me>" <wait.3>');
    assert.deepEqual(page.warnings(), ['第 1 行：「Foo <me>」沒有收錄，照原文保留']);
    assert.equal(page.output(), '/ac "Foo <me>" <wait.3>', '輸出照原樣');

    const list = page.$('macroWarnings');
    assert.equal(list.querySelectorAll('me').length, 0, '<me> 不能變成元素');
    const items = list.querySelectorAll('li');
    assert.equal(items.length, 1);
    assert.ok(items[0].childNodes.every((node) => node.nodeType === 3), '每一條裡只有文字節點');
    assert.deepEqual(page.consoleErrors, []);
});

test('改目標語言立刻重轉並記住，重新打開還在', async () => {
    const page = await createMacroPage();
    assert.equal(page.app.constructor.STORAGE_KEY, KEY);
    page.type(MUSCLE_MEMORY);
    assert.equal(page.output(), '/ac "堅信" <wait.3>');

    chooseTarget(page, 'en');
    assert.equal(page.output(), MUSCLE_MEMORY, '同一個輸入，輸出立刻換成英文');
    assert.equal(page.outputTitle(), '英文・1 行', '標題列的語言名稱也換了');
    assert.equal(page.storage.get(KEY), 'en');

    chooseTarget(page, 'ja');
    assert.equal(page.output(), '/ac "確信" <wait.3>');
    assert.equal(page.storage.get(KEY), 'ja');

    // 重新打開：輸入框是空的（不記輸入），目標語言還是上次選的
    const again = await page.reopen();
    assert.equal(again.$('targetLang').value, 'ja');
    assert.equal(again.$('inputMacro').value, '');
    assert.equal(again.outputTitle(), '日文');
    again.type(MUSCLE_MEMORY);
    assert.equal(again.output(), '/ac "確信" <wait.3>');
    assert.deepEqual(again.consoleErrors, []);

    // 選回繁體中文也會存
    chooseTarget(again, 'zh');
    assert.equal(again.storage.get(KEY), 'zh');
    assert.equal((await again.reopen()).$('targetLang').value, 'zh');
});

test('存著的目標語言壞掉或讀不到時是繁體中文', async () => {
    for (const bad of ['xx', '', 'EN', 'zh-TW', '{"lang":"en"}', 'undefined']) {
        const page = await createMacroPage({ stored: { [KEY]: bad } });
        assert.equal(page.$('targetLang').value, 'zh', `存著 ${JSON.stringify(bad)} 時是繁體中文`);
        page.type(MUSCLE_MEMORY);
        assert.equal(page.output(), '/ac "堅信" <wait.3>');
        assert.deepEqual(page.consoleErrors, []);
    }

    // 好的值：三種語言都認得
    for (const lang of LANGS) {
        assert.equal((await createMacroPage({ stored: { [KEY]: lang } })).$('targetLang').value, lang);
    }

    // 瀏覽器封鎖網站資料（光是讀 localStorage 就丟例外）：照常打開、改目標語言照常運作、不丟錯、console 是空的
    const blocked = await createMacroPage({ lang: 'en', storageThrows: true });
    assert.equal(blocked.$('targetLang').value, 'zh');
    blocked.type(MUSCLE_MEMORY);
    assert.equal(blocked.output(), '/ac "堅信" <wait.3>');
    chooseTarget(blocked, 'ja');
    assert.equal(blocked.output(), '/ac "確信" <wait.3>');
    assert.equal(blocked.outputTitle(), 'Japanese · 1 line', '介面語言是英文，目標語言選日文');
    assert.deepEqual(blocked.consoleErrors, []);

    // 讀得到、寫不進去（容量已滿）：一樣照常運作
    const full = await createMacroPage();
    full.window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    full.type(MUSCLE_MEMORY);
    chooseTarget(full, 'en');
    assert.equal(full.output(), MUSCLE_MEMORY);
    assert.deepEqual(full.consoleErrors, []);
});

test('切換網站介面語言不改目標語言，介面文字、標題列與要注意的行換成那個語言', async () => {
    const page = await createMacroPage();
    page.type(WITH_PROBLEMS);
    const output = page.output();
    assert.equal(page.$('copyOutput').textContent, '複製');
    assert.equal(page.$('inputMacro').closest('.macro-panel').querySelector('label').textContent, '輸入巨集');

    page.setLang('en');
    assert.equal(page.$('targetLang').value, 'zh', '目標語言不跟著介面語言');
    assert.equal(page.output(), output, '輸出內容不變');
    assert.equal(page.$('inputMacro').value, WITH_PROBLEMS, '輸入也不變');
    assert.equal(page.outputTitle(), 'Traditional Chinese · 3 lines');
    assert.deepEqual(page.warnings(), [
        'Line 2: "Final Appraisal" is not in the data, so it is kept as written',
        'Line 3: "/foo" is not a recognized command, so it is kept as written'
    ]);
    assert.equal(page.$('copyOutput').textContent, 'Copy');
    assert.equal(page.$('inputMacro').closest('.macro-panel').querySelector('label').textContent, 'Input Macro');
    assert.equal(page.$('outputMacro').placeholder, 'The converted macro will appear here');
    assert.equal(page.$('targetLang').closest('.form-group').querySelector('label').textContent, 'Target Language');

    page.setLang('ja');
    assert.equal(page.$('targetLang').value, 'zh');
    assert.equal(page.output(), output);
    assert.equal(page.outputTitle(), '繁体字中国語・3 行');
    assert.deepEqual(page.warnings(), [
        '2 行目：「Final Appraisal」は収録されていないため、そのまま残しました',
        '3 行目：「/foo」は認識できないコマンドのため、そのまま残しました'
    ]);
    assert.equal(page.$('copyOutput').textContent, 'コピー');
    assert.equal(page.$('outputMacro').placeholder, '変換結果はここに表示されます');

    // 超過 15 行的那一條也換語言
    page.type(macroLines(18));
    assert.deepEqual(page.warnings(), ['全 18 行：ゲーム内のマクロは最大 15 行までなので、2 個のマクロに分けてください']);
    page.setLang('en');
    assert.deepEqual(page.warnings(), ['18 lines in total: a game macro holds 15 lines at most, so split it into 2 macros']);

    page.setLang('zh');
    assert.equal(page.outputTitle(), '繁體中文・18 行');
    assert.deepEqual(page.warnings(), ['共 18 行：遊戲裡一個巨集最多 15 行，要分成 2 個巨集']);
    assert.equal(page.$('outputMacro').placeholder, '轉換結果會出現在這裡');
    assert.equal(page.storage.has(KEY), false, '切換介面語言不寫目標語言');

    // 目標語言是使用者選的：介面語言換了，它還是原本那個
    chooseTarget(page, 'en');
    page.setLang('ja');
    assert.equal(page.$('targetLang').value, 'en');
    assert.equal(page.storage.get(KEY), 'en');
    assert.deepEqual(page.consoleErrors, []);
});

test('載入資料：載入中顯示 .loading，失敗時顯示錯誤，console 都是空的，app.ready 都會完成', async () => {
    const pending = await createMacroPage({ fetchResults: ['pending'] });
    assert.equal(pending.$('loadingIndicator').hidden, false, '資料還沒回來：顯示載入中');
    assert.equal(pending.$('loadError').hidden, true);

    const loaded = await createMacroPage();
    assert.ok(loaded.app.engine, '載入完成後才有轉換用的資料');
    assert.equal(loaded.$('loadingIndicator').hidden, true);
    assert.equal(loaded.$('loadError').hidden, true);

    const failed = await createMacroPage({ fetchResults: ['fail'] });
    assert.ok(failed.app.engine === null, '資料沒載入就沒有轉換用的資料');
    assert.equal(failed.$('loadError').hidden, false, '失敗時在工具最上面顯示錯誤');
    assert.equal(failed.$('loadingIndicator').hidden, true);
    assert.equal(failed.$('loadError').querySelector('p').textContent, '載入翻譯資料失敗，請按「重試」再試一次。');
    assert.equal(failed.$('loadError').querySelector('button').id, 'retryLoad');
    assert.equal(failed.outputTitle(), '繁體中文', '標題列照樣是語言名稱');
    failed.type('/ac Innovation');
    assert.equal(failed.output(), '', '沒有資料就沒有輸出，也不丟錯');
    failed.setLang('en');
    assert.equal(failed.$('loadError').querySelector('p').textContent, 'Failed to load the translation data. Press "Retry" to try again.');
    assert.deepEqual(failed.consoleErrors, []);
    assert.deepEqual(pending.consoleErrors, []);
});

test('index.html：沒有轉換鈕與預設內容，說明與範圍文字，輸出框連到要注意的行', async () => {
    // 拿掉的標記，與不再用的翻譯鍵（macro_converter_output_placeholder 還在，所以連 data-i18n 的引號一起比）
    for (const gone of ['convertBtn', 'convert-button-container', 'warningMessage', 'errorMessage', 'auto-detect-hint']) {
        assert.ok(!HTML.includes(gone), `index.html 不該再有 ${gone}`);
    }
    for (const key of ['macro_converter_convert', 'macro_converter_warning', 'macro_converter_auto_detect_hint', 'macro_converter_output']) {
        assert.ok(!HTML.includes(`data-i18n="${key}"`), `index.html 不該再用 ${key}`);
    }

    // 工具區塊與裡面的每個 id（頁面腳本與測試共用）
    const page = await createMacroPage();
    const tool = page.$('macroTool');
    assert.ok(tagAttrs(HTML, 'macroTool').class.split(/\s+/).includes('tool-content'), '#macroTool 就是 .tool-content');
    for (const id of ['targetLang', 'inputMacro', 'pasteInput', 'clearInput', 'outputTitle', 'copyOutput',
        'macroWarnings', 'outputMacro', 'loadingIndicator', 'loadError', 'retryLoad']) {
        const element = page.$(id);
        assert.ok(element, `#${id} 不在`);
        assert.ok(tool.contains(element), `#${id} 要在 #macroTool 裡面`);
    }
    assert.ok(page.$('loadError').contains(page.$('retryLoad')), '「重試」在錯誤訊息裡');
    assert.equal(page.$('retryLoad').tagName, 'BUTTON');
    assert.equal(page.$('retryLoad').getAttribute('type'), 'button');
    assert.equal(page.$('targetLang').tagName, 'SELECT');
    assert.deepEqual(page.$('targetLang').querySelectorAll('option').map((option) => option.getAttribute('value')), ['zh', 'en', 'ja']);

    // 說明與範圍：頁首兩行，說明在前
    const at = (text) => HTML.indexOf(text);
    assert.ok(at('data-i18n="macro_converter_desc"') !== -1, '有說明');
    assert.ok(at('data-i18n="macro_converter_desc"') < at('data-i18n="macro_converter_scope"'), '範圍接在說明後面');
    assert.ok(at('data-i18n="macro_converter_scope"') < at('id="macroTool"'), '兩行都在工具區塊上面');

    // 輸入框一開始沒有內容，提示字是三行範例（英文、日文、繁中各一行），三行轉出來是同一行、沒有任何問題
    const input = page.$('inputMacro');
    assert.equal(input.value, '');
    assert.equal(input.childNodes.length, 0, '<textarea> 裡沒有預設文字');
    const example = input.getAttribute('placeholder').split('\n');
    assert.equal(example.length, 3, '三行範例');
    page.type(example.join('\n'));
    assert.deepEqual(page.warnings(), [], '範例本身要能轉換');
    assert.deepEqual(page.output().split('\n'), ['/ac "堅信" <wait.3>', '/ac "堅信" <wait.3>', '/ac "堅信" <wait.3>']);

    // 輸出框唯讀，說明文字是要注意的行；輸出標題是它的標籤；輸入框有自己的標籤
    assert.match(openTag('outputMacro'), /\sreadonly(?=[\s>])/);
    assert.equal(tagAttrs(HTML, 'outputMacro')['aria-describedby'], 'macroWarnings');
    assert.equal(tagAttrs(HTML, 'outputTitle').for, 'outputMacro');
    assert.match(HTML, /<label\b[^>]*\sfor="inputMacro"[^>]*>/);
    // 兩個框一樣高：手機上約 8 行（用 Chrome 量過：390 × 844 的第一個畫面看得到輸出標題列與輸出的開頭）
    assert.equal(tagAttrs(HTML, 'inputMacro').rows, '8');
    assert.equal(tagAttrs(HTML, 'outputMacro').rows, '8');

    // 整頁只有一顆主要按鈕：複製。貼上、清除、重試都是次要按鈕
    const primaries = [...HTML.matchAll(/\sclass="([^"]*)"/g)].filter((m) => m[1].split(/\s+/).includes('btn-primary'));
    assert.equal(primaries.length, 1, '整頁只有一個 .btn-primary');
    assert.ok(tagAttrs(HTML, 'copyOutput').class.split(/\s+/).includes('btn-primary'), '它是 #copyOutput');
    assert.equal(page.$('copyOutput').tagName, 'BUTTON');
    assert.equal(page.$('copyOutput').getAttribute('type'), 'button');

    // 一開始就藏起來的元素
    for (const id of ['macroWarnings', 'loadingIndicator', 'loadError']) {
        assert.match(openTag(id), /\shidden(?=[\s>])/, `#${id} 一開始是 hidden`);
    }

    // 標題、meta description 與腳本順序
    assert.match(HTML, /<title>巨集轉換器 - FF14\.tw<\/title>/);
    const zh = translationValues(TRANSLATIONS, 'zh');
    assert.equal(HTML.match(/<meta name="description" content="([^"]*)">/)[1], zh.get('macro_converter_description'));
    const scripts = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(scripts.slice(-2), ['conversion-engine.js', 'script.js'], '引擎在 script.js 前面，script.js 最後');
    assert.ok(scripts.includes('../../assets/js/i18n/translations/tools/macro-converter.js'));
    // 不載入 security-utils.js：這一頁載入的每個腳本都沒有用到 SecurityUtils（文字都用 textContent 與 .value）
    assert.ok(!scripts.some((src) => src.includes('security-utils.js')), '不載入 security-utils.js');
    for (const src of scripts) {
        const file = path.posix.normalize(`tools/macro-converter/${src}`);
        assert.doesNotMatch(read(file), /SecurityUtils/, `${file} 沒有用到 SecurityUtils`);
    }

    // 腳本：不再有預設範例、Ctrl＋Enter、寫死的標題分隔符號（每種語言自己的符號在 macro_converter_output_title）、console 與 innerHTML
    for (const gone of ['DEFAULT_EXAMPLE', 'loadDefaultExample', 'convertBtn', 'ctrlKey', 'metaKey', 'TITLE_SEPARATOR']) {
        assert.ok(!SCRIPT.includes(gone), `script.js 不該再有 ${gone}`);
    }
    assert.doesNotMatch(SCRIPT, /\bconsole\b/, 'script.js 不在 console 留東西');
    assert.doesNotMatch(SCRIPT, /innerHTML/);
});

test('style.css：手機上下排、769px 以上兩欄、沒有 overflow-x', () => {
    assert.doesNotMatch(CSS, /overflow-x/, '手機不能左右捲');
    assert.doesNotMatch(CSS, /convert-btn|convert-button-container|auto-detect-hint/, '轉換鈕與提示的樣式拿掉了');

    // 基本（手機）：一欄，輸入在上、輸出在下；不靠 order 調換
    assert.match(declarations('.macro-panels', BASE_CSS), /display:\s*grid/);
    assert.match(declarations('.macro-panels', BASE_CSS), /grid-template-columns:\s*minmax\(0, 1fr\)\s*(?:;|$)/);
    assert.doesNotMatch(CSS, /\border:/, '兩個框照原本的順序排');

    // 769px 以上：左右兩欄，中間沒有「轉換」那一欄
    const desktop = MEDIA.find((block) => block.condition === '(min-width: 769px)');
    assert.ok(desktop, '有 @media (min-width: 769px)');
    assert.match(declarations('.macro-panels', desktop.body), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(BASE_CSS, /repeat\(2/, '兩欄只在 769px 以上');
    assert.equal(MEDIA.some((block) => /max-width:\s*768px/.test(block.condition)), false, '手機用基本規則，不另外蓋一份');

    // 標題列：標題在左、按鈕在右；一行放不下時（320px 寬的日文、英文）按鈕換到下一行靠右，不把標題擠成「入力マク／ロ」
    assert.match(declarations('.panel-header'), /display:\s*flex/);
    assert.match(declarations('.panel-header'), /justify-content:\s*space-between/);
    assert.match(declarations('.panel-header'), /flex-wrap:\s*wrap/);
    assert.match(declarations('.panel-actions'), /margin-left:\s*auto/);
    // 輸入框與輸出框一樣用等寬字；電腦的框高到放得下 15 行（共用的 textarea.form-control 比 .macro-textarea 具體，所以要寫 textarea.macro-textarea）
    assert.match(declarations('.macro-textarea'), /font-family:\s*var\(--font-mono\)/);
    assert.match(declarations('textarea.macro-textarea', desktop.body), /min-height:\s*21rem/);

    // 轉換結果是這一頁的答案，不能看起來像提示字：共用的 .form-control[readonly] 把字設成輔助色（和提示字同色）、游標設成 not-allowed，
    // 輸出框改用內文色與文字游標，唯讀的底色照舊（不另外設）。用 id：比 .form-control[readonly] 具體，不靠樣式表的先後
    const output = declarations('#outputMacro');
    assert.match(output, /(?:^|[\s;])color:\s*var\(--color-text\)\s*;/, '輸出框的字用內文色');
    assert.match(output, /(?:^|[\s;])cursor:\s*text\s*;/, '輸出框的游標是文字游標');
    assert.doesNotMatch(output, /background/, '唯讀的底色照舊，不另外設');
    assert.doesNotMatch(declarations('.macro-textarea'), /(?:^|[\s;])(?:color|cursor):/, '兩個框共用的規則不改字色與游標：輸入框照共用元件');

    // 中文的說明與範圍只在標點後斷行（不斷成「生產巨／集」）；日文、英文照一般的斷行規則（日文套 keep-all 句號會單獨掉到下一行）
    for (const selector of ['.page-header .description:lang(zh)', '.scope-note:lang(zh)']) {
        assert.match(declarations(selector), /word-break:\s*keep-all/, `${selector} 只在標點後斷行`);
        assert.match(declarations(selector), /overflow-wrap:\s*anywhere/, `${selector} 放不下時照樣能斷`);
    }
    const keepAll = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((rule) => /keep-all/.test(rule[2]));
    assert.equal(keepAll.length, 1, '只有一條規則用 keep-all');
    assert.ok(keepAll[0][1].split(',').every((selector) => selector.includes(':lang(zh)')), 'keep-all 只給中文');

    // 用 hidden 切換的元素：.loading、.warning-message 的 display 會蓋掉瀏覽器內建的 [hidden]，所以要自己寫
    for (const id of ['macroWarnings', 'loadingIndicator', 'loadError']) {
        assert.match(declarations(`#${id}[hidden]`), /display:\s*none/, `#${id}[hidden] 要藏起來`);
    }
});

test('翻譯檔：三語的鍵與 {參數} 一致，拿掉的鍵不在了，頁面用到的鍵都在', () => {
    const keys = Object.fromEntries(LANGS.map((lang) => [lang, translationKeySet(TRANSLATIONS, lang)]));
    const values = Object.fromEntries(LANGS.map((lang) => [lang, translationValues(TRANSLATIONS, lang)]));
    assert.ok(keys.zh.size >= 20, `解析不到 ${TRANSLATIONS} 的 zh 語系，測試可能失效（${keys.zh.size} 個）`);
    for (const lang of LANGS) {
        assert.deepEqual([...keys[lang]].sort(), [...keys.zh].sort(), `${lang} 的鍵和 zh 一樣`);
        assert.equal(values[lang].size, keys[lang].size, `${lang} 每個鍵都有字串值`);
    }

    // 每個鍵的 zh 文字（寫死：改字就是改畫面）
    const ZH = {
        macro_converter_title: '巨集轉換器 - FF14.tw',
        macro_converter_description: '把英文、日文攻略的 FF14 生產巨集換成繁體中文；支援生產技能與文字指令。',
        macro_converter_header: '巨集轉換器',
        macro_converter_desc: '貼上英文或日文的生產巨集，馬上換成繁體中文。',
        macro_converter_scope: '支援生產技能與文字指令；戰鬥、採集技能還沒有收錄。',
        macro_converter_target_lang: '目標語言',
        macro_converter_input: '輸入巨集',
        macro_converter_output_placeholder: '轉換結果會出現在這裡',
        macro_converter_lang_zh: '繁體中文',
        macro_converter_lang_en: '英文',
        macro_converter_lang_ja: '日文',
        macro_converter_line_one: '{count} 行',
        macro_converter_lines: '{count} 行',
        macro_converter_output_title: '{lang}・{lines}',
        macro_converter_warn_action: '第 {line} 行：「{text}」沒有收錄，照原文保留',
        macro_converter_warn_command: '第 {line} 行：「{text}」不是認得的指令，照原文保留',
        macro_converter_warn_text: '第 {line} 行：「{text}」不是指令，遊戲裡會當成聊天訊息送出',
        macro_converter_warn_too_long: '共 {lines} 行：遊戲裡一個巨集最多 15 行，要分成 {macros} 個巨集',
        macro_converter_copy: '複製',
        macro_converter_copied_button: '✓ 已複製',
        macro_converter_clear: '清除',
        macro_converter_paste: '貼上',
        macro_converter_retry: '重試',
        macro_converter_loading: '載入翻譯資料中...',
        macro_converter_load_error: '載入翻譯資料失敗，請按「重試」再試一次。',
        macro_converter_copied: '已複製',
        macro_converter_copy_error: '複製失敗，請手動選取文字',
        macro_converter_paste_error: '沒辦法讀取剪貼簿，請直接在框裡貼上（Ctrl+V 或長按）'
    };
    assert.deepEqual(Object.fromEntries(values.zh), ZH);

    // {line}、{text}、{count}、{lines}、{macros}：某一語少寫一個參數，畫面上就會少一個數字或名稱，或是留下沒換掉的 {…}
    const params = (text) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
    for (const key of keys.zh) {
        for (const lang of ['en', 'ja']) {
            assert.deepEqual(params(values[lang].get(key)), params(values.zh.get(key)), `${key} 的 ${lang} 參數和 zh 一樣`);
        }
    }
    assert.deepEqual(params(values.zh.get('macro_converter_warn_action')), ['{line}', '{text}']);
    assert.deepEqual(params(values.zh.get('macro_converter_warn_command')), ['{line}', '{text}']);
    assert.deepEqual(params(values.zh.get('macro_converter_warn_text')), ['{line}', '{text}']);
    assert.deepEqual(params(values.zh.get('macro_converter_warn_too_long')), ['{lines}', '{macros}']);
    assert.deepEqual(params(values.zh.get('macro_converter_line_one')), ['{count}']);
    assert.deepEqual(params(values.zh.get('macro_converter_lines')), ['{count}']);
    assert.deepEqual(params(values.zh.get('macro_converter_output_title')), ['{lang}', '{lines}']);

    // 拿掉的鍵三語都不在
    const REMOVED = ['macro_converter_convert', 'macro_converter_warning', 'macro_converter_auto_detect_hint',
        'macro_converter_untranslatable', 'macro_converter_output', 'macro_converter_nothing_to_copy'];
    for (const lang of LANGS) {
        for (const key of REMOVED) assert.equal(keys[lang].has(key), false, `${lang} 的 ${key} 已拿掉`);
    }

    // 英文的行數有單複數，中文、日文兩個鍵一樣
    assert.equal(values.en.get('macro_converter_line_one'), '{count} line');
    assert.equal(values.en.get('macro_converter_lines'), '{count} lines');
    assert.equal(values.ja.get('macro_converter_line_one'), values.ja.get('macro_converter_lines'));
    // 輸出標題列的符號是每種語言自己的翻譯：中文、日文是「・」（U+30FB，前後沒有空格），英文是前後各一個空格的「 · 」（U+00B7）
    assert.equal(values.ja.get('macro_converter_output_title'), '{lang}・{lines}');
    assert.equal(values.en.get('macro_converter_output_title'), '{lang} · {lines}');
    assert.deepEqual(['zh', 'en', 'ja'].map((lang) => values[lang].get('macro_converter_lang_zh')), ['繁體中文', 'Traditional Chinese', '繁体字中国語']);

    // 頁面用到的鍵：index.html 的 data-i18n 與 script.js 裡的 'macro_converter_…' 字串，三語都要有
    const used = new Set([
        ...[...HTML.matchAll(/\sdata-i18n="([^"]+)"/g)].map((m) => m[1]),
        ...[...SCRIPT.matchAll(/'(macro_converter_[a-z0-9_]+)'/g)].map((m) => m[1])
    ]);
    assert.ok(used.size >= 15, `只找到 ${used.size} 個用到的鍵，解析可能失效`);
    for (const key of used) {
        for (const lang of LANGS) assert.ok(keys[lang].has(key), `頁面用到的 ${key} 在 ${lang} 找不到`);
    }

    // 頁面上有 data-i18n 的元素：靜態的預設文字和 zh 翻譯相同（I18nManager 套用前後不會閃一下別的字）
    const found = [...HTML.matchAll(/(<[a-zA-Z][\w-]*\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([^<]*)</g)];
    assert.ok(found.length >= 8, `只找到 ${found.length} 個 data-i18n，解析可能失效`);
    for (const [, , key, text] of found) assert.equal(text, values.zh.get(key), `index.html 的 ${key} 預設文字`);
});
