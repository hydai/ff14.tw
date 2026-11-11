const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const EXPORT_FILE = 'tools/character-card/card-export.js';

// 這支腳本把東西掛在 window 上，所以讓 window 指向 context 本身（同 character-card-image.test.js）。
// 每個 context 各載一份；沒有 document、URL、Blob、setTimeout：nav、win、doc 都靠測試傳進去的替身，模組不碰任何全域
function loadContext(files) {
    const context = vm.createContext({});
    context.window = context;
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    }
    return context;
}

const context = loadContext([EXPORT_FILE]);
const { CardExport } = context;
// 故意用解構取出：頁面不一定用 CardExport.xxx() 的寫法呼叫，這些函式不能靠 this
const { fileName, toBlob, download, canShareFiles, share, canCopy, copy, inAppBrowser, externalUrl } = CardExport;

const PNG = 'image/png';
const DEFAULT_NAME = 'ff14-character-card.png';

// ---------- 模組 ----------

test('CardExport：只掛一個全域、模組凍結、只有規定的函式與兩個常數', () => {
    assert.equal(Object.isFrozen(CardExport), true);
    assert.deepEqual(Object.keys(CardExport).sort(), [
        'PNG_TYPE', 'REVOKE_DELAY_MS', 'canCopy', 'canShareFiles', 'copy', 'download', 'externalUrl', 'fileName', 'inAppBrowser', 'share', 'toBlob'
    ]);
    for (const name of ['canCopy', 'canShareFiles', 'copy', 'download', 'externalUrl', 'fileName', 'inAppBrowser', 'share', 'toBlob']) {
        assert.equal(typeof CardExport[name], 'function', name);
    }
    assert.equal(CardExport.PNG_TYPE, PNG);
    // 下載的連結撤銷得太早，有的瀏覽器會取消下載：至少等 1 秒
    assert.ok(CardExport.REVOKE_DELAY_MS >= 1000, `REVOKE_DELAY_MS ${CardExport.REVOKE_DELAY_MS} 至少要 1000`);

    // 只掛 CardExport 一個全域：常數與小函式都收在立即執行的函式裡，不會和頁面其他腳本的名稱撞在一起；
    // 這個 context 裡沒有 document、URL、Blob、File、setTimeout，函式照樣能用，所以不碰任何全域（nav、win、doc 都從參數來）
    const alone = loadContext([EXPORT_FILE]);
    assert.deepEqual(Object.keys(alone).filter((name) => name !== 'window'), ['CardExport']);
    for (const name of ['document', 'navigator', 'URL', 'Blob', 'File', 'setTimeout', 'ClipboardItem']) assert.equal(alone[name], undefined, name);
    assert.equal(fileName('Luna'), 'ff14-Luna.png');
});

// ---------- fileName ----------

test('fileName：ff14-<名字>.png，名字裡的空白與一般的字照舊', () => {
    assert.equal(fileName('Luna Starweaver'), 'ff14-Luna Starweaver.png');
    assert.equal(fileName('月光 Luna'), 'ff14-月光 Luna.png');
    assert.equal(fileName("Y'shtola Rhul"), "ff14-Y'shtola Rhul.png");
    assert.equal(fileName('Luna-Star_weaver.v2'), 'ff14-Luna-Star_weaver.v2.png');
    assert.equal(fileName('𠮷野家'), 'ff14-𠮷野家.png', '代理對照舊');
});

test('fileName：前後的空白去掉（含全形空白與不換行空白），中間的留著', () => {
    assert.equal(fileName('  Luna Star  '), 'ff14-Luna Star.png');
    assert.equal(fileName('\u3000Luna\u00a0'), 'ff14-Luna.png');
    assert.equal(fileName('\t Luna \n'), 'ff14-Luna.png');
    assert.equal(fileName('Luna   Star'), 'ff14-Luna   Star.png');
});

test('fileName：\\ / : * ? " < > | 與控制字元都換成 -，一個字換一個 -', () => {
    for (const bad of ['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        assert.equal(fileName(`a${bad}b`), 'ff14-a-b.png', `${JSON.stringify(bad)} 要換掉`);
    }
    assert.equal(fileName('a\\/:*?"<>|b'), 'ff14-a---------b.png', '9 個字換成 9 個 -');
    assert.equal(fileName('Lu/na:Star'), 'ff14-Lu-na-Star.png');
    // 控制字元：C0（NUL、換行以外的 tab 在中間也是）、DEL、C1
    assert.equal(fileName('a\u0000b'), 'ff14-a-b.png');
    assert.equal(fileName('a\tb'), 'ff14-a-b.png');
    assert.equal(fileName('a\nb'), 'ff14-a-b.png');
    assert.equal(fileName('a\u007fb'), 'ff14-a-b.png');
    assert.equal(fileName('a\u0085b'), 'ff14-a-b.png');
    assert.equal(fileName('a\u009fb'), 'ff14-a-b.png');
    // 前後的空白先去掉，所以前後的 tab、換行不會變成 -；NUL 不算空白，會換成 -
    assert.equal(fileName('\tLuna\n'), 'ff14-Luna.png');
    assert.equal(fileName('\u0000Luna'), 'ff14--Luna.png');
    // 不會留下路徑的意思：結果裡沒有任何不能當檔名的字
    for (const text of ['../../etc/passwd', 'C:\\Users\\luna', '<script>alert(1)</script>', 'a|b?c*d']) {
        assert.doesNotMatch(fileName(text), /[\\/:*?"<>|\u0000-\u001f]/u, text);
    }
    assert.equal(fileName('../../etc/passwd'), 'ff14-..-..-etc-passwd.png');
});

test('fileName：空的、只有空白、不是字串的名字用 ff14-character-card.png', () => {
    for (const empty of ['', ' ', '   ', '\t\n', '\u3000', '\u00a0']) assert.equal(fileName(empty), DEFAULT_NAME, JSON.stringify(empty));
    for (const notText of [undefined, null, 0, 123, {}, [], ['Luna'], true]) assert.equal(fileName(notText), DEFAULT_NAME, String(notText));
    assert.equal(fileName(), DEFAULT_NAME);
});

// ---------- toBlob ----------

test('toBlob：照 PNG 向 canvas 要 Blob；callback 收到 null（轉不出來）就 reject；canvas 沒有 toBlob 也 reject', async () => {
    const requests = [];
    const blob = { size: 3, type: PNG };
    const canvas = {
        toBlob(callback, type, quality) {
            requests.push({ type, quality });
            // 瀏覽器是非同步呼叫 callback
            Promise.resolve().then(() => callback(blob));
        }
    };
    const promise = toBlob(canvas);
    assert.equal(typeof promise.then, 'function');
    assert.equal(await promise, blob);
    assert.deepEqual(requests, [{ type: PNG, quality: undefined }], '只要 PNG，不傳品質');

    // 轉不出來（canvas 太大、被汙染……）：callback(null)
    const broken = { toBlob: (callback) => Promise.resolve().then(() => callback(null)) };
    await assert.rejects(toBlob(broken), (error) => Object.prototype.toString.call(error) === '[object Error]');
    // 同步丟例外（被汙染的 canvas 會丟 SecurityError）也變成 reject，不是同步丟出來
    const tainted = { toBlob() { throw Object.assign(new Error('Tainted canvases may not be exported.'), { name: 'SecurityError' }); } };
    let promiseOfTainted;
    assert.doesNotThrow(() => { promiseOfTainted = toBlob(tainted); });
    await assert.rejects(promiseOfTainted, { name: 'SecurityError' });
    // vm 裡丟出來的 TypeError 是另一個 realm 的，instanceof 比不出來：看名字
    await assert.rejects(toBlob({}), { name: 'TypeError' });
    await assert.rejects(toBlob(null), { name: 'TypeError' });
});

// ---------- download ----------

// 假的 document：依序記下發生的事。win 是 doc.defaultView（URL 與 setTimeout 從這裡來，模組不碰全域）
function stubDocument({ clickThrows = false } = {}) {
    const events = [];
    const timers = [];
    const urls = [];
    const win = {
        URL: {
            createObjectURL: (blob) => {
                const url = `blob:https://ff14.tw/${urls.length + 1}`;
                urls.push({ url, blob });
                events.push({ op: 'create', url });
                return url;
            },
            revokeObjectURL: (url) => events.push({ op: 'revoke', url })
        },
        setTimeout: (callback, delay) => {
            timers.push({ callback, delay });
            events.push({ op: 'timer', delay });
            return timers.length;
        }
    };
    const attached = new Set();
    const body = {
        appendChild: (node) => {
            attached.add(node);
            events.push({ op: 'append', tag: node.tag });
            return node;
        }
    };
    const doc = {
        defaultView: win,
        body,
        createElement: (tag) => {
            const attrs = new Map();
            const link = {
                tag,
                setAttribute: (name, value) => attrs.set(name, String(value)),
                getAttribute: (name) => attrs.get(name) ?? null,
                hasAttribute: (name) => attrs.has(name),
                click: () => {
                    events.push({ op: 'click', attached: attached.has(link), download: attrs.get('download'), href: attrs.get('href') });
                    if (clickThrows) throw new Error('click failed');
                },
                remove: () => {
                    attached.delete(link);
                    events.push({ op: 'remove' });
                }
            };
            return link;
        }
    };
    return { doc, win, events, timers, urls, attached };
}

test('download：<a download> 先接到 body 再點（Firefox 要接著才有用）、點完拿掉；object URL 不在同一個 tick 撤銷，等一下才撤', () => {
    const { doc, events, timers, urls, attached } = stubDocument();
    const blob = { size: 10, type: PNG };
    const result = download(blob, 'ff14-Luna Starweaver.png', doc);
    assert.equal(result, undefined);
    assert.equal(urls.length, 1);
    assert.equal(urls[0].blob, blob);
    const { url } = urls[0];
    // 順序：建網址 → 接到 body → 點 → 拿掉 → 排撤銷；撤銷不在同一個 tick（有的瀏覽器網址一撤銷就取消這次下載）
    assert.deepEqual(events.map((event) => event.op), ['create', 'append', 'click', 'remove', 'timer']);
    assert.deepEqual(events[1], { op: 'append', tag: 'a' });
    assert.deepEqual(events[2], { op: 'click', attached: true, download: 'ff14-Luna Starweaver.png', href: url });
    assert.equal(attached.size, 0, '點完拿掉了，不留在 body 上');
    assert.ok(!events.some((event) => event.op === 'revoke'), '還沒撤銷');
    assert.equal(timers.length, 1);
    assert.ok(timers[0].delay >= 1000, `延遲 ${timers[0].delay} 毫秒，至少 1000`);
    assert.equal(timers[0].delay, CardExport.REVOKE_DELAY_MS);
    // 時間到才撤銷同一個網址
    timers[0].callback();
    assert.deepEqual(events.at(-1), { op: 'revoke', url });
    assert.equal(events.filter((event) => event.op === 'revoke').length, 1);
});

test('download：點的時候丟例外也照樣拿掉連結、排撤銷，例外往外傳（頁面要告訴使用者）', () => {
    const { doc, events, timers, attached } = stubDocument({ clickThrows: true });
    assert.throws(() => download({}, 'a.png', doc), /click failed/);
    assert.equal(attached.size, 0);
    assert.deepEqual(events.map((event) => event.op), ['create', 'append', 'click', 'remove', 'timer']);
    assert.equal(timers.length, 1);
});

test('download：每次各建一個連結與網址，彼此獨立', () => {
    const { doc, events, timers, urls } = stubDocument();
    download({ n: 1 }, 'one.png', doc);
    download({ n: 2 }, 'two.png', doc);
    assert.equal(urls.length, 2);
    assert.notEqual(urls[0].url, urls[1].url);
    assert.deepEqual(events.filter((event) => event.op === 'click').map((event) => [event.download, event.href]), [['one.png', urls[0].url], ['two.png', urls[1].url]]);
    assert.equal(timers.length, 2);
});

// ---------- canShareFiles、share ----------

const FILE = { name: 'ff14-Luna.png', type: PNG, size: 5 };

test('canShareFiles：nav.canShare({ files: [file] }) 為真而且有 nav.share 才是 true；沒有、丟例外、不是物件都是 false', () => {
    const calls = [];
    const nav = { share: async () => {}, canShare: (data) => { calls.push(data); return true; } };
    assert.equal(canShareFiles(nav, FILE), true);
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0]), ['files']);
    assert.equal(calls[0].files.length, 1);
    assert.equal(calls[0].files[0], FILE);

    assert.equal(canShareFiles({ share: async () => {}, canShare: () => false }, FILE), false, 'canShare 說不行');
    assert.equal(canShareFiles({ share: async () => {} }, FILE), false, '沒有 canShare（只能分享文字網址的瀏覽器）');
    assert.equal(canShareFiles({ canShare: () => true }, FILE), false, '沒有 share');
    assert.equal(canShareFiles({ share: async () => {}, canShare: () => { throw new TypeError('x'); } }, FILE), false, 'canShare 丟例外');
    assert.equal(canShareFiles({}, FILE), false);
    assert.equal(canShareFiles(undefined, FILE), false);
    assert.equal(canShareFiles(null, FILE), false);
    assert.equal(canShareFiles({ share: async () => {}, canShare: () => 1 }, FILE), true, '真值就算數，回傳的一律是布林');
    assert.equal(canShareFiles({ share: async () => {}, canShare: () => undefined }, FILE), false);
});

test('share：成功是 shared；AbortError（使用者取消）是 cancelled；NotAllowedError（點擊的使用者手勢過期了，或這裡不准分享）是 blocked；其他錯誤與沒有 share 是 failed；傳的是 { files: [file], title }', async () => {
    const calls = [];
    const ok = { share: async (data) => { calls.push(data); } };
    assert.equal(await share(ok, FILE, 'Luna Starweaver'), 'shared');
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0]).sort(), ['files', 'title']);
    assert.equal(calls[0].files.length, 1);
    assert.equal(calls[0].files[0], FILE);
    assert.equal(calls[0].title, 'Luna Starweaver');

    const cancelled = { share: async () => { throw Object.assign(new Error('Share canceled'), { name: 'AbortError' }); } };
    assert.equal(await share(cancelled, FILE, 'x'), 'cancelled');
    // 瀏覽器只在點擊之後的幾秒內收 navigator.share（先等字型、等圖太久就過期了），過期或這裡不准分享時丟 NotAllowedError：
    // 頁面靠 blocked 改開大圖，讓使用者在大圖裡再按一次分享
    const denied = { share: async () => { throw Object.assign(new Error('not allowed'), { name: 'NotAllowedError' }); } };
    assert.equal(await share(denied, FILE, 'x'), 'blocked');
    const deniedSync = { share() { throw Object.assign(new Error('Must be handling a user gesture'), { name: 'NotAllowedError' }); } };
    assert.equal(await share(deniedSync, FILE, 'x'), 'blocked', '同步丟出來的 NotAllowedError 也是');
    const busy = { share: async () => { throw Object.assign(new Error('already sharing'), { name: 'InvalidStateError' }); } };
    assert.equal(await share(busy, FILE, 'x'), 'failed');
    const broken = { share: async () => { throw Object.assign(new Error('share target failed'), { name: 'DataError' }); } };
    assert.equal(await share(broken, FILE, 'x'), 'failed');
    // 同步丟出來的例外（TypeError：資料不合格）也是 failed，不是丟出去；丟的不是 Error 也一樣
    const sync = { share() { throw new TypeError('bad data'); } };
    assert.equal(await share(sync, FILE, 'x'), 'failed');
    const weird = { share: () => Promise.reject(undefined) };
    assert.equal(await share(weird, FILE, 'x'), 'failed');
    assert.equal(await share({}, FILE, 'x'), 'failed');
    assert.equal(await share(null, FILE, 'x'), 'failed');
});

test('share：navigator.share 在呼叫的當下就被呼叫（不先 await 別的），瀏覽器要求在使用者手勢裡', () => {
    const calls = [];
    const nav = { share: (data) => { calls.push(data); return new Promise(() => {}); } };
    share(nav, FILE, 'x');
    assert.equal(calls.length, 1, '同步呼叫');
});

// ---------- canCopy、copy ----------

class FakeClipboardItem {
    constructor(data) {
        this.data = data;
    }
}

test('canCopy：要有 nav.clipboard.write 與 win.ClipboardItem 才是 true；少了任何一個都是 false', () => {
    const nav = { clipboard: { write: async () => {} } };
    const win = { ClipboardItem: FakeClipboardItem };
    assert.equal(canCopy(nav, win), true);
    assert.equal(canCopy(nav, {}), false, '沒有 ClipboardItem（Firefox 沒開旗標時）');
    assert.equal(canCopy(nav, { ClipboardItem: undefined }), false);
    assert.equal(canCopy({}, win), false, '沒有 clipboard');
    assert.equal(canCopy({ clipboard: {} }, win), false, '沒有 write（只有 writeText 的舊瀏覽器）');
    assert.equal(canCopy({ clipboard: { writeText: async () => {} } }, win), false);
    assert.equal(canCopy(undefined, win), false);
    assert.equal(canCopy(nav, undefined), false);
    assert.equal(canCopy(null, null), false);
    assert.equal(canCopy(nav, { ClipboardItem: {} }), false, 'ClipboardItem 不是建構函式');
});

// 假的剪貼簿：write() 把 items 記在 calls（呼叫的當下），再像瀏覽器一樣等每個 ClipboardItem 的內容（Blob 或之後才有的 Promise<Blob>）
function stubClipboard({ rejectWrite = false } = {}) {
    const calls = [];
    const written = [];
    const nav = {
        clipboard: {
            write: async (items) => {
                calls.push(items);
                if (rejectWrite) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
                written.push(await Promise.all(items.map(async (item) => ({ [PNG]: await item.data[PNG] }))));
            }
        }
    };
    return { nav, win: { ClipboardItem: FakeClipboardItem }, calls, written };
}

test('copy：收 Blob；用 { "image/png": blob } 建一個 ClipboardItem 寫進去，成功回傳 true', async () => {
    const { nav, win, calls, written } = stubClipboard();
    const blob = { size: 4, type: PNG };
    assert.equal(await copy(nav, win, blob), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].length, 1);
    assert.ok(calls[0][0] instanceof FakeClipboardItem);
    assert.deepEqual(Object.keys(calls[0][0].data), [PNG]);
    assert.equal(calls[0][0].data[PNG], blob);
    assert.equal(written[0][0][PNG], blob);
});

test('copy：收 Promise<Blob>；ClipboardItem 與 clipboard.write 都在呼叫的當下就建好、呼叫（Safari 要求在使用者手勢裡），圖晚一點才好也行', async () => {
    const { nav, win, calls, written } = stubClipboard();
    const blob = { size: 4, type: PNG };
    let resolveBlob;
    const pending = new Promise((resolve) => { resolveBlob = resolve; });
    const result = copy(nav, win, pending);
    // 還沒有任何 await 回來：write 已經呼叫了，ClipboardItem 裡放的就是還沒好的 Promise
    assert.equal(calls.length, 1, '同步呼叫 clipboard.write');
    assert.equal(calls[0][0].data[PNG], pending, '放進 ClipboardItem 的就是那個 Promise，不是等它好了才建');
    assert.equal(written.length, 0, '圖還沒好，還沒寫進去');
    resolveBlob(blob);
    assert.equal(await result, true);
    assert.equal(written[0][0][PNG], blob);
});

test('copy：失敗一律回傳 false，不丟：write 被拒絕、圖的 Promise 被拒絕、ClipboardItem 建不起來、沒有 clipboard', async () => {
    // 沒有人處理的拒絕不能留下：Node 會讓整個測試行程失敗，瀏覽器的 console 會印 Uncaught (in promise)
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
        const denied = stubClipboard({ rejectWrite: true });
        assert.equal(await copy(denied.nav, denied.win, { size: 1 }), false, 'write 被拒絕（沒給權限）');
        assert.equal(denied.calls.length, 1);

        // 圖的 Promise 被拒絕（toBlob 失敗）：write 會等它，所以也被拒絕
        const broken = stubClipboard();
        assert.equal(await copy(broken.nav, broken.win, Promise.reject(new Error('toBlob failed'))), false);
        assert.equal(broken.calls.length, 1);

        // ClipboardItem 建不起來（瀏覽器不收這個格式時丟 TypeError）：write 根本沒呼叫，圖的 Promise 之後被拒絕也不能變成沒人處理的拒絕
        const refuses = stubClipboard();
        const win = { ClipboardItem: class { constructor() { throw new TypeError('type not supported'); } } };
        let rejectBlob;
        const late = new Promise((resolve, reject) => { rejectBlob = reject; });
        const result = copy(refuses.nav, win, late);
        rejectBlob(new Error('late failure'));
        assert.equal(await result, false);
        assert.equal(refuses.calls.length, 0);

        // write 同步丟例外
        const throws = { clipboard: { write() { throw new Error('boom'); } } };
        assert.equal(await copy(throws, { ClipboardItem: FakeClipboardItem }, { size: 1 }), false);
        // 沒有 clipboard、沒有 ClipboardItem
        assert.equal(await copy({}, { ClipboardItem: FakeClipboardItem }, { size: 1 }), false);
        assert.equal(await copy(refuses.nav, {}, { size: 1 }), false);
        assert.equal(await copy(undefined, undefined, { size: 1 }), false);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(unhandled, [], '沒有留下沒人處理的拒絕');
    } finally {
        process.off('unhandledRejection', onUnhandled);
    }
});

// ---------- inAppBrowser ----------

test('inAppBrowser：LINE、Facebook、Instagram、Discord 的內建瀏覽器；一般的 Safari、Chrome、Firefox 與不是字串的是 null', () => {
    const cases = [
        // LINE（iOS 與 Android）
        ['line', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.8.0'],
        ['line', 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240505.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 Line/14.8.0/IAB'],
        // Facebook 與 Messenger（FBAN／FBAV）
        ['facebook', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.37.108;FBBV/569787347;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]'],
        ['facebook', 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240505.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.43.109;]'],
        ['facebook', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 [FBAN/Orca-Android;FBAV/450.0.0.0.0;]'],
        // Instagram
        ['instagram', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.34.105 (iPhone14,5; iOS 17_5; en_US; en-US; scale=3.00; 1170x2532; 604247234)'],
        ['instagram', 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240505.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 Instagram 330.0.0.40.110 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; en_US; 604247234)'],
        // Discord
        ['discord', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Discord/260.0'],
        ['discord', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 Discord/245.17 - Android'],
        // 一般的瀏覽器
        [null, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'],
        [null, 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36'],
        [null, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'],
        [null, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0'],
        [null, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'],
        // 名字裡有 line 字樣但不是 LINE（要有 Line/ 這個斜線，大小寫要對）
        [null, 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Baseline/1.0 Online/2.0 line/3.0'],
        [null, ''],
        [null, 'Line']
    ];
    for (const [expected, userAgent] of cases) assert.equal(inAppBrowser(userAgent), expected, userAgent);
    for (const notText of [undefined, null, 0, {}, [], ['Line/1']]) assert.equal(inAppBrowser(notText), null, String(notText));
    assert.equal(inAppBrowser(), null);
});

// ---------- externalUrl ----------

test('externalUrl：加上 openExternalBrowser=1；原本的參數與 # 照舊', () => {
    assert.equal(externalUrl('https://ff14.tw/tools/character-card/'), 'https://ff14.tw/tools/character-card/?openExternalBrowser=1');
    assert.equal(externalUrl('https://ff14.tw/tools/character-card/index.html'), 'https://ff14.tw/tools/character-card/index.html?openExternalBrowser=1');
    // 已經有參數：接在後面，原本的參數一個字不改（含編碼與順序）
    assert.equal(externalUrl('https://ff14.tw/tools/character-card/?lang=ja'), 'https://ff14.tw/tools/character-card/?lang=ja&openExternalBrowser=1');
    assert.equal(externalUrl('https://ff14.tw/a?x=1&y=%E4%B8%AD&z'), 'https://ff14.tw/a?x=1&y=%E4%B8%AD&z&openExternalBrowser=1');
    // #：留在最後
    assert.equal(externalUrl('https://ff14.tw/a#top'), 'https://ff14.tw/a?openExternalBrowser=1#top');
    assert.equal(externalUrl('https://ff14.tw/a?x=1#top'), 'https://ff14.tw/a?x=1&openExternalBrowser=1#top');
    assert.equal(externalUrl('https://ff14.tw/a?x=1#top?not=query&a#b'), 'https://ff14.tw/a?x=1&openExternalBrowser=1#top?not=query&a#b', '# 後面的一切原封不動');
    // 只有 ? 或 & 結尾
    assert.equal(externalUrl('https://ff14.tw/a?'), 'https://ff14.tw/a?openExternalBrowser=1');
    assert.equal(externalUrl('https://ff14.tw/a?x=1&'), 'https://ff14.tw/a?x=1&openExternalBrowser=1');
    assert.equal(externalUrl('https://ff14.tw/a?#top'), 'https://ff14.tw/a?openExternalBrowser=1#top');
});

test('externalUrl：已經有 openExternalBrowser 時改成 1，只留一個；名字相似的參數不動；跑兩次結果一樣；不是字串也不丟', () => {
    assert.equal(externalUrl('https://ff14.tw/a?openExternalBrowser=0'), 'https://ff14.tw/a?openExternalBrowser=1');
    assert.equal(externalUrl('https://ff14.tw/a?x=1&openExternalBrowser=0&y=2'), 'https://ff14.tw/a?x=1&openExternalBrowser=1&y=2', '原本的位置');
    assert.equal(externalUrl('https://ff14.tw/a?openExternalBrowser=1&openExternalBrowser=1'), 'https://ff14.tw/a?openExternalBrowser=1');
    assert.equal(externalUrl('https://ff14.tw/a?openExternalBrowser'), 'https://ff14.tw/a?openExternalBrowser=1');
    assert.equal(externalUrl('https://ff14.tw/a?openExternalBrowserX=1'), 'https://ff14.tw/a?openExternalBrowserX=1&openExternalBrowser=1');
    assert.equal(externalUrl('https://ff14.tw/a?xopenExternalBrowser=1'), 'https://ff14.tw/a?xopenExternalBrowser=1&openExternalBrowser=1');
    const once = externalUrl('https://ff14.tw/a?x=1#top');
    assert.equal(externalUrl(once), once, '冪等');
    for (const notText of [undefined, null, 12]) assert.doesNotThrow(() => externalUrl(notText));
    assert.equal(externalUrl(undefined), '?openExternalBrowser=1');
});

// ---------- 純函式：不改傳進來的東西 ----------

test('函式不靠 this、不改傳進來的 nav、win、doc 與檔案（傳凍結的也行）', async () => {
    const frozenFile = Object.freeze({ name: 'a.png', type: PNG });
    const nav = Object.freeze({
        share: async () => {},
        canShare: () => true,
        clipboard: Object.freeze({ write: async () => {} })
    });
    const win = Object.freeze({ ClipboardItem: FakeClipboardItem });
    assert.equal(canShareFiles(nav, frozenFile), true);
    assert.equal(await share(nav, frozenFile, 'x'), 'shared');
    assert.equal(canCopy(nav, win), true);
    assert.equal(await copy(nav, win, Object.freeze({ size: 1 })), true);
    assert.equal(inAppBrowser('Line/1'), 'line', '開頭也是字的邊界');
    assert.equal(inAppBrowser('x Line/1'), 'line');
});
