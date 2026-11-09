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
