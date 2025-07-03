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
            await this.loadData();
            this.setupEventListeners();
            this.updateListCount();
            this.applyFilters();
        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError('載入寶圖資料失敗，請重新整理頁面再試。');
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
        
        const zoneTitle = document.createElement('h4');
        zoneTitle.className = 'map-zone';
        zoneTitle.textContent = map.zone;
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
            zoneSpan.textContent = item.zone;
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
}

// 初始化
let treasureMapFinder;
document.addEventListener('DOMContentLoaded', () => {
    treasureMapFinder = new TreasureMapFinder();
});