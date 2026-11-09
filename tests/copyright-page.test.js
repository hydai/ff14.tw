const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// 照官方素材使用規範附上「© SQUARE ENIX」，前面照繁中版官網加上 FINAL FANTASY XIV；三種語言都是同一串，不翻譯
const SE_NOTICE = 'FINAL FANTASY XIV © SQUARE ENIX';
const TRANSLATIONS = 'assets/js/i18n/translations/copyright.js';

// 遞迴列出 dir（相對於專案根目錄）底下所有 .ext 結尾的檔案，回傳相對路徑
function listFiles(dir, ext, out = []) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) listFiles(rel, ext, out);
        else if (entry.name.endsWith(ext)) out.push(rel);
    }
    return out;
}

test('版權聲明頁的 SQUARE ENIX 標示是「FINAL FANTASY XIV © SQUARE ENIX」：照規範附上「© SQUARE ENIX」，前面照繁中版官網加上 FINAL FANTASY XIV', () => {
    // 沒有 JavaScript 時看得到的就是 HTML 的預設字
    const m = read('copyright.html').match(/data-i18n="copyright_se_p1"[^>]*>([^<]*)</);
    assert.ok(m, 'copyright.html 找不到 copyright_se_p1');
    assert.equal(m[1], SE_NOTICE);
    // 三語同一串，不翻譯
    for (const lang of ['zh', 'en', 'ja']) {
        assert.equal(translationValues(TRANSLATIONS, lang).get('copyright_se_p1'), SE_NOTICE, `${lang} 的 copyright_se_p1`);
    }
});

test('網站的頁面與翻譯檔不再有停在 2025 年的舊版權寫法', () => {
    // 掃根目錄的 .html、tools/ 底下的 .html 與 assets/js/ 底下的 .js（遞迴）；
    // 不掃 tests/、docs/、api/：測試檔自己要寫出舊寫法才有東西可比對
    const pages = [...fs.readdirSync(ROOT).filter((name) => name.endsWith('.html')), ...listFiles('tools', '.html')];
    const scripts = listFiles('assets/js', '.js');
    assert.ok(pages.length >= 22, `只找到 ${pages.length} 頁，掃描範圍可能失效`);
    assert.ok(scripts.length >= 20, `只找到 ${scripts.length} 個腳本，掃描範圍可能失效`);

    for (const file of [...pages, ...scripts]) {
        const source = read(file);
        assert.ok(!/2010\s*-\s*2025/.test(source), `${file} 還有停在 2025 年的「2010 - 2025」`);
        assert.ok(!source.includes('Copyright (C)'), `${file} 還有舊寫法「Copyright (C)」`);
    }
});

// ---------- 版面（assets/css/pages.css） ----------
// 關於頁與版權聲明頁共用 pages.css 的規則：版權聲明頁改版面時，關於頁要照舊。
// stripComments、cssRules、declarations 照抄 tests/home-page.test.js（各測試檔自己帶一份，不共用），declarations 讀的是 pages.css
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

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
const pagesRules = cssRules(stripComments(read('assets/css/pages.css')));
const MOBILE = '(max-width: 768px)';

// 某個選擇器（在指定的 @media 裡）所有規則的宣告合在一起
function declarations(selector, media = null) {
    const found = pagesRules.filter((r) => r.media === media && r.selectors.includes(selector));
    assert.ok(found.length > 0, `pages.css 找不到 ${selector}${media ? `（@media ${media}）` : ''} 的規則`);
    return found.map((r) => r.body).join(';');
}

test('版權聲明頁的標題前面沒有圖示，關於頁照舊', () => {
    for (const selector of ['.copyright-section h2::before', '.japanese-section h2::before', '.square-enix-copyright h2::before']) {
        assert.ok(!pagesRules.some((r) => r.selectors.includes(selector)), `${selector} 不該再有規則`);
    }
    assert.match(declarations('.mission-section h2::before'), /content:\s*"🎯"/);
    assert.match(declarations('.vision-section h2::before'), /content:\s*"🌟"/);
    assert.match(declarations('.contributors-section h2::before'), /content:\s*"👥"/);
});

test('版權聲明頁的內文不左右對齊、日文那一段也靠左，關於頁照舊左右對齊', () => {
    for (const rule of pagesRules.filter((r) => r.selectors.some((s) => s.startsWith('.copyright-section')))) {
        assert.doesNotMatch(rule.body, /text-align:\s*justify/, `${rule.selectors.join(', ')} 不該左右對齊`);
    }
    assert.match(declarations('.about-section p'), /text-align:\s*justify/);
    // 日文那一段和其他段一樣靠左（標題靠左之後，內文置中會變成同一張卡片裡兩種對齊），照舊是斜體小字
    assert.doesNotMatch(declarations('.japanese-section p'), /text-align:\s*center/, '日文那一段要和其他段一樣靠左');
    assert.match(declarations('.japanese-section p'), /font-style:\s*italic/);
});

test('768px 以下版權聲明頁的標題和電腦一樣排成一行靠左，SE 那一段照舊置中，關於頁照舊', () => {
    // 這個 @media 裡現在沒有 .copyright-section h2 的規則，for 迴圈逐條檢查會一條都不跑，所以用 some() 做一個一定會執行的斷言
    assert.ok(
        !pagesRules.some((r) => r.media === MOBILE && r.selectors.includes('.copyright-section h2') && /flex-direction:\s*column|text-align:\s*center/.test(r.body)),
        '768px 以下的 .copyright-section h2 不該改成直排或置中，要和電腦一樣排成一行靠左'
    );
    assert.match(declarations('.square-enix-copyright h2'), /justify-content:\s*center/);
    // 英文標題在 320px 換行時，置中靠的是 .square-enix-copyright 自己的 text-align
    assert.match(declarations('.square-enix-copyright'), /text-align:\s*center/, 'SE 那一段要照舊置中');
    // 手機上這一行要斷在「FINAL FANTASY XIV」與「© SQUARE ENIX」之間，不從名字中間斷開：靠 text-wrap: balance（不支援的瀏覽器照舊）
    assert.match(declarations('.square-enix-copyright p'), /text-wrap:\s*balance/, 'SE 那一行要用 text-wrap: balance，手機上才不會從名字中間斷開');
    assert.match(declarations('.about-section h2', MOBILE), /flex-direction:\s*column/);
    assert.match(declarations('.about-section h2', MOBILE), /text-align:\s*center/);
});
