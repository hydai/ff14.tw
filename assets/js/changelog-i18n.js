/**
 * Changelog i18n helper
 * Handles dynamic translation of changelog tags and dates
 */

class ChangelogI18n {
    constructor() {
        this.init();
    }

    init() {
        // Listen for language changes
        document.addEventListener('i18n:languageChanged', () => {
            this.updateChangelogContent();
        });

        // Initial update
        this.updateChangelogContent();
    }

    updateChangelogContent() {
        // Update year/month headers
        this.updateYearMonthHeaders();
        
        // Update tags
        this.updateTags();
        
        // Update dates
        this.updateDates();
    }

    updateYearMonthHeaders() {
        document.querySelectorAll('.changelog-year').forEach(header => {
            const year = header.dataset.year;
            const month = header.dataset.month;
            
            if (year && month) {
                const currentLang = window.i18n?.currentLanguage || 'zh-TW';
                const locale = currentLang === 'zh-TW' ? 'zh-TW' : currentLang;
                const date = new Date(year, month - 1);
                
                try {
                    const options = { year: 'numeric', month: 'long' };
                    header.textContent = new Intl.DateTimeFormat(locale, options).format(date);
                } catch (e) {
                    console.error('Error formatting date:', e);
                    // Fallback to original logic if Intl fails
                    if (currentLang === 'en') {
                        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                           'July', 'August', 'September', 'October', 'November', 'December'];
                        header.textContent = `${monthNames[month - 1]} ${year}`;
                    } else {
                        header.textContent = `${year}年${month}月`;
                    }
                }
            }
        });
    }

    updateTags() {
        // Update all tags with data-i18n attribute
        document.querySelectorAll('.tag[data-i18n]').forEach(tag => {
            const key = tag.dataset.i18n;
            const translation = window.i18n?.t(key);
            if (translation) {
                tag.textContent = translation;
            }
        });
    }

    updateDates() {
        document.querySelectorAll('.changelog-date').forEach(dateElement => {
            const datetime = dateElement.getAttribute('datetime');
            if (datetime) {
                const date = new Date(datetime);
                const currentLang = window.i18n?.currentLanguage || 'zh-TW';
                const locale = currentLang === 'zh-TW' ? 'zh-TW' : currentLang;
                
                try {
                    const options = { year: 'numeric', month: 'long', day: 'numeric' };
                    dateElement.textContent = new Intl.DateTimeFormat(locale, options).format(date);
                } catch (e) {
                    console.error('Error formatting date:', e);
                    // Fallback for safety
                    dateElement.textContent = date.toLocaleDateString();
                }
            }
        });
    }

}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.changelogI18n = new ChangelogI18n();
});