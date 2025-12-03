/**
 * GuideManager - Controller for Guide sub-pages
 * Handles sidebar loading and current page highlighting
 */
class GuideManager {
    static CONSTANTS = {
        SIDEBAR_PLACEHOLDER_ID: 'guide-sidebar-placeholder'
    };

    /**
     * Initialize the guide manager
     */
    constructor() {
        this.init();
    }

    /**
     * Initialize functionality
     */
    init() {
        this.loadSidebar();
        this.refreshI18n();
    }

    /**
     * Load sidebar template into placeholder
     */
    loadSidebar() {
        if (typeof GuideSidebarTemplate === 'undefined') {
            console.error('[GuideManager] GuideSidebarTemplate not loaded');
            return;
        }

        GuideSidebarTemplate.load(GuideManager.CONSTANTS.SIDEBAR_PLACEHOLDER_ID);
    }

    /**
     * Refresh i18n translations after sidebar is loaded
     */
    refreshI18n() {
        // If I18nManager exists and is initialized, update translations
        if (typeof I18nManager !== 'undefined' && window.i18n) {
            window.i18n.updatePageLanguage();
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize on sub-pages with sidebar placeholder
    if (document.getElementById('guide-sidebar-placeholder')) {
        window.guideManager = new GuideManager();
    }
});
