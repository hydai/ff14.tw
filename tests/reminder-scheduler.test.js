const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createFakeDom } = require('./helpers/fake-dom.js');

const ROOT = path.join(__dirname, '..');
const KEY = 'ff14tw_test_notified';

// 一段 1,400,000 ms（8 ET 小時）的時段，提早 300,000 ms 提醒；armedAt 0 表示很早以前就設定了
const A = { key: 'k', start: 10_000_000, end: 11_400_000, leadMs: 300_000, armedAt: 0 };

// ---------- 替身與小工具 ----------
// ReminderScheduler（assets/js/reminder-scheduler.js）在 fake-dom 的 vm 裡載入真正的腳本。
// vm 是另一個 realm：腳本回傳的陣列與 Set 原型和測試端不同，assert.deepEqual 會失敗，所以先用 Array.from() 轉成測試端的陣列。

// localStorage 替身：用 Map 存，記下讀寫各被呼叫幾次。
// afterRead：下一次讀取（getItem、key()、length）拿到（舊的）值之後先執行這個函式，模擬另一個分頁剛好在這個時候寫入
function mapStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        data,
        reads: 0,
        writes: 0,
        afterRead: null,
        read(value) {
            this.reads += 1;
            const hook = this.afterRead;
            this.afterRead = null;
            if (hook) hook();
            return value;
        },
        getItem(key) {
            return this.read(data.has(key) ? data.get(key) : null);
        },
        key(index) {
            return this.read(Array.from(data.keys())[index] ?? null);
        },
        get length() {
            return this.read(data.size);
        },
        setItem(key, value) {
            this.writes += 1;
            data.set(key, String(value));
        },
        removeItem(key) {
            this.writes += 1;
            data.delete(key);
        }
    };
}

// 會丟例外的版本（無痕模式、封鎖網站資料、空間滿了）；reads、writes 記下各被碰到幾次，
// 測試用來確認程式真的碰到了這些例外並吞掉，而不是根本沒去讀寫
function brokenStorage({ read = true, write = true } = {}) {
    const reading = (storage, value) => {
        storage.reads += 1;
        if (read) throw new Error('SecurityError');
        return value;
    };
    const writing = (storage) => {
        storage.writes += 1;
        if (write) throw new Error('QuotaExceededError');
    };
    return {
        reads: 0,
        writes: 0,
        getItem() { return reading(this, null); },
        key() { return reading(this, null); },
        get length() { return reading(this, 0); },
        setItem() { writing(this); },
        removeItem() { writing(this); }
    };
}

// 兩個分頁各自的 localStorage：瀏覽器裡每個分頁有自己的一份快取，一個分頁寫入之後，別的分頁要過一下才看得到。
// view() 是一個分頁看到的 localStorage，寫入先進自己的快取；sync() 才照順序把寫入送進共用的資料，再把每個分頁的快取換成最新的
function syncedStorage() {
    const shared = new Map();
    const views = [];
    return {
        view() {
            const cache = new Map(shared);
            const pending = [];
            views.push({ cache, pending });
            return {
                getItem: (key) => (cache.has(key) ? cache.get(key) : null),
                setItem: (key, value) => {
                    cache.set(key, String(value));
                    pending.push([key, String(value)]);
                },
                removeItem: (key) => {
                    cache.delete(key);
                    pending.push([key, null]);
                },
                key: (index) => Array.from(cache.keys())[index] ?? null,
                get length() { return cache.size; }
            };
        },
        sync() {
            for (const { pending } of views) {
                for (const [key, value] of pending.splice(0)) {
                    if (value === null) shared.delete(key);
                    else shared.set(key, value);
                }
            }
            for (const { cache } of views) {
                cache.clear();
                for (const [key, value] of shared) cache.set(key, value);
            }
        }
    };
}

// Notification 替身：記下每次建構的 { title, body, tag }（和完整的 options）與 requestPermission 被呼叫幾次；
// permission 和真的一樣，使用者回答之後才改變
function fakeNotification({ permission = 'granted', answer = 'granted', constructorThrows = false, requestRejects = false } = {}) {
    const log = { created: [], requests: 0 };
    class FakeNotification {
        static permission = permission;

        static requestPermission() {
            log.requests += 1;
            if (requestRejects) return Promise.reject(new Error('NotAllowedError'));
            FakeNotification.permission = answer;
            return Promise.resolve(answer);
        }

        constructor(title, options = {}) {
            if (constructorThrows) throw new TypeError('Illegal constructor');
            this.closed = false;
            log.created.push({ title, body: options.body, tag: options.tag, options, instance: this });
        }

        close() { this.closed = true; }
    }
    return { Notification: FakeNotification, log };
}

// AudioContext 替身：數 oscillator.start() 幾次（deliver 的兩聲），記下頻率與開始時間。
// 和瀏覽器的自動播放限制一樣，建出來是 suspended，resume() 之後才是 running。
// blocked：重新整理後還沒有人操作過頁面，resume() 不會讓它開始跑（Promise 一直等著）；把 policy.blocked 改成 false 之後才有效
function fakeAudio({ constructorThrows = false, blocked = false } = {}) {
    const log = { contexts: 0, resumes: 0, starts: [], frequencies: [] };
    const policy = { blocked };
    class FakeAudioContext {
        constructor() {
            if (constructorThrows) throw new Error('NotSupportedError');
            log.contexts += 1;
            this.state = 'suspended';
            this.currentTime = 5;
            this.destination = {};
        }

        resume() {
            log.resumes += 1;
            if (policy.blocked) return new Promise(() => {});
            this.state = 'running';
            return Promise.resolve();
        }

        createOscillator() {
            return {
                type: '',
                frequency: { setValueAtTime: (value) => { log.frequencies.push(value); } },
                connect() {},
                start: (time) => { log.starts.push(time); },
                stop() {}
            };
        }

        createGain() {
            return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} };
        }
    }
    return { AudioContext: FakeAudioContext, log, policy };
}

// navigator.locks 替身：同一個名字同時只給一個持有者，記下每次要鎖的名字與選項。
// 和瀏覽器一樣，callback 在之後才執行，它回傳的 Promise 結束才放開；ifAvailable 拿不到時 callback 收到 null。
// rejects：要鎖一律被拒絕（瀏覽器不讓網站使用儲存空間時的 SecurityError，例如封鎖網站資料），callback 不會執行
function fakeLocks({ rejects = false } = {}) {
    const held = new Set();
    const requests = [];
    return {
        held,
        requests,
        request(name, options, callback) {
            requests.push({ name, options: { ...options } });
            if (rejects) return Promise.reject(new Error('SecurityError'));
            const granted = !held.has(name);
            if (granted) held.add(name);
            return Promise.resolve()
                .then(() => callback(granted ? { name, mode: 'exclusive' } : null))
                .finally(() => {
                    if (granted) held.delete(name);
                });
        }
    };
}

// 等排進去的 Promise 都跑完（setImmediate 沒有被 t.mock.timers 換掉）
const settle = () => new Promise((resolve) => setImmediate(resolve));

const timersEnabled = new WeakSet();

// 載入真正的 reminder-scheduler.js，並把腳本要用的瀏覽器 API 放到 window 上（fake-dom 只有 setTimeout／clearTimeout）：
//   localStorage         預設 Map 替身；傳 null 就是完全沒有
//   setInterval／clearInterval  收集回呼到 intervals，由測試自己觸發
//   requestAnimationFrame       預設立刻執行；frames: 'manual' 時排進佇列，測試呼叫 flushFrames() 才「畫出來」
//   Notification、AudioContext、webkitAudioContext  沒傳就是這個瀏覽器沒有
//   locks                navigator.locks（fakeLocks()）；沒傳就是沒有跨分頁的鎖，提醒當場觸發
// 頁內提示 8 秒後收起、搶到提醒後握住鎖 5 秒的 setTimeout 由 t.mock.timers 控制（每個測試都先啟用，不會真的等）
function setup(t, { storage = mapStorage(), Notification, AudioContext, webkitAudioContext, locks, frames = 'immediate' } = {}) {
    if (!timersEnabled.has(t)) { // 一個測試可以建好幾個頁面，mock.timers 只能啟用一次
        timersEnabled.add(t);
        t.mock.timers.enable({ apis: ['setTimeout'] });
    }
    const dom = createFakeDom();
    const win = dom.window;
    dom.document.visibilityState = 'visible';

    const intervals = [];
    win.setInterval = (callback, delay) => {
        intervals.push({ callback, delay, cleared: false });
        return intervals.length;
    };
    win.clearInterval = (id) => { intervals[id - 1].cleared = true; };

    const queued = [];
    win.requestAnimationFrame = (callback) => {
        if (frames === 'immediate') callback(0);
        else queued.push(callback);
        return queued.length;
    };

    let focusCalls = 0;
    win.focus = () => { focusCalls += 1; };

    for (const [name, value] of Object.entries({ localStorage: storage, Notification, AudioContext, webkitAudioContext })) {
        if (value) win[name] = value;
    }
    if (locks) win.navigator = { locks };
    dom.load('assets/js/reminder-scheduler.js');

    return {
        dom,
        storage,
        intervals,
        ReminderScheduler: win.ReminderScheduler,
        get focusCalls() { return focusCalls; },
        flushFrames() { while (queued.length) queued.shift()(0); },
        toasts: () => dom.document.body.querySelectorAll('.reminder-alert')
    };
}

// 一個「分頁」：同一個頁面上可以建好幾個，共用 window.localStorage，但各有自己的記憶
function tab(page, { getAlerts = () => [A], onDue = () => {}, now = () => A.start, notifiedKey = KEY } = {}) {
    return new page.ReminderScheduler({ notifiedKey, getAlerts, onDue, now });
}

// 紀錄：名字是 KEY| 開頭的每一個項目，換成 { [id]: start }
const record = (storage) => Object.fromEntries(Array.from(storage.data)
    .filter(([name]) => name.startsWith(`${KEY}|`))
    .map(([name, value]) => [name.slice(KEY.length + 1), Number(value)]));

// ---------- due()、idOf()、fireAt()：純函式 ----------

test('idOf 與 fireAt：id 是 key|start；在提早範圍內才設定的，從開始那一刻起算', (t) => {
    const { ReminderScheduler } = setup(t);
    assert.equal(ReminderScheduler.idOf(A), 'k|10000000');
    assert.equal(ReminderScheduler.fireAt(A), 9_700_000);
    assert.equal(ReminderScheduler.fireAt({ ...A, leadMs: 0 }), A.start);
    // 設定的時間不晚於「開始 - 提早」就照提早的時間；晚一毫秒，就改成等到開始才提醒
    assert.equal(ReminderScheduler.fireAt({ ...A, armedAt: A.start - 300_000 }), 9_700_000);
    assert.equal(ReminderScheduler.fireAt({ ...A, armedAt: A.start - 299_999 }), A.start);
});

test('提早 lead 開始提醒，一直到那一段結束', (t) => {
    const { ReminderScheduler } = setup(t);
    const due = (alerts, now) => ReminderScheduler.due(alerts, now, new Set());
    assert.equal(due([A], A.start - 300_001).length, 0);
    assert.equal(due([A], A.start - 300_000).length, 1);
    assert.equal(due([A], A.end - 1).length, 1);
    assert.equal(due([A], A.end).length, 0);
});

test('在提早範圍內才設定的，等到開始才提醒；開始以後才設定的那一次跳過', (t) => {
    const { ReminderScheduler } = setup(t);
    const due = (alerts, now) => ReminderScheduler.due(alerts, now, new Set());
    const late = { ...A, armedAt: A.start - 60_000 };
    assert.equal(due([late], A.start - 1).length, 0);
    assert.equal(due([late], A.start).length, 1);
    assert.equal(due([{ ...A, armedAt: A.start + 1 }], A.start + 2).length, 0);
    // 剛好在開始那一刻設定也算「已經開始」
    assert.equal(due([{ ...A, armedAt: A.start }], A.start + 1).length, 0);
});

test('已提醒過的不再提醒；lead 是 0 時開始那一刻提醒', (t) => {
    const { ReminderScheduler } = setup(t);
    assert.equal(ReminderScheduler.due([A], A.start, new Set([ReminderScheduler.idOf(A)])).length, 0);
    assert.equal(ReminderScheduler.due([{ ...A, leadMs: 0 }], A.start - 1, new Set()).length, 0);
    assert.equal(ReminderScheduler.due([{ ...A, leadMs: 0 }], A.start, new Set()).length, 1);
});

test('due 只挑出到期的、保持原本的順序和物件，也不改輸入', (t) => {
    const { ReminderScheduler } = setup(t);
    const B = { ...A, start: 20_000_000, end: 21_400_000 };
    const C = { ...A, key: 'other' };
    const notified = new Set([ReminderScheduler.idOf(C)]);
    const alerts = [B, A, C];
    const result = ReminderScheduler.due(alerts, A.start, notified);
    assert.equal(result.length, 1);
    assert.equal(result[0], A);
    assert.equal(alerts.length, 3);
    assert.equal(notified.size, 1);
});

// ---------- check()：紀錄與只提醒一次 ----------

test('check：先記進紀錄，再呼叫 onDue；每一次各存一個項目，名字是 notifiedKey|id，值是 start', (t) => {
    const page = setup(t);
    const snapshots = [];
    const asked = [];
    const scheduler = tab(page, {
        getAlerts: (now) => {
            asked.push(now);
            return [A];
        },
        onDue: () => snapshots.push(record(page.storage))
    });
    const fired = scheduler.check();
    assert.deepEqual(asked, [A.start], 'getAlerts 拿到的是現在的時間');
    assert.equal(fired.length, 1);
    assert.equal(fired[0], A);
    assert.deepEqual(Array.from(page.storage.data), [[`${KEY}|k|10000000`, String(A.start)]]);
    // onDue 被呼叫的當下，紀錄已經寫好了
    assert.deepEqual(snapshots, [{ 'k|10000000': A.start }]);
    // 同一次不會再提醒
    assert.equal(scheduler.check().length, 0);
    assert.equal(snapshots.length, 1);
    // storage 事件的 key：認得出這個排程的紀錄
    assert.equal(scheduler.isRecordKey(`${KEY}|k|10000000`), true);
    for (const name of [KEY, `${KEY}x|k|1`, 'other|k|1', null]) assert.equal(scheduler.isRecordKey(name), false, String(name));
});

test('兩個分頁共用紀錄：同一次只有一個分頁觸發', (t) => {
    const page = setup(t);
    let onDueCalls = 0;
    const options = { onDue: () => { onDueCalls += 1; } };
    const tabA = tab(page, options);
    const tabB = tab(page, options);
    assert.equal(tabA.check().length, 1);
    assert.equal(tabB.check().length, 0);
    assert.equal(onDueCalls, 1);
});

test('另一個分頁在這個分頁讀完紀錄之後、寫回之前搶先提醒了：這個分頁不再提醒', (t) => {
    const page = setup(t);
    let onDueCalls = 0;
    const options = { onDue: () => { onDueCalls += 1; } };
    const tabA = tab(page, options);
    const tabB = tab(page, options);
    // tabB 讀到的是還沒有紀錄的舊值，之後 tabA 才記下並提醒
    page.storage.afterRead = () => tabA.check();
    assert.equal(tabB.check().length, 0);
    assert.equal(onDueCalls, 1);
});

// ---------- 跨分頁的鎖（navigator.locks） ----------

test('有跨分頁的鎖時：先用 notifiedKey|id 要鎖（ifAvailable），拿到才記下並提醒，不在 check 的回傳值裡', async (t) => {
    const locks = fakeLocks();
    const page = setup(t, { locks });
    const fired = [];
    const scheduler = tab(page, { onDue: (alert) => fired.push(alert) });

    assert.equal(scheduler.check().length, 0);
    assert.equal(scheduler.check().length, 0, '還沒拿到鎖時的下一次檢查');
    assert.equal(fired.length, 0, '拿到鎖之前不提醒');
    assert.deepEqual(record(page.storage), {}, '也還沒記下');
    await settle();

    assert.equal(fired.length, 1);
    assert.equal(fired[0], A);
    assert.deepEqual(record(page.storage), { 'k|10000000': A.start });
    assert.deepEqual(locks.requests.map((request) => request.name), [`${KEY}|k|10000000`], '同一次只要一次鎖');
    assert.equal(locks.requests[0].options.ifAvailable, true);
    // 提醒過了：不再要鎖
    scheduler.check();
    await settle();
    assert.equal(locks.requests.length, 1);
    assert.equal(fired.length, 1);
});

test('兩個分頁在 _claim 裡都讀到「還沒提醒」、都還沒寫回：有跨分頁的鎖時只有一個分頁提醒', async (t) => {
    const page = setup(t, { locks: fakeLocks() });
    let onDueCalls = 0;
    const options = { onDue: () => { onDueCalls += 1; } };
    const tabA = tab(page, options);
    const tabB = tab(page, options);
    // tabB 第二次讀紀錄（拿到鎖之後的重讀）一讀完，tabA 就整個檢查一次：兩個分頁讀到的都是還沒有紀錄的舊值
    let interleaved = false;
    page.storage.afterRead = () => {
        page.storage.afterRead = () => {
            interleaved = true;
            tabA.check();
        };
    };
    tabB.check();
    await settle();
    assert.ok(interleaved, 'tabA 真的在 tabB 讀完、寫回之前檢查了');
    assert.equal(onDueCalls, 1);
});

test('搶到提醒的分頁再握住鎖 5 秒：這段時間別的分頁拿不到、不提醒；放開後別的分頁看到紀錄，不再要鎖', async (t) => {
    const locks = fakeLocks();
    const page = setup(t, { locks });
    assert.equal(page.ReminderScheduler.CONSTANTS.CLAIM_HOLD_MS, 5000);
    const name = `${KEY}|k|10000000`;
    let onDueCalls = 0;
    const options = { onDue: () => { onDueCalls += 1; } };

    tab(page, options).check();
    await settle();
    assert.equal(onDueCalls, 1);
    assert.ok(locks.held.has(name), '提醒之後還握著');

    // 另一個分頁的紀錄還沒同步過來（讀到的是空的）：它照樣去要鎖，但拿不到。這一次的紀錄和鎖同名
    const saved = page.storage.data.get(name);
    page.storage.data.delete(name);
    const tabB = tab(page, options);
    tabB.check();
    await settle();
    assert.equal(locks.requests.length, 2);
    assert.equal(onDueCalls, 1, '拿不到鎖就不提醒');

    page.storage.data.set(name, saved); // 紀錄同步過來了
    t.mock.timers.tick(4999);
    await settle();
    assert.ok(locks.held.has(name), '還不到 5 秒');
    t.mock.timers.tick(1);
    await settle();
    assert.equal(locks.held.has(name), false, '5 秒後放開');

    tabB.check();
    await settle();
    assert.equal(locks.requests.length, 2, '紀錄已經在了：due() 直接跳過，不再要鎖');
    assert.equal(onDueCalls, 1);
});

test('兩個分頁同時各搶到不同的一次，紀錄還沒同步過去就各自寫入：兩次都記得住，鎖放開後誰都不再提醒', async (t) => {
    const storage = syncedStorage();
    const locks = fakeLocks(); // 同一個瀏覽器的鎖，兩個分頁共用
    const B = { ...A, key: 'second', start: A.start + 1000, end: A.end + 1000 }; // 晚一秒到期
    // 分頁 A 檢查時只有 A 到期；分頁 B 晚一秒檢查，兩個都到期
    const clock = { A: 9_700_500, B: 9_701_500 };
    const delivered = [];
    const tabOf = (name) => tab(setup(t, { storage: storage.view(), locks }), {
        getAlerts: () => [A, B],
        onDue: (alert) => delivered.push(`${name}:${alert.key}`),
        now: () => clock[name]
    });
    const tabA = tabOf('A');
    const tabB = tabOf('B');

    tabA.check(); // 要 A 的鎖
    tabB.check(); // 分頁 A 的紀錄還沒過來：也要 A 的鎖（分頁 A 握著，拿不到），和 B 的鎖
    await settle();
    assert.deepEqual(delivered, ['A:k', 'B:second'], '各自搶到不同的一次');

    storage.sync(); // 兩個分頁的寫入都送出去了
    t.mock.timers.tick(5000); // 兩把鎖都放開
    await settle();
    clock.A += 6000;
    clock.B += 6000;
    tabA.check();
    tabB.check();
    await settle();
    assert.deepEqual(delivered, ['A:k', 'B:second'], '鎖放開之後誰都不再提醒');
});

test('等鎖的時候改了提早分鐘數：拿到鎖時照現在的提醒重新挑，舊的不提醒也不記，之後照新的提早分鐘數提醒', async (t) => {
    const page = setup(t, { locks: fakeLocks() });
    let leadMs = 300_000;
    let clock = A.start - 300_000; // 提早 5 分鐘的那一刻
    const fired = [];
    const scheduler = tab(page, { getAlerts: () => [{ ...A, leadMs }], onDue: (alert) => fired.push(alert), now: () => clock });

    scheduler.check();
    leadMs = 60_000; // 鎖還沒拿到就改成提早 1 分鐘
    await settle();
    assert.equal(fired.length, 0, '提早 5 分鐘的那一次不提醒');
    assert.deepEqual(record(page.storage), {}, '也不記下，不然改成 1 分鐘後就不響了');

    clock = A.start - 60_000;
    scheduler.check();
    await settle();
    assert.equal(fired.length, 1);
    assert.equal(fired[0].leadMs, 60_000, '交給 onDue 的是現在的提醒');
});

for (const [name, change] of [
    ['換了目標', (state) => { state.alerts = [{ ...A, key: 'other' }]; }],
    ['那一段已經結束（等的時候電腦睡著了）', (state) => { state.clock = A.end; }],
    ['取消了提醒', (state) => { state.alerts = []; }]
]) {
    for (const rejects of [false, true]) {
        test(`等鎖的時候${name}：${rejects ? '要鎖被拒絕' : '拿到鎖'}時照現在的提醒重新挑，舊的那一次不提醒也不記`, async (t) => {
            const page = setup(t, { locks: fakeLocks({ rejects }) });
            const state = { alerts: [A], clock: A.start };
            const fired = [];
            const scheduler = tab(page, { getAlerts: () => state.alerts, onDue: (alert) => fired.push(alert.key), now: () => state.clock });

            scheduler.check();
            change(state);
            await settle();
            assert.deepEqual(fired, []);
            assert.deepEqual(record(page.storage), {});
        });
    }
}

test('要鎖被拒絕（瀏覽器不讓網站使用儲存空間）時照舊只靠紀錄：只提醒一次，之後當場觸發、不再要鎖', async (t) => {
    const locks = fakeLocks({ rejects: true });
    const page = setup(t, { locks });
    const alerts = [A];
    let onDueCalls = 0;
    const scheduler = tab(page, { getAlerts: () => alerts, onDue: () => { onDueCalls += 1; } });

    assert.equal(scheduler.check().length, 0);
    await settle();
    assert.equal(onDueCalls, 1, '被拒絕之後照舊記下並提醒');
    assert.deepEqual(record(page.storage), { 'k|10000000': A.start });
    assert.equal(scheduler.check().length, 0, '同一次不再提醒');

    alerts.push({ ...A, key: 'second' });
    assert.equal(scheduler.check().length, 1, '之後的提醒當場觸發');
    assert.equal(onDueCalls, 2);
    assert.equal(locks.requests.length, 1, '不再要鎖');
});

test('封鎖網站資料：要鎖被拒絕、localStorage 也丟例外時，這個頁面照樣只提醒一次', async (t) => {
    const storage = brokenStorage();
    const page = setup(t, { storage, locks: fakeLocks({ rejects: true }) });
    let onDueCalls = 0;
    const scheduler = tab(page, { onDue: () => { onDueCalls += 1; } });

    scheduler.check();
    scheduler.check(); // 還沒被拒絕之前的下一次檢查
    await settle();
    scheduler.check();
    await settle();
    assert.equal(onDueCalls, 1);
    assert.ok(storage.reads > 0, '讀取例外要真的碰到過');
});

for (const [name, create] of [
    ['紀錄寫得進去', () => mapStorage()],
    ['紀錄讀寫都丟例外，只靠這個頁面自己的記憶', () => brokenStorage()]
]) {
    test(`getAlerts 把同一次出現回傳兩次，同一次 check 也只提醒一次：${name}`, (t) => {
        const page = setup(t, { storage: create() });
        let onDueCalls = 0;
        const scheduler = tab(page, { getAlerts: () => [A, { ...A }], onDue: () => { onDueCalls += 1; } });
        assert.equal(scheduler.check().length, 1);
        assert.equal(onDueCalls, 1);
    });
}

test('背景分頁晚到：時段還沒結束就補一次；整段都睡過去就不發，下一次照常', (t) => {
    const page = setup(t);
    const { ReminderScheduler } = page;
    const slept = { ...A, start: 20_000_000, end: 21_400_000 };
    const next = { ...A, start: 30_000_000, end: 31_400_000 };
    let clock = 0;
    const fired = [];
    const scheduler = tab(page, {
        getAlerts: () => [A, slept, next],
        onDue: (alert) => fired.push(alert.start),
        now: () => clock
    });

    clock = ReminderScheduler.fireAt(A) + 59_000; // 計時器被壓慢，59 秒後才跳：A 還沒結束，補一次
    assert.equal(scheduler.check().length, 1);

    clock = slept.end + 1; // 整段都睡過去：不補發，也不記進紀錄
    assert.equal(scheduler.check().length, 0);
    assert.equal(Object.keys(record(page.storage)).length, 1);

    clock = ReminderScheduler.fireAt(next); // 下一次出現照常提醒
    assert.equal(scheduler.check().length, 1);
    assert.deepEqual(fired, [A.start, next.start]);
});

for (const [name, create, writes] of [
    ['讀寫都丟例外', () => brokenStorage(), 0],
    ['只有寫入丟例外（空間滿了）', () => brokenStorage({ read: false }), 1],
    ['只有讀取丟例外', () => brokenStorage({ write: false }), 0],
    ['根本沒有 localStorage', () => null, undefined]
]) {
    test(`localStorage 丟例外時照樣只提醒一次、不丟出去：${name}`, (t) => {
        const storage = create();
        const page = setup(t, { storage });
        let onDueCalls = 0;
        const scheduler = tab(page, { onDue: () => { onDueCalls += 1; } });
        assert.equal(scheduler.check().length, 1);
        assert.equal(scheduler.check().length, 0);
        assert.equal(onDueCalls, 1);
        assert.deepEqual(Array.from(scheduler.notifiedIds()), ['k|10000000']);
        if (storage) {
            assert.ok(storage.reads > 0, '讀取例外要真的碰到過，測試的前提才成立');
            // 讀不到紀錄時不寫回，免得蓋掉別的分頁寫的；只有寫入失敗時，每個觸發的提醒試寫一次
            assert.equal(storage.writes, writes);
        }
    });
}

test('window.localStorage 本身丟例外（瀏覽器封鎖網站資料）時照樣只提醒一次', (t) => {
    const page = setup(t, { storage: null });
    let reads = 0;
    Object.defineProperty(page.dom.window, 'localStorage', {
        get() {
            reads += 1;
            throw new Error('SecurityError');
        }
    });
    let onDueCalls = 0;
    const scheduler = tab(page, { onDue: () => { onDueCalls += 1; } });
    assert.equal(scheduler.check().length, 1);
    assert.equal(scheduler.check().length, 0);
    assert.equal(onDueCalls, 1);
    assert.ok(reads > 0);
});

test('紀錄的值壞掉時，當作還沒提醒過，寫入時換成正常的', (t) => {
    for (const bad of ['', 'abc', '{"k":1}', '1e7', '-5', ' 10000000']) {
        const page = setup(t, { storage: mapStorage({ [`${KEY}|k|10000000`]: bad }) });
        let onDueCalls = 0;
        const scheduler = tab(page, { onDue: () => { onDueCalls += 1; } });
        assert.equal(scheduler.check().length, 1, bad);
        assert.deepEqual(record(page.storage), { 'k|10000000': A.start }, bad);
        assert.equal(scheduler.check().length, 0, bad);
        assert.equal(onDueCalls, 1, bad);
    }
});

test('記下時刪掉一天以前的與值壞掉的紀錄，別的資料不碰', (t) => {
    const NOW = 1_700_000_000_000;
    const alert = { ...A, start: NOW, end: NOW + 1_400_000 };
    const page = setup(t, {
        storage: mapStorage({
            [`${KEY}|old|1`]: String(NOW - 86_400_001), // 超過一天：刪掉
            [`${KEY}|edge|2`]: String(NOW - 86_400_000), // 剛好一天：還留著
            [`${KEY}|recent|3`]: String(NOW - 1000),
            [`${KEY}|broken|4`]: 'x', // 值壞掉：刪掉
            [KEY]: '{}', // 名字不是 KEY| 開頭，不是紀錄
            ff14tw_other: 'keep'
        })
    });
    assert.equal(tab(page, { getAlerts: () => [alert], now: () => NOW }).check().length, 1);
    assert.deepEqual(record(page.storage), {
        'edge|2': NOW - 86_400_000,
        'recent|3': NOW - 1000,
        [`k|${NOW}`]: NOW
    });
    assert.equal(page.storage.data.get(KEY), '{}');
    assert.equal(page.storage.data.get('ff14tw_other'), 'keep');
});

test('notifiedIds：紀錄裡的與這個頁面自己記得的合在一起', (t) => {
    const page = setup(t, { storage: mapStorage({ [`${KEY}|x|1`]: '1', [`${KEY}|bad|2`]: 'oops' }) });
    const scheduler = tab(page);
    assert.deepEqual(Array.from(scheduler.notifiedIds()), ['x|1'], '值壞掉的不算');
    scheduler.check();
    assert.deepEqual(Array.from(scheduler.notifiedIds()).sort(), ['k|10000000', 'x|1']);
    // 別的 notifiedKey 是另一份紀錄
    assert.deepEqual(Array.from(tab(page, { notifiedKey: 'other' }).notifiedIds()), []);
});

test('onDue 丟例外也已經記過了：例外照樣丟出來，但下一次 check 不會再提醒，同一次的其他提醒不會丟掉', (t) => {
    const page = setup(t);
    const B = { ...A, key: 'second' };
    const fired = [];
    let boom = true;
    const scheduler = tab(page, {
        getAlerts: () => [A, B],
        onDue: (alert) => {
            fired.push(alert.key);
            if (boom) {
                boom = false;
                throw new Error('boom');
            }
        }
    });
    assert.throws(() => scheduler.check(), /boom/);
    assert.deepEqual(fired, ['k']);
    assert.equal(scheduler.check().length, 1); // 只剩 B 還沒提醒
    assert.deepEqual(fired, ['k', 'second']);
    assert.equal(scheduler.check().length, 0);
});

// ---------- start()／stop() ----------

test('start：每秒檢查一次，重複呼叫只開一個計時器；stop 之後不再檢查，還能再 start', (t) => {
    const page = setup(t);
    const alerts = [A];
    let onDueCalls = 0;
    const scheduler = tab(page, { getAlerts: () => alerts, onDue: () => { onDueCalls += 1; } });

    scheduler.start();
    scheduler.start();
    assert.equal(page.intervals.length, 1);
    assert.equal(page.intervals[0].delay, 1000);
    assert.equal(onDueCalls, 0, 'start 不會馬上檢查');

    page.intervals[0].callback();
    assert.equal(onDueCalls, 1);

    scheduler.stop();
    scheduler.stop();
    assert.equal(page.intervals[0].cleared, true);

    scheduler.start();
    assert.equal(page.intervals.length, 2);
    assert.equal(page.intervals[1].cleared, false);
});

test('分頁切回前景時馬上檢查', (t) => {
    const page = setup(t);
    const { document, window } = page.dom;
    const alerts = [A];
    let onDueCalls = 0;
    const scheduler = tab(page, { getAlerts: () => alerts, onDue: () => { onDueCalls += 1; } });
    const visibilityChange = () => document.dispatchEvent(new window.Event('visibilitychange'));

    scheduler.start();
    document.visibilityState = 'hidden';
    visibilityChange();
    assert.equal(onDueCalls, 0, '還在背景：等下一次計時器');

    document.visibilityState = 'visible';
    visibilityChange();
    assert.equal(onDueCalls, 1, '切回前景：不用等下一秒');

    scheduler.stop();
    alerts.push({ ...A, start: A.start + 1 });
    visibilityChange();
    assert.equal(onDueCalls, 1, 'stop 之後不再檢查');
});

// ---------- deliver()：頁內提示、提示音、系統通知 ----------

test('deliver：每次都有頁內提示與提示音，允許時再加系統通知', (t) => {
    const { Notification, log } = fakeNotification({ permission: 'granted' });
    const audio = fakeAudio();
    const page = setup(t, { Notification, AudioContext: audio.AudioContext });

    page.ReminderScheduler.deliver({ title: '天氣提醒', body: '尤里卡·皮羅斯 快要晴天', tag: 'weather-1' });

    assert.equal(log.created.length, 1);
    assert.equal(log.created[0].title, '天氣提醒');
    assert.equal(log.created[0].body, '尤里卡·皮羅斯 快要晴天');
    assert.equal(log.created[0].tag, 'weather-1');
    assert.equal(log.created[0].options.icon, undefined);

    assert.equal(page.toasts().length, 1);
    const toast = page.toasts()[0];
    assert.equal(toast.textContent, '天氣提醒\n尤里卡·皮羅斯 快要晴天');
    assert.equal(toast.parentNode, page.dom.document.body);
    assert.equal(toast.getAttribute('role'), 'status');
    for (const name of ['toast', 'toast-success', 'reminder-alert']) assert.ok(toast.classList.contains(name), name);

    // 兩聲：880 Hz 接 1100 Hz，從 AudioContext 的目前時間開始，隔 0.25 秒
    assert.equal(audio.log.starts.length, 2);
    assert.deepEqual(audio.log.frequencies, [880, 1100]);
    assert.deepEqual(audio.log.starts, [5, 5.25]);

    // 每次都有：再來一次就再一個提示、再兩聲
    page.ReminderScheduler.deliver({ title: 'T', body: 'B', tag: 'weather-1' });
    assert.equal(page.toasts().length, 2);
    assert.equal(audio.log.starts.length, 4);
    assert.equal(audio.log.contexts, 1, '共用同一個 AudioContext');
});

test('deliver：icon 有給才放進系統通知的選項；點通知會回到這個分頁並關掉通知', (t) => {
    const { Notification, log } = fakeNotification();
    const page = setup(t, { Notification });

    page.ReminderScheduler.deliver({ title: 'T', body: 'B', tag: 'x', icon: '/assets/images/ff14tw.ico' });
    assert.equal(log.created[0].options.icon, '/assets/images/ff14tw.ico');

    const { instance } = log.created[0];
    assert.equal(instance.closed, false);
    instance.onclick();
    assert.equal(page.focusCalls, 1);
    assert.equal(instance.closed, true);
});

for (const [name, create] of [
    ['權限被拒絕', () => fakeNotification({ permission: 'denied' })],
    ['權限還沒問過', () => fakeNotification({ permission: 'default' })],
    ['瀏覽器沒有 Notification 物件', () => ({})],
    ['建構時丟錯（Android 的 Chrome）', () => fakeNotification({ permission: 'granted', constructorThrows: true })]
]) {
    test(`deliver：${name}時沒有系統通知，頁內提示與提示音照樣有，也不丟例外`, (t) => {
        const { Notification, log } = create();
        const audio = fakeAudio();
        const page = setup(t, { Notification, AudioContext: audio.AudioContext });

        assert.doesNotThrow(() => page.ReminderScheduler.deliver({ title: 'T', body: 'B', tag: 'x' }));

        if (log) assert.equal(log.created.length, 0);
        assert.equal(page.toasts().length, 1);
        assert.equal(page.toasts()[0].textContent, 'T\nB');
        assert.equal(audio.log.starts.length, 2);
    });
}

test('deliver：AudioContext 還在暫停（重新整理後還沒有人操作過頁面）時不排提示音，免得等到第一次點擊才一起響', (t) => {
    const audio = fakeAudio({ blocked: true });
    const { Notification, log } = fakeNotification();
    const page = setup(t, { Notification, AudioContext: audio.AudioContext });
    const deliver = () => page.ReminderScheduler.deliver({ title: 'T', body: 'B', tag: 'x' });

    deliver();
    assert.equal(audio.log.resumes, 1, '有試著 resume');
    assert.equal(audio.log.starts.length, 0, '暫停中的 AudioContext 不排聲音：排了會等到使用者第一次點擊才響');
    assert.equal(page.toasts().length, 1, '頁內提示照樣有');
    assert.equal(log.created.length, 1, '系統通知照樣有');

    // 使用者點了頁面：unlockSound() 在點擊裡讓它開始跑，剛才那一次不會補響；之後的提醒照常有兩聲
    audio.policy.blocked = false;
    page.ReminderScheduler.unlockSound();
    assert.equal(audio.log.starts.length, 0);
    deliver();
    assert.equal(audio.log.starts.length, 2);
    assert.equal(audio.log.contexts, 1, '共用同一個 AudioContext');
});

test('deliver：頁內提示、提示音、系統通知互不影響，其中一個做不到也不丟例外', (t) => {
    const deliver = (page) => page.ReminderScheduler.deliver({ title: 'T', body: 'B', tag: 'x' });

    // 提示音放不出來：建立 AudioContext 時丟錯
    const throwing = fakeAudio({ constructorThrows: true });
    const noSound = fakeNotification();
    const page = setup(t, { Notification: noSound.Notification, AudioContext: throwing.AudioContext });
    assert.doesNotThrow(() => deliver(page));
    assert.equal(page.toasts().length, 1);
    assert.equal(noSound.log.created.length, 1);

    // 提示音放不出來：瀏覽器根本沒有 AudioContext
    const bare = setup(t, { Notification: fakeNotification().Notification });
    assert.doesNotThrow(() => deliver(bare));
    assert.equal(bare.toasts().length, 1);

    // 頁內提示做不到（頁面還沒有 body）：提示音與系統通知照樣有
    const audio = fakeAudio();
    const notification = fakeNotification();
    const noBody = setup(t, { Notification: notification.Notification, AudioContext: audio.AudioContext });
    noBody.dom.document.body = null;
    assert.doesNotThrow(() => deliver(noBody));
    assert.equal(audio.log.starts.length, 2);
    assert.equal(notification.log.created.length, 1);
});

test('deliver：頁內提示 8 秒後收起，點一下馬上收起；加上 show 之前不算時間', (t) => {
    const page = setup(t, { frames: 'manual' });
    const deliver = () => page.ReminderScheduler.deliver({ title: 'T', body: 'B', tag: 'x' });

    // 背景分頁不會畫出下一個畫面：這段時間不算，提示不會在使用者看到之前就不見
    deliver();
    const [first] = page.toasts();
    t.mock.timers.tick(60_000);
    assert.equal(page.toasts().length, 1);
    assert.equal(first.classList.contains('show'), false);

    page.flushFrames();
    assert.equal(first.classList.contains('show'), true);
    t.mock.timers.tick(7999);
    assert.equal(first.classList.contains('show'), true);
    t.mock.timers.tick(1);
    assert.equal(first.classList.contains('show'), false, '8 秒到了：開始收起');
    assert.equal(page.toasts().length, 1, '收起的動畫還在跑');
    t.mock.timers.tick(300);
    assert.equal(page.toasts().length, 0);

    // 點一下就收起，之後 8 秒的計時器到了也不會出事
    deliver();
    page.flushFrames();
    const [second] = page.toasts();
    t.mock.timers.tick(1000);
    second.click();
    assert.equal(second.classList.contains('show'), false);
    t.mock.timers.tick(300);
    assert.equal(page.toasts().length, 0);
    t.mock.timers.tick(10_000);
    assert.equal(page.toasts().length, 0);
});

// ---------- permission()、requestPermission()、unlockSound() ----------

test('permission 與 requestPermission：只有 default 才真的去問', async (t) => {
    const page = setup(t);
    const { ReminderScheduler } = page;
    const win = page.dom.window;

    const asked = fakeNotification({ permission: 'default', answer: 'granted' });
    win.Notification = asked.Notification;
    assert.equal(ReminderScheduler.permission(), 'default');
    assert.equal(await ReminderScheduler.requestPermission(), 'granted');
    assert.equal(asked.log.requests, 1);
    assert.equal(ReminderScheduler.permission(), 'granted');
    assert.equal(await ReminderScheduler.requestPermission(), 'granted');
    assert.equal(asked.log.requests, 1, '已經 granted：不再問');

    const declined = fakeNotification({ permission: 'default', answer: 'denied' });
    win.Notification = declined.Notification;
    assert.equal(await ReminderScheduler.requestPermission(), 'denied', '回傳使用者的答案');
    assert.equal(ReminderScheduler.permission(), 'denied');

    const denied = fakeNotification({ permission: 'denied' });
    win.Notification = denied.Notification;
    assert.equal(ReminderScheduler.permission(), 'denied');
    assert.equal(await ReminderScheduler.requestPermission(), 'denied');
    assert.equal(denied.log.requests, 0, '已經 denied：不再問');

    const failing = fakeNotification({ permission: 'default', requestRejects: true });
    win.Notification = failing.Notification;
    assert.equal(await ReminderScheduler.requestPermission(), 'default', '問的時候出錯：回傳目前的狀態，不丟出去');
    assert.equal(failing.log.requests, 1);

    delete win.Notification;
    assert.equal(ReminderScheduler.permission(), 'unsupported');
    assert.equal(await ReminderScheduler.requestPermission(), 'unsupported');
});

test('new Notification() 丟過一次錯（Android 的 Chrome）之後：permission() 與 requestPermission() 都是 unsupported，之後不再試著建系統通知', async (t) => {
    const { Notification, log } = fakeNotification({ permission: 'granted', constructorThrows: true });
    // 替身建構時先丟錯、不會記進 log.created，所以另外數「試著建了幾次」
    let attempts = 0;
    class CountingNotification extends Notification {
        constructor(...args) {
            attempts += 1;
            super(...args);
        }
    }
    const audio = fakeAudio();
    const page = setup(t, { Notification: CountingNotification, AudioContext: audio.AudioContext });
    const { ReminderScheduler } = page;
    const deliver = () => ReminderScheduler.deliver({ title: 'T', body: 'B', tag: 'x' });

    assert.equal(ReminderScheduler.permission(), 'granted', '還沒試過：照瀏覽器回報的權限');
    deliver();
    assert.equal(attempts, 1, '允許了就試著建一次');
    assert.equal(ReminderScheduler.permission(), 'unsupported', '丟過錯：從此當作不能跳通知');
    assert.equal(await ReminderScheduler.requestPermission(), 'unsupported');
    assert.equal(log.requests, 0, '不會再去問');

    deliver();
    assert.equal(attempts, 1, '之後不再試著建');
    assert.equal(page.toasts().length, 2, '頁內提示照樣有');
    assert.equal(audio.log.starts.length, 4, '提示音照樣有');

    // 對照：建得出來的系統通知不會讓權限變成 unsupported
    const working = fakeNotification({ permission: 'granted' });
    const fine = setup(t, { Notification: working.Notification });
    fine.ReminderScheduler.deliver({ title: 'T', body: 'B', tag: 'x' });
    assert.equal(working.log.created.length, 1);
    assert.equal(fine.ReminderScheduler.permission(), 'granted');
});

test('unlockSound：建立並 resume 共用的 AudioContext，之後的提示音用同一個', (t) => {
    const audio = fakeAudio();
    const page = setup(t, { AudioContext: audio.AudioContext });

    page.ReminderScheduler.unlockSound();
    assert.equal(audio.log.contexts, 1);
    assert.equal(audio.log.resumes, 1);

    page.ReminderScheduler.unlockSound(); // 已經在跑了：不再建立、不再 resume
    assert.equal(audio.log.contexts, 1);
    assert.equal(audio.log.resumes, 1);

    page.ReminderScheduler.deliver({ title: 'T', body: 'B', tag: 'x' });
    assert.equal(audio.log.contexts, 1);
    assert.equal(audio.log.starts.length, 2);
});

test('unlockSound：沒有 AudioContext 或建立時丟錯，什麼都不做；只有舊版的 webkitAudioContext 也行', (t) => {
    const none = setup(t);
    assert.doesNotThrow(() => none.ReminderScheduler.unlockSound());

    const throwing = fakeAudio({ constructorThrows: true });
    const broken = setup(t, { AudioContext: throwing.AudioContext });
    assert.doesNotThrow(() => broken.ReminderScheduler.unlockSound());

    const prefixed = fakeAudio();
    const old = setup(t, { webkitAudioContext: prefixed.AudioContext });
    old.ReminderScheduler.deliver({ title: 'T', body: 'B', tag: 'x' });
    assert.equal(prefixed.log.starts.length, 2);
});

// ---------- 樣式 ----------

test('tools-common.css：.reminder-alert 排在 .toast 之後，讓提示吃得到滑鼠事件', () => {
    const css = fs.readFileSync(path.join(ROOT, 'assets/css/tools-common.css'), 'utf8');
    const toast = css.indexOf('\n.toast {');
    const alert = css.indexOf('\n.reminder-alert {');
    assert.ok(toast !== -1, '找不到 .toast');
    assert.ok(alert > toast, '.reminder-alert 要排在 .toast 之後，同樣的選擇器權重才會蓋過 pointer-events: none');
    const rule = css.slice(alert).match(/\.reminder-alert \{([^}]*)\}/)[1];
    assert.match(rule, /pointer-events:\s*auto/);
    assert.match(rule, /cursor:\s*pointer/);
});
