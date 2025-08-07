// 特殊採集時間管理器主控制器
class TimedGatheringManager {
    static CONSTANTS = {
        DEBOUNCE_DELAY: 300,
        STORAGE_KEY_PREFIX: 'ff14tw_timed_gathering_',
        DEFAULT_LIST_NAME: '預設清單',
        MAX_LIST_NAME_LENGTH: 50,
        MAX_LISTS: 10
    };

    constructor() {
        this.data = [];
        this.filteredData = [];
        this.listManager = null;
        this.macroExporter = null;
        this.searchFilter = null;
        this.currentListId = 'default';
        this.debounceTimer = null;
        
        this.elements = {
            // 搜尋與篩選
            searchInput: document.getElementById('searchInput'),
            clearSearchBtn: document.getElementById('clearSearchBtn'),
            typeFilters: document.getElementById('typeFilters'),
            expansionFilters: document.getElementById('expansionFilters'),
            
            // 項目顯示
            itemsContainer: document.getElementById('itemsContainer'),
            itemCount: document.getElementById('itemCount'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            errorMessage: document.getElementById('errorMessage'),
            
            // 清單管理
            listTabs: document.getElementById('listTabs'),
            currentListName: document.getElementById('currentListName'),
            listItems: document.getElementById('listItems'),
            newListBtn: document.getElementById('newListBtn'),
            renameListBtn: document.getElementById('renameListBtn'),
            deleteListBtn: document.getElementById('deleteListBtn'),
            clearListBtn: document.getElementById('clearListBtn'),
            
            // 匯入/匯出
            importBtn: document.getElementById('importBtn'),
            exportBtn: document.getElementById('exportBtn'),
            
            // 巨集
            generateMacroBtn: document.getElementById('generateMacroBtn'),
            includeClearCmd: document.getElementById('includeClearCmd'),
            sortByTime: document.getElementById('sortByTime'),
            macroOutput: document.getElementById('macroOutput'),
            macroText: document.getElementById('macroText'),
            copyMacroBtn: document.getElementById('copyMacroBtn'),
            
            // 對話框
            dialogOverlay: document.getElementById('dialogOverlay'),
            dialogTitle: document.getElementById('dialogTitle'),
            dialogBody: document.getElementById('dialogBody'),
            dialogClose: document.getElementById('dialogClose'),
            dialogCancel: document.getElementById('dialogCancel'),
            dialogConfirm: document.getElementById('dialogConfirm')
        };
        
        this.initialize();
    }

    async initialize() {
        try {
            // 初始化模組
            this.listManager = new ListManager();
            this.macroExporter = new MacroExporter();
            this.searchFilter = new SearchFilter();
            
            // 載入資料
            await this.loadData();
            
            // 初始化事件
            this.initializeEvents();
            
            // 載入清單
            this.loadLists();
            
            // 初始顯示
            this.updateDisplay();
            
        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError('初始化失敗，請重新整理頁面');
        }
    }

    async loadData() {
        this.showLoading(true);
        try {
            const response = await fetch('../../data/timed-gathering.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const jsonData = await response.json();
            this.data = jsonData.items || [];
            this.filteredData = [...this.data];
            
            // 更新項目計數
            this.updateItemCount();
            
        } catch (error) {
            console.error('載入資料失敗:', error);
            this.showError('載入採集物資料失敗，請重新整理頁面再試');
        } finally {
            this.showLoading(false);
        }
    }

    initializeEvents() {
        // 搜尋
        this.elements.searchInput.addEventListener('input', () => {
            this.debounceSearch();
        });
        
        this.elements.clearSearchBtn.addEventListener('click', () => {
            this.elements.searchInput.value = '';
            this.applyFilters();
        });
        
        // 類型篩選
        this.elements.typeFilters.querySelectorAll('.tag-filter').forEach(tag => {
            tag.addEventListener('click', () => {
                tag.classList.toggle('active');
                this.applyFilters();
            });
        });
        
        // 資料片篩選
        this.elements.expansionFilters.querySelectorAll('.tag-filter').forEach(tag => {
            tag.addEventListener('click', () => {
                tag.classList.toggle('active');
                this.applyFilters();
            });
        });
        
        // 清單管理
        this.elements.newListBtn.addEventListener('click', () => {
            this.showNewListDialog();
        });
        
        this.elements.renameListBtn.addEventListener('click', () => {
            this.showRenameListDialog();
        });
        
        this.elements.deleteListBtn.addEventListener('click', () => {
            this.showDeleteListDialog();
        });
        
        this.elements.clearListBtn.addEventListener('click', () => {
            this.clearCurrentList();
        });
        
        // 匯入/匯出
        this.elements.importBtn.addEventListener('click', () => {
            this.showImportDialog();
        });
        
        this.elements.exportBtn.addEventListener('click', () => {
            this.exportLists();
        });
        
        // 巨集
        this.elements.generateMacroBtn.addEventListener('click', () => {
            this.generateMacro();
        });
        
        this.elements.copyMacroBtn.addEventListener('click', () => {
            this.copyMacroToClipboard();
        });
        
        // 對話框
        this.elements.dialogClose.addEventListener('click', () => {
            this.hideDialog();
        });
        
        this.elements.dialogCancel.addEventListener('click', () => {
            this.hideDialog();
        });
        
        // ESC 關閉對話框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.dialogOverlay.style.display !== 'none') {
                this.hideDialog();
            }
        });
    }

    debounceSearch() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.applyFilters();
        }, TimedGatheringManager.CONSTANTS.DEBOUNCE_DELAY);
    }

    applyFilters() {
        const searchTerm = this.elements.searchInput.value.toLowerCase();
        const activeTypes = Array.from(this.elements.typeFilters.querySelectorAll('.tag-filter.active'))
            .map(tag => tag.dataset.type);
        const activeExpansions = Array.from(this.elements.expansionFilters.querySelectorAll('.tag-filter.active'))
            .map(tag => tag.dataset.expansion);
        
        this.filteredData = this.searchFilter.filter(this.data, {
            searchTerm,
            types: activeTypes,
            expansions: activeExpansions
        });
        
        this.updateDisplay();
    }

    updateDisplay() {
        this.renderItems();
        this.updateItemCount();
    }

    renderItems() {
        const container = this.elements.itemsContainer;
        container.innerHTML = '';
        
        if (this.filteredData.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = '沒有符合條件的採集物';
            container.appendChild(emptyMessage);
            return;
        }
        
        this.filteredData.forEach(item => {
            const card = this.createItemCard(item);
            container.appendChild(card);
        });
    }

    createItemCard(item) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.dataset.itemId = item.id;
        
        const typeIcon = this.getTypeIcon(item.type);
        const isInList = this.listManager.hasInCurrentList(this.currentListId, item.id);
        
        const header = document.createElement('div');
        header.className = 'item-header';
        
        const titleSection = document.createElement('div');
        titleSection.className = 'item-title-section';
        
        const typeSpan = document.createElement('span');
        typeSpan.className = 'item-type';
        typeSpan.textContent = typeIcon;
        titleSection.appendChild(typeSpan);
        
        const title = document.createElement('h3');
        title.className = 'item-name';
        title.textContent = item.name;
        titleSection.appendChild(title);
        
        header.appendChild(titleSection);
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'item-time';
        timeSpan.textContent = item.time;
        header.appendChild(timeSpan);
        
        card.appendChild(header);
        
        const body = document.createElement('div');
        body.className = 'item-body';
        
        const info = document.createElement('div');
        info.className = 'item-info';
        
        const zoneDiv = document.createElement('div');
        zoneDiv.className = 'item-zone';
        zoneDiv.textContent = `📍 ${item.zone} - ${item.location}`;
        info.appendChild(zoneDiv);
        
        const coordsDiv = document.createElement('div');
        coordsDiv.className = 'item-coords';
        coordsDiv.textContent = `📐 ${item.coordinates}`;
        info.appendChild(coordsDiv);
        
        const levelDiv = document.createElement('div');
        levelDiv.className = 'item-level';
        levelDiv.textContent = `Lv.${item.level}`;
        info.appendChild(levelDiv);
        
        body.appendChild(info);
        
        if (item.description) {
            const desc = document.createElement('p');
            desc.className = 'item-description';
            desc.textContent = item.description;
            body.appendChild(desc);
        }
        
        card.appendChild(body);
        
        const footer = document.createElement('div');
        footer.className = 'item-footer';
        
        const addBtn = document.createElement('button');
        addBtn.className = isInList ? 'btn btn-success btn-sm' : 'btn btn-primary btn-sm';
        addBtn.innerHTML = isInList ? 
            '<span class="btn-icon">✔️</span> 已加入' : 
            '<span class="btn-icon">➕</span> 加入清單';
        addBtn.disabled = isInList;
        
        addBtn.addEventListener('click', () => {
            this.addItemToList(item);
            addBtn.className = 'btn btn-success btn-sm';
            addBtn.innerHTML = '<span class="btn-icon">✔️</span> 已加入';
            addBtn.disabled = true;
        });
        
        footer.appendChild(addBtn);
        card.appendChild(footer);
        
        return card;
    }

    getTypeIcon(type) {
        const icons = {
            'mining': '⛏️',
            'botany': '🌿',
            'fishing': '🎣'
        };
        return icons[type] || '❓';
    }

    addItemToList(item) {
        const result = this.listManager.addToList(this.currentListId, item);
        if (result.success) {
            this.updateListDisplay();
            this.showNotification('已加入清單', 'success');
        } else {
            this.showNotification(result.message, 'warning');
        }
    }

    updateListDisplay() {
        const list = this.listManager.getList(this.currentListId);
        const container = this.elements.listItems;
        container.innerHTML = '';
        
        if (!list || list.items.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-list-message';
            emptyMessage.innerHTML = `
                <p>清單為空</p>
                <small>從左側點擊「加入清單」按鈕來新增採集物</small>
            `;
            container.appendChild(emptyMessage);
            return;
        }
        
        list.items.forEach(item => {
            const listItem = this.createListItem(item);
            container.appendChild(listItem);
        });
    }

    createListItem(item) {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.dataset.itemId = item.id;
        
        const info = document.createElement('div');
        info.className = 'list-item-info';
        
        const typeIcon = document.createElement('span');
        typeIcon.className = 'list-item-type';
        typeIcon.textContent = this.getTypeIcon(item.type);
        info.appendChild(typeIcon);
        
        const name = document.createElement('span');
        name.className = 'list-item-name';
        name.textContent = item.name;
        info.appendChild(name);
        
        const time = document.createElement('span');
        time.className = 'list-item-time';
        time.textContent = item.time;
        info.appendChild(time);
        
        div.appendChild(info);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-sm btn-danger';
        removeBtn.innerHTML = '🗑️';
        removeBtn.title = '移除';
        removeBtn.addEventListener('click', () => {
            this.removeItemFromList(item.id);
        });
        
        div.appendChild(removeBtn);
        
        return div;
    }

    removeItemFromList(itemId) {
        this.listManager.removeFromList(this.currentListId, itemId);
        this.updateListDisplay();
        this.updateDisplay(); // 更新左側顯示
        this.showNotification('已從清單移除', 'info');
    }

    loadLists() {
        const lists = this.listManager.getAllLists();
        this.renderListTabs(lists);
        
        if (lists.length > 0) {
            this.switchToList(lists[0].id);
        }
    }

    renderListTabs(lists) {
        const container = this.elements.listTabs;
        container.innerHTML = '';
        
        lists.forEach(list => {
            const tab = document.createElement('button');
            tab.className = 'list-tab';
            tab.dataset.listId = list.id;
            tab.textContent = list.name;
            
            if (list.id === this.currentListId) {
                tab.classList.add('active');
            }
            
            tab.addEventListener('click', () => {
                this.switchToList(list.id);
            });
            
            container.appendChild(tab);
        });
    }

    switchToList(listId) {
        this.currentListId = listId;
        const list = this.listManager.getList(listId);
        
        if (list) {
            this.elements.currentListName.textContent = list.name;
            
            // 更新標籤頁狀態
            this.elements.listTabs.querySelectorAll('.list-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.listId === listId);
            });
            
            // 更新清單顯示
            this.updateListDisplay();
            
            // 更新左側項目顯示
            this.updateDisplay();
        }
    }

    showNewListDialog() {
        if (this.listManager.getAllLists().length >= TimedGatheringManager.CONSTANTS.MAX_LISTS) {
            this.showNotification(`最多只能建立 ${TimedGatheringManager.CONSTANTS.MAX_LISTS} 個清單`, 'warning');
            return;
        }
        
        this.elements.dialogTitle.textContent = '新增清單';
        this.elements.dialogBody.innerHTML = `
            <div class="form-group">
                <label for="newListName">清單名稱：</label>
                <input type="text" id="newListName" class="form-control" 
                       placeholder="輸入清單名稱" maxlength="${TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH}">
            </div>
        `;
        
        this.elements.dialogConfirm.onclick = () => {
            const input = document.getElementById('newListName');
            const name = input.value.trim();
            
            if (name) {
                const result = this.listManager.createList(name);
                if (result.success) {
                    this.loadLists();
                    this.switchToList(result.listId);
                    this.hideDialog();
                    this.showNotification('清單已建立', 'success');
                } else {
                    this.showNotification(result.message, 'error');
                }
            }
        };
        
        this.showDialog();
        
        // 自動聚焦輸入框
        setTimeout(() => {
            document.getElementById('newListName').focus();
        }, 100);
    }

    showRenameListDialog() {
        const currentList = this.listManager.getList(this.currentListId);
        
        this.elements.dialogTitle.textContent = '重新命名清單';
        this.elements.dialogBody.innerHTML = `
            <div class="form-group">
                <label for="renameListInput">新名稱：</label>
                <input type="text" id="renameListInput" class="form-control" 
                       value="${currentList.name}" maxlength="${TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH}">
            </div>
        `;
        
        this.elements.dialogConfirm.onclick = () => {
            const input = document.getElementById('renameListInput');
            const newName = input.value.trim();
            
            if (newName && newName !== currentList.name) {
                const result = this.listManager.renameList(this.currentListId, newName);
                if (result.success) {
                    this.loadLists();
                    this.elements.currentListName.textContent = newName;
                    this.hideDialog();
                    this.showNotification('清單已重新命名', 'success');
                } else {
                    this.showNotification(result.message, 'error');
                }
            }
        };
        
        this.showDialog();
        
        // 自動選取文字
        setTimeout(() => {
            const input = document.getElementById('renameListInput');
            input.select();
        }, 100);
    }

    showDeleteListDialog() {
        const lists = this.listManager.getAllLists();
        
        if (lists.length <= 1) {
            this.showNotification('至少需要保留一個清單', 'warning');
            return;
        }
        
        const currentList = this.listManager.getList(this.currentListId);
        
        this.elements.dialogTitle.textContent = '刪除清單';
        this.elements.dialogBody.innerHTML = `
            <p>確定要刪除清單「${currentList.name}」嗎？</p>
            <p class="text-danger">此操作無法復原！</p>
        `;
        
        this.elements.dialogConfirm.onclick = () => {
            const result = this.listManager.deleteList(this.currentListId);
            if (result.success) {
                const remainingLists = this.listManager.getAllLists();
                this.loadLists();
                if (remainingLists.length > 0) {
                    this.switchToList(remainingLists[0].id);
                }
                this.hideDialog();
                this.showNotification('清單已刪除', 'success');
            } else {
                this.showNotification(result.message, 'error');
            }
        };
        
        this.showDialog();
    }

    clearCurrentList() {
        const list = this.listManager.getList(this.currentListId);
        
        if (!list || list.items.length === 0) {
            this.showNotification('清單已經是空的', 'info');
            return;
        }
        
        this.elements.dialogTitle.textContent = '清空清單';
        this.elements.dialogBody.innerHTML = `
            <p>確定要清空清單「${list.name}」嗎？</p>
            <p>將移除 ${list.items.length} 個採集物</p>
        `;
        
        this.elements.dialogConfirm.onclick = () => {
            this.listManager.clearList(this.currentListId);
            this.updateListDisplay();
            this.updateDisplay();
            this.hideDialog();
            this.showNotification('清單已清空', 'success');
        };
        
        this.showDialog();
    }

    generateMacro() {
        const list = this.listManager.getList(this.currentListId);
        
        if (!list || list.items.length === 0) {
            this.showNotification('清單為空，無法生成巨集', 'warning');
            return;
        }
        
        const options = {
            includeClear: this.elements.includeClearCmd.checked,
            sortByTime: this.elements.sortByTime.checked
        };
        
        const macro = this.macroExporter.generate(list.items, options);
        
        this.elements.macroText.value = macro;
        this.elements.macroOutput.style.display = 'block';
        
        // 滾動到巨集區域
        this.elements.macroOutput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    copyMacroToClipboard() {
        const macroText = this.elements.macroText.value;
        
        if (!macroText) {
            this.showNotification('沒有巨集可複製', 'warning');
            return;
        }
        
        navigator.clipboard.writeText(macroText).then(() => {
            this.showNotification('巨集已複製到剪貼簿', 'success');
            
            // 暫時改變按鈕文字
            const originalText = this.elements.copyMacroBtn.innerHTML;
            this.elements.copyMacroBtn.innerHTML = '<span class="btn-icon">✔️</span> 已複製！';
            setTimeout(() => {
                this.elements.copyMacroBtn.innerHTML = originalText;
            }, 2000);
        }).catch(err => {
            console.error('複製失敗:', err);
            this.showNotification('複製失敗，請手動選取複製', 'error');
        });
    }

    showImportDialog() {
        this.elements.dialogTitle.textContent = '匯入清單';
        this.elements.dialogBody.innerHTML = `
            <div class="form-group">
                <label for="importFile">選擇檔案：</label>
                <input type="file" id="importFile" class="form-control" accept=".json">
            </div>
            <p class="text-muted">請選擇之前匯出的 JSON 檔案</p>
        `;
        
        this.elements.dialogConfirm.onclick = () => {
            const fileInput = document.getElementById('importFile');
            const file = fileInput.files[0];
            
            if (file) {
                this.importFile(file);
            }
        };
        
        this.showDialog();
    }

    importFile(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const result = this.listManager.importLists(data);
                
                if (result.success) {
                    this.loadLists();
                    this.hideDialog();
                    this.showNotification(`成功匯入 ${result.count} 個清單`, 'success');
                } else {
                    this.showNotification(result.message, 'error');
                }
            } catch (error) {
                console.error('匯入失敗:', error);
                this.showNotification('檔案格式錯誤', 'error');
            }
        };
        
        reader.readAsText(file);
    }

    exportLists() {
        const data = this.listManager.exportLists();
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ff14tw_timed_gathering_lists_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        this.showNotification('清單已匯出', 'success');
    }

    updateItemCount() {
        this.elements.itemCount.textContent = `(${this.filteredData.length} / ${this.data.length})`;
    }

    showDialog() {
        this.elements.dialogOverlay.style.display = 'flex';
    }

    hideDialog() {
        this.elements.dialogOverlay.style.display = 'none';
    }

    showLoading(show) {
        this.elements.loadingIndicator.style.display = show ? 'flex' : 'none';
        this.elements.itemsContainer.style.display = show ? 'none' : 'block';
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.style.display = 'block';
        this.elements.loadingIndicator.style.display = 'none';
        this.elements.itemsContainer.style.display = 'none';
    }

    showNotification(message, type = 'info') {
        // 建立通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // 加入到 body
        document.body.appendChild(notification);
        
        // 顯示動畫
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // 3 秒後移除
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    new TimedGatheringManager();
});