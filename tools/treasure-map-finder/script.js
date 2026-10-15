// 寶圖搜尋器
class TreasureMapFinder {
    constructor() {
        this.data = null;
        this.maps = [];
        this.filteredMaps = [];
        this.listManager = new ListManager(); // 使用 ListManager 模組
        this.filterManager = new FilterManager(); // 使用 FilterManager 模組
        this.uiDialogManager = new UIDialogManager(); // 使用 UIDialogManager 模組
        this.modalManager = new ModalManager(); // 我的清單面板的焦點管理（開啟時移入焦點、Tab 循環、ESC／關閉時還原焦點）
        this.listDialogs = new ListDialogs(this); // 清空、匯入的頁內對話框（自己的 ModalManager，疊在清單面板上）
        this.aetheryteIcon = null; // 傳送點圖標
        this.roomCollaboration = null; // 協作功能實例
        this.lastListCount = null; // updateListCount() 上一次的張數（還沒呼叫過是 null，第一次只記下、不唸）
        this.storageWarningShown = false; // 「瀏覽器不允許儲存資料」的提示這個頁面跳過了沒有（見 notifyIfUnsaved）

        // DOM 元素快取
        this.elements = {
            stepHint: document.getElementById('stepHint'),
            listEntryDesktop: document.getElementById('listEntryDesktop'),
            listEntryMobile: document.getElementById('listEntryMobile'),
            listAnnouncer: document.getElementById('listAnnouncer'),
            levelTags: document.getElementById('levelTags'),
            zoneFilterRow: document.getElementById('zoneFilterRow'),
            zoneTags: document.getElementById('zoneTags'),
            clearZonesBtn: document.getElementById('clearZonesBtn'),
            treasureEmpty: document.getElementById('treasureEmpty'),
            treasureGrid: document.getElementById('treasureGrid'),
            resultCount: document.getElementById('resultCount'),
            totalCount: document.getElementById('totalCount'),
            myListPanel: document.getElementById('myListPanel'),
            listTitle: document.getElementById('myListPanel-title'),
            listHeaderCount: document.getElementById('listHeaderCount'),
            listContent: document.getElementById('listContent'),
            clearAllBtn: document.getElementById('clearAllBtn')
        };

        window.i18n.onLanguageChange(() => this.handleLanguageChange());

        this.ready = this.init();
    }

    // 切換語言：帶參數或由程式組出來的文字（卡片、清單、結果張數、地區 chip、清單入口）用新語言重畫一次。
    // 固定字串由 i18n manager 依 [data-i18n] 重新翻譯；詳細地圖與路線面板由 UIDialogManager 自己的
    // 語言監聽（refreshActiveDialog）處理
    handleLanguageChange() {
        // 清單每一列的地名、最近傳送點與 ✕ 的名稱都跟著語言走：整份重畫
        this.renderMyList();

        // 卡片的地名、最近傳送點與按鈕文字都跟著語言走：整格重畫。資料還沒載入（載入中）
        // 或載入失敗（showError() 的錯誤訊息）時結果格裡不是卡片，不動它
        if (this.maps.length > 0) {
            this.displayMaps();
        }

        // 「40 張 G17 寶圖」是帶參數的文字，地區 chip 的地名也跟著語言走，切換語言時重新組一次
        this.updateResultCount();
        this.filterManager.renderZoneChips();

        // 清單入口的標籤帶張數參數，不能用 data-i18n；清單頁的標題與張數也是（在隊伍裡還會換字）
        this.updateListEntry();
        this.updateListLabels();

        // 預設範本跟語言走，使用者自訂的不動：只有目前仍是「預設值」
        // （this.formatSettingsAreDefault，見 loadFormatSettings／saveFormatSettings／
        // resetFormatSettings）才重新計算 getDefaultFormats()；已存過自訂內容一律略過，
        // 且這裡只更新記憶體中的 this.formatSettings 與（若面板開著）UI 顯示，
        // 絕不寫入 localStorage
        if (this.formatSettingsAreDefault) {
            this.formatSettings = this.getDefaultFormats();

            const formatPanel = this.uiDialogManager.formatPanelElements?.panel;
            if (formatPanel?.classList.contains(UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE)) {
                this.uiDialogManager.setFormatValues(this.formatSettings);
                this.updateFormatPreview();
            }
        }
    }

    async init() {
        try {
            // 一開始就顯示「載入中」：地區與傳送點資料（zoneManager）載入時也算在內
            this.showLoading(true);
            // 傳送點圖示只有詳細地圖用得到，不等它：載入慢或載入不了都不延後結果（圖示到了之後，開著的詳細地圖會重畫補上傳送點，見 loadAetheryteIcon）
            void this.loadAetheryteIcon();
            // loadData() 要用 ZoneManager 的地區名稱與圖片檔名，必須等它載入完才能開始
            await zoneManager.init();
            await this.loadData();
            this.setupEventListeners();
            this.updateListCount();
            this.initFilters();
        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError(FF14Utils.getI18nText('treasure_map_load_failed', '載入寶圖資料失敗，請重新整理頁面再試。'));
        }
    }

    async loadAetheryteIcon() {
        try {
            const img = new Image();
            img.src = 'images/ui/crysis.png';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            this.aetheryteIcon = img;
        } catch (error) {
            console.error('載入傳送點圖標失敗:', error);
            this.aetheryteIcon = null;
            return;
        }
        // 圖示不擋載入（見 init()），可能比詳細地圖晚到：開著的詳細地圖重畫一次，補上傳送點。
        // 路線面板用不到圖示，不重畫（重畫會把整個步驟清單換掉）
        if (this.uiDialogManager?.activeDialog?.kind === 'mapDetail') {
            this.uiDialogManager.refreshActiveDialog();
        }
    }
    
    async loadData() {
        try {
            const response = await fetch('../../data/treasure-maps.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.data = await response.json();
            
            // 為每個寶圖添加衍生資料
            this.maps = this.data.maps
                .map(map => {
                    const zoneNames = zoneManager.getZoneNames(map.zoneId);
                    const levelInfo = this.data.mapLevels.find(level => level.id === map.level);
                    
                    return {
                        ...map,
                        zone: zoneNames.en,
                        zoneName: zoneNames.zh,
                        levelName: levelInfo ? levelInfo.name : map.level,
                        thumbnail: `images/treasures/${zoneManager.generateImageFileName(map.level, map.zoneId, map.index)}`
                    };
                });
        } catch (error) {
            console.error('載入資料失敗:', error);
            throw error;
        } finally {
            this.showLoading(false);
        }
    }
    
    setupEventListeners() {
        // 清單入口（桌機在最上面那一列、手機在底部列）與我的清單
        this.setupListEntries();

        // 清空、匯入（清單下面的動作列）：打開頁內對話框，確認之後才動清單
        this.listDialogs.init();
        this.elements.clearAllBtn.addEventListener('click', () => this.listDialogs.openClear());
        document.getElementById('importListBtn').addEventListener('click', () => this.listDialogs.openImport());

        // 關閉面板按鈕
        const closePanelBtn = document.getElementById('closePanelBtn');
        if (closePanelBtn) {
            closePanelBtn.addEventListener('click', () => this.toggleListPanel());
        }

        // 點擊遮罩關閉
        const overlay = document.getElementById('panelOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.toggleListPanel());
        }
        
        // 路線生成按鈕
        const generateRouteBtn = document.getElementById('generateRouteBtn');
        if (generateRouteBtn) {
            generateRouteBtn.addEventListener('click', () => this.generateRoute());
        }
        
        // 關閉路線面板
        const closeRoutePanelBtn = document.getElementById('closeRoutePanelBtn');
        if (closeRoutePanelBtn) {
            closeRoutePanelBtn.addEventListener('click', () => this.closeRoutePanel());
        }
        
        // 複製路線按鈕
        const copyRouteBtn = document.getElementById('copyRouteBtn');
        if (copyRouteBtn) {
            copyRouteBtn.addEventListener('click', () => this.copyEntireRoute());
        }
        
        // 自訂格式按鈕
        const customFormatBtn = document.getElementById('customFormatBtn');
        if (customFormatBtn) {
            customFormatBtn.addEventListener('click', () => {
                this.uiDialogManager.showFormatPanel(
                    this.formatSettings,
                    (teleportFormat, mapFormat) => this.updateFormatPreview(teleportFormat, mapFormat)
                );
            });
        }
        
        // 格式設定面板事件
        const closeFormatPanelBtn = document.getElementById('closeFormatPanelBtn');
        if (closeFormatPanelBtn) {
            closeFormatPanelBtn.addEventListener('click', () => this.uiDialogManager.hideFormatPanel());
        }
        
        const saveFormatBtn = document.getElementById('saveFormatBtn');
        if (saveFormatBtn) {
            saveFormatBtn.addEventListener('click', () => this.saveFormatSettings());
        }
        
        const resetFormatBtn = document.getElementById('resetFormatBtn');
        if (resetFormatBtn) {
            resetFormatBtn.addEventListener('click', () => this.resetFormatSettings());
        }

        // 語言快速切換按鈕
        const langZhBtn = document.getElementById('langZhBtn');
        const langEnBtn = document.getElementById('langEnBtn');
        const langJaBtn = document.getElementById('langJaBtn');
        if (langZhBtn) langZhBtn.addEventListener('click', () => this.switchLanguageTemplate('zh'));
        if (langEnBtn) langEnBtn.addEventListener('click', () => this.switchLanguageTemplate('en'));
        if (langJaBtn) langJaBtn.addEventListener('click', () => this.switchLanguageTemplate('ja'));

        // 載入自訂格式設定
        this.loadFormatSettings();
    }
    
    // 地圖資料載入後呼叫一次：還原篩選（網址 > localStorage > 什麼都沒選）、畫出等級與地區 chip；
    // 之後每次改變都重畫結果、記進 localStorage，並用 replaceState 寫進網址（保留 room 等其他參數）
    initFilters() {
        const filterManager = this.filterManager;
        filterManager.setMaps(this.maps);
        filterManager.restoreState(FilterManager.pickInitialState({
            url: FilterManager.parseUrl(location.search),
            stored: FilterManager.readStored(FilterManager.safeStorage(window))
        }));
        filterManager.mount({
            levelContainer: this.elements.levelTags,
            zoneRow: this.elements.zoneFilterRow,
            zoneContainer: this.elements.zoneTags,
            clearZonesButton: this.elements.clearZonesBtn,
            getZoneNames: zoneId => zoneManager.getZoneNames(zoneId),
            getLanguage: () => window.i18n.getCurrentLanguage()
        });
        filterManager.onChange(state => {
            this.updateFilteredMaps();
            // 步驟列看有沒有選等級
            this.updateListEntry();
            FilterManager.writeStored(FilterManager.safeStorage(window), state);
            history.replaceState(history.state, '', FilterManager.buildUrl(location.href, state));
        });
        this.updateFilteredMaps();
        // restoreState() 不會觸發 onChange：還原出來的等級也要反映在步驟列
        this.updateListEntry();

        // 手機上等級列是橫向捲動的：還原出來的等級可能在畫面外，把它捲進視野
        this.elements.levelTags.querySelector('.chip.active')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    }

    // 更新過濾後的地圖列表
    updateFilteredMaps() {
        this.filteredMaps = this.filterManager.applyFilters(this.maps);
        this.displayMaps();
        this.updateResultCount();
    }

    // 畫出全部符合的寶圖（不分頁）；一張都沒有時改顯示空狀態
    displayMaps() {
        const { treasureGrid, treasureEmpty } = this.elements;
        SecurityUtils.clearElement(treasureGrid);
        this.filteredMaps.forEach(map => treasureGrid.appendChild(this.createMapCard(map)));

        SecurityUtils.clearElement(treasureEmpty);
        treasureEmpty.classList.toggle('hidden', this.filteredMaps.length > 0);
        if (this.filteredMaps.length > 0) return;

        // 還沒選等級：告訴玩家怎麼從寶圖名稱看出等級。選了等級卻是 0 張只會發生在選了地區時，
        // 所以提示清除地區（「清除地區」就在上面的結果標題列）
        const chooseGrade = this.filterManager.getState().levels.length === 0;
        const icon = document.createElement('div');
        icon.className = 'empty-state-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = chooseGrade ? '🗺️' : '🔍';
        treasureEmpty.appendChild(icon);

        const texts = chooseGrade
            ? [
                ['empty-state-title', 'treasure_map_choose_grade_title', '先選寶圖等級'],
                ['empty-state-text', 'treasure_map_choose_grade_text', '看寶圖名稱裡的皮革就知道等級，例如獰豹革是 G17。選好之後會列出所有符合的寶圖，下次打開也會記得。']
            ]
            : [
                ['empty-state-title', 'treasure_map_no_results_title', '這個條件沒有寶圖'],
                ['empty-state-text', 'treasure_map_no_results_text', '試試清除地區篩選。']
            ];
        for (const [className, key, fallback] of texts) {
            const element = document.createElement('div');
            element.className = className;
            element.textContent = FF14Utils.getI18nText(key, fallback);
            // 固定字串（無插值）：切換語言時由 i18n manager 依 [data-i18n] 重新翻譯
            element.dataset.i18n = key;
            treasureEmpty.appendChild(element);
        }
    }
    
    // 一張寶圖卡：縮圖（按鈕，開詳細地圖）、目前語言的地名與編號、座標、最近傳送點、「加入清單」與複製。
    // 整張卡不是點擊熱區（以前點卡片就複製，觸控裝置容易誤觸）。裡面的字由程式依目前語言組出來，
    // 不掛 data-i18n：切換語言時 handleLanguageChange() 整格重畫
    createMapCard(map) {
        const card = document.createElement('article');
        card.className = 'treasure-card tm-card card';
        card.dataset.mapId = map.id;
        const zoneName = this.getZoneName(map.zoneId);

        // 縮圖本身就是按鈕：圖片只是裝飾（alt 空白），名稱由 aria-label 說明這顆按鈕做什麼。
        // 按鈕裡的內容會被 aria-label 取代，所以名稱要帶上等級（多選等級時螢幕閱讀器才聽得到每張卡的等級）
        const grade = map.level.toUpperCase();
        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = 'tm-thumb';
        thumb.setAttribute('aria-label', FF14Utils.getI18nText('treasure_map_open_detail', '放大 {grade} {zone} #{index}', {
            grade,
            zone: zoneName,
            index: map.index
        }));
        // 上一張／下一張在按下當時結果格的順序裡切換
        thumb.addEventListener('click', () => this.openMapDetail(map.id, this.filteredMaps.map(m => m.id)));

        const img = document.createElement('img');
        img.src = map.thumbnail;
        img.setAttribute('alt', '');
        img.setAttribute('loading', 'lazy');
        img.onerror = function() {
            this.src = '/assets/images/treasure-map-placeholder.png';
        };
        thumb.appendChild(img);

        // 看得到的等級徽章；名稱已經帶著等級，所以對輔助科技隱藏
        const levelBadge = document.createElement('span');
        levelBadge.className = 'map-level-badge';
        levelBadge.setAttribute('aria-hidden', 'true');
        levelBadge.textContent = grade;
        thumb.appendChild(levelBadge);

        const zoomHint = document.createElement('span');
        zoomHint.className = 'tm-thumb-zoom';
        zoomHint.setAttribute('aria-hidden', 'true');
        zoomHint.textContent = '🔍';
        thumb.appendChild(zoomHint);

        const body = document.createElement('div');
        body.className = 'tm-card-body';

        const title = document.createElement('div');
        title.className = 'tm-card-title';
        const zone = document.createElement('span');
        zone.className = 'tm-zone';
        zone.textContent = zoneName;
        const index = document.createElement('span');
        index.className = 'tm-index';
        index.textContent = `#${map.index}`;
        title.appendChild(zone);
        title.appendChild(index);
        body.appendChild(title);

        const coords = document.createElement('p');
        coords.className = 'tm-coords';
        coords.textContent = CoordinateUtils.formatXY(map.coords);
        body.appendChild(coords);

        // 最近傳送點（卡片、詳細地圖、路線都由 zoneManager 的同一份資料算出）；地區沒有傳送點就不放這一行
        const nearestName = this.getNearestAetheryteName(map);
        if (nearestName) {
            const nearest = document.createElement('p');
            nearest.className = 'tm-nearest';
            nearest.textContent = FF14Utils.getI18nText('treasure_map_nearest', '最近：{name}', { name: nearestName });
            body.appendChild(nearest);
        }

        const actions = document.createElement('div');
        actions.className = 'tm-card-actions';

        // 加入清單（次要按鈕；一個畫面最多一顆 .btn-primary，留給「生成路線」）。
        // 保留 .btn-add-to-list：隊伍連線中 RoomCollaboration.setConnecting() 用它停用畫面上的加入鈕；
        // 連線中才畫出來的卡片（例如這時切換語言、改篩選）在這裡一樣停用
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-sm btn-add-to-list';
        addBtn.disabled = Boolean(this.roomCollaboration?.isConnecting);
        const addText = document.createElement('span');
        addText.className = 'btn-text';
        addBtn.appendChild(addText);
        this.updateAddButton(addBtn, this.listManager.has(map.id));
        addBtn.addEventListener('click', () => this.toggleMapInList(map));
        actions.appendChild(addBtn);

        // 複製：只有圖示，名稱放在 aria-label 與 title
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn btn-sm btn-icon-only tm-copy btn-copy-coords';
        const copyLabel = FF14Utils.getI18nText('treasure_map_copy_coords', '複製座標');
        copyBtn.setAttribute('aria-label', copyLabel);
        copyBtn.setAttribute('title', copyLabel);
        copyBtn.textContent = '📋';
        copyBtn.addEventListener('click', () => this.copyCoordinates(map));
        actions.appendChild(copyBtn);

        body.appendChild(actions);
        card.appendChild(thumb);
        card.appendChild(body);
        return card;
    }

    // 打開詳細檢視：上一張／下一張在 resultIds（結果格的順序）裡切換；加入、複製與卡片走同一條路，
    // 背後的卡片與清單入口由 toggleMapInList 同步；關閉後焦點交給 focusAfterDetail()
    openMapDetail(mapId, resultIds) {
        const map = this.maps.find(m => m.id === mapId);
        if (!map) return;
        const finder = this;
        this.uiDialogManager.showMapDetail(map, {
            zoneManager,
            // 傳送點圖示不擋載入（見 init()），可能比詳細檢視晚到：每次畫的時候才讀，
            // 圖示到了之後的重畫（loadAetheryteIcon）、切換與換語言才畫得出傳送點
            get aetheryteIcon() { return finder.aetheryteIcon; },
            resultIds,
            getMapById: id => this.maps.find(m => m.id === id),
            isInList: target => this.listManager.has(target.id),
            onToggle: target => this.toggleMapInList(target),
            onCopy: target => this.copyCoordinates(target),
            getPartyMessage: target => this.buildPartyMessage(target),
            onClosed: id => this.focusAfterDetail(id)
        });
    }

    // 詳細檢視關閉後：焦點放到最後顯示的那張的卡片縮圖（切換過就不是當初按的那張）。到這時才找：語言切換會重畫卡片，
    // 開啟時的縮圖已經不在頁面上；那張不在結果格裡了就放到結果張數
    focusAfterDetail(mapId) {
        const thumb = this.elements.treasureGrid.querySelector(`[data-map-id="${mapId}"] .tm-thumb`);
        (thumb || this.elements.resultCount).focus();
    }

    // 最近傳送點的目前語言名稱（沒有這個語言時用中文）；地區沒有傳送點時是 null
    getNearestAetheryteName(map) {
        const nearest = zoneManager.findNearestAetheryte(map.zoneId, map.coords);
        if (!nearest) return null;
        const { name } = nearest.aetheryte;
        return name[window.i18n.getCurrentLanguage()] || name.zh;
    }

    // 貼到遊戲隊伍頻道、隊友看得懂的一句話，例如「/p G17 烏爾科帕恰 (13.7, 14.2) 最近：瓦群佩洛」。
    // 地名與傳送點用目前介面語言；座標一律一位小數（17 → 17.0）、不含 Z；地區沒有傳送點時不寫「最近」那一段
    buildPartyMessage(map) {
        const params = {
            grade: map.level.toUpperCase(),
            zone: this.getZoneName(map.zoneId),
            // 先轉成字串：數字 17 套進範本會變成 "17"，不是 "17.0"
            x: Number(map.coords.x).toFixed(1),
            y: Number(map.coords.y).toFixed(1)
        };
        const aetheryte = this.getNearestAetheryteName(map);
        if (!aetheryte) {
            return FF14Utils.getI18nText('treasure_map_party_message_no_aetheryte', '/p {grade} {zone} ({x}, {y})', params);
        }
        return FF14Utils.getI18nText('treasure_map_party_message', '/p {grade} {zone} ({x}, {y}) 最近：{aetheryte}', { ...params, aetheryte });
    }

    // 卡片的「加入清單」：已加入時 data-state="added"、加上 .is-added（成功色調）、文字換成「✓ 已加入」，
    // 再按一次就移除。只動這三樣，不改寫整個 className（停用等其他狀態不受影響）
    updateAddButton(button, isInList) {
        button.dataset.state = isInList ? 'added' : 'default';
        button.classList.toggle('is-added', isInList);
        button.querySelector('.btn-text').textContent = isInList
            ? FF14Utils.getI18nText('treasure_map_added_to_list', '✓ 已加入')
            : FF14Utils.getI18nText('treasure_map_add_to_list', '＋ 加入清單');
    }

    // 複製這張寶圖的隊伍頻道句子（buildPartyMessage），不再是 /pos 指令。
    // 寫入被拒絕、或瀏覽器沒有剪貼簿 API（navigator.clipboard 是 undefined）都走同一條失敗路徑：跳「複製失敗」
    async copyCoordinates(map) {
        try {
            await navigator.clipboard.writeText(this.buildPartyMessage(map));
        } catch (err) {
            console.error('複製失敗:', err);
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_copy_failed', '複製失敗'), 'error');
            return;
        }
        FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_copy_success', '已複製，可以貼到隊伍頻道'), 'success');
    }

    // 隊伍連線中不能改清單（RoomCollaboration.setConnecting() 也停用了按鈕）：canEditList() 的 toast 與匯入、清空的回傳值共用這句話
    getConnectingMessage() {
        return FF14Utils.getI18nText('treasure_map_room_connecting', '隊伍連線中，請稍候再修改清單。');
    }

    canEditList() {
        if (!this.roomCollaboration?.isConnecting) return true;
        FF14Utils.showToast(this.getConnectingMessage(), 'info');
        return false;
    }

    // 清單操作成功、但瀏覽器沒讓寫入（封鎖網站資料、空間滿了；ListManager 回報 saved: false）：畫面和記憶體裡的清單照常更新，
    // 只是關掉頁面就沒了。每個頁面只提示一次，之後的操作不再跳。只認 saved === false：沒有 saved（失敗的操作、測試替身）不提示
    notifyIfUnsaved(result) {
        if (result.saved !== false || this.storageWarningShown) return;
        this.storageWarningShown = true;
        FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_storage_blocked', '瀏覽器不允許儲存資料：清單只會保留到關閉這個頁面。'), 'warning');
    }

    toggleMapInList(map) {
        if (!this.canEditList()) return;
        // 使用 ListManager 處理清單操作
        const options = {
            maxItems: this.roomCollaboration?.currentRoom ? RoomCollaboration.CONSTANTS.MAX_MAPS : Infinity,
            addedBy: this.roomCollaboration?.currentUser?.id || null
        };
        
        const result = this.listManager.toggle(map, options);

        if (result.success) {
            // 加入、移除成功不跳 toast：清單入口的張數會更新，#listAnnouncer 也會唸出來（見 updateListCount）

            // 記錄操作歷史
            if (this.roomCollaboration?.currentRoom && result.action === 'add') {
                this.roomCollaboration.recordMapOperation('add', map, this.roomCollaboration.currentUser);
            }
        } else {
            FF14Utils.showToast(result.message, 'error');
            return;
        }
        
        this.updateListCount();
        this.updateCardButtons();
        this.renderMyList();
        this.notifyIfUnsaved(result);
        
        // 同步到房間
        if (this.roomCollaboration?.currentRoom) {
            this.syncToRoom();
        }
    }
    
    // 清單變了（加入、移除、清空、匯入、隊伍同步）：每張卡的加入鈕跟著清單更新，開著的詳細檢視的加入鈕也是
    updateCardButtons() {
        document.querySelectorAll('.treasure-card').forEach(card => {
            this.updateAddButton(card.querySelector('.btn-add-to-list'), this.listManager.has(card.dataset.mapId));
        });
        this.uiDialogManager?.refreshMapDetailAddButton();
    }
    
    // 關閉按鈕與遮罩用（面板開著時就是關閉）
    toggleListPanel() {
        if (this.modalManager.activeModal === this.elements.myListPanel) {
            this.closeListPanel();
        } else {
            this.openListPanel();
        }
    }

    // 打開我的清單面板；已經開著就什麼都不做
    openListPanel() {
        const overlay = document.getElementById('panelOverlay');
        const panel = this.elements.myListPanel;
        if (this.modalManager.activeModal === panel) return;

        // 先解除 inert，ModalManager 才抓得到可聚焦元素、正確設定初始焦點
        panel.inert = false;
        overlay.classList.add('active');
        this.renderMyList();
        document.body.style.overflow = 'hidden';
        const opener = document.activeElement;
        this.modalManager.show(panel, {
            // #panelOverlay 是獨立於面板本身的手足元素（不是 ModalManager 認得的遮罩層），
            // 點擊它由既有的 click 監聽器呼叫 toggleListPanel() 處理，故關閉內建的點擊判斷
            closeOnOverlayClick: false,
            onClose: () => {
                // ESC／關閉按鈕／點擊遮罩都會走到這裡。此時 hide() 已經把焦點還原、
                // 也已經把面板移出堆疊，才把它設回 inert——滑出動畫尚未播完的 300ms
                // 內，面板不再能被點擊或用 focus() 拉進去（不只是視覺上關閉）
                overlay.classList.remove('active');
                document.body.style.overflow = '';
                panel.inert = true;
                this.restoreEntryFocus(opener);
            }
        });
    }

    // 關閉我的清單面板；沒開著就什麼都不做。清單面板被路線／格式面板疊住時會被堆疊設為 inert，
    // 但它的遮罩 #panelOverlay 是手足元素、仍收得到點擊：這時比照 Escape 只關最上層那一層，
    // 不把整疊連鎖收掉，避免一次誤點遮罩就把路線面板與清單一併關掉
    closeListPanel() {
        if (this.modalManager.activeModal !== this.elements.myListPanel) return;
        const topmost = ModalManager.topmost();
        if (topmost && topmost !== this.modalManager) {
            topmost.hide();
            return;
        }
        this.modalManager.hide();
    }

    // 打開面板的入口按鈕可能已經收起來（例如按「組隊」後建了隊伍，或清空清單後「生成路線」消失），
    // ModalManager 把焦點還給看不見的按鈕等於沒還：改放到畫面上那個入口的清單按鈕
    restoreEntryFocus(opener) {
        if (!opener?.closest?.('.tm-list-entry') || opener.getClientRects().length > 0) return;
        const listButton = [this.elements.listEntryDesktop, this.elements.listEntryMobile]
            .map(entry => entry.querySelector('[data-entry="list"]'))
            .find(button => button.getClientRects().length > 0);
        listButton?.focus();
    }

    // 兩個清單入口（桌機在最上面那一列、手機在底部列）內容相同，各用一個委派的監聽器
    setupListEntries() {
        for (const entry of [this.elements.listEntryDesktop, this.elements.listEntryMobile]) {
            entry.addEventListener('click', (e) => {
                const button = e.target.closest('button[data-entry]');
                if (button) this.handleListEntry(button.dataset.entry);
            });
        }
    }

    // 左邊的清單按鈕只打開面板；「組隊」打開後把焦點移到面板裡的「建立組隊」；
    // 「生成路線」打開後照原本的流程排路線（路線面板疊在清單面板上，沿用它的遮罩與捲動鎖定）
    handleListEntry(action) {
        this.openListPanel();
        if (action === 'team') {
            document.getElementById('createRoomBtn')?.focus();
        } else if (action === 'route') {
            // 焦點先放到面板裡的「生成路線」：關掉路線面板時焦點回到那裡，和在面板裡按下去一樣
            document.getElementById('generateRouteBtn')?.focus();
            this.generateRoute();
        }
    }
    
    // 清單裡一張寶圖要顯示的資料（清單頁的每一列用；分享對話框、路線的每一站也用）。清單項目本身沒有編號，舊資料或隊伍同步來的
    // 項目也可能沒有 zoneId：目錄（this.maps）裡有同 id 的就用那張的地區、編號、座標與縮圖。目錄裡沒有的（例如以前匯入的自訂寶圖）
    // 只在查得到地區時才用那個地區（見 resolveItemZoneId），否則地名用項目自己的 zone 文字、沒有編號；不顯示 id
    describeListItem(item) {
        const catalogued = this.maps.find(map => map.id === item.id);
        const zoneId = catalogued ? catalogued.zoneId : this.resolveItemZoneId(item);
        const coords = catalogued ? catalogued.coords : item.coords;
        const index = catalogued?.index ?? null;
        const grade = item.level.toUpperCase();
        let zoneName = item.zone;
        let zoneNames = { zh: item.zone, en: item.zone, ja: item.zone };
        if (zoneId) {
            const { zh, en, ja } = zoneManager.getZoneNames(zoneId);
            zoneName = this.getZoneName(zoneId);
            zoneNames = { zh, en, ja };
        }
        return {
            id: item.id,
            grade,
            zoneId,
            zoneName,
            zoneNames,
            index,
            coords,
            coordsText: CoordinateUtils.formatPair(coords),
            // 和卡片的「最近」同一個函式；地區沒有傳送點（或查不到地區）時是 null
            nearest: zoneManager.findNearestAetheryte(zoneId, coords)?.aetheryte ?? null,
            thumbnail: catalogued ? catalogued.thumbnail : item.thumbnail,
            name: index === null ? `${grade} ${zoneName}` : `${grade} ${zoneName} #${index}`
        };
    }

    // 目錄裡沒有的清單項目的地區 id：zoneId 查得到地區就用它；沒有（以前匯入的項目沒有 zoneId）就像 RouteCalculator.resolveZoneId()
    // 一樣用項目的 zone 文字查，路線算進傳送的站這裡才找得到最近傳送點。getZoneIdByName() 查不到名稱時回傳整理過的名稱本身，
    // 所以查到的 id 還要真的是地區才用；都不是就是 null
    resolveItemZoneId(item) {
        if (zoneManager.getZoneById(item.zoneId)) return item.zoneId;
        const byName = zoneManager.getZoneIdByName(item.zone);
        return zoneManager.getZoneById(byName) ? byName : null;
    }

    // 清單頁的清單：一張寶圖一列（見 createListItem）。列裡的字跟著語言與清單變，由程式組出來、不掛 data-i18n：
    // 切換語言、清單變了（加入、移除、清空、匯入、隊伍同步）都整份重畫
    renderMyList() {
        const { listContent } = this.elements;
        // 隊伍同步每 2 秒重畫一次：焦點原本在某一列的 ✕ 上，重畫後放回同一張寶圖的 ✕，不能把焦點弄丟。
        // 那一張剛好被隊友移除了，就和 removeFromList() 一樣退到同一個位置的 ✕（見 focusListRow）；位置要在清掉之前記下
        const active = document.activeElement;
        const focusedPosition = listContent.contains(active) && active.classList.contains('btn-remove')
            ? Array.from(listContent.querySelectorAll('.btn-remove')).indexOf(active)
            : -1;
        const focusedMapId = focusedPosition === -1 ? null : active.dataset.mapId;
        SecurityUtils.clearElement(listContent);

        const myList = this.listManager.getList();

        // 不提早 return：清單空了也會走到函式最後（之後要跟著清單變的東西加在最後面）
        if (myList.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';

            const emptyText = document.createElement('p');
            emptyText.textContent = FF14Utils.getI18nText('treasure_map_empty_list', '清單是空的');
            emptyState.appendChild(emptyText);

            const hintText = document.createElement('p');
            hintText.className = 'empty-state-text';
            hintText.textContent = FF14Utils.getI18nText('treasure_map_list_hint', '點擊寶圖卡片上的「加入清單」開始建立');
            emptyState.appendChild(hintText);

            listContent.appendChild(emptyState);
        } else {
            const items = document.createElement('ul');
            items.className = 'tm-list-items';
            myList.forEach(item => items.appendChild(this.createListItem(item)));
            listContent.appendChild(items);
        }

        if (focusedMapId !== null) {
            // 不用 id 組選擇器：匯入的自訂寶圖 id 可能有引號，瀏覽器的 querySelector 會丟錯
            const sameMap = Array.from(listContent.querySelectorAll('.btn-remove')).find(button => button.dataset.mapId === focusedMapId);
            if (sameMap) sameMap.focus();
            else this.focusListRow(focusedPosition);
        }
    }

    // 清單重畫之後把焦點放回清單頁：原本那個位置的 ✕（移除一列後，下一列滑上來的那一顆），沒有就前一顆，
    // 清單空了就面板標題。焦點一直留在面板裡，不掉到 body
    focusListRow(position) {
        const removeButtons = this.elements.listContent.querySelectorAll('.btn-remove');
        (removeButtons[position] || removeButtons[position - 1] || this.elements.listTitle)?.focus();
    }

    // 清單的一列：縮圖（裝飾，alt 空白）；第一行是等級、目前語言的地名與編號，第二行是座標與最近傳送點；右邊的 ✕
    createListItem(item) {
        const info = this.describeListItem(item);
        const listItem = document.createElement('li');
        listItem.className = 'list-item';
        listItem.dataset.mapId = item.id;

        const img = document.createElement('img');
        img.src = info.thumbnail;
        img.setAttribute('alt', '');
        img.setAttribute('loading', 'lazy');
        img.onerror = function() {
            this.src = '/assets/images/treasure-map-placeholder.png';
        };
        listItem.appendChild(img);

        const itemInfo = document.createElement('div');
        itemInfo.className = 'item-info';

        // 第一行的三段之間留空白：讀出來、複製下來都是「G17 科扎馬烏卡 #3」。目錄裡找不到的寶圖沒有編號
        const title = document.createElement('p');
        title.className = 'item-title';
        const level = document.createElement('span');
        level.className = 'item-level tag tag-solid tag-primary';
        level.textContent = info.grade;
        title.appendChild(level);
        title.appendChild(document.createTextNode(' '));
        const zone = document.createElement('span');
        zone.className = 'item-zone';
        zone.textContent = info.zoneName;
        title.appendChild(zone);
        if (info.index !== null) {
            const index = document.createElement('span');
            index.className = 'item-index';
            index.textContent = `#${info.index}`;
            title.appendChild(document.createTextNode(' '));
            title.appendChild(index);
        }
        itemInfo.appendChild(title);

        // 第二行：座標（一位小數、不含 Z，和卡片相同），有最近傳送點時接著寫（目前語言的名稱，沒有就用中文）
        const sub = document.createElement('p');
        sub.className = 'item-sub';
        sub.textContent = info.coordsText;
        if (info.nearest) {
            const { name } = info.nearest;
            const nearestName = name[window.i18n.getCurrentLanguage()] || name.zh;
            sub.textContent += ` · ${FF14Utils.getI18nText('treasure_map_nearest', '最近：{name}', { name: nearestName })}`;
        }
        itemInfo.appendChild(sub);
        listItem.appendChild(itemInfo);

        // ✕：每一列都有一顆，名稱要帶上等級、地名與編號才分得出來；帶了動態文字，不能用 data-i18n，每次重畫時用當下語言組出來。
        // 保留 .btn-remove：隊伍連線中 RoomCollaboration.setConnecting() 用它停用畫面上的 ✕；連線中才畫出來的列在這裡一樣停用
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove btn btn-close';
        removeBtn.setAttribute('aria-label', FF14Utils.getI18nText('treasure_map_remove_item', '移除 {name}', { name: info.name }));
        removeBtn.dataset.mapId = item.id;
        removeBtn.textContent = '×';
        removeBtn.disabled = Boolean(this.roomCollaboration?.isConnecting);
        removeBtn.addEventListener('click', () => this.removeFromList(item.id));
        listItem.appendChild(removeBtn);

        return listItem;
    }

    // 清單頁每一列的 ✕：直接移除，不確認、不跳 toast（剩幾張由 updateListCount() 用 #listAnnouncer 唸出來）。
    // 重畫後焦點移到原本位置的下一列 ✕，移除的是最後一列就移到上一列，清單空了就移到面板標題：焦點一直留在面板裡
    removeFromList(mapId) {
        if (!this.canEditList()) return;
        const position = this.listManager.getList().findIndex(item => item.id === mapId);
        const result = this.listManager.remove(mapId);
        if (!result.success) return;

        this.notifyIfUnsaved(result);
        this.updateListCount();
        this.updateCardButtons();
        this.renderMyList();
        this.focusListRow(position);

        // 記錄操作歷史
        if (this.roomCollaboration?.currentRoom && result.removedItem) {
            this.roomCollaboration.recordMapOperation('remove', result.removedItem, this.roomCollaboration.currentUser);
        }

        // 同步到房間
        if (this.roomCollaboration?.currentRoom) {
            this.syncToRoom();
        }
    }
    
    // 清空整份清單。要不要清已經由 ListDialogs 的清空對話框問過了，這裡不再確認。
    // 成功有 toast；隊伍裡記進操作歷史、同步給隊友。回傳 ListManager 的結果 { success, message, count }
    clearList() {
        if (!this.canEditList()) return { success: false, message: this.getConnectingMessage(), count: 0 };
        const result = this.listManager.clear();
        if (!result.success) return result;

        FF14Utils.showToast(result.message, 'success');
        this.notifyIfUnsaved(result);
        this.updateListCount();
        this.updateCardButtons();
        this.renderMyList();

        // 記錄操作歷史
        if (this.roomCollaboration?.currentRoom) {
            this.roomCollaboration.addOperationHistory({
                type: 'clear_all',
                message: `${this.roomCollaboration.currentUser.nickname} 清空了所有寶圖`,
                timestamp: new Date().toISOString()
            });
        }

        // 同步到房間
        if (this.roomCollaboration?.currentRoom) {
            this.syncToRoom();
        }
        return result;
    }

    // 「40 張 G17 寶圖」：實際符合的張數與等級。等級列結果裡真的有的（選了 G18、G17 再選只有 G17 的地區，就只寫 G17），
    // 照 FilterManager.GRADE_ORDER 的順序；0 張時沒有結果可看，改列已選的等級。還沒選等級時是空的（由空狀態說明）
    updateResultCount() {
        const { levels } = this.filterManager.getState();
        const present = new Set(this.filteredMaps.map(map => map.level));
        const grades = present.size > 0 ? FilterManager.GRADE_ORDER.filter(level => present.has(level)) : levels;
        this.elements.resultCount.textContent = levels.length > 0
            ? TreasureMapFinder.formatResultCount(this.filteredMaps.length, grades, FF14Utils.getI18nText.bind(FF14Utils))
            : '';
    }

    // 結果張數的文字；getText 的簽名同 FF14Utils.getI18nText(key, 中文預設文字, 參數)，
    // 多個等級時等級代號用目前語言的分隔符號連接（中文、日文「、」，英文「, 」）
    static formatResultCount(count, levels, getText) {
        const grades = levels.map(level => level.toUpperCase()).join(getText('treasure_map_list_separator', '、'));
        return getText('treasure_map_result_count', '{count} 張 {grades} 寶圖', { count, grades });
    }

    // 清單入口的標籤（中文預設文字；帶參數，由 updateListEntry() 依語言組好再填入）
    static ENTRY_LABELS = {
        treasure_map_entry_empty: '📋 清單',
        treasure_map_entry_count: '📋 清單 {count} 張',
        treasure_map_entry_room: '👥 隊伍清單 {count}/{max}'
    };

    // 清單入口：左邊的標籤與右邊的動作。0 張「組隊」、1 張以上「生成路線」（1 張也排得出路線）；
    // 在隊伍裡時標籤是「隊伍清單 N/上限」，0 張時右邊不放動作（已經在隊伍裡，不再顯示「組隊」）
    static getListEntryState({ count, inRoom, maxMaps }) {
        let action = 'team';
        if (count >= 1) action = 'route';
        else if (inRoom) action = null;

        if (inRoom) return { labelKey: 'treasure_map_entry_room', labelParams: { count, max: maxMaps }, action };
        if (count === 0) return { labelKey: 'treasure_map_entry_empty', labelParams: {}, action };
        return { labelKey: 'treasure_map_entry_count', labelParams: { count }, action };
    }

    // 步驟提示目前在第幾步：清單 1 張以上（可以生成路線）是第 3 步；選了等級是第 2 步；否則第 1 步
    static getStep({ hasLevels, listCount }) {
        if (listCount >= 1) return 3;
        return hasLevels ? 2 : 1;
    }

    updateListCount() {
        const count = this.listManager.getLength();
        // 清單變成 0 張時「清空清單」藏起來、「生成路線」停用（例如隊友移除了最後一張）：焦點正在其中一顆上就會掉到 body，
        // 再按 Tab 會跑出開著的面板（renderMyList() 只顧每一列的 ✕）。焦點先記下來，改完再看
        const active = document.activeElement;
        this.updateListLabels();

        // 更新生成路線按鈕狀態：1 張就能排路線，只有清單是空的才停用
        const generateRouteBtn = document.getElementById('generateRouteBtn');
        if (generateRouteBtn) {
            generateRouteBtn.disabled = count < 1;
        }
        // 焦點所在的那顆藏起來或停用了：放到面板標題（同清單空了時的 focusListRow），焦點一直留在面板裡
        const { clearAllBtn, listTitle } = this.elements;
        if (active && [clearAllBtn, generateRouteBtn].includes(active) && (active.disabled || active.classList.contains('hidden'))) {
            listTitle?.focus();
        }

        this.updateListEntry();

        // 開著的清單對話框（清空的張數、匯入與分享的選項）跟著新的清單重畫：隊友同步後「清空 6 張」不能其實清掉 7 張。
        // 測試替身不一定有 listDialogs
        this.listDialogs?.refresh();

        // 加入、移除不再跳 toast：張數變了就由 #listAnnouncer 唸出來。第一次呼叫（載入時）只記下張數
        if (typeof this.lastListCount === 'number' && count !== this.lastListCount) {
            this.elements.listAnnouncer.textContent = count > this.lastListCount
                ? FF14Utils.getI18nText('treasure_map_announce_added', '已加入清單，共 {count} 張', { count })
                : FF14Utils.getI18nText('treasure_map_announce_removed', '已從清單移除，剩 {count} 張', { count });
        }
        this.lastListCount = count;
    }

    // 清單頁的標題（「我的清單」，在隊伍裡「隊伍清單」）、標頭與底部的張數（隊伍裡寫 N/上限），以及動作列的「清空清單」
    // （清單是空的時藏起來，只剩匯入）。張數是參數、在隊伍裡還會換字，不能用 data-i18n：張數變了、進出隊伍、切換語言時重組。
    // 測試替身的 elements 不一定有這幾個元素，所以先檢查
    updateListLabels() {
        const { listTitle, listHeaderCount, totalCount, clearAllBtn } = this.elements;
        const count = this.listManager.getLength();
        const params = { count, max: RoomCollaboration.CONSTANTS.MAX_MAPS };
        const setText = (element, key, fallback) => {
            if (element) element.textContent = FF14Utils.getI18nText(key, fallback, params);
        };
        if (this.roomCollaboration?.currentRoom) {
            setText(listTitle, 'treasure_map_team_list', '隊伍清單');
            setText(listHeaderCount, 'treasure_map_panel_count_room', '{count}/{max}');
            setText(totalCount, 'treasure_map_footer_count_room', '{count}/{max} 張');
        } else {
            setText(listTitle, 'treasure_map_my_list', '我的清單');
            setText(listHeaderCount, 'treasure_map_panel_count', '{count} 張');
            setText(totalCount, 'treasure_map_footer_count', '{count} 張寶圖');
        }
        clearAllBtn?.classList.toggle('hidden', count === 0);
    }

    // 兩個清單入口與步驟列：依清單張數、是否在隊伍裡、是否選了等級
    updateListEntry() {
        const count = this.listManager.getLength();
        const { labelKey, labelParams, action } = TreasureMapFinder.getListEntryState({
            count,
            inRoom: Boolean(this.roomCollaboration?.currentRoom),
            maxMaps: RoomCollaboration.CONSTANTS.MAX_MAPS
        });
        const label = FF14Utils.getI18nText(labelKey, TreasureMapFinder.ENTRY_LABELS[labelKey], labelParams);
        for (const entry of [this.elements.listEntryDesktop, this.elements.listEntryMobile]) {
            entry.querySelector('.tm-entry-label').textContent = label;
            for (const name of ['team', 'route']) {
                entry.querySelector(`[data-entry="${name}"]`).classList.toggle('hidden', name !== action);
            }
        }

        // 之前的步驟打勾，目前這一步標出來；每次都重設三步，往回走（例如移除寶圖）時號碼會還原
        const step = TreasureMapFinder.getStep({
            hasLevels: this.filterManager.getState().levels.length > 0,
            listCount: count
        });
        this.elements.stepHint.querySelectorAll('li').forEach((item, index) => {
            const number = index + 1;
            item.classList.toggle('done', number < step);
            item.classList.toggle('current', number === step);
            if (number === step) {
                item.setAttribute('aria-current', 'step');
            } else {
                item.removeAttribute('aria-current');
            }
            item.querySelector('.tm-step-num').textContent = number < step ? '✓' : String(number);
        });
    }
    
    showLoading(show) {
        if (show) {
            SecurityUtils.clearElement(this.elements.treasureGrid);
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading';
            loadingDiv.textContent = FF14Utils.getI18nText('treasure_map_loading', '載入中...');
            this.elements.treasureGrid.appendChild(loadingDiv);
        }
    }

    showError(message) {
        SecurityUtils.clearElement(this.elements.treasureGrid);

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;

        const reloadBtn = document.createElement('button');
        reloadBtn.className = 'btn btn-primary';
        reloadBtn.textContent = FF14Utils.getI18nText('treasure_map_reload', '重新載入');
        reloadBtn.addEventListener('click', () => location.reload());
        
        errorDiv.appendChild(document.createElement('br'));
        errorDiv.appendChild(reloadBtn);
        this.elements.treasureGrid.appendChild(errorDiv);
    }
    
    // 目錄：寶圖 id → 目錄裡的那一張。匯入的分享連結與舊的匯出 JSON 都以目錄的資料為準
    getCatalogue() {
        return new Map(this.maps.map(map => [map.id, map]));
    }

    // 貼進來的內容讀成要匯入的寶圖。匯入對話框一邊貼一邊看、importFromText() 按下「匯入」時用的是同一份結果，所以「連結裡有 N 張」就是會匯入的 N 張：
    // 分享連結 → 目錄裡找得到的那幾張（一張都沒有算失敗）；舊的匯出 JSON → 每一張有目錄裡同 id 的就換成目錄那張，否則照原樣（交給 ListManager 驗證）。
    // 回傳 { ok: true, kind, maps }，或 { ok: false, kind, message }：kind 是 null 表示看不懂
    parseImportText(text) {
        const parsed = ListShare.parseText(text);
        if (!parsed) {
            return {
                ok: false,
                kind: null,
                message: FF14Utils.getI18nText('treasure_map_import_unreadable', '看不懂這段內容：請貼上分享連結，或以前匯出的內容')
            };
        }
        const catalogue = this.getCatalogue();
        if (parsed.kind === 'link') {
            const { maps } = ListShare.resolveIds(parsed.ids, catalogue);
            if (maps.length === 0) {
                return { ok: false, kind: 'link', message: FF14Utils.getI18nText('treasure_map_share_none_found', '分享連結裡沒有找得到的寶圖') };
            }
            return { ok: true, kind: 'link', maps };
        }
        return { ok: true, kind: 'json', maps: parsed.maps.map(map => catalogue.get(map?.id) ?? map) };
    }

    // 從貼進來的文字匯入清單（分享連結，或以前匯出的 JSON）；merge 是合併（true）或取代（false）。
    // 失敗（連線中、看不懂、超過隊伍上限…）不跳 toast，原因放在回傳的 message 裡，由匯入對話框顯示
    async importFromText(text, { merge = true } = {}) {
        if (this.roomCollaboration?.isConnecting) return { success: false, message: this.getConnectingMessage() };
        const read = this.parseImportText(text);
        if (!read.ok) return { success: false, message: read.message };
        return this.applyListImport(read.maps, { merge });
    }

    // 把一批寶圖套進清單（匯入與分享連結共用）。隊伍裡上限 8 張，並先照 RoomCollaboration.validateMapOperations() 驗過整批操作，
    // 都通過了才動清單。失敗不跳 toast、原樣回傳 ListManager 的結果（success: false 與 message）；
    // 成功才 toast、更新畫面並同步給隊友，回傳 { success, message, imported, skipped, saved }
    async applyListImport(maps, { merge = true } = {}) {
        const collaboration = this.roomCollaboration?.currentRoom ? this.roomCollaboration : null;
        const result = this.listManager.import({ maps }, merge, {
            maxItems: collaboration ? RoomCollaboration.CONSTANTS.MAX_MAPS : Infinity,
            validate: list => {
                if (!collaboration) return;
                const operations = collaboration.mapSync.getOperations(list.map(map => this.toRoomMap(map)));
                RoomCollaboration.validateMapOperations(operations);
            }
        });
        if (!result.success) return result;

        FF14Utils.showToast(result.message, 'success');
        this.notifyIfUnsaved(result);
        this.updateListCount();
        this.updateCardButtons();
        this.renderMyList();
        await this.syncToRoom();
        return result;
    }
    
    // 生成路線
    async generateRoute() {
        const myList = this.listManager.getList();

        // 1 張也排得出路線；清單是空的就什麼都不做。0 張時「生成路線」按鈕停用、入口也不放它，所以不用跳提示
        if (myList.length === 0) return;

        // 等待 routeCalculator 與地區、傳送點資料載入完成
        if (!routeCalculator || !zoneManager.loaded) {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_loading_aetherytes', '正在載入傳送點資料，請稍後再試'), 'info');
            // 等待一下再試
            setTimeout(() => {
                if (routeCalculator && zoneManager.loaded) {
                    this.generateRoute();
                }
            }, 1000);
            return;
        }
        
        // 計算路線
        const result = routeCalculator.calculateRoute(myList);
        
        if (!result || !result.route || result.route.length === 0) {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_route_generation_failed', '無法生成路線'), 'error');
            return;
        }
        
        // 儲存路線資料供複製使用
        this.currentRoute = result.route;

        // 路線面板由 uiDialogManager 另一個獨立的 ModalManager 實例管理，
        // 疊在仍然開著的「我的清單」面板上（z-index 1001 > 1000，遮罩與捲動鎖沿用清單面板的）。
        // ModalManager 的共用堆疊保證 Escape 只關最上層：第一次 Escape 收路線面板、
        // 焦點回到清單面板裡的「生成路線」按鈕，第二次才收清單面板。
        // 顯示路線結果
        this.uiDialogManager.showRouteResult(result, {
            onStepCopy: (step, index, total) => {
                const formattedText = this.formatStepForCopy(step, index + 1, total);
                navigator.clipboard.writeText(formattedText).then(() => {
                    FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_route_step_copy_success', '已複製'), 'success');
                });
            },
            getZoneName: (zoneId) => this.getZoneName(zoneId)
        });
    }
    
    // 複製整個路線
    copyEntireRoute() {
        if (!this.currentRoute || this.currentRoute.length === 0) {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_no_route_to_copy', '目前沒有可複製的路線'), 'error');
            return;
        }

        // 使用自訂格式建構路線文字
        const routeText = this.currentRoute.map((step, index) => {
            return this.formatStepForCopy(step, index + 1, this.currentRoute.length);
        }).join('\n');

        // 複製到剪貼簿
        navigator.clipboard.writeText(routeText).then(() => {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_route_copy_success', '已複製 {count} 個地點', { count: this.currentRoute.length }), 'success');
        }).catch(() => {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_copy_failed', '複製失敗'), 'error');
        });
    }
    
    // 格式化單一步驟供複製
    formatStepForCopy(step, index, total) {
        const format = step.type === 'teleport' ? this.formatSettings.teleport : this.formatSettings.map;
        const coords = CoordinateUtils.formatCoordinatesAsCommand(step.coords);
        
        let result = format;
        
        if (step.type === 'teleport') {
            const aetheryteNames = this.getAetheryteName(step.to);
            result = result.replace('<傳送點>', aetheryteNames.zh || step.to.zh || step.to);
            result = result.replace('<傳送點_en>', aetheryteNames.en || step.to.en || '');
            result = result.replace('<傳送點_ja>', aetheryteNames.ja || step.to.ja || '');
        } else {
            result = result.replace('<寶圖等級>', step.mapLevel || '');
            // 優先使用 zoneId 來獲取正確的翻譯
            const zoneNames = step.zoneId ? zoneManager.getZoneNames(step.zoneId) : this.getZoneAllNames(step.zone);
            result = result.replace('<地區>', zoneNames.zh);
            result = result.replace('<地區_en>', zoneNames.en);
            result = result.replace('<地區_ja>', zoneNames.ja);
        }
        
        result = result.replace('<座標>', coords);
        result = result.replace('<序號>', index.toString());
        result = result.replace('<總數>', total.toString());
        
        return result;
    }
    
    // 取得地區的所有語言名稱
    getZoneAllNames(zone) {
        // 從 zoneManager 取得
        const zoneData = this.maps.find(map => map.zone === zone);
        if (zoneData && zoneData.zoneId) {
            return zoneManager.getZoneNames(zoneData.zoneId);
        }
        
        // 備用：返回原始名稱
        return {
            zh: zone,
            en: zone,
            ja: zone
        };
    }
    
    // 載入格式設定
    loadFormatSettings() {
        // 瀏覽器封鎖儲存空間（例如封鎖網站資料）時，光是讀 localStorage 就會丟例外：當作沒存過，和第一次來一樣用預設值
        let saved = null;
        try {
            saved = localStorage.getItem('treasureMapFormatSettings');
        } catch { /* 讀不到：用預設值 */ }
        if (saved) {
            try {
                const parseResult = SecurityUtils.safeJSONParse(saved);
                this.formatSettings = parseResult.success ? parseResult.data : this.getDefaultFormats();
                // 只有真的載入到已儲存的自訂設定才算「非預設」；解析失敗仍視為使用預設值，
                // 讓語言切換時（見 handleLanguageChange）繼續幫忙跟著語言重新計算
                this.formatSettingsAreDefault = !parseResult.success;
            } catch (e) {
                this.formatSettings = this.getDefaultFormats();
                this.formatSettingsAreDefault = true;
            }
        } else {
            this.formatSettings = this.getDefaultFormats();
            this.formatSettingsAreDefault = true;
        }

        // 更新 UI
        const teleportFormat = document.getElementById('teleportFormat');
        const mapFormat = document.getElementById('mapFormat');
        if (teleportFormat) teleportFormat.value = this.formatSettings.teleport;
        if (mapFormat) mapFormat.value = this.formatSettings.map;
    }
    
    // 三語言的巨集格式範本；getDefaultFormats／switchLanguageTemplate 共用同一份，避免各存一份中文範本、彼此可能各自漂移
    getFormatTemplates(lang) {
        const templates = {
            zh: { teleport: '/p 傳送至 <傳送點> <座標>', map: '/p 下一個 <寶圖等級> - <地區> <座標>' },
            en: { teleport: '/p Teleport to <傳送點_en> <座標>', map: '/p Next <寶圖等級> - <地區_en> <座標>' },
            ja: { teleport: '/p <傳送點_ja>にテレポート <座標>', map: '/p 次 <寶圖等級> - <地區_ja> <座標>' }
        };
        return templates[lang];
    }

    // 取得預設格式（依目前介面語言；找不到對應語言時退回中文）
    getDefaultFormats() {
        const currentLang = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';
        return this.getFormatTemplates(currentLang) || this.getFormatTemplates('zh');
    }
    
    // 儲存格式設定
    saveFormatSettings() {
        const values = this.uiDialogManager.getFormatValues();
        
        this.formatSettings = {
            teleport: values.teleport,
            map: values.map
        };
        // 使用者主動存檔，之後語言切換不再幫忙覆寫（見 handleLanguageChange）
        this.formatSettingsAreDefault = false;

        // 瀏覽器封鎖儲存空間（連讀 localStorage 都會丟例外）或空間滿了：這次照新的格式，只是記不住，提示一下；
        // 面板照樣關起來（新的格式已經生效）
        let saved = true;
        try {
            localStorage.setItem('treasureMapFormatSettings', JSON.stringify(this.formatSettings));
        } catch {
            saved = false;
        }
        if (saved) {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_format_saved', '格式設定已儲存'), 'success');
        } else {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_format_save_failed', '無法儲存設定：瀏覽器不允許儲存資料'), 'error');
        }
        this.uiDialogManager.hideFormatPanel();
    }
    
    // 重置格式設定
    resetFormatSettings() {
        this.formatSettings = this.getDefaultFormats();
        // 回到預設值，之後語言切換要再幫忙跟著語言重新計算（見 handleLanguageChange）；
        // 注意這裡本來就不寫入 localStorage（保留原行為：重置只影響當下畫面，不清除已儲存設定）
        this.formatSettingsAreDefault = true;

        this.uiDialogManager.setFormatValues(this.formatSettings);
        this.updateFormatPreview();
        FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_format_reset', '已重置為預設格式'), 'info');
    }
    
    // 更新格式預覽
    updateFormatPreview(teleportFormatValue, mapFormatValue) {
        const preview = document.getElementById('formatPreview');
        if (!preview) return;
        
        // 如果沒有提供值，從 UI 取得
        const teleportFormat = teleportFormatValue || document.getElementById('teleportFormat')?.value || this.formatSettings.teleport;
        const mapFormat = mapFormatValue || document.getElementById('mapFormat')?.value || this.formatSettings.map;
        
        // 建立範例預覽
        const teleportExample = teleportFormat
            .replace('<傳送點>', '十二節之園')
            .replace('<傳送點_en>', 'The Twelve Wonders')
            .replace('<傳送點_ja>', '十二節の園')
            .replace('<座標>', '/pos 9 32 0')
            .replace('<序號>', '1')
            .replace('<總數>', '5');
            
        const mapExample = mapFormat
            .replace('<寶圖等級>', 'g15')
            .replace('<地區>', '厄爾庇斯')
            .replace('<地區_en>', 'Elpis')
            .replace('<地區_ja>', 'エルピス')
            .replace('<座標>', '/pos 11.8 33.1 0')
            .replace('<序號>', '2')
            .replace('<總數>', '5');
            
        preview.textContent = `傳送點範例：\n${teleportExample}\n\n寶圖範例：\n${mapExample}`;
    }
    
    // 切換語言模板
    switchLanguageTemplate(lang) {
        const template = this.getFormatTemplates(lang);
        if (!template) return;
        
        const teleportFormat = document.getElementById('teleportFormat');
        const mapFormat = document.getElementById('mapFormat');
        
        if (teleportFormat) teleportFormat.value = template.teleport;
        if (mapFormat) mapFormat.value = template.map;
        
        this.updateFormatPreview();
        
        // 顯示語言切換成功訊息（依選擇的模板語言分別對應翻譯鍵值，與目前介面語言無關）
        const switchedMessageKeys = {
            zh: 'treasure_map_format_switched_zh',
            en: 'treasure_map_format_switched_en',
            ja: 'treasure_map_format_switched_ja'
        };
        const langNames = {
            zh: '中文',
            en: '英文',
            ja: '日文'
        };
        FF14Utils.showToast(FF14Utils.getI18nText(switchedMessageKeys[lang], `已切換至${langNames[lang]}模板`), 'info');
    }
    
    // 關閉路線面板
    closeRoutePanel() {
        this.uiDialogManager.hideRouteResult();
    }
    
    // 取得地區名稱
    // 依目前介面語言挑選地區名稱，找不到對應語言時退回中文（與 renderMyList() 一致）
    getZoneName(zoneId) {
        const translations = zoneManager.getZoneNames(zoneId);
        const currentLang = window.i18n.getCurrentLanguage();
        return translations[currentLang] || translations.zh || zoneId;
    }
    
    // 取得傳送點名稱
    getAetheryteName(name) {
        // 如果是物件格式（包含多語言）
        if (typeof name === 'object' && name !== null) {
            return name;
        }
        // 如果是字串，返回包裝成物件
        return { zh: name };
    }
    
    // 設定協作實例
    setRoomCollaboration(roomCollaboration) {
        this.roomCollaboration = roomCollaboration;
    }
    
    toRoomMap(item) {
        return {
            id: item.id, type: item.level, x: item.coords.x, y: item.coords.y,
            zone: item.zone, addedBy: item.addedBy, addedAt: item.addedAt
        };
    }

    // Queue only additions/removals relative to the current shared view.
    syncToRoom() {
        if (!this.roomCollaboration?.currentRoom) return Promise.resolve(false);
        return this.roomCollaboration.mapSync.replaceLocal(this.listManager.getList().map(item => this.toRoomMap(item)));
    }

    // 從房間同步寶圖
    syncFromRoom(maps) {
        if (!this.roomCollaboration?.currentRoom) return;

        const roomMaps = maps || this.roomCollaboration.mapSync.getMaps();

        // 使用 ListManager 的 syncFromRoom 方法
        this.listManager.syncFromRoom(roomMaps, this.maps);

        // 更新 UI
        this.updateListCount();
        this.updateCardButtons();
        this.renderMyList();
    }
}

// 初始化
let treasureMapFinder;
let routeCalculator;
let roomCollaboration;
document.addEventListener('DOMContentLoaded', () => {
    treasureMapFinder = new TreasureMapFinder();
    routeCalculator = new RouteCalculator();
    roomCollaboration = new RoomCollaboration(treasureMapFinder);

    // 連接協作功能
    treasureMapFinder.setRoomCollaboration(roomCollaboration);
});
