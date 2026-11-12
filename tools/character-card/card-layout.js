/**
 * 角色卡產生器的版面計算：名字太長時縮多少、一段文字怎麼折行、膠囊怎麼排、截圖怎麼填滿框與拖曳縮放，
 * 以及重點色上的字用白色還是深色。都是純函式，不碰 DOM、不碰 canvas：文字有多寬由呼叫端傳進來的
 * measure(text) 回答（字型已經套好，例如 (text) => ctx.measureText(text).width），所以 node 裡用假的量字函式就測得到。
 * 所有函式都不靠 this、不改傳進來的東西（傳凍結的資料也行），所以頁面可以解構出來單獨呼叫；
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到。
 *
 * - fitScale(textWidth, maxWidth, minScale = 0.55)：名字放不下時整行縮多少。放得下是 1，否則 max(minScale, maxWidth / textWidth)。
 * - graphemes(text)：把一段字切成「看起來是一個字」的單位（字素，grapheme）的陣列。國旗（兩個區域指示符號）、家庭 emoji（用零寬連接符號接起來的
 *   幾個 emoji）、加上膚色的 emoji、鍵帽、e 加上重音符號這類組合字，各是一個；其他的字（中日韓、拉丁字母、標點、空白、單一個 emoji、罕用字）
 *   每個 Unicode 字元一個，所以一般的字切出來和 Array.from 一樣。\r\n 也是一個字素。卡片上凡是一個字一個字處理的地方（一個字一個字畫、折行、
 *   取第一個字）都用它。用瀏覽器內建的 Intl.Segmenter（granularity: 'grapheme'，載入時建一次）切；沒有它的舊瀏覽器（Firefox 125 以前）
 *   退回 Array.from：每個 Unicode 字元一個（不會把代理對拆成兩半，但國旗會被拆成兩個區域指示符號）。
 *   接起來永遠是原文；空字串與不是字串都是 []，每次回傳新的陣列。
 * - wrapText(text, maxWidth, measure, maxLines)：折成一行一個字串的陣列。下面說的「一個字」都是一個字素（見 graphemes）。
 *   - 中日韓的字任兩個字之間都能斷：CJK 統一表意文字（含擴充 A）、CJK 標點、平假名與片假名、韓文、全形與半形字。
 *     其他文字（英文、數字、西里爾字母…）只在空白斷，單一個字比 maxWidth 還寬時才從單字裡逐字斷。
 *   - 以字素為單位：國旗、家庭 emoji、e 加重音符號都是整個在這一行或整個在下一行，斷行、從單字裡斷、接上 … 都不會切在它們中間，
 *     也不會把代理對（emoji、罕用字）拆成兩半。能不能斷、行首能不能放，看字素的第一個字元；算不算空白，要整個字素都是空白：
 *     「空格加組合符號」（顏文字常有，例如 Lenny 臉）是一個字、不是空白，所以不會被拿掉，也不會因為它有空格就在它前後斷行。
 *     沒有 Intl.Segmenter 的舊瀏覽器退回以 Unicode 字元為單位。
 *   - 每一行開頭與結尾只由空白組成的字素拿掉；換行與 tab 也只是空白（canvas 畫字時本來就當成空白），所以一行裡不會有換行字元：
 *     每個換行字元變成一個空白（\r\n 是兩個字元，所以是兩個空白，和以前一樣）。
 *   - 行首禁用：「，。、！？；：」』）〉》」和半形的「,.!?;:)」不放在行首。斷在它前面的話，往前找最近的、能斷的位置，
 *     整個英文單字會跟著標點一起下去（「FFXIV，」不會被拆成「FFXI」「V，」）；找不到這樣的位置（例如單字從這一行的
 *     開頭就放不下，本來就只能從單字裡斷）時，才一個字一個字往前帶，讓標點前面的字跟著下去。怎麼排都排不出這樣的行
 *     （例如一行只放得下一個字）時照一般的排法，不留空行。
 *   - 一個字就比 maxWidth 寬時，那個字自己一行（每一行至少一個字，所以不管多窄都會往前）。
 *   - 超過 maxLines 行時，最後一行切到接上 … 之後放得下，並先拿掉 … 前面的空白；連 … 都放不下時只剩 …。
 *   - 空字串、只有空白、maxLines 小於 1、text 不是字串都是 []；maxLines 不傳是不限行數，小數無條件捨去。
 * - layoutChips(labels, measure, { maxWidth, height, padX, gap, rowGap, maxRows })：膠囊的位置，座標從 (0, 0) 起算。
 *   一顆的寬度是 measure(label) + 2 * padX；一列放不下就換下一列（列的 y 是 列數 * (height + rowGap)，每列靠左，
 *   膠囊之間隔 gap）。一列一列照順序排：一顆需要超過 maxRows 的列數時，它和後面的都不回傳，不會補進前面的列的空位。
 *   一顆就比 maxWidth 寬的不縮小、不回傳，別顆照排。padX、gap、rowGap 沒寫是 0，maxRows 沒寫是不限。
 * - coverRect(imgW, imgH, boxW, boxH, crop)：圖要畫在框裡的哪裡（相對於框的左上角），填滿整個框、超出的部分由呼叫端裁掉，
 *   回傳 { dx, dy, dw, dh }，直接給 drawImage。crop 是 { x, y, zoom }：x、y 是 -1～1（-1 對齊左／上邊、0 置中、
 *   1 對齊右／下邊），zoom 是 1～3（1 剛好填滿）。crop 少了欄位或不是有限的數字時當成 { x: 0, y: 0, zoom: 1 }，範圍外的夾進去
 *   （同 card-state.js 的 cleanCrop），所以不會留白。圖或框的大小不是正的有限數字時什麼都不畫（全是 0）。
 * - dragCrop(crop, dxPx, dyPx, imgW, imgH, boxW, boxH)：手指在框裡拖了 dxPx、dyPx（和 boxW、boxH 同一個像素單位）之後的新位置：
 *   圖移動同樣的距離，再換回 x、y。往右拖 x 變小，往左拖 x 變大，夾在 -1～1；zoom 照舊。那個方向沒有多出來的長度
 *   （圖剛好和框一樣寬或高，差在浮點誤差以內）時是 0，因為沒有東西可以拖。回傳新的物件。
 * - canPan(imgW, imgH, boxW, boxH, zoom)：圖放進框裡，左右（x）、上下（y）各有沒有東西可以移，回傳 { x: boolean, y: boolean }（每次是新的物件）。
 *   照 coverRect 算（位置不影響多出來的長度，只有 zoom 有影響；zoom 不是有限的數字當成 1、範圍外的夾進去，同 coverRect），那個方向多出來的長度
 *   大於 dragCrop 用的誤差（EDGE_EPSILON，同一個算法）才是 true：所以 canPan 是 false 的方向 dragCrop 怎麼拖都是 0，位置滑桿也沒有東西可以移。
 *   圖或框的大小不是正的有限數字時兩個都是 false。
 * - contrastRatio(a, b)：兩個 '#rrggbb'（大小寫都行）的 WCAG 對比度，1（一樣）～21（黑白），和先後無關。有一個不是 '#rrggbb' 的東西是 1。
 * - textColorOn(hex)：'#rrggbb' 的底色上用白字（'#ffffff'）還是深色字（'#141826'）：算兩個的 WCAG 對比度（contrastRatio），高的那個贏，
 *   一樣高是白字。不是 '#rrggbb'（大小寫都行）的東西是白字。
 */
const CardLayout = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    // 圖與框的大小：正的有限數字
    const isSize = (value) => Number.isFinite(value) && value > 0;

    // ---------- 縮放 ----------

    // 名字再長也不縮到比原本的 55% 小
    const MIN_SCALE = 0.55;

    /**
     * 一行字放不下時要縮到幾倍才放得下。
     * @param {number} textWidth - 這行字原本的寬度
     * @param {number} maxWidth - 能用的寬度
     * @param {number} [minScale] - 縮的下限，預設 0.55
     * @returns {number} 放得下是 1，否則 max(minScale, maxWidth / textWidth)。兩個寬度有一個不是數字時是 1（不縮）
     */
    function fitScale(textWidth, maxWidth, minScale = MIN_SCALE) {
        // 寫成 !(a > b)：兩個數有一個是 NaN 時也當成放得下
        if (!(textWidth > maxWidth)) return 1;
        return Math.max(minScale, maxWidth / textWidth);
    }

    // ---------- 看起來是一個字（字素）----------

    // 切字素用的 Intl.Segmenter，載入時建一次。沒有它的舊瀏覽器（Firefox 125 以前）是 null：graphemes() 照 Unicode 字元切
    const SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;

    /**
     * 把一段字切成「看起來是一個字」的單位（字素）：國旗、家庭 emoji、膚色、鍵帽、e 加重音符號各是一個，其他的字每個 Unicode 字元一個。
     * 規則見檔案開頭的說明。
     * @param {string} text
     * @returns {string[]} 每一項是一個字素，接起來是 text；沒有字或 text 不是字串是 []。每次都是新的陣列
     */
    function graphemes(text) {
        if (typeof text !== 'string') return [];
        if (SEGMENTER === null) return Array.from(text);
        return Array.from(SEGMENTER.segment(text), (part) => part.segment);
    }

    // ---------- 折行 ----------

    // 任兩個字之間都能斷的字（中日韓沒有空白分詞）。每一項是一個 Unicode 區塊的 [起, 迄]（都含）。
    // 都在 BMP 裡，所以一個代理對（emoji、罕用字）的字元碼永遠不在裡面
    const BREAK_ANYWHERE = Object.freeze([
        [0x1100, 0x11ff], // 韓文字母
        [0x3000, 0x303f], // CJK 標點
        [0x3040, 0x30ff], // 平假名與片假名
        [0x3130, 0x318f], // 韓文相容字母
        [0x3400, 0x4dbf], // CJK 擴充 A
        [0x4e00, 0x9fff], // CJK 統一表意文字
        [0xac00, 0xd7af], // 韓文音節
        [0xff00, 0xffef] // 全形與半形字
    ]);
    // unit 是一個字素：看它的第一個字元（字素裡接在後面的是組合用的記號，不影響）
    const breaksAnywhere = (unit) => {
        const code = unit.codePointAt(0);
        return BREAK_ANYWHERE.some(([from, to]) => code >= from && code <= to);
    };
    // 行首不能放的字：逗號、句號、頓號、驚嘆號、問號、分號、冒號、右引號、右括號（全形與半形）
    const NO_LINE_START = new Set(Array.from('，。、！？；：」』）〉》,.!?;:)'));
    // 一個字素的第一個字元：行首能不能放（NO_LINE_START）看它
    const headOf = (unit) => String.fromCodePoint(unit.codePointAt(0));
    // 算不算空白：整個字素都是空白才算。空白同 \s，包含全形空白（0x3000，同時在 BREAK_ANYWHERE 裡，當成空白處理，行首、行尾會被拿掉）與不換行空白。
    // 只有一個字元的字素，和直接問那個字元是不是 \s 一樣；空格加組合符號（顏文字常有）是一個字、不是空白：只看第一個字元的話，
    // 它在行首會被跳過、符號就不見了，前後也會被當成能斷行的空白
    const isSpace = (unit) => !/\S/.test(unit);
    // 換行、tab 之類：水平 tab、換行、垂直 tab、換頁、歸位（0x09～0x0d）、NEL（0x85）、行分隔與段分隔（0x2028、0x2029）。
    // 換成一般的空白，一行裡才不會有換行字元
    const isLineBreak = (code) => (code >= 0x09 && code <= 0x0d) || code === 0x85 || code === 0x2028 || code === 0x2029;
    const ELLIPSIS = '…';

    // 位置 at（第 at 個字的前面，0 < at < chars.length）能不能斷行：前後有空白，或前後有一個是任兩個字之間都能斷的字
    function canBreakAt(chars, at) {
        const before = chars[at - 1];
        const after = chars[at];
        return isSpace(before) || isSpace(after) || breaksAnywhere(before) || breaksAnywhere(after);
    }

    // 從位置 at 起第一個不是空白的字的位置（後面都是空白就是 chars.length）
    function skipSpaces(chars, at) {
        let next = at;
        while (next < chars.length && isSpace(chars[next])) next++;
        return next;
    }

    // chars[from, to) 這一段字，拿掉行尾的空白（行首的空白在換行時已經跳過了）。用 trimEnd，不用 trim：一個比整行還寬的顏文字硬斷時，
    // 行首可以是「空格加組合符號」，trim 會把那個空格拿掉，留下沒有依附的符號，等於又把一個字拆開
    const lineText = (chars, from, to) => chars.slice(from, to).join('').trimEnd();

    // 這一行最多到 limit（不含）：chars[limit] 放不下。挑真正斷開的位置：
    // 1. 往前找最近的、能斷的位置，而且下一行不從行首禁用的字開始（英文單字整個跟著下一行）
    // 2. 沒有的話（單字太長、本來就只能從單字裡斷，或前面的位置都不行）：往前找最近的、下一行不從行首禁用的字開始的位置
    //    （標點前面的那個字一起下去）
    // 3. 還是沒有（怎麼斷下一行都從行首禁用的字開始，或只剩一個字）：照原本的 limit，不留空行
    function chooseBreak(chars, start, limit) {
        // 下一行從 at 之後第一個不是空白的字開始：那個字（後面沒有字就沒有）不能是行首禁用的
        const startsAllowed = (at) => {
            const next = skipSpaces(chars, at);
            return next >= chars.length || !NO_LINE_START.has(headOf(chars[next]));
        };
        for (let at = limit; at > start; at--) {
            if (canBreakAt(chars, at) && startsAllowed(at)) return at;
        }
        for (let at = limit; at > start; at--) {
            if (startsAllowed(at)) return at;
        }
        return limit;
    }

    // 從 start（一個不是空白的字）開始的這一行，結束在哪裡（不含）。至少一個字，所以不管多窄都會往前
    function lineEnd(chars, start, maxWidth, measure) {
        // 一個字一個字加進來，量到放不下為止（行尾的空白不算寬度）
        let end = start + 1;
        while (end <= chars.length && measure(lineText(chars, start, end)) <= maxWidth) end++;
        if (end > chars.length) return chars.length; // 剩下的全放得下
        // chars[end - 1] 是放不下的那個字，這一行最多到它前面
        const limit = end - 1;
        if (limit <= start) return start + 1; // 一個字就比 maxWidth 寬：自己一行
        return chooseBreak(chars, start, limit);
    }

    // 把 chars[from, to) 這一行切到接上 … 之後放得下
    function ellipsize(chars, from, to, maxWidth, measure) {
        for (let end = to; end > from; end--) {
            const text = lineText(chars, from, end);
            if (measure(text + ELLIPSIS) <= maxWidth) return text + ELLIPSIS;
        }
        return ELLIPSIS;
    }

    /**
     * 把一段文字折成一行一行。規則見檔案開頭的說明。
     * @param {string} text
     * @param {number} maxWidth - 一行能用的寬度
     * @param {(text: string) => number} measure - 量一段字有多寬（字型已經套好）
     * @param {number} [maxLines] - 最多幾行，不傳是不限；超過的部分換成最後一行結尾的 …
     * @returns {string[]} 每一行都不是空的，行首與行尾沒有只由空白組成的字素（「空格加組合符號」不算，空格留著）；沒有字（或 maxLines 小於 1）是 []
     */
    function wrapText(text, maxWidth, measure, maxLines = Infinity) {
        if (typeof text !== 'string') return [];
        const lineLimit = Math.floor(maxLines);
        if (!(lineLimit >= 1)) return [];

        // 一個字素一項（國旗、家庭 emoji、e 加重音符號都不拆開，也不會把代理對拆成兩半）。換行與 tab 換成空白，每個字元一個空白：
        // \r\n 是一個字素、兩個字元，所以是兩個空白，和以前一樣
        const chars = graphemes(text).map((unit) => (isLineBreak(unit.codePointAt(0)) ? ' '.repeat(Array.from(unit).length) : unit));
        // 每一行是 [from, to)：chars 裡的第 from 個字起、到第 to 個字之前
        const ranges = [];
        let start = skipSpaces(chars, 0);
        while (start < chars.length && ranges.length < lineLimit) {
            const end = lineEnd(chars, start, maxWidth, measure);
            ranges.push([start, end]);
            start = skipSpaces(chars, end);
        }
        const lines = ranges.map(([from, to]) => lineText(chars, from, to));
        // 排完 maxLines 行還有字：最後一行換成接上 … 的樣子
        if (start < chars.length) {
            const [from, to] = ranges[ranges.length - 1];
            lines[lines.length - 1] = ellipsize(chars, from, to, maxWidth, measure);
        }
        return lines;
    }

    // ---------- 膠囊 ----------

    /**
     * 膠囊（喜歡的內容之類的標籤）一列一列排下去。規則見檔案開頭的說明。
     * @param {string[]} labels - 膠囊上的字，照這個順序排；不是字串的項目略過
     * @param {(text: string) => number} measure
     * @param {{maxWidth: number, height: number, padX?: number, gap?: number, rowGap?: number, maxRows?: number}} options
     *   maxWidth 是一列的寬度，height 是每顆的高度，padX 是左右內距，gap 是同一列的膠囊之間的間距，
     *   rowGap 是列與列之間的間距，maxRows 是最多幾列
     * @returns {{label: string, x: number, y: number, w: number, h: number}[]} 排得下的膠囊，照傳進來的順序；每次都是新的物件
     */
    function layoutChips(labels, measure, options) {
        const { maxWidth, height, padX = 0, gap = 0, rowGap = 0, maxRows = Infinity } = isObject(options) ? options : {};
        const chips = [];
        const rowLimit = Math.floor(maxRows);
        if (!Array.isArray(labels) || !(rowLimit >= 1)) return chips;

        let row = 0; // 目前這一列是第幾列（從 0 起算）
        let x = 0; // 目前這一列下一顆膠囊的左邊
        let inRow = 0; // 目前這一列已經放了幾顆
        for (const label of labels) {
            if (typeof label !== 'string') continue;
            const w = measure(label) + 2 * padX;
            if (w > maxWidth) continue; // 一顆就比一整列寬：不縮小，也不放
            if (inRow > 0 && x + w > maxWidth) {
                // 這一列放不下了，換下一列
                row += 1;
                x = 0;
                inRow = 0;
            }
            if (row >= rowLimit) break; // 超過列數：這一顆和後面的都不要
            chips.push({ label, x, y: row * (height + rowGap), w, h: height });
            x += w + gap;
            inRow += 1;
        }
        return chips;
    }

    // ---------- 圖片填滿與拖曳 ----------

    // 圖片位置的範圍（同 card-state.js）：x、y 是 -1～1，zoom 是 1～3
    const OFFSET_MAX = 1;
    const ZOOM_MIN = 1;
    const ZOOM_MAX = 3;
    // 多出來的長度不到這個值（像素）就當成沒有：dw、dh 是乘出來的，剛好填滿的那個方向會有浮點的誤差（多或少一點點）
    const EDGE_EPSILON = 1e-6;
    // coverRect 算出來的 rect 在框裡，寬（x）、高（y）各比框多出多少（像素）；dragCrop 與 canPan 用同一個算法，才會一起認定那個方向有沒有東西可以移
    const overflowOf = (rect, boxW, boxH) => ({ x: rect.dw - boxW, y: rect.dh - boxH });
    const hasOverflow = (length) => length > EDGE_EPSILON;

    // 位置整理成合格的 { x, y, zoom }（每次都是新的物件）：x、y、zoom 都要是有限的數字，不然整份當成沒設（填滿、置中）；
    // 範圍外的夾進去
    function cropOrDefault(crop) {
        if (!isObject(crop) || !Number.isFinite(crop.x) || !Number.isFinite(crop.y) || !Number.isFinite(crop.zoom)) {
            return { x: 0, y: 0, zoom: 1 };
        }
        return {
            x: clamp(crop.x, -OFFSET_MAX, OFFSET_MAX),
            y: clamp(crop.y, -OFFSET_MAX, OFFSET_MAX),
            zoom: clamp(crop.zoom, ZOOM_MIN, ZOOM_MAX)
        };
    }

    /**
     * 圖要畫在框裡的哪裡：縮放到剛好填滿框（再乘上 zoom），x、y 決定多出來的部分露出哪一塊。
     * @param {number} imgW - 圖原本的寬
     * @param {number} imgH - 圖原本的高
     * @param {number} boxW - 框的寬
     * @param {number} boxH - 框的高
     * @param {{x: number, y: number, zoom: number}} [crop] - 位置，沒有或壞掉是 { x: 0, y: 0, zoom: 1 }
     * @returns {{dx: number, dy: number, dw: number, dh: number}} 相對於框左上角的位置與畫出來的大小；
     *   大小不對時全是 0。dx、dy 不會是 -0
     */
    function coverRect(imgW, imgH, boxW, boxH, crop) {
        if (![imgW, imgH, boxW, boxH].every(isSize)) return { dx: 0, dy: 0, dw: 0, dh: 0 };
        const { x, y, zoom } = cropOrDefault(crop);
        const scale = Math.max(boxW / imgW, boxH / imgH) * zoom;
        const dw = imgW * scale;
        const dh = imgH * scale;
        // 最後的 + 0 把 -0 換成 0：x 或 y 是 -1、或那個方向剛好填滿沒有多出來時，乘出來是 -0，
        // 而 Object.is（assert.equal 也是）分得出 -0 與 0
        return {
            dx: -(dw - boxW) * (x + 1) / 2 + 0,
            dy: -(dh - boxH) * (y + 1) / 2 + 0,
            dw,
            dh
        };
    }

    /**
     * 手指在框裡拖了一段之後的新位置：圖跟著移動同樣的距離（新的 dx = 舊的 dx + dxPx），再換回 x、y
     * （x = -2 * 新的 dx / (dw - boxW) - 1），夾在 -1～1。往右拖 x 變小、往左拖 x 變大，往下拖 y 變小、往上拖 y 變大。
     * @param {{x: number, y: number, zoom: number}} crop - 拖之前的位置，沒有或壞掉是 { x: 0, y: 0, zoom: 1 }
     * @param {number} dxPx - 往右拖了多少（和 boxW 同一個像素單位）；不是有限的數字當成沒拖
     * @param {number} dyPx - 往下拖了多少
     * @param {number} imgW
     * @param {number} imgH
     * @param {number} boxW
     * @param {number} boxH
     * @returns {{x: number, y: number, zoom: number}} 新的位置（新的物件，zoom 照舊）。
     *   那個方向沒有多出來的長度時是 0；圖或框的大小不對時，位置原樣（整理過的）還給
     */
    function dragCrop(crop, dxPx, dyPx, imgW, imgH, boxW, boxH) {
        const current = cropOrDefault(crop);
        if (![imgW, imgH, boxW, boxH].every(isSize)) return current;
        const rect = coverRect(imgW, imgH, boxW, boxH, current);
        const moveX = Number.isFinite(dxPx) ? dxPx : 0;
        const moveY = Number.isFinite(dyPx) ? dyPx : 0;
        const overflow = overflowOf(rect, boxW, boxH);
        return {
            x: hasOverflow(overflow.x) ? clamp(-2 * (rect.dx + moveX) / overflow.x - 1, -OFFSET_MAX, OFFSET_MAX) : 0,
            y: hasOverflow(overflow.y) ? clamp(-2 * (rect.dy + moveY) / overflow.y - 1, -OFFSET_MAX, OFFSET_MAX) : 0,
            zoom: current.zoom
        };
    }

    /**
     * 圖放進框裡，左右、上下各有沒有東西可以移：那個方向多出來的長度大於 EDGE_EPSILON（同 dragCrop）。位置不影響，所以只看 zoom。
     * 位置滑桿（左右、上下）用它決定哪一個能動，拖曳拖不動的方向，滑桿也不能動。
     * @param {number} imgW - 圖原本的寬
     * @param {number} imgH - 圖原本的高
     * @param {number} boxW - 框的寬
     * @param {number} boxH - 框的高
     * @param {number} zoom - 縮放；不是有限的數字當成 1，範圍外的夾進 1～3（同 coverRect）
     * @returns {{x: boolean, y: boolean}} 新的物件；圖或框的大小不對時兩個都是 false
     */
    function canPan(imgW, imgH, boxW, boxH, zoom) {
        if (![imgW, imgH, boxW, boxH].every(isSize)) return { x: false, y: false };
        const overflow = overflowOf(coverRect(imgW, imgH, boxW, boxH, { x: 0, y: 0, zoom }), boxW, boxH);
        return { x: hasOverflow(overflow.x), y: hasOverflow(overflow.y) };
    }

    // ---------- 對比度與重點色上的字色 ----------

    const WHITE = '#ffffff';
    const DARK = '#141826';
    const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

    // 一個色版（0～255）換成線性的亮度（WCAG 的公式）
    function linear(value) {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }

    // '#rrggbb' 的相對亮度：0（黑）～1（白）；不是 '#rrggbb' 是 null
    function luminanceOf(hex) {
        const match = typeof hex === 'string' ? HEX_COLOR.exec(hex) : null;
        if (match === null) return null;
        const [red, green, blue] = [match[1], match[2], match[3]].map((part) => linear(parseInt(part, 16)));
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    }

    /**
     * 兩個顏色的 WCAG 對比度：(較亮的相對亮度 + 0.05) / (較暗的相對亮度 + 0.05)。
     * @param {string} a - '#rrggbb'（大小寫都行）
     * @param {string} b - '#rrggbb'
     * @returns {number} 1（一樣）～21（黑白），和 a、b 的先後無關；有一個不是 '#rrggbb' 的東西是 1
     */
    function contrastRatio(a, b) {
        const first = luminanceOf(a);
        const second = luminanceOf(b);
        if (first === null || second === null) return 1;
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }

    /**
     * 這個底色上的字用白色還是深色：算白色與 #141826 對這個底色的 WCAG 對比度，高的那個贏，一樣高是白色。
     * @param {string} hex - '#rrggbb'（大小寫都行）
     * @returns {'#ffffff' | '#141826'} 不是 '#rrggbb' 的東西是 '#ffffff'（兩個對比度都是 1，一樣高）
     */
    function textColorOn(hex) {
        return contrastRatio(hex, DARK) > contrastRatio(hex, WHITE) ? DARK : WHITE;
    }

    return Object.freeze({ fitScale, graphemes, wrapText, layoutChips, coverRect, dragCrop, canPan, contrastRatio, textColorOn });
})();

// Export for use in other modules
window.CardLayout = CardLayout;
