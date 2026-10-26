const test = require('node:test');
const assert = require('node:assert/strict');
const { createHollowsPage } = require('./helpers/hollows-page.js');

// 設計 6.4：宗長多常出現沒有公開，「假設這局有宗長」的機率又會隨翻開的空格一路加到 100%，所以宗長的格子只放 🦊、不寫任何數字。
// 2026-09-08 檢查第 9 項：以前只剩 1 種盤面時，4 個宗長位置會同時寫 100%；這份測試守住它不會回來。
// 計畫〈例子〉審閱者的例子：擺法 0＋寶箱 4、劍 25、26、27、31，只剩 1 種盤面，宗長的位置是 0、3、23、29
function reviewerBoard(lang = 'zh') {
    const page = createHollowsPage({ lang });
    page.tap(9, 13);
    page.pick(4, 'chest');
    page.pick(25, 'sword');
    page.tap(26);
    page.pick(27, 'sword');
    page.pick(31, 'sword');
    return page;
}
const ALL = Array.from({ length: 36 }, (_, p) => p);
const FOX = [0, 3, 23, 29];
const foxCells = (page) => ALL.filter((p) => page.hints(p).includes('🦊'));

test('只剩 1 種盤面時，4 個宗長的位置只放 🦊：不寫成 100%、不寫任何數字，名稱也沒有百分比', () => {
    const page = reviewerBoard();
    assert.deepEqual(foxCells(page), FOX);
    for (const p of FOX) {
        assert.deepEqual(page.hints(p), ['🦊'], `格 ${p}`);
        assert.doesNotMatch(page.cell(p).textContent, /\d/, `格 ${p}`);
        assert.doesNotMatch(page.cell(p).getAttribute('aria-label'), /%/, `格 ${p}`);
        assert.match(page.cell(p).getAttribute('aria-label'), /宗長有出現的話，可能在這格/, `格 ${p}`);
    }
    // 劍與寶箱確定的格子照實寫 100%；這種格子只有這一個提示
    assert.deepEqual(page.hints(5), ['📦100%']);
    assert.deepEqual(page.hints(32), ['⚔️100%']);
    assert.equal(page.cell(5).children.length, 1);
});

test('找到宗長之後其他格不再放 🦊；三語重畫照樣是 🦊、名稱照語言', () => {
    for (const [lang, phrase] of [['zh', '宗長有出現的話，可能在這格'], ['en', 'The fox may be here if it appears'], ['ja', '宗長が出るならこのマスかもしれない']]) {
        const page = reviewerBoard(lang);
        assert.deepEqual(page.hints(3), ['🦊'], lang);
        assert.ok(page.cell(3).getAttribute('aria-label').includes(phrase), lang);
        page.pick(0, 'fox');
        assert.deepEqual(foxCells(page), [], lang);
    }
});

test('清掉宗長的格子：🦊 回到其他還可能的格子', () => {
    const page = reviewerBoard();
    page.pick(0, 'fox');
    page.pick(0, 'clear');
    assert.deepEqual(foxCells(page), FOX);
});

test('上一步退回找到宗長：🦊 回到原本的 4 格', () => {
    const page = reviewerBoard();
    page.pick(0, 'fox');
    page.$('undo-btn').click();
    assert.equal(page.toasts.at(-1).message, '已退回：第 1 格標成宗長');
    assert.deepEqual(foxCells(page), FOX);
});
