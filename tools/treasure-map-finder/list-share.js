// 分享連結模組：清單變成一條帶 ?maps= 的連結、把貼進來的連結或以前匯出的 JSON 讀回寶圖 id，以及處理完把網址裡的 maps 拿掉。
// 不碰 DOM，只用 URL、URLSearchParams、JSON 與 encodeURIComponent；網址、目錄（catalogue）與清單都從參數帶進來，不讀任何全域
class ListShare {
    // 分享連結裡放寶圖 id 的查詢參數
    static PARAM = 'maps';

    /**
     * 分享連結：目前網址去掉查詢字串與 hash，加上 ?maps= 與寶圖 id（依傳入的順序、逗號分隔）。
     * 只帶寶圖，不帶篩選（grade、zone）與隊伍代號（room）。
     * 每個 id 各自用 encodeURIComponent 編碼，只有分隔用的逗號不編碼：目錄裡的寶圖 id 都是英數字加底線（tm_019），編碼前後一樣；
     * 匯入進來的 id 若含 &、#、%、+、空白，也只會留在 maps 的值裡，不會變成別的參數或 hash，parseText() 讀得回同樣的 id。
     * id 本身含逗號的話，讀的人會把它當成兩個 id（逗號分隔的格式表示不了）
     * @param {string} href - 目前的完整網址，例如 location.href
     * @param {string[]} ids - 寶圖 id，依清單順序
     * @returns {string}
     * @throws {URIError} 某個 id 含不成對的 UTF-16 代理字元時（encodeURIComponent 的限制）
     */
    static buildUrl(href, ids) {
        const url = new URL(href);
        url.search = '';
        url.hash = '';
        return `${url.toString()}?${ListShare.PARAM}=${ids.map(encodeURIComponent).join(',')}`;
    }

    /**
     * 把 maps 參數的值切成寶圖 id：以逗號切開，去掉前後空白、空字串與重複，保留第一次出現的順序
     * @param {?string} value - 例如 URLSearchParams.get('maps')；找不到參數時是 null，當作空的
     * @returns {string[]}
     */
    static parseIds(value) {
        const ids = String(value ?? '').split(',').map(id => id.trim()).filter(Boolean);
        return [...new Set(ids)];
    }

    /**
     * 讀懂貼進來的內容：分享連結（完整網址，或只有 ?maps=… 、maps=… 的查詢字串），或以前「匯出」的 JSON。
     * 去掉頭尾空白後，{ 開頭的只當 JSON 讀，讀不懂也不往連結猜；其他依序當完整網址、查詢字串讀
     * @param {string} text
     * @returns {{kind: 'link', ids: string[]}|{kind: 'json', maps: object[]}|null}
     *   link：有 maps 參數，而且 parseIds() 至少切出一個 id；
     *   json：maps 是非空陣列（每一張對不對，交給 ListManager 驗證）；其他都是 null
     */
    static parseText(text) {
        const trimmed = typeof text === 'string' ? text.trim() : '';

        if (trimmed.startsWith('{')) {
            try {
                const data = JSON.parse(trimmed);
                return Array.isArray(data.maps) && data.maps.length > 0 ? { kind: 'json', maps: data.maps } : null;
            } catch {
                return null;
            }
        }

        let query;
        try {
            query = new URL(trimmed).search;
        } catch {
            // 不是完整網址：只有 ? 開頭或 maps= 開頭的查詢字串才讀
            if (!trimmed.startsWith('?') && !trimmed.startsWith(`${ListShare.PARAM}=`)) return null;
            query = trimmed;
        }
        // URLSearchParams 會去掉開頭的 ?，也會把 %2C 還原成逗號
        const ids = ListShare.parseIds(new URLSearchParams(query).get(ListShare.PARAM));
        return ids.length > 0 ? { kind: 'link', ids } : null;
    }

    /**
     * 把網址裡的 maps 拿掉，其他參數（grade、zone、room）與 hash 保留；載入時處理完用 history.replaceState() 換上。
     * 逗號不編碼（同 FilterManager.buildUrl()），沒有參數了就不留 ?。
     * 整個查詢字串會重新編碼，寫法可能跟著變、意思不變
     * @param {string} href - 目前的完整網址，例如 location.href
     * @returns {string}
     */
    static stripParam(href) {
        const url = new URL(href);
        url.searchParams.delete(ListShare.PARAM);
        // URLSearchParams 會把逗號編成 %2C；逗號在查詢字串裡本來就合法，改回來網址比較好讀
        url.search = url.searchParams.toString().replace(/%2C/gi, ',');
        return url.toString();
    }

    /**
     * 把寶圖 id 對到目錄裡的寶圖
     * @param {string[]} ids - parseIds() 的結果
     * @param {Map<string, object>} catalogue - 寶圖 id -> 目錄裡的那一張
     * @returns {{maps: object[], missing: number}} maps 是目錄裡的那份物件本身，順序照 ids；目錄裡找不到的 id 只算進 missing
     */
    static resolveIds(ids, catalogue) {
        const maps = [];
        let missing = 0;
        for (const id of ids) {
            const map = catalogue.get(id);
            if (map) {
                maps.push(map);
            } else {
                missing += 1;
            }
        }
        return { maps, missing };
    }

    /**
     * 套用之後清單會有幾張，匯入與分享對話框的說明文字用
     * @param {string[]} currentIds - 目前清單裡的寶圖 id
     * @param {string[]} incomingIds - 要加進來或取代的寶圖 id；有重複的只算一張
     * @param {boolean} merge - true 是加進清單，false 是取代清單
     * @returns {{total: number, duplicates: number}}
     *   加進：total 是兩邊的聯集，duplicates 是本來就在清單裡的張數；取代：total 是 incomingIds 去重後的張數，duplicates 是 0
     */
    static projectedCount(currentIds, incomingIds, merge) {
        const current = new Set(currentIds);
        const incoming = new Set(incomingIds);
        if (!merge) return { total: incoming.size, duplicates: 0 };
        let duplicates = 0;
        for (const id of incoming) {
            if (current.has(id)) duplicates += 1;
        }
        return { total: current.size + incoming.size - duplicates, duplicates };
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) module.exports = ListShare;
