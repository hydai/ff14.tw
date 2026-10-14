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
        this.aetheryteIcon = null; // 傳送點圖標
        this.roomCollaboration = null; // 協作功能實例
        this.lastListCount = null; // updateListCount() 上一次的張數（還沒呼叫過是 null，第一次只記下、不唸）

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
            listContent: document.getElementById('listContent'),
            clearAllBtn: document.getElementById('clearAllBtn')
        };

        // 語言切換時重新以目前語言重繪清單（移除按鈕的 aria-label 帶有地區與座標，需要重組）
        window.i18n.onLanguageChange(() => {
            this.renderMyList();

            // 「40 張 G17 寶圖」是帶參數的文字，地區 chip 的地名也跟著語言走，切換語言時重新組一次
            this.updateResultCount();
            this.filterManager.renderZoneChips();

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
        });

        this.ready = this.init();
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
        this.elements.clearAllBtn.addEventListener('click', () => this.clearAllMaps());
        
        // 關閉面板按鈕
        const closePanelBtn = document.getElementById('closePanelBtn');
        if (closePanelBtn) {
            closePanelBtn.addEventListener('click', () => this.toggleListPanel());
        }
        
        // 匯出/匯入功能
        document.getElementById('exportListBtn').addEventListener('click', () => {
            this.exportList();
        });
        document.getElementById('importListBtn').addEventListener('click', () => {
            this.uiDialogManager.showImportDialog((text) => this.importFromText(text));
        });
        document.getElementById('importFileInput').addEventListener('change', (e) => this.importList(e));

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
    
    createMapCard(map) {
        const card = document.createElement('div');
        card.className = 'treasure-card card hoverable clickable';
        card.dataset.mapId = map.id;
        
        const isInList = this.listManager.has(map.id);
        
        // 建立圖片容器
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'card-image-wrapper';
        
        const img = document.createElement('img');
        img.src = map.thumbnail;
        img.alt = map.levelName;
        img.loading = 'lazy';
        img.onerror = function() {
            this.src = '/assets/images/treasure-map-placeholder.png';
        };
        imageWrapper.appendChild(img);
        
        const levelBadge = document.createElement('span');
        levelBadge.className = 'map-level-badge';
        levelBadge.textContent = map.level.toUpperCase();
        imageWrapper.appendChild(levelBadge);
        
        // 建立內容區域
        const content = document.createElement('div');
        content.className = 'card-content';
        
        const zoneTitle = document.createElement('div');
        zoneTitle.className = 'map-zone';
        
        // 取得翻譯資料
        const translations = zoneManager.getZoneNames(map.zoneId) || { zh: map.zone, en: map.zone, ja: map.zone };
        
        // 建立多語言顯示
        if (translations.zh || translations.en || translations.ja) {
            const zhSpan = document.createElement('div');
            zhSpan.className = 'zone-zh';
            zhSpan.textContent = translations.zh || map.zone;
            zoneTitle.appendChild(zhSpan);
            
            const enSpan = document.createElement('div');
            enSpan.className = 'zone-en';
            enSpan.textContent = translations.en || map.zone;
            zoneTitle.appendChild(enSpan);
            
            const jaSpan = document.createElement('div');
            jaSpan.className = 'zone-ja';
            jaSpan.textContent = translations.ja || '';
            zoneTitle.appendChild(jaSpan);
        } else {
            // 沒有翻譯資料時使用原始名稱
            zoneTitle.textContent = map.zone;
        }
        
        content.appendChild(zoneTitle);
        
        const coords = document.createElement('p');
        coords.className = 'map-coords';
        coords.textContent = CoordinateUtils.formatCoordinatesForDisplay(map.coords);
        content.appendChild(coords);
        
        // 建立按鈕區域
        const actions = document.createElement('div');
        actions.className = 'treasure-card-actions';
        
        // 詳細地圖按鈕
        const detailBtn = document.createElement('button');
        detailBtn.className = 'btn btn-secondary btn-sm btn-view-detail';
        detailBtn.title = FF14Utils.getI18nText('treasure_map_view_detail_tooltip', '查看詳細地圖');
        // 固定字串（無插值），交給 i18n manager 在語言切換時透過 [data-i18n]／[data-i18n-html] 全域重新翻譯，
        // 不必依賴這裡的語言監聽（目前只會重繪「我的清單」）
        detailBtn.setAttribute('data-i18n', 'treasure_map_view_detail_tooltip');
        detailBtn.setAttribute('data-i18n-attr', 'title');
        SecurityUtils.updateButtonContent(detailBtn, '🗺️', FF14Utils.getI18nText('treasure_map_view_detail', '詳細地圖'));
        detailBtn.setAttribute('data-i18n-html', 'treasure_map_view_detail');
        detailBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiDialogManager.showMapDetail(map, {
                zoneManager: zoneManager,
                aetheryteIcon: this.aetheryteIcon
            });
        });
        actions.appendChild(detailBtn);
        
        // 加入清單按鈕
        const addBtn = document.createElement('button');
        addBtn.className = `btn ${isInList ? 'btn-success' : 'btn-primary'} btn-sm btn-add-to-list`;
        addBtn.dataset.state = isInList ? 'added' : 'default';
        const btnKey = isInList ? 'treasure_map_added_to_list' : 'treasure_map_add_to_list';
        const btnText = FF14Utils.getI18nText(btnKey, isInList ? '✓ 已加入' : '加入清單');
        const span = document.createElement('span');
        span.className = 'btn-text';
        span.textContent = btnText;
        // 依 isInList 決定的兩個 key 之一，交給 i18n manager 在語言切換時透過 [data-i18n] 全域重新翻譯；
        // 清單狀態改變時（見 updateCardButtons()）另外同步這個屬性，維持跟目前狀態一致
        span.dataset.i18n = btnKey;
        SecurityUtils.clearElement(addBtn);
        addBtn.appendChild(span);
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMapInList(map);
        });
        actions.appendChild(addBtn);

        // 複製座標按鈕（讓鍵盤與輔助科技使用者也能用到整張卡片的複製功能）
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn btn-secondary btn-sm btn-copy-coords';
        copyBtn.textContent = FF14Utils.getI18nText('treasure_map_copy_coords', '複製座標');
        // 固定字串（無插值），交給 i18n manager 在語言切換時透過 [data-i18n] 全域重新翻譯，
        // 不必依賴這裡的語言監聽（目前只會重繪「我的清單」）
        copyBtn.setAttribute('data-i18n', 'treasure_map_copy_coords');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyCoordinates(map);
        });
        actions.appendChild(copyBtn);

        content.appendChild(actions);

        // 組合卡片
        card.appendChild(imageWrapper);
        card.appendChild(content);

        // 為整個卡片添加點擊事件（複製座標）
        card.addEventListener('click', (e) => {
            // 如果點擊的是按鈕，則不處理
            if (e.target.closest('button')) {
                return;
            }
            this.copyCoordinates(map);
        });

        return card;
    }

    copyCoordinates(map) {
        CoordinateUtils.copyCoordinatesToClipboard(map.coords).then(() => {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_copy_success', '座標指令已複製'), 'success');
        }).catch(err => {
            console.error('複製失敗:', err);
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_copy_failed', '複製失敗'), 'error');
        });
    }

    canEditList() {
        if (!this.roomCollaboration?.isConnecting) return true;
        FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_room_connecting', '隊伍連線中，請稍候再修改清單。'), 'info');
        return false;
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
        
        // 同步到房間
        if (this.roomCollaboration?.currentRoom) {
            this.syncToRoom();
        }
    }
    
    updateCardButtons() {
        document.querySelectorAll('.treasure-card').forEach(card => {
            const mapId = card.dataset.mapId;
            const button = card.querySelector('.btn-add-to-list');
            const isInList = this.listManager.has(mapId);
            const btnKey = isInList ? 'treasure_map_added_to_list' : 'treasure_map_add_to_list';

            button.dataset.state = isInList ? 'added' : 'default';
            button.className = `btn ${isInList ? 'btn-success' : 'btn-primary'} btn-sm btn-add-to-list`;
            const textSpan = button.querySelector('.btn-text');
            textSpan.textContent = FF14Utils.getI18nText(btnKey, isInList ? '✓ 已加入' : '加入清單');
            // 清單狀態改變時同步 data-i18n，讓語言切換時全域重新翻譯用的是「目前」狀態對應的 key
            textSpan.dataset.i18n = btnKey;
        });
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
    
    renderMyList() {
        // 清空內容
        SecurityUtils.clearElement(this.elements.listContent);
        
        const myList = this.listManager.getList();
        
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

            this.elements.listContent.appendChild(emptyState);
            return;
        }
        
        // 建立清單項目
        myList.forEach(item => {
            const listItem = document.createElement('div');
            listItem.className = 'list-item';
            listItem.dataset.mapId = item.id;
            
            // 圖片
            const img = document.createElement('img');
            img.src = item.thumbnail;
            img.alt = item.levelName;
            img.onerror = function() {
                this.src = '/assets/images/treasure-map-placeholder.png';
            };
            listItem.appendChild(img);
            
            // 資訊區域
            const itemInfo = document.createElement('div');
            itemInfo.className = 'item-info';
            
            const levelSpan = document.createElement('span');
            levelSpan.className = 'item-level tag tag-solid tag-primary';
            levelSpan.textContent = item.level.toUpperCase();
            itemInfo.appendChild(levelSpan);
            
            const zoneSpan = document.createElement('span');
            zoneSpan.className = 'item-zone';
            
            // 使用多語言顯示
            // 如果沒有 zoneId，嘗試從 zone 名稱獲取
            let zoneId = item.zoneId;
            if (!zoneId && item.zone) {
                // 嘗試從原始地圖資料中找到對應的 zoneId
                const originalMap = this.maps.find(m => m.id === item.id);
                if (originalMap) {
                    zoneId = originalMap.zoneId;
                }
            }
            
            const translations = zoneId ? zoneManager.getZoneNames(zoneId) : null;
            if (translations && translations.zh) {
                // 依目前介面語言挑選地區名稱，找不到對應語言時退回中文；
                // 下面的「移除」按鈕標籤直接沿用 zoneSpan.textContent，
                // 這裡選對語言就能一併修正 en/ja 介面下標籤混雜中文的問題
                const currentLang = window.i18n.getCurrentLanguage();
                zoneSpan.textContent = translations[currentLang] || translations.zh;
                zoneSpan.title = `${translations.en || item.zone} / ${translations.ja || ''}`;
            } else {
                zoneSpan.textContent = item.zone;
            }
            
            itemInfo.appendChild(zoneSpan);
            
            const coordsSpan = document.createElement('span');
            coordsSpan.className = 'item-coords';
            coordsSpan.textContent = CoordinateUtils.formatCoordinatesShort(item.coords);
            itemInfo.appendChild(coordsSpan);
            
            listItem.appendChild(itemInfo);
            
            // 移除按鈕
            // 清單裡每一列都有一顆「移除」，名稱要帶上地區與座標才分得出來；
            // 因為帶了動態文字，不能用 data-i18n（那只能綁固定字串），改在每次重繪時用當下語言組出名稱
            const removeLabel = FF14Utils.getI18nText('treasure_map_remove_item', '移除 {zone} {coords}', {
                zone: zoneSpan.textContent,
                coords: coordsSpan.textContent
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove btn btn-close';
            removeBtn.dataset.mapId = item.id;
            removeBtn.textContent = '×';
            removeBtn.setAttribute('aria-label', removeLabel);
            removeBtn.addEventListener('click', (e) => {
                this.removeFromList(item.id);
            });
            listItem.appendChild(removeBtn);
            
            this.elements.listContent.appendChild(listItem);
        });
    }
    
    removeFromList(mapId) {
        if (!this.canEditList()) return;
        if (confirm(FF14Utils.getI18nText('treasure_map_remove_confirm', '確定要移除這張寶圖嗎？'))) {
            const result = this.listManager.remove(mapId);

            if (result.success) {
                FF14Utils.showToast(result.message, 'info');
                this.updateListCount();
                this.updateCardButtons();
                this.renderMyList();
                
                // 記錄操作歷史
                if (this.roomCollaboration?.currentRoom && result.removedItem) {
                    this.roomCollaboration.recordMapOperation('remove', result.removedItem, this.roomCollaboration.currentUser);
                }
                
                // 同步到房間
                if (this.roomCollaboration?.currentRoom) {
                    this.syncToRoom();
                }
            }
        }
    }
    
    clearAllMaps() {
        if (!this.canEditList()) return;
        const currentLength = this.listManager.getLength();

        if (currentLength === 0) {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_empty_list', '清單是空的'), 'info');
            return;
        }

        if (confirm(FF14Utils.getI18nText('treasure_map_clear_confirm', '確定要清空所有寶圖嗎？共 {count} 張', { count: currentLength }))) {
            const result = this.listManager.clear();

            if (result.success) {
                FF14Utils.showToast(result.message, 'success');
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
            }
        }
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

    // 清單入口：左邊的標籤與右邊的動作。0 張「組隊」、1 張提示再加 1 張、2 張以上「生成路線」；
    // 在隊伍裡時標籤是「隊伍清單 N/上限」，0 張時右邊不放動作（已經在隊伍裡，不再顯示「組隊」）
    static getListEntryState({ count, inRoom, maxMaps }) {
        let action = 'team';
        if (count >= 2) action = 'route';
        else if (count === 1) action = 'hint';
        else if (inRoom) action = null;

        if (inRoom) return { labelKey: 'treasure_map_entry_room', labelParams: { count, max: maxMaps }, action };
        if (count === 0) return { labelKey: 'treasure_map_entry_empty', labelParams: {}, action };
        return { labelKey: 'treasure_map_entry_count', labelParams: { count }, action };
    }

    // 步驟提示目前在第幾步：清單 2 張以上（可以生成路線）是第 3 步；選了等級是第 2 步；否則第 1 步
    static getStep({ hasLevels, listCount }) {
        if (listCount >= 2) return 3;
        return hasLevels ? 2 : 1;
    }

    updateListCount() {
        const count = this.listManager.getLength();
        this.elements.totalCount.textContent = count;

        // 更新生成路線按鈕狀態
        const generateRouteBtn = document.getElementById('generateRouteBtn');
        if (generateRouteBtn) {
            generateRouteBtn.disabled = count < 2;
        }

        this.updateListEntry();

        // 加入、移除不再跳 toast：張數變了就由 #listAnnouncer 唸出來。第一次呼叫（載入時）只記下張數
        if (typeof this.lastListCount === 'number' && count !== this.lastListCount) {
            this.elements.listAnnouncer.textContent = count > this.lastListCount
                ? FF14Utils.getI18nText('treasure_map_announce_added', '已加入清單，共 {count} 張', { count })
                : FF14Utils.getI18nText('treasure_map_announce_removed', '已從清單移除，剩 {count} 張', { count });
        }
        this.lastListCount = count;
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
            for (const name of ['team', 'hint', 'route']) {
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
    
    // 匯出清單功能（複製到剪貼簿）
    exportList() {
        if (this.listManager.getLength() === 0) {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_export_empty', '清單是空的，無法匯出'), 'warning');
            return;
        }

        // 使用 ListManager 的匯出功能
        const jsonString = this.listManager.exportAsJson();

        // 複製到剪貼簿
        navigator.clipboard.writeText(jsonString).then(() => {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_export_success', '已複製 {count} 張寶圖清單到剪貼簿', { count: this.listManager.getLength() }), 'success');
        }).catch(err => {
            console.error('複製失敗:', err);
            // 備用方案：顯示可複製的文字框
            this.uiDialogManager.showExportDialog(jsonString);
        });
    }
    
    // 從文字匯入清單
    async importFromText(text) {
        if (!this.canEditList()) return;
        if (!text.trim()) {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_import_text_required', '請貼上清單內容'), 'warning');
            return;
        }
        
        try {
            // 確認是否要合併或取代
            let merge = false;
            
            if (this.listManager.getLength() > 0) {
                // 先解析資料以獲取數量
                const parseResult = SecurityUtils.safeJSONParse(text);
                if (!parseResult.success) {
                    FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_import_file_format_error', '檔案格式錯誤'), 'error');
                    return;
                }
                const previewData = parseResult.data;
                const confirmMessage = `目前清單有 ${this.listManager.getLength()} 張寶圖。\n` +
                    `要匯入的清單包含 ${previewData.maps?.length || 0} 張寶圖。\n\n` +
                    `選擇「確定」將合併清單（避免重複）\n` +
                    `選擇「取消」將取代現有清單`;
                
                merge = confirm(confirmMessage);
            }
            
            // Validate the projected room size and operation batch before committing the import.
            const collaboration = this.roomCollaboration?.currentRoom ? this.roomCollaboration : null;
            const result = this.listManager.import(text, merge, {
                maxItems: collaboration ? RoomCollaboration.CONSTANTS.MAX_MAPS : Infinity,
                validate: maps => {
                    if (!collaboration) return;
                    const operations = collaboration.mapSync.getOperations(maps.map(map => this.toRoomMap(map)));
                    RoomCollaboration.validateMapOperations(operations);
                }
            });
            
            if (result.success) {
                FF14Utils.showToast(result.message, 'success');
                this.updateListCount();
                this.updateCardButtons();
                this.renderMyList();
                await this.syncToRoom();
            } else {
                FF14Utils.showToast(result.message, 'error');
            }
            
        } catch (error) {
            console.error('匯入失敗:', error);
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_import_failed', '匯入失敗：{message}', { message: error.message }), 'error');
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
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_read_file_failed', '讀取檔案失敗'), 'error');
        }
        
        // 清空檔案輸入
        event.target.value = '';
    }
    
    // 生成路線
    async generateRoute() {
        const myList = this.listManager.getList();

        if (myList.length < 2) {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_no_maps_for_route', '至少需要 2 張寶圖才能生成路線'), 'error');
            return;
        }

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
        const saved = localStorage.getItem('treasureMapFormatSettings');
        if (saved) {
            try {
                const parseResult = SecurityUtils.safeJSONParse(saved);
                this.formatSettings = parseResult.success ? parseResult.data : this.getDefaultFormats();
                // 只有真的載入到已儲存的自訂設定才算「非預設」；解析失敗仍視為使用預設值，
                // 讓語言切換時的觀察者（見建構子）繼續幫忙跟著語言重新計算
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
        // 使用者主動存檔，之後語言切換不再幫忙覆寫（見建構子的語言切換觀察者）
        this.formatSettingsAreDefault = false;

        localStorage.setItem('treasureMapFormatSettings', JSON.stringify(this.formatSettings));
        FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_format_saved', '格式設定已儲存'), 'success');
        this.uiDialogManager.hideFormatPanel();
    }
    
    // 重置格式設定
    resetFormatSettings() {
        this.formatSettings = this.getDefaultFormats();
        // 回到預設值，之後語言切換要再幫忙跟著語言重新計算（見建構子的語言切換觀察者）；
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
