// 副本資料庫功能
class DungeonDatabase {
    constructor() {
        this.dungeons = [];
        this.filteredDungeons = [];
        this.elements = {
            searchInput: document.getElementById('searchInput'),
            typeFilter: document.getElementById('typeFilter'),
            expansionFilter: document.getElementById('expansionFilter'),
            levelFilter: document.getElementById('levelFilter'),
            resetFilters: document.getElementById('resetFilters'),
            dungeonList: document.getElementById('dungeonList'),
            loading: document.getElementById('loading'),
            noResults: document.getElementById('noResults')
        };
        
        this.loadData();
        this.initializeEvents();
    }

    async loadData() {
        this.showLoading(true);
        
        try {
            const response = await fetch('dungeons.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.dungeons = data.dungeons || [];
            this.filteredDungeons = [...this.dungeons];
            this.renderDungeons();
            
        } catch (error) {
            console.error('載入副本資料失敗:', error);
            this.showError('載入副本資料失敗，請重新整理頁面再試。');
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        this.elements.loading.style.display = show ? 'block' : 'none';
        this.elements.dungeonList.style.display = show ? 'none' : 'grid';
    }

    showError(message) {
        this.elements.noResults.innerHTML = `<p style="color: var(--accent-color);">${message}</p>`;
        this.elements.noResults.style.display = 'block';
        this.elements.dungeonList.style.display = 'none';
    }

    initializeEvents() {
        // 搜尋輸入
        this.elements.searchInput.addEventListener('input', () => {
            this.applyFilters();
        });

        // 過濾器
        this.elements.typeFilter.addEventListener('change', () => {
            this.applyFilters();
        });

        this.elements.expansionFilter.addEventListener('change', () => {
            this.applyFilters();
        });

        this.elements.levelFilter.addEventListener('change', () => {
            this.applyFilters();
        });

        // 重置過濾器
        this.elements.resetFilters.addEventListener('click', () => {
            this.resetFilters();
        });
    }

    applyFilters() {
        const searchTerm = this.elements.searchInput.value.toLowerCase().trim();
        const typeFilter = this.elements.typeFilter.value;
        const expansionFilter = this.elements.expansionFilter.value;
        const levelFilter = this.elements.levelFilter.value;

        this.filteredDungeons = this.dungeons.filter(dungeon => {
            // 搜尋過濾
            const matchesSearch = !searchTerm || 
                dungeon.name.toLowerCase().includes(searchTerm) ||
                dungeon.description.toLowerCase().includes(searchTerm);

            // 類型過濾
            const matchesType = !typeFilter || dungeon.type === typeFilter;

            // 版本過濾
            const matchesExpansion = !expansionFilter || dungeon.expansion === expansionFilter;

            // 等級過濾
            let matchesLevel = true;
            if (levelFilter) {
                const [minLevel, maxLevel] = levelFilter.split('-').map(Number);
                matchesLevel = dungeon.level >= minLevel && dungeon.level <= maxLevel;
            }

            return matchesSearch && matchesType && matchesExpansion && matchesLevel;
        });

        this.renderDungeons();
    }

    resetFilters() {
        this.elements.searchInput.value = '';
        this.elements.typeFilter.value = '';
        this.elements.expansionFilter.value = '';
        this.elements.levelFilter.value = '';
        
        this.filteredDungeons = [...this.dungeons];
        this.renderDungeons();
        
        FF14Utils.showToast('已重置所有過濾條件', 'success');
    }

    renderDungeons() {
        const container = this.elements.dungeonList;
        
        if (this.filteredDungeons.length === 0) {
            container.style.display = 'none';
            this.elements.noResults.style.display = 'block';
            return;
        }

        container.style.display = 'grid';
        this.elements.noResults.style.display = 'none';

        container.innerHTML = this.filteredDungeons.map(dungeon => 
            this.createDungeonCard(dungeon)
        ).join('');

        // 添加點擊事件
        container.querySelectorAll('.dungeon-card').forEach((card, index) => {
            card.addEventListener('click', () => {
                this.showDungeonDetail(this.filteredDungeons[index]);
            });
        });
    }

    createDungeonCard(dungeon) {
        const specialDropsHtml = dungeon.specialDrops.length > 0 
            ? `<div class="special-drops">
                   <h4>特殊掉落物</h4>
                   <div class="drops-list">
                       ${dungeon.specialDrops.map(drop => 
                           `<span class="drop-item">${drop}</span>`
                       ).join('')}
                   </div>
               </div>`
            : '';

        return `
            <div class="dungeon-card" data-id="${dungeon.id}">
                <div class="dungeon-image">
                    ${dungeon.image ? `<img src="${dungeon.image}" alt="${dungeon.name}">` : '圖片準備中'}
                </div>
                <div class="dungeon-content">
                    <div class="dungeon-header">
                        <h3 class="dungeon-title">${dungeon.name}</h3>
                        <span class="dungeon-level">Lv.${dungeon.level}</span>
                    </div>
                    
                    <div class="dungeon-meta">
                        <span class="dungeon-type">${dungeon.type}</span>
                        <span class="dungeon-expansion">${dungeon.expansion}</span>
                    </div>
                    
                    <div class="dungeon-rewards">
                        <h4>獎勵</h4>
                        <div class="reward-item">
                            <span class="reward-name">神典石</span>
                            <span class="reward-value">${dungeon.tombstoneReward}</span>
                        </div>
                    </div>
                    
                    ${specialDropsHtml}
                    
                    <div class="dungeon-description">
                        <strong>機制說明：</strong>${dungeon.mechanics}
                    </div>
                    
                    <div class="dungeon-description">
                        ${dungeon.description}
                    </div>
                </div>
            </div>
        `;
    }

    showDungeonDetail(dungeon) {
        // 未來可以實作詳細頁面或彈窗
        FF14Utils.showToast(`點擊了 ${dungeon.name}，詳細攻略功能開發中`, 'info');
    }
}

// 初始化副本資料庫
document.addEventListener('DOMContentLoaded', () => {
    const dungeonDb = new DungeonDatabase();
});