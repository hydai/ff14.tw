// 寶圖搜尋器
class TreasureMapFinder {
    constructor() {
        this.data = null;
        this.maps = [];
        this.filteredMaps = [];
        this.myList = this.loadFromStorage();
        this.myListIds = new Set(this.myList.map(item => item.id)); // 優化查找效能
        this.filters = {
            levels: new Set(),
            zones: new Set()
        };
        this.displayCount = 24;
        this.currentDisplayCount = 0;
        this.zoneTranslations = null; // 地區翻譯資料
        
        // DOM 元素快取
        this.elements = {
            treasureGrid: document.getElementById('treasureGrid'),
            resultCount: document.getElementById('resultCount'),
            listCount: document.getElementById('listCount'),
            totalCount: document.getElementById('totalCount'),
            myListToggle: document.getElementById('myListToggle'),
            myListPanel: document.getElementById('myListPanel'),
            listContent: document.getElementById('listContent'),
            clearAllBtn: document.getElementById('clearAllBtn'),
            loadMore: document.getElementById('loadMore')
        };
        
        this.init();
    }
    
    async init() {
        try {
            await Promise.all([
                this.loadData(),
                this.loadTranslations()
            ]);
            this.setupEventListeners();
            this.updateListCount();
            this.applyFilters();
        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError('載入寶圖資料失敗，請重新整理頁面再試。');
        }
    }
    
    async loadTranslations() {
        try {
            const response = await fetch('../../data/zone-translations.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.zoneTranslations = await response.json();
        } catch (error) {
            console.error('載入翻譯資料失敗:', error);
            this.zoneTranslations = {}; // 失敗時使用空物件
        }
    }
    
    async loadData() {
        this.showLoading(true);
        try {
            const response = await fetch('../../data/treasure-maps.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.data = await response.json();
            this.maps = this.data.maps;
        } catch (error) {
            console.error('載入資料失敗:', error);
            throw error;
        } finally {
            this.showLoading(false);
        }
    }
    
    setupEventListeners() {
        // 篩選標籤
        document.querySelectorAll('.filter-tag').forEach(tag => {
            tag.addEventListener('click', (e) => this.handleFilterClick(e));
        });
        
        // 重置篩選按鈕
        document.getElementById('resetFilters').addEventListener('click', () => this.resetFilters());
        
        // 我的清單
        this.elements.myListToggle.addEventListener('click', () => this.toggleListPanel());
        this.elements.clearAllBtn.addEventListener('click', () => this.clearAllMaps());
        
        // 關閉面板按鈕
        const closePanelBtn = document.getElementById('closePanelBtn');
        if (closePanelBtn) {
            closePanelBtn.addEventListener('click', () => this.toggleListPanel());
        }
        
        // 匯出/匯入功能
        document.getElementById('exportListBtn').addEventListener('click', () => this.exportList());
        document.getElementById('importListBtn').addEventListener('click', () => this.showImportDialog());
        document.getElementById('importFileInput').addEventListener('change', (e) => this.importList(e));
        
        // 載入更多
        this.elements.loadMore.querySelector('button').addEventListener('click', () => this.loadMoreMaps());
        
        // ESC 鍵關閉清單面板
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.myListPanel.classList.contains('active')) {
                this.toggleListPanel();
            }
        });
        
        // 點擊遮罩關閉
        const overlay = document.getElementById('panelOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.toggleListPanel());
        }
        
        // 路線生成按鈕
        const generateRouteBtn = document.getElementById('generateRouteBtn');
        if (generateRouteBtn) {
            generateRouteBtn.addEventListener('click', () => this.generateRoute());
        }
        
        // 關閉路線面板
        const closeRoutePanelBtn = document.getElementById('closeRoutePanelBtn');
        if (closeRoutePanelBtn) {
            closeRoutePanelBtn.addEventListener('click', () => this.closeRoutePanel());
        }
    }
    
    handleFilterClick(e) {
        const tag = e.target;
        const isLevel = tag.hasAttribute('data-level');
        const value = isLevel ? tag.dataset.level : tag.dataset.zone;
        const filterSet = isLevel ? this.filters.levels : this.filters.zones;
        
        if (filterSet.has(value)) {
            filterSet.delete(value);
            tag.classList.remove('active');
        } else {
            filterSet.add(value);
            tag.classList.add('active');
        }
        
        this.applyFilters();
    }
    
    applyFilters() {
        this.filteredMaps = this.maps.filter(map => {
            const levelMatch = this.filters.levels.size === 0 || 
                             this.filters.levels.has(map.level);
            const zoneMatch = this.filters.zones.size === 0 || 
                            this.filters.zones.has(map.zoneId);
            return levelMatch && zoneMatch;
        });
        
        this.currentDisplayCount = 0;
        this.displayMaps();
    }
    
    resetFilters() {
        // 清除所有篩選
        this.filters.levels.clear();
        this.filters.zones.clear();
        
        // 移除所有 active 類別
        document.querySelectorAll('.filter-tag.active').forEach(tag => {
            tag.classList.remove('active');
        });
        
        // 重新套用篩選
        this.applyFilters();
        FF14Utils.showToast('已重置所有篩選條件', 'info');
    }
    
    displayMaps() {
        const start = this.currentDisplayCount;
        const end = Math.min(start + this.displayCount, this.filteredMaps.length);
        
        if (start === 0) {
            this.elements.treasureGrid.innerHTML = '';
        }
        
        for (let i = start; i < end; i++) {
            const map = this.filteredMaps[i];
            this.elements.treasureGrid.appendChild(this.createMapCard(map));
        }
        
        this.currentDisplayCount = end;
        this.updateResultCount();
        
        // 顯示或隱藏載入更多按鈕
        if (this.currentDisplayCount < this.filteredMaps.length) {
            this.elements.loadMore.style.display = 'block';
        } else {
            this.elements.loadMore.style.display = 'none';
        }
    }
    
    // HTML 編碼函數
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    createMapCard(map) {
        const card = document.createElement('div');
        card.className = 'treasure-card';
        card.dataset.mapId = map.id;
        
        const isInList = this.myListIds.has(map.id);
        
        // 建立圖片容器
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'card-image-wrapper';
        
        const img = document.createElement('img');
        img.src = map.thumbnail;
        img.alt = map.levelName;
        img.loading = 'lazy';
        img.onerror = function() {
            this.src = '/assets/images/treasure-map-placeholder.png';
        };
        imageWrapper.appendChild(img);
        
        const levelBadge = document.createElement('span');
        levelBadge.className = 'map-level-badge';
        levelBadge.textContent = map.level.toUpperCase();
        imageWrapper.appendChild(levelBadge);
        
        // 建立內容區域
        const content = document.createElement('div');
        content.className = 'card-content';
        
        const zoneTitle = document.createElement('div');
        zoneTitle.className = 'map-zone';
        
        // 取得翻譯資料
        const translations = this.zoneTranslations[map.zone] || {};
        
        // 建立多語言顯示
        if (translations.zh || translations.en || translations.ja) {
            const zhSpan = document.createElement('div');
            zhSpan.className = 'zone-zh';
            zhSpan.textContent = translations.zh || map.zone;
            zoneTitle.appendChild(zhSpan);
            
            const enSpan = document.createElement('div');
            enSpan.className = 'zone-en';
            enSpan.textContent = translations.en || map.zone;
            zoneTitle.appendChild(enSpan);
            
            const jaSpan = document.createElement('div');
            jaSpan.className = 'zone-ja';
            jaSpan.textContent = translations.ja || '';
            zoneTitle.appendChild(jaSpan);
        } else {
            // 沒有翻譯資料時使用原始名稱
            zoneTitle.textContent = map.zone;
        }
        
        content.appendChild(zoneTitle);
        
        const coords = document.createElement('p');
        coords.className = 'map-coords';
        coords.textContent = `X: ${map.coords.x} Y: ${map.coords.y} Z: ${map.coords.z || 0}`;
        content.appendChild(coords);
        
        // 建立按鈕區域
        const actions = document.createElement('div');
        actions.className = 'card-actions';
        
        // 複製座標按鈕
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-secondary btn-sm btn-copy-coords';
        copyBtn.title = '複製座標指令';
        copyBtn.innerHTML = '<span class="btn-icon">📍</span> 複製座標';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyCoordinates(map);
        });
        actions.appendChild(copyBtn);
        
        // 加入清單按鈕
        const addBtn = document.createElement('button');
        addBtn.className = `btn ${isInList ? 'btn-success' : 'btn-primary'} btn-sm btn-add-to-list`;
        addBtn.dataset.state = isInList ? 'added' : 'default';
        addBtn.innerHTML = `<span class="btn-text">${isInList ? '✓ 已加入' : '加入清單'}</span>`;
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMapInList(map);
        });
        actions.appendChild(addBtn);
        
        content.appendChild(actions);
        
        // 組合卡片
        card.appendChild(imageWrapper);
        card.appendChild(content);
        
        return card;
    }
    
    toggleMapInList(map) {
        if (this.myListIds.has(map.id)) {
            // 從清單移除
            this.myList = this.myList.filter(item => item.id !== map.id);
            this.myListIds.delete(map.id);
            FF14Utils.showToast('已從清單移除', 'info');
        } else {
            // 加入清單
            const mapData = {
                id: map.id,
                level: map.level,
                levelName: map.levelName,
                zone: map.zone,
                coords: map.coords,
                thumbnail: map.thumbnail,
                addedAt: new Date().toISOString()
            };
            this.myList.push(mapData);
            this.myListIds.add(map.id);
            FF14Utils.showToast('已加入清單', 'success');
        }
        
        this.saveToStorage();
        this.updateListCount();
        this.updateCardButtons();
        this.renderMyList();
    }
    
    updateCardButtons() {
        document.querySelectorAll('.treasure-card').forEach(card => {
            const mapId = card.dataset.mapId;
            const button = card.querySelector('.btn-add-to-list');
            const isInList = this.myListIds.has(mapId);
            
            button.dataset.state = isInList ? 'added' : 'default';
            button.className = `btn ${isInList ? 'btn-success' : 'btn-primary'} btn-sm btn-add-to-list`;
            button.querySelector('.btn-text').textContent = isInList ? '✓ 已加入' : '加入清單';
        });
    }
    
    copyCoordinates(map) {
        const coords = map.coords;
        const command = `/pos ${coords.x} ${coords.y} ${coords.z || 0}`;
        
        navigator.clipboard.writeText(command).then(() => {
            FF14Utils.showToast('座標指令已複製', 'success');
        }).catch(err => {
            console.error('複製失敗:', err);
            FF14Utils.showToast('複製失敗', 'error');
        });
    }
    
    toggleListPanel() {
        const isActive = this.elements.myListPanel.classList.contains('active');
        const overlay = document.getElementById('panelOverlay');
        
        if (!isActive) {
            // 開啟面板
            this.elements.myListPanel.classList.add('active');
            overlay.classList.add('active');
            this.renderMyList();
            document.body.style.overflow = 'hidden';
        } else {
            // 關閉面板
            this.elements.myListPanel.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    renderMyList() {
        // 清空內容
        this.elements.listContent.innerHTML = '';
        
        if (this.myList.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            
            const emptyText = document.createElement('p');
            emptyText.textContent = '清單是空的';
            emptyState.appendChild(emptyText);
            
            const hintText = document.createElement('p');
            hintText.className = 'text-secondary';
            hintText.textContent = '點擊寶圖卡片上的「加入清單」開始建立';
            emptyState.appendChild(hintText);
            
            this.elements.listContent.appendChild(emptyState);
            return;
        }
        
        // 建立清單項目
        this.myList.forEach(item => {
            const listItem = document.createElement('div');
            listItem.className = 'list-item';
            listItem.dataset.mapId = item.id;
            
            // 圖片
            const img = document.createElement('img');
            img.src = item.thumbnail;
            img.alt = item.levelName;
            img.onerror = function() {
                this.src = '/assets/images/treasure-map-placeholder.png';
            };
            listItem.appendChild(img);
            
            // 資訊區域
            const itemInfo = document.createElement('div');
            itemInfo.className = 'item-info';
            
            const levelSpan = document.createElement('span');
            levelSpan.className = 'item-level';
            levelSpan.textContent = item.level.toUpperCase();
            itemInfo.appendChild(levelSpan);
            
            const zoneSpan = document.createElement('span');
            zoneSpan.className = 'item-zone';
            
            // 使用多語言顯示
            const translations = this.zoneTranslations[item.zone] || {};
            if (translations.zh) {
                zoneSpan.textContent = translations.zh;
                zoneSpan.title = `${translations.en || item.zone} / ${translations.ja || ''}`;
            } else {
                zoneSpan.textContent = item.zone;
            }
            
            itemInfo.appendChild(zoneSpan);
            
            const coordsSpan = document.createElement('span');
            coordsSpan.className = 'item-coords';
            coordsSpan.textContent = `(${item.coords.x}, ${item.coords.y}, ${item.coords.z || 0})`;
            itemInfo.appendChild(coordsSpan);
            
            listItem.appendChild(itemInfo);
            
            // 移除按鈕
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove';
            removeBtn.dataset.mapId = item.id;
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', (e) => {
                this.removeFromList(item.id);
            });
            listItem.appendChild(removeBtn);
            
            this.elements.listContent.appendChild(listItem);
        });
    }
    
    removeFromList(mapId) {
        if (confirm('確定要移除這張寶圖嗎？')) {
            this.myList = this.myList.filter(item => item.id !== mapId);
            this.myListIds.delete(mapId);
            this.saveToStorage();
            this.updateListCount();
            this.updateCardButtons();
            this.renderMyList();
            FF14Utils.showToast('已從清單移除', 'info');
        }
    }
    
    clearAllMaps() {
        if (this.myList.length === 0) {
            FF14Utils.showToast('清單已經是空的', 'info');
            return;
        }
        
        if (confirm(`確定要清空所有寶圖嗎？共 ${this.myList.length} 張`)) {
            this.myList = [];
            this.myListIds.clear();
            this.saveToStorage();
            this.updateListCount();
            this.updateCardButtons();
            this.renderMyList();
            FF14Utils.showToast('已清空清單', 'success');
        }
    }
    
    loadMoreMaps() {
        this.displayMaps();
    }
    
    updateResultCount() {
        this.elements.resultCount.textContent = 
            `顯示 ${this.currentDisplayCount} / ${this.filteredMaps.length} 個結果`;
    }
    
    updateListCount() {
        this.elements.listCount.textContent = `(${this.myList.length})`;
        this.elements.totalCount.textContent = this.myList.length;
        
        // 更新生成路線按鈕狀態
        const generateRouteBtn = document.getElementById('generateRouteBtn');
        if (generateRouteBtn) {
            generateRouteBtn.disabled = this.myList.length < 2;
        }
    }
    
    saveToStorage() {
        const data = {
            version: '1.0',
            lastUpdated: new Date().toISOString(),
            maps: this.myList
        };
        localStorage.setItem('ff14tw_treasure_map_list', JSON.stringify(data));
    }
    
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('ff14tw_treasure_map_list');
            if (stored) {
                const data = JSON.parse(stored);
                if (data.version === '1.0') {
                    return data.maps || [];
                }
            }
        } catch (error) {
            console.error('載入儲存資料失敗:', error);
        }
        return [];
    }
    
    showLoading(show) {
        if (show) {
            this.elements.treasureGrid.innerHTML = '';
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading';
            loadingDiv.textContent = '載入中...';
            this.elements.treasureGrid.appendChild(loadingDiv);
        }
    }
    
    showError(message) {
        this.elements.treasureGrid.innerHTML = '';
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        const reloadBtn = document.createElement('button');
        reloadBtn.className = 'btn btn-primary';
        reloadBtn.textContent = '重新載入';
        reloadBtn.addEventListener('click', () => location.reload());
        
        errorDiv.appendChild(document.createElement('br'));
        errorDiv.appendChild(reloadBtn);
        this.elements.treasureGrid.appendChild(errorDiv);
    }
    
    // 驗證地圖資料
    validateMapData(map) {
        if (!map || typeof map !== 'object') return false;
        
        // 必要欄位
        if (!map.id || typeof map.id !== 'string') return false;
        if (!map.level || typeof map.level !== 'string') return false;
        if (!map.zone || typeof map.zone !== 'string') return false;
        if (!map.coords || typeof map.coords !== 'object') return false;
        
        // 座標驗證
        if (typeof map.coords.x !== 'number' || typeof map.coords.y !== 'number') return false;
        if (map.coords.x < 0 || map.coords.x > 50 || map.coords.y < 0 || map.coords.y > 50) return false;
        
        return true;
    }
    
    // 清理地圖資料
    sanitizeMapData(map) {
        return {
            id: String(map.id).substring(0, 50),
            level: String(map.level).substring(0, 10),
            levelName: map.levelName ? String(map.levelName).substring(0, 50) : '',
            zone: String(map.zone).substring(0, 50),
            coords: {
                x: Number(map.coords.x),
                y: Number(map.coords.y),
                z: map.coords.z ? Number(map.coords.z) : 0
            },
            thumbnail: map.thumbnail || '/assets/images/treasure-map-placeholder.png',
            addedAt: map.addedAt || new Date().toISOString()
        };
    }
    
    // 匯出清單功能（複製到剪貼簿）
    exportList() {
        if (this.myList.length === 0) {
            FF14Utils.showToast('清單是空的，無法匯出', 'warning');
            return;
        }
        
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            appName: 'FF14.tw 寶圖搜尋器',
            totalMaps: this.myList.length,
            maps: this.myList.map(map => ({
                id: map.id,
                level: map.level,
                levelName: map.levelName,
                zone: map.zone,
                coords: map.coords
            }))
        };
        
        // 轉換為 JSON 字串
        const jsonString = JSON.stringify(exportData);
        
        // 複製到剪貼簿
        navigator.clipboard.writeText(jsonString).then(() => {
            FF14Utils.showToast(`已複製 ${this.myList.length} 張寶圖清單到剪貼簿`, 'success');
        }).catch(err => {
            console.error('複製失敗:', err);
            // 備用方案：顯示可複製的文字框
            this.showExportDialog(jsonString);
        });
    }
    
    // 顯示匯出對話框（備用方案）
    showExportDialog(jsonString) {
        const dialog = document.createElement('div');
        dialog.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; max-width: 500px; width: 90%;';
        
        const title = document.createElement('h3');
        title.style.margin = '0 0 10px 0';
        title.textContent = '匯出清單';
        dialog.appendChild(title);
        
        const instruction = document.createElement('p');
        instruction.style.marginBottom = '10px';
        instruction.textContent = '請複製以下內容：';
        dialog.appendChild(instruction);
        
        const textarea = document.createElement('textarea');
        textarea.style.cssText = 'width: 100%; height: 200px; margin-bottom: 10px; font-family: monospace; font-size: 12px;';
        textarea.readOnly = true;
        textarea.value = jsonString;
        dialog.appendChild(textarea);
        
        const buttonDiv = document.createElement('div');
        buttonDiv.style.textAlign = 'right';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn btn-primary';
        closeBtn.textContent = '關閉';
        closeBtn.addEventListener('click', () => dialog.remove());
        buttonDiv.appendChild(closeBtn);
        
        dialog.appendChild(buttonDiv);
        document.body.appendChild(dialog);
        
        textarea.select();
    }
    
    // 顯示匯入對話框
    showImportDialog() {
        const dialog = document.createElement('div');
        dialog.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; max-width: 500px; width: 90%;';
        
        const title = document.createElement('h3');
        title.style.margin = '0 0 10px 0';
        title.textContent = '匯入清單';
        dialog.appendChild(title);
        
        const instruction = document.createElement('p');
        instruction.style.marginBottom = '10px';
        instruction.textContent = '請貼上匯出的清單內容：';
        dialog.appendChild(instruction);
        
        const textarea = document.createElement('textarea');
        textarea.id = 'importTextarea';
        textarea.style.cssText = 'width: 100%; height: 200px; margin-bottom: 10px; font-family: monospace; font-size: 12px;';
        textarea.placeholder = '在此貼上清單資料...';
        dialog.appendChild(textarea);
        
        const buttonDiv = document.createElement('div');
        buttonDiv.style.cssText = 'text-align: right; display: flex; gap: 10px; justify-content: flex-end;';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => dialog.remove());
        buttonDiv.appendChild(cancelBtn);
        
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.textContent = '匯入';
        confirmBtn.addEventListener('click', () => {
            const text = textarea.value;
            this.importFromText(text);
            dialog.remove();
        });
        buttonDiv.appendChild(confirmBtn);
        
        dialog.appendChild(buttonDiv);
        document.body.appendChild(dialog);
        
        // 自動聚焦到文字框
        textarea.focus();
    }
    
    // 從文字匯入清單
    async importFromText(text) {
        if (!text.trim()) {
            FF14Utils.showToast('請貼上清單內容', 'warning');
            return;
        }
        
        try {
            const data = JSON.parse(text);
            
            // 驗證資料格式
            if (!data.version || !data.maps || !Array.isArray(data.maps)) {
                throw new Error('無效的清單格式');
            }
            
            // 驗證版本
            if (data.version !== '1.0') {
                throw new Error('不支援的清單版本');
            }
            
            // 驗證每個地圖項目
            const validatedMaps = [];
            for (const map of data.maps) {
                if (!this.validateMapData(map)) {
                    console.warn('跳過無效的地圖資料:', map);
                    continue;
                }
                validatedMaps.push(this.sanitizeMapData(map));
            }
            
            if (validatedMaps.length === 0) {
                throw new Error('沒有有效的地圖資料');
            }
            
            // 確認是否要合併或取代
            let action = 'replace';
            
            if (this.myList.length > 0) {
                const confirmMessage = `目前清單有 ${this.myList.length} 張寶圖。\n` +
                    `要匯入的清單包含 ${validatedMaps.length} 張寶圖。\n\n` +
                    `選擇「確定」將合併清單（避免重複）\n` +
                    `選擇「取消」將取代現有清單`;
                
                action = confirm(confirmMessage) ? 'merge' : 'replace';
            }
            
            if (action === 'merge') {
                // 合併清單，避免重複
                const newMaps = validatedMaps.filter(map => !this.myListIds.has(map.id));
                
                this.myList = [...this.myList, ...newMaps];
                newMaps.forEach(map => this.myListIds.add(map.id));
                FF14Utils.showToast(`已合併匯入 ${newMaps.length} 張新寶圖`, 'success');
            } else {
                // 取代清單
                this.myList = validatedMaps;
                this.myListIds = new Set(validatedMaps.map(m => m.id));
                FF14Utils.showToast(`已匯入 ${validatedMaps.length} 張寶圖`, 'success');
            }
            
            // 更新儲存和UI
            this.saveToStorage();
            this.updateListCount();
            this.updateCardButtons();
            this.renderMyList();
            
        } catch (error) {
            console.error('匯入失敗:', error);
            FF14Utils.showToast('匯入失敗：' + error.message, 'error');
        }
    }
    
    // 匯入清單功能（從檔案）
    async importList(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            this.importFromText(text);
        } catch (error) {
            console.error('讀取檔案失敗:', error);
            FF14Utils.showToast('讀取檔案失敗', 'error');
        }
        
        // 清空檔案輸入
        event.target.value = '';
    }
    
    // 生成路線
    async generateRoute() {
        if (this.myList.length < 2) {
            FF14Utils.showToast('至少需要 2 張寶圖才能生成路線', 'error');
            return;
        }
        
        // 等待 routeCalculator 載入完成
        if (!routeCalculator || !routeCalculator.aetherytes) {
            FF14Utils.showToast('正在載入傳送點資料，請稍後再試', 'info');
            // 等待一下再試
            setTimeout(() => {
                if (routeCalculator && routeCalculator.aetherytes) {
                    this.generateRoute();
                }
            }, 1000);
            return;
        }
        
        // 計算路線
        const result = routeCalculator.calculateRoute(this.myList, this.zoneTranslations);
        
        if (!result || !result.route || result.route.length === 0) {
            FF14Utils.showToast('無法生成路線', 'error');
            return;
        }
        
        // 顯示路線結果
        this.showRouteResult(result);
    }
    
    // 顯示路線結果
    showRouteResult(result) {
        const routePanel = document.getElementById('routePanel');
        const routeSummary = document.getElementById('routeSummary');
        const routeSteps = document.getElementById('routeSteps');
        
        // 生成摘要
        const regionsText = result.summary.regionsVisited
            .map(zone => this.getZoneName(zone))
            .join('、');
        
        routeSummary.innerHTML = `
            <p>總計：${result.summary.totalMaps} 張寶圖 | 
               傳送次數：${result.summary.totalTeleports} 次 | 
               訪問地區：${regionsText}</p>
        `;
        
        // 生成步驟
        routeSteps.innerHTML = '';
        result.route.forEach((step, index) => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'route-step';
            
            if (step.type === 'teleport') {
                const aetheryteNames = this.getAetheryteName(step.to);
                stepDiv.innerHTML = `
                    <span class="step-icon">🔄</span>
                    <span class="step-text">傳送至 ${aetheryteNames.zh || step.to.zh || step.to}</span>
                    <span class="step-coords">(${step.coords.x}, ${step.coords.y})</span>
                `;
            } else {
                stepDiv.innerHTML = `
                    <span class="step-icon">📍</span>
                    <span class="step-text">${step.mapLevel || ''} - ${this.getZoneName(step.zone)}</span>
                    <span class="step-coords">(${step.coords.x}, ${step.coords.y}, ${step.coords.z || 0})</span>
                `;
            }
            
            // 點擊複製座標
            stepDiv.addEventListener('click', () => {
                const command = `/pos ${step.coords.x} ${step.coords.y} ${step.coords.z || 0}`;
                navigator.clipboard.writeText(command).then(() => {
                    FF14Utils.showToast('座標指令已複製', 'success');
                });
            });
            
            routeSteps.appendChild(stepDiv);
        });
        
        // 顯示面板
        routePanel.classList.add('active');
    }
    
    // 關閉路線面板
    closeRoutePanel() {
        const routePanel = document.getElementById('routePanel');
        routePanel.classList.remove('active');
    }
    
    // 取得地區名稱
    getZoneName(zoneId) {
        if (!this.zoneTranslations || !this.zoneTranslations[zoneId]) {
            return zoneId;
        }
        return this.zoneTranslations[zoneId].zh || zoneId;
    }
    
    // 取得傳送點名稱
    getAetheryteName(aetheryteData) {
        // 如果是物件格式（包含多語言）
        if (typeof aetheryteData === 'object' && aetheryteData !== null) {
            return aetheryteData;
        }
        // 如果是字串，返回包裝成物件
        return { zh: aetheryteData };
    }
}

// 路線計算器類別
class RouteCalculator {
    constructor() {
        this.aetherytes = null;
        this.loadAetherytes();
    }
    
    async loadAetherytes() {
        try {
            const response = await fetch('../../data/aetherytes.json');
            const data = await response.json();
            this.aetherytes = data.aetherytes;
        } catch (error) {
            console.error('載入傳送點資料失敗:', error);
        }
    }
    
    // 3D 距離計算（修正版）
    calculateDistance(from, to) {
        // 跨地圖移動
        if (from.zoneId !== to.zoneId) {
            return 0;
        }
        
        // 任何點到傳送點：零成本
        if (to.isTeleport) {
            return 0;
        }
        
        // 傳送點到普通點或普通點到普通點：3D 歐幾里得距離
        const dx = from.coords.x - to.coords.x;
        const dy = from.coords.y - to.coords.y;
        const dz = from.coords.z - to.coords.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    // 主要路線計算
    calculateRoute(maps, zoneTranslations = {}) {
        console.log('=== 開始路線計算 ===');
        console.log('輸入地圖數量:', maps.length);
        console.log('輸入地圖資料:', JSON.stringify(maps, null, 2));
        
        if (!maps || maps.length === 0) return { summary: {}, route: [] };
        if (!this.aetherytes) {
            console.error('傳送點資料尚未載入');
            return { summary: {}, route: [] };
        }
        
        console.log('傳送點資料已載入:', Object.keys(this.aetherytes));
        
        // 儲存 zone translations 供後續使用
        this.zoneTranslations = zoneTranslations;
        
        // 1. 找出起始地區（全域最近的寶圖-傳送點配對）
        const { startRegion, startMap } = this.findStartingRegion(maps);
        console.log('起始地區:', startRegion, '起始地圖:', startMap);
        
        // 2. 按地區分組
        const mapsByRegion = this.groupByZone(maps);
        console.log('地區分組結果:', Object.keys(mapsByRegion).map(k => `${k}: ${mapsByRegion[k].length}張`));
        
        // 3. 決定地區訪問順序（第一個已決定，其餘按數量）
        const regionOrder = this.getRegionOrder(mapsByRegion, startRegion);
        console.log('地區訪問順序:', regionOrder);
        
        // 4. 為每個地區規劃路線
        const route = [];
        let totalTeleports = 0;
        
        for (const region of regionOrder) {
            if (mapsByRegion[region]) {
                console.log(`\n--- 規劃 ${region} 地區路線 ---`);
                const regionRoute = this.planRegionRoute(mapsByRegion[region]);
                console.log(`${region} 地區路線步驟數:`, regionRoute.length);
                console.log(`${region} 地區路線詳情:`, JSON.stringify(regionRoute, null, 2));
                route.push(...regionRoute);
                
                // 計算傳送次數
                const regionTeleports = regionRoute.filter(step => step.type === 'teleport').length;
                console.log(`${region} 地區傳送次數:`, regionTeleports);
                totalTeleports += regionTeleports;
            }
        }
        
        // 獲取實際的地區名稱列表
        const regionsVisited = [];
        for (const regionId of regionOrder) {
            if (mapsByRegion[regionId] && mapsByRegion[regionId].length > 0) {
                // 使用第一個地圖的 zone 名稱
                const zoneName = mapsByRegion[regionId][0].zone;
                if (zoneName && !regionsVisited.includes(zoneName)) {
                    regionsVisited.push(zoneName);
                }
            }
        }
        
        console.log('\n=== 路線計算完成 ===');
        console.log('總傳送次數:', totalTeleports);
        console.log('訪問地區:', regionsVisited);
        console.log('完整路線:', JSON.stringify(route, null, 2));
        
        return {
            summary: {
                totalMaps: maps.length,
                totalTeleports: totalTeleports,
                regionsVisited: regionsVisited
            },
            route: route
        };
    }
    
    // 找出全域最近的寶圖-傳送點配對
    findStartingRegion(maps) {
        console.log('findStartingRegion 開始');
        let minDistance = Infinity;
        let startRegion = null;
        let startMap = null;
        
        for (const map of maps) {
            // 確保 map 有 zoneId
            const zoneId = this.getZoneId(map.zone) || map.zoneId;
            if (!zoneId) {
                console.log(`警告: 無法找到 ${map.zone} 的 zoneId`);
                continue;
            }
            
            const aetherytes = this.getRegionAetherytes(zoneId);
            console.log(`地圖 ${map.id} (${map.zone}) 的 zoneId: ${zoneId}, 傳送點數量: ${aetherytes.length}`);
            
            for (const aetheryte of aetherytes) {
                const dist = this.calculateDistance(
                    { coords: map.coords, zoneId: zoneId },
                    { coords: aetheryte.coords, zoneId: zoneId, isTeleport: true }
                );
                console.log(`  - 傳送點 ${aetheryte.name?.zh || aetheryte.id} 距離: ${dist}`);
                if (dist < minDistance) {
                    minDistance = dist;
                    startRegion = zoneId;
                    startMap = { ...map, zoneId: zoneId };
                }
            }
        }
        
        console.log(`起始地區選擇: ${startRegion}, 最短距離: ${minDistance}`);
        return { startRegion, startMap };
    }
    
    // 按地區分組
    groupByZone(maps) {
        const groups = {};
        for (const map of maps) {
            // 將 zone 名稱轉換為 zoneId
            const zoneId = this.getZoneId(map.zone) || map.zoneId || 'unknown';
            if (!groups[zoneId]) {
                groups[zoneId] = [];
            }
            // 確保每個 map 都有 zoneId
            groups[zoneId].push({
                ...map,
                zoneId: zoneId
            });
        }
        return groups;
    }
    
    // 將 zone 名稱轉換為 zoneId
    getZoneId(zoneName) {
        // 建立 zone 名稱到 zoneId 的映射
        const zoneMapping = {
            // 2.0 地區
            'La Noscea': 'la_noscea',
            'The Black Shroud': 'the_black_shroud',
            'Thanalan': 'thanalan',
            'Coerthas': 'coerthas',
            'Mor Dhona': 'mor_dhona',
            
            // 3.0 蒼天地區
            'Coerthas Western Highlands': 'coerthas',
            'The Dravanian Forelands': 'dravania',
            'The Churning Mists': 'dravania',
            'The Sea of Clouds': 'abalathia',
            'Abalathia': 'abalathia',
            'Dravania': 'dravania',
            
            // 4.0 紅蓮地區
            'The Fringes': 'gyr_abania',
            'The Peaks': 'gyr_abania',
            'The Lochs': 'gyr_abania',
            'The Ruby Sea': 'othard',
            'Yanxia': 'othard',
            'The Azim Steppe': 'othard',
            'Gyr Abania': 'gyr_abania',
            'Othard': 'othard',
            
            // 5.0 漆黑地區
            'Lakeland': 'norvrandt',
            'Kholusia': 'norvrandt',
            'Amh Araeng': 'norvrandt',
            'Il Mheg': 'norvrandt',
            'The Rak\'tika Greatwood': 'norvrandt',
            'The Tempest': 'norvrandt',
            'Norvrandt': 'norvrandt',
            
            // 6.0 曉月地區
            'Labyrinthos': 'ilsabard',
            'Thavnair': 'ilsabard',
            'Garlemald': 'ilsabard',
            'Mare Lamentorum': 'ilsabard',
            'Elpis': 'elpis',
            'Ultima Thule': 'ilsabard',
            'Ilsabard': 'ilsabard',
            
            // 7.0 黃金地區
            'Urqopacha': 'tural',
            'Kozama\'uka': 'tural',
            'Yak T\'el': 'tural',
            'Shaaloani': 'tural',
            'Heritage Found': 'tural',
            'Living Memory': 'tural',
            'Tural': 'tural'
        };
        
        return zoneMapping[zoneName] || null;
    }
    
    // 決定地區訪問順序
    getRegionOrder(mapsByRegion, startRegion) {
        const regions = Object.keys(mapsByRegion);
        const otherRegions = regions.filter(r => r !== startRegion);
        
        // 其餘地區按寶圖數量排序（多的優先）
        otherRegions.sort((a, b) => 
            mapsByRegion[b].length - mapsByRegion[a].length
        );
        
        return [startRegion, ...otherRegions];
    }
    
    // 取得地區的傳送點
    getRegionAetherytes(zoneId) {
        console.log(`getRegionAetherytes 查詢 zoneId: ${zoneId}`);
        console.log('可用的 zoneIds:', this.aetherytes ? Object.keys(this.aetherytes) : 'aetherytes 未載入');
        
        if (!this.aetherytes) {
            console.log('傳送點資料尚未載入');
            return [];
        }
        
        if (!this.aetherytes[zoneId]) {
            console.log(`找不到 ${zoneId} 的傳送點資料`);
            return [];
        }
        
        // 將傳送點資料加上必要的屬性
        const aetherytes = this.aetherytes[zoneId].map(a => ({
            ...a,
            zoneId: zoneId,
            isTeleport: true
        }));
        
        console.log(`找到 ${aetherytes.length} 個傳送點:`, aetherytes.map(a => a.name?.zh || a.id));
        return aetherytes;
    }
    
    // 地區內路線規劃（基於傳送點分組策略）
    planRegionRoute(regionMaps) {
        console.log('planRegionRoute 開始，地圖數量:', regionMaps.length);
        console.log('第一張地圖資料:', regionMaps[0]);
        
        const normalMaps = regionMaps; // 所有寶圖都是普通點
        const teleports = this.getRegionAetherytes(regionMaps[0].zoneId);
        
        console.log('取得的傳送點數量:', teleports.length);
        console.log('傳送點資料:', JSON.stringify(teleports, null, 2));
        
        // 取得第一個地圖的 zone 名稱（實際地區名稱）
        const zoneName = regionMaps[0].zone;
        console.log('地區名稱 (zone):', zoneName);
        console.log('地區ID (zoneId):', regionMaps[0].zoneId);
        
        // 使用新的分組策略：根據最近傳送點將寶圖分組
        const result = this.solveWithTeleportGrouping(normalMaps, teleports);
        console.log('分組求解結果路徑長度:', result.path.length);
        console.log('分組求解結果路徑:', JSON.stringify(result.path, null, 2));
        
        // 轉換為路線步驟格式
        const route = [];
        let lastWasTeleport = false;
        
        for (let i = 0; i < result.path.length; i++) {
            const point = result.path[i];
            console.log(`處理路徑點 ${i}:`, point);
            
            if (point.isTeleport) {
                if (i === 0 || !lastWasTeleport) {
                    const routeStep = {
                        type: 'teleport',
                        to: point.name,
                        zone: zoneName,  // 使用實際的 zone 名稱
                        zoneId: point.zoneId,
                        coords: point.coords
                    };
                    console.log('新增傳送步驟:', routeStep);
                    route.push(routeStep);
                }
                lastWasTeleport = true;
            } else {
                const routeStep = {
                    type: 'move',
                    mapId: point.id,
                    mapLevel: point.level || point.levelName,  // 確保有 level 資料
                    zone: point.zone,  // 使用實際的 zone 名稱
                    zoneId: point.zoneId,
                    coords: point.coords
                };
                console.log('新增移動步驟:', routeStep);
                route.push(routeStep);
                lastWasTeleport = false;
            }
        }
        
        console.log('planRegionRoute 完成，路線步驟數:', route.length);
        return route;
    }
    
    // 基於傳送點分組的求解策略
    solveWithTeleportGrouping(normalPoints, teleportPoints) {
        console.log('solveWithTeleportGrouping 開始');
        console.log('寶圖數量:', normalPoints.length);
        console.log('傳送點數量:', teleportPoints.length);
        
        if (normalPoints.length === 0) {
            console.log('無寶圖，返回空路徑');
            return { path: [], distance: 0 };
        }
        
        if (teleportPoints.length === 0) {
            console.log('無傳送點，使用純TSP');
            return this.solvePureTSP(normalPoints);
        }
        
        // 1. 為每個寶圖分配最近的傳送點
        const mapGroups = new Map(); // teleportId -> maps[]
        
        for (const map of normalPoints) {
            let closestTeleport = null;
            let minDistance = Infinity;
            
            for (const teleport of teleportPoints) {
                const dist = this.calculateDistance(
                    teleport,
                    { coords: map.coords, zoneId: map.zoneId }
                );
                
                if (dist < minDistance) {
                    minDistance = dist;
                    closestTeleport = teleport;
                }
            }
            
            const teleportId = closestTeleport.id;
            if (!mapGroups.has(teleportId)) {
                mapGroups.set(teleportId, {
                    teleport: closestTeleport,
                    maps: []
                });
            }
            mapGroups.get(teleportId).maps.push(map);
            
            console.log(`寶圖 ${map.id} 分配到傳送點 ${closestTeleport.name?.zh || closestTeleport.id}, 距離: ${minDistance}`);
        }
        
        console.log('分組結果:', Array.from(mapGroups.entries()).map(([id, group]) => 
            `${group.teleport.name?.zh || id}: ${group.maps.length}張`
        ));
        
        // 2. 對每個傳送點組內的寶圖進行TSP求解
        const groupRoutes = [];
        for (const [teleportId, group] of mapGroups) {
            if (group.maps.length === 1) {
                // 只有一張寶圖，直接加入
                groupRoutes.push({
                    teleport: group.teleport,
                    maps: group.maps,
                    distance: this.calculateDistance(
                        group.teleport,
                        { coords: group.maps[0].coords, zoneId: group.maps[0].zoneId }
                    )
                });
            } else {
                // 多張寶圖，進行局部TSP
                const localTSP = this.solveTSPFromTeleport(group.teleport, group.maps);
                groupRoutes.push({
                    teleport: group.teleport,
                    maps: localTSP.path,
                    distance: localTSP.distance
                });
            }
        }
        
        // 3. 決定傳送點組的訪問順序（按寶圖數量降序）
        groupRoutes.sort((a, b) => b.maps.length - a.maps.length);
        console.log('傳送點訪問順序:', groupRoutes.map(g => 
            `${g.teleport.name?.zh || g.teleport.id} (${g.maps.length}張)`
        ));
        
        // 4. 構建最終路徑
        const finalPath = [];
        let totalDistance = 0;
        
        for (const group of groupRoutes) {
            // 加入傳送點
            finalPath.push(group.teleport);
            // 加入該組的所有寶圖
            finalPath.push(...group.maps);
            totalDistance += group.distance;
        }
        
        console.log('最終路徑構建完成，總長度:', finalPath.length);
        console.log('路徑中傳送點數:', finalPath.filter(p => p.isTeleport).length);
        console.log('路徑中寶圖數:', finalPath.filter(p => !p.isTeleport).length);
        
        return {
            path: finalPath,
            distance: totalDistance
        };
    }
    
    // 從傳送點開始的TSP求解
    solveTSPFromTeleport(teleport, maps) {
        if (maps.length === 1) {
            return {
                path: maps,
                distance: this.calculateDistance(
                    teleport,
                    { coords: maps[0].coords, zoneId: maps[0].zoneId }
                )
            };
        }
        
        // 使用最近鄰居法，從傳送點開始
        const visited = new Array(maps.length).fill(false);
        const path = [];
        let totalDistance = 0;
        
        // 找到離傳送點最近的寶圖作為起點
        let nearestIdx = -1;
        let nearestDistance = Infinity;
        
        for (let i = 0; i < maps.length; i++) {
            const dist = this.calculateDistance(
                teleport,
                { coords: maps[i].coords, zoneId: maps[i].zoneId }
            );
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestIdx = i;
            }
        }
        
        // 從最近的寶圖開始
        visited[nearestIdx] = true;
        path.push(maps[nearestIdx]);
        totalDistance += nearestDistance;
        let currentIdx = nearestIdx;
        
        // 繼續訪問剩餘的寶圖
        for (let i = 1; i < maps.length; i++) {
            nearestIdx = -1;
            nearestDistance = Infinity;
            
            for (let j = 0; j < maps.length; j++) {
                if (!visited[j]) {
                    const dist = this.calculateDistance(
                        { coords: maps[currentIdx].coords, zoneId: maps[currentIdx].zoneId },
                        { coords: maps[j].coords, zoneId: maps[j].zoneId }
                    );
                    if (dist < nearestDistance) {
                        nearestDistance = dist;
                        nearestIdx = j;
                    }
                }
            }
            
            if (nearestIdx !== -1) {
                visited[nearestIdx] = true;
                path.push(maps[nearestIdx]);
                totalDistance += nearestDistance;
                currentIdx = nearestIdx;
            }
        }
        
        return { path, distance: totalDistance };
    }
    
    // 啟發式求解（改編自演算法文件）
    solveWithHeuristic(normalPoints, teleportPoints) {
        console.log('solveWithHeuristic 開始');
        console.log('普通點數量:', normalPoints.length);
        console.log('傳送點數量:', teleportPoints.length);
        
        // 特殊情況
        if (normalPoints.length === 0) {
            console.log('無普通點，返回所有傳送點');
            return { path: teleportPoints, distance: 0 };
        }
        
        if (teleportPoints.length === 0) {
            console.log('無傳送點，返回純TSP結果');
            const normalTSP = this.solvePureTSP(normalPoints);
            return normalTSP;
        }
        
        // 一般情況：需要先找到最佳起始傳送點
        console.log('尋找最佳起始傳送點');
        
        // 先解決普通點的TSP以確定最佳路徑
        const normalTSP = this.solvePureTSP(normalPoints);
        console.log('普通點TSP解決，路徑長度:', normalTSP.path.length);
        
        // 找到距離第一個普通點最近的傳送點作為起始點
        const firstNormalPoint = normalTSP.path[0];
        console.log('第一個普通點:', firstNormalPoint);
        
        let bestStartTeleport = teleportPoints[0];
        let minStartDistance = this.calculateDistance(
            bestStartTeleport,
            { coords: firstNormalPoint.coords, zoneId: firstNormalPoint.zoneId }
        );
        
        console.log('初始起始傳送點:', bestStartTeleport);
        console.log('初始起始距離:', minStartDistance);
        
        for (const teleport of teleportPoints.slice(1)) {
            const distance = this.calculateDistance(
                teleport,
                { coords: firstNormalPoint.coords, zoneId: firstNormalPoint.zoneId }
            );
            console.log(`測試起始傳送點 ${teleport.name?.zh || teleport.id}, 距離: ${distance}`);
            if (distance < minStartDistance) {
                minStartDistance = distance;
                bestStartTeleport = teleport;
                console.log('找到更近的起始傳送點!');
            }
        }
        
        console.log('最終選擇的起始傳送點:', bestStartTeleport);
        
        // 如果只有一個普通點，路徑就是：起始傳送點 → 普通點 → 其他傳送點
        if (normalPoints.length === 1) {
            console.log('只有一個普通點的特殊情況');
            return { 
                path: [bestStartTeleport, ...normalPoints, ...teleportPoints.filter(t => t !== bestStartTeleport)], 
                distance: minStartDistance 
            };
        }
        
        // 找到距離最後一個普通點最近的傳送點作為結束點
        const lastNormalPoint = normalTSP.path[normalTSP.path.length - 1];
        console.log('最後一個普通點:', lastNormalPoint);
        
        let bestEndTeleport = teleportPoints[0];
        let minEndDistance = this.calculateDistance(
            { coords: lastNormalPoint.coords, zoneId: lastNormalPoint.zoneId },
            bestEndTeleport
        );
        
        // 避免選擇相同的起始和結束傳送點
        if (bestEndTeleport === bestStartTeleport && teleportPoints.length > 1) {
            bestEndTeleport = teleportPoints[1];
            minEndDistance = this.calculateDistance(
                { coords: lastNormalPoint.coords, zoneId: lastNormalPoint.zoneId },
                bestEndTeleport
            );
        }
        
        console.log('初始結束傳送點:', bestEndTeleport);
        console.log('初始結束距離:', minEndDistance);
        
        for (const teleport of teleportPoints) {
            if (teleport === bestStartTeleport) continue; // 跳過起始傳送點
            
            const distance = this.calculateDistance(
                { coords: lastNormalPoint.coords, zoneId: lastNormalPoint.zoneId },
                teleport
            );
            console.log(`測試結束傳送點 ${teleport.name?.zh || teleport.id}, 距離: ${distance}`);
            if (distance < minEndDistance) {
                minEndDistance = distance;
                bestEndTeleport = teleport;
                console.log('找到更近的結束傳送點!');
            }
        }
        
        console.log('最終選擇的結束傳送點:', bestEndTeleport);
        
        // 構建最終路徑：起始傳送點 → 普通點們 → 結束傳送點 → 其他傳送點
        const otherTeleports = teleportPoints.filter(t => t !== bestStartTeleport && t !== bestEndTeleport);
        const finalPath = [
            bestStartTeleport,
            ...normalTSP.path,
            bestEndTeleport,
            ...otherTeleports
        ];
        
        console.log('最終路徑長度:', finalPath.length);
        console.log('最終路徑包含傳送點數:', finalPath.filter(p => p.isTeleport).length);
        
        return {
            path: finalPath,
            distance: minStartDistance + normalTSP.distance + minEndDistance
        };
    }
    
    // 純TSP求解（貪婪最近鄰居法）
    solvePureTSP(points) {
        if (points.length <= 1) {
            return { path: points, distance: 0 };
        }
        
        let bestDistance = Infinity;
        let bestPath = [];
        
        // 嘗試每個起點
        for (let start = 0; start < points.length; start++) {
            const visited = new Array(points.length).fill(false);
            const path = [points[start]];
            visited[start] = true;
            let totalDistance = 0;
            let currentIdx = start;
            
            // 貪婪選擇最近的未訪問點
            for (let i = 1; i < points.length; i++) {
                let nearestIdx = -1;
                let nearestDistance = Infinity;
                
                for (let j = 0; j < points.length; j++) {
                    if (!visited[j]) {
                        const distance = this.calculateDistance(
                            { coords: points[currentIdx].coords, zoneId: points[currentIdx].zoneId },
                            { coords: points[j].coords, zoneId: points[j].zoneId }
                        );
                        if (distance < nearestDistance) {
                            nearestDistance = distance;
                            nearestIdx = j;
                        }
                    }
                }
                
                if (nearestIdx !== -1) {
                    visited[nearestIdx] = true;
                    path.push(points[nearestIdx]);
                    totalDistance += nearestDistance;
                    currentIdx = nearestIdx;
                }
            }
            
            if (totalDistance < bestDistance) {
                bestDistance = totalDistance;
                bestPath = path;
            }
        }
        
        return { path: bestPath, distance: bestDistance };
    }
}

// 初始化
let treasureMapFinder;
let routeCalculator;
document.addEventListener('DOMContentLoaded', () => {
    treasureMapFinder = new TreasureMapFinder();
    routeCalculator = new RouteCalculator();
});