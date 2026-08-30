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
            // Explicitly load translations for this tool.
            if (window.i18n && window.TimedGatheringTranslations) {
                window.i18n.loadTranslations('timed-gathering', window.TimedGatheringTranslations);
                // Re-apply i18n because this tool's translation namespace is loaded after the global
                // i18n initialization. At this point, some timed-gathering UI elements may already
                // have been rendered with data-i18n attributes, and they will not be translated
                // until we trigger a page-wide language update.
                //
                // This call is the intended pattern for tools that load their translation namespace
                // lazily after the main i18n setup: first register the namespace, then invoke
                // updatePageLanguage() so existing DOM nodes are re-processed.
                // If the i18n bootstrapping flow is refactored in the future to load all namespaces
                // up front, this explicit re-application step may no longer be necessary.
                window.i18n.updatePageLanguage();
            }

            // 初始化模組
            this.listManager = new ListManager();
            this.modalManager = new ModalManager();
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
            this.showError(FF14Utils.getI18nText('initFailedError', 'Initialization failed, please refresh the page'));
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
            this.showError(FF14Utils.getI18nText('dataLoadFailedError', 'Failed to load item data, please refresh and try again'));
        } finally {
            this.showLoading(false);
        }
    }

    initializeEvents() {
        // 語言切換
        // 這些 .language-btn 是共用 header 切換器（nav-template.js／layout-loader.js 載入）插入的按鈕，
        // 點擊時已經由 I18nManager._initializeLanguageSwitcher() 掛在 .language-switcher 容器上的
        // 委派監聽器負責呼叫 window.i18n.setLanguage()，這裡不再另外掛一份按鈕點擊監聽器
        // （實測過：若兩邊都掛，同一次點擊 setLanguage() 會被呼叫兩次，下面的 observer 也會跟著
        // 重繪兩次）。這個 TimedGatheringManager 是全站 12 個工具裡唯一有自己 .language-btn
        // 監聽器的（其餘工具都只靠共用 header 的委派監聽器 + 自己的 onLanguageChange observer），
        // 屬於既有的重複邏輯，這裡一併拿掉、統一成跟其他工具一樣的寫法。
        // 重繪統一交給下面註冊的 onLanguageChange observer，不論語言變更是從共用 header 的按鈕，
        // 還是其他呼叫 window.i18n.setLanguage() 的地方觸發，都只會重繪一次；observer 本身不會呼叫
        // setLanguage()／switchLanguage()，所以不會有「setLanguage → 通知 observer → 又呼叫
        // setLanguage」的遞迴風險。
        // 語言切換時重新以目前語言重繪：按鈕狀態、右側顯示、清單畫面與通知狀態文字
        // （呼叫的方法與順序沿用原本 switchLanguage() 的重繪部分，只是不再由這裡呼叫 setLanguage()）
        window.i18n.onLanguageChange((lang) => {
            this.currentLanguage = lang;
            this.updateLanguageButtons();
            this.updateDisplay();
            this.updateListDisplay();
            this.updateNotificationStatus();
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
        this.elements.typeFilters.querySelectorAll('.chip').forEach(tag => {
            tag.addEventListener('click', () => {
                tag.classList.toggle('active');
                this.applyFilters();
            });
        });

        // 資料片篩選
        this.elements.expansionFilters.querySelectorAll('.chip').forEach(tag => {
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

        // ESC 關閉對話框 (由 ModalManager 處理)
        /*
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.dialogOverlay.style.display !== 'none') {
                this.hideDialog();
            }
        });
        */

        // 方向鍵在清單分頁間移動並直接切換
        this.elements.listTabs.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const tabs = Array.from(this.elements.listTabs.querySelectorAll('.list-tab'));
            const currentIndex = tabs.indexOf(document.activeElement);
            if (currentIndex === -1) return;
            e.preventDefault();
            const nextIndex = e.key === 'ArrowRight'
                ? (currentIndex + 1) % tabs.length
                : (currentIndex - 1 + tabs.length) % tabs.length;
            tabs[nextIndex].focus();
            tabs[nextIndex].click();
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

            // 根據狀態設定徽章樣式（共用 .tag）
            const statusClasses = ['tag-solid', 'tag-success', 'tag-danger'];
            notificationStatus.classList.remove(...statusClasses);

            if (this.notificationManager.enabled) {
                notificationStatus.classList.add('tag-solid', 'tag-success');
            } else if (Notification.permission === 'denied') {
                notificationStatus.classList.add('tag-solid', 'tag-danger');
            }
        }
    }

    updateLanguageButtons() {
        this.elements.languageButtons.forEach(btn => {
            const isActive = btn.dataset.lang === this.currentLanguage;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
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
        const activeTypes = Array.from(this.elements.typeFilters.querySelectorAll('.chip.active'))
            .map(tag => tag.dataset.type);
        const activeExpansions = Array.from(this.elements.expansionFilters.querySelectorAll('.chip.active'))
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
        SecurityUtils.clearElement(container);

        if (this.filteredData.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-state';
            emptyMessage.textContent = FF14Utils.getI18nText('noItemsFound', 'No items match the criteria');
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
        card.className = 'item-card card';
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
        timeSpan.className = 'item-time tag tag-solid tag-primary';
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
            isInList ? FF14Utils.getI18nText('addedToListButton', 'Added') : FF14Utils.getI18nText('addToListButton', 'Add to List')
        );
        addBtn.disabled = isInList;

        addBtn.addEventListener('click', () => {
            this.addItemToList(item);
            addBtn.className = 'btn btn-success btn-sm';
            // Use safe DOM manipulation instead of innerHTML
            SecurityUtils.updateButtonContent(addBtn, '✔️', FF14Utils.getI18nText('addedToListButton', 'Added'));
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
            FF14Utils.showToast(FF14Utils.getI18nText('addedToListNotification', 'Added to list'), 'success');
        } else {
            FF14Utils.showToast(result.message, 'warning');
        }
    }

    updateListDisplay() {
        const list = this.listManager.getList(this.currentListId);
        const container = this.elements.listItems;
        SecurityUtils.clearElement(container);

        if (!list || list.items.length === 0) {
            // Use safe DOM manipulation instead of innerHTML
            const emptyMessage = SecurityUtils.createEmptyMessage(
                FF14Utils.getI18nText('emptyListMessage', 'List is empty'),
                FF14Utils.getI18nText('emptyListHint', 'Click "Add to List" button on the left to add items')
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
        div.className = 'list-item card';
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
        version.className = 'list-item-version tag tag-solid tag-primary';
        version.textContent = `v${item.expansion}`;
        info.appendChild(version);

        const time = document.createElement('span');
        time.className = 'list-item-time tag';
        time.textContent = item.time;
        info.appendChild(time);

        div.appendChild(info);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-sm btn-danger';
        removeBtn.textContent = '🗑️';  // Use textContent instead of innerHTML
        removeBtn.title = FF14Utils.getI18nText('removeFromList', 'Remove');
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
        FF14Utils.showToast(FF14Utils.getI18nText('removedFromListNotification', 'Removed from list'), 'info');
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
        SecurityUtils.clearElement(container);

        container.setAttribute('role', 'tablist');
        lists.forEach(list => {
            const tab = document.createElement('button');
            tab.className = 'tab list-tab';
            tab.dataset.listId = list.id;
            tab.textContent = list.name;
            tab.id = `tab-list-${list.id}`;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', 'listItems');

            const isActive = list.id === this.currentListId;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', String(isActive));
            tab.tabIndex = isActive ? 0 : -1;

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
                const isActive = tab.dataset.listId === listId;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-selected', String(isActive));
                tab.tabIndex = isActive ? 0 : -1;
            });
            this.elements.listItems.setAttribute('role', 'tabpanel');
            this.elements.listItems.setAttribute('aria-labelledby', `tab-list-${listId}`);

            // 更新清單顯示
            this.updateListDisplay();

            // 更新左側項目顯示
            this.updateDisplay();
        }
    }

    showNewListDialog() {
        if (this.listManager.getAllLists().length >= TimedGatheringManager.CONSTANTS.MAX_LISTS) {
            const warning = FF14Utils.getI18nText(
                'maxListsWarning',
                'Maximum of {max} lists allowed',
                { max: TimedGatheringManager.CONSTANTS.MAX_LISTS }
            );
            FF14Utils.showToast(warning, 'warning');
            return;
        }

        this.elements.dialogTitle.textContent = FF14Utils.getI18nText('newListDialogTitle', 'New List');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);
        const formGroup = SecurityUtils.createFormGroup({
            label: FF14Utils.getI18nText('listNameLabel', 'List Name:'),
            inputId: 'newListName',
            placeholder: FF14Utils.getI18nText('enterListNamePlaceholder', 'Enter list name'),
            maxLength: TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH
        });
        // Add autofocus to the input for better UX with ModalManager
        const input = formGroup.querySelector('input');
        if (input) input.setAttribute('autofocus', '');

        this.elements.dialogBody.appendChild(formGroup);

        this.elements.dialogConfirm.onclick = () => {
            const input = document.getElementById('newListName');
            const rawName = input.value.trim();

            // Validate and sanitize input
            if (!SecurityUtils.validateTextLength(rawName, 1, TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH)) {
                FF14Utils.showToast(FF14Utils.getI18nText('invalidListNameError', 'List name length does not meet requirements'), 'error');
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
                    FF14Utils.showToast(FF14Utils.getI18nText('listCreatedNotification', 'List created'), 'success');
                } else {
                    FF14Utils.showToast(result.message, 'error');
                }
            }
        };

        this.showDialog();
    }

    showRenameListDialog() {
        const currentList = this.listManager.getList(this.currentListId);

        this.elements.dialogTitle.textContent = FF14Utils.getI18nText('renameListDialogTitle', 'Rename List');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);
        const formGroup = SecurityUtils.createFormGroup({
            label: FF14Utils.getI18nText('newNameLabel', 'New Name:'),
            inputId: 'renameListInput',
            value: currentList.name,
            maxLength: TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH
        });
        // Add autofocus to the input
        const input = formGroup.querySelector('input');
        if (input) input.setAttribute('autofocus', '');

        this.elements.dialogBody.appendChild(formGroup);

        this.elements.dialogConfirm.onclick = () => {
            const input = document.getElementById('renameListInput');
            const rawName = input.value.trim();

            // Validate and sanitize input
            if (!SecurityUtils.validateTextLength(rawName, 1, TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH)) {
                FF14Utils.showToast(FF14Utils.getI18nText('invalidListNameError', 'List name length does not meet requirements'), 'error');
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
                    FF14Utils.showToast(FF14Utils.getI18nText('listRenamedNotification', 'List renamed'), 'success');
                } else {
                    FF14Utils.showToast(result.message, 'error');
                }
            }
        };

        this.showDialog();

        // Optional: Select text after modal is shown (ModalManager handles focus)
        // Note: 'input' is already declared above; reuse the same reference
        const renameInput = document.getElementById('renameListInput');
        if (renameInput) renameInput.select();
    }

    showDeleteListDialog() {
        const lists = this.listManager.getAllLists();

        if (lists.length <= 1) {
            FF14Utils.showToast(FF14Utils.getI18nText('atLeastOneListWarning', '至少需要保留一個清單'), 'warning');
            return;
        }

        const currentList = this.listManager.getList(this.currentListId);

        this.elements.dialogTitle.textContent = FF14Utils.getI18nText('deleteListDialogTitle', '刪除清單');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);

        const confirmText = document.createElement('p');
        // Updated to use format with placeholder
        confirmText.textContent = FF14Utils.getI18nText(
            'confirmDeleteList',
            'Are you sure you want to delete the list "{name}"?',
            { name: currentList.name }
        );

        const warningText = document.createElement('p');
        warningText.className = 'text-danger';
        warningText.textContent = FF14Utils.getI18nText('operationCannotUndo', 'This operation cannot be undone!');

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
                FF14Utils.showToast(FF14Utils.getI18nText('listDeletedNotification', 'List deleted'), 'success');
            } else {
                FF14Utils.showToast(result.message, 'error');
            }
        };

        this.showDialog();
    }

    clearCurrentList() {
        const list = this.listManager.getList(this.currentListId);

        if (!list || list.items.length === 0) {
            FF14Utils.showToast(FF14Utils.getI18nText('listAlreadyEmptyInfo', 'List is already empty'), 'info');
            return;
        }

        this.elements.dialogTitle.textContent = FF14Utils.getI18nText('clearListDialogTitle', '清空清單');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);

        const confirmText = document.createElement('p');
        // Updated to use format with placeholder
        confirmText.textContent = FF14Utils.getI18nText(
            'confirmClearList',
            'Are you sure you want to clear the list "{name}"?',
            { name: list.name }
        );

        const itemCountText = document.createElement('p');
        // Updated to use format with placeholder
        itemCountText.textContent = FF14Utils.getI18nText(
            'willRemoveItems',
            'Will remove {count} items',
            { count: list.items.length }
        );

        this.elements.dialogBody.appendChild(confirmText);
        this.elements.dialogBody.appendChild(itemCountText);

        this.elements.dialogConfirm.onclick = () => {
            this.listManager.clearList(this.currentListId);
            this.updateListDisplay();
            this.updateDisplay();
            this.hideDialog();
            FF14Utils.showToast(FF14Utils.getI18nText('listClearedNotification', 'List cleared'), 'success');
        };

        this.showDialog();
    }

    generateMacro() {
        const list = this.listManager.getList(this.currentListId);

        if (!list || list.items.length === 0) {
            FF14Utils.showToast(FF14Utils.getI18nText('emptyListNoMacroWarning', 'List is empty, cannot generate macro'), 'warning');
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
            FF14Utils.showToast(FF14Utils.getI18nText('noMacroToCopyWarning', 'No macro to copy'), 'warning');
            return;
        }

        navigator.clipboard.writeText(macroText).then(() => {
            FF14Utils.showToast(FF14Utils.getI18nText('macroCopiedNotification', 'Macro copied to clipboard'), 'success');

            // 暫時改變按鈕文字
            // Store original button content
            const originalIcon = this.elements.copyMacroBtn.querySelector('.btn-icon')?.textContent || '📋';
            const originalText = this.elements.copyMacroBtn.textContent.replace(originalIcon, '').trim();

            // Update button safely
            SecurityUtils.updateButtonContent(this.elements.copyMacroBtn, '✔️', FF14Utils.getI18nText('copiedButton', 'Copied!'));

            setTimeout(() => {
                // Restore original content
                SecurityUtils.updateButtonContent(this.elements.copyMacroBtn, originalIcon, originalText || FF14Utils.getI18nText('copyMacroButton', 'Copy to Clipboard'));
            }, 2000);
        }).catch(err => {
            console.error('複製失敗:', err);
            FF14Utils.showToast(FF14Utils.getI18nText('copyFailedError', 'Copy failed, please select and copy manually'), 'error');
        });
    }

    showImportDialog() {
        this.elements.dialogTitle.textContent = FF14Utils.getI18nText('importDialogTitle', 'Import List');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);

        const formGroup = SecurityUtils.createFormGroup({
            label: FF14Utils.getI18nText('selectFileLabel', 'Select File:'),
            inputId: 'importFile',
            inputType: 'file',
            accept: '.json'
        });

        const helpText = document.createElement('p');
        helpText.className = 'text-muted';
        helpText.textContent = FF14Utils.getI18nText('selectJsonFileHint', 'Select a previously exported JSON file');

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
                FF14Utils.showToast(FF14Utils.getI18nText('fileFormatError', 'File format error') + ': ' + parseResult.error, 'error');
                return;
            }

            const result = this.listManager.importLists(parseResult.data);

            if (result.success) {
                this.loadLists();
                this.hideDialog();
                FF14Utils.showToast(
                    FF14Utils.getI18nText('listsImportedNotification', 'Successfully imported {count} lists', { count: result.count }),
                    'success'
                );
            } else {
                FF14Utils.showToast(result.message, 'error');
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

        FF14Utils.showToast(FF14Utils.getI18nText('listsExportedNotification', 'Lists exported'), 'success');
    }

    updateItemCount() {
        this.elements.itemCount.textContent = `(${this.filteredData.length} / ${this.data.length})`;
    }

    showDialog(onClose = null) {
        this.modalManager.show(this.elements.dialogOverlay, {
            onClose: onClose,
            useClass: 'active'
        });
    }

    hideDialog() {
        this.modalManager.hide();
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
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    new TimedGatheringManager();
});