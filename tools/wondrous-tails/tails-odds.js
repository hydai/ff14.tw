/**
 * 天書奇談的連線機率：不碰 DOM，只回答「貼滿 9 張時，連成幾條線的機會有多大」。
 *
 * 盤面 board 是長度 16 的布林陣列（4×4，0–15 由左到右、由上到下），true 是貼了貼紙；可以是凍結的陣列。
 * 所有函式都不改傳進來的盤面，也不靠 this，所以頁面可以解構出來單獨呼叫。
 *
 * 規則：最多貼 9 張，10 條線（4 橫、4 直、2 斜）。貼了 k 張時，剩下的 9−k 張隨機落在 16−k 個空格，
 * 每一種落法（C(16−k, 9−k) 種）一樣可能，所以「至少 N 條」的機率 ＝ 連成至少 N 條線的落法數 ÷ 全部的落法數。
 * 貼了 3～7 張時可以重置：重置會把所有貼紙重新隨機擺放，所以重置之後就是一個隨機的 9 張盤面，
 * 機率等於空盤面的機率（RESET_ODDS）。
 *
 * 常數與遞迴用的函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 */
const WondrousTailsOdds = (() => {
    const CELL_COUNT = 16;
    const MAX_STICKERS = 9;
    const LINE_LENGTH = 4;
    // 機率只列到「至少 3 條」：貼滿 9 張最多連成 3 條線
    const LINE_GOALS = 3;
    // 可以重置的張數：貼了 3～7 張
    const RESET_MIN = 3;
    const RESET_MAX = 7;

    // 10 條線：0–3 上到下的橫列、4–7 左到右的直行、8 左上到右下的斜線、9 右上到左下的斜線
    const LINES = Object.freeze([
        [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15], // 橫列
        [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15], // 直行
        [0, 5, 10, 15], [3, 6, 9, 12]                                 // 斜線
    ].map((line) => Object.freeze(line)));

    // ---------- 盤面的小零件 ----------

    /** 貼了幾張 */
    function countPlaced(board) {
        let placed = 0;
        for (let position = 0; position < CELL_COUNT; position++) {
            if (board[position]) placed++;
        }
        return placed;
    }

    /** 第 index 條線的 4 格是不是都貼了 */
    function isCompleted(index, cells) {
        for (const position of LINES[index]) {
            if (!cells[position]) return false;
        }
        return true;
    }

    /** 連成了幾條線 */
    function countCompleted(cells) {
        let completed = 0;
        for (let index = 0; index < LINES.length; index++) {
            if (isCompleted(index, cells)) completed++;
        }
        return completed;
    }

    /** 由小到大、不重複 */
    function sortedCells(positions) {
        return [...positions].sort((a, b) => a - b);
    }

    // ---------- 對外的函式 ----------

    /**
     * 列舉剩下 9−k 張落在空格的每一種擺法（不分貼的先後），數貼滿 9 張時連成幾條線。
     * total 是擺法數（C(16−k, 9−k)），atLeast[i] 是貼滿時至少連成 i+1 條線的擺法數。
     * 貼了超過 9 張丟 RangeError。
     * @param {boolean[]} board
     * @returns {{total: number, atLeast: number[]}}
     */
    function lineCounts(board) {
        const placed = countPlaced(board);
        if (placed > MAX_STICKERS) {
            throw new RangeError(`最多只能貼 ${MAX_STICKERS} 張，這個盤面貼了 ${placed} 張`);
        }

        // 在複本上貼，貼完再拿掉，不改到傳進來的盤面
        const cells = [];
        const empty = [];
        for (let position = 0; position < CELL_COUNT; position++) {
            cells.push(Boolean(board[position]));
            if (!board[position]) empty.push(position);
        }

        const atLeast = new Array(LINE_GOALS).fill(0);
        let total = 0;

        // 從 empty 的 start 起再挑 left 個空格貼上；挑滿了就直接數連成幾條線，不先把每一種盤面存起來
        function place(start, left) {
            if (left === 0) {
                total++;
                const completed = countCompleted(cells);
                for (let goal = 0; goal < LINE_GOALS && goal < completed; goal++) atLeast[goal]++;
                return;
            }
            for (let i = start; i <= empty.length - left; i++) {
                cells[empty[i]] = true;
                place(i + 1, left - 1);
                cells[empty[i]] = false;
            }
        }

        place(0, MAX_STICKERS - placed);
        return { total, atLeast };
    }

    // 重置之後＝隨機 9 張的盤面＝空盤面；載入時用同一個列舉算一次，不另外寫死（測試釘住 6,688／1,208／24 ÷ 11,440）
    const emptyCounts = lineCounts(new Array(CELL_COUNT).fill(false));
    const RESET_ODDS = Object.freeze(emptyCounts.atLeast.map((count) => count / emptyCounts.total));

    /**
     * 貼了這麼多張時能不能重置：3～7 張
     * @param {number} placedCount
     * @returns {boolean}
     */
    function canReset(placedCount) {
        return placedCount >= RESET_MIN && placedCount <= RESET_MAX;
    }

    /**
     * 4 格都貼了的線的編號（LINES 的索引），由小到大
     * @param {boolean[]} board
     * @returns {number[]}
     */
    function completedLines(board) {
        const indexes = [];
        for (let index = 0; index < LINES.length; index++) {
            if (isCompleted(index, board)) indexes.push(index);
        }
        return indexes;
    }

    /**
     * 只差一張就連成線的空格：剛好貼了 3 張的線缺的那一格，不重複、由小到大。
     * 已經貼滿 9 張時不能再貼，所以是 []。
     * @param {boolean[]} board
     * @returns {number[]}
     */
    function nearCells(board) {
        if (countPlaced(board) >= MAX_STICKERS) return [];

        const cells = new Set();
        for (const line of LINES) {
            let stickers = 0;
            let missing = -1;
            for (const position of line) {
                if (board[position]) stickers++;
                else missing = position;
            }
            if (stickers === LINE_LENGTH - 1) cells.add(missing);
        }
        return sortedCells(cells);
    }

    /**
     * 一次給出畫面要畫的東西：
     * placed 已貼張數；now[i] 是現在貼滿時至少 i+1 條線的機率；
     * afterReset 是重置之後的機率（RESET_ODDS），不能重置（不是 3～7 張）時是 null；
     * doneCells 是連成的線上的每一格，nearCells 是只差一張的空格，都是由小到大、不重複。
     * 貼了超過 9 張丟 RangeError。
     * @param {boolean[]} board
     * @returns {{placed: number, now: number[], afterReset: number[]|null, doneCells: number[], nearCells: number[]}}
     */
    function analyze(board) {
        const { total, atLeast } = lineCounts(board);
        const placed = countPlaced(board);

        const done = new Set();
        for (const index of completedLines(board)) {
            for (const position of LINES[index]) done.add(position);
        }

        return {
            placed,
            now: atLeast.map((count) => count / total),
            afterReset: canReset(placed) ? RESET_ODDS : null,
            doneCells: sortedCells(done),
            nearCells: nearCells(board)
        };
    }

    /**
     * 機率寫成百分比：0 寫 0%，≥ 99.995% 寫 100%，≥ 1% 一位小數，其他兩位小數。
     * 門檻用比例比（不先乘 100），邊界才不會被浮點誤差吃掉。
     * @param {number} fraction - 0 到 1
     * @returns {string}
     */
    function formatPercent(fraction) {
        if (fraction === 0) return '0%';
        if (fraction >= 0.99995) return '100%';
        const percent = fraction * 100;
        return fraction >= 0.01 ? `${percent.toFixed(1)}%` : `${percent.toFixed(2)}%`;
    }

    return { LINES, RESET_ODDS, lineCounts, canReset, completedLines, nearCells, analyze, formatPercent };
})();

// Export for use in other modules
window.WondrousTailsOdds = WondrousTailsOdds;
