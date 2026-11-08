/**
 * Lodestone 角色查詢的瀏覽器記憶：「我的角色」（一個）、「最近查過」（最多 5 個）、名稱與成就顯示的語言（English／日本語）。
 * 只存在玩家自己的瀏覽器裡，不碰 DOM。
 *
 * 每個函式的第一個參數是 storage（頁面傳 window.localStorage，測試傳替身），store 不自己去拿 localStorage；
 * 頁面拿不到的時候（Chrome 封鎖網站資料時，光是讀 window.localStorage 就丟例外）傳 null，等於沒有儲存空間。
 * 函式都不靠 this，所以頁面可以解構出來單獨呼叫；也不改傳進來的東西（傳深層凍結的資料也行）。
 *
 * 存的位置（KEYS）：
 * - mine：一個 Person（JSON 物件），id、name、world、dc、avatar、job、level 七個欄位
 * - recent：陣列（JSON），新的在前、同一個 id 只有一個、不含我的角色、最多 MAX_RECENT 個；
 *   每一個只有 id、name、world、dc、avatar 五個欄位，job 與 level 只有我的角色才存
 * - lang：'en' 或 'ja'（純字串，不是 JSON，和網站介面語言的存法一樣）
 *
 * Person 就是 LodestoneModel.person() 做出來的那一筆：id（字串）與 name 一定有；world、dc、avatar 缺的是空字串；
 * job 是 Worker 給的職業鍵（可能是基本職業，原樣存，這裡不解讀），level 是等級，缺的都是 null。
 * 記下來與讀出來的時候都整理成這個樣子，多的欄位拿掉；最近查過的那一筆再去掉 job 與 level
 * （存著的舊項目帶著這兩個欄位時，讀出來也去掉）。
 *
 * 每一次讀寫都包 try/catch：讀不到（封鎖網站資料）或內容壞掉時回傳預設值（null、[]），壞掉的內容丟掉壞的那一部分
 * （不是 JSON、不是物件或陣列、少了 id 或 name 的項目）；寫不進去（封鎖網站資料、容量已滿）時回傳 false，
 * 這次打開期間的清單照樣算出來。永遠不丟例外，只是不記住。
 *
 * - readMine()、writeMine()：我的角色（設成我的角色時同時從最近查過拿掉）
 * - readRecent()、remember()：最近查過
 * - readLang()、writeLang()：名稱與成就顯示的語言
 */
const LodestoneStore = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const KEYS = Object.freeze({
        mine: 'ff14tw_lodestone_mine',
        recent: 'ff14tw_lodestone_recent',
        lang: 'ff14tw_lodestone_lang'
    });
    // 最近查過最多幾個
    const MAX_RECENT = 5;
    // 名稱與成就顯示的語言：English、日本語
    const LANGS = new Set(['en', 'ja']);

    const text = (value) => (typeof value === 'string' ? value : '');

    // ---------- 讀寫 storage（所有碰到 storage 的地方都在這一段，一律包 try/catch）----------

    // 讀一個字串；沒存過、讀不到（封鎖網站資料）、沒有儲存空間都是 null
    function getText(storage, key) {
        try {
            const value = storage.getItem(key);
            return typeof value === 'string' ? value : null;
        } catch (error) {
            return null;
        }
    }

    // 讀一個 JSON；沒存過、讀不到、不是 JSON 都是 null
    function getJson(storage, key) {
        const raw = getText(storage, key);
        if (raw === null) return null;
        try {
            return JSON.parse(raw);
        } catch (error) {
            return null;
        }
    }

    // 寫一個字串；寫不進去（封鎖網站資料、容量已滿）或沒有儲存空間回傳 false
    function setText(storage, key, value) {
        try {
            storage.setItem(key, value);
            return true;
        } catch (error) {
            return false;
        }
    }

    function setJson(storage, key, value) {
        return setText(storage, key, JSON.stringify(value));
    }

    // 拿掉一個鍵；做不到回傳 false
    function removeKey(storage, key) {
        try {
            storage.removeItem(key);
            return true;
        } catch (error) {
            return false;
        }
    }

    // ---------- 整理 ----------

    // 傳進來或存著的一筆 → Person；不是物件、id 或 name 不是非空字串就是 null。
    // Lodestone 的 ID 是數字：id 傳整數進來時轉成字串，才和存著的字串 id 是同一個人
    function cleanPerson(value) {
        if (!value || typeof value !== 'object') return null;
        const id = Number.isSafeInteger(value.id) ? String(value.id) : value.id;
        if (typeof id !== 'string' || id === '' || typeof value.name !== 'string' || value.name === '') return null;
        return {
            id,
            name: value.name,
            world: text(value.world),
            dc: text(value.dc),
            avatar: text(value.avatar),
            job: text(value.job) || null,
            level: Number.isInteger(value.level) && value.level > 0 ? value.level : null
        };
    }

    // 最近查過的那一筆：Person 去掉 job 與 level，只剩 id、name、world、dc、avatar 五個欄位（job 與 level 只有我的角色才存）
    function toEntry(who) {
        return { id: who.id, name: who.name, world: who.world, dc: who.dc, avatar: who.avatar };
    }

    // 存著的最近查過 → 乾淨的清單：只留合格的人（五個欄位），同一個 id 只留第一個（最新的），不含 mineId（我的角色），
    // 最多 MAX_RECENT 個。不是陣列是 []
    function cleanRecent(list, mineId) {
        if (!Array.isArray(list)) return [];
        const seen = new Set(mineId === null ? [] : [mineId]);
        const people = [];
        for (const item of list) {
            const who = cleanPerson(item);
            if (who === null || seen.has(who.id)) continue;
            seen.add(who.id);
            people.push(toEntry(who));
            if (people.length === MAX_RECENT) break;
        }
        return people;
    }

    // ---------- 我的角色 ----------

    /**
     * 讀出「我的角色」。
     * @param {Storage | null} storage
     * @returns {{id: string, name: string, world: string, dc: string, avatar: string, job: string | null, level: number | null} | null}
     *   沒設過、讀不到、內容壞掉（不是 JSON、不是物件、少了 id 或 name）都是 null
     */
    function readMine(storage) {
        return cleanPerson(getJson(storage, KEYS.mine));
    }

    /**
     * 設定或取消「我的角色」。設成某個人時，同時從最近查過拿掉他（沒有這個人就不寫最近查過）。
     * @param {Storage | null} storage
     * @param {object | null} person - LodestoneModel.person() 的結果；null 是取消。
     *   其他不合格的東西（undefined、少了 id 或 name）不寫，也不會蓋掉存著的
     * @returns {boolean} 存好（或拿掉）了是 true；不合格、寫不進去、沒有儲存空間是 false
     */
    function writeMine(storage, person) {
        if (person === null) return removeKey(storage, KEYS.mine);
        const mine = cleanPerson(person);
        if (mine === null || !setJson(storage, KEYS.mine, mine)) return false;

        // 最近查過寫不進去也沒關係：readRecent() 讀出來本來就不含我的角色
        const saved = getJson(storage, KEYS.recent);
        if (Array.isArray(saved) && saved.some((item) => cleanPerson(item)?.id === mine.id)) {
            setJson(storage, KEYS.recent, cleanRecent(saved, mine.id));
        }
        return true;
    }

    // ---------- 最近查過 ----------

    /**
     * 讀出「最近查過」：新的在前、同一個 id 只有一個、不含我的角色、最多 MAX_RECENT 個，每一個只有 id、name、world、dc、avatar。
     * 存著的清單不合規格（重複、太長、含我的角色、有壞的項目、項目帶著 job 與 level）時，讀出來也整理好。
     * @param {Storage | null} storage
     * @returns {{id: string, name: string, world: string, dc: string, avatar: string}[]}
     *   沒存過、讀不到、內容壞掉（不是 JSON、不是陣列）是 []
     */
    function readRecent(storage) {
        return cleanRecent(getJson(storage, KEYS.recent), readMine(storage)?.id ?? null);
    }

    /**
     * 記下剛查過的人：放到最前面，同一個 id 的舊資料換成這一筆，只留最新的 MAX_RECENT 個。
     * 只記 id、name、world、dc、avatar 五個欄位（person 帶著 job 與 level 也不存）。
     * 我的角色與不合格的 person 不記（回傳目前的清單，什麼都不寫）。寫不進去時清單照樣算出來，只是記不住。
     * @param {Storage | null} storage
     * @param {object} person - LodestoneModel.person() 的結果
     * @returns {{id: string, name: string, world: string, dc: string, avatar: string}[]} 記下之後的清單（和 readRecent() 讀出來的一樣）
     */
    function remember(storage, person) {
        const mineId = readMine(storage)?.id ?? null;
        const recent = cleanRecent(getJson(storage, KEYS.recent), mineId);
        const who = cleanPerson(person);
        if (who === null || who.id === mineId) return recent;

        const next = cleanRecent([who, ...recent], null);
        setJson(storage, KEYS.recent, next);
        return next;
    }

    // ---------- 名稱與成就顯示的語言 ----------

    /**
     * 讀出上次選的名稱與成就顯示。
     * @param {Storage | null} storage
     * @returns {'en' | 'ja' | null} 沒選過、讀不到、存著的不是 en 或 ja 都是 null
     */
    function readLang(storage) {
        const lang = getText(storage, KEYS.lang);
        return LANGS.has(lang) ? lang : null;
    }

    /**
     * 記住名稱與成就顯示。
     * @param {Storage | null} storage
     * @param {'en' | 'ja'} lang - 其他的值不寫，存著的不動
     * @returns {boolean} 存好了是 true；不認得的語言、寫不進去、沒有儲存空間是 false
     */
    function writeLang(storage, lang) {
        return LANGS.has(lang) && setText(storage, KEYS.lang, lang);
    }

    return Object.freeze({ KEYS, MAX_RECENT, readMine, writeMine, readRecent, remember, readLang, writeLang });
})();

// Export for use in other modules
window.LodestoneStore = LodestoneStore;
