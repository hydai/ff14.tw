/**
 * 角色卡風格 C「資訊卡」：淺色底、像 App 的個人頁，字最好讀（每一段字和它的底都至少 4.5:1，包括很淺的自己選的重點色；唯一的例外是沒有圖示的職業
 * 畫在重點色方塊裡的大字，見下面「和草稿不一樣的地方」）；橫版與直版。
 * 底是淺色（#f4f5fa），上面是一個照片框（橫版在左、直版在上）與一個資訊欄（橫版在右、直版在下）；主職畫成壓在照片框下緣的白色膠囊徽章
 * （重點色的圓、職業圖示、職業名稱與 Lv）。資訊欄由上到下是抬頭（稱號、名字、伺服器，三行中間不留間距）、三格小卡（部隊、大國防聯軍、在找什麼）、
 * 兩欄（喜歡的內容、遊玩時段）、其他職業、自我介紹，最下面是一列聯絡方式與「FF14.tw · FINAL FANTASY XIV © SQUARE ENIX」。
 * 海報不畫的部隊名稱、大國防聯軍、在找什麼與聯絡方式，這裡都畫；主職只畫在徽章裡。
 * 版面與顏色照草稿頁的 .card.c（docs/superpowers/specs/2026-11-10-character-card-draft.html）：草稿的數字是 cqw（卡片寬度的 1%），
 * 這裡的版面數字（SPECS）原樣照抄 cqw，畫的時候乘上 寬度 / 100 換成 canvas 的像素（橫版 1200 寬是 12px，直版 1080 寬是 10.8px）。
 * 畫圖的小工具（字、膠囊、圖示、預設背景、照片框、時段格子、小標、由上往下疊、底部一列、顏色混合…）與名片、資訊卡一模一樣的排法（照片框與資訊欄的範圍、
 * 三欄資訊、喜歡的內容與遊玩時段兩欄、資訊欄由上往下疊）是共用的，在 card-paint.js（CardPaint）；這支只有資訊卡自己的顏色、版面數字與區塊
 * （徽章、抬頭、其他職業、自我介紹的框，和把自己的數字與顏色當 spec 傳給共用函式的三格小卡與兩欄）。只畫圖、不碰 DOM，也不自己去拿 canvas。
 *
 * - draw(ctx, view)：畫在 ctx 上。view 是 CardRenderer 整理好的畫面模型（沒填的字串是 ''，沒有的區塊是 null 或 []；稱號原樣，沒有轉大寫）。
 *   ctx 的 globalAlpha、textAlign、textBaseline 由 CardRenderer.draw 先設好，畫完的還原也在那裡；這裡改陰影、clip 的地方各自包在 save()／restore() 裡，
 *   畫完就沒了
 * - texts(view)：這張卡片要載入的字：每一段字與它用的字型 { kind: { weight, family }, text }，沒有畫的字（沒填的欄位）不列；
 *   和 draw() 畫出來的字是同一份 view，CardRenderer.fontsFor 把它照字型分組。只用 Noto Sans TC 的 500 與 700（名字也是 700）
 * - photoBox(format)：截圖畫在哪個框 { x, y, width, height }（橫版在左、直版在上），每次回傳新的物件
 *
 * view 用到的欄位：{ format, accent, image: { source, width, height } | null（照片框裡的截圖）, crop（照片框裡截圖的位置）, mark, notice, name, title,
 *   world, fcName, tag（部隊簡稱，已經加上 « »）, gc, looking, contact, labels: { fc, gc, looking, likes, hours, subJobs }（卡片上的小標）,
 *   job: { name, icon, level（接好的 'Lv 100'，沒有等級是 ''） } | null, subJobs: [{ name, icon }], likes: [string],
 *   hours: { on: [[bool × 4] × 2], days, slots } | null, intro }，icon 是已載入的圖片或 null。模糊背景（view.backdrop）是名片用的，這裡不畫
 *
 * - 版面：底（#f4f5fa）→ 照片框（截圖或預設背景，圓角 1.8cqw）→ 徽章 → 資訊欄。資訊欄的區塊由上往下疊（CardPaint.drawInfoColumn，用 stackDown 疊），底部一列貼著資訊欄的底；
 *   每一塊沒填就整塊拿掉，下面的往上靠，不留空位；沒有主職就沒有徽章。文字一律靠左、垂直置中，座標是字的左邊與這一行的中線
 * - 照片框：橫版在左，寬是內容寬的 36%、高是內容的高，和資訊欄隔 3.2cqw；直版在上，寬是內容寬、高是內容高的 40% 減 1.6cqw（下面留給徽章），
 *   資訊欄從 內距 + 內容高 × 40% + 4.4cqw 開始。截圖畫在框裡（clip），沒有光環與陰影
 * - 徽章：白色膠囊，左邊在照片框左邊 + 1.6／2.4cqw、底邊在照片框底邊 + 1.8／2.6cqw（壓在照片框的下緣），帶一點陰影；裡面由左到右是重點色的圓
 *   （直徑是圖示加 0.8cqw，圖示在正中）、職業名稱（粗體）、一個空白、Lv。膠囊最寬到照片框寬度減兩邊的邊，放不下時名稱與 Lv 一起縮小（最多縮到 CardPaint.FIT_FLOOR）
 * - 三格小卡：3 等分，每一張是白色的圓角框，裡面是小標與最多 2 行的值（CardLayout.wrapText），同一列一樣高（照最高的那一張）；
 *   有值的照部隊、大國防聯軍、在找什麼的順序從左邊那欄排（欄寬照舊是三等分），三個都沒填整列拿掉（CardPaint.metaCells）
 * - 兩欄（喜歡的內容 : 遊玩時段 = 1 : 1）只有一邊時：只有喜歡的內容用整列的寬，只有時段照右欄原本的寬、靠左（CardPaint.likesAndHours）；
 *   膠囊排成最多 2 列、排不下時整組縮小到最多 60%；小標放不下整行縮小（最多縮到 CardPaint.FIT_FLOOR），名字放不下整行縮小（行高 1.15，高度跟著縮），
 *   稱號放不下也整行縮小（最多縮到 CardPaint.FIT_FLOOR，行高照原本的字級，高度不跟著縮）
 * - 資訊欄的高度：合格的輸入（每個欄位都填到上限，名字短而其他區塊都到最高，測試量過）照草稿的數字就放得下；萬一放不下，CardPaint.stackDown 把區塊之間的
 *   間距一起縮小（最小 0），不超出卡片：這是保險
 *
 * 和草稿不一樣的地方（canvas 做不到或另外決定的）：
 * - 草稿的卡片有圓角，這裡四個角不裁：下載的 PNG 是整張矩形，預覽的圓角由頁面用 CSS 加
 * - 灰字（對比度）：草稿的小標與時段的 #7a8195 在 #f4f5fa 上只有 3.57:1、底部一列的 #8a90a2 只有 2.93:1，都換成 #697084（在 #f4f5fa 上 4.54:1、
 *   白色上 4.94:1）；#5b6275（伺服器、Lv）本來就有 5.59:1，照草稿。稱號草稿直接用重點色，淺色底上五個職能的預設重點色都不到 4.5:1，
 *   所以是 CardPaint.readableOn(重點色, 底)：重點色一步一步往深色（#1d2233）混，到剛好 4.5:1 為止；膠囊的字也一樣照膠囊的底調整。
 *   所有字色都是不透明的 #rrggbb（測試用 CardLayout.contrastRatio 逐段字檢查）。
 *   唯一的例外：沒有圖示的職業（例如 Beastmaster）畫在重點色方塊裡的那個字（CardPaint.drawIcon），字色是 CardLayout.textColorOn 在白字與深字裡挑對比度高的，
 *   最差的重點色上約 4.2:1，不到 4.5:1；它一定是大字（粗體，方塊邊長的 0.55 倍：徽章裡 23.8px 起，其他職業的方塊 19.1px 起），WCAG 的大字只要 3:1，
 *   所以不另外調色。逐段字檢查用的畫面模型職業都有圖示，所以這個字的大小與對比度另外在 tests/character-card-paint.test.js 檢查（三種風格都一樣）
 * - 名字草稿是 900，這裡是 Noto Sans TC 700（頁面標準的 Google Fonts 連結載得到的最粗，字重只用 500 與 700）；沒指定字重的字（小標、時段、自我介紹、
 *   底部一列）草稿是 400，這裡用 500；沒寫 line-height 的一行字，行高是字級的 CardPaint.LINE_NORMAL 倍（草稿的 normal）
 * - 小標的字距 0.08em 一個字一個字畫（不用 ctx.letterSpacing，舊的 Safari 沒有）
 * - 徽章裡的職業名稱與 Lv 草稿是同一行的兩個行內元素（對齊基線），這裡兩段字都放在膠囊的中線上；Lv 前面的空白用 Lv 的字型量
 * - 草稿的底部一列只用 space-between；這裡和名片一樣，聯絡方式放不下時整行縮小，和右邊至少隔 2cqw
 * - 草稿的預設背景是程式畫的風景；這裡的預設背景是 CardPaint.drawBackdrop（由深藍紫到重點色的對角漸層加光點，每次畫都一樣）；
 *   草稿的照片預設置中，這裡照玩家調整的位置（沒調整過是置中），和海報、名片一樣
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到；
 * 需要 card-layout.js（CardLayout）與 card-paint.js（CardPaint）先載入。
 */
const CardStyleC = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const { fitScale, wrapText } = window.CardLayout;
    const {
        LINE_NORMAL, FIT_FLOOR, ELLIPSIS, FAMILIES, ICON_LETTER,
        deepFreeze, geometryOf, fontString, sum, mixOf, readableOn,
        roundedRect, drawText, measurer, fittedSize, drawIcon, iconLetters, drawCapsule, drawPhotoBox, labelBlock,
        photoInfoBoxes, metaItems, metaCells, likesAndHours, drawInfoColumn, listTexts, footText
    } = window.CardPaint;

    // ---------- 顏色（畫在圖上的成品，不跟著網站的深淺色；全部是不透明的 #rrggbb）----------

    const COLORS = Object.freeze({
        base: '#f4f5fa', // 整張卡片的底
        white: '#ffffff', // 三格小卡、自我介紹的框、徽章的膠囊
        name: '#141826',
        value: '#1d2233', // 小卡的值、自我介紹、徽章的職業名稱；稱號與膠囊的字也是往它混
        soft: '#5b6275', // 伺服器、徽章的 Lv
        gray: '#697084', // 小標、時段的字、底部一列（在 #f4f5fa 上 4.54:1，白色上 4.94:1）
        hoursOff: '#e3e5ee', // 沒選的時段格子（有選的是重點色）
        subTile: '#2a2f45', // 其他職業的方塊
        badgeShadow: 'rgba(29,34,51,0.18)' // 徽章的陰影
    });
    // 膠囊的底 = 重點色往白色混這麼多；膠囊的字 = 重點色往 COLORS.value 混這麼多，再用 readableOn 調到讀得清楚
    const CHIP_FILL_MIX = 0.87;
    const CHIP_TEXT_MIX = 0.2;

    // ---------- 字型 ----------

    const FONTS = Object.freeze({
        bold: Object.freeze({ weight: 700, family: FAMILIES.sans }), // 名字、稱號、小卡的值、膠囊、徽章的職業名稱
        text: Object.freeze({ weight: 500, family: FAMILIES.sans })
    });

    // ---------- 版面數字（草稿的 cqw：卡片寬度的 1%）----------

    // 每一個數字都是 cqw，畫的時候換成像素（CardPaint.geometryOf）；字串（photoAt）照舊。名稱照草稿的 CSS：
    // pad、gap 是 .inner 的內距與照片框和資訊欄的間隔（photoAt 是照片框在左邊或上面），rowGap 是資訊欄區塊之間的間距，
    // photo 是 .photo（radius 圓角，margin 是下面留給徽章的空間，只有直版有），badge 是 .badge-job（left、drop 是膠囊的左邊與底邊相對於照片框的位置，
    // padTop／padLeft／padRight 是膠囊的內距，gap 是圓到名稱，icon 是圖示，ring 是圓比圖示多出來的一圈，font 與 levelFont 是名稱與 Lv，
    // shadowY、shadowBlur 是陰影），facts 是三格小卡（gap 欄距，padX、padY 內距，radius 圓角，font 值的字級），label 是小標，columns 是兩欄，
    // chip 是 .chip，hours 是時段格子，subs 是其他職業的方塊（pad 是圖示到方塊邊的內距），quote 是自我介紹的框，foot 是底部一列
    const SPECS = deepFreeze({
        landscape: {
            photoAt: 'left',
            pad: 3.2,
            gap: 3.2,
            rowGap: 1.4,
            photo: { radius: 1.8, margin: 0 },
            badge: { left: 1.6, drop: 1.8, padTop: 0.6, padLeft: 0.6, padRight: 1.6, gap: 0.9, icon: 3.6, ring: 0.4, font: 1.6, levelFont: 1.25, shadowY: 0.6, shadowBlur: 2 },
            title: { font: 1.45 },
            name: { font: 4.2 },
            world: { font: 1.4 },
            facts: { gap: 1, padX: 1.2, padY: 1, radius: 1, font: 1.4 },
            label: { font: 1.02 },
            columns: { gap: 2 },
            chip: { font: 1.22, padX: 1, padY: 0.3, gap: 0.7 },
            hours: { font: 1.02, cell: 1.15, gapX: 0.5, gapY: 0.45, radius: 0.35 },
            subs: { icon: 2.9, pad: 0.35, radius: 0.8, gap: 0.8 },
            quote: { font: 1.45, padX: 1.4, padY: 1.1, radius: 1 },
            foot: { font: 1.05, gap: 2 }
        },
        portrait: {
            photoAt: 'top',
            pad: 4,
            gap: 4.4,
            rowGap: 2,
            photo: { radius: 1.8, margin: 1.6 },
            badge: { left: 2.4, drop: 2.6, padTop: 0.8, padLeft: 0.8, padRight: 2.2, gap: 0.9, icon: 5.2, ring: 0.4, font: 2.3, levelFont: 1.8, shadowY: 0.6, shadowBlur: 2 },
            title: { font: 2.1 },
            name: { font: 6.2 },
            world: { font: 2 },
            facts: { gap: 1, padX: 1.6, padY: 1.4, radius: 1, font: 2 },
            label: { font: 1.5 },
            columns: { gap: 2 },
            chip: { font: 1.8, padX: 1.4, padY: 0.45, gap: 0.7 },
            hours: { font: 1.5, cell: 1.7, gapX: 0.7, gapY: 0.6, radius: 0.35 },
            subs: { icon: 4.2, pad: 0.35, radius: 0.8, gap: 0.8 },
            quote: { font: 2.1, padX: 1.4, padY: 1.1, radius: 1 },
            foot: { font: 1.5, gap: 2 }
        }
    });

    // 不跟著版面變的數字
    const PHOTO_SHARE = Object.freeze({ left: 0.36, top: 0.4 }); // 照片框占內容寬（橫版）或內容高（直版）的幾成
    const COLUMN_RATIO = Object.freeze([1, 1]); // 兩欄：喜歡的內容 : 遊玩時段
    const LABEL_SPACING = 0.08; // 小標的字距，單位是 em（草稿的 letter-spacing: 0.08em）
    const NAME_LINE = 1.15; // 名字的行高（草稿的 line-height）
    const QUOTE_LINE = 1.55; // 自我介紹的行高
    const QUOTE_MAX_LINES = 2;

    // 小標：字距 0.08em、灰字（畫法在 CardPaint.labelBlock）
    const labelSpecOf = (g) => ({ kind: FONTS.text, font: g.label.font, spacing: LABEL_SPACING, color: COLORS.gray });
    // 稱號的顏色：重點色往深色混到在淺色底上讀得清楚
    const titleColorOf = (view) => readableOn(view.accent, COLORS.base, { toward: COLORS.value });
    // 膠囊的底與字
    const chipFillOf = (view) => mixOf(view.accent, COLORS.white, CHIP_FILL_MIX);
    const chipTextOf = (view, fill) => readableOn(mixOf(view.accent, COLORS.value, CHIP_TEXT_MIX), fill, { toward: COLORS.value });

    // ---------- 載入字型 ----------

    // 這張卡片要載入的字：每一段字與它用的字型 { kind, text }，沒填的欄位不列。要和 draw() 畫出來的字一致（用同一份 view），
    // 所以 draw() 多畫了什麼字，這裡也要跟著加
    function texts(view) {
        const meta = metaItems(view);
        return listTexts([
            [FONTS.bold, view.title, view.name, view.job?.name, ...meta.map((item) => item.value), meta.length > 0 ? ELLIPSIS : '', ...view.likes],
            [ICON_LETTER, ...iconLetters(view)],
            [
                FONTS.text, view.world, view.job?.level,
                ...meta.map((item) => item.label),
                view.likes.length > 0 ? view.labels.likes : '',
                view.hours === null ? '' : view.labels.hours, ...(view.hours ? [...view.hours.days, ...view.hours.slots] : []),
                view.subJobs.length > 0 ? view.labels.subJobs : '',
                view.intro === '' ? '' : view.intro + ELLIPSIS, view.contact, footText(view)
            ]
        ]);
    }

    // ---------- 職業徽章 ----------

    // 壓在照片框下緣的白色膠囊：由左到右是重點色的圓（圖示在正中）、職業名稱、一個空白（用 Lv 的字型量）、Lv。沒有主職就不畫。
    // 膠囊最寬到照片框寬度減兩邊的邊（左邊離照片框 badge.left，右邊留一樣多），放不下時名稱與 Lv 一起縮小；高度由圓決定
    // （一行字比圓矮很多）。陰影只給膠囊（包在 save／restore 裡，畫完陰影就沒了）
    function drawBadge(ctx, view, g, photo) {
        const job = view.job;
        if (job === null) return;
        const spec = g.badge;
        const diameter = spec.icon + 2 * spec.ring;
        const height = diameter + 2 * spec.padTop;
        const hasLevel = job.level !== '';
        const fixed = spec.padLeft + diameter + spec.gap + spec.padRight;
        const textWidth = measurer(ctx, fontString(FONTS.bold, spec.font))(job.name)
            + (hasLevel ? measurer(ctx, fontString(FONTS.text, spec.levelFont))(` ${job.level}`) : 0);
        const scale = fitScale(textWidth, photo.width - 2 * spec.left - fixed, FIT_FLOOR);
        // 縮小之後的字用縮小的字型再量一次：字級取到 0.01px，膠囊的寬和字剛好對上
        const nameFont = fontString(FONTS.bold, spec.font * scale);
        const levelFont = fontString(FONTS.text, spec.levelFont * scale);
        const measureLevel = measurer(ctx, levelFont);
        const nameWidth = measurer(ctx, nameFont)(job.name);
        const spaceWidth = hasLevel ? measureLevel(' ') : 0;
        const width = fixed + nameWidth + spaceWidth + (hasLevel ? measureLevel(job.level) : 0);
        const x = photo.x + spec.left;
        const y = photo.y + photo.height + spec.drop - height;

        ctx.save();
        ctx.shadowColor = COLORS.badgeShadow;
        ctx.shadowBlur = spec.shadowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = spec.shadowY;
        drawCapsule(ctx, x, y, width, height, COLORS.white);
        ctx.restore();

        const circleX = x + spec.padLeft;
        const circleY = y + spec.padTop;
        ctx.fillStyle = view.accent;
        roundedRect(ctx, circleX, circleY, diameter, diameter, diameter / 2);
        ctx.fill();
        drawIcon(ctx, job, circleX + spec.ring, circleY + spec.ring, spec.icon, view.accent);
        const centerY = y + height / 2;
        const nameX = circleX + diameter + spec.gap;
        drawText(ctx, job.name, nameX, centerY, nameFont, COLORS.value);
        if (hasLevel) drawText(ctx, job.level, nameX + nameWidth + spaceWidth, centerY, levelFont, COLORS.soft);
    }

    // ---------- 資訊欄的區塊：每個是 { height, draw(top) }，沒填的是 null；info.x 是資訊欄的左邊 ----------

    // 抬頭：稱號、名字、伺服器三行，中間不留間距；三個都沒填是 null
    function headBlock(ctx, view, g, info) {
        const rows = [];
        if (view.title !== '') {
            // 稱號：放不下整行縮小（和名字、名片的稱號一樣，最多縮到 FIT_FLOOR）；行高照原本的字級，縮小也不變（下面的名字不動）
            const px = fittedSize(ctx, FONTS.bold, g.title.font, view.title, info.width);
            const height = g.title.font * LINE_NORMAL;
            const font = fontString(FONTS.bold, px);
            const color = titleColorOf(view);
            rows.push({ height, draw: (top) => drawText(ctx, view.title, info.x, top + height / 2, font, color) });
        }
        if (view.name !== '') {
            // 名字：最大的字，放不下整行等比例縮小（行高 1.15，所以高度跟著縮）
            const px = fittedSize(ctx, FONTS.bold, g.name.font, view.name, info.width);
            const height = px * NAME_LINE;
            rows.push({ height, draw: (top) => drawText(ctx, view.name, info.x, top + height / 2, fontString(FONTS.bold, px), COLORS.name) });
        }
        if (view.world !== '') {
            const height = g.world.font * LINE_NORMAL;
            rows.push({ height, draw: (top) => drawText(ctx, view.world, info.x, top + height / 2, fontString(FONTS.text, g.world.font), COLORS.soft) });
        }
        if (rows.length === 0) return null;
        return {
            height: sum(rows.map((row) => row.height)),
            draw(top) {
                let y = top;
                for (const row of rows) {
                    row.draw(y);
                    y += row.height;
                }
            }
        };
    }

    // 三格小卡：每一張是白色的圓角框，裡面是小標與最多 2 行的值，同一列一樣高（排法在 CardPaint.metaCells：欄寬三等分，值折行的寬度扣掉內距，
    // 每一欄的底在字之前畫）
    function factsBlock(ctx, view, g, info) {
        const spec = g.facts;
        return metaCells(ctx, view, {
            x: info.x, width: info.width, gap: spec.gap, label: labelSpecOf(g), kind: FONTS.bold, font: spec.font, color: COLORS.value,
            padX: spec.padX, padY: spec.padY,
            paintBox(x, top, width, height) {
                ctx.fillStyle = COLORS.white;
                roundedRect(ctx, x, top, width, height, spec.radius);
                ctx.fill();
            }
        });
    }

    // 兩欄：左邊喜歡的內容（淡色的底、沒有邊框的膠囊）、右邊遊玩時段（寬度比 1 : 1，只有一邊時的寬度見檔案開頭），兩欄一樣從上面對齊
    // （排法在 CardPaint.likesAndHours）
    function columnsBlock(ctx, view, g, info) {
        const fill = chipFillOf(view);
        return likesAndHours(ctx, view, {
            x: info.x, width: info.width, gap: g.columns.gap, ratio: COLUMN_RATIO, label: labelSpecOf(g),
            chips: { kind: FONTS.bold, ...g.chip, fill, color: chipTextOf(view, fill) },
            hours: { kind: FONTS.text, ...g.hours, labelColor: COLORS.gray, offColor: COLORS.hoursOff, accent: view.accent }
        });
    }

    // 其他職業：小標加一排深色的圓角方塊，圖示在每個方塊的正中。沒有其他職業是 null
    function subsBlock(ctx, view, g, info) {
        if (view.subJobs.length === 0) return null;
        const spec = g.subs;
        const label = labelBlock(ctx, view.labels.subJobs, labelSpecOf(g), info.width);
        const tile = spec.icon + 2 * spec.pad;
        return {
            height: label.height + tile,
            draw(top) {
                label.draw(info.x, top);
                const tilesTop = top + label.height;
                view.subJobs.forEach((sub, i) => {
                    const x = info.x + i * (tile + spec.gap);
                    ctx.fillStyle = COLORS.subTile;
                    roundedRect(ctx, x, tilesTop, tile, tile, spec.radius);
                    ctx.fill();
                    drawIcon(ctx, sub, x + spec.pad, tilesTop + spec.pad, spec.icon, view.accent);
                });
            }
        };
    }

    // 自我介紹：白色的圓角框，字折成最多 2 行
    function quoteBlock(ctx, view, g, info) {
        if (view.intro === '') return null;
        const spec = g.quote;
        const font = fontString(FONTS.text, spec.font);
        const found = wrapText(view.intro, info.width - 2 * spec.padX, measurer(ctx, font), QUOTE_MAX_LINES);
        if (found.length === 0) return null;
        const lineHeight = spec.font * QUOTE_LINE;
        const height = 2 * spec.padY + found.length * lineHeight;
        return {
            height,
            draw(top) {
                ctx.fillStyle = COLORS.white;
                roundedRect(ctx, info.x, top, info.width, height, spec.radius);
                ctx.fill();
                found.forEach((line, i) => drawText(ctx, line, info.x + spec.padX, top + spec.padY + lineHeight * (i + 0.5), font, COLORS.value));
            }
        };
    }

    // ---------- 資訊欄 ----------

    // 由上到下疊起來，底部一列貼著資訊欄的底，沒填的區塊整塊拿掉（CardPaint.drawInfoColumn）
    function drawInfo(ctx, view, g, info) {
        drawInfoColumn(ctx, view, info, {
            blocks: [
                headBlock(ctx, view, g, info),
                factsBlock(ctx, view, g, info),
                columnsBlock(ctx, view, g, info),
                subsBlock(ctx, view, g, info),
                quoteBlock(ctx, view, g, info)
            ],
            foot: { kind: FONTS.text, font: g.foot.font, color: COLORS.gray, gap: g.foot.gap },
            gap: g.rowGap
        });
    }

    // ---------- 畫一張卡片 ----------

    function draw(ctx, view) {
        const g = geometryOf(SPECS, view.format);
        const { photo, info } = photoInfoBoxes(g, PHOTO_SHARE);
        ctx.fillStyle = COLORS.base;
        ctx.fillRect(0, 0, g.width, g.height);
        drawPhotoBox(ctx, view, photo, g.photo.radius, g.width / 100);
        drawBadge(ctx, view, g, photo);
        drawInfo(ctx, view, g, info);
    }

    // ---------- 截圖畫在哪個框 ----------

    // 資訊卡的截圖只畫在照片框裡：橫版在左、直版在上
    function photoBox(format) {
        return photoInfoBoxes(geometryOf(SPECS, format), PHOTO_SHARE).photo;
    }

    return Object.freeze({ draw, texts, photoBox });
})();

// Export for use in other modules
window.CardStyleC = CardStyleC;
