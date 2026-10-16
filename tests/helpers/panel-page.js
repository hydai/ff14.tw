// 寶圖搜尋器清單面板的頁面替身，給 tests/treasure-list-panel.test.js 共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。
//
//   const { createPanelPage, PANEL_IDS } = require('./helpers/panel-page.js');
//   const page = await createPanelPage({ url, lang: 'en', stored: { key: '字串' }, storageThrows: true, clipboard: 'reject' });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/treasure-map-finder';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/treasure-map-finder.js';

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（沒有 src 的不算）。只讀開始標籤裡的屬性，不用正規表示式比對整個 script 元素
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
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
// - addMaps(ids) 對每個 id 用目錄裡那張呼叫真正的 toggleMapInList()；team() 換上隊伍替身（不連伺服器），回傳每次同步送出的清單。
//   team({ meId, members, knownMembers, creatorId }) 決定隊伍裡有誰（預設只有自己：id 'me'、光之戰士K7Q）、看過哪些已離開的人的名字；
//   替身的 ownerOf() 用真正的 PartyNames.ownerOf()，所以 addedBy 對得上 members／knownMembers 的圖就會寫是誰的
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
    const team = ({ connecting = false, meId = 'me', members = [{ id: 'me', nickname: '光之戰士K7Q' }], knownMembers = {}, creatorId = 'me' } = {}) => {
        const sent = [];
        finder.roomCollaboration = {
            currentRoom: { roomCode: 'ABC123', members, creatorId },
            currentUser: members.find((member) => member.id === meId) ?? null,
            isConnecting: connecting,
            // 同 RoomCollaboration#ownerOf()，但不看 currentRoom：離開隊伍之後不再顯示是 TreasureMapFinder#ownerOf() 的事。
            // members、knownMembers 照傳進來的那一份讀，測試改它們（隊友離開、改名）就是隊伍變了
            ownerOf: (map) => dom.window.PartyNames.ownerOf(map, { members, knownMembers, meId }),
            mapSync: {
                getOperations: (maps) => maps.map((map) => ({ type: 'add', map })),
                replaceLocal: async (maps) => { sent.push(maps); return true; }
            }
        };
        finder.updateListCount();
        return sent;
    };
    return {
        dom, finder, $: (id) => dom.document.getElementById(id), toasts, clipboardWrites, storage, historyCalls, setLang,
        focused: () => dom.document.activeElement, key: (name) => dom.key(name), addMaps, team
    };
}

module.exports = { createPanelPage, PANEL_IDS };
