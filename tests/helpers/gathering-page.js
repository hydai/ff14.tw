// 採集頁（特殊採集時間管理器）的頁面替身，給 tests/timed-gathering-page.test.js 與之後的採集頁測試共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。作法照 tests/helpers/weather-page.js。
//
//   const { createGatheringPage } = require('./helpers/gathering-page.js');
//   const page = await createGatheringPage({ now, lang: 'en', stored: { key: '字串' }, storageThrows: true, notification: 'denied', clipboard: 'reject', items, narrow: true });
//   page.tick(1000); page.runTimeouts(); await page.settle();
//
// - 照 index.html 建出 #gatheringTool 與 #dialogOverlay（mountFromHtml），照 index.html 的 <script src> 順序載入這個工具的翻譯檔、
//   共用的 security-utils.js、reminder-scheduler.js（index.html 有載入時）與工具目錄自己的每一個腳本（src 不含 /），
//   最後 new TimedGatheringManager() 並等 app.ready。頁首與頁尾（layout-loader.js）、common.js（realToast 除外）、modal-manager.js、
//   i18n-manager.js 與共用翻譯檔不載入，用到的部分改用下面的替身
// - items：fetch 回傳的採集物資料，預設是 data/timed-gathering.json 的 items；stored 是 localStorage 的初始內容（鍵 -> 字串）
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立頁面之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）。
//   有 data-i18n-html 的元素維持 index.html 的內容，不翻譯
// - storageThrows：光是讀 localStorage（裸的全域或 window.localStorage）就丟例外（Chrome 封鎖網站資料時是 SecurityError）；
//   否則 localStorage 是 storage 這個 Map（stored 是初始內容）。存取器要在 vm 的 context 裡面定義，理由見 panel-page.js
// - 時間：Date.now 由 page.now 控制（可讀可寫；不帶參數的 new Date() 不受影響，頁面的時鐘一行也讀 Date.now()）；
//   tick(ms) 先把時間往後推，再把每個還沒清掉的 setInterval 回呼跑一次（時鐘、ReminderScheduler 的檢查、卡片與我的提醒的倒數）。
//   setTimeout 只記下、不真的計時，runTimeouts() 把呼叫當下排著的（沒清掉、還沒跑過的）各跑一次，跑的時候新排的留到下一次；
//   requestAnimationFrame 立刻執行
// - notification：'default'、'granted'、'denied'、'unsupported'、'throws'、'dismissed'（詢問被關掉，權限一直是 'default'），
//   替身在 notification-stubs.js（和天氣頁共用）。
//   notifications 記下每則送出的 { title, body, tag }，permissionRequests 是 requestPermission() 被呼叫幾次，
//   beeps 是排了幾聲提示音（oscillator.start() 幾次）
// - toasts 記下 FF14Utils.showToast() 的 { message, type }。clipboard 記下 navigator.clipboard.writeText() 寫入的內容；
//   clipboard: 'reject' 時 writeText() 回傳被拒絕的 Promise（什麼都不記）
// - realToast：true 時在工具的腳本之前載入真正的 assets/js/common.js（頂層只定義東西並登記 DOMContentLoaded，這裡不會觸發），
//   FF14Utils 換成它的（getI18nText 照樣從 i18n 替身取字）：showToast() 在 body 加上 .toast 與給螢幕閱讀器的朗讀區，
//   顯示與收起照上面 setTimeout 的規則，toasts 照樣記下每一次。預設 false：FF14Utils 是替身，showToast() 只記在 toasts
// - fetch 只認 ../../data/timed-gathering.json（回傳 items）。FileReader 的 readAsText(text) 立刻以 text 呼叫 onload（importFile() 收到的是字串）。
//   ModalManager 的 show(overlay) 加 active、hide() 拿掉（真的那個由 modal-manager-stack 測試負責）
// - 匯出用的 Blob 與 URL.createObjectURL／revokeObjectURL 是 Node 自己的（fake-dom 的 window.URL 就是 Node 的 URL），不用替身
// - 頁面的 console 只有 log、error、warn，都不印到真的 console，三種都記在 consoleErrors：頁面不該在 console 留下任何東西，
//   所以期待 consoleErrors 是空的測試也擋得住多出來的除錯訊息（每一筆是 util.format(...參數) 的結果，同 Node 的 console：
//   物件與 Symbol 照 util.inspect 寫，Error 寫成它的 stack，第一行是「Error: 訊息」；例如 storageThrows 時 ListManager 讀不到清單的那一筆）
// - fake-dom 的元素少了幾樣頁面會用到的東西，這份 document 建出來的每個元素（mountFromHtml 建的與頁面自己建的）都補上：
//   input、textarea、select 的 value（沒設過是 value 屬性，textarea 是裡面的文字，都沒有就是 ''；設過之後以設的為準，同瀏覽器；
//   select 的 value 不會照選取的 option 推算，所以頁面與測試都直接設 value，例如 #leadSelect）、
//   input、textarea 的 select()（重新命名清單的對話框一打開就會呼叫）、每個元素的 scrollIntoView()（生成巨集之後會呼叫），後兩個什麼都不做，
//   以及每個元素的 getBoundingClientRect()（按卡片上的「提醒我」時量按鈕的位置）：沒有排版，每個值都是 0，元素不會動；
//   測試要模擬位置就在那個元素上換掉它
// - scrolls 記下 window.scrollBy(x, y) 的每一次呼叫（[x, y]），不真的捲動：按「提醒我」時我的提醒把按鈕推開，頁面會捲回去補。
//   測試要知道目前捲到哪裡，就自己把 scrolls 累加起來
// - narrow：視窗在 480px 以下（手機），預設 false。window.matchMedia(query) 回傳的替身只有 '(max-width: 480px)' 會是 matches: narrow，
//   其他 query 一律 false；setNarrow(next) 換寬度並對 '(max-width: 480px)' 的每個替身派送 change（同視窗跨過 480px 時）
// - cards() 是 #itemsContainer 裡的卡片（有 .card 的子元素，照畫面順序；沒有符合時的空狀態不算）；cardOf(key) 找 data-material 為 key 的卡片，沒有就是 null
// - settle()：等 await 跑完（例如點擊處理裡等權限的回答）。storageEvent(key) 在 window 上派送 storage 事件（另一個分頁改了 localStorage）
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');
const { NOTIFICATION_MODES, fakeNotification, fakeAudioContext } = require('./notification-stubs.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/timed-gathering';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/timed-gathering.js';
const SECURITY_UTILS = 'assets/js/security-utils.js';
const SCHEDULER = 'assets/js/reminder-scheduler.js';
const COMMON = 'assets/js/common.js';
const PAGE_URL = 'https://ff14.tw/tools/timed-gathering/index.html';
const DATA_URL = '../../data/timed-gathering.json';

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（同 weather-page.js）
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

// fake-dom 的元素少了幾樣瀏覽器有、頁面會用到的東西，建出來時補上：
// - input、textarea、select 的 value：沒設過是 value 屬性（textarea 是裡面的文字），都沒有就是 ''；設過之後以設的為準
// - select()（選取輸入框的文字，重新命名清單的對話框一打開就會呼叫）與 scrollIntoView()：什麼都不做
// - getBoundingClientRect()：沒有排版，每個值都是 0（量前量後一樣，頁面不會補捲動）；要模擬位置的測試在元素上換掉它
function addBrowserParts(element) {
    const tag = element.tagName.toLowerCase();
    element.scrollIntoView = () => {};
    element.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
    if (tag === 'input' || tag === 'textarea') element.select = () => {};
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        let assigned = null;
        Object.defineProperty(element, 'value', {
            configurable: true,
            get: () => assigned ?? (tag === 'textarea' ? element.textContent : (element.getAttribute('value') ?? '')),
            set: (value) => { assigned = value === null ? '' : String(value); }
        });
    }
    return element;
}

const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
// 翻譯檔、共用的 security-utils.js 與提醒排程（index.html 有載入時）、工具目錄自己的腳本；其他共用腳本不載入，用到的部分改用下面的替身
const PAGE_SCRIPTS = scriptSources(PAGE_HTML)
    .filter((src) => !src.includes('/') || [`../../${TRANSLATIONS}`, `../../${SECURITY_UTILS}`, `../../${SCHEDULER}`].includes(src))
    .map((src) => path.posix.join(TOOL_DIR, src));
const DATA_ITEMS = require('../../data/timed-gathering.json').items;
const CLIPBOARD_MODES = ['ok', 'reject'];
const NARROW_QUERY = '(max-width: 480px)';

async function createGatheringPage({
    now = 1_760_000_000_000, lang = 'zh', stored = {}, storageThrows = false, notification = 'default', clipboard = 'ok', items = DATA_ITEMS,
    realToast = false, narrow = false
} = {}) {
    assert.ok(NOTIFICATION_MODES.includes(notification), `不認得的 notification：${notification}`);
    assert.ok(CLIPBOARD_MODES.includes(clipboard), `不認得的 clipboard：${clipboard}`);
    const dom = createFakeDom({ url: PAGE_URL });
    const win = dom.window;
    const storage = new Map(Object.entries(stored));
    const toasts = [];
    const consoleErrors = [];
    const clipboardWrites = [];
    const scrolls = [];
    const intervals = [];
    const timeouts = [];
    const languageListeners = [];
    const notificationLog = { created: [], requests: 0 };
    const audioLog = { beeps: 0 };
    const translations = { zh: {}, en: {}, ja: {} };
    let currentLang = lang;
    let isNarrow = narrow;
    // matchMedia 的替身：每次呼叫一個，各自記下 change 監聽（MediaQueryList 的 addEventListener）
    const mediaLists = [];
    const matchMedia = (query) => {
        const listeners = [];
        const list = {
            media: query,
            get matches() { return query === NARROW_QUERY && isNarrow; },
            addEventListener: (type, listener) => { if (type === 'change') listeners.push(listener); },
            removeEventListener: (type, listener) => {
                const index = listeners.indexOf(listener);
                if (index !== -1) listeners.splice(index, 1);
            },
            dispatch: () => { for (const listener of [...listeners]) listener({ matches: list.matches, media: query }); }
        };
        mediaLists.push(list);
        return list;
    };
    const lookup = (key) => [currentLang, 'zh'].map((l) => translations[l][key]).find((text) => text !== undefined);
    const fill = (text, params = {}) => text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    // 同 I18nManager.updatePageLanguage() 處理 [data-i18n] 的部分：有 data-i18n-attr 的換那個屬性，否則換掉整段文字
    const translatePage = () => {
        for (const element of dom.document.querySelectorAll('[data-i18n]')) {
            const text = lookup(element.dataset.i18n) ?? element.dataset.i18n;
            if (element.dataset.i18nAttr) element.setAttribute(element.dataset.i18nAttr, text);
            else element.textContent = text;
        }
    };
    const itemsJson = JSON.stringify({ items });

    // ModalManager 替身：頁面一律用 active 顯示對話框
    class FakeModalManager {
        show(overlay) {
            this.overlay = overlay;
            overlay.classList.add('active');
        }

        hide() {
            this.overlay?.classList.remove('active');
            this.overlay = null;
        }
    }

    win.__now = now;
    vm.runInContext('Date.now = () => globalThis.__now', win);
    dom.document.visibilityState = 'visible';

    // 這份 document 建出來的每個元素（mountFromHtml 建的與頁面自己建的）都補上 addBrowserParts()：
    // 只換這份 document 的 createElement，不動 fake-dom 的元素類別（它被每一個 dom 共用）
    const createElement = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => addBrowserParts(createElement(tag));

    // 頁面的 console 不印到真的 console：log、error、warn 都照 Node 的 console 用 util.format() 寫成一筆字串記下來
    // （參數是物件或 Symbol 時 join() 寫不出來或會丟錯）
    const record = (...args) => { consoleErrors.push(util.format(...args)); };
    Object.assign(win, {
        console: { log: record, error: record, warn: record },
        setInterval: (callback) => { intervals.push({ callback, cleared: false }); return intervals.length; },
        clearInterval: (id) => { if (intervals[id - 1]) intervals[id - 1].cleared = true; },
        setTimeout: (callback, delay) => { timeouts.push({ callback, delay, cleared: false, done: false }); return timeouts.length; },
        clearTimeout: (id) => { if (timeouts[id - 1]) timeouts[id - 1].cleared = true; },
        requestAnimationFrame: (callback) => { callback(0); return 0; },
        matchMedia,
        scrollBy: (x, y) => { scrolls.push([x, y]); },
        fetch: async (url) => {
            if (url !== DATA_URL) throw new Error(`createGatheringPage 沒有準備 ${url}`);
            return { ok: true, text: async () => itemsJson };
        },
        FileReader: class {
            readAsText(text) { this.onload({ target: { result: text } }); }
        },
        Blob,
        navigator: {
            clipboard: {
                writeText: async (text) => {
                    if (clipboard === 'reject') throw new Error('NotAllowedError');
                    clipboardWrites.push(text);
                }
            }
        },
        AudioContext: fakeAudioContext(audioLog),
        i18n: {
            get currentLanguage() { return currentLang; },
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
            getI18nText: (key, fallback, params) => (win.i18n.hasKey(key) ? win.i18n.getText(key, params) : fill(fallback, params)),
            showToast: (message, type) => toasts.push({ message, type })
        },
        ModalManager: FakeModalManager
    });
    if (notification !== 'unsupported') win.Notification = fakeNotification(notification, notificationLog);
    if (storageThrows) {
        vm.runInContext("Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true })", win);
        assert.throws(() => vm.runInContext('typeof localStorage', win), /SecurityError/);
        assert.throws(() => vm.runInContext('window.localStorage', win), /SecurityError/);
    } else {
        win.localStorage = {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: (key) => storage.delete(key),
            key: (index) => Array.from(storage.keys())[index] ?? null,
            get length() { return storage.size; }
        };
    }

    mountFromHtml(dom, PAGE_HTML, ['gatheringTool', 'dialogOverlay']);
    if (realToast) {
        // common.js 的頂層 const FF14Utils 成為這個 context 的全域，也設成 window.FF14Utils：工具的腳本用的都是它。
        // 在同一個物件上把 showToast() 包一層，兩種寫法都照樣記在 toasts
        dom.load(COMMON);
        const utils = win.FF14Utils;
        const showToast = utils.showToast.bind(utils);
        utils.showToast = (message, type) => {
            toasts.push({ message, type });
            showToast(message, type);
        };
    }
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const app = vm.runInContext('new TimedGatheringManager()', win);
    await app.ready;

    const $ = (id) => dom.document.getElementById(id);
    return {
        window: win,
        document: dom.document,
        app,
        storage,
        $,
        get now() { return win.__now; },
        set now(value) { win.__now = value; },
        tick(ms) {
            win.__now += ms;
            for (const interval of [...intervals]) if (!interval.cleared) interval.callback();
        },
        runTimeouts() {
            for (const timeout of [...timeouts]) {
                if (timeout.cleared || timeout.done) continue;
                timeout.done = true;
                timeout.callback();
            }
        },
        settle: () => new Promise((resolve) => setImmediate(resolve)),
        setLang(next) {
            currentLang = next;
            translatePage();
            for (const listener of [...languageListeners]) listener(next);
        },
        storageEvent(key) {
            win.dispatchEvent(new win.Event('storage', { key }));
        },
        setNarrow(next) {
            isNarrow = next;
            for (const list of mediaLists) if (list.media === NARROW_QUERY) list.dispatch();
        },
        notifications: notificationLog.created,
        get permissionRequests() { return notificationLog.requests; },
        get beeps() { return audioLog.beeps; },
        toasts,
        consoleErrors,
        clipboard: clipboardWrites,
        scrolls,
        cards: () => $('itemsContainer').children.filter((child) => child.classList.contains('card')),
        cardOf: (key) => $('itemsContainer').querySelector(`[data-material="${key}"]`)
    };
}

module.exports = { createGatheringPage };
