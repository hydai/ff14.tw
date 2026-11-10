/**
 * 角色卡產生器的角色圖：把使用者上傳的圖縮小、轉成 JPEG 的 data URL（卡片畫的與瀏覽器記住的是同一張），
 * 再把存著的 data URL 讀回來。不碰 DOM、不讀時鐘、不自己建 Image 或 canvas：讀圖（loadImage）與建 canvas（createCanvas）
 * 由呼叫端傳進來，頁面傳瀏覽器的實作，測試傳替身。所有函式都不靠 this，不改傳進來的東西。
 *
 * - MAX_EDGE、QUALITY：第一次縮圖的長邊上限（2048px）與 JPEG 品質（0.85）
 * - MAX_DATA_URL：轉出來的 data URL 最長幾個字（150 萬）。瀏覽器的 localStorage 只有幾 MB，超過就很可能存不進去
 * - FALLBACK：超過 MAX_DATA_URL 時再轉一次用的 { maxEdge: 1600, quality: 0.8 }
 * - targetSize(width, height, maxEdge)：縮小之後的 { width, height }，長邊剛好是 maxEdge，不放大
 * - prepare(file, { loadImage, createCanvas })：讀圖 → 縮小 → 轉成 JPEG，回傳 Promise<{ dataUrl, width, height }>
 *   （width、height 是轉出來那張的大小）。dataUrl 超過 MAX_DATA_URL 就用 FALLBACK 再轉一次，第二次的結果不管多長都用
 *   （存不進去時頁面會告訴使用者這次不會記住）
 * - fromDataUrl(dataUrl, { loadImage })：把轉出來的（或記著的）data URL 讀回來，回傳 Promise<{ source, width, height }>，
 *   source 是 drawImage 認得的東西
 *
 * 依賴的形狀：
 * - loadImage(input)：input 是 prepare 收到的檔案，或 fromDataUrl 收到的 data URL 字串；回傳 Promise<{ source, width, height }>，
 *   source 是解碼好的圖（drawImage 認得的東西），width、height 是它本身的大小；讀不出來就 reject
 * - createCanvas(width, height)：回傳有 getContext('2d') 與 toDataURL(type, quality) 的 canvas。轉完（中途失敗也一樣）CardImage 把它的
 *   width、height 設成 0 放掉（iOS Safari 的 canvas 記憶體有總量上限，不放掉，傳很多張圖之後就轉不出圖），所以每次都要回傳新的 canvas，不能留著重複用
 *
 * 失敗（讀不出來、大小是 0、轉不成圖片、拿不到 2d）一律是 rejected 的 Promise，不留半個結果。
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 */
const CardImage = (() => {
    'use strict';

    const MAX_EDGE = 2048;
    const QUALITY = 0.85;
    const MAX_DATA_URL = 1500000;
    const FALLBACK = Object.freeze({ maxEdge: 1600, quality: 0.8 });

    // JPEG 沒有透明：有透明的圖（PNG 去背的截圖）轉出來時，透明的地方各家瀏覽器不一樣（黑或白），所以先鋪一層不透明的底色。
    // 用預設背景起點的深藍紫（card-renderer.js 的 COLORS.backdropStart）：透明的地方露出來的就是卡片本來的底色
    const FLATTEN_COLOR = '#1b1d45';
    // 圖片只收這個開頭的字串（和 card-state.js 存圖片的規則一樣）
    const IMAGE_PREFIX = 'data:image/';

    const isImageDataUrl = (value) => typeof value === 'string' && value.startsWith(IMAGE_PREFIX);
    const isSize = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
    // 沒有圖、或大小不對（0、負的、不是有限的數字）：讀進來的東西不能用
    const isPicture = (picture) => picture !== null && typeof picture === 'object' && Boolean(picture.source) && isSize(picture.width) && isSize(picture.height);

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

    return Object.freeze({ MAX_EDGE, QUALITY, FALLBACK, MAX_DATA_URL, targetSize, prepare, fromDataUrl });
})();

// Export for use in other modules
window.CardImage = CardImage;
