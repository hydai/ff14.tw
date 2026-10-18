const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const T0 = 1_760_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// weather-search.js 與 weather-answer.js 都從 window 取用 WeatherCalculator，所以讓 window 指向 context 本身
function loadWeather() {
    const context = vm.createContext({});
    context.window = context;
    for (const name of ['zone-data', 'weather-calculator', 'weather-search', 'weather-answer']) {
        const file = path.resolve(__dirname, `../tools/weather-forecast/${name}.js`);
        vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: `${name}.js` });
    }
    return context;
}

const page = loadWeather();
const calc = page.WeatherCalculator;
// 故意用解構取出：別的模組不一定用 WeatherAnswer.xxx() 的寫法呼叫，這些函式不能靠 this
const { occurrences, clip, waitParts, dayOffset, etHours } = page.WeatherAnswer;
const PERIOD = calc.WEATHER_DURATION_MS;
const HOUR = calc.EORZEA_HOUR_MS;

const zoneOf = (id) => page.WeatherZoneData.getZone(id);
// vm 裡建出來的物件原型和這邊不同，deepEqual 前先轉成這邊的一般物件
const plain = (value) => JSON.parse(JSON.stringify(value));
const periodStartOf = (time) => Math.floor(time / PERIOD) * PERIOD;
const weatherAt = (zone, time) => calc.getWeatherForZone(zone, time);

// 測試用的條件寫法：{ desired, previous, begin, end, event }（省略的欄位就是沒設）
const filtersOf = (f) => ({
    desiredWeathers: new Set(f.desired || []),
    previousWeathers: new Set(f.previous || []),
    beginHour: f.begin === undefined ? 0 : f.begin,
    endHour: f.end === undefined ? 24 : f.end,
    event: f.event || null
});
const ask = (zoneId, f, now, limit) => plain(occurrences(zoneOf(zoneId), filtersOf(f), now, limit));

// ---- 對照：不經過 WeatherSearch，自己逐段掃 getWeatherForZone() ----
// 做法和被測的程式刻意不同：從現在這一段的 400 段之前一路往後掃，先把「符合、連續、同天氣」的段落
// 整串切好，再依 ET 小時裁剪、丟掉已經結束的塊。這樣正在進行的那一串也看得到真正的開頭。
function reference(zone, f, now, limit) {
    const desired = new Set(f.desired || []);
    const previous = new Set(f.previous || []);
    const begin = f.begin === undefined ? 0 : f.begin;
    const end = f.end === undefined ? 24 : f.end;
    const inRange = (hour) => begin === end || (begin < end ? hour >= begin && hour < end : hour >= begin || hour < end);
    const matches = (time) => {
        if (desired.size > 0 && !desired.has(weatherAt(zone, time))) return false;
        if (previous.size > 0 && !previous.has(weatherAt(zone, time - PERIOD))) return false;
        const firstHour = (time / HOUR) % 24;
        return Array.from({ length: 8 }, (_, i) => (firstHour + i) % 24).some(inRange);
    };
    const piecesOf = (run) => {
        const pieces = [];
        for (let start = run.periodStart; start < run.periodEnd; start += HOUR) {
            if (!inRange((start / HOUR) % 24)) continue;
            const last = pieces[pieces.length - 1];
            if (last && last.end === start) last.end = start + HOUR;
            else pieces.push({ start, end: start + HOUR });
        }
        return pieces;
    };
    const horizon = now + 60 * DAY_MS;
    const found = [];
    let run = null;
    const finish = () => {
        if (run) {
            for (const piece of piecesOf(run)) {
                if (piece.end > now && found.length < limit) {
                    found.push({ ...piece, weather: run.weather, previousWeather: run.previousWeather, periodStart: run.periodStart, periodEnd: run.periodEnd });
                }
            }
        }
        run = null;
    };
    for (let time = periodStartOf(now) - 400 * PERIOD; ; time += PERIOD) {
        const weather = weatherAt(zone, time);
        const hit = matches(time);
        if (hit && run && run.periodEnd === time && run.weather === weather) {
            run.periodEnd = time + PERIOD;
            continue;
        }
        finish();
        if (found.length >= limit || time >= horizon) break;
        if (hit) run = { periodStart: time, periodEnd: time + PERIOD, weather, previousWeather: weatherAt(zone, time - PERIOD) };
    }
    return found;
}

// 從 from 所在的下一段起找第一串「天氣在 weathers 裡、同天氣連續至少 minPeriods 段」的段落（不套任何條件）
function findRun(zone, weathers, minPeriods, from = T0) {
    for (let time = periodStartOf(from) + PERIOD; time < from + 30 * DAY_MS; time += PERIOD) {
        const weather = weatherAt(zone, time);
        if (!weathers.includes(weather) || weatherAt(zone, time - PERIOD) === weather) continue;
        let periodEnd = time + PERIOD;
        while (weatherAt(zone, periodEnd) === weather) periodEnd += PERIOD;
        if ((periodEnd - time) / PERIOD >= minPeriods) return { periodStart: time, periodEnd, weather };
    }
    throw new Error(`找不到至少 ${minPeriods} 段的 ${weathers.join('/')}`);
}

// from 之後第一個 ET 為 hour 點整的天氣段落開頭（天氣段落都從 ET 0、8、16 開始）
function periodStartAtEtHour(hour, from = T0) {
    for (let i = 0, time = periodStartOf(from); i < 3; i++, time += PERIOD) {
        if (calc.getEorzeaTime(time).hours === hour) return time;
    }
    throw new Error(`天氣段落不會從 ET ${hour} 點開始`);
}

test('連續兩段同樣的天氣合成一串', () => {
    const limsa = zoneOf('limsa-lominsa');
    const run = findRun(limsa, ['Fair Skies'], 2);
    const found = ask('limsa-lominsa', { desired: ['Fair Skies'] }, T0, 60);
    const merged = found.filter((o) => o.periodStart === run.periodStart);
    assert.deepEqual(merged, [{
        start: run.periodStart,
        end: run.periodEnd,
        weather: 'Fair Skies',
        previousWeather: weatherAt(limsa, run.periodStart - PERIOD),
        periodStart: run.periodStart,
        periodEnd: run.periodEnd
    }]);
    // 這一串裡面沒有被拆成一段一段
    assert.deepEqual(found.filter((o) => o.periodStart > run.periodStart && o.periodStart < run.periodEnd), []);
    // 依時間排列、彼此不重疊
    for (let i = 1; i < found.length; i++) assert.ok(found[i].start >= found[i - 1].end);
});

test('選了兩種天氣時，相鄰的不同天氣不合併', () => {
    const limsa = zoneOf('limsa-lominsa');
    const wanted = ['Clear Skies', 'Fair Skies'];
    let boundary = null;
    for (let time = periodStartOf(T0) + PERIOD; !boundary && time < T0 + 30 * DAY_MS; time += PERIOD) {
        const before = weatherAt(limsa, time);
        const after = weatherAt(limsa, time + PERIOD);
        if (wanted.includes(before) && wanted.includes(after) && before !== after) boundary = { time: time + PERIOD, before, after };
    }
    assert.ok(boundary, '要有 A 後面接 B 的地方');
    const found = ask('limsa-lominsa', { desired: wanted }, T0, 80);
    const first = found.find((o) => o.periodEnd === boundary.time);
    const second = found.find((o) => o.periodStart === boundary.time);
    assert.ok(first && second);
    assert.equal(first.weather, boundary.before);
    assert.equal(second.weather, boundary.after);
    assert.equal(first.end, second.start);
    assert.deepEqual(found, reference(limsa, { desired: wanted }, T0, 80));

    // 現在已經在 B 裡面：B 從交界開始算，前面的 A 不會被併進來
    const inSecond = ask('limsa-lominsa', { desired: wanted }, boundary.time + 2 * HOUR, 3);
    assert.equal(inSecond[0].weather, boundary.after);
    assert.equal(inSecond[0].periodStart, boundary.time);
    assert.equal(inSecond[0].start, boundary.time);
    assert.equal(inSecond[0].previousWeather, boundary.before);
});

test('時段裁剪：夜晚 18–6 時，ET 16 開始的那串從 ET 18 起算，ET 0 開始的到 ET 6 為止，ET 8 那串不列', () => {
    const f = { desired: ['Clouds', 'Clear Skies', 'Fair Skies'], begin: 18, end: 6 };
    const found = ask('limsa-lominsa', f, T0, 40);
    assert.equal(found.length, 40);
    const kinds = new Set();
    for (const o of found) {
        const from = etHours(o.periodStart, o.periodEnd).from;
        kinds.add(from);
        assert.notEqual(from, 8);
        assert.notEqual(etHours(o.start, o.end).from, 8);
        if (from === 16) {
            // ET 16 開始的一段（後面可能接著同天氣的 ET 0 那段；ET 8 那段不在時段裡，不會再接上）
            const periods = (o.periodEnd - o.periodStart) / PERIOD;
            assert.ok(periods === 1 || periods === 2);
            assert.equal(o.start, o.periodStart + 2 * HOUR);
            assert.equal(o.end, periods === 1 ? o.periodEnd : o.periodStart + 14 * HOUR);
        } else {
            assert.equal(from, 0);
            assert.equal(o.periodEnd - o.periodStart, PERIOD);
            assert.equal(o.start, o.periodStart);
            assert.equal(o.end, o.periodStart + 6 * HOUR);
        }
    }
    assert.deepEqual([...kinds].sort((a, b) => a - b), [0, 16], '兩種開頭都要出現過');
    assert.deepEqual(found, reference(zoneOf('limsa-lominsa'), f, T0, 40));
});

test('一串裡兩塊不相連的時段各算一次', () => {
    const runStart = periodStartAtEtHour(16);
    const runEnd = runStart + 3 * PERIOD;
    assert.deepEqual(plain(clip(runStart, runEnd, 15, 17)), [
        { start: runStart, end: runStart + HOUR },
        { start: runEnd - HOUR, end: runEnd }
    ]);

    // 在 occurrences 裡也是各算一個，各自佔一個 limit；兩塊的 periodStart／periodEnd 一樣
    const f = { desired: ['Fair Skies'], begin: 6, end: 18 };
    const run = findRun(zoneOf('tempest'), ['Fair Skies'], 5);
    const from = run.periodStart - PERIOD;
    const all = ask('tempest', f, from, 200);
    const pieces = all.filter((o) => o.periodStart === run.periodStart);
    assert.ok(pieces.length >= 2, '五段以上的一串，跨過的每個 ET 日各有一塊 06–18');
    for (const o of pieces) assert.equal(o.periodEnd, run.periodEnd);
    for (let i = 1; i < pieces.length; i++) assert.ok(pieces[i].start > pieces[i - 1].end, '兩塊之間要有空檔');
    // 前面沒有別的符合段落，所以這一串的各塊就是最前面的幾個
    assert.deepEqual(all.slice(0, pieces.length), pieces);
    assert.deepEqual(ask('tempest', f, from, 1), pieces.slice(0, 1));
    assert.deepEqual(ask('tempest', f, from, 2), pieces.slice(0, 2));
});

test('前置天氣：每個結果的 previousWeather 都在條件裡', () => {
    const limsa = zoneOf('limsa-lominsa');
    const f = { desired: ['Clear Skies', 'Fair Skies'], previous: ['Fog', 'Rain'] };
    const found = ask('limsa-lominsa', f, T0, 12);
    assert.equal(found.length, 12);
    for (const o of found) {
        assert.ok(f.previous.includes(o.previousWeather));
        assert.ok(f.desired.includes(o.weather));
        assert.equal(o.previousWeather, weatherAt(limsa, o.periodStart - PERIOD));
        // 併進來的每一段都得自己符合前置天氣，所以後面接著的同天氣不會併進來
        assert.equal(o.periodEnd - o.periodStart, PERIOD);
    }
    assert.deepEqual(found, reference(limsa, f, T0, 12));
});

test('只有特殊事件、沒選天氣時，事件就是目標', () => {
    const garlok = ask('eastern-la-noscea', { event: 'garlok' }, T0, 12);
    assert.equal(garlok.length, 12);
    for (const o of garlok) {
        assert.ok(['Clear Skies', 'Fair Skies', 'Clouds'].includes(o.weather));
        assert.equal(o.previousWeather, 'Fog');
    }
    // 和直接寫成天氣＋前置天氣的條件算出來的一樣
    assert.deepEqual(garlok, reference(zoneOf('eastern-la-noscea'), { desired: ['Clear Skies', 'Fair Skies', 'Clouds'], previous: ['Fog'] }, T0, 12));

    const rainy = ask('central-shroud', { event: 'laideronnette' }, T0, 12);
    assert.equal(rainy.length, 12);
    for (const o of rainy) assert.ok(['Rain', 'Thunder'].includes(o.weather));
    assert.deepEqual(rainy, reference(zoneOf('central-shroud'), { desired: ['Rain', 'Thunder'] }, T0, 12));
});

test('沒有目標回傳空陣列；60 天內不會出現的也回傳空陣列', () => {
    assert.deepEqual(plain(occurrences(zoneOf('limsa-lominsa'), filtersOf({}), T0, 5)), []);
    // 只設了前置天氣或時段、沒有目標天氣也沒有事件：還是沒有目標
    assert.deepEqual(ask('limsa-lominsa', { previous: ['Fog'] }, T0, 5), []);
    assert.deepEqual(ask('limsa-lominsa', { begin: 18, end: 6 }, T0, 5), []);
    // 沒有地區或沒有條件
    assert.deepEqual(plain(occurrences(null, filtersOf({ desired: ['Rain'] }), T0, 5)), []);
    assert.deepEqual(plain(occurrences(zoneOf('limsa-lominsa'), null, T0, 5)), []);
    // 利姆薩·羅敏薩的天氣表裡沒有 Snow
    assert.deepEqual(ask('limsa-lominsa', { desired: ['Snow'] }, T0, 5), []);
    // 有這個天氣，但要求的前置天氣在這個地區不會出現
    assert.deepEqual(ask('limsa-lominsa', { desired: ['Rain'], previous: ['Snow'] }, T0, 5), []);
});

test('第一個可以是正在進行的', () => {
    const limsa = zoneOf('limsa-lominsa');
    const run = findRun(limsa, ['Clear Skies'], 1);
    const now = run.periodStart + 3 * HOUR + 12_345;
    const found = ask('limsa-lominsa', { desired: ['Clear Skies'] }, now, 3);
    assert.equal(found.length, 3);
    assert.ok(found[0].start <= now && now < found[0].end);
    assert.equal(found[0].start, run.periodStart);
    for (let i = 1; i < found.length; i++) assert.ok(found[i].start > now);

    // 剛好在開始的那一刻已經開始；剛好在結束的那一刻已經結束，差 1 毫秒還在
    assert.equal(ask('limsa-lominsa', { desired: ['Clear Skies'] }, run.periodStart, 2)[0].start, run.periodStart);
    assert.equal(ask('limsa-lominsa', { desired: ['Clear Skies'] }, run.periodEnd - 1, 2)[0].periodStart, run.periodStart);
    assert.ok(ask('limsa-lominsa', { desired: ['Clear Skies'] }, run.periodEnd, 2)[0].start >= run.periodEnd);

    // 已經結束的那一塊不列：時段 ET 0–2，現在 ET 1 還在塊裡；現在 ET 5，這一段的那塊已經過了，第一個是之後的
    const start = periodStartAtEtHour(0, run.periodStart);
    const early = { desired: [weatherAt(limsa, start)], begin: 0, end: 2 };
    const duringPiece = ask('limsa-lominsa', early, start + HOUR, 3);
    assert.ok(duringPiece[0].start <= start + HOUR && start + HOUR < duringPiece[0].end);
    const afterPiece = ask('limsa-lominsa', early, start + 5 * HOUR, 3);
    assert.equal(afterPiece.length, 3);
    assert.ok(afterPiece[0].start > start + 5 * HOUR);
    assert.deepEqual(afterPiece, reference(limsa, early, start + 5 * HOUR, 3));
    // 塊剛好結束的那一刻（ET 2 點整）已經結束，差 1 毫秒還在塊裡
    assert.ok(ask('limsa-lominsa', early, start + 2 * HOUR, 1)[0].start > start + 2 * HOUR);
    assert.equal(ask('limsa-lominsa', early, start + 2 * HOUR - 1, 1)[0].start, start);
});

test('正在進行的一串，現在落在哪裡，它的 start 和 end 都不變（同一次不會被當成新的一次）', () => {
    const limsa = zoneOf('limsa-lominsa');
    for (const f of [
        { desired: ['Fair Skies'] },
        { desired: ['Fair Skies'], begin: 18, end: 6 },
        { desired: ['Fair Skies', 'Clear Skies'], begin: 6, end: 18 }
    ]) {
        // 有時段時，ET 8 那段不符的話一串最多兩段（ET 16＋ET 0），所以用「至少兩段」
        const target = reference(limsa, f, T0, 200).find((o) => o.periodEnd - o.periodStart >= 2 * PERIOD);
        assert.ok(target, JSON.stringify(f));
        const mine = (list) => list.filter((o) => o.periodStart === target.periodStart);
        const expected = mine(reference(limsa, f, target.periodStart - 2 * PERIOD, 200));
        assert.ok(expected.length >= 1);
        for (let at = target.periodStart; at < target.periodEnd; at += PERIOD / 2) {
            for (const now of [at, at + 1, at + PERIOD / 2 - 1]) {
                assert.deepEqual(mine(ask('limsa-lominsa', f, now, 200)), expected.filter((o) => o.end > now),
                    `${JSON.stringify(f)}，現在是這一串開始後 ${now - target.periodStart} 毫秒`);
            }
        }
    }
});

test('最後一個不會被搜尋上限截短', () => {
    const tempest = zoneOf('tempest');
    const f = { desired: ['Fair Skies'] };
    // 找一個現在，讓第 3 個是五段以上的長串：要多看十幾段才看得到它的結尾
    let now = null;
    for (let k = 0; k < 600 && now === null; k++) {
        const candidate = T0 + k * PERIOD + 1234;
        const third = reference(tempest, f, candidate, 3)[2];
        if (third && (third.periodEnd - third.periodStart) / PERIOD >= 5) now = candidate;
    }
    assert.ok(now !== null);
    const expected = reference(tempest, f, now, 3);
    const found = ask('tempest', f, now, 3);
    assert.equal(found.length, 3);
    assert.equal(found[2].end, expected[2].end);
    assert.equal(found[2].periodEnd, expected[2].periodEnd);
    assert.deepEqual(found, expected);

    // limit 小的結果，就是 limit 大的結果的開頭：不會因為 limit 不同，最後一個長得不一樣
    const more = ask('tempest', f, now, 10);
    for (const n of [1, 2, 3, 4, 7]) assert.deepEqual(ask('tempest', f, now, n), more.slice(0, n));
});

test('waitParts、dayOffset、etHours', () => {
    assert.deepEqual({ ...waitParts(30_000) }, { days: 0, hours: 0, minutes: 1 });
    assert.deepEqual({ ...waitParts(3 * 3_600_000 + 26 * 60_000 + 10_000) }, { days: 0, hours: 3, minutes: 27 });
    assert.deepEqual({ ...waitParts(59 * 60_000 + 1) }, { days: 0, hours: 1, minutes: 0 });
    assert.deepEqual({ ...waitParts(25 * 3_600_000) }, { days: 1, hours: 1, minutes: 0 });
    // 邊界：0 和負數至少寫 1 分；整 59、60 分；整 24 小時；超過一天不寫分鐘（往上進位）
    assert.deepEqual({ ...waitParts(0) }, { days: 0, hours: 0, minutes: 1 });
    assert.deepEqual({ ...waitParts(-5_000) }, { days: 0, hours: 0, minutes: 1 });
    assert.deepEqual({ ...waitParts(59 * 60_000) }, { days: 0, hours: 0, minutes: 59 });
    assert.deepEqual({ ...waitParts(60 * 60_000) }, { days: 0, hours: 1, minutes: 0 });
    assert.deepEqual({ ...waitParts(61 * 60_000) }, { days: 0, hours: 1, minutes: 1 });
    assert.deepEqual({ ...waitParts(23 * 3_600_000 + 59 * 60_000) }, { days: 0, hours: 23, minutes: 59 });
    assert.deepEqual({ ...waitParts(24 * 3_600_000) }, { days: 1, hours: 0, minutes: 0 });
    assert.deepEqual({ ...waitParts(24 * 3_600_000 + 1) }, { days: 1, hours: 0, minutes: 0 });
    assert.deepEqual({ ...waitParts(2 * DAY_MS + 3 * 3_600_000 + 10 * 60_000) }, { days: 2, hours: 3, minutes: 0 });

    // dayOffset：用 new Date(y, m, d, h, min) 建本地時間，同一天 0、隔天 1
    const at = (y, m, d, h = 0, min = 0) => new Date(y, m, d, h, min).getTime();
    assert.equal(dayOffset(at(2026, 0, 15, 23, 59), at(2026, 0, 15, 0, 1)), 0);
    assert.equal(dayOffset(at(2026, 0, 15, 6), at(2026, 0, 15, 22)), 0);
    assert.equal(dayOffset(at(2026, 0, 16, 0, 1), at(2026, 0, 15, 23, 59)), 1);
    assert.equal(dayOffset(at(2026, 0, 17, 12), at(2026, 0, 15, 12)), 2);
    assert.equal(dayOffset(at(2026, 0, 1, 1), at(2025, 11, 31, 23)), 1);
    assert.equal(dayOffset(at(2026, 2, 1), at(2026, 1, 28)), 1);
    assert.equal(dayOffset(at(2026, 0, 14, 12), at(2026, 0, 15, 12)), -1);

    // etHours：ET 8 開始一段 → 8–16；ET 16 一段 → 16–24；ET 16 開始兩段 → 16–08
    const et = (hour) => periodStartAtEtHour(hour);
    assert.deepEqual({ ...etHours(et(8), et(8) + PERIOD) }, { from: 8, to: 16 });
    assert.deepEqual({ ...etHours(et(16), et(16) + PERIOD) }, { from: 16, to: 24 });
    assert.deepEqual({ ...etHours(et(16), et(16) + 2 * PERIOD) }, { from: 16, to: 8 });
    assert.deepEqual({ ...etHours(et(0), et(0) + PERIOD) }, { from: 0, to: 8 });
    // 裁剪後的起訖也是整個 ET 小時：ET 18 到隔天 ET 6
    assert.deepEqual({ ...etHours(et(16) + 2 * HOUR, et(16) + 14 * HOUR) }, { from: 18, to: 6 });
    // 剛好一整天寫 24；超過一天仍然落在 1–24
    assert.deepEqual({ ...etHours(et(0), et(0) + 3 * PERIOD) }, { from: 0, to: 24 });
    assert.deepEqual({ ...etHours(et(16), et(16) + 3 * PERIOD) }, { from: 16, to: 16 });
    assert.deepEqual({ ...etHours(et(16), et(16) + 5 * PERIOD) }, { from: 16, to: 8 });
    assert.deepEqual({ ...etHours(et(8), et(8) + 6 * PERIOD) }, { from: 8, to: 8 });
    // 長度不是整數個 ET 小時時四捨五入（2.4 小時算 2，2.5 小時算 3）
    assert.deepEqual({ ...etHours(et(16), et(16) + 2 * HOUR + 70_000) }, { from: 16, to: 18 });
    assert.deepEqual({ ...etHours(et(16), et(16) + 2 * HOUR + 87_500) }, { from: 16, to: 19 });
});

test('clip：沒有時段、整天、跨午夜與不在整點的起訖', () => {
    const start = periodStartAtEtHour(16);
    const end = start + 2 * PERIOD;
    const whole = [{ start, end }];
    assert.deepEqual(plain(clip(start, end, 0, 24)), whole);
    assert.deepEqual(plain(clip(start, end, 6, 6)), whole, '起訖同一個小時＝整天（和 isInTimeRange 一樣）');
    // 夜晚 18–6：ET 16 起的兩段是連在一起的一塊，從 ET 18 到隔天 ET 6
    assert.deepEqual(plain(clip(start, end, 18, 6)), [{ start: start + 2 * HOUR, end: start + 14 * HOUR }]);
    // 結束是 0 點＝這一天的 16–24
    assert.deepEqual(plain(clip(start, start + PERIOD, 16, 0)), [{ start, end: start + PERIOD }]);
    // 時段完全不在這一串裡
    assert.deepEqual(plain(clip(start, start + PERIOD, 2, 5)), []);
    // 空的或反過來的區間
    assert.deepEqual(plain(clip(start, start, 18, 6)), []);
    assert.deepEqual(plain(clip(end, start, 0, 24)), []);
    // 起訖不在整點時，照 ET 小時的邊界裁，但不會超出原本的起訖
    assert.deepEqual(plain(clip(start + 100, start + 3 * HOUR + 50, 17, 18)), [{ start: start + HOUR, end: start + 2 * HOUR }]);
    assert.deepEqual(plain(clip(start + 100, start + 3 * HOUR + 50, 16, 17)), [{ start: start + 100, end: start + HOUR }]);
    assert.deepEqual(plain(clip(start + 100, start + 3 * HOUR + 50, 19, 20)), [{ start: start + 3 * HOUR, end: start + 3 * HOUR + 50 }]);
});

test('dayOffset：夏令時間換日的那一天（23 或 25 小時）也只算一天', () => {
    const original = process.env.TZ;
    try {
        for (const timezone of ['America/New_York', 'Europe/London', 'Australia/Sydney', 'Asia/Taipei']) {
            process.env.TZ = timezone;
            // 這幾天在其中某個時區是 23 或 25 小時的一天
            for (const [y, m, d] of [[2026, 2, 8], [2026, 10, 1], [2026, 2, 29], [2026, 9, 25], [2026, 9, 4], [2026, 3, 5]]) {
                const label = `${timezone} ${y}-${m + 1}-${d}`;
                const at = (day, h, min) => new Date(y, m, day, h, min).getTime();
                assert.equal(dayOffset(at(d + 1, 0, 30), at(d, 23, 30)), 1, label);
                assert.equal(dayOffset(at(d + 1, 0, 10), at(d, 0, 10)), 1, label);
                assert.equal(dayOffset(at(d, 23, 59), at(d, 0, 10)), 0, label);
                assert.equal(dayOffset(at(d + 2, 0, 10), at(d, 23, 50)), 2, label);
                assert.equal(dayOffset(at(d - 1, 23, 50), at(d, 0, 10)), -1, label);
            }
        }
    } finally {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
    }
});

// ---- 和逐段掃出來的對照比對：各種地區、天氣、時段、現在 ----
// reference 欄位：條件裡有 event 時，對照用的是事件展開後的天氣＋前置天氣
const CASES = [
    { name: '利姆薩·羅敏薩 碧空', zone: 'limsa-lominsa', f: { desired: ['Fair Skies'] } },
    { name: '利姆薩·羅敏薩 晴朗／碧空 夜晚 18–6', zone: 'limsa-lominsa', f: { desired: ['Clear Skies', 'Fair Skies'], begin: 18, end: 6 } },
    { name: '科薩馬爾卡 陣雨（少見）', zone: 'kozamauka', f: { desired: ['Showers'] } },
    { name: '格里達尼亞 小雨，前面是濃霧或陰天', zone: 'gridania', f: { desired: ['Rain'], previous: ['Fog', 'Clouds'] } },
    { name: '黑風海 碧空 06–18（長串、一串兩塊）', zone: 'tempest', f: { desired: ['Fair Skies'], begin: 6, end: 18 } },
    { name: '東拉諾西亞 晴朗／碧空 22–2（跨午夜）', zone: 'eastern-la-noscea', f: { desired: ['Clear Skies', 'Fair Skies'], begin: 22, end: 2 } },
    { name: '烏爾達哈 陰天 起訖同一小時（整天）', zone: 'uldah', f: { desired: ['Clouds'], begin: 5, end: 5 } },
    { name: '中薩納蘭 沙塵暴 16–0', zone: 'central-thanalan', f: { desired: ['Dust Storms'], begin: 16, end: 0 } },
    { name: '黑風海 晴朗／陰天 0–8', zone: 'tempest', f: { desired: ['Clear Skies', 'Clouds'], begin: 0, end: 8 } },
    { name: '特殊事件 garlok', zone: 'eastern-la-noscea', f: { event: 'garlok' }, reference: { desired: ['Clear Skies', 'Fair Skies', 'Clouds'], previous: ['Fog'] } },
    { name: '特殊事件 laideronnette＋時段 4–12', zone: 'central-shroud', f: { event: 'laideronnette', begin: 4, end: 12 }, reference: { desired: ['Rain', 'Thunder'], begin: 4, end: 12 } }
];
const NOWS = [
    T0, T0 + 1, T0 + PERIOD - 1, T0 + 3 * PERIOD + 777_777, T0 + 8 * PERIOD + 3 * HOUR + 17,
    T0 + 100 * PERIOD + 400_000, T0 + 1000 * PERIOD, T0 + 40 * DAY_MS + 12_345
];

for (const c of CASES) {
    test(`和逐段掃出來的對照一致：${c.name}`, () => {
        let nonEmpty = 0;
        for (const now of NOWS) {
            for (const limit of [1, 4, 15]) {
                const actual = ask(c.zone, c.f, now, limit);
                assert.deepEqual(actual, reference(zoneOf(c.zone), c.reference || c.f, now, limit), `now = ${now}, limit = ${limit}`);
                if (actual.length > 0) nonEmpty++;
            }
        }
        assert.ok(nonEmpty > 0, '這組條件一個結果都沒有，對照失去意義');
    });
}

test('60 天的範圍：在範圍內開始的整串都列（含結尾跨出去的），之後才開始的不列', () => {
    const limsa = zoneOf('limsa-lominsa');
    const run = findRun(limsa, ['Fair Skies'], 2);
    const f = { desired: ['Fair Skies'] };
    // 這串的開頭剛好落在範圍最後一毫秒之內：整串都列，結尾超過 60 天也照列
    const insideNow = run.periodStart - 60 * DAY_MS + 1;
    const inside = ask('limsa-lominsa', f, insideNow, 100_000);
    const last = inside[inside.length - 1];
    assert.equal(last.periodStart, run.periodStart);
    assert.equal(last.end, run.periodEnd);
    assert.ok(last.periodStart < insideNow + 60 * DAY_MS && last.end > insideNow + 60 * DAY_MS);
    assert.deepEqual(inside, reference(limsa, f, insideNow, 100_000));
    // 開頭剛好是範圍的終點（不含）：不列
    const outsideNow = run.periodStart - 60 * DAY_MS;
    const outside = ask('limsa-lominsa', f, outsideNow, 100_000);
    assert.ok(outside[outside.length - 1].periodStart < run.periodStart);
    assert.deepEqual(outside, reference(limsa, f, outsideNow, 100_000));
});

test('Set 和陣列都可以，也不會改到傳進來的條件', () => {
    const f = { desired: ['Clear Skies', 'Fair Skies'], previous: ['Fog', 'Rain'], begin: 18, end: 6 };
    const asSets = filtersOf(f);
    const asArrays = { ...asSets, desiredWeathers: [...asSets.desiredWeathers], previousWeathers: [...asSets.previousWeathers] };
    const limsa = zoneOf('limsa-lominsa');
    const withSets = plain(occurrences(limsa, asSets, T0, 6));
    assert.equal(withSets.length, 6);
    assert.deepEqual(plain(occurrences(limsa, asArrays, T0, 6)), withSets);
    // store.state 還帶著 zoneId 之類的欄位，不影響
    assert.deepEqual(plain(occurrences(limsa, { ...asArrays, zoneId: 'limsa-lominsa' }, T0, 6)), withSets);
    // 欄位缺漏就當作沒設
    assert.deepEqual(plain(occurrences(limsa, { desiredWeathers: ['Fair Skies'] }, T0, 3)), ask('limsa-lominsa', { desired: ['Fair Skies'] }, T0, 3));
    assert.deepEqual([...asSets.desiredWeathers], f.desired);
    assert.deepEqual([...asSets.previousWeathers], f.previous);
    assert.deepEqual(asArrays.desiredWeathers, f.desired);
});

test('回傳的每一個只有約定好的六個欄位；limit 是上限', () => {
    const found = ask('limsa-lominsa', { desired: ['Clouds'] }, T0, 5);
    assert.equal(found.length, 5);
    for (const o of found) {
        assert.deepEqual(Object.keys(o).sort(), ['end', 'periodEnd', 'periodStart', 'previousWeather', 'start', 'weather']);
        assert.ok(o.start < o.end);
        assert.equal(o.start, o.periodStart, '沒有時段時，start／end 就是整串');
        assert.equal(o.end, o.periodEnd);
    }
    assert.deepEqual(ask('limsa-lominsa', { desired: ['Clouds'] }, T0, 0), []);
    assert.deepEqual(ask('limsa-lominsa', { desired: ['Clouds'] }, T0, -1), []);
    assert.equal(ask('limsa-lominsa', { desired: ['Clouds'] }, T0, 1).length, 1);
});

test('只掃到夠用為止，不是每次都掃完 60 天（提醒每秒都會算一次）', () => {
    const original = calc.getWeatherForZone;
    let calls = 0;
    calc.getWeatherForZone = function (...args) {
        calls++;
        return original.apply(this, args);
    };
    try {
        for (const [zoneId, f] of [
            ['limsa-lominsa', { desired: ['Fair Skies'] }],
            ['limsa-lominsa', { desired: ['Fair Skies'], begin: 18, end: 6 }],
            ['kozamauka', { desired: ['Showers'] }],
            ['eastern-la-noscea', { event: 'garlok' }]
        ]) {
            calls = 0;
            assert.equal(occurrences(zoneOf(zoneId), filtersOf(f), T0, 2).length, 2);
            // 整整 60 天有 3000 多段；兩個答案通常只要看幾十段
            assert.ok(calls < 300, `${zoneId} ${JSON.stringify(f)} 看了 ${calls} 段`);
        }
    } finally {
        calc.getWeatherForZone = original;
    }
});

test('地區的天氣表只有一種天氣時也會停下來（一串最長算 60 天）', { timeout: 20_000 }, () => {
    const monotone = { id: 'test-zone', weatherTable: ['Fair Skies'] };
    const found = plain(occurrences(monotone, filtersOf({ desired: ['Fair Skies'] }), T0, 3));
    assert.ok(found.length >= 1 && found.length <= 3);
    for (const o of found) assert.ok(o.periodEnd - o.periodStart <= 60 * DAY_MS);
    assert.ok(found[0].start <= T0 && T0 < found[0].end);
});
