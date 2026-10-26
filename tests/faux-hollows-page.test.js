const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHollowsPage } = require('./helpers/hollows-page.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const TRANSLATIONS = 'assets/js/i18n/translations/tools/faux-hollows-foxes.js';
const ALL = Array.from({ length: 36 }, (_, p) => p);
const LAYOUT0_OBSTACLES = [9, 13, 16, 28, 30];
// 元素用 === 比：assert.equal 失敗時會展開整份 fake-dom 而卡住（同 mini-cactpot-page.test.js）
const isSame = (actual, expected, message) => assert.ok(actual === expected, message);
// style.css 裡某個選擇器第一條規則的內容（同 wondrous-tails-page.test.js）
function cssRule(file, selector) {
    const css = read(file);
    const at = css.indexOf(`${selector} {`);
    assert.notEqual(at, -1, `${file} 找不到 ${selector}`);
    return css.slice(at, css.indexOf('}', at));
}
// style.css 裡某個 @media 區塊的內容（同 mini-cactpot-page.test.js：從 @media 數到和它成對的 }）
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

test('一打開：① 點遊戲裡被擋住的格子；36 格都是按鈕，格 1、11、24、34 不能點；不跳 toast', () => {
    const page = createHollowsPage();
    assert.equal(page.status(), '① 點遊戲裡被擋住的格子');
    assert.equal(page.cells().length, 36);
    assert.deepEqual(page.cells().map((c) => c.type), Array(36).fill('button'));
    assert.deepEqual(page.cells().map((c) => c.getAttribute('aria-label')), ALL.map((p) => `第 ${p + 1} 格`));
    assert.deepEqual(page.cells().map((c) => c.getAttribute('aria-pressed')), Array(36).fill('false'));
    assert.deepEqual(page.enabled(), ALL.filter((p) => ![1, 11, 24, 34].includes(p)));
    assert.deepEqual(page.obstacles(), []);
    assert.equal(page.toasts.length, 0);
});

test('標一格障礙物：已知 1／5，只剩可能是障礙物的格子能點；再點一次拿掉', () => {
    const page = createHollowsPage();
    page.tap(9);
    assert.equal(page.status(), '① 點遊戲裡被擋住的格子・已知 1／5');
    assert.deepEqual(page.obstacles(), [9]);
    assert.equal(page.cell(9).getAttribute('aria-pressed'), 'true');
    assert.equal(page.cell(9).getAttribute('aria-label'), '第 10 格：障礙物');
    assert.deepEqual(page.enabled(), [0, 9, 12, 13, 16, 20, 22, 23, 25, 27, 28, 30]);
    page.tap(9);
    assert.equal(page.status(), '① 點遊戲裡被擋住的格子');
    assert.deepEqual(page.obstacles(), []);
    assert.equal(page.enabled().length, 32);
});

test('自動補上：標 2 就補上 10（斜線、不能點、名稱寫自動補上）；拿掉 2，10 跟著消失', () => {
    const page = createHollowsPage();
    page.tap(2);
    assert.equal(page.status(), '① 點遊戲裡被擋住的格子・已知 2／5');
    assert.deepEqual(page.obstacles(), [2, 10]);
    assert.deepEqual(page.autoCells(), [10]);
    assert.equal(page.cell(10).disabled, true);
    assert.equal(page.cell(10).getAttribute('aria-label'), '第 11 格：障礙物（自動補上）');
    assert.deepEqual(page.enabled(), [2, 12, 19, 20, 27, 28, 31]);
    page.tap(2);
    assert.deepEqual(page.obstacles(), []);
    assert.deepEqual(page.autoCells(), []);
    assert.equal(page.cell(10).getAttribute('aria-label'), '第 11 格');
    assert.equal(page.status(), '① 點遊戲裡被擋住的格子');
});

test('擺法確定就進入翻格：② 找劍・剩 11 次；手動的 9、13 與自動補上的 16、28、30 都鎖住，不再是切換鈕', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    assert.equal(page.status(), '② 找劍・剩 11 次');
    assert.deepEqual(page.obstacles(), LAYOUT0_OBSTACLES);
    assert.deepEqual(page.autoCells(), [16, 28, 30]);
    assert.deepEqual(page.enabled(), ALL.filter((p) => !LAYOUT0_OBSTACLES.includes(p)));
    assert.deepEqual(page.cells().map((c) => c.getAttribute('aria-pressed')), Array(36).fill(null));
});

test('tapCell() 自己也擋（不靠格子的 disabled）：不可能是障礙物的格子、翻格階段的障礙物，直接呼叫也什麼都不變', () => {
    const page = createHollowsPage();
    page.app.tapCell(1);
    assert.deepEqual(page.obstacles(), []);
    page.tap(9);
    page.app.tapCell(2);   // 標了 9 之後 2 不可能是障礙物
    assert.deepEqual(page.obstacles(), [9]);
    page.tap(13);
    page.app.tapCell(9);   // 鎖住的障礙物
    page.app.tapCell(16);  // 自動補上的
    assert.deepEqual(page.obstacles(), LAYOUT0_OBSTACLES);
    assert.equal(page.status(), '② 找劍・剩 11 次');
});

test('用鍵盤：標障礙物時焦點留在同一格、同一個元素；標完第 2 個、那一格鎖住時焦點移到下一格 26', () => {
    const page = createHollowsPage();
    const nine = page.cell(9);
    nine.focus();
    nine.click();
    isSame(page.cell(9), nine, '還是同一個按鈕');
    isSame(page.document.activeElement, nine, '焦點還在這一格');
    page.cell(13).focus();
    page.cell(13).click();
    assert.equal(page.cell(13).disabled, true);
    isSame(page.document.activeElement, page.cell(26), '焦點移到下一格');
});

test('焦點所在的格子鎖住、而且沒有下一格（還在標障礙物）：焦點移到第一個能點的格子', () => {
    const page = createHollowsPage();
    page.cell(3).focus();   // 一打開 3 能標；Safari 點格子不給焦點，焦點留在原來那一格
    page.tap(9);            // 標了 9 之後 3 不可能是障礙物，跟著鎖住
    assert.equal(page.cell(3).disabled, true);
    isSame(page.document.activeElement, page.cell(0), '焦點移到第一個能點的格子');
});

test('切換語言：狀態列與格子名稱換成那個語言', () => {
    const page = createHollowsPage();
    page.tap(2);
    page.setLang('en');
    assert.equal(page.status(), '① Mark the blocked cells · 2/5 known');
    assert.equal(page.cell(2).getAttribute('aria-label'), 'Cell 3: Obstacle');
    assert.equal(page.cell(10).getAttribute('aria-label'), 'Cell 11: Obstacle (filled in)');
    page.setLang('ja');
    assert.equal(page.status(), '① ふさがれたマスをクリック・判明 2／5');
    assert.equal(page.cell(10).getAttribute('aria-label'), 'マス 11：障害物（自動）');
    page.tap(19);   // 2、19 → 只剩障礙物 2、10、12、19、27
    assert.equal(page.status(), '② 剣を探す・残り 11 回');
    page.setLang('en');
    assert.equal(page.status(), '② Find the sword · Clicks left: 11');
});

// 計畫〈例子〉審閱者的路線一直翻到次數用完：4、25、26、27、31、32、33、0、3、23、29 共 11 格
function spendAllClicks(page) {
    page.tap(9, 13);
    page.pick(4, 'chest');
    page.pick(25, 'sword');
    page.tap(26);           // 只剩劍
    page.pick(27, 'sword');
    page.pick(31, 'sword');
    page.tap(32, 33);       // 只剩 1 種盤面，32、33 只剩劍
    for (const p of [0, 3, 23, 29]) page.pick(p, 'empty');
}

test('翻格：點還沒翻的格子，在旁邊開小選單（劍／寶箱／宗長／空），不可能的是灰的；選了就標好、選單關掉、焦點回到格子', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.cell(25).click();
    const menu = page.menu();
    assert.ok(menu, '開了小選單');
    assert.equal(menu.getAttribute('role'), 'group');
    assert.equal(menu.getAttribute('aria-label'), '第 26 格翻到什麼');
    const options = [...menu.querySelectorAll('.cell-popover-option')];
    assert.deepEqual(options.map((o) => o.dataset.value), ['sword', 'chest', 'fox', 'empty']);
    assert.deepEqual(options.map((o) => o.textContent), ['⚔️ 劍', '📦 寶箱', '🦊 宗長', '空']);
    assert.deepEqual(options.map((o) => o.disabled === true), [false, false, true, false]);
    assert.deepEqual(options.map((o) => o.getAttribute('aria-pressed')), ['false', 'false', 'false', 'false']);
    page.option('sword').click();
    assert.equal(page.menu(), null);
    assert.equal(page.itemOf(25), 'sword');
    assert.equal(page.cell(25).textContent, '⚔️');
    assert.equal(page.cell(25).getAttribute('aria-label'), '第 26 格：劍');
    assert.equal(page.status(), '② 找劍・剩 10 次');
    isSame(page.document.activeElement, page.cell(25), '焦點回到格子');
    assert.equal(page.toasts.length, 0);
});

test('只有一種可能時點一下就標好、不開選單：25 是劍之後的 26；找到宗長（格 0）之後的格 3 只能是空', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(25, 'sword');
    page.tap(26);
    assert.equal(page.menu(), null);
    assert.equal(page.itemOf(26), 'sword');
    assert.equal(page.status(), '② 找劍・剩 9 次');

    const other = createHollowsPage();
    other.tap(9, 13);
    other.pick(0, 'fox');
    assert.equal(other.cell(0).textContent, '🦊');
    assert.equal(other.cell(0).getAttribute('aria-label'), '第 1 格：宗長');
    other.tap(3);
    assert.equal(other.menu(), null);
    assert.equal(other.itemOf(3), 'empty');
    // 翻開的空格畫 ✕：以前的「·」太小，和次數用完後鎖住的格子（淡灰、沒有記號）分不太出來
    assert.equal(other.cell(3).textContent, '✕');
    assert.equal(other.cell(3).getAttribute('aria-label'), '第 4 格：空');
});

test('宗長只有一隻：格 0 標成宗長之後，格 21 的選單裡宗長是灰的；清掉格 0，宗長又能選', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(0, 'fox');
    page.cell(21).click();
    assert.equal(page.option('fox').disabled, true);
    assert.deepEqual(['sword', 'chest', 'empty'].map((v) => page.option(v).disabled === true), [false, false, false]);
    page.pick(0, 'clear');
    page.cell(21).click();
    assert.equal(page.option('fox').disabled, false);
});

test('點已經翻開的格子：同一個選單、目前的標成已選，最後多一個「清除」；改了剩幾次不變，清掉就加回來', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(25, 'sword');
    page.cell(25).click();
    assert.equal(page.option('sword').getAttribute('aria-pressed'), 'true');
    assert.equal(page.option('sword').disabled, true);
    assert.equal(page.option('clear').textContent, '清除');
    assert.ok(page.option('clear').classList.contains('cell-popover-option-wide'));
    page.option('chest').click();
    assert.equal(page.itemOf(25), 'chest');
    assert.equal(page.cell(25).textContent, '📦');
    assert.equal(page.status(), '② 找劍・剩 10 次');
    page.pick(25, 'clear');
    assert.equal(page.itemOf(25), null);
    assert.equal(page.status(), '② 找劍・剩 11 次');
});

test('狀態列跟著目標換：劍翻完 → ③ 找寶箱；剩的次數不夠翻完寶箱 → ④ 翻宗長（不一定有）；宗長的位置全部翻開都是空的 → 完成', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(25, 'sword');
    page.tap(26);
    page.pick(27, 'sword');
    page.pick(31, 'sword');
    page.tap(32, 33);
    assert.equal(page.status(), '③ 找寶箱・剩 5 次');
    page.pick(0, 'empty');
    assert.equal(page.status(), '③ 找寶箱・剩 4 次');
    page.pick(3, 'empty');
    assert.equal(page.status(), '④ 翻宗長（不一定有）・剩 3 次');
    page.pick(23, 'empty');
    page.pick(29, 'empty');
    assert.equal(page.status(), '完成');
    // 「完成」但還有 1 次：還沒翻的格子照樣能點（我的決定 15）
    assert.equal(page.cell(1).disabled, false);
});

test('劍來不及翻完就跳到寶箱：翻開 1、2、6、7、8、12 都是空的（2、6、7、8 只剩空，點一下就標好）', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(1, 'empty');
    page.tap(2, 6, 7, 8);
    assert.deepEqual([2, 6, 7, 8].map((p) => page.itemOf(p)), ['empty', 'empty', 'empty', 'empty']);
    assert.equal(page.status(), '② 找劍・剩 6 次');
    page.pick(12, 'empty');
    assert.equal(page.status(), '③ 找寶箱・剩 5 次');
});

test('次數用完：完成；還沒翻的格子不能點、翻開的照樣能點；清掉一格又能點', () => {
    const page = createHollowsPage();
    spendAllClicks(page);
    assert.equal(page.status(), '完成');
    assert.equal(page.cell(4).getAttribute('aria-label'), '第 5 格：寶箱');
    assert.deepEqual(page.enabled(), [0, 3, 4, 23, 25, 26, 27, 29, 31, 32, 33]);
    page.pick(29, 'clear');
    assert.equal(page.status(), '④ 翻宗長（不一定有）・剩 1 次');
    assert.deepEqual(page.enabled(), ALL.filter((p) => !LAYOUT0_OBSTACLES.includes(p)));
});

test('choose()、tapCell() 自己也擋：不可能的選項、障礙物、清除還沒翻的格子、次數用完時還沒翻的格子，直接呼叫也什麼都不變', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.app.choose(3, 'sword');     // 格 3 不可能是劍
    page.app.choose(9, 'empty');     // 鎖住的障礙物
    page.app.choose(16, 'empty');    // 自動補上的
    page.app.choose(25, 'clear');    // 還沒翻的格子沒有東西可以清
    page.app.choose(25, 'bogus');    // 不是選項
    assert.deepEqual(ALL.filter((p) => page.itemOf(p) !== null), []);
    assert.equal(page.status(), '② 找劍・剩 11 次');

    const done = createHollowsPage();
    spendAllClicks(done);
    done.app.choose(1, 'empty');
    done.app.tapCell(1);
    assert.equal(done.itemOf(1), null);
    assert.equal(done.menu(), null);
    assert.equal(done.status(), '完成');
});

test('用鍵盤打開小選單：焦點在第一個能選的選項；Esc 關掉、焦點回到格子；選了也回到格子', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.cell(3).focus();
    page.keyboardOpen(3);
    isSame(page.document.activeElement, page.option('fox'), '第一個能選的是宗長（劍、寶箱是灰的）');
    page.key('Escape', page.option('fox'));
    assert.equal(page.menu(), null);
    isSame(page.document.activeElement, page.cell(3), 'Esc 之後焦點回到格子');
    page.keyboardOpen(3);
    page.option('empty').click();
    assert.equal(page.itemOf(3), 'empty');
    isSame(page.document.activeElement, page.cell(3), '選了之後焦點回到格子');
});

test('小選單的位置：上三列開在格子下方、下三列開在上方', () => {
    // 頁面替身沒有排版（每個值都是 0）：開在下方是 top 4px、上方是 -4px（同 mini-cactpot-page.test.js）
    const page = createHollowsPage();
    page.tap(9, 13);
    for (const [position, top] of [[1, '4px'], [14, '4px'], [18, '-4px'], [26, '-4px']]) {
        page.cell(position).click();
        assert.equal(page.menu().style.top, top, `第 ${position} 格`);
    }
});

test('切換語言：開著的小選單先關掉；之後打開的選單、狀態列與格子名稱換成那個語言', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.cell(25).click();
    page.setLang('en');
    assert.equal(page.menu(), null);
    assert.equal(page.status(), '② Find the sword · Clicks left: 11');
    page.cell(25).click();
    assert.equal(page.menu().getAttribute('aria-label'), 'What is under Cell 26');
    assert.deepEqual([...page.menu().querySelectorAll('.cell-popover-option')].map((o) => o.textContent),
        ['⚔️ Sword', '📦 Chest', '🦊 Fox', 'Empty']);
    page.option('sword').click();
    assert.equal(page.cell(25).getAttribute('aria-label'), 'Cell 26: Sword');
    page.setLang('ja');
    assert.equal(page.status(), '② 剣を探す・残り 10 回');
    assert.equal(page.cell(25).getAttribute('aria-label'), 'マス 26：剣');
});

test('頁面結構：拿掉提示、盤面資訊、重置／重做、機率與最佳策略的開關、結果卡、對話框與回到頂部；格子是 36 個按鈕；不再載入 state-history-manager.js、modal-manager.js', () => {
    const html = read('tools/faux-hollows-foxes/index.html');
    for (const gone of ['game-hint', 'game-info', 'remaining-clicks', 'matching-boards', 'reset-btn', 'redo-btn',
        'toggle-probabilities', 'auto-calculate', 'result-panel', 'cell-popup', 'back-to-top', 'btn-primary',
        'style="display: none', 'state-history-manager.js', 'modal-manager.js']) {
        assert.ok(!html.includes(gone), `index.html 不應該再有 ${gone}`);
    }
    assert.equal((html.match(/<button type="button" class="cell grid-cell" data-position="\d+" aria-label="第 \d+ 格"><\/button>/g) || []).length, 36);
    assert.match(html, /<p class="hollows-status" id="hollowsStatus" aria-live="polite">① 點遊戲裡被擋住的格子<\/p>/);
    const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(srcs.slice(-3), ['board-data.js', 'hollows-solver.js', 'script.js']);
});

test('版面：一欄、6 欄的盤面、格子是正方形；狀態列留兩行；障礙物不會被 :disabled 淡掉，自動補上的是斜線加虛線框；374px 以下格子間距 2px、359px 以下卡片內距 8px；手動標的障礙物在障礙物階段看得出能點', () => {
    const file = 'tools/faux-hollows-foxes/style.css';
    // 我的決定 14：手機上綠框格子要放得下「⚔️75%」這樣的一行
    assert.match(mediaBlock(file, '(max-width: 374px)'), /\.hollows-grid \{\s*gap:\s*2px;\s*\}/);
    assert.match(mediaBlock(file, '(max-width: 359px)'), /\.hollows-card \{\s*padding:\s*var\(--space-2\);\s*\}/);
    assert.match(cssRule(file, '.hollows-layout'), /max-width:\s*28rem;/);
    assert.match(cssRule(file, '.hollows-grid'), /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\);/);
    assert.match(cssRule(file, '.grid-cell'), /aspect-ratio:\s*1;/);
    assert.match(cssRule(file, '.grid-cell'), /gap:\s*0;/);
    assert.match(cssRule(file, '.hollows-status'), /box-sizing:\s*content-box;/);
    assert.match(cssRule(file, '.hollows-status'), /min-height:\s*calc\(2em \* var\(--leading-normal\)\);/);
    assert.match(cssRule(file, '.cell.is-obstacle'), /opacity:\s*1;/);
    assert.doesNotMatch(cssRule(file, '.cell.is-obstacle'), /box-shadow/);
    // 障礙物階段手動標的還能再點一次拿掉：沒有 disabled 時游標是手、hover 時框變主色（鎖住時維持 .cell.is-obstacle 的 cursor: default）
    assert.match(cssRule(file, '.cell.is-obstacle:not(:disabled)'), /cursor:\s*pointer;/);
    assert.match(cssRule(file, '.cell.is-obstacle:not(:disabled):hover'), /border-color:\s*var\(--color-primary\);/);
    assert.match(cssRule(file, '.cell.is-auto'), /repeating-linear-gradient\(/);
    assert.match(cssRule(file, '.cell.is-auto'), /dashed/);
});

test('版面：卡片 overflow: visible、盤面 position: relative（小選單掛在盤面裡）；翻開的格子底色照類型、不設 box-shadow', () => {
    const file = 'tools/faux-hollows-foxes/style.css';
    assert.match(cssRule(file, '.hollows-card'), /overflow:\s*visible;/);
    assert.match(cssRule(file, '.hollows-grid'), /position:\s*relative;/);
    assert.match(cssRule(file, '.grid-cell[aria-expanded="true"]'), /outline:/);
    for (const [selector, token] of [['.cell.is-sword', '--color-info-tint'], ['.cell.is-chest', '--color-danger-tint'],
        ['.cell.is-fox', '--color-warning-tint'], ['.cell.is-empty', '--color-surface-2']]) {
        assert.ok(cssRule(file, selector).includes(`var(${token})`), selector);
        assert.doesNotMatch(cssRule(file, selector), /box-shadow/, selector);
    }
});

test('不再用到的翻譯鍵三語都拿掉', () => {
    const removed = ['faux_hollows_hint', 'faux_hollows_remaining_clicks', 'faux_hollows_matching_boards', 'faux_hollows_boards_unit',
        'faux_hollows_reset', 'faux_hollows_redo', 'faux_hollows_hide_prob', 'faux_hollows_show_prob', 'faux_hollows_close_best',
        'faux_hollows_show_best', 'faux_hollows_popup_title', 'faux_hollows_popup_obstacle', 'faux_hollows_popup_cancel',
        'faux_hollows_result_title', 'faux_hollows_final_score', 'faux_hollows_score_unit', 'faux_hollows_back_to_top',
        'faux_hollows_obstacles_confirmed', 'faux_hollows_all_obstacles_confirmed', 'faux_hollows_auto_filled',
        'faux_hollows_max_clicks', 'faux_hollows_cannot_modify', 'faux_hollows_cell_occupied', 'faux_hollows_fox_limit',
        'faux_hollows_sword_limit', 'faux_hollows_chest_limit', 'faux_hollows_fox_error', 'faux_hollows_sword_error',
        'faux_hollows_sword_shape_error', 'faux_hollows_chest_error', 'faux_hollows_chest_shape_error', 'faux_hollows_cell_fox',
        'faux_hollows_fox_candidate', 'faux_hollows_cell_sword', 'faux_hollows_cell_chest', 'faux_hollows_cell_state_used',
        'faux_hollows_cell_state_unknown', 'faux_hollows_cell_obstacle_prob'];
    assert.equal(removed.length, 38);
    for (const lang of ['zh', 'en', 'ja']) {
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of removed) assert.ok(!keys.has(key), `${lang} 還有 ${key}`);
    }
});
