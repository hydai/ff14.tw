/**
 * 仙人微彩的期望值計算：不碰 DOM；演算法照 main 3a0d6a2 的 script.js（第 613–777 行），算法不改。
 *
 * 盤面 grid 是長度 9 的陣列（0–8 由左到右、由上到下），元素是 null（還沒翻開）或 1–9（不重複）。
 * 所有函式都不改傳進來的盤面，也不靠 this，所以頁面可以解構出來單獨呼叫。
 *
 * 已知的格數不同，要回答的問題也不同：
 * - 已知 1–3 格（刮格）：cellValues() 給每個沒翻開的格子「刮這格之後照建議走完」的平均 MGP
 * - 已知 4 格以上（選線）：lineValues() 給 8 條線各自的平均 MGP
 * - 同分：期望值差距小於 TIE_EPSILON 都算同分，topTies() 留下並列最高的
 *
 * 常數與遞迴用的函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 */
const MiniCactpotSolver = (() => {
    // 三格總和 → MGP（遊戲的中獎表）
    const MGP = Object.freeze({
        6: 10000, 7: 36, 8: 720, 9: 360, 10: 80,
        11: 252, 12: 108, 13: 72, 14: 54, 15: 180,
        16: 72, 17: 180, 18: 119, 19: 36, 20: 306,
        21: 1080, 22: 144, 23: 1800, 24: 3600
    });

    // 8 條線：0–2 上中下橫列、3–5 左中右直行、6 左斜線（左上到右下）、7 右斜線（右上到左下），
    // 和線名的翻譯鍵（mini_cactpot_line_*）同順序
    const LINES = Object.freeze([
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // 橫列
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // 直行
        [0, 4, 8], [2, 4, 6]             // 斜線
    ].map((line) => Object.freeze(line)));

    // 期望值差距小於這個數就算同分：兩格在畫面上寫成同一個數字，不代表真的同分
    const TIE_EPSILON = 1e-6;

    // ---------- 期望值（照 main 的 computeOptimalEV／computeBestLineEV／computeLineEV） ----------

    /**
     * Recursively computes the optimal expected MGP from a given state.
     * At 4 known cells, returns the best line's EV.
     * At fewer, finds the best cell to reveal by averaging over all possible values.
     */
    function computeOptimalEV(grid, remaining, numKnown) {
        if (numKnown >= 4) {
            return computeBestLineEV(grid, remaining);
        }

        // Count remaining
        let remainingCount = 0;
        for (let n = 1; n <= 9; n++) {
            if (remaining[n]) remainingCount++;
        }

        let bestEV = -Infinity;

        for (let pos = 0; pos < 9; pos++) {
            if (grid[pos] !== null) continue;

            let totalEV = 0;
            for (let val = 1; val <= 9; val++) {
                if (!remaining[val]) continue;

                // Mutate
                grid[pos] = val;
                remaining[val] = false;

                totalEV += computeOptimalEV(grid, remaining, numKnown + 1);

                // Undo
                grid[pos] = null;
                remaining[val] = true;
            }

            const avgEV = totalEV / remainingCount;
            if (avgEV > bestEV) bestEV = avgEV;
        }

        return bestEV;
    }

    /**
     * Returns the maximum expected value across all 8 lines.
     * Called when exactly 4 cells are known.
     */
    function computeBestLineEV(grid, remaining) {
        // Collect remaining numbers into array for line EV computation
        const remainingArr = [];
        for (let n = 1; n <= 9; n++) {
            if (remaining[n]) remainingArr.push(n);
        }

        let bestEV = -Infinity;
        for (let i = 0; i < LINES.length; i++) {
            const ev = computeLineEV(LINES[i], grid, remainingArr);
            if (ev > bestEV) bestEV = ev;
        }
        return bestEV;
    }

    /**
     * Computes expected value for a single line.
     * Enumerates all valid assignments of remaining numbers to unknown positions.
     */
    function computeLineEV(line, grid, remainingArr) {
        const n = remainingArr.length;
        let knownSum = 0;
        let numUnknown = 0;

        for (let i = 0; i < 3; i++) {
            if (grid[line[i]] !== null) {
                knownSum += grid[line[i]];
            } else {
                numUnknown++;
            }
        }

        if (numUnknown === 0) {
            return MGP[knownSum] || 0;
        }

        if (numUnknown === 1) {
            let total = 0;
            for (let i = 0; i < n; i++) {
                total += MGP[knownSum + remainingArr[i]] || 0;
            }
            return total / n;
        }

        if (numUnknown === 2) {
            let total = 0;
            let count = 0;
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    if (i === j) continue;
                    total += MGP[knownSum + remainingArr[i] + remainingArr[j]] || 0;
                    count++;
                }
            }
            return count > 0 ? total / count : 0;
        }

        // numUnknown === 3
        let total = 0;
        let count = 0;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (j === i) continue;
                for (let k = 0; k < n; k++) {
                    if (k === i || k === j) continue;
                    total += MGP[remainingArr[i] + remainingArr[j] + remainingArr[k]] || 0;
                    count++;
                }
            }
        }
        return count > 0 ? total / count : 0;
    }

    // ---------- 盤面的小零件 ----------

    /** 已經翻開的格數 */
    function countKnown(grid) {
        return grid.filter((value) => value !== null).length;
    }

    /** 1–9 扣掉盤面上已知的數字，由小到大 */
    function remainingNumbers(grid) {
        const numbers = [];
        for (let n = 1; n <= 9; n++) {
            if (!grid.includes(n)) numbers.push(n);
        }
        return numbers;
    }

    /** 由小到大、不重複 */
    function sortedUnique(numbers) {
        return [...new Set(numbers)].sort((a, b) => a - b);
    }

    /** 從 candidates 由 start 起挑 size 個不同的數字（不分順序），每一種挑法把 sum 加上這幾個數字的總和，記進 sums */
    function collectSums(candidates, size, start, sum, sums) {
        if (size === 0) {
            sums.push(sum);
            return;
        }
        for (let i = start; i < candidates.length; i++) {
            collectSums(candidates, size - 1, i + 1, sum + candidates[i], sums);
        }
    }

    // ---------- 對外的函式 ----------

    /**
     * 已知 1–3 格時，每個還沒翻開的格子「刮這格之後照建議走完」的平均 MGP，照位置由小到大。
     * 已知 0 格或 4 格以上是 []。
     * 照 main 的 calculateCellRecommendations()，差別只有兩個：在盤面的複本上算
     * （演算法會暫時改動盤面再還原），結果不排序（迴圈本來就照位置推進）。
     * @param {Array<number|null>} grid
     * @returns {Array<{position: number, ev: number}>}
     */
    function cellValues(grid) {
        const revealedCount = countKnown(grid);
        if (revealedCount < 1 || revealedCount >= 4) return [];

        const work = grid.slice();

        // Build remaining numbers boolean array (index 1-9)
        const remaining = new Array(10).fill(true);
        remaining[0] = false;
        for (let i = 0; i < 9; i++) {
            if (work[i] !== null) {
                remaining[work[i]] = false;
            }
        }

        // Count remaining numbers
        let remainingCount = 0;
        for (let n = 1; n <= 9; n++) {
            if (remaining[n]) remainingCount++;
        }

        const results = [];
        for (let pos = 0; pos < 9; pos++) {
            if (work[pos] !== null) continue;

            // Average EV over all possible values at this position
            let totalEV = 0;
            for (let val = 1; val <= 9; val++) {
                if (!remaining[val]) continue;

                // Mutate
                work[pos] = val;
                remaining[val] = false;

                totalEV += computeOptimalEV(work, remaining, revealedCount + 1);

                // Undo
                work[pos] = null;
                remaining[val] = true;
            }

            results.push({ position: pos, ev: totalEV / remainingCount });
        }

        return results;
    }

    /**
     * 已知 4 格以上時，8 條線各自的平均 MGP，照線的順序（LINES 的順序）。不到 4 格是 []。
     * @param {Array<number|null>} grid
     * @returns {Array<{line: number, ev: number}>}
     */
    function lineValues(grid) {
        if (countKnown(grid) < 4) return [];

        const remainingArr = remainingNumbers(grid);
        return LINES.map((line, index) => ({ line: index, ev: computeLineEV(line, grid, remainingArr) }));
    }

    /**
     * 並列最高的那些：ev 與最大值相差小於 TIE_EPSILON，保留原本的順序。
     * 空陣列回傳空陣列。
     * @param {Array<{ev: number}>} entries - cellValues() 或 lineValues() 的結果
     * @returns {Array<{ev: number}>}
     */
    function topTies(entries) {
        if (entries.length === 0) return [];

        const best = Math.max(...entries.map((entry) => entry.ev));
        return entries.filter((entry) => best - entry.ev < TIE_EPSILON);
    }

    /**
     * 第 line 條線還可能出現的三格總和：已知的加上「1–9 扣掉已知數字」裡不重複的組合，
     * 由小到大、不重複。
     * @param {number} line - LINES 的索引
     * @param {Array<number|null>} grid
     * @returns {number[]}
     */
    function possibleSums(line, grid) {
        let knownSum = 0;
        let numUnknown = 0;
        for (const position of LINES[line]) {
            if (grid[position] === null) {
                numUnknown++;
            } else {
                knownSum += grid[position];
            }
        }

        const sums = [];
        collectSums(remainingNumbers(grid), numUnknown, 0, knownSum, sums);
        return sortedUnique(sums);
    }

    /**
     * 一次給出畫面要畫的東西（一打開、刮格、選線三種狀態都用它）：
     * known 已知格數；cells／lines 是 cellValues()／lineValues()；
     * suggestedCells／suggestedLines 是並列最高的格子位置／線；
     * bestLineEv 是 lines 的最大值（沒有 lines 時是 null）；
     * possibleSums 是每條推薦線的 possibleSums() 合起來，由小到大、不重複（沒有推薦線時是 []）。
     * @param {Array<number|null>} grid
     */
    function analyze(grid) {
        const cells = cellValues(grid);
        const lines = lineValues(grid);
        const suggestedLines = topTies(lines).map((entry) => entry.line);

        const sums = [];
        for (const line of suggestedLines) {
            sums.push(...possibleSums(line, grid));
        }

        return {
            known: countKnown(grid),
            cells,
            lines,
            suggestedCells: topTies(cells).map((entry) => entry.position),
            suggestedLines,
            bestLineEv: lines.length > 0 ? Math.max(...lines.map((entry) => entry.ev)) : null,
            possibleSums: sortedUnique(sums)
        };
    }

    /**
     * MGP 四捨五入到整數、加千分位逗號（三種語言都用逗號，所以不用 toLocaleString）
     * @param {number} value
     * @returns {string}
     */
    function formatMgp(value) {
        return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    return { MGP, LINES, TIE_EPSILON, cellValues, lineValues, topTies, possibleSums, analyze, formatMgp };
})();

// Export for use in other modules
window.MiniCactpotSolver = MiniCactpotSolver;
