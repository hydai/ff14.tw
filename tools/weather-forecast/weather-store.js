/**
 * FF14 Weather Forecast - Weather Store
 * Reactive state management with URL hash synchronization
 */

class WeatherStore {
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
     */
    init() {
        // Listen for hash changes
        window.addEventListener('hashchange', this.handleHashChange);

        // Load initial state from hash
        this.loadFromHash();
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
     */
    handleHashChange() {
        this.loadFromHash();
    }

    /**
     * Load state from URL hash
     * Format: #zone-id-w1-w2-p1-p2-b-e-event
     * Where w = desired weather indices, p = previous weather indices,
     * b = begin hour, e = end hour
     */
    loadFromHash() {
        const hash = window.location.hash.slice(1);
        if (!hash) {
            this.reset();
            return;
        }

        const parts = hash.split('-');
        if (parts.length === 0) {
            this.reset();
            return;
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
            this.reset();
            return;
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
            return;
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
    }

    /**
     * Save current state to URL hash
     */
    saveToHash() {
        if (!this.state.zoneId) {
            history.replaceState(null, '', window.location.pathname);
            return;
        }

        let hash = this.state.zoneId;

        // Only add parameters if there are filters
        const hasFilters =
            this.state.desiredWeathers.size > 0 ||
            this.state.previousWeathers.size > 0 ||
            this.state.beginHour !== 0 ||
            this.state.endHour !== 24 ||
            this.state.event;

        if (hasFilters) {
            // Desired weathers
            const dwIndices = Array.from(this.state.desiredWeathers)
                .map(w => this.getWeatherIndex(w))
                .filter(i => i !== -1)
                .join(',');

            // Previous weathers
            const pwIndices = Array.from(this.state.previousWeathers)
                .map(w => this.getWeatherIndex(w))
                .filter(i => i !== -1)
                .join(',');

            hash += `-${dwIndices}-${pwIndices}-${this.state.beginHour}-${this.state.endHour}`;

            if (this.state.event) {
                hash += `-${this.state.event}`;
            }
        }

        history.replaceState(null, '', `#${hash}`);
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
     * @param {boolean} updateHash - Whether to update URL hash
     */
    setState(newState, updateHash = false) {
        this.state = { ...newState };
        if (updateHash) {
            this.saveToHash();
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
        this.notify('timeRange');
    }

    /**
     * Set a special event filter
     * @param {string|null} event - Event name or null to clear
     */
    setEvent(event) {
        this.state.event = event;
        this.saveToHash();
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
        this.notify('clearFilters');
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
