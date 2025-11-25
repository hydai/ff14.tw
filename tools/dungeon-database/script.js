// 副本資料庫功能
class DungeonDatabase {
    // 常數定義
    static CONSTANTS = {
        DEBOUNCE_DELAY: 300,
        DATA_FILE: '../../data/dungeons.json',
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
        this.selectedTypes = new Set();
        this.selectedExpansions = new Set();
        this.selectedLevels = new Set();
        
        this.elements = {
            searchInput: document.getElementById('searchInput'),
            typeTags: document.getElementById('typeTags'),
            expansionTags: document.getElementById('expansionTags'),
            levelTags: document.getElementById('levelTags'),
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
        SecurityUtils.clearElement(this.elements.noResults);
        const p = document.createElement('p');
        p.style.color = 'var(--accent-color)';
        p.textContent = message;
        this.elements.noResults.appendChild(p);
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

        // 類型標籤點擊事件
        this.elements.typeTags.addEventListener('click', (e) => {
            if (e.target.classList.contains('type-tag')) {
                this.toggleTypeTag(e.target);
            }
        });

        // 版本標籤點擊事件
        this.elements.expansionTags.addEventListener('click', (e) => {
            if (e.target.classList.contains('expansion-tag')) {
                this.toggleExpansionTag(e.target);
            }
        });

        // 等級標籤點擊事件
        this.elements.levelTags.addEventListener('click', (e) => {
            if (e.target.classList.contains('level-tag')) {
                this.toggleLevelTag(e.target);
            }
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

    /**
     * Generic tag toggle method to reduce code duplication
     * @param {HTMLElement} tagElement - The tag element to toggle
     * @param {Set} selectedSet - The Set to store selected values
     * @param {string} dataAttribute - The data attribute name to get the value from
     */
    toggleTag(tagElement, selectedSet, dataAttribute) {
        const value = tagElement.dataset[dataAttribute];

        if (selectedSet.has(value)) {
            selectedSet.delete(value);
            tagElement.classList.remove('active');
        } else {
            selectedSet.add(value);
            tagElement.classList.add('active');
        }

        this.applyFilters();
    }

    toggleTypeTag(tagElement) {
        this.toggleTag(tagElement, this.selectedTypes, 'type');
    }

    toggleExpansionTag(tagElement) {
        this.toggleTag(tagElement, this.selectedExpansions, 'expansion');
    }

    toggleLevelTag(tagElement) {
        this.toggleTag(tagElement, this.selectedLevels, 'level');
    }

    applyFilters() {
        const searchTerm = this.elements.searchInput.value.toLowerCase().trim();

        this.currentSearchTerm = searchTerm;
        this.focusedCardIndex = -1; // 重置焦點

        this.filteredDungeons = this.dungeons.filter(dungeon => {
            return this.matchesSearch(dungeon, searchTerm) &&
                   this.matchesTypes(dungeon) &&
                   this.matchesExpansions(dungeon) &&
                   this.matchesLevels(dungeon);
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

    matchesTypes(dungeon) {
        // 如果沒有選擇任何類型，顯示所有副本
        if (this.selectedTypes.size === 0) {
            return true;
        }
        // 檢查副本類型是否在選中的類型中
        return this.selectedTypes.has(dungeon.type);
    }

    matchesExpansions(dungeon) {
        // 如果沒有選擇任何版本，顯示所有副本
        if (this.selectedExpansions.size === 0) {
            return true;
        }
        // 檢查副本版本是否在選中的版本中
        return this.selectedExpansions.has(dungeon.expansion);
    }

    matchesLevels(dungeon) {
        // 如果沒有選擇任何等級，顯示所有副本
        if (this.selectedLevels.size === 0) {
            return true;
        }
        
        // 檢查副本等級是否在任一選中的等級範圍內
        for (const levelRange of this.selectedLevels) {
            const [minLevel, maxLevel] = levelRange.split('-').map(Number);
            if (dungeon.level >= minLevel && dungeon.level <= maxLevel) {
                return true;
            }
        }
        return false;
    }

    resetFilters() {
        this.elements.searchInput.value = '';
        
        // 清除所有選中的類型標籤
        this.selectedTypes.clear();
        this.elements.typeTags.querySelectorAll('.type-tag').forEach(tag => {
            tag.classList.remove('active');
        });
        
        // 清除所有選中的版本標籤
        this.selectedExpansions.clear();
        this.elements.expansionTags.querySelectorAll('.expansion-tag').forEach(tag => {
            tag.classList.remove('active');
        });
        
        // 清除所有選中的等級標籤
        this.selectedLevels.clear();
        this.elements.levelTags.querySelectorAll('.level-tag').forEach(tag => {
            tag.classList.remove('active');
        });
        
        this.currentSearchTerm = '';
        this.focusedCardIndex = -1;
        this.filteredDungeons = [...this.dungeons];
        this.renderDungeons();
        
        FF14Utils.showToast('已重置所有過濾條件', 'success');
    }

    highlightSearchTerms(text, searchTerm) {
        if (!searchTerm || !text) return text;

        const { HIGHLIGHT } = DungeonDatabase.CONSTANTS.CSS_CLASSES;
        const regex = new RegExp(`(${SecurityUtils.escapeRegex(searchTerm)})`, 'gi');

        return text.replace(regex, `<span class="${HIGHLIGHT}">$1</span>`);
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

        // Clear container safely
        SecurityUtils.clearElement(container);
        
        // Create and append cards using DOM manipulation
        this.filteredDungeons.forEach((dungeon, index) => {
            const card = this.createDungeonCardElement(dungeon);
            card.addEventListener('click', () => {
                this.showDungeonDetail(dungeon);
            });
            container.appendChild(card);
        });
    }

    createDungeonCardElement(dungeon) {
        const { DUNGEON_CARD } = DungeonDatabase.CONSTANTS.CSS_CLASSES;
        
        // Create main card container
        const card = document.createElement('div');
        card.className = DUNGEON_CARD;
        card.dataset.id = dungeon.id;
        
        // Create image section
        const imageDiv = document.createElement('div');
        imageDiv.className = 'dungeon-image';
        
        if (dungeon.image) {
            const img = document.createElement('img');
            img.src = dungeon.image;
            img.alt = dungeon.name;
            img.onerror = function() {
                this.style.display = 'none';
                const placeholder = this.nextElementSibling;
                if (placeholder) placeholder.style.display = 'flex';
            };
            img.onload = function() {
                this.style.display = 'block';
                const placeholder = this.nextElementSibling;
                if (placeholder) placeholder.style.display = 'none';
            };
            imageDiv.appendChild(img);
            
            const placeholder = document.createElement('div');
            placeholder.className = 'image-placeholder';
            placeholder.style.display = 'none';
            const placeholderText = document.createElement('span');
            placeholderText.textContent = '圖片載入中...';
            placeholder.appendChild(placeholderText);
            imageDiv.appendChild(placeholder);
        } else {
            imageDiv.textContent = '圖片準備中';
        }
        
        card.appendChild(imageDiv);
        
        // Create content section
        const content = document.createElement('div');
        content.className = 'dungeon-content';
        
        // Header
        const header = document.createElement('div');
        header.className = 'dungeon-header';
        
        const title = document.createElement('h3');
        title.className = 'dungeon-title';
        const highlightedName = this.highlightSearchTermsDOM(dungeon.name, this.currentSearchTerm);
        title.appendChild(highlightedName);
        header.appendChild(title);
        
        const level = document.createElement('span');
        level.className = 'dungeon-level';
        level.textContent = `Lv.${dungeon.level}`;
        header.appendChild(level);
        
        content.appendChild(header);
        
        // Meta information
        const meta = document.createElement('div');
        meta.className = 'dungeon-meta';
        
        const type = document.createElement('span');
        type.className = 'dungeon-type';
        type.textContent = dungeon.type;
        meta.appendChild(type);
        
        const expansion = document.createElement('span');
        expansion.className = 'dungeon-expansion';
        expansion.textContent = dungeon.expansion;
        meta.appendChild(expansion);
        
        content.appendChild(meta);
        
        // Rewards
        const rewards = document.createElement('div');
        rewards.className = 'dungeon-rewards';
        
        const rewardsTitle = document.createElement('h4');
        rewardsTitle.textContent = '獎勵';
        rewards.appendChild(rewardsTitle);
        
        const rewardItem = document.createElement('div');
        rewardItem.className = 'reward-item';
        
        const rewardName = document.createElement('span');
        rewardName.className = 'reward-name';
        rewardName.textContent = '神典石';
        rewardItem.appendChild(rewardName);
        
        const rewardValue = document.createElement('span');
        rewardValue.className = 'reward-value';
        rewardValue.textContent = dungeon.tombstoneReward;
        rewardItem.appendChild(rewardValue);
        
        rewards.appendChild(rewardItem);
        content.appendChild(rewards);
        
        // Special drops
        if (dungeon.specialDrops && dungeon.specialDrops.length > 0) {
            const specialDrops = document.createElement('div');
            specialDrops.className = DungeonDatabase.CONSTANTS.CSS_CLASSES.SPECIAL_DROPS;
            
            const dropsTitle = document.createElement('h4');
            dropsTitle.textContent = '特殊掉落物';
            specialDrops.appendChild(dropsTitle);
            
            const dropsList = document.createElement('div');
            dropsList.className = 'drops-list';
            
            dungeon.specialDrops.forEach(drop => {
                const dropItem = document.createElement('span');
                dropItem.className = DungeonDatabase.CONSTANTS.CSS_CLASSES.DROP_ITEM;
                dropItem.textContent = drop;
                dropsList.appendChild(dropItem);
            });
            
            specialDrops.appendChild(dropsList);
            content.appendChild(specialDrops);
        }
        
        // Description - Mechanics
        const mechanicsDiv = document.createElement('div');
        mechanicsDiv.className = 'dungeon-description';
        
        const mechanicsLabel = document.createElement('strong');
        mechanicsLabel.textContent = '機制說明：';
        mechanicsDiv.appendChild(mechanicsLabel);
        
        const highlightedMechanics = this.highlightSearchTermsDOM(dungeon.mechanics, this.currentSearchTerm);
        mechanicsDiv.appendChild(highlightedMechanics);
        content.appendChild(mechanicsDiv);
        
        // Description - Main description
        const descriptionDiv = document.createElement('div');
        descriptionDiv.className = 'dungeon-description';
        const highlightedDescription = this.highlightSearchTermsDOM(dungeon.description, this.currentSearchTerm);
        descriptionDiv.appendChild(highlightedDescription);
        content.appendChild(descriptionDiv);
        
        card.appendChild(content);
        
        return card;
    }
    
    highlightSearchTermsDOM(text, searchTerm) {
        const container = document.createDocumentFragment();
        
        if (!searchTerm || searchTerm.length < 2) {
            container.appendChild(document.createTextNode(text));
            return container;
        }
        
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const parts = text.split(regex);
        
        parts.forEach(part => {
            if (part.toLowerCase() === searchTerm.toLowerCase()) {
                const mark = document.createElement('mark');
                mark.textContent = part;
                container.appendChild(mark);
            } else {
                container.appendChild(document.createTextNode(part));
            }
        });
        
        return container;
    }

    attachCardEvents(container) {
        // This method is no longer needed as we add events in displayDungeons
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