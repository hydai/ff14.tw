/**
 * Guide Sidebar Template
 * Creates the sidebar navigation for guide pages using DOM builder pattern
 */
const GuideSidebarTemplate = {
    // 手機的查詢：窄螢幕（寬度 768px 以下），或橫放的手機（寬度超過 768px，但高度只有 400px 上下：高度 500px 以下）。
    // 橫放時電腦版 sticky 側欄的框放不下整份目錄，會變成要在框裡捲的框，所以也走手機版面。
    // 和 style.css 手機版面（目錄、單欄）的 @media 一模一樣，tests/guide-pages.test.js 會比對
    MOBILE_QUERY: '(max-width: 768px), (max-height: 500px)',

    // Sidebar navigation items configuration
    // pending: true 是還沒寫的主題，連結後面標「撰寫中」
    ITEMS: [
        { href: 'guild.html', page: 'guild', icon: '🏠', i18nKey: 'guide_toc_guild', text: '部隊', pending: true },
        { href: 'grand-company.html', page: 'grand-company', icon: '🎖️', i18nKey: 'guide_toc_grand_company', text: '大國防聯軍' },
        { href: 'dungeon.html', page: 'dungeon', icon: '🏰', i18nKey: 'guide_toc_dungeon', text: '副本', pending: true },
        { href: 'party.html', page: 'party', icon: '👥', i18nKey: 'guide_toc_party', text: '隊伍系統' },
        { href: 'aether.html', page: 'aether', icon: '💨', i18nKey: 'guide_toc_aether', text: '風脈', pending: true },
        { href: 'sightseeing.html', page: 'sightseeing', icon: '📔', i18nKey: 'guide_toc_sightseeing', text: '探索筆記', pending: true },
        { href: 'chocobo.html', page: 'chocobo', icon: '🐤', i18nKey: 'guide_toc_chocobo', text: '專屬陸行鳥' }
    ],

    /**
     * Create sidebar DOM structure
     * 目錄是 <details>：電腦預設展開，標題「目錄」是看得到、也能按的開關，玩家可以自己收起來（重新載入或視窗跨過斷點時又展開）；
     * 手機（窄螢幕，或橫放的矮視窗，見 MOBILE_QUERY）收成一行「目錄」，點開才列出全部（開關見 followViewport）
     * @param {Object} options - Configuration options
     * @param {string} options.currentPage - Current page identifier for active state
     * @returns {HTMLElement} Complete sidebar aside element
     */
    createDOM(options = {}) {
        const { currentPage = '' } = options;

        // Create main aside container
        const aside = document.createElement('aside');
        aside.className = 'toc-sidebar';

        // Create inner container：一開始是打開的，沒有 matchMedia 的環境也就維持打開
        const container = document.createElement('details');
        container.className = 'toc-container';
        container.setAttribute('open', '');

        // Create title：收起來時留在畫面上的那一行
        const title = document.createElement('summary');
        title.className = 'toc-title';
        title.setAttribute('data-i18n', 'guide_toc_title');
        title.textContent = '目錄';
        container.appendChild(title);

        // Create navigation
        const nav = document.createElement('nav');
        nav.className = 'toc-nav';
        nav.id = 'tocNav';

        // Create navigation links
        this.ITEMS.forEach(item => {
            const link = document.createElement('a');
            link.href = item.href;
            link.className = 'toc-link';
            if (item.page === currentPage) {
                link.classList.add('active');
            }
            link.setAttribute('data-page', item.page);

            // Create icon span
            const iconSpan = document.createElement('span');
            iconSpan.className = 'toc-icon';
            iconSpan.textContent = item.icon;
            link.appendChild(iconSpan);

            // 名稱與標籤放在同一個 label 裡，放不下時標籤在 label 裡自己換行（見 style.css 的 .toc-label）
            const label = document.createElement('span');
            label.className = 'toc-label';

            // Create text span with i18n
            const textSpan = document.createElement('span');
            textSpan.setAttribute('data-i18n', item.i18nKey);
            textSpan.textContent = item.text;
            label.appendChild(textSpan);

            // 還沒寫的主題：標籤放在名稱旁邊（不能放進有 data-i18n 的名稱裡，換語言時那裡的文字會整段被換掉）
            if (item.pending) {
                const pendingTag = document.createElement('span');
                pendingTag.className = 'tag tag-warning toc-pending';
                pendingTag.setAttribute('data-i18n', 'guide_pending');
                pendingTag.textContent = '撰寫中';
                label.appendChild(pendingTag);
            }

            link.appendChild(label);
            nav.appendChild(link);
        });

        container.appendChild(nav);

        // Create back to index link
        const backLink = document.createElement('a');
        backLink.href = 'index.html';
        backLink.className = 'back-to-landing';
        backLink.setAttribute('data-i18n', 'guide_back_to_index');
        backLink.textContent = '← 返回總覽';
        container.appendChild(backLink);

        aside.appendChild(container);

        return aside;
    },

    /**
     * 依視窗大小開關目錄：電腦打開，手機（MOBILE_QUERY：窄螢幕或橫放的矮視窗）收起來；視窗跨過斷點（平板轉向、拉窗戶）時跟著換，
     * 手機直拿轉橫放時兩邊都是手機，查詢的結果沒變，不會因為轉向就展開。
     * 焦點在目錄裡就維持打開：收起來的話焦點會掉回頁面最上面。沒有 matchMedia 時維持打開
     * @param {HTMLElement} details - 目錄的 details 元素
     */
    followViewport(details) {
        const narrow = window.matchMedia?.(this.MOBILE_QUERY);
        if (!narrow) {
            return;
        }

        const apply = () => {
            if (!narrow.matches) {
                details.setAttribute('open', '');
            } else if (!details.contains(document.activeElement)) {
                details.removeAttribute('open');
            }
        };

        apply();
        narrow.addEventListener('change', apply);
    },

    /**
     * Load sidebar into placeholder element
     * @param {string} placeholderId - ID of placeholder element
     * @returns {HTMLElement|null} Created sidebar element or null if placeholder not found
     */
    load(placeholderId = 'guide-sidebar-placeholder') {
        const placeholder = document.getElementById(placeholderId);
        if (!placeholder) {
            return null;
        }

        const currentPage = placeholder.dataset.currentPage || '';
        const sidebar = this.createDOM({ currentPage });

        placeholder.replaceWith(sidebar);
        this.followViewport(sidebar.querySelector('details'));

        return sidebar;
    }
};

// Export globally
window.GuideSidebarTemplate = GuideSidebarTemplate;
