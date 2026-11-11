/**
 * 角色卡產生器的輸出：把畫好的 canvas 變成 PNG，再下載、分享或複製；判斷是不是 LINE 之類的內建瀏覽器。
 * 凍結的純函式：不碰任何全域（document、navigator、URL、Blob、File、setTimeout 都不直接用），瀏覽器的東西都從參數來：
 * nav 是 navigator、win 是 window（URL、setTimeout 與 ClipboardItem 從這裡拿）、doc 是 document（win 是 doc.defaultView），
 * 頁面傳真的，測試傳替身。所有函式都不靠 this，不改傳進來的東西。
 *
 * - PNG_TYPE：'image/png'
 * - REVOKE_DELAY_MS：下載用的 object URL 點完之後等多久才撤銷（至少 1 秒：有的瀏覽器網址一撤銷就取消這次下載）
 * - fileName(name)：下載的檔名 `ff14-<名字>.png`。名字前後的空白去掉，\ / : * ? " < > | 與控制字元每個換成 -，
 *   中間的空白留著；空的（或不是字串）是 `ff14-character-card.png`
 * - toBlob(canvas)：Promise<Blob>，canvas.toBlob 的 PNG。轉不出來（callback 收到 null、被汙染的 canvas 丟例外）是 rejected
 * - download(blob, fileName, doc)：建 object URL，把 <a download> 接到 doc.body（Firefox 要接著才有用）、點、拿掉，
 *   過一陣子（REVOKE_DELAY_MS，用 doc.defaultView.setTimeout）才撤銷網址。點的時候丟的例外照樣先收尾（拿掉連結、排好撤銷）再往外傳
 * - canShareFiles(nav, file)：這個瀏覽器能不能用 navigator.share 傳這個檔案（要有 share 與 canShare，canShare 說可以，丟例外算不行）
 * - share(nav, file, title)：Promise<'shared' | 'cancelled' | 'blocked' | 'failed'>。使用者取消（AbortError）是 cancelled；
 *   NotAllowedError 是 blocked：瀏覽器只在點擊之後的幾秒內收 navigator.share，先等字型、等圖太久，點擊的使用者手勢就過期了
 *   （這裡不准分享時也是這個錯）；其他錯誤都是 failed。nav.share 在呼叫的當下就呼叫（不先 await 別的）：瀏覽器要求在使用者手勢裡
 * - canCopy(nav, win)：有 nav.clipboard.write 與 win.ClipboardItem 才是 true
 * - copy(nav, win, blob)：Promise<boolean>。blob 是 Blob，或之後才會有 Blob 的 Promise：ClipboardItem 與 clipboard.write 都在呼叫的當下
 *   就建好、呼叫（Safari 要求在使用者手勢裡，所以不能先等圖產生出來再寫），圖晚一點才好沒關係。成功是 true，任何失敗（write 被拒絕、
 *   圖的 Promise 被拒絕、ClipboardItem 建不起來、沒有剪貼簿）都是 false，不丟
 * - inAppBrowser(userAgent)：'line'、'facebook'、'instagram'、'discord'，一般的瀏覽器（或不是字串）是 null
 * - externalUrl(href)：加上 openExternalBrowser=1（LINE 看到它會改用手機預設的瀏覽器打開）；原本的參數與 # 後面的一切照舊，
 *   已經有 openExternalBrowser 就改成 1，只留一個
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 */
const CardExport = (() => {
    'use strict';

    const PNG_TYPE = 'image/png';
    const DEFAULT_FILE_NAME = 'ff14-character-card.png';
    // 30 秒：瀏覽器是在 click() 之後才（非同步）去讀網址，太早撤銷會讓有的瀏覽器取消這次下載；一張 PNG 只占幾 MB，多留一會兒不要緊
    const REVOKE_DELAY_MS = 30000;
    // 不能當檔名的字：Windows 不收的 \ / : * ? " < > |，加上所有控制字元（C0、DEL、C1）
    const NOT_FOR_FILE_NAME = /[\\/:*?"<>|\p{Cc}]/gu;
    const PARAM = 'openExternalBrowser';
    // 內建瀏覽器的 User-Agent：照順序比對，第一個符合的算
    const IN_APP = [
        ['line', /\bLine\//],
        ['facebook', /FBAN|FBAV/],
        ['instagram', /Instagram/],
        ['discord', /Discord/]
    ];

    function fileName(name) {
        const text = typeof name === 'string' ? name.trim().replace(NOT_FOR_FILE_NAME, '-') : '';
        return text === '' ? DEFAULT_FILE_NAME : `ff14-${text}.png`;
    }

    function toBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('卡片轉不成 PNG'))), PNG_TYPE);
        });
    }

    function download(blob, name, doc) {
        const win = doc.defaultView;
        const url = win.URL.createObjectURL(blob);
        const link = doc.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', name);
        doc.body.appendChild(link);
        try {
            link.click();
        } finally {
            link.remove();
            win.setTimeout(() => win.URL.revokeObjectURL(url), REVOKE_DELAY_MS);
        }
    }

    function canShareFiles(nav, file) {
        try {
            return Boolean(nav) && typeof nav.share === 'function' && typeof nav.canShare === 'function' && Boolean(nav.canShare({ files: [file] }));
        } catch (error) {
            return false;
        }
    }

    async function share(nav, file, title) {
        try {
            await nav.share({ files: [file], title });
            return 'shared';
        } catch (error) {
            if (error && error.name === 'AbortError') return 'cancelled';
            if (error && error.name === 'NotAllowedError') return 'blocked';
            return 'failed';
        }
    }

    function canCopy(nav, win) {
        return Boolean(nav && nav.clipboard && typeof nav.clipboard.write === 'function' && win && typeof win.ClipboardItem === 'function');
    }

    // async 函式在第一個 await 之前是同步執行的：ClipboardItem 與 clipboard.write 都在呼叫的當下完成（還在使用者手勢裡）
    async function copy(nav, win, blob) {
        try {
            const item = new win.ClipboardItem({ [PNG_TYPE]: blob });
            await nav.clipboard.write([item]);
            return true;
        } catch (error) {
            // 圖的 Promise 之後才被拒絕、卻沒有人接（ClipboardItem 建不起來，write 沒呼叫）時，不要留下沒人處理的拒絕
            Promise.resolve(blob).catch(() => {});
            return false;
        }
    }

    function inAppBrowser(userAgent) {
        if (typeof userAgent !== 'string') return null;
        const found = IN_APP.find(([, pattern]) => pattern.test(userAgent));
        return found ? found[0] : null;
    }

    function externalUrl(href) {
        const text = typeof href === 'string' ? href : '';
        const hashAt = text.indexOf('#');
        const hash = hashAt === -1 ? '' : text.slice(hashAt);
        const rest = hashAt === -1 ? text : text.slice(0, hashAt);
        const queryAt = rest.indexOf('?');
        const path = queryAt === -1 ? rest : rest.slice(0, queryAt);
        const query = queryAt === -1 ? '' : rest.slice(queryAt + 1);
        const parts = [];
        let found = false;
        for (const part of query.split('&')) {
            if (part === '') continue;
            if (part.split('=')[0] === PARAM) {
                // 原本的位置改成 1；重複的只留第一個
                if (!found) parts.push(`${PARAM}=1`);
                found = true;
            } else {
                parts.push(part);
            }
        }
        if (!found) parts.push(`${PARAM}=1`);
        return `${path}?${parts.join('&')}${hash}`;
    }

    return Object.freeze({ PNG_TYPE, REVOKE_DELAY_MS, fileName, toBlob, download, canShareFiles, share, canCopy, copy, inAppBrowser, externalUrl });
})();

// Export for use in other modules
window.CardExport = CardExport;
