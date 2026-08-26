const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['api', 'node_modules', 'docs', '.git', '.claude', '.superpowers']);
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap';

function listPages(dir = ROOT, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) listPages(full, out);
        else if (entry.name.endsWith('.html')) out.push(full);
    }
    return out;
}

function listToolCss(out = []) {
    const toolsDir = path.join(ROOT, 'tools');
    for (const tool of fs.readdirSync(toolsDir)) {
        const dir = path.join(toolsDir, tool);
        if (!fs.statSync(dir).isDirectory()) continue;
        for (const file of fs.readdirSync(dir)) {
            if (file.endsWith('.css')) out.push(path.join(dir, file));
        }
    }
    return out;
}

const rel = (p) => path.relative(ROOT, p);
const pages = listPages();

test('頁面清單不是空的（至少 20 頁）', () => {
    assert.ok(pages.length >= 20, `只找到 ${pages.length} 頁`);
});

test('每一頁都載入 tokens.css，且在 common.css 之前', () => {
    for (const page of pages) {
        const html = fs.readFileSync(page, 'utf8');
        const tokensAt = html.indexOf('assets/css/tokens.css');
        const commonAt = html.indexOf('assets/css/common.css');
        assert.notEqual(commonAt, -1, `${rel(page)} 沒有載入 common.css`);
        assert.notEqual(tokensAt, -1, `${rel(page)} 沒有載入 tokens.css`);
        assert.ok(tokensAt < commonAt, `${rel(page)} 的 tokens.css 必須排在 common.css 之前`);
    }
});

test('每一頁都用同一個 Google Fonts 連結（Noto Sans TC 400/500/600/700）', () => {
    for (const page of pages) {
        const html = fs.readFileSync(page, 'utf8');
        assert.ok(html.includes(FONT_HREF), `${rel(page)} 缺少標準字型連結`);
        assert.ok(!html.includes('wght@300'), `${rel(page)} 仍載入字重 300`);
        assert.ok(html.includes('href="https://fonts.gstatic.com" crossorigin'), `${rel(page)} 缺少 fonts.gstatic.com preconnect`);
    }
});

test('工具 CSS 不得以 @import 重複載入 /assets/css 的共用樣式', () => {
    for (const file of listToolCss()) {
        const css = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(css, /@import\s+url\(\s*['"]?\/?assets\/css\//, `${rel(file)} 以 @import 重複載入共用樣式`);
    }
});

const ALLOWED_INLINE_STYLE = /^display:\s*none;?$/;

test('頁面不得有內嵌 <style> 區塊', () => {
    for (const page of pages) {
        assert.doesNotMatch(fs.readFileSync(page, 'utf8'), /<style[\s>]/i, `${rel(page)} 仍有內嵌 <style> 區塊`);
    }
});

test('頁面的 style= 屬性只允許 JS 控制顯示用的 display: none 初始狀態', () => {
    for (const page of pages) {
        const html = fs.readFileSync(page, 'utf8');
        for (const m of html.matchAll(/\sstyle=(?:"([^"]*)"|'([^']*)')/g)) {
            assert.match((m[1] ?? m[2]).trim(), ALLOWED_INLINE_STYLE, `${rel(page)} 有不被允許的內嵌樣式：style="${m[1] ?? m[2]}"`);
        }
    }
});

test('noscript 導覽列全站統一使用 .noscript-nav', () => {
    for (const page of pages) {
        const html = fs.readFileSync(page, 'utf8');
        if (!html.includes('<noscript>')) continue;
        assert.match(html, /<nav class="noscript-nav">/, `${rel(page)} 的 noscript 導覽列未使用共用 class`);
    }
});

test('沒有頁面連結 dark-mode-tools.css', () => {
    for (const page of pages) {
        assert.doesNotMatch(fs.readFileSync(page, 'utf8'), /dark-mode-tools\.css/, `${rel(page)} 仍連結 dark-mode-tools.css`);
    }
});
