const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// chocobo-solver.js 把 ChocoboColorSolver 掛在 window 上，所以讓 window 指向 context 本身（同 cactpot-solver.test.js）
function loadSolver() {
    const context = vm.createContext({});
    context.window = context;
    const file = path.resolve(__dirname, '../tools/chocobo-color/chocobo-solver.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: 'chocobo-solver.js' });
    return context.ChocoboColorSolver;
}

const solver = loadSolver();
// 故意用解構取出：頁面不一定用 ChocoboColorSolver.xxx() 的寫法呼叫，這些函式不能靠 this
const { GROUP_KEYS, recipe, segments, plan, bestTotal, colorGroups } = solver;

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/chocobo-colors.json'), 'utf8'));
const CH = ['r', 'g', 'b'];
const fruitById = new Map(data.fruits.map((f) => [f.id, f]));
const colorById = new Map(data.colors.map((c) => [c.id, c]));
const RESET_RGB = colorById.get('desert-yellow').rgb;
const edge = (rgb) => Math.min(...rgb.map((v) => Math.min(v, 255 - v)));
const distance = (a, b) => a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0);
// vm 裡建出來的陣列與物件（包括 vm 陣列 .map() 的結果）原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));
// 用 Array.from 在這邊建陣列：list.map() 對 vm 陣列會回傳 vm 的陣列
const steps = (list) => Array.from(list, (s) => [s.fruit, s.count]);
// vm 裡丟出來的 RangeError 不是這邊 RangeError 的實例，assert.throws(…, RangeError) 會失敗，改比名稱
const isRangeError = (error) => error.name === 'RangeError';

// 照步驟餵一次：檸檬變回沙漠黃，其他每一顆加效果；回傳每一顆之後的 RGB
function feed(startRgb, list) {
    let rgb = [...startRgb];
    const after = [];
    for (const { fruit, count } of list) {
        const info = fruitById.get(fruit);
        for (let i = 0; i < count; i++) {
            rgb = info.resetsTo ? [...colorById.get(info.resetsTo).rgb] : rgb.map((v, c) => v + info.effect[CH[c]]);
            after.push(rgb);
        }
    }
    return after;
}

// 暴力搜尋：所有每一步都在 0～255 的餵法（把各種水果的顆數當多重集合，列舉每一種排列）裡，
// 最少段數是多少，以及那些餵法中「餵每一顆之後離 0／255 最近的一刻」最遠是多少；一種餵法都沒有時是 null
function bruteForce(startRgb, fruits) {
    const effects = fruits.map(({ fruit }) => CH.map((c) => fruitById.get(fruit).effect[c]));
    const left = fruits.map((f) => f.count);
    const total = left.reduce((a, b) => a + b, 0);
    let best = null;
    const walk = (rgb, last, runs, margin, fed) => {
        if (fed === total) {
            if (!best || runs < best.runs || (runs === best.runs && margin > best.margin)) best = { runs, margin };
            return;
        }
        for (let i = 0; i < left.length; i++) {
            if (left[i] === 0) continue;
            const next = rgb.map((v, c) => v + effects[i][c]);
            if (next.some((v) => v < 0 || v > 255)) continue;
            left[i]--;
            walk(next, i, runs + (i === last ? 0 : 1), Math.min(margin, edge(next)), fed + 1);
            left[i]++;
        }
    };
    walk([...startRgb], -1, 0, Infinity, 0);
    return best;
}

// 同一種水果的顆數加在一起（照第一次出現的順序），分段合回配方
function mergeCounts(list) {
    const counts = new Map();
    for (const { fruit, count } of list) counts.set(fruit, (counts.get(fruit) || 0) + count);
    return [...counts].map(([fruit, count]) => ({ fruit, count }));
}
const sortedByFruit = (list) => mergeCounts(list).sort((a, b) => (a.fruit < b.fruit ? -1 : 1));

function deepFreeze(value) {
    for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
    return Object.freeze(value);
}

// 沙漠黃到素雪白（配方 16／13／5）：4 段
const DESERT_TO_SNOW = [
    { fruit: 'doman-plum', count: 10 },
    { fruit: 'valfruit', count: 13 },
    { fruit: 'doman-plum', count: 6 },
    { fruit: 'cieldalaes-pineapple', count: 5 }
];
const DESERT_TO_SNOW_PLAN = {
    same: false, route: 'direct', total: 34, rgb: [229, 220, 207], directTotal: 34, lemonTotal: null, steps: DESERT_TO_SNOW
};

// 兩個自訂盤面。靠近上限：先餵多瑪青梅（紅減 10）才離 255 比較遠；兩種順序一樣遠：同段數、同距離，照 fruits 的順序
const NEAR_LIMIT = {
    start: [240, 128, 128],
    fruits: [{ fruit: 'xelphatol-apple', count: 2 }, { fruit: 'doman-plum', count: 2 }]
};
const TIED = {
    start: [128, 128, 128],
    fruits: [{ fruit: 'xelphatol-apple', count: 1 }, { fruit: 'mamook-pear', count: 1 }]
};

// 7,225 組的 plan() 算一次，幾個測試共用（每一組要算兩個配方，全部約 2 秒）
let cachedPlans = null;
function allPlans() {
    if (!cachedPlans) {
        cachedPlans = [];
        for (const from of data.colors) {
            for (const to of data.colors) cachedPlans.push({ from, to, plan: plan(data, from.id, to.id) });
        }
    }
    return cachedPlans;
}

test('水果效果成對相反，檸檬是重置色而不是 RGB 增量', () => {
    assert.deepEqual(fruitById.get('xelphatol-apple').effect, { r: 5, g: -5, b: -5 });
    assert.deepEqual(fruitById.get('mamook-pear').effect, { r: -5, g: 5, b: -5 });
    assert.deepEqual(fruitById.get('oghomoro-berries').effect, { r: -5, g: -5, b: 5 });
    for (const fruit of data.fruits.filter((f) => f.effect)) {
        assert.ok(
            data.fruits.some((other) => other.effect && CH.every((channel) => other.effect[channel] === -fruit.effect[channel])),
            `${fruit.id} 沒有效果完全相反的水果`
        );
    }
    assert.equal(fruitById.get('han-lemon').resetsTo, 'desert-yellow');
    assert.equal(fruitById.get('han-lemon').effect, null);
});

test('沙漠黃到素雪白：配方 16／13／5，終點 [229, 220, 207]，分 4 段', () => {
    assert.deepEqual(plain(plan(data, 'desert-yellow', 'snow-white')), DESERT_TO_SNOW_PLAN);
    assert.deepEqual(
        plain(recipe(data, [219, 180, 87], 'snow-white').fruits),
        [{ fruit: 'doman-plum', count: 16 }, { fruit: 'valfruit', count: 13 }, { fruit: 'cieldalaes-pineapple', count: 5 }]
    );
    const whole = plain(recipe(data, [219, 180, 87], 'snow-white'));
    assert.deepEqual(whole.rgb, [229, 220, 207]);
    assert.equal(whole.total, 34);
});

test('全部 7,225 組：每一步都在 0～255、終點最接近目標色、顆數加總等於 total、total = min(直接, 檸檬)', () => {
    assert.equal(allPlans().length, 7225);
    for (const { from, to, plan: p } of allPlans()) {
        const label = `${from.id} -> ${to.id}`;
        if (from.id === to.id) {
            assert.deepEqual(plain(p), { same: true, route: null, total: 0, steps: [], rgb: null, directTotal: null, lemonTotal: null }, label);
            continue;
        }
        assert.equal(p.same, false, label);
        assert.ok(p.route === 'direct' || p.route === 'lemon', `${label}: route 是 ${p.route}`);

        // 照步驟餵一次：每一顆之後都在 0～255，顆數加總等於 total，終點就是 rgb
        const after = feed(from.rgb, p.steps);
        assert.equal(Array.from(p.steps).reduce((sum, s) => sum + s.count, 0), p.total, `${label}: 顆數加總`);
        assert.equal(after.length, p.total, `${label}: 餵的顆數`);
        for (const rgb of after) assert.ok(rgb.every((v) => v >= 0 && v <= 255), `${label}: ${rgb}`);
        assert.deepEqual(after[after.length - 1], plain(p.rgb), `${label}: 終點`);

        // 段是連續餵同一種：相鄰兩段不會是同一種水果；檸檬只會是第一段
        const list = Array.from(p.steps);
        for (let i = 0; i < list.length; i++) {
            assert.ok(list[i].count >= 1, `${label}: 第 ${i + 1} 段 0 顆`);
            if (i > 0) assert.notEqual(list[i].fruit, list[i - 1].fruit, `${label}: 第 ${i} 與 ${i + 1} 段是同一種水果`);
            assert.equal(list[i].fruit === 'han-lemon', p.route === 'lemon' && i === 0, `${label}: 第 ${i + 1} 段`);
        }

        // 終點最接近目標色：離目標色比離其他 84 色都近（嚴格小於）
        const toDistance = distance(p.rgb, to.rgb);
        const rival = data.colors.find((other) => other.id !== to.id && distance(p.rgb, other.rgb) <= toDistance);
        assert.equal(rival, undefined, `${label}: 離 ${rival && rival.id} 一樣近或更近`);

        // total = min(直接, 檸檬)；沒有直接做法時才只剩檸檬
        const totals = [p.directTotal, p.lemonTotal].filter((v) => v !== null);
        assert.ok(totals.length > 0, `${label}: 兩個做法都找不到`);
        assert.equal(p.total, Math.min(...totals), `${label}: total`);
        if (p.directTotal !== null) assert.ok(p.total <= p.directTotal, `${label}: total 不能比直接調色多`);
    }
});

test('配方和現在的算法一樣：直接調色加總 272,421 顆，取較省的做法加總 185,282 顆', () => {
    // 基準值是 main f309e6f 的 tools/guide/chocobo-color-calculator.js 算出來的
    let pairs = 0, directSum = 0, totalSum = 0, lemonBetter = 0, ties = 0, maxTotal = 0, maxDirect = 0;
    for (const { from, to, plan: p } of allPlans()) {
        if (from.id === to.id) continue;
        pairs++;
        assert.notEqual(p.directTotal, null, `${from.id} -> ${to.id}: 沒有直接做法`);
        directSum += p.directTotal;
        totalSum += p.total;
        if (p.lemonTotal !== null && p.lemonTotal < p.directTotal) lemonBetter++;
        if (p.lemonTotal !== null && p.lemonTotal === p.directTotal) ties++;
        maxTotal = Math.max(maxTotal, p.total);
        maxDirect = Math.max(maxDirect, p.directTotal);
    }
    assert.equal(pairs, 7140);
    assert.equal(directSum, 272421);
    assert.equal(totalSum, 185282);
    assert.equal(lemonBetter, 2780);
    assert.equal(ties, 92);
    assert.equal(maxTotal, 83);
    assert.equal(maxDirect, 125);
});

test('檸檬的例子', () => {
    // 魔花綠 → 沙漠黃：先餵 1 顆檸檬就到（直接要 80 顆）
    assert.deepEqual(plain(plan(data, 'morbol-green', 'desert-yellow')), {
        same: false, route: 'lemon', total: 1, rgb: [219, 180, 87], directTotal: 80, lemonTotal: 1,
        steps: [{ fruit: 'han-lemon', count: 1 }]
    });
    // 煤煙黑 → 素雪白：檸檬接上沙漠黃到素雪白的 4 段（35 顆，直接要 109 顆）
    assert.deepEqual(plain(plan(data, 'soot-black', 'snow-white')), {
        same: false, route: 'lemon', total: 35, rgb: [229, 220, 207], directTotal: 109, lemonTotal: 35,
        steps: [{ fruit: 'han-lemon', count: 1 }, ...DESERT_TO_SNOW]
    });
    // 素雪白 → 天空藍：直接 15 顆比檸檬的 30 顆省
    assert.deepEqual(plain(plan(data, 'snow-white', 'sky-blue')), {
        same: false, route: 'direct', total: 15, rgb: [153, 198, 233], directTotal: 15, lemonTotal: 30,
        steps: [{ fruit: 'mamook-pear', count: 5 }, { fruit: 'oghomoro-berries', count: 10 }]
    });
});

test('目前是沙漠黃時沒有檸檬做法；目標是沙漠黃時檸檬做法是 1 顆；一樣多時用檸檬', () => {
    // 目前是沙漠黃：84 組都沒有檸檬做法，只能直接調色
    for (const to of data.colors.filter((c) => c.id !== 'desert-yellow')) {
        const p = plan(data, 'desert-yellow', to.id);
        assert.equal(p.lemonTotal, null, `desert-yellow -> ${to.id}`);
        assert.equal(p.route, 'direct', `desert-yellow -> ${to.id}`);
        assert.equal(p.total, p.directTotal, `desert-yellow -> ${to.id}`);
    }
    // 目標是沙漠黃：檸檬做法是 1 顆（直接調色至少也要 1 顆，所以一定用檸檬）
    for (const from of data.colors.filter((c) => c.id !== 'desert-yellow')) {
        const p = plan(data, from.id, 'desert-yellow');
        assert.equal(p.lemonTotal, 1, `${from.id} -> desert-yellow`);
        assert.equal(p.route, 'lemon', `${from.id} -> desert-yellow`);
        assert.deepEqual(plain(p.steps), [{ fruit: 'han-lemon', count: 1 }], `${from.id} -> desert-yellow`);
    }
    // 一樣多時用檸檬（從確定的沙漠黃開始，比較準）：玉米黃 → 古卜灰
    const tie = plan(data, 'millioncorn-yellow', 'goobbue-grey');
    assert.equal(tie.route, 'lemon');
    assert.equal(tie.lemonTotal, tie.directTotal);
    // 所有一樣多的組合都是檸檬
    let ties = 0;
    for (const { from, to, plan: p } of allPlans()) {
        if (p.lemonTotal === null || p.lemonTotal !== p.directTotal) continue;
        ties++;
        assert.equal(p.route, 'lemon', `${from.id} -> ${to.id}`);
    }
    assert.equal(ties, 92);
});

test('分段：段數與離上下限的距離等於暴力搜尋', () => {
    // 每一組：起點、要餵的水果（多重集合）、要檢查的分段
    const boards = [
        { label: '自訂：靠近上限', start: NEAR_LIMIT.start, fruits: NEAR_LIMIT.fruits },
        { label: '自訂：兩種順序一樣遠', start: TIED.start, fruits: TIED.fruits }
    ];
    // 所有總顆數 ≤ 8 的組合：檢查選中的做法的分段（檸檬做法比對檸檬之後、從沙漠黃開始的那一段）
    const planned = [];
    for (const { from, to, plan: p } of allPlans()) {
        if (p.same || p.total > 8) continue;
        const lemon = p.route === 'lemon';
        const rest = Array.from(p.steps).slice(lemon ? 1 : 0);
        if (rest.length === 0) continue; // 檸檬一顆就到（目標就是沙漠黃），沒有分段可以比
        planned.push({ label: `${from.id} -> ${to.id}`, start: lemon ? RESET_RGB : from.rgb, fruits: mergeCounts(rest), rest });
    }
    assert.ok(planned.length >= 700, `總顆數 ≤ 8 的組合只有 ${planned.length} 組，篩選可能失效`);

    const check = (label, start, fruits, result) => {
        const best = bruteForce(start, fruits);
        assert.ok(best, `${label}: 暴力搜尋找不到每一步都在範圍內的餵法`);
        const list = Array.from(result);
        assert.deepEqual(sortedByFruit(list), sortedByFruit(fruits), `${label}: 每種水果的顆數`);
        assert.equal(list.length, best.runs, `${label}: 段數`);
        const after = feed(start, list);
        for (const rgb of after) assert.ok(rgb.every((v) => v >= 0 && v <= 255), `${label}: ${rgb}`);
        assert.equal(Math.min(...after.map(edge)), best.margin, `${label}: 離 0／255 最近的一刻`);
    };
    for (const board of [...boards, ...planned]) {
        check(board.label, board.start, board.fruits, segments(data, board.start, board.fruits));
    }
    for (const { label, start, fruits, rest } of planned) check(`${label}（plan 排的）`, start, fruits, rest);
});

test('分段：同段數時挑離 0／255 最遠的，再一樣就照 fruits 的順序', () => {
    // 240 再加兩顆沙果（紅 +10）會到 250 離 255 只有 5；先餵兩顆青梅（紅 −10）最近的一刻是 15
    assert.deepEqual(
        steps(segments(data, NEAR_LIMIT.start, NEAR_LIMIT.fruits)),
        [['doman-plum', 2], ['xelphatol-apple', 2]]
    );
    // 兩種順序離上下限一樣遠，照 fruits 的順序
    assert.deepEqual(
        steps(segments(data, TIED.start, TIED.fruits)),
        [['xelphatol-apple', 1], ['mamook-pear', 1]]
    );
    assert.deepEqual(
        steps(segments(data, TIED.start, [...TIED.fruits].reverse())),
        [['mamook-pear', 1], ['xelphatol-apple', 1]]
    );
});

test('分段：沒有不超出範圍的做法時是 null；超過 3 種水果丟 RangeError', () => {
    const tooHigh = [{ fruit: 'xelphatol-apple', count: 1 }];
    assert.equal(segments(data, [253, 128, 128], tooHigh), null);
    assert.equal(bruteForce([253, 128, 128], tooHigh), null);
    assert.throws(() => segments(data, [128, 128, 128], [
        { fruit: 'xelphatol-apple', count: 1 },
        { fruit: 'doman-plum', count: 1 },
        { fruit: 'mamook-pear', count: 1 },
        { fruit: 'valfruit', count: 1 }
    ]), isRangeError);
    // 剛好 3 種可以；沒有水果要餵就是沒有分段
    assert.equal(segments(data, [128, 128, 128], [
        { fruit: 'xelphatol-apple', count: 1 },
        { fruit: 'mamook-pear', count: 1 },
        { fruit: 'oghomoro-berries', count: 1 }
    ]).length, 3);
    assert.deepEqual(plain(segments(data, [128, 128, 128], [])), []);
});

test('bestTotal 等於 plan().total', () => {
    for (const fromId of ['desert-yellow', 'soot-black', 'snow-white']) {
        for (const to of data.colors) {
            const expected = to.id === fromId ? 0 : plan(data, fromId, to.id).total;
            assert.equal(bestTotal(data, fromId, to.id), expected, `${fromId} -> ${to.id}`);
        }
    }
    assert.equal(bestTotal(data, 'snow-white', 'snow-white'), 0);
});

test('colorGroups：7 組、張數 [7, 8, 11, 17, 8, 17, 17]、85 色各一次、組內由亮到暗', () => {
    assert.deepEqual(plain(GROUP_KEYS), ['white', 'yellow', 'red', 'brown', 'purple', 'blue', 'green']);
    assert.ok(Object.isFrozen(GROUP_KEYS));
    const groups = plain(colorGroups(data));
    assert.deepEqual(groups.map((g) => g.key), plain(GROUP_KEYS));
    assert.deepEqual(groups.map((g) => g.ids.length), [7, 8, 11, 17, 8, 17, 17]);

    const all = groups.flatMap((g) => g.ids);
    assert.equal(all.length, 85);
    assert.deepEqual([...all].sort(), data.colors.map((c) => c.id).sort());

    // id 最後一段決定分到哪一組：白・灰・黑、黃・橘、紅・粉，其他同名
    const GROUP_OF = { white: 'white', grey: 'white', black: 'white', yellow: 'yellow', orange: 'yellow', red: 'red', pink: 'red', brown: 'brown', purple: 'purple', blue: 'blue', green: 'green' };
    const brightness = (id) => {
        const [r, g, b] = colorById.get(id).rgb;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const { key, ids } of groups) {
        for (const id of ids) assert.equal(GROUP_OF[id.split('-').pop()], key, `${id} 分在 ${key}`);
        for (let i = 1; i < ids.length; i++) {
            assert.ok(brightness(ids[i]) <= brightness(ids[i - 1]), `${key}: ${ids[i - 1]} 後面不該接更亮的 ${ids[i]}`);
        }
    }
    assert.ok(groups.find((g) => g.key === 'white').ids.includes('soot-black'));
    assert.ok(groups.find((g) => g.key === 'red').ids.includes('mesa-red'));
});

test('不改傳進去的資料；不認得的 id 丟 RangeError', () => {
    // 深層凍結的資料、起點與水果清單：照樣算得出和沒凍結時一樣的結果，有任何一處想改就會丟 TypeError
    const frozen = deepFreeze(JSON.parse(JSON.stringify(data)));
    assert.deepEqual(plain(plan(frozen, 'desert-yellow', 'snow-white')), DESERT_TO_SNOW_PLAN);
    assert.equal(bestTotal(frozen, 'desert-yellow', 'snow-white'), 34);
    assert.deepEqual(plain(colorGroups(frozen)), plain(colorGroups(data)));
    const start = Object.freeze([219, 180, 87]);
    assert.deepEqual(plain(recipe(frozen, start, 'snow-white')), plain(recipe(data, [219, 180, 87], 'snow-white')));
    const fruits = deepFreeze([{ fruit: 'doman-plum', count: 16 }, { fruit: 'valfruit', count: 13 }, { fruit: 'cieldalaes-pineapple', count: 5 }]);
    assert.deepEqual(plain(segments(frozen, start, fruits)), DESERT_TO_SNOW);

    // 不認得的顏色 id（目前、目標兩個位置都是）
    assert.throws(() => plan(data, 'nope', 'snow-white'), isRangeError);
    assert.throws(() => plan(data, 'snow-white', 'nope'), isRangeError);
    assert.throws(() => bestTotal(data, 'nope', 'snow-white'), isRangeError);
    assert.throws(() => bestTotal(data, 'snow-white', 'nope'), isRangeError);
    assert.throws(() => recipe(data, [219, 180, 87], 'nope'), isRangeError);
});

test('匯出的名稱是後面的頁面依賴的介面', () => {
    assert.deepEqual(Object.keys(solver).sort(), ['GROUP_KEYS', 'bestTotal', 'colorGroups', 'plan', 'recipe', 'segments']);
    assert.ok(Object.isFrozen(solver));
    for (const name of ['recipe', 'segments', 'plan', 'bestTotal', 'colorGroups']) assert.equal(typeof solver[name], 'function', name);
});

test('找不到做法時：route 是 null、total 0、steps 是空的', () => {
    // 拿掉三種「效果相反」的水果：沙漠黃要變亮，三種基底水果都得是負的，一顆也湊不出來
    const crippled = { ...data, fruits: data.fruits.filter((f) => !['doman-plum', 'valfruit', 'cieldalaes-pineapple'].includes(f.id)) };
    assert.equal(recipe(crippled, [219, 180, 87], 'snow-white'), null);
    assert.equal(bestTotal(crippled, 'desert-yellow', 'snow-white'), null);
    assert.deepEqual(plain(plan(crippled, 'desert-yellow', 'snow-white')), {
        same: false, route: null, total: 0, steps: [], rgb: null, directTotal: null, lemonTotal: null
    });
});
