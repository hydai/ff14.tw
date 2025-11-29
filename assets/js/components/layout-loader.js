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
        this.isLoaded = true;  // 立即設定，防止併發執行

        const options = this._getOptions();

        this._loadHeader(options);
        this._loadFooter(options);

        document.body.classList.add(LayoutLoader.CONSTANTS.LOADED_CLASS);

        // 發送自訂事件，讓其他元件知道佈局已載入
        // I18nManager 會監聽此事件來初始化語言切換器
        document.dispatchEvent(new CustomEvent('layoutLoaded'));
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

            // 正規化處理 /index.html -> / (包含子目錄)
            const normalizedCurrentPath = currentPath.endsWith('/index.html') ? currentPath.slice(0, -10) || '/' : currentPath;

            // 精確比對路徑
            if (linkPath === normalizedCurrentPath) {
                link.classList.add('active');
            }
        });
    }
}

// 建立全域實例並自動初始化
window.layoutLoader = new LayoutLoader();
window.layoutLoader.init();
