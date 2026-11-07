const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { translationValues } = require('./helpers/translation-parsers.js');
const { parseAttrs, classesOf } = require('./helpers/html-fragment.js');
const { createFakeDom } = require('./helpers/fake-dom.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// 攻略資料的 8 頁（首頁加 7 個主題頁）；這個檔案裡的測試共用 PAGES、read()、guideText()
const GUIDE_DIR = 'tools/guide';
const PAGES = ['index', 'guild', 'grand-company', 'dungeon', 'party', 'aether', 'sightseeing', 'chocobo']
    .map((name) => `${GUIDE_DIR}/${name}.html`);

const LANGS = ['zh', 'en', 'ja'];
const GUIDE_TRANSLATIONS = 'assets/js/i18n/translations/tools/guide.js';
// 攻略資料翻譯檔裡某個語言的全部文字：Map(鍵 → 字串)
const guideText = (lang) => translationValues(GUIDE_TRANSLATIONS, lang);

// ---------- 專屬陸行鳥 ----------
test('專屬陸行鳥：#color-calculator 還在，下面一張卡連到陸行鳥染色計算器', () => {
    const html = read(`${GUIDE_DIR}/chocobo.html`);

    // 以前分享出去的 #color-calculator 連結停在這個標題
    const heading = html.match(/<h2\b[^>]*\sid="color-calculator"[^>]*>[^<]*<\/h2>/);
    assert.ok(heading, 'chocobo.html 找不到 id="color-calculator" 的 h2');
    assert.equal(parseAttrs(heading[0])['data-i18n'], 'chocobo_color_calculator');

    // 緊接在標題後面的就是連結卡（卡片裡沒有巢狀的 div）
    const afterHeading = html.slice(heading.index + heading[0].length);
    const card = afterHeading.match(/^\s*(<div\b([^>]*)>[\s\S]*?<\/div>)/);
    assert.ok(card, '#color-calculator 的 h2 後面應該緊接著一張卡片');
    const cardClasses = classesOf(parseAttrs(card[2]));
    for (const cls of ['guide-info-card', 'guide-tip', 'guide-tool-link']) {
        assert.ok(cardClasses.includes(cls), `連結卡缺少 class ${cls}（目前是 ${cardClasses.join(' ')}）`);
    }

    // 連結：連到新工具、用 .btn，而且指到真的存在的頁面
    const link = card[1].match(/<a\b([^>]*)>([^<]*)<\/a>/);
    assert.ok(link, '連結卡裡沒有連結');
    const linkAttrs = parseAttrs(link[1]);
    assert.equal(linkAttrs.href, '../chocobo-color/index.html');
    assert.ok(classesOf(linkAttrs).includes('btn'), `連結要用 .btn（目前是 ${linkAttrs.class}）`);
    assert.equal(linkAttrs['data-i18n'], 'guide_chocobo_tool_link');
    assert.ok(exists(path.join(GUIDE_DIR, linkAttrs.href)), `${linkAttrs.href} 指到不存在的頁面`);

    // 說明
    const text = card[1].match(/<(\w+)\b[^>]*\sdata-i18n="guide_chocobo_tool_text"[^>]*>([^<]*)<\/\1>/);
    assert.ok(text, '連結卡裡沒有 data-i18n="guide_chocobo_tool_text" 的說明');

    // 翻譯檔還沒載入時看到的預設文字，和 zh 翻譯是同一句
    const zh = guideText('zh');
    assert.equal(link[2].trim(), zh.get('guide_chocobo_tool_link'));
    assert.equal(text[2].trim(), zh.get('guide_chocobo_tool_text'));

    // 舊計算器的標記與腳本都拿掉了
    for (const leftover of ['colorCalculator', 'currentColorSelect', 'chocobo-color-calculator.js']) {
        assert.equal(html.includes(leftover), false, `chocobo.html 還留著 ${leftover}`);
    }
});

test('舊計算器的檔案、樣式、翻譯鍵都拿掉了', () => {
    // 檔案，以及每一頁對它的載入
    assert.equal(exists(`${GUIDE_DIR}/chocobo-color-calculator.js`), false, 'chocobo-color-calculator.js 應該已經刪除');
    for (const page of PAGES) {
        assert.doesNotMatch(read(page), /chocobo-color-calculator\.js/, `${page} 還在載入舊計算器的腳本`);
    }

    // 初始化：script.js 現在只剩側欄
    assert.doesNotMatch(read(`${GUIDE_DIR}/script.js`), /ChocoboColorCalculator|colorCalculator|initColorCalculator/);

    // 樣式（含 media query 裡的部分）：色票選單、結果、水果清單、餵食順序
    const css = read(`${GUIDE_DIR}/style.css`).replace(/\/\*[\s\S]*?\*\//g, '');
    const oldSelector = css.match(/\.(?:color-calculator|color-select-[\w-]+|color-preview|color-arrow|calculator-actions|result-area|fruit-[\w-]+|feeding-[\w-]+|same-color)(?![\w-])/);
    assert.equal(oldSelector, null, `style.css 還留著舊計算器的樣式：${oldSelector && oldSelector[0]}`);

    // 翻譯鍵：只給舊計算器用的 14 個三語都拿掉；標題與連結卡的三個留著而且有字
    const REMOVED = [
        'chocobo_calculator_desc', 'chocobo_current_color', 'chocobo_target_color', 'chocobo_calculate',
        'chocobo_required_fruits', 'chocobo_show_feeding_order', 'chocobo_same_color', 'chocobo_note_title',
        'chocobo_tip_title', 'chocobo_feeding_note', 'chocobo_no_safe_recipe', 'chocobo_calculator_credit_prefix',
        'chocobo_calculator_credit_suffix', 'chocobo_load_error'
    ];
    const KEPT = ['chocobo_color_calculator', 'guide_chocobo_tool_text', 'guide_chocobo_tool_link'];
    for (const lang of LANGS) {
        const text = guideText(lang);
        for (const key of REMOVED) assert.equal(text.has(key), false, `${lang}：guide.js 還留著 ${key}`);
        for (const key of KEPT) assert.ok(text.get(key), `${lang}：guide.js 缺少 ${key}`);
    }
});

// ---------- 還沒寫的 4 個主題 ----------
// 部隊、副本、風脈、探索筆記還沒有內容：頁面老實寫「撰寫中」、請搜尋引擎先不要收錄，攻略首頁的卡片與側欄也標出來
const TOPICS = ['guild', 'grand-company', 'dungeon', 'party', 'aether', 'sightseeing', 'chocobo']; // 側欄與首頁卡片的順序
const PENDING = ['guild', 'dungeon', 'aether', 'sightseeing'];
const WRITTEN = TOPICS.filter((name) => !PENDING.includes(name));
const COMMON_TRANSLATIONS = 'assets/js/i18n/translations/common.js';

// <meta name="…"> 的屬性；沒有這個 meta 是 null
function metaOf(html, name) {
    const tag = html.match(new RegExp(`<meta\\b[^>]*\\sname="${name}"[^>]*>`));
    return tag ? parseAttrs(tag[0]) : null;
}

test('4 個空頁：撰寫中、noindex、老實的摘要；副本頁連到副本資料庫', () => {
    const text = Object.fromEntries(LANGS.map((lang) => [lang, guideText(lang)]));

    // 內文那一句，三語
    assert.equal(text.zh.get('guide_coming_soon'), '這一頁還在撰寫中。');
    assert.equal(text.en.get('guide_coming_soon'), 'This page is still being written.');
    assert.equal(text.ja.get('guide_coming_soon'), 'このページは執筆中です。');

    for (const name of PENDING) {
        const file = `${GUIDE_DIR}/${name}.html`;
        const html = read(file);

        assert.equal(metaOf(html, 'robots')?.content, 'noindex', `${file} 要有 <meta name="robots" content="noindex">，內容寫好再拿掉`);
        const description = metaOf(html, 'description')?.content ?? '';
        assert.match(description, /撰寫中/, `${file} 的 meta description 要老實寫「撰寫中」：${description}`);
        assert.doesNotMatch(description, /完整說明/, `${file} 的 meta description 還在說「完整說明」`);

        const note = html.match(/<(\w+)\b[^>]*\sdata-i18n="guide_coming_soon"[^>]*>([^<]*)<\/\1>/);
        assert.ok(note, `${file} 內文沒有 data-i18n="guide_coming_soon" 的句子`);
        assert.equal(note[2].trim(), text.zh.get('guide_coming_soon'), `${file} 內文的預設文字要和 zh 翻譯一樣`);
        assert.doesNotMatch(html, /準備中/, `${file} 還留著舊的「準備中」`);
    }

    // 副本頁：摘要提到副本資料庫，內文多一句連到它（句子拆成前後兩段翻譯，中間是連結）
    const dungeon = read(`${GUIDE_DIR}/dungeon.html`);
    assert.match(metaOf(dungeon, 'description').content, /副本資料庫/, 'dungeon.html 的 meta description 要提到副本資料庫');
    const sentence = dungeon.match(/<p\b[^>]*>\s*<span\b[^>]*\sdata-i18n="guide_dungeon_db_prefix"[^>]*>([^<]*)<\/span>\s*(<a\b[^>]*>)([^<]*)<\/a>\s*<span\b[^>]*\sdata-i18n="guide_dungeon_db_suffix"[^>]*>([^<]*)<\/span>\s*<\/p>/);
    assert.ok(sentence, 'dungeon.html 要有「想查副本，可以先用〈副本資料庫〉。」這一句（前後各一個 span，中間是連結）');
    const link = parseAttrs(sentence[2]);
    assert.equal(link.href, '../dungeon-database/index.html');
    assert.equal(link['data-i18n'], 'tool_dungeon_database_title');
    assert.ok(exists(path.join(GUIDE_DIR, link.href)), `${link.href} 指到不存在的頁面`);
    // 預設文字都和 zh 翻譯一樣（連結用工具名稱的共用鍵）
    assert.equal(sentence[1], text.zh.get('guide_dungeon_db_prefix'));
    assert.equal(sentence[3], translationValues(COMMON_TRANSLATIONS, 'zh').get('tool_dungeon_database_title'));
    assert.equal(sentence[4], text.zh.get('guide_dungeon_db_suffix'));
    const SENTENCE = {
        zh: ['想查副本，可以先用', '。'],
        en: ['To look up dungeons, try the ', '.'],
        ja: ['ダンジョンを調べるなら', 'をどうぞ。']
    };
    for (const lang of LANGS) {
        assert.equal(text[lang].get('guide_dungeon_db_prefix'), SENTENCE[lang][0], `${lang}：guide_dungeon_db_prefix`);
        assert.equal(text[lang].get('guide_dungeon_db_suffix'), SENTENCE[lang][1], `${lang}：guide_dungeon_db_suffix`);
    }

    // 已經寫好的頁面與攻略首頁照常讓搜尋引擎收錄
    for (const name of ['index', ...WRITTEN]) {
        assert.equal(metaOf(read(`${GUIDE_DIR}/${name}.html`), 'robots'), null, `${name}.html 不該有 robots meta`);
        assert.doesNotMatch(read(`${GUIDE_DIR}/${name}.html`), /noindex/, `${name}.html 不該有 noindex`);
    }
});

test('攻略首頁：4 張卡有撰寫中，另外 3 張沒有', () => {
    const html = read(`${GUIDE_DIR}/index.html`);
    const cards = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
        .map((m) => ({ attrs: parseAttrs(m[1]), body: m[2] }))
        .filter((card) => classesOf(card.attrs).includes('guide-card'));
    assert.deepEqual(cards.map((card) => card.attrs.href), TOPICS.map((name) => `${name}.html`));

    const zh = guideText('zh');
    for (const card of cards) {
        const name = card.attrs.href.replace(/\.html$/, '');
        const tags = [...card.body.matchAll(/<span\b([^>]*)>([^<]*)<\/span>/g)]
            .map((m) => ({ attrs: parseAttrs(m[1]), text: m[2].trim() }))
            .filter((span) => classesOf(span.attrs).includes('tag'));

        if (!PENDING.includes(name)) {
            assert.equal(tags.length, 0, `${name} 的卡片不該有標籤`);
            continue;
        }
        assert.equal(tags.length, 1, `${name} 的卡片要有一個「撰寫中」標籤`);
        const [tag] = tags;
        for (const cls of ['tag', 'tag-warning']) {
            assert.ok(classesOf(tag.attrs).includes(cls), `${name} 的標籤缺少 class ${cls}（目前是 ${tag.attrs.class}）`);
        }
        assert.equal(tag.attrs['data-i18n'], 'guide_pending');
        assert.equal(tag.text, zh.get('guide_pending'), `${name} 的預設文字要和 zh 翻譯一樣`);

        // 不能在 h2 裡面：I18nManager 會把有 data-i18n 的 h2 整段內容換成翻譯，標籤會消失
        const heading = card.body.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/);
        assert.ok(heading, `${name} 的卡片沒有 h2`);
        assert.doesNotMatch(heading[1], /<span|guide_pending/, `${name} 的「撰寫中」不能放在 h2 裡面`);
        // 放在說明下面
        const descAt = card.body.indexOf('guide-card-desc');
        assert.ok(descAt !== -1 && descAt < card.body.indexOf('guide_pending'), `${name} 的「撰寫中」要放在說明下面`);
    }

    assert.deepEqual(LANGS.map((lang) => guideText(lang).get('guide_pending')), ['撰寫中', 'In progress', '執筆中']);
});

// ---------- 側欄（tools/guide/sidebar-template.js）----------
// 手機的查詢：窄螢幕（寬度 768px 以下），或橫放的手機（寬度超過 768px 但高度 500px 以下）。
// sidebar-template.js 的 MOBILE_QUERY 和 style.css 的手機版面 @media 必須是同一個字串
const PHONE_QUERY = '(max-width: 768px), (max-height: 500px)';
// 視窗大小（CSS px）：電腦、直拿的手機、橫放的手機
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };

// 替身的 matchMedia 照查詢文字真的判斷視窗大小：逗號是「或」，每一項是 (max-width: Npx) 或 (max-height: Npx)（含 N）。
// 看不懂的寫法直接丟錯，不默默當成不符合（不然查詢改了寫法，測試會看起來還是對的）
function matchesQuery(text, viewport) {
    return text.split(',').some((part) => {
        const term = part.trim().match(/^\(max-(width|height):\s*(\d+)px\)$/);
        assert.ok(term, `matchMedia 替身看不懂這個查詢：${part.trim()}`);
        return viewport[term[1]] <= Number(term[2]);
    });
}

// 在 fake-dom 裡跑真正的 sidebar-template.js。fake-dom 沒有 matchMedia：這裡用替身，照視窗大小（viewport，預設是電腦；narrow: true 是直拿的手機）
// 判斷每個查詢，setViewport() 改視窗大小，查詢的結果變了才派送 change（同真的瀏覽器）；setNarrow(true) 是縮成直拿的手機，false 是回到電腦。
// fake-dom 也沒有 details.open：開關就是 open 屬性（程式用 setAttribute／removeAttribute）
function sidebarPage({ currentPage = 'dungeon', narrow = false, viewport = narrow ? PHONE : DESKTOP, matchMedia = true } = {}) {
    const dom = createFakeDom({ url: `https://ff14.tw/tools/guide/${currentPage}.html` });
    const asked = [];
    const lists = [];
    let size = { ...viewport };
    if (matchMedia) {
        dom.window.matchMedia = (text) => {
            asked.push(text);
            const listeners = new Set();
            const list = {
                text,
                listeners,
                matches: matchesQuery(text, size),
                addEventListener(type, listener) { if (type === 'change') listeners.add(listener); },
                removeEventListener(type, listener) { if (type === 'change') listeners.delete(listener); }
            };
            lists.push(list);
            return list;
        };
    }
    dom.document.body.appendChild(dom.el('div', { id: 'guide-sidebar-placeholder', 'data-current-page': currentPage }));
    dom.load(`${GUIDE_DIR}/sidebar-template.js`);
    const template = dom.window.GuideSidebarTemplate;
    const sidebar = template.load();
    const page = {
        dom,
        template,
        asked,
        sidebar,
        details: sidebar.querySelector('details'),
        links: sidebar.querySelectorAll('a.toc-link'),
        setViewport(next) {
            size = { ...next };
            for (const list of lists) {
                const matches = matchesQuery(list.text, size);
                if (matches === list.matches) continue;
                list.matches = matches;
                for (const listener of [...list.listeners]) listener({ matches });
            }
        },
        setNarrow(next) { page.setViewport(next ? PHONE : DESKTOP); }
    };
    return page;
}
const isOpen = (details) => details.hasAttribute('open');
const activePages = (links) => links.filter((link) => link.classList.contains('active')).map((link) => link.getAttribute('data-page'));

test('側欄：目錄是 details，撰寫中的 4 項有標示，目前這一頁是 active', () => {
    const { dom, template, sidebar, details, links } = sidebarPage({ currentPage: 'dungeon' });

    // aside.toc-sidebar > details.toc-container > summary.toc-title + nav.toc-nav#tocNav + a.back-to-landing
    assert.equal(sidebar.tagName, 'ASIDE');
    assert.ok(sidebar.classList.contains('toc-sidebar'));
    assert.deepEqual(sidebar.children.map((child) => child.tagName), ['DETAILS']);
    assert.ok(details.classList.contains('toc-container'));
    assert.deepEqual(details.children.map((child) => child.tagName), ['SUMMARY', 'NAV', 'A']);
    const [summary, nav, back] = details.children;
    assert.ok(summary.classList.contains('toc-title'));
    assert.equal(summary.getAttribute('data-i18n'), 'guide_toc_title');
    assert.equal(summary.textContent, guideText('zh').get('guide_toc_title'), '預設文字和 zh 翻譯一樣');
    assert.ok(nav.classList.contains('toc-nav'));
    assert.equal(nav.id, 'tocNav');
    assert.ok(back.classList.contains('back-to-landing'));
    assert.equal(back.getAttribute('href'), 'index.html');
    assert.equal(back.getAttribute('data-i18n'), 'guide_back_to_index');
    assert.equal(dom.document.getElementById('guide-sidebar-placeholder'), null, '佔位元素應該被側欄取代');

    // 7 個主題，順序照舊；ITEMS 裡 pending 的正好是 4 項
    assert.deepEqual(links.map((link) => link.getAttribute('data-page')), TOPICS);
    assert.deepEqual(Array.from(template.ITEMS).filter((item) => item.pending === true).map((item) => item.page), PENDING);

    const zh = guideText('zh');
    for (const link of links) {
        const page = link.getAttribute('data-page');
        // 連結是「圖示 + label」；label 裡是名稱，還沒寫的主題後面再加一個標籤
        assert.deepEqual(link.children.map((child) => child.className), ['toc-icon', 'toc-label'], `${page} 的連結只有圖示和 label`);
        const label = link.children[1];
        const name = label.children[0];
        assert.ok(name.getAttribute('data-i18n').startsWith('guide_toc_'), `${page} 的名稱要有 data-i18n`);

        const tag = link.querySelector('.tag[data-i18n="guide_pending"]');
        if (!PENDING.includes(page)) {
            assert.equal(tag, null, `${page} 的連結不該有「撰寫中」`);
            assert.equal(label.children.length, 1, `${page} 的 label 只有名稱`);
            continue;
        }
        assert.ok(tag, `${page} 的連結要有「撰寫中」`);
        for (const cls of ['tag', 'tag-warning', 'toc-pending']) {
            assert.ok(tag.classList.contains(cls), `${page} 的標籤缺少 class ${cls}（目前是 ${tag.className}）`);
        }
        assert.equal(tag.textContent, zh.get('guide_pending'));
        // 標籤是名稱的兄弟，不在有 data-i18n 的名稱裡面：換語言時名稱的文字會整段被換掉
        assert.deepEqual(label.children.map((child) => child.tagName), ['SPAN', 'SPAN']);
        assert.equal(label.children[1], tag, `${page} 的標籤要接在名稱後面`);
        assert.equal(name.querySelector('.tag'), null, `${page} 的標籤不能放進名稱裡`);
    }

    // 目前這一頁（撰寫中的也一樣）標 active，只有一個
    assert.deepEqual(activePages(links), ['dungeon']);
    assert.deepEqual(activePages(sidebarPage({ currentPage: 'chocobo' }).links), ['chocobo']);
});

test('側欄：電腦寬度打開、手機寬度收起來；沒有 matchMedia 時維持打開', () => {
    const wide = sidebarPage({ narrow: false });
    const { MOBILE_QUERY } = wide.template;
    assert.equal(MOBILE_QUERY, PHONE_QUERY);
    // 斷點和 style.css 的手機版面 @media 一致
    assert.ok(read(`${GUIDE_DIR}/style.css`).includes(`@media ${MOBILE_QUERY} {`), 'style.css 的手機版面要用和 MOBILE_QUERY 一樣的 @media');

    assert.deepEqual(wide.asked, [MOBILE_QUERY]);
    assert.equal(isOpen(wide.details), true, '電腦寬度要打開');

    const narrow = sidebarPage({ narrow: true });
    assert.equal(isOpen(narrow.details), false, '手機寬度要收起來');
    assert.equal(narrow.links.length, 7, '收起來只是不顯示，連結都還在');

    const noMedia = sidebarPage({ matchMedia: false });
    assert.equal(isOpen(noMedia.details), true, '沒有 matchMedia 時維持打開');
});

test('側欄：橫放的手機（寬度超過 768px 但很矮）也和窄螢幕一樣收起來；寬度 768px、高度 500px 是分界', () => {
    // 橫放的 iPhone 是 844×390：寬度超過 768px，電腦版 sticky 側欄的框（最高 100vh 減一點）只有 326px，放不下整份目錄，
    // 會變成要在框裡捲的框（反目標）。所以高度 500px 以下也當成手機：一行「目錄」，點開才展開
    for (const [name, viewport] of [['iPhone 橫放', PHONE_LANDSCAPE], ['iPhone Pro Max 橫放', { width: 932, height: 430 }], ['小手機橫放', { width: 667, height: 375 }]]) {
        const page = sidebarPage({ viewport });
        assert.equal(isOpen(page.details), false, `${name}（${viewport.width}×${viewport.height}）要收起來`);
        assert.equal(page.links.length, 7, '收起來只是不顯示，連結都還在');
    }
    assert.equal(isOpen(sidebarPage({ viewport: PHONE }).details), false, '直拿的手機照樣收起來');
    assert.equal(isOpen(sidebarPage({ viewport: DESKTOP }).details), true, '電腦（夠高）照樣打開');

    // 分界：寬度 768px（含）以下或高度 500px（含）以下是手機
    for (const [width, height, open] of [
        [768, 800, false], [769, 800, true],
        [1024, 500, false], [1024, 501, true],
        [769, 501, true], [769, 500, false], [768, 501, false]
    ]) {
        assert.equal(isOpen(sidebarPage({ viewport: { width, height } }).details), open, `${width}×${height} 的目錄${open ? '要打開' : '要收起來'}`);
    }
});

test('側欄：視窗跨過斷點（寬度 768px、高度 500px）時開關跟著換，焦點在目錄裡就維持打開', () => {
    const page = sidebarPage({ narrow: true });
    const { dom, details, links } = page;
    const outside = dom.el('button', { id: 'outside' }, '頁面上別的按鈕');
    dom.document.body.appendChild(outside);
    assert.equal(isOpen(details), false);

    // 手機 → 電腦：打開
    page.setNarrow(false);
    assert.equal(isOpen(details), true);

    // 電腦 → 手機，焦點在目錄外面：收起來
    outside.focus();
    page.setNarrow(true);
    assert.equal(isOpen(details), false);
    page.setNarrow(false);
    assert.equal(isOpen(details), true);

    // 電腦 → 手機，焦點在目錄裡的連結上：維持打開（收起來的話，焦點會掉回頁面最上面）
    links[2].focus();
    page.setNarrow(true);
    assert.equal(isOpen(details), true, '焦點在連結上，不能收起來');
    assert.ok(dom.document.activeElement === links[2], '焦點還在那個連結上');

    // 焦點在「目錄」那一行上也一樣
    page.setNarrow(false);
    details.children[0].focus();
    page.setNarrow(true);
    assert.equal(isOpen(details), true, '焦點在目錄那一行上，不能收起來');

    // 焦點離開之後再跨一次，就照寬度收起來
    outside.focus();
    page.setNarrow(false);
    page.setNarrow(true);
    assert.equal(isOpen(details), false);

    // 高度也一樣：電腦視窗拉矮到 500px 以下（寬度仍是電腦）就收起來，拉高又打開；焦點在目錄裡時維持打開
    page.setViewport(DESKTOP);
    assert.equal(isOpen(details), true);
    outside.focus();
    page.setViewport({ width: 1280, height: 480 });
    assert.equal(isOpen(details), false, '電腦視窗拉矮到 500px 以下要收起來');
    page.setViewport(DESKTOP);
    assert.equal(isOpen(details), true, '拉高又打開');
    links[0].focus();
    page.setViewport({ width: 1280, height: 480 });
    assert.equal(isOpen(details), true, '焦點在連結上，拉矮也不能收起來');

    // 手機直拿 → 橫放：兩邊都是手機，不會因為轉向就展開
    page.setViewport(DESKTOP);
    outside.focus();
    page.setViewport(PHONE);
    assert.equal(isOpen(details), false);
    page.setViewport(PHONE_LANDSCAPE);
    assert.equal(isOpen(details), false, '轉成橫放還是手機，維持收起來');
    page.setViewport(PHONE);
    assert.equal(isOpen(details), false);
});

// ---------- 手機目錄的樣式 ----------
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
// @media 後面這個查詢的大括號內容（括號配對）
function mediaBlock(css, query) {
    const start = css.indexOf(`@media ${query} {`);
    assert.notEqual(start, -1, `style.css 找不到 @media ${query}`);
    const open = css.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
    }
    throw new Error(`@media ${query} 沒有結束的大括號`);
}
// 一段樣式裡的每一條規則（只有一層大括號；@media 裡面的規則也會列出來）：{ selector, body }
const rulesOf = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));

test('手機目錄沒有在框裡捲：手機版面（窄螢幕與橫放的手機）要把 .toc-sidebar 的 sticky、max-height、overflow 蓋回去並排成單欄，整個檔案沒有 overflow-x', () => {
    const css = stripComments(read(`${GUIDE_DIR}/style.css`));
    const phone = rulesOf(mediaBlock(css, PHONE_QUERY));
    const bodyOf = (rules, selector) => rules
        .filter((rule) => rule.selector.split(',').map((s) => s.trim()).includes(selector))
        .map((rule) => rule.body)
        .join('\n');

    // 電腦版的 .toc-sidebar 是 sticky、有 max-height 和 overflow-y: auto（放不下就在框裡捲）。反目標是手機上留下任何要在框裡捲的目錄，
    // 所以手機版面一定要把這幾樣都蓋回去，少任何一行目錄就變回要在框裡捲的框
    const sidebar = bodyOf(phone, '.toc-sidebar');
    assert.match(sidebar, /position\s*:\s*relative\s*;/, '手機的 .toc-sidebar 不黏住（position: relative）');
    assert.match(sidebar, /width\s*:\s*100%\s*;/, '手機的 .toc-sidebar 佔滿一欄（width: 100%）');
    assert.match(sidebar, /max-height\s*:\s*none\s*;/, '手機的 .toc-sidebar 要 max-height: none，目錄整個展開');
    assert.match(sidebar, /overflow\s*:\s*visible\s*;/, '手機的 .toc-sidebar 要 overflow: visible，不是捲動容器');
    // 單欄：目錄在文章上面
    assert.match(bodyOf(phone, '.guide-layout'), /flex-direction\s*:\s*column\s*;/, '手機的 .guide-layout 要排成單欄');
    // 手機版面要寫在電腦版 .toc-sidebar 後面，同樣的選擇器才蓋得掉
    assert.ok(css.indexOf(`@media ${PHONE_QUERY} {`) > css.indexOf('.toc-sidebar {'), '手機版面要在電腦版的 .toc-sidebar 後面');

    // 其他與目錄有關的規則也不能把目錄變成要捲的框
    for (const rule of phone.filter((r) => /\.toc-/.test(r.selector))) {
        for (const m of rule.body.matchAll(/overflow(?:-[xy])?\s*:\s*([^;]+)/g)) {
            assert.equal(m[1].trim(), 'visible', `手機的 ${rule.selector} 不能設 overflow: ${m[1].trim()}（目錄要整個展開，不在框裡捲）`);
        }
        for (const m of rule.body.matchAll(/max-height\s*:\s*([^;]+)/g)) {
            assert.equal(m[1].trim(), 'none', `手機的 ${rule.selector} 不能限制高度（max-height: ${m[1].trim()}）`);
        }
    }
    // 整個檔案都不要有橫向捲動（站長的規則：手機不要左右捲）
    assert.doesNotMatch(css, /overflow-x\s*:\s*(auto|scroll)/, 'style.css 不能有 overflow-x: auto|scroll');
});

test('目錄那一行：不用瀏覽器的三角形，右邊畫 ▸／▾，手機上至少 --control-md 高，鍵盤焦點看得到', () => {
    const css = stripComments(read(`${GUIDE_DIR}/style.css`));
    const rules = rulesOf(css);
    const body = (selector) => rules
        .filter((rule) => rule.selector.split(',').map((s) => s.trim()).includes(selector))
        .map((rule) => rule.body)
        .join('\n');

    assert.match(body('.toc-title'), /list-style\s*:\s*none/, '.toc-title 要拿掉瀏覽器預設的三角形');
    assert.match(body('.toc-title::-webkit-details-marker'), /display\s*:\s*none/, 'Safari 的三角形要另外拿掉');
    // 三角形只是裝飾：第二行把替代文字設成空的，螢幕閱讀器不念（不認得這種寫法的瀏覽器略過第二行）
    assert.match(body('.toc-title::after'), /content\s*:\s*'▸'\s*;[\s\S]*content\s*:\s*'▸'\s*\/\s*''/, '收起來時右邊畫 ▸，替代文字是空的');
    assert.match(body('.toc-container[open] > .toc-title::after'), /content\s*:\s*'▾'\s*;[\s\S]*content\s*:\s*'▾'\s*\/\s*''/, '打開時右邊畫 ▾，替代文字是空的');
    assert.match(body('.toc-title:focus-visible'), /outline\s*:/, '鍵盤焦點要看得到');

    const narrowTitle = rulesOf(mediaBlock(css, PHONE_QUERY)).filter((rule) => rule.selector === '.toc-title');
    assert.ok(narrowTitle.some((rule) => /min-height\s*:\s*var\(--control-md\)/.test(rule.body)), '手機上「目錄」那一行至少要 var(--control-md) 高，整行都能點');
});

test('目錄裡的「撰寫中」：label 放不下時標籤自己換行、標籤不縮，目前這一頁的標籤用不透明底', () => {
    const css = stripComments(read(`${GUIDE_DIR}/style.css`));
    const body = (selector) => rulesOf(css)
        .filter((rule) => rule.selector.split(',').map((s) => s.trim()).includes(selector))
        .map((rule) => rule.body)
        .join('\n');

    // 英文名稱長、側欄只有 220px 寬時，標籤不能把一列撐出側欄（側欄是 overflow-y: auto，會冒出橫向捲軸）：
    // label 自己換行、可以縮到比內容窄，標籤不縮（字不換行），所以 label 最窄也有一個標籤那麼寬
    const label = body('.toc-label');
    assert.match(label, /display\s*:\s*flex/);
    assert.match(label, /flex-wrap\s*:\s*wrap/, '.toc-label 放不下時標籤要換到下一行');
    assert.match(label, /min-width\s*:\s*0/, '.toc-label 要能縮到比內容窄');
    assert.match(body('.toc-pending'), /flex-shrink\s*:\s*0/, '標籤不能縮');

    // 目前這一頁是主色底，標籤自己的柔和底色（深色模式是透明的）疊上去字會糊掉：換成不透明的卡片底色
    assert.match(body('.toc-link.active .toc-pending'), /background\s*:\s*var\(--color-surface\)/, '目前這一頁的標籤要用不透明的底色');
});

// ---------- 用語（TERMINOLOGY.md）----------
// 繁中服的官方用語：Free Company 是「部隊」，Guildhest 是「公會令」，世界叫「艾歐澤亞」，主屬性 Dexterity 是「靈巧」。
// 「公會」只能出現在「公會令」裡面。changelog.html 的舊條目是歷史，不檢查；Lodestone 查詢裡的「公會」這次不動，也不在範圍內。
const HOME_TRANSLATIONS = 'assets/js/i18n/translations/index.js';
const homeText = (lang) => translationValues(HOME_TRANSLATIONS, lang);

// 要檢查用語的文字：[名稱, 內容]。攻略資料資料夾裡的每一個 html（之後多一頁也會被檢查）、側欄、首頁，
// 以及兩份翻譯檔中文那一組的「值」（鍵名 guide_toc_guild 不是用語，不算）
function terminologySources() {
    const sources = fs.readdirSync(path.join(ROOT, GUIDE_DIR))
        .filter((file) => file.endsWith('.html'))
        .sort()
        .map((file) => [`${GUIDE_DIR}/${file}`, read(`${GUIDE_DIR}/${file}`)]);
    sources.push([`${GUIDE_DIR}/sidebar-template.js`, read(`${GUIDE_DIR}/sidebar-template.js`)], ['index.html', read('index.html')]);
    for (const file of [GUIDE_TRANSLATIONS, HOME_TRANSLATIONS]) {
        for (const [key, value] of translationValues(file, 'zh')) sources.push([`${file} 的 zh ${key}`, value]);
    }
    return sources;
}

test('用語：部隊、公會令、艾歐澤亞、靈巧', () => {
    const sources = terminologySources();
    // 檢查得到東西：攻略資料 8 頁都在，兩份翻譯檔的中文也解析得出字（解析不到就等於沒檢查）
    const names = sources.map(([name]) => name);
    for (const page of PAGES) assert.ok(names.includes(page), `${page} 沒有被檢查`);
    for (const file of [GUIDE_TRANSLATIONS, HOME_TRANSLATIONS]) {
        const parsed = names.filter((name) => name.startsWith(`${file} 的 zh `)).length;
        assert.ok(parsed >= 20, `${file} 的 zh 只解析到 ${parsed} 個值，測試可能失效`);
    }

    // 全部問題收在一起，失敗時一次看到每一處
    const problems = [];
    const expect = (ok, message) => { if (!ok) problems.push(message); };

    // 沒有指 Free Company 的「公會」（「公會令」不算）、沒有「行會令」「艾歐乍亞」
    const WRONG = [
        [/公會(?!令)/g, '「公會」（Free Company 是「部隊」）'],
        [/行會令/g, '「行會令」（是「公會令」）'],
        [/艾歐乍亞/g, '「艾歐乍亞」（是「艾歐澤亞」）']
    ];
    for (const [name, text] of sources) {
        for (const [pattern, hint] of WRONG) {
            for (const hit of text.matchAll(pattern)) {
                const around = text.slice(Math.max(0, hit.index - 10), hit.index + hit[0].length + 10).replace(/\s+/g, ' ');
                problems.push(`${name} 還寫著${hint}：…${around}…`);
            }
        }
    }

    // 組隊那一頁的主屬性是「靈巧」，不是「敏捷」（和 Lodestone 查詢一致）
    const party = read(`${GUIDE_DIR}/party.html`);
    expect(!party.includes('敏捷'), `${GUIDE_DIR}/party.html 還寫著「敏捷」（主屬性 Dexterity 是「靈巧」）`);
    expect(party.includes('靈巧'), `${GUIDE_DIR}/party.html 沒有「靈巧」`);

    // 首頁攻略卡片的英文、日文也不再把 Free Company 寫成 guild／ギルド
    const en = homeText('en');
    for (const key of ['tool_guide_desc', 'status_guide_pages_pending']) {
        expect(en.get(key), `${HOME_TRANSLATIONS} 的 en 缺少 ${key}`);
        expect(!/guild/i.test(en.get(key) ?? ''), `${HOME_TRANSLATIONS} 的 en ${key} 還寫著 guild：${en.get(key)}`);
    }
    const ja = homeText('ja').get('status_guide_pages_pending');
    expect(ja, `${HOME_TRANSLATIONS} 的 ja 缺少 status_guide_pages_pending`);
    expect(!(ja ?? '').includes('ギルド'), `${HOME_TRANSLATIONS} 的 ja status_guide_pages_pending 還寫著ギルド：${ja}`);

    assert.deepEqual(problems, []);
});

test('部隊：改過的地方確實寫了官方名稱，主題名稱的預設文字和 zh 翻譯一樣', () => {
    const problems = [];
    const expect = (ok, message) => { if (!ok) problems.push(message); };
    const zh = guideText('zh');

    // 主題名稱：zh 翻譯，以及翻譯檔載入前看到的預設文字（攻略首頁的卡片、大國防聯軍的「上一篇」、部隊頁的標題、側欄）
    for (const key of ['guide_toc_guild', 'guide_section_guild_title']) {
        expect(zh.get(key) === '部隊', `${GUIDE_TRANSLATIONS} 的 zh ${key} 要寫「部隊」：${zh.get(key)}`);
    }
    let checked = 0;
    for (const page of PAGES) {
        const html = read(page);
        for (const key of ['guide_toc_guild', 'guide_section_guild_title']) {
            for (const m of html.matchAll(new RegExp(`<(\\w+)\\b[^>]*\\sdata-i18n="${key}"[^>]*>([^<]*)</\\1>`, 'g'))) {
                checked++;
                expect(m[2].trim() === zh.get(key), `${page} 的 ${key} 預設文字是「${m[2].trim()}」，zh 翻譯是「${zh.get(key)}」`);
            }
        }
    }
    expect(checked >= 3, `只檢查到 ${checked} 處主題名稱，解析可能失效`);
    const guildItem = sidebarPage().template.ITEMS.find((item) => item.page === 'guild');
    expect(guildItem.text === zh.get('guide_toc_guild'), `sidebar-template.js 的部隊預設文字是「${guildItem.text}」，zh 翻譯是「${zh.get('guide_toc_guild')}」`);
    expect(read(`${GUIDE_DIR}/guild.html`).includes('<title>部隊 - 攻略資料 - FF14.tw</title>'), 'guild.html 的 <title> 要是「部隊 - 攻略資料 - FF14.tw」');

    // 說明文字裡提到 Free Company 的地方：中文寫部隊，英文寫 Free Company，日文寫フリーカンパニー
    const homeZh = homeText('zh');
    for (const [what, text] of [
        ['guide.js 的 zh guide_description', zh.get('guide_description')],
        ['攻略首頁的 meta description', metaOf(read(`${GUIDE_DIR}/index.html`), 'description')?.content],
        ['首頁的 zh tool_guide_desc', homeZh.get('tool_guide_desc')],
        ['首頁的 zh status_guide_pages_pending', homeZh.get('status_guide_pages_pending')]
    ]) expect(/部隊/.test(text ?? ''), `${what} 要寫「部隊」：${text}`);
    expect(/Free Compan/.test(homeText('en').get('tool_guide_desc') ?? ''), '首頁的 en tool_guide_desc 要寫 Free Company');
    expect(/Free Company/.test(homeText('en').get('status_guide_pages_pending') ?? ''), '首頁的 en status_guide_pages_pending 要寫 Free Company');
    expect((homeText('ja').get('status_guide_pages_pending') ?? '').includes('フリーカンパニー'), '首頁的 ja status_guide_pages_pending 要寫フリーカンパニー');

    // 陸行鳥頁：寄養的說明改成「部隊房屋」（陸行鳥廄那一行本來就寫部隊房屋，所以共兩處）和兩處「退出部隊」
    const chocobo = read(`${GUIDE_DIR}/chocobo.html`);
    expect((chocobo.match(/部隊房屋/g) || []).length >= 2, 'chocobo.html 的寄養說明要寫「部隊房屋」');
    expect((chocobo.match(/退出部隊/g) || []).length >= 2, 'chocobo.html 要有兩處「退出部隊」');

    // 「行會令」改成「公會令」、「艾歐乍亞」改成「艾歐澤亞」：換成對的字，不是只刪掉
    expect(read(`${GUIDE_DIR}/grand-company.html`).includes('公會令'), 'grand-company.html 要寫「公會令」');
    expect(read(`${GUIDE_DIR}/party.html`).includes('艾歐澤亞'), 'party.html 要寫「艾歐澤亞」');

    assert.deepEqual(problems, []);
});
