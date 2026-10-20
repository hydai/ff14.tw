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
// 元素用 === 比：assert.equal 失敗時 test runner 會展開 actual／expected，fake-dom 的元素連著整份文件與 vm 的全域，
// 展開不完（測試卡住、吃光記憶體），所以只讓 assert 看到 true／false
const isSame = (actual, expected, message) => assert.ok(actual === expected, message);
// style.css 裡某個選擇器第一條規則的內容
function cssRule(file, selector) {
    const css = read(file);
    const at = css.indexOf(`${selector} {`);
    assert.notEqual(at, -1, `${file} 找不到 ${selector}`);
    return css.slice(at, css.indexOf('}', at));
}
// style.css 裡某個 @media 區塊的內容：從 @media 數到和它成對的 }（裡面有規則自己的 }，不能只切到第一個 }）
function mediaBlock(file, query) {
    const css = read(file);
    const at = css.indexOf(`@media ${query} {`);
    assert.notEqual(at, -1, `${file} 找不到 @media ${query}`);
    let depth = 0;
    for (let i = css.indexOf('{', at); i < css.length; i++) {
        if (css[i] === '{') depth += 1;
        if (css[i] === '}') depth -= 1;
        if (depth === 0) return css.slice(at, i + 1);
    }
    return assert.fail(`${file} 的 @media ${query} 沒有結尾`);
}
// 獎金表裡標了綠色（possible）的總和，由小到大
const possibleSums = (page) => page.payoutRows().filter((row) => row.classList.contains('possible')).map((row) => Number(row.dataset.sum));

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
    isSame(page.scrolls[0], page.cell(1), 'scrollIntoView() 記下的是呼叫它的那一格');
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

test('版面：格子大小不隨內容改變，狀態列留三行高（413px 以下的手機英文留四行），盤面是小選單的定位基準、卡片不切掉選單', () => {
    const file = 'tools/mini-cactpot/style.css';
    assert.match(cssRule(file, '.grid-cell'), /aspect-ratio:\s*1;/);
    assert.match(cssRule(file, '.grid-cell'), /min-width:\s*0;/);
    assert.match(cssRule(file, '.grid-cell'), /overflow:\s*hidden;/);
    assert.match(cssRule(file, '.extended-grid'), /position:\s*relative;/);
    assert.match(cssRule(file, '.cactpot-board'), /overflow:\s*visible;/);
    // 同分的名字用「或」接起來，手機上會折到第三行：min-height 只算文字的三行（content-box，padding 另外加），一到三行的狀態列一樣高
    assert.match(cssRule(file, '.cactpot-status'), /min-height:\s*calc\(3em \* var\(--leading-normal\)\);/);
    assert.match(cssRule(file, '.cactpot-status'), /box-sizing:\s*content-box;/);
    // 英文的名字比較長：413px 以下的手機，英文（<html lang="en">，I18nManager 在載入與每次切換語言時設定）多留一行，共四行
    assert.match(mediaBlock(file, '(max-width: 413px)'), /\.cactpot-status:lang\(en\)\s*\{[^}]*min-height:\s*calc\(4em \* var\(--leading-normal\)\);/);
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
    isSame(menu.parentNode, page.$('extended-grid'), '小選單掛在盤面裡');
    isSame(page.document.querySelector('[role="dialog"]'), null, '小選單不是對話框，頁面上沒有 role="dialog"');
    assert.equal(menu.getAttribute('aria-label'), '左上的數字');
    const options = menu.querySelectorAll('.cell-popover-option');
    assert.deepEqual(options.map((b) => b.dataset.value), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    assert.deepEqual(options.map((b) => b.disabled === true), Array(9).fill(false));
    isSame(page.option('clear'), null, '還沒填的格子沒有「清除」');
    assert.equal(page.cell(0).getAttribute('aria-expanded'), 'true');
    assert.equal(page.status(), START);
});

test('填了左上 1：建議刮右上或左下，其他沒翻開的格子寫「平均」', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    isSame(page.menu(), null, '選完數字小選單就關掉');
    assert.equal(page.cell(0).getAttribute('aria-expanded'), 'false');
    isSame(page.document.activeElement, page.cell(0), '選完焦點回到格子');
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
    isSame(page.menu(), null, '填滿後沒翻開的格子不能點，不開小選單');
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
    isSame(page.document.activeElement, page.option(2), '鍵盤打開後焦點在第一個能選的數字');
    page.option(2).click();
    assert.equal(page.cell(4).textContent, '2');
    isSame(page.document.activeElement, page.cell(4), '選完焦點回到格子');
    page.keyboardOpen(5);
    page.key('Escape');
    isSame(page.menu(), null, 'Esc 關掉小選單');
    isSame(page.document.activeElement, page.cell(5), 'Esc 之後焦點回到格子');
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
    isSame(page.menu(), null, '點盤面外面就關掉');
});

test('切換語言：小數字盤開著就先關掉，狀態列與格子換成那個語言', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    page.cell(4).click();
    page.setLang('en');
    isSame(page.menu(), null, '切換語言先關掉小選單');
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

test('獎金表一直顯示：19 列，總和 6–24 對 MGP，1,000 以上粗體', () => {
    const page = createCactpotPage();
    const rows = page.payoutRows();
    const sums = Array.from({ length: 19 }, (_, i) => String(i + 6));
    assert.deepEqual(rows.map((row) => row.dataset.sum), sums);
    assert.deepEqual(rows.map((row) => row.querySelector('dt').textContent), sums);
    assert.deepEqual(rows.map((row) => row.querySelector('dd').textContent), ['10,000', '36', '720', '360', '80', '252', '108', '72', '54', '180', '72', '180', '119', '36', '306', '1,080', '144', '1,800', '3,600']);
    assert.deepEqual(rows.filter((row) => row.classList.contains('big')).map((row) => row.dataset.sum), ['6', '21', '23', '24']);
    assert.deepEqual(possibleSums(page), []);
    assert.equal(page.$('payoutTitle').textContent, '三格總和 → MGP');
    // 不加圖例：獎金表那張卡只有標題與表
    assert.deepEqual(page.$('payoutTable').parentNode.children.map((child) => child.tagName), ['H2', 'DL']);
});

test('填滿 4 格時標出推薦的線還可能出現的總和，同分的線合起來', () => {
    const mixed = createCactpotPage();
    mixed.fill({ 0: 7, 1: 1, 4: 2, 8: 3 });
    assert.deepEqual(possibleSums(mixed), [16, 17, 18, 19, 20, 21, 22, 24]);
    const tie = createCactpotPage();
    tie.fill({ 0: 1, 2: 2, 6: 3, 8: 4 });
    assert.deepEqual(possibleSums(tie), [18, 19, 20, 21, 22, 23, 24]);
    const full = createCactpotPage();
    full.fill({ 0: 1, 1: 2, 2: 3, 4: 9 });
    assert.equal(full.status(), '③ 選【上橫列】・平均可拿 10,000 MGP');
    assert.deepEqual(possibleSums(full), [6]);
    full.pick(4, 'clear');
    assert.deepEqual(possibleSums(full), []);
});

test('獎金表的標題跟著語言', () => {
    const page = createCactpotPage();
    page.setLang('ja');
    assert.equal(page.$('payoutTitle').textContent, '3マスの合計 → MGP');
});

test('版面：手機獎金表在盤面下面，電腦（768px 以上）在盤面右邊，獎金表排成兩欄', () => {
    const html = read('tools/mini-cactpot/index.html');
    assert.ok(html.indexOf('cactpot-board') < html.indexOf('cactpot-payout'));
    const css = read('tools/mini-cactpot/style.css');
    const at = css.indexOf('@media (min-width: 768px)');
    assert.notEqual(at, -1);
    assert.match(css.slice(at), /\.cactpot-layout\s*\{[^}]*grid-template-columns:/);
    assert.match(cssRule('tools/mini-cactpot/style.css', '.payout-table'), /grid-auto-flow:\s*column;/);
});

test('上一步：退回上一個動作，toast 寫出退回了什麼', () => {
    const page = createCactpotPage();
    page.pick(2, 7);
    assert.equal(page.$('undo-btn').getAttribute('aria-disabled'), 'false');
    page.$('undo-btn').click();
    assert.deepEqual(page.toasts.at(-1), { message: '已退回：右上的 7', type: 'info' });
    assert.equal(page.cell(2).textContent, '?');
    assert.equal(page.status(), START);
    assert.equal(page.$('undo-btn').getAttribute('aria-disabled'), 'true');
});

test('改數字與清除也能退回', () => {
    const page = createCactpotPage();
    page.pick(2, 7);
    page.pick(2, 3);
    page.$('undo-btn').click();
    assert.equal(page.toasts.at(-1).message, '已退回：右上的 3');
    assert.equal(page.cell(2).textContent, '7');
    page.pick(2, 'clear');
    page.$('undo-btn').click();
    assert.equal(page.toasts.at(-1).message, '已退回：清除右上');
    assert.equal(page.cell(2).textContent, '7');
});

test('下一張：清空盤面、不跳 toast；按「上一步」救回來', () => {
    const page = createCactpotPage();
    page.fill({ 0: 7, 1: 1, 4: 2, 8: 3 });
    page.$('next-btn').click();
    assert.equal(page.toasts.length, 0);
    assert.deepEqual(page.cells().map((c) => c.textContent), Array(9).fill('?'));
    assert.equal(page.status(), START);
    assert.equal(page.$('next-btn').getAttribute('aria-disabled'), 'true');
    page.$('undo-btn').click();
    assert.equal(page.toasts.at(-1).message, '已退回：下一張');
    assert.equal(page.status(), '③ 選【左直行】・平均可拿 692 MGP');
    assert.deepEqual([0, 1, 4, 8].map((p) => page.cell(p).textContent), ['7', '1', '2', '3']);
});

test('一直按「上一步」：一步一步退回，沒得退時按鈕變灰、焦點留在按鈕上', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    page.$('next-btn').click();
    page.$('undo-btn').focus();
    page.$('undo-btn').click();
    assert.equal(page.status(), '② 刮開【右上】或【左下】');
    page.$('undo-btn').click();
    assert.equal(page.status(), START);
    assert.equal(page.$('undo-btn').getAttribute('aria-disabled'), 'true');
    isSame(page.document.activeElement, page.$('undo-btn'), '沒得退時按鈕變灰，焦點還在按鈕上');
    page.$('undo-btn').click();
    assert.equal(page.toasts.length, 2);
    assert.equal(page.status(), START);
});

test('空的盤面按「下一張」：什麼都不做，「上一步」不多一步', () => {
    const page = createCactpotPage();
    page.$('next-btn').click();
    assert.equal(page.$('undo-btn').getAttribute('aria-disabled'), 'true');
    assert.equal(page.toasts.length, 0);
});

test('小數字盤開著時按「上一步」「下一張」：先關掉選單', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    page.cell(4).click();
    page.$('undo-btn').click();
    isSame(page.menu(), null, '按「上一步」先關掉小選單');
    page.pick(0, 1);
    page.cell(4).click();
    page.$('next-btn').click();
    isSame(page.menu(), null, '按「下一張」先關掉小選單');
});

// 上面兩個是真的點按鈕，小選單也會被「點外面」的處理關掉，拿掉 undo()、nextTicket() 裡的 close() 照樣過；
// 這兩個函式要自己先關掉選單，不靠「點外面」的處理（例如之後加了快速鍵，就沒有 click），所以直接呼叫它們
test('小數字盤開著時直接呼叫 undo()：函式自己先關掉選單', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    page.cell(4).click();
    assert.ok(page.menu() !== null, '先把小選單打開');
    page.app.undo();
    isSame(page.menu(), null, 'undo() 自己先關掉小選單');
});

test('小數字盤開著時直接呼叫 nextTicket()（盤面上有數字）：函式自己先關掉選單', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    page.cell(4).click();
    assert.ok(page.menu() !== null, '先把小選單打開');
    page.app.nextTicket();
    isSame(page.menu(), null, 'nextTicket() 自己先關掉小選單');
});

test('焦點在格子上直接按 1–9 就填入，不用開選單', () => {
    const page = createCactpotPage();
    page.cell(4).focus();
    const event = page.key('5');
    assert.equal(event.defaultPrevented, true, '填進去的按鍵 preventDefault');
    assert.equal(page.cell(4).textContent, '5');
    isSame(page.menu(), null, '直接按數字鍵不開小選單');
    isSame(page.document.activeElement, page.cell(4), '焦點還在格子上');
    assert.equal(page.status(), '② 刮開【左上】或【右上】或【左下】或【右下】');
});

test('小數字盤開著時按 1–9：填進那一格、關掉選單，焦點回到格子', () => {
    const page = createCactpotPage();
    page.keyboardOpen(0);
    isSame(page.document.activeElement, page.option(1), '鍵盤打開後焦點在第一個能選的數字');
    const event = page.key('3');
    assert.equal(event.defaultPrevented, true, '填進去的按鍵 preventDefault');
    assert.equal(page.cell(0).textContent, '3');
    isSame(page.menu(), null, '按數字鍵填入後小選單關掉');
    isSame(page.document.activeElement, page.cell(0), '填入後焦點回到格子');
});

test('滑鼠打開小數字盤後按 Tab 到另一格再按數字（Chrome）：小數字盤跟著關掉，數字填進焦點所在的那一格', () => {
    const page = createCactpotPage();
    // Chrome 點按鈕會給它焦點；fake-dom 的 click() 不會移動焦點，所以自己 focus()
    page.cell(0).focus();
    page.cell(0).click();
    assert.ok(page.menu() !== null, '小選單開在左上');
    page.cell(1).focus();
    isSame(page.menu(), null, '焦點離開左上，小選單跟著關掉');
    const event = page.key('7');
    assert.equal(event.defaultPrevented, true, '填進去的按鍵 preventDefault');
    assert.equal(page.cell(1).textContent, '7', '填進焦點所在的上中');
    assert.match(page.cell(0).textContent, /^平均 /, '不是小選單原本開給的左上：左上還沒填，寫的是平均');
    isSame(page.document.activeElement, page.cell(1), '焦點留在上中，沒有跳回左上');
});

test('Safari：左上從沒有過焦點，沒有 focusout 可以關掉小選單；焦點移到另一格再按數字，先關掉小選單，數字填進焦點所在的那一格', () => {
    const page = createCactpotPage();
    page.cell(0).click();   // Safari 點按鈕不給焦點
    page.cell(1).focus();
    assert.ok(page.menu() !== null, '左上沒有焦點可以失去，小選單還開著');
    const event = page.key('7', page.cell(1));
    assert.equal(event.defaultPrevented, true, '填進去的按鍵 preventDefault');
    assert.equal(page.cell(1).textContent, '7', '填進焦點所在的上中');
    assert.match(page.cell(0).textContent, /^平均 /, '不是小選單開給的左上：左上還沒填，寫的是平均');
    isSame(page.menu(), null, '填入前先關掉開在左上的小選單');
    assert.equal(page.cell(0).getAttribute('aria-expanded'), 'false');
    isSame(page.document.activeElement, page.cell(1), '焦點留在上中，沒有跳回左上');
});

test('小數字盤開在焦點所在的那一格（滑鼠點下去）時按數字：填進這一格、關掉選單，焦點留在這一格', () => {
    const page = createCactpotPage();
    page.cell(0).focus();
    page.cell(0).click();
    assert.ok(page.menu() !== null, '小選單開在左上');
    const event = page.key('3');
    assert.equal(event.defaultPrevented, true, '填進去的按鍵 preventDefault');
    assert.equal(page.cell(0).textContent, '3');
    isSame(page.menu(), null, '按數字鍵填入後小選單關掉');
    isSame(page.document.activeElement, page.cell(0), '焦點還在左上');
});

test('小數字盤開著而焦點不在任何格子上（Safari 點格子不給焦點）：數字填進小選單開給的那一格，焦點回到那一格', () => {
    const page = createCactpotPage();
    page.cell(0).click();
    isSame(page.document.activeElement, page.document.body, '焦點不在格子上');
    page.key('3');   // 按鍵的目標是 body
    assert.equal(page.cell(0).textContent, '3');
    isSame(page.menu(), null, '填入後小選單關掉');
    isSame(page.document.activeElement, page.cell(0), '焦點回到小選單開給的那一格');
    // 按鍵的目標是 document（沒有 closest）：開著小選單時照樣填進它開給的那一格，沒開時什麼都不做、不丟例外
    page.cell(4).click();
    page.key('5', page.document);
    assert.equal(page.cell(4).textContent, '5');
    isSame(page.menu(), null, '填入後小選單關掉');
    const before = page.cells().map((c) => c.textContent);
    assert.equal(page.key('6', page.document).defaultPrevented, false);
    assert.deepEqual(page.cells().map((c) => c.textContent), before);
});

test('按到不能填的數字：什麼都不變、不跳 toast、「上一步」不多一步、不擋瀏覽器原本的行為', () => {
    const page = createCactpotPage();
    page.pick(0, 1);
    const before = page.cells().map((c) => c.textContent);
    const ignored = [];
    page.cell(4).focus();
    ignored.push(page.key('1'));                                   // 左上已經用了 1
    ignored.push(page.key('5', page.cell(4), { ctrlKey: true }));  // 按著 Ctrl
    ignored.push(page.key('5', page.cell(4), { metaKey: true }));  // 按著 ⌘
    ignored.push(page.key('5', page.cell(4), { altKey: true }));   // 按著 Alt
    ignored.push(page.key('0'));                                   // 不是 1–9
    page.cell(0).focus();
    ignored.push(page.key('1'));                                   // 這一格目前就是 1
    page.$('undo-btn').focus();
    ignored.push(page.key('5'));                                   // 焦點不在格子上
    assert.deepEqual(page.cells().map((c) => c.textContent), before);
    // 七個按鍵都沒有 preventDefault：瀏覽器與系統的快速鍵（Ctrl／⌘／Alt 加數字）和一般的按鍵照常運作
    assert.deepEqual(ignored.map((event) => event.defaultPrevented), Array(7).fill(false));
    assert.equal(page.toasts.length, 0);
    page.$('undo-btn').click();
    assert.equal(page.status(), START);
    assert.equal(page.$('undo-btn').getAttribute('aria-disabled'), 'true');
});

test('填滿後沒翻開的格子按數字也不能填：不跳 toast、「上一步」不多一步', () => {
    const page = createCactpotPage();
    page.fill({ 0: 7, 1: 1, 4: 2, 8: 3 });
    page.cell(2).focus();
    assert.equal(page.key('4').defaultPrevented, false, '不擋瀏覽器原本的行為');
    assert.equal(page.cell(2).textContent, '?');
    assert.equal(page.status(), '③ 選【左直行】・平均可拿 692 MGP');
    assert.equal(page.toasts.length, 0);
    // 上一步退回的是最後填的右下：按數字沒有多存一步
    page.$('undo-btn').click();
    assert.equal(page.toasts.at(-1).message, '已退回：右下的 3');
});

test('切換語言之後，上一步的 toast 用新的語言', () => {
    const page = createCactpotPage();
    page.setLang('en');
    page.pick(2, 7);
    page.$('undo-btn').click();
    assert.equal(page.toasts.at(-1).message, 'Undone: 7 in Top Right');
});
