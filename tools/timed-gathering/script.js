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
        this.timeCalculator = null;
        this.currentListId = 'default';
        this.debounceTimer = null;
        this.currentLanguage = window.i18n.getCurrentLanguage();
        
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
            dialogConfirm: document.getElementById('dialogConfirm'),
            
            // 語言選擇器
            languageButtons: document.querySelectorAll('.language-btn')
        };
        
        this.initialize();
    }

    async initialize() {
        try {
            // 初始化模組
            this.listManager = new ListManager();
            this.macroExporter = new MacroExporter();
            this.searchFilter = new SearchFilter();
            this.timeCalculator = new TimeCalculator();
            this.notificationManager = new NotificationManager();
            
            // 將 NotificationManager 實例暴露到全域，以便事件處理器能夠存取
            window.notificationManager = this.notificationManager;
            
            // 載入資料
            await this.loadData();
            
            // 初始化事件
            this.initializeEvents();
            
            // 初始化通知設定
            this.initializeNotifications();
            
            // 載入清單
            this.loadLists();
            
            // 初始顯示
            this.updateDisplay();
            
        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError(window.i18n.getText('initFailedError'));
        }
    }

    async loadData() {
        this.showLoading(true);
        try {
            const response = await fetch('../../data/timed-gathering.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const jsonText = await response.text();
            
            // Define schema for gathering items
            const itemSchema = {
                required: ['items'],
                properties: {
                    items: {
                        type: 'array',
                        minItems: 0
                    }
                }
            };
            
            // Use safe JSON parsing with schema validation
            const parseResult = SecurityUtils.safeJSONParse(jsonText, itemSchema);
            
            if (!parseResult.success) {
                throw new Error(parseResult.error);
            }
            
            // Validate and sanitize each item in the array
            const items = parseResult.data.items || [];
            this.data = items.filter(item => {
                // Basic validation for each item
                return item && 
                       typeof item.id === 'string' && 
                       typeof item.name === 'string' &&
                       typeof item.type === 'string' &&
                       (typeof item.level === 'number' || typeof item.level === 'string') &&
                       typeof item.zone === 'string';
            });
            
            this.filteredData = [...this.data];
            
            // 更新項目計數
            this.updateItemCount();
            
        } catch (error) {
            console.error('載入資料失敗:', error);
            this.showError(window.i18n.getText('dataLoadFailedError'));
        } finally {
            this.showLoading(false);
        }
    }

    initializeEvents() {
        // 語言切換
        this.elements.languageButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang;
                this.switchLanguage(lang);
            });
        });
        
        // 初始化語言按鈕狀態
        this.updateLanguageButtons();
        
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

    initializeNotifications() {
        const notificationToggle = document.getElementById('notificationToggle');
        const notificationStatus = document.getElementById('notificationStatus');
        const testNotificationBtn = document.getElementById('testNotificationBtn');

        // 初始化通知狀態
        if (this.notificationManager.enabled) {
            notificationToggle.checked = true;
        }
        this.updateNotificationStatus();

        // 通知開關事件
        notificationToggle.addEventListener('change', async () => {
            if (notificationToggle.checked) {
                const enabled = await this.notificationManager.enableNotifications();
                if (enabled) {
                    // 更新監控清單
                    const currentList = this.listManager.getList(this.currentListId);
                    if (currentList && currentList.items) {
                        this.notificationManager.updateWatchList(currentList.items);
                    }
                } else {
                    notificationToggle.checked = false;
                }
            } else {
                this.notificationManager.disableNotifications();
            }
            this.updateNotificationStatus();
        });

        // 測試通知按鈕事件
        testNotificationBtn.addEventListener('click', () => {
            this.notificationManager.testNotification();
        });
    }

    updateNotificationStatus() {
        const notificationStatus = document.getElementById('notificationStatus');
        if (notificationStatus) {
            const status = this.notificationManager.getNotificationStatus();
            notificationStatus.textContent = status;
            
            // 根據狀態設定樣式
            notificationStatus.classList.remove('status-enabled', 'status-disabled', 'status-denied');
            if (this.notificationManager.enabled) {
                notificationStatus.classList.add('status-enabled');
            } else if (Notification.permission === 'denied') {
                notificationStatus.classList.add('status-denied');
            } else {
                notificationStatus.classList.add('status-disabled');
            }
        }
    }

    switchLanguage(lang) {
        this.currentLanguage = lang;
        window.i18n.setLanguage(lang);
        this.updateLanguageButtons();
        this.updateDisplay();
        this.updateListDisplay();
        this.updateNotificationStatus(); // 更新通知狀態文字
    }
    
    updateLanguageButtons() {
        this.elements.languageButtons.forEach(btn => {
            const isActive = btn.dataset.lang === this.currentLanguage;
            btn.classList.toggle('active', isActive);
        });
    }

    debounceSearch() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.applyFilters();
        }, TimedGatheringManager.CONSTANTS.DEBOUNCE_DELAY);
    }

    applyFilters() {
        // Sanitize search input to prevent XSS
        const rawSearchTerm = this.elements.searchInput.value;
        const searchTerm = SecurityUtils.sanitizeInput(rawSearchTerm).toLowerCase();
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
            emptyMessage.textContent = window.i18n.getText('noItemsFound');
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
        // 根據當前語言顯示名稱
        const displayName = this.currentLanguage === 'ja' && item.nameJp ? item.nameJp : item.name;
        title.textContent = displayName;
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
        // 根據當前語言顯示地區和位置
        const displayZone = this.currentLanguage === 'ja' && item.zoneJp ? item.zoneJp : item.zone;
        const displayLocation = this.currentLanguage === 'ja' && item.locationJp ? item.locationJp : item.location;
        zoneDiv.textContent = `📍 ${displayZone} - ${displayLocation}`;
        info.appendChild(zoneDiv);
        
        const coordsDiv = document.createElement('div');
        coordsDiv.className = 'item-coords';
        coordsDiv.textContent = `📐 ${item.coordinates}`;
        info.appendChild(coordsDiv);
        
        const versionDiv = document.createElement('div');
        versionDiv.className = 'item-version';
        versionDiv.textContent = `v${item.expansion}`;
        info.appendChild(versionDiv);
        
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
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.updateButtonContent(
            addBtn,
            isInList ? '✔️' : '➕',
            isInList ? window.i18n.getText('addedToListButton') : window.i18n.getText('addToListButton')
        );
        addBtn.disabled = isInList;
        
        addBtn.addEventListener('click', () => {
            this.addItemToList(item);
            addBtn.className = 'btn btn-success btn-sm';
            // Use safe DOM manipulation instead of innerHTML
            SecurityUtils.updateButtonContent(addBtn, '✔️', window.i18n.getText('addedToListButton'));
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
            this.showNotification(window.i18n.getText('addedToListNotification'), 'success');
        } else {
            this.showNotification(result.message, 'warning');
        }
    }

    updateListDisplay() {
        const list = this.listManager.getList(this.currentListId);
        const container = this.elements.listItems;
        container.innerHTML = '';
        
        if (!list || list.items.length === 0) {
            // Use safe DOM manipulation instead of innerHTML
            const emptyMessage = SecurityUtils.createEmptyMessage(
                window.i18n.getText('emptyListMessage'),
                window.i18n.getText('emptyListHint')
            );
            container.appendChild(emptyMessage);
            
            // 清空通知監控列表
            if (this.notificationManager) {
                this.notificationManager.updateWatchList([]);
            }
            return;
        }
        
        list.items.forEach(item => {
            const listItem = this.createListItem(item);
            container.appendChild(listItem);
        });
        
        // 更新通知監控列表
        if (this.notificationManager && this.notificationManager.enabled) {
            this.notificationManager.updateWatchList(list.items);
        }
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
        // 根據當前語言顯示名稱
        const displayName = this.currentLanguage === 'ja' && item.nameJp ? item.nameJp : item.name;
        name.textContent = displayName;
        info.appendChild(name);
        
        const version = document.createElement('span');
        version.className = 'list-item-version';
        version.textContent = `v${item.expansion}`;
        info.appendChild(version);
        
        const time = document.createElement('span');
        time.className = 'list-item-time';
        time.textContent = item.time;
        info.appendChild(time);
        
        div.appendChild(info);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-sm btn-danger';
        removeBtn.textContent = '🗑️';  // Use textContent instead of innerHTML
        removeBtn.title = window.i18n.getText('removeFromList');
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
        this.showNotification(window.i18n.getText('removedFromListNotification'), 'info');
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
            this.showNotification(window.i18n.getText('maxListsWarning') + ' ' + TimedGatheringManager.CONSTANTS.MAX_LISTS + ' ' + window.i18n.getText('maxListsUnit'), 'warning');
            return;
        }
        
        this.elements.dialogTitle.textContent = window.i18n.getText('newListDialogTitle');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);
        const formGroup = SecurityUtils.createFormGroup({
            label: window.i18n.getText('listNameLabel'),
            inputId: 'newListName',
            placeholder: window.i18n.getText('enterListNamePlaceholder'),
            maxLength: TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH
        });
        this.elements.dialogBody.appendChild(formGroup);
        
        this.elements.dialogConfirm.onclick = () => {
            const input = document.getElementById('newListName');
            const rawName = input.value.trim();
            
            // Validate and sanitize input
            if (!SecurityUtils.validateTextLength(rawName, 1, TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH)) {
                this.showNotification(window.i18n.getText('invalidListNameError'), 'error');
                return;
            }
            
            // Sanitize the name to prevent XSS
            const name = SecurityUtils.sanitizeInput(rawName);
            
            if (name) {
                const result = this.listManager.createList(name);
                if (result.success) {
                    this.loadLists();
                    this.switchToList(result.listId);
                    this.hideDialog();
                    this.showNotification(window.i18n.getText('listCreatedNotification'), 'success');
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
        
        this.elements.dialogTitle.textContent = window.i18n.getText('renameListDialogTitle');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);
        const formGroup = SecurityUtils.createFormGroup({
            label: window.i18n.getText('newNameLabel'),
            inputId: 'renameListInput',
            value: currentList.name,
            maxLength: TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH
        });
        this.elements.dialogBody.appendChild(formGroup);
        
        this.elements.dialogConfirm.onclick = () => {
            const input = document.getElementById('renameListInput');
            const rawName = input.value.trim();
            
            // Validate and sanitize input
            if (!SecurityUtils.validateTextLength(rawName, 1, TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH)) {
                this.showNotification(window.i18n.getText('invalidListNameError'), 'error');
                return;
            }
            
            // Sanitize the name to prevent XSS
            const newName = SecurityUtils.sanitizeInput(rawName);
            
            if (newName && newName !== currentList.name) {
                const result = this.listManager.renameList(this.currentListId, newName);
                if (result.success) {
                    this.loadLists();
                    this.elements.currentListName.textContent = newName;
                    this.hideDialog();
                    this.showNotification(window.i18n.getText('listRenamedNotification'), 'success');
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
            this.showNotification(window.i18n.getText('atLeastOneListWarning'), 'warning');
            return;
        }
        
        const currentList = this.listManager.getList(this.currentListId);
        
        this.elements.dialogTitle.textContent = window.i18n.getText('deleteListDialogTitle');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);
        
        const confirmText = document.createElement('p');
        confirmText.textContent = window.i18n.getText('confirmDeleteList') + `「${currentList.name}」嗎？`;
        
        const warningText = document.createElement('p');
        warningText.className = 'text-danger';
        warningText.textContent = window.i18n.getText('operationCannotUndo');
        
        this.elements.dialogBody.appendChild(confirmText);
        this.elements.dialogBody.appendChild(warningText);
        
        this.elements.dialogConfirm.onclick = () => {
            const result = this.listManager.deleteList(this.currentListId);
            if (result.success) {
                const remainingLists = this.listManager.getAllLists();
                this.loadLists();
                if (remainingLists.length > 0) {
                    this.switchToList(remainingLists[0].id);
                }
                this.hideDialog();
                this.showNotification(window.i18n.getText('listDeletedNotification'), 'success');
            } else {
                this.showNotification(result.message, 'error');
            }
        };
        
        this.showDialog();
    }

    clearCurrentList() {
        const list = this.listManager.getList(this.currentListId);
        
        if (!list || list.items.length === 0) {
            this.showNotification(window.i18n.getText('listAlreadyEmptyInfo'), 'info');
            return;
        }
        
        this.elements.dialogTitle.textContent = window.i18n.getText('clearListDialogTitle');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);
        
        const confirmText = document.createElement('p');
        confirmText.textContent = window.i18n.getText('confirmClearList') + `「${list.name}」嗎？`;
        
        const itemCountText = document.createElement('p');
        itemCountText.textContent = window.i18n.getText('willRemoveItems') + ' ' + list.items.length + ' ' + window.i18n.getText('itemsUnit');
        
        this.elements.dialogBody.appendChild(confirmText);
        this.elements.dialogBody.appendChild(itemCountText);
        
        this.elements.dialogConfirm.onclick = () => {
            this.listManager.clearList(this.currentListId);
            this.updateListDisplay();
            this.updateDisplay();
            this.hideDialog();
            this.showNotification(window.i18n.getText('listClearedNotification'), 'success');
        };
        
        this.showDialog();
    }

    generateMacro() {
        const list = this.listManager.getList(this.currentListId);
        
        if (!list || list.items.length === 0) {
            this.showNotification(window.i18n.getText('emptyListNoMacroWarning'), 'warning');
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
            this.showNotification(window.i18n.getText('noMacroToCopyWarning'), 'warning');
            return;
        }
        
        navigator.clipboard.writeText(macroText).then(() => {
            this.showNotification(window.i18n.getText('macroCopiedNotification'), 'success');
            
            // 暫時改變按鈕文字
            // Store original button content
            const originalIcon = this.elements.copyMacroBtn.querySelector('.btn-icon')?.textContent || '📋';
            const originalText = this.elements.copyMacroBtn.textContent.replace(originalIcon, '').trim();
            
            // Update button safely
            SecurityUtils.updateButtonContent(this.elements.copyMacroBtn, '✔️', window.i18n.getText('copiedButton'));
            
            setTimeout(() => {
                // Restore original content
                SecurityUtils.updateButtonContent(this.elements.copyMacroBtn, originalIcon, originalText || window.i18n.getText('copyMacroButton'));
            }, 2000);
        }).catch(err => {
            console.error('複製失敗:', err);
            this.showNotification(window.i18n.getText('copyFailedError'), 'error');
        });
    }

    showImportDialog() {
        this.elements.dialogTitle.textContent = window.i18n.getText('importDialogTitle');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);
        
        const formGroup = SecurityUtils.createFormGroup({
            label: window.i18n.getText('selectFileLabel'),
            inputId: 'importFile',
            inputType: 'file',
            accept: '.json'
        });
        
        const helpText = document.createElement('p');
        helpText.className = 'text-muted';
        helpText.textContent = window.i18n.getText('selectJsonFileHint');
        
        this.elements.dialogBody.appendChild(formGroup);
        this.elements.dialogBody.appendChild(helpText);
        
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
            // Define schema for import data
            const importSchema = {
                required: ['version', 'lists'],
                properties: {
                    version: { type: 'string' },
                    lists: { type: 'array', minItems: 0 },
                    exportDate: { type: 'string' }
                }
            };
            
            // Use safe JSON parsing with schema validation
            const parseResult = SecurityUtils.safeJSONParse(e.target.result, importSchema);
            
            if (!parseResult.success) {
                console.error('匯入失敗:', parseResult.error);
                this.showNotification(window.i18n.getText('fileFormatError') + ': ' + parseResult.error, 'error');
                return;
            }
            
            const result = this.listManager.importLists(parseResult.data);
            
            if (result.success) {
                this.loadLists();
                this.hideDialog();
                this.showNotification(window.i18n.getText('listsImportedNotification') + ' ' + result.count + ' ' + window.i18n.getText('listsImportedUnit'), 'success');
            } else {
                this.showNotification(result.message, 'error');
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
        
        this.showNotification(window.i18n.getText('listsExportedNotification'), 'success');
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