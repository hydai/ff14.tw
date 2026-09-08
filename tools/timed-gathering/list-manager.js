// 清單管理模組
class ListManager {
    static CONSTANTS = {
        STORAGE_KEY: 'ff14tw_timed_gathering_lists',
        STORAGE_VERSION: '1.0',
        DEFAULT_LIST_ID: 'default',
        // Version 1.0 stored these labels before it recorded placeholder state.
        LEGACY_DEFAULT_LIST_NAMES: ['預設清單', 'デフォルトリスト', 'Default List'],
        MAX_LIST_NAME_LENGTH: 50,
        MAX_LISTS: 10,
        MAX_ITEMS_PER_LIST: 100
    };

    constructor() {
        this.lists = Object.create(null);
        this.storageLoadFailed = false;
        this.loadFromStorage();
        
        // 確保至少有一個預設清單
        if (Object.keys(this.lists).length === 0) {
            this.createDefaultList(!this.storageLoadFailed);
        }
    }

    /**
     * 建立預設清單
     */
    createDefaultList(persist = true) {
        // Use i18n for default list name if available
        const defaultName = FF14Utils.getI18nText('defaultListName', 'Default List');
        this.lists[ListManager.CONSTANTS.DEFAULT_LIST_ID] = {
            id: ListManager.CONSTANTS.DEFAULT_LIST_ID,
            name: defaultName,
            items: [],
            isPlaceholder: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (persist) this.saveToStorage();
    }

    /** Validate the same versioned document used by storage and JSON backups. */
    static parseBackup(data) {
        const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
        const isText = value => typeof value === 'string' && value.trim().length > 0;
        const validDate = value => value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
        if (!isRecord(data) || data.version !== ListManager.CONSTANTS.STORAGE_VERSION || !isRecord(data.lists)) return null;
        const entries = Object.entries(data.lists);
        if (entries.length > ListManager.CONSTANTS.MAX_LISTS) return null;
        const lists = Object.create(null);
        const stringFields = ['nameJp', 'nameEn', 'zoneJp', 'zoneEn', 'location', 'locationJp', 'locationEn', 'coordinates', 'macroFormat', 'expansion', 'description'];
        for (const [id, list] of entries) {
            if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || ['__proto__', 'prototype', 'constructor'].includes(id) ||
                !isRecord(list) || list.id !== id || !isText(list.name) ||
                !Array.isArray(list.items) || list.items.length > ListManager.CONSTANTS.MAX_ITEMS_PER_LIST ||
                (list.isPlaceholder !== undefined && typeof list.isPlaceholder !== 'boolean') ||
                !validDate(list.createdAt) || !validDate(list.updatedAt)) return null;

            const items = [];
            const itemIds = new Set();
            for (const item of list.items) {
                if (!isRecord(item) || !isText(item.id) || itemIds.has(item.id) || !isText(item.name) || !isText(item.zone) ||
                    !['mining', 'botany', 'fishing'].includes(item.type) ||
                    !['number', 'string'].includes(typeof item.level) || !Number.isFinite(Number(item.level)) || Number(item.level) <= 0 ||
                    !TimeCalculator.parseSchedule(item.time, item.duration) || !validDate(item.addedAt) ||
                    stringFields.some(field => item[field] !== undefined && typeof item[field] !== 'string')) return null;
                itemIds.add(item.id);
                const normalizedItem = {
                    id: item.id, name: item.name, type: item.type, level: item.level, zone: item.zone,
                    time: item.time, duration: item.duration, addedAt: item.addedAt
                };
                for (const field of stringFields) {
                    if (item[field] !== undefined) normalizedItem[field] = item[field];
                }
                items.push(normalizedItem);
            }
            lists[id] = {
                id, name: list.name.trim(), items,
                isPlaceholder: id === ListManager.CONSTANTS.DEFAULT_LIST_ID && items.length === 0 &&
                    (list.isPlaceholder === true || (list.isPlaceholder === undefined &&
                        ListManager.CONSTANTS.LEGACY_DEFAULT_LIST_NAMES.includes(list.name.trim()))),
                createdAt: list.createdAt || new Date().toISOString(),
                updatedAt: list.updatedAt || new Date().toISOString()
            };
        }
        // The old importer appended collision suffixes beyond the name limit. Normalize
        // those names without rejecting their lists or changing existing bounded names.
        const usedNames = new Set(Object.values(lists)
            .filter(list => list.name.length <= ListManager.CONSTANTS.MAX_LIST_NAME_LENGTH)
            .map(list => list.name));
        for (const list of Object.values(lists)) {
            if (list.name.length > ListManager.CONSTANTS.MAX_LIST_NAME_LENGTH) {
                list.name = ListManager.uniqueListName(list.name, usedNames);
                usedNames.add(list.name);
            }
        }
        return lists;
    }

    static uniqueListName(name, usedNames) {
        const maxLength = ListManager.CONSTANTS.MAX_LIST_NAME_LENGTH;
        let candidate = name.slice(0, maxLength);
        let suffix = 1;
        while (usedNames.has(candidate)) {
            const ending = ` (${suffix++})`;
            candidate = name.slice(0, maxLength - ending.length) + ending;
        }
        return candidate;
    }

    /**
     * 從本地儲存載入清單
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(ListManager.CONSTANTS.STORAGE_KEY);
            if (stored) {
                const lists = ListManager.parseBackup(JSON.parse(stored));
                if (!lists) throw new Error('Invalid stored gathering lists');
                this.lists = lists;
                return;
            }
        } catch (error) {
            console.error('載入清單失敗:', error);
            this.storageLoadFailed = true;
        }
        
        this.lists = Object.create(null);
    }

    /**
     * 儲存清單到本地儲存
     */
    saveToStorage(lists = this.lists) {
        const data = {
            version: ListManager.CONSTANTS.STORAGE_VERSION,
            lastUpdated: new Date().toISOString(),
            lists
        };
        
        try {
            localStorage.setItem(ListManager.CONSTANTS.STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('儲存清單失敗:', error);
            throw new Error('無法儲存清單');
        }
    }

    /**
     * 取得所有清單
     * @returns {Array} 清單陣列
     */
    getAllLists() {
        return Object.values(this.lists).sort((a, b) => {
            // 預設清單永遠排第一
            if (a.id === ListManager.CONSTANTS.DEFAULT_LIST_ID) return -1;
            if (b.id === ListManager.CONSTANTS.DEFAULT_LIST_ID) return 1;
            // 其他按建立時間排序
            return new Date(a.createdAt) - new Date(b.createdAt);
        });
    }

    /**
     * 取得特定清單
     * @param {string} listId - 清單 ID
     * @returns {Object|null} 清單物件
     */
    getList(listId) {
        return this.lists[listId] || null;
    }

    /**
     * 建立新清單
     * @param {string} name - 清單名稱
     * @returns {Object} 結果物件
     */
    createList(name) {
        // 檢查清單數量限制
        if (Object.keys(this.lists).length >= ListManager.CONSTANTS.MAX_LISTS) {
            const message = FF14Utils.getI18nText(
                'maxListsWarning',
                'Maximum of {max} lists allowed',
                { max: ListManager.CONSTANTS.MAX_LISTS }
            );
            return {
                success: false,
                message: message
            };
        }
        
        // 驗證名稱
        if (!name || name.trim().length === 0) {
            const message = FF14Utils.getI18nText('listNameEmpty', 'List name cannot be empty');
            return {
                success: false,
                message: message
            };
        }
        
        if (name.length > ListManager.CONSTANTS.MAX_LIST_NAME_LENGTH) {
            const message = FF14Utils.getI18nText(
                'listNameTooLong',
                'List name cannot exceed {max} characters',
                { max: ListManager.CONSTANTS.MAX_LIST_NAME_LENGTH }
            );
            return {
                success: false,
                message: message
            };
        }
        
        // 檢查名稱是否重複
        const isDuplicate = Object.values(this.lists).some(list => list.name === name);
        if (isDuplicate) {
            const message = FF14Utils.getI18nText('listNameExists', 'List name already exists');
            return {
                success: false,
                message: message
            };
        }
        
        // 建立新清單
        const listId = this.generateListId();
        this.lists[listId] = {
            id: listId,
            name: name.trim(),
            items: [],
            isPlaceholder: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.saveToStorage();
        
        return {
            success: true,
            listId: listId,
            message: '清單建立成功'
        };
    }

    /**
     * 重新命名清單
     * @param {string} listId - 清單 ID
     * @param {string} newName - 新名稱
     * @returns {Object} 結果物件
     */
    renameList(listId, newName) {
        const list = this.lists[listId];
        
        if (!list) {
            return {
                success: false,
                message: '清單不存在'
            };
        }
        
        // 驗證名稱
        if (!newName || newName.trim().length === 0) {
            return {
                success: false,
                message: '清單名稱不能為空'
            };
        }
        
        if (newName.length > ListManager.CONSTANTS.MAX_LIST_NAME_LENGTH) {
            return {
                success: false,
                message: `清單名稱不能超過 ${ListManager.CONSTANTS.MAX_LIST_NAME_LENGTH} 個字元`
            };
        }
        
        // 檢查名稱是否重複
        const isDuplicate = Object.values(this.lists).some(
            l => l.id !== listId && l.name === newName
        );
        if (isDuplicate) {
            return {
                success: false,
                message: '清單名稱已存在'
            };
        }
        
        list.name = newName.trim();
        list.isPlaceholder = false;
        list.updatedAt = new Date().toISOString();
        this.saveToStorage();
        
        return {
            success: true,
            message: '清單重新命名成功'
        };
    }

    /**
     * 刪除清單
     * @param {string} listId - 清單 ID
     * @returns {Object} 結果物件
     */
    deleteList(listId) {
        // 確保至少保留一個清單
        if (Object.keys(this.lists).length <= 1) {
            return {
                success: false,
                message: '至少需要保留一個清單'
            };
        }
        
        if (!this.lists[listId]) {
            return {
                success: false,
                message: '清單不存在'
            };
        }
        
        delete this.lists[listId];
        this.saveToStorage();
        
        // 如果刪除了所有清單，建立預設清單
        if (Object.keys(this.lists).length === 0) {
            this.createDefaultList();
        }
        
        return {
            success: true,
            message: '清單刪除成功'
        };
    }

    /**
     * 清空清單
     * @param {string} listId - 清單 ID
     * @returns {Object} 結果物件
     */
    clearList(listId) {
        const list = this.lists[listId];
        
        if (!list) {
            return {
                success: false,
                message: '清單不存在'
            };
        }
        
        list.items = [];
        list.isPlaceholder = false;
        list.updatedAt = new Date().toISOString();
        this.saveToStorage();
        
        return {
            success: true,
            message: '清單已清空'
        };
    }

    /**
     * 新增項目到清單
     * @param {string} listId - 清單 ID
     * @param {Object} item - 項目物件
     * @returns {Object} 結果物件
     */
    addToList(listId, item) {
        const list = this.lists[listId];
        
        if (!list) {
            return {
                success: false,
                message: '清單不存在'
            };
        }
        
        // 檢查項目數量限制
        if (list.items.length >= ListManager.CONSTANTS.MAX_ITEMS_PER_LIST) {
            return {
                success: false,
                message: FF14Utils.getI18nText(
                    'listMaxItems',
                    'List can contain maximum of {max} items',
                    { max: ListManager.CONSTANTS.MAX_ITEMS_PER_LIST }
                )
            };
        }
        
        // 檢查是否已存在
        if (list.items.some(i => i.id === item.id)) {
            return {
                success: false,
                message: FF14Utils.getI18nText('itemAlreadyInListSimple', 'This item is already in the list')
            };
        }
        
        // 新增項目（保存所有語言版本的資料）
        list.items.push({
            id: item.id,
            name: item.name,
            nameJp: item.nameJp,
            nameEn: item.nameEn,
            type: item.type,
            level: item.level,
            zone: item.zone,
            zoneJp: item.zoneJp,
            zoneEn: item.zoneEn,
            location: item.location,
            locationJp: item.locationJp,
            locationEn: item.locationEn,
            coordinates: item.coordinates,
            time: item.time,
            duration: item.duration,
            macroFormat: item.macroFormat,
            expansion: item.expansion,
            description: item.description,
            addedAt: new Date().toISOString()
        });
        
        list.isPlaceholder = false;
        list.updatedAt = new Date().toISOString();
        this.saveToStorage();
        
        return {
            success: true,
            message: '項目新增成功'
        };
    }

    /**
     * 從清單移除項目
     * @param {string} listId - 清單 ID
     * @param {string} itemId - 項目 ID
     * @returns {Object} 結果物件
     */
    removeFromList(listId, itemId) {
        const list = this.lists[listId];
        
        if (!list) {
            return {
                success: false,
                message: '清單不存在'
            };
        }
        
        const index = list.items.findIndex(item => item.id === itemId);
        
        if (index === -1) {
            return {
                success: false,
                message: '項目不在清單中'
            };
        }
        
        list.items.splice(index, 1);
        list.isPlaceholder = false;
        list.updatedAt = new Date().toISOString();
        this.saveToStorage();
        
        return {
            success: true,
            message: '項目移除成功'
        };
    }

    /**
     * 檢查項目是否在特定清單中
     * @param {string} listId - 清單 ID
     * @param {string} itemId - 項目 ID
     * @returns {boolean}
     */
    hasInCurrentList(listId, itemId) {
        const list = this.lists[listId];
        if (!list) return false;
        return list.items.some(item => item.id === itemId);
    }

    /**
     * 移動項目順序
     * @param {string} listId - 清單 ID
     * @param {number} fromIndex - 原始位置
     * @param {number} toIndex - 目標位置
     * @returns {Object} 結果物件
     */
    moveItem(listId, fromIndex, toIndex) {
        const list = this.lists[listId];
        
        if (!list) {
            return {
                success: false,
                message: '清單不存在'
            };
        }
        
        if (fromIndex < 0 || fromIndex >= list.items.length ||
            toIndex < 0 || toIndex >= list.items.length) {
            return {
                success: false,
                message: '索引超出範圍'
            };
        }
        
        const item = list.items.splice(fromIndex, 1)[0];
        list.items.splice(toIndex, 0, item);
        
        list.isPlaceholder = false;
        list.updatedAt = new Date().toISOString();
        this.saveToStorage();
        
        return {
            success: true,
            message: '項目順序已更新'
        };
    }

    /**
     * 匯出清單
     * @returns {Object} 匯出資料
     */
    exportLists() {
        return {
            version: ListManager.CONSTANTS.STORAGE_VERSION,
            exportedAt: new Date().toISOString(),
            lists: this.lists
        };
    }

    /**
     * 匯入清單
     * @param {Object} data - 匯入資料
     * @returns {Object} 結果物件
     */
    importLists(data) {
        const incoming = ListManager.parseBackup(data);
        if (!incoming) {
            return { success: false, message: FF14Utils.getI18nText('invalidImportFormat', '匯入的資料格式不正確') };
        }
        const currentLists = Object.assign(Object.create(null), this.lists);
        const defaultList = currentLists[ListManager.CONSTANTS.DEFAULT_LIST_ID];
        // A new browser starts with an empty placeholder; it must not prevent restoring ten lists.
        if (Object.keys(incoming).length > 0 && Object.keys(currentLists).length === 1 &&
            defaultList?.items.length === 0 && defaultList.isPlaceholder) {
            delete currentLists[ListManager.CONSTANTS.DEFAULT_LIST_ID];
        }
        if (Object.keys(currentLists).length + Object.keys(incoming).length > ListManager.CONSTANTS.MAX_LISTS) {
            return {
                success: false,
                message: FF14Utils.getI18nText('maxListsWarning', '最多只能建立 {max} 個清單', { max: ListManager.CONSTANTS.MAX_LISTS })
            };
        }

        // Stage the complete merge so validation or storage failures cannot partially import a backup.
        const merged = currentLists;
        for (const [id, importedList] of Object.entries(incoming)) {
            let newListId = id;
            if (Object.hasOwn(merged, newListId)) newListId = this.generateListId(merged);
            const listName = ListManager.uniqueListName(importedList.name, new Set(Object.values(merged).map(list => list.name)));
            merged[newListId] = { ...importedList, id: newListId, name: listName, isPlaceholder: false, updatedAt: new Date().toISOString() };
        }
        try {
            this.saveToStorage(merged);
        } catch (error) {
            return { success: false, message: FF14Utils.getI18nText('listSaveFailed', '無法儲存清單，原有清單未變更') };
        }
        this.lists = merged;
        const importedCount = Object.keys(incoming).length;
        return {
            success: true,
            count: importedCount,
            message: FF14Utils.getI18nText('successImportedLists', '成功匯入 {count} 個清單', { count: importedCount })
        };
    }

    /**
     * 生成唯一清單 ID
     * @returns {string} 清單 ID
     */
    generateListId(lists = this.lists) {
        let id;
        do {
            id = 'list_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        } while (Object.hasOwn(lists, id));
        return id;
    }

    /**
     * 複製清單
     * @param {string} listId - 來源清單 ID
     * @param {string} newName - 新清單名稱
     * @returns {Object} 結果物件
     */
    duplicateList(listId, newName) {
        const sourceList = this.lists[listId];
        
        if (!sourceList) {
            return {
                success: false,
                message: '來源清單不存在'
            };
        }
        
        // 使用 createList 建立新清單
        const result = this.createList(newName || `${sourceList.name} (複製)`);
        
        if (!result.success) {
            return result;
        }
        
        // 複製項目
        const newList = this.lists[result.listId];
        newList.items = sourceList.items.map(item => ({
            ...item,
            addedAt: new Date().toISOString()
        }));
        
        this.saveToStorage();
        
        return {
            success: true,
            listId: result.listId,
            message: '清單複製成功'
        };
    }

    /**
     * 合併清單
     * @param {string} targetListId - 目標清單 ID
     * @param {string} sourceListId - 來源清單 ID
     * @returns {Object} 結果物件
     */
    mergeLists(targetListId, sourceListId) {
        const targetList = this.lists[targetListId];
        const sourceList = this.lists[sourceListId];
        
        if (!targetList || !sourceList) {
            return {
                success: false,
                message: '清單不存在'
            };
        }
        
        let addedCount = 0;
        
        for (const item of sourceList.items) {
            // 檢查是否已存在
            if (!targetList.items.some(i => i.id === item.id)) {
                // 檢查數量限制
                if (targetList.items.length >= ListManager.CONSTANTS.MAX_ITEMS_PER_LIST) {
                    break;
                }
                
                targetList.items.push({
                    ...item,
                    addedAt: new Date().toISOString()
                });
                addedCount++;
            }
        }
        
        targetList.isPlaceholder = false;
        targetList.updatedAt = new Date().toISOString();
        this.saveToStorage();
        
        return {
            success: true,
            addedCount: addedCount,
            message: FF14Utils.getI18nText(
                'addedItemsToList',
                'Added {count} items to target list',
                { count: addedCount }
            )
        };
    }
}
