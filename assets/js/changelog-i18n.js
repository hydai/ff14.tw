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
                
                if (currentLang === 'en') {
                    // English format: "January 2025"
                    const monthName = this.getMonthName(parseInt(month), currentLang);
                    header.textContent = `${monthName} ${year}`;
                } else {
                    // Chinese/Japanese format: "2025年1月"
                    const yearText = window.i18n?.t('dateFormat.year') || '年';
                    const monthText = window.i18n?.t('dateFormat.month') || '月';
                    header.textContent = `${year}${yearText}${month}${monthText}`;
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
                
                if (currentLang === 'en') {
                    // English format: "January 9, 2025"
                    const options = { year: 'numeric', month: 'long', day: 'numeric' };
                    dateElement.textContent = date.toLocaleDateString('en-US', options);
                } else if (currentLang === 'ja') {
                    // Japanese format: "2025年1月9日"
                    const year = date.getFullYear();
                    const month = date.getMonth() + 1;
                    const day = date.getDate();
                    dateElement.textContent = `${year}年${month}月${day}日`;
                } else {
                    // Traditional Chinese format: "2025年1月9日"
                    const year = date.getFullYear();
                    const month = date.getMonth() + 1;
                    const day = date.getDate();
                    dateElement.textContent = `${year}年${month}月${day}日`;
                }
            }
        });
    }

    getMonthName(monthIndex, lang) {
        const monthNames = {
            'en': ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'],
            'ja': ['1月', '2月', '3月', '4月', '5月', '6月', 
                   '7月', '8月', '9月', '10月', '11月', '12月'],
            'zh-TW': ['1月', '2月', '3月', '4月', '5月', '6月', 
                      '7月', '8月', '9月', '10月', '11月', '12月']
        };
        
        return monthNames[lang]?.[monthIndex - 1] || monthIndex + '月';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.changelogI18n = new ChangelogI18n();
});