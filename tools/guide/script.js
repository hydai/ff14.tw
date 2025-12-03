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
        this.colorCalculator = null;
        this.init();
    }

    /**
     * Initialize functionality
     */
    init() {
        this.loadSidebar();
        this.refreshI18n();
        this.initColorCalculator();
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

    /**
     * Initialize Chocobo Color Calculator if present on page
     */
    initColorCalculator() {
        if (typeof ChocoboColorCalculator === 'undefined') {
            return;
        }

        if (document.getElementById('colorCalculator')) {
            this.colorCalculator = new ChocoboColorCalculator();
            this.colorCalculator.init();
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
