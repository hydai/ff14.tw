/**
 * 提醒排程：決定「提醒現在該不該響」，到時候在頁面上顯示提示、發出提示音，瀏覽器允許的話再送出系統通知。
 * 用在：天氣預報與特殊採集時間管理器的「提醒我」。
 * 這裡不認識任何一個工具：一個提醒是一段時間加上提早多久通知，要提醒什麼、寫什麼字都由呼叫端決定。
 *
 * - Alert：{ key, start, end, leadMs, armedAt, data? }，時間都是毫秒時間戳。armedAt 是這個提醒被設定的時間，
 *   呼叫端要存起來（重新整理不能變）：設定的時候已經開始的那一次不補提醒。
 * - 到期的判斷是純函式 due()，不碰 DOM 也不讀時鐘，Node 裡就能測；實例每秒呼叫它一次（start()）。
 * - 已提醒過的 id（key|start）每一次各存成 localStorage 的一個項目：名字是 notifiedKey|id，值是 start。
 *   開著兩個分頁時同一次只有一個分頁會響；兩個分頁同時記下不同的兩次，各寫各的項目，不會互相蓋掉。
 *   瀏覽器有跨分頁的鎖（navigator.locks）時先搶鎖，兩個分頁剛好同時檢查也一樣（見 _claimWithLock()）。
 *   瀏覽器封鎖網站資料或寫不進去時，改靠這個頁面自己的記憶，這個頁面開著期間照樣只提醒一次。
 * - 提示音要先在使用者的點擊裡呼叫一次 unlockSound()，之後沒有人在操作時才放得出來（還沒解開時到時間只有頁內提示與系統通知）；
 *   requestPermission() 也只能在點擊裡呼叫，不然瀏覽器會直接拒絕。
 */
class ReminderScheduler {
    static CONSTANTS = {
        CHECK_INTERVAL: 1000, // 每秒檢查一次
        NOTIFIED_KEEP_MS: 24 * 60 * 60 * 1000, // 已提醒的紀錄只留一天
        CLAIM_HOLD_MS: 5000, // 搶到一次提醒的分頁再握住鎖 5 秒：放開時紀錄早就同步到別的分頁了
        ALERT_SHOW_MS: 8000, // 頁內提示停留 8 秒
        ALERT_FADE_MS: 300, // 收起的動畫時間
        BEEPS: [ // 提示音：880 Hz 接 1100 Hz 的兩聲（同特殊採集時間管理器的提示音）
            { frequency: 880, offset: 0 },
            { frequency: 1100, offset: 0.25 }
        ]
    };

    /** 全頁共用的 AudioContext（第一次要用時才建立） */
    static _audio = null;

    /** new Notification() 丟過錯（Android 的 Chrome 不讓網頁直接跳通知）：這個頁面之後 permission() 都回傳 'unsupported' */
    static _notificationFailed = false;

    // ---------- 到期的判斷（純函式） ----------

    /** 一次提醒的 id：同一個 key 的每一次出現（start 不同）各有一個 */
    static idOf(alert) {
        return `${alert.key}|${alert.start}`;
    }

    /** 開始提醒的時間：提早 leadMs；設定的時候已經在提早的範圍內，就等到開始才提醒 */
    static fireAt(alert) {
        return alert.armedAt > alert.start - alert.leadMs ? alert.start : alert.start - alert.leadMs;
    }

    /**
     * 現在該提醒的：設定的時候還沒開始、已經到了提醒時間、這一段還沒結束、還沒提醒過。
     * 睡過頭（背景分頁的計時器被壓慢）時，這一段結束之前補一次；整段都睡過去就不發。
     * @param {Object[]} alerts
     * @param {number} now 毫秒時間戳
     * @param {Set<string>} notifiedIds 已經提醒過的 id
     * @returns {Object[]}
     */
    static due(alerts, now, notifiedIds) {
        return alerts.filter((alert) => alert.armedAt < alert.start
            && now >= ReminderScheduler.fireAt(alert)
            && now < alert.end
            && !notifiedIds.has(ReminderScheduler.idOf(alert)));
    }

    // ---------- 排程 ----------

    /**
     * @param {Object} options
     * @param {string} options.notifiedKey 已提醒紀錄在 localStorage 的名字開頭（每一次存在 notifiedKey|id）
     * @param {function(number): Object[]} options.getAlerts 傳入現在的時間，回傳目前所有的 Alert
     * @param {function(Object): void} options.onDue 一個提醒到了
     * @param {function(): number} [options.now] 現在的時間（毫秒），預設 Date.now
     */
    constructor({ notifiedKey, getAlerts, onDue, now = () => Date.now() }) {
        this.notifiedKey = notifiedKey;
        this.getAlerts = getAlerts;
        this.onDue = onDue;
        this.now = now;
        this.memory = new Set(); // 這個頁面自己提醒過的 id：紀錄讀寫失敗時靠它照樣只提醒一次
        this.claiming = new Set(); // 正在等跨分頁的鎖的 id：每秒的檢查不重複要鎖
        this.lockFailed = false; // 要鎖被拒絕過（瀏覽器不讓這個網站使用儲存空間）：之後只靠紀錄
        this.timer = null;
        this.handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') this.check();
        };
    }

    /** 已經提醒過的 id：localStorage 裡的（另一個分頁可能剛寫過）加上這個頁面自己記得的 */
    notifiedIds() {
        const ids = new Set(this.memory);
        for (const [id, start] of this._readStored() || []) {
            if (Number.isFinite(start)) ids.add(id);
        }
        return ids;
    }

    /**
     * localStorage 裡的這個名字是不是這個排程的已提醒紀錄（storage 事件用：另一個分頁剛提醒過）
     * @param {string|null} name storage 事件的 key
     * @returns {boolean}
     */
    isRecordKey(name) {
        return typeof name === 'string' && name.startsWith(`${this.notifiedKey}|`);
    }

    /**
     * 檢查一次：重新讀紀錄 → 挑出到期的 → 每一個先記進紀錄，再呼叫 onDue。
     * 先記再呼叫，onDue 丟例外也不會一秒後又響一次（例外照樣丟出來，不吞掉）。
     * 瀏覽器有跨分頁的鎖時，到期的提醒要先搶到鎖（見 _claimWithLock()），記下與 onDue 都在拿到鎖之後才發生
     * （那時照現在的提醒重新確認還到期），不在這一次的回傳值裡。
     * @returns {Object[]} 這一次當場觸發的 Alert
     */
    check() {
        const now = this.now();
        const alerts = this.getAlerts(now);
        const fired = [];
        for (const alert of ReminderScheduler.due(alerts, now, this.notifiedIds())) {
            if (this._claimWithLock(alert)) continue;
            if (!this._claim(alert, now)) continue;
            fired.push(alert);
            this.onDue(alert);
        }
        return fired;
    }

    /** 開始每秒檢查；分頁切回前景時馬上檢查一次（背景分頁的計時器會被壓慢） */
    start() {
        if (this.timer !== null) return;
        this.timer = window.setInterval(() => this.check(), ReminderScheduler.CONSTANTS.CHECK_INTERVAL);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    stop() {
        if (this.timer === null) return;
        window.clearInterval(this.timer);
        this.timer = null;
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    /** 一次提醒在 localStorage 的名字，也是跨分頁的鎖的名字 @private */
    _recordName(id) {
        return `${this.notifiedKey}|${id}`;
    }

    /**
     * 讀 localStorage 裡的紀錄（id -> start）：名字是 notifiedKey| 開頭的每一個項目。值不是一串數字（壞掉）的
     * start 是 NaN，當作還沒提醒過，下一次記下別的提醒時刪掉；讀不到（瀏覽器封鎖網站資料）回傳 null。
     * @private
     */
    _readStored() {
        const prefix = this._recordName('');
        try {
            const storage = window.localStorage;
            const record = new Map();
            for (let i = 0; i < storage.length; i++) {
                const name = storage.key(i);
                if (typeof name !== 'string' || !name.startsWith(prefix)) continue;
                const value = storage.getItem(name);
                record.set(name.slice(prefix.length), /^\d+$/.test(value) ? Number(value) : NaN);
            }
            return record;
        } catch (error) {
            return null;
        }
    }

    /** @private */
    _writeStored(id, start) {
        try {
            window.localStorage.setItem(this._recordName(id), String(start));
        } catch (error) {
            // 寫不進去（空間滿了、被封鎖）：這個頁面靠 this.memory 照樣只提醒一次
        }
    }

    /** @private */
    _removeStored(id) {
        try {
            window.localStorage.removeItem(this._recordName(id));
        } catch (error) {
            // 刪不掉就留著，下一次再刪
        }
    }

    /**
     * 記下這一次已經提醒：重新讀紀錄，確認還沒有人記過；記在這個頁面的記憶裡，再寫進這一次自己的項目，
     * 順便刪掉一天以前的與值壞掉的。回傳 false 表示已經有人記過了（另一個分頁剛提醒過），這個分頁不用再提醒。
     * 只寫這一次自己的項目：另一個分頁同時記下別的一次，兩邊都留得住。
     * 讀不到紀錄時不寫（瀏覽器封鎖網站資料時寫入一樣會失敗）。
     * @private
     */
    _claim(alert, now) {
        const id = ReminderScheduler.idOf(alert);
        const stored = this._readStored();
        if (this.memory.has(id) || (stored && Number.isFinite(stored.get(id)))) return false;
        this.memory.add(id);
        if (stored) {
            this._writeStored(id, alert.start);
            const oldest = now - ReminderScheduler.CONSTANTS.NOTIFIED_KEEP_MS;
            for (const [other, start] of stored) {
                if (other !== id && !(start >= oldest)) this._removeStored(other); // 一天以前的、值壞掉的（NaN）
            }
        }
        return true;
    }

    /**
     * 有跨分頁的鎖（navigator.locks）時用鎖搶這一次提醒：鎖的名字是 notifiedKey|id，拿得到（ifAvailable）
     * 才照 _claim() 記下並呼叫 onDue，之後再握住 CLAIM_HOLD_MS 才放開。
     * 只靠 localStorage 擋不住同時檢查的兩個分頁：一個讀完、還沒寫回時，另一個也讀完了。
     * 鎖一次只給一個分頁，另一個拿到 null 就不提醒；放開時紀錄早就同步過去，那個分頁的 due() 會直接跳過。
     * 要鎖的結果稍後才回來，這段時間裡提醒可能改了提早分鐘數、換了目標或被取消，那一段也可能已經結束（電腦睡著了），
     * 所以拿到鎖時照現在的提醒與時間重新挑一次（_currentDue()）：記下與交給 onDue 的是現在的那一次，不再到期就都不做。
     * 沒有鎖時回傳 false，照舊只靠紀錄。要鎖被拒絕（瀏覽器不讓這個網站使用儲存空間，例如封鎖網站資料）時，
     * 這一次在拒絕之後同樣重新挑過再處理，這個頁面之後都不再要鎖。
     * @returns {boolean} true 表示交給鎖處理（記下與 onDue 稍後才發生）
     * @private
     */
    _claimWithLock(alert) {
        const locks = window.navigator && window.navigator.locks;
        if (this.lockFailed || !locks || typeof locks.request !== 'function') return false;
        const id = ReminderScheduler.idOf(alert);
        if (this.claiming.has(id)) return true;
        this.claiming.add(id);

        let granted = false;
        Promise.resolve()
            .then(() => locks.request(this._recordName(id), { ifAvailable: true }, (lock) => {
                granted = true;
                this.claiming.delete(id);
                const current = lock ? this._currentDue(id) : null;
                if (!current || !this._claim(current.alert, current.now)) return undefined;
                const hold = new Promise((resolve) => window.setTimeout(resolve, ReminderScheduler.CONSTANTS.CLAIM_HOLD_MS));
                this.onDue(current.alert);
                return hold;
            }))
            .catch((error) => {
                if (granted) throw error; // onDue 丟的例外：照樣丟出來
                this.lockFailed = true;
                this.claiming.delete(id);
                const current = this._currentDue(id);
                if (current && this._claim(current.alert, current.now)) this.onDue(current.alert);
            });
        return true;
    }

    /**
     * 照現在的提醒與時間，id 這一次還到期的話回傳 { alert, now }（alert 是現在的 Alert 物件），不然回傳 null
     * @private
     */
    _currentDue(id) {
        const now = this.now();
        const alert = ReminderScheduler.due(this.getAlerts(now), now, this.notifiedIds())
            .find((candidate) => ReminderScheduler.idOf(candidate) === id);
        return alert ? { alert, now } : null;
    }

    // ---------- 權限與提示 ----------

    /**
     * @returns {'granted'|'denied'|'default'|'unsupported'} 沒有 Notification、或允許了但 new Notification() 丟過錯
     *     （Android 的 Chrome）是 'unsupported'：到時間只有頁內提示與提示音
     */
    static permission() {
        if (ReminderScheduler._notificationFailed) return 'unsupported';
        return typeof window.Notification === 'function' ? window.Notification.permission : 'unsupported';
    }

    /**
     * 只有 'default' 才真的去問（回傳使用者的答案），其他狀態直接回傳。要在使用者的點擊裡呼叫。
     * 問的時候出錯就回傳目前的狀態，不丟出去：呼叫端不用為了通知問不成而放棄設定提醒。
     * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
     */
    static async requestPermission() {
        const current = ReminderScheduler.permission();
        if (current !== 'default') return current;
        try {
            return await window.Notification.requestPermission();
        } catch (error) {
            return ReminderScheduler.permission();
        }
    }

    /** 在使用者的點擊裡呼叫：建立或 resume() 共用的 AudioContext，之後沒有人在操作時的提示音才放得出來 */
    static unlockSound() {
        try {
            ReminderScheduler._audioContext();
        } catch (error) {
            // 放不出聲音就算了
        }
    }

    /**
     * 提醒到了：每次都在頁面上顯示提示並發出提示音，允許的話再送出系統通知。
     * 三件事各自處理失敗，互不影響，也不丟例外。
     * @param {Object} options
     * @param {string} options.title
     * @param {string} options.body
     * @param {string} options.tag 系統通知的 tag：同一個 tag 的通知會互相取代
     * @param {string} [options.icon]
     */
    static deliver({ title, body, tag, icon }) {
        ReminderScheduler._showAlert(title, body);
        ReminderScheduler._playSound();
        ReminderScheduler._showNotification({ title, body, tag, icon });
    }

    /**
     * 共用的 AudioContext；沒有 AudioContext 就是 null。還沒在跑的話 resume()：
     * 瀏覽器的自動播放限制只有在使用者操作時才解得開。
     * @private
     */
    static _audioContext() {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return null;
        if (!ReminderScheduler._audio) ReminderScheduler._audio = new Context();
        const context = ReminderScheduler._audio;
        if (context.state !== 'running') {
            const resumed = context.resume();
            if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
        }
        return context;
    }

    /**
     * 提示音：兩聲各 0.2 秒的正弦波，淡入淡出；失敗就算了。
     * AudioContext 還沒在跑（重新整理後還沒有人操作過頁面，resume() 要等到使用者操作才會成功）時這次不出聲：
     * 排進暫停中的 AudioContext 的聲音不會丟掉，會等到使用者第一次點擊時才一起響。
     * @private
     */
    static _playSound() {
        try {
            const context = ReminderScheduler._audioContext();
            if (!context || context.state !== 'running') return;
            for (const { frequency, offset } of ReminderScheduler.CONSTANTS.BEEPS) {
                const begin = context.currentTime + offset;
                const oscillator = context.createOscillator();
                const gain = context.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(frequency, begin);
                gain.gain.setValueAtTime(0, begin);
                gain.gain.linearRampToValueAtTime(0.3, begin + 0.01); // 快速淡入
                gain.gain.linearRampToValueAtTime(0.3, begin + 0.15); // 維持音量
                gain.gain.linearRampToValueAtTime(0, begin + 0.2); // 淡出
                oscillator.connect(gain);
                gain.connect(context.destination);
                oscillator.start(begin);
                oscillator.stop(begin + 0.2);
            }
        } catch (error) {
            // 放不出聲音就算了
        }
    }

    /**
     * 頁內提示的容器 div.reminder-alerts（右上角，提示由上往下排）：第一次要顯示提示時才加進 body，之後都放進同一個。
     * 每次都先在頁面上找：容器被拿掉、不在頁面上了就重建一個，不會把提示放進看不見的舊容器。
     * @private
     */
    static _alertStack() {
        let stack = document.body.querySelector('.reminder-alerts');
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'reminder-alerts';
            document.body.appendChild(stack);
        }
        return stack;
    }

    /**
     * 頁內提示：共用的 .toast，放進 _alertStack() 的容器，8 秒後自己收起，點一下馬上收起。
     * 一起到時間的好幾個提醒依送出的順序由上往下排，不疊在同一個位置；各自算 8 秒，一個收起後下面的往上補位。
     * @private
     */
    static _showAlert(title, body) {
        try {
            const toast = document.createElement('div');
            toast.className = 'toast toast-success reminder-alert';
            toast.setAttribute('role', 'status');
            toast.textContent = `${title}\n${body}`;

            let dismissed = false;
            const dismiss = () => {
                if (dismissed) return;
                dismissed = true;
                toast.classList.remove('show');
                window.setTimeout(() => toast.remove(), ReminderScheduler.CONSTANTS.ALERT_FADE_MS);
            };
            toast.addEventListener('click', dismiss);
            ReminderScheduler._alertStack().appendChild(toast);
            // 背景分頁不會畫出下一個畫面（requestAnimationFrame 暫停）：8 秒要等真的顯示之後才開始算，
            // 不然使用者切回來時提醒可能已經不見了
            window.requestAnimationFrame(() => {
                toast.classList.add('show');
                window.setTimeout(dismiss, ReminderScheduler.CONSTANTS.ALERT_SHOW_MS);
            });
        } catch (error) {
            // 頁內提示失敗就算了
        }
    }

    /**
     * 系統通知：權限是 granted 才送。Android 的 Chrome 不讓網頁直接 new Notification：丟錯就記下來，
     * 之後 permission() 回傳 'unsupported'（呼叫端照它寫出不能跳通知的說明），也不再試
     * @private
     */
    static _showNotification({ title, body, tag, icon }) {
        try {
            if (ReminderScheduler.permission() !== 'granted') return;
            const notification = new window.Notification(title, { body, tag, icon });
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
        } catch (error) {
            // 只剩頁內提示與提示音
            ReminderScheduler._notificationFailed = true;
        }
    }
}

window.ReminderScheduler = ReminderScheduler;
