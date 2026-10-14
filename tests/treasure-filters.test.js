const test = require('node:test');
const assert = require('node:assert/strict');

const FilterManager = require('../tools/treasure-map-finder/filter-manager.js');
const { maps } = require('../data/treasure-maps.json');

const withMaps = () => {
    const f = new FilterManager();
    f.setMaps(maps);
    return f;
};

test('G17 的地區依資料順序列出，各 8 張', () => {
    const f = withMaps(); f.toggleLevel('g17');
    assert.deepEqual(f.getZoneOptions(), ['urqopacha', 'kozamauka', 'yaktel', 'shaaloani', 'heritagefound'].map(zoneId => ({ zoneId, count: 8 })));
});

test('G8／G10／G12 也有地區可選', () => {
    const counts = level => { const f = withMaps(); f.toggleLevel(level); return f.getZoneOptions().map(o => o.count); };
    assert.deepEqual(counts('g8'), [7, 9, 9, 10]);
    assert.deepEqual(counts('g10'), [8, 8, 8, 8, 8, 8]);
    assert.deepEqual(counts('g12'), [8, 8, 8, 8, 8, 8]);
});

test('選得到的「等級＋地區」都至少一張', () => {
    for (const level of FilterManager.GRADE_ORDER) {
        const f = withMaps(); f.toggleLevel(level);
        for (const { zoneId } of f.getZoneOptions()) {
            f.toggleZone(zoneId);
            assert.ok(f.applyFilters(maps).length > 0, `${level} ${zoneId}`);
            f.toggleZone(zoneId);
        }
    }
});

test('結果全部列出，等級由新到舊；沒選等級時是空的', () => {
    const f = withMaps();
    assert.equal(f.applyFilters(maps).length, 0);
    f.toggleLevel('g17');
    assert.equal(f.applyFilters(maps).length, 40);
    assert.equal(f.applyFilters(maps)[0].id, 'tm_007');
    f.toggleLevel('g18');
    const both = f.applyFilters(maps);
    assert.equal(both.length, 48);
    assert.ok(both.slice(0, 8).every(m => m.level === 'g18'));
});

test('多選等級後取消一個，只屬於它的已選地區一起取消（Review Focus 3）', () => {
    const f = withMaps(); f.toggleLevel('g17'); f.toggleLevel('g15');
    assert.deepEqual(f.getZoneOptions().map(o => o.zoneId), ['urqopacha', 'kozamauka', 'yaktel', 'shaaloani', 'heritagefound', 'elpis']);
    f.toggleZone('urqopacha'); f.toggleZone('elpis');
    f.toggleLevel('g15');
    assert.deepEqual(f.getState(), { levels: ['g17'], zones: ['urqopacha'] });
});

test('網址：保留 room、解析 grade／zone、忽略不認得的值（Review Focus 2）', () => {
    assert.deepEqual(FilterManager.parseUrl('?room=ABC123&grade=g17,g15&zone=urqopacha'), { levels: ['g17', 'g15'], zones: ['urqopacha'] });
    assert.equal(FilterManager.parseUrl('?room=ABC123'), null);
    const url = new URL(FilterManager.buildUrl('https://ff14.tw/tools/treasure-map-finder/?room=ABC123&zone=yaktel', { levels: ['g17'], zones: [] }));
    assert.equal(url.searchParams.get('room'), 'ABC123');
    assert.equal(url.searchParams.get('grade'), 'g17');
    assert.equal(url.searchParams.has('zone'), false);
    const f = withMaps(); f.restoreState({ levels: ['g99', 'g17', 'g1'], zones: ['atlantis', 'urqopacha', 'elpis'] });
    assert.deepEqual(f.getState(), { levels: ['g17'], zones: ['urqopacha'] });
});

test('localStorage 不能用時不丟例外；網址優先於 localStorage（Review Focus 5）', () => {
    assert.equal(FilterManager.safeStorage({ get localStorage() { throw new Error('SecurityError'); } }), null);
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    assert.equal(FilterManager.readStored(broken), null);
    assert.equal(FilterManager.readStored(null), null);
    assert.equal(FilterManager.readStored({ getItem: () => '{oops' }), null);
    assert.doesNotThrow(() => FilterManager.writeStored(broken, { levels: ['g17'], zones: [] }));
    assert.doesNotThrow(() => FilterManager.writeStored(null, { levels: ['g17'], zones: [] }));
    const stored = { levels: ['g18'], zones: [] };
    assert.deepEqual(FilterManager.pickInitialState({ url: { levels: ['g17'], zones: [] }, stored }), { levels: ['g17'], zones: [] });
    assert.deepEqual(FilterManager.pickInitialState({ url: null, stored }), stored);
    assert.deepEqual(FilterManager.pickInitialState({ url: null, stored: null }), { levels: [], zones: [] });
});

test('GRADE_ORDER 與資料裡有寶圖的等級一致；filters 只剩 levels、zones', () => {
    assert.deepEqual([...FilterManager.GRADE_ORDER].sort(), [...new Set(maps.map(m => m.level))].sort());
    assert.equal(FilterManager.STORAGE_KEY, 'ff14tw_treasure_map_filters');
    assert.deepEqual(Object.keys(new FilterManager().filters).sort(), ['levels', 'zones']);
});

test('getState 的順序和點選順序無關：等級依 GRADE_ORDER、地區依 getZoneOptions', () => {
    const f = withMaps();
    for (const level of ['g8', 'g18', 'g17']) f.toggleLevel(level);
    f.toggleZone('yaktel'); f.toggleZone('urqopacha');
    assert.deepEqual(f.getState(), { levels: ['g18', 'g17', 'g8'], zones: ['urqopacha', 'yaktel'] });
});

test('getZoneOptions：同一個地區在多個已選等級裡合併張數，只算已選的等級', () => {
    const f = new FilterManager();
    f.setMaps([
        { id: 'a', level: 'g15', zoneId: 'z2' },
        { id: 'b', level: 'g17', zoneId: 'z1' },
        { id: 'c', level: 'g15', zoneId: 'z1' },
        { id: 'd', level: 'g17', zoneId: 'z1' }
    ]);
    assert.deepEqual(f.getZoneOptions(), []);
    f.toggleLevel('g17');
    assert.deepEqual(f.getZoneOptions(), [{ zoneId: 'z1', count: 2 }]);
    f.toggleLevel('g15');
    assert.deepEqual(f.getZoneOptions(), [{ zoneId: 'z1', count: 3 }, { zoneId: 'z2', count: 1 }]);
});

test('applyFilters：多個地區是「或」，同等級照原始順序，不改動傳入的陣列', () => {
    const before = maps.map(m => m.id);
    const f = withMaps();
    f.toggleLevel('g17'); f.toggleZone('shaaloani'); f.toggleZone('yaktel');
    const picked = f.applyFilters(maps);
    assert.deepEqual(picked.map(m => m.id), maps.filter(m => m.level === 'g17' && ['yaktel', 'shaaloani'].includes(m.zoneId)).map(m => m.id));
    assert.equal(picked.length, 16);
    f.toggleLevel('g18');
    f.applyFilters(maps);
    assert.deepEqual(maps.map(m => m.id), before);
});

test('toggleLevel、toggleZone 忽略不認得的值，不屬於已選等級的地區選不到', () => {
    const f = withMaps();
    f.toggleLevel('g99'); f.toggleLevel('g1');
    f.toggleZone('urqopacha');
    assert.deepEqual(f.getState(), { levels: [], zones: [] });
    f.toggleLevel('g17');
    f.toggleZone('elpis'); f.toggleZone('atlantis');
    assert.deepEqual(f.getState(), { levels: ['g17'], zones: [] });
    assert.equal(f.hasActiveFilters(), true);
    f.toggleLevel('g17');
    assert.equal(f.hasActiveFilters(), false);
});

test('onChange：toggleLevel、toggleZone、clearZones 每次改變呼叫一次並帶上新狀態；restoreState 和沒有改變的操作不呼叫', () => {
    const f = withMaps();
    const states = [];
    f.onChange(state => states.push(state));
    f.toggleLevel('g17');
    f.toggleZone('yaktel');
    f.clearZones();
    f.clearZones();
    f.toggleZone('elpis');
    f.toggleLevel('g99');
    f.restoreState({ levels: ['g15'], zones: ['elpis'] });
    f.toggleLevel('g15');
    assert.deepEqual(states, [
        { levels: ['g17'], zones: [] },
        { levels: ['g17'], zones: ['yaktel'] },
        { levels: ['g17'], zones: [] },
        { levels: [], zones: [] }
    ]);
});

test('restoreState：整份取代，沒有寶圖的等級也丟掉，壞資料當成空的', () => {
    const f = withMaps();
    f.toggleLevel('g8');
    f.restoreState({ levels: ['g15'], zones: ['elpis'] });
    assert.deepEqual(f.getState(), { levels: ['g15'], zones: ['elpis'] });
    f.restoreState({ levels: 'g17', zones: null });
    assert.deepEqual(f.getState(), { levels: [], zones: [] });
    f.restoreState(null);
    assert.deepEqual(f.getState(), { levels: [], zones: [] });

    const onlyG17 = new FilterManager();
    onlyG17.setMaps(maps.filter(m => m.level === 'g17'));
    onlyG17.restoreState({ levels: ['g15', 'g17'], zones: ['elpis', 'yaktel'] });
    assert.deepEqual(onlyG17.getState(), { levels: ['g17'], zones: ['yaktel'] });
});

test('parseUrl：只有 zone 也算，空值與多餘的空白忽略，grade、zone 都沒有才是 null', () => {
    assert.equal(FilterManager.parseUrl(''), null);
    assert.equal(FilterManager.parseUrl('?tab=1'), null);
    assert.deepEqual(FilterManager.parseUrl('?zone=yaktel'), { levels: [], zones: ['yaktel'] });
    assert.deepEqual(FilterManager.parseUrl('?grade=g17,,%20g15%20,&zone='), { levels: ['g17', 'g15'], zones: [] });
});

test('buildUrl：逗號不編碼、保留其他參數與 hash，清空後兩個參數都拿掉，parseUrl 讀得回來', () => {
    const state = { levels: ['g17', 'g15'], zones: ['urqopacha', 'elpis'] };
    const href = 'https://ff14.tw/tools/treasure-map-finder/?room=ABC123#top';
    const built = FilterManager.buildUrl(href, state);
    assert.equal(built, 'https://ff14.tw/tools/treasure-map-finder/?room=ABC123&grade=g17,g15&zone=urqopacha,elpis#top');
    assert.deepEqual(FilterManager.parseUrl(new URL(built).search), state);
    assert.equal(FilterManager.buildUrl(built, { levels: [], zones: [] }), href);
    assert.equal(FilterManager.buildUrl('https://ff14.tw/tools/treasure-map-finder/', { levels: [], zones: [] }), 'https://ff14.tw/tools/treasure-map-finder/');
});

test('safeStorage 取得 win.localStorage；writeStored 與 readStored 用同一個 key，形狀不對一律當作沒有', () => {
    const data = new Map();
    const storage = { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, value) };
    assert.equal(FilterManager.safeStorage({ localStorage: storage }), storage);
    assert.equal(FilterManager.readStored(storage), null);
    FilterManager.writeStored(storage, { levels: ['g17'], zones: ['yaktel'] });
    assert.deepEqual([...data.keys()], ['ff14tw_treasure_map_filters']);
    assert.deepEqual(FilterManager.readStored(storage), { levels: ['g17'], zones: ['yaktel'] });
    for (const bad of ['null', '[]', '"g17"', '{"levels":["g17"]}', '{"levels":"g17","zones":[]}', '{"levels":[1],"zones":[]}']) {
        assert.equal(FilterManager.readStored({ getItem: () => bad }), null, bad);
    }
});
