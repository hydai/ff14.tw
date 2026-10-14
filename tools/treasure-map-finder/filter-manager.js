// 過濾器管理模組
class FilterManager {
    // 寶圖等級由新到舊：結果、地區選項與網址裡的順序都以它為準
    static GRADE_ORDER = ['g18', 'g17', 'g15', 'g14', 'g12', 'g10', 'g8'];

    // localStorage 記住篩選用的 key，內容是 { levels, zones }
    static STORAGE_KEY = 'ff14tw_treasure_map_filters';

    static CONSTANTS = {
        FILTER_TYPES: {
            LEVEL: 'level',
            ZONE: 'zone'
        },
        CSS_CLASSES: {
            TAG: 'filter-tag',
            ACTIVE: 'active'
        }
    };

    /**
     * 取得 win.localStorage；封鎖網站資料等情況連取得都會丟例外，一律當作不能用
     * @param {Window} win
     * @returns {Storage|null}
     */
    static safeStorage(win) {
        try {
            return win.localStorage || null;
        } catch {
            return null;
        }
    }

    /**
     * 讀出記住的篩選
     * @param {Storage|null} storage
     * @returns {{levels: string[], zones: string[]}|null} 沒有、讀不到、JSON 壞掉或形狀不對都是 null
     */
    static readStored(storage) {
        try {
            const raw = storage?.getItem(FilterManager.STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            const isList = value => Array.isArray(value) && value.every(item => typeof item === 'string');
            if (!data || !isList(data.levels) || !isList(data.zones)) return null;
            return { levels: [...data.levels], zones: [...data.zones] };
        } catch {
            return null;
        }
    }

    /**
     * 記住篩選；沒有 storage 或寫入失敗（空間滿了、被封鎖）就算了，不影響使用
     * @param {Storage|null} storage
     * @param {{levels: string[], zones: string[]}} state
     */
    static writeStored(storage, state) {
        try {
            storage?.setItem(FilterManager.STORAGE_KEY, JSON.stringify({ levels: state.levels, zones: state.zones }));
        } catch { /* 記不住只是下次要重選，不影響這次使用 */ }
    }

    /**
     * 從網址的查詢字串讀出 grade、zone（逗號分隔）；只負責切開，值對不對交給 restoreState()
     * @param {string} search - 例如 location.search
     * @returns {{levels: string[], zones: string[]}|null} 兩個參數都沒有時是 null
     */
    static parseUrl(search) {
        const params = new URLSearchParams(search);
        if (!params.has('grade') && !params.has('zone')) return null;
        const list = name => (params.get(name) || '').split(',').map(item => item.trim()).filter(Boolean);
        return { levels: list('grade'), zones: list('zone') };
    }

    /**
     * 把篩選寫進網址：有值就設定 grade、zone，沒有就刪掉；其他參數（例如 room）的值保留，hash 原樣保留。
     * 整個查詢字串會重新編碼，寫法可能跟著變、意思不變（例如 ?debug&a=b%20c 變成 ?debug=&a=b+c）
     * @param {string} href - 目前的完整網址
     * @param {{levels: string[], zones: string[]}} state
     * @returns {string}
     */
    static buildUrl(href, state) {
        const url = new URL(href);
        for (const [name, values] of [['grade', state.levels], ['zone', state.zones]]) {
            if (values.length > 0) {
                url.searchParams.set(name, values.join(','));
            } else {
                url.searchParams.delete(name);
            }
        }
        // URLSearchParams 會把逗號編成 %2C；逗號在查詢字串裡本來就合法，改回來網址比較好讀
        url.search = url.searchParams.toString().replace(/%2C/gi, ',');
        return url.toString();
    }

    /**
     * 開啟頁面時要用哪一份篩選：網址 > localStorage > 什麼都沒選
     * @param {{url: ?{levels: string[], zones: string[]}, stored: ?{levels: string[], zones: string[]}}} sources
     * @returns {{levels: string[], zones: string[]}}
     */
    static pickInitialState({ url, stored }) {
        return url || stored || { levels: [], zones: [] };
    }

    constructor() {
        // 初始化過濾器集合：目前選的等級與地區
        this.filters = {
            levels: new Set(),
            zones: new Set()
        };

        // 等級 -> (地區 id -> 張數)，地區照資料裡第一次出現的順序；由 setMaps() 建立
        this.zonesByLevel = new Map();

        // 儲存過濾器變更的回調函數
        this.onChangeCallback = null;
    }

    /**
     * 設定過濾器變更時的回調函數（只留一個）
     * toggleLevel()、toggleZone()、clearZones() 每次真的改變了狀態就呼叫一次，參數是新的 getState()；
     * restoreState() 不呼叫（還原是呼叫者自己接著重畫）
     * @param {Function} callback - 回調函數
     */
    onChange(callback) {
        this.onChangeCallback = callback;
    }

    /**
     * 觸發變更事件
     */
    triggerChange() {
        if (this.onChangeCallback) {
            this.onChangeCallback(this.getState());
        }
    }

    /**
     * 告訴過濾器整份寶圖，用來算每個等級有哪些地區、各幾張；要在 restoreState() 之前呼叫
     * @param {Array} maps - 全部寶圖（要有 level 與 zoneId）
     */
    setMaps(maps) {
        this.zonesByLevel = new Map();
        for (const map of maps) {
            if (!this.zonesByLevel.has(map.level)) {
                this.zonesByLevel.set(map.level, new Map());
            }
            const zones = this.zonesByLevel.get(map.level);
            zones.set(map.zoneId, (zones.get(map.zoneId) || 0) + 1);
        }
    }

    /**
     * 認得、而且資料裡有寶圖的等級才選得到
     * @param {string} level
     * @returns {boolean}
     */
    isSelectableLevel(level) {
        return FilterManager.GRADE_ORDER.includes(level) && this.zonesByLevel.has(level);
    }

    /**
     * 選取或取消一個等級；取消時，不屬於剩下等級的已選地區一起取消
     * @param {string} level
     */
    toggleLevel(level) {
        if (this.filters.levels.has(level)) {
            this.filters.levels.delete(level);
            this.dropUnavailableZones();
        } else if (this.isSelectableLevel(level)) {
            this.filters.levels.add(level);
        } else {
            return;
        }
        this.triggerChange();
    }

    /**
     * 選取或取消一個地區；只有已選等級有寶圖的地區選得到
     * @param {string} zoneId
     */
    toggleZone(zoneId) {
        if (this.filters.zones.has(zoneId)) {
            this.filters.zones.delete(zoneId);
        } else if (this.getZoneOptions().some(option => option.zoneId === zoneId)) {
            this.filters.zones.add(zoneId);
        } else {
            return;
        }
        this.triggerChange();
    }

    /**
     * 取消所有已選地區（等級保留）
     */
    clearZones() {
        if (this.filters.zones.size === 0) return;
        this.filters.zones.clear();
        this.triggerChange();
    }

    /**
     * 把不在目前地區選項裡的已選地區取消
     */
    dropUnavailableZones() {
        const available = new Set(this.getZoneOptions().map(option => option.zoneId));
        for (const zoneId of [...this.filters.zones]) {
            if (!available.has(zoneId)) {
                this.filters.zones.delete(zoneId);
            }
        }
    }

    /**
     * 目前可選的地區：只列已選等級有寶圖的地區，張數只算已選等級；
     * 等級依 GRADE_ORDER，同等級的地區照資料第一次出現的順序
     * @returns {Array<{zoneId: string, count: number}>}
     */
    getZoneOptions() {
        const counts = new Map();
        for (const level of FilterManager.GRADE_ORDER) {
            if (!this.filters.levels.has(level)) continue;
            for (const [zoneId, count] of this.zonesByLevel.get(level) || []) {
                counts.set(zoneId, (counts.get(zoneId) || 0) + count);
            }
        }
        return Array.from(counts, ([zoneId, count]) => ({ zoneId, count }));
    }

    /**
     * 應用過濾器到地圖列表：沒選等級是空的；等級依 GRADE_ORDER 排，同等級照原始順序；
     * 沒選地區就是所選等級全部，選了就只留這些地區（用 zoneId 比對）
     * @param {Array} maps - 地圖列表
     * @returns {Array} 過濾後的地圖列表（新陣列，不改動傳入的）
     */
    applyFilters(maps) {
        const { levels, zones } = this.filters;
        if (levels.size === 0) return [];

        const rank = level => FilterManager.GRADE_ORDER.indexOf(level);
        return maps
            .filter(map => levels.has(map.level) && (zones.size === 0 || zones.has(map.zoneId)))
            .sort((a, b) => rank(a.level) - rank(b.level));
    }

    /**
     * 取得可儲存的狀態：等級依 GRADE_ORDER，地區依 getZoneOptions() 的順序，所以網址穩定
     * @returns {{levels: string[], zones: string[]}}
     */
    getState() {
        return {
            levels: FilterManager.GRADE_ORDER.filter(level => this.filters.levels.has(level)),
            zones: this.getZoneOptions()
                .map(option => option.zoneId)
                .filter(zoneId => this.filters.zones.has(zoneId))
        };
    }

    /**
     * 從儲存的狀態還原過濾器（整份取代）：丟掉不認得或沒有寶圖的等級，
     * 以及不屬於已選等級的地區。不碰畫面、不觸發變更事件
     * @param {{levels: string[], zones: string[]}} state - 網址或 localStorage 來的狀態
     */
    restoreState(state) {
        const wantedLevels = new Set(Array.isArray(state?.levels) ? state.levels : []);
        const wantedZones = new Set(Array.isArray(state?.zones) ? state.zones : []);

        this.filters.levels = new Set(
            FilterManager.GRADE_ORDER.filter(level => wantedLevels.has(level) && this.isSelectableLevel(level))
        );
        this.filters.zones = new Set(
            this.getZoneOptions().map(option => option.zoneId).filter(zoneId => wantedZones.has(zoneId))
        );
    }

    /**
     * 檢查是否有任何過濾器啟用
     * @returns {boolean}
     */
    hasActiveFilters() {
        return this.filters.levels.size > 0 || this.filters.zones.size > 0;
    }

    /**
     * 處理過濾器標籤點擊事件
     * @param {Event} event - 點擊事件
     */
    handleFilterClick(event) {
        const tag = event.target.closest(`.${FilterManager.CONSTANTS.CSS_CLASSES.TAG}`);
        if (!tag) return;

        const { filterType, filterValue } = this.extractFilterInfo(tag);
        
        if (filterType && filterValue) {
            this.toggleFilter(filterType, filterValue);
            this.updateTagUI(tag, filterType, filterValue);
            this.triggerChange();
        }
    }

    /**
     * 從標籤元素提取過濾器資訊
     * @param {HTMLElement} tag - 標籤元素
     * @returns {{filterType: string|null, filterValue: string|null}}
     */
    extractFilterInfo(tag) {
        let filterType = null;
        let filterValue = null;

        if (tag.hasAttribute('data-level')) {
            filterType = FilterManager.CONSTANTS.FILTER_TYPES.LEVEL;
            filterValue = tag.dataset.level;
        } else if (tag.hasAttribute('data-zone')) {
            filterType = FilterManager.CONSTANTS.FILTER_TYPES.ZONE;
            filterValue = tag.dataset.zone;
        }

        return { filterType, filterValue };
    }

    /**
     * 切換過濾器狀態
     * @param {string} filterType - 過濾器類型
     * @param {string} filterValue - 過濾器值
     */
    toggleFilter(filterType, filterValue) {
        const filterSet = this.getFilterSet(filterType);
        if (!filterSet) return;

        if (filterSet.has(filterValue)) {
            filterSet.delete(filterValue);
        } else {
            filterSet.add(filterValue);
        }
    }

    /**
     * 更新標籤的 UI 狀態
     * @param {HTMLElement} tag - 標籤元素
     * @param {string} filterType - 過濾器類型
     * @param {string} filterValue - 過濾器值
     */
    updateTagUI(tag, filterType, filterValue) {
        const filterSet = this.getFilterSet(filterType);
        if (!filterSet) return;

        if (filterSet.has(filterValue)) {
            tag.classList.add(FilterManager.CONSTANTS.CSS_CLASSES.ACTIVE);
        } else {
            tag.classList.remove(FilterManager.CONSTANTS.CSS_CLASSES.ACTIVE);
        }
    }

    /**
     * 取得指定類型的過濾器集合
     * @param {string} filterType - 過濾器類型
     * @returns {Set|null}
     */
    getFilterSet(filterType) {
        switch (filterType) {
            case FilterManager.CONSTANTS.FILTER_TYPES.LEVEL:
                return this.filters.levels;
            case FilterManager.CONSTANTS.FILTER_TYPES.ZONE:
                return this.filters.zones;
            default:
                return null;
        }
    }

    /**
     * 重置所有過濾器
     */
    resetAll() {
        // 清除所有過濾器
        this.filters.levels.clear();
        this.filters.zones.clear();

        // 更新所有標籤的 UI
        this.updateAllTagsUI();
        
        // 觸發變更事件
        this.triggerChange();
    }

    /**
     * 更新所有標籤的 UI 狀態
     */
    updateAllTagsUI() {
        document.querySelectorAll(`.${FilterManager.CONSTANTS.CSS_CLASSES.TAG}`).forEach(tag => {
            tag.classList.remove(FilterManager.CONSTANTS.CSS_CLASSES.ACTIVE);
        });
    }

    /**
     * 設定過濾器事件監聽器
     */
    setupEventListeners() {
        // 過濾器標籤點擊事件
        document.querySelectorAll(`.${FilterManager.CONSTANTS.CSS_CLASSES.TAG}`).forEach(tag => {
            tag.addEventListener('click', (e) => this.handleFilterClick(e));
        });

        // 重置按鈕點擊事件
        const resetButton = document.getElementById('resetFilters');
        if (resetButton) {
            resetButton.addEventListener('click', () => this.resetAll());
        }
    }

    /**
     * 取得當前啟用的過濾器
     * @returns {Object} 包含所有啟用過濾器的物件
     */
    getActiveFilters() {
        return {
            levels: Array.from(this.filters.levels),
            zones: Array.from(this.filters.zones),
            hasActiveFilters: this.hasActiveFilters()
        };
    }

    /**
     * 設定特定類型的過濾器
     * @param {string} filterType - 過濾器類型
     * @param {Array<string>} values - 要設定的值
     */
    setFilters(filterType, values) {
        const filterSet = this.getFilterSet(filterType);
        if (!filterSet) return;

        filterSet.clear();
        values.forEach(value => filterSet.add(value));
        
        this.updateFilterTypeUI(filterType);
        this.triggerChange();
    }

    /**
     * 更新特定類型過濾器的 UI
     * @param {string} filterType - 過濾器類型
     */
    updateFilterTypeUI(filterType) {
        const filterSet = this.getFilterSet(filterType);
        if (!filterSet) return;

        let selector = '';
        switch (filterType) {
            case FilterManager.CONSTANTS.FILTER_TYPES.LEVEL:
                selector = '[data-level]';
                break;
            case FilterManager.CONSTANTS.FILTER_TYPES.ZONE:
                selector = '[data-zone]';
                break;
        }

        if (selector) {
            document.querySelectorAll(`.${FilterManager.CONSTANTS.CSS_CLASSES.TAG}${selector}`).forEach(tag => {
                const { filterValue } = this.extractFilterInfo(tag);
                if (filterSet.has(filterValue)) {
                    tag.classList.add(FilterManager.CONSTANTS.CSS_CLASSES.ACTIVE);
                } else {
                    tag.classList.remove(FilterManager.CONSTANTS.CSS_CLASSES.ACTIVE);
                }
            });
        }
    }

    /**
     * 取得過濾器統計資訊
     * @param {Array} maps - 原始地圖列表
     * @returns {Object} 統計資訊
     */
    getFilterStats(maps) {
        const filteredMaps = this.applyFilters(maps);
        
        return {
            total: maps.length,
            filtered: filteredMaps.length,
            activeFilters: {
                levels: this.filters.levels.size,
                zones: this.filters.zones.size
            },
            filterRate: maps.length > 0 ? (filteredMaps.length / maps.length * 100).toFixed(1) : 0
        };
    }

    /**
     * 更新所有過濾器的 UI
     */
    updateAllFiltersUI() {
        Object.values(FilterManager.CONSTANTS.FILTER_TYPES).forEach(filterType => {
            this.updateFilterTypeUI(filterType);
        });
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FilterManager;
}