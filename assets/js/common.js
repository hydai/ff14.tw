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

    // 建立月亮圖示（深色模式時顯示）
    static createMoonIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
        svg.appendChild(path);
        return svg;
    }

    // 建立太陽圖示（淺色模式時顯示）
    static createSunIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '5');
        svg.appendChild(circle);
        const rays = [
            ['12', '1', '12', '3'], ['12', '21', '12', '23'],
            ['4.22', '4.22', '5.64', '5.64'], ['18.36', '18.36', '19.78', '19.78'],
            ['1', '12', '3', '12'], ['21', '12', '23', '12'],
            ['4.22', '19.78', '5.64', '18.36'], ['18.36', '5.64', '19.78', '4.22']
        ];
        rays.forEach(([x1, y1, x2, y2]) => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            svg.appendChild(line);
        });
        return svg;
    }

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
            button.replaceChildren(isLight ? ThemeManager.createMoonIcon() : ThemeManager.createSunIcon());  // 淺色模式顯示月亮圖示，深色模式顯示太陽圖示

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

    // 用於偵測命名參數的正則表達式（預編譯以提升效能）
    _namedParamDetectRegex: /\{[a-zA-Z_]/,

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
        const isPlainObjectFirstArg = Object.prototype.toString.call(args[0]) === '[object Object]';

        // Prioritize named parameters if the first argument is an object and the text contains non-numeric placeholders.
        if (isPlainObjectFirstArg && this._namedParamDetectRegex.test(text)) {
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
        return function (...args) {
            const context = this;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(function () {
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

    // ☰ 用 aria-controls 指向導覽列；導覽列沒有 id 時補上（NavTemplate 產生的導覽列一定有）
    if (!nav.id) {
        nav.id = 'site-nav';
    }

    // 創建漢堡選單按鈕：type="button" 避免放進表單時變成送出鈕，aria-expanded 隨選單開關同步
    const hamburger = document.createElement('button');
    hamburger.className = 'hamburger';
    hamburger.setAttribute('type', 'button');
    hamburger.setAttribute('aria-controls', nav.id);
    hamburger.setAttribute('aria-expanded', 'false');
    // 建立漢堡選單的三條線（避免使用 innerHTML）
    hamburger.appendChild(document.createElement('span'));
    hamburger.appendChild(document.createElement('span'));
    hamburger.appendChild(document.createElement('span'));

    // aria-label 跟著語言走：建立時設一次，語言切換時再設一次（沒有 i18n 的頁面用預設文字）
    const updateMenuLabel = () => {
        hamburger.setAttribute('aria-label', window.i18n?.getText('nav_menu') || '選單');
    };
    updateMenuLabel();
    window.i18n?.onLanguageChange(updateMenuLabel);

    // 創建遮罩層
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';

    // 插入元素
    headerContainer.appendChild(hamburger);
    document.body.appendChild(overlay);

    // 手機版導覽選單關閉時設為 inert：CSS 用 visibility 延遲隱藏讓滑出動畫播完，
    // 這 300ms 內選單連結仍在 Tab 順序裡、也可用 Enter 觸發；inert 把鍵盤與焦點一併擋掉。
    // 桌機（>768px）導覽列永遠可用，所以只在手機寬度且未開啟時才 inert；
    // 視窗大小改變時也要重新同步（同一個 .nav 元素在桌機與手機共用）
    const syncNavInert = () => {
        nav.inert = window.innerWidth <= 768 && !nav.classList.contains('active');
    };
    syncNavInert();

    const isMenuOpen = () => nav.classList.contains('active');

    // 開啟選單：鎖住頁面捲動，焦點移進選單（優先工具清單的第一個連結，沒有清單就用抽屜裡第一個看得到的連結：
    // 桌機用的首頁 .nav-desktop-only 在抽屜裡是 display: none，focus() 不會有作用）
    const openMenu = () => {
        nav.classList.add('active');
        hamburger.classList.add('active');
        overlay.classList.add('active');
        hamburger.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
        // 一定要先解除 inert 再移動焦點：inert 子樹裡的元素拿不到焦點（focus() 什麼都不會做）
        syncNavInert();
        const firstLink = nav.querySelector('.tools-menu a')
            || Array.from(nav.querySelectorAll('a')).find((link) => !link.classList.contains('nav-desktop-only'));
        firstLink?.focus();
    };

    // 關閉選單。使用者主動關閉（☰、Escape、遮罩）時把焦點還給 ☰：選單關起來後 nav 是 inert，
    // 焦點留在裡面會掉回頁面最上面；視窗放寬造成的重置、焦點走出選單造成的關閉不動焦點（焦點已經在別處）
    const closeMenu = ({ restoreFocus = false } = {}) => {
        nav.classList.remove('active');
        hamburger.classList.remove('active');
        overlay.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
        syncNavInert();
        if (restoreFocus) {
            hamburger.focus();
        }
    };

    // 漢堡選單點擊事件
    hamburger.addEventListener('click', function () {
        if (isMenuOpen()) {
            closeMenu({ restoreFocus: true });
        } else {
            openMenu();
        }
    });

    // 點擊遮罩層關閉選單
    overlay.addEventListener('click', function () {
        closeMenu({ restoreFocus: true });
    });

    // 焦點移到選單與 ☰ 以外的元素（例如 Tab 走出抽屜）就關閉選單，不把焦點拉回 ☰：
    // 抽屜蓋住頁首的主題切換鈕、遮罩蓋住整個頁面，焦點停在這些看不到的地方，使用者就不知道焦點在哪裡。
    // 在選單與 ☰ 之間移動不算移出：按下 ☰ 時焦點會先落在 ☰ 上，這時若關閉，接著的 click 又會把選單打開。
    // relatedTarget 是 null（視窗失焦、F6、點到遮罩這類不能聚焦的地方）也不算移出，遮罩由自己的 click 關閉；
    // 這和桌機工具選單（NavTemplate.initToolsMenu）的 focusout 是同一個規則
    const handleFocusOut = function (event) {
        const next = event.relatedTarget;
        if (isMenuOpen() && next && !nav.contains(next) && !hamburger.contains(next)) {
            closeMenu();
        }
    };
    nav.addEventListener('focusout', handleFocusOut);
    hamburger.addEventListener('focusout', handleFocusOut);

    // 開啟中按 Escape 關閉選單；沒開的時候不攔截，讓別的元件（例如對話框）自己處理
    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !isMenuOpen()) {
            return;
        }
        event.preventDefault();
        closeMenu({ restoreFocus: true });
    });

    // 視窗大小改變時重置選單狀態
    let resizeTimeout;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function () {
            if (window.innerWidth > 768) {
                closeMenu();
            }
            syncNavInert();
        }, 250);
    });

    // 跨過 768px（平板轉向、拉窗戶）時，焦點所在的元素可能突然看不到，焦點就會掉回頁面最上面：
    // 進入手機寬度時導覽列變成收起來的抽屜（看不到、inert），焦點在導覽列裡就移到 ☰；
    // 回到桌機寬度時 ☰ 不顯示、抽屜裡的工具清單收回「工具 ▾」、抽屜用的首頁也不顯示，
    // 焦點在 ☰ 或工具清單就移到「工具 ▾」，在抽屜用的首頁就移到桌機用的首頁；其他導覽項目桌機照樣看得到，不動。
    // 要在 matchMedia 的 change 裡處理：瀏覽器在這之後的繪製才把看不到的焦點移回 body，上面 resize 的 250ms 延遲已經來不及；
    // inert 也要先同步，焦點才移得進桌機的導覽列。斷點與 common.css 的 @media (max-width: 768px) 一致
    const mobileQuery = window.matchMedia?.('(max-width: 768px)');
    mobileQuery?.addEventListener('change', function (event) {
        const focused = document.activeElement;
        syncNavInert();
        if (event.matches) {
            if (nav.contains(focused)) {
                hamburger.focus();
            }
            return;
        }
        if (focused === hamburger || nav.querySelector('.tools-menu')?.contains(focused)) {
            nav.querySelector('.nav-tools-toggle')?.focus();
        } else if (focused?.classList.contains('nav-drawer-only')) {
            nav.querySelector('.nav-desktop-only')?.focus();
        }
    });

    // 在抽屜裡選了工具再按 Back：瀏覽器可能從往返快取（bfcache）原封不動地還原頁面，
    // 抽屜還開著、頁面捲動還被鎖住，焦點也可能還在剛才選的連結上。每次載入頁面都會有 pageshow，只有 persisted 為 true 才是還原。
    // 焦點在抽屜裡就和 Escape 一樣還給 ☰：關閉後抽屜是 inert，焦點留在裡面會掉回頁面最上面；
    // 焦點不在抽屜裡（例如 Safari 點連結不會讓連結取得焦點）就不動。選單沒開就不處理，不去解除別的元件（例如對話框）鎖住的捲動
    window.addEventListener('pageshow', function (event) {
        if (event.persisted && isMenuOpen()) {
            closeMenu({ restoreFocus: nav.contains(document.activeElement) });
        }
    });

    // 選了會開新分頁的連結（水晶商城清單，target="_blank"）：這一頁不會卸載，抽屜要自己關，否則切回這個分頁時它還開著、頁面捲不動。
    // 焦點在抽屜裡就和 Escape 一樣還給 ☰（關閉後抽屜是 inert），不在就不動。站內連結不處理：這一頁會被換掉，
    // 從往返快取回來時由上面的 pageshow 關閉
    nav.querySelectorAll('a[target="_blank"]').forEach(function (link) {
        link.addEventListener('click', function () {
            if (isMenuOpen()) {
                closeMenu({ restoreFocus: nav.contains(document.activeElement) });
            }
        });
    });
}

// 初始化主題切換功能
function initThemeToggle() {
    const headerContainer = document.querySelector('.header .container');

    if (!headerContainer) return;

    // 創建主題切換按鈕
    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.setAttribute('type', 'button');

    // 綁定點擊事件
    themeToggle.addEventListener('click', () => {
        window.themeManager.toggle();
    });

    // 切換鈕只放這一次：頁首容器裡、漢堡選單前面（沒有漢堡選單時接在最後），不放進導覽列。
    // 桌機與手機的位置都由 CSS 決定（見 common.css），不隨視窗大小搬動：
    // 搬動一顆有焦點的按鈕會讓焦點掉回頁面最上面
    headerContainer.insertBefore(themeToggle, headerContainer.querySelector('.hamburger'));

    // 更新按鈕圖標：要等按鈕放進文件之後，updateThemeToggleButtons() 只處理文件裡的 .theme-toggle
    window.themeManager.updateThemeToggleButtons();
}

// 頁面載入完成後執行
document.addEventListener('DOMContentLoaded', function () {
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

    // 添加返回頂部按鈕
    const backToTopBtn = document.createElement('button');
    backToTopBtn.textContent = '↑';
    backToTopBtn.className = 'back-to-top';

    document.body.appendChild(backToTopBtn);

    // 控制返回頂部按鈕顯示/隱藏
    window.addEventListener('scroll', function () {
        if (window.scrollY > 300) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    });

    // 返回頂部功能
    backToTopBtn.addEventListener('click', function () {
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
