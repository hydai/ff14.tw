/**
 * 角色卡風格 B「海報」：截圖（或預設背景）鋪滿整張卡片，由上到下漸層成深色，主要的字都在下方；橫版與直版。
 * 版面與顏色照草稿頁的 .card.b（docs/superpowers/specs/2026-11-10-character-card-draft.html）：草稿的數字是 cqw（卡片寬度的 1%），
 * 這裡的版面數字（SPECS）原樣照抄 cqw，畫的時候乘上 寬度 / 100 換成 canvas 的像素（橫版 1200 寬是 12px，直版 1080 寬是 10.8px）。
 * 畫圖的小工具（字、膠囊、圖示、預設背景、時段格子…）是三種風格共用的，在 card-paint.js（CardPaint）；這支只有海報自己的顏色、版面數字與區塊。
 * 只畫圖、不碰 DOM，也不自己去拿 canvas。
 *
 * - draw(ctx, view)：畫在 ctx 上。view 是 CardRenderer 整理好的畫面模型（沒填的字串是 ''，沒有的區塊是 null 或 []；稱號沒有轉大寫，這裡自己轉）。
 *   ctx 的 globalAlpha、textAlign、textBaseline 由 CardRenderer.draw 先設好，畫完的還原也在那裡，所以這裡不 save()／restore()
 * - texts(view)：這張卡片要載入的字：每一段字與它用的字型 { kind: { weight, family }, text }，沒有畫的字（沒填的欄位）不列；
 *   和 draw() 畫出來的字是同一份 view，CardRenderer.fontsFor 把它照字型分組
 * - photoBox(format)：截圖鋪滿的框，海報是整張卡片 { x: 0, y: 0, width, height }，每次回傳新的物件
 *
 * view 用到的欄位：{ format, accent, image: { source, width, height } | null, crop, mark, notice, name, title, world,
 *   tag（部隊簡稱，已經加上 « »）, job: { name, icon, level（接好的 'Lv 100'，沒有等級是 ''） } | null, subJobs: [{ name, icon }], likes: [string],
 *   hours: { on: [[bool × 4] × 2], days, slots } | null, intro }，icon 是已載入的圖片或 null
 *
 * - 版面：截圖（或預設背景）鋪滿 → 由上到下的深色漸層 → 左上伺服器與部隊簡稱的膠囊、右上 FF14.tw →
 *   左下由上到下是稱號、名字、主職、喜歡的內容、自我介紹；右下是其他職業的圖示、時段格子、SE 版權字
 *   （橫版靠右由上到下疊起來；直版在自我介紹下方橫排，由左到右）。所有東西都貼著底邊往上排，所以沒填的整塊拿掉後，剩下的往下靠
 * - 沒填的欄位（空字串、只有空白）整塊不畫，不留空位；什麼都沒填時只畫背景、FF14.tw 與 SE 版權字。SE 版權字一定畫（卡片上畫了 SE 的職業圖示）
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
 * - 放不下的字（名字最明顯）最多縮到 30%（CardPaint.FIT_FLOOR）：CardLayout 預設的 55% 不夠，21 個全形字的名字縮到 55% 還是比可用寬度寬，會超出卡片
 * - 草稿的示意背景是程式畫的風景；這裡的預設背景是 CardPaint.drawBackdrop：由深藍紫到重點色的對角漸層，加上固定亂數種子撒的柔和光點（每次畫都一樣）
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到；
 * 需要 card-layout.js（CardLayout）與 card-paint.js（CardPaint）先載入。
 */
const CardStyleB = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const { fitScale, wrapText, layoutChips, coverRect } = window.CardLayout;
    const {
        SIZES, LINE_NORMAL, FIT_FLOOR, ELLIPSIS, FAMILIES,
        fontString, toPixels, firstChar, sum, tintOf,
        roundedRect, drawText, measurer, fittedSize, drawCapsule, drawIcon, stackUp,
        spacedWidth, drawSpaced, drawBackdrop, hoursBlock
    } = window.CardPaint;

    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const deepFreeze = (value) => {
        for (const inner of Object.values(value)) if (isObject(inner)) deepFreeze(inner);
        return Object.freeze(value);
    };

    // ---------- 顏色（畫在圖上的成品，不跟著網站的深淺色）----------

    const COLORS = Object.freeze({
        text: '#ffffff',
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

    const FONTS = Object.freeze({
        name: Object.freeze({ weight: 800, family: FAMILIES.display }),
        mark: Object.freeze({ weight: 600, family: FAMILIES.display }),
        bold: Object.freeze({ weight: 700, family: FAMILIES.sans }),
        text: Object.freeze({ weight: 500, family: FAMILIES.sans })
    });

    // ---------- 版面數字（草稿的 cqw：卡片寬度的 1%）----------

    // 每一個數字都是 cqw，畫的時候換成像素（CardPaint.toPixels）；字串（layout）照舊。名稱照草稿的 CSS：
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
    const QUOTE_LINE = 1.5; // 自我介紹的行高（草稿的 .quote line-height）
    const QUOTE_MAX_LINES = 2;
    const CHIP_MAX_ROWS = 2;
    const TITLE_SPACING = 0.3; // 稱號的字距，單位是 em（草稿的 letter-spacing: 0.3em）

    function geometry(format) {
        const { width, height } = SIZES[format];
        return { width, height, ...toPixels(SPECS[format], width / 100) };
    }

    // ---------- 載入字型 ----------

    // 這張卡片要載入的字：每一段字與它用的字型 { kind, text }，沒填的欄位不列。要和 draw() 畫出來的字一致（用同一份 view），
    // 所以 draw() 多畫了什麼字，這裡也要跟著加
    function texts(view) {
        const found = [];
        const add = (kind, ...strings) => {
            for (const text of strings) if (typeof text === 'string' && text !== '') found.push({ kind, text });
        };
        // 沒有圖示的職業畫名稱的第一個字（粗體）
        const letters = [view.job, ...view.subJobs].filter((item) => item !== null && item.icon === null).map((item) => firstChar(item.name));
        add(FONTS.name, view.name);
        add(FONTS.mark, view.mark);
        add(FONTS.bold, view.job?.name, ...letters);
        add(FONTS.text, view.world, view.tag, view.title.toUpperCase(), view.job?.level, ...view.likes, view.intro === '' ? '' : view.intro + ELLIPSIS, ...(view.hours ? [...view.hours.days, ...view.hours.slots] : []), view.notice);
        return found;
    }

    // ---------- 背景 ----------

    // 截圖鋪滿整張卡片（位置照 coverRect）；沒有截圖，或圖的大小不對畫不出來，就畫預設背景
    function drawBackground(ctx, view, g) {
        if (view.image !== null) {
            const rect = coverRect(view.image.width, view.image.height, g.width, g.height, view.crop);
            if (rect.dw > 0 && rect.dh > 0) {
                ctx.drawImage(view.image.source, rect.dx, rect.dy, rect.dw, rect.dh);
                return;
            }
        }
        drawBackdrop(ctx, view.accent, { x: 0, y: 0, width: g.width, height: g.height }, g.width / 100);
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
        const title = view.title.toUpperCase(); // 草稿的 text-transform: uppercase
        const px = g.title.font * fitScale(spacedWidth(ctx, title, FONTS.text, g.title.font, TITLE_SPACING), maxWidth, FIT_FLOOR);
        const height = g.title.font * LINE_NORMAL;
        const tint = tintOf(view.accent, TITLE_TINT);
        return {
            height,
            draw: (x, top) => drawSpaced(ctx, title, x, top + height / 2, FONTS.text, px, TITLE_SPACING, tint)
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

    // 時段格子：版面數字（像素）加上字型與顏色，畫法在 CardPaint.hoursBlock
    const hoursSpec = (view, g) => ({ kind: FONTS.text, ...g.hours, labelColor: COLORS.hoursLabel, offColor: COLORS.hoursOff, accent: view.accent });

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
        const blocks = [subsBlock(ctx, view, g), hoursBlock(ctx, view.hours, hoursSpec(view, g)), noticeBlock(ctx, view, g, right - left)].filter((block) => block !== null);
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

    function draw(ctx, view) {
        const g = geometry(view.format);
        drawBackground(ctx, view, g);
        drawShade(ctx, g);
        drawTop(ctx, view, g);
        drawBottom(ctx, view, g);
    }

    // ---------- 截圖鋪滿的框 ----------

    // 海報的截圖鋪滿整張卡片
    function photoBox(format) {
        const { width, height } = SIZES[format];
        return { x: 0, y: 0, width, height };
    }

    return Object.freeze({ draw, texts, photoBox });
})();

// Export for use in other modules
window.CardStyleB = CardStyleB;
