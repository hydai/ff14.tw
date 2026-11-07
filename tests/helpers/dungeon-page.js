// 副本資料庫頁的頁面替身，給 tests/dungeon-database-page.test.js 與之後的副本資料庫頁測試共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。作法照 tests/helpers/chocobo-page.js 與 gathering-page.js。
//
//   const { createDungeonPage } = require('./helpers/dungeon-page.js');
//   const page = await createDungeonPage({ lang: 'en', fetchFails: true, mobile: true });
//   page.rows(); page.row('叢林競流生息河岸').click(); page.detail('叢林競流生息河岸'); page.marks(page.$('dungeon-detail-283'));
//   page.type('俾斯麥'); page.runTimeouts(); page.count(); page.more(); page.chip('聯盟任務').click();
//   page.setLang('ja'); page.setMobile(true); page.consoleErrors;
//
// - 照 index.html 建出 #dungeonTool 與 #dataSource（mountFromHtml），照 index.html 的 <script src> 順序載入這個工具的翻譯檔與工具目錄自己的
//   每一個腳本（src 不含 /：dungeon-list.js、script.js），最後 new DungeonDatabase() 並等 app.ready。頁首與頁尾（layout-loader.js）、
//   common.js、i18n-manager.js 與共用翻譯檔不載入，用到的部分改用下面的替身：頁面程式只能用 FF14Utils.getI18nText()，不能用 SecurityUtils。
//   頁面的 <h1> 在 #dungeonTool 外面，不建出來
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立頁面之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）
// - fetch 只認 ../../data/dungeons.json（回傳真正的資料，每次呼叫重新解析一份）；fetchFails 時回傳 { ok: false, status: 500 }
// - setTimeout／clearTimeout 只記下、不真的計時（頁面只用它延遲搜尋）：runTimeouts() 把呼叫當下排著的（沒清掉、還沒跑過的）各跑一次，
//   跑的時候新排的留到下一次；pendingDelays() 是排著的計時器的延遲毫秒數（沒清掉、還沒跑過的，照排的順序）
// - matchMedia(query) 只認 '(max-width: 768px), (max-height: 500px)'（和攻略資料的 MOBILE_QUERY 逐字相同），其他查詢一律丟錯；
//   回傳 { media, matches, addEventListener('change', fn), removeEventListener }，matches 是目前的手機版面（mobile 選項，預設 false）。
//   setMobile(next) 改值並呼叫每個登記的 change 監聽（{ matches: next, media }），不管值有沒有變
// - 頁面的 console 只有 log、error、warn，都不印到真的 console，三種都記在 consoleErrors：頁面不該在 console 留下任何東西，
//   所以期待 consoleErrors 是空的測試也擋得住多出來的除錯訊息（每一筆是 util.format(...參數) 的結果，同 Node 的 console）
// - fake-dom 的元素少了瀏覽器有的幾樣東西，這份 document 建出來的每個元素（mountFromHtml 建的與頁面自己建的）都補上
//   （只換這份 document 的 createElement，不動 fake-dom 的元素類別；換 createElement 一定要在 mountFromHtml 之前）：
//   disabled 的元素 click() 什麼都不做；元素本身或祖先有 hidden（頁面都有寫 display: none）、或 disabled 的元素 focus() 什麼都不做
//   （瀏覽器拿不到焦點；fake-dom 的 focus() 只檢查 inert）；input 的 value 一開始是空字串（fake-dom 的 value 只是普通屬性，沒設過是 undefined）
// - rows() 是 #dungeonList 底下每一列（li.dungeon-item）目前的樣子：{ id（數字）, name, type, version, level, expanded（aria-expanded="true"）,
//   hits: 每個 span.dungeon-hit 的整行文字 }；文字都是 textContent（命中的字包在 <mark> 裡，但整行文字不受影響）。
//   row(name) 是那一列的按鈕（button.dungeon-row），列表上找不到時丟錯；detail(name) 是展開著的那一列的詳情：
//   { description, mechanics, drops（ul.dungeon-drops 底下每個 li 的文字，沒有掉落物是 []）, reward, labels: 四個 dt 的文字 }，收起來（詳情 hidden）是 null；
//   marks(element) 是 element 底下每個 <mark> 的文字，照出現的順序
// - count() 是 #resultCount 的文字，more() 是 #showMore 的文字（hidden 時是 null），chip(value) 是 data-type 或 data-expansion 等於 value 的篩選按鈕（找不到丟錯）
// - type(text) 設 #searchInput 的值並派送會冒泡的 input，不跑計時器（延遲搜尋要再 runTimeouts()）
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/dungeon-database';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/dungeon-database.js';
const PAGE_URL = 'https://ff14.tw/tools/dungeon-database/index.html';
const DATA_URL = '../../data/dungeons.json';
const MOBILE_QUERY = '(max-width: 768px), (max-height: 500px)';

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（同 chocobo-page.js）
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
const DATA_JSON = read('data/dungeons.json');
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
    if (element.tagName === 'INPUT') element.value = '';
    return element;
}

async function createDungeonPage({ lang = 'zh', fetchFails = false, mobile = false } = {}) {
    const dom = createFakeDom({ url: PAGE_URL });
    const win = dom.window;
    const consoleErrors = [];
    const languageListeners = [];
    const mediaListeners = [];
    const timeouts = [];
    const translations = { zh: {}, en: {}, ja: {} };
    let currentLang = lang;
    let isMobile = mobile;
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
        matchMedia: (query) => {
            if (query !== MOBILE_QUERY) throw new Error(`createDungeonPage 沒有準備 matchMedia(${JSON.stringify(query)})`);
            return {
                media: query,
                get matches() { return isMobile; },
                addEventListener: (type, listener) => { if (type === 'change') mediaListeners.push(listener); },
                removeEventListener: (type, listener) => {
                    const index = mediaListeners.indexOf(listener);
                    if (index !== -1) mediaListeners.splice(index, 1);
                }
            };
        },
        fetch: async (url) => {
            if (url !== DATA_URL) throw new Error(`createDungeonPage 沒有準備 ${url}`);
            if (fetchFails) return { ok: false, status: 500 };
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
            getI18nText: (key, fallback, params) => (win.i18n.hasKey(key) ? win.i18n.getText(key, params) : fill(fallback, params))
        }
    });

    mountFromHtml(dom, PAGE_HTML, ['dungeonTool', 'dataSource']);
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const app = vm.runInContext('new DungeonDatabase()', win);
    await app.ready;

    const $ = (id) => dom.document.getElementById(id);
    const textOf = (element) => (element ? element.textContent : null);
    const marks = (element) => element.querySelectorAll('mark').map((mark) => mark.textContent);
    const row = (name) => {
        const button = $('dungeonList').querySelectorAll('button.dungeon-row').find((candidate) => candidate.querySelector('.dungeon-name').textContent === name);
        assert.ok(button, `列表上找不到「${name}」這一列`);
        return button;
    };

    return {
        window: win,
        document: dom.document,
        app,
        $,
        marks,
        consoleErrors,
        rows: () => $('dungeonList').children.map((item) => {
            const button = item.querySelector('button.dungeon-row');
            return {
                id: Number(button.dataset.id),
                name: textOf(button.querySelector('.dungeon-name')),
                type: textOf(button.querySelector('.dungeon-type')),
                version: textOf(button.querySelector('.dungeon-version')),
                level: textOf(button.querySelector('.dungeon-level')),
                expanded: button.getAttribute('aria-expanded') === 'true',
                hits: button.querySelectorAll('.dungeon-hit').map((hit) => hit.textContent)
            };
        }),
        row,
        detail(name) {
            const button = row(name);
            const panel = $(button.getAttribute('aria-controls'));
            assert.ok(panel, `「${name}」的 aria-controls 指到不存在的元素`);
            if (panel.hidden) return null;
            // 詳情的格是 .dungeon-field；列上的命中行（span.dungeon-hit）也用 data-field，不能混在一起
            const field = (key) => panel.querySelector(`.dungeon-field[data-field="${key}"]`);
            return {
                description: textOf(field('description').querySelector('dd')),
                mechanics: textOf(field('mechanics').querySelector('dd')),
                drops: field('drops').querySelectorAll('ul.dungeon-drops > li.tag').map((drop) => drop.textContent),
                reward: textOf(field('reward').querySelector('dd')),
                labels: panel.querySelectorAll('dt').map((label) => label.textContent)
            };
        },
        count: () => textOf($('resultCount')),
        more: () => ($('showMore').hidden ? null : textOf($('showMore'))),
        chip(value) {
            const chip = $('filterPanel').querySelectorAll('button.chip').find((button) => button.dataset.type === value || button.dataset.expansion === value);
            assert.ok(chip, `找不到 data-type 或 data-expansion 是「${value}」的篩選按鈕`);
            return chip;
        },
        type(text) {
            const input = $('searchInput');
            input.value = text;
            input.dispatchEvent(new win.Event('input', { bubbles: true }));
        },
        runTimeouts() {
            for (const timeout of [...timeouts]) {
                if (timeout.cleared || timeout.done) continue;
                timeout.done = true;
                timeout.callback();
            }
        },
        pendingDelays: () => timeouts.filter((timeout) => !timeout.cleared && !timeout.done).map((timeout) => timeout.delay),
        setLang(next) {
            currentLang = next;
            translatePage();
            for (const listener of [...languageListeners]) listener(next);
        },
        setMobile(next) {
            isMobile = next;
            for (const listener of [...mediaListeners]) listener({ matches: next, media: MOBILE_QUERY });
        }
    };
}

module.exports = { createDungeonPage };
