/**
 * 角色卡風格 A「名片」：像遊戲裡的冒險者名片，深色玻璃底，資訊最完整；橫版與直版。
 * 底是壓暗的模糊背景，上面是一個照片框（橫版在左、直版在上）與一個資訊欄（橫版在右、直版在下）。資訊欄由上到下是稱號、名字、伺服器、
 * 一條細線、職業列、三欄資訊（部隊、大國防聯軍、在找什麼）、兩欄（喜歡的內容、遊玩時段）、自我介紹，最下面是一列聯絡方式與
 * 「FF14.tw · FINAL FANTASY XIV © SQUARE ENIX」。海報不畫的部隊名稱、大國防聯軍、在找什麼與聯絡方式，這裡都畫。
 * 版面與顏色照草稿頁的 .card.a（docs/superpowers/specs/2026-11-10-character-card-draft.html）：草稿的數字是 cqw（卡片寬度的 1%），
 * 這裡的版面數字（SPECS）原樣照抄 cqw，畫的時候乘上 寬度 / 100 換成 canvas 的像素（橫版 1200 寬是 12px，直版 1080 寬是 10.8px）。
 * 畫圖的小工具（字、膠囊、圖示、預設背景、照片框、時段格子、由上往下疊、膠囊的縮放排列、底部一列…）是三種風格共用的，在 card-paint.js
 * （CardPaint）；這支只有名片自己的顏色、版面數字與區塊。只畫圖、不碰 DOM，也不自己去拿 canvas。
 *
 * - draw(ctx, view)：畫在 ctx 上。view 是 CardRenderer 整理好的畫面模型（沒填的字串是 ''，沒有的區塊是 null 或 []；稱號原樣，沒有轉大寫）。
 *   ctx 的 globalAlpha、textAlign、textBaseline 由 CardRenderer.draw 先設好，畫完的還原也在那裡；這裡改陰影、clip、globalAlpha、
 *   imageSmoothingQuality 的地方各自包在 save()／restore() 裡，畫完就沒了
 * - texts(view)：這張卡片要載入的字：每一段字與它用的字型 { kind: { weight, family }, text }，沒有畫的字（沒填的欄位）不列；
 *   和 draw() 畫出來的字是同一份 view，CardRenderer.fontsFor 把它照字型分組。名字用 Noto Serif TC 700，其他字是 Noto Sans TC 500、700
 * - photoBox(format)：截圖畫在哪個框 { x, y, width, height }（橫版在左、直版在上），每次回傳新的物件
 *
 * view 用到的欄位：{ format, accent, image: { source, width, height } | null（照片框裡的截圖）, backdrop: { source, width, height } | null
 *   （背景的模糊小圖）, crop（照片框裡截圖的位置）, mark, notice, name, title, world, fcName, tag（部隊簡稱，已經加上 « »）, gc, looking, contact,
 *   labels: { fc, gc, looking, likes, hours, mainJob }（卡片上的小標）, job: { name, icon, level（接好的 'Lv 100'，沒有等級是 ''） } | null,
 *   subJobs: [{ name, icon }], likes: [string], hours: { on: [[bool × 4] × 2], days, slots } | null, intro }，icon 是已載入的圖片或 null
 *
 * - 版面：底（#120f24）→ 模糊背景鋪滿並壓暗 → 照片框（外圈一圈光環加陰影，裡面是截圖或預設背景）→ 資訊欄。資訊欄的區塊由上往下疊
 *   （CardPaint.stackDown），底部一列貼著資訊欄的底；每一塊沒填就整塊拿掉，下面的往上靠，不留空位
 * - 資訊欄的高度：合格的輸入（每個欄位都填到上限）照草稿的數字就放得下，區塊之間的間距照草稿（直版最擠：用測試的假量字量過，最後一個區塊的底
 *   離底部一列的頂約 46px，其中一個間距占 20.5px，多出來的約 26px）。萬一放不下（例如字型比預期寬），CardPaint.stackDown 把區塊之間的間距
 *   一起縮小（最小 0），不超出卡片：這是保險，合格的輸入用不到。文字一律靠左、垂直置中，座標是字的左邊與這一行的中線；
 *   名字、稱號、小標、聯絡方式放不下整行縮小（最多縮到 CardPaint.FIT_FLOOR），職業列放不下時職業那兩行字一起縮小，
 *   三欄資訊的值與自我介紹用 CardLayout.wrapText 折成最多 2 行，喜歡的內容的膠囊排成最多 2 列、排不下時整組縮小到最多 60%
 * - 兩欄（喜歡的內容 : 遊玩時段 = 1.3 : 1）只有一邊時：只有喜歡的內容用整列的寬，只有時段照右欄原本的寬、靠左（CardPaint.twoColumns）；
 *   三欄資訊沒填的那一欄拿掉，剩下的從左邊排（欄寬照舊是三等分）；三個都沒填整列拿掉
 *
 * 和草稿不一樣的地方（canvas 做不到或另外決定的）：
 * - 草稿的卡片有圓角，這裡四個角不裁：下載的 PNG 是整張矩形，預覽的圓角由頁面用 CSS 加
 * - 草稿的背景是截圖加 CSS 的 blur(2.6cqw) brightness(0.42) saturate(1.25)。這裡不用 ctx.filter（舊的 Safari 沒有）：模糊由頁面做成一張縮小的圖
 *   （view.backdrop），置中填滿整張卡片（不跟著照片框的位置），再鋪一層 rgba(0,0,0,0.58) 壓暗（brightness 0.42）；飽和度的 1.25 不做；
 *   沒有截圖時畫預設背景（CardPaint.drawBackdrop）再壓暗到同樣的亮度
 * - 草稿的光環與陰影是兩層 box-shadow（上面是 0.25cqw 的半透明光環，下面是往下 1.5cqw 模糊 4cqw 的陰影，陰影的形狀就是照片框）。
 *   canvas 的陰影強度跟著被畫的形狀的透明度，半透明的光環自己投陰影只有草稿的約 0.55 倍深，所以陰影由一個不透明的照片框形狀投
 *   （之後畫的照片會把它整個蓋住）；光環是照片框往外 0.25cqw 的半透明圓角框，畫在陰影上面（草稿也是光環疊在陰影上），不帶陰影；
 *   照片最後畫在上面蓋住中間，只剩外圈
 * - 草稿的照片預設 background-position: 40% center；這裡照玩家調整的位置（沒調整過是置中），和海報一樣
 * - 沒指定字重的字（小標、值、膠囊、時段、自我介紹、底部一列）草稿是 400，這裡用 500；沒寫 line-height 的一行字，行高是字級的
 *   CardPaint.LINE_NORMAL 倍（草稿的 normal）；字重只用 Noto Sans TC 的 500、700 與 Noto Serif TC 的 700，頁面標準的 Google Fonts 連結都載得到
 * - 稱號（0.22em）與小標（0.14em）的字距一個字一個字畫（不用 ctx.letterSpacing，舊的 Safari 沒有）；底部一列 SE 版權字的字距 0.04em 太小，不畫
 * - 稱號、光環、細線與膠囊的邊用「淡色」：草稿每個職能各寫一個淺色，這裡從重點色往白色混 55%（所有重點色都適用，包括自己選的）
 * - 細線在名字、伺服器與稱號都沒填時不畫（草稿沒有「什麼都沒填」的畫面，細線孤零零地浮在最上面）
 * - 草稿的 .jobs 在放不下時會溢出；這裡職業那兩行字一起縮小，和其他職業的圖示至少隔 1.4cqw。其他職業沒有圖示時畫重點色的圓角方塊與第一個字
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到；
 * 需要 card-layout.js（CardLayout）與 card-paint.js（CardPaint）先載入。
 */
const CardStyleA = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const { fitScale, wrapText, coverRect } = window.CardLayout;
    const {
        LINE_NORMAL, FIT_FLOOR, ELLIPSIS, FAMILIES, ICON_LETTER,
        deepFreeze, geometryOf, fontString, tintOf, rgbaOf,
        roundedRect, drawText, measurer, fittedSize, fittedSpacedSize, drawIcon, iconLetters, drawCapsule, drawSpaced, drawBackdrop, drawPhotoBox,
        hoursBlock, fitChips, labelBlock, stackDown, twoColumns, listTexts, metaItems, footText, footBlock
    } = window.CardPaint;

    // ---------- 顏色（畫在圖上的成品，不跟著網站的深淺色）----------

    const COLORS = Object.freeze({
        base: '#120f24', // 整張卡片的底
        dim: 'rgba(0,0,0,0.58)', // 壓在背景上的暗色（草稿的 brightness(0.42)）
        shadow: 'rgba(0,0,0,0.45)', // 照片框的陰影
        text: '#f3f1fa',
        world: 'rgba(243,241,250,0.78)',
        level: 'rgba(243,241,250,0.7)', // 「Lv 100 · 主職」
        label: 'rgba(243,241,250,0.55)', // 小標
        hoursLabel: 'rgba(243,241,250,0.6)',
        hoursOff: 'rgba(255,255,255,0.12)', // 沒選的時段格子（有選的是重點色）
        foot: 'rgba(243,241,250,0.58)'
    });
    // 淡色（稱號、光環、細線、膠囊的邊）= 重點色混入這麼多比例的白色
    const TINT = 0.55;
    // 淡色或重點色加上的透明度
    const ALPHAS = Object.freeze({ halo: 0.55, rule: 0.7, chipFill: 0.34, chipStroke: 0.45 });
    const SUB_ALPHA = 0.88; // 其他職業的圖示

    // ---------- 字型 ----------

    const FONTS = Object.freeze({
        name: Object.freeze({ weight: 700, family: FAMILIES.serif }),
        bold: Object.freeze({ weight: 700, family: FAMILIES.sans }),
        text: Object.freeze({ weight: 500, family: FAMILIES.sans })
    });

    // ---------- 版面數字（草稿的 cqw：卡片寬度的 1%）----------

    // 每一個數字都是 cqw，畫的時候換成像素（CardPaint.geometryOf）；字串（photoAt）照舊。名稱照草稿的 CSS：
    // pad、gap 是 .inner 的內距與照片框和資訊欄的間隔（photoAt 是照片框在左邊或上面），rowGap 是資訊欄區塊之間的間距，
    // photo 是 .photo（radius 圓角，ring 光環的寬，shadowY、shadowBlur 陰影），jobs 是職業列（icon 主職圖示、gap 圖示到字、font 與 levelFont 兩行字、
    // subIcon 與 subGap 其他職業的圖示與間隔、sideGap 兩邊至少隔多少），meta 是三欄資訊（gap 欄距），label 是小標，columns 是兩欄，
    // chip 是 .chip，hours 是時段格子，quote 是自我介紹（bar 左邊那條線的寬，pad 線到字），foot 是底部一列；hairline 是膠囊的邊框與細線的線寬
    const SPECS = deepFreeze({
        landscape: {
            photoAt: 'left',
            pad: 3,
            gap: 3,
            rowGap: 1.25,
            photo: { radius: 1.3, ring: 0.25, shadowY: 1.5, shadowBlur: 4 },
            title: { font: 1.35 },
            name: { font: 4.6 },
            world: { font: 1.45 },
            jobs: { icon: 5, gap: 1, font: 2, levelFont: 1.3, subIcon: 2.9, subGap: 0.8, sideGap: 1.4 },
            meta: { font: 1.4, gap: 1.2 },
            label: { font: 1.02 },
            columns: { gap: 2 },
            chip: { font: 1.22, padX: 1, padY: 0.3, gap: 0.7 },
            hours: { font: 1.02, cell: 1.15, gapX: 0.5, gapY: 0.45, radius: 0.35 },
            quote: { font: 1.45, bar: 0.3, pad: 1.2 },
            foot: { font: 1.05, gap: 2 },
            hairline: 0.125
        },
        portrait: {
            photoAt: 'top',
            pad: 4,
            gap: 3.6,
            rowGap: 1.9,
            photo: { radius: 1.3, ring: 0.25, shadowY: 1.5, shadowBlur: 4 },
            title: { font: 1.9 },
            name: { font: 6.6 },
            world: { font: 2.1 },
            jobs: { icon: 7.4, gap: 1, font: 2.9, levelFont: 1.9, subIcon: 4.2, subGap: 0.8, sideGap: 1.4 },
            meta: { font: 2.05, gap: 1.2 },
            label: { font: 1.5 },
            columns: { gap: 2 },
            chip: { font: 1.8, padX: 1.4, padY: 0.45, gap: 0.7 },
            hours: { font: 1.5, cell: 1.7, gapX: 0.7, gapY: 0.6, radius: 0.35 },
            quote: { font: 2.15, bar: 0.3, pad: 1.2 },
            foot: { font: 1.5, gap: 2 },
            hairline: 0.185
        }
    });

    // 不跟著版面變的數字
    const PHOTO_SHARE = Object.freeze({ left: 0.37, top: 0.43 }); // 照片框占內容寬（橫版）或內容高（直版）的幾成
    const COLUMN_RATIO = Object.freeze([1.3, 1]); // 兩欄：喜歡的內容 : 遊玩時段
    const CENTERED = Object.freeze({ x: 0, y: 0, zoom: 1 }); // 模糊背景置中填滿
    const TITLE_SPACING = 0.22; // 稱號的字距，單位是 em（草稿的 letter-spacing: 0.22em）
    const LABEL_SPACING = 0.14; // 小標的字距
    const NAME_LINE = 1.12; // 名字的行高（草稿的 line-height）
    const JOB_LINE = 1.2; // 職業名稱的行高
    const QUOTE_LINE = 1.55; // 自我介紹的行高
    const QUOTE_MAX_LINES = 2;
    const META_COLUMNS = 3;
    const META_MAX_LINES = 2;
    const CHIP_MAX_ROWS = 2;
    const CHIP_FLOOR = 0.6; // 膠囊放不下時整組最多縮到原本的 60%

    // 淡色
    const softOf = (view) => tintOf(view.accent, TINT);
    // 主職旁邊第二行：「Lv 100 · 主職」（沒有等級就只有「主職」）
    const levelLine = (view) => [view.job.level, view.labels.mainJob].filter((part) => part !== '').join(' · ');

    // ---------- 載入字型 ----------

    // 這張卡片要載入的字：每一段字與它用的字型 { kind, text }，沒填的欄位不列。要和 draw() 畫出來的字一致（用同一份 view），
    // 所以 draw() 多畫了什麼字，這裡也要跟著加
    function texts(view) {
        const meta = metaItems(view);
        return listTexts([
            [FONTS.name, view.name],
            [FONTS.bold, view.job?.name],
            [ICON_LETTER, ...iconLetters(view)],
            [
                FONTS.text, view.title, view.world, view.job === null ? '' : levelLine(view),
                ...meta.flatMap(({ label, value }) => [label, value]), meta.length > 0 ? ELLIPSIS : '',
                view.likes.length > 0 ? view.labels.likes : '', ...view.likes,
                view.hours === null ? '' : view.labels.hours, ...(view.hours ? [...view.hours.days, ...view.hours.slots] : []),
                view.intro === '' ? '' : view.intro + ELLIPSIS, view.contact, footText(view)
            ]
        ]);
    }

    // ---------- 照片框與資訊欄的範圍 ----------

    // 兩個範圍都是 { x, y, width, height }（canvas 的像素）：橫版照片框在左、資訊欄在右，直版照片框在上、資訊欄在下，中間隔 gap
    function layoutOf(g) {
        const contentWidth = g.width - 2 * g.pad;
        const contentHeight = g.height - 2 * g.pad;
        if (g.photoAt === 'left') {
            const photoWidth = contentWidth * PHOTO_SHARE.left;
            return {
                photo: { x: g.pad, y: g.pad, width: photoWidth, height: contentHeight },
                info: { x: g.pad + photoWidth + g.gap, y: g.pad, width: contentWidth - photoWidth - g.gap, height: contentHeight }
            };
        }
        const photoHeight = contentHeight * PHOTO_SHARE.top;
        return {
            photo: { x: g.pad, y: g.pad, width: contentWidth, height: photoHeight },
            info: { x: g.pad, y: g.pad + photoHeight + g.gap, width: contentWidth, height: contentHeight - photoHeight - g.gap }
        };
    }

    // ---------- 背景 ----------

    // 先鋪底色；有模糊小圖（backdrop）就置中填滿整張卡片（imageSmoothingQuality 設成 high，縮小的圖放大才不會有格子），沒有或圖的大小不對就畫預設背景；
    // 最後鋪一層暗色，字才看得清楚
    function drawBackground(ctx, view, g) {
        ctx.fillStyle = COLORS.base;
        ctx.fillRect(0, 0, g.width, g.height);
        const rect = view.backdrop === null ? null : coverRect(view.backdrop.width, view.backdrop.height, g.width, g.height, CENTERED);
        if (rect !== null && rect.dw > 0 && rect.dh > 0) {
            ctx.save();
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(view.backdrop.source, rect.dx, rect.dy, rect.dw, rect.dh);
            ctx.restore();
        } else {
            drawBackdrop(ctx, view.accent, { x: 0, y: 0, width: g.width, height: g.height }, g.width / 100);
        }
        ctx.fillStyle = COLORS.dim;
        ctx.fillRect(0, 0, g.width, g.height);
    }

    // ---------- 照片框 ----------

    // 陰影加光環：先用不透明的照片框形狀投陰影（包在 save／restore 裡，畫完陰影就沒了）：陰影的深度跟著被畫的形狀的透明度，所以由不透明的形狀投，
    // 才有草稿的深度（顏色用卡片的底色；照片之後會把這個形狀整個蓋住，所以看不到它）；接著把半透明的光環（照片框往外 ring 的圓角框）填在陰影上面，
    // 不帶陰影；照片最後畫，蓋住中間，只剩外圈
    function drawHalo(ctx, view, g, box) {
        const spec = g.photo;
        ctx.save();
        ctx.shadowColor = COLORS.shadow;
        ctx.shadowBlur = spec.shadowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = spec.shadowY;
        ctx.fillStyle = COLORS.base;
        roundedRect(ctx, box.x, box.y, box.width, box.height, spec.radius);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = rgbaOf(softOf(view), ALPHAS.halo);
        roundedRect(ctx, box.x - spec.ring, box.y - spec.ring, box.width + 2 * spec.ring, box.height + 2 * spec.ring, spec.radius + spec.ring);
        ctx.fill();
    }

    // ---------- 資訊欄的區塊：每個是 { height, draw(top) }，沒填的是 null；x 是資訊欄的左邊（info.x）----------

    // 稱號：淡色，字距 0.22em 一個字一個字畫，原樣不轉大寫，放不下整行縮小
    function titleBlock(ctx, view, g, info) {
        if (view.title === '') return null;
        const px = fittedSpacedSize(ctx, FONTS.text, g.title.font, view.title, TITLE_SPACING, info.width);
        const height = g.title.font * LINE_NORMAL;
        const color = softOf(view);
        return { height, draw: (top) => drawSpaced(ctx, view.title, info.x, top + height / 2, FONTS.text, px, TITLE_SPACING, color) };
    }

    // 名字：襯線字，最大的字，放不下整行等比例縮小（行高 1.12，所以高度跟著縮）
    function nameBlock(ctx, view, g, info) {
        if (view.name === '') return null;
        const px = fittedSize(ctx, FONTS.name, g.name.font, view.name, info.width);
        const height = px * NAME_LINE;
        return { height, draw: (top) => drawText(ctx, view.name, info.x, top + height / 2, fontString(FONTS.name, px), COLORS.text) };
    }

    // 伺服器
    function worldBlock(ctx, view, g, info) {
        if (view.world === '') return null;
        const height = g.world.font * LINE_NORMAL;
        return { height, draw: (top) => drawText(ctx, view.world, info.x, top + height / 2, fontString(FONTS.text, g.world.font), COLORS.world) };
    }

    // 細線：淡色，往右漸漸透明。上面的稱號、名字、伺服器都沒填時不畫
    function ruleBlock(ctx, view, g, info) {
        if (view.title === '' && view.name === '' && view.world === '') return null;
        const soft = softOf(view);
        return {
            height: g.hairline,
            draw(top) {
                const fade = ctx.createLinearGradient(info.x, top, info.x + info.width, top);
                fade.addColorStop(0, rgbaOf(soft, ALPHAS.rule));
                fade.addColorStop(1, rgbaOf(soft, 0));
                ctx.fillStyle = fade;
                ctx.fillRect(info.x, top, info.width, g.hairline);
            }
        };
    }

    // 職業列：左邊是主職圖示與兩行字（職業名稱、「Lv 100 · 主職」），兩行字和圖示垂直置中；右邊靠右是其他職業的圖示。
    // 兩邊放不下（至少隔 sideGap）時，職業那兩行字一起縮小
    function jobsBlock(ctx, view, g, info) {
        const { job, subJobs } = view;
        if (job === null && subJobs.length === 0) return null;
        const spec = g.jobs;
        const subsWidth = subJobs.length === 0 ? 0 : subJobs.length * spec.subIcon + (subJobs.length - 1) * spec.subGap;
        const levelText = job === null ? '' : levelLine(view);
        let scale = 1;
        if (job !== null) {
            const nameWidth = measurer(ctx, fontString(FONTS.bold, spec.font))(job.name);
            const levelWidth = levelText === '' ? 0 : measurer(ctx, fontString(FONTS.text, spec.levelFont))(levelText);
            const room = info.width - spec.icon - spec.gap - (subJobs.length === 0 ? 0 : spec.sideGap + subsWidth);
            scale = fitScale(Math.max(nameWidth, levelWidth), room, FIT_FLOOR);
        }
        const nameFont = fontString(FONTS.bold, spec.font * scale);
        const levelFont = fontString(FONTS.text, spec.levelFont * scale);
        const nameHeight = job === null ? 0 : spec.font * scale * JOB_LINE;
        const levelHeight = levelText === '' ? 0 : spec.levelFont * scale * LINE_NORMAL;
        const height = Math.max(job === null ? 0 : Math.max(spec.icon, nameHeight + levelHeight), subJobs.length === 0 ? 0 : spec.subIcon);
        return {
            height,
            draw(top) {
                if (job !== null) {
                    drawIcon(ctx, job, info.x, top + (height - spec.icon) / 2, spec.icon, view.accent);
                    const textX = info.x + spec.icon + spec.gap;
                    const textTop = top + (height - nameHeight - levelHeight) / 2;
                    drawText(ctx, job.name, textX, textTop + nameHeight / 2, nameFont, COLORS.text);
                    if (levelText !== '') drawText(ctx, levelText, textX, textTop + nameHeight + levelHeight / 2, levelFont, COLORS.level);
                }
                if (subJobs.length > 0) {
                    ctx.save();
                    ctx.globalAlpha = SUB_ALPHA;
                    subJobs.forEach((sub, i) => {
                        drawIcon(ctx, sub, info.x + info.width - subsWidth + i * (spec.subIcon + spec.subGap), top + (height - spec.subIcon) / 2, spec.subIcon, view.accent);
                    });
                    ctx.restore();
                }
            }
        };
    }

    // 小標（部隊、喜歡的內容…）：字距 0.14em、淡白，畫法在 CardPaint.labelBlock。回傳 { height, draw(x, top) }
    const labelOf = (ctx, text, g, maxWidth) => labelBlock(ctx, text, { kind: FONTS.text, font: g.label.font, spacing: LABEL_SPACING, color: COLORS.label }, maxWidth);

    // 三欄資訊：有值的照部隊、大國防聯軍、在找什麼的順序從左邊那欄排（欄寬照舊是三等分），每一欄是小標加最多 2 行的值
    function metaBlock(ctx, view, g, info) {
        const items = metaItems(view);
        if (items.length === 0) return null;
        const columnWidth = (info.width - (META_COLUMNS - 1) * g.meta.gap) / META_COLUMNS;
        const valueFont = fontString(FONTS.text, g.meta.font);
        const measure = measurer(ctx, valueFont);
        const cells = items.map(({ label, value }) => ({ label: labelOf(ctx, label, g, columnWidth), values: wrapText(value, columnWidth, measure, META_MAX_LINES) }));
        const labelHeight = Math.max(...cells.map((cell) => cell.label.height));
        const lineHeight = g.meta.font * LINE_NORMAL;
        return {
            height: labelHeight + Math.max(...cells.map((cell) => cell.values.length)) * lineHeight,
            draw(top) {
                cells.forEach((cell, i) => {
                    const x = info.x + i * (columnWidth + g.meta.gap);
                    cell.label.draw(x, top);
                    cell.values.forEach((value, row) => drawText(ctx, value, x, top + labelHeight + lineHeight * (row + 0.5), valueFont, COLORS.text));
                });
            }
        };
    }

    // 喜歡的內容：小標加膠囊，排成最多 2 列，排不下時整組縮小（最多縮到 60%）。一顆都排不進去是 null。回傳 { height, draw(x, top) }
    function likesColumn(ctx, view, g, width) {
        const spec = g.chip;
        const fit = fitChips(ctx, view.likes, {
            kind: FONTS.text, font: spec.font, padX: spec.padX, padY: spec.padY, gap: spec.gap, border: g.hairline,
            maxWidth: width, maxRows: CHIP_MAX_ROWS, floor: CHIP_FLOOR
        });
        if (fit.chips.length === 0) return null;
        const label = labelOf(ctx, view.labels.likes, g, width);
        const font = fontString(FONTS.text, fit.px);
        const pad = spec.padX * fit.scale + g.hairline;
        const fill = rgbaOf(view.accent, ALPHAS.chipFill);
        const stroke = rgbaOf(softOf(view), ALPHAS.chipStroke);
        return {
            height: label.height + fit.height,
            draw(x, top) {
                label.draw(x, top);
                const chipsTop = top + label.height;
                for (const chip of fit.chips) {
                    drawCapsule(ctx, x + chip.x, chipsTop + chip.y, chip.w, chip.h, fill, stroke, g.hairline);
                    drawText(ctx, chip.label, x + chip.x + pad, chipsTop + chip.y + chip.h / 2, font, COLORS.text);
                }
            }
        };
    }

    // 遊玩時段：小標加格子（view.hours 不是 null 才會呼叫）。回傳 { height, draw(x, top) }
    function hoursColumn(ctx, view, g, width) {
        const label = labelOf(ctx, view.labels.hours, g, width);
        const grid = hoursBlock(ctx, view.hours, { kind: FONTS.text, width, ...g.hours, labelColor: COLORS.hoursLabel, offColor: COLORS.hoursOff, accent: view.accent });
        return {
            height: label.height + grid.height,
            draw(x, top) {
                label.draw(x, top);
                grid.draw(x, top + label.height);
            }
        };
    }

    // 兩欄：左邊喜歡的內容、右邊遊玩時段（寬度比 1.3 : 1，只有一邊時的寬度見檔案開頭），兩欄一樣從上面對齊
    function columnsBlock(ctx, view, g, info) {
        return twoColumns(info.x, info.width, g.columns.gap, COLUMN_RATIO, {
            left: view.likes.length > 0 ? (width) => likesColumn(ctx, view, g, width) : null,
            right: view.hours !== null ? (width) => hoursColumn(ctx, view, g, width) : null
        });
    }

    // 自我介紹：左邊一條重點色的線（和字一樣高），字從線右邊再隔一小段開始，折成最多 2 行
    function quoteBlock(ctx, view, g, info) {
        if (view.intro === '') return null;
        const spec = g.quote;
        const font = fontString(FONTS.text, spec.font);
        const found = wrapText(view.intro, info.width - spec.bar - spec.pad, measurer(ctx, font), QUOTE_MAX_LINES);
        if (found.length === 0) return null;
        const lineHeight = spec.font * QUOTE_LINE;
        const height = found.length * lineHeight;
        return {
            height,
            draw(top) {
                ctx.fillStyle = view.accent;
                ctx.fillRect(info.x, top, spec.bar, height);
                found.forEach((line, i) => drawText(ctx, line, info.x + spec.bar + spec.pad, top + lineHeight * (i + 0.5), font, COLORS.text));
            }
        };
    }

    // ---------- 資訊欄 ----------

    // 由上到下疊起來，底部一列貼著資訊欄的底，沒填的區塊整塊拿掉
    function drawInfo(ctx, view, g, info) {
        const blocks = [
            titleBlock(ctx, view, g, info),
            nameBlock(ctx, view, g, info),
            worldBlock(ctx, view, g, info),
            ruleBlock(ctx, view, g, info),
            jobsBlock(ctx, view, g, info),
            metaBlock(ctx, view, g, info),
            columnsBlock(ctx, view, g, info),
            quoteBlock(ctx, view, g, info)
        ].filter((block) => block !== null);
        const foot = footBlock(ctx, view, { kind: FONTS.text, font: g.foot.font, color: COLORS.foot, gap: g.foot.gap, x: info.x, width: info.width });
        stackDown(blocks, foot, { top: info.y, bottom: info.y + info.height, gap: g.rowGap });
    }

    // ---------- 畫一張卡片 ----------

    function draw(ctx, view) {
        const g = geometryOf(SPECS, view.format);
        const { photo, info } = layoutOf(g);
        drawBackground(ctx, view, g);
        drawHalo(ctx, view, g, photo);
        drawPhotoBox(ctx, view, photo, g.photo.radius, g.width / 100);
        drawInfo(ctx, view, g, info);
    }

    // ---------- 截圖畫在哪個框 ----------

    // 名片的截圖只畫在照片框裡：橫版在左、直版在上
    function photoBox(format) {
        return layoutOf(geometryOf(SPECS, format)).photo;
    }

    return Object.freeze({ draw, texts, photoBox });
})();

// Export for use in other modules
window.CardStyleA = CardStyleA;
