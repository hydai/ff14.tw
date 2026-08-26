const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 已完成遷移、必須「只讀 token」的檔案；每個任務完成後把檔案加進來
const TOKEN_CLEAN_FILES = [
    'assets/css/tokens.css',
    'assets/css/common.css',
    'assets/css/components/language-switcher.css',
    'assets/css/components/buttons.css',
    'assets/css/components/forms.css',
    'assets/css/components/tags.css',
    'assets/css/components/cards.css',
    'assets/css/tools-common.css',
    'tools/macro-converter/style.css',
    'tools/report-generator/style.css',
    'tools/guide/style.css',
    'tools/wondrous-tails/style.css',
    'tools/mini-cactpot/style.css',
    'tools/weather-forecast/style.css',
    'tools/timed-gathering/style.css',
    'tools/dungeon-database/style.css',
    'tools/faux-hollows-foxes/style.css',
    'tools/lodestone-lookup/styles.css',
    'tools/character-card/style.css',
    'tools/treasure-map-finder/style.css',
    'assets/css/pages.css',
];

// 這個檔案的職責就是彙整元件，允許 @import components/*.css
const IMPORT_ALLOWED = new Set(['assets/css/tools-common.css']);

// 元件、工具與站台樣式都不得自帶 dark 規則；只有 tokens.css（定義）例外
const DARK_RULES_ALLOWED = new Set(['assets/css/tokens.css']);

// 已遷移的工具目錄：HTML / JS 不得再使用共用元件的舊名稱（Plan 3 會刪除這些別名）
const MIGRATED_TOOLS = [
    'tools/macro-converter',
    'tools/report-generator',
    'tools/guide',
    'tools/wondrous-tails',
    'tools/mini-cactpot',
    'tools/weather-forecast',
    'tools/timed-gathering',
    'tools/dungeon-database',
    'tools/faux-hollows-foxes',
    'tools/lodestone-lookup',
    'tools/character-card',
    'tools/treasure-map-finder',
];
const LEGACY_CLASSES = ['tag-filter', 'btn-outline-primary', 'btn-outline-secondary', 'btn-outline-danger', 'tag-secondary', 'tag-light', 'tag-dark', 'tag-lg', 'tag-sm'];

// ---------- 小工具 ----------
function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}
function block(css, selector) {
    // 取出 `selector {` … `}` 的內容（token 檔只有一層大括號）
    const start = css.indexOf(selector + ' {');
    assert.notEqual(start, -1, `找不到區塊 ${selector}`);
    const end = css.indexOf('}', start);
    return css.slice(start + selector.length + 2, end);
}
function definitions(cssBlock) {
    const map = new Map();
    for (const m of cssBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
    return map;
}
function usedVars(css) {
    return [...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]);
}
function escapeRegExp(text) {
    // 把 class 名稱／選擇器放進 RegExp 前，跳脫所有正規表示式的特殊字元
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function listFiles(dir, exts, out = []) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) listFiles(rel, exts, out);
        else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(rel);
    }
    return out;
}
function hasColorLiteral(value) {
    return /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(value);
}
function hex2rgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance(hex) {
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const [r, g, b] = hex2rgb(hex);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

const tokensCss = stripComments(read('assets/css/tokens.css'));
const light = definitions(block(tokensCss, ':root'));
const dark = definitions(block(tokensCss, '[data-theme="dark"]'));

// ---------- 測試 ----------
test('深色模式重新指定每一個含色碼的 token，且沒有只在深色出現的 token', () => {
    for (const [name, value] of light) {
        if (hasColorLiteral(value)) assert.ok(dark.has(name), `${name} 在 [data-theme="dark"] 缺少定義`);
    }
    for (const name of dark.keys()) assert.ok(light.has(name), `${name} 只在深色定義，:root 沒有`);
});

test('關鍵配色對比度達 WCAG AA（4.5:1）', () => {
    const pairs = [
        ['--color-on-primary', '--color-primary'],
        ['--color-text', '--color-bg'],
        ['--color-heading', '--color-surface'],
        ['--color-muted', '--color-bg'],
        ['--color-muted', '--color-surface'],
        ['--color-on-success', '--color-success'],
        ['--color-on-warning', '--color-warning'],
        ['--color-on-danger', '--color-danger'],
        ['--color-on-info', '--color-info'],
        ['--color-primary', '--color-surface'],
    ];
    for (const theme of [light, dark]) {
        for (const [fg, bg] of pairs) {
            const f = theme.get(fg), b = theme.get(bg);
            assert.match(f, /^#[0-9a-f]{6}$/i, `${fg} 必須是 6 位色碼`);
            assert.match(b, /^#[0-9a-f]{6}$/i, `${bg} 必須是 6 位色碼`);
            const ratio = contrast(f, b);
            assert.ok(ratio >= 4.5, `${fg} 對 ${bg} 對比 ${ratio.toFixed(2)} < 4.5`);
        }
    }
});

test('token-clean 檔案只讀 tokens.css、沒有色碼、沒有 @import、沒有 !important', () => {
    const allowed = new Set(light.keys());
    for (const file of TOKEN_CLEAN_FILES) {
        const css = stripComments(read(file));
        const own = new Set(definitions(css).keys());
        for (const name of usedVars(css)) {
            assert.ok(allowed.has(name) || own.has(name), `${file} 引用了未定義的 ${name}`);
        }
        if (file !== 'assets/css/tokens.css') {
            const noUrls = css.replace(/url\([^)]*\)/g, 'url()');
            const literal = noUrls.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|(?<![\w-])(white|black)(?![\w-])/i);
            assert.equal(literal, null, `${file} 含有色碼：${literal && literal[0]}`);
            if (!IMPORT_ALLOWED.has(file)) assert.doesNotMatch(css, /@import/, `${file} 不得使用 @import`);
            if (!DARK_RULES_ALLOWED.has(file)) assert.doesNotMatch(css, /\[data-theme=/, `${file} 不得自帶 [data-theme] 規則`);
            assert.doesNotMatch(css, /!important/, `${file} 不得使用 !important`);
        }
    }
});

test('tools-common.css 含有畫布定義的共用元件', () => {
    const css = stripComments(read('assets/css/tools-common.css'));
    const selectors = ['.tabs', '.tab', '.toggle', '.toggle-track', '.progress', '.progress-bar', '.cell', '.cell.best', '.table', '.table-wrap', '.empty-state', '.dialog-overlay', '.dialog', '.dialog-actions'];
    for (const selector of selectors) {
        const re = new RegExp(`(^|[\\s,])${escapeRegExp(selector)}\\s*[,{]`, 'm');
        assert.ok(re.test(css), `tools-common.css 缺少 ${selector}`);
    }
});

test('已遷移的工具不得再使用共用元件的舊 class 名稱', () => {
    for (const dir of MIGRATED_TOOLS) {
        for (const file of listFiles(dir, ['.html', '.js'])) {
            const text = read(file);
            for (const cls of LEGACY_CLASSES) {
                const re = new RegExp(`(?<![\\w-])${escapeRegExp(cls)}(?![\\w-])`);
                assert.doesNotMatch(text, re, `${file} 使用了舊 class ${cls}`);
            }
        }
    }
});

test('dark-mode-tools.css 不得覆寫共用元件', () => {
    const css = stripComments(read('assets/css/dark-mode-tools.css'));
    const shared = ['cell', 'progress', 'progress-bar', 'tabs', 'tab', 'toggle', 'toggle-track', 'table', 'table-wrap', 'dialog', 'dialog-overlay', 'empty-state', 'chip', 'card', 'tag', 'btn', 'toast'];
    for (const name of shared) {
        const re = new RegExp(`\\.${escapeRegExp(name)}(?![\\w-])`);
        assert.doesNotMatch(css, re, `dark-mode-tools.css 覆寫了共用元件 .${name}`);
    }
});
