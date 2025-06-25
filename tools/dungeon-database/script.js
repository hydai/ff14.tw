// 副本資料庫功能
class DungeonDatabase {
    // 常數定義
    static CONSTANTS = {
        DEBOUNCE_DELAY: 300,
        DATA_FILE: '/data/dungeons.json',
        DISPLAY_STATES: {
            BLOCK: 'block',
            NONE: 'none',
            GRID: 'grid'
        },
        CSS_CLASSES: {
            DUNGEON_CARD: 'dungeon-card',
            SPECIAL_DROPS: 'special-drops',
            DROP_ITEM: 'drop-item',
            HIGHLIGHT: 'search-highlight',
            FOCUSED: 'card-focused'
        },
        KEYBOARD_KEYS: {
            ENTER: 'Enter',
            ESCAPE: 'Escape',
            ARROW_UP: 'ArrowUp',
            ARROW_DOWN: 'ArrowDown'
        }
    };

    constructor() {
        this.dungeons = [];
        this.filteredDungeons = [];
        this.searchDebounceTimeout = null;
        this.currentSearchTerm = '';
        this.focusedCardIndex = -1;
        
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
            const response = await fetch(DungeonDatabase.CONSTANTS.DATA_FILE);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.dungeons = (data.dungeons || []).filter(dungeon => dungeon.visible !== false);
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
        const { BLOCK, NONE, GRID } = DungeonDatabase.CONSTANTS.DISPLAY_STATES;
        this.setElementDisplay(this.elements.loading, show ? BLOCK : NONE);
        this.setElementDisplay(this.elements.dungeonList, show ? NONE : GRID);
    }

    showError(message) {
        const { BLOCK, NONE } = DungeonDatabase.CONSTANTS.DISPLAY_STATES;
        this.elements.noResults.innerHTML = `<p style="color: var(--accent-color);">${message}</p>`;
        this.setElementDisplay(this.elements.noResults, BLOCK);
        this.setElementDisplay(this.elements.dungeonList, NONE);
    }

    setElementDisplay(element, displayValue) {
        if (element) {
            element.style.display = displayValue;
        }
    }

    initializeEvents() {
        // 搜尋輸入（使用防抖動）
        this.elements.searchInput.addEventListener('input', () => {
            this.debouncedApplyFilters();
        });

        // 鍵盤導航
        this.elements.searchInput.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });

        // 搜尋框失去焦點時清除卡片焦點
        this.elements.searchInput.addEventListener('blur', () => {
            this.clearCardFocus();
        });

        // 過濾器（立即觸發）
        const filterElements = [
            this.elements.typeFilter,
            this.elements.expansionFilter,
            this.elements.levelFilter
        ];
        
        filterElements.forEach(element => {
            element.addEventListener('change', () => {
                this.applyFilters();
            });
        });

        // 重置過濾器
        this.elements.resetFilters.addEventListener('click', () => {
            this.resetFilters();
        });
    }

    debouncedApplyFilters() {
        // 清除之前的計時器
        if (this.searchDebounceTimeout) {
            clearTimeout(this.searchDebounceTimeout);
        }
        
        // 設定新的計時器
        this.searchDebounceTimeout = setTimeout(() => {
            this.applyFilters();
        }, DungeonDatabase.CONSTANTS.DEBOUNCE_DELAY);
    }

    handleKeyboardNavigation(e) {
        const { ENTER, ESCAPE, ARROW_UP, ARROW_DOWN } = DungeonDatabase.CONSTANTS.KEYBOARD_KEYS;
        
        switch (e.key) {
            case ARROW_DOWN:
                e.preventDefault();
                this.navigateCards(1);
                break;
            case ARROW_UP:
                e.preventDefault();
                this.navigateCards(-1);
                break;
            case ENTER:
                e.preventDefault();
                this.selectFocusedCard();
                break;
            case ESCAPE:
                e.preventDefault();
                this.clearCardFocus();
                break;
        }
    }

    navigateCards(direction) {
        const maxIndex = this.filteredDungeons.length - 1;
        
        if (maxIndex < 0) return;
        
        this.focusedCardIndex += direction;
        
        if (this.focusedCardIndex > maxIndex) {
            this.focusedCardIndex = 0;
        } else if (this.focusedCardIndex < 0) {
            this.focusedCardIndex = maxIndex;
        }
        
        this.updateCardFocus();
    }

    updateCardFocus() {
        const { DUNGEON_CARD, FOCUSED } = DungeonDatabase.CONSTANTS.CSS_CLASSES;
        const cards = this.elements.dungeonList.querySelectorAll(`.${DUNGEON_CARD}`);
        
        // 清除所有焦點
        cards.forEach(card => card.classList.remove(FOCUSED));
        
        // 設定當前焦點
        if (this.focusedCardIndex >= 0 && cards[this.focusedCardIndex]) {
            const focusedCard = cards[this.focusedCardIndex];
            focusedCard.classList.add(FOCUSED);
            focusedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    selectFocusedCard() {
        if (this.focusedCardIndex >= 0 && this.focusedCardIndex < this.filteredDungeons.length) {
            this.showDungeonDetail(this.filteredDungeons[this.focusedCardIndex]);
        }
    }

    clearCardFocus() {
        const { DUNGEON_CARD, FOCUSED } = DungeonDatabase.CONSTANTS.CSS_CLASSES;
        const cards = this.elements.dungeonList.querySelectorAll(`.${DUNGEON_CARD}`);
        
        cards.forEach(card => card.classList.remove(FOCUSED));
        this.focusedCardIndex = -1;
    }

    applyFilters() {
        const searchTerm = this.elements.searchInput.value.toLowerCase().trim();
        const typeFilter = this.elements.typeFilter.value;
        const expansionFilter = this.elements.expansionFilter.value;
        const levelFilter = this.elements.levelFilter.value;

        this.currentSearchTerm = searchTerm;
        this.focusedCardIndex = -1; // 重置焦點

        this.filteredDungeons = this.dungeons.filter(dungeon => {
            return this.matchesSearch(dungeon, searchTerm) &&
                   this.matchesType(dungeon, typeFilter) &&
                   this.matchesExpansion(dungeon, expansionFilter) &&
                   this.matchesLevel(dungeon, levelFilter);
        });

        this.renderDungeons();
    }

    matchesSearch(dungeon, searchTerm) {
        if (!searchTerm) return true;
        
        const searchableFields = [
            dungeon.name,
            dungeon.description,
            dungeon.mechanics,
            ...dungeon.specialDrops
        ];
        
        return searchableFields.some(field => 
            field.toLowerCase().includes(searchTerm)
        );
    }

    matchesType(dungeon, typeFilter) {
        return !typeFilter || dungeon.type === typeFilter;
    }

    matchesExpansion(dungeon, expansionFilter) {
        return !expansionFilter || dungeon.expansion === expansionFilter;
    }

    matchesLevel(dungeon, levelFilter) {
        if (!levelFilter) return true;
        
        const [minLevel, maxLevel] = levelFilter.split('-').map(Number);
        return dungeon.level >= minLevel && dungeon.level <= maxLevel;
    }

    resetFilters() {
        this.elements.searchInput.value = '';
        this.elements.typeFilter.value = '';
        this.elements.expansionFilter.value = '';
        this.elements.levelFilter.value = '';
        
        this.currentSearchTerm = '';
        this.focusedCardIndex = -1;
        this.filteredDungeons = [...this.dungeons];
        this.renderDungeons();
        
        FF14Utils.showToast('已重置所有過濾條件', 'success');
    }

    highlightSearchTerms(text, searchTerm) {
        if (!searchTerm || !text) return text;
        
        const { HIGHLIGHT } = DungeonDatabase.CONSTANTS.CSS_CLASSES;
        const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
        
        return text.replace(regex, `<span class="${HIGHLIGHT}">$1</span>`);
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    renderDungeons() {
        const container = this.elements.dungeonList;
        const { BLOCK, NONE, GRID } = DungeonDatabase.CONSTANTS.DISPLAY_STATES;
        
        if (this.filteredDungeons.length === 0) {
            this.setElementDisplay(container, NONE);
            this.setElementDisplay(this.elements.noResults, BLOCK);
            return;
        }

        this.setElementDisplay(container, GRID);
        this.setElementDisplay(this.elements.noResults, NONE);

        container.innerHTML = this.filteredDungeons.map(dungeon => 
            this.createDungeonCard(dungeon)
        ).join('');

        // 添加點擊事件
        this.attachCardEvents(container);
    }

    attachCardEvents(container) {
        const { DUNGEON_CARD } = DungeonDatabase.CONSTANTS.CSS_CLASSES;
        
        container.querySelectorAll(`.${DUNGEON_CARD}`).forEach((card, index) => {
            card.addEventListener('click', () => {
                this.showDungeonDetail(this.filteredDungeons[index]);
            });
        });
    }

    createDungeonCard(dungeon) {
        const specialDropsHtml = this.createSpecialDropsHtml(dungeon.specialDrops);
        const { DUNGEON_CARD } = DungeonDatabase.CONSTANTS.CSS_CLASSES;

        return `
            <div class="${DUNGEON_CARD}" data-id="${dungeon.id}">
                <div class="dungeon-image">
                    ${this.createImageHtml(dungeon.image, dungeon.name)}
                </div>
                <div class="dungeon-content">
                    ${this.createDungeonHeader(dungeon)}
                    ${this.createDungeonMeta(dungeon)}
                    ${this.createDungeonRewards(dungeon)}
                    ${specialDropsHtml}
                    ${this.createDungeonDescription(dungeon)}
                </div>
            </div>
        `;
    }

    createSpecialDropsHtml(specialDrops) {
        if (specialDrops.length === 0) return '';
        
        const { SPECIAL_DROPS, DROP_ITEM } = DungeonDatabase.CONSTANTS.CSS_CLASSES;
        
        return `
            <div class="${SPECIAL_DROPS}">
                <h4>特殊掉落物</h4>
                <div class="drops-list">
                    ${specialDrops.map(drop => 
                        `<span class="${DROP_ITEM}">${drop}</span>`
                    ).join('')}
                </div>
            </div>
        `;
    }

    createImageHtml(image, name) {
        if (!image) return '圖片準備中';
        
        return `<img src="${image}" 
                     alt="${name}" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                     onload="this.style.display='block'; this.nextElementSibling.style.display='none';">
                <div class="image-placeholder" style="display:none;">
                    <span>圖片載入中...</span>
                </div>`;
    }

    createDungeonHeader(dungeon) {
        const highlightedName = this.highlightSearchTerms(dungeon.name, this.currentSearchTerm);
        
        return `
            <div class="dungeon-header">
                <h3 class="dungeon-title">${highlightedName}</h3>
                <span class="dungeon-level">Lv.${dungeon.level}</span>
            </div>
        `;
    }

    createDungeonMeta(dungeon) {
        return `
            <div class="dungeon-meta">
                <span class="dungeon-type">${dungeon.type}</span>
                <span class="dungeon-expansion">${dungeon.expansion}</span>
            </div>
        `;
    }

    createDungeonRewards(dungeon) {
        return `
            <div class="dungeon-rewards">
                <h4>獎勵</h4>
                <div class="reward-item">
                    <span class="reward-name">神典石</span>
                    <span class="reward-value">${dungeon.tombstoneReward}</span>
                </div>
            </div>
        `;
    }

    createDungeonDescription(dungeon) {
        const highlightedMechanics = this.highlightSearchTerms(dungeon.mechanics, this.currentSearchTerm);
        const highlightedDescription = this.highlightSearchTerms(dungeon.description, this.currentSearchTerm);
        
        return `
            <div class="dungeon-description">
                <strong>機制說明：</strong>${highlightedMechanics}
            </div>
            <div class="dungeon-description">
                ${highlightedDescription}
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