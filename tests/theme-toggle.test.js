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

// localStorage 替身：ThemeManager 讀寫 localStorage['theme']；沒有的話它會在 console 留警告
function installLocalStorage(window, stored) {
    const items = new Map(Object.entries(stored));
    window.localStorage = {
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => { items.set(key, String(value)); }
    };
}

// 頁面的 <head> 放 <meta name="theme-color" content="#667eea">（meta: false 是沒有這一行的頁面）。
// style：'tokens' 是照 tokens.css 回答的 getComputedStyle 替身，函式是自己的替身，null 是沒有 getComputedStyle（fake-dom 預設就沒有）；
// stored 是 localStorage 的初始內容，systemDark 是系統偏好。建立 ThemeManager 時就會套用主題
function setupBrowserBar({ meta = true, style = 'tokens', systemDark = false, stored = {} } = {}) {
    const dom = createFakeDom();
    const { document, window } = dom;
    const themeColor = meta ? dom.el('meta', { name: 'theme-color', content: LIGHT_BAR }) : null;
    if (themeColor) document.head.appendChild(themeColor);

    const media = installColorSchemeMedia(window, systemDark);
    installLocalStorage(window, stored);
    if (style === 'tokens') window.getComputedStyle = tokensComputedStyle(document);
    else if (style) window.getComputedStyle = style;

    dom.load('assets/js/common.js');
    const manager = vm.runInContext('new ThemeManager()', window);
    return { document, media, manager, themeColor };
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
