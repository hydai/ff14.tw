/**
 * 通用模態視窗 (Modal/Popup) 管理器
 * 統一處理顯示/隱藏、焦點管理 (Focus Trap)、ESC 關閉、背景點擊關閉等行為
 */
class ModalManager {
    constructor() {
        this.activeModal = null;
        this.previousFocus = null;
        this.options = {};

        // 綁定事件處理器以保持 context
        this._boundHandleKeyDown = this._handleKeyDown.bind(this);
        this._boundHandleOverlayClick = this._handleOverlayClick.bind(this);
    }

    /**
     * 顯示模態視窗
     * @param {HTMLElement} element - 模態視窗的 DOM 元素
     * @param {Object} options - 設定選項
     * @param {Function} [options.onClose] - 關閉時的回調函數
     * @param {boolean} [options.closeOnOverlayClick=true] - 是否允許點擊背景關閉
     * @param {boolean} [options.closeOnEsc=true] - 是否允許按 ESC 關閉
     * @param {string|null} [options.useClass='active'] - 用於控制顯示的 CSS class，若為 null 則操作 style.display
     * @param {string} [options.displayStyle='flex'] - 若不使用 class，則設定 style.display 的值
     * @param {boolean} [options.focusTrap=true] - 是否啟用焦點陷阱 (Tab 循環)
     */
    show(element, options = {}) {
        // 如果已有開啟的模態視窗，先關閉它 (簡單實作：單一模態視窗模式)
        if (this.activeModal) {
            if (this.activeModal === element) return; // 已經開啟同一個
            this.hide();
        }

        this.activeModal = element;
        this.previousFocus = document.activeElement;

        // 預設選項
        this.options = {
            onClose: null,
            closeOnOverlayClick: true,
            closeOnEsc: true,
            useClass: 'active', // 預設使用 .active class
            displayStyle: 'flex',
            focusTrap: true,
            ...options
        };

        // 顯示元素
        if (this.options.useClass) {
            element.classList.add(this.options.useClass);
        } else {
            element.style.display = this.options.displayStyle;
        }

        // 設定 ARIA 屬性
        element.setAttribute('aria-modal', 'true');
        element.setAttribute('role', 'dialog');

        // 加入事件監聽
        if (this.options.closeOnEsc || this.options.focusTrap) {
            document.addEventListener('keydown', this._boundHandleKeyDown);
        }

        if (this.options.closeOnOverlayClick) {
            element.addEventListener('click', this._boundHandleOverlayClick);
        }

        // 處理焦點
        if (this.options.focusTrap) {
            this._setInitialFocus(element);
        }
    }

    /**
     * 隱藏當前模態視窗
     */
    hide() {
        if (!this.activeModal) return;

        const element = this.activeModal;
        const onClose = this.options.onClose;

        // 隱藏元素
        if (this.options.useClass) {
            element.classList.remove(this.options.useClass);
        } else {
            element.style.display = 'none';
        }

        // 移除事件監聽
        document.removeEventListener('keydown', this._boundHandleKeyDown);
        element.removeEventListener('click', this._boundHandleOverlayClick);

        // 清除引用
        this.activeModal = null;

        // 恢復焦點
        if (this.previousFocus && document.body.contains(this.previousFocus)) {
            this.previousFocus.focus();
        }
        this.previousFocus = null;

        // 執行回調
        if (typeof onClose === 'function') {
            onClose();
        }
    }

    /**
     * 處理鍵盤事件 (ESC 和 Tab)
     */
    _handleKeyDown(e) {
        if (!this.activeModal) return;

        // ESC 關閉
        if (e.key === 'Escape' && this.options.closeOnEsc) {
            e.preventDefault();
            this.hide();
            return;
        }

        // Tab 焦點循環
        if (e.key === 'Tab' && this.options.focusTrap) {
            this._handleFocusTrap(e);
        }
    }

    /**
     * 處理背景點擊
     */
    _handleOverlayClick(e) {
        if (!this.activeModal) return;

        // 只有點擊到遮罩層本身才關閉 (不包含內容子元素)
        if (e.target === this.activeModal && this.options.closeOnOverlayClick) {
            e.preventDefault();
            this.hide();
        }
    }

    /**
     * 處理焦點陷阱邏輯
     */
    _handleFocusTrap(e) {
        const focusableElements = this._getFocusableElements(this.activeModal);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) { // Shift + Tab
            if (document.activeElement === firstElement) {
                lastElement.focus();
                e.preventDefault();
            }
        } else { // Tab
            if (document.activeElement === lastElement) {
                firstElement.focus();
                e.preventDefault();
            }
        }
    }

    /**
     * 設定初始焦點
     */
    _setInitialFocus(element) {
        // 嘗試找尋有 autofocus 屬性的元素
        const autoFocusElement = element.querySelector('[autofocus]');
        if (autoFocusElement) {
            autoFocusElement.focus();
            return;
        }

        // 否則聚焦第一個可聚焦元素
        const focusableElements = this._getFocusableElements(element);
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        } else {
            // 如果沒有可聚焦元素，聚焦 modal 本身 (需有 tabindex)
            element.focus();
        }
    }

    /**
     * 取得所有可聚焦元素
     *
     * Tabindex 處理說明：
     * - 選擇器包含 [tabindex]:not([tabindex="-1"])，會選取所有 tabindex >= 0 的元素
     * - tabindex="0" 的元素會按照 DOM 順序參與焦點循環
     * - 依照 HTML 標準，tabindex > 0 的元素會形成獨立的 Tab 順序（在 tabindex="0" 與預設可聚焦元素之前）
     * - 在本實作中，為了簡化焦點陷阱邏輯，所有 tabindex >= 0 的元素一律依 DOM 順序參與焦點循環，
     *   並不依照實際的 tabindex 數值重新排序（此為刻意偏離標準 tabindex 行為）
     * - tabindex="-1" 的元素會被排除，因為它們不應參與 Tab 鍵導航
     */
    _getFocusableElements(element) {
        // 擴充的可聚焦元素選擇器，參考 focus-trap 等庫的最佳實踐
        // 包含標準表單元素、連結、以及具備 tabindex 或特定屬性的元素
        const selector = [
            'a[href]',
            'area[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            'button:not([disabled])',
            'iframe',
            'object',
            'embed',
            '[contenteditable]',
            'audio[controls]',
            'video[controls]',
            'summary',
            '[tabindex]:not([tabindex="-1"])'
        ].join(',');

        return Array.from(element.querySelectorAll(selector)).filter(el => {
            // 先檢查元素尺寸，避免對明顯不可見元素呼叫 getComputedStyle
            if (el.offsetWidth <= 0 || el.offsetHeight <= 0) {
                return false;
            }

            // 排除隱藏元素（包含 display: none、visibility: hidden、opacity: 0 等情況）
            const style = window.getComputedStyle(el);
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                style.opacity !== '0';
        });
    }
}

// 匯出到全域
window.ModalManager = ModalManager;
