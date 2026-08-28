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

test('assets 與 tools 底下的 .js 不得使用 innerHTML／outerHTML／insertAdjacentHTML', () => {
    assert.ok(SCRIPT_FILES.length >= 20, `清單不應該是空的（目前 ${SCRIPT_FILES.length} 個）`);
    // 目前沒有核准的例外；未來若要新增，須在此註明檔案與理由
    // 除了 `.innerHTML =`，也要擋 `+=` 累加寫法與 `el['innerHTML'] =` 的中括號寫法
    const forbidden = /\.(innerHTML|outerHTML)\s*\+?=(?!=)|\.insertAdjacentHTML\s*\(|\[\s*['"](?:inner|outer)HTML['"]\s*\]\s*\+?=/;
    for (const file of SCRIPT_FILES) {
        assert.doesNotMatch(read(file), forbidden, `${file} 使用了 innerHTML／outerHTML／insertAdjacentHTML`);
    }
});

test('lodestone-lookup／treasure-map-finder 新增的 data-i18n 鍵值存在於 common.js 與工具翻譯檔（zh/en/ja）', () => {
    const LANGS = ['zh', 'en', 'ja'];
    const COMMON_FILE = 'assets/js/i18n/translations/common.js';
    const TARGETS = [
        { html: 'tools/lodestone-lookup/index.html', js: 'tools/lodestone-lookup/script.js', translations: 'assets/js/i18n/translations/tools/lodestone-lookup.js', keyPrefix: 'lodestone_' },
        { html: 'tools/treasure-map-finder/index.html', js: 'tools/treasure-map-finder/script.js', translations: 'assets/js/i18n/translations/tools/treasure-map-finder.js', keyPrefix: 'treasure_map_' }
    ];

    // 取出翻譯檔裡 `lang: {`…對應 `}` 的區塊（只有一層巢狀字串屬性，作法比照 design-system.test.js 的 block()）
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
    // 這 12 個裝備欄位 key（commit 709708ee，2026-01-10）在 zh/en/ja 三語都從未加入翻譯，一直
    // 只靠 getI18nText() 的中文預設值頂著；這是獨立於 17778e8 的既有缺口，不在本次 fixup 範圍內，
    // 先明確排除、留待另外的任務補上三語翻譯，避免此處的守門測試因範圍外的舊缺口失敗。
    const KNOWN_MISSING_TRANSLATION_KEYS = new Set([
        'lodestone_equip_mainhand', 'lodestone_equip_head', 'lodestone_equip_body',
        'lodestone_equip_hands', 'lodestone_equip_legs', 'lodestone_equip_feet',
        'lodestone_equip_earrings', 'lodestone_equip_necklace', 'lodestone_equip_bracelets',
        'lodestone_equip_ring1', 'lodestone_equip_ring2', 'lodestone_equip_soulcrystal'
    ]);

    for (const t of TARGETS) {
        const usedKeys = new Set();
        for (const m of read(t.html).matchAll(KEY_ATTR_RE)) usedKeys.add(m[1]);
        const js = read(t.js);
        for (const re of JS_KEY_RES) {
            for (const m of js.matchAll(re)) usedKeys.add(m[1]);
        }
        for (const m of js.matchAll(literalKeyRe(t.keyPrefix))) usedKeys.add(m[1]);
        assert.ok(usedKeys.size > 0, `${t.js} 沒有掃到任何 data-i18n 鍵值，測試可能失效`);

        for (const lang of LANGS) {
            const merged = new Set([...translationKeySet(COMMON_FILE, lang), ...translationKeySet(t.translations, lang)]);
            for (const key of usedKeys) {
                if (KNOWN_MISSING_TRANSLATION_KEYS.has(key)) continue;
                assert.ok(merged.has(key), `${t.js} 用到的 data-i18n 鍵值 "${key}" 在 ${lang} 語系找不到翻譯`);
            }
        }
    }
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
