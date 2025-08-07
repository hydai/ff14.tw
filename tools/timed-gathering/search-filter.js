// 搜尋篩選模組
class SearchFilter {
    constructor() {
        // 搜尋權重設定
        this.searchWeights = {
            name: 3.0,        // 名稱匹配權重最高
            nameJp: 3.0,      // 日文名稱權重相同
            nameEn: 2.0,      // 英文名稱
            zone: 1.5,        // 地區名稱
            zoneJp: 1.5,      // 日文地區名稱
            location: 1.5,    // 地點名稱
            locationJp: 1.5,  // 日文地點名稱
            description: 1.0, // 描述
            coordinates: 0.5  // 座標
        };

        // 快取搜尋結果
        this.searchCache = new Map();
        this.cacheTimeout = 5000; // 5秒快取
    }

    /**
     * 主要篩選方法
     * @param {Array} items - 採集物項目陣列
     * @param {Object} filters - 篩選條件
     * @returns {Array} 篩選後的項目陣列
     */
    filter(items, filters = {}) {
        const {
            searchTerm = '',
            types = [],
            expansions = [],
            levels = { min: null, max: null },
            times = { start: null, end: null },
            zones = []
        } = filters;

        // 生成快取鍵
        const cacheKey = this.generateCacheKey(filters);
        
        // 檢查快取
        if (this.searchCache.has(cacheKey)) {
            const cached = this.searchCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.results;
            }
        }

        let results = [...items];

        // 應用各種篩選條件
        if (searchTerm && searchTerm.trim()) {
            results = this.filterBySearch(results, searchTerm.trim());
        }

        if (types && types.length > 0) {
            results = this.filterByTypes(results, types);
        }

        if (expansions && expansions.length > 0) {
            results = this.filterByExpansions(results, expansions);
        }

        if (levels.min !== null || levels.max !== null) {
            results = this.filterByLevels(results, levels);
        }

        if (times.start !== null || times.end !== null) {
            results = this.filterByTimes(results, times);
        }

        if (zones && zones.length > 0) {
            results = this.filterByZones(results, zones);
        }

        // 儲存到快取
        this.searchCache.set(cacheKey, {
            results: results,
            timestamp: Date.now()
        });

        // 清理舊快取
        this.cleanCache();

        return results;
    }

    /**
     * 搜尋篩選
     * @param {Array} items - 項目陣列
     * @param {string} searchTerm - 搜尋詞
     * @returns {Array} 篩選結果
     */
    filterBySearch(items, searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        const searchWords = lowerSearchTerm.split(/\s+/).filter(word => word.length > 0);

        // 計算每個項目的相關度分數
        const scoredItems = items.map(item => {
            let score = 0;

            // 檢查每個搜尋詞
            for (const word of searchWords) {
                // 名稱匹配
                if (item.name && item.name.toLowerCase().includes(word)) {
                    score += this.searchWeights.name;
                    // 完全匹配額外加分
                    if (item.name.toLowerCase() === word) {
                        score += this.searchWeights.name;
                    }
                }
                
                // 日文名稱匹配
                if (item.nameJp && item.nameJp.toLowerCase().includes(word)) {
                    score += this.searchWeights.nameJp;
                    // 完全匹配額外加分
                    if (item.nameJp.toLowerCase() === word) {
                        score += this.searchWeights.nameJp;
                    }
                }

                // 英文名稱匹配
                if (item.nameEn && item.nameEn.toLowerCase().includes(word)) {
                    score += this.searchWeights.nameEn;
                }

                // 地區匹配
                if (item.zone && item.zone.toLowerCase().includes(word)) {
                    score += this.searchWeights.zone;
                }
                
                // 日文地區匹配
                if (item.zoneJp && item.zoneJp.toLowerCase().includes(word)) {
                    score += this.searchWeights.zoneJp;
                }

                // 地點匹配
                if (item.location && item.location.toLowerCase().includes(word)) {
                    score += this.searchWeights.location;
                }
                
                // 日文地點匹配
                if (item.locationJp && item.locationJp.toLowerCase().includes(word)) {
                    score += this.searchWeights.locationJp;
                }

                // 描述匹配
                if (item.description && item.description.toLowerCase().includes(word)) {
                    score += this.searchWeights.description;
                }

                // 座標匹配
                if (item.coordinates && item.coordinates.toLowerCase().includes(word)) {
                    score += this.searchWeights.coordinates;
                }

                // 時間匹配
                if (item.time && item.time.includes(word)) {
                    score += 0.5;
                }

                // 等級匹配
                if (item.level && item.level.toString().includes(word)) {
                    score += 0.5;
                }
            }

            return { item, score };
        });

        // 篩選有分數的項目並按分數排序
        return scoredItems
            .filter(scored => scored.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(scored => scored.item);
    }

    /**
     * 類型篩選
     * @param {Array} items - 項目陣列
     * @param {Array} types - 類型陣列
     * @returns {Array} 篩選結果
     */
    filterByTypes(items, types) {
        if (!types || types.length === 0) {
            return items;
        }
        return items.filter(item => types.includes(item.type));
    }

    /**
     * 資料片篩選
     * @param {Array} items - 項目陣列
     * @param {Array} expansions - 資料片陣列
     * @returns {Array} 篩選結果
     */
    filterByExpansions(items, expansions) {
        if (!expansions || expansions.length === 0) {
            return items;
        }
        return items.filter(item => expansions.includes(item.expansion));
    }

    /**
     * 等級篩選
     * @param {Array} items - 項目陣列
     * @param {Object} levels - 等級範圍
     * @returns {Array} 篩選結果
     */
    filterByLevels(items, levels) {
        return items.filter(item => {
            const itemLevel = parseInt(item.level, 10);
            if (isNaN(itemLevel)) return true;

            if (levels.min !== null && itemLevel < levels.min) {
                return false;
            }
            if (levels.max !== null && itemLevel > levels.max) {
                return false;
            }
            return true;
        });
    }

    /**
     * 時間篩選
     * @param {Array} items - 項目陣列
     * @param {Object} times - 時間範圍
     * @returns {Array} 篩選結果
     */
    filterByTimes(items, times) {
        return items.filter(item => {
            if (!item.time) return true;

            const itemTime = this.parseTime(item.time);
            if (itemTime === null) return true;

            if (times.start !== null) {
                const startTime = this.parseTime(times.start);
                if (startTime !== null && itemTime < startTime) {
                    return false;
                }
            }

            if (times.end !== null) {
                const endTime = this.parseTime(times.end);
                if (endTime !== null && itemTime > endTime) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * 地區篩選
     * @param {Array} items - 項目陣列
     * @param {Array} zones - 地區陣列
     * @returns {Array} 篩選結果
     */
    filterByZones(items, zones) {
        if (!zones || zones.length === 0) {
            return items;
        }
        return items.filter(item => zones.includes(item.zone));
    }

    /**
     * 解析時間字串為分鐘數
     * @param {string} time - 時間字串 (HH:MM)
     * @returns {number|null} 分鐘數
     */
    parseTime(time) {
        if (typeof time === 'number') {
            return time;
        }

        const match = time.match(/^(\d{1,2}):(\d{2})$/);
        if (match) {
            const hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                return hours * 60 + minutes;
            }
        }
        return null;
    }

    /**
     * 生成快取鍵
     * @param {Object} filters - 篩選條件
     * @returns {string} 快取鍵
     */
    generateCacheKey(filters) {
        return JSON.stringify({
            s: filters.searchTerm || '',
            t: (filters.types || []).sort(),
            e: (filters.expansions || []).sort(),
            l: filters.levels || {},
            ti: filters.times || {},
            z: (filters.zones || []).sort()
        });
    }

    /**
     * 清理過期快取
     */
    cleanCache() {
        const now = Date.now();
        const keysToDelete = [];

        for (const [key, value] of this.searchCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout * 2) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.searchCache.delete(key);
        }
    }

    /**
     * 清空所有快取
     */
    clearCache() {
        this.searchCache.clear();
    }

    /**
     * 高級搜尋（支援操作符）
     * @param {Array} items - 項目陣列
     * @param {string} query - 搜尋查詢
     * @returns {Array} 篩選結果
     */
    advancedSearch(items, query) {
        // 支援的操作符：
        // AND: 詞1 詞2 (預設)
        // OR: 詞1 | 詞2
        // NOT: -詞
        // EXACT: "精確匹配"
        // FIELD: field:value (例如 type:mining)

        const tokens = this.tokenizeQuery(query);
        const conditions = this.parseTokens(tokens);

        return items.filter(item => {
            return this.evaluateConditions(item, conditions);
        });
    }

    /**
     * 分詞查詢字串
     * @param {string} query - 查詢字串
     * @returns {Array} 分詞結果
     */
    tokenizeQuery(query) {
        const tokens = [];
        const regex = /"([^"]+)"|(\S+)/g;
        let match;

        while ((match = regex.exec(query)) !== null) {
            tokens.push(match[1] || match[2]);
        }

        return tokens;
    }

    /**
     * 解析分詞為條件
     * @param {Array} tokens - 分詞陣列
     * @returns {Object} 條件物件
     */
    parseTokens(tokens) {
        const conditions = {
            and: [],
            or: [],
            not: [],
            exact: [],
            fields: {}
        };

        let currentMode = 'and';

        for (const token of tokens) {
            // NOT 操作符
            if (token.startsWith('-')) {
                conditions.not.push(token.substring(1));
                continue;
            }

            // OR 操作符
            if (token === '|' || token === 'OR') {
                currentMode = 'or';
                continue;
            }

            // AND 操作符
            if (token === '&' || token === 'AND') {
                currentMode = 'and';
                continue;
            }

            // 欄位搜尋
            if (token.includes(':')) {
                const [field, value] = token.split(':', 2);
                if (!conditions.fields[field]) {
                    conditions.fields[field] = [];
                }
                conditions.fields[field].push(value);
                continue;
            }

            // 一般詞彙
            if (currentMode === 'or') {
                conditions.or.push(token);
            } else {
                conditions.and.push(token);
            }
        }

        return conditions;
    }

    /**
     * 評估條件
     * @param {Object} item - 項目
     * @param {Object} conditions - 條件
     * @returns {boolean} 是否符合
     */
    evaluateConditions(item, conditions) {
        // 檢查 NOT 條件
        for (const term of conditions.not) {
            if (this.itemContainsTerm(item, term)) {
                return false;
            }
        }

        // 檢查欄位條件
        for (const [field, values] of Object.entries(conditions.fields)) {
            let fieldMatched = false;
            for (const value of values) {
                if (this.itemFieldMatches(item, field, value)) {
                    fieldMatched = true;
                    break;
                }
            }
            if (!fieldMatched) {
                return false;
            }
        }

        // 檢查 AND 條件
        for (const term of conditions.and) {
            if (!this.itemContainsTerm(item, term)) {
                return false;
            }
        }

        // 檢查 OR 條件
        if (conditions.or.length > 0) {
            let orMatched = false;
            for (const term of conditions.or) {
                if (this.itemContainsTerm(item, term)) {
                    orMatched = true;
                    break;
                }
            }
            if (!orMatched) {
                return false;
            }
        }

        return true;
    }

    /**
     * 檢查項目是否包含詞彙
     * @param {Object} item - 項目
     * @param {string} term - 詞彙
     * @returns {boolean} 是否包含
     */
    itemContainsTerm(item, term) {
        const lowerTerm = term.toLowerCase();
        
        return (
            (item.name && item.name.toLowerCase().includes(lowerTerm)) ||
            (item.nameJp && item.nameJp.toLowerCase().includes(lowerTerm)) ||
            (item.nameEn && item.nameEn.toLowerCase().includes(lowerTerm)) ||
            (item.zone && item.zone.toLowerCase().includes(lowerTerm)) ||
            (item.zoneJp && item.zoneJp.toLowerCase().includes(lowerTerm)) ||
            (item.location && item.location.toLowerCase().includes(lowerTerm)) ||
            (item.locationJp && item.locationJp.toLowerCase().includes(lowerTerm)) ||
            (item.description && item.description.toLowerCase().includes(lowerTerm))
        );
    }

    /**
     * 檢查項目欄位是否匹配
     * @param {Object} item - 項目
     * @param {string} field - 欄位名稱
     * @param {string} value - 值
     * @returns {boolean} 是否匹配
     */
    itemFieldMatches(item, field, value) {
        const fieldValue = item[field];
        if (fieldValue === undefined || fieldValue === null) {
            return false;
        }

        const lowerValue = value.toLowerCase();
        const lowerFieldValue = fieldValue.toString().toLowerCase();

        return lowerFieldValue.includes(lowerValue);
    }

    /**
     * 取得所有可用的篩選選項
     * @param {Array} items - 項目陣列
     * @returns {Object} 可用選項
     */
    getAvailableFilters(items) {
        const filters = {
            types: new Set(),
            expansions: new Set(),
            zones: new Set(),
            levels: { min: Infinity, max: -Infinity }
        };

        for (const item of items) {
            if (item.type) {
                filters.types.add(item.type);
            }
            if (item.expansion) {
                filters.expansions.add(item.expansion);
            }
            if (item.zone) {
                filters.zones.add(item.zone);
            }
            if (item.level) {
                const level = parseInt(item.level, 10);
                if (!isNaN(level)) {
                    filters.levels.min = Math.min(filters.levels.min, level);
                    filters.levels.max = Math.max(filters.levels.max, level);
                }
            }
        }

        return {
            types: Array.from(filters.types).sort(),
            expansions: Array.from(filters.expansions).sort(),
            zones: Array.from(filters.zones).sort(),
            levels: filters.levels.min === Infinity ? null : filters.levels
        };
    }
}