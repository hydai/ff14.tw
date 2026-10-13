const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
