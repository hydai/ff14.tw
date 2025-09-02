// i18n 國際化模組
class I18n {
    static CONSTANTS = {
        STORAGE_KEY: 'ff14tw_language',
        DEFAULT_LANG: 'zh-TW',
        SUPPORTED_LANGS: [
            { 
                code: 'zh-TW', 
                locale: 'zh-TW', 
                prefixes: ['zh-TW', 'zh-Hant', 'zh-HK', 'zh-MO', 'zh-CN', 'zh'] 
            },
            { 
                code: 'ja', 
                locale: 'ja-JP', 
                prefixes: ['ja'] 
            },
            { 
                code: 'en', 
                locale: 'en-US', 
                prefixes: ['en'] 
            }
        ],
        DATA_ATTRIBUTE: 'data-i18n',
        DATA_PLACEHOLDER: 'data-i18n-placeholder',
        DATA_TITLE: 'data-i18n-title',
        PARAM_REGEX: /\{(\w+)\}/g
    };

    constructor() {
        this.currentLang = this.loadLanguagePreference();
        this.translations = {};
        this.observers = [];
    }

    /**
     * 初始化 i18n 系統
     */
    async init() {
        try {
            await this.loadTranslations();
            this.setupLanguageSwitcher();
            this.translatePage();
            this.observeDOM();
        } catch (error) {
            console.error('i18n 初始化失敗:', error);
        }
    }

    /**
     * 載入語言偏好設定
     */
    loadLanguagePreference() {
        const saved = localStorage.getItem(I18n.CONSTANTS.STORAGE_KEY);
        if (saved && I18n.CONSTANTS.SUPPORTED_LANGS.some(lang => lang.code === saved)) {
            return saved;
        }
        
        // 嘗試從瀏覽器語言設定自動偵測（使用 languages 陣列以獲得更精準的偏好）
        const browserLangs = navigator.languages || [navigator.language || navigator.userLanguage];

        for (const browserLang of browserLangs) {
            const matchedLang = I18n.CONSTANTS.SUPPORTED_LANGS.find(config => 
                config.prefixes.some(prefix => browserLang.startsWith(prefix))
            );
            if (matchedLang) {
                return matchedLang.code;
            }
        }
        
        return I18n.CONSTANTS.DEFAULT_LANG;
    }

    /**
     * 儲存語言偏好設定
     */
    saveLanguagePreference(lang) {
        localStorage.setItem(I18n.CONSTANTS.STORAGE_KEY, lang);
    }

    /**
     * 載入翻譯檔案
     */
    async loadTranslations() {
        try {
            const response = await fetch('translations.json');
            if (!response.ok) {
                throw new Error('載入翻譯檔案失敗');
            }
            this.translations = await response.json();
        } catch (error) {
            console.error('載入翻譯失敗:', error);
            // 如果載入失敗，使用空的翻譯物件
            this.translations = {};
        }
    }

    /**
     * 設置語言切換器
     */
    setupLanguageSwitcher() {
        const switcher = document.getElementById('languageSwitcher');
        if (!switcher) return;

        // 設置當前語言
        switcher.value = this.currentLang;

        // 監聽語言切換事件
        switcher.addEventListener('change', (e) => {
            this.changeLanguage(e.target.value);
        });
    }

    /**
     * 切換語言
     */
    changeLanguage(lang) {
        if (!I18n.CONSTANTS.SUPPORTED_LANGS.some(supportedLang => supportedLang.code === lang)) {
            console.error('不支援的語言:', lang);
            return;
        }

        this.currentLang = lang;
        this.saveLanguagePreference(lang);
        // 由 'languageChanged' 事件觸發頁面翻譯，避免重複執行
        
        // 觸發自訂事件，讓其他模組知道語言已變更
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    }

    /**
     * 私有方法：遍歷翻譯物件以取得翻譯值
     * @private
     * @param {string} lang - 語言代碼
     * @param {Array<string>} keys - 鍵值路徑陣列
     * @returns {*} 翻譯值或 undefined
     */
    _getTranslation(lang, keys) {
        if (!this.translations[lang]) {
            return undefined;
        }
        return keys.reduce((obj, key) => {
            return (obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key)) ? obj[key] : undefined;
        }, this.translations[lang]);
    }

    /**
     * 取得翻譯文字
     * @param {string} key - 翻譯鍵值
     * @param {Object} params - 參數物件
     * @returns {string} 翻譯後的文字
     */
    t(key, params = {}) {
        const keys = key.split('.');
        let value = this._getTranslation(this.currentLang, keys);

        if (value === undefined) {
            value = this._getTranslation(I18n.CONSTANTS.DEFAULT_LANG, keys);
        }

        // 如果仍然找不到，回傳鍵值
        if (value === undefined) {
            console.warn(`找不到翻譯: ${key}`);
            return key;
        }

        // 替換參數
        if (params && typeof value === 'string') {
            value = value.replace(I18n.CONSTANTS.PARAM_REGEX, (match, paramName) => 
                Object.prototype.hasOwnProperty.call(params, paramName) ? params[paramName] : match
            );
        }

        return value;
    }

    /**
     * 取得備用翻譯
     */
    getFallback(key) {
        const keys = key.split('.');
        return this._getTranslation(I18n.CONSTANTS.DEFAULT_LANG, keys) ?? null;
    }

    /**
     * 檢查翻譯鍵值是否存在
     * @param {string} key - 翻譯鍵值
     * @returns {boolean} 是否存在
     */
    hasTranslationKey(key) {
        const keys = key.split('.');
        return this._getTranslation(this.currentLang, keys) !== undefined;
    }

    /**
     * 翻譯整個頁面
     */
    translatePage() {
        // 合併查詢所有需要翻譯的元素
        const selector = [
            `[${I18n.CONSTANTS.DATA_ATTRIBUTE}]`,
            `[${I18n.CONSTANTS.DATA_PLACEHOLDER}]`,
            `[${I18n.CONSTANTS.DATA_TITLE}]`
        ].join(',');

        // 只翻譯單一節點，避免重複翻譯子元素
        document.querySelectorAll(selector).forEach(element => {
            this.translateNode(element);
        });

        // 更新頁面標題
        if (this.translations[this.currentLang]?.page?.title) {
            document.title = this.translations[this.currentLang].page.title;
        }
    }

    /**
     * 觀察 DOM 變化並自動翻譯新元素
     */
    observeDOM() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { // Element node
                            this.translateElement(node);
                        }
                    });
                } else if (mutation.type === 'attributes') {
                    // 當屬性變化時只翻譯該節點本身
                    this.translateNode(mutation.target);
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                I18n.CONSTANTS.DATA_ATTRIBUTE,
                I18n.CONSTANTS.DATA_PLACEHOLDER,
                I18n.CONSTANTS.DATA_TITLE
            ]
        });

        this.observers.push(observer);
    }

    /**
     * 翻譯單個節點（不包括子元素）
     */
    translateNode(node) {
        // Helper function 來安全地設置文字內容，避免覆蓋子元素
        // 注意：此函式只更新第一個文字節點。對於複雜的 HTML 結構（如包含多個文字節點），
        // 可能需要更精確的定位方式。目前的實作適用於當前的 HTML 結構。
        // 未來若需處理複雜結構，建議為需要翻譯的文字包裹特定的 <span> 標籤。
        const applyTextContent = (el, text) => {
            // 如果元素沒有子元素，可以安全地替換整個內容
            if (el.children.length === 0) {
                el.textContent = text;
                return;
            }

            // 如果有子元素，尋找第一個非空白的文字節點並替換它
            for (const node of el.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    node.textContent = text;
                    return;
                }
            }

            // 如果沒有找到非空白的文字節點，附加新的文字節點
            // 這是一個安全的備用方案
            el.appendChild(document.createTextNode(text));
        };

        const key = node.getAttribute?.(I18n.CONSTANTS.DATA_ATTRIBUTE);
        if (key) {
            applyTextContent(node, this.t(key));
        }

        const placeholderKey = node.getAttribute?.(I18n.CONSTANTS.DATA_PLACEHOLDER);
        if (placeholderKey) {
            node.placeholder = this.t(placeholderKey);
        }

        const titleKey = node.getAttribute?.(I18n.CONSTANTS.DATA_TITLE);
        if (titleKey) {
            node.title = this.t(titleKey);
        }
    }

    /**
     * 翻譯元素及其所有子孫元素（用於 MutationObserver）
     */
    translateElement(element) {
        // 翻譯元素本身
        this.translateNode(element);

        // 也翻譯其子孫元素
        const selector = [
            `[${I18n.CONSTANTS.DATA_ATTRIBUTE}]`,
            `[${I18n.CONSTANTS.DATA_PLACEHOLDER}]`,
            `[${I18n.CONSTANTS.DATA_TITLE}]`
        ].join(',');
        
        element.querySelectorAll(selector).forEach(node => {
            this.translateNode(node);
        });
    }

    /**
     * 取得當前語言設定
     * @private
     * @returns {Object|undefined} 語言設定物件
     */
    _getCurrentLangConfig() {
        return I18n.CONSTANTS.SUPPORTED_LANGS.find(lang => lang.code === this.currentLang);
    }

    /**
     * 處理單複數形式
     * @param {string} key - 基礎翻譯鍵值
     * @param {number} count - 數量
     * @param {Object} params - 額外參數
     * @returns {string} 翻譯後的文字
     */
    plural(key, count, params = {}) {
        let i18nKey = key;
        // 英文需要處理單複數形式
        if (this.currentLang === 'en') {
            const langConfig = this._getCurrentLangConfig();
            const locale = langConfig?.locale || 'en-US'; // Fallback to a sensible default for English
            const pluralCategory = new Intl.PluralRules(locale).select(count); // "one" or "other"
            const potentialKey = `${key}_${pluralCategory}`;
            
            // 檢查複數鍵是否存在，若不存在則回退到基礎鍵
            if (this.hasTranslationKey(potentialKey)) {
                i18nKey = potentialKey;
            }
        }
        // 將 count 加入參數中，以便在翻譯中使用
        return this.t(i18nKey, { ...params, count });
    }

    /**
     * 格式化數字（根據語言）
     */
    formatNumber(number) {
        const langConfig = this._getCurrentLangConfig();
        const defaultLangConfig = I18n.CONSTANTS.SUPPORTED_LANGS.find(lang => lang.code === I18n.CONSTANTS.DEFAULT_LANG);
        const locale = langConfig?.locale || defaultLangConfig?.locale || I18n.CONSTANTS.DEFAULT_LANG;

        return new Intl.NumberFormat(locale).format(number);
    }

    /**
     * 取得當前語言
     */
    getCurrentLanguage() {
        return this.currentLang;
    }

    /**
     * 清理觀察器
     */
    destroy() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
    }
}

// 建立全域 i18n 實例
const i18n = new I18n();

// 匯出給其他模組使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = i18n;
}