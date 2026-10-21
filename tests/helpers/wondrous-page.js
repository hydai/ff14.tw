// 天書奇談頁的頁面替身，給 tests/wondrous-tails-page.test.js 與之後的天書頁測試共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。作法照 tests/helpers/cactpot-page.js。
//
//   const { createWondrousPage } = require('./helpers/wondrous-page.js');
//   const page = createWondrousPage({ lang: 'en' });
//   page.place(0, 5, 10); page.cell(5).click(); page.count(); page.placed(); page.setLang('ja');
//   page.odds(); page.header(); page.doneCells(); page.nearCells(); page.clearButton().click();
//
// - 照 index.html 建出 #wondrousTool（mountFromHtml），照 index.html 的 <script src> 順序載入這個工具的翻譯檔
//   與工具目錄自己的每一個腳本（src 不含 /），最後 new WondrousTailsCalculator()。
//   頁首與頁尾（layout-loader.js）、common.js、security-utils.js 不載入，用到的部分改用下面的替身：
//   頁面程式只能用 FF14Utils.getI18nText() 與 showToast()，不能用 SecurityUtils。
//   頁面的 <h1> 與一句說明在 #wondrousTool 外面，不建出來
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立頁面之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）
// - FF14Utils 替身只有 getI18nText 與 showToast；toasts 記下每一次 showToast() 的 { message, type }
//   （這一頁不跳 toast，所以測試用它確認 toasts.length 一直是 0）
// - fake-dom 的 click() 對 disabled 的元素照樣派送，瀏覽器不會：這份 document 建出來的每個元素
//   （mountFromHtml 建的、頁面自己建的）都補上 click()，disabled 的元素什麼都不做（只換這份 document 的 createElement，
//   不動 fake-dom 的元素類別）。換 createElement 一定要在 mountFromHtml 之前，index.html 的格子才會有這個補丁
// - cell(p) 是 #wondrous-grid 裡 data-position 為 p 的格子，cells() 是十六格（照位置）；
//   count() 是 #placed-count 的文字；placed() 是 aria-pressed="true" 的格子位置（由小到大）；
//   doneCells() 是有 line-done class（在連成的線上）的格子位置、nearCells() 是有 line-near class（只差一張的空格）的格子位置（都由小到大）；
//   place(...positions) 照順序點每一格（點已經貼了的格子就是拿掉；disabled 的格子點了沒有反應）；
//   clearButton() 是 #clear-btn，盤面卡標題列右邊的「清空盤面」／「復原」按鈕（同一顆，文字與 disabled 由頁面程式寫；disabled 時 click() 什麼都不做）
// - 機率表（#odds-table）：odds() 是三列（照 data-lines 1–3）[{ label, now, after, nowWidth, afterWidth }, …]：
//   label 是 .odds-label 的文字，now／after 是 .odds-now／.odds-after 的文字，
//   nowWidth／afterWidth 是 .odds-bar-now／.odds-bar-after 的 style.width；header() 是 thead 兩個 th 的文字（現在、重置之後）
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/wondrous-tails';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/wondrous-tails.js';
const PAGE_URL = 'https://ff14.tw/tools/wondrous-tails/index.html';
const POSITIONS = Array.from({ length: 16 }, (_, p) => p);

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（同 cactpot-page.js）
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

// fake-dom 的元素少了瀏覽器有的一樣東西，建出來時補上（見檔頭說明）
function addBrowserParts(element) {
    const click = element.click.bind(element);
    element.click = () => {
        if (element.disabled === true) return;
        click();
    };
    return element;
}

const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
// 翻譯檔與工具目錄自己的腳本；其他共用腳本（頁首、頁尾、common.js、security-utils.js）不載入，用到的部分改用下面的替身
const PAGE_SCRIPTS = scriptSources(PAGE_HTML)
    .filter((src) => !src.includes('/') || src === `../../${TRANSLATIONS}`)
    .map((src) => path.posix.join(TOOL_DIR, src));

function createWondrousPage({ lang = 'zh' } = {}) {
    const dom = createFakeDom({ url: PAGE_URL });
    const win = dom.window;
    const toasts = [];
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
    dom.document.createElement = (tag) => addBrowserParts(createElement(tag));

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

    mountFromHtml(dom, PAGE_HTML, ['wondrousTool']);
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const app = vm.runInContext('new WondrousTailsCalculator()', win);

    const $ = (id) => dom.document.getElementById(id);
    const cell = (p) => $('wondrous-grid').querySelector(`[data-position="${p}"]`);
    // 機率表 data-lines 為 lines（1–3）的那一列
    const oddsRow = (lines) => $('odds-table').querySelector(`tbody tr[data-lines="${lines}"]`);

    return {
        window: win,
        document: dom.document,
        app,
        $,
        cell,
        cells: () => POSITIONS.map(cell),
        count: () => $('placed-count').textContent,
        clearButton: () => $('clear-btn'),
        placed: () => POSITIONS.filter((p) => cell(p).getAttribute('aria-pressed') === 'true'),
        doneCells: () => POSITIONS.filter((p) => cell(p).classList.contains('line-done')),
        nearCells: () => POSITIONS.filter((p) => cell(p).classList.contains('line-near')),
        place(...positions) {
            for (const p of positions) cell(p).click();
        },
        odds: () => [1, 2, 3].map((lines) => {
            const row = oddsRow(lines);
            return {
                label: row.querySelector('.odds-label').textContent,
                now: row.querySelector('.odds-now').textContent,
                after: row.querySelector('.odds-after').textContent,
                nowWidth: row.querySelector('.odds-bar-now').style.width,
                afterWidth: row.querySelector('.odds-bar-after').style.width
            };
        }),
        header: () => $('odds-table').querySelectorAll('thead th').map((th) => th.textContent),
        toasts,
        setLang(next) {
            currentLang = next;
            translatePage();
            for (const listener of [...languageListeners]) listener(next);
        }
    };
}

module.exports = { createWondrousPage };
