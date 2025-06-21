// FF14.tw 共用 JavaScript 功能

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

// 頁面載入完成後執行
document.addEventListener('DOMContentLoaded', function() {
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