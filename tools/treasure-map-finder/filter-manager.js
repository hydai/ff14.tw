// 過濾器管理模組
class FilterManager {
    static CONSTANTS = {
        FILTER_TYPES: {
            LEVEL: 'level',
            ZONE: 'zone',
            MAP: 'map'
        },
        CSS_CLASSES: {
            TAG: 'filter-tag',
            ACTIVE: 'active'
        }
    };

    constructor() {
        // 初始化過濾器集合
        this.filters = {
            levels: new Set(),
            zones: new Set(),
            maps: new Set()
        };
        
        // 儲存過濾器變更的回調函數
        this.onChangeCallback = null;
    }

    /**
     * 設定過濾器變更時的回調函數
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
            this.onChangeCallback(this.getActiveFilters());
        }
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
        } else if (tag.hasAttribute('data-map')) {
            filterType = FilterManager.CONSTANTS.FILTER_TYPES.MAP;
            filterValue = tag.dataset.map;
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
            case FilterManager.CONSTANTS.FILTER_TYPES.MAP:
                return this.filters.maps;
            default:
                return null;
        }
    }

    /**
     * 應用過濾器到地圖列表
     * @param {Array} maps - 地圖列表
     * @returns {Array} 過濾後的地圖列表
     */
    applyFilters(maps) {
        return maps.filter(map => {
            const levelMatch = this.filters.levels.size === 0 || 
                             this.filters.levels.has(map.level);
            const zoneMatch = this.filters.zones.size === 0 || 
                            this.filters.zones.has(map.zoneId);
            const mapMatch = this.filters.maps.size === 0 || 
                           this.filters.maps.has(map.zone);
            
            return levelMatch && zoneMatch && mapMatch;
        });
    }

    /**
     * 重置所有過濾器
     */
    resetAll() {
        // 清除所有過濾器
        this.filters.levels.clear();
        this.filters.zones.clear();
        this.filters.maps.clear();

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
            maps: Array.from(this.filters.maps),
            hasActiveFilters: this.hasActiveFilters()
        };
    }

    /**
     * 檢查是否有任何過濾器啟用
     * @returns {boolean}
     */
    hasActiveFilters() {
        return this.filters.levels.size > 0 || 
               this.filters.zones.size > 0 || 
               this.filters.maps.size > 0;
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
            case FilterManager.CONSTANTS.FILTER_TYPES.MAP:
                selector = '[data-map]';
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
                zones: this.filters.zones.size,
                maps: this.filters.maps.size
            },
            filterRate: maps.length > 0 ? (filteredMaps.length / maps.length * 100).toFixed(1) : 0
        };
    }

    /**
     * 從儲存的狀態還原過濾器
     * @param {Object} state - 儲存的狀態
     */
    restoreState(state) {
        if (!state) return;

        if (state.levels) {
            this.filters.levels = new Set(state.levels);
        }
        if (state.zones) {
            this.filters.zones = new Set(state.zones);
        }
        if (state.maps) {
            this.filters.maps = new Set(state.maps);
        }

        // 更新所有 UI
        this.updateAllFiltersUI();
        this.triggerChange();
    }

    /**
     * 更新所有過濾器的 UI
     */
    updateAllFiltersUI() {
        Object.values(FilterManager.CONSTANTS.FILTER_TYPES).forEach(filterType => {
            this.updateFilterTypeUI(filterType);
        });
    }

    /**
     * 取得可儲存的狀態
     * @returns {Object}
     */
    getState() {
        return {
            levels: Array.from(this.filters.levels),
            zones: Array.from(this.filters.zones),
            maps: Array.from(this.filters.maps)
        };
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FilterManager;
}