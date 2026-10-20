const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeDom } = require('./helpers/fake-dom.js');

const ZERO = { left: 0, top: 0, width: 0, height: 0 };
const plain = (value) => JSON.parse(JSON.stringify(value));
// 元素用 === 比：assert.equal 失敗時 test runner 會展開 actual／expected，fake-dom 的元素連著整份文件與 vm 的全域，
// 展開不完（測試卡住、吃光記憶體），所以只讓 assert 看到 true／false
const isSame = (actual, expected, message) => assert.ok(actual === expected, message);
const OPTIONS = [
    { value: 1, label: '1', current: false },
    { value: 2, label: '2', current: true },
    { value: 3, label: '3', current: false, disabled: true },
    { value: 4, label: '4', current: false },
    { value: 'clear', label: '清除', wide: true }
];

// 三格的小盤面加上盤面外的一顆按鈕。fake-dom 沒有排版，每個元素的 getBoundingClientRect() 都是 0
function setup() {
    const dom = createFakeDom();
    const createElement = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => {
        const element = createElement(tag);
        element.getBoundingClientRect = () => ZERO;
        return element;
    };
    dom.load('assets/js/cell-popover.js');
    const board = dom.el('div', { id: 'board' });
    const cells = [0, 1, 2].map((i) => board.appendChild(dom.el('button', { type: 'button', 'data-cell': String(i) }, '?')));
    const outside = dom.el('button', { type: 'button', id: 'outside' }, '外面');
    dom.document.body.appendChild(board);
    dom.document.body.appendChild(outside);
    const popover = new dom.window.CellPopover({ board, columns: 3 });
    const options = () => board.querySelectorAll('.cell-popover-option');
    const optionOf = (value) => board.querySelector(`[data-value="${value}"]`);
    return { dom, document: dom.document, board, cells, outside, popover, options, optionOf };
}

test('place()：開在格子下方或上方，水平置中在格子上', () => {
    const { place } = setup().dom.window.CellPopover;
    const board = { left: 0, top: 0, width: 300, height: 300 };
    const menu = { left: 0, top: 0, width: 120, height: 150 };
    assert.deepEqual(plain(place({ cell: { left: 100, top: 50, width: 60, height: 60 }, board, menu, placement: 'below' })), { left: 70, top: 114 });
    assert.deepEqual(plain(place({ cell: { left: 100, top: 200, width: 60, height: 60 }, board, menu, placement: 'above' })), { left: 70, top: 46 });
});

test('place()：左右不超出盤面，盤面不在原點時算相對位置', () => {
    const { place } = setup().dom.window.CellPopover;
    const board = { left: 0, top: 0, width: 300, height: 300 };
    const menu = { left: 0, top: 0, width: 120, height: 150 };
    assert.equal(place({ cell: { left: 0, top: 0, width: 60, height: 60 }, board, menu, placement: 'below' }).left, 0);
    assert.equal(place({ cell: { left: 260, top: 0, width: 40, height: 40 }, board, menu, placement: 'below' }).left, 180);
    assert.deepEqual(plain(place({ cell: { left: 140, top: 60, width: 60, height: 60 }, board: { left: 20, top: 10, width: 300, height: 300 }, menu, placement: 'below' })), { left: 90, top: 114 });
    // 盤面比選單窄：貼齊盤面左邊
    assert.equal(place({ cell: { left: 10, top: 0, width: 40, height: 40 }, board: { left: 0, top: 0, width: 100, height: 100 }, menu, placement: 'below' }).left, 0);
});

test('open()：選單掛在盤面裡、照順序列出選項；不能選的與目前的值 disabled，目前的值 aria-pressed', () => {
    const { document, board, cells, popover, options } = setup();
    popover.open(cells[0], OPTIONS, { label: '左上的數字', onSelect() {} });
    const menu = board.querySelector('.cell-popover');
    isSame(menu.parentNode, board, '選單掛在盤面裡');
    assert.ok(menu.classList.contains('cell-popover-cols-3'));
    assert.equal(menu.getAttribute('role'), 'group');
    assert.equal(menu.getAttribute('aria-label'), '左上的數字');
    assert.equal(menu.getAttribute('aria-modal'), null);
    const buttons = options();
    assert.deepEqual(buttons.map((b) => b.dataset.value), ['1', '2', '3', '4', 'clear']);
    assert.deepEqual(buttons.map((b) => b.textContent), ['1', '2', '3', '4', '清除']);
    assert.deepEqual(buttons.map((b) => b.type), ['button', 'button', 'button', 'button', 'button']);
    assert.deepEqual(buttons.map((b) => b.disabled === true), [false, true, true, false, false]);
    assert.deepEqual(buttons.map((b) => b.getAttribute('aria-pressed')), ['false', 'true', 'false', 'false', null]);
    assert.ok(buttons[4].classList.contains('cell-popover-option-wide'));
    assert.equal(cells[0].getAttribute('aria-expanded'), 'true');
    assert.equal(popover.isOpen, true);
    isSame(popover.anchor, cells[0], 'anchor 是被點的那一格');
    // 不是對話框：不鎖捲動、不把其他地方設成 inert
    assert.equal(document.body.style.overflow, undefined);
    assert.equal(document.querySelectorAll('[inert]').length, 0);
});

test('open()：用 place() 的結果設選單的位置', () => {
    const { board, cells, popover } = setup();
    board.getBoundingClientRect = () => ({ left: 20, top: 10, width: 300, height: 300 });
    cells[1].getBoundingClientRect = () => ({ left: 140, top: 60, width: 60, height: 60 });
    popover.open(cells[1], OPTIONS, { onSelect() {} });
    assert.equal(board.querySelector('.cell-popover').style.left, '150px');
    assert.equal(board.querySelector('.cell-popover').style.top, '114px');
    popover.open(cells[1], OPTIONS, { onSelect() {}, placement: 'above' });
    assert.equal(board.querySelector('.cell-popover').style.top, '46px');
});

// 視窗大小改變（手機轉向、視窗變窄或變寬）時，瀏覽器在 window 上送 resize
const windowResize = (dom) => dom.window.dispatchEvent(new dom.window.Event('resize'));

test('視窗大小改變（手機轉向、視窗變窄或變寬）：選單照那一格的新位置重新放好，開在上方的照樣開在上方', () => {
    const { dom, board, cells, popover } = setup();
    board.getBoundingClientRect = () => ({ left: 20, top: 10, width: 300, height: 300 });
    cells[1].getBoundingClientRect = () => ({ left: 140, top: 60, width: 60, height: 60 });
    popover.open(cells[1], OPTIONS, { onSelect() {} });
    const below = board.querySelector('.cell-popover');
    // 手機轉成橫向：盤面變寬，格子跟著變大、往右下移
    board.getBoundingClientRect = () => ({ left: 20, top: 10, width: 400, height: 400 });
    cells[1].getBoundingClientRect = () => ({ left: 180, top: 80, width: 80, height: 80 });
    windowResize(dom);
    assert.equal(below.style.left, '200px');
    assert.equal(below.style.top, '154px');
    assert.equal(popover.isOpen, true);

    popover.open(cells[1], OPTIONS, { onSelect() {}, placement: 'above' });
    const above = board.querySelector('.cell-popover');
    assert.equal(above.style.top, '66px');
    // 再轉回直向
    board.getBoundingClientRect = () => ({ left: 20, top: 10, width: 300, height: 300 });
    cells[1].getBoundingClientRect = () => ({ left: 140, top: 60, width: 60, height: 60 });
    windowResize(dom);
    assert.equal(above.style.left, '150px');
    assert.equal(above.style.top, '46px');
});

test('視窗大小改變時先拿掉舊的位置再量選單：absolute 的選單離左邊越遠、能用的寬度越窄，不先拿掉會量到變窄的寬度', () => {
    const { dom, board, cells, popover } = setup();
    board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 300 });
    cells[2].getBoundingClientRect = () => ({ left: 240, top: 0, width: 60, height: 60 });
    popover.open(cells[2], OPTIONS, { onSelect() {} });
    const menu = board.querySelector('.cell-popover');
    // 模擬瀏覽器：設了 left 時選單被擠成 60px 寬，沒設時是原本的 120px
    menu.getBoundingClientRect = () => ({ left: 0, top: 0, width: menu.style.left ? 60 : 120, height: 150 });
    board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 250, height: 250 });
    cells[2].getBoundingClientRect = () => ({ left: 200, top: 0, width: 50, height: 50 });
    windowResize(dom);
    // 照 120px 算：置中是 200 + 25 - 60 = 165，超出右邊，貼齊盤面右邊 250 - 120 = 130（照 60px 算會是 190）
    assert.equal(menu.style.left, '130px');
});

test('關掉之後視窗大小改變什麼都不做（close() 拿掉了 window 的 resize 監聽器）', () => {
    const { dom, board, cells, popover } = setup();
    popover.open(cells[1], OPTIONS, { onSelect() {} });
    const menu = board.querySelector('.cell-popover');
    popover.close();
    cells[1].getBoundingClientRect = () => ({ left: 180, top: 80, width: 80, height: 80 });
    assert.doesNotThrow(() => windowResize(dom));
    assert.equal(menu.style.left, '0px');
});

test('點能選的選項：先關掉選單、焦點回到格子，再呼叫一次 onSelect(value, cell)', () => {
    const { document, board, cells, popover, optionOf } = setup();
    const calls = [];
    popover.open(cells[1], OPTIONS, {
        onSelect: (value, cell) => calls.push({ value, cell, open: popover.isOpen, menu: board.querySelector('.cell-popover'), focus: document.activeElement })
    });
    optionOf(4).click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].value, 4);
    isSame(calls[0].cell, cells[1], 'onSelect 的第二個參數是被點的那一格');
    assert.equal(calls[0].open, false);
    isSame(calls[0].menu, null, 'onSelect 呼叫時選單已經不在盤面裡');
    isSame(calls[0].focus, cells[1], 'onSelect 呼叫時焦點已經回到格子');
    assert.equal(cells[1].getAttribute('aria-expanded'), 'false');
    isSame(popover.anchor, null, '關掉之後沒有 anchor');
});

test('點不能選的選項（disabled 或目前的值）：什麼都不做', () => {
    const { cells, popover, optionOf } = setup();
    let calls = 0;
    popover.open(cells[0], OPTIONS, { onSelect: () => { calls += 1; } });
    optionOf(3).click();
    optionOf(2).click();
    assert.equal(calls, 0);
    assert.equal(popover.isOpen, true);
});

test('Esc：關掉並把焦點還給格子', () => {
    const { dom, document, cells, popover } = setup();
    popover.open(cells[0], OPTIONS, { onSelect() {}, focusFirst: true });
    assert.equal(document.activeElement.dataset.value, '1');
    dom.key('Escape');
    assert.equal(popover.isOpen, false);
    isSame(document.activeElement, cells[0], 'Esc 之後焦點回到格子');
});

test('點選單外面：關掉，焦點不動；點被點的那一格不會關掉', () => {
    const { document, cells, outside, popover } = setup();
    cells[2].focus();
    popover.open(cells[2], OPTIONS, { onSelect() {} });
    cells[2].click();
    assert.equal(popover.isOpen, true);
    outside.click();
    assert.equal(popover.isOpen, false);
    isSame(document.activeElement, cells[2], '點外面關掉之後焦點不動');
});

test('點另一格：同一個選單換到那一格，盤面裡只有一個選單', () => {
    const { board, cells, popover } = setup();
    board.addEventListener('click', (event) => {
        const cell = event.target.closest('[data-cell]');
        if (cell) popover.open(cell, OPTIONS, { onSelect() {} });
    });
    cells[0].click();
    cells[1].click();
    assert.equal(board.querySelectorAll('.cell-popover').length, 1);
    isSame(popover.anchor, cells[1], '選單換到後點的那一格');
    assert.equal(cells[0].getAttribute('aria-expanded'), 'false');
    assert.equal(cells[1].getAttribute('aria-expanded'), 'true');
});

test('在同一格再打開一次：選單留著，選項換成新的', () => {
    const { board, cells, popover, options } = setup();
    popover.open(cells[0], OPTIONS, { onSelect() {} });
    popover.open(cells[0], [{ value: 9, label: '9', current: false }], { onSelect() {} });
    assert.equal(board.querySelectorAll('.cell-popover').length, 1);
    assert.deepEqual(options().map((b) => b.dataset.value), ['9']);
    assert.equal(popover.isOpen, true);
});

test('focusFirst：焦點移到第一個能選的選項；沒有 focusFirst 時焦點不動', () => {
    const { document, cells, popover } = setup();
    const options = [
        { value: 1, label: '1', current: false, disabled: true },
        { value: 2, label: '2', current: true },
        { value: 3, label: '3', current: false }
    ];
    cells[0].focus();
    popover.open(cells[0], options, { onSelect() {}, focusFirst: true });
    assert.equal(document.activeElement.dataset.value, '3');
    popover.close();
    cells[1].focus();
    popover.open(cells[1], options, { onSelect() {} });
    isSame(document.activeElement, cells[1], '沒有 focusFirst 時焦點不動');
});

test('焦點移出選單就關掉，焦點不被搶回格子；在選項之間移動不關', () => {
    const { document, cells, outside, popover, optionOf } = setup();
    popover.open(cells[0], OPTIONS, { onSelect() {}, focusFirst: true });
    optionOf(4).focus();
    assert.equal(popover.isOpen, true);
    outside.focus();
    assert.equal(popover.isOpen, false);
    isSame(document.activeElement, outside, '焦點移出選單：焦點留在移去的地方，不被搶回格子');
});

test('焦點從被點的那一格移到另一格：選單關掉，焦點留在移去的那一格，不被搶回', () => {
    const { document, board, cells, popover } = setup();
    // 滑鼠點下去、沒有 focusFirst：焦點一直在那一格上（Chrome），沒進過選單，選單自己的 focusout 不會動；按 Tab 到旁邊的格子時要靠那一格的 focusout 關掉
    cells[0].focus();
    popover.open(cells[0], OPTIONS, { onSelect() {} });
    assert.equal(popover.isOpen, true);
    cells[1].focus();
    assert.equal(popover.isOpen, false);
    isSame(document.activeElement, cells[1], '焦點留在移去的那一格，不被搶回原來那一格');
    assert.equal(cells[0].getAttribute('aria-expanded'), 'false');
    assert.equal(board.querySelectorAll('.cell-popover').length, 0);
});

test('焦點從被點的那一格移到選單外面的元素，或沒有去任何元素（relatedTarget 是 null，例如 blur()）：也關掉，焦點不動', () => {
    const { document, cells, outside, popover } = setup();
    cells[0].focus();
    popover.open(cells[0], OPTIONS, { onSelect() {} });
    outside.focus();
    assert.equal(popover.isOpen, false);
    isSame(document.activeElement, outside, '焦點留在移去的地方');
    // blur() 派送的 focusout 沒有 relatedTarget：焦點沒有去任何元素（視窗還有焦點，和切到別的視窗不同，見下面 document.hasFocus() 的測試）
    cells[1].focus();
    popover.open(cells[1], OPTIONS, { onSelect() {} });
    cells[1].blur();
    assert.equal(popover.isOpen, false);
    isSame(document.activeElement, document.body, '焦點沒有去任何元素：不被搶回格子');
});

test('用鍵盤打開（focusFirst）：焦點從那一格進到選單裡不算移出，選單留著', () => {
    const { document, cells, popover, optionOf } = setup();
    cells[0].focus();
    popover.open(cells[0], OPTIONS, { onSelect() {}, focusFirst: true });
    assert.equal(popover.isOpen, true);
    isSame(document.activeElement, optionOf(1), '焦點在第一個能選的選項上');
    assert.equal(cells[0].getAttribute('aria-expanded'), 'true');
});

test('關掉之後焦點再離開那一格：不呼叫 onSelect、不重開', () => {
    const { document, board, cells, outside, popover } = setup();
    let calls = 0;
    cells[0].focus();
    popover.open(cells[0], OPTIONS, { onSelect: () => { calls += 1; } });
    popover.close();
    outside.focus();
    cells[1].focus();
    assert.equal(calls, 0);
    assert.equal(popover.isOpen, false);
    assert.equal(board.querySelectorAll('.cell-popover').length, 0);
    isSame(document.activeElement, cells[1], '焦點留在移去的地方');
});

test('選單換到另一格後，舊的那一格失去焦點不會關掉新的選單（close() 拿掉了那一格的 focusout 監聽器）', () => {
    const { board, cells, outside, popover } = setup();
    // 焦點還在 cells[0] 上就把選單換到 cells[1]
    cells[0].focus();
    popover.open(cells[0], OPTIONS, { onSelect() {} });
    popover.open(cells[1], OPTIONS, { onSelect() {} });
    outside.focus();
    assert.equal(popover.isOpen, true);
    isSame(popover.anchor, cells[1], '選單還開在 cells[1]');
    assert.equal(board.querySelectorAll('.cell-popover').length, 1);
});

// 視窗失去焦點（切到別的視窗，例如遊戲）時，瀏覽器在目前焦點元素的 focusout 裡：relatedTarget 是 null、document.hasFocus() 是 false，
// document.activeElement 不變（切回來時焦點還在同一個元素上）。fake-dom 沒有 hasFocus()，用到的測試自己指定到 document 上
const windowBlur = (dom, target) => target.dispatchEvent(new dom.window.Event('focusout', { bubbles: true, relatedTarget: null }));

test('視窗失去焦點（切到別的視窗，例如遊戲）引起的 focusout 不關選單：焦點在被點的那一格上', () => {
    const { dom, document, cells, outside, popover } = setup();
    cells[0].focus();
    popover.open(cells[0], OPTIONS, { onSelect() {} });
    document.hasFocus = () => false;
    windowBlur(dom, cells[0]);
    assert.equal(popover.isOpen, true);
    isSame(popover.anchor, cells[0], '選單還開在那一格');
    isSame(document.activeElement, cells[0], '焦點還在那一格上');
    // 切回來：焦點回到同一個元素，沒有 focusout；之後視窗有焦點，焦點離開那一格照常關掉選單
    document.hasFocus = () => true;
    outside.focus();
    assert.equal(popover.isOpen, false);
});

test('視窗失去焦點引起的 focusout 也不關選單：焦點在選單的選項上（用鍵盤打開）', () => {
    const { dom, document, cells, outside, popover, optionOf } = setup();
    cells[0].focus();
    popover.open(cells[0], OPTIONS, { onSelect() {}, focusFirst: true });
    isSame(document.activeElement, optionOf(1), '鍵盤打開：焦點在第一個能選的選項上');
    document.hasFocus = () => false;
    windowBlur(dom, optionOf(1));
    assert.equal(popover.isOpen, true);
    isSame(document.activeElement, optionOf(1), '焦點還在那個選項上');
    // 切回來之後焦點離開選單，照常關掉
    document.hasFocus = () => true;
    outside.focus();
    assert.equal(popover.isOpen, false);
});

test('document.hasFocus() 是 true（視窗有焦點）時，焦點離開那一格、離開選單的選項都照常關掉選單', () => {
    const { document, cells, outside, popover } = setup();
    document.hasFocus = () => true;
    cells[0].focus();
    popover.open(cells[0], OPTIONS, { onSelect() {} });
    outside.focus();
    assert.equal(popover.isOpen, false, '焦點離開那一格');
    popover.open(cells[0], OPTIONS, { onSelect() {}, focusFirst: true });
    assert.equal(popover.isOpen, true);
    cells[1].focus();
    assert.equal(popover.isOpen, false, '焦點離開選單的選項');
});

test('在選單上按下滑鼠不會移動焦點（Safari、macOS 的 Firefox 點按鈕不給焦點，不然選單會在 click 之前被 focusout 關掉）', () => {
    const { dom, document, board, cells, outside, popover, optionOf } = setup();
    popover.open(cells[0], OPTIONS, { onSelect() {}, focusFirst: true });
    const press = (target) => {
        const event = new dom.window.Event('mousedown', { bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return event;
    };
    // 選項上、選單的空白處按下去：預設動作（移動焦點）都被擋下，選單還開著，焦點還在第一個選項上
    assert.equal(press(optionOf(4)).defaultPrevented, true);
    assert.equal(press(board.querySelector('.cell-popover')).defaultPrevented, true);
    assert.equal(popover.isOpen, true);
    assert.equal(document.activeElement.dataset.value, '1');
    // 只管選單裡面：選單外面的 mousedown 照常
    assert.equal(press(outside).defaultPrevented, false);
});

// 手指或滑鼠按下去的 pointerdown：會冒泡、能 preventDefault
const pointerdown = (dom, target) => target.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true, cancelable: true }));

test('按下選單外面（pointerdown）也關掉，焦點不動（iPhone 的 Safari 點非互動的元素時不會送 click）', () => {
    const { dom, document, cells, outside, popover } = setup();
    const status = document.body.appendChild(dom.el('p', {}, '狀態列'));
    // 焦點在選單外面的按鈕上：按下去關掉選單，但不把焦點搶回格子
    outside.focus();
    popover.open(cells[0], OPTIONS, { onSelect() {} });
    pointerdown(dom, outside);
    assert.equal(popover.isOpen, false);
    assert.equal(cells[0].getAttribute('aria-expanded'), 'false');
    isSame(document.activeElement, outside, '按下外面的按鈕：焦點還在那顆按鈕上，不被搶回格子');
    // 按在不能互動的元素（狀態列）上也一樣
    popover.open(cells[0], OPTIONS, { onSelect() {} });
    pointerdown(dom, status);
    assert.equal(popover.isOpen, false);
    isSame(document.activeElement, outside, '按在狀態列上：焦點也不動');
});

test('按下選項、選單、被點的那一格（pointerdown）不會關掉選單', () => {
    const { dom, board, cells, popover, optionOf } = setup();
    popover.open(cells[1], OPTIONS, { onSelect() {} });
    pointerdown(dom, optionOf(4));
    pointerdown(dom, board.querySelector('.cell-popover'));
    pointerdown(dom, cells[1]);
    assert.equal(popover.isOpen, true);
    isSame(popover.anchor, cells[1], '選單還開在被按的那一格');
});

test('按下另一格（pointerdown）再點它：選單換到那一格，盤面裡只有一個選單', () => {
    const { dom, board, cells, popover } = setup();
    board.addEventListener('click', (event) => {
        const cell = event.target.closest('[data-cell]');
        if (cell) popover.open(cell, OPTIONS, { onSelect() {} });
    });
    cells[0].click();
    // 手指按下第二格時選單先關掉，放開後的 click 再把選單開在那一格
    pointerdown(dom, cells[1]);
    cells[1].click();
    assert.equal(board.querySelectorAll('.cell-popover').length, 1);
    isSame(popover.anchor, cells[1], '選單換到被點的第二格');
    assert.equal(cells[0].getAttribute('aria-expanded'), 'false');
    assert.equal(cells[1].getAttribute('aria-expanded'), 'true');
});

test('close() 可以重複呼叫；關掉之後點文件、按 Esc 都沒有反應', () => {
    const { dom, document, cells, outside, popover } = setup();
    let calls = 0;
    popover.open(cells[0], OPTIONS, { onSelect: () => { calls += 1; } });
    popover.close();
    popover.close();
    assert.equal(popover.isOpen, false);
    isSame(popover.anchor, null, '關掉之後沒有 anchor');
    outside.focus();
    outside.click();
    dom.key('Escape');
    assert.equal(calls, 0);
    isSame(document.activeElement, outside, '關掉之後按 Esc、點文件，焦點都不動');
});

test('小選單的樣式寫在 tools-common.css', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../assets/css/tools-common.css'), 'utf8');
    const rule = (selector) => {
        const at = css.indexOf(`${selector} {`);
        assert.notEqual(at, -1, `tools-common.css 找不到 ${selector}`);
        return css.slice(at, css.indexOf('}', at));
    };
    assert.match(rule('.cell-popover'), /position:\s*absolute;/);
    assert.match(rule('.cell-popover-cols-2'), /grid-template-columns:/);
    assert.match(rule('.cell-popover-cols-3'), /grid-template-columns:/);
    assert.match(rule('.cell-popover-option'), /min-height:\s*var\(--control-lg\);/);
    assert.match(rule('.cell-popover-option-wide'), /grid-column:\s*1 \/ -1;/);
});
