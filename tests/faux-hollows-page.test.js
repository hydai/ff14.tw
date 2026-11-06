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
    for (const p of ALL) {
        const label = page.cell(p).getAttribute('aria-label');
        if ([1, 11, 24, 34].includes(p)) assert.equal(label, `第 ${p + 1} 格`);
        else assert.match(label, new RegExp(`^第 ${p + 1} 格：障礙物 [0-9]+%$`));
    }
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
    assert.equal(page.cell(10).getAttribute('aria-label'), '第 11 格：障礙物 25%');
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

test('進入翻格：還沒翻的格子寫 ⚔️、📦 的整數百分比（帶 %，0 不寫），可能有宗長的只放 🦊；下一格 26 框綠色；障礙物沒有提示', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    assert.deepEqual(page.nextCells(), [26]);
    assert.deepEqual(page.hints(26), ['⚔️75%', '📦13%']);
    assert.deepEqual(page.hints(25), ['⚔️50%', '📦19%']);
    assert.deepEqual(page.hints(0), ['⚔️25%', '📦13%', '🦊']);
    assert.deepEqual(page.hints(1), ['⚔️25%', '📦31%']);
    assert.deepEqual(page.hints(15), ['⚔️13%', '📦13%']);
    assert.deepEqual(page.hints(3), ['🦊']);
    assert.deepEqual([9, 16].map((p) => page.hints(p)), [[], []]);
    // 圖示放在 .cell-hint-icon（只有一個提示時 CSS 讓它自己一行）；格子裡只有 .cell-hint
    assert.deepEqual([...page.cell(0).querySelectorAll('.cell-hint-icon')].map((s) => s.textContent), ['⚔️', '📦', '🦊']);
    assert.equal(page.cell(0).children.length, 3);
    assert.equal(page.cell(26).getAttribute('aria-label'), '第 27 格：劍 75%，寶箱 13%，建議翻這格');
    assert.equal(page.cell(0).getAttribute('aria-label'), '第 1 格：劍 25%，寶箱 13%，宗長有出現的話，可能在這格');
    assert.equal(page.cell(3).getAttribute('aria-label'), '第 4 格：宗長有出現的話，可能在這格');
    // 宗長的格子只有 🦊：格 3 的字裡沒有數字
    assert.doesNotMatch(page.cell(3).textContent, /\d/);
});

test('障礙物階段寫障礙物機率，不放寶物提示、不框下一格', () => {
    const page = createHollowsPage();
    page.tap(9);
    assert.deepEqual(ALL.flatMap((p) => page.hints(p)), []);
    assert.equal(page.cell(13).textContent, '33%');
    assert.equal(page.cell(13).getAttribute('aria-label'), '第 14 格：障礙物 33%');
    assert.equal(page.cell(9).textContent, '');
    assert.equal(page.cell(1).textContent, '');
    assert.deepEqual(page.nextCells(), []);
});

test('翻開的格子不寫提示；下一格跟著重算（25 是劍 → 26；改成寶箱 → 0、1、2、6、7、8 同分全部框起來）', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(25, 'sword');
    assert.deepEqual(page.hints(25), []);
    assert.deepEqual(page.nextCells(), [26]);
    page.pick(25, 'chest');
    assert.deepEqual(page.nextCells(), [0, 1, 2, 6, 7, 8]);
});

test('審閱者的例子：翻開 0、3、23 之後格 29 只有 🦊、沒有數字，下一格還是劍的 32、33；照建議翻完劍，④ 翻宗長、下一格 29', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(4, 'chest');
    page.pick(25, 'sword');
    page.tap(26);
    page.pick(27, 'sword');
    page.pick(31, 'sword');
    for (const p of [0, 3, 23]) page.pick(p, 'empty');
    assert.deepEqual(page.hints(29), ['🦊']);
    assert.doesNotMatch(page.cell(29).textContent, /\d/);
    assert.deepEqual(page.nextCells(), [32, 33]);
    assert.equal(page.status(), '② 找劍・剩 3 次');
    page.tap(32, 33);
    assert.equal(page.status(), '④ 翻宗長（不一定有）・剩 1 次');
    assert.deepEqual(page.nextCells(), [29]);
    assert.equal(page.cell(29).getAttribute('aria-label'), '第 30 格：宗長有出現的話，可能在這格，建議翻這格');
});

test('找到宗長（格 0）之後其他格都不放 🦊，下一格是劍的 26、27、32、33', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(0, 'fox');
    assert.ok(ALL.every((p) => !page.hints(p).includes('🦊')));
    assert.deepEqual(page.nextCells(), [26, 27, 32, 33]);
});

test('切換語言：格子名稱裡的提示換成那個語言，格子上的提示不變', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.setLang('en');
    assert.equal(page.cell(26).getAttribute('aria-label'), 'Cell 27: Sword 75%, Chest 13%, Suggested next');
    assert.equal(page.cell(3).getAttribute('aria-label'), 'Cell 4: The fox may be here if it appears');
    assert.deepEqual(page.hints(26), ['⚔️75%', '📦13%']);
    page.setLang('ja');
    assert.equal(page.cell(26).getAttribute('aria-label'), 'マス 27：剣 75%、宝箱 13%、次はこのマスがおすすめ');
    assert.equal(page.cell(3).getAttribute('aria-label'), 'マス 4：宗長が出るならこのマスかもしれない');
});

test('🦊 的說明改短成一句（三語）；提示的字小、不換行、行高 1.1；只有一個提示時圖示自己一行；359px 以下提示 11px', () => {
    assert.match(read('tools/faux-hollows-foxes/index.html'),
        /<p data-i18n="faux_hollows_candidate_note">🦊：宗長有出現的話，可能在這格<\/p>/);
    assert.equal(translationValues(TRANSLATIONS, 'zh').get('faux_hollows_candidate_note'), '🦊：宗長有出現的話，可能在這格');
    assert.equal(translationValues(TRANSLATIONS, 'en').get('faux_hollows_candidate_note'), '🦊: If the fox appears, it may be on this cell');
    assert.equal(translationValues(TRANSLATIONS, 'ja').get('faux_hollows_candidate_note'), '🦊：宗長が出るなら、このマスにいるかもしれません');
    const file = 'tools/faux-hollows-foxes/style.css';
    assert.match(cssRule(file, '.cell-hint'), /font-size:\s*var\(--text-xs\);/);
    assert.match(cssRule(file, '.cell-hint'), /white-space:\s*nowrap;/);
    assert.match(cssRule(file, '.cell-hint'), /line-height:\s*1\.1;/);
    // 我的決定 14：「⚔️100%」在 414px 以下的手機一行放不下，只有一個提示時圖示一行、百分比一行
    assert.match(cssRule(file, '.cell-hint:only-child .cell-hint-icon'), /display:\s*block;/);
    assert.match(mediaBlock(file, '(max-width: 359px)'), /\.cell-hint \{\s*font-size:\s*0\.6875rem;\s*\}/);
});

test('翻了好幾格之後回頭改早先的一格：選單只列還對得上的；清掉之後機率、🦊、下一格與剩幾次跟著重算', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(4, 'chest');
    page.pick(25, 'sword');
    page.tap(26);
    page.pick(27, 'sword');
    page.pick(31, 'sword');
    for (const p of [0, 3, 23]) page.pick(p, 'empty');
    assert.equal(page.status(), '② 找劍・剩 3 次');
    assert.deepEqual(page.hints(5), ['📦100%']);
    // 回頭點早先翻開的寶箱（格 4）：還對得上的只有寶箱（目前的值）與空，另外有「清除」
    page.cell(4).click();
    assert.deepEqual(['sword', 'chest', 'fox', 'empty', 'clear'].map((v) => page.option(v).disabled === true), [true, true, true, false, false]);
    page.option('clear').click();
    // 寶箱不再確定：剩 2 種盤面，寶箱可能在 4、5、10、11 或 14、15、20、21
    assert.equal(page.status(), '② 找劍・剩 4 次');
    assert.deepEqual(page.nextCells(), [32, 33]);
    assert.deepEqual([4, 5, 10, 11, 14, 15, 20, 21].map((p) => page.hints(p)), Array(8).fill(['📦50%']));
    // 再清掉早先翻開的空格（格 0）：🦊 回到格 0
    page.pick(0, 'clear');
    assert.equal(page.status(), '② 找劍・剩 5 次');
    assert.deepEqual(page.hints(0), ['🦊']);
    assert.deepEqual(page.hints(29), ['🦊']);
});

test('頁面結構：拿掉舊提示、盤面資訊、最佳策略的開關、結果卡、對話框與回到頂部；格子是 36 個按鈕；不再載入 state-history-manager.js、modal-manager.js', () => {
    const html = read('tools/faux-hollows-foxes/index.html');
    for (const gone of ['game-hint', 'game-info', 'remaining-clicks', 'matching-boards',
        'auto-calculate', 'result-panel', 'cell-popup', 'back-to-top', 'btn-primary',
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
        'faux_hollows_next', 'faux_hollows_undone_next', 'faux_hollows_close_best',
        'faux_hollows_show_best', 'faux_hollows_popup_title', 'faux_hollows_popup_obstacle', 'faux_hollows_popup_cancel',
        'faux_hollows_result_title', 'faux_hollows_final_score', 'faux_hollows_score_unit', 'faux_hollows_back_to_top',
        'faux_hollows_obstacles_confirmed', 'faux_hollows_all_obstacles_confirmed', 'faux_hollows_auto_filled',
        'faux_hollows_max_clicks', 'faux_hollows_cannot_modify', 'faux_hollows_cell_occupied', 'faux_hollows_fox_limit',
        'faux_hollows_sword_limit', 'faux_hollows_chest_limit', 'faux_hollows_fox_error', 'faux_hollows_sword_error',
        'faux_hollows_sword_shape_error', 'faux_hollows_chest_error', 'faux_hollows_chest_shape_error', 'faux_hollows_cell_fox',
        'faux_hollows_fox_candidate', 'faux_hollows_cell_sword', 'faux_hollows_cell_chest', 'faux_hollows_cell_state_used',
        'faux_hollows_cell_state_unknown', 'faux_hollows_cell_obstacle_prob'];
    assert.equal(removed.length, 36);
    for (const lang of ['zh', 'en', 'ja']) {
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of removed) assert.ok(!keys.has(key), `${lang} 還有 ${key}`);
    }
});

test('一打開：上一步、重做、重置遊戲都不能按（用 aria-disabled，不是 disabled）', () => {
    const page = createHollowsPage();
    assert.equal(page.$('undo-btn').getAttribute('aria-disabled'), 'true');
    assert.equal(page.$('reset-btn').getAttribute('aria-disabled'), 'true');
    assert.equal(page.$('undo-btn').disabled === true, false);
    assert.equal(page.$('redo-btn').getAttribute('aria-disabled'), 'true');
});

test('上一步退回上一個動作，toast 寫出退回了什麼：標障礙物、拿掉障礙物、翻開、改、清除', () => {
    const page = createHollowsPage();
    const undo = () => page.$('undo-btn').click();
    const last = () => page.toasts.at(-1);
    page.tap(9);
    undo();
    assert.deepEqual(last(), { message: '已退回：第 10 格標成障礙物', type: 'info' });
    assert.deepEqual(page.obstacles(), []);
    page.tap(9, 9);   // 標了又拿掉
    undo();
    assert.deepEqual(last(), { message: '已退回：清除第 10 格', type: 'info' });
    assert.deepEqual(page.obstacles(), [9]);
    page.tap(13);
    page.pick(25, 'sword');
    page.pick(25, 'chest');
    undo();
    assert.deepEqual(last(), { message: '已退回：第 26 格標成寶箱', type: 'info' });
    assert.equal(page.itemOf(25), 'sword');
    page.pick(25, 'clear');
    undo();
    assert.deepEqual(last(), { message: '已退回：清除第 26 格', type: 'info' });
    assert.equal(page.itemOf(25), 'sword');
    undo();
    assert.deepEqual(last(), { message: '已退回：第 26 格標成劍', type: 'info' });
    assert.equal(page.itemOf(25), null);
    assert.equal(page.status(), '② 找劍・剩 11 次');
});

test('上一步跨過進入翻格的那一步：回到障礙物階段，自動補上的跟著消失、障礙物又能點，小選單留下的 aria-expanded 拿掉', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.cell(25).click();   // 開著小選單
    page.$('undo-btn').click();
    assert.equal(page.menu(), null);
    assert.equal(page.toasts.at(-1).message, '已退回：第 14 格標成障礙物');
    assert.equal(page.status(), '① 點遊戲裡被擋住的格子・已知 1／5');
    assert.deepEqual(page.autoCells(), []);
    assert.deepEqual(page.obstacles(), [9]);
    assert.equal(page.cell(9).disabled === true, false);
    assert.equal(page.cell(9).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(ALL.filter((p) => page.cell(p).getAttribute('aria-expanded') !== null), []);
});

test('重置遊戲：清空盤面、不跳 toast；上一步整盤救回來；盤面是空的時按了什麼都不做', () => {
    const page = createHollowsPage();
    page.$('reset-btn').click();
    assert.equal(page.$('undo-btn').getAttribute('aria-disabled'), 'true');   // 沒有多一步
    page.tap(9, 13);
    page.pick(25, 'sword');
    assert.equal(page.$('reset-btn').getAttribute('aria-disabled'), 'false');
    const count = page.toasts.length;
    page.$('reset-btn').click();
    assert.equal(page.toasts.length, count);
    assert.equal(page.status(), '① 點遊戲裡被擋住的格子');
    assert.deepEqual(page.obstacles(), []);
    assert.equal(page.$('reset-btn').getAttribute('aria-disabled'), 'true');
    page.$('undo-btn').click();
    assert.equal(page.toasts.at(-1).message, '已退回：重置遊戲');
    assert.deepEqual(page.obstacles(), LAYOUT0_OBSTACLES);
    assert.equal(page.itemOf(25), 'sword');
    assert.equal(page.status(), '② 找劍・剩 10 次');
});

test('沒得退時按上一步：什麼都不變、不跳 toast，焦點留在按鈕上', () => {
    const page = createHollowsPage();
    const undo = page.$('undo-btn');
    undo.focus();
    undo.click();
    assert.equal(page.toasts.length, 0);
    isSame(page.document.activeElement, undo, '焦點留在按鈕上');
});

test('小選單開著時按重置遊戲：先把選單關掉', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.cell(25).click();
    page.$('reset-btn').click();
    assert.equal(page.menu(), null);
    assert.equal(page.status(), '① 點遊戲裡被擋住的格子');
});

// 上面是真的點按鈕，小選單也會被「點外面」的處理關掉，拿掉 resetGame() 裡的 close() 照樣過；
// 這兩個函式要自己先關掉選單，不靠「點外面」的處理（沒有 click 時，例如之後加了快速鍵），所以直接呼叫它們（同 mini-cactpot-page.test.js）
test('小選單開著時直接呼叫 undo()：函式自己先關掉選單', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.cell(25).click();
    assert.ok(page.menu() !== null, '先把小選單打開');
    page.app.undo();
    isSame(page.menu(), null, 'undo() 自己先關掉小選單');
});

test('小選單開著時直接呼叫 resetGame()（盤面上有東西）：函式自己先關掉選單', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.cell(25).click();
    assert.ok(page.menu() !== null, '先把小選單打開');
    page.app.resetGame();
    isSame(page.menu(), null, 'resetGame() 自己先關掉小選單');
});

test('切換語言：按鈕與之後的 toast 換字', () => {
    const page = createHollowsPage();
    page.setLang('en');
    assert.equal(page.$('undo-btn').textContent, 'Undo');
    assert.equal(page.$('reset-btn').textContent, 'Reset game');
    page.tap(9);
    page.$('undo-btn').click();
    assert.equal(page.toasts.at(-1).message, 'Undone: Obstacle on Cell 10');
    page.setLang('ja');
    assert.equal(page.$('reset-btn').textContent, 'ゲームをリセット');
    page.tap(9);
    page.$('reset-btn').click();
    page.$('undo-btn').click();
    assert.equal(page.toasts.at(-1).message, '元に戻しました：ゲームのリセット');
});

test('版面：上一步與重做並排、重置另放一行；不能按時是 aria-disabled 的樣子；頁面上沒有 .btn-primary', () => {
    const file = 'tools/faux-hollows-foxes/style.css';
    assert.match(cssRule(file, '.hollows-actions'), /grid-template-columns:\s*1fr 1fr;/);
    assert.match(cssRule(file, '.hollows-actions .btn[aria-disabled="true"]'), /opacity:\s*0\.55;/);
    const html = read('tools/faux-hollows-foxes/index.html');
    assert.match(html, /<button type="button" class="btn" id="undo-btn" data-i18n="faux_hollows_undo" aria-disabled="true">上一步<\/button>/);
    assert.match(html, /<button type="button" class="btn hollows-reset" id="reset-btn" data-i18n="faux_hollows_reset" aria-disabled="true">重置遊戲<\/button>/);
    assert.ok(!html.includes('btn-primary'));
});

test('隱藏機率只隱藏百分比：兩階段保留候選底色、圖示、結果與下一格；重做、重置不改顯示偏好', () => {
    const page = createHollowsPage();
    const toggle = page.$('toggle-probabilities');
    // 按鈕上的字寫按了會做什麼（隱藏機率／顯示機率），所以不是切換鈕、沒有 aria-pressed：
    // 不然機率顯示著時螢幕閱讀器會唸「隱藏機率，已按下」，聽起來像已經藏起來了
    assert.equal(toggle.hasAttribute('aria-pressed'), false);
    assert.equal(page.cell(9).textContent, '19%');
    toggle.click();
    assert.equal(toggle.textContent, '顯示機率');
    assert.equal(toggle.hasAttribute('aria-pressed'), false);
    assert.equal(page.cell(9).textContent, '');
    assert.equal(page.cell(9).getAttribute('aria-label'), '第 10 格：可能是障礙物');
    assert.equal(page.cell(9).classList.contains('has-obstacle-probability'), true);
    page.tap(9, 13);
    assert.deepEqual(page.hints(26), ['⚔️', '📦']);
    assert.deepEqual(page.hints(0), ['⚔️', '📦', '🦊']);
    assert.deepEqual(page.hints(3), ['🦊']);
    assert.deepEqual([...page.cell(0).querySelectorAll('.cell-hint')].map((e) => e.className),
        ['cell-hint hint-sword', 'cell-hint hint-chest', 'cell-hint hint-fox']);
    assert.equal(page.cell(26).getAttribute('aria-label'), '第 27 格：可能是劍，可能是寶箱，建議翻這格');
    for (const cell of page.cells()) {
        assert.doesNotMatch(cell.textContent, /%/);
        assert.doesNotMatch(cell.getAttribute('aria-label'), /%/);
    }
    assert.deepEqual(page.nextCells(), [26]);
    toggle.click();
    assert.deepEqual(page.hints(26), ['⚔️75%', '📦13%']);
    page.pick(25, 'sword');
    toggle.click();
    assert.equal(page.cell(25).textContent, '⚔️');
    assert.equal(page.cell(25).classList.contains('is-sword'), true);
    page.$('undo-btn').click();
    page.$('redo-btn').click();
    assert.deepEqual(page.hints(26), ['⚔️']);
    page.$('reset-btn').click();
    assert.equal(page.cell(9).textContent, '');
    assert.equal(page.cell(9).classList.contains('has-obstacle-probability'), true);
    toggle.click();
    assert.equal(page.cell(9).textContent, '19%');
});

test('重做跨過障礙物階段、翻格與清除，次數與選單選項都重算', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(0, 'fox');
    page.pick(0, 'clear');
    for (let i = 0; i < 3; i++) page.$('undo-btn').click();
    assert.equal(page.status(), '① 點遊戲裡被擋住的格子・已知 1／5');
    page.$('redo-btn').click();
    assert.deepEqual(page.autoCells(), [16, 28, 30]);
    page.$('redo-btn').click();
    assert.equal(page.itemOf(0), 'fox');
    assert.equal(page.status(), '② 找劍・剩 10 次');
    page.cell(21).click();
    assert.equal(page.option('fox').disabled, true);
    page.app.redo();
    assert.equal(page.menu(), null);
    assert.equal(page.itemOf(0), null);
    assert.equal(page.status(), '② 找劍・剩 11 次');
    assert.equal(page.$('redo-btn').getAttribute('aria-disabled'), 'true');
    page.cell(21).click();
    assert.equal(page.option('fox').disabled === true, false);
});

test('上一步之後的新動作清除重做分支；無效選擇與切換顯示不清除', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(25, 'sword');
    page.$('undo-btn').click();
    page.app.choose(25, 'fox'); // 這格不可能是宗長
    page.$('toggle-probabilities').click();
    assert.equal(page.$('redo-btn').getAttribute('aria-disabled'), 'false');
    page.pick(25, 'chest');
    assert.equal(page.$('redo-btn').getAttribute('aria-disabled'), 'true');
    page.app.redo();
    assert.equal(page.itemOf(25), 'chest');
});

test('重置可以上一步救回，再重做清空；空盤重置不會清掉重做歷史', () => {
    const page = createHollowsPage();
    page.tap(9, 13);
    page.pick(25, 'sword');
    page.$('reset-btn').click();
    page.$('undo-btn').click();
    assert.equal(page.itemOf(25), 'sword');
    page.$('redo-btn').click();
    assert.deepEqual(page.obstacles(), []);
    page.$('undo-btn').click();
    page.$('undo-btn').click();
    page.$('undo-btn').click();
    page.$('undo-btn').click();
    page.$('reset-btn').click();
    page.$('redo-btn').click();
    assert.deepEqual(page.obstacles(), [9]);
});

test('三語的機率切換、重做與重置文字隨目前狀態切換', () => {
    const page = createHollowsPage();
    page.$('toggle-probabilities').click();
    page.setLang('en');
    assert.equal(page.$('toggle-probabilities').textContent, 'Show probabilities');
    assert.equal(page.cell(9).getAttribute('aria-label'), 'Cell 10: May be Obstacle');
    assert.equal(page.$('redo-btn').textContent, 'Redo');
    assert.equal(page.$('reset-btn').textContent, 'Reset game');
    page.$('toggle-probabilities').click();
    assert.equal(page.cell(9).getAttribute('aria-label'), 'Cell 10: Obstacle 19%');
    page.setLang('ja');
    assert.equal(page.$('toggle-probabilities').textContent, '確率を隠す');
    assert.equal(page.$('redo-btn').textContent, 'やり直す');
    assert.equal(page.$('reset-btn').textContent, 'ゲームをリセット');
    assert.equal(page.cell(9).getAttribute('aria-label'), 'マス 10：障害物 19%');
    page.$('toggle-probabilities').click();
    assert.equal(page.cell(9).getAttribute('aria-label'), 'マス 10：障害物の候補');
});
