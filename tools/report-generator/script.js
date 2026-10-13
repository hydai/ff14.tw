/**
 * FF14.tw 檢舉模板產生器
 * 協助玩家快速產生不當行為檢舉的模板文字
 */

class ReportGenerator {
    static MAX_CHAR_LIMIT = 1000;

    constructor() {
        this.elements = {
            form: document.getElementById('reportForm'),
            incidentDate: document.getElementById('incidentDate'),
            timeStart: document.getElementById('timeStart'),
            timeEnd: document.getElementById('timeEnd'),
            playerName: document.getElementById('playerName'),
            serverSelect: document.getElementById('serverSelect'),
            serverCustom: document.getElementById('serverCustom'),
            location: document.getElementById('location'),
            incidentType: document.getElementById('incidentType'),
            incidentTypeCustom: document.getElementById('incidentTypeCustom'),
            details: document.getElementById('details'),
            resetBtn: document.getElementById('resetBtn'),
            resultSection: document.getElementById('resultSection'),
            resultText: document.getElementById('resultText'),
            copyBtn: document.getElementById('copyBtn'),
            charCountDisplay: document.getElementById('charCountDisplay'),
            charCount: document.getElementById('charCount'),
            charLimitWarning: document.getElementById('charLimitWarning')
        };

        this.initializeDefaults();
        this.bindEvents();
        this.cacheCopyButtonElements();
    }

    /**
     * 快取複製按鈕的子元素引用
     */
    cacheCopyButtonElements() {
        this.copyBtnIcon = this.elements.copyBtn.querySelector('.btn-icon');
        this.copyBtnText = this.elements.copyBtn.querySelector('.btn-text');
    }

    /**
     * 設定預設值
     */
    initializeDefaults() {
        // 設定今天的日期為預設值
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        this.elements.incidentDate.value = `${year}-${month}-${day}`;
    }

    /**
     * 綁定事件
     */
    bindEvents() {
        // 表單提交
        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.generateReport();
        });

        // 重置按鈕
        this.elements.resetBtn.addEventListener('click', () => {
            this.resetForm();
        });

        // 伺服器選擇變更 - 顯示/隱藏自訂輸入框
        this.elements.serverSelect.addEventListener('change', (e) => {
            this.toggleCustomInput(e.target, this.elements.serverCustom);
        });

        // 事件類別選擇變更 - 顯示/隱藏自訂輸入框
        this.elements.incidentType.addEventListener('change', (e) => {
            this.toggleCustomInput(e.target, this.elements.incidentTypeCustom);
        });

        // 複製按鈕
        this.elements.copyBtn.addEventListener('click', () => {
            this.copyToClipboard();
        });
    }

    /**
     * 切換自訂輸入框的顯示狀態
     * @param {HTMLSelectElement} selectElement - 選擇框元素
     * @param {HTMLInputElement} customInput - 自訂輸入框元素
     */
    toggleCustomInput(selectElement, customInput) {
        if (selectElement.value === 'other') {
            customInput.classList.remove('hidden');
            customInput.required = true;
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
            customInput.required = false;
            customInput.value = '';
        }
    }

    /**
     * 取得伺服器名稱
     * @returns {string} 伺服器名稱
     */
    getServerName() {
        if (this.elements.serverSelect.value === 'other') {
            return this.elements.serverCustom.value.trim();
        }
        return this.elements.serverSelect.value;
    }

    /**
     * 取得事件類別
     * @returns {string} 事件類別
     */
    getIncidentType() {
        if (this.elements.incidentType.value === 'other') {
            return this.elements.incidentTypeCustom.value.trim();
        }
        return this.elements.incidentType.value;
    }

    /**
     * 格式化日期為 YYYY/MM/DD
     * @param {string} dateString - 日期字串 (YYYY-MM-DD)
     * @returns {string} 格式化後的日期
     */
    formatDate(dateString) {
        if (!dateString) return '';
        return dateString.replace(/-/g, '/');
    }

    /**
     * 格式化時間範圍
     * @returns {string} 格式化後的時間範圍，若無則返回空字串
     */
    formatTimeRange() {
        const start = this.elements.timeStart.value;
        const end = this.elements.timeEnd.value;

        if (start && end) {
            return `${start} ~ ${end}`;
        } else if (start) {
            return `${start} 左右`;
        } else if (end) {
            return `${end} 左右`;
        }
        return '';
    }

    /**
     * 驗證表單
     * @returns {boolean} 是否驗證通過
     */
    validateForm() {
        const requiredFields = [
            { element: this.elements.playerName, name: '被檢舉玩家名稱' },
            { element: this.elements.location, name: '事件發生地點' },
            { element: this.elements.details, name: '事件細節' }
        ];

        // 檢查必填欄位
        for (const field of requiredFields) {
            if (!field.element.value.trim()) {
                this.showError(`請填寫「${field.name}」`);
                field.element.focus();
                return false;
            }
        }

        // 檢查自訂選擇欄位（伺服器、事件類別）
        const customSelects = [
            {
                select: this.elements.serverSelect,
                custom: this.elements.serverCustom,
                getValue: () => this.getServerName(),
                errorMsg: '請選擇或輸入伺服器名稱'
            },
            {
                select: this.elements.incidentType,
                custom: this.elements.incidentTypeCustom,
                getValue: () => this.getIncidentType(),
                errorMsg: '請選擇或輸入事件類別'
            }
        ];

        for (const field of customSelects) {
            if (!field.getValue()) {
                this.showError(field.errorMsg);
                const focusTarget = field.select.value === 'other' ? field.custom : field.select;
                focusTarget.focus();
                return false;
            }
        }

        return true;
    }

    /**
     * 顯示錯誤訊息
     * @param {string} message - 錯誤訊息
     */
    showError(message) {
        if (typeof FF14Utils !== 'undefined' && FF14Utils.showToast) {
            FF14Utils.showToast(message, 'error');
        } else {
            alert(message);
        }
    }

    /**
     * 顯示成功訊息
     * @param {string} message - 成功訊息
     */
    showSuccess(message) {
        if (typeof FF14Utils !== 'undefined' && FF14Utils.showToast) {
            FF14Utils.showToast(message, 'success');
        } else {
            alert(message);
        }
    }

    /**
     * 產生檢舉模板
     */
    generateReport() {
        if (!this.validateForm()) {
            return;
        }

        const date = this.formatDate(this.elements.incidentDate.value);
        const timeRange = this.formatTimeRange();
        const playerName = this.elements.playerName.value.trim();
        const serverName = this.getServerName();
        const location = this.elements.location.value.trim();
        const incidentType = this.getIncidentType();
        const details = this.elements.details.value.trim();

        // 建立模板文字
        let template = `【不當行為檢舉】\n\n`;
        template += `■ 發生日期：${date}\n`;

        if (timeRange) {
            template += `■ 發生時間：${timeRange}\n`;
        }

        template += `■ 被檢舉玩家名稱：${playerName}\n`;
        template += `■ 被檢舉玩家所屬伺服器：${serverName}\n`;
        template += `■ 事件發生地點：${location}\n`;
        template += `■ 事件類別：${incidentType}\n\n`;
        template += `■ 事件細節：\n${details}`;

        // 顯示結果（使用安全的 textContent）
        this.elements.resultText.textContent = template;
        this.elements.resultSection.classList.remove('hidden');

        // 更新字數統計
        this.updateCharacterCount(template);

        // 超過字數上限時不自動複製、也不顯示成功訊息，改請使用者回頭精簡事件細節
        if (template.length > ReportGenerator.MAX_CHAR_LIMIT) {
            this.showError(`模板超過 ${ReportGenerator.MAX_CHAR_LIMIT} 字上限（目前 ${template.length} 字），請把「事件細節」精簡約 ${template.length - ReportGenerator.MAX_CHAR_LIMIT} 字後再產生。`);
            this.elements.details.focus();
            return;
        }

        // 自動複製到剪貼簿
        this.copyToClipboard(true);

        // 滾動到結果區塊
        this.elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * 更新字數統計
     * @param {string} text - 模板文字
     */
    updateCharacterCount(text) {
        const count = text.length;
        this.elements.charCount.textContent = count;

        if (count > ReportGenerator.MAX_CHAR_LIMIT) {
            this.elements.charCountDisplay.classList.add('over-limit');
            this.elements.charLimitWarning.classList.remove('hidden');
        } else {
            this.elements.charCountDisplay.classList.remove('over-limit');
            this.elements.charLimitWarning.classList.add('hidden');
        }
    }

    /**
     * 更新複製按鈕的內容（使用快取元素優化效能）
     * @param {string} icon - 圖示字元
     * @param {string} text - 按鈕文字
     */
    updateCopyButtonContent(icon, text) {
        this.copyBtnIcon.textContent = icon;
        this.copyBtnText.textContent = text;
    }

    /**
     * 複製到剪貼簿
     * @param {boolean} isAutomatic - 是否為自動複製（產生模板時自動觸發）
     */
    async copyToClipboard(isAutomatic = false) {
        const text = this.elements.resultText.textContent;
        const successMessage = isAutomatic ? '已產生並複製到剪貼簿！' : '已複製到剪貼簿！';

        try {
            await navigator.clipboard.writeText(text);
            this.showSuccess(successMessage);

            // 暫時更新按鈕文字（使用安全的 DOM 操作）
            this.updateCopyButtonContent('✓', '已複製！');
            this.elements.copyBtn.classList.add('btn-success-active');

            setTimeout(() => {
                this.updateCopyButtonContent('📋', '複製到剪貼簿');
                this.elements.copyBtn.classList.remove('btn-success-active');
            }, 2000);
        } catch (err) {
            // 備用方案：使用舊版 API
            this.fallbackCopyToClipboard(text);
        }
    }

    /**
     * 備用複製方法（舊版瀏覽器）
     * @param {string} text - 要複製的文字
     */
    fallbackCopyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand('copy');
            this.showSuccess('已複製到剪貼簿！');
        } catch (err) {
            this.showError('複製失敗，請手動選取複製');
        }

        document.body.removeChild(textarea);
    }

    /**
     * 重置表單
     */
    resetForm() {
        this.elements.form.reset();
        this.initializeDefaults();

        // 隱藏自訂輸入框
        this.elements.serverCustom.classList.add('hidden');
        this.elements.serverCustom.required = false;
        this.elements.incidentTypeCustom.classList.add('hidden');
        this.elements.incidentTypeCustom.required = false;

        // 隱藏結果區塊
        this.elements.resultSection.classList.add('hidden');

        // 滾動到頂部
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// 頁面載入後初始化
document.addEventListener('DOMContentLoaded', function() {
    new ReportGenerator();
});
