const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// cactpot-solver.js 把 MiniCactpotSolver 掛在 window 上，所以讓 window 指向 context 本身（同 weather-answer.test.js）
function loadSolver() {
    const context = vm.createContext({});
    context.window = context;
    const file = path.resolve(__dirname, '../tools/mini-cactpot/cactpot-solver.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: 'cactpot-solver.js' });
    return context.MiniCactpotSolver;
}

const solver = loadSolver();
// 故意用解構取出：頁面不一定用 MiniCactpotSolver.xxx() 的寫法呼叫，這些函式不能靠 this
const { cellValues, lineValues, topTies, possibleSums, analyze, formatMgp } = solver;
const grid = (known) => {
    const cells = Array(9).fill(null);
    for (const [position, value] of Object.entries(known)) cells[Number(position)] = value;
    return cells;
};
// vm 裡建出來的陣列（包括 vm 陣列 .map() 的結果）原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-5, `${label}：${actual} 應該是 ${expected}`);

// 基準值：main 3a0d6a2 的 tools/mini-cactpot/script.js（第 613–777 行）在同一個盤面算出來的，四捨五入到小數 6 位
const CELL_GOLDEN = [
    [{ 0: 1 }, { 1: 1619.068155, 2: 1677.785417, 3: 1619.068155, 4: 1677.533929, 5: 1533.515476, 6: 1677.785417, 7: 1533.515476, 8: 1634.5375 }],
    [{ 0: 9 }, { 1: 1450.628274, 2: 1517.721429, 3: 1450.628274, 4: 1517.721429, 5: 1455.784524, 6: 1517.721429, 7: 1455.784524, 8: 1467.55625 }],
    [{ 4: 5 }, { 0: 1176.204762, 1: 1149.933631, 2: 1176.204762, 3: 1149.933631, 5: 1149.933631, 6: 1176.204762, 7: 1149.933631, 8: 1176.204762 }],
    [{ 0: 1, 4: 5 }, { 1: 1365.378571, 2: 1374.490476, 3: 1365.378571, 5: 1234.02619, 6: 1374.490476, 7: 1234.02619, 8: 1229.861905 }],
    [{ 0: 1, 4: 5, 8: 9 }, { 1: 1515.266667, 2: 1543.633333, 3: 1515.266667, 5: 1063.7, 6: 1543.633333, 7: 1063.7 }]
];
const LINE_GOLDEN = [
    [{ 0: 1, 2: 2, 6: 3, 8: 4 }, [304, 861.5, 97.2, 174.4, 861.5, 133.2, 113.2, 113.2]],
    [{ 0: 7, 1: 1, 4: 2, 8: 3 }, [97.2, 120.6, 134.3, 692.3, 295.2, 134.3, 108, 120.6]],
    [{ 0: 1, 1: 2, 2: 3, 4: 9 }, [10000, 861.5, 230.8, 105.2, 117.4, 109.1, 121, 142.6]]
];

test('MGP 表與 8 條線照遊戲', () => {
    assert.deepEqual(plain(solver.MGP), { 6: 10000, 7: 36, 8: 720, 9: 360, 10: 80, 11: 252, 12: 108, 13: 72, 14: 54, 15: 180, 16: 72, 17: 180, 18: 119, 19: 36, 20: 306, 21: 1080, 22: 144, 23: 1800, 24: 3600 });
    assert.deepEqual(plain(solver.LINES), [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]);
    assert.equal(solver.TIE_EPSILON, 1e-6);
    assert.ok(Object.isFrozen(solver.MGP));
    assert.ok(Object.isFrozen(solver.LINES));
});

test('cellValues()：已知 1–3 格時，每個沒翻開的格子照位置列出平均 MGP（main 的演算法）', () => {
    for (const [known, expected] of CELL_GOLDEN) {
        const values = cellValues(grid(known));
        assert.deepEqual(plain(values.map((v) => v.position)), Object.keys(expected).map(Number), JSON.stringify(known));
        for (const { position, ev } of values) near(ev, expected[position], `${JSON.stringify(known)} 第 ${position} 格`);
    }
});

test('cellValues()：沒有已知的格子，或已經知道 4 格時是空的', () => {
    assert.deepEqual(plain(cellValues(grid({}))), []);
    assert.deepEqual(plain(cellValues(grid({ 0: 7, 1: 1, 4: 2, 8: 3 }))), []);
});

test('lineValues()：已知 4 格時 8 條線照線的順序列出平均 MGP', () => {
    for (const [known, expected] of LINE_GOLDEN) {
        const values = lineValues(grid(known));
        assert.deepEqual(plain(values.map((v) => v.line)), [0, 1, 2, 3, 4, 5, 6, 7]);
        values.forEach(({ ev }, line) => near(ev, expected[line], `${JSON.stringify(known)} 第 ${line} 條線`));
    }
    assert.deepEqual(plain(lineValues(grid({ 0: 1, 4: 5, 8: 9 }))), []);
});

test('topTies()：差距小於 1e-6 才算同分，顯示一樣的數字不一定同分', () => {
    // 只填左上 1：右上、左下 1677.785417，中央 1677.533929；三格都顯示「平均 1,678」，只有前兩格同分
    assert.deepEqual(plain(topTies(cellValues(grid({ 0: 1 }))).map((v) => v.position)), [2, 6]);
    assert.deepEqual(plain(topTies(cellValues(grid({ 4: 5 }))).map((v) => v.position)), [0, 2, 6, 8]);
    assert.deepEqual(plain(topTies(lineValues(grid({ 0: 1, 2: 2, 6: 3, 8: 4 }))).map((v) => v.line)), [1, 4]);
    // 這兩盤的並列是浮點誤差：數學上相等的期望值，因為加總的順序不同，差了 1e-13 左右
    // （{1:8,5:3} 的第 2、4 格差 4.5e-13；{2:9,4:8} 的第 0、3、7、8 格和第 6 格差 2.3e-13）；用 === 比就會漏掉它們
    assert.deepEqual(plain(topTies(cellValues(grid({ 1: 8, 5: 3 }))).map((v) => v.position)), [2, 4]);
    assert.deepEqual(plain(topTies(cellValues(grid({ 2: 9, 4: 8 }))).map((v) => v.position)), [0, 3, 6, 7, 8]);
    // 門檻本身：差 9e-7 還算同分，差 1.1e-6 就不算
    assert.deepEqual(plain(topTies([{ ev: 100 }, { ev: 100 - 9e-7 }, { ev: 100 - 1.1e-6 }])), [{ ev: 100 }, { ev: 100 - 9e-7 }]);
    assert.deepEqual(plain(topTies([])), []);
});

test('possibleSums()：這條線還可能出現的總和', () => {
    // 左直行：左上 7，左中、左下從 4、5、6、8、9 裡挑兩個
    assert.deepEqual(plain(possibleSums(3, grid({ 0: 7, 1: 1, 4: 2, 8: 3 }))), [16, 17, 18, 19, 20, 21, 22, 24]);
    // 中橫列三格都沒翻開，剩下 5–9
    assert.deepEqual(plain(possibleSums(1, grid({ 0: 1, 2: 2, 6: 3, 8: 4 }))), [18, 19, 20, 21, 22, 23, 24]);
    // 整條線都知道
    assert.deepEqual(plain(possibleSums(0, grid({ 0: 1, 1: 2, 2: 3, 4: 9 }))), [6]);
});

test('analyze()：一打開、刮格、選線三種狀態', () => {
    assert.deepEqual(plain(analyze(grid({}))), { known: 0, cells: [], lines: [], suggestedCells: [], suggestedLines: [], bestLineEv: null, possibleSums: [] });
    const scratch = analyze(grid({ 0: 1 }));
    assert.equal(scratch.known, 1);
    assert.deepEqual(plain(scratch.suggestedCells), [2, 6]);
    assert.deepEqual(plain(scratch.lines), []);
    assert.equal(scratch.bestLineEv, null);
    const tie = analyze(grid({ 0: 1, 2: 2, 6: 3, 8: 4 }));
    assert.equal(tie.known, 4);
    assert.deepEqual(plain(tie.cells), []);
    assert.deepEqual(plain(tie.suggestedLines), [1, 4]);
    near(tie.bestLineEv, 861.5, '最好的線');
    assert.deepEqual(plain(tie.possibleSums), [18, 19, 20, 21, 22, 23, 24]);
    assert.deepEqual(plain(analyze(grid({ 0: 7, 1: 1, 4: 2, 8: 3 })).possibleSums), [16, 17, 18, 19, 20, 21, 22, 24]);
});

test('formatMgp()：四捨五入到整數、加千分位', () => {
    assert.equal(formatMgp(1677.785417), '1,678');
    assert.equal(formatMgp(861.5), '862');
    assert.equal(formatMgp(97.2), '97');
    assert.equal(formatMgp(10000), '10,000');
    assert.equal(formatMgp(0), '0');
    assert.equal(formatMgp(1234567.4), '1,234,567');
});

test('不改到傳進來的盤面', () => {
    const cells = grid({ 0: 1, 4: 5 });
    const before = [...cells];
    analyze(cells);
    cellValues(cells);
    lineValues(cells);
    possibleSums(0, cells);
    assert.deepEqual(cells, before);

    // 演算法會暫時改動盤面再還原，所以結果只看最後的狀態看不出有沒有複製；改成傳凍結的盤面：
    // 少了「先複製一份」的話，凍結的陣列寫不進去（模組是寬鬆模式，默默失敗），算出來的平均就是錯的
    const frozenValues = cellValues(Object.freeze(grid({ 0: 1 })));
    near(frozenValues.find((v) => v.position === 2).ev, 1677.785417, '凍結的盤面第 2 格');
});
