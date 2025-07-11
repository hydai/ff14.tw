// FF14.tw 共用 JavaScript 功能

// 主題管理器
class ThemeManager {
    constructor() {
        // 預設為 light mode，除非使用者明確選擇過
        this.theme = this.getStoredTheme() || 'light';
        this.init();
    }

    init() {
        this.applyTheme(this.theme);
    }

    getStoredTheme() {
        return localStorage.getItem('theme');
    }

    setStoredTheme(theme) {
        localStorage.setItem('theme', theme);
    }

    getSystemPreference() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.theme = theme;
        
        // 更新所有主題切換按鈕的圖標
        this.updateThemeToggleButtons();
    }

    toggle() {
        const newTheme = this.theme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
        this.setStoredTheme(newTheme);
        return newTheme;
    }

    updateThemeToggleButtons() {
        const buttons = document.querySelectorAll('.theme-toggle');
        buttons.forEach(button => {
            button.innerHTML = this.theme === 'light' 
                ? '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' // 月亮圖標
                : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'; // 太陽圖標
            
            button.setAttribute('aria-label', this.theme === 'light' ? '切換至深色模式' : '切換至淺色模式');
        });
    }
}

// 通用工具函數
const FF14Utils = {
    // 格式化數字（加入千分位符號）
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    // 複製文字到剪貼簿
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('已複製到剪貼簿');
        }).catch(err => {
            console.error('複製失敗:', err);
            this.showToast('複製失敗', 'error');
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
            transition: 'all 0.3s ease'
        });

        if (type === 'success') {
            toast.style.background = '#27ae60';
        } else if (type === 'error') {
            toast.style.background = '#e74c3c';
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
            this.showToast('載入資料失敗', 'error');
            return null;
        }
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
    hamburger.setAttribute('aria-label', '選單');
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

// 動態更新 logo 文字
function updateLogoText() {
    const logo = document.querySelector('.logo');
    const h1 = document.querySelector('h1');
    
    if (!logo || !h1) {
        console.warn('Logo or H1 element not found');
        return;
    }
    
    // 檢查是否在工具頁面（URL 包含 /tools/）
    if (window.location.pathname.includes('/tools/')) {
        // 取得工具名稱
        const toolName = h1.textContent.trim();
        
        // 清空 logo 內容
        logo.textContent = '';
        
        // 創建元素來避免 XSS 漏洞
        const logoMain = document.createElement('span');
        logoMain.className = 'logo-main';
        logoMain.textContent = 'FF14.tw';
        
        const logoSeparator = document.createElement('span');
        logoSeparator.className = 'logo-separator';
        logoSeparator.textContent = ' | ';
        
        const logoTool = document.createElement('span');
        logoTool.className = 'logo-tool';
        logoTool.textContent = toolName;
        
        // 依序添加元素
        logo.appendChild(logoMain);
        logo.appendChild(logoSeparator);
        logo.appendChild(logoTool);
        
        // 為 h1 加上隱藏類別
        h1.classList.add('tool-page-title');
        
        // 如果有描述文字，調整其上邊距
        const description = document.querySelector('.description');
        if (description) {
            description.style.marginTop = '0';
        }
    }
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
    
    // 動態更新 logo 文字（工具頁面）
    updateLogoText();
    
    // 初始化漢堡選單功能
    initHamburgerMenu();
    
    // 初始化主題切換功能
    initThemeToggle();
    
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