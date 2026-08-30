const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 遞迴列出 dir（相對於 ROOT）底下所有符合副檔名的檔案，回傳相對路徑
function listFiles(dir, exts, out = []) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) listFiles(rel, exts, out);
        else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(rel);
    }
    return out;
}

// 掃描 assets/、tools/ 底下所有 .js（此範圍本來就不含 tests/、node_modules/）
const SCRIPT_FILES = [...listFiles('assets', ['.js']), ...listFiles('tools', ['.js'])];

// 取出翻譯檔裡 `lang: {`…對應 `}` 的區塊（只有一層巢狀字串屬性，作法比照 design-system.test.js 的 block()）
// 提升到模組層級（原本寫在下面 TARGETS 測試的函式本體內），讓新增的頁面級 data-i18n 測試也能共用，
// 行為與提升前完全相同，TARGETS 測試本身不需要跟著修改呼叫方式。
function jsBlock(code, lang) {
    const start = code.indexOf(`${lang}: {`);
    if (start === -1) return null;
    const openBrace = code.indexOf('{', start);
    let i = openBrace;
    let depth = 0;
    for (; i < code.length; i++) {
        if (code[i] === '{') depth++;
        else if (code[i] === '}') { depth--; if (depth === 0) break; }
    }
    return code.slice(openBrace, i + 1);
}
// 只認「行首縮排 + 識別字 + 冒號 + 引號」的鍵值宣告，避免英文譯文裡「Label:」這類字面值被誤判成 key
function jsKeys(blockText) {
    const set = new Set();
    if (!blockText) return set;
    for (const m of blockText.matchAll(/^\s*(\w+):\s*['"]/gm)) set.add(m[1]);
    return set;
}
function translationKeySet(file, lang) {
    return jsKeys(jsBlock(read(file), lang));
}

// 遞迴列出 dir（相對於 ROOT）底下所有 .html，回傳相對路徑（listFiles 已有副檔名清單版本，
// 這裡另外寫一個不篩副檔名、只找 .html 的版本，供下面的全站 data-i18n 測試使用）
function listHtmlFiles(dir, out = []) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) listHtmlFiles(rel, out);
        else if (entry.name.endsWith('.html')) out.push(rel);
    }
    return out;
}
// 全站會套用 i18n 的頁面：tools/ 底下所有 .html（含 12 個工具的 index.html 與 guide/ 的 8 個子頁面）
// 加上 4 個根頁面；api/test.html 不是玩家頁面，不列入
const ALL_I18N_PAGES = [
    ...listHtmlFiles('tools'),
    'index.html', 'about.html', 'changelog.html', 'copyright.html'
];

test('assets 與 tools 底下的 .js 不得使用 innerHTML／outerHTML／insertAdjacentHTML', () => {
    assert.ok(SCRIPT_FILES.length >= 20, `清單不應該是空的（目前 ${SCRIPT_FILES.length} 個）`);
    // 目前沒有核准的例外；未來若要新增，須在此註明檔案與理由
    // 除了 `.innerHTML =`，也要擋 `+=` 累加寫法與 `el['innerHTML'] =` 的中括號寫法
    const forbidden = /\.(innerHTML|outerHTML)\s*\+?=(?!=)|\.insertAdjacentHTML\s*\(|\[\s*['"](?:inner|outer)HTML['"]\s*\]\s*\+?=/;
    for (const file of SCRIPT_FILES) {
        assert.doesNotMatch(read(file), forbidden, `${file} 使用了 innerHTML／outerHTML／insertAdjacentHTML`);
    }
});

test('TARGETS 列出的工具 data-i18n／getI18nText 鍵值存在於 common.js 與工具翻譯檔（zh/en/ja）', () => {
    const LANGS = ['zh', 'en', 'ja'];
    const COMMON_FILE = 'assets/js/i18n/translations/common.js';
    const TARGETS = [
        { html: 'tools/lodestone-lookup/index.html', js: 'tools/lodestone-lookup/script.js', translations: 'assets/js/i18n/translations/tools/lodestone-lookup.js', keyPrefix: 'lodestone_' },
        { html: 'tools/treasure-map-finder/index.html', js: 'tools/treasure-map-finder/script.js', translations: 'assets/js/i18n/translations/tools/treasure-map-finder.js', keyPrefix: 'treasure_map_' },
        { html: 'tools/mini-cactpot/index.html', js: 'tools/mini-cactpot/script.js', translations: 'assets/js/i18n/translations/tools/mini-cactpot.js', keyPrefix: 'mini_cactpot_' },
        { html: 'tools/wondrous-tails/index.html', js: 'tools/wondrous-tails/script.js', translations: 'assets/js/i18n/translations/tools/wondrous-tails.js', keyPrefix: 'wondrous_tails_' },
        { html: 'tools/faux-hollows-foxes/index.html', js: 'tools/faux-hollows-foxes/script.js', translations: 'assets/js/i18n/translations/tools/faux-hollows-foxes.js', keyPrefix: 'faux_hollows_' },
        { html: 'tools/dungeon-database/index.html', js: 'tools/dungeon-database/script.js', translations: 'assets/js/i18n/translations/tools/dungeon-database.js', keyPrefix: 'dungeon_db_' },
        { html: 'tools/character-card/index.html', js: 'tools/character-card/script.js', translations: 'assets/js/i18n/translations/tools/character-card.js', keyPrefix: 'char_card_' },
        { html: 'tools/weather-forecast/index.html', js: 'tools/weather-forecast/script.js', translations: 'assets/js/i18n/translations/tools/weather-forecast.js', keyPrefix: 'weather_' },
        { html: 'tools/macro-converter/index.html', js: 'tools/macro-converter/script.js', translations: 'assets/js/i18n/translations/tools/macro-converter.js', keyPrefix: 'macro_converter_' }
    ];

    // jsBlock／jsKeys／translationKeySet 已提升到模組層級（見檔案上方），這裡不再重複定義

    const KEY_ATTR_RE = /\sdata-i18n(?:-html)?="([^"]+)"/g;
    const JS_KEY_RES = [
        /\.dataset\.i18n(?:Html)?\s*=\s*'([^']+)'/g,
        /\.dataset\.i18n(?:Html)?\s*=\s*"([^"]+)"/g,
        /setAttribute\(\s*['"]data-i18n(?:-html)?['"]\s*,\s*'([^']+)'\s*\)/g,
        /setAttribute\(\s*['"]data-i18n(?:-html)?['"]\s*,\s*"([^"]+)"\s*\)/g
    ];
    // 有些 key 是先指派給變數（例如 const btnKey = cond ? 'x_key' : 'y_key'），
    // 再用 `xxx.dataset.i18n = btnKey` 這種「變數賦值」寫法套用，上面幾個 regex 只認
    // 字面值賦值，抓不到透過變數間接賦值的 key。用工具自己的 key 前綴（例如
    // treasure_map_ / lodestone_）額外掃出所有符合的單引號字串常值來補齊。
    const literalKeyRe = (prefix) => new RegExp(`'(${prefix}[a-z0-9_]+)'`, 'g');
    // literalKeyRe 掃出的是「整份檔案裡符合前綴的單引號字串」，範圍比 dataset.i18n／setAttribute
    // 寫法廣，因此也會抓到跟本次修正（變數間接賦值）無關、既有就缺翻譯的 getI18nText() 直接呼叫。
    for (const t of TARGETS) {
        const usedKeys = new Set();
        for (const m of read(t.html).matchAll(KEY_ATTR_RE)) usedKeys.add(m[1]);
        // 不能只讀 t.js：像 treasure-map-finder 這種多檔案工具，key 可能寫在
        // ui-dialog-manager.js／list-manager.js 等同目錄下的其他模組檔裡，
        // 所以改成掃 t.js 所在目錄底下每一個 .js（listFiles 會遞迴列出，
        // 目錄裡若有 images/ 這類非 JS 子目錄，篩副檔名後自然不會抓進來）
        const toolDir = path.dirname(t.js);
        for (const jsFile of listFiles(toolDir, ['.js'])) {
            const js = read(jsFile);
            for (const re of JS_KEY_RES) {
                for (const m of js.matchAll(re)) usedKeys.add(m[1]);
            }
            for (const m of js.matchAll(literalKeyRe(t.keyPrefix))) usedKeys.add(m[1]);
        }
        assert.ok(usedKeys.size > 0, `${t.js} 沒有掃到任何 data-i18n 鍵值，測試可能失效`);

        for (const lang of LANGS) {
            const merged = new Set([...translationKeySet(COMMON_FILE, lang), ...translationKeySet(t.translations, lang)]);
            for (const key of usedKeys) {
                assert.ok(merged.has(key), `${t.js} 用到的 data-i18n 鍵值 "${key}" 在 ${lang} 語系找不到翻譯`);
            }
        }
    }

    // assets/js/components（nav-template.js／footer-template.js／layout-loader.js）是全站共用的
    // 導覽列與頁尾元件，不屬於任何一個 TARGETS 工具目錄，上面的目錄掃描碰不到它們；
    // tools/guide/sidebar-template.js 同理不在 TARGETS 裡（guide 走的是 i18n.t() 陣列 key，
    // 不是 TARGETS 用的 keyPrefix 慣例），所以在同一個測試裡一併補掃，不必另開一個 test()。
    {
        const GUIDE_FILE = 'assets/js/i18n/translations/tools/guide.js';
        const COMPONENT_FILES = [
            ...listFiles('assets/js/components', ['.js']),
            'tools/guide/sidebar-template.js'
        ];
        // 這幾個檔案都用 DOM 操作 + setAttribute('data-i18n', …) 字面值套用 key（footer-template.js、
        // sidebar-template.js 的標題／返回連結），JS_KEY_RES 已經涵蓋這種字面值賦值；另外也有先寫進
        // 物件字面值 `{ i18nKey: 'xxx' }`、再用 setAttribute('data-i18n', linkConfig.i18nKey) 間接
        // 套用的寫法（nav-template.js 的導覽連結、sidebar-template.js 的 ITEMS 陣列），
        // 所以再補一個 i18nKey 物件屬性的 regex
        const COMPONENT_KEY_RES = [...JS_KEY_RES, /i18nKey:\s*'([^']+)'/g];

        const componentKeys = new Set();
        for (const file of COMPONENT_FILES) {
            const js = read(file);
            for (const re of COMPONENT_KEY_RES) {
                for (const m of js.matchAll(re)) componentKeys.add(m[1]);
            }
        }
        assert.ok(componentKeys.size > 0, 'assets/js/components／guide 側欄沒有掃到任何 data-i18n／i18nKey 鍵值，測試可能失效');

        for (const lang of LANGS) {
            // common.js 涵蓋 nav/footer 共用鍵值，guide.js 額外涵蓋 guide 側欄專用鍵值；
            // 合併成一個集合檢查，不用替每個檔案分別對應該查哪個翻譯檔
            const merged = new Set([...translationKeySet(COMMON_FILE, lang), ...translationKeySet(GUIDE_FILE, lang)]);
            for (const key of componentKeys) {
                assert.ok(merged.has(key), `assets/js/components／guide 側欄用到的鍵值 "${key}" 在 ${lang} 語系找不到翻譯`);
            }
        }
    }
});

test('tools/**/*.html 與根頁面用到的 data-i18n 鍵值都能在該頁引入的翻譯檔（zh/en/ja）中找到', () => {
    const LANGS = ['zh', 'en', 'ja'];
    const KEY_ATTR_RE = /\sdata-i18n(?:-html)?="([^"]+)"/g;
    const SCRIPT_SRC_RE = /<script\s+src="([^"]+)"/g;

    assert.ok(ALL_I18N_PAGES.length >= 20, `ALL_I18N_PAGES 清單不應該是空的（目前 ${ALL_I18N_PAGES.length} 個）`);

    let checked = 0;
    let pagesWithKeys = 0;
    for (const htmlPath of ALL_I18N_PAGES) {
        const html = read(htmlPath);
        const dir = path.dirname(htmlPath);

        // 只認該頁 <script src> 實際引入的翻譯檔，不用「工具名稱猜檔名」，
        // 這樣才能同時正確處理根頁面、guide 的多個平行子頁、以及完全沒有專屬翻譯檔的頁面
        const translationFiles = [];
        for (const m of html.matchAll(SCRIPT_SRC_RE)) {
            if (m[1].includes('/i18n/translations/') && m[1].endsWith('.js')) {
                translationFiles.push(path.normalize(path.join(dir, m[1])));
            }
        }

        // data-i18n 與搭配它的 data-i18n-attr 用的是同一個 key（data-i18n-attr 只是指定要
        // 寫入哪個屬性，本身不是另一個 key），KEY_ATTR_RE 已經涵蓋這種元素，不需要另外處理
        const usedKeys = new Set();
        for (const m of html.matchAll(KEY_ATTR_RE)) usedKeys.add(m[1]);
        if (usedKeys.size === 0) continue; // 例如 report-generator，尚未使用 i18n
        pagesWithKeys++;

        for (const lang of LANGS) {
            const merged = new Set();
            for (const tf of translationFiles) {
                for (const k of translationKeySet(tf, lang)) merged.add(k);
            }
            for (const key of usedKeys) {
                checked++;
                assert.ok(merged.has(key), `${htmlPath} 用到的 data-i18n 鍵值 "${key}" 在 ${lang} 語系找不到翻譯（該頁引入的翻譯檔：${translationFiles.join(', ') || '(無)'}）`);
            }
        }
    }
    // 目前 23 頁裡有 22 頁貢獻了 data-i18n 鍵值（僅 report-generator 尚未使用 i18n，貢獻 0 是預期行為）。
    // 用「精確頁數」取代寬鬆的下限，掃描邏輯若不小心漏頁會立刻在這裡發現，而不必等 checked 累積夠大的落差才觸發。
    assert.strictEqual(pagesWithKeys, 22, `貢獻 data-i18n 鍵值的頁面數應該是 22（目前 ${pagesWithKeys}），頁面數若有變動需要一併檢視這個守門測試`);
    // checked 目前是 1149；門檻從 1000 收緊到 1100，讓漏掃能在少數頁面／鍵值就觸發，不用累積到近 150 筆落差
    assert.ok(checked > 1100, `檢查的 (頁面,語言,鍵值) 組合數不應該太少（目前 ${checked}）`);
});

test('label_sep_colon／label_sep_comma 在 common.js 的 zh/en/ja 三語都存在且非空', () => {
    // 這兩個 key 不是透過 data-i18n 屬性套用，而是 tools/faux-hollows-foxes/script.js
    // 與 tools/mini-cactpot/script.js 直接呼叫 FF14Utils.getI18nText() 組出 aria-label 文字，
    // 不會被上面那個掃 data-i18n 的測試涵蓋到。刪掉任一語系的 key 不會有任何測試失敗，
    // 只會讓 getI18nText() 悄悄退回寫死的中文全形標點，所以在這裡直接鎖住三語都要有值。
    const COMMON_FILE = 'assets/js/i18n/translations/common.js';
    const common = read(COMMON_FILE);
    const LANGS = ['zh', 'en', 'ja'];
    const REQUIRED_KEYS = ['label_sep_colon', 'label_sep_comma'];

    for (const lang of LANGS) {
        const start = common.indexOf(`${lang}: {`);
        assert.notEqual(start, -1, `${COMMON_FILE} 找不到 ${lang} 語系區塊`);
        const openBrace = common.indexOf('{', start);
        let i = openBrace;
        let depth = 0;
        for (; i < common.length; i++) {
            if (common[i] === '{') depth++;
            else if (common[i] === '}') { depth--; if (depth === 0) break; }
        }
        const block = common.slice(openBrace, i + 1);

        for (const key of REQUIRED_KEYS) {
            const m = block.match(new RegExp(`\\b${key}:\\s*'([^']*)'`));
            assert.ok(m && m[1].length > 0, `${COMMON_FILE} 的 ${lang} 語系缺少非空的 ${key}`);
        }
    }
});

// I18nManager 的公開方法名稱：掃描 assets/js/i18n/i18n-manager.js 的 class 本體，
// 取出所有 4 格縮排開頭的方法定義（class 方法固定寫在 4 格縮排，含 async 方法），
// 排除底線開頭的私有方法，以及 constructor（不是可呼叫的公開 API）
const i18nManagerJs = read('assets/js/i18n/i18n-manager.js');
const I18N_PUBLIC_METHODS = new Set(
    [...i18nManagerJs.matchAll(/^\s{4}(?:async\s+)?(\w+)\s*\(/gm)]
        .map((m) => m[1])
        .filter((name) => !name.startsWith('_') && name !== 'constructor')
);

test('window.i18n／i18n 只能呼叫 I18nManager 真的定義過的方法', () => {
    assert.ok(I18N_PUBLIC_METHODS.size >= 10, `從 I18nManager 收集到的方法名稱不應該太少（目前 ${I18N_PUBLIC_METHODS.size} 個）`);

    // 呼叫點：window.i18n.xxx( 或裸寫的 i18n.xxx(（前面不能接 . 或英數底線字元，
    // 避免誤判 this.i18n.xxx( 或其他物件同名屬性的呼叫）。
    // 只抓「呼叫」（後面接左括號），不檢查屬性存取（例如 window.i18n.currentLang）——
    // I18nManager 的公開介面全部是方法，屬性不像方法在 class 本體有固定、可窮舉的語法，
    // 貿然把屬性存取也納入檢查容易誤判，所以刻意只驗證方法呼叫，不驗證屬性讀取。
    const CALL_RE = /(?:window\.i18n\??|(?<![.\w])i18n\??)\.(\w+)\s*\(/g; // 也涵蓋 window.i18n?.xxx( 的可選串連寫法
    let checked = 0;
    for (const file of SCRIPT_FILES) {
        const js = read(file);
        for (const m of js.matchAll(CALL_RE)) {
            checked++;
            assert.ok(
                I18N_PUBLIC_METHODS.has(m[1]),
                `${file} 呼叫了 window.i18n.${m[1]}()，但 I18nManager 沒有這個方法`
            );
        }
    }
    assert.ok(checked > 0, '沒有找到任何 window.i18n.xxx() 呼叫，測試可能失效');

    // 封鎖清單：即使不是「呼叫」而是單純的屬性存取，這幾個名稱也已知是錯的
    // （曾經誤用過的舊 API 或拼錯的屬性名稱），一律視為錯誤，不必窮舉 I18nManager 的屬性
    const DENYLIST_RE = /(?:window\.i18n\??|(?<![.\w])i18n\??)\.(currentLang|lang|t|addObserver)\b/g;
    for (const file of SCRIPT_FILES) {
        const js = read(file);
        for (const m of js.matchAll(DENYLIST_RE)) {
            assert.fail(`${file} 使用了 window.i18n.${m[1]}，這是已知錯誤的屬性／方法名稱，I18nManager 沒有這個成員`);
        }
    }
});
