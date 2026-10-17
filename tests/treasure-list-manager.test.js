const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------- ListManager（tools/treasure-map-finder/list-manager.js） ----------
// 在 vm 裡載入真正的 security-utils.js、coordinate-utils.js 與 list-manager.js，不需要 DOM。
// FF14Utils.getI18nText 只回傳中文預設文字（代入 {參數}），所以訊息就是程式裡寫的字；console 換成空函式，輸出不被洗版。
// localStorage 是一個 Map：
//   setItemThrows  寫入時丟例外（空間滿了、寫入被拒絕）
//   storageThrows  連讀 localStorage 都丟例外（Chrome 封鎖網站資料時是 SecurityError）。存取器要在 context 裡面定義：
//                  主機端對 sandbox 定義的存取器在 context 裡不會丟例外（typeof 變成 'undefined'、直接讀變成 ReferenceError），
//                  程式走不到它的 catch。所以先確認這個 context 裡讀 localStorage 真的會丟例外，測試的前提才成立
function createListManager({ setItemThrows = false, storageThrows = false } = {}) {
    const storage = new Map();
    const sandbox = {
        window: {},
        console: { log() {}, warn() {}, error() {} },
        FF14Utils: { getI18nText: (key, fallback, params = {}) => fallback.replace(/\{(\w+)\}/g, (_, name) => params[name]) }
    };
    const context = vm.createContext(sandbox);
    if (storageThrows) {
        vm.runInContext("Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true })", context);
        assert.throws(() => vm.runInContext('typeof localStorage', context), /SecurityError/);
    } else {
        sandbox.localStorage = {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => {
                if (setItemThrows) throw new Error('QuotaExceededError');
                storage.set(key, String(value));
            }
        };
    }
    for (const file of ['assets/js/security-utils.js', 'tools/treasure-map-finder/coordinate-utils.js', 'tools/treasure-map-finder/list-manager.js']) {
        vm.runInContext(read(file), context, { filename: file });
    }
    return { manager: vm.runInContext('new ListManager()', context), storage };
}

const tm007 = { id: 'tm_007', level: 'g17', zone: 'Urqopacha', zoneId: 'urqopacha', coords: { x: 13.7, y: 14.2, z: 0.4 } };
const tm010 = { id: 'tm_010', level: 'g17', zone: 'Urqopacha', zoneId: 'urqopacha', coords: { x: 21.6, y: 23.9, z: 1.4 } };

test('寫得進去：加入、移除、清空、匯入都回報 saved: true', () => {
    const { manager, storage } = createListManager();
    assert.equal(manager.add(tm007).saved, true);
    assert.equal(manager.import({ maps: [tm010] }, true).saved, true);
    assert.equal(manager.remove('tm_007').saved, true);
    assert.equal(manager.clear().saved, true);
    assert.equal(JSON.parse(storage.get('ff14tw_treasure_map_list')).maps.length, 0);
});

test('瀏覽器不讓寫入：照樣改記憶體裡的清單、回報 saved: false，不丟例外', () => {
    const { manager, storage } = createListManager({ setItemThrows: true });
    const added = manager.add(tm007);
    assert.deepEqual([added.success, added.saved, manager.getLength(), manager.has('tm_007')], [true, false, 1, true]);
    const imported = manager.import({ maps: [tm010] }, true);
    assert.deepEqual([imported.success, imported.saved, manager.getLength()], [true, false, 2]);
    const removed = manager.remove('tm_007');
    assert.deepEqual([removed.success, removed.saved, manager.getLength()], [true, false, 1]);
    const cleared = manager.clear();
    assert.deepEqual([cleared.success, cleared.saved, manager.getLength()], [true, false, 0]);
    assert.equal(storage.size, 0);
});

test('連 localStorage 都拿不到：一開始是空清單，之後的操作只留在記憶體', () => {
    const { manager } = createListManager({ storageThrows: true });
    assert.equal(manager.getLength(), 0);
    assert.deepEqual([manager.add(tm007).success, manager.getLength()], [true, 1]);
});

test('匯入時給了 addedBy（在隊伍裡匯入）：這次加進來的寶圖主人是 addedBy，原本就在清單裡的照舊是原本的主人；匯入的資料自己帶的 addedBy 不算數', () => {
    const { manager } = createListManager();
    manager.add(tm007, { addedBy: 'm4x' });
    const tm013 = { ...tm010, id: 'tm_013', addedBy: 'stranger' };
    // 合併：tm_007 原本就在（m4x 的），tm_010、tm_013 是新加的
    assert.equal(manager.import({ maps: [{ ...tm007, addedBy: null }, tm010, tm013] }, true, { addedBy: 'me' }).success, true);
    assert.deepEqual(Array.from(manager.getList(), (map) => [map.id, map.addedBy]), [['tm_007', 'm4x'], ['tm_010', 'me'], ['tm_013', 'me']]);
    // 取代：還在的 tm_007 照舊是 m4x 的（匯入的資料寫別人也一樣），新的 tm_022 是自己的
    const tm022 = { ...tm010, id: 'tm_022' };
    assert.equal(manager.import({ maps: [{ ...tm007, addedBy: 'stranger' }, tm022] }, false, { addedBy: 'me' }).success, true);
    assert.deepEqual(Array.from(manager.getList(), (map) => [map.id, map.addedBy]), [['tm_007', 'm4x'], ['tm_022', 'me']]);
});

test('匯入時沒給 addedBy（個人清單）：addedBy 照匯入的資料，和以前一樣', () => {
    const { manager } = createListManager();
    manager.import({ maps: [{ ...tm007, addedBy: 'someone' }, tm010] }, true);
    assert.deepEqual(Array.from(manager.getList(), (map) => [map.id, map.addedBy]), [['tm_007', 'someone'], ['tm_010', null]]);
});
