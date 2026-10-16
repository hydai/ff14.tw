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
//   storageThrows  連讀 localStorage 都丟例外（Chrome 封鎖網站資料時是 SecurityError）
function createListManager({ setItemThrows = false, storageThrows = false } = {}) {
    const storage = new Map();
    const sandbox = {
        window: {},
        console: { log() {}, warn() {}, error() {} },
        FF14Utils: { getI18nText: (key, fallback, params = {}) => fallback.replace(/\{(\w+)\}/g, (_, name) => params[name]) }
    };
    if (storageThrows) {
        Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('SecurityError'); } });
    } else {
        sandbox.localStorage = {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => {
                if (setItemThrows) throw new Error('QuotaExceededError');
                storage.set(key, String(value));
            }
        };
    }
    const context = vm.createContext(sandbox);
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
