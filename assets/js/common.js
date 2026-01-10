// FF14.tw 共用 JavaScript 功能

// 主題管理器
class ThemeManager {
    // 定義常數以避免魔術字串
    static THEMES = {
        LIGHT: 'light',
        DARK: 'dark'
    };

    static ACTIONS = {
        ADD: 'add',
        REMOVE: 'remove'
    };

    static STORAGE_KEY = 'theme';

    // 定義主題圖標
    static ICONS = {
        MOON: '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
        SUN: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
    };

    constructor() {
        // 儲存 media query 和綁定的事件處理器以便後續管理
        this.darkModeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
        this._boundSystemThemeChangeHandler = this._handleSystemThemeChange.bind(this);
        
        // 檢查是否有儲存的主題偏好
        const storedTheme = this.getStoredTheme();
        
        // 如果有儲存的偏好就使用，否則偵測系統偏好
        this.theme = storedTheme || this.getSystemPreference();
        
        this.init();
    }

    init() {
        this.applyTheme(this.theme);
        
        // 監聽系統主題變更
        this._updateListener(ThemeManager.ACTIONS.ADD);
    }

    // 清理方法，用於移除事件監聽器
    // 預留給未來可能的單頁應用程式（SPA）架構使用
    // 在元件卸載時呼叫此方法以防止記憶體洩漏
    destroy() {
        this._updateListener(ThemeManager.ACTIONS.REMOVE);
    }

    // 統一處理事件監聽器的新增與移除
    _updateListener(action) {
        if (!this.darkModeQuery) return;

        const isAdding = action === ThemeManager.ACTIONS.ADD;

        if (isAdding) {
            this.darkModeQuery.addEventListener('change', this._boundSystemThemeChangeHandler);
        } else {
            this.darkModeQuery.removeEventListener('change', this._boundSystemThemeChangeHandler);
        }
    }

    _handleSystemThemeChange(e) {
        // 只有在使用者沒有明確設定主題時才自動切換
        if (!this.getStoredTheme()) {
            const newTheme = e.matches ? ThemeManager.THEMES.DARK : ThemeManager.THEMES.LIGHT;
            // 只有在主題真的改變時才更新，避免不必要的 DOM 操作
            if (this.theme !== newTheme) {
                this.applyTheme(newTheme);
            }
        }
    }

    getStoredTheme() {
        try {
            return localStorage.getItem(ThemeManager.STORAGE_KEY);
        } catch (e) {
            console.warn('無法存取 localStorage，主題偏好將不會被保存', e);
            return null;
        }
    }

    setStoredTheme(theme) {
        try {
            localStorage.setItem(ThemeManager.STORAGE_KEY, theme);
        } catch (e) {
            console.warn('無法存取 localStorage，主題偏好將不會被儲存', e);
        }
    }

    getSystemPreference() {
        return this.darkModeQuery?.matches ? ThemeManager.THEMES.DARK : ThemeManager.THEMES.LIGHT;
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.theme = theme;
        
        // 更新所有主題切換按鈕的圖標
        this.updateThemeToggleButtons();
    }

    toggle() {
        const newTheme = this.theme === ThemeManager.THEMES.LIGHT ? ThemeManager.THEMES.DARK : ThemeManager.THEMES.LIGHT;
        this.applyTheme(newTheme);
        this.setStoredTheme(newTheme);
        return newTheme;
    }

    updateThemeToggleButtons() {
        const buttons = document.querySelectorAll('.theme-toggle');
        buttons.forEach(button => {
            const isLight = this.theme === ThemeManager.THEMES.LIGHT;
            button.innerHTML = isLight 
                ? ThemeManager.ICONS.MOON  // 月亮圖標
                : ThemeManager.ICONS.SUN;   // 太陽圖標
            
            // 使用 i18n 取得翻譯文字（如果可用）
            const darkLabel = window.i18n?.getText('theme_toggle_dark') || '切換至深色模式';
            const lightLabel = window.i18n?.getText('theme_toggle_light') || '切換至淺色模式';
            button.setAttribute('aria-label', isLight ? darkLabel : lightLabel);
        });
    }
}

// 通用工具函數
const FF14Utils = {
    // 參數正則表達式緩存
    _paramRegexCache: {},

    // 格式化數字（加入千分位符號）
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    /**
     * 跳脫正則表達式特殊字元
     * @param {string} str - 要跳脫的字串
     * @returns {string} 跳脫後的字串
     */
    escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    /**
     * 替換字串中的參數佔位符。
     *
     * 支援兩種模式（不可混合使用）：
     * 1. **命名參數**：使用 `{name}` 格式，需傳入物件作為第一個參數
     *    範例：replaceParams('你好，{name}！', { name: '玩家' }) → '你好，玩家！'
     *
     * 2. **索引參數**：使用 `{0}`, `{1}` 格式，可傳入多個參數或物件
     *    範例：replaceParams('座標：{0}, {1}', 10, 20) → '座標：10, 20'
     *    範例：replaceParams('選擇：{0}', { 0: '選項A' }) → '選擇：選項A' （使用物件作為索引來源）
     *
     * **模式判定規則**：
     * - 若第一個參數是物件，且字串中包含非數字佔位符（如 `{name}`），則使用命名參數模式
     * - 否則使用索引參數模式
     *
     * **注意事項**：
     * - 若傳入物件但字串只有 `{0}` 這類索引佔位符，會使用索引模式
     * - 若想確保使用命名模式，請確保字串中至少有一個 `{字母開頭}` 的佔位符
     *
     * @param {string} text - 要處理的字串
     * @param {...any} args - 參數值（物件或多個值）
     * @returns {string} 替換後的字串
     */
    replaceParams(text, ...args) {
        if (!text || args.length === 0) return text;

        let result = text;
        const isPlainObjectFirstArg = typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0]);

        // Prioritize named parameters if the first argument is an object and the text contains non-numeric placeholders.
        if (isPlainObjectFirstArg && /\{[a-zA-Z_]/.test(text)) {
            // 命名參數替換 {name}
            const params = args[0];
            const paramKeys = Object.keys(params).sort((a, b) => b.length - a.length);

            if (paramKeys.length > 0) {
                // Optimization: Cache regex patterns to avoid recreating them on every call
                const cacheKey = paramKeys.join('|');
                let regex = this._paramRegexCache[cacheKey];

                if (!regex) {
                    regex = new RegExp(`\\{(${paramKeys.map(p => this.escapeRegExp(p)).join('|')})\\}`, 'g');
                    this._paramRegexCache[cacheKey] = regex;
                }

                result = result.replace(regex, (match, key) => {
                    return Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match;
                });
            }
        } else {
            // 索引參數替換 {0}, {1}
            // 如果第一個參數是物件但字串中沒有命名佔位符，則將該物件視為索引來源
            // 例如：replaceParams('{0}', {0: 'val'}) -> 'val'
            const replacements = isPlainObjectFirstArg ? args[0] : args;
            result = result.replace(/\{(\d+)\}/g, (match, index) => {
                return Object.prototype.hasOwnProperty.call(replacements, index) ? replacements[index] : match;
            });
        }
        return result;
    },

    // 複製文字到剪貼簿
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            const msg = window.i18n?.getText('msg_copied_success') || '已複製到剪貼簿';
            this.showToast(msg);
        }).catch(err => {
            console.error('複製失敗:', err);
            const msg = window.i18n?.getText('msg_copy_failed') || '複製失敗';
            this.showToast(msg, 'error');
        });
    },

    // 顯示提示訊息
    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // 加入樣式
        Object.assign(toast.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 24px',
            borderRadius: '6px',
            color: 'white',
            fontWeight: '500',
            zIndex: '9999',
            opacity: '0',
            transform: 'translateY(-20px)',
            transition: 'all 0.3s ease',
            whiteSpace: 'pre-line'
        });

        if (type === 'success') {
            toast.style.background = '#27ae60';
        } else if (type === 'error') {
            toast.style.background = '#e74c3c';
        } else if (type === 'warning') {
            toast.style.background = '#f39c12';
        } else if (type === 'info') {
            toast.style.background = '#3498db';
        }

        document.body.appendChild(toast);

        // 動畫顯示
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 100);

        // 自動移除
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    },

    // 驗證輸入數值
    validateNumber(value, min = 0, max = Infinity) {
        const num = parseInt(value);
        if (isNaN(num)) return false;
        return num >= min && num <= max;
    },

    // 載入JSON資料
    async loadData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('載入資料失敗:', error);
            const msg = window.i18n?.getText('msg_error') || '載入資料失敗';
            this.showToast(msg, 'error');
            return null;
        }
    },

    /**
     * 防抖函數 - 延遲執行直到停止呼叫一段時間
     * @param {Function} func - 要執行的函數
     * @param {number} [delay=300] - 延遲毫秒數
     * @returns {Function} 防抖後的函數
     * @example
     * const debouncedSearch = FF14Utils.debounce(function(query) {
     *     console.log('搜尋:', query);
     * }, 500);
     * inputElement.addEventListener('input', (e) => debouncedSearch(e.target.value));
     */
    debounce(func, delay = 300) {
        let timeoutId;
        return function(...args) {
            const context = this;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(function() {
                func.apply(context, args);
            }, delay);
        };
    },

    /**
     * 安全獲取 i18n 文字，如果 key 不存在則返回 fallback
     * @param {string} key - i18n key
     * @param {string} fallback - 預設文字
     * @param {...any} args - 格式化參數
     * @returns {string} 翻譯文字或預設文字
     */
    getI18nText(key, fallback, ...args) {
        if (window.i18n && window.i18n.hasKey(key)) {
            return window.i18n.getText(key, ...args);
        }
        return this.replaceParams(fallback, ...args);
    }
};

// 初始化漢堡選單功能
function initHamburgerMenu() {
    // 檢查是否已有漢堡選單，避免重複創建
    if (document.querySelector('.hamburger')) {
        return;
    }
    
    const header = document.querySelector('.header');
    const headerContainer = header?.querySelector('.container');
    const nav = header?.querySelector('.nav');
    
    if (!header || !headerContainer || !nav) {
        return;
    }
    
    // 創建漢堡選單按鈕
    const hamburger = document.createElement('button');
    hamburger.className = 'hamburger';
    const menuLabel = window.i18n?.getText('nav_menu') || '選單';
    hamburger.setAttribute('aria-label', menuLabel);
    hamburger.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;
    
    // 創建遮罩層
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    
    // 插入元素
    headerContainer.appendChild(hamburger);
    document.body.appendChild(overlay);
    
    // 漢堡選單點擊事件
    hamburger.addEventListener('click', function() {
        const isActive = nav.classList.contains('active');
        
        if (isActive) {
            // 關閉選單
            nav.classList.remove('active');
            hamburger.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        } else {
            // 開啟選單
            nav.classList.add('active');
            hamburger.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    });
    
    // 點擊遮罩層關閉選單
    overlay.addEventListener('click', function() {
        nav.classList.remove('active');
        hamburger.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    });
    
    // 處理下拉選單在手機版的行為
    const dropdowns = nav.querySelectorAll('.nav-dropdown');
    dropdowns.forEach(dropdown => {
        const dropdownLink = dropdown.querySelector(':scope > a');
        
        if (dropdownLink) {
            dropdownLink.addEventListener('click', function(e) {
            // 只在手機版阻止預設行為
            if (window.innerWidth <= 768) {
                e.preventDefault();
                
                // 關閉其他下拉選單
                dropdowns.forEach(other => {
                    if (other !== dropdown) {
                        other.classList.remove('active');
                    }
                });
                
                // 切換當前下拉選單
                dropdown.classList.toggle('active');
            }
            });
        }
    });
    
    // 視窗大小改變時重置選單狀態
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            if (window.innerWidth > 768) {
                nav.classList.remove('active');
                hamburger.classList.remove('active');
                overlay.classList.remove('active');
                document.body.style.overflow = '';
                
                // 重置所有下拉選單狀態
                dropdowns.forEach(dropdown => {
                    dropdown.classList.remove('active');
                });
            }
        }, 250);
    });
}

// 初始化主題切換功能
function initThemeToggle() {
    const nav = document.querySelector('.nav');
    const hamburger = document.querySelector('.hamburger');
    
    if (!nav) return;
    
    // 創建主題切換按鈕
    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.setAttribute('type', 'button');
    
    // 設置初始圖標
    window.themeManager.updateThemeToggleButtons();
    
    // 綁定點擊事件
    themeToggle.addEventListener('click', () => {
        window.themeManager.toggle();
    });
    
    // 根據螢幕大小決定插入位置
    if (window.innerWidth <= 768 && hamburger) {
        // 手機版：插入到漢堡選單前
        hamburger.parentNode.insertBefore(themeToggle, hamburger);
    } else {
        // 桌面版：插入到導航列最後
        nav.appendChild(themeToggle);
    }
    
    // 初次更新按鈕圖標
    window.themeManager.updateThemeToggleButtons();
}

// 頁面載入完成後執行
document.addEventListener('DOMContentLoaded', function() {
    // 初始化主題管理器（最優先）
    window.themeManager = new ThemeManager();

    // 初始化漢堡選單功能
    initHamburgerMenu();
    
    // 初始化主題切換功能
    initThemeToggle();

    // 監聽語言變更以更新主題切換按鈕文字
    if (window.i18n) {
        window.i18n.onLanguageChange(() => {
            window.themeManager.updateThemeToggleButtons();
        });
    }
    
    // 為所有工具卡片添加點擊效果
    const toolCards = document.querySelectorAll('.tool-card');
    toolCards.forEach(card => {
        card.addEventListener('click', function(e) {
            // 如果點擊的是連結，不需要額外處理
            if (this.tagName === 'A') {
                return;
            }
            
            // 否則查找卡片內的連結
            const link = this.querySelector('a');
            if (link) {
                window.location.href = link.href;
            }
        });
    });

    // 添加返回頂部按鈕
    const backToTopBtn = document.createElement('button');
    backToTopBtn.innerHTML = '↑';
    backToTopBtn.className = 'back-to-top';
    backToTopBtn.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: var(--primary-color);
        color: white;
        border: none;
        font-size: 20px;
        cursor: pointer;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        z-index: 1000;
    `;
    
    document.body.appendChild(backToTopBtn);

    // 控制返回頂部按鈕顯示/隱藏
    window.addEventListener('scroll', function() {
        if (window.scrollY > 300) {
            backToTopBtn.style.opacity = '1';
            backToTopBtn.style.visibility = 'visible';
        } else {
            backToTopBtn.style.opacity = '0';
            backToTopBtn.style.visibility = 'hidden';
        }
    });

    // 返回頂部功能
    backToTopBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
});

// 全域可用的常數
const FF14_JOBS = {
    TANK: ['騎士', '戰士', '暗黑騎士', '絕槍戰士'],
    HEALER: ['白魔法師', '學者', '占星術士', '賢者'],
    MELEE: ['武僧', '龍騎士', '忍者', '武士', '鐮刀'],
    RANGED: ['詩人', '機工士', '舞者'],
    CASTER: ['黑魔法師', '召喚師', '赤魔法師', '青魔法師']
};

// 匯出給其他模組使用
window.FF14Utils = FF14Utils;
window.FF14_JOBS = FF14_JOBS;