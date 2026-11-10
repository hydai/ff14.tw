// 巨集轉換器頁的頁面替身，給 tests/macro-converter.test.js 共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。作法照 tests/helpers/chocobo-page.js。
//
//   const { createMacroPage } = require('./helpers/macro-page.js');
//   const page = await createMacroPage({ lang: 'en', stored: { ff14tw_macro_target_lang: 'ja' }, storageThrows: true, fetchResults: ['fail'], clipboard: 'reject' });
//   page.type('/ac "Muscle Memory" <wait.3>'); page.output(); page.outputTitle(); page.warnings(); page.setLang('ja'); page.toasts; page.consoleErrors;
//   page.$('copyOutput').click(); await page.settle(); page.clipboard; page.pendingDelays(); page.runTimeouts(); page.releaseClipboard();
//   const again = await page.reopen();
//
// - 照 index.html 建出 #macroTool（mountFromHtml），照 index.html 的 <script src> 順序載入這個工具的翻譯檔與工具目錄自己的每一個腳本
//   （src 不含 /：conversion-engine.js、script.js），最後 new MacroConverter()，等 app.ready 才回傳（第一次載入是 'pending' 時不等）。
//   頁首與頁尾（layout-loader.js）、common.js、i18n-manager.js 與共用翻譯檔不載入，用到的部分改用下面的替身：
//   頁面程式只能用 FF14Utils.getI18nText() 與 showToast()。頁面的 <h1> 與兩行說明在 #macroTool 外面，不建出來
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立頁面之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）。
//   lang 只是網站的介面語言，和轉換的目標語言（#targetLang）無關
// - FF14Utils 替身只有 getI18nText 與 showToast；toasts 記下每一次 showToast() 的 { message, type }
// - fetch 只認 ../../data/macro-mappings.json（回傳真正的資料，每次呼叫重新解析一份）。fetchResults 依序決定每一次載入的結果：
//   'ok' 回傳資料、'fail' 回傳 { ok: false, status: 500 }、'pending' 永遠不回來；用完之後一直用最後一個
// - storage 是 localStorage 背後的 Map（stored 是初始內容：鍵 -> 字串）。
//   storageThrows：光是讀 localStorage（裸的全域或 window.localStorage）就丟例外（Chrome 封鎖網站資料時是 SecurityError），
//   存取器要在 vm 的 context 裡面定義，理由見 panel-page.js
// - 頁面的 console 只有 log、error、warn，都不印到真的 console，三種都記在 consoleErrors：頁面不該在 console 留下任何東西，
//   所以期待 consoleErrors 是空的測試也擋得住多出來的除錯訊息（每一筆是 util.format(...參數) 的結果，同 Node 的 console）
// - type(text)：把輸入框（#inputMacro）的值設成 text 並派送 input（打字、貼上、刪除都是這個事件）；
//   output() 是輸出框（#outputMacro）的值，outputTitle() 是輸出標題列（#outputTitle）的文字，
//   warnings() 是要注意的行（#macroWarnings）每個 li 的文字，整塊 hidden 時是 []
// - clipboard：'ok'（預設）、'reject' 或 'hold'。navigator.clipboard 的 writeText() 與 readText() 都是 async：'ok' 時 writeText(text) 把 text 記在
//   clipboard（寫入的每一筆，照順序）並成為剪貼簿目前的內容，readText() 回傳剪貼簿目前的內容；'reject' 時兩個都回傳被拒絕的 Promise
//   （瀏覽器沒給權限或不支援），什麼都不記；'hold' 時 writeText() 先不回來（瀏覽器還在問權限、剪貼簿還在寫），呼叫 releaseClipboard()
//   才讓等著的每一筆照順序和 'ok' 一樣寫進去並回來（releaseClipboard(index) 只放還在等的第 index 筆，模擬後按的先寫完），readText() 同 'ok'。clipboardMode 可讀可寫，是現在的模式（先成功、再失敗的情況在測試裡改它；
//   改模式不影響已經在等的寫入）。
//   clipboardText 可讀可寫，是剪貼簿目前的內容（一開始是 ''；測試要「貼上」的字先寫在這裡，'ok' 時 readText() 就是回傳它：
//   空字串、只有空白的字也一樣照實回傳，像複製的是圖片時 readText() 讀到的是空字串）
// - setTimeout／clearTimeout 只記下、不真的計時（複製成功後按鈕暫時寫「✓ 已複製」用的是它）：runTimeouts() 把呼叫當下排著的
//   （沒清掉、還沒跑過的）各跑一次，跑的時候新排的留到下一次；pendingDelays() 是排著的計時器的延遲毫秒數（沒清掉、還沒跑過的，照排的順序）。
//   settle() 等 await 跑完（按鈕的 click 處理裡等剪貼簿的回答）
// - fake-dom 的元素少了瀏覽器有的三樣東西，這份 document 建出來的每個元素（mountFromHtml 建的與頁面自己建的）都補上
//   （只換這份 document 的 createElement，不動 fake-dom 的元素類別；換 createElement 一定要在 mountFromHtml 之前）：
//   disabled 的元素 click() 什麼都不做（aria-disabled 的不算：瀏覽器照樣送出 click，要由頁面自己擋）；
//   元素本身或祖先有 hidden（頁面都有寫 display: none）、或 disabled 的元素 focus() 什麼都不做（瀏覽器拿不到焦點；fake-dom 的 focus() 只檢查 inert）；
//   hidden 設成 true 時，焦點在這個元素（或它的子孫）上就掉到 body（瀏覽器的行為；fake-dom 藏起來焦點照樣留著，
//   「焦點回到某個元素」的測試就永遠不會失敗，例如重試鈕跟著錯誤訊息收起來之後）。disabled 設成 true 不模擬焦點掉走：
//   頁面用 aria-disabled 的地方，測試直接檢查沒有 disabled。
//   type() 不檢查輸入框能不能用：它只是派送 input 事件，要確認輸入框停用就直接看 disabled
// - reopen(overrides)：用同一份 storage 的內容與目前的介面語言再開一次頁面，overrides 蓋掉其他選項（例如 fetchResults）
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/macro-converter';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/macro-converter.js';
const PAGE_URL = 'https://ff14.tw/tools/macro-converter/index.html';
const DATA_URL = '../../data/macro-mappings.json';
const FETCH_RESULTS = ['ok', 'fail', 'pending'];
const CLIPBOARD_MODES = ['ok', 'reject', 'hold'];

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（同 chocobo-page.js）
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
const DATA_JSON = read('data/macro-mappings.json');
// 翻譯檔與工具目錄自己的腳本；其他共用腳本（頁首、頁尾、common.js）不載入，用到的部分改用下面的替身
const PAGE_SCRIPTS = scriptSources(PAGE_HTML)
    .filter((src) => !src.includes('/') || src === `../../${TRANSLATIONS}`)
    .map((src) => path.posix.join(TOOL_DIR, src));

// fake-dom 的元素少了瀏覽器有的東西，建出來時補上（見檔頭說明）
function addBrowserParts(element) {
    const click = element.click.bind(element);
    const focus = element.focus.bind(element);
    element.click = () => {
        if (element.disabled === true) return;
        click();
    };
    element.focus = () => {
        if (element.disabled === true) return;
        for (let node = element; node && node.nodeType === 1; node = node.parentNode) if (node.hidden) return;
        focus();
    };
    // 焦點所在的元素（或它的祖先）被藏起來時，瀏覽器把焦點丟掉，document.activeElement 變成 body。fake-dom 只看元素還在不在文件裡，
    // 藏起來焦點照樣留著：那樣「藏起來、再顯示、把焦點放回去」的程式，拿掉放回去的那一行測試也不會失敗。所以 hidden 設成 true 時照瀏覽器做
    // （瀏覽器其實是下一次繪製前才處理；頁面在 await 資料之後才再動焦點，所以這裡當下做也一樣）
    const { get, set } = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'hidden');
    Object.defineProperty(element, 'hidden', {
        configurable: true,
        get: () => get.call(element),
        set: (value) => {
            set.call(element, value);
            const active = element.ownerDocument.activeElement;
            if (value && element.contains(active)) active.blur();
        }
    });
    return element;
}

async function createMacroPage({
    lang = 'zh', stored = {}, storageThrows = false, fetchResults = ['ok'], clipboard = 'ok'
} = {}) {
    assert.ok(fetchResults.length > 0 && fetchResults.every((result) => FETCH_RESULTS.includes(result)),
        `fetchResults 只能是 ${FETCH_RESULTS.join('、')}，而且至少一個`);
    assert.ok(CLIPBOARD_MODES.includes(clipboard), `不認得的 clipboard：${clipboard}`);
    let clipboardMode = clipboard;
    const dom = createFakeDom({ url: PAGE_URL });
    const win = dom.window;
    const storage = new Map(Object.entries(stored));
    const consoleErrors = [];
    const toasts = [];
    const clipboardWrites = [];
    // clipboard 是 'hold' 時還沒回來的 writeText()：每一筆是讓它寫進去的函式，releaseClipboard() 照順序呼叫
    const heldWrites = [];
    const timeouts = [];
    const languageListeners = [];
    const translations = { zh: {}, en: {}, ja: {} };
    let systemClipboard = '';
    let currentLang = lang;
    let fetchCount = 0;
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

    // 這份 document 建出來的每個元素都補上 addBrowserParts()；一定要在 mountFromHtml 之前換
    const createElement = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => addBrowserParts(createElement(tag));

    // 頁面的 console 不印到真的 console：log、error、warn 都照 Node 的 console 用 util.format() 寫成一筆字串記下來
    const record = (...args) => { consoleErrors.push(util.format(...args)); };
    Object.assign(win, {
        console: { log: record, error: record, warn: record },
        setTimeout: (callback, delay) => { timeouts.push({ callback, delay, cleared: false, done: false }); return timeouts.length; },
        clearTimeout: (id) => { if (timeouts[id - 1]) timeouts[id - 1].cleared = true; },
        navigator: {
            clipboard: {
                writeText: async (text) => {
                    if (clipboardMode === 'reject') throw new Error('NotAllowedError');
                    if (clipboardMode === 'hold') await new Promise((resolve) => heldWrites.push(resolve));
                    clipboardWrites.push(text);
                    systemClipboard = text;
                },
                readText: async () => {
                    if (clipboardMode === 'reject') throw new Error('NotAllowedError');
                    return systemClipboard;
                }
            }
        },
        fetch: async (url) => {
            if (url !== DATA_URL) throw new Error(`createMacroPage 沒有準備 ${url}`);
            const result = fetchResults[Math.min(fetchCount, fetchResults.length - 1)];
            fetchCount += 1;
            if (result === 'pending') return new Promise(() => {});
            if (result === 'fail') return { ok: false, status: 500 };
            return { ok: true, json: async () => JSON.parse(DATA_JSON) };
        },
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
            showToast: (message, type) => { toasts.push({ message, type }); }
        }
    });
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

    mountFromHtml(dom, PAGE_HTML, ['macroTool']);
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const app = vm.runInContext('new MacroConverter()', win);
    if (fetchResults[0] !== 'pending') await app.ready;

    const $ = (id) => dom.document.getElementById(id);

    return {
        window: win,
        document: dom.document,
        app,
        storage,
        toasts,
        consoleErrors,
        clipboard: clipboardWrites,
        get clipboardMode() { return clipboardMode; },
        set clipboardMode(mode) {
            assert.ok(CLIPBOARD_MODES.includes(mode), `不認得的 clipboard：${mode}`);
            clipboardMode = mode;
        },
        get clipboardText() { return systemClipboard; },
        set clipboardText(text) { systemClipboard = String(text); },
        // 'hold' 時等著的 writeText() 寫進去並回來：沒給 index 時照順序全部；給了只放還在等的第 index 筆（0 起算），
        // 用來模擬後按的先寫完。之後要 await settle() 讓頁面的 await 跑完
        releaseClipboard(index) {
            const releases = index === undefined ? heldWrites.splice(0) : heldWrites.splice(index, 1);
            assert.ok(releases.length > 0, 'releaseClipboard：沒有還在等的寫入');
            for (const release of releases) release();
        },
        $,
        type(text) {
            const input = $('inputMacro');
            input.value = text;
            input.dispatchEvent(new win.Event('input', { bubbles: true }));
        },
        output: () => $('outputMacro').value,
        outputTitle: () => $('outputTitle').textContent,
        warnings: () => ($('macroWarnings').hidden ? [] : $('macroWarnings').querySelectorAll('li').map((item) => item.textContent)),
        runTimeouts() {
            for (const timeout of [...timeouts]) {
                if (timeout.cleared || timeout.done) continue;
                timeout.done = true;
                timeout.callback();
            }
        },
        pendingDelays: () => timeouts.filter((timeout) => !timeout.cleared && !timeout.done).map((timeout) => timeout.delay),
        settle: () => new Promise((resolve) => setImmediate(resolve)),
        setLang(next) {
            currentLang = next;
            translatePage();
            for (const listener of [...languageListeners]) listener(next);
        },
        reopen: (overrides = {}) => createMacroPage({
            lang: currentLang, stored: Object.fromEntries(storage), storageThrows, fetchResults, clipboard: clipboardMode, ...overrides
        })
    };
}

module.exports = { createMacroPage };
