const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDom } = require('./helpers/fake-dom.js');
const { classesOf, tagAttrs, sliceElementById, mountFromHtml, parseAttrs } = require('./helpers/html-fragment.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const TOOL_DIR = 'tools/treasure-map-finder';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/treasure-map-finder.js';

// ---------- 最小 CSS 解析（tools/treasure-map-finder/style.css；同 tests/treasure-find-page.test.js） ----------
// 把 CSS 攤平成 [{ media, selectors, body }]：media 是外層 @media 的條件，不在 @media 裡就是 null
function cssRules(css) {
    const rules = [];
    const scan = (text, media) => {
        for (const m of text.matchAll(/([^{}]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
            const head = m[1].trim();
            if (head.startsWith('@media')) scan(m[2], head.slice('@media'.length).trim());
            else rules.push({ media, selectors: head.split(',').map((s) => s.trim()), body: m[2] });
        }
    };
    scan(css, null);
    return rules;
}
const styleRules = cssRules(stripComments(read(`${TOOL_DIR}/style.css`)));
const MOBILE = '(max-width: 768px)';

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（沒有 src 的不算）。只讀開始標籤裡的屬性，不用正規表示式比對整個 script 元素
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

// 某個選擇器（在指定的 @media 裡）所有規則的宣告合在一起
function declarations(selector, media = null) {
    const found = styleRules.filter((r) => r.media === media && r.selectors.includes(selector));
    assert.ok(found.length > 0, `style.css 找不到 ${selector}${media ? `（@media ${media}）` : ''} 的規則`);
    return found.map((r) => r.body).join(';');
}

// ---------- 清單面板的頁面替身 ----------
// 照 index.html 建出這些元素（mountFromHtml），跑真正的建構函式與 init()。清單的對話框（清空、匯入；之後還有分享）的 id 加在 mapDetailModal 前面，
// 順序同 index.html
const PANEL_IDS = ['stepHint', 'listEntryDesktop', 'levelTags', 'zoneFilterRow', 'resultCount', 'clearZonesBtn', 'treasureEmpty', 'treasureGrid',
    'listEntryMobile', 'listAnnouncer', 'panelOverlay', 'myListPanel', 'clearListModal', 'importListModal', 'mapDetailModal'];
const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
// 照 index.html 的順序載入：這個工具的翻譯檔、共用的 security-utils.js，以及工具目錄自己的每一個 <script src>（src 不含 /）。
// 之後的任務在 index.html 加了新模組，這裡會自動載入；modal-manager.js 的 src 含 /，不載入，改用下面的替身
const PAGE_SCRIPTS = scriptSources(PAGE_HTML)
    .filter((src) => !src.includes('/') || [`../../${TRANSLATIONS}`, '../../assets/js/security-utils.js'].includes(src))
    .map((src) => path.posix.join(TOOL_DIR, src));
// fetch 只認程式裡寫的相對路徑；每次都重新解析，測試之間不共用物件
const DATA_FILES = Object.fromEntries(['zones.json', 'aetherytes.json', 'treasure-maps.json'].map((name) => [`../../data/${name}`, read(`data/${name}`)]));

// ModalManager 替身開啟時移入焦點用：同 ModalManager._getFocusableElements，依 DOM 順序列出看得到的可聚焦元素。
// fake-dom 不支援逗號與 :not() 選擇器，所以逐一走訪子孫；「看得到」改成自己與祖先都沒有 .hidden、也沒有被設成 display: none
// （真的那個看 offsetWidth），停用的按鈕與 tabindex="-1" 跳過
const isFocusable = (element) => (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) && !element.disabled)
    || (element.tagName === 'A' && element.hasAttribute('href'))
    || (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1');
const isShown = (element) => !element.classList.contains('hidden') && element.style.display !== 'none';
const focusableElements = (root) => root.children.flatMap((child) => (isShown(child)
    ? [...(isFocusable(child) ? [child] : []), ...focusableElements(child)]
    : []));

// 寶圖搜尋器的頁面：fake-dom 裡掛上 index.html 的 PANEL_IDS 元素、載入頁面的腳本，new TreasureMapFinder() 之後等 ready。
//   const page = await createPanelPage({ url, lang: 'en', stored: { key: '字串' }, storageThrows: true, clipboard: 'reject' });
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立寶圖搜尋器之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）
// - storageThrows：光是讀 window.localStorage 就丟例外（Chrome 封鎖網站資料時是 SecurityError）；否則 localStorage 是 storage 這個 Map
// - confirm() 一被呼叫就丟錯：清單的操作不再跳瀏覽器的確認視窗
// - init() 出錯時只會 console.error 並在結果格顯示錯誤：console 的內容先記下來不印，載入失敗時直接丟出（附上記下來的訊息）
// - addMaps(ids) 對每個 id 用目錄裡那張呼叫真正的 toggleMapInList()；team() 換上隊伍替身（不連伺服器），回傳每次同步送出的清單
async function createPanelPage({ url = 'https://ff14.tw/tools/treasure-map-finder/', lang = 'zh', stored = {}, storageThrows = false, clipboard = 'ok' } = {}) {
    const dom = createFakeDom({ url });
    const storage = new Map(Object.entries(stored));
    const toasts = [];
    const clipboardWrites = [];
    const historyCalls = [];
    const logged = [];
    const languageListeners = [];
    const translations = { zh: {}, en: {}, ja: {} };
    let currentLang = lang;
    const lookup = (key) => [currentLang, 'zh'].map((l) => translations[l][key]).find((text) => text !== undefined);
    const fill = (text, params = {}) => text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    // 同 I18nManager.updatePageLanguage()：有 data-i18n-attr 的換那個屬性，否則換掉整段文字
    const translatePage = () => {
        for (const element of dom.document.querySelectorAll('[data-i18n]')) {
            const text = lookup(element.dataset.i18n) ?? element.dataset.i18n;
            if (element.dataset.i18nAttr) element.setAttribute(element.dataset.i18nAttr, text);
            else element.textContent = text;
        }
    };

    // ModalManager 替身：fake-dom 不支援真正 ModalManager 用到的 :not() 選擇器（ModalManager 本身由 modal-manager-stack 測試負責）。
    // 照真正的順序：show() 記下開啟前的焦點、照 useClass／displayStyle 顯示、把下面那一層設成 inert、焦點移到 [autofocus]
    // 或第一個看得到的可聚焦元素（都沒有就是視窗本身）；hide() 先由上而下收掉疊在上面的層、解除下面那一層的 inert、還原焦點，
    // 再呼叫 onClose。Escape 只關最上層、點遮罩本身（不是裡面的內容）才關，兩者都看選項
    const stack = [];
    class FakeModalManager {
        static topmost() { return stack.at(-1) ?? null; }

        constructor() {
            this.activeModal = null;
            this.previousFocus = null;
            this.options = {};
            // 下面那一層在瀏覽器裡是 inert、點不到：只有最上層收得到
            this.handleOverlayClick = (event) => {
                if (event.target === this.activeModal && this.options.closeOnOverlayClick && stack.at(-1) === this) this.hide();
            };
        }

        show(element, options = {}) {
            if (this.activeModal === element) return;
            if (this.activeModal) this.hide();
            this.options = { onClose: null, closeOnOverlayClick: true, closeOnEsc: true, useClass: 'active', displayStyle: 'flex', ...options };
            this.activeModal = element;
            this.previousFocus = dom.document.activeElement;
            if (this.options.useClass) element.classList.add(this.options.useClass);
            else element.style.display = this.options.displayStyle;
            if (stack.length) stack.at(-1).activeModal.inert = true;
            stack.push(this);
            element.addEventListener('click', this.handleOverlayClick);
            (element.querySelector('[autofocus]') ?? focusableElements(element)[0] ?? element).focus();
        }

        hide() {
            if (!this.activeModal) return;
            while (stack.includes(this) && stack.at(-1) !== this) stack.at(-1).hide();
            const { activeModal: element, options, previousFocus } = this;
            if (options.useClass) element.classList.remove(options.useClass);
            else element.style.display = 'none';
            stack.splice(stack.indexOf(this), 1);
            if (stack.length) stack.at(-1).activeModal.inert = false;
            element.removeEventListener('click', this.handleOverlayClick);
            Object.assign(this, { activeModal: null, previousFocus: null });
            if (previousFocus && dom.document.body.contains(previousFocus)) previousFocus.focus();
            options.onClose?.();
        }
    }
    // 同 ModalManager 整個堆疊共用的 document keydown 監聽器：事件只交給最上層
    dom.document.addEventListener('keydown', (event) => {
        const top = stack.at(-1);
        if (top && event.key === 'Escape' && top.options.closeOnEsc) {
            event.preventDefault();
            top.hide();
        }
    });

    // replaceState／pushState：記下呼叫，換掉 history.state 與 location（同瀏覽器）
    const navigate = (method) => (state, title, href) => {
        historyCalls.push({ method, state, href: String(href) });
        dom.window.history.state = state;
        dom.window.location = new URL(String(href), dom.window.location.href);
    };
    Object.assign(dom.window, {
        URLSearchParams, // FilterManager.parseUrl() 用到；fake-dom 預設只有 URL
        console: { log: (...args) => logged.push(args), warn: (...args) => logged.push(args), error: (...args) => logged.push(args) },
        history: { state: null, replaceState: navigate('replaceState'), pushState: navigate('pushState') },
        fetch: async (fetchUrl) => {
            if (!Object.hasOwn(DATA_FILES, fetchUrl)) throw new Error(`createPanelPage 沒有準備 ${fetchUrl}`);
            return { ok: true, status: 200, json: async () => JSON.parse(DATA_FILES[fetchUrl]) };
        },
        // 一設定 src 就載入完成；onload 在下一個 microtask 才呼叫（程式是先設 src、再設 onload）
        Image: class {
            set src(value) {
                this.url = value;
                this.complete = true;
                queueMicrotask(() => this.onload?.());
            }

            get src() { return this.url; }
        },
        navigator: {
            clipboard: {
                writeText: async (text) => {
                    if (clipboard === 'reject') throw new Error('NotAllowedError');
                    clipboardWrites.push(text);
                }
            }
        },
        confirm: (message) => { throw new Error(`不應該呼叫 confirm()：${message}`); },
        i18n: {
            getCurrentLanguage: () => currentLang,
            hasKey: (key) => lookup(key) !== undefined,
            getText: (key, params) => fill(lookup(key) ?? key, params),
            onLanguageChange: (callback) => {
                languageListeners.push(callback);
                return () => {
                    const index = languageListeners.indexOf(callback);
                    if (index !== -1) languageListeners.splice(index, 1);
                };
            },
            loadTranslations: (moduleName, data) => {
                for (const l of Object.keys(translations)) Object.assign(translations[l], data[l]);
            }
        },
        // 同 assets/js/common.js：翻譯檔有這個鍵就用目前語言的字，沒有就用程式裡的中文預設文字
        FF14Utils: {
            getI18nText: (key, fallback, params) => (dom.window.i18n.hasKey(key) ? dom.window.i18n.getText(key, params) : fill(fallback, params)),
            showToast: (message, type) => toasts.push({ message, type })
        },
        ModalManager: FakeModalManager
    });
    if (storageThrows) {
        Object.defineProperty(dom.window, 'localStorage', { get() { throw new Error('SecurityError'); } });
    } else {
        dom.window.localStorage = {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: (key) => storage.delete(key)
        };
    }

    mountFromHtml(dom, PAGE_HTML, PANEL_IDS);
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const finder = vm.runInContext('new TreasureMapFinder()', dom.window);
    await finder.ready;
    if (finder.elements.treasureGrid.querySelector('.error-message')) {
        throw new Error(`寶圖搜尋器沒有載入成功：${logged.map((args) => args.join(' ')).join('；')}`);
    }

    const setLang = (next) => {
        currentLang = next;
        translatePage();
        for (const listener of [...languageListeners]) listener(next);
    };
    const addMaps = (ids) => {
        for (const id of ids) {
            const map = finder.maps.find((m) => m.id === id);
            assert.ok(map, `目錄裡沒有 ${id}`);
            finder.toggleMapInList(map);
        }
    };
    const team = ({ connecting = false } = {}) => {
        const sent = [];
        finder.roomCollaboration = {
            currentRoom: { roomCode: 'ABC123', members: [] },
            currentUser: { id: 'me', nickname: '光之戰士1' },
            isConnecting: connecting,
            mapSync: {
                getOperations: (maps) => maps.map((map) => ({ type: 'add', map })),
                replaceLocal: async (maps) => { sent.push(maps); return true; }
            },
            recordMapOperation() {},
            addOperationHistory() {}
        };
        finder.updateListCount();
        return sent;
    };
    return {
        dom, finder, $: (id) => dom.document.getElementById(id), toasts, clipboardWrites, storage, historyCalls, setLang,
        focused: () => dom.document.activeElement, key: (name) => dom.key(name), addMaps, team
    };
}

// ---------- 清單頁 ----------
test('清單頁的結構：看得到的標題與張數、動作列在清單下面、底部是張數與唯一的主要按鈕', () => {
    const html = read('tools/treasure-map-finder/index.html');
    const view = sliceElementById(html, 'listView');
    assert.deepEqual(classesOf(tagAttrs(html, 'listView')), ['tm-panel-view']);
    const title = tagAttrs(html, 'myListPanel-title');
    assert.deepEqual([classesOf(title), title.tabindex, title['data-i18n']], [[], '-1', undefined]);
    const order = ['id="myListPanel-title"', 'id="listHeaderCount"', 'id="closePanelBtn"', 'id="teamActions"', 'id="roomSection"', 'id="panelTabs"',
        'id="listContent"', 'id="listActions"', 'id="historyContent"', 'id="totalCount"', 'id="generateRouteBtn"'].map((s) => view.indexOf(s));
    assert.ok(!order.includes(-1), `清單頁缺東西：${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `清單頁的順序：${order}`);
    assert.deepEqual(classesOf(tagAttrs(html, 'importListBtn')), ['btn', 'btn-sm']);
    assert.deepEqual(classesOf(tagAttrs(html, 'clearAllBtn')), ['btn', 'btn-ghost', 'btn-sm']);
    assert.equal((view.match(/class="[^"]*\bbtn-primary\b/g) || []).length, 1);
    for (const gone of ['exportListBtn', 'importFileInput', 'panel-header-actions']) assert.ok(!html.includes(gone), gone);
    assert.match(declarations('.my-list-panel', MOBILE), /height:\s*85vh;\s*height:\s*85dvh/);
});

test('每一列：等級、目前語言的地名與編號、座標與最近傳送點；✕ 的名稱帶等級、地名與編號（zh／en）', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017']);
    const row = () => page.$('listContent').querySelector('[data-map-id="tm_017"]');
    const text = (selector) => row().querySelector(selector).textContent;
    assert.deepEqual([text('.item-level'), text('.item-zone'), text('.item-index'), text('.item-sub')], ['G17', '科扎馬烏卡', '#3', '(20.0, 6.9) · 最近：奧克哈努']);
    assert.equal(row().querySelector('.btn-remove').getAttribute('aria-label'), '移除 G17 科扎馬烏卡 #3');
    page.setLang('en');
    assert.deepEqual([text('.item-zone'), text('.item-sub')], ["Kozama'uka", "(20.0, 6.9) · Nearest: Ok' Hanu"]);
    assert.equal(row().querySelector('.btn-remove').getAttribute('aria-label'), "Remove G17 Kozama'uka #3");
});

test('目錄裡找不到的寶圖：顯示它自己的地名，不顯示 id、編號與最近傳送點', async () => {
    const page = await createPanelPage();
    page.finder.listManager.add({ id: 'g8_test_1', level: 'g8', zone: 'Test', coords: { x: 10, y: 20 } });
    page.finder.renderMyList();
    const row = page.$('listContent').querySelector('[data-map-id="g8_test_1"]');
    assert.deepEqual([row.querySelector('.item-zone').textContent, row.querySelector('.item-index'), row.querySelector('.item-sub').textContent], ['Test', null, '(10.0, 20.0)']);
});

test('目錄裡找不到、也沒有 zoneId 的舊項目：和路線一樣用 zone 文字查地區，所以有目前語言的地名與最近傳送點', async () => {
    const page = await createPanelPage();
    page.finder.listManager.add({ id: 'legacy_1', level: 'g17', zone: "Kozama'uka", coords: { x: 20, y: 6.9 } });
    page.finder.renderMyList();
    const row = () => page.$('listContent').querySelector('[data-map-id="legacy_1"]');
    const text = (selector) => row().querySelector(selector).textContent;
    assert.deepEqual([text('.item-zone'), row().querySelector('.item-index'), text('.item-sub')], ['科扎馬烏卡', null, '(20.0, 6.9) · 最近：奧克哈努']);
    page.setLang('en');
    assert.deepEqual([text('.item-zone'), text('.item-sub')], ["Kozama'uka", "(20.0, 6.9) · Nearest: Ok' Hanu"]);
    assert.equal(row().querySelector('.btn-remove').getAttribute('aria-label'), "Remove G17 Kozama'uka");
});

test('標題與張數：個人清單「我的清單／6 張／6 張寶圖」，隊伍裡「隊伍清單／3/8／3/8 張」，切換語言跟著換', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007', 'tm_013', 'tm_022', 'tm_010', 'tm_033']);
    const labels = () => ['myListPanel-title', 'listHeaderCount', 'totalCount'].map((id) => page.$(id).textContent);
    assert.deepEqual(labels(), ['我的清單', '6 張', '6 張寶圖']);
    // 英文沒有複數規則（I18nManager 不支援）：張數放在冒號後面，一張也不會寫成「1 maps」
    page.setLang('en');
    assert.deepEqual(labels(), ['My List', 'Maps: 6', 'Total: 6']);
    page.setLang('ja');
    assert.deepEqual(labels(), ['マイリスト', '6 枚', '地図 6 枚']);
    page.setLang('zh');
    page.finder.listManager.clear();
    page.addMaps(['tm_017', 'tm_007', 'tm_013']);
    page.team();
    assert.deepEqual(labels(), ['隊伍清單', '3/8', '3/8 張']);
    page.setLang('en');
    assert.deepEqual(labels(), ['Team list', '3/8', 'Total: 3/8']);
});

test('✕ 直接移除：不確認、不跳 toast、唸出剩幾張；焦點移到下一列，最後一列移到上一列，清單空了移到標題', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007', 'tm_013']);
    page.finder.openListPanel();
    const removeButton = (id) => page.$('listContent').querySelector(`[data-map-id="${id}"] .btn-remove`);
    const toastsBefore = page.toasts.length;
    removeButton('tm_017').click();
    assert.equal(page.toasts.length, toastsBefore);
    assert.equal(page.$('listAnnouncer').textContent, '已從清單移除，剩 2 張');
    assert.ok(page.focused() === removeButton('tm_007'), '焦點在下一列的 ✕');
    removeButton('tm_013').click();
    assert.ok(page.focused() === removeButton('tm_007'), '移除最後一列：焦點在上一列的 ✕');
    removeButton('tm_007').click();
    assert.ok(page.focused() === page.$('myListPanel-title'), '清單空了：焦點在標題');
    assert.equal(page.$('clearAllBtn').classList.contains('hidden'), true, '空清單時只剩匯入');
    assert.equal(page.$('importListBtn').classList.contains('hidden'), false);
});

test('打開清單面板時焦點在 ✕；隊伍同步重畫清單時焦點留在同一列的 ✕', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007']);
    page.finder.openListPanel();
    assert.ok(page.focused() === page.$('closePanelBtn'));
    const removeButton = (id) => page.$('listContent').querySelector(`[data-map-id="${id}"] .btn-remove`);
    removeButton('tm_007').focus();
    page.finder.renderMyList();
    assert.ok(page.focused() === removeButton('tm_007'));
});

test('隊伍同步重畫時，焦點所在那一列被隊友移除了：焦點移到同一個位置的 ✕，沒有就前一顆，清單空了移到標題', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007', 'tm_013']);
    page.finder.openListPanel();
    const removeButton = (id) => page.$('listContent').querySelector(`[data-map-id="${id}"] .btn-remove`);
    // 隊友把這張移除了：隊伍同步更新清單後，更新張數、重畫清單
    const teammateRemoves = (id) => {
        page.finder.listManager.remove(id);
        page.finder.updateListCount();
        page.finder.renderMyList();
    };
    removeButton('tm_007').focus();
    teammateRemoves('tm_007');
    assert.ok(page.focused() === removeButton('tm_013'), '焦點在下一列的 ✕');
    removeButton('tm_013').focus();
    teammateRemoves('tm_013');
    assert.ok(page.focused() === removeButton('tm_017'), '移除的是最後一列：焦點在上一列的 ✕');
    removeButton('tm_017').focus();
    teammateRemoves('tm_017');
    assert.ok(page.focused() === page.$('myListPanel-title'), '清單空了：焦點在標題');
});

test('隊伍同步重畫時，被移除的不是焦點所在的那一列：焦點留在原本那一列的 ✕', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007', 'tm_013']);
    page.finder.openListPanel();
    const removeButton = (id) => page.$('listContent').querySelector(`[data-map-id="${id}"] .btn-remove`);
    removeButton('tm_013').focus();
    page.finder.listManager.remove('tm_017');
    page.finder.updateListCount();
    page.finder.renderMyList();
    assert.ok(page.focused() === removeButton('tm_013'), '焦點上面的那一列被移除也不影響');
});

test('隊友移除了最後一張，焦點在「清空清單」或「生成路線」上（藏起來或停用了）：焦點放到面板標題，不掉到 body；焦點在別處就不動', async () => {
    const page = await createPanelPage();
    page.finder.openListPanel();
    // 隊伍同步把清單清空：更新張數、重畫清單
    const teammateEmpties = () => {
        page.finder.listManager.clear();
        page.finder.updateListCount();
        page.finder.renderMyList();
    };
    for (const id of ['clearAllBtn', 'generateRouteBtn']) {
        page.addMaps(['tm_017']);
        page.$(id).focus();
        teammateEmpties();
        assert.ok(page.focused() === page.$('myListPanel-title'), id);
    }
    page.addMaps(['tm_017']);
    page.$('importListBtn').focus();
    teammateEmpties();
    assert.ok(page.focused() === page.$('importListBtn'), '「匯入」一直都在');
});

// ---------- 瀏覽器封鎖儲存空間 ----------
test('瀏覽器封鎖儲存空間：頁面照常載入，顯示「先選寶圖等級」，等級 chip 按得動；格式設定和第一次來一樣用預設值', async () => {
    const page = await createPanelPage({ storageThrows: true });
    const { $ } = page;
    assert.ok($('treasureGrid').querySelector('.error-message') === null, '不應該顯示「載入寶圖資料失敗」');
    const empty = $('treasureEmpty');
    assert.equal(empty.classList.contains('hidden'), false);
    assert.equal(empty.querySelector('.empty-state-title').textContent, '先選寶圖等級');

    $('levelTags').querySelector('[data-level="g17"]').click();
    assert.equal($('resultCount').textContent, '40 張 G17 寶圖');
    assert.equal($('treasureGrid').querySelectorAll('.treasure-card').length, 40);
    assert.equal(empty.classList.contains('hidden'), true);

    // 讀不到自訂格式：用預設格式（語言切換時照常跟著語言換）
    assert.equal(page.finder.formatSettingsAreDefault, true);
});

test('瀏覽器封鎖網站資料：卡片的加入、移除照常運作，入口與按鈕都更新，只提示一次記不住', async () => {
    const page = await createPanelPage({ storageThrows: true });
    page.$('levelTags').querySelector('[data-level="g17"]').click();
    const [first, second] = page.$('treasureGrid').querySelectorAll('.btn-add-to-list');
    first.click();
    second.click();
    assert.equal(page.finder.listManager.getLength(), 2);
    assert.equal(first.dataset.state, 'added');
    assert.equal(page.$('listEntryDesktop').querySelector('.tm-entry-label').textContent, '📋 清單 2 張');
    first.click();
    assert.equal(page.finder.listManager.getLength(), 1);
    assert.deepEqual(page.toasts, [{ message: '瀏覽器不允許儲存資料：清單只會保留到關閉這個頁面。', type: 'warning' }]);
});

test('瀏覽器封鎖網站資料：清單頁的 ✕ 照常移除，提示一次記不住', async () => {
    const page = await createPanelPage({ storageThrows: true });
    // 直接放進清單（不經過卡片，所以還沒提示過）：提示留給 ✕ 那一次
    for (const id of ['tm_017', 'tm_007']) page.finder.listManager.add(page.finder.maps.find((map) => map.id === id));
    page.finder.updateListCount();
    page.finder.renderMyList();
    page.$('listContent').querySelector('[data-map-id="tm_017"] .btn-remove').click();
    assert.deepEqual(Array.from(page.finder.listManager.getList(), (map) => map.id), ['tm_007']);
    assert.ok(page.$('listContent').querySelector('[data-map-id="tm_017"]') === null, '移除的那一列不見了');
    assert.deepEqual(page.toasts, [{ message: '瀏覽器不允許儲存資料：清單只會保留到關閉這個頁面。', type: 'warning' }]);
});

// ---------- 清空與匯入：頁內對話框 ----------
const settle = async () => {
    for (let round = 0; round < 5; round += 1) await new Promise((resolve) => setImmediate(resolve));
};
// 在匯入對話框的 textarea 貼上內容：寫入 value、派送 input；openImportWith 先按「匯入」打開對話框
const paste = (page, text) => {
    page.$('importListText').value = text;
    page.$('importListText').dispatchEvent(new page.dom.window.Event('input', { bubbles: true }));
};
const openImportWith = (page, text) => {
    page.$('importListBtn').click();
    paste(page, text);
};
const mapIds = (page) => Array.from(page.finder.listManager.getList(), (map) => map.id);
const isHidden = (page, id) => page.$(id).classList.contains('hidden');
const textsOf = (page, ids) => ids.map((id) => page.$(id).textContent);
const BLOCKED_WARNING = { message: '瀏覽器不允許儲存資料：清單只會保留到關閉這個頁面。', type: 'warning' };

test('script.js、list-manager.js 不再呼叫 confirm()', () => {
    for (const file of ['script.js', 'list-manager.js']) assert.doesNotMatch(read(`tools/treasure-map-finder/${file}`), /\bconfirm\(/, file);
});

test('清空：頁內對話框，焦點在「取消」；按「清空 3 張」才清空，之後焦點在面板標題；Escape 只關對話框', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007', 'tm_013']);
    page.finder.openListPanel();
    page.$('clearAllBtn').click();
    assert.equal(page.$('clearListModal').classList.contains('hidden'), false);
    assert.equal(page.$('clearListBody').textContent, '清單裡的 3 張寶圖都會移除。');
    assert.equal(page.$('confirmClearBtn').textContent, '清空 3 張');
    assert.ok(page.focused() === page.$('cancelClearBtn'));
    page.key('Escape');
    assert.equal(page.$('clearListModal').classList.contains('hidden'), true);
    assert.equal(page.finder.listManager.getLength(), 3);
    assert.ok(page.finder.modalManager.activeModal === page.$('myListPanel'), '清單面板還開著');
    page.$('clearAllBtn').click();
    page.$('confirmClearBtn').click();
    assert.equal(page.finder.listManager.getLength(), 0);
    assert.ok(page.focused() === page.$('myListPanel-title'));
});

test('清空：隊伍裡的說明提到隊友也會清空', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007']);
    page.team();
    page.$('clearAllBtn').click();
    assert.equal(page.$('clearListBody').textContent, '隊伍清單裡的 2 張寶圖都會移除，隊友的清單也會跟著清空。');
});

test('清空：「取消」、✕、點遮罩都不動清單，焦點回到「清空清單」；清空成功有 toast、更新入口與清單，隊伍收到空清單', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007']);
    page.finder.openListPanel();
    for (const close of [() => page.$('cancelClearBtn').click(), () => page.$('closeClearModalBtn').click(), () => page.$('clearListModal').click()]) {
        page.$('clearAllBtn').focus();
        page.$('clearAllBtn').click();
        assert.equal(isHidden(page, 'clearListModal'), false);
        close();
        assert.equal(isHidden(page, 'clearListModal'), true);
        assert.equal(page.$('clearListModal').style.display, '', '關閉後不留 display');
        assert.equal(page.finder.listManager.getLength(), 2);
        assert.ok(page.focused() === page.$('clearAllBtn'));
    }
    assert.deepEqual(page.toasts, []);
    const sent = page.team();
    page.$('clearAllBtn').click();
    page.$('confirmClearBtn').click();
    assert.deepEqual(page.toasts, [{ message: '已清空清單', type: 'success' }]);
    assert.equal(page.$('listEntryDesktop').querySelector('.tm-entry-label').textContent, '👥 隊伍清單 0/8');
    assert.ok(page.$('listContent').querySelector('.empty-state') !== null, '清單頁換成空狀態');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].length, 0);
});

test('沒有東西可清、或隊伍連線中：不開清空與匯入對話框，匯入與清空的函式也不動清單', async () => {
    const page = await createPanelPage();
    page.finder.openListPanel();
    page.finder.listDialogs.openClear();
    assert.equal(isHidden(page, 'clearListModal'), true, '清單是空的');
    page.addMaps(['tm_017']);
    page.team({ connecting: true });
    const connecting = { message: '隊伍連線中，請稍候再修改清單。', type: 'info' };
    page.$('clearAllBtn').click();
    page.$('importListBtn').click();
    assert.equal(isHidden(page, 'clearListModal'), true);
    assert.equal(isHidden(page, 'importListModal'), true);
    assert.deepEqual(page.toasts, [connecting, connecting]);
    page.toasts.length = 0;
    // 匯入的函式不跳 toast：訊息交給匯入對話框顯示
    const imported = await page.finder.importFromText('?maps=tm_007', { merge: true });
    assert.deepEqual([imported.success, imported.message], [false, '隊伍連線中，請稍候再修改清單。']);
    assert.deepEqual(page.toasts, []);
    assert.deepEqual([page.finder.clearList().success, mapIds(page)], [false, ['tm_017']]);
});

test('匯入：一邊貼一邊解析；看不懂時標成錯誤並停用「匯入」', async () => {
    const page = await createPanelPage();
    openImportWith(page, 'https://ff14.tw/tools/treasure-map-finder/?maps=tm_017,tm_007,tm_999');
    assert.equal(page.$('importListStatus').textContent, '連結裡有 2 張寶圖');
    assert.equal(page.$('confirmImportBtn').disabled, false);
    assert.equal(page.$('importListChoice').classList.contains('hidden'), true, '清單是空的時不顯示選項');
    openImportWith(page, 'hello');
    assert.equal(page.$('importListStatus').textContent, '看不懂這段內容：請貼上分享連結，或以前匯出的內容');
    assert.ok(page.$('importListText').classList.contains('is-invalid'));
    assert.equal(page.$('confirmImportBtn').disabled, true);
});

test('匯入：預設合併；選「取代我的清單」才換掉；舊的匯出 JSON 以目錄的資料為準', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017']);
    openImportWith(page, JSON.stringify({ version: '1.0', maps: [{ id: 'tm_007', level: 'g17', zone: 'Urqopacha', coords: { x: 13.7, y: 14.2 } }] }));
    assert.equal(page.$('importListStatus').textContent, '內容有 1 張寶圖');
    assert.equal(page.$('importModeMerge').checked, true);
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(Array.from(page.finder.listManager.getList(), (map) => map.id), ['tm_017', 'tm_007']);
    assert.equal(page.finder.listManager.getList()[1].zoneId, 'urqopacha');
    assert.equal(page.$('importListModal').classList.contains('hidden'), true);
    openImportWith(page, '?maps=tm_013');
    page.$('importModeReplace').checked = true;
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(Array.from(page.finder.listManager.getList(), (map) => map.id), ['tm_013']);
});

test('匯入：清單是空的時沒有「合併」可言，成功訊息是「已匯入 N 張寶圖」；清單裡有寶圖時預設合併，訊息是「已合併匯入」', async () => {
    const page = await createPanelPage();
    openImportWith(page, '?maps=tm_017,tm_007');
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(page.toasts, [{ message: '已匯入 2 張寶圖', type: 'success' }]);
    openImportWith(page, '?maps=tm_007,tm_013');
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(page.toasts.slice(1), [{ message: '已合併匯入 1 張新寶圖', type: 'success' }]);
    assert.deepEqual(mapIds(page), ['tm_017', 'tm_007', 'tm_013']);
});

test('匯入成功的訊息（英文沒有複數規則）：張數放在冒號後面，一張也不會寫成「1 maps」', async () => {
    const page = await createPanelPage({ lang: 'en' });
    openImportWith(page, '?maps=tm_017');
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(page.toasts, [{ message: 'Maps imported: 1', type: 'success' }]);
    openImportWith(page, '?maps=tm_017,tm_007');
    assert.equal(page.$('importListStatus').textContent, 'Maps in the link: 2');
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(page.toasts.slice(1), [{ message: 'New maps merged: 1', type: 'success' }]);
});

test('匯入：隊伍裡超過 8 張時錯誤寫在對話框裡，對話框不關、清單不變（Review Focus 2）', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007', 'tm_013', 'tm_022', 'tm_010', 'tm_033']);
    page.team();
    openImportWith(page, '?maps=tm_008,tm_009,tm_011');
    page.$('confirmImportBtn').click();
    await settle();
    assert.equal(page.finder.listManager.getLength(), 6);
    assert.equal(page.$('importListModal').classList.contains('hidden'), false);
    assert.equal(page.$('importListError').classList.contains('hidden'), false);
    assert.match(page.$('importListError').textContent, /清單已滿/);
});

test('匯入失敗之後：改內容就收起錯誤；改選「取代」再匯入成功，對話框關閉、焦點回到「匯入」，隊伍收到新清單', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007', 'tm_013', 'tm_022', 'tm_010', 'tm_033']);
    const sent = page.team();
    page.finder.openListPanel();
    page.$('importListBtn').focus();
    openImportWith(page, '?maps=tm_008,tm_009,tm_011');
    assert.ok(page.focused() === page.$('importListText'), '打開後焦點在貼上的欄位');
    page.$('confirmImportBtn').click();
    await settle();
    assert.equal(isHidden(page, 'importListError'), false);
    paste(page, '?maps=tm_008,tm_009,tm_011');
    assert.equal(isHidden(page, 'importListError'), true, '內容一改，上一次的錯誤就不再適用');
    assert.equal(page.$('importListError').textContent, '');
    page.$('importModeReplace').checked = true;
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(mapIds(page), ['tm_008', 'tm_009', 'tm_011']);
    assert.equal(isHidden(page, 'importListModal'), true);
    assert.equal(sent.length, 1);
    assert.ok(page.focused() === page.$('importListBtn'));
});

test('按兩次「匯入」只匯入一次（隊伍同步還沒回來的時候）', async () => {
    const page = await createPanelPage();
    const sent = page.team();
    openImportWith(page, '?maps=tm_017,tm_007');
    page.$('confirmImportBtn').click();
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(mapIds(page), ['tm_017', 'tm_007']);
    assert.equal(sent.length, 1);
    assert.equal(page.toasts.filter((toast) => toast.type === 'success').length, 1);
    assert.equal(isHidden(page, 'importListModal'), true);
});

test('每次打開匯入對話框都是乾淨的：內容、狀態、錯誤、模式回到預設，Escape 後焦點回到「匯入」；隊伍裡的「取代」寫成取代隊伍清單', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017']);
    page.finder.openListPanel();
    page.$('importListBtn').focus();
    openImportWith(page, 'hello');
    page.$('importModeMerge').checked = false;
    page.$('importModeReplace').checked = true;
    page.$('importListError').classList.remove('hidden');
    page.$('importListError').textContent = '上一次的錯誤';
    page.key('Escape');
    assert.equal(isHidden(page, 'importListModal'), true);
    assert.ok(page.focused() === page.$('importListBtn'));
    page.$('importListBtn').click();
    const text = page.$('importListText');
    assert.deepEqual([text.value, text.classList.contains('is-invalid'), text.hasAttribute('aria-invalid')], ['', false, false]);
    assert.equal(page.$('importListStatus').textContent, '');
    assert.equal(isHidden(page, 'importListError'), true);
    assert.equal(page.$('importListError').textContent, '');
    assert.equal(page.$('confirmImportBtn').disabled, true);
    assert.deepEqual([page.$('importModeMerge').checked, page.$('importModeReplace').checked], [true, false]);
    assert.equal(isHidden(page, 'importListChoice'), false, '清單不是空的：顯示選項');
    assert.deepEqual(textsOf(page, ['importModeMergeTitle', 'importModeMergeHint', 'importModeReplaceTitle', 'importModeReplaceHint']),
        ['合併', '重複的只留一張', '取代我的清單', '原本的寶圖會移除']);
    assert.ok(page.focused() === text);
    paste(page, 'hello');
    assert.deepEqual([text.classList.contains('is-invalid'), text.getAttribute('aria-invalid')], [true, 'true']);
    paste(page, '?maps=tm_007');
    assert.deepEqual([text.classList.contains('is-invalid'), text.hasAttribute('aria-invalid')], [false, false], '改成讀得懂的內容就不再是錯誤');
    page.key('Escape');
    page.team();
    page.$('importListBtn').click();
    assert.deepEqual(textsOf(page, ['importModeMergeTitle', 'importModeReplaceTitle']), ['合併', '取代隊伍清單']);
});

test('匯入：連結裡一張都找不到、看不懂、空白時，importFromText 回傳說明、不動清單、不跳 toast；對話框的「匯入」停用', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017']);
    openImportWith(page, '?maps=tm_998,tm_999');
    assert.equal(page.$('importListStatus').textContent, '分享連結裡沒有找得到的寶圖');
    assert.equal(page.$('confirmImportBtn').disabled, true);
    paste(page, '   ');
    assert.deepEqual([page.$('importListStatus').textContent, page.$('confirmImportBtn').disabled], ['', true]);
    page.toasts.length = 0;
    const results = [];
    for (const text of ['?maps=tm_998,tm_999', 'hello', '   ']) {
        const result = await page.finder.importFromText(text);
        results.push([result.success, result.message]);
    }
    const unreadable = '看不懂這段內容：請貼上分享連結，或以前匯出的內容';
    assert.deepEqual(results, [[false, '分享連結裡沒有找得到的寶圖'], [false, unreadable], [false, unreadable]]);
    assert.deepEqual(page.toasts, []);
    assert.deepEqual(mapIds(page), ['tm_017']);
});

test('舊的匯出 JSON：目錄裡沒有的寶圖照原樣匯入、無效的略過；全都無效時錯誤寫在對話框', async () => {
    const page = await createPanelPage();
    const custom = { id: 'g8_test_1', level: 'g8', zone: 'Test', coords: { x: 10, y: 20 } };
    openImportWith(page, JSON.stringify({ maps: [custom, { id: 'broken' }, null] }));
    assert.equal(page.$('importListStatus').textContent, '內容有 3 張寶圖');
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(Array.from(page.finder.listManager.getList(), (map) => [map.id, map.zone]), [['g8_test_1', 'Test']]);
    assert.equal(isHidden(page, 'importListModal'), true);
    openImportWith(page, JSON.stringify({ maps: [{ id: 'broken' }] }));
    page.$('confirmImportBtn').click();
    await settle();
    assert.equal(isHidden(page, 'importListModal'), false);
    assert.equal(page.$('importListError').textContent, '沒有有效的地圖資料');
    assert.deepEqual(mapIds(page), ['g8_test_1']);
});

test('對話框開著時切換語言：固定的字由 i18n 換，帶張數與隊伍的說明由對話框重畫', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007']);
    page.finder.openListPanel();
    page.$('clearAllBtn').click();
    page.setLang('en');
    assert.deepEqual(textsOf(page, ['clearListModal-title', 'clearListBody', 'confirmClearBtn', 'cancelClearBtn']),
        ['Clear the list?', 'All maps in the list will be removed (2).', 'Clear all (2)', 'Cancel']);
    page.setLang('ja');
    assert.deepEqual(textsOf(page, ['clearListBody', 'confirmClearBtn']), ['リストの地図 2 枚がすべて削除されます。', '2 枚を削除']);
    page.key('Escape');
    page.setLang('zh');
    openImportWith(page, '?maps=tm_017,tm_999');
    page.setLang('en');
    assert.deepEqual(textsOf(page, ['importListModal-title', 'importListStatus', 'importModeMergeTitle', 'importModeMergeHint', 'importModeReplaceTitle', 'importModeReplaceHint']),
        ['Import List', 'Maps in the link: 1', 'Merge', 'Duplicates are kept once', 'Replace my list', 'Your current maps will be removed']);
    paste(page, 'hello');
    page.setLang('ja');
    assert.equal(page.$('importListStatus').textContent, 'この内容は読み取れません。共有リンクか、以前エクスポートした内容を貼り付けてください');
    assert.equal(page.$('importListText').classList.contains('is-invalid'), true);
});

// ---------- 對話框開著時清單變了（隊友同步、進出隊伍） ----------
// 隊友的同步走 syncFromRoom() → updateListCount() → renderMyList()：測試直接改清單，再呼叫這兩個
const changeList = (page, change) => {
    change();
    page.finder.updateListCount();
    page.finder.renderMyList();
};
const catalogued = (page, id) => page.finder.maps.find((map) => map.id === id);

test('清空對話框開著時清單變了：說明與確認鈕跟著新的張數，進隊伍時說明也換成隊伍的；確認清掉的就是畫面上寫的張數', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007']);
    page.finder.openListPanel();
    page.$('clearAllBtn').click();
    assert.deepEqual(textsOf(page, ['clearListBody', 'confirmClearBtn']), ['清單裡的 2 張寶圖都會移除。', '清空 2 張']);
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_013')));
    assert.deepEqual(textsOf(page, ['clearListBody', 'confirmClearBtn']), ['清單裡的 3 張寶圖都會移除。', '清空 3 張']);
    page.team();
    assert.equal(page.$('clearListBody').textContent, '隊伍清單裡的 3 張寶圖都會移除，隊友的清單也會跟著清空。');
    page.$('confirmClearBtn').click();
    assert.deepEqual(page.toasts, [{ message: '已清空清單', type: 'success' }]);
    assert.equal(page.finder.listManager.getLength(), 0);
    assert.equal(isHidden(page, 'clearListModal'), true);
});

test('清空對話框開著時清單被清空了（隊友清的）：沒有東西可問，對話框收起來，焦點放到面板標題', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007']);
    page.finder.openListPanel();
    page.$('clearAllBtn').click();
    changeList(page, () => page.finder.listManager.clear());
    assert.equal(isHidden(page, 'clearListModal'), true);
    assert.equal(page.$('clearListModal').style.display, '', '關閉後不留 display');
    assert.ok(page.focused() === page.$('myListPanel-title'));
    assert.deepEqual(page.toasts, []);
});

test('匯入對話框開著時清單變了：有寶圖才有「合併／取代」，同步不會把玩家選的改回預設；上一次的錯誤不受影響', async () => {
    const page = await createPanelPage();
    page.finder.openListPanel();
    page.$('importListBtn').click();
    assert.equal(isHidden(page, 'importListChoice'), true);
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_017')));
    assert.equal(isHidden(page, 'importListChoice'), false);
    page.$('importModeReplace').checked = true;
    page.$('importListError').textContent = '上一次的錯誤';
    page.$('importListError').classList.remove('hidden');
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_007')));
    assert.equal(page.$('importModeReplace').checked, true, '玩家選的「取代」還在');
    assert.deepEqual([isHidden(page, 'importListError'), page.$('importListError').textContent], [false, '上一次的錯誤']);
    changeList(page, () => page.finder.listManager.clear());
    assert.equal(isHidden(page, 'importListChoice'), true);
});

test('在隊伍裡匯入進空清單：等同步的這段時間，對話框不跟著新清單重畫（選項不會冒出來）', async () => {
    const page = await createPanelPage();
    page.team();
    openImportWith(page, '?maps=tm_017,tm_007');
    page.$('confirmImportBtn').click();
    assert.deepEqual([page.finder.listManager.getLength(), isHidden(page, 'importListModal'), isHidden(page, 'importListChoice')], [2, false, true]);
    await settle();
    assert.equal(isHidden(page, 'importListModal'), true);
});

test('匯入對話框開著時隊友把清單清空：焦點原本在「合併／取代」上（整組藏起來了）就移到貼上內容的欄位，不掉到 body；焦點在別處就不動', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007']);
    page.team();
    page.finder.openListPanel();
    page.$('importListBtn').click();
    page.$('importModeReplace').focus();
    changeList(page, () => page.finder.listManager.clear());
    assert.equal(isHidden(page, 'importListChoice'), true);
    assert.ok(page.focused() === page.$('importListText'));
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_017')));
    page.$('cancelImportBtn').focus();
    changeList(page, () => page.finder.listManager.clear());
    assert.ok(page.focused() === page.$('cancelImportBtn'));
});

// 隊伍同步不馬上回來：每次送出的清單（寶圖 id）記在 sent，release() 讓最早送出、還沒回來的那一次回來
const holdSync = (page) => {
    const sent = [];
    const waiting = [];
    page.finder.roomCollaboration.mapSync.replaceLocal = (maps) => {
        sent.push(Array.from(maps, (map) => map.id));
        return new Promise((resolve) => waiting.push(resolve));
    };
    return { sent, release: () => waiting.shift()(true) };
};

test('等隊伍同步時關掉匯入對話框又重新打開：上一次的同步回來時，不關掉新打開的這一次、不寫錯誤，貼上的內容還在；這一次照常能匯入', async () => {
    const page = await createPanelPage();
    page.team();
    const sync = holdSync(page);
    page.finder.openListPanel();
    page.$('importListBtn').focus();
    openImportWith(page, '?maps=tm_017');
    page.$('confirmImportBtn').click();
    await settle();
    assert.equal(isHidden(page, 'importListModal'), false, '還在等同步');
    page.key('Escape');
    openImportWith(page, '?maps=tm_007');
    sync.release();
    await settle();
    assert.equal(isHidden(page, 'importListModal'), false, '新打開的這一次還開著');
    assert.equal(page.$('importListText').value, '?maps=tm_007');
    assert.deepEqual([isHidden(page, 'importListError'), page.$('importListError').textContent], [true, '']);
    page.$('confirmImportBtn').click();
    sync.release();
    await settle();
    assert.deepEqual(mapIds(page), ['tm_017', 'tm_007']);
    assert.deepEqual(sync.sent, [['tm_017'], ['tm_017', 'tm_007']]);
    assert.equal(isHidden(page, 'importListModal'), true);
    assert.ok(page.focused() === page.$('importListBtn'));
});

test('等隊伍同步時關掉匯入對話框又重新打開：上一次還沒回來也能匯入（不被擋住），各自的同步回來時只關自己那一次', async () => {
    const page = await createPanelPage();
    page.team();
    const sync = holdSync(page);
    page.finder.openListPanel();
    page.$('importListBtn').focus();
    openImportWith(page, '?maps=tm_017');
    page.$('confirmImportBtn').click();
    page.key('Escape');
    openImportWith(page, '?maps=tm_007');
    page.$('confirmImportBtn').click();
    assert.deepEqual(mapIds(page), ['tm_017', 'tm_007']);
    assert.deepEqual(sync.sent, [['tm_017'], ['tm_017', 'tm_007']]);
    sync.release();   // 上一次的同步回來了，這一次的還沒
    await settle();
    assert.equal(isHidden(page, 'importListModal'), false);
    sync.release();
    await settle();
    assert.equal(isHidden(page, 'importListModal'), true);
    assert.ok(page.focused() === page.$('importListBtn'));
});

test('切換語言：上一次失敗的錯誤是舊語言寫的，收起來', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007', 'tm_013', 'tm_022', 'tm_010', 'tm_033']);
    page.team();
    openImportWith(page, '?maps=tm_008,tm_009,tm_011');
    page.$('confirmImportBtn').click();
    await settle();
    assert.equal(isHidden(page, 'importListError'), false);
    page.setLang('en');
    assert.deepEqual([isHidden(page, 'importListError'), page.$('importListError').textContent], [true, '']);
    assert.equal(isHidden(page, 'importListModal'), false, '對話框還開著');
});

test('匯入對話框開著時隊伍同步（每兩秒一次）：「連結裡有 N 張寶圖」（aria-live）同樣的字不重寫；切換語言才用新語言重寫', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017']);
    page.team();
    page.finder.openListPanel();
    openImportWith(page, '?maps=tm_017,tm_007');
    const status = page.$('importListStatus');
    const written = status.firstChild;
    assert.equal(written.textContent, '連結裡有 2 張寶圖');
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_013')));
    changeList(page, () => {});
    assert.ok(status.firstChild === written, '重寫相同的字會讓螢幕閱讀器重念一遍');
    page.setLang('en');
    assert.equal(status.textContent, 'Maps in the link: 2');
});

// 隊伍每兩秒輪詢一次：updateListCount() → ListDialogs#refresh()。textContent 一寫就會換掉文字節點，螢幕閱讀器的閱讀位置可能跟著跑掉，
// 所以同樣的字不重寫（文字節點還是同一個），字真的變了才換
const textNodesOf = (page, ids) => ids.map((id) => page.$(id).firstChild);
const sameNodes = (page, ids, before) => ids.every((id, index) => before[index] !== null && page.$(id).firstChild === before[index]);

test('清空對話框開著時隊伍每兩秒同步一次：說明與確認鈕同樣的字不重寫，張數或隊伍變了才換', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017', 'tm_007']);
    page.finder.openListPanel();
    page.$('clearAllBtn').click();
    const ids = ['clearListBody', 'confirmClearBtn'];
    const written = textNodesOf(page, ids);
    page.finder.updateListCount();
    page.finder.updateListCount();
    assert.ok(sameNodes(page, ids, written), '清單沒變：文字節點還是同一個');
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_013')));
    assert.deepEqual(textsOf(page, ids), ['清單裡的 3 張寶圖都會移除。', '清空 3 張']);
    assert.ok(ids.every((id, index) => page.$(id).firstChild !== written[index]), '張數變了：兩處都換成新的字');
    const counted = textNodesOf(page, ids);
    page.team();
    assert.equal(page.$('clearListBody').textContent, '隊伍清單裡的 3 張寶圖都會移除，隊友的清單也會跟著清空。');
    assert.ok(page.$('clearListBody').firstChild !== counted[0], '進了隊伍：說明換字');
    assert.ok(page.$('confirmClearBtn').firstChild === counted[1], '確認鈕的字沒變：不重寫');
});

test('匯入對話框開著時隊伍每兩秒同步一次：「合併／取代」的標題與說明同樣的字不重寫，進了隊伍只有「取代」的標題換字', async () => {
    const page = await createPanelPage();
    page.addMaps(['tm_017']);
    page.finder.openListPanel();
    openImportWith(page, '?maps=tm_007');
    const ids = ['importModeMergeTitle', 'importModeMergeHint', 'importModeReplaceTitle', 'importModeReplaceHint'];
    const written = textNodesOf(page, ids);
    assert.deepEqual(textsOf(page, ids), ['合併', '重複的只留一張', '取代我的清單', '原本的寶圖會移除']);
    page.finder.updateListCount();
    page.finder.updateListCount();
    assert.ok(sameNodes(page, ids, written), '清單沒變：文字節點還是同一個');
    page.team();
    assert.deepEqual(textsOf(page, ids), ['合併', '重複的只留一張', '取代隊伍清單', '原本的寶圖會移除']);
    assert.deepEqual(ids.map((id, index) => page.$(id).firstChild === written[index]), [true, true, false, true]);
});

test('瀏覽器封鎖網站資料：從對話框清空照常運作，成功提示之後只警告一次記不住', async () => {
    const page = await createPanelPage({ storageThrows: true });
    // 直接放進清單（不經過卡片，所以還沒提示過）：提示留給清空那一次
    const fill = () => {
        for (const id of ['tm_017', 'tm_007']) page.finder.listManager.add(page.finder.maps.find((map) => map.id === id));
        page.finder.updateListCount();
        page.finder.renderMyList();
    };
    fill();
    page.finder.openListPanel();
    page.$('clearAllBtn').click();
    page.$('confirmClearBtn').click();
    assert.equal(page.finder.listManager.getLength(), 0);
    assert.equal(isHidden(page, 'clearListModal'), true);
    assert.deepEqual(page.toasts, [{ message: '已清空清單', type: 'success' }, BLOCKED_WARNING]);
    // 同一個頁面再清一次：照常清空，不再警告
    fill();
    page.$('clearAllBtn').click();
    page.$('confirmClearBtn').click();
    assert.equal(page.finder.listManager.getLength(), 0);
    assert.deepEqual(page.toasts.slice(2), [{ message: '已清空清單', type: 'success' }]);
});

test('瀏覽器封鎖網站資料：從對話框匯入照常運作，提示一次記不住', async () => {
    const page = await createPanelPage({ storageThrows: true });
    openImportWith(page, '?maps=tm_017,tm_007');
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(mapIds(page), ['tm_017', 'tm_007']);
    assert.equal(isHidden(page, 'importListModal'), true);
    assert.deepEqual(page.toasts, [{ message: '已匯入 2 張寶圖', type: 'success' }, BLOCKED_WARNING]);
    openImportWith(page, '?maps=tm_013');
    page.$('confirmImportBtn').click();
    await settle();
    assert.deepEqual(mapIds(page), ['tm_017', 'tm_007', 'tm_013']);
    assert.deepEqual(page.toasts.slice(2), [{ message: '已合併匯入 1 張新寶圖', type: 'success' }]);
});

test('清空與匯入對話框的結構：遮罩層 > .dialog.tm-dialog > 標頭、內文、動作列，放在離開隊伍對話框之後、詳細檢視之前', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const order = ['id="leaveRoomModal"', 'id="clearListModal"', 'id="importListModal"', 'id="mapDetailModal"'].map((s) => html.indexOf(s));
    assert.ok(!order.includes(-1), `缺對話框：${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `對話框的順序：${order}`);
    for (const [id, close] of [['clearListModal', 'closeClearModalBtn'], ['importListModal', 'closeImportModalBtn']]) {
        const overlay = tagAttrs(html, id);
        assert.deepEqual(classesOf(overlay), ['dialog-overlay', 'hidden'], id);
        assert.deepEqual([overlay.role, overlay['aria-modal'], overlay['aria-labelledby']], ['dialog', 'true', `${id}-title`], id);
        const dialog = sliceElementById(html, id);
        // 不用房間對話框的 .modal 系列：.modal-body label { display: block } 會弄亂 radio
        const classes = [...dialog.matchAll(/\sclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
        for (const gone of ['modal', 'modal-content', 'modal-body', 'modal-footer']) assert.ok(!classes.includes(gone), `${id} 不該用 .${gone}`);
        assert.equal((dialog.match(/<div class="dialog tm-dialog">/g) || []).length, 1, id);
        const parts = ['dialog-header', 'dialog-body', 'dialog-actions'].map((name) => dialog.indexOf(`class="${name}"`));
        assert.ok(!parts.includes(-1) && parts[0] < parts[1] && parts[1] < parts[2], `${id} 的標頭、內文、動作列：${parts}`);
        assert.deepEqual(classesOf(tagAttrs(html, `${id}-title`)), ['dialog-title'], id);
        const closeButton = tagAttrs(html, close);
        assert.deepEqual([classesOf(closeButton), closeButton['aria-label'], closeButton['data-i18n'], closeButton['data-i18n-attr']],
            [['btn', 'btn-close'], '關閉', 'treasure_map_close', 'aria-label'], close);
    }

    // 清空：說明與確認鈕帶張數、隊伍裡還換字，由 JavaScript 填、不掛 data-i18n（切換語言時 I18nManager 會把 [data-i18n] 整個換掉）；沒有主要按鈕
    const clear = sliceElementById(html, 'clearListModal');
    assert.equal(tagAttrs(html, 'clearListModal-title')['data-i18n'], 'treasure_map_clear_title');
    assert.deepEqual(classesOf(tagAttrs(html, 'cancelClearBtn')), ['btn']);
    assert.equal(tagAttrs(html, 'cancelClearBtn')['data-i18n'], 'treasure_map_cancel');
    assert.deepEqual(classesOf(tagAttrs(html, 'confirmClearBtn')), ['btn', 'btn-danger']);
    for (const id of ['clearListBody', 'confirmClearBtn']) assert.equal(tagAttrs(html, id)['data-i18n'], undefined, id);
    assert.doesNotMatch(clear, /btn-primary/);

    // 匯入：label 與 textarea、狀態、選項、錯誤、兩顆按鈕（只有一顆主要按鈕）
    const imported = sliceElementById(html, 'importListModal');
    assert.equal(tagAttrs(html, 'importListModal-title')['data-i18n'], 'treasure_map_import_title');
    const labels = [...imported.matchAll(/<label\b[^>]*>/g)].map((m) => parseAttrs(m[0]));
    const inputLabel = labels.find((attrs) => attrs.for === 'importListText');
    assert.deepEqual([classesOf(inputLabel), inputLabel['data-i18n']], [['form-label'], 'treasure_map_import_label']);
    const textarea = tagAttrs(html, 'importListText');
    assert.deepEqual([classesOf(textarea), textarea.rows, textarea.spellcheck, textarea['aria-describedby']], [['form-control'], '4', 'false', 'importListStatus']);
    // 貼的是連結或 JSON：手機不要自動大寫、自動修正或跳出自動填入的建議
    assert.deepEqual([textarea.autocapitalize, textarea.autocorrect, textarea.autocomplete], ['off', 'off', 'off']);
    const status = tagAttrs(html, 'importListStatus');
    assert.deepEqual([classesOf(status), status['aria-live'], status['data-i18n']], [['form-text'], 'polite', undefined]);
    assert.deepEqual(classesOf(tagAttrs(html, 'importListChoice')), ['tm-choice', 'hidden']);
    const legend = parseAttrs(imported.match(/<legend\b[^>]*>/)[0]);
    assert.deepEqual([classesOf(legend), legend['data-i18n']], [['visually-hidden'], 'treasure_map_import_choice']);
    assert.equal((imported.match(/class="form-check"/g) || []).length, 2);
    for (const [mode, checked] of [['Merge', true], ['Replace', false]]) {
        const radio = tagAttrs(html, `importMode${mode}`);
        assert.deepEqual([radio.type, radio.name, radio.value, classesOf(radio)], ['radio', 'importMode', mode.toLowerCase(), ['form-check-input']], mode);
        assert.equal(new RegExp(`<input\\b[^>]*id="importMode${mode}"[^>]*\\schecked[\\s>]`).test(imported), checked, `${mode} 的 checked`);
        const modeLabel = labels.find((attrs) => attrs.for === `importMode${mode}`);
        assert.deepEqual(classesOf(modeLabel), ['form-check-label'], mode);
        // 標題與說明依狀態（清單空不空、在不在隊伍裡）由 JavaScript 填
        for (const [part, className] of [['Title', 'tm-choice-title'], ['Hint', 'tm-choice-hint']]) {
            const span = tagAttrs(html, `importMode${mode}${part}`);
            assert.deepEqual([classesOf(span), span['data-i18n']], [[className], undefined], `${mode}${part}`);
        }
    }
    const error = tagAttrs(html, 'importListError');
    assert.deepEqual([classesOf(error), error.role], [['error-message', 'hidden'], 'alert']);
    assert.deepEqual([classesOf(tagAttrs(html, 'cancelImportBtn')), tagAttrs(html, 'cancelImportBtn')['data-i18n']], [['btn'], 'treasure_map_cancel']);
    assert.deepEqual([classesOf(tagAttrs(html, 'confirmImportBtn')), tagAttrs(html, 'confirmImportBtn')['data-i18n']], [['btn', 'btn-primary'], 'treasure_map_import']);
    assert.equal((imported.match(/\bbtn-primary\b/g) || []).length, 1);
});

test('index.html 的腳本順序：list-share.js、list-dialogs.js 在 route-calculator.js 之後、script.js 之前', () => {
    const scripts = scriptSources(read(`${TOOL_DIR}/index.html`));
    const at = (name) => scripts.indexOf(name);
    assert.ok(at('route-calculator.js') !== -1 && at('route-calculator.js') < at('list-share.js'), scripts.join());
    assert.ok(at('list-share.js') < at('list-dialogs.js') && at('list-dialogs.js') < at('script.js'), scripts.join());
});

test('對話框的樣式：.tm-dialog 與 .tm-choice 寫在最後的 .hidden 前面；舊的 .ui-dialog 樣式與程式拿掉', () => {
    const css = read(`${TOOL_DIR}/style.css`);
    for (const selector of ['.tm-dialog', '.tm-dialog .dialog-body', '.tm-choice', '.tm-choice .form-check-label', '.tm-choice-title', '.tm-choice-hint']) {
        declarations(selector);
    }
    const hiddenAt = css.lastIndexOf('\n.hidden {');
    assert.ok(hiddenAt > 0);
    for (const rule of ['.tm-dialog {', '.tm-choice {']) assert.ok(css.indexOf(rule) !== -1 && css.indexOf(rule) < hiddenAt, rule);
    // fieldset 預設的框線、邊界、內距與最小寬度要清掉（窄螢幕才縮得進對話框）；.tm-choice 會被 .hidden 切換，display 只由這個單一 class 的選擇器設定
    const choice = declarations('.tm-choice');
    assert.match(choice, /display:\s*grid/);
    for (const reset of [/border:\s*0/, /margin:\s*0/, /padding:\s*0/, /min-width:\s*0/]) assert.match(choice, reset);
    assert.match(declarations('.tm-choice .form-check-label'), /display:\s*grid/);
    // 貼上的欄位用等寬字、字級不另外縮小：小於 16px 時 iOS Safari 一聚焦（openImport() 一打開就聚焦它）就會放大頁面
    const pasteBox = declarations('.tm-dialog textarea.form-control');
    assert.match(pasteBox, /font-family:\s*var\(--font-mono\)/);
    assert.doesNotMatch(pasteBox, /font-size/);
    // 選項的標題與說明是兩行：單選鈕對齊第一行，不是兩行的正中間（共用的 .form-check 是置中）
    assert.match(declarations('.tm-choice .form-check'), /align-items:\s*flex-start/);
    assert.doesNotMatch(css, /\.ui-dialog/);
    assert.doesNotMatch(read(`${TOOL_DIR}/ui-dialog-manager.js`), /showImportDialog|_createImportDialogContent|createDialogWithOverlay|dialogTitleSeq|ui-dialog/);
});

test('清空與匯入對話框的三語鍵值照設計；舊的確認、說明、提示用的鍵值刪掉，頁面與程式裡也不留', () => {
    const expected = {
        treasure_map_clear_title: ['清空清單？', 'Clear the list?', 'リストを空にしますか？'],
        treasure_map_clear_body: ['清單裡的 {count} 張寶圖都會移除。', 'All maps in the list will be removed ({count}).', 'リストの地図 {count} 枚がすべて削除されます。'],
        treasure_map_clear_body_room: [
            '隊伍清單裡的 {count} 張寶圖都會移除，隊友的清單也會跟著清空。',
            "All maps in the team list will be removed ({count}), and your teammates' lists will be cleared too.",
            'チームリストの地図 {count} 枚がすべて削除され、メンバーのリストも空になります。'
        ],
        treasure_map_clear_confirm_button: ['清空 {count} 張', 'Clear all ({count})', '{count} 枚を削除'],
        treasure_map_import_label: [
            '貼上分享連結，或以前用「匯出」複製的內容',
            'Paste a share link, or the text you copied with “Export” before',
            '共有リンク、または以前「エクスポート」でコピーした内容を貼り付けてください'
        ],
        treasure_map_import_found_link: ['連結裡有 {count} 張寶圖', 'Maps in the link: {count}', 'リンクに地図が {count} 枚あります'],
        treasure_map_import_found_json: ['內容有 {count} 張寶圖', 'Maps in the text: {count}', '内容に地図が {count} 枚あります'],
        treasure_map_import_success: ['已匯入 {count} 張寶圖', 'Maps imported: {count}', '{count} 枚の地図をインポートしました'],
        treasure_map_import_merged: ['已合併匯入 {count} 張新寶圖', 'New maps merged: {count}', '{count} 枚の新しい地図をマージしました'],
        treasure_map_import_unreadable: [
            '看不懂這段內容：請貼上分享連結，或以前匯出的內容',
            "Couldn't read this. Paste a share link or text you exported before.",
            'この内容は読み取れません。共有リンクか、以前エクスポートした内容を貼り付けてください'
        ],
        treasure_map_import_choice: ['匯入方式', 'How to import', 'インポート方法'],
        treasure_map_import_merge: ['合併', 'Merge', 'まとめる'],
        treasure_map_import_merge_hint: ['重複的只留一張', 'Duplicates are kept once', '重複は 1 枚にまとめます'],
        treasure_map_import_replace_hint: ['原本的寶圖會移除', 'Your current maps will be removed', '今ある地図は削除されます'],
        treasure_map_share_replace: ['取代我的清單', 'Replace my list', 'マイリストを置き換える'],
        treasure_map_share_replace_room: ['取代隊伍清單', 'Replace the team list', 'チームリストを置き換える'],
        treasure_map_share_none_found: ['分享連結裡沒有找得到的寶圖', 'None of the maps in this share link could be found', '共有リンクの地図が見つかりませんでした']
    };
    const gone = ['treasure_map_clear_confirm', 'treasure_map_import_instruction', 'treasure_map_import_placeholder', 'treasure_map_import_text_required',
        'treasure_map_import_file_format_error', 'treasure_map_import_failed'];
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(expected)) assert.equal(values.get(key), texts[index], `${lang} ${key}`);
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of gone) assert.ok(!keys.has(key), `${lang} 的 ${key} 應已刪除`);
    });
    // 刪掉的鍵值在頁面與工具的程式裡也不能留下（含註解：tests/scripts.test.js 會逐一檢查單引號字串）。
    // 'treasure_map_clear_confirm' 是新鍵值 'treasure_map_clear_confirm_button' 的前綴，所以連引號一起比
    const sources = [`${TOOL_DIR}/index.html`, ...fs.readdirSync(path.join(ROOT, TOOL_DIR)).filter((file) => file.endsWith('.js')).map((file) => `${TOOL_DIR}/${file}`)];
    for (const file of sources) {
        for (const key of gone) assert.doesNotMatch(read(file), new RegExp(`['"]${key}['"]`), `${file} 還在用 ${key}`);
    }
    assert.doesNotMatch(read(`${TOOL_DIR}/script.js`), /clearAllMaps|showImportDialog/);
});
