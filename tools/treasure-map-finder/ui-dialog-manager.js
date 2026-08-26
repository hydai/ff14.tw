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
        textarea.className = 'ui-dialog-textarea';
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
        textarea.className = 'ui-dialog-textarea';
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

        // 顯示面板
        elements.panel.classList.add(UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE);

        // 初始預覽
        formatPreviewHandler();
    }

    /**
     * 隱藏格式設定面板
     */
    hideFormatPanel() {
        const elements = this.formatPanelElements;
        if (elements.panel) {
            elements.panel.classList.remove(UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE);
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
        const overlay = document.createElement('div');
        overlay.className = 'ui-dialog-overlay';
        // Z-index handled by CSS class or default

        // 建立對話框
        const dialog = document.createElement('div');
        dialog.className = `ui-dialog ${className}`;

        if (title) {
            const titleElement = document.createElement('h3');
            titleElement.textContent = title;
            dialog.appendChild(titleElement);
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
     * 建立通用對話框 (無遮罩層，保留向後相容)
     * @deprecated 建議使用 createDialogWithOverlay
     */
    createDialog(options) {
        const { title, content, className = '' } = options;

        const dialog = document.createElement('div');
        dialog.className = `ui-dialog fixed-center ${className}`;

        if (title) {
            const titleElement = document.createElement('h3');
            titleElement.textContent = title;
            dialog.appendChild(titleElement);
        }

        if (content) {
            const contentDiv = document.createElement('div');
            // Check if content is a string or DOM element
            if (typeof content === 'string') {
                contentDiv.textContent = content;
            } else if (content instanceof HTMLElement) {
                contentDiv.appendChild(content);
            }
            dialog.appendChild(contentDiv);
        }

        return dialog;
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