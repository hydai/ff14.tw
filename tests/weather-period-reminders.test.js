const test = require('node:test');
const assert = require('node:assert/strict');
const { createWeatherPage } = require('./helpers/weather-page.js');

const MINUTE = 60_000;
const PAGOS = '#eureka-pagos-8--0-24';
const firstPage = (options = {}) => createWeatherPage({ hash: PAGOS, ...options });
const buttons = (page) => Array.from(page.$('resultsBody').querySelectorAll('.wx-period-bell'));
const thunder = (page) => buttons(page).find(button => button.dataset.weather === 'Thunder');
const bellAt = (page, start) => buttons(page).find(button => Number(button.dataset.start) === start);
const setLead = (page, value) => {
    page.$('periodLead').value = String(value);
    page.$('periodLead').dispatchEvent(new page.window.Event('change'));
};
const storedRows = (page) => Array.from(page.storage.keys()).filter(key => key.startsWith('ff14tw_weather_period|'));

test('a timetable bell previews the chosen local time and built-in sound, then follows that row across zones and reloads', async () => {
    const page = firstPage();
    const row = thunder(page);
    const start = Number(row.dataset.start);
    row.click();
    assert.ok(page.document.activeElement === page.$('periodLead'));
    assert.match(page.$('periodTarget').textContent, /恆冰之地.*雷雨/);
    assert.equal(page.$('periodLead').value, '5');
    setLead(page, 3);
    assert.ok(page.$('periodPreview').textContent.includes(page.window.WeatherCalculator.formatLocalTime(start - 3 * MINUTE)));
    page.$('periodSound').click();
    await page.settle();
    assert.equal(page.beeps, 2);
    assert.equal(page.notifications.length, 0);
    assert.equal(page.permissionRequests, 0);
    assert.equal(storedRows(page).length, 0);

    page.$('periodConfirm').click();
    assert.equal(page.permissionRequests, 1);
    assert.equal(row.getAttribute('aria-pressed'), 'true');
    assert.ok(page.document.activeElement === row);
    assert.equal(page.app.reminder.active, null);
    assert.equal(page.app.reminder.leadMinutes, 5);
    page.selectZone('gridania');
    const restored = createWeatherPage({ now: page.now, stored: Object.fromEntries(page.storage), notification: 'granted' });
    assert.equal(restored.$('zoneSelect').value, 'gridania');
    assert.equal(bellAt(restored, start).getAttribute('aria-pressed'), 'false');
    restored.changeHash(PAGOS);
    assert.equal(bellAt(restored, start).getAttribute('aria-pressed'), 'true');
    restored.selectZone('gridania');
    restored.document.dispatchEvent(new restored.window.Event('keydown'));
    restored.tick(start - 3 * MINUTE - restored.now - 1);
    assert.equal(restored.notifications.length, 0);
    restored.tick(1);
    assert.equal(restored.notifications[0].title, '恆冰之地 3 分鐘後雷雨');
    assert.equal(restored.beeps, 2);
    assert.deepEqual(storedRows(restored), []);
    restored.tick(24 * 60 * MINUTE);
    assert.equal(restored.notifications.length, 1);
});

test('rows at the same time in different zones coexist, cancelling one also clears it in another tab', () => {
    const page = firstPage();
    const row = thunder(page);
    const start = Number(row.dataset.start);
    row.click();
    page.$('periodConfirm').click();
    const [pagosKey] = storedRows(page);
    page.selectZone('gridania');
    bellAt(page, start).click();
    page.$('periodConfirm').click();
    assert.equal(storedRows(page).length, 2);
    const other = firstPage({ now: page.now, stored: Object.fromEntries(page.storage) });
    page.changeHash(PAGOS);
    bellAt(page, start).click();
    assert.equal(page.storage.has(pagosKey), false);
    other.storage.delete(pagosKey);
    other.storageEvent(pagosKey);
    assert.equal(bellAt(other, start).getAttribute('aria-pressed'), 'false');
    other.selectZone('gridania');
    assert.equal(bellAt(other, start).getAttribute('aria-pressed'), 'true');
    page.tick(start - 5 * MINUTE - page.now);
    assert.equal(page.notifications.length, 1);
    assert.match(page.notifications[0].title, /格里達尼亞/);
});

test('matching recurring and one-shot alerts ring once together and the next matching weather still rings', () => {
    const page = firstPage();
    page.$('remindBtn').click();
    const first = page.app.reminder.nextAlert(page.now);
    const second = page.app.reminder.nextAlert(first.end);
    bellAt(page, first.start).click();
    page.$('periodConfirm').click();
    page.tick(first.start - 5 * MINUTE - page.now);
    assert.equal(page.notifications.length, 1);
    assert.equal(page.beeps, 2);
    assert.deepEqual(storedRows(page), []);
    assert.ok(page.app.reminder.active);
    page.tick(second.start - 5 * MINUTE - page.now);
    assert.equal(page.notifications.length, 2);
    assert.equal(page.beeps, 4);
});

test('different lead times for the same start honor both scheduled times', () => {
    const page = firstPage();
    page.$('remindBtn').click();
    const start = page.app.reminder.nextAlert(page.now).start;
    bellAt(page, start).click();
    setLead(page, 10);
    page.$('periodConfirm').click();
    page.tick(start - 10 * MINUTE - page.now);
    assert.equal(page.notifications[0].title, '恆冰之地 10 分鐘後雷雨');
    page.tick(5 * MINUTE);
    assert.equal(page.notifications[1].title, '恆冰之地 5 分鐘後雷雨');
});

test('reopening after delivery clears a bell left in storage without ringing again', () => {
    for (const recurring of [false, true]) {
        const page = firstPage();
        if (recurring) page.$('remindBtn').click();
        const row = thunder(page);
        const start = Number(row.dataset.start);
        row.click();
        page.$('periodConfirm').click();
        const [key] = storedRows(page);
        const saved = page.storage.get(key);
        page.tick(start - 5 * MINUTE - page.now);
        assert.equal(page.notifications.length, 1);
        const restored = firstPage({ now: page.now, stored: { ...Object.fromEntries(page.storage), [key]: saved } });
        restored.tick(1000);
        assert.equal(restored.notifications.length, 0);
        assert.equal(bellAt(restored, start).getAttribute('aria-pressed'), 'false');
        assert.deepEqual(storedRows(restored), []);
    }
});

test('a late bell previews the start, uses the current language, and works with site data blocked', () => {
    const page = firstPage({ storageThrows: true, notification: 'denied' });
    const start = Number(thunder(page).dataset.start);
    page.tick(start - MINUTE - page.now);
    bellAt(page, start).click();
    assert.match(page.$('periodPreview').textContent, /開始時/);
    page.setLang('en');
    assert.match(page.$('periodTarget').textContent, /Eureka Pagos.*Thunder/);
    page.setLang('ja');
    assert.match(page.$('periodPreview').textContent, /開始時/);
    page.$('periodConfirm').click();
    page.tick(MINUTE);
    assert.equal(page.beeps, 2);
    assert.equal(page.notifications.length, 0);
    assert.equal(page.document.querySelectorAll('.reminder-alert').length, 1);
    assert.equal(page.app.periodReminders.entries.size, 0);
    assert.equal(bellAt(page, start), undefined);
});

test('dismiss, a period starting while the editor is open, and expired storage never arm a stale row', () => {
    const page = firstPage();
    const first = buttons(page)[0];
    const start = Number(first.dataset.start);
    first.click();
    page.$('periodDismiss').click();
    assert.deepEqual(storedRows(page), []);
    first.click();
    page.tick(start - page.now);
    assert.equal(page.app.editingPeriod, null);
    assert.ok(page.document.activeElement === page.$('timetableTitle'));
    page.$('periodConfirm').click();
    assert.deepEqual(storedRows(page), []);

    const prefix = 'ff14tw_weather_period|';
    const data = JSON.stringify({ leadMinutes: 5, armedAt: start - MINUTE });
    const expired = firstPage({ now: start + 1_400_000, stored: {
        [prefix + 'eureka-pagos|' + start]: data,
        [prefix + 'unknown-zone|' + (start + 2_800_000)]: data,
        [prefix + 'eureka-pagos|' + (start + 2_800_000)]: '{bad json'
    } });
    assert.deepEqual(storedRows(expired), []);
    assert.equal(expired.app.periodReminders.entries.size, 0);
});
