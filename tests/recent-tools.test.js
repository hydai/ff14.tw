const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createFakeDom } = require('./helpers/fake-dom.js');
const { translationValues } = require('./helpers/translation-parsers.js');
// 登錄表直接在 Node 端載入（沒有 window：storage 由測試傳入，要測預設的 window.localStorage 時用 withWindow 暫時放一個）；
// layout-loader、home.js 與 i18n 則在 fake-dom 的 vm 裡載入真正的腳本，順序同真實頁面
const ToolsRegistry = require('../assets/js/components/tools-registry.js');

const ROOT = path.join(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

const KEY = 'ff14tw_recent_tools';
const COMMON_FILE = 'assets/js/i18n/translations/common.js';
const INDEX_FILE = 'assets/js/i18n/translations/index.js';

// ---------- 替身與小工具 ----------

// localStorage 替身：用 Map 實作 getItem／setItem，並記下 setItem 被呼叫幾次
function createStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        data,
        writes: 0,
        getItem(key) { return data.has(key) ? data.get(key) : null; },
        setItem(key, value) { this.writes += 1; data.set(key, String(value)); }
    };
}

// 兩個方法都丟例外的替身（無痕模式、封鎖儲存空間）；reads、writes 記下各被呼叫幾次，
// 測試用來確認程式真的碰到了這些例外並吞掉，而不是根本沒去讀寫
function createBrokenStorage() {
    return {
        reads: 0,
        writes: 0,
        getItem() { this.reads += 1; throw new Error('SecurityError'); },
        setItem() { this.writes += 1; throw new Error('SecurityError'); }
    };
}

// 暫時在 Node 的全域放一個 window，跑完就拿掉。用在「讀 window.localStorage 本身就丟例外」的測試：
// fake-dom 的 vm 全域會把 sandbox 上 getter 丟的例外吞掉（腳本讀到的是 undefined），測不到 try/catch 這條路
function withWindow(fakeWindow, fn) {
    globalThis.window = fakeWindow;
    try {
        return fn();
    } finally {
        delete globalThis.window;
    }
}

const stored = (storage) => JSON.parse(storage.data.get(KEY));
const storedIds = (storage) => stored(storage).map((entry) => entry.id);
// vm 裡建出來的陣列和測試端的原型不同（deepEqual 會失敗），先轉成 id 的字串陣列再比較
const ids = (tools) => Array.from(tools, (tool) => tool.id);

// ---------- ToolsRegistry：記錄與讀取 ----------

test('recordVisit：最新在前、同一工具只留一筆、最多 4 筆', () => {
    assert.equal(ToolsRegistry.STORAGE_KEY, KEY);
    assert.equal(ToolsRegistry.MAX_RECENT, 4);

    // 依序記錄 a、b、a、c、d、e（now 遞增）
    const storage = createStorage();
    const visits = ['mini-cactpot', 'wondrous-tails', 'mini-cactpot', 'guide', 'weather-forecast', 'macro-converter'];
    visits.forEach((id, index) => ToolsRegistry.recordVisit(id, { storage, now: 1000 + index }));

    assert.deepEqual(ids(ToolsRegistry.readRecent(storage)), ['macro-converter', 'weather-forecast', 'guide', 'mini-cactpot']);
    // 儲存格式：JSON 陣列 [{ id, t }]，最新的在前；再次造訪的工具只留最後一次的時間
    assert.deepEqual(stored(storage), [
        { id: 'macro-converter', t: 1005 },
        { id: 'weather-forecast', t: 1004 },
        { id: 'guide', t: 1003 },
        { id: 'mini-cactpot', t: 1002 }
    ]);

    // 把已經在清單裡的工具再記一次，它會回到最前面，其他工具的順序不變
    ToolsRegistry.recordVisit('weather-forecast', { storage, now: 2000 });
    assert.deepEqual(ids(ToolsRegistry.readRecent(storage)), ['weather-forecast', 'macro-converter', 'guide', 'mini-cactpot']);
    assert.equal(stored(storage)[0].t, 2000);
});

test('recordVisit 沒給 now 時用目前時間', () => {
    const storage = createStorage();
    const before = Date.now();
    ToolsRegistry.recordVisit('guide', { storage });
    const after = Date.now();

    const [entry] = stored(storage);
    assert.equal(entry.id, 'guide');
    assert.ok(entry.t >= before && entry.t <= after, `t = ${entry.t}`);
});

test('recordVisit 忽略外部工具與未知 id', () => {
    const storage = createStorage();
    for (const id of ['tc-shop', 'nope', '', undefined, null, 42, {}, ['guide']]) {
        ToolsRegistry.recordVisit(id, { storage, now: 1 });
    }
    assert.equal(storage.writes, 0, 'storage 沒有被寫入');
    assert.equal(storage.data.size, 0);

    // 已經有紀錄時也不動它
    const existing = JSON.stringify([{ id: 'guide', t: 5 }]);
    const withData = createStorage({ [KEY]: existing });
    ToolsRegistry.recordVisit('tc-shop', { storage: withData, now: 9 });
    ToolsRegistry.recordVisit('nope', { storage: withData, now: 9 });
    assert.equal(withData.writes, 0);
    assert.equal(withData.data.get(KEY), existing);
});

test('readRecent 過濾毀損資料、未知 id 與重複', () => {
    const recent = (raw) => ids(ToolsRegistry.readRecent(createStorage(raw === undefined ? {} : { [KEY]: raw })));

    assert.deepEqual(recent(undefined), [], '還沒有紀錄');
    assert.deepEqual(recent('{bad json'), [], 'JSON 毀損');
    assert.deepEqual(recent('{}'), [], '不是陣列');
    assert.deepEqual(recent('null'), []);
    assert.deepEqual(recent('"guide"'), []);
    assert.deepEqual(recent('[{"id":"nope"},{"id":"guide"},{"id":"guide"},{"x":1}]'), ['guide'], '未知 id、重複、沒有 id 的項目都略過');
    assert.deepEqual(recent('[null,5,"guide",[],{"id":["guide"]},{"id":"weather-forecast"}]'), ['weather-forecast'], '項目不是物件、id 不是字串都略過');
    assert.deepEqual(recent('[{"id":"tc-shop","t":3},{"id":"guide","t":2}]'), ['guide'], '外部網站不算最近使用');

    // 先過濾再取前 4 個：中間夾著未知 id 也湊得滿 4 個
    const crowded = [{ id: 'mini-cactpot' }, { id: 'wondrous-tails' }, { id: 'nope' }, { id: 'dungeon-database' }, { id: 'character-card' }, { id: 'guide' }];
    assert.deepEqual(recent(JSON.stringify(crowded)), ['mini-cactpot', 'wondrous-tails', 'dungeon-database', 'character-card']);

    // 回傳的是登錄表裡的工具物件（home.js 要用到 href、icon、i18nKey、name）
    const [tool] = ToolsRegistry.readRecent(createStorage({ [KEY]: '[{"id":"guide","t":1}]' }));
    assert.ok(tool === ToolsRegistry.findById('guide'));
});

test('recordVisit 遇到毀損或不合格的舊資料，會整理後再寫回', () => {
    const corrupted = createStorage({ [KEY]: '{bad json' });
    ToolsRegistry.recordVisit('guide', { storage: corrupted, now: 7 });
    assert.deepEqual(stored(corrupted), [{ id: 'guide', t: 7 }], '壞資料被這次的紀錄取代，最近使用不會從此壞掉');

    // 舊資料裡未知與外部的 id 被丟掉、重複的只留第一筆、沒有時間戳記的補 0
    const messy = createStorage({ [KEY]: JSON.stringify([{ id: 'nope', t: 1 }, { id: 'tc-shop', t: 2 }, { id: 'weather-forecast' }, { id: 'weather-forecast', t: 3 }, { id: 'macro-converter', t: 4 }]) });
    ToolsRegistry.recordVisit('guide', { storage: messy, now: 9 });
    assert.deepEqual(stored(messy), [{ id: 'guide', t: 9 }, { id: 'weather-forecast', t: 0 }, { id: 'macro-converter', t: 4 }]);
});

test('localStorage 丟例外時 readRecent 回傳空陣列、recordVisit 不丟例外', () => {
    const broken = createBrokenStorage();
    assert.deepEqual(ids(ToolsRegistry.readRecent(broken)), []);
    assert.doesNotThrow(() => ToolsRegistry.recordVisit('guide', { storage: broken, now: 1 }));
    assert.equal(broken.reads, 2, 'readRecent 與 recordVisit 都真的讀過，例外被吞掉');
    assert.equal(broken.writes, 1, 'recordVisit 讀不到舊資料，仍然試著寫入新的紀錄');

    // 只有 setItem 丟例外（容量已滿）：讀得到舊資料，寫不進去
    const full = createStorage({ [KEY]: JSON.stringify([{ id: 'guide', t: 1 }]) });
    full.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.deepEqual(ids(ToolsRegistry.readRecent(full)), ['guide']);
    assert.doesNotThrow(() => ToolsRegistry.recordVisit('weather-forecast', { storage: full, now: 2 }));
    assert.deepEqual(ids(ToolsRegistry.readRecent(full)), ['guide']);

    // 給的東西不是儲存空間
    assert.deepEqual(ids(ToolsRegistry.readRecent({})), []);
    assert.doesNotThrow(() => ToolsRegistry.recordVisit('guide', { storage: {}, now: 1 }));
});

test('沒給 storage 時用 window.localStorage；取不到（沒有這個東西、存取就丟例外）就當作沒有儲存空間', () => {
    const load = (dom) => {
        dom.load('assets/js/components/tools-registry.js');
        return dom.window.ToolsRegistry;
    };

    // 有 localStorage
    const dom = createFakeDom();
    const storage = createStorage();
    dom.window.localStorage = storage;
    const registry = load(dom);
    registry.recordVisit('guide', { now: 5 });
    registry.recordVisit('weather-forecast', { now: 6 });
    assert.deepEqual(stored(storage), [{ id: 'weather-forecast', t: 6 }, { id: 'guide', t: 5 }]);
    assert.deepEqual(ids(registry.readRecent()), ['weather-forecast', 'guide']);
    assert.deepEqual(ids(registry.readRecent(null)), [], '明確傳 null 是「沒有儲存空間」，不會退回 window.localStorage');

    // 沒有 localStorage
    const bare = load(createFakeDom());
    assert.deepEqual(ids(bare.readRecent()), []);
    assert.doesNotThrow(() => bare.recordVisit('guide', { now: 1 }));

    // 存取 window.localStorage 本身就丟例外（封鎖儲存空間的瀏覽器）；null 是部分瀏覽器封鎖時的樣子
    let reads = 0;
    const blockedWindow = { get localStorage() { reads += 1; throw new Error('SecurityError'); } };
    withWindow(blockedWindow, () => {
        assert.deepEqual(ids(ToolsRegistry.readRecent()), []);
        assert.doesNotThrow(() => ToolsRegistry.recordVisit('guide', { now: 1 }));
    });
    assert.equal(reads, 2, 'readRecent 與 recordVisit 都真的讀過 window.localStorage，例外被吞掉');
    withWindow({ localStorage: null }, () => {
        assert.deepEqual(ids(ToolsRegistry.readRecent()), []);
        assert.doesNotThrow(() => ToolsRegistry.recordVisit('guide', { now: 1 }));
    });

    // 在 Node 端 require 的登錄表沒有 window，同樣當作沒有儲存空間
    assert.equal(typeof window, 'undefined');
    assert.deepEqual(ids(ToolsRegistry.readRecent()), []);
    assert.doesNotThrow(() => ToolsRegistry.recordVisit('guide', { now: 1 }));
});

// ---------- layout-loader：記錄目前的工具 ----------

// 載入真正的 tools-registry.js、nav-template.js、layout-loader.js；readyState 是 loading，
// layout-loader 要等 loadLayout() 派送 DOMContentLoaded 才會動，所以可以先直接呼叫它的方法
function setupLoader(url, placeholderAttrs, storage) {
    const dom = createFakeDom({ url, readyState: 'loading' });
    if (placeholderAttrs) dom.document.body.appendChild(dom.el('div', { id: 'header-placeholder', ...placeholderAttrs }));
    if (storage) dom.window.localStorage = storage;
    dom.load('assets/js/components/tools-registry.js');
    dom.load('assets/js/components/nav-template.js');
    dom.load('assets/js/components/layout-loader.js');
    return dom;
}

const loadLayout = (dom) => dom.document.dispatchEvent(new dom.window.CustomEvent('DOMContentLoaded'));

test('layout-loader：有目前工具才記錄，404 與站務頁不記錄', () => {
    const storage = createStorage();
    const { layoutLoader } = setupLoader('https://ff14.tw/tools/weather-forecast/index.html', null, storage).window;

    layoutLoader._recordRecentTool({ currentToolId: null });
    layoutLoader._recordRecentTool({});
    layoutLoader._recordRecentTool({ currentToolId: 'nope' });
    assert.equal(storage.writes, 0, '沒有目前工具（或登錄表沒有這個 id）就沒有寫入');

    layoutLoader._recordRecentTool({ currentToolId: 'weather-forecast' });
    assert.deepEqual(storedIds(storage), ['weather-forecast']);
    assert.ok(Number.isFinite(stored(storage)[0].t));

    // 真的走完 _load()：頁首載入後，由 _getOptions() 算出的目前工具來記錄
    const visit = (url, placeholderAttrs, sharedStorage = createStorage()) => {
        const dom = setupLoader(url, placeholderAttrs, sharedStorage);
        loadLayout(dom);
        assert.ok(dom.document.querySelector('header.header'), `${url} 的頁首沒有載入`);
        return sharedStorage;
    };
    assert.deepEqual(storedIds(visit('https://ff14.tw/tools/weather-forecast/index.html', { 'data-base-path': '../../' })), ['weather-forecast']);
    assert.deepEqual(storedIds(visit('https://ff14.tw/tools/guide/chocobo.html', { 'data-base-path': '../../' })), ['guide'], '工具底下的子頁面算那個工具');

    // 404 頁：GitHub Pages 會在任何不存在的網址顯示 404.html，這個網址剛好在天氣預報的目錄底下，但不算用過天氣預報
    const notFound = visit('https://ff14.tw/tools/weather-forecast/typo', { 'data-base-path': '/', 'data-page': '404' });
    assert.equal(notFound.writes, 0);

    for (const [url, basePath] of [['https://ff14.tw/', '/'], ['https://ff14.tw/index.html', '/'], ['https://ff14.tw/about.html', '/'], ['https://ff14.tw/changelog.html', '/'], ['https://ff14.tw/copyright.html', '/']]) {
        assert.equal(visit(url, { 'data-base-path': basePath }).writes, 0, `${url} 是站務頁，不記錄`);
    }
});

test('layout-loader：先後造訪兩個工具頁，最近的排在最前面', () => {
    const storage = createStorage();
    const earlier = setupLoader('https://ff14.tw/tools/mini-cactpot/index.html', { 'data-base-path': '../../' }, storage);
    loadLayout(earlier);
    const later = setupLoader('https://ff14.tw/tools/weather-forecast/index.html', { 'data-base-path': '../../' }, storage);
    loadLayout(later);

    assert.deepEqual(storedIds(storage), ['weather-forecast', 'mini-cactpot']);
    assert.deepEqual(ids(later.window.ToolsRegistry.readRecent()), ['weather-forecast', 'mini-cactpot']);
});

test('layout-loader：儲存空間不能用時，工具頁的頁首照常載入', () => {
    const storage = createBrokenStorage();
    const dom = setupLoader('https://ff14.tw/tools/weather-forecast/index.html', { 'data-base-path': '../../' }, storage);
    const events = [];
    dom.document.addEventListener('layoutLoaded', () => events.push('layoutLoaded'));

    assert.doesNotThrow(() => loadLayout(dom));
    assert.deepEqual([storage.reads, storage.writes], [1, 1], '工具頁真的試著記錄過，讀寫的例外都被吞掉');
    assert.ok(dom.document.querySelector('header.header'));
    assert.ok(dom.document.body.classList.contains('layout-loaded'));
    assert.deepEqual(events, ['layoutLoaded']);
});

// ---------- 首頁：最近使用列 ----------

// 和 index.html 同樣的結構（區塊預設 hidden）。依真實頁面的順序載入：（i18n）→ 登錄表 → home.js
function setupHome({ readyState = 'complete', storage, i18n = false } = {}) {
    const dom = createFakeDom({ url: 'https://ff14.tw/', readyState });
    const title = dom.el('h2', { class: 'section-label', id: 'recentToolsTitle', 'data-i18n': 'home_recent_title' }, '最近使用');
    const list = dom.el('div', { class: 'recent-list', id: 'recentToolsList' });
    const section = dom.el('section', { class: 'recent-tools', id: 'recentTools', 'aria-labelledby': 'recentToolsTitle', hidden: true }, title, list);
    dom.document.body.appendChild(section);

    if (storage) dom.window.localStorage = storage;
    if (i18n) {
        dom.window.navigator = { languages: ['zh-TW'] };
        dom.load('assets/js/i18n/i18n-manager.js');
        dom.load(COMMON_FILE);
        dom.load(INDEX_FILE);
    }
    dom.load('assets/js/components/tools-registry.js');
    dom.load('assets/js/home.js');
    return { dom, section, title, list };
}

const entriesOf = (...toolIds) => JSON.stringify(toolIds.map((id, index) => ({ id, t: 1000 - index })));
const dispatchLoaded = (dom) => dom.document.dispatchEvent(new dom.window.CustomEvent('DOMContentLoaded'));

test('首頁最近使用：沒有資料時保持隱藏；有資料時依序顯示最多 4 個', () => {
    // 沒有資料：區塊維持 hidden，也沒有連結。不設 window.i18n
    const empty = setupHome({ storage: createStorage() });
    assert.equal(empty.dom.window.i18n, undefined);
    assert.equal(empty.section.hidden, true);
    assert.equal(empty.list.children.length, 0);

    // 存 5 筆：顯示最新的 4 個，依儲存的順序
    const saved = ['weather-forecast', 'guide', 'macro-converter', 'mini-cactpot', 'timed-gathering'];
    const home = setupHome({ storage: createStorage({ [KEY]: entriesOf(...saved) }) });
    assert.equal(home.section.hidden, false);
    assert.ok(!home.section.hasAttribute('hidden'));

    const links = home.list.querySelectorAll('a.recent-tool');
    assert.equal(links.length, 4);
    assert.equal(home.list.children.length, 4, '清單裡只有這 4 個連結');
    links.forEach((link, index) => {
        const tool = ToolsRegistry.findById(saved[index]);
        const what = `第 ${index + 1} 個（${tool.id}）`;
        assert.equal(link.getAttribute('href'), tool.href, `${what}的 href 是站內網址`);
        assert.ok(!link.hasAttribute('target') && !link.hasAttribute('rel'), `${what}是站內連結，不開新分頁`);
        assert.ok(!link.hasAttribute('data-i18n'), `${what}：data-i18n 要放在名稱 span，不能放在連結上`);

        // 圖示與名稱是兄弟節點：切換語言時只有名稱的文字會被覆寫
        assert.deepEqual(link.children.map((child) => child.className), ['recent-tool-icon', 'recent-tool-name'], what);
        const icon = link.querySelector('span.recent-tool-icon');
        assert.equal(icon.getAttribute('aria-hidden'), 'true', what);
        assert.equal(icon.textContent, tool.icon, what);
        const name = link.querySelector('span.recent-tool-name');
        assert.equal(name.getAttribute('data-i18n'), tool.i18nKey, what);
        assert.equal(name.textContent, tool.name, `${what}沒有 i18n 時顯示 zh 名稱`);
        assert.equal(name.children.length, 0, what);
    });
});

test('首頁最近使用：資料毀損、全是未知或外部的 id、儲存空間不能用時，區塊維持隱藏也不丟例外', () => {
    const cases = {
        '資料毀損': createStorage({ [KEY]: '{bad json' }),
        '不是陣列': createStorage({ [KEY]: '{}' }),
        '全是未知或外部的 id': createStorage({ [KEY]: entriesOf('nope', 'tc-shop') }),
        '沒有 localStorage': undefined
    };
    for (const [what, storage] of Object.entries(cases)) {
        const home = setupHome({ storage });
        assert.equal(home.section.hidden, true, what);
        assert.equal(home.list.children.length, 0, what);
    }

    // getItem 丟例外（無痕模式、封鎖儲存空間）：載入 home.js 不丟例外，而且真的讀過
    const broken = createBrokenStorage();
    let home;
    assert.doesNotThrow(() => { home = setupHome({ storage: broken }); });
    assert.equal(broken.reads, 1);
    assert.equal(home.section.hidden, true);
    assert.equal(home.list.children.length, 0);
});

test('renderRecentTools 可以重複呼叫，每次依目前的紀錄重建；紀錄清空後再隱藏', () => {
    const storage = createStorage({ [KEY]: entriesOf('guide') });
    const { dom, section, list } = setupHome({ storage });
    const { HomePage } = dom.window;
    const names = () => list.querySelectorAll('.recent-tool-name').map((name) => name.textContent);
    assert.deepEqual(names(), ['攻略資料']);

    HomePage.renderRecentTools();
    assert.deepEqual(names(), ['攻略資料'], '重複呼叫不會把連結疊上去');

    storage.data.set(KEY, entriesOf('weather-forecast', 'guide'));
    HomePage.renderRecentTools(dom.document);
    assert.deepEqual(names(), ['天氣預報', '攻略資料']);
    assert.equal(section.hidden, false);

    storage.data.delete(KEY);
    HomePage.renderRecentTools();
    assert.equal(list.children.length, 0);
    assert.equal(section.hidden, true);
});

test('home.js：文件載入中等 DOMContentLoaded 才畫，載入時文件已經就緒就直接畫；頁面沒有最近使用區塊時什麼都不做', () => {
    const storage = createStorage({ [KEY]: entriesOf('guide') });

    const loading = setupHome({ readyState: 'loading', storage });
    assert.equal(loading.section.hidden, true, 'DOMContentLoaded 之前還不畫');
    dispatchLoaded(loading.dom);
    assert.equal(loading.section.hidden, false);
    assert.equal(loading.list.querySelectorAll('a.recent-tool').length, 1);

    const ready = setupHome({ readyState: 'interactive', storage });
    assert.equal(ready.section.hidden, false);
    assert.equal(ready.list.querySelectorAll('a.recent-tool').length, 1);

    // 沒有 #recentTools／#recentToolsList 的頁面（或結構不完整）：不丟例外
    const bare = createFakeDom({ url: 'https://ff14.tw/' });
    bare.window.localStorage = storage;
    bare.load('assets/js/components/tools-registry.js');
    assert.doesNotThrow(() => bare.load('assets/js/home.js'));
    bare.document.body.appendChild(bare.el('section', { id: 'recentTools', hidden: true }));
    assert.doesNotThrow(() => bare.window.HomePage.renderRecentTools());
    assert.equal(bare.document.querySelector('#recentTools').hidden, true, '少了 #recentToolsList 就不顯示');
});

test('首頁從 bfcache 還原（pageshow 且 persisted）時重畫最近使用；一般載入的 pageshow 不重畫', () => {
    // 使用者從首頁點進工具頁再按上一頁：瀏覽器直接從 bfcache 還原首頁，頁面的 script 不會再跑一次，
    // 所以 DOMContentLoaded 那次畫好的列是離開前的樣子，看不到剛用過的工具
    const pageshow = (dom, persisted) => dom.window.dispatchEvent(new dom.window.Event('pageshow', { persisted }));
    const names = (home) => home.list.querySelectorAll('.recent-tool-name').map((name) => name.textContent);

    // 回訪的玩家：首頁畫了「攻略資料」，去用天氣預報（工具頁記錄一次使用），回來
    const returning = setupHome({ readyState: 'loading', storage: createStorage({ [KEY]: entriesOf('guide') }) });
    dispatchLoaded(returning.dom);
    assert.deepEqual(names(returning), ['攻略資料']);

    // 數重畫的次數：一次還原只能畫一次（監聽器只註冊一個）
    let renders = 0;
    const { HomePage } = returning.dom.window;
    const render = HomePage.renderRecentTools;
    HomePage.renderRecentTools = function (...args) {
        renders += 1;
        return render.apply(this, args);
    };

    returning.dom.window.ToolsRegistry.recordVisit('weather-forecast', { now: 2000 });
    pageshow(returning.dom, false);
    assert.equal(renders, 0, '一般載入時 pageshow 的 persisted 是 false，DOMContentLoaded 已經畫過，不用再畫');
    assert.deepEqual(names(returning), ['攻略資料']);

    pageshow(returning.dom, true);
    assert.equal(renders, 1);
    assert.deepEqual(names(returning), ['天氣預報', '攻略資料'], '還原後最近用過的工具排在最前面');
    assert.equal(returning.section.hidden, false);

    // 第一次來的玩家：首頁畫的時候沒有紀錄、區塊隱藏；去用了一個工具回來，區塊要出現
    const firstTimer = setupHome({ readyState: 'loading', storage: createStorage() });
    dispatchLoaded(firstTimer.dom);
    assert.equal(firstTimer.section.hidden, true);
    firstTimer.dom.window.ToolsRegistry.recordVisit('guide', { now: 1 });
    pageshow(firstTimer.dom, true);
    assert.equal(firstTimer.section.hidden, false);
    assert.deepEqual(names(firstTimer), ['攻略資料']);
});

test('首頁最近使用：名稱帶 data-i18n，切換語言時跟著 zh／en／ja 更新，圖示不受影響', () => {
    const saved = ['weather-forecast', 'faux-hollows-foxes'];
    const keys = saved.map((id) => ToolsRegistry.findById(id).i18nKey);
    const commonNames = (lang) => keys.map((key) => translationValues(COMMON_FILE, lang).get(key));
    const indexText = (lang, key) => translationValues(INDEX_FILE, lang).get(key);

    // 照真實頁面：文件載入中，I18nManager 與 home.js 都等 DOMContentLoaded
    const { dom, title, list } = setupHome({ readyState: 'loading', storage: createStorage({ [KEY]: entriesOf(...saved) }), i18n: true });
    dispatchLoaded(dom);
    const { i18n } = dom.window;
    const names = () => list.querySelectorAll('.recent-tool-name').map((name) => name.textContent);

    assert.equal(i18n.getCurrentLanguage(), 'zh');
    assert.deepEqual(names(), commonNames('zh'));
    assert.notDeepEqual(commonNames('en'), commonNames('zh'), '三個語系的名稱要真的不同，這個測試才有意義');
    assert.notDeepEqual(commonNames('ja'), commonNames('zh'));

    for (const lang of ['en', 'ja', 'zh']) {
        i18n.setLanguage(lang);
        assert.deepEqual(names(), commonNames(lang), `切到 ${lang}`);
        assert.equal(title.textContent, indexText(lang, 'home_recent_title'), `小標切到 ${lang}`);
        assert.deepEqual(list.querySelectorAll('.recent-tool-icon').map((icon) => icon.textContent), saved.map((id) => ToolsRegistry.findById(id).icon), '圖示還在');
        assert.equal(list.querySelectorAll('a.recent-tool').length, 2);
    }

    // 玩家上次選的是日文：畫出來的當下就是日文名稱，不是先出現中文再換
    const ja = setupHome({ readyState: 'loading', storage: createStorage({ ff14tw_preferred_language: 'ja', [KEY]: entriesOf(...saved) }), i18n: true });
    dispatchLoaded(ja.dom);
    assert.deepEqual(ja.list.querySelectorAll('.recent-tool-name').map((name) => name.textContent), commonNames('ja'));
});

// ---------- 靜態檔案：index.html、翻譯、樣式 ----------

// 含有 needle 的那個開始標籤（整個 <…>）
function openTagWith(html, needle) {
    const at = html.indexOf(needle);
    assert.notEqual(at, -1, `找不到 ${needle}`);
    return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
}

test('index.html：最近使用區塊在 hero 與工具區之間，預設 hidden 且沒有靜態連結；「所有工具」小標在工具卡前面', () => {
    const html = read('index.html');

    const heroAt = html.search(/<section\b[^>]*\bclass="[^"]*\bhero\b[^"]*"/);
    const recentAt = html.indexOf('id="recentTools"');
    const toolsAt = html.search(/<section\b[^>]*\bid="tools"/);
    assert.ok(heroAt !== -1 && heroAt < recentAt && recentAt < toolsAt, '順序要是 hero → 最近使用 → 工具區');

    const section = openTagWith(html, 'id="recentTools"');
    assert.match(section, /^<section\b/);
    assert.match(section, /\sclass="recent-tools"/);
    assert.match(section, /\saria-labelledby="recentToolsTitle"/);
    assert.match(section, /\shidden(?=[\s>])/, '預設 hidden，有資料才由 home.js 顯示');

    const sectionStart = html.lastIndexOf('<', recentAt);
    const sectionHtml = html.slice(sectionStart, html.indexOf('</section>', sectionStart));
    assert.match(sectionHtml, /<h2\b[^>]*\bid="recentToolsTitle"[^>]*>最近使用<\/h2>/);
    const title = openTagWith(html, 'id="recentToolsTitle"');
    assert.match(title, /\sclass="section-label"/);
    assert.match(title, /\sdata-i18n="home_recent_title"/);
    assert.match(sectionHtml, /<div\b[^>]*\bid="recentToolsList"[^>]*>\s*<\/div>/, '清單由 home.js 產生，靜態 HTML 裡是空的');
    assert.match(openTagWith(html, 'id="recentToolsList"'), /\sclass="recent-list"/);
    assert.doesNotMatch(sectionHtml, /<a\b/, '最近使用區塊沒有靜態連結（工具卡的對應測試只認 a.tool-card）');

    const allToolsAt = html.indexOf('data-i18n="home_all_tools_title"');
    const gridAt = html.indexOf('class="tools-grid"');
    assert.ok(toolsAt < allToolsAt && allToolsAt < gridAt, '「所有工具」小標在 #tools 區塊裡、工具卡的 grid 前面');
    const allTools = openTagWith(html, 'data-i18n="home_all_tools_title"');
    assert.match(allTools, /^<h2\b/);
    assert.match(allTools, /\sclass="section-label"/);
    assert.match(html.slice(allToolsAt, allToolsAt + 80), />所有工具<\/h2>/);

    const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(scripts.includes('assets/js/home.js'), 'index.html 要載入 home.js');
    assert.ok(scripts.indexOf('assets/js/home.js') > scripts.indexOf('assets/js/common.js'), 'home.js 在 common.js 之後');
    assert.ok(scripts.indexOf('assets/js/home.js') > scripts.indexOf('assets/js/components/tools-registry.js'), 'home.js 在登錄表之後');
});

test('index.js 有最近使用與所有工具小標的 zh／en／ja 翻譯', () => {
    const EXPECTED = {
        home_recent_title: { zh: '最近使用', en: 'Recently used', ja: '最近使ったツール' },
        home_all_tools_title: { zh: '所有工具', en: 'All tools', ja: 'すべてのツール' }
    };
    for (const lang of ['zh', 'en', 'ja']) {
        const values = translationValues(INDEX_FILE, lang);
        assert.ok(values.size > 0, `解析不到 ${INDEX_FILE} 的 ${lang} 語系，測試可能失效`);
        for (const [key, texts] of Object.entries(EXPECTED)) {
            assert.equal(values.get(key), texts[lang], `${INDEX_FILE} 的 ${lang} 語系 ${key}`);
        }
    }
});

// 把 CSS 攤平成 [{ media, selectors, body }]：media 是外層 @media 的條件，不在 @media 裡就是 null
function cssRules(css) {
    const rules = [];
    const scan = (text, media) => {
        for (const match of text.matchAll(/([^{}]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
            const head = match[1].trim();
            if (head.startsWith('@media')) scan(match[2], head.slice('@media'.length).trim());
            else rules.push({ media, selectors: head.split(',').map((selector) => selector.trim()), body: match[2] });
        }
    };
    scan(css, null);
    return rules;
}

test('common.css：小標、最近使用列表與連結的樣式；.recent-tools 本身不設 display，[hidden] 才擋得住', () => {
    const rules = cssRules(read('assets/css/common.css').replace(/\/\*[\s\S]*?\*\//g, ''));
    const find = (selector, media = null) => {
        const found = rules.find((rule) => rule.media === media && rule.selectors.includes(selector));
        assert.ok(found, `common.css 找不到 ${selector}${media ? `（@media ${media}）` : ''} 的規則`);
        return found.body;
    };

    const label = find('.section-label');
    assert.match(label, /font-size:\s*var\(--text-sm\)/);
    assert.match(label, /color:\s*var\(--color-muted\)/);
    assert.match(label, /font-weight:\s*var\(--weight-semibold\)/);

    // 作者樣式的 display 會蓋過瀏覽器內建的 [hidden] { display: none }：第一次來的玩家就會看到空的「最近使用」
    for (const rule of rules.filter((candidate) => candidate.selectors.includes('.recent-tools'))) {
        assert.doesNotMatch(rule.body, /(?:^|[;\s])display\s*:/, '.recent-tools 不能設 display，grid 放在 .recent-list');
    }

    const list = find('.recent-list');
    assert.match(list, /display:\s*grid/);
    assert.match(list, /grid-template-columns:\s*repeat\(4,/, '桌機 4 欄');
    assert.match(find('.recent-list', '(max-width: 768px)'), /grid-template-columns:\s*repeat\(2,/, '手機 2 欄');

    const tool = find('.recent-tool');
    assert.match(tool, /min-height:\s*var\(--control-lg\)/);
    for (const token of ['--color-surface', '--color-border', '--radius-md', '--shadow-sm']) {
        assert.match(tool, new RegExp(`var\\(${token}\\)`), `.recent-tool 要用 ${token}`);
    }
    const name = find('.recent-tool-name');
    assert.match(name, /text-overflow:\s*ellipsis/, '名稱太長時截成「…」');
    assert.match(name, /min-width:\s*0/, 'flex 項目要放寬 min-width 才縮得起來');
});
