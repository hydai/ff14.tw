/**
 * FF14.tw 頁尾 DOM 建構器
 * 使用安全的 DOM 操作方法建立頁尾元素
 */
const FooterTemplate = {
    /**
     * 建立頁尾 DOM 結構：站務連結、免責聲明、版權與製作者（三列）
     * @param {Object} options - 配置選項
     * @param {string} options.basePath - 基礎路徑（預設為 '/'）
     * @param {number} options.year - 版權的結束年份（預設為今年）
     * @returns {HTMLElement} 頁尾容器元素
     */
    createDOM({ basePath = '/', year = new Date().getFullYear() } = {}) {
        // 建立容器
        const container = document.createElement('div');
        container.className = 'container';

        // 站務連結列
        const links = document.createElement('ul');
        links.className = 'footer-links';

        // 加入一個連結，回傳「帶文字的元素」，呼叫端要把 data-i18n 設在它身上：
        // 站內連結是 <a> 本身；外部連結的文字放在內層 span，↗ 另外放在 span.external-mark。
        // I18nManager 切換語言時會整段覆寫帶 data-i18n 的元素的 textContent，
        // 所以 data-i18n 不能設在外層的 <a>，否則 ↗ 會被洗掉。
        const addLink = (href, text, external = false) => {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.href = href;
            item.appendChild(link);
            links.appendChild(item);

            if (!external) {
                link.textContent = text;
                return link;
            }

            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const label = document.createElement('span');
            label.textContent = text;
            const mark = document.createElement('span');
            mark.className = 'external-mark';
            mark.setAttribute('aria-hidden', 'true');
            mark.textContent = ' ↗';
            link.appendChild(label);
            link.appendChild(mark);
            return label;
        };

        addLink(basePath + 'changelog.html', '修改紀錄').setAttribute('data-i18n', 'nav_changelog');
        addLink('https://github.com/hydai/ff14.tw/issues/new', '回報問題', true).setAttribute('data-i18n', 'footer_report_issue');
        addLink(basePath + 'about.html', '關於').setAttribute('data-i18n', 'nav_about');
        addLink(basePath + 'copyright.html', '版權聲明').setAttribute('data-i18n', 'nav_copyright');
        addLink('https://github.com/hydai/ff14.tw', 'GitHub', true).setAttribute('data-i18n', 'nav_github');
        container.appendChild(links);

        // 免責聲明
        const disclaimer = document.createElement('p');
        disclaimer.className = 'footer-disclaimer';
        disclaimer.setAttribute('data-i18n', 'footer_copyright');
        disclaimer.textContent = '本站非官方網站，與 Square Enix 無關';
        container.appendChild(disclaimer);

        // 版權年份與製作者資訊
        const meta = document.createElement('p');
        meta.className = 'footer-meta';
        meta.appendChild(document.createTextNode(`© 2024–${year} FF14.tw · `));
        const madeWith = document.createElement('span');
        madeWith.setAttribute('data-i18n', 'footer_made_with');
        madeWith.textContent = 'Made with ❤️ by hydai';
        meta.appendChild(madeWith);
        container.appendChild(meta);

        return container;
    }
};

// 匯出給其他模組使用
window.FooterTemplate = FooterTemplate;
