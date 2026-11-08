// Lodestone 角色查詢頁的頁面替身，給 tests/lodestone-page.test.js 共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。作法照 tests/helpers/dungeon-page.js 與 chocobo-page.js。
//
//   const { createLodestonePage } = require('./helpers/lodestone-page.js');
//   const F = require('./helpers/lodestone-fixtures.js');
//   const page = createLodestonePage({ lang: 'ja', search: '?id=12345678', stored: { ff14tw_lodestone_lang: 'en' }, routes: {
//       '/character/12345678': () => F.ok(F.character(F.HIKARI)),
//       '/search/character': (url) => F.ok(F.search([F.AOI]))
//   } });
//   await page.ready;
//   page.view(); page.profile(); page.mineName(); page.recentNames(); page.resultRows();
//   page.type('Aoi Mizu'); page.chooseWorld('Tiamat'); page.submit(); await page.flush(); page.paste('https://na.finalfantasyxiv.com/lodestone/character/12345678/');
//   page.requests.map((request) => request.path); page.history; page.url(); page.back(); page.forward(); page.stored('ff14tw_lodestone_mine'); page.setLang('en');
//
// - 照 index.html 建出 #lodestoneTool（mountFromHtml），照 index.html 的 <script src> 順序載入這個工具的翻譯檔與工具目錄自己的每一個腳本
//   （src 不含 /：lodestone-data.js、lodestone-model.js、lodestone-store.js、script.js），最後 new LodestoneLookup()：不帶參數，
//   Worker 的網址與 localStorage 都是頁面自己的預設。建立頁面不等請求：createLodestonePage() 直接回傳，ready 是 app.ready
//   （網址帶 ?id= 時是打開那個角色的 promise）。頁首與頁尾（layout-loader.js）、common.js、i18n-manager.js 與共用翻譯檔不載入，
//   用到的部分改用下面的替身：頁面程式只能用 FF14Utils.getI18nText()，不能用 SecurityUtils。頁面的 <h1> 在 #lodestoneTool 外面，不建出來
// - 網址是 https://ff14.tw/tools/lodestone-lookup/ 加上 search（例如 '?id=12345678'）；url() 是現在的網址
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立頁面之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）
// - fetch 只認 Worker（https://logstone.z54981220.workers.dev）的網址，其他網址丟錯（測試不連網路）。每一次呼叫都記在 requests：
//   { url, path（路徑加查詢字串，例如 '/search/character?name=Aoi+Mizu&world=Tiamat&dc=na&page=1'）, pathname, params（查詢字串，照順序的物件）, signal }。
//   routes 以路徑（pathname，例如 '/character/12345678'）為鍵，值是 (url) => 回答 的函式，或直接是回答（或回答的 promise）。
//   回答是 { status, body }（status 沒給是 200；body 可以是 promise：回應的身體晚到），或是自己帶 json() 的 { status, json }
//   （json() 原樣交給頁面，不受取消影響：用來測「晚到的資料本身」不被採用）。函式丟例外、回答的 promise 被拒絕，就是連不上：fetch 被拒絕，
//   原樣丟出那個錯誤。沒有設的路徑讓 fetch 丟 TypeError：舊 Worker 沒有這個端點，它的 404 沒有 CORS 標頭，真的瀏覽器裡請求被擋下就是這樣，
//   頁面看不到 404。建立頁面之後還可以加路由（page.routes 就是傳進來的那個物件）
// - 取消：和瀏覽器一樣，signal 取消時，還沒回來的 fetch 與還沒讀完的 json()（{ status, body } 那一種）都被拒絕，錯誤是 AbortError
// - history 替身：pushState／replaceState 換掉 location（同瀏覽器），每一次呼叫記在 history（{ method, state, url }）；
//   back()／forward() 回到上一筆／下一筆、換掉 location，並在 window 上派送 popstate（event.state 是那一筆的 state）；
//   已經在第一筆／最後一筆時什麼都不做。state 存的是 JSON 複製（瀏覽器存的也是複製）。
//   historyState 是第一筆一開始的 state（例如在搜尋結果那一筆重新整理：瀏覽器留著那一筆的 state，頁面是新的）
// - localStorage：stored 是初始內容（鍵 -> 字串；不是字串的先 JSON.stringify），stored(key) 是現在存著的字串（沒有是 null）。
//   storageThrows：光是讀 localStorage（裸的全域或 window.localStorage）就丟例外（Chrome 封鎖網站資料時是 SecurityError），
//   存取器要在 vm 的 context 裡面定義，理由見 panel-page.js；這時什麼都存不下來，stored(key) 一律是 null。
//   writeThrows：讀得到，但 setItem() 丟例外（容量已滿時是 QuotaExceededError），stored 的初始內容一直不變
// - 頁面的 console 只有 log、error、warn，都不印到真的 console，三種都記在 consoleErrors：頁面不該在 console 留下任何東西，
//   所以期待 consoleErrors 是空的測試也擋得住多出來的除錯訊息（每一筆是 util.format(...參數) 的結果，同 Node 的 console）
// - fake-dom 的元素少了瀏覽器有的幾樣東西，這份 document 建出來的每個元素（mountFromHtml 建的與頁面自己建的）都補上
//   （只換這份 document 的 createElement，不動 fake-dom 的元素類別；換 createElement 一定要在 mountFromHtml 之前）：
//   - disabled 的元素 click() 什麼都不做；表單裡的送出按鈕（button 沒寫 type 或 type="submit"）被點了而且 click 沒被 preventDefault，
//     就在表單上派送 submit（會冒泡、可以 preventDefault）
//   - 元素本身或祖先有 hidden、或 disabled 的元素 focus() 什麼都不做（瀏覽器拿不到焦點；fake-dom 的 focus() 只檢查 inert）
//   - 焦點所在的元素（或它的祖先）被拿出文件時，焦點回到 body，搬回來也不會自己回去（同瀏覽器；fake-dom 的 activeElement 搬回來就又是它）。
//     頁面搬動找人的表單時要自己把焦點放回去
//   - input 的 value 一開始是空字串；option 的 value 是 value 屬性（沒有時是文字）；select 的 value 是選中的選項的值：一開始是第一個選項，
//     設成沒有的值時是空字串（同瀏覽器）；img 的 src、alt 和屬性同步（fake-dom 的是普通屬性）
// - view()：看得到的那個畫面（'landing'、'search'、'character'），同時看得到兩個以上或一個都沒有時丟錯
// - mineName()：我的角色卡片上的名字（卡片藏起來是 null）；recentNames()：最近查過每一列的名字（卡片藏起來是 []）；
//   resultRows()：搜尋結果每一列 { id, name, meta }（meta 是名字下面那一行：伺服器與部隊）
// - profile()：角色標頭（#profileCard）目前的樣子，藏起來是 null。{ busy（aria-busy="true"）, loading（載入中那一塊的文字，沒有是 null）,
//   name, title, where（伺服器與部隊那一行）, now（「現在：」那一行的文字）, nowIcon（那一行的 img：{ src, alt }）, nowTextIcon（文字圖示）,
//   fetchedAt（資料時間那一行）, mine（設成我的角色的按鈕：{ text, pressed（aria-pressed 的值）}）, lodestone（在 Lodestone 打開：{ href, target, rel, text }）,
//   dataLang（名稱與成就顯示那一組：{ label（aria-labelledby 指到的字）, role, buttons: [data-lang, 文字, aria-pressed] 每一顆 }）}；沒有的部分是 null
// - type(text)：設名字欄的值並派送會冒泡的 input（inputType 是 insertText：打字）；paste(text)：同樣，但 inputType 是 insertFromPaste
//   （貼上，名字欄整個換成 text）；chooseWorld(value)：選伺服器選單（沒有這個值的選項丟錯）並派送會冒泡的 change；
//   submit()：在找人的表單上派送 submit（同在名字欄按 Enter）；flush()：讓頁面的 promise 跑完（幾輪 setImmediate）
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/lodestone-lookup';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/lodestone-lookup.js';
const PAGE_URL = 'https://ff14.tw/tools/lodestone-lookup/';
const WORKER = 'https://logstone.z54981220.workers.dev';

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（同 dungeon-page.js）
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
// 翻譯檔與工具目錄自己的腳本；其他共用腳本（頁首、頁尾、common.js）不載入，用到的部分改用下面的替身
const PAGE_SCRIPTS = scriptSources(PAGE_HTML)
    .filter((src) => !src.includes('/') || src === `../../${TRANSLATIONS}`)
    .map((src) => path.posix.join(TOOL_DIR, src));

// history.state 與路由的 body：瀏覽器存的是複製；也讓頁面拿到的是新的物件，改它不會動到測試的資料
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const abortError = () => new DOMException('The operation was aborted.', 'AbortError');
const textOf = (element) => (element ? element.textContent : null);

// fake-dom 的元素少了瀏覽器有的東西，建出來時補上（見檔頭說明）
function addBrowserParts(element, win) {
    const focus = element.focus.bind(element);
    const removeChild = element.removeChild.bind(element);
    element.removeChild = (child) => {
        const document = element.ownerDocument;
        if (document._active && child.contains(document._active)) document._active = null;
        return removeChild(child);
    };
    element.click = () => {
        if (element.disabled === true) return;
        if (!element.dispatchEvent(new win.Event('click', { bubbles: true, cancelable: true }))) return;
        const form = element.closest('form');
        if (element.tagName === 'BUTTON' && form && (element.getAttribute('type') ?? 'submit') === 'submit') {
            form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
        }
    };
    element.focus = () => {
        if (element.disabled === true) return;
        for (let node = element; node && node.nodeType === 1; node = node.parentNode) if (node.hidden) return;
        focus();
    };
    if (element.tagName === 'INPUT') element.value = '';
    if (element.tagName === 'OPTION') {
        Object.defineProperty(element, 'value', {
            get: () => element.getAttribute('value') ?? element.textContent,
            set: (value) => element.setAttribute('value', value),
            configurable: true
        });
    }
    if (element.tagName === 'SELECT') {
        // 沒設過：第一個選項；設過：那個值有選項就是它，沒有就是空字串
        let chosen;
        Object.defineProperty(element, 'value', {
            get: () => {
                const values = element.querySelectorAll('option').map((option) => option.value);
                if (chosen === undefined) return values[0] ?? '';
                return values.includes(chosen) ? chosen : '';
            },
            set: (value) => { chosen = String(value); },
            configurable: true
        });
    }
    if (element.tagName === 'IMG') {
        for (const name of ['src', 'alt']) {
            Object.defineProperty(element, name, {
                get: () => element.getAttribute(name) ?? '',
                set: (value) => element.setAttribute(name, value),
                configurable: true
            });
        }
    }
    return element;
}

function createLodestonePage({ lang = 'zh', search = '', stored = {}, storageThrows = false, writeThrows = false, routes = {}, historyState = null } = {}) {
    const dom = createFakeDom({ url: PAGE_URL + search });
    const win = dom.window;
    const storage = new Map(Object.entries(stored).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
    const consoleErrors = [];
    const languageListeners = [];
    const requests = [];
    const historyCalls = [];
    const entries = [{ state: clone(historyState), url: win.location.href }];
    let entryIndex = 0;
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

    // 這份 document 建出來的每個元素都補上 addBrowserParts()；一定要在 mountFromHtml 之前換
    const createElement = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => addBrowserParts(createElement(tag), win);

    // 路由的回答 → fetch 的回應；{ status, body } 的 json() 和瀏覽器一樣，signal 取消時被拒絕
    const responseOf = (answer, signal) => {
        const status = answer?.status ?? 200;
        const ok = status >= 200 && status < 300;
        if (answer && typeof answer.json === 'function') return { ok, status, json: answer.json };
        return {
            ok,
            status,
            json: () => new Promise((resolve, reject) => {
                if (signal?.aborted) {
                    reject(abortError());
                    return;
                }
                signal?.addEventListener('abort', () => reject(abortError()), { once: true });
                Promise.resolve(answer?.body).then((body) => resolve(clone(body)), reject);
            })
        };
    };

    // 換到 history 的第 index 筆：換掉 location，派送 popstate
    const go = (index) => {
        entryIndex = index;
        win.location = new URL(entries[entryIndex].url);
        win.dispatchEvent(new win.Event('popstate', { state: clone(entries[entryIndex].state) ?? null }));
    };
    const historyEntry = (method) => (state, title, url) => {
        const href = new URL(String(url ?? win.location.href), win.location.href).href;
        if (method === 'pushState') {
            entries.splice(entryIndex + 1, Infinity, { state: clone(state), url: href });
            entryIndex += 1;
        } else {
            entries[entryIndex] = { state: clone(state), url: href };
        }
        win.location = new URL(href);
        historyCalls.push({ method, state: clone(state) ?? null, url: href });
    };

    // 頁面的 console 不印到真的 console：log、error、warn 都照 Node 的 console 用 util.format() 寫成一筆字串記下來
    const record = (...args) => { consoleErrors.push(util.format(...args)); };
    Object.assign(win, {
        console: { log: record, error: record, warn: record },
        URLSearchParams,
        AbortController,
        fetch: (input, init = {}) => {
            const url = new URL(String(input));
            if (url.origin !== WORKER) throw new Error(`createLodestonePage 只認 Worker 的網址，沒有準備 ${url.href}`);
            const { signal } = init;
            requests.push({ url: url.href, path: url.pathname + url.search, pathname: url.pathname, params: Object.fromEntries(url.searchParams), signal });
            return new Promise((resolve, reject) => {
                if (signal?.aborted) {
                    reject(abortError());
                    return;
                }
                signal?.addEventListener('abort', () => reject(abortError()), { once: true });
                if (!Object.hasOwn(routes, url.pathname)) {
                    reject(new TypeError('Failed to fetch'));
                    return;
                }
                const route = routes[url.pathname];
                new Promise((answer) => answer(typeof route === 'function' ? route(url) : route))
                    .then((answer) => resolve(responseOf(answer, signal)), reject);
            });
        },
        history: {
            get state() { return clone(entries[entryIndex].state) ?? null; },
            get length() { return entries.length; },
            pushState: historyEntry('pushState'),
            replaceState: historyEntry('replaceState'),
            back: () => { if (entryIndex > 0) go(entryIndex - 1); },
            forward: () => { if (entryIndex < entries.length - 1) go(entryIndex + 1); }
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
            getI18nText: (key, fallback, params) => (win.i18n.hasKey(key) ? win.i18n.getText(key, params) : fill(fallback, params))
        }
    });
    if (storageThrows) {
        vm.runInContext("Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true })", win);
        assert.throws(() => vm.runInContext('typeof localStorage', win), /SecurityError/);
        assert.throws(() => vm.runInContext('window.localStorage', win), /SecurityError/);
    } else {
        win.localStorage = {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => {
                if (writeThrows) throw new Error('QuotaExceededError');
                storage.set(key, String(value));
            },
            removeItem: (key) => storage.delete(key),
            key: (index) => Array.from(storage.keys())[index] ?? null,
            get length() { return storage.size; }
        };
    }

    mountFromHtml(dom, PAGE_HTML, ['lodestoneTool']);
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const app = vm.runInContext('new LodestoneLookup()', win);

    const $ = (id) => dom.document.getElementById(id);

    return {
        window: win,
        document: dom.document,
        app,
        ready: app.ready,
        $,
        requests,
        routes,
        consoleErrors,
        history: historyCalls,
        url: () => win.location.href,
        view() {
            const shown = ['landing', 'search', 'character'].filter((name) => !$(`${name}View`).hidden);
            assert.equal(shown.length, 1, `應該正好看得到一個畫面（現在：${shown.join('、') || '沒有'}）`);
            return shown[0];
        },
        mineName: () => ($('mineCard').hidden ? null : $('mineName').textContent),
        recentNames: () => ($('recentCard').hidden ? [] : $('recentList').querySelectorAll('.person-name').map((name) => name.textContent)),
        resultRows: () => $('resultList').querySelectorAll('button.person').map((row) => ({
            id: row.dataset.id,
            name: textOf(row.querySelector('.person-name')),
            meta: textOf(row.querySelector('.person-meta'))
        })),
        profile() {
            const card = $('profileCard');
            if (card.hidden) return null;
            const find = (selector) => card.querySelector(selector);
            const now = find('.profile-now');
            const icon = now ? now.querySelector('img') : null;
            const mine = find('.profile-mine');
            const link = find('.profile-lodestone');
            const group = find('.data-lang-options');
            return {
                busy: card.getAttribute('aria-busy') === 'true',
                loading: textOf(find('.loading')),
                name: textOf(find('.profile-name')),
                title: textOf(find('.profile-title')),
                where: textOf(find('.profile-where')),
                now: textOf(now),
                nowIcon: icon ? { src: icon.src, alt: icon.alt } : null,
                nowTextIcon: textOf(now ? now.querySelector('.job-text-icon') : null),
                fetchedAt: textOf(find('.profile-fetched')),
                mine: mine ? { text: mine.textContent, pressed: mine.getAttribute('aria-pressed') } : null,
                lodestone: link ? { href: link.href, target: link.target, rel: link.rel, text: link.textContent } : null,
                dataLang: group ? {
                    label: textOf(dom.document.getElementById(group.getAttribute('aria-labelledby'))),
                    role: group.getAttribute('role'),
                    buttons: group.querySelectorAll('button[data-lang]').map((button) => [button.dataset.lang, button.textContent, button.getAttribute('aria-pressed')])
                } : null
            };
        },
        type(text) {
            const input = $('nameInput');
            input.value = text;
            input.dispatchEvent(new win.Event('input', { bubbles: true, inputType: 'insertText' }));
        },
        paste(text) {
            const input = $('nameInput');
            input.value = text;
            input.dispatchEvent(new win.Event('input', { bubbles: true, inputType: 'insertFromPaste' }));
        },
        chooseWorld(value) {
            const select = $('worldSelect');
            assert.ok(select.querySelectorAll('option').some((option) => option.value === value), `伺服器選單裡沒有「${value}」`);
            select.value = value;
            select.dispatchEvent(new win.Event('change', { bubbles: true }));
        },
        submit() {
            $('findForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
        },
        back() {
            win.history.back();
        },
        forward() {
            win.history.forward();
        },
        stored: (key) => (storageThrows || !storage.has(key) ? null : storage.get(key)),
        setLang(next) {
            currentLang = next;
            translatePage();
            for (const listener of [...languageListeners]) listener(next);
        },
        async flush() {
            for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve));
        }
    };
}

module.exports = { createLodestonePage };
