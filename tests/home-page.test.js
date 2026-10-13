const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const LANGS = ['zh', 'en', 'ja'];
const COMMON_FILE = 'assets/js/i18n/translations/common.js';
const INDEX_FILE = 'assets/js/i18n/translations/index.js';

const html = read('index.html');

// ---------- 最小 HTML 解析（只解析字串，不需要 DOM；不假設屬性順序） ----------
function parseAttrs(source) {
    const attrs = {};
    for (const m of source.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = m[2] ?? m[3];
    return attrs;
}
const classesOf = (attrs) => (attrs.class || '').split(/\s+/).filter(Boolean);

// 首頁所有的 a.tool-card，依出現順序：{ attrs, inner }（卡片裡沒有巢狀的 <a>）
function toolCards(source) {
    const cards = [];
    for (const m of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
        const attrs = parseAttrs(m[1]);
        if (classesOf(attrs).includes('tool-card')) cards.push({ attrs, inner: m[2] });
    }
    return cards;
}
const cards = toolCards(html);
// 以 href 取卡片（站長決定的內容都掛在特定工具上，不靠順序）
function cardByHref(href) {
    const card = cards.find((c) => c.attrs.href === href);
    assert.ok(card, `首頁找不到 href="${href}" 的工具卡`);
    return card;
}

// 卡片裡的開始標籤，依出現順序：{ tag, attrs, text }。text 是開始標籤到下一個 < 之間的文字；
// h3、span、p 都是葉節點，所以就是完整文字
function elementsOf(inner) {
    return [...inner.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>([^<]*)/g)].map((m) => ({ tag: m[1], attrs: parseAttrs(m[2]), text: m[3].trim() }));
}
const withClass = (elements, cls) => elements.filter((el) => classesOf(el.attrs).includes(cls));

// 卡片的結構：每個開始標籤寫成「標籤.部位」（沒有部位 class 的只寫標籤），結束標籤寫成「/標籤」
const PARTS = ['tool-icon', 'tool-heading', 'tool-title', 'tool-tag', 'tool-description', 'tool-status'];
function skeleton(inner) {
    return [...inner.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g)].map(([, close, tag, rest]) => {
        if (close) return `/${tag}`;
        const part = classesOf(parseAttrs(rest)).find((c) => PARTS.includes(c));
        return part ? `${tag}.${part}` : tag;
    }).join(' ');
}

// ---------- 站長決定的標示（spec 6.8）；沒列在這裡的卡片不帶標籤、也沒有「缺什麼」說明 ----------
const TAGS = {
    'tools/character-card/index.html': { key: 'status_under_construction', classes: ['tag', 'tag-warning', 'tool-tag'] },
    'tools/lodestone-lookup/index.html': { key: 'status_intl_only', classes: ['tag', 'tag-info', 'tool-tag'] },
    'https://tc-shop.ff14.tw': { key: 'tag_external_site', classes: ['tag', 'tool-tag'] }
};
// 依在頁面上出現的順序
const STATUS_LINES = [
    ['tools/dungeon-database/index.html', 'status_dungeon_mechanics_pending'],
    ['tools/guide/index.html', 'status_guide_pages_pending']
];

const NEW_TEXTS = {
    status_intl_only: { zh: '僅限國際版角色', en: 'Global servers only', ja: 'グローバル版キャラクターのみ' },
    status_dungeon_mechanics_pending: { zh: '部分副本的機制說明待補', en: 'Some dungeon mechanics are not written yet', ja: '一部ダンジョンのギミック解説は準備中' },
    status_guide_pages_pending: { zh: '公會、副本、風脈、探索筆記 4 頁撰寫中', en: 'Guild, dungeon, aether current and sightseeing pages are in progress', ja: 'ギルド・ダンジョン・風脈・探検手帳の4ページは準備中' },
    tag_external_site: { zh: '外部網站 ↗', en: 'External site ↗', ja: '外部サイト ↗' },
    tool_dungeon_database_desc: { zh: '完整的FF14副本資訊查詢，包含獎勵與機制說明', en: 'Complete FF14 dungeon info with rewards and mechanics', ja: 'FF14ダンジョン情報。報酬とギミック説明を収録' }
};

// ---------- 測試 ----------
test('首頁沒有即將推出的卡片，相關鍵也已刪除', () => {
    for (const needle of ['coming-soon', 'equipment_analyzer', 'status_coming_soon', 'status_unavailable', 'status-badge']) {
        assert.ok(!html.includes(needle), `index.html 不該再出現 ${needle}`);
    }
    // 13 張卡都是可點的 <a>，沒有不能點的 <div class="tool-card">
    const cardTags = [...html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)].filter((m) => classesOf(parseAttrs(m[2])).includes('tool-card'));
    assert.deepEqual(cardTags.map((m) => m[1]), Array(13).fill('a'));
    assert.equal(cards.length, 13);

    for (const lang of LANGS) {
        const index = translationKeySet(INDEX_FILE, lang);
        const common = translationKeySet(COMMON_FILE, lang);
        assert.ok(index.size > 0 && common.size > 0, `解析不到 ${lang} 語系，測試可能失效`);
        for (const key of ['tool_equipment_analyzer_title', 'tool_equipment_analyzer_desc', 'status_coming_soon', 'status_unavailable']) {
            assert.ok(!index.has(key), `${INDEX_FILE} 的 ${lang} 語系不該再定義 ${key}`);
            assert.ok(!common.has(key), `${COMMON_FILE} 的 ${lang} 語系不該再定義 ${key}`);
        }
        // 施工中的標示只有首頁用到：定義留在 index.js，common.js 不再重複
        assert.ok(index.has('status_under_construction'), `${INDEX_FILE} 的 ${lang} 語系要保留 status_under_construction`);
        assert.ok(!common.has('status_under_construction'), `${COMMON_FILE} 的 ${lang} 語系不該重複定義 status_under_construction`);
    }

    // 卡片不再用 .status-badge，樣式連同變體一起刪掉
    const css = stripComments(read('assets/css/common.css'));
    assert.doesNotMatch(css, /\.status-badge|\.coming-soon|\.under-construction|\.unavailable/);
});

test('工具卡結構：圖示、標題列（標題＋選用標籤）、說明、選用的「缺什麼」說明', () => {
    const FRAME = ['div.tool-icon', '/div', 'div.tool-heading', 'h3.tool-title', '/h3'];
    for (const card of cards) {
        const href = card.attrs.href;
        const expected = [
            ...FRAME,
            ...(TAGS[href] ? ['span.tool-tag', '/span'] : []),
            '/div', 'p.tool-description', '/p',
            ...(STATUS_LINES.some(([h]) => h === href) ? ['p.tool-status', '/p'] : [])
        ].join(' ');
        assert.equal(skeleton(card.inner), expected, `${href} 的卡片結構`);
        assert.equal(withClass(elementsOf(card.inner), 'tool-icon')[0].attrs['aria-hidden'], 'true', `${href} 的圖示要 aria-hidden`);
    }
});

test('寶圖沒有施工中，角色卡保留施工中標示', () => {
    const treasure = elementsOf(cardByHref('tools/treasure-map-finder/index.html').inner);
    assert.equal(withClass(treasure, 'tool-tag').length, 0, '寶圖搜尋器不帶任何標籤');
    assert.ok(!treasure.some((el) => el.attrs['data-i18n'] === 'status_under_construction'));

    // 角色卡的施工中是標題旁的標籤（和其他標示一致），不再是右上角的 .status-badge
    const [tag, ...others] = withClass(elementsOf(cardByHref('tools/character-card/index.html').inner), 'tool-tag');
    assert.equal(others.length, 0);
    assert.equal(tag.tag, 'span');
    assert.deepEqual(classesOf(tag.attrs).sort(), ['tag', 'tag-warning', 'tool-tag']);
    assert.equal(tag.attrs['data-i18n'], 'status_under_construction');
    assert.equal(tag.text, translationValues(INDEX_FILE, 'zh').get('status_under_construction'));
    assert.equal(tag.text, '🚧 施工中');

    // 副本資料庫已經不是施工中，改成在說明下方寫出缺什麼
    assert.ok(!elementsOf(cardByHref('tools/dungeon-database/index.html').inner).some((el) => el.attrs['data-i18n'] === 'status_under_construction'));
    // 全站只有角色卡還標施工中
    assert.equal((html.match(/data-i18n="status_under_construction"/g) || []).length, 1);
});

test('副本資料庫與攻略資料在說明下方寫出缺什麼', () => {
    const lines = withClass(elementsOf(html), 'tool-status');
    assert.deepEqual(lines.map((el) => [el.tag, el.attrs['data-i18n']]), STATUS_LINES.map(([, key]) => ['p', key]), '兩行說明依序是副本資料庫、攻略資料');

    for (const [href, key] of STATUS_LINES) {
        const parts = elementsOf(cardByHref(href).inner);
        const description = parts.findIndex((el) => classesOf(el.attrs).includes('tool-description'));
        const status = parts.findIndex((el) => classesOf(el.attrs).includes('tool-status'));
        assert.ok(description !== -1 && status > description, `${href} 的說明下方要有 .tool-status`);
        assert.equal(parts[status].attrs['data-i18n'], key);
        assert.equal(parts[status].text, NEW_TEXTS[key].zh, `${href} 的預設文字要等於 zh 翻譯`);
    }
});

test('Lodestone 標示「僅限國際版角色」，水晶商城開新分頁並標示外部網站', () => {
    const lodestone = withClass(elementsOf(cardByHref('tools/lodestone-lookup/index.html').inner), 'tool-tag');
    assert.equal(lodestone.length, 1);
    assert.deepEqual(classesOf(lodestone[0].attrs).sort(), ['tag', 'tag-info', 'tool-tag']);
    assert.equal(lodestone[0].attrs['data-i18n'], 'status_intl_only');
    assert.equal(lodestone[0].text, '僅限國際版角色');

    const shop = cardByHref('https://tc-shop.ff14.tw');
    assert.equal(shop.attrs.target, '_blank');
    assert.equal(shop.attrs.rel, 'noopener noreferrer');
    const tag = withClass(elementsOf(shop.inner), 'tool-tag');
    assert.equal(tag.length, 1);
    assert.deepEqual(classesOf(tag[0].attrs).sort(), ['tag', 'tool-tag']);
    assert.equal(tag[0].attrs['data-i18n'], 'tag_external_site');
    assert.equal(tag[0].text, '外部網站 ↗');

    // 只有外部網站開新分頁；站內工具維持同分頁
    for (const card of cards) {
        const external = /^https?:\/\//.test(card.attrs.href);
        assert.equal(card.attrs.target, external ? '_blank' : undefined, `${card.attrs.href} 的 target`);
        assert.equal(card.attrs.rel, external ? 'noopener noreferrer' : undefined, `${card.attrs.href} 的 rel`);
    }
});

test('每張卡的標籤都是表格列出的那幾個，其他卡片沒有標籤', () => {
    for (const card of cards) {
        const tags = withClass(elementsOf(card.inner), 'tool-tag');
        const expected = TAGS[card.attrs.href];
        assert.equal(tags.length, expected ? 1 : 0, `${card.attrs.href} 的標籤數量`);
        if (expected) {
            assert.equal(tags[0].attrs['data-i18n'], expected.key);
            assert.deepEqual(classesOf(tags[0].attrs).sort(), [...expected.classes].sort());
        }
    }
});

test('副本資料庫的說明在 zh/en/ja 都不再提到攻略指南', () => {
    const FORBIDDEN = { zh: /攻略指南/, en: /guide/i, ja: /ガイド/ };
    for (const lang of LANGS) {
        const description = translationValues(INDEX_FILE, lang).get('tool_dungeon_database_desc');
        assert.ok(description, `${INDEX_FILE} 的 ${lang} 語系缺少 tool_dungeon_database_desc`);
        assert.doesNotMatch(description, FORBIDDEN[lang], `${lang} 的副本資料庫說明不該再提到攻略指南`);
        assert.equal(description, NEW_TEXTS.tool_dungeon_database_desc[lang]);
    }
});

test('新增的狀態與標示文字在 index.js 的 zh/en/ja 都有', () => {
    for (const lang of LANGS) {
        const values = translationValues(INDEX_FILE, lang);
        assert.ok(values.size > 0, `解析不到 ${INDEX_FILE} 的 ${lang} 語系，測試可能失效`);
        for (const [key, texts] of Object.entries(NEW_TEXTS)) {
            assert.equal(values.get(key), texts[lang], `${INDEX_FILE} 的 ${lang} 語系 ${key}`);
        }
        assert.ok(values.get('status_under_construction'), `${INDEX_FILE} 的 ${lang} 語系 status_under_construction`);
    }
});

test('工具卡的預設文字和 zh 翻譯相同（切換語言前不會閃一下別的字）', () => {
    // 翻譯檔依載入順序合併：common.js 在前、index.js 在後
    const zh = new Map([...translationValues(COMMON_FILE, 'zh'), ...translationValues(INDEX_FILE, 'zh')]);
    let checked = 0;
    for (const card of cards) {
        for (const el of elementsOf(card.inner)) {
            const key = el.attrs['data-i18n'];
            if (!key) continue;
            checked++;
            assert.equal(el.text, zh.get(key), `${card.attrs.href} 的 ${key} 預設文字`);
        }
    }
    assert.ok(checked >= 13 * 2, `只檢查到 ${checked} 個 data-i18n，解析可能失效`);
});

test('首頁載入 components/tags.css，卡片用到的 .tag 變體都在裡面', () => {
    const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => parseAttrs(m[0])).filter((a) => a.rel === 'stylesheet').map((a) => a.href);
    const at = (name) => links.findIndex((href) => href.endsWith(name));
    assert.ok(at('components/tags.css') !== -1, 'index.html 沒有載入 assets/css/components/tags.css');
    assert.ok(at('tokens.css') < at('common.css'), 'tokens.css 要在 common.css 之前');
    assert.ok(at('components/language-switcher.css') < at('components/tags.css'), 'tags.css 接在 language-switcher.css 後面');

    const tagsCss = stripComments(read('assets/css/components/tags.css'));
    for (const cls of new Set(Object.values(TAGS).flatMap((t) => t.classes).filter((c) => c.startsWith('tag')))) {
        assert.match(tagsCss, new RegExp(`\\.${cls}\\s*[,{]`), `tags.css 沒有定義 .${cls}`);
    }
});

// ---------- 版面（assets/css/common.css） ----------
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
const commonRules = cssRules(stripComments(read('assets/css/common.css')));
const MOBILE = '(max-width: 768px)';

// 某個選擇器（在指定的 @media 裡）所有規則的宣告合在一起
function declarations(selector, media = null) {
    const found = commonRules.filter((r) => r.media === media && r.selectors.includes(selector));
    assert.ok(found.length > 0, `common.css 找不到 ${selector}${media ? `（@media ${media}）` : ''} 的規則`);
    return found.map((r) => r.body).join(';');
}

test('hero 縮小只套用在首頁', () => {
    const heroClasses = (file) => {
        const m = read(file).match(/<section\b[^>]*\bclass="([^"]*\bhero\b[^"]*)"/);
        assert.ok(m, `${file} 找不到 hero 區塊`);
        return m[1].split(/\s+/);
    };
    assert.ok(heroClasses('index.html').includes('hero-compact'), '首頁的 hero 要有 hero-compact');
    for (const file of ['about.html', 'copyright.html']) {
        assert.ok(!heroClasses(file).includes('hero-compact'), `${file} 的 hero 維持原樣`);
    }
    for (const file of fs.readdirSync(ROOT).filter((name) => name.endsWith('.html') && name !== 'index.html')) {
        assert.ok(!read(file).includes('hero-compact'), `${file} 不該用到 hero-compact`);
    }

    // 縮小的樣式都寫在 .hero-compact 底下，不改共用的 .hero
    const compact = commonRules.filter((r) => r.selectors.some((s) => s.includes('hero-compact')));
    assert.ok(compact.length > 0, 'common.css 沒有 .hero-compact 的規則');
    for (const rule of compact) {
        for (const selector of rule.selectors) assert.match(selector, /^\.hero-compact(?:\s|$)/, `${selector} 要以 .hero-compact 開頭`);
    }

    // 桌機：標題 --text-3xl、副標 --text-md；手機：標題 --text-xl、副標 --text-sm；中文標題不從詞中間斷行
    assert.match(declarations('.hero-compact h1'), /font-size:\s*var\(--text-3xl\)/);
    assert.match(declarations('.hero-compact p'), /font-size:\s*var\(--text-md\)/);
    assert.match(declarations('.hero-compact h1', MOBILE), /font-size:\s*var\(--text-xl\)/);
    assert.match(declarations('.hero-compact p', MOBILE), /font-size:\s*var\(--text-sm\)/);
    assert.match(declarations('.hero-compact'), /word-break:\s*keep-all/);
    // keep-all 讓整段日文副標變成一個不能斷的詞：320px 寬時比 hero 還寬，要允許真的放不下才斷行
    assert.match(declarations('.hero-compact'), /overflow-wrap:\s*anywhere/);
});

test('首頁版面：工具格、精簡工具卡、標題列與缺什麼說明的數值', () => {
    // 工具格：桌機自動排欄（每欄至少 260px），手機單欄
    assert.match(declarations('.tools-grid'), /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(260px,\s*1fr\)\)/);
    assert.match(declarations('.tools-grid'), /gap:\s*var\(--space-4\)/);
    assert.match(declarations('.tools-grid', MOBILE), /grid-template-columns:\s*1fr\s*(?:;|$)/);
    assert.match(declarations('.tools-grid', MOBILE), /gap:\s*var\(--space-2\)/);

    // 工具卡：圖示在左的 grid；圖示要明確跨 3 列（沒有顯式的列，grid-row: 1 / -1 只會佔 1 列）
    const card = declarations('.tool-card');
    assert.match(card, /display:\s*grid/);
    assert.match(card, /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)/);
    assert.match(card, /padding:\s*var\(--space-4\)\s+var\(--space-5\)/);
    assert.match(declarations('.tool-card', MOBILE), /padding:\s*var\(--space-2\)\s+var\(--space-4\)/);
    assert.match(declarations('.tool-icon'), /grid-row:\s*1\s*\/\s*span\s*3/);

    // 標題列：flex、可換行，標籤跟在標題後面
    const heading = declarations('.tool-heading');
    assert.match(heading, /display:\s*flex/);
    assert.match(heading, /flex-wrap:\s*wrap/);
    assert.match(heading, /gap:\s*var\(--space-1\)\s+var\(--space-2\)/);

    // 標題行高 --leading-tight，說明行高 --leading-snug；說明桌機最多 2 行、手機 1 行
    assert.match(declarations('.tool-title'), /line-height:\s*var\(--leading-tight\)/);
    const description = declarations('.tool-description');
    assert.match(description, /line-height:\s*var\(--leading-snug\)/);
    assert.match(description, /-webkit-line-clamp:\s*2(?!\d)/);
    assert.match(declarations('.tool-description', MOBILE), /-webkit-line-clamp:\s*1(?!\d)/);

    // 缺什麼說明：--text-xs、警告色的文字
    const status = declarations('.tool-status');
    assert.match(status, /font-size:\s*var\(--text-xs\)/);
    assert.match(status, /color:\s*var\(--color-warning-text\)/);
});

test('手機版的工具格與工具卡規則只在一處定義，後面的重複定義不會蓋掉它', () => {
    // 同樣的選擇器在 @media (max-width: 768px) 與 (max-width: 480px) 各寫一份時，
    // 手機寬度下後寫的會贏；這幾個選擇器的手機規則只能有一份
    for (const selector of ['.tools-grid', '.tool-card', '.tool-icon', '.tool-title', '.tool-description']) {
        const mobile = commonRules.filter((r) => r.media && /max-width/.test(r.media) && r.selectors.includes(selector));
        assert.deepEqual(mobile.map((r) => r.media), [MOBILE], `${selector} 的手機規則只該在 @media ${MOBILE} 出現一次`);
    }
});

test('手機版縮小上下內距只套用在首頁的 main.home-main，其他頁面的 .main 不變', () => {
    // 所有頁面（根目錄與 tools/ 底下）的 <main> class：只有首頁多一個 home-main
    const htmlFiles = (dir, out = []) => {
        for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            const rel = path.posix.join(dir, entry.name);
            if (entry.isDirectory()) htmlFiles(rel, out);
            else if (entry.name.endsWith('.html')) out.push(rel);
        }
        return out;
    };
    const pages = [...fs.readdirSync(ROOT).filter((name) => name.endsWith('.html')), ...htmlFiles('tools')];
    assert.ok(pages.length >= 22, `只找到 ${pages.length} 頁，解析可能失效`);
    for (const file of pages) {
        const m = read(file).match(/<main\b[^>]*\bclass="([^"]*)"/);
        assert.ok(m, `${file} 找不到 <main class="…">`);
        const classes = m[1].split(/\s+/);
        assert.ok(classes.includes('main'), `${file} 的 <main> 要有 main`);
        assert.equal(classes.includes('home-main'), file === 'index.html', `${file} 的 <main> ${file === 'index.html' ? '要有' : '不該有'} home-main`);
    }

    // 縮小的內距只寫在 .home-main，而且只在手機版（桌機沿用 .main 的 --space-7）
    assert.match(declarations('.home-main', MOBILE), /padding-block:\s*var\(--space-4\)/);
    const homeMain = commonRules.filter((r) => r.selectors.some((s) => s.includes('home-main')));
    assert.deepEqual(homeMain.map((r) => r.media), [MOBILE], '.home-main 的規則只該在 @media (max-width: 768px) 出現一次');

    // 共用的 .main 沒變：基準規則還是 --space-7，手機版（任何 max-width 區塊）也沒有再改它
    assert.match(declarations('.main'), /padding-block:\s*var\(--space-7\)/);
    const mobileMain = commonRules.filter((r) => r.media && /max-width/.test(r.media) && r.selectors.some((s) => /(^|[\s.])main$/.test(s)));
    assert.deepEqual(mobileMain.map((r) => r.selectors), [], '手機版不該有 .main 的規則（只有首頁的 .home-main）');
});
