// 翻譯檔的共用解析工具，給 tests/*.test.js 共用。
// 這是輔助模組，不是測試檔（node --test 只執行 *.test.js）；
// 要判斷「翻譯檔定義了哪些鍵／值是什麼」時一律從這裡 require，不要在測試檔裡再各寫一份。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

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
// 同樣的鍵值宣告，另外取出字串值（單引號或雙引號，處理 \' 這類跳脫）：Map(key → value)
function jsValues(blockText) {
    const map = new Map();
    if (!blockText) return map;
    for (const m of blockText.matchAll(/^\s*(\w+):\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/gm)) {
        map.set(m[1], (m[2] ?? m[3]).replace(/\\(.)/g, '$1'));
    }
    return map;
}
// file 是相對於專案根目錄的路徑（例如 'assets/js/i18n/translations/common.js'）
function translationKeySet(file, lang) {
    return jsKeys(jsBlock(read(file), lang));
}
function translationValues(file, lang) {
    return jsValues(jsBlock(read(file), lang));
}

module.exports = { jsBlock, jsKeys, jsValues, translationKeySet, translationValues };
