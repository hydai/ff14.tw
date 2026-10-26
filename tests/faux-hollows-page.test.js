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
