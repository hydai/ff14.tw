// 清單管理模組
class ListManager {
    static CONSTANTS = {
        STORAGE_KEY: 'ff14tw_treasure_map_list',
        STORAGE_VERSION: '1.0',
        MAX_ID_LENGTH: 50,
        MAX_LEVEL_LENGTH: 10,
        MAX_ZONE_LENGTH: 50,
        PLACEHOLDER_IMAGE: '/assets/images/treasure-map-placeholder.png'
    };

    constructor() {
        this.list = [];
        this.listIds = new Set();
        this.loadFromStorage();
    }

    /**
     * 從本地儲存載入清單
     * @returns {Array} 載入的清單資料
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(ListManager.CONSTANTS.STORAGE_KEY);
            if (stored) {
                const parseResult = SecurityUtils.safeJSONParse(stored);
                if (parseResult.success && parseResult.data.version === ListManager.CONSTANTS.STORAGE_VERSION) {
                    this.list = parseResult.data.maps || [];
                    this.listIds = new Set(this.list.map(item => item.id));
                    return this.list;
                }
            }
        } catch (error) {
            console.error('載入清單失敗:', error);
        }
        
        this.list = [];
        this.listIds = new Set();
        return [];
    }

    /**
     * 儲存清單到本地儲存
     */
    saveToStorage(maps = this.list) {
        const data = {
            version: ListManager.CONSTANTS.STORAGE_VERSION,
            lastUpdated: new Date().toISOString(),
            maps
        };
        
        try {
            localStorage.setItem(ListManager.CONSTANTS.STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('儲存清單失敗:', error);
            throw new Error('無法儲存清單');
        }
    }

    /**
     * 取得清單長度
     * @returns {number}
     */
    getLength() {
        return this.list.length;
    }

    /**
     * 取得整個清單
     * @returns {Array}
     */
    getList() {
        return [...this.list];
    }

    /**
     * 檢查項目是否在清單中
     * @param {string} id - 項目 ID
     * @returns {boolean}
     */
    has(id) {
        return this.listIds.has(id);
    }

    /**
     * 加入項目到清單
     * @param {Object} map - 地圖資料
     * @param {Object} options - 選項 {maxItems, addedBy}
     * @returns {{success: boolean, message: string}}
     */
    add(map, options = {}) {
        const { maxItems = Infinity, addedBy = null } = options;

        // 檢查是否已存在
        if (this.has(map.id)) {
            return {
                success: false,
                message: FF14Utils.getI18nText('treasure_map_item_already_in_list', '此寶圖已在清單中')
            };
        }

        // 檢查數量限制
        if (this.list.length >= maxItems) {
            return {
                success: false,
                message: FF14Utils.getI18nText(
                    'treasure_map_list_full',
                    `清單已滿（${this.list.length}/${maxItems}）`,
                    { current: this.list.length, max: maxItems }
                )
            };
        }

        // 準備資料
        const mapData = this.sanitizeMapData({
            ...map,
            addedAt: new Date().toISOString(),
            addedBy: addedBy
        });

        // 加入清單
        this.list.push(mapData);
        this.listIds.add(map.id);
        this.saveToStorage();

        return {
            success: true,
            message: FF14Utils.getI18nText('treasure_map_item_added', '已加入清單')
        };
    }

    /**
     * 從清單移除項目
     * @param {string} id - 項目 ID
     * @returns {{success: boolean, message: string, removedItem: Object|null}}
     */
    remove(id) {
        if (!this.has(id)) {
            return {
                success: false,
                message: FF14Utils.getI18nText('treasure_map_item_not_in_list', '此寶圖不在清單中'),
                removedItem: null
            };
        }

        // 找到要移除的項目
        const removedItem = this.list.find(item => item.id === id);

        // 移除
        this.list = this.list.filter(item => item.id !== id);
        this.listIds.delete(id);
        this.saveToStorage();

        return {
            success: true,
            message: FF14Utils.getI18nText('treasure_map_item_removed', '已從清單移除'),
            removedItem
        };
    }

    /**
     * 清空整個清單
     * @returns {{success: boolean, message: string, count: number}}
     */
    clear() {
        const count = this.list.length;

        if (count === 0) {
            return {
                success: false,
                message: FF14Utils.getI18nText('treasure_map_empty_list', '清單已經是空的'),
                count: 0
            };
        }

        this.list = [];
        this.listIds.clear();
        this.saveToStorage();

        return {
            success: true,
            message: FF14Utils.getI18nText('treasure_map_list_cleared', '已清空清單'),
            count
        };
    }

    /**
     * 切換項目的存在狀態
     * @param {Object} map - 地圖資料
     * @param {Object} options - 選項
     * @returns {{action: 'add'|'remove', success: boolean, message: string}}
     */
    toggle(map, options = {}) {
        if (this.has(map.id)) {
            const result = this.remove(map.id);
            return { action: 'remove', ...result };
        } else {
            const result = this.add(map, options);
            return { action: 'add', ...result };
        }
    }

    /**
     * 清理並標準化地圖資料
     * @param {Object} map - 原始地圖資料
     * @returns {Object} 清理後的資料
     */
    sanitizeMapData(map) {
        return {
            id: String(map.id).substring(0, ListManager.CONSTANTS.MAX_ID_LENGTH),
            level: String(map.level).substring(0, ListManager.CONSTANTS.MAX_LEVEL_LENGTH),
            levelName: map.levelName ? String(map.levelName).substring(0, ListManager.CONSTANTS.MAX_ZONE_LENGTH) : '',
            zone: String(map.zone).substring(0, ListManager.CONSTANTS.MAX_ZONE_LENGTH),
            zoneId: map.zoneId || null,
            coords: CoordinateUtils.normalizeCoordinates(map.coords),
            thumbnail: map.thumbnail || ListManager.CONSTANTS.PLACEHOLDER_IMAGE,
            addedAt: map.addedAt || new Date().toISOString(),
            addedBy: map.addedBy || null
        };
    }

    /**
     * 驗證地圖資料
     * @param {Object} map - 地圖資料
     * @returns {boolean}
     */
    validateMapData(map) {
        if (!map || typeof map !== 'object') return false;
        
        // 必要欄位
        if (!map.id || typeof map.id !== 'string') return false;
        if (!map.level || typeof map.level !== 'string') return false;
        if (!map.zone || typeof map.zone !== 'string') return false;
        
        // 使用 CoordinateUtils 進行座標驗證
        return CoordinateUtils.validateCoordinates(map.coords);
    }

    /**
     * 匯出清單資料
     * @returns {Object} 匯出資料物件
     */
    export() {
        return {
            version: '1.0',
            exportDate: new Date().toISOString(),
            appName: 'FF14.tw 寶圖搜尋器',
            totalMaps: this.list.length,
            maps: this.list.map(map => ({
                id: map.id,
                level: map.level,
                levelName: map.levelName,
                zone: map.zone,
                coords: map.coords
            }))
        };
    }

    /**
     * 匯出為 JSON 字串
     * @returns {string}
     */
    exportAsJson() {
        return JSON.stringify(this.export(), null, 2);
    }

    /**
     * 匯入清單資料
     * @param {Object|string} data - 匯入的資料或 JSON 字串
     * @param {boolean} merge - 是否合併（true）或取代（false）
     * @param {Object} options - 選項 {maxItems, validate}；validate 在儲存前驗證完整結果
     * @returns {{success: boolean, message: string, imported: number, skipped: number}}
     */
    import(data, merge = false, { maxItems = Infinity, validate } = {}) {
        try {
            // 如果是字串，嘗試解析
            let importData;
            if (typeof data === 'string') {
                const parseResult = SecurityUtils.safeJSONParse(data);
                if (!parseResult.success) {
                    throw new Error(FF14Utils.getI18nText('treasure_map_import_invalid_json', '無效的 JSON 格式'));
                }
                importData = parseResult.data;
            } else {
                importData = data;
            }
            
            // 驗證格式
            if (!importData.maps || !Array.isArray(importData.maps)) {
                throw new Error(FF14Utils.getI18nText('treasure_map_import_invalid_format', '無效的匯入格式'));
            }

            // 驗證所有地圖資料
            const validatedMaps = [];
            let skippedCount = 0;

            for (const map of importData.maps) {
                if (!this.validateMapData(map)) {
                    console.warn('跳過無效的地圖資料:', map);
                    skippedCount++;
                    continue;
                }
                validatedMaps.push(this.sanitizeMapData(map));
            }

            if (validatedMaps.length === 0) {
                throw new Error(FF14Utils.getI18nText('treasure_map_import_no_valid_maps', '沒有有效的地圖資料'));
            }

            // Stage and deduplicate the projected list before persisting or reporting success.
            const next = new Map((merge ? this.list : []).map(map => [map.id, map]));
            let importedCount = 0;
            for (const map of validatedMaps) {
                if (!next.has(map.id)) {
                    next.set(map.id, map);
                    importedCount++;
                }
            }
            if (next.size > maxItems) {
                throw new Error(FF14Utils.getI18nText(
                    'treasure_map_list_full', `清單已滿（${next.size}/${maxItems}）`,
                    { current: next.size, max: maxItems }
                ));
            }
            const nextList = [...next.values()];
            if (validate) validate(nextList);
            this.saveToStorage(nextList);
            this.list = nextList;
            this.listIds = new Set(next.keys());

            return {
                success: true,
                message: merge
                    ? FF14Utils.getI18nText('treasure_map_import_merged', '已合併匯入 {count} 張新寶圖', { count: importedCount })
                    : FF14Utils.getI18nText('treasure_map_import_success', '已匯入 {count} 張寶圖', { count: importedCount }),
                imported: importedCount,
                skipped: skippedCount
            };

        } catch (error) {
            console.error('匯入失敗:', error);
            return {
                success: false,
                message: error.message || FF14Utils.getI18nText('treasure_map_import_generic_failed', '匯入失敗'),
                imported: 0,
                skipped: 0
            };
        }
    }

    /**
     * 從房間資料同步
     * @param {Array} roomMaps - 房間的地圖列表
     * @param {Array} allMaps - 所有可用的地圖資料
     */
    syncFromRoom(roomMaps, allMaps) {
        const catalogue = new Map(allMaps.map(map => [map.id, map]));
        const next = new Map();
        for (const roomMap of roomMaps) {
            const map = {
                ...(catalogue.get(roomMap.id) || {
                    id: roomMap.id, level: roomMap.type, zone: roomMap.zone,
                    coords: { x: roomMap.x, y: roomMap.y }
                }),
                addedAt: roomMap.addedAt,
                addedBy: roomMap.addedBy
            };
            if (this.validateMapData(map)) next.set(map.id, this.sanitizeMapData(map));
        }
        this.list = [...next.values()];
        this.listIds = new Set(next.keys());
        try {
            this.saveToStorage();
        } catch (error) {
            // A successful remote edit must remain usable even if browser storage is unavailable.
            console.warn('共用清單僅保留於目前頁面', error);
        }
    }

    /**
     * 取得統計資訊
     * @returns {Object}
     */
    getStats() {
        const stats = {
            total: this.list.length,
            byLevel: {},
            byZone: {},
            oldestItem: null,
            newestItem: null
        };

        if (this.list.length === 0) return stats;

        // 按等級統計
        this.list.forEach(item => {
            stats.byLevel[item.level] = (stats.byLevel[item.level] || 0) + 1;
            stats.byZone[item.zone] = (stats.byZone[item.zone] || 0) + 1;
        });

        // 找出最舊和最新的項目
        const sortedByDate = [...this.list].sort((a, b) => 
            new Date(a.addedAt) - new Date(b.addedAt)
        );
        
        stats.oldestItem = sortedByDate[0];
        stats.newestItem = sortedByDate[sortedByDate.length - 1];

        return stats;
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ListManager;
}
