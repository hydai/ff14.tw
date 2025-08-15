// Language Switcher Component for FF14.tw
// Provides UI for language selection

class LanguageSwitcher {
    static CONSTANTS = {
        CONTAINER_CLASS: 'language-switcher',
        BUTTON_CLASS: 'language-btn',
        ACTIVE_CLASS: 'active',
        DROPDOWN_CLASS: 'language-dropdown',
        MOBILE_THRESHOLD: 768
    };

    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Language switcher container not found: ${containerId}`);
            return;
        }

        this.options = {
            style: 'buttons', // 'buttons', 'dropdown', 'flags'
            position: 'inline', // 'inline', 'fixed'
            showNativeName: true,
            showFlag: false,
            ...options
        };

        this.init();
    }

    init() {
        // Wait for i18n to be initialized
        if (!window.i18n) {
            console.error('i18n not initialized');
            return;
        }

        this.render();
        this.attachEventListeners();
        
        // Listen for language changes
        window.i18n.observe((lang) => {
            this.updateActiveState(lang);
        });
    }

    render() {
        const languages = window.i18n.getAvailableLanguages();
        const currentLang = window.i18n.getCurrentLanguage();

        this.container.className = LanguageSwitcher.CONSTANTS.CONTAINER_CLASS;
        
        if (this.options.style === 'dropdown') {
            this.renderDropdown(languages, currentLang);
        } else if (this.options.style === 'flags') {
            this.renderFlags(languages, currentLang);
        } else {
            this.renderButtons(languages, currentLang);
        }
    }

    renderButtons(languages, currentLang) {
        const wrapper = document.createElement('div');
        wrapper.className = 'language-buttons';
        
        languages.forEach(lang => {
            const button = document.createElement('button');
            button.className = `btn btn-sm ${LanguageSwitcher.CONSTANTS.BUTTON_CLASS}`;
            button.dataset.lang = lang.code;
            
            if (lang.code === currentLang) {
                button.classList.add(LanguageSwitcher.CONSTANTS.ACTIVE_CLASS);
            }
            
            // Display text
            const displayText = this.options.showNativeName ? lang.native : lang.code.toUpperCase();
            button.textContent = displayText;
            
            // Add tooltip with full name
            button.title = lang.name;
            
            wrapper.appendChild(button);
        });
        
        this.container.textContent = '';
        this.container.appendChild(wrapper);
    }

    renderDropdown(languages, currentLang) {
        const wrapper = document.createElement('div');
        wrapper.className = LanguageSwitcher.CONSTANTS.DROPDOWN_CLASS;
        
        // Current language display
        const currentDisplay = document.createElement('button');
        currentDisplay.className = 'btn btn-sm dropdown-toggle';
        currentDisplay.dataset.toggle = 'dropdown';
        
        const currentLangObj = languages.find(l => l.code === currentLang);
        currentDisplay.textContent = this.options.showNativeName ? 
            currentLangObj.native : currentLangObj.code.toUpperCase();
        
        // Dropdown menu
        const menu = document.createElement('div');
        menu.className = 'dropdown-menu';
        menu.style.display = 'none';
        
        languages.forEach(lang => {
            const item = document.createElement('a');
            item.className = 'dropdown-item';
            item.href = '#';
            item.dataset.lang = lang.code;
            
            if (lang.code === currentLang) {
                item.classList.add('active');
            }
            
            item.textContent = `${lang.native} (${lang.name})`;
            menu.appendChild(item);
        });
        
        wrapper.appendChild(currentDisplay);
        wrapper.appendChild(menu);
        
        // Toggle dropdown
        currentDisplay.addEventListener('click', (e) => {
            e.preventDefault();
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                menu.style.display = 'none';
            }
        });
        
        this.container.textContent = '';
        this.container.appendChild(wrapper);
    }

    renderFlags(languages, currentLang) {
        const wrapper = document.createElement('div');
        wrapper.className = 'language-flags';
        
        const flagMap = {
            'zh-TW': '🇹🇼',
            'ja': '🇯🇵',
            'en': '🇺🇸'
        };
        
        languages.forEach(lang => {
            const button = document.createElement('button');
            button.className = `flag-btn ${LanguageSwitcher.CONSTANTS.BUTTON_CLASS}`;
            button.dataset.lang = lang.code;
            
            if (lang.code === currentLang) {
                button.classList.add(LanguageSwitcher.CONSTANTS.ACTIVE_CLASS);
            }
            
            // Flag emoji
            const flag = document.createElement('span');
            flag.className = 'flag-emoji';
            flag.textContent = flagMap[lang.code] || '🏳️';
            button.appendChild(flag);
            
            // Optional text
            if (this.options.showNativeName) {
                const text = document.createElement('span');
                text.className = 'flag-text';
                text.textContent = lang.native;
                button.appendChild(text);
            }
            
            button.title = lang.name;
            wrapper.appendChild(button);
        });
        
        this.container.textContent = '';
        this.container.appendChild(wrapper);
    }

    attachEventListeners() {
        this.container.addEventListener('click', (e) => {
            const button = e.target.closest(`.${LanguageSwitcher.CONSTANTS.BUTTON_CLASS}, .dropdown-item`);
            if (button && button.dataset.lang) {
                e.preventDefault();
                this.switchLanguage(button.dataset.lang);
            }
        });
    }

    switchLanguage(lang) {
        if (window.i18n && lang !== window.i18n.getCurrentLanguage()) {
            window.i18n.setLanguage(lang);
            
            // Optional: Update URL without reload
            if (this.options.updateUrl) {
                const url = new URL(window.location);
                url.searchParams.set('lang', lang);
                window.history.pushState({}, '', url);
            }
            
            // Trigger custom event
            document.dispatchEvent(new CustomEvent('languageChanged', {
                detail: { language: lang }
            }));
        }
    }

    updateActiveState(lang) {
        // Remove active class from all buttons
        this.container.querySelectorAll(`.${LanguageSwitcher.CONSTANTS.ACTIVE_CLASS}`).forEach(el => {
            el.classList.remove(LanguageSwitcher.CONSTANTS.ACTIVE_CLASS);
        });
        
        // Add active class to current language button
        const activeButton = this.container.querySelector(`[data-lang="${lang}"]`);
        if (activeButton) {
            activeButton.classList.add(LanguageSwitcher.CONSTANTS.ACTIVE_CLASS);
            
            // Update dropdown display if using dropdown style
            if (this.options.style === 'dropdown') {
                const toggle = this.container.querySelector('.dropdown-toggle');
                if (toggle) {
                    const languages = window.i18n.getAvailableLanguages();
                    const langObj = languages.find(l => l.code === lang);
                    toggle.textContent = this.options.showNativeName ? 
                        langObj.native : langObj.code.toUpperCase();
                }
            }
        }
    }

    /**
     * Static method to auto-initialize language switchers
     */
    static autoInit() {
        document.querySelectorAll('[data-language-switcher]').forEach(container => {
            const options = {};
            
            // Parse options from data attributes
            if (container.dataset.style) options.style = container.dataset.style;
            if (container.dataset.position) options.position = container.dataset.position;
            if (container.dataset.showNative !== undefined) {
                options.showNativeName = container.dataset.showNative === 'true';
            }
            if (container.dataset.showFlag !== undefined) {
                options.showFlag = container.dataset.showFlag === 'true';
            }
            if (container.dataset.updateUrl !== undefined) {
                options.updateUrl = container.dataset.updateUrl === 'true';
            }
            
            new LanguageSwitcher(container.id, options);
        });
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        LanguageSwitcher.autoInit();
    });
} else {
    LanguageSwitcher.autoInit();
}

// Export for module systems (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LanguageSwitcher;
}