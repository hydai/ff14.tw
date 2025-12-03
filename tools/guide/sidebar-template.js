/**
 * Guide Sidebar Template
 * Creates the sidebar navigation for guide pages using DOM builder pattern
 */
const GuideSidebarTemplate = {
    // Sidebar navigation items configuration
    ITEMS: [
        { href: 'guild.html', page: 'guild', icon: '🏠', i18nKey: 'guide_toc_guild', text: '公會' },
        { href: 'grand-company.html', page: 'grand-company', icon: '🎖️', i18nKey: 'guide_toc_grand_company', text: '大國防聯軍' },
        { href: 'dungeon.html', page: 'dungeon', icon: '🏰', i18nKey: 'guide_toc_dungeon', text: '副本' },
        { href: 'aether.html', page: 'aether', icon: '💨', i18nKey: 'guide_toc_aether', text: '風脈' },
        { href: 'sightseeing.html', page: 'sightseeing', icon: '📔', i18nKey: 'guide_toc_sightseeing', text: '探索筆記' },
        { href: 'chocobo.html', page: 'chocobo', icon: '🐤', i18nKey: 'guide_toc_chocobo', text: '專屬陸行鳥' }
    ],

    /**
     * Create sidebar DOM structure
     * @param {Object} options - Configuration options
     * @param {string} options.currentPage - Current page identifier for active state
     * @returns {HTMLElement} Complete sidebar aside element
     */
    createDOM(options = {}) {
        const { currentPage = '' } = options;

        // Create main aside container
        const aside = document.createElement('aside');
        aside.className = 'toc-sidebar';

        // Create inner container
        const container = document.createElement('div');
        container.className = 'toc-container';

        // Create title
        const title = document.createElement('h2');
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

            // Create text span with i18n
            const textSpan = document.createElement('span');
            textSpan.setAttribute('data-i18n', item.i18nKey);
            textSpan.textContent = item.text;
            link.appendChild(textSpan);

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

        return sidebar;
    }
};

// Export globally
window.GuideSidebarTemplate = GuideSidebarTemplate;
