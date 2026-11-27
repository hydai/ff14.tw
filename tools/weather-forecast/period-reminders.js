/** One-shot bells on the weather timetable. Each row has its own storage entry so
 * different tabs can add or cancel different periods without overwriting each other. */
class WeatherPeriodReminders {
    static PREFIX = 'ff14tw_weather_period|';

    constructor(onChange) {
        this.entries = new Map();
        this.reload();
        this.onChange = onChange;
    }

    static storageKey(zoneId, start) {
        return `${WeatherPeriodReminders.PREFIX}${zoneId}|${start}`;
    }

    get(zoneId, start) {
        return this.entries.get(WeatherPeriodReminders.storageKey(zoneId, start));
    }

    static makeAlert(zoneId, start, leadMinutes, armedAt, generation) {
        const zone = WeatherZoneData.getZone(zoneId);
        if (!zone || !Number.isSafeInteger(start) || start !== WeatherCalculator.getWeatherPeriodStart(start)
            || !Number.isSafeInteger(armedAt) || armedAt < 0 || armedAt >= start
            || (generation !== undefined && (typeof generation !== 'string' || !/^[\w-]{1,80}$/.test(generation)))
            || !WeatherReminder.LEAD_OPTIONS.includes(leadMinutes)) return null;

        return {
            // Entries saved before generations were introduced keep their original delivery ID.
            key: `weather-period:${zoneId}:${generation ?? armedAt}`,
            zoneId, start, armedAt,
            end: start + WeatherCalculator.WEATHER_DURATION_MS,
            leadMs: leadMinutes * WeatherReminder.MINUTE_MS,
            data: { weather: WeatherCalculator.getWeatherForZone(zone, start) }
        };
    }

    arm(zoneId, start, leadMinutes, now) {
        const generation = window.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`;
        const alert = WeatherPeriodReminders.makeAlert(zoneId, start, leadMinutes, now, generation);
        if (!alert) return;
        const key = WeatherPeriodReminders.storageKey(zoneId, start);
        return ReminderScheduler.withLock(key, () => {
            this.reload(key);
            if (start > Date.now() && !this.entries.has(key)) {
                try {
                    window.localStorage.setItem(key, JSON.stringify({ leadMinutes, armedAt: now, generation }));
                } catch {
                    alert.localOnly = true;
                }
                this.entries.set(key, alert);
            }
            this.onChange?.();
        });
    }

    cancel(row) {
        const key = WeatherPeriodReminders.storageKey(row.zoneId, row.start);
        return ReminderScheduler.withLock(key, () => this.removeIfCurrent(row));
    }

    /** Called inside the row's edit or delivery lock, including when cleaning up a delivered bell. */
    removeIfCurrent(row) {
        const key = WeatherPeriodReminders.storageKey(row.zoneId, row.start);
        this.reload(key);
        if (this.entries.get(key)?.key === row.key) {
            this.entries.delete(key);
            try {
                window.localStorage.removeItem(key);
            } catch {
                // The in-memory bell is already cancelled.
            }
        }
        this.onChange?.();
    }

    reload(changedKey = null) {
        try {
            const storage = window.localStorage;
            const keys = changedKey ? [changedKey] : Array.from({ length: storage.length }, (_, i) => storage.key(i));
            if (!changedKey) {
                for (const [key, row] of this.entries) {
                    if (!row.localOnly) this.entries.delete(key);
                }
            }
            for (const key of keys) {
                if (!key?.startsWith(WeatherPeriodReminders.PREFIX)) continue;
                const raw = storage.getItem(key);
                if (raw === null) {
                    if (!this.entries.get(key)?.localOnly) this.entries.delete(key);
                    continue;
                }
                const [zoneId, timestamp] = key.slice(WeatherPeriodReminders.PREFIX.length).split('|');
                let saved;
                try {
                    saved = JSON.parse(raw);
                } catch {
                    // A malformed entry only affects this row.
                }
                const alert = WeatherPeriodReminders.makeAlert(zoneId, Number(timestamp), saved?.leadMinutes, saved?.armedAt, saved?.generation);
                if (alert && key === WeatherPeriodReminders.storageKey(zoneId, alert.start) && alert.end > Date.now()) {
                    this.entries.set(key, alert);
                } else {
                    this.entries.delete(key);
                    ReminderScheduler.withLock(key, () => {
                        try {
                            if (storage.getItem(key) === raw) storage.removeItem(key);
                        } catch {
                            // Retry pruning on a future reload when storage is available.
                        }
                    });
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
            const shared = same && !notified.has(ReminderScheduler.idOf(same))
                && same.zoneId === row.zoneId && same.armedAt < same.start
                && ReminderScheduler.fireAt(same) === ReminderScheduler.fireAt(row);
            // A tab may close after the scheduler writes its receipt but before it removes the bell.
            if (row.end <= now || notified.has(ReminderScheduler.idOf(row))) {
                this.cancel(row);
                continue;
            }
            if (shared) {
                same.relatedId = ReminderScheduler.idOf(row);
                same.periodReminder = row;
            } else {
                recurring.push({ ...row, periodReminder: row });
            }
        }
        return recurring;
    }
}
