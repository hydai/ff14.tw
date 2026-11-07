const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// dungeon-list.js 把 DungeonList 掛在 window 上，所以讓 window 指向 context 本身（同 cactpot-solver.test.js）
function loadList() {
    const context = vm.createContext({});
    context.window = context;
    const file = path.resolve(__dirname, '../tools/dungeon-database/dungeon-list.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: 'dungeon-list.js' });
    return context.DungeonList;
}

const DungeonList = loadList();
// 故意用解構取出：頁面不一定用 DungeonList.xxx() 的寫法呼叫，這些函式不能靠 this
const { BATCH, VERSION_ORDER, prepare, normalizeQuery, matches, filter, hits, segments, reward } = DungeonList;

const RAW = fs.readFileSync(path.join(__dirname, '../data/dungeons.json'), 'utf8');
const data = JSON.parse(RAW);
const list = prepare(data);
const byName = (name) => list.find((dungeon) => dungeon.name === name);
// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));
// 用 Array.from 在這邊建陣列：vm 陣列的 .map() 會回傳 vm 的陣列
const namesOf = (dungeons) => Array.from(dungeons, (dungeon) => dungeon.name);
const idsOf = (dungeons) => Array.from(dungeons, (dungeon) => dungeon.id);
const filterNames = (options) => namesOf(filter(list, options));

function deepFreeze(value) {
    for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
    return Object.freeze(value);
}

test('prepare：只取顯示中的、版本由新到舊、同版本照資料順序', () => {
    assert.equal(list.length, 362);
    // 第 1、30、31、60、61 個：每批 30 個的頭尾
    assert.deepEqual(
        [0, 29, 30, 59, 60].map((index) => list[index].name),
        ['叢林競流生息河岸', '阿卡狄亞零式登天鬥技場 輕量級2', '阿卡狄亞零式登天鬥技場 輕量級3', '佐迪亞克暝暗殲滅戰', '海德林暉光殲滅戰']
    );

    // 版本照 VERSION_ORDER 不遞減，同版本照資料順序（id 也遞增）
    const rank = (dungeon) => VERSION_ORDER.indexOf(dungeon.expansion);
    for (let i = 1; i < list.length; i++) {
        const [before, after] = [list[i - 1], list[i]];
        const label = `${before.id} ${before.name} (${before.expansion}) → ${after.id} ${after.name} (${after.expansion})`;
        assert.ok(rank(before) >= 0 && rank(after) >= 0, `不認得的版本：${label}`);
        assert.ok(rank(before) <= rank(after), `版本要由新到舊：${label}`);
        if (rank(before) === rank(after)) {
            assert.ok(before.id < after.id, `同版本 id 要遞增：${label}`);
            assert.ok(data.dungeons.indexOf(before) < data.dungeons.indexOf(after), `同版本要照資料順序：${label}`);
        }
    }

    // 元素是資料裡同一批物件（都是顯示中的），陣列是新的
    assert.ok(list.every((dungeon) => dungeon.visible !== false && data.dungeons.includes(dungeon)), '元素要是資料裡顯示中的同一批物件');
    assert.notEqual(list, data.dungeons);

    // 小資料：沒寫 visible 與 visible: true 都顯示，visible: false 不顯示；7.x 在 2.x 前面
    const small = [{ id: 1, expansion: '2.x' }, { id: 2, expansion: '7.x' }, { id: 3, expansion: '2.x', visible: false }, { id: 4, expansion: '7.x', visible: true }];
    assert.deepEqual(idsOf(prepare({ dungeons: small })), [2, 4, 1]);
    // 不認得的版本（資料寫錯）不會被吃掉，也不會跑到最前面：排在最後，彼此照資料順序
    const odd = [{ id: 1, expansion: '9.x' }, { id: 2, expansion: '2.x' }, { id: 3, expansion: '7.x' }, { id: 4, expansion: '9.x' }];
    assert.deepEqual(idsOf(prepare({ dungeons: odd })), [3, 2, 1, 4]);
});

test('normalizeQuery：去掉前後空白、轉小寫', () => {
    assert.equal(normalizeQuery('  泥小點  '), '泥小點');
    assert.equal(normalizeQuery('SaStAsHa'), 'sastasha');
    assert.equal(normalizeQuery('   '), '');
    // 中文輸入法常打出全形空白；只去掉前後，中間的空白不動
    assert.equal(normalizeQuery('　 2B  A 　'), '2b  a');
    // 沒有值（輸入框還沒有內容）不會變成「undefined」三個字
    assert.equal(normalizeQuery(undefined), '');
    assert.equal(normalizeQuery(null), '');
});

test('matches：名稱、簡介、機制與每一項掉落物，其他欄位不算', () => {
    const dungeon = {
        name: 'Alpha 名稱',
        description: 'Bravo 簡介',
        mechanics: 'Charlie 機制',
        specialDrops: ['Delta 掉落', 'Echo 掉落'],
        type: 'Foxtrot',
        expansion: 'Golf',
        tombstoneReward: 'Hotel: 1'
    };
    // query 是 normalizeQuery() 的結果（小寫），資料裡的大寫不影響
    for (const query of ['alpha', 'bravo', 'charlie', 'delta', 'echo', '名稱', '簡介', '機制', '掉落']) {
        assert.equal(matches(dungeon, query), true, query);
    }
    // 類型、版本、獎勵不搜；每個欄位各自比對，跨欄位接起來的字不算（兩項掉落物之間也一樣）
    for (const query of ['foxtrot', 'golf', 'hotel', '名稱bravo', '簡介charlie', '機制delta', '掉落echo', 'zulu']) {
        assert.equal(matches(dungeon, query), false, query);
    }
    assert.equal(matches(dungeon, ''), true, '沒有搜尋字＝符合');
    assert.equal(matches({ ...dungeon, specialDrops: [] }, 'delta'), false, '沒有掉落物也能比對');
    assert.equal(matches({ ...dungeon, specialDrops: [] }, ''), true);
});

test('filter：四個欄位、不分大小寫、或／且', () => {
    // 掉落物（泥小點）、機制（浮空）、簡介（天空的霸主）、名稱（河岸）各找得到
    assert.deepEqual(filterNames({ query: '泥小點' }), ['污染庭園聖茉夏娜植物園']);
    assert.deepEqual(filterNames({ query: '浮空' }), ['俾斯麥殲滅戰', '俾斯麥殲殛戰']);
    assert.deepEqual(filterNames({ query: '天空的霸主' }), ['俾斯麥殲滅戰']);
    assert.deepEqual(filterNames({ query: '河岸' }), ['叢林競流生息河岸']);
    // 不分大小寫：資料裡寫 2B，輸入 2b
    assert.deepEqual(filterNames({ query: '2b' }), ['人偶軍事基地', '希望之砲臺：「塔」']);
    // 不是正規表示式：括號和點都是普通的字
    assert.deepEqual(filterNames({ query: '(' }), ['討伐大型妖異(注意無敵眷屬)']);
    assert.deepEqual(filterNames({ query: '.' }), []);
    // 沒有搜尋字，或什麼條件都沒給：全部，而且是新陣列
    assert.equal(filter(list, { query: '' }).length, 362);
    assert.equal(filter(list).length, 362);
    assert.notEqual(filter(list, {}), list);

    // 類型、版本：同一組裡是「或」，兩組之間是「且」，空的代表全部
    assert.equal(filter(list, { types: ['聯盟任務'] }).length, 16);
    assert.equal(filter(list, { types: ['聯盟任務'], versions: ['7.x'] }).length, 1);
    assert.equal(filter(list, { types: ['四人迷宮', '公會令'] }).length, 114);
    assert.equal(filter(list, { versions: new Set(['7.x', '6.x']) }).length, 95);
    assert.equal(filter(list, { types: ['絕境戰'], versions: ['2.x'] }).length, 0);
    // 陣列或 Set 都行
    assert.equal(filter(list, { types: new Set(['四人迷宮', '公會令']) }).length, 114);
    assert.equal(filter(list, { types: [], versions: new Set() }).length, 362);
    // 搜尋與篩選之間也是「且」
    assert.deepEqual(filterNames({ query: '浮空', types: ['8人討伐殲滅戰'] }), ['俾斯麥殲滅戰', '俾斯麥殲殛戰']);
    assert.deepEqual(filterNames({ query: '浮空', types: ['四人迷宮'] }), []);
    assert.deepEqual(filterNames({ query: '浮空', versions: ['3.x'] }), ['俾斯麥殲滅戰', '俾斯麥殲殛戰']);
    assert.deepEqual(filterNames({ query: '浮空', versions: ['2.x'] }), []);

    // 結果的順序和 list 一樣，元素是同一批物件
    const cases = [
        ['搜尋', { query: 's' }],
        ['類型（或）', { types: ['四人迷宮', '公會令'] }],
        ['版本（Set）', { versions: new Set(['7.x', '6.x']) }],
        ['搜尋＋類型＋版本', { query: '的', types: ['8人大型任務'], versions: ['5.x', '3.x'] }]
    ];
    for (const [label, options] of cases) {
        const result = filter(list, options);
        assert.ok(result.length > 0 && result.length < list.length, `${label}：要篩掉一部分、也留下一部分`);
        assert.deepEqual(idsOf(result), idsOf(list.filter((dungeon) => result.includes(dungeon))), `${label}：順序要和 list 一樣、元素要是同一批物件`);
    }
});

test('hits：命中的欄位', () => {
    const none = { drop: null, mechanics: false, description: false };
    assert.deepEqual(
        plain(hits(byName('俾斯麥殲殛戰'), '俾斯麥')),
        { drop: { text: '九宮幻卡：俾斯麥', more: 2 }, mechanics: false, description: true }
    );
    assert.deepEqual(plain(hits(byName('俾斯麥殲滅戰'), '浮空')), { drop: null, mechanics: true, description: false });
    // 不看名稱：只有名稱命中，或沒有搜尋字，都是什麼也沒命中
    assert.deepEqual(plain(hits(byName('叢林競流生息河岸'), '河岸')), none);
    assert.deepEqual(plain(hits(byName('叢林競流生息河岸'), '')), none);

    // 只有一項掉落物含搜尋字時 more 是 0；text 是資料原本的寫法（2B 不會變成 2b）
    assert.deepEqual(plain(hits(byName('人偶軍事基地'), '2b')), { drop: { text: '自走人偶2B', more: 0 }, mechanics: false, description: false });
    // 兩項含時，text 是資料順序裡的第一項
    assert.deepEqual(plain(hits(byName('希望之砲臺：「塔」'), '2b')), { drop: { text: '九宮幻卡：2B', more: 1 }, mechanics: false, description: false });
    // 機制與簡介可以同時命中；沒有掉落物也行
    const both = { name: 'x', description: 'A b', mechanics: 'a B', specialDrops: [] };
    assert.deepEqual(plain(hits(both, 'b')), { drop: null, mechanics: true, description: true });

    // hits() 與 matches() 看的是同一批欄位：名稱以外的欄位有命中，或名稱本身含搜尋字，matches() 才是 true
    for (const query of ['的', '九宮幻卡', 's', '2b', '浮空', '河岸', '(']) {
        for (const dungeon of list) {
            const found = hits(dungeon, query);
            const expected = dungeon.name.toLowerCase().includes(query) || found.drop !== null || found.mechanics || found.description;
            assert.equal(matches(dungeon, query), expected, `${dungeon.name}／${query}`);
        }
    }
});

test('segments：每一次出現都標、接回去還是原字', () => {
    assert.deepEqual(plain(segments('九宮幻卡：俾斯麥', '俾斯麥')), [{ text: '九宮幻卡：', hit: false }, { text: '俾斯麥', hit: true }]);
    // 不分大小寫，但片段取自原字：資料寫 2B、搜 2b，標出來的是 2B
    assert.deepEqual(plain(segments('自走人偶2B', '2b')), [{ text: '自走人偶', hit: false }, { text: '2B', hit: true }]);
    assert.deepEqual(plain(segments('aXbXc', 'x')), [
        { text: 'a', hit: false },
        { text: 'X', hit: true },
        { text: 'b', hit: false },
        { text: 'X', hit: true },
        { text: 'c', hit: false }
    ]);
    // 沒有搜尋字：整段一個
    assert.deepEqual(plain(segments('文字', '')), [{ text: '文字', hit: false }]);

    // 邊界：搜尋字在頭或尾不會多出空的片段；連在一起的出現各一段；沒出現就是整段一個
    assert.deepEqual(plain(segments('XaX', 'x')), [{ text: 'X', hit: true }, { text: 'a', hit: false }, { text: 'X', hit: true }]);
    assert.deepEqual(plain(segments('xx', 'x')), [{ text: 'x', hit: true }, { text: 'x', hit: true }]);
    assert.deepEqual(plain(segments('文字', '機制')), [{ text: '文字', hit: false }]);
    assert.deepEqual(plain(segments('', '機制')), [{ text: '', hit: false }]);
    // 出現的位置互相重疊時，從左邊數起、不重疊地標（aaa 裡找 aa 只標最左邊那一個）
    assert.deepEqual(plain(segments('aaa', 'aa')), [{ text: 'aa', hit: true }, { text: 'a', hit: false }]);
    // 不是正規表示式
    assert.deepEqual(plain(segments('a.b(c)', '.b(')), [{ text: 'a', hit: false }, { text: '.b(', hit: true }, { text: 'c)', hit: false }]);
});

test('segments：資料裡每一個名稱、機制、簡介與掉落物，切段後接起來都等於原字', () => {
    const texts = list.flatMap((dungeon) => [dungeon.name, dungeon.mechanics, dungeon.description, ...dungeon.specialDrops]);
    // segments() 用轉小寫後的字串找位置、從原字取片段：轉小寫會改變長度的字元（例如 İ）會讓標出來的位置歪掉，
    // 而位置歪了片段照樣接得回原字，所以要直接擋在資料上
    for (const text of texts) assert.equal(text.toLowerCase().length, text.length, `「${text}」轉小寫後長度變了`);
    for (const query of ['的', '九宮幻卡', 's']) {
        let hitCount = 0;
        for (const text of texts) {
            const parts = segments(text, query);
            assert.equal(Array.from(parts, (part) => part.text).join(''), text, `「${query}」切「${text}」，接回去和原字不一樣`);
            assert.equal(parts.some((part) => part.hit), text.toLowerCase().includes(query), `「${query}」在「${text}」有沒有標，和有沒有出現不一致`);
            for (const part of parts) {
                assert.notEqual(part.text, '', `「${query}」切「${text}」有空的片段`);
                if (part.hit) {
                    hitCount++;
                    assert.equal(part.text.toLowerCase(), query, `「${query}」切「${text}」，標出來的是「${part.text}」`);
                } else {
                    assert.ok(!part.text.toLowerCase().includes(query), `「${query}」切「${text}」，沒標的「${part.text}」還含有搜尋字`);
                }
            }
        }
        assert.ok(hitCount > 0, `「${query}」在資料裡一次都沒出現，這個測試沒有檢查到東西`);
    }
});

test('reward：「: 」換成空白，「無」是 null', () => {
    assert.equal(reward('黃金古典神典石: 130'), '黃金古典神典石 130');
    assert.equal(reward('無'), null);
    assert.equal(reward('黃金古典神典石: 50 20'), '黃金古典神典石 50 20');
    // 只換第一個「: 」
    assert.equal(reward('甲: 1: 2'), '甲 1: 2');

    // 資料裡的每一筆都轉得出來：只有「無」是 null，其他只換掉第一個「: 」
    for (const dungeon of list) {
        const text = dungeon.tombstoneReward;
        const shown = reward(text);
        if (text === '無') {
            assert.equal(shown, null, `${dungeon.name}：${text}`);
        } else {
            assert.equal(shown, text.replace(': ', ' '), `${dungeon.name}：${text}`);
            assert.ok(!shown.includes(': ') && shown.length === text.length - 1, `${dungeon.name}：${text} → ${shown}`);
        }
    }
});

test('常數', () => {
    assert.equal(BATCH, 30);
    assert.deepEqual(plain(VERSION_ORDER), ['7.x', '6.x', '5.x', '4.x', '3.x', '2.x']);
    assert.ok(Object.isFrozen(VERSION_ORDER), 'VERSION_ORDER 要凍結');
    assert.ok(Object.isFrozen(DungeonList), 'DungeonList 要凍結');
    // 資料裡的版本不多不少就是 VERSION_ORDER 這幾個（多一個版本，順序表就要跟著補，不然它會排到最後）
    assert.deepEqual(Object.keys(data.metadata.expansions).sort(), [...VERSION_ORDER].sort());
    // 頁面會用到的函式都在
    for (const name of ['prepare', 'normalizeQuery', 'matches', 'filter', 'hits', 'segments', 'reward']) {
        assert.equal(typeof DungeonList[name], 'function', name);
    }
});

test('不改傳進去的資料', () => {
    // 整份資料（含每個陣列）凍結：函式是嚴格模式，想改它的地方會丟 TypeError
    const frozen = deepFreeze(JSON.parse(RAW));
    const prepared = prepare(frozen);
    assert.deepEqual(idsOf(prepared), idsOf(list));
    assert.deepEqual(idsOf(frozen.dungeons), idsOf(data.dungeons), 'data.dungeons 的順序不變');

    const options = { query: '的', types: Object.freeze(['四人迷宮', '8人大型任務']), versions: Object.freeze(['3.x', '5.x']) };
    assert.deepEqual(idsOf(filter(Object.freeze([...prepared]), options)), idsOf(filter(list, options)));
    prepared.forEach((dungeon, index) => {
        for (const query of ['', '的', '2b', '浮空']) {
            assert.equal(matches(dungeon, query), matches(list[index], query));
            assert.equal(JSON.stringify(hits(dungeon, query)), JSON.stringify(hits(list[index], query)), `${dungeon.name}／${query}`);
        }
    });

    // 沒凍結的資料：呼叫之後內容和順序都沒變（沒有就地排序，也沒有多寫欄位）
    const copy = JSON.parse(RAW);
    const preparedCopy = prepare(copy);
    filter(preparedCopy, { query: '的', types: ['四人迷宮'], versions: ['3.x'] });
    for (const dungeon of preparedCopy) hits(dungeon, '的');
    assert.deepEqual(copy, JSON.parse(RAW));
    assert.deepEqual(idsOf(copy.dungeons), idsOf(data.dungeons));
});
