/**
 * 陸行鳥染色的計算：不碰 DOM。配方的規則照 main f309e6f 的 tools/guide/chocobo-color-calculator.js（第 225–313 行），
 * 規則不改；分段與檸檬是新的。
 *
 * data 是 data/chocobo-colors.json 解析後的物件（colors、fruits），水果與顏色都用 id 表示。
 * 檸檬與它變回的顏色從資料讀（fruits 裡有 resetsTo 的那一顆），這裡不寫死。
 * 所有函式都不改傳進來的東西，也不靠 this，所以頁面可以解構出來單獨呼叫；不認得的 id 丟 RangeError。
 *
 * - recipe()：從某個 RGB 染到目標色，要餵哪幾種水果、各幾顆（不管順序）
 * - segments()：這些水果怎麼排：連續餵同一種當一段，在每一步都不超出 0～255 的餵法裡挑段數最少的，
 *   同樣段數時挑整個過程離 0 或 255 最遠的，再一樣就照 fruits 的順序
 * - plan()：直接染與先餵檸檬再染，挑顆數少的（一樣多用檸檬），只對挑中的那個做法排分段
 * - bestTotal()：只要顆數，不排分段（色板面板一次要算 85 格）
 * - colorGroups()：色板面板的顏色分組
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 */
const ChocoboColorSolver = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const CHANNELS = Object.freeze(['r', 'g', 'b']);
    // 三種基底水果，其他三種是它們效果完全相反的水果
    const BASIS = Object.freeze(['xelphatol-apple', 'mamook-pear', 'oghomoro-berries']);
    // 每一顆水果每個通道改 5，能到的 RGB 只落在起點加上 5 的整數倍
    const STEP = 5;
    // 目標色每個通道最近的格點，往兩邊各看幾步
    const REACH = 2;
    // 一份配方最多 3 種水果（三個基底水果各自選正的或相反的那一種）
    const MAX_KINDS = 3;

    // 分段的狀態：上一顆是哪一種（0 到 MAX_KINDS - 1），或是還沒餵（MAX_KINDS）
    const SLOTS = MAX_KINDS + 1;
    const NOT_FED_YET = MAX_KINDS;
    // 走不到終點的段數；餵完之後沒有下一顆要撞到邊界，離邊界的距離不設限（都是 Int16Array 放得下的數）
    const NO_ROUTE = 30000;
    const NO_LIMIT = 30000;

    const GROUP_KEYS = Object.freeze(['white', 'yellow', 'red', 'brown', 'purple', 'blue', 'green']);
    // 顏色 id 最後一段（desert-yellow 的 yellow）分到哪一組
    const GROUP_OF_SUFFIX = new Map([
        ['white', 'white'], ['grey', 'white'], ['black', 'white'],
        ['yellow', 'yellow'], ['orange', 'yellow'],
        ['red', 'red'], ['pink', 'red'],
        ['brown', 'brown'], ['purple', 'purple'], ['blue', 'blue'], ['green', 'green']
    ]);

    // ---------- 資料查詢 ----------

    function colorOf(data, id) {
        const color = data.colors.find((candidate) => candidate.id === id);
        if (!color) throw new RangeError(`不認得的顏色：${id}`);
        return color;
    }

    function fruitOf(data, id) {
        const fruit = data.fruits.find((candidate) => candidate.id === id);
        if (!fruit) throw new RangeError(`不認得的水果：${id}`);
        return fruit;
    }

    // ---------- 配方（規則同 chocobo-color-calculator.js 的 planFeeding） ----------

    const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

    // 三個向量（當成欄）組成的 3×3 行列式
    function determinant([a, b, c]) {
        return a[0] * (b[1] * c[2] - b[2] * c[1]) -
            b[0] * (a[1] * c[2] - a[2] * c[1]) +
            c[0] * (a[1] * b[2] - a[2] * b[1]);
    }

    /**
     * 有沒有一種餵法，餵完每一顆之後三個通道都還在 0～255。只回答有沒有，順序由 segments() 另外排。
     * 回溯：每一步先試最接近「起點到終點直線」的水果，走到死路就退回去；還剩的顆數一樣的狀態失敗過就不再走。
     * @param {number[]} start - 開始餵之前的 RGB
     * @param {number[]} end - 餵完的 RGB
     * @param {{fruit: object, count: number}[]} items - 水果（資料裡的整個物件）與顆數
     * @returns {boolean}
     */
    function hasSafeOrder(start, end, items) {
        const remaining = items.map((item) => item.count);
        const total = remaining.reduce((sum, count) => sum + count, 0);
        const failed = new Set();
        let fed = 0;
        const visit = (rgb) => {
            if (fed === total) return true;
            const key = remaining.join(',');
            if (failed.has(key)) return false;
            const progress = (fed + 1) / total;
            const choices = [];
            items.forEach((item, index) => {
                if (remaining[index] === 0) return;
                const next = rgb.map((value, channel) => value + item.fruit.effect[CHANNELS[channel]]);
                if (next.some((value) => value < 0 || value > 255)) return;
                const deviation = next.reduce((sum, value, channel) =>
                    sum + (value - (start[channel] + (end[channel] - start[channel]) * progress)) ** 2, 0);
                choices.push({ index, next, deviation });
            });
            choices.sort((a, b) => a.deviation - b.deviation);
            for (const choice of choices) {
                remaining[choice.index]--;
                fed++;
                if (visit(choice.next)) return true;
                remaining[choice.index]++;
                fed--;
            }
            failed.add(key);
            return false;
        };
        return visit(start);
    }

    /**
     * 從 startRgb 染到 toId 這個顏色要餵哪幾種水果。
     * RGB 以 5 為步長，目標色通常不在可達的格點上：從目標色每個通道最近的格點前後各 2 步裡，
     * 只留「離目標色比離其他任何顏色都近」的，依「離目標多近、顆數多少」排序（一樣就照產生的順序），
     * 取第一個有一種每一步都不超出 0～255 的餵法的。顆數用三種基底水果的效果向量以克拉瑪法則解整數，
     * 負的換成效果完全相反的水果，0 顆的省略，fruits 照三種基底水果的位置排。
     * 現在就在目標色上時是 0 顆的配方。這是依平均 RGB 效果的估算，遊戲裡的隨機變化仍可能需要後續微調。
     * @param {object} data
     * @param {number[]} startRgb
     * @param {string} toId
     * @returns {{fruits: {fruit: string, count: number}[], rgb: number[], total: number} | null}
     *   rgb 是餵完的 RGB；找不到時是 null
     */
    function recipe(data, startRgb, toId) {
        const target = colorOf(data, toId);
        const basis = BASIS.map((id) => fruitOf(data, id));
        const columns = basis.map((fruit) => CHANNELS.map((channel) => fruit.effect[channel]));
        const denominator = determinant(columns);
        const opposites = basis.map((fruit) => data.fruits.find((other) =>
            other.effect && CHANNELS.every((channel) => other.effect[channel] === -fruit.effect[channel])));

        // 把 RGB 差值換成水果；解不出整數、或需要的相反水果不存在時是 null
        const fruitsFor = (delta) => {
            const items = [];
            for (let i = 0; i < basis.length; i++) {
                const amount = determinant(columns.map((column, index) => (index === i ? delta : column))) / denominator;
                if (!Number.isInteger(amount)) return null;
                if (amount === 0) continue;
                const fruit = amount > 0 ? basis[i] : opposites[i];
                if (!fruit) return null;
                items.push({ fruit, count: Math.abs(amount) });
            }
            return items;
        };

        const nearby = target.rgb.map((value, channel) => {
            const nearest = Math.round((value - startRgb[channel]) / STEP);
            const offsets = [];
            for (let offset = -REACH; offset <= REACH; offset++) offsets.push(startRgb[channel] + (nearest + offset) * STEP);
            return offsets.filter((point) => point >= 0 && point <= 255);
        });
        const candidates = [];
        for (const r of nearby[0]) {
            for (const g of nearby[1]) {
                for (const b of nearby[2]) {
                    const rgb = [r, g, b];
                    const error = distance(rgb, target.rgb);
                    if (data.colors.some((color) => color.id !== target.id && distance(rgb, color.rgb) <= error)) continue;
                    const items = fruitsFor([r - startRgb[0], g - startRgb[1], b - startRgb[2]]);
                    if (items) candidates.push({ rgb, error, items, total: items.reduce((sum, item) => sum + item.count, 0) });
                }
            }
        }
        candidates.sort((a, b) => a.error - b.error || a.total - b.total);
        for (const candidate of candidates) {
            if (!hasSafeOrder(startRgb, candidate.rgb, candidate.items)) continue;
            return {
                fruits: candidate.items.map(({ fruit, count }) => ({ fruit: fruit.id, count })),
                rgb: candidate.rgb,
                total: candidate.total
            };
        }
        return null;
    }

    // ---------- 分段 ----------

    /**
     * 這些水果怎麼排。連續餵同一種算一段；在餵完每一顆之後三個通道都在 0～255 的餵法裡，挑段數最少的；
     * 同樣段數時挑「餵完每一顆之後離 0 或 255 最近的一刻」最遠的（實際數值和標準值有落差時比較不會超出）；
     * 再一樣就照 fruits 的順序（先試到的留下）。
     *
     * 做法是從「全部餵完」往回填的動態規劃。狀態是「各種水果已經餵了幾顆」加上「上一顆是哪一種」，
     * 一個狀態只記：從這裡餵完最少要幾段、那些做法裡最近的一刻最遠有多遠、下一顆餵哪一種。
     * 狀態數最多約數十萬，表格都在事先配好的 typed array 裡，狀態的迴圈裡不建立陣列或物件，
     * 也不呼叫 Math.min 這類全域函式：測試是在 vm 裡載入這個檔案，vm 裡查全域慢很多
     * （7,225 組的 plan() 因此從 2 秒變成 13 秒），所以迴圈裡的比大小都寫成 ?:。
     *
     * @param {object} data
     * @param {number[]} startRgb - 開始餵之前的 RGB
     * @param {{fruit: string, count: number}[]} fruits - 最多 3 種，要餵的水果與顆數
     * @returns {{fruit: string, count: number}[] | null} 照順序的每一段；沒有每一步都在範圍內的餵法時是 null
     */
    function segments(data, startRgb, fruits) {
        const kinds = fruits.length;
        if (kinds > MAX_KINDS) throw new RangeError(`最多 ${MAX_KINDS} 種水果，收到 ${kinds} 種`);
        if (kinds === 0) return [];

        // 各種水果要餵幾顆、每顆對 R／G／B 的效果（effect[種類 * 3 + 通道]）；不足 3 種的補 0 顆，那一層迴圈只會走一格
        const need = [0, 0, 0];
        const effect = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < kinds; i++) {
            const fruit = fruitOf(data, fruits[i].fruit);
            if (!fruit.effect) throw new RangeError(`${fruit.id} 沒有 RGB 效果，不能排進分段`);
            need[i] = fruits[i].count;
            for (let c = 0; c < 3; c++) effect[i * 3 + c] = fruit.effect[CHANNELS[c]];
        }
        // 狀態 (u0, u1, u2) 的編號：u 是各種水果已經餵了幾顆。多餵一顆第 i 種，編號就加 stride[i]
        const stride = [(need[1] + 1) * (need[2] + 1), need[2] + 1, 1];
        const size = (need[0] + 1) * stride[0];

        // edge[編號]：這個狀態的 RGB 離 0／255 最近的距離，超出範圍是 -1
        const edge = new Int16Array(size);
        for (let u0 = 0; u0 <= need[0]; u0++) {
            for (let u1 = 0; u1 <= need[1]; u1++) {
                for (let u2 = 0; u2 <= need[2]; u2++) {
                    let nearest = 255;
                    for (let c = 0; c < 3; c++) {
                        const value = startRgb[c] + u0 * effect[c] + u1 * effect[3 + c] + u2 * effect[6 + c];
                        const gap = value < 255 - value ? value : 255 - value;
                        if (gap < nearest) nearest = gap;
                    }
                    edge[u0 * stride[0] + u1 * stride[1] + u2] = nearest < 0 ? -1 : nearest;
                }
            }
        }

        // 以 (編號, 上一顆是哪一種) 為鍵：runs 還要幾段、margin 最近的一刻最遠有多遠、next 下一顆餵哪一種（-1 是餵完了或走不下去）
        const runs = new Int16Array(size * SLOTS);
        const margin = new Int16Array(size * SLOTS);
        const next = new Int8Array(size * SLOTS);
        const used = [0, 0, 0];
        // 編號由大到小填：多餵一顆的狀態編號一定比較大，已經填好
        for (let u0 = need[0]; u0 >= 0; u0--) {
            used[0] = u0;
            for (let u1 = need[1]; u1 >= 0; u1--) {
                used[1] = u1;
                for (let u2 = need[2]; u2 >= 0; u2--) {
                    used[2] = u2;
                    const index = u0 * stride[0] + u1 * stride[1] + u2;
                    const finished = u0 === need[0] && u1 === need[1] && u2 === need[2];
                    for (let last = 0; last < SLOTS; last++) {
                        const key = index * SLOTS + last;
                        if (finished) {
                            runs[key] = 0;
                            margin[key] = NO_LIMIT;
                            next[key] = -1;
                            continue;
                        }
                        let bestRuns = NO_ROUTE;
                        let bestMargin = -1;
                        let bestFruit = -1;
                        for (let i = 0; i < kinds; i++) {
                            if (used[i] === need[i]) continue;
                            const after = index + stride[i];
                            if (edge[after] < 0) continue;
                            const sub = after * SLOTS + i;
                            if (runs[sub] >= NO_ROUTE) continue;
                            const throughRuns = runs[sub] + (i === last ? 0 : 1);
                            const throughMargin = edge[after] < margin[sub] ? edge[after] : margin[sub];
                            // 段數少的贏；一樣就離邊界遠的贏；再一樣留下先試到的（i 由小到大，就是 fruits 的順序）
                            if (throughRuns < bestRuns || (throughRuns === bestRuns && throughMargin > bestMargin)) {
                                bestRuns = throughRuns;
                                bestMargin = throughMargin;
                                bestFruit = i;
                            }
                        }
                        runs[key] = bestRuns;
                        margin[key] = bestMargin;
                        next[key] = bestFruit;
                    }
                }
            }
        }
        // 起點是編號 0、還沒餵（鍵 = 0 * SLOTS + NOT_FED_YET）；這裡走不到終點就是沒有每一步都在範圍內的餵法
        if (runs[NOT_FED_YET] >= NO_ROUTE) return null;

        // 從 (編號 0, 還沒餵) 沿 next 走，連續同一種合成一段
        const out = [];
        let index = 0;
        let last = NOT_FED_YET;
        for (;;) {
            const i = next[index * SLOTS + last];
            if (i < 0) break;
            if (i === last) out[out.length - 1].count++;
            else out.push({ fruit: fruits[i].fruit, count: 1 });
            index += stride[i];
            last = i;
        }
        return out;
    }

    // ---------- 怎麼染 ----------

    /**
     * 兩個做法的配方（還沒排分段）：直接染；先餵檸檬（變回重置色）再從重置色染。
     * 檸檬是資料裡有 resetsTo 的那一顆水果，resetsTo 是它變回的顏色，兩個都從資料讀。
     * 現在就是重置色時沒有檸檬做法；目標就是重置色時檸檬做法是 0 顆的配方，只剩那一顆檸檬。
     * start 是排分段時開始餵的 RGB，total 含檸檬那一顆。
     */
    function routesOf(data, from, to) {
        const lemonFruit = data.fruits.find((fruit) => fruit.resetsTo);
        const reset = colorOf(data, lemonFruit.resetsTo);
        const direct = recipe(data, from.rgb, to.id);
        const rest = from.id === reset.id ? null : recipe(data, reset.rgb, to.id);
        return {
            lemonFruit,
            direct: direct && { start: from.rgb, fruits: direct.fruits, rgb: direct.rgb, total: direct.total },
            lemon: rest && { start: reset.rgb, fruits: rest.fruits, rgb: rest.rgb, total: 1 + rest.total }
        };
    }

    /**
     * 從 fromId 染到 toId 怎麼餵最省。直接染與先餵檸檬再染都算，用顆數少的，一樣多用檸檬
     * （從確定的重置色開始，比較準）。只對挑中的那個做法排分段。
     * @param {object} data
     * @param {string} fromId
     * @param {string} toId
     * @returns {{
     *   same: boolean,
     *   route: 'direct' | 'lemon' | null,
     *   total: number,
     *   steps: {fruit: string, count: number}[],
     *   rgb: number[] | null,
     *   directTotal: number | null,
     *   lemonTotal: number | null
     * }}
     *   same 為 true（目前就是目標）時 route、rgb、directTotal、lemonTotal 都是 null，total 0，steps 空；
     *   route 是 null 且 total 0、steps 空時是兩個做法都找不到；
     *   steps 是照順序的每一段，檸檬那一段是 { fruit: 檸檬的 id, count: 1 }，永遠在第一個；
     *   rgb 是餵完的 RGB；directTotal、lemonTotal 是兩個做法各要幾顆（沒有那個做法時是 null）
     */
    function plan(data, fromId, toId) {
        const from = colorOf(data, fromId);
        const to = colorOf(data, toId);
        if (from.id === to.id) {
            return { same: true, route: null, total: 0, steps: [], rgb: null, directTotal: null, lemonTotal: null };
        }

        const { lemonFruit, direct, lemon } = routesOf(data, from, to);
        const useLemon = lemon !== null && (direct === null || lemon.total <= direct.total);
        const chosen = useLemon ? lemon : direct;
        if (!chosen) {
            return { same: false, route: null, total: 0, steps: [], rgb: null, directTotal: null, lemonTotal: null };
        }
        // recipe() 挑的配方一定有每一步都在範圍內的餵法（兩邊問的是同一件事），所以這裡不會是 null
        const arranged = segments(data, chosen.start, chosen.fruits);
        return {
            same: false,
            route: useLemon ? 'lemon' : 'direct',
            total: chosen.total,
            steps: useLemon ? [{ fruit: lemonFruit.id, count: 1 }, ...arranged] : arranged,
            rgb: chosen.rgb,
            directTotal: direct ? direct.total : null,
            lemonTotal: lemon ? lemon.total : null
        };
    }

    /**
     * 從 fromId 染到 toId 最少要幾顆（直接染與先餵檸檬再染較少的那個）。同色是 0，兩個做法都找不到是 null。
     * 和 plan().total 一樣，但不排分段，色板面板一次要算 85 格。
     * @param {object} data
     * @param {string} fromId
     * @param {string} toId
     * @returns {number | null}
     */
    function bestTotal(data, fromId, toId) {
        const from = colorOf(data, fromId);
        const to = colorOf(data, toId);
        if (from.id === to.id) return 0;
        const { direct, lemon } = routesOf(data, from, to);
        const totals = [direct, lemon].filter((route) => route !== null).map((route) => route.total);
        return totals.length > 0 ? Math.min(...totals) : null;
    }

    // ---------- 色板面板的分組 ----------

    /**
     * 85 個顏色分成 GROUP_KEYS 的 7 組（白・灰・黑、黃・橘、紅・粉、棕、紫、藍、綠），照顏色 id 的最後一段分；
     * 組內依亮度（0.2126R + 0.7152G + 0.0722B）由亮到暗，一樣亮就照資料的順序。
     * 最後一段不在上面那張表裡的顏色不會出現在任何一組（測試守住現在的 85 色一個都沒漏）。
     * @param {object} data
     * @returns {{key: string, ids: string[]}[]} 照 GROUP_KEYS 的順序
     */
    function colorGroups(data) {
        const members = new Map(GROUP_KEYS.map((key) => [key, []]));
        for (const color of data.colors) {
            const key = GROUP_OF_SUFFIX.get(color.id.slice(color.id.lastIndexOf('-') + 1));
            if (key) members.get(key).push(color);
        }
        const brightness = ({ rgb }) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        return GROUP_KEYS.map((key) => ({
            key,
            ids: members.get(key).sort((a, b) => brightness(b) - brightness(a)).map((color) => color.id)
        }));
    }

    return Object.freeze({ GROUP_KEYS, recipe, segments, plan, bestTotal, colorGroups });
})();

// Export for use in other modules
window.ChocoboColorSolver = ChocoboColorSolver;
