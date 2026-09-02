/**
 * 通用模態視窗 (Modal/Popup) 管理器
 * 統一處理顯示/隱藏、焦點管理 (Focus Trap)、ESC 關閉、背景點擊關閉等行為
 *
 * 關於堆疊：全站所有 ModalManager 實例共用一個靜態堆疊 ModalManager._stack。
 * 每個實例一次仍只管理一個視窗（activeModal），但不同實例的視窗可以互相疊加
 * （例如寶圖搜尋器：我的清單面板 → 路線面板 → 格式面板）。堆疊有三個作用：
 *   1. 整個堆疊只掛「一個」document keydown 監聽器，事件永遠只分派給最上層，
 *      不會發生一次 Escape 把好幾層一起關掉；
 *   2. 焦點陷阱只在最上層生效，下層的 Tab 循環自動讓位；
 *   3. hide() 一個不在最上層的視窗時，會由上而下連鎖關閉疊在它上面的每一層，
 *      焦點依序回捲到各層開啟前的觸發元素；
 *   4. 新視窗推上堆疊時，原本的最上層會被設為 inert（滑鼠、焦點與無障礙樹都
 *      碰不到），重新成為最上層時解除。
 */
class ModalManager {
    /** 目前開著的 ModalManager 實例，最後推入的在最上層 */
    static _stack = [];

    /** 整個堆疊共用的 document keydown 監聽器（堆疊非空時才存在） */
    static _boundStackKeyDown = null;

    /**
     * 堆疊最上層的實例；堆疊為空時回傳 null。
     * 工具端在「自己的遮罩被點到、但自己的視窗被別的視窗疊住」時，用它決定該關哪一層
     * @returns {ModalManager|null}
     */
    static topmost() {
        return ModalManager._stack.length > 0 ? ModalManager._stack[ModalManager._stack.length - 1] : null;
    }

    /**
     * 把實例推上堆疊頂端；第一個進入堆疊時掛上共用的 keydown 監聽器
     * @private
     */
    static _pushToStack(manager) {
        const index = ModalManager._stack.indexOf(manager);
        if (index !== -1) {
            ModalManager._stack.splice(index, 1);
        }

        // 原本的最上層退居下層：設為 inert，滑鼠、焦點與無障礙樹都碰不到它。
        // 堆疊只分派鍵盤事件，若不擋掉指標事件，使用者可以點到露在新視窗外的
        // 下層控制項（例如清單面板露在路線面板旁邊的按鈕），把整疊連鎖收掉。
        // 注意 inert 只涵蓋 activeModal 自己的子樹；像清單面板的遮罩 #panelOverlay 這種
        // 手足元素不受影響，其點擊處理要自行用 ModalManager.topmost() 判斷（見 toggleListPanel）
        const previousTop = ModalManager._stack[ModalManager._stack.length - 1];
        if (previousTop && previousTop.activeModal) {
            previousTop.activeModal.inert = true;
        }
        ModalManager._stack.push(manager);

        if (!ModalManager._boundStackKeyDown) {
            ModalManager._boundStackKeyDown = (event) => {
                const top = ModalManager._stack[ModalManager._stack.length - 1];
                if (top) {
                    top._handleKeyDown(event);
                }
            };
            document.addEventListener('keydown', ModalManager._boundStackKeyDown);
        }
    }

    /**
     * 把實例移出堆疊；堆疊清空時拆掉共用的 keydown 監聽器
     * @private
     */
    static _removeFromStack(manager) {
        const index = ModalManager._stack.indexOf(manager);
        if (index !== -1) {
            ModalManager._stack.splice(index, 1);
        }

        // 新的最上層恢復可互動；hide() 會在這之後才把焦點還給下層視窗內的元素，
        // 所以必須先解除 inert
        const newTop = ModalManager._stack[ModalManager._stack.length - 1];
        if (newTop && newTop.activeModal) {
            newTop.activeModal.inert = false;
        }
        if (ModalManager._stack.length === 0 && ModalManager._boundStackKeyDown) {
            document.removeEventListener('keydown', ModalManager._boundStackKeyDown);
            ModalManager._boundStackKeyDown = null;
        }
    }

    constructor() {
        this.activeModal = null;
        this.previousFocus = null;
        this.options = {};

        // 綁定事件處理器以保持 context
        // （keydown 不再由各實例自己掛，改由 ModalManager._boundStackKeyDown 統一分派）
        this._boundHandleOverlayClick = this._handleOverlayClick.bind(this);
    }

    /**
     * 顯示模態視窗
     *
     * 關於事件監聽器生命週期：
     * 對於模態視窗內部的關閉按鈕（如 closeBtn），建議在調用 show 方法前（或在封裝組件的初始化階段）添加事件監聽器，
     * 並在 onClose 回調中移除該監聽器。這樣可以確保事件監聽器的生命週期與模態視窗的顯示狀態一致，
     * 避免重複綁定或內存洩漏，同時保持 ModalManager 的職責單純（只負責通用的模態行為）。
     *
     * 關於 ARIA：本方法不會動任何 ARIA 屬性。
     * role="dialog"、aria-modal="true"、aria-labelledby 一律寫在 HTML 的遮罩層元素上
     * （也就是傳進來的 element），內層的 .dialog 盒子維持沒有 role 的一般容器。
     *
     * 關於堆疊：本方法只會主動關閉「同一個實例」原本開著的視窗；不過關閉它時會走
     * hide() 的連鎖規則，疊在它上面的其他實例視窗也會由上而下一併收掉。
     * 別的實例開在它「下面」的視窗不受影響，新視窗會疊在它們上面
     * （見 ModalManager._stack 的說明）。疊加時請自行確保 CSS 的 z-index 由下而上遞增。
     * 若傳入的 element 就是本實例目前開著的視窗，本方法會直接 return、不會更新 options
     * （含 onClose）；需要換設定時請先 hide() 再 show()。
     *
     * @param {HTMLElement} element - 模態視窗的 DOM 元素（遮罩層，需自帶 role="dialog" 等 ARIA 屬性）
     * @param {Object} options - 設定選項
     * @param {Function} [options.onClose] - 關閉時的回調函數
     * @param {boolean} [options.closeOnOverlayClick=true] - 是否允許點擊背景關閉
     * @param {boolean} [options.closeOnEsc=true] - 是否允許按 ESC 關閉（只在本視窗位於堆疊最上層時生效）
     * @param {string|null} [options.useClass='active'] - 用於控制顯示的 CSS class，若為 null 則操作 style.display
     * @param {string} [options.displayStyle='flex'] - 若不使用 class，則設定 style.display 的值
     * @param {boolean} [options.focusTrap=true] - 是否啟用焦點陷阱 (Tab 循環)；關閉時 Tab 可以自由離開視窗，但「開啟時把焦點移入視窗」一律會執行
     */
    show(element, options = {}) {
        // 同一個實例一次只管理一個視窗；換視窗時先關掉舊的
        // （跨實例不互相關閉——那是堆疊要處理的事）
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

        // 推上堆疊（第一層會順便掛上共用的 document keydown 監聽器）
        ModalManager._pushToStack(this);

        if (this.options.closeOnOverlayClick) {
            element.addEventListener('click', this._boundHandleOverlayClick);
        }

        // 處理焦點：不論是否啟用焦點陷阱，開啟視窗都要把焦點移進去
        // （focusTrap 只決定 Tab 會不會被關在裡面，不決定初始焦點）
        this._setInitialFocus(element);
    }

    /**
     * 隱藏當前模態視窗
     *
     * 若本視窗不在堆疊最上層（上面還疊著別的視窗），會先由上而下把疊在它上面的
     * 每一層都關掉，再關自己。每一層各自把焦點還給自己開啟前的觸發元素，
     * 因此焦點會一路回捲到最初的那顆按鈕。
     */
    hide() {
        if (!this.activeModal) return;

        // 連鎖關閉疊在自己上面的每一層。onClose 回調有可能再動堆疊，
        // 因此每一圈重新查索引；guard 是防呆上限，避免任何情況下的無窮迴圈。
        // 萬一預算用盡（正常情況不會發生：只有 onClose 不斷推入新視窗才可能），
        // 迴圈直接停手、繼續往下關自己：後面的 _removeFromStack(this) 只會把自己
        // 移出堆疊，還沒關掉的上層仍留在堆疊上、也仍然是接收 Escape 的那一層。
        let guard = ModalManager._stack.length + 1;
        while (guard-- > 0) {
            const stack = ModalManager._stack;
            const index = stack.indexOf(this);
            if (index === -1 || index === stack.length - 1) break;
            const top = stack[stack.length - 1];
            top.hide();
            // 上層的 hide() 沒有把自己移出堆疊時中止（理論上不會發生）
            if (ModalManager._stack[ModalManager._stack.length - 1] === top) break;
        }

        const element = this.activeModal;
        const onClose = this.options.onClose;

        // 隱藏元素
        if (this.options.useClass) {
            element.classList.remove(this.options.useClass);
        } else {
            element.style.display = 'none';
        }

        // 移出堆疊（最後一層離開時拆掉共用的 keydown 監聽器）
        ModalManager._removeFromStack(this);
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
     * 只會由 ModalManager._boundStackKeyDown 對「堆疊最上層」的實例呼叫；
     * 下面那道防呆是為了擋掉任何外部直接呼叫的情況。
     */
    _handleKeyDown(e) {
        if (!this.activeModal) return;
        if (ModalManager._stack[ModalManager._stack.length - 1] !== this) return;

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

// 匯出到全域（瀏覽器）與 module（Node 測試），比照 tools/timed-gathering/time-calculator.js
if (typeof window !== 'undefined') {
    window.ModalManager = ModalManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModalManager;
}
