const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const dungeons = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dungeons.json'), 'utf8')).dungeons;
const maps = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/treasure-maps.json'), 'utf8')).maps;
const jsonFileCount = fs.readdirSync(path.join(ROOT, 'data')).filter((f) => f.endsWith('.json')).length;

test('CLAUDE.md 的副本總數與 data/dungeons.json 的實際筆數一致', () => {
    const m = claudeMd.match(/\*\*Total Dungeons\*\*:\s*(\d+)/);
    assert.ok(m, 'CLAUDE.md 找不到「Total Dungeons」這一行');
    assert.equal(Number(m[1]), dungeons.length);
});

test('CLAUDE.md 的寶圖座標總數與 data/treasure-maps.json 的實際筆數一致', () => {
    const m = claudeMd.match(/\*\*Total Treasure Map Coordinates\*\*:\s*(\d+)/);
    assert.ok(m, 'CLAUDE.md 找不到「Total Treasure Map Coordinates」這一行');
    assert.equal(Number(m[1]), maps.length);
});

test('CLAUDE.md 的 JSON 資料檔案數與 /data 目錄實際檔案數一致', () => {
    const m = claudeMd.match(/\*\*JSON Data Files\*\*:\s*(\d+)/);
    assert.ok(m, 'CLAUDE.md 找不到「JSON Data Files」這一行');
    assert.equal(Number(m[1]), jsonFileCount);
});

test('README 的副本總數與 data/dungeons.json 的實際筆數一致', () => {
    const m = readme.match(/(\d+)\s*個副本\s*\(2\.x/);
    assert.ok(m, 'README 找不到「N 個副本 (2.x」這一行');
    assert.equal(Number(m[1]), dungeons.length);
});
