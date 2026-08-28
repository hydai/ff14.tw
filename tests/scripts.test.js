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
