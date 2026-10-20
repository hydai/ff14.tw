const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWondrousPage } = require('./helpers/wondrous-page.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const TRANSLATIONS = 'assets/js/i18n/translations/tools/wondrous-tails.js';
const LABELS = Array.from({ length: 16 }, (_, i) => `第 ${i + 1} 格`);
// 元素用 === 比：assert.equal 失敗時會展開整份 fake-dom 而卡住（同 mini-cactpot-page.test.js）
const isSame = (actual, expected, message) => assert.ok(actual === expected, message);
// style.css 裡某個選擇器第一條規則的內容
function cssRule(file, selector) {
    const css = read(file);
    const at = css.indexOf(`${selector} {`);
    assert.notEqual(at, -1, `${file} 找不到 ${selector}`);
    return css.slice(at, css.indexOf('}', at));
}

test('說明只有一句（三語）', () => {
    assert.match(read('tools/wondrous-tails/index.html'),
        /<p class="description" data-i18n="wondrous_tails_desc">點一格貼上貼紙，再點一次拿掉（最多 9 張）<\/p>/);
    assert.equal(translationValues(TRANSLATIONS, 'zh').get('wondrous_tails_desc'), '點一格貼上貼紙，再點一次拿掉（最多 9 張）');
    assert.equal(translationValues(TRANSLATIONS, 'en').get('wondrous_tails_desc'), 'Click a cell to place a sticker, click it again to remove it (up to 9)');
    assert.equal(translationValues(TRANSLATIONS, 'ja').get('wondrous_tails_desc'), 'マスをクリックしてシールを貼り、もう一度クリックで剥がす（最大9枚）');
});

test('一打開：已貼 0／9 張，16 格都是還沒貼的按鈕，不跳 toast', () => {
    const page = createWondrousPage();
    assert.equal(page.count(), '已貼 0／9 張');
    assert.equal(page.cells().length, 16);
    assert.deepEqual(page.cells().map((c) => c.type), Array(16).fill('button'));
    assert.deepEqual(page.cells().map((c) => c.getAttribute('aria-pressed')), Array(16).fill('false'));
    assert.deepEqual(page.cells().map((c) => c.getAttribute('aria-label')), LABELS);
    assert.deepEqual(page.cells().map((c) => c.disabled === true), Array(16).fill(false));
    assert.deepEqual(page.placed(), []);
    assert.equal(page.toasts.length, 0);
});

test('點空格貼上、再點一次拿掉；張數跟著變', () => {
    const page = createWondrousPage();
    page.place(0);
    assert.ok(page.cell(0).classList.contains('placed'));
    assert.equal(page.cell(0).getAttribute('aria-pressed'), 'true');
    assert.equal(page.count(), '已貼 1／9 張');
    page.place(5);
    assert.equal(page.count(), '已貼 2／9 張');
    page.place(0);
    assert.ok(!page.cell(0).classList.contains('placed'));
    assert.deepEqual(page.placed(), [5]);
    assert.equal(page.count(), '已貼 1／9 張');
});

test('貼滿 9 張：其他 7 格不能點、點了也不會貼，不跳 toast；拿掉一張後又能點', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2, 3, 4, 5, 6, 7, 8);
    assert.equal(page.count(), '已貼 9／9 張');
    assert.deepEqual(page.cells().map((c) => c.disabled === true), [...Array(9).fill(false), ...Array(7).fill(true)]);
    page.place(9);
    assert.deepEqual(page.placed(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    page.place(8);
    assert.equal(page.count(), '已貼 8／9 張');
    assert.deepEqual(page.cells().map((c) => c.disabled === true), Array(16).fill(false));
    assert.equal(page.toasts.length, 0);
});

test('重畫不重建格子：用鍵盤（焦點在格子上）貼上之後，焦點還在同一格、同一個元素', () => {
    const page = createWondrousPage();
    const cell = page.cell(3);
    cell.focus();
    cell.click();
    isSame(page.cell(3), cell, '還是同一個按鈕');
    isSame(page.document.activeElement, cell, '焦點還在這一格');
    assert.equal(cell.getAttribute('aria-pressed'), 'true');
});

test('切換語言：張數與格子名稱換成那個語言', () => {
    const page = createWondrousPage();
    page.place(2);
    page.setLang('en');
    assert.equal(page.count(), 'Stickers: 1/9');
    assert.equal(page.cell(0).getAttribute('aria-label'), 'Cell 1');
    page.setLang('ja');
    assert.equal(page.count(), 'シール 1／9 枚');
    assert.equal(page.cell(15).getAttribute('aria-label'), 'マス 16');
});

test('頁面結構：拿掉還原／重做、紅色的重置、結果面板與建議；格子是 16 個按鈕；不再載入 state-history-manager.js', () => {
    const html = read('tools/wondrous-tails/index.html');
    for (const gone of ['undo-btn', 'redo-btn', 'reset-btn', 'results-panel', 'recommendation', 'btn-danger', 'wondrous_tails_results_title', 'style="display: none', 'state-history-manager.js']) {
        assert.ok(!html.includes(gone), `index.html 不應該再有 ${gone}`);
    }
    assert.equal((html.match(/<button type="button" class="cell grid-cell" data-position="\d+" aria-pressed="false" aria-label="第 \d+ 格"><\/button>/g) || []).length, 16);
    const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(srcs[srcs.length - 1], 'script.js');
});

test('版面：盤面用滿寬度、格子是正方形、間距 12px；已貼的格子不設 box-shadow（不然會蓋掉共用的焦點外框）', () => {
    const file = 'tools/wondrous-tails/style.css';
    assert.match(cssRule(file, '.wondrous-grid'), /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
    assert.match(cssRule(file, '.wondrous-grid'), /gap:\s*var\(--space-3\);/);
    assert.match(cssRule(file, '.grid-cell'), /aspect-ratio:\s*1;/);
    assert.doesNotMatch(read(file), /width:\s*(80|60|50)px|max-width:\s*(400|300|250)px/);
    assert.doesNotMatch(cssRule(file, '.cell.placed'), /box-shadow/);
    assert.match(cssRule(file, '.board-head'), /min-height:\s*var\(--control-sm\);/);
    assert.match(cssRule(file, '.wondrous-board-card'), /padding:\s*var\(--space-4\);/);
    assert.match(cssRule(file, '.page-header .description'), /text-wrap:\s*balance;/);
});

test('不再用到的翻譯鍵三語都拿掉', () => {
    const removed = ['wondrous_tails_placed', 'wondrous_tails_objects', 'wondrous_tails_reset', 'wondrous_tails_results_title',
        'wondrous_tails_1_line', 'wondrous_tails_2_lines', 'wondrous_tails_3_lines', 'wondrous_tails_suggestion',
        'wondrous_tails_default_suggestion', 'wondrous_tails_max_objects', 'wondrous_tails_reset_done',
        'wondrous_tails_rec_excellent', 'wondrous_tails_rec_medium', 'wondrous_tails_rec_poor', 'wondrous_tails_rec_3lines',
        'wondrous_tails_rec_2lines', 'wondrous_tails_rec_1line', 'wondrous_tails_rec_low'];
    for (const lang of ['zh', 'en', 'ja']) {
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of removed) assert.ok(!keys.has(key), `${lang} 還有 ${key}`);
    }
});

const RESET_TEXT = ['58.5%', '10.6%', '0.21%'];
const DASHES = ['—', '—', '—'];
const column = (page, name) => page.odds().map((row) => row[name]);

test('一打開（0 張）：現在是隨機 9 張的機率，重置之後寫「—」、長條長度 0', () => {
    const page = createWondrousPage();
    assert.deepEqual(column(page, 'label'), ['至少 1 條', '至少 2 條', '至少 3 條']);
    assert.deepEqual(page.header(), ['現在', '重置之後']);
    assert.deepEqual(column(page, 'now'), RESET_TEXT);
    assert.deepEqual(column(page, 'nowWidth'), ['58.46%', '10.56%', '0.21%']);
    assert.deepEqual(column(page, 'after'), DASHES);
    assert.deepEqual(column(page, 'afterWidth'), ['0.00%', '0.00%', '0.00%']);
});

test('貼 3～7 張才有重置之後：2 張「—」、3 張與 7 張是 58.5%／10.6%／0.21%、8 張與 9 張又是「—」', () => {
    const page = createWondrousPage();
    const order = [0, 5, 10, 15, 1, 2, 3, 4, 8];
    const expected = [DASHES, DASHES, DASHES, RESET_TEXT, RESET_TEXT, RESET_TEXT, RESET_TEXT, RESET_TEXT, DASHES, DASHES];
    assert.deepEqual(column(page, 'after'), expected[0]);
    order.forEach((p, i) => {
        page.place(p);
        assert.deepEqual(column(page, 'after'), expected[i + 1], `${i + 1} 張`);
    });
    assert.deepEqual(column(page, 'afterWidth'), ['0.00%', '0.00%', '0.00%']);
});

test('例子盤面：0、1、2、5、10、12（6 張）現在是 70.0%／13.3%／0%', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2, 5, 10, 12);
    assert.deepEqual(column(page, 'now'), ['70.0%', '13.3%', '0%']);
    assert.deepEqual(column(page, 'nowWidth'), ['70.00%', '13.33%', '0.00%']);
    assert.deepEqual(column(page, 'after'), RESET_TEXT);
    assert.deepEqual(column(page, 'afterWidth'), ['58.46%', '10.56%', '0.21%']);
});

test('貼滿 9 張：現在只剩 100% 或 0%', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2, 3, 4, 5, 8, 10, 12);
    assert.deepEqual(column(page, 'now'), ['100%', '100%', '0%']);
    assert.deepEqual(column(page, 'after'), DASHES);
});

test('切換語言：表頭與每一列的名稱換字，數字不變', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2);
    page.setLang('en');
    assert.deepEqual(page.header(), ['Now', 'After reset']);
    assert.deepEqual(column(page, 'label'), ['At least 1 line', 'At least 2 lines', 'At least 3 lines']);
    assert.deepEqual(column(page, 'now'), ['68.9%', '15.4%', '0.35%']);
    page.setLang('ja');
    assert.deepEqual(page.header(), ['現在', 'リセット後']);
    assert.deepEqual(column(page, 'label'), ['1ライン以上', '2ライン以上', '3ライン以上']);
});

test('機率卡：在盤面卡後面；電腦（768px 以上）兩欄；數字與長條不用好壞配色；先載入 tails-odds.js', () => {
    const html = read('tools/wondrous-tails/index.html');
    assert.ok(html.indexOf('wondrous-board-card') < html.indexOf('wondrous-odds-card'));
    const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(srcs.indexOf('tails-odds.js'), srcs.length - 2);
    const file = 'tools/wondrous-tails/style.css';
    const css = read(file);
    const wideAt = css.indexOf('@media (min-width: 768px)');
    assert.notEqual(wideAt, -1, 'style.css 找不到 @media (min-width: 768px)');
    assert.match(css.slice(wideAt), /\.wondrous-layout \{[^}]*grid-template-columns:\s*minmax\(0, 26rem\) minmax\(0, 22rem\);/);
    assert.match(cssRule(file, '.odds-bar-now'), /background:\s*var\(--color-primary\);/);
    assert.match(cssRule(file, '.odds-bar-after'), /background:\s*var\(--color-muted\);/);
    for (const selector of ['.odds-now', '.odds-after', '.odds-bar-now', '.odds-bar-after']) {
        assert.doesNotMatch(cssRule(file, selector), /--color-(success|warning|danger)/, `${selector} 不用好壞配色`);
    }
    assert.doesNotMatch(css, /\.prob-value|\.(high|medium|low)\b/);
    assert.doesNotMatch(read('tools/wondrous-tails/script.js'), /'(high|medium|low)'/);
});

test('toggle() 自己也擋（不靠格子的 disabled）：傳盤面外的位置、或 9 張時再貼第 10 張，都什麼都不變、不丟錯', () => {
    const page = createWondrousPage();
    page.place(0);
    for (const position of [-1, 16, 1.5]) assert.doesNotThrow(() => page.app.toggle(position));
    assert.deepEqual(page.placed(), [0]);
    assert.equal(page.count(), '已貼 1／9 張');
    page.place(1, 2, 3, 4, 5, 6, 7, 8);
    assert.doesNotThrow(() => page.app.toggle(9));
    assert.deepEqual(page.placed(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(page.count(), '已貼 9／9 張');
    assert.deepEqual(page.odds().map((row) => row.now), ['100%', '100%', '0%']);
});

test('連成一條線：線上 4 格加綠框（line-done），格子名稱寫「已連成線」', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2, 3);
    assert.deepEqual(page.doneCells(), [0, 1, 2, 3]);
    assert.deepEqual(page.nearCells(), []);
    assert.equal(page.cell(0).getAttribute('aria-label'), '第 1 格：已連成線');
    assert.equal(page.cell(4).getAttribute('aria-label'), '第 5 格');
});

test('只差一張：缺的那格加虛線框（line-near），名稱寫「貼了就連成線」', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2);
    assert.deepEqual(page.nearCells(), [3]);
    assert.deepEqual(page.doneCells(), []);
    assert.equal(page.cell(3).getAttribute('aria-label'), '第 4 格：貼了就連成線');
});

test('同一格補齊兩條線只標一次；連成的線和差一張的線可以同時出現', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2, 7, 11, 15);
    assert.deepEqual(page.nearCells(), [3]);
    const other = createWondrousPage();
    other.place(0, 1, 2, 3, 4, 8);
    assert.deepEqual(other.doneCells(), [0, 1, 2, 3]);
    assert.deepEqual(other.nearCells(), [12]);
});

test('9 張時不標虛線框；拿掉一張後又標回來', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2, 4, 6, 9, 11, 13, 14);
    assert.deepEqual(page.nearCells(), []);
    page.place(14);
    assert.deepEqual(page.nearCells(), [3, 5]);
});

test('拿掉一張讓線斷掉：綠框跟著拿掉，缺的那格改成虛線框', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2, 3);
    page.place(3);
    assert.deepEqual(page.doneCells(), []);
    assert.deepEqual(page.nearCells(), [3]);
    assert.equal(page.cell(0).getAttribute('aria-label'), '第 1 格');
});

test('切換語言：格子名稱的「已連成線」「貼了就連成線」換字', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2, 3, 4, 8);
    page.setLang('en');
    assert.equal(page.cell(0).getAttribute('aria-label'), 'Cell 1: in a completed line');
    assert.equal(page.cell(12).getAttribute('aria-label'), 'Cell 13: completes a line');
    page.setLang('ja');
    assert.equal(page.cell(0).getAttribute('aria-label'), 'マス 1：ライン完成');
    assert.equal(page.cell(12).getAttribute('aria-label'), 'マス 13：貼るとライン完成');
});

test('樣式：綠框用 outline（不蓋掉共用的 box-shadow 焦點外框）、虛線框用 --color-success；沒有圖例', () => {
    const file = 'tools/wondrous-tails/style.css';
    const done = cssRule(file, '.cell.line-done');
    assert.match(done, /outline:\s*3px solid var\(--color-success\);/);
    assert.match(done, /outline-offset:\s*3px;/);
    assert.doesNotMatch(done, /box-shadow/);
    assert.match(cssRule(file, '.cell.line-near'), /border:\s*2px dashed var\(--color-success\);/);
    assert.doesNotMatch(read('tools/wondrous-tails/index.html'), /legend|圖例/);
});

test('一打開：「清空盤面」在盤面卡標題列的右邊，是一般按鈕，不能按', () => {
    const html = read('tools/wondrous-tails/index.html');
    assert.match(html, /<div class="board-head">\s*<span class="board-count" id="placed-count">[^<]*<\/span>\s*<button type="button" class="btn btn-sm" id="clear-btn" disabled>清空盤面<\/button>\s*<\/div>/);
    const page = createWondrousPage();
    assert.equal(page.clearButton().textContent, '清空盤面');
    assert.equal(page.clearButton().disabled, true);
});

test('按「清空盤面」：盤面清空、按鈕變成「復原」，焦點留在按鈕上，不跳 toast', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2, 5);
    assert.equal(page.clearButton().disabled, false);
    page.clearButton().focus();
    page.clearButton().click();
    assert.deepEqual(page.placed(), []);
    assert.equal(page.count(), '已貼 0／9 張');
    assert.equal(page.clearButton().textContent, '復原');
    assert.equal(page.clearButton().disabled, false);
    isSame(page.document.activeElement, page.clearButton(), '焦點留在按鈕上');
    assert.deepEqual(page.odds().map((row) => row.after), ['—', '—', '—']);
    assert.equal(page.toasts.length, 0);
});

test('按「復原」：放回剛才的盤面（9 張時空格不能點、連線框照樣在），按鈕變回「清空盤面」', () => {
    const page = createWondrousPage();
    page.place(0, 1, 2, 3, 4, 5, 8, 10, 12);
    const before = { placed: page.placed(), done: page.doneCells(), disabled: page.cells().map((c) => c.disabled === true) };
    page.clearButton().click();
    page.clearButton().click();
    assert.deepEqual(page.placed(), before.placed);
    assert.deepEqual(page.doneCells(), before.done);
    assert.deepEqual(page.cells().map((c) => c.disabled === true), before.disabled);
    assert.equal(page.clearButton().textContent, '清空盤面');
    assert.equal(page.toasts.length, 0);
});

test('清空之後貼了新的一格：不能再復原，按鈕變回「清空盤面」；再清空、復原的是新的盤面', () => {
    const page = createWondrousPage();
    page.place(0, 1);
    page.clearButton().click();
    page.place(7);
    assert.equal(page.clearButton().textContent, '清空盤面');
    assert.deepEqual(page.placed(), [7]);
    page.clearButton().click();
    page.clearButton().click();
    assert.deepEqual(page.placed(), [7]);
});

test('一張一張拿掉到空（不是按清空）：按鈕不能按', () => {
    const page = createWondrousPage();
    page.place(0);
    page.place(0);
    assert.equal(page.clearButton().textContent, '清空盤面');
    assert.equal(page.clearButton().disabled, true);
});

test('切換語言：兩種狀態的按鈕文字都換', () => {
    const page = createWondrousPage();
    page.place(0);
    page.setLang('en');
    assert.equal(page.clearButton().textContent, 'Clear board');
    page.clearButton().click();
    assert.equal(page.clearButton().textContent, 'Restore');
    page.setLang('ja');
    assert.equal(page.clearButton().textContent, '元に戻す');
    page.clearButton().click();
    assert.equal(page.clearButton().textContent, '盤面をクリア');
});

test('按鈕換成「復原」時寬度不變：#clear-btn 有 min-width: 7.5rem，放得下三種語言裡最長的「盤面をクリア」', () => {
    assert.match(cssRule('tools/wondrous-tails/style.css', '#clear-btn'), /min-width:\s*7\.5rem;/);
});
