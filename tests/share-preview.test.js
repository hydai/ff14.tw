const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

// 腳本是 ES module（.mjs），測試是 CommonJS：用動態 import 載入。放在函式裡，模組還不存在時只有用到它的測試失敗
let siteModule = null;
const importSite = async () => (siteModule ??= await import(pathToFileURL(path.join(ROOT, 'scripts/share-preview/site.mjs')).href));
// loadSite() 只讀檔案、不改任何東西，整份測試共用一份結果（測試不得改動它）
let siteCache = null;
const loadSite = async () => (siteCache ??= (await importSite()).loadSite());

// 設計文件「每一頁 <head> 多的一段」的範例（天氣預報）：16 行，含開頭、結尾註解，在 HTML 裡縮 4 格。
// 設計文件原本的範例有 og:url 那一行，總審查之後每一頁都不寫（Facebook 把 og:url 當正式網址，分享連結的 ?room=、?maps=、#… 會被導回沒有狀態的頁面）
const WEATHER_BLOCK = [
    '    <!-- 分享預覽與主畫面：由 scripts/share-preview.mjs 產生，改了分頁標題或說明後重跑 -->',
    '    <meta property="og:site_name" content="FF14.tw">',
    '    <meta property="og:type" content="website">',
    '    <meta property="og:locale" content="zh_TW">',
    '    <meta property="og:title" content="天氣預報 - FF14.tw">',
    '    <meta property="og:description" content="查看艾歐澤亞各地區的天氣預報，搜尋特定天氣條件，追蹤特殊事件">',
    '    <meta property="og:image" content="https://ff14.tw/assets/images/og/weather-forecast.png">',
    '    <meta property="og:image:width" content="1200">',
    '    <meta property="og:image:height" content="630">',
    '    <meta property="og:image:alt" content="天氣預報：查看艾歐澤亞各地區的天氣預報，搜尋特定天氣條件">',
    '    <meta name="twitter:card" content="summary_large_image">',
    '    <meta name="theme-color" content="#667eea">',
    '    <meta name="apple-mobile-web-app-title" content="天氣預報">',
    '    <link rel="manifest" href="manifest.webmanifest">',
    '    <link rel="apple-touch-icon" href="../../assets/images/icons/apple-touch-icon.png">',
    '    <!-- /分享預覽與主畫面 -->'
];

// 設計文件的 manifest 範例（天氣預報）
const WEATHER_MANIFEST = {
    id: '/tools/weather-forecast/',
    name: '天氣預報 - FF14.tw',
    short_name: '天氣預報',
    description: '查看艾歐澤亞各地區的天氣預報，搜尋特定天氣條件，追蹤特殊事件',
    lang: 'zh-Hant',
    start_url: '/tools/weather-forecast/',
    scope: '/tools/weather-forecast/',
    display: 'browser',
    background_color: '#0e171f',
    theme_color: '#667eea',
    icons: [
        { src: '/assets/images/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/assets/images/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/assets/images/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
};

// 計畫「Global Constraints」的工具 → 顏色 token 對照
const EXPECTED_TOOL_COLORS = {
    'mini-cactpot': '--color-danger-text',
    'wondrous-tails': '--color-brand-b',
    'dungeon-database': '--color-heading',
    'character-card': '--color-danger-text',
    'faux-hollows-foxes': '--color-heading',
    'treasure-map-finder': '--color-success',
    'lodestone-lookup': '--color-primary',
    'timed-gathering': '--color-warning-text',
    'guide': '--color-brand-b',
    'chocobo-color': '--color-warning-text',
    'report-generator': '--color-info',
    'macro-converter': '--color-primary',
    'weather-forecast': '--color-info'
};
const EXPECTED_GUIDE_TOPICS = ['guild', 'grand-company', 'dungeon', 'party', 'aether', 'sightseeing', 'chocobo'];

// ---------- 小工具 ----------

const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', '.superpowers', '.wrangler', 'api', 'docs', 'scripts', 'tests', 'tmp']);
// repo 裡所有的 .html（相對路徑，用 /），排除不屬於網站的目錄
function listHtml(dir = ROOT, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) listHtml(full, out);
        else if (entry.name.endsWith('.html')) out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
    return out;
}

const count = (text, part) => text.split(part).length - 1;

// 取出有標記的那一段（含開頭、結尾註解），回傳每一行
function blockLines(html, file) {
    const lines = html.split('\n');
    const start = lines.findIndex((line) => line.includes('<!-- 分享預覽與主畫面'));
    const end = lines.findIndex((line) => line.includes('<!-- /分享預覽與主畫面 -->'));
    assert.ok(start !== -1 && end > start, `${file} 找不到分享預覽那一段`);
    return lines.slice(start, end + 1);
}

// 跳脫的反向：測試用它把那一段裡的值還原成頁面上的字
const unescapeHtml = (text) => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const metaContent = (block, attribute, value) => {
    const match = new RegExp(`<meta ${attribute}="${value}" content="([^"]*)">`).exec(block);
    return match ? unescapeHtml(match[1]) : null;
};
// 頁面自己的 <title> 與說明（不經過被測試的 pageText，用最簡單的寫法讀；現有頁面的寫法都是這樣）
const titleOf = (html) => unescapeHtml(/<title[^>]*>([^<]*)<\/title>/.exec(html)[1]);
const descriptionOf = (html) => unescapeHtml(/<meta name="description" content="([^"]*)"/.exec(html)[1]);

// 首頁翻譯的 zh：translations/index.js 是給瀏覽器的腳本，在 vm 裡執行並接住傳給 loadTranslations 的物件（不經過被測試的 loadSite）
function homeTranslations() {
    let loaded = null;
    const context = vm.createContext({ window: { i18n: { loadTranslations: (name, data) => { loaded = data; } } } });
    vm.runInContext(read('assets/js/i18n/translations/index.js'), context);
    return loaded.zh;
}

// 攻略側欄的主題清單：tools/guide/sidebar-template.js 的 ITEMS（pending: true 是還沒寫的主題），在 vm 裡執行並從 window 拿
function guideSidebarItems() {
    const context = vm.createContext({ window: {} });
    vm.runInContext(read('tools/guide/sidebar-template.js'), context);
    return Array.from(context.window.GuideSidebarTemplate.ITEMS);
}

// 這一頁在網站上的路徑（獨立於被測試的程式再算一次）：index.html 是資料夾網址，其他頁是檔案網址；404 會出現在任何網址上，沒有固定的路徑（null）
const pathOfPage = (file) => (file === '404.html' ? null : `/${file.endsWith('index.html') ? file.slice(0, -'index.html'.length) : file}`);

function luminance(hex) {
    const channel = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// 把腳本需要的檔案（25 頁、14 個 manifest、tokens、登錄表、首頁翻譯與腳本本身）複製到暫存資料夾，
// 讓測試能在複本上跑指令、改檔案，不動到真的 repo。腳本靠自己的位置找根目錄，所以複本裡的腳本會處理複本
async function withSiteCopy(run) {
    const site = await loadSite();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'share-preview-'));
    try {
        const files = [
            ...site.pages.map((page) => page.file),
            ...site.manifests.map((manifest) => manifest.file),
            'assets/css/tokens.css',
            'assets/js/components/tools-registry.js',
            'assets/js/i18n/translations/index.js',
            'scripts/share-preview.mjs',
            ...fs.readdirSync(path.join(ROOT, 'scripts/share-preview')).map((name) => `scripts/share-preview/${name}`)
        ];
        for (const file of files) {
            fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
            fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
        }
        return await run(dir, site);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
const runCli = (dir, ...args) => spawnSync(process.execPath, [path.join(dir, 'scripts/share-preview.mjs'), ...args], { cwd: os.tmpdir(), encoding: 'utf8' });

// ---------- 頁面清單與那一段 ----------

test('25 頁：repo 裡的 HTML 剛好是 loadSite().pages', async () => {
    const site = await loadSite();
    assert.equal(site.pages.length, 25);
    assert.deepEqual(listHtml().sort(), site.pages.map((page) => page.file).sort(), '新增一頁卻沒有進 pages（或 pages 多了一頁）');
    // 順序：5 個根目錄頁、登錄表順序的 13 個工具、7 個攻略主題
    assert.deepEqual(site.pages.map((page) => page.file), [
        'index.html', 'about.html', 'changelog.html', 'copyright.html', '404.html',
        ...site.tools.map((tool) => `tools/${tool.id}/index.html`),
        ...EXPECTED_GUIDE_TOPICS.map((slug) => `tools/guide/${slug}.html`)
    ]);
});

test('loadSite：13 個工具（照登錄表）、7 個主題、21 張卡片、14 個 manifest，卡片的字照網站現有的字', async () => {
    const site = await loadSite();
    const registry = require('../assets/js/components/tools-registry.js');
    assert.deepEqual(site.tools.map((tool) => tool.id), registry.tools.filter((tool) => !tool.external).map((tool) => tool.id));
    assert.equal(site.tools.length, 13);
    assert.deepEqual(site.topics.map((topic) => topic.slug), EXPECTED_GUIDE_TOPICS);
    assert.equal(site.heroTitle, 'Final Fantasy XIV 工具箱');
    assert.equal(site.cards.length, 21);
    assert.equal(new Set(site.cards.map((card) => card.key)).size, 21, 'key 不重複（就是預覽圖的檔名）');
    assert.deepEqual(site.manifests.map((manifest) => manifest.file), ['manifest.webmanifest', ...site.tools.map((tool) => `tools/${tool.id}/manifest.webmanifest`)]);

    // 工具：名稱與圖示來自登錄表，說明是首頁卡片那一句，顏色是 token 在 tokens.css 淺色的值
    const weather = site.tools.find((tool) => tool.id === 'weather-forecast');
    assert.deepEqual(weather, { id: 'weather-forecast', name: '天氣預報', icon: '🌤️', sentence: '查看艾歐澤亞各地區的天氣預報，搜尋特定天氣條件', colorToken: '--color-info', color: '#0e7c9c' });
    assert.deepEqual(site.cards.find((card) => card.key === 'weather-forecast'), { key: 'weather-forecast', name: '天氣預報', label: '', sentence: '查看艾歐澤亞各地區的天氣預報，搜尋特定天氣條件', icon: '🌤️', color: '#0e7c9c' });
    // 攻略主題：名稱是 <title> 去掉「 - 攻略資料 - FF14.tw」，說明是那一頁的說明，圖示與顏色同攻略資料
    const guideColor = site.tools.find((tool) => tool.id === 'guide').color;
    assert.deepEqual(site.topics.find((topic) => topic.slug === 'party'), { slug: 'party', name: '隊伍系統', description: 'FF14 隊伍系統完整說明，包含 Light Party、Full Party、跨服小隊、聯盟團隊與職能配置' });
    assert.deepEqual(site.cards.find((card) => card.key === 'guide-party'), { key: 'guide-party', name: '隊伍系統', label: '攻略資料', sentence: 'FF14 隊伍系統完整說明，包含 Light Party、Full Party、跨服小隊、聯盟團隊與職能配置', icon: '📖', color: guideColor });
    assert.deepEqual(site.cards.filter((card) => card.key.startsWith('guide-')).map((card) => card.key), EXPECTED_GUIDE_TOPICS.map((slug) => `guide-${slug}`));
    // 網站：沒有圖示與顏色（用品牌漸層），說明是首頁大標
    assert.deepEqual(site.cards.find((card) => card.key === 'site'), { key: 'site', name: 'FF14.tw', label: '', sentence: 'Final Fantasy XIV 工具箱', icon: '', color: null });
    // 每個主題的說明都是那一頁自己的說明，預覽照抄；還沒寫的主題，說明本來就寫「撰寫中」，預覽也照抄。
    // 哪幾個主題還沒寫看側欄的 ITEMS（pending: true）：寫好一頁、拿掉它的 pending 之後，就不再要求那一頁寫「撰寫中」
    const items = guideSidebarItems();
    assert.deepEqual(items.map((item) => item.page), EXPECTED_GUIDE_TOPICS, '側欄的 ITEMS 就是這 7 個主題（沒讀錯）');
    for (const topic of site.topics) {
        const pageDescription = descriptionOf(read(`tools/guide/${topic.slug}.html`));
        assert.equal(topic.description, pageDescription, `${topic.slug} 的說明`);
        assert.equal(site.cards.find((card) => card.key === `guide-${topic.slug}`).sentence, pageDescription, `${topic.slug} 的預覽照抄那一頁的說明`);
        if (items.find((item) => item.page === topic.slug).pending === true) {
            assert.match(pageDescription, /撰寫中/, `${topic.slug} 在側欄的 ITEMS 裡還是 pending，說明要老實寫「撰寫中」`);
        }
    }
});

test('天氣預報那一段逐行等於設計文件的範例', async () => {
    const { BLOCK_START, BLOCK_END } = await importSite();
    assert.equal(BLOCK_START, '<!-- 分享預覽與主畫面：由 scripts/share-preview.mjs 產生，改了分頁標題或說明後重跑 -->');
    assert.equal(BLOCK_END, '<!-- /分享預覽與主畫面 -->');
    assert.equal(WEATHER_BLOCK.length, 16);
    const lines = blockLines(read('tools/weather-forecast/index.html'), 'tools/weather-forecast/index.html');
    assert.deepEqual(lines, WEATHER_BLOCK);
});

test('每一頁的那一段等於 headBlock()，而且只出現一次；og 標籤只在那一段裡', async () => {
    const { BAR_TOKEN, BLOCK_START, BLOCK_END, headBlock } = await importSite();
    const site = await loadSite();
    const barColor = site.tokens.light.get(BAR_TOKEN);
    assert.equal(barColor, '#667eea');
    for (const page of site.pages) {
        const html = read(page.file);
        assert.equal(count(html, BLOCK_START), 1, `${page.file} 的開頭註解要剛好一個`);
        assert.equal(count(html, BLOCK_END), 1, `${page.file} 的結尾註解要剛好一個`);
        const lines = blockLines(html, page.file);
        assert.equal(lines.join('\n'), headBlock(page, barColor), `${page.file} 的那一段和 headBlock() 不一樣，重跑 node scripts/share-preview.mjs pages`);
        assert.ok(html.indexOf(BLOCK_START) < html.indexOf('</head>'), `${page.file} 的那一段要在 <head> 裡`);
        const outside = html.replace(lines.join('\n'), '');
        for (const pattern of [/property="og:/, /name="twitter:/, /name="theme-color"/, /name="apple-mobile-web-app-title"/, /rel="manifest"/, /rel="apple-touch-icon"/]) {
            assert.doesNotMatch(outside, pattern, `${page.file} 在那一段以外還有 ${pattern}`);
        }
    }
});

test('og:title／og:description 等於頁面本身；沒有任何一頁有 og:url（含 404）', async () => {
    const site = await loadSite();
    for (const page of site.pages) {
        const html = read(page.file);
        const block = blockLines(html, page.file).join('\n');
        assert.equal(metaContent(block, 'property', 'og:title'), titleOf(html), `${page.file} 的 og:title`);
        assert.equal(metaContent(block, 'property', 'og:description'), descriptionOf(html), `${page.file} 的 og:description`);
        assert.equal(page.title, titleOf(html));
        assert.equal(page.description, descriptionOf(html));
        // Facebook 把 og:url 當正式網址、貼文的連結會指到它：分享出去的 ?room=（隊伍邀請）、?maps=、#…（天氣、修改紀錄的版本）會被導回沒有狀態的頁面。
        // Discord、LINE、X 本來就用貼上的網址，og:url 對它們沒有作用，所以每一頁都不寫（不是只有 404）
        assert.ok(!html.includes('og:url'), `${page.file} 不該有 og:url`);
    }
    assert.ok(site.pages.some((page) => page.file === '404.html'), '404 也在檢查的頁面裡');
});

test('404 那一段：只有 / 開頭的路徑與 https 網址，說明是「網址可能打錯了，或這個頁面已經搬家。」', async () => {
    const SENTENCE = '網址可能打錯了，或這個頁面已經搬家。';
    const html = read('404.html');
    const block = blockLines(html, '404.html').join('\n');
    assert.equal(descriptionOf(html), SENTENCE, '404 補了一行頁面說明');
    assert.equal(metaContent(block, 'property', 'og:description'), SENTENCE);
    // 404 會出現在任何打錯的網址上（任意深度），所以路徑一律從根目錄開始，不能有相對路徑
    const hrefs = [...block.matchAll(/<link [^>]*href="([^"]*)"/g)].map((match) => match[1]);
    assert.deepEqual(hrefs, ['/manifest.webmanifest', '/assets/images/icons/apple-touch-icon.png']);
    assert.match(metaContent(block, 'property', 'og:image'), /^https:\/\/ff14\.tw\/assets\/images\/og\/site\.png$/);
    assert.doesNotMatch(block, /(?:href|content)="(?:\.\.?\/|[a-z0-9-]+\.webmanifest)/, '沒有相對路徑');
    // 補的那一行在 favicon 前面（不改頁面其他部分）
    assert.match(html, /<title>找不到這個頁面 - FF14\.tw<\/title>\n    <meta name="description" content="網址可能打錯了，或這個頁面已經搬家。">\n    <link rel="icon"/);
});

test('圖片網址與說明文字：工具是 og/<id>.png、主題是 og/guide-<slug>.png、網站頁是 og/site.png', async () => {
    const site = await loadSite();
    const expectedKey = (file) => {
        const tool = /^tools\/([^/]+)\/index\.html$/.exec(file);
        const topic = /^tools\/guide\/(.+)\.html$/.exec(file);
        if (tool) return tool[1];
        if (topic && topic[1] !== 'index') return `guide-${topic[1]}`;
        return 'site';
    };
    for (const page of site.pages) {
        const block = blockLines(read(page.file), page.file).join('\n');
        const key = expectedKey(page.file);
        assert.equal(page.imageKey, key, page.file);
        assert.equal(metaContent(block, 'property', 'og:image'), `https://ff14.tw/assets/images/og/${key}.png`, page.file);
        assert.equal(metaContent(block, 'property', 'og:image:width'), '1200');
        assert.equal(metaContent(block, 'property', 'og:image:height'), '630');
        assert.equal(metaContent(block, 'name', 'twitter:card'), 'summary_large_image');
        // 每個 imageKey 都對得到一張卡片
        assert.ok(site.cards.some((card) => card.key === key), `${page.file} 的圖 ${key} 沒有對應的卡片`);
    }
    const alt = (file) => metaContent(blockLines(read(file), file).join('\n'), 'property', 'og:image:alt');
    assert.equal(alt('tools/guide/party.html'), '攻略資料・隊伍系統：FF14 隊伍系統完整說明，包含 Light Party、Full Party、跨服小隊、聯盟團隊與職能配置');
    assert.equal(alt('index.html'), 'FF14.tw：Final Fantasy XIV 工具箱');
    assert.equal(alt('tools/weather-forecast/index.html'), '天氣預報：查看艾歐澤亞各地區的天氣預報，搜尋特定天氣條件');
    // 工具首頁（攻略資料）和它底下的主題不同張圖：名稱是登錄表的，說明是首頁卡片那一句（translations/index.js 的 zh tool_guide_desc），不寫死
    const guideTool = require('../assets/js/components/tools-registry.js').tools.find((tool) => tool.id === 'guide');
    assert.equal(alt('tools/guide/index.html'), `${guideTool.name}：${homeTranslations().tool_guide_desc}`);
    for (const page of site.pages) assert.equal(page.imageAlt, alt(page.file), page.file);
});

test('apple-mobile-web-app-title：工具是登錄表的名稱、攻略的主題是「攻略資料」、網站其他頁是 FF14.tw', async () => {
    const site = await loadSite();
    const title = (file) => metaContent(blockLines(read(file), file).join('\n'), 'name', 'apple-mobile-web-app-title');
    assert.equal(title('tools/weather-forecast/index.html'), '天氣預報');
    assert.equal(title('tools/lodestone-lookup/index.html'), 'Lodestone 角色查詢');
    assert.equal(title('tools/guide/index.html'), '攻略資料');
    for (const slug of EXPECTED_GUIDE_TOPICS) assert.equal(title(`tools/guide/${slug}.html`), '攻略資料', slug);
    for (const file of ['index.html', 'about.html', 'changelog.html', 'copyright.html', '404.html']) assert.equal(title(file), 'FF14.tw', file);
    // 就是 manifest 的 short_name
    for (const page of site.pages) {
        const manifestFile = page.file.startsWith('tools/') ? `tools/${page.file.split('/')[1]}/manifest.webmanifest` : 'manifest.webmanifest';
        assert.equal(JSON.parse(read(manifestFile)).short_name, page.appleTitle, page.file);
    }
});

// ---------- manifest ----------

test('manifest：14 個檔案逐字等於 manifestJson()，內容照設計', async () => {
    const { manifestJson } = await importSite();
    const site = await loadSite();
    assert.equal(site.manifests.length, 14);
    for (const { file, data } of site.manifests) {
        const text = read(file);
        assert.equal(text, manifestJson(data), `${file} 和 manifestJson() 不一樣，重跑 node scripts/share-preview.mjs pages`);
        assert.equal(text, JSON.stringify(JSON.parse(text), null, 2) + '\n', `${file} 是 2 格縮排、結尾一個換行的 JSON`);
        assert.deepEqual(Object.keys(JSON.parse(text)), ['id', 'name', 'short_name', 'description', 'lang', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'icons'], `${file} 的鍵順序`);
    }
    assert.deepEqual(JSON.parse(read('tools/weather-forecast/manifest.webmanifest')), WEATHER_MANIFEST);

    const root = JSON.parse(read('manifest.webmanifest'));
    assert.equal(root.id, '/');
    assert.equal(root.start_url, '/');
    assert.equal(root.scope, '/');
    assert.equal(root.short_name, 'FF14.tw');
    assert.equal(root.name, titleOf(read('index.html')));
    assert.equal(root.description, descriptionOf(read('index.html')));
    const guide = JSON.parse(read('tools/guide/manifest.webmanifest'));
    assert.equal(guide.short_name, '攻略資料');
    assert.equal(guide.start_url, '/tools/guide/');
    assert.equal(guide.scope, '/tools/guide/');
    assert.equal(guide.id, '/tools/guide/');

    for (const { file, data } of site.manifests) {
        assert.equal(data.display, 'browser', file);
        assert.equal(data.background_color, '#0e171f', file);
        assert.equal(data.lang, 'zh-Hant', file);
        assert.equal(data.start_url, data.id, file);
        assert.equal(data.scope, data.id, file);
        assert.deepEqual(data.icons, WEATHER_MANIFEST.icons, `${file} 的 icons`);
        if (file === 'manifest.webmanifest') continue;
        const id = file.split('/')[1];
        const html = read(`tools/${id}/index.html`);
        assert.equal(data.id, `/tools/${id}/`, file);
        assert.equal(data.name, titleOf(html), file);
        assert.equal(data.description, descriptionOf(html), file);
        assert.equal(data.short_name, site.tools.find((tool) => tool.id === id).name, file);
    }
    // 14 個 icons 是各自的物件（改一個不會動到別的）
    assert.notEqual(site.manifests[0].data.icons, site.manifests[1].data.icons);
});

test('每一頁的 manifest 與 apple-touch-icon 連結：從這一頁解析出來指到對的位置，manifest 存在而且 scope 包含這一頁', async () => {
    const site = await loadSite();
    for (const page of site.pages) {
        const block = blockLines(read(page.file), page.file).join('\n');
        // 連結的相對路徑從這一頁所在的資料夾解析；404 會出現在任何深度，一律是根目錄絕對路徑
        const resolve = (href) => (href.startsWith('/') ? href.slice(1) : path.posix.join(path.posix.dirname(page.file), href));
        const manifestFile = resolve(/<link rel="manifest" href="([^"]*)">/.exec(block)[1]);
        const iconFile = resolve(/<link rel="apple-touch-icon" href="([^"]*)">/.exec(block)[1]);
        assert.equal(iconFile, 'assets/images/icons/apple-touch-icon.png', `${page.file} 的 apple-touch-icon`);

        // 工具與它的攻略主題用 tools/<id>/manifest.webmanifest（從哪一頁加就打開那個工具），其他頁與 404 用根目錄的
        const expectedManifest = page.file.startsWith('tools/') ? `tools/${page.file.split('/')[1]}/manifest.webmanifest` : 'manifest.webmanifest';
        assert.equal(manifestFile, expectedManifest, `${page.file} 的 manifest`);
        assert.ok(fs.existsSync(path.join(ROOT, manifestFile)), `${page.file} 指到不存在的 ${manifestFile}`);

        const manifest = JSON.parse(read(manifestFile));
        const pagePath = pathOfPage(page.file);
        if (pagePath === null) {
            assert.equal(manifest.scope, '/', '404 在任何網址上，scope 要是整個網站');
            continue;
        }
        assert.ok(pagePath.startsWith(manifest.scope), `${page.file}（${pagePath}）不在 ${manifestFile} 的 scope ${manifest.scope} 裡`);
        assert.ok(manifest.start_url.startsWith(manifest.scope), `${manifestFile} 的 start_url 要在 scope 裡`);
    }
});

test('theme-color 與 manifest 的 theme_color 等於 tokens.css 淺色的 --color-browser-bar（#667eea），深色是 #4b5ca8', async () => {
    const { BAR_TOKEN, readTokens } = await importSite();
    assert.equal(BAR_TOKEN, '--color-browser-bar');
    const tokens = readTokens(read('assets/css/tokens.css'));
    assert.equal(tokens.light.get(BAR_TOKEN), '#667eea');
    assert.equal(tokens.dark.get(BAR_TOKEN), '#4b5ca8');
    const site = await loadSite();
    for (const page of site.pages) {
        assert.equal(metaContent(read(page.file), 'name', 'theme-color'), tokens.light.get(BAR_TOKEN), page.file);
    }
    for (const { file, data } of site.manifests) assert.equal(data.theme_color, tokens.light.get(BAR_TOKEN), file);
});

test('TOOL_COLORS 剛好涵蓋登錄表的 13 個站內工具，每個底色和白字的對比 ≥ 4.5:1', async () => {
    const { TOOL_COLORS, GUIDE_TOPICS, readTokens } = await importSite();
    const registry = require('../assets/js/components/tools-registry.js');
    const ids = registry.tools.filter((tool) => !tool.external).map((tool) => tool.id);
    assert.equal(ids.length, 13);
    assert.deepEqual(Object.keys(TOOL_COLORS).sort(), [...ids].sort(), '新增工具要在 TOOL_COLORS 加一行');
    assert.deepEqual({ ...TOOL_COLORS }, EXPECTED_TOOL_COLORS);
    assert.ok(Object.isFrozen(TOOL_COLORS) && Object.isFrozen(GUIDE_TOPICS));
    assert.deepEqual([...GUIDE_TOPICS], EXPECTED_GUIDE_TOPICS);
    // 攻略主題的檔案都在，目錄裡沒有別的主題
    assert.deepEqual(fs.readdirSync(path.join(ROOT, 'tools/guide')).filter((name) => name.endsWith('.html') && name !== 'index.html').map((name) => name.slice(0, -5)).sort(), [...EXPECTED_GUIDE_TOPICS].sort());

    const { light } = readTokens(read('assets/css/tokens.css'));
    for (const [id, token] of Object.entries(TOOL_COLORS)) {
        const color = light.get(token);
        assert.match(color, /^#[0-9a-f]{6}$/i, `${id} 的 ${token} 要是 6 位色碼`);
        const ratio = contrast(color, '#ffffff');
        assert.ok(ratio >= 4.5, `${id} 的底色 ${token}（${color}）和白字的對比 ${ratio.toFixed(2)} < 4.5`);
    }
});

// ---------- 分頁標題 ----------

test('分頁標題：首頁「FF14.tw - Final Fantasy XIV 工具箱」；採集頁用 <html data-i18n-title="pageTitle">、<title> 沒有 data-i18n', async () => {
    const home = read('index.html');
    assert.match(home, /<title>FF14\.tw - Final Fantasy XIV 工具箱<\/title>/);
    assert.equal(titleOf(home), `FF14.tw - ${(await loadSite()).heroTitle}`, '和首頁大標一致');

    const gathering = read('tools/timed-gathering/index.html');
    assert.match(gathering, /^<!DOCTYPE html>\n<html lang="zh-Hant" data-i18n-title="pageTitle">\n/);
    assert.match(gathering, /\n    <title>特殊採集時間管理器 - FF14\.tw<\/title>\n/);
    assert.doesNotMatch(gathering, /<title[^>]*data-i18n/, '<title> 不再有 data-i18n');
    // pageTitle 同時是頁首的工具名稱，照舊
    assert.match(gathering, /data-tool-name="特殊採集時間管理器" data-tool-name-key="pageTitle"/);
    // 404 也是這個寫法，I18nManager 切換語言時會換標題
    assert.match(read('404.html'), /<html lang="zh-Hant" data-i18n-title="not_found_title">/);
});

test('採集頁切換語言：真正的 I18nManager 把標題換成「Timed Gathering Manager - FF14.tw」「タイムド採集管理 - FF14.tw」', () => {
    const html = read('tools/timed-gathering/index.html');
    // 用真的頁面決定替身的內容：<html> 上的 data-i18n-title 與靜態的 <title>
    const i18nTitle = /<html[^>]*data-i18n-title="([^"]*)"/.exec(html)?.[1];
    assert.equal(i18nTitle, 'pageTitle');
    const warnings = [];
    const document = {
        readyState: 'loading',
        addEventListener() {},
        title: /<title[^>]*>([^<]*)<\/title>/.exec(html)[1],
        documentElement: { dataset: { i18nTitle }, lang: 'zh-Hant' },
        querySelectorAll: () => [],
        querySelector: () => null
    };
    const context = vm.createContext({
        window: {}, document, navigator: { languages: ['zh-TW'] },
        localStorage: { getItem: () => null, setItem() {} },
        console: { warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args) }
    });
    vm.runInContext(read('assets/js/i18n/i18n-manager.js'), context);
    vm.runInContext(read('assets/js/i18n/translations/tools/timed-gathering.js'), context);
    const i18n = context.window.i18n;

    // 載入完成後 I18nManager 會跑一次 updatePageLanguage()（DOMContentLoaded）：中文的標題維持不變
    i18n.updatePageLanguage();
    assert.equal(document.title, '特殊採集時間管理器 - FF14.tw');
    i18n.setLanguage('en');
    assert.equal(document.title, 'Timed Gathering Manager - FF14.tw');
    i18n.setLanguage('ja');
    assert.equal(document.title, 'タイムド採集管理 - FF14.tw');
    i18n.setLanguage('zh');
    assert.equal(document.title, '特殊採集時間管理器 - FF14.tw');
    assert.deepEqual(warnings, [], '沒有找不到翻譯鍵的警告');
});

test('Lodestone：canonical 還在，舊的 og-image.png 不在任何頁面裡', async () => {
    const html = read('tools/lodestone-lookup/index.html');
    assert.match(html, /<link rel="canonical" href="https:\/\/ff14\.tw\/tools\/lodestone-lookup\/">/);
    assert.equal(count(html, 'property="og:title"'), 1, '只剩那一段裡的 og:title');
    assert.doesNotMatch(html, /Open Graph \/ Social Media/, '舊的 og 區塊連同它的註解一起拿掉');
    // 其他頁不加 canonical
    const site = await loadSite();
    for (const page of site.pages) {
        assert.ok(!read(page.file).includes('og-image.png'), `${page.file} 還指著不存在的 og-image.png`);
        if (page.file !== 'tools/lodestone-lookup/index.html') assert.ok(!read(page.file).includes('rel="canonical"'), `${page.file} 不該有 canonical`);
    }
    assert.match(metaContent(blockLines(html, 'lodestone').join('\n'), 'property', 'og:image'), /\/assets\/images\/og\/lodestone-lookup\.png$/);
});

// ---------- 函式本身 ----------

test('readTokens：淺色是 :root，深色是 [data-theme="dark"]，var() 照同一個主題展開、深色找不到就用淺色', async () => {
    const { readTokens } = await importSite();
    const css = `/* 註解 { :root { --x: 1; } */
:root { color-scheme: light; --a: #111111; --b: var(--a); --c: 1px solid var(--b); --gradient: linear-gradient(135deg, var(--a) 0%, var(--b) 100%); }
[data-theme="dark"] { color-scheme: dark; --a: #222222; --d: var(--c); }`;
    const { light, dark } = readTokens(css);
    assert.deepEqual([...light.keys()], ['--a', '--b', '--c', '--gradient'], '註解裡的不算；color-scheme 不是 token');
    assert.equal(light.get('--b'), '#111111');
    assert.equal(light.get('--c'), '1px solid #111111');
    assert.equal(light.get('--gradient'), 'linear-gradient(135deg, #111111 0%, #111111 100%)');
    assert.deepEqual([...dark.keys()], ['--a', '--d'], '深色只有 [data-theme="dark"] 自己定義的');
    assert.equal(dark.get('--a'), '#222222');
    // --d 引用淺色才有的 --c：照深色展開（--c 裡的 --b 再引用 --a，深色的 --a 是 #222222）
    assert.equal(dark.get('--d'), '1px solid #222222');
    // 找不到的 token 丟錯，不留著 var()
    assert.throws(() => readTokens(':root { --a: var(--missing); } [data-theme="dark"] { --a: #000000; }'), /--missing/);
    assert.throws(() => readTokens(':root { --a: var(--b); --b: var(--a); } [data-theme="dark"] { --a: #000000; }'), /--a/);
    assert.throws(() => readTokens(':root { --a: #111111; }'), /data-theme/);

    // 真的 tokens.css
    const real = readTokens(read('assets/css/tokens.css'));
    assert.equal(real.light.get('--gradient-brand'), 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)');
    assert.equal(real.light.get('--header-bg'), real.light.get('--gradient-brand'));
    assert.equal(real.dark.get('--gradient-brand'), 'linear-gradient(135deg, #4b5ca8 0%, #563b79 100%)');
    assert.equal(real.light.get('--color-info'), '#0e7c9c');
    for (const [name, value] of [...real.light, ...real.dark]) assert.doesNotMatch(value, /var\(/, `${name} 的 var() 都展開了`);
});

test('pageText：解開 HTML 實體；屬性順序不拘、只看 <head>；沒有說明是空字串', async () => {
    const { pageText } = await importSite();
    assert.deepEqual(pageText('<head><title>A &amp; B &quot;C&quot; &lt;D&gt; &#38; &#x26; &#39;E&#39;</title><meta name="description" content="說明 &amp; &quot;x&quot;"></head>'),
        { title: 'A & B "C" <D> & & \'E\'', description: '說明 & "x"' });
    // content 在 name 前面、後面還有別的屬性（採集頁與副本資料庫的寫法）、單引號、內容有 >
    assert.equal(pageText('<title>T</title><meta content=\'a > b\' name="Description" data-i18n="k" data-i18n-attr="content">').description, 'a > b');
    assert.equal(pageText('<title data-i18n="k">T</title>').title, 'T');
    assert.deepEqual(pageText('<head><title>只有標題</title></head>'), { title: '只有標題', description: '' });
    // og:description、twitter:card 不是頁面說明
    assert.equal(pageText('<title>T</title><meta property="og:description" content="x"><meta name="twitter:card" content="y">').description, '');
    // <body> 裡的 <title>（例如 SVG）不算
    assert.equal(pageText('<head><title>真的</title></head><body><svg><title>圖</title></svg></body>').title, '真的');
    // 不認得的實體丟錯，不留著 &copy; 讓預覽和頁面對不上
    assert.throws(() => pageText('<title>&copy; X</title>'), /&copy;/);
});

test('headBlock 跳脫：說明是 A & B "C" <D> 時寫成 A &amp; B &quot;C&quot; &lt;D&gt;', async () => {
    const { headBlock } = await importSite();
    const page = {
        file: 'tools/demo/index.html', title: 'A & B "C" <D> - FF14.tw', description: 'A & B "C" <D>',
        imageKey: 'demo', imageAlt: 'A & B "C" <D>：A & B "C" <D>',
        manifestHref: 'manifest.webmanifest', touchIconHref: '../../assets/images/icons/apple-touch-icon.png', appleTitle: 'A & B "C" <D>'
    };
    const block = headBlock(page, '#667eea');
    const ESCAPED = 'A &amp; B &quot;C&quot; &lt;D&gt;';
    assert.ok(block.includes(`<meta property="og:title" content="${ESCAPED} - FF14.tw">`));
    assert.ok(block.includes(`<meta property="og:description" content="${ESCAPED}">`));
    assert.ok(block.includes(`<meta property="og:image:alt" content="${ESCAPED}：${ESCAPED}">`));
    assert.ok(block.includes(`<meta name="apple-mobile-web-app-title" content="${ESCAPED}">`));
    // 每一行都是完整的一個標籤：屬性值裡沒有 < > "，& 只出現在四個實體裡，標籤不會斷掉
    for (const line of block.split('\n').slice(1, -1)) {
        assert.match(line, /^ {4}<(?:meta|link)(?: [a-z:-]+="(?:[^"<>&]|&(?:amp|quot|lt|gt);)*")+>$/, line);
    }
    assert.equal(block.split('\n').length, 16);
    // 還原之後就是頁面上的字
    assert.equal(unescapeHtml(metaContent(block, 'property', 'og:description')), 'A & B "C" <D>');

    // 不寫 og:url（每一頁都不寫，見「og:title／og:description 等於頁面本身；沒有任何一頁有 og:url」）
    assert.doesNotMatch(block, /og:url/);
    // 網址列顏色照傳進來的
    assert.ok(headBlock(page, '#4b5ca8').includes('<meta name="theme-color" content="#4b5ca8">'));
});

test('cardAlt：「標籤・名稱：說明」，沒有標籤就從名稱開始', async () => {
    const { cardAlt } = await importSite();
    assert.equal(cardAlt({ label: '', name: '天氣預報', sentence: '查看天氣' }), '天氣預報：查看天氣');
    assert.equal(cardAlt({ label: '攻略資料', name: '隊伍系統', sentence: '說明' }), '攻略資料・隊伍系統：說明');
});

const SAMPLE_HTML = '<!DOCTYPE html>\n<html>\n<head>\n    <title>T</title>\n    <link rel="icon" type="image/x-icon" href="a.ico">\n    <link rel="stylesheet" href="b.css">\n</head>\n<body></body>\n</html>\n';
const sampleBlock = (note) => ['    <!-- 分享預覽與主畫面：由 scripts/share-preview.mjs 產生，改了分頁標題或說明後重跑 -->', `    <meta property="og:title" content="${note}">`, '    <!-- /分享預覽與主畫面 -->'].join('\n');

test('applyHeadBlock 重跑一樣：套兩次和套一次一字不差', async () => {
    const { applyHeadBlock } = await importSite();
    const once = applyHeadBlock(SAMPLE_HTML, sampleBlock('第一版'), 'x.html');
    // 沒有那一段就插在 favicon 那一行的下一行，其他部分一字不動
    assert.equal(once, '<!DOCTYPE html>\n<html>\n<head>\n    <title>T</title>\n    <link rel="icon" type="image/x-icon" href="a.ico">\n' + sampleBlock('第一版') + '\n    <link rel="stylesheet" href="b.css">\n</head>\n<body></body>\n</html>\n');
    assert.equal(applyHeadBlock(once, sampleBlock('第一版'), 'x.html'), once);
    // 已經有那一段：換成新的，不是再插一份，前後不動
    const second = applyHeadBlock(once, sampleBlock('第二版'), 'x.html');
    assert.equal(second, once.replace('第一版', '第二版'));
    assert.equal(count(second, '<!-- /分享預覽與主畫面 -->'), 1);
    // 真的頁面也一樣
    const { headBlock, BAR_TOKEN } = await importSite();
    const site = await loadSite();
    const barColor = site.tokens.light.get(BAR_TOKEN);
    for (const page of site.pages) {
        const html = read(page.file);
        const block = headBlock(page, barColor);
        assert.equal(applyHeadBlock(html, block, page.file), html, `${page.file} 重跑應該沒有任何變化`);
    }
});

test('applyHeadBlock：開頭、結尾註解對不上就丟錯（不產生兩份）', async () => {
    const { applyHeadBlock } = await importSite();
    const once = applyHeadBlock(SAMPLE_HTML, sampleBlock('a'), 'x.html');
    const twoBlocks = once.replace('</head>', sampleBlock('b') + '\n</head>');
    assert.throws(() => applyHeadBlock(twoBlocks, sampleBlock('c'), 'dup.html'), /dup\.html/);
    const startOnly = once.replace('    <!-- /分享預覽與主畫面 -->\n', '');
    assert.throws(() => applyHeadBlock(startOnly, sampleBlock('c'), 'broken.html'), /broken\.html/);
});

test('找不到 favicon 那一行：applyHeadBlock 丟錯，訊息含檔名', async () => {
    const { applyHeadBlock } = await importSite();
    const noIcon = SAMPLE_HTML.replace(/    <link rel="icon"[^\n]*\n/, '');
    assert.throws(() => applyHeadBlock(noIcon, sampleBlock('a'), 'tools/new-tool/index.html'), (error) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('tools/new-tool/index.html'), error.message);
        return true;
    });
    // 寫法不同（rel 不是 icon、屬性在別的順序也找得到 rel="icon"）：apple-touch-icon 不算 favicon
    const onlyTouchIcon = SAMPLE_HTML.replace('<link rel="icon" type="image/x-icon" href="a.ico">', '<link rel="apple-touch-icon" href="a.png">');
    assert.throws(() => applyHeadBlock(onlyTouchIcon, sampleBlock('a'), 'touch.html'), /touch\.html/);
    const reordered = SAMPLE_HTML.replace('<link rel="icon" type="image/x-icon" href="a.ico">', '<link href="a.ico" rel="icon">');
    assert.ok(applyHeadBlock(reordered, sampleBlock('a'), 'reordered.html').includes('<link href="a.ico" rel="icon">\n    <!-- 分享預覽與主畫面'));
});

// ---------- 指令 ----------

test('pages 指令：在複本上重跑沒有任何檔案被改；改壞的檔案被補回來，只印出、只寫那幾個', async () => {
    await withSiteCopy(async (dir, site) => {
        const all = [...site.pages.map((page) => page.file), ...site.manifests.map((manifest) => manifest.file)];
        const OLD = new Date('2020-01-01T00:00:00Z');
        const mtime = (file) => fs.statSync(path.join(dir, file)).mtimeMs;
        for (const file of all) fs.utimesSync(path.join(dir, file), OLD, OLD);

        // repo 現在的內容是最新的：沒有檔案被改，也沒有檔案被重寫（修改時間不變）
        let result = runCli(dir, 'pages');
        assert.equal(result.status, 0, result.stderr);
        for (const file of all) assert.equal(mtime(file), OLD.getTime(), `${file} 內容沒變，不該重寫`);
        assert.doesNotMatch(result.stdout, /\.html|\.webmanifest/, '沒有改任何檔案，就不列檔名');

        // 弄壞一頁的標題、再刪一個 manifest：只有這兩個被補回來
        const page = path.join(dir, 'tools/weather-forecast/index.html');
        const original = fs.readFileSync(page, 'utf8');
        fs.writeFileSync(page, original.replace('<meta property="og:title" content="天氣預報 - FF14.tw">', '<meta property="og:title" content="舊的">'));
        fs.utimesSync(page, OLD, OLD);
        fs.rmSync(path.join(dir, 'tools/macro-converter/manifest.webmanifest'));
        result = runCli(dir, 'pages');
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.readFileSync(page, 'utf8'), original);
        assert.equal(fs.readFileSync(path.join(dir, 'tools/macro-converter/manifest.webmanifest'), 'utf8'), read('tools/macro-converter/manifest.webmanifest'));
        assert.ok(result.stdout.includes('tools/weather-forecast/index.html'), result.stdout);
        assert.ok(result.stdout.includes('tools/macro-converter/manifest.webmanifest'), result.stdout);
        assert.equal([...result.stdout.matchAll(/\.(?:html|webmanifest)\b/g)].length, 2, `只列出這兩個檔：${result.stdout}`);
        for (const file of all.filter((name) => name !== 'tools/weather-forecast/index.html' && name !== 'tools/macro-converter/manifest.webmanifest')) {
            assert.equal(mtime(file), OLD.getTime(), `${file} 沒壞，不該重寫`);
        }
        assert.ok(mtime('tools/weather-forecast/index.html') > OLD.getTime());
    });
});

test('pages 指令：改了頁面說明之後重跑，那一頁的預覽與 manifest 跟著變；有一頁出錯時所有檔案都不寫', async () => {
    await withSiteCopy(async (dir) => {
        // 改天氣頁的說明
        const page = path.join(dir, 'tools/weather-forecast/index.html');
        const html = fs.readFileSync(page, 'utf8');
        fs.writeFileSync(page, html.replace('<meta name="description" content="查看艾歐澤亞各地區的天氣預報，搜尋特定天氣條件，追蹤特殊事件">', '<meta name="description" content="新的說明 &amp; 跳脫">'));
        let result = runCli(dir, 'pages');
        assert.equal(result.status, 0, result.stderr);
        const next = fs.readFileSync(page, 'utf8');
        assert.ok(next.includes('<meta property="og:description" content="新的說明 &amp; 跳脫">'));
        assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'tools/weather-forecast/manifest.webmanifest'), 'utf8')).description, '新的說明 & 跳脫');
        // og:image:alt 用的是首頁卡片那一句，不跟著頁面說明變
        assert.ok(next.includes('<meta property="og:image:alt" content="天氣預報：查看艾歐澤亞各地區的天氣預報，搜尋特定天氣條件">'));
        assert.equal(count(next, '分享預覽與主畫面：由'), 1);

        // 另一頁拿掉 favicon：丟錯、非 0 結束、訊息有檔名，而且天氣頁不會因為這次失敗又被改一次（先全部算好才寫）
        const broken = path.join(dir, 'tools/macro-converter/index.html');
        const brokenHtml = fs.readFileSync(broken, 'utf8').replace(/ *<link rel="icon"[^\n]*\n/, '').replace(/ *<!-- 分享預覽與主畫面[\s\S]*?<!-- \/分享預覽與主畫面 -->\n/, '');
        fs.writeFileSync(broken, brokenHtml);
        fs.writeFileSync(page, next.replace('新的說明 &amp; 跳脫', '再改一次'));
        const before = fs.readFileSync(page, 'utf8');
        result = runCli(dir, 'pages');
        assert.notEqual(result.status, 0);
        assert.ok(result.stderr.includes('tools/macro-converter/index.html'), result.stderr);
        assert.equal(fs.readFileSync(page, 'utf8'), before, '出錯時其他頁不寫');
        assert.equal(fs.readFileSync(broken, 'utf8'), brokenHtml);
    });
});

test('pages 指令以外的參數：印用法並以非 0 結束，不改任何檔案', async () => {
    await withSiteCopy(async (dir, site) => {
        const snapshot = () => site.pages.map((page) => fs.readFileSync(path.join(dir, page.file), 'utf8')).join('\0');
        const before = snapshot();
        for (const args of [[], ['images-x'], ['pages', 'extra'], ['--help']]) {
            const result = runCli(dir, ...args);
            assert.notEqual(result.status, 0, `參數 ${JSON.stringify(args)}`);
            assert.match(result.stderr, /用法/, `參數 ${JSON.stringify(args)}`);
            assert.match(result.stderr, /pages/);
        }
        assert.equal(snapshot(), before);
    });
});

test('loadSite：有工具不在 TOOL_COLORS、token 不存在、頁面沒有說明時丟錯，訊息指出是哪一個', async () => {
    const { loadSite: load } = await importSite();
    await withSiteCopy(async (dir) => {
        // 登錄表多一個還沒登記顏色的工具
        const registryFile = path.join(dir, 'assets/js/components/tools-registry.js');
        const registry = fs.readFileSync(registryFile, 'utf8');
        fs.writeFileSync(registryFile, registry.replace("        { id: 'tc-shop',", "        { id: 'new-tool', href: 'tools/new-tool/index.html', icon: '🆕', i18nKey: 'tool_new_title', name: '新工具' },\n        { id: 'tc-shop',"));
        assert.throws(() => load(dir), (error) => /new-tool/.test(error.message) && /TOOL_COLORS/.test(error.message), '沒有顏色的工具');
        fs.writeFileSync(registryFile, registry);
        assert.doesNotThrow(() => load(dir));

        // tokens.css 淺色沒有工具用的 token
        const tokensFile = path.join(dir, 'assets/css/tokens.css');
        const tokens = fs.readFileSync(tokensFile, 'utf8');
        fs.writeFileSync(tokensFile, tokens.replace(/ *--color-info: #0e7c9c;\n/, ''));
        assert.throws(() => load(dir), /--color-info/);
        fs.writeFileSync(tokensFile, tokens);

        // 沒有網址列顏色的 token
        fs.writeFileSync(tokensFile, tokens.replace(/ *--color-browser-bar: #667eea;\n/, ''));
        assert.throws(() => load(dir), /--color-browser-bar/);
        fs.writeFileSync(tokensFile, tokens);

        // 頁面沒有說明：點名是哪一頁
        const pageFile = path.join(dir, 'tools/weather-forecast/index.html');
        const page = fs.readFileSync(pageFile, 'utf8');
        fs.writeFileSync(pageFile, page.replace(/ *<meta name="description"[^\n]*\n/, ''));
        assert.throws(() => load(dir), /tools\/weather-forecast\/index\.html/);
        fs.writeFileSync(pageFile, page);

        // 首頁卡片沒有說明
        const indexFile = path.join(dir, 'assets/js/i18n/translations/index.js');
        const index = fs.readFileSync(indexFile, 'utf8');
        fs.writeFileSync(indexFile, index.replace(/ *tool_weather_forecast_desc: [^\n]*\n/, ''));
        assert.throws(() => load(dir), /tool_weather_forecast_desc/);
    });
});
