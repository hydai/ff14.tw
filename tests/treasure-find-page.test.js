const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('寶圖工具的 JS 沒有 console.log，也沒有指向不存在檔案的程式', () => {
    const dir = 'tools/treasure-map-finder';
    // migrate-data.js 是 Node 命令列腳本，console 輸出就是它的介面，頁面不會載入它，所以不檢查
    for (const file of fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.js') && f !== 'migrate-data.js')) {
        assert.doesNotMatch(read(`${dir}/${file}`), /console\.log\(/, file);
    }
    assert.doesNotMatch(read(`${dir}/script.js`), /fullImage/);
    assert.doesNotMatch(read(`${dir}/zone-manager.js`), /generateFullImageFileName|getZoneIdByFilePrefix|filePrefixToZoneId/);
    assert.doesNotMatch(read(`${dir}/room-collaboration.js`), /roomActions/);
});
