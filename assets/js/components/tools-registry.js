/**
 * FF14.tw 工具登錄表
 * 全站工具清單的唯一來源，順序就是首頁卡片的順序。
 *
 * 每筆工具：
 *   id        工具 id（站內工具＝ tools/ 底下的目錄名稱）
 *   href      站內工具是相對於網站根目錄的網址（開頭不加斜線）；外部網站是完整網址
 *   icon      圖示，要和 index.html 工具卡的圖示位元組完全相同
 *   i18nKey   工具名稱的 i18n 鍵，定義在 translations/common.js（zh／en／ja）
 *   name      zh 名稱；沒有載入 i18n 的頁面直接顯示它，測試也以它為基準
 *   external  只有外部網站才有，值為 true；它不在本站，findByPath 不比對
 *
 * 新增工具時：在這裡登錄、在 common.js 補三語的名稱鍵、在 index.html 補工具卡；
 * tests/tools-registry.test.js 會比對這三處。
 *
 * 最近使用：工具頁載入時由 layout-loader 呼叫 recordVisit(id) 記錄，首頁（home.js）用 readRecent() 讀出來顯示。
 * 存在 localStorage['ff14tw_recent_tools']，格式是 JSON 陣列 [{ "id": "weather-forecast", "t": 1760342400000 }, …]，
 * 最新的在前、同一工具只留一筆、最多 MAX_RECENT 筆；外部網站不記錄。
 * 所有儲存空間的存取都吞掉例外：無痕模式、被封鎖、資料毀損時，最近使用只是沒有資料，不影響頁面。
 */
const ToolsRegistry = {
    tools: Object.freeze([
        { id: 'mini-cactpot', href: 'tools/mini-cactpot/index.html', icon: '🎰', i18nKey: 'tool_mini_cactpot_title', name: '仙人微彩計算機' },
        { id: 'wondrous-tails', href: 'tools/wondrous-tails/index.html', icon: '📋', i18nKey: 'tool_wondrous_tails_title', name: '天書奇談預測器' },
        { id: 'dungeon-database', href: 'tools/dungeon-database/index.html', icon: '🏰', i18nKey: 'tool_dungeon_database_title', name: '副本資料庫' },
        { id: 'character-card', href: 'tools/character-card/index.html', icon: '🎴', i18nKey: 'tool_character_card_title', name: '角色卡產生器' },
        { id: 'faux-hollows-foxes', href: 'tools/faux-hollows-foxes/index.html', icon: '🦊', i18nKey: 'tool_faux_hollows_title', name: '宗長計算機' },
        { id: 'treasure-map-finder', href: 'tools/treasure-map-finder/index.html', icon: '🗺️', i18nKey: 'tool_treasure_map_title', name: '寶圖搜尋器' },
        { id: 'lodestone-lookup', href: 'tools/lodestone-lookup/index.html', icon: '🔍', i18nKey: 'tool_lodestone_title', name: 'Lodestone 角色查詢' },
        { id: 'timed-gathering', href: 'tools/timed-gathering/index.html', icon: '⏰', i18nKey: 'tool_timed_gathering_title', name: '特殊採集時間管理器' },
        { id: 'guide', href: 'tools/guide/index.html', icon: '📖', i18nKey: 'tool_guide_title', name: '攻略資料' },
        { id: 'report-generator', href: 'tools/report-generator/index.html', icon: '📝', i18nKey: 'tool_report_generator_title', name: '檢舉模板產生器' },
        { id: 'macro-converter', href: 'tools/macro-converter/index.html', icon: '🔄', i18nKey: 'tool_macro_converter_title', name: '巨集轉換器' },
        { id: 'weather-forecast', href: 'tools/weather-forecast/index.html', icon: '🌤️', i18nKey: 'tool_weather_forecast_title', name: '天氣預報' },
        { id: 'tc-shop', href: 'https://tc-shop.ff14.tw', icon: '🛒', i18nKey: 'tool_tc_shop_title', name: '水晶商城清單', external: true }
    ]),

    // 最近使用的儲存鍵與筆數上限
    STORAGE_KEY: 'ff14tw_recent_tools',
    MAX_RECENT: 4,

    /**
     * 依 id 找工具
     * @param {string} id - 工具 id
     * @returns {Object|null} 找不到時回傳 null
     */
    findById(id) {
        return ToolsRegistry.tools.find((tool) => tool.id === id) || null;
    },

    /**
     * 依頁面路徑找出所屬的站內工具：pathname 以 '/' + 工具目錄 + '/' 開頭就算，
     * 工具目錄是 href 去掉最後一段檔名（例如 tools/guide），所以工具底下的子頁面也算。
     * @param {string} pathname - 例如 location.pathname
     * @returns {Object|null} 找不到時回傳 null
     */
    findByPath(pathname) {
        return ToolsRegistry.tools.find((tool) => {
            if (tool.external) return false;
            const directory = tool.href.slice(0, tool.href.lastIndexOf('/') + 1); // 例如 'tools/guide/'
            return pathname.startsWith('/' + directory);
        }) || null;
    },

    /**
     * 讀出最近使用的工具，最新的在前
     * @param {Storage} [storage] - 儲存空間；省略時用 window.localStorage
     * @returns {Array<Object>} 登錄表裡的工具物件：只有站內工具、不重複、最多 MAX_RECENT 個；
     *   沒有紀錄、資料毀損、取不到儲存空間時回傳 []
     */
    readRecent(storage) {
        const store = ToolsRegistry._resolveStorage(storage);
        if (!store) return [];
        return ToolsRegistry._readEntries(store)
            .slice(0, ToolsRegistry.MAX_RECENT)
            .map((entry) => ToolsRegistry.findById(entry.id));
    },

    /**
     * 記錄一次使用：放到最前面、刪掉同一工具的舊紀錄、只留 MAX_RECENT 筆後寫回。
     * 未知的 id 與外部網站不記錄；任何儲存空間的錯誤都吞掉。
     * @param {string} id - 工具 id
     * @param {Object} [options]
     * @param {Storage} [options.storage] - 儲存空間；省略時用 window.localStorage
     * @param {number} [options.now] - 這次使用的時間（毫秒），預設現在
     */
    recordVisit(id, { storage, now = Date.now() } = {}) {
        const tool = ToolsRegistry.findById(id);
        if (!tool || tool.external) return;
        const store = ToolsRegistry._resolveStorage(storage);
        if (!store) return;

        // 讀不到或毀損的舊資料算沒有紀錄，這次的紀錄會把它蓋掉
        const previous = ToolsRegistry._readEntries(store).filter((entry) => entry.id !== tool.id);
        try {
            store.setItem(ToolsRegistry.STORAGE_KEY, JSON.stringify([{ id: tool.id, t: now }, ...previous].slice(0, ToolsRegistry.MAX_RECENT)));
        } catch (error) {
            // 寫不進去（無痕模式、容量已滿、被封鎖）就略過，最近使用只是方便功能
        }
    },

    /**
     * 決定要用的儲存空間：呼叫端有給（包含 null，表示沒有儲存空間）就用它，沒給就用 window.localStorage。
     * 封鎖儲存空間的瀏覽器光是讀 window.localStorage 就會丟例外，所以包 try/catch。
     * @param {Storage|null} [storage]
     * @returns {Storage|null} 取不到時回傳 null
     */
    _resolveStorage(storage) {
        if (storage !== undefined) return storage;
        try {
            return (typeof window !== 'undefined' && window.localStorage) || null;
        } catch (error) {
            return null;
        }
    },

    /**
     * 讀出儲存空間裡的紀錄 [{ id, t }]，最新的在前，並整理成合格的資料：
     * 只留登錄表裡的站內工具、同一工具只留第一筆、沒有時間戳記的補 0。沒有紀錄、
     * JSON 毀損、不是陣列、store 丟例外時回傳 []。
     * @param {Storage} store
     * @returns {Array<{id: string, t: number}>}
     */
    _readEntries(store) {
        try {
            const saved = JSON.parse(store.getItem(ToolsRegistry.STORAGE_KEY));
            if (!Array.isArray(saved)) return [];

            const seen = new Set();
            const entries = [];
            for (const item of saved) {
                const tool = ToolsRegistry.findById(item?.id);
                if (!tool || tool.external || seen.has(tool.id)) continue;
                seen.add(tool.id);
                entries.push({ id: tool.id, t: Number.isFinite(item.t) ? item.t : 0 });
            }
            return entries;
        } catch (error) {
            return [];
        }
    }
};

// 匯出到全域（瀏覽器）與 module（Node 測試），比照 assets/js/modal-manager.js
if (typeof window !== 'undefined') {
    window.ToolsRegistry = ToolsRegistry;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToolsRegistry;
}
