// UI 對話框管理模組
class UIDialogManager {
    static CONSTANTS = {
        Z_INDEX: {
            MODAL: 1000,
            DIALOG: 10000
        },
        CSS_CLASSES: {
            ACTIVE: 'active'
        },
        ANIMATIONS: {
            FADE_IN: 300,
            FADE_OUT: 200
        }
    };

    // 動態對話框標題 id 的流水號（單調遞增，避免同一毫秒內產生重複 id）
    static dialogTitleSeq = 0;

    // 詳細地圖上疊的寶圖縮圖：離邊緣、寬、高佔地圖邊長的比例（縮圖 207×174）。style.css 的 .map-detail-thumb 用同樣的數字；
    // 依序試這四個角（見 thumbCorner）
    static THUMB_BOX = { inset: 0.02, width: 0.34, height: 0.34 * 174 / 207 };
    static THUMB_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

    constructor() {
        this.modalManager = new ModalManager();

        // 格式面板疊在路線面板上，兩者必須同時開著，因此需要各自的 ModalManager 實例
        //（單一實例一次只管理一個視窗）。堆疊會保證 Escape／焦點陷阱只作用在最上層。
        this.formatModalManager = new ModalManager();

        // Map to store cleanup functions for panels
        this.cleanupHandlers = new Map();

        // 目前開啟中的對話框種類與其原始呼叫資料（地圖詳細視窗／路線結果面板），
        // 語言切換時用來重新以目前語言渲染其動態文字（見 refreshActiveDialog）
        this.activeDialog = null;

        // 關閉鈕的固定監聽器參考（見 showRouteResult）；詳細檢視的一組監聽器見 _getMapDetailHandlers()
        this._boundHideRouteResult = null;
        this._mapDetailHandlers = null;

        // 詳細地圖的繪製：寶圖標記圖示第一次畫的時候才建立、之後共用；每次重畫換一個序號，
        // 慢一步才載入完成的舊繪製看到序號不同就放棄（見 _drawMapDetailCanvas）
        this._markIcon = null;
        this._mapDetailDrawSeq = 0;

        // 初始化 DOM 元素參考
        this.initializeElements();

        // 語言切換時，重繪目前開啟中的對話框（若有）
        if (window.i18n) {
            window.i18n.onLanguageChange(() => this.refreshActiveDialog());
        }
    }

    /**
     * 初始化 DOM 元素參考
     */
    initializeElements() {
        // 地圖詳細檢視元素：標頭、地圖（地區地圖、canvas、寶圖縮圖）、資訊、動作列
        this.mapDetailElements = {
            modal: document.getElementById('mapDetailModal'),
            title: document.getElementById('mapDetailTitle'),
            closeBtn: document.getElementById('mapDetailClose'),
            img: document.getElementById('mapDetailImage'),
            canvas: document.getElementById('mapDetailCanvas'),
            thumb: document.getElementById('mapDetailThumb'),
            coords: document.getElementById('mapDetailCoords'),
            nearest: document.getElementById('mapDetailNearest'),
            others: document.getElementById('mapDetailOthers'),
            names: document.getElementById('mapDetailNames'),
            preview: document.getElementById('mapDetailPreview'),
            prevBtn: document.getElementById('mapDetailPrev'),
            position: document.getElementById('mapDetailPosition'),
            nextBtn: document.getElementById('mapDetailNext'),
            copyBtn: document.getElementById('mapDetailCopy'),
            addBtn: document.getElementById('mapDetailAdd')
        };

        // 路線面板元素
        this.routePanelElements = {
            panel: document.getElementById('routePanel'),
            summary: document.getElementById('routeSummary'),
            steps: document.getElementById('routeSteps'),
            closeBtn: document.getElementById('closeRoutePanelBtn')
        };

        // 格式設定面板元素
        this.formatPanelElements = {
            panel: document.getElementById('formatPanel'),
            teleportFormat: document.getElementById('teleportFormat'),
            mapFormat: document.getElementById('mapFormat'),
            preview: document.getElementById('formatPreview'),
            closeBtn: document.getElementById('closeFormatPanelBtn'),
            saveBtn: document.getElementById('saveFormatBtn'),
            resetBtn: document.getElementById('resetFormatBtn')
        };
    }

    /**
     * 結果順序裡的上一張與下一張（id），以及這張是第幾張（從 1 開始）、共幾張；到頭的那一邊是 null
     * @param {string[]} ids - 目前結果的寶圖 id（畫面上的順序）
     * @param {string} id - 目前這張
     * @returns {{ prev: string|null, next: string|null, index: number, total: number }}
     */
    static getNeighbors(ids, id) {
        const at = ids.indexOf(id);
        return {
            prev: at > 0 ? ids[at - 1] : null,
            next: at !== -1 && at < ids.length - 1 ? ids[at + 1] : null,
            index: at + 1,
            total: ids.length
        };
    }

    /**
     * 寶圖縮圖疊在地圖的哪個角：預設左上角；會蓋住寶圖標記或最近傳送點（圖示與名稱）時，依序改試右上、左下、右下，
     * 用第一個兩者都不蓋住的角；都會蓋住時至少讓寶圖標記露出來（四個框互不重疊，標記不會每個角都被蓋到）。
     * 框的大小用畫在 2048px 地圖上的尺寸換算（drawMapMarkers：標記 81×87 置中；傳送點圖示 72px、名稱在圖示下方，
     * 名稱寬度用 340px 估）
     * @param {{x: number, y: number}} coords - 寶圖座標
     * @param {{x: number, y: number}|null} nearestCoords - 最近傳送點的座標；沒有就只看寶圖標記
     * @returns {'top-left'|'top-right'|'bottom-left'|'bottom-right'}
     */
    static thumbCorner(coords, nearestCoords) {
        const { inset, width, height } = UIDialogManager.THUMB_BOX;
        const scale = 1 / 2048;
        // 以座標為中心、左右各 halfWidth、往上 up、往下 down 的框，和這個角的縮圖框有沒有重疊
        const covers = (corner, point, halfWidth, up, down) => {
            if (!point) return false;
            const { x, y } = CoordinateUtils.gameToImageCoords(point.x, point.y, 1, 1);
            const left = corner.endsWith('left') ? inset : 1 - inset - width;
            const top = corner.startsWith('top') ? inset : 1 - inset - height;
            return x - halfWidth < left + width && x + halfWidth > left && y - up < top + height && y + down > top;
        };
        const coversMarker = corner => covers(corner, coords, 40.5 * scale, 43.5 * scale, 43.5 * scale);
        const coversNearest = corner => covers(corner, nearestCoords, 170 * scale, 36 * scale, 86 * scale);
        const corners = UIDialogManager.THUMB_CORNERS;
        return corners.find(corner => !coversMarker(corner) && !coversNearest(corner))
            || corners.find(corner => !coversMarker(corner))
            || corners[0];
    }

    /**
     * 顯示地圖詳細檢視：地區地圖（寶圖位置、這個地區的傳送點，最近的標亮）、資訊、上一張／下一張、複製、加入清單
     * @param {Object} map - 地圖資料
     * @param {Object} options
     * @param {Object} options.zoneManager - 地區名稱、地圖檔名與傳送點（和卡片、路線同一份資料）
     * @param {HTMLImageElement|null} options.aetheryteIcon - 傳送點圖示；沒有就不畫傳送點。可以是 getter（每次畫的時候才讀）
     * @param {string[]} options.resultIds - 目前結果的寶圖 id（畫面上的順序），上一張／下一張在這裡面切換
     * @param {Function} options.getMapById - id → 寶圖資料
     * @param {Function} options.isInList - 寶圖 → 是否已在清單裡
     * @param {Function} options.onToggle - 寶圖 → 加入或移除（TreasureMapFinder#toggleMapInList，背後的卡片與清單入口由它同步）
     * @param {Function} options.onCopy - 寶圖 → 複製隊伍頻道句子
     * @param {Function} options.getPartyMessage - 寶圖 → 將被複製的句子（顯示在「複製內容」）
     * @param {Function} options.onClosed - 關閉後呼叫，參數是最後顯示的那張的 id（焦點要回到它的卡片）
     */
    showMapDetail(map, options = {}) {
        const elements = this.mapDetailElements;
        if (!elements.modal) return;

        // 切換範圍是開啟時的結果順序；這張不在裡面時（照理不會發生）就只有它自己
        const resultIds = Array.isArray(options.resultIds) && options.resultIds.includes(map.id)
            ? [...options.resultIds]
            : [map.id];
        // 快取這次開啟的資料：切換上一張／下一張只換 map；語言切換時（見 refreshActiveDialog）用目前語言整個重畫。
        // 選項連 getter 一起複製（展開運算子只會複製當下的值），例如每次畫的時候才讀的傳送點圖示；resultIds 換成上面整理過的
        const cachedOptions = Object.defineProperties({}, Object.getOwnPropertyDescriptors(options));
        cachedOptions.resultIds = resultIds;
        this.activeDialog = { kind: 'mapDetail', map, options: cachedOptions };
        this._renderMapDetail();

        // 與 showRouteResult 相同：固定用同一組函式參考掛載，重複開啟時監聽器不會累積；關閉時拆掉。
        // ← → 掛在對話框上：焦點在對話框裡哪裡都收得到
        const handlers = this._getMapDetailHandlers();
        const listeners = [
            [elements.closeBtn, 'click', handlers.close],
            [elements.prevBtn, 'click', handlers.prev],
            [elements.nextBtn, 'click', handlers.next],
            [elements.copyBtn, 'click', handlers.copy],
            [elements.addBtn, 'click', handlers.toggle],
            [elements.modal, 'keydown', handlers.keydown]
        ];
        listeners.forEach(([element, type, handler]) => element.addEventListener(type, handler));

        // modal 本身就是遮罩層，ModalManager 自動處理點擊遮罩關閉。上一張／下一張只在已開啟的對話框裡重畫，
        // 不再呼叫 show()（對已開著的元素它會直接 return）
        this.modalManager.show(elements.modal, {
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onClose: () => {
                listeners.forEach(([element, type, handler]) => element.removeEventListener(type, handler));
                if (this.activeDialog?.kind !== 'mapDetail') return;
                // ModalManager 已經先把焦點還給開啟前的元素；再交給呼叫端放到最後顯示的那張的卡片上
                const { map: lastShown, options: { onClosed } } = this.activeDialog;
                this.activeDialog = null;
                onClosed?.(lastShown.id);
            }
        });
    }

    // 詳細檢視的監聽器：第一次用到時建立，之後都是同一組函式參考（掛上、拆掉才對得上）
    _getMapDetailHandlers() {
        if (!this._mapDetailHandlers) {
            this._mapDetailHandlers = {
                close: () => this.hideMapDetail(),
                prev: () => this._pageMapDetail(-1),
                next: () => this._pageMapDetail(1),
                copy: () => {
                    if (this.activeDialog?.kind !== 'mapDetail') return;
                    const { map, options } = this.activeDialog;
                    options.onCopy?.(map);
                },
                toggle: () => this._toggleMapDetail(),
                keydown: event => this._handleMapDetailKeydown(event)
            };
        }
        return this._mapDetailHandlers;
    }

    // 在開啟時的結果順序裡切到上一張（-1）或下一張（1），在已開啟的對話框裡重畫；到頭時什麼都不做。回傳有沒有切換
    _pageMapDetail(step) {
        if (this.activeDialog?.kind !== 'mapDetail') return false;
        const { map, options } = this.activeDialog;
        const { prev, next } = UIDialogManager.getNeighbors(options.resultIds, map.id);
        const targetId = step < 0 ? prev : next;
        const target = targetId ? options.getMapById?.(targetId) : null;
        if (!target) return false;

        // 重畫之前先記下焦點：剛按的「上一張／下一張」到頭會停用，Chrome 在停用的當下就把焦點退回 body，
        // 重畫之後再看 document.activeElement 已經來不及
        const { prevBtn, nextBtn } = this.mapDetailElements;
        const focused = document.activeElement;
        this.activeDialog = { kind: 'mapDetail', map: target, options };
        this._renderMapDetail();

        // 焦點不能留在停用的按鈕上（退回 body 就掉出對話框，← → 也收不到），改放到另一顆
        //（切換過表示至少有兩張，另一顆一定按得下去）
        if ((focused === prevBtn || focused === nextBtn) && focused.disabled) {
            (focused === prevBtn ? nextBtn : prevBtn).focus();
        }
        return true;
    }

    // ← → 切換上一張／下一張；加了修飾鍵的不處理（例如 Alt+← 是瀏覽器的上一頁）
    _handleMapDetailKeydown(event) {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
        if (step && this._pageMapDetail(step)) {
            event.preventDefault();
        }
    }

    // 加入或移除交給呼叫端（toggleMapInList 同步背後的卡片與清單入口），再依清單的狀態換按鈕文字
    _toggleMapDetail() {
        if (this.activeDialog?.kind !== 'mapDetail') return;
        const { map, options } = this.activeDialog;
        options.onToggle?.(map);
        this._renderMapDetailAddButton();
    }

    /**
     * 清單在別處改變時（例如隊伍同步）更新開著的詳細檢視的加入鈕；沒開著就什麼都不做。
     * 按鈕停在舊狀態的話，按「加入」反而會把已在清單裡的寶圖移除（toggleMapInList 是切換）
     */
    refreshMapDetailAddButton() {
        if (this.activeDialog?.kind === 'mapDetail') {
            this._renderMapDetailAddButton();
        }
    }

    /**
     * 用目前語言畫出 this.activeDialog 這張寶圖的整個詳細檢視：標題、地圖與縮圖、資訊、複製內容、位置、
     * 切換鈕的停用狀態、加入鈕與 canvas。開啟、上一張／下一張、語言切換（refreshActiveDialog）都走這裡
     */
    _renderMapDetail() {
        const elements = this.mapDetailElements;
        const { map, options } = this.activeDialog;
        const { zoneManager, getPartyMessage } = options;
        // 依目前介面語言挑名稱，沒有這個語言時退回中文（與卡片、清單一致）
        const currentLang = window.i18n.getCurrentLanguage();
        const pick = names => names[currentLang] || names.zh || names.en;

        const zoneNames = zoneManager?.getZoneNames(map.zoneId) || { zh: map.zone, en: map.zone, ja: map.zone };
        elements.title.textContent = `${map.level.toUpperCase()}・${pick(zoneNames)} #${map.index}`;

        // 地區地圖與寶圖縮圖：網址沒變就不重設（重設會重新載入、再觸發一次 load）
        const mapSrc = `images/maps/map-${zoneManager?.getFilePrefix(map.zoneId) || map.zone}.webp`;
        if (elements.img.getAttribute('src') !== mapSrc) {
            elements.img.src = mapSrc;
        }
        if (elements.thumb.getAttribute('src') !== map.thumbnail) {
            elements.thumb.src = map.thumbnail;
        }

        elements.coords.textContent = CoordinateUtils.formatXY(map.coords, { withZ: true });

        // 最近的傳送點與其他傳送點（照 zones.json 的順序），由 zoneManager 算，和卡片、路線同一份資料；沒有的那一列整列藏起來
        const aetherytes = zoneManager?.getAetherytes(map.zoneId) || [];
        const nearest = zoneManager?.findNearestAetheryte(map.zoneId, map.coords)?.aetheryte || null;
        const others = aetherytes.filter(aetheryte => aetheryte.id !== nearest?.id).map(aetheryte => pick(aetheryte.name));
        elements.nearest.textContent = nearest ? pick(nearest.name) : '';
        elements.others.textContent = others.join(FF14Utils.getI18nText('treasure_map_list_separator', '、'));
        elements.nearest.closest('.map-detail-fact').classList.toggle('hidden', !nearest);
        elements.others.closest('.map-detail-fact').classList.toggle('hidden', others.length === 0);

        // 寶圖縮圖預設在左上角；會蓋住寶圖標記或最近傳送點時換一個角（每一張都重新判斷）
        elements.thumb.dataset.corner = UIDialogManager.thumbCorner(map.coords, nearest?.coords || null);

        // 三種語言的地名，各自標上語言：螢幕閱讀器才會用對的發音，日文的漢字也會用日文字型
        SecurityUtils.clearElement(elements.names);
        [['zh', 'zh-Hant'], ['en', 'en'], ['ja', 'ja']].forEach(([key, lang], index) => {
            if (index > 0) {
                elements.names.appendChild(document.createTextNode('／'));
            }
            const name = document.createElement('span');
            name.setAttribute('lang', lang);
            name.textContent = zoneNames[key] || map.zone;
            elements.names.appendChild(name);
        });

        elements.preview.textContent = getPartyMessage ? getPartyMessage(map) : '';

        const { prev, next, index, total } = UIDialogManager.getNeighbors(options.resultIds, map.id);
        elements.position.textContent = FF14Utils.getI18nText('treasure_map_detail_position', '{index} / {total}', { index, total });
        elements.prevBtn.disabled = !prev;
        elements.nextBtn.disabled = !next;

        this._renderMapDetailAddButton();
        this._drawMapDetailCanvas(map, options);
    }

    // 加入鈕的文字跟著清單：已加入「✓ 已加入」（再按一次移除），否則「＋ 加入清單」
    _renderMapDetailAddButton() {
        const { map, options } = this.activeDialog;
        this.mapDetailElements.addBtn.textContent = options.isInList?.(map)
            ? FF14Utils.getI18nText('treasure_map_added_to_list', '✓ 已加入')
            : FF14Utils.getI18nText('treasure_map_add_to_list', '＋ 加入清單');
    }

    /**
     * 繪製地圖標記：寶圖位置，以及這張寶圖所在地區的傳送點（圖示與名稱）。canvas 和地圖圖片一樣大，標記與文字都放大 3 倍。
     * 最近的傳送點標亮：名稱畫在主色的膠囊上，底色與文字色讀 tokens.css 的 --color-primary／--color-on-primary
     * （深色模式跟著換）；其他傳送點照舊白字黑邊
     */
    drawMapMarkers(ctx, canvas, map, markIcon, options) {
        const { zoneManager, aetheryteIcon } = options;
        
        // 轉換寶圖座標並繪製標記
        const treasureCoords = CoordinateUtils.gameToImageCoords(
            map.coords.x,
            map.coords.y,
            canvas.width,
            canvas.height
        );
        
        // 繪製寶圖標記（原始大小的3倍）
        const markWidth = 27 * 3;  // 原始寬度 27px
        const markHeight = 29 * 3; // 原始高度 29px
        ctx.drawImage(
            markIcon,
            treasureCoords.x - markWidth / 2,
            treasureCoords.y - markHeight / 2,
            markWidth,
            markHeight
        );
        
        // 如果有地區資料和傳送點圖標，繪製這張寶圖所在地區的傳送點
        if (zoneManager && aetheryteIcon) {
            const aetherytes = zoneManager.getAetherytes(map.zoneId);
            const nearestId = zoneManager.findNearestAetheryte(map.zoneId, map.coords)?.aetheryte.id;
            const rootStyle = window.getComputedStyle(document.documentElement);
            const highlight = {
                background: rootStyle.getPropertyValue('--color-primary').trim(),
                text: rootStyle.getPropertyValue('--color-on-primary').trim()
            };

            aetherytes.forEach(aetheryte => {
                // 轉換座標
                const imageCoords = CoordinateUtils.gameToImageCoords(
                    aetheryte.coords.x,
                    aetheryte.coords.y,
                    canvas.width,
                    canvas.height
                );
                
                // 繪製傳送點圖標（放大3倍）
                const iconSize = 24 * 3;  // 原始大小 24px 的 3 倍
                ctx.drawImage(
                    aetheryteIcon,
                    imageCoords.x - iconSize / 2,
                    imageCoords.y - iconSize / 2,
                    iconSize,
                    iconSize
                );
                
                // 繪製傳送點名稱（放大3倍）
                ctx.font = 'bold 42px Arial, "Microsoft JhengHei", sans-serif';  // 14px * 3 = 42px

                const currentLang = window.i18n.getCurrentLanguage();
                const text = aetheryte.name[currentLang] || aetheryte.name.zh || aetheryte.name.en;
                const textWidth = ctx.measureText(text).width;
                const textX = imageCoords.x - textWidth / 2;
                const textY = imageCoords.y + iconSize / 2 + 30;  // 10px * 3 = 30px

                if (aetheryte.id === nearestId) {
                    // 最近的傳送點：主色膠囊墊在名稱底下（左右各多 18px；上下各多 12px，42px 的字在基線上約 34px、基線下約 8px）
                    ctx.fillStyle = highlight.background;
                    UIDialogManager.fillPill(ctx, textX - 18, textY - 34 - 12, textWidth + 36, 42 + 24);
                    ctx.fillStyle = highlight.text;
                    ctx.fillText(text, textX, textY);
                } else {
                    ctx.fillStyle = 'white';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 6;  // 3px * 2 = 6px (加粗描邊)
                    ctx.strokeText(text, textX, textY);
                    ctx.fillText(text, textX, textY);
                }
            });
        }
    }

    // 兩端是半圓的膠囊形，用目前的 fillStyle 填滿；用 arc 畫，不靠比較新的 roundRect()
    static fillPill(ctx, x, y, width, height) {
        const radius = height / 2;
        ctx.beginPath();
        ctx.arc(x + width - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2);
        ctx.arc(x + radius, y + radius, radius, Math.PI / 2, Math.PI * 1.5);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * 把寶圖標記與傳送點畫到 canvas 上（drawMapMarkers）：地區地圖與寶圖標記圖示都載入完才畫，canvas 和地圖圖片一樣大。
     * 每次重畫先清掉舊的標記、換一個序號：快速切換時，慢一步才載入完成的舊繪製看到序號不同就放棄，不會畫到新的那張上。
     * canvas 不能畫（沒有 getContext，例如測試用的假 DOM）就整個跳過
     */
    _drawMapDetailCanvas(map, options) {
        const { img, canvas } = this.mapDetailElements;
        const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        if (!ctx) return;

        const seq = ++this._mapDetailDrawSeq;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this._markIcon) {
            this._markIcon = new Image();
            this._markIcon.src = 'images/ui/mark.png';
        }
        const markIcon = this._markIcon;
        const loaded = image => image.complete && image.naturalWidth > 0;

        const draw = () => {
            if (seq !== this._mapDetailDrawSeq || !loaded(img) || !loaded(markIcon)) return;
            // 設定大小也會清空畫布
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            this.drawMapMarkers(ctx, canvas, map, markIcon, options);
        };

        img.onload = draw;
        if (!loaded(markIcon)) {
            markIcon.addEventListener('load', draw, { once: true });
        }
        draw();
    }

    /**
     * 隱藏地圖詳細視窗
     * 注意：實際的清理邏輯（包括移除事件監聽器和執行回調）是在
     * showMapDetail 中註冊的 ModalManager onClose 處理器中執行。
     * 這裡僅負責觸發關閉流程。
     */
    hideMapDetail() {
        this.modalManager.hide();
    }

    /**
     * 顯示匯入對話框
     * @param {Function} onImport - 匯入回調函數
     * @param {Object} options - 選項
     */
    showImportDialog(onImport, options = {}) {
        const defaultTitle = FF14Utils.getI18nText('treasure_map_import_title', '匯入清單');
        const defaultInstruction = FF14Utils.getI18nText('treasure_map_import_instruction', '請貼上清單內容：');
        const defaultPlaceholder = FF14Utils.getI18nText('treasure_map_import_placeholder', '在此貼上清單資料...');
        const { title = defaultTitle, instruction = defaultInstruction, placeholder = defaultPlaceholder } = options;

        // 建立對話框內容
        // 只有在呼叫端沒有自訂文字時才掛 data-i18n key
        const contentElement = this._createImportDialogContent(
            instruction,
            placeholder,
            instruction === defaultInstruction ? 'treasure_map_import_instruction' : undefined,
            placeholder === defaultPlaceholder ? 'treasure_map_import_placeholder' : undefined
        );

        // 建立帶有 overlay 的對話框
        const { overlay, dialog } = this.createDialogWithOverlay({
            title,
            titleKey: title === defaultTitle ? 'treasure_map_import_title' : undefined,
            content: contentElement
        });

        // 設置事件
        const textarea = dialog.querySelector('#importTextarea');
        const confirmBtn = dialog.querySelector('#importConfirmBtn');
        const cancelBtn = dialog.querySelector('#importCancelBtn');

        const closeDialog = () => this.modalManager.hide();

        confirmBtn.onclick = () => {
            const text = textarea.value;
            closeDialog();
            if (onImport) {
                onImport(text);
            }
        };

        cancelBtn.onclick = closeDialog;

        document.body.appendChild(overlay);

        // 使用 ModalManager 顯示
        this.modalManager.show(overlay, {
            // useClass default is 'active'
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onClose: () => overlay.remove()
        });

        // 自動聚焦 (需在顯示後執行)
        setTimeout(() => textarea.focus(), 0);
    }

    /**
     * 建立匯入對話框內容
     * @private
     */
    _createImportDialogContent(instruction, placeholder, instructionKey, placeholderKey) {
        const container = document.createElement('div');

        const instructionP = document.createElement('p');
        instructionP.className = 'ui-dialog-instruction';
        instructionP.textContent = instruction;
        if (instructionKey) {
            instructionP.dataset.i18n = instructionKey;
        }
        container.appendChild(instructionP);

        const textarea = document.createElement('textarea');
        textarea.id = 'importTextarea';
        textarea.className = 'ui-dialog-textarea form-control';
        textarea.placeholder = placeholder;
        if (placeholderKey) {
            textarea.dataset.i18n = placeholderKey;
            textarea.dataset.i18nAttr = 'placeholder';
        }
        container.appendChild(textarea);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'ui-dialog-actions';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.id = 'importConfirmBtn';
        confirmBtn.textContent = FF14Utils.getI18nText('treasure_map_confirm', '匯入');
        confirmBtn.dataset.i18n = 'treasure_map_confirm';
        buttonContainer.appendChild(confirmBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.id = 'importCancelBtn';
        cancelBtn.textContent = FF14Utils.getI18nText('treasure_map_cancel', '取消');
        cancelBtn.dataset.i18n = 'treasure_map_cancel';
        buttonContainer.appendChild(cancelBtn);

        container.appendChild(buttonContainer);

        return container;
    }

    /**
     * 顯示路線結果面板
     * @param {Object} result - 路線計算結果
     * @param {Object} options - 選項
     */
    showRouteResult(result, options = {}) {
        const elements = this.routePanelElements;
        if (!elements.panel) return;

        // 快取這次開啟的資料，語言切換時（見 refreshActiveDialog）重新以目前語言渲染
        this.activeDialog = { kind: 'routeResult', result, options };
        this._renderRouteContent(result, options);

        // 每次開啟都會再掛一次關閉鈕的監聽器；ModalManager.show() 對「已經開著的同一個元素」
        // 會直接 return、不更新 onClose，重複生成路線時舊的監聽器就會累積。
        // 固定用同一個函式參考掛載——addEventListener 對同一個參考不會重複註冊。
        if (!this._boundHideRouteResult) {
            this._boundHideRouteResult = () => this.hideRouteResult();
        }
        elements.closeBtn.addEventListener('click', this._boundHideRouteResult);

        // 顯示面板
        this.modalManager.show(elements.panel, {
            useClass: UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE,
            closeOnOverlayClick: false,
            onClose: () => {
                // 格式面板若還開著，ModalManager.hide() 的連鎖關閉已經在進入這裡之前
                // 由上而下把它收掉並把焦點還給「自訂格式」按鈕，這裡不需要（也不可以）再插手。
                elements.closeBtn.removeEventListener('click', this._boundHideRouteResult);
                if (this.activeDialog?.kind === 'routeResult') {
                    this.activeDialog = null;
                }
            }
        });
    }

    /**
     * 渲染路線結果面板的摘要與步驟列表；showRouteResult() 與語言切換後的
     * refreshActiveDialog() 共用同一份邏輯，確保兩者輸出一致
     */
    _renderRouteContent(result, options) {
        const elements = this.routePanelElements;
        const { onStepCopy, getZoneName } = options;

        // 生成摘要
        const summaryElement = this.generateRouteSummary(result, getZoneName);
        SecurityUtils.clearElement(elements.summary);
        elements.summary.appendChild(summaryElement);

        // 生成步驟列表
        SecurityUtils.clearElement(elements.steps);
        result.route.forEach((step, index) => {
            const stepElement = this.createRouteStep(step, index, result.route.length, {
                onStepCopy,
                getZoneName
            });
            elements.steps.appendChild(stepElement);
        });
    }

    /**
     * 語言切換時，依目前開啟的對話框種類重新以目前語言渲染其動態文字
     * （地圖詳細檢視目前這張的全部內容，包括地圖上的傳送點名稱；路線結果面板的摘要與每個步驟）。
     * 固定的標籤（data-i18n）由 I18nManager 在通知之前就翻譯好了
     */
    refreshActiveDialog() {
        if (!this.activeDialog) return;

        if (this.activeDialog.kind === 'mapDetail') {
            this._renderMapDetail();
        } else if (this.activeDialog.kind === 'routeResult') {
            this._renderRouteContent(this.activeDialog.result, this.activeDialog.options);
        }
    }

    /**
     * 生成路線摘要
     */
    generateRouteSummary(result, getZoneName) {
        const regionsText = result.summary.regionsVisited
            .map(zone => getZoneName ? getZoneName(zone) : zone)
            .join(' → ');

        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'route-summary-content';

        const titleP = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = FF14Utils.getI18nText('treasure_map_route_summary', '路線摘要：');
        strong.dataset.i18n = 'treasure_map_route_summary';
        titleP.appendChild(strong);
        summaryDiv.appendChild(titleP);

        const regionsP = document.createElement('p');
        regionsP.textContent = FF14Utils.getI18nText('treasure_map_route_regions', `地區順序：${regionsText}`, { regions: regionsText });
        summaryDiv.appendChild(regionsP);

        const teleportsP = document.createElement('p');
        teleportsP.textContent = FF14Utils.getI18nText('treasure_map_route_teleports', `總傳送次數：${result.summary.totalTeleports || 0}`, { count: result.summary.totalTeleports || 0 });
        summaryDiv.appendChild(teleportsP);

        const mapsP = document.createElement('p');
        mapsP.textContent = FF14Utils.getI18nText('treasure_map_route_total_maps', `總寶圖數量：${result.summary.totalMaps || 0}`, { count: result.summary.totalMaps || 0 });
        summaryDiv.appendChild(mapsP);

        return summaryDiv;
    }

    /**
     * 建立路線步驟元素
     */
    createRouteStep(step, index, total, options) {
        const { onStepCopy, getZoneName } = options;
        
        const stepDiv = document.createElement('div');
        stepDiv.className = `route-step ${step.type}`;
        
        const stepNumber = document.createElement('span');
        stepNumber.className = 'step-number';
        stepNumber.textContent = `${index + 1}.`;
        
        const stepContent = document.createElement('span');
        stepContent.className = 'step-content';
        
        if (step.type === 'teleport') {
            const aetheryteNames = step.to;

            const iconSpan = document.createElement('span');
            iconSpan.className = 'step-icon';
            iconSpan.textContent = '🔮';

            const textSpan = document.createElement('span');
            textSpan.className = 'step-text';
            // step.to／aetheryteNames 實際型別是 { zh, en, ja }，依目前介面語言挑選名稱，
            // 找不到對應語言時退回中文（與 script.js 的 getZoneName()／renderMyList() 一致）
            const currentLang = window.i18n.getCurrentLanguage();
            const aetheryteName = (aetheryteNames && typeof aetheryteNames === 'object')
                ? (aetheryteNames[currentLang] || aetheryteNames.zh)
                : aetheryteNames;
            textSpan.textContent = FF14Utils.getI18nText('treasure_map_route_teleport_to', `傳送至 ${aetheryteName}`, { name: aetheryteName });

            const coordsSpan = document.createElement('span');
            coordsSpan.className = 'step-coords';
            coordsSpan.textContent = CoordinateUtils.formatCoordinatesShort(step.coords);

            stepContent.appendChild(iconSpan);
            stepContent.appendChild(textSpan);
            stepContent.appendChild(coordsSpan);
        } else {
            const zoneName = getZoneName ? getZoneName(step.zoneId || step.zone) : step.zone;
            
            const iconSpan = document.createElement('span');
            iconSpan.className = 'step-icon';
            iconSpan.textContent = '📍';
            
            const textSpan = document.createElement('span');
            textSpan.className = 'step-text';
            textSpan.textContent = `${step.mapLevel || ''} - ${zoneName}`;
            
            const coordsSpan = document.createElement('span');
            coordsSpan.className = 'step-coords';
            coordsSpan.textContent = CoordinateUtils.formatCoordinatesShort(step.coords);
            
            stepContent.appendChild(iconSpan);
            stepContent.appendChild(textSpan);
            stepContent.appendChild(coordsSpan);
        }
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-sm btn-copy';
        copyBtn.textContent = '📋';
        copyBtn.title = FF14Utils.getI18nText('treasure_map_route_step_copy_title', '複製');
        copyBtn.onclick = () => {
            if (onStepCopy) {
                onStepCopy(step, index, total);
            }
        };
        
        stepDiv.appendChild(stepNumber);
        stepDiv.appendChild(stepContent);
        stepDiv.appendChild(copyBtn);
        
        return stepDiv;
    }

    /**
     * 隱藏路線結果面板
     */
    hideRouteResult() {
        this.modalManager.hide();
    }

    /**
     * 顯示格式設定面板
     * @param {Object} currentSettings - 當前設定
     * @param {Function} onPreviewUpdate - 預覽更新回調
     */
    showFormatPanel(currentSettings, onPreviewUpdate) {
        const elements = this.formatPanelElements;
        if (!elements.panel) return;

        const panelId = 'formatPanel';

        // 先清理舊的事件監聽器（如果存在）
        if (this.cleanupHandlers.has(panelId)) {
            const cleanup = this.cleanupHandlers.get(panelId);
            if (typeof cleanup === 'function') {
                cleanup();
            }
            this.cleanupHandlers.delete(panelId);
        }

        // 設置當前值
        if (currentSettings) {
            elements.teleportFormat.value = currentSettings.teleport || '';
            elements.mapFormat.value = currentSettings.map || '';
        }

        // 設置預覽更新事件
        const formatPreviewHandler = () => {
            if (onPreviewUpdate) {
                onPreviewUpdate(
                    elements.teleportFormat.value,
                    elements.mapFormat.value
                );
            }
        };

        elements.teleportFormat.addEventListener('input', formatPreviewHandler);
        elements.mapFormat.addEventListener('input', formatPreviewHandler);

        // 儲存清理函數
        const cleanup = () => {
            elements.teleportFormat.removeEventListener('input', formatPreviewHandler);
            elements.mapFormat.removeEventListener('input', formatPreviewHandler);
        };
        this.cleanupHandlers.set(panelId, cleanup);

        // 顯示面板：格式面板疊在路線面板正上方（兩者同為 position:fixed 置中、
        // 格式面板的 z-index 更高；高度依內容而定，路線面板較長時上下仍可能露出一截），
        // 因此把它當成一個正常的堆疊模態視窗——
        // 有自己的焦點陷阱，Escape 只關自己（由 ModalManager 的共用堆疊保證），
        // 關閉時焦點自動還給開啟它的「自訂格式」按鈕。
        // 需要獨立的 formatModalManager，因為 this.modalManager 正拿著路線面板。
        this.formatModalManager.show(elements.panel, {
            useClass: UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE,
            closeOnOverlayClick: false,   // 格式面板本身沒有遮罩層
            onClose: () => {
                const handler = this.cleanupHandlers.get(panelId);
                if (typeof handler === 'function') {
                    handler();
                }
                this.cleanupHandlers.delete(panelId);
            }
        });

        // 初始預覽
        formatPreviewHandler();
    }

    /**
     * 隱藏格式設定面板
     * 事件監聽器的清理都在 showFormatPanel 註冊的 onClose 裡完成、焦點還原由 ModalManager 負責
     * （見 ModalManager 的事件監聽器生命週期說明）。重複呼叫無副作用。
     */
    hideFormatPanel() {
        this.formatModalManager.hide();
    }

    /**
     * 取得格式設定值
     */
    getFormatValues() {
        const elements = this.formatPanelElements;
        return {
            teleport: elements.teleportFormat.value,
            map: elements.mapFormat.value
        };
    }

    /**
     * 設置格式設定值
     */
    setFormatValues(values) {
        const elements = this.formatPanelElements;
        if (values.teleport !== undefined) {
            elements.teleportFormat.value = values.teleport;
        }
        if (values.map !== undefined) {
            elements.mapFormat.value = values.map;
        }
    }

    /**
     * 建立帶有遮罩層的對話框
     * @param {Object} options - 選項
     * @param {string} options.title - 標題
     * @param {HTMLElement|string} options.content - 內容
     * @param {string} options.className - 額外的 CSS class
     * @returns {Object} { overlay, dialog } - 遮罩層和對話框元素
     */
    createDialogWithOverlay(options) {
        const { title, titleKey, content, className = '' } = options;

        // 建立遮罩層
        // ARIA 一律掛在遮罩層（交給 ModalManager 的那一層），內層 .ui-dialog 維持沒有 role 的容器
        const overlay = document.createElement('div');
        overlay.className = 'ui-dialog-overlay dialog-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        // Z-index handled by CSS class or default

        // 建立對話框
        const dialog = document.createElement('div');
        dialog.className = `ui-dialog dialog ${className}`;

        if (title) {
            const titleId = `ui-dialog-title-${++UIDialogManager.dialogTitleSeq}`;
            const titleElement = document.createElement('h3');
            titleElement.id = titleId;
            titleElement.textContent = title;
            // 靜態標題文字：掛上 data-i18n，讓 window.i18n.setLanguage() 之後切換語言時
            // 能透過全域的 [data-i18n] 重新套用，不需要在本檔另外寫 observer
            if (titleKey) {
                titleElement.dataset.i18n = titleKey;
            }
            dialog.appendChild(titleElement);
            overlay.setAttribute('aria-labelledby', titleId);
        }

        if (content) {
            const contentDiv = document.createElement('div');
            if (typeof content === 'string') {
                contentDiv.textContent = content;
            } else if (content instanceof HTMLElement) {
                contentDiv.appendChild(content);
            }
            dialog.appendChild(contentDiv);
        }

        overlay.appendChild(dialog);

        return { overlay, dialog };
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIDialogManager;
}