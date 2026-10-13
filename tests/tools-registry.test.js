const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ToolsRegistry = require('../assets/js/components/tools-registry.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const LANGS = ['zh', 'en', 'ja'];
const COMMON_FILE = 'assets/js/i18n/translations/common.js';
const INDEX_FILE = 'assets/js/i18n/translations/index.js';

// ---------- 最小 HTML 解析（只給首頁工具卡的比對用，不假設屬性順序或固定的標籤字串） ----------
function parseAttrs(source) {
    const attrs = {};
    for (const m of source.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = m[2] ?? m[3];
    return attrs;
}
// 依出現順序列出 html 裡 class 含 cls 的所有元素：{ tag, attrs, inner }。
// inner 用同名標籤的巢狀深度找對應的結束標籤，所以元素被包在別的元素裡也找得到
function elementsByClass(html, cls) {
    const found = [];
    for (const open of html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
        const attrs = parseAttrs(open[2]);
        if (!(attrs.class || '').split(/\s+/).includes(cls)) continue;
        const tag = open[1];
        const start = open.index + open[0].length;
        let end = html.length;
        let depth = 1;
        for (const t of html.slice(start).matchAll(new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g'))) {
            depth += t[1] ? -1 : 1;
            if (depth === 0) { end = start + t.index; break; }
        }
        found.push({ tag, attrs, inner: html.slice(start, end) });
    }
    return found;
}
// 卡片的標題與圖示都要是純文字：標題帶 data-i18n，I18nManager 用 textContent 整個覆寫，裡面的子元素切換語言時就會消失；
// 圖示要和登錄表逐字相同。所以先確認沒有標籤，再去掉前後空白
const textOf = (inner) => {
    assert.doesNotMatch(inner, /</, `不能有子元素：${inner.trim()}`);
    return inner.trim();
};

const EXPECTED = [
    ['mini-cactpot', 'tools/mini-cactpot/index.html', '🎰', 'tool_mini_cactpot_title', '仙人微彩計算機'],
    ['wondrous-tails', 'tools/wondrous-tails/index.html', '📋', 'tool_wondrous_tails_title', '天書奇談預測器'],
    ['dungeon-database', 'tools/dungeon-database/index.html', '🏰', 'tool_dungeon_database_title', '副本資料庫'],
    ['character-card', 'tools/character-card/index.html', '🎴', 'tool_character_card_title', '角色卡產生器'],
    ['faux-hollows-foxes', 'tools/faux-hollows-foxes/index.html', '🦊', 'tool_faux_hollows_title', '宗長計算機'],
    ['treasure-map-finder', 'tools/treasure-map-finder/index.html', '🗺️', 'tool_treasure_map_title', '寶圖搜尋器'],
    ['lodestone-lookup', 'tools/lodestone-lookup/index.html', '🔍', 'tool_lodestone_title', 'Lodestone 角色查詢'],
    ['timed-gathering', 'tools/timed-gathering/index.html', '⏰', 'tool_timed_gathering_title', '特殊採集時間管理器'],
    ['guide', 'tools/guide/index.html', '📖', 'tool_guide_title', '攻略資料'],
    ['report-generator', 'tools/report-generator/index.html', '📝', 'tool_report_generator_title', '檢舉模板產生器'],
    ['macro-converter', 'tools/macro-converter/index.html', '🔄', 'tool_macro_converter_title', '巨集轉換器'],
    ['weather-forecast', 'tools/weather-forecast/index.html', '🌤️', 'tool_weather_forecast_title', '天氣預報'],
    ['tc-shop', 'https://tc-shop.ff14.tw', '🛒', 'tool_tc_shop_title', '水晶商城清單'],
];
// 圖示要和 index.html 的位元組完全相同：🗺️ 是 U+1F5FA U+FE0F，🌤️ 是 U+1F324 U+FE0F

test('ToolsRegistry 依首頁順序列出 13 個工具', () => {
    assert.deepEqual(ToolsRegistry.tools.map(t => [t.id, t.href, t.icon, t.i18nKey, t.name]), EXPECTED);
    assert.ok(Object.isFrozen(ToolsRegistry.tools));
});

test('站內工具的 href 檔案存在，只有水晶商城是外部網站', () => {
    const external = ToolsRegistry.tools.filter(t => t.external === true);
    assert.deepEqual(external.map(t => t.id), ['tc-shop']);
    assert.match(external[0].href, /^https:\/\//);

    for (const tool of ToolsRegistry.tools.filter(t => t.external !== true)) {
        assert.doesNotMatch(tool.href, /^[a-z][a-z0-9+.-]*:/i, `${tool.id} 的 href 是外部網址，卻沒有標 external: true`);
        assert.ok(fs.existsSync(path.join(ROOT, tool.href)), `${tool.id} 的 ${tool.href} 檔案不存在`);
    }
});

test('工具名稱鍵在 common.js 的 zh/en/ja 都有翻譯，zh 與登錄表的 name 相同', () => {
    const values = Object.fromEntries(LANGS.map(lang => [lang, translationValues(COMMON_FILE, lang)]));
    assert.ok(values.zh.size > 0, `解析不到 ${COMMON_FILE} 的 zh 語系，測試可能失效`);

    for (const tool of ToolsRegistry.tools) {
        for (const lang of LANGS) {
            assert.ok(values[lang].get(tool.i18nKey), `${COMMON_FILE} 的 ${lang} 語系缺少 ${tool.i18nKey}`);
        }
        assert.equal(values.zh.get(tool.i18nKey), tool.name, `${tool.i18nKey} 的 zh 值要和登錄表的 name 相同`);
    }

    // 站長決定改名的兩個工具：三個語系都要統一
    const RENAMED = {
        tool_faux_hollows_title: { en: 'Faux Hollows Calculator', ja: '幻フォールスホロー計算機' },
        tool_tc_shop_title: { en: 'Crystal Shop List', ja: 'クリスタルショップリスト' },
    };
    for (const [key, names] of Object.entries(RENAMED)) {
        assert.equal(values.en.get(key), names.en, `${key} 的 en 名稱`);
        assert.equal(values.ja.get(key), names.ja, `${key} 的 ja 名稱`);
    }
});

test('index.js 不再定義登錄表的 13 個名稱鍵', () => {
    for (const lang of LANGS) {
        const keys = translationKeySet(INDEX_FILE, lang);
        assert.ok(keys.size > 0, `解析不到 ${INDEX_FILE} 的 ${lang} 語系，測試可能失效`);
        for (const tool of ToolsRegistry.tools) {
            assert.ok(!keys.has(tool.i18nKey), `${INDEX_FILE} 的 ${lang} 語系不該再定義 ${tool.i18nKey}（已搬到 common.js）`);
        }
    }
});

test('findByPath 以工具目錄比對路徑開頭', () => {
    const id = (p) => ToolsRegistry.findByPath(p)?.id ?? null;
    assert.equal(id('/tools/weather-forecast/index.html'), 'weather-forecast');
    assert.equal(id('/tools/weather-forecast/'), 'weather-forecast');
    assert.equal(id('/tools/guide/chocobo.html'), 'guide');
    assert.equal(id('/tools/weather-forecast-x/'), null);
    assert.equal(id('/tools/unknown/'), null);
    for (const p of ['/', '/index.html', '/about.html', '/changelog.html', '/404.html']) assert.equal(id(p), null);
    // 每個站內工具自己的頁面都要找得到自己
    for (const tool of ToolsRegistry.tools.filter(t => t.external !== true)) assert.equal(id('/' + tool.href), tool.id);
    assert.equal(ToolsRegistry.findById('tc-shop').external, true);
    assert.equal(ToolsRegistry.findById('nope'), null);
});

test('首頁的工具卡和登錄表一一對應（順序、href、標題鍵、zh 標題、圖示）', () => {
    // 只有 <a> 才是可點的工具卡；<div class="tool-card coming-soon"> 這種即將推出的卡片不在登錄表裡
    const cards = elementsByClass(read('index.html'), 'tool-card').filter(el => el.tag === 'a');
    assert.equal(cards.length, ToolsRegistry.tools.length, '首頁的工具卡數量要等於登錄表');

    cards.forEach((card, i) => {
        const tool = ToolsRegistry.tools[i];
        const title = elementsByClass(card.inner, 'tool-title')[0];
        const icon = elementsByClass(card.inner, 'tool-icon')[0];
        assert.ok(title && icon, `第 ${i + 1} 張卡（${tool.id}）缺少 .tool-title 或 .tool-icon`);
        assert.equal(card.attrs.href, tool.href, `第 ${i + 1} 張卡的 href`);
        assert.equal(title.attrs['data-i18n'], tool.i18nKey, `${tool.id} 卡片標題的 data-i18n`);
        assert.equal(textOf(title.inner), tool.name, `${tool.id} 卡片的 zh 標題`);
        assert.equal(textOf(icon.inner), tool.icon, `${tool.id} 卡片的圖示`);
    });
});
