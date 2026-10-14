const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createFakeDom } = require('./helpers/fake-dom.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');
// 登錄表直接在 Node 端載入當作比對基準；not-found.js、layout-loader 與 i18n 則在 fake-dom 的 vm 裡載入真正的腳本，順序同 404.html
const ToolsRegistry = require('../assets/js/components/tools-registry.js');

const ROOT = path.join(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const PAGE_FILE = '404.html';
const SCRIPT_FILE = 'assets/js/not-found.js';
const TRANSLATIONS_FILE = 'assets/js/i18n/translations/not-found.js';
const COMMON_FILE = 'assets/js/i18n/translations/common.js';
const LANGS = ['zh', 'en', 'ja'];
const MOBILE = '(max-width: 768px)';
const PHONE = '(max-width: 480px)';

// 每個測試才讀檔：檔案不存在時，失敗的是那個測試（ENOENT），不是整份測試檔載入不了
const html = () => read(PAGE_FILE);
const zhText = (key) => translationValues(TRANSLATIONS_FILE, 'zh').get(key);

// ---------- 最小 HTML 解析（只解析字串，不需要 DOM；不假設屬性順序） ----------
function parseAttrs(source) {
    const attrs = {};
    for (const m of source.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = m[2] ?? m[3];
    return attrs;
}

// 含有 needle 的那個開始標籤（整個 <…>）的屬性
function attrsOfTagWith(source, needle) {
    const at = source.indexOf(needle);
    assert.notEqual(at, -1, `找不到 ${needle}`);
    return parseAttrs(source.slice(source.lastIndexOf('<', at), source.indexOf('>', at) + 1));
}

// ---------- 404.html：路徑與載入順序 ----------

test('404.html 的站內資源與連結都用根目錄絕對路徑', () => {
    // GitHub Pages 會在任何不存在的網址顯示這一頁，網址可能有好幾層（/tools/weather-forecast/打錯），
    // 相對路徑會被解析成那一層底下的路徑，樣式與腳本都載入不到
    const source = html();
    const values = [...source.matchAll(/\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]);
    assert.equal(values.length, [...source.matchAll(/\s(?:src|href)\s*=/g)].length, '所有 src／href 的值都要加引號');
    assert.ok(values.length >= 20, `只找到 ${values.length} 個 src／href，解析可能失效`);

    for (const value of values) {
        assert.match(value, /^(?:\/(?!\/)|https?:\/\/|#|mailto:)/, `"${value}" 不是以 / 開頭的根目錄絕對路徑`);
    }
    // 根目錄絕對路徑指到的檔案都存在（'/' 是首頁）
    for (const value of values.filter((v) => v.startsWith('/'))) {
        const file = value === '/' ? 'index.html' : value.slice(1);
        assert.ok(fs.existsSync(path.join(ROOT, file)), `"${value}" 指到的檔案 ${file} 不存在`);
    }
    assert.ok(values.includes('/assets/images/ff14tw.ico'), '圖示也要用根目錄絕對路徑');

    for (const id of ['header-placeholder', 'footer-placeholder']) {
        assert.equal(attrsOfTagWith(source, `id="${id}"`)['data-base-path'], '/', `#${id} 的 data-base-path 要是 /`);
    }
});

test('404.html 依序載入 tokens、common、language-switcher、buttons、pages 樣式，與 i18n → 登錄表 → 頁首頁尾 → common.js → not-found.js 腳本', () => {
    const source = html();

    const stylesheets = [...source.matchAll(/<link\b[^>]*>/g)]
        .map((m) => parseAttrs(m[0]))
        .filter((attrs) => attrs.rel === 'stylesheet' && attrs.href.startsWith('/'))
        .map((attrs) => attrs.href);
    assert.deepEqual(stylesheets, [
        '/assets/css/tokens.css',
        '/assets/css/common.css',
        '/assets/css/components/language-switcher.css',
        '/assets/css/components/buttons.css',
        '/assets/css/pages.css'
    ]);

    const scripts = [...source.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(scripts, [
        '/assets/js/i18n/i18n-manager.js',
        '/assets/js/i18n/translations/common.js',
        '/assets/js/i18n/translations/not-found.js',
        '/assets/js/components/tools-registry.js',
        '/assets/js/components/nav-template.js',
        '/assets/js/components/footer-template.js',
        '/assets/js/components/layout-loader.js',
        '/assets/js/common.js',
        '/assets/js/not-found.js'
    ]);
});

test('404.html 的 noscript 導覽和其他根頁面相同', () => {
    const noscript = (source) => source.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1].replace(/\s+/g, ' ').trim();
    const expected = noscript(read('about.html'));
    assert.ok(expected && expected.includes('noscript-nav'), '解析不到 about.html 的 noscript 導覽，測試可能失效');
    assert.equal(noscript(html()), expected);
});

// ---------- 404.html：頁面屬性與內容 ----------

test('404.html 不被搜尋引擎收錄，頁首帶 data-page="404"，標題隨語言切換', () => {
    const source = html();
    assert.match(source, /<meta\s+name="robots"\s+content="noindex">/);

    const root = attrsOfTagWith(source, '<html');
    assert.equal(root.lang, 'zh-Hant');
    assert.equal(root['data-i18n-title'], 'not_found_title');
    // 靜態 <title> 等於 zh 翻譯加上「 - FF14.tw」：I18nManager 套用前後不會閃一下別的字
    assert.equal(source.match(/<title>([^<]*)<\/title>/)?.[1], `${zhText('not_found_title')} - FF14.tw`);

    const header = attrsOfTagWith(source, 'id="header-placeholder"');
    assert.equal(header['data-page'], '404');
    assert.ok(!('data-tool-name' in header) && !('data-tool-name-key' in header), '404 頁不是工具頁，頁首不帶工具名稱');
});

test('404 頁在工具目錄底下的網址，頁首也不標示目前的工具、不記錄最近使用', () => {
    // 用 404.html 上真正的 #header-placeholder 屬性；網址剛好在天氣預報的目錄底下，照目錄比對會誤判成天氣預報
    const placeholder = attrsOfTagWith(html(), 'id="header-placeholder"');
    const dom = createFakeDom({ url: 'https://ff14.tw/tools/weather-forecast/typo', readyState: 'loading' });
    dom.document.body.appendChild(dom.el('div', placeholder));
    const writes = [];
    dom.window.localStorage = { getItem: () => null, setItem: (key, value) => writes.push([key, value]) };
    dom.load('assets/js/components/tools-registry.js');
    dom.load('assets/js/components/nav-template.js');
    dom.load('assets/js/components/layout-loader.js');
    dom.document.dispatchEvent(new dom.window.CustomEvent('DOMContentLoaded'));

    const header = dom.document.querySelector('header.header');
    assert.ok(header, '頁首沒有載入');
    assert.equal(header.querySelector('.nav-tools-toggle').classList.contains('active'), false, '工具按鈕不該是 active');
    const menuLinks = header.querySelectorAll('.tools-menu a');
    assert.equal(menuLinks.length, ToolsRegistry.tools.length);
    for (const link of menuLinks) {
        assert.ok(!link.classList.contains('active') && !link.hasAttribute('aria-current'), `${link.getAttribute('href')} 不該標成目前的工具`);
    }
    assert.deepEqual(writes, [], '404 頁不記錄最近使用');
});

test('404.html 的內容：404、標題、說明、回首頁按鈕，與「或直接選一個工具」＋空的工具清單', () => {
    const source = html();
    const main = source.slice(source.indexOf('<main'), source.indexOf('</main>'));
    assert.ok(main.startsWith('<main'), '找不到 <main>');

    // 每個開始標籤依出現順序：標籤、class（排序後）、id、data-i18n、href、緊接著的文字
    const parts = [...main.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>([^<]*)/g)].map((m) => {
        const attrs = parseAttrs(m[2]);
        const classes = (attrs.class || '').split(/\s+/).filter(Boolean).sort().join(' ');
        return [m[1], classes, attrs.id ?? '', attrs['data-i18n'] ?? '', attrs.href ?? '', m[3].trim()];
    });
    assert.deepEqual(parts, [
        ['main', 'main', '', '', '', ''],
        ['div', 'container', '', '', '', ''],
        ['section', 'not-found', '', '', '', ''],
        ['p', 'not-found-code', '', '', '', '404'],
        ['h1', '', '', 'not_found_title', '', zhText('not_found_title')],
        ['p', '', '', 'not_found_text', '', zhText('not_found_text')],
        ['a', 'btn btn-lg btn-primary', '', 'not_found_home', '/', zhText('not_found_home')],
        ['section', 'not-found-tools', '', '', '', ''],
        ['h2', 'section-label', '', 'not_found_tools_title', '', zhText('not_found_tools_title')],
        ['div', 'not-found-list', 'notFoundTools', '', '', '']
    ]);
    assert.match(main, /<div\b[^>]*\bid="notFoundTools"[^>]*>\s*<\/div>/, '清單由 not-found.js 產生，靜態 HTML 裡是空的');
    assert.doesNotMatch(main, /hero-compact|home-main/, '404 頁不用首頁專屬的 class');

    // 關掉 JavaScript 時清單不會產生：區塊預設 hidden，由 not-found.js 畫出至少一個工具後才顯示，
    // 不會在空的清單上面留一個孤零零的「或直接選一個工具」
    const toolsOpenTag = main.match(/<section\b[^>]*\bclass="not-found-tools"[^>]*>/)?.[0];
    assert.ok(toolsOpenTag, '找不到 section.not-found-tools');
    assert.match(toolsOpenTag, /\shidden(?=[\s>=])/, 'section.not-found-tools 要預設 hidden');
});

// ---------- 翻譯 ----------

test('not-found.js 翻譯檔有四個鍵的 zh／en／ja，與 common.js 的鍵不重複，並自行註冊', () => {
    const EXPECTED = {
        not_found_title: { zh: '找不到這個頁面', en: 'Page not found', ja: 'ページが見つかりません' },
        not_found_text: { zh: '網址可能打錯了，或這個頁面已經搬家。', en: 'The address may be mistyped, or the page has moved.', ja: 'URLが間違っているか、ページが移動した可能性があります。' },
        not_found_home: { zh: '回首頁', en: 'Back to home', ja: 'ホームに戻る' },
        not_found_tools_title: { zh: '或直接選一個工具', en: 'Or pick a tool', ja: 'またはツールを選ぶ' }
    };
    for (const lang of LANGS) {
        const values = translationValues(TRANSLATIONS_FILE, lang);
        assert.ok(values.size > 0, `解析不到 ${TRANSLATIONS_FILE} 的 ${lang} 語系，測試可能失效`);
        assert.deepEqual([...values.keys()].sort(), Object.keys(EXPECTED).sort(), `${lang} 語系只該有這四個鍵`);
        const common = translationKeySet(COMMON_FILE, lang);
        for (const [key, texts] of Object.entries(EXPECTED)) {
            assert.equal(values.get(key), texts[lang], `${TRANSLATIONS_FILE} 的 ${lang} 語系 ${key}`);
            assert.ok(!common.has(key), `${COMMON_FILE} 的 ${lang} 語系不該重複定義 ${key}`);
        }
    }
    assert.match(read(TRANSLATIONS_FILE), /window\.i18n\.loadTranslations\('not-found',\s*NotFoundTranslations\)/);
    assert.match(read(TRANSLATIONS_FILE), /^const NotFoundTranslations = \{/m);
});

// ---------- not-found.js：工具清單 ----------

// 依 404.html 的順序載入：（i18n）→ 登錄表 → not-found.js。#notFoundTools 與預設 hidden 的 section.not-found-tools
// 先放進文件，和真實頁面一樣由 HTML 提供
function setup({ readyState = 'complete', i18n = false, storage = { getItem: () => null, setItem() {} } } = {}) {
    const dom = createFakeDom({ url: 'https://ff14.tw/tools/weather-forecast/typo', readyState });
    const list = dom.el('div', { class: 'not-found-list', id: 'notFoundTools' });
    const section = dom.el('section', { class: 'not-found-tools', hidden: true }, dom.el('h2', { class: 'section-label' }, zhText('not_found_tools_title')), list);
    dom.document.body.appendChild(section);
    if (i18n) {
        dom.window.navigator = { languages: ['zh-TW'] };
        dom.window.localStorage = storage;
        dom.load('assets/js/i18n/i18n-manager.js');
        dom.load(COMMON_FILE);
        dom.load(TRANSLATIONS_FILE);
    }
    dom.load('assets/js/components/tools-registry.js');
    dom.load(SCRIPT_FILE);
    return { dom, list, section };
}

const dispatchLoaded = (dom) => dom.document.dispatchEvent(new dom.window.CustomEvent('DOMContentLoaded'));

test('renderToolList 依登錄表順序列出 13 個工具，站內用根目錄絕對路徑，水晶商城開新分頁', () => {
    const { dom, list } = setup();
    assert.equal(dom.window.i18n, undefined, '不設 window.i18n，名稱顯示登錄表的 zh 名稱');
    assert.equal(ToolsRegistry.tools.length, 13);

    dom.window.NotFoundPage.renderToolList(dom.document);
    const links = list.querySelectorAll('a.not-found-tool');
    assert.equal(links.length, 13);
    assert.equal(list.children.length, 13, '清單裡只有這 13 個連結（載入時畫過一次，再呼叫不會疊加）');

    assert.equal(links[0].getAttribute('href'), '/tools/mini-cactpot/index.html');
    const last = links[links.length - 1];
    assert.equal(last.getAttribute('href'), 'https://tc-shop.ff14.tw');
    assert.equal(last.getAttribute('target'), '_blank');
    assert.equal(last.getAttribute('rel'), 'noopener noreferrer');

    links.forEach((link, index) => {
        const tool = ToolsRegistry.tools[index];
        const what = `第 ${index + 1} 個（${tool.id}）`;
        assert.equal(link.getAttribute('href'), tool.external ? tool.href : `/${tool.href}`, `${what}的 href`);
        if (tool.external) {
            assert.equal(link.getAttribute('target'), '_blank', what);
            assert.equal(link.getAttribute('rel'), 'noopener noreferrer', what);
        } else {
            assert.ok(!link.hasAttribute('target') && !link.hasAttribute('rel'), `${what}是站內連結，不開新分頁`);
        }
        assert.ok(!link.hasAttribute('data-i18n'), `${what}：data-i18n 要放在名稱 span，不能放在連結上`);

        // 圖示、名稱（、↗）是兄弟節點：切換語言時只有名稱的文字會被覆寫
        assert.deepEqual(
            link.children.map((child) => child.className),
            tool.external ? ['not-found-tool-icon', 'not-found-tool-name', 'not-found-tool-ext'] : ['not-found-tool-icon', 'not-found-tool-name'],
            what
        );
        const icon = link.querySelector('span.not-found-tool-icon');
        assert.equal(icon.getAttribute('aria-hidden'), 'true', what);
        assert.equal(icon.textContent, tool.icon, what);
        const name = link.querySelector('span.not-found-tool-name');
        assert.equal(name.getAttribute('data-i18n'), tool.i18nKey, what);
        assert.equal(name.textContent, tool.name, `${what}沒有 i18n 時顯示 zh 名稱`);
        assert.equal(name.children.length, 0, what);

        const marks = link.querySelectorAll('.not-found-tool-ext');
        assert.equal(marks.length, tool.external ? 1 : 0, `${what}的 ↗`);
        for (const mark of marks) {
            assert.equal(mark.getAttribute('aria-hidden'), 'true', what);
            assert.equal(mark.textContent, '↗', what);
            assert.ok(!mark.hasAttribute('data-i18n') && !name.contains(mark), `${what}的 ↗ 要在名稱 span 外面，不會被語言切換洗掉`);
        }
    });
});

test('renderToolList 可以重複呼叫，每次重建清單；也可以指定查詢範圍', () => {
    const { dom, list } = setup();
    const { NotFoundPage } = dom.window;
    const names = () => list.querySelectorAll('.not-found-tool-name').map((name) => name.textContent);
    const expected = ToolsRegistry.tools.map((tool) => tool.name);
    assert.deepEqual(names(), expected);

    NotFoundPage.renderToolList();
    NotFoundPage.renderToolList(dom.document);
    NotFoundPage.renderToolList(dom.document.body);
    assert.deepEqual(names(), expected, '重複呼叫不會把連結疊上去');

    list.textContent = '';
    NotFoundPage.renderToolList(dom.document.body);
    assert.deepEqual(names(), expected, '查詢範圍是 body 也找得到 #notFoundTools');
});

test('工具名稱帶 data-i18n，切換語言時跟著 zh／en／ja 更新，圖示與 ↗ 不受影響', () => {
    const names = (lang) => ToolsRegistry.tools.map((tool) => translationValues(COMMON_FILE, lang).get(tool.i18nKey));
    assert.notDeepEqual(names('en'), names('zh'), '三個語系的名稱要真的不同，這個測試才有意義');
    assert.notDeepEqual(names('ja'), names('zh'));

    // 照真實頁面：文件載入中，I18nManager 與 not-found.js 都等 DOMContentLoaded
    const { dom, list } = setup({ readyState: 'loading', i18n: true });
    assert.equal(list.children.length, 0, 'DOMContentLoaded 之前還不畫');
    dispatchLoaded(dom);
    const { i18n } = dom.window;
    const shown = () => list.querySelectorAll('.not-found-tool-name').map((name) => name.textContent);

    assert.equal(i18n.getCurrentLanguage(), 'zh');
    assert.deepEqual(shown(), names('zh'));
    for (const lang of ['en', 'ja', 'zh']) {
        i18n.setLanguage(lang);
        assert.deepEqual(shown(), names(lang), `切到 ${lang}`);
        assert.deepEqual(list.querySelectorAll('.not-found-tool-icon').map((icon) => icon.textContent), ToolsRegistry.tools.map((tool) => tool.icon), `切到 ${lang}，圖示還在`);
        assert.deepEqual(list.querySelectorAll('.not-found-tool-ext').map((mark) => mark.textContent), ['↗'], `切到 ${lang}，↗ 還在`);
        assert.equal(list.querySelectorAll('a.not-found-tool').length, 13);
    }

    // 玩家上次選的是日文：畫出來的當下就是日文名稱，不是先出現中文再換
    const ja = setup({ readyState: 'loading', i18n: true, storage: { getItem: (key) => (key === 'ff14tw_preferred_language' ? 'ja' : null), setItem() {} } });
    dispatchLoaded(ja.dom);
    assert.deepEqual(ja.list.querySelectorAll('.not-found-tool-name').map((name) => name.textContent), names('ja'));
});

test('not-found.js：文件載入中等 DOMContentLoaded 才畫，載入時文件已經就緒就直接畫；缺少清單容器或登錄表時不丟例外', () => {
    const loading = setup({ readyState: 'loading' });
    assert.equal(loading.list.children.length, 0, 'DOMContentLoaded 之前還不畫');
    dispatchLoaded(loading.dom);
    assert.equal(loading.list.querySelectorAll('a.not-found-tool').length, 13);

    const ready = setup({ readyState: 'interactive' });
    assert.equal(ready.list.querySelectorAll('a.not-found-tool').length, 13);

    // 沒有 #notFoundTools 的頁面：載入與呼叫都不丟例外
    const bare = createFakeDom({ url: 'https://ff14.tw/404.html' });
    bare.load('assets/js/components/tools-registry.js');
    assert.doesNotThrow(() => bare.load(SCRIPT_FILE));
    assert.doesNotThrow(() => bare.window.NotFoundPage.renderToolList());

    // 登錄表沒載入：清單維持空的，不丟例外
    const noRegistry = createFakeDom({ url: 'https://ff14.tw/404.html' });
    const list = noRegistry.el('div', { id: 'notFoundTools' });
    noRegistry.document.body.appendChild(list);
    assert.doesNotThrow(() => noRegistry.load(SCRIPT_FILE));
    assert.equal(list.children.length, 0);
});

test('「或直接選一個工具」區塊預設 hidden，畫出至少一個工具後才顯示；登錄表沒載入或是空的就維持隱藏', () => {
    // 文件載入中：DOMContentLoaded 之前還沒畫，區塊是隱藏的（關掉 JavaScript 時永遠是這個樣子）
    const loading = setup({ readyState: 'loading' });
    assert.equal(loading.section.hidden, true, 'DOMContentLoaded 之前');
    dispatchLoaded(loading.dom);
    assert.equal(loading.list.children.length, 13);
    assert.equal(loading.section.hidden, false, '畫出 13 個工具之後');

    // 載入時文件已經就緒：直接畫，區塊同時顯示；重複呼叫不會把它再藏起來
    const ready = setup({ readyState: 'interactive' });
    assert.equal(ready.section.hidden, false);
    ready.dom.window.NotFoundPage.renderToolList(ready.dom.document);
    assert.equal(ready.section.hidden, false, '重畫之後仍然顯示');

    // 沒有載入登錄表：一個工具都畫不出來，區塊維持隱藏，不丟例外
    const bare = (registry) => {
        const dom = createFakeDom({ url: 'https://ff14.tw/404.html' });
        if (registry) dom.window.ToolsRegistry = registry;
        const toolList = dom.el('div', { id: 'notFoundTools' });
        const section = dom.el('section', { class: 'not-found-tools', hidden: true }, toolList);
        dom.document.body.appendChild(section);
        assert.doesNotThrow(() => dom.load(SCRIPT_FILE));
        return { toolList, section };
    };
    const noRegistry = bare(null);
    assert.equal(noRegistry.toolList.children.length, 0);
    assert.equal(noRegistry.section.hidden, true, '登錄表沒載入');

    // 登錄表是空的：同樣沒有工具可以列出
    const emptyRegistry = bare({ tools: [] });
    assert.equal(emptyRegistry.toolList.children.length, 0);
    assert.equal(emptyRegistry.section.hidden, true, '登錄表是空的');

    // 清單容器不在 section.not-found-tools 裡面：照樣畫出工具，不丟例外
    const orphan = createFakeDom({ url: 'https://ff14.tw/404.html' });
    const orphanList = orphan.el('div', { id: 'notFoundTools' });
    orphan.document.body.appendChild(orphanList);
    orphan.load('assets/js/components/tools-registry.js');
    assert.doesNotThrow(() => orphan.load(SCRIPT_FILE));
    assert.equal(orphanList.children.length, 13);
});

// ---------- 樣式 ----------

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

test('pages.css：.not-found 置中；.not-found-code 的選擇器權重蓋得過 .not-found p；清單桌機 3 欄、≤768px 2 欄、≤480px 1 欄', () => {
    const rules = cssRules(stripComments(read('assets/css/pages.css')));
    const find = (selector, media = null) => {
        const found = rules.find((rule) => rule.media === media && rule.selectors.includes(selector));
        assert.ok(found, `pages.css 找不到 ${selector}${media ? `（@media ${media}）` : ''} 的規則`);
        return found.body;
    };

    assert.match(find('.not-found'), /text-align:\s*center/);

    // 單獨的 .not-found-code（0,1,0）比 .not-found p（0,1,1）弱，顏色與字級會被後者蓋掉；
    // 用 .not-found .not-found-code（0,2,0）才贏得過
    const code = find('.not-found .not-found-code');
    assert.match(code, /color:\s*var\(--color-primary\)/);
    assert.match(code, /font-size:\s*var\(--text-5xl\)/);
    assert.ok(!rules.some((rule) => rule.selectors.includes('.not-found-code')), '不要再有權重較低的單獨 .not-found-code 規則');

    const list = find('.not-found-list');
    assert.match(list, /display:\s*grid/);
    assert.match(list, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, '桌機 3 欄');
    assert.match(find('.not-found-list', MOBILE), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, '≤768px 2 欄');
    // 手機單欄：2 欄時 390px 寬的名稱只剩約 95px，大半被截成「…」；單欄要寫成 minmax(0, 1fr)，欄寬才縮得到比內容窄
    assert.match(find('.not-found-list', PHONE), /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*(?:;|$)/, '≤480px 1 欄');
    // ≤480px 時兩個 @media 都成立，同樣權重的規則後寫的贏：單欄的規則要排在 768px 那條後面
    assert.deepEqual(
        rules.filter((rule) => rule.selectors.includes('.not-found-list')).map((rule) => rule.media),
        [null, MOBILE, PHONE],
        '.not-found-list 的規則依序是基準、≤768px、≤480px'
    );

    // ↗ 是 404 頁自己的樣式，不要併進頁首的 .tools-menu-ext（手機版會在那裡把顏色換成頁首的文字色）
    assert.match(find('.not-found-tool-ext'), /flex:\s*none/);
    const common = cssRules(stripComments(read('assets/css/common.css')));
    assert.ok(!common.some((rule) => rule.selectors.includes('.tools-menu-ext') && rule.selectors.some((selector) => selector.includes('not-found'))));
});

test('common.css：.not-found-tool 系列併進 .recent-tool 的四條規則，pages.css 不重複宣告外觀', () => {
    const common = cssRules(stripComments(read('assets/css/common.css')));
    const pages = cssRules(stripComments(read('assets/css/pages.css')));
    const PAIRS = [
        ['.recent-tool', '.not-found-tool'],
        ['.recent-tool:hover', '.not-found-tool:hover'],
        ['.recent-tool-icon', '.not-found-tool-icon'],
        ['.recent-tool-name', '.not-found-tool-name']
    ];
    for (const [recent, notFound] of PAIRS) {
        const rule = common.find((candidate) => candidate.media === null && candidate.selectors.includes(recent));
        assert.ok(rule, `common.css 找不到 ${recent} 的規則`);
        assert.ok(rule.selectors.includes(notFound), `${notFound} 要和 ${recent} 在同一條規則的選擇器清單裡（選擇器分組，不複製宣告）`);
        assert.equal(common.filter((candidate) => candidate.selectors.includes(notFound)).length, 1, `${notFound} 在 common.css 只出現一次`);
        assert.ok(!pages.some((candidate) => candidate.selectors.includes(notFound)), `pages.css 不該再宣告 ${notFound}`);
    }
});

test('pages.css、common.css：section.not-found-tools 本身不設 display，[hidden] 才收得起來', () => {
    // 作者樣式的 display 會蓋過瀏覽器內建的 [hidden] { display: none }：一旦替這個區塊（不是它裡面的元素）設了 display，
    // 沒有 JavaScript 時它就會顯示出來，變成空清單上面的一行孤零零的標題。排版（grid）放在裡面的 .not-found-list，
    // 和首頁的 .recent-tools 同一個做法
    const rules = ['assets/css/pages.css', 'assets/css/common.css'].flatMap((file) => cssRules(stripComments(read(file))));
    // 前提：解析得到 404 區塊的規則，而且「選擇器的最後一段才是目標」的判斷把 .not-found-tools .section-label 排除在外
    assert.ok(rules.some((rule) => rule.selectors.includes('.not-found-tools .section-label')), '解析不到 .not-found-tools .section-label 的規則，測試可能失效');
    const targetsSection = (selector) => selector.split(/[\s>+~]+/).pop().includes('.not-found-tools');
    assert.equal(targetsSection('.not-found-tools .section-label'), false);
    assert.equal(targetsSection('.main .not-found-tools'), true);

    for (const rule of rules.filter((candidate) => candidate.selectors.some(targetsSection))) {
        assert.doesNotMatch(rule.body, /(?:^|[;\s])display\s*:/, `${rule.selectors.join(', ')} 不該設 display`);
    }
});
