const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const items = require('../data/timed-gathering.json').items;
const root = path.resolve(__dirname, '..');

// Keep browser globals isolated while executing the real modules. The page itself (the controller in script.js)
// runs on the fake DOM in tests/timed-gathering-page.test.js, so only what these modules touch is provided here:
// localStorage (ListManager), FF14Utils.getI18nText (ListManager's messages) and console.error (ListManager's failures).
function createEnvironment() {
    const storage = new Map();
    const context = vm.createContext({
        console: { error() {} },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        FF14Utils: { getI18nText: (key, fallback, values = {}) => fallback.replace(/\{(\w+)\}/g, (_, name) => values[name]) }
    });
    context.window = context;
    for (const file of ['time-calculator', 'gathering-materials', 'list-manager', 'macro-exporter', 'search-filter'].map(name => `tools/timed-gathering/${name}.js`)) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
    const classes = vm.runInContext('({ TimeCalculator, GatheringMaterials, ListManager, MacroExporter, SearchFilter })', context);
    return { context, ...classes, storage };
}

const clone = value => JSON.parse(JSON.stringify(value));

test('nested invalid backups and capacity overflow cannot partially modify lists or storage', () => {
    const env = createEnvironment();
    const manager = new env.ListManager();
    manager.addToList('default', items[0]);
    const original = JSON.stringify(manager.exportLists());
    const stored = env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY);
    const mutations = [
        data => { data.lists = []; },
        data => { data.lists.default = null; },
        data => { data.lists.default.items = {}; },
        data => { data.lists.default.name = ''; },
        data => { data.lists.default.id = 'other'; },
        data => { data.lists.default.items[0].time = '99:00'; },
        data => { data.lists.default.items[0].duration = '55'; },
        data => { data.lists.default.items[0].name = {}; },
        data => { data.lists.default.items.push(clone(data.lists.default.items[0])); },
        data => { data.lists.default.items = Array.from({ length: 101 }, (_, i) => ({ ...items[0], id: `item_${i}` })); },
        data => { data.lists.bad = { id: 'bad', name: 'Bad', items: [null] }; },
        data => { data.lists = JSON.parse('{"__proto__":{"id":"__proto__","name":"Bad","items":[]}}'); }
    ];
    for (const mutate of mutations) {
        const data = JSON.parse(original);
        mutate(data);
        assert.equal(manager.importLists(data).success, false);
        assert.deepEqual(clone(manager.exportLists()).lists, JSON.parse(original).lists);
        assert.equal(env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY), stored);
    }
    const full = { version: '1.0', lists: {} };
    for (let i = 0; i < 10; i++) full.lists[`list_${i}`] = { id: `list_${i}`, name: `List ${i}`, items: [] };
    assert.equal(manager.importLists(full).success, false);
    assert.equal(manager.getAllLists().length, 1);
});

test('failed storage writes leave an import unapplied, and malformed saved backups remain recoverable', () => {
    const env = createEnvironment();
    const manager = new env.ListManager();
    const before = clone(manager.exportLists()).lists;
    env.context.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
    assert.equal(manager.importLists(manager.exportLists()).success, false);
    assert.deepEqual(clone(manager.exportLists()).lists, before);
    env.storage.set(env.ListManager.CONSTANTS.STORAGE_KEY, '{broken');
    const recovered = new env.ListManager();
    assert.equal(recovered.getAllLists().length, 1);
    assert.equal(env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY), '{broken');
});

test('a full ten-list backup can restore into a fresh browser without losing a list to the placeholder', () => {
    const sourceEnv = createEnvironment();
    const source = new sourceEnv.ListManager();
    for (let i = 1; i < 10; i++) source.createList(`List ${i}`);
    for (const list of source.getAllLists()) source.addToList(list.id, items[0]);
    const destinationEnv = createEnvironment();
    const destination = new destinationEnv.ListManager();
    assert.equal(destination.importLists(clone(source.exportLists())).success, true);
    assert.equal(destination.getAllLists().length, 10);
    for (const list of source.getAllLists()) {
        assert.equal(destination.getList(list.id).name, list.name);
        assert.deepEqual(clone(destination.getList(list.id).items), clone(list.items));
    }
});

test('legacy import collision names normalize without losing saved lists, items or valid names', () => {
    const env = createEnvironment();
    const source = new env.ListManager();
    source.addToList('default', items[0]);
    const originalList = clone(source.exportLists()).lists.default;
    const base = 'A'.repeat(50);
    const boundedCollision = `${'A'.repeat(46)} (1)`;
    const names = [base, `${base} (1)`, boundedCollision, `${base} (1) (1)`];
    const backup = { version: '1.0', lists: Object.fromEntries(names.map((name, index) => [
        `legacy_${index}`, { ...clone(originalList), id: `legacy_${index}`, name }
    ])) };
    const stored = JSON.stringify(backup);
    env.storage.set(env.ListManager.CONSTANTS.STORAGE_KEY, stored);
    const loaded = new env.ListManager();
    assert.equal(loaded.storageLoadFailed, false);
    assert.equal(loaded.getAllLists().length, names.length);
    assert.equal(loaded.getList('legacy_0').name, base);
    assert.equal(loaded.getList('legacy_2').name, boundedCollision);
    assert.equal(new Set(loaded.getAllLists().map(list => list.name)).size, names.length);
    for (const list of loaded.getAllLists()) {
        assert.ok(list.name.length <= 50);
        assert.deepEqual(clone(list.items), originalList.items);
    }
    assert.equal(env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY), stored, 'loading does not overwrite the original backup');
    loaded.addToList('legacy_1', items[1]);
    const reloaded = new env.ListManager();
    assert.equal(reloaded.getAllLists().length, names.length);
    assert.equal(reloaded.getList('legacy_1').items.length, 2);
    const fresh = new (createEnvironment().ListManager)();
    assert.equal(fresh.importLists(backup).success, true);
    assert.equal(fresh.getAllLists().length, names.length);
});

test('an untouched default remains replaceable after language changes and reloads, including legacy storage', () => {
    const full = { version: '1.0', lists: {} };
    for (let i = 0; i < 10; i++) full.lists[`list_${i}`] = { id: `list_${i}`, name: `List ${i}`, items: [] };
    for (const defaultName of ['預設清單', 'デフォルトリスト', 'Default List']) {
        for (const legacy of [false, true]) {
            const env = createEnvironment();
            const translate = env.context.FF14Utils.getI18nText;
            env.context.FF14Utils.getI18nText = (key, ...args) => key === 'defaultListName' ? defaultName : translate(key, ...args);
            const fresh = new env.ListManager();
            if (legacy) {
                const stored = clone(fresh.exportLists());
                delete stored.lists.default.isPlaceholder;
                env.storage.set(env.ListManager.CONSTANTS.STORAGE_KEY, JSON.stringify(stored));
            }
            env.context.FF14Utils.getI18nText = (key, ...args) => key === 'defaultListName' ? 'Changed language' : translate(key, ...args);
            const reloaded = new env.ListManager();
            assert.equal(reloaded.importLists(full).success, true, `${defaultName}, legacy=${legacy}`);
            assert.equal(reloaded.getAllLists().length, 10);
        }
    }
});

test('a renamed or previously used default list is preserved even when it is empty again', () => {
    const full = { version: '1.0', lists: {} };
    for (let i = 0; i < 10; i++) full.lists[`list_${i}`] = { id: `list_${i}`, name: `List ${i}`, items: [] };
    for (const edit of [
        manager => { manager.renameList('default', 'My list'); manager.renameList('default', 'Default List'); },
        manager => { manager.addToList('default', items[0]); manager.clearList('default'); }
    ]) {
        const env = createEnvironment();
        edit(new env.ListManager());
        const reloaded = new env.ListManager();
        const before = env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY);
        assert.equal(reloaded.importLists(full).success, false);
        assert.equal(reloaded.getAllLists().length, 1);
        assert.equal(env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY), before);
    }
});

test('ranged and all-day schedules agree across gathering windows, sorting and alarm export', () => {
    const env = createEnvironment();
    const exporter = new env.MacroExporter();
    // ET times are written as "offset ET days from the day containing T, at hours:minutes"
    const T = 1_760_000_000_000;
    const day = Math.floor(T / 4_200_000);
    const at = (offset, hours, minutes = 0) => Math.round(((day + offset) * 1440 + hours * 60 + minutes) * (175000 / 60));
    // The duration field is ignored when time is a range, so 55 must not shorten these windows
    const kindAt = (time, duration, now) => env.GatheringMaterials.state(
        env.GatheringMaterials.group([{ ...items[0], id: 'x_1', time, duration }])[0], now
    ).kind;
    assert.equal(kindAt('22:00-00:00', 55, at(0, 23, 59)), 'now');
    assert.equal(kindAt('22:00-00:00', 55, at(1, 0)), 'next');
    assert.equal(kindAt('22:00-02:00', 55, at(0, 1)), 'now');
    assert.equal(kindAt('全天', 1440, at(0, 13)), 'allday');
    const selected = items.filter(item => ['mining_lightning_quartz', 'botany_iris_root', 'fishing_purple_tongue'].includes(item.id));
    const macro = exporter.generate([...selected].reverse());
    assert.equal(macro.split('\n')[0], '/alarm clear');
    assert.match(macro.split('\n')[1], /et rp 0000 /);
    assert.match(macro.split('\n')[2], /et rp 1600 /);
    assert.equal(macro.split('\n').length, 3);
    for (const generate of ['generate', 'generateSimplified']) {
        assert.equal(exporter[generate]([{ ...items[0], time: '全天', duration: 1440 }]), '');
        assert.equal(exporter[generate]([{ ...items[0], time: '99:00' }]), '');
    }
    for (const time of ['25:00', '12:60', '22:00-24:01', 'bad']) assert.equal(env.TimeCalculator.parseSchedule(time), null);
    assert.equal(new env.SearchFilter().parseTime('16:00-20:00'), 960);
});

test('generateOneTimeAlarm: the list-export line minus rp; null for all-day and invalid times; the description when there is no macroFormat', () => {
    const env = createEnvironment();
    const exporter = new env.MacroExporter();
    const byId = id => items.find(item => item.id === id);
    const cordia = byId('botany_cordia_resin_2');

    // 兩個時段的素材各自一行，開始時間寫在 et 後面；沒有 rp
    assert.equal(exporter.generateOneTimeAlarm(cordia), '/alarm "園/樹液/マムーク/コーディア樹液塊" et 1200 1 se04 mute');
    assert.equal(exporter.generateOneTimeAlarm(byId('botany_cordia_resin_1')), '/alarm "園/樹液/マムーク/コーディア樹液塊" et 0000 1 se04 mute');
    // 區間（00:00-04:00）用開始時間
    assert.equal(
        exporter.generateOneTimeAlarm(byId('mining_lightning_quartz')),
        '/alarm "採/石/レイノード・ウィンド/ライトニングクォーツ" et 0000 1 se04 mute'
    );
    assert.equal(exporter.generateOneTimeAlarm(cordia, 'se02'), '/alarm "園/樹液/マムーク/コーディア樹液塊" et 1200 1 se02 mute');

    // 全天與時間無效：沒有鬧鐘可設
    assert.equal(exporter.generateOneTimeAlarm(byId('fishing_purple_tongue')), null);
    for (const time of ['99:00', '12:60', 'bad']) assert.equal(exporter.generateOneTimeAlarm({ ...cordia, time }), null, time);

    // 沒有 macroFormat 時用描述（類型/等級/地點/名稱），和 generateAlarmCommand() 拿掉 rp 的結果一樣
    const plain = { ...cordia, macroFormat: undefined };
    assert.equal(exporter.generateOneTimeAlarm(plain), '/alarm "園/Lv110/瑪姆克/科迪亞樹液塊" et 1200 1 se04 mute');
    assert.equal(exporter.generateOneTimeAlarm(plain), exporter.generateAlarmCommand(plain).replace(' et rp ', ' et '));
    // 資料裡的每一筆都是：和 generateAlarmCommand() 只差一個 rp（全天的兩邊都是 null）
    for (const item of items) {
        const repeating = exporter.generateAlarmCommand(item);
        assert.equal(exporter.generateOneTimeAlarm(item), repeating && repeating.replace(' et rp ', ' et '), item.id);
    }

    // 整份清單的巨集匯出沒有改：每一行鬧鐘仍然有 et rp（超過 15 行時分組的標題行不算）
    const alarms = exporter.generate(items).split('\n').filter(line => line.startsWith('/alarm "'));
    assert.equal(alarms.length, items.filter(item => item.time !== '全天').length);
    assert.ok(alarms.every(line => line.includes(' et rp ')), '每一行都有 et rp');
});
