const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createFakeDom } = require('./helpers/fake-dom.js');

const ROOT = path.join(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

const MENU_LABELS = { zh: '選單', en: 'Menu', ja: 'メニュー' };

// i18n 替身：getText 依目前語言回傳；onLanguageChange 收集 callback，測試用 changeLanguage() 觸發
//（和 I18nManager 一樣，把新語言傳給 callback）
function createFakeI18n() {
    const callbacks = [];
    const i18n = {
        language: 'zh',
        callbacks,
        getText: (key) => (key === 'nav_menu' ? MENU_LABELS[i18n.language] : key),
        onLanguageChange: (callback) => { callbacks.push(callback); },
        changeLanguage(language) {
            i18n.language = language;
            for (const callback of callbacks) callback(language);
        }
    };
    return i18n;
}

// matchMedia 替身：記錄查詢與 change 監聽器，matches 依 innerWidth 算 (max-width: Npx)。
// resizeTo(寬度) 和瀏覽器一樣：先改 innerWidth、派送 window 的 resize，再通知 matches 有變的查詢。
// 瀏覽器在這之後的繪製才把看不到的焦點移回 body，所以 change 監聽器看到的 activeElement 還是原本的元素；
// resize 監聽器的 250ms 延遲重置要由測試自己 tick
function installMatchMedia(window) {
    const queries = [];
    window.matchMedia = (media) => {
        const maxWidth = Number(/^\(max-width: (\d+)px\)$/.exec(media)?.[1]);
        const query = {
            media,
            maxWidth,
            matches: window.innerWidth <= maxWidth,
            listeners: [],
            addEventListener(type, listener) { if (type === 'change') this.listeners.push(listener); }
        };
        queries.push(query);
        return query;
    };
    return {
        queries,
        resizeTo(width) {
            window.innerWidth = width;
            window.dispatchEvent(new window.Event('resize'));
            for (const query of queries) {
                const matches = width <= query.maxWidth;
                if (matches === query.matches) continue;
                query.matches = matches;
                for (const listener of query.listeners) listener({ type: 'change', media: query.media, matches });
            }
        }
    };
}

// 和真實頁面一樣：body 放 header.header > div.container，裡面依序是 logo、nav#site-nav.nav、主題切換鈕，
// initHamburgerMenu() 再把 ☰ 接在最後（真實的 DOM 順序：logo、nav、主題切換鈕、☰）。
// nav 裡和 nav-template.js 產生的順序一樣：桌機用的首頁連結與「工具 ▾」按鈕（抽屜裡都不顯示）、
// 含 2 個站內連結與 1 個開新分頁的外部連結（水晶商城清單）的 .tools-menu、
// 抽屜用的首頁連結、版權聲明連結與 3 顆語言按鈕。fake-dom 不計算 CSS，桌機用的首頁在這裡仍可聚焦，測試不會把焦點移到它。
// 載入真正的 common.js 後直接呼叫 initHamburgerMenu()（它的頂層只定義東西並登記 DOMContentLoaded）。
// 每個測試都建立自己的 dom：initHamburgerMenu 會在 document 與 window 上登記監聽器，共用的話會互相疊加。
// 預設寬度 390（手機）：關閉的抽屜是 inert，fake-dom 的 focus() 會像瀏覽器一樣拒絕 inert 子樹裡的元素。
// matchMedia: true 時先裝上 matchMedia 替身（initHamburgerMenu 才會登記斷點的 change 監聽器），回傳值的 media 是它
function setup({ innerWidth = 390, tools = true, i18n = true, matchMedia = false } = {}) {
    const dom = createFakeDom({ innerWidth });
    const { document, window } = dom;
    const media = matchMedia ? installMatchMedia(window) : null;
    const fakeI18n = i18n ? createFakeI18n() : null;
    if (fakeI18n) window.i18n = fakeI18n;

    const logo = dom.el('a', { class: 'logo', href: '/' }, 'FF14.tw');
    const homeDesktop = dom.el('a', { class: 'nav-desktop-only', href: '/' }, '首頁');
    const toolsToggle = dom.el('button', { type: 'button', class: 'nav-tools-toggle' }, '工具');
    const home = dom.el('a', { class: 'nav-drawer-only', href: '/' }, '首頁');
    const toolLinks = [
        dom.el('a', { class: 'tools-menu-link', href: '/tools/mini-cactpot/index.html' }, '仙人微彩計算機'),
        dom.el('a', { class: 'tools-menu-link', href: '/tools/guide/index.html' }, '攻略資料')
    ];
    const externalLink = dom.el('a', { class: 'tools-menu-link', href: 'https://tc-shop.ff14.tw', target: '_blank', rel: 'noopener noreferrer' }, '水晶商城清單');
    const copyright = dom.el('a', { href: '/copyright.html' }, '版權聲明');
    const languageButtons = ['ZH-TW', 'EN', 'JP'].map((text) => dom.el('button', { type: 'button', class: 'language-btn' }, text));
    const nav = dom.el(
        'nav',
        { id: 'site-nav', class: 'nav' },
        homeDesktop,
        toolsToggle,
        ...(tools ? [dom.el('div', { class: 'tools-menu', id: 'nav-tools-menu' }, ...toolLinks, externalLink)] : []),
        home,
        copyright,
        dom.el('div', { class: 'language-switcher' }, ...languageButtons)
    );
    const themeToggle = dom.el('button', { type: 'button', class: 'theme-toggle' });
    document.body.appendChild(dom.el('header', { class: 'header' }, dom.el('div', { class: 'container' }, logo, nav, themeToggle)));

    dom.load('assets/js/common.js');
    window.initHamburgerMenu();

    const hamburger = document.querySelector('button.hamburger');
    assert.ok(hamburger, 'initHamburgerMenu() 沒有建立 button.hamburger');
    return {
        dom,
        document,
        window,
        i18n: fakeI18n,
        media,
        logo,
        nav,
        homeDesktop,
        toolsToggle,
        home,
        copyright,
        toolLinks,
        externalLink,
        languageButtons,
        themeToggle,
        hamburger,
        overlay: document.querySelector('.nav-overlay')
    };
}

// 斷言訊息用：焦點在哪裡。assert 的差異輸出會把 parentNode／childNodes 互相參照的整棵樹都印出來，
// 所以元素的比對一律用 assert.ok(a === b, 訊息)
const describeNode = (node) => `<${node.tagName.toLowerCase()}${node.className ? `.${node.className.split(/\s+/).join('.')}` : ''}>`;
const focusedIs = (document, expected) => document.activeElement === expected;

// 選單開或關的整套狀態要一起變：三個 .active、aria-expanded、捲動鎖定，以及 390px 下關閉的抽屜是 inert
function assertMenuState({ document, nav, hamburger, overlay }, open, message) {
    assert.equal(hamburger.getAttribute('aria-expanded'), String(open), `${message}：aria-expanded`);
    assert.deepEqual([nav, hamburger, overlay].map((element) => element.classList.contains('active')), [open, open, open], `${message}：.active`);
    assert.equal(document.body.style.overflow, open ? 'hidden' : '', `${message}：捲動鎖定`);
    assert.equal(nav.inert, !open, `${message}：inert`);
}

test('☰ 有 type、aria-controls 與 aria-expanded="false"', () => {
    const { document, nav, hamburger } = setup();

    assert.equal(hamburger.tagName, 'BUTTON');
    assert.equal(hamburger.getAttribute('type'), 'button', '沒有 type 的 button 放在表單裡會送出表單');
    assert.equal(hamburger.getAttribute('aria-controls'), 'site-nav');
    assert.ok(document.getElementById(hamburger.getAttribute('aria-controls')) === nav, 'aria-controls 要指向導覽列');
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false');
    assert.equal(hamburger.getAttribute('aria-label'), '選單');
    assert.ok(hamburger.parentNode.classList.contains('container'), '☰ 放在頁首容器裡');
});

test('打開選單後焦點移到工具清單第一個連結；Escape 關閉並把焦點還給 ☰', () => {
    const { document, dom, nav, hamburger, toolLinks } = setup();
    assert.equal(nav.inert, true, '前提：手機寬度、關閉的抽屜是 inert');

    // 鍵盤使用者先把焦點放在 ☰，再按 Enter／Space（觸發 click）
    hamburger.focus();
    hamburger.click();
    assert.equal(hamburger.getAttribute('aria-expanded'), 'true');
    assert.equal(nav.inert, false, '要先解除 inert，焦點才進得去');
    // 若程式在 inert 還沒解除時就呼叫 focus()，fake-dom 和瀏覽器一樣什麼都不做，焦點會留在 ☰
    assert.ok(focusedIs(document, toolLinks[0]), `焦點要移到工具清單第一個連結（實際在 ${describeNode(document.activeElement)}）`);

    const escape = dom.key('Escape');
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false');
    assert.equal(nav.classList.contains('active'), false);
    assert.equal(nav.inert, true, '關閉後又回到 inert');
    assert.ok(focusedIs(document, hamburger), `Escape 之後焦點要回到 ☰（實際在 ${describeNode(document.activeElement)}）`);
    assert.equal(escape.defaultPrevented, true);
});

test('點遮罩關閉後 aria-expanded 回到 false、焦點回到 ☰', () => {
    const { document, nav, hamburger, overlay, toolLinks } = setup();

    hamburger.click();
    assert.equal(hamburger.getAttribute('aria-expanded'), 'true');
    assert.ok(focusedIs(document, toolLinks[0]), '前提：焦點在選單裡');
    assert.equal(overlay.classList.contains('active'), true);

    overlay.click();
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false');
    assert.equal(overlay.classList.contains('active'), false);
    assert.equal(nav.classList.contains('active'), false);
    assert.equal(nav.inert, true);
    assert.ok(focusedIs(document, hamburger), `點遮罩之後焦點要回到 ☰（實際在 ${describeNode(document.activeElement)}）`);
});

test('切換語言時 ☰ 的 aria-label 跟著更新', () => {
    const { i18n, hamburger } = setup();
    assert.equal(hamburger.getAttribute('aria-label'), '選單');
    assert.equal(i18n.callbacks.length, 1, '要用 window.i18n.onLanguageChange 登記一個 callback');

    i18n.changeLanguage('en');
    assert.equal(hamburger.getAttribute('aria-label'), 'Menu');
    i18n.changeLanguage('ja');
    assert.equal(hamburger.getAttribute('aria-label'), 'メニュー');
    i18n.changeLanguage('zh');
    assert.equal(hamburger.getAttribute('aria-label'), '選單');
});

test('common.js 不再處理 .nav-dropdown', () => {
    assert.ok(!read('assets/js/common.js').includes('nav-dropdown'));
});

test('再點一次 ☰ 關閉：aria-expanded、class、捲動鎖定、inert 都回復，焦點在 ☰', () => {
    const { document, nav, hamburger, overlay } = setup();

    hamburger.click();
    assert.equal(hamburger.getAttribute('aria-expanded'), 'true');
    assert.deepEqual([nav, hamburger, overlay].map((element) => element.classList.contains('active')), [true, true, true]);
    assert.equal(document.body.style.overflow, 'hidden', '開啟時鎖住頁面捲動');
    assert.equal(nav.inert, false);

    hamburger.click();
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false');
    assert.deepEqual([nav, hamburger, overlay].map((element) => element.classList.contains('active')), [false, false, false]);
    assert.equal(document.body.style.overflow, '', '關閉時解除捲動鎖定');
    assert.equal(nav.inert, true);
    assert.ok(focusedIs(document, hamburger), `焦點要在 ☰（實際在 ${describeNode(document.activeElement)}）`);

    // 可以再開一次，焦點照樣進選單
    hamburger.click();
    assert.equal(hamburger.getAttribute('aria-expanded'), 'true');
    assert.equal(nav.inert, false);
});

test('選單裡沒有 .tools-menu 時，焦點移到抽屜裡第一個看得到的連結（跳過桌機用的首頁）', () => {
    const { document, hamburger, home } = setup({ tools: false });

    // 桌機用的首頁在抽屜裡是 display: none，瀏覽器裡 focus() 不會有作用，焦點會停在 ☰
    hamburger.click();
    assert.ok(focusedIs(document, home), `焦點要在抽屜用的首頁（實際在 ${describeNode(document.activeElement)}）`);
});

test('選單沒打開時按 Escape 不處理：不攔截、不動焦點', () => {
    const { dom, document, hamburger, overlay, nav } = setup();
    const outside = dom.el('button', { type: 'button' }, '頁面上的其他元素');
    document.body.appendChild(outside);
    outside.focus();

    const escape = dom.key('Escape');
    assert.equal(escape.defaultPrevented, false, '別的元件（例如對話框）可能要用 Escape');
    assert.ok(focusedIs(document, outside), '沒開的時候不能把焦點拉到 ☰');
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false');

    // 開啟中，其他按鍵不會關閉；Tab 這個按鍵本身也不攔截、不關閉
    //（焦點走出選單才會關閉，見下面 focusout 的測試）
    hamburger.click();
    assert.equal(dom.key('Tab').defaultPrevented, false);
    assert.equal(hamburger.getAttribute('aria-expanded'), 'true');
    assert.equal(nav.classList.contains('active'), true);
    assert.equal(overlay.classList.contains('active'), true);
});

test('開啟中焦點走出抽屜就關閉，而且不把焦點拉回 ☰：Tab 到被抽屜蓋住的主題切換鈕、Shift+Tab 到 logo', () => {
    const state = setup();
    const { dom, document, hamburger, toolLinks, languageButtons, themeToggle, logo } = state;

    // 往後：DOM 順序是 logo、nav、主題切換鈕、☰。抽屜最後一個項目之後是被抽屜蓋住的主題切換鈕，
    // 焦點停在那裡看不到；停在 ☰ 之後則是遮罩後面的頁面內容
    hamburger.click();
    languageButtons[languageButtons.length - 1].focus();
    assertMenuState(state, true, '焦點在抽屜最後一個項目');

    themeToggle.focus();
    assertMenuState(state, false, 'Tab 走到抽屜外的主題切換鈕');
    assert.ok(focusedIs(document, themeToggle), `焦點留在主題切換鈕，不能被拉回 ☰（實際在 ${describeNode(document.activeElement)}）`);

    // 往前：第一個工具連結就是抽屜最上面的項目（桌機用的首頁在抽屜裡不顯示，抽屜用的首頁排在工具清單之後），
    // Shift+Tab 直接走到抽屜外的 logo，關閉
    hamburger.click();
    assertMenuState(state, true, '重新開啟');
    assert.ok(focusedIs(document, toolLinks[0]), '前提：焦點在第一個工具連結');
    logo.focus();
    assertMenuState(state, false, 'Shift+Tab 走到抽屜外的 logo');
    assert.ok(focusedIs(document, logo), `焦點留在 logo（實際在 ${describeNode(document.activeElement)}）`);

    // 焦點在 ☰、選單還開著時往後走到遮罩後面的頁面內容：同樣關閉（☰ 自己的 focusout 也要處理）
    const pageContent = dom.el('button', { type: 'button' }, '頁面內容');
    document.body.appendChild(pageContent);
    hamburger.click();
    hamburger.focus();
    assertMenuState(state, true, '焦點在 ☰、選單開著');
    pageContent.focus();
    assertMenuState(state, false, 'Tab 從 ☰ 走到頁面內容');
    assert.ok(focusedIs(document, pageContent));
});

test('開啟中焦點照畫面順序在抽屜裡的項目之間移動（工具連結 → 首頁 → 版權聲明 → 語言按鈕）不關閉', () => {
    const state = setup();
    const { document, hamburger, toolLinks, externalLink, home, copyright, languageButtons } = state;

    hamburger.click();
    assert.ok(focusedIs(document, toolLinks[0]), '前提：焦點在第一個工具連結');

    for (const target of [toolLinks[1], externalLink, home, copyright, ...languageButtons]) {
        target.focus();
        assert.ok(focusedIs(document, target), `焦點要移到 ${describeNode(target)}（實際在 ${describeNode(document.activeElement)}）`);
        assertMenuState(state, true, `焦點在 ${describeNode(target)}`);
    }
});

test('開啟中按下 ☰：焦點先從選單移到 ☰ 不關閉，接著的 click 才關閉（不會又被打開）；☰ 回到選單也不關閉', () => {
    const state = setup();
    const { document, hamburger, toolLinks } = state;

    // 滑鼠按下 ☰（mousedown）會先把焦點移到 ☰，放開之後才有 click。
    // 若焦點移到 ☰ 就算「移出」而關閉，這個 click 會看到選單是關的，又把它打開
    hamburger.click();
    hamburger.focus();
    assertMenuState(state, true, '焦點從選單移到 ☰');
    hamburger.click();
    assertMenuState(state, false, '☰ 的 click');
    assert.ok(focusedIs(document, hamburger));

    // 反過來：焦點在 ☰、選單開著時移回選單裡
    hamburger.click();
    hamburger.focus();
    toolLinks[1].focus();
    assertMenuState(state, true, '焦點從 ☰ 回到選單');
    assert.ok(focusedIs(document, toolLinks[1]));
});

test('relatedTarget 是 null 的 focusout（視窗失焦、點到遮罩這類不能聚焦的地方）不關閉選單', () => {
    const state = setup();
    const { document, hamburger, overlay, toolLinks } = state;

    hamburger.click();
    toolLinks[0].blur(); // fake-dom 的 blur() 派送沒有 relatedTarget 的 focusout，焦點退回 body
    assert.ok(focusedIs(document, document.body), '前提：焦點離開了抽屜，但沒有移到別的元素');
    assertMenuState(state, true, 'relatedTarget 為 null 的 focusout');

    // 點遮罩由遮罩自己的 click 關閉，並把焦點還給 ☰
    overlay.click();
    assertMenuState(state, false, '遮罩的 click');
    assert.ok(focusedIs(document, hamburger));
});

test('選單沒打開時焦點移動不處理：不會解除別的元件（例如對話框）鎖住的頁面捲動', () => {
    const state = setup();
    const { document, nav, hamburger, themeToggle, logo } = state;
    document.body.style.overflow = 'hidden';

    hamburger.focus();
    themeToggle.focus();
    logo.focus();
    assert.equal(document.body.style.overflow, 'hidden');
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false');
    assert.equal(nav.inert, true);
});

test('視窗放寬到桌機寬度時重置選單；縮回手機寬度時重新 inert', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { dom, document, window, nav, hamburger, overlay } = setup();
    const resizeTo = (width) => {
        window.innerWidth = width;
        window.dispatchEvent(new window.Event('resize'));
        t.mock.timers.tick(250);
    };

    hamburger.click();
    assert.equal(nav.classList.contains('active'), true);
    assert.equal(document.body.style.overflow, 'hidden');

    // 手機橫拿：抽屜開著時放寬到 1024px → 全部重置，桌機的導覽列永遠可用（不是 inert）
    resizeTo(1024);
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false');
    assert.deepEqual([nav, hamburger, overlay].map((element) => element.classList.contains('active')), [false, false, false]);
    assert.equal(document.body.style.overflow, '');
    assert.equal(nav.inert, false);

    // 桌機寬度下按 Escape 不會有任何作用
    assert.equal(dom.key('Escape').defaultPrevented, false);

    // 轉回直拿：關閉的抽屜重新 inert
    resizeTo(390);
    assert.equal(nav.inert, true);
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false');
});

test('從往返快取還原頁面（pageshow 的 persisted 為 true）時關閉開著的抽屜、解除捲動鎖定，焦點原本在抽屜裡就還給 ☰、不在就不動；一般載入的 pageshow 不處理', () => {
    // 在抽屜裡選了工具再按 Back：瀏覽器可能從往返快取（bfcache）原封不動地還原頁面，抽屜還開著、頁面捲不動，
    // 焦點也還在剛才選的連結上
    const state = setup();
    const { document, window, hamburger, toolLinks } = state;
    // pageshow 是派送在 window 上的事件；persisted 要用 dom.window.Event 建，處理器才讀得到
    const pageshow = (persisted) => window.dispatchEvent(new window.Event('pageshow', { persisted }));

    hamburger.click();
    assertMenuState(state, true, '前提：抽屜開著');
    assert.ok(focusedIs(document, toolLinks[0]), '前提：焦點在抽屜裡');

    // 每次載入頁面都會有 pageshow，persisted 是 false：不處理
    pageshow(false);
    assertMenuState(state, true, 'persisted 為 false');

    // 關閉後抽屜是 inert，焦點留在裡面會掉回頁面最上面：和 Escape 一樣還給 ☰
    pageshow(true);
    assertMenuState(state, false, 'persisted 為 true');
    assert.ok(focusedIs(document, hamburger), `焦點原本在抽屜裡：還給 ☰（實際在 ${describeNode(document.activeElement)}）`);

    // 焦點不在抽屜裡（例如 Safari 點連結不會讓連結取得焦點）：只關閉，不把焦點拉到 ☰
    hamburger.click();
    toolLinks[0].blur(); // fake-dom 的 blur() 派送沒有 relatedTarget 的 focusout：抽屜不關，焦點退回 body
    assertMenuState(state, true, '前提：抽屜開著、焦點不在抽屜裡');
    pageshow(true);
    assertMenuState(state, false, '焦點不在抽屜裡時照樣關閉');
    assert.ok(focusedIs(document, document.body), `焦點不在抽屜裡：不動焦點（實際在 ${describeNode(document.activeElement)}）`);

    // 還原之後選單照常開關
    hamburger.click();
    assertMenuState(state, true, '還原後再打開');
    hamburger.click();
    assertMenuState(state, false, '還原後再關閉');
});

test('抽屜沒打開時從往返快取還原頁面：不處理，不會解除別的元件（例如對話框）鎖住的頁面捲動', () => {
    const state = setup();
    const { document, window, nav, hamburger } = state;
    document.body.style.overflow = 'hidden';

    window.dispatchEvent(new window.Event('pageshow', { persisted: true }));
    assert.equal(document.body.style.overflow, 'hidden');
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false');
    assert.equal(nav.inert, true);
});

test('開啟中點了會開新分頁的連結（水晶商城清單）就關閉抽屜、解除捲動鎖定，焦點原本在抽屜裡就還給 ☰、不在就不動；站內連結不處理', () => {
    // 開新分頁時這一頁不會卸載：抽屜不關的話，切回這個分頁時它還開著、頁面也捲不動
    const state = setup();
    const { document, hamburger, toolLinks, externalLink } = state;

    // 站內連結：這一頁會被換掉（從往返快取回來時由 pageshow 關閉）
    hamburger.click();
    toolLinks[0].click();
    assertMenuState(state, true, '點站內連結不關閉');

    // 鍵盤（或 Chrome 的滑鼠）點下去時焦點在連結上：關閉後抽屜是 inert，和 Escape 一樣把焦點還給 ☰
    externalLink.focus();
    externalLink.click();
    assertMenuState(state, false, '點水晶商城清單關閉');
    assert.ok(focusedIs(document, hamburger), `焦點原本在抽屜裡：還給 ☰（實際在 ${describeNode(document.activeElement)}）`);

    // 焦點不在抽屜裡（例如 Safari 點連結不會讓連結取得焦點）：只關閉，不把焦點拉到 ☰
    hamburger.click();
    externalLink.focus();
    externalLink.blur(); // fake-dom 的 blur() 派送沒有 relatedTarget 的 focusout：抽屜不關，焦點退回 body
    externalLink.click();
    assertMenuState(state, false, '焦點不在抽屜裡時照樣關閉');
    assert.ok(focusedIs(document, document.body), `焦點不在抽屜裡：不動焦點（實際在 ${describeNode(document.activeElement)}）`);
});

test('視窗縮到手機寬度時，焦點在導覽列裡就移到 ☰，導覽列立刻變成 inert；焦點在導覽列外不動', (t) => {
    // 平板轉直或把視窗拉窄：導覽列變成收起來的抽屜（看不到、inert），焦點留在裡面會掉回頁面最上面
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { document, nav, hamburger, copyright, toolLinks, themeToggle, media } = setup({ innerWidth: 1024, matchMedia: true });
    assert.equal(nav.inert, false, '前提：桌機的導覽列不是 inert');

    // 一般導覽項目
    copyright.focus();
    media.resizeTo(390);
    assert.ok(focusedIs(document, hamburger), `焦點要移到 ☰（實際在 ${describeNode(document.activeElement)}）`);
    assert.equal(nav.inert, true, '跨過斷點時就變成 inert，不等 resize 的 250ms 延遲重置');
    t.mock.timers.tick(250);

    // 工具面板裡的連結（面板由 nav-template.js 收合，這裡只管焦點）
    media.resizeTo(1024);
    t.mock.timers.tick(250);
    toolLinks[0].focus();
    media.resizeTo(390);
    assert.ok(focusedIs(document, hamburger), `焦點要移到 ☰（實際在 ${describeNode(document.activeElement)}）`);
    t.mock.timers.tick(250);

    // 焦點在導覽列外（主題切換鈕跨過 768px 不會搬動，也照樣看得到）：不動
    media.resizeTo(1024);
    t.mock.timers.tick(250);
    themeToggle.focus();
    media.resizeTo(390);
    assert.ok(focusedIs(document, themeToggle), `焦點留在主題切換鈕（實際在 ${describeNode(document.activeElement)}）`);
});

test('視窗放寬到桌機寬度時，焦點在 ☰ 或抽屜的工具清單就移到「工具 ▾」、在抽屜用的首頁就移到桌機用的首頁；桌機照樣看得到的項目不動', (t) => {
    // 平板轉橫或把視窗拉寬：☰ 不顯示、抽屜裡的工具清單收回「工具 ▾」、抽屜用的首頁也不顯示，焦點留在上面會掉回頁面最上面
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const state = setup({ matchMedia: true });
    const { document, nav, hamburger, homeDesktop, toolsToggle, home, copyright, media } = state;
    const widenWithDrawerOpen = (focusTarget) => {
        media.resizeTo(390);
        t.mock.timers.tick(250);
        hamburger.click();
        focusTarget?.focus();
        media.resizeTo(1024);
    };

    // ☰（抽屜關著）
    hamburger.focus();
    media.resizeTo(1024);
    assert.ok(focusedIs(document, toolsToggle), `焦點要移到「工具 ▾」（實際在 ${describeNode(document.activeElement)}）`);
    assert.equal(nav.inert, false, '跨過斷點時就解除 inert，焦點才移得進桌機的導覽列');
    t.mock.timers.tick(250);

    // 抽屜開著、焦點在工具清單（打開抽屜時焦點就在第一個工具連結）
    widenWithDrawerOpen(null);
    assert.ok(focusedIs(document, toolsToggle), `焦點要從工具清單移到「工具 ▾」（實際在 ${describeNode(document.activeElement)}）`);
    t.mock.timers.tick(250);
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false', '250ms 後照常重置抽屜');
    assert.ok(focusedIs(document, toolsToggle), '重置抽屜不動焦點');

    // 抽屜開著、焦點在抽屜用的首頁
    widenWithDrawerOpen(home);
    assert.ok(focusedIs(document, homeDesktop), `焦點要移到桌機用的首頁（實際在 ${describeNode(document.activeElement)}）`);
    t.mock.timers.tick(250);

    // 抽屜開著、焦點在桌機也看得到的導覽項目
    widenWithDrawerOpen(copyright);
    assert.ok(focusedIs(document, copyright), `焦點留在版權聲明（實際在 ${describeNode(document.activeElement)}）`);
});

test('桌機寬度載入時導覽列不是 inert', () => {
    const { nav } = setup({ innerWidth: 1280 });
    assert.equal(nav.inert, false);
});

test('頁面沒有載入 i18n（例如檢舉模板產生器）時，☰ 用預設文字、照常開關', () => {
    const { window, document, nav, hamburger, toolLinks } = setup({ i18n: false });
    assert.equal(window.i18n, undefined);
    assert.equal(hamburger.getAttribute('aria-label'), '選單');

    hamburger.click();
    assert.equal(hamburger.getAttribute('aria-expanded'), 'true');
    assert.ok(focusedIs(document, toolLinks[0]));
    hamburger.click();
    assert.equal(hamburger.getAttribute('aria-expanded'), 'false');
    assert.equal(nav.inert, true);
});

test('common.css：手機抽屜的高度是 100dvh（排在 100vh 後面，100vh 只給舊瀏覽器沿用），抽屜自己能捲動', () => {
    // iOS Safari 的 100vh 是網址列與工具列都收起來時的大視窗高度，而抽屜開著時頁面被鎖住捲動、工具列不會縮回去：
    // 約 80px 的抽屜底部（含手機版唯一的語言切換）會被擋在工具列下面。100dvh 隨工具列的顯示與否變動；
    // 不認得 dvh 的瀏覽器會忽略那一行，沿用 100vh。同一個屬性後寫的贏，所以 100dvh 一定要在 100vh 後面
    const css = read('assets/css/common.css').replace(/\/\*[\s\S]*?\*\//g, '');
    // 手機抽屜是唯一帶 position: fixed 的 .nav 規則（桌機的 .nav 是頁首裡的一般導覽列）
    const drawer = [...css.matchAll(/\.nav\s*\{([^}]*)\}/g)].map((match) => match[1]).find((body) => /position:\s*fixed/.test(body));
    assert.ok(drawer, 'common.css 找不到手機抽屜的 .nav 規則（position: fixed）');

    // (?<![-\w]) 排除 max-height、min-height
    const heights = [...drawer.matchAll(/(?<![-\w])height:\s*([^;]+);/g)].map((match) => match[1].trim());
    assert.deepEqual(heights, ['100vh', '100dvh']);
    assert.ok(/overflow-y:\s*auto\s*;/.test(drawer), '抽屜內容比視窗高時要能在抽屜內捲動');
});
