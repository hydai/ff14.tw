const test = require('node:test');
const assert = require('node:assert/strict');

const TimeCalculator = require('../tools/timed-gathering/time-calculator');
const NotificationManager = require('../tools/timed-gathering/notification-manager');

const EORZEA_MULTIPLIER = 3600 / 175;
const TEST_TIMESTAMP = Date.parse('2026-07-11T12:05:46.775Z');
const EXPECTED_EORZEA_TIME = {
    hours: 12,
    minutes: 16,
    seconds: 2
};

test('ET conversion is independent of the local timezone', () => {
    const originalTimezone = process.env.TZ;
    const timezones = [
        'UTC',
        'Asia/Taipei',
        'Asia/Tokyo',
        'America/New_York'
    ];

    try {
        for (const timezone of timezones) {
            process.env.TZ = timezone;

            const displayTime = TimeCalculator.prototype.getEorzeaTime.call(
                { EORZEA_MULTIPLIER },
                TEST_TIMESTAMP
            );
            const notificationTime = NotificationManager.prototype.getEorzeaTime.call(
                {},
                TEST_TIMESTAMP
            );

            assert.deepEqual(displayTime, EXPECTED_EORZEA_TIME, timezone);
            assert.deepEqual(notificationTime, EXPECTED_EORZEA_TIME, timezone);
        }
    } finally {
        if (originalTimezone === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = originalTimezone;
        }
    }
});
