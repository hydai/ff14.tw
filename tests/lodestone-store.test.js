const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TOOL_DIR = path.join(__dirname, '..', 'tools/lodestone-lookup');

// 這些腳本都把東西掛在 window 上，所以讓 window 指向 context 本身（同 lodestone-model.test.js）
function loadContext(files) {
    const context = vm.createContext({});
    context.window = context;
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(TOOL_DIR, file), 'utf8'), context, { filename: file });
    }
    return context;
}

// 只載入 lodestone-store.js：記憶的規則不需要 lodestone-data.js 與 lodestone-model.js
const { LodestoneStore } = loadContext(['lodestone-store.js']);
// 故意用解構取出：頁面不一定用 LodestoneStore.xxx() 的寫法呼叫，這些函式不能靠 this
const { KEYS, MAX_RECENT, readMine, writeMine, readRecent, remember, readLang, writeLang } = LodestoneStore;

// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值（不能傳 undefined）
const plain = (value) => JSON.parse(JSON.stringify(value));
// Array.from 在這邊建陣列，原型和測試裡寫的一樣
const ids = (list) => Array.from(list, (item) => item.id);

function deepFreeze(value) {
    for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
    return Object.freeze(value);
}

// ---------- 假的人（名字一律是假的）----------

const person = (id, name, overrides = {}) => ({
    id, name, world: 'Tonberry', dc: 'Elemental', avatar: `https://example.invalid/avatar/${id}.jpg`, job: null, level: null, ...overrides
});
const HIKARI = person('12345678', 'Hikari Senshi', { job: 'Bard', level: 100 });
const AOI = person('23456789', 'Aoi Mizuno', { world: 'Tiamat', dc: 'Gaia', job: 'Gladiator', level: 30 });
const KAZE = person('34567890', 'Kaze Tabibito', { world: 'Gilgamesh', dc: 'Aether' });
const MIKA = person('45678901', 'Mika Hoshino', { world: 'Zalera', dc: 'Crystal' });
const RYO = person('56789012', 'Ryo Sasaki', { world: 'Ultros', dc: 'Aether' });
// 第 n 個路人，要很多人的時候用
const fake = (n) => person(String(90000000 + n), `Player ${n}`);

// 一個人只有 id 與 name 時，我的角色讀出來補成七個欄位的樣子
const bare = (id, name) => ({ id, name, world: '', dc: '', avatar: '', job: null, level: null });

// 最近查過的那一筆：只有 id、name、world、dc、avatar 五個欄位，job 與 level 只有我的角色才存。
// 比對用 deepEqual，所以多一個 job 或 level（哪怕是 null）都會失敗
const entry = ({ id, name, world, dc, avatar }) => ({ id, name, world, dc, avatar });
// 一個人只有 id 與 name 時，最近查過讀出來補成五個欄位的樣子
const bareEntry = (id, name) => ({ id, name, world: '', dc: '', avatar: '' });

// ---------- 儲存空間的替身 ----------

// localStorage 的替身：data 是背後的 Map（initial 的值是字串），calls 記下每一次呼叫。
// 方法都不靠 this，所以可以用展開語法複製再換掉其中一個
function createStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    const calls = [];
    return {
        data,
        calls,
        getItem(key) { calls.push(['get', key]); return data.has(key) ? data.get(key) : null; },
        setItem(key, value) { calls.push(['set', key]); data.set(key, String(value)); },
        removeItem(key) { calls.push(['remove', key]); data.delete(key); }
    };
}

// 事先放進記憶的內容：物件與陣列轉成 JSON，字串照原樣放（用來放壞掉的 JSON 與顯示語言）
function stored({ mine, recent, lang } = {}) {
    const initial = {};
    const put = (key, value) => {
        if (value !== undefined) initial[key] = typeof value === 'string' ? value : JSON.stringify(value);
    };
    put(KEYS.mine, mine);
    put(KEYS.recent, recent);
    put(KEYS.lang, lang);
    return initial;
}

// 只看寫入（set 與 remove）
const writes = (storage) => storage.calls.filter(([operation]) => operation !== 'get');
const savedRecent = (storage) => JSON.parse(storage.data.get(KEYS.recent));

// ---------- 常數 ----------

test('常數：三個鍵與最多 5 個，物件與 KEYS 都是凍結的', () => {
    assert.deepEqual(plain(KEYS), { mine: 'ff14tw_lodestone_mine', recent: 'ff14tw_lodestone_recent', lang: 'ff14tw_lodestone_lang' });
    assert.equal(MAX_RECENT, 5);
    assert.equal(Object.isFrozen(LodestoneStore), true);
    assert.equal(Object.isFrozen(KEYS), true);
    assert.deepEqual(Object.keys(LodestoneStore).sort(), ['KEYS', 'MAX_RECENT', 'readLang', 'readMine', 'readRecent', 'remember', 'writeLang', 'writeMine']);
});

// ---------- 我的角色 ----------

test('我的角色：存進去讀得回來，存的是一個 JSON 物件，只留一個', () => {
    const storage = createStorage();
    assert.equal(readMine(storage), null, '第一次來');

    assert.equal(writeMine(storage, HIKARI), true);
    assert.deepEqual(plain(readMine(storage)), HIKARI);
    assert.deepEqual(JSON.parse(storage.data.get(KEYS.mine)), HIKARI);

    // 換成另一個人：蓋掉，不會變成兩個
    assert.equal(writeMine(storage, AOI), true);
    assert.deepEqual(plain(readMine(storage)), AOI);

    // 取消：整個拿掉
    assert.equal(writeMine(storage, null), true);
    assert.equal(readMine(storage), null);
    assert.equal(storage.data.has(KEYS.mine), false);
    // 本來就沒有也一樣
    assert.equal(writeMine(storage, null), true);
});

test('我的角色：整理成固定的七個欄位，缺的補空字串或 null、多的拿掉、數字的 id 轉成字串', () => {
    const defaults = { world: '', dc: '', avatar: '', job: null, level: null };
    const cases = [
        // [存的，讀出來的]
        [{ id: '1', name: 'A' }, bare('1', 'A')],
        [{ id: 12345678, name: 'A' }, bare('12345678', 'A')],
        // 欄位的型別不對：當作沒有
        [{ id: '1', name: 'A', world: 7, dc: null, avatar: {}, job: 7, level: '100' }, bare('1', 'A')],
        [{ id: '1', name: 'A', job: '', level: 0 }, bare('1', 'A')],
        [{ id: '1', name: 'A', level: -3 }, bare('1', 'A')],
        [{ id: '1', name: 'A', level: 99.5 }, bare('1', 'A')],
        // 職業鍵原樣存，基本職業的鍵也是（存的是 Worker 給的鍵，不解讀）
        [{ id: '1', name: 'A', job: 'Gladiator', level: 30 }, { id: '1', name: 'A', ...defaults, job: 'Gladiator', level: 30 }],
        [{ id: '1', name: 'A', job: 'Bard', level: 100 }, { id: '1', name: 'A', ...defaults, job: 'Bard', level: 100 }],
        // 多的欄位拿掉
        [{ id: '1', name: 'A', FreeCompany: { Name: 'Example Company' }, extra: true }, bare('1', 'A')],
        // 撇號與連字號的名字照原樣
        [{ id: '1', name: "Y'shtola Rhul", world: 'Tonberry' }, { ...bare('1', "Y'shtola Rhul"), world: 'Tonberry' }],
        [{ id: '2', name: "A'lu-ne Moku" }, bare('2', "A'lu-ne Moku")]
    ];
    for (const [input, expected] of cases) {
        const label = JSON.stringify(input);
        // 寫進去的時候整理
        const written = createStorage();
        assert.equal(writeMine(written, input), true, label);
        assert.deepEqual(plain(readMine(written)), expected, label);
        assert.deepEqual(JSON.parse(written.data.get(KEYS.mine)), expected, label);
        // 以前存的、手改過的內容，讀出來的時候也整理
        assert.deepEqual(plain(readMine(createStorage(stored({ mine: input })))), expected, label);
    }
});

test('我的角色：壞掉的內容讀出來是 null', () => {
    const broken = [
        '{oops', '', 'null', '[]', '42', '"Hikari Senshi"', 'true', '{}',
        // 少了 id 或 name，或不是非空字串
        { name: 'A' }, { id: '1' }, { id: '', name: 'A' }, { id: '1', name: '' },
        { id: null, name: 'A' }, { id: ['1'], name: 'A' }, { id: { value: '1' }, name: 'A' }, { id: '1', name: 7 }, { id: true, name: 'A' },
        // 陣列不是人，哪怕裡面放著一個好的
        [HIKARI]
    ];
    for (const mine of broken) {
        assert.equal(readMine(createStorage(stored({ mine }))), null, JSON.stringify(mine));
    }
    // getItem 對沒有的鍵回 undefined 而不是 null 的替身
    assert.equal(readMine({ getItem: () => undefined }), null);
});

test('我的角色：不合格的 person 不寫，也不會蓋掉存著的', () => {
    const storage = createStorage(stored({ mine: HIKARI, recent: [AOI] }));
    const rejected = [undefined, 'Hikari Senshi', 42, true, [], [HIKARI], {}, { id: '1' }, { name: 'A' }, { id: '', name: 'A' }, { id: '1', name: '' }, { id: NaN, name: 'A' }];
    for (const bad of rejected) {
        assert.equal(writeMine(storage, bad), false, String(JSON.stringify(bad)));
    }
    // undefined 不是「取消」：只有明確的 null 才清掉
    assert.deepEqual(writes(storage), []);
    assert.deepEqual(plain(readMine(storage)), HIKARI);
});

// ---------- 最近查過 ----------

test('最近查過：新的在前、最多 5 個，回傳新的清單', () => {
    const storage = createStorage();
    assert.deepEqual(plain(readRecent(storage)), [], '第一次來');

    const people = [1, 2, 3, 4, 5, 6, 7].map(fake);
    let expected = [];
    for (const next of people) {
        expected = [entry(next), ...expected].slice(0, MAX_RECENT);
        assert.deepEqual(plain(remember(storage, next)), expected, next.name);
        assert.deepEqual(plain(readRecent(storage)), expected, next.name);
        assert.deepEqual(savedRecent(storage), expected, next.name);
    }
    // 第 6、7 個進來時擠掉最舊的兩個
    assert.deepEqual(Array.from(readRecent(storage), (item) => item.name), ['Player 7', 'Player 6', 'Player 5', 'Player 4', 'Player 3']);
    assert.equal(readRecent(storage).length, MAX_RECENT);
});

test('最近查過：同一個人再查一次移到最前面，同一個 id 只留最新的資料', () => {
    const storage = createStorage();
    for (const next of [AOI, KAZE, MIKA]) remember(storage, next);
    assert.deepEqual(ids(readRecent(storage)), [MIKA.id, KAZE.id, AOI.id]);

    // 查中間的人：移到最前面，其他人的順序不變
    assert.deepEqual(ids(remember(storage, AOI)), [AOI.id, MIKA.id, KAZE.id]);
    // 查已經在最前面的人：還是一個
    assert.deepEqual(ids(remember(storage, AOI)), [AOI.id, MIKA.id, KAZE.id]);

    // 搬家、改名：id 一樣，取代舊的那一筆，不是多一筆
    const moved = { ...KAZE, name: 'Kaze Hoshino', world: 'Zalera', dc: 'Crystal', avatar: 'https://example.invalid/avatar/new.jpg' };
    const list = remember(storage, moved);
    assert.deepEqual(ids(list), [KAZE.id, AOI.id, MIKA.id]);
    assert.deepEqual(plain(list[0]), entry(moved));
    assert.deepEqual(savedRecent(storage), plain(list));

    // 數字的 id 與字串的 id 是同一個人
    assert.deepEqual(ids(remember(storage, { ...MIKA, id: Number(MIKA.id) })), [MIKA.id, KAZE.id, AOI.id]);
});

test('最近查過：滿了之後再查裡面的人不會擠掉別人，查新的人才擠掉最舊的', () => {
    const storage = createStorage();
    const [one, two, three, four, five, six] = [1, 2, 3, 4, 5, 6].map(fake);
    for (const next of [one, two, three, four, five]) remember(storage, next);
    assert.deepEqual(ids(readRecent(storage)), [five, four, three, two, one].map((item) => item.id));

    assert.deepEqual(ids(remember(storage, one)), [one, five, four, three, two].map((item) => item.id));
    assert.deepEqual(ids(remember(storage, six)), [six, one, five, four, three].map((item) => item.id));
});

test('最近查過：我的角色不放進來', () => {
    const storage = createStorage();
    remember(storage, KAZE);
    assert.equal(writeMine(storage, HIKARI), true);
    const before = storage.data.get(KEYS.recent);
    storage.calls.length = 0;

    // 回傳目前的清單，什麼都不寫
    assert.deepEqual(ids(remember(storage, HIKARI)), [KAZE.id]);
    // 同一個 id、資料不同（搬家了）也是我的角色
    assert.deepEqual(ids(remember(storage, { ...HIKARI, world: 'Gilgamesh', dc: 'Aether' })), [KAZE.id]);
    assert.deepEqual(ids(remember(storage, { ...HIKARI, id: Number(HIKARI.id) })), [KAZE.id]);
    assert.deepEqual(writes(storage), []);
    assert.equal(storage.data.get(KEYS.recent), before);

    // 別人照常進來
    assert.deepEqual(ids(remember(storage, MIKA)), [MIKA.id, KAZE.id]);

    // 取消我的角色之後，他就是一般的人
    assert.equal(writeMine(storage, null), true);
    assert.deepEqual(ids(remember(storage, HIKARI)), [HIKARI.id, MIKA.id, KAZE.id]);
});

test('設成我的角色時從最近查過拿掉，其他人的順序不變', () => {
    const storage = createStorage();
    for (const next of [AOI, KAZE, MIKA, RYO]) remember(storage, next);
    assert.deepEqual(ids(readRecent(storage)), [RYO.id, MIKA.id, KAZE.id, AOI.id]);

    assert.equal(writeMine(storage, KAZE), true);
    assert.deepEqual(plain(readMine(storage)), KAZE);
    assert.deepEqual(ids(readRecent(storage)), [RYO.id, MIKA.id, AOI.id]);
    // 存著的也拿掉了，不只是讀出來的時候略過
    assert.deepEqual(savedRecent(storage).map((item) => item.id), [RYO.id, MIKA.id, AOI.id]);

    // 不在最近查過裡的人：最近查過一個字都不寫
    storage.calls.length = 0;
    assert.equal(writeMine(storage, HIKARI), true);
    assert.deepEqual(writes(storage), [['set', KEYS.mine]]);
    assert.deepEqual(ids(readRecent(storage)), [RYO.id, MIKA.id, AOI.id]);

    // 最近查過是空的或根本沒有：也不丟錯
    assert.equal(writeMine(createStorage(), HIKARI), true);
    assert.equal(writeMine(createStorage(stored({ recent: '{oops' })), HIKARI), true);
});

test('最近查過：壞掉的 JSON 或不是陣列，讀出來是 []', () => {
    const broken = ['{oops', '', 'null', '{}', '42', '"Hikari Senshi"', 'true', JSON.stringify(HIKARI)];
    for (const recent of broken) {
        assert.deepEqual(plain(readRecent(createStorage(stored({ recent })))), [], recent);
    }
    assert.deepEqual(plain(readRecent({ getItem: () => undefined })), []);
    // 壞掉的清單不擋住新的：記下來之後是乾淨的
    const storage = createStorage(stored({ recent: '{oops' }));
    assert.deepEqual(ids(remember(storage, AOI)), [AOI.id]);
    assert.deepEqual(savedRecent(storage), [entry(AOI)]);
});

test('最近查過：陣列裡壞的項目丟掉、好的留下，下一次記下來時壞的清掉', () => {
    const mixed = [
        AOI, null, 7, 'text', [], [KAZE], {}, { id: '9' }, { name: 'No Id' }, { id: '', name: 'Empty Id' }, { id: '8', name: '' },
        { id: ['1'], name: 'List Id' }, KAZE, { id: 67890123, name: 'Number Id' }
    ];
    const storage = createStorage(stored({ recent: mixed }));
    assert.deepEqual(plain(readRecent(storage)), [entry(AOI), entry(KAZE), bareEntry('67890123', 'Number Id')]);

    const list = remember(storage, MIKA);
    assert.deepEqual(ids(list), [MIKA.id, AOI.id, KAZE.id, '67890123']);
    assert.deepEqual(savedRecent(storage), plain(list));
});

test('最近查過：存著的清單有重複、超過 5 個或含我的角色時，讀出來也整理好', () => {
    const [one, two, three, four, five, six, seven] = [1, 2, 3, 4, 5, 6, 7].map(fake);
    const older = { ...one, name: 'Player 1 (older)' };
    // 重複的留第一個（最新的）；第三個人是我的角色；整理完剩下的取前 5 個
    const storage = createStorage(stored({ recent: [one, two, older, three, four, five, six, seven], mine: three }));
    assert.deepEqual(plain(readRecent(storage)), [one, two, four, five, six].map(entry));
    assert.equal(readRecent(storage).length, MAX_RECENT);
    assert.deepEqual(plain(readMine(storage)), three);
});

test('最近查過：不合格的 person 不記，回傳目前的清單', () => {
    const storage = createStorage(stored({ recent: [AOI, KAZE] }));
    const rejected = [undefined, null, 'Hikari Senshi', 42, [], [HIKARI], {}, { id: '1' }, { name: 'A' }, { id: '', name: 'A' }, { id: '1', name: '' }, { id: NaN, name: 'A' }];
    for (const bad of rejected) {
        assert.deepEqual(ids(remember(storage, bad)), [AOI.id, KAZE.id], String(JSON.stringify(bad)));
    }
    assert.deepEqual(writes(storage), []);

    // 只有 id 與 name 也記得下來，其他欄位補成空的
    assert.deepEqual(plain(remember(storage, { id: '77', name: 'Bare Bones' })), [bareEntry('77', 'Bare Bones'), entry(AOI), entry(KAZE)]);
});

test('最近查過只存 id、name、world、dc、avatar 五個欄位，job 與 level 只有我的角色才存', () => {
    // 記下來：帶著 job 與 level 的人（LodestoneModel.person() 的結果）也只存五個欄位，回傳與讀出來的也是
    const storage = createStorage();
    assert.equal(AOI.job, 'Gladiator');
    assert.deepEqual(plain(remember(storage, AOI)), [entry(AOI)]);
    assert.deepEqual(savedRecent(storage), [entry(AOI)]);
    assert.deepEqual(plain(readRecent(storage)), [entry(AOI)]);
    // job 與 level 是 null 的人也不多存這兩個欄位
    assert.deepEqual(plain(remember(storage, KAZE)), [entry(KAZE), entry(AOI)]);
    assert.deepEqual(savedRecent(storage), [entry(KAZE), entry(AOI)]);

    // 以前存的項目帶著 job 與 level：讀出來去掉
    const older = createStorage(stored({ recent: [AOI, HIKARI, KAZE] }));
    assert.deepEqual(plain(readRecent(older)), [entry(AOI), entry(HIKARI), entry(KAZE)]);
    // 下一次記下來，整份清單寫回去也是五個欄位
    assert.deepEqual(plain(remember(older, MIKA)), [entry(MIKA), entry(AOI), entry(HIKARI), entry(KAZE)]);
    assert.deepEqual(savedRecent(older), [entry(MIKA), entry(AOI), entry(HIKARI), entry(KAZE)]);

    // 設成我的角色時把他從舊清單拿掉，其他人寫回去也是五個欄位
    const cleaned = createStorage(stored({ recent: [AOI, HIKARI, KAZE] }));
    assert.equal(writeMine(cleaned, HIKARI), true);
    assert.deepEqual(savedRecent(cleaned), [entry(AOI), entry(KAZE)]);
    assert.deepEqual(plain(readRecent(cleaned)), [entry(AOI), entry(KAZE)]);

    // 我的角色照舊七個欄位，job 與 level 都在（包括是 null 的人）
    for (const who of [AOI, HIKARI, KAZE]) {
        const mine = createStorage();
        assert.equal(writeMine(mine, who), true, who.name);
        assert.deepEqual(plain(readMine(mine)), who, who.name);
        assert.deepEqual(JSON.parse(mine.data.get(KEYS.mine)), who, who.name);
    }
});

// ---------- 名稱與成就顯示的語言 ----------

test('顯示語言：只認 en 與 ja，存成純字串', () => {
    const storage = createStorage();
    assert.equal(readLang(storage), null, '第一次來');

    assert.equal(writeLang(storage, 'ja'), true);
    assert.equal(storage.data.get(KEYS.lang), 'ja', '純字串，不是 JSON');
    assert.equal(readLang(storage), 'ja');
    assert.equal(writeLang(storage, 'en'), true);
    assert.equal(storage.data.get(KEYS.lang), 'en');
    assert.equal(readLang(storage), 'en');

    // 不認得的語言不寫，存著的不動
    storage.calls.length = 0;
    for (const bad of ['zh', 'EN', 'ja ', ' ja', '', 'null', null, undefined, 7, true, {}, ['ja']]) {
        assert.equal(writeLang(storage, bad), false, String(JSON.stringify(bad)));
    }
    assert.deepEqual(writes(storage), []);
    assert.equal(readLang(storage), 'en');

    // 存著的不是 en 或 ja：當作沒存過
    for (const lang of ['zh', 'EN', 'Ja', '"ja"', '', ' ja', 'ja ', '{}', 'null', 'undefined']) {
        assert.equal(readLang(createStorage(stored({ lang }))), null, JSON.stringify(lang));
    }
    assert.equal(readLang({ getItem: () => undefined }), null);
});

test('三樣東西各存各的：改一樣不動另外兩樣', () => {
    const storage = createStorage();
    writeMine(storage, HIKARI);
    remember(storage, AOI);
    writeLang(storage, 'ja');
    assert.deepEqual([...storage.data.keys()].sort(), [KEYS.lang, KEYS.mine, KEYS.recent].sort());

    writeLang(storage, 'en');
    remember(storage, KAZE);
    assert.deepEqual(plain(readMine(storage)), HIKARI);
    assert.deepEqual(ids(readRecent(storage)), [KAZE.id, AOI.id]);
    assert.equal(readLang(storage), 'en');

    writeMine(storage, null);
    assert.deepEqual(ids(readRecent(storage)), [KAZE.id, AOI.id]);
    assert.equal(readLang(storage), 'en');
});

// ---------- 讀寫丟例外 ----------

// 儲存空間壞掉的各種樣子（瀏覽器封鎖網站資料、容量已滿、頁面拿不到 localStorage）。
// readable：讀得出存著的內容；writable：寫得進去；touches：替身會記下被碰了幾次（touched），
// 用來確認程式真的碰到了例外並吞掉，而不是根本沒去讀寫
const blocked = (touched, name) => () => { touched.push(name); throw new Error(`${name} blocked`); };
const BROKEN_STORAGES = [
    {
        name: 'getItem 丟例外', readable: false, writable: true, touches: true,
        make: (initial, touched) => ({ ...createStorage(initial), getItem: blocked(touched, 'getItem') })
    },
    {
        name: 'setItem 與 removeItem 丟例外（容量已滿）', readable: true, writable: false, touches: true,
        make: (initial, touched) => ({ ...createStorage(initial), setItem: blocked(touched, 'setItem'), removeItem: blocked(touched, 'removeItem') })
    },
    {
        name: '三個方法都丟例外', readable: false, writable: false, touches: true,
        make: (_initial, touched) => ({ getItem: blocked(touched, 'getItem'), setItem: blocked(touched, 'setItem'), removeItem: blocked(touched, 'removeItem') })
    },
    {
        // Chrome 封鎖網站資料時，光是讀 window.localStorage 就丟 SecurityError：拿到的東西碰哪個屬性都丟例外
        name: '光是存取就丟例外', readable: false, writable: false, touches: true,
        make: (_initial, touched) => new Proxy({}, { get(_target, property) { touched.push(String(property)); throw new Error('SecurityError'); } })
    },
    { name: '沒有儲存空間（null）', readable: false, writable: false, touches: false, make: () => null },
    { name: '沒有儲存空間（undefined）', readable: false, writable: false, touches: false, make: () => undefined }
];

test('讀寫丟例外時照常運作：讀到預設值、寫回 false、不丟錯', () => {
    const initial = stored({ mine: HIKARI, recent: [AOI, KAZE], lang: 'ja' });
    for (const mode of BROKEN_STORAGES) {
        const touched = [];
        const make = () => mode.make(initial, touched);
        const label = mode.name;

        // 讀：讀不到就是預設值（讀得到的照常讀）
        const mine = readMine(make());
        assert.deepEqual(mine === null ? null : plain(mine), mode.readable ? HIKARI : null, label);
        assert.deepEqual(ids(readRecent(make())), mode.readable ? [AOI.id, KAZE.id] : [], label);
        assert.equal(readLang(make()), mode.readable ? 'ja' : null, label);

        // 寫：寫不進去回傳 false
        assert.equal(writeMine(make(), MIKA), mode.writable, label);
        assert.equal(writeMine(make(), null), mode.writable, label);
        assert.equal(writeLang(make(), 'en'), mode.writable, label);

        // 記下最近查過：清單照算，只是記不住
        assert.deepEqual(ids(remember(make(), MIKA)), mode.readable ? [MIKA.id, AOI.id, KAZE.id] : [MIKA.id], label);
        // 我的角色讀得到時，他照樣不進清單
        assert.deepEqual(ids(remember(make(), HIKARI)), mode.readable ? [AOI.id, KAZE.id] : [HIKARI.id], label);

        if (mode.touches) assert.ok(touched.length > 0, `${label}：替身沒有被碰到，測試可能失效`);
    }
});

test('寫不進去：回傳新的清單，存著的一個字都不動', () => {
    const storage = { ...createStorage(stored({ mine: HIKARI, recent: [AOI, KAZE], lang: 'ja' })), setItem() { throw new Error('QuotaExceededError'); } };
    const before = JSON.stringify([...storage.data]);

    assert.deepEqual(ids(remember(storage, MIKA)), [MIKA.id, AOI.id, KAZE.id]);
    assert.equal(writeMine(storage, AOI), false);
    assert.equal(writeLang(storage, 'en'), false);
    assert.equal(JSON.stringify([...storage.data]), before);
    // 沒存成我的角色，就還在最近查過裡
    assert.deepEqual(ids(readRecent(storage)), [AOI.id, KAZE.id]);
    assert.deepEqual(plain(readMine(storage)), HIKARI);
});

// ---------- 不改輸入、接上 LodestoneModel ----------

test('不改傳進來的東西，傳深層凍結的 person 也行', () => {
    const frozen = deepFreeze({ ...HIKARI });
    const snapshot = JSON.stringify(frozen);
    const storage = createStorage();
    assert.equal(writeMine(storage, frozen), true);
    assert.deepEqual(plain(readMine(storage)), HIKARI);
    assert.deepEqual(ids(remember(storage, deepFreeze({ ...AOI, extra: { nested: true } }))), [AOI.id]);
    assert.deepEqual(ids(remember(storage, deepFreeze({ ...frozen }))), [AOI.id], '我的角色不進清單');
    assert.deepEqual(ids(remember(storage, deepFreeze({ ...KAZE }))), [KAZE.id, AOI.id]);
    assert.equal(JSON.stringify(frozen), snapshot);
});

test('接上 LodestoneModel.person()：存的那一筆讀回來一樣', () => {
    const context = loadContext(['lodestone-data.js', 'lodestone-model.js', 'lodestone-store.js']);
    const { LodestoneModel, LodestoneStore: store } = context;
    const server = { World: 'Tonberry', DC: 'Elemental' };
    const characters = [
        { ID: 12345678, Name: 'Hikari Senshi', Server: server, Avatar: 'https://example.invalid/avatar/1.jpg', ActiveClassJob: { Key: 'Bard', Level: 100 } },
        // 基本職業、認不出職業圖示（Key 是 null）、舊 Worker 沒有 ActiveClassJob
        { ID: 23456789, Name: 'Aoi Mizuno', Server: server, Avatar: 'https://example.invalid/avatar/2.jpg', ActiveClassJob: { Key: 'Gladiator', Level: 30 } },
        { ID: 34567890, Name: 'Kaze Tabibito', Server: server, Avatar: '', ActiveClassJob: { Key: null, Level: 12, Icon: 'https://example.invalid/icon.png' } },
        { ID: 45678901, Name: 'Mika Hoshino', Server: server, Avatar: 'https://example.invalid/avatar/4.jpg' }
    ];
    const people = characters.map((character) => LodestoneModel.person(character));
    assert.deepEqual(people.map((who) => who.job), ['Bard', 'Gladiator', null, null]);

    // 每一個 person() 的結果作為我的角色原樣存得進去、讀得回來（七個欄位）
    for (const who of people) {
        const storage = createStorage();
        assert.equal(store.writeMine(storage, who), true, who.name);
        assert.deepEqual(plain(store.readMine(storage)), plain(who), who.name);
    }
    // 作為最近查過：新的在前，只留 id、name、world、dc、avatar 五個欄位
    const storage = createStorage();
    for (const who of people) store.remember(storage, who);
    assert.deepEqual(plain(store.readRecent(storage)), plain(people).reverse().map(entry));
});
