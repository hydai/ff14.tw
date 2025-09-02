// 寶圖搜尋器
class TreasureMapFinder {
    constructor() {
        this.data = null;
        this.maps = [];
        this.filteredMaps = [];
        this.listManager = new ListManager(); // 使用 ListManager 模組
        this.filterManager = new FilterManager(); // 使用 FilterManager 模組
        this.uiDialogManager = new UIDialogManager(); // 使用 UIDialogManager 模組
        this.displayCount = 24;
        this.currentDisplayCount = 0;
        this.aetheryteData = null; // 傳送點資料
        this.aetheryteIcon = null; // 傳送點圖標
        this.roomCollaboration = null; // 協作功能實例
        
        // DOM 元素快取
        this.elements = {
            treasureGrid: document.getElementById('treasureGrid'),
            resultCount: document.getElementById('resultCount'),
            listCount: document.getElementById('listCount'),
            myListToggle: document.getElementById('myListToggle'),
            myListPanel: document.getElementById('myListPanel'),
            listContent: document.getElementById('listContent'),
            clearAllBtn: document.getElementById('clearAllBtn'),
            loadMore: document.getElementById('loadMore'),
            totalCountText: document.getElementById('totalCountText')
        };
        
        this.init();
    }
    
    async init() {
        try {
            // 初始化 i18n
            await i18n.init();
            
            await Promise.all([
                zoneManager.init(),
                this.loadData(),
                this.loadAetherytes(),
                this.loadAetheryteIcon()
            ]);
            this.setupEventListeners();
            this.updateListCount();
            this.updateFilteredMaps();
            
            // 監聽語言變更事件
            window.addEventListener('languageChanged', () => {
                this.updateDynamicText();
            });
        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError(i18n.t('messages.error.loadFailed'));
        }
    }
    
    
    async loadAetherytes() {
        try {
            const response = await fetch('../../data/aetherytes.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.aetheryteData = data.aetherytes;
        } catch (error) {
            console.error('載入傳送點資料失敗:', error);
            this.aetheryteData = {}; // 失敗時使用空物件
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
                        thumbnail: `images/treasures/${zoneManager.generateImageFileName(map.level, map.zoneId, map.index)}`,
                        fullImage: `images/treasures/${zoneManager.generateFullImageFileName(map.level, map.zoneId, map.index)}`
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
        // 設定過濾器管理器
        this.filterManager.setupEventListeners();
        this.filterManager.onChange(() => {
            this.updateFilteredMaps();
        });
        
        // 我的清單
        this.elements.myListToggle.addEventListener('click', () => this.toggleListPanel());
        this.elements.clearAllBtn.addEventListener('click', () => this.clearAllMaps());
        
        // 關閉面板按鈕
        const closePanelBtn = document.getElementById('closePanelBtn');
        if (closePanelBtn) {
            closePanelBtn.addEventListener('click', () => this.toggleListPanel());
        }
        
        // 匯出/匯入功能
        document.getElementById('exportListBtn').addEventListener('click', () => this.exportList());
        document.getElementById('importListBtn').addEventListener('click', () => {
            this.uiDialogManager.showImportDialog((text) => this.importFromText(text));
        });
        document.getElementById('importFileInput').addEventListener('change', (e) => this.importList(e));
        
        // 載入更多
        this.elements.loadMore.querySelector('button').addEventListener('click', () => this.loadMoreMaps());
        
        // ESC 鍵關閉清單面板
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.myListPanel.classList.contains('active')) {
                this.toggleListPanel();
            }
        });
        
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
        
        // 格式輸入框變更時更新預覽
        const teleportFormat = document.getElementById('teleportFormat');
        const mapFormat = document.getElementById('mapFormat');
        if (teleportFormat && mapFormat) {
            teleportFormat.addEventListener('input', () => this.updateFormatPreview());
            mapFormat.addEventListener('input', () => this.updateFormatPreview());
        }
        
        // 語言快速切換按鈕
        const langZhBtn = document.getElementById('langZhBtn');
        const langEnBtn = document.getElementById('langEnBtn');
        const langJaBtn = document.getElementById('langJaBtn');
        if (langZhBtn) langZhBtn.addEventListener('click', () => this.switchLanguageTemplate('zh'));
        if (langEnBtn) langEnBtn.addEventListener('click', () => this.switchLanguageTemplate('en'));
        if (langJaBtn) langJaBtn.addEventListener('click', () => this.switchLanguageTemplate('ja'));
        
        // 摺疊功能
        const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
        collapsibleHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleCollapse(header);
            });
        });
        
        // 載入自訂格式設定
        this.loadFormatSettings();
    }
    
    // 更新過濾後的地圖列表
    updateFilteredMaps() {
        this.filteredMaps = this.filterManager.applyFilters(this.maps);
        this.currentDisplayCount = 0;
        this.displayMaps();
        
        // 如果有重置訊息需求
        if (!this.filterManager.hasActiveFilters() && this.lastFilterState?.hadFilters) {
            FF14Utils.showToast(i18n.t('messages.success.filterReset'), 'info');
        }
        
        // 記錄過濾器狀態
        this.lastFilterState = {
            hadFilters: this.filterManager.hasActiveFilters()
        };
    }
    
    displayMaps() {
        const start = this.currentDisplayCount;
        const end = Math.min(start + this.displayCount, this.filteredMaps.length);
        
        if (start === 0) {
            SecurityUtils.clearElement(this.elements.treasureGrid);
        }
        
        for (let i = start; i < end; i++) {
            const map = this.filteredMaps[i];
            this.elements.treasureGrid.appendChild(this.createMapCard(map));
        }
        
        this.currentDisplayCount = end;
        this.updateResultCount();
        
        // 顯示或隱藏載入更多按鈕
        if (this.currentDisplayCount < this.filteredMaps.length) {
            this.elements.loadMore.classList.remove('hidden');
        } else {
            this.elements.loadMore.classList.add('hidden');
        }
    }
    
    // HTML 編碼函數
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    createMapCard(map) {
        const card = document.createElement('div');
        card.className = 'treasure-card';
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
        actions.className = 'card-actions';
        
        // 詳細地圖按鈕
        const detailBtn = document.createElement('button');
        detailBtn.className = 'btn btn-secondary btn-sm btn-view-detail';
        detailBtn.setAttribute('data-i18n-title', 'buttons.viewDetailMap');
        detailBtn.title = i18n.t('buttons.viewDetailMap');
        
        const detailIcon = document.createElement('span');
        detailIcon.textContent = '🗺️';
        detailBtn.appendChild(detailIcon);
        
        const detailText = document.createElement('span');
        detailText.setAttribute('data-i18n', 'buttons.viewDetailMap');
        detailText.textContent = i18n.t('buttons.viewDetailMap');
        detailBtn.appendChild(detailText);
        
        detailBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiDialogManager.showMapDetail(map, {
                zoneManager: zoneManager,
                aetheryteData: this.aetheryteData,
                aetheryteIcon: this.aetheryteIcon,
                getAetherytesForZone: (zone) => this.getAetherytesForZone(zone)
            });
        });
        actions.appendChild(detailBtn);
        
        // 加入清單按鈕
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-sm btn-add-to-list';
        
        const span = document.createElement('span');
        span.className = 'btn-text';
        addBtn.appendChild(span);
        
        // 使用輔助函式更新按鈕狀態
        this.updateAddToListButton(addBtn, isInList);
        
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMapInList(map);
        });
        actions.appendChild(addBtn);
        
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
        
        // 添加游標樣式提示可點擊
        card.style.cursor = 'pointer';
        
        return card;
    }
    
    toggleMapInList(map) {
        // 使用 ListManager 處理清單操作
        const options = {
            maxItems: this.roomCollaboration?.currentRoom ? RoomCollaboration.CONSTANTS.MAX_MAPS : Infinity,
            addedBy: this.roomCollaboration?.currentUser?.id || null
        };
        
        const result = this.listManager.toggle(map, options);
        
        if (result.success) {
            FF14Utils.showToast(result.message, result.action === 'add' ? 'success' : 'info');
            
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
            
            // 使用輔助函式更新按鈕狀態
            this.updateAddToListButton(button, isInList);
        });
    }
    
    // 輔助函式：更新加入清單按鈕的狀態
    updateAddToListButton(button, isInList) {
        const btnText = button.querySelector('.btn-text');
        
        // 更新按鈕狀態和樣式
        button.dataset.state = isInList ? 'added' : 'default';
        button.className = `btn ${isInList ? 'btn-success' : 'btn-primary'} btn-sm btn-add-to-list`;
        
        // 更新 data-i18n 屬性和文字內容
        const i18nKey = isInList ? 'buttons.added' : 'buttons.addToList';
        btnText.setAttribute('data-i18n', i18nKey);
        btnText.textContent = i18n.t(i18nKey);
    }
    
    copyCoordinates(map) {
        CoordinateUtils.copyCoordinatesToClipboard(map.coords).then(() => {
            FF14Utils.showToast(i18n.t('messages.success.coordinateCopied'), 'success');
        }).catch(err => {
            console.error('複製失敗:', err);
            FF14Utils.showToast(i18n.t('messages.error.copyFailed'), 'error');
        });
    }
    
    // 取得地區對應的傳送點資料
    getAetherytesForZone(zoneName) {
        // G8 特殊地區的傳送點對應表
        // Dravania 需要細分為不同子地區
        const dravaniaZoneAetherytes = {
            'the_dravanian_forelands': ['tailfeather', 'anyx_trine'],
            'thedravanianforelands': ['tailfeather', 'anyx_trine'],
            'the_churning_mists': ['moghome', 'zenith'],
            'thechurningmists': ['moghome', 'zenith'],
            'the_dravanian_hinterlands': ['idyllshire', 'prologue_gate'],  // G8 沒有此地區，保留給其他地圖用
            'thedravanianhinterlands': ['idyllshire', 'prologue_gate']
        };
        
        // Gyr Abania 地區的特殊傳送點對應表 (G10)
        const gyrAbaniaZoneAetherytes = {
            'the_fringes': ['castrum_oriens', 'peering_stones'],
            'thefringes': ['castrum_oriens', 'peering_stones'],
            'the_peaks': ['ala_gannha', 'ala_ghiri'],
            'thepeaks': ['ala_gannha', 'ala_ghiri'],
            'the_lochs': ['porta_praetoria', 'ala_mhigan_quarter'],
            'thelochs': ['porta_praetoria', 'ala_mhigan_quarter']
        };
        
        // Othard 地區的特殊傳送點對應表 (G10)
        const othardZoneAetherytes = {
            'the_ruby_sea': ['tamamizu', 'onokoro'],
            'therubysea': ['tamamizu', 'onokoro'],
            'yanxia': ['house_of_the_fierce', 'namai'],
            'the_azim_steppe': ['dhoro_iloh', 'dawn_throne', 'reunion'],
            'theazimsteppe': ['dhoro_iloh', 'dawn_throne', 'reunion']
        };
        
        // Norvrandt 地區的特殊傳送點對應表 (G12)
        const norvrandtZoneAetherytes = {
            'lakeland': ['the_ostall_imperative', 'fort_jobb'],
            'kholusia': ['stilltide', 'tomra'],
            'amh_araeng': ['twine', 'mord_souq', 'inn_at_journeys_head'],
            'amharaeng': ['twine', 'mord_souq', 'inn_at_journeys_head'],
            'il_mheg': ['lydha_lran', 'pla_enni', 'wolekdorf'],
            'ilmheg': ['lydha_lran', 'pla_enni', 'wolekdorf'],
            'the_rak\'tika_greatwood': ['slitherbough', 'fanow'],
            'theraktikagreatwod': ['slitherbough', 'fanow'],
            'theraktikagreatwod': ['slitherbough', 'fanow'],
            'the_tempest': ['the_ondo_cups', 'the_macarenses_angle'],
            'thetempest': ['the_ondo_cups', 'the_macarenses_angle']
        };
        
        // Ilsabard 地區的特殊傳送點對應表 (G14)
        const ilsabardZoneAetherytes = {
            'labyrinthos': ['the_archeion', 'sharlayan_hamlet', 'aporia'],
            'thavnair': ['yedlihmad', 'great_work', 'palaka_stand'],
            'garlemald': ['camp_broken_glass', 'tertium'],
            'mare_lamentorum': ['sinus_lacrimarum', 'bestways_burrow'],
            'marelamentorum': ['sinus_lacrimarum', 'bestways_burrow'],
            'ultima_thule': ['reahs_tahra', 'base_omicron', 'ostrakon_deka_hexi'],
            'ultimathule': ['reahs_tahra', 'base_omicron', 'ostrakon_deka_hexi']
        };
        
        // Tural 地區的特殊傳送點對應表 (G17 & G18)
        const turalZoneAetherytes = {
            'urqopacha': ['wachunpelo', 'worqor_zormor'],
            'kozama\'uka': ['ok_hanu', 'earthenshire', 'many_fires', 'dock_poga'],
            'kozamauka': ['ok_hanu', 'earthenshire', 'many_fires', 'dock_poga'],
            'yak_t\'el': ['iq_br_aak', 'mamook'],
            'yaktel': ['iq_br_aak', 'mamook'],
            'shaaloani': ['hhusatahwi', 'meyhane', 'sheshenewezi_springs'],
            'heritage_found': ['the_outskirts', 'electrope_strike', 'yyasulani_station'],
            'heritagefound': ['the_outskirts', 'electrope_strike', 'yyasulani_station'],
            'living_memory': ['leynode_mnemes', 'leynode_aero', 'leynode_pyro'],
            'livingmemory': ['leynode_mnemes', 'leynode_aero', 'leynode_pyro']
        };
        
        // 建立地區名稱對應表
        const zoneMapping = {
            // Coerthas 高地
            'coerthas_western_highlands': 'coerthas',
            'coerthaswesternhighlands': 'coerthas',
            
            // Abalathia's Spine
            'the_sea_of_clouds': 'abalathia',
            'theseaofclouds': 'abalathia',
            
            // Dravania
            'the_dravanian_forelands': 'dravania',
            'thedravanianforelands': 'dravania',
            'the_churning_mists': 'dravania',
            'thechurningmists': 'dravania',
            'the_dravanian_hinterlands': 'dravania',
            'thedravanianhinterlands': 'dravania',
            
            // Gyr Abania
            'the_fringes': 'gyr_abania',
            'thefringes': 'gyr_abania',
            'the_peaks': 'gyr_abania',
            'thepeaks': 'gyr_abania',
            'the_lochs': 'gyr_abania',
            'thelochs': 'gyr_abania',
            
            // Othard
            'the_ruby_sea': 'othard',
            'therubysea': 'othard',
            'yanxia': 'othard',
            'the_azim_steppe': 'othard',
            'theazimsteppe': 'othard',
            
            // Norvrandt
            'lakeland': 'norvrandt',
            'kholusia': 'norvrandt',
            'amh_araeng': 'norvrandt',
            'amharaeng': 'norvrandt',
            'il_mheg': 'norvrandt',
            'ilmheg': 'norvrandt',
            'the_rak\'tika_greatwood': 'norvrandt',
            'theraktikagreatwod': 'norvrandt',
            'the_tempest': 'norvrandt',
            'thetempest': 'norvrandt',
            
            // Ilsabard (Endwalker)
            'labyrinthos': 'ilsabard',
            'thavnair': 'ilsabard',
            'garlemald': 'ilsabard',
            'mare_lamentorum': 'ilsabard',
            'marelamentorum': 'ilsabard',
            'ultima_thule': 'ilsabard',
            'ultimathule': 'ilsabard',
            
            // Elpis
            'elpis': 'elpis'
        };
        
        // 正規化地區名稱
        const normalizedZone = zoneName.toLowerCase().replace(/[\s'-]/g, '');
        
        // 檢查是否為 Dravania 的子地區 (G8)
        if (dravaniaZoneAetherytes[normalizedZone]) {
            const allowedAetherytes = dravaniaZoneAetherytes[normalizedZone];
            const dravaniaAetherytes = this.aetheryteData?.dravania || [];
            
            // 只返回屬於該地區的傳送點
            return dravaniaAetherytes.filter(aetheryte => 
                allowedAetherytes.includes(aetheryte.id)
            );
        }
        
        // 檢查是否為 Gyr Abania 的子地區
        if (gyrAbaniaZoneAetherytes[normalizedZone]) {
            const allowedAetherytes = gyrAbaniaZoneAetherytes[normalizedZone];
            const gyrAbaniaAetherytes = this.aetheryteData?.gyr_abania || [];
            
            // 只返回屬於該地區的傳送點
            return gyrAbaniaAetherytes.filter(aetheryte => 
                allowedAetherytes.includes(aetheryte.id)
            );
        }
        
        // 檢查是否為 Othard 的子地區
        if (othardZoneAetherytes[normalizedZone]) {
            const allowedAetherytes = othardZoneAetherytes[normalizedZone];
            const othardAetherytes = this.aetheryteData?.othard || [];
            
            // 只返回屬於該地區的傳送點
            return othardAetherytes.filter(aetheryte => 
                allowedAetherytes.includes(aetheryte.id)
            );
        }
        
        // 檢查是否為 Norvrandt 的子地區
        if (norvrandtZoneAetherytes[normalizedZone]) {
            const allowedAetherytes = norvrandtZoneAetherytes[normalizedZone];
            const norvrandtAetherytes = this.aetheryteData?.norvrandt || [];
            
            // 只返回屬於該地區的傳送點
            return norvrandtAetherytes.filter(aetheryte => 
                allowedAetherytes.includes(aetheryte.id)
            );
        }
        
        // 檢查是否為 Ilsabard 的子地區
        if (ilsabardZoneAetherytes[normalizedZone]) {
            const allowedAetherytes = ilsabardZoneAetherytes[normalizedZone];
            const ilsabardAetherytes = this.aetheryteData?.ilsabard || [];
            
            // 只返回屬於該地區的傳送點
            return ilsabardAetherytes.filter(aetheryte => 
                allowedAetherytes.includes(aetheryte.id)
            );
        }
        
        // 檢查是否為 Tural 的子地區
        if (turalZoneAetherytes[normalizedZone]) {
            const allowedAetherytes = turalZoneAetherytes[normalizedZone];
            const turalAetherytes = this.aetheryteData?.tural || [];
            
            // 只返回屬於該地區的傳送點
            return turalAetherytes.filter(aetheryte => 
                allowedAetherytes.includes(aetheryte.id)
            );
        }
        
        // 其他地區使用原本的對應邏輯
        const aetheryteRegion = zoneMapping[normalizedZone] || zoneMapping[zoneName.toLowerCase().replace(/[\s-]/g, '_')];
        
        if (aetheryteRegion && this.aetheryteData) {
            return this.aetheryteData[aetheryteRegion] || [];
        }
        
        // 嘗試直接從地區名稱查找
        const directMatch = this.aetheryteData?.[zoneName.toLowerCase()] || [];
        if (directMatch.length > 0) {
            return directMatch;
        }
        
        return [];
    }
    
    // 將遊戲座標轉換為圖片座標
    gameToImageCoords(gameX, gameY, imageWidth, imageHeight) {
        return CoordinateUtils.gameToImageCoords(gameX, gameY, imageWidth, imageHeight);
    }
    
    showDetailMap(map) {
        const modal = document.getElementById('mapDetailModal');
        const img = document.getElementById('mapDetailImage');
        const canvas = document.getElementById('mapDetailCanvas');
        const title = document.getElementById('mapDetailTitle');
        const coords = document.getElementById('mapDetailCoords');
        const closeBtn = document.getElementById('mapDetailClose');
        const overlay = document.getElementById('mapDetailOverlay');
        
        // 設置圖片路徑 - 使用基礎地圖
        const filePrefix = zoneManager.getFilePrefix(map.zoneId);
        const baseMapPath = `images/maps/map-${filePrefix}.webp`;
        img.src = baseMapPath;
        
        // 設置標題和座標
        const translations = zoneManager.getZoneNames(map.zoneId) || { zh: map.zone, en: map.zone, ja: map.zone };
        title.textContent = `${map.level.toUpperCase()} - ${translations.zh || map.zone}`;
        coords.textContent = `座標：${CoordinateUtils.formatCoordinatesForDisplay(map.coords)}`;
        
        // 載入寶圖標記圖示
        const markIcon = new Image();
        markIcon.src = 'images/ui/mark.png';
        
        // 當圖片載入完成後繪製傳送點和寶圖標記
        img.onload = () => {
            // 設置 canvas 尺寸與圖片相同
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            
            // 繪製內容
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 繪製寶圖標記的函數
            const drawTreasureMark = () => {
                // 計算標記大小（原始大小的3倍）
                const markWidth = 27 * 3;  // 原始寬度 27px
                const markHeight = 29 * 3; // 原始高度 29px
                
                // 轉換寶圖座標並繪製標記
                const treasureCoords = this.gameToImageCoords(
                    map.coords.x,
                    map.coords.y,
                    canvas.width,
                    canvas.height
                );
                
                // 繪製寶圖標記（確保中心對齊）
                ctx.drawImage(
                    markIcon,
                    Math.floor(treasureCoords.x - markWidth / 2),
                    Math.floor(treasureCoords.y - markHeight / 2),
                    markWidth,
                    markHeight
                );
                
                // 開發模式：繪製精確座標點
                if (window.location.hostname === 'localhost') {
                    ctx.save();
                    ctx.strokeStyle = 'lime';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(treasureCoords.x - 10, treasureCoords.y);
                    ctx.lineTo(treasureCoords.x + 10, treasureCoords.y);
                    ctx.moveTo(treasureCoords.x, treasureCoords.y - 10);
                    ctx.lineTo(treasureCoords.x, treasureCoords.y + 10);
                    ctx.stroke();
                    ctx.restore();
                }
            };
            
            // 檢查標記圖示是否已經載入
            if (markIcon.complete && markIcon.naturalHeight !== 0) {
                drawTreasureMark();
            } else {
                markIcon.onload = drawTreasureMark;
            }
            
            // 取得該地區的傳送點
            const aetherytes = this.getAetherytesForZone(map.zone);
            console.log(`Zone: ${map.zone}, Found ${aetherytes.length} aetherytes`);
            
            if (aetherytes.length > 0 && this.aetheryteIcon) {
                // 計算圖標大小（根據圖片大小調整）
                const iconSize = Math.max(24, Math.min(48, canvas.width / 20));
                
                aetherytes.forEach(aetheryte => {
                    // 轉換座標
                    const imageCoords = this.gameToImageCoords(
                        aetheryte.coords.x,
                        aetheryte.coords.y,
                        canvas.width,
                        canvas.height
                    );
                    
                    // 繪製傳送點圖標（確保中心對齊）
                    // 使用 Math.floor 確保像素對齊
                    ctx.drawImage(
                        this.aetheryteIcon,
                        Math.floor(imageCoords.x - iconSize / 2),
                        Math.floor(imageCoords.y - iconSize / 2),
                        iconSize,
                        iconSize
                    );
                    
                    // 開發模式：繪製精確座標點（可選）
                    if (window.location.hostname === 'localhost') {
                        ctx.save();
                        ctx.strokeStyle = 'red';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(imageCoords.x - 5, imageCoords.y);
                        ctx.lineTo(imageCoords.x + 5, imageCoords.y);
                        ctx.moveTo(imageCoords.x, imageCoords.y - 5);
                        ctx.lineTo(imageCoords.x, imageCoords.y + 5);
                        ctx.stroke();
                        ctx.restore();
                    }
                    
                    // 繪製傳送點名稱
                    ctx.save();
                    
                    // 根據圖片大小動態調整字體大小
                    const fontSize = Math.max(16, Math.min(24, canvas.width / 40));
                    ctx.font = `bold ${fontSize}px Arial, "Microsoft JhengHei", sans-serif`;
                    ctx.fillStyle = 'white';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 4;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    
                    const text = aetheryte.name.zh || aetheryte.name.en;
                    const textY = imageCoords.y + iconSize / 2 + 10;
                    
                    // 添加半透明背景以提高可讀性
                    const metrics = ctx.measureText(text);
                    const textWidth = metrics.width;
                    const textHeight = fontSize * 1.2;
                    
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fillRect(
                        imageCoords.x - textWidth / 2 - 5,
                        textY - 2,
                        textWidth + 10,
                        textHeight
                    );
                    
                    // 繪製文字
                    ctx.fillStyle = 'white';
                    ctx.strokeText(text, imageCoords.x, textY);
                    ctx.fillText(text, imageCoords.x, textY);
                    ctx.restore();
                });
            }
        };
        
        // 顯示彈出視窗
        modal.style.display = 'flex';
        
        // 點擊關閉按鈕關閉
        const closeModal = () => {
            modal.style.display = 'none';
            closeBtn.removeEventListener('click', closeModal);
            overlay.removeEventListener('click', closeModal);
            img.onload = null; // 清理事件
            markIcon.onload = null; // 清理標記圖示事件
        };
        
        closeBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);
        
        // 按 ESC 鍵關閉
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    toggleListPanel() {
        const isActive = this.elements.myListPanel.classList.contains('active');
        const overlay = document.getElementById('panelOverlay');
        
        if (!isActive) {
            // 開啟面板
            this.elements.myListPanel.classList.add('active');
            overlay.classList.add('active');
            this.renderMyList();
            document.body.style.overflow = 'hidden';
        } else {
            // 關閉面板
            this.elements.myListPanel.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
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
            emptyText.setAttribute('data-i18n', 'list.empty');
            emptyText.textContent = i18n.t('list.empty');
            emptyState.appendChild(emptyText);
            
            const hintText = document.createElement('p');
            hintText.className = 'text-secondary';
            hintText.setAttribute('data-i18n', 'list.emptyHint');
            hintText.textContent = i18n.t('list.emptyHint');
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
            levelSpan.className = 'item-level';
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
                zoneSpan.textContent = translations.zh;
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
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove';
            removeBtn.dataset.mapId = item.id;
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', (e) => {
                this.removeFromList(item.id);
            });
            listItem.appendChild(removeBtn);
            
            this.elements.listContent.appendChild(listItem);
        });
    }
    
    removeFromList(mapId) {
        if (confirm('確定要移除這張寶圖嗎？')) {
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
        const currentLength = this.listManager.getLength();
        
        if (currentLength === 0) {
            FF14Utils.showToast(i18n.t('messages.warning.listAlreadyEmpty'), 'info');
            return;
        }
        
        if (confirm(`確定要清空所有寶圖嗎？共 ${currentLength} 張`)) {
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
    
    loadMoreMaps() {
        this.displayMaps();
    }
    
    updateResultCount() {
        const showing = i18n.t('results.showing', { 
            showing: this.currentDisplayCount,
            total: this.filteredMaps.length
        });
        this.elements.resultCount.textContent = showing;
    }
    
    updateListCount() {
        const count = this.listManager.getLength();
        this.elements.listCount.textContent = `(${count})`;
        
        // 使用 i18n 翻譯更新總計文字
        if (this.elements.totalCountText) {
            this.elements.totalCountText.textContent = i18n.plural('list.totalLabel', count, { count });
        }
        
        // 更新生成路線按鈕狀態
        const generateRouteBtn = document.getElementById('generateRouteBtn');
        if (generateRouteBtn) {
            generateRouteBtn.disabled = count < 2;
        }
    }
    
    /**
     * 更新動態文字（語言切換時呼叫）
     */
    updateDynamicText() {
        // 更新結果計數
        this.updateResultCount();
        
        // 更新清單計數
        this.updateListCount();
        
        // 使用 i18n 的 translatePage 功能更新所有帶有 data-i18n 屬性的元素
        // 這會自動更新已存在的寶圖卡片和清單項目的文字，避免重新建立 DOM
        i18n.translatePage();
        
        // 如果有路線面板開啟，更新路線資訊
        const routePanel = document.getElementById('routePanel');
        if (routePanel && routePanel.classList.contains('active')) {
            const routeResult = this.currentRouteResult;
            if (routeResult) {
                this.uiDialogManager.showRouteResult(routeResult, {
                    onStepCopy: (step, index, total) => {
                        const formattedText = this.formatStepForCopy(step, index + 1, total);
                        navigator.clipboard.writeText(formattedText).then(() => {
                            FF14Utils.showToast(i18n.t('messages.success.copied'), 'success');
                        });
                    },
                    getZoneName: (zoneId) => this.getZoneName(zoneId)
                });
            }
        }
    }
    
    showLoading(show) {
        if (show) {
            SecurityUtils.clearElement(this.elements.treasureGrid);
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading';
            loadingDiv.setAttribute('data-i18n', 'results.loading');
            loadingDiv.textContent = i18n.t('results.loading');
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
        reloadBtn.setAttribute('data-i18n', 'buttons.reload');
        reloadBtn.textContent = i18n.t('buttons.reload');
        reloadBtn.addEventListener('click', () => location.reload());
        
        errorDiv.appendChild(document.createElement('br'));
        errorDiv.appendChild(reloadBtn);
        this.elements.treasureGrid.appendChild(errorDiv);
    }
    
    // 匯出清單功能（複製到剪貼簿）
    exportList() {
        if (this.listManager.getLength() === 0) {
            FF14Utils.showToast(i18n.t('messages.warning.emptyListExport'), 'warning');
            return;
        }
        
        // 使用 ListManager 的匯出功能
        const jsonString = this.listManager.exportAsJson();
        
        // 複製到剪貼簿
        navigator.clipboard.writeText(jsonString).then(() => {
            FF14Utils.showToast(i18n.t('messages.success.listCopiedWithCount', { count: this.listManager.getLength() }), 'success');
        }).catch(err => {
            console.error('複製失敗:', err);
            // 備用方案：顯示可複製的文字框
            this.uiDialogManager.showExportDialog(jsonString);
        });
    }
    
    // 從文字匯入清單
    async importFromText(text) {
        if (!text.trim()) {
            FF14Utils.showToast(i18n.t('messages.warning.pasteContent'), 'warning');
            return;
        }
        
        try {
            // 確認是否要合併或取代
            let merge = false;
            
            if (this.listManager.getLength() > 0) {
                // 先解析資料以獲取數量
                const parseResult = SecurityUtils.safeJSONParse(text);
                if (!parseResult.success) {
                    FF14Utils.showToast(i18n.t('messages.error.invalidFileFormat'), 'error');
                    return;
                }
                const previewData = parseResult.data;
                const confirmMessage = `目前清單有 ${this.listManager.getLength()} 張寶圖。\n` +
                    `要匯入的清單包含 ${previewData.maps?.length || 0} 張寶圖。\n\n` +
                    `選擇「確定」將合併清單（避免重複）\n` +
                    `選擇「取消」將取代現有清單`;
                
                merge = confirm(confirmMessage);
            }
            
            // 使用 ListManager 的匯入功能
            const result = this.listManager.import(text, merge);
            
            if (result.success) {
                FF14Utils.showToast(result.message, 'success');
                this.updateListCount();
                this.updateCardButtons();
                this.renderMyList();
            } else {
                FF14Utils.showToast(result.message, 'error');
            }
            
        } catch (error) {
            console.error('匯入失敗:', error);
            FF14Utils.showToast(i18n.t('messages.error.importFailed', { error: error.message }), 'error');
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
            FF14Utils.showToast(i18n.t('messages.error.readFileFailed'), 'error');
        }
        
        // 清空檔案輸入
        event.target.value = '';
    }
    
    // 生成路線
    async generateRoute() {
        const myList = this.listManager.getList();
        
        if (myList.length < 2) {
            FF14Utils.showToast(i18n.t('messages.warning.needTwoMaps'), 'error');
            return;
        }
        
        // 等待 routeCalculator 載入完成
        if (!routeCalculator || !routeCalculator.aetherytes) {
            FF14Utils.showToast('正在載入傳送點資料，請稍後再試', 'info');
            // 等待一下再試
            setTimeout(() => {
                if (routeCalculator && routeCalculator.aetherytes) {
                    this.generateRoute();
                }
            }, 1000);
            return;
        }
        
        // 計算路線
        const result = routeCalculator.calculateRoute(myList);
        
        if (!result || !result.route || result.route.length === 0) {
            FF14Utils.showToast('無法生成路線', 'error');
            return;
        }
        
        // 儲存完整路線結果供複製和語言切換使用
        this.currentRoute = result.route;
        this.currentRouteResult = result;
        
        // 顯示路線結果
        this.uiDialogManager.showRouteResult(result, {
            onStepCopy: (step, index, total) => {
                const formattedText = this.formatStepForCopy(step, index + 1, total);
                navigator.clipboard.writeText(formattedText).then(() => {
                    FF14Utils.showToast('已複製', 'success');
                });
            },
            getZoneName: (zoneId) => this.getZoneName(zoneId)
        });
    }
    
    // 摺疊功能
    toggleCollapse(header) {
        const targetId = header.dataset.collapse;
        const targetElement = document.getElementById(targetId);
        
        if (!targetElement) {
            console.error('Target element not found:', targetId);
            return;
        }
        
        if (targetElement.classList.contains('collapsed')) {
            targetElement.classList.remove('collapsed');
            header.setAttribute('data-expanded', 'true');
            console.log('Expanded:', targetId);
        } else {
            targetElement.classList.add('collapsed');
            header.setAttribute('data-expanded', 'false');
            console.log('Collapsed:', targetId);
        }
    }
    
    // 複製整個路線
    copyEntireRoute() {
        if (!this.currentRoute || this.currentRoute.length === 0) {
            FF14Utils.showToast('沒有可複製的路線', 'error');
            return;
        }
        
        // 使用自訂格式建構路線文字
        const routeText = this.currentRoute.map((step, index) => {
            return this.formatStepForCopy(step, index + 1, this.currentRoute.length);
        }).join('\n');
        
        // 複製到剪貼簿
        navigator.clipboard.writeText(routeText).then(() => {
            FF14Utils.showToast(i18n.t('messages.success.routeCopiedWithCount', { count: this.currentRoute.length }), 'success');
        }).catch(() => {
            FF14Utils.showToast(i18n.t('messages.error.copyFailed'), 'error');
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
            } catch (e) {
                this.formatSettings = this.getDefaultFormats();
            }
        } else {
            this.formatSettings = this.getDefaultFormats();
        }
        
        // 更新 UI
        const teleportFormat = document.getElementById('teleportFormat');
        const mapFormat = document.getElementById('mapFormat');
        if (teleportFormat) teleportFormat.value = this.formatSettings.teleport;
        if (mapFormat) mapFormat.value = this.formatSettings.map;
    }
    
    // 取得預設格式
    getDefaultFormats() {
        return {
            teleport: '/p 傳送至 <傳送點> <座標>',
            map: '/p 下一個 <寶圖等級> - <地區> <座標>'
        };
    }
    
    // 儲存格式設定
    saveFormatSettings() {
        const values = this.uiDialogManager.getFormatValues();
        
        this.formatSettings = {
            teleport: values.teleport,
            map: values.map
        };
        
        localStorage.setItem('treasureMapFormatSettings', JSON.stringify(this.formatSettings));
        FF14Utils.showToast('格式設定已儲存', 'success');
        this.uiDialogManager.hideFormatPanel();
    }
    
    // 重置格式設定
    resetFormatSettings() {
        this.formatSettings = this.getDefaultFormats();
        
        this.uiDialogManager.setFormatValues(this.formatSettings);
        this.updateFormatPreview();
        FF14Utils.showToast('已重置為預設格式', 'info');
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
        const templates = {
            zh: {
                teleport: '/p 傳送至 <傳送點> <座標>',
                map: '/p 下一個 <寶圖等級> - <地區> <座標>'
            },
            en: {
                teleport: '/p Teleport to <傳送點_en> <座標>',
                map: '/p Next <寶圖等級> - <地區_en> <座標>'
            },
            ja: {
                teleport: '/p <傳送點_ja>にテレポート <座標>',
                map: '/p 次 <寶圖等級> - <地區_ja> <座標>'
            }
        };
        
        const template = templates[lang];
        if (!template) return;
        
        const teleportFormat = document.getElementById('teleportFormat');
        const mapFormat = document.getElementById('mapFormat');
        
        if (teleportFormat) teleportFormat.value = template.teleport;
        if (mapFormat) mapFormat.value = template.map;
        
        this.updateFormatPreview();
        
        // 顯示語言切換成功訊息
        const langNames = {
            zh: '中文',
            en: '英文',
            ja: '日文'
        };
        FF14Utils.showToast(`已切換至${langNames[lang]}模板`, 'info');
    }
    
    // 關閉路線面板
    closeRoutePanel() {
        this.uiDialogManager.hideRouteResult();
    }
    
    // 取得地區名稱
    getZoneName(zoneId) {
        return zoneManager.getZoneNameZh(zoneId) || zoneId;
    }
    
    // 取得傳送點名稱
    getAetheryteName(aetheryteData) {
        // 如果是物件格式（包含多語言）
        if (typeof aetheryteData === 'object' && aetheryteData !== null) {
            return aetheryteData;
        }
        // 如果是字串，返回包裝成物件
        return { zh: aetheryteData };
    }
    
    // 設定協作實例
    setRoomCollaboration(roomCollaboration) {
        this.roomCollaboration = roomCollaboration;
    }
    
    // 同步寶圖到房間
    async syncToRoom() {
        if (!this.roomCollaboration?.currentRoom) return;
        
        try {
            const myList = this.listManager.getList();
            const treasureMaps = myList.map(item => ({
                id: item.id,
                type: item.level,
                x: item.coords.x,
                y: item.coords.y,
                zone: item.zone,
                addedBy: item.addedBy,  // 保持原始值，即使是 null
                addedAt: item.addedAt || new Date().toISOString()
            }));
            
            const response = await fetch(
                `${RoomCollaboration.CONSTANTS.API_BASE_URL}/rooms/${this.roomCollaboration.currentRoom.roomCode}`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        treasureMaps
                    })
                }
            );
            
            if (!response.ok) {
                throw new Error('同步失敗');
            }
            
            // 更新房間資料
            const updatedRoom = await response.json();
            this.roomCollaboration.currentRoom = updatedRoom;
            
        } catch (error) {
            console.error('同步到房間失敗:', error);
            FF14Utils.showToast('同步失敗，請稍後再試', 'error');
        }
    }
    
    // 從房間同步寶圖
    syncFromRoom() {
        if (!this.roomCollaboration?.currentRoom) return;
        
        const roomMaps = this.roomCollaboration.currentRoom.treasureMaps || [];
        
        // 使用 ListManager 的 syncFromRoom 方法
        this.listManager.syncFromRoom(roomMaps, this.maps);
        
        // 更新 UI
        this.updateListCount();
        this.updateCardButtons();
        this.renderMyList();
    }
}

// 路線計算器類別
class RouteCalculator {
    constructor() {
        this.aetherytes = null;
        this.loadAetherytes();
    }
    
    async loadAetherytes() {
        try {
            const response = await fetch('../../data/aetherytes.json');
            const data = await response.json();
            this.aetherytes = data.aetherytes;
        } catch (error) {
            console.error('載入傳送點資料失敗:', error);
        }
    }
    
    // 3D 距離計算（修正版）
    calculateDistance(from, to) {
        // 跨地圖移動
        if (from.zoneId !== to.zoneId) {
            return 0;
        }
        
        // 任何點到傳送點：零成本
        if (to.isTeleport) {
            return 0;
        }
        
        // 傳送點到普通點或普通點到普通點：3D 歐幾里得距離
        return CoordinateUtils.calculate3DDistance(from.coords, to.coords);
    }
    
    // 主要路線計算
    calculateRoute(maps) {
        console.log('=== 開始路線計算 ===');
        console.log('輸入地圖數量:', maps.length);
        console.log('輸入地圖資料:', JSON.stringify(maps, null, 2));
        
        if (!maps || maps.length === 0) return { summary: {}, route: [] };
        if (!this.aetherytes) {
            console.error('傳送點資料尚未載入');
            return { summary: {}, route: [] };
        }
        
        console.log('傳送點資料已載入:', Object.keys(this.aetherytes));
        
        // 1. 找出起始地區（全域最近的寶圖-傳送點配對）
        const { startRegion, startMap } = this.findStartingRegion(maps);
        console.log('起始地區:', startRegion, '起始地圖:', startMap);
        
        // 2. 按地區分組
        const mapsByRegion = this.groupByZone(maps);
        console.log('地區分組結果:', Object.keys(mapsByRegion).map(k => `${k}: ${mapsByRegion[k].length}張`));
        
        // 3. 決定地區訪問順序（第一個已決定，其餘按數量）
        const regionOrder = this.getRegionOrder(mapsByRegion, startRegion);
        console.log('地區訪問順序:', regionOrder);
        
        // 4. 為每個地區規劃路線
        const route = [];
        let totalTeleports = 0;
        
        for (const region of regionOrder) {
            if (mapsByRegion[region]) {
                console.log(`\n--- 規劃 ${region} 地區路線 ---`);
                const regionRoute = this.planRegionRoute(mapsByRegion[region]);
                console.log(`${region} 地區路線步驟數:`, regionRoute.length);
                console.log(`${region} 地區路線詳情:`, JSON.stringify(regionRoute, null, 2));
                route.push(...regionRoute);
                
                // 計算傳送次數
                const regionTeleports = regionRoute.filter(step => step.type === 'teleport').length;
                console.log(`${region} 地區傳送次數:`, regionTeleports);
                totalTeleports += regionTeleports;
            }
        }
        
        // 獲取實際的地區名稱列表
        const regionsVisited = [];
        for (const regionId of regionOrder) {
            if (mapsByRegion[regionId] && mapsByRegion[regionId].length > 0) {
                // 儲存 zoneId 而不是 zone 名稱，以便後續能正確翻譯
                if (!regionsVisited.includes(regionId)) {
                    regionsVisited.push(regionId);
                }
            }
        }
        
        console.log('\n=== 路線計算完成 ===');
        console.log('總傳送次數:', totalTeleports);
        console.log('訪問地區:', regionsVisited);
        console.log('完整路線:', JSON.stringify(route, null, 2));
        
        return {
            summary: {
                totalMaps: maps.length,
                totalTeleports: totalTeleports,
                regionsVisited: regionsVisited
            },
            route: route
        };
    }
    
    // 找出全域最近的寶圖-傳送點配對
    findStartingRegion(maps) {
        console.log('findStartingRegion 開始');
        let minDistance = Infinity;
        let startRegion = null;
        let startMap = null;
        
        for (const map of maps) {
            // 確保 map 有 zoneId
            const zoneId = this.getZoneId(map.zone) || map.zoneId;
            if (!zoneId) {
                console.log(`警告: 無法找到 ${map.zone} 的 zoneId`);
                continue;
            }
            
            const aetherytes = this.getRegionAetherytes(zoneId);
            console.log(`地圖 ${map.id} (${map.zone}) 的 zoneId: ${zoneId}, 傳送點數量: ${aetherytes.length}`);
            
            for (const aetheryte of aetherytes) {
                const dist = this.calculateDistance(
                    { coords: map.coords, zoneId: zoneId },
                    { coords: aetheryte.coords, zoneId: zoneId, isTeleport: true }
                );
                console.log(`  - 傳送點 ${aetheryte.name?.zh || aetheryte.id} 距離: ${dist}`);
                if (dist < minDistance) {
                    minDistance = dist;
                    startRegion = zoneId;
                    startMap = { ...map, zoneId: zoneId };
                }
            }
        }
        
        console.log(`起始地區選擇: ${startRegion}, 最短距離: ${minDistance}`);
        return { startRegion, startMap };
    }
    
    // 按地區分組
    groupByZone(maps) {
        const groups = {};
        for (const map of maps) {
            // 優先使用原始的 zoneId，這樣可以保留具體的地區資訊
            const zoneId = map.zoneId || this.getZoneId(map.zone) || 'unknown';
            if (!groups[zoneId]) {
                groups[zoneId] = [];
            }
            // 確保每個 map 都有 zoneId
            groups[zoneId].push({
                ...map,
                zoneId: zoneId
            });
        }
        return groups;
    }
    
    // 將 zone 名稱轉換為 zoneId
    getZoneId(zoneName) {
        // 建立 zone 名稱到 zoneId 的映射
        const zoneMapping = {
            // 2.0 地區
            'La Noscea': 'la_noscea',
            'The Black Shroud': 'the_black_shroud',
            'Thanalan': 'thanalan',
            'Coerthas': 'coerthas',
            'Mor Dhona': 'mor_dhona',
            
            // 3.0 蒼天地區
            'Coerthas Western Highlands': 'coerthas',
            'The Dravanian Forelands': 'dravania',
            'The Churning Mists': 'dravania',
            'The Sea of Clouds': 'abalathia',
            'Abalathia': 'abalathia',
            'Dravania': 'dravania',
            
            // 4.0 紅蓮地區
            'The Fringes': 'gyr_abania',
            'The Peaks': 'gyr_abania',
            'The Lochs': 'gyr_abania',
            'The Ruby Sea': 'othard',
            'Yanxia': 'othard',
            'The Azim Steppe': 'othard',
            'Gyr Abania': 'gyr_abania',
            'Othard': 'othard',
            
            // 5.0 漆黑地區
            'Lakeland': 'norvrandt',
            'Kholusia': 'norvrandt',
            'Amh Araeng': 'norvrandt',
            'Il Mheg': 'norvrandt',
            'The Rak\'tika Greatwood': 'norvrandt',
            'The Tempest': 'norvrandt',
            'Norvrandt': 'norvrandt',
            
            // 6.0 曉月地區
            'Labyrinthos': 'ilsabard',
            'Thavnair': 'ilsabard',
            'Garlemald': 'ilsabard',
            'Mare Lamentorum': 'ilsabard',
            'Elpis': 'elpis',
            'Ultima Thule': 'ilsabard',
            'Ilsabard': 'ilsabard',
            
            // 7.0 黃金地區
            'Urqopacha': 'tural',
            'Kozama\'uka': 'tural',
            'Yak T\'el': 'tural',
            'Shaaloani': 'tural',
            'Heritage Found': 'tural',
            'Living Memory': 'tural',
            'Tural': 'tural'
        };
        
        return zoneMapping[zoneName] || null;
    }
    
    // 決定地區訪問順序
    getRegionOrder(mapsByRegion, startRegion) {
        const regions = Object.keys(mapsByRegion);
        const otherRegions = regions.filter(r => r !== startRegion);
        
        // 其餘地區按寶圖數量排序（多的優先）
        otherRegions.sort((a, b) => 
            mapsByRegion[b].length - mapsByRegion[a].length
        );
        
        return [startRegion, ...otherRegions];
    }
    
    // 取得地區的傳送點
    getRegionAetherytes(zoneId) {
        console.log(`getRegionAetherytes 查詢 zoneId: ${zoneId}`);
        
        if (!this.aetherytes) {
            console.log('傳送點資料尚未載入');
            return [];
        }
        
        // 先嘗試直接查找（對於區域 ID 如 "coerthas", "dravania" 等）
        if (this.aetherytes[zoneId]) {
            const aetherytes = this.aetherytes[zoneId].map(a => ({
                ...a,
                zoneId: zoneId,
                isTeleport: true
            }));
            console.log(`找到 ${aetherytes.length} 個傳送點 (直接):`, aetherytes.map(a => a.name?.zh || a.id));
            return aetherytes;
        }
        
        // 如果沒找到，可能是具體的地區 ID（如 "urqopacha"），需要找到它所屬的區域
        const regionId = zoneManager.getRegionId(zoneId);
        console.log(`${zoneId} 所屬區域: ${regionId}`);
        
        if (regionId && this.aetherytes[regionId]) {
            // 獲取該地區的傳送點列表
            const zoneAetheryteIds = zoneManager.getZoneById(zoneId)?.aetherytes || [];
            console.log(`${zoneId} 的傳送點 IDs:`, zoneAetheryteIds);
            
            // 從區域傳送點中篩選出屬於該地區的傳送點
            const aetherytes = this.aetherytes[regionId]
                .filter(a => zoneAetheryteIds.includes(a.id))
                .map(a => ({
                    ...a,
                    zoneId: zoneId,
                    isTeleport: true
                }));
            
            console.log(`找到 ${aetherytes.length} 個傳送點 (篩選):`, aetherytes.map(a => a.name?.zh || a.id));
            return aetherytes;
        }
        
        console.log(`找不到 ${zoneId} 的傳送點資料`);
        return [];
    }
    
    // 地區內路線規劃（基於傳送點分組策略）
    planRegionRoute(regionMaps) {
        console.log('planRegionRoute 開始，地圖數量:', regionMaps.length);
        console.log('第一張地圖資料:', regionMaps[0]);
        
        const normalMaps = regionMaps; // 所有寶圖都是普通點
        const teleports = this.getRegionAetherytes(regionMaps[0].zoneId);
        
        console.log('取得的傳送點數量:', teleports.length);
        console.log('傳送點資料:', JSON.stringify(teleports, null, 2));
        
        // 取得第一個地圖的 zone 名稱（實際地區名稱）
        const zoneName = regionMaps[0].zone;
        console.log('地區名稱 (zone):', zoneName);
        console.log('地區ID (zoneId):', regionMaps[0].zoneId);
        
        // 使用新的分組策略：根據最近傳送點將寶圖分組
        const result = this.solveWithTeleportGrouping(normalMaps, teleports);
        console.log('分組求解結果路徑長度:', result.path.length);
        console.log('分組求解結果路徑:', JSON.stringify(result.path, null, 2));
        
        // 轉換為路線步驟格式
        const route = [];
        let lastWasTeleport = false;
        
        for (let i = 0; i < result.path.length; i++) {
            const point = result.path[i];
            console.log(`處理路徑點 ${i}:`, point);
            
            if (point.isTeleport) {
                if (i === 0 || !lastWasTeleport) {
                    const routeStep = {
                        type: 'teleport',
                        to: point.name,
                        zone: zoneName,  // 使用實際的 zone 名稱
                        zoneId: point.zoneId,
                        coords: point.coords
                    };
                    console.log('新增傳送步驟:', routeStep);
                    route.push(routeStep);
                }
                lastWasTeleport = true;
            } else {
                const routeStep = {
                    type: 'move',
                    mapId: point.id,
                    mapLevel: point.level || point.levelName,  // 確保有 level 資料
                    zone: point.zone,  // 使用實際的 zone 名稱
                    zoneId: point.zoneId,
                    coords: point.coords
                };
                console.log('新增移動步驟:', routeStep);
                route.push(routeStep);
                lastWasTeleport = false;
            }
        }
        
        console.log('planRegionRoute 完成，路線步驟數:', route.length);
        return route;
    }
    
    // 基於傳送點分組的求解策略
    solveWithTeleportGrouping(normalPoints, teleportPoints) {
        console.log('solveWithTeleportGrouping 開始');
        console.log('寶圖數量:', normalPoints.length);
        console.log('傳送點數量:', teleportPoints.length);
        
        if (normalPoints.length === 0) {
            console.log('無寶圖，返回空路徑');
            return { path: [], distance: 0 };
        }
        
        if (teleportPoints.length === 0) {
            console.log('無傳送點，使用純TSP');
            return this.solvePureTSP(normalPoints);
        }
        
        // 1. 為每個寶圖分配最近的傳送點
        const mapGroups = new Map(); // teleportId -> maps[]
        
        for (const map of normalPoints) {
            let closestTeleport = null;
            let minDistance = Infinity;
            
            for (const teleport of teleportPoints) {
                const dist = this.calculateDistance(
                    teleport,
                    { coords: map.coords, zoneId: map.zoneId }
                );
                
                if (dist < minDistance) {
                    minDistance = dist;
                    closestTeleport = teleport;
                }
            }
            
            const teleportId = closestTeleport.id;
            if (!mapGroups.has(teleportId)) {
                mapGroups.set(teleportId, {
                    teleport: closestTeleport,
                    maps: []
                });
            }
            mapGroups.get(teleportId).maps.push(map);
            
            console.log(`寶圖 ${map.id} 分配到傳送點 ${closestTeleport.name?.zh || closestTeleport.id}, 距離: ${minDistance}`);
        }
        
        console.log('分組結果:', Array.from(mapGroups.entries()).map(([id, group]) => 
            `${group.teleport.name?.zh || id}: ${group.maps.length}張`
        ));
        
        // 2. 對每個傳送點組內的寶圖進行TSP求解
        const groupRoutes = [];
        for (const [teleportId, group] of mapGroups) {
            if (group.maps.length === 1) {
                // 只有一張寶圖，直接加入
                groupRoutes.push({
                    teleport: group.teleport,
                    maps: group.maps,
                    distance: this.calculateDistance(
                        group.teleport,
                        { coords: group.maps[0].coords, zoneId: group.maps[0].zoneId }
                    )
                });
            } else {
                // 多張寶圖，進行局部TSP
                const localTSP = this.solveTSPFromTeleport(group.teleport, group.maps);
                groupRoutes.push({
                    teleport: group.teleport,
                    maps: localTSP.path,
                    distance: localTSP.distance
                });
            }
        }
        
        // 3. 決定傳送點組的訪問順序（按寶圖數量降序）
        groupRoutes.sort((a, b) => b.maps.length - a.maps.length);
        console.log('傳送點訪問順序:', groupRoutes.map(g => 
            `${g.teleport.name?.zh || g.teleport.id} (${g.maps.length}張)`
        ));
        
        // 4. 構建最終路徑
        const finalPath = [];
        let totalDistance = 0;
        
        for (const group of groupRoutes) {
            // 加入傳送點
            finalPath.push(group.teleport);
            // 加入該組的所有寶圖
            finalPath.push(...group.maps);
            totalDistance += group.distance;
        }
        
        console.log('最終路徑構建完成，總長度:', finalPath.length);
        console.log('路徑中傳送點數:', finalPath.filter(p => p.isTeleport).length);
        console.log('路徑中寶圖數:', finalPath.filter(p => !p.isTeleport).length);
        
        return {
            path: finalPath,
            distance: totalDistance
        };
    }
    
    // 從傳送點開始的TSP求解
    solveTSPFromTeleport(teleport, maps) {
        if (maps.length === 1) {
            return {
                path: maps,
                distance: this.calculateDistance(
                    teleport,
                    { coords: maps[0].coords, zoneId: maps[0].zoneId }
                )
            };
        }
        
        // 使用最近鄰居法，從傳送點開始
        const visited = new Array(maps.length).fill(false);
        const path = [];
        let totalDistance = 0;
        
        // 找到離傳送點最近的寶圖作為起點
        let nearestIdx = -1;
        let nearestDistance = Infinity;
        
        for (let i = 0; i < maps.length; i++) {
            const dist = this.calculateDistance(
                teleport,
                { coords: maps[i].coords, zoneId: maps[i].zoneId }
            );
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestIdx = i;
            }
        }
        
        // 從最近的寶圖開始
        visited[nearestIdx] = true;
        path.push(maps[nearestIdx]);
        totalDistance += nearestDistance;
        let currentIdx = nearestIdx;
        
        // 繼續訪問剩餘的寶圖
        for (let i = 1; i < maps.length; i++) {
            nearestIdx = -1;
            nearestDistance = Infinity;
            
            for (let j = 0; j < maps.length; j++) {
                if (!visited[j]) {
                    const dist = this.calculateDistance(
                        { coords: maps[currentIdx].coords, zoneId: maps[currentIdx].zoneId },
                        { coords: maps[j].coords, zoneId: maps[j].zoneId }
                    );
                    if (dist < nearestDistance) {
                        nearestDistance = dist;
                        nearestIdx = j;
                    }
                }
            }
            
            if (nearestIdx !== -1) {
                visited[nearestIdx] = true;
                path.push(maps[nearestIdx]);
                totalDistance += nearestDistance;
                currentIdx = nearestIdx;
            }
        }
        
        return { path, distance: totalDistance };
    }
    
    // 啟發式求解（改編自演算法文件）
    solveWithHeuristic(normalPoints, teleportPoints) {
        console.log('solveWithHeuristic 開始');
        console.log('普通點數量:', normalPoints.length);
        console.log('傳送點數量:', teleportPoints.length);
        
        // 特殊情況
        if (normalPoints.length === 0) {
            console.log('無普通點，返回所有傳送點');
            return { path: teleportPoints, distance: 0 };
        }
        
        if (teleportPoints.length === 0) {
            console.log('無傳送點，返回純TSP結果');
            const normalTSP = this.solvePureTSP(normalPoints);
            return normalTSP;
        }
        
        // 一般情況：需要先找到最佳起始傳送點
        console.log('尋找最佳起始傳送點');
        
        // 先解決普通點的TSP以確定最佳路徑
        const normalTSP = this.solvePureTSP(normalPoints);
        console.log('普通點TSP解決，路徑長度:', normalTSP.path.length);
        
        // 找到距離第一個普通點最近的傳送點作為起始點
        const firstNormalPoint = normalTSP.path[0];
        console.log('第一個普通點:', firstNormalPoint);
        
        let bestStartTeleport = teleportPoints[0];
        let minStartDistance = this.calculateDistance(
            bestStartTeleport,
            { coords: firstNormalPoint.coords, zoneId: firstNormalPoint.zoneId }
        );
        
        console.log('初始起始傳送點:', bestStartTeleport);
        console.log('初始起始距離:', minStartDistance);
        
        for (const teleport of teleportPoints.slice(1)) {
            const distance = this.calculateDistance(
                teleport,
                { coords: firstNormalPoint.coords, zoneId: firstNormalPoint.zoneId }
            );
            console.log(`測試起始傳送點 ${teleport.name?.zh || teleport.id}, 距離: ${distance}`);
            if (distance < minStartDistance) {
                minStartDistance = distance;
                bestStartTeleport = teleport;
                console.log('找到更近的起始傳送點!');
            }
        }
        
        console.log('最終選擇的起始傳送點:', bestStartTeleport);
        
        // 如果只有一個普通點，路徑就是：起始傳送點 → 普通點 → 其他傳送點
        if (normalPoints.length === 1) {
            console.log('只有一個普通點的特殊情況');
            return { 
                path: [bestStartTeleport, ...normalPoints, ...teleportPoints.filter(t => t !== bestStartTeleport)], 
                distance: minStartDistance 
            };
        }
        
        // 找到距離最後一個普通點最近的傳送點作為結束點
        const lastNormalPoint = normalTSP.path[normalTSP.path.length - 1];
        console.log('最後一個普通點:', lastNormalPoint);
        
        let bestEndTeleport = teleportPoints[0];
        let minEndDistance = this.calculateDistance(
            { coords: lastNormalPoint.coords, zoneId: lastNormalPoint.zoneId },
            bestEndTeleport
        );
        
        // 避免選擇相同的起始和結束傳送點
        if (bestEndTeleport === bestStartTeleport && teleportPoints.length > 1) {
            bestEndTeleport = teleportPoints[1];
            minEndDistance = this.calculateDistance(
                { coords: lastNormalPoint.coords, zoneId: lastNormalPoint.zoneId },
                bestEndTeleport
            );
        }
        
        console.log('初始結束傳送點:', bestEndTeleport);
        console.log('初始結束距離:', minEndDistance);
        
        for (const teleport of teleportPoints) {
            if (teleport === bestStartTeleport) continue; // 跳過起始傳送點
            
            const distance = this.calculateDistance(
                { coords: lastNormalPoint.coords, zoneId: lastNormalPoint.zoneId },
                teleport
            );
            console.log(`測試結束傳送點 ${teleport.name?.zh || teleport.id}, 距離: ${distance}`);
            if (distance < minEndDistance) {
                minEndDistance = distance;
                bestEndTeleport = teleport;
                console.log('找到更近的結束傳送點!');
            }
        }
        
        console.log('最終選擇的結束傳送點:', bestEndTeleport);
        
        // 構建最終路徑：起始傳送點 → 普通點們 → 結束傳送點 → 其他傳送點
        const otherTeleports = teleportPoints.filter(t => t !== bestStartTeleport && t !== bestEndTeleport);
        const finalPath = [
            bestStartTeleport,
            ...normalTSP.path,
            bestEndTeleport,
            ...otherTeleports
        ];
        
        console.log('最終路徑長度:', finalPath.length);
        console.log('最終路徑包含傳送點數:', finalPath.filter(p => p.isTeleport).length);
        
        return {
            path: finalPath,
            distance: minStartDistance + normalTSP.distance + minEndDistance
        };
    }
    
    // 純TSP求解（貪婪最近鄰居法）
    solvePureTSP(points) {
        if (points.length <= 1) {
            return { path: points, distance: 0 };
        }
        
        let bestDistance = Infinity;
        let bestPath = [];
        
        // 嘗試每個起點
        for (let start = 0; start < points.length; start++) {
            const visited = new Array(points.length).fill(false);
            const path = [points[start]];
            visited[start] = true;
            let totalDistance = 0;
            let currentIdx = start;
            
            // 貪婪選擇最近的未訪問點
            for (let i = 1; i < points.length; i++) {
                let nearestIdx = -1;
                let nearestDistance = Infinity;
                
                for (let j = 0; j < points.length; j++) {
                    if (!visited[j]) {
                        const distance = this.calculateDistance(
                            { coords: points[currentIdx].coords, zoneId: points[currentIdx].zoneId },
                            { coords: points[j].coords, zoneId: points[j].zoneId }
                        );
                        if (distance < nearestDistance) {
                            nearestDistance = distance;
                            nearestIdx = j;
                        }
                    }
                }
                
                if (nearestIdx !== -1) {
                    visited[nearestIdx] = true;
                    path.push(points[nearestIdx]);
                    totalDistance += nearestDistance;
                    currentIdx = nearestIdx;
                }
            }
            
            if (totalDistance < bestDistance) {
                bestDistance = totalDistance;
                bestPath = path;
            }
        }
        
        return { path: bestPath, distance: bestDistance };
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