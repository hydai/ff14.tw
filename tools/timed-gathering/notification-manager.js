// 通知管理模組
class NotificationManager {
    static CONSTANTS = {
        STORAGE_KEY: 'ff14tw_timed_gathering_notifications',
        NOTIFICATION_ICON: '/assets/images/ff14tw.ico',
        CHECK_INTERVAL: 30000, // 每30秒檢查一次
        NOTIFICATION_COOLDOWN: 3600000, // 1小時內同一物品不重複通知
        TIME_WINDOW: 60 // 60秒內視為時間到達
    };

    constructor() {
        this.enabled = false;
        this.notifiedItems = new Map(); // 記錄已通知的項目和時間
        this.checkInterval = null;
        this.currentList = [];
        
        this.loadSettings();
    }

    /**
     * 載入設定
     */
    loadSettings() {
        try {
            const stored = localStorage.getItem(NotificationManager.CONSTANTS.STORAGE_KEY);
            if (stored) {
                const settings = JSON.parse(stored);
                this.enabled = settings.enabled || false;
            }
        } catch (error) {
            console.error('載入通知設定失敗:', error);
        }
    }

    /**
     * 儲存設定
     */
    saveSettings() {
        try {
            const settings = {
                enabled: this.enabled
            };
            localStorage.setItem(NotificationManager.CONSTANTS.STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            console.error('儲存通知設定失敗:', error);
        }
    }

    /**
     * 請求通知權限
     * @returns {Promise<boolean>} 是否獲得權限
     */
    async requestPermission() {
        if (!('Notification' in window)) {
            console.warn('此瀏覽器不支援通知功能');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }

        return false;
    }

    /**
     * 啟用通知
     * @returns {Promise<boolean>} 是否成功啟用
     */
    async enableNotifications() {
        const hasPermission = await this.requestPermission();
        if (!hasPermission) {
            alert(window.i18n?.getText('notificationPermissionDenied') || '無法獲得通知權限，請在瀏覽器設定中允許通知');
            return false;
        }

        this.enabled = true;
        this.saveSettings();
        this.startChecking();
        return true;
    }

    /**
     * 停用通知
     */
    disableNotifications() {
        this.enabled = false;
        this.saveSettings();
        this.stopChecking();
    }


    /**
     * 更新要監控的清單項目
     * @param {Array} items 清單項目陣列
     */
    updateWatchList(items) {
        this.currentList = items;
        if (this.enabled && items.length > 0) {
            this.startChecking();
        } else if (items.length === 0) {
            this.stopChecking();
        }
    }

    /**
     * 開始檢查採集時間
     */
    startChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // 立即檢查一次
        this.checkUpcomingGathering();

        // 設定定期檢查
        this.checkInterval = setInterval(() => {
            this.checkUpcomingGathering();
        }, NotificationManager.CONSTANTS.CHECK_INTERVAL);
    }

    /**
     * 停止檢查採集時間
     */
    stopChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * 檢查採集時間是否到達
     */
    checkUpcomingGathering() {
        if (!this.enabled || this.currentList.length === 0) {
            return;
        }

        const now = new Date();
        const currentET = this.getEorzeaTime();

        this.currentList.forEach(item => {
            const timeUntilGathering = this.getTimeUntilGathering(item, currentET);
            
            // 檢查是否時間到達（0-60秒內視為時間到達）
            if (timeUntilGathering >= 0 && timeUntilGathering <= NotificationManager.CONSTANTS.TIME_WINDOW) {
                // 檢查是否已經通知過（避免重複通知）
                if (!this.hasRecentlyNotified(item.id)) {
                    this.sendNotification(item);
                    this.markAsNotified(item.id);
                }
            }
        });

        // 清理過期的通知記錄
        this.cleanupNotifiedItems();
    }

    /**
     * 獲取艾歐爾傑亞時間
     * @returns {Object} ET時間物件
     */
    getEorzeaTime() {
        const EORZEA_MULTIPLIER = 3600 / 175;
        const now = Date.now();
        const jstOffset = 9 * 60 * 60 * 1000;
        const utcTime = now + (new Date().getTimezoneOffset() * 60 * 1000);
        const jstTime = utcTime + jstOffset;
        const eorzeaMilliseconds = jstTime * EORZEA_MULTIPLIER;
        const eorzeaDate = new Date(eorzeaMilliseconds);
        
        return {
            hours: eorzeaDate.getUTCHours(),
            minutes: eorzeaDate.getUTCMinutes(),
            seconds: eorzeaDate.getUTCSeconds()
        };
    }

    /**
     * 計算到採集時間的剩餘時間（秒）
     * @param {Object} item 採集物項目
     * @param {Object} currentET 當前ET時間
     * @returns {number} 剩餘秒數
     */
    getTimeUntilGathering(item, currentET) {
        // 解析採集時間（支援 "HH:MM" 和 "HH:MM-HH:MM" 格式）
        let startTime = item.time;
        let endTime = null;
        
        // 檢查是否為時間範圍格式
        if (item.time.includes('-')) {
            const [start, end] = item.time.split('-');
            startTime = start.trim();
            endTime = end.trim();
        }
        
        // 解析開始時間
        const timeParts = startTime.split(':');
        if (timeParts.length !== 2) {
            console.warn(`無效的時間格式: ${item.time}`);
            return -1;
        }
        
        const startHour = parseInt(timeParts[0]);
        const startMinute = parseInt(timeParts[1]);
        
        if (isNaN(startHour) || isNaN(startMinute)) {
            console.warn(`無法解析時間: ${startTime}`);
            return -1;
        }
        
        // 計算當前ET時間的總分鐘數
        const currentMinutes = currentET.hours * 60 + currentET.minutes;
        
        // 計算採集開始時間的總分鐘數
        const startMinutes = startHour * 60 + startMinute;
        
        // 如果有結束時間，檢查是否在採集窗口內
        if (endTime) {
            const endParts = endTime.split(':');
            if (endParts.length === 2) {
                const endHour = parseInt(endParts[0]);
                const endMinute = parseInt(endParts[1]);
                if (!isNaN(endHour) && !isNaN(endMinute)) {
                    let endMinutes = endHour * 60 + endMinute;
                    
                    // 處理跨日的時間範圍
                    if (endMinutes < startMinutes) {
                        endMinutes += 24 * 60;
                    }
                    
                    // 檢查當前時間是否在採集窗口內
                    let adjustedCurrentMinutes = currentMinutes;
                    if (endMinutes > 24 * 60 && currentMinutes < startMinutes) {
                        adjustedCurrentMinutes += 24 * 60;
                    }
                    
                    if (adjustedCurrentMinutes >= startMinutes && adjustedCurrentMinutes < endMinutes) {
                        // 已經在採集窗口內，不需要通知
                        return -1;
                    }
                }
            }
        }
        
        // 計算時間差（考慮跨日情況）
        let minutesUntilStart = startMinutes - currentMinutes;
        if (minutesUntilStart < 0) {
            minutesUntilStart += 24 * 60; // 加上一天的分鐘數
        }
        
        // 如果有持續時間，檢查是否太接近結束時間
        if (item.duration && item.duration > 0) {
            // 如果剩餘時間超過 24 小時減去持續時間，表示採集窗口快結束了
            if (minutesUntilStart > (24 * 60 - item.duration)) {
                // 採集窗口即將結束，不適合發送通知
                return -1;
            }
        }
        
        // 轉換為實際秒數（ET時間流速）
        const realSeconds = (minutesUntilStart * 60) / (3600 / 175);
        
        return realSeconds;
    }

    /**
     * 檢查是否最近已通知過
     * @param {string} itemId 項目ID
     * @returns {boolean} 是否已通知
     */
    hasRecentlyNotified(itemId) {
        const lastNotified = this.notifiedItems.get(itemId);
        if (!lastNotified) return false;
        
        const now = Date.now();
        return (now - lastNotified) < NotificationManager.CONSTANTS.NOTIFICATION_COOLDOWN;
    }

    /**
     * 標記為已通知
     * @param {string} itemId 項目ID
     */
    markAsNotified(itemId) {
        this.notifiedItems.set(itemId, Date.now());
    }

    /**
     * 清理過期的通知記錄
     */
    cleanupNotifiedItems() {
        const now = Date.now();
        const expiredItems = [];
        
        this.notifiedItems.forEach((time, itemId) => {
            if (now - time > NotificationManager.CONSTANTS.NOTIFICATION_COOLDOWN) {
                expiredItems.push(itemId);
            }
        });
        
        expiredItems.forEach(itemId => {
            this.notifiedItems.delete(itemId);
        });
    }

    /**
     * 發送通知
     * @param {Object} item 採集物項目
     */
    sendNotification(item) {
        const title = window.i18n?.getText('notificationTitle') || 'FF14 採集提醒';
        const body = this.formatNotificationBody(item);
        
        const notification = new Notification(title, {
            body: body,
            icon: NotificationManager.CONSTANTS.NOTIFICATION_ICON,
            tag: `gathering-${item.id}`,
            requireInteraction: false,
            silent: false
        });

        // 點擊通知時聚焦頁面
        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        // 自動關閉通知
        setTimeout(() => {
            notification.close();
        }, 10000);
    }

    /**
     * 格式化通知內容
     * @param {Object} item 採集物項目
     * @returns {string} 通知內容
     */
    formatNotificationBody(item) {
        const itemName = this.getCurrentLanguage() === 'ja' ? item.nameJp : item.name;
        const zone = this.getCurrentLanguage() === 'ja' ? item.zoneJp : item.zone;
        
        const template = window.i18n?.getText('notificationBodyTemplate') || 
            '${itemName} 現在可以採集了！\n地點：${zone} ${location}\n座標：${coordinates}';
        
        return template
            .replace('${itemName}', itemName)
            .replace('${zone}', zone)
            .replace('${location}', item.location || '')
            .replace('${coordinates}', item.coordinates);
    }

    /**
     * 獲取當前語言設定
     * @returns {string} 語言代碼
     */
    getCurrentLanguage() {
        return window.i18n?.getCurrentLanguage() || 'zh';
    }

    /**
     * 獲取通知狀態
     * @returns {string} 狀態文字
     */
    getNotificationStatus() {
        if (!('Notification' in window)) {
            return window.i18n?.getText('notificationNotSupported') || '瀏覽器不支援通知';
        }

        if (Notification.permission === 'denied') {
            return window.i18n?.getText('notificationPermissionDenied') || '通知權限被拒絕';
        }

        if (this.enabled) {
            return window.i18n?.getText('notificationEnabled') || '通知已啟用';
        }

        return window.i18n?.getText('notificationDisabled') || '通知已停用';
    }
}

// 導出給其他模組使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationManager;
}