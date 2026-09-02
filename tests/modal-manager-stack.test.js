const test = require('node:test');
const assert = require('node:assert/strict');

// ModalManager 載入時只碰 window（檔尾匯出），show()/hide() 才會用到 document，
// 因此不需要 jsdom：先放一組最小 DOM 替身到 global，再 require 模組即可。
// 注意：這會污染 global.window／global.document；node --test 每個測試檔跑在獨立行程，
// 不要把這些測試併進其他測試檔。
function installFakeDom() {
    const listeners = new Set();
    // _getFocusableElements 會用 window.getComputedStyle 濾掉隱藏元素，
    // 替身一律回報「看得見」，可見與否交由 offsetWidth／offsetHeight 決定。
    global.window = {
        getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' })
    };
    global.document = {
        activeElement: null,
        addEventListener: (type, fn) => { if (type === 'keydown') listeners.add(fn); },
        removeEventListener: (type, fn) => { if (type === 'keydown') listeners.delete(fn); },
        body: { contains: () => true }
    };
    return {
        dispatchKey: (key, extra = {}) => {
            const event = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
            for (const fn of [...listeners]) fn(event);
            return event;
        },
        listenerCount: () => listeners.size
    };
}

// 最小元素替身。
// focusable: n 會建立 n 個可聚焦子元素（offsetWidth／offsetHeight 為 1，才不會被
// _getFocusableElements 的可見性過濾掉），並由 querySelectorAll 回傳，
// 讓焦點陷阱與初始焦點都走真正的程式碼路徑；n 為 0 時視窗內沒有可聚焦元素。
function makeElement(id, { focusable = 0 } = {}) {
    const children = [];
    const el = {
        id,
        classList: {
            _s: new Set(),
            add(c) { this._s.add(c); },
            remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }
        },
        style: {},
        addEventListener() {}, removeEventListener() {},
        querySelector: () => null,   // 沒有 [autofocus]，_setInitialFocus 會往下找可聚焦元素
        querySelectorAll: () => children,
        focus() { global.document.activeElement = el; }
    };
    for (let i = 0; i < focusable; i++) {
        const child = {
            id: `${id}-focusable-${i}`,
            offsetWidth: 1,
            offsetHeight: 1,
            focus() { global.document.activeElement = child; }
        };
        children.push(child);
    }
    return el;
}

const dom = installFakeDom();
const ModalManager = require('../assets/js/modal-manager.js');

// 每個測試開始前把上一個測試留下的堆疊由上而下關乾淨，並驗證 hide() 確實會在
// 堆疊清空時拆掉 document 監聽器
test.beforeEach(() => {
    while (ModalManager._stack.length > 0) {
        ModalManager._stack[ModalManager._stack.length - 1].hide();
    }
    assert.equal(dom.listenerCount(), 0, '堆疊清空後不該留下 document keydown 監聽器');
    global.document.activeElement = null;
});

// 全部測試跑完後再收一次尾，確認沒有測試把視窗留在堆疊上、也沒有殘留監聽器
test.after(() => {
    while (ModalManager._stack.length > 0) {
        ModalManager._stack[ModalManager._stack.length - 1].hide();
    }
    assert.equal(ModalManager._stack.length, 0);
    assert.equal(dom.listenerCount(), 0);
});

test('只有堆疊最上層的實例會回應 Escape，整個堆疊只掛一個 document keydown 監聽器', () => {
    const a = new ModalManager(), b = new ModalManager();
    const lower = makeElement('lower'), upper = makeElement('upper');
    let closedLower = 0, closedUpper = 0;
    a.show(lower, { onClose: () => closedLower++ });
    b.show(upper, { onClose: () => closedUpper++ });
    assert.equal(ModalManager._stack.length, 2);
    assert.equal(dom.listenerCount(), 1);

    dom.dispatchKey('Escape');
    assert.equal(closedUpper, 1);
    assert.equal(closedLower, 0, '下層不應該被同一次 Escape 一起關掉');
    assert.equal(lower.classList.contains('active'), true);

    dom.dispatchKey('Escape');
    assert.equal(closedLower, 1);
    assert.equal(ModalManager._stack.length, 0);
    assert.equal(dom.listenerCount(), 0, '堆疊清空後要拆掉 document 監聽器');
});

test('不同實例的視窗可以互相疊加', () => {
    const a = new ModalManager(), b = new ModalManager();
    const lower = makeElement('lower'), upper = makeElement('upper');
    a.show(lower, {});
    b.show(upper, {});
    assert.equal(lower.classList.contains('active'), true);
    assert.equal(upper.classList.contains('active'), true);
});

test('同一個實例再 show() 另一個元素時仍然先關掉自己原本的', () => {
    const a = new ModalManager();
    const first = makeElement('first'), second = makeElement('second');
    a.show(first, {});
    a.show(second, {});
    assert.equal(first.classList.contains('active'), false);
    assert.equal(second.classList.contains('active'), true);
    assert.equal(ModalManager._stack.length, 1);
});

test('同一個實例換視窗時，疊在它上面的其他實例視窗也會被連鎖收掉', () => {
    const lowerManager = new ModalManager(), upperManager = new ModalManager();
    const first = makeElement('first'), other = makeElement('other'), second = makeElement('second');
    lowerManager.show(first, {});
    upperManager.show(other, {});

    lowerManager.show(second, {});
    assert.equal(other.classList.contains('active'), false, '疊在上面的視窗會跟著被關掉');
    assert.equal(upperManager.activeModal, null);
    assert.equal(first.classList.contains('active'), false);
    assert.equal(second.classList.contains('active'), true);
    assert.equal(ModalManager._stack.length, 1);
    assert.equal(ModalManager._stack[0], lowerManager);
});

test('hide() 依序把焦點還給各層開啟前的元素', () => {
    const opener = makeElement('opener'), mid = makeElement('midOpener');
    const a = new ModalManager(), b = new ModalManager();
    const lower = makeElement('lower'), upper = makeElement('upper');
    opener.focus();
    a.show(lower, {});
    mid.focus();                       // 模擬焦點停在下層視窗內的按鈕
    b.show(upper, {});
    b.hide();
    assert.equal(document.activeElement.id, 'midOpener');
    a.hide();
    assert.equal(document.activeElement.id, 'opener');
});

test('關閉下層時連鎖關閉疊在上面的每一層', () => {
    const a = new ModalManager(), b = new ModalManager(), c = new ModalManager();
    const l = makeElement('l'), m = makeElement('m'), u = makeElement('u');
    const order = [];
    a.show(l, { onClose: () => order.push('l') });
    b.show(m, { onClose: () => order.push('m') });
    c.show(u, { onClose: () => order.push('u') });
    a.hide();
    assert.deepEqual(order, ['u', 'm', 'l'], '由上而下關閉');
    assert.equal(ModalManager._stack.length, 0);
});

test('新視窗推上堆疊時下層設為 inert，重新成為最上層（含連鎖關閉）時解除', () => {
    const a = new ModalManager(), b = new ModalManager(), c = new ModalManager();
    const l = makeElement('l'), m = makeElement('m'), u = makeElement('u');
    assert.equal(ModalManager.topmost(), null, '堆疊為空時 topmost() 回傳 null');
    a.show(l, {});
    assert.ok(!l.inert, '單獨一層時不 inert');
    assert.equal(ModalManager.topmost(), a);
    b.show(m, {});
    assert.equal(l.inert, true, '被疊住的下層要 inert');
    assert.ok(!m.inert);
    c.show(u, {});
    assert.equal(m.inert, true);
    assert.ok(!u.inert);
    assert.equal(ModalManager.topmost(), c);

    c.hide();
    assert.equal(m.inert, false, '關掉最上層後，新的最上層要解除 inert');
    assert.equal(l.inert, true, '再下一層仍然 inert');
    assert.equal(ModalManager.topmost(), b);

    c.show(u, {});
    a.hide();   // 連鎖：u → m → l，每一層在輪到自己前都已解除 inert
    assert.equal(m.inert, false);
    assert.equal(l.inert, false);
    assert.equal(ModalManager._stack.length, 0);
});

test('焦點陷阱在最上層真的會攔截 Tab（末端循環回開頭，Shift+Tab 反向）', () => {
    const a = new ModalManager();
    const modal = makeElement('trapped', { focusable: 2 });
    const [first, last] = modal.querySelectorAll();
    a.show(modal, {});
    assert.equal(document.activeElement, first, 'show() 會把焦點移到第一個可聚焦元素');

    last.focus();
    const tab = dom.dispatchKey('Tab');
    assert.equal(tab.defaultPrevented, true);
    assert.equal(document.activeElement, first, '從最後一個 Tab 會循環回第一個');

    const shiftTab = dom.dispatchKey('Tab', { shiftKey: true });
    assert.equal(shiftTab.defaultPrevented, true);
    assert.equal(document.activeElement, last, '從第一個 Shift+Tab 會循環回最後一個');
});

test('最上層的 focusTrap:false 讓 Tab 不被攔截，但 Escape 仍由它負責', () => {
    const a = new ModalManager(), b = new ModalManager();
    const lower = makeElement('lower', { focusable: 2 }), upper = makeElement('upper', { focusable: 2 });
    a.show(lower, {});
    b.show(upper, { focusTrap: false });

    const [firstOfUpper, lastOfUpper] = upper.querySelectorAll();
    assert.equal(document.activeElement, firstOfUpper, 'focusTrap:false 仍然會把焦點移進視窗');

    lastOfUpper.focus();
    const tab = dom.dispatchKey('Tab');
    assert.equal(tab.defaultPrevented, false);
    assert.equal(document.activeElement, lastOfUpper, 'Tab 沒被攔截，焦點不會被拉回第一個');

    dom.dispatchKey('Escape');
    assert.equal(upper.classList.contains('active'), false);
    assert.equal(lower.classList.contains('active'), true);
});

test('show() 一律把焦點移進視窗；沒有可聚焦子元素時聚焦視窗本身', () => {
    const a = new ModalManager();
    const withChildren = makeElement('withChildren', { focusable: 2 });
    a.show(withChildren, { focusTrap: false });
    assert.equal(document.activeElement, withChildren.querySelectorAll()[0]);
    a.hide();

    const b = new ModalManager();
    const noChildren = makeElement('noChildren');
    b.show(noChildren, {});
    assert.equal(document.activeElement, noChildren, '沒有可聚焦子元素時退回聚焦視窗本身');
});

test('closeOnEsc:false 的最上層會吃掉 Escape，不會讓下層被關掉', () => {
    const a = new ModalManager(), b = new ModalManager();
    const lower = makeElement('lower'), upper = makeElement('upper');
    a.show(lower, {});
    b.show(upper, { closeOnEsc: false });
    dom.dispatchKey('Escape');
    assert.equal(upper.classList.contains('active'), true);
    assert.equal(lower.classList.contains('active'), true);
});
