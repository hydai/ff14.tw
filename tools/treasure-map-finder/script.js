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
            totalCount: document.getElementById('totalCount'),
            myListToggle: document.getElementById('myListToggle'),
            myListPanel: document.getElementById('myListPanel'),
            listContent: document.getElementById('listContent'),
            clearAllBtn: document.getElementById('clearAllBtn'),
            loadMore: document.getElementById('loadMore')
        };

        // 語言切換時重新以目前語言重繪清單（移除按鈕的 aria-label 帶有地區與座標，需要重組）
        window.i18n.onLanguageChange(() => {
            this.renderMyList();

            // 「顯示 N 個結果」是帶參數的文字，切換語言時用目前的數量重新組一次
            this.updateResultCount();

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

        this.init();
    }
    
    async init() {
        try {
            await Promise.all([
                zoneManager.init(),
                this.loadData(),
                this.loadAetherytes(),
                this.loadAetheryteIcon()
            ]);
            this.setupEventListeners();
            this.updateListCount();
            this.updateFilteredMaps();
        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError(FF14Utils.getI18nText('treasure_map_load_failed', '載入寶圖資料失敗，請重新整理頁面再試。'));
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
        document.getElementById('exportListBtn').addEventListener('click', () => {
            this.modalManager.hide(); // 讓匯出對話框成為唯一作用中的對話框
            this.exportList();
        });
        document.getElementById('importListBtn').addEventListener('click', () => {
            this.modalManager.hide(); // 讓匯入對話框成為唯一作用中的對話框
            this.uiDialogManager.showImportDialog((text) => this.importFromText(text));
        });
        document.getElementById('importFileInput').addEventListener('change', (e) => this.importList(e));
        
        // 載入更多
        this.elements.loadMore.querySelector('button').addEventListener('click', () => this.loadMoreMaps());
        
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
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_reset_filters', '已重置所有篩選條件'), 'info');
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
                aetheryteData: this.aetheryteData,
                aetheryteIcon: this.aetheryteIcon,
                getAetherytesForZone: (zone) => this.getAetherytesForZone(zone)
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
            const btnKey = isInList ? 'treasure_map_added_to_list' : 'treasure_map_add_to_list';

            button.dataset.state = isInList ? 'added' : 'default';
            button.className = `btn ${isInList ? 'btn-success' : 'btn-primary'} btn-sm btn-add-to-list`;
            const textSpan = button.querySelector('.btn-text');
            textSpan.textContent = FF14Utils.getI18nText(btnKey, isInList ? '✓ 已加入' : '加入清單');
            // 清單狀態改變時同步 data-i18n，讓語言切換時全域重新翻譯用的是「目前」狀態對應的 key
            textSpan.dataset.i18n = btnKey;
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

    toggleListPanel() {
        const overlay = document.getElementById('panelOverlay');

        if (this.modalManager.activeModal !== this.elements.myListPanel) {
            // 開啟面板
            overlay.classList.add('active');
            this.renderMyList();
            document.body.style.overflow = 'hidden';
            this.modalManager.show(this.elements.myListPanel, {
                // #panelOverlay 是獨立於面板本身的手足元素（不是 ModalManager 認得的遮罩層），
                // 點擊它由既有的 click 監聽器呼叫 toggleListPanel() 處理，故關閉內建的點擊判斷
                closeOnOverlayClick: false,
                onClose: () => {
                    // ESC／關閉按鈕／點擊遮罩都會走到這裡
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        } else {
            // 關閉面板
            this.modalManager.hide();
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
    
    loadMoreMaps() {
        this.displayMaps();
    }
    
    updateResultCount() {
        this.elements.resultCount.textContent =
            FF14Utils.getI18nText('treasure_map_results', '顯示 {count} / {total} 個結果', {
                count: this.currentDisplayCount,
                total: this.filteredMaps.length
            });
    }

    updateListCount() {
        const count = this.listManager.getLength();
        this.elements.listCount.textContent = `(${count})`;
        this.elements.totalCount.textContent = count;
        
        // 更新生成路線按鈕狀態
        const generateRouteBtn = document.getElementById('generateRouteBtn');
        if (generateRouteBtn) {
            generateRouteBtn.disabled = count < 2;
        }
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

        // 等待 routeCalculator 載入完成
        if (!routeCalculator || !routeCalculator.aetherytes) {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_loading_aetherytes', '正在載入傳送點資料，請稍後再試'), 'info');
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
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_route_generation_failed', '無法生成路線'), 'error');
            return;
        }
        
        // 儲存路線資料供複製使用
        this.currentRoute = result.route;

        // 路線面板由 uiDialogManager 另一個獨立的 ModalManager 管理；
        // 生成路線的按鈕就在「我的清單」面板內，若清單面板繼續開著，
        // 兩個 ModalManager 實例會同時掛上 document 的 ESC／Tab 監聽。
        // 按 ESC 會把兩個面板一起關閉，且清單面板的 ModalManager 會把焦點
        // 還給這顆已經隨面板一起被移出畫面（transform: translateX）的
        // 「生成路線」按鈕，導致焦點跑到看不到的地方，所以生成路線前
        // 先收起清單面板，讓路線面板成為唯一作用中的對話框。
        this.modalManager.hide();

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
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_sync_to_room_failed', '同步失敗，請稍後再試'), 'error');
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
