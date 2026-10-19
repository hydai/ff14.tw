const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const items = require('../data/timed-gathering.json').items;

// group() 用 time-calculator.js 的 TimeCalculator.parseSchedule()：兩個檔案依序載入同一個 context
// （頂層的 class 在同一個 context 裡互相看得到），window 指向 context 本身
function loadGatheringMaterials() {
    const context = vm.createContext({});
    context.window = context;
    for (const name of ['time-calculator', 'gathering-materials']) {
        const file = path.resolve(__dirname, `../tools/timed-gathering/${name}.js`);
        vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: `${name}.js` });
    }
    return { GatheringMaterials: context.GatheringMaterials, TimeCalculator: vm.runInContext('TimeCalculator', context) };
}

const { GatheringMaterials: M, TimeCalculator } = loadGatheringMaterials();

// 期望值用測試自己的 ET 換算，不寫死時間戳：1 ET 分鐘 = 175000 / 60 ms，1 ET 天 = 1440 ET 分鐘 = 4,200,000 ms
const T = 1_760_000_000_000;
const ET_MINUTE_MS = 175000 / 60;
const day = Math.floor(T / 4_200_000); // T 所在的 ET 日
const at = (offset, h, m = 0) => Math.round(((day + offset) * 1440 + h * 60 + m) * ET_MINUTE_MS);
const material = (key) => M.group(items).find((m) => m.key === key);
// 合成的素材：time 換成指定的（例如跨午夜的區間）
const synthetic = (time, duration) => M.group([{ ...items[0], id: 'x_1', time, duration }])[0];
// vm 裡建出來的陣列與物件，原型和這邊不同，strict 的 deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));
const starts = (windows) => Array.from(windows, (w) => w.start);

const DISPLAY_FIELDS = ['name', 'nameJp', 'nameEn', 'type', 'level', 'zone', 'zoneJp', 'zoneEn',
    'location', 'locationJp', 'locationEn', 'coordinates', 'duration', 'macroFormat', 'expansion'];

test('65 筆資料合成 34 種素材；key 是 id 去掉結尾的 _數字；兩筆的照開始時間排', () => {
    const all = M.group(items);
    assert.equal(items.length, 65);
    assert.equal(all.length, 34);
    assert.equal(all.filter((m) => m.records.length === 2).length, 31);
    assert.equal(all.filter((m) => m.records.length === 1).length, 3);
    assert.equal(M.keyOf({ id: 'botany_cordia_resin_1' }), 'botany_cordia_resin');
    assert.equal(M.keyOf({ id: 'botany_cordia_log_72_2' }), 'botany_cordia_log_72');
    assert.equal(M.keyOf({ id: 'mining_lightning_quartz' }), 'mining_lightning_quartz');

    // 素材照第一次出現的順序
    assert.deepEqual(Array.from(all, (m) => m.key), [...new Set(items.map((item) => M.keyOf(item)))]);

    for (const m of all) {
        const mine = items.filter((item) => M.keyOf(item) === m.key);
        assert.equal(m.records.length, mine.length, m.key);
        assert.equal(m.schedules.length, m.records.length, m.key);
        // records 是資料裡的那幾筆，schedules 與它一一對應，開始時間由小到大
        m.records.forEach((record, i) => {
            assert.ok(mine.includes(record), `${m.key} 的 records 是資料裡的那一筆`);
            assert.deepEqual(plain(m.schedules[i]), plain(TimeCalculator.parseSchedule(record.time, record.duration)), m.key);
        });
        const startMinutes = Array.from(m.schedules, (s) => s.startMinutes);
        assert.deepEqual(startMinutes, [...startMinutes].sort((a, b) => a - b), m.key);
        // 顯示欄位等於第一筆的
        for (const field of DISPLAY_FIELDS) assert.equal(m[field], mine[0][field], `${m.key}.${field}`);
    }

    assert.equal(material('fishing_purple_tongue').allDay, true);
    assert.equal(all.filter((m) => m.allDay).length, 1);
    assert.equal(material('botany_cordia_resin').allDay, false);
});

test('state：在時段裡是 now（到這一段結束），不在是 next（最近的下一段），全天是 allday', () => {
    const cordia = material('botany_cordia_resin'); // ET 00:00 與 12:00，各 120 ET 分鐘

    const inside = M.state(cordia, at(0, 12, 30));
    assert.equal(inside.kind, 'now');
    assert.equal(inside.start, at(0, 12));
    assert.equal(inside.end, at(0, 14));
    assert.equal(inside.record.time, '12:00');
    assert.equal(inside.schedule.startMinutes, 720);

    // start 含、end 不含：開始的那一刻就在裡面，結束的前一毫秒還在，結束的那一刻已經是下一次
    assert.equal(M.state(cordia, at(0, 12)).kind, 'now');
    assert.equal(M.state(cordia, at(0, 14) - 1).kind, 'now');
    const ended = M.state(cordia, at(0, 14));
    assert.equal(ended.kind, 'next');
    assert.equal(ended.start, at(1, 0));
    assert.equal(ended.end, at(1, 2));
    assert.equal(ended.record.time, '00:00');
    assert.equal(ended.schedule.startMinutes, 0);

    const lateNight = M.state(cordia, at(0, 23, 59));
    assert.equal(lateNight.kind, 'next');
    assert.equal(lateNight.start, at(1, 0));

    // ET 午夜整點那一刻（ts 剛好是 4,200,000 ms 的整數倍）：00:00 這一段已經開始，前一毫秒還沒
    const midnight = M.state(cordia, at(1, 0));
    assert.equal(midnight.kind, 'now');
    assert.equal(midnight.start, at(1, 0));
    assert.equal(midnight.end, at(1, 2));
    const beforeMidnight = M.state(cordia, at(1, 0) - 1);
    assert.equal(beforeMidnight.kind, 'next');
    assert.equal(beforeMidnight.start, at(1, 0));

    // 兩段之間：下一次是同一天的 12:00 那一筆
    const between = M.state(cordia, at(0, 5));
    assert.equal(between.kind, 'next');
    assert.equal(between.start, at(0, 12));
    assert.equal(between.record.time, '12:00');

    // 只有一筆的區間素材
    const quartz = material('mining_lightning_quartz'); // ET 00:00–04:00
    assert.equal(M.state(quartz, at(0, 3, 59)).kind, 'now');
    assert.equal(M.state(quartz, at(0, 3, 59)).end, at(0, 4));
    assert.equal(M.state(quartz, at(0, 4)).kind, 'next');
    assert.equal(M.state(quartz, at(0, 4)).start, at(1, 0));

    // 全天：只有 kind
    assert.deepEqual(plain(M.state(material('fishing_purple_tongue'), at(0, 5))), { kind: 'allday' });
});

test('跨午夜的區間：22:00-02:00 在 01:00 時是正在可採，從前一天的 22:00 起算', () => {
    const night = synthetic('22:00-02:00', 240);
    assert.deepEqual(plain(night.schedules), [{ startMinutes: 1320, durationMinutes: 240, allDay: false }]);

    const early = M.state(night, at(0, 1));
    assert.equal(early.kind, 'now');
    assert.equal(early.start, at(-1, 22));
    assert.equal(early.end, at(0, 2));

    // 同一天的晚上是另一段：從這一天的 22:00 到明天的 02:00
    const evening = M.state(night, at(0, 23));
    assert.equal(evening.kind, 'now');
    assert.equal(evening.start, at(0, 22));
    assert.equal(evening.end, at(1, 2));

    const ended = M.state(night, at(0, 2));
    assert.equal(ended.kind, 'next');
    assert.equal(ended.start, at(0, 22));

    const toMidnight = synthetic('22:00-00:00', 120);
    const lateNight = M.state(toMidnight, at(0, 23, 59));
    assert.equal(lateNight.kind, 'now');
    assert.equal(lateNight.start, at(0, 22));
    assert.equal(lateNight.end, at(1, 0));
    const atMidnight = M.state(toMidnight, at(1, 0));
    assert.equal(atMidnight.kind, 'next');
    assert.equal(atMidnight.start, at(1, 22));
});

test('upcoming：從正在進行的那一段開始，兩個時段照開始時間合在一起；全天是空的', () => {
    const cordia = material('botany_cordia_resin');

    const fromInside = M.upcoming(cordia, at(0, 12, 30), 3);
    assert.deepEqual(starts(fromInside), [at(0, 12), at(1, 0), at(1, 12)]);
    assert.equal(fromInside[0].end, at(0, 14));
    assert.equal(fromInside[0].record.time, '12:00');
    assert.equal(fromInside[0].schedule.startMinutes, 720);
    assert.equal(fromInside[1].record.time, '00:00');
    assert.equal(fromInside[1].schedule.startMinutes, 0);

    // 不在時段裡：第一個就是下一次
    assert.deepEqual(starts(M.upcoming(cordia, at(0, 5), 2)), [at(0, 12), at(1, 0)]);
    assert.equal(M.upcoming(cordia, at(0, 5), 5).length, 5);
    assert.deepEqual(plain(M.upcoming(cordia, at(0, 5), 0)), []);

    // 只有一筆：每天一段
    const iris = material('botany_iris_root'); // ET 16:00–20:00
    const irisList = M.upcoming(iris, at(0, 17), 3);
    assert.deepEqual(starts(irisList), [at(0, 16), at(1, 16), at(2, 16)]);
    assert.equal(irisList[0].end, at(0, 20));

    assert.deepEqual(plain(M.upcoming(material('fishing_purple_tongue'), at(0, 5), 3)), []);
});

test('nextAlarm：正在可採時是再下一段，不在時是下一段；全天是 null', () => {
    const cordia = material('botany_cordia_resin');

    const whileUp = M.nextAlarm(cordia, at(0, 12, 30));
    assert.equal(whileUp.start, at(1, 0));
    assert.equal(whileUp.end, at(1, 2));
    assert.equal(whileUp.record.time, '00:00');
    assert.equal(whileUp.schedule.startMinutes, 0);

    const beforeNoon = M.nextAlarm(cordia, at(0, 11));
    assert.equal(beforeNoon.start, at(0, 12));
    assert.equal(beforeNoon.schedule.startMinutes, 720);

    // 剛好開始的那一刻已經不算「之後」，是再下一段
    assert.equal(M.nextAlarm(cordia, at(0, 12)).start, at(1, 0));
    assert.equal(M.nextAlarm(cordia, at(0, 12) - 1).start, at(0, 12));

    assert.equal(M.nextAlarm(material('fishing_purple_tongue'), at(0, 11)), null);
});

test('compare：現在可採的剩比較久的在前，接著照還要多久，全天最後', () => {
    const states = [
        { id: 'none', kind: 'none' },
        { id: 'allday', kind: 'allday' },
        { id: 'next-late', kind: 'next', start: 5000, end: 6000 },
        { id: 'now-short', kind: 'now', start: 100, end: 1000 },
        { id: 'next-soon', kind: 'next', start: 2000, end: 3000 },
        { id: 'now-long', kind: 'now', start: 200, end: 4000 }
    ];
    const order = (list) => [...list].sort((a, b) => M.compare(a, b)).map((s) => s.id);
    assert.deepEqual(order(states), ['now-long', 'now-short', 'next-soon', 'next-late', 'allday', 'none']);

    assert.ok(M.compare({ kind: 'now', end: 9 }, { kind: 'next', start: 1 }) < 0);
    assert.ok(M.compare({ kind: 'next', start: 9 }, { kind: 'allday' }) < 0);
    assert.ok(M.compare({ kind: 'allday' }, { kind: 'none' }) < 0);
    assert.ok(M.compare({ kind: 'now', end: 5 }, { kind: 'now', end: 3 }) < 0);
    assert.ok(M.compare({ kind: 'next', start: 3 }, { kind: 'next', start: 5 }) < 0);
    // 同一種、同分的回 0：呼叫端用穩定排序，保留原本的順序
    assert.equal(M.compare({ kind: 'now', end: 5 }, { kind: 'now', end: 5 }), 0);
    assert.equal(M.compare({ kind: 'next', start: 5 }, { kind: 'next', start: 5 }), 0);
    assert.equal(M.compare({ kind: 'allday' }, { kind: 'allday' }), 0);
    assert.equal(M.compare({ kind: 'none' }, { kind: 'none' }), 0);
    const tied = [{ id: 'a', kind: 'next', start: 7 }, { id: 'b', kind: 'next', start: 7 }, { id: 'c', kind: 'next', start: 7 }];
    assert.deepEqual(order(tied), ['a', 'b', 'c']);

    // 真正的資料：34 種素材排完，現在可採的在前、全天的在最後，各段內照 end 晚的／start 早的在前
    const now = at(0, 12, 30);
    const real = M.group(items).map((m) => ({ key: m.key, ...M.state(m, now) }));
    const sorted = [...real].sort((a, b) => M.compare(a, b));
    const rank = { now: 0, next: 1, allday: 2, none: 3 };
    for (let i = 1; i < sorted.length; i++) {
        const [a, b] = [sorted[i - 1], sorted[i]];
        assert.ok(rank[a.kind] <= rank[b.kind], `${a.key} 在 ${b.key} 前面`);
        if (a.kind === 'now' && b.kind === 'now') assert.ok(a.end >= b.end);
        if (a.kind === 'next' && b.kind === 'next') assert.ok(a.start <= b.start);
    }
    assert.equal(sorted.at(-1).key, 'fishing_purple_tongue');
    assert.equal(sorted[0].kind, 'now');
});

test('etTime、etRange、slots、realMinutes', () => {
    assert.equal(M.etTime(0), '00:00');
    assert.equal(M.etTime(59), '00:59');
    assert.equal(M.etTime(1439), '23:59');
    assert.equal(M.etTime(1440), '00:00');
    assert.equal(M.etTime(1500), '01:00');
    assert.equal(M.etTime(-60), '23:00');
    assert.equal(M.etTime(756.9), '12:36'); // etMinutes() 帶小數，只取整分鐘

    // 區間中間是 en dash（U+2013）
    assert.equal(M.etRange({ startMinutes: 1320, durationMinutes: 240 }), 'ET 22:00–02:00');
    assert.equal(M.etRange({ startMinutes: 0, durationMinutes: 240 }), 'ET 00:00–04:00');

    const cordia = material('botany_cordia_resin');
    assert.deepEqual(plain(M.slots(cordia)), ['ET 00:00', 'ET 12:00']);
    assert.equal(M.realMinutes(cordia), 6); // 120 ET 分鐘 = 350 秒
    const quartz = material('mining_lightning_quartz');
    assert.deepEqual(plain(M.slots(quartz)), ['ET 00:00–04:00']);
    assert.equal(M.realMinutes(quartz), 12); // 240 ET 分鐘 = 700 秒
    assert.deepEqual(plain(M.slots(material('fishing_purple_tongue'))), []);
    assert.deepEqual(plain(M.slots(synthetic('22:00-02:00', 240))), ['ET 22:00–02:00']);

    // 常數與 ET 分鐘
    assert.equal(M.ET_MINUTE_MS, 175000 / 60);
    assert.equal(M.ET_DAY_MS, 4_200_000);
    assert.equal(M.etMinutes(0), 0);
    assert.ok(Math.abs(M.etMinutes(at(0, 12, 30)) - (day * 1440 + 750)) < 1e-3);
});

test('countdown、minutesCeil、localTime', () => {
    assert.equal(M.countdown(61_001), '1:02');
    assert.equal(M.countdown(59_000), '0:59');
    assert.equal(M.countdown(-5), '0:00');
    assert.equal(M.countdown(0), '0:00');
    assert.equal(M.countdown(1), '0:01');
    assert.equal(M.countdown(3_600_000), '60:00');

    assert.equal(M.minutesCeil(600_001), 11);
    assert.equal(M.minutesCeil(600_000), 10);
    assert.equal(M.minutesCeil(1), 1);
    assert.equal(M.minutesCeil(0), 1);
    assert.equal(M.minutesCeil(-5), 1);

    assert.equal(M.localTime(new Date(2026, 0, 1, 3, 7).getTime()), '03:07');
    assert.equal(M.localTime(new Date(2026, 0, 1, 23, 59).getTime()), '23:59');
    assert.equal(M.localTime(new Date(2026, 5, 15, 0, 0).getTime()), '00:00');
});

test('同一段在不同的現在算出來的 start 都一樣，而且是整數', () => {
    const cordia = material('botany_cordia_resin');
    const first = M.upcoming(cordia, at(0, 12, 1), 3)[0];
    const later = M.upcoming(cordia, at(0, 13, 59), 3)[0];
    assert.equal(first.start, later.start);
    assert.equal(first.end, later.end);
    assert.ok(Number.isInteger(first.start));
    assert.ok(Number.isInteger(first.end));

    // 這一段「現在」落在哪裡，state() 與 upcoming() 的 start／end 都一樣，ReminderScheduler 靠 start 認同一次
    for (let seconds = 0; seconds < 350; seconds += 7) {
        const now = at(0, 12) + seconds * 1000;
        const state = M.state(cordia, now);
        assert.equal(state.kind, 'now');
        assert.equal(state.start, first.start, `${seconds} 秒`);
        assert.equal(state.end, first.end, `${seconds} 秒`);
    }
    // 下一段在它開始以前，不管離多遠，算出來的 start 也都一樣
    const upcomingStart = at(1, 0);
    for (const now of [at(0, 14), at(0, 20), at(0, 23, 59), at(1, 0) - 1]) {
        assert.equal(M.nextAlarm(cordia, now).start, upcomingStart);
        assert.equal(M.state(cordia, now).start, upcomingStart);
    }

    // 開始時間不在 30 個 ET 分鐘的倍數上時，1 ET 分鐘（2916.67 ms）乘出來不是整數毫秒，要靠 Math.round 才每次都一樣、而且是整數。
    // 真實資料都在整點（乘出來剛好是整數，上面的檢查看不出有沒有四捨五入），所以另外用 ET 12:01（小數 .67，Math.floor 會少 1）
    // 和 12:02（小數 .33，Math.ceil 會多 1）
    for (const minute of [1, 2]) {
        const where = `ET 12:0${minute}`;
        const odd = synthetic(`12:0${minute}`, 120);
        const now = at(0, 12, minute + 1);
        const oddFirst = M.upcoming(odd, now, 1)[0];
        assert.equal(oddFirst.start, at(0, 12, minute), where);
        assert.equal(oddFirst.end, at(0, 14, minute), where);
        assert.ok(Number.isInteger(oddFirst.start) && Number.isInteger(oddFirst.end), where);
        assert.equal(M.state(odd, now).start, oddFirst.start, where);
        assert.equal(M.state(odd, at(0, 14)).start, oddFirst.start, where); // 這一段結束前的另一個現在
        assert.equal(M.nextAlarm(odd, now).start, at(1, 12, minute), where);
    }
});

test('windowAt／nextWindow：start 含、end 不含；ET 午夜整點的那一刻也歸在正確的那一天', () => {
    const midnightStart = TimeCalculator.parseSchedule('00:00', 120);
    for (let offset = -3; offset <= 3; offset++) {
        const midnight = at(offset, 0);
        assert.equal(midnight, (day + offset) * 4_200_000, 'ET 午夜剛好是 4,200,000 ms 的整數倍');
        const window = { start: midnight, end: at(offset, 2) };
        assert.deepEqual(plain(M.windowAt(midnightStart, midnight)), window);
        assert.deepEqual(plain(M.windowAt(midnightStart, at(offset, 2) - 1)), window);
        assert.equal(M.windowAt(midnightStart, midnight - 1), null);
        assert.equal(M.windowAt(midnightStart, at(offset, 2)), null);
        assert.deepEqual(plain(M.nextWindow(midnightStart, midnight - 1)), window);
        assert.deepEqual(plain(M.nextWindow(midnightStart, midnight)), { start: at(offset + 1, 0), end: at(offset + 1, 2) });
    }

    // 跨午夜的區間：前一天開始的那一段，到今天 02:00 為止
    const overnight = TimeCalculator.parseSchedule('22:00-02:00');
    assert.deepEqual(plain(M.windowAt(overnight, at(0, 0))), { start: at(-1, 22), end: at(0, 2) });
    assert.deepEqual(plain(M.windowAt(overnight, at(0, 22))), { start: at(0, 22), end: at(1, 2) });
    assert.equal(M.windowAt(overnight, at(0, 2)), null);
    assert.equal(M.windowAt(overnight, at(0, 21, 59)), null);
    assert.deepEqual(plain(M.nextWindow(overnight, at(0, 1))), { start: at(0, 22), end: at(1, 2) });
    assert.deepEqual(plain(M.nextWindow(overnight, at(0, 22))), { start: at(1, 22), end: at(2, 2) });

    // 時段無效（schedules 裡的 null）：沒有任何一段
    assert.equal(M.windowAt(null, T), null);
    assert.equal(M.nextWindow(null, T), null);
});

test('時段無效的資料：排在最後，不影響有效的時段；全部無效時 state 是 none', () => {
    const mixed = M.group([
        { ...items[0], id: 'y_1', time: '99:00', duration: 120 },
        { ...items[0], id: 'y_2', time: '12:00', duration: 120 },
        { ...items[0], id: 'y_3', time: '06:00', duration: 120 }
    ])[0];
    assert.deepEqual(Array.from(mixed.records, (r) => r.id), ['y_3', 'y_2', 'y_1']);
    assert.deepEqual(plain(Array.from(mixed.schedules, (s) => s && s.startMinutes)), [360, 720, null]);
    assert.equal(mixed.allDay, false);
    assert.equal(M.state(mixed, at(0, 7)).kind, 'now');
    assert.equal(M.state(mixed, at(0, 7)).record.id, 'y_3');
    assert.equal(M.state(mixed, at(0, 9)).start, at(0, 12));
    assert.deepEqual(starts(M.upcoming(mixed, at(0, 9), 3)), [at(0, 12), at(1, 6), at(1, 12)]);
    assert.equal(M.nextAlarm(mixed, at(0, 9)).record.id, 'y_2');
    assert.deepEqual(plain(M.slots(mixed)), ['ET 06:00', 'ET 12:00']);

    const none = M.group([{ ...items[0], id: 'z_1', time: 'bad', duration: 120 }])[0];
    assert.deepEqual(plain(none.schedules), [null]);
    assert.equal(none.allDay, false);
    assert.deepEqual(plain(M.state(none, at(0, 7))), { kind: 'none' });
    assert.deepEqual(plain(M.upcoming(none, at(0, 7), 3)), []);
    assert.equal(M.nextAlarm(none, at(0, 7)), null);
    assert.deepEqual(plain(M.slots(none)), []);
});

test('對照逐分鐘掃描：每個 ET 分鐘的 state 與 nextAlarm，跟只看「一天裡第幾分鐘」的算法一致', () => {
    const cases = [
        ...M.group(items),
        synthetic('22:00-02:00', 240),
        synthetic('22:00-00:00', 120),
        synthetic('23:30', 90)
    ];
    // 另一種算法：只用一天裡的分鐘數與模 1440，不經過「某一天的那一段」。回傳的是 ET 分鐘（從 at(0, 0) 起算）
    const reference = (m, minute) => {
        let now = null;
        let next = null;
        for (const s of m.schedules) {
            const elapsed = (((minute - s.startMinutes) % 1440) + 1440) % 1440;
            if (elapsed < s.durationMinutes) {
                const start = minute - elapsed;
                const end = start + s.durationMinutes;
                if (!now || end > now.end) now = { start, end };
            }
            // 嚴格晚於 minute 的下一次開始（剛好現在開始的，下一次是明天）
            const wait = (((s.startMinutes - minute) % 1440) + 1440) % 1440 || 1440;
            if (!next || minute + wait < next.start) next = { start: minute + wait, end: minute + wait + s.durationMinutes };
        }
        return { now, next };
    };
    const ts = (minute) => at(0, 0, minute);

    for (const m of cases) {
        if (m.allDay) {
            assert.equal(M.state(m, at(0, 5)).kind, 'allday');
            continue;
        }
        for (let minute = 0; minute < 2 * 1440; minute++) {
            // 整分鐘那一刻、同一個 ET 分鐘過了 2 秒、前一毫秒（屬於前一個 ET 分鐘）
            for (const [now, atMinute] of [[ts(minute), minute], [ts(minute) + 2000, minute], [ts(minute) - 1, minute - 1]]) {
                const expected = reference(m, atMinute);
                const where = `${m.key} ET 分鐘 ${atMinute}（now = ${now}）`;
                const state = M.state(m, now);
                const wanted = expected.now || expected.next;
                assert.equal(state.kind, expected.now ? 'now' : 'next', where);
                assert.equal(state.start, ts(wanted.start), where);
                assert.equal(state.end, ts(wanted.end), where);
                const alarm = M.nextAlarm(m, now);
                assert.equal(alarm.start, ts(expected.next.start), where);
                assert.equal(alarm.end, ts(expected.next.end), where);
            }
        }
    }
});

test('函式不靠 this：解構出來的也能用', () => {
    const { group, state, upcoming, nextAlarm, windowAt, nextWindow, slots, etRange, compare } = M;
    const cordia = group(items).find((m) => m.key === 'botany_cordia_resin');
    assert.equal(state(cordia, at(0, 12, 30)).kind, 'now');
    assert.equal(upcoming(cordia, at(0, 12, 30), 2).length, 2);
    assert.equal(nextAlarm(cordia, at(0, 12, 30)).start, at(1, 0));
    assert.equal(windowAt(cordia.schedules[0], at(0, 1)).start, at(0, 0));
    assert.equal(nextWindow(cordia.schedules[0], at(0, 1)).start, at(1, 0));
    assert.equal(slots(cordia).length, 2);
    assert.equal(etRange(cordia.schedules[1]), 'ET 12:00–14:00');
    assert.equal(compare({ kind: 'now', end: 2 }, { kind: 'now', end: 1 }) < 0, true);
});
