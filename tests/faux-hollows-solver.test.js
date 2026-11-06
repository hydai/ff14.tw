const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// board-data.js 與 hollows-solver.js 都掛在 window 上，所以讓 window 指向 context 本身（同 cactpot-solver.test.js）
function load() {
    const context = vm.createContext({});
    context.window = context;
    for (const file of ['board-data.js', 'hollows-solver.js']) {
        const full = path.resolve(__dirname, '../tools/faux-hollows-foxes', file);
        vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: file });
    }
    return context;
}

const context = load();
// 故意用解構取出：頁面不一定用 FauxHollowsSolver.xxx() 的寫法呼叫，這些函式不能靠 this
const { SIZE, MAX_REVEALS, ITEMS, flatten, analyze, choices, formatPercent } = context.FauxHollowsSolver;
const BOARDS = flatten(context.FAUX_HOLLOWS_BOARD_DATA);
// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));
// stateOf({ obstacle: [9, 13], sword: [25] })：長度 36，沒寫到的格子是 null
function stateOf(marks = {}) {
    const state = Array(36).fill(null);
    for (const [value, cells] of Object.entries(marks)) for (const p of cells) state[p] = value;
    return state;
}
const view = (marks, boards = BOARDS) => plain(analyze(boards, stateOf(marks)));
const pick = (object, keys) => Object.fromEntries(keys.map((key) => [key, object[key]]));
// 計畫〈例子〉的擺法 0 與審閱者的例子
const LAYOUT0 = { obstacle: [9, 13] };
const REVIEWER = { obstacle: [9, 13], chest: [4], sword: [25, 26, 27, 31] };

test('flatten()：252 種盤面，每種 36 格，5 個障礙物、6 格劍、4 格寶箱、4 個宗長或空；障礙物的擺法有 16 種', () => {
    assert.equal(SIZE, 36);
    assert.equal(MAX_REVEALS, 11);
    assert.deepEqual(plain(ITEMS), ['sword', 'chest', 'fox', 'empty']);
    assert.ok(Object.isFrozen(ITEMS));
    assert.equal(BOARDS.length, 252);
    for (const board of BOARDS) {
        assert.equal(board.length, 36);
        assert.deepEqual([1, 2, 3, 4].map((v) => board.filter((x) => x === v).length), [5, 6, 4, 4]);
    }
    // 一列接一列：第一種盤面的前兩列
    assert.deepEqual(plain(BOARDS[0].slice(0, 12)), [4, 0, 0, 4, 3, 3, 0, 0, 0, 1, 3, 3]);
    const layouts = new Set(BOARDS.map((board) => board.flatMap((v, i) => (v === 1 ? [i] : [])).join(',')));
    assert.equal(layouts.size, 16);
});

test('一打開：障礙物階段、252 種、32 格能標（格 1、11、24、34 在每一種盤面都不是障礙物）、沒有目標', () => {
    const v = view({});
    assert.deepEqual(pick(v, ['phase', 'matches', 'known', 'auto', 'left', 'goal', 'next', 'foxCells']),
        { phase: 'obstacles', matches: 252, known: 0, auto: [], left: 11, goal: null, next: [], foxCells: [] });
    assert.equal(v.obstacleCells.length, 32);
    for (const p of [1, 11, 24, 34]) assert.ok(!v.obstacleCells.includes(p), `格 ${p}`);
    assert.ok(v.sword.every((x) => x === 0) && v.chest.every((x) => x === 0));
});

test('障礙物階段只看手動標的：剩幾種、已知幾格、能標的格子；擺法還沒確定也會自動補上（標 2 → 10）', () => {
    const keys = ['phase', 'matches', 'known', 'auto', 'obstacleCells'];
    assert.deepEqual(pick(view({ obstacle: [9] }), keys),
        { phase: 'obstacles', matches: 48, known: 1, auto: [], obstacleCells: [0, 12, 13, 16, 20, 22, 23, 25, 27, 28, 30] });
    assert.deepEqual(pick(view({ obstacle: [2] }), keys),
        { phase: 'obstacles', matches: 31, known: 2, auto: [10], obstacleCells: [12, 19, 20, 27, 28, 31] });
    assert.deepEqual(pick(view({ obstacle: [13, 16] }), keys),
        { phase: 'obstacles', matches: 32, known: 2, auto: [], obstacleCells: [3, 9, 21, 28, 30, 32] });
});

test('擺法確定就進入翻格：標 9、13 → 自動補上 16、28、30，16 種盤面，找劍、下一格 26', () => {
    const v = view(LAYOUT0);
    assert.deepEqual(pick(v, ['phase', 'matches', 'known', 'auto', 'obstacleCells', 'left', 'goal', 'next']),
        { phase: 'reveal', matches: 16, known: 5, auto: [16, 28, 30], obstacleCells: [], left: 11, goal: 'sword', next: [26] });
    // 16 種盤面裡是劍、寶箱的種數（分母是 2 的次方，乘回 16 剛好是整數）
    assert.deepEqual([26, 25, 0, 1, 15, 3].map((p) => [v.sword[p] * 16, v.chest[p] * 16]),
        [[12, 2], [8, 3], [4, 2], [4, 5], [2, 2], [0, 0]]);
    // 障礙物（手動的 9、自動補上的 16）沒有機率
    assert.deepEqual([9, 16].map((p) => [v.sword[p], v.chest[p]]), [[0, 0], [0, 0]]);
    assert.deepEqual(v.foxCells, [0, 3, 12, 14, 17, 18, 21, 22, 23, 24, 27, 29, 31, 33, 34, 35]);
});

test('🦊 只放在還可能有宗長的格子：審閱者的例子翻開 0、3、23 後只剩 29；照建議翻完劍，目標輪到宗長、下一格是 29', () => {
    let v = view(REVIEWER);
    assert.deepEqual(pick(v, ['matches', 'left', 'goal', 'next', 'foxCells']),
        { matches: 1, left: 6, goal: 'sword', next: [32, 33], foxCells: [0, 3, 23, 29] });
    assert.equal(v.chest[5], 1);
    // 剩 3 次，劍還差 2 格、夠翻完：還是找劍
    v = view({ ...REVIEWER, empty: [0, 3, 23] });
    assert.deepEqual(pick(v, ['left', 'goal', 'next', 'foxCells']), { left: 3, goal: 'sword', next: [32, 33], foxCells: [29] });
    // 剩 1 次，寶箱還差 3 格、來不及：跳到宗長
    v = view({ ...REVIEWER, sword: [25, 26, 27, 31, 32, 33], empty: [0, 3, 23] });
    assert.deepEqual(pick(v, ['left', 'goal', 'next', 'foxCells']), { left: 1, goal: 'fox', next: [29], foxCells: [29] });
    // 宗長沒有數字：29 的劍、寶箱都是 0，回傳的東西裡也沒有宗長的比例
    assert.deepEqual([v.sword[29], v.chest[29]], [0, 0]);
    assert.deepEqual(Object.keys(v).sort(),
        ['auto', 'chest', 'foxCells', 'goal', 'known', 'left', 'matches', 'next', 'obstacle', 'obstacleCells', 'phase', 'sword']);
});

test('找到宗長之後其他格都不放 🦊（格 0 是宗長：剩 4 種、下一格是劍的 26、27、32、33）', () => {
    assert.deepEqual(pick(view({ ...LAYOUT0, fox: [0] }), ['matches', 'left', 'goal', 'next', 'foxCells']),
        { matches: 4, left: 10, goal: 'sword', next: [26, 27, 32, 33], foxCells: [] });
});

test('設計 6.4 的兩種盤面：格 1、2 各在 2 種盤面裡是宗長的位置，先翻；格 4、5、6 各 1 種，只放 🦊', () => {
    // 甲的宗長位置是 1、2、3、4，乙的是 1、2、5、6；其他擺得一樣：障礙物 30–34、劍 18–20 與 24–26、寶箱 21、22、27、28
    const make = (foxes) => {
        const board = Array(36).fill(0);
        for (const p of [30, 31, 32, 33, 34]) board[p] = 1;
        for (const p of [18, 19, 20, 24, 25, 26]) board[p] = 2;
        for (const p of [21, 22, 27, 28]) board[p] = 3;
        for (const p of foxes) board[p] = 4;
        return board;
    };
    // 翻開 0、7–12 與 3 都是空的：8 格、剩 3 次，劍（6 格）和寶箱（4 格）都來不及翻完，目標直接是宗長。
    // 兩種盤面的障礙物一樣：不用標就確定，30–34 自動補上
    const v = view({ empty: [0, 7, 8, 9, 10, 11, 12, 3] }, [make([1, 2, 3, 4]), make([1, 2, 5, 6])]);
    assert.deepEqual(pick(v, ['phase', 'auto', 'matches', 'left', 'goal', 'foxCells', 'next']),
        { phase: 'reveal', auto: [30, 31, 32, 33, 34], matches: 2, left: 3, goal: 'fox', foxCells: [1, 2, 4, 5, 6], next: [1, 2] });
});

test('宗長的位置全部翻開都是空的：完成（還剩 1 次）；剩的次數不夠翻完寶箱時跳到宗長', () => {
    const swords = { obstacle: [9, 13], sword: [25, 26, 27, 31, 32, 33] };
    const keys = ['matches', 'left', 'goal', 'next', 'foxCells'];
    assert.deepEqual(pick(view(swords), keys),
        { matches: 2, left: 5, goal: 'chest', next: [4, 5, 10, 11, 14, 15, 20, 21], foxCells: [0, 3, 23, 29] });
    assert.deepEqual(pick(view({ ...swords, empty: [0, 3] }), keys),
        { matches: 2, left: 3, goal: 'fox', next: [23, 29], foxCells: [23, 29] });
    assert.deepEqual(pick(view({ ...swords, empty: [0, 3, 23] }), keys),
        { matches: 2, left: 2, goal: 'fox', next: [29], foxCells: [29] });
    assert.deepEqual(pick(view({ ...swords, empty: [0, 3, 23, 29] }), keys),
        { matches: 2, left: 1, goal: null, next: [], foxCells: [] });
});

test('剩的次數不夠翻完劍：直接跳到寶箱（擺法 0 翻開 1、2、6、7、8、12 都是空的）', () => {
    const keys = ['matches', 'left', 'goal', 'next'];
    assert.deepEqual(pick(view({ ...LAYOUT0, empty: [1, 2, 6, 7, 8] }), keys), { matches: 7, left: 6, goal: 'sword', next: [26] });
    assert.deepEqual(pick(view({ ...LAYOUT0, empty: [1, 2, 6, 7, 8, 12] }), keys), { matches: 7, left: 5, goal: 'chest', next: [4, 5, 10, 11] });
});

test('次數用完就完成；清掉一格又剩 1 次、目標回來', () => {
    const full = { ...REVIEWER, sword: [25, 26, 27, 31, 32, 33], empty: [0, 3, 23, 29] };
    const keys = ['left', 'goal', 'next', 'foxCells'];
    assert.deepEqual(pick(view(full), keys), { left: 0, goal: null, next: [], foxCells: [] });
    assert.deepEqual(pick(view({ ...full, empty: [0, 3, 23] }), keys), { left: 1, goal: 'fox', next: [29], foxCells: [29] });
});

test('choices()：把這格當成還沒翻開時可能是什麼，照 ITEMS 的順序', () => {
    const at = (marks, p) => plain(choices(BOARDS, stateOf(marks), p));
    assert.deepEqual(at(LAYOUT0, 25), ['sword', 'chest', 'empty']);
    assert.deepEqual(at(LAYOUT0, 3), ['fox', 'empty']);
    assert.deepEqual(at(LAYOUT0, 0), ['sword', 'chest', 'fox', 'empty']);
    // 只剩一種
    assert.deepEqual(at({ ...LAYOUT0, sword: [25] }, 26), ['sword']);
    assert.deepEqual(at(REVIEWER, 32), ['sword']);
    assert.deepEqual(at(REVIEWER, 1), ['empty']);
    assert.deepEqual(at(REVIEWER, 29), ['fox', 'empty']);
    // 已經翻開的格子照樣當成還沒翻
    assert.deepEqual(at({ ...LAYOUT0, sword: [25] }, 25), ['sword', 'chest', 'empty']);
    // 宗長只有一隻：別格是宗長時不列宗長，自己是宗長時照樣列
    assert.deepEqual(at({ ...LAYOUT0, fox: [0] }, 3), ['empty']);
    assert.deepEqual(at({ ...LAYOUT0, fox: [0] }, 21), ['sword', 'chest', 'empty']);
    assert.deepEqual(at({ ...LAYOUT0, fox: [0] }, 0), ['sword', 'chest', 'fox', 'empty']);
    // 障礙物：手動的 9、自動補上的 16
    assert.deepEqual(at(LAYOUT0, 9), []);
    assert.deepEqual(at(LAYOUT0, 16), []);
});

test('formatPercent()：整數百分比帶 %，0 不寫，大於 0 但不到 1% 寫 <1%', () => {
    // 真的資料到不了 <1%：擺法確定後最多 16 種盤面，最小是 1/16。
    // 要先判比例（< 0.01）再乘 100 四捨五入：先四捨五入的話，0.004 會變成 0 而寫成 ''
    assert.deepEqual([0, 0.004, 0.0099, 0.01, 1 / 16, 2 / 16, 3 / 16, 5 / 16, 12 / 16, 1].map((f) => formatPercent(f)),
        ['', '<1%', '<1%', '1%', '6%', '13%', '19%', '31%', '75%', '100%']);
});

test('不改傳進來的資料（凍結的也算得對）；對不上任何盤面時不丟錯、什麼都不能做', () => {
    const state = Object.freeze(stateOf({ ...LAYOUT0, sword: [25] }));
    const boards = Object.freeze(BOARDS.map((board) => Object.freeze([...board])));
    const before = plain(state);
    assert.equal(analyze(boards, state).goal, 'sword');
    assert.deepEqual(plain(choices(boards, state, 26)), ['sword']);
    assert.deepEqual(plain(state), before);
    const data = context.FAUX_HOLLOWS_BOARD_DATA;
    const copy = plain(data);
    flatten(data);
    assert.deepEqual(plain(data), copy);
    // 格 1、11 在每一種盤面都不是障礙物：0 種盤面
    assert.deepEqual(pick(view({ obstacle: [1, 11] }), ['phase', 'matches', 'known', 'auto', 'obstacleCells', 'goal', 'next', 'foxCells']),
        { phase: 'obstacles', matches: 0, known: 0, auto: [], obstacleCells: [], goal: null, next: [], foxCells: [] });
});

test('障礙物比例來自相容盤面：更新標記後重新計算，無相容盤面時為 0', () => {
    const a = Array(36).fill(0);
    const b = Array(36).fill(0);
    const c = Array(36).fill(0);
    a[0] = a[1] = b[0] = b[2] = c[3] = 1;
    const boards = [a, b, c];
    assert.deepEqual(view({}, boards).obstacle.slice(0, 4), [2 / 3, 1 / 3, 1 / 3, 1 / 3]);
    assert.deepEqual(view({ obstacle: [0] }, boards).obstacle.slice(0, 4), [1, 1 / 2, 1 / 2, 0]);
    assert.ok(view({ obstacle: [35] }, boards).obstacle.every((value) => value === 0));
});
