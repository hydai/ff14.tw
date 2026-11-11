/**
 * 角色卡產生器的角色圖：把使用者上傳的圖縮小、轉成 JPEG 的 data URL（卡片畫的與瀏覽器記住的是同一張），
 * 再把存著的 data URL 讀回來，並替名片做模糊的背景小圖。不碰 DOM、不讀時鐘、不自己建 Image 或 canvas：讀圖（loadImage）與建 canvas（createCanvas）
 * 由呼叫端傳進來，頁面傳瀏覽器的實作，測試傳替身。所有函式都不靠 this，不改傳進來的東西。
 *
 * - MAX_EDGE、QUALITY：第一次縮圖的長邊上限（2048px）與 JPEG 品質（0.85）
 * - MAX_DATA_URL：轉出來的 data URL 最長幾個字（150 萬）。瀏覽器的 localStorage 只有幾 MB，超過就很可能存不進去
 * - FALLBACK：超過 MAX_DATA_URL 時再轉一次用的 { maxEdge: 1600, quality: 0.8 }
 * - BLUR：名片的模糊背景用的 { cell: 5.2, smooth: 4 }（凍結）。cell 是縮小之後小圖的一個像素有多寬，單位是卡片寬度的 1%（草稿的 cqw）；
 *   smooth 是最後把小圖放大幾倍
 * - targetSize(width, height, maxEdge)：縮小之後的 { width, height }，長邊剛好是 maxEdge，不放大
 * - prepare(file, { loadImage, createCanvas })：讀圖 → 縮小 → 轉成 JPEG，回傳 Promise<{ dataUrl, width, height }>
 *   （width、height 是轉出來那張的大小）。dataUrl 超過 MAX_DATA_URL 就用 FALLBACK 再轉一次，第二次的結果不管多長都用
 *   （存不進去時頁面會告訴使用者這次不會記住）
 * - fromDataUrl(dataUrl, { loadImage })：把轉出來的（或記著的）data URL 讀回來，回傳 Promise<{ source, width, height }>，
 *   source 是 drawImage 認得的東西
 * - blur(picture, card, { createCanvas })：名片的模糊背景。picture 是讀進來的截圖 { source, width, height }，card 是卡片的 { width, height }
 *   （CardRenderer.SIZES 的一種，橫版與直版各做一張）。回傳 { source, width, height }，source 是一張很小的 canvas（頁面照 cover 鋪滿整張卡片，
 *   再壓暗），width、height 是它的大小；做不出來（拿不到 2d、截圖或卡片的大小不對、有一張 canvas 會超過 4096、建 canvas 或畫圖丟例外）是 null，不丟例外，建過的 canvas 都放掉
 *
 * 依賴的形狀：
 * - loadImage(input)：input 是 prepare 收到的檔案，或 fromDataUrl 收到的 data URL 字串；回傳 Promise<{ source, width, height }>，
 *   source 是解碼好的圖（drawImage 認得的東西），width、height 是它本身的大小；讀不出來就 reject
 * - createCanvas(width, height)：回傳有 getContext('2d') 與 toDataURL(type, quality) 的 canvas。轉完（中途失敗也一樣）CardImage 把它的
 *   width、height 設成 0 放掉（iOS Safari 的 canvas 記憶體有總量上限，不放掉，傳很多張圖之後就轉不出圖），所以每次都要回傳新的 canvas，不能留著重複用。
 *   blur() 也一樣：中間的 canvas 畫完下一張就放掉，只有回傳的那一張留著（用完由頁面放掉）
 *
 * 失敗（讀不出來、大小是 0、轉不成圖片、拿不到 2d）一律是 rejected 的 Promise，不留半個結果；blur() 是同步的，失敗是 null。
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 *
 * 模糊的做法（blur）：名片的背景是壓暗的模糊截圖，草稿是 CSS 的 blur(2.6cqw)。canvas 的 ctx.filter 舊的 Safari 沒有（畫出來會是沒模糊的圖），
 * 畫圖程式又不能碰 DOM，所以改成先縮小再放大：把截圖照 cover 放到卡片大小，再縮成「一個像素有 cellPx 寬」的小圖（cellPx = cell × 卡片寬度 / 100），
 * 小圖放大回去時，像素與像素之間由瀏覽器的縮放（imageSmoothing）補出平滑的漸層，看起來就是模糊。縮小時每一步長寬各減半（四捨五入，2×2 個像素取平均，
 * 接近方框濾波），減到再減半（寬或高）就比小圖小為止，最後一步才縮成小圖：一次縮很多倍，有的瀏覽器的縮小只看相鄰的幾個像素，邊緣會鋸齒；每一步都開 imageSmoothing（high）。
 * 減半剛好減到小圖的大小時，那一張就是小圖，不再多畫一張一樣大的；截圖本來就是小圖的大小，連減半都沒有，直接放大。
 * 方框濾波的標準差是 cellPx / √12，放大時的雙線性內插是 cellPx / √6，兩個變異數（cellPx² / 12 與 cellPx² / 6）相加是 cellPx² / 4，所以 σ 是 cellPx / 2，也就是 cell 的一半：cell 5.2 就是 σ ≈ 2.6cqw，和草稿的
 * blur(2.6cqw) 差不多（只在 macOS 的 Chrome 量過：拿草稿頁的示意截圖（1600×1000）做橫版 1200×675、直版 1080×1350 各一張，和 CSS 的
 * blur(2.6cqw) brightness(0.42) 逐像素比，均方根差不到 1（0～255），最大差 8；Safari、Firefox 沒量過）。最後把小圖再放大 smooth 倍畫進一張新的 canvas 回傳，頁面再把它放大到卡片的大小。
 *
 * canvas 大小的上限（BLUR_MAX_EDGE = 4096，不外露，也不是 BLUR 的欄位）：blur() 建的每一張 canvas，任何一邊都不超過 4096 像素。瀏覽器不肯給太大的 canvas：
 * 在 macOS 的 Chrome 量過，寬 88616 的 canvas 不丟例外，畫出來是透明的，名片的背景就變成底色加壓暗，接近全黑，不是預設背景。
 * 長寬比很極端的截圖才會超過（例如 2048×40：直版的小圖是 1231×24，放大 4 倍寬 4924；橫版的是 2216×44，沒問題），所以 blur() 先排好每一張要多大，
 * 有任何一張超過就一張都不建，直接回傳 null，頁面照 null 畫預設背景。4096 是保守的上限：挑的是比一般文件寫的各家瀏覽器 canvas 大小限制還小的數字
 * （沒有逐一在每一家瀏覽器量過）；兩邊都不超過 4096，面積也不會超過 4096 × 4096；剛好 4096 還行，只有「超過」才不做。
 */
const CardImage = (() => {
    'use strict';

    const MAX_EDGE = 2048;
    const QUALITY = 0.85;
    const MAX_DATA_URL = 1500000;
    const FALLBACK = Object.freeze({ maxEdge: 1600, quality: 0.8 });
    // 名片的模糊背景（blur）：cell 是縮小之後小圖的一個像素有多寬（單位是卡片寬度的 1%，草稿的 cqw），smooth 是最後把小圖放大幾倍（做法見檔頭）
    const BLUR = Object.freeze({ cell: 5.2, smooth: 4 });
    // blur() 建的每一張 canvas，任何一邊最多這麼長（像素）：瀏覽器不肯給太大的 canvas（原因見檔頭）。不外露，也不放進 BLUR（BLUR 就是 { cell, smooth }）
    const BLUR_MAX_EDGE = 4096;

    // JPEG 沒有透明：有透明的圖（PNG 去背的截圖）轉出來時，透明的地方各家瀏覽器不一樣（黑或白），所以先鋪一層不透明的底色。
    // 用預設背景起點的深藍紫（card-paint.js 的 BACKDROP_START）：透明的地方露出來的就是卡片本來的底色
    const FLATTEN_COLOR = '#1b1d45';
    // 圖片只收這個開頭的字串（和 card-state.js 存圖片的規則一樣）
    const IMAGE_PREFIX = 'data:image/';

    const isImageDataUrl = (value) => typeof value === 'string' && value.startsWith(IMAGE_PREFIX);
    const isSize = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
    // 沒有圖、或大小不對（0、負的、不是有限的數字）：讀進來的東西不能用
    const isPicture = (picture) => picture !== null && typeof picture === 'object' && Boolean(picture.source) && isSize(picture.width) && isSize(picture.height);
    // 卡片的大小（CardRenderer.SIZES 的一種）：寬高都是正的、有限的數字
    const isCard = (card) => card !== null && typeof card === 'object' && isSize(card.width) && isSize(card.height);

    /**
     * 縮小之後的大小：長邊超過 maxEdge 就縮成剛好 maxEdge，另一邊照比例（四捨五入，至少 1 像素）；長邊不超過就原樣，不放大。
     * @param {number} width
     * @param {number} height
     * @param {number} maxEdge - 長邊的上限；Infinity 是沒有上限
     * @returns {{width: number, height: number}} 新的物件；大小或上限不對（不是正的、有限的數字，maxEdge 可以是 Infinity）時是 0 × 0
     */
    function targetSize(width, height, maxEdge) {
        const edgeOk = isSize(maxEdge) || maxEdge === Infinity;
        if (!isSize(width) || !isSize(height) || !edgeOk) return { width: 0, height: 0 };
        if (Math.max(width, height) <= maxEdge) return { width, height };
        // 長邊直接給 maxEdge（不是乘上比例再四捨五入：浮點的誤差會讓它變成 2047 或 2049）
        if (width >= height) return { width: maxEdge, height: Math.max(1, Math.round(height * maxEdge / width)) };
        return { width: Math.max(1, Math.round(width * maxEdge / height)), height: maxEdge };
    }

    // 讀進來的圖縮成 maxEdge、鋪底色、畫上去、轉成 JPEG。picture 是 loadImage 的結果（已經確認過能用）。
    // 暫存的 canvas 用完（轉完、或中途失敗）就把寬高設成 0 放掉：iOS Safari 的 canvas 記憶體有總量上限，一個 session 裡傳了很多張圖都不放，
    // 之後就轉不出圖（畫面上變成「讀不出來」）；設成 0 是已知的放掉方法。回傳的大小是轉出來那張的（size），不是放掉之後的 0
    function encode(picture, maxEdge, quality, createCanvas) {
        const size = targetSize(picture.width, picture.height, maxEdge);
        const canvas = createCanvas(size.width, size.height);
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('拿不到 2d context，畫不了圖');
            ctx.fillStyle = FLATTEN_COLOR;
            ctx.fillRect(0, 0, size.width, size.height);
            // 縮得很多的圖（手機拍的、遊戲截圖常常比 2048 大好幾倍）用高品質的縮法，不然邊緣會鋸齒
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(picture.source, 0, 0, size.width, size.height);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            // canvas 太大時瀏覽器轉不出圖，回傳的是 "data:,"：不能當成功
            if (!isImageDataUrl(dataUrl)) throw new Error('canvas 轉不出圖片');
            return { dataUrl, width: size.width, height: size.height };
        } finally {
            canvas.width = 0;
            canvas.height = 0;
        }
    }

    /**
     * 讀進一張圖、縮小、轉成 JPEG 的 data URL。第一次用 MAX_EDGE 與 QUALITY；轉出來超過 MAX_DATA_URL（剛好等於不算超過）
     * 就用 FALLBACK 的上限與品質從讀進來的那張再轉一次（不是把第一次轉出來的 JPEG 再壓一次），第二次的結果不管多長都用。
     * @param {*} file - 傳給 loadImage 的東西（頁面傳使用者選的檔案）
     * @param {{loadImage: Function, createCanvas: Function}} deps
     * @returns {Promise<{dataUrl: string, width: number, height: number}>} width、height 是轉出來那張的大小
     */
    async function prepare(file, { loadImage, createCanvas }) {
        const picture = await loadImage(file);
        if (!isPicture(picture)) throw new Error('讀進來的圖不能用（沒有圖，或大小是 0）');
        const first = encode(picture, MAX_EDGE, QUALITY, createCanvas);
        if (first.dataUrl.length <= MAX_DATA_URL) return first;
        return encode(picture, FALLBACK.maxEdge, FALLBACK.quality, createCanvas);
    }

    /**
     * 把 data URL 讀回來（頁面打開時還原記著的圖片，也用它讀剛轉出來的那一張，這樣畫的和記的是同一張）。
     * @param {string} dataUrl - data:image/ 開頭的字串；其他的不交給 loadImage，直接 rejected
     * @param {{loadImage: Function}} deps
     * @returns {Promise<{source: *, width: number, height: number}>}
     */
    async function fromDataUrl(dataUrl, { loadImage }) {
        if (!isImageDataUrl(dataUrl)) throw new TypeError('不是圖片的 data URL');
        const picture = await loadImage(dataUrl);
        if (!isPicture(picture)) throw new Error('讀進來的圖不能用（沒有圖，或大小是 0）');
        return { source: picture.source, width: picture.width, height: picture.height };
    }

    // 每一步長寬各減半：四捨五入，至少 1 像素
    const halfOf = (size) => ({ width: Math.max(1, Math.round(size.width / 2)), height: Math.max(1, Math.round(size.height / 2)) });

    // canvas 放掉：寬高設成 0（同 encode()）。放不掉（例如 canvas 的寬高是唯讀的）就算了：blur() 說了不丟例外
    function release(canvas) {
        try {
            canvas.width = 0;
            canvas.height = 0;
        } catch (error) {
            // 不處理
        }
    }

    /**
     * 名片的模糊背景：把截圖縮成很小的一張再放大（做法與數字見檔頭）。每一步都是把前一張畫進一張新的 canvas、開 imageSmoothing（high）；
     * 畫完前一張就放掉，所以同時只有兩張 canvas 活著，回傳的那一張留給呼叫端（用完由頁面放掉）。同步，不丟例外。
     * 先排好每一張 canvas 要多大，再一張一張建：任何一張的任何一邊超過 BLUR_MAX_EDGE（長寬比很極端的截圖）就一張都不建，回傳 null。
     * 減半剛好減到小圖的大小時，那一張就是小圖，不再多畫一張一樣大的；截圖本來就是小圖的大小，連減半都沒有，直接放大。
     * @param {{source: *, width: number, height: number}} picture - 讀進來的截圖（fromDataUrl 的結果）
     * @param {{width: number, height: number}} card - 卡片的大小（CardRenderer.SIZES 的一種）
     * @param {{createCanvas: Function}} deps
     * @returns {{source: *, width: number, height: number} | null} source 是放大 BLUR.smooth 倍的那張小 canvas，width、height 是它的大小；
     *   做不出來（截圖或卡片的大小不對、有一張會超過 BLUR_MAX_EDGE、拿不到 2d、建 canvas 或畫圖丟例外）是 null，建過的 canvas 都放掉
     */
    function blur(picture, card, deps) {
        const made = []; // 建過的 canvas，照建的順序
        // 把 source 畫成 size 那麼大的一張新 canvas。畫完來源就用不到了：來源是前一張 canvas 的話在這裡放掉（截圖是呼叫端的，不放）
        const step = (createCanvas, source, size) => {
            const canvas = createCanvas(size.width, size.height);
            made.push(canvas);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('拿不到 2d context，畫不了圖');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(source, 0, 0, size.width, size.height);
            if (made.length > 1) release(made[made.length - 2]);
            return canvas;
        };
        try {
            if (!isPicture(picture) || !isCard(card)) return null;
            const { createCanvas } = deps;
            // 小圖：截圖照 cover 放到卡片大小（放大的倍率是兩個方向裡比較大的那個），再除以 cellPx（小圖一個像素有多寬，單位是卡片的像素）
            const cellPx = BLUR.cell * card.width / 100;
            const cover = Math.max(card.width / picture.width, card.height / picture.height);
            const small = {
                width: Math.max(1, Math.round(picture.width * cover / cellPx)),
                height: Math.max(1, Math.round(picture.height * cover / cellPx))
            };
            // 每一張 canvas 要多大：從截圖開始一步一步減半，減到再減半（寬或高）就比小圖小為止（1×1 減半還是 1×1，也停）；
            // 減半沒有剛好減到小圖的大小才再畫一張小圖；最後是小圖放大 BLUR.smooth 倍
            const plan = [];
            let size = { width: picture.width, height: picture.height };
            for (;;) {
                const half = halfOf(size);
                if (half.width < small.width || half.height < small.height || (half.width === size.width && half.height === size.height)) break;
                plan.push(half);
                size = half;
            }
            if (size.width !== small.width || size.height !== small.height) plan.push(small);
            const big = { width: small.width * BLUR.smooth, height: small.height * BLUR.smooth };
            plan.push(big);
            // 有哪一張的哪一邊超過 BLUR_MAX_EDGE，一張都不建（瀏覽器不肯給那麼大的 canvas，名片會畫出透明的背景）：回傳 null，頁面畫預設背景
            if (plan.some((planned) => planned.width > BLUR_MAX_EDGE || planned.height > BLUR_MAX_EDGE)) return null;
            let source = picture.source;
            for (const planned of plan) source = step(createCanvas, source, planned);
            return { source, width: big.width, height: big.height };
        } catch (error) {
            for (const canvas of made) release(canvas);
            return null;
        }
    }

    return Object.freeze({ MAX_EDGE, QUALITY, FALLBACK, MAX_DATA_URL, BLUR, targetSize, prepare, fromDataUrl, blur });
})();

// Export for use in other modules
window.CardImage = CardImage;
