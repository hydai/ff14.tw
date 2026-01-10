/**
 * 通用狀態歷史管理器
 * 用於處理應用程式的 Undo/Redo 功能
 */
class StateHistoryManager {
    static CONSTANTS = {
        DEFAULT_MAX_SIZE: 50
    };

    /**
     * @param {number} maxSize - 最大歷史記錄數量
     */
    constructor(maxSize = StateHistoryManager.CONSTANTS.DEFAULT_MAX_SIZE) {
        this.history = [];
        this.maxSize = maxSize;
    }

    /**
     * 深拷貝函數
     * 優先使用原生 structuredClone API（現代瀏覽器）
     * 支援：Date, Map, Set, RegExp, Array, Object, 循環引用等
     * 不支援：Function, Symbol, WeakMap, WeakSet
     *
     * 瀏覽器相容性：structuredClone 需要 Chrome 98+, Firefox 94+, Safari 15.4+
     * 對於不支援的舊版瀏覽器，會降級使用 JSON 方式（有限制）
     * 警告：在生產環境中，若使用者使用舊版瀏覽器，JSON 方式可能會導致 Date/Map/Set 等特殊類型資料遺失，
     * 或者在處理循環引用時拋出錯誤。建議確保目標使用者群體的瀏覽器版本，或引入 polyfill。
     *
     * @param {any} obj - 要深拷貝的物件
     * @returns {any} 深拷貝後的物件
     * @see https://developer.mozilla.org/en-US/docs/Web/API/structuredClone
     */
    static deepClone(obj) {
        // 優先使用原生 structuredClone（現代、穩健且高效的深拷貝方式）
        // 支援循環引用和更多資料類型
        if (typeof structuredClone === 'function') {
            return structuredClone(obj);
        }

        // 後備方案：在不支援 structuredClone 的舊版瀏覽器中，使用 JSON 方式深拷貝
        // 注意：此方式不支援 Date, Map, Set, RegExp, 函數、Symbol、循環引用等，
        // 並且當物件包含循環引用時，JSON.stringify 會在執行期拋出錯誤（TypeError）
        // 若需要在舊版環境中完整且安全地支援上述類型與循環引用，建議在專案中加入對 structuredClone 的 polyfill
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * 保存當前狀態
     * @param {any} state - 要保存的狀態物件
     */
    push(state) {
        // 使用深拷貝保存狀態，避免參照問題
        // 支援 Date, Map, Set, RegExp, 循環引用等常見類型
        // 注意：不支援函數、Symbol、WeakMap、WeakSet
        const stateCopy = StateHistoryManager.deepClone(state);

        this.history.push(stateCopy);

        // 限制歷史記錄長度
        if (this.history.length > this.maxSize) {
            this.history.shift();
        }
    }

    /**
     * 回復上一步狀態
     * @returns {any|null} 上一步的狀態，如果沒有歷史記錄則返回 null
     */
    pop() {
        if (this.history.length === 0) {
            return null;
        }
        return this.history.pop();
    }

    /**
     * 檢查是否有可回復的歷史記錄
     * @returns {boolean}
     */
    hasHistory() {
        return this.history.length > 0;
    }

    /**
     * 清空歷史記錄
     */
    clear() {
        this.history = [];
    }

    /**
     * 取得當前歷史記錄數量
     * @returns {number}
     */
    size() {
        return this.history.length;
    }
}

// 匯出到全域
window.StateHistoryManager = StateHistoryManager;
