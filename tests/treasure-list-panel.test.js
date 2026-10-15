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
// 照 index.html 建出這些元素（mountFromHtml），跑真正的建構函式與 init()。清單的對話框（清空、匯入、分享）的 id 加在 mapDetailModal 前面，
// 順序同 index.html
const PANEL_IDS = ['stepHint', 'listEntryDesktop', 'levelTags', 'zoneFilterRow', 'resultCount', 'clearZonesBtn', 'treasureEmpty', 'treasureGrid',
    'listEntryMobile', 'listAnnouncer', 'panelOverlay', 'myListPanel', 'clearListModal', 'importListModal', 'shareMapsModal', 'mapDetailModal'];
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

test('隊友移除了最後一張，焦點在「複製分享連結」「清空清單」或「生成路線」上（藏起來或停用了）：焦點放到面板標題，不掉到 body；焦點在別處就不動', async () => {
    const page = await createPanelPage();
    page.finder.openListPanel();
    // 隊伍同步把清單清空：更新張數、重畫清單
    const teammateEmpties = () => {
        page.finder.listManager.clear();
        page.finder.updateListCount();
        page.finder.renderMyList();
    };
    for (const id of ['shareListBtn', 'clearAllBtn', 'generateRouteBtn']) {
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

    // 讀不到存過的複製格式：當作沒存過（複製時跟著介面語言用預設範本）
    assert.equal(page.finder.routeView.savedTemplate, null);
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

test('清空、匯入與分享對話框的結構：遮罩層 > .dialog.tm-dialog > 標頭、內文、動作列，放在離開隊伍對話框之後、詳細檢視之前', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const order = ['id="leaveRoomModal"', 'id="clearListModal"', 'id="importListModal"', 'id="shareMapsModal"', 'id="mapDetailModal"'].map((s) => html.indexOf(s));
    assert.ok(!order.includes(-1), `缺對話框：${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `對話框的順序：${order}`);
    for (const [id, close] of [['clearListModal', 'closeClearModalBtn'], ['importListModal', 'closeImportModalBtn'], ['shareMapsModal', 'closeShareModalBtn']]) {
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

// ---------- 分享連結 ----------
const URL_BASE = 'https://ff14.tw/tools/treasure-map-finder/';
const currentUrl = (page) => String(page.dom.window.location);
// 在分享對話框選「加進」或「取代」。fake-dom 的 radio 沒有互斥，所以兩顆都設；change 只由剛選中的那顆送出（同瀏覽器）
const chooseShareMode = (page, mode) => {
    page.$('shareModeMerge').checked = mode === 'merge';
    page.$('shareModeReplace').checked = mode === 'replace';
    page.$(mode === 'merge' ? 'shareModeMerge' : 'shareModeReplace').dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
};
const SIX_MAPS = ['tm_017', 'tm_007', 'tm_013', 'tm_022', 'tm_010', 'tm_033'];

test('複製分享連結：只帶寶圖 id（依清單順序），提示張數', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?grade=g17&room=ABC123` });
    page.addMaps(['tm_017', 'tm_007', 'tm_013']);
    await page.finder.copyShareLink();
    assert.deepEqual(page.clipboardWrites, [`${URL_BASE}?maps=tm_017,tm_007,tm_013`]);
    assert.deepEqual(page.toasts.at(-1), { message: '已複製分享連結（3 張）', type: 'success' });
});

test('複製分享連結：清單是空的就不做；剪貼簿拒絕寫入、或 id 編不成網址（結尾是不成對的代理字元）時跳「複製失敗」', async () => {
    const empty = await createPanelPage();
    await empty.finder.copyShareLink();
    assert.deepEqual([empty.clipboardWrites, empty.toasts], [[], []]);

    const denied = await createPanelPage({ clipboard: 'reject' });
    denied.addMaps(['tm_017']);
    await denied.finder.copyShareLink();
    assert.deepEqual(denied.toasts, [{ message: '複製失敗', type: 'error' }]);

    // 匯入進來的 id 若被 list-manager 照 UTF-16 code unit 截在一個字元的一半，encodeURIComponent 會丟 URIError：一樣走「複製失敗」，不是沒人接的例外
    const broken = await createPanelPage();
    broken.finder.listManager.add({ id: 'g8_test_\uD83D', level: 'g8', zone: 'Test', coords: { x: 10, y: 20 } });
    await broken.finder.copyShareLink();
    assert.deepEqual([broken.clipboardWrites, broken.toasts], [[], [{ message: '複製失敗', type: 'error' }]]);
});

test('「複製分享連結」在清單動作列的最前面：清單是空的時藏起來，按下去複製，名稱跟著語言', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?grade=g17` });
    assert.equal(isHidden(page, 'shareListBtn'), true);
    assert.equal(isHidden(page, 'importListBtn'), false);
    page.addMaps(['tm_017', 'tm_007']);
    assert.equal(isHidden(page, 'shareListBtn'), false);
    page.$('shareListBtn').click();
    await settle();
    assert.deepEqual(page.clipboardWrites, [`${URL_BASE}?maps=tm_017,tm_007`]);
    assert.deepEqual(page.toasts.at(-1), { message: '已複製分享連結（2 張）', type: 'success' });
    const label = () => page.$('shareListBtn').querySelector('[data-i18n]').textContent;
    assert.equal(label(), '複製分享連結');
    page.setLang('en');
    assert.equal(label(), 'Copy share link');
    page.setLang('ja');
    assert.equal(label(), '共有リンクをコピー');
    page.finder.listManager.clear();
    page.finder.updateListCount();
    assert.equal(isHidden(page, 'shareListBtn'), true);
});

test('打開分享連結（清單是空的）：列出寶圖、不顯示選項；加入後網址拿掉 maps、保留其他參數，焦點在結果張數', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?grade=g17&maps=tm_017,tm_999,tm_007&zone=urqopacha` });
    page.finder.handleSharedMaps();
    assert.equal(page.$('shareMapsModal').classList.contains('hidden'), false);
    assert.equal(page.$('shareMapsLede').textContent, '這個連結有 2 張寶圖：');
    assert.equal(page.$('shareMapsList').querySelectorAll('li').length, 2);
    assert.match(page.$('shareMapsList').textContent, /G17 科扎馬烏卡 \(20\.0, 6\.9\)/);
    assert.equal(page.$('shareMapsMissing').textContent, '另外 1 張找不到，已略過');
    assert.equal(page.$('shareMapsChoice').classList.contains('hidden'), true);
    page.$('confirmShareBtn').click();
    await settle();
    assert.deepEqual(Array.from(page.finder.listManager.getList(), (map) => map.id), ['tm_017', 'tm_007']);
    assert.equal(String(page.dom.window.location), `${URL_BASE}?grade=g17&zone=urqopacha`);
    assert.ok(page.focused() === page.$('resultCount'));
});

test('打開分享連結（清單不是空的）：預設加進、提示重複與總數；選取代只留連結裡的', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017,tm_007` });
    page.addMaps(['tm_007', 'tm_013']);
    page.finder.handleSharedMaps();
    assert.equal(page.$('shareModeMerge').checked, true);
    assert.equal(page.$('shareModeMergeHint').textContent, '重複的 1 張只留一張，共 3 張');
    assert.equal(page.$('shareModeReplaceHint').textContent, '只留這 2 張');
    assert.match(page.$('shareMapsList').textContent, /已在清單/);
    page.$('shareModeReplace').checked = true;
    page.$('shareModeReplace').dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
    page.$('confirmShareBtn').click();
    await settle();
    assert.deepEqual(Array.from(page.finder.listManager.getList(), (map) => map.id), ['tm_017', 'tm_007']);
});

test('「不用了」、✕、Escape 都不改清單，網址一樣拿掉 maps', async () => {
    for (const close of [(page) => page.$('dismissShareBtn').click(), (page) => page.$('closeShareModalBtn').click(), (page) => page.key('Escape')]) {
        const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017&room=ABC123` });
        page.finder.handleSharedMaps();
        close(page);
        assert.equal(page.finder.listManager.getLength(), 0);
        assert.equal(String(page.dom.window.location), `${URL_BASE}?room=ABC123`);
    }
});

test('分享連結裡一張都找不到：提示並拿掉 maps，不開對話框', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_998,tm_999` });
    page.finder.handleSharedMaps();
    assert.equal(page.$('shareMapsModal').classList.contains('hidden'), true);
    assert.deepEqual(page.toasts.at(-1), { message: '分享連結裡沒有找得到的寶圖', type: 'warning' });
    assert.equal(String(page.dom.window.location), URL_BASE);
});

test('隊伍裡：選項寫隊伍清單；超過 8 張或連線中時說明並停用「加入清單」（Review Focus 1、2）', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_008,tm_009,tm_011&room=ABC123` });
    page.addMaps(['tm_017', 'tm_007', 'tm_013', 'tm_022', 'tm_010', 'tm_033']);
    page.team();
    page.finder.handleSharedMaps();
    assert.equal(page.$('shareModeMergeTitle').textContent, '加進隊伍清單');
    assert.equal(page.$('shareMapsNote').textContent, '隊伍清單最多 8 張，加進去會變成 9 張');
    assert.equal(page.$('confirmShareBtn').disabled, true);
    page.$('shareModeReplace').checked = true;
    page.$('shareModeReplace').dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
    assert.equal(page.$('confirmShareBtn').disabled, false);
    const connecting = await createPanelPage({ url: `${URL_BASE}?maps=tm_008` });
    connecting.team({ connecting: true });
    connecting.finder.handleSharedMaps();
    assert.equal(connecting.$('shareMapsNote').textContent, '隊伍連線中，請稍候再修改清單。');
    assert.equal(connecting.$('confirmShareBtn').disabled, true);
});

test('載入順序：寶圖資料與隊伍還原或自動加入都結束後，才處理分享連結', () => {
    assert.match(read('tools/treasure-map-finder/script.js'), /Promise\.allSettled\(\[treasureMapFinder\.ready, roomCollaboration\.ready\]\)\.then\(\(\) => treasureMapFinder\.handleSharedMaps\(\)\)/);
    assert.match(read('tools/treasure-map-finder/room-collaboration.js'), /this\.ready = this\.init\(\);/);
});

test('網址沒有 maps、或寶圖資料沒載入成功：不開對話框、不跳 toast、網址不動', async () => {
    const plain = await createPanelPage({ url: `${URL_BASE}?grade=g17` });
    plain.finder.handleSharedMaps();
    const noData = await createPanelPage({ url: `${URL_BASE}?maps=tm_017` });
    noData.finder.maps = [];
    noData.finder.handleSharedMaps();
    for (const [page, url] of [[plain, `${URL_BASE}?grade=g17`], [noData, `${URL_BASE}?maps=tm_017`]]) {
        assert.equal(isHidden(page, 'shareMapsModal'), true, url);
        assert.deepEqual(page.toasts, [], url);
        assert.deepEqual(page.historyCalls, [], url);
        assert.equal(currentUrl(page), url);
    }
});

test('分享連結的 id：去掉空白與重複、順序照連結；maps 是空的算一張都找不到', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017,%20tm_007,tm_017,,tm_013` });
    page.finder.handleSharedMaps();
    assert.equal(page.$('shareMapsLede').textContent, '這個連結有 3 張寶圖：');
    assert.equal(isHidden(page, 'shareMapsMissing'), true, '沒有找不到的就不寫');
    page.$('confirmShareBtn').click();
    await settle();
    assert.deepEqual(mapIds(page), ['tm_017', 'tm_007', 'tm_013']);
    const blank = await createPanelPage({ url: `${URL_BASE}?maps=&room=ABC123` });
    blank.finder.handleSharedMaps();
    assert.equal(isHidden(blank, 'shareMapsModal'), true);
    assert.deepEqual(blank.toasts.at(-1), { message: '分享連結裡沒有找得到的寶圖', type: 'warning' });
    assert.equal(currentUrl(blank), `${URL_BASE}?room=ABC123`);
});

test('分享的寶圖一列一張：縮圖（alt 空白）、等級＋地名＋座標；已在清單的標「已在清單」', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017,tm_007` });
    page.addMaps(['tm_007']);
    page.finder.handleSharedMaps();
    const rows = page.$('shareMapsList').querySelectorAll('li');
    assert.deepEqual(rows.map((row) => row.className), ['tm-mini', 'tm-mini']);
    const [first, second] = rows;
    assert.deepEqual(first.children.map((child) => child.tagName), ['IMG', 'SPAN']);
    assert.deepEqual(second.children.map((child) => child.tagName), ['IMG', 'SPAN', 'SPAN']);
    assert.deepEqual([first.querySelector('img').getAttribute('alt'), first.querySelector('img').src], ['', catalogued(page, 'tm_017').thumbnail]);
    assert.deepEqual(first.children.map((child) => child.textContent), ['', 'G17 科扎馬烏卡 (20.0, 6.9)']);
    assert.deepEqual(second.children.map((child) => child.textContent), ['', 'G17 烏爾科帕恰 (13.7, 14.2)', '已在清單']);
    assert.deepEqual(second.children[2].className, 'tag');
    // 標籤前面有一個空白文字節點（children 只算元素，看不到它）：讀出來、複製下來都是「… (13.7, 14.2) 已在清單」，不黏在一起
    assert.deepEqual([first.textContent, second.textContent], ['G17 科扎馬烏卡 (20.0, 6.9)', 'G17 烏爾科帕恰 (13.7, 14.2) 已在清單']);
});

test('加入分享的寶圖：清單是空的 →「已匯入」，加進 →「已合併匯入」並保留原本的順序，取代 →「已匯入」', async () => {
    const empty = await createPanelPage({ url: `${URL_BASE}?maps=tm_017,tm_007` });
    empty.finder.handleSharedMaps();
    empty.$('confirmShareBtn').click();
    await settle();
    assert.deepEqual(empty.toasts, [{ message: '已匯入 2 張寶圖', type: 'success' }]);
    assert.equal(isHidden(empty, 'shareMapsModal'), true);

    const merged = await createPanelPage({ url: `${URL_BASE}?maps=tm_017,tm_007` });
    merged.addMaps(['tm_007', 'tm_013']);
    merged.finder.handleSharedMaps();
    merged.$('confirmShareBtn').click();
    await settle();
    assert.deepEqual(merged.toasts, [{ message: '已合併匯入 1 張新寶圖', type: 'success' }]);
    assert.deepEqual(mapIds(merged), ['tm_007', 'tm_013', 'tm_017']);

    const replaced = await createPanelPage({ url: `${URL_BASE}?maps=tm_017,tm_007` });
    replaced.addMaps(['tm_007', 'tm_013']);
    replaced.finder.handleSharedMaps();
    chooseShareMode(replaced, 'replace');
    replaced.$('confirmShareBtn').click();
    await settle();
    assert.deepEqual(replaced.toasts, [{ message: '已匯入 2 張寶圖', type: 'success' }]);
    assert.deepEqual(mapIds(replaced), ['tm_017', 'tm_007']);
});

test('加入分享的寶圖之後：清單入口與卡片的按鈕更新，隊伍收到新清單', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?grade=g17&maps=tm_017,tm_007` });
    const sent = page.team();
    page.finder.handleSharedMaps();
    page.$('confirmShareBtn').click();
    await settle();
    assert.equal(page.$('listEntryDesktop').querySelector('.tm-entry-label').textContent, '👥 隊伍清單 2/8');
    assert.equal(page.$('treasureGrid').querySelector('[data-map-id="tm_017"] .btn-add-to-list').dataset.state, 'added');
    assert.deepEqual(sent.map((maps) => Array.from(maps, (map) => map.id)), [['tm_017', 'tm_007']]);
});

test('隊伍裡分享對話框開著時清單變了（隊友同步）：上限說明、選項與「已在清單」跟著新的清單；玩家選的不被改掉', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_008,tm_009,tm_011` });
    page.addMaps(SIX_MAPS);
    page.team();
    page.finder.handleSharedMaps();
    const note = () => (isHidden(page, 'shareMapsNote') ? null : page.$('shareMapsNote').textContent);
    assert.deepEqual([note(), page.$('confirmShareBtn').disabled], ['隊伍清單最多 8 張，加進去會變成 9 張', true]);
    // 隊友移除一張：5 + 3 = 8，剛好放得下
    changeList(page, () => page.finder.listManager.remove('tm_033'));
    assert.deepEqual([note(), page.$('confirmShareBtn').disabled, page.$('shareModeMergeHint').textContent], [null, false, '共 8 張']);
    // 隊友加了連結裡的 tm_008 和 tm_033：7 張，加進來是 7 + 3 - 1 = 9
    changeList(page, () => { page.finder.listManager.add(catalogued(page, 'tm_008')); page.finder.listManager.add(catalogued(page, 'tm_033')); });
    assert.deepEqual([note(), page.$('confirmShareBtn').disabled], ['隊伍清單最多 8 張，加進去會變成 9 張', true]);
    assert.equal(page.$('shareModeMergeHint').textContent, '重複的 1 張只留一張，共 9 張');
    assert.match(page.$('shareMapsList').querySelector('li').textContent, /已在清單/);
    // 選了取代：只留連結裡的 3 張，放得下；改回加進又超過；之後隊友再動清單，玩家選的取代還在
    chooseShareMode(page, 'replace');
    assert.deepEqual([note(), page.$('confirmShareBtn').disabled], [null, false]);
    chooseShareMode(page, 'merge');
    assert.deepEqual([note(), page.$('confirmShareBtn').disabled], ['隊伍清單最多 8 張，加進去會變成 9 張', true]);
    chooseShareMode(page, 'replace');
    changeList(page, () => page.finder.listManager.remove('tm_033'));
    assert.deepEqual([page.$('shareModeReplace').checked, note(), page.$('confirmShareBtn').disabled], [true, null, false]);
    assert.equal(page.$('shareModeMergeHint').textContent, '重複的 1 張只留一張，共 8 張');
});

test('隊伍連線中又超過上限：提醒只寫連線中；不在隊伍裡沒有張數上限，個人清單再多也能加', async () => {
    const connecting = await createPanelPage({ url: `${URL_BASE}?maps=tm_008,tm_009,tm_011` });
    connecting.addMaps(SIX_MAPS);
    connecting.team({ connecting: true });
    connecting.finder.handleSharedMaps();
    assert.deepEqual([connecting.$('shareMapsNote').textContent, connecting.$('confirmShareBtn').disabled], ['隊伍連線中，請稍候再修改清單。', true]);

    const personal = await createPanelPage({ url: `${URL_BASE}?maps=tm_008,tm_009,tm_011` });
    personal.addMaps(SIX_MAPS);
    personal.finder.handleSharedMaps();
    assert.deepEqual([isHidden(personal, 'shareMapsNote'), personal.$('confirmShareBtn').disabled, personal.$('shareModeMergeHint').textContent], [true, false, '共 9 張']);
    assert.equal(personal.$('shareMapsNote').textContent, '', '藏起來的提醒不留舊的字（對話框的 aria-describedby 指向它）');
    personal.$('confirmShareBtn').click();
    await settle();
    assert.equal(personal.finder.listManager.getLength(), 9);
});

test('隊伍裡連結的寶圖比上限多：選取代、或清單是空的（等於取代）都說「這個連結有 N 張」並停用', async () => {
    const nine = (page) => page.finder.maps.slice(0, 9).map((map) => map.id);
    const preview = await createPanelPage();
    const url = `${URL_BASE}?maps=${nine(preview).join(',')}`;
    const full = await createPanelPage({ url });
    full.addMaps(['tm_017']);
    full.team();
    full.finder.handleSharedMaps();
    assert.equal(full.$('shareMapsNote').textContent, '隊伍清單最多 8 張，加進去會變成 10 張');
    chooseShareMode(full, 'replace');
    assert.deepEqual([full.$('shareMapsNote').textContent, full.$('confirmShareBtn').disabled], ['隊伍清單最多 8 張，這個連結有 9 張', true]);
    const empty = await createPanelPage({ url });
    empty.team();
    empty.finder.handleSharedMaps();
    assert.equal(isHidden(empty, 'shareMapsChoice'), true);
    assert.deepEqual([empty.$('shareMapsNote').textContent, empty.$('confirmShareBtn').disabled], ['隊伍清單最多 8 張，這個連結有 9 張', true]);
});

test('縮圖：卡片、清單的每一列、分享對話框的每一張都走同一個函式——圖片是裝飾（alt 空白）、延遲載入、載入失敗換成預設圖', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?grade=g17&maps=tm_017` });
    page.addMaps(['tm_007']);
    page.finder.handleSharedMaps();
    const images = [
        page.$('treasureGrid').querySelector('.tm-thumb').querySelector('img'),
        page.$('listContent').querySelector('.list-item').querySelector('img'),
        page.$('shareMapsList').querySelector('li').querySelector('img')
    ];
    for (const img of images) {
        assert.deepEqual([img.getAttribute('alt'), img.getAttribute('loading')], ['', 'lazy']);
        img.onerror.call(img);
        assert.equal(img.src, '/assets/images/treasure-map-placeholder.png');
    }
});

test('分享對話框開著時隊伍每兩秒同步一次：寶圖列只在內容真的變了（哪幾張已在清單、語言）才重畫，縮圖不閃', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017,tm_007` });
    page.addMaps(['tm_013']);
    page.team();
    page.finder.handleSharedMaps();
    const rows = () => page.$('shareMapsList').children;
    const [first, second] = rows();
    changeList(page, () => {});
    // 清單變了，但連結裡的寶圖沒有一張受影響：列不動，下面選項的說明照常更新
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_022')));
    assert.deepEqual([rows()[0] === first, rows()[1] === second], [true, true]);
    assert.equal(page.$('shareModeMergeHint').textContent, '共 4 張');
    // 連結裡的 tm_007 進了清單、或換了語言：才重畫
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_007')));
    assert.ok(rows()[1] !== second);
    assert.match(rows()[1].textContent, /已在清單/);
    const settled = rows()[0];
    page.setLang('en');
    assert.ok(rows()[0] !== settled);
});

test('分享對話框開著時隊伍每兩秒同步一次：說明、缺少、選項與提醒同樣的字不重寫；提醒消失時藏起來、文字也清空', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_008,tm_009,tm_011,tm_999` });
    page.addMaps(SIX_MAPS);
    page.team();
    page.finder.handleSharedMaps();
    const ids = ['shareMapsLede', 'shareMapsMissing', 'shareModeMergeTitle', 'shareModeMergeHint', 'shareModeReplaceTitle', 'shareModeReplaceHint', 'shareMapsNote'];
    const written = textNodesOf(page, ids);
    assert.deepEqual(textsOf(page, ids), ['這個連結有 3 張寶圖：', '另外 1 張找不到，已略過', '加進隊伍清單', '共 9 張', '取代隊伍清單', '只留這 3 張',
        '隊伍清單最多 8 張，加進去會變成 9 張']);
    page.finder.updateListCount();
    page.finder.updateListCount();
    assert.ok(sameNodes(page, ids, written), '清單沒變：文字節點還是同一個');
    // 隊友移除一張，加進來剛好 8 張：合併的說明換字、提醒消失；只有這兩處換節點
    changeList(page, () => page.finder.listManager.remove('tm_033'));
    assert.deepEqual([page.$('shareModeMergeHint').textContent, isHidden(page, 'shareMapsNote'), page.$('shareMapsNote').textContent], ['共 8 張', true, '']);
    assert.deepEqual(ids.map((id, index) => page.$(id).firstChild === written[index]), [true, true, true, false, true, true, false]);
});

test('分享對話框開著時清單從空變成有寶圖：出現「加進／取代」；整份被清空則收起，說明跟著變', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017,tm_007` });
    page.finder.handleSharedMaps();
    assert.equal(isHidden(page, 'shareMapsChoice'), true);
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_007')));
    assert.equal(isHidden(page, 'shareMapsChoice'), false);
    assert.equal(page.$('shareModeMergeHint').textContent, '重複的 1 張只留一張，共 2 張');
    assert.match(page.$('shareMapsList').textContent, /已在清單/);
    changeList(page, () => page.finder.listManager.clear());
    assert.equal(isHidden(page, 'shareMapsChoice'), true);
    assert.doesNotMatch(page.$('shareMapsList').textContent, /已在清單/);
    assert.equal(isHidden(page, 'shareMapsModal'), false, '分享對話框還在');
});

test('分享對話框開著時切換語言：標題、說明、清單的地名與標籤、選項重畫，上一次的錯誤收起來', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017,tm_007,tm_999` });
    page.addMaps(['tm_007']);
    page.finder.handleSharedMaps();
    assert.equal(isHidden(page, 'shareMapsMissing'), false, '有找不到的寶圖時顯示說明');
    const ids = ['shareMapsModal-title', 'shareMapsLede', 'shareMapsMissing', 'shareModeMergeTitle', 'shareModeMergeHint', 'shareModeReplaceTitle',
        'shareModeReplaceHint', 'dismissShareBtn', 'confirmShareBtn'];
    page.setLang('en');
    assert.deepEqual(textsOf(page, ids), ['Add shared maps', 'Maps in this link (2):', 'Not found and skipped: 1', 'Add to my list',
        'Duplicates kept once: 1 · Total: 2', 'Replace my list', 'Keep only the maps from this link (2)', 'No thanks', 'Add to list']);
    assert.deepEqual(page.$('shareMapsList').querySelectorAll('li').map((row) => row.textContent),
        ["G17 Kozama'uka (20.0, 6.9)", 'G17 Urqopacha (13.7, 14.2) Already in your list']);
    page.$('shareMapsError').textContent = '舊語言寫的錯誤';
    page.$('shareMapsError').classList.remove('hidden');
    page.setLang('ja');
    assert.deepEqual(textsOf(page, ids), ['共有された地図を追加', 'このリンクには地図が 2 枚あります：', 'ほかの 1 枚は見つからなかったので省きました', 'マイリストに追加',
        '重複の 1 枚は 1 枚にまとめ、合計 2 枚', 'マイリストを置き換える', 'この 2 枚だけにする', '追加しない', 'リストに追加']);
    assert.match(page.$('shareMapsList').textContent, /リストにあります/);
    assert.deepEqual([isHidden(page, 'shareMapsError'), page.$('shareMapsError').textContent], [true, '']);
    page.team();
    assert.deepEqual(textsOf(page, ['shareModeMergeTitle', 'shareModeReplaceTitle']), ['チームリストに追加', 'チームリストを置き換える']);
});

test('加入失敗：原因寫在對話框裡、對話框不關、網址還沒動；改選項就收起錯誤；關起來之後網址才拿掉', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017&grade=g17` });
    page.addMaps(['tm_007']);
    page.team();
    // 隊伍還在同步：驗證整批操作時超過一次能送的數量（RoomCollaboration.validateMapOperations）
    page.finder.roomCollaboration.mapSync.getOperations = () => Array.from({ length: 17 }, () => ({ type: 'remove', id: 'x' }));
    page.finder.handleSharedMaps();
    page.$('confirmShareBtn').click();
    await settle();
    assert.deepEqual([isHidden(page, 'shareMapsError'), page.$('shareMapsError').textContent], [false, '請等待隊伍同步完成後再匯入。']);
    assert.deepEqual([isHidden(page, 'shareMapsModal'), mapIds(page), currentUrl(page)], [false, ['tm_007'], `${URL_BASE}?maps=tm_017&grade=g17`]);
    assert.deepEqual(page.toasts, []);
    chooseShareMode(page, 'replace');
    assert.equal(isHidden(page, 'shareMapsError'), true, '改了選項，上一次的錯誤不再適用');
    page.$('dismissShareBtn').click();
    assert.equal(currentUrl(page), `${URL_BASE}?grade=g17`);
});

test('按兩次「加入清單」只加入一次；等隊伍同步的這段時間，對話框不跟著新清單重畫', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017,tm_007` });
    page.addMaps(['tm_007']);
    const sent = page.team();
    page.finder.handleSharedMaps();
    page.$('confirmShareBtn').click();
    page.$('confirmShareBtn').click();
    // 清單已經換成新的、同步還沒回來：「已在清單」不會冒出來、選項不會變
    assert.deepEqual(mapIds(page), ['tm_007', 'tm_017']);
    assert.doesNotMatch(page.$('shareMapsList').querySelector('li').textContent, /已在清單/);
    assert.equal(isHidden(page, 'shareMapsModal'), false);
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(page.toasts.filter((toast) => toast.type === 'success').length, 1);
    assert.equal(isHidden(page, 'shareMapsModal'), true);
});

test('隊伍裡分享對話框開著時隊友改了清單：焦點所在的「加入清單」停用、或「加進／取代」整組藏起來時，焦點移到「不用了」，不掉到 body；焦點在別處就不動', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_008,tm_009,tm_011` });
    page.addMaps(['tm_017', 'tm_007', 'tm_013', 'tm_022', 'tm_010']);
    page.team();
    page.finder.handleSharedMaps();
    assert.equal(page.$('confirmShareBtn').disabled, false, '5 + 3 = 8，剛好放得下');
    page.$('confirmShareBtn').focus();
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_033')));   // 隊友加了一張：加進去會變成 9 張
    assert.equal(page.$('confirmShareBtn').disabled, true);
    assert.ok(page.focused() === page.$('dismissShareBtn'));
    page.$('shareModeReplace').focus();
    chooseShareMode(page, 'replace');
    changeList(page, () => page.finder.listManager.clear());   // 隊友清空：沒有「加進／取代」可選
    assert.equal(isHidden(page, 'shareMapsChoice'), true);
    assert.ok(page.focused() === page.$('dismissShareBtn'));
    page.$('closeShareModalBtn').focus();
    changeList(page, () => page.finder.listManager.add(catalogued(page, 'tm_033')));
    assert.ok(page.focused() === page.$('closeShareModalBtn'));
});

test('分享對話框：焦點停在「加入清單」時改了選項（Safari 與 macOS 的 Firefox 點選項不會移動焦點），「加入清單」這次停用了就把焦點放到剛選的選項', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_008,tm_009,tm_011` });
    page.addMaps(SIX_MAPS);
    page.team();
    page.finder.handleSharedMaps();
    chooseShareMode(page, 'replace');
    assert.equal(page.$('confirmShareBtn').disabled, false, '取代：只留連結裡的 3 張');
    page.$('confirmShareBtn').focus();
    chooseShareMode(page, 'merge');   // 點「加進」：6 + 3 = 9 張，放不下
    assert.equal(page.$('confirmShareBtn').disabled, true);
    assert.ok(page.focused() === page.$('shareModeMerge'));
    chooseShareMode(page, 'replace');   // 焦點在選項上時改選項：不動
    assert.ok(page.focused() === page.$('shareModeMerge'));
});

test('等隊伍同步時關掉分享對話框、改用匯入：匯入不被擋住，分享的同步回來時也不關掉匯入對話框', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017` });
    page.team();
    const sync = holdSync(page);
    page.finder.handleSharedMaps();
    page.$('confirmShareBtn').click();
    page.key('Escape');
    page.finder.openListPanel();
    page.$('importListBtn').focus();
    openImportWith(page, '?maps=tm_007');
    page.$('confirmImportBtn').click();
    assert.deepEqual(mapIds(page), ['tm_017', 'tm_007']);
    sync.release();   // 分享的同步回來了
    await settle();
    assert.equal(isHidden(page, 'importListModal'), false, '匯入還在等自己的同步');
    sync.release();
    await settle();
    assert.equal(isHidden(page, 'importListModal'), true);
    assert.equal(currentUrl(page), URL_BASE);
});

test('點遮罩也算關閉：網址拿掉 maps、焦點在結果張數；再打開一次是乾淨的（預設加進、沒有舊錯誤）', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017&room=ABC123#top` });
    page.addMaps(['tm_007']);
    page.finder.handleSharedMaps();
    chooseShareMode(page, 'replace');
    page.$('shareMapsError').textContent = '舊的錯誤';
    page.$('shareMapsError').classList.remove('hidden');
    page.$('shareMapsModal').click();
    assert.equal(isHidden(page, 'shareMapsModal'), true);
    assert.equal(page.$('shareMapsModal').style.display, '', '關閉後不留 display');
    assert.equal(currentUrl(page), `${URL_BASE}?room=ABC123#top`, '其他參數與 hash 保留');
    assert.ok(page.focused() === page.$('resultCount'));
    assert.deepEqual(mapIds(page), ['tm_007']);
    page.finder.listDialogs.openShare([catalogued(page, 'tm_017')], 0);
    assert.deepEqual([page.$('shareModeMerge').checked, page.$('shareModeReplace').checked], [true, false]);
    assert.deepEqual([isHidden(page, 'shareMapsError'), page.$('shareMapsError').textContent], [true, '']);
    assert.equal(isHidden(page, 'shareMapsMissing'), true);
});

test('分享對話框疊在開著的清單面板上（隊伍自動加入還沒結束時先打開了面板）：關掉後焦點回到面板裡，不跑到面板外的結果張數；原本那顆被重畫換掉了就放到面板標題', async () => {
    const page = await createPanelPage({ url: `${URL_BASE}?maps=tm_017&room=ABC123` });
    page.addMaps(['tm_007']);
    page.finder.openListPanel();
    page.finder.handleSharedMaps();
    page.$('dismissShareBtn').click();
    assert.ok(page.finder.modalManager.activeModal === page.$('myListPanel'), '面板還開著');
    assert.ok(page.focused() === page.$('closePanelBtn'), '焦點回到分享對話框打開之前的位置');
    // 取代：清單重畫，焦點原本所在的 ✕ 換掉了，ModalManager 還原不了
    page.$('listContent').querySelector('[data-map-id="tm_007"] .btn-remove').focus();
    page.finder.listDialogs.openShare([catalogued(page, 'tm_017')], 0);
    chooseShareMode(page, 'replace');
    page.$('confirmShareBtn').click();
    await settle();
    assert.deepEqual(mapIds(page), ['tm_017']);
    assert.ok(page.focused() === page.$('myListPanel-title'));
});

test('分享對話框的標記：說明、清單、缺少、選項、提醒、錯誤由程式填（不掛 data-i18n）；只有一顆主要按鈕；分享鈕在清單動作列最前面', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const share = sliceElementById(html, 'shareMapsModal');
    assert.equal(tagAttrs(html, 'shareMapsModal-title')['data-i18n'], 'treasure_map_share_title');
    const plain = (id, classes) => {
        const attrs = tagAttrs(html, id);
        assert.deepEqual([classesOf(attrs), attrs['data-i18n']], [classes, undefined], id);
        return attrs;
    };
    plain('shareMapsLede', ['tm-dialog-lede']);
    plain('shareMapsList', ['tm-mini-list']);
    assert.match(share, /<ul\b[^>]*\sid="shareMapsList"/);
    plain('shareMapsMissing', ['form-text', 'hidden']);
    plain('shareMapsChoice', ['tm-choice', 'hidden']);
    // 提醒（隊伍上限、連線中）是狀態訊息：role="status" 讓它出現時被唸出來；對話框的說明指向它，打開時一併唸出
    assert.equal(plain('shareMapsNote', ['warning-message', 'hidden']).role, 'status');
    assert.equal(tagAttrs(html, 'shareMapsModal')['aria-describedby'], 'shareMapsNote');
    assert.equal(plain('shareMapsError', ['error-message', 'hidden']).role, 'alert');
    const legend = parseAttrs(share.match(/<legend\b[^>]*>/)[0]);
    assert.deepEqual([classesOf(legend), legend['data-i18n']], [['visually-hidden'], 'treasure_map_share_choice']);
    assert.equal((share.match(/class="form-check"/g) || []).length, 2);
    const labels = [...share.matchAll(/<label\b[^>]*>/g)].map((m) => parseAttrs(m[0]));
    for (const [mode, checked] of [['Merge', true], ['Replace', false]]) {
        const radio = tagAttrs(html, `shareMode${mode}`);
        assert.deepEqual([radio.type, radio.name, radio.value, classesOf(radio)], ['radio', 'shareMode', mode.toLowerCase(), ['form-check-input']], mode);
        assert.equal(new RegExp(`<input\\b[^>]*id="shareMode${mode}"[^>]*\\schecked[\\s>]`).test(share), checked, `${mode} 的 checked`);
        assert.deepEqual(classesOf(labels.find((attrs) => attrs.for === `shareMode${mode}`)), ['form-check-label'], mode);
        plain(`shareMode${mode}Title`, ['tm-choice-title']);
        plain(`shareMode${mode}Hint`, ['tm-choice-hint']);
    }
    const dismiss = tagAttrs(html, 'dismissShareBtn');
    const confirmAttrs = tagAttrs(html, 'confirmShareBtn');
    assert.deepEqual([classesOf(dismiss), dismiss['data-i18n']], [['btn'], 'treasure_map_share_dismiss']);
    assert.deepEqual([classesOf(confirmAttrs), confirmAttrs['data-i18n']], [['btn', 'btn-primary'], 'treasure_map_share_confirm']);
    assert.equal((share.match(/\bbtn-primary\b/g) || []).length, 1);
    // 清單動作列：分享、匯入、（靠右的）清空
    const actions = sliceElementById(html, 'listActions');
    const order = ['id="shareListBtn"', 'id="importListBtn"', 'id="clearAllBtn"'].map((s) => actions.indexOf(s));
    assert.ok(!order.includes(-1) && order[0] < order[1] && order[1] < order[2], `動作列的順序：${order}`);
    const shareBtn = tagAttrs(html, 'shareListBtn');
    assert.deepEqual([classesOf(shareBtn), shareBtn.type], [['btn', 'btn-sm'], 'button']);
    assert.match(actions, /<span class="btn-icon">🔗<\/span> <span data-i18n="treasure_map_share_link">複製分享連結<\/span>/);
});

test('分享對話框的樣式：說明、縮圖清單寫在最後的 .hidden 前面，清單去掉項目符號與內距', () => {
    const css = read(`${TOOL_DIR}/style.css`);
    const hiddenAt = css.lastIndexOf('\n.hidden {');
    for (const rule of ['.tm-dialog-lede {', '.tm-mini-list {', '.tm-mini {', '.tm-mini img {', '.tm-mini-text {']) {
        assert.ok(css.indexOf(rule) !== -1 && css.indexOf(rule) < hiddenAt, rule);
    }
    // ul 預設的項目符號與內距要清掉（對話框內文的 > * 只清邊界）
    const list = declarations('.tm-mini-list');
    assert.match(list, /list-style:\s*none/);
    assert.match(list, /padding:\s*0/);
    assert.match(declarations('.tm-mini'), /display:\s*flex/);
    assert.match(declarations('.tm-mini img'), /width:\s*36px/);
    assert.match(declarations('.tm-mini-text'), /min-width:\s*0/);
});

test('分享連結的三語鍵值照設計', () => {
    const expected = {
        treasure_map_share_link: ['複製分享連結', 'Copy share link', '共有リンクをコピー'],
        treasure_map_share_copied: ['已複製分享連結（{count} 張）', 'Share link copied (maps: {count})', '共有リンクをコピーしました（{count} 枚）'],
        treasure_map_share_title: ['加入分享的寶圖', 'Add shared maps', '共有された地図を追加'],
        treasure_map_share_lede: ['這個連結有 {count} 張寶圖：', 'Maps in this link ({count}):', 'このリンクには地図が {count} 枚あります：'],
        treasure_map_share_in_list: ['已在清單', 'Already in your list', 'リストにあります'],
        treasure_map_share_missing: ['另外 {count} 張找不到，已略過', 'Not found and skipped: {count}', 'ほかの {count} 枚は見つからなかったので省きました'],
        treasure_map_share_choice: ['要怎麼加入', 'How to add them', '追加のしかた'],
        treasure_map_share_merge: ['加進我的清單', 'Add to my list', 'マイリストに追加'],
        treasure_map_share_merge_room: ['加進隊伍清單', 'Add to the team list', 'チームリストに追加'],
        treasure_map_share_merge_hint: [
            '重複的 {duplicates} 張只留一張，共 {total} 張',
            'Duplicates kept once: {duplicates} · Total: {total}',
            '重複の {duplicates} 枚は 1 枚にまとめ、合計 {total} 枚'
        ],
        treasure_map_share_merge_hint_new: ['共 {total} 張', 'Total: {total}', '合計 {total} 枚'],
        treasure_map_share_replace_hint: ['只留這 {count} 張', 'Keep only the maps from this link ({count})', 'この {count} 枚だけにする'],
        treasure_map_share_over_limit_merge: [
            '隊伍清單最多 {max} 張，加進去會變成 {total} 張',
            'A team list holds up to {max} maps; adding these would make {total}',
            'チームリストは {max} 枚までです。追加すると {total} 枚になります'
        ],
        treasure_map_share_over_limit_replace: [
            '隊伍清單最多 {max} 張，這個連結有 {total} 張',
            'A team list holds up to {max} maps; this link has {total}',
            'チームリストは {max} 枚までです。このリンクには {total} 枚あります'
        ],
        treasure_map_share_dismiss: ['不用了', 'No thanks', '追加しない'],
        treasure_map_share_confirm: ['加入清單', 'Add to list', 'リストに追加']
    };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(expected)) assert.equal(values.get(key), texts[index], `${lang} ${key}`);
    });
});

// ---------- 路線頁 ----------
// 烏爾科帕恰 3 張（tm_007、tm_013、tm_010）、科扎馬烏卡 2 張（tm_017、tm_022）、夏羅尼荒野 1 張（tm_033），同 tests/treasure-route-aetherytes.test.js 的 EXAMPLE
const EXAMPLE = SIX_MAPS;
// 把寶圖加進清單，再按桌機入口的「生成路線」
const openRouteWith = (page, ids) => {
    page.addMaps(ids);
    page.$('listEntryDesktop').querySelector('[data-entry="route"]').click();
};
const stops = (page) => Array.from(page.$('routeStops').querySelectorAll('li'));
// 不用 id 組選擇器（匯入的自訂寶圖 id 可能有引號）
const stopOf = (page, id) => stops(page).find((li) => li.dataset.mapId === id);
// 用鍵盤按的時候焦點本來就在那顆上；fake-dom 的 click() 不會移動焦點，所以先 focus()
const press = (button) => {
    button.focus();
    button.click();
};
// 隊友把這張移除了（同隊伍同步改了清單）：不經過 removeFromList() 的焦點處理，直接改清單再更新張數、重畫
const drop = (page, id) => {
    page.finder.listManager.remove(id);
    page.finder.updateListCount();
    page.finder.renderMyList();
};

test('路線頁的結構：在清單面板裡、清單頁的旁邊；舊的路線與格式面板拿掉', () => {
    const html = read('tools/treasure-map-finder/index.html');
    const panel = sliceElementById(html, 'myListPanel');
    assert.deepEqual(classesOf(tagAttrs(html, 'routeView')), ['tm-panel-view', 'hidden']);
    assert.ok(panel.indexOf('id="listView"') < panel.indexOf('id="routeView"'));
    const view = sliceElementById(html, 'routeView');
    for (const id of ['routeBackBtn', 'routeViewTitle', 'closeRouteViewBtn', 'routeOverview', 'routeNote', 'resetRouteBtn', 'routeStops', 'copyAllStopsBtn', 'copyNextStopBtn']) assert.ok(view.includes(`id="${id}"`), id);
    assert.equal((view.match(/class="[^"]*\bbtn-primary\b/g) || []).length, 1);
    assert.equal(tagAttrs(html, 'routeViewTitle').tabindex, '-1');
    for (const gone of ['id="routePanel"', 'id="formatPanel"', 'id="teleportFormat"', 'id="mapFormat"']) assert.ok(!html.includes(gone), gone);
    const ui = read('tools/treasure-map-finder/ui-dialog-manager.js');
    for (const gone of ['showRouteResult', 'showFormatPanel', 'formatModalManager', 'showExportDialog', 'showImportDialog']) assert.ok(!ui.includes(gone), gone);
    const script = read('tools/treasure-map-finder/script.js');
    for (const gone of ['generateRoute(', 'copyEntireRoute', 'formatStepForCopy', 'formatSettings']) assert.ok(!script.includes(gone), gone);
});

test('生成路線：在面板裡切到路線頁，焦點在「路線」；6 張的站序、傳送、摘要與目前這一站', async () => {
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    assert.equal(page.$('routeView').classList.contains('hidden'), false);
    assert.equal(page.$('listView').classList.contains('hidden'), true);
    assert.equal(page.$('myListPanel').getAttribute('aria-labelledby'), 'routeViewTitle');
    assert.ok(page.focused() === page.$('routeViewTitle'));
    assert.equal(page.$('routeOverview').textContent, '6 張 · 3 個地區 · 5 次傳送');
    assert.deepEqual(stops(page).map((li) => li.dataset.mapId), ['tm_010', 'tm_007', 'tm_013', 'tm_017', 'tm_022', 'tm_033']);
    assert.deepEqual(stops(page).map((li) => li.querySelector('.tm-stop-tp')?.textContent.trim() ?? null),
        ['🔮 傳送 瓦群佩洛', null, '🔮 傳送 沃克爾·佐莫爾', '🔮 傳送 奧克哈努', '🔮 傳送 波加停船所', '🔮 傳送 謝謝內青燐泉']);
    assert.equal(stops(page)[0].querySelector('.tm-stop-title').textContent, 'G17 烏爾科帕恰 #4');
    assert.ok(stops(page)[0].classList.contains('is-current'));
    assert.equal(stops(page)[0].querySelector('.tm-stop-preview').textContent, '/p 1/6 G17 烏爾科帕恰 (21.6, 23.9) 最近：瓦群佩洛');
    assert.equal(page.$('copyNextStopLabel').textContent, '複製下一站（1/6）');
});

test('複製下一站與每站的 📋：一站一行；全部複製包括完成的站，超過 15 行改成警告', async () => {
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    page.$('copyNextStopBtn').click();
    await settle();
    assert.equal(page.clipboardWrites.at(-1), '/p 1/6 G17 烏爾科帕恰 (21.6, 23.9) 最近：瓦群佩洛');
    assert.deepEqual(page.toasts.at(-1), { message: '已複製第 1 站', type: 'success' });
    stopOf(page, 'tm_017').querySelector('[data-action="copy"]').click();
    await settle();
    assert.equal(page.clipboardWrites.at(-1), '/p 4/6 G17 科扎馬烏卡 (20.0, 6.9) 最近：奧克哈努');
    stopOf(page, 'tm_010').querySelector('[data-action="done"]').click();
    page.$('copyAllStopsBtn').click();
    await settle();
    assert.equal(page.clipboardWrites.at(-1).split('\n').length, 6);
    assert.deepEqual(page.toasts.at(-1), { message: '已複製 6 站', type: 'success' });
    const big = await createPanelPage();
    openRouteWith(big, big.finder.maps.filter((map) => map.level === 'g17').slice(0, 16).map((map) => map.id));
    big.$('copyAllStopsBtn').click();
    await settle();
    assert.deepEqual(big.toasts.at(-1), { message: '已複製 16 行。遊戲的使用者巨集最多 15 行，超過的部分要分兩次貼。', type: 'warning' });
});

test('完成：目前這一站往下移、唸出下一站、焦點留在按下的那顆；重新整理後進度還在；全部完成時主要按鈕停用', async () => {
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    const done = (id) => stopOf(page, id).querySelector('[data-action="done"]');
    press(done('tm_010'));
    assert.equal(done('tm_010').getAttribute('aria-pressed'), 'true');
    assert.ok(page.focused() === done('tm_010'));
    assert.ok(stopOf(page, 'tm_007').classList.contains('is-current'));
    assert.equal(page.$('listAnnouncer').textContent, '第 1 站完成。下一站：G17 烏爾科帕恰 (13.7, 14.2)');
    assert.equal(page.$('routeOverview').textContent, '完成 1/6');
    assert.equal(page.$('resetRouteBtn').classList.contains('hidden'), false);
    const reloaded = await createPanelPage({ stored: Object.fromEntries(page.storage) });
    reloaded.$('listEntryDesktop').querySelector('[data-entry="route"]').click();
    assert.ok(stopOf(reloaded, 'tm_010').classList.contains('is-done'));
    for (const id of ['tm_007', 'tm_013', 'tm_017', 'tm_022', 'tm_033']) done(id).click();
    assert.equal(page.$('routeOverview').textContent, '6 站都完成了');
    assert.equal(page.$('copyNextStopBtn').disabled, true);
    assert.equal(page.$('copyNextStopLabel').textContent, '全部完成');
    assert.equal(page.$('listAnnouncer').textContent, '第 6 站完成。全部完成了');
    page.$('resetRouteBtn').click();
    assert.equal(stops(page).filter((li) => li.classList.contains('is-done')).length, 0);
    assert.ok(page.focused() === page.$('routeViewTitle'));
});

test('「完成」切換鈕的名稱是動作（標記第 N 站完成）而不是狀態：有沒有完成由 aria-pressed 說；看得到的字還是「完成」', async () => {
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    const done = (id) => stopOf(page, id).querySelector('[data-action="done"]');
    const describe = (id) => [done(id).getAttribute('aria-label'), done(id).getAttribute('aria-pressed'), done(id).textContent];
    assert.deepEqual(describe('tm_010'), ['標記第 1 站完成', 'false', '完成']);
    assert.equal(done('tm_007').getAttribute('aria-label'), '標記第 2 站完成');
    page.setLang('en');
    assert.deepEqual(describe('tm_010'), ['Mark stop 1 done', 'false', 'Done']);
    page.setLang('ja');
    assert.deepEqual(describe('tm_010'), ['1 か所目を完了にする', 'false', '完了']);
    press(done('tm_010'));
    assert.deepEqual(describe('tm_010'), ['1 か所目を完了にする', 'true', '✓ 完了'], '標記完成之後名稱不變，只有 aria-pressed 與 ✓ 變');
});

test('路線頁的英文計數沒有複數規則：「Stops copied: 1」「All stops done (1)」，一站也通順', async () => {
    for (const [ids, count] of [[['tm_007'], 1], [EXAMPLE, 6]]) {
        const page = await createPanelPage({ lang: 'en' });
        openRouteWith(page, ids);
        page.$('copyAllStopsBtn').click();
        await settle();
        assert.deepEqual(page.toasts.at(-1), { message: `Stops copied: ${count}`, type: 'success' });
        for (const id of ids) stopOf(page, id).querySelector('[data-action="done"]').click();
        assert.equal(page.$('routeOverview').textContent, `All stops done (${count})`);
    }
});

test('路線頁的計數與完成鈕的三語鍵值照設計', () => {
    const expected = {
        treasure_map_route_all_done: ['{total} 站都完成了', 'All stops done ({total})', '{total} か所すべて完了'],
        treasure_map_route_done: ['完成', 'Done', '完了'],
        treasure_map_route_done_label: ['標記第 {n} 站完成', 'Mark stop {n} done', '{n} か所目を完了にする'],
        treasure_map_route_copied_all: ['已複製 {count} 站', 'Stops copied: {count}', '{count} か所をコピーしました']
    };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(expected)) assert.equal(values.get(key), texts[index], `${lang} ${key}`);
    });
});

const doneIdsOf = (page) => stops(page).filter((li) => li.classList.contains('is-done')).map((li) => li.dataset.mapId);

test('進度在路線頁開著時被清掉：按「完成」只記這一站，不把畫面上舊的完成記號又存回去', async () => {
    const key = 'ff14tw_treasure_route_progress';
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    stopOf(page, 'tm_010').querySelector('[data-action="done"]').click();
    page.finder.routeProgress.clear();   // 清單沒變，路線頁沒有重畫：畫面上還留著 tm_010 的完成記號
    assert.deepEqual(doneIdsOf(page), ['tm_010']);
    press(stopOf(page, 'tm_007').querySelector('[data-action="done"]'));
    assert.deepEqual(doneIdsOf(page), ['tm_007']);
    assert.deepEqual(JSON.parse(page.storage.get(key)).done, ['tm_007']);
    assert.equal(stopOf(page, 'tm_007').querySelector('[data-action="done"]').getAttribute('aria-pressed'), 'true');
    assert.ok(page.focused() === stopOf(page, 'tm_007').querySelector('[data-action="done"]'));
});

test('進度在路線頁開著時超過 12 小時：按「完成」從乾淨的進度開始', async () => {
    const key = 'ff14tw_treasure_route_progress';
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    stopOf(page, 'tm_010').querySelector('[data-action="done"]').click();
    page.finder.routeProgress.now = () => Date.now() + 13 * 3600e3;   // 頁面開了一整夜
    assert.deepEqual(doneIdsOf(page), ['tm_010']);
    stopOf(page, 'tm_007').querySelector('[data-action="done"]').click();
    assert.deepEqual(doneIdsOf(page), ['tm_007']);
    assert.deepEqual(JSON.parse(page.storage.get(key)).done, ['tm_007']);
});

test('按「完成」時進度重新排序了：唸出的站號是重排之後的站號', async () => {
    const page = await createPanelPage();
    openRouteWith(page, ['tm_033', 'tm_017']);
    page.addMaps(['tm_022']);   // 跑到一半加進來的插在同地區後面：夏羅尼荒野、科扎馬烏卡、科扎馬烏卡
    assert.deepEqual(stops(page).map((li) => li.dataset.mapId), ['tm_033', 'tm_017', 'tm_022']);
    page.finder.routeProgress.clear();   // 重新排序：寶圖多的科扎馬烏卡先跑
    stopOf(page, 'tm_033').querySelector('[data-action="done"]').click();
    assert.deepEqual(stops(page).map((li) => li.dataset.mapId), ['tm_017', 'tm_022', 'tm_033']);
    assert.equal(page.$('listAnnouncer').textContent.split('。')[0], '第 3 站完成');
});

test('站別的無障礙語意：ol 明確標 role="list"（Safari 在 list-style: none 時會丟掉清單語意），只有目前這一站標 aria-current="step"，換站就跟著移動', async () => {
    assert.equal(tagAttrs(PAGE_HTML, 'routeStops').role, 'list');
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    assert.equal(page.$('routeStops').getAttribute('role'), 'list');
    const currentIds = () => stops(page).filter((li) => li.hasAttribute('aria-current')).map((li) => li.dataset.mapId);
    const toggle = (id) => stopOf(page, id).querySelector('[data-action="done"]').click();
    assert.deepEqual(currentIds(), ['tm_010']);
    assert.equal(stopOf(page, 'tm_010').getAttribute('aria-current'), 'step');
    toggle('tm_010');
    assert.deepEqual(currentIds(), ['tm_007']);
    toggle('tm_010');   // 取消完成：目前這一站回到第一站
    assert.deepEqual(currentIds(), ['tm_010']);
    for (const id of ['tm_010', 'tm_007', 'tm_013', 'tm_017', 'tm_022', 'tm_033']) toggle(id);
    assert.deepEqual(currentIds(), [], '全部完成：沒有目前這一站');
});

test('1 張也能排：一站、要傳送', async () => {
    const page = await createPanelPage();
    openRouteWith(page, ['tm_007']);
    assert.equal(page.$('routeOverview').textContent, '1 張 · 1 個地區 · 1 次傳送');
    assert.equal(stops(page).length, 1);
});

test('跟著變：清單變了照規則更新站序（目前這一站被移除就換下一站）；清單空了回到清單頁（Review Focus 4）', async () => {
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    drop(page, 'tm_010');
    assert.deepEqual(stops(page).map((li) => li.dataset.mapId), ['tm_007', 'tm_013', 'tm_017', 'tm_022', 'tm_033']);
    assert.ok(stopOf(page, 'tm_007').classList.contains('is-current'));
    page.addMaps(['tm_008']);
    assert.deepEqual(stops(page).map((li) => li.dataset.mapId), ['tm_007', 'tm_008', 'tm_013', 'tm_017', 'tm_022', 'tm_033']);
    for (const id of ['tm_007', 'tm_008', 'tm_013', 'tm_017', 'tm_022', 'tm_033']) drop(page, id);
    assert.equal(page.$('routeView').classList.contains('hidden'), true);
    assert.ok(page.focused() === page.$('myListPanel-title'));
});

test('隊伍同步讓「重設進度」藏起來、或讓「複製下一站」停用：原本在那顆上的焦點放到標題「路線」，不掉到 body', async () => {
    const page = await createPanelPage();
    openRouteWith(page, ['tm_007', 'tm_013']);
    stopOf(page, 'tm_007').querySelector('[data-action="done"]').click();
    page.$('resetRouteBtn').focus();
    drop(page, 'tm_007');   // 唯一完成的那張被隊友移除：沒有完成的站了
    assert.equal(page.$('resetRouteBtn').classList.contains('hidden'), true);
    assert.ok(page.focused() === page.$('routeViewTitle'));

    page.addMaps(['tm_007']);
    stopOf(page, 'tm_013').querySelector('[data-action="done"]').click();
    page.$('copyNextStopBtn').focus();
    drop(page, 'tm_007');   // 還沒完成的那張被隊友移除：剩下的都完成了
    assert.equal(page.$('copyNextStopBtn').disabled, true);
    assert.ok(page.focused() === page.$('routeViewTitle'));
});

test('清單、語言、複製格式都沒變時，隊伍每 2 秒的同步不重畫路線頁：站別還是同一批節點（不閃）；語言變了才重畫', async () => {
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    const before = stops(page);
    assert.equal(before.length, 6);
    page.finder.renderMyList();   // 輪詢一次、再一次：清單沒變
    page.finder.renderMyList();
    assert.equal(stops(page).length, 6);
    assert.ok(stops(page).every((li, index) => li === before[index]));
    page.setLang('en');
    assert.ok(stops(page).every((li, index) => li !== before[index]));
});

test('同步重畫時的焦點：還在的那一站，焦點留在同一站的同一顆；焦點所在的那一站被隊友移除了，放到標題「路線」，不掉到 body', async () => {
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    const buttonOf = (id, action) => stopOf(page, id).querySelector(`[data-action="${action}"]`);
    buttonOf('tm_013', 'copy').focus();
    drop(page, 'tm_007');   // 別的站被移除：整排重畫，焦點回到 tm_013 重畫後的 📋
    assert.ok(page.focused() === buttonOf('tm_013', 'copy'));
    buttonOf('tm_013', 'done').focus();
    drop(page, 'tm_013');   // 焦點所在的這一站被移除
    assert.equal(stopOf(page, 'tm_013'), undefined);
    assert.ok(page.focused() === page.$('routeViewTitle'));
});

test('分享對話框疊在開著的路線頁上：加入之後路線重畫、焦點原本所在的那顆換掉了，焦點放到標題「路線」', async () => {
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    stopOf(page, 'tm_013').querySelector('[data-action="done"]').focus();
    page.finder.listDialogs.openShare([catalogued(page, 'tm_008')], 0);
    page.$('confirmShareBtn').click();
    await settle();
    assert.equal(stops(page).length, 7);
    assert.ok(page.finder.routeView.isOpen());
    assert.ok(page.focused() === page.$('routeViewTitle'));
});

test('進度清掉的時機：加進時保留；取代、清空時清掉；全部完成後清單變了、超過 12 小時重新來過', async () => {
    const key = 'ff14tw_treasure_route_progress';
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    stopOf(page, 'tm_010').querySelector('[data-action="done"]').click();
    page.$('routeBackBtn').click();   // 匯入、清空都在清單頁做
    await page.finder.importFromText('?maps=tm_008', { merge: true });
    assert.deepEqual(JSON.parse(page.storage.get(key)).done, ['tm_010']);
    await page.finder.importFromText('?maps=tm_008,tm_009', { merge: false });
    assert.equal(page.storage.has(key), false);
    page.$('generateRouteBtn').click();
    for (const id of ['tm_008', 'tm_009']) stopOf(page, id).querySelector('[data-action="done"]').click();
    page.addMaps(['tm_011']);
    assert.equal(stops(page).filter((li) => li.classList.contains('is-done')).length, 0, '全部完成後清單變了：重新來過');
    page.$('routeBackBtn').click();
    page.$('clearAllBtn').click();
    page.$('confirmClearBtn').click();
    assert.equal(page.storage.has(key), false);
    // 載入時清單裡要有這一張：清單是空的就會先被「0 張結束這一趟」清掉，測不到 12 小時
    const listed = await createPanelPage();
    listed.addMaps(['tm_007']);
    const stale = await createPanelPage({
        stored: {
            ff14tw_treasure_map_list: listed.storage.get('ff14tw_treasure_map_list'),
            [key]: JSON.stringify({ order: ['tm_007'], done: ['tm_007'], updatedAt: new Date(Date.now() - 13 * 3600e3).toISOString() })
        }
    });
    assert.equal(stale.storage.has(key), true, '載入時進度還在，要等到讀的時候才因為過期被清掉');
    stale.$('listEntryDesktop').querySelector('[data-entry="route"]').click();
    assert.equal(stopOf(stale, 'tm_007').classList.contains('is-done'), false);
});

test('清單變成 0 張就結束這一趟：移除最後一張、隊友清空（同步）都把進度清掉，同一張寶圖加回來不是完成的', async () => {
    const key = 'ff14tw_treasure_route_progress';
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    stopOf(page, 'tm_010').querySelector('[data-action="done"]').click();
    for (const id of ['tm_007', 'tm_013', 'tm_017', 'tm_022', 'tm_033']) drop(page, id);
    assert.deepEqual(JSON.parse(page.storage.get(key)).done, ['tm_010'], '還剩完成的那一張：進度還在');
    drop(page, 'tm_010');   // 完成的那一張最後才移除：變成 0 張的當下，存著的進度還是 { order: [tm_010], done: [tm_010] }
    assert.equal(page.storage.has(key), false);
    openRouteWith(page, ['tm_010']);
    assert.deepEqual(doneIdsOf(page), []);

    stopOf(page, 'tm_010').querySelector('[data-action="done"]').click();
    page.finder.listManager.clear();   // 隊友清空了清單（或清空清單並離開隊伍）：不經過 clearList()
    page.finder.updateListCount();
    page.finder.renderMyList();
    assert.equal(page.storage.has(key), false);
    openRouteWith(page, ['tm_010']);
    assert.deepEqual(doneIdsOf(page), []);
});

test('路線頁沒開著時清單變了：已經有的進度照樣對齊（移除再加回同一張不是完成的；全部完成之後再變就清掉）；沒變不存；還沒有進度時不建立', async () => {
    const key = 'ff14tw_treasure_route_progress';
    const page = await createPanelPage();
    openRouteWith(page, ['tm_007', 'tm_013']);
    stopOf(page, 'tm_007').querySelector('[data-action="done"]').click();
    page.$('routeBackBtn').click();   // 回到清單頁：路線頁沒開著
    drop(page, 'tm_007');   // 完成的那一張被移除（隊友挖完了）
    assert.deepEqual(JSON.parse(page.storage.get(key)).done, [], '不在清單裡的從完成記號拿掉');
    page.addMaps(['tm_007']);   // 同一個地點又有一張新的
    page.$('generateRouteBtn').click();
    assert.deepEqual(doneIdsOf(page), []);
    assert.equal(page.$('copyNextStopLabel').textContent, '複製下一站（1/2）');

    // 全部完成之後，在清單頁時清單又有變化：進度清掉，等打開路線頁再依第一次排序的規則排
    for (const id of ['tm_007', 'tm_013']) stopOf(page, id).querySelector('[data-action="done"]').click();
    page.$('routeBackBtn').click();
    const saved = page.storage.get(key);
    page.finder.routeProgress.now = () => Date.now() + 3600e3;   // 一小時後隊伍輪詢一次：清單沒變，不存（不延長 12 小時）
    page.finder.renderMyList();
    assert.equal(page.storage.get(key), saved);
    page.addMaps(['tm_022']);
    assert.equal(page.storage.has(key), false);

    const fresh = await createPanelPage();
    fresh.addMaps(['tm_007', 'tm_013']);
    drop(fresh, 'tm_007');
    assert.equal(fresh.storage.has(key), false, '沒打開過路線頁：不建立進度');
});

test('切換語言：摘要、站名、傳送點與預覽換成新語言（沒存過格式時預覽跟著介面語言）', async () => {
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    page.setLang('en');
    assert.equal(page.$('routeOverview').textContent, 'Maps: 6 · Zones: 3 · Teleports: 5');
    assert.equal(stops(page)[0].querySelector('.tm-stop-title').textContent, 'G17 Urqopacha #4');
    assert.equal(stops(page)[0].querySelector('.tm-stop-preview').textContent, '/p 1/6 G17 Urqopacha (21.6, 23.9) Nearest: Wachunpelo');
});

test('沒有傳送點的站：沒有傳送行，複製預設範本不留「最近」（Review Focus 5）', async () => {
    const page = await createPanelPage();
    page.finder.listManager.add({ id: 'g8_test_1', level: 'g8', zone: 'Test', coords: { x: 10, y: 20 } });
    page.finder.updateListCount();
    page.finder.renderMyList();
    page.finder.openRoute();
    assert.equal(stops(page)[0].querySelector('.tm-stop-tp'), null);
    assert.equal(stops(page)[0].querySelector('.tm-stop-preview').textContent, '/p 1/1 G8 Test (10.0, 20.0)');
});

test('目錄裡找不到、也沒有 zoneId 的舊項目：摘要算進一次傳送，那一站就有傳送行，複製的句子有「最近」', async () => {
    const page = await createPanelPage();
    page.finder.listManager.add({ id: 'legacy_1', level: 'g17', zone: "Kozama'uka", coords: { x: 20, y: 6.9 } });
    page.finder.updateListCount();
    page.finder.renderMyList();
    page.finder.openRoute();
    assert.equal(page.$('routeOverview').textContent, '1 張 · 1 個地區 · 1 次傳送');
    const [stop] = stops(page);
    assert.equal(stop.querySelector('.tm-stop-tp')?.textContent.trim(), '🔮 傳送 奧克哈努');
    assert.equal(stop.querySelector('.tm-stop-title').textContent, 'G17 科扎馬烏卡');
    assert.equal(stop.querySelector('.tm-stop-preview').textContent, '/p 1/1 G17 科扎馬烏卡 (20.0, 6.9) 最近：奧克哈努');
    page.$('copyNextStopBtn').click();
    await settle();
    assert.equal(page.clipboardWrites.at(-1), '/p 1/1 G17 科扎馬烏卡 (20.0, 6.9) 最近：奧克哈努');
});

test('「‹ 清單」回到清單頁、焦點在「生成路線」；Escape 關掉整個面板，下次從清單入口打開是清單頁', async () => {
    const page = await createPanelPage();
    openRouteWith(page, EXAMPLE);
    page.$('routeBackBtn').click();
    assert.equal(page.$('listView').classList.contains('hidden'), false);
    assert.ok(page.focused() === page.$('generateRouteBtn'));
    page.$('generateRouteBtn').click();
    page.key('Escape');
    assert.equal(page.finder.modalManager.activeModal, null);
    page.$('listEntryDesktop').querySelector('[data-entry="list"]').click();
    assert.equal(page.$('listView').classList.contains('hidden'), false);
});

test('舊的格式設定在載入時轉換：存過舊的日文預設 → 複製用新的日文預設並寫回（Review Focus 3）', async () => {
    const legacy = JSON.stringify({ teleport: '/p <傳送點_ja>にテレポート <座標>', map: '/p 次 <寶圖等級> - <地區_ja> <座標>' });
    const page = await createPanelPage({ stored: { treasureMapFormatSettings: legacy } });
    openRouteWith(page, EXAMPLE);
    assert.equal(stops(page)[0].querySelector('.tm-stop-preview').textContent, '/p 1/6 G17 オルコ・パチャ (21.6, 23.9) 最寄り：ワチュンペロ');
    assert.deepEqual(JSON.parse(page.storage.get('treasureMapFormatSettings')).version, 2);
});
