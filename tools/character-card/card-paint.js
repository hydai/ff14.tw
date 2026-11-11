/**
 * 角色卡產生器的畫圖小工具：三種風格（名片、海報、資訊卡）共用的零件，只有「怎麼畫」，沒有任何一種風格自己的顏色與版面數字
 * （那些在各風格自己的檔案裡，名片是 card-style-a.js、海報是 card-style-b.js、資訊卡是 card-style-c.js）。有兩個例外：預設背景（沒有上傳截圖時每種風格的底都一樣），
 * 與名片、資訊卡共用的排法用到的四個數字（收在最外層函式裡：三欄資訊的欄數 META_COLUMNS 與每欄的值最多幾行 META_MAX_LINES、喜歡的內容的膠囊最多幾列
 * LIKES_MAX_ROWS 與排不下時最多縮到幾倍 LIKES_FLOOR），這兩種風格的這幾個數字一樣，所以跟著排法收在這裡。
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
 * - FAMILIES：{ display: 'Outfit, "Noto Sans TC", sans-serif', sans: '"Noto Sans TC", sans-serif', serif: '"Noto Serif TC", serif' }，
 *   font 字串裡的字體（serif 是名片的名字用的）
 * - ICON_LETTER：{ weight: 700, family: FAMILIES.sans }，drawIcon 畫「沒有圖示的職業的第一個字」用的字型
 *
 * 小工具：
 * - isObject(value)：是不是物件（不含 null 與陣列）；deepFreeze(value)：往下每一層的物件都凍結，回傳同一個物件
 * - fontString(kind, px)：kind 是 { weight, family }，回傳 canvas 的 font 字串。字級取到 0.01px 並無條件捨去：
 *   縮到剛好放得下的字，不會因為進位反而多出一點點
 * - toPixels(value, unit)：版面數字（草稿的 cqw：卡片寬度的 1%）換成像素：數字乘上 unit，物件逐一往下換，其他（字串）照舊
 * - geometryOf(specs, format)：一種風格的版面數字（specs：每種版型一份，數字是 cqw）換成那一種版型的像素：
 *   { width, height, ...toPixels(specs[format], width / 100) }，每次回傳新的物件
 * - firstChar(text)：第一個字（以字素計，見 CardLayout.graphemes：國旗、家庭 emoji、e 加重音符號整個算一個，也不會把代理對切成兩半），空字串是 ''
 * - sum(numbers)：加總
 * - mixOf(hex, other, amount)：'#rrggbb' 往另一個顏色 other 混 amount（0～1，0 是 hex 本身、1 是 other）：每個色版 Math.round(a + (b - a) * amount)，
 *   輸出小寫的 '#rrggbb'
 * - tintOf(hex, amount)：'#rrggbb' 往白色混 amount（0～1），就是 mixOf(hex, '#ffffff', amount)
 * - readableOn(text, background, { toward = '#1d2233', min = 4.5 } = {})：background 上讀得清楚的文字色：text 一步一步（每次 0.05）往 toward 混，
 *   第一個和 background 的對比度（CardLayout.contrastRatio）≥ min 的就是答案；text 本來就夠就是 text 本身（輸出小寫），都不夠就是 toward
 * - rgbaOf(hex, alpha)：'#rrggbb' 加透明度 → 'rgba(r,g,b,alpha)'（沒有空白）
 *
 * 畫圖：
 * - roundedRect(ctx, x, y, w, h, r)：圓角矩形的路徑（還沒填色，呼叫端接著 fill() 或 stroke()）。舊的瀏覽器（Safari 16 以前）沒有 ctx.roundRect，
 *   改用 arcTo 畫一樣的路徑
 * - drawText(ctx, text, x, centerY, font, color)：一段字。font 是 font 字串（fontString 的結果）
 * - measurer(ctx, font)：量字函式 (text) => 寬度，給 CardLayout 用：每次先把字型套上去再量
 * - fittedSize(ctx, kind, basePx, text, maxWidth)：text 用 basePx 畫放不下 maxWidth 時，縮到剛好放得下（最多縮到 FIT_FLOOR）；回傳實際的字級
 * - spacedWidth(ctx, text, kind, px, spacing)：字距 spacing（單位是 em，字級的倍數）一個字一個字畫的話，這段字有多寬：
 *   每個字的寬度加上字與字之間的字距（最後一個字後面沒有）；空字串是 0。「一個字」是一個字素（CardLayout.graphemes：國旗、家庭 emoji、
 *   e 加重音符號是一個字，不拆開）。不用 ctx.letterSpacing（舊的 Safari 沒有）
 * - drawSpaced(ctx, text, x, centerY, kind, px, spacing, color)：字距 spacing（em）一個字一個字畫（每個字素一次 fillText，字距加在字素後面），
 *   寬度就是 spacedWidth
 * - fittedSpacedSize(ctx, kind, basePx, text, spacing, maxWidth)：字距畫出來的字，用 basePx 畫放不下 maxWidth 時縮到剛好放得下
 *   （最多縮到 FIT_FLOOR）；回傳實際的字級（fittedSize 的字距版）
 * - labelBlock(ctx, text, spec, maxWidth)：小標（部隊、喜歡的內容…）：字距一個字（字素）一個字畫，放不下 maxWidth 整行縮小（最多縮到 FIT_FLOOR）。
 *   spec = { kind, font, spacing, color }（字型的種類、原本的字級、字距（em）、顏色）；回傳 { height, draw(x, top) }，高度是原本字級的一行（縮小也不變）
 * - drawCapsule(ctx, x, y, w, h, fill, stroke, border)：膠囊：半透明的底加邊框。CSS 的邊框在框裡面，描邊的路徑往裡縮半條線寬才對得上。
 *   沒有邊框（border 是 0 或沒給，stroke 也不用給）時只填色、不描邊（canvas 的 lineWidth 設成 0 會被忽略，沿用上一次的線寬，不能照樣描）
 * - drawIcon(ctx, item, x, y, size, accent)：職業圖示，item 是 { name, icon }。有圖（icon 是 drawImage 認得的東西）就畫在 (x, y) 的 size × size 方塊裡；
 *   沒有（例如 Beastmaster）畫重點色 accent 的圓角方塊，中間是名稱的第一個字（字素），字色照重點色的亮度選白或深色（CardLayout.textColorOn）。
 *   這個字用 ICON_LETTER（Noto Sans TC 700）畫，所以風格的 texts() 要把 iconLetters(view) 列進這個字型
 * - drawBackdrop(ctx, accent, rect, unit)：沒有截圖時的預設背景，畫在 rect = { x, y, width, height } 裡：由深藍紫到重點色 accent 的對角漸層
 *   （從 rect 的左上到右下），再撒上固定位置的柔和光點（整顆都在 rect 裡，每次畫都一樣）。unit 是一個 cqw 的像素，光點的半徑照它算
 * - drawPhotoBox(ctx, view, box, radius, unit)：名片與資訊卡的照片框：clip 成圓角 radius 的 box = { x, y, width, height }，裡面是截圖
 *   （view.image = { source, width, height }，位置照 view.crop，填滿框）；沒有截圖，或圖的大小不對畫不出來，就是 drawBackdrop。
 *   包在 save／restore 裡，clip 畫完就沒了
 *
 * 版面：
 * - stackUp(blocks, gap, bottom, xOf)：由下往上疊一排區塊：最後一個貼著 bottom，區塊之間隔 gap；xOf(block) 是每個區塊的左邊。
 *   區塊是 { height, draw(x, top) }
 * - stackDown(blocks, foot, { top, bottom, gap })：由上往下疊：blocks 與 foot 是 { height, draw(top) }，blocks 從 top 起往下排，
 *   區塊之間隔 gap，foot 貼著 bottom。全部（區塊之間與最後一個區塊和 foot 之間各一個間距）比 bottom - top 高時，間距一起縮到剛好放得下，
 *   最小 0。回傳實際用的間距（沒有區塊時沒有間距可縮，回傳 gap）
 * - fitChips(ctx, labels, spec)：一排膠囊，排成最多 maxRows 列。spec = { kind, font, padX, padY, gap, border, maxWidth, maxRows, floor }
 *   （kind 是字型的種類，其餘是像素；floor 是倍數）。全部排得進就用原本的大小（倍數 1），排不下就整組一起縮小：倍數從 1 起每次減 0.05，
 *   第一個排得進的就用它（字級、左右與上下的內距、間距一起乘倍數，邊框的線寬不變）；縮到 floor 還排不下就用 floor，
 *   排不下的照 CardLayout.layoutChips 的規矩不回傳。回傳 { scale, px（縮過的字級）, chips（layoutChips 的結果，座標從 (0, 0) 起，
 *   每顆的 w、h 含邊框）, height（最後一列的底，沒有膠囊是 0）}
 * - splitColumns(width, gap, ratio, { left, right })：兩欄並排（喜歡的內容與遊玩時段）。兩邊都有時整列扣掉間隔 gap 之後照 ratio（[左, 右]）分，
 *   右欄在左欄右邊隔 gap；只有左邊時用整列的寬；只有右邊時是右欄原本的寬（兩邊都有時的寬）、靠左。left、right 是這一邊有沒有東西。
 *   回傳 { left: { x, width } | null, right: { x, width } | null }，x 相對於整列的左邊，沒有東西的那一邊是 null
 * - twoColumns(x, width, gap, ratio, { left, right })：兩欄並排的區塊（喜歡的內容與遊玩時段），整列的左邊是 x、寬是 width。left、right 是這一邊的內容：
 *   沒有東西是 null，有的是 (columnWidth) => { height, draw(x, top) } | null（拿到這一欄的寬，x 是這一欄的左邊；排不進去時回傳 null，
 *   這一邊不畫，另一邊照舊在自己的欄裡）。寬度與位置照 splitColumns，兩欄從上面對齊，高度是較高的那一欄。
 *   回傳 { height, draw(top) }（可以直接放進 stackDown），兩邊都沒有東西或都畫不出來是 null
 * - hoursBlock(ctx, hours, spec)：時段格子，回傳 { width, height, draw(x, top) }，沒有時段（hours 是 null）回傳 null。
 *   hours 是 { days: [列名 × 2], slots: [欄名 × 4], on: [[有沒有選 × 4] × 2] }；spec 是 { kind, width, font, cell, gapX, gapY, radius, labelColor, offColor, accent }，
 *   除了 kind（字型的種類）與顏色，都是像素。第一列是欄名，下面每一列是列名加 4 格，有選的格子是 accent、沒選的是 offColor；
 *   列名那一欄和內容一樣寬，剩下的寬度平分給 4 個時段欄；標籤放不下就整組縮小，不超出 spec.width
 *
 * 風格的 texts(view)（這張卡片要載入的字）用的小工具（view 是 CardRenderer 整理好的畫面模型）：
 * - iconLetters(view)：沒有圖示的職業（主職與其他職業）各畫名稱的第一個字（字素，drawIcon 的替身），回傳這些字的陣列（名稱是空的沒有字可畫，不列）；
 *   它們要用 ICON_LETTER 的字型載入
 * - listTexts(groups)：groups 是 [[kind, ...字], …]（kind 是 { weight, family }），照順序列成 [{ kind, text }]，不是字串與空字串的略過
 *
 * 名片與資訊卡共用的內容（兩種風格只剩自己的數字、顏色與畫法，用 spec 傳進來；metaCells、likesAndHours 回傳 { height, draw(top) }，沒有內容是 null，
 * 可以直接放進 drawInfoColumn 的 blocks）：
 * - photoInfoBoxes(g, share)：照片框與資訊欄的範圍 { photo, info }（都是 { x, y, width, height }，canvas 的像素）。g 是 geometryOf 換好像素的版面數字：
 *   width、height（卡片）、pad（內距）、gap（照片框與資訊欄的間隔）、photoAt（'left'：橫版，照片框在左、資訊欄在右；'top'：直版，照片框在上、資訊欄在下）、
 *   photo.margin（可以沒有，沒有是 0：照片框下面留給別的東西的空間，只讓照片框矮一截，資訊欄的位置不動）。share 是 { left, top }：
 *   照片框占內容寬（橫版用 left）或內容高（直版用 top）的比例，另一個方向的可以不給
 * - metaItems(view)：三欄資訊的項目 [{ label, value }]：部隊（view.fcName 加 view.tag，只填一個就只寫那一個，用一個空白接）、大國防聯軍（view.gc）、
 *   在找什麼（view.looking），照這個順序，沒有值的拿掉；小標是 view.labels 的字
 * - metaCells(ctx, view, spec)：三欄資訊的區塊：metaItems 排成三等分的欄（有值的從左邊那欄排，欄寬照舊是三等分），每一欄是小標（labelBlock）加最多 2 行的值
 *   （CardLayout.wrapText，超過的最後一行接 …），同一列一樣高（照最高的那一欄）。沒有任何一項是 null。
 *   spec = { x, width, gap, label, kind, font, color, padX = 0, padY = 0, paintBox }：x、width 是整列的左邊與寬（像素），gap 是欄與欄的間隔，
 *   label 是小標的 spec（見 labelBlock），kind、font、color 是值的字型的種類、字級與顏色；padX、padY 是每一欄裡面的左右與上下內距（小標與值都在內距裡面，
 *   值折行的寬度扣掉左右內距）；paintBox(x, top, width, height) 在每一欄的字之前畫那一欄的底（資訊卡的白色圓角框），沒給就不畫
 * - likesAndHours(ctx, view, spec)：兩欄的區塊：左邊是喜歡的內容（view.likes，小標 view.labels.likes 加膠囊，排成最多 2 列，排不下時整組縮小到最多 60%，
 *   用 fitChips），右邊是遊玩時段（view.hours，小標 view.labels.hours 加 hoursBlock 的格子），兩欄從上面對齊。沒有喜歡的內容或沒有時段（view.hours 是 null）
 *   那一邊就沒有，只有一邊時的寬度見 splitColumns；膠囊一顆都排不進去時那一邊也不畫。兩邊都沒有是 null。
 *   spec = { x, width, gap, ratio, label, chips, hours }：x、width 是整列的左邊與寬，gap、ratio 是兩欄的間隔與比例 [左, 右]（splitColumns），
 *   label 是小標的 spec（見 labelBlock）；chips = { kind, font, padX, padY, gap, border, fill, stroke, color }：膠囊字型的種類與原本的字級、原本的內距與間隔
 *   （像素）、邊框的線寬（沒給或 0 是沒有邊框，只填色）、底與邊框的顏色（stroke 沒有邊框時不用給）、字的顏色；
 *   hours 是 hoursBlock 的 spec 去掉 width（寬度是欄寬）
 * - drawInfoColumn(ctx, view, info, { blocks, foot, gap })：資訊欄（info 是 { x, y, width, height }）：blocks 是區塊（沒填的是 null，拿掉）由上往下疊，
 *   之間隔 gap（放不下時一起縮小，見 stackDown），底部一列（footBlock）貼著資訊欄的底；foot 是 footBlock 的 spec 去掉 x 與 width（它們照資訊欄）
 * - footText(view)：底部一列右邊的字：`${view.mark} · ${view.notice}`
 * - footBlock(ctx, view, spec)：底部一列，回傳 { height, draw(top) }：右邊是 footText(view)，整句畫出來、貼著右緣；左邊是聯絡方式（view.contact，
 *   沒填就不畫），放不下整行縮小（最多縮到 FIT_FLOOR），和右邊至少隔 gap。spec = { kind, font, color, gap, x, width }：字型的種類、字級、顏色、
 *   最小的間隔、這一列的左邊與寬度（像素）；高度是 font 乘 LINE_NORMAL，兩段字都在這一行的中線上
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到；
 * 需要 card-layout.js（CardLayout）先載入。
 */
const CardPaint = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const { fitScale, textColorOn, contrastRatio, wrapText, layoutChips, coverRect, graphemes } = window.CardLayout;

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
    const CHIP_STEP = 0.05; // fitChips 每次縮小的倍數
    const READABLE_STEPS = 20; // readableOn 往 toward 混的步數：每一步 1/20 = 0.05
    const META_COLUMNS = 3; // 三欄資訊：三等分的欄
    const META_MAX_LINES = 2; // 三欄資訊每一欄的值最多幾行
    const LIKES_MAX_ROWS = 2; // 喜歡的內容的膠囊最多幾列
    const LIKES_FLOOR = 0.6; // 膠囊排不下時整組最多縮到原本的 60%
    // 預設背景的光點：固定的亂數種子，所以每次畫都一樣；半徑的單位是 cqw
    const DOTS = Object.freeze({ count: 64, seed: 20261110, reach: 0.75, radiusMin: 0.15, radiusMax: 1.2, alphaMin: 0.08, alphaMax: 0.35 });
    // 預設背景左上的深藍紫（右下是重點色）。畫在圖上的成品，不跟著網站的深淺色；card-image.js 轉 JPEG 時鋪的底色也是它
    const BACKDROP_START = '#1b1d45';

    // ---------- 字型 ----------

    const FAMILIES = Object.freeze({
        display: 'Outfit, "Noto Sans TC", sans-serif',
        sans: '"Noto Sans TC", sans-serif',
        serif: '"Noto Serif TC", serif'
    });
    // 沒有圖示的職業，方塊裡那個字用的字型
    const ICON_LETTER = Object.freeze({ weight: 700, family: FAMILIES.sans });

    // 字型字串。字級取到 0.01px 並無條件捨去：縮到剛好放得下的字，不會因為進位反而多出一點點
    const fontString = (kind, px) => `${kind.weight} ${Math.floor(px * 100 + 1e-6) / 100}px ${kind.family}`;

    // ---------- 小工具 ----------

    // 第一個字（以字素計：國旗、家庭 emoji、e 加重音符號整個算一個，也不會把代理對切成兩半）
    const firstChar = (text) => graphemes(text)[0] ?? '';
    const sum = (numbers) => numbers.reduce((total, number) => total + number, 0);

    // 版面數字 → 像素：數字乘上 unit，物件逐一往下換，其他（字串）照舊
    function toPixels(value, unit) {
        if (typeof value === 'number') return value * unit;
        if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, toPixels(inner, unit)]));
        return value;
    }

    // 一種風格的版面數字（specs：每種版型一份，數字是 cqw）→ 那一種版型的像素：{ width, height } 加上每個數字乘上 寬度 / 100
    function geometryOf(specs, format) {
        const { width, height } = SIZES[format];
        return { width, height, ...toPixels(specs[format], width / 100) };
    }

    // 固定種子的亂數（Park–Miller），回傳 0～1 之間的數
    function seededRandom(seed) {
        let state = seed % 2147483647;
        return () => {
            state = (state * 16807) % 2147483647;
            return state / 2147483647;
        };
    }

    // '#rrggbb' 往另一個顏色 other 混 amount（0～1）：每個色版 Math.round(a + (b - a) * amount)
    function mixOf(hex, other, amount) {
        const channel = (start) => {
            const from = parseInt(hex.slice(start, start + 2), 16);
            const to = parseInt(other.slice(start, start + 2), 16);
            return Math.round(from + (to - from) * amount).toString(16).padStart(2, '0');
        };
        return `#${channel(1)}${channel(3)}${channel(5)}`;
    }

    // '#rrggbb' 往白色混 amount（0～1）
    const tintOf = (hex, amount) => mixOf(hex, '#ffffff', amount);

    // background 上讀得清楚的文字色：text 一步一步（每次 1/READABLE_STEPS = 0.05）往 toward 混，第一個對比度 ≥ min 的；都不夠就是 toward
    function readableOn(text, background, { toward = '#1d2233', min = 4.5 } = {}) {
        for (let step = 0; step < READABLE_STEPS; step++) {
            const mixed = mixOf(text, toward, step / READABLE_STEPS);
            if (contrastRatio(mixed, background) >= min) return mixed;
        }
        return toward;
    }

    // '#rrggbb' 加透明度 alpha（0～1）→ 'rgba(r,g,b,alpha)'
    function rgbaOf(hex, alpha) {
        const channel = (start) => parseInt(hex.slice(start, start + 2), 16);
        return `rgba(${channel(1)},${channel(3)},${channel(5)},${alpha})`;
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

    // 字距 spacing（em）一個字一個字畫的寬度：每個字（字素）的寬度加上字與字之間的字距，最後一個字後面沒有
    function spacedWidth(ctx, text, kind, px, spacing) {
        const units = graphemes(text);
        if (units.length === 0) return 0;
        const measure = measurer(ctx, fontString(kind, px));
        return sum(units.map(measure)) + (units.length - 1) * px * spacing;
    }

    // 字距 spacing（em）一個字一個字畫的字，用 basePx 畫放不下 maxWidth 時，縮到剛好放得下（最多縮到 FIT_FLOOR）；回傳實際的字級。
    // 字距是字級的倍數，所以整段字的寬度跟著字級等比例縮小
    function fittedSpacedSize(ctx, kind, basePx, text, spacing, maxWidth) {
        return basePx * fitScale(spacedWidth(ctx, text, kind, basePx, spacing), maxWidth, FIT_FLOOR);
    }

    // 字距 spacing（em）一個字一個字畫：畫一個字（一個字素：國旗、家庭 emoji、e 加重音符號都整個畫一次），游標往右移這個字的寬度加一個字距
    function drawSpaced(ctx, text, x, centerY, kind, px, spacing, color) {
        const font = fontString(kind, px);
        const measure = measurer(ctx, font);
        let cursor = x;
        for (const unit of graphemes(text)) {
            drawText(ctx, unit, cursor, centerY, font, color);
            cursor += measure(unit) + px * spacing;
        }
    }

    // 小標：字距 spec.spacing（em）一個字（字素）一個字畫，放不下 maxWidth 整行縮小（最多縮到 FIT_FLOOR）。spec = { kind, font, spacing, color }；
    // 高度是原本字級的一行（縮小也不變）
    function labelBlock(ctx, text, spec, maxWidth) {
        const px = fittedSpacedSize(ctx, spec.kind, spec.font, text, spec.spacing, maxWidth);
        const height = spec.font * LINE_NORMAL;
        return { height, draw: (x, top) => drawSpaced(ctx, text, x, top + height / 2, spec.kind, px, spec.spacing, spec.color) };
    }

    // 膠囊：半透明的底加邊框。CSS 的邊框在框裡面，描邊的路徑往裡縮半條線寬才對得上。沒有邊框（border 是 0 或沒給）時只填色：canvas 的 lineWidth 設成 0 會被忽略，不能照樣描邊
    function drawCapsule(ctx, x, y, width, height, fill, stroke, border) {
        ctx.fillStyle = fill;
        roundedRect(ctx, x, y, width, height, height / 2);
        ctx.fill();
        if (!(border > 0)) return;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = border;
        roundedRect(ctx, x + border / 2, y + border / 2, width - border, height - border, (height - border) / 2);
        ctx.stroke();
    }

    // 職業圖示：有圖就畫圖；沒有（例如 Beastmaster）畫重點色的圓角方塊，中間是名稱的第一個字（字素），字色照重點色的亮度選白或深色
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

    // 沒有圖示的職業（主職與其他職業）各畫名稱的第一個字（字素，drawIcon 的替身）：回傳這些字。名稱是空的沒有字可畫（drawIcon 也不畫），不列
    function iconLetters(view) {
        return [view.job, ...view.subJobs]
            .filter((item) => item !== null && item.icon === null)
            .map((item) => firstChar(item.name))
            .filter((letter) => letter !== '');
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

    // 由上往下疊一排區塊，底部一列貼著 bottom：blocks 與 foot 都是 { height, draw(top) }。blocks 從 top 起往下排，區塊之間隔 gap，
    // 最後一個區塊與 foot 之間也隔 gap；全部加起來比 bottom - top 高時，每個間距一起縮到剛好放得下（最小 0）。回傳實際用的間距
    function stackDown(blocks, foot, { top, bottom, gap }) {
        const heights = sum(blocks.map((block) => block.height)) + foot.height;
        const gaps = blocks.length;
        const used = gaps > 0 && heights + gaps * gap > bottom - top ? Math.max(0, (bottom - top - heights) / gaps) : gap;
        let y = top;
        for (const block of blocks) {
            block.draw(y);
            y += block.height + used;
        }
        foot.draw(bottom - foot.height);
        return used;
    }

    // 兩欄並排的位置，相對於整列的左邊：兩邊都有時整列扣掉間隔 gap 之後照 ratio（[左, 右]）分，右欄在左欄右邊隔 gap；
    // 只有左邊時用整列的寬；只有右邊時是右欄原本的寬（兩邊都有時的寬）、靠左；沒有東西的那一邊是 null
    function splitColumns(width, gap, ratio, present) {
        const room = Math.max(0, width - gap);
        const [leftShare, rightShare] = ratio;
        const leftWidth = (room * leftShare) / (leftShare + rightShare);
        const rightWidth = (room * rightShare) / (leftShare + rightShare);
        return {
            left: present.left ? { x: 0, width: present.right ? leftWidth : width } : null,
            right: present.right ? { x: present.left ? leftWidth + gap : 0, width: rightWidth } : null
        };
    }

    // 兩欄並排的區塊（整列的左邊是 x、寬是 width）：left、right 沒有東西是 null，有的是 (columnWidth) => { height, draw(x, top) } | null。
    // 寬度與位置照 splitColumns；一邊畫不出來（回傳 null）時那一邊不畫，另一邊照舊在自己的欄裡；兩欄從上面對齊，高度是較高的那一欄
    function twoColumns(x, width, gap, ratio, { left, right }) {
        const columns = splitColumns(width, gap, ratio, { left: left !== null, right: right !== null });
        const parts = [[columns.left, left], [columns.right, right]]
            .map(([column, make]) => (column === null ? null : { column, block: make(column.width) }))
            .filter((part) => part !== null && part.block !== null);
        if (parts.length === 0) return null;
        return {
            height: Math.max(...parts.map((part) => part.block.height)),
            draw(top) {
                for (const { column, block } of parts) block.draw(x + column.x, top);
            }
        };
    }

    // 一排膠囊（喜歡的內容之類）：全部排得進 maxRows 列就用原本的大小；排不下就整組一起縮小（倍數從 1 起每次減 CHIP_STEP，
    // 第一個排得進的就用它；字級、左右與上下的內距、間距乘倍數，邊框的線寬不變），縮到 floor 還排不下就用 floor，排不下的不回傳
    function fitChips(ctx, labels, spec) {
        const wanted = labels.filter((label) => typeof label === 'string').length;
        const place = (scale) => {
            const px = spec.font * scale;
            const gap = spec.gap * scale;
            const chipHeight = px * LINE_NORMAL + 2 * spec.padY * scale + 2 * spec.border;
            const chips = layoutChips(labels, measurer(ctx, fontString(spec.kind, px)), {
                maxWidth: spec.maxWidth, height: chipHeight, padX: spec.padX * scale + spec.border, gap, rowGap: gap, maxRows: spec.maxRows
            });
            return { scale, px, chips, height: chips.length === 0 ? 0 : Math.max(...chips.map((chip) => chip.y + chip.h)) };
        };
        let scale = 1;
        let result = place(scale);
        while (result.chips.length < wanted && scale > spec.floor) {
            // 先四捨五入到 0.01：一次一次減 0.05 會累積浮點的誤差
            scale = Math.max(spec.floor, Math.round((scale - CHIP_STEP) * 100) / 100);
            result = place(scale);
        }
        return result;
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

    // ---------- 照片框 ----------

    // 名片與資訊卡的照片框：clip 成圓角 radius 的 box，裡面是截圖（view.image，位置照 view.crop，填滿框）；
    // 沒有截圖，或圖的大小不對畫不出來，就畫預設背景。unit 是一個 cqw 的像素
    function drawPhotoBox(ctx, view, box, radius, unit) {
        ctx.save();
        roundedRect(ctx, box.x, box.y, box.width, box.height, radius);
        ctx.clip();
        const rect = view.image === null ? null : coverRect(view.image.width, view.image.height, box.width, box.height, view.crop);
        if (rect !== null && rect.dw > 0 && rect.dh > 0) {
            ctx.drawImage(view.image.source, box.x + rect.dx, box.y + rect.dy, rect.dw, rect.dh);
        } else {
            drawBackdrop(ctx, view.accent, box, unit);
        }
        ctx.restore();
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

    // ---------- 要載入的字 ----------

    // 風格的 texts(view)：groups 是 [[kind, ...字], …]，照順序列成 [{ kind, text }]，不是字串與空字串的略過（沒填的欄位傳 ''）
    function listTexts(groups) {
        return groups.flatMap(([kind, ...strings]) => strings.filter((text) => typeof text === 'string' && text !== '').map((text) => ({ kind, text })));
    }

    // ---------- 名片與資訊卡共用的內容 ----------

    // 三欄資訊的項目：部隊（名稱加簡稱，只填一個就只寫那一個）、大國防聯軍、在找什麼，照這個順序，沒有值的拿掉。小標是 view.labels 的字
    function metaItems(view) {
        return [
            { label: view.labels.fc, value: [view.fcName, view.tag].filter(Boolean).join(' ') },
            { label: view.labels.gc, value: view.gc },
            { label: view.labels.looking, value: view.looking }
        ].filter((item) => item.value !== '');
    }

    // 底部一列右邊的字
    const footText = (view) => `${view.mark} · ${view.notice}`;

    // 底部一列：右邊是 footText(view)，整句畫出來、貼著右緣；左邊是聯絡方式，放不下整行縮小，和右邊至少隔 spec.gap。
    // spec = { kind, font, color, gap, x, width }；兩段字都在這一行的中線上
    function footBlock(ctx, view, spec) {
        const right = footText(view);
        const rightFont = fontString(spec.kind, spec.font);
        const rightWidth = measurer(ctx, rightFont)(right);
        const height = spec.font * LINE_NORMAL;
        const leftPx = view.contact === '' ? spec.font : fittedSize(ctx, spec.kind, spec.font, view.contact, spec.width - rightWidth - spec.gap);
        return {
            height,
            draw(top) {
                const centerY = top + height / 2;
                drawText(ctx, right, spec.x + spec.width - rightWidth, centerY, rightFont, spec.color);
                if (view.contact !== '') drawText(ctx, view.contact, spec.x, centerY, fontString(spec.kind, leftPx), spec.color);
            }
        };
    }

    // 照片框與資訊欄的範圍：橫版（g.photoAt 是 'left'）照片框在左、寬是內容寬的 share.left、和內容一樣高，資訊欄在右邊隔 g.gap；
    // 直版（'top'）照片框在上、寬是整個內容寬、高是內容高的 share.top，資訊欄在下面隔 g.gap。照片框的高再減 g.photo.margin（沒有是 0），資訊欄不動
    function photoInfoBoxes(g, share) {
        const margin = g.photo?.margin ?? 0;
        const contentWidth = g.width - 2 * g.pad;
        const contentHeight = g.height - 2 * g.pad;
        if (g.photoAt === 'left') {
            const photoWidth = contentWidth * share.left;
            return {
                photo: { x: g.pad, y: g.pad, width: photoWidth, height: contentHeight - margin },
                info: { x: g.pad + photoWidth + g.gap, y: g.pad, width: contentWidth - photoWidth - g.gap, height: contentHeight }
            };
        }
        const rowHeight = contentHeight * share.top;
        return {
            photo: { x: g.pad, y: g.pad, width: contentWidth, height: rowHeight - margin },
            info: { x: g.pad, y: g.pad + rowHeight + g.gap, width: contentWidth, height: contentHeight - rowHeight - g.gap }
        };
    }

    // 三欄資訊：三等分的欄，每一欄是小標加最多 2 行的值，同一列一樣高；每一欄有內距與底的話，小標與值都在內距裡面（排法見檔案開頭）
    function metaCells(ctx, view, spec) {
        const items = metaItems(view);
        if (items.length === 0) return null;
        const { x, width, gap, label, kind, font, color, padX = 0, padY = 0, paintBox } = spec;
        const columnWidth = (width - (META_COLUMNS - 1) * gap) / META_COLUMNS;
        const inner = columnWidth - 2 * padX;
        const valueFont = fontString(kind, font);
        const measure = measurer(ctx, valueFont);
        const cells = items.map((item) => ({ heading: labelBlock(ctx, item.label, label, inner), values: wrapText(item.value, inner, measure, META_MAX_LINES) }));
        const labelHeight = Math.max(...cells.map((cell) => cell.heading.height));
        const lineHeight = font * LINE_NORMAL;
        const height = 2 * padY + labelHeight + Math.max(...cells.map((cell) => cell.values.length)) * lineHeight;
        return {
            height,
            draw(top) {
                cells.forEach((cell, i) => {
                    const left = x + i * (columnWidth + gap);
                    if (paintBox !== undefined) paintBox(left, top, columnWidth, height);
                    cell.heading.draw(left + padX, top + padY);
                    cell.values.forEach((value, row) => drawText(ctx, value, left + padX, top + padY + labelHeight + lineHeight * (row + 0.5), valueFont, color));
                });
            }
        };
    }

    // 喜歡的內容：小標加膠囊（排成最多 LIKES_MAX_ROWS 列，排不下時整組縮小到最多 LIKES_FLOOR）。一顆都排不進去是 null。回傳 { height, draw(x, top) }
    function likesColumn(ctx, view, width, label, chips) {
        const { kind, font, padX, padY, gap, border = 0, fill, stroke, color } = chips;
        const fit = fitChips(ctx, view.likes, { kind, font, padX, padY, gap, border, maxWidth: width, maxRows: LIKES_MAX_ROWS, floor: LIKES_FLOOR });
        if (fit.chips.length === 0) return null;
        const heading = labelBlock(ctx, view.labels.likes, label, width);
        const chipFont = fontString(kind, fit.px);
        const pad = padX * fit.scale + border;
        return {
            height: heading.height + fit.height,
            draw(x, top) {
                heading.draw(x, top);
                const chipsTop = top + heading.height;
                for (const chip of fit.chips) {
                    drawCapsule(ctx, x + chip.x, chipsTop + chip.y, chip.w, chip.h, fill, stroke, border);
                    drawText(ctx, chip.label, x + chip.x + pad, chipsTop + chip.y + chip.h / 2, chipFont, color);
                }
            }
        };
    }

    // 遊玩時段：小標加格子（view.hours 不是 null 才會呼叫）。回傳 { height, draw(x, top) }
    function hoursColumn(ctx, view, width, label, hours) {
        const heading = labelBlock(ctx, view.labels.hours, label, width);
        const grid = hoursBlock(ctx, view.hours, { ...hours, width });
        return {
            height: heading.height + grid.height,
            draw(x, top) {
                heading.draw(x, top);
                grid.draw(x, top + heading.height);
            }
        };
    }

    // 兩欄：左邊喜歡的內容、右邊遊玩時段，有東西的那一邊才有（排法見檔案開頭）
    function likesAndHours(ctx, view, spec) {
        const { x, width, gap, ratio, label, chips, hours } = spec;
        return twoColumns(x, width, gap, ratio, {
            left: view.likes.length > 0 ? (columnWidth) => likesColumn(ctx, view, columnWidth, label, chips) : null,
            right: view.hours !== null ? (columnWidth) => hoursColumn(ctx, view, columnWidth, label, hours) : null
        });
    }

    // 資訊欄：沒填的區塊（null）拿掉，由上往下疊，底部一列貼著資訊欄的底
    function drawInfoColumn(ctx, view, info, { blocks, foot, gap }) {
        const rows = blocks.filter((block) => block !== null);
        stackDown(rows, footBlock(ctx, view, { ...foot, x: info.x, width: info.width }), { top: info.y, bottom: info.y + info.height, gap });
    }

    return Object.freeze({
        SIZES, LINE_NORMAL, FIT_FLOOR, ELLIPSIS, FAMILIES,
        ICON_LETTER,
        isObject, deepFreeze, fontString, toPixels, geometryOf, firstChar, sum, mixOf, tintOf, readableOn, rgbaOf,
        roundedRect, drawText, measurer, fittedSize, drawCapsule, drawIcon, iconLetters, stackUp, stackDown, splitColumns, twoColumns, fitChips,
        spacedWidth, drawSpaced, fittedSpacedSize, labelBlock, drawBackdrop, drawPhotoBox, hoursBlock,
        listTexts, photoInfoBoxes, metaItems, metaCells, likesAndHours, drawInfoColumn, footText, footBlock
    });
})();

// Export for use in other modules
window.CardPaint = CardPaint;
