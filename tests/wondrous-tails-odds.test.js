const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// tails-odds.js 把 WondrousTailsOdds 掛在 window 上，所以讓 window 指向 context 本身（同 cactpot-solver.test.js）
function loadOdds() {
    const context = vm.createContext({});
    context.window = context;
    const file = path.resolve(__dirname, '../tools/wondrous-tails/tails-odds.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: 'tails-odds.js' });
    return context.WondrousTailsOdds;
}

// 故意用解構取出：頁面不一定用 WondrousTailsOdds.xxx() 的寫法呼叫，這些函式不能靠 this
const { LINES, RESET_ODDS, lineCounts, canReset, completedLines, nearCells, analyze, formatPercent } = loadOdds();
const board = (...positions) => {
    const cells = Array(16).fill(false);
    for (const p of positions) cells[p] = true;
    return cells;
};
// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));
const isRangeError = (error) => error.name === 'RangeError';

test('LINES：4 條橫列、4 條直行、左上到右下、右上到左下，照這個順序', () => {
    assert.deepEqual(plain(LINES), [
        [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
        [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
        [0, 5, 10, 15], [3, 6, 9, 12]
    ]);
});

test('空的盤面＝重置之後：11,440 種擺法，至少 1／2／3 條是 6,688／1,208／24 種（設計 §5 的 58.5%、10.6%、0.21%）', () => {
    assert.deepEqual(plain(lineCounts(board())), { total: 11440, atLeast: [6688, 1208, 24] });
    assert.deepEqual(plain(RESET_ODDS), [6688 / 11440, 1208 / 11440, 24 / 11440]);
    assert.deepEqual(plain(RESET_ODDS).map((value) => formatPercent(value)), ['58.5%', '10.6%', '0.21%']);
    assert.ok(Object.isFrozen(RESET_ODDS));
});

test('例子盤面：貼滿時至少 1／2／3 條的擺法數與百分比', () => {
    const cases = [
        [[0, 1, 2], { total: 1716, atLeast: [1182, 264, 6] }, ['68.9%', '15.4%', '0.35%']],
        [[0, 1, 2, 5, 10, 12], { total: 120, atLeast: [84, 16, 0] }, ['70.0%', '13.3%', '0%']],
        [[0, 1, 2, 3, 5, 10, 15], { total: 36, atLeast: [36, 36, 3] }, ['100%', '100%', '8.3%']],
        [[0, 1, 2, 4, 6, 9, 11, 13], { total: 8, atLeast: [2, 0, 0] }, ['25.0%', '0%', '0%']],
        [[0, 1, 2, 3, 4, 5, 8, 10, 12], { total: 1, atLeast: [1, 1, 0] }, ['100%', '100%', '0%']],
        [[0, 1, 2, 4, 6, 9, 11, 13, 14], { total: 1, atLeast: [0, 0, 0] }, ['0%', '0%', '0%']]
    ];
    for (const [positions, counts, texts] of cases) {
        assert.deepEqual(plain(lineCounts(board(...positions))), counts, `盤面 ${positions}`);
        assert.deepEqual(plain(analyze(board(...positions)).now).map((value) => formatPercent(value)), texts, `盤面 ${positions}`);
    }
});

test('canReset()：貼 3～7 張時才能重置', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => canReset(k)),
        [false, false, false, true, true, true, true, true, false, false]);
});

test('analyze()：已貼張數；重置之後只有 3～7 張時有數字，其他是 null', () => {
    const order = [0, 5, 10, 15, 1, 2, 3, 4, 8];
    for (let k = 0; k <= 9; k++) {
        const view = analyze(board(...order.slice(0, k)));
        assert.equal(view.placed, k);
        if (k >= 3 && k <= 7) assert.deepEqual(plain(view.afterReset), plain(RESET_ODDS), `${k} 張`);
        else assert.equal(view.afterReset, null, `${k} 張`);
    }
});

test('completedLines()、doneCells：4 格都貼了的線與它們的格子', () => {
    assert.deepEqual(plain(completedLines(board(0, 1, 2, 3, 4, 5, 8, 10, 12))), [0, 4]);
    assert.deepEqual(plain(analyze(board(0, 1, 2, 3, 4, 5, 8, 10, 12)).doneCells), [0, 1, 2, 3, 4, 8, 12]);
    assert.deepEqual(plain(completedLines(board(0, 1, 2, 3, 5, 10, 15))), [0, 8]);
    assert.deepEqual(plain(analyze(board(0, 1, 2)).doneCells), []);
});

test('nearCells()：剛好貼了 3 張的線缺的那一格；同一格補齊兩條線只列一次；9 張時不列', () => {
    assert.deepEqual(plain(nearCells(board(0, 1, 2))), [3]);
    assert.deepEqual(plain(nearCells(board(0, 1, 2, 7, 11, 15))), [3]); // 上橫列與右直行都缺第 3 格
    assert.deepEqual(plain(nearCells(board(0, 1, 2, 5, 10, 12))), [3, 15]);
    assert.deepEqual(plain(nearCells(board(0, 1, 2, 3, 4, 8))), [12]); // 已經連成的上橫列不算
    assert.deepEqual(plain(nearCells(board(0, 1, 2, 4, 6, 9, 11, 13))), [3, 5]);
    assert.deepEqual(plain(nearCells(board(0, 1, 2, 4, 6, 9, 11, 13, 14))), []); // 9 張：上橫列有 3 張也不列
    assert.deepEqual(plain(analyze(board(0, 1, 2, 5, 10, 12)).nearCells), [3, 15]);
});

test('formatPercent()：0 寫 0%，≥ 99.995% 寫 100%，≥ 1% 一位小數，其他兩位小數', () => {
    assert.equal(formatPercent(0), '0%');
    assert.equal(formatPercent(1), '100%');
    assert.equal(formatPercent(0.99996), '100%');
    assert.equal(formatPercent(84 / 120), '70.0%');
    assert.equal(formatPercent(0.01), '1.0%');
    assert.equal(formatPercent(3 / 36), '8.3%');
    assert.equal(formatPercent(0.0099), '0.99%');
    assert.equal(formatPercent(1 / 11440), '0.01%');
});

test('不改傳進來的盤面（傳凍結的盤面也算得對）', () => {
    const frozen = Object.freeze(board(0, 1, 2));
    assert.deepEqual(plain(analyze(frozen).nearCells), [3]);
    assert.deepEqual(plain(lineCounts(frozen)), { total: 1716, atLeast: [1182, 264, 6] });
    assert.deepEqual(plain(frozen), plain(board(0, 1, 2)));
});

test('超過 9 張：丟 RangeError（頁面不會讓第 10 張貼上去）', () => {
    const ten = board(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
    assert.throws(() => lineCounts(ten), isRangeError);
    assert.throws(() => analyze(ten), isRangeError);
});
