const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDom } = require('./helpers/fake-dom.js');
const { classesOf, tagAttrs, sliceElementById, mountFromHtml } = require('./helpers/html-fragment.js');

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
// 照 index.html 建出這些元素（mountFromHtml），跑真正的建構函式與 init()。Task 8、9 把新對話框的 id 加在 mapDetailModal 前面
const PANEL_IDS = ['stepHint', 'listEntryDesktop', 'levelTags', 'zoneFilterRow', 'resultCount', 'clearZonesBtn', 'treasureEmpty', 'treasureGrid',
    'listEntryMobile', 'listAnnouncer', 'panelOverlay', 'myListPanel', 'mapDetailModal'];
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
