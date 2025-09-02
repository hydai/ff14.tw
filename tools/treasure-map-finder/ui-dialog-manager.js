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
        
        // 儲存回調函數
        this.callbacks = {
            onMapDetailClose: null,
            onRouteClose: null,
            onFormatSave: null
        };

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
            closeBtn: document.getElementById('mapDetailClose'),
            overlay: document.getElementById('mapDetailOverlay')
        };

        // 路線面板元素
        this.routePanelElements = {
            panel: document.getElementById('routePanel'),
            summary: document.getElementById('routeSummary'),
            steps: document.getElementById('routeSteps'),
            closeBtn: document.getElementById('closeRoutePanel')
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
        elements.coords.textContent = `座標：${CoordinateUtils.formatCoordinatesForDisplay(map.coords)}`;
        
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
        
        // 顯示彈出視窗
        elements.modal.style.display = 'flex';
        
        // 設置關閉事件
        this.setupMapDetailCloseEvents();
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
     * 設置地圖詳細視窗的關閉事件
     */
    setupMapDetailCloseEvents() {
        const elements = this.mapDetailElements;
        
        // 關閉按鈕
        const closeHandler = () => this.hideMapDetail();
        elements.closeBtn.onclick = closeHandler;
        elements.overlay.onclick = closeHandler;
        
        // ESC 鍵關閉
        const escHandler = (e) => {
            if (e.key === 'Escape' && elements.modal.style.display !== 'none') {
                this.hideMapDetail();
            }
        };
        document.addEventListener('keydown', escHandler);
        
        // 儲存處理器以便移除
        this.mapDetailHandlers = { closeHandler, escHandler };
    }

    /**
     * 隱藏地圖詳細視窗
     */
    hideMapDetail() {
        const elements = this.mapDetailElements;
        if (elements.modal) {
            elements.modal.style.display = 'none';
        }
        
        // 清理事件處理器
        if (this.mapDetailHandlers) {
            document.removeEventListener('keydown', this.mapDetailHandlers.escHandler);
        }
        
        // 觸發回調
        if (this.callbacks.onMapDetailClose) {
            this.callbacks.onMapDetailClose();
        }
    }

    /**
     * 顯示匯出對話框
     * @param {string} content - 要匯出的內容
     * @param {Object} options - 選項
     */
    showExportDialog(content, options = {}) {
        const { title = '匯出清單', instruction = '請複製以下內容：' } = options;
        
        const dialog = this.createDialog({
            title,
            content: `
                <p style="margin-bottom: 10px;">${instruction}</p>
                <textarea id="exportTextarea" style="width: 100%; height: 200px; margin-bottom: 10px; font-family: monospace; font-size: 12px;" readonly>${this.escapeHtml(content)}</textarea>
                <div style="text-align: right;">
                    <button class="btn btn-primary" id="exportCopyBtn">複製</button>
                    <button class="btn btn-secondary" id="exportCloseBtn">關閉</button>
                </div>
            `
        });
        
        // 設置事件
        const textarea = dialog.querySelector('#exportTextarea');
        const copyBtn = dialog.querySelector('#exportCopyBtn');
        const closeBtn = dialog.querySelector('#exportCloseBtn');
        
        // 自動選取文字
        textarea.select();
        
        copyBtn.onclick = () => {
            textarea.select();
            document.execCommand('copy');
            FF14Utils.showToast('已複製到剪貼簿', 'success');
        };
        
        closeBtn.onclick = () => dialog.remove();
        
        document.body.appendChild(dialog);
    }

    /**
     * 顯示匯入對話框
     * @param {Function} onImport - 匯入回調函數
     * @param {Object} options - 選項
     */
    showImportDialog(onImport, options = {}) {
        const { title = '匯入清單', instruction = '請貼上清單內容：' } = options;
        
        const dialog = this.createDialog({
            title,
            content: `
                <p style="margin-bottom: 10px;">${instruction}</p>
                <textarea id="importTextarea" style="width: 100%; height: 200px; margin-bottom: 10px; font-family: monospace; font-size: 12px;" placeholder="在此貼上清單資料..."></textarea>
                <div style="text-align: right;">
                    <button class="btn btn-primary" id="importConfirmBtn">匯入</button>
                    <button class="btn btn-secondary" id="importCancelBtn">取消</button>
                </div>
            `
        });
        
        // 設置事件
        const textarea = dialog.querySelector('#importTextarea');
        const confirmBtn = dialog.querySelector('#importConfirmBtn');
        const cancelBtn = dialog.querySelector('#importCancelBtn');
        
        confirmBtn.onclick = () => {
            const text = textarea.value;
            if (onImport) {
                onImport(text);
            }
            dialog.remove();
        };
        
        cancelBtn.onclick = () => dialog.remove();
        
        document.body.appendChild(dialog);
        
        // 自動聚焦
        textarea.focus();
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
        
        // 顯示面板
        elements.panel.classList.add(UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE);
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
        strong.textContent = '路線摘要：';
        titleP.appendChild(strong);
        summaryDiv.appendChild(titleP);
        
        const regionsP = document.createElement('p');
        regionsP.textContent = `地區順序：${regionsText}`;
        summaryDiv.appendChild(regionsP);
        
        const teleportsP = document.createElement('p');
        teleportsP.textContent = `總傳送次數：${result.summary.totalTeleports || 0}`;
        summaryDiv.appendChild(teleportsP);
        
        const mapsP = document.createElement('p');
        mapsP.textContent = `總寶圖數量：${result.summary.totalMaps || 0}`;
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
            const currentLang = i18n.getCurrentLanguage();
            const aetheryteName = aetheryteNames[currentLang] || aetheryteNames.zh || aetheryteNames;
            textSpan.textContent = i18n.t('route.teleportTo', { location: aetheryteName });
            
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
        const elements = this.routePanelElements;
        if (elements.panel) {
            elements.panel.classList.remove(UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE);
        }
        
        if (this.callbacks.onRouteClose) {
            this.callbacks.onRouteClose();
        }
    }

    /**
     * 顯示格式設定面板
     * @param {Object} currentSettings - 當前設定
     * @param {Function} onPreviewUpdate - 預覽更新回調
     */
    showFormatPanel(currentSettings, onPreviewUpdate) {
        const elements = this.formatPanelElements;
        if (!elements.panel) return;
        
        // 設置當前值
        if (currentSettings) {
            elements.teleportFormat.value = currentSettings.teleport || '';
            elements.mapFormat.value = currentSettings.map || '';
        }
        
        // 設置預覽更新事件
        const updatePreview = () => {
            if (onPreviewUpdate) {
                onPreviewUpdate(
                    elements.teleportFormat.value,
                    elements.mapFormat.value
                );
            }
        };
        
        elements.teleportFormat.oninput = updatePreview;
        elements.mapFormat.oninput = updatePreview;
        
        // 顯示面板
        elements.panel.classList.add(UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE);
        
        // 初始預覽
        updatePreview();
    }

    /**
     * 隱藏格式設定面板
     */
    hideFormatPanel() {
        const elements = this.formatPanelElements;
        if (elements.panel) {
            elements.panel.classList.remove(UIDialogManager.CONSTANTS.CSS_CLASSES.ACTIVE);
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
     * 建立通用對話框
     */
    createDialog(options) {
        const { title, content, className = '' } = options;
        
        const dialog = document.createElement('div');
        dialog.className = `ui-dialog ${className}`;
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: ${UIDialogManager.CONSTANTS.Z_INDEX.DIALOG};
            max-width: 500px;
            width: 90%;
        `;
        
        if (title) {
            const titleElement = document.createElement('h3');
            titleElement.style.margin = '0 0 10px 0';
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
     * HTML 轉義
     */
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
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
        this.hideMapDetail();
        this.hideRouteResult();
        this.hideFormatPanel();
        
        // 移除所有動態建立的對話框
        document.querySelectorAll('.ui-dialog').forEach(dialog => {
            dialog.remove();
        });
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIDialogManager;
}