const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeDom } = require('./helpers/fake-dom.js');
const { mountFromHtml, sliceElementById } = require('./helpers/html-fragment.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PAGE = 'changelog.html';
const CSS = 'assets/css/changelog.css';
const TRANSLATIONS = 'assets/js/i18n/translations/changelog.js';
const LANGS = ['zh', 'en', 'ja'];

// 照 changelog.html 的標記建出 #changelogEntries（每次呼叫都是新的一份）
function entries(url = 'https://ff14.tw/changelog.html') {
    const dom = createFakeDom({ url });
    mountFromHtml(dom, read(PAGE), ['changelogEntries']);
    return { dom, list: dom.document.getElementById('changelogEntries'), all: dom.document.querySelectorAll('.changelog-entry') };
}
// fake-dom 不支援逗號選擇器，分開查
const itemsOf = (entry) => [...entry.querySelectorAll('li'), ...entry.querySelectorAll('.changelog-single-item')];
const versionOf = (entry) => entry.querySelector('.changelog-version').textContent.trim();
const TAG_WORDS = new Map([['tag-success', '新增'], ['tag-info', '改善'], ['tag-warning', '修正'], ['tag-outline-primary', '里程碑']]);

// ---------- 標籤與圖例 ----------

test('條目的標籤只有新增、改善、修正、里程碑四種，里程碑只有最早的兩條', () => {
    const { list } = entries();
    const tags = list.querySelectorAll('.tag');
    assert.ok(tags.length >= 185, `只找到 ${tags.length} 個標籤，解析可能失效`);

    for (const tag of tags) {
        const text = tag.textContent.trim();
        const kinds = [...TAG_WORDS.keys()].filter((name) => tag.classList.contains(name));
        assert.equal(kinds.length, 1, `標籤「${text}」的 class 是「${tag.className}」，要剛好有 ${[...TAG_WORDS.keys()].join('、')} 其中一個`);
        assert.equal(text, TAG_WORDS.get(kinds[0]), `class 是「${tag.className}」的標籤應該寫「${TAG_WORDS.get(kinds[0])}」`);
    }

    const milestones = tags.filter((tag) => tag.textContent.trim() === '里程碑');
    assert.deepEqual(milestones.map((tag) => versionOf(tag.closest('.changelog-entry'))), ['v1.0.0', '專案啟動']);

    // 標籤的字沒有別的說法（優化、調整、改進、資訊），連圖例也算
    assert.doesNotMatch(read(PAGE), />(?:優化|調整|改進|資訊)</);
});

test('圖例是一行三個標籤，放在副標題後面、第一版前面；頁尾說明不再有圖例', () => {
    const html = read(PAGE);
    const at = (needle) => {
        const index = html.indexOf(needle);
        assert.notEqual(index, -1, `${PAGE} 找不到 ${needle}`);
        return index;
    };
    const subtitle = at('data-i18n="changelog_hero_subtitle"');
    const legend = at('id="changelogLegend"');
    const firstEntry = at('class="changelog-entry');
    assert.ok(subtitle < legend, '圖例要在副標題後面');
    assert.ok(legend < firstEntry, '圖例要在第一版前面');

    const legendHtml = sliceElementById(html, 'changelogLegend');
    const tags = [...legendHtml.matchAll(/<span class="tag (tag-[\w-]+)">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(tags, [['tag-success', '新增'], ['tag-info', '改善'], ['tag-warning', '修正']]);
    const keys = [...legendHtml.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(keys, ['changelog_tag_new', 'changelog_tag_improve', 'changelog_tag_fix']);

    // 頁尾「關於修改紀錄」只剩說明文字與連結
    assert.doesNotMatch(html, /tag-legend/);
});

test('不再用的圖例翻譯鍵三語都拿掉', () => {
    for (const lang of LANGS) {
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of ['changelog_tag_new', 'changelog_tag_improve', 'changelog_tag_fix']) {
            assert.ok(keys.has(key), `${lang} 缺少圖例還在用的 ${key}（翻譯檔解析可能失效）`);
        }
        for (const key of ['changelog_tag_legend_title', 'changelog_tag_info']) {
            assert.ok(!keys.has(key), `${lang} 還有不再用的 ${key}`);
        }
    }
});

// ---------- 每一版的標題 ----------

test('兩條以上的版本與最新一版都有一句標題，其他只有一條的版本沒有', () => {
    const { all } = entries();
    assert.ok(all.length >= 47, `只找到 ${all.length} 版，解析可能失效`);

    // 之後每發一版都會多一句，所以不寫死總數；比較節點一律用 === 加訊息（assert.equal 失敗時會展開整份 fake-dom）
    let titled = 0;
    all.forEach((entry, index) => {
        const version = versionOf(entry);
        const count = itemsOf(entry).length;
        const headlines = entry.querySelectorAll('.changelog-headline');
        if (count >= 2 || index === 0) {
            assert.ok(headlines.length === 1, `${version} 有 ${count} 條${index === 0 ? '（最新一版）' : ''}，要剛好有一句標題，實際有 ${headlines.length} 個`);
            assert.notEqual(headlines[0].textContent.trim(), '', `${version} 的標題是空的`);
            assert.ok(headlines[0].querySelector('.tag') === null, `${version} 的標題裡不該有標籤（標籤只屬於條目）`);
            titled += 1;
        } else {
            assert.ok(headlines.length === 0, `${version} 只有 ${count} 條，那一條直接寫出來，不該另外有標題`);
        }
    });
    assert.ok(titled >= 29, `只有 ${titled} 版要有標題，解析可能失效（兩條以上的舊版本就有 29 版）`);
});

// ---------- 版面：最新一版展開，其他每版收成一行 ----------

const expectedId = (version) => (version === '專案啟動' ? 'version-start' : `version-${version.replace(/[^A-Za-z0-9_]/g, '')}`);
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
// 這個 CSS 檔裡、前面是換行的那個「選擇器 {」區塊（不會誤抓到更長的選擇器的尾巴）
function cssBlock(css, selector) {
    const at = css.indexOf(`\n${selector} {`);
    assert.notEqual(at, -1, `找不到 ${selector}`);
    return css.slice(at, css.indexOf('}', at));
}
// 選擇器清單裡有這個選擇器的每一條規則的內容（selector 要和 CSS 裡寫的一模一樣；一條規則可以同時寫給好幾個選擇器）
function ruleBodies(css, selector) {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((match) => match[1].split(',').some((part) => part.trim() === selector))
        .map((match) => match[2]);
}

test('只有第一版展開、標「最新」', () => {
    const { all } = entries();
    const [latest, ...others] = all;
    assert.ok(others.length >= 46, `只找到 ${all.length} 版，解析可能失效`);

    // 比較節點一律用 === 加訊息（assert.equal 失敗時會展開整份 fake-dom）
    assert.ok(latest.tagName === 'DETAILS', `最新一版是 <${latest.tagName.toLowerCase()}>，要是 <details>`);
    assert.ok(latest.classList.contains('is-latest'), '最新一版要有 is-latest');
    assert.ok(latest.hasAttribute('open'), '最新一版要有 open，一打開就是展開的');
    const pills = latest.querySelectorAll('.changelog-latest');
    assert.ok(pills.length === 1, `最新一版要剛好有一個「最新」，實際有 ${pills.length} 個`);
    assert.equal(pills[0].getAttribute('data-i18n'), 'changelog_latest');
    assert.equal(pills[0].textContent.trim(), '最新');

    for (const entry of others) {
        const version = versionOf(entry);
        assert.ok(!entry.classList.contains('is-latest'), `${version} 不是最新一版，不該有 is-latest`);
        assert.ok(!entry.hasAttribute('open'), `${version} 不是最新一版，不該一打開就展開`);
        assert.ok(entry.querySelector('.changelog-latest') === null, `${version} 不是最新一版，不該標「最新」`);
    }
});

test('兩條以上的版本是可以展開的 details，只有一條的舊版本是單行', () => {
    const { all } = entries();
    let folded = 0;
    let singles = 0;
    all.forEach((entry, index) => {
        const version = versionOf(entry);
        const count = itemsOf(entry).length;
        if (count >= 2 || index === 0) {
            assert.ok(entry.tagName === 'DETAILS', `${version} 有 ${count} 條${index === 0 ? '（最新一版）' : ''}，要是 <details>，實際是 <${entry.tagName.toLowerCase()}>`);
            assert.ok(entry.firstElementChild.tagName === 'SUMMARY', `${version} 的 <summary> 要是 <details> 的第一個子元素`);
            assert.ok(entry.querySelector('summary > .changelog-meta') !== null, `${version} 的 <summary> 裡要有 .changelog-meta`);
            const headline = entry.querySelector('summary > .changelog-headline');
            assert.ok(headline !== null, `${version} 的 <summary> 裡要有 .changelog-headline`);
            assert.notEqual(headline.textContent.trim(), '', `${version} 的標題是空的`);
            assert.ok(entry.querySelectorAll('.changelog-items > li').length === count, `${version} 的每一條都要在 ul.changelog-items 裡（共 ${count} 條）`);
            folded += 1;
        } else {
            assert.ok(entry.tagName === 'DIV', `${version} 只有一條，要是單行的 <div>，實際是 <${entry.tagName.toLowerCase()}>`);
            assert.ok(entry.classList.contains('changelog-entry-single'), `${version} 要有 changelog-entry-single`);
            assert.ok(entry.querySelector('.changelog-meta') !== null, `${version} 要有 .changelog-meta`);
            assert.ok(entry.querySelectorAll('p.changelog-single-item').length === 1, `${version} 要剛好有一個 p.changelog-single-item`);
            assert.ok(entry.querySelector('.changelog-headline') === null, `${version} 只有一條，那一條直接寫出來，不該另外有標題`);
            singles += 1;
        }
    });
    // 條目總數不寫死（轉換有沒有漏由一次性的前後核對確認）；這裡只擋解析失效
    assert.ok(folded >= 29, `只找到 ${folded} 個 <details> 版本，解析可能失效（兩條以上的舊版本就有 29 版）`);
    assert.ok(singles >= 18, `只找到 ${singles} 個單行版本，解析可能失效（只有一條的舊版本有 18 版）`);
});

test('每一版的 id 照舊格式而且不重複', () => {
    const { dom, all } = entries();
    const seen = new Set();
    for (const entry of all) {
        const version = versionOf(entry);
        assert.equal(entry.id, expectedId(version), `${version} 的 id`);
        assert.ok(!seen.has(entry.id), `id「${entry.id}」重複了`);
        seen.add(entry.id);
    }
    // 以前分享出去的連結還要找得到
    for (const id of ['version-v2260', 'version-v250v252', 'version-start']) {
        assert.ok(dom.document.getElementById(id) !== null, `找不到 ${id}`);
    }
});

test('月份區塊裡只放月份標題和版本：#changelogEntries 底下只有 section.changelog-month，每一區塊的第一個子元素是月份標題，其餘都是版本', () => {
    const { list } = entries();
    const sections = list.children;
    assert.ok(sections.length >= 12, `只找到 ${sections.length} 個月份區塊，解析可能失效`);

    // 同一個月的收合列靠兄弟選擇器接成一張圓角清單（見 changelog.css）：多一個元素圓角就會跑掉。
    // 比較節點一律用 === 加訊息（assert.equal 失敗時會展開整份 fake-dom）
    const shown = (element) => `<${element.tagName.toLowerCase()}${element.className ? ` class="${element.className}"` : ''}>`;
    sections.forEach((section, index) => {
        assert.ok(section.tagName === 'SECTION' && section.classList.contains('changelog-month'), `#changelogEntries 底下的第 ${index + 1} 個子元素是 ${shown(section)}，只能放 section.changelog-month`);

        const month = section.querySelector('.changelog-month-title')?.textContent.trim() ?? `第 ${index + 1} 個月份區塊`;
        const [title, ...rest] = section.children;
        assert.ok(title !== undefined && title.tagName === 'H2' && title.classList.contains('changelog-month-title'), `${month}：第一個子元素要是 h2.changelog-month-title，實際是 ${title === undefined ? '空的' : shown(title)}`);
        for (const child of rest) {
            assert.ok(child.classList.contains('changelog-entry'), `${month}：月份標題後面只能放版本（.changelog-entry），卻有 ${shown(child)}`);
        }
    });
});

test('日期由新到舊，而且落在所屬月份', () => {
    const { list, all } = entries();
    assert.ok(list.querySelectorAll('section.changelog-month > .changelog-entry').length === all.length, '每一版都要直接放在 section.changelog-month 裡');

    let previous = '9999-99-99';
    for (const entry of all) {
        const version = versionOf(entry);
        const time = entry.querySelector('time.changelog-date');
        assert.ok(time !== null, `${version} 沒有 <time class="changelog-date">`);
        const datetime = time.getAttribute('datetime');
        const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datetime);
        assert.ok(parts !== null, `${version} 的 datetime「${datetime}」不是 YYYY-MM-DD`);
        const [year, month, day] = parts.slice(1).map(Number);
        assert.equal(time.textContent.trim(), `${month}月${day}日`, `${version} 的日期文字（月和日不補零）`);
        assert.ok(datetime <= previous, `${version}（${datetime}）排在 ${previous} 後面，要由新到舊`);
        previous = datetime;

        const section = entry.closest('.changelog-month');
        assert.ok(section !== null, `${version} 不在 .changelog-month 裡`);
        assert.equal(section.querySelector('.changelog-month-title').textContent.trim(), `${year}年${month}月`, `${version}（${datetime}）所在的月份標題`);
    }

    const titles = list.querySelectorAll('section.changelog-month > h2.changelog-month-title').map((title) => title.textContent.trim());
    assert.ok(titles.length >= 12, `只找到 ${titles.length} 個月份標題，解析可能失效`);
    assert.equal(new Set(titles).size, titles.length, `月份標題重複了：${titles.join('、')}`);
});

test('頁面是一欄：標題、副標題、圖例、版本、關於說明依序放在最寬 800px 的容器裡', () => {
    const html = read(PAGE);
    const at = (needle) => {
        const index = html.indexOf(needle);
        assert.notEqual(index, -1, `${PAGE} 找不到 ${needle}`);
        return index;
    };
    const order = ['<div class="container changelog-page">', '<h1 ', 'class="subtitle"', 'id="changelogLegend"', 'class="changelog-container" id="changelogEntries"', 'id="aboutChangelog"'].map(at);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), '順序要是容器、h1、副標題、圖例、版本清單、關於說明');
    for (const gone of ['changelog-layout', 'changelog-content-wrapper']) assert.ok(!html.includes(gone), `${PAGE} 不該再有 ${gone}`);
    assert.match(cssBlock(stripComments(read(CSS)), '.changelog-page'), /max-width:\s*var\(--container-narrow\)/);
});

test('拿掉目錄、目錄腳本與寫死的回到頂端連結', () => {
    const html = read(PAGE);
    for (const gone of ['toc-sidebar', 'tocNav', 'backToTop']) assert.ok(!html.includes(gone), `${PAGE} 不該再有 ${gone}`);
    // 內嵌的腳本沒有了：每個 <script> 都是載入檔案
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
    assert.ok(scripts.length >= 8, `只找到 ${scripts.length} 個 <script>，解析可能失效`);
    for (const script of scripts) assert.match(script, /\ssrc="/, `${script} 沒有 src，不該有內嵌腳本`);

    const css = stripComments(read(CSS));
    for (const gone of ['.toc-', '.changelog-layout']) assert.ok(!css.includes(gone), `${CSS} 不該再有 ${gone}`);

    for (const lang of LANGS) {
        const keys = translationKeySet(TRANSLATIONS, lang);
        assert.ok(keys.has('changelog_about_title'), `${lang} 缺少還在用的 changelog_about_title（翻譯檔解析可能失效）`);
        for (const key of ['changelog_toc_title', 'changelog_about_section']) assert.ok(!keys.has(key), `${lang} 還有不再用的 ${key}`);
    }
});

test('「最新」三語都有', () => {
    assert.deepEqual(LANGS.map((lang) => translationValues(TRANSLATIONS, lang).get('changelog_latest')), ['最新', 'Latest', '最新']);
});

test('手機 320px 也不會左右捲：那一行的版本號截斷，格線欄位可以縮，圖例自己換行', () => {
    const css = stripComments(read(CSS));
    assert.match(cssBlock(css, '.changelog-meta'), /grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/);
    const version = cssBlock(css, '.changelog-version');
    for (const declaration of [/min-width:\s*0/, /overflow:\s*hidden/, /text-overflow:\s*ellipsis/, /white-space:\s*nowrap/]) {
        assert.match(version, declaration, `.changelog-version 要有 ${declaration}`);
    }
    // 基本的規則寫在任何 ….changelog-version { 變體之前：第一次出現的就是它
    assert.ok(css.indexOf('.changelog-version {') === css.indexOf('\n.changelog-version {') + 1, '基本的 .changelog-version 規則要寫在任何變體之前');
    assert.match(cssBlock(css, '.changelog-legend'), /flex-wrap:\s*wrap/);
});

test('標題換行時兩行平均，不會第二行只剩一個字', () => {
    const headline = cssBlock(stripComments(read(CSS)), '.changelog-headline');
    assert.match(headline, /text-wrap:\s*balance/);
    // text-wrap 只對區塊有用：<span> 要設成 block
    assert.match(headline, /display:\s*block/);
});

test('用鍵盤移到收起來的那一行時看得到焦點', () => {
    const css = stripComments(read(CSS));
    const focus = cssBlock(css, '.changelog-entry > summary:focus-visible');
    assert.match(focus, /outline:\s*2px solid var\(--color-primary\)/);
    assert.match(focus, /outline-offset:\s*-/, '列在圓角容器裡，外框要畫在裡面，不然會被切掉');
    // 最新一版的色帶也是主色：外框改畫在色帶上，用色帶的前景色
    assert.match(cssBlock(css, '.changelog-entry.is-latest > summary:focus-visible .changelog-meta'), /outline:\s*2px solid var\(--color-on-primary\)/);
});

test('收起來的列在有滑鼠的裝置上移過時有底色，最新一版的卡片不加', () => {
    // 站長 11/7 決定加。只在 (hover: hover) 的裝置上：手機點過之後底色不會一直留著
    const css = stripComments(read(CSS));
    const hover = css.match(/@media \(hover: hover\) \{\s*\.changelog-entry:not\(\.is-latest\) > summary:hover \{([^}]*)\}/);
    assert.ok(hover, '要有 @media (hover: hover) 裡的 .changelog-entry:not(.is-latest) > summary:hover');
    assert.match(hover[1], /background:\s*var\(--color-hover\)/);
});

test('收起來的那一行沒有瀏覽器預設的三角形，右邊自己寫「N 條 ▸」，展開時是 ▾', () => {
    const css = stripComments(read(CSS));
    assert.match(cssBlock(css, '.changelog-entry > summary'), /list-style:\s*none/);
    assert.match(cssBlock(css, '.changelog-entry > summary::-webkit-details-marker'), /display:\s*none/);
    // 三角形只是裝飾：第二行把替代文字設成空的，螢幕閱讀器不念；不認得這種寫法的瀏覽器略過第二行，用第一行
    assert.match(cssBlock(css, '.changelog-count::after'), /content:\s*' ▸';\s*content:\s*' ▸' \/ '';/);
    assert.match(cssBlock(css, '.changelog-entry[open] .changelog-count::after'), /content:\s*' ▾';\s*content:\s*' ▾' \/ '';/);
});

test('最新一版收起來時，「N 條 ▸」留在色帶裡讓人知道還能展開，只有展開時才藏起來', () => {
    const css = stripComments(read(CSS));
    // 展開時條目就在下面，不用再寫「N 條」
    assert.match(cssBlock(css, '.changelog-entry.is-latest[open] .changelog-count'), /display:\s*none/);

    // 不分展開收起就藏的規則，會讓收起來的最新一版看起來像已經完整了：藏 .changelog-count 的選擇器一律要限定在 [open]
    const hiding = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((match) => /(?:^|[;\s])display:\s*none/.test(match[2]))
        .flatMap((match) => match[1].split(',').map((selector) => selector.trim()))
        .filter((selector) => selector.endsWith('.changelog-count'));
    assert.ok(hiding.length >= 1 && hiding.every((selector) => selector.includes('[open]')), `藏起「N 條」的選擇器都要限定在 [open]，實際有：${hiding.join('、')}`);

    // 色帶上：用色帶的前景色（主色底上的 --color-muted 看不清楚）；放在第四格，日期、版本、「最新」、N 條一行放得下，不掉到第二行
    const count = cssBlock(css, '.changelog-entry.is-latest .changelog-count');
    assert.match(count, /(?:^|[;\s])color:\s*inherit/, '色帶上的「N 條」要沿用色帶的前景色');
    assert.match(count, /grid-column:\s*4;/, '色帶上的「N 條」要放在第四格');
});

test('同一個月的收合列接成一張清單：第一列上圓角、最後一列下圓角，最新一版是獨立的卡片', () => {
    const css = stripComments(read(CSS));
    // 相鄰兩列共用一條分隔線：每一版的上框是 0（上一版的下框就是這一版的上框），清單的第一列與最新一版自己補回 1px
    assert.match(cssBlock(css, '.changelog-entry'), /border-top-width:\s*0;/, '.changelog-entry 的上框要是 0，相鄰兩列才共用一條分隔線');
    for (const selector of ['.changelog-month-title + .changelog-entry', '.changelog-entry.is-latest + .changelog-entry']) {
        const bodies = ruleBodies(css, selector);
        assert.ok(bodies.length >= 1, `找不到 ${selector} 的規則`);
        assert.ok(bodies.some((body) => /border-top-left-radius:\s*var\(--radius-lg\)/.test(body) && /border-top-right-radius:\s*var\(--radius-lg\)/.test(body)), `${selector} 要有上圓角`);
    }
    const last = ruleBodies(css, '.changelog-entry:last-child');
    assert.ok(last.some((body) => /border-bottom-left-radius:\s*var\(--radius-lg\)/.test(body) && /border-bottom-right-radius:\s*var\(--radius-lg\)/.test(body)), '.changelog-entry:last-child 要有下圓角');
    const latest = cssBlock(css, '.changelog-entry.is-latest');
    assert.match(latest, /border-radius:\s*var\(--radius-lg\)/);
    assert.match(latest, /box-shadow:\s*var\(--shadow-md\)/);
});

// ---------- changelog.js：每一版的「N 條」與網址 # 展開 ----------

const SCRIPT = 'assets/js/changelog.js';

// 照 changelog.html 的順序：（i18n）→ changelog.js；#changelogEntries 用頁面真正的標記。
// readyState 'loading' 是真實頁面的樣子（腳本在 body 最後，文件還在解析，要等 DOMContentLoaded），'complete' 是載入時文件已經就緒。
// fake-dom 的元素沒有 scrollIntoView()：每一版補一個不真的捲動、只把 id 記在 dom.scrolls 的；
// 同一個位置的 dom.openWhenScrolled 記下捲動的那一刻這一版有沒有 open（要先展開再捲：展開前頁面比較短，頁面最底下的版本捲不到視窗最上面）
// changelogTranslations: false 是部署空窗的樣子（新的 HTML 配到舊的翻譯檔，還沒有這一頁的鍵）；vmConsole 換掉那個 vm 裡的 console（I18nManager 找不到鍵會 console.warn）
function setupScript({ url = 'https://ff14.tw/changelog.html', readyState = 'complete', i18n = false, storage, changelogTranslations = true, vmConsole } = {}) {
    const dom = createFakeDom({ url, readyState });
    if (vmConsole) dom.window.console = vmConsole;
    mountFromHtml(dom, read(PAGE), ['changelogEntries']);
    dom.scrolls = [];
    dom.openWhenScrolled = [];
    for (const entry of dom.document.querySelectorAll('.changelog-entry')) {
        entry.scrollIntoView = () => {
            dom.scrolls.push(entry.id);
            dom.openWhenScrolled.push(entry.hasAttribute('open'));
        };
    }
    if (i18n) {
        dom.window.navigator = { languages: ['zh-TW'] };
        dom.window.localStorage = storage ?? { getItem: () => null, setItem() {} };
        dom.load('assets/js/i18n/i18n-manager.js');
        dom.load('assets/js/i18n/translations/common.js');
        if (changelogTranslations) dom.load(TRANSLATIONS);
    }
    dom.load(SCRIPT);
    return dom;
}
const countOf = (dom, id) => dom.document.getElementById(id).querySelector('.changelog-count')?.textContent ?? null;
const loaded = (dom) => dom.document.dispatchEvent(new dom.window.CustomEvent('DOMContentLoaded'));
// 有 open 的 <details> 版本的 id，照文件裡的順序
const openIds = (dom) => dom.document.querySelectorAll('details.changelog-entry').filter((entry) => entry.hasAttribute('open')).map((entry) => entry.id);
// 同瀏覽器：換掉網址的 #，然後在 window 派送 hashchange
function changeHash(dom, hash) {
    dom.window.location.hash = hash;
    dom.window.dispatchEvent(new dom.window.Event('hashchange'));
}

test('每個 details 版本的那一行寫「N 條」，只有一條的版本不寫，重畫不會多出第二個', () => {
    const dom = setupScript();
    assert.equal(dom.window.i18n, undefined, '不設 window.i18n，寫中文');
    const folded = dom.document.querySelectorAll('details.changelog-entry');
    const singles = dom.document.querySelectorAll('.changelog-entry-single');
    assert.ok(folded.length >= 29 && singles.length >= 18, `只找到 ${folded.length} 個 <details> 版本與 ${singles.length} 個單行版本，解析可能失效`);

    // 比較節點一律用 === 加訊息（assert.equal 失敗時會展開整份 fake-dom）
    const verify = (when) => {
        for (const entry of folded) {
            const version = versionOf(entry);
            const total = entry.querySelectorAll('.changelog-items > li').length;
            const counts = entry.querySelectorAll('.changelog-count');
            assert.ok(counts.length === 1, `${when}：${version} 要剛好有一個 .changelog-count，實際有 ${counts.length} 個`);
            const meta = entry.querySelector('summary > .changelog-meta');
            assert.ok(meta.children.at(-1) === counts[0], `${when}：${version} 的 .changelog-count 要接在 .changelog-meta 的最後`);
            assert.equal(counts[0].tagName, 'SPAN');
            assert.equal(counts[0].textContent, `${total} 條`, `${when}：${version} 有 ${total} 條`);
        }
        for (const entry of singles) {
            assert.ok(entry.querySelector('.changelog-count') === null, `${when}：${versionOf(entry)} 只有一條，直接寫出來，不寫「N 條」`);
        }
    };
    verify('載入時');
    assert.equal(countOf(dom, 'version-v2260'), '10 條');
    assert.equal(countOf(dom, 'version-v2114'), null);

    dom.window.ChangelogPage.renderCounts();
    verify('再畫一次');
    assert.equal(countOf(dom, 'version-v2260'), '10 條');

    // renderCounts(root)：只畫 root 底下的版本，沒傳就是整份文件
    const scoped = setupScript({ readyState: 'loading' });
    const [firstMonth] = scoped.document.querySelectorAll('section.changelog-month');
    scoped.window.ChangelogPage.renderCounts(firstMonth);
    const drawn = scoped.document.querySelectorAll('.changelog-count');
    const inFirstMonth = firstMonth.querySelectorAll('details.changelog-entry');
    assert.ok(inFirstMonth.length >= 1 && drawn.length === inFirstMonth.length, `第一個月份有 ${inFirstMonth.length} 個 <details> 版本，卻畫了 ${drawn.length} 個「N 條」`);
    assert.ok(drawn.every((count) => firstMonth.contains(count)), '只有第一個月份底下的版本畫了「N 條」');
});

test('切換語言時「N 條」跟著換；記住的語言是日文時一打開就是日文', () => {
    // 照真實頁面：文件載入中，I18nManager 與 changelog.js 都等 DOMContentLoaded（I18nManager 先登記，先換好頁面上其他的字）
    const dom = setupScript({ readyState: 'loading', i18n: true });
    assert.equal(countOf(dom, 'version-v2250'), null, 'DOMContentLoaded 之前還不畫');
    loaded(dom);
    assert.equal(countOf(dom, 'version-v2250'), '8 條');

    const folded = dom.document.querySelectorAll('details.changelog-entry').length;
    for (const [lang, v2250, v2260] of [['en', '8 items', '10 items'], ['ja', '8 件', '10 件'], ['zh', '8 條', '10 條']]) {
        dom.window.i18n.setLanguage(lang);
        assert.equal(countOf(dom, 'version-v2250'), v2250, `切到 ${lang}`);
        assert.equal(countOf(dom, 'version-v2260'), v2260, `切到 ${lang}，v2.26.0 的條數也跟著換`);
        assert.equal(dom.document.querySelectorAll('.changelog-count').length, folded, `切到 ${lang}，每個 details 版本還是只有一個「N 條」`);
        assert.equal(countOf(dom, 'version-v2114'), null, `切到 ${lang}，單行的版本還是不寫`);
    }

    // 玩家上次選的是日文：文件載入完（DOMContentLoaded）之後，第一次看到的條數就是日文的「8 件」
    const ja = setupScript({ readyState: 'loading', i18n: true, storage: { getItem: (key) => (key === 'ff14tw_preferred_language' ? 'ja' : null), setItem() {} } });
    loaded(ja);
    assert.equal(ja.window.i18n.getCurrentLanguage(), 'ja');
    assert.equal(countOf(ja, 'version-v2250'), '8 件');
});

test('部署空窗：新的頁面配到舊的翻譯檔（沒有 changelog_item_count）時，每一列還是寫「N 條」，不露出翻譯鍵', () => {
    // I18nManager 找不到鍵會 console.warn：把那個 vm 的 console 換成記下來的替身，測試輸出才乾淨（不改 I18nManager），也順便確認真的走到了找不到鍵的那條路
    const logged = [];
    const record = (...args) => { logged.push(args.map(String).join(' ')); };
    const dom = setupScript({ i18n: true, changelogTranslations: false, vmConsole: { warn: record, error: record, log: record } });
    assert.equal(dom.window.i18n.getText('changelog_item_count'), 'changelog_item_count', '翻譯檔沒載入時，getText 回傳的是鍵名本身');

    const folded = dom.document.querySelectorAll('details.changelog-entry');
    assert.ok(folded.length >= 29, `只找到 ${folded.length} 個 <details> 版本，解析可能失效`);
    const verify = (when) => {
        for (const entry of folded) {
            const total = entry.querySelectorAll('.changelog-items > li').length;
            assert.equal(countOf(dom, entry.id), `${total} 條`, `${when}：${versionOf(entry)} 有 ${total} 條`);
        }
    };
    verify('載入時');

    // 切換語言後重畫也一樣（英文與日文的鍵還是找不到，沿用中文的寫法）
    dom.window.i18n.setLanguage('en');
    verify('切到 en');
    assert.equal(dom.document.querySelectorAll('.changelog-count').length, folded.length, '重畫後每個 details 版本還是只有一個「N 條」');

    assert.ok(logged.some((line) => line.endsWith('changelog_item_count')), '要有 changelog_item_count 找不到的警告，不然這個測試沒走到找不到鍵的那條路');
    for (const line of logged) assert.match(line, /^\[i18n\] 找不到翻譯鍵值: /, `console 裡只該有「找不到翻譯鍵值」的警告，卻有：${line}`);
});

test('網址 # 指到收起來的版本就展開；指到單行的版本、不存在的 id、空的或編碼壞掉時不丟錯也不展開別的', () => {
    const dom = setupScript({ url: 'https://ff14.tw/changelog.html#version-v2250' });
    const latestId = dom.document.querySelector('details.is-latest').id;
    assert.deepEqual(openIds(dom), [latestId, 'version-v2250'], '載入時，網址指到的版本跟著最新一版一起展開');

    // 單行的版本不能展開；#nope 沒有這個 id；#% 的編碼是壞的（decodeURIComponent 會丟錯）；空的 #；#changelogEntries 存在但不是一個版本
    for (const hash of ['#version-v2114', '#nope', '#%', '', '#changelogEntries']) {
        assert.doesNotThrow(() => changeHash(dom, hash), `網址是「${hash}」`);
        assert.deepEqual(openIds(dom), [latestId, 'version-v2250'], `網址是「${hash}」，展開的還是原本那兩版`);
    }

    // 開著頁面時網址換到另一版：那一版也展開，原本展開的不收起
    changeHash(dom, '#version-v2240');
    assert.deepEqual(openIds(dom), [latestId, 'version-v2250', 'version-v2240']);

    // id 是百分比編碼的也找得到（decodeURIComponent 後的字串才是 id）
    changeHash(dom, '#version%2Dv2230');
    assert.deepEqual(openIds(dom), [latestId, 'version-v2250', 'version-v2240', 'version-v2230']);

    // 沒有 # 的網址：只有最新一版展開
    assert.deepEqual(openIds(setupScript()), [latestId]);
});

test('網址 # 指到收起來的版本時，展開之後捲到它，載入時與 hashchange 都是；不是可以展開的版本就不另外捲', () => {
    const dom = setupScript({ url: 'https://ff14.tw/changelog.html#version-v2250' });
    assert.deepEqual(dom.scrolls, ['version-v2250'], '載入時');
    // v2.25.0 載入時是收起來的：捲動的那一刻它已經展開，才是先展開再捲
    assert.deepEqual(dom.openWhenScrolled, [true], '載入時，捲動的那一刻那一版已經展開');

    // 單行的版本由瀏覽器自己捲過去；其他的根本沒有版本可以捲：這些腳本都不碰
    for (const hash of ['#version-v2114', '#nope', '#%', '', '#changelogEntries']) {
        changeHash(dom, hash);
    }
    assert.deepEqual(dom.scrolls, ['version-v2250'], '單行的版本、不存在的 id、空的、編碼壞掉、不是版本的元素都不另外捲');

    changeHash(dom, '#version-v2240');
    assert.deepEqual(dom.scrolls, ['version-v2250', 'version-v2240'], 'hashchange');
    assert.deepEqual(dom.openWhenScrolled, [true, true], 'hashchange，捲動的那一刻那一版已經展開');

    assert.deepEqual(setupScript().scrolls, [], '網址沒有 # 時不捲');
});

test('changelog.js：文件載入中等 DOMContentLoaded 才畫、才展開，載入時文件已經就緒就直接做；頁面上沒有版本時不丟例外', () => {
    const url = 'https://ff14.tw/changelog.html#version-v2250';

    const loading = setupScript({ url, readyState: 'loading' });
    const latestId = loading.document.querySelector('details.is-latest').id;
    assert.equal(countOf(loading, 'version-v2250'), null, 'DOMContentLoaded 之前還不畫');
    assert.deepEqual(openIds(loading), [latestId], 'DOMContentLoaded 之前網址指到的版本還沒展開');
    loaded(loading);
    assert.equal(countOf(loading, 'version-v2250'), '8 條');
    assert.deepEqual(openIds(loading), [latestId, 'version-v2250']);
    changeHash(loading, '#version-v2240');
    assert.deepEqual(openIds(loading), [latestId, 'version-v2250', 'version-v2240'], 'DOMContentLoaded 之後 hashchange 才有人聽');

    const ready = setupScript({ url, readyState: 'interactive' });
    assert.equal(countOf(ready, 'version-v2250'), '8 條');
    assert.deepEqual(openIds(ready), [latestId, 'version-v2250']);

    // 沒有 #changelogEntries 的文件：載入、重畫、hashchange 都不丟例外
    const bare = createFakeDom({ url });
    assert.doesNotThrow(() => bare.load(SCRIPT));
    assert.doesNotThrow(() => bare.window.ChangelogPage.renderCounts());
    assert.doesNotThrow(() => bare.window.dispatchEvent(new bare.window.Event('hashchange')));
});

test('changelog.html 在 common.js 後面載入 changelog.js', () => {
    const scripts = [...read(PAGE).matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
    const common = scripts.indexOf('assets/js/common.js');
    const changelog = scripts.indexOf('assets/js/changelog.js');
    assert.notEqual(common, -1, `${PAGE} 找不到 assets/js/common.js`);
    assert.notEqual(changelog, -1, `${PAGE} 找不到 assets/js/changelog.js`);
    assert.ok(changelog > common, `changelog.js（第 ${changelog + 1} 個）要在 common.js（第 ${common + 1} 個）後面`);
});

test('「N 條」三語都有 {count}', () => {
    assert.deepEqual(LANGS.map((lang) => translationValues(TRANSLATIONS, lang).get('changelog_item_count')), ['{count} 條', '{count} items', '{count} 件']);
});
