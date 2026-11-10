// 角色卡產生器頁的頁面替身，給 tests/character-card-page.test.js 共用（Task 6、7 的測試也用它，會再擴充）。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。作法照 tests/helpers/chocobo-page.js 與 macro-page.js。
//
//   const { createCardPage } = require('./helpers/card-page.js');
//   const page = await createCardPage({ lang: 'en', stored: { ff14tw_character_card: JSON.stringify({ name: 'Luna Starweaver' }) }, narrow: true });
//   page.type('cardName', 'Luna Starweaver'); page.select('cardMainJob', 'Pictomancer'); page.press('formatPortrait'); page.toggle('hours-weekday-evening');
//   page.chip('cardLikes', 'msq').click(); page.key('ArrowRight', page.$('tab-basic')); page.setLang('ja'); page.setNarrow(false);
//   page.texts(); page.drawCalls(); page.stored; page.toasts; page.consoleErrors; await page.flush();
//   const again = await page.reopen();
//
// - 照 index.html 建出 #cardTool（mountFromHtml），照 index.html 的 <script src> 順序載入這個工具的翻譯檔、共用的 ff14-game-data.js 與 modal-manager.js、
//   工具目錄自己的每一個腳本（src 不含 /：card-state.js、card-layout.js、card-renderer.js、script.js…），最後 new CharacterCardApp()，
//   等 app.ready 才回傳（fontsDelay 時不等：字型一直沒回來，ready 就一直沒完成，要先 releaseFonts()）。
//   頁首與頁尾（layout-loader.js）、common.js、i18n-manager.js 與共用翻譯檔不載入，用到的部分改用下面的替身：
//   頁面程式只能用 FF14Utils.getI18nText() 與 showToast()，不能用 SecurityUtils。ModalManager 載入的是真的，但 Task 7 之前沒有人用它
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立頁面之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）
// - FF14Utils 替身只有 getI18nText 與 showToast；toasts 記下每一次 showToast() 的 { message, type }
// - storage 是 localStorage 背後的 Map（stored 選項是初始內容：鍵 -> 字串；回傳的 stored 是這份 Map 本身，讀得到頁面現在寫進去的東西）。
//   storageThrows：光是讀 localStorage（裸的全域或 window.localStorage）就丟例外（Chrome 封鎖網站資料時是 SecurityError），
//   存取器要在 vm 的 context 裡面定義，理由見 panel-page.js
// - 頁面的 console 只有 log、error、warn，都不印到真的 console，三種都記在 consoleErrors：頁面不該在 console 留下任何東西，
//   所以期待 consoleErrors 是空的測試也擋得住多出來的除錯訊息（每一筆是 util.format(...參數) 的結果，同 Node 的 console）
// - setTimeout／clearTimeout 只記下、不真的計時（清除全部的 3 秒用的是它）：runTimeouts() 把呼叫當下排著的（沒清掉、還沒跑過的）各跑一次，
//   跑的時候新排的留到下一次；pendingDelays() 是排著的計時器的延遲毫秒數（沒清掉、還沒跑過的，照排的順序）。flush() 等 promise 都跑完
// - canvas：每個 <canvas> 都補上 getContext('2d')、toBlob、toDataURL，width／height 是屬性的存取器。getContext('2d') 回傳
//   tests/helpers/canvas-recorder.js 的記錄 context；和真的 canvas 一樣，設定 width 或 height（就算設成原本的值）會清掉畫面並重設 context，
//   所以 drawCalls() 只看得到最近一次畫的東西（每次畫之前都要設寬高；頁面少設的話，記錄會一直累積，測試看得出來）。
//   drawCalls() 是頁面那張 canvas（#cardCanvas）現在的 context 記下的呼叫，texts() 是其中每一次 fillText 畫的字，drawCount() 是 getContext 被呼叫了幾次
//   （＝畫了幾次）。toBlob(callback, type, quality) 把 { type, quality } 記在 blobRequests 後非同步呼叫 callback(blob)，toDataURL(type) 回傳固定的 data URL
// - document.fonts：load(font, text) 把 { font, text } 記在 fontLoads，回傳 Promise<[]>。fontsDelay 是 true 時 load() 一直不回來：同一次畫
//   （同一次 getContext）請求的 load() 算一批（頁面每畫一次就請求一批），heldFontBatches() 是還在等的每一批（照請求的順序，每一批是 [{ font, text }]）；
//   releaseFonts() 讓還在等的每一批回來，releaseFonts(index) 只放行還在等的第 index 批（0 起算），模擬後請求的字型先載完、慢的那一批還在等；
//   第二個參數 { fail: true } 讓那一批的 load() 被拒絕（像瀏覽器載入字型失敗：NetworkError）而不是成功。之後新的 load() 又會等。ready 是已經完成的 Promise
// - Image：new Image() 的 src 設好後，icons 選項決定它怎麼結束：'load'（預設）一個 microtask 後載入成功（complete、naturalWidth 64、onload），
//   'fail' 一個 microtask 後失敗（complete、naturalWidth 0、onerror），'hold' 一直不結束，finishImages(ok) 才讓還沒結束的每一張照 ok 結束。
//   images 是建出來的每一張（{ src, complete, naturalWidth, finish(ok) }）
// - matchMedia 只認 '(max-width: 768px)'（narrow：頁面現在是不是手機版面）與 '(pointer: coarse)'（coarse：觸控為主的裝置），其他查詢一律丟錯。
//   回傳 { media, matches, addEventListener('change', fn), removeEventListener }；setNarrow(next) 改值並呼叫每個登記的 change 監聽
//   （{ matches: next, media }），不管值有沒有變
// - navigator（Task 7 才會用到）：userAgent 預設是桌面版的 Chrome。share：false（預設，沒有 navigator.share 與 canShare）、'ok'（canShare 認得有檔案的資料，
//   share() 成功，每一筆記在 shares）、'cancel'（share() 丟 AbortError）、'fail'（share() 丟別的錯）、'no-files'（有 share，但 canShare 一律回 false）。
//   clipboard：false（預設，沒有 navigator.clipboard 與 ClipboardItem）、'ok'（clipboard.write(items) 記在 clipboardWrites）、'reject'（write() 被拒絕）
// - fake-dom 的元素少了瀏覽器有的幾樣東西，這份 document 建出來的每個元素（mountFromHtml 建的與頁面自己建的）都補上
//   （只換這份 document 的 createElement，不動 fake-dom 的元素類別；換 createElement 一定要在 mountFromHtml 之前）：
//   disabled 的元素 click() 什麼都不做；勾選框與單選照瀏覽器的順序：先換 checked（單選同組的其他人取消），派送 click（被 preventDefault 就換回去、
//   不再往下），再派送 input 與 change（已經選取的單選再點只有 click）；元素本身或祖先有 hidden、或 disabled 的元素 focus() 什麼都不做
//   （瀏覽器拿不到焦點；fake-dom 的 focus() 只檢查 inert）；hidden 設成 true 時，焦點在這個元素（或它的子孫）上就掉到 body
//   （瀏覽器的行為；fake-dom 藏起來焦點照樣留著，「焦點不會掉」的測試就永遠不會失敗）。disabled 設成 true 不模擬焦點掉走
// - querySelectorAll() 與 .children 的結果和瀏覽器一樣：querySelectorAll() 是 NodeList 的替身（length、item()、索引、forEach()、entries()、keys()、values()、
//   迭代），.children 是 HTMLCollection 的替身（length、item()、namedItem()、索引、迭代，連 forEach() 都沒有）。兩個都沒有 map、filter、find、some、every、
//   reduce、includes、indexOf、at、flatMap、slice 這些陣列的方法：fake-dom 自己回傳一般的陣列，頁面少轉成陣列（Array.from()、[...]）時測試照樣過，
//   真的瀏覽器卻在那一行丟 TypeError（角色卡第一版就是這樣，建構函式一開始就壞掉）。頁面與測試都一樣：要用陣列的方法先 Array.from()；for...of、展開、
//   解構、.length、[0] 可以直接用。只換這份 document 與它建出來的每個元素（document、html、head、body 與 createElement 建的），不動 fake-dom 的元素類別；
//   fake-dom 的 previousElementSibling／nextElementSibling 靠父節點的 .children 是陣列，所以這兩個也在這裡自己用 childNodes 算。
//   .childNodes（瀏覽器也是 NodeList）沒有換：fake-dom 自己拿它當陣列在改節點樹，換了會壞掉；那個只靠 tests/character-card-page.test.js 的掃描擋
// - 操作：type(id, text) 照瀏覽器打字：超過 maxlength 的部分打不進去（以 UTF-16 的單位算），然後設定 value、派送 input；
//   select(id, value) 找不到有這個 value 的 option 就丟錯（瀏覽器會把值變成空的），否則設定 value、派送 input 與 change；
//   press(目標) 是 click()；toggle(目標) 是勾選框、單選的 click()（不是這兩種就丟錯）；目標可以是 id 或元素。
//   chip(群組 id, 值) 是 #cardSubJobs、#cardLikes、#cardLooking 裡 data-job、data-like、data-looking 等於值的那顆按鈕（找不到丟錯）。
//   key(鍵, 目標, init) 在目標（預設是焦點所在的元素）上派送會冒泡、可取消的 keydown（init 可以加 altKey、ctrlKey、metaKey…）並回傳事件。
//   isShown(目標) 是元素本身與祖先都沒有 hidden
// - reopen(overrides)：用同一份 storage 的內容與目前的介面語言再開一次頁面，overrides 蓋掉其他選項
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');
const { createRecordingContext } = require('./canvas-recorder.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/character-card';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/character-card.js';
const SHARED_SCRIPTS = ['../../assets/js/ff14-game-data.js', '../../assets/js/modal-manager.js'];
const PAGE_URL = 'https://ff14.tw/tools/character-card/index.html';
const NARROW_QUERY = '(max-width: 768px)';
const COARSE_QUERY = '(pointer: coarse)';
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SHARE_MODES = [false, 'ok', 'cancel', 'fail', 'no-files'];
const CLIPBOARD_MODES = [false, 'ok', 'reject'];
const ICON_MODES = ['load', 'fail', 'hold'];

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（同 chocobo-page.js）
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
// 翻譯檔、共用的遊戲資料與 ModalManager、工具目錄自己的腳本；其他共用腳本（頁首、頁尾、common.js）不載入，用到的部分改用下面的替身
const PAGE_SCRIPTS = scriptSources(PAGE_HTML)
    .filter((src) => !src.includes('/') || src === `../../${TRANSLATIONS}` || SHARED_SCRIPTS.includes(src))
    .map((src) => path.posix.join(TOOL_DIR, src));

const isShown = (element) => {
    for (let node = element; node && node.nodeType === 1; node = node.parentNode) if (node.hidden) return false;
    return true;
};

// NodeList 與 HTMLCollection 的替身（見檔頭說明）：只有瀏覽器有的成員，沒有陣列的方法。索引（list[0]）是一般的屬性
class NodeListLike {
    #items;

    constructor(items) {
        this.#items = items;
        items.forEach((item, index) => { this[index] = item; });
    }

    get length() { return this.#items.length; }
    item(index) { return this.#items[index] ?? null; }
    forEach(callback, thisArg) { this.#items.forEach((item, index) => callback.call(thisArg, item, index, this)); }
    entries() { return this.#items.entries(); }
    keys() { return this.#items.keys(); }
    values() { return this.#items.values(); }
    [Symbol.iterator]() { return this.#items.values(); }
}

class HTMLCollectionLike {
    #items;

    constructor(items) {
        this.#items = items;
        items.forEach((item, index) => { this[index] = item; });
    }

    get length() { return this.#items.length; }
    item(index) { return this.#items[index] ?? null; }
    namedItem(name) { return this.#items.find((item) => item.getAttribute('id') === name || item.getAttribute('name') === name) ?? null; }
    [Symbol.iterator]() { return this.#items.values(); }
}

// 一個元素（或 document）的 querySelectorAll() 與 .children 換成上面的替身；fake-dom 的 querySelector()、firstElementChild 靠 [0]，照樣能用
function strictLists(parent) {
    const query = parent.querySelectorAll.bind(parent);
    parent.querySelectorAll = (selector) => new NodeListLike(query(selector));
    Object.defineProperty(parent, 'children', {
        configurable: true,
        get: () => new HTMLCollectionLike(parent.childNodes.filter((node) => node.nodeType === 1))
    });
    if (parent.nodeType === 1) {
        parent._sibling = (step) => {
            const siblings = parent.parentNode ? parent.parentNode.childNodes.filter((node) => node.nodeType === 1) : [];
            return siblings[siblings.indexOf(parent) + step] ?? null;
        };
    }
}

// 一張 canvas 的替身（見檔頭說明）。回傳這張 canvas 的記錄：{ context, draws, blobRequests }
function patchCanvas(element) {
    // context 到 getContext() 才建：設定 width 或 height 只把現在的丟掉（下一次 getContext 拿到全新、重設過的 context），
    // 不然頁面每畫一次要設寬又設高，每次都白建兩個記錄 context（各約 35 個函式）
    const state = { context: null, draws: 0, blobRequests: [] };
    for (const name of ['width', 'height']) {
        Object.defineProperty(element, name, {
            configurable: true,
            get: () => Number(element.getAttribute(name) ?? (name === 'width' ? 300 : 150)),
            set: (value) => {
                element.setAttribute(name, String(Math.trunc(Number(value))));
                state.context = null;
            }
        });
    }
    element.getContext = (type) => {
        assert.equal(type, '2d', 'canvas 替身只有 2d');
        state.draws += 1;
        state.context ??= createRecordingContext();
        return state.context;
    };
    element.toBlob = (callback, type = 'image/png', quality) => {
        state.blobRequests.push({ type, quality });
        Promise.resolve().then(() => callback(new Blob([`canvas ${element.width}x${element.height}`], { type })));
    };
    element.toDataURL = (type = 'image/png') => `data:${type};base64,${Buffer.from(`canvas ${element.width}x${element.height}`).toString('base64')}`;
    return state;
}

async function createCardPage({
    lang = 'zh', stored = {}, storageThrows = false, narrow = false, coarse = false,
    userAgent = DESKTOP_USER_AGENT, share = false, clipboard = false, fontsDelay = false, icons = 'load'
} = {}) {
    assert.ok(SHARE_MODES.includes(share), `不認得的 share：${share}`);
    assert.ok(CLIPBOARD_MODES.includes(clipboard), `不認得的 clipboard：${clipboard}`);
    assert.ok(ICON_MODES.includes(icons), `不認得的 icons：${icons}`);
    const dom = createFakeDom({ url: PAGE_URL });
    const win = dom.window;
    const storage = new Map(Object.entries(stored));
    const consoleErrors = [];
    const toasts = [];
    const timeouts = [];
    const languageListeners = [];
    const mediaListeners = [];
    const fontLoads = [];
    const heldFonts = [];
    const images = [];
    const shares = [];
    const clipboardWrites = [];
    const canvases = new WeakMap();
    const translations = { zh: {}, en: {}, ja: {} };
    let currentLang = lang;
    let isNarrow = narrow;
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

    // fake-dom 的元素少了瀏覽器有的東西，建出來時補上（見檔頭說明）
    function addBrowserParts(element) {
        const click = element.click.bind(element);
        const focus = element.focus.bind(element);
        element.click = () => {
            if (element.disabled === true) return;
            // type 屬性是建出元素之後才設的，所以點的當下才看
            const kind = element.tagName === 'INPUT' ? element.type : null;
            if (kind !== 'checkbox' && kind !== 'radio') {
                click();
                return;
            }
            const before = element.checked === true;
            if (kind === 'radio' && before) {
                click();
                return;
            }
            element.checked = kind === 'radio' ? true : !before;
            if (!element.dispatchEvent(new win.Event('click', { bubbles: true, cancelable: true }))) {
                element.checked = before;
                return;
            }
            if (kind === 'radio') {
                for (const other of element.ownerDocument.querySelectorAll('input[type="radio"]')) {
                    if (other !== element && other.getAttribute('name') === element.getAttribute('name')) other.checked = false;
                }
            }
            element.dispatchEvent(new win.Event('input', { bubbles: true }));
            element.dispatchEvent(new win.Event('change', { bubbles: true }));
        };
        element.focus = () => {
            if (element.disabled === true || !isShown(element)) return;
            focus();
        };
        // 焦點所在的元素（或它的祖先）被藏起來時，瀏覽器把焦點丟掉，document.activeElement 變成 body。fake-dom 只看元素還在不在文件裡，
        // 藏起來焦點照樣留著：那樣「藏起來、再顯示、把焦點放回去」的程式，拿掉放回去的那一行測試也不會失敗。所以 hidden 設成 true 時照瀏覽器做
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
        strictLists(element);
        if (element.tagName === 'CANVAS') canvases.set(element, patchCanvas(element));
        return element;
    }
    // 這份 document 建出來的每個元素都補上 addBrowserParts()；一定要在 mountFromHtml 之前換
    const createElement = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => addBrowserParts(createElement(tag));
    // document 自己與它建構時就有的 html、head、body（不是 createElement 建的）也要換 querySelectorAll() 與 .children
    for (const parent of [dom.document, dom.document.documentElement, dom.document.head, dom.document.body]) strictLists(parent);

    // 字型：load() 記下來，fontsDelay 時等 releaseFonts() 才回來。同一次畫（頁面那張 canvas 的 getContext 被呼叫的次數一樣）請求的 load() 是一批；
    // heldFonts 是還在等的每一批：{ draw, loads: [{ font, text }], releases: [放行的函式] }
    dom.document.fonts = {
        load: (font, text) => {
            fontLoads.push({ font, text });
            if (!fontsDelay) return Promise.resolve([]);
            const draw = canvases.get(dom.document.getElementById('cardCanvas'))?.draws;
            if (heldFonts.length === 0 || heldFonts.at(-1).draw !== draw) heldFonts.push({ draw, loads: [], releases: [] });
            const batch = heldFonts.at(-1);
            batch.loads.push({ font, text });
            return new Promise((resolve, reject) => batch.releases.push((fail) => (fail
                ? reject(Object.assign(new Error('NetworkError: 字型載入失敗'), { name: 'NetworkError' }))
                : resolve([]))));
        },
        ready: Promise.resolve()
    };

    // 職業圖示：Image 的替身（見檔頭說明）
    class FakeImage {
        constructor() {
            this.complete = false;
            this.naturalWidth = 0;
            this.onload = null;
            this.onerror = null;
            this.srcValue = '';
            images.push(this);
        }

        get src() { return this.srcValue; }

        set src(value) {
            this.srcValue = String(value);
            if (icons !== 'hold') Promise.resolve().then(() => this.finish(icons === 'load'));
        }

        finish(ok) {
            if (this.complete) return;
            this.complete = true;
            this.naturalWidth = ok ? 64 : 0;
            const handler = ok ? this.onload : this.onerror;
            if (typeof handler === 'function') handler.call(this, new win.Event(ok ? 'load' : 'error'));
        }
    }

    const navigatorStub = { userAgent };
    if (share !== false) {
        navigatorStub.canShare = (data) => share !== 'no-files' && Boolean(data && data.files && data.files.length > 0);
        navigatorStub.share = async (data) => {
            if (share === 'cancel') throw Object.assign(new Error('Share canceled'), { name: 'AbortError' });
            if (share === 'fail') throw Object.assign(new Error('Share failed'), { name: 'NotAllowedError' });
            shares.push(data);
        };
    }
    if (clipboard !== false) {
        navigatorStub.clipboard = {
            write: async (items) => {
                if (clipboard === 'reject') throw Object.assign(new Error('Clipboard denied'), { name: 'NotAllowedError' });
                clipboardWrites.push(items);
            }
        };
        win.ClipboardItem = class ClipboardItem {
            constructor(data) { this.data = data; }
        };
    }

    // 頁面的 console 不印到真的 console：log、error、warn 都照 Node 的 console 用 util.format() 寫成一筆字串記下來
    const record = (...args) => { consoleErrors.push(util.format(...args)); };
    Object.assign(win, {
        console: { log: record, error: record, warn: record },
        setTimeout: (callback, delay) => { timeouts.push({ callback, delay, cleared: false, done: false }); return timeouts.length; },
        clearTimeout: (id) => { if (timeouts[id - 1]) timeouts[id - 1].cleared = true; },
        matchMedia: (query) => {
            if (![NARROW_QUERY, COARSE_QUERY].includes(query)) throw new Error(`createCardPage 沒有準備 matchMedia(${JSON.stringify(query)})`);
            return {
                media: query,
                get matches() { return query === NARROW_QUERY ? isNarrow : coarse; },
                addEventListener: (type, listener) => { if (type === 'change' && query === NARROW_QUERY) mediaListeners.push(listener); },
                removeEventListener: (type, listener) => {
                    const index = mediaListeners.indexOf(listener);
                    if (index !== -1) mediaListeners.splice(index, 1);
                }
            };
        },
        navigator: navigatorStub,
        Image: FakeImage,
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

    mountFromHtml(dom, PAGE_HTML, ['cardTool']);
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const app = vm.runInContext('new CharacterCardApp()', win);
    if (!fontsDelay) await app.ready;

    const $ = (id) => dom.document.getElementById(id);
    const elementOf = (target) => {
        const element = typeof target === 'string' ? $(target) : target;
        assert.ok(element, `找不到 ${target}`);
        return element;
    };
    const stateOf = () => canvases.get($('cardCanvas'));
    const drawCalls = () => stateOf().context?.calls ?? [];
    const fire = (element, type) => element.dispatchEvent(new win.Event(type, { bubbles: true }));

    return {
        window: win,
        document: dom.document,
        app,
        stored: storage,
        toasts,
        consoleErrors,
        fontLoads,
        images,
        shares,
        clipboardWrites,
        $,
        isShown: (target) => isShown(elementOf(target)),
        type(target, text) {
            const element = elementOf(target);
            const max = Number(element.getAttribute('maxlength'));
            element.value = element.hasAttribute('maxlength') && Number.isFinite(max) ? String(text).slice(0, max) : String(text);
            fire(element, 'input');
        },
        select(target, value) {
            const element = elementOf(target);
            const values = Array.from(element.querySelectorAll('option'), (option) => option.getAttribute('value'));
            assert.ok(values.includes(value), `#${element.getAttribute('id')} 裡沒有 value 是 ${JSON.stringify(value)} 的選項`);
            element.value = value;
            fire(element, 'input');
            fire(element, 'change');
        },
        press(target) {
            elementOf(target).click();
        },
        toggle(target) {
            const element = elementOf(target);
            assert.ok(element.tagName === 'INPUT' && ['checkbox', 'radio'].includes(element.type), `${target} 不是勾選框或單選`);
            element.click();
        },
        chip(groupId, value) {
            const button = Array.from($(groupId).querySelectorAll('button')).find((item) => [item.dataset.job, item.dataset.like, item.dataset.looking].includes(value));
            assert.ok(button, `#${groupId} 裡找不到 ${value} 這顆按鈕`);
            return button;
        },
        key(key, target = dom.document.activeElement, init = {}) {
            const event = new win.Event('keydown', { bubbles: true, cancelable: true, key, ...init });
            elementOf(target).dispatchEvent(event);
            return event;
        },
        drawCalls,
        texts: () => drawCalls().filter((call) => call.op === 'fillText').map((call) => call.args[0]),
        drawCount: () => stateOf().draws,
        blobRequests: () => stateOf().blobRequests,
        runTimeouts() {
            for (const timeout of [...timeouts]) {
                if (timeout.cleared || timeout.done) continue;
                timeout.done = true;
                timeout.callback();
            }
        },
        pendingDelays: () => timeouts.filter((timeout) => !timeout.cleared && !timeout.done).map((timeout) => timeout.delay),
        flush: () => new Promise((resolve) => setImmediate(resolve)),
        // fontsDelay 時等著的 load() 回來；之後要 await flush() 讓頁面的 await 跑完。沒給 index 時還在等的每一批都放行；
        // 給了只放行還在等的第 index 批（0 起算，照請求的順序，放行過的不再算），用來模擬後請求的字型先載完、慢的那一批還在等。
        // fail 是 true 時那一批的 load() 被拒絕（載入失敗）
        releaseFonts(index, { fail = false } = {}) {
            if (index !== undefined) assert.ok(heldFonts[index], `releaseFonts：沒有還在等的第 ${index} 批字型（現在有 ${heldFonts.length} 批）`);
            const batches = index === undefined ? heldFonts.splice(0) : heldFonts.splice(index, 1);
            for (const batch of batches) for (const release of batch.releases) release(fail);
        },
        // 還在等的每一批字型（照請求的順序）：每一批是那一次畫請求的 [{ font, text }]
        heldFontBatches: () => heldFonts.map((batch) => batch.loads.map((load) => ({ ...load }))),
        // icons 是 'hold' 時還沒結束的每一張圖照 ok 結束
        finishImages(ok) {
            for (const image of images) image.finish(ok);
        },
        setLang(next) {
            currentLang = next;
            translatePage();
            for (const listener of [...languageListeners]) listener(next);
        },
        setNarrow(next) {
            isNarrow = next;
            for (const listener of [...mediaListeners]) listener({ matches: next, media: NARROW_QUERY });
        },
        reopen: (overrides = {}) => createCardPage({
            lang: currentLang, stored: Object.fromEntries(storage), storageThrows, narrow: isNarrow, coarse, userAgent, share, clipboard, fontsDelay, icons, ...overrides
        })
    };
}

module.exports = { createCardPage };
