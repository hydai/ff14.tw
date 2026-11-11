/**
 * 角色卡產生器的畫圖小工具：三種風格（海報、名片、資訊卡）共用的零件，只有「怎麼畫」，沒有任何一種風格的顏色與版面數字
 * （那些在各風格自己的檔案裡，海報是 card-style-b.js；唯一的例外是預設背景，沒有上傳截圖時每種風格的底都一樣）。
 * 都是純函式：只拿傳進來的 2D context 畫，不碰 DOM、不建 canvas、不靠 this、不改傳進來的資料（傳凍結的資料也行），
 * 所以風格可以解構出來單獨呼叫；字型與顏色每次畫之前都自己設，不靠上一次留下的狀態。
 * 座標一律是 canvas 的像素。字是靠左、垂直置中畫的（CardRenderer.draw 一開始就設好 textAlign = 'left'、textBaseline = 'middle'），
 * 所以座標是字的左邊（x）與這一行的中線（centerY）。
 *
 * 常數（都凍結）：
 * - SIZES：兩種卡片的大小 { landscape: { width: 1200, height: 675 }, portrait: { width: 1080, height: 1350 } }，頁面照它設定 canvas 的寬高
 *   （CardRenderer.SIZES 是同一個物件）
 * - LINE_NORMAL（1.45）：line-height: normal 一行有多高，單位是字級的倍數（Noto Sans TC 是 1.448 倍）：膠囊、時段、版權字這些一行字的高度照它算
 * - FIT_FLOOR（0.3）：放不下的字最多縮到原本的 30%。CardLayout 預設的 55% 不夠：21 個全形字的名字縮到 55% 還是比可用寬度寬，會超出卡片
 * - ELLIPSIS（'…'）：自我介紹折行超過行數時，CardLayout.wrapText 接在最後一行的省略號；風格的 texts() 要把它連同自我介紹一起列進要載入的字
 * - FAMILIES：{ display: 'Outfit, "Noto Sans TC", sans-serif', sans: '"Noto Sans TC", sans-serif' }，font 字串裡的字體
 *
 * 字型、數字與顏色：
 * - fontString(kind, px)：kind 是 { weight, family }，回傳 canvas 的 font 字串。字級取到 0.01px 並無條件捨去：
 *   縮到剛好放得下的字，不會因為進位反而多出一點點
 * - toPixels(value, unit)：版面數字（草稿的 cqw：卡片寬度的 1%）換成像素：數字乘上 unit，物件逐一往下換，其他（字串）照舊
 * - firstChar(text)：第一個字（以 Unicode 字元計，不會把代理對切成兩半），空字串是 ''
 * - sum(numbers)：加總
 * - tintOf(hex, amount)：'#rrggbb' 往白色混 amount（0～1）
 *
 * 畫圖：
 * - roundedRect(ctx, x, y, w, h, r)：圓角矩形的路徑（還沒填色，呼叫端接著 fill() 或 stroke()）。舊的瀏覽器（Safari 16 以前）沒有 ctx.roundRect，
 *   改用 arcTo 畫一樣的路徑
 * - drawText(ctx, text, x, centerY, font, color)：一段字。font 是 font 字串（fontString 的結果）
 * - measurer(ctx, font)：量字函式 (text) => 寬度，給 CardLayout 用：每次先把字型套上去再量
 * - fittedSize(ctx, kind, basePx, text, maxWidth)：text 用 basePx 畫放不下 maxWidth 時，縮到剛好放得下（最多縮到 FIT_FLOOR）；回傳實際的字級
 * - spacedWidth(ctx, text, kind, px, spacing)：字距 spacing（單位是 em，字級的倍數）一個字一個字畫的話，這段字有多寬：
 *   每個字的寬度加上字與字之間的字距（最後一個字後面沒有）；空字串是 0。不用 ctx.letterSpacing（舊的 Safari 沒有）
 * - drawSpaced(ctx, text, x, centerY, kind, px, spacing, color)：字距 spacing（em）一個字一個字畫，寬度就是 spacedWidth
 * - drawCapsule(ctx, x, y, w, h, fill, stroke, border)：膠囊：半透明的底加邊框。CSS 的邊框在框裡面，描邊的路徑往裡縮半條線寬才對得上
 * - drawIcon(ctx, item, x, y, size, accent)：職業圖示，item 是 { name, icon }。有圖（icon 是 drawImage 認得的東西）就畫在 (x, y) 的 size × size 方塊裡；
 *   沒有（例如 Beastmaster）畫重點色 accent 的圓角方塊，中間是名稱的第一個字，字色照重點色的亮度選白或深色（CardLayout.textColorOn）。
 *   這個字用 Noto Sans TC 700 畫，所以風格的 texts() 要把沒有圖示的職業的第一個字列進這個字型
 * - stackUp(blocks, gap, bottom, xOf)：由下往上疊一排區塊：最後一個貼著 bottom，區塊之間隔 gap；xOf(block) 是每個區塊的左邊。
 *   區塊是 { height, draw(x, top) }
 * - drawBackdrop(ctx, accent, rect, unit)：沒有截圖時的預設背景，畫在 rect = { x, y, width, height } 裡：由深藍紫到重點色 accent 的對角漸層
 *   （從 rect 的左上到右下），再撒上固定位置的柔和光點（整顆都在 rect 裡，每次畫都一樣）。unit 是一個 cqw 的像素，光點的半徑照它算
 * - hoursBlock(ctx, hours, spec)：時段格子，回傳 { width, height, draw(x, top) }，沒有時段（hours 是 null）回傳 null。
 *   hours 是 { days: [列名 × 2], slots: [欄名 × 4], on: [[有沒有選 × 4] × 2] }；spec 是 { kind, width, font, cell, gapX, gapY, radius, labelColor, offColor, accent }，
 *   除了 kind（字型的種類）與顏色，都是像素。第一列是欄名，下面每一列是列名加 4 格，有選的格子是 accent、沒選的是 offColor；
 *   列名那一欄和內容一樣寬，剩下的寬度平分給 4 個時段欄；標籤放不下就整組縮小，不超出 spec.width
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到；
 * 需要 card-layout.js（CardLayout）先載入。
 */
const CardPaint = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const { fitScale, textColorOn } = window.CardLayout;

    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const deepFreeze = (value) => {
        for (const inner of Object.values(value)) if (isObject(inner)) deepFreeze(inner);
        return Object.freeze(value);
    };

    // ---------- 尺寸 ----------

    const SIZES = deepFreeze({
        landscape: { width: 1200, height: 675 },
        portrait: { width: 1080, height: 1350 }
    });

    // ---------- 不跟著版面變的數字 ----------

    const LINE_NORMAL = 1.45; // line-height: normal（Noto Sans TC 是 1.448 倍字級）：一行字有多高
    const FIT_FLOOR = 0.3; // 放不下的字最多縮到原本的 30%（原因見檔案開頭）
    const ELLIPSIS = '…';
    const ICON_RADIUS = 0.22; // 沒有圖示時的圓角方塊：圓角是邊長的幾倍
    const LETTER_SIZE = 0.55; // 方塊裡那個字的字級是邊長的幾倍
    // 預設背景的光點：固定的亂數種子，所以每次畫都一樣；半徑的單位是 cqw
    const DOTS = Object.freeze({ count: 64, seed: 20261110, reach: 0.75, radiusMin: 0.15, radiusMax: 1.2, alphaMin: 0.08, alphaMax: 0.35 });
    // 預設背景左上的深藍紫（右下是重點色）。畫在圖上的成品，不跟著網站的深淺色；card-image.js 轉 JPEG 時鋪的底色也是它
    const BACKDROP_START = '#1b1d45';

    // ---------- 字型 ----------

    const FAMILIES = Object.freeze({
        display: 'Outfit, "Noto Sans TC", sans-serif',
        sans: '"Noto Sans TC", sans-serif'
    });
    // 沒有圖示的職業，方塊裡那個字用的字型
    const ICON_LETTER = Object.freeze({ weight: 700, family: FAMILIES.sans });

    // 字型字串。字級取到 0.01px 並無條件捨去：縮到剛好放得下的字，不會因為進位反而多出一點點
    const fontString = (kind, px) => `${kind.weight} ${Math.floor(px * 100 + 1e-6) / 100}px ${kind.family}`;

    // ---------- 小工具 ----------

    // 第一個字（以 Unicode 字元計，不會把代理對切成兩半）
    const firstChar = (text) => Array.from(text)[0] ?? '';
    const sum = (numbers) => numbers.reduce((total, number) => total + number, 0);

    // 版面數字 → 像素：數字乘上 unit，物件逐一往下換，其他（字串）照舊
    function toPixels(value, unit) {
        if (typeof value === 'number') return value * unit;
        if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, toPixels(inner, unit)]));
        return value;
    }

    // 固定種子的亂數（Park–Miller），回傳 0～1 之間的數
    function seededRandom(seed) {
        let state = seed % 2147483647;
        return () => {
            state = (state * 16807) % 2147483647;
            return state / 2147483647;
        };
    }

    // '#rrggbb' 往白色混 amount（0～1）
    function tintOf(hex, amount) {
        const channel = (start) => {
            const value = parseInt(hex.slice(start, start + 2), 16);
            return Math.round(value + (255 - value) * amount).toString(16).padStart(2, '0');
        };
        return `#${channel(1)}${channel(3)}${channel(5)}`;
    }

    // ---------- 畫圖的小工具 ----------

    // 圓角矩形的路徑（還沒填色）。舊的瀏覽器（Safari 16 以前）沒有 ctx.roundRect，改用 arcTo 畫一樣的路徑
    function roundedRect(ctx, x, y, width, height, radius) {
        const r = Math.max(0, Math.min(radius, width / 2, height / 2));
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, width, height, r);
            return;
        }
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }

    // 一段字畫在 (x, centerY)：x 是字的左邊，centerY 是這一行的中線（CardRenderer.draw 一開始設好靠左、垂直置中）。字型與顏色每次都設，不靠上一次的狀態
    function drawText(ctx, text, x, centerY, font, color) {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.fillText(text, x, centerY);
    }

    // 量字函式（給 CardLayout 用）：每次先把字型套上去再量
    function measurer(ctx, font) {
        return (text) => {
            ctx.font = font;
            return ctx.measureText(text).width;
        };
    }

    // text 用 basePx 畫放不下 maxWidth 時，縮到剛好放得下；回傳實際的字級
    function fittedSize(ctx, kind, basePx, text, maxWidth) {
        return basePx * fitScale(measurer(ctx, fontString(kind, basePx))(text), maxWidth, FIT_FLOOR);
    }

    // 字距 spacing（em）一個字一個字畫的寬度：每個字的寬度加上字與字之間的字距，最後一個字後面沒有
    function spacedWidth(ctx, text, kind, px, spacing) {
        const chars = Array.from(text);
        if (chars.length === 0) return 0;
        const measure = measurer(ctx, fontString(kind, px));
        return sum(chars.map(measure)) + (chars.length - 1) * px * spacing;
    }

    // 字距 spacing（em）一個字一個字畫：畫一個字，游標往右移這個字的寬度加一個字距
    function drawSpaced(ctx, text, x, centerY, kind, px, spacing, color) {
        const font = fontString(kind, px);
        const measure = measurer(ctx, font);
        let cursor = x;
        for (const char of Array.from(text)) {
            drawText(ctx, char, cursor, centerY, font, color);
            cursor += measure(char) + px * spacing;
        }
    }

    // 膠囊：半透明的底加邊框。CSS 的邊框在框裡面，描邊的路徑往裡縮半條線寬才對得上
    function drawCapsule(ctx, x, y, width, height, fill, stroke, border) {
        ctx.fillStyle = fill;
        roundedRect(ctx, x, y, width, height, height / 2);
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = border;
        roundedRect(ctx, x + border / 2, y + border / 2, width - border, height - border, (height - border) / 2);
        ctx.stroke();
    }

    // 職業圖示：有圖就畫圖；沒有（例如 Beastmaster）畫重點色的圓角方塊，中間是名稱的第一個字，字色照重點色的亮度選白或深色
    function drawIcon(ctx, item, x, y, size, accent) {
        if (item.icon) {
            ctx.drawImage(item.icon, x, y, size, size);
            return;
        }
        ctx.fillStyle = accent;
        roundedRect(ctx, x, y, size, size, size * ICON_RADIUS);
        ctx.fill();
        const letter = firstChar(item.name);
        if (letter === '') return;
        const font = fontString(ICON_LETTER, size * LETTER_SIZE);
        drawText(ctx, letter, x + (size - measurer(ctx, font)(letter)) / 2, y + size / 2, font, textColorOn(accent));
    }

    // 由下往上疊一排區塊：最後一個貼著 bottom，區塊之間隔 gap；xOf(block) 是每個區塊的左邊。區塊是 { height, draw(x, top) }
    function stackUp(blocks, gap, bottom, xOf) {
        let top = bottom;
        for (let i = blocks.length - 1; i >= 0; i--) {
            top -= blocks[i].height;
            blocks[i].draw(xOf(blocks[i]), top);
            top -= gap;
        }
    }

    // ---------- 預設背景 ----------

    // 沒有截圖時的預設背景，畫在 rect = { x, y, width, height } 裡。草稿的示意背景是程式畫的風景；這裡是由深藍紫到重點色的對角漸層
    // （從 rect 的左上到右下），再撒上固定位置的柔和光點。unit 是一個 cqw 的像素，光點的半徑照它算
    function drawBackdrop(ctx, accent, rect, unit) {
        const diagonal = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
        diagonal.addColorStop(0, BACKDROP_START);
        diagonal.addColorStop(1, accent);
        ctx.fillStyle = diagonal;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

        const random = seededRandom(DOTS.seed);
        for (let i = 0; i < DOTS.count; i++) {
            // 亂數用的順序固定（半徑、x、y、亮度）：小光點多、大光點少，只撒在 rect 上面 reach 的範圍（海報的下面有深色漸層蓋著），整顆都在 rect 裡
            const radius = (DOTS.radiusMin + random() ** 2 * (DOTS.radiusMax - DOTS.radiusMin)) * unit;
            const x = rect.x + radius + random() * (rect.width - 2 * radius);
            const y = rect.y + radius + random() * (rect.height * DOTS.reach - radius);
            const alpha = DOTS.alphaMin + random() * (DOTS.alphaMax - DOTS.alphaMin);
            const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
            glow.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(3)})`);
            glow.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ---------- 時段格子 ----------

    // 時段格子：第一列是欄名（早上…），下面每一列是列名（平日、假日）加 4 格，有選的格子用 accent，沒選的用 offColor。
    // 列名那一欄和內容一樣寬，剩下的寬度平分給 4 個時段欄；標籤放不下就整組縮小，不超出這個區塊的寬度
    function hoursBlock(ctx, hours, spec) {
        if (hours === null) return null;
        const { days, slots, on } = hours;
        const rowHeight = spec.font * LINE_NORMAL;
        const measure = measurer(ctx, fontString(spec.kind, spec.font));
        const dayWidth = Math.max(...days.map(measure));
        const slotWidth = Math.max(...slots.map(measure));
        const room = spec.width - 4 * spec.gapX;
        const scale = fitScale(dayWidth + 4 * slotWidth, room, FIT_FLOOR);
        const font = fontString(spec.kind, spec.font * scale);
        const firstColumn = dayWidth * scale;
        const track = Math.max(0, (room - firstColumn) / 4);
        return {
            width: spec.width,
            height: 3 * rowHeight + 2 * spec.gapY,
            draw(x, top) {
                const centerOf = (row) => top + row * (rowHeight + spec.gapY) + rowHeight / 2;
                const columnX = (slot) => x + firstColumn + spec.gapX + slot * (track + spec.gapX);
                slots.forEach((label, slot) => label !== '' && drawText(ctx, label, columnX(slot), centerOf(0), font, spec.labelColor));
                days.forEach((label, day) => {
                    const centerY = centerOf(day + 1);
                    if (label !== '') drawText(ctx, label, x, centerY, font, spec.labelColor);
                    on[day].forEach((selected, slot) => {
                        ctx.fillStyle = selected ? spec.accent : spec.offColor;
                        roundedRect(ctx, columnX(slot), centerY - spec.cell / 2, track, spec.cell, spec.radius);
                        ctx.fill();
                    });
                });
            }
        };
    }

    return Object.freeze({
        SIZES, LINE_NORMAL, FIT_FLOOR, ELLIPSIS, FAMILIES,
        fontString, toPixels, firstChar, sum, tintOf,
        roundedRect, drawText, measurer, fittedSize, drawCapsule, drawIcon, stackUp,
        spacedWidth, drawSpaced, drawBackdrop, hoursBlock
    });
})();

// Export for use in other modules
window.CardPaint = CardPaint;
