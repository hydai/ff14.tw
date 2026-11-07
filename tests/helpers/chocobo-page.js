// 陸行鳥染色計算器頁的頁面替身，給 tests/chocobo-color-page.test.js 共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。作法照 tests/helpers/cactpot-page.js 與 gathering-page.js。
//
//   const { createChocoboPage } = require('./helpers/chocobo-page.js');
//   const page = await createChocoboPage({ lang: 'en', stored: { ff14tw_chocobo_color: JSON.stringify({ from, to, done }) }, storageThrows: true, fetchFails: true });
//   page.answer(); page.check(0); page.app.setColors('soot-black', 'snow-white'); page.setLang('ja'); page.consoleErrors;
//   page.$('toBtn').click(); page.sheet(); page.swatch('sky-blue').click(); page.key('Escape');
//   const again = await page.reopen();
//
// - 照 index.html 建出 #chocoboTool 與 #colorSheet（mountFromHtml），照 index.html 的 <script src> 順序載入這個工具的翻譯檔與工具目錄自己的每一個腳本
//   （src 不含 /：chocobo-solver.js、script.js），最後 new ChocoboColorTool() 並等 app.ready。
//   頁首與頁尾（layout-loader.js）、common.js、i18n-manager.js、modal-manager.js 與共用翻譯檔不載入，用到的部分改用下面的替身：
//   頁面程式只能用 FF14Utils.getI18nText()，不能用 SecurityUtils。頁面的 <h1> 與一句說明在 #chocoboTool 外面，不建出來
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立頁面之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）
// - fetch 只認 ../../data/chocobo-colors.json（回傳真正的資料，每次呼叫重新解析一份）；fetchFails 時回傳 { ok: false, status: 500 }；
//   data 給了就換成這份資料（例如拿掉幾種水果、算不出做法的資料），reopen() 也沿用
// - storage 是 localStorage 背後的 Map（stored 是初始內容：鍵 -> 字串，物件要先 JSON.stringify）。
//   storageThrows：光是讀 localStorage（裸的全域或 window.localStorage）就丟例外（Chrome 封鎖網站資料時是 SecurityError），
//   存取器要在 vm 的 context 裡面定義，理由見 panel-page.js
// - 頁面的 console 只有 log、error、warn，都不印到真的 console，三種都記在 consoleErrors：頁面不該在 console 留下任何東西，
//   所以期待 consoleErrors 是空的測試也擋得住多出來的除錯訊息（每一筆是 util.format(...參數) 的結果，同 Node 的 console）
// - fake-dom 的元素少了瀏覽器有的兩樣東西，這份 document 建出來的每個元素（mountFromHtml 建的與頁面自己建的）都補上 click()
//   （只換這份 document 的 createElement，不動 fake-dom 的元素類別；換 createElement 一定要在 mountFromHtml 之前）：
//   disabled 的元素什麼都不做；勾選框照瀏覽器的順序：先切換 checked，派送 click（被 preventDefault 就切換回去、不再往下），
//   再派送 input 與 change。fake-dom 的 click() 只派送 click，也對 disabled 的元素照樣派送
// - answer() 是答案卡（#answerCard）目前的樣子，沒有的欄位是 null（元素不在就是 null，不是空陣列）：
//   { total, segments, done }：.answer-total、.answer-segments、.answer-done 的文字；
//   prepare：.answer-prepare 裡每個 .answer-fruit 的文字（「多瑪青梅 ×16」）；
//   order：.answer-order（步驟列表前面那一行）的文字，標題接著後半句（「餵食順序：照 1 → 4 餵，一段餵完再換下一段」），只有 1 段時只有標題；
//   steps：每個 li.answer-step 的 { no（數字）, fruit（.answer-step-name 的文字）, count（「×10」）, note（.answer-step-note 的文字）, checked,
//     isNext（li 有 is-next：第一個還沒勾的段）, next（.answer-step-next 的文字，「下一段」）, line（名稱下面那一行小字 .answer-step-sub 的整行文字，
//     「下一段・變回沙漠黃」，沒有這一行是 null）, warning（.answer-step-warning 的文字，被跳過的段才有）,
//     describedBy（勾選框的 aria-describedby：下一段的 step-next-N 在前、被跳過的提醒 step-warning-N 在後，用空白接起來，都沒有是 null）,
//     description（aria-describedby 指到的每個元素的文字依序用空白接起來，螢幕閱讀器念的描述，例如「下一段 第 2 段還沒勾：…」；
//     指到不存在的 id 會丟錯，沒有 aria-describedby 是 null）}；
//   alt：.answer-alt 的文字；message：.answer-message 的文字
// - check(i)：點第 i 段的勾選框（#step-i）；找不到時丟錯。reopen()：用同一份 storage 的內容與目前的語言再開一次頁面
// - ModalManager 替身：fake-dom 不支援真正 ModalManager 用到的 :not() 選擇器（ModalManager 本身由 modal-manager-stack 測試負責）。
//   這一頁一次只開一個面板，所以沒有堆疊；其餘照 panel-page.js 的 FakeModalManager：show() 記下開啟前的焦點、加 active、
//   焦點移到 [autofocus] 或第一個看得到的可聚焦元素（都沒有就是視窗本身）；hide() 拿掉 active、還原焦點，再呼叫 onClose。
//   Escape 由 document 的 keydown 監聽器處理，點遮罩本身（不是裡面的內容）才關，兩者都看選項
// - sheet() 是色票面板（#colorSheet）目前的樣子：{ open（有 .active）, title, hint（#colorSheetHint 的文字，hidden 與否另外看它的屬性）,
//   groups: [{ key, title, count }]（每個 section.color-group）, swatches: [{ id, name, cost, pressed }]（每個 button.color-swatch，
//   cost 是 .color-swatch-cost 的文字，沒有就是 null；pressed 是 aria-pressed="true"） }；
//   swatch(id) 是那一格的按鈕（找不到時丟錯）；key(鍵, 目標) 在目標（預設是焦點所在的元素）上派送會冒泡的 keydown
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/chocobo-color';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/chocobo-color.js';
const PAGE_URL = 'https://ff14.tw/tools/chocobo-color/index.html';
const DATA_URL = '../../data/chocobo-colors.json';

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（同 cactpot-page.js）
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
const DATA_JSON = read('data/chocobo-colors.json');
// 翻譯檔與工具目錄自己的腳本；其他共用腳本（頁首、頁尾、common.js）不載入，用到的部分改用下面的替身
const PAGE_SCRIPTS = scriptSources(PAGE_HTML)
    .filter((src) => !src.includes('/') || src === `../../${TRANSLATIONS}`)
    .map((src) => path.posix.join(TOOL_DIR, src));

// ModalManager 替身開啟時移入焦點用：同 ModalManager._getFocusableElements，依 DOM 順序列出看得到的可聚焦元素。
// fake-dom 不支援逗號與 :not() 選擇器，所以逐一走訪子孫；「看得到」改成自己與祖先都沒有 hidden、也沒有被設成 display: none
// （真的那個看 offsetWidth），停用的按鈕與 tabindex="-1" 跳過（同 panel-page.js）
const isFocusable = (element) => (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) && !element.disabled)
    || (element.tagName === 'A' && element.hasAttribute('href'))
    || (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1');
const isShown = (element) => !element.hidden && element.style.display !== 'none';
const focusableElements = (root) => root.children.flatMap((child) => (isShown(child)
    ? [...(isFocusable(child) ? [child] : []), ...focusableElements(child)]
    : []));

// fake-dom 的元素少了瀏覽器有的東西，建出來時補上（見檔頭說明）
function addBrowserParts(element, win) {
    const click = element.click.bind(element);
    element.click = () => {
        if (element.disabled === true) return;
        if (element.tagName !== 'INPUT' || element.type !== 'checkbox') {
            click();
            return;
        }
        const before = element.checked === true;
        element.checked = !before;
        if (!element.dispatchEvent(new win.Event('click', { bubbles: true, cancelable: true }))) {
            element.checked = before;
            return;
        }
        element.dispatchEvent(new win.Event('input', { bubbles: true }));
        element.dispatchEvent(new win.Event('change', { bubbles: true }));
    };
    return element;
}

async function createChocoboPage({ lang = 'zh', stored = {}, storageThrows = false, fetchFails = false, data = null } = {}) {
    const dom = createFakeDom({ url: PAGE_URL });
    const win = dom.window;
    const storage = new Map(Object.entries(stored));
    const consoleErrors = [];
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
    dom.document.createElement = (tag) => addBrowserParts(createElement(tag), win);

    // ModalManager 替身（見檔頭說明）。openModal 是目前開著的那一個（沒有開就是 null）
    let openModal = null;
    class FakeModalManager {
        constructor() {
            this.activeModal = null;
            this.previousFocus = null;
            this.options = {};
            this.handleOverlayClick = (event) => {
                if (event.target === this.activeModal && this.options.closeOnOverlayClick) this.hide();
            };
        }

        show(element, options = {}) {
            if (this.activeModal === element) return;
            if (this.activeModal) this.hide();
            this.options = { onClose: null, closeOnOverlayClick: true, closeOnEsc: true, useClass: 'active', ...options };
            this.activeModal = element;
            this.previousFocus = dom.document.activeElement;
            element.classList.add(this.options.useClass);
            openModal = this;
            element.addEventListener('click', this.handleOverlayClick);
            (element.querySelector('[autofocus]') ?? focusableElements(element)[0] ?? element).focus();
        }

        hide() {
            if (!this.activeModal) return;
            const { activeModal: element, options, previousFocus } = this;
            element.classList.remove(options.useClass);
            openModal = null;
            element.removeEventListener('click', this.handleOverlayClick);
            Object.assign(this, { activeModal: null, previousFocus: null });
            if (previousFocus && dom.document.body.contains(previousFocus)) previousFocus.focus();
            options.onClose?.();
        }
    }
    // 同 ModalManager 共用的 document keydown 監聽器：Escape 關掉開著的面板
    dom.document.addEventListener('keydown', (event) => {
        if (openModal && event.key === 'Escape' && openModal.options.closeOnEsc) {
            event.preventDefault();
            openModal.hide();
        }
    });

    // 頁面的 console 不印到真的 console：log、error、warn 都照 Node 的 console 用 util.format() 寫成一筆字串記下來
    const record = (...args) => { consoleErrors.push(util.format(...args)); };
    Object.assign(win, {
        console: { log: record, error: record, warn: record },
        fetch: async (url) => {
            if (url !== DATA_URL) throw new Error(`createChocoboPage 沒有準備 ${url}`);
            if (fetchFails) return { ok: false, status: 500 };
            return { ok: true, json: async () => JSON.parse(data ? JSON.stringify(data) : DATA_JSON) };
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
        },
        ModalManager: FakeModalManager
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

    mountFromHtml(dom, PAGE_HTML, ['chocoboTool', 'colorSheet']);
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const app = vm.runInContext('new ChocoboColorTool()', win);
    await app.ready;

    const $ = (id) => dom.document.getElementById(id);
    const textOf = (element) => (element ? element.textContent : null);
    const answer = () => {
        const card = $('answerCard');
        const find = (selector) => card.querySelector(selector);
        const prepare = find('.answer-prepare');
        const list = find('.answer-steps');
        return {
            total: textOf(find('.answer-total')),
            segments: textOf(find('.answer-segments')),
            done: textOf(find('.answer-done')),
            order: textOf(find('.answer-order')),
            prepare: prepare && prepare.querySelectorAll('.answer-fruit').map((fruit) => fruit.textContent),
            steps: list && list.querySelectorAll('li.answer-step').map((item) => {
                const describedBy = item.querySelector('.answer-check').getAttribute('aria-describedby');
                return {
                    no: Number(item.querySelector('.answer-step-no').textContent),
                    fruit: item.querySelector('.answer-step-name').textContent,
                    count: item.querySelector('.answer-step-count').textContent,
                    note: textOf(item.querySelector('.answer-step-note')),
                    checked: item.querySelector('.answer-check').checked === true,
                    isNext: item.classList.contains('is-next'),
                    next: textOf(item.querySelector('.answer-step-next')),
                    line: textOf(item.querySelector('.answer-step-sub')),
                    warning: textOf(item.querySelector('.answer-step-warning')),
                    describedBy,
                    description: describedBy === null ? null : describedBy.split(' ').map((id) => {
                        const target = $(id);
                        assert.ok(target, `aria-describedby 指到的 #${id} 不存在`);
                        return target.textContent;
                    }).join(' ')
                };
            }),
            alt: textOf(find('.answer-alt')),
            message: textOf(find('.answer-message'))
        };
    };

    const sheet = () => {
        const root = $('colorSheet');
        return {
            open: root.classList.contains('active'),
            title: textOf($('colorSheetTitle')),
            hint: textOf($('colorSheetHint')),
            groups: root.querySelectorAll('section.color-group').map((group) => ({
                key: group.dataset.group,
                title: textOf(group.querySelector('.color-group-title')),
                count: group.querySelectorAll('button.color-swatch').length
            })),
            swatches: root.querySelectorAll('button.color-swatch').map((button) => ({
                id: button.dataset.color,
                name: textOf(button.querySelector('.color-swatch-name')),
                cost: textOf(button.querySelector('.color-swatch-cost')),
                pressed: button.getAttribute('aria-pressed') === 'true'
            }))
        };
    };

    return {
        window: win,
        document: dom.document,
        app,
        storage,
        $,
        answer,
        sheet,
        swatch(id) {
            const button = $('colorSheet').querySelector(`button.color-swatch[data-color="${id}"]`);
            assert.ok(button, `面板裡找不到 ${id} 這一格`);
            return button;
        },
        key: (key, target) => dom.key(key, target),
        check(i) {
            const box = $(`step-${i}`);
            assert.ok(box, `找不到第 ${i} 段的勾選框 #step-${i}`);
            box.click();
        },
        consoleErrors,
        setLang(next) {
            currentLang = next;
            translatePage();
            for (const listener of [...languageListeners]) listener(next);
        },
        reopen: () => createChocoboPage({ lang: currentLang, stored: Object.fromEntries(storage), storageThrows, fetchFails, data })
    };
}

module.exports = { createChocoboPage };
