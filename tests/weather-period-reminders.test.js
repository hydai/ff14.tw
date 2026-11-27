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

test('changing a delivered recurring reminder from 10 to 5 minutes preserves the pending 5-minute bell across reload', () => {
    const page = firstPage();
    const lead = page.$('leadSelect');
    const changeLead = minutes => {
        lead.value = String(minutes);
        lead.dispatchEvent(new page.window.Event('change'));
    };
    changeLead(10);
    page.$('remindBtn').click();
    const start = page.app.reminder.nextAlert(page.now).start;
    bellAt(page, start).click();
    setLead(page, 5);
    page.$('periodConfirm').click();
    page.tick(start - 10 * MINUTE - page.now);
    assert.deepEqual(page.notifications.map(n => n.title), ['恆冰之地 10 分鐘後雷雨']);
    page.tick(2 * MINUTE);
    changeLead(5);
    const restored = firstPage({ stored: page.storage, now: page.now, notification: 'granted' });
    restored.tick(3 * MINUTE - 1);
    assert.equal(bellAt(restored, start).getAttribute('aria-pressed'), 'true');
    assert.equal(restored.notifications.length, 0);
    restored.tick(1);
    restored.tick(1000);
    assert.deepEqual(restored.notifications.map(n => n.title), ['恆冰之地 5 分鐘後雷雨']);
    assert.deepEqual(storedRows(restored), []);
});

test('a stale tab cannot cancel or claim a replacement, even if the row was rearmed in the same millisecond', () => {
    const owner = firstPage();
    const start = Number(thunder(owner).dataset.start);
    const bell = bellAt(owner, start);
    bell.click();
    setLead(owner, 10);
    owner.$('periodConfirm').click();
    const stale = () => firstPage({ stored: owner.storage, now: owner.now, notification: 'granted' });
    const clicking = stale();
    const claiming = stale();
    const previous = owner.app.periodReminders.get('eureka-pagos', start);
    bell.click();
    bell.click();
    setLead(owner, 3);
    owner.$('periodConfirm').click();
    const replacement = owner.app.periodReminders.get('eureka-pagos', start);
    assert.equal(previous.armedAt, replacement.armedAt);
    assert.notEqual(previous.key, replacement.key);
    bellAt(clicking, start).click(); // This tab still displays the old generation.
    assert.equal(clicking.app.periodReminders.get('eureka-pagos', start).key, replacement.key);
    claiming.tick(start - 10 * MINUTE - claiming.now);
    assert.equal(claiming.notifications.length, 0);
    assert.equal(storedRows(owner).length, 1);
    claiming.tick(7 * MINUTE);
    assert.deepEqual(claiming.notifications.map(n => n.title), ['恆冰之地 3 分鐘後雷雨']);
    assert.deepEqual(storedRows(owner), []);
});

test('cleanup of a delivered generation leaves a rearmed bell intact when storage events arrive late', () => {
    const owner = firstPage();
    const start = Number(thunder(owner).dataset.start);
    const bell = bellAt(owner, start);
    bell.click();
    setLead(owner, 10);
    owner.$('periodConfirm').click();
    const other = firstPage({ stored: owner.storage, now: owner.now, notification: 'granted' });
    owner.tick(start - 10 * MINUTE - owner.now);
    assert.equal(owner.notifications.length, 1);
    bellAt(owner, start).click();
    setLead(owner, 5);
    owner.$('periodConfirm').click();
    assert.equal(storedRows(owner).length, 1);
    other.tick(owner.now - other.now); // Sees the receipt while still holding the old row in memory.
    assert.equal(other.notifications.length, 0);
    assert.equal(bellAt(other, start).getAttribute('aria-pressed'), 'true');
    other.tick(5 * MINUTE);
    assert.deepEqual(other.notifications.map(n => n.title), ['恆冰之地 5 分鐘後雷雨']);
});

test('arming, cancelling and dispatching wait on the same row lock and recheck after it is granted', async () => {
    const page = firstPage({ notification: 'granted' });
    const start = Number(thunder(page).dataset.start);
    const rowKey = 'ff14tw_weather_period|eureka-pagos|' + start;
    const waiting = [];
    page.window.navigator.locks = {
        request(name, options, callback) {
            if (name !== rowKey) return Promise.resolve().then(() => callback({ name }));
            return new Promise(resolve => waiting.push(() => resolve(callback({ name }))));
        }
    };
    bellAt(page, start).click();
    setLead(page, 10);
    page.$('periodConfirm').click();
    assert.equal(page.storage.has(rowKey), false);
    assert.equal(waiting.length, 1);
    waiting.shift()();
    const owner = firstPage({ stored: page.storage, now: page.now });
    page.tick(start - 10 * MINUTE - page.now);
    await page.settle();
    assert.equal(waiting.length, 1, 'delivery also waits for the edit in the other tab');
    bellAt(owner, start).click();
    bellAt(owner, start).click();
    setLead(owner, 3);
    owner.$('periodConfirm').click();
    waiting.shift()();
    await page.settle();
    assert.equal(page.notifications.length, 0);
    assert.equal(page.app.periodReminders.get('eureka-pagos', start).leadMs, 3 * MINUTE);
    bellAt(page, start).click();
    assert.equal(waiting.length, 1);
    assert.equal(page.storage.has(rowKey), true);
    waiting.shift()();
    assert.equal(page.storage.has(rowKey), false);
});

test('bells saved without a generation still honor their original delivery receipts', () => {
    const probe = firstPage();
    const start = Number(thunder(probe).dataset.start);
    const key = 'ff14tw_weather_period|eureka-pagos|' + start;
    const saved = JSON.stringify({ armedAt: probe.now, leadMinutes: 5 });
    const receipt = 'ff14tw_weather_notified|weather-period:eureka-pagos:' + probe.now + '|' + start;
    for (const delivered of [false, true]) {
        const stored = { [key]: saved };
        if (delivered) stored[receipt] = String(start);
        const page = firstPage({ stored, now: probe.now, notification: 'granted' });
        page.tick(start - 5 * MINUTE - page.now);
        assert.equal(page.notifications.length, delivered ? 0 : 1);
        assert.equal(page.storage.has(key), false);
        assert.equal(page.storage.get(receipt), String(start));
    }
});

test('the row toggle keeps its accessible name in each language and describes the armed time separately', () => {
    const page = firstPage();
    const start = Number(thunder(page).dataset.start);
    for (const [lang, zone] of [['zh', '恆冰之地'], ['en', 'Eureka Pagos'], ['ja', 'エウレカ']]) {
        page.setLang(lang);
        const bell = bellAt(page, start);
        const name = bell.getAttribute('aria-label');
        const add = bell.title;
        assert.ok(name.includes(zone));
        assert.equal(bell.getAttribute('aria-pressed'), 'false');
        bell.click();
        page.$('periodConfirm').click();
        assert.equal(bell.getAttribute('aria-label'), name);
        assert.equal(bell.getAttribute('aria-pressed'), 'true');
        const time = page.window.WeatherCalculator.formatLocalTime(start - 5 * MINUTE);
        assert.ok(bell.getAttribute('aria-description').includes(time));
        assert.ok(bell.title.includes(time));
        bell.click();
        assert.equal(bell.getAttribute('aria-label'), name);
        assert.equal(bell.getAttribute('aria-pressed'), 'false');
        assert.equal(bell.getAttribute('aria-description'), null);
        assert.equal(bell.title, add);
    }
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

test('revalidating a due alert preserves in-memory bells when storage can be read but writes fail', () => {
    const page = firstPage({ notification: 'granted' });
    page.window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    page.$('remindBtn').click();
    const start = page.app.reminder.nextAlert(page.now).start;
    bellAt(page, start).click();
    page.$('periodConfirm').click();
    page.tick(start - 5 * MINUTE - page.now);
    page.tick(1000);
    assert.deepEqual(page.notifications.map(n => n.title), ['恆冰之地 5 分鐘後雷雨']);
    assert.equal(page.app.periodReminders.entries.size, 0);
    assert.ok(page.app.reminder.active);
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
