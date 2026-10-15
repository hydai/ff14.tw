const test = require('node:test');
const assert = require('node:assert/strict');

const RouteProgress = require('../tools/treasure-map-finder/route-progress.js');

// ---------- RouteProgress（tools/treasure-map-finder/route-progress.js） ----------
// 類別不碰 DOM，直接 require。storage 用記憶體替身（Storage 找不到 key 時 getItem 回傳 null），
// 時間用注入的 now()，不碰真正的時鐘。
const KEY = 'ff14tw_treasure_route_progress';
const T0 = Date.parse('2026-10-15T12:00:00.000Z');
const HOUR = 3600e3;

function memoryStorage() {
    const map = new Map();
    return {
        map,
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: key => { map.delete(key); }
    };
}

test('存與讀：order、done 原樣存回來，updatedAt 是存的當下；重新建立時讀回來', () => {
    const storage = memoryStorage();
    const progress = new RouteProgress(storage, { now: () => T0 });
    assert.equal(progress.get(), null);
    progress.save({ order: ['tm_010', 'tm_007'], done: ['tm_010'] });
    const expected = { order: ['tm_010', 'tm_007'], done: ['tm_010'], updatedAt: '2026-10-15T12:00:00.000Z' };
    assert.deepEqual(JSON.parse(storage.map.get('ff14tw_treasure_route_progress')), expected);
    assert.deepEqual(new RouteProgress(storage, { now: () => T0 }).get(), expected);
});

test('超過 12 小時就清掉；剛好 12 小時還在', () => {
    const storage = memoryStorage();
    let now = T0;
    const progress = new RouteProgress(storage, { now: () => now });
    progress.save({ order: ['tm_010'], done: [] });
    now = T0 + 12 * HOUR;
    assert.notEqual(progress.get(), null);
    now += 1;
    assert.equal(progress.get(), null);
    assert.equal(storage.map.has('ff14tw_treasure_route_progress'), false);
});

test('壞掉的資料當作沒有；瀏覽器不讓存時照樣在記憶體裡運作，不丟例外', () => {
    for (const raw of ['{broken', '{"order":"x","done":[],"updatedAt":"2026-10-15T12:00:00.000Z"}', '{"order":[],"done":[]}']) {
        const storage = memoryStorage();
        storage.map.set('ff14tw_treasure_route_progress', raw);
        assert.equal(new RouteProgress(storage, { now: () => T0 }).get(), null, raw);
    }
    const throwing = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('SecurityError'); } };
    for (const storage of [null, throwing]) {
        const progress = new RouteProgress(storage, { now: () => T0 });
        progress.save({ order: ['tm_010'], done: ['tm_010'] });
        assert.deepEqual(progress.get().done, ['tm_010']);
        progress.clear();
        assert.equal(progress.get(), null);
    }
});

// sync 的 restarted：整份重來（沒有進度、存著的站都不在清單裡、全部完成之後清單又有變化）是 true，對齊既有的進度是 false
test('sync：沒有進度 → 第一次排序、沒有完成', () => {
    assert.deepEqual(RouteProgress.sync(null, ['a', 'b'], { firstOrder: () => ['b', 'a'], mergeOrder: () => assert.fail() }),
        { order: ['b', 'a'], done: [], changed: true, restarted: true });
});

test('sync：移除的寶圖從 order 與 done 拿掉，其他的完成記號保留；新寶圖交給 mergeOrder（Review Focus 4）', () => {
    const saved = { order: ['a', 'b', 'c'], done: ['a', 'b'], updatedAt: '2026-10-15T12:00:00.000Z' };
    const calls = [];
    const result = RouteProgress.sync(saved, ['a', 'c', 'd'], { firstOrder: () => assert.fail(), mergeOrder: prev => { calls.push(prev); return ['a', 'c', 'd']; } });
    assert.deepEqual(result, { order: ['a', 'c', 'd'], done: ['a'], changed: true, restarted: false });
    assert.deepEqual(calls, [['a', 'b', 'c']]);
});

test('sync：全部完成之後清單又有變化 → 重新來過；清單沒變就保留', () => {
    const saved = { order: ['a', 'b'], done: ['b', 'a'], updatedAt: '2026-10-15T12:00:00.000Z' };
    assert.deepEqual(RouteProgress.sync(saved, ['a', 'b', 'c'], { firstOrder: () => ['c', 'a', 'b'], mergeOrder: () => assert.fail() }),
        { order: ['c', 'a', 'b'], done: [], changed: true, restarted: true });
    assert.deepEqual(RouteProgress.sync(saved, ['b', 'a'], { firstOrder: () => assert.fail(), mergeOrder: prev => prev }),
        { order: ['a', 'b'], done: ['b', 'a'], changed: false, restarted: false });
});

test('sync：存著的站一個都不在清單裡 → 第一次排序', () => {
    const saved = { order: ['a'], done: [], updatedAt: '2026-10-15T12:00:00.000Z' };
    assert.deepEqual(RouteProgress.sync(saved, ['x', 'y'], { firstOrder: () => ['y', 'x'], mergeOrder: () => assert.fail() }),
        { order: ['y', 'x'], done: [], changed: true, restarted: true });
});

// ---------- 以下是計畫的測試沒有守住的地方 ----------

test('時間看不懂、站序或完成記號裡有不是字串的、根本不是物件，也都當作沒有', () => {
    // updatedAt 看不懂時 Date.parse 是 NaN，「超過 12 小時」永遠不成立，那份進度會一直留著，所以讀進來時就要擋掉
    const good = '2026-10-15T12:00:00.000Z';
    for (const raw of [
        '{"order":["a"],"done":[],"updatedAt":"not a date"}',
        `{"order":["a"],"done":[],"updatedAt":${T0}}`,
        `{"order":["a"],"done":[],"updatedAt":["${good}"]}`, // Date.parse 會把只有一個字串的陣列當成那個字串，不是字串的 updatedAt 不能放行
        `{"order":[1],"done":[],"updatedAt":"${good}"}`,
        `{"order":["a"],"done":[null],"updatedAt":"${good}"}`,
        `{"order":["a"],"done":"a","updatedAt":"${good}"}`,
        'null', '[]', '"text"', ''
    ]) {
        const storage = memoryStorage();
        storage.map.set(KEY, raw);
        assert.equal(new RouteProgress(storage, { now: () => T0 }).get(), null, raw);
    }
});

test('隔天再來：storage 裡超過 12 小時的舊進度，重新建立後讀不到，storage 裡的也一起清掉', () => {
    const storage = memoryStorage();
    new RouteProgress(storage, { now: () => T0 }).save({ order: ['tm_010'], done: ['tm_010'] });
    const nextDay = new RouteProgress(storage, { now: () => T0 + 12 * HOUR + 1 });
    assert.equal(nextDay.get(), null);
    assert.equal(storage.map.has(KEY), false);
});

test('get() 與 save() 都不共用陣列：改動拿到的或存進去的陣列，不會動到記憶體裡的進度', () => {
    const progress = new RouteProgress(memoryStorage(), { now: () => T0 });
    const order = ['a', 'b'];
    const done = ['a'];
    progress.save({ order, done });
    order.push('c');
    done.push('b');
    assert.deepEqual([progress.get().order, progress.get().done], [['a', 'b'], ['a']]);
    const got = progress.get();
    got.order.push('z');
    got.done.length = 0;
    assert.deepEqual([progress.get().order, progress.get().done], [['a', 'b'], ['a']]);
});

test('sync：changed 逐項比——內容一樣不算（打開路線頁不該改動進度）、順序變了算、只有 done 變了也算', () => {
    const saved = { order: ['a', 'b', 'c'], done: ['b'], updatedAt: '2026-10-15T12:00:00.000Z' };
    const noFirst = { firstOrder: () => assert.fail() };
    // 清單只是換了排列，mergeOrder 回傳另一個內容相同的陣列 → 沒變
    assert.deepEqual(RouteProgress.sync(saved, ['c', 'b', 'a'], { ...noFirst, mergeOrder: prev => [...prev] }),
        { order: ['a', 'b', 'c'], done: ['b'], changed: false, restarted: false });
    // 站都一樣，只是 mergeOrder 排的順序不同 → 變了
    assert.deepEqual(RouteProgress.sync(saved, ['a', 'b', 'c'], { ...noFirst, mergeOrder: () => ['b', 'a', 'c'] }),
        { order: ['b', 'a', 'c'], done: ['b'], changed: true, restarted: false });
    // 站序沒變，只有 done 裡不在清單的 id 被拿掉 → 變了
    assert.deepEqual(RouteProgress.sync({ ...saved, done: ['b', 'x'] }, ['a', 'b', 'c'], { ...noFirst, mergeOrder: prev => prev }),
        { order: ['a', 'b', 'c'], done: ['b'], changed: true, restarted: false });
});

test('sync：全部完成之後清單少了一張也算有變化 → 重新來過', () => {
    const saved = { order: ['a', 'b'], done: ['a', 'b'], updatedAt: '2026-10-15T12:00:00.000Z' };
    assert.deepEqual(RouteProgress.sync(saved, ['a'], { firstOrder: () => ['a'], mergeOrder: () => assert.fail() }),
        { order: ['a'], done: [], changed: true, restarted: true });
});
