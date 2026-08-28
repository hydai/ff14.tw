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
