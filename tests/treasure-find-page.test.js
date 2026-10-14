const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDom } = require('./helpers/fake-dom.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');
const { maps } = require('../data/treasure-maps.json');
const zonesData = require('../data/zones.json');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const TRANSLATIONS = 'assets/js/i18n/translations/tools/treasure-map-finder.js';
const GRADES = ['g18', 'g17', 'g15', 'g14', 'g12', 'g10', 'g8'];
// 地區 id -> { zh, en, ja }（zones.json 的 names）
const zoneNames = new Map(Object.values(zonesData.zones).flatMap((region) => region.subZones.map((zone) => [zone.id, zone.names])));

// ---------- 最小 HTML 解析（只解析字串，不需要 DOM；不假設屬性順序） ----------
function parseAttrs(source) {
    const attrs = {};
    for (const m of source.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = m[2] ?? m[3];
    return attrs;
}
const classesOf = (attrs) => (attrs.class || '').split(/\s+/).filter(Boolean);

// 含 id="…" 的那個開始標籤的屬性
function tagAttrs(html, id) {
    const m = html.match(new RegExp(`<[a-zA-Z][\\w-]*\\b[^>]*\\sid="${id}"[^>]*>`));
    assert.ok(m, `找不到 id="${id}" 的開始標籤`);
    return parseAttrs(m[0]);
}

// 從 id="…" 那個元素的開始標籤切到對應的結束標籤（計算同名標籤的巢狀）
function sliceElementById(html, id) {
    const at = html.indexOf(`id="${id}"`);
    assert.notEqual(at, -1, `找不到 id="${id}"`);
    const start = html.lastIndexOf('<', at);
    const tag = html.slice(start + 1).match(/^[a-zA-Z][\w-]*/)[0];
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    re.lastIndex = start;
    let depth = 0;
    for (let m = re.exec(html); m; m = re.exec(html)) {
        depth += m[1] ? -1 : 1;
        if (depth === 0) return html.slice(start, m.index + m[0].length);
    }
    assert.fail(`id="${id}" 的 <${tag}> 沒有結束標籤`);
}

// ---------- 最小 CSS 解析（tools/treasure-map-finder/style.css） ----------
// 把 CSS 攤平成 [{ media, selectors, body }]：media 是外層 @media 的條件，不在 @media 裡就是 null
function cssRules(css) {
    const rules = [];
    const scan = (text, media) => {
        for (const m of text.matchAll(/([^{}]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
            const head = m[1].trim();
            if (head.startsWith('@media')) scan(m[2], head.slice('@media'.length).trim());
            else rules.push({ media, selectors: head.split(',').map((s) => s.trim()), body: m[2] });
        }
    };
    scan(css, null);
    return rules;
}
const styleRules = cssRules(stripComments(read('tools/treasure-map-finder/style.css')));
const MOBILE = '(max-width: 768px)';

// 某個選擇器（在指定的 @media 裡）所有規則的宣告合在一起
function declarations(selector, media = null) {
    const found = styleRules.filter((r) => r.media === media && r.selectors.includes(selector));
    assert.ok(found.length > 0, `style.css 找不到 ${selector}${media ? `（@media ${media}）` : ''} 的規則`);
    return found.map((r) => r.body).join(';');
}

// ---------- script.js 的 TreasureMapFinder ----------
// 照 tests/treasure-room-client.test.js 在 vm 裡載入：script.js 頂層只有類別宣告與 DOMContentLoaded 的監聽
const TreasureMapFinder = (() => {
    const context = vm.createContext({ document: { addEventListener() {} }, window: {} });
    vm.runInContext(read('tools/treasure-map-finder/script.js'), context, { filename: 'script.js' });
    return vm.runInContext('TreasureMapFinder', context);
})();

// 步驟列與清單入口（照 index.html 的結構；兩個入口內容相同，手機那個多了 .tm-bottom-bar）
const STEP_KEYS = ['treasure_map_step_grade', 'treasure_map_step_add', 'treasure_map_step_route'];
const ENTRY_IDS = ['listEntryDesktop', 'listEntryMobile'];
const ENTRY_ACTIONS = ['team', 'hint', 'route'];
function createStepHint(dom) {
    return dom.el('ol', { id: 'stepHint', class: 'tm-steps', role: 'list' }, ...STEP_KEYS.map((key, index) => dom.el('li', index === 0 ? { class: 'current', 'aria-current': 'step' } : {},
        dom.el('span', { class: 'tm-step-num' }, String(index + 1)), dom.el('span', { 'data-i18n': key }, key))));
}
function createListEntry(dom, id) {
    return dom.el('div', { id, class: id === 'listEntryMobile' ? 'tm-list-entry tm-bottom-bar' : 'tm-list-entry' },
        dom.el('button', { type: 'button', class: 'btn btn-ghost', 'data-entry': 'list' }, dom.el('span', { class: 'tm-entry-label' }, '📋 清單')),
        dom.el('button', { type: 'button', class: 'btn hidden', 'data-entry': 'team', 'data-i18n': 'treasure_map_entry_team' }, '組隊'),
        dom.el('span', { class: 'tm-entry-hint hidden', 'data-entry': 'hint', 'data-i18n': 'treasure_map_entry_hint_one' }, '再加 1 張就能排路線'),
        dom.el('button', { type: 'button', class: 'btn btn-primary hidden', 'data-entry': 'route' }, '生成路線'));
}

// 篩選與結果區的頁面替身：fake-dom 裡載入真正的 filter-manager.js 與 script.js，照 index.html 的 id 做出元素，
// 不跑建構函式（同 treasure-room-client 測試用 Object.create），只接上 initFilters() 用到的成員後呼叫它。
// 清單只是替身（list.count 是張數，toggleResult 是 toggle() 的回傳值）；隊伍狀態用 finder.roomCollaboration 設定
function createFilterPage({ url = 'https://ff14.tw/tools/treasure-map-finder/', stored = null, storageThrows = false } = {}) {
    const dom = createFakeDom({ url });
    const storage = new Map(stored ? [['ff14tw_treasure_map_filters', JSON.stringify(stored)]] : []);
    const historyCalls = [];
    const scrolled = [];
    const toasts = [];
    // ModalManager 替身：fake-dom 不支援真正 ModalManager 用到的 :not() 選擇器（ModalManager 本身由 modal-manager-stack 測試負責）。
    // show() 記下 onClose，hide() 呼叫它；這一頁只有清單面板用到它，所以它永遠是最上層
    const modalManager = {
        activeModal: null,
        options: null,
        show(element, options) { this.activeModal = element; this.options = options; element.classList.add('active'); },
        hide() { this.activeModal.classList.remove('active'); this.activeModal = null; this.options.onClose(); }
    };
    Object.assign(dom.window, {
        URLSearchParams, // FilterManager.parseUrl() 用到；fake-dom 預設只有 URL
        history: {
            state: { from: 'test' },
            replaceState(state, title, href) {
                historyCalls.push({ state, title, href: String(href) });
                dom.window.location = new URL(href);
            }
        },
        i18n: { getCurrentLanguage: () => 'zh', onLanguageChange() {} },
        // 測試用 zh 預設文字（同 treasure-room-client 測試）：顯示出來的就是程式裡的預設文字
        FF14Utils: {
            getI18nText: (key, fallback, params = {}) => fallback.replace(/\{(\w+)\}/g, (_, name) => params[name]),
            showToast: (message, type) => toasts.push({ message, type })
        },
        // fake-dom 沒有 firstChild，SecurityUtils.clearElement 在這裡清不掉；用 textContent 清空的替身
        SecurityUtils: { clearElement: (element) => { element.textContent = ''; } },
        zoneManager: { getZoneNames: (zoneId) => zoneNames.get(zoneId) },
        ModalManager: { topmost: () => (modalManager.activeModal ? modalManager : null) },
        // updateListEntry() 讀隊伍的寶圖上限；不載入 room-collaboration.js
        RoomCollaboration: { CONSTANTS: { MAX_MAPS: 8 } }
    });
    if (storageThrows) {
        Object.defineProperty(dom.window, 'localStorage', { get() { throw new Error('SecurityError'); } });
    } else {
        dom.window.localStorage = {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, String(value))
        };
    }
    dom.load('tools/treasure-map-finder/filter-manager.js');
    dom.load('tools/treasure-map-finder/script.js');

    const levelChips = GRADES.map((level) => dom.el('button', { type: 'button', class: 'chip', 'data-level': level, 'aria-pressed': 'false' }, level.toUpperCase()));
    // fake-dom 的元素沒有 scrollIntoView：記下呼叫的對象與參數
    for (const chip of levelChips) chip.scrollIntoView = (options) => scrolled.push({ level: chip.dataset.level, options: JSON.parse(JSON.stringify(options)) });
    const elements = {
        levelTags: dom.el('div', { id: 'levelTags', class: 'tm-chip-scroll', role: 'group' }, ...levelChips),
        zoneTags: dom.el('div', { id: 'zoneTags', class: 'tm-chip-scroll', role: 'group' }),
        clearZonesBtn: dom.el('button', { id: 'clearZonesBtn', class: 'btn btn-ghost btn-sm hidden' }, '清除地區'),
        resultCount: dom.el('p', { id: 'resultCount', class: 'tm-count', tabindex: '-1' }),
        treasureEmpty: dom.el('div', { id: 'treasureEmpty', class: 'empty-state hidden' }),
        treasureGrid: dom.el('div', { id: 'treasureGrid', class: 'treasure-grid' })
    };
    elements.zoneFilterRow = dom.el('div', { id: 'zoneFilterRow', class: 'tm-filter-row hidden' }, elements.zoneTags);
    elements.stepHint = createStepHint(dom);
    for (const id of ENTRY_IDS) elements[id] = createListEntry(dom, id);
    elements.listAnnouncer = dom.el('p', { id: 'listAnnouncer', class: 'visually-hidden', 'aria-live': 'polite' });
    // 清單面板：面板標頭之後是組隊按鈕，底部是總計與「生成路線」
    elements.totalCount = dom.el('span', { id: 'totalCount' }, '0');
    elements.myListPanel = dom.el('div', { id: 'myListPanel', class: 'my-list-panel', role: 'dialog', inert: true },
        dom.el('div', { class: 'panel-header' }, dom.el('button', { id: 'closePanelBtn', class: 'btn btn-close' }, '×')),
        dom.el('div', { id: 'teamActions', class: 'team-actions' },
            dom.el('button', { id: 'createRoomBtn', class: 'btn btn-secondary' }, '建立組隊'),
            dom.el('button', { id: 'joinRoomBtn', class: 'btn btn-secondary' }, '加入隊伍')),
        dom.el('div', { class: 'panel-footer' }, elements.totalCount, dom.el('button', { id: 'generateRouteBtn', class: 'btn btn-primary' }, '生成路線')));
    for (const id of ['stepHint', 'listEntryDesktop', 'levelTags', 'zoneFilterRow', 'clearZonesBtn', 'resultCount', 'treasureEmpty', 'treasureGrid', 'listEntryMobile', 'listAnnouncer']) {
        dom.document.body.appendChild(elements[id]);
    }
    dom.document.body.appendChild(dom.el('div', { id: 'panelOverlay', class: 'panel-overlay' }));
    dom.document.body.appendChild(elements.myListPanel);

    const list = { count: 0, toggleResult: { success: true, action: 'add', message: '已加入清單' } };
    const finder = vm.runInContext('Object.create(TreasureMapFinder.prototype)', dom.window);
    finder.maps = maps;
    finder.filteredMaps = [];
    finder.filterManager = new (vm.runInContext('FilterManager', dom.window))();
    finder.listManager = { getLength: () => list.count, toggle: () => list.toggleResult };
    finder.roomCollaboration = null;
    finder.modalManager = modalManager;
    finder.elements = elements;
    finder.createMapCard = (map) => dom.el('article', { class: 'treasure-card', 'data-map-id': map.id }, map.id);
    finder.renderMyList = finder.updateCardButtons = () => {};
    finder.initFilters();

    const $ = (id) => dom.document.getElementById(id);
    const level = (id) => elements.levelTags.querySelector(`[data-level="${id}"]`);
    const zone = (id) => elements.zoneTags.querySelector(`[data-zone-id="${id}"]`);
    const cardIds = () => elements.treasureGrid.children.map((card) => card.dataset.mapId);
    const stateOf = () => JSON.parse(JSON.stringify(finder.filterManager.getState()));
    // 步驟列每一步的樣子：[號碼, 'done' | 'current' | '', aria-current]
    const steps = () => elements.stepHint.querySelectorAll('li').map((item) => [
        item.querySelector('.tm-step-num').textContent,
        item.classList.contains('done') ? 'done' : item.classList.contains('current') ? 'current' : '',
        item.getAttribute('aria-current')
    ]);
    // 一個入口的樣子：標籤文字＋看得到的動作（沒有就是 null）
    const entryOf = (id) => {
        const entry = elements[id];
        const shown = ENTRY_ACTIONS.filter((action) => !entry.querySelector(`[data-entry="${action}"]`).classList.contains('hidden'));
        assert.ok(shown.length <= 1, `${id} 同時顯示了 ${shown.join('、')}`);
        return { label: entry.querySelector('.tm-entry-label').textContent, action: shown[0] ?? null };
    };
    return { dom, finder, list, toasts, modalManager, storage, historyCalls, scrolled, $, level, zone, cardIds, stateOf, steps, entryOf };
}

// ---------- 測試 ----------
test('寶圖工具的 JS 沒有 console.log，也沒有指向不存在檔案的程式', () => {
    const dir = 'tools/treasure-map-finder';
    // migrate-data.js 是 Node 命令列腳本，console 輸出就是它的介面，頁面不會載入它，所以不檢查
    for (const file of fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.js') && f !== 'migrate-data.js')) {
        assert.doesNotMatch(read(`${dir}/${file}`), /console\.log\(/, file);
    }
    assert.doesNotMatch(read(`${dir}/script.js`), /fullImage/);
    assert.doesNotMatch(read(`${dir}/zone-manager.js`), /generateFullImageFileName|getZoneIdByFilePrefix|filePrefixToZoneId/);
    assert.doesNotMatch(read(`${dir}/room-collaboration.js`), /roomActions/);
});

test('資料來源清單有 G18', () => {
    assert.ok(read('tools/treasure-map-finder/index.html').includes(
        '<li>G18 巨獸革地圖：<a href="https://game8.jp/ff14/709398" target="_blank" rel="noopener noreferrer">https://game8.jp/ff14/709398</a></li>'));
});

test('篩選與結果區：新結構在，舊的地圖群組、重置、載入更多都拿掉', () => {
    const html = read('tools/treasure-map-finder/index.html');
    for (const gone of ['id="mapTags"', 'data-collapse=', 'id="resetFilters"', 'id="loadMore"']) assert.ok(!html.includes(gone), gone);
    for (const id of ['levelTags', 'zoneTags', 'zoneFilterRow', 'clearZonesBtn', 'treasureEmpty', 'resultCount', 'treasureGrid']) assert.ok(html.includes(`id="${id}"`), id);
    for (const id of ['zoneFilterRow', 'clearZonesBtn', 'treasureEmpty']) assert.ok(classesOf(tagAttrs(html, id)).includes('hidden'), id);
    assert.doesNotMatch(html, /id="(zoneFilterRow|clearZonesBtn|treasureEmpty)"[^>]*\shidden[\s>]/);
});

test('等級 chip：7 顆、由新到舊、有 data-i18n 與 aria-pressed，沒有隱藏的等級', () => {
    const tags = [...sliceElementById(read('tools/treasure-map-finder/index.html'), 'levelTags').matchAll(/<button\b[^>]*>/g)].map(m => m[0]);
    assert.deepEqual(tags.map(t => parseAttrs(t)['data-level']), GRADES);
    for (const tag of tags) {
        const a = parseAttrs(tag);
        assert.equal(a['data-i18n'], `treasure_map_grade_${a['data-level']}`);
        assert.equal(a['aria-pressed'], 'false');
        assert.doesNotMatch(tag, /\shidden\b|class="[^"]*\bhidden\b/);
    }
});

test('兩列 chip 是有名稱的群組；結果張數可以接焦點，變了會唸出來；「清除地區」是文字按鈕', () => {
    const html = read('tools/treasure-map-finder/index.html');
    for (const [group, key] of [['levelTags', 'treasure_map_grade_label'], ['zoneTags', 'treasure_map_zone_label']]) {
        const attrs = tagAttrs(html, group);
        assert.equal(attrs.role, 'group', group);
        assert.ok(attrs['aria-labelledby'], `${group} 要用 aria-labelledby 指向列的標籤`);
        assert.equal(tagAttrs(html, attrs['aria-labelledby'])['data-i18n'], key, group);
    }
    assert.ok(sliceElementById(html, 'zoneFilterRow').includes('id="zoneTags"'), '地區 chip 放在地區列裡');
    const count = tagAttrs(html, 'resultCount');
    assert.deepEqual([classesOf(count), count.tabindex, count['aria-live']], [['tm-count'], '-1', 'polite']);
    assert.match(html, /<p\b[^>]*\sid="resultCount"/);
    const clear = tagAttrs(html, 'clearZonesBtn');
    assert.deepEqual(classesOf(clear).sort(), ['btn', 'btn-ghost', 'btn-sm', 'hidden']);
    assert.equal(clear['data-i18n'], 'treasure_map_clear_zones');
    assert.deepEqual(classesOf(tagAttrs(html, 'treasureEmpty')).sort(), ['empty-state', 'hidden']);
});

test('結果張數：等級代號用語言的分隔符號連接', () => {
    const text = (key, fallback, params) => ({ treasure_map_result_count: `${params?.count} 張 ${params?.grades} 寶圖`, treasure_map_list_separator: '、' }[key]);
    assert.equal(TreasureMapFinder.formatResultCount(40, ['g17'], text), '40 張 G17 寶圖');
    assert.equal(TreasureMapFinder.formatResultCount(48, ['g18', 'g17'], text), '48 張 G18、G17 寶圖');
});

test('initFilters：網址優先於 localStorage；改變時記住、用 replaceState 更新網址並保留 room', () => {
    const page = createFilterPage({ url: 'https://ff14.tw/tools/treasure-map-finder/?room=ABC123&grade=g10&zone=yanxia', stored: { levels: ['g17'], zones: [] } });
    const { $, level, zone, historyCalls, storage } = page;

    // 還原網址的 G10＋延夏：chip、地區列、清除鈕、張數與 8 張卡片；只是還原，不寫回網址與 localStorage
    assert.deepEqual(page.stateOf(), { levels: ['g10'], zones: ['yanxia'] });
    assert.deepEqual([level('g10').classList.contains('active'), level('g10').getAttribute('aria-pressed')], [true, 'true']);
    assert.deepEqual([level('g17').classList.contains('active'), level('g17').getAttribute('aria-pressed')], [false, 'false']);
    assert.equal($('zoneFilterRow').classList.contains('hidden'), false);
    assert.equal(zone('yanxia').getAttribute('aria-pressed'), 'true');
    assert.equal($('clearZonesBtn').classList.contains('hidden'), false);
    assert.equal($('resultCount').textContent, '8 張 G10 寶圖');
    assert.deepEqual(page.cardIds(), maps.filter((m) => m.level === 'g10' && m.zoneId === 'yanxia').map((m) => m.id));
    assert.equal($('treasureEmpty').classList.contains('hidden'), true);
    assert.deepEqual(historyCalls, []);
    assert.equal(storage.get('ff14tw_treasure_map_filters'), JSON.stringify({ levels: ['g17'], zones: [] }));
    // 手機上等級列橫向捲動：把已選的等級捲進視野
    assert.deepEqual(page.scrolled, [{ level: 'g10', options: { block: 'nearest', inline: 'center' } }]);

    // 清除地區：網址拿掉 zone、保留 room 與 grade，history.state 原樣傳回；localStorage 記住新狀態；全部 48 張 G10
    $('clearZonesBtn').click();
    assert.equal(historyCalls.length, 1);
    assert.deepEqual(historyCalls[0].state, { from: 'test' });
    assert.equal(historyCalls[0].href, 'https://ff14.tw/tools/treasure-map-finder/?room=ABC123&grade=g10');
    assert.equal(storage.get('ff14tw_treasure_map_filters'), JSON.stringify({ levels: ['g10'], zones: [] }));
    assert.equal($('resultCount').textContent, '48 張 G10 寶圖');
    assert.equal(page.cardIds().length, 48);

    // 多選等級：張數列出兩個等級，網址的 grade 用逗號連接
    level('g17').click();
    assert.equal($('resultCount').textContent, '88 張 G17、G10 寶圖');
    assert.equal(historyCalls.at(-1).href, 'https://ff14.tw/tools/treasure-map-finder/?room=ABC123&grade=g17,g10');

    // 等級都取消：回到「先選寶圖等級」，網址只剩 room
    level('g17').click();
    level('g10').click();
    assert.equal(historyCalls.at(-1).href, 'https://ff14.tw/tools/treasure-map-finder/?room=ABC123');
    assert.equal(storage.get('ff14tw_treasure_map_filters'), JSON.stringify({ levels: [], zones: [] }));
    assert.equal($('zoneFilterRow').classList.contains('hidden'), true);
    assert.equal($('treasureEmpty').classList.contains('hidden'), false);
});

test('空狀態：沒選等級時說明怎麼看等級、不顯示張數；localStorage 不能用時照常運作', () => {
    const page = createFilterPage({ storageThrows: true });
    const { $, level } = page;
    const empty = $('treasureEmpty');

    assert.deepEqual(page.stateOf(), { levels: [], zones: [] });
    assert.equal(empty.classList.contains('hidden'), false);
    assert.equal(empty.querySelector('.empty-state-title').textContent, '先選寶圖等級');
    assert.equal(empty.querySelector('.empty-state-title').dataset.i18n, 'treasure_map_choose_grade_title');
    assert.match(empty.querySelector('.empty-state-text').textContent, /獰豹革是 G17/);
    assert.equal(empty.querySelector('.empty-state-text').dataset.i18n, 'treasure_map_choose_grade_text');
    assert.equal($('resultCount').textContent, '');
    assert.equal(page.cardIds().length, 0);
    assert.equal($('zoneFilterRow').classList.contains('hidden'), true);
    assert.deepEqual(page.scrolled, [], '沒有已選的等級就不捲動');

    // 選了等級：空狀態收起來，列出全部 40 張 G17；寫不進 localStorage 也不丟例外
    assert.doesNotThrow(() => level('g17').click());
    assert.equal(empty.classList.contains('hidden'), true);
    assert.equal($('resultCount').textContent, '40 張 G17 寶圖');
    assert.equal(page.cardIds().length, 40);
    assert.equal(page.cardIds()[0], 'tm_007');
});

test('空狀態：選了等級卻是 0 張時提示清除地區（「清除地區」就在上面的標題列）', () => {
    const { finder, $ } = createFilterPage({ url: 'https://ff14.tw/tools/treasure-map-finder/?grade=g17&zone=yaktel' });
    // 篩選本身選不出 0 張的組合；這裡讓結果是空的，看空狀態怎麼說
    finder.filteredMaps = [];
    finder.displayMaps();
    finder.updateResultCount();
    const empty = $('treasureEmpty');
    assert.equal(empty.classList.contains('hidden'), false);
    assert.equal(empty.querySelector('.empty-state-title').textContent, '這個條件沒有寶圖');
    assert.equal(empty.querySelector('.empty-state-title').dataset.i18n, 'treasure_map_no_results_title');
    assert.equal(empty.querySelector('.empty-state-text').textContent, '試試清除地區篩選。');
    assert.equal(empty.querySelector('.empty-state-text').dataset.i18n, 'treasure_map_no_results_text');
    assert.equal(empty.querySelectorAll('.empty-state-title').length, 1, '重畫時換掉舊的內容');
    assert.equal($('resultCount').textContent, '0 張 G17 寶圖');
    assert.equal($('clearZonesBtn').classList.contains('hidden'), false);
});

test('結果張數只列結果裡真的有的等級：G18＋G17 選烏爾科帕恰是「8 張 G17 寶圖」（en、ja 同一個鍵值）；0 張時列已選的等級', () => {
    const { finder, dom, $, stateOf } = createFilterPage({ url: 'https://ff14.tw/tools/treasure-map-finder/?grade=g18,g17&zone=urqopacha' });
    // 烏爾科帕恰沒有 G18 的寶圖，8 張都是 G17
    assert.deepEqual(stateOf(), { levels: ['g18', 'g17'], zones: ['urqopacha'] });
    assert.equal($('resultCount').textContent, '8 張 G17 寶圖');
    const fill = (text, params) => text.replace(/\{(\w+)\}/g, (_, name) => params[name]);
    for (const [lang, expected] of [['en', '8 G17 maps'], ['ja', 'G17 の地図 8 枚']]) {
        const values = translationValues(TRANSLATIONS, lang);
        dom.window.FF14Utils.getI18nText = (key, fallback, params = {}) => fill(values.get(key) ?? fallback, params);
        finder.updateResultCount();
        assert.equal($('resultCount').textContent, expected, lang);
    }

    // 0 張（篩選本身選不出來，同上一個測試直接讓結果是空的）：沒有「結果裡的等級」，改列已選的等級
    dom.window.FF14Utils.getI18nText = (key, fallback, params = {}) => fill(fallback, params);
    finder.filteredMaps = [];
    finder.updateResultCount();
    assert.equal($('resultCount').textContent, '0 張 G18、G17 寶圖');
});

test('版面：等級與地區兩列在手機上橫向捲動、隱藏捲軸；結果桌機 4 欄、手機 2 欄', () => {
    const scroll = declarations('.tm-chip-scroll', MOBILE);
    assert.match(scroll, /overflow-x:\s*auto/);
    assert.match(scroll, /flex-wrap:\s*nowrap/);
    assert.match(scroll, /scrollbar-width:\s*none/);
    assert.match(declarations('.tm-chip-scroll::-webkit-scrollbar', MOBILE), /display:\s*none/);
    assert.match(declarations('.tm-chip-scroll .chip', MOBILE), /flex:\s*none/);
    assert.match(declarations('.treasure-grid'), /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(declarations('.treasure-grid', MOBILE), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    // 舊的篩選卡、地圖群組與載入更多的樣式一起拿掉
    for (const gone of ['filter-section', 'filter-group', 'map-tag', 'map-tags-grid', 'collapsible-header', 'collapse-indicator', 'collapsed', 'load-more', 'results-header']) {
        const re = new RegExp(`\\.${gone}(?![\\w-])`);
        assert.ok(!styleRules.some((r) => r.selectors.some((s) => re.test(s))), `.${gone} 應已刪除`);
    }
});

test('新增的三語鍵值照設計；舊篩選卡、載入更多的鍵值刪掉', () => {
    const expected = {
        treasure_map_grade_label: ['等級', 'Grade', 'グレード'],
        treasure_map_zone_label: ['地區', 'Zone', 'エリア'],
        treasure_map_clear_zones: ['清除地區', 'Clear zones', 'エリアをクリア'],
        treasure_map_result_count: ['{count} 張 {grades} 寶圖', '{count} {grades} maps', '{grades} の地図 {count} 枚'],
        treasure_map_list_separator: ['、', ', ', '、'],
        treasure_map_choose_grade_title: ['先選寶圖等級', 'Pick your map grade first', 'まず地図のグレードを選んでください'],
        treasure_map_choose_grade_text: [
            '看寶圖名稱裡的皮革就知道等級，例如獰豹革是 G17。選好之後會列出所有符合的寶圖，下次打開也會記得。',
            "The grade is in the map's name, e.g. Timeworn Br'aaxskin Map is G17. Pick it to see every matching map; we'll remember it next time.",
            '地図の名前にグレードが書かれています（例：古ぼけた地図G17）。選ぶと該当する地図がすべて表示され、次回も覚えています。'
        ],
        treasure_map_no_results_title: ['這個條件沒有寶圖', 'No maps match', '該当する地図がありません'],
        treasure_map_no_results_text: ['試試清除地區篩選。', 'Try clearing the zone filter.', 'エリアの絞り込みを解除してみてください。'],
        treasure_map_grade_g18: ['G18 巨獸革', 'G18 Gargantuaskin', 'G18'],
        treasure_map_grade_g17: ['G17 獰豹革', "G17 Br'aaxskin", 'G17'],
        treasure_map_grade_g15: ['G15 蛇牛革', 'G15 Ophiotauroskin', 'G15'],
        treasure_map_grade_g14: ['G14 金毗羅鱷革', 'G14 Kumbhiraskin', 'G14'],
        treasure_map_grade_g12: ['G12 纏尾蛟革', 'G12 Zonureskin', 'G12'],
        treasure_map_grade_g10: ['G10 瞪羚革', 'G10 Gazelleskin', 'G10'],
        treasure_map_grade_g8: ['G8 巨龍革', 'G8 Dragonskin', 'G8']
    };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(expected)) assert.equal(values.get(key), texts[index], `${lang} ${key}`);
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const gone of ['treasure_map_filter_title', 'treasure_map_reset_filters', 'treasure_map_level_filter', 'treasure_map_map_filter', 'treasure_map_multi_select', 'treasure_map_results', 'treasure_map_load_more']) {
            assert.ok(!keys.has(gone), `${lang} 的 ${gone} 應已刪除`);
        }
    });
    // 中文等級名稱就是 treasure-maps.json 的 mapLevels 去掉「地圖」
    const { mapLevels } = require('../data/treasure-maps.json');
    const zh = translationValues(TRANSLATIONS, 'zh');
    for (const level of GRADES) assert.equal(`${zh.get(`treasure_map_grade_${level}`)}地圖`, mapLevels.find((l) => l.id === level).name, level);
});

// ---------- 步驟提示與清單入口（Task 5） ----------
test('getStep：清單 2 張以上第 3 步，選了等級第 2 步，否則第 1 步', () => {
    assert.equal(TreasureMapFinder.getStep({ hasLevels: false, listCount: 0 }), 1);
    assert.equal(TreasureMapFinder.getStep({ hasLevels: true, listCount: 1 }), 2);
    assert.equal(TreasureMapFinder.getStep({ hasLevels: false, listCount: 2 }), 3);
});

test('getListEntryState：0／1／≥2 張與隊伍模式（Review Focus 1）', () => {
    // vm 裡建出來的物件原型和這裡不同，先轉成這邊的物件再比（同 stateOf）
    const s = (count, inRoom) => JSON.parse(JSON.stringify(TreasureMapFinder.getListEntryState({ count, inRoom, maxMaps: 8 })));
    assert.deepEqual(s(0, false), { labelKey: 'treasure_map_entry_empty', labelParams: {}, action: 'team' });
    assert.deepEqual(s(1, false), { labelKey: 'treasure_map_entry_count', labelParams: { count: 1 }, action: 'hint' });
    assert.deepEqual(s(3, false), { labelKey: 'treasure_map_entry_count', labelParams: { count: 3 }, action: 'route' });
    assert.deepEqual(s(0, true), { labelKey: 'treasure_map_entry_room', labelParams: { count: 0, max: 8 }, action: null });
    assert.deepEqual(s(1, true), { labelKey: 'treasure_map_entry_room', labelParams: { count: 1, max: 8 }, action: 'hint' });
    assert.deepEqual(s(5, true), { labelKey: 'treasure_map_entry_room', labelParams: { count: 5, max: 8 }, action: 'route' });
});

test('操作列拿掉；組隊與隊伍狀態在清單面板裡；入口、步驟列、唸出區都在', () => {
    const html = read('tools/treasure-map-finder/index.html');
    assert.ok(!html.includes('top-action-bar') && !html.includes('id="myListToggle"'));
    const panel = sliceElementById(html, 'myListPanel');
    assert.ok(panel.includes('id="teamActions"') && panel.includes('id="roomSection"'));
    assert.equal((panel.match(/class="[^"]*\bbtn-primary\b/g) || []).length, 1);
    for (const id of ['stepHint', 'listEntryDesktop', 'listEntryMobile']) assert.ok(html.includes(`id="${id}"`), id);
    assert.match(html, /id="listAnnouncer"[^>]*aria-live="polite"/);
});

test('手機版把回到頂端按鈕移到底部列上方', () => {
    assert.match(declarations('.back-to-top', '(max-width: 768px)'), /bottom:/);
});

test('頁面結構：步驟列與桌機入口在 main 最上面、手機底部列在 main 之後；組隊在面板標頭之後、頁籤之前', () => {
    const html = read('tools/treasure-map-finder/index.html');
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    // main 裡第一個看得到的東西就是最上面那一列（前面只有視覺隱藏的 h1），裡面左邊步驟列、右邊桌機入口
    assert.ok(main.includes('class="tm-top-row"') && main.indexOf('class="tm-top-row"') < main.indexOf('class="tool-content"'));
    const topRow = html.slice(html.indexOf('class="tm-top-row"'), html.indexOf('class="tool-content"'));
    assert.ok(topRow.includes('id="stepHint"') && topRow.indexOf('id="stepHint"') < topRow.indexOf('id="listEntryDesktop"'));
    assert.ok(html.indexOf('id="listEntryMobile"') > html.indexOf('</main>'));
    assert.deepEqual(classesOf(tagAttrs(html, 'listEntryDesktop')), ['tm-list-entry']);
    assert.deepEqual(classesOf(tagAttrs(html, 'listEntryMobile')), ['tm-list-entry', 'tm-bottom-bar']);
    assert.deepEqual(classesOf(tagAttrs(html, 'listAnnouncer')), ['visually-hidden']);

    // 步驟列：有名稱的有序清單，3 步各有號碼與文字
    const stepHint = tagAttrs(html, 'stepHint');
    assert.deepEqual(classesOf(stepHint), ['tm-steps']);
    assert.match(html, /<ol\b[^>]*\sid="stepHint"/);
    assert.equal(stepHint['data-i18n'], 'treasure_map_steps_label');
    assert.equal(stepHint['data-i18n-attr'], 'aria-label');
    assert.equal(stepHint['aria-label'], '使用步驟');
    const items = [...sliceElementById(html, 'stepHint').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    assert.equal(items.length, 3);
    items.forEach((item, index) => {
        assert.match(item, new RegExp(`<span class="tm-step-num">${index + 1}</span>`));
        assert.match(item, new RegExp(`data-i18n="${STEP_KEYS[index]}"`));
    });

    // 兩個入口內容相同：清單（文字按鈕＋標籤）、組隊、提示、生成路線；後三個先藏起來
    for (const id of ENTRY_IDS) {
        const entry = sliceElementById(html, id);
        const parts = Object.fromEntries([...entry.matchAll(/<(button|span)\b[^>]*\sdata-entry="(\w+)"[^>]*>/g)].map((m) => [m[2], { tag: m[1], attrs: parseAttrs(m[0]) }]));
        assert.deepEqual(Object.keys(parts), ['list', 'team', 'hint', 'route'], id);
        assert.deepEqual([parts.list.tag, classesOf(parts.list.attrs)], ['button', ['btn', 'btn-ghost']], id);
        assert.match(entry, /data-entry="list"[^>]*>\s*<span class="tm-entry-label">/, `${id} 的清單按鈕裡有標籤`);
        assert.doesNotMatch(entry, /class="tm-entry-label"[^>]*data-i18n/, '標籤帶 {count} 參數，由 JS 填入，不能用 data-i18n');
        assert.deepEqual([parts.team.tag, classesOf(parts.team.attrs), parts.team.attrs['data-i18n']], ['button', ['btn', 'hidden'], 'treasure_map_entry_team'], id);
        assert.deepEqual([parts.hint.tag, classesOf(parts.hint.attrs), parts.hint.attrs['data-i18n']], ['span', ['tm-entry-hint', 'hidden'], 'treasure_map_entry_hint_one'], id);
        assert.deepEqual([parts.route.tag, classesOf(parts.route.attrs)], ['button', ['btn', 'btn-primary', 'hidden']], id);
        assert.match(entry, /data-entry="route"[\s\S]*data-i18n="treasure_map_generate_route"/, `${id} 的生成路線沿用原本的鍵值`);
    }

    // 清單面板：組隊與隊伍狀態在標頭之後、頁籤之前；建立組隊改成次要按鈕（面板的主要按鈕留給生成路線）
    const panel = sliceElementById(html, 'myListPanel');
    const order = ['class="panel-header"', 'id="teamActions"', 'id="roomSection"', 'id="panelTabs"', 'id="generateRouteBtn"'].map((s) => panel.indexOf(s));
    assert.ok(!order.includes(-1), `面板裡缺東西：${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `面板裡的順序：${order}`);
    assert.deepEqual(classesOf(tagAttrs(html, 'createRoomBtn')), ['btn', 'btn-secondary']);
    assert.deepEqual(classesOf(tagAttrs(html, 'joinRoomBtn')), ['btn', 'btn-secondary']);
    // 中間（組隊、隊伍狀態、頁籤、清單、歷史）包在一起捲動，標頭與底部的「生成路線」留在外面固定
    const bodyStart = panel.indexOf('<div class="panel-body">');
    assert.notEqual(bodyStart, -1);
    const body = (() => {
        const re = /<(\/?)div\b[^>]*>/g;
        re.lastIndex = bodyStart;
        let depth = 0;
        for (let m = re.exec(panel); m; m = re.exec(panel)) {
            depth += m[1] ? -1 : 1;
            if (depth === 0) return panel.slice(bodyStart, m.index + m[0].length);
        }
        return assert.fail('.panel-body 沒有結束標籤');
    })();
    for (const id of ['teamActions', 'roomSection', 'panelTabs', 'listContent', 'historyContent']) assert.ok(body.includes(`id="${id}"`), `${id} 在 .panel-body 裡`);
    for (const outside of ['class="panel-header"', 'class="panel-footer"', 'id="generateRouteBtn"']) assert.ok(!body.includes(outside), `${outside} 不在 .panel-body 裡`);
    const panelBody = declarations('.panel-body');
    for (const re of [/flex:\s*1/, /min-height:\s*0/, /overflow-y:\s*auto/]) assert.match(panelBody, re);
});

test('步驟列：還原出來的等級是第 2 步；選、取消等級時跟著換', () => {
    const page = createFilterPage({ url: 'https://ff14.tw/tools/treasure-map-finder/?grade=g17' });
    assert.deepEqual(page.steps(), [['✓', 'done', null], ['2', 'current', 'step'], ['3', '', null]]);
    page.level('g17').click();
    assert.deepEqual(page.steps(), [['1', 'current', 'step'], ['2', '', null], ['3', '', null]]);
    page.level('g10').click();
    assert.deepEqual(page.steps(), [['✓', 'done', null], ['2', 'current', 'step'], ['3', '', null]]);
});

test('清單入口：0 張「組隊」、1 張提示、2 張以上「生成路線」；隊伍裡顯示「隊伍清單 N/8」，0 張不放動作（Review Focus 1）', () => {
    const page = createFilterPage({ url: 'https://ff14.tw/tools/treasure-map-finder/?grade=g17' });
    const { finder, list, $ } = page;
    const both = () => ENTRY_IDS.map((id) => page.entryOf(id));
    const show = (count, room = null) => {
        list.count = count;
        finder.roomCollaboration = room;
        finder.updateListCount();
    };

    show(0);
    assert.deepEqual(both(), Array(2).fill({ label: '📋 清單', action: 'team' }));
    assert.equal($('totalCount').textContent, '0');
    assert.equal($('generateRouteBtn').disabled, true);

    show(1);
    assert.deepEqual(both(), Array(2).fill({ label: '📋 清單 1 張', action: 'hint' }));
    assert.equal($('generateRouteBtn').disabled, true);
    assert.deepEqual(page.steps(), [['✓', 'done', null], ['2', 'current', 'step'], ['3', '', null]]);

    show(3);
    assert.deepEqual(both(), Array(2).fill({ label: '📋 清單 3 張', action: 'route' }));
    assert.equal($('totalCount').textContent, '3');
    assert.equal($('generateRouteBtn').disabled, false);
    assert.deepEqual(page.steps(), [['✓', 'done', null], ['✓', 'done', null], ['3', 'current', 'step']]);

    // 用 ?room= 加入隊伍、清單是空的：入口就是「你在隊伍裡」的提示，沒有「組隊」
    show(0, { currentRoom: { roomCode: 'ABC123' } });
    assert.deepEqual(both(), Array(2).fill({ label: '👥 隊伍清單 0/8', action: null }));
    show(1, { currentRoom: { roomCode: 'ABC123' } });
    assert.deepEqual(both(), Array(2).fill({ label: '👥 隊伍清單 1/8', action: 'hint' }));
    show(5, { currentRoom: { roomCode: 'ABC123' } });
    assert.deepEqual(both(), Array(2).fill({ label: '👥 隊伍清單 5/8', action: 'route' }));

    // 往回走：從第 3 步回到第 2 步時，第 3 步的號碼與狀態都還原
    show(1);
    assert.deepEqual(page.steps(), [['✓', 'done', null], ['2', 'current', 'step'], ['3', '', null]]);
});

test('張數改變時唸出加入或移除，第一次只記下張數', () => {
    const { finder, list, $ } = createFilterPage();
    const announcer = $('listAnnouncer');
    list.count = 2;
    finder.updateListCount();
    assert.equal(announcer.textContent, '', '載入時不唸');
    list.count = 3;
    finder.updateListCount();
    assert.equal(announcer.textContent, '已加入清單，共 3 張');
    list.count = 2;
    finder.updateListCount();
    assert.equal(announcer.textContent, '已從清單移除，剩 2 張');
    // 張數沒變（例如進出隊伍時重畫入口）就不換內容
    finder.updateListCount();
    assert.equal(announcer.textContent, '已從清單移除，剩 2 張');
});

test('加入、移除成功不跳 toast，改由清單入口與唸出區更新；失敗照舊跳 toast', () => {
    const { finder, list, toasts, $ } = createFilterPage();
    finder.updateListCount();
    list.count = 1;
    list.toggleResult = { success: true, action: 'add', message: '已加入清單' };
    finder.toggleMapInList(maps[0]);
    assert.deepEqual(toasts, []);
    assert.equal($('listAnnouncer').textContent, '已加入清單，共 1 張');
    assert.equal(finder.elements.listEntryDesktop.querySelector('.tm-entry-label').textContent, '📋 清單 1 張');

    list.count = 0;
    list.toggleResult = { success: true, action: 'remove', message: '已從清單移除' };
    finder.toggleMapInList(maps[0]);
    assert.deepEqual(toasts, []);
    assert.equal($('listAnnouncer').textContent, '已從清單移除，剩 0 張');

    list.toggleResult = { success: false, message: '清單已滿' };
    finder.toggleMapInList(maps[0]);
    assert.deepEqual(toasts, [{ message: '清單已滿', type: 'error' }]);
});

test('入口按鈕：清單打開面板；組隊打開面板並把焦點移到「建立組隊」；生成路線打開面板再排路線', () => {
    const page = createFilterPage();
    const { finder, list, modalManager, $, dom } = page;
    const panel = $('myListPanel');
    const routeCalls = [];
    finder.generateRoute = () => routeCalls.push(dom.document.activeElement.id);
    finder.setupListEntries();
    finder.updateListCount();
    const button = (id, action) => finder.elements[id].querySelector(`[data-entry="${action}"]`);

    // fake-dom 的節點用身分（===）比、訊息自己寫：assert.equal 失敗時會把兩個節點連同整頁的 DOM 展開成訊息，要格式化很久
    for (const id of ENTRY_IDS) {
        button(id, 'list').click();
        assert.ok(modalManager.activeModal === panel, `${id}：按清單後面板應該開著`);
        assert.deepEqual([panel.inert, $('panelOverlay').classList.contains('active'), dom.document.body.style.overflow], [false, true, 'hidden'], id);
        // 已經開著再開一次不會重開（冪等）
        finder.openListPanel();
        assert.ok(modalManager.activeModal === panel, `${id}：再開一次，面板還是開著`);
        finder.toggleListPanel();
        assert.deepEqual([modalManager.activeModal === null, panel.inert, $('panelOverlay').classList.contains('active'), dom.document.body.style.overflow], [true, true, false, ''], id);
        assert.doesNotThrow(() => finder.closeListPanel(), '已經關著再關一次什麼都不做');

        button(id, 'team').click();
        assert.ok(modalManager.activeModal === panel, `${id}：按組隊後面板應該開著`);
        assert.equal(dom.document.activeElement.id, 'createRoomBtn', `${id}：組隊後焦點在建立組隊`);
        finder.closeListPanel();
    }

    list.count = 2;
    finder.updateListCount();
    for (const id of ENTRY_IDS) {
        button(id, 'route').click();
        assert.ok(modalManager.activeModal === panel, `${id}：按生成路線後面板應該開著`);
        finder.closeListPanel();
    }
    // 排路線時焦點在面板裡的「生成路線」：關掉疊在上面的路線面板時焦點回到那裡
    assert.deepEqual(routeCalls, ['generateRouteBtn', 'generateRouteBtn']);
});

test('打開面板的入口按鈕收起來時（例如按「組隊」後建了隊伍），關面板把焦點放回看得到的清單按鈕', () => {
    const { finder, modalManager, dom } = createFilterPage();
    // fake-dom 沒有版面：帶 .hidden 的與桌機上的底部列都當作沒有畫出來
    for (const id of ENTRY_IDS) {
        for (const element of finder.elements[id].querySelectorAll('[data-entry]')) {
            element.getClientRects = () => (element.classList.contains('hidden') || id === 'listEntryMobile' ? [] : [{}]);
        }
    }
    finder.setupListEntries();
    finder.updateListCount();
    const team = finder.elements.listEntryDesktop.querySelector('[data-entry="team"]');
    team.focus();
    team.click();
    finder.roomCollaboration = { currentRoom: { roomCode: 'ABC123' } };
    finder.updateListCount();
    assert.ok(team.classList.contains('hidden'));
    modalManager.hide();
    assert.ok(dom.document.activeElement === finder.elements.listEntryDesktop.querySelector('[data-entry="list"]'), '焦點應該回到桌機入口的清單按鈕');
});

test('桌機的步驟列捲動時固定在頂端、手機改用固定在底部的入口；兩者都排在頁首的工具面板下面（R5）', () => {
    const top = declarations('.tm-top-row');
    assert.match(top, /position:\s*sticky/);
    assert.match(top, /top:\s*0/);
    assert.match(top, /z-index:\s*calc\(var\(--z-header\) - 1\)/);
    assert.match(top, /background:\s*var\(--color-bg\)/);
    assert.match(declarations('.tm-top-row', MOBILE), /position:\s*static/);
    assert.match(declarations('#listEntryDesktop', MOBILE), /display:\s*none/);
    assert.match(declarations('.tm-bottom-bar'), /display:\s*none/);
    const bar = declarations('.tm-bottom-bar', MOBILE);
    for (const re of [/display:\s*flex/, /position:\s*fixed/, /bottom:\s*0/, /z-index:\s*calc\(var\(--z-header\) - 1\)/, /env\(safe-area-inset-bottom\)/]) assert.match(bar, re);
    // 頁面最下面留出底部列的高度：頁尾最後一行捲到底也不會被蓋住
    assert.match(declarations('body', MOBILE), /padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)/);
    // 舊的操作列樣式一起拿掉
    for (const gone of ['top-action-bar', 'action-bar-left', 'action-bar-right', 'my-list-toggle', 'list-count']) {
        const re = new RegExp(`\\.${gone}(?![\\w-])`);
        assert.ok(!styleRules.some((r) => r.selectors.some((s) => re.test(s))), `.${gone} 應已刪除`);
    }
});

test('鍵盤焦點捲進畫面時不被固定的列蓋住：桌機避開頂端那一列（換成兩行時的高度）、手機避開底部列（WCAG 2.4.11）', () => {
    // 桌機：內容裡的元素帶 scroll-margin-top = 頂端那一列兩行高（內距＋步驟號碼＋換行間距＋按鈕）再加焦點外框的空間；手機那一列不固定，歸零
    for (const selector of ['.tool-content *', '.source-section *']) {
        assert.match(declarations(selector), /scroll-margin-top:\s*calc\(4 \* var\(--space-2\) \+ var\(--space-6\) \+ var\(--control-md\)\)/, selector);
        assert.match(declarations(selector, MOBILE), /scroll-margin-top:\s*0/, selector);
    }
    // 手機：根元素的 scroll-padding-bottom = 底部列的高度再加焦點外框的空間（頁尾的連結也算進去）
    assert.match(declarations('html', MOBILE), /scroll-padding-bottom:\s*calc\(var\(--control-md\) \+ 3 \* var\(--space-2\) \+ env\(safe-area-inset-bottom\)\)/);
    // 不用根元素的 scroll-padding-top：頂端那一列自己的按鈕拿到焦點時（關掉清單面板、焦點回到入口），整頁會往上跳
    assert.ok(!styleRules.some((r) => /scroll-padding-top/.test(r.body)), 'style.css 不得用 scroll-padding-top');
});

test('步驟列與清單入口的三語鍵值照設計', () => {
    const expected = {
        treasure_map_steps_label: ['使用步驟', 'Steps', '手順'],
        treasure_map_step_grade: ['選等級', 'Pick a grade', 'グレードを選ぶ'],
        treasure_map_step_add: ['加入清單', 'Add maps', 'リストに追加'],
        treasure_map_step_route: ['生成路線', 'Plan a route', 'ルートを作成'],
        treasure_map_entry_empty: ['📋 清單', '📋 List', '📋 リスト'],
        treasure_map_entry_count: ['📋 清單 {count} 張', '📋 List: {count}', '📋 リスト {count} 枚'],
        treasure_map_entry_room: ['👥 隊伍清單 {count}/{max}', '👥 Team list {count}/{max}', '👥 チームリスト {count}/{max}'],
        treasure_map_entry_team: ['組隊', 'Team up', 'チームを組む'],
        treasure_map_entry_hint_one: ['再加 1 張就能排路線', 'Add 1 more map to plan a route', 'あと 1 枚でルートを作れます'],
        // 英文不帶單位：「(1 maps)」單複數不對，又不想為了它加複數規則
        treasure_map_announce_added: ['已加入清單，共 {count} 張', 'Added to the list. Total: {count}', 'リストに追加しました（{count} 枚）'],
        treasure_map_announce_removed: ['已從清單移除，剩 {count} 張', 'Removed from the list. Remaining: {count}', 'リストから削除しました（残り {count} 枚）']
    };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(expected)) assert.equal(values.get(key), texts[index], `${lang} ${key}`);
    });
});
