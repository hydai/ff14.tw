/**
 * FF14.tw 佈局載入器
 * 負責動態載入導航欄和頁尾元件
 */
class LayoutLoader {
    static CONSTANTS = {
        HEADER_PLACEHOLDER_ID: 'header-placeholder',
        FOOTER_PLACEHOLDER_ID: 'footer-placeholder',
        LOADED_CLASS: 'layout-loaded'
    };

    constructor() {
        this.isLoaded = false;
    }

    /**
     * 初始化佈局載入
     * 自動偵測佔位元素並載入對應內容
     */
    init() {
        // 優先在 DOMContentLoaded 前執行，減少 FOUC
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._load());
        } else {
            this._load();
        }
    }

    /**
     * 執行載入
     */
    _load() {
        if (this.isLoaded) return;

        const options = this._getOptions();

        this._loadHeader(options);
        this._loadFooter(options);

        this.isLoaded = true;
        document.body.classList.add(LayoutLoader.CONSTANTS.LOADED_CLASS);

        // 通知 I18nManager 重新初始化語言切換器
        // 因為 I18nManager 可能在 LayoutLoader 之前執行，
        // 當時語言切換器按鈕還不存在
        this._reinitializeI18n();

        // 發送自訂事件，讓其他元件知道佈局已載入
        document.dispatchEvent(new CustomEvent('layoutLoaded'));
    }

    /**
     * 重新初始化 I18nManager 的語言切換器
     * 解決動態載入導致的初始化順序問題
     */
    _reinitializeI18n() {
        if (typeof window.i18n !== 'undefined') {
            // 重新綁定語言切換器事件
            const switcher = document.querySelector('.language-switcher');
            if (switcher) {
                switcher.addEventListener('click', (e) => {
                    const btn = e.target.closest('.language-btn');
                    if (!btn) return;

                    const lang = btn.dataset.lang;
                    if (lang) {
                        window.i18n.setLanguage(lang);
                    }
                });

                // 更新按鈕的 active 狀態
                const currentLang = window.i18n.getCurrentLanguage();
                document.querySelectorAll('.language-btn').forEach(btn => {
                    const isActive = btn.dataset.lang === currentLang;
                    btn.classList.toggle('active', isActive);
                    btn.setAttribute('aria-pressed', isActive.toString());
                });
            }

            // 觸發一次頁面語言更新，確保動態載入的元素也被翻譯
            window.i18n.updatePageLanguage();
        }
    }

    /**
     * 從 placeholder 元素讀取配置選項
     * @returns {Object} 配置選項
     */
    _getOptions() {
        const headerPlaceholder = document.getElementById(LayoutLoader.CONSTANTS.HEADER_PLACEHOLDER_ID);
        const options = {
            basePath: '/',
            toolName: null,
            toolNameKey: null
        };

        if (headerPlaceholder) {
            // 從 data 屬性讀取配置
            options.basePath = headerPlaceholder.dataset.basePath || '/';
            options.toolName = headerPlaceholder.dataset.toolName || null;
            options.toolNameKey = headerPlaceholder.dataset.toolNameKey || null;
        }

        return options;
    }

    /**
     * 載入導航欄
     * @param {Object} options - 配置選項
     */
    _loadHeader(options) {
        const placeholder = document.getElementById(LayoutLoader.CONSTANTS.HEADER_PLACEHOLDER_ID);
        if (!placeholder) return;

        // 檢查 NavTemplate 是否已載入
        if (typeof NavTemplate === 'undefined') {
            console.error('[LayoutLoader] NavTemplate not loaded');
            return;
        }

        // 建立 header 元素
        const header = document.createElement('header');
        header.className = 'header';
        header.appendChild(NavTemplate.createDOM(options));

        // 替換 placeholder
        placeholder.replaceWith(header);

        // 設定當前頁面的 active 狀態
        this._setActiveNavItem();
    }

    /**
     * 載入頁尾
     * @param {Object} options - 配置選項
     */
    _loadFooter(options) {
        const placeholder = document.getElementById(LayoutLoader.CONSTANTS.FOOTER_PLACEHOLDER_ID);
        if (!placeholder) return;

        // 檢查 FooterTemplate 是否已載入
        if (typeof FooterTemplate === 'undefined') {
            console.error('[LayoutLoader] FooterTemplate not loaded');
            return;
        }

        // 建立 footer 元素
        const footer = document.createElement('footer');
        footer.className = 'footer';
        footer.appendChild(FooterTemplate.createDOM(options));

        // 替換 placeholder
        placeholder.replaceWith(footer);
    }

    /**
     * 設定當前頁面的導航項目為 active 狀態
     */
    _setActiveNavItem() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.nav > a[href]');

        navLinks.forEach(link => {
            const href = link.getAttribute('href');

            // 跳過外部連結
            if (href.startsWith('http')) return;

            // 正規化路徑比較
            const linkPath = new URL(href, window.location.origin).pathname;

            // 首頁特殊處理
            if (linkPath === '/' && (currentPath === '/' || currentPath === '/index.html')) {
                link.classList.add('active');
            } else if (linkPath !== '/' && currentPath.endsWith(linkPath)) {
                link.classList.add('active');
            }
        });
    }
}

// 建立全域實例並自動初始化
window.layoutLoader = new LayoutLoader();
window.layoutLoader.init();
