const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDom } = require('./helpers/fake-dom.js');

const ROOT = path.join(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

// 斷言訊息用：只印出 <tag.class>。assert 的差異輸出會把 parentNode／childNodes 互相參照的整棵樹都印出來，
// 所以元素的比對一律先轉成這種標籤字串，或用 assert.ok(a === b, 訊息)
const label = (node) => (node ? `<${node.tagName.toLowerCase()}${node.className ? `.${node.className.split(/\s+/).join('.')}` : ''}>` : String(node));

// matchMedia 替身：依 window.innerWidth 算 `(max-width: Npx)` 的 matches，並記錄所有被建立的查詢與 change 監聽器。
// resize(寬度) 和瀏覽器一樣：更新 innerWidth、只在 matches 真的改變時通知 change 監聽器，最後派送 window 的 resize 事件。
// 切換鈕不該再靠它判斷手機寬度，所以正確的實作不會建立任何查詢
function installMatchMedia(window) {
    const queries = [];
    window.matchMedia = (query) => {
        const parsed = /^\(max-width:\s*(\d+)px\)$/.exec(query);
        if (!parsed) throw new Error(`matchMedia 替身只支援 (max-width: Npx)，收到：${query}`);
        const mediaQuery = {
            media: query,
            maxWidth: Number(parsed[1]),
            matches: window.innerWidth <= Number(parsed[1]),
            listeners: [],
            addEventListener(type, listener) { if (type === 'change') this.listeners.push(listener); },
            removeEventListener(type, listener) { this.listeners = this.listeners.filter((entry) => entry !== listener); }
        };
        queries.push(mediaQuery);
        return mediaQuery;
    };
    return {
        queries,
        changeListenerCount: () => queries.reduce((sum, mediaQuery) => sum + mediaQuery.listeners.length, 0),
        resize(width) {
            window.innerWidth = width;
            for (const mediaQuery of queries) {
                const matches = width <= mediaQuery.maxWidth;
                if (matches === mediaQuery.matches) continue;
                mediaQuery.matches = matches;
                for (const listener of mediaQuery.listeners) listener({ type: 'change', media: mediaQuery.media, matches });
            }
            window.dispatchEvent(new window.Event('resize'));
        }
    };
}

// 和真實頁面一樣：body 放 header.header > div.container，裡面是 logo、nav.nav，☰ 已經由 initHamburgerMenu() 接在最後。
// 載入真正的 common.js 後直接呼叫 initThemeToggle()（它的頂層只定義東西並登記 DOMContentLoaded）。
// themeManager 替身記錄每次 updateThemeToggleButtons() 被呼叫時文件裡有幾顆 .theme-toggle：
// 真正的實作只會更新「已經在文件裡」的按鈕，切換鈕要先放進頁首、再更新圖示
function setup({ innerWidth = 1024, withHamburger = true, withHeader = true } = {}) {
    const dom = createFakeDom({ innerWidth });
    const { document, window } = dom;
    const media = installMatchMedia(window);
    const themeManager = {
        togglesInDocumentAtUpdate: [],
        toggleCalls: 0,
        updateThemeToggleButtons() { this.togglesInDocumentAtUpdate.push(document.querySelectorAll('.theme-toggle').length); },
        toggle() { this.toggleCalls += 1; }
    };
    window.themeManager = themeManager;

    const logo = dom.el('a', { class: 'logo', href: '/' }, 'FF14.tw');
    const nav = dom.el('nav', { id: 'site-nav', class: 'nav' }, dom.el('a', { href: '/' }, '首頁'), dom.el('div', { class: 'language-switcher' }));
    const hamburger = withHamburger ? dom.el('button', { type: 'button', class: 'hamburger' }) : null;
    const container = dom.el('div', { class: 'container' }, logo, nav, ...(hamburger ? [hamburger] : []));
    // 沒有頁首時，導覽列單獨放在 body：只有 `.header .container` 才是切換鈕該去的地方
    if (withHeader) document.body.appendChild(dom.el('header', { class: 'header' }, container));
    else document.body.appendChild(nav);

    dom.load('assets/js/common.js');
    window.initThemeToggle();
    return { dom, document, window, media, themeManager, container, logo, nav, hamburger };
}

for (const innerWidth of [1024, 390]) {
    test(`主題切換鈕只建立一次，放在頁首容器、☰ 前面，不在導覽列裡（視窗寬 ${innerWidth}px）`, () => {
        const { document, container, nav } = setup({ innerWidth });

        const toggles = document.querySelectorAll('.theme-toggle');
        assert.equal(toggles.length, 1, '整頁只有一顆 .theme-toggle');
        assert.deepEqual(container.children.map(label), ['<a.logo>', '<nav.nav>', '<button.theme-toggle>', '<button.hamburger>'], '頁首容器的順序：logo、導覽列、切換鈕、☰');
        assert.equal(nav.querySelectorAll('.theme-toggle').length, 0, '手機版的導覽列是收起來的抽屜，切換鈕不能放在裡面');
        assert.equal(toggles[0].getAttribute('type'), 'button', '沒有 type 的 button 放在表單裡會送出表單');
    });
}

test('跨過 768px 時切換鈕不會被搬動', () => {
    const { container, media } = setup({ innerWidth: 1024 });
    const toggle = container.querySelector('.theme-toggle');
    const order = container.children.map(label);
    assert.ok(toggle, '前提：切換鈕在頁首容器裡');

    assert.equal(media.queries.length, 0, '位置由 CSS 決定，JS 不需要 matchMedia');
    assert.equal(media.changeListenerCount(), 0, '沒有 change 監聽器，視窗大小改變時就不會搬動切換鈕');

    // 手機橫拿轉直拿、再轉回來：搬動有焦點的按鈕會讓焦點掉回頁面最上面，所以不搬
    for (const width of [390, 768, 769, 1024]) {
        media.resize(width);
        assert.ok(container.querySelector('.theme-toggle') === toggle, `視窗改成 ${width}px 後仍是同一顆切換鈕`);
        assert.deepEqual(container.children.map(label), order, `視窗改成 ${width}px 後順序不變`);
    }
});

test('頁首沒有 ☰ 時，切換鈕接在頁首容器最後', () => {
    const { document, container, nav } = setup({ withHamburger: false });

    assert.equal(document.querySelectorAll('.theme-toggle').length, 1);
    assert.deepEqual(container.children.map(label), ['<a.logo>', '<nav.nav>', '<button.theme-toggle>']);
    assert.equal(nav.querySelectorAll('.theme-toggle').length, 0);
});

test('找不到 .header .container 時直接結束，不會把切換鈕放到別處', () => {
    const { document, media, themeManager } = setup({ withHeader: false });

    assert.equal(document.querySelectorAll('.theme-toggle').length, 0, '只有導覽列、沒有頁首容器：不建立切換鈕');
    assert.equal(themeManager.togglesInDocumentAtUpdate.length, 0, '沒有按鈕可更新');
    assert.equal(media.queries.length, 0);
});

test('切換鈕放進頁首之後才更新圖示，按下會切換主題', () => {
    const { document, themeManager } = setup();
    const toggle = document.querySelector('.theme-toggle');

    // updateThemeToggleButtons() 只更新文件裡的 .theme-toggle：最後一次更新時按鈕要已經在文件裡，才拿得到圖示與 aria-label
    assert.ok(themeManager.togglesInDocumentAtUpdate.length >= 1, '至少更新一次圖示');
    assert.equal(themeManager.togglesInDocumentAtUpdate.at(-1), 1, `最後一次更新時切換鈕已在文件裡（每次更新時文件裡的切換鈕數：${themeManager.togglesInDocumentAtUpdate.join(', ')}）`);

    assert.equal(themeManager.toggleCalls, 0);
    toggle.click();
    assert.equal(themeManager.toggleCalls, 1);
});

test('common.js 不再有 placeThemeToggle 與首頁卡片的點擊處理', () => {
    const src = read('assets/js/common.js');
    assert.ok(!src.includes('placeThemeToggle'));
    assert.ok(!src.includes("querySelectorAll('.tool-card')"));
});

test('common.css 沒有 .logo-main 與 .logo-tool 這兩個沒人用的樣式', () => {
    const css = read('assets/css/common.css');
    // 不用 assert.doesNotMatch：失敗時它會把整份 CSS 印出來
    assert.ok(!/\.logo-main(?![\w-])/.test(css), 'nav-template.js 不會產生 .logo-main');
    // .logo-tool-name 仍在使用（nav-template.js 產生），所以不能只比對前綴
    assert.ok(!/\.logo-tool(?![\w-])/.test(css), 'nav-template.js 不會產生 .logo-tool（工具名稱是 .logo-tool-name）');
});

// ---------- 網址列顏色（<meta name="theme-color">） ----------
// ThemeManager 每次套用主題時，從 CSS 讀 --color-browser-bar 寫回 <meta name="theme-color">（JS 不寫色碼）。
// fake-dom 沒有 CSS 引擎，也沒有 getComputedStyle：這一段載入真正的 common.js，由測試補上 window.getComputedStyle、
// matchMedia 與 localStorage 的替身，再用 vm 在同一個全域裡建立 ThemeManager（class 是詞法繫結，不會掛在 window 上）

const BAR_TOKEN = '--color-browser-bar';
// 頁首漸層的起點色：HTML 裡寫淺色的值，深色的值只在 tokens.css（兩個值本身由 share-preview.test.js 另外守住）
const LIGHT_BAR = '#667eea';
const DARK_BAR = '#4b5ca8';

// tokens.css 裡 --color-browser-bar 在淺色（:root）與深色（[data-theme="dark"]）各自區塊的值
function barColorsInTokens() {
    const css = read('assets/css/tokens.css');
    const valueIn = (selector) => {
        const start = css.indexOf(`\n${selector} {`);
        assert.notEqual(start, -1, `tokens.css 找不到 ${selector} 區塊`);
        const match = new RegExp(`${BAR_TOKEN}:\\s*([^;]+);`).exec(css.slice(start, css.indexOf('\n}', start)));
        assert.ok(match, `tokens.css 的 ${selector} 區塊沒有 ${BAR_TOKEN}`);
        return match[1].trim();
    };
    return { light: valueIn(':root'), dark: valueIn('[data-theme="dark"]') };
}

// window.getComputedStyle 的替身：只認 --color-browser-bar，依 <html data-theme> 回傳 tokens.css 的深色或淺色值
// （和 CSS 一樣，只有 data-theme="dark" 是深色），其他名稱回傳 ''。
// 值前面多留一個空白：自訂屬性的值依瀏覽器與版本可能帶著前後的空白，實作要先去掉，不然 content 會變成 ' #4b5ca8'
function tokensComputedStyle(document) {
    const colors = barColorsInTokens();
    return () => ({
        getPropertyValue(name) {
            if (name !== BAR_TOKEN) return '';
            return ` ${document.documentElement.getAttribute('data-theme') === 'dark' ? colors.dark : colors.light}`;
        }
    });
}

// matchMedia 替身：ThemeManager 只問 (prefers-color-scheme: dark)，其他查詢丟錯（正確的實作不會問別的）。
// systemDark 是系統現在是不是深色；change(matches) 模擬系統切換深淺色，和瀏覽器一樣讓查詢的 matches 變了再通知 change 監聽器
function installColorSchemeMedia(window, systemDark) {
    const query = '(prefers-color-scheme: dark)';
    const mediaQuery = {
        media: query,
        matches: systemDark,
        listeners: [],
        addEventListener(type, listener) { if (type === 'change') this.listeners.push(listener); },
        removeEventListener(type, listener) { this.listeners = this.listeners.filter((entry) => entry !== listener); }
    };
    window.matchMedia = (asked) => {
        if (asked !== query) throw new Error(`matchMedia 替身只支援 ${query}，收到：${asked}`);
        return mediaQuery;
    };
    return {
        change(matches) {
            mediaQuery.matches = matches;
            for (const listener of mediaQuery.listeners) listener({ type: 'change', media: query, matches });
        }
    };
}

// localStorage 替身：ThemeManager 讀寫 localStorage['theme']；沒有的話它會在 console 留警告。
// throws: true 是瀏覽器封鎖網站資料：getItem、setItem、removeItem 都丟 Error。回傳 items（Map），讓測試檢查存了什麼
function installLocalStorage(window, stored, { throws = false } = {}) {
    const items = new Map(Object.entries(stored));
    const guard = () => { if (throws) throw new Error('localStorage 不能用'); };
    window.localStorage = {
        getItem: (key) => { guard(); return items.get(key) ?? null; },
        setItem: (key, value) => { guard(); items.set(key, String(value)); },
        removeItem: (key) => { guard(); items.delete(key); }
    };
    return items;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// 圖示是 SVG：ThemeManager 用 createElementNS() 建、用 replaceChildren() 換，fake-dom 兩個都沒有，只在這份 document 上補（不動共用的 fake-dom）。
// 補的 createElementNS 把 namespaceURI 記在元素上：SVG 一定要用 createElementNS 建，用 createElement 建出來的 <svg> 在瀏覽器裡是畫不出來的。
// replaceChildren 補在這份 document 之後建出來的每個元素上：切換鈕有時是測試先放好的，有時要等真正的 initThemeToggle() 在頁面流程裡才建
function addSvgShims(document) {
    const createElement = document.createElement.bind(document);
    document.createElement = (tag) => {
        const element = createElement(tag);
        element.replaceChildren = (...nodes) => {
            element.textContent = '';
            for (const node of nodes) element.appendChild(node);
        };
        return element;
    };
    document.createElementNS = (namespace, tag) => {
        const element = document.createElement(tag);
        element.namespaceURI = namespace;
        return element;
    };
}

// 在 body 放一顆 <button class="theme-toggle">（真正的頁面是 initThemeToggle() 放的；這裡要在建立 ThemeManager 之前就放好，
// 它建立時第一次更新圖示與名稱才有按鈕可更新）
function addToggleButton(dom) {
    addSvgShims(dom.document);
    const button = dom.el('button', { class: 'theme-toggle', type: 'button' });
    dom.document.body.appendChild(button);
    return button;
}

// i18n 替身：從真正的翻譯檔（assets/js/i18n/translations/common.js）取字，參數用真正的 FF14Utils.replaceParams() 代入。
// 不做 fallback chain，所以每一種語言都要自己有主題鈕的鍵。要在建立 ThemeManager 之前設好
function installI18n(dom, lang) {
    const { window } = dom;
    dom.load('assets/js/i18n/translations/common.js');
    const translations = vm.runInContext('CommonTranslations', window);
    const FF14Utils = vm.runInContext('FF14Utils', window);
    window.i18n = {
        hasKey: (key) => key in translations[lang],
        getText: (key, ...args) => FF14Utils.replaceParams(translations[lang][key], ...args),
        onLanguageChange() {}
    };
}

// 頁面的 <head> 放 <meta name="theme-color" content="#667eea">（meta: false 是沒有這一行的頁面）。
// style：'tokens' 是照 tokens.css 回答的 getComputedStyle 替身，函式是自己的替身，null 是沒有 getComputedStyle（fake-dom 預設就沒有）；
// stored 是 localStorage 的初始內容，systemDark 是系統偏好。建立 ThemeManager 時就會套用主題。
// toggle: true 是 body 裡有一顆 .theme-toggle（見 addToggleButton）；storageThrows: true 是 localStorage 讀寫都丟例外；
// noMatchMedia: true 是沒有 matchMedia（media 是 null）；lang 是 'zh'、'en'、'ja' 時裝上 i18n 替身，null 是沒有翻譯的頁面
function setupBrowserBar({
    meta = true, style = 'tokens', systemDark = false, stored = {},
    toggle = false, storageThrows = false, noMatchMedia = false, lang = null
} = {}) {
    const dom = createFakeDom();
    const { document, window } = dom;
    const themeColor = meta ? dom.el('meta', { name: 'theme-color', content: LIGHT_BAR }) : null;
    if (themeColor) document.head.appendChild(themeColor);

    const media = noMatchMedia ? null : installColorSchemeMedia(window, systemDark);
    const items = installLocalStorage(window, stored, { throws: storageThrows });
    if (style === 'tokens') window.getComputedStyle = tokensComputedStyle(document);
    else if (style) window.getComputedStyle = style;
    const toggleButton = toggle ? addToggleButton(dom) : null;

    dom.load('assets/js/common.js');
    if (lang) installI18n(dom, lang);
    const manager = vm.runInContext('new ThemeManager()', window);
    return { dom, document, window, media, manager, themeColor, items, toggleButton };
}

const barOf = (page) => page.themeColor.getAttribute('content');

test('ThemeManager：套用深色時 theme-color 是 #4b5ca8，切回淺色是 #667eea', () => {
    const page = setupBrowserBar();
    assert.equal(page.document.documentElement.getAttribute('data-theme'), 'light', '前提：系統是淺色、沒存過偏好，一開始是淺色');
    assert.equal(barOf(page), LIGHT_BAR, '淺色：HTML 裡寫的就是淺色的值');

    assert.equal(page.manager.toggle(), 'dark');
    assert.equal(page.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(barOf(page), DARK_BAR, '深色：換成深色的值，前後沒有空白');

    assert.equal(page.manager.toggle(), 'light');
    assert.equal(barOf(page), LIGHT_BAR, '切回淺色：換回淺色的值');
});

test('ThemeManager：打開頁面時就是深色（存著的偏好或系統偏好），theme-color 一開始就是深色的值；系統偏好改變時跟著換', () => {
    // 存著的偏好是深色：HTML 裡寫的淺色值在 ThemeManager 建立時就換掉，不用等玩家按切換鈕
    const storedDark = setupBrowserBar({ stored: { theme: 'dark' } });
    assert.equal(storedDark.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(barOf(storedDark), DARK_BAR, '存著的偏好是深色');

    // 沒存過偏好、系統是深色
    const systemDark = setupBrowserBar({ systemDark: true });
    assert.equal(systemDark.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(barOf(systemDark), DARK_BAR, '沒存過偏好，系統是深色');

    // 沒存過偏好、頁面開著時系統在深淺色之間切換
    const following = setupBrowserBar();
    assert.equal(barOf(following), LIGHT_BAR);
    following.media.change(true);
    assert.equal(following.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(barOf(following), DARK_BAR, '系統改成深色');
    following.media.change(false);
    assert.equal(barOf(following), LIGHT_BAR, '系統改回淺色');
});

test('ThemeManager：沒有 theme-color 或讀不到 token 時不改、不丟錯', () => {
    // 頁面沒有 <meta name="theme-color">：不丟錯，也不替頁面補一個
    let withoutMeta;
    assert.doesNotThrow(() => { withoutMeta = setupBrowserBar({ meta: false }); }, '沒有 theme-color：建立 ThemeManager 不丟錯');
    assert.doesNotThrow(() => withoutMeta.manager.toggle(), '沒有 theme-color：切換主題不丟錯');
    assert.equal(withoutMeta.document.documentElement.getAttribute('data-theme'), 'dark', '沒有 theme-color：主題照樣切成深色');
    assert.equal(withoutMeta.document.querySelectorAll('meta').length, 0, '沒有 theme-color：不補上一個');

    // 讀不到 token：沒有 getComputedStyle、讀到空字串、讀到只有空白。content 維持 HTML 裡的值（不會被清成空的），主題照樣切換
    const unreadable = {
        '沒有 getComputedStyle': null,
        'token 讀到空字串': () => ({ getPropertyValue: () => '' }),
        'token 讀到只有空白': () => ({ getPropertyValue: () => '  ' })
    };
    for (const [name, style] of Object.entries(unreadable)) {
        let page;
        assert.doesNotThrow(() => { page = setupBrowserBar({ style }); }, `${name}：建立 ThemeManager 不丟錯`);
        assert.equal(barOf(page), LIGHT_BAR, `${name}：建立後 content 不變`);
        assert.doesNotThrow(() => page.manager.toggle(), `${name}：切換主題不丟錯`);
        assert.equal(page.document.documentElement.getAttribute('data-theme'), 'dark', `${name}：主題照樣切成深色`);
        assert.equal(barOf(page), LIGHT_BAR, `${name}：切換後 content 仍是 HTML 裡的值`);
    }
});

// ---------- 三段模式：淺色、深色、跟著系統 ----------
// 一顆按鈕按一下換一段：mode 是玩家選的（light、dark、system），外觀（<html data-theme>）只有 light 與 dark，跟著系統時由系統決定。
// localStorage['theme'] 只存 light 與 dark，跟著系統就是沒有這個鍵

const themeOf = (page) => page.document.documentElement.getAttribute('data-theme');

// 按鈕名稱：title 一定要和 aria-label 是同一句（滑鼠移上去看得到的提示，與螢幕閱讀器念的名稱）
const labelOf = (page) => {
    const name = page.toggleButton.getAttribute('aria-label');
    assert.equal(page.toggleButton.getAttribute('title'), name, 'title 與 aria-label 是同一句');
    return name;
};

test('ThemeManager.nextMode：系統是深色時 跟著系統 → 淺色 → 深色 → 跟著系統，系統是淺色時先到深色', () => {
    const dom = createFakeDom();
    dom.load('assets/js/common.js');
    // 純函式：拆出來直接呼叫，不靠 this
    const { nextMode } = vm.runInContext('ThemeManager', dom.window);

    assert.equal(nextMode('system', 'dark'), 'light');
    assert.equal(nextMode('light', 'dark'), 'dark');
    assert.equal(nextMode('dark', 'dark'), 'system');
    assert.equal(nextMode('system', 'light'), 'dark');
    assert.equal(nextMode('dark', 'light'), 'light');
    assert.equal(nextMode('light', 'light'), 'system');
});

test('ThemeManager：沒存過偏好是跟著系統；按三下依序換到相反的顏色、同色、跟著系統，存 light／dark，回到跟著系統時刪掉', () => {
    // 每一下：[toggle() 回傳的模式, data-theme, localStorage['theme']（undefined 是沒有這個鍵）]
    const cycles = [
        { systemDark: true, system: 'dark', steps: [['light', 'light', 'light'], ['dark', 'dark', 'dark'], ['system', 'dark', undefined]] },
        { systemDark: false, system: 'light', steps: [['dark', 'dark', 'dark'], ['light', 'light', 'light'], ['system', 'light', undefined]] }
    ];
    for (const { systemDark, system, steps } of cycles) {
        const where = `系統是${systemDark ? '深色' : '淺色'}`;
        const page = setupBrowserBar({ systemDark });
        assert.equal(page.manager.mode, 'system', `${where}：沒存過偏好是跟著系統`);
        assert.equal(themeOf(page), system, `${where}：外觀照系統`);
        assert.equal(page.items.has('theme'), false, `${where}：一開始什麼都沒存`);

        steps.forEach(([mode, theme, stored], index) => {
            const step = `${where}，第 ${index + 1} 下`;
            assert.equal(page.manager.toggle(), mode, `${step}：回傳新的模式`);
            assert.equal(page.manager.mode, mode, `${step}：模式`);
            assert.equal(themeOf(page), theme, `${step}：data-theme`);
            assert.equal(page.items.get('theme'), stored, `${step}：存起來的值`);
            assert.equal(page.items.has('theme'), stored !== undefined, `${step}：回到跟著系統時把鍵刪掉，不是存成 'system'`);
        });
    }
});

test('ThemeManager：存著 light／dark 照舊；存著壞掉的值時當成跟著系統', () => {
    const light = setupBrowserBar({ stored: { theme: 'light' }, systemDark: true });
    assert.equal(light.manager.mode, 'light');
    assert.equal(themeOf(light), 'light', '存著淺色：系統是深色也照存的');

    const dark = setupBrowserBar({ stored: { theme: 'dark' }, systemDark: false });
    assert.equal(dark.manager.mode, 'dark');
    assert.equal(themeOf(dark), 'dark', '存著深色：系統是淺色也照存的');

    // 'system' 也算壞掉的值：跟著系統是「沒有這個鍵」，從來不會存成 'system'
    for (const bad of ['blue', '', 'DARK', 'system']) {
        const page = setupBrowserBar({ stored: { theme: bad }, systemDark: true });
        assert.equal(page.manager.mode, 'system', `存著 ${JSON.stringify(bad)}：當成跟著系統`);
        assert.equal(themeOf(page), 'dark', `存著 ${JSON.stringify(bad)}：外觀照系統（深色）`);
        assert.equal(page.manager.toggle(), 'light', `存著 ${JSON.stringify(bad)}：第一下換到和系統相反的顏色`);
    }
});

test('ThemeManager：跟著系統時系統切換深淺色，畫面與按鈕名稱跟著換；自己選了深色時畫面不變，按鈕名稱的下一段跟著重算', () => {
    const following = setupBrowserBar({ toggle: true, systemDark: false });
    assert.equal(labelOf(following), '主題：跟著系統（現在是淺色）。按一下改成深色');
    following.media.change(true);
    assert.equal(themeOf(following), 'dark', '跟著系統：系統改成深色，畫面跟著變');
    assert.equal(labelOf(following), '主題：跟著系統（現在是深色）。按一下改成淺色');

    const chosen = setupBrowserBar({ toggle: true, stored: { theme: 'dark' }, systemDark: true });
    assert.equal(labelOf(chosen), '主題：深色。按一下改成跟著系統');
    chosen.media.change(false);
    assert.equal(themeOf(chosen), 'dark', '自己選了深色：系統改成淺色，畫面不變');
    assert.equal(chosen.manager.mode, 'dark');
    assert.equal(chosen.items.get('theme'), 'dark', '系統改變不會動到存著的偏好');
    assert.equal(labelOf(chosen), '主題：深色。按一下改成淺色', '下一段照系統現在的顏色重算');
});

test('主題鈕：圖示代表現在的狀態，aria-label 與 title 是同一句（沒有翻譯的頁面用中文）', () => {
    const page = setupBrowserBar({ toggle: true, systemDark: true, lang: null });
    const button = page.toggleButton;
    // 按鈕裡的圖形：每一段都只有一個 <svg>，數裡面的 circle、path、line，而且每個元素都在 SVG 的命名空間裡
    const shapes = (where) => {
        assert.deepEqual(button.children.map(label), ['<svg>'], `${where}：按鈕裡只有一個 <svg>`);
        const counts = {};
        for (const tag of ['svg', 'circle', 'path', 'line']) {
            const found = button.querySelectorAll(tag);
            for (const element of found) assert.equal(element.namespaceURI, SVG_NS, `${where}：<${tag}> 要用 createElementNS 建`);
            counts[tag] = found.length;
        }
        return counts;
    };

    // 跟著系統：◑（圓形外框加右半邊實心）
    assert.deepEqual(shapes('跟著系統'), { svg: 1, circle: 1, path: 1, line: 0 });
    const svg = button.querySelector('svg');
    assert.equal(svg.getAttribute('viewBox'), '0 0 24 24');
    const circle = button.querySelector('circle');
    assert.deepEqual([circle.getAttribute('cx'), circle.getAttribute('cy'), circle.getAttribute('r')], ['12', '12', '9'], '外框是圓心 (12, 12)、半徑 9 的圓');
    assert.equal(button.querySelector('path').getAttribute('d'), 'M12 3a9 9 0 0 1 0 18z', '右半邊實心');
    assert.equal(labelOf(page), '主題：跟著系統（現在是深色）。按一下改成淺色');

    // 淺色：太陽（一個圓加 8 條光線）
    assert.equal(page.manager.toggle(), 'light');
    assert.deepEqual(shapes('淺色'), { svg: 1, circle: 1, path: 0, line: 8 });
    assert.equal(labelOf(page), '主題：淺色。按一下改成深色');

    // 深色：月亮（一個 path，沒有圓）
    assert.equal(page.manager.toggle(), 'dark');
    assert.deepEqual(shapes('深色'), { svg: 1, circle: 0, path: 1, line: 0 });
    assert.equal(labelOf(page), '主題：深色。按一下改成跟著系統');

    // 回到跟著系統：圖示也回到 ◑
    assert.equal(page.manager.toggle(), 'system');
    assert.deepEqual(shapes('回到跟著系統'), { svg: 1, circle: 1, path: 1, line: 0 });
});

test('主題鈕：英文、日文的名稱；中文翻譯和沒有翻譯時的中文一字不差', () => {
    // 系統是深色、沒存過偏好：一開始是跟著系統，按兩下依序是淺色、深色
    const expected = {
        en: ['Theme: system (currently dark). Switch to light', 'Theme: light. Switch to dark', 'Theme: dark. Switch to system'],
        ja: ['テーマ：システム設定（現在はダーク）。ライトに切り替え', 'テーマ：ライト。ダークに切り替え', 'テーマ：ダーク。システム設定に切り替え'],
        zh: ['主題：跟著系統（現在是深色）。按一下改成淺色', '主題：淺色。按一下改成深色', '主題：深色。按一下改成跟著系統']
    };
    // 回傳三段的名稱：跟著系統、按一下之後、按兩下之後
    const labelsOf = (lang) => {
        const page = setupBrowserBar({ toggle: true, systemDark: true, lang });
        const labels = [labelOf(page)];
        for (let press = 0; press < 2; press += 1) {
            page.manager.toggle();
            labels.push(labelOf(page));
        }
        return labels;
    };

    for (const lang of ['en', 'ja', 'zh']) assert.deepEqual(labelsOf(lang), expected[lang], `${lang} 的三段名稱`);
    // 沒有載入翻譯的頁面（沒有 window.i18n）用 common.js 裡的中文備用字，要和中文翻譯一字不差
    assert.deepEqual(labelsOf(null), expected.zh, '沒有翻譯時的中文');
    assert.deepEqual(labelsOf(null), labelsOf('zh'), '沒有翻譯時的中文與中文翻譯完全相同');
});

test('ThemeManager：localStorage 讀寫都丟例外時照樣三段切換，不丟錯', (t) => {
    // 讀寫失敗時 ThemeManager 照舊用 console.warn 提醒，這裡接住不印出來，也確認真的走到了例外那一條路
    const warn = t.mock.method(console, 'warn', () => {});

    let page;
    assert.doesNotThrow(() => { page = setupBrowserBar({ storageThrows: true, systemDark: false }); }, '讀不到存的偏好：建立不丟錯');
    assert.equal(page.manager.mode, 'system');
    assert.equal(themeOf(page), 'light');
    const warnedByReading = warn.mock.callCount();
    assert.ok(warnedByReading >= 1, '讀不到存的偏好時在 console 留警告');

    const modes = [];
    const themes = [];
    for (let press = 1; press <= 3; press += 1) {
        assert.doesNotThrow(() => { modes.push(page.manager.toggle()); }, `第 ${press} 下不丟錯`);
        themes.push(themeOf(page));
    }
    assert.deepEqual(modes, ['dark', 'light', 'system']);
    assert.deepEqual(themes, ['dark', 'light', 'light']);
    assert.ok(warn.mock.callCount() > warnedByReading, '存不進去時在 console 留警告');
    assert.equal(page.items.size, 0, '什麼都沒存進去');
});

test('ThemeManager：沒有 matchMedia 時跟著系統當成淺色，三段照樣切換', () => {
    let page;
    assert.doesNotThrow(() => { page = setupBrowserBar({ noMatchMedia: true }); }, '沒有 matchMedia：建立不丟錯');
    assert.equal(page.media, null, '前提：這一頁沒有 matchMedia');
    assert.equal(page.manager.mode, 'system');
    assert.equal(themeOf(page), 'light', '看不到系統偏好：當成淺色');

    const modes = [];
    for (let press = 0; press < 3; press += 1) modes.push(page.manager.toggle());
    assert.deepEqual(modes, ['dark', 'light', 'system'], '系統當成淺色：先到深色，再淺色，再跟著系統');
    assert.equal(themeOf(page), 'light');
    assert.equal(page.items.has('theme'), false);
});

test('翻譯檔：三語都有主題鈕的 5 個鍵、參數一致，舊的兩個鍵拿掉', () => {
    const dom = createFakeDom();
    dom.load('assets/js/i18n/translations/common.js');
    const translations = vm.runInContext('CommonTranslations', dom.window);

    // 每個鍵要有的 {參數}（照字母排序）
    const params = {
        theme_toggle_label: ['current', 'next'],
        theme_mode_light: [],
        theme_mode_dark: [],
        theme_mode_system: [],
        theme_mode_system_now: ['appearance']
    };
    const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

    for (const lang of ['zh', 'en', 'ja']) {
        for (const [key, expected] of Object.entries(params)) {
            assert.equal(typeof translations[lang][key], 'string', `${lang} 缺少 ${key}`);
            assert.ok(translations[lang][key] !== '', `${lang} 的 ${key} 是空的`);
            assert.deepEqual(placeholders(translations[lang][key]), expected, `${lang} 的 ${key} 的 {參數}`);
        }
        for (const removed of ['theme_toggle_dark', 'theme_toggle_light']) {
            assert.ok(!(removed in translations[lang]), `${lang} 的 ${removed} 已拿掉`);
        }
    }
});

// ---------- 真正的頁面流程 ----------
// 上面的測試不是拿替身的 themeManager 測切換鈕的位置，就是自己建 ThemeManager、自己放切換鈕，i18n 也是替身。
// 這一個照頁面真正的順序走：真的 i18n-manager.js 與翻譯檔、真的 common.js 的 DOMContentLoaded 處理
// （先 new ThemeManager()，再 ☰，再由真的 initThemeToggle() 建出切換鈕）、真的點擊，以及真的 I18nManager.setLanguage()。
// fake-dom 沒有的 matchMedia、localStorage 與 SVG 的兩個方法由測試補替身

test('真正的頁面流程：切換鈕一建好就有圖示與名稱，按下去、切換語言之後都對，焦點一直在同一顆按鈕上', (t) => {
    // I18nManager 會接住觀察者丟的錯、只留 console.error：整段流程一則 console 訊息都不該有，所以接起來數，也不印出來
    const warn = t.mock.method(console, 'warn', () => {});
    const error = t.mock.method(console, 'error', () => {});

    const dom = createFakeDom({ readyState: 'loading', innerWidth: 390 });
    const { document, window } = dom;
    // matchMedia：ThemeManager 問系統的深淺色（系統是深色），☰ 問視窗寬度，兩個替身各答一種
    installColorSchemeMedia(window, true);
    const askColorScheme = window.matchMedia;
    installMatchMedia(window);
    const askWidth = window.matchMedia;
    window.matchMedia = (query) => (query.startsWith('(prefers-color-scheme') ? askColorScheme : askWidth)(query);
    installLocalStorage(window, { ff14tw_preferred_language: 'zh' });
    addSvgShims(document);

    const nav = dom.el('nav', { id: 'site-nav', class: 'nav' }, dom.el('a', { href: '/' }, '首頁'), dom.el('div', { class: 'language-switcher' }));
    document.body.appendChild(dom.el('header', { class: 'header' }, dom.el('div', { class: 'container' }, dom.el('a', { class: 'logo', href: '/' }, 'FF14.tw'), nav)));

    dom.load('assets/js/i18n/i18n-manager.js');
    dom.load('assets/js/i18n/translations/common.js');
    // 建 ThemeManager 的那一刻切換鈕還不在頁面上（要等 initThemeToggle()），沒有人看得到名稱，不該去問主題鈕的翻譯：
    // 記下每一次問翻譯時頁面上有沒有切換鈕
    const asked = [];
    const hasKey = window.i18n.hasKey.bind(window.i18n);
    window.i18n.hasKey = (key) => {
        asked.push({ key, buttonInPage: document.querySelector('.theme-toggle') !== null });
        return hasKey(key);
    };
    dom.load('assets/js/common.js');

    document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const button = document.querySelector('.theme-toggle');
    assert.ok(button, '真的 initThemeToggle() 建出了切換鈕');
    assert.deepEqual(['.hamburger', '.theme-toggle', '.back-to-top'].map((selector) => document.querySelectorAll(selector).length), [1, 1, 1],
        '☰、切換鈕、返回頂部都建好了：DOMContentLoaded 的處理一路跑完');
    assert.ok(asked.some(({ key, buttonInPage }) => key === 'theme_toggle_label' && buttonInPage), '前提：切換鈕放進頁面之後有去問名稱的翻譯');
    assert.deepEqual(asked.filter(({ key, buttonInPage }) => key.startsWith('theme_') && !buttonInPage).map(({ key }) => key), [],
        '切換鈕還不在頁面上時（建 ThemeManager 的那一刻）不去問主題鈕的翻譯');

    const page = { document, toggleButton: button };
    const SYSTEM = { svg: 1, circle: 1, path: 1, line: 0 };
    const SUN = { svg: 1, circle: 1, path: 0, line: 8 };
    const MOON = { svg: 1, circle: 0, path: 1, line: 0 };
    const shapesOf = () => Object.fromEntries(['svg', 'circle', 'path', 'line'].map((tag) => [tag, button.querySelectorAll(tag).length]));
    // 每一步之後：還是同一顆按鈕、焦點沒動，圖示、畫面的外觀與名稱都對（labelOf 同時確認 title 與 aria-label 是同一句）
    const check = (step, { shapes, theme, name }) => {
        assert.ok(document.querySelector('.theme-toggle') === button, `${step}：還是同一顆切換鈕`);
        assert.ok(document.activeElement === button, `${step}：焦點留在切換鈕上（現在在 ${label(document.activeElement)}）`);
        assert.deepEqual(shapesOf(), shapes, `${step}：圖示`);
        assert.equal(themeOf(page), theme, `${step}：data-theme`);
        assert.equal(labelOf(page), name, `${step}：名稱`);
    };

    button.focus();
    check('建好時（跟著系統、系統是深色、中文）', { shapes: SYSTEM, theme: 'dark', name: '主題：跟著系統（現在是深色）。按一下改成淺色' });

    // 真的點三下：和系統相反的淺色、深色、回到跟著系統
    button.click();
    check('按一下', { shapes: SUN, theme: 'light', name: '主題：淺色。按一下改成深色' });
    button.click();
    check('按兩下', { shapes: MOON, theme: 'dark', name: '主題：深色。按一下改成跟著系統' });
    button.click();
    check('按三下', { shapes: SYSTEM, theme: 'dark', name: '主題：跟著系統（現在是深色）。按一下改成淺色' });

    // 真的 setLanguage()：名稱與 title 換成那個語言，圖示、外觀與焦點不動
    window.i18n.setLanguage('en');
    check('切換成英文', { shapes: SYSTEM, theme: 'dark', name: 'Theme: system (currently dark). Switch to light' });
    window.i18n.setLanguage('ja');
    check('切換成日文', { shapes: SYSTEM, theme: 'dark', name: 'テーマ：システム設定（現在はダーク）。ライトに切り替え' });
    // 換了語言之後再按，新的名稱也是那個語言
    button.click();
    check('日文時按一下', { shapes: SUN, theme: 'light', name: 'テーマ：ライト。ダークに切り替え' });

    assert.equal(warn.mock.callCount(), 0, '頁面流程沒有 console.warn');
    assert.equal(error.mock.callCount(), 0, '頁面流程沒有 console.error（I18nManager 接住的觀察者錯誤也算）');
});
