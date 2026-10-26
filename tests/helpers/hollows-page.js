// 宗長計算機頁的頁面替身，給 tests/faux-hollows-page.test.js 與之後的宗長計算機頁測試共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。作法照 tests/helpers/cactpot-page.js。
//
//   const { createHollowsPage } = require('./helpers/hollows-page.js');
//   const page = createHollowsPage({ lang: 'en' });
//   page.tap(9, 13); page.status(); page.enabled(); page.obstacles(); page.autoCells(); page.setLang('ja');
//   page.pick(25, 'sword'); page.cell(3).click(); page.option('fox').click(); page.itemOf(25); page.menu();
//
// - 照 index.html 建出 #hollowsTool（mountFromHtml），照 index.html 的 <script src> 順序載入共用的 common.js 翻譯檔
//   （格子名稱用到 label_sep_colon、label_sep_comma）、這個工具的翻譯檔、共用的 cell-popover.js（index.html 有載入它才會載入）
//   與工具目錄自己的每一個腳本（src 不含 /），最後 new FauxHollowsFoxes()。
//   頁首與頁尾（layout-loader.js）、common.js、security-utils.js 不載入，用到的部分改用下面的替身：
//   頁面程式只能用 FF14Utils.getI18nText() 與 showToast()，不能用 SecurityUtils。頁面的 <h1> 與下面的說明在 #hollowsTool 外面，不建出來
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立頁面之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）
// - FF14Utils 替身只有 getI18nText 與 showToast；toasts 記下每一次 showToast() 的 { message, type }
// - fake-dom 的元素少了幾樣瀏覽器有、頁面與小選單會用到的東西，這份 document 建出來的每個元素
//   （mountFromHtml 建的、頁面與 CellPopover 自己建的）都補上（只換這份 document 的 createElement，不動 fake-dom 的元素類別）：
//   getBoundingClientRect()：沒有排版，每個值都是 0；scrollIntoView()：不真的捲動，把元素記在 scrolls；
//   click()：disabled 的元素什麼都不做（fake-dom 的 click() 對 disabled 的元素照樣派送，瀏覽器不會）。
//   換 createElement 一定要在 mountFromHtml 之前，index.html 的格子才會有這些補丁
// - cell(p) 是 #hollows-grid 裡 data-position 為 p 的格子（0–35），cells() 是 36 格（照位置），status() 是狀態列（#hollowsStatus）的文字
// - enabled() 是 disabled 不是 true 的格子位置，obstacles() 是有 is-obstacle class（手動標的與自動補上的）的格子位置，
//   autoCells() 是有 is-auto class（自動補上的）的格子位置（都由小到大）
// - menu() 是 #hollows-grid 裡的小選單（.cell-popover，沒有是 null），option(value) 是打開的選單裡 data-value 為 value 的選項（沒有是 null）；
//   pick(p, value) 點格子再點選項（選單沒開、找不到選項或選項是 disabled 時丟錯）；
//   itemOf(p) 是 sword、chest、fox、empty 裡格子有 is-… class 的那一個（還沒翻開是 null）
// - tap(...positions)：照順序點每一格（disabled 的格子點了沒有反應）；
//   keyboardOpen(p)：在格子上派送 detail 為 0 的 click（鍵盤按 Enter、空白鍵時瀏覽器送的 click）；
//   key(key, target = 目前的焦點, init = {})：派送會冒泡、可取消的 keydown，init 可帶 ctrlKey 等，回傳事件
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/faux-hollows-foxes';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/faux-hollows-foxes.js';
const COMMON_TRANSLATIONS = 'assets/js/i18n/translations/common.js';
const CELL_POPOVER = 'assets/js/cell-popover.js';
const PAGE_URL = 'https://ff14.tw/tools/faux-hollows-foxes/index.html';
const POSITIONS = Array.from({ length: 36 }, (_, p) => p);
// 翻開的格子可能是什麼，也是小選單選項的順序
const ITEMS = ['sword', 'chest', 'fox', 'empty'];

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（同 cactpot-page.js）
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

// fake-dom 的元素少了幾樣瀏覽器有、頁面會用到的東西，建出來時補上（見檔頭說明）
function addBrowserParts(element, scrolls) {
    const click = element.click.bind(element);
    element.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
    element.scrollIntoView = () => { scrolls.push(element); };
    element.click = () => {
        if (element.disabled === true) return;
        click();
    };
    return element;
}

const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
// 兩個翻譯檔、共用的小選單與工具目錄自己的腳本，照 index.html 的順序；其他共用腳本（頁首、頁尾、common.js、security-utils.js）不載入，
// 用到的部分改用下面的替身
const SHARED_SCRIPTS = [TRANSLATIONS, COMMON_TRANSLATIONS, CELL_POPOVER].map((file) => `../../${file}`);
const PAGE_SCRIPTS = scriptSources(PAGE_HTML)
    .filter((src) => !src.includes('/') || SHARED_SCRIPTS.includes(src))
    .map((src) => path.posix.join(TOOL_DIR, src));

function createHollowsPage({ lang = 'zh' } = {}) {
    const dom = createFakeDom({ url: PAGE_URL });
    const win = dom.window;
    const toasts = [];
    const scrolls = [];
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

    // 這份 document 建出來的每個元素都補上 addBrowserParts()；一定要在 mountFromHtml 之前換
    const createElement = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => addBrowserParts(createElement(tag), scrolls);

    Object.assign(win, {
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

    mountFromHtml(dom, PAGE_HTML, ['hollowsTool']);
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const app = vm.runInContext('new FauxHollowsFoxes()', win);

    const $ = (id) => dom.document.getElementById(id);
    const cell = (p) => $('hollows-grid').querySelector(`[data-position="${p}"]`);
    const menu = () => $('hollows-grid').querySelector('.cell-popover');
    const option = (value) => menu()?.querySelector(`[data-value="${String(value)}"]`) ?? null;
    const pick = (p, value) => {
        cell(p).click();
        assert.ok(menu(), `第 ${p} 格沒有開小選單`);
        const choice = option(value);
        assert.ok(choice, `第 ${p} 格的小選單找不到選項 ${value}`);
        assert.ok(choice.disabled !== true, `第 ${p} 格的選項 ${value} 是灰的`);
        choice.click();
    };
    const itemOf = (p) => ITEMS.find((item) => cell(p).classList.contains(`is-${item}`)) ?? null;

    return {
        window: win,
        document: dom.document,
        app,
        $,
        cell,
        cells: () => POSITIONS.map(cell),
        status: () => $('hollowsStatus').textContent,
        enabled: () => POSITIONS.filter((p) => cell(p).disabled !== true),
        obstacles: () => POSITIONS.filter((p) => cell(p).classList.contains('is-obstacle')),
        autoCells: () => POSITIONS.filter((p) => cell(p).classList.contains('is-auto')),
        menu,
        option,
        pick,
        itemOf,
        tap(...positions) {
            for (const p of positions) cell(p).click();
        },
        keyboardOpen(p) {
            cell(p).dispatchEvent(new win.Event('click', { bubbles: true, cancelable: true, detail: 0 }));
        },
        key(key, target = dom.document.activeElement, init = {}) {
            const event = new win.Event('keydown', { bubbles: true, cancelable: true, key, ...init });
            target.dispatchEvent(event);
            return event;
        },
        toasts,
        scrolls,
        setLang(next) {
            currentLang = next;
            translatePage();
            for (const listener of [...languageListeners]) listener(next);
        }
    };
}

module.exports = { createHollowsPage };
