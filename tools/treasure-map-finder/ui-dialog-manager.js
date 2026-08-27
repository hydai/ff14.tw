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
        // 儲存所有對話框的參考
        this.dialogs = new Map();
        this.modalManager = new ModalManager();

        // 儲存回調函數
        this.callbacks = {
            onMapDetailClose: null,
            onRouteClose: null,
            onFormatSave: null
        };

        this.formatPreviewHandler = null;

        // 格式面板開啟期間，是否曾經把路線面板的 aria-modal 暫時改成 false
        // （見 showFormatPanel／hideFormatPanel）
        this.routePanelAriaModalOverridden = false;

        // 格式面板開啟期間，是否曾經把路線面板的焦點陷阱暫時關閉
        // （見 showFormatPanel／hideFormatPanel）
        this.routePanelFocusTrapOverridden = false;

        // Map to store cleanup functions for panels
        this.cleanupHandlers = new Map();

        // 初始化 DOM 元素參考
        this.initializeElements();
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

        // 設置圖片路徑
        const filePrefix = zoneManager?.getFilePrefix(map.zoneId) || map.zone;
        elements.img.src = `images/maps/map-${filePrefix}.webp`;

        // 設置標題和座標
        const translations = zoneManager?.getZoneNames(map.zoneId) || { zh: map.zone };
        elements.title.textContent = `${map.level.toUpperCase()} - ${translations.zh || map.zone}`;
        elements.coords.textContent = FF14Utils.getI18nText('treasure_map_pos_placeholder', `座標：${CoordinateUtils.formatCoordinatesForDisplay(map.coords)}`, {
            coords: CoordinateUtils.formatCoordinatesForDisplay(map.coords)
        });

        // 載入寶圖標記圖示
        const markIcon = new Image();
        markIcon.src = 'images/ui/mark.png';
        
        // 圖片載入完成後處理
        const imageLoadHandler = () => {
            const canvas = elements.canvas;
            const ctx = canvas.getContext('2d');
            
            // 設置 canvas 大小與圖片相同
            canvas.width = elements.img.naturalWidth;
            canvas.height = elements.img.naturalHeight;
            
            // 清除畫布
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 當標記圖示也載入完成後繪製
            markIcon.onload = () => {
                this.drawMapMarkers(ctx, canvas, map, markIcon, {
                    zoneManager,
                    aetheryteData,
                    aetheryteIcon,
                    getAetherytesForZone
                });
            };
            
            // 如果標記圖示已經載入過，直接繪製
            if (markIcon.complete) {
                this.drawMapMarkers(ctx, canvas, map, markIcon, {
                    zoneManager,
                    aetheryteData,
                    aetheryteIcon,
                    getAetherytesForZone
                });
            }
        };
        
        // 設置圖片載入事件
        elements.img.onload = imageLoadHandler;
        if (elements.img.complete) {
            imageLoadHandler();
        }

        // 設置關閉按鈕事件
        // Note: closeHandler is registered here and cleaned up in ModalManager's onClose callback.
        // For the shared event-listener lifecycle pattern, see ModalManager documentation.
        const closeHandler = () => this.hideMapDetail();
        elements.closeBtn.addEventListener('click', closeHandler);

        // 使用 ModalManager 顯示對話框
        // 現在 modal 本身就是遮罩層，ModalManager 可以自動處理點擊關閉
        this.modalManager.show(elements.modal, {
            // useClass default is 'active', which works with our CSS
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onClose: () => {
                elements.closeBtn.removeEventListener('click', closeHandler);
                if (this.callbacks.onMapDetailClose) {
                    this.callbacks.onMapDetailClose();
                }
            }
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
                
                const text = aetheryte.name.zh || aetheryte.name.en;
                const textWidth = ctx.measureText(text).width;
                const textX = imageCoords.x - textWidth / 2;
                const textY = imageCoords.y + iconSize / 2 + 30;  // 10px * 3 = 30px
                
                ctx.strokeText(text, textX, textY);
                ctx.fillText(text, textX, textY);
            });
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
        const contentElement = this._createExportDialogContent(content, instruction);

        // 建立帶有 overlay 的對話框
        const { overlay, dialog } = this.createDialogWithOverlay({
            title,
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
    _createExportDialogContent(content, instruction) {
        const container = document.createElement('div');

        const instructionP = document.createElement('p');
        instructionP.className = 'ui-dialog-instruction';
        instructionP.textContent = instruction;
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
        buttonContainer.appendChild(copyBtn);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn btn-secondary';
        closeBtn.id = 'exportCloseBtn';
        closeBtn.textContent = FF14Utils.getI18nText('treasure_map_close', '關閉');
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
        const contentElement = this._createImportDialogContent(instruction, placeholder);

        // 建立帶有 overlay 的對話框
        const { overlay, dialog } = this.createDialogWithOverlay({
            title,
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
    _createImportDialogContent(instruction, placeholder) {
        const container = document.createElement('div');

        const instructionP = document.createElement('p');
        instructionP.className = 'ui-dialog-instruction';
        instructionP.textContent = instruction;
        container.appendChild(instructionP);

        const textarea = document.createElement('textarea');
        textarea.id = 'importTextarea';
        textarea.className = 'ui-dialog-textarea form-control';
        textarea.placeholder = placeholder;
        container.appendChild(textarea);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'ui-dialog-actions';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.id = 'importConfirmBtn';
        confirmBtn.textContent = FF14Utils.getI18nText('treasure_map_confirm', '匯入');
        buttonContainer.appendChild(confirmBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.id = 'importCancelBtn';
        cancelBtn.textContent = FF14Utils.getI18nText('treasure_map_cancel', '取消');
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

        const closeHandler = () => this.hideRouteResult();
        elements.closeBtn.addEventListener('click', closeHandler);

        // 顯示面板
        this.modalManager.show(elements.panel, {
            useClass: UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE,
            closeOnOverlayClick: false,
            onClose: () => {
                // 格式面板是從路線面板內開啟的，關閉路線面板時要一併收起（重複呼叫無副作用）。
                // 這裡傳 restoreFocus: false——上面這個 modalManager.hide() 已經把焦點還給
                // 開啟路線面板的按鈕，不能讓 hideFormatPanel 又把焦點搶回路線面板內、
                // 即將一起被隱藏的「自訂格式」按鈕
                this.hideFormatPanel({ restoreFocus: false });
                elements.closeBtn.removeEventListener('click', closeHandler);
                if (this.callbacks.onRouteClose) {
                    this.callbacks.onRouteClose();
                }
            }
        });
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
            const aetheryteName = aetheryteNames.zh || aetheryteNames;
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
        copyBtn.title = '複製';
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

        // 顯示面板（格式面板是從路線面板內開啟的，兩者需同時顯示，
        // 因此不透過共用的 modalManager（會關閉正在開啟的路線面板），改為獨立處理顯示與 Escape；
        // 面板本身是非模態的，不攔截 Tab／Shift+Tab，焦點可自然離開面板到路線面板的其他控制項）
        elements.panel.classList.add(UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE);

        // 格式面板開著時，路線面板退居背景但兩者同時可見、可操作；
        // 路線面板若仍宣告 aria-modal="true"，輔助科技會把 DOM 中在它範圍外的
        // 格式面板整個視為不可用。暫時撤銷路線面板的 aria-modal，
        // 關閉格式面板時再還原（見 hideFormatPanel，且不論路線面板當下是否
        // 隨之一併關閉都要還原，見該處註解）
        const routePanelForModal = this.routePanelElements.panel;
        if (routePanelForModal) {
            routePanelForModal.setAttribute('aria-modal', 'false');
            this.routePanelAriaModalOverridden = true;
        }

        // 路線面板由 ModalManager 管理，預設會啟用焦點陷阱 (focusTrap)，
        // Tab 在面板內的最後一個控制項會循環回第一個，導致焦點永遠跳不出去、
        // 摸不到旁邊同時開啟的格式面板。格式面板開啟期間先暫時關閉路線面板的
        // 焦點陷阱，讓 Tab／Shift+Tab 可以在兩個手足面板之間自然移動；
        // 只有在路線面板確實是 ModalManager 目前的 activeModal 時才需要處理，
        // 且不影響 ESC 關閉路線面板的行為（見 ModalManager.setFocusTrap 註解）
        if (routePanelForModal && this.modalManager.activeModal === routePanelForModal) {
            this.modalManager.setFocusTrap(false);
            this.routePanelFocusTrapOverridden = true;
        }

        // 記住開啟面板前的焦點元素，關閉時歸還焦點
        this.formatPanelOpener = document.activeElement;

        // 綁定鍵盤事件處理器（只建立一次），掛在面板本身而非 document，
        // 避免與路線面板（由 modalManager 管理）的鍵盤事件互相干擾
        if (!this._boundFormatPanelKeydown) {
            this._boundFormatPanelKeydown = (event) => this.handleFormatPanelKeydown(event);
        }
        elements.panel.addEventListener('keydown', this._boundFormatPanelKeydown);

        // 將焦點移入面板內第一個可聚焦元素，找不到時退回聚焦面板本身
        const initialFocusTarget = elements.panel.querySelector(
            'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (initialFocusTarget) {
            initialFocusTarget.focus();
        } else {
            elements.panel.focus();
        }

        // 初始預覽
        formatPreviewHandler();
    }

    /**
     * 處理格式設定面板的鍵盤事件（僅 Escape 關閉）
     * #formatPanel 是非模態面板，路線面板仍在旁邊維持開啟並可操作，
     * 因此這裡不攔截 Tab／Shift+Tab，焦點可以自然離開面板到路線面板的其他控制項；
     * Escape 呼叫 stopPropagation()，避免事件冒泡到 document 觸發路線面板
     * （由 modalManager 管理）一併關閉
     * @param {KeyboardEvent} event - 鍵盤事件
     */
    handleFormatPanelKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.hideFormatPanel();
        }
    }

    /**
     * 隱藏格式設定面板
     * @param {Object} [options={}]
     * @param {boolean} [options.restoreFocus=true] - 是否把焦點歸還給開啟面板前的觸發元素。
     *   路線面板的 onClose 在「兩個面板一併關閉」時會傳入 false——
     *   ModalManager.hide() 當下已經把焦點還給生成路線按鈕，這裡不能再搶著
     *   把焦點送進即將隨路線面板一起隱藏的「自訂格式」按鈕
     */
    hideFormatPanel(options = {}) {
        const { restoreFocus = true } = options;
        const elements = this.formatPanelElements;
        if (elements.panel) {
            elements.panel.classList.remove(UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE);
            if (this._boundFormatPanelKeydown) {
                elements.panel.removeEventListener('keydown', this._boundFormatPanelKeydown);
            }
        }

        const panelId = 'formatPanel';

        // 移除事件監聽器
        if (this.cleanupHandlers.has(panelId)) {
            const cleanup = this.cleanupHandlers.get(panelId);
            if (typeof cleanup === 'function') {
                cleanup();
            }
            this.cleanupHandlers.delete(panelId);
        }

        // 將焦點歸還給開啟面板前的觸發元素；只在該元素仍連接在文件中
        // 且視覺上可見時才聚焦，避免把焦點送進一個已經隨路線面板一起
        // 隱藏、看不到的按鈕
        if (restoreFocus && this.formatPanelOpener && !this.formatPanelOpener.disabled &&
            this.isElementVisible(this.formatPanelOpener)) {
            this.formatPanelOpener.focus();
        }
        this.formatPanelOpener = null;

        // 還原路線面板的 aria-modal。這裡不用「路線面板目前是否還是 active」
        // 來判斷要不要還原：單獨關閉格式面板時路線面板固然還是 active，
        // 但隨路線面板一起關閉時，ModalManager.hide() 會先移除 .active、
        // 清空 activeModal，最後才執行 onClose 呼叫到這裡，屆時路線面板
        // 一定已經不是 active，用該狀態判斷會導致這個情境永遠不還原。
        // 改用「格式面板開啟時是否真的動過這個屬性」來判斷，兩種情境都要
        // 還原成 true，確保路線面板下次重新開啟時不會殘留這次暫時關閉用的
        // aria-modal="false"
        if (this.routePanelAriaModalOverridden) {
            const routePanel = this.routePanelElements.panel;
            if (routePanel) {
                routePanel.setAttribute('aria-modal', 'true');
            }
            this.routePanelAriaModalOverridden = false;
        }

        // 還原路線面板的焦點陷阱，理由與上面還原 aria-modal 相同：
        // 不論是單獨關閉格式面板，或是路線面板先一步觸發 ModalManager.hide()
        // 導致 activeModal 已經清空的連鎖關閉路徑，都要用「格式面板開啟時
        // 是否真的關過焦點陷阱」這個旗標來判斷，兩種情境都要呼叫
        // setFocusTrap(true) 復原，避免路線面板下次重新開啟時焦點陷阱
        // 仍停留在關閉狀態
        if (this.routePanelFocusTrapOverridden) {
            this.modalManager.setFocusTrap(true);
            this.routePanelFocusTrapOverridden = false;
        }
    }

    /**
     * 判斷元素是否仍連接在文件中，且視覺上可見（未被 CSS 隱藏）
     * offsetParent 在 position:fixed 的元素上恆為 null，因此用
     * getClientRects().length 兜底，避免誤判為不可見
     */
    isElementVisible(el) {
        return !!el && el.isConnected && (el.offsetParent !== null || el.getClientRects().length > 0);
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
        const { title, content, className = '' } = options;

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

    /**
     * 設置回調函數
     */
    setCallbacks(callbacks) {
        Object.assign(this.callbacks, callbacks);
    }

    /**
     * 關閉所有對話框
     */
    closeAll() {
        // 使用 ModalManager 關閉當前開啟的 modal
        this.modalManager.hide();

        this.hideMapDetail();
        this.hideRouteResult();
        this.hideFormatPanel();

        // 移除所有動態建立的對話框和遮罩層
        document.querySelectorAll('.ui-dialog-overlay, .ui-dialog').forEach(element => {
            element.remove();
        });
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIDialogManager;
}