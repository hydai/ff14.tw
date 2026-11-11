const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SHARED = 'assets/js/ff14-game-data.js';
const STATE_FILE = 'tools/character-card/card-state.js';

// 這些腳本都把東西掛在 window 上，所以讓 window 指向 context 本身（同 dungeon-list.test.js）。
// 每個 context 各載一份，改了其中一個不會影響另一個。
// withoutSegmenter：模擬沒有 Intl.Segmenter 的舊瀏覽器（Firefox 125 以前）：腳本載入時才決定怎麼切字，
// 所以要在載入之前把這個 context 的 Intl.Segmenter 拿掉（Intl 是每個 context 各一份，不影響別的）
function loadContext(files, { withoutSegmenter = false } = {}) {
    const context = vm.createContext({});
    context.window = context;
    if (withoutSegmenter) {
        vm.runInContext('delete Intl.Segmenter', context);
        assert.equal(vm.runInContext('typeof Intl.Segmenter', context), 'undefined');
    }
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    }
    return context;
}

// 職業清單是共用的 ff14-game-data.js（深層凍結），當 jobs 參數傳進去；card-state.js 自己不讀那個全域
const context = loadContext([SHARED, STATE_FILE]);
const { CardState } = context;
const jobs = context.FF14_JOBS;
// 故意用解構取出：頁面不一定用 CardState.xxx() 的寫法呼叫，這些函式不能靠 this
const {
    STORAGE_KEY, IMAGE_KEY, LIMITS, LIKES, LOOKING, DAYS, SLOTS, GCS, FORMATS, STYLES, ROLE_COLORS,
    defaults, normalize, validate, roleOf, accentOf, cropKey, cropOf, load, save, saveImage, clear
} = CardState;

// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值（不能傳 undefined）
const plain = (value) => JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
    for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
    return Object.freeze(value);
}

// 預設的狀態：一個欄位都沒填
const EXPECTED_DEFAULTS = {
    v: 1, name: '', world: '', mainJob: '', level: 100, subJobs: [], title: '', fcName: '', fcTag: '', gc: '',
    hours: [], likes: [], looking: [], intro: '', contact: '', accent: 'auto', style: 'b', format: 'landscape', crops: {}
};

// 每個欄位都填好、都合格的狀態（名字一律是虛構的）；normalize() 要原封不動讀回來
const LUNA = {
    v: 1,
    name: 'Luna Starweaver',
    world: '伊弗利特',
    mainJob: 'Pictomancer',
    level: 98,
    subJobs: ['Paladin', 'WhiteMage'],
    title: 'Dawn Seeker',
    fcName: 'Starlit Hall',
    fcTag: 'STAR',
    gc: 'twinAdder',
    hours: ['weekday-evening', 'weekend-morning'],
    likes: ['msq', 'glamour', 'photo'],
    looking: ['friends'],
    intro: 'Hello from the Starlit Hall!',
    contact: 'Discord: luna.example',
    accent: '#123456',
    style: 'b',
    format: 'portrait',
    crops: {
        'b-landscape': { x: 0.25, y: -0.5, zoom: 1.5 },
        'b-portrait': { x: -1, y: 1, zoom: 3 }
    }
};

// 縮過的 JPEG dataURL 的替身
const IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';

// ---------- 儲存空間的替身 ----------

// localStorage 的替身：data 是背後的 Map（initial 的值是字串），calls 記下每一次呼叫。
// 方法要用 storage 本身呼叫（和真的 Storage 一樣，拿出來單獨呼叫會丟 TypeError）
function createStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    const calls = [];
    const brand = (self) => {
        if (self !== storage) throw new TypeError('Illegal invocation');
    };
    const storage = {
        data,
        calls,
        getItem(key) { brand(this); calls.push(['get', key]); return data.has(key) ? data.get(key) : null; },
        setItem(key, value) { brand(this); calls.push(['set', key]); data.set(key, String(value)); },
        removeItem(key) { brand(this); calls.push(['remove', key]); data.delete(key); }
    };
    return storage;
}

// 讀得到、寫不進去：容量已滿
function createFullStorage(initial = {}) {
    const storage = createStorage(initial);
    storage.setItem = (key) => {
        storage.calls.push(['set', key]);
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    return storage;
}

// 封鎖網站資料：每一個操作都丟例外
function createBlockedStorage() {
    const fail = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    return { getItem: fail, setItem: fail, removeItem: fail };
}

// 只看寫入（set 與 remove）
const writes = (storage) => storage.calls.filter(([operation]) => operation !== 'get');

// ---------- 常數 ----------

test('defaults 的形狀與 LIMITS、LIKES 等常數', () => {
    assert.deepEqual(plain(defaults()), EXPECTED_DEFAULTS);

    // 每次都是新的：改了其中一個的陣列與 crops，下一個不受影響
    const first = defaults();
    first.name = 'Luna Starweaver';
    first.subJobs.push('Paladin');
    first.hours.push('weekday-evening');
    first.likes.push('msq');
    first.looking.push('fc');
    first.crops['b-landscape'] = { x: 1, y: 1, zoom: 2 };
    assert.notEqual(defaults(), first);
    assert.deepEqual(plain(defaults()), EXPECTED_DEFAULTS);

    assert.equal(STORAGE_KEY, 'ff14tw_character_card');
    assert.equal(IMAGE_KEY, 'ff14tw_character_card_image');
    assert.deepEqual(plain(LIMITS), {
        name: 21, world: 20, title: 30, fcName: 20, fcTag: 5, intro: 60, contact: 40, likes: 6, subJobs: 3, levelMin: 1, levelMax: 100
    });
    assert.deepEqual(plain(LIKES), [
        'msq', 'leveling', 'trials', 'savage', 'ultimate', 'alliance', 'pvp', 'crafting',
        'gathering', 'treasure', 'deepDungeon', 'housing', 'glamour', 'photo', 'roleplay', 'fishing'
    ]);
    assert.deepEqual(plain(LOOKING), ['static', 'fc', 'friends']);
    assert.deepEqual(plain(DAYS), ['weekday', 'weekend']);
    assert.deepEqual(plain(SLOTS), ['morning', 'afternoon', 'evening', 'lateNight']);
    assert.deepEqual(plain(GCS), ['maelstrom', 'twinAdder', 'immortalFlames']);
    assert.deepEqual(plain(FORMATS), ['landscape', 'portrait']);
    // 風格：名片 a、海報 b、資訊卡 c（預設是海報，見 EXPECTED_DEFAULTS）
    assert.deepEqual(plain(STYLES), ['a', 'b', 'c']);
    assert.deepEqual(plain(ROLE_COLORS), {
        tank: '#4f74d6', healer: '#3f9e5c', dps: '#d4574e', crafting: '#8a63d2', gathering: '#c99a2e'
    });
    // 選項不重複（重複的話去重後的數量會對不上）
    for (const list of [LIKES, LOOKING, DAYS, SLOTS, GCS, FORMATS, STYLES]) {
        assert.equal(new Set(list).size, list.length);
    }

    // 常數與模組本身都凍結；模組只有規定的這些成員
    for (const [name, value] of Object.entries({ LIMITS, LIKES, LOOKING, DAYS, SLOTS, GCS, FORMATS, STYLES, ROLE_COLORS })) {
        assert.equal(Object.isFrozen(value), true, `${name} 要凍結`);
    }
    assert.equal(Object.isFrozen(CardState), true);
    assert.deepEqual(Object.keys(CardState).sort(), [
        'DAYS', 'FORMATS', 'GCS', 'IMAGE_KEY', 'LIKES', 'LIMITS', 'LOOKING', 'ROLE_COLORS', 'SLOTS', 'STORAGE_KEY', 'STYLES',
        'accentOf', 'clear', 'cropKey', 'cropOf', 'defaults', 'load', 'normalize', 'roleOf', 'save', 'saveImage', 'validate'
    ]);

    // 只掛 CardState 一個全域：常數與小函式都收在立即執行的函式裡，不會和頁面其他腳本的名稱撞在一起
    const alone = loadContext([STATE_FILE]);
    assert.deepEqual(Object.keys(alone).filter((name) => name !== 'window'), ['CardState']);
});

// ---------- normalize ----------

test('normalize：壞掉的內容變回預設、丟掉壞的部分', () => {
    // 不是物件（或是陣列）：整個是預設，連 jobs 都沒傳也一樣
    assert.deepEqual(plain(normalize(null)), EXPECTED_DEFAULTS);
    assert.deepEqual(plain(normalize('x')), EXPECTED_DEFAULTS);
    for (const raw of [null, undefined, 'x', '', 42, true, [], ['name'], () => {}]) {
        assert.deepEqual(plain(normalize(raw, jobs)), EXPECTED_DEFAULTS, util.inspect(raw));
    }
    assert.deepEqual(plain(normalize({}, jobs)), EXPECTED_DEFAULTS);

    // 字串：超過上限切掉、沒超過原樣；不是字串是 ''
    assert.equal(normalize({ name: 'a'.repeat(30) }, jobs).name.length, 21);
    for (const [field, limit] of Object.entries({ name: 21, world: 20, title: 30, fcName: 20, fcTag: 5, intro: 60, contact: 40 })) {
        assert.equal(LIMITS[field], limit, `${field} 的上限`);
        assert.equal(normalize({ [field]: 'a'.repeat(limit + 1) }, jobs)[field], 'a'.repeat(limit), `${field} 超過上限`);
        assert.equal(normalize({ [field]: 'a'.repeat(limit) }, jobs)[field], 'a'.repeat(limit), `${field} 剛好上限`);
        assert.equal(normalize({ [field]: 'a' }, jobs)[field], 'a', `${field} 沒超過`);
        for (const bad of [7, null, undefined, true, ['a'], { a: 1 }]) {
            assert.equal(normalize({ [field]: bad }, jobs)[field], '', `${field}：${util.inspect(bad)}`);
        }
    }

    // level：有限的數字或數字的字串，四捨五入、夾在 1～100；其他都是 100
    for (const [input, expected] of [
        [0, 1], [-5, 1], [1, 1], [100, 100], [150, 100], [80, 80], ['80', 80], [' 80 ', 80],
        [79.6, 80], [0.4, 1], ['80.4', 80], ['150', 100], ['0', 1], ['-3', 1], ['+80', 80], ['5.', 5], ['.5e2', 50],
        // <input type="number"> 的值可以寫成 5e1
        ['5e1', 50],
        // 數字的字串只認十進位：Number() 認得的 '0x50' 之類不算
        ['0x50', 100], ['0b11', 100], ['1,000', 100], ['٨٠', 100], ['8 0', 100], ['e1', 100], ['.', 100], ['-', 100],
        ['x', 100], ['80級', 100], ['', 100], ['   ', 100], [null, 100], [undefined, 100], [NaN, 100],
        [Infinity, 100], [-Infinity, 100], ['Infinity', 100], [true, 100], [false, 100], [[80], 100], [{}, 100]
    ]) {
        assert.equal(normalize({ level: input }, jobs).level, expected, `level ${util.inspect(input)}`);
    }
    assert.equal(normalize({}, jobs).level, 100, '沒有 level');

    // mainJob：只收職業清單裡有的鍵（鍵要完全一樣）；沒有 jobs 清單時認不得任何職業
    assert.equal(normalize({ mainJob: 'Pictomancer' }, jobs).mainJob, 'Pictomancer');
    for (const bad of ['Bogus', '', 'pictomancer', ' Pictomancer', '繪靈法師', 'Gladiator', 'constructor', '__proto__', null, 7, ['Paladin'], {}]) {
        assert.equal(normalize({ mainJob: bad }, jobs).mainJob, '', util.inspect(bad));
    }
    for (const noJobs of [undefined, null, 'Pictomancer', {}]) {
        assert.equal(normalize({ mainJob: 'Pictomancer' }, noJobs).mainJob, '', `jobs：${util.inspect(noJobs)}`);
    }

    // subJobs：去重、拿掉不認得的與主職、最多 3 個，順序照傳進來的；不合格的不佔名額
    assert.deepEqual(
        plain(normalize({ mainJob: 'Pictomancer', subJobs: ['Paladin', 'Bogus', 'Paladin', 'Pictomancer', 'Warrior', 7, null, 'Monk', 'Bard'] }, jobs).subJobs),
        ['Paladin', 'Warrior', 'Monk']
    );
    assert.deepEqual(plain(normalize({ subJobs: ['Pictomancer', 'Paladin'] }, jobs).subJobs), ['Pictomancer', 'Paladin'], '還沒選主職時沒有東西可以拿掉');
    // 主職不認得、變成 ''：它在 subJobs 裡也是不認得的，一樣拿掉
    assert.deepEqual(plain(normalize({ mainJob: 'Bogus', subJobs: ['Bogus', 'Paladin'] }, jobs).subJobs), ['Paladin']);
    for (const bad of ['Paladin', {}, null, 3, undefined]) {
        assert.deepEqual(plain(normalize({ subJobs: bad }, jobs).subJobs), [], util.inspect(bad));
    }

    // likes：只留認得的（去重）、最多 6 個，順序照傳進來的
    assert.deepEqual(
        plain(normalize({ likes: ['msq', 'Bogus', 'pvp', 'msq', 'photo', 7, 'glamour', 'fishing', 'housing', 'roleplay', 'trials'] }, jobs).likes),
        ['msq', 'pvp', 'photo', 'glamour', 'fishing', 'housing']
    );
    assert.deepEqual(plain(normalize({ likes: 'msq' }, jobs).likes), []);
    // 在找什麼：同樣只留認得的、去重
    assert.deepEqual(plain(normalize({ looking: ['friends', 'Bogus', 'static', 'friends', null] }, jobs).looking), ['friends', 'static']);
    assert.deepEqual(plain(normalize({ looking: 'fc' }, jobs).looking), []);

    // hours：只留合格的 `${DAY}-${SLOT}`、去重，順序照傳進來的
    assert.deepEqual(
        plain(normalize({ hours: ['weekday-evening', 'weekend-lateNight', 'weekday-evening', 'holiday-evening', 'weekend', 'weekday-noon', 'Weekday-Evening', 'weekday-late_night', 5, null] }, jobs).hours),
        ['weekday-evening', 'weekend-lateNight']
    );
    const everyHour = Array.from(DAYS).flatMap((day) => Array.from(SLOTS).map((slot) => `${day}-${slot}`));
    assert.equal(everyHour.length, 8);
    assert.deepEqual(plain(normalize({ hours: everyHour }, jobs).hours), everyHour);
    assert.deepEqual(plain(normalize({ hours: 'weekday-evening' }, jobs).hours), []);

    // gc、format、style：不合格是預設（gc 的預設是 ''，不填）
    for (const gc of GCS) assert.equal(normalize({ gc }, jobs).gc, gc);
    for (const bad of ['Maelstrom', 'bogus', '', 7, null, ['maelstrom']]) {
        assert.equal(normalize({ gc: bad }, jobs).gc, '', `gc ${util.inspect(bad)}`);
    }
    for (const format of FORMATS) assert.equal(normalize({ format }, jobs).format, format);
    for (const bad of ['square', 'Portrait', '', 7, null]) {
        assert.equal(normalize({ format: bad }, jobs).format, 'landscape', `format ${util.inspect(bad)}`);
    }
    // 風格：名片（a）、海報（b）、資訊卡（c）都收；不在表裡、大小寫不對、不是字串的是預設的海報
    for (const style of STYLES) assert.equal(normalize({ style }, jobs).style, style);
    assert.deepEqual(['a', 'b', 'c'].map((style) => normalize({ style }, jobs).style), ['a', 'b', 'c']);
    for (const bad of ['d', 'z', 'A', 'B', 'C', '', ' a', 'a ', 'ab', 1, 7, null, undefined, ['a'], { style: 'a' }]) {
        assert.equal(normalize({ style: bad }, jobs).style, 'b', `style ${util.inspect(bad)}`);
    }

    // accent：只收 #rrggbb（轉小寫），其他是 'auto'
    for (const [input, expected] of [
        ['#123456', '#123456'], ['#ABCDEF', '#abcdef'], ['#aBcDeF', '#abcdef'], ['auto', 'auto'],
        ['#abc', 'auto'], ['#12345', 'auto'], ['#1234567', 'auto'], ['123456', 'auto'], ['#12345g', 'auto'],
        [' #123456', 'auto'], ['#123456 ', 'auto'], ['#123456\n', 'auto'], ['rgb(1,2,3)', 'auto'], ['red', 'auto'],
        ['', 'auto'], [null, 'auto'], [123456, 'auto'], [['#123456'], 'auto']
    ]) {
        assert.equal(normalize({ accent: input }, jobs).accent, expected, `accent ${util.inspect(input)}`);
    }

    // crops：只留合格的鍵（STYLES × FORMATS 的六份），x／y 夾在 -1～1、zoom 夾在 1～3，不是數字的整筆丟掉；三種風格的規則都一樣
    assert.deepEqual(plain(normalize({
        crops: {
            'b-landscape': { x: 5, y: -5, zoom: 10 },
            'b-portrait': { x: 0.25, y: -0.5, zoom: 0.2 },
            'a-landscape': { x: 0.5, y: 0.5, zoom: 2 },
            'a-portrait': { x: -5, y: 5, zoom: 0 },
            'c-landscape': { x: 0, y: 0, zoom: 3 },
            'c-portrait': { x: 0.1, y: -0.1, zoom: 99 },
            'd-landscape': { x: 0, y: 0, zoom: 1 },
            'A-landscape': { x: 0, y: 0, zoom: 1 },
            'b-square': { x: 0, y: 0, zoom: 1 },
            landscape: { x: 0, y: 0, zoom: 1 }
        }
    }, jobs).crops), {
        'b-landscape': { x: 1, y: -1, zoom: 3 },
        'b-portrait': { x: 0.25, y: -0.5, zoom: 1 },
        'a-landscape': { x: 0.5, y: 0.5, zoom: 2 },
        'a-portrait': { x: -1, y: 1, zoom: 1 },
        'c-landscape': { x: 0, y: 0, zoom: 3 },
        'c-portrait': { x: 0.1, y: -0.1, zoom: 3 }
    });
    for (const bad of [
        { x: '0.5', y: 0, zoom: 1 }, { x: 0, y: '0', zoom: 1 }, { x: 0, y: 0, zoom: '2' },
        { x: 0, y: 0 }, { x: 0, zoom: 1 }, { y: 0, zoom: 1 }, {},
        { x: NaN, y: 0, zoom: 1 }, { x: 0, y: Infinity, zoom: 1 }, { x: 0, y: 0, zoom: -Infinity },
        { x: null, y: 0, zoom: 1 }, { x: [0], y: 0, zoom: 1 }, { x: true, y: 0, zoom: 1 },
        null, 7, 'x', true, []
    ]) {
        for (const key of ['b-landscape', 'a-landscape', 'a-portrait', 'c-landscape', 'c-portrait']) {
            assert.deepEqual(plain(normalize({ crops: { [key]: bad } }, jobs).crops), {}, `${key} 的 crop ${util.inspect(bad)}`);
        }
    }
    // 壞的那一份不連累好的那一份（同一種風格的另一個版型，或別種風格）
    assert.deepEqual(
        plain(normalize({ crops: { 'b-landscape': { x: 'left', y: 0, zoom: 1 }, 'b-portrait': { x: 0.5, y: 0.5, zoom: 2 } } }, jobs).crops),
        { 'b-portrait': { x: 0.5, y: 0.5, zoom: 2 } }
    );
    assert.deepEqual(
        plain(normalize({ crops: { 'a-landscape': { x: 'left', y: 0, zoom: 1 }, 'a-portrait': null, 'c-landscape': { x: 0.5, y: 0.5, zoom: 2 }, 'b-portrait': { x: 0, y: 0, zoom: 1.5 } } }, jobs).crops),
        { 'c-landscape': { x: 0.5, y: 0.5, zoom: 2 }, 'b-portrait': { x: 0, y: 0, zoom: 1.5 } }
    );
    // 多的欄位拿掉
    assert.deepEqual(
        plain(normalize({ crops: { 'b-landscape': { x: 0, y: 0, zoom: 1, rotate: 90 }, 'a-portrait': { x: 0, y: 0, zoom: 1, rotate: 90 } } }, jobs).crops),
        { 'b-landscape': { x: 0, y: 0, zoom: 1 }, 'a-portrait': { x: 0, y: 0, zoom: 1 } }
    );
    for (const bad of [null, undefined, 'b-landscape', 7, true, []]) {
        assert.deepEqual(plain(normalize({ crops: bad }, jobs).crops), {}, `crops ${util.inspect(bad)}`);
    }
});

test('normalize：好的內容原樣讀回；不 trim、不收空白；v 一律是 1；多的欄位拿掉', () => {
    assert.deepEqual(plain(normalize(LUNA, jobs)), LUNA);
    // 再整理一次還是一樣
    assert.deepEqual(plain(normalize(normalize(LUNA, jobs), jobs)), LUNA);
    // 預設的狀態整理後還是預設
    assert.deepEqual(plain(normalize(defaults(), jobs)), EXPECTED_DEFAULTS);

    // 頁面是邊打邊整理，trim 會吃掉打到一半的空白：只切長度，其他原樣
    const typing = normalize({ name: 'Luna ', world: ' 伊弗利特', title: '  ', intro: 'a  b ', contact: '\tDiscord' }, jobs);
    assert.equal(typing.name, 'Luna ');
    assert.equal(typing.world, ' 伊弗利特');
    assert.equal(typing.title, '  ');
    assert.equal(typing.intro, 'a  b ');
    assert.equal(typing.contact, '\tDiscord');
    // 超過上限時切的是尾巴，前面的空白也留著
    assert.equal(normalize({ fcTag: ' ab cd' }, jobs).fcTag, ' ab c');

    // v 不看傳進來的：目前只有版本 1，以後改了形狀再依 v 轉換
    for (const v of [1, 2, 0, '1', null, undefined]) {
        assert.equal(normalize({ v }, jobs).v, 1, `v ${util.inspect(v)}`);
    }

    // 多的欄位拿掉；JSON 裡有 own property 叫 __proto__ 時（JSON.parse 會這樣建）也不影響結果與原型
    const parsed = JSON.parse('{"__proto__": {"name": "Mallory", "polluted": true}, "name": "Luna Starweaver", "extra": 1}');
    const cleaned = normalize(parsed, jobs);
    assert.equal(cleaned.name, 'Luna Starweaver');
    assert.deepEqual(Object.keys(cleaned).sort(), Object.keys(EXPECTED_DEFAULTS).sort());
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(cleaned.polluted, undefined);

    // 結果是新的物件：改結果不會動到傳進來的（陣列與 crops 不共用）
    const raw = JSON.parse(JSON.stringify(LUNA));
    const state = normalize(raw, jobs);
    state.subJobs.push('Monk');
    state.hours.push('weekday-morning');
    state.likes.push('pvp');
    state.looking.push('fc');
    state.crops['b-landscape'].x = 0;
    state.crops['b-portrait'] = { x: 0, y: 0, zoom: 1 };
    assert.deepEqual(raw, LUNA);
});

test('normalize：字數用 Unicode 字元算，不會把一個字切成兩半', () => {
    // 😀 是一個字元，在 JavaScript 字串裡佔兩個單位（代理對）
    const smile = '😀';
    assert.equal(smile.length, 2);

    const cut = normalize({ name: smile.repeat(30) }, jobs).name;
    assert.equal(Array.from(cut).length, 21);
    assert.equal(cut, smile.repeat(21), '切在字元之間，不留半個代理對');
    assert.equal(cut.length, 42);
    // 剛好上限、單位數超過上限但字元數沒超過：不切
    assert.equal(normalize({ name: smile.repeat(21) }, jobs).name, smile.repeat(21));
    assert.equal(normalize({ fcTag: smile.repeat(5) }, jobs).fcTag, smile.repeat(5));
    assert.equal(normalize({ fcTag: smile.repeat(6) }, jobs).fcTag, smile.repeat(5));
    // 罕用字（也是代理對）與中文、英文混著算
    assert.equal(normalize({ title: '𠮷'.repeat(31) }, jobs).title, '𠮷'.repeat(30));
    assert.equal(normalize({ intro: `光${smile}a`.repeat(30) }, jobs).intro, `光${smile}a`.repeat(20), '60 個字元＝20 組');
    // 切出來的字串不含單獨的代理字元
    for (const field of ['name', 'world', 'title', 'fcName', 'fcTag', 'intro', 'contact']) {
        const value = normalize({ [field]: `a${smile}`.repeat(80) }, jobs)[field];
        assert.doesNotMatch(value, /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/, field);
        assert.equal(Array.from(value).length, LIMITS[field], field);
    }
});

// 看起來是一個字、卻不只一個 Unicode 字元的東西。用跳脫寫：編輯器與工具不會悄悄把它們改寫成別的形式（零寬連接符號是看不見的）
const FLAG = '\u{1F1F9}\u{1F1FC}'; // 🇹🇼：兩個區域指示符號（2 個字元）
const FAMILY = '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}'; // 👨‍👩‍👧：三個 emoji 用零寬連接符號接起來（5 個字元）
const E_ACUTE = 'e\u{301}'; // é：e 加上組合用的重音符號（2 個字元）

test('normalize：上限照舊以 Unicode 字元計，剛好落在一個字中間（國旗、emoji 組合、組合字）時退到前一個完整的字', () => {
    // 稱號上限 30。國旗是 2 個字元：29 個 A 加國旗是 31 個字元，第 30 個字元落在國旗中間，國旗整個拿掉
    assert.equal(normalize({ title: 'A'.repeat(29) + FLAG }, jobs).title, 'A'.repeat(29));
    // 28 個 A 加國旗剛好 30 個字元：原樣，國旗算 2 個字元
    assert.equal(normalize({ title: 'A'.repeat(28) + FLAG }, jobs).title, 'A'.repeat(28) + FLAG);
    // 後面還有字：28 個 A 加國旗剛好用完上限，後面的拿掉；29 個 A 加國旗與後面的字，國旗與後面的字都拿掉
    assert.equal(normalize({ title: 'A'.repeat(28) + FLAG + 'B' }, jobs).title, 'A'.repeat(28) + FLAG);
    assert.equal(normalize({ title: 'A'.repeat(29) + FLAG + 'B' }, jobs).title, 'A'.repeat(29));
    // 40 個一般的字照舊切成 30 個
    assert.equal(normalize({ title: 'C'.repeat(40) }, jobs).title, 'C'.repeat(30));

    // 名字上限 21。é（e 加重音符號）是 2 個字元：20 個 B 加 é 是 22 個字元，切在 e 與重音符號中間的話會留下沒有重音的 e，所以整個 é 拿掉
    assert.equal(normalize({ name: 'B'.repeat(20) + E_ACUTE }, jobs).name, 'B'.repeat(20));
    assert.equal(normalize({ name: 'B'.repeat(19) + E_ACUTE }, jobs).name, 'B'.repeat(19) + E_ACUTE, '剛好 21 個字元：原樣');
    // 家庭 emoji 是 5 個字元：跨過上限時整個拿掉，不管切在第幾個字元
    for (const before of [17, 18, 19, 20]) {
        assert.equal(normalize({ name: 'B'.repeat(before) + FAMILY }, jobs).name, 'B'.repeat(before), `${before} 個字元加家庭 emoji：整個拿掉`);
    }
    assert.equal(normalize({ name: 'B'.repeat(16) + FAMILY }, jobs).name, 'B'.repeat(16) + FAMILY, '剛好 21 個字元：原樣');
    // 前面有整個的字素（國旗、家庭 emoji）：上限內的完整字素都留著，只拿掉跨過上限的那一個
    assert.equal(normalize({ name: FLAG + FAMILY + 'B'.repeat(13) + E_ACUTE }, jobs).name, FLAG + FAMILY + 'B'.repeat(13), '2 + 5 + 13 = 20 個字元，é 跨過上限');
    assert.equal(normalize({ name: FLAG + FAMILY + E_ACUTE.repeat(10) }, jobs).name, FLAG + FAMILY + E_ACUTE.repeat(7), '2 + 5 + 7 × 2 = 21 個字元，剛好用完上限');
    // 一個字素自己就比上限長（5 個字元的上限放不下 7 個字元的 emoji 組合）：沒有完整的字素可留，是空字串
    const FAMILY_OF_FOUR = '\u{1F469}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}';
    assert.equal(Array.from(FAMILY_OF_FOUR).length, 7);
    assert.equal(normalize({ fcTag: FAMILY_OF_FOUR }, jobs).fcTag, '');
    assert.equal(normalize({ fcTag: 'X' + FAMILY_OF_FOUR }, jobs).fcTag, 'X');

    // 每個字串欄位都一樣（同一個切法）：上限 − 1 個字元加國旗 → 國旗拿掉；上限 − 2 個字元加國旗 → 原樣
    for (const field of ['name', 'world', 'title', 'fcName', 'fcTag', 'intro', 'contact']) {
        const limit = LIMITS[field];
        assert.equal(normalize({ [field]: 'X'.repeat(limit - 1) + FLAG }, jobs)[field], 'X'.repeat(limit - 1), field);
        assert.equal(normalize({ [field]: 'X'.repeat(limit - 2) + FLAG }, jobs)[field], 'X'.repeat(limit - 2) + FLAG, field);
    }

    // 沒超過上限的原樣不動（UTF-16 的單位數超過上限、字元數沒超過也是）
    assert.equal(normalize({ title: FLAG.repeat(15) }, jobs).title, FLAG.repeat(15), '15 面國旗 = 30 個字元');
    assert.equal(normalize({ title: FLAG.repeat(16) }, jobs).title, FLAG.repeat(15), '16 面 = 32 個字元，切在第 15 面後面');
});

test('normalize：沒有 Intl.Segmenter 的舊瀏覽器照以前的切法，切在上限的字元上（不丟錯）', () => {
    const old = loadContext([SHARED, STATE_FILE], { withoutSegmenter: true });
    const normalizeOld = old.CardState.normalize;
    // 29 個 A 加國旗：切在第 30 個字元，留下國旗的第一個區域指示符號（以前的行為）
    assert.equal(normalizeOld({ title: 'A'.repeat(29) + FLAG }, old.FF14_JOBS).title, 'A'.repeat(29) + '\u{1F1F9}');
    assert.equal(normalizeOld({ name: 'B'.repeat(20) + E_ACUTE }, old.FF14_JOBS).name, 'B'.repeat(20) + 'e');
    // 一般的字、沒超過上限的字照舊
    assert.equal(normalizeOld({ title: 'C'.repeat(40) }, old.FF14_JOBS).title, 'C'.repeat(30));
    assert.equal(normalizeOld({ title: 'A'.repeat(28) + FLAG }, old.FF14_JOBS).title, 'A'.repeat(28) + FLAG);
    assert.equal(normalizeOld({ name: '\u{1F600}'.repeat(30) }, old.FF14_JOBS).name, '\u{1F600}'.repeat(21));
});

test('normalize 傳深層凍結的內容也算得對，不改傳進來的東西', () => {
    // 嚴格模式：想改凍結的東西會丟 TypeError。raw 帶著要被切掉、去重、拿掉的內容，每一條路都走到
    const raw = deepFreeze(plain({
        ...LUNA,
        name: 'N'.repeat(40),
        level: '90',
        subJobs: ['Pictomancer', 'Paladin', 'Paladin', 'Bogus', 'Warrior', 'Monk', 'Bard'],
        hours: ['weekday-evening', 'weekday-evening', 'bogus'],
        likes: ['msq', 'msq', 'leveling', 'trials', 'savage', 'ultimate', 'alliance', 'pvp'],
        looking: ['fc', 'fc', 'bogus'],
        accent: '#ABCDEF',
        crops: { 'b-landscape': { x: 9, y: -9, zoom: 9 }, 'b-portrait': { x: 'x', y: 0, zoom: 1 }, bogus: {} },
        extra: { nested: ['x'] }
    }));
    const frozenJobs = deepFreeze(plain(jobs));
    const before = JSON.stringify(raw);

    const state = normalize(raw, frozenJobs);
    assert.equal(JSON.stringify(raw), before, '傳進來的沒有被改');
    assert.deepEqual(plain(state), {
        ...LUNA,
        name: 'N'.repeat(21),
        level: 90,
        subJobs: ['Paladin', 'Warrior', 'Monk'],
        hours: ['weekday-evening'],
        likes: ['msq', 'leveling', 'trials', 'savage', 'ultimate', 'alliance'],
        looking: ['fc'],
        accent: '#abcdef',
        crops: { 'b-landscape': { x: 1, y: -1, zoom: 3 } }
    });

    // 結果不是凍結的，也沒有和凍結的輸入共用陣列或物件：頁面可以直接改它
    for (const value of [state, state.subJobs, state.hours, state.likes, state.looking, state.crops, state.crops['b-landscape']]) {
        assert.equal(Object.isFrozen(value), false);
    }
    state.subJobs.push('Dancer');
    state.crops['b-landscape'].x = 0;
    assert.equal(JSON.stringify(raw), before);
});

// ---------- validate ----------

test('validate：依名字、伺服器、主職的順序列出沒填的，只有空白也算沒填', () => {
    assert.deepEqual(plain(validate(defaults())), { ok: false, missing: ['name', 'world', 'mainJob'] });
    assert.deepEqual(plain(validate(normalize(LUNA, jobs))), { ok: true, missing: [] });

    // 缺一個、缺兩個：順序固定是名字、伺服器、主職（不是填的順序）
    const filled = { name: 'Luna Starweaver', world: '伊弗利特', mainJob: 'Pictomancer' };
    for (const missing of [['name'], ['world'], ['mainJob'], ['name', 'world'], ['name', 'mainJob'], ['world', 'mainJob'], ['name', 'world', 'mainJob']]) {
        const state = { ...defaults(), ...filled };
        for (const field of missing) state[field] = '';
        assert.deepEqual(plain(validate(state)), { ok: false, missing }, missing.join('、'));
    }

    // 只有空白也算沒填：半形與全形的空白、tab、換行、不換行空白
    for (const blank of [' ', '   ', '　', '\t', '\n', ' ', ' 　\t\r\n']) {
        assert.deepEqual(plain(validate({ ...LUNA, name: blank })), { ok: false, missing: ['name'] }, JSON.stringify(blank));
        assert.deepEqual(plain(validate({ ...LUNA, world: blank })), { ok: false, missing: ['world'] }, JSON.stringify(blank));
        assert.deepEqual(plain(validate({ ...LUNA, mainJob: blank })), { ok: false, missing: ['mainJob'] }, JSON.stringify(blank));
    }
    // 有字就算填了，前後有空白也一樣（validate 不改傳進來的字）
    assert.deepEqual(plain(validate({ ...LUNA, name: '  Luna  ', world: '　伊弗利特' })), { ok: true, missing: [] });
    // 沒有字串（壞掉的狀態）算沒填；選填的欄位不影響
    assert.deepEqual(plain(validate({ name: 7, world: null, mainJob: ['Paladin'] })), { ok: false, missing: ['name', 'world', 'mainJob'] });
    assert.deepEqual(plain(validate({ name: 'A', world: 'B', mainJob: 'C' })), { ok: true, missing: [] });
    assert.deepEqual(plain(validate({ ...LUNA, title: '', fcName: '', intro: '   ', contact: '', subJobs: [], accent: 'auto' })), { ok: true, missing: [] });
    for (const bad of [null, undefined, 'x', 42, []]) {
        assert.deepEqual(plain(validate(bad)), { ok: false, missing: ['name', 'world', 'mainJob'] }, util.inspect(bad));
    }

    // 每次都是新的陣列；傳深層凍結的狀態也行
    const first = validate(defaults());
    first.missing.push('x');
    assert.deepEqual(plain(validate(defaults()).missing), ['name', 'world', 'mainJob']);
    const frozen = deepFreeze(plain({ ...LUNA, name: ' ' }));
    assert.deepEqual(plain(validate(frozen)), { ok: false, missing: ['name'] });
    assert.equal(frozen.name, ' ');
});

// ---------- 職能與重點色 ----------

test('roleOf 與 accentOf', () => {
    // 騎士是坦克、武僧是近戰（dps）、刻木匠是生產
    assert.equal(roleOf('Paladin', jobs), 'tank');
    assert.equal(roleOf('Monk', jobs), 'dps');
    assert.equal(roleOf('Carpenter', jobs), 'crafting');
    assert.equal(accentOf({ mainJob: 'Paladin', accent: 'auto' }, jobs), '#4f74d6');
    assert.equal(accentOf({ mainJob: 'Monk', accent: 'auto' }, jobs), '#d4574e');
    assert.equal(accentOf({ mainJob: 'Carpenter', accent: 'auto' }, jobs), '#8a63d2');
    assert.equal(accentOf({ mainJob: 'WhiteMage', accent: 'auto' }, jobs), '#3f9e5c');
    assert.equal(accentOf({ mainJob: 'Miner', accent: 'auto' }, jobs), '#c99a2e');

    // 自訂的顏色優先（不管主職是什麼）；沒有主職用 dps 的顏色
    assert.equal(accentOf({ mainJob: 'Paladin', accent: '#123456' }, jobs), '#123456');
    assert.equal(accentOf({ mainJob: '', accent: '#123456' }, jobs), '#123456');
    assert.equal(accentOf({ mainJob: '', accent: 'auto' }, jobs), '#d4574e');
    assert.equal(accentOf(defaults(), jobs), '#d4574e');
    // 傳沒整理過的狀態：大小寫不影響，回傳小寫；不合格的顏色當成 'auto'
    assert.equal(accentOf({ mainJob: 'Paladin', accent: '#ABCDEF' }, jobs), '#abcdef');
    for (const bad of ['#abc', 'red', '', null, undefined, 7]) {
        assert.equal(accentOf({ mainJob: 'Paladin', accent: bad }, jobs), '#4f74d6', util.inspect(bad));
    }
    // 主職不認得、沒有職業清單、沒有狀態：dps 的顏色
    assert.equal(accentOf({ mainJob: 'Bogus', accent: 'auto' }, jobs), '#d4574e');
    assert.equal(accentOf({ mainJob: 'Paladin', accent: 'auto' }), '#d4574e');
    assert.equal(accentOf({ mainJob: 'Paladin', accent: 'auto' }, null), '#d4574e');
    for (const bad of [null, undefined, 'x', 42]) {
        assert.equal(accentOf(bad, jobs), '#d4574e', util.inspect(bad));
    }
    // 整理過的整份狀態也行
    assert.equal(accentOf(normalize({ ...LUNA, accent: 'auto' }, jobs), jobs), '#d4574e', '繪靈法師是法系，算 dps');
    assert.equal(accentOf(normalize(LUNA, jobs), jobs), '#123456');

    // 近戰、遠程、法系都是 dps：34 個職業每一個都有職能，數量對得上
    const counts = {};
    for (const job of jobs) {
        const role = roleOf(job.key, jobs);
        assert.notEqual(role, null, job.key);
        assert.equal(accentOf({ mainJob: job.key, accent: 'auto' }, jobs), ROLE_COLORS[role], job.key);
        counts[role] = (counts[role] ?? 0) + 1;
    }
    assert.deepEqual(counts, { tank: 4, healer: 4, dps: 15, crafting: 8, gathering: 3 });
    for (const [group, role] of [['melee', 'dps'], ['ranged', 'dps'], ['magic', 'dps'], ['tank', 'tank'], ['healer', 'healer'], ['crafting', 'crafting'], ['gathering', 'gathering']]) {
        const members = Array.from(jobs).filter((job) => job.role === group);
        assert.ok(members.length > 0, group);
        for (const job of members) assert.equal(roleOf(job.key, jobs), role, `${job.key}（${group}）`);
    }
    // 限定職業也有職能：青魔法師是法系、Beastmaster 是近戰
    assert.equal(roleOf('BlueMage', jobs), 'dps');
    assert.equal(roleOf('Beastmaster', jobs), 'dps');

    // 不認得的鍵、不是字串、沒有清單、職能不認得：null（鍵要完全一樣，也不會拿到物件原型上的東西）
    for (const bad of ['Bogus', '', 'paladin', ' Paladin', '騎士', 'constructor', '__proto__', 'toString', null, undefined, 7, ['Paladin'], {}]) {
        assert.equal(roleOf(bad, jobs), null, util.inspect(bad));
    }
    for (const noJobs of [undefined, null, 'Paladin', {}, []]) {
        assert.equal(roleOf('Paladin', noJobs), null, util.inspect(noJobs));
    }
    assert.equal(roleOf('Odd', [{ key: 'Odd', role: 'constructor' }]), null);
    assert.equal(roleOf('Odd', [{ key: 'Odd', role: 'support' }]), null);
    assert.equal(roleOf('Odd', [null, { key: 'Odd', role: 'tank' }]), 'tank', '清單裡有壞項目不影響別的');

    // 傳深層凍結的職業清單與狀態也行
    const frozenJobs = deepFreeze(plain(jobs));
    const frozenState = deepFreeze(plain({ mainJob: 'Paladin', accent: 'AUTO' }));
    assert.equal(roleOf('Paladin', frozenJobs), 'tank');
    assert.equal(accentOf(frozenState, frozenJobs), '#4f74d6');
});

// ---------- 圖片位置 ----------

test('cropKey 與 cropOf：風格與橫直版各記一份（六份），沒記過是填滿置中', () => {
    assert.equal(cropKey(defaults()), 'b-landscape');
    assert.equal(cropKey({ ...defaults(), format: 'portrait' }), 'b-portrait');
    // 鍵就是 `${style}-${format}`，STYLES × FORMATS 的六種每一種都有
    const keys = [];
    for (const style of STYLES) {
        for (const format of FORMATS) {
            assert.equal(cropKey({ ...defaults(), style, format }), `${style}-${format}`);
            keys.push(`${style}-${format}`);
        }
    }
    assert.deepEqual(keys, ['a-landscape', 'a-portrait', 'b-landscape', 'b-portrait', 'c-landscape', 'c-portrait']);
    assert.equal(cropKey({ style: 'c', format: 'portrait' }), 'c-portrait');
    assert.equal(cropKey({ style: 'a', format: 'landscape' }), 'a-landscape');
    // style 或 format 不合格（沒整理過的狀態）：當成預設的那一份
    assert.equal(cropKey({ style: 'z', format: 'portrait' }), 'b-portrait');
    assert.equal(cropKey({ style: 'd', format: 'portrait' }), 'b-portrait');
    assert.equal(cropKey({ style: 'b', format: 'square' }), 'b-landscape');
    assert.equal(cropKey({}), 'b-landscape');
    assert.equal(cropKey(null), 'b-landscape');

    const state = normalize(LUNA, jobs);
    assert.deepEqual(plain(cropOf(state)), { x: -1, y: 1, zoom: 3 });
    assert.deepEqual(plain(cropOf({ ...state, format: 'landscape' })), { x: 0.25, y: -0.5, zoom: 1.5 });
    // 另一份有記、這一份沒記：這一份是預設
    assert.deepEqual(plain(cropOf({ ...state, format: 'landscape', crops: { 'b-portrait': { x: 1, y: 1, zoom: 2 } } })), { x: 0, y: 0, zoom: 1 });
    // 別種風格有記、這種風格沒記：這種風格是預設；換成有記的那種風格就讀到它
    const crops = { 'a-landscape': { x: 0.5, y: -0.5, zoom: 2 }, 'c-portrait': { x: -0.25, y: 0.25, zoom: 1.25 } };
    assert.deepEqual(plain(cropOf({ ...defaults(), style: 'b', crops })), { x: 0, y: 0, zoom: 1 });
    assert.deepEqual(plain(cropOf({ ...defaults(), style: 'a', crops })), { x: 0.5, y: -0.5, zoom: 2 });
    assert.deepEqual(plain(cropOf({ ...defaults(), style: 'a', format: 'portrait', crops })), { x: 0, y: 0, zoom: 1 });
    assert.deepEqual(plain(cropOf({ ...defaults(), style: 'c', format: 'portrait', crops })), { x: -0.25, y: 0.25, zoom: 1.25 });
    assert.deepEqual(plain(cropOf({ ...defaults(), style: 'c', crops })), { x: 0, y: 0, zoom: 1 });
    // 沒記過
    assert.deepEqual(plain(cropOf(defaults())), { x: 0, y: 0, zoom: 1 });
    assert.deepEqual(plain(cropOf({ ...defaults(), crops: {} })), { x: 0, y: 0, zoom: 1 });

    // 回傳的是新的物件：改它不會動到狀態，也不會動到下一次拿到的預設
    const crop = cropOf(state);
    crop.x = 0;
    crop.zoom = 1;
    assert.deepEqual(plain(state.crops['b-portrait']), { x: -1, y: 1, zoom: 3 });
    const fresh = cropOf(defaults());
    fresh.zoom = 2;
    assert.deepEqual(plain(cropOf(defaults())), { x: 0, y: 0, zoom: 1 });

    // 沒整理過、壞掉的內容：當成沒記過，不丟錯；超出範圍的照 normalize 的規則夾住
    for (const crops of [undefined, null, 'x', 7, [], { 'b-landscape': null }, { 'b-landscape': { x: 'a', y: 0, zoom: 1 } }, { 'b-landscape': { x: 0, y: 0 } }]) {
        assert.deepEqual(plain(cropOf({ ...defaults(), crops })), { x: 0, y: 0, zoom: 1 }, util.inspect(crops));
    }
    assert.deepEqual(plain(cropOf({ ...defaults(), crops: { 'b-landscape': { x: 9, y: -9, zoom: 9 } } })), { x: 1, y: -1, zoom: 3 });
    for (const bad of [null, undefined, 'x', 42]) {
        assert.deepEqual(plain(cropOf(bad)), { x: 0, y: 0, zoom: 1 }, util.inspect(bad));
    }

    // 傳深層凍結的狀態也行
    const frozen = deepFreeze(plain(state));
    assert.equal(cropKey(frozen), 'b-portrait');
    assert.deepEqual(plain(cropOf(frozen)), { x: -1, y: 1, zoom: 3 });
});

// ---------- 記住 ----------

test('load／save／saveImage／clear', () => {
    // 空的 storage：預設與 null，而且只讀不寫
    const empty = createStorage();
    assert.deepEqual(plain(load(empty, jobs)), { state: EXPECTED_DEFAULTS, image: null });
    assert.deepEqual(empty.calls.map(([operation]) => operation), ['get', 'get']);
    assert.deepEqual(empty.calls.map(([, key]) => key).sort(), [STORAGE_KEY, IMAGE_KEY].sort());

    // 存進去讀得回來：欄位是一個 JSON（帶 v: 1），圖片是另一個鍵裡的字串
    const storage = createStorage({ other: 'keep' });
    const state = normalize(LUNA, jobs);
    assert.equal(save(storage, state), true);
    assert.deepEqual(JSON.parse(storage.data.get(STORAGE_KEY)), LUNA);
    assert.equal(JSON.parse(storage.data.get(STORAGE_KEY)).v, 1);
    assert.deepEqual(plain(load(storage, jobs)), { state: LUNA, image: null });
    assert.equal(saveImage(storage, IMAGE), true);
    assert.equal(storage.data.get(IMAGE_KEY), IMAGE);
    assert.deepEqual(plain(load(storage, jobs)), { state: LUNA, image: IMAGE });
    // 存了再存：蓋掉，不會變成兩份
    assert.equal(save(storage, { ...state, name: 'Rin Moonfall' }), true);
    assert.equal(plain(load(storage, jobs).state).name, 'Rin Moonfall');

    // saveImage(null) 只刪圖片，欄位還在；本來就沒有也一樣
    assert.equal(saveImage(storage, null), true);
    assert.equal(storage.data.has(IMAGE_KEY), false);
    assert.equal(storage.data.has(STORAGE_KEY), true);
    assert.equal(load(storage, jobs).image, null);
    assert.equal(saveImage(storage, null), true);

    // clear 兩個鍵都刪，別的鍵不動；刪兩次也行
    assert.equal(saveImage(storage, IMAGE), true);
    assert.equal(clear(storage), undefined);
    assert.deepEqual([...storage.data.keys()], ['other']);
    assert.deepEqual(plain(load(storage, jobs)), { state: EXPECTED_DEFAULTS, image: null });
    assert.equal(clear(storage), undefined);
    assert.deepEqual([...storage.data.keys()], ['other']);

    // 傳深層凍結的狀態也行，存下去的字和沒凍結的一樣
    const frozenStorage = createStorage();
    assert.equal(save(frozenStorage, deepFreeze(plain(state))), true);
    assert.deepEqual(JSON.parse(frozenStorage.data.get(STORAGE_KEY)), LUNA);
});

test('第一次上線存的資料（style: b、只有 b 的兩份位置）讀出來和存的一樣；換成名片或資訊卡時，它們的位置是沒記過的填滿置中，海報的兩份不動', () => {
    // 第一次上線的版本只能存 'b'，位置只有 b-landscape、b-portrait 兩份，v 是 1
    const first = {
        v: 1, name: 'Luna Starweaver', world: '伊弗利特', mainJob: 'Pictomancer', level: 98, subJobs: ['Paladin'], title: '', fcName: 'Starlit Hall', fcTag: 'STAR',
        gc: 'twinAdder', hours: ['weekday-evening'], likes: ['msq'], looking: ['friends'], intro: 'Hello!', contact: 'Discord: luna.example', accent: 'auto',
        style: 'b', format: 'portrait', crops: { 'b-landscape': { x: 0.25, y: -0.5, zoom: 1.5 }, 'b-portrait': { x: -1, y: 1, zoom: 3 } }
    };
    const storage = createStorage({ [STORAGE_KEY]: JSON.stringify(first) });
    const { state } = load(storage, jobs);
    assert.deepEqual(plain(state), first, '讀出來和存的一樣：照舊是海報，位置不變');
    assert.deepEqual(writes(storage), [], '讀不會寫');
    assert.deepEqual(plain(cropOf(state)), { x: -1, y: 1, zoom: 3 });

    // 換成名片或資訊卡（兩種版型）：它們自己的位置還沒記過，是填滿置中；海報的兩份照舊在記憶裡
    for (const style of ['a', 'c']) {
        for (const format of FORMATS) {
            assert.deepEqual(plain(cropOf({ ...state, style, format })), { x: 0, y: 0, zoom: 1 }, `${style}-${format}`);
        }
    }
    // 換風格之後存、再讀：名片多了自己的一份，海報的兩份與別的欄位原封不動；換回海報，位置還在
    const switched = normalize({ ...state, style: 'a', format: 'landscape', crops: { ...state.crops, 'a-landscape': { x: 0.3, y: 0, zoom: 2 } } }, jobs);
    assert.equal(save(storage, switched), true);
    const again = load(storage, jobs).state;
    assert.equal(again.style, 'a');
    assert.deepEqual(plain(again.crops), { ...first.crops, 'a-landscape': { x: 0.3, y: 0, zoom: 2 } });
    assert.deepEqual(plain(cropOf(again)), { x: 0.3, y: 0, zoom: 2 });
    assert.deepEqual(plain(cropOf({ ...again, style: 'b', format: 'portrait' })), { x: -1, y: 1, zoom: 3 });
    assert.deepEqual(plain(cropOf({ ...again, style: 'b', format: 'landscape' })), { x: 0.25, y: -0.5, zoom: 1.5 });
    assert.deepEqual(plain({ ...again, style: 'b', format: 'portrait', crops: first.crops }), first);

    // 存著壞掉的風格（被改壞，或以後的版本才有的風格）：回到海報，位置照 b 的那兩份
    for (const style of ['d', 'B', 1, null, ['a']]) {
        const odd = load(createStorage({ [STORAGE_KEY]: JSON.stringify({ ...first, style }) }), jobs).state;
        assert.equal(odd.style, 'b', `style ${util.inspect(style)}`);
        assert.deepEqual(plain(odd.crops), first.crops);
    }
});

test('load：不是 JSON、壞掉的內容照常打開，丟掉壞的部分', () => {
    // 不是 JSON，或是 JSON 但不是物件：預設（圖片另外讀，不受影響）
    for (const text of ['{oops', 'undefined', 'Luna Starweaver', '', '   ', 'null', '"x"', '42', 'true', '[]', '["name"]', '{"name": "Luna"']) {
        const storage = createStorage({ [STORAGE_KEY]: text, [IMAGE_KEY]: IMAGE });
        assert.deepEqual(plain(load(storage, jobs)), { state: EXPECTED_DEFAULTS, image: IMAGE }, JSON.stringify(text));
    }
    // getItem 回傳的不是字串：當成沒有
    for (const value of [undefined, 5, {}, ['x'], true]) {
        const storage = createStorage();
        storage.getItem = () => value;
        assert.deepEqual(plain(load(storage, jobs)), { state: EXPECTED_DEFAULTS, image: null }, util.inspect(value));
    }

    // 以前存的或被改壞的內容：不認得的職業、超長的字串、壞掉的 crops、不是陣列的欄位…壞的丟掉，好的照用
    const old = {
        v: 1,
        name: 'N'.repeat(40),
        world: '伊弗利特',
        mainJob: 'Gladiator',
        level: '95',
        subJobs: ['Gladiator', 'Paladin', 'Paladin'],
        title: 7,
        fcName: 'Starlit Hall',
        gc: 'Maelstrom',
        hours: ['weekday-evening', 'someday-night'],
        likes: 'msq',
        looking: ['friends'],
        intro: 'x'.repeat(100),
        accent: 'blue',
        format: 'portrait',
        crops: { 'b-landscape': { x: 'left', y: 0, zoom: 1 }, 'b-portrait': { x: 9, y: 0, zoom: 0 }, 'z-landscape': { x: 0, y: 0, zoom: 1 } },
        someOldField: { whatever: true }
    };
    const storage = createStorage({ [STORAGE_KEY]: JSON.stringify(old) });
    assert.deepEqual(plain(load(storage, jobs)), {
        state: {
            ...EXPECTED_DEFAULTS,
            name: 'N'.repeat(21),
            world: '伊弗利特',
            level: 95,
            subJobs: ['Paladin'],
            fcName: 'Starlit Hall',
            hours: ['weekday-evening'],
            looking: ['friends'],
            intro: 'x'.repeat(60),
            format: 'portrait',
            crops: { 'b-portrait': { x: 1, y: 0, zoom: 1 } }
        },
        image: null
    });
    // 讀不會寫：存著的字一個都沒動（壞的部分等下一次 save 才換掉）
    assert.deepEqual(writes(storage), []);
    assert.deepEqual(JSON.parse(storage.data.get(STORAGE_KEY)), old);

    // 沒有傳 jobs 時認不得任何職業，其他照常
    const noJobs = load(createStorage({ [STORAGE_KEY]: JSON.stringify(LUNA) }));
    assert.deepEqual(plain(noJobs.state), { ...LUNA, mainJob: '', subJobs: [] });
});

test('load：圖片只收 data:image/ 開頭的字串', () => {
    const imageOf = (value) => load(createStorage({ [IMAGE_KEY]: value }), jobs).image;
    for (const ok of [IMAGE, 'data:image/png;base64,iVBORw0KGgo=', 'data:image/webp;base64,UklGR', 'data:image/']) {
        assert.equal(imageOf(ok), ok);
    }
    for (const bad of ['', ' ', 'null', 'undefined', 'https://example.invalid/luna.png', 'data:text/html;base64,PGgxPg==', 'data:image', 'DATA:IMAGE/png;base64,AAAA', ' data:image/png;base64,AAAA', '/9j/4AAQSkZJRg==', '{"image":"data:image/png"}']) {
        assert.equal(imageOf(bad), null, JSON.stringify(bad));
    }
    // 欄位和圖片各讀各的：圖片壞了不影響欄位，欄位壞了不影響圖片
    const storage = createStorage({ [STORAGE_KEY]: JSON.stringify(LUNA), [IMAGE_KEY]: 'not an image' });
    assert.deepEqual(plain(load(storage, jobs)), { state: LUNA, image: null });
});

test('getItem 丟例外或沒有儲存空間：load 回傳預設與 null，save、saveImage 回傳 false，clear 什麼都不做，都不丟錯', () => {
    const state = normalize(LUNA, jobs);
    const blocked = createBlockedStorage();
    // 瀏覽器封鎖網站資料：讀、寫、刪都丟例外
    assert.deepEqual(plain(load(blocked, jobs)), { state: EXPECTED_DEFAULTS, image: null });
    assert.equal(save(blocked, state), false);
    assert.equal(saveImage(blocked, IMAGE), false);
    assert.equal(saveImage(blocked, null), false);
    assert.equal(clear(blocked), undefined);

    // 沒有儲存空間（頁面連 localStorage 都拿不到時傳 null）：同樣算沒有，不丟錯
    for (const none of [null, undefined]) {
        assert.deepEqual(plain(load(none, jobs)), { state: EXPECTED_DEFAULTS, image: null }, util.inspect(none));
        assert.equal(save(none, state), false);
        assert.equal(saveImage(none, IMAGE), false);
        assert.equal(saveImage(none, null), false);
        assert.equal(clear(none), undefined);
    }
    // 不是 storage 的東西（沒有 getItem 等方法）也一樣
    assert.deepEqual(plain(load({}, jobs)), { state: EXPECTED_DEFAULTS, image: null });
    assert.equal(save({}, state), false);
    assert.equal(saveImage({}, IMAGE), false);
    assert.equal(clear({}), undefined);

    // 只有讀丟例外：欄位與圖片都是預設；其他操作照常
    const readBlocked = createStorage({ [STORAGE_KEY]: JSON.stringify(LUNA), [IMAGE_KEY]: IMAGE });
    readBlocked.getItem = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    assert.deepEqual(plain(load(readBlocked, jobs)), { state: EXPECTED_DEFAULTS, image: null });
    assert.equal(save(readBlocked, state), true);

    // 只讀得到圖片（欄位那一個鍵丟例外）：圖片照讀
    const halfBlocked = createStorage({ [IMAGE_KEY]: IMAGE });
    const realGet = halfBlocked.getItem;
    halfBlocked.getItem = function getItem(key) {
        if (key === STORAGE_KEY) throw new DOMException('The operation is insecure.', 'SecurityError');
        return realGet.call(this, key);
    };
    assert.deepEqual(plain(load(halfBlocked, jobs)), { state: EXPECTED_DEFAULTS, image: IMAGE });
});

test('setItem 丟 QuotaExceededError：save、saveImage 回傳 false，不丟錯，存著的不動', () => {
    const state = normalize(LUNA, jobs);
    const OLD_IMAGE = 'data:image/jpeg;base64,OLD';
    const full = createFullStorage({ [STORAGE_KEY]: JSON.stringify({ ...LUNA, name: 'Rin Moonfall' }), [IMAGE_KEY]: OLD_IMAGE });

    // 圖片太大存不進去：回傳 false，以前存的圖與欄位都還在（不會先刪再寫）
    assert.equal(saveImage(full, IMAGE), false);
    assert.equal(full.data.get(IMAGE_KEY), OLD_IMAGE);
    assert.deepEqual(writes(full), [['set', IMAGE_KEY]]);
    assert.equal(save(full, state), false);
    assert.equal(JSON.parse(full.data.get(STORAGE_KEY)).name, 'Rin Moonfall');
    // 讀與刪不受影響
    assert.equal(plain(load(full, jobs).state).name, 'Rin Moonfall');
    assert.equal(load(full, jobs).image, OLD_IMAGE);
    assert.equal(saveImage(full, null), true);
    assert.equal(full.data.has(IMAGE_KEY), false);
    assert.equal(clear(full), undefined);
    assert.deepEqual([...full.data.keys()], []);

    // 丟的不是 DOMException（舊瀏覽器或別的實作）也一樣
    const odd = createStorage();
    odd.setItem = () => { throw 'quota'; };
    assert.equal(save(odd, state), false);
    assert.equal(saveImage(odd, IMAGE), false);
});

test('save 與 saveImage 不寫 load 讀不了的東西', () => {
    const state = normalize(LUNA, jobs);
    // 圖片：null 是刪掉，data:image/ 開頭的字串是存，其他都不寫（也不刪）、回傳 false
    const storage = createStorage({ [IMAGE_KEY]: IMAGE });
    for (const bad of [undefined, '', 'https://example.invalid/luna.png', 'data:text/plain,hello', 7, {}, ['data:image/png;base64,AAAA'], true]) {
        assert.equal(saveImage(storage, bad), false, util.inspect(bad));
    }
    assert.deepEqual(writes(storage), []);
    assert.equal(storage.data.get(IMAGE_KEY), IMAGE);

    // 欄位：不是物件的不寫（JSON.stringify(undefined) 不是字串，存進去會變成 'undefined' 四個字）
    for (const bad of [undefined, null, 'x', 42, true]) {
        assert.equal(save(storage, bad), false, util.inspect(bad));
    }
    assert.deepEqual(writes(storage), []);
    assert.equal(storage.data.has(STORAGE_KEY), false);
    // 轉不成 JSON（循環參照）：回傳 false，不丟錯
    const loop = { ...state };
    loop.self = loop;
    assert.equal(save(storage, loop), false);
    assert.equal(storage.data.has(STORAGE_KEY), false);
    // 正常的存得進去
    assert.equal(save(storage, state), true);
});

test('clear：其中一個鍵刪不掉，另一個照刪', () => {
    for (const failing of [STORAGE_KEY, IMAGE_KEY]) {
        const storage = createStorage({ [STORAGE_KEY]: JSON.stringify(LUNA), [IMAGE_KEY]: IMAGE, other: 'keep' });
        const realRemove = storage.removeItem;
        storage.removeItem = function removeItem(key) {
            if (key === failing) throw new DOMException('The operation is insecure.', 'SecurityError');
            return realRemove.call(this, key);
        };
        assert.equal(clear(storage), undefined);
        const left = [...storage.data.keys()].sort();
        assert.deepEqual(left, [failing, 'other'].sort(), `${failing} 刪不掉時`);
    }
});
