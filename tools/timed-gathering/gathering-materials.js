/**
 * 採集素材：把資料裡同一種素材的每一筆合成一種素材，算出它現在能不能採、下一次什麼時候出現，
 * 以及卡片與提醒要寫的時段文字零件（ET 時段、倒數、本地時間）。
 * 用在：特殊採集時間管理器的卡片（狀態行、時段行、排序）、「我的提醒」與「複製鬧鐘」。
 * 純函式，只有 static，不碰 DOM、不讀時鐘（現在的時間由呼叫端傳進來），Node 裡就能測。
 *
 * 時間換算（艾歐澤亞時間，簡稱 ET；ET 的時間軸從 Unix epoch 起算）：
 * 1 ET 分鐘 = 175000 / 60 ms，1 ET 天 = 1440 ET 分鐘 = 4200000 ms。
 * 一個時段（TimeCalculator.parseSchedule() 的結果）每個 ET 天出現一次：第 k 天的那一段是
 * ET 分鐘 [k * 1440 + startMinutes, k * 1440 + startMinutes + durationMinutes)，
 * 換成時間戳一律用 Math.round(ET 分鐘 * ET_MINUTE_MS)。所以同一段不管從哪個「現在」算，
 * start／end 都一樣（ReminderScheduler 用 start 認出是哪一次）。start 含、end 不含；
 * 區間可以跨午夜（22:00-02:00 在隔天 01:00 還在裡面，這一段從前一天的 22:00 起算）。
 *
 * 「一段」是 { start, end }（毫秒時間戳）。state()、upcoming()、nextAlarm() 回傳的一段另外帶
 * record（資料裡的那一筆）與 schedule（那一筆的 parseSchedule() 結果，要寫 ET 時間的地方都用它，不再解析 record.time）。
 *
 * 相依：只有 group() 用到 TimeCalculator（time-calculator.js），呼叫的時候它要已經載入。
 * 這個檔案頂層不參照 TimeCalculator，所以測試可以單獨 require()。
 */
class GatheringMaterials {
    // 1 ET 分鐘的毫秒數（1 ET 小時 = 175 秒）
    static ET_MINUTE_MS = 175000 / 60;

    // 1 ET 天的毫秒數
    static ET_DAY_MS = 4200000;

    // state().kind 的排序：現在可採 → 快出現的 → 全天 → 沒有有效時段
    static KIND_ORDER = { now: 0, next: 1, allday: 2, none: 3 };

    // ---------- 素材 ----------

    /** 素材的 key：資料 id 去掉結尾的 _數字（有兩個時段的是 _1、_2；只有一筆的沒有這個結尾） */
    static keyOf(record) {
        return record.id.replace(/_\d+$/, '');
    }

    /**
     * 把同一種素材的資料合成一種素材，素材照第一次出現的順序
     * @param {Object[]} records - 資料的採集物（data/timed-gathering.json 的 items）
     * @returns {Object[]} Material：{ key, records, schedules, allDay, name, nameJp, nameEn, type, level,
     *     zone, zoneJp, zoneEn, location, locationJp, locationEn, coordinates, duration, macroFormat, expansion }。
     *     顯示欄位取自資料裡先出現的那一筆；records 依開始時間排序（時段無效的排最後）；
     *     schedules[i] 是 records[i] 的 parseSchedule() 結果（時段無效是 null）；allDay 是任何一筆為全天
     */
    static group(records) {
        const byKey = new Map();
        for (const record of records) {
            const key = GatheringMaterials.keyOf(record);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(record);
        }

        return Array.from(byKey, ([key, list]) => {
            const first = list[0];
            const pairs = list.map((record) => ({
                record,
                schedule: TimeCalculator.parseSchedule(record.time, record.duration)
            }));
            // 開始時間都小於 1440，所以時段無效的（當成 1440）排最後；排序穩定，開始時間相同的保持資料裡的順序
            pairs.sort((a, b) => (a.schedule ? a.schedule.startMinutes : 1440) - (b.schedule ? b.schedule.startMinutes : 1440));
            const schedules = pairs.map((pair) => pair.schedule);

            return {
                key,
                records: pairs.map((pair) => pair.record),
                schedules,
                allDay: schedules.some((schedule) => schedule && schedule.allDay),
                name: first.name,
                nameJp: first.nameJp,
                nameEn: first.nameEn,
                type: first.type,
                level: first.level,
                zone: first.zone,
                zoneJp: first.zoneJp,
                zoneEn: first.zoneEn,
                location: first.location,
                locationJp: first.locationJp,
                locationEn: first.locationEn,
                coordinates: first.coordinates,
                duration: first.duration,
                macroFormat: first.macroFormat,
                expansion: first.expansion
            };
        });
    }

    // ---------- 時段 ----------

    /** 從 epoch 起算的 ET 分鐘（有小數） */
    static etMinutes(ts) {
        return ts / GatheringMaterials.ET_MINUTE_MS;
    }

    /**
     * 第 day 個 ET 天（從 epoch 起算）的那一段（內部用，windowAt() 與 nextWindow() 共用）
     * @param {{startMinutes: number, durationMinutes: number}} schedule
     * @param {number} day
     * @returns {{start: number, end: number}} 毫秒時間戳，四捨五入成整數
     */
    static dayWindow(schedule, day) {
        const begin = day * 1440 + schedule.startMinutes;
        return {
            start: Math.round(begin * GatheringMaterials.ET_MINUTE_MS),
            end: Math.round((begin + schedule.durationMinutes) * GatheringMaterials.ET_MINUTE_MS)
        };
    }

    /**
     * 包含 ts 的那一段（start <= ts < end）
     * @param {Object|null} schedule - parseSchedule() 的結果；null（時段無效）時沒有任何一段
     * @param {number} ts - 毫秒時間戳
     * @returns {{start: number, end: number}|null} 沒有就是 null
     */
    static windowAt(schedule, ts) {
        if (!schedule) return null;
        // ET 天的邊界剛好是 4200000 ms 的整數倍，直接除它就得到精確的天數（不經過 etMinutes() 的浮點小數）
        const day = Math.floor(ts / GatheringMaterials.ET_DAY_MS);
        // 跨午夜的那一段從前一天開始，所以前一天的也要看；更早開始的（開始時間不到 1440、最長 1440 分鐘）今天以前就結束了
        for (const startDay of [day - 1, day]) {
            const span = GatheringMaterials.dayWindow(schedule, startDay);
            if (span.start <= ts && ts < span.end) return span;
        }
        return null;
    }

    /**
     * 第一個 start > ts 的那一段
     * @param {Object|null} schedule - parseSchedule() 的結果；null（時段無效）時沒有任何一段
     * @param {number} ts - 毫秒時間戳
     * @returns {{start: number, end: number}|null}
     */
    static nextWindow(schedule, ts) {
        if (!schedule) return null;
        const day = Math.floor(ts / GatheringMaterials.ET_DAY_MS);
        // 前一天開始的一定已經開始了；今天的還沒開始就是它，不然就是明天的
        const today = GatheringMaterials.dayWindow(schedule, day);
        return today.start > ts ? today : GatheringMaterials.dayWindow(schedule, day + 1);
    }

    // ---------- 狀態 ----------

    /**
     * 素材現在的狀態
     * @param {Object} material - group() 的結果
     * @param {number} now - 毫秒時間戳
     * @returns {{kind: string, start?: number, end?: number, record?: Object, schedule?: Object}}
     *     allday：全天都可以採（只有 kind）；now：正在可採，那一段；next：現在不能採，最近的下一段；
     *     none：沒有有效的時段（只有 kind）
     */
    static state(material, now) {
        if (material.allDay) return { kind: 'allday' };

        // 正在可採：包含 now 的那一段；好幾筆都包含時取最晚結束的（還能採最久）
        let current = null;
        material.records.forEach((record, i) => {
            const schedule = material.schedules[i];
            const span = GatheringMaterials.windowAt(schedule, now);
            if (span && (!current || span.end > current.end)) {
                current = { start: span.start, end: span.end, record, schedule };
            }
        });
        if (current) return { kind: 'now', ...current };

        const next = GatheringMaterials.nextAlarm(material, now);
        return next ? { kind: 'next', ...next } : { kind: 'none' };
    }

    /**
     * 接下來的幾段：各筆的時段照開始時間合在一起，第一個可以是包含 now 的
     * @param {Object} material - group() 的結果
     * @param {number} now - 毫秒時間戳
     * @param {number} limit - 最多幾段
     * @returns {{start: number, end: number, record: Object, schedule: Object}[]} 全天與沒有有效時段的素材是 []
     */
    static upcoming(material, now, limit) {
        const count = Math.floor(limit);
        if (material.allDay || !Number.isFinite(count) || count < 1) return [];

        const list = [];
        material.records.forEach((record, i) => {
            const schedule = material.schedules[i];
            if (!schedule) return;
            // 每一筆各取前 count 段，合起來的前 count 段一定在裡面
            let span = GatheringMaterials.windowAt(schedule, now) || GatheringMaterials.nextWindow(schedule, now);
            for (let n = 0; n < count; n++) {
                list.push({ start: span.start, end: span.end, record, schedule });
                span = GatheringMaterials.nextWindow(schedule, span.start);
            }
        });
        // 排序穩定：開始時間相同的保持 records 的順序
        return list.sort((a, b) => a.start - b.start).slice(0, count);
    }

    /**
     * 下一次要提醒的那一段：第一個 start > now 的（正在可採時就是再下一段）
     * @param {Object} material - group() 的結果
     * @param {number} now - 毫秒時間戳
     * @returns {{start: number, end: number, record: Object, schedule: Object}|null} 全天與沒有有效時段的素材是 null
     */
    static nextAlarm(material, now) {
        if (material.allDay) return null;

        let best = null;
        material.records.forEach((record, i) => {
            const schedule = material.schedules[i];
            const span = GatheringMaterials.nextWindow(schedule, now);
            if (span && (!best || span.start < best.start)) {
                best = { start: span.start, end: span.end, record, schedule };
            }
        });
        return best;
    }

    /**
     * 排序用：現在可採的在前（剩比較久的在前，來得及過去），接著是快出現的（start 早的在前），然後是全天、沒有有效時段。
     * 其餘回傳 0：呼叫端用穩定排序，保留原本的順序
     * @param {Object} a - state() 的結果
     * @param {Object} b - state() 的結果
     * @returns {number}
     */
    static compare(a, b) {
        const order = GatheringMaterials.KIND_ORDER;
        if (a.kind !== b.kind) return order[a.kind] - order[b.kind];
        if (a.kind === 'now') return b.end - a.end;
        if (a.kind === 'next') return a.start - b.start;
        return 0;
    }

    // ---------- 文字零件 ----------

    /** 時與分寫成 HH:MM（內部用） */
    static hhmm(hours, minutes) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    /** 一天裡的第幾個 ET 分鐘寫成 HH:MM（先對 1440 取餘數，小數的分鐘去掉） */
    static etTime(minutes) {
        const ofDay = ((Math.floor(minutes) % 1440) + 1440) % 1440;
        return GatheringMaterials.hhmm(Math.floor(ofDay / 60), ofDay % 60);
    }

    /** 一個時段寫成「ET 22:00–02:00」（中間是 en dash） */
    static etRange(schedule) {
        const start = GatheringMaterials.etTime(schedule.startMinutes);
        const end = GatheringMaterials.etTime(schedule.startMinutes + schedule.durationMinutes);
        return `ET ${start}–${end}`;
    }

    /**
     * 素材每天的時段寫法：一般寫「ET 12:00」，區間（time 有 -）寫「ET 00:00–04:00」
     * @param {Object} material - group() 的結果
     * @returns {string[]} 每一筆有效、不是全天的時段各一個；全天是 []
     */
    static slots(material) {
        if (material.allDay) return [];

        const list = [];
        material.records.forEach((record, i) => {
            const schedule = material.schedules[i];
            if (!schedule || schedule.allDay) return;
            list.push(record.time.includes('-')
                ? GatheringMaterials.etRange(schedule)
                : `ET ${GatheringMaterials.etTime(schedule.startMinutes)}`);
        });
        return list;
    }

    /** 每次出現約幾個真實分鐘（120 ET 分鐘 = 350 秒 → 6，240 → 12） */
    static realMinutes(material) {
        return Math.round(material.duration * 175 / 3600);
    }

    /** 倒數 m:ss（進位到秒，不會是負的） */
    static countdown(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }

    /** 還有幾分鐘（進位，至少 1） */
    static minutesCeil(ms) {
        return Math.max(1, Math.ceil(ms / 60000));
    }

    /** 本地時區的 HH:MM */
    static localTime(ts) {
        const date = new Date(ts);
        return GatheringMaterials.hhmm(date.getHours(), date.getMinutes());
    }
}

// 瀏覽器：和其他工具腳本一樣掛在 window 上（頂層的 class 本來就是全域的，其他腳本直接用名稱）
if (typeof window !== 'undefined') window.GatheringMaterials = GatheringMaterials;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GatheringMaterials;
}
