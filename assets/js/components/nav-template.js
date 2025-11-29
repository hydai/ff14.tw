/**
 * FF14.tw 導航欄 DOM 建構器
 * 使用安全的 DOM 操作方法建立導航欄元素
 */
const NavTemplate = {
    /**
     * 建立導航欄 DOM 結構
     * @param {Object} options - 配置選項
     * @param {string} options.basePath - 基礎路徑（預設為 '/'）
     * @param {string} options.toolName - 工具名稱（選填）
     * @param {string} options.toolNameKey - 工具名稱的 i18n key（選填）
     * @returns {DocumentFragment} 導航欄 DOM 片段
     */
    createDOM(options = {}) {
        const { basePath = '/', toolName, toolNameKey } = options;
        const rootPath = basePath || '/';

        // 建立容器
        const container = document.createElement('div');
        container.className = 'container';

        // 建立 Logo
        const logo = document.createElement('a');
        logo.href = rootPath;
        logo.className = 'logo';

        // 設定 Logo 內容
        if (toolName || toolNameKey) {
            // 工具頁面：FF14.tw | 工具名稱
            logo.appendChild(document.createTextNode('FF14.tw'));

            const separator = document.createElement('span');
            separator.className = 'logo-separator';
            separator.textContent = '|';
            logo.appendChild(separator);

            const toolNameSpan = document.createElement('span');
            toolNameSpan.className = 'logo-tool-name';
            if (toolNameKey) {
                toolNameSpan.setAttribute('data-i18n', toolNameKey);
            }
            toolNameSpan.textContent = toolName || '';
            logo.appendChild(toolNameSpan);
        } else {
            // 主頁面：純文字
            logo.textContent = 'FF14.tw';
        }

        container.appendChild(logo);

        // 建立導航欄
        const nav = document.createElement('nav');
        nav.className = 'nav';

        // 導航連結配置
        const navLinks = [
            { href: rootPath, i18nKey: 'nav_home', text: '首頁' },
            { href: rootPath + 'copyright.html', i18nKey: 'nav_copyright', text: '版權聲明' },
            { href: 'https://github.com/hydai/ff14.tw', i18nKey: 'nav_github', text: 'GitHub', external: true },
            { href: rootPath + 'about.html', i18nKey: 'nav_about', text: '關於' }
        ];

        // 建立導航連結
        navLinks.forEach(linkConfig => {
            const link = document.createElement('a');
            link.href = linkConfig.href;
            link.setAttribute('data-i18n', linkConfig.i18nKey);
            link.textContent = linkConfig.text;

            if (linkConfig.external) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }

            nav.appendChild(link);
        });

        // 建立語言切換器
        const languageSwitcher = document.createElement('div');
        languageSwitcher.className = 'language-switcher';

        const languages = [
            { lang: 'zh', text: 'ZH-TW' },
            { lang: 'en', text: 'EN' },
            { lang: 'ja', text: 'JP' }
        ];

        languages.forEach(langConfig => {
            const btn = document.createElement('button');
            btn.className = 'language-btn';
            btn.setAttribute('data-lang', langConfig.lang);
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = langConfig.text;
            languageSwitcher.appendChild(btn);
        });

        nav.appendChild(languageSwitcher);
        container.appendChild(nav);

        return container;
    }
};

// 匯出給其他模組使用
window.NavTemplate = NavTemplate;
