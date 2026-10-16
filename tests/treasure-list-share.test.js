const test = require('node:test');
const assert = require('node:assert/strict');

const ListShare = require('../tools/treasure-map-finder/list-share.js');

// ---------- ListShare（tools/treasure-map-finder/list-share.js） ----------
// 類別不碰 DOM，只用 URL、URLSearchParams、JSON 與 encodeURIComponent，直接 require。
const BASE = 'https://ff14.tw/tools/treasure-map-finder/';

test('buildUrl：只帶寶圖，不帶篩選、隊伍代號與 hash；逗號不編碼', () => {
    assert.equal(ListShare.buildUrl(`${BASE}?grade=g17&room=ABC123#top`, ['tm_019', 'tm_031', 'tm_010']), `${BASE}?maps=tm_019,tm_031,tm_010`);
});

test('parseIds：去空白、空字串與重複', () => {
    assert.deepEqual(ListShare.parseIds(' tm_1, tm_2,,tm_1 '), ['tm_1', 'tm_2']);
});

test('parseText：完整網址、只有查詢字串、舊的匯出 JSON；看不懂的是 null', () => {
    assert.deepEqual(ListShare.parseText(`  ${BASE}?grade=g17&maps=tm_1,tm_2  `), { kind: 'link', ids: ['tm_1', 'tm_2'] });
    assert.deepEqual(ListShare.parseText(`${BASE}?maps=tm_1%2Ctm_2`), { kind: 'link', ids: ['tm_1', 'tm_2'] });
    assert.deepEqual(ListShare.parseText('?maps=tm_3'), { kind: 'link', ids: ['tm_3'] });
    assert.deepEqual(ListShare.parseText('maps=tm_3,tm_4'), { kind: 'link', ids: ['tm_3', 'tm_4'] });
    const exported = { version: '1.0', maps: [{ id: 'tm_1', level: 'g17', zone: 'Urqopacha', coords: { x: 1, y: 2 } }] };
    assert.deepEqual(ListShare.parseText(JSON.stringify(exported, null, 2)), { kind: 'json', maps: exported.maps });
    for (const text of ['', '   ', 'hello', `${BASE}?grade=g17`, '?maps=', '{"maps":[]}', '{"list":[1]}', '{broken']) {
        assert.equal(ListShare.parseText(text), null, JSON.stringify(text));
    }
});

test('stripParam：拿掉 maps，其他參數與 hash 保留', () => {
    assert.equal(ListShare.stripParam(`${BASE}?grade=g17,g18&maps=tm_1,tm_2&room=ABC123#top`), `${BASE}?grade=g17,g18&room=ABC123#top`);
    assert.equal(ListShare.stripParam(`${BASE}?maps=tm_1`), BASE);
});

test('resolveIds 與 projectedCount', () => {
    const catalogue = new Map([['tm_1', { id: 'tm_1' }], ['tm_2', { id: 'tm_2' }]]);
    assert.deepEqual(ListShare.resolveIds(['tm_2', 'tm_9', 'tm_1'], catalogue), { maps: [{ id: 'tm_2' }, { id: 'tm_1' }], missing: 1 });
    assert.deepEqual(ListShare.projectedCount(['a', 'b'], ['b', 'c', 'c'], true), { total: 3, duplicates: 1 });
    assert.deepEqual(ListShare.projectedCount(['a', 'b'], ['b', 'c', 'c'], false), { total: 2, duplicates: 0 });
});

// ---------- 以下補上面沒有逐項驗證的規則：來回、頭尾空白、{ 開頭、回傳目錄那份物件、數目的邊界 ----------

test('產生的分享連結貼回去，看得到同樣的 id 與順序（參數名是 maps）', () => {
    assert.equal(ListShare.PARAM, 'maps');
    const ids = ['tm_019', 'tm_031', 'tm_010'];
    const url = ListShare.buildUrl(`${BASE}?room=ABC123`, ids);
    assert.equal(new URL(url).searchParams.get(ListShare.PARAM), ids.join(','));
    assert.deepEqual(ListShare.parseText(url), { kind: 'link', ids });
});

test('buildUrl：id 裡有 &、#、%、+、空白時，連結照樣只有一個 maps 參數，不夾帶隊伍代號或 hash，讀得回同樣的 id', () => {
    // 匯入的清單可以帶任何字串當 id（ListManager 只要求是非空字串）；第一個 id 想偷塞一個 room 參數進連結
    const ids = ['tm_1&room=ABC123', 'x#y', 'a b', '100%', 'a+b', 'tm_019'];
    const link = ListShare.buildUrl(`${BASE}?grade=g17&room=XYZ789#top`, ids);
    const url = new URL(link);
    assert.equal(url.searchParams.get('room'), null);
    assert.equal(url.hash, '');
    assert.deepEqual([...url.searchParams.keys()], ['maps']);
    assert.deepEqual(ListShare.parseText(link), { kind: 'link', ids });
    // 每個 id 各自編碼，分隔用的逗號不編碼；一般的寶圖 id 編碼前後一樣
    assert.equal(ListShare.buildUrl(BASE, ['tm_019', 'a b', 'tm_031']), `${BASE}?maps=tm_019,a%20b,tm_031`);
});

test('parseIds：沒有值（URLSearchParams.get 找不到參數時是 null）也是空陣列', () => {
    assert.deepEqual(ListShare.parseIds(''), []);
    assert.deepEqual(ListShare.parseIds(' , ,'), []);
    assert.deepEqual(ListShare.parseIds(null), []);
    assert.deepEqual(ListShare.parseIds(undefined), []);
});

test('parseText：{ 開頭的只當 JSON 讀：沒有 maps、maps 不是陣列、JSON 壞掉（即使夾著連結）都是 null', () => {
    for (const text of ['{"maps":"tm_1"}', '{"maps":{"0":"tm_1"}}', '{"link":"?maps=tm_1"}', `{${BASE}?maps=tm_1}`, `{"x":1} ${BASE}?maps=tm_1`]) {
        assert.equal(ListShare.parseText(text), null, text);
    }
});

test('parseText：頭尾的空白與換行不影響（貼上時常多帶一個換行），只有查詢字串與 JSON 也一樣', () => {
    assert.deepEqual(ListShare.parseText('\n  ?maps=tm_3\n'), { kind: 'link', ids: ['tm_3'] });
    assert.deepEqual(ListShare.parseText(' maps=tm_3,tm_4 \r\n'), { kind: 'link', ids: ['tm_3', 'tm_4'] });
    assert.deepEqual(ListShare.parseText(`\n  ${JSON.stringify({ maps: [{ id: 'tm_1' }] })}\n`), { kind: 'json', maps: [{ id: 'tm_1' }] });
});

test('parseText：連結裡的 id 一樣去空白與重複；maps 只剩逗號與空白時看不懂；不是字串也不會丟例外', () => {
    assert.deepEqual(ListShare.parseText(`${BASE}?maps=tm_1, tm_2,tm_1#top`), { kind: 'link', ids: ['tm_1', 'tm_2'] });
    assert.deepEqual(ListShare.parseText('maps=tm_3,tm_4&grade=g17'), { kind: 'link', ids: ['tm_3', 'tm_4'] });
    for (const text of [`${BASE}?maps=,,`, `${BASE}?maps=%20%2C%20`, 'maps=,', '?maps=%2C', null, undefined, 42]) {
        assert.equal(ListShare.parseText(text), null, String(text));
    }
});

test('stripParam：逗號維持不編碼，拿掉後沒有參數就不留 ?（hash 照留），沒有 maps 時其他參數不變', () => {
    assert.equal(ListShare.stripParam(`${BASE}?maps=tm_1&grade=g17%2Cg18`), `${BASE}?grade=g17,g18`);
    assert.equal(ListShare.stripParam(`${BASE}?maps=tm_1#top`), `${BASE}#top`);
    assert.equal(ListShare.stripParam(`${BASE}?maps=tm_1&maps=tm_2`), BASE);
    assert.equal(ListShare.stripParam(`${BASE}?grade=g17,g18&room=ABC123#top`), `${BASE}?grade=g17,g18&room=ABC123#top`);
    assert.equal(ListShare.stripParam(BASE), BASE);
});

test('resolveIds：回傳目錄裡那份物件本身，順序照 ids，找不到的只計數', () => {
    const catalogue = new Map([['tm_1', { id: 'tm_1' }], ['tm_2', { id: 'tm_2' }]]);
    const { maps, missing } = ListShare.resolveIds(['tm_2', 'tm_9', 'tm_1', 'tm_8'], catalogue);
    assert.equal(maps.length, 2);
    assert.equal(maps[0], catalogue.get('tm_2'));
    assert.equal(maps[1], catalogue.get('tm_1'));
    assert.equal(missing, 2);
    assert.deepEqual(ListShare.resolveIds([], catalogue), { maps: [], missing: 0 });
});

test('projectedCount：目前清單是空的、新的全部已經在清單裡', () => {
    assert.deepEqual(ListShare.projectedCount([], ['a', 'a', 'b'], true), { total: 2, duplicates: 0 });
    assert.deepEqual(ListShare.projectedCount(['a', 'b'], ['b', 'a'], true), { total: 2, duplicates: 2 });
    assert.deepEqual(ListShare.projectedCount(['a', 'b'], [], false), { total: 0, duplicates: 0 });
});
