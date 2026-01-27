/**
 * FF14 Weather Forecast - Main Controller
 * Orchestrates all modules and handles UI interactions
 */

class WeatherForecast {
    // Constants
    static CONSTANTS = {
        DEBOUNCE_DELAY: 300,
        INITIAL_RESULTS: 24,
        MAX_RESULTS: 200,
        TIME_UPDATE_INTERVAL: 1000,
        CSS_CLASSES: {
            ACTIVE: 'active',
            COLLAPSED: 'collapsed',
            CURRENT: 'current-weather',
            IN_RANGE: 'in-range',
            SELECTED: 'selected'
        }
    };

    constructor() {
        // State
        this.resultCount = WeatherForecast.CONSTANTS.INITIAL_RESULTS;
        this.timeUpdateInterval = null;
        this.timeRangeStart = null;
        this.isSelectingTimeRange = false;

        // Modules
        this.store = new WeatherStore();
        this.search = new WeatherSearch();

        // DOM elements cache
        this.elements = {
            // Time display
            currentET: document.getElementById('currentET'),
            currentLT: document.getElementById('currentLT'),

            // Zone selection
            zoneList: document.getElementById('zoneList'),
            noZoneSelected: document.getElementById('noZoneSelected'),
            zoneContent: document.getElementById('zoneContent'),
            selectedZoneName: document.getElementById('selectedZoneName'),

            // Filters
            desiredWeatherTags: document.getElementById('desiredWeatherTags'),
            previousWeatherTags: document.getElementById('previousWeatherTags'),
            timeGrid: document.getElementById('timeGrid'),
            timeRangeText: document.getElementById('timeRangeText'),
            clearFiltersBtn: document.getElementById('clearFiltersBtn'),

            // Results
            resultsTitle: document.getElementById('resultsTitle'),
            resultsLoading: document.getElementById('resultsLoading'),
            resultsContainer: document.getElementById('resultsContainer'),
            resultsBody: document.getElementById('resultsBody'),
            noResults: document.getElementById('noResults'),
            showMoreBtn: document.getElementById('showMoreBtn'),

            // Actions
            shareBtn: document.getElementById('shareBtn'),
            toast: document.getElementById('toast')
        };

        // Initialize
        this.init();
    }

    /**
     * Initialize the weather forecast tool
     */
    init() {
        // Initialize store
        this.store.init();

        // Subscribe to state changes
        this.store.subscribe((state, changeType) => this.handleStateChange(state, changeType));

        // Build UI
        this.buildZoneList();
        this.buildTimeGrid();

        // Set up event listeners
        this.bindEvents();

        // Start time updates
        this.startTimeUpdates();

        // Initial render based on URL hash
        if (this.store.state.zoneId) {
            this.showZoneContent();
            this.renderWeatherTags();
            this.updateTimeRangeUI();
            this.renderResults();
        }
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Zone selection (delegated)
        this.elements.zoneList.addEventListener('click', (e) => this.handleZoneClick(e));

        // Filter controls
        this.elements.desiredWeatherTags.addEventListener('click', (e) => this.handleWeatherTagClick(e, 'desired'));
        this.elements.previousWeatherTags.addEventListener('click', (e) => this.handleWeatherTagClick(e, 'previous'));
        this.elements.clearFiltersBtn.addEventListener('click', () => this.handleClearFilters());

        // Time grid
        this.elements.timeGrid.addEventListener('click', (e) => this.handleTimeGridClick(e));
        this.elements.timeGrid.addEventListener('mouseenter', (e) => this.handleTimeGridHover(e), true);

        // Results
        this.elements.showMoreBtn.addEventListener('click', () => this.handleShowMore());

        // Share
        this.elements.shareBtn.addEventListener('click', () => this.handleShare());
    }

    /**
     * Build the zone list UI
     */
    buildZoneList() {
        const grouped = WeatherZoneData.getZonesGroupedByRegion();
        const fragment = document.createDocumentFragment();
        const lang = window.i18n ? window.i18n.currentLang : 'zh';

        for (const [regionId, zones] of Object.entries(grouped)) {
            const regionInfo = WeatherZoneData.regions[regionId];
            if (!regionInfo) continue;

            const regionGroup = document.createElement('div');
            regionGroup.className = 'region-group';

            // Region header
            const header = document.createElement('div');
            header.className = 'region-header';
            header.dataset.region = regionId;

            const expandIcon = document.createElement('span');
            expandIcon.className = 'expand-icon';
            expandIcon.textContent = '▼';

            const regionName = document.createElement('span');
            regionName.textContent = regionInfo[lang] || regionInfo.zh;

            header.appendChild(expandIcon);
            header.appendChild(regionName);

            // Zone buttons container
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'zone-buttons';

            for (const zone of zones) {
                const btn = document.createElement('button');
                btn.className = 'zone-btn';
                btn.dataset.zone = zone.id;
                btn.textContent = zone[lang] || zone.zh;
                buttonsContainer.appendChild(btn);
            }

            regionGroup.appendChild(header);
            regionGroup.appendChild(buttonsContainer);
            fragment.appendChild(regionGroup);
        }

        this.elements.zoneList.appendChild(fragment);
    }

    /**
     * Build the time grid UI
     */
    buildTimeGrid() {
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < 24; i++) {
            const cell = document.createElement('div');
            cell.className = 'time-cell';
            cell.dataset.hour = i;
            cell.textContent = String(i).padStart(2, '0');
            fragment.appendChild(cell);
        }

        this.elements.timeGrid.appendChild(fragment);
    }

    /**
     * Start time update interval
     */
    startTimeUpdates() {
        this.updateTimeDisplay();
        this.timeUpdateInterval = setInterval(() => {
            this.updateTimeDisplay();
        }, WeatherForecast.CONSTANTS.TIME_UPDATE_INTERVAL);
    }

    /**
     * Update the current time display
     */
    updateTimeDisplay() {
        const now = Date.now();

        // Eorzea time
        this.elements.currentET.textContent = WeatherCalculator.formatEorzeaTime(now);

        // Local time
        const localTime = new Date(now);
        const hours = String(localTime.getHours()).padStart(2, '0');
        const minutes = String(localTime.getMinutes()).padStart(2, '0');
        this.elements.currentLT.textContent = `${hours}:${minutes}`;
    }

    /**
     * Handle state changes from the store
     */
    handleStateChange(state, changeType) {
        switch (changeType) {
            case 'zone':
                this.showZoneContent();
                this.renderWeatherTags();
                this.updateTimeRangeUI();
                this.resultCount = WeatherForecast.CONSTANTS.INITIAL_RESULTS;
                this.renderResults();
                break;
            case 'desiredWeathers':
            case 'previousWeathers':
                this.updateWeatherTagsUI();
                this.resultCount = WeatherForecast.CONSTANTS.INITIAL_RESULTS;
                this.renderResults();
                break;
            case 'timeRange':
                this.updateTimeRangeUI();
                this.resultCount = WeatherForecast.CONSTANTS.INITIAL_RESULTS;
                this.renderResults();
                break;
            case 'clearFilters':
                this.renderWeatherTags();
                this.updateTimeRangeUI();
                this.resultCount = WeatherForecast.CONSTANTS.INITIAL_RESULTS;
                this.renderResults();
                break;
            case 'reset':
                this.hideZoneContent();
                break;
        }
    }

    /**
     * Handle zone button click
     */
    handleZoneClick(e) {
        // Handle region header click (collapse/expand)
        const header = e.target.closest('.region-header');
        if (header) {
            const group = header.closest('.region-group');
            group.classList.toggle(WeatherForecast.CONSTANTS.CSS_CLASSES.COLLAPSED);
            return;
        }

        // Handle zone button click
        const btn = e.target.closest('.zone-btn');
        if (btn) {
            const zoneId = btn.dataset.zone;

            // Update active state
            const allBtns = this.elements.zoneList.querySelectorAll('.zone-btn');
            allBtns.forEach(b => b.classList.remove(WeatherForecast.CONSTANTS.CSS_CLASSES.ACTIVE));
            btn.classList.add(WeatherForecast.CONSTANTS.CSS_CLASSES.ACTIVE);

            // Update store
            this.store.setZone(zoneId);
        }
    }

    /**
     * Handle weather tag click
     */
    handleWeatherTagClick(e, type) {
        const tag = e.target.closest('.weather-tag');
        if (!tag) return;

        const weather = tag.dataset.weather;
        if (type === 'desired') {
            this.store.toggleDesiredWeather(weather);
        } else {
            this.store.togglePreviousWeather(weather);
        }
    }

    /**
     * Handle time grid click
     */
    handleTimeGridClick(e) {
        const cell = e.target.closest('.time-cell');
        if (!cell) return;

        const hour = parseInt(cell.dataset.hour, 10);

        if (!this.isSelectingTimeRange) {
            // Start selection
            this.isSelectingTimeRange = true;
            this.timeRangeStart = hour;
            this.updateTimeGridPreview(hour, hour);
        } else {
            // End selection
            this.isSelectingTimeRange = false;
            const endHour = (hour + 1) % 25; // Make end exclusive
            this.store.setTimeRange(this.timeRangeStart, endHour === 0 ? 24 : endHour);
            this.timeRangeStart = null;
        }
    }

    /**
     * Handle time grid hover
     */
    handleTimeGridHover(e) {
        if (!this.isSelectingTimeRange) return;

        const cell = e.target.closest('.time-cell');
        if (!cell) return;

        const hour = parseInt(cell.dataset.hour, 10);
        this.updateTimeGridPreview(this.timeRangeStart, hour);
    }

    /**
     * Update time grid preview during selection
     */
    updateTimeGridPreview(start, end) {
        const cells = this.elements.timeGrid.querySelectorAll('.time-cell');
        cells.forEach((cell, i) => {
            cell.classList.remove(WeatherForecast.CONSTANTS.CSS_CLASSES.IN_RANGE, WeatherForecast.CONSTANTS.CSS_CLASSES.SELECTED);

            if (start <= end) {
                if (i >= start && i <= end) {
                    cell.classList.add(WeatherForecast.CONSTANTS.CSS_CLASSES.IN_RANGE);
                }
            } else {
                if (i >= start || i <= end) {
                    cell.classList.add(WeatherForecast.CONSTANTS.CSS_CLASSES.IN_RANGE);
                }
            }

            if (i === start || i === end) {
                cell.classList.add(WeatherForecast.CONSTANTS.CSS_CLASSES.SELECTED);
            }
        });
    }

    /**
     * Handle clear filters button
     */
    handleClearFilters() {
        this.store.clearFilters();
    }

    /**
     * Handle show more button
     */
    handleShowMore() {
        this.resultCount = Math.min(
            this.resultCount * 2,
            WeatherForecast.CONSTANTS.MAX_RESULTS
        );
        this.renderResults();
    }

    /**
     * Handle share button
     */
    handleShare() {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            this.showToast(window.i18n ? window.i18n.t('weather_copied') : '已複製到剪貼簿');
        });
    }

    /**
     * Show zone content panel
     */
    showZoneContent() {
        this.elements.noZoneSelected.style.display = 'none';
        this.elements.zoneContent.style.display = 'block';

        // Update zone name
        const zone = this.store.getCurrentZone();
        if (zone) {
            const lang = window.i18n ? window.i18n.currentLang : 'zh';
            this.elements.selectedZoneName.textContent = zone[lang] || zone.zh;
        }
    }

    /**
     * Hide zone content panel
     */
    hideZoneContent() {
        this.elements.noZoneSelected.style.display = 'flex';
        this.elements.zoneContent.style.display = 'none';

        // Clear active zone button
        const allBtns = this.elements.zoneList.querySelectorAll('.zone-btn');
        allBtns.forEach(b => b.classList.remove(WeatherForecast.CONSTANTS.CSS_CLASSES.ACTIVE));
    }

    /**
     * Render weather tags for the current zone
     */
    renderWeatherTags() {
        const weathers = this.store.getAvailableWeathers();
        const lang = window.i18n ? window.i18n.currentLang : 'zh';

        // Clear existing tags
        this.elements.desiredWeatherTags.textContent = '';
        this.elements.previousWeatherTags.textContent = '';

        for (const weather of weathers) {
            const info = WeatherZoneData.getWeatherInfo(weather);
            if (!info) continue;

            // Create tag for desired weathers
            const desiredTag = this.createWeatherTag(weather, info, lang);
            this.elements.desiredWeatherTags.appendChild(desiredTag);

            // Create tag for previous weathers
            const previousTag = this.createWeatherTag(weather, info, lang);
            this.elements.previousWeatherTags.appendChild(previousTag);
        }

        this.updateWeatherTagsUI();
    }

    /**
     * Create a weather tag element
     */
    createWeatherTag(weather, info, lang) {
        const tag = document.createElement('button');
        tag.className = 'weather-tag';
        tag.dataset.weather = weather;

        const icon = document.createElement('span');
        icon.className = 'weather-icon';
        icon.textContent = info.icon;

        const name = document.createElement('span');
        name.className = 'weather-name';
        name.textContent = info[lang] || info.zh;

        tag.appendChild(icon);
        tag.appendChild(name);

        return tag;
    }

    /**
     * Update weather tags UI to reflect current selections
     */
    updateWeatherTagsUI() {
        // Update desired weather tags
        const desiredTags = this.elements.desiredWeatherTags.querySelectorAll('.weather-tag');
        desiredTags.forEach(tag => {
            const weather = tag.dataset.weather;
            tag.classList.toggle(
                WeatherForecast.CONSTANTS.CSS_CLASSES.ACTIVE,
                this.store.state.desiredWeathers.has(weather)
            );
        });

        // Update previous weather tags
        const previousTags = this.elements.previousWeatherTags.querySelectorAll('.weather-tag');
        previousTags.forEach(tag => {
            const weather = tag.dataset.weather;
            tag.classList.toggle(
                WeatherForecast.CONSTANTS.CSS_CLASSES.ACTIVE,
                this.store.state.previousWeathers.has(weather)
            );
        });
    }

    /**
     * Update time range UI
     */
    updateTimeRangeUI() {
        const { beginHour, endHour } = this.store.state;

        // Update grid cells
        const cells = this.elements.timeGrid.querySelectorAll('.time-cell');
        cells.forEach((cell, i) => {
            cell.classList.remove(
                WeatherForecast.CONSTANTS.CSS_CLASSES.SELECTED,
                WeatherForecast.CONSTANTS.CSS_CLASSES.IN_RANGE
            );

            if (WeatherCalculator.isInTimeRange(i, beginHour, endHour)) {
                cell.classList.add(WeatherForecast.CONSTANTS.CSS_CLASSES.IN_RANGE);
            }
        });

        // Update text display
        const beginText = String(beginHour).padStart(2, '0') + ':00';
        const endText = String(endHour).padStart(2, '0') + ':00';
        this.elements.timeRangeText.textContent = `${beginText} - ${endText}`;
    }

    /**
     * Render search results
     */
    renderResults() {
        const zone = this.store.getCurrentZone();
        if (!zone) return;

        // Show loading
        this.elements.resultsLoading.style.display = 'block';
        this.elements.resultsContainer.style.display = 'none';
        this.elements.noResults.style.display = 'none';
        this.elements.showMoreBtn.style.display = 'none';

        // Use requestAnimationFrame to avoid blocking
        requestAnimationFrame(() => {
            let results;

            if (this.store.hasActiveFilters()) {
                // Search with filters
                results = this.search.search(zone, {
                    desiredWeathers: this.store.state.desiredWeathers,
                    previousWeathers: this.store.state.previousWeathers,
                    beginHour: this.store.state.beginHour,
                    endHour: this.store.state.endHour,
                    event: this.store.state.event
                }, Date.now(), this.resultCount);

                // Update title
                this.elements.resultsTitle.textContent = window.i18n
                    ? window.i18n.t('weather_results')
                    : '搜尋結果';
            } else {
                // Timetable view (no filters)
                results = this.search.getUpcomingWeather(zone, Date.now(), this.resultCount);

                // Update title
                this.elements.resultsTitle.textContent = window.i18n
                    ? window.i18n.t('weather_timetable')
                    : '天氣時刻表';
            }

            // Hide loading
            this.elements.resultsLoading.style.display = 'none';

            if (results.length === 0) {
                this.elements.noResults.style.display = 'block';
                return;
            }

            // Render results
            this.renderResultsTable(results);
            this.elements.resultsContainer.style.display = 'block';

            // Show "show more" button if there might be more results
            if (results.length >= this.resultCount && this.resultCount < WeatherForecast.CONSTANTS.MAX_RESULTS) {
                this.elements.showMoreBtn.style.display = 'block';
            }
        });
    }

    /**
     * Render results table
     */
    renderResultsTable(results) {
        const lang = window.i18n ? window.i18n.currentLang : 'zh';
        const fragment = document.createDocumentFragment();
        const now = Date.now();

        for (const result of results) {
            const row = document.createElement('tr');

            // Check if this is the current weather period
            if (result.start <= now && result.end > now) {
                row.classList.add(WeatherForecast.CONSTANTS.CSS_CLASSES.CURRENT);
            }

            // Local time
            const localTimeCell = document.createElement('td');
            localTimeCell.textContent = WeatherCalculator.formatLocalTime(result.start, true);
            row.appendChild(localTimeCell);

            // Eorzea time
            const etCell = document.createElement('td');
            const etHours = String(result.eorzeaTime.hours).padStart(2, '0');
            etCell.textContent = `${etHours}:00`;
            row.appendChild(etCell);

            // Current weather
            const weatherCell = document.createElement('td');
            const weatherInfo = WeatherZoneData.getWeatherInfo(result.weather);
            if (weatherInfo) {
                const weatherSpan = document.createElement('span');
                weatherSpan.className = 'weather-cell';

                const icon = document.createElement('span');
                icon.className = 'weather-icon';
                icon.textContent = weatherInfo.icon;

                const name = document.createElement('span');
                name.textContent = weatherInfo[lang] || weatherInfo.zh;

                weatherSpan.appendChild(icon);
                weatherSpan.appendChild(name);
                weatherCell.appendChild(weatherSpan);
            } else {
                weatherCell.textContent = result.weather;
            }
            row.appendChild(weatherCell);

            // Previous weather
            const prevWeatherCell = document.createElement('td');
            if (result.previousWeather) {
                const prevInfo = WeatherZoneData.getWeatherInfo(result.previousWeather);
                if (prevInfo) {
                    const prevSpan = document.createElement('span');
                    prevSpan.className = 'weather-cell';

                    const prevIcon = document.createElement('span');
                    prevIcon.className = 'weather-icon';
                    prevIcon.textContent = prevInfo.icon;

                    const prevName = document.createElement('span');
                    prevName.textContent = prevInfo[lang] || prevInfo.zh;

                    prevSpan.appendChild(prevIcon);
                    prevSpan.appendChild(prevName);
                    prevWeatherCell.appendChild(prevSpan);
                } else {
                    prevWeatherCell.textContent = result.previousWeather;
                }
            } else {
                prevWeatherCell.textContent = '-';
            }
            row.appendChild(prevWeatherCell);

            fragment.appendChild(row);
        }

        // Clear and append
        this.elements.resultsBody.textContent = '';
        this.elements.resultsBody.appendChild(fragment);
    }

    /**
     * Show toast notification
     */
    showToast(message) {
        this.elements.toast.textContent = message;
        this.elements.toast.classList.add('show');

        setTimeout(() => {
            this.elements.toast.classList.remove('show');
        }, 2000);
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }
        this.store.destroy();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.weatherForecast = new WeatherForecast();
});
