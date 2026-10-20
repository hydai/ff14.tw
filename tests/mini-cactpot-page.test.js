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

test('點格子：小數字盤開在盤面裡（不是對話框），九個數字都能選，狀態列不變', () => {
    const page = createCactpotPage();
    page.cell(0).click();
    const menu = page.menu();
    assert.ok(menu);
    assert.equal(menu.parentNode, page.$('extended-grid'));
    assert.equal(page.document.querySelector('[role="dialog"]'), null);
    assert.equal(menu.getAttribute('aria-label'), '左上的數字');
    const options = menu.querySelectorAll('.cell-popover-option');
    assert.deepEqual(options.map((b) => b.dataset.value), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    assert.deepEqual(options.map((b) => b.disabled === true), Array(9).fill(false));
    assert.equal(page.option('clear'), null);
    assert.equal(page.cell(0).getAttribute('aria-expanded'), 'true');
    assert.equal(page.status(), START);
});

test('填了左上 1：建議刮右上或左下，其他沒翻開的格子寫「平均」', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    assert.equal(page.menu(), null);
    assert.equal(page.cell(0).getAttribute('aria-expanded'), 'false');
    assert.equal(page.document.activeElement, page.cell(0));
    assert.equal(page.status(), '② 刮開【右上】或【左下】');
    assert.equal(page.$('cactpotStatus').children.length, 0);
    assert.deepEqual(page.suggestedCells(), [2, 6]);
    // 中央也顯示 1,678，但差了 0.25，不算同分（見 cactpot-solver 的測試）
    assert.deepEqual(page.cells().map((c) => c.textContent), ['1', '平均 1,619', '平均 1,678', '平均 1,619', '平均 1,678', '平均 1,534', '平均 1,678', '平均 1,534', '平均 1,635']);
    assert.equal(page.cell(0).getAttribute('aria-label'), '左上：1');
    assert.equal(page.cell(4).getAttribute('aria-label'), '中央：平均 1,678');
    assert.deepEqual(LINES.map((line) => page.badge(line).textContent), ARROWS);
});

test('其他格用掉的數字不能選', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    page.cell(4).click();
    assert.equal(page.option(1).disabled, true);
    assert.deepEqual([2, 3, 4, 5, 6, 7, 8, 9].map((n) => page.option(n).disabled === true), Array(8).fill(false));
});

test('中央 5：四個角一樣好，全部標出來，狀態列用「或」連起來', () => {
    const page = createCactpotPage();
    page.pick(4, 5);
    assert.equal(page.status(), '② 刮開【左上】或【右上】或【左下】或【右下】');
    assert.deepEqual(page.suggestedCells(), [0, 2, 6, 8]);
    assert.equal(page.cell(1).textContent, '平均 1,150');
});

test('點已經填好的格子可以改數字，改完馬上重算', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    page.cell(0).click();
    assert.equal(page.option(1).getAttribute('aria-pressed'), 'true');
    assert.equal(page.option(1).disabled, true);
    assert.equal(page.option('clear').textContent, '清除');
    assert.ok(page.option('clear').classList.contains('cell-popover-option-wide'));
    page.option(9).click();
    assert.equal(page.cell(0).textContent, '9');
    assert.equal(page.status(), '② 刮開【右上】或【中央】或【左下】');
    assert.equal(page.cell(2).textContent, '平均 1,518');
});

test('清除：回到還沒填的樣子', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    page.pick(0, 'clear');
    assert.equal(page.status(), START);
    assert.deepEqual(page.cells().map((c) => c.textContent), Array(9).fill('?'));
    assert.deepEqual(page.suggestedCells(), []);
});

test('填滿 4 格：狀態列寫選哪條線與平均 MGP，外圈寫每條線的平均，推薦的線和它的 3 格標綠色', () => {
    const page = createCactpotPage();
    page.fill({ 0: 7, 1: 1, 4: 2, 8: 3 });
    assert.equal(page.status(), '③ 選【左直行】・平均可拿 692 MGP');
    assert.deepEqual(LINES.map((line) => page.badge(line).textContent), ['97', '121', '134', '692', '295', '134', '108', '121']);
    // 外圈的膠囊照舊不唸；螢幕閱讀器唸狀態列下面看不到的清單，一條線一項，照橫列、直行、斜線的順序
    assert.deepEqual(LINES.map((line) => page.badge(line).getAttribute('aria-hidden')), Array(8).fill('true'));
    assert.equal(page.$('cactpotLineAverages').hidden, false);
    assert.deepEqual(page.$('cactpotLineAverages').querySelectorAll('li').map((item) => item.textContent), [
        '上橫列：平均 97', '中橫列：平均 121', '下橫列：平均 134', '左直行：平均 692',
        '中直行：平均 295', '右直行：平均 134', '左斜線：平均 108', '右斜線：平均 121'
    ]);
    assert.deepEqual(page.suggestedBadges(), [3]);
    assert.deepEqual(page.suggestedCells(), [0, 3, 6]);
    assert.deepEqual([2, 3, 5, 6, 7].map((p) => page.cell(p).textContent), Array(5).fill('?'));
    assert.deepEqual([2, 3, 5, 6, 7].map((p) => page.cell(p).disabled), Array(5).fill(true));
    assert.deepEqual([0, 1, 4, 8].map((p) => page.cell(p).disabled === true), Array(4).fill(false));
    page.cell(2).click();
    assert.equal(page.menu(), null);
    page.cell(0).click();
    assert.ok(page.option('clear'));
});

test('每條線平均的清單：看不到、在狀態列下面與盤面上面，不在 aria-live 的狀態列裡；一打開是藏起來的', () => {
    const html = read('tools/mini-cactpot/index.html');
    assert.match(html, /<ul class="visually-hidden" id="cactpotLineAverages" hidden><\/ul>/);
    assert.ok(html.indexOf('id="cactpotStatus"') < html.indexOf('id="cactpotLineAverages"'));
    assert.ok(html.indexOf('id="cactpotLineAverages"') < html.indexOf('id="extended-grid"'));
    const page = createCactpotPage();
    assert.equal(page.$('cactpotLineAverages').hidden, true);
    assert.equal(page.$('cactpotLineAverages').getAttribute('aria-live'), null);
    assert.ok(!page.$('cactpotStatus').contains(page.$('cactpotLineAverages')));
});

test('兩條線一樣好：都標出來，狀態列用「或」', () => {
    const page = createCactpotPage();
    page.fill({ 0: 1, 2: 2, 6: 3, 8: 4 });
    assert.equal(page.status(), '③ 選【中橫列】或【中直行】・平均可拿 862 MGP');
    assert.deepEqual(page.suggestedBadges(), [1, 4]);
    assert.deepEqual(page.suggestedCells(), [1, 3, 4, 5, 7]);
});

test('填滿後清掉一格：回到刮格的建議，外圈換回箭頭，沒翻開的格子又能點', () => {
    const page = createCactpotPage();
    page.fill({ 0: 7, 1: 1, 4: 2, 8: 3 });
    page.pick(8, 'clear');
    assert.match(page.status(), /^② 刮開【/);
    assert.deepEqual(LINES.map((line) => page.badge(line).textContent), ARROWS);
    assert.equal(page.$('cactpotLineAverages').hidden, true);
    assert.equal(page.$('cactpotLineAverages').querySelectorAll('li').length, 0);
    assert.deepEqual(page.suggestedBadges(), []);
    assert.deepEqual(page.cells().map((c) => c.disabled === true), Array(9).fill(false));
    assert.ok(page.suggestedCells().length > 0);
    assert.match(page.cell(8).textContent, /^平均 /);
});

test('小選單的位置：上兩列開在格子下方，最下面一列開在上方', () => {
    // 頁面替身沒有排版（每個值都是 0）：開在下方是 top 4px、上方是 -4px（place() 的算法見 cell-popover 的測試）
    const page = createCactpotPage();
    for (const [position, top] of [[1, '4px'], [4, '4px'], [7, '-4px']]) {
        page.cell(position).click();
        assert.equal(page.menu().style.top, top, `第 ${position} 格`);
    }
});

test('鍵盤打開小數字盤：焦點在第一個能選的數字，選完回到格子；Esc 關掉也回到格子', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    page.keyboardOpen(4);
    assert.equal(page.document.activeElement, page.option(2));
    page.option(2).click();
    assert.equal(page.cell(4).textContent, '2');
    assert.equal(page.document.activeElement, page.cell(4));
    page.keyboardOpen(5);
    page.key('Escape');
    assert.equal(page.menu(), null);
    assert.equal(page.document.activeElement, page.cell(5));
    assert.match(page.cell(5).textContent, /^平均 /);
});

test('點另一格就換到那一格；點盤面外面就關掉', () => {
    const page = createCactpotPage();
    page.cell(0).click();
    page.cell(1).click();
    assert.equal(page.$('extended-grid').querySelectorAll('.cell-popover').length, 1);
    assert.equal(page.cell(0).getAttribute('aria-expanded'), 'false');
    assert.equal(page.cell(1).getAttribute('aria-expanded'), 'true');
    page.$('cactpotStatus').click();
    assert.equal(page.menu(), null);
});

test('切換語言：小數字盤開著就先關掉，狀態列與格子換成那個語言', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    page.cell(4).click();
    page.setLang('en');
    assert.equal(page.menu(), null);
    assert.equal(page.status(), '② Scratch [Top Right] or [Bottom Left]');
    assert.equal(page.cell(4).textContent, 'avg 1,678');
    assert.equal(page.cell(2).getAttribute('aria-label'), 'Top Right: avg 1,678');
});

test('英文介面：選線的狀態列與小選單', () => {
    const page = createCactpotPage({ lang: 'en' });
    page.fill({ 0: 7, 1: 1, 4: 2, 8: 3 });
    assert.equal(page.status(), '③ Pick [Left Column] · avg 692 MGP');
    assert.deepEqual(page.$('cactpotLineAverages').querySelectorAll('li').map((item) => item.textContent), [
        'Top Row: avg 97', 'Middle Row: avg 121', 'Bottom Row: avg 134', 'Left Column: avg 692',
        'Middle Column: avg 295', 'Right Column: avg 134', 'Left Diagonal: avg 108', 'Right Diagonal: avg 121'
    ]);
    page.cell(0).click();
    assert.equal(page.menu().getAttribute('aria-label'), 'Number for Top Left');
    assert.equal(page.option('clear').textContent, 'Clear');
});

test('不會自動捲動', () => {
    const page = createCactpotPage();
    page.fill({ 0: 7, 1: 1, 4: 2, 8: 3 });
    assert.equal(page.scrolls.length, 0);
});

test('綠色的建議是共用的 .cell.suggested，寫在 :disabled 後面', () => {
    const css = read('assets/css/tools-common.css');
    assert.ok(css.indexOf('.cell.suggested {') > css.indexOf('.cell:disabled {'));
    assert.match(cssRule('assets/css/tools-common.css', '.cell.suggested'), /var\(--color-success\)/);
});
