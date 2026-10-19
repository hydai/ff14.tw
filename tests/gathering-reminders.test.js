const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const items = require('../data/timed-gathering.json').items;

const KEY = 'ff14tw_timed_gathering_reminders';
const LEGACY_KEY = 'ff14tw_timed_gathering_notifications';
const LISTS_KEY = 'ff14tw_timed_gathering_lists';
const MINUTE = 60000;

// 期望值用測試自己的 ET 換算，不寫死時間戳（同 tests/gathering-materials.test.js）：
// 1 ET 分鐘 = 175000 / 60 ms，1 ET 天 = 1440 ET 分鐘 = 4,200,000 ms
const T = 1_760_000_000_000;
const ET_MINUTE_MS = 175000 / 60;
const day = Math.floor(T / 4_200_000); // T 所在的 ET 日
const at = (offset, h, m = 0) => Math.round(((day + offset) * 1440 + h * 60 + m) * ET_MINUTE_MS);

// vm 是另一個 realm：它建出來的陣列與物件，原型和這邊不同，strict 的 deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));
const starts = (alerts) => Array.from(alerts, (alert) => alert.start);

// ---------- 在 vm 裡載入真正的腳本 ----------
// 同 index.html 的順序：頂層的 class 在同一個 context 裡互相看得到，window 指向 context 本身
const FILES = [
    'tools/timed-gathering/time-calculator.js',
    'tools/timed-gathering/gathering-materials.js',
    'tools/timed-gathering/gathering-reminders.js'
];
const SCHEDULER = 'assets/js/reminder-scheduler.js';
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

/**
 * localStorage 是 storage 這個 Map（stored 是初始內容）；writes 記下每一次 setItem／removeItem 的 key。
 * - readThrows：光是讀 localStorage 就丟例外（Chrome 封鎖網站資料時是 SecurityError）
 * - writeThrows：讀得到、但寫不進去（儲存空間滿了）
 * - records：拿來合成素材的資料，預設是 data/timed-gathering.json 的 items
 * - scheduler：多載入共用的 ReminderScheduler（只有拿 alerts() 去對它的測試要用）
 */
function load({ stored = {}, readThrows = false, writeThrows = false, records = items, scheduler = false } = {}) {
    const context = vm.createContext({});
    context.window = context;
    const storage = new Map(Object.entries(stored));
    const writes = [];
    if (readThrows) {
        vm.runInContext("Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true })", context);
        assert.throws(() => vm.runInContext('window.localStorage', context), /SecurityError/);
    } else {
        context.localStorage = {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => {
                writes.push(key);
                if (writeThrows) throw new Error('QuotaExceededError');
                storage.set(key, String(value));
            },
            removeItem: (key) => {
                writes.push(key);
                storage.delete(key);
            }
        };
    }
    for (const file of scheduler ? [...FILES, SCHEDULER] : FILES) {
        vm.runInContext(read(file), context, { filename: file });
    }

    const materials = context.GatheringMaterials.group(records);
    return {
        context,
        storage,
        writes,
        GatheringReminders: context.GatheringReminders,
        // now 省略時 constructor 用 Date.now()；list 是提醒認得的素材，預設是 records 合成的全部
        create: (now, list = materials) => new context.GatheringReminders(list, now),
        saved: () => JSON.parse(storage.get(KEY))
    };
}

// 清單裡的一筆：資料裡有的用真的那一筆，已經從資料拿掉的只有 id
const record = (id) => items.find((item) => item.id === id) || { id };
// ListManager 存的清單文件（只放這個測試要用的欄位）
const listsDoc = (ids, extraLists = {}) => JSON.stringify({
    version: '1.0',
    lists: { default: { id: 'default', name: '預設清單', items: ids.map(record) }, ...extraLists }
});
const LEGACY_ON = JSON.stringify({ enabled: true });

test('預設：網頁提醒關著、提早 1 分鐘、沒有提醒；選項是 0／1／2／3／5／10', () => {
    const { GatheringReminders: R, create, storage, writes } = load();
    assert.equal(R.STORAGE_KEY, KEY);
    assert.equal(R.LEGACY_KEY, LEGACY_KEY);
    assert.equal(R.LISTS_KEY, LISTS_KEY);
    assert.deepEqual(plain(R.LEAD_OPTIONS), [0, 1, 2, 3, 5, 10]);
    assert.equal(R.DEFAULT_LEAD, 1);
    assert.equal(R.MINUTE_MS, 60000);

    const r = create(T);
    assert.equal(r.enabled, false);
    assert.equal(r.leadMinutes, 1);
    assert.deepEqual(plain(r.keys), []);
    assert.equal(r.has('botany_cordia_resin'), false);
    assert.deepEqual(plain(r.alerts(T)), []);
    // 什麼都沒設定，就什麼都不存
    assert.equal(storage.size, 0);
    assert.deepEqual(writes, []);

    // reload() 回傳存過沒有：讀得到、但什麼都沒存是 true
    assert.equal(r.reload(), true);
    r.add('botany_cordia_resin', T);
    assert.equal(r.reload(), false);
});

test('add、remove、has；存起來，另一個實例讀得到；不認得的 key 不加', () => {
    const { create, saved } = load();
    const r = create(T);

    r.add('botany_cordia_resin', T);
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin']);
    assert.equal(r.has('botany_cordia_resin'), true);
    assert.deepEqual(saved().entries[0], { key: 'botany_cordia_resin', armedAt: T });
    // 存的格式
    assert.deepEqual(saved(), {
        enabled: false,
        enabledAt: 0,
        leadMinutes: 1,
        entries: [{ key: 'botany_cordia_resin', armedAt: T }]
    });
    // 另一個實例（重新整理、另一個分頁）讀得到
    assert.equal(create(T + MINUTE).has('botany_cordia_resin'), true);

    // 已經有了：什麼都不做，設定的時間不換成新的
    r.add('botany_cordia_resin', T + MINUTE);
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin']);
    assert.equal(saved().entries[0].armedAt, T);

    // 照加入的順序
    r.add('mining_lightning_quartz', T + 2 * MINUTE);
    r.add('botany_iris_root', T + 3 * MINUTE);
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin', 'mining_lightning_quartz', 'botany_iris_root']);
    assert.deepEqual(saved().entries.map((entry) => entry.key), ['botany_cordia_resin', 'mining_lightning_quartz', 'botany_iris_root']);
    assert.deepEqual(plain(create(T).keys), plain(r.keys));

    // keys 是一份複本，改它不會動到提醒
    const copy = r.keys;
    copy.push('hack');
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin', 'mining_lightning_quartz', 'botany_iris_root']);

    r.remove('mining_lightning_quartz');
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin', 'botany_iris_root']);
    assert.equal(r.has('mining_lightning_quartz'), false);
    assert.deepEqual(saved().entries.map((entry) => entry.key), ['botany_cordia_resin', 'botany_iris_root']);
    assert.equal(create(T).has('mining_lightning_quartz'), false);
    // 沒有的 key：拿掉也沒事
    assert.doesNotThrow(() => r.remove('gone'));
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin', 'botany_iris_root']);

    // 不認得的 key（資料裡沒有的素材、單筆的 id 不是素材的 key）：什麼都不做，也不存
    const fresh = load();
    const f = fresh.create(T);
    for (const bad of ['gone', 'botany_cordia_resin_1', '', undefined, null, 42]) {
        f.add(bad, T);
        assert.equal(f.has(bad), false, String(bad));
    }
    assert.deepEqual(plain(f.keys), []);
    assert.equal(fresh.storage.size, 0);
    assert.deepEqual(fresh.writes, []);
});

test('setLead 只收選項裡的；setEnabled 由關變開時記下 enabledAt', () => {
    const { create, saved } = load();
    const r = create(T);

    for (const minutes of [0, 1, 2, 3, 5, 10]) {
        r.setLead(minutes);
        assert.equal(r.leadMinutes, minutes);
        assert.equal(saved().leadMinutes, minutes);
    }
    // 不在選項裡的不理（連同看起來像選項的字串）
    for (const bad of [4, 15, -1, 0.5, '5', null, undefined, NaN, true, [5]]) {
        r.setLead(bad);
        assert.equal(r.leadMinutes, 10, String(bad));
        assert.equal(saved().leadMinutes, 10, String(bad));
    }
    // 0（出現的那一刻）是有效的選項，重新打開也還是 0，不會當成沒有而變回預設
    r.setLead(0);
    assert.equal(r.leadMinutes, 0);
    assert.equal(create(T).leadMinutes, 0);

    assert.equal(r.enabled, false);
    assert.equal(saved().enabled, false);
    r.setEnabled(true, T + MINUTE);
    assert.equal(r.enabled, true);
    assert.equal(saved().enabled, true);
    assert.equal(saved().enabledAt, T + MINUTE);
    // 已經開著：再開不改 enabledAt
    r.setEnabled(true, T + 5 * MINUTE);
    assert.equal(saved().enabledAt, T + MINUTE);
    // 關掉
    r.setEnabled(false, T + 6 * MINUTE);
    assert.equal(r.enabled, false);
    assert.equal(saved().enabled, false);
    // 再打開：由關變開，從這一刻重新算
    r.setEnabled(true, T + 20 * MINUTE);
    assert.equal(r.enabled, true);
    assert.equal(saved().enabledAt, T + 20 * MINUTE);

    const other = create(T);
    assert.equal(other.enabled, true);
    assert.equal(other.leadMinutes, 0);
});

test('沒傳 now（或不是有限的數字）：add() 和 setEnabled(true) 用現在的時間，不會存成算不出來的時間', () => {
    // 沒傳時用的 Date.now() 在這個 context 裡固定在 NOW
    const NOW = at(0, 11);
    const loadAtNow = () => {
        const loaded = load();
        vm.runInContext(`Date.now = () => ${NOW}`, loaded.context);
        return loaded;
    };

    // 沒傳（參數省略）和傳了算不出來的時間：都用現在的時間
    for (const args of [[], [undefined], [null], [NaN], [Infinity], [-Infinity], ['1760000000000']]) {
        const label = args.map(String).join() || '省略';
        const { create, saved } = loadAtNow();
        const r = create(T);
        r.add('botany_cordia_resin', ...args);
        r.setEnabled(true, ...args);
        assert.equal(saved().entries[0].armedAt, NOW, label);
        assert.equal(saved().enabledAt, NOW, label);

        // 存得起來、重新打開也在（armedAt 不是有限的數字的話，讀回來時會被丟掉）
        const again = create(T);
        assert.equal(again.has('botany_cordia_resin'), true, label);
        assert.equal(again.enabled, true, label);

        // 交給 ReminderScheduler 的 armedAt 是有限的數字（不是 NaN，NaN 的話這一次永遠不會響）
        const alerts = r.alerts(NOW);
        assert.ok(alerts.length > 0, label);
        assert.ok(alerts.every((alert) => alert.armedAt === NOW), label);
    }

    // 傳了有限的數字就用它，連 0 也是（不是用「有值」判斷）
    const { create, saved } = loadAtNow();
    const r = create(T);
    r.add('botany_cordia_resin', 0);
    r.add('mining_lightning_quartz', at(0, 9));
    r.setEnabled(true, 0);
    assert.deepEqual(saved().entries, [{ key: 'botany_cordia_resin', armedAt: 0 }, { key: 'mining_lightning_quartz', armedAt: at(0, 9) }]);
    assert.equal(saved().enabledAt, 0);

    // 關掉不需要時間（頁面上的開關關掉時不傳）
    const off = loadAtNow();
    const ro = off.create(T);
    ro.setEnabled(true, at(0, 9));
    assert.doesNotThrow(() => ro.setEnabled(false));
    assert.equal(ro.enabled, false);
    assert.equal(off.saved().enabled, false);
});

test('reload：壞掉的內容回到預設，不認得的素材與重複的提醒丟掉', () => {
    // STORAGE_KEY 裡存著 raw（不是字串的先轉成 JSON）的頁面，加上讀過它的 r
    const loadStored = (raw) => {
        const loaded = load({ stored: { [KEY]: typeof raw === 'string' ? raw : JSON.stringify(raw) } });
        return { ...loaded, r: loaded.create(T) };
    };

    // 修得好的：每個欄位各自整理，不認得的素材、armedAt 不是數字的、重複的提醒（只留第一個）丟掉
    const fixed = loadStored({
        enabled: true,
        enabledAt: 5000,
        leadMinutes: 99,
        entries: [
            { key: 'botany_cordia_resin', armedAt: 1000 },
            { key: 'gone_material', armedAt: 1000 }, // 資料裡沒有的素材
            { key: 'botany_cordia_resin', armedAt: 2000 }, // 重複
            { key: 'mining_lightning_quartz', armedAt: 'yesterday' }, // 時間不是數字
            { key: 'mining_lightning_quartz', armedAt: null }, // JSON 裡的 NaN 會變成 null
            { key: 42, armedAt: 1000 },
            { armedAt: 1000 },
            { key: 'botany_cordia_resin_1', armedAt: 1000 }, // 單筆的 id 不是素材的 key
            null,
            'botany_iris_root',
            [],
            { key: 'botany_iris_root', armedAt: 3000, extra: 'x' }
        ]
    });
    assert.deepEqual(plain(fixed.r.keys), ['botany_cordia_resin', 'botany_iris_root']);
    assert.equal(fixed.r.enabled, true);
    assert.equal(fixed.r.leadMinutes, 1, '提早分鐘數不在選項裡：回到預設');
    // 整理過的內容照樣存回去（多的欄位不留）
    fixed.r.save();
    assert.deepEqual(fixed.saved(), {
        enabled: true,
        enabledAt: 5000,
        leadMinutes: 1,
        entries: [{ key: 'botany_cordia_resin', armedAt: 1000 }, { key: 'botany_iris_root', armedAt: 3000 }]
    });

    // 一個欄位壞掉不影響其他欄位
    const partial = loadStored({ enabled: 'yes', enabledAt: 'x', leadMinutes: 3, entries: 'nope' });
    assert.equal(partial.r.enabled, false);
    assert.equal(partial.r.leadMinutes, 3);
    assert.deepEqual(plain(partial.r.keys), []);
    partial.r.save();
    assert.deepEqual(partial.saved(), { enabled: false, enabledAt: 0, leadMinutes: 3, entries: [] });

    // 整份壞掉（壞掉的 JSON、不是物件）：預設
    for (const raw of ['{not json', '', '[]', '"text"', 'null', '42', 'true', '{}']) {
        const broken = loadStored(raw);
        assert.equal(broken.r.enabled, false, raw);
        assert.equal(broken.r.leadMinutes, 1, raw);
        assert.deepEqual(plain(broken.r.keys), [], raw);
        broken.r.save();
        assert.deepEqual(broken.saved(), { enabled: false, enabledAt: 0, leadMinutes: 1, entries: [] }, raw);
    }
});

test('reload：照另一個分頁存的改；存的被清掉就回到預設，而且不會當成新的瀏覽器去遷移', () => {
    const lists = listsDoc(['botany_cordia_resin_1']);
    const { create, storage, writes } = load({
        stored: {
            [KEY]: JSON.stringify({ enabled: false, enabledAt: 0, leadMinutes: 1, entries: [] }),
            [LEGACY_KEY]: LEGACY_ON,
            [LISTS_KEY]: lists
        }
    });
    const r = create(T);

    storage.set(KEY, JSON.stringify({
        enabled: true,
        enabledAt: 7000,
        leadMinutes: 5,
        entries: [{ key: 'botany_iris_root', armedAt: 6000 }]
    }));
    r.reload();
    assert.equal(r.enabled, true);
    assert.equal(r.leadMinutes, 5);
    assert.deepEqual(plain(r.keys), ['botany_iris_root']);

    storage.delete(KEY);
    r.reload();
    assert.equal(r.enabled, false);
    assert.equal(r.leadMinutes, 1);
    assert.deepEqual(plain(r.keys), []);
    // 遷移只在建立的時候做一次：重新讀不會把以前的設定又帶進來，也不會存
    assert.equal(storage.has(KEY), false);
    assert.deepEqual(writes, []);
});

test('兩個分頁在收到對方的 storage 事件之前各自改：新增、取消、改設定都不蓋掉另一個分頁存的', () => {
    // 兩個實例共用同一個 localStorage，中間都不呼叫 reload()（還沒收到對方的 storage 事件）
    const { create, saved } = load();
    const a = create(T);
    const b = create(T);
    const savedKeys = () => saved().entries.map((entry) => entry.key);

    a.add('botany_cordia_resin', T);
    b.add('mining_lightning_quartz', T + MINUTE);
    assert.deepEqual(savedKeys(), ['botany_cordia_resin', 'mining_lightning_quartz'], 'B 新增時沒有蓋掉 A 新增的');
    assert.deepEqual(plain(b.keys), ['botany_cordia_resin', 'mining_lightning_quartz'], 'B 改之前先重讀，記憶裡也有 A 新增的');

    // A 取消、還沒重讀的 B 改提早分鐘數：取消的不會被 B 記憶裡舊的內容帶回來
    a.remove('botany_cordia_resin');
    b.setLead(5);
    assert.deepEqual(savedKeys(), ['mining_lightning_quartz']);
    assert.equal(saved().leadMinutes, 5);

    // A 打開網頁提醒、B 新增：開關維持 A 打開的，A 也沒有把 B 改的提早分鐘數改回去
    a.setEnabled(true, T + 2 * MINUTE);
    b.add('botany_iris_root', T + 3 * MINUTE);
    assert.equal(saved().enabled, true);
    assert.equal(saved().enabledAt, T + 2 * MINUTE);
    assert.equal(saved().leadMinutes, 5);
    assert.deepEqual(savedKeys(), ['mining_lightning_quartz', 'botany_iris_root']);

    // B 關掉網頁提醒、A 再設一次 B 已經設過的：開關照 B 關掉的，提醒不重複、設定的時間不變
    b.setEnabled(false);
    a.add('botany_iris_root', T + 4 * MINUTE);
    assert.equal(saved().enabled, false);
    assert.deepEqual(savedKeys(), ['mining_lightning_quartz', 'botany_iris_root']);
    assert.equal(saved().entries[1].armedAt, T + 3 * MINUTE);
    assert.deepEqual(plain(a.keys), savedKeys());
    assert.equal(a.enabled, false);
});

test('舊使用者：以前開著採集提醒，預設清單的素材變成我的提醒、網頁提醒開著；只遷移一次', () => {
    const lists = listsDoc(
        ['botany_cordia_resin_1', 'botany_cordia_resin_2', 'mining_lightning_quartz', 'gone_1'],
        { weekly: { id: 'weekly', name: '週任務', items: [record('botany_iris_root_1'), record('botany_iris_root')] } }
    );
    const { create, storage, writes, saved } = load({ stored: { [LEGACY_KEY]: LEGACY_ON, [LISTS_KEY]: lists } });

    const r = create(T);
    // 預設清單裡認得的素材（兩個時段是同一種素材），別的清單不算；資料裡已經沒有的 id 丟掉
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin', 'mining_lightning_quartz']);
    assert.equal(r.enabled, true);
    assert.equal(r.leadMinutes, 1);
    // 存起來：全部從這一刻開始算
    assert.deepEqual(saved(), {
        enabled: true,
        enabledAt: T,
        leadMinutes: 1,
        entries: [{ key: 'botany_cordia_resin', armedAt: T }, { key: 'mining_lightning_quartz', armedAt: T }]
    });
    // 舊的兩個 key 只讀：沒有寫過、也沒有刪過
    assert.deepEqual(writes, [KEY]);
    assert.equal(storage.get(LEGACY_KEY), LEGACY_ON);
    assert.equal(storage.get(LISTS_KEY), lists);

    // 只遷移一次：拿掉一個之後再打開，不會加回來
    r.remove('botany_cordia_resin');
    assert.deepEqual(plain(create(T + MINUTE).keys), ['mining_lightning_quartz']);
    // 全部拿掉、網頁提醒關掉也一樣
    r.remove('mining_lightning_quartz');
    r.setEnabled(false, T + 2 * MINUTE);
    const third = create(T + 3 * MINUTE);
    assert.deepEqual(plain(third.keys), []);
    assert.equal(third.enabled, false);
    // 舊的兩個 key 還是原樣，寫過的只有 STORAGE_KEY
    assert.equal(storage.get(LEGACY_KEY), LEGACY_ON);
    assert.equal(storage.get(LISTS_KEY), lists);
    assert.ok(writes.every((name) => name === KEY), writes.join());

    // 沒傳 now：從現在開始算
    const fresh = load({ stored: { [LEGACY_KEY]: LEGACY_ON, [LISTS_KEY]: lists } });
    const before = Date.now();
    fresh.create();
    const after = Date.now();
    assert.ok(fresh.saved().enabledAt >= before && fresh.saved().enabledAt <= after);
    assert.ok(fresh.saved().entries.every((entry) => entry.armedAt === fresh.saved().enabledAt));
});

test('遷移：照預設清單的順序，同一種素材只算一次，只有其中一個時段也認得，亂七八糟的清單內容不丟例外', () => {
    const migrated = (listsRaw) => {
        const stored = { [LEGACY_KEY]: LEGACY_ON };
        if (listsRaw !== undefined) stored[LISTS_KEY] = listsRaw;
        const loaded = load({ stored });
        return { ...loaded, r: loaded.create(T) };
    };

    // 順序：清單裡先出現的先；兩個時段都在也只算一次
    assert.deepEqual(
        plain(migrated(listsDoc(['mining_lightning_quartz', 'botany_cordia_resin_2', 'botany_iris_root', 'botany_cordia_resin_1', 'gone_1', 'gone'])).r.keys),
        ['mining_lightning_quartz', 'botany_cordia_resin', 'botany_iris_root']
    );
    // 清單裡只有素材的其中一個時段
    assert.deepEqual(plain(migrated(listsDoc(['botany_cordia_resin_2'])).r.keys), ['botany_cordia_resin']);
    // 清單項目的內容壞掉（不是物件、沒有 id、id 不是字串）：跳過那一項
    const odd = JSON.stringify({
        version: '1.0',
        lists: { default: { id: 'default', name: 'x', items: [null, 5, 'botany_cordia_resin_1', {}, { id: 5 }, { id: null }, record('botany_iris_root')] } }
    });
    assert.deepEqual(plain(migrated(odd).r.keys), ['botany_iris_root']);

    // 以前開著、但沒有東西可以帶過來（沒有清單、清單壞掉、預設清單沒有項目）：網頁提醒照樣維持開著，也照樣只做這一次
    for (const lists of [
        undefined, '{bad', '[]', 'null', '"x"', '42', '{}',
        '{"lists":null}', '{"lists":{}}', '{"lists":{"default":null}}', '{"lists":{"default":{}}}',
        '{"lists":{"default":{"items":null}}}', '{"lists":{"default":{"items":"x"}}}', '{"lists":{"default":{"items":{}}}}',
        listsDoc([]),
        // 預設清單裡只有全天的素材：沒有提醒可以帶（見下一個測試）
        listsDoc(['fishing_purple_tongue', 'fishing_purple_tongue_1']),
        // 預設清單被刪掉、只剩別的清單：不看別的清單
        JSON.stringify({ version: '1.0', lists: { weekly: { id: 'weekly', name: '週任務', items: [record('botany_iris_root')] } } })
    ]) {
        const label = String(lists);
        const { r, saved, writes } = migrated(lists);
        assert.equal(r.enabled, true, label);
        assert.deepEqual(plain(r.keys), [], label);
        assert.deepEqual(saved(), { enabled: true, enabledAt: T, leadMinutes: 1, entries: [] }, label);
        assert.deepEqual(writes, [KEY], label);
    }
});

test('遷移：全天的素材不帶過來（一直都能採，沒有提醒可以響，卡片上也沒有提醒鈕可以開關它）', () => {
    // 預設清單裡有全天的 fishing_purple_tongue（資料裡的 id，和帶 _1 的寫法）：它不帶過來，其他素材照清單的順序照樣帶過來
    const lists = listsDoc([
        'botany_cordia_resin_1', 'fishing_purple_tongue_1', 'mining_lightning_quartz', 'fishing_purple_tongue', 'botany_iris_root', 'botany_cordia_resin_2'
    ]);
    const { create, saved, writes } = load({ stored: { [LEGACY_KEY]: LEGACY_ON, [LISTS_KEY]: lists } });

    const r = create(T);
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin', 'mining_lightning_quartz', 'botany_iris_root']);
    assert.equal(r.has('fishing_purple_tongue'), false);
    assert.equal(r.enabled, true);
    // 存起來的也沒有它；其餘照舊：全部從這一刻開始算，只存一次
    assert.deepEqual(saved(), {
        enabled: true,
        enabledAt: T,
        leadMinutes: 1,
        entries: [
            { key: 'botany_cordia_resin', armedAt: T },
            { key: 'mining_lightning_quartz', armedAt: T },
            { key: 'botany_iris_root', armedAt: T }
        ]
    });
    assert.deepEqual(writes, [KEY]);
});

test('素材還沒載入（一種素材都沒有）：不遷移，也不存；等有素材的那一次再遷移', () => {
    const lists = listsDoc(['botany_cordia_resin_1', 'mining_lightning_quartz']);
    const { create, storage, writes, saved } = load({ stored: { [LEGACY_KEY]: LEGACY_ON, [LISTS_KEY]: lists } });

    // 資料載入失敗的那一次：沒有素材可以對，遷移只做一次，不能花在空的上面
    const empty = create(T, []);
    assert.equal(empty.enabled, false);
    assert.deepEqual(plain(empty.keys), []);
    assert.doesNotThrow(() => empty.migrate(T));
    assert.equal(empty.enabled, false, '直接呼叫 migrate() 也一樣');
    assert.deepEqual(writes, []);
    assert.equal(storage.has(KEY), false);
    assert.equal(storage.get(LEGACY_KEY), LEGACY_ON);
    assert.equal(storage.get(LISTS_KEY), lists);

    // 下一次資料載入好了：照常遷移
    const real = create(T + MINUTE);
    assert.deepEqual(plain(real.keys), ['botany_cordia_resin', 'mining_lightning_quartz']);
    assert.equal(real.enabled, true);
    assert.deepEqual(saved(), {
        enabled: true,
        enabledAt: T + MINUTE,
        leadMinutes: 1,
        entries: [{ key: 'botany_cordia_resin', armedAt: T + MINUTE }, { key: 'mining_lightning_quartz', armedAt: T + MINUTE }]
    });
    assert.deepEqual(writes, [KEY]);
});

test('已經存過我的提醒（哪怕內容壞掉）：不再遷移', () => {
    const lists = listsDoc(['botany_cordia_resin_1', 'mining_lightning_quartz']);
    for (const raw of [
        '{bad', '', '[]', 'null',
        JSON.stringify({ enabled: false, enabledAt: 0, leadMinutes: 1, entries: [] })
    ]) {
        const { create, storage, writes } = load({ stored: { [KEY]: raw, [LEGACY_KEY]: LEGACY_ON, [LISTS_KEY]: lists } });
        const r = create(T);
        assert.deepEqual(plain(r.keys), [], raw);
        assert.equal(r.enabled, false, raw);
        assert.deepEqual(writes, [], raw);
        assert.equal(storage.get(KEY), raw, raw);
    }
});

test('以前沒開、或內容壞掉：什麼都不做，也不存', () => {
    const lists = listsDoc(['botany_cordia_resin_1', 'mining_lightning_quartz']);
    for (const legacy of [
        JSON.stringify({ enabled: false }), '{bad', undefined /* 沒有這個 key */, '', '{}', '[]', 'null', '"x"', 'true', '42',
        JSON.stringify({ enabled: 'true' }), JSON.stringify({ enabled: 1 }), JSON.stringify({ enabled: null })
    ]) {
        const stored = { [LISTS_KEY]: lists };
        if (legacy !== undefined) stored[LEGACY_KEY] = legacy;
        const { create, storage, writes } = load({ stored });
        const r = create(T);
        const label = String(legacy);
        assert.deepEqual(plain(r.keys), [], label);
        assert.equal(r.enabled, false, label);
        assert.equal(r.leadMinutes, 1, label);
        assert.equal(storage.has(KEY), false, label);
        assert.deepEqual(writes, [], label);
        // 舊的兩個 key 也沒動
        assert.equal(storage.get(LISTS_KEY), lists, label);
        assert.equal(storage.get(LEGACY_KEY), legacy, label);
    }
});

test('瀏覽器封鎖網站資料：照樣能加、能拿掉，不丟例外', () => {
    // 光是讀 localStorage 就丟例外：連以前的設定也讀不到，所以也不遷移
    const { create } = load({ readThrows: true });
    let r;
    assert.doesNotThrow(() => { r = create(T); });
    assert.equal(r.enabled, false);
    assert.equal(r.leadMinutes, 1);
    assert.deepEqual(plain(r.keys), []);

    assert.doesNotThrow(() => r.add('botany_cordia_resin', T));
    assert.doesNotThrow(() => r.add('mining_lightning_quartz', T));
    assert.doesNotThrow(() => r.setLead(5));
    assert.doesNotThrow(() => r.setEnabled(true, T));
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin', 'mining_lightning_quartz']);
    assert.equal(r.leadMinutes, 5);
    assert.equal(r.enabled, true);
    // 這次打開期間照樣有提醒可以響
    assert.ok(r.alerts(T).length > 0);

    // 讀不到時重讀，記憶裡的不會被清掉
    assert.doesNotThrow(() => assert.equal(r.reload(), false));
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin', 'mining_lightning_quartz']);
    assert.equal(r.enabled, true);
    assert.equal(r.leadMinutes, 5);
    assert.doesNotThrow(() => r.save());
    // 讀不到以前的設定：遷移什麼都不做
    assert.doesNotThrow(() => r.migrate(T));
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin', 'mining_lightning_quartz']);

    assert.doesNotThrow(() => r.remove('botany_cordia_resin'));
    assert.deepEqual(plain(r.keys), ['mining_lightning_quartz']);
    assert.equal(r.has('botany_cordia_resin'), false);
});

test('寫不進去（儲存空間滿了）：這次打開期間照樣用記憶裡的，遷移的結果也在，舊的 key 不動', () => {
    const lists = listsDoc(['botany_cordia_resin_1', 'mining_lightning_quartz']);
    const { create, storage, writes } = load({ stored: { [LEGACY_KEY]: LEGACY_ON, [LISTS_KEY]: lists }, writeThrows: true });
    let r;
    assert.doesNotThrow(() => { r = create(T); });
    assert.deepEqual(plain(r.keys), ['botany_cordia_resin', 'mining_lightning_quartz']);
    assert.equal(r.enabled, true);

    assert.doesNotThrow(() => r.add('botany_iris_root', T + MINUTE));
    assert.doesNotThrow(() => r.remove('botany_cordia_resin'));
    assert.doesNotThrow(() => r.setLead(3));
    assert.doesNotThrow(() => r.setEnabled(false, T + 2 * MINUTE));
    assert.deepEqual(plain(r.keys), ['mining_lightning_quartz', 'botany_iris_root']);
    assert.equal(r.leadMinutes, 3);
    assert.equal(r.enabled, false);

    // 沒存成，舊的兩個 key 也沒動
    assert.equal(storage.has(KEY), false);
    assert.equal(storage.get(LEGACY_KEY), LEGACY_ON);
    assert.equal(storage.get(LISTS_KEY), lists);
    assert.ok(writes.length > 0 && writes.every((name) => name === KEY), writes.join());
});

test('alerts：關著時是空的；開著時每一段提早 leadMs，armedAt 取設定與打開較晚的', () => {
    const { create } = load();
    const r = create(T);
    r.add('botany_cordia_resin', at(0, 10));
    r.add('fishing_purple_tongue', at(0, 10)); // 全天的：加得進去，但沒有時段可以提醒
    assert.equal(r.has('fishing_purple_tongue'), true);
    assert.deepEqual(plain(r.alerts(at(0, 11))), [], '網頁提醒關著');

    r.setEnabled(true, at(0, 11));
    const alerts = r.alerts(at(0, 11));
    // 提早 1 分鐘還不到的時候：接下來兩次，全天的素材沒有
    assert.equal(alerts.length, 2);
    for (const alert of alerts) {
        assert.equal(alert.key, 'gathering:botany_cordia_resin');
        assert.equal(alert.leadMs, 60000);
        assert.equal(alert.armedAt, at(0, 11), '加入是 ET 10:00，打開是 ET 11:00：取較晚的');
        assert.deepEqual(Object.keys(alert).sort(), ['armedAt', 'data', 'end', 'key', 'leadMs', 'start']);
        assert.deepEqual(Object.keys(alert.data).sort(), ['materialKey', 'record', 'schedule']);
        assert.equal(alert.data.materialKey, 'botany_cordia_resin');
    }
    assert.equal(alerts[0].start, at(0, 12));
    assert.equal(alerts[0].end, at(0, 14));
    assert.equal(alerts[0].data.record.id, 'botany_cordia_resin_2');
    assert.equal(alerts[0].data.schedule.startMinutes, 720);
    assert.equal(alerts[1].start, at(1, 0));
    assert.equal(alerts[1].end, at(1, 2));
    assert.equal(alerts[1].data.record.id, 'botany_cordia_resin_1');
    assert.equal(alerts[1].data.schedule.startMinutes, 0);

    // 同一次出現不管從哪個現在算，start／end 都一樣（ReminderScheduler 用它認出是哪一次）；正在進行的那一次也列
    const during = r.alerts(at(0, 13, 30));
    assert.equal(during[0].start, at(0, 12));
    assert.equal(during[0].end, at(0, 14));
    assert.equal(during[1].start, at(1, 0));

    // 先打開、後加入：取加入的時間
    const other = load().create(T);
    other.setEnabled(true, at(0, 9));
    other.add('botany_cordia_resin', at(0, 10));
    assert.ok(other.alerts(at(0, 11)).every((alert) => alert.armedAt === at(0, 10)));

    // 關掉再打開：從打開的那一刻重新算（我的決定 4）
    r.setEnabled(false, at(0, 11, 30));
    assert.deepEqual(plain(r.alerts(at(0, 11, 30))), []);
    r.setEnabled(true, at(0, 13));
    assert.ok(r.alerts(at(0, 13)).every((alert) => alert.armedAt === at(0, 13)));

    // 好幾種素材：各自的提醒都列，key 帶素材
    r.add('botany_iris_root', at(0, 13, 10)); // ET 16:00–20:00
    const both = r.alerts(at(0, 13, 20));
    assert.deepEqual([...new Set(both.map((alert) => alert.key))].sort(), ['gathering:botany_cordia_resin', 'gathering:botany_iris_root']);
    for (const alert of both) assert.equal(alert.key, `gathering:${alert.data.materialKey}`);
    const armedAts = (suffix) => plain(both.filter((alert) => alert.key.endsWith(suffix)).map((alert) => alert.armedAt));
    assert.deepEqual(armedAts('iris_root'), [at(0, 13, 10), at(0, 13, 10)], '各自取自己的設定時間');
    assert.deepEqual(armedAts('cordia_resin'), [at(0, 13), at(0, 13)], '設定是 ET 10:00，再打開是 ET 13:00：取較晚的');
});

test('alerts：提早範圍內會開始的每一次都列，再加上之後的一次', () => {
    const { create } = load();
    const r = create(T);
    r.add('mining_sunwind_rock_70', at(0, 10)); // ET 00:00 與 20:00
    r.setLead(10); // 10 分鐘 = 約 ET 3 小時 26 分
    r.setEnabled(true, at(0, 10));

    // ET 21:30：20:00 那段正在進行，00:00 那段在 10 分鐘內開始（還要約 7 分鐘）：兩段都列，再加上之後的一次
    const now = at(0, 21, 30);
    assert.deepEqual(starts(r.alerts(now)), [at(0, 20), at(1, 0), at(1, 20)]);
    assert.ok(r.alerts(now).every((alert) => alert.leadMs === 600000));

    // 邊界：最後一次剛好在 leadMs 後開始（start − leadMs = now）還算在範圍內，晚 1 毫秒就不算
    const edge = at(1, 0) - 600000;
    assert.deepEqual(starts(r.alerts(edge)), [at(0, 20), at(1, 0), at(1, 20)]);
    assert.deepEqual(starts(r.alerts(edge - 1)), [at(0, 20), at(1, 0)]);

    // 提早 1 分鐘（預設）：00:00 那段還有約 7 分鐘才開始，不在範圍內，只列接下來兩次
    r.setLead(1);
    assert.deepEqual(starts(r.alerts(now)), [at(0, 20), at(1, 0)]);
    // 出現時（0 分鐘）：leadMs 是 0
    r.setLead(0);
    assert.deepEqual(starts(r.alerts(now)), [at(0, 20), at(1, 0)]);
    assert.ok(r.alerts(now).every((alert) => alert.leadMs === 0));
});

test('alerts：提早範圍內有好幾次時全部都列（一次多看一個，直到最後一個不在範圍內）', () => {
    // 合成的素材：每 ET 一小時一個 30 分鐘的時段（00:00、01:00、02:00、03:00）
    const records = ['00:00', '01:00', '02:00', '03:00'].map((time, i) => ({ ...items[0], id: `zz_${i + 1}`, time, duration: 30 }));
    const { create } = load({ records });
    const r = create(T);
    r.add('zz', at(0, 10));
    r.setLead(10); // 約 ET 3 小時 26 分：隔天 00:00、01:00、02:00、03:00 都在範圍內
    r.setEnabled(true, at(0, 10));
    assert.deepEqual(starts(r.alerts(at(0, 23, 59))), [at(1, 0), at(1, 1), at(1, 2), at(1, 3), at(2, 0)]);
    // 提早 1 分鐘：只有 00:00 那一個在範圍內（還有 ET 1 分鐘，約 3 秒），再加上之後的一次
    r.setLead(1);
    assert.deepEqual(starts(r.alerts(at(0, 23, 59))), [at(1, 0), at(1, 1)]);
});

test('alerts：時段無效的素材不產生提醒，也不影響別的素材', () => {
    const bad = { ...items[0], id: 'zz_bad', time: 'not a time', duration: 120 };
    const { create } = load({ records: [bad, ...items] });
    const r = create(T);
    r.add('zz_bad', at(0, 10));
    r.add('botany_cordia_resin', at(0, 10));
    r.setEnabled(true, at(0, 10));
    const alerts = r.alerts(at(0, 11));
    assert.equal(alerts.length, 2);
    assert.ok(alerts.every((alert) => alert.key === 'gathering:botany_cordia_resin'));
});

test('alerts 不丟例外：算不出來時是空的，排程每秒的檢查不會斷', () => {
    const { context, create } = load();
    const r = create(T);
    r.add('botany_cordia_resin', T);
    r.setEnabled(true, T);
    assert.ok(r.alerts(T).length > 0);
    vm.runInContext('GatheringMaterials.upcoming = () => { throw new Error("boom"); }', context);
    assert.doesNotThrow(() => r.alerts(T));
    assert.deepEqual(plain(r.alerts(T)), []);
});

test('alerts：現在不是有限的時間就算不出下一次，回傳空的，也不會卡在一直找下一次', () => {
    const { context, create } = load();
    const r = create(T);
    r.add('botany_cordia_resin', T);
    r.setEnabled(true, T);
    assert.ok(r.alerts(T).length > 0);
    context.r = r;
    // Infinity 會讓「最後一段還在提早範圍內」永遠成立：沒有擋住的話 alerts() 不會結束。
    // 在 vm 裡跑並設 timeout，這樣沒擋住時是測試失敗，而不是卡住整個測試
    for (const now of ['NaN', 'Infinity', '-Infinity', 'undefined', 'null', '"12"']) {
        assert.deepEqual(plain(vm.runInContext(`r.alerts(${now})`, context, { timeout: 2000 })), [], now);
    }
});

test('跟 ReminderScheduler 搭配：設定時已經開始的那一次不補，提早範圍內的等到開始，其他的提早 leadMs 響', () => {
    // 現在該響的是哪幾次（用真正的 ReminderScheduler.due()，還沒響過的）
    const dueStarts = (context, r, now) => Array.from(context.ReminderScheduler.due(r.alerts(now), now, new Set()), (alert) => alert.start);

    // ET 12:30 才設定，12:00 那一段正在進行：不補，下一次是隔天 00:00，提早 1 分鐘響
    const a = load({ scheduler: true });
    const ra = a.create(T);
    ra.setEnabled(true, at(0, 12, 30));
    ra.add('botany_cordia_resin', at(0, 12, 30));
    assert.deepEqual(dueStarts(a.context, ra, at(0, 12, 30)), []);
    assert.deepEqual(dueStarts(a.context, ra, at(0, 13)), []);
    assert.deepEqual(dueStarts(a.context, ra, at(1, 0) - 60000 - 1), []);
    assert.deepEqual(dueStarts(a.context, ra, at(1, 0) - 60000), [at(1, 0)]);
    const next = ra.alerts(at(1, 0) - 60000)[0];
    assert.equal(a.context.ReminderScheduler.fireAt(next), at(1, 0) - 60000);

    // 開始前 30 秒（已經在提早 1 分鐘的範圍內）才設定：等到開始的那一刻才響
    const b = load({ scheduler: true });
    const rb = b.create(T);
    rb.setEnabled(true, at(1, 0) - 30000);
    rb.add('botany_cordia_resin', at(1, 0) - 30000);
    assert.deepEqual(dueStarts(b.context, rb, at(1, 0) - 30000), []);
    assert.deepEqual(dueStarts(b.context, rb, at(1, 0) - 1), []);
    assert.deepEqual(dueStarts(b.context, rb, at(1, 0)), [at(1, 0)]);

    // 關掉再打開（ET 13:00，12:00 那一段還在進行）：從打開的那一刻重新算，進行中的那一次不補
    const c = load({ scheduler: true });
    const rc = c.create(T);
    rc.setEnabled(true, at(0, 9));
    rc.add('botany_cordia_resin', at(0, 9));
    assert.deepEqual(dueStarts(c.context, rc, at(0, 12) - 60000), [at(0, 12)], '開著的時候，12:00 那一次提早 1 分鐘響');
    rc.setEnabled(false, at(0, 12, 30));
    assert.deepEqual(dueStarts(c.context, rc, at(0, 12, 31)), [], '關著什麼都不響');
    rc.setEnabled(true, at(0, 13));
    assert.deepEqual(dueStarts(c.context, rc, at(0, 13)), [], '再打開時已經開始的那一次不補');
    assert.deepEqual(dueStarts(c.context, rc, at(1, 0) - 60000), [at(1, 0)]);
});
