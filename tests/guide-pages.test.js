const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { translationValues } = require('./helpers/translation-parsers.js');
const { parseAttrs, classesOf } = require('./helpers/html-fragment.js');

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
