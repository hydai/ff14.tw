// 特殊採集時間管理器主控制器
class TimedGatheringManager {
    static CONSTANTS = {
        DEBOUNCE_DELAY: 300,
        STORAGE_KEY_PREFIX: 'ff14tw_timed_gathering_',
        DEFAULT_LIST_NAME: '預設清單',
        MAX_LIST_NAME_LENGTH: 50,
        MAX_LISTS: 10,
        // 下一次出現還不到這麼久時，狀態行的「還要」寫 m:ss，否則寫幾分
        SHORT_WAIT_MS: 10 * 60 * 1000
    };

    constructor() {
        this.data = [];
        // 素材：資料裡同一種採集物的幾筆（不同時段）合成一種，一種素材一張卡片
        this.materials = [];
        this.materialByKey = new Map();
        // 目前顯示的素材（已排序）、搜尋時每種素材的分數（key -> 分數；沒有搜尋時是空的）與搜尋字
        this.shown = [];
        this.scores = new Map();
        this.searchWords = [];
        // 畫面上的卡片：key -> { card, status, addBtn }
        this.cards = new Map();
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

        this.ready = this.initialize();
    }

    async initialize() {
        try {
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

            // 初始顯示：照目前的篩選與搜尋框畫出卡片
            this.applyFilters();

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

            // 同一種素材的幾筆資料合成一張卡片
            this.materials = GatheringMaterials.group(this.data);
            this.materialByKey = new Map(this.materials.map(material => [material.key, material]));

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
        // 語言切換時重新以目前語言重繪：按鈕狀態、採集物卡片（名稱、狀態行、計數）、清單畫面與通知狀態文字
        // （呼叫的方法與順序沿用原本 switchLanguage() 的重繪部分，只是不再由這裡呼叫 setLanguage()）
        window.i18n.onLanguageChange((lang) => {
            this.currentLanguage = lang;
            this.updateLanguageButtons();
            this.renderItems();
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

        // Notification support is optional; gathering lists still work without it.
        const state = this.notificationManager.getNotificationState();
        notificationToggle.checked = state.enabled;
        notificationToggle.disabled = !state.supported;
        testNotificationBtn.disabled = !state.supported;
        this.updateNotificationStatus();
        if (!state.supported) return;

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

            const state = this.notificationManager.getNotificationState();
            if (state.enabled) {
                notificationStatus.classList.add('tag-solid', 'tag-success');
            } else if (state.permission === 'denied') {
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
        // Search operates on text, just like the dataset and textContent rendering.
        const searchTerm = this.elements.searchInput.value.trim().toLowerCase();
        const activeTypes = Array.from(this.elements.typeFilters.querySelectorAll('.chip.active'))
            .map(tag => tag.dataset.type);
        const activeExpansions = Array.from(this.elements.expansionFilters.querySelectorAll('.chip.active'))
            .map(tag => tag.dataset.expansion);

        // 符合的資料（有搜尋時已照分數排過；這是 SearchFilter 快取裡的陣列，不要改它）
        const matched = this.searchFilter.filter(this.data, {
            searchTerm,
            types: activeTypes,
            expansions: activeExpansions
        });

        // 依素材收起來：素材的分數＝它符合的資料裡最高的分數（沒有搜尋時不算）
        this.searchWords = SearchFilter.words(searchTerm);
        this.scores = new Map();
        const matchedKeys = new Set();
        matched.forEach(record => {
            const key = GatheringMaterials.keyOf(record);
            matchedKeys.add(key);
            if (this.searchWords.length > 0) {
                const score = this.searchFilter.scoreItem(record, this.searchWords);
                this.scores.set(key, Math.max(this.scores.get(key) || 0, score));
            }
        });

        // 照資料的順序取出符合的素材，再排序
        const materials = this.materials.filter(material => matchedKeys.has(material.key));
        this.shown = this.sortMaterials(materials, Date.now());
        this.renderItems();
    }

    /**
     * 卡片的順序：有搜尋時照分數由高到低，同分照出現時間（GatheringMaterials.compare）；沒有搜尋時只照出現時間。
     * 都同分時照資料的順序（不看傳進來的順序，所以拿畫面上的順序來重排也一樣）
     * @param {Object[]} materials - 要排的素材
     * @param {number} now - 毫秒時間戳
     * @returns {Object[]} 排好的新陣列（不改傳進來的陣列）
     */
    sortMaterials(materials, now) {
        const order = new Map(this.materials.map((material, index) => [material.key, index]));
        // 沒有搜尋時 this.scores 是空的，分數都當成 0
        const scoreOf = (material) => this.scores.get(material.key) || 0;
        return materials
            .map(material => ({ material, state: GatheringMaterials.state(material, now) }))
            .sort((a, b) => (scoreOf(b.material) - scoreOf(a.material)) ||
                GatheringMaterials.compare(a.state, b.state) ||
                (order.get(a.material.key) - order.get(b.material.key)))
            .map(entry => entry.material);
    }

    /** 照 this.shown 重建卡片，並寫上計數；沒有符合的素材時顯示空狀態 */
    renderItems() {
        const container = this.elements.itemsContainer;
        SecurityUtils.clearElement(container);
        this.cards.clear();

        const count = this.shown.length;
        this.elements.itemCount.textContent = this.searchWords.length > 0
            ? FF14Utils.getI18nText('resultsFound', '找到 {count} 種', { count })
            : FF14Utils.getI18nText('resultsCount', '{count} 種 · 照出現時間排序', { count });

        if (count === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-state';
            emptyMessage.textContent = FF14Utils.getI18nText('noItemsFound', '沒有符合條件的採集物');
            container.appendChild(emptyMessage);
            return;
        }

        const now = Date.now();
        this.shown.forEach(material => {
            container.appendChild(this.createMaterialCard(material, now));
        });
    }

    /**
     * 一種素材的卡片：標題是目前語言的名稱，下面小字是另外兩種語言的名稱；狀態行、地點行、時段行與按鈕。
     * 搜尋命中的字（名稱、另外兩種語言的名稱、地區、地點）用 <mark> 標出來。卡片登記在 this.cards
     * @param {Object} material - GatheringMaterials.group() 的結果
     * @param {number} now - 毫秒時間戳
     * @returns {HTMLElement}
     */
    createMaterialCard(material, now) {
        const lang = this.currentLanguage;
        const state = GatheringMaterials.state(material, now);
        const isNow = state.kind === 'now';

        const card = document.createElement('article');
        card.className = isNow ? 'card gx-card is-now' : 'card gx-card';
        card.dataset.material = material.key;

        const head = document.createElement('div');
        head.className = 'gx-head';

        const icon = document.createElement('span');
        icon.className = 'gx-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = this.getTypeIcon(material.type);
        head.appendChild(icon);

        const names = document.createElement('div');
        names.className = 'gx-names';

        const title = document.createElement('h3');
        title.className = 'gx-name';
        this.appendMarked(title, this.nameOf(material, lang));
        names.appendChild(title);

        const alt = document.createElement('p');
        alt.className = 'gx-alt';
        this.otherNames(material, lang).forEach((name, index) => {
            if (index > 0) alt.appendChild(document.createTextNode(' · '));
            this.appendMarked(alt, name);
        });
        names.appendChild(alt);
        head.appendChild(names);

        const version = document.createElement('span');
        version.className = 'tag';
        version.textContent = `v${material.expansion}`;
        head.appendChild(version);
        card.appendChild(head);

        const status = document.createElement('p');
        status.className = isNow ? 'gx-status now' : 'gx-status';
        status.textContent = this.statusText(state, now);
        card.appendChild(status);

        // 地點行：「📍 地區 · 地點　座標」（地點和地區同名時只寫地區），地區與地點各自標出命中的字
        const place = this.placeParts(material, lang);
        const where = document.createElement('p');
        where.className = 'gx-where';
        where.appendChild(document.createTextNode('📍 '));
        this.appendMarked(where, place.zone);
        if (place.location) {
            where.appendChild(document.createTextNode(' · '));
            this.appendMarked(where, place.location);
        }
        where.appendChild(document.createTextNode(`　${place.coordinates}`));
        card.appendChild(where);

        const schedule = document.createElement('p');
        schedule.className = 'gx-sched';
        schedule.textContent = this.scheduleText(material);
        card.appendChild(schedule);

        const actions = document.createElement('div');
        actions.className = 'gx-actions';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.addEventListener('click', () => {
            this.addMaterialToList(material);
        });
        actions.appendChild(addBtn);
        card.appendChild(actions);

        this.cards.set(material.key, { card, status, addBtn });
        this.updateCardButtons(material);

        return card;
    }

    /** 把文字依目前的搜尋字切段接到 parent 後面：命中的段落包在 <mark> 裡，其餘是文字節點 */
    appendMarked(parent, text) {
        SearchFilter.segments(text, this.searchWords).forEach(segment => {
            if (segment.mark) {
                const mark = document.createElement('mark');
                mark.textContent = segment.text;
                parent.appendChild(mark);
            } else {
                parent.appendChild(document.createTextNode(segment.text));
            }
        });
    }

    /** 素材（或清單裡的一筆）在某個語言的名稱：zh 是 name，en、ja 沒有自己的名稱時用 name */
    nameOf(material, lang) {
        if (lang === 'en') return material.nameEn || material.name;
        if (lang === 'ja') return material.nameJp || material.name;
        return material.name;
    }

    /** 卡片標題下面的另外兩種語言的名稱：照 zh、en、ja 的順序，去掉目前語言、空的和重複的 */
    otherNames(material, lang) {
        const title = this.nameOf(material, lang);
        const names = [];
        ['zh', 'en', 'ja'].forEach(other => {
            const name = this.nameOf(material, other);
            if (other !== lang && name && name !== title && !names.includes(name)) names.push(name);
        });
        return names;
    }

    /**
     * 地點行的三段：地區（zh zone、en zoneEn、ja zoneJp，沒有時用 zone）、地點（zh location、en locationEn、ja locationJp，
     * 沒有時用 location）、座標。資料裡很多地點就是地區本身（location 和 zone 相同），這時地點是空字串，地區只寫一次
     */
    placeParts(material, lang) {
        const zone = (lang === 'en' && material.zoneEn) || (lang === 'ja' && material.zoneJp) || material.zone;
        const location = (lang === 'en' && material.locationEn) || (lang === 'ja' && material.locationJp) || material.location;
        return { zone, location: location === zone ? '' : location, coordinates: material.coordinates };
    }

    /** 地點行的文字（不含 📍）：「地區 · 地點　座標」（地點是空的就是「地區　座標」），座標前面是全形空白 */
    placeOf(material, lang) {
        const { zone, location, coordinates } = this.placeParts(material, lang);
        return location ? `${zone} · ${location}　${coordinates}` : `${zone}　${coordinates}`;
    }

    /**
     * 狀態行：現在可採寫還剩多久、到幾點；不能採寫幾點出現、還要多久（不到 10 分鐘寫 m:ss，否則寫幾分）；全天寫全天都可以採
     * @param {Object} state - GatheringMaterials.state() 的結果
     * @param {number} now - 毫秒時間戳
     * @returns {string} 沒有有效時段（none）時是空字串
     */
    statusText(state, now) {
        if (state.kind === 'now') {
            return FF14Utils.getI18nText('statusNow', '現在可採 · 還剩 {left}（到 {end}）', {
                left: GatheringMaterials.countdown(state.end - now),
                end: GatheringMaterials.localTime(state.end)
            });
        }
        if (state.kind === 'next') {
            const wait = state.start - now;
            return FF14Utils.getI18nText('statusNext', '{time} 出現 · 還要 {wait}', {
                time: GatheringMaterials.localTime(state.start),
                wait: wait < TimedGatheringManager.CONSTANTS.SHORT_WAIT_MS
                    ? GatheringMaterials.countdown(wait)
                    : FF14Utils.getI18nText('waitMinutes', '{m} 分', { m: GatheringMaterials.minutesCeil(wait) })
            });
        }
        if (state.kind === 'allday') {
            return FF14Utils.getI18nText('statusAllDay', '全天都可以採');
        }
        return '';
    }

    /** 時段行：「每天 ET 00:00、ET 12:00，每次約 6 分鐘」；全天的素材寫「全天」 */
    scheduleText(material) {
        if (material.allDay) {
            return FF14Utils.getI18nText('scheduleAllDay', '全天');
        }
        return FF14Utils.getI18nText('scheduleDaily', '每天 {slots}，每次約 {minutes} 分鐘', {
            slots: GatheringMaterials.slots(material).join(FF14Utils.getI18nText('listSeparator', '、')),
            minutes: GatheringMaterials.realMinutes(material)
        });
    }

    getTypeIcon(type) {
        const icons = {
            'mining': '⛏️',
            'botany': '🌿',
            'fishing': '🎣'
        };
        return icons[type] || '❓';
    }

    /**
     * 把素材的每一個時段（資料的每一筆）加進目前的清單；已經在清單裡的不重複加。
     * 放不下全部的時段時一筆都不加（清單最多 ListManager.CONSTANTS.MAX_ITEMS_PER_LIST 筆）。
     * 瀏覽器封鎖網站資料時 addToList() 先把這一筆放進記憶體裡的清單、存的時候才丟例外：每一筆各自接住，
     * 所有時段照樣加進這次的清單、畫面照樣重畫，改跳警告說重新整理後就不見了
     * @param {Object} material - GatheringMaterials.group() 的結果
     */
    addMaterialToList(material) {
        const list = this.listManager.getList(this.currentListId);
        if (!list) return;

        const missing = material.records.filter(record => !this.listManager.hasInCurrentList(this.currentListId, record.id));
        if (missing.length === 0) return;

        const max = ListManager.CONSTANTS.MAX_ITEMS_PER_LIST;
        if (list.items.length + missing.length > max) {
            FF14Utils.showToast(FF14Utils.getI18nText('listMaxItems', '清單最多只能包含 {max} 個項目', { max }), 'warning');
            return;
        }

        let saved = true;
        missing.forEach(record => {
            try {
                this.listManager.addToList(this.currentListId, record);
            } catch (error) {
                // 存不起來（ListManager 已經記在 console）：這一筆已經在記憶體裡的清單，接著加下一筆
                saved = false;
            }
        });
        this.updateListDisplay();
        this.refreshCardButtons();
        if (saved) {
            FF14Utils.showToast(FF14Utils.getI18nText('addedToListNotification', '已加入清單'), 'success');
        } else {
            FF14Utils.showToast(
                FF14Utils.getI18nText('listAddedNotSaved', '已加入清單，但瀏覽器不讓這個網站存資料，重新整理後就不見了'),
                'warning'
            );
        }
    }

    /** 照目前的清單就地更新每張卡片的按鈕（不重建卡片，焦點不動）；換清單、清空、加入或移除之後呼叫 */
    refreshCardButtons() {
        for (const key of this.cards.keys()) {
            this.updateCardButtons(this.materialByKey.get(key));
        }
    }

    /**
     * 一張卡片的加入鈕：素材的每一筆都在目前的清單裡才寫已加入，否則寫加入清單。
     * 已加入用 aria-disabled 而不是 disabled：剛按過的按鈕還拿著焦點，停用的按鈕拿不住焦點，焦點會掉到 body；
     * 再按一次也沒事（addMaterialToList() 沒有要加的就什麼都不做）
     */
    updateCardButtons(material) {
        const { addBtn } = this.cards.get(material.key);
        const added = material.records.every(record => this.listManager.hasInCurrentList(this.currentListId, record.id));
        addBtn.className = 'btn btn-sm btn-ghost gx-add-btn';
        SecurityUtils.updateButtonContent(
            addBtn,
            added ? '✔️' : '➕',
            added
                ? FF14Utils.getI18nText('addedToListButton', '已加入')
                : FF14Utils.getI18nText('addToListButton', '加入清單')
        );
        if (added) {
            addBtn.setAttribute('aria-disabled', 'true');
        } else {
            addBtn.removeAttribute('aria-disabled');
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
        // 目前語言的名稱（同卡片的標題）
        name.textContent = this.nameOf(item, this.currentLanguage);
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
        this.refreshCardButtons(); // 更新卡片上的加入鈕
        FF14Utils.showToast(FF14Utils.getI18nText('removedFromListNotification', 'Removed from list'), 'info');
    }

    loadLists() {
        const lists = this.listManager.getAllLists();
        this.renderListTabs(lists);

        if (lists.length > 0) {
            const selectedList = lists.find(list => list.id === this.currentListId) || lists[0];
            this.switchToList(selectedList.id);
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

            // 更新卡片上的加入鈕
            this.refreshCardButtons();
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

            const name = rawName;

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

            const newName = rawName;

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
            this.refreshCardButtons();
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

        const skippedCount = list.items.filter(item => {
            const schedule = TimeCalculator.parseSchedule(item.time, item.duration);
            return !schedule || schedule.allDay;
        }).length;
        if (!macro) {
            this.elements.macroText.value = '';
            this.elements.macroOutput.style.display = 'none';
            FF14Utils.showToast(FF14Utils.getI18nText('noScheduledItems', '清單沒有可設定鬧鐘的採集時段'), 'info');
            return;
        }
        if (skippedCount > 0) {
            FF14Utils.showToast(FF14Utils.getI18nText('macroSkippedItems', '已略過 {count} 個全天或時間無效的項目', { count: skippedCount }), 'info');
        }

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
            // ListManager owns the nested validation contract shared with storage/export.
            const parseResult = SecurityUtils.safeJSONParse(e.target.result);

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

        reader.onerror = () => {
            FF14Utils.showToast(FF14Utils.getI18nText('fileReadFailed', '無法讀取檔案，請重新選取'), 'error');
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
        // 載入完拿掉行內的 display，讓 .gx-cards 的 grid 生效
        this.elements.itemsContainer.style.display = show ? 'none' : '';
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
