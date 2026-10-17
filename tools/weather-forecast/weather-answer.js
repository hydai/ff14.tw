/**
 * FF14 Weather Forecast - Weather Answer
 * Works out "when is my weather next?" from the search results: consecutive
 * periods of the same weather merged into one run, clipped to the chosen
 * Eorzea time of day, plus the number helpers for wait times and dates.
 * Pure functions, no DOM access.
 */

const WeatherAnswer = {
    /**
     * Find the next occurrences of the chosen weather in a zone
     *
     * Periods that match WeatherSearch.search() (weather, previous weather, time of
     * day, event) and share the same weather are merged into one run. With a time of
     * day (not 0-24) each run is clipped to the part inside it, and every separate
     * part counts as one occurrence. The one in progress (start <= now < end) comes first.
     *
     * Every occurrence is whole: a run is followed to its real end, and one that is
     * already under way back to its real start, so it looks the same wherever "now"
     * falls inside it (a reminder tells runs apart by their start). A run that starts
     * within the 60 days of the search is returned whole even if it ends after them.
     * @param {object} zone - Zone object with weatherTable
     * @param {object} filters - { desiredWeathers, previousWeathers, beginHour, endHour, event };
     *     the two weather fields can be a Set or an array
     * @param {number} now - Timestamp in milliseconds
     * @param {number} limit - Maximum number of occurrences to return
     * @returns {array} Array of { start, end, weather, previousWeather, periodStart, periodEnd },
     *     where periodStart/periodEnd are the whole run and start/end the clipped part
     */
    occurrences(zone, filters, now, limit) {
        if (!zone || !filters || !(limit > 0)) {
            return [];
        }

        const hasRange = Number.isFinite(filters.beginHour) && Number.isFinite(filters.endHour);
        const criteria = {
            desiredWeathers: new Set(filters.desiredWeathers),
            previousWeathers: new Set(filters.previousWeathers),
            beginHour: hasRange ? filters.beginHour : 0,
            endHour: hasRange ? filters.endHour : 24,
            event: filters.event || null
        };

        // Nothing to look for: a weather or an event has to be chosen
        if (criteria.desiredWeathers.size === 0 && !criteria.event) {
            return [];
        }

        const duration = window.WeatherCalculator.WEATHER_DURATION_MS;
        const search = new window.WeatherSearch();
        const span = search.defaultDays * 24 * 60 * 60 * 1000;
        const horizon = now + span;
        // A run is never followed past the length of the search, so a zone that
        // never changes weather cannot keep it going forever
        const fits = (start, end) => end - start + duration <= span;
        // The first period at or after the given time that matches (undefined if none).
        // Asking for one at a time keeps the work to what is needed rather than the whole
        // 60 days, and no result cap can cut a run short.
        const nextMatch = (time) => search.search(zone, criteria, time, 1)[0];

        const results = [];
        let match = nextMatch(now);

        while (match && match.start < horizon && results.length < limit) {
            const weather = match.weather;
            let previousWeather = match.previousWeather;
            let runStart = match.start;
            let runEnd = match.end;
            // A period that starts exactly where the run is joined, in the same weather, is part of it
            const continues = (found, start) => found && found.start === start && found.weather === weather;

            // Already under way: go back to where it really started
            if (runStart <= now) {
                let before = nextMatch(runStart - duration);
                while (continues(before, runStart - duration) && fits(runStart, runEnd)) {
                    runStart = before.start;
                    previousWeather = before.previousWeather;
                    before = nextMatch(runStart - duration);
                }
            }

            // Follow it to its end; the period found after it is where the next run starts
            let following = nextMatch(runEnd);
            while (continues(following, runEnd) && fits(runStart, runEnd)) {
                runEnd = following.end;
                following = nextMatch(runEnd);
            }

            for (const piece of WeatherAnswer.clip(runStart, runEnd, criteria.beginHour, criteria.endHour)) {
                // Parts that are already over are not an answer any more
                if (piece.end > now && results.length < limit) {
                    results.push({
                        start: piece.start,
                        end: piece.end,
                        weather: weather,
                        previousWeather: previousWeather,
                        periodStart: runStart,
                        periodEnd: runEnd
                    });
                }
            }

            match = following;
        }

        return results;
    },

    /**
     * Cut a run to the part inside an Eorzea time-of-day range
     * @param {number} runStart - Run start timestamp
     * @param {number} runEnd - Run end timestamp
     * @param {number} beginHour - Range start hour (0-23)
     * @param {number} endHour - Range end hour (0-24); a range that wraps past midnight is fine
     * @returns {array} Array of { start, end }, one per separate part; the run itself when the range is 0-24
     */
    clip(runStart, runEnd, beginHour, endHour) {
        if (!(runEnd > runStart)) {
            return [];
        }
        if (beginHour === undefined || endHour === undefined || (beginHour === 0 && endHour === 24)) {
            return [{ start: runStart, end: runEnd }];
        }

        const calc = window.WeatherCalculator;
        const hour = calc.EORZEA_HOUR_MS;
        const pieces = [];

        // Go through the Eorzea hours the run touches and join the neighbouring ones inside the range
        for (let slot = Math.floor(runStart / hour) * hour; slot < runEnd; slot += hour) {
            if (!calc.isInTimeRange(calc.getEorzeaTime(slot).hours, beginHour, endHour)) {
                continue;
            }
            const start = Math.max(slot, runStart);
            const end = Math.min(slot + hour, runEnd);
            const last = pieces[pieces.length - 1];
            if (last && last.end === start) {
                last.end = end;
            } else {
                pieces.push({ start, end });
            }
        }

        return pieces;
    },

    /**
     * Split a wait time into days, hours and minutes, rounded up to a whole minute (at least 1)
     * Under an hour only has minutes, under a day has hours and minutes, and a day or more has no minutes
     * @param {number} ms - Wait time in milliseconds
     * @returns {object} { days, hours, minutes }
     */
    waitParts(ms) {
        const total = Math.max(1, Math.ceil(ms / 60000));

        if (total < 60) {
            return { days: 0, hours: 0, minutes: total };
        }
        if (total < 1440) {
            return { days: 0, hours: Math.floor(total / 60), minutes: total % 60 };
        }
        return { days: Math.floor(total / 1440), hours: Math.floor(total / 60) % 24, minutes: 0 };
    },

    /**
     * Count the calendar days (local time) between two timestamps
     * @param {number} ts - Timestamp to describe
     * @param {number} now - Timestamp to count from
     * @returns {number} 0 for the same day, 1 for the next day, negative for earlier days
     */
    dayOffset(ts, now) {
        // Compare the local dates as UTC dates, so a 23 or 25 hour day (daylight saving) still counts as one
        const day = (time) => {
            const date = new Date(time);
            return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
        };
        return (day(ts) - day(now)) / 86400000;
    },

    /**
     * Describe a start and end as Eorzea hours
     * @param {number} start - Start timestamp
     * @param {number} end - End timestamp
     * @returns {object} { from, to }: the Eorzea hour at start, and the hour the span ends at
     *     (24 when it ends at midnight, then 1 and up again: two periods from ET 16 are 16 to 8)
     */
    etHours(start, end) {
        const calc = window.WeatherCalculator;
        const from = calc.getEorzeaTime(start).hours;
        let to = from + Math.round((end - start) / calc.EORZEA_HOUR_MS);

        while (to > 24) {
            to -= 24;
        }

        return { from, to };
    }
};

// Export for use in other modules
window.WeatherAnswer = WeatherAnswer;
