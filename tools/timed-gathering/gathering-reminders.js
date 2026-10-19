/**
 * 我的提醒的資料：哪幾種素材要提醒、出現前幾分鐘通知、「網頁提醒」開關，以及交給 ReminderScheduler 的提醒（Alert）。
 * 用在：特殊採集時間管理器的卡片（「提醒我」）、頁面最上面的「我的提醒」，以及複製鬧鐘（讀 keys）。
 * 存在 localStorage；瀏覽器封鎖網站資料或寫不進去時，這次打開期間照樣用記憶裡的，只是下次打開不記得。
 * 每次改（add、remove、setEnabled、setLead）之前先照 localStorage 重讀，改完整份寫回去：
 * 另一個分頁剛改過、這個分頁還沒收到 storage 事件時，照記憶裡舊的內容寫回去會蓋掉那個分頁新增或取消的提醒。
 * 不碰 DOM；現在的時間由呼叫端傳進來（只有 constructor 的 now 預設是 Date.now()）。
 *
 * 存的格式（STORAGE_KEY）：{ enabled, enabledAt, leadMinutes, entries: [{ key, armedAt }] }
 * - enabled：「網頁提醒」開關。關著時 alerts() 是空的（到時間什麼都不做），提醒清單照樣留著。
 * - enabledAt：開關最近一次由關變開的時間。alerts() 給 ReminderScheduler 的 armedAt 取它和提醒的 armedAt 較晚的，
 *   所以關掉再打開時從打開的那一刻重新算：已經開始的那一次不補，提早範圍內的等到開始（ReminderScheduler 的規則）。
 * - leadMinutes：出現前幾分鐘通知（LEAD_OPTIONS，0 是出現的那一刻），所有提醒共用。
 * - entries：提醒的素材 key（GatheringMaterials.keyOf()）加上設定的時間，照加入的順序。一直提醒到取消：
 *   每一次出現都提醒（alerts() 一直列接下來的幾次）。
 *
 * 舊使用者遷移：以前的版本只有一個全域開關 LEGACY_KEY { enabled }，提醒的是預設清單裡的每一樣。
 * 第一次載入新版（STORAGE_KEY 還什麼都沒有）時，開關是開著的人，把預設清單的素材帶進「我的提醒」、網頁提醒維持開著；
 * 存起來以後 STORAGE_KEY 就在了，之後不會再遷移。遷移只讀 LEGACY_KEY 和 LISTS_KEY，不寫也不刪
 * （使用者的清單與舊備份不能被改壞）。全天的素材不帶過來（一直都能採，沒有提醒可以響，卡片上也沒有提醒鈕可以開關它）；
 * 沒有任何素材（資料沒載入）時不遷移，留到下一次，免得只有一次的遷移花在空的清單上。
 *
 * 相依：GatheringMaterials（gathering-materials.js）要已經載入；它只在方法裡被參照，這個檔案頂層不參照它。
 */
class GatheringReminders {
    // localStorage：我的提醒
    static STORAGE_KEY = 'ff14tw_timed_gathering_reminders';

    // 舊版的採集提醒開關 { enabled }：只在遷移時讀
    static LEGACY_KEY = 'ff14tw_timed_gathering_notifications';

    // 清單（ListManager 存的 { version, lists }）：遷移時只讀預設清單裡有哪些素材
    static LISTS_KEY = 'ff14tw_timed_gathering_lists';

    // 出現前幾分鐘通知：0 是出現的那一刻
    static LEAD_OPTIONS = [0, 1, 2, 3, 5, 10];
    static DEFAULT_LEAD = 1;

    static MINUTE_MS = 60000;

    /**
     * 讀存起來的提醒；什麼都沒存（或瀏覽器封鎖網站資料）時是預設：網頁提醒關著、提早 1 分鐘、沒有提醒。
     * 讀得到、但什麼都沒存，又是以前開著採集提醒的人時，把以前的設定帶過來（見 migrate()）
     * @param {Object[]} materials - GatheringMaterials.group() 的結果；提醒只認得這些素材
     * @param {number} now - 現在的時間（毫秒時間戳）：遷移來的提醒從這一刻開始算
     */
    constructor(materials, now = Date.now()) {
        this.materials = new Map(materials.map((material) => [material.key, material]));
        this.isEnabled = false;
        this.enabledAt = 0;
        this.lead = GatheringReminders.DEFAULT_LEAD;
        this.entries = [];
        // 上一次寫不進去：記憶裡的比存的新，改之前不重讀（見 refresh()）
        this.unsaved = false;

        // 讀得到、但什麼都沒存：新的瀏覽器，或第一次用新版的「我的提醒」
        if (this.reload()) this.migrate(now);
    }

    /** 「網頁提醒」開關 */
    get enabled() {
        return this.isEnabled;
    }

    /** 出現前幾分鐘通知 */
    get leadMinutes() {
        return this.lead;
    }

    /** 要提醒的素材 key，照加入的順序（每次回傳新的陣列，改它不會動到提醒） */
    get keys() {
        return this.entries.map((entry) => entry.key);
    }

    /**
     * 這種素材有沒有設提醒
     * @param {string} key - 素材的 key
     * @returns {boolean}
     */
    has(key) {
        return this.entries.some((entry) => entry.key === key);
    }

    /**
     * 設提醒；不認得的素材（資料裡沒有，或單筆的 id 而不是素材的 key）或已經有了就什麼都不做
     * @param {string} key - 素材的 key
     * @param {number} [now] - 設定的時間：這個時間以前已經開始的那一次不補提醒。
     *     沒傳（或不是有限的數字）就用現在的時間：算不出來的時間存不起來，這一次的提醒也永遠不會響
     */
    add(key, now) {
        this.refresh();
        if (!this.materials.has(key) || this.has(key)) return;
        this.entries.push({ key, armedAt: Number.isFinite(now) ? now : Date.now() });
        this.save();
    }

    /**
     * 取消提醒
     * @param {string} key - 素材的 key
     */
    remove(key) {
        this.refresh();
        this.entries = this.entries.filter((entry) => entry.key !== key);
        this.save();
    }

    /**
     * 打開或關掉「網頁提醒」。由關變開時記下這一刻（enabledAt）：之後的提醒從這一刻重新算
     * @param {boolean} enabled
     * @param {number} [now] - 由關變開的時間；沒傳（或不是有限的數字）就用現在的時間。關掉用不到它
     */
    setEnabled(enabled, now) {
        this.refresh();
        const on = Boolean(enabled);
        if (on && !this.isEnabled) this.enabledAt = Number.isFinite(now) ? now : Date.now();
        this.isEnabled = on;
        this.save();
    }

    /**
     * 改出現前幾分鐘通知；不在 LEAD_OPTIONS 裡的不理
     * @param {number} minutes
     */
    setLead(minutes) {
        if (!GatheringReminders.LEAD_OPTIONS.includes(minutes)) return;
        this.refresh();
        this.lead = minutes;
        this.save();
    }

    /**
     * 改之前先照存起來的重讀（內部用）：另一個分頁的 storage 事件還沒到時，記憶裡的是舊的。
     * 不遷移（遷移只在建立的時候做一次）；讀不到時記憶裡的不動（reload()），上一次寫不進去時也不重讀：
     * 那時記憶裡的比存的新，重讀會把這次打開期間設的提醒弄丟
     */
    refresh() {
        if (!this.unsaved) this.reload();
    }

    /**
     * 重新讀存起來的內容（另一個分頁改了也用它）。什麼都沒存或壞掉的 JSON 是預設；每個欄位各自整理：
     * 開關要剛好是 true，enabledAt 要是有限的數字（不然 0），提早分鐘數不在選項裡是 1，
     * 提醒只留素材是現在資料裡有的、armedAt 是有限數字的（重複的只留第一個）。
     * 讀的時候丟例外（瀏覽器封鎖網站資料）時，這個頁面記得的不動；讀得到時記憶裡的就是存的（unsaved 清掉）。
     * @returns {boolean} 讀得到、但什麼都沒存（getItem 回傳 null）時是 true；存過（哪怕壞掉）或讀不到是 false
     */
    reload() {
        let raw;
        try {
            raw = window.localStorage.getItem(GatheringReminders.STORAGE_KEY);
        } catch (error) {
            return false;
        }
        this.unsaved = false;

        let saved = null;
        try {
            saved = JSON.parse(raw);
        } catch (error) {
            // 壞掉的 JSON：當成什麼都沒存
        }
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
            saved = {};
        }

        this.isEnabled = saved.enabled === true;
        this.enabledAt = Number.isFinite(saved.enabledAt) ? saved.enabledAt : 0;
        this.lead = GatheringReminders.LEAD_OPTIONS.includes(saved.leadMinutes) ? saved.leadMinutes : GatheringReminders.DEFAULT_LEAD;
        this.entries = this.normalizeEntries(saved.entries);
        return raw === null;
    }

    /**
     * 存起來的提醒整理成 [{ key, armedAt }]（內部用，reload() 呼叫）
     * @param {*} list - 存的 entries
     * @returns {Object[]}
     */
    normalizeEntries(list) {
        const entries = [];
        if (!Array.isArray(list)) return entries;

        const seen = new Set();
        for (const entry of list) {
            if (!entry || typeof entry !== 'object') continue;
            const { key, armedAt } = entry;
            if (!this.materials.has(key) || !Number.isFinite(armedAt) || seen.has(key)) continue;
            seen.add(key);
            entries.push({ key, armedAt });
        }
        return entries;
    }

    /**
     * 交給 ReminderScheduler 的提醒，每秒會被問一次。網頁提醒關著時是空的。
     * 每一種提醒的素材（全天的沒有「出現」可以提醒，跳過）：提早範圍內會開始的每一次（提早 10 分鐘時，
     * 前一次還沒結束、下一次就已經到提醒時間是會發生的），再加上之後的一次；正在進行的那一次也在，
     * 晚到的提醒要靠它補（見 ReminderScheduler.due()）。永遠不丟例外（算不出來就是空的）。
     * @param {number} now - 現在的時間（毫秒時間戳）
     * @returns {Object[]} { key, start, end, leadMs, armedAt, data }：key 是 'gathering:' 加素材的 key；
     *     start、end 是那一次的開始與結束；armedAt 取提醒的設定時間和 enabledAt 較晚的；
     *     data 是 { materialKey, record, schedule }，record 與 schedule 是那一次出現的資料與時段
     */
    alerts(now) {
        // 現在不是有限的時間就算不出下一次，也不能讓下面一直找下去
        if (!this.isEnabled || !Number.isFinite(now)) return [];

        try {
            const leadMs = this.lead * GatheringReminders.MINUTE_MS;
            const alerts = [];
            for (const entry of this.entries) {
                const material = this.materials.get(entry.key);
                if (!material || material.allDay) continue;

                const armedAt = Math.max(entry.armedAt, this.enabledAt);
                // 先拿接下來的 2 段，最後一段還在提早範圍內（start − leadMs <= now）就再多拿一段
                let limit = 2;
                let found = GatheringMaterials.upcoming(material, now, limit);
                while (found.length === limit && found[limit - 1].start - leadMs <= now) {
                    limit += 1;
                    found = GatheringMaterials.upcoming(material, now, limit);
                }
                for (const span of found) {
                    alerts.push({
                        key: `gathering:${material.key}`,
                        start: span.start,
                        end: span.end,
                        leadMs,
                        armedAt,
                        data: { materialKey: material.key, record: span.record, schedule: span.schedule }
                    });
                }
            }
            return alerts;
        } catch (error) {
            return [];
        }
    }

    /**
     * 把以前的設定帶過來：LEGACY_KEY 的 enabled 是 true 時，預設清單裡的素材（全天的除外）變成我的提醒
     * （全部從 now 開始算），網頁提醒開著（enabledAt 也是 now），存起來。
     * 其他情況（沒有、不是 true、JSON 壞掉、讀不到）什麼都不做、不存。
     * 預設清單讀不到、沒有項目或只有全天的素材時，沒有提醒可以帶，但網頁提醒照樣維持開著，也照樣只做這一次。
     * 沒有任何素材（資料沒載入）時也什麼都不做、不存：存起來就再也不會遷移，不能把這一次花在空的上面。
     * 由 constructor 在什麼都沒存的時候呼叫；只讀 LEGACY_KEY 和 LISTS_KEY，不寫也不刪。
     * @param {number} now
     */
    migrate(now) {
        if (this.materials.size === 0) return;

        let legacy;
        try {
            legacy = JSON.parse(window.localStorage.getItem(GatheringReminders.LEGACY_KEY));
        } catch (error) {
            return;
        }
        if (!legacy || legacy.enabled !== true) return;

        this.entries = this.defaultListKeys().map((key) => ({ key, armedAt: now }));
        this.isEnabled = true;
        this.enabledAt = now;
        this.save();
    }

    /**
     * 預設清單（ListManager 的 default 清單）裡的素材 key：只留現在資料裡有的、不是全天的，照清單的順序，每種一次。
     * 兩個時段只有一個在清單裡也算那種素材。全天的素材一直都能採，沒有提醒可以響（alerts() 也跳過它），
     * 卡片上也沒有提醒鈕可以開關它，帶過來只是一個不會響的提醒。清單讀不到或內容不對就是沒有（內部用，migrate() 呼叫）
     * @returns {string[]}
     */
    defaultListKeys() {
        let stored;
        try {
            stored = JSON.parse(window.localStorage.getItem(GatheringReminders.LISTS_KEY));
        } catch (error) {
            return [];
        }

        // 預設清單的 id 是 ListManager.CONSTANTS.DEFAULT_LIST_ID；這個檔案不依賴 list-manager.js，所以直接寫在這裡
        const listItems = stored?.lists?.default?.items;
        if (!Array.isArray(listItems)) return [];

        const keys = [];
        for (const item of listItems) {
            if (!item || typeof item.id !== 'string') continue;
            const key = GatheringMaterials.keyOf(item);
            const material = this.materials.get(key);
            if (material && !material.allDay && !keys.includes(key)) keys.push(key);
        }
        return keys;
    }

    /** 存起來；瀏覽器封鎖或寫不進去就算了，這次打開期間照樣用記憶裡的（unsaved：之後改的時候不重讀） */
    save() {
        try {
            window.localStorage.setItem(GatheringReminders.STORAGE_KEY, JSON.stringify({
                enabled: this.isEnabled,
                enabledAt: this.enabledAt,
                leadMinutes: this.lead,
                entries: this.entries
            }));
            this.unsaved = false;
        } catch (error) {
            // 下次打開不記得
            this.unsaved = true;
        }
    }
}

// 瀏覽器：和其他工具腳本一樣掛在 window 上（頂層的 class 本來就是全域的，其他腳本直接用名稱）
if (typeof window !== 'undefined') window.GatheringReminders = GatheringReminders;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GatheringReminders;
}
