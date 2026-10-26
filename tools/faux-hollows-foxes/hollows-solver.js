/**
 * 宗長計算機的盤面計算：不碰 DOM，盤面資料（board-data.js 的 252 種）當參數傳進來，所以測試可以用假想的盤面。
 *
 * 盤面 board 是長度 36 的數字陣列（6×6，格子 0–35 由左到右、由上到下，第 r 列第 c 格是 r × 6 + c），
 * 值同 board-data.js：0 空、1 障礙物、2 劍、3 寶箱、4 宗長或空。
 * 狀態 state 也是長度 36，每一格是 null（還沒標）或 'obstacle'、'sword'、'chest'、'fox'、'empty'。
 * 盤面與狀態都可以是凍結的陣列。所有函式都不改傳進來的東西，也不靠 this，所以頁面可以解構出來單獨呼叫。
 *
 * 「對得上」：一種盤面和狀態對得上，是指每一格都相容。沒標（null）什麼都可以；障礙物對 1、劍對 2、寶箱對 3、宗長對 4；
 * 空對 0 或 4（4 是「宗長或空」，這局宗長沒有出現在那一格，它就是空）。
 *
 * 每一種盤面一樣可能：一格是劍（寶箱）的比例 ＝ 對得上的盤面裡這格是劍（寶箱）的種數 ÷ 對得上的種數。
 * 要比大小時（下一格、同分）比的是種數這個整數，不除成比例再比，同分就是真的同分。
 * 翻開空格之後這只是近似：翻開的空格在某些盤面是宗長位置時，那幾種盤面其實機會比較小（宗長有出現的話，可能剛好在那格）。
 * 要算準得知道宗長多常出現、出現時在各個位置的機會，這些都沒有公開，所以不加權。差別很小：252 種盤面各配上宗長沒出現
 * 或在 4 個位置之一，共 1,260 局照建議翻，假設宗長出現率 50%、出現時 4 個位置一樣可能，有 206 局至少一步的百分比不同，
 * 最多差 7 個百分點；照加權後的比例選格子，翻完寶箱的機會只多 0.25 個百分點、找到宗長的多 0.05、劍不變，
 * 而且加權後最好的格子都在原本的下一格（同分的全部）裡。
 *
 * 宗長不給比例（設計 6.4）：宗長多常出現沒有公開，算不出實際的機率；而拿盤面的比例當機率會騙人：
 * 「假設這局有宗長」的比例每翻開一個空格就往上加（只剩 1 種盤面時 25% → 33% → 50% → 100%），
 * 「可能有宗長的盤面占幾成」在劍確定後會讓 4 格同時寫 100%。所以 analyze() 只回傳 foxCells（🦊 放在哪些格子），
 * 沒有任何宗長的比例；宗長只在決定「④ 翻宗長」的下一格時用種數排先後
 * （這格是「還沒翻開的宗長位置」的盤面種數越多越先，不管宗長多常出現，照實際機率排的順序都跟這個一樣）。
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 */
const FauxHollowsSolver = (() => {
    const SIZE = 36;
    // 一局最多翻開 11 格
    const MAX_REVEALS = 11;
    // 小選單的選項，也是 choices() 回傳的順序
    const ITEMS = Object.freeze(['sword', 'chest', 'fox', 'empty']);

    // 劍 2×3 或 3×2 是 6 格，寶箱 2×2 是 4 格
    const SWORD_CELLS = 6;
    const CHEST_CELLS = 4;

    // 盤面上的值（同 board-data.js）
    const BLANK = 0;
    const OBSTACLE = 1;
    const SWORD = 2;
    const CHEST = 3;
    const FOX_OR_EMPTY = 4;

    // 狀態 → 盤面上可以是的值
    const FITS = Object.freeze({
        obstacle: Object.freeze([OBSTACLE]),
        sword: Object.freeze([SWORD]),
        chest: Object.freeze([CHEST]),
        fox: Object.freeze([FOX_OR_EMPTY]),
        empty: Object.freeze([BLANK, FOX_OR_EMPTY])
    });

    // ---------- 盤面的小零件 ----------

    /** 長度 36、全是 0 的新陣列 */
    function zeros() {
        return new Array(SIZE).fill(0);
    }

    /** 這種盤面和狀態對得上嗎：每一個有標的格子都相容 */
    function fits(board, state) {
        for (let position = 0; position < SIZE; position++) {
            const mark = state[position];
            if (mark !== null && !FITS[mark].includes(board[position])) return false;
        }
        return true;
    }

    /** boards 裡和狀態對得上的盤面 */
    function matching(boards, state) {
        return boards.filter((board) => fits(board, state));
    }

    /** 每一格在 boards 裡的值是 value 的盤面有幾種，長度 36 */
    function countAt(boards, value) {
        const counts = zeros();
        for (const board of boards) {
            for (let position = 0; position < SIZE; position++) {
                if (board[position] === value) counts[position]++;
            }
        }
        return counts;
    }

    /** 種數最大的格子，同分全部，由小到大；最大是 0 時是 [] */
    function topPositions(counts) {
        const best = Math.max(...counts);
        if (best <= 0) return [];
        const positions = [];
        counts.forEach((count, position) => {
            if (count === best) positions.push(position);
        });
        return positions;
    }

    // ---------- 兩個階段 ----------

    /**
     * 障礙物（兩個階段都算）：只看手動標的障礙物，數和它們對得上的盤面有 total 種，
     * 以及每一格在這些盤面裡是障礙物的次數 c：
     * c 等於 total 的是已知的（known，手動的也算），其中不是手動標的就是自動補上的（auto）；
     * 0 < c < total 的還能標（obstacleCells）；
     * total > 0 而且每一格的 c 不是 0 就是 total，擺法就確定了（settled），進入翻格。
     * total 是 0（標的格子在每一種盤面都不是障礙物）時 c 全是 0，所以什麼都不算已知。
     */
    function obstacleView(boards, state) {
        const manual = state.map((mark) => (mark === 'obstacle' ? mark : null));
        const fitting = matching(boards, manual);
        const total = fitting.length;
        const counts = countAt(fitting, OBSTACLE);

        let known = 0;
        let settled = total > 0;
        const auto = [];
        const obstacleCells = [];
        counts.forEach((count, position) => {
            if (count === 0) return;
            if (count === total) {
                known++;
                if (state[position] !== 'obstacle') auto.push(position);
            } else {
                obstacleCells.push(position);
                settled = false;
            }
        });

        return { total, known, auto, obstacleCells, settled };
    }

    /**
     * 翻格階段：數和整份狀態對得上的盤面（matches 種）裡，每一個還沒翻的格子是劍、是寶箱、是宗長位置（值 4）的種數，
     * 得出劍與寶箱的比例、🦊 放哪些格子（還沒找到宗長時，是宗長位置的種數大於 0 的格子）、現在的目標與下一格。
     * @param {number[][]} boards
     * @param {Array<string|null>} state
     * @param {number[]} auto - 自動補上的障礙物，不算還沒翻
     * @param {number} left - 還能翻幾格
     */
    function revealView(boards, state, auto, left) {
        const fitting = matching(boards, state);
        const matches = fitting.length;

        // 還沒翻的格子：沒標，也不是自動補上的；別格的種數不算
        const open = state.map((mark, position) => mark === null && !auto.includes(position));
        const onlyOpen = (counts) => counts.map((count, position) => (open[position] ? count : 0));
        const swordCounts = onlyOpen(countAt(fitting, SWORD));
        const chestCounts = onlyOpen(countAt(fitting, CHEST));
        const foxCounts = onlyOpen(countAt(fitting, FOX_OR_EMPTY));
        const ratios = (counts) => counts.map((count) => (matches > 0 ? count / matches : 0));

        // 🦊：還沒找到宗長時，還有哪些格子可能是宗長；找到之後其他格都不放
        const foxCells = [];
        if (!state.includes('fox')) {
            foxCounts.forEach((count, position) => {
                if (count > 0) foxCells.push(position);
            });
        }

        // 目標照順序判斷：劍（還沒翻完而且剩的次數夠翻完）→ 寶箱（同）→ 宗長（有 🦊 可放）→ 完成；次數不夠就跳到下一個
        const swordsFound = state.filter((mark) => mark === 'sword').length;
        const chestsFound = state.filter((mark) => mark === 'chest').length;
        let goal = null;
        let goalCounts = null;
        if (matches > 0 && left > 0) {
            if (swordsFound < SWORD_CELLS && left >= SWORD_CELLS - swordsFound) {
                goal = 'sword';
                goalCounts = swordCounts;
            } else if (chestsFound < CHEST_CELLS && left >= CHEST_CELLS - chestsFound) {
                goal = 'chest';
                goalCounts = chestCounts;
            } else if (foxCells.length > 0) {
                goal = 'fox';
                goalCounts = foxCounts;
            }
        }

        return {
            matches,
            goal,
            next: goalCounts === null ? [] : topPositions(goalCounts),
            sword: ratios(swordCounts),
            chest: ratios(chestCounts),
            foxCells
        };
    }

    // ---------- 對外的函式 ----------

    /**
     * board-data.js 的 6×6（一列一個陣列）一列接一列轉成長度 36 的盤面。回傳新的陣列，不改 data。
     * @param {number[][][]} data
     * @returns {number[][]}
     */
    function flatten(data) {
        return data.map((rows) => rows.flat());
    }

    /**
     * 一次給出畫面要畫的東西，每次都從 36 格的狀態重新算（自動補上的障礙物不存進狀態）：
     * - phase：'obstacles'（擺法還沒確定，點被擋住的格子）或 'reveal'（擺法確定了，翻格）。
     * - matches：障礙物階段是和手動障礙物對得上的盤面數；翻格階段是和整份狀態對得上的盤面數。
     * - known：在每個對得上的盤面裡都是障礙物的格數，手動的也算；auto：其中自動補上的格子，由小到大。
     * - obstacleCells：障礙物階段還能標的格子；翻格階段是 []。
     * - left：11 減去翻開的格數（狀態是劍、寶箱、宗長、空的格子）。
     * - goal：下一個目標 'sword'、'chest'、'fox'；null 是完成（次數用完、宗長沒了；對不上任何盤面時也是），障礙物階段也是 null。
     * - next：目標的下一格，同分的全部，由小到大（障礙物階段是 []）。
     * - sword、chest：長度 36，每一格是劍、寶箱的比例（0–1）；只有還沒翻的格子有，障礙物階段全是 0。
     * - foxCells：放 🦊 的格子，由小到大。宗長沒有比例（見上面的說明）。
     * @param {number[][]} boards - flatten() 的結果
     * @param {Array<string|null>} state
     */
    function analyze(boards, state) {
        const left = MAX_REVEALS - state.filter((mark) => ITEMS.includes(mark)).length;
        const { total, known, auto, obstacleCells, settled } = obstacleView(boards, state);

        if (!settled) {
            return {
                phase: 'obstacles',
                matches: total,
                known,
                auto,
                obstacleCells,
                left,
                goal: null,
                next: [],
                sword: zeros(),
                chest: zeros(),
                foxCells: []
            };
        }

        const reveal = revealView(boards, state, auto, left);
        return {
            phase: 'reveal',
            matches: reveal.matches,
            known,
            auto,
            obstacleCells: [],
            left,
            goal: reveal.goal,
            next: reveal.next,
            sword: reveal.sword,
            chest: reveal.chest,
            foxCells: reveal.foxCells
        };
    }

    /**
     * 小選單的選項：把這一格當成還沒翻開（已經翻開的格子也一樣），和其他格還對得上的盤面裡這格可能是什麼，
     * 照 ITEMS 的順序。宗長只有一隻：別格已經是宗長時不列宗長，自己是宗長時照樣列。
     * 障礙物（手動標的）是 []；自動補上的格子在每一種盤面都是障礙物，自然也是 []。
     * @param {number[][]} boards - flatten() 的結果
     * @param {Array<string|null>} state
     * @param {number} position
     * @returns {string[]}
     */
    function choices(boards, state, position) {
        if (state[position] === 'obstacle') return [];

        const rest = state.slice();
        rest[position] = null;
        const foxElsewhere = rest.includes('fox');

        const found = new Set();
        for (const board of matching(boards, rest)) {
            const value = board[position];
            if (value === SWORD) {
                found.add('sword');
            } else if (value === CHEST) {
                found.add('chest');
            } else if (value === BLANK) {
                found.add('empty');
            } else if (value === FOX_OR_EMPTY) {
                found.add('empty');
                if (!foxElsewhere) found.add('fox');
            }
        }
        return ITEMS.filter((item) => found.has(item));
    }

    /**
     * 比例寫成整數百分比（帶 %）：0（或以下）不寫，大於 0 但不到 1% 寫 <1%。
     * 先判比例（< 0.01）再乘 100 四捨五入：先四捨五入的話，0.004 會變成 0 而寫成 ''。
     * @param {number} fraction - 0 到 1
     * @returns {string}
     */
    function formatPercent(fraction) {
        if (fraction <= 0) return '';
        if (fraction < 0.01) return '<1%';
        return `${Math.round(fraction * 100)}%`;
    }

    return Object.freeze({ SIZE, MAX_REVEALS, ITEMS, flatten, analyze, choices, formatPercent });
})();

// Export for use in other modules
window.FauxHollowsSolver = FauxHollowsSolver;
