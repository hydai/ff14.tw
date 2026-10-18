const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KEY = 'ff14tw_weather_selection';
const PATHNAME = '/tools/weather-forecast/';

const SOURCES = ['zone-data', 'weather-store'].map(name => ({
    name,
    code: fs.readFileSync(path.resolve(__dirname, `../tools/weather-forecast/${name}.js`), 'utf8')
}));

// 在 vm 裡載入真正的 zone-data.js 與 weather-store.js，只換掉 store 會碰到的瀏覽器物件：
// location、history.replaceState（改 location.hash、記下收到的網址）、addEventListener（記下 hashchange）、localStorage。
// storage：
// - 'works'：localStorage 是一個 Map，calls 記下每一次 get／set／remove
// - 'read-throws'：getItem 丟例外（setItem 正常）
// - 'write-throws'：setItem 丟例外（getItem 正常）
// - 'methods-throw'：getItem、setItem 都丟例外
// - 'access-throws'：光是讀 window.localStorage 就丟例外（Chrome 封鎖網站資料時是 SecurityError）
// - 'absent'：根本沒有 localStorage（舊的測試頁面替身就是這樣）
// stored：事先放進記憶的內容，物件會轉成 JSON，字串照原樣放（用來放壞掉的 JSON）。
// autoInit 為 false 時不呼叫 store.init()，讓測試先 subscribe。
function createStorePage({ hash = '', stored, storage = 'works', autoInit = true } = {}) {
    const memory = new Map();
    if (stored !== undefined) memory.set(KEY, typeof stored === 'string' ? stored : JSON.stringify(stored));
    const calls = [];
    const replaced = [];
    const listeners = new Map();
    const context = vm.createContext({
        location: { hash, pathname: PATHNAME },
        history: {
            replaceState(_state, _title, url) {
                replaced.push(url);
                context.location.hash = url.startsWith('#') ? url : '';
            }
        },
        addEventListener(type, callback) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(callback);
        },
        removeEventListener(type, callback) {
            listeners.get(type)?.delete(callback);
        }
    });
    context.window = context;

    const thrower = (message) => () => { throw new Error(message); };
    const working = {
        getItem(key) { calls.push(['get', key]); return memory.has(key) ? memory.get(key) : null; },
        setItem(key, value) { calls.push(['set', key]); memory.set(key, String(value)); },
        removeItem(key) { calls.push(['remove', key]); memory.delete(key); }
    };
    if (storage === 'works') context.localStorage = working;
    else if (storage === 'read-throws') context.localStorage = { ...working, getItem: thrower('read blocked') };
    else if (storage === 'write-throws') context.localStorage = { ...working, setItem: thrower('QuotaExceededError') };
    else if (storage === 'methods-throw') context.localStorage = { getItem: thrower('read blocked'), setItem: thrower('QuotaExceededError') };
    else if (storage === 'access-throws') {
        vm.runInContext("Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true })", context);
        // 先確認讀 localStorage 真的會丟例外，測試的前提才成立
        assert.throws(() => vm.runInContext('window.localStorage', context), /SecurityError/);
    } else if (storage === 'absent') {
        assert.equal(vm.runInContext('typeof window.localStorage', context), 'undefined');
    } else {
        throw new Error(`unknown storage mode: ${storage}`);
    }

    for (const { name, code } of SOURCES) vm.runInContext(code, context, { filename: `${name}.js` });
    const store = vm.runInContext('new WeatherStore()', context);
    if (autoInit) store.init();
    return {
        context, store, WeatherStore: context.WeatherStore, memory, calls, replaced, listeners,
        get hash() { return context.location.hash; },
        saved: () => JSON.parse(memory.get(KEY)),
        changeHash(next) {
            context.location.hash = next;
            for (const callback of listeners.get('hashchange') || []) callback();
        }
    };
}

// vm 裡的 Set 先轉成這邊的陣列，deepEqual 才不會因為原型不同而失敗
const snapshot = (state) => ({
    zoneId: state.zoneId,
    desiredWeathers: Array.from(state.desiredWeathers),
    previousWeathers: Array.from(state.previousWeathers),
    beginHour: state.beginHour,
    endHour: state.endHour,
    event: state.event
});
const FIRST_VISIT = { zoneId: null, desiredWeathers: [], previousWeathers: [], beginHour: 0, endHour: 24, event: null };
const GRIDANIA_RAIN = { zoneId: 'gridania', desiredWeathers: ['Rain'], previousWeathers: [], beginHour: 8, endHour: 16 };

test('記憶的 key 是 ff14tw_weather_selection', () => {
    assert.equal(createStorePage({ autoInit: false }).WeatherStore.STORAGE_KEY, 'ff14tw_weather_selection');
});

test('沒有 hash 時照記憶，並把 hash 寫回網址', () => {
    const page = createStorePage({ stored: GRIDANIA_RAIN, autoInit: false });
    const notices = [];
    page.store.subscribe((_state, type) => notices.push(type));
    page.store.init();
    assert.deepEqual(snapshot(page.store.state), { ...GRIDANIA_RAIN, event: null });
    assert.equal(page.hash, '#gridania-6--8-16');
    assert.equal(page.replaced.length, 1);
    // 只通知一次還原後的狀態，不會先 reset 再還原
    assert.deepEqual(notices, ['state']);
});

test('有效的 hash 優先，並且存成這次的選擇', () => {
    const plain = createStorePage({ hash: '#uldah', stored: GRIDANIA_RAIN });
    assert.equal(plain.store.state.zoneId, 'uldah');
    assert.deepEqual(plain.saved(), { zoneId: 'uldah', desiredWeathers: [], previousWeathers: [], beginHour: 0, endHour: 24 });
    // 網址照原樣、不重寫；有 hash 就不必讀記憶，只把這次的選擇寫進去
    assert.equal(plain.hash, '#uldah');
    assert.equal(plain.replaced.length, 0);
    assert.equal(plain.calls.some(([operation]) => operation === 'get'), false);

    // 帶條件和特殊事件的分享連結：條件記住，特殊事件不記
    const shared = createStorePage({ hash: '#gridania-6-3-8-16-garlok', stored: { ...GRIDANIA_RAIN, zoneId: 'uldah', desiredWeathers: [] } });
    assert.deepEqual(snapshot(shared.store.state), {
        zoneId: 'gridania', desiredWeathers: ['Rain'], previousWeathers: ['Fog'], beginHour: 8, endHour: 16, event: 'garlok'
    });
    assert.deepEqual(shared.saved(), { zoneId: 'gridania', desiredWeathers: ['Rain'], previousWeathers: ['Fog'], beginHour: 8, endHour: 16 });
    assert.equal(shared.hash, '#gridania-6-3-8-16-garlok');
});

test('載入時 hash 無效就改用記憶，網址改成記憶的', () => {
    for (const hash of ['#unknown-zone', '#gridani', '#6-8']) {
        const page = createStorePage({ hash, stored: GRIDANIA_RAIN });
        assert.deepEqual(snapshot(page.store.state), { ...GRIDANIA_RAIN, event: null }, hash);
        assert.equal(page.hash, '#gridania-6--8-16', hash);
        assert.equal(page.replaced.length, 1, hash);
    }
});

test('第一次來：沒有 hash 也沒有記憶，什麼都不寫', () => {
    const page = createStorePage({ autoInit: false });
    const notices = [];
    page.store.subscribe((_state, type) => notices.push(type));
    page.store.init();
    assert.deepEqual(snapshot(page.store.state), FIRST_VISIT);
    assert.deepEqual(notices, ['reset']);
    assert.equal(page.replaced.length, 0);
    assert.equal(page.memory.has(KEY), false);
    assert.deepEqual(page.calls.filter(([operation]) => operation !== 'get'), []);
});

test('停留在頁面上 hash 變成無效或空的：重設畫面，記憶留著', () => {
    const page = createStorePage({ hash: '#gridania-6--8-16', stored: { ...GRIDANIA_RAIN, zoneId: 'uldah', desiredWeathers: [] } });
    const notices = [];
    page.store.subscribe((_state, type) => notices.push(type));
    assert.equal(page.saved().zoneId, 'gridania');
    for (const next of ['#unknown-zone', '']) {
        const remembered = page.memory.get(KEY);
        page.calls.length = 0;
        page.changeHash(next);
        // 回到第一次來的畫面：不讀記憶（記憶裡明明有地區）、不清掉記憶、不重寫網址
        assert.deepEqual(snapshot(page.store.state), FIRST_VISIT, JSON.stringify(next));
        assert.deepEqual(page.calls, [], JSON.stringify(next));
        assert.equal(page.memory.get(KEY), remembered, JSON.stringify(next));
        assert.equal(page.replaced.length, 0, JSON.stringify(next));

        // 之後再改成有效的 hash 照常還原，並且存成這次的選擇
        page.changeHash('#uldah');
        assert.equal(page.store.state.zoneId, 'uldah', JSON.stringify(next));
        assert.equal(page.saved().zoneId, 'uldah', JSON.stringify(next));
        page.changeHash('#gridania-6--8-16');
        assert.deepEqual(page.saved(), GRIDANIA_RAIN, JSON.stringify(next));
    }
    assert.deepEqual(notices, ['reset', 'state', 'state', 'reset', 'state', 'state']);
});

test('每個改變都存進記憶，特殊事件不存', () => {
    const page = createStorePage();
    const gridania = { zoneId: 'gridania', desiredWeathers: [], previousWeathers: [], beginHour: 0, endHour: 24 };
    const steps = [
        ['setZone', (store) => store.setZone('gridania'), gridania],
        ['toggleDesiredWeather 加入', (store) => store.toggleDesiredWeather('Rain'), { ...gridania, desiredWeathers: ['Rain'] }],
        ['togglePreviousWeather 加入', (store) => store.togglePreviousWeather('Fog'), { ...gridania, desiredWeathers: ['Rain'], previousWeathers: ['Fog'] }],
        ['setTimeRange', (store) => store.setTimeRange(8, 16), { ...gridania, desiredWeathers: ['Rain'], previousWeathers: ['Fog'], beginHour: 8, endHour: 16 }],
        // 特殊事件只在網址裡，記憶裡沒有 event 欄位
        ['setEvent', (store) => store.setEvent('garlok'), { ...gridania, desiredWeathers: ['Rain'], previousWeathers: ['Fog'], beginHour: 8, endHour: 16 }],
        ['clearConditions', (store) => store.clearConditions(), { ...gridania, desiredWeathers: ['Rain'] }],
        ['toggleDesiredWeather 取消', (store) => store.toggleDesiredWeather('Rain'), gridania],
        ['togglePreviousWeather 再加入', (store) => store.togglePreviousWeather('Clouds'), { ...gridania, previousWeathers: ['Clouds'] }],
        ['togglePreviousWeather 取消', (store) => store.togglePreviousWeather('Clouds'), gridania],
        ['setTimeRange 跨午夜', (store) => store.setTimeRange(18, 7), { ...gridania, beginHour: 18, endHour: 7 }],
        ['setEvent 清掉', (store) => store.setEvent(null), { ...gridania, beginHour: 18, endHour: 7 }],
        ['clearFilters', (store) => { store.toggleDesiredWeather('Rain'); store.setEvent('laideronnette'); store.clearFilters(); }, gridania],
        ['setZone 換地區', (store) => { store.toggleDesiredWeather('Rain'); store.setZone('uldah'); }, { ...gridania, zoneId: 'uldah' }]
    ];
    for (const [label, act, expected] of steps) {
        act(page.store);
        assert.deepEqual(page.saved(), expected, label);
    }

    // 網址仍然帶著特殊事件
    page.store.setZone('gridania');
    page.store.setEvent('garlok');
    assert.equal(page.hash, '#gridania---0-24-garlok');
    assert.deepEqual(page.saved(), gridania);
    assert.deepEqual(Object.keys(page.saved()), ['zoneId', 'desiredWeathers', 'previousWeathers', 'beginHour', 'endHour']);

    // 整份狀態一次換掉並要求更新網址（setState 的第二個參數）：網址和記憶都跟著換
    page.store.setState({ zoneId: 'uldah', desiredWeathers: new Set(['Fog']), previousWeathers: new Set(), beginHour: 6, endHour: 18, event: 'garlok' }, true);
    assert.equal(page.hash, '#uldah-3--6-18-garlok');
    assert.deepEqual(page.saved(), { zoneId: 'uldah', desiredWeathers: ['Fog'], previousWeathers: [], beginHour: 6, endHour: 18 });

    // reset() 什麼都不寫
    const before = page.memory.get(KEY);
    page.calls.length = 0;
    page.store.reset();
    assert.deepEqual(page.calls, []);
    assert.equal(page.memory.get(KEY), before);
});

test('clearConditions 只清前置天氣與時段', () => {
    const page = createStorePage({ hash: '#gridania-6-3,2-8-16-garlok' });
    assert.deepEqual(snapshot(page.store.state), {
        zoneId: 'gridania', desiredWeathers: ['Rain'], previousWeathers: ['Fog', 'Clouds'], beginHour: 8, endHour: 16, event: 'garlok'
    });
    const notices = [];
    page.store.subscribe((_state, type) => notices.push(type));

    page.store.clearConditions();
    // 目標天氣和特殊事件留著
    assert.deepEqual(snapshot(page.store.state), {
        zoneId: 'gridania', desiredWeathers: ['Rain'], previousWeathers: [], beginHour: 0, endHour: 24, event: 'garlok'
    });
    assert.deepEqual(notices, ['conditions']);
    assert.equal(page.hash, '#gridania-6--0-24-garlok');
    assert.deepEqual(page.saved(), { zoneId: 'gridania', desiredWeathers: ['Rain'], previousWeathers: [], beginHour: 0, endHour: 24 });

    // 沒有條件可清的時候照樣可以呼叫
    page.store.clearConditions();
    assert.deepEqual(notices, ['conditions', 'conditions']);
    assert.equal(page.store.state.zoneId, 'gridania');
});

test('hashOf 把天氣索引排序', () => {
    // 依序加入 Rain(6)、Clear Skies(0)：網址和寫入的 hash 都是 0,6
    const page = createStorePage({ hash: '#gridania' });
    page.store.toggleDesiredWeather('Rain');
    page.store.toggleDesiredWeather('Clear Skies');
    assert.equal(page.hash, '#gridania-0,6--0-24');
    page.store.togglePreviousWeather('Fog');
    page.store.togglePreviousWeather('Clouds');
    assert.equal(page.hash, '#gridania-0,6-2,3-0-24');

    // 索引要當數字排序：Dust Storms(10) 在 Rain(6) 後面，不是前面
    const thanalan = createStorePage({ hash: '#central-thanalan' });
    thanalan.store.toggleDesiredWeather('Dust Storms');
    thanalan.store.toggleDesiredWeather('Rain');
    assert.equal(thanalan.hash, '#central-thanalan-6,10--0-24');

    // 解構取出也能用（Task 6 的提醒目標不會是 store 實例）；Set 或陣列、各種順序都一樣
    const { hashOf } = createStorePage({ autoInit: false }).WeatherStore;
    const target = (overrides) => ({ zoneId: 'central-thanalan', desiredWeathers: [], previousWeathers: [], beginHour: 0, endHour: 24, event: null, ...overrides });
    assert.equal(hashOf(target({ desiredWeathers: new Set(['Rain', 'Clear Skies']) })), 'central-thanalan-0,6--0-24');
    assert.equal(hashOf(target({ desiredWeathers: ['Clear Skies', 'Rain'] })), 'central-thanalan-0,6--0-24');
    assert.equal(hashOf(target({ desiredWeathers: ['Dust Storms', 'Rain'] })), 'central-thanalan-6,10--0-24');
    assert.equal(hashOf(target({ desiredWeathers: ['Rain'], previousWeathers: new Set(['Showers', 'Fog']) })), 'central-thanalan-6-3,7-0-24');
    assert.equal(hashOf(target({ desiredWeathers: ['Rain', 'Rain'] })), 'central-thanalan-6--0-24');
});

test('hashOf 的規則：沒有條件只寫地區，特殊事件接在最後，沒有地區是空字串', () => {
    const { hashOf } = createStorePage({ autoInit: false }).WeatherStore;
    const target = (overrides) => ({ zoneId: 'uldah', desiredWeathers: new Set(), previousWeathers: new Set(), beginHour: 0, endHour: 24, event: null, ...overrides });
    assert.equal(hashOf(target({})), 'uldah');
    assert.equal(hashOf(target({ beginHour: 8, endHour: 16 })), 'uldah---8-16');
    assert.equal(hashOf(target({ event: 'laideronnette' })), 'uldah---0-24-laideronnette');
    assert.equal(hashOf(target({ desiredWeathers: ['Rain'], beginHour: 18, endHour: 7, event: 'garlok' })), 'uldah-6--18-7-garlok');
    assert.equal(hashOf(target({ zoneId: null, desiredWeathers: ['Rain'] })), '');
    assert.equal(hashOf(target({ zoneId: '' })), '');
    assert.equal(hashOf(null), '');
    // 不存在的天氣名稱不會進 hash
    assert.equal(hashOf(target({ desiredWeathers: ['Rain', 'No Such Weather'] })), 'uldah-6--0-24');
});

test('hashOf 的結果可以原樣讀回來，連字號的地區也是', () => {
    const { hashOf } = createStorePage({ autoInit: false }).WeatherStore;
    const hash = hashOf({
        zoneId: 'limsa-lominsa', desiredWeathers: ['Rain', 'Clear Skies'], previousWeathers: ['Fog'], beginHour: 18, endHour: 7, event: 'laideronnette'
    });
    assert.equal(hash, 'limsa-lominsa-0,6-3-18-7-laideronnette');
    const page = createStorePage({ hash: `#${hash}` });
    assert.deepEqual(snapshot(page.store.state), {
        zoneId: 'limsa-lominsa', desiredWeathers: ['Clear Skies', 'Rain'], previousWeathers: ['Fog'], beginHour: 18, endHour: 7, event: 'laideronnette'
    });
});

test('壞掉或過期的記憶：忽略或修正', () => {
    // 完全不能用：當作第一次來，網址不動
    const unusable = [
        '{oops', '', 'null', '[]', '42', '"gridania"', 'true',
        {}, { zoneId: 'atlantis' }, { zoneId: 7 }, { zoneId: null }, { desiredWeathers: ['Rain'], beginHour: 8, endHour: 16 }
    ];
    for (const stored of unusable) {
        const page = createStorePage({ stored });
        assert.deepEqual(snapshot(page.store.state), FIRST_VISIT, JSON.stringify(stored));
        assert.equal(page.replaced.length, 0, JSON.stringify(stored));
    }

    // 不是這個地區的天氣丟掉；不是字串的也丟掉；時數超出範圍就當作沒設（回到 0／24，不是夾到邊界）
    const fixed = createStorePage({
        stored: { zoneId: 'gridania', desiredWeathers: ['Rain', 'Snow', 7, null], previousWeathers: ['Fog', 'Blizzards', 'Rain'], beginHour: 30, endHour: 99 }
    });
    assert.deepEqual(snapshot(fixed.store.state), {
        zoneId: 'gridania', desiredWeathers: ['Rain'], previousWeathers: ['Fog', 'Rain'], beginHour: 0, endHour: 24, event: null
    });
    assert.equal(fixed.hash, '#gridania-6-3,6-0-24');

    // 天氣不是陣列：當作沒有
    const notLists = createStorePage({ stored: { zoneId: 'gridania', desiredWeathers: 'Rain', previousWeathers: { 0: 'Fog' }, beginHour: 8, endHour: 16 } });
    assert.deepEqual(snapshot(notLists.store.state), { ...FIRST_VISIT, zoneId: 'gridania', beginHour: 8, endHour: 16 });

    // 時數：beginHour 是 0–23、endHour 是 0–24 的整數才收，其他都回到 0／24
    const hours = [
        [{ beginHour: 23, endHour: 0 }, 23, 0],
        [{ beginHour: 0, endHour: 24 }, 0, 24],
        [{ beginHour: 8, endHour: 16 }, 8, 16],
        [{ beginHour: 24, endHour: 25 }, 0, 24],
        [{ beginHour: -1, endHour: -1 }, 0, 24],
        [{ beginHour: 8.5, endHour: 16.5 }, 0, 24],
        [{ beginHour: '8', endHour: '16' }, 0, 24],
        [{ beginHour: null, endHour: null }, 0, 24],
        [{ beginHour: 8 }, 8, 24],
        [{ endHour: 16 }, 0, 16],
        [{}, 0, 24]
    ];
    for (const [fields, beginHour, endHour] of hours) {
        const page = createStorePage({ stored: { zoneId: 'gridania', desiredWeathers: [], previousWeathers: [], ...fields } });
        assert.equal(page.store.state.zoneId, 'gridania', JSON.stringify(fields));
        assert.deepEqual([page.store.state.beginHour, page.store.state.endHour], [beginHour, endHour], JSON.stringify(fields));
    }
});

test('舊的或手打的 hash 不丟例外', () => {
    // 天氣索引不存在（99）、時數超出範圍：沿用網址的處理（夾到 0–23、0–24）
    const page = createStorePage({ hash: '#kozamauka-99,7--30-99' });
    assert.deepEqual(snapshot(page.store.state), {
        zoneId: 'kozamauka', desiredWeathers: ['Showers'], previousWeathers: [], beginHour: 23, endHour: 24, event: null
    });
    assert.deepEqual(page.saved(), { zoneId: 'kozamauka', desiredWeathers: ['Showers'], previousWeathers: [], beginHour: 23, endHour: 24 });

    // 完全不是數字、不認得的特殊事件
    const junk = createStorePage({ hash: '#gridania-abc,,-x-y-z-bogus-extra' });
    assert.deepEqual(snapshot(junk.store.state), { ...FIRST_VISIT, zoneId: 'gridania' });
    assert.deepEqual(junk.saved(), { zoneId: 'gridania', desiredWeathers: [], previousWeathers: [], beginHour: 0, endHour: 24 });

    // 不是這個地區的天氣照樣留著（答案卡會寫「60 天內沒有符合的時段」），也照樣記住
    const foreign = createStorePage({ hash: '#gridania-9,11-12-0-24' });
    assert.deepEqual(snapshot(foreign.store.state), {
        zoneId: 'gridania', desiredWeathers: ['Thunderstorms', 'Heat Waves'], previousWeathers: ['Snow'], beginHour: 0, endHour: 24, event: null
    });
    assert.deepEqual(foreign.saved().desiredWeathers.slice().sort(), ['Heat Waves', 'Thunderstorms']);
});

test('localStorage 丟例外時照常：第一次來、改變不丟例外', () => {
    for (const storage of ['read-throws', 'write-throws', 'methods-throw', 'access-throws', 'absent']) {
        // 第一次來（讀不到記憶，也讀不出例外）
        const page = createStorePage({ storage });
        assert.deepEqual(snapshot(page.store.state), FIRST_VISIT, storage);
        assert.equal(page.replaced.length, 0, storage);

        // 每一種改變都不丟例外，網址與狀態照常更新
        page.store.setZone('gridania');
        page.store.toggleDesiredWeather('Rain');
        page.store.togglePreviousWeather('Fog');
        page.store.setTimeRange(8, 16);
        page.store.setEvent('garlok');
        assert.equal(page.hash, '#gridania-6-3-8-16-garlok', storage);
        page.store.clearConditions();
        assert.equal(page.hash, '#gridania-6--0-24-garlok', storage);
        page.store.clearFilters();
        assert.equal(page.hash, '#gridania', storage);
        page.store.setZone('uldah');
        assert.equal(page.hash, '#uldah', storage);
        page.store.reset();
        assert.equal(page.store.state.zoneId, null, storage);

        // 分享連結照常打開、停留在頁面上的 hash 變化照常處理
        const shared = createStorePage({ hash: '#gridania-6--8-16', storage });
        assert.deepEqual(snapshot(shared.store.state), { ...GRIDANIA_RAIN, event: null }, storage);
        shared.changeHash('#unknown-zone');
        assert.equal(shared.store.state.zoneId, null, storage);
        shared.changeHash('#uldah');
        assert.equal(shared.store.state.zoneId, 'uldah', storage);
    }

    // 寫不進去不代表讀不到：能讀的時候照樣還原
    const restored = createStorePage({ stored: GRIDANIA_RAIN, storage: 'write-throws' });
    assert.equal(restored.store.state.zoneId, 'gridania');
    assert.equal(restored.hash, '#gridania-6--8-16');
});
