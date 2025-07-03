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
            loadMore: document.getElementById('loadMore'),
            modalOverlay: document.getElementById('modalOverlay'),
            modalImage: document.getElementById('modalImage'),
            modalTitle: document.getElementById('modalTitle'),
            modalCoords: document.getElementById('modalCoords'),
            modalAddBtn: document.getElementById('modalAddBtn'),
            copyCoords: document.getElementById('copyCoords'),
            modalClose: document.getElementById('modalClose')
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
        
        // Modal
        this.elements.modalClose.addEventListener('click', () => this.closeModal());
        this.elements.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.elements.modalOverlay) {
                this.closeModal();
            }
        });
        this.elements.copyCoords.addEventListener('click', () => this.copyCoordinates());
        this.elements.modalAddBtn.addEventListener('click', () => this.addFromModal());
        
        // 載入更多
        this.elements.loadMore.querySelector('button').addEventListener('click', () => this.loadMoreMaps());
        
        // ESC 鍵關閉
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.elements.modalOverlay.style.display !== 'none') {
                    this.closeModal();
                } else if (this.elements.myListPanel.classList.contains('active')) {
                    this.toggleListPanel();
                }
            }
        });
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
                <button class="btn-add-to-list" data-state="${isInList ? 'added' : 'default'}">
                    <span class="btn-text">${isInList ? '已加入' : '加入清單'}</span>
                </button>
            </div>
        `;
        
        // 事件綁定
        card.querySelector('.card-image-wrapper').addEventListener('click', () => {
            this.showModal(map);
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
            button.querySelector('.btn-text').textContent = isInList ? '已加入' : '加入清單';
        });
    }
    
    showModal(map) {
        this.currentModalMap = map;
        
        this.elements.modalImage.src = map.fullImage;
        this.elements.modalTitle.textContent = `${map.levelName} - ${map.zone}`;
        this.elements.modalCoords.textContent = `座標：X: ${map.coords.x} Y: ${map.coords.y} Z: ${map.coords.z || 0}`;
        
        const isInList = this.myList.some(item => item.id === map.id);
        this.elements.modalAddBtn.textContent = isInList ? '✓ 已加入' : '加入清單';
        this.elements.modalAddBtn.dataset.state = isInList ? 'added' : 'default';
        
        this.elements.modalOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    closeModal() {
        this.elements.modalOverlay.style.display = 'none';
        document.body.style.overflow = '';
        this.currentModalMap = null;
    }
    
    copyCoordinates() {
        if (!this.currentModalMap) return;
        
        const coords = this.currentModalMap.coords;
        const command = `/pos ${coords.x} ${coords.y} ${coords.z || 0}`;
        
        navigator.clipboard.writeText(command).then(() => {
            FF14Utils.showToast('座標指令已複製', 'success');
        }).catch(err => {
            console.error('複製失敗:', err);
            FF14Utils.showToast('複製失敗', 'error');
        });
    }
    
    addFromModal() {
        if (!this.currentModalMap) return;
        
        this.toggleMapInList(this.currentModalMap);
        
        const isInList = this.myList.some(item => item.id === this.currentModalMap.id);
        this.elements.modalAddBtn.textContent = isInList ? '✓ 已加入' : '加入清單';
        this.elements.modalAddBtn.dataset.state = isInList ? 'added' : 'default';
    }
    
    toggleListPanel() {
        this.elements.myListPanel.classList.toggle('active');
        if (this.elements.myListPanel.classList.contains('active')) {
            this.renderMyList();
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
}

// 初始化
let treasureMapFinder;
document.addEventListener('DOMContentLoaded', () => {
    treasureMapFinder = new TreasureMapFinder();
});