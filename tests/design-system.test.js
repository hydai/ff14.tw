const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

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

// 這個檔案的職責就是彙整元件，允許 @import components/*.css
const IMPORT_ALLOWED = new Set(['assets/css/tools-common.css']);

// 自動列舉 assets/css 與 tools/*/ 底下所有 .css；只有角色卡的卡片成品樣式例外
function listAllCssFiles() {
    const out = [...listFiles('assets/css', ['.css']), ...listFiles('tools', ['.css'])];
    return out.sort();
}

// 卡片成品是使用者自訂的畫面，不隨主題變色、不受 token 規則約束（見該檔頂部註解）
const TOKEN_CLEAN_EXCLUDE = new Set(['tools/character-card/card-templates.css']);
const TOKEN_CLEAN_FILES = listAllCssFiles().filter((file) => !TOKEN_CLEAN_EXCLUDE.has(file));

// 只有 tokens.css 可以定義 [data-theme] 規則
const DARK_RULES_ALLOWED = new Set(['assets/css/tokens.css']);

// 相容別名（common.css 舊的 :root 別名層）：全站不得再出現
const LEGACY_VARS = ['primary-color', 'secondary-color', 'accent-color', 'dark-color', 'light-color', 'text-color', 'text-secondary', 'border-color', 'shadow', 'header-shadow', 'gradient-bg', 'bg-color', 'bg-secondary', 'card-bg', 'hover-bg', 'dropdown-bg', 'dropdown-shadow'];

const LEGACY_CLASSES = ['tag-filter', 'btn-outline-primary', 'btn-outline-secondary', 'btn-outline-danger', 'tag-secondary', 'tag-light', 'tag-dark', 'tag-lg', 'tag-sm'];

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
    assert.ok(TOKEN_CLEAN_FILES.length >= 20, `token-clean 清單不應該是空的（目前 ${TOKEN_CLEAN_FILES.length} 個）`);
    const allowed = new Set(light.keys());
    for (const file of TOKEN_CLEAN_FILES) {
        const css = stripComments(read(file));
        const own = new Set(definitions(css).keys());
        for (const name of usedVars(css)) {
            assert.ok(allowed.has(name) || own.has(name), `${file} 引用了未定義的 ${name}`);
        }
        if (file !== 'assets/css/tokens.css') {
            const noUrls = css.replace(/url\([^)]*\)/g, 'url()');
            const literal = noUrls.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|(?<![\w-])(white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|brown|gold|silver|navy|teal|cyan|magenta|lime|maroon|olive|aqua|fuchsia|crimson|salmon|khaki|indigo|violet|beige|ivory|tan)(?![\w-])/i);
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

test('全站不得使用共用元件的舊 class 名稱', () => {
    const files = [...listFiles('tools', ['.html', '.js']), ...listFiles('assets/js', ['.js']), 'index.html', 'about.html', 'copyright.html', 'changelog.html'];
    assert.ok(files.length >= 20, '清單不應該是空的');
    for (const file of files) {
        const text = read(file);
        for (const cls of LEGACY_CLASSES) {
            const re = new RegExp(`(?<![\\w-])${escapeRegExp(cls)}(?![\\w-])`);
            assert.doesNotMatch(text, re, `${file} 使用了舊 class ${cls}`);
        }
    }
});

test('dark-mode-tools.css 已刪除，且沒有頁面連結它', () => {
    assert.equal(fs.existsSync(path.join(ROOT, 'assets/css/dark-mode-tools.css')), false, 'assets/css/dark-mode-tools.css 應已刪除');
    for (const file of [...listFiles('tools', ['.html']), 'index.html', 'about.html', 'copyright.html', 'changelog.html']) {
        assert.doesNotMatch(read(file), /dark-mode-tools\.css/, `${file} 仍連結 dark-mode-tools.css`);
    }
});

test('全站不得再出現相容別名 var(--legacy)', () => {
    const files = [...listFiles('assets/css', ['.css']), ...listFiles('assets/js', ['.js']), ...listFiles('tools', ['.css', '.html', '.js']), 'index.html', 'about.html', 'copyright.html', 'changelog.html'];
    assert.ok(files.length >= 20, '清單不應該是空的');
    for (const file of files) {
        const text = read(file);
        for (const name of LEGACY_VARS) {
            const re = new RegExp(`var\\(--${escapeRegExp(name)}\\)`);
            assert.doesNotMatch(text, re, `${file} 使用了相容別名 --${name}`);
        }
    }
});

test('common.css 不再定義相容別名層', () => {
    const common = read('assets/css/common.css');
    for (const name of LEGACY_VARS) {
        assert.doesNotMatch(common, new RegExp('--' + escapeRegExp(name) + '\\s*:'), `common.css 不應再定義 --${name}`);
    }
});

// ---------- 對話框與圖示按鈕的無障礙屬性 ----------
function openTags(html, tagName) {
    return html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'g')) || [];
}
function classTokens(tag) {
    const m = tag.match(/\sclass="([^"]*)"/);
    return m ? m[1].split(/\s+/) : [];
}
const ROOT_PAGES = ['index.html', 'about.html', 'copyright.html', 'changelog.html'];

// 遮罩層的 class（也就是實際交給 ModalManager 的那一層）；
// route-panel／map-detail-modal 不經過 ModalManager 的遮罩層機制，但一樣是鎖住畫面的對話框，
// 所以也放進來，確保它們的 role="dialog" 不會在未來的修改中被靜默拿掉（規則 (b)）
const OVERLAY_CLASSES = ['dialog-overlay', 'popup-overlay', 'route-panel', 'map-detail-modal', 'my-list-panel'];
// 非模態對話框：格式面板開著時路線面板仍可操作，所以不得宣告 aria-modal
const NON_MODAL_DIALOG_IDS = ['formatPanel'];

function allOpenTags(html) {
    return html.match(/<[a-zA-Z][^>]*>/g) || [];
}
function attr(tag, name) {
    const m = tag.match(new RegExp(`\\s${escapeRegExp(name)}="([^"]*)"`));
    return m ? m[1] : null;
}

test('對話框的 role="dialog" 放在遮罩層，且有 aria-labelledby 與（除 #formatPanel 外）aria-modal', () => {
    const files = [...listFiles('tools', ['.html']), ...ROOT_PAGES];
    let roleCount = 0;
    let overlayCount = 0;
    for (const file of files) {
        const html = read(file);
        const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
        for (const tag of allOpenTags(html)) {
            const classes = classTokens(tag);
            const isOverlay = OVERLAY_CLASSES.some((c) => classes.includes(c));
            const hasDialogRole = /\srole="dialog"/.test(tag);
            const id = attr(tag, 'id');

            // (a) 每個 role="dialog" 都要有可存取名稱，並且除了非模態面板外都要 aria-modal="true"
            if (hasDialogRole) {
                roleCount++;
                const labelledby = attr(tag, 'aria-labelledby');
                const ariaLabel = attr(tag, 'aria-label');
                assert.ok(
                    (labelledby && labelledby.trim()) || (ariaLabel && ariaLabel.trim()),
                    `${file} 的 role="dialog" 缺少可存取名稱（aria-labelledby 或 aria-label）：${tag}`
                );
                if (labelledby) {
                    for (const target of labelledby.trim().split(/\s+/)) {
                        assert.ok(ids.has(target), `${file} 的 aria-labelledby="${target}" 在同一頁找不到對應的 id：${tag}`);
                    }
                }
                if (NON_MODAL_DIALOG_IDS.includes(id)) {
                    assert.doesNotMatch(tag, /\saria-modal=/, `${file} 的 #${id} 是非模態對話框，不應宣告 aria-modal：${tag}`);
                } else {
                    assert.match(tag, /\saria-modal="true"/, `${file} 的 role="dialog" 缺少 aria-modal="true"：${tag}`);
                }
            }

            // (b) 遮罩層一定要自己帶 role="dialog"（ModalManager 不再動 ARIA）
            if (isOverlay) {
                overlayCount++;
                assert.ok(hasDialogRole, `${file} 的遮罩層缺少 role="dialog"：${tag}`);
            }

            // (c) 內層的 .dialog 盒子必須是沒有 role 的一般容器
            if (classes.includes('dialog') && !isOverlay) {
                assert.ok(!hasDialogRole, `${file} 的內層 .dialog 不應該有 role="dialog"，請改放在遮罩層：${tag}`);
            }
        }
    }
    assert.ok(overlayCount > 0, '沒有找到任何遮罩層，測試可能失效');
    assert.ok(roleCount >= overlayCount, '沒有找到足夠的 role="dialog"，測試可能失效');

    // 明確驗證 #formatPanel（treasure-map-finder 的自訂格式面板）：非模態，但仍要有 role 與名稱
    const formatPanelFile = 'tools/treasure-map-finder/index.html';
    const formatPanelTag = allOpenTags(read(formatPanelFile)).find((tag) => /\sid="formatPanel"/.test(tag));
    assert.ok(formatPanelTag, `${formatPanelFile} 找不到 id="formatPanel" 的元素`);
    assert.match(formatPanelTag, /\srole="dialog"/, `${formatPanelFile} 的 #formatPanel 缺少 role="dialog"：${formatPanelTag}`);
    assert.doesNotMatch(formatPanelTag, /\saria-modal=/, `${formatPanelFile} 的 #formatPanel 不應宣告 aria-modal：${formatPanelTag}`);
    assert.match(formatPanelTag, /\saria-labelledby="[^"]+"/, `${formatPanelFile} 的 #formatPanel 缺少 aria-labelledby：${formatPanelTag}`);
});

test('.btn-close／.popup-close／.btn-remove 按鈕必須有可存取名稱（aria-label、title 或可見文字）', () => {
    const CLOSE_CLASSES = ['btn-close', 'popup-close', 'btn-remove', 'map-detail-close'];

    // 靜態 HTML 按鈕
    const htmlFiles = [...listFiles('tools', ['.html']), ...ROOT_PAGES];
    let checked = 0;
    for (const file of htmlFiles) {
        const html = read(file);
        for (const tag of openTags(html, 'button')) {
            const classes = classTokens(tag);
            if (!CLOSE_CLASSES.some((c) => classes.includes(c))) continue;
            checked++;
            const hasAriaLabel = /\saria-label="[^"]+"/.test(tag);
            const hasTitle = /\stitle="[^"]+"/.test(tag);
            const startIdx = html.indexOf(tag);
            const endIdx = html.indexOf('</button>', startIdx);
            const innerText = html.slice(startIdx + tag.length, endIdx).split(/<[^>]+>/).join('').trim();
            const hasVisibleText = /[\p{L}\p{N}]/u.test(innerText) && innerText.length > 1;
            assert.ok(hasAriaLabel || hasTitle || hasVisibleText, `${file} 的按鈕缺少可存取名稱：${tag}`);
        }
    }
    assert.ok(checked > 0, '沒有找到任何 CLOSE_CLASSES 中的按鈕，測試可能失效');

    // 明確驗證 #mapDetailClose：aria-label 必須交給 i18n 系統翻譯，鎖住這個屬性不會被靜默移除
    const mapDetailFile = 'tools/treasure-map-finder/index.html';
    const mapDetailCloseTag = openTags(read(mapDetailFile), 'button').find((tag) => attr(tag, 'id') === 'mapDetailClose');
    assert.ok(mapDetailCloseTag, `${mapDetailFile} 找不到 id="mapDetailClose" 的按鈕`);
    assert.match(mapDetailCloseTag, /\saria-label="[^"]+"/, `${mapDetailFile} 的 #mapDetailClose 缺少 aria-label：${mapDetailCloseTag}`);
    assert.match(mapDetailCloseTag, /\sdata-i18n-attr="aria-label"/, `${mapDetailFile} 的 #mapDetailClose 缺少 data-i18n-attr="aria-label"：${mapDetailCloseTag}`);

    // JS 動態建立的按鈕（heuristic：掃描 className = '...' 字面值）；alternation 直接從 CLOSE_CLASSES 產生，避免兩邊定義漂移
    const jsFiles = listFiles('tools', ['.js']);
    const closeClassAlt = CLOSE_CLASSES.map(escapeRegExp).join('|');
    const CLASS_RE = new RegExp(`(\\w+)\\.className\\s*=\\s*['"][^'"]*(?<![\\w-])(?:${closeClassAlt})(?![\\w-])[^'"]*['"]`, 'g');
    let jsChecked = 0;
    for (const file of jsFiles) {
        const js = read(file);
        for (const m of js.matchAll(CLASS_RE)) {
            jsChecked++;
            const varName = m[1];
            const win = js.slice(m.index, m.index + 500);
            const varRe = escapeRegExp(varName);
            const hasLabel = new RegExp(`${varRe}\\.setAttribute\\(\\s*['"]aria-label['"]|${varRe}\\.title\\s*=`).test(win);
            const textMatch = win.match(new RegExp(`${varRe}\\.textContent\\s*=\\s*['"\`]([^'"\`]*)['"\`]`));
            const hasVisibleText = !!(textMatch && /[\p{L}\p{N}]/u.test(textMatch[1]) && textMatch[1].length > 1);
            assert.ok(hasLabel || hasVisibleText, `${file} 動態建立的按鈕缺少可存取名稱（變數 ${varName}）`);
        }
    }
    assert.ok(jsChecked > 0, '沒有找到任何 JS 動態建立的 CLOSE_CLASSES 中的按鈕，測試可能失效');
});

test('猜謎方格工具的格子都設定 tabindex，可以用 Tab 鍵移動焦點', () => {
    const jsChecks = [
        { file: 'tools/faux-hollows-foxes/script.js', classNamePattern: /cell\.className\s*=\s*'cell board-cell'/ },
        { file: 'tools/wondrous-tails/script.js', classNamePattern: /cell\.className\s*=\s*'cell grid-cell'/ }
    ];
    for (const { file, classNamePattern } of jsChecks) {
        const js = read(file);
        const match = classNamePattern.exec(js);
        assert.ok(match, `${file} 找不到格子的 className 設定，測試可能失效`);
        const windowText = js.slice(match.index, match.index + 300);
        assert.match(windowText, /\.tabIndex\s*=\s*0|setAttribute\(\s*['"]tabindex['"]/, `${file} 的格子工廠沒有設定 tabindex`);
    }

    const html = read('tools/mini-cactpot/index.html');
    const gridCells = html.match(/<div class="cell grid-cell"[^>]*>/g) || [];
    assert.equal(gridCells.length, 9, 'mini-cactpot 應該有 9 個 .grid-cell');
    for (const tag of gridCells) {
        assert.match(tag, /\stabindex="0"/, `mini-cactpot 的格子缺少 tabindex="0"：${tag}`);
    }
});

test('每個 role="tablist" 都至少有一個帶 aria-selected 的 role="tab"', () => {
    const files = [...listFiles('tools', ['.html']), 'index.html', 'about.html', 'copyright.html', 'changelog.html'];
    let tablistCount = 0;
    for (const file of files) {
        const html = read(file);
        if (!/role="tablist"/.test(html)) continue;
        tablistCount++;
        const tabTags = html.match(/<[^>]+\srole="tab"[^>]*>/g) || [];
        assert.ok(tabTags.length > 0, `${file} 有 role="tablist" 卻找不到 role="tab"`);
        // 每個 role="tab" 都要有 aria-selected（比題目要求的「至少一個」更嚴謹，可完整防止漏加屬性）
        const allHaveAriaSelected = tabTags.every((tag) => /\saria-selected="(true|false)"/.test(tag));
        assert.ok(allHaveAriaSelected, `${file} 有 role="tab" 缺少 aria-selected`);
    }
    assert.ok(tablistCount > 0, '沒有找到任何 role="tablist"，測試可能失效');
});
