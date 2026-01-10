// Eorzea Time Calculator Module
class TimeCalculator {
    constructor() {
        // Constants for ET calculation
        this.EORZEA_MULTIPLIER = 3600 / 175; // 1 ET hour = 175 real seconds
        
        // Start the clock
        this.startClock();
    }
    
    /**
     * Get current local time
     * @returns {Object} Object with hours, minutes, seconds
     */
    getLocalTime() {
        const now = new Date();
        return {
            hours: now.getHours(),
            minutes: now.getMinutes(),
            seconds: now.getSeconds()
        };
    }
    
    /**
     * Calculate Eorzea Time from JST (UTC+9)
     * ET runs 20.571428571 times faster than real time
     * @returns {Object} Object with hours, minutes, seconds
     */
    getEorzeaTime() {
        // Get current time in milliseconds
        const now = Date.now();
        
        // Convert to JST (UTC+9) for server time
        const jstOffset = 9 * 60 * 60 * 1000; // 9 hours in milliseconds
        const utcTime = now + (new Date().getTimezoneOffset() * 60 * 1000);
        const jstTime = utcTime + jstOffset;
        
        // Calculate Eorzea time
        // ET epoch starts at Unix epoch (1970-01-01 00:00:00 UTC)
        const eorzeaMilliseconds = jstTime * this.EORZEA_MULTIPLIER;
        
        // Convert to ET date
        const eorzeaDate = new Date(eorzeaMilliseconds);
        
        // Extract ET time components
        const etHours = eorzeaDate.getUTCHours();
        const etMinutes = eorzeaDate.getUTCMinutes();
        const etSeconds = eorzeaDate.getUTCSeconds();
        
        return {
            hours: etHours,
            minutes: etMinutes,
            seconds: etSeconds
        };
    }
    
    /**
     * Format time object to HH:MM:SS string
     * @param {Object} time - Time object with hours, minutes, seconds
     * @returns {string} Formatted time string
     */
    formatTime(time) {
        const pad = (num) => String(num).padStart(2, '0');
        return `${pad(time.hours)}:${pad(time.minutes)}:${pad(time.seconds)}`;
    }
    
    /**
     * Update clock display elements
     */
    updateClockDisplay() {
        const ltElement = document.getElementById('localTimeDisplay');
        const etElement = document.getElementById('eorzeaTimeDisplay');
        
        if (ltElement) {
            const localTime = this.getLocalTime();
            ltElement.textContent = this.formatTime(localTime);
        }
        
        if (etElement) {
            const eorzeaTime = this.getEorzeaTime();
            etElement.textContent = this.formatTime(eorzeaTime);
            
            // Add time period indicator (day/night)
            const hour = eorzeaTime.hours;
            const periodElement = document.getElementById('etPeriod');
            if (periodElement) {
                if (hour >= 6 && hour < 18) {
                    periodElement.textContent = '☀️';
                    periodElement.title = FF14Utils.getI18nText('dayTime', '白天');
                } else {
                    periodElement.textContent = '🌙';
                    periodElement.title = FF14Utils.getI18nText('nightTime', '夜晚');
                }
            }
        }
    }
    
    /**
     * Start the clock update interval
     */
    startClock() {
        // Update immediately
        this.updateClockDisplay();
        
        // Update every second
        this.clockInterval = setInterval(() => {
            this.updateClockDisplay();
        }, 1000);
    }
    
    /**
     * Stop the clock update interval
     */
    stopClock() {
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }
    }
    
    /**
     * Get next occurrence of a specific ET time
     * @param {string} targetTime - Target time in "HH:MM" format
     * @returns {Object} Object with countdown and local time of next occurrence
     */
    getNextOccurrence(targetTime) {
        const [targetHour, targetMinute] = targetTime.split(':').map(Number);
        const currentET = this.getEorzeaTime();
        
        // Calculate minutes until target
        let currentETMinutes = currentET.hours * 60 + currentET.minutes;
        let targetETMinutes = targetHour * 60 + targetMinute;
        
        // If target has passed today, calculate for tomorrow
        if (targetETMinutes <= currentETMinutes) {
            targetETMinutes += 24 * 60; // Add one ET day
        }
        
        const etMinutesUntil = targetETMinutes - currentETMinutes;
        
        // Convert ET minutes to real seconds
        const realSecondsUntil = etMinutesUntil * 175 / 60;
        
        // Calculate local time of occurrence
        const occurrenceTime = new Date(Date.now() + realSecondsUntil * 1000);
        
        return {
            countdown: Math.floor(realSecondsUntil),
            localTime: occurrenceTime,
            etMinutesUntil: etMinutesUntil
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeCalculator;
}