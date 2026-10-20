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
