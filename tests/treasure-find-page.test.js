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

// 篩選與結果區的頁面替身：fake-dom 裡載入真正的 filter-manager.js 與 script.js，照 index.html 的 id 做出元素，
// 不跑建構函式（同 treasure-room-client 測試用 Object.create），只接上 initFilters() 用到的成員後呼叫它
function createFilterPage({ url = 'https://ff14.tw/tools/treasure-map-finder/', stored = null, storageThrows = false } = {}) {
    const dom = createFakeDom({ url });
    const storage = new Map(stored ? [['ff14tw_treasure_map_filters', JSON.stringify(stored)]] : []);
    const historyCalls = [];
    const scrolled = [];
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
        FF14Utils: { getI18nText: (key, fallback, params = {}) => fallback.replace(/\{(\w+)\}/g, (_, name) => params[name]) },
        // fake-dom 沒有 firstChild，SecurityUtils.clearElement 在這裡清不掉；用 textContent 清空的替身
        SecurityUtils: { clearElement: (element) => { element.textContent = ''; } },
        zoneManager: { getZoneNames: (zoneId) => zoneNames.get(zoneId) }
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
    for (const id of ['levelTags', 'zoneFilterRow', 'clearZonesBtn', 'resultCount', 'treasureEmpty', 'treasureGrid']) dom.document.body.appendChild(elements[id]);

    const finder = vm.runInContext('Object.create(TreasureMapFinder.prototype)', dom.window);
    finder.maps = maps;
    finder.filteredMaps = [];
    finder.filterManager = new (vm.runInContext('FilterManager', dom.window))();
    finder.elements = elements;
    finder.createMapCard = (map) => dom.el('article', { class: 'treasure-card', 'data-map-id': map.id }, map.id);
    finder.initFilters();

    const $ = (id) => dom.document.getElementById(id);
    const level = (id) => elements.levelTags.querySelector(`[data-level="${id}"]`);
    const zone = (id) => elements.zoneTags.querySelector(`[data-zone-id="${id}"]`);
    const cardIds = () => elements.treasureGrid.children.map((card) => card.dataset.mapId);
    const stateOf = () => JSON.parse(JSON.stringify(finder.filterManager.getState()));
    return { dom, finder, storage, historyCalls, scrolled, $, level, zone, cardIds, stateOf };
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
