/**
 * PNG 的讀、寫與重新壓縮：只用 node:zlib 與 node:buffer，沒有任何套件。
 *
 * 預覽圖的流程用它做三件事：
 *   - 把 Chrome 截出來的 PNG 重新壓縮（recompressPng，也就是 decodePng 再 encodePng）；
 *   - 在 PNG 裡記下產生它的內容的雜湊（withTextChunk，tEXt 區塊，keyword 是 SOURCE_KEYWORD）；
 *   - 讀出尺寸與雜湊，檢查圖是不是最新的（readPngInfo）。
 *
 * 只能解 8 位元、不交錯的 RGB（color type 2）與 RGBA（color type 6），調色盤、灰階、16 位元與交錯的圖丟錯。
 * decodePng 只留像素：iCCP、gAMA、pHYs、tEXt 這些附屬區塊不會跟著 encodePng 寫進新的檔案。
 * withTextChunk 不解壓縮，原本的區塊（包括壓縮好的 IDAT）一個位元組都不動。
 *
 * 這個模組不讀檔、不寫檔，傳進去、拿回來的都是 Buffer。
 */
import { Buffer } from 'node:buffer';
import { deflateSync, inflateSync } from 'node:zlib';

// 預覽圖的 PNG 裡，記下「產生它的內容」雜湊的 tEXt 區塊的 keyword
export const SOURCE_KEYWORD = 'ff14tw-source';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_DIMENSION = 0x7fffffff; // PNG 規定寬和高最大 2^31 - 1
const SUPPORTED = '只能處理 8 位元、不交錯的 RGB（color type 2）或 RGBA（color type 6）';

// ---------- CRC-32（每個區塊尾端的檢查碼；自己算一張表，不靠 Node 新版才有的 zlib.crc32） ----------

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

// 把好幾段位元組當成一串算 CRC（區塊的檢查碼涵蓋「類型＋資料」）
function crc32(...parts) {
    let crc = 0xffffffff;
    for (const part of parts) {
        for (let i = 0; i < part.length; i++) crc = CRC_TABLE[(crc ^ part[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// ---------- 區塊 ----------

// 組一個區塊：長度（4）、類型（4）、資料、CRC（4）
function makeChunk(type, data) {
    const typeBytes = Buffer.from(type, 'latin1');
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    typeBytes.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(typeBytes, data), 8 + data.length);
    return chunk;
}

/**
 * 讀出檔案裡的每個區塊（到 IEND 為止，後面多出來的位元組不管）。
 * 檢查簽章、每個區塊的長度與 CRC、第一個是 IHDR、最後有 IEND；不合就丟錯。
 * bytes 是整個區塊（含長度、類型與 CRC），拿去原封不動地寫回新檔案。
 * @param {Buffer} png
 * @returns {{ type: string, data: Buffer, bytes: Buffer }[]}
 */
function readChunks(png) {
    if (png.length < SIGNATURE.length || !png.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
        throw new Error('不是 PNG：檔案開頭的簽章不對');
    }
    const chunks = [];
    let offset = SIGNATURE.length;
    while (offset < png.length) {
        if (offset + 12 > png.length) throw new Error('PNG 檔被截斷：最後一個區塊不完整');
        const length = png.readUInt32BE(offset);
        const type = png.toString('latin1', offset + 4, offset + 8);
        const end = offset + 12 + length;
        if (end > png.length) throw new Error(`PNG 檔被截斷：${type} 區塊的資料不完整`);
        if (crc32(png.subarray(offset + 4, end - 4)) !== png.readUInt32BE(end - 4)) {
            throw new Error(`PNG 的 ${type} 區塊 CRC 不符，檔案壞了`);
        }
        chunks.push({ type, data: png.subarray(offset + 8, end - 4), bytes: png.subarray(offset, end) });
        if (type === 'IEND') {
            if (chunks[0].type !== 'IHDR') throw new Error('PNG 的第一個區塊不是 IHDR');
            return chunks;
        }
        offset = end;
    }
    throw new Error('PNG 檔被截斷：沒有 IEND 區塊');
}

function readHeader(chunks) {
    const { data } = chunks[0];
    if (data.length !== 13) throw new Error(`PNG 的 IHDR 區塊長度是 ${data.length}，應該是 13`);
    return {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filterMethod: data[11],
        interlace: data[12]
    };
}

// tEXt 區塊的資料是「keyword、一個 NUL、文字」，都是 Latin-1
function readText(data) {
    const nul = data.indexOf(0);
    if (nul === -1) throw new Error('PNG 的 tEXt 區塊格式不對：keyword 後面沒有 NUL');
    return [data.toString('latin1', 0, nul), data.toString('latin1', nul + 1)];
}

// ---------- 讀尺寸與文字 ----------

/**
 * 讀出尺寸與 tEXt 區塊。不管 color type 是什麼都讀得出來，不解壓縮。
 * 同一個 keyword 出現好幾次時，以最後一個為準。
 * @param {Buffer} png
 * @returns {{ width: number, height: number, text: Map<string, string> }}
 */
export function readPngInfo(png) {
    const chunks = readChunks(png);
    const { width, height } = readHeader(chunks);
    const text = new Map();
    for (const chunk of chunks) {
        if (chunk.type !== 'tEXt') continue;
        const [keyword, value] = readText(chunk.data);
        text.set(keyword, value);
    }
    return { width, height, text };
}

// ---------- filter ----------

// PNG 的五種 filter（0 None、1 Sub、2 Up、3 Average、4 Paeth）：每個位元組先用左邊（a）、上面（b）、左上（c）三個位元組預測，
// 檔案裡存的是「實際的值減預測」（256 的餘數），解碼時再加回去。a、b、c 都是還原後的像素值；
// 圖外面的位置（第一個像素的左邊、第一列的上面）當作 0；「左邊」是往回數 channels 個位元組（同一個色版的前一個像素）
function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
}
const PREDICTORS = [() => 0, (a) => a, (a, b) => b, (a, b) => (a + b) >> 1, paeth];

// 差值（0～255）當成有號數的絕對值：越接近 0 越好壓。每一列挑這個總和最小的 filter
const MAGNITUDE = Uint8Array.from({ length: 256 }, (_, v) => (v < 128 ? v : 256 - v));

// 每一列前面加一個 filter 位元組，後面是濾過的像素。同分取編號小的 filter
function filterRows({ width, height, channels, pixels }) {
    const stride = width * channels;
    const out = Buffer.alloc(height * (stride + 1));
    const nothing = Buffer.alloc(stride);
    const sums = new Float64Array(PREDICTORS.length);
    for (let y = 0; y < height; y++) {
        const row = pixels.subarray(y * stride, (y + 1) * stride);
        const above = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : nothing;
        sums.fill(0);
        for (let i = 0; i < stride; i++) {
            const a = i >= channels ? row[i - channels] : 0;
            const b = above[i];
            const c = i >= channels ? above[i - channels] : 0;
            for (let type = 0; type < PREDICTORS.length; type++) {
                sums[type] += MAGNITUDE[(row[i] - PREDICTORS[type](a, b, c)) & 0xff];
            }
        }
        let best = 0;
        for (let type = 1; type < PREDICTORS.length; type++) {
            if (sums[type] < sums[best]) best = type;
        }
        const start = y * (stride + 1);
        const predict = PREDICTORS[best];
        out[start] = best;
        for (let i = 0; i < stride; i++) {
            const a = i >= channels ? row[i - channels] : 0;
            const c = i >= channels ? above[i - channels] : 0;
            out[start + 1 + i] = (row[i] - predict(a, above[i], c)) & 0xff;
        }
    }
    return out;
}

// filterRows 的反向：raw 是解壓縮之後的資料，回傳還原好的像素
function unfilterRows(raw, width, height, channels) {
    const stride = width * channels;
    const pixels = Buffer.alloc(height * stride);
    const nothing = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const start = y * (stride + 1);
        const type = raw[start];
        if (type >= PREDICTORS.length) throw new Error(`PNG 第 ${y + 1} 列的 filter 類型是 ${type}，只有 0～4`);
        const predict = PREDICTORS[type];
        const row = pixels.subarray(y * stride, (y + 1) * stride);
        const above = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : nothing;
        for (let i = 0; i < stride; i++) {
            const a = i >= channels ? row[i - channels] : 0;
            const c = i >= channels ? above[i - channels] : 0;
            row[i] = (raw[start + 1 + i] + predict(a, above[i], c)) & 0xff;
        }
    }
    return pixels;
}

// ---------- 解碼與編碼 ----------

const CHANNELS_OF_COLOR_TYPE = new Map([[2, 3], [6, 4]]);
const UNSUPPORTED_COLOR_TYPES = new Map([[0, '灰階'], [3, '調色盤'], [4, '灰階加透明']]);

/**
 * 解出像素。只支援 8 位元、不交錯的 RGB 與 RGBA，其他的丟錯；IDAT 可以分成好幾個區塊，不認得的附屬區塊直接略過。
 * @param {Buffer} png
 * @returns {{ width: number, height: number, channels: 3 | 4, pixels: Buffer }} pixels 是由上而下、由左而右的 RGB 或 RGBA
 */
export function decodePng(png) {
    const chunks = readChunks(png);
    const { width, height, bitDepth, colorType, compression, filterMethod, interlace } = readHeader(chunks);
    const channels = CHANNELS_OF_COLOR_TYPE.get(colorType);
    if (channels === undefined) {
        throw new Error(`不支援這種 PNG：${UNSUPPORTED_COLOR_TYPES.get(colorType) ?? '不認得的格式'}（color type ${colorType}）。${SUPPORTED}`);
    }
    if (bitDepth !== 8) throw new Error(`不支援這種 PNG：${bitDepth} 位元。${SUPPORTED}`);
    if (interlace !== 0) throw new Error(`不支援這種 PNG：交錯（Adam7）。${SUPPORTED}`);
    if (compression !== 0 || filterMethod !== 0) throw new Error(`PNG 的 IHDR 不合規格：壓縮方法 ${compression}、filter 方法 ${filterMethod}，都只能是 0`);
    if (width === 0 || height === 0) throw new Error(`PNG 的寬或高是 0（${width}×${height}）`);

    const compressed = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
    let raw;
    try {
        raw = inflateSync(compressed);
    } catch (error) {
        throw new Error(`PNG 的像素資料解不開：${error.message}`);
    }
    const expected = height * (width * channels + 1);
    if (raw.length !== expected) {
        throw new Error(`PNG 的像素資料長度不對：解壓縮之後有 ${raw.length} 個位元組，${width}×${height} 的 ${channels} 色版應該有 ${expected} 個`);
    }
    return { width, height, channels, pixels: unfilterRows(raw, width, height, channels) };
}

/**
 * 把像素編成 PNG：8 位元、不交錯；每一列試五種 filter，取差值（當成有號數）絕對值總和最小的；zlib level 9。
 * 只有 IHDR、一個 IDAT 和 IEND，沒有任何附屬區塊。
 * @param {{ width: number, height: number, channels: 3 | 4, pixels: Uint8Array }} image pixels 是由上而下、由左而右的 RGB 或 RGBA
 * @returns {Buffer}
 */
export function encodePng({ width, height, channels, pixels }) {
    const isDimension = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_DIMENSION;
    if (!isDimension(width) || !isDimension(height)) throw new Error(`encodePng：寬和高要是 1～${MAX_DIMENSION} 的整數，拿到 ${width}×${height}`);
    if (channels !== 3 && channels !== 4) throw new Error(`encodePng：channels 只能是 3（RGB）或 4（RGBA），拿到 ${channels}`);
    const expected = width * height * channels;
    if (pixels.length !== expected) throw new Error(`encodePng：像素有 ${pixels.length} 個位元組，${width}×${height} 的 ${channels} 色版應該有 ${expected} 個`);

    const header = Buffer.alloc(13); // 壓縮方法、filter 方法、交錯都是 0
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = channels === 4 ? 6 : 2;
    const compressed = deflateSync(filterRows({ width, height, channels, pixels }), { level: 9 });
    return Buffer.concat([SIGNATURE, makeChunk('IHDR', header), makeChunk('IDAT', compressed), makeChunk('IEND', Buffer.alloc(0))]);
}

/**
 * 解開再編碼（見 encodePng），原本的 tEXt 與其他附屬區塊都不帶。
 * @param {Buffer} png
 * @returns {Buffer}
 */
export function recompressPng(png) {
    return encodePng(decodePng(png));
}

// ---------- 寫入 tEXt ----------

// keyword：1～79 個 Latin-1 的可見字元（33～126、161～255），中間可以有空格，但頭尾不行、也不能連續兩個
const KEYWORD_PATTERN = /^[\x21-\x7e\xa1-\xff](?:[\x20-\x7e\xa1-\xff]{0,77}[\x21-\x7e\xa1-\xff])?$/;
// 文字：Latin-1，不能有 NUL（空的可以）
const TEXT_PATTERN = /^[\x01-\xff]*$/;

/**
 * 回傳一份多了 tEXt 區塊的 PNG：同一個 keyword 原本的 tEXt 拿掉，新的放在 IEND 前面。
 * 不解壓縮，其他區塊原封不動；傳進去的 Buffer 不會被改。
 * @param {Buffer} png
 * @param {string} keyword
 * @param {string} text
 * @returns {Buffer}
 */
export function withTextChunk(png, keyword, text) {
    if (typeof keyword !== 'string' || !KEYWORD_PATTERN.test(keyword) || keyword.includes('  ')) {
        throw new Error(`withTextChunk：keyword 不合 PNG 的規定（1～79 個 Latin-1 的可見字元，頭尾不能是空格，也不能連續兩個空格）：${JSON.stringify(keyword)}`);
    }
    if (typeof text !== 'string' || !TEXT_PATTERN.test(text)) {
        throw new Error(`withTextChunk：文字要是 Latin-1 的字串，而且不能有 NUL：${JSON.stringify(text)}`);
    }
    const chunks = readChunks(png).filter((chunk) => chunk.type !== 'tEXt' || readText(chunk.data)[0] !== keyword);
    const end = chunks.pop(); // readChunks 保證最後一個是 IEND
    const data = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]);
    return Buffer.concat([SIGNATURE, ...chunks.map((chunk) => chunk.bytes), makeChunk('tEXt', data), end.bytes]);
}
