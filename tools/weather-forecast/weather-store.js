/**
 * FF14 Weather Forecast - Weather Store
 * Reactive state management with URL hash synchronization and a memory of the
 * last selection (localStorage)
 */

class WeatherStore {
    // localStorage key of the last selection:
    // { zoneId, desiredWeathers: string[], previousWeathers: string[], beginHour, endHour }
    // The special event is never remembered, it only lives in the URL hash.
    static STORAGE_KEY = 'ff14tw_weather_selection';

    /**
     * Create a new WeatherStore instance
     */
    constructor() {
        // State
        this.state = {
            zoneId: null,
            desiredWeathers: new Set(),
            previousWeathers: new Set(),
            beginHour: 0,
            endHour: 24,
            event: null
        };

        // Subscribers
        this.subscribers = [];

        // Bind methods
        this.handleHashChange = this.handleHashChange.bind(this);
    }

    /**
     * Initialize the store and set up hash change listener
     *
     * Initial state, in order of priority:
     * 1. a valid URL hash (a shared link), which is also remembered as the latest selection
     * 2. the remembered selection when the hash is empty or invalid, written back to the URL
     *    so the share link keeps working
     * 3. nothing: the first-visit state
     */
    init() {
        // Listen for hash changes
        window.addEventListener('hashchange', this.handleHashChange);

        if (this.loadFromHash()) {
            return;
        }

        if (this.loadFromStorage()) {
            this.saveToHash();
            return;
        }

        this.reset();
    }

    /**
     * Destroy the store and remove listeners
     */
    destroy() {
        window.removeEventListener('hashchange', this.handleHashChange);
        this.subscribers = [];
    }

    /**
     * Subscribe to state changes
     * @param {function} callback - Function to call when state changes
     * @returns {function} Unsubscribe function
     */
    subscribe(callback) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    /**
     * Notify all subscribers of state change
     * @param {string} changeType - Type of change that occurred
     */
    notify(changeType) {
        for (const callback of this.subscribers) {
            callback(this.state, changeType);
        }
    }

    /**
     * Handle hash change event
     * While the page stays open a valid hash is followed (and remembered); an invalid or
     * emptied one resets the screen. The remembered selection is neither read nor cleared.
     */
    handleHashChange() {
        if (!this.loadFromHash()) {
            this.reset();
        }
    }

    /**
     * Load state from URL hash
     * Format: #zone-id-w1-w2-p1-p2-b-e-event
     * Where w = desired weather indices, p = previous weather indices,
     * b = begin hour, e = end hour
     *
     * A valid hash becomes the state and is remembered as the latest selection.
     * An empty hash or one that names no known zone changes nothing; the caller decides
     * what happens then (init() falls back to the remembered selection, a hash change
     * resets the screen).
     * @returns {boolean} True if the hash named a known zone and was applied
     */
    loadFromHash() {
        const hash = window.location.hash.slice(1);
        if (!hash) {
            return false;
        }

        const parts = hash.split('-');
        if (parts.length === 0) {
            return false;
        }

        // Parse zone ID (may contain dashes)
        // Try to find a matching zone by progressively combining parts
        let zoneId = null;
        let remainingIndex = 0;

        for (let i = 1; i <= parts.length; i++) {
            const testId = parts.slice(0, i).join('-');
            if (window.WeatherZoneData && window.WeatherZoneData.getZone(testId)) {
                zoneId = testId;
                remainingIndex = i;
            }
        }

        if (!zoneId) {
            return false;
        }

        // Parse remaining parameters
        const params = parts.slice(remainingIndex);
        const desiredWeathers = new Set();
        const previousWeathers = new Set();
        let beginHour = 0;
        let endHour = 24;
        let event = null;

        // Simple format: just zone
        if (params.length === 0) {
            this.setState({
                zoneId,
                desiredWeathers,
                previousWeathers,
                beginHour,
                endHour,
                event
            });
            this.saveToStorage();
            return true;
        }

        // Extended format: zone-dw-pw-begin-end-event
        // dw = desired weathers (comma-separated indices)
        // pw = previous weathers (comma-separated indices)
        // begin = begin hour
        // end = end hour
        // event = special event name

        if (params.length >= 1 && params[0]) {
            const indices = params[0].split(',').filter(Boolean);
            for (const idx of indices) {
                const weatherName = this.getWeatherByIndex(parseInt(idx, 10));
                if (weatherName) {
                    desiredWeathers.add(weatherName);
                }
            }
        }

        if (params.length >= 2 && params[1]) {
            const indices = params[1].split(',').filter(Boolean);
            for (const idx of indices) {
                const weatherName = this.getWeatherByIndex(parseInt(idx, 10));
                if (weatherName) {
                    previousWeathers.add(weatherName);
                }
            }
        }

        if (params.length >= 3 && params[2]) {
            const parsed = parseInt(params[2], 10);
            beginHour = isNaN(parsed) ? 0 : Math.max(0, Math.min(23, parsed));
        }

        if (params.length >= 4 && params[3]) {
            const parsed = parseInt(params[3], 10);
            endHour = isNaN(parsed) ? 24 : Math.max(0, Math.min(24, parsed));
        }

        if (params.length >= 5 && params[4]) {
            // Validate event name against known events
            const validEvents = ['garlok', 'laideronnette'];
            const eventValue = params[4].toLowerCase();
            event = validEvents.includes(eventValue) ? eventValue : null;
        }

        this.setState({
            zoneId,
            desiredWeathers,
            previousWeathers,
            beginHour,
            endHour,
            event
        });
        this.saveToStorage();
        return true;
    }

    /**
     * Build the URL hash (without the leading #) for a state
     *
     * Same format as loadFromHash() reads. The weather indices are sorted ascending so the
     * same selection always gives the same hash, wherever it comes from (a state, a stored
     * reminder target). Static, so it works without a store instance.
     * @param {object} state - { zoneId, desiredWeathers, previousWeathers, beginHour, endHour, event };
     *     the two weather fields can be a Set or an array of weather names
     * @returns {string} The hash, or '' when there is no zone
     */
    static hashOf(state) {
        if (!state || !state.zoneId) {
            return '';
        }

        const weatherTypes = window.WeatherZoneData ? Object.keys(window.WeatherZoneData.weatherTypes) : [];
        const indicesOf = (weathers) => Array.from(weathers)
            .map(w => weatherTypes.indexOf(w))
            .filter(i => i !== -1)
            .sort((a, b) => a - b)
            .join(',');

        const desiredWeathers = new Set(state.desiredWeathers);
        const previousWeathers = new Set(state.previousWeathers);
        let hash = state.zoneId;

        // Only add parameters if there are filters
        const hasFilters =
            desiredWeathers.size > 0 ||
            previousWeathers.size > 0 ||
            state.beginHour !== 0 ||
            state.endHour !== 24 ||
            state.event;

        if (hasFilters) {
            hash += `-${indicesOf(desiredWeathers)}-${indicesOf(previousWeathers)}-${state.beginHour}-${state.endHour}`;

            if (state.event) {
                hash += `-${state.event}`;
            }
        }

        return hash;
    }

    /**
     * Save current state to URL hash
     */
    saveToHash() {
        const hash = WeatherStore.hashOf(this.state);
        history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname);
    }

    /**
     * Load the last remembered selection from localStorage
     *
     * Unusable memory (nothing stored, broken JSON, an unknown zone, storage blocked by the
     * browser) is ignored. Fixable memory is fixed: weathers the zone never has are dropped,
     * and hours out of range fall back to the whole day (0-24). The special event is not
     * remembered, so it is always cleared. The URL hash is not touched.
     * @returns {boolean} True if a selection was restored
     */
    loadFromStorage() {
        let saved;
        try {
            const raw = window.localStorage.getItem(WeatherStore.STORAGE_KEY);
            if (!raw) return false;
            saved = JSON.parse(raw);
        } catch (error) {
            // Blocked storage or broken JSON: behave as if nothing was remembered
            return false;
        }

        if (!saved || typeof saved !== 'object') {
            return false;
        }

        const zone = window.WeatherZoneData ? window.WeatherZoneData.getZone(saved.zoneId) : null;
        if (!zone) {
            return false;
        }

        // Weather table is [weather1, chance1, weather2, chance2, ..., weatherN]
        const zoneWeathers = new Set(zone.weatherTable.filter((_, i) => i % 2 === 0));
        const weathersOf = (names) => new Set(Array.isArray(names) ? names.filter(w => zoneWeathers.has(w)) : []);
        const hourOr = (hour, max, fallback) => (Number.isInteger(hour) && hour >= 0 && hour <= max ? hour : fallback);

        this.setState({
            zoneId: zone.id,
            desiredWeathers: weathersOf(saved.desiredWeathers),
            previousWeathers: weathersOf(saved.previousWeathers),
            beginHour: hourOr(saved.beginHour, 23, 0),
            endHour: hourOr(saved.endHour, 24, 24),
            event: null
        });
        return true;
    }

    /**
     * Remember the current selection in localStorage (zone, weathers and time of day,
     * not the special event). Nothing is written without a zone; a browser that blocks
     * or refuses the write just means the selection is not remembered for next time.
     */
    saveToStorage() {
        if (!this.state.zoneId) {
            return;
        }

        try {
            window.localStorage.setItem(WeatherStore.STORAGE_KEY, JSON.stringify({
                zoneId: this.state.zoneId,
                desiredWeathers: Array.from(this.state.desiredWeathers),
                previousWeathers: Array.from(this.state.previousWeathers),
                beginHour: this.state.beginHour,
                endHour: this.state.endHour
            }));
        } catch (error) {
            // Blocked storage or no space left: carry on without remembering
        }
    }

    /**
     * Get weather index for hash encoding
     * @param {string} weatherName - Weather name
     * @returns {number} Weather index or -1 if not found
     */
    getWeatherIndex(weatherName) {
        if (!window.WeatherZoneData) return -1;
        const weatherTypes = Object.keys(window.WeatherZoneData.weatherTypes);
        return weatherTypes.indexOf(weatherName);
    }

    /**
     * Get weather name from index
     * @param {number} index - Weather index
     * @returns {string|null} Weather name or null if invalid
     */
    getWeatherByIndex(index) {
        if (!window.WeatherZoneData) return null;
        const weatherTypes = Object.keys(window.WeatherZoneData.weatherTypes);
        return weatherTypes[index] || null;
    }

    /**
     * Set the entire state
     * @param {object} newState - New state object
     * @param {boolean} updateHash - Whether to update URL hash (and remember the selection)
     */
    setState(newState, updateHash = false) {
        this.state = { ...newState };
        if (updateHash) {
            this.saveToHash();
            this.saveToStorage();
        }
        this.notify('state');
    }

    /**
     * Reset state to defaults
     */
    reset() {
        this.state = {
            zoneId: null,
            desiredWeathers: new Set(),
            previousWeathers: new Set(),
            beginHour: 0,
            endHour: 24,
            event: null
        };
        this.notify('reset');
    }

    /**
     * Set the selected zone
     * @param {string} zoneId - Zone ID
     */
    setZone(zoneId) {
        this.state.zoneId = zoneId;
        this.state.desiredWeathers = new Set();
        this.state.previousWeathers = new Set();
        this.state.beginHour = 0;
        this.state.endHour = 24;
        this.state.event = null;
        this.saveToHash();
        this.saveToStorage();
        this.notify('zone');
    }

    /**
     * Toggle a desired weather
     * @param {string} weatherName - Weather name to toggle
     */
    toggleDesiredWeather(weatherName) {
        if (this.state.desiredWeathers.has(weatherName)) {
            this.state.desiredWeathers.delete(weatherName);
        } else {
            this.state.desiredWeathers.add(weatherName);
        }
        this.saveToHash();
        this.saveToStorage();
        this.notify('desiredWeathers');
    }

    /**
     * Toggle a previous weather
     * @param {string} weatherName - Weather name to toggle
     */
    togglePreviousWeather(weatherName) {
        if (this.state.previousWeathers.has(weatherName)) {
            this.state.previousWeathers.delete(weatherName);
        } else {
            this.state.previousWeathers.add(weatherName);
        }
        this.saveToHash();
        this.saveToStorage();
        this.notify('previousWeathers');
    }

    /**
     * Set the time range
     * @param {number} beginHour - Begin hour (0-23)
     * @param {number} endHour - End hour (0-24)
     */
    setTimeRange(beginHour, endHour) {
        this.state.beginHour = beginHour;
        this.state.endHour = endHour;
        this.saveToHash();
        this.saveToStorage();
        this.notify('timeRange');
    }

    /**
     * Set a special event filter
     * @param {string|null} event - Event name or null to clear
     */
    setEvent(event) {
        this.state.event = event;
        this.saveToHash();
        this.saveToStorage();
        this.notify('event');
    }

    /**
     * Clear all filters but keep zone
     */
    clearFilters() {
        this.state.desiredWeathers = new Set();
        this.state.previousWeathers = new Set();
        this.state.beginHour = 0;
        this.state.endHour = 24;
        this.state.event = null;
        this.saveToHash();
        this.saveToStorage();
        this.notify('clearFilters');
    }

    /**
     * Clear the previous weathers and the time of day, but keep the zone, the desired
     * weathers and the special event
     */
    clearConditions() {
        this.state.previousWeathers = new Set();
        this.state.beginHour = 0;
        this.state.endHour = 24;
        this.saveToHash();
        this.saveToStorage();
        this.notify('conditions');
    }

    /**
     * Check if there are any active filters
     * @returns {boolean} True if any filters are active
     */
    hasActiveFilters() {
        return (
            this.state.desiredWeathers.size > 0 ||
            this.state.previousWeathers.size > 0 ||
            this.state.beginHour !== 0 ||
            this.state.endHour !== 24 ||
            this.state.event !== null
        );
    }

    /**
     * Get the current zone object
     * @returns {object|null} Zone object or null
     */
    getCurrentZone() {
        if (!this.state.zoneId || !window.WeatherZoneData) {
            return null;
        }
        return window.WeatherZoneData.getZone(this.state.zoneId);
    }

    /**
     * Get available weathers for the current zone
     * @returns {array} Array of weather names
     */
    getAvailableWeathers() {
        const zone = this.getCurrentZone();
        if (!zone) return [];

        const weathers = new Set();
        const table = zone.weatherTable;

        for (let i = 0; i < table.length; i += 2) {
            weathers.add(table[i]);
        }

        return Array.from(weathers);
    }
}

// Export for use in other modules
window.WeatherStore = WeatherStore;
