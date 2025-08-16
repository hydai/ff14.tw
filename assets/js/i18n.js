// Global i18n Module for FF14.tw
// Provides multi-language support across all tools and pages

class I18nManager {
    static CONSTANTS = {
        STORAGE_KEY: 'ff14tw_preferred_language',
        DEFAULT_LANGUAGE: 'zh-TW',
        SUPPORTED_LANGUAGES: ['zh-TW', 'ja', 'en'],
        TRANSLATIONS_PATH: '/assets/i18n/',
        CACHE_PREFIX: 'ff14tw_i18n_cache_',
        CACHE_VERSION: '1.0.0'
    };

    constructor() {
        this.currentLanguage = this.detectLanguage();
        this.translations = {};
        this.loadedModules = new Set();
        this.observers = [];
        this.isInitialized = false;
    }

    /**
     * Detect user's preferred language
     * Priority: localStorage > URL param > browser > default
     */
    detectLanguage() {
        // Check localStorage
        const stored = localStorage.getItem(I18nManager.CONSTANTS.STORAGE_KEY);
        if (stored && I18nManager.CONSTANTS.SUPPORTED_LANGUAGES.includes(stored)) {
            return stored;
        }

        // Check URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        if (urlLang && I18nManager.CONSTANTS.SUPPORTED_LANGUAGES.includes(urlLang)) {
            return urlLang;
        }

        // Check browser language
        const browserLang = navigator.language || navigator.userLanguage;
        if (browserLang) {
            // Map browser languages to our supported languages
            if (browserLang.startsWith('zh')) {
                return 'zh-TW';
            } else if (browserLang.startsWith('ja')) {
                return 'ja';
            } else if (browserLang.startsWith('en')) {
                return 'en';
            }
        }

        return I18nManager.CONSTANTS.DEFAULT_LANGUAGE;
    }

    /**
     * Initialize i18n with required translation modules
     * @param {Array} modules - Array of module names to load (e.g., ['common', 'tools/dungeon-database'])
     */
    async init(modules = ['common']) {
        try {
            // Always load common translations
            if (!modules.includes('common')) {
                modules.unshift('common');
            }

            // Load all required translation modules
            await Promise.all(modules.map(module => this.loadTranslations(module)));
            
            this.isInitialized = true;
            
            // Update page language after initialization
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.updatePageLanguage();
                });
            } else {
                this.updatePageLanguage();
            }

            return true;
        } catch (error) {
            console.error('Failed to initialize i18n:', error);
            return false;
        }
    }

    /**
     * Load translations for a specific module
     * @param {string} module - Module name (e.g., 'common', 'tools/dungeon-database')
     */
    async loadTranslations(module) {
        if (this.loadedModules.has(module)) {
            return; // Already loaded
        }

        const cacheKey = `${I18nManager.CONSTANTS.CACHE_PREFIX}${module}_${I18nManager.CONSTANTS.CACHE_VERSION}`;
        
        // Try to load from cache first
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                this.mergeTranslations(data);
                this.loadedModules.add(module);
                return;
            } catch (e) {
                // Cache corrupted, remove it
                localStorage.removeItem(cacheKey);
            }
        }

        // Load from file
        try {
            const response = await fetch(`${I18nManager.CONSTANTS.TRANSLATIONS_PATH}${module}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load translations for ${module}`);
            }
            
            const data = await response.json();
            this.mergeTranslations(data);
            this.loadedModules.add(module);
            
            // Cache the translations
            try {
                localStorage.setItem(cacheKey, JSON.stringify(data));
            } catch (e) {
                // Storage might be full, ignore caching error
                console.warn('Failed to cache translations:', e);
            }
        } catch (error) {
            console.error(`Failed to load translations for ${module}:`, error);
            // Continue with default language
        }
    }

    /**
     * Merge loaded translations into the main translations object
     * @param {Object} data - Translation data object
     */
    mergeTranslations(data) {
        for (const lang of I18nManager.CONSTANTS.SUPPORTED_LANGUAGES) {
            if (!this.translations[lang]) {
                this.translations[lang] = {};
            }
            if (data[lang]) {
                Object.assign(this.translations[lang], data[lang]);
            }
        }
    }

    /**
     * Get current language
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Set language and update page
     * @param {string} lang - Language code
     */
    setLanguage(lang) {
        if (!I18nManager.CONSTANTS.SUPPORTED_LANGUAGES.includes(lang)) {
            console.warn(`Unsupported language: ${lang}`);
            return;
        }

        this.currentLanguage = lang;
        localStorage.setItem(I18nManager.CONSTANTS.STORAGE_KEY, lang);
        
        // Update HTML lang attribute
        document.documentElement.lang = lang === 'zh-TW' ? 'zh-Hant' : lang;
        
        // Update page content
        this.updatePageLanguage();
        
        // Notify observers
        this.notifyObservers(lang);
    }

    /**
     * Get translated text
     * @param {string} key - Translation key
     * @param {Object} params - Parameters for template replacement
     */
    t(key, params = {}) {
        // Try current language first
        let text = this.getNestedProperty(this.translations[this.currentLanguage], key);
        
        // Fallback to default language
        if (!text && this.currentLanguage !== I18nManager.CONSTANTS.DEFAULT_LANGUAGE) {
            text = this.getNestedProperty(this.translations[I18nManager.CONSTANTS.DEFAULT_LANGUAGE], key);
        }
        
        // Fallback to key itself
        if (!text) {
            console.warn(`Missing translation for key: ${key}`);
            return key;
        }
        
        // Replace template variables
        return this.replaceTemplates(text, params);
    }

    /**
     * Alias for t() method for backward compatibility
     * Used by timed-gathering tool
     * @param {string} key - Translation key
     * @param {Object} params - Parameters for template replacement
     */
    getText(key, params = {}) {
        return this.t(key, params);
    }

    /**
     * Get nested property from object using dot notation
     * @param {Object} obj - Object to search
     * @param {string} path - Dot-separated path
     */
    getNestedProperty(obj, path) {
        if (!obj) return null;
        
        const keys = path.split('.');
        let result = obj;
        
        for (const key of keys) {
            if (result && typeof result === 'object' && key in result) {
                result = result[key];
            } else {
                return null;
            }
        }
        
        return result;
    }

    /**
     * Replace template variables in text
     * @param {string} text - Text with templates
     * @param {Object} params - Parameters to replace
     */
    replaceTemplates(text, params) {
        // Support ${variable} syntax
        text = text.replace(/\$\{(\w+)\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
        
        // Also support {0}, {1} indexed syntax for backward compatibility
        text = text.replace(/\{(\d+)\}/g, (match, index) => {
            const args = Array.isArray(params) ? params : Object.values(params);
            return args[index] !== undefined ? args[index] : match;
        });
        
        return text;
    }

    /**
     * Helper method to set HTML content safely in an element
     * @param {HTMLElement} element - The element to update
     * @param {string} htmlString - The HTML string to set
     */
    _setElementHtml(element, htmlString) {
        if (htmlString && htmlString.includes('<')) {
            // Parse HTML safely using DOMParser
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            
            // Clear the element
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
            
            // Move parsed content safely with basic sanitization
            const fragment = document.createDocumentFragment();
            Array.from(doc.body.childNodes).forEach(node => {
                // Basic sanitization to prevent script execution
                if (node.nodeName.toLowerCase() !== 'script') {
                    fragment.appendChild(node.cloneNode(true));
                }
            });
            element.appendChild(fragment);
        } else {
            // Plain text content
            element.textContent = htmlString;
        }
    }

    /**
     * Update all elements on the page with translations
     */
    updatePageLanguage() {
        if (!this.isInitialized) return;

        // Update page title if it has a translation key
        const titleElement = document.querySelector('title[data-i18n]');
        if (titleElement) {
            const key = titleElement.dataset.i18n;
            titleElement.textContent = this.t(key);
        }

        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.dataset.i18n;
            const attr = element.dataset.i18nAttr;
            
            if (attr) {
                // Update attribute (e.g., placeholder, title, alt)
                element.setAttribute(attr, this.t(key));
            } else if (element.tagName !== 'TITLE') {
                // Update text content (skip title tag as it's handled above)
                element.textContent = this.t(key);
            }
        });

        // Update elements with data-i18n-html (supports HTML within text)
        document.querySelectorAll('[data-i18n-html]').forEach(element => {
            const key = element.dataset.i18nHtml;
            let text;
            
            // For elements with parameters
            if (element.dataset.i18nParams) {
                try {
                    const params = JSON.parse(element.dataset.i18nParams);
                    text = this.t(key, params);
                } catch (e) {
                    console.error('Failed to parse i18n params:', e);
                    text = this.t(key); // Fallback
                }
            } else {
                text = this.t(key);
            }
            
            // Set element content using helper method
            this._setElementHtml(element, text);
        });

        // Update any dynamic content that might have been added
        this.updateDynamicContent();
    }

    /**
     * Update dynamically generated content
     * This method can be extended by specific tools
     */
    updateDynamicContent() {
        // Dispatch custom event for tools to handle their dynamic content
        document.dispatchEvent(new CustomEvent('i18n:languageChanged', {
            detail: { language: this.currentLanguage }
        }));
    }

    /**
     * Register an observer for language changes
     * @param {Function} callback - Callback function
     */
    observe(callback) {
        if (typeof callback === 'function') {
            this.observers.push(callback);
        }
    }

    /**
     * Notify all observers of language change
     * @param {string} lang - New language
     */
    notifyObservers(lang) {
        this.observers.forEach(callback => {
            try {
                callback(lang);
            } catch (error) {
                console.error('Error in i18n observer:', error);
            }
        });
    }

    /**
     * Format date according to current locale
     * @param {Date} date - Date object
     * @param {string} format - Format type ('short', 'long', 'time')
     */
    formatDate(date, format = 'short') {
        const locale = this.currentLanguage === 'zh-TW' ? 'zh-TW' : this.currentLanguage;
        
        const options = {
            short: { year: 'numeric', month: '2-digit', day: '2-digit' },
            long: { year: 'numeric', month: 'long', day: 'numeric' },
            time: { hour: '2-digit', minute: '2-digit', second: '2-digit' }
        };
        
        return new Intl.DateTimeFormat(locale, options[format] || options.short).format(date);
    }

    /**
     * Format number according to current locale
     * @param {number} number - Number to format
     * @param {Object} options - Intl.NumberFormat options
     */
    formatNumber(number, options = {}) {
        const locale = this.currentLanguage === 'zh-TW' ? 'zh-TW' : this.currentLanguage;
        return new Intl.NumberFormat(locale, options).format(number);
    }

    /**
     * Get all available languages
     */
    getAvailableLanguages() {
        return I18nManager.CONSTANTS.SUPPORTED_LANGUAGES.map(lang => ({
            code: lang,
            name: this.getLanguageName(lang),
            native: this.getLanguageNativeName(lang)
        }));
    }

    /**
     * Get language display name
     * @param {string} lang - Language code
     */
    getLanguageName(lang) {
        const names = {
            'zh-TW': 'Traditional Chinese',
            'ja': 'Japanese',
            'en': 'English'
        };
        return names[lang] || lang;
    }

    /**
     * Get language native name
     * @param {string} lang - Language code
     */
    getLanguageNativeName(lang) {
        const names = {
            'zh-TW': '繁體中文',
            'ja': '日本語',
            'en': 'English'
        };
        return names[lang] || lang;
    }
}

// Create global instance
window.i18n = new I18nManager();

// Export for module systems (if needed in future)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18nManager;
}