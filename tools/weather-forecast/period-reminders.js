/** One-shot bells on the weather timetable. Each row has its own storage entry so
 * different tabs can add or cancel different periods without overwriting each other. */
class WeatherPeriodReminders {
    static PREFIX = 'ff14tw_weather_period|';

    constructor() {
        this.entries = new Map();
        this.reload();
    }

    static storageKey(zoneId, start) {
        return `${WeatherPeriodReminders.PREFIX}${zoneId}|${start}`;
    }

    get(zoneId, start) {
        return this.entries.get(WeatherPeriodReminders.storageKey(zoneId, start));
    }

    static makeAlert(zoneId, start, leadMinutes, armedAt) {
        const zone = WeatherZoneData.getZone(zoneId);
        if (!zone || !Number.isSafeInteger(start) || start !== WeatherCalculator.getWeatherPeriodStart(start)
            || !Number.isSafeInteger(armedAt) || armedAt < 0 || armedAt >= start
            || !WeatherReminder.LEAD_OPTIONS.includes(leadMinutes)) return null;

        return {
            key: `weather-period:${zoneId}:${armedAt}`,
            zoneId, start, armedAt,
            end: start + WeatherCalculator.WEATHER_DURATION_MS,
            leadMs: leadMinutes * WeatherReminder.MINUTE_MS,
            data: { weather: WeatherCalculator.getWeatherForZone(zone, start) }
        };
    }

    arm(zoneId, start, leadMinutes, now) {
        const alert = WeatherPeriodReminders.makeAlert(zoneId, start, leadMinutes, now);
        if (!alert) return;
        const key = WeatherPeriodReminders.storageKey(zoneId, start);
        this.entries.set(key, alert);
        try {
            window.localStorage.setItem(key, JSON.stringify({ leadMinutes, armedAt: now }));
        } catch {
            // The bell still works in this tab when site data is blocked.
        }
    }

    cancel(zoneId, start) {
        const key = WeatherPeriodReminders.storageKey(zoneId, start);
        this.entries.delete(key);
        try {
            window.localStorage.removeItem(key);
        } catch {
            // The in-memory bell is already cancelled.
        }
    }

    reload(changedKey = null) {
        try {
            const storage = window.localStorage;
            const keys = changedKey ? [changedKey] : Array.from({ length: storage.length }, (_, i) => storage.key(i));
            if (!changedKey) this.entries.clear();
            for (const key of keys) {
                if (!key?.startsWith(WeatherPeriodReminders.PREFIX)) continue;
                const raw = storage.getItem(key);
                if (raw === null) {
                    this.entries.delete(key);
                    continue;
                }
                const [zoneId, timestamp] = key.slice(WeatherPeriodReminders.PREFIX.length).split('|');
                let saved;
                try {
                    saved = JSON.parse(raw);
                } catch {
                    // A malformed entry only affects this row.
                }
                const alert = WeatherPeriodReminders.makeAlert(zoneId, Number(timestamp), saved?.leadMinutes, saved?.armedAt);
                if (alert && key === WeatherPeriodReminders.storageKey(zoneId, alert.start) && alert.end > Date.now()) {
                    this.entries.set(key, alert);
                } else {
                    this.entries.delete(key);
                    storage.removeItem(key);
                }
            }
        } catch {
            // Keep this tab's state when storage is unavailable.
        }
    }

    /** Keep the recurring alert's existing delivery ID when both bells are due together.
     * Different lead times remain independent. A row's own ID survives reloads and changes
     * if the player explicitly arms it again after delivery. */
    combinedAlerts(recurring, now, notified) {
        if (!this.entries.size) return recurring;
        const recurringByStart = new Map(recurring.map(alert => [alert.start, alert]));
        for (const row of this.entries.values()) {
            const same = recurringByStart.get(row.start);
            const shared = same && same.zoneId === row.zoneId && same.armedAt < same.start
                && ReminderScheduler.fireAt(same) === ReminderScheduler.fireAt(row);
            // A tab may close after the scheduler writes its receipt but before it removes the bell.
            if (row.end <= now || notified.has(ReminderScheduler.idOf(row))
                || (shared && notified.has(ReminderScheduler.idOf(same)))) {
                this.cancel(row.zoneId, row.start);
                continue;
            }
            if (shared) {
                same.periodReminder = true;
            } else {
                recurring.push({ ...row, periodReminder: true });
            }
        }
        return recurring;
    }
}
