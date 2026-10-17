const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PartyNames = require('../tools/treasure-map-finder/party-names.js');
const { translationValues } = require('./helpers/translation-parsers.js');

// ---------- PartyNames（tools/treasure-map-finder/party-names.js） ----------
// 不碰 DOM，直接 require。storage 用記憶體替身（Storage 找不到 key 時 getItem 回傳 null）；
// 要看「寫了什麼」或「讀寫丟例外」的測試用記錄呼叫的替身。
const ROOT = path.join(__dirname, '..');
const TRANSLATIONS = 'assets/js/i18n/translations/tools/treasure-map-finder.js';
const TAG_KEY = 'ff14tw_nickname_tag';
const NICKNAME_KEY = 'ff14tw_user_nickname';

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        map,
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: key => { map.delete(key); }
    };
}

// 每一次呼叫都記進 calls；throws 列出的方法一被呼叫就丟例外（瀏覽器封鎖網站資料時 localStorage 的樣子）
function recordingStorage(initial = {}, throws = []) {
    const storage = memoryStorage(initial);
    const calls = [];
    const wrap = name => (...args) => {
        calls.push([name, ...args]);
        if (throws.includes(name)) throw new Error('SecurityError');
        return storage[name](...args);
    };
    return { calls, map: storage.map, getItem: wrap('getItem'), setItem: wrap('setItem'), removeItem: wrap('removeItem') };
}

// fillRandom 替身：第 n 次被呼叫就把第 n 批填進收到的位元組（批數不夠就一直用最後一批；一批不滿 16 個時後面是 0）。
// 只就地填入、回傳 undefined，所以 randomTag 如果去讀回傳值就會壞掉
function fillWith(...batches) {
    const received = [];
    const fill = bytes => {
        received.push(bytes);
        bytes.set(batches[Math.min(received.length, batches.length) - 1]);
    };
    return { fill, received };
}

// getText 替身：簽名同 FF14Utils.getI18nText(key, 中文預設文字, params)，沒有翻譯檔，直接把 {參數} 代進預設文字
function getTextStub(calls = []) {
    return (key, fallback, params) => {
        calls.push([key, fallback, params]);
        return fallback.replace(/\{(\w+)\}/g, (match, name) => (params && name in params ? String(params[name]) : match));
    };
}

test('常數：31 個不易看錯的字元、3 碼、存檔 key、20 字上限、三種語言的開頭與舊預設樣式', () => {
    const alphabet = PartyNames.TAG_ALPHABET;
    assert.equal(alphabet, '23456789ABCDEFGHJKMNPQRSTUVWXYZ');
    assert.equal(alphabet.length, 31);
    assert.equal(new Set(alphabet).size, 31, '字元不重複');
    for (const char of '01ILO') assert.ok(!alphabet.includes(char), `${char} 容易看錯，不能放進字串`);
    assert.equal(PartyNames.TAG_LENGTH, 3);
    assert.equal(PartyNames.TAG_KEY, TAG_KEY);
    assert.equal(PartyNames.NICKNAME_KEY, NICKNAME_KEY);
    assert.equal(PartyNames.MAX_NICKNAME, 20);
    assert.deepEqual(PartyNames.BASES, { zh: '光之戰士', en: 'Warrior of Light', ja: '光の戦士' });
    // 沒有 g／y 旗標：test() 不會記住上一次比到哪裡，同一個字串每次的結果都一樣
    assert.equal(PartyNames.LEGACY_DEFAULT.flags, '');
    assert.equal(PartyNames.LEGACY_DEFAULT.source, '^(光之戰士|Warrior of Light|光の戦士) ?\\d*$');
});

test('randomTag：只接受 < 248 的位元組再取餘數', () => {
    // 250 丟掉；30、61、92 除以 31 的餘數都是 30，對到最後一個字元 Z
    const first = fillWith([250, 30, 61, 92]);
    assert.equal(PartyNames.randomTag(first.fill), 'ZZZ');
    assert.equal(first.received.length, 1, '湊滿 3 個就停，不再多填');
    assert.ok(first.received[0] instanceof Uint8Array);
    assert.equal(first.received[0].length, 16);
    // 0 → 2、8 → A、247（最大的合格位元組）→ Z
    assert.equal(PartyNames.randomTag(fillWith([0, 8, 247]).fill), '2AZ');
    // 第一批全是 >= 248 的：一個都不能用，再填一次
    const retry = fillWith(new Array(16).fill(255), [5, 6, 7]);
    assert.equal(PartyNames.randomTag(retry.fill), '789');
    assert.equal(retry.received.length, 2);
    // 第一批只有一個合格的：留著它，第二批補上剩下的
    const partial = fillWith([...new Array(15).fill(255), 8], [0, 1]);
    assert.equal(PartyNames.randomTag(partial.fill), 'A23');
    assert.equal(partial.received.length, 2);
});

test('randomTag：248 個合格的位元組平均分給 31 個字元，每個字元剛好 8 個；248～255 一律丟掉', () => {
    const counts = new Map();
    for (let byte = 0; byte < 248; byte++) {
        const tag = PartyNames.randomTag(bytes => bytes.fill(byte));
        assert.equal(tag, PartyNames.TAG_ALPHABET[byte % 31].repeat(3), String(byte));
        counts.set(tag[0], (counts.get(tag[0]) ?? 0) + 1);
    }
    assert.equal(counts.size, 31);
    assert.deepEqual([...new Set(counts.values())], [8]);

    for (let byte = 248; byte < 256; byte++) {
        const batches = fillWith(new Array(16).fill(byte), [0, 0, 0]);
        assert.equal(PartyNames.randomTag(batches.fill), '222', String(byte));
        assert.equal(batches.received.length, 2, String(byte));
    }
});

test('randomTag：用真的亂數時是 3 個允許的字元', () => {
    for (let i = 0; i < 200; i++) {
        const tag = PartyNames.randomTag();
        assert.equal(PartyNames.isTag(tag), true, tag);
    }
});

test('isTag：剛好 3 個允許的字元；不去空白、不認小寫、不認 0／1／I／L／O，也不是字串的都不算', () => {
    for (const tag of ['2AZ', 'ZZZ', '789', 'K7Q']) assert.equal(PartyNames.isTag(tag), true, tag);
    for (const value of ['abc', '2az', '2AZ ', ' 2AZ', 'IOL', '012', '1AB', 'A0B', '12', '2AZZ', '', '2A😀', null, undefined, 234, ['2AZ'], { length: 3 }]) {
        assert.equal(PartyNames.isTag(value), false, String(value));
    }
});

test('readTag：合格的照用不重寫；不合格（abc、尾巴多空白、IOL、12、沒存）重新產生並存起來', () => {
    let generated = 0;
    const generate = () => { generated += 1; return 'K7Q'; };

    const good = recordingStorage({ [TAG_KEY]: '2AZ' });
    assert.equal(PartyNames.readTag(good, generate), '2AZ');
    assert.equal(generated, 0, '用不到新的就不產生');
    assert.deepEqual(good.calls, [['getItem', TAG_KEY]], '只讀不寫');

    for (const bad of ['abc', '2AZ ', 'IOL', '12', null]) {
        const storage = recordingStorage(bad === null ? {} : { [TAG_KEY]: bad });
        assert.equal(PartyNames.readTag(storage, generate), 'K7Q', String(bad));
        assert.deepEqual(storage.calls, [['getItem', TAG_KEY], ['setItem', TAG_KEY, 'K7Q']], String(bad));
        assert.equal(storage.map.get(TAG_KEY), 'K7Q', `${bad}：壞掉的存值被蓋掉`);
    }
    assert.equal(generated, 5);
});

test('readTag：storage 是 null、讀寫丟例外時照樣回傳新產生的；預設用 randomTag，存好之後一直用同一組', () => {
    assert.equal(PartyNames.readTag(null, () => 'K7Q'), 'K7Q');
    assert.equal(PartyNames.readTag(recordingStorage({}, ['setItem']), () => 'K7Q'), 'K7Q');
    assert.equal(PartyNames.readTag(recordingStorage({ [TAG_KEY]: '2AZ' }, ['getItem', 'setItem']), () => 'K7Q'), 'K7Q');

    const storage = memoryStorage();
    const tag = PartyNames.readTag(storage);
    assert.equal(PartyNames.isTag(tag), true);
    assert.equal(storage.map.get(TAG_KEY), tag);
    for (let i = 0; i < 20; i++) assert.equal(PartyNames.readTag(storage), tag);
});

test('defaultName：光之戰士K7Q、光の戦士K7Q、Warrior of Light K7Q（剛好 20 字）；不認得的語言用中文', () => {
    assert.equal(PartyNames.defaultName('zh', 'K7Q'), '光之戰士K7Q');
    assert.equal(PartyNames.defaultName('ja', 'K7Q'), '光の戦士K7Q');
    assert.equal(PartyNames.defaultName('en', 'K7Q'), 'Warrior of Light K7Q');
    assert.equal(PartyNames.defaultName('en', 'K7Q').length, PartyNames.MAX_NICKNAME);
    for (const language of ['fr', '', undefined, null]) {
        assert.equal(PartyNames.defaultName(language, 'K7Q'), '光之戰士K7Q', String(language));
    }
    // 不管哪種語言、哪一組字串，預設名字都放得進伺服器的 20 字上限
    for (const language of Object.keys(PartyNames.BASES)) {
        assert.ok(PartyNames.defaultName(language, 'ZZZ').length <= PartyNames.MAX_NICKNAME, language);
    }
});

test('savedNickname：去頭尾空白；空的、21 字、光之戰士、光之戰士1、Warrior of Light 1、光の戦士12 都是 null；getItem 丟例外是 null', () => {
    const saved = value => PartyNames.savedNickname(memoryStorage(value === undefined ? {} : { [NICKNAME_KEY]: value }));

    assert.equal(saved('Alice'), 'Alice');
    assert.equal(saved('  Alice \n'), 'Alice');
    assert.equal(saved('x'.repeat(20)), 'x'.repeat(20));
    assert.equal(saved(` ${'x'.repeat(20)} `), 'x'.repeat(20), '長度是去掉頭尾空白之後算的');
    // 字串的樣式、但不是舊預設樣式（舊樣式只有數字）：玩家自己取的名字，照用
    assert.equal(saved('光之戰士M4X'), '光之戰士M4X');

    for (const value of [
        undefined, '', '   ', 'x'.repeat(21), ` ${'x'.repeat(21)} `,
        '光之戰士', '光之戰士1', ' 光之戰士1 ', 'Warrior of Light', 'Warrior of Light 1', '光の戦士12'
    ]) {
        assert.equal(saved(value), null, JSON.stringify(value));
    }

    assert.equal(PartyNames.savedNickname(recordingStorage({ [NICKNAME_KEY]: 'Alice' }, ['getItem'])), null);
    assert.equal(PartyNames.savedNickname(null), null);
});

test('resolveNickname：存過的優先，沒有就是預設名字', () => {
    assert.equal(PartyNames.resolveNickname(memoryStorage({ [NICKNAME_KEY]: 'Alice' }), 'en', 'K7Q'), 'Alice');
    assert.equal(PartyNames.resolveNickname(memoryStorage(), 'en', 'K7Q'), 'Warrior of Light K7Q');
    assert.equal(PartyNames.resolveNickname(memoryStorage(), 'ja', 'K7Q'), '光の戦士K7Q');
    // 舊預設樣式的存值不算玩家自己的名字，用預設名字
    assert.equal(PartyNames.resolveNickname(memoryStorage({ [NICKNAME_KEY]: '光之戰士1' }), 'zh', 'K7Q'), '光之戰士K7Q');
    // 儲存空間不能用：照常用預設名字
    assert.equal(PartyNames.resolveNickname(null, 'zh', 'K7Q'), '光之戰士K7Q');
    assert.equal(PartyNames.resolveNickname(recordingStorage({}, ['getItem']), 'zh', 'K7Q'), '光之戰士K7Q');
});

test('rememberRename：沒變不寫；Alice 寫入；改成預設名字或舊預設樣式會刪掉存值；storage 丟例外不丟出', () => {
    const rename = (name, { previous = '光之戰士K7Q', stored = {} } = {}) => {
        const storage = recordingStorage(stored);
        PartyNames.rememberRename(storage, name, { previous, tag: 'K7Q' });
        return storage;
    };

    // 沒變：什麼都不碰（頭尾空白不算改）
    assert.deepEqual(rename('光之戰士K7Q').calls, []);
    assert.deepEqual(rename('  Alice ', { previous: 'Alice' }).calls, []);

    // 新名字：去頭尾空白後寫進去
    const renamed = rename('  Alice ');
    assert.deepEqual(renamed.calls, [['setItem', NICKNAME_KEY, 'Alice']]);
    assert.equal(renamed.map.get(NICKNAME_KEY), 'Alice');

    // 改成這台機器的預設名字（任何一種語言開頭加上自己的字串），或舊預設樣式：刪掉存值，下次組隊回到預設名字
    for (const name of ['光之戰士K7Q', 'Warrior of Light K7Q', '光の戦士K7Q', ' 光之戰士K7Q ', '光之戰士5', '光之戰士', 'Warrior of Light 12']) {
        const storage = rename(name, { previous: 'Alice', stored: { [NICKNAME_KEY]: 'Alice' } });
        assert.deepEqual(storage.calls, [['removeItem', NICKNAME_KEY]], name);
        assert.equal(storage.map.has(NICKNAME_KEY), false, name);
    }

    // 別台機器的字串不是這台的預設名字，是玩家取的名字
    assert.deepEqual(rename('光之戰士M4X').calls, [['setItem', NICKNAME_KEY, '光之戰士M4X']]);

    // 寫不進去、刪不掉、根本沒有 storage：改名照常，不丟例外
    for (const [name, throws] of [['Alice', ['setItem']], ['光之戰士K7Q', ['removeItem']]]) {
        assert.doesNotThrow(() => PartyNames.rememberRename(recordingStorage({}, throws), name, { previous: 'Bob', tag: 'K7Q' }), name);
    }
    assert.doesNotThrow(() => PartyNames.rememberRename(null, 'Alice', { previous: 'Bob', tag: 'K7Q' }));
    assert.doesNotThrow(() => PartyNames.rememberRename(null, '光之戰士K7Q', { previous: 'Bob', tag: 'K7Q' }));
});

test('validKnownMembers：留合格的；陣列、null、字串回 {}；非字串值、空字串、21 字的值丟掉；70 筆只留 64 筆', () => {
    assert.deepEqual(PartyNames.validKnownMembers({ u1: 'Alice', u2: '光之戰士M4X' }), { u1: 'Alice', u2: '光之戰士M4X' });

    for (const bad of [null, undefined, [], [['u1', 'Alice']], ['Alice'], 'Alice', '{"u1":"Alice"}', 5, true, new Map([['u1', 'Alice']]), new Date()]) {
        assert.deepEqual(PartyNames.validKnownMembers(bad), {}, String(bad));
    }

    assert.deepEqual(PartyNames.validKnownMembers({
        ok: 'Alice',
        number: 5, nothing: null, object: { name: 'Bob' }, list: ['Bob'], flag: true,
        empty: '', blank: '   ',
        long: 'x'.repeat(21)
    }), { ok: 'Alice' });

    // 值是去掉頭尾空白之後算 1～20 字，存的也是去掉頭尾空白的
    assert.deepEqual(PartyNames.validKnownMembers({ a: ' Alice ', b: ` ${'x'.repeat(20)} `, c: 'x'.repeat(20) }),
        { a: 'Alice', b: 'x'.repeat(20), c: 'x'.repeat(20) });
    // key 要 1～64 字
    assert.deepEqual(PartyNames.validKnownMembers({ '': 'Alice', ['k'.repeat(64)]: 'Bob', ['k'.repeat(65)]: 'Carol' }), { ['k'.repeat(64)]: 'Bob' });
});

test('validKnownMembers：70 筆只留前 64 筆；名額算的是合格的項目；回傳新的物件', () => {
    const many = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`m${i}`, `名字${i}`]));
    const kept = PartyNames.validKnownMembers(many);
    assert.deepEqual(Object.keys(kept), Object.keys(many).slice(0, 64));
    assert.equal(kept.m63, '名字63');
    assert.equal('m64' in kept, false);

    // 前面不合格的項目不佔名額
    const withBad = { ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`bad${i}`, i])), ...many };
    assert.deepEqual(Object.keys(PartyNames.validKnownMembers(withBad)), Object.keys(many).slice(0, 64));

    const input = { u1: 'Alice' };
    const output = PartyNames.validKnownMembers(input);
    assert.notEqual(output, input);
    output.u2 = 'Bob';
    assert.deepEqual(input, { u1: 'Alice' });
});

test('ownerOf：me／member／left 有名字／left 沒名字／addedBy 空的是 null', () => {
    const context = {
        members: [{ id: 'u1', nickname: '光之戰士K7Q', isCreator: true }, { id: 'u2', nickname: '光之戰士M4X' }],
        knownMembers: { u2: '光之戰士舊名', u3: '光之戰士R6V' },
        meId: 'u1'
    };
    assert.deepEqual(PartyNames.ownerOf({ addedBy: 'u1' }, context), { kind: 'me', id: 'u1', name: '光之戰士K7Q' });
    // 還在隊伍裡的用現在的名字（改過名的話看過的舊名字不算）
    assert.deepEqual(PartyNames.ownerOf({ addedBy: 'u2' }, context), { kind: 'member', id: 'u2', name: '光之戰士M4X' });
    assert.deepEqual(PartyNames.ownerOf({ addedBy: 'u3' }, context), { kind: 'left', id: 'u3', name: '光之戰士R6V' });
    assert.deepEqual(PartyNames.ownerOf({ addedBy: 'u4' }, context), { kind: 'left', id: 'u4', name: null });

    for (const addedBy of [undefined, null, '']) assert.equal(PartyNames.ownerOf({ addedBy }, context), null, String(addedBy));
    assert.equal(PartyNames.ownerOf({}, context), null);
    assert.equal(PartyNames.ownerOf(null, context), null);
});

test('ownerOf：隊伍資料還沒到、欄位缺漏時不丟例外；用 id 找名字不會找到 Object 原型上的東西', () => {
    // 自己的 id 一對就是 me，就算成員列表裡還找不到自己
    assert.deepEqual(PartyNames.ownerOf({ addedBy: 'u1' }, { meId: 'u1' }), { kind: 'me', id: 'u1', name: null });
    assert.deepEqual(PartyNames.ownerOf({ addedBy: 'u9' }, { members: null, knownMembers: null, meId: 'u1' }), { kind: 'left', id: 'u9', name: null });
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
        const owner = PartyNames.ownerOf({ addedBy: id }, { members: [], knownMembers: {}, meId: 'u1' });
        assert.deepEqual(owner, { kind: 'left', id, name: null }, id);
    }
});

test('ownerLabel 與 sentenceOwner：四種情況的字', () => {
    const getText = getTextStub();
    const me = { kind: 'me', id: 'u1', name: '光之戰士K7Q' };
    const member = { kind: 'member', id: 'u2', name: '光之戰士M4X' };
    const left = { kind: 'left', id: 'u3', name: '光之戰士R6V' };
    const unknown = { kind: 'left', id: 'u4', name: null };

    // 清單與路線那一行
    assert.equal(PartyNames.ownerLabel(me, getText), '你的圖');
    assert.equal(PartyNames.ownerLabel(member, getText), '光之戰士M4X 的圖');
    assert.equal(PartyNames.ownerLabel(left, getText), '光之戰士R6V（已離開）的圖');
    assert.equal(PartyNames.ownerLabel(unknown, getText), '已離開隊員的圖');
    assert.equal(PartyNames.ownerLabel(null, getText), null);

    // 複製句子用的名字：自己寫自己的名字不寫「你」；已離開的不管有沒有名字都一樣
    assert.equal(PartyNames.sentenceOwner(me, getText), '光之戰士K7Q');
    assert.equal(PartyNames.sentenceOwner(member, getText), '光之戰士M4X');
    assert.equal(PartyNames.sentenceOwner(left, getText), '已離開隊員');
    assert.equal(PartyNames.sentenceOwner(unknown, getText), '已離開隊員');
    assert.equal(PartyNames.sentenceOwner(null, getText), null);
});

test('ownerLabel：成員沒有可用的名字時不會把 null 寫進字裡；認不得的 kind 不顯示', () => {
    const getText = getTextStub();
    assert.doesNotMatch(PartyNames.ownerLabel({ kind: 'member', id: 'u2', name: null }, getText), /null|undefined/);
    assert.equal(PartyNames.ownerLabel({ kind: 'left', id: 'u3', name: '' }, getText), '已離開隊員的圖');
    assert.equal(PartyNames.ownerLabel({ kind: 'stranger', id: 'u5', name: 'X' }, getText), null);
    assert.equal(PartyNames.sentenceOwner({ kind: 'me', id: 'u1', name: null }, getText), null);
});

test('翻譯檔：五個鍵值三種語言的字就是規定的字，程式裡的中文預設文字和中文翻譯一模一樣', () => {
    const expected = {
        treasure_map_owner_me: { zh: '你的圖', en: 'Your map', ja: 'あなたの地図' },
        treasure_map_owner_member: { zh: '{name} 的圖', en: "{name}'s map", ja: '{name}の地図' },
        treasure_map_owner_left: { zh: '{name}（已離開）的圖', en: "{name}'s map (left)", ja: '{name}（退出済み）の地図' },
        treasure_map_owner_left_unknown: { zh: '已離開隊員的圖', en: "A former member's map", ja: '退出したメンバーの地図' },
        treasure_map_owner_former: { zh: '已離開隊員', en: 'a former member', ja: '退出したメンバー' }
    };
    for (const lang of ['zh', 'en', 'ja']) {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(expected)) assert.equal(values.get(key), texts[lang], `${lang} ${key}`);
    }

    // 程式用的鍵值與預設文字：五種情況各呼叫一次，逐一對照中文翻譯
    const calls = [];
    const getText = getTextStub(calls);
    for (const owner of [
        { kind: 'me', id: 'u1', name: 'A' }, { kind: 'member', id: 'u2', name: 'B' },
        { kind: 'left', id: 'u3', name: 'C' }, { kind: 'left', id: 'u4', name: null }
    ]) PartyNames.ownerLabel(owner, getText);
    PartyNames.sentenceOwner({ kind: 'left', id: 'u3', name: 'C' }, getText);
    assert.deepEqual(calls.map(([key]) => key), Object.keys(expected));
    const zh = translationValues(TRANSLATIONS, 'zh');
    for (const [key, fallback] of calls) assert.equal(fallback, zh.get(key), key);
    // 名字用 {name} 代入
    assert.deepEqual(calls[1][2], { name: 'B' });
    assert.deepEqual(calls[2][2], { name: 'C' });
});

test('匯出：瀏覽器（沒有 module）掛在 window.PartyNames，頂層的 class 留在同一個全域給其他 <script> 用', () => {
    const source = fs.readFileSync(path.join(ROOT, 'tools/treasure-map-finder/party-names.js'), 'utf8');
    const window = {};
    const context = vm.createContext({ window });
    vm.runInContext(source, context, { filename: 'party-names.js' });
    assert.equal(typeof window.PartyNames, 'function');
    assert.equal(vm.runInContext('typeof PartyNames', context), 'function');
    assert.equal(window.PartyNames.defaultName('zh', 'K7Q'), '光之戰士K7Q');
});

test('index.html：party-names.js 載入一次，排在 room-map-sync.js 前面', () => {
    const html = fs.readFileSync(path.join(ROOT, 'tools/treasure-map-finder/index.html'), 'utf8');
    // 每一個 <script> 開始標籤的 src，照出現的順序；只讀開始標籤裡的屬性，不用正規表示式比對整個 script 元素
    const sources = html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
    assert.equal(sources.filter(src => src === 'party-names.js').length, 1);
    assert.ok(sources.includes('room-map-sync.js'));
    assert.ok(sources.indexOf('party-names.js') < sources.indexOf('room-map-sync.js'), sources.join('\n'));
});
