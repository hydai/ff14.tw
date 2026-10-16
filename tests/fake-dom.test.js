const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { createFakeDom } = require('./helpers/fake-dom.js');
const { mountFromHtml } = require('./helpers/html-fragment.js');

// 守住 tests/helpers/fake-dom.js 的 API。導覽列、選單、首頁、404 的測試都建立在這個替身上，
// 替身本身出錯，那些測試就可能在不該通過的時候通過。

// 在 dom.window 的 context 裡執行一小段程式，模擬腳本自己呼叫 window.addEventListener() 這類 API
const run = (dom, code) => vm.runInContext(code, dom.window);
const tags = (nodes) => nodes.map((node) => node.tagName);
// 節點之間互相參照，deepEqual 失敗時會把整棵樹印出來，所以比較節點一律用 ===
const same = (actual, expected, message) => assert.ok(actual.length === expected.length && actual.every((node, index) => node === expected[index]), message);

// 掛在 body 底下的一段頁首：header.header > div.container > [nav#site-nav.nav, button.hamburger]，
// nav 裡是 a[href=/]、沒有屬性的 a、div#nav-tools-menu.tools-menu[hidden] > a.tools-menu-link x 2
function buildHeader(dom) {
    const hamburger = dom.el('button', { class: 'hamburger', type: 'button' });
    const menuLink1 = dom.el('a', { class: 'tools-menu-link', href: '/a' });
    const menuLink2 = dom.el('a', { class: 'tools-menu-link', href: '/b', 'data-i18n': 'k2' });
    const menu = dom.el('div', { id: 'nav-tools-menu', class: 'tools-menu', hidden: true }, menuLink1, menuLink2);
    const home = dom.el('a', { href: '/', 'data-i18n': 'nav_home' });
    const nav = dom.el('nav', { class: 'nav', id: 'site-nav' }, home, dom.el('a'), menu);
    const container = dom.el('div', { class: 'container' }, nav, hamburger);
    const header = dom.el('header', { class: 'header' }, container);
    dom.document.body.appendChild(header);
    return { header, container, nav, home, menu, menuLink1, menuLink2, hamburger };
}

test('createFakeDom 預設值：window 是全域物件，帶著 document、location、innerWidth 與事件、計時器成員；沒有 matchMedia、localStorage、i18n', () => {
    const dom = createFakeDom();
    const { window, document } = dom;

    assert.ok(window.window === window);
    assert.ok(window.document === document);
    assert.equal(window.location.href, 'https://ff14.tw/');
    assert.equal(window.innerWidth, 1280);
    assert.equal(document.readyState, 'complete');
    assert.ok(window.console === console && window.URL === URL);
    for (const name of ['addEventListener', 'removeEventListener', 'dispatchEvent', 'setTimeout', 'clearTimeout', 'Event', 'CustomEvent']) {
        assert.equal(typeof window[name], 'function', `window.${name}`);
    }
    for (const name of ['createElement', 'createTextNode', 'getElementById', 'querySelector', 'querySelectorAll', 'addEventListener', 'removeEventListener', 'dispatchEvent']) {
        assert.equal(typeof document[name], 'function', `document.${name}`);
    }

    // 不預設的成員，腳本也看不到；測試指定到 window 上之後，腳本就能當全域變數讀到
    for (const name of ['matchMedia', 'localStorage', 'i18n']) {
        assert.ok(!(name in window), `window 不該預設有 ${name}`);
    }
    assert.equal(run(dom, 'typeof matchMedia + typeof localStorage + typeof i18n'), 'undefinedundefinedundefined');
    window.localStorage = { getItem: (key) => `值:${key}` };
    assert.equal(run(dom, 'localStorage.getItem("k")'), '值:k');
});

test('createFakeDom 的選項決定 location、readyState 與 innerWidth', () => {
    const { window, document } = createFakeDom({ url: 'https://ff14.tw/tools/weather-forecast/index.html?a=1#top', readyState: 'loading', innerWidth: 390 });

    assert.equal(window.location.origin, 'https://ff14.tw');
    assert.equal(window.location.pathname, '/tools/weather-forecast/index.html');
    assert.equal(window.innerWidth, 390);
    assert.equal(document.readyState, 'loading');
});

test('document 有 html > head、body，沒有焦點時 activeElement 是 body', () => {
    const { document } = createFakeDom();

    assert.equal(document.documentElement.tagName, 'HTML');
    assert.ok(document.documentElement.parentNode === document, 'html 的父節點是 document，事件才會從這裡冒泡到 window');
    assert.deepEqual(tags(document.documentElement.children), ['HEAD', 'BODY']);
    assert.ok(document.head === document.documentElement.children[0]);
    assert.ok(document.body === document.documentElement.children[1]);
    assert.ok(document.activeElement === document.body);
});

test('dom.load 在 window 的 context 執行 repo 腳本：後載入的 layout-loader 看得到先載入的頂層宣告，並以頁尾取代佔位元素', () => {
    const dom = createFakeDom({ url: 'https://ff14.tw/about.html' });
    const { document } = dom;
    document.body.appendChild(dom.el('div', { id: 'footer-placeholder', 'data-base-path': '/' }));
    let layoutLoaded = 0;
    document.addEventListener('layoutLoaded', () => { layoutLoaded += 1; });

    // 照真實頁面的載入順序；layout-loader 用 typeof FooterTemplate 這種裸識別字檢查前面腳本的 const
    dom.load('assets/js/components/tools-registry.js');
    dom.load('assets/js/components/footer-template.js');
    dom.load('assets/js/components/layout-loader.js');

    assert.equal(typeof dom.window.FooterTemplate.createDOM, 'function', '腳本用 window.X 匯出的東西，測試端讀得到');
    assert.equal(document.getElementById('footer-placeholder'), null);
    assert.ok(document.querySelector('footer.footer > div.container > ul.footer-links'));
    assert.ok(document.body.classList.contains('layout-loaded'));
    assert.equal(layoutLoaded, 1);
});

test('readyState 是 loading 時，layout-loader 等到測試在 document 上派送 DOMContentLoaded 才載入', () => {
    const dom = createFakeDom({ readyState: 'loading' });
    const { document, window } = dom;
    document.body.appendChild(dom.el('div', { id: 'footer-placeholder', 'data-base-path': '/' }));
    dom.load('assets/js/components/tools-registry.js');
    dom.load('assets/js/components/footer-template.js');
    dom.load('assets/js/components/layout-loader.js');
    assert.ok(document.getElementById('footer-placeholder'), 'DOMContentLoaded 之前還不該載入');

    document.dispatchEvent(new window.CustomEvent('DOMContentLoaded'));
    assert.equal(document.getElementById('footer-placeholder'), null);
    assert.ok(document.querySelector('footer.footer'));
});

test('腳本在 vm 裡註冊的 window、document 監聽器收得到測試端派送的事件，反方向也一樣', () => {
    const dom = createFakeDom();
    const { window, document } = dom;
    run(dom, `
        window.hits = [];
        window.addEventListener('resize', function () { window.hits.push('resize'); });
        document.addEventListener('ping', function () { window.hits.push('ping'); });
    `);
    window.dispatchEvent(new window.CustomEvent('resize'));
    document.dispatchEvent(new window.CustomEvent('ping'));
    assert.deepEqual(Array.from(window.hits), ['resize', 'ping']);

    // 腳本在 vm 裡派送的事件，測試端註冊的監聽器收得到
    const received = [];
    window.addEventListener('scroll', () => received.push('scroll'));
    document.addEventListener('layoutLoaded', () => received.push('layoutLoaded'));
    run(dom, `
        window.dispatchEvent(new CustomEvent('scroll'));
        document.dispatchEvent(new CustomEvent('layoutLoaded'));
    `);
    assert.deepEqual(received, ['scroll', 'layoutLoaded']);
});

test('事件冒泡：元素 → 祖先 → document → window，target 不變、currentTarget 逐層改變', () => {
    const dom = createFakeDom();
    const { window, document } = dom;
    const button = dom.el('button');
    const wrapper = dom.el('div', {}, button);
    document.body.appendChild(wrapper);

    const visited = [];
    const track = (name) => function (event) { visited.push([name, event.target === button, event.currentTarget === this]); };
    button.addEventListener('click', track('button'));
    wrapper.addEventListener('click', track('wrapper'));
    document.body.addEventListener('click', track('body'));
    document.addEventListener('click', track('document'));
    window.addEventListener('click', track('window'));
    button.click();

    assert.deepEqual(visited.map(([name]) => name), ['button', 'wrapper', 'body', 'document', 'window']);
    assert.ok(visited.every(([, targetIsButton, currentTargetIsThis]) => targetIsButton && currentTargetIsThis));
});

test('Event、CustomEvent 預設不冒泡；沒掛在 document 底下的節點，事件到不了 document 與 window', () => {
    const dom = createFakeDom();
    const { window, document } = dom;
    const inner = dom.el('span');
    const outer = dom.el('div', {}, inner);
    document.body.appendChild(outer);
    const seen = [];
    inner.addEventListener('custom', () => seen.push('inner'));
    outer.addEventListener('custom', () => seen.push('outer'));

    inner.dispatchEvent(new window.Event('custom'));
    inner.dispatchEvent(new window.CustomEvent('custom'));
    assert.deepEqual(seen, ['inner', 'inner']);
    inner.dispatchEvent(new window.CustomEvent('custom', { bubbles: true }));
    assert.deepEqual(seen, ['inner', 'inner', 'inner', 'outer']);
    assert.equal(new window.CustomEvent('custom', { detail: { n: 1 } }).detail.n, 1);
    assert.equal(new window.CustomEvent('custom').detail, null, 'CustomEvent 沒有指定 detail 時是 null');

    seen.length = 0;
    document.addEventListener('ping', () => seen.push('document'));
    window.addEventListener('ping', () => seen.push('window'));
    const detached = dom.el('div', {}, dom.el('span'));
    detached.firstElementChild.dispatchEvent(new window.CustomEvent('ping', { bubbles: true }));
    assert.deepEqual(seen, []);
});

test('stopPropagation 擋住往上冒泡；removeEventListener 之後不再觸發；同一個監聽器加兩次只觸發一次；分派中被移除的監聽器不再呼叫', () => {
    const dom = createFakeDom();
    const { window, document } = dom;
    const child = dom.el('i');
    const parent = dom.el('div', {}, child);
    document.body.appendChild(parent);
    const seen = [];

    parent.addEventListener('t', (event) => { seen.push('parent-1'); event.stopPropagation(); });
    parent.addEventListener('t', () => seen.push('parent-2'));
    document.addEventListener('t', () => seen.push('document'));
    child.dispatchEvent(new window.CustomEvent('t', { bubbles: true }));
    assert.deepEqual(seen, ['parent-1', 'parent-2'], '同一層其餘的監聽器照跑，但不再往上冒泡');

    seen.length = 0;
    const listener = () => seen.push('listener');
    child.addEventListener('u', listener);
    child.addEventListener('u', listener);
    child.dispatchEvent(new window.CustomEvent('u'));
    assert.deepEqual(seen, ['listener']);
    child.removeEventListener('u', listener);
    child.dispatchEvent(new window.CustomEvent('u'));
    assert.deepEqual(seen, ['listener']);

    seen.length = 0;
    const second = () => seen.push('second');
    child.addEventListener('v', () => { seen.push('first'); child.removeEventListener('v', second); });
    child.addEventListener('v', second);
    child.dispatchEvent(new window.CustomEvent('v'));
    assert.deepEqual(seen, ['first']);

    // dispatchEvent 的回傳值：被 preventDefault 就是 false，而且只有 cancelable 的事件攔得住
    child.addEventListener('w', (event) => event.preventDefault());
    assert.equal(child.dispatchEvent(new window.CustomEvent('w', { cancelable: true })), false);
    assert.equal(child.dispatchEvent(new window.CustomEvent('w')), true);
});

test('捕獲階段：window → document → 祖先由外到內先跑，然後目標，最後冒泡；目標上的 capture 監聽器一定先於非 capture 的，與登記順序無關', () => {
    const dom = createFakeDom();
    const { window, document } = dom;
    const inner = dom.el('button');
    const middle = dom.el('div', {}, inner);
    const outer = dom.el('section', {}, middle);
    document.body.appendChild(outer);

    const calls = [];
    const record = (name, phase) => function (event) {
        calls.push(`${name}:${phase}`);
        assert.ok(event.target === inner && event.currentTarget === this, `${name}:${phase} 的 target 要固定、currentTarget 是正在執行的節點`);
    };
    // 每個節點都先登記非 capture、再登記 capture：目標（inner）上的 capture 仍然要排在前面
    for (const [name, node] of Object.entries({ window, document, body: document.body, outer, middle, inner })) {
        node.addEventListener('click', record(name, 'bubble'));
        node.addEventListener('click', record(name, 'capture'), true);
    }

    inner.click();
    assert.deepEqual(calls, [
        'window:capture', 'document:capture', 'body:capture', 'outer:capture', 'middle:capture', 'inner:capture',
        'inner:bubble', 'middle:bubble', 'outer:bubble', 'body:bubble', 'document:bubble', 'window:bubble'
    ]);

    // 不冒泡的事件：祖先的 capture 監聽器照跑（瀏覽器也是），祖先的冒泡監聽器不跑，目標自己的非 capture 監聽器照跑
    calls.length = 0;
    for (const node of [window, document, document.body, outer, middle, inner]) node.addEventListener('focus', () => calls.push('capture'), { capture: true });
    inner.addEventListener('focus', () => calls.push('inner:bubble'));
    outer.addEventListener('focus', () => calls.push('outer:bubble'));
    inner.dispatchEvent(new window.Event('focus'));
    assert.deepEqual(calls, ['capture', 'capture', 'capture', 'capture', 'capture', 'capture', 'inner:bubble']);

    // 沒掛在 document 底下的節點：路徑到最上層的祖先為止，捕獲也一樣（到不了 document 與 window 的 capture 監聽器）
    calls.length = 0;
    const leaf = dom.el('span');
    const top = dom.el('div', {}, leaf);
    top.addEventListener('click', () => calls.push('top:capture'), true);
    top.addEventListener('click', () => calls.push('top:bubble'));
    leaf.dispatchEvent(new window.CustomEvent('click', { bubbles: true }));
    assert.deepEqual(calls, ['top:capture', 'top:bubble']);
});

test('捕獲階段呼叫 stopPropagation()：同一個節點的其餘 capture 監聽器照跑，更內層的節點、目標（包括在目標自己的 capture 監聽器擋下時，目標的非 capture 監聽器）與冒泡階段都不再執行；外層已經跑過的不受影響', () => {
    const dom = createFakeDom();
    const { window, document } = dom;
    const inner = dom.el('button');
    const outer = dom.el('div', {}, inner);
    document.body.appendChild(outer);

    const calls = [];
    const listen = (type, node, name, options, action) => node.addEventListener(type, (event) => { calls.push(name); action?.(event); }, options);

    // 在 document 的捕獲階段擋下：window 的捕獲已經跑過，document 的其餘 capture 監聽器照跑，再往內都不跑
    listen('click', window, 'window:capture', true);
    listen('click', document, 'document:capture-1', { capture: true }, (event) => event.stopPropagation());
    listen('click', document, 'document:capture-2', { capture: true });
    listen('click', document, 'document:bubble', false);
    listen('click', outer, 'outer:capture', true);
    listen('click', inner, 'inner:capture', true);
    listen('click', inner, 'inner:bubble', false);
    listen('click', window, 'window:bubble', false);
    inner.click();
    assert.deepEqual(calls, ['window:capture', 'document:capture-1', 'document:capture-2']);

    // 在更內層（outer）的捕獲階段擋下：目標的 capture 與非 capture 監聽器、冒泡階段的 document 都不跑
    calls.length = 0;
    listen('press', window, 'window:capture', true);
    listen('press', outer, 'outer:capture-1', true, (event) => event.stopPropagation());
    listen('press', outer, 'outer:capture-2', true);
    listen('press', inner, 'inner:capture', true);
    listen('press', inner, 'inner:bubble', false);
    listen('press', document, 'document:bubble', false);
    inner.dispatchEvent(new window.CustomEvent('press', { bubbles: true }));
    assert.deepEqual(calls, ['window:capture', 'outer:capture-1', 'outer:capture-2']);

    // 在目標自己的捕獲監聽器擋下：目標的其餘 capture 監聽器照跑，目標的非 capture 監聽器與外層的冒泡都不跑，
    // 和登記順序無關。這和 Chrome 實測相同：DOM 規範的 invoke 一開始就檢查 stop propagation 旗標，
    // 目標在冒泡段的那一次 invoke 直接返回。stopPropagation() 不只擋其他節點，也擋得住目標自己的非 capture 監聽器
    calls.length = 0;
    listen('tap', inner, 'inner:bubble', false);
    listen('tap', inner, 'inner:capture-1', true, (event) => event.stopPropagation());
    listen('tap', inner, 'inner:capture-2', true);
    listen('tap', outer, 'outer:bubble', false);
    inner.dispatchEvent(new window.CustomEvent('tap', { bubbles: true }));
    assert.deepEqual(calls, ['inner:capture-1', 'inner:capture-2']);

    // 沒有人擋的時候，下一次分派照常跑完整條路徑（stopPropagation 的狀態不會殘留）
    calls.length = 0;
    document.addEventListener('plain', () => calls.push('document:capture'), true);
    inner.addEventListener('plain', () => calls.push('inner:bubble'));
    inner.dispatchEvent(new window.CustomEvent('plain'));
    assert.deepEqual(calls, ['document:capture', 'inner:bubble']);

    // 捕獲階段呼叫 preventDefault()：dispatchEvent 的回傳值一樣是 false（要 cancelable）
    document.addEventListener('cancel-me', (event) => event.preventDefault(), true);
    assert.equal(inner.dispatchEvent(new window.CustomEvent('cancel-me', { bubbles: true, cancelable: true })), false);
    assert.equal(inner.dispatchEvent(new window.CustomEvent('cancel-me', { bubbles: true })), true);
});

test('addEventListener／removeEventListener 的第三個參數只看 capture：同一個函式 capture 與非 capture 各算一個監聽器，移除要用同樣的 capture 值', () => {
    const dom = createFakeDom();
    const { window, document } = dom;
    const target = dom.el('div');
    document.body.appendChild(target);
    let calls = 0;
    const listener = () => { calls += 1; };
    const fire = () => { calls = 0; target.dispatchEvent(new window.Event('t')); return calls; };

    target.addEventListener('t', listener);
    target.addEventListener('t', listener, false);
    target.addEventListener('t', listener, { capture: false });
    assert.equal(fire(), 1, '三種寫法都是同一個非 capture 監聽器，只登記一次');

    target.addEventListener('t', listener, true);
    target.addEventListener('t', listener, { capture: true });
    assert.equal(fire(), 2, 'capture 是另一個監聽器，同樣只登記一次');

    target.removeEventListener('t', listener);
    assert.equal(fire(), 1, '不帶第三個參數只移除非 capture 的');
    target.removeEventListener('t', listener, { once: true });
    assert.equal(fire(), 1, 'options 裡沒有 capture 就是非 capture：已經沒有了，capture 的那個不受影響');
    target.removeEventListener('t', listener, { capture: true });
    assert.equal(fire(), 0);

    // 分派中被移除的 capture 監聽器不再呼叫（和非 capture 一樣）
    const seen = [];
    const second = () => seen.push('second');
    document.addEventListener('v', () => { seen.push('first'); document.removeEventListener('v', second, true); }, true);
    document.addEventListener('v', second, true);
    target.dispatchEvent(new window.CustomEvent('v'));
    assert.deepEqual(seen, ['first']);
});

test('dom.key 預設送給目前的焦點元素（沒有焦點時是 body），會冒泡到 document 與 window，回傳的事件帶 defaultPrevented', () => {
    const dom = createFakeDom();
    const { window, document } = dom;
    const button = dom.el('button');
    const link = dom.el('a');
    document.body.appendChild(button);
    document.body.appendChild(link);

    const seen = [];
    document.addEventListener('keydown', (event) => seen.push(['document', event.key, event.target]));
    window.addEventListener('keydown', (event) => { seen.push(['window', event.key, event.target]); event.preventDefault(); });

    const escape = dom.key('Escape');
    assert.deepEqual(seen.map(([where, key]) => [where, key]), [['document', 'Escape'], ['window', 'Escape']]);
    assert.ok(seen[0][2] === document.body, '沒有焦點時送給 body');
    assert.equal(escape.type, 'keydown');
    assert.equal(escape.key, 'Escape');
    assert.equal(escape.bubbles, true);
    assert.equal(escape.defaultPrevented, true, '監聽器呼叫了 preventDefault');

    button.focus();
    dom.key('Tab');
    assert.ok(seen.at(-1)[2] === button, '有焦點時送給焦點元素');
    dom.key('Enter', link);
    assert.ok(seen.at(-1)[2] === link, '也可以指定目標');

    // 沒有人呼叫 preventDefault 時是 false：沒掛在 document 底下的節點，事件到不了 window 的監聽器
    assert.equal(dom.key('a', dom.el('div')).defaultPrevented, false);
});

test('focus()、blur() 更新 document.activeElement，並對原本的焦點元素派送帶 relatedTarget 的 focusout（當下 activeElement 是 body）', () => {
    const dom = createFakeDom();
    const { window, document } = dom;
    const first = dom.el('button');
    const second = dom.el('button');
    const group = dom.el('div', {}, first, second);
    document.body.appendChild(group);

    const outs = [];
    group.addEventListener('focusout', (event) => outs.push({ target: event.target, relatedTarget: event.relatedTarget, active: document.activeElement }));
    window.addEventListener('focusout', () => outs.push('window'));

    first.focus();
    assert.ok(document.activeElement === first);
    assert.equal(outs.length, 0, '原本沒有焦點元素（body），沒有東西會失去焦點');

    second.focus();
    assert.ok(document.activeElement === second);
    assert.equal(outs.length, 2, 'focusout 會冒泡到祖先與 window');
    assert.ok(outs[0].target === first && outs[0].relatedTarget === second);
    assert.ok(outs[0].active === document.body, 'focusout 處理器執行時 activeElement 還是 body，和瀏覽器一致，要判斷去向請看 relatedTarget');
    assert.equal(outs[1], 'window');

    outs.length = 0;
    second.focus();
    assert.equal(outs.length, 0, '已經是焦點元素時，focus() 不派送事件');

    second.blur();
    assert.ok(document.activeElement === document.body);
    assert.ok(outs[0].target === second && outs[0].relatedTarget === null, 'blur() 的 focusout 沒有去向');

    outs.length = 0;
    first.blur();
    assert.equal(outs.length, 0, '不是焦點元素的 blur() 什麼都不做');

    first.focus();
    group.remove();
    assert.ok(document.activeElement === document.body, '焦點元素被移出文件後，activeElement 退回 body');
});

test('focus() 不會把焦點移進 inert 的子樹：焦點不動、不派送 focusout；解除 inert 之後才能聚焦', () => {
    const dom = createFakeDom();
    const { window, document } = dom;
    const outside = dom.el('button');
    const link = dom.el('a', { href: '/' });
    // 手機版選單關閉時 .nav 是 inert（common.js 的 syncNavInert）；要先解除 inert，才能把焦點移進選單
    const nav = dom.el('nav', { class: 'nav', inert: true }, dom.el('div', {}, link));
    document.body.appendChild(outside);
    document.body.appendChild(nav);
    const outs = [];
    window.addEventListener('focusout', (event) => outs.push(event.target));

    link.focus();
    assert.ok(document.activeElement === document.body, '沒有焦點時，也不能把焦點移進 inert 的子樹');

    outside.focus();
    link.focus();
    assert.ok(document.activeElement === outside, 'inert 祖先底下的元素拿不到焦點，原本的焦點不動');
    nav.focus();
    assert.ok(document.activeElement === outside, 'inert 元素本身也一樣');
    assert.equal(outs.length, 0, '焦點沒有移動，就沒有 focusout');

    nav.inert = false;
    link.focus();
    assert.ok(document.activeElement === link, '解除 inert 之後才能聚焦');
    assert.equal(outs.length, 1);
    assert.ok(outs[0] === outside);

    nav.inert = true;
    outside.focus();
    assert.ok(document.activeElement === outside, 'inert 只影響它自己的子樹，不影響其他元素');

    // 只擋 inert：hidden 會不會擋住焦點取決於 CSS（手機版的 .nav .tools-menu[hidden] 會被樣式改成顯示），這裡不模擬
    const panelLink = dom.el('a', { href: '/' });
    document.body.appendChild(dom.el('div', { hidden: true }, panelLink));
    panelLink.focus();
    assert.ok(document.activeElement === panelLink);
});

test('屬性：id、className、classList 彼此一致；href、target、rel、type 反映到屬性；hidden、inert 是布林屬性；style 是純物件', () => {
    const { document } = createFakeDom();
    const el = document.createElement('a');

    assert.equal(el.tagName, 'A');
    assert.equal(document.createElement('Nav').tagName, 'NAV');
    assert.equal(el.id, '');
    el.id = 'x';
    assert.equal(el.getAttribute('id'), 'x');
    el.setAttribute('ID', 'y');
    assert.equal(el.id, 'y', '屬性名稱不分大小寫');

    el.className = 'a  b';
    assert.ok(el.classList.contains('a') && el.classList.contains('b'));
    el.classList.add('c', 'a');
    assert.equal(el.getAttribute('class'), 'a b c', '重複的 token 不會再加一次');
    el.classList.remove('a', 'nope');
    assert.equal(el.className, 'b c');
    assert.equal(el.classList.toggle('d'), true);
    assert.equal(el.classList.toggle('d'), false);
    assert.equal(el.classList.toggle('e', true), true);
    assert.equal(el.classList.toggle('e', true), true);
    assert.equal(el.classList.toggle('e', false), false);
    assert.equal(el.className, 'b c');

    assert.equal(el.getAttribute('aria-expanded'), null);
    el.setAttribute('aria-expanded', false);
    assert.equal(el.getAttribute('aria-expanded'), 'false', 'setAttribute 會把值轉成字串');

    for (const name of ['href', 'target', 'rel', 'type']) {
        assert.equal(el[name], '', `沒有 ${name} 屬性時是空字串`);
        el[name] = `${name}-值`;
        assert.equal(el.getAttribute(name), `${name}-值`);
    }
    el.href = '../../changelog.html';
    assert.equal(el.href, '../../changelog.html', 'href 回傳原始字串，不解析成完整網址');
    el.removeAttribute('href');
    assert.ok(!el.hasAttribute('href') && el.getAttribute('href') === null && el.href === '');

    for (const name of ['hidden', 'inert']) {
        assert.equal(el[name], false);
        el[name] = true;
        assert.ok(el.hasAttribute(name));
        assert.equal(el[name], true);
        el[name] = false;
        assert.ok(!el.hasAttribute(name));
        el.setAttribute(name, '');
        assert.equal(el[name], true, '屬性存在就是 true');
    }

    el.style.overflow = 'hidden';
    assert.equal(el.style.overflow, 'hidden');
    assert.ok(Object.getPrototypeOf(el.style) === Object.prototype);
});

test('dataset 與 data-* 屬性雙向對應', () => {
    const dom = createFakeDom();
    const el = dom.el('div', { 'data-base-path': '/x/', 'data-tool-name-key': 'k' });

    assert.equal(el.dataset.basePath, '/x/');
    assert.equal(el.dataset.toolNameKey, 'k');
    assert.equal(el.dataset.missing, undefined);
    assert.ok('basePath' in el.dataset && !('missing' in el.dataset));

    el.dataset.page = '404';
    assert.equal(el.getAttribute('data-page'), '404');
    el.dataset.count = 5;
    assert.equal(el.getAttribute('data-count'), '5');
    el.setAttribute('data-i18n-attr', 'placeholder');
    assert.equal(el.dataset.i18nAttr, 'placeholder');

    delete el.dataset.page;
    assert.equal(el.hasAttribute('data-page'), false);
    assert.equal(el.dataset.page, undefined);
});

test('textContent：讀取會串接所有後代的文字；寫入會取代所有子節點，空字串不建立文字節點', () => {
    const dom = createFakeDom();
    const label = dom.el('span', {}, '回報問題');
    const mark = dom.el('span', { class: 'external-mark' }, ' ↗');
    const link = dom.el('a', {}, label, mark);
    assert.equal(link.textContent, '回報問題 ↗');
    assert.equal(dom.el('p', {}, 'x', dom.el('b', {}, 'y'), dom.document.createTextNode('z')).textContent, 'xyz');

    // 帶 data-i18n 的元素被 I18nManager 覆寫文字時就是這樣：裡面的元素整個消失，所以頁尾的 data-i18n 放在內層 span
    link.textContent = 'GitHub';
    assert.equal(link.textContent, 'GitHub');
    assert.equal(link.childNodes.length, 1);
    assert.equal(link.childNodes[0].nodeType, 3);
    assert.equal(link.children.length, 0);
    assert.equal(link.querySelector('.external-mark'), null);
    assert.ok(label.parentNode === null && mark.parentNode === null, '被取代的子節點會脫離父節點');

    link.textContent = '';
    assert.equal(link.childNodes.length, 0);
    link.textContent = null;
    assert.equal(link.childNodes.length, 0);
    link.textContent = 0;
    assert.equal(link.textContent, '0');
});

test('appendChild、insertBefore 會搬移已有父節點的節點；insertBefore 的參考節點為 null 時附加在最後', () => {
    const dom = createFakeDom();
    const a = dom.el('a');
    const b = dom.el('b');
    const i = dom.el('i');
    const root = dom.el('div', {}, a, b, i);
    assert.deepEqual(tags(root.children), ['A', 'B', 'I']);

    const other = dom.el('section');
    other.appendChild(a);
    assert.ok(a.parentNode === other);
    assert.deepEqual(tags(root.children), ['B', 'I'], '搬走之後，舊的父節點不再有它');
    root.appendChild(i);
    assert.deepEqual(tags(root.children), ['B', 'I'], '已經在最後的子節點，appendChild 不會讓它重複');

    const u = dom.el('u');
    assert.ok(root.insertBefore(u, null) === u);
    assert.deepEqual(tags(root.children), ['B', 'I', 'U'], '參考節點為 null：附加在最後');
    root.insertBefore(u, b);
    assert.deepEqual(tags(root.children), ['U', 'B', 'I'], '同一個父節點裡的節點，搬到參考節點前面');
    root.insertBefore(i, u);
    assert.deepEqual(tags(root.children), ['I', 'U', 'B']);

    assert.throws(() => root.insertBefore(dom.el('s'), dom.el('x')), /參考節點/);
    assert.throws(() => root.insertBefore(dom.el('s'), undefined), /參考節點/);
    assert.throws(() => u.appendChild(root), /後代/);

    // 主題切換鈕的放法：有 ☰ 就放在它前面，沒有就接在最後
    const container = dom.el('div', {}, dom.el('a'), dom.el('nav'));
    const toggle = dom.el('button');
    container.insertBefore(toggle, container.querySelector('.hamburger'));
    assert.ok(container.children.at(-1) === toggle);
    const hamburger = dom.el('button', { class: 'hamburger' });
    container.appendChild(hamburger);
    const secondToggle = dom.el('button');
    container.insertBefore(secondToggle, container.querySelector('.hamburger'));
    assert.ok(hamburger.previousElementSibling === secondToggle);
});

test('children、childNodes、兄弟節點，以及 remove、replaceWith、contains', () => {
    const dom = createFakeDom();
    const first = dom.el('a');
    const second = dom.el('b');
    const third = dom.el('i');
    const root = dom.el('div', {}, first, '文字', second, third);

    assert.equal(root.childNodes.length, 4);
    assert.deepEqual(tags(root.children), ['A', 'B', 'I']);
    assert.ok(root.firstElementChild === first && first.parentNode === root);
    assert.ok(first.previousElementSibling === null);
    assert.ok(first.nextElementSibling === second, '兄弟節點會跳過文字節點');
    assert.ok(second.previousElementSibling === first);
    assert.ok(third.nextElementSibling === null);
    assert.ok(dom.el('p').nextElementSibling === null && dom.el('p').firstElementChild === null);
    assert.equal(dom.el('p', {}, '文字', dom.el('em')).firstElementChild.tagName, 'EM', 'firstElementChild 會跳過文字節點');

    // replaceWith（頁首、頁尾佔位元素的換法）保持原本的位置
    const placeholder = dom.el('div', { id: 'placeholder' });
    const page = dom.el('main', {}, dom.el('p'), placeholder, dom.el('q'));
    const header = dom.el('header');
    placeholder.replaceWith(header);
    assert.deepEqual(tags(page.children), ['P', 'HEADER', 'Q']);
    assert.equal(placeholder.parentNode, null);

    header.remove();
    assert.deepEqual(tags(page.children), ['P', 'Q']);
    assert.equal(header.parentNode, null);
    header.remove();

    assert.ok(page.contains(page) && page.contains(page.firstElementChild), 'contains 包含自己');
    assert.ok(!page.contains(header) && !page.contains(null));
    assert.ok(dom.document.contains(dom.document.body));
});

test('firstChild、lastChild 包含文字節點，沒有子節點時是 null；共用的 SecurityUtils.clearElement() 靠它們清空子節點', () => {
    const dom = createFakeDom();
    const em = dom.el('em', {}, '中');
    const root = dom.el('p', {}, '前', em, '後');

    assert.equal(root.firstChild.nodeType, 3, 'firstChild 不跳過文字節點（和 firstElementChild 不同）');
    assert.equal(root.firstChild.textContent, '前');
    assert.equal(root.lastChild.textContent, '後');
    assert.ok(em.firstChild === em.lastChild && em.firstChild.textContent === '中', '只有一個子節點時兩者相同');
    assert.ok(dom.el('p').firstChild === null && dom.el('p').lastChild === null);
    assert.ok(dom.document.createTextNode('字').firstChild === null, '文字節點沒有子節點');
    root.removeChild(root.firstChild);
    assert.ok(root.firstChild === em, '跟著 childNodes 變動');
    root.appendChild(dom.el('b'));
    assert.equal(root.lastChild.tagName, 'B');

    // 工具頁面的程式都用 assets/js/security-utils.js 的 clearElement() 清空容器（while (element.firstChild) removeChild）
    dom.load('assets/js/security-utils.js');
    run(dom, 'SecurityUtils').clearElement(root);
    assert.equal(root.childNodes.length, 0);
    assert.equal(em.parentNode, null, '被清掉的子節點脫離父節點');
});

test('選擇器：tag、#id、.class、[attr]、[attr="v"] 的複合寫法', () => {
    const dom = createFakeDom();
    const { document } = dom;
    const { nav, home, menu, menuLink2, hamburger } = buildHeader(dom);

    assert.ok(document.querySelector('nav') === nav);
    assert.ok(document.querySelector('NAV') === nav, 'tag 不分大小寫');
    assert.ok(document.querySelector('#site-nav') === nav);
    assert.ok(document.querySelector('nav#site-nav.nav') === nav);
    assert.equal(document.querySelector('div#site-nav'), null, '複合選擇器的每一項都要符合');
    assert.ok(document.querySelector('.hamburger') === hamburger);
    assert.ok(document.querySelector('button.hamburger[type="button"]') === hamburger);
    assert.ok(document.querySelector('button.hamburger[type=button]') === hamburger);
    assert.ok(document.querySelector("button[type='button']") === hamburger);
    assert.equal(document.querySelector('button[type="submit"]'), null);

    assert.deepEqual(document.querySelectorAll('[data-i18n]').map((el) => el.getAttribute('data-i18n')), ['nav_home', 'k2'], '依文件順序');
    assert.ok(document.querySelector('[data-i18n="k2"]') === menuLink2);
    assert.ok(document.querySelector('[hidden]') === menu);
    assert.equal(document.querySelectorAll('[href]').length, 3);
    assert.ok(document.querySelector('a[href]') === home);

    const quoted = dom.el('div', { 'data-x': 'a b', title: '' });
    document.body.appendChild(quoted);
    assert.ok(document.querySelector('[data-x="a b"]') === quoted, '引號裡可以有空白');
    assert.ok(document.querySelector('[title=""]') === quoted && document.querySelector('[title]') === quoted);

    // 不加引號的值只能是 CSS 識別字（字母或底線開頭，後面可以接數字、-、_）；數字開頭等其他值要加引號
    const identifier = dom.el('div', { 'data-page': 'foo-bar_2', 'data-n': '404' });
    document.body.appendChild(identifier);
    assert.ok(document.querySelector('[data-page=foo-bar_2]') === identifier);
    assert.ok(document.querySelector('[data-n="404"]') === identifier);
});

test('選擇器：空白（後代）與 > （子代）組合子；祖先可以在查詢範圍之外；找不到沒掛在 document 的節點', () => {
    const dom = createFakeDom();
    const { document } = dom;
    const { header, container, nav, home, menu, menuLink1 } = buildHeader(dom);

    assert.equal(document.querySelectorAll('.nav a').length, 4);
    assert.equal(document.querySelectorAll('.nav > a').length, 2);
    same(document.querySelectorAll('.nav > a[href]'), [home], 'layout-loader 用的選擇器');
    assert.equal(document.querySelectorAll('.tools-menu a').length, 2);
    assert.equal(document.querySelectorAll('.tools-menu > a').length, 2);
    assert.equal(document.querySelectorAll('.nav > .tools-menu > a.tools-menu-link').length, 2);
    assert.equal(document.querySelectorAll('.nav > a.tools-menu-link').length, 0);
    same(document.querySelectorAll('.header .container'), [container]);
    same(document.querySelectorAll('.header>.container>.nav'), [nav], '> 兩側的空白可有可無');
    assert.equal(document.querySelectorAll('  .header   .nav   a  ').length, 4);
    assert.deepEqual(document.querySelectorAll('a').map((el) => el.getAttribute('href')), ['/', null, '/a', '/b'], '依文件順序');

    // 後代組合子需要回溯：最近的 .b 上面沒有 .a，更遠的 .b 才有
    document.body.appendChild(dom.el('div', { class: 'a' }, dom.el('div', { class: 'b' }, dom.el('div', { class: 'b' }, dom.el('i', { class: 'c' })))));
    assert.equal(document.querySelectorAll('.a .b .c').length, 1);
    assert.equal(document.querySelectorAll('.a > .b .c').length, 1);
    assert.equal(document.querySelectorAll('.a > .b > .c').length, 0);

    // 只找查詢根的後代（不含自己），但比對時祖先可以在範圍之外
    assert.equal(nav.querySelectorAll('a').length, 4);
    assert.equal(nav.querySelector('nav'), null);
    assert.ok(header.querySelector('.container') === container);
    assert.ok(nav.querySelector('.header a') === home);
    assert.ok(menu.querySelector('.nav a') === menuLink1);

    const stray = dom.el('div', { id: 'stray' }, dom.el('i', { class: 'inside' }));
    assert.equal(document.getElementById('stray'), null);
    assert.equal(document.querySelector('#stray'), null);
    assert.ok(stray.querySelector('.inside'));
    assert.ok(document.getElementById('nav-tools-menu') === menu);
    assert.equal(document.getElementById('nope'), null);
    assert.equal(document.getElementById(''), null);
});

test('matches() 用同一套選擇器判斷元素本身；closest() 從自己開始往上找，找不到是 null', () => {
    const dom = createFakeDom();
    const { document } = dom;
    const { header, container, nav, home, menu, menuLink1, menuLink2 } = buildHeader(dom);

    assert.equal(home.matches('a[href="/"]'), true);
    assert.equal(home.matches('.nav > a'), true, '組合子也可以，祖先在元素之外');
    assert.equal(menuLink2.matches('nav a.tools-menu-link[data-i18n="k2"]'), true);
    assert.equal(home.matches('button'), false);
    assert.equal(menuLink1.matches('.nav > a'), false, '> 只看父節點');
    assert.equal(menuLink1.matches('[data-i18n]'), false);

    assert.ok(menuLink1.closest('a') === menuLink1, '自己符合就回傳自己');
    assert.ok(menuLink1.closest('.tools-menu') === menu, '往上找到最近的祖先');
    assert.ok(menuLink2.closest('#site-nav') === nav);
    assert.ok(menuLink1.closest('.header .container') === container);
    assert.ok(menuLink1.closest('header') === header);
    assert.equal(menuLink1.closest('.nope'), null);
    assert.equal(document.body.closest('html') === document.documentElement, true);
    assert.equal(dom.el('i').closest('i').tagName, 'I', '沒掛在 document 底下的元素也能找自己');
    assert.equal(dom.el('div', {}, dom.el('i')).firstElementChild.closest('section'), null, '找到最上層的祖先為止');
    assert.equal(home.closest('[hidden]'), null, '不會找兄弟或其他分支裡的元素');
    assert.ok(menuLink1.closest('[hidden]') === menu);

    // 和 querySelector 一樣：不支援的語法丟錯，不悄悄回傳 false 或 null
    for (const selector of ['a, b', ':scope > a', '*', 'a:hover', '[data-x=1]', '']) {
        assert.throws(() => home.matches(selector), /不支援的選擇器/, `matches(${JSON.stringify(selector)})`);
        assert.throws(() => home.closest(selector), /不支援的選擇器/, `closest(${JSON.stringify(selector)})`);
    }
});

test('不支援的選擇器語法會丟錯，不會悄悄回傳空結果：包含瀏覽器也會丟 SyntaxError 的屬性值寫法，以及沒實作的 i 旗標', () => {
    const dom = createFakeDom();
    buildHeader(dom);

    const unsupported = [
        'a, b', ':scope > a', '*', 'a:hover', ':not(a)', 'a::before', 'a + b', 'a ~ b', '', '   ', '> a', 'a >', '[', 'a[x', '.', '#', 'a[x]b',
        // 不加引號的屬性值不是 CSS 識別字：Chrome 對這些都丟 SyntaxError，所以替身也不能放行（[data-page=404] 要寫成 [data-page="404"]）
        '[data-x=1]', '[data-page=404]', '[data-x=]', '[href=/]', '[data-n=-1]', '[data-x=a.b]', '[data-x=a b]',
        // 瀏覽器接受、但替身不實作的寫法：非 ASCII 的不加引號的值，以及大小寫旗標 i（不能悄悄把旗標當成值的一部分而回傳空結果）
        '[data-x=首頁]', '[type="button" i]', '[type=button i]', '[type="button" s]'
    ];
    for (const selector of unsupported) {
        assert.throws(() => dom.document.querySelectorAll(selector), /不支援的選擇器/, `${JSON.stringify(selector)} 應該丟錯`);
        assert.throws(() => dom.document.querySelector(selector), /不支援的選擇器/);
    }
});

test('dom.el 建立元素：屬性可以是字串、true（空屬性）、false、null、undefined（略過），字串子節點變成文字節點', () => {
    const dom = createFakeDom();
    const child = dom.el('b', {}, 'world');
    const el = dom.el('a', { href: '/x', class: 'k', hidden: true, inert: false, title: null, lang: undefined, 'data-n': 3 }, 'hello ', child, '!');

    assert.equal(el.tagName, 'A');
    assert.equal(el.href, '/x');
    assert.equal(el.className, 'k');
    assert.equal(el.getAttribute('hidden'), '');
    assert.ok(!el.hasAttribute('inert') && !el.hasAttribute('title') && !el.hasAttribute('lang'));
    assert.equal(el.getAttribute('data-n'), '3');
    assert.equal(el.textContent, 'hello world!');
    assert.deepEqual(el.childNodes.map((node) => node.nodeType), [3, 1, 3]);
    assert.ok(child.parentNode === el);
    assert.equal(dom.el('div').childNodes.length, 0);
});

test('window.setTimeout、clearTimeout 在呼叫時才取全域計時器，所以 mock.timers 在建立 dom 之後啟用也有效', (t) => {
    const { window } = createFakeDom();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const fired = [];

    window.setTimeout(() => fired.push('a'), 1000);
    const cancelled = window.setTimeout(() => fired.push('b'), 1000);
    window.clearTimeout(cancelled);
    t.mock.timers.tick(999);
    assert.deepEqual(fired, []);
    t.mock.timers.tick(1);
    assert.deepEqual(fired, ['a']);
});

test('html-fragment：照 index.html 的寫法建出節點（屬性、布林屬性、註解、空元素、實體、textarea、空白）', () => {
    const dom = createFakeDom();
    const html = '<div id="box" class="a b" data-x="1"><!-- 註解 --><span>🔗</span> <span>&lt;序號&gt;</span>\n    <input type="radio" id="r" checked><button id="b" disabled>按</button><textarea id="t">預設</textarea></div>';
    mountFromHtml(dom, html, ['box']);
    const box = dom.document.getElementById('box');
    assert.deepEqual([box.className, box.dataset.x, box.textContent], ['a b', '1', '🔗 <序號>按預設']);
    assert.equal(dom.document.getElementById('r').checked, true);
    assert.equal(dom.document.getElementById('b').disabled, true);
    assert.equal(dom.document.getElementById('t').value, '預設');
    assert.throws(() => mountFromHtml(dom, html, ['nope']), /nope/);
    // 認得的四個實體以外一律丟錯（文字、屬性值、textarea 的內容都一樣），不會悄悄留下 &nbsp; 這種字面文字；單獨的 & 不是實體
    for (const unknown of ['<p id="e1">a&nbsp;b</p>', '<p id="e1" title="&copy;">x</p>', '<textarea id="e1">&#39;</textarea>']) {
        assert.throws(() => mountFromHtml(dom, unknown, ['e1']), /實體/, unknown);
    }
    mountFromHtml(dom, '<p id="amp">A &amp; B &amp;lt; C & D</p>', ['amp']);
    assert.equal(dom.document.getElementById('amp').textContent, 'A & B &lt; C & D');
});
