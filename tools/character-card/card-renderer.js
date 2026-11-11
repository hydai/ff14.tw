/**
 * 角色卡產生器的畫卡片：照畫面模型（model）在任何 2D context 上畫出一張卡片，現在只有風格 B「海報」（橫版與直版）。
 * 畫面上的預覽與下載的 PNG 是同一張 canvas，所以版面、字型、顏色都在這裡，只畫圖、不碰 DOM，也不自己去拿 canvas。
 * 版面與顏色照草稿頁的 .card.b（docs/superpowers/specs/2026-11-10-character-card-draft.html）：草稿的數字是 cqw（卡片寬度的 1%），
 * 這裡的版面數字（SPECS）原樣照抄 cqw，畫的時候乘上 寬度 / 100 換成 canvas 的像素（橫版 1200 寬是 12px，直版 1080 寬是 10.8px）。
 *
 * - SIZES：兩種卡片的大小 { landscape: { width: 1200, height: 675 }, portrait: { width: 1080, height: 1350 } }，頁面照它設定 canvas 的寬高
 * - fontsFor(model)：畫這張卡片要用的字型與要畫的字，每種字型（字重加字體）一筆 { font, text }，text 是用那個字型畫的每一段字接起來；
 *   頁面對每一筆呼叫 document.fonts.load(font, text)，載入完再畫（Google Fonts 的中文字型依字分批載入，沒載入的字會退成別的字型）。
 *   font 的字級是固定的（只有字重與字體有用），沒有畫的字（沒填的欄位）不列
 * - draw(ctx, model)：畫在 ctx 上。ctx 的設定（字型、顏色、對齊…）先 save()、畫完 restore()，所以畫完原樣還給呼叫端
 *
 * model 是頁面組好、已經翻譯的畫面模型：
 *   { format, name, title, world, fcTag, job: { name, level, icon }, subJobs: [{ name, icon }], likes: [string],
 *     hours: { days: [label, label], slots: [label × 4], on: Set<'weekday-evening'…> }, intro, accent,
 *     image: { source, width, height } | null, crop: { x, y, zoom }, levelLabel: 'Lv', mark: 'FF14.tw', notice: 'FINAL FANTASY XIV © SQUARE ENIX' }
 * - icon 是已載入的圖片（drawImage 認得的東西）或 null；null 時畫重點色的圓角方塊與職業名稱的第一個字。image.source 同
 * - likes 照 CardState.LIKES 的順序、最多 CardState.LIMITS.likes 個，subJobs 最多 CardState.LIMITS.subJobs 個（多的不畫）；
 *   hours.on 的鍵是 `${CardState.DAYS 的一個}-${CardState.SLOTS 的一個}`，days、slots 是這些的標籤，照 DAYS、SLOTS 的順序
 * - accent 是 '#rrggbb'（CardState.accentOf 的結果），重點色全都從這裡來，這支不寫死任何職能的顏色
 * - 沒填的欄位（空字串、只有空白、null、undefined）整塊不畫，不留空位；什麼都沒填時只畫背景、FF14.tw 與 SE 版權字。
 *   SE 版權字一定畫（卡片上畫了 SE 的職業圖示）：model 沒給 notice 時用內建的那一句
 * - 版面：截圖（或預設背景）鋪滿 → 由上到下的深色漸層 → 左上伺服器與部隊簡稱的膠囊、右上 FF14.tw →
 *   左下由上到下是稱號、名字、主職、喜歡的內容、自我介紹；右下是其他職業的圖示、時段格子、SE 版權字
 *   （橫版靠右由上到下疊起來；直版在自我介紹下方橫排，由左到右）。所有東西都貼著底邊往上排，所以沒填的整塊拿掉後，剩下的往下靠
 * - 文字一律靠左、垂直置中，座標是字的左邊與這一行的中線；放不下的字整段縮小（CardLayout.fitScale），不超出卡片。
 *   自我介紹用 CardLayout.wrapText 折成最多 2 行，喜歡的內容用 CardLayout.layoutChips 排成最多 2 列
 *
 * 和草稿不一樣的地方（canvas 做不到或另外決定的）：
 * - 草稿的卡片有圓角，這裡四個角不裁：下載的 PNG 是整張矩形，預覽的圓角由頁面用 CSS 加
 * - 膠囊的 backdrop-filter 模糊沒有畫（canvas 沒有對應的功能，ctx.filter 也不是每個瀏覽器都有），只用半透明的深色底
 * - 沒指定字重的字（膠囊、稱號、喜歡的內容、自我介紹、時段、版權字）草稿是 400，這裡用 500；字重只用 500、700（Noto Sans TC）與名字的 800、
 *   FF14.tw 的 600（Outfit），頁面標準的 Google Fonts 連結都載得到
 * - 稱號的字距 0.3em 一個字一個字畫（不用 ctx.letterSpacing，舊的 Safari 沒有）；名字的 -0.01em、FF14.tw 與版權字的字距太小，不畫
 * - 稱號的顏色：草稿每個職能各寫一個淺色，這裡從重點色往白色混 55%（所有重點色都適用，包括自己選的）
 * - 放不下的字（名字最明顯）最多縮到 30%：CardLayout 預設的 55% 不夠，21 個全形字的名字縮到 55% 還是比可用寬度寬，會超出卡片
 * - 草稿的示意背景是程式畫的風景；這裡的預設背景是由深藍紫到重點色的對角漸層，加上固定亂數種子撒的柔和光點（每次畫都一樣）
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到；
 * 需要 card-layout.js（CardLayout）與 card-state.js（CardState）先載入。
 */
const CardRenderer = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const { fitScale, wrapText, layoutChips, coverRect, textColorOn } = window.CardLayout;
    const { DAYS, SLOTS, LIMITS, ROLE_COLORS } = window.CardState;

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
    const DEFAULT_FORMAT = 'landscape';

    // ---------- 顏色（畫在圖上的成品，不跟著網站的深淺色）----------

    const COLORS = Object.freeze({
        text: '#ffffff',
        backdropStart: '#1b1d45', // 預設背景：左上的深藍紫（右下是重點色）
        pillFill: 'rgba(10,8,26,0.45)',
        pillStroke: 'rgba(255,255,255,0.28)',
        mark: 'rgba(255,255,255,0.8)',
        level: 'rgba(255,255,255,0.75)',
        chipFill: 'rgba(255,255,255,0.14)',
        chipStroke: 'rgba(255,255,255,0.22)',
        quote: 'rgba(255,255,255,0.88)',
        tile: 'rgba(10,8,26,0.45)', // 其他職業圖示的底
        hoursLabel: 'rgba(255,255,255,0.7)',
        hoursOff: 'rgba(255,255,255,0.18)', // 沒選的時段格子（有選的是重點色）
        notice: 'rgba(255,255,255,0.6)'
    });
    // 由上到下的深色漸層：[位置, 顏色]（第一個位置以上都是第一個顏色）
    const SHADE = Object.freeze([[0.22, 'rgba(10,8,26,0.05)'], [0.55, 'rgba(10,8,26,0.55)'], [1, 'rgba(10,8,26,0.92)']]);
    // 稱號的顏色 = 重點色混入這麼多比例的白色
    const TITLE_TINT = 0.55;

    // ---------- 字型 ----------

    const DISPLAY = 'Outfit, "Noto Sans TC", sans-serif';
    const SANS = '"Noto Sans TC", sans-serif';
    const FONTS = Object.freeze({
        name: Object.freeze({ weight: 800, family: DISPLAY }),
        mark: Object.freeze({ weight: 600, family: DISPLAY }),
        bold: Object.freeze({ weight: 700, family: SANS }),
        text: Object.freeze({ weight: 500, family: SANS })
    });
    // fontsFor() 給的字型字串用這個字級（載入字型只看字重與字體，字級用不到）
    const LOAD_PX = 16;
    // 字型字串。字級取到 0.01px 並無條件捨去：縮到剛好放得下的字，不會因為進位反而多出一點點
    const fontString = (kind, px) => `${kind.weight} ${Math.floor(px * 100 + 1e-6) / 100}px ${kind.family}`;

    // ---------- 版面數字（草稿的 cqw：卡片寬度的 1%）----------

    // 每一個數字都是 cqw，畫的時候換成像素（toPixels）；字串（layout）照舊。名稱照草稿的 CSS：
    // top、bottom 是 .top、.bottom（y 是離上邊、下邊的距離，edge 是左右的邊距），pill、chip 是 .pill、.chip，
    // lead 是左下那一欄，side 是右下那一組，subs 是其他職業，hours 是時段格子，se 是 SE 版權字；hairline 是膠囊的邊框線寬
    const SPECS = deepFreeze({
        landscape: {
            top: { y: 3, edge: 3.4, gap: 1 },
            pill: { font: 1.3, padX: 1.2, padY: 0.4 },
            mark: { font: 1.3 },
            bottom: { y: 3, edge: 3.4, gap: 2.4 },
            lead: { gap: 1.1 },
            title: { font: 1.4 },
            name: { font: 7 },
            job: { font: 1.8, levelFont: 1.5, icon: 3.6, gap: 1 },
            chip: { font: 1.25, padX: 1.1, padY: 0.35, gap: 0.7 },
            quote: { font: 1.5, maxWidth: 52 },
            side: { layout: 'column', gap: 1.2 },
            subs: { icon: 3, pad: 0.4, radius: 0.8, gap: 0.8 },
            hours: { width: 20, font: 1, cell: 1.1, gapX: 0.45, gapY: 0.4, radius: 0.35 },
            se: { font: 0.95 },
            hairline: 0.125
        },
        portrait: {
            top: { y: 4, edge: 4.4, gap: 1 },
            pill: { font: 1.9, padX: 1.7, padY: 0.6 },
            mark: { font: 1.9 },
            bottom: { y: 4.4, edge: 4.4, gap: 2.4 },
            lead: { gap: 1.6 },
            title: { font: 2 },
            name: { font: 10.5 },
            job: { font: 2.7, levelFont: 2.2, icon: 5.4, gap: 1 },
            chip: { font: 1.9, padX: 1.6, padY: 0.5, gap: 0.7 },
            quote: { font: 2.3, maxWidth: 100 },
            side: { layout: 'row', gap: 1.2 },
            subs: { icon: 4.6, pad: 0.4, radius: 0.8, gap: 0.8 },
            hours: { width: 34, font: 1.5, cell: 1.7, gapX: 0.45, gapY: 0.4, radius: 0.35 },
            se: { font: 1.4 },
            hairline: 0.185
        }
    });

    // 不跟著版面變的數字
    const LINE_NORMAL = 1.45; // line-height: normal（Noto Sans TC 是 1.448 倍字級）：膠囊、時段、版權字一行有多高
    const QUOTE_LINE = 1.5; // 自我介紹的行高（草稿的 .quote line-height）
    const QUOTE_MAX_LINES = 2;
    const CHIP_MAX_ROWS = 2;
    const TITLE_SPACING = 0.3; // 稱號的字距，單位是 em（草稿的 letter-spacing: 0.3em）
    const FIT_FLOOR = 0.3; // 放不下的字最多縮到原本的 30%（原因見檔案開頭）
    const ICON_RADIUS = 0.22; // 沒有圖示時的圓角方塊：圓角是邊長的幾倍
    const LETTER_SIZE = 0.55; // 方塊裡那個字的字級是邊長的幾倍
    // 預設背景的光點：固定的亂數種子，所以每次畫都一樣；半徑的單位是 cqw
    const DOTS = Object.freeze({ count: 64, seed: 20261110, reach: 0.75, radiusMin: 0.15, radiusMax: 1.2, alphaMin: 0.08, alphaMax: 0.35 });

    const DEFAULT_LEVEL_LABEL = 'Lv';
    const DEFAULT_MARK = 'FF14.tw';
    const DEFAULT_NOTICE = 'FINAL FANTASY XIV © SQUARE ENIX';
    const ELLIPSIS = '…';
    const HEX_COLOR = /^#[0-9a-f]{6}$/i;

    // ---------- 小工具 ----------

    const hasText = (value) => typeof value === 'string' && value.trim() !== '';
    const clean = (value) => (typeof value === 'string' ? value.trim() : '');
    const isIterable = (value) => value !== null && value !== undefined && typeof value[Symbol.iterator] === 'function';
    // 第一個字（以 Unicode 字元計，不會把代理對切成兩半）
    const firstChar = (text) => Array.from(text)[0] ?? '';
    const sum = (numbers) => numbers.reduce((total, number) => total + number, 0);

    // 版面數字 → 像素：數字乘上 unit，物件逐一往下換，其他（字串）照舊
    function toPixels(value, unit) {
        if (typeof value === 'number') return value * unit;
        if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, toPixels(inner, unit)]));
        return value;
    }

    function geometry(format) {
        const { width, height } = SIZES[format];
        return { width, height, ...toPixels(SPECS[format], width / 100) };
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

    // ---------- 整理畫面模型 ----------

    // 時段：有選的格子（DAYS × SLOTS 的 true／false 表）與列名、欄名。一格都沒選（或沒有這份資料）是 null：整塊不畫
    function hoursOf(value) {
        if (!isObject(value)) return null;
        const keys = new Set(isIterable(value.on) ? value.on : []);
        const on = DAYS.map((day) => SLOTS.map((slot) => keys.has(`${day}-${slot}`)));
        if (!on.some((row) => row.some(Boolean))) return null;
        const labels = (list, count) => Array.from({ length: count }, (_, i) => (Array.isArray(list) && typeof list[i] === 'string' ? list[i].trim() : ''));
        return { on, days: labels(value.days, DAYS.length), slots: labels(value.slots, SLOTS.length) };
    }

    // 任何東西 → 畫圖用的樣子：字串去掉前後空白、沒填的是 ''，沒有的區塊是 null 或 []。fontsFor() 與 draw() 都從這裡來，
    // 所以「要載入的字」與「畫出來的字」是同一份
    function viewOf(model) {
        const source = isObject(model) ? model : {};
        const job = isObject(source.job) ? source.job : {};
        const jobName = clean(job.name);
        const level = typeof job.level === 'number' ? job.level : Number(hasText(job.level) ? job.level : NaN);
        const levelLabel = hasText(source.levelLabel) ? source.levelLabel.trim() : DEFAULT_LEVEL_LABEL;
        const tag = clean(source.fcTag);
        const image = isObject(source.image) && source.image.source ? { source: source.image.source, width: source.image.width, height: source.image.height } : null;
        return {
            format: Object.prototype.hasOwnProperty.call(SIZES, source.format) ? source.format : DEFAULT_FORMAT,
            accent: typeof source.accent === 'string' && HEX_COLOR.test(source.accent) ? source.accent : ROLE_COLORS.dps,
            image,
            crop: source.crop,
            mark: hasText(source.mark) ? source.mark.trim() : DEFAULT_MARK,
            notice: hasText(source.notice) ? source.notice.trim() : DEFAULT_NOTICE,
            name: clean(source.name),
            title: clean(source.title).toUpperCase(), // 草稿的 text-transform: uppercase
            world: clean(source.world),
            tag: tag === '' ? '' : `«${tag}»`,
            job: jobName === '' ? null : { name: jobName, icon: job.icon || null, level: Number.isFinite(level) ? `${levelLabel} ${level}` : '' },
            subJobs: (Array.isArray(source.subJobs) ? source.subJobs : [])
                .filter(isObject)
                .map((sub) => ({ name: clean(sub.name), icon: sub.icon || null }))
                .filter((sub) => sub.name !== '' || sub.icon !== null)
                .slice(0, LIMITS.subJobs),
            likes: (Array.isArray(source.likes) ? source.likes : []).map(clean).filter((label) => label !== '').slice(0, LIMITS.likes),
            hours: hoursOf(source.hours),
            intro: clean(source.intro)
        };
    }

    // ---------- 載入字型 ----------

    function fontsFor(model) {
        const view = viewOf(model);
        const byFont = new Map(); // 字型字串 → 用它畫的每一段字
        const add = (kind, ...strings) => {
            const font = fontString(kind, LOAD_PX);
            for (const text of strings) {
                if (typeof text !== 'string' || text === '') continue;
                if (!byFont.has(font)) byFont.set(font, []);
                byFont.get(font).push(text);
            }
        };
        // 沒有圖示的職業畫名稱的第一個字（粗體）
        const letters = [view.job, ...view.subJobs].filter((item) => item !== null && item.icon === null).map((item) => firstChar(item.name));
        add(FONTS.name, view.name);
        add(FONTS.mark, view.mark);
        add(FONTS.bold, view.job?.name, ...letters);
        add(FONTS.text, view.world, view.tag, view.title, view.job?.level, ...view.likes, view.intro === '' ? '' : view.intro + ELLIPSIS, ...(view.hours ? [...view.hours.days, ...view.hours.slots] : []), view.notice);
        return [...byFont].map(([font, strings]) => ({ font, text: strings.join('') }));
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

    // 一段字畫在 (x, centerY)：x 是字的左邊，centerY 是這一行的中線（draw() 一開始設好靠左、垂直置中）。字型與顏色每次都設，不靠上一次的狀態
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
        const font = fontString(FONTS.bold, size * LETTER_SIZE);
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

    // ---------- 背景 ----------

    // 沒有截圖時的預設背景：由深藍紫到重點色的對角漸層，再撒上固定位置的柔和光點
    function drawBackdrop(ctx, accent, g) {
        const diagonal = ctx.createLinearGradient(0, 0, g.width, g.height);
        diagonal.addColorStop(0, COLORS.backdropStart);
        diagonal.addColorStop(1, accent);
        ctx.fillStyle = diagonal;
        ctx.fillRect(0, 0, g.width, g.height);

        const random = seededRandom(DOTS.seed);
        const unit = g.width / 100;
        for (let i = 0; i < DOTS.count; i++) {
            // 亂數用的順序固定（半徑、x、y、亮度）：小光點多、大光點少，只撒在上面 reach 的範圍（下面有深色漸層蓋著），整顆都在畫布裡
            const radius = (DOTS.radiusMin + random() ** 2 * (DOTS.radiusMax - DOTS.radiusMin)) * unit;
            const x = radius + random() * (g.width - 2 * radius);
            const y = radius + random() * (g.height * DOTS.reach - radius);
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

    // 截圖鋪滿整張卡片（位置照 coverRect）；沒有截圖，或圖的大小不對畫不出來，就畫預設背景
    function drawBackground(ctx, view, g) {
        if (view.image !== null) {
            const rect = coverRect(view.image.width, view.image.height, g.width, g.height, view.crop);
            if (rect.dw > 0 && rect.dh > 0) {
                ctx.drawImage(view.image.source, rect.dx, rect.dy, rect.dw, rect.dh);
                return;
            }
        }
        drawBackdrop(ctx, view.accent, g);
    }

    // 由上到下的深色漸層，蓋在截圖或預設背景上，字才看得清楚
    function drawShade(ctx, g) {
        const shade = ctx.createLinearGradient(0, 0, 0, g.height);
        for (const [offset, color] of SHADE) shade.addColorStop(offset, color);
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, g.width, g.height);
    }

    // ---------- 上面一列：伺服器與部隊簡稱的膠囊、FF14.tw ----------

    function drawTop(ctx, view, g) {
        const left = g.top.edge;
        const right = g.width - g.top.edge;
        const pillHeight = g.pill.font * LINE_NORMAL + 2 * g.pill.padY + 2 * g.hairline;
        const centerY = g.top.y + pillHeight / 2;

        // 右上的 FF14.tw 貼著右邊距
        const markFont = fontString(FONTS.mark, g.mark.font);
        const markWidth = measurer(ctx, markFont)(view.mark);
        drawText(ctx, view.mark, right - markWidth, centerY, markFont, COLORS.mark);

        // 左上的膠囊，一顆接著一顆；兩顆加起來放不下（要讓出 FF14.tw）時，字一起縮小
        const labels = [view.world, view.tag].filter((label) => label !== '');
        if (labels.length === 0) return;
        const pad = g.pill.padX + g.hairline;
        const measure = measurer(ctx, fontString(FONTS.text, g.pill.font));
        const widths = labels.map(measure);
        const room = right - left - markWidth - g.top.gap - labels.length * 2 * pad - (labels.length - 1) * g.top.gap;
        const scale = fitScale(sum(widths), room, FIT_FLOOR);
        const font = fontString(FONTS.text, g.pill.font * scale);
        let x = left;
        labels.forEach((label, i) => {
            const width = widths[i] * scale + 2 * pad;
            drawCapsule(ctx, x, g.top.y, width, pillHeight, COLORS.pillFill, COLORS.pillStroke, g.hairline);
            drawText(ctx, label, x + pad, centerY, font, COLORS.text);
            x += width + g.top.gap;
        });
    }

    // ---------- 左下那一欄的區塊：每個是 { height, draw(x, top) }，沒填的是 null ----------

    // 稱號：大寫、字距 0.3em、重點色的淺色，一個字一個字畫
    function titleBlock(ctx, view, g, maxWidth) {
        if (view.title === '') return null;
        const chars = Array.from(view.title);
        const widthAt = (px) => {
            const measure = measurer(ctx, fontString(FONTS.text, px));
            return sum(chars.map(measure)) + (chars.length - 1) * px * TITLE_SPACING;
        };
        const px = g.title.font * fitScale(widthAt(g.title.font), maxWidth, FIT_FLOOR);
        const font = fontString(FONTS.text, px);
        const height = g.title.font * LINE_NORMAL;
        const tint = tintOf(view.accent, TITLE_TINT);
        return {
            height,
            draw(x, top) {
                const measure = measurer(ctx, font);
                let cursor = x;
                for (const char of chars) {
                    drawText(ctx, char, cursor, top + height / 2, font, tint);
                    cursor += measure(char) + px * TITLE_SPACING;
                }
            }
        };
    }

    // 名字：最大的字，放不下整行等比例縮小（行高 1，所以高度跟著縮）
    function nameBlock(ctx, view, g, maxWidth) {
        if (view.name === '') return null;
        const px = fittedSize(ctx, FONTS.name, g.name.font, view.name, maxWidth);
        return {
            height: px,
            draw: (x, top) => drawText(ctx, view.name, x, top + px / 2, fontString(FONTS.name, px), COLORS.text)
        };
    }

    // 主職：圖示、名稱（粗體）、Lv，三者之間隔 job.gap
    function jobBlock(ctx, view, g, maxWidth) {
        const job = view.job;
        if (job === null) return null;
        const spec = g.job;
        const hasLevel = job.level !== '';
        const nameWidth = measurer(ctx, fontString(FONTS.bold, spec.font))(job.name);
        const levelWidth = hasLevel ? measurer(ctx, fontString(FONTS.text, spec.levelFont))(job.level) : 0;
        const room = maxWidth - spec.icon - (hasLevel ? 2 : 1) * spec.gap;
        const scale = fitScale(nameWidth + levelWidth, room, FIT_FLOOR);
        const nameFont = fontString(FONTS.bold, spec.font * scale);
        const levelFont = fontString(FONTS.text, spec.levelFont * scale);
        return {
            height: spec.icon,
            draw(x, top) {
                const centerY = top + spec.icon / 2;
                drawIcon(ctx, job, x, top, spec.icon, view.accent);
                const nameX = x + spec.icon + spec.gap;
                drawText(ctx, job.name, nameX, centerY, nameFont, COLORS.text);
                if (hasLevel) {
                    drawText(ctx, job.level, nameX + measurer(ctx, nameFont)(job.name) + spec.gap, centerY, levelFont, COLORS.level);
                }
            }
        };
    }

    // 喜歡的內容：膠囊，排不下一列就換下一列，最多 2 列
    function chipsBlock(ctx, view, g, maxWidth) {
        if (view.likes.length === 0) return null;
        const spec = g.chip;
        const font = fontString(FONTS.text, spec.font);
        const height = spec.font * LINE_NORMAL + 2 * spec.padY + 2 * g.hairline;
        const pad = spec.padX + g.hairline;
        const chips = layoutChips(view.likes, measurer(ctx, font), { maxWidth, height, padX: pad, gap: spec.gap, rowGap: spec.gap, maxRows: CHIP_MAX_ROWS });
        if (chips.length === 0) return null;
        return {
            height: Math.max(...chips.map((chip) => chip.y + chip.h)),
            draw(x, top) {
                for (const chip of chips) {
                    drawCapsule(ctx, x + chip.x, top + chip.y, chip.w, chip.h, COLORS.chipFill, COLORS.chipStroke, g.hairline);
                    drawText(ctx, chip.label, x + chip.x + pad, top + chip.y + chip.h / 2, font, COLORS.text);
                }
            }
        };
    }

    // 一句話自我介紹：折成最多 2 行（橫版最寬 52cqw，直版用滿整欄）
    function quoteBlock(ctx, view, g, maxWidth) {
        if (view.intro === '') return null;
        const font = fontString(FONTS.text, g.quote.font);
        const lines = wrapText(view.intro, Math.min(g.quote.maxWidth, maxWidth), measurer(ctx, font), QUOTE_MAX_LINES);
        if (lines.length === 0) return null;
        const lineHeight = g.quote.font * QUOTE_LINE;
        return {
            height: lines.length * lineHeight,
            draw(x, top) {
                lines.forEach((line, i) => drawText(ctx, line, x, top + lineHeight * (i + 0.5), font, COLORS.quote));
            }
        };
    }

    // 左下那一欄，由上到下：稱號、名字、主職、喜歡的內容、自我介紹，貼著 bottom 往上排，沒填的整塊拿掉
    function drawLead(ctx, view, g, left, width, bottom) {
        const blocks = [
            titleBlock(ctx, view, g, width),
            nameBlock(ctx, view, g, width),
            jobBlock(ctx, view, g, width),
            chipsBlock(ctx, view, g, width),
            quoteBlock(ctx, view, g, width)
        ].filter((block) => block !== null);
        stackUp(blocks, g.lead.gap, bottom, () => left);
    }

    // ---------- 右下那一組的區塊：每個是 { width, height, draw(x, top) } ----------

    // 其他職業：每個一張深色的圓角方塊，圖示在正中
    function subsBlock(ctx, view, g) {
        if (view.subJobs.length === 0) return null;
        const spec = g.subs;
        const tile = spec.icon + 2 * spec.pad;
        const count = view.subJobs.length;
        return {
            width: count * tile + (count - 1) * spec.gap,
            height: tile,
            draw(x, top) {
                view.subJobs.forEach((sub, i) => {
                    const tileX = x + i * (tile + spec.gap);
                    ctx.fillStyle = COLORS.tile;
                    roundedRect(ctx, tileX, top, tile, tile, spec.radius);
                    ctx.fill();
                    drawIcon(ctx, sub, tileX + spec.pad, top + spec.pad, spec.icon, view.accent);
                });
            }
        };
    }

    // 時段格子：第一列是欄名（早上…），下面每一列是列名（平日、假日）加 4 格，有選的格子用重點色。
    // 列名那一欄和內容一樣寬，剩下的寬度平分給 4 個時段欄；標籤放不下就整組縮小，不超出這個區塊的寬度
    function hoursBlock(ctx, view, g) {
        if (view.hours === null) return null;
        const { days, slots, on } = view.hours;
        const spec = g.hours;
        const rowHeight = spec.font * LINE_NORMAL;
        const measure = measurer(ctx, fontString(FONTS.text, spec.font));
        const dayWidth = Math.max(...days.map(measure));
        const slotWidth = Math.max(...slots.map(measure));
        const room = spec.width - 4 * spec.gapX;
        const scale = fitScale(dayWidth + 4 * slotWidth, room, FIT_FLOOR);
        const font = fontString(FONTS.text, spec.font * scale);
        const firstColumn = dayWidth * scale;
        const track = Math.max(0, (room - firstColumn) / 4);
        return {
            width: spec.width,
            height: 3 * rowHeight + 2 * spec.gapY,
            draw(x, top) {
                const centerOf = (row) => top + row * (rowHeight + spec.gapY) + rowHeight / 2;
                const columnX = (slot) => x + firstColumn + spec.gapX + slot * (track + spec.gapX);
                slots.forEach((label, slot) => label !== '' && drawText(ctx, label, columnX(slot), centerOf(0), font, COLORS.hoursLabel));
                days.forEach((label, day) => {
                    const centerY = centerOf(day + 1);
                    if (label !== '') drawText(ctx, label, x, centerY, font, COLORS.hoursLabel);
                    on[day].forEach((selected, slot) => {
                        ctx.fillStyle = selected ? view.accent : COLORS.hoursOff;
                        roundedRect(ctx, columnX(slot), centerY - spec.cell / 2, track, spec.cell, spec.radius);
                        ctx.fill();
                    });
                });
            }
        };
    }

    // SE 版權字：一定畫
    function noticeBlock(ctx, view, g, maxWidth) {
        const px = fittedSize(ctx, FONTS.text, g.se.font, view.notice, maxWidth);
        const font = fontString(FONTS.text, px);
        const height = g.se.font * LINE_NORMAL;
        return {
            width: measurer(ctx, font)(view.notice),
            height,
            draw: (x, top) => drawText(ctx, view.notice, x, top + height / 2, font, COLORS.notice)
        };
    }

    // 右下那一組：橫版靠右由上到下疊起來（其他職業、時段格子、SE 版權字，沒填的拿掉）；
    // 直版在最下面橫排，由左到右、中間平均隔開（草稿的 space-between）；只剩 SE 版權字時也靠右，和橫版一樣，
    // 不會因為填了或清掉其他職業與時段，版權字就左右跳。回傳它占的寬與高，draw() 才真的畫
    function layoutSide(ctx, view, g, left, right, floor) {
        const blocks = [subsBlock(ctx, view, g), hoursBlock(ctx, view, g), noticeBlock(ctx, view, g, right - left)].filter((block) => block !== null);
        if (g.side.layout === 'column') {
            // 寬度至少是時段格子那麼寬，就算這次沒畫時段格子：名字不會因為勾了一個時段而忽大忽小
            return {
                width: Math.max(g.hours.width, ...blocks.map((block) => block.width)),
                height: sum(blocks.map((block) => block.height)) + (blocks.length - 1) * g.side.gap,
                draw: () => stackUp(blocks, g.side.gap, floor, (block) => right - block.width)
            };
        }
        return {
            width: right - left,
            height: Math.max(...blocks.map((block) => block.height)),
            draw() {
                if (blocks.length === 1) {
                    blocks[0].draw(right - blocks[0].width, floor - blocks[0].height);
                    return;
                }
                const gap = (right - left - sum(blocks.map((block) => block.width))) / (blocks.length - 1);
                let x = left;
                for (const block of blocks) {
                    block.draw(x, floor - block.height);
                    x += block.width + gap;
                }
            }
        };
    }

    // 底下那一塊：橫版左邊是左下那一欄、右邊是右下那一組，兩欄之間隔 bottom.gap，那一欄的寬度要讓開右邊那一組；
    // 直版右下那一組在最下面，左下那一欄在它上面（用滿整行）
    function drawBottom(ctx, view, g) {
        const left = g.bottom.edge;
        const right = g.width - g.bottom.edge;
        const floor = g.height - g.bottom.y;
        const side = layoutSide(ctx, view, g, left, right, floor);
        const beside = g.side.layout === 'column';
        side.draw();
        drawLead(
            ctx, view, g, left,
            beside ? right - left - g.bottom.gap - side.width : right - left,
            beside ? floor : floor - side.height - g.bottom.gap
        );
    }

    // ---------- 畫一張卡片 ----------

    function draw(ctx, model) {
        const view = viewOf(model);
        const g = geometry(view.format);
        ctx.save();
        try {
            // 從固定的設定開始畫，不管呼叫端留下什麼；字一律靠左、垂直置中
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            drawBackground(ctx, view, g);
            drawShade(ctx, g);
            drawTop(ctx, view, g);
            drawBottom(ctx, view, g);
        } finally {
            ctx.restore();
        }
    }

    return Object.freeze({ SIZES, fontsFor, draw });
})();

// Export for use in other modules
window.CardRenderer = CardRenderer;
