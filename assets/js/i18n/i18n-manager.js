/**
 * FF14.tw 國際化 (i18n) 管理模組
 *
 * 支援語言：繁體中文 (zh)、英文 (en)、日文 (ja)
 * 功能：瀏覽器語言偵測、localStorage 持久化、Fallback Chain、Observer 模式
 */
class I18nManager {
    static CONSTANTS = {
        STORAGE_KEY: 'ff14tw_preferred_language',
        DEFAULT_LANGUAGE: 'zh',
        SUPPORTED_LANGUAGES: ['zh', 'en', 'ja'],
        LANGUAGE_NAMES: {
            zh: '繁體中文',
            en: 'English',
            ja: '日本語'
        },
        // Fallback chain: 找不到翻譯時依序嘗試
        FALLBACK_CHAIN: {
            zh: ['zh'],
            en: ['en', 'zh'],
            ja: ['ja', 'zh']
        },
        // 瀏覽器語言對應表
        BROWSER_LANG_MAP: {
            'zh-TW': 'zh',
            'zh-Hant': 'zh',
            'zh-HK': 'zh',
            'zh': 'zh',
            'en': 'en',
            'en-US': 'en',
            'en-GB': 'en',
            'en-AU': 'en',
            'ja': 'ja',
            'ja-JP': 'ja'
        }
    };

    constructor() {
        this.currentLanguage = this._detectLanguage();
        this.translations = {};
        this.loadedModules = new Set();
        this._observers = [];

        // DOM 載入完成後自動更新頁面語言
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this._initializeLanguageSwitcher();
                this.updatePageLanguage();
            });
        } else {
            // DOM 已載入完成，直接執行
            this._initializeLanguageSwitcher();
            this.updatePageLanguage();
        }

        // 監聽動態載入的佈局元件
        // 因為 LayoutLoader 可能在 I18nManager 之後才建立語言切換器
        document.addEventListener('layoutLoaded', () => {
            this._initializeLanguageSwitcher();
            this.updatePageLanguage();
        });
    }

    /**
     * 偵測初始語言偏好
     * 優先順序：localStorage > 瀏覽器語言 > 預設語言
     */
    _detectLanguage() {
        // 1. 檢查 localStorage
        const stored = localStorage.getItem(I18nManager.CONSTANTS.STORAGE_KEY);
        if (stored && I18nManager.CONSTANTS.SUPPORTED_LANGUAGES.includes(stored)) {
            return stored;
        }

        // 2. 檢查瀏覽器語言（優先使用 languages 陣列以更準確匹配使用者偏好）
        const langMap = I18nManager.CONSTANTS.BROWSER_LANG_MAP;
        const browserLanguages = navigator.languages || [navigator.language || navigator.userLanguage];

        for (const lang of browserLanguages) {
            if (!lang) continue;

            // 嘗試完整匹配 (如 zh-TW)
            if (langMap[lang]) {
                return langMap[lang];
            }

            // 嘗試主語言碼匹配 (如 zh)
            const primaryLang = lang.split('-')[0];
            if (langMap[primaryLang]) {
                return langMap[primaryLang];
            }
        }

        return I18nManager.CONSTANTS.DEFAULT_LANGUAGE;
    }

    /**
     * 初始化語言切換器事件
     */
    _initializeLanguageSwitcher() {
        const switcher = document.querySelector('.language-switcher');
        if (!switcher) return;

        switcher.addEventListener('click', (e) => {
            const btn = e.target.closest('.language-btn');
            if (!btn) return;

            const lang = btn.dataset.lang;
            if (lang && I18nManager.CONSTANTS.SUPPORTED_LANGUAGES.includes(lang)) {
                this.setLanguage(lang);
            }
        });

        // 設定初始 active 狀態
        this._updateLanguageSwitcherUI();
    }

    /**
     * 載入翻譯模組
     * @param {string} moduleName - 模組名稱
     * @param {Object} translations - 翻譯物件 { zh: {...}, en: {...}, ja: {...} }
     */
    loadTranslations(moduleName, translations) {
        if (this.loadedModules.has(moduleName)) {
            return;
        }

        for (const lang of I18nManager.CONSTANTS.SUPPORTED_LANGUAGES) {
            if (!this.translations[lang]) {
                this.translations[lang] = {};
            }
            if (translations[lang]) {
                Object.assign(this.translations[lang], translations[lang]);
            }
        }
        this.loadedModules.add(moduleName);
    }

    /**
     * 取得當前語言
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * 設定語言
     * @param {string} lang - 語言代碼 (zh, en, ja)
     * @returns {boolean} 是否設定成功
     */
    setLanguage(lang) {
        if (!I18nManager.CONSTANTS.SUPPORTED_LANGUAGES.includes(lang)) {
            console.warn(`[i18n] 不支援的語言: ${lang}`);
            return false;
        }

        this.currentLanguage = lang;
        localStorage.setItem(I18nManager.CONSTANTS.STORAGE_KEY, lang);

        // 更新 HTML lang 屬性
        document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang;

        this.updatePageLanguage();
        this._notifyObservers();
        return true;
    }

    /**
     * 取得翻譯文字（支援 Fallback Chain）
     * @param {string} key - 翻譯鍵值
     * @param {...any} args - 參數替換值
     * @returns {string} 翻譯後的文字
     */
    getText(key, ...args) {
        const fallbackChain = I18nManager.CONSTANTS.FALLBACK_CHAIN[this.currentLanguage];

        let text = null;
        for (const lang of fallbackChain) {
            if (this.translations[lang]?.[key] !== undefined) {
                text = this.translations[lang][key];
                break;
            }
        }

        if (text === null) {
            // 開發模式下顯示警告
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(`[i18n] 找不到翻譯鍵值: ${key}`);
            }
            return key;
        }

        // 支援 {0}, {1} 參數替換
        if (args.length > 0) {
            text = text.replace(/\{(\d+)\}/g, (match, index) =>
                args[index] !== undefined ? args[index] : match
            );
        }

        return text;
    }

    /**
     * 格式化帶參數的文字（getText 的別名）
     */
    format(key, ...args) {
        return this.getText(key, ...args);
    }

    /**
     * 更新頁面上所有標記的元素
     */
    updatePageLanguage() {
        // 更新頁面標題（如果有 data-i18n-title 屬性）
        const pageTitleKey = document.documentElement.dataset.i18nTitle;
        if (pageTitleKey) {
            const translatedTitle = this.getText(pageTitleKey);
            document.title = translatedTitle !== pageTitleKey
                ? `${translatedTitle} - FF14.tw`
                : document.title;
        }

        // 更新所有 data-i18n 元素
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.dataset.i18n;
            const attr = element.dataset.i18nAttr;
            const text = this.getText(key);

            if (attr) {
                // 更新指定屬性（placeholder, title, aria-label 等）
                element.setAttribute(attr, text);
            } else {
                // 更新文字內容
                element.textContent = text;
            }
        });

        // 處理 data-i18n-html（需要保留子元素如圖標及其事件監聽器）
        document.querySelectorAll('[data-i18n-html]').forEach(element => {
            const key = element.dataset.i18nHtml;
            const text = this.getText(key);

            // 尋找最後一個非空的文字節點進行更新，以避免破壞子元素及其事件監聽器
            let textNode = null;
            for (let i = element.childNodes.length - 1; i >= 0; i--) {
                const node = element.childNodes[i];
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    textNode = node;
                    break;
                }
            }

            if (textNode) {
                // 保留文字節點前的空白字元
                const space = textNode.textContent.match(/^\s*/)[0] || ' ';
                textNode.textContent = space + text;
            } else {
                // 如果找不到文字節點，作為 fallback，在圖標後附加文字
                const iconElement = element.querySelector('.btn-icon');
                if (iconElement) {
                    element.appendChild(document.createTextNode(' ' + text));
                } else {
                    element.textContent = text;
                }
            }
        });

        // 更新語言切換器 UI
        this._updateLanguageSwitcherUI();
    }

    /**
     * 更新語言切換器按鈕狀態
     */
    _updateLanguageSwitcherUI() {
        document.querySelectorAll('.language-btn').forEach(btn => {
            const isActive = btn.dataset.lang === this.currentLanguage;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive.toString());
        });
    }

    /**
     * 訂閱語言變更事件
     * @param {Function} callback - 回調函數，接收新語言代碼
     * @returns {Function} 取消訂閱函數
     */
    onLanguageChange(callback) {
        this._observers.push(callback);
        return () => {
            this._observers = this._observers.filter(cb => cb !== callback);
        };
    }

    /**
     * 通知所有訂閱者語言已變更
     */
    _notifyObservers() {
        this._observers.forEach(callback => {
            try {
                callback(this.currentLanguage);
            } catch (error) {
                console.error('[i18n] Observer callback error:', error);
            }
        });
    }

    /**
     * 取得所有支援的語言
     */
    getSupportedLanguages() {
        return [...I18nManager.CONSTANTS.SUPPORTED_LANGUAGES];
    }

    /**
     * 取得語言顯示名稱
     * @param {string} lang - 語言代碼
     */
    getLanguageName(lang) {
        return I18nManager.CONSTANTS.LANGUAGE_NAMES[lang] || lang;
    }

    /**
     * 檢查翻譯鍵值是否存在
     * @param {string} key - 翻譯鍵值
     */
    hasKey(key) {
        const fallbackChain = I18nManager.CONSTANTS.FALLBACK_CHAIN[this.currentLanguage];
        for (const lang of fallbackChain) {
            if (this.translations[lang]?.[key] !== undefined) {
                return true;
            }
        }
        return false;
    }
}

// 建立全域 i18n 實例
window.i18n = new I18nManager();
