/**
 * FF14 Weather Forecast - Main Controller
 * The selection side (zone dropdown, weather chips, and "more conditions" with the
 * time of day and the previous weather), the answer card (when the chosen weather comes
 * next, how long to wait and until when, and "remind me"), the reminder line above it,
 * the occurrences after it, and the zone's weather timetable
 */

class WeatherForecast {
    // Constants
    static CONSTANTS = {
        INITIAL_RESULTS: 24, // timetable rows at first
        MAX_RESULTS: 200, // "show more" doubles the rows up to this many
        INITIAL_NEXT: 5, // occurrences listed after the answer card at first
        MAX_NEXT: 50, // "show more" doubles them up to this many
        TIME_UPDATE_INTERVAL: 1000,
        MINUTE_MS: 60000,
        NOTIFIED_KEY: 'ff14tw_weather_notified', // localStorage: reminders that already went off, one item each named after this (ReminderScheduler)
        // A user action on the page lets the reminder sound play later (ReminderScheduler.unlockSound()).
        // A touch only counts as one at pointerup, a mouse at pointerdown, so both are listened to.
        UNLOCK_SOUND_EVENTS: ['pointerdown', 'pointerup', 'keydown'],
        CSS_CLASSES: {
            ACTIVE: 'active',
            CURRENT: 'current-weather',
            IN_RANGE: 'in-range',
            NOW: 'is-now',
            SELECTED: 'selected'
        }
    };

    constructor() {
        // State
        this.timetableCount = WeatherForecast.CONSTANTS.INITIAL_RESULTS;
        this.timetableZoneId = null; // the zone timetableCount belongs to
        this.timetableDrawnAt = null; // when the timetable was drawn: its 今天／明天 are relative to that day
        this.nextCount = WeatherForecast.CONSTANTS.INITIAL_NEXT;
        this.nextTarget = null; // the target (as its URL hash) nextCount belongs to
        this.answerMinute = null; // the minute the answer card was drawn in
        this.answerChangesAt = Infinity; // when the occurrence on the answer card starts or ends (see refreshOnMinuteChange())
        this.answerHasResult = false; // the answer card shows an occurrence of a chosen target, so it can be reminded
        this.timeUpdateInterval = null;
        this.currentPeriodStart = null;
        this.timeRangeStart = null;
        this.isSelectingTimeRange = false;

        // Modules
        this.store = new WeatherStore();
        this.search = new WeatherSearch();
        this.reminder = new WeatherReminder();
        this.scheduler = new ReminderScheduler({
            notifiedKey: WeatherForecast.CONSTANTS.NOTIFIED_KEY,
            getAlerts: (now) => this.reminder.alerts(now),
            onDue: (alert) => this.handleReminderDue(alert)
        });

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
            reminderNotice: document.getElementById('reminderNotice'),
            reminderNoticeText: document.getElementById('reminderNoticeText'),
            reminderNoticeCancel: document.getElementById('reminderNoticeCancel'),
            noZoneSelected: document.getElementById('noZoneSelected'),
            zoneContent: document.getElementById('zoneContent'),
            answerCard: document.getElementById('answerCard'),
            answerEyebrow: document.getElementById('answerEyebrow'),
            answerWhen: document.getElementById('answerWhen'),
            answerWait: document.getElementById('answerWait'),
            answerMeta: document.getElementById('answerMeta'),
            answerExtra: document.getElementById('answerExtra'),
            answerActions: document.getElementById('answerActions'),
            remindBtn: document.getElementById('remindBtn'),
            leadSelect: document.getElementById('leadSelect'),
            remindHint: document.getElementById('remindHint'),
            reminderSet: document.getElementById('reminderSet'),
            reminderSetText: document.getElementById('reminderSetText'),
            reminderCancelBtn: document.getElementById('reminderCancelBtn'),
            notifyStatus: document.getElementById('notifyStatus'),
            nextSection: document.getElementById('nextSection'),
            nextTitle: document.getElementById('nextTitle'),
            nextList: document.getElementById('nextList'),
            nextMoreBtn: document.getElementById('nextMoreBtn'),
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
        this.buildLeadSelect();

        // Set up event listeners
        this.bindEvents();

        // Start time updates
        this.startTimeUpdates();

        // Initial render from the loaded state (shared link, remembered selection or first visit)
        this.handleStateChange(this.store.state, 'state');

        if (window.i18n) {
            window.i18n.onLanguageChange(() => this.handleLanguageChange());
        }

        // Check the reminder every second from now on
        this.scheduler.start();
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

        // Occurrences after the answer card, and the timetable
        this.elements.nextMoreBtn.addEventListener('click', () => this.handleNextMore());
        this.elements.showMoreBtn.addEventListener('click', () => this.handleShowMore());

        // Share
        this.elements.shareBtn.addEventListener('click', () => this.handleShare());

        // Reminder
        this.elements.remindBtn.addEventListener('click', () => this.handleRemind());
        this.elements.leadSelect.addEventListener('change', () => this.handleLeadChange());
        this.elements.reminderCancelBtn.addEventListener('click', () => this.handleReminderCancel());
        this.elements.reminderNoticeCancel.addEventListener('click', () => this.handleReminderNoticeCancel());

        // Another tab set or cancelled the reminder; key null: it cleared this site's storage.
        // A reminder that went off in another tab: the time shown moves on to the next one now,
        // not at the next minute
        this.handleStorage = (e) => {
            if (e.key === WeatherReminder.STORAGE_KEY || e.key === null) {
                this.reminder.reload();
                this.renderReminder();
            } else if (this.scheduler.isRecordKey(e.key)) {
                this.renderReminder();
            }
        };
        window.addEventListener('storage', this.handleStorage);

        // A browser only lets an AudioContext created or resumed during a user action play, so a
        // reminder restored after a reload needs one before it can be heard, even without "remind me".
        // Only while a reminder is set, so a visitor who never sets one gets no AudioContext ("remind me"
        // unlocks by itself). Every action unlocks again: it costs nothing once the sound is on, and a
        // phone can suspend it again.
        this.handleUnlockSound = () => {
            if (this.reminder.active) {
                ReminderScheduler.unlockSound();
            }
        };
        for (const type of WeatherForecast.CONSTANTS.UNLOCK_SOUND_EVENTS) {
            document.addEventListener(type, this.handleUnlockSound, { capture: true, passive: true });
        }
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
     * Fill the "notify" dropdown with the minutes before the start a reminder can go off.
     * The option text has the number in it, so it is written here rather than by data-i18n.
     */
    buildLeadSelect() {
        for (const minutes of WeatherReminder.LEAD_OPTIONS) {
            const option = document.createElement('option');
            option.setAttribute('value', String(minutes));
            this.elements.leadSelect.appendChild(option);
        }
        this.relabelLeadSelect();
    }

    /**
     * Write the "notify" options in the current language; the same nodes stay, so does the choice
     */
    relabelLeadSelect() {
        for (const option of this.elements.leadSelect.querySelectorAll('option')) {
            option.textContent = this.getText('weather_lead_option', '開始前 {n} 分鐘', { n: option.getAttribute('value') });
        }
    }

    /**
     * Start time update interval
     */
    startTimeUpdates() {
        // 先記下目前所在的天氣期，之後每秒比對：換期時由 refreshOnPeriodChange() 重畫答案與時刻表，
        // 同一期裡由 refreshOnMinuteChange() 每分鐘更新答案、過了午夜重畫時刻表
        this.currentPeriodStart = WeatherCalculator.getWeatherPeriodStart(Date.now());
        this.updateTimeDisplay();
        this.timeUpdateInterval = setInterval(() => {
            const now = Date.now();
            this.updateTimeDisplay();
            if (!this.refreshOnPeriodChange(now)) {
                this.refreshOnMinuteChange(now);
            }
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
     * 天氣每 8 個艾歐澤亞小時（1,400 秒）換一期。答案卡、之後幾次與時刻表只在選擇改變時才重畫，停在頁面上
     * 不動的話，答案與「目前」那一列會一直停在已過期的天氣；這裡由每秒的計時器呼叫，只在換期時全部重算
     * （之後幾次與時刻表的列數照舊）。以期別起點比對：分頁在背景時瀏覽器會降頻計時器，電腦睡著時整段都沒跑，
     * 下一次執行時一定畫成最新的一期。
     * @param {number} now - 目前的 Unix 毫秒時間戳
     * @returns {boolean} 是否已換期
     */
    refreshOnPeriodChange(now) {
        const periodStart = WeatherCalculator.getWeatherPeriodStart(now);
        if (periodStart === this.currentPeriodStart) return false;

        this.currentPeriodStart = periodStart;
        // 沒選地區就沒有答案與時刻表可畫；之後選了地區會自己重畫
        if (this.store.state.zoneId) {
            this.renderAnswer();
            this.renderTimetable();
        }
        return true;
    }

    /**
     * 同一期裡由每秒的計時器呼叫。分鐘一變就重畫答案卡與之後幾次（還要多久、還剩多久）與提醒（下次幾點提醒）；
     * 沒選地區時只有提醒中那一行要重畫。答案卡上那一次開始或結束時也馬上重畫：有時段時頭尾落在艾歐澤亞的整點
     * （每 175 秒一個），可能在期中、一分鐘的中間，等到下一分鐘才換的話，開始之後還會寫「下次」最多一分鐘。
     * 本地日期一變（過了午夜）就重畫時刻表，它的今天／明天是相對畫的那一天。
     * @param {number} now - 目前的 Unix 毫秒時間戳
     */
    refreshOnMinuteChange(now) {
        if (Math.floor(now / WeatherForecast.CONSTANTS.MINUTE_MS) !== this.answerMinute || now >= this.answerChangesAt) {
            this.renderAnswer();
        }
        if (this.store.state.zoneId && WeatherAnswer.dayOffset(now, this.timetableDrawnAt) !== 0) {
            this.renderTimetable();
        }
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
                this.renderAnswer();
                break;
            case 'timeRange':
                this.updateTimeRangeUI();
                this.updateMoreSummary();
                this.renderAnswer();
                break;
            case 'conditions':
            case 'clearFilters':
                this.cancelTimeRangeSelection();
                this.updateWeatherTagsUI();
                this.updateTimeRangeUI();
                this.updateMoreSummary();
                this.renderAnswer();
                break;
        }
    }

    /**
     * Draw the page for the current state: without a zone only the dropdown and the
     * explanations; with a zone its weathers, conditions, answer card and timetable
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
        this.renderAnswer();
        this.renderTimetable();
    }

    /**
     * After a language change: the names in the dropdowns, on the chips, in the summary, on the
     * answer card with its reminder, and in the timetable (elements with data-i18n are translated
     * by the i18n manager). A reminder that goes off later is worded when it does, so in the new language.
     */
    handleLanguageChange() {
        this.relabelZoneSelect();
        this.relabelLeadSelect();
        this.renderWeatherTags();
        this.updateMoreSummary();
        this.renderAnswer();
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
     * Handle the "show more" button under the occurrences after the answer card
     */
    handleNextMore() {
        this.nextCount = Math.min(
            this.nextCount * 2,
            WeatherForecast.CONSTANTS.MAX_NEXT
        );
        this.renderAnswer();
    }

    /**
     * Handle the timetable's "show more" button
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
     * "Remind me": set the reminder on the target shown on the card, replacing any other. The sound
     * is unlocked and notifications are asked for here, during the click, since browsers refuse both
     * otherwise. The reminder is set at once, without waiting for the answer: a prompt the player
     * leaves unanswered (back in the game) must not leave nothing set, and an on-page alert and a
     * sound come whatever the answer. Once the answer is in, the line about notifications follows it.
     */
    async handleRemind() {
        ReminderScheduler.unlockSound();
        // Started now, inside the click, so the browser shows its prompt; answered whenever the player does
        const permission = ReminderScheduler.requestPermission();
        this.reminder.arm(this.store.state, Date.now());
        this.renderReminder();
        if (!this.elements.reminderSet.hidden) {
            this.elements.reminderCancelBtn.focus();
        }
        await permission;
        this.renderReminder();
    }

    /**
     * A new lead picked in the "notify" dropdown
     */
    handleLeadChange() {
        this.reminder.setLead(Number(this.elements.leadSelect.value));
        this.renderReminder();
    }

    /**
     * "Cancel reminder" on the card: the focus goes back to "remind me", which takes its place
     */
    handleReminderCancel() {
        this.reminder.cancel();
        this.renderReminder();
        this.elements.remindBtn.focus();
    }

    /**
     * "Cancel reminder" in the line above the card. The line goes away with its button, so a
     * focused button hands the focus on to "remind me" on the card, or to the zone dropdown
     * when the card has none.
     */
    handleReminderNoticeCancel() {
        const hadFocus = document.activeElement === this.elements.reminderNoticeCancel;
        this.reminder.cancel();
        this.renderReminder();
        if (hadFocus) {
            (this.answerHasResult ? this.elements.remindBtn : this.elements.zoneSelect).focus();
        }
    }

    /**
     * A reminder went off (ReminderScheduler): an on-page alert, a sound and, when allowed, a system
     * notification, worded now in the current language. The title says how many minutes are really
     * left (rounded up, at least 1), which is less than the lead when it goes off late (the computer
     * slept), or that it has started when it goes off at the start or after it (set too late for the
     * lead, or late); the times are the part inside the time of day.
     * @param {object} alert - From WeatherReminder.alerts()
     */
    handleReminderDue(alert) {
        const reminder = this.reminder.active;
        if (!reminder) return;

        const { target } = reminder;
        const left = alert.start - Date.now();
        const params = {
            zone: this.reminderTargetNames(target).zone,
            // This time's weather, or the special event when that is the target
            weather: target.desiredWeathers.length > 0 ? this.weatherName(alert.data.weather) : this.eventName(target.event),
            n: Math.max(1, Math.ceil(left / WeatherForecast.CONSTANTS.MINUTE_MS))
        };
        const title = left <= 0
            ? this.getText('weather_notify_title_now', '{zone}{weather}開始了', params)
            : this.getText('weather_notify_title', '{zone} {n} 分鐘後{weather}', params);
        const body = this.getText('weather_notify_body', '{start} 開始，到 {end}（{et}）', {
            start: WeatherCalculator.formatLocalTime(alert.start),
            end: WeatherCalculator.formatLocalTime(alert.end),
            et: this.formatEtSpan(alert.start, alert.end)
        });

        ReminderScheduler.deliver({ title, body, tag: ReminderScheduler.idOf(alert) });
        this.renderReminder();
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
     * Render the answer card with its reminder, the reminder line above it and the occurrences
     * after the card for the current state (see drawAnswer() and renderReminder())
     */
    renderAnswer() {
        this.answerHasResult = this.drawAnswer();
        this.renderReminder();
    }

    /**
     * Draw the answer card and the occurrences after it for the current state. Only the text
     * of the card's lines and its class change; the card itself is never rebuilt.
     * - no weather and no special event chosen: the zone's weather right now
     * - a target with nothing in the next 60 days: say so
     * - the first occurrence under way: the green card (until when, time left, the next one)
     * - otherwise: when it comes next, how long to wait and until when
     * @returns {boolean} Whether the card shows an occurrence of a chosen target, which can be reminded
     */
    drawAnswer() {
        const zone = this.store.getCurrentZone();
        const state = this.store.state;
        const now = Date.now();
        this.answerMinute = Math.floor(now / WeatherForecast.CONSTANTS.MINUTE_MS);
        this.answerChangesAt = Infinity;

        // The list after the card starts again at 5 for another target or zone, also after the
        // first-visit screen (no zone, hash ''); a new period or language keeps its length
        const target = WeatherStore.hashOf(state);
        if (target !== this.nextTarget) {
            this.nextTarget = target;
            this.nextCount = WeatherForecast.CONSTANTS.INITIAL_NEXT;
        }
        if (!zone) return false;

        if (state.desiredWeathers.size === 0 && !state.event) {
            this.writeZoneNow(zone, now);
            this.renderNext([], now, true);
            return false;
        }

        const found = WeatherAnswer.occurrences(zone, state, now, 1 + this.nextCount);
        const [first, ...rest] = found;
        if (!first) {
            this.writeAnswer({
                eyebrow: this.getText('weather_answer_none', '60 天內沒有符合的時段'),
                meta: this.getText('weather_answer_none_hint', '試試放寬條件。')
            });
        } else if (first.start <= now) {
            this.answerChangesAt = first.end;
            this.writeAnswerNow(first, rest[0], now);
        } else {
            this.answerChangesAt = first.start;
            this.writeAnswerNext(first, now);
        }
        // Fewer than asked for: every occurrence in the 60 days is already listed
        this.renderNext(rest, now, found.length < 1 + this.nextCount);
        return Boolean(first);
    }

    /**
     * The answer card without a target: the zone's weather right now and how long it lasts.
     * A time of day or a previous weather only applies to a chosen weather, which an extra line says.
     */
    writeZoneNow(zone, now) {
        const state = this.store.state;
        const weather = WeatherCalculator.getWeatherForZone(zone, now);
        // The weather under way as one run, so it lasts until the weather really changes
        const run = WeatherAnswer.occurrences(zone, { desiredWeathers: [weather] }, now, 1)[0];
        const hasConditions = WeatherForecast.hasTimeRange(state) || state.previousWeathers.size > 0;

        this.writeAnswer({
            eyebrow: this.getText('weather_answer_zone_now', '{zone}現在', { zone: zone[this.getLanguage()] || zone.zh }),
            when: this.weatherLabel(weather),
            wait: this.getText('weather_answer_zone_left', '還剩 {wait}，到 {end}', {
                wait: this.formatWait(run.end - now),
                end: WeatherCalculator.formatLocalTime(run.end)
            }),
            meta: this.getText('weather_answer_zone_hint', '選一個天氣，這裡會寫它下次什麼時候出現。'),
            extra: hasConditions ? this.getText('weather_answer_conditions_hint', '選了天氣，時段和前置天氣才會用上。') : ''
        });
    }

    /**
     * The answer card while the first occurrence is under way (green): until when, how long is
     * left, its Eorzea hours and when the next one starts
     */
    writeAnswerNow(occurrence, next, now) {
        const et = this.formatEtSpan(occurrence.start, occurrence.end);

        this.writeAnswer({
            isNow: true,
            eyebrow: this.isEventOnly()
                ? this.getText('weather_answer_now_event', '現在符合 {event} 的條件', { event: this.eventName() })
                : this.getText('weather_answer_now', '現在就是 {weather}', { weather: this.weatherLabel(occurrence.weather) }),
            when: this.getText('weather_answer_until', '到 {time}', { time: WeatherCalculator.formatLocalTime(occurrence.end) }),
            wait: this.getText('weather_answer_left', '還剩 {wait}', { wait: this.formatWait(occurrence.end - now) }),
            // Nothing after this one in the 60 days: only its Eorzea hours
            meta: next
                ? this.getText('weather_answer_meta_now', '{et} · 下一次：{next}', { et, next: this.formatDayTime(next.start, now) })
                : et
        });
    }

    /**
     * The answer card for an occurrence still to come: when, how long to wait, until when, and its
     * Eorzea hours with the weather before it. With a time of day the times are the part inside it,
     * and the small print gives the whole run and which part of it is inside.
     */
    writeAnswerNext(occurrence, now) {
        const state = this.store.state;
        const hasRange = WeatherForecast.hasTimeRange(state);
        const weather = this.weatherLabel(occurrence.weather);
        const wait = this.formatWait(occurrence.start - now);
        const end = WeatherCalculator.formatLocalTime(occurrence.end);

        let eyebrow;
        if (this.isEventOnly()) {
            eyebrow = this.getText('weather_answer_next_event', '下次符合 {event} 的條件', { event: this.eventName() });
        } else if (hasRange) {
            eyebrow = this.getText('weather_answer_next_range', '下次 {weather}（你選的時段 {range}）', {
                weather,
                range: WeatherForecast.formatEtRange(state.beginHour, state.endHour)
            });
        } else {
            eyebrow = this.getText('weather_answer_next', '下次 {weather}', { weather });
        }

        this.writeAnswer({
            eyebrow,
            when: this.formatDayTime(occurrence.start, now),
            wait: hasRange
                ? this.getText('weather_answer_wait_range', '還要 {wait}，可以拍到 {end}', { wait, end })
                : this.getText('weather_answer_wait', '還要 {wait}，到 {end} 結束', { wait, end }),
            meta: hasRange
                // Inside this sentence the weather is its name only, without the icon
                ? this.getText('weather_answer_meta_range', '這段{weather}是 {start}–{end}（{et}），其中 {clip} 在你選的時段內', {
                    weather: this.weatherName(occurrence.weather),
                    start: WeatherCalculator.formatLocalTime(occurrence.periodStart),
                    end: WeatherCalculator.formatLocalTime(occurrence.periodEnd),
                    et: this.formatEtSpan(occurrence.periodStart, occurrence.periodEnd),
                    clip: this.formatEtSpan(occurrence.start, occurrence.end)
                })
                : this.getText('weather_answer_meta', '{et} · 前一段是 {previous}', {
                    et: this.formatEtSpan(occurrence.start, occurrence.end),
                    previous: this.weatherLabel(occurrence.previousWeather)
                })
        });
    }

    /**
     * Write the answer card's lines; an empty line is hidden. The card and its lines stay the same
     * elements, since the card is redrawn every minute and holds more than these lines.
     */
    writeAnswer({ isNow = false, eyebrow, when = '', wait = '', meta = '', extra = '' }) {
        const { answerCard, answerEyebrow, answerWhen, answerWait, answerMeta, answerExtra } = this.elements;
        answerCard.classList.toggle(WeatherForecast.CONSTANTS.CSS_CLASSES.NOW, isNow);
        answerEyebrow.textContent = eyebrow;
        for (const [element, text] of [[answerWhen, when], [answerWait, wait], [answerMeta, meta], [answerExtra, extra]]) {
            element.textContent = text;
            element.hidden = !text;
        }
    }

    /**
     * Draw the reminder for the current state and time; called whenever the answer card is drawn
     * (so every minute too) and when the reminder changes or goes off.
     * - On the card, when it shows an occurrence of a target: "remind me", the lead and the hint.
     *   When the reminder is this target's, the button and the hint give way to when it goes off (with
     *   its day, see formatRemindWhen()) and "cancel reminder"; the lead can still be changed.
     * - Above the card: a reminder the card does not show (another target, no zone, nothing found),
     *   so it can always be seen and cancelled. Changing the selection never cancels it.
     * - Last on the card, while a reminder is set and the card has the reminder controls: a line when the
     *   browser blocks or has no notifications.
     * When none of the occurrences will go off (nothing left in the 60 days), the time is left out.
     */
    renderReminder() {
        const {
            answerActions, remindBtn, leadSelect, remindHint, reminderSet, reminderSetText,
            notifyStatus, reminderNotice, reminderNoticeText
        } = this.elements;
        const now = Date.now();
        const reminder = this.reminder.active;
        const lead = this.reminder.leadMinutes;
        const next = reminder ? this.reminder.nextAlert(now, this.scheduler.notifiedIds()) : null;
        const fireAt = next ? ReminderScheduler.fireAt(next) : null;
        const time = fireAt === null ? '' : this.formatRemindWhen(fireAt, now);
        // Set too late to go off the lead before the start: it goes off at the start, so the sentence
        // must not say "N minutes before" (it would read as starting N minutes after that time)
        const atStart = next !== null && fireAt === next.start;
        const onCard = this.answerHasResult && this.reminder.isFor(this.store.state);

        answerActions.hidden = !this.answerHasResult;
        remindBtn.hidden = onCard;
        // Only when another tab changed it: the card is drawn every minute, maybe while the dropdown is open
        if (leadSelect.value !== String(lead)) {
            leadSelect.value = String(lead);
        }
        reminderSet.hidden = !onCard;
        let setText = '';
        if (onCard && time) {
            setText = atStart
                ? this.getText('weather_reminder_set_start', '{time} 開始時提醒你。頁面要開著才會響。', { time })
                : this.getText('weather_reminder_set', '{time} 提醒你（開始前 {n} 分鐘）。頁面要開著才會響。', { time, n: lead });
        }
        WeatherForecast.writeLine(reminderSetText, setText);
        // The line saying when it goes off already says the page has to stay open
        remindHint.hidden = Boolean(setText);

        reminderNotice.hidden = !reminder || onCard;
        WeatherForecast.writeLine(reminderNoticeText, reminder && !onCard && time
            ? this.getText('weather_reminder_notice', '提醒中：{zone}・{weather}，下次 {time} 提醒你', {
                ...this.reminderTargetNames(reminder.target),
                time
            })
            : '');

        // Next to the reminder controls only: a card without them (just the zone's weather) has nothing it explains
        WeatherForecast.writeLine(notifyStatus, reminder && this.answerHasResult ? this.notifyStatusText() : '');
    }

    /**
     * The reminder's target in words: its zone, and its weathers (names only, joined) or, without
     * any, its special event
     */
    reminderTargetNames(target) {
        const zone = WeatherZoneData.getZone(target.zoneId);
        return {
            zone: zone[this.getLanguage()] || zone.zh,
            weather: target.desiredWeathers.length > 0
                ? target.desiredWeathers.map(weather => this.weatherName(weather)).join(this.getText('weather_list_separator', '、'))
                : this.eventName(target.event)
        };
    }

    /**
     * What a reminder will not do in this browser: no system notification when they are blocked
     * or not supported (an on-page alert and a sound still come); otherwise nothing to say
     */
    notifyStatusText() {
        switch (ReminderScheduler.permission()) {
            case 'denied':
                return this.getText('weather_notify_denied', '瀏覽器封鎖了這個網站的通知，到時間只會在頁面上提示和發出聲音。可以從網址列左邊的網站設定打開。');
            case 'unsupported':
                return this.getText('weather_notify_unsupported', '這個瀏覽器不能跳通知，到時間只會在頁面上提示和發出聲音。');
            default:
                return '';
        }
    }

    /**
     * The occurrences after the one on the answer card, one row each: day and time, how long to
     * wait, the Eorzea hours and until when. Rows are reused, so the update every minute only
     * changes text. The section is hidden when there is nothing to list.
     * @param {array} occurrences - From WeatherAnswer.occurrences(), after the one on the card
     * @param {number} now - Current timestamp
     * @param {boolean} complete - Every occurrence there is has been listed, so "show more" would add nothing
     */
    renderNext(occurrences, now, complete) {
        const list = this.elements.nextList;

        occurrences.forEach((occurrence, i) => {
            const [when, wait, et] = (list.children[i] || this.createNextRow()).children;
            when.textContent = this.formatDayTime(occurrence.start, now);
            wait.textContent = this.getText('weather_next_row_wait', '還要 {wait}', { wait: this.formatWait(occurrence.start - now) });
            et.textContent = this.getText('weather_next_row_meta', '{et} · 到 {end}', {
                et: this.formatEtSpan(occurrence.start, occurrence.end),
                end: WeatherCalculator.formatLocalTime(occurrence.end)
            });
        });
        for (const row of Array.from(list.children).slice(occurrences.length)) {
            row.remove();
        }

        this.elements.nextSection.hidden = occurrences.length === 0;
        this.toggleShowMore(
            this.elements.nextMoreBtn,
            this.elements.nextTitle,
            complete || this.nextCount >= WeatherForecast.CONSTANTS.MAX_NEXT
        );
    }

    /**
     * A new, empty row at the end of the list after the answer card
     */
    createNextRow() {
        const row = document.createElement('li');
        for (const className of ['wx-n-when', 'wx-n-wait', 'wx-n-et']) {
            const part = document.createElement('span');
            part.className = className;
            row.appendChild(part);
        }
        this.elements.nextList.appendChild(row);
        return row;
    }

    /**
     * Show or hide a "show more" button. When the focused button goes away because its list is
     * complete, the focus moves to the section heading instead of falling to the page body.
     * The page does not scroll there: a mouse click focuses the button too, and the heading can
     * be a whole list above it.
     */
    toggleShowMore(button, heading, hidden) {
        if (hidden && document.activeElement === button) {
            heading.focus({ preventScroll: true });
        }
        button.hidden = hidden;
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
        this.timetableDrawnAt = now;
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

        this.toggleShowMore(
            this.elements.showMoreBtn,
            this.elements.timetableTitle,
            this.timetableCount >= WeatherForecast.CONSTANTS.MAX_RESULTS
        );
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
     * When a reminder goes off, as the {time} of the reminder sentences: "HH:MM" today, "明天 HH:MM"
     * tomorrow, "M/D HH:MM" on a later day (it can be days away). In English the phrase carries its
     * preposition: "at HH:MM", "tomorrow at HH:MM", "on M/D at HH:MM".
     * @param {number} ts - When it goes off
     * @param {number} now - Current timestamp
     * @returns {string}
     */
    formatRemindWhen(ts, now) {
        const time = WeatherCalculator.formatLocalTime(ts);
        const offset = WeatherAnswer.dayOffset(ts, now);
        if (offset === 0) {
            return this.getText('weather_remind_when_today', '{time}', { time });
        }
        if (offset === 1) {
            return this.getText('weather_remind_when_tomorrow', '明天 {time}', { time });
        }
        const date = new Date(ts);
        return this.getText('weather_remind_when_date', '{month}/{day} {time}', { month: date.getMonth() + 1, day: date.getDate(), time });
    }

    /**
     * A wait as "N 分", "N 小時 M 分", "N 天 M 小時" and so on in the current language, rounded up
     * to a whole minute (WeatherAnswer.waitParts())
     * @param {number} ms - Wait in milliseconds
     * @returns {string}
     */
    formatWait(ms) {
        const { days, hours, minutes } = WeatherAnswer.waitParts(ms);
        if (days > 0) {
            return hours > 0
                ? this.getText('weather_wait_days_hours', '{d} 天 {h} 小時', { d: days, h: hours })
                : this.getText('weather_wait_days', '{d} 天', { d: days });
        }
        if (hours > 0) {
            return minutes > 0
                ? this.getText('weather_wait_hours_minutes', '{h} 小時 {m} 分', { h: hours, m: minutes })
                : this.getText('weather_wait_hours', '{h} 小時', { h: hours });
        }
        return this.getText('weather_wait_minutes', '{m} 分', { m: minutes });
    }

    /**
     * The Eorzea hours a span of time covers, as "ET 16:00–08:00"
     */
    formatEtSpan(start, end) {
        const { from, to } = WeatherAnswer.etHours(start, end);
        return WeatherForecast.formatEtRange(from, to);
    }

    /**
     * A weather's name in the current language
     */
    weatherName(weather) {
        const info = WeatherZoneData.getWeatherInfo(weather);
        return info ? info[this.getLanguage()] || info.zh : weather;
    }

    /**
     * A weather as its icon, a space and its name in the current language
     */
    weatherLabel(weather) {
        const info = WeatherZoneData.getWeatherInfo(weather);
        return info ? `${info.icon} ${this.weatherName(weather)}` : weather;
    }

    /**
     * Whether the special event is the target: an event in the URL and no weather chosen
     */
    isEventOnly() {
        return Boolean(this.store.state.event) && this.store.state.desiredWeathers.size === 0;
    }

    /**
     * A special event's name in the current language (the chosen one unless given)
     */
    eventName(event = this.store.state.event) {
        const names = {
            garlok: this.getText('weather_event_garlok', '哥布林首領'),
            laideronnette: this.getText('weather_event_laideronnette', '湖中女妖')
        };
        return names[event] || event;
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
     * Write a line that is hidden when empty. The text is only replaced when it changes, so a line
     * inside an aria-live region is not read out again every time the card is drawn.
     */
    static writeLine(element, text) {
        if (element.textContent !== text) {
            element.textContent = text;
        }
        element.hidden = !text;
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }
        this.scheduler.stop();
        window.removeEventListener('storage', this.handleStorage);
        for (const type of WeatherForecast.CONSTANTS.UNLOCK_SOUND_EVENTS) {
            document.removeEventListener(type, this.handleUnlockSound, { capture: true });
        }
        this.store.destroy();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.weatherForecast = new WeatherForecast();
});
