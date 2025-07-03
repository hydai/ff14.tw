// 寶圖搜尋器
class TreasureMapFinder {
    constructor() {
        this.data = null;
        this.maps = [];
        this.filteredMaps = [];
        this.myList = this.loadFromStorage();
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
    
    createMapCard(map) {
        const card = document.createElement('div');
        card.className = 'treasure-card';
        card.dataset.mapId = map.id;
        
        const isInList = this.myList.some(item => item.id === map.id);
        
        card.innerHTML = `
            <div class="card-image-wrapper">
                <img src="${map.thumbnail}" alt="${map.levelName}" loading="lazy" 
                     onerror="this.src='/assets/images/treasure-map-placeholder.png'">
                <span class="map-level-badge">${map.level.toUpperCase()}</span>
            </div>
            <div class="card-content">
                <h4 class="map-zone">${map.zone}</h4>
                <p class="map-coords">X: ${map.coords.x} Y: ${map.coords.y} Z: ${map.coords.z || 0}</p>
                <div class="card-actions">
                    <button class="btn btn-secondary btn-sm btn-copy-coords" title="複製座標指令">
                        <span class="btn-icon">📍</span> 複製座標
                    </button>
                    <button class="btn ${isInList ? 'btn-success' : 'btn-primary'} btn-sm btn-add-to-list" data-state="${isInList ? 'added' : 'default'}">
                        <span class="btn-text">${isInList ? '✓ 已加入' : '加入清單'}</span>
                    </button>
                </div>
            </div>
        `;
        
        // 事件綁定
        card.querySelector('.btn-copy-coords').addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyCoordinates(map);
        });
        
        card.querySelector('.btn-add-to-list').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMapInList(map);
        });
        
        return card;
    }
    
    toggleMapInList(map) {
        const index = this.myList.findIndex(item => item.id === map.id);
        
        if (index !== -1) {
            this.myList.splice(index, 1);
            FF14Utils.showToast('已從清單移除', 'info');
        } else {
            this.myList.push({
                id: map.id,
                level: map.level,
                levelName: map.levelName,
                zone: map.zone,
                coords: map.coords,
                thumbnail: map.thumbnail,
                addedAt: new Date().toISOString()
            });
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
            const isInList = this.myList.some(item => item.id === mapId);
            
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
        if (this.myList.length === 0) {
            this.elements.listContent.innerHTML = `
                <div class="empty-state">
                    <p>清單是空的</p>
                    <p class="text-secondary">點擊寶圖卡片上的「加入清單」開始建立</p>
                </div>
            `;
            return;
        }
        
        this.elements.listContent.innerHTML = this.myList.map(item => `
            <div class="list-item" data-map-id="${item.id}">
                <img src="${item.thumbnail}" alt="${item.levelName}" 
                     onerror="this.src='/assets/images/treasure-map-placeholder.png'">
                <div class="item-info">
                    <span class="item-level">${item.level.toUpperCase()}</span>
                    <span class="item-zone">${item.zone}</span>
                    <span class="item-coords">(${item.coords.x}, ${item.coords.y}, ${item.coords.z || 0})</span>
                </div>
                <button class="btn-remove" data-map-id="${item.id}">×</button>
            </div>
        `).join('');
        
        // 綁定移除按鈕事件
        this.elements.listContent.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mapId = e.target.dataset.mapId;
                this.removeFromList(mapId);
            });
        });
    }
    
    removeFromList(mapId) {
        if (confirm('確定要移除這張寶圖嗎？')) {
            this.myList = this.myList.filter(item => item.id !== mapId);
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
            this.elements.treasureGrid.innerHTML = '<div class="loading">載入中...</div>';
        }
    }
    
    showError(message) {
        this.elements.treasureGrid.innerHTML = `
            <div class="error-message">
                ${message}
                <button class="btn btn-primary" onclick="location.reload()">重新載入</button>
            </div>
        `;
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
        
        dialog.innerHTML = `
            <h3 style="margin: 0 0 10px 0;">匯出清單</h3>
            <p style="margin-bottom: 10px;">請複製以下內容：</p>
            <textarea style="width: 100%; height: 200px; margin-bottom: 10px; font-family: monospace; font-size: 12px;" readonly>${jsonString}</textarea>
            <div style="text-align: right;">
                <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()">關閉</button>
            </div>
        `;
        
        document.body.appendChild(dialog);
        dialog.querySelector('textarea').select();
    }
    
    // 顯示匯入對話框
    showImportDialog() {
        // 建立匯入對話框
        const dialog = document.createElement('div');
        dialog.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; max-width: 500px; width: 90%;';
        
        dialog.innerHTML = `
            <h3 style="margin: 0 0 10px 0;">匯入清單</h3>
            <p style="margin-bottom: 10px;">請貼上匯出的清單內容：</p>
            <textarea id="importTextarea" style="width: 100%; height: 200px; margin-bottom: 10px; font-family: monospace; font-size: 12px;" placeholder="在此貼上清單資料..."></textarea>
            <div style="text-align: right; display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="this.parentElement.parentElement.remove()">取消</button>
                <button class="btn btn-primary" id="confirmImportBtn">匯入</button>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // 綁定匯入按鈕事件
        dialog.querySelector('#confirmImportBtn').addEventListener('click', () => {
            const text = dialog.querySelector('#importTextarea').value;
            this.importFromText(text);
            dialog.remove();
        });
        
        // 自動聚焦到文字框
        dialog.querySelector('#importTextarea').focus();
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
            
            // 確認是否要合併或取代
            let importedMaps = data.maps;
            let action = 'replace';
            
            if (this.myList.length > 0) {
                const confirmMessage = `目前清單有 ${this.myList.length} 張寶圖。\n` +
                    `要匯入的清單包含 ${importedMaps.length} 張寶圖。\n\n` +
                    `選擇「確定」將合併清單（避免重複）\n` +
                    `選擇「取消」將取代現有清單`;
                
                action = confirm(confirmMessage) ? 'merge' : 'replace';
            }
            
            if (action === 'merge') {
                // 合併清單，避免重複
                const existingIds = new Set(this.myList.map(m => m.id));
                const newMaps = importedMaps.filter(map => !existingIds.has(map.id));
                
                // 補充完整資料（如果原本的匯出資料缺少某些欄位）
                newMaps.forEach(map => {
                    if (!map.thumbnail) map.thumbnail = `/assets/images/treasure-map-placeholder.png`;
                    if (!map.addedAt) map.addedAt = new Date().toISOString();
                });
                
                this.myList = [...this.myList, ...newMaps];
                FF14Utils.showToast(`已合併匯入 ${newMaps.length} 張新寶圖`, 'success');
            } else {
                // 取代清單
                importedMaps.forEach(map => {
                    if (!map.thumbnail) map.thumbnail = `/assets/images/treasure-map-placeholder.png`;
                    if (!map.addedAt) map.addedAt = new Date().toISOString();
                });
                
                this.myList = importedMaps;
                FF14Utils.showToast(`已匯入 ${importedMaps.length} 張寶圖`, 'success');
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