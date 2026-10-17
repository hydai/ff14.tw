/**
 * FF14 Weather Forecast - Main Controller
 * The selection side (zone dropdown, weather chips, and "more conditions" with the
 * time of day and the previous weather) and the zone's weather timetable
 */

class WeatherForecast {
    // Constants
    static CONSTANTS = {
        INITIAL_RESULTS: 24, // timetable rows at first
        MAX_RESULTS: 200, // "show more" doubles the rows up to this many
        TIME_UPDATE_INTERVAL: 1000,
        CSS_CLASSES: {
            ACTIVE: 'active',
            CURRENT: 'current-weather',
            IN_RANGE: 'in-range',
            SELECTED: 'selected'
        }
    };

    constructor() {
        // State
        this.timetableCount = WeatherForecast.CONSTANTS.INITIAL_RESULTS;
        this.timetableZoneId = null; // the zone timetableCount belongs to
        this.timeUpdateInterval = null;
        this.currentPeriodStart = null;
        this.timeRangeStart = null;
        this.isSelectingTimeRange = false;

        // Modules
        this.store = new WeatherStore();
        this.search = new WeatherSearch();

        // DOM elements cache
        this.elements = {
            // Clock
            currentET: document.getElementById('currentET'),
            currentLT: document.getElementById('currentLT'),

            // Selection side
            firstVisitPrompt: document.getElementById('firstVisitPrompt'),
            zoneSelect: document.getElementById('zoneSelect'),
            zoneHint: document.getElementById('zoneHint'),
            shareBtn: document.getElementById('shareBtn'),
            weatherField: document.getElementById('weatherField'),
            desiredWeatherTags: document.getElementById('desiredWeatherTags'),
            moreConditions: document.getElementById('moreConditions'),
            moreSummary: document.getElementById('moreSummary'),
            timeGrid: document.getElementById('timeGrid'),
            timeRangeText: document.getElementById('timeRangeText'),
            previousWeatherTags: document.getElementById('previousWeatherTags'),
            clearFiltersBtn: document.getElementById('clearFiltersBtn'),

            // Main column
            noZoneSelected: document.getElementById('noZoneSelected'),
            zoneContent: document.getElementById('zoneContent'),
            timetableTitle: document.getElementById('timetableTitle'),
            resultsBody: document.getElementById('resultsBody'),
            showMoreBtn: document.getElementById('showMoreBtn')
        };

        // Initialize
        this.init();
    }

    /**
     * Initialize the weather forecast tool
     */
    init() {
        // The store notifies about the state it loads before it remembers it or rewrites the
        // URL, so it is initialised before anything subscribes; the first render below reads
        // store.state instead
        this.store.init();
        this.store.subscribe((state, changeType) => this.handleStateChange(state, changeType));

        // Build UI
        this.buildZoneSelect();
        this.buildTimeGrid();

        // Set up event listeners
        this.bindEvents();

        // Start time updates
        this.startTimeUpdates();

        // Initial render from the loaded state (shared link, remembered selection or first visit)
        this.handleStateChange(this.store.state, 'state');

        if (window.i18n) {
            window.i18n.onLanguageChange(() => this.handleLanguageChange());
        }
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Zone dropdown
        this.elements.zoneSelect.addEventListener('change', () => this.handleZoneChange());

        // Weather chips and conditions
        this.elements.desiredWeatherTags.addEventListener('click', (e) => this.handleWeatherTagClick(e, 'desired'));
        this.elements.previousWeatherTags.addEventListener('click', (e) => this.handleWeatherTagClick(e, 'previous'));
        this.elements.clearFiltersBtn.addEventListener('click', () => this.store.clearConditions());

        // Time grid - click and keyboard
        this.elements.timeGrid.addEventListener('click', (e) => this.handleTimeGridClick(e));
        this.elements.timeGrid.addEventListener('keydown', (e) => this.handleTimeGridKeydown(e));
        this.elements.timeGrid.addEventListener('mouseenter', (e) => this.handleTimeGridHover(e), true);

        // Timetable
        this.elements.showMoreBtn.addEventListener('click', () => this.handleShowMore());

        // Share
        this.elements.shareBtn.addEventListener('click', () => this.handleShare());
    }

    /**
     * Handle keyboard events for time grid
     */
    handleTimeGridKeydown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            const cell = e.target.closest('.time-cell');
            if (cell) {
                e.preventDefault();
                this.handleTimeGridClick(e);
            }
        }
    }

    /**
     * Fill the zone dropdown: one optgroup per region and one option per zone, named in the
     * current language. The first option ("choose a zone") is in the markup.
     */
    buildZoneSelect() {
        const lang = this.getLanguage();

        for (const [regionId, zones] of Object.entries(WeatherZoneData.getZonesGroupedByRegion())) {
            const regionInfo = WeatherZoneData.regions[regionId];
            if (!regionInfo) continue;

            const group = document.createElement('optgroup');
            group.dataset.region = regionId;
            group.setAttribute('label', regionInfo[lang] || regionInfo.zh);

            for (const zone of zones) {
                const option = document.createElement('option');
                option.setAttribute('value', zone.id);
                option.textContent = zone[lang] || zone.zh;
                group.appendChild(option);
            }

            this.elements.zoneSelect.appendChild(group);
        }
    }

    /**
     * Rename the regions and zones in the dropdown after a language change. The same nodes
     * are kept, so the selected zone stays selected.
     */
    relabelZoneSelect() {
        const lang = this.getLanguage();

        for (const group of this.elements.zoneSelect.querySelectorAll('optgroup')) {
            const regionInfo = WeatherZoneData.regions[group.dataset.region];
            if (regionInfo) {
                group.setAttribute('label', regionInfo[lang] || regionInfo.zh);
            }
        }

        for (const option of this.elements.zoneSelect.querySelectorAll('option')) {
            const zone = WeatherZoneData.getZone(option.getAttribute('value'));
            if (zone) {
                option.textContent = zone[lang] || zone.zh;
            }
        }
    }

    /**
     * Build the time grid UI
     */
    buildTimeGrid() {
        for (let hour = 0; hour < 24; hour++) {
            const cell = document.createElement('div');
            cell.className = 'cell time-cell';
            cell.dataset.hour = hour;
            cell.setAttribute('role', 'button');
            cell.setAttribute('tabindex', '0');
            cell.setAttribute('aria-label', `${WeatherForecast.twoDigits(hour)}:00`);
            cell.textContent = WeatherForecast.twoDigits(hour);
            this.elements.timeGrid.appendChild(cell);
        }
    }

    /**
     * Start time update interval
     */
    startTimeUpdates() {
        // 先記下目前所在的天氣期，之後每秒比對，換期時由 refreshOnPeriodChange() 重畫時刻表
        this.currentPeriodStart = WeatherCalculator.getWeatherPeriodStart(Date.now());
        this.updateTimeDisplay();
        this.timeUpdateInterval = setInterval(() => {
            this.updateTimeDisplay();
            this.refreshOnPeriodChange(Date.now());
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
        this.elements.currentLT.textContent = WeatherCalculator.formatLocalTime(now);
    }

    /**
     * 天氣每 8 個艾歐澤亞小時（1,400 秒）換一期。時刻表只在選擇改變時才重畫，停在頁面上不動的話，
     * 「目前」那一列會一直停在已過期的天氣；這裡由每秒的計時器呼叫，只在換期時重畫（列數照舊）。
     * 以期別起點比對：分頁在背景時瀏覽器會降頻計時器，電腦睡著時整段都沒跑，下一次執行時
     * 一定畫成最新的一期。
     * @param {number} now - 目前的 Unix 毫秒時間戳
     * @returns {boolean} 是否已換期
     */
    refreshOnPeriodChange(now) {
        const periodStart = WeatherCalculator.getWeatherPeriodStart(now);
        if (periodStart === this.currentPeriodStart) return false;

        this.currentPeriodStart = periodStart;
        // 沒選地區就沒有時刻表可畫；之後選了地區會自己重畫
        if (this.store.state.zoneId) this.renderTimetable();
        return true;
    }

    /**
     * Handle state changes from the store
     */
    handleStateChange(state, changeType) {
        switch (changeType) {
            case 'state':
            case 'zone':
            case 'reset':
                // A new selection (first load, zone dropdown, hash navigation): a half-chosen
                // time range is dropped and everything is drawn again
                this.cancelTimeRangeSelection();
                // The timetable starts again at 24 rows in another zone; a new period keeps its length
                if (state.zoneId !== this.timetableZoneId) {
                    this.timetableZoneId = state.zoneId;
                    this.timetableCount = WeatherForecast.CONSTANTS.INITIAL_RESULTS;
                }
                this.render();
                break;
            case 'desiredWeathers':
            case 'previousWeathers':
                this.updateWeatherTagsUI();
                this.updateMoreSummary();
                break;
            case 'timeRange':
                this.updateTimeRangeUI();
                this.updateMoreSummary();
                break;
            case 'conditions':
            case 'clearFilters':
                this.cancelTimeRangeSelection();
                this.updateWeatherTagsUI();
                this.updateTimeRangeUI();
                this.updateMoreSummary();
                break;
        }
    }

    /**
     * Draw the page for the current state: without a zone only the dropdown and the
     * explanations; with a zone its weathers, conditions and timetable
     */
    render() {
        const hasZone = Boolean(this.store.getCurrentZone());
        this.elements.zoneSelect.value = this.store.state.zoneId || '';

        for (const element of [this.elements.firstVisitPrompt, this.elements.zoneHint, this.elements.noZoneSelected]) {
            element.hidden = hasZone;
        }
        for (const element of [this.elements.weatherField, this.elements.moreConditions, this.elements.shareBtn, this.elements.zoneContent]) {
            element.hidden = !hasZone;
        }

        this.renderWeatherTags();
        this.updateTimeRangeUI();
        this.updateMoreSummary();
        this.renderTimetable();
    }

    /**
     * After a language change: the names in the dropdown, on the chips, in the summary and
     * in the timetable (elements with data-i18n are translated by the i18n manager)
     */
    handleLanguageChange() {
        this.relabelZoneSelect();
        this.renderWeatherTags();
        this.updateMoreSummary();
        this.renderTimetable();
    }

    /**
     * Handle a zone picked in the dropdown
     */
    handleZoneChange() {
        const zoneId = this.elements.zoneSelect.value;
        if (zoneId) {
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
            const endHour = hour + 1; // Make end exclusive (hour is 0-23, so endHour is 1-24)
            this.store.setTimeRange(this.timeRangeStart, endHour);
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
                if (i >= start && i < end) {
                    cell.classList.add(WeatherForecast.CONSTANTS.CSS_CLASSES.IN_RANGE);
                }
            } else {
                if (i >= start || i < end) {
                    cell.classList.add(WeatherForecast.CONSTANTS.CSS_CLASSES.IN_RANGE);
                }
            }

            if (i === start || i === end) {
                cell.classList.add(WeatherForecast.CONSTANTS.CSS_CLASSES.SELECTED);
            }
        });
    }

    /**
     * Forget a time range that is half chosen (first cell clicked, second not yet)
     */
    cancelTimeRangeSelection() {
        this.isSelectingTimeRange = false;
        this.timeRangeStart = null;
    }

    /**
     * Handle show more button
     */
    handleShowMore() {
        this.timetableCount = Math.min(
            this.timetableCount * 2,
            WeatherForecast.CONSTANTS.MAX_RESULTS
        );
        this.renderTimetable();
    }

    /**
     * Handle share button
     */
    handleShare() {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            if (typeof FF14Utils !== 'undefined' && FF14Utils.showToast) {
                FF14Utils.showToast(window.i18n ? window.i18n.getText('weather_copied') : '已複製到剪貼簿', 'success');
            }
        });
    }

    /**
     * Render weather tags for the current zone (none without a zone)
     */
    renderWeatherTags() {
        const weathers = this.store.getAvailableWeathers();
        const lang = this.getLanguage();

        // Clear existing tags
        this.elements.desiredWeatherTags.textContent = '';
        this.elements.previousWeatherTags.textContent = '';

        for (const weather of weathers) {
            const info = WeatherZoneData.getWeatherInfo(weather);
            if (!info) continue;

            this.elements.desiredWeatherTags.appendChild(this.createWeatherTag(weather, info, lang));
            this.elements.previousWeatherTags.appendChild(this.createWeatherTag(weather, info, lang));
        }

        this.updateWeatherTagsUI();
    }

    /**
     * Create a weather tag element
     */
    createWeatherTag(weather, info, lang) {
        const tag = document.createElement('button');
        tag.className = 'chip weather-tag';
        tag.dataset.weather = weather;
        tag.setAttribute('aria-pressed', 'false');

        const icon = document.createElement('span');
        icon.className = 'weather-icon';
        icon.setAttribute('aria-hidden', 'true');
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
            const isActive = this.store.state.desiredWeathers.has(weather);
            tag.classList.toggle(WeatherForecast.CONSTANTS.CSS_CLASSES.ACTIVE, isActive);
            tag.setAttribute('aria-pressed', String(isActive));
        });

        // Update previous weather tags
        const previousTags = this.elements.previousWeatherTags.querySelectorAll('.weather-tag');
        previousTags.forEach(tag => {
            const weather = tag.dataset.weather;
            const isActive = this.store.state.previousWeathers.has(weather);
            tag.classList.toggle(WeatherForecast.CONSTANTS.CSS_CLASSES.ACTIVE, isActive);
            tag.setAttribute('aria-pressed', String(isActive));
        });
    }

    /**
     * Update time range UI: the hours inside the chosen time of day are marked (none when it
     * is the whole day), and the text shows the range
     */
    updateTimeRangeUI() {
        const { beginHour, endHour } = this.store.state;
        const hasRange = WeatherForecast.hasTimeRange(this.store.state);

        const cells = this.elements.timeGrid.querySelectorAll('.time-cell');
        cells.forEach((cell, i) => {
            cell.classList.remove(WeatherForecast.CONSTANTS.CSS_CLASSES.SELECTED);
            cell.classList.toggle(
                WeatherForecast.CONSTANTS.CSS_CLASSES.IN_RANGE,
                hasRange && WeatherCalculator.isInTimeRange(i, beginHour, endHour)
            );
        });

        const beginText = WeatherForecast.twoDigits(beginHour) + ':00';
        const endText = WeatherForecast.twoDigits(endHour) + ':00';
        this.elements.timeRangeText.textContent = `${beginText} - ${endText}`;
    }

    /**
     * The summary next to "more conditions": what is set inside it (time of day, number of
     * previous weathers), or nothing
     */
    updateMoreSummary() {
        const { beginHour, endHour, previousWeathers } = this.store.state;
        const items = [];

        if (WeatherForecast.hasTimeRange(this.store.state)) {
            items.push(WeatherForecast.formatEtRange(beginHour, endHour));
        }
        if (previousWeathers.size > 0) {
            items.push(this.getText('weather_more_item_previous', '前置天氣 {count} 個', { count: previousWeathers.size }));
        }

        this.elements.moreSummary.textContent = items.length === 0
            ? ''
            : this.getText('weather_more_summary', '· 已設定 {items}', {
                items: items.join(this.getText('weather_list_separator', '、'))
            });
    }

    /**
     * Render the zone's weather timetable: the next periods from the one under way, whatever
     * the chosen weather and conditions, with the current one marked
     */
    renderTimetable() {
        const zone = this.store.getCurrentZone();
        this.elements.resultsBody.textContent = '';
        if (!zone) return;

        const lang = this.getLanguage();
        const now = Date.now();
        this.elements.timetableTitle.textContent = this.getText('weather_timetable_title', '{zone}的天氣時刻表', {
            zone: zone[lang] || zone.zh
        });

        for (const period of this.search.getUpcomingWeather(zone, now, this.timetableCount)) {
            const row = document.createElement('tr');

            // The weather period under way
            if (period.start <= now && period.end > now) {
                row.classList.add(WeatherForecast.CONSTANTS.CSS_CLASSES.CURRENT);
            }

            // Local time
            const localTimeCell = document.createElement('td');
            localTimeCell.textContent = this.formatDayTime(period.start, now);
            row.appendChild(localTimeCell);

            // Eorzea time
            const etCell = document.createElement('td');
            etCell.textContent = `${WeatherForecast.twoDigits(period.eorzeaTime.hours)}:00`;
            row.appendChild(etCell);

            // Weather
            row.appendChild(this.createWeatherCell(period.weather, lang));

            this.elements.resultsBody.appendChild(row);
        }

        this.elements.showMoreBtn.hidden = this.timetableCount >= WeatherForecast.CONSTANTS.MAX_RESULTS;
    }

    /**
     * A timetable cell with the weather icon and name
     */
    createWeatherCell(weather, lang) {
        const cell = document.createElement('td');
        const info = WeatherZoneData.getWeatherInfo(weather);
        if (!info) {
            cell.textContent = weather;
            return cell;
        }

        const weatherSpan = document.createElement('span');
        weatherSpan.className = 'weather-cell';

        const icon = document.createElement('span');
        icon.className = 'weather-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = info.icon;

        const name = document.createElement('span');
        name.textContent = info[lang] || info.zh;

        weatherSpan.appendChild(icon);
        weatherSpan.appendChild(name);
        cell.appendChild(weatherSpan);
        return cell;
    }

    /**
     * A local time with its day: "今天／明天／M/D HH:MM" in the current language
     * @param {number} ts - Timestamp to describe
     * @param {number} now - Current timestamp
     * @returns {string}
     */
    formatDayTime(ts, now) {
        const offset = WeatherAnswer.dayOffset(ts, now);
        let day;
        if (offset === 0) {
            day = this.getText('weather_day_today', '今天');
        } else if (offset === 1) {
            day = this.getText('weather_day_tomorrow', '明天');
        } else {
            const date = new Date(ts);
            day = this.getText('weather_day_date', '{month}/{day}', { month: date.getMonth() + 1, day: date.getDate() });
        }
        return this.getText('weather_day_time', '{day} {time}', { day, time: WeatherCalculator.formatLocalTime(ts) });
    }

    /**
     * Current language code
     */
    getLanguage() {
        return window.i18n ? window.i18n.currentLanguage : 'zh';
    }

    /**
     * Text for a key in the current language, or the Chinese fallback; {name} placeholders
     * are filled from params
     */
    getText(key, fallback, params) {
        return params ? FF14Utils.getI18nText(key, fallback, params) : FF14Utils.getI18nText(key, fallback);
    }

    /**
     * Whether a time of day is chosen: anything but the whole day, which is 0-24 or a range that
     * ends where it begins (ET 8 then ET 7 picks 8-8, which WeatherCalculator.isInTimeRange() counts
     * as every hour)
     */
    static hasTimeRange(state) {
        return state.beginHour !== state.endHour && (state.beginHour !== 0 || state.endHour !== 24);
    }

    /**
     * An Eorzea time span as "ET 08:00–16:00"
     */
    static formatEtRange(beginHour, endHour) {
        return `ET ${WeatherForecast.twoDigits(beginHour)}:00–${WeatherForecast.twoDigits(endHour)}:00`;
    }

    static twoDigits(value) {
        return String(value).padStart(2, '0');
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
