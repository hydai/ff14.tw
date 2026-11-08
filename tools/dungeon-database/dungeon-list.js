/**
 * 副本資料庫的列表規則：不碰 DOM。取出顯示中的副本並排好順序、搜尋與篩選、搜尋字命中了哪些欄位、
 * 標示用的切段、獎勵文字。
 *
 * 副本（dungeon）是 data/dungeons.json 裡 dungeons 陣列的一筆：id、name、level、type、expansion、
 * description、mechanics、specialDrops、tombstoneReward、visible…。
 * 所有函式都不改傳進來的東西（傳凍結的資料也行），也不靠 this，所以頁面可以解構出來單獨呼叫。
 * query 一律是 normalizeQuery() 的結果（去掉前後空白、轉小寫），其他函式不再整理它。
 * 搜尋是子字串比對，不用正規表示式：( . * 這些字就是普通的字。
 *
 * - prepare()：取出顯示中的副本（visible 不是 false），版本由新到舊，同一個版本照資料原本的順序
 * - normalizeQuery()：整理搜尋字
 * - matches()、filter()：搜尋（名稱、簡介、機制、每一項掉落物）加上類型與版本篩選
 * - hits()：搜尋字在名稱以外命中了哪些欄位（列上要多寫哪幾行）
 * - segments()：一段文字依搜尋字切成「命中／沒命中」的片段（頁面把命中的包成 <mark>）
 * - reward()：獎勵的顯示文字
 *
 * 比對不分大小寫的做法是把被找的字轉小寫再找，segments() 用轉小寫後的字串找位置、從原字取片段，
 * 所以轉小寫不能改變字串的長度。資料裡沒有會改長度的字元（tests/dungeon-list.test.js 會把全部的字切一遍擋住）。
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 */
const DungeonList = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    // 一批列幾個，按「顯示更多」再加一批
    const BATCH = 30;
    // 版本由新到舊
    const VERSION_ORDER = Object.freeze(['7.x', '6.x', '5.x', '4.x', '3.x', '2.x']);
    // 沒有獎勵時 tombstoneReward 寫的字
    const NO_REWARD = '無';

    // ---------- 取出與排序 ----------

    // 版本的順位。不認得的版本（資料寫錯）排在最後：不會被吃掉，也不會跑到最前面
    function versionRank(dungeon) {
        const index = VERSION_ORDER.indexOf(dungeon.expansion);
        return index === -1 ? VERSION_ORDER.length : index;
    }

    /**
     * 顯示中的副本（visible 沒寫或不是 false），版本由新到舊，同一個版本照資料原本的順序。
     * filter() 先做出新陣列，sort() 排的是這個新陣列，不會動 data.dungeons；sort() 是穩定的（ES2019），
     * 同一個版本的先後就是資料原本的先後。元素是資料裡同一批物件，沒有複製。
     * @param {{dungeons: object[]}} data - data/dungeons.json 解析後的物件
     * @returns {object[]}
     */
    function prepare(data) {
        return data.dungeons
            .filter((dungeon) => dungeon.visible !== false)
            .sort((a, b) => versionRank(a) - versionRank(b));
    }

    // ---------- 搜尋與篩選 ----------

    /**
     * 搜尋框的字整理成 query：去掉前後空白（含全形空白）、轉小寫；中間的空白不動。沒有值當作空字串。
     * @param {string} text
     * @returns {string}
     */
    function normalizeQuery(text) {
        return String(text ?? '').trim().toLowerCase();
    }

    // query 已經是小寫，所以只要把被找的那段轉小寫
    const contains = (text, query) => text.toLowerCase().includes(query);

    /**
     * 名稱、簡介、機制、任何一項掉落物含有 query 就算符合；類型、版本、獎勵不搜。每個欄位各自比對，不會把相鄰欄位接起來找。
     * @param {object} dungeon
     * @param {string} query - normalizeQuery() 的結果；空字串是沒有搜尋，一律符合
     * @returns {boolean}
     */
    function matches(dungeon, query) {
        if (query === '') return true;
        return contains(dungeon.name, query) ||
            contains(dungeon.description, query) ||
            contains(dungeon.mechanics, query) ||
            dungeon.specialDrops.some((drop) => contains(drop, query));
    }

    /**
     * 搜尋與篩選。同一組（類型或版本）裡是「或」，兩組之間、與搜尋之間是「且」，空的代表全部。
     * 結果的順序和 dungeons 一樣，元素是同一批物件。
     * @param {object[]} dungeons - prepare() 的結果
     * @param {{query?: string, types?: string[] | Set<string>, versions?: string[] | Set<string>}} [conditions]
     * @returns {object[]}
     */
    function filter(dungeons, { query = '', types = [], versions = [] } = {}) {
        const typeSet = new Set(types);
        const versionSet = new Set(versions);
        return dungeons.filter((dungeon) =>
            (typeSet.size === 0 || typeSet.has(dungeon.type)) &&
            (versionSet.size === 0 || versionSet.has(dungeon.expansion)) &&
            matches(dungeon, query));
    }

    // ---------- 標示 ----------

    /**
     * 搜尋字在名稱以外命中了哪些欄位，列上就多寫哪幾行（名稱本身命中時直接標在名稱上，不在這裡）。
     * drop.text 是第一個含 query 的掉落物（資料原本的寫法），more 是其他也含的項數。沒有搜尋字時什麼都沒命中。
     * @param {object} dungeon
     * @param {string} query - normalizeQuery() 的結果
     * @returns {{drop: {text: string, more: number} | null, mechanics: boolean, description: boolean}}
     */
    function hits(dungeon, query) {
        if (query === '') return { drop: null, mechanics: false, description: false };
        const matched = dungeon.specialDrops.filter((drop) => contains(drop, query));
        return {
            drop: matched.length > 0 ? { text: matched[0], more: matched.length - 1 } : null,
            mechanics: contains(dungeon.mechanics, query),
            description: contains(dungeon.description, query)
        };
    }

    /**
     * 一段文字依 query 切成片段：query 每一次出現（不分大小寫）各是一段 hit: true，其餘是 hit: false，
     * 片段的字取自原字，所以接起來等於原字。從左邊數起、不重疊地找（aaa 裡找 aa 只有最左邊那一個）。
     * 沒有任何出現（包括 query 是空字串，或 text 本身是空字串）時是整段一個 hit: false；其他情況不會有空的片段。
     * @param {string} text
     * @param {string} query - normalizeQuery() 的結果
     * @returns {{text: string, hit: boolean}[]}
     */
    function segments(text, query) {
        const parts = [];
        if (query !== '') {
            const lowered = text.toLowerCase();
            let from = 0;
            let at = lowered.indexOf(query);
            while (at !== -1) {
                if (at > from) parts.push({ text: text.slice(from, at), hit: false });
                from = at + query.length;
                parts.push({ text: text.slice(at, from), hit: true });
                at = lowered.indexOf(query, from);
            }
            if (parts.length > 0 && from < text.length) parts.push({ text: text.slice(from), hit: false });
        }
        return parts.length > 0 ? parts : [{ text, hit: false }];
    }

    // ---------- 獎勵 ----------

    /**
     * 獎勵的顯示文字：把第一個「: 」換成一個空白（「黃金古典神典石: 130」→「黃金古典神典石 130」，
     * 兩個數字的照原樣）；沒有獎勵（資料寫「無」）是 null，畫面要寫什麼由頁面決定。
     * @param {string} tombstoneReward
     * @returns {string | null}
     */
    function reward(tombstoneReward) {
        return tombstoneReward === NO_REWARD ? null : tombstoneReward.replace(': ', ' ');
    }

    return Object.freeze({ BATCH, VERSION_ORDER, prepare, normalizeQuery, matches, filter, hits, segments, reward });
})();

// Export for use in other modules
window.DungeonList = DungeonList;
