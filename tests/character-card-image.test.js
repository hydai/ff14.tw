const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const IMAGE_FILE = 'tools/character-card/card-image.js';

// 這支腳本把東西掛在 window 上，所以讓 window 指向 context 本身（同 character-card-layout.test.js）。
// 每個 context 各載一份；沒有 document、Image、URL、canvas：讀圖與建 canvas 都靠測試傳進去的替身
function loadContext(files) {
    const context = vm.createContext({});
    context.window = context;
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    }
    return context;
}

const context = loadContext([IMAGE_FILE]);
const { CardImage } = context;
// 故意用解構取出：頁面不一定用 CardImage.xxx() 的寫法呼叫，這些函式不能靠 this
const { MAX_EDGE, QUALITY, FALLBACK, MAX_DATA_URL, BLUR, targetSize, prepare, fromDataUrl, blur } = CardImage;

// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));
// 腳本在 vm 裡丟出來的 Error 是另一個 realm 的，instanceof Error 比不出來；看內部的標籤
const isError = (error) => Object.prototype.toString.call(error) === '[object Error]';

// 假的 loadImage：記下每次收到什麼，回傳指定大小的「圖片」（source 是測試認得的記號）
function stubLoader({ width, height, fail = null } = {}) {
    const calls = [];
    const source = { name: 'decoded picture' };
    return {
        calls,
        source,
        loadImage: async (input) => {
            calls.push(input);
            if (fail !== null) throw fail;
            return { source, width, height };
        }
    };
}

// 假的 createCanvas：記下建出來的每一張 canvas 與上面發生的事（依序），toDataURL 依 lengthFor(品質, 寬, 高) 回傳不同長度的字串。
// created 是建出來時的大小（寬高是會被改的屬性：CardImage 轉完圖會把暫存的 canvas 設成 0 放掉），sizeAtEncode 是 toDataURL 被呼叫的當下 canvas 的寬高
function stubCanvases(lengthFor = () => 100) {
    const canvases = [];
    const createCanvas = (width, height) => {
        const calls = [];
        // 縮放的設定一開始故意是 false 與 'low'（真的 canvas 的預設是 true 與 'low'）：CardImage 沒有自己設，畫的當下就看得出來。
        // drawImage 另外記下畫的當下開了 imageSmoothing 沒有，與來源是 canvas 的話它當時多大（來源放掉是畫完之後的事）
        const ctx = {
            fillStyle: '#000000',
            imageSmoothingEnabled: false,
            imageSmoothingQuality: 'low',
            fillRect: (...args) => calls.push({ op: 'fillRect', args, fillStyle: ctx.fillStyle }),
            drawImage: (...args) => calls.push({
                op: 'drawImage',
                args,
                fillStyle: ctx.fillStyle,
                smoothing: ctx.imageSmoothingEnabled,
                quality: ctx.imageSmoothingQuality,
                sourceSize: args[0] !== null && typeof args[0] === 'object' && 'width' in args[0] ? [args[0].width, args[0].height] : null
            })
        };
        const canvas = {
            width,
            height,
            created: [width, height],
            sizeAtEncode: null,
            calls,
            ctx,
            getContext(type) {
                calls.push({ op: 'getContext', args: [type] });
                assert.equal(type, '2d', 'canvas 只用 2d');
                return ctx;
            },
            toDataURL(type, quality) {
                calls.push({ op: 'toDataURL', args: [type, quality] });
                canvas.sizeAtEncode = [canvas.width, canvas.height];
                return `data:${type};base64,${'A'.repeat(Math.max(0, lengthFor(quality, width, height) - `data:${type};base64,`.length))}`;
            }
        };
        canvases.push(canvas);
        return canvas;
    };
    return { canvases, createCanvas };
}

const opsOf = (canvas) => canvas.calls.map((call) => call.op);
// 一般的情況：品質 0.85 轉出來剛好放得進記憶（不用再縮）
const SHORT = () => 120000;

// ---------- 模組 ----------

test('CardImage：只掛一個全域、模組與 FALLBACK 都凍結、常數照規定、沒有 DOM', () => {
    assert.equal(Object.isFrozen(CardImage), true);
    assert.deepEqual(Object.keys(CardImage).sort(), ['BLUR', 'FALLBACK', 'MAX_DATA_URL', 'MAX_EDGE', 'QUALITY', 'blur', 'fromDataUrl', 'prepare', 'targetSize']);
    assert.equal(MAX_EDGE, 2048);
    assert.equal(QUALITY, 0.85);
    assert.equal(MAX_DATA_URL, 1500000);
    assert.deepEqual(plain(FALLBACK), { maxEdge: 1600, quality: 0.8 });
    assert.equal(Object.isFrozen(FALLBACK), true);
    assert.deepEqual(plain(BLUR), { cell: 5.2, smooth: 4 });
    assert.equal(Object.isFrozen(BLUR), true);
    for (const name of ['targetSize', 'prepare', 'fromDataUrl', 'blur']) assert.equal(typeof CardImage[name], 'function', name);

    // 常數與小函式都收在立即執行的函式裡：只多一個全域，和頁面其他腳本的名稱撞不到；這個 context 裡沒有 document，腳本照樣載入、算得出來
    const alone = loadContext([IMAGE_FILE]);
    assert.deepEqual(Object.keys(alone).filter((name) => name !== 'window'), ['CardImage']);
    assert.equal(alone.document, undefined);
});

// ---------- targetSize ----------

test('card-image：targetSize 不放大、長邊縮到 2048', () => {
    // 長邊超過 maxEdge：長邊縮成剛好 maxEdge，另一邊照比例（四捨五入）
    assert.deepEqual(plain(targetSize(4000, 3000, MAX_EDGE)), { width: 2048, height: 1536 });
    assert.deepEqual(plain(targetSize(3000, 4000, MAX_EDGE)), { width: 1536, height: 2048 }, '直的圖：長邊是高');
    assert.deepEqual(plain(targetSize(5000, 5000, MAX_EDGE)), { width: 2048, height: 2048 });
    assert.deepEqual(plain(targetSize(4096, 2048, MAX_EDGE)), { width: 2048, height: 1024 });
    assert.deepEqual(plain(targetSize(3000, 1688, MAX_EDGE)), { width: 2048, height: 1152 }, '1688 × 2048 ÷ 3000 = 1152.2，四捨五入');
    assert.deepEqual(plain(targetSize(1000, 3000, MAX_EDGE)), { width: 683, height: 2048 }, '682.67 進位');
    assert.deepEqual(plain(targetSize(2049, 1000, MAX_EDGE)), { width: 2048, height: 1000 }, '只多一個像素也縮，另一邊四捨五入後沒變');

    // 不放大：長邊剛好是 maxEdge 或更小的原樣還給
    assert.deepEqual(plain(targetSize(2048, 1000, MAX_EDGE)), { width: 2048, height: 1000 });
    assert.deepEqual(plain(targetSize(1000, 2048, MAX_EDGE)), { width: 1000, height: 2048 });
    assert.deepEqual(plain(targetSize(1000, 500, MAX_EDGE)), { width: 1000, height: 500 });
    assert.deepEqual(plain(targetSize(640, 360, MAX_EDGE)), { width: 640, height: 360 });
    assert.deepEqual(plain(targetSize(1, 1, MAX_EDGE)), { width: 1, height: 1 });
    assert.deepEqual(plain(targetSize(2048, 2048, MAX_EDGE)), { width: 2048, height: 2048 });

    // maxEdge 由呼叫端給：記憶放不下時再縮的 1600
    assert.deepEqual(plain(targetSize(4000, 3000, FALLBACK.maxEdge)), { width: 1600, height: 1200 });
    assert.deepEqual(plain(targetSize(1500, 800, FALLBACK.maxEdge)), { width: 1500, height: 800 }, '再縮也不放大');
    assert.deepEqual(plain(targetSize(4000, 3000, Infinity)), { width: 4000, height: 3000 }, '沒有上限就原樣');

    // 很扁的圖：另一邊至少 1 像素（canvas 不能是 0）
    assert.deepEqual(plain(targetSize(20000, 10, MAX_EDGE)), { width: 2048, height: 1 });
    assert.deepEqual(plain(targetSize(10, 20000, MAX_EDGE)), { width: 1, height: 2048 });

    // 逐一掃過各種形狀：長邊剛好是 2048（不多不少）、兩邊都是正整數、短邊就是照比例算出來的值四捨五入（差不到半個像素；
    // 算出來不到 1 的最少是 1）、不放大
    for (const [width, height] of [[2049, 2049], [2050, 1], [4000, 1999], [6000, 4000], [3840, 2160], [7680, 4320], [1, 5000], [3001, 2999], [12000, 8000], [8191, 4097]]) {
        const size = targetSize(width, height, MAX_EDGE);
        assert.equal(Math.max(size.width, size.height), MAX_EDGE, `${width}×${height} 的長邊`);
        assert.ok(Number.isInteger(size.width) && Number.isInteger(size.height) && size.width >= 1 && size.height >= 1, `${width}×${height}：${size.width}×${size.height}`);
        const exactShort = Math.min(width, height) * MAX_EDGE / Math.max(width, height);
        const short = Math.min(size.width, size.height);
        assert.ok(Math.abs(short - exactShort) <= 0.5 || (short === 1 && exactShort < 1), `${width}×${height} 的短邊 ${short}，照比例是 ${exactShort}`);
        assert.ok(size.width <= width && size.height <= height, `${width}×${height} 不放大`);
    }

    // 大小不對（0、負的、不是有限的數字、不是數字）或上限不對，回傳 0 × 0，不丟錯
    for (const [width, height, edge] of [[0, 10, 2048], [10, 0, 2048], [-5, 10, 2048], [10, -5, 2048], [NaN, 10, 2048], [10, NaN, 2048], [Infinity, 10, 2048],
        [10, Infinity, 2048], ['4000', 3000, 2048], [4000, null, 2048], [undefined, undefined, 2048], [4000, 3000, 0], [4000, 3000, -1], [4000, 3000, NaN], [4000, 3000, '2048']]) {
        assert.deepEqual(plain(targetSize(width, height, edge)), { width: 0, height: 0 }, `targetSize(${width}, ${height}, ${edge})`);
    }

    // 每次都是新的物件（改它不會動到別人手上的）
    const a = targetSize(640, 360, MAX_EDGE);
    const b = targetSize(640, 360, MAX_EDGE);
    assert.notEqual(a, b);
});

// ---------- prepare ----------

test('prepare：讀圖、縮到長邊 2048、先鋪一層不透明的底色再畫、轉成 JPEG（品質 0.85）', async () => {
    const { loadImage, calls: loads, source } = stubLoader({ width: 4000, height: 1500 });
    const { createCanvas, canvases } = stubCanvases(SHORT);
    const file = { name: 'luna.png' };

    const result = await prepare(file, { loadImage, createCanvas });
    assert.deepEqual(loads, [file], 'loadImage 收到的就是傳進來的檔案，只讀一次');
    assert.equal(canvases.length, 1, '一次就放得進記憶：只轉一次');
    const [canvas] = canvases;
    assert.deepEqual(canvas.created, [2048, 768], '4000×1500 縮成長邊 2048');
    assert.deepEqual(opsOf(canvas), ['getContext', 'fillRect', 'drawImage', 'toDataURL'], '先鋪底色、再畫圖、最後轉出來');
    const [, fill, draw, encode] = canvas.calls;
    assert.deepEqual(fill.args, [0, 0, 2048, 768], '底色鋪滿整張');
    assert.match(fill.fillStyle, /^#[0-9a-f]{6}$/i, '底色是不透明的：JPEG 沒有透明，各家瀏覽器對透明的地方轉出來不一樣（黑或白）');
    assert.ok(draw.args[0] === source, '畫的是讀進來的圖');
    assert.deepEqual(draw.args.slice(1), [0, 0, 2048, 768], '縮成 canvas 那麼大，鋪滿');
    assert.deepEqual(encode.args, ['image/jpeg', 0.85]);
    assert.equal(canvas.ctx.imageSmoothingEnabled, true);
    assert.equal(canvas.ctx.imageSmoothingQuality, 'high', '縮得很多的圖用高品質的縮法，不然邊緣會鋸齒');
    assert.deepEqual(plain(result), { width: 2048, height: 768, dataUrl: `data:image/jpeg;base64,${'A'.repeat(120000 - 23)}` });
    assert.equal(result.dataUrl.length, 120000);
    assert.equal(result.dataUrl.startsWith('data:image/jpeg;base64,'), true);

    // 直的圖、小的圖：不放大，原本多大就多大
    const tall = stubCanvases(SHORT);
    const tallResult = await prepare(file, { loadImage: stubLoader({ width: 1500, height: 4000 }).loadImage, createCanvas: tall.createCanvas });
    assert.deepEqual(tall.canvases[0].created, [768, 2048]);
    assert.deepEqual([tallResult.width, tallResult.height], [768, 2048]);
    const small = stubCanvases(SHORT);
    const smallResult = await prepare(file, { loadImage: stubLoader({ width: 640, height: 360 }).loadImage, createCanvas: small.createCanvas });
    assert.deepEqual(small.canvases[0].created, [640, 360], '不放大');
    assert.deepEqual([smallResult.width, smallResult.height], [640, 360]);
    assert.deepEqual(small.canvases[0].calls[1].args, [0, 0, 640, 360]);
});

test('prepare：dataUrl 太長時用 1600 與 0.8 再轉一次', async () => {
    // 品質 0.85 轉出來比 MAX_DATA_URL 長一個字、0.8 轉出來短很多：再轉一次，用第二次的
    const { loadImage, calls: loads, source } = stubLoader({ width: 4000, height: 3000 });
    const { createCanvas, canvases } = stubCanvases((quality) => (quality === 0.85 ? MAX_DATA_URL + 1 : 900000));
    const result = await prepare('檔案', { loadImage, createCanvas });

    assert.equal(loads.length, 1, '圖只讀一次，第二次也從讀進來的那張畫（不是從第一次轉出來的 JPEG 再壓一次）');
    assert.equal(canvases.length, 2);
    const [first, second] = canvases;
    assert.deepEqual(first.created, [2048, 1536]);
    assert.deepEqual(first.calls.at(-1).args, ['image/jpeg', 0.85]);
    assert.deepEqual(second.created, [1600, 1200], '第二次也重新縮：長邊 1600');
    assert.deepEqual(opsOf(second), ['getContext', 'fillRect', 'drawImage', 'toDataURL'], '第二次一樣先鋪底色');
    assert.deepEqual(second.calls[1].args, [0, 0, 1600, 1200]);
    assert.ok(second.calls[2].args[0] === source, '第二次畫的還是讀進來的那張');
    assert.deepEqual(second.calls[2].args.slice(1), [0, 0, 1600, 1200]);
    assert.deepEqual(second.calls.at(-1).args, ['image/jpeg', 0.8]);
    assert.equal(FALLBACK.maxEdge, 1600);
    assert.equal(FALLBACK.quality, 0.8);
    assert.deepEqual([result.width, result.height], [1600, 1200]);
    assert.equal(result.dataUrl.length, 900000, '用第二次的結果');

    // 剛好等於 MAX_DATA_URL 還放得進去：不再轉；多一個字就要再轉
    const exact = stubCanvases(() => MAX_DATA_URL);
    const exactResult = await prepare('檔案', { loadImage: stubLoader({ width: 4000, height: 3000 }).loadImage, createCanvas: exact.createCanvas });
    assert.equal(exact.canvases.length, 1);
    assert.equal(exactResult.dataUrl.length, MAX_DATA_URL);
    const over = stubCanvases(() => MAX_DATA_URL + 1);
    await prepare('檔案', { loadImage: stubLoader({ width: 4000, height: 3000 }).loadImage, createCanvas: over.createCanvas });
    assert.equal(over.canvases.length, 2);

    // 第二次還是太長：照樣用第二次的（存不進去的話，頁面會告訴使用者這次不會記住），不再轉第三次
    const huge = stubCanvases(() => MAX_DATA_URL + 500000);
    const hugeResult = await prepare('檔案', { loadImage: stubLoader({ width: 4000, height: 3000 }).loadImage, createCanvas: huge.createCanvas });
    assert.equal(huge.canvases.length, 2);
    assert.deepEqual([hugeResult.width, hugeResult.height], [1600, 1200]);
    assert.equal(hugeResult.dataUrl.length, MAX_DATA_URL + 500000);

    // 再縮也不放大：本來就比 1600 小的圖，第二次一樣大，只有品質降到 0.8
    const small = stubCanvases(() => MAX_DATA_URL + 1);
    const smallResult = await prepare('檔案', { loadImage: stubLoader({ width: 1000, height: 500 }).loadImage, createCanvas: small.createCanvas });
    assert.deepEqual(small.canvases.map((canvas) => canvas.created), [[1000, 500], [1000, 500]]);
    assert.deepEqual(small.canvases.map((canvas) => canvas.calls.at(-1).args[1]), [0.85, 0.8]);
    assert.deepEqual([smallResult.width, smallResult.height], [1000, 500]);
});

test('prepare：讀不出來、圖的大小不對、轉不成圖片、拿不到 2d 都是 rejected，不留半個結果', async () => {
    const reason = new Error('decode failed');
    const failing = stubLoader({ fail: reason });
    const unused = stubCanvases();
    await assert.rejects(prepare('檔案', { loadImage: failing.loadImage, createCanvas: unused.createCanvas }), (error) => error === reason);
    assert.equal(unused.canvases.length, 0, '讀不出來就不建 canvas');

    // 讀出來的大小是 0（例如沒有固有大小的 SVG）或不是數字：不畫、不轉
    for (const [width, height] of [[0, 100], [100, 0], [NaN, 100], [100, Infinity], [-3, 100], [undefined, undefined]]) {
        const bad = stubCanvases();
        await assert.rejects(prepare('檔案', { loadImage: stubLoader({ width, height }).loadImage, createCanvas: bad.createCanvas }), isError, `${width}×${height}`);
        assert.equal(bad.canvases.length, 0, `${width}×${height} 不建 canvas`);
    }
    // loadImage 沒給圖
    await assert.rejects(prepare('檔案', { loadImage: async () => ({ source: null, width: 100, height: 100 }), createCanvas: unused.createCanvas }), isError);
    await assert.rejects(prepare('檔案', { loadImage: async () => null, createCanvas: unused.createCanvas }), isError);

    // toDataURL 轉不出圖片（canvas 太大時瀏覽器回傳 "data:,"）：不當成成功
    const empty = {
        createCanvas: () => ({ width: 1, height: 1, getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => 'data:,' })
    };
    await assert.rejects(prepare('檔案', { loadImage: stubLoader({ width: 100, height: 100 }).loadImage, createCanvas: empty.createCanvas }), isError);
    // 瀏覽器不給 2d context（getContext 回傳 null）
    const noContext = { createCanvas: () => ({ width: 1, height: 1, getContext: () => null, toDataURL: () => 'data:image/jpeg;base64,AAAA' }) };
    await assert.rejects(prepare('檔案', { loadImage: stubLoader({ width: 100, height: 100 }).loadImage, createCanvas: noContext.createCanvas }), isError);
});

// iOS Safari 的 canvas 記憶體有總量上限：同一個 session 裡傳了很多張圖，暫存的 canvas 不放掉，之後就轉不出圖（畫面上變成「讀不出來」）。
// 把寬高設成 0 是已知的放掉方法。要在 toDataURL 之後才放（轉的時候寬高還在），回傳的大小是轉出來那張的，不是放掉之後的 0
test('prepare：暫存的 canvas 轉完就把寬高設成 0 放掉（再縮一次時兩張都放掉），失敗的路徑也放', async () => {
    // 一次就放得進記憶：一張。轉的時候寬高還在，轉完是 0
    const once = stubCanvases(SHORT);
    const result = await prepare('檔案', { loadImage: stubLoader({ width: 4000, height: 3000 }).loadImage, createCanvas: once.createCanvas });
    assert.equal(once.canvases.length, 1);
    assert.deepEqual(once.canvases[0].sizeAtEncode, [2048, 1536], '轉的時候寬高還在：放掉是 toDataURL 之後的事');
    assert.deepEqual([once.canvases[0].width, once.canvases[0].height], [0, 0], '轉完就放掉');
    assert.deepEqual([result.width, result.height], [2048, 1536], '回傳的是轉出來那張的大小，不是放掉之後的 0');

    // 再縮一次：第一張轉完就放，第二張也放
    const twice = stubCanvases((quality) => (quality === 0.85 ? MAX_DATA_URL + 1 : 900000));
    const second = await prepare('檔案', { loadImage: stubLoader({ width: 4000, height: 3000 }).loadImage, createCanvas: twice.createCanvas });
    assert.equal(twice.canvases.length, 2);
    assert.deepEqual(twice.canvases.map((canvas) => canvas.sizeAtEncode), [[2048, 1536], [1600, 1200]], '兩張轉的時候寬高都還在');
    assert.deepEqual(twice.canvases.map((canvas) => [canvas.width, canvas.height]), [[0, 0], [0, 0]], '兩張轉完都放掉');
    assert.deepEqual([second.width, second.height], [1600, 1200]);

    // 轉不成圖片（canvas 太大時瀏覽器回傳 "data:,"）、轉的時候丟例外、拿不到 2d：失敗也放掉，不然失敗也一張張積在記憶體裡
    for (const behaviour of ['too-big', 'throws', 'no-context']) {
        const canvases = [];
        const createCanvas = (width, height) => {
            const canvas = {
                width,
                height,
                getContext: () => (behaviour === 'no-context' ? null : { fillRect() {}, drawImage() {} }),
                toDataURL: () => {
                    if (behaviour === 'throws') throw new Error('toDataURL failed');
                    return 'data:,';
                }
            };
            canvases.push(canvas);
            return canvas;
        };
        await assert.rejects(prepare('檔案', { loadImage: stubLoader({ width: 100, height: 100 }).loadImage, createCanvas }), isError, behaviour);
        assert.equal(canvases.length, 1, behaviour);
        assert.deepEqual([canvases[0].width, canvases[0].height], [0, 0], `${behaviour}：失敗也放掉`);
    }
});

// ---------- fromDataUrl ----------

test('fromDataUrl：用 loadImage 把存著的圖片讀回來，回傳 { source, width, height }', async () => {
    const { loadImage, calls, source } = stubLoader({ width: 2048, height: 768 });
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const result = await fromDataUrl(dataUrl, { loadImage });
    assert.deepEqual(calls, [dataUrl]);
    assert.ok(result.source === source);
    assert.equal(result.width, 2048);
    assert.equal(result.height, 768);
    assert.deepEqual(Object.keys(result).sort(), ['height', 'source', 'width']);

    // 別的圖片格式的 data URL 也收（只看開頭：和 CardState 存的規則一樣）
    const png = await fromDataUrl('data:image/png;base64,AAAA', { loadImage: stubLoader({ width: 4, height: 3 }).loadImage });
    assert.equal(png.width, 4);
});

test('fromDataUrl：不是圖片的 data URL 不讀；讀不出來或大小不對是 rejected', async () => {
    for (const bad of ['', 'http://example.com/a.png', 'data:text/plain;base64,AAAA', 'data:,', 'image/jpeg', null, undefined, 42, {}, ['data:image/jpeg;base64,AAAA']]) {
        const loader = stubLoader({ width: 10, height: 10 });
        await assert.rejects(fromDataUrl(bad, { loadImage: loader.loadImage }), isError, `${String(bad)}`);
        assert.equal(loader.calls.length, 0, `${String(bad)} 不交給 loadImage`);
    }
    const reason = new Error('decode failed');
    await assert.rejects(fromDataUrl('data:image/jpeg;base64,AAAA', { loadImage: stubLoader({ fail: reason }).loadImage }), (error) => error === reason);
    for (const [width, height] of [[0, 10], [10, 0], [NaN, 10]]) {
        await assert.rejects(fromDataUrl('data:image/jpeg;base64,AAAA', { loadImage: stubLoader({ width, height }).loadImage }), isError, `${width}×${height}`);
    }
    await assert.rejects(fromDataUrl('data:image/jpeg;base64,AAAA', { loadImage: async () => ({ source: null, width: 10, height: 10 }) }), isError);
});

test('prepare 與 fromDataUrl：不改傳進來的東西（傳凍結的檔案與依賴也行），每次回傳新的物件', async () => {
    const file = Object.freeze({ name: 'luna.png', size: 1 });
    const loader = stubLoader({ width: 3000, height: 2000 });
    const { createCanvas } = stubCanvases(SHORT);
    const deps = Object.freeze({ loadImage: loader.loadImage, createCanvas });
    const one = await prepare(file, deps);
    const two = await prepare(file, deps);
    assert.notEqual(one, two);
    assert.deepEqual(plain(one), plain(two));
    const dataUrlDeps = Object.freeze({ loadImage: loader.loadImage });
    const a = await fromDataUrl(one.dataUrl, dataUrlDeps);
    const b = await fromDataUrl(one.dataUrl, dataUrlDeps);
    assert.notEqual(a, b);
    assert.equal(Object.isFrozen(CardImage.FALLBACK), true, 'FALLBACK 沒被改動');
    assert.deepEqual(plain(CardImage.FALLBACK), { maxEdge: 1600, quality: 0.8 });
});

// ---------- blur ----------
// 名片的模糊背景：不用 ctx.filter（舊的 Safari 沒有），截圖先一步一步縮小、縮成小圖，再放大 4 倍畫進一張新的 canvas。
// 小圖的一個像素有 cellPx = 5.2 × 卡片寬度 / 100 那麼寬（σ 約是它的一半，就是草稿的 blur(2.6cqw)）。這裡的 canvas 是假的，記下建的順序與大小

const LANDSCAPE = Object.freeze({ width: 1200, height: 675 });
const PORTRAIT = Object.freeze({ width: 1080, height: 1350 });
// 讀進來的截圖（source 是測試認得的記號）
const shot = (width, height) => ({ source: { name: 'screenshot' }, width, height });
const createdSizes = (canvases) => canvases.map((canvas) => canvas.created);
const currentSize = (canvas) => [canvas.width, canvas.height];
const drawsOf = (canvas) => canvas.calls.filter((call) => call.op === 'drawImage');

test('blur：1920×1080 的截圖、橫版卡片 → 依序建 960×540、480×270、240×135、120×68、60×34、30×17、19×11、76×44；回傳最後那張，其他的寬高都設成 0', () => {
    const picture = shot(1920, 1080);
    const { createCanvas, canvases } = stubCanvases();
    const result = blur(picture, LANDSCAPE, { createCanvas });

    // 小圖：截圖照 cover 放到卡片大小（1920×1080 放成 1200×675，0.625 倍），再除以 cellPx（5.2 × 1200 / 100 = 62.4）：19.2 × 10.8，四捨五入是 19×11。
    // 從截圖開始每一步長寬各減半（67.5 進位成 68）；30×17 再減半是 15×9，比小圖小，就不減了，一步縮成小圖，最後放大 4 倍
    assert.deepEqual(createdSizes(canvases), [[960, 540], [480, 270], [240, 135], [120, 68], [60, 34], [30, 17], [19, 11], [76, 44]]);
    const last = canvases.at(-1);
    assert.ok(result.source === last, '回傳的是最後建的那一張');
    assert.deepEqual(Object.keys(result).sort(), ['height', 'source', 'width']);
    assert.deepEqual([result.width, result.height], [76, 44]);
    assert.deepEqual(currentSize(last), [76, 44], '回傳的那一張沒有放掉');
    for (const canvas of canvases.slice(0, -1)) assert.deepEqual(currentSize(canvas), [0, 0], `${canvas.created.join('×')} 放掉了`);

    // 一張接一張：第一張畫截圖，之後每一張畫前一張，都鋪滿自己；前一張是畫完才放掉的（畫的當下寬高還在）
    canvases.forEach((canvas, index) => {
        const draws = drawsOf(canvas);
        assert.equal(draws.length, 1, `${canvas.created.join('×')} 只畫一次`);
        assert.ok(draws[0].args[0] === (index === 0 ? picture.source : canvases[index - 1]), `${canvas.created.join('×')} 畫的是${index === 0 ? '截圖' : '前一張'}`);
        assert.deepEqual(draws[0].args.slice(1), [0, 0, ...canvas.created], `${canvas.created.join('×')} 鋪滿自己`);
        if (index > 0) assert.deepEqual(draws[0].sourceSize, canvases[index - 1].created, `${canvas.created.join('×')} 畫的當下，前一張還沒放掉`);
    });
    // 不用 toDataURL、也不轉 JPEG：模糊小圖是畫給卡片看的，不存
    for (const canvas of canvases) assert.ok(!canvas.calls.some((call) => call.op === 'toDataURL'));
});

test('blur：直版卡片 → 小圖 43×24、回傳 172×96', () => {
    const { createCanvas, canvases } = stubCanvases();
    const result = blur(shot(1920, 1080), PORTRAIT, { createCanvas });
    // 直版 1080×1350：1920×1080 要放大到 2400×1350（1.25 倍）才蓋得滿，cellPx = 5.2 × 1080 / 100 = 56.16：42.7 × 24.0，四捨五入是 43×24；60×34 再減半是 30×17，比小圖小
    assert.deepEqual(createdSizes(canvases), [[960, 540], [480, 270], [240, 135], [120, 68], [60, 34], [43, 24], [172, 96]]);
    assert.deepEqual(canvases.at(-2).created, [43, 24], '小圖');
    assert.ok(result.source === canvases.at(-1));
    assert.deepEqual([result.width, result.height], [172, 96]);
    assert.deepEqual(currentSize(canvases.at(-1)), [172, 96]);
    for (const canvas of canvases.slice(0, -1)) assert.deepEqual(currentSize(canvas), [0, 0]);
});

test('blur：小圖照 cover 與 cellPx 算（直的圖、很扁的圖、剛好是卡片大小的圖），減半到再減半就比小圖小為止；比小圖還小的截圖不減半，直接畫成小圖', () => {
    const run = (width, height, card = LANDSCAPE) => {
        const { createCanvas, canvases } = stubCanvases();
        const result = blur(shot(width, height), card, { createCanvas });
        return { sizes: createdSizes(canvases), result, canvases };
    };

    // 直的圖（1000×4000）：放大 1.2 倍到 1200 寬，是 1200×4800，除以 62.4 是 19.2 × 76.9 → 19×77；16×63 比小圖小，停在 32×125
    assert.deepEqual(run(1000, 4000).sizes, [[500, 2000], [250, 1000], [125, 500], [63, 250], [32, 125], [19, 77], [76, 308]]);
    // 比小圖還小的截圖（10×6）：一步都不減，直接畫成小圖（放大），再放大 4 倍。放大 120 倍到 1200×720 → 19.2 × 11.5 → 19×12
    assert.deepEqual(run(10, 6).sizes, [[19, 12], [76, 48]]);
    // 1×1：放大到 1200×1200 → 19×19；沒得減半
    assert.deepEqual(run(1, 1).sizes, [[19, 19], [76, 76]]);
    // 截圖剛好是卡片的大小（1200×675，放大倍率 1）：小圖還是 19×11；一路減半到 19×11 剛好就是小圖（再減半是 10×6，比小圖小），
    // 那一張就是小圖，不再多畫一張一樣大的，接著放大（下一個測試專門守這個）
    const exact = run(1200, 675);
    assert.deepEqual(exact.sizes, [[600, 338], [300, 169], [150, 85], [75, 43], [38, 22], [19, 11], [76, 44]]);
    assert.deepEqual([exact.result.width, exact.result.height], [76, 44]);
    // 很扁的圖（90×1，再扁放大後就超過 4096 了，見下面那個測試）：放大 675 倍到 60750×675，除以 62.4 是 973.6 × 10.8 → 974×11，放大 4 倍是 3896×44。
    // 高只有 1 像素，減半之後高還是 1，比小圖的高（11）小，所以一步都不減，直接畫成小圖
    const flat = run(90, 1);
    assert.deepEqual(flat.sizes, [[974, 11], [3896, 44]]);
    // 橫版與直版用各自的卡片寬度算 cellPx：同一張 1920×1080，橫版 cellPx 62.4、直版 56.16，小圖大小不一樣
    assert.deepEqual(run(1920, 1080, LANDSCAPE).sizes.at(-2), [19, 11]);
    assert.deepEqual(run(1920, 1080, PORTRAIT).sizes.at(-2), [43, 24]);
    // 卡片的大小不是 1200 或 1080 也照 cellPx = 5.2 × 寬 / 100 算：600×338 的卡片 cellPx 是 31.2，1920×1080 放大 0.3125 倍到 600×337.5，是 19.2 × 10.8
    assert.deepEqual(run(1920, 1080, { width: 600, height: 338 }).sizes.at(-2), [19, 11]);
    // 每一種的結果都是最後一張，其他放掉
    for (const [width, height, card] of [[1000, 4000], [10, 6], [1, 1], [1200, 675], [1920, 1080, PORTRAIT]]) {
        const { canvases, result } = run(width, height, card);
        assert.ok(result.source === canvases.at(-1), `${width}×${height}`);
        assert.deepEqual(currentSize(canvases.at(-1)), [result.width, result.height], `${width}×${height}：回傳的那一張沒放掉`);
        for (const canvas of canvases.slice(0, -1)) assert.deepEqual(currentSize(canvas), [0, 0], `${width}×${height}：${canvas.created.join('×')} 放掉了`);
    }
});

test('blur：減半剛好減到小圖的大小時，那一張就是小圖，不再多畫一張一樣大的 canvas，直接放大 4 倍', () => {
    // 橫版、1200×675：小圖 19×11；38×22 再減半就是 19×11，剛好是小圖。19×11 只有一張，接著是放大的 76×44（沒有第二張 19×11）
    const picture = shot(1200, 675);
    const { createCanvas, canvases } = stubCanvases();
    const result = blur(picture, LANDSCAPE, { createCanvas });
    const sizes = createdSizes(canvases);
    assert.deepEqual(sizes, [[600, 338], [300, 169], [150, 85], [75, 43], [38, 22], [19, 11], [76, 44]]);
    sizes.slice(1).forEach((size, index) => assert.notDeepEqual(size, sizes[index], `第 ${index + 2} 張和前一張一樣大`));
    // 19×11 那一張畫的是 38×22，放大的那一張畫的就是它；其他的放掉，只留最後一張
    assert.ok(drawsOf(canvases[5])[0].args[0] === canvases[4]);
    assert.ok(drawsOf(canvases[6])[0].args[0] === canvases[5], '放大的是減半減出來的那張 19×11');
    assert.deepEqual(drawsOf(canvases[6])[0].sourceSize, [19, 11], '畫的當下 19×11 還沒放掉');
    assert.ok(result.source === canvases[6]);
    assert.deepEqual([result.width, result.height], [76, 44]);
    assert.deepEqual(currentSize(canvases[6]), [76, 44]);
    for (const canvas of canvases.slice(0, -1)) assert.deepEqual(currentSize(canvas), [0, 0]);

    // 直版、2048×768（頁面測試用的截圖）：小圖 64×24；128×48 再減半剛好是 64×24。同樣沒有第二張 64×24（最後的 256×96 是放大 4 倍）
    const portrait = stubCanvases();
    blur(shot(2048, 768), PORTRAIT, { createCanvas: portrait.createCanvas });
    assert.deepEqual(createdSizes(portrait.canvases), [[1024, 384], [512, 192], [256, 96], [128, 48], [64, 24], [256, 96]]);

    // 截圖本來就是小圖的大小（19×11，橫版）：不減半，也不用畫小圖，直接把截圖放大 4 倍，只有一張 76×44，畫的是截圖
    const tiny = shot(19, 11);
    const direct = stubCanvases();
    const directResult = blur(tiny, LANDSCAPE, { createCanvas: direct.createCanvas });
    assert.deepEqual(createdSizes(direct.canvases), [[76, 44]]);
    assert.ok(drawsOf(direct.canvases[0])[0].args[0] === tiny.source, '畫的是截圖');
    assert.deepEqual(drawsOf(direct.canvases[0])[0].args.slice(1), [0, 0, 76, 44]);
    assert.ok(directResult.source === direct.canvases[0]);
    assert.deepEqual([directResult.width, directResult.height], [76, 44]);
    assert.deepEqual(currentSize(direct.canvases[0]), [76, 44], '唯一的一張是回傳的，沒有放掉');
});

test('blur：長寬比很極端，放大後任何一邊會超過 4096 → null，一張 canvas 都不建（也沒有建過的 canvas 留著）；剛好 4096 還行', () => {
    const run = (width, height, card) => {
        const { createCanvas, canvases } = stubCanvases();
        const result = blur(shot(width, height), card, { createCanvas });
        return { result, canvases, sizes: createdSizes(canvases) };
    };
    // 建過（被要求建）的 canvas 裡最長的一邊
    const longestEdge = (canvases) => Math.max(0, ...canvases.flatMap(({ created }) => created));
    const refused = (width, height, card, message) => {
        const { result, canvases } = run(width, height, card);
        assert.equal(result, null, message);
        assert.ok(longestEdge(canvases) <= 4096, `${message}：沒有要求建超過 4096 的 canvas`);
        assert.deepEqual(canvases.map(currentSize), canvases.map(() => [0, 0]), `${message}：建過的 canvas 都放掉了`);
        return canvases;
    };

    // 2048×40：橫版的小圖是 554×11（放大 675/40 倍到 34560×675，除以 62.4），放大 4 倍是 2216×44，沒問題；
    // 直版的小圖是 1231×24（放大 33.75 倍到 69120×1350，除以 56.16），放大 4 倍是 4924×96，寬超過 4096：不做
    const wide = run(2048, 40, LANDSCAPE);
    assert.deepEqual(wide.sizes, [[1024, 20], [554, 11], [2216, 44]]);
    assert.deepEqual([wide.result.width, wide.result.height], [2216, 44]);
    assert.deepEqual(refused(2048, 40, PORTRAIT, '2048×40 直版（要 4924×96）'), [], '連減半的 canvas 也沒建：超過就先不做');

    // 剛好 4096 還行（只有「超過」才不做）：橫版、高 20：1894×20 的小圖是 1024×11，放大 4 倍剛好 4096×44；1895×20 的小圖是 1025×11，放大 4 倍是 4100
    const edge = run(1894, 20, LANDSCAPE);
    assert.deepEqual(edge.sizes, [[1024, 11], [4096, 44]]);
    assert.equal(longestEdge(edge.canvases), 4096);
    assert.deepEqual([edge.result.width, edge.result.height], [4096, 44]);
    refused(1895, 20, LANDSCAPE, '1895×20 橫版（要 4100×44）');
    // 高也一樣：直的圖，直版、寬 39 的小圖是 19×1010，放大 4 倍是 76×4040；寬 38 的小圖是 19×1036，放大 4 倍是 76×4144
    const tall = run(39, 2048, PORTRAIT);
    assert.deepEqual(tall.sizes, [[20, 1024], [19, 1010], [76, 4040]]);
    assert.deepEqual([tall.result.width, tall.result.height], [76, 4040]);
    refused(38, 2048, PORTRAIT, '38×2048 直版（要 76×4144）');
    refused(38, 2048, LANDSCAPE, '38×2048 橫版（要 76×4144）');

    // 兩個方向都很極端、截圖很大（頁面的縮圖最大 2048，但 blur 不靠這個）：減半的 canvas 也不超過：10000×6000 減半第一張就是 5000×3000，不做
    refused(10000, 6000, LANDSCAPE, '10000×6000 橫版（減半第一張 5000×3000）');
    // 8192×4096 減半第一張剛好 4096×2048：做得出來，每一張都不超過 4096
    const large = run(8192, 4096, LANDSCAPE);
    assert.ok(large.result !== null);
    assert.equal(longestEdge(large.canvases), 4096);
    // 2048×1（20000×10 縮成的）：兩種卡片都不做
    refused(2048, 1, LANDSCAPE, '2048×1 橫版');
    refused(2048, 1, PORTRAIT, '2048×1 直版');
    // 不丟例外：正常大小的圖照舊
    assert.ok(run(1920, 1080, LANDSCAPE).result !== null);
});

test('blur：每一張 canvas 都開了 imageSmoothing（high）', () => {
    for (const card of [LANDSCAPE, PORTRAIT]) {
        const { createCanvas, canvases } = stubCanvases();
        blur(shot(1920, 1080), card, { createCanvas });
        assert.ok(canvases.length >= 7, '有好幾步');
        for (const canvas of canvases) {
            const draws = drawsOf(canvas);
            assert.equal(draws.length, 1, `${canvas.created.join('×')} 畫一次`);
            // 假的 context 一開始是關著、品質 low：CardImage 沒有自己設的話，畫的當下就看得到
            assert.equal(draws[0].smoothing, true, `${canvas.created.join('×')} 畫的當下 imageSmoothingEnabled 是開的`);
            assert.equal(draws[0].quality, 'high', `${canvas.created.join('×')} 畫的當下 imageSmoothingQuality 是 high`);
        }
    }
});

test('blur：拿不到 2d、截圖或卡片的大小不對 → null，建過的 canvas 都放掉；不丟例外', () => {
    const attempt = (picture, card, behaviour = null, at = 0) => {
        const stub = stubCanvases();
        let count = 0;
        const createCanvas = (width, height) => {
            count += 1;
            if (count === at && behaviour === 'create-throws') throw new Error('out of memory');
            const canvas = stub.createCanvas(width, height);
            if (count === at && behaviour === 'no-context') canvas.getContext = () => null;
            if (count === at && behaviour === 'draw-throws') {
                canvas.ctx.drawImage = () => {
                    throw new Error('InvalidStateError');
                };
            }
            return canvas;
        };
        return { result: blur(picture, card, { createCanvas }), canvases: stub.canvases };
    };

    // 截圖不能用（沒有、沒有圖、大小是 0、負的、不是有限的數字、不是數字）：不建 canvas
    const sources = [null, undefined, {}, 42, 'picture', { source: null, width: 100, height: 100 }, { width: 100, height: 100 }];
    const sizes = [[0, 100], [100, 0], [-5, 100], [100, -5], [NaN, 100], [100, NaN], [Infinity, 100], [100, Infinity], ['100', 100], [100, null], [undefined, undefined]];
    const pictures = [...sources, ...sizes.map(([width, height]) => ({ source: { name: 'screenshot' }, width, height }))];
    for (const picture of pictures) {
        const { result, canvases } = attempt(picture, LANDSCAPE);
        assert.equal(result, null, JSON.stringify(picture));
        assert.equal(canvases.length, 0, `${JSON.stringify(picture)} 不建 canvas`);
    }
    // 卡片的大小不對：同樣不建 canvas
    const cards = [null, undefined, {}, 42, 'card', ...[[0, 675], [1200, 0], [-1200, 675], [1200, -675], [NaN, 675], [1200, NaN], [Infinity, 675], [1200, Infinity], ['1200', 675], [1200, null]]
        .map(([width, height]) => ({ width, height }))];
    for (const card of cards) {
        const { result, canvases } = attempt(shot(1920, 1080), card);
        assert.equal(result, null, JSON.stringify(card));
        assert.equal(canvases.length, 0, `${JSON.stringify(card)} 不建 canvas`);
    }

    // 中途失敗：第 1 張、第 4 張、最後一張（第 8 張：放大的那一張）拿不到 2d、畫的時候丟例外、建 canvas 時丟例外：回傳 null，建過的每一張都放掉
    for (const behaviour of ['no-context', 'draw-throws', 'create-throws']) {
        for (const at of [1, 4, 8]) {
            const { result, canvases } = attempt(shot(1920, 1080), LANDSCAPE, behaviour, at);
            assert.equal(result, null, `${behaviour}、第 ${at} 張`);
            assert.equal(canvases.length, behaviour === 'create-throws' ? at - 1 : at, `${behaviour}、第 ${at} 張：建到失敗的那一張為止`);
            for (const canvas of canvases) assert.deepEqual(currentSize(canvas), [0, 0], `${behaviour}、第 ${at} 張：${canvas.created.join('×')} 放掉了`);
        }
    }

    // 沒給依賴（或沒有 createCanvas）：不丟錯
    assert.equal(blur(shot(1920, 1080), LANDSCAPE), null);
    assert.equal(blur(shot(1920, 1080), LANDSCAPE, {}), null);
    assert.equal(blur(shot(1920, 1080), LANDSCAPE, { createCanvas: 'not a function' }), null);
    // 沒有任何一張因為失敗而漏放：成功的那一次只留最後一張
    const ok = attempt(shot(1920, 1080), LANDSCAPE);
    assert.equal(ok.canvases.filter((canvas) => canvas.width > 0).length, 1);
});

test('blur：不改傳進來的東西（凍結的截圖、卡片、依賴也行），每次回傳新的物件與新的 canvas', () => {
    const picture = Object.freeze({ source: Object.freeze({ name: 'screenshot' }), width: 1920, height: 1080 });
    const { createCanvas, canvases } = stubCanvases();
    const deps = Object.freeze({ createCanvas });
    const one = blur(picture, LANDSCAPE, deps);
    const two = blur(picture, LANDSCAPE, deps);
    assert.notEqual(one, two);
    assert.notEqual(one.source, two.source);
    assert.equal(canvases.length, 16, '兩次各建 8 張');
    assert.deepEqual([one.width, one.height], [two.width, two.height]);
    assert.deepEqual([picture.width, picture.height], [1920, 1080]);
    assert.equal(Object.isFrozen(BLUR), true, 'BLUR 沒被改動');
    assert.deepEqual(plain(BLUR), { cell: 5.2, smooth: 4 });
});
