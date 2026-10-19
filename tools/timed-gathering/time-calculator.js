// Eorzea Time Calculator Module
class TimeCalculator {
    /** Parse stored schedules once for notifications, filtering and macro export. */
    static parseSchedule(time, duration = 55) {
        if (typeof time !== 'string' || !Number.isFinite(duration) || duration <= 0 || duration > 1440) {
            return null;
        }
        if (time.trim() === '全天') {
            return { startMinutes: 0, durationMinutes: 1440, allDay: true };
        }

        const match = time.trim().match(/^(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?$/);
        if (!match) return null;
        const startHour = Number(match[1]);
        const startMinute = Number(match[2]);
        if (startHour > 23 || startMinute > 59) return null;
        const startMinutes = startHour * 60 + startMinute;

        let durationMinutes = duration;
        if (match[3] !== undefined) {
            const endHour = Number(match[3]);
            const endMinute = Number(match[4]);
            if (endHour > 24 || endMinute > 59 || (endHour === 24 && endMinute !== 0)) return null;
            durationMinutes = (endHour * 60 + endMinute - startMinutes + 1440) % 1440 || 1440;
        }
        return { startMinutes, durationMinutes, allDay: durationMinutes === 1440 };
    }

    constructor() {
        // Constants for ET calculation
        this.EORZEA_MULTIPLIER = 3600 / 175; // 1 ET hour = 175 real seconds
        
        // Start the clock
        this.startClock();
    }
    
    /**
     * Get current local time (read through Date.now(), like the rest of the page, so a test clock controls it too)
     * @returns {Object} Object with hours, minutes, seconds
     */
    getLocalTime() {
        const now = new Date(Date.now());
        return {
            hours: now.getHours(),
            minutes: now.getMinutes(),
            seconds: now.getSeconds()
        };
    }
    
    /**
     * Calculate Eorzea Time from a Unix timestamp
     * ET runs 20.571428571 times faster than real time
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {Object} Object with hours, minutes, seconds
     */
    getEorzeaTime(timestamp = Date.now()) {
        // ET epoch starts at Unix epoch (1970-01-01 00:00:00 UTC).
        // Unix timestamps are timezone-independent, so no LT/ST offset is needed.
        const eorzeaMilliseconds = timestamp * this.EORZEA_MULTIPLIER;
        
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
     * Format time object to HH:MM string
     * @param {Object} time - Time object with hours, minutes
     * @returns {string} Formatted time string
     */
    formatHourMinute(time) {
        const pad = (num) => String(num).padStart(2, '0');
        return `${pad(time.hours)}:${pad(time.minutes)}`;
    }

    /**
     * Update the clock line: Eorzea time (#clockEt) and local time (#clockLocal) as HH:MM.
     * Called every second; the text is only written when it changes (an Eorzea minute is about 2.9 seconds)
     */
    updateClockDisplay() {
        const write = (id, text) => {
            const element = document.getElementById(id);
            if (element && element.textContent !== text) {
                element.textContent = text;
            }
        };
        write('clockEt', this.formatHourMinute(this.getEorzeaTime()));
        write('clockLocal', this.formatHourMinute(this.getLocalTime()));
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
