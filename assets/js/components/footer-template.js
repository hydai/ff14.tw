/**
 * FF14.tw 頁尾 DOM 建構器
 * 使用安全的 DOM 操作方法建立頁尾元素
 */
const FooterTemplate = {
    /**
     * 建立頁尾 DOM 結構
     * @param {Object} options - 配置選項
     * @param {string} options.basePath - 基礎路徑（預設為 '/'）
     * @returns {HTMLElement} 頁尾容器元素
     */
    createDOM(options = {}) {
        const { basePath = '/' } = options;
        const rootPath = basePath || '/';

        // 建立容器
        const container = document.createElement('div');
        container.className = 'container';

        // 建立段落
        const p = document.createElement('p');

        // 版權年份
        p.appendChild(document.createTextNode('\u00A9 2024-2025 FF14.tw | '));

        // 免責聲明
        const disclaimer = document.createElement('span');
        disclaimer.setAttribute('data-i18n', 'footer_copyright');
        disclaimer.textContent = '本站非官方網站，與 Square Enix 無關';
        p.appendChild(disclaimer);

        p.appendChild(document.createTextNode(' | '));

        // 製作者資訊
        const madeWith = document.createElement('span');
        madeWith.setAttribute('data-i18n', 'footer_made_with');
        madeWith.textContent = 'Made with \u2764\uFE0F by hydai';
        p.appendChild(madeWith);

        p.appendChild(document.createTextNode(' | '));

        // 修改紀錄連結
        const changelogLink = document.createElement('a');
        changelogLink.href = rootPath + 'changelog.html';
        changelogLink.setAttribute('data-i18n', 'nav_changelog');
        changelogLink.textContent = '修改紀錄';
        p.appendChild(changelogLink);

        container.appendChild(p);

        return container;
    }
};

// 匯出給其他模組使用
window.FooterTemplate = FooterTemplate;
