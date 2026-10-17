const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDom } = require('./helpers/fake-dom.js');
const { tagAttrs, classesOf } = require('./helpers/html-fragment.js');
const { createWeatherPage } = require('./helpers/weather-page.js');

const KEY = 'ff14tw_weather_reminder';
const NOTIFIED_KEY = 'ff14tw_weather_notified';
const MINUTE = 60_000;
// 2025-10-09 08:53:20 UTC：科薩馬爾卡是碧空，下一次陣雨在 50 分鐘後（同 tests/weather-page.test.js）
const T0 = 1_760_000_000_000;
// 記住的選擇：科薩馬爾卡＋陣雨
const KOZAMAUKA_SHOWERS = {
    ff14tw_weather_selection: JSON.stringify({ zoneId: 'kozamauka', desiredWeathers: ['Showers'], previousWeathers: [], beginHour: 0, endHour: 24 })
};
const SHOWERS = { desiredWeathers: ['Showers'] };
// 正規化之後的提醒目標：科薩馬爾卡＋陣雨
const TARGET = { zoneId: 'kozamauka', desiredWeathers: ['Showers'], previousWeathers: [], beginHour: 0, endHour: 24, event: null };

const pad = (n) => String(n).padStart(2, '0');
const hm = (ts) => {
    const date = new Date(ts);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
// 提醒的時間：今天只寫 HH:MM，明天和更之後的日子前面寫上哪一天，英文連介系詞（本地日期相減，跟頁面用同一個時區）
function remindAt(ts, now, lang = 'zh') {
    const date = new Date(ts);
    const dayNumber = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const offset = (dayNumber(date) - dayNumber(new Date(now))) / 86_400_000;
    const time = hm(ts);
    const md = `${date.getMonth() + 1}/${date.getDate()}`;
    const [today, tomorrow, later] = {
        zh: [time, `明天 ${time}`, `${md} ${time}`],
        en: [`at ${time}`, `tomorrow at ${time}`, `on ${md} at ${time}`],
        ja: [time, `明日 ${time}`, `${md} ${time}`]
    }[lang];
    return offset === 0 ? today : offset === 1 ? tomorrow : later;
}
// vm 是另一個 realm：比對前先轉成測試端的物件
const plain = (value) => JSON.parse(JSON.stringify(value));
// 一個 state（同 WeatherStore.state 的形狀，天氣是 Set）
const state = (zoneId, desired = [], extra = {}) => ({
    zoneId, desiredWeathers: new Set(desired), previousWeathers: new Set(), beginHour: 0, endHour: 24, event: null, ...extra
});

// ---------- WeatherReminder：在 vm 裡載入真正的腳本 ----------
// 同 index.html 的順序；localStorage 是 storage 這個 Map（stored 是初始內容），storageThrows 時光是讀 localStorage 就丟例外
const MODULES = [
    'tools/weather-forecast/zone-data.js',
    'tools/weather-forecast/weather-calculator.js',
    'tools/weather-forecast/weather-search.js',
    'tools/weather-forecast/weather-store.js',
    'tools/weather-forecast/weather-answer.js',
    'assets/js/reminder-scheduler.js',
    'tools/weather-forecast/weather-reminder.js'
];

function loadModules({ stored = {}, storageThrows = false } = {}) {
    const dom = createFakeDom();
    const win = dom.window;
    const storage = new Map(Object.entries(stored));
    if (storageThrows) {
        vm.runInContext("Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true })", win);
        assert.throws(() => vm.runInContext('window.localStorage', win), /SecurityError/);
    } else {
        win.localStorage = {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: (key) => storage.delete(key),
            key: (index) => Array.from(storage.keys())[index] ?? null,
            get length() { return storage.size; }
        };
    }
    for (const file of MODULES) dom.load(file);
    return {
        win,
        storage,
        WeatherReminder: win.WeatherReminder,
        ReminderScheduler: win.ReminderScheduler,
        WeatherStore: win.WeatherStore,
        occurrences: (zoneId, filters, now, limit) => win.WeatherAnswer.occurrences(win.WeatherZoneData.getZone(zoneId), filters, now, limit),
        create: () => vm.runInContext('new WeatherReminder()', win),
        saved: () => JSON.parse(storage.get(KEY))
    };
}

test('提早幾分鐘：預設 5，改了會存，不在選項裡的不理', () => {
    const { create, saved, WeatherReminder } = loadModules();
    assert.equal(WeatherReminder.STORAGE_KEY, KEY);
    assert.deepEqual(Array.from(WeatherReminder.LEAD_OPTIONS), [1, 3, 5, 10, 15, 30]);
    assert.equal(WeatherReminder.DEFAULT_LEAD, 5);

    const r = create();
    assert.equal(r.leadMinutes, 5);
    r.setLead(10);
    assert.equal(r.leadMinutes, 10);
    assert.equal(saved().leadMinutes, 10);
    for (const bad of [7, '15', 0, null, undefined, NaN]) {
        r.setLead(bad);
        assert.equal(r.leadMinutes, 10, String(bad));
    }
    assert.equal(saved().leadMinutes, 10);
    // 下次打開記得
    assert.equal(create().leadMinutes, 10);
});

test('arm 存目標與時間、取代舊的；cancel 清掉', () => {
    const { create, saved } = loadModules();
    const r = create();
    assert.equal(r.active, null);

    const shown = state('kozamauka', ['Showers']);
    r.arm(shown, 1000);
    assert.equal(r.active.armedAt, 1000);
    assert.equal(r.active.target.zoneId, 'kozamauka');
    assert.ok(Array.isArray(r.active.target.desiredWeathers));
    assert.deepEqual(plain(r.active), { target: TARGET, armedAt: 1000 });
    assert.deepEqual(saved(), { leadMinutes: 5, reminder: { target: TARGET, armedAt: 1000 } });
    // 存的是副本：之後畫面上的選擇改了，提醒不跟著變
    shown.desiredWeathers.add('Rain');
    assert.deepEqual(plain(r.active.target.desiredWeathers), ['Showers']);
    // 重新整理後還在
    assert.deepEqual(plain(create().active), { target: TARGET, armedAt: 1000 });

    // 在別的目標上按：換成新的
    r.arm(state('gridania', ['Rain']), 2000);
    assert.equal(r.active.target.zoneId, 'gridania');
    assert.equal(r.active.armedAt, 2000);
    assert.equal(saved().reminder.target.zoneId, 'gridania');
    // 沒有目標的選擇（只選了地區）不會蓋掉提醒
    r.arm(state('uldah'), 3000);
    assert.equal(r.active.target.zoneId, 'gridania');

    r.cancel();
    assert.equal(r.active, null);
    assert.equal(saved().reminder, null);
    assert.equal(create().active, null);
});

test('isFor：天氣加入的順序不同也算同一個目標，時段不同就不是', () => {
    const { create } = loadModules();
    const r = create();
    const desired = new Set();
    desired.add('Showers');
    desired.add('Rain');
    const same = { ...state('kozamauka'), desiredWeathers: desired };
    assert.equal(r.isFor(same), false, '沒有提醒');

    r.arm(state('kozamauka', ['Rain', 'Showers']), 1000);
    assert.equal(r.isFor(same), true);
    assert.equal(r.isFor({ ...same, beginHour: 8 }), false);
    assert.equal(r.isFor({ ...same, event: 'garlok' }), false);
    assert.equal(r.isFor(state('kozamauka', ['Rain'])), false);
    assert.equal(r.isFor({ ...same, zoneId: 'gridania' }), false);
    assert.equal(r.isFor(state(null)), false);
});

test('alerts：key 帶目標、lead 換算成毫秒、armedAt 不變；都還沒到提早範圍時列接下來兩次', () => {
    const { create, occurrences, WeatherStore } = loadModules();
    const r = create();
    assert.deepEqual(Array.from(r.alerts(T0)), [], '沒有提醒');

    r.arm(state('kozamauka', ['Showers']), 1000);
    const expected = occurrences('kozamauka', SHOWERS, T0, 2);
    const alerts = r.alerts(T0);
    assert.equal(alerts.length, 2);
    alerts.forEach((alert, i) => {
        assert.equal(alert.key, `weather:${WeatherStore.hashOf(r.active.target)}`);
        assert.equal(alert.key, 'weather:kozamauka-7--0-24');
        assert.equal(alert.start, expected[i].start);
        assert.equal(alert.end, expected[i].end);
        assert.equal(alert.leadMs, 300_000);
        assert.equal(alert.armedAt, 1000);
        assert.deepEqual(plain(alert.data), plain(expected[i]), 'data 是那一次的 occurrence');
    });

    r.setLead(10);
    assert.equal(r.alerts(T0)[0].leadMs, 600_000);
    assert.equal(r.alerts(T0)[0].armedAt, 1000, '改提早分鐘數不重設 armedAt');
    r.cancel();
    assert.deepEqual(Array.from(r.alerts(T0)), []);
});

test('nextFireAt：設定時正在下的那一次跳過、提醒過的跳過', () => {
    const { create, occurrences, ReminderScheduler } = loadModules();
    const r = create();
    assert.equal(r.nextFireAt(T0, new Set()), null, '沒有提醒');
    assert.equal(r.nextAlert(T0, new Set()), null);

    // 在第一次正在下的時候設定：從下一次開始
    const [first] = occurrences('kozamauka', SHOWERS, T0, 1);
    const inside = first.start + MINUTE;
    r.arm(state('kozamauka', ['Showers']), inside);
    const during = r.alerts(inside);
    assert.equal(during[0].start, first.start, '第一次正在進行');
    assert.equal(r.nextFireAt(inside, new Set()), ReminderScheduler.fireAt(during[1]));

    // 第一次還沒到：提早 5 分鐘；那一次提醒過了就是第二次
    r.arm(state('kozamauka', ['Showers']), T0);
    const ahead = r.alerts(T0);
    assert.equal(r.nextFireAt(T0, new Set()), ahead[0].start - 5 * MINUTE);
    assert.equal(r.nextFireAt(T0, new Set([ReminderScheduler.idOf(ahead[0])])), ReminderScheduler.fireAt(ahead[1]));
    // nextAlert：會提醒的那一次本身（畫面要看它的開始時間），nextFireAt 是它的提醒時間
    assert.equal(r.nextAlert(T0, new Set()).start, ahead[0].start);
    assert.equal(r.nextAlert(T0, new Set([ReminderScheduler.idOf(ahead[0])])).start, ahead[1].start);

    // 已經在提早的範圍內才設定：開始的那一刻
    r.arm(state('kozamauka', ['Showers']), first.start - 2 * MINUTE);
    assert.equal(r.nextFireAt(first.start - 2 * MINUTE, new Set()), first.start);
});

test('提早 30 分鐘、前一次還沒結束時之後的一次已經到提醒時間：每一次都在開始前 30 分鐘提醒', () => {
    const { win, create, occurrences } = loadModules();
    const LEAD = 30 * MINUTE;
    // 利姆薩·羅敏薩的雨與陰天：找連續三次，第三次的提醒時間在第一次結束之前
    const list = occurrences('limsa-lominsa', { desiredWeathers: ['Rain', 'Clouds'] }, T0, 400);
    const i = list.findIndex((o, k) => k + 2 < list.length && o.start - LEAD > T0 && list[k + 2].start - LEAD < o.end);
    assert.ok(i >= 0, '測試資料裡要有這樣的連續三次');
    const runs = list.slice(i, i + 3);

    const r = create();
    r.setLead(30);
    let now = runs[0].start - LEAD - MINUTE;
    r.arm(state('limsa-lominsa', ['Rain', 'Clouds']), now);
    const firedAt = new Map();
    const scheduler = new win.ReminderScheduler({
        notifiedKey: NOTIFIED_KEY,
        getAlerts: (time) => r.alerts(time),
        onDue: (alert) => firedAt.set(alert.start, now),
        now: () => now
    });
    // 每秒檢查一次，直到第三次開始
    for (; now <= runs[2].start; now += 1000) scheduler.check();

    assert.deepEqual(runs.map((run) => firedAt.get(run.start)), runs.map((run) => run.start - LEAD));
});

test('之後一次的提醒時間比前一次早（前一次在提早範圍內才設定，要等到開始）：nextAlert 是先響的那一次', () => {
    const { win, create, occurrences, ReminderScheduler } = loadModules();
    const LEAD = 30 * MINUTE;
    // 利姆薩·羅敏薩的雨與陰天：只有一期（8 ET 小時）的雨，接著馬上是陰天
    const list = occurrences('limsa-lominsa', { desiredWeathers: ['Rain', 'Clouds'] }, T0, 400);
    const i = list.findIndex((o, k) => k + 1 < list.length && o.start - LEAD > T0
        && o.weather === 'Rain' && o.end - o.start === 1_400_000
        && list[k + 1].weather === 'Clouds' && list[k + 1].start === o.end);
    assert.ok(i >= 0, '測試資料裡要有這樣的雨接陰天');
    const [rain, clouds] = list.slice(i, i + 2);

    const r = create();
    r.setLead(30);
    // 雨開始前 10 分鐘才設定：雨等到開始才提醒，陰天照樣提早 30 分鐘，比雨先響
    let now = rain.start - 10 * MINUTE;
    r.arm(state('limsa-lominsa', ['Rain', 'Clouds']), now);
    assert.ok(clouds.start - LEAD < rain.start, '陰天的提醒時間在雨開始之前');
    assert.equal(r.nextAlert(now, new Set()).start, clouds.start);
    assert.equal(r.nextFireAt(now, new Set()), clouds.start - LEAD);
    // 陰天響過了：下一次是雨，開始時提醒
    const cloudsDone = new Set([ReminderScheduler.idOf(r.nextAlert(now, new Set()))]);
    assert.equal(r.nextAlert(clouds.start - LEAD, cloudsDone).start, rain.start);
    assert.equal(r.nextFireAt(clouds.start - LEAD, cloudsDone), rain.start);

    // 和排程實際響的順序一致
    const said = r.nextFireAt(now, new Set());
    const fired = [];
    const scheduler = new win.ReminderScheduler({
        notifiedKey: NOTIFIED_KEY,
        getAlerts: (time) => r.alerts(time),
        onDue: (alert) => fired.push([alert.start, now]),
        now: () => now
    });
    for (; now <= rain.start; now += 1000) scheduler.check();
    assert.deepEqual(fired, [[clouds.start, said], [rain.start, rain.start]]);
});

test('提早 30 分鐘時接下來兩次都已經響過，再改成提早 1 分鐘：nextAlert 往後找到還沒響的那一次', () => {
    const { win, create, occurrences } = loadModules();
    const LEAD = 30 * MINUTE;
    // 利姆薩·羅敏薩的雨與陰天：第二次在第一次開始後 30 分鐘內開始，提早 30 分鐘時兩次都在第一次開始之前就響了
    const list = occurrences('limsa-lominsa', { desiredWeathers: ['Rain', 'Clouds'] }, T0, 400);
    const i = list.findIndex((o, k) => k + 2 < list.length && o.start - LEAD > T0 && list[k + 1].start - LEAD < o.start);
    assert.ok(i >= 0, '測試資料裡要有這樣的連續兩次');
    const [first, second, third] = list.slice(i, i + 3);

    const r = create();
    r.setLead(30);
    let now = first.start - LEAD - MINUTE;
    r.arm(state('limsa-lominsa', ['Rain', 'Clouds']), now);
    const fired = [];
    const scheduler = new win.ReminderScheduler({
        notifiedKey: NOTIFIED_KEY,
        getAlerts: (time) => r.alerts(time),
        onDue: (alert) => fired.push([alert.start, now]),
        now: () => now
    });
    // 每秒檢查，直到接下來兩次都照提早 30 分鐘響過（第一次還沒開始）
    for (; now <= second.start - LEAD; now += 1000) scheduler.check();
    assert.deepEqual(fired, [[first.start, first.start - LEAD], [second.start, second.start - LEAD]]);

    // 改成提早 1 分鐘：排程看的範圍只到響過的第二次，下一個提醒是第三次
    r.setLead(1);
    assert.equal(r.nextAlert(now, scheduler.notifiedIds())?.start, third.start, '還有下一次要提醒');
    const said = r.nextFireAt(now, scheduler.notifiedIds());
    assert.equal(said, third.start - MINUTE);
    // 排程照樣在第三次開始前 1 分鐘響
    for (; now <= third.start; now += 1000) scheduler.check();
    assert.deepEqual(fired.slice(2), [[third.start, said]]);
});

test('localStorage 丟例外時照樣能設定、只是記不住', () => {
    const { create } = loadModules({ storageThrows: true });
    let r;
    assert.doesNotThrow(() => { r = create(); });
    assert.equal(r.leadMinutes, 5);
    assert.equal(r.active, null);

    assert.doesNotThrow(() => r.arm(state('kozamauka', ['Showers']), 1000));
    assert.notEqual(r.active, null);
    r.setLead(10);
    assert.equal(r.leadMinutes, 10);
    assert.equal(r.alerts(T0).length, 2);
    // 讀不到時重讀不會把這個頁面記得的清掉
    assert.doesNotThrow(() => r.reload());
    assert.equal(r.leadMinutes, 10);
    assert.notEqual(r.active, null);
    assert.doesNotThrow(() => r.cancel());
    assert.equal(r.active, null);
});

test('存的提醒壞掉時：不認得的地區整個丟掉，天氣只留認得的，特殊事件與時數不對就用預設', () => {
    const load = (value) => {
        const modules = loadModules({ stored: { [KEY]: typeof value === 'string' ? value : JSON.stringify(value) } });
        return { ...modules, r: modules.create() };
    };

    // 修得好的：天氣只留認得的（去掉重複），前置天氣不是陣列就是空的，時數與特殊事件不對就用預設
    const fixed = load({
        leadMinutes: 10,
        reminder: {
            target: { zoneId: 'kozamauka', desiredWeathers: ['Showers', 'Moonquake', 42, 'Showers'], previousWeathers: 'Rain', beginHour: '8', endHour: 99, event: 'bogus' },
            armedAt: 1000
        }
    });
    assert.equal(fixed.r.leadMinutes, 10);
    assert.deepEqual(plain(fixed.r.active), { target: TARGET, armedAt: 1000 });
    const alerts = fixed.r.alerts(T0);
    assert.equal(alerts[0].key, 'weather:kozamauka-7--0-24');
    assert.deepEqual(alerts.map((alert) => alert.start), fixed.occurrences('kozamauka', SHOWERS, T0, 2).map((o) => o.start));

    // 只有特殊事件也是一個目標；缺的欄位用預設
    const eventOnly = load({ leadMinutes: 3, reminder: { target: { zoneId: 'eastern-la-noscea', event: 'garlok' }, armedAt: 1000 } });
    assert.deepEqual(plain(eventOnly.r.active.target), {
        zoneId: 'eastern-la-noscea', desiredWeathers: [], previousWeathers: [], beginHour: 0, endHour: 24, event: 'garlok'
    });
    assert.equal(eventOnly.r.alerts(T0)[0].key, 'weather:eastern-la-noscea---0-24-garlok');

    // 修不好的提醒整個丟掉，提早幾分鐘照樣留著
    for (const reminder of [
        { target: { ...TARGET, zoneId: 'atlantis' }, armedAt: 1000 }, // 不認得的地區
        { target: { ...TARGET, desiredWeathers: ['Moonquake'] }, armedAt: 1000 }, // 沒有認得的天氣、也沒有特殊事件：永遠不會響
        { target: { ...TARGET, desiredWeathers: [], event: 'bogus' }, armedAt: 1000 }, // 不認得的特殊事件（不改掉的話每一段都算符合）
        { target: TARGET, armedAt: 'yesterday' },
        { target: TARGET },
        { target: null, armedAt: 1000 },
        'on',
        [TARGET],
        42
    ]) {
        const broken = load({ leadMinutes: 15, reminder });
        assert.equal(broken.r.active, null, JSON.stringify(reminder));
        assert.equal(broken.r.leadMinutes, 15);
        assert.deepEqual(Array.from(broken.r.alerts(T0)), []);
    }

    // 整份壞掉：預設（提早 5 分鐘、沒有提醒）
    for (const raw of ['{not json', '[]', '"text"', 'null', '42', JSON.stringify({ leadMinutes: 7, reminder: null })]) {
        const broken = load(raw);
        assert.equal(broken.r.leadMinutes, 5, raw);
        assert.equal(broken.r.active, null, raw);
    }
});

test('alerts 不丟例外：算不出來時是空的，排程每秒的檢查不會斷', () => {
    const { win, create } = loadModules();
    const r = create();
    r.arm(state('kozamauka', ['Showers']), 1000);
    vm.runInContext('WeatherAnswer.occurrences = () => { throw new Error("boom"); }', win);
    assert.deepEqual(Array.from(r.alerts(T0)), []);
    assert.equal(r.nextFireAt(T0, new Set()), null);
});

test('reload：照另一個分頁存的改，存的被清掉就回到預設', () => {
    const { create, storage } = loadModules();
    const r = create();
    storage.set(KEY, JSON.stringify({ leadMinutes: 15, reminder: { target: TARGET, armedAt: 1000 } }));
    r.reload();
    assert.equal(r.leadMinutes, 15);
    assert.deepEqual(plain(r.active), { target: TARGET, armedAt: 1000 });
    storage.delete(KEY);
    r.reload();
    assert.equal(r.leadMinutes, 5);
    assert.equal(r.active, null);
});

// ---------- 天氣頁：createWeatherPage() ----------

// 元素本身和祖先都沒有 hidden（fake-dom 看不出 CSS，只看屬性）
function shown(page, id) {
    for (let node = page.$(id); node && node.nodeType === 1; node = node.parentNode) {
        if (node.hidden) return false;
    }
    return true;
}
const text = (page, id) => page.$(id).textContent;
const alertsOn = (page) => page.document.body.querySelectorAll('.reminder-alert');
// 對照：WeatherAnswer.occurrences() 在現在這一刻算出的前 limit 次
const answers = (page, zoneId, filters, limit) => page.window.WeatherAnswer.occurrences(page.window.WeatherZoneData.getZone(zoneId), filters, page.now, limit);
// ET 時段，例如 ET 16:00–08:00
function etText(page, start, end) {
    const { from, to } = page.window.WeatherAnswer.etHours(start, end);
    return `ET ${pad(from)}:00–${pad(to)}:00`;
}

// 打開記住科薩馬爾卡＋陣雨的頁面，按「提醒我」；回傳頁面和設定當下的前兩次陣雨
async function armedPage(options = {}) {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS, ...options });
    const [first, second] = answers(page, 'kozamauka', SHOWERS, 2);
    assert.ok(first.start - 5 * MINUTE > page.now, '第一次陣雨在 5 分鐘以後');
    page.$('remindBtn').click();
    await page.settle();
    return { page, first, second };
}

test('index.html：提醒的標記在答案卡裡、提醒中那一行在答案卡上方；腳本順序；唯一的 .btn-primary', () => {
    const html = fs.readFileSync(path.join(__dirname, '../tools/weather-forecast/index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    const at = (src) => {
        assert.ok(scripts.includes(src), `index.html 要載入 ${src}`);
        return scripts.indexOf(src);
    };
    assert.ok(at('../../assets/js/security-utils.js') < at('../../assets/js/reminder-scheduler.js'));
    assert.ok(at('../../assets/js/reminder-scheduler.js') < at('zone-data.js'), '共用的提醒排程在工具自己的腳本之前');
    assert.equal(at('weather-reminder.js'), at('weather-answer.js') + 1);
    assert.ok(at('weather-reminder.js') < at('script.js'));

    // 這一頁唯一的主要按鈕
    assert.equal([...html.matchAll(/\bbtn-primary\b/g)].length, 1);
    assert.deepEqual(classesOf(tagAttrs(html, 'remindBtn')), ['btn', 'btn-primary']);
    for (const id of ['reminderCancelBtn', 'reminderNoticeCancel']) {
        assert.deepEqual(classesOf(tagAttrs(html, id)), ['btn', 'btn-sm', 'btn-ghost'], id);
    }
    assert.equal(tagAttrs(html, 'reminderSet')['aria-live'], 'polite');
    // 設好時 #reminderSet 跟著出現、焦點移到取消提醒，aria-live 不一定唸得出來：取消提醒的說明就是幾點提醒那一句
    assert.equal(tagAttrs(html, 'reminderCancelBtn')['aria-describedby'], 'reminderSetText');

    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    for (const id of ['answerActions', 'remindBtn', 'leadSelect', 'remindHint', 'reminderSet', 'reminderSetText', 'reminderCancelBtn', 'notifyStatus']) {
        assert.ok(page.$('answerCard').contains(page.$(id)), `#${id} 在答案卡裡`);
    }
    assert.equal(page.document.querySelector('label[for="leadSelect"]').textContent, '通知時間');
    // 提醒中那一行在答案卡上方，而且不在 #zoneContent 裡：沒選地區（hash 清掉）時也看得到
    const main = page.$('zoneContent').parentNode;
    assert.equal(main.children[0], page.$('reminderNotice'));
    assert.equal(page.$('zoneContent').contains(page.$('reminderNotice')), false);
});

test('按「提醒我」：問一次權限、設好、寫幾點提醒、焦點到取消', async () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS, notification: 'default' });
    const [first] = answers(page, 'kozamauka', SHOWERS, 1);
    // 設好之前：提醒我、通知時間、頁面要開著才會響
    assert.equal(shown(page, 'answerActions'), true);
    assert.equal(shown(page, 'remindBtn'), true);
    assert.equal(text(page, 'remindBtn'), '🔔提醒我');
    assert.equal(shown(page, 'remindHint'), true);
    assert.equal(text(page, 'remindHint'), '頁面要開著才會響');
    assert.equal(page.$('leadSelect').value, '5');
    assert.deepEqual(page.$('leadSelect').children.map((option) => option.getAttribute('value')), ['1', '3', '5', '10', '15', '30']);
    assert.deepEqual(page.$('leadSelect').children.map((option) => option.textContent), ['1', '3', '5', '10', '15', '30'].map((n) => `開始前 ${n} 分鐘`));
    for (const id of ['reminderSet', 'reminderNotice', 'notifyStatus']) assert.equal(shown(page, id), false, `#${id} 要隱藏`);
    assert.equal(page.permissionRequests, 0, '打開頁面時不問權限');

    page.$('remindBtn').focus();
    page.$('remindBtn').click();
    await page.settle();
    assert.equal(page.permissionRequests, 1);
    assert.ok(page.storage.has(KEY));
    const saved = JSON.parse(page.storage.get(KEY));
    assert.deepEqual(saved, { leadMinutes: 5, reminder: { target: TARGET, armedAt: T0 } });

    assert.equal(text(page, 'reminderSetText'), `${remindAt(first.start - 5 * MINUTE, page.now)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);
    assert.equal(shown(page, 'reminderSet'), true);
    assert.equal(page.$('remindBtn').hidden, true);
    assert.equal(page.$('remindHint').hidden, true, '設好的那一段已經寫了頁面要開著');
    assert.equal(shown(page, 'leadSelect'), true, '提早幾分鐘照樣可以改');
    assert.equal(shown(page, 'reminderNotice'), false, '答案卡顯示的就是提醒的目標');
    assert.equal(shown(page, 'notifyStatus'), false, '允許通知時不用說明');
    assert.equal(page.document.activeElement, page.$('reminderCancelBtn'));
    assert.equal(text(page, 'reminderCancelBtn'), '取消提醒');

    // 取消提醒：焦點回到提醒我
    page.$('reminderCancelBtn').click();
    assert.equal(page.app.reminder.active, null);
    assert.equal(JSON.parse(page.storage.get(KEY)).reminder, null);
    assert.equal(shown(page, 'reminderSet'), false);
    assert.equal(shown(page, 'remindBtn'), true);
    assert.equal(page.document.activeElement, page.$('remindBtn'));

    // 已經允許了：再按不會再問
    page.$('remindBtn').click();
    await page.settle();
    assert.equal(page.permissionRequests, 1);
    assert.equal(shown(page, 'reminderSet'), true);
});

test('權限被拒或不支援：提醒照樣設好，寫出只有頁內提示和聲音', async () => {
    for (const [mode, status] of [
        ['denied', '瀏覽器封鎖了這個網站的通知，到時間只會在頁面上提示和發出聲音。可以從網址列左邊的網站設定打開。'],
        ['unsupported', '這個瀏覽器不能跳通知，到時間只會在頁面上提示和發出聲音。']
    ]) {
        const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS, notification: mode });
        assert.equal(shown(page, 'notifyStatus'), false, `${mode}：還沒設提醒時不寫`);
        const [first] = answers(page, 'kozamauka', SHOWERS, 1);

        page.$('remindBtn').click();
        await page.settle();
        assert.equal(page.permissionRequests, 0, `${mode}：不再問`);
        assert.notEqual(page.app.reminder.active, null, `${mode}：提醒照樣設好`);
        assert.equal(shown(page, 'reminderSet'), true);
        assert.equal(shown(page, 'notifyStatus'), true);
        assert.equal(text(page, 'notifyStatus'), status);

        // 到時間：頁內提示與提示音照樣有，沒有系統通知
        page.tick(first.start - 5 * MINUTE - page.now);
        assert.equal(alertsOn(page).length, 1, mode);
        assert.equal(page.beeps, 2, mode);
        assert.equal(page.notifications.length, 0, mode);

        // 說明寫在提醒我旁邊：別的目標也寫（設新的提醒也一樣），只選了地區、沒有提醒我的答案卡不寫
        page.selectZone('gridania');
        assert.equal(shown(page, 'notifyStatus'), false, `${mode}：只選了地區`);
        page.$('desiredWeatherTags').querySelector('[data-weather="Rain"]').click();
        assert.equal(shown(page, 'remindBtn'), true);
        assert.equal(text(page, 'notifyStatus'), status, `${mode}：別的目標`);

        // 取消之後說明也收起
        page.$('reminderNoticeCancel').click();
        assert.equal(shown(page, 'notifyStatus'), false);
    }

    // 允許了但跳不出來（Android 的 Chrome）：設好時還看不出來，沒有說明；第一次到時間跳不出來之後寫出不能跳通知，
    // 頁內提示與提示音照樣有
    const { page, first } = await armedPage({ notification: 'throws' });
    assert.equal(shown(page, 'notifyStatus'), false, '還沒試過跳通知');
    page.tick(first.start - 5 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.beeps, 2);
    assert.equal(page.notifications.length, 0);
    assert.equal(shown(page, 'notifyStatus'), true, '第一次跳不出來之後');
    assert.equal(text(page, 'notifyStatus'), '這個瀏覽器不能跳通知，到時間只會在頁面上提示和發出聲音。');
});

test('到時間：頁內提示、提示音，允許時加系統通知；下一秒不重複', async () => {
    const { page, first, second } = await armedPage({ notification: 'default' });
    const fireAt = first.start - 5 * MINUTE;
    const body = `${hm(first.start)} 開始，到 ${hm(first.end)}（${etText(page, first.start, first.end)}）`;

    page.tick(fireAt - 1000 - page.now);
    assert.equal(alertsOn(page).length, 0, '還沒到');
    page.tick(1000);
    const alerts = alertsOn(page);
    assert.equal(alerts.length, 1);
    assert.ok(alerts[0].textContent.startsWith('科薩馬爾卡 5 分鐘後陣雨'));
    assert.equal(alerts[0].textContent, `科薩馬爾卡 5 分鐘後陣雨\n${body}`);
    assert.equal(page.beeps, 2);
    assert.equal(page.notifications.length, 1);
    assert.equal(page.notifications[0].title, '科薩馬爾卡 5 分鐘後陣雨');
    assert.equal(page.notifications[0].body, body);
    assert.equal(page.notifications[0].tag, `weather:kozamauka-7--0-24|${first.start}`);
    // 記在 localStorage（這一次自己的項目）：重新整理、另一個分頁都不會再響這一次
    assert.deepEqual(
        Array.from(page.storage).filter(([name]) => name.startsWith(`${NOTIFIED_KEY}|`)),
        [[`${NOTIFIED_KEY}|weather:kozamauka-7--0-24|${first.start}`, String(first.start)]]
    );

    page.tick(1000);
    assert.equal(alertsOn(page).length, 1, '下一秒不重複');
    assert.equal(page.beeps, 2);
    assert.equal(page.notifications.length, 1);
    // 提醒照樣在（一直提醒到取消），下一次換成第二次
    assert.notEqual(page.app.reminder.active, null);
    assert.equal(text(page, 'reminderSetText'), `${remindAt(second.start - 5 * MINUTE, page.now)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);
    page.tick(second.start - 5 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 2, '第二次照常提醒');
});

test('在提早範圍內才設定：開始那一刻才提醒，寫成開始時提醒、標題寫開始了；正在下時設定：從下一次開始', async () => {
    const probe = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    const [first, second] = answers(probe, 'kozamauka', SHOWERS, 2);
    // 對照：來得及提早 5 分鐘時照常寫幾點提醒、開始前幾分鐘
    probe.$('remindBtn').click();
    await probe.settle();
    assert.equal(text(probe, 'reminderSetText'), `${remindAt(first.start - 5 * MINUTE, probe.now)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);

    // 開始前 2 分鐘才設定：使用者正看著頁面，不馬上跳，開始的那一刻提醒；
    // 不能寫「開始前 5 分鐘」，不然會被讀成開始時間是 5 分鐘以後
    const late = createWeatherPage({ now: first.start - 2 * MINUTE, stored: KOZAMAUKA_SHOWERS, notification: 'granted' });
    late.$('remindBtn').click();
    await late.settle();
    assert.equal(text(late, 'reminderSetText'), `${remindAt(first.start, late.now)} 開始時提醒你。頁面要開著才會響。`);
    late.setLang('en');
    assert.equal(text(late, 'reminderSetText'), `I'll remind you when it starts ${remindAt(first.start, late.now, 'en')}. Keep this page open.`);
    late.setLang('ja');
    assert.equal(text(late, 'reminderSetText'), `${remindAt(first.start, late.now, 'ja')}の開始時にお知らせします。このページを開いたままにしてください。`);
    late.setLang('zh');
    late.tick(first.start - 1000 - late.now);
    assert.equal(alertsOn(late).length, 0, '不馬上跳');
    late.tick(1000);
    assert.equal(alertsOn(late).length, 1);
    assert.equal(late.notifications[0].title, '科薩馬爾卡陣雨開始了');
    assert.ok(alertsOn(late)[0].textContent.startsWith('科薩馬爾卡陣雨開始了\n'));

    // 正在下的時候設定：這一次不提醒，從下一次開始
    const during = createWeatherPage({ now: first.start + MINUTE, stored: KOZAMAUKA_SHOWERS, notification: 'granted' });
    assert.equal(during.$('answerCard').classList.contains('is-now'), true);
    during.$('remindBtn').click();
    await during.settle();
    assert.equal(text(during, 'reminderSetText'), `${remindAt(second.start - 5 * MINUTE, during.now)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);
    during.tick(first.end - 1000 - during.now);
    assert.equal(alertsOn(during).length, 0, '正在下的那一次不提醒');
    during.tick(second.start - 5 * MINUTE - during.now);
    assert.equal(alertsOn(during).length, 1);
    assert.equal(during.notifications[0].title, '科薩馬爾卡 5 分鐘後陣雨');
});

test('晚到的提醒（電腦睡著）：標題寫實際還剩幾分鐘（無條件進位、至少 1），已經開始就寫開始了', async () => {
    const { page, first, second } = await armedPage({ notification: 'granted' });
    const [, , third] = answers(page, 'kozamauka', SHOWERS, 3);

    // 睡過提早 5 分鐘的那一刻，開始前 2 分鐘才醒來：補發一次，寫 2 分鐘後
    page.tick(first.start - 2 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.notifications[0].title, '科薩馬爾卡 2 分鐘後陣雨');
    assert.ok(alertsOn(page)[0].textContent.startsWith('科薩馬爾卡 2 分鐘後陣雨\n'));

    // 開始之後（還沒結束）才醒來：寫開始了
    page.tick(second.start + MINUTE - page.now);
    assert.equal(alertsOn(page).length, 2);
    assert.equal(page.notifications[1].title, '科薩馬爾卡陣雨開始了');

    // 不到一分鐘：寫 1 分鐘（英文也一樣）
    page.setLang('en');
    page.tick(third.start - 30_000 - page.now);
    assert.equal(alertsOn(page).length, 3);
    assert.equal(page.notifications[2].title, "Showers in Kozama'uka in 1 min");
});

test('先設好再等權限的回答：問題一直沒回答（玩家回到遊戲）也已經設好；之後才回答就補上說明', async () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS, notification: 'default' });
    const [first] = answers(page, 'kozamauka', SHOWERS, 1);
    let asked = 0;
    page.window.Notification.requestPermission = () => {
        asked += 1;
        return new Promise(() => {});
    };

    page.$('remindBtn').focus();
    page.$('remindBtn').click();
    assert.equal(asked, 1, '在點擊裡問');
    // 沒等回答就設好、存好，畫面與焦點照常
    assert.deepEqual(JSON.parse(page.storage.get(KEY)), { leadMinutes: 5, reminder: { target: TARGET, armedAt: T0 } });
    assert.equal(shown(page, 'reminderSet'), true);
    assert.equal(text(page, 'reminderSetText'), `${remindAt(first.start - 5 * MINUTE, page.now)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);
    assert.equal(page.document.activeElement, page.$('reminderCancelBtn'));
    await page.settle();
    assert.equal(shown(page, 'reminderSet'), true);
    // 到時間：權限還沒有答案，頁內提示與提示音照樣有
    page.tick(first.start - 5 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.beeps, 2);
    assert.equal(page.notifications.length, 0);

    // 回答來得晚（封鎖）：回答之後補上說明，提醒不受影響
    const slow = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS, notification: 'default' });
    let answer;
    slow.window.Notification.requestPermission = () => new Promise((resolve) => { answer = resolve; });
    slow.$('remindBtn').click();
    assert.equal(shown(slow, 'reminderSet'), true);
    assert.equal(shown(slow, 'notifyStatus'), false, '還沒回答');
    slow.window.Notification.permission = 'denied';
    answer('denied');
    await slow.settle();
    assert.equal(shown(slow, 'notifyStatus'), true);
    assert.equal(text(slow, 'notifyStatus'), '瀏覽器封鎖了這個網站的通知，到時間只會在頁面上提示和發出聲音。可以從網址列左邊的網站設定打開。');
    assert.notEqual(slow.app.reminder.active, null);
});

test('換地區、換天氣、打開別的 hash、hash 清掉：提醒都還在，顯示提醒中那一行', async () => {
    const { page, first } = await armedPage();
    const notice = `提醒中：科薩馬爾卡・陣雨，下次 ${remindAt(first.start - 5 * MINUTE, page.now)} 提醒你`;
    assert.equal(shown(page, 'reminderNotice'), false, '答案卡就是提醒的目標');

    page.selectZone('gridania');
    assert.equal(shown(page, 'reminderNotice'), true);
    assert.ok(text(page, 'reminderNoticeText').includes('提醒中：科薩馬爾卡・陣雨'));
    assert.equal(text(page, 'reminderNoticeText'), notice);
    assert.equal(text(page, 'reminderNoticeCancel'), '取消提醒');
    // 只選了地區：答案卡沒有提醒我
    assert.equal(shown(page, 'answerActions'), false);
    assert.equal(shown(page, 'reminderSet'), false);

    // 別的目標：答案卡照常可以按提醒我，上方那一行照樣在
    page.$('desiredWeatherTags').querySelector('[data-weather="Rain"]').click();
    assert.equal(shown(page, 'remindBtn'), true);
    assert.equal(shown(page, 'reminderSet'), false);
    assert.equal(text(page, 'reminderNoticeText'), notice);

    for (const hash of ['#uldah', '#kozamauka-7,6--0-24', '#kozamauka-7--18-6', '#unknown-zone', '']) {
        page.changeHash(hash);
        assert.notEqual(page.app.reminder.active, null, `${hash}：提醒還在`);
        assert.equal(shown(page, 'reminderNotice'), true, `${hash}：提醒中那一行`);
        assert.equal(text(page, 'reminderNoticeText'), notice, hash);
    }
    assert.equal(page.$('zoneContent').hidden, true, '沒選地區的畫面');

    // 回到提醒的目標：那一行收起，答案卡寫幾點提醒
    page.changeHash('#kozamauka-7--0-24');
    assert.equal(shown(page, 'reminderNotice'), false);
    assert.equal(shown(page, 'reminderSet'), true);

    // 在別的目標上取消：提醒清掉、那一行收起
    page.selectZone('gridania');
    page.$('reminderNoticeCancel').focus();
    page.$('reminderNoticeCancel').click();
    assert.equal(page.app.reminder.active, null);
    assert.equal(JSON.parse(page.storage.get(KEY)).reminder, null);
    assert.equal(shown(page, 'reminderNotice'), false);
    assert.equal(page.document.activeElement, page.$('zoneSelect'), '那一行收起：焦點不掉到頁面最上面');
});

test('在別的目標上按「提醒我」：換成新的，提醒中那一行收起', async () => {
    const { page } = await armedPage();
    page.selectZone('gridania');
    page.$('desiredWeatherTags').querySelector('[data-weather="Rain"]').click();
    assert.equal(shown(page, 'reminderNotice'), true);
    // 設定時正在下的那一次跳過；在提早範圍內的話開始那一刻提醒
    const [a, b] = answers(page, 'gridania', { desiredWeathers: ['Rain'] }, 2);
    const next = a.start > page.now ? a : b;
    const fireAt = page.now > next.start - 5 * MINUTE ? next.start : next.start - 5 * MINUTE;

    page.$('remindBtn').click();
    await page.settle();
    assert.equal(page.app.reminder.active.target.zoneId, 'gridania');
    assert.equal(shown(page, 'reminderNotice'), false);
    assert.equal(shown(page, 'reminderSet'), true);
    assert.equal(text(page, 'reminderSetText'), `${remindAt(fireAt, page.now)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);

    // 回到科薩馬爾卡＋陣雨：不再是提醒的目標
    page.changeHash('#kozamauka-7--0-24');
    assert.equal(shown(page, 'remindBtn'), true);
    assert.ok(text(page, 'reminderNoticeText').startsWith('提醒中：格里達尼亞・小雨'));
});

test('改提早分鐘數：幾點提醒跟著變', async () => {
    const { page, first } = await armedPage();
    page.$('leadSelect').value = '10';
    page.$('leadSelect').dispatchEvent(new page.window.Event('change', { bubbles: true }));
    assert.ok(text(page, 'reminderSetText').startsWith(remindAt(first.start - 10 * MINUTE, page.now)));
    assert.ok(text(page, 'reminderSetText').includes('開始前 10 分鐘'));
    assert.equal(JSON.parse(page.storage.get(KEY)).leadMinutes, 10);
    assert.equal(page.$('leadSelect').value, '10');

    // 到時間：提早 10 分鐘
    page.tick(first.start - 10 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.ok(alertsOn(page)[0].textContent.startsWith('科薩馬爾卡 10 分鐘後陣雨'));

    // 重新整理之後照樣是 10 分鐘
    const reloaded = createWeatherPage({ now: page.now, stored: Object.fromEntries(page.storage) });
    assert.equal(reloaded.$('leadSelect').value, '10');
});

test('另一個分頁取消或新增：這個分頁的畫面跟著變，取消的不再提醒', async () => {
    const { page, first } = await armedPage();
    // 不是提醒的 key：不理
    page.storage.set(KEY, JSON.stringify({ leadMinutes: 5, reminder: null }));
    page.storageEvent('ff14tw_weather_selection');
    assert.equal(shown(page, 'reminderSet'), true);

    page.storageEvent(KEY);
    assert.equal(shown(page, 'reminderSet'), false);
    assert.equal(shown(page, 'remindBtn'), true);
    page.tick(first.start - 5 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 0, '取消的不再提醒');

    // 另一個分頁設了格里達尼亞＋小雨：這裡出現提醒中那一行
    const target = { zoneId: 'gridania', desiredWeathers: ['Rain'], previousWeathers: [], beginHour: 0, endHour: 24, event: null };
    page.storage.set(KEY, JSON.stringify({ leadMinutes: 15, reminder: { target, armedAt: page.now } }));
    page.storageEvent(KEY);
    assert.equal(shown(page, 'reminderNotice'), true);
    assert.ok(text(page, 'reminderNoticeText').startsWith('提醒中：格里達尼亞・小雨'));
    assert.equal(page.$('leadSelect').value, '15');

    // 另一個分頁清掉這個網站的資料（storage 事件的 key 是 null）：提醒也跟著清掉
    page.storage.clear();
    page.storageEvent(null);
    assert.equal(page.app.reminder.active, null);
    assert.equal(shown(page, 'reminderNotice'), false);
});

test('另一個分頁先響了：這個分頁馬上改寫成下一次的時間，自己不再響', async () => {
    const { page, first, second } = await armedPage();
    const fireAt = first.start - 5 * MINUTE;
    assert.equal(text(page, 'reminderSetText'), `${remindAt(fireAt, page.now)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);

    // 到了提醒時間，另一個分頁先響、記進共用的紀錄；這個分頁每秒的檢查還沒跑到
    page.now = fireAt;
    const recordKey = `${NOTIFIED_KEY}|weather:kozamauka-7--0-24|${first.start}`;
    page.storage.set(recordKey, String(first.start));
    page.storageEvent(recordKey);
    assert.equal(text(page, 'reminderSetText'), `${remindAt(second.start - 5 * MINUTE, page.now)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);

    page.tick(1000);
    assert.equal(alertsOn(page).length, 0, '同一次只響一次');
});

test('瀏覽器封鎖網站資料：這次打開期間照樣會提醒', async () => {
    const page = createWeatherPage({ hash: '#kozamauka-7', now: T0, storageThrows: true });
    const [first] = answers(page, 'kozamauka', SHOWERS, 1);
    page.$('remindBtn').click();
    await page.settle();
    assert.equal(shown(page, 'reminderSet'), true);
    assert.equal(text(page, 'reminderSetText'), `${remindAt(first.start - 5 * MINUTE, page.now)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);

    page.tick(first.start - 5 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    page.tick(1000);
    assert.equal(alertsOn(page).length, 1, '記不住已提醒，這個頁面照樣只響一次');
});

test('切換語言：提醒的文字與之後的通知都用新語言', async () => {
    const { page, first, second } = await armedPage({ notification: 'default' });
    page.setLang('en');
    assert.equal(text(page, 'reminderSetText'), `I'll remind you ${remindAt(first.start - 5 * MINUTE, page.now, 'en')} (5 min before). Keep this page open.`);
    assert.equal(page.$('leadSelect').children[2].textContent, '5 min before');
    assert.equal(page.$('leadSelect').value, '5', '換語言不改選取');
    assert.equal(text(page, 'reminderCancelBtn'), 'Cancel reminder');

    page.tick(first.start - 5 * MINUTE - page.now);
    const [alert] = alertsOn(page);
    assert.ok(alert.textContent.includes("in Kozama'uka in 5 min"));
    assert.equal(alert.textContent, `Showers in Kozama'uka in 5 min\n${hm(first.start)}–${hm(first.end)} (${etText(page, first.start, first.end)})`);
    assert.equal(page.notifications[0].title, "Showers in Kozama'uka in 5 min");

    // 提醒中那一行也是英文；日文
    page.selectZone('gridania');
    assert.equal(text(page, 'reminderNoticeText'), `Reminder on: Kozama'uka · Showers, next ${remindAt(second.start - 5 * MINUTE, page.now, 'en')}`);
    page.setLang('ja');
    assert.equal(text(page, 'reminderNoticeText'), `通知中：コザマル・カ・にわか雨、次は${remindAt(second.start - 5 * MINUTE, page.now, 'ja')}`);
    assert.equal(text(page, 'reminderNoticeCancel'), '通知を取り消す');
});

test('提醒的時間在明天：寫「明天」（中文、英文、日文）；過了午夜改成只寫幾點', async () => {
    // 從本地 23:00 起找：下一次陣雨還沒開始、來得及提早 5 分鐘，而且提醒的時間過了午夜（照本地日期找，跟頁面用同一個時區）
    const probe = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    let found = null;
    for (let day = 0; day < 30 && !found; day += 1) {
        const now = new Date(2026, 9, 18 + day, 23, 0, 0).getTime();
        const midnight = new Date(2026, 9, 19 + day, 0, 0, 0).getTime();
        const dayAfter = new Date(2026, 9, 20 + day, 0, 0, 0).getTime();
        probe.now = now;
        const next = answers(probe, 'kozamauka', SHOWERS, 2).find((occurrence) => occurrence.start > now);
        const fireAt = next ? next.start - 5 * MINUTE : 0;
        if (fireAt > midnight && fireAt < dayAfter) found = { now, midnight, fireAt };
    }
    assert.ok(found, '找得到提醒時間在明天的日子');
    const { now, midnight, fireAt } = found;

    const page = createWeatherPage({ now, stored: KOZAMAUKA_SHOWERS });
    page.$('remindBtn').click();
    await page.settle();
    assert.equal(text(page, 'reminderSetText'), `明天 ${hm(fireAt)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);
    page.setLang('en');
    assert.equal(text(page, 'reminderSetText'), `I'll remind you tomorrow at ${hm(fireAt)} (5 min before). Keep this page open.`);
    page.setLang('ja');
    assert.equal(text(page, 'reminderSetText'), `明日 ${hm(fireAt)}にお知らせします（5分前）。このページを開いたままにしてください。`);

    // 提醒中那一行也寫明天
    page.selectZone('gridania');
    page.setLang('zh');
    assert.equal(text(page, 'reminderNoticeText'), `提醒中：科薩馬爾卡・陣雨，下次 明天 ${hm(fireAt)} 提醒你`);
    page.setLang('en');
    assert.equal(text(page, 'reminderNoticeText'), `Reminder on: Kozama'uka · Showers, next tomorrow at ${hm(fireAt)}`);

    // 過了午夜、還沒到提醒時間：同一個時間是今天了
    page.setLang('zh');
    page.tick(midnight - page.now);
    assert.equal(alertsOn(page).length, 0, '還沒到');
    assert.equal(text(page, 'reminderNoticeText'), `提醒中：科薩馬爾卡・陣雨，下次 ${hm(fireAt)} 提醒你`);
});

test('提醒的時間在好幾天以後：寫月/日（中文、英文、日文）', async () => {
    // 科薩馬爾卡前一段是陣雨的濃霧：下一次在 3 天以後
    const page = createWeatherPage({ hash: '#kozamauka-3-7-0-24', now: T0 });
    const [first] = answers(page, 'kozamauka', { desiredWeathers: ['Fog'], previousWeathers: ['Showers'] }, 1);
    assert.ok(first.start - page.now > 3 * 24 * 60 * MINUTE, '下一次在 3 天以後');
    const fireAt = first.start - 5 * MINUTE;
    const date = new Date(fireAt);
    const md = `${date.getMonth() + 1}/${date.getDate()}`;

    page.$('remindBtn').click();
    await page.settle();
    assert.equal(text(page, 'reminderSetText'), `${md} ${hm(fireAt)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);
    page.setLang('en');
    assert.equal(text(page, 'reminderSetText'), `I'll remind you on ${md} at ${hm(fireAt)} (5 min before). Keep this page open.`);
    page.setLang('ja');
    assert.equal(text(page, 'reminderSetText'), `${md} ${hm(fireAt)}にお知らせします（5分前）。このページを開いたままにしてください。`);

    // 提醒中那一行
    page.selectZone('gridania');
    page.setLang('zh');
    assert.equal(text(page, 'reminderNoticeText'), `提醒中：科薩馬爾卡・濃霧，下次 ${md} ${hm(fireAt)} 提醒你`);
    page.setLang('en');
    assert.equal(text(page, 'reminderNoticeText'), `Reminder on: Kozama'uka · Fog, next on ${md} at ${hm(fireAt)}`);
});

test('只有特殊事件的目標：通知寫事件名稱', async () => {
    const page = createWeatherPage({ hash: '#eastern-la-noscea---0-24-garlok', now: T0, notification: 'granted' });
    const [first] = answers(page, 'eastern-la-noscea', { event: 'garlok' }, 1);
    assert.ok(first.start - 5 * MINUTE > page.now);
    page.$('remindBtn').click();
    await page.settle();
    page.tick(first.start - 5 * MINUTE - page.now);
    assert.equal(page.notifications[0].title, '東拉諾西亞 5 分鐘後哥布林首領');
    page.selectZone('gridania');
    assert.ok(text(page, 'reminderNoticeText').startsWith('提醒中：東拉諾西亞・哥布林首領'));
});

test('重新整理後從記憶還原的提醒：照樣顯示與提醒，頁面上的點擊或按鍵就解開提示音', () => {
    const stored = {
        ...KOZAMAUKA_SHOWERS,
        [KEY]: JSON.stringify({ leadMinutes: 5, reminder: { target: TARGET, armedAt: T0 - MINUTE } })
    };
    const page = createWeatherPage({ now: T0, stored });
    const [first] = answers(page, 'kozamauka', SHOWERS, 1);
    assert.equal(shown(page, 'reminderSet'), true);
    assert.equal(text(page, 'reminderSetText'), `${remindAt(first.start - 5 * MINUTE, page.now)} 提醒你（開始前 5 分鐘）。頁面要開著才會響。`);

    // 沒按過「提醒我」：瀏覽器只讓使用者操作時建立或 resume 的 AudioContext 出聲，所以頁面上的操作都去解開一次
    const scheduler = page.window.ReminderScheduler;
    const unlock = scheduler.unlockSound;
    let unlocks = 0;
    scheduler.unlockSound = function () {
        unlocks += 1;
        return unlock.call(this);
    };
    for (const type of ['pointerdown', 'pointerup', 'keydown']) {
        const before = unlocks;
        page.$('answerWhen').dispatchEvent(new page.window.Event(type, { bubbles: true }));
        assert.equal(unlocks, before + 1, type);
    }

    page.tick(first.start - 5 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.beeps, 2);
    assert.equal(page.permissionRequests, 0, '沒有點擊就不問權限');
});

test('沒有提醒時，頁面上的點擊或按鍵不解開提示音（不替每個訪客建立 AudioContext）；按「提醒我」才解開', async () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    const scheduler = page.window.ReminderScheduler;
    const unlock = scheduler.unlockSound;
    let unlocks = 0;
    scheduler.unlockSound = function () {
        unlocks += 1;
        return unlock.call(this);
    };
    // 數建了幾個 AudioContext（腳本到要用時才讀 window.AudioContext）
    const BaseAudioContext = page.window.AudioContext;
    let contexts = 0;
    page.window.AudioContext = class extends BaseAudioContext {
        constructor() {
            super();
            contexts += 1;
        }
    };
    const press = () => {
        for (const type of ['pointerdown', 'pointerup', 'keydown']) {
            page.$('answerWhen').dispatchEvent(new page.window.Event(type, { bubbles: true }));
        }
    };

    press();
    assert.equal(unlocks, 0, '沒有提醒：不解開');
    assert.equal(contexts, 0, '沒有建立 AudioContext');

    // 「提醒我」在點擊裡自己解開；設好之後頁面上的操作照樣每次都解開（手機可能又把聲音暫停）
    page.$('remindBtn').click();
    await page.settle();
    assert.equal(unlocks, 1);
    assert.equal(contexts, 1);
    press();
    assert.equal(unlocks, 4);

    // 取消之後又不解開
    page.$('reminderCancelBtn').click();
    press();
    assert.equal(unlocks, 4);
    assert.equal(contexts, 1);
});
