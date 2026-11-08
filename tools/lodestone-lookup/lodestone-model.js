/**
 * Lodestone 角色查詢的規則：不碰 DOM、不讀時鐘、不碰 localStorage。
 * 搜尋框的判斷、職業分組與滿級數、目前職業、名稱與成就顯示用哪個資料中心、Lodestone 的網址、
 * 「我的角色」與「最近查過」存的那一筆、官網原文換官方繁中、簡介有沒有填、名稱篩選、伺服器選單的字。
 *
 * 資料在 lodestone-data.js（LODESTONE_JOBS、LODESTONE_BASE_CLASSES、LODESTONE_TERMS），要比這支先載入。
 * 所有函式都不改傳進來的東西（傳深層凍結的資料也行），也不靠 this，所以頁面可以解構出來單獨呼叫。
 *
 * - parseInput()：搜尋框的字是角色頁網址、ID，還是名字
 * - jobGroups()、maxedCount()：Worker 的職業回答照官方分組列出來、滿級幾個
 * - activeJob()：角色頁的目前職業換成網站的名稱與圖示
 * - activeClassJobOf()、freeCompanyOf()：角色回應的目前職業、角色回應或搜尋結果的部隊（新舊 Worker 的回應都換成同一個樣子）
 * - dcOf()、defaultDataLang()、characterUrl()、officialSearchUrl()：名稱與成就顯示（English／日本語）與 Lodestone 的網址
 * - person()：角色回應 → 「我的角色」「最近查過」存的那一筆
 * - term()：部隊活動重點、招募對象、大國防聯軍、聲望、開始城市的原文 → 官方繁中
 * - isEmptyBio()、filterByName()、worldLabel()：簡介有沒有填、收藏的名稱篩選、伺服器選單的字
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 */
const LodestoneModel = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const JOBS = window.LODESTONE_JOBS;
    const BASE_CLASSES = window.LODESTONE_BASE_CLASSES;
    const TERMS = window.LODESTONE_TERMS;

    // 滿級只算 Lv100；等級上限不是 100 的限定職業（青魔法師、Beastmaster）不標
    const MAX_LEVEL = 100;
    // 網站預設的介面語言：職業名稱遇到不認得的語言時用它
    const DEFAULT_UI_LANG = 'zh';
    // 搜尋選單裡，資料中心的值帶這個前綴（官網 worldname 的寫法）
    const DC_PREFIX = '_dc_';
    // 簡介沒填時官網寫的字（英文版是 -，日文版是 未設定）；空白也算
    const EMPTY_BIOS = new Set(['', '-', '未設定']);
    // 看不見的零寬字元（從網頁或通訊軟體複製時可能夾帶）：零寬空格、零寬不連字、零寬連字、字詞連接符、BOM
    const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
    // 前後的空白與零寬字元（trim() 不認得零寬空格這幾個）
    const EDGES = /^[\s\u200B-\u200D\u2060\uFEFF]+|[\s\u200B-\u200D\u2060\uFEFF]+$/g;

    // 職業鍵 → 職業；分組照 LODESTONE_JOBS 裡第一次出現的順序
    const JOB_BY_KEY = new Map(JOBS.map((job) => [job.key, job]));
    const ROLES = [...new Set(JOBS.map((job) => job.role))];

    // 角色頁網址。Lodestone 的地區站（na、eu、fr、de、jp）的角色 ID 都一樣，所以不限哪一站；
    // ID 後面要接 / ? # 或結尾，不然（例如 12345678abc）不是角色頁網址
    const CHARACTER_PAGE = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)?finalfantasyxiv\.com\/lodestone\/character\/(\d+)(?=[/?#]|$)/i;

    // 表格用的名稱查詢不能直接 table[key]：key 是 constructor、__proto__ 這類名字時會拿到 Object.prototype 上的東西
    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const text = (value) => (typeof value === 'string' ? value : '');

    // ---------- 搜尋框 ----------

    /**
     * 搜尋框的字是什麼：Lodestone 角色頁的網址取出 ID；去掉空白後全是數字是 ID；其他是名字（只去掉前後的空白與零寬字元，
     * 撇號、連字號與中間的空白原樣留著，所以 Y'shtola Rhul 不會被當成別的東西）；空白是 empty。
     * 判斷是不是網址或 ID 之前先換成半形（NFKC：日文輸入法預設打出全形的 １２３４５６７８）、拿掉零寬字元；名字裡沒有數字，照原樣回傳。
     * @param {string} input
     * @returns {{kind: 'id', id: string} | {kind: 'name', name: string} | {kind: 'empty'}}
     */
    function parseInput(input) {
        const trimmed = String(input ?? '').replace(EDGES, '');
        if (trimmed === '') return { kind: 'empty' };
        const normalized = trimmed.normalize('NFKC').replace(ZERO_WIDTH, '');
        const page = CHARACTER_PAGE.exec(normalized);
        if (page) return { kind: 'id', id: page[1] };
        const digits = normalized.replace(/\s+/g, '');
        if (/^\d+$/.test(digits)) return { kind: 'id', id: digits };
        return { kind: 'name', name: trimmed };
    }

    // ---------- 職業 ----------

    // 等級：'100'、100 → 100；'-'（沒解鎖）、'0'、沒有、不是整數的字 → null
    function toLevel(value) {
        const digits = String(value ?? '').trim();
        if (!/^\d+$/.test(digits)) return null;
        const level = Number(digits);
        return level > 0 ? level : null;
    }

    // 職業的名稱，不認得的介面語言用網站預設的中文
    const nameOf = (job, uiLang) => (hasOwn(job.names, uiLang) ? job.names[uiLang] : job.names[DEFAULT_UI_LANG]);

    // Worker 的職業回答把職業分在 CombatJobs 的五組、CraftingJobs、GatheringJobs 裡。
    // 這裡只要「職業鍵 → 那一列」：網站的分組照 LODESTONE_JOBS 的 role，不照 Worker 放的組，也不管鍵在回答裡的順序
    function rowsByKey(classJobs) {
        const rows = new Map();
        // 整份回答（有 ClassJobs 那一層）也行
        const root = classJobs && classJobs.ClassJobs ? classJobs.ClassJobs : classJobs;
        if (!root || typeof root !== 'object') return rows;
        const collect = (group) => {
            if (!group || typeof group !== 'object') return;
            for (const [key, row] of Object.entries(group)) rows.set(key, row);
        };
        if (root.CombatJobs && typeof root.CombatJobs === 'object') Object.values(root.CombatJobs).forEach(collect);
        collect(root.CraftingJobs);
        collect(root.GatheringJobs);
        return rows;
    }

    /**
     * 職業分組：照 LODESTONE_JOBS 的官方順序分成七組（坦克、治療、近戰、遠程、魔法、生產、採集），每次都回新的物件。
     * 等級照 Worker 那一列的 Level：'-'（沒解鎖）、'0'、沒有這一列都是 null。還沒轉職的職業，官網那一列寫的是基本職業
     * （騎士那一列寫 Gladiator），等級照那一列算，名稱仍是職業的：基本職業就放在職業那一格。
     * max 是滿級：Lv100 而且不是限定職業（青魔法師、Beastmaster 的等級上限不是 100）。
     * @param {object | null} classJobs - Worker 職業回答的 ClassJobs（整份回答也行）；還沒有資料是 null
     * @param {'zh' | 'en' | 'ja'} uiLang - 職業名稱用的語言
     * @returns {{role: string, jobs: {key: string, name: string, icon: string | null, level: number | null, max: boolean}[]}[]}
     */
    function jobGroups(classJobs, uiLang) {
        const rows = rowsByKey(classJobs);
        return ROLES.map((role) => ({
            role,
            jobs: JOBS.filter((job) => job.role === role).map((job) => {
                const level = toLevel(rows.get(job.key)?.Level);
                return { key: job.key, name: nameOf(job, uiLang), icon: job.icon, level, max: level === MAX_LEVEL && !job.limited };
            })
        }));
    }

    /**
     * 職業分組裡滿級的職業有幾個。
     * @param {{jobs: {max: boolean}[]}[]} groups - jobGroups() 的結果
     * @returns {number}
     */
    function maxedCount(groups) {
        return groups.reduce((total, group) => total + group.jobs.filter((job) => job.max).length, 0);
    }

    /**
     * 角色頁的目前職業。Key 對到 LODESTONE_JOBS 就用網站的名稱與圖示，基本職業先換成它的職業；
     * 對不到（Key 是 null：Worker 認不出官網的圖示）時沒有名稱，圖示用官網的 Icon。
     * 職業的 icon 是 FFXIVJobIcons 底下的路徑（Beastmaster 沒有，是 null，頁面用文字圖示），官網的 Icon 是完整網址。
     * @param {{Key?: string | null, Level?: number | string, Icon?: string} | undefined} active - Worker 角色回應的 ActiveClassJob
     * @param {'zh' | 'en' | 'ja'} uiLang
     * @returns {{key: string | null, name: string | null, icon: string | null, level: number | null} | null} 沒有 ActiveClassJob（舊 Worker）是 null
     */
    function activeJob(active, uiLang) {
        if (!active || typeof active !== 'object') return null;
        const level = toLevel(active.Level);
        const jobKey = hasOwn(BASE_CLASSES, active.Key) ? BASE_CLASSES[active.Key] : active.Key;
        const job = JOB_BY_KEY.get(jobKey);
        if (job) return { key: job.key, name: nameOf(job, uiLang), icon: job.icon, level };
        return { key: null, name: null, icon: typeof active.Icon === 'string' ? active.Icon : null, level };
    }

    // ---------- 新舊 Worker 的目前職業與部隊 ----------

    /**
     * 角色回應的目前職業（交給 activeJob() 與 person()）。新 Worker 有 ActiveClassJob，原樣回傳；舊 Worker（現在正式站的）沒有，
     * 只有官網的圖示網址（ActiveClassjob）與等級（ActiveClassjobLevel），換成 Key 是 null 的 ActiveClassJob：
     * 標頭寫官網的圖示加等級，存下的我的角色也有同樣的等級。
     * @param {object} character - Worker 角色回應的 Character
     * @returns {{Key: string | null, Level?: number | string, Icon?: string | null} | undefined} 兩種都沒有是 undefined
     */
    function activeClassJobOf(character) {
        if (!character || typeof character !== 'object') return undefined;
        if (character.ActiveClassJob && typeof character.ActiveClassJob === 'object') return character.ActiveClassJob;
        const icon = typeof character.ActiveClassjob === 'string' && character.ActiveClassjob !== '' ? character.ActiveClassjob : null;
        const old = character.ActiveClassjobLevel;
        const level = old && typeof old === 'object' ? old.Level : undefined;
        if (icon === null && (level === undefined || level === null)) return undefined;
        return { Key: null, Level: level, Icon: icon };
    }

    /**
     * 角色回應或搜尋結果的一筆裡的部隊：有 ID 或名稱才算。舊 Worker 的部隊只有 { ID, Crest }，沒有名稱（name 是空字串）。
     * @param {object} item - Worker 角色回應的 Character，或搜尋結果的一筆
     * @returns {{id: string, name: string} | null} 沒有加入部隊是 null
     */
    function freeCompanyOf(item) {
        const fc = item && typeof item === 'object' ? item.FreeCompany : null;
        if (!fc || typeof fc !== 'object') return null;
        const name = typeof fc.Name === 'string' ? fc.Name.trim() : '';
        const id = typeof fc.ID === 'string' || typeof fc.ID === 'number' ? String(fc.ID) : '';
        return name !== '' || id !== '' ? { id, name } : null;
    }

    // ---------- 名稱與成就顯示、Lodestone 的網址 ----------

    /**
     * 名稱與成就顯示（English／日本語）對到 Worker 的 dc，也是 Lodestone 的網域：ja 是 jp，其他都是 na。
     * @param {'en' | 'ja'} dataLang
     * @returns {'na' | 'jp'}
     */
    function dcOf(dataLang) {
        return dataLang === 'ja' ? 'jp' : 'na';
    }

    /**
     * 名稱與成就顯示的預設：介面是日文就是日本語，其他是 English。
     * @param {'zh' | 'en' | 'ja'} uiLang
     * @returns {'en' | 'ja'}
     */
    function defaultDataLang(uiLang) {
        return uiLang === 'ja' ? 'ja' : 'en';
    }

    /**
     * Lodestone 角色頁的網址。
     * @param {string | number} id
     * @param {'en' | 'ja'} dataLang
     * @returns {string}
     */
    function characterUrl(id, dataLang) {
        return `https://${dcOf(dataLang)}.finalfantasyxiv.com/lodestone/character/${encodeURIComponent(String(id))}/`;
    }

    /**
     * Lodestone 官網的角色搜尋網址（網站自己的搜尋不能用時，給玩家去官網搜）。名字用 URLSearchParams 編碼，
     * 撇號、連字號與 & # ? 都原樣送到官網，不會弄壞參數。world 是搜尋選單的值（伺服器、_dc_ 資料中心或空字串）。
     * @param {string} name
     * @param {string} world
     * @param {'en' | 'ja'} dataLang
     * @returns {string}
     */
    function officialSearchUrl(name, world, dataLang) {
        const query = new URLSearchParams({ q: String(name ?? ''), worldname: String(world ?? '') });
        return `https://${dcOf(dataLang)}.finalfantasyxiv.com/lodestone/character/?${query}`;
    }

    // ---------- 人的摘要 ----------

    /**
     * 角色回應換成「我的角色」與「最近查過」存的那一筆。job 存 Worker 給的職業鍵（ActiveClassJob.Key，可能是基本職業，
     * 認不出時是 null），不存名稱：名稱在畫面上用目前的介面語言查（activeJob()），換語言後存著的卡片才不會是舊語言。
     * 缺的欄位是空字串（存進 localStorage 的內容不能少欄位）。目前職業照 activeClassJobOf()，和標頭寫的一樣：舊 Worker 沒有
     * ActiveClassJob 時 job 是 null（認不出職業）、level 照官網的等級；兩種都沒有時 job 與 level 是 null。
     * @param {object} character - Worker 角色回應的 Character
     * @returns {{id: string, name: string, world: string, dc: string, avatar: string, job: string | null, level: number | null}}
     */
    function person(character) {
        const server = character.Server ?? {};
        const active = activeClassJobOf(character) ?? {};
        return {
            id: String(character.ID ?? ''),
            name: text(character.Name),
            world: text(server.World),
            dc: text(server.DC),
            avatar: text(character.Avatar),
            job: typeof active.Key === 'string' && active.Key !== '' ? active.Key : null,
            level: toLevel(active.Level)
        };
    }

    // ---------- 原文換官方繁中 ----------

    /**
     * 官網的原文換成官方繁中。只有中文介面才換，英文與日文介面、認不得的原文、認不得的種類都照舊。
     * @param {'focus' | 'seeking' | 'grandCompany' | 'reputation' | 'town'} kind - 部隊活動重點、招募對象、大國防聯軍、聲望、開始城市
     * @param {string} original - 官網的原文（英文或日文）
     * @param {'zh' | 'en' | 'ja'} uiLang
     * @returns {string}
     */
    function term(kind, original, uiLang) {
        if (uiLang !== 'zh' || !hasOwn(TERMS, kind)) return original;
        const table = TERMS[kind];
        return hasOwn(table, original) ? table[original] : original;
    }

    // ---------- 簡介、名稱篩選、伺服器選單 ----------

    /**
     * 個人簡介有沒有填：沒有、空白、官網的 -（英文版）與 未設定（日文版）都算沒填。
     * @param {string | undefined} bio
     * @returns {boolean}
     */
    function isEmptyBio(bio) {
        return EMPTY_BIOS.has(String(bio ?? '').trim());
    }

    /**
     * 坐騎與寵物的名稱篩選：去掉前後空白、不分大小寫的子字串（不用正規表示式）；空的回全部。
     * 回傳新陣列，順序不變，元素是同一批物件。
     * @param {{Name: string}[]} items
     * @param {string} query
     * @returns {object[]}
     */
    function filterByName(items, query) {
        const needle = String(query ?? '').trim().toLowerCase();
        if (needle === '') return items.slice();
        return items.filter((item) => String(item?.Name ?? '').toLowerCase().includes(needle));
    }

    /**
     * 伺服器選單的字：資料中心的 _dc_ 去掉（_dc_Elemental → Elemental），其他照舊（空字串是全部伺服器，字由頁面寫）。
     * @param {string} value - 選單的值
     * @returns {string}
     */
    function worldLabel(value) {
        const label = String(value ?? '');
        return label.startsWith(DC_PREFIX) ? label.slice(DC_PREFIX.length) : label;
    }

    return Object.freeze({
        parseInput, jobGroups, maxedCount, activeJob, activeClassJobOf, freeCompanyOf, dcOf, defaultDataLang, characterUrl, officialSearchUrl,
        person, term, isEmptyBio, filterByName, worldLabel
    });
})();

// Export for use in other modules
window.LodestoneModel = LodestoneModel;
