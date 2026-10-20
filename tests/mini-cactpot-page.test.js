const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCactpotPage } = require('./helpers/cactpot-page.js');
const { translationKeySet } = require('./helpers/translation-parsers.js');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LINES = [0, 1, 2, 3, 4, 5, 6, 7];
const ARROWS = ['→', '→', '→', '↓', '↓', '↓', '↘', '↙'];
const POSITIONS = ['左上', '上中', '右上', '左中', '中央', '右中', '左下', '下中', '右下'];
const START = '① 點遊戲已經翻開的那一格';
// style.css 裡某個選擇器第一條規則的內容
function cssRule(file, selector) {
    const css = read(file);
    const at = css.indexOf(`${selector} {`);
    assert.notEqual(at, -1, `${file} 找不到 ${selector}`);
    return css.slice(at, css.indexOf('}', at));
}

test('一打開：狀態列寫第一步，九格都是「?」，外圈是選線的箭頭，兩顆按鈕不能按', () => {
    const page = createCactpotPage();
    assert.equal(page.status(), START);
    assert.equal(page.$('cactpotStatus').getAttribute('aria-live'), 'polite');
    assert.deepEqual(page.cells().map((c) => c.textContent), Array(9).fill('?'));
    assert.deepEqual(page.cells().map((c) => c.disabled === true), Array(9).fill(false));
    assert.deepEqual(page.cells().map((c) => c.getAttribute('aria-label')), POSITIONS);
    assert.deepEqual(LINES.map((line) => page.badge(line).textContent), ARROWS);
    assert.deepEqual(LINES.map((line) => page.badge(line).getAttribute('aria-hidden')), Array(8).fill('true'));
    assert.deepEqual(page.suggestedCells(), []);
    assert.equal(page.$('undo-btn').getAttribute('aria-disabled'), 'true');
    assert.equal(page.$('next-btn').getAttribute('aria-disabled'), 'true');
    assert.equal(page.$('undo-btn').textContent, '上一步');
    assert.equal(page.$('next-btn').textContent, '下一張');
});

test('切換語言：狀態列、格子名稱與按鈕換成那個語言', () => {
    const page = createCactpotPage();
    page.setLang('en');
    assert.equal(page.status(), '① Click the cell the game has already revealed');
    assert.equal(page.cell(4).getAttribute('aria-label'), 'Center');
    assert.equal(page.$('next-btn').textContent, 'Next ticket');
    assert.equal(createCactpotPage({ lang: 'ja' }).cell(1).getAttribute('aria-label'), '上中央');
});

test('頁面替身：disabled 的元素 click() 什麼都不做，元素有 getBoundingClientRect() 與記下呼叫的 scrollIntoView()', () => {
    const page = createCactpotPage();
    let clicks = 0;
    page.cell(0).addEventListener('click', () => { clicks += 1; });
    page.cell(0).disabled = true;
    page.cell(0).click();
    assert.equal(clicks, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(page.cell(0).getBoundingClientRect())), { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
    page.cell(1).scrollIntoView();
    assert.equal(page.scrolls.length, 1);
    assert.equal(page.scrolls[0], page.cell(1));
});

test('頁面結構：沒有蓋住盤面的對話框、說明段落、結果卡與「重做」；格子是按鈕', () => {
    const html = read('tools/mini-cactpot/index.html');
    for (const gone of ['number-popup', 'dialog-overlay', 'redo-btn', 'reset-btn', 'mini_cactpot_desc', 'best-choice-info', 'cell-recommendation-info', 'selected-count']) {
        assert.ok(!html.includes(gone), `index.html 不應該再有 ${gone}`);
    }
    assert.equal((html.match(/<button type="button" class="cell grid-cell" data-position="\d"/g) || []).length, 9);
    assert.equal((html.match(/class="line-badge[^"]*" data-line="\d" aria-hidden="true"/g) || []).length, 8);
});

test('腳本：載入小選單與期望值模組，不再載入復原紀錄與對話框管理', () => {
    const srcs = [...read('tools/mini-cactpot/index.html').matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    const at = (src) => srcs.indexOf(src);
    assert.notEqual(at('../../assets/js/cell-popover.js'), -1);
    assert.ok(at('../../assets/js/cell-popover.js') < at('cactpot-solver.js'));
    assert.ok(at('cactpot-solver.js') < at('script.js'));
    assert.equal(at('script.js'), srcs.length - 1);
    assert.equal(at('../../assets/js/state-history-manager.js'), -1);
    assert.equal(at('../../assets/js/modal-manager.js'), -1);
});

test('版面：格子大小不隨內容改變，狀態列留三行高，盤面是小選單的定位基準、卡片不切掉選單', () => {
    const file = 'tools/mini-cactpot/style.css';
    assert.match(cssRule(file, '.grid-cell'), /aspect-ratio:\s*1;/);
    assert.match(cssRule(file, '.grid-cell'), /min-width:\s*0;/);
    assert.match(cssRule(file, '.grid-cell'), /overflow:\s*hidden;/);
    assert.match(cssRule(file, '.extended-grid'), /position:\s*relative;/);
    assert.match(cssRule(file, '.cactpot-board'), /overflow:\s*visible;/);
    // 同分的名字用「或」接起來，手機上會折到第三行：min-height 只算文字的三行（content-box，padding 另外加），一到三行的狀態列一樣高
    assert.match(cssRule(file, '.cactpot-status'), /min-height:\s*calc\(3em \* var\(--leading-normal\)\);/);
    assert.match(cssRule(file, '.cactpot-status'), /box-sizing:\s*content-box;/);
});

test('不再用到的翻譯鍵三語都拿掉', () => {
    const removed = ['mini_cactpot_desc', 'mini_cactpot_selected', 'mini_cactpot_cells', 'mini_cactpot_redo', 'mini_cactpot_reset',
        'mini_cactpot_best_choice', 'mini_cactpot_expected_value', 'mini_cactpot_range', 'mini_cactpot_max_cells', 'mini_cactpot_number_used',
        'mini_cactpot_undone', 'mini_cactpot_reset_done', 'mini_cactpot_recommend_best_reveal', 'mini_cactpot_recommend_ev',
        'mini_cactpot_popup_title', 'mini_cactpot_popup_cancel', 'mini_cactpot_cell_label', 'mini_cactpot_cell_ev'];
    for (const lang of ['zh', 'en', 'ja']) {
        const keys = translationKeySet('assets/js/i18n/translations/tools/mini-cactpot.js', lang);
        for (const key of removed) assert.ok(!keys.has(key), `${lang} 還有 ${key}`);
    }
});
