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

        // 關閉鈕的固定監聽器參考（見 showRouteResult／showMapDetail）
        this._boundHideRouteResult = null;
        this._boundHideMapDetail = null;

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
        // 地圖詳細視窗元素
        this.mapDetailElements = {
            modal: document.getElementById('mapDetailModal'),
            img: document.getElementById('mapDetailImage'),
            canvas: document.getElementById('mapDetailCanvas'),
            title: document.getElementById('mapDetailTitle'),
            coords: document.getElementById('mapDetailCoords'),
            closeBtn: document.getElementById('mapDetailClose')
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
     * 顯示地圖詳細視窗
     * @param {Object} map - 地圖資料
     * @param {Object} options - 選項
     */
    showMapDetail(map, options = {}) {
        const { zoneManager, aetheryteData, aetheryteIcon, getAetherytesForZone } = options;
        const elements = this.mapDetailElements;

        if (!elements.modal) return;

        // 快取這次開啟的資料，語言切換時（見 refreshActiveDialog）重新以目前語言渲染
        this.activeDialog = { kind: 'mapDetail', map, options };

        // 設置圖片路徑
        const filePrefix = zoneManager?.getFilePrefix(map.zoneId) || map.zone;
        elements.img.src = `images/maps/map-${filePrefix}.webp`;

        // 設置標題和座標
        this._renderMapDetailHeader(map, zoneManager);

        // 圖片載入完成後處理；標記圖示的載入與繪製交給 _loadAndDrawMarkers()，
        // 語言切換後的 refreshActiveDialog() 也會呼叫同一個方法重繪，避免兩處各自維護一份繪製邏輯
        const imageLoadHandler = () => {
            const canvas = elements.canvas;
            const ctx = canvas.getContext('2d');

            // 設置 canvas 大小與圖片相同
            canvas.width = elements.img.naturalWidth;
            canvas.height = elements.img.naturalHeight;

            // 畫布的清除與標記繪製交給 _loadAndDrawMarkers()

            this._loadAndDrawMarkers(map, { zoneManager, aetheryteData, aetheryteIcon, getAetherytesForZone });
        };
        
        // 設置圖片載入事件
        elements.img.onload = imageLoadHandler;
        if (elements.img.complete) {
            imageLoadHandler();
        }

        // 設置關閉按鈕事件
        // 與 showRouteResult 相同：固定用同一個函式參考掛載，避免重複開啟時監聽器累積
        if (!this._boundHideMapDetail) {
            this._boundHideMapDetail = () => this.hideMapDetail();
        }
        elements.closeBtn.addEventListener('click', this._boundHideMapDetail);

        // 使用 ModalManager 顯示對話框
        // 現在 modal 本身就是遮罩層，ModalManager 可以自動處理點擊關閉
        this.modalManager.show(elements.modal, {
            // useClass default is 'active', which works with our CSS
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onClose: () => {
                elements.closeBtn.removeEventListener('click', this._boundHideMapDetail);
                if (this.activeDialog?.kind === 'mapDetail') {
                    this.activeDialog = null;
                }
            }
        });
    }

    /**
     * 渲染地圖詳細視窗的標題與座標；showMapDetail() 與語言切換後的
     * refreshActiveDialog() 共用同一份邏輯，確保兩者輸出一致
     */
    _renderMapDetailHeader(map, zoneManager) {
        const elements = this.mapDetailElements;

        // 依目前介面語言挑選地區名稱，找不到對應語言時退回中文（與 renderMyList() 一致）
        const translations = zoneManager?.getZoneNames(map.zoneId) || { zh: map.zone };
        const currentLang = window.i18n.getCurrentLanguage();
        elements.title.textContent = `${map.level.toUpperCase()} - ${translations[currentLang] || translations.zh || map.zone}`;
        elements.coords.textContent = FF14Utils.getI18nText('treasure_map_pos_placeholder', `座標：${CoordinateUtils.formatCoordinatesForDisplay(map.coords)}`, {
            coords: CoordinateUtils.formatCoordinatesForDisplay(map.coords)
        });
    }

    /**
     * 繪製地圖標記
     */
    drawMapMarkers(ctx, canvas, map, markIcon, options) {
        const { zoneManager, aetheryteData, aetheryteIcon, getAetherytesForZone } = options;
        
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
        
        // 如果有傳送點資料和圖標，繪製傳送點
        if (aetheryteData && aetheryteIcon && getAetherytesForZone) {
            const aetherytes = getAetherytesForZone(map.zone);
            
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
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 6;  // 3px * 2 = 6px (加粗描邊)
                
                const currentLang = window.i18n.getCurrentLanguage();
                const text = aetheryte.name[currentLang] || aetheryte.name.zh || aetheryte.name.en;
                const textWidth = ctx.measureText(text).width;
                const textX = imageCoords.x - textWidth / 2;
                const textY = imageCoords.y + iconSize / 2 + 30;  // 10px * 3 = 30px
                
                ctx.strokeText(text, textX, textY);
                ctx.fillText(text, textX, textY);
            });
        }
    }

    /**
     * 建立寶圖標記圖示並繪製到 canvas；showMapDetail() 初次開啟與語言切換後的
     * refreshActiveDialog() 重繪都呼叫這裡，避免兩處各自維護一份繪製邏輯
     */
    _loadAndDrawMarkers(map, options) {
        const canvas = this.mapDetailElements.canvas;
        const ctx = canvas.getContext('2d');
        const markIcon = new Image();
        markIcon.src = 'images/ui/mark.png';

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            this.drawMapMarkers(ctx, canvas, map, markIcon, options);
        };

        if (markIcon.complete) {
            draw();
        } else {
            markIcon.onload = draw;
        }
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
     * 顯示匯出對話框
     * @param {string} content - 要匯出的內容
     * @param {Object} options - 選項
     */
    showExportDialog(content, options = {}) {
        const defaultTitle = FF14Utils.getI18nText('treasure_map_export_title', '匯出清單');
        const defaultInstruction = FF14Utils.getI18nText('treasure_map_export_instruction', '請複製以下內容：');
        const { title = defaultTitle, instruction = defaultInstruction } = options;

        // 建立對話框內容
        // 只有在呼叫端沒有自訂標題／說明文字時才掛 data-i18n key
        const contentElement = this._createExportDialogContent(
            content,
            instruction,
            instruction === defaultInstruction ? 'treasure_map_export_instruction' : undefined
        );

        // 建立帶有 overlay 的對話框
        const { overlay, dialog } = this.createDialogWithOverlay({
            title,
            titleKey: title === defaultTitle ? 'treasure_map_export_title' : undefined,
            content: contentElement
        });

        // 設置事件
        const textarea = dialog.querySelector('#exportTextarea');
        const copyBtn = dialog.querySelector('#exportCopyBtn');
        const closeBtn = dialog.querySelector('#exportCloseBtn');

        const closeDialog = () => this.modalManager.hide();

        copyBtn.onclick = () => {
            // 若瀏覽器不支援剪貼簿 API，提供手動複製指引
            if (!navigator.clipboard || !navigator.clipboard.writeText) {
                this._handleManualCopy(
                    textarea,
                    'treasure_map_copy_manual',
                    '瀏覽器不支援自動複製，請手動選取文字後按 Ctrl+C 複製',
                    'info'
                );
                return;
            }

            navigator.clipboard.writeText(textarea.value).then(() => {
                FF14Utils.showToast(
                    FF14Utils.getI18nText('treasure_map_copy_clipboard_success', '已複製到剪貼簿'),
                    'success'
                );
            }).catch(err => {
                console.error('Copy to clipboard failed:', err);
                // 失敗時選取文字並提示使用者手動複製
                this._handleManualCopy(
                    textarea,
                    'treasure_map_copy_fallback_manual',
                    '複製失敗，請手動選取文字後按 Ctrl+C 複製',
                    'error'
                );
            });
        };

        closeBtn.onclick = closeDialog;

        document.body.appendChild(overlay);

        // 使用 ModalManager 顯示
        this.modalManager.show(overlay, {
            // useClass default is 'active'
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onClose: () => overlay.remove()
        });

        // 自動選取文字 (需在顯示後執行)
        setTimeout(() => textarea.select(), 0);
    }

    /**
     * 建立匯出對話框內容
     * @private
     */
    _createExportDialogContent(content, instruction, instructionKey) {
        const container = document.createElement('div');

        const instructionP = document.createElement('p');
        instructionP.className = 'ui-dialog-instruction';
        instructionP.textContent = instruction;
        if (instructionKey) {
            instructionP.dataset.i18n = instructionKey;
        }
        container.appendChild(instructionP);

        const textarea = document.createElement('textarea');
        textarea.id = 'exportTextarea';
        textarea.className = 'ui-dialog-textarea form-control';
        textarea.readOnly = true;
        textarea.value = content;
        container.appendChild(textarea);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'ui-dialog-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-primary';
        copyBtn.id = 'exportCopyBtn';
        copyBtn.textContent = FF14Utils.getI18nText('treasure_map_copy_route', '複製');
        copyBtn.dataset.i18n = 'treasure_map_copy_route';
        buttonContainer.appendChild(copyBtn);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn btn-secondary';
        closeBtn.id = 'exportCloseBtn';
        closeBtn.textContent = FF14Utils.getI18nText('treasure_map_close', '關閉');
        closeBtn.dataset.i18n = 'treasure_map_close';
        buttonContainer.appendChild(closeBtn);

        container.appendChild(buttonContainer);

        return container;
    }

    /**
     * 處理手動複製
     * @private
     */
    _handleManualCopy(textarea, messageKey, defaultMessage, type) {
        textarea.focus();
        textarea.select();
        FF14Utils.showToast(
            FF14Utils.getI18nText(messageKey, defaultMessage),
            type
        );
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
        // 同 showExportDialog()：只有在呼叫端沒有自訂文字時才掛 data-i18n key
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
     * （地圖詳細視窗的座標提示與標題；路線結果面板的摘要與每個步驟）
     */
    refreshActiveDialog() {
        if (!this.activeDialog) return;

        if (this.activeDialog.kind === 'mapDetail') {
            const { map, options } = this.activeDialog;
            this._renderMapDetailHeader(map, options.zoneManager);
            this._loadAndDrawMarkers(map, options);
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