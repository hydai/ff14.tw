/**
 * 角色卡產生器的狀態：欄位與它們的上限、預設值、整理與驗證、重點色、圖片位置，以及存取瀏覽器的記憶
 * （localStorage）。不碰 DOM、不讀時鐘、不自己去拿 localStorage（storage 由呼叫端傳進來，傳 null 等於沒有儲存空間）。
 *
 * 狀態（State）是一個普通物件，形狀就是 defaults() 的樣子：
 * - v：版本，目前是 1
 * - name、world：角色名稱與伺服器（必填）；mainJob：主職的職業鍵（必填），level：等級 1～100
 * - subJobs：其他職業的職業鍵，最多 LIMITS.subJobs 個，不含主職
 * - title、fcName、fcTag：稱號、部隊名稱、部隊簡稱；gc：大國防聯軍，'' 是不填
 * - hours：遊玩時段，`${DAYS 的一個}-${SLOTS 的一個}`，例如 'weekday-evening'
 * - likes、looking：喜歡的內容（最多 LIMITS.likes 個）、在找什麼；intro、contact：自我介紹與聯絡方式
 * - accent：重點色，'#rrggbb' 或 'auto'（照主職的職能）
 * - style、format：卡片的風格（'a' 名片、'b' 海報、'c' 資訊卡，預設海報）與橫直版
 * - crops：圖片的位置與縮放，每一種「風格 × 橫直版」各一份（六份），鍵是 `${style}-${format}`，值是 { x, y, zoom }
 *   （x、y 是 -1～1：-1 靠左／上、0 置中、1 靠右／下；zoom 是 1～3）
 *
 * 職業清單（jobs）是共用的 assets/js/ff14-game-data.js 裡的那份職業陣列（每一個有 key 與 role），由呼叫端當參數傳進來，
 * 這支不去讀那個全域。所有函式都不改傳進來的東西（傳深層凍結的資料也行），也不靠 this，所以頁面可以解構出來單獨呼叫；
 * 回傳的狀態、陣列與位置每次都是新的物件，不凍結，也不和傳進來的東西共用。
 *
 * - defaults()：一個欄位都沒填的狀態
 * - normalize()：任何東西（存著的內容、傳進來的物件）→ 合格的狀態，壞的部分丟掉。不 trim、不收空白：頁面是邊打邊整理，
 *   trim 會吃掉打到一半的空白；只切長度：上限以 Unicode 字元計（一面國旗算 2 個），不會把代理對切成兩半；上限剛好落在一個字素
 *   （看起來是一個字：國旗、家庭 emoji、e 加重音符號）中間時，退到前一個完整的字素，不會留下半面國旗（所以結果可能比上限少，
 *   最多少「那個字素的字元數減一」個：一個家庭 emoji 有 5 個字元，最多少 4 個；第一個字素就比上限長時，結果是空字串；
 *   沒有 Intl.Segmenter 的舊瀏覽器沒辦法分辨，照切在上限的字元上）。不是字串的欄位是 ''
 * - validate()：必填的有沒有填（只有空白算沒填）
 * - roleOf()、accentOf()：主職的職能與卡片的重點色
 * - cropKey()、cropOf()：目前的風格與橫直版對到的那一份圖片位置
 * - load()、save()、saveImage()、clear()：記住與還原
 *
 * 記憶存在兩個鍵：STORAGE_KEY 是欄位（一個 JSON），IMAGE_KEY 是縮過的圖片（一個 data:image/ 開頭的字串），分開存是因為圖片大，
 * 存不進去（容量已滿）時欄位照樣記得住。每一次讀寫都包 try/catch：讀不到（封鎖網站資料）或內容壞掉時照常打開（預設值，
 * 壞掉的內容丟掉壞的部分）；寫不進去回傳 false，這次打開期間照常運作，只是不記住。永遠不丟例外。
 * 目前只有版本 1，所以讀的時候不看 v、存的時候一律寫 1；以後改了形狀，再依 v 轉換。
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 */
const CardState = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const STORAGE_KEY = 'ff14tw_character_card';
    const IMAGE_KEY = 'ff14tw_character_card_image';
    const VERSION = 1;

    // 字數與個數的上限（字串以 Unicode 字元計）。level 是範圍
    const LIMITS = Object.freeze({
        name: 21,
        world: 20,
        title: 30,
        fcName: 20,
        fcTag: 5,
        intro: 60,
        contact: 40,
        likes: 6,
        subJobs: 3,
        levelMin: 1,
        levelMax: 100
    });

    // 選項（值就是狀態裡存的字串；顯示的字由頁面照介面語言決定）
    const LIKES = Object.freeze([
        'msq', 'leveling', 'trials', 'savage', 'ultimate', 'alliance', 'pvp', 'crafting',
        'gathering', 'treasure', 'deepDungeon', 'housing', 'glamour', 'photo', 'roleplay', 'fishing'
    ]);
    const LOOKING = Object.freeze(['static', 'fc', 'friends']);
    const DAYS = Object.freeze(['weekday', 'weekend']);
    const SLOTS = Object.freeze(['morning', 'afternoon', 'evening', 'lateNight']);
    const GCS = Object.freeze(['maelstrom', 'twinAdder', 'immortalFlames']);
    const FORMATS = Object.freeze(['landscape', 'portrait']);
    // 風格：a 名片、b 海報、c 資訊卡。第一次上線只有 b（存著的資料都是 b），之後加的 a、c 不需要轉換存著的內容
    const STYLES = Object.freeze(['a', 'b', 'c']);

    // 重點色：照主職的職能。畫在卡片上的成品，不跟著網站的深淺色
    const ROLE_COLORS = Object.freeze({
        tank: '#4f74d6',
        healer: '#3f9e5c',
        dps: '#d4574e',
        crafting: '#8a63d2',
        gathering: '#c99a2e'
    });

    // 職業清單裡的 role（官方的分組）→ 重點色的職能：近戰、遠程、法系的顏色都一樣，所以都是 dps
    const ROLE_GROUPS = Object.freeze({
        tank: 'tank',
        healer: 'healer',
        melee: 'dps',
        ranged: 'dps',
        magic: 'dps',
        crafting: 'crafting',
        gathering: 'gathering'
    });
    // 沒有主職（或不認得）時，重點色用這個職能
    const FALLBACK_ROLE = 'dps';

    const DEFAULT_STYLE = 'b';
    const DEFAULT_FORMAT = 'landscape';
    const DEFAULT_LEVEL = 100;
    // 必填的欄位，沒填時照這個順序列出
    const REQUIRED = Object.freeze(['name', 'world', 'mainJob']);

    // 合格的時段與圖片位置的鍵：每一個都是「目前有的」選項湊出來的
    const HOURS = new Set(DAYS.flatMap((day) => SLOTS.map((slot) => `${day}-${slot}`)));
    const CROP_KEYS = Object.freeze(STYLES.flatMap((style) => FORMATS.map((format) => `${style}-${format}`)));
    // 圖片位置的範圍：x、y 是 -1～1，zoom 是 1～3
    const OFFSET_MAX = 1;
    const ZOOM_MIN = 1;
    const ZOOM_MAX = 3;
    // 重點色：#rrggbb，大小寫都行
    const HEX_COLOR = /^#[0-9a-f]{6}$/i;
    // 數字的字串：十進位，可以有正負號、小數點與 e 的次方（<input type="number"> 的值就是這種寫法）。
    // 不直接用 Number() 判斷：它把 ''、'   ' 當成 0，把 '0x50' 當成 80
    const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
    // 圖片只收這個開頭的字串（縮圖時 canvas 轉出來的 dataURL）
    const IMAGE_PREFIX = 'data:image/';

    // 切字素（看起來是一個字）用的 Intl.Segmenter，載入時建一次；沒有它的舊瀏覽器（Firefox 125 以前）是 null：cleanText() 照 Unicode 字元切。
    // card-layout.js 的 graphemes() 是同一個做法，但這支比它先載入、也單獨測試，不去讀 CardLayout，所以自己建一個
    const SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;

    // 表格用的名稱查詢不能直接 table[key]：key 是 constructor、__proto__ 這類名字時會拿到 Object.prototype 上的東西
    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
    const isImageDataUrl = (value) => typeof value === 'string' && value.startsWith(IMAGE_PREFIX);

    // ---------- 預設 ----------

    /**
     * 一個欄位都沒填的狀態。每次都是新的物件。
     * @returns {object}
     */
    function defaults() {
        return {
            v: VERSION,
            name: '',
            world: '',
            mainJob: '',
            level: DEFAULT_LEVEL,
            subJobs: [],
            title: '',
            fcName: '',
            fcTag: '',
            gc: '',
            hours: [],
            likes: [],
            looking: [],
            intro: '',
            contact: '',
            accent: 'auto',
            style: DEFAULT_STYLE,
            format: DEFAULT_FORMAT,
            crops: {}
        };
    }

    // ---------- 整理 ----------

    // 字串欄位：不是字串是 ''；超過上限就切掉後面的字。上限以 Unicode 字元計（Array.from 一個字元一項），不會把代理對
    // （emoji、罕用字）切成兩半；上限剛好落在一個字素（國旗、家庭 emoji、e 加重音符號）中間時，退到前一個完整的字素。
    // 不 trim：頁面邊打邊整理，trim 會吃掉打到一半的空白
    function cleanText(value, limit) {
        if (typeof value !== 'string') return '';
        // UTF-16 的單位數不超過上限，字元數一定也不超過，不用拆開來數
        if (value.length <= limit) return value;
        const chars = Array.from(value);
        if (chars.length <= limit) return value;
        // 沒有 Intl.Segmenter：切在上限的字元上
        if (SEGMENTER === null) return chars.slice(0, limit).join('');
        // 一個字素一個字素往下加（字素的大小也以 Unicode 字元計），加到下一個會超過上限為止。上限不是落在字素中間時，
        // 結果和切在上限的字元上一樣；落在中間時，那個字素整個不要（一個字素就比上限長，連第一個都放不下，結果是空字串）
        let kept = '';
        let count = 0;
        for (const { segment } of SEGMENTER.segment(value)) {
            const size = Array.from(segment).length;
            if (count + size > limit) break;
            kept += segment;
            count += size;
        }
        return kept;
    }

    // 等級：有限的數字，或數字的字串（<input type="number"> 的值是字串，前後的空白不管），四捨五入、夾在 levelMin～levelMax；
    // 其他（空字串、只有空白、'x'、'80級'、NaN、Infinity、布林、陣列…）是預設
    function cleanLevel(value) {
        let number = NaN;
        if (typeof value === 'number') number = value;
        else if (typeof value === 'string' && DECIMAL.test(value.trim())) number = Number(value);
        if (!Number.isFinite(number)) return DEFAULT_LEVEL;
        return clamp(Math.round(number), LIMITS.levelMin, LIMITS.levelMax);
    }

    // 清單欄位：只留字串、isAllowed 說可以的項目，去重，最多 max 個，順序照傳進來的（先到的先留）；不是陣列是 []。
    // 不合格與重複的不佔名額
    function cleanList(value, isAllowed, max = Infinity) {
        const list = [];
        if (!Array.isArray(value)) return list;
        for (const item of value) {
            if (typeof item !== 'string' || !isAllowed(item) || list.includes(item)) continue;
            list.push(item);
            if (list.length >= max) break;
        }
        return list;
    }

    // 重點色：#rrggbb（大小寫都行）轉小寫；其他是 'auto'
    function cleanAccent(value) {
        return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : 'auto';
    }

    // 一份圖片位置：x、y、zoom 都要是有限的數字，不然是 null（整筆丟掉）；範圍外的夾進去。回傳新的物件，只有這三個欄位
    function cleanCrop(value) {
        if (!isObject(value)) return null;
        const { x, y, zoom } = value;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return null;
        return { x: clamp(x, -OFFSET_MAX, OFFSET_MAX), y: clamp(y, -OFFSET_MAX, OFFSET_MAX), zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX) };
    }

    // 所有圖片位置：只看合格的鍵，壞的那一份丟掉，不連累別份；不是物件是 {}
    function cleanCrops(value) {
        const crops = {};
        if (!isObject(value)) return crops;
        for (const key of CROP_KEYS) {
            if (!hasOwn(value, key)) continue;
            const crop = cleanCrop(value[key]);
            if (crop !== null) crops[key] = crop;
        }
        return crops;
    }

    // 職業清單 → 職業鍵的集合；沒有清單（不是陣列）時是空的：認不得任何職業
    function jobKeysOf(jobs) {
        const keys = new Set();
        if (Array.isArray(jobs)) {
            for (const job of jobs) {
                if (isObject(job) && typeof job.key === 'string') keys.add(job.key);
            }
        }
        return keys;
    }

    /**
     * 把任何東西整理成合格的狀態：不是物件（null、字串、陣列…）就是預設，是物件就一個欄位一個欄位整理，
     * 壞的部分丟掉（變回預設值）、好的照用，多出來的欄位拿掉，v 一律是 1。
     * - 字串：超過上限切掉（不 trim），不是字串是 ''
     * - level：有限的數字或數字的字串，四捨五入、夾在 1～100，其他是 100
     * - mainJob：要在 jobs 裡（鍵完全一樣），不然是 ''；subJobs：只留 jobs 裡有的、去重、拿掉主職、最多 3 個
     * - likes、looking、hours：只留認得的、去重（likes 最多 6 個）；gc、style、format：不合格是預設
     * - accent：只收 #rrggbb（轉小寫），其他是 'auto'
     * - crops：只留合格的鍵，x、y 夾在 -1～1、zoom 夾在 1～3，不是有限數字的整筆丟掉
     * @param {*} raw - 存著的內容或頁面的狀態
     * @param {{key: string}[]} [jobs] - 職業清單；沒傳時認不得任何職業
     * @returns {object} 新的狀態
     */
    function normalize(raw, jobs) {
        const base = defaults();
        if (!isObject(raw)) return base;

        const jobKeys = jobKeysOf(jobs);
        const mainJob = typeof raw.mainJob === 'string' && jobKeys.has(raw.mainJob) ? raw.mainJob : base.mainJob;
        return {
            v: base.v,
            name: cleanText(raw.name, LIMITS.name),
            world: cleanText(raw.world, LIMITS.world),
            mainJob,
            level: cleanLevel(raw.level),
            subJobs: cleanList(raw.subJobs, (key) => jobKeys.has(key) && key !== mainJob, LIMITS.subJobs),
            title: cleanText(raw.title, LIMITS.title),
            fcName: cleanText(raw.fcName, LIMITS.fcName),
            fcTag: cleanText(raw.fcTag, LIMITS.fcTag),
            gc: GCS.includes(raw.gc) ? raw.gc : base.gc,
            hours: cleanList(raw.hours, (key) => HOURS.has(key)),
            likes: cleanList(raw.likes, (key) => LIKES.includes(key), LIMITS.likes),
            looking: cleanList(raw.looking, (key) => LOOKING.includes(key)),
            intro: cleanText(raw.intro, LIMITS.intro),
            contact: cleanText(raw.contact, LIMITS.contact),
            accent: cleanAccent(raw.accent),
            style: STYLES.includes(raw.style) ? raw.style : base.style,
            format: FORMATS.includes(raw.format) ? raw.format : base.format,
            crops: cleanCrops(raw.crops)
        };
    }

    // ---------- 驗證 ----------

    // 有字：是字串，而且不只有空白（trim() 也會去掉全形空白與不換行空白）
    const isFilled = (value) => typeof value === 'string' && value.trim() !== '';

    /**
     * 必填的欄位（名字、伺服器、主職）有沒有填。只有空白也算沒填；有字就算填了，前後的空白不管。
     * 這裡不檢查主職在不在職業清單裡（那是 normalize() 的事）。
     * @param {object} state
     * @returns {{ok: boolean, missing: ('name' | 'world' | 'mainJob')[]}} missing 依名字、伺服器、主職的順序，每次都是新的陣列
     */
    function validate(state) {
        const source = isObject(state) ? state : {};
        const missing = REQUIRED.filter((field) => !isFilled(source[field]));
        return { ok: missing.length === 0, missing };
    }

    // ---------- 職能與重點色 ----------

    /**
     * 職業的職能：tank、healer、dps（近戰、遠程、法系）、crafting、gathering。
     * @param {string} jobKey
     * @param {{key: string, role: string}[]} jobs - 職業清單
     * @returns {'tank' | 'healer' | 'dps' | 'crafting' | 'gathering' | null} 不認得的職業鍵（或沒有清單、職能不認得）是 null
     */
    function roleOf(jobKey, jobs) {
        if (typeof jobKey !== 'string' || !Array.isArray(jobs)) return null;
        const job = jobs.find((item) => isObject(item) && item.key === jobKey);
        return job !== undefined && hasOwn(ROLE_GROUPS, job.role) ? ROLE_GROUPS[job.role] : null;
    }

    /**
     * 卡片的重點色：自訂的顏色優先；'auto'（或不合格的）照主職的職能；沒選主職（或不認得）用 dps 的顏色。
     * @param {{accent?: string, mainJob?: string}} state
     * @param {{key: string, role: string}[]} jobs - 職業清單
     * @returns {string} '#rrggbb'（小寫）
     */
    function accentOf(state, jobs) {
        const accent = cleanAccent(state?.accent);
        if (accent !== 'auto') return accent;
        return ROLE_COLORS[roleOf(state?.mainJob, jobs) ?? FALLBACK_ROLE];
    }

    // ---------- 圖片位置 ----------

    /**
     * 目前的風格與橫直版對到的那一份圖片位置的鍵，例如 'b-landscape'。style 或 format 不合格時當成預設的那個
     * （state 是整理過的就不會發生）。
     * @param {{style?: string, format?: string}} state
     * @returns {string}
     */
    function cropKey(state) {
        const style = STYLES.includes(state?.style) ? state.style : DEFAULT_STYLE;
        const format = FORMATS.includes(state?.format) ? state.format : DEFAULT_FORMAT;
        return `${style}-${format}`;
    }

    /**
     * 目前的風格與橫直版的圖片位置。沒記過（或那一份壞掉）是 { x: 0, y: 0, zoom: 1 }：填滿、置中。
     * 回傳新的物件，改它不會動到狀態。
     * @param {{crops?: object, style?: string, format?: string}} state
     * @returns {{x: number, y: number, zoom: number}}
     */
    function cropOf(state) {
        const crops = state?.crops;
        const key = cropKey(state);
        const crop = isObject(crops) && hasOwn(crops, key) ? cleanCrop(crops[key]) : null;
        return crop ?? { x: 0, y: 0, zoom: 1 };
    }

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

    // 寫一個字串；寫不進去（封鎖網站資料、容量已滿）或沒有儲存空間回傳 false
    function setText(storage, key, value) {
        try {
            storage.setItem(key, value);
            return true;
        } catch (error) {
            return false;
        }
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

    // ---------- 記住與還原 ----------

    /**
     * 讀出記住的欄位與圖片。欄位交給 normalize() 整理（壞掉的內容丟掉壞的部分），圖片只收 data:image/ 開頭的字串。
     * 兩個鍵各讀各的：一個壞了不影響另一個。只讀不寫：壞掉的內容要等下一次 save() 才會被換掉。
     * @param {Storage | null} storage - 沒有儲存空間傳 null（等於讀不到）
     * @param {{key: string}[]} [jobs] - 職業清單，給 normalize() 認主職與其他職業
     * @returns {{state: object, image: string | null}}
     *   沒存過、讀不到、不是 JSON 時 state 是預設，image 是 null
     */
    function load(storage, jobs) {
        let parsed = null;
        const text = getText(storage, STORAGE_KEY);
        if (text !== null) {
            try {
                parsed = JSON.parse(text);
            } catch (error) {
                parsed = null;
            }
        }
        const image = getText(storage, IMAGE_KEY);
        return { state: normalize(parsed, jobs), image: isImageDataUrl(image) ? image : null };
    }

    /**
     * 記住欄位（JSON）。存的就是傳進來的狀態，不再整理（沒有職業清單，整理是 normalize() 的事）。
     * @param {Storage | null} storage
     * @param {object} state
     * @returns {boolean} 存好了是 true；不是物件、轉不成 JSON、寫不進去、沒有儲存空間是 false（不寫、存著的不動）
     */
    function save(storage, state) {
        if (!isObject(state)) return false;
        let json;
        try {
            json = JSON.stringify(state);
        } catch (error) {
            return false;
        }
        return typeof json === 'string' && setText(storage, STORAGE_KEY, json);
    }

    /**
     * 記住圖片，或把它刪掉。
     * @param {Storage | null} storage
     * @param {string | null} dataUrl - 縮過的圖片（data:image/ 開頭的字串）；null 是刪掉。其他的東西不寫、也不刪
     * @returns {boolean} 存好（或刪掉）了是 true；不合格、寫不進去（容量已滿）、沒有儲存空間是 false，存著的圖片不動
     */
    function saveImage(storage, dataUrl) {
        if (dataUrl === null) return removeKey(storage, IMAGE_KEY);
        return isImageDataUrl(dataUrl) && setText(storage, IMAGE_KEY, dataUrl);
    }

    /**
     * 刪掉記住的欄位與圖片（兩個鍵都刪，一個刪不掉不影響另一個）。別的鍵不動，做不到也不丟錯。
     * @param {Storage | null} storage
     */
    function clear(storage) {
        removeKey(storage, STORAGE_KEY);
        removeKey(storage, IMAGE_KEY);
    }

    return Object.freeze({
        STORAGE_KEY, IMAGE_KEY, LIMITS, LIKES, LOOKING, DAYS, SLOTS, GCS, FORMATS, STYLES, ROLE_COLORS,
        defaults, normalize, validate, roleOf, accentOf, cropKey, cropOf, load, save, saveImage, clear
    });
})();

// Export for use in other modules
window.CardState = CardState;
