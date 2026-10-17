/**
 * FF14 Weather Forecast - Weather Reminder
 * The page's one weather reminder ("remind me"): the target it waits for, which is its
 * own and stays when the page shows something else; how many minutes before the start
 * it goes off; and the alerts it hands to ReminderScheduler. Remembered in localStorage;
 * a browser that blocks site data only means it lasts while this page is open.
 * No DOM access.
 */

class WeatherReminder {
    // localStorage key: { leadMinutes, reminder: null | { target, armedAt } }, where target is
    // { zoneId, desiredWeathers: string[], previousWeathers: string[], beginHour, endHour, event }
    static STORAGE_KEY = 'ff14tw_weather_reminder';

    // Minutes before the start the reminder goes off
    static LEAD_OPTIONS = [1, 3, 5, 10, 15, 30];
    static DEFAULT_LEAD = 5;

    // The special events a URL hash can carry (the same list as WeatherStore.loadFromHash())
    static EVENTS = ['garlok', 'laideronnette'];

    static MINUTE_MS = 60000;

    /**
     * Read the remembered reminder; without one (or with storage blocked) the lead is
     * 5 minutes and nothing is set
     */
    constructor() {
        this.lead = WeatherReminder.DEFAULT_LEAD;
        this.reminder = null;
        this.reload();
    }

    /** Minutes before the start the reminder goes off */
    get leadMinutes() {
        return this.lead;
    }

    /** The reminder, { target, armedAt }, or null when none is set */
    get active() {
        return this.reminder;
    }

    /**
     * Change the lead; anything but one of LEAD_OPTIONS is ignored
     * @param {number} minutes
     */
    setLead(minutes) {
        if (!WeatherReminder.LEAD_OPTIONS.includes(minutes)) return;
        this.lead = minutes;
        this.save();
    }

    /**
     * Set the reminder on a target, replacing the one before. A copy of the target is kept,
     * so changing the selection afterwards does not change the reminder. A state without a
     * target (no weather and no special event, or an unknown zone) is ignored.
     * @param {object} state - { zoneId, desiredWeathers, previousWeathers, beginHour, endHour, event };
     *     the two weather fields can be a Set or an array
     * @param {number} now - Timestamp: an occurrence already under way at this time is skipped
     */
    arm(state, now) {
        const target = WeatherReminder.normalizeTarget(state);
        if (!target) return;
        this.reminder = { target, armedAt: now };
        this.save();
    }

    /** Remove the reminder (the lead stays) */
    cancel() {
        this.reminder = null;
        this.save();
    }

    /**
     * Read the remembered reminder again (another tab set or cancelled one). Nothing stored or
     * broken JSON means the defaults; a broken reminder is dropped (see normalizeTarget()).
     * When storage cannot be read, this page keeps what it has.
     */
    reload() {
        let raw;
        try {
            raw = window.localStorage.getItem(WeatherReminder.STORAGE_KEY);
        } catch (error) {
            return;
        }

        let saved = null;
        try {
            saved = JSON.parse(raw);
        } catch (error) {
            // Broken JSON: as if nothing was stored
        }
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
            saved = {};
        }

        this.lead = WeatherReminder.LEAD_OPTIONS.includes(saved.leadMinutes) ? saved.leadMinutes : WeatherReminder.DEFAULT_LEAD;
        this.reminder = WeatherReminder.normalizeReminder(saved.reminder);
    }

    /**
     * Whether a state is the reminder's target: the same URL hash (which also holds the special
     * event), so the order the weathers were picked in does not matter
     * @param {object} state
     * @returns {boolean}
     */
    isFor(state) {
        return this.reminder !== null
            && window.WeatherStore.hashOf(this.reminder.target) === window.WeatherStore.hashOf(state);
    }

    /**
     * The occurrences of the target the scheduler has to look at, as ReminderScheduler alerts: every
     * one that starts within the lead from now, whose reminder can be due already (with a long lead,
     * even while an earlier one is still under way; one under way stays for a late alert), then the
     * first one after those. Never throws (an empty list instead), since the scheduler asks for them
     * every second.
     * @param {number} now - Timestamp
     * @returns {array} { key, start, end, leadMs, armedAt, data } with data the occurrence
     *     from WeatherAnswer.occurrences(); start and end are the part inside the time of day
     */
    alerts(now) {
        if (!this.reminder) return [];

        try {
            const leadMs = this.lead * WeatherReminder.MINUTE_MS;
            // Ask for one more while the last one found still starts within the lead
            let limit = 2;
            let found = this.firstAlerts(now, limit);
            while (found.length === limit && found[limit - 1].start - leadMs <= now) {
                limit += 1;
                found = this.firstAlerts(now, limit);
            }
            return found;
        } catch (error) {
            return [];
        }
    }

    /**
     * The first occurrences of the target from now (one under way first), as alerts (see alerts());
     * fewer than asked for when the 60 days run out. Needs a reminder to be set, and throws when the
     * occurrences cannot be worked out (alerts() and nextAlert() catch it).
     * @param {number} now - Timestamp
     * @param {number} limit - How many
     * @returns {array}
     */
    firstAlerts(now, limit) {
        const { target, armedAt } = this.reminder;
        const key = `weather:${window.WeatherStore.hashOf(target)}`;
        const leadMs = this.lead * WeatherReminder.MINUTE_MS;
        const zone = window.WeatherZoneData.getZone(target.zoneId);
        return window.WeatherAnswer.occurrences(zone, target, now, limit).map(occurrence => ({
            key,
            start: occurrence.start,
            end: occurrence.end,
            leadMs,
            armedAt,
            data: occurrence
        }));
    }

    /**
     * The alert the reminder goes off for next: of the ones that started after the reminder was set,
     * have not gone off yet and are not over, the one with the earliest reminder time. That is not
     * always the earliest occurrence: one set within its lead waits for its start, while the one after
     * it still goes off the whole lead before its own start, which can come first.
     * alerts() stops at the first occurrence after the lead. When that one went off already (the lead
     * was longer then), the search goes on, one occurrence at a time, to the first one that has not.
     * @param {number} now - Timestamp
     * @param {Set<string>} notifiedIds - Alerts that already went off (ReminderScheduler.notifiedIds())
     * @returns {object|null} An alert from alerts() or after them, or null when none of them will go
     *     off (nothing left in the 60 days)
     */
    nextAlert(now, notifiedIds = new Set()) {
        const { ReminderScheduler } = window;
        const pending = alert => alert.armedAt < alert.start
            && now < alert.end
            && !notifiedIds.has(ReminderScheduler.idOf(alert));
        let alerts = this.alerts(now);
        try {
            while (alerts.length > 0 && !pending(alerts[alerts.length - 1])) {
                const more = this.firstAlerts(now, alerts.length + 1);
                if (more.length === alerts.length) break; // nothing more in the 60 days
                alerts = more;
            }
        } catch (error) {
            // Keep the ones already found
        }

        let next = null;
        for (const alert of alerts) {
            if (!pending(alert)) continue;
            if (next === null || ReminderScheduler.fireAt(alert) < ReminderScheduler.fireAt(next)) next = alert;
        }
        return next;
    }

    /**
     * When the reminder goes off next (see nextAlert())
     * @param {number} now - Timestamp
     * @param {Set<string>} notifiedIds - Alerts that already went off (ReminderScheduler.notifiedIds())
     * @returns {number|null} Timestamp, or null when none of them will go off (see nextAlert())
     */
    nextFireAt(now, notifiedIds = new Set()) {
        const next = this.nextAlert(now, notifiedIds);
        return next ? window.ReminderScheduler.fireAt(next) : null;
    }

    /** Remember the lead and the reminder; a browser that blocks or refuses it just means this page keeps them */
    save() {
        try {
            window.localStorage.setItem(WeatherReminder.STORAGE_KEY, JSON.stringify({
                leadMinutes: this.lead,
                reminder: this.reminder
            }));
        } catch (error) {
            // Not remembered for next time
        }
    }

    /**
     * A remembered reminder as { target, armedAt }, or null when it cannot be used
     * @param {*} saved
     * @returns {object|null}
     */
    static normalizeReminder(saved) {
        if (!saved || typeof saved !== 'object' || !Number.isFinite(saved.armedAt)) return null;
        const target = WeatherReminder.normalizeTarget(saved.target);
        return target ? { target, armedAt: saved.armedAt } : null;
    }

    /**
     * A clean copy of a target, from a state or from storage. An unknown zone means no target.
     * Weathers keep only known weather names (once each, in the order of WeatherZoneData.weatherTypes,
     * the order of the URL hash); an unknown special event becomes null, since WeatherAnswer would
     * count every period as matching it; hours out of range fall back to the whole day (0-24).
     * Without a weather or a special event there is nothing to wait for, so no target either.
     * @param {*} source - { zoneId, desiredWeathers, previousWeathers, beginHour, endHour, event }
     * @returns {object|null}
     */
    static normalizeTarget(source) {
        if (!source || typeof source !== 'object') return null;

        const zones = window.WeatherZoneData;
        const zone = typeof source.zoneId === 'string' ? zones.getZone(source.zoneId) : null;
        if (!zone) return null;

        const known = Object.keys(zones.weatherTypes);
        const weathersOf = (list) => {
            const names = list !== null && typeof list === 'object' && typeof list[Symbol.iterator] === 'function'
                ? Array.from(list)
                : [];
            return known.filter(name => names.includes(name));
        };
        const hourOr = (hour, max, fallback) => (Number.isInteger(hour) && hour >= 0 && hour <= max ? hour : fallback);

        const target = {
            zoneId: zone.id,
            desiredWeathers: weathersOf(source.desiredWeathers),
            previousWeathers: weathersOf(source.previousWeathers),
            beginHour: hourOr(source.beginHour, 23, 0),
            endHour: hourOr(source.endHour, 24, 24),
            event: WeatherReminder.EVENTS.includes(source.event) ? source.event : null
        };

        return target.desiredWeathers.length > 0 || target.event ? target : null;
    }
}

// Export for use in other modules
window.WeatherReminder = WeatherReminder;
