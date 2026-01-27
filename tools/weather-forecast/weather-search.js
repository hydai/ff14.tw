/**
 * FF14 Weather Forecast - Weather Search Engine
 * Filters and searches for specific weather conditions
 */

class WeatherSearch {
    /**
     * Create a new WeatherSearch instance
     */
    constructor() {
        // Default search parameters
        this.defaultDays = 60;
        this.maxResults = 100;
    }

    /**
     * Search for weather windows matching the given criteria
     * @param {object} zone - Zone object with weatherTable
     * @param {object} filters - Filter criteria
     * @param {Set} filters.desiredWeathers - Set of desired weather names
     * @param {Set} filters.previousWeathers - Set of required previous weather names
     * @param {number} filters.beginHour - Start of ET time range (0-23)
     * @param {number} filters.endHour - End of ET time range (0-24)
     * @param {string} filters.event - Special event name (optional)
     * @param {number} startTime - Search start timestamp (default: now)
     * @param {number} maxResults - Maximum results to return
     * @returns {array} Array of match objects
     */
    search(zone, filters, startTime = Date.now(), maxResults = this.maxResults) {
        if (!zone || !filters) {
            return [];
        }

        const calc = window.WeatherCalculator;
        const results = [];
        const searchDuration = this.defaultDays * 24 * 60 * 60 * 1000; // days in ms
        const endTime = startTime + searchDuration;

        // Get weather periods within search range
        let time = calc.getWeatherPeriodStart(startTime);

        // Track previous weather for transition checks
        let previousWeather = null;
        if (time > startTime) {
            // Get the actual previous weather
            const prevTime = time - calc.WEATHER_DURATION_MS;
            previousWeather = calc.getWeatherForZone(zone, prevTime);
        }

        while (time < endTime && results.length < maxResults) {
            const weather = calc.getWeatherForZone(zone, time);
            const eorzeaTime = calc.getEorzeaTime(time);
            const periodEnd = time + calc.WEATHER_DURATION_MS;

            // Check if this weather matches the criteria
            const match = this.matchesCriteria(weather, previousWeather, eorzeaTime, filters);

            if (match) {
                results.push({
                    start: time,
                    end: periodEnd,
                    weather: weather,
                    previousWeather: previousWeather,
                    eorzeaTime: eorzeaTime,
                    localStart: new Date(time),
                    localEnd: new Date(periodEnd)
                });
            }

            // Move to next period
            previousWeather = weather;
            time = periodEnd;
        }

        return results;
    }

    /**
     * Check if a weather period matches the filter criteria
     * @param {string} weather - Current weather name
     * @param {string} previousWeather - Previous weather name
     * @param {object} eorzeaTime - Eorzea time object
     * @param {object} filters - Filter criteria
     * @returns {boolean} True if matches all criteria
     */
    matchesCriteria(weather, previousWeather, eorzeaTime, filters) {
        const calc = window.WeatherCalculator;

        // Check desired weather
        if (filters.desiredWeathers && filters.desiredWeathers.size > 0) {
            if (!filters.desiredWeathers.has(weather)) {
                return false;
            }
        }

        // Check previous weather
        if (filters.previousWeathers && filters.previousWeathers.size > 0) {
            if (!previousWeather || !filters.previousWeathers.has(previousWeather)) {
                return false;
            }
        }

        // Check time range
        if (filters.beginHour !== undefined && filters.endHour !== undefined) {
            if (filters.beginHour !== 0 || filters.endHour !== 24) {
                // Check if the weather period overlaps with the desired time range
                const overlappingPeriods = calc.getOverlappingWeatherPeriods(filters.beginHour, filters.endHour);
                if (!overlappingPeriods.includes(eorzeaTime.hours)) {
                    return false;
                }
            }
        }

        // Check special events
        if (filters.event) {
            if (!this.matchesEvent(weather, previousWeather, filters.event)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if conditions match a special event
     * @param {string} weather - Current weather
     * @param {string} previousWeather - Previous weather
     * @param {string} eventName - Event name
     * @returns {boolean} True if matches event conditions
     */
    matchesEvent(weather, previousWeather, eventName) {
        // Special event conditions
        const events = {
            'garlok': {
                // Garlok spawns in Eastern La Noscea during Fog->Clear/Fair/Clouds
                weathers: ['Clear Skies', 'Fair Skies', 'Clouds'],
                previousWeathers: ['Fog']
            },
            'laideronnette': {
                // Laideronnette appears in Central Shroud during Rain
                weathers: ['Rain', 'Thunder']
            }
        };

        const event = events[eventName.toLowerCase()];
        if (!event) {
            return true; // Unknown event, don't filter
        }

        if (event.weathers && !event.weathers.includes(weather)) {
            return false;
        }

        if (event.previousWeathers && previousWeather && !event.previousWeathers.includes(previousWeather)) {
            return false;
        }

        return true;
    }

    /**
     * Find consecutive weather windows
     * @param {object} zone - Zone object
     * @param {Set} weathers - Set of weather names to chain
     * @param {number} minDuration - Minimum duration in minutes
     * @param {number} startTime - Search start timestamp
     * @returns {array} Array of {start, end, duration, weathers} objects
     */
    findConsecutiveWeather(zone, weathers, minDuration, startTime = Date.now()) {
        const calc = window.WeatherCalculator;
        const results = [];
        const searchDuration = this.defaultDays * 24 * 60 * 60 * 1000;
        const endTime = startTime + searchDuration;
        const minDurationMs = minDuration * 60 * 1000;

        let time = calc.getWeatherPeriodStart(startTime);
        let chainStart = null;
        let chainWeathers = [];

        while (time < endTime) {
            const weather = calc.getWeatherForZone(zone, time);
            const isMatching = weathers.has(weather);

            if (isMatching) {
                if (chainStart === null) {
                    chainStart = time;
                    chainWeathers = [weather];
                } else {
                    chainWeathers.push(weather);
                }
            } else {
                // End of chain
                if (chainStart !== null) {
                    const chainEnd = time;
                    const duration = chainEnd - chainStart;

                    if (duration >= minDurationMs) {
                        results.push({
                            start: chainStart,
                            end: chainEnd,
                            duration: duration,
                            durationMinutes: Math.round(duration / 60000),
                            weathers: [...chainWeathers],
                            localStart: new Date(chainStart),
                            localEnd: new Date(chainEnd)
                        });
                    }

                    chainStart = null;
                    chainWeathers = [];
                }
            }

            time += calc.WEATHER_DURATION_MS;
        }

        // Check final chain
        if (chainStart !== null) {
            const duration = time - chainStart;
            if (duration >= minDurationMs) {
                results.push({
                    start: chainStart,
                    end: time,
                    duration: duration,
                    durationMinutes: Math.round(duration / 60000),
                    weathers: [...chainWeathers],
                    localStart: new Date(chainStart),
                    localEnd: new Date(time)
                });
            }
        }

        return results;
    }

    /**
     * Get upcoming weather changes (timetable view)
     * @param {object} zone - Zone object
     * @param {number} startTime - Start timestamp
     * @param {number} count - Number of periods to return
     * @returns {array} Array of weather period objects
     */
    getUpcomingWeather(zone, startTime = Date.now(), count = 24) {
        const calc = window.WeatherCalculator;
        const results = [];
        let time = calc.getWeatherPeriodStart(startTime);
        let previousWeather = null;

        // Get previous weather if we're not at the start
        if (time > 0) {
            previousWeather = calc.getWeatherForZone(zone, time - calc.WEATHER_DURATION_MS);
        }

        for (let i = 0; i < count; i++) {
            const weather = calc.getWeatherForZone(zone, time);
            const eorzeaTime = calc.getEorzeaTime(time);
            const periodEnd = time + calc.WEATHER_DURATION_MS;

            results.push({
                start: time,
                end: periodEnd,
                weather: weather,
                previousWeather: previousWeather,
                eorzeaTime: eorzeaTime,
                localStart: new Date(time),
                localEnd: new Date(periodEnd),
                isCurrent: time <= Date.now() && periodEnd > Date.now()
            });

            previousWeather = weather;
            time = periodEnd;
        }

        return results;
    }

    /**
     * Group results by date for display
     * @param {array} results - Array of weather period objects
     * @returns {object} Object with date strings as keys
     */
    groupByDate(results) {
        const grouped = {};

        for (const result of results) {
            const date = result.localStart.toLocaleDateString();
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(result);
        }

        return grouped;
    }

    /**
     * Get statistics about weather in a zone
     * @param {object} zone - Zone object
     * @param {number} periods - Number of periods to analyze
     * @returns {object} Statistics object
     */
    getWeatherStats(zone, periods = 1000) {
        const calc = window.WeatherCalculator;
        const counts = {};
        let time = calc.getWeatherPeriodStart(Date.now());

        for (let i = 0; i < periods; i++) {
            const weather = calc.getWeatherForZone(zone, time);
            counts[weather] = (counts[weather] || 0) + 1;
            time += calc.WEATHER_DURATION_MS;
        }

        // Convert to percentages
        const stats = {};
        for (const [weather, count] of Object.entries(counts)) {
            stats[weather] = {
                count: count,
                percentage: Math.round((count / periods) * 100 * 10) / 10
            };
        }

        return stats;
    }
}

// Export for use in other modules
window.WeatherSearch = WeatherSearch;
