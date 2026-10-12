const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 最小 DOM 替身（不需要 jsdom）：只實作 initThemeToggle() 會碰到的樹狀操作。
// 搬移已經有父節點的元素時，會先從舊父節點的 children 移除，和瀏覽器的行為一致。
function detach(node) {
    const parent = node.parentNode;
    if (!parent) return;
    parent.children.splice(parent.children.indexOf(node), 1);
    node.parentNode = null;
}

function createElement(tag) {
    return {
        tag,
        className: '',
        attributes: {},
        listeners: {},
        children: [],
        parentNode: null,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
        appendChild(child) {
            detach(child);
            this.children.push(child);
            child.parentNode = this;
            return child;
        },
        insertBefore(child, reference) {
            detach(child);
            const index = reference == null ? this.children.length : this.children.indexOf(reference);
            assert.notEqual(index, -1, 'insertBefore 的參考節點必須是這個父節點的子節點');
            this.children.splice(index, 0, child);
            child.parentNode = this;
            return child;
        },
        get previousSibling() {
            const siblings = this.parentNode?.children ?? [];
            return siblings[siblings.indexOf(this) - 1] ?? null;
        }
    };
}

// 斷言訊息用：只印出 <tag.class>。assert 的差異輸出會把 parentNode／children 互相參照的整棵樹都印出來，
// 所以位置的斷言一律用 assert.ok(a === b, 訊息)，把「實際在哪裡」寫進訊息。
function label(node) {
    return node ? `<${node.tag}${node.className ? `.${node.className}` : ''}>` : String(node);
}

// 組出只有導覽列與漢堡鈕的頁首，載入真正的 assets/js/common.js 後呼叫 initThemeToggle()。
// header 對應真實頁面裡的 `.header .container`：漢堡鈕被加進去的容器，也是手機版切換鈕的位置。
// matchMedia 替身只認 `(max-width: Npx)`；resize() 更新寬度後，像瀏覽器一樣
// 只在 matches 真的改變時才通知 change 監聽器。
// withMatchMedia: false 模擬沒有 matchMedia 的環境；withHamburger: false 模擬沒有漢堡鈕的頁首。
function createPage(width, { withMatchMedia = true, withHamburger = true } = {}) {
    const created = [];
    const mediaQueries = [];
    const header = createElement('div');
    header.className = 'header';
    const nav = createElement('nav');
    nav.className = 'nav';
    const hamburger = withHamburger ? createElement('button') : null;
    header.appendChild(nav);
    if (hamburger) {
        hamburger.className = 'hamburger';
        header.appendChild(hamburger);
    }
    // 導覽列本來就有連結與語言切換器，切換鈕在桌機要接在它們後面
    nav.appendChild(createElement('a'));
    nav.appendChild(createElement('div'));

    const context = vm.createContext({
        console,
        innerWidth: width,
        document: {
            addEventListener() {},
            createElement(tag) {
                const node = createElement(tag);
                created.push(node);
                return node;
            },
            querySelector(selector) { return { '.nav': nav, '.hamburger': hamburger }[selector] ?? null; }
        }
    });
    if (withMatchMedia) {
        context.matchMedia = (query) => {
            const parsed = /^\(max-width:\s*(\d+)px\)$/.exec(query);
            if (!parsed) throw new Error(`matchMedia 替身只支援 (max-width: Npx)，收到：${query}`);
            const maxWidth = Number(parsed[1]);
            const mediaQuery = {
                media: query,
                maxWidth,
                matches: context.innerWidth <= maxWidth,
                listeners: [],
                addEventListener(type, listener) { if (type === 'change') this.listeners.push(listener); }
            };
            mediaQueries.push(mediaQuery);
            return mediaQuery;
        };
    }
    context.window = context;
    context.themeManager = { updateThemeToggleButtons() {}, toggle() {} };
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../assets/js/common.js'), 'utf8'), context, { filename: 'common.js' });
    vm.runInContext('initThemeToggle()', context);

    const toggle = created.find((node) => node.className === 'theme-toggle');
    assert.ok(toggle, 'initThemeToggle() 應該建立 .theme-toggle 按鈕');
    return {
        header, nav, hamburger, toggle,
        resize(nextWidth) {
            context.innerWidth = nextWidth;
            for (const mediaQuery of mediaQueries) {
                const matches = nextWidth <= mediaQuery.maxWidth;
                if (matches === mediaQuery.matches) continue;
                mediaQuery.matches = matches;
                for (const listener of mediaQuery.listeners) listener({ type: 'change', media: mediaQuery.media, matches });
            }
        }
    };
}

// 桌機版位置：導覽列最後
function assertAtNavEnd({ toggle, nav, header }) {
    assert.ok(toggle.parentNode === nav, `切換鈕要在導覽列裡（實際在 ${label(toggle.parentNode)}）`);
    assert.ok(nav.children.at(-1) === toggle, `切換鈕要排在導覽列最後（實際最後一個是 ${label(nav.children.at(-1))}）`);
    assert.ok(!header.children.includes(toggle), '切換鈕不該同時出現在頁首容器');
}

// 手機版位置：頁首容器裡、緊貼在漢堡鈕前面
function assertBeforeHamburger({ toggle, nav, header, hamburger }) {
    assert.ok(toggle.parentNode === header, `切換鈕要搬到頁首容器，不能留在手機版收起來的導覽列抽屜裡（實際在 ${label(toggle.parentNode)}）`);
    assert.ok(hamburger.previousSibling === toggle, `切換鈕要緊貼在漢堡鈕前面（實際前一個是 ${label(hamburger.previousSibling)}）`);
    assert.ok(!nav.children.includes(toggle), '切換鈕不該還留在導覽列裡');
}

test('主題切換鈕在桌機與手機寬度之間切換時，會移到正確的位置', () => {
    // 桌機寬度載入：切換鈕在導覽列最後
    const page = createPage(1024);
    assertAtNavEnd(page);

    // 手機橫拿轉直拿：跨過 768px 斷點，切換鈕要離開導覽列、排到漢堡鈕前面
    page.resize(390);
    assertBeforeHamburger(page);

    // 轉回橫拿：回到導覽列最後
    page.resize(1024);
    assertAtNavEnd(page);

    // 斷點與 assets/css/common.css 的 @media (max-width: 768px) 一致：768 算手機、769 算桌機
    page.resize(768);
    assertBeforeHamburger(page);
    page.resize(769);
    assertAtNavEnd(page);

    // 一開始就在手機寬度載入：直接放在漢堡鈕前面
    assertBeforeHamburger(createPage(390));

    // 沒有 matchMedia 的環境退回 innerWidth 判斷（只能決定載入時的位置）
    assertBeforeHamburger(createPage(390, { withMatchMedia: false }));
    assertAtNavEnd(createPage(1024, { withMatchMedia: false }));

    // 頁首沒有漢堡鈕時，手機寬度也只能留在導覽列，來回切換都不會出錯
    const withoutHamburger = createPage(390, { withHamburger: false });
    assertAtNavEnd(withoutHamburger);
    withoutHamburger.resize(1024);
    assertAtNavEnd(withoutHamburger);
    withoutHamburger.resize(390);
    assertAtNavEnd(withoutHamburger);
});
