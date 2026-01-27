/**
 * FF14 Weather Forecast - Weather Calculator
 * Core algorithm for calculating deterministic weather in FFXIV
 */

const WeatherCalculator = {
    // Constants
    EORZEA_HOUR_MS: 175000,           // ~2.917 real minutes per Eorzea hour
    EORZEA_DAY_MS: 4200000,           // ~70 real minutes per Eorzea day
    WEATHER_DURATION_MS: 1400000,     // ~23.33 real minutes (8 Eorzea hours)
    WEATHER_PERIODS: [0, 8, 16],      // ET hours when weather changes

    /**
     * Calculate the forecast target value (0-99) for a given timestamp
     * This is the core algorithm reverse-engineered from the game
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {number} Forecast target value (0-99)
     */
    calculateForecastTarget(timestamp) {
        // Convert to seconds
        const unix = Math.trunc(timestamp / 1000);

        // Calculate the bell (Eorzea hour, 175 seconds each)
        const bell = Math.trunc(unix / 175);

        // Calculate increment (which weather period: 0, 8, or 16)
        // Weather changes at 00:00, 08:00, and 16:00 ET
        const increment = (bell + 8 - (bell % 8)) % 24;

        // Calculate total Eorzea days
        const totalDays = Math.trunc(unix / 4200) >>> 0;

        // Calculate base value for hashing
        // 0x64 = 100, used to scale days and produce weather chance (0-99)
        const calcBase = totalDays * 0x64 + increment;

        // Two-step hash function using bitwise XOR
        const step1 = ((calcBase << 0xB) ^ calcBase) >>> 0;
        const step2 = ((step1 >>> 8) ^ step1) >>> 0;

        // Return value in range 0-99 for weather chance distribution
        return step2 % 0x64;
    },

    /**
     * Get weather for a zone at a specific timestamp
     * @param {object} zone - Zone object with weatherTable
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {string} Weather name
     */
    getWeatherForZone(zone, timestamp) {
        const target = this.calculateForecastTarget(timestamp);
        return this.getWeatherFromTable(zone.weatherTable, target);
    },

    /**
     * Get weather from a weather table based on target value
     * @param {array} weatherTable - Weather table array
     * @param {number} target - Target value (0-99)
     * @returns {string} Weather name
     */
    getWeatherFromTable(weatherTable, target) {
        // Weather table format: [weather1, chance1, weather2, chance2, ..., weatherN]
        // Chances are cumulative thresholds
        for (let i = 0; i < weatherTable.length - 1; i += 2) {
            const weather = weatherTable[i];
            const threshold = weatherTable[i + 1];
            if (target < threshold) {
                return weather;
            }
        }
        // Return last weather if target exceeds all thresholds
        return weatherTable[weatherTable.length - 1];
    },

    /**
     * Get the start time of the current weather period
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {number} Start timestamp of the weather period
     */
    getWeatherPeriodStart(timestamp) {
        const unix = Math.trunc(timestamp / 1000);
        const bell = Math.trunc(unix / 175);
        const periodBell = bell - (bell % 8);
        return periodBell * 175 * 1000;
    },

    /**
     * Get the start time of the next weather period
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {number} Start timestamp of the next weather period
     */
    getNextWeatherPeriodStart(timestamp) {
        return this.getWeatherPeriodStart(timestamp) + this.WEATHER_DURATION_MS;
    },

    /**
     * Generate weather forecast for a zone
     * @param {object} zone - Zone object with weatherTable
     * @param {number} startTime - Start timestamp (default: now)
     * @param {number} periods - Number of weather periods to forecast (default: 12)
     * @returns {array} Array of {start, end, weather, eorzeaTime} objects
     */
    getForecast(zone, startTime = Date.now(), periods = 12) {
        const forecast = [];
        let time = this.getWeatherPeriodStart(startTime);

        for (let i = 0; i < periods; i++) {
            const weather = this.getWeatherForZone(zone, time);
            const end = time + this.WEATHER_DURATION_MS;
            const eorzeaTime = this.getEorzeaTime(time);

            forecast.push({
                start: time,
                end: end,
                weather: weather,
                eorzeaTime: eorzeaTime
            });

            time = end;
        }

        return forecast;
    },

    /**
     * Get current Eorzea time
     * @param {number} timestamp - Unix timestamp in milliseconds (default: now)
     * @returns {object} {hours, minutes, totalMinutes, bell, day}
     */
    getEorzeaTime(timestamp = Date.now()) {
        const unix = Math.trunc(timestamp / 1000);

        // Eorzea time calculation
        // 1 Eorzea day = 70 real minutes = 4200 real seconds
        // 1 Eorzea hour = 175 real seconds
        // 1 Eorzea minute = ~2.917 real seconds

        const eorzeaSeconds = unix * (1440 / 70); // Convert to Eorzea seconds
        const eorzeaMinutes = Math.trunc(eorzeaSeconds / 60);
        const totalMinutes = eorzeaMinutes % (24 * 60);
        const hours = Math.trunc(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        // Bell is the Eorzea hour (0-23)
        const bell = hours;

        // Day number (for debugging)
        const day = Math.trunc(eorzeaMinutes / (24 * 60));

        return {
            hours: hours,
            minutes: minutes,
            totalMinutes: totalMinutes,
            bell: bell,
            day: day
        };
    },

    /**
     * Format Eorzea time as string
     * @param {number} timestamp - Unix timestamp in milliseconds (default: now)
     * @returns {string} Formatted time string "HH:MM"
     */
    formatEorzeaTime(timestamp = Date.now()) {
        const et = this.getEorzeaTime(timestamp);
        const hours = String(et.hours).padStart(2, '0');
        const minutes = String(et.minutes).padStart(2, '0');
        return `${hours}:${minutes}`;
    },

    /**
     * Format local time as string
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @param {boolean} includeDate - Include date in output
     * @returns {string} Formatted time string
     */
    formatLocalTime(timestamp, includeDate = false) {
        const date = new Date(timestamp);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        if (includeDate) {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${month}/${day} ${hours}:${minutes}`;
        }

        return `${hours}:${minutes}`;
    },

    /**
     * Format duration in minutes
     * @param {number} durationMs - Duration in milliseconds
     * @returns {string} Formatted duration string
     */
    formatDuration(durationMs) {
        const minutes = Math.round(durationMs / 60000);
        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            if (mins === 0) {
                return `${hours}h`;
            }
            return `${hours}h ${mins}m`;
        }
        return `${minutes}m`;
    },

    /**
     * Calculate time until a specific Eorzea hour
     * @param {number} targetHour - Target Eorzea hour (0-23)
     * @param {number} timestamp - Current timestamp (default: now)
     * @returns {number} Milliseconds until target hour
     */
    getTimeUntilEorzeaHour(targetHour, timestamp = Date.now()) {
        const currentET = this.getEorzeaTime(timestamp);
        let hoursUntil = targetHour - currentET.hours;
        if (hoursUntil <= 0) {
            hoursUntil += 24;
        }
        // Also account for current minutes
        const minutesUntil = hoursUntil * 60 - currentET.minutes;
        return minutesUntil * this.EORZEA_HOUR_MS / 60;
    },

    /**
     * Check if an Eorzea time is within a range (supports wrap-around)
     * Note: When beginHour === endHour, returns true (full 24 hours).
     * This handles the case where no time filter is applied (0-24 or same hour).
     * @param {number} hour - Eorzea hour to check (0-23)
     * @param {number} beginHour - Range start hour (0-23)
     * @param {number} endHour - Range end hour (0-23, exclusive)
     * @returns {boolean} True if hour is within range
     */
    isInTimeRange(hour, beginHour, endHour) {
        if (beginHour === endHour) {
            return true; // Full 24 hours (no filter or same hour selected)
        }

        if (beginHour < endHour) {
            // Normal range (e.g., 8-16)
            return hour >= beginHour && hour < endHour;
        } else {
            // Wrap-around range (e.g., 22-6)
            return hour >= beginHour || hour < endHour;
        }
    },

    /**
     * Get the weather period index (0, 1, or 2) for an Eorzea hour
     * @param {number} eorzeaHour - Eorzea hour (0-23)
     * @returns {number} Weather period index
     */
    getWeatherPeriodIndex(eorzeaHour) {
        if (eorzeaHour >= 16) return 2;
        if (eorzeaHour >= 8) return 1;
        return 0;
    },

    /**
     * Get all weather periods that overlap with a time range
     * @param {number} beginHour - Range start hour (0-23)
     * @param {number} endHour - Range end hour (0-23)
     * @returns {array} Array of weather period start hours [0, 8, 16]
     */
    getOverlappingWeatherPeriods(beginHour, endHour) {
        const periods = [];
        for (const period of this.WEATHER_PERIODS) {
            // Check if any part of this 8-hour period overlaps with the range
            for (let h = period; h < period + 8; h++) {
                if (this.isInTimeRange(h % 24, beginHour, endHour)) {
                    periods.push(period);
                    break;
                }
            }
        }
        return periods;
    }
};

// Export for use in other modules
window.WeatherCalculator = WeatherCalculator;
