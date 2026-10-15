// 路線進度模組：路線的站序與標了「完成」的寶圖，只記在這台裝置的 localStorage，不同步給隊友。
// 不碰 DOM；storage 與時鐘都從外面傳進來
class RouteProgress {
    // localStorage 的 key，內容是 { order, done, updatedAt }
    static STORAGE_KEY = 'ff14tw_treasure_route_progress';

    // 進度只留 12 小時：寶圖 id 就是地點，隔天再來若帶著昨天的完成記號，同一個地點的新寶圖會被當成已完成而跳過
    static MAX_AGE_MS = 12 * 60 * 60 * 1000;

    /**
     * 建立時讀一次 storage，之後以記憶體為準
     * @param {Storage|null} storage - 取不到或不能用時傳 null，進度只留在記憶體裡
     * @param {{now?: function(): number}} [options] - now 回傳目前時間（毫秒），測試用
     */
    constructor(storage, { now = () => Date.now() } = {}) {
        this.storage = storage;
        this.now = now;
        this.state = this.readStored();
    }

    /**
     * 從 storage 讀出進度
     * @returns {{order: string[], done: string[], updatedAt: string}|null} 讀不到、JSON 壞掉或形狀不對都是 null
     */
    readStored() {
        try {
            const raw = this.storage?.getItem(RouteProgress.STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            const isList = value => Array.isArray(value) && value.every(item => typeof item === 'string');
            if (!data || !isList(data.order) || !isList(data.done)) return null;
            // 看不懂的時間 Date.parse 是 NaN，「超過 12 小時」永遠不成立，那份進度會一直留著，所以一併當作沒有
            if (typeof data.updatedAt !== 'string' || Number.isNaN(Date.parse(data.updatedAt))) return null;
            return { order: [...data.order], done: [...data.done], updatedAt: data.updatedAt };
        } catch {
            return null;
        }
    }

    /**
     * 取得進度；最後一次存已經超過 12 小時就先清掉（剛好 12 小時還算有效）
     * @returns {{order: string[], done: string[], updatedAt: string}|null} 沒有或已過期是 null。陣列是複本，改動它不會動到記憶體裡的進度
     */
    get() {
        if (!this.state) return null;
        if (this.now() - Date.parse(this.state.updatedAt) > RouteProgress.MAX_AGE_MS) {
            this.clear();
            return null;
        }
        return { order: [...this.state.order], done: [...this.state.done], updatedAt: this.state.updatedAt };
    }

    /**
     * 存進記憶體並寫進 storage，updatedAt 是存的當下。寫不進去（封鎖網站資料、空間滿了）就只留在記憶體，不丟例外
     * @param {{order: string[], done: string[]}} progress
     */
    save({ order, done }) {
        this.state = { order: [...order], done: [...done], updatedAt: new Date(this.now()).toISOString() };
        try {
            this.storage?.setItem(RouteProgress.STORAGE_KEY, JSON.stringify(this.state));
        } catch { /* 記不住只是重新整理後要重來，不影響這次使用 */ }
    }

    /**
     * 記憶體與 storage 都清掉
     */
    clear() {
        this.state = null;
        try {
            this.storage?.removeItem(RouteProgress.STORAGE_KEY);
        } catch { /* 記憶體已經清掉，storage 被封鎖清不掉也不影響這次使用 */ }
    }

    /**
     * 把存著的進度對齊目前的清單。純函式，不碰 storage：只有 changed 為 true 才需要 save()，
     * 打開路線頁才不會延長 12 小時。
     * 整份重來（站序依第一次排序、沒有完成）的情況：沒有存著的進度、存著的站一個都不在清單裡、
     * 或所有站都完成了而且清單和存著的站不是同一組寶圖（上一趟跑完了，算新的一趟）。
     * 其他情況站序交給 mergeOrder，完成記號只留清單裡還有的，順序照 saved.done
     * @param {{order: string[], done: string[]}|null} saved - get() 的結果
     * @param {string[]} listIds - 目前清單的寶圖 id
     * @param {{firstOrder: function(): string[], mergeOrder: function(string[]): string[]}} orderers - 站序怎麼排由呼叫端決定
     * @returns {{order: string[], done: string[], changed: boolean, restarted: boolean}} changed：order 或 done 和 saved 逐項比有不同；
     *   restarted：是上面那幾種整份重來，不是對齊存著的進度
     */
    static sync(saved, listIds, { firstOrder, mergeOrder }) {
        const inList = new Set(listIds);
        const restart = () => ({ order: firstOrder(), done: [], changed: true, restarted: true });

        if (!saved || !saved.order.some(id => inList.has(id))) return restart();

        const done = new Set(saved.done);
        const savedIds = new Set(saved.order);
        const allDone = saved.order.every(id => done.has(id));
        const sameIds = savedIds.size === inList.size && [...inList].every(id => savedIds.has(id));
        if (allDone && !sameIds) return restart();

        const order = mergeOrder([...saved.order]);
        const keptDone = saved.done.filter(id => inList.has(id));
        const same = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
        return { order, done: keptDone, changed: !same(order, saved.order) || !same(keptDone, saved.done), restarted: false };
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) module.exports = RouteProgress;
