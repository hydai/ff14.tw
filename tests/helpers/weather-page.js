// 天氣預報頁的頁面替身，給 tests/weather-state.test.js 與之後的天氣頁測試共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。作法照 tests/helpers/panel-page.js。
//
//   const { createWeatherPage } = require('./helpers/weather-page.js');
//   const page = createWeatherPage({ hash: '#kozamauka-7', now, lang: 'en', stored: { key: '字串' }, storageThrows: true, notification: 'denied' });
//   page.selectZone('gridania'); page.tick(60_000); await page.settle();
//
// - 照 index.html 建出 #weatherTool（mountFromHtml），照 index.html 的 <script src> 順序載入這個工具的翻譯檔、
//   共用的 reminder-scheduler.js（index.html 有載入時）與工具目錄自己的每一個腳本（src 不含 /），最後 new WeatherForecast()
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立頁面之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）
// - storageThrows：光是讀 localStorage（裸的全域或 window.localStorage）就丟例外（Chrome 封鎖網站資料時是 SecurityError）；
//   否則 localStorage 是 storage 這個 Map（stored 是初始內容）。存取器要在 vm 的 context 裡面定義，理由見 panel-page.js
// - 時間：Date.now 由 page.now 控制（可讀可寫）；tick(ms) 先把時間往後推，再把每個還沒清掉的 setInterval 回呼跑一次。
//   setTimeout 只記下、不真的計時（頁內提示 8 秒後收起用的是它，測試不用等）；requestAnimationFrame 立刻執行
// - history.replaceState 換掉 location（同瀏覽器，不派送 hashchange）；changeHash(hash) 改網址並派送 hashchange
// - notification：'default'（requestPermission() 回傳並改成 'granted'）、'granted'、'denied'、'unsupported'（沒有 Notification）、
//   'throws'（'granted'，但建構時丟錯，同 Android 的 Chrome）。notifications 記下每則送出的 { title, body, tag }，
//   permissionRequests 是 requestPermission() 被呼叫幾次；AudioContext 替身建出來是 suspended、resume() 之後 running，
//   beeps 是排了幾聲提示音（oscillator.start() 幾次）。這兩個替身寫在 tests/helpers/notification-stubs.js，和採集頁的替身共用
// - toasts 記下 FF14Utils.showToast() 的 { message, type }；clipboard 記下 navigator.clipboard.writeText() 寫入的內容
// - settle()：等點擊處理裡的 await 跑完。「提醒我」在點擊裡先設好提醒、再等權限的回答，回答到了才重畫通知的說明；
//   settle() 等的就是這次重畫
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');
const { NOTIFICATION_MODES, fakeNotification, fakeAudioContext } = require('./notification-stubs.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/weather-forecast';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/weather-forecast.js';
const SCHEDULER = 'assets/js/reminder-scheduler.js';
const PAGE_URL = 'https://ff14.tw/tools/weather-forecast/index.html';

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（同 panel-page.js）
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
// 翻譯檔、共用的提醒排程與工具目錄自己的腳本；其他共用腳本（頁首、頁尾、common.js）不載入，用到的部分改用下面的替身
const PAGE_SCRIPTS = scriptSources(PAGE_HTML)
    .filter((src) => !src.includes('/') || [`../../${TRANSLATIONS}`, `../../${SCHEDULER}`].includes(src))
    .map((src) => path.posix.join(TOOL_DIR, src));

function createWeatherPage({ hash = '', now = 1_760_000_000_000, lang = 'zh', stored = {}, storageThrows = false, notification = 'default' } = {}) {
    assert.ok(NOTIFICATION_MODES.includes(notification), `不認得的 notification：${notification}`);
    const dom = createFakeDom({ url: PAGE_URL + hash });
    const win = dom.window;
    const storage = new Map(Object.entries(stored));
    const toasts = [];
    const clipboard = [];
    const intervals = [];
    const timeouts = [];
    const languageListeners = [];
    const notificationLog = { created: [], requests: 0 };
    const audioLog = { beeps: 0 };
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

    win.__now = now;
    vm.runInContext('Date.now = () => globalThis.__now', win);
    dom.document.visibilityState = 'visible';

    Object.assign(win, {
        history: { state: null, replaceState: (state, title, href) => { win.history.state = state; win.location = new URL(String(href), win.location.href); } },
        setInterval: (callback) => { intervals.push({ callback, cleared: false }); return intervals.length; },
        clearInterval: (id) => { if (intervals[id - 1]) intervals[id - 1].cleared = true; },
        setTimeout: (callback, delay) => { timeouts.push({ callback, delay, cleared: false }); return timeouts.length; },
        clearTimeout: (id) => { if (timeouts[id - 1]) timeouts[id - 1].cleared = true; },
        requestAnimationFrame: (callback) => { callback(0); return 0; },
        navigator: { clipboard: { writeText: async (text) => { clipboard.push(text); } } },
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
        }
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

    mountFromHtml(dom, PAGE_HTML, ['weatherTool']);
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const app = vm.runInContext('new WeatherForecast()', win);

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
        settle: () => new Promise((resolve) => setImmediate(resolve)),
        changeHash(next) {
            win.location.hash = next;
            win.dispatchEvent(new win.Event('hashchange'));
        },
        selectZone(id) {
            $('zoneSelect').value = id;
            $('zoneSelect').dispatchEvent(new win.Event('change', { bubbles: true }));
        },
        setLang(next) {
            currentLang = next;
            translatePage();
            for (const listener of [...languageListeners]) listener(next);
        },
        storageEvent(key) {
            win.dispatchEvent(new win.Event('storage', { key }));
        },
        notifications: notificationLog.created,
        get permissionRequests() { return notificationLog.requests; },
        get beeps() { return audioLog.beeps; },
        toasts,
        clipboard
    };
}

module.exports = { createWeatherPage };
