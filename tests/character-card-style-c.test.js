const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createRecordingContext, fakeMeasure } = require('./helpers/canvas-recorder.js');
const {
    card, SIZE, cq, ACCENT, NOTICE, INTRO, DAYS, SLOTS, SUB_ICONS, picture, requiredModel, emptyModel, fullModel, maxedModel, tallestModel, longestLikes,
    render, drawn, lines, textBoxes, fills, imageCalls, backgroundOf, plain, near, inside, overlaps
} = require('./helpers/card-drawing.js');

// 風格 C「資訊卡」（card-style-c.js）：淺色底、像 App 的個人頁，字最好讀。版面數字照草稿的 .card.c（cqw：卡片寬度的 1%），
// 這裡的每個數字都是從計畫的表直接抄來、自己算一遍，不去讀 card-style-c.js 的常數
const { CardRenderer, CardPaint, CardLayout, CardStyleC } = card;
const FORMATS = ['landscape', 'portrait'];
const pick = (format, landscape, portrait) => (format === 'landscape' ? landscape : portrait);
// 草稿的數字（橫版、直版各一個，單位是 cqw）換成這個版型的像素
const cp = (format, landscape, portrait) => cq(format, pick(format, landscape, portrait));

const FOOT = `FF14.tw · ${NOTICE}`;
const SANS = '"Noto Sans TC", sans-serif';
const fontOf = (weight, size) => CardPaint.fontString({ weight, family: SANS }, size);
const LINE_NORMAL = CardPaint.LINE_NORMAL;
const mixOf = (hex, other, amount) => CardPaint.mixOf(hex, other, amount);

// 顏色（全部是不透明的 #rrggbb）：灰字照計畫換成 #697084（草稿的 #7a8195、#8a90a2 在 #f4f5fa 上不到 4.5:1）
const BASE = '#f4f5fa';
const WHITE = '#ffffff';
const COLORS = {
    name: '#141826',
    value: '#1d2233', // 三格小卡的值、自我介紹、徽章的職業名稱
    world: '#5b6275', // 伺服器與 Lv
    gray: '#697084', // 小標、時段的字、底部一列
    hoursOff: '#e3e5ee',
    subTile: '#2a2f45'
};
const chipFillOf = (accent = ACCENT) => mixOf(accent, '#ffffff', 0.87);
const chipTextOf = (accent = ACCENT) => CardPaint.readableOn(mixOf(accent, '#1d2233', 0.2), chipFillOf(accent));
const titleColorOf = (accent = ACCENT) => CardPaint.readableOn(accent, BASE);

// 照片框與資訊欄的範圍（canvas 像素）：內距 3.2／4cqw。橫版照片在左：寬是內容寬的 36%、高是內容高，和資訊欄隔 3.2cqw；
// 直版照片在上：寬是內容寬、高是內容高的 40% 減 1.6cqw（下面留給徽章），資訊欄從 內距 + 內容高 × 40% + 4.4cqw 開始
function boxes(format) {
    const { width, height } = SIZE[format];
    const pad = cp(format, 3.2, 4);
    const contentWidth = width - 2 * pad;
    const contentHeight = height - 2 * pad;
    if (format === 'landscape') {
        const photoWidth = contentWidth * 0.36;
        return {
            photo: { x: pad, y: pad, width: photoWidth, height: contentHeight },
            info: { x: pad + photoWidth + cq(format, 3.2), y: pad, width: contentWidth - photoWidth - cq(format, 3.2), height: contentHeight }
        };
    }
    const photoHeight = contentHeight * 0.4 - cq(format, 1.6);
    const infoTop = pad + contentHeight * 0.4 + cq(format, 4.4);
    return {
        photo: { x: pad, y: pad, width: contentWidth, height: photoHeight },
        info: { x: pad, y: infoTop, width: contentWidth, height: height - pad - infoTop }
    };
}

function lineOf(ctx, text) {
    const found = lines(ctx).filter((line) => line.text === text);
    assert.equal(found.length, 1, `畫出來的字裡剛好有一段「${text}」（有 ${found.length} 段）`);
    return found[0];
}
const hasLine = (ctx, text) => lines(ctx).some((line) => line.text === text);
const texts = (ctx) => lines(ctx).map((line) => line.text);
const sorted = (list) => [...list].sort();
const distinct = (numbers) => [...new Set(numbers.map((n) => Math.round(n * 100) / 100))].sort((a, b) => a - b);

// 形狀：圓角框的 fill 對到前面最近的 roundRect（card-drawing.js 的 fills）
const isRound = (shape) => shape.kind === 'roundRect';
const close = (a, b) => Math.abs(a - b) < 1e-6;
const isCircle = (shape) => isRound(shape) && close(shape.w, shape.h) && close(shape.r, shape.w / 2);
const whiteBoxes = (ctx) => fills(ctx).filter((shape) => isRound(shape) && shape.fillStyle === WHITE);
// 徽章的膠囊：白色、帶陰影（整張卡片只有這一個形狀帶陰影）
function badgeOf(ctx) {
    const found = whiteBoxes(ctx).filter((shape) => shape.call.shadowBlur > 0);
    assert.equal(found.length, 1, `帶陰影的白色形狀剛好一個（有 ${found.length} 個）`);
    return found[0];
}
// 三格小卡與自我介紹的框：白色、圓角 1cqw；小卡比資訊欄窄，自我介紹的框和資訊欄一樣寬
const framesOf = (ctx, format) => whiteBoxes(ctx).filter((shape) => close(shape.r, cq(format, 1)) && shape.call.shadowBlur === 0);
const factTiles = (ctx, format, info) => framesOf(ctx, format).filter((shape) => shape.w < info.width - 1);
const quoteBoxOf = (ctx, format, info) => framesOf(ctx, format).find((shape) => close(shape.w, info.width));
const hourCells = (ctx) => fills(ctx).filter((shape) => isRound(shape) && !isCircle(shape) && (shape.fillStyle === ACCENT || shape.fillStyle === COLORS.hoursOff));
const chipShapes = (ctx, accent = ACCENT) => fills(ctx).filter((shape) => isRound(shape) && shape.fillStyle === chipFillOf(accent));
const subTiles = (ctx) => fills(ctx).filter((shape) => isRound(shape) && shape.fillStyle === COLORS.subTile);
const accentCircles = (ctx) => fills(ctx).filter((shape) => isCircle(shape) && shape.fillStyle === ACCENT);
// 帶著陰影畫出來的東西（填色、描邊、字、圖、clip）：save／restore 與路徑指令記下來的狀態也帶著陰影，不算
const shadowedDraws = (ctx) => ctx.calls.filter((call) => ['fill', 'fillRect', 'fillText', 'stroke', 'drawImage', 'clip'].includes(call.op) && call.shadowBlur > 0);

// ---------- 模組與照片框 ----------

test('CardStyleC：凍結，只有 draw、texts、photoBox；載入時只多掛一個全域；renderer 認得 style: c，不認得的還是海報', () => {
    assert.equal(Object.isFrozen(CardStyleC), true);
    assert.deepEqual(Object.keys(CardStyleC).sort(), ['draw', 'photoBox', 'texts']);

    // card-style-c.js 要先載入 card-layout.js、card-state.js 與 card-paint.js；載入它只多掛一個全域，和頁面其他腳本的名稱不會撞到
    const context = vm.createContext({});
    context.window = context;
    const run = (file) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'tools/character-card', file), 'utf8'), context, { filename: file });
    for (const file of ['card-layout.js', 'card-state.js', 'card-paint.js']) run(file);
    const before = new Set(Object.keys(context));
    run('card-style-c.js');
    assert.deepEqual(Object.keys(context).filter((name) => !before.has(name)), ['CardStyleC']);

    const poster = plain(render(fullModel('b')).calls);
    const nameCard = plain(render(fullModel('a')).calls);
    const infoCard = plain(render(fullModel('c')).calls);
    assert.notDeepEqual(infoCard, poster, 'style: c 畫的是資訊卡，不是海報');
    assert.notDeepEqual(infoCard, nameCard, 'style: c 畫的是資訊卡，不是名片');
    // 第一次填色就是整張卡片的淺色底
    const first = fills(render(fullModel('c')))[0];
    assert.deepEqual([first.kind, first.x, first.y, first.w, first.h, first.fillStyle], ['fillRect', 0, 0, 1200, 675, BASE]);
    for (const style of [undefined, 'zzz', 'constructor', '__proto__']) {
        assert.deepEqual(plain(render(fullModel(style)).calls), poster, `style 是 ${String(style)} 時畫海報`);
    }
});

test('photoBox：C 橫版在左、直版在上', () => {
    const expected = {
        landscape: { x: 38.4, y: 38.4, width: 404.352, height: 598.2 },
        portrait: { x: 43.2, y: 43.2, width: 993.6, height: 488.16 }
    };
    for (const format of FORMATS) {
        const box = plain(CardRenderer.photoBox('c', format));
        assert.deepEqual(Object.keys(box).sort(), ['height', 'width', 'x', 'y']);
        for (const key of Object.keys(expected[format])) near(box[key], expected[format][key], `${format} 的 ${key}`, 0.01);
        // 這支測試自己算的範圍（其他測試用它）和任務書的數字一樣
        for (const key of Object.keys(expected[format])) near(boxes(format).photo[key], expected[format][key], `boxes(${format}).photo.${key}`, 0.01);
        assert.deepEqual(plain(CardStyleC.photoBox(format)), box);
        assert.notEqual(CardStyleC.photoBox(format), CardStyleC.photoBox(format), '每次回傳新的物件');
        assert.notEqual(CardRenderer.photoBox('c', format), CardRenderer.photoBox('c', format));
    }
    assert.deepEqual(plain(CardRenderer.photoBox('c', 'zzz')), plain(CardRenderer.photoBox('c', 'landscape')), '不認得的版型當成橫版');
    // 橫版的照片框是直的、直版的是橫的；橫版右邊與資訊欄隔 3.2cqw，直版下面（含給徽章的 1.6cqw）與資訊欄隔 4.4cqw
    assert.ok(boxes('landscape').photo.height > boxes('landscape').photo.width);
    assert.ok(boxes('portrait').photo.width > boxes('portrait').photo.height);
    near(boxes('landscape').info.x - (boxes('landscape').photo.x + boxes('landscape').photo.width), cq('landscape', 3.2));
    near(boxes('portrait').info.y - (boxes('portrait').photo.y + boxes('portrait').photo.height), cq('portrait', 1.6 + 4.4));
});

// ---------- 只有必填三項、什麼都沒填 ----------

test('只有必填三項：照片框、徽章（職業名稱與「Lv 100」）、名字、伺服器、底部一列；職業名稱只畫一次', () => {
    for (const format of FORMATS) {
        const { photo, info } = boxes(format);
        const ctx = render(requiredModel('c', { format }));
        assert.deepEqual(sorted(texts(ctx)), sorted(['Luna Starweaver', 'Tiamat', 'Paladin', 'Lv 100', FOOT]));
        assert.equal(texts(ctx).filter((text) => text === 'Paladin').length, 1, '職業名稱只畫一次（主職只畫在徽章裡）');

        // 名字是 Noto Sans TC 700（4.2／6.2cqw）、#141826，伺服器 500（1.4／2cqw）、#5b6275，都靠資訊欄的左邊
        const name = lineOf(ctx, 'Luna Starweaver');
        assert.equal(name.font, fontOf(700, cp(format, 4.2, 6.2)));
        assert.equal(name.fillStyle, COLORS.name);
        near(name.x, info.x);
        const world = lineOf(ctx, 'Tiamat');
        assert.equal(world.font, fontOf(500, cp(format, 1.4, 2)));
        assert.equal(world.fillStyle, COLORS.world);
        near(world.x, info.x);

        // 徽章：職業名稱 700（1.6／2.3cqw）、#1d2233，「Lv 100」500（1.25／1.8cqw）、#5b6275；字在照片框裡
        const job = lineOf(ctx, 'Paladin');
        assert.equal(job.font, fontOf(700, cp(format, 1.6, 2.3)));
        assert.equal(job.fillStyle, COLORS.value);
        const level = lineOf(ctx, 'Lv 100');
        assert.equal(level.font, fontOf(500, cp(format, 1.25, 1.8)));
        assert.equal(level.fillStyle, COLORS.world);
        for (const text of ['Paladin', 'Lv 100']) {
            const box = textBoxes(ctx).find((candidate) => candidate.text === text);
            assert.ok(inside(box, photo), `「${text}」在照片框裡`);
        }

        // 圖：只有主職的圖示一張（在徽章裡），3.6／5.2cqw 的正方形
        const pictures = imageCalls(ctx);
        assert.equal(pictures.length, 1);
        assert.equal(pictures[0].image.picture, 'pld');
        near(pictures[0].w, cp(format, 3.6, 5.2));
        near(pictures[0].h, cp(format, 3.6, 5.2));

        // 沒有膠囊、時段格子、其他職業的方塊、小卡與自我介紹的框：白色的形狀只有徽章的膠囊
        assert.equal(chipShapes(ctx).length + hourCells(ctx).length + subTiles(ctx).length, 0);
        assert.equal(whiteBoxes(ctx).length, 1);
        badgeOf(ctx);
        assert.equal(ctx.calls.filter((call) => call.op === 'clip').length, 1, '照片框裡的東西先 clip');
        // 底：第一次填色是整張卡片的淺色底；沒有邊框（描邊）
        assert.equal(fills(ctx)[0].fillStyle, BASE);
        assert.equal(ctx.calls.filter((call) => call.op === 'stroke').length, 0);

        // 其他的字都在資訊欄裡，不在照片框裡
        for (const box of textBoxes(ctx).filter((candidate) => !['Paladin', 'Lv 100'].includes(candidate.text))) {
            assert.ok(inside(box, info), `「${box.text}」在資訊欄裡`);
            assert.equal(overlaps(box, { left: photo.x, right: photo.x + photo.width, top: photo.y, bottom: photo.y + photo.height }), false, `「${box.text}」不在照片框裡`);
        }
        // 底部一列貼著資訊欄的底（右邊是「FF14.tw · SE 版權字」，靠右）
        const foot = lineOf(ctx, FOOT);
        near(foot.y + foot.px * LINE_NORMAL / 2, info.y + info.height, '底部一列貼著資訊欄的底', 0.02);
        near(foot.x + foot.width, info.x + info.width, '右邊貼著資訊欄的右緣');
    }
});

test('什麼都沒填：只有照片框裡的預設背景與底部一列（沒有徽章）', () => {
    for (const format of FORMATS) {
        const { photo, info } = boxes(format);
        const ctx = render(emptyModel('c', { format }));
        assert.deepEqual(texts(ctx), [FOOT]);
        assert.equal(imageCalls(ctx).length, 0);
        assert.equal(whiteBoxes(ctx).length, 0, '沒有主職就沒有徽章，也沒有小卡與自我介紹的框');
        assert.equal(accentCircles(ctx).length, 0);
        assert.equal(chipShapes(ctx).length + hourCells(ctx).length + subTiles(ctx).length, 0);
        // 照片框裡是預設背景：漸層從照片框左上到右下
        const gradient = ctx.calls.find((call) => call.op === 'createLinearGradient' && close(call.args[0], photo.x) && close(call.args[1], photo.y));
        assert.ok(gradient, '照片框裡有預設背景的漸層');
        near(gradient.args[2], photo.x + photo.width);
        near(gradient.args[3], photo.y + photo.height);
        assert.deepEqual(plain(gradient.result.stops), [[0, '#1b1d45'], [1, ACCENT]]);
        // 底部一列貼著資訊欄的底
        const foot = lineOf(ctx, FOOT);
        near(foot.y + foot.px * LINE_NORMAL / 2, info.y + info.height, '', 0.02);
    }
});

// ---------- 全部填滿 ----------

test('全部填滿：每個欄位都畫出來，包括海報不畫的部隊、大國防聯軍、在找什麼與聯絡方式；小卡與自我介紹的框是白色、膠囊的底是淡色、其他職業的方塊是深色', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const ctx = render(fullModel('c', { format }));
        const found = lines(ctx);
        const isQuote = (line) => line.font === fontOf(500, cp(format, 1.45, 2.1));
        const quote = found.filter(isQuote);
        assert.ok(quote.length >= 1 && quote.length <= 2, '自我介紹最多 2 行');
        assert.equal(quote.map((line) => line.text).join(' '), INTRO);
        // 部隊的值「Moonlit Garden «MOON»」橫版的小卡放不下一行，折成 2 行；直版放得下
        const fcValue = pick(format, ['Moonlit Garden', '«MOON»'], ['Moonlit Garden «MOON»']);
        assert.deepEqual(sorted(found.filter((line) => !isQuote(line)).map((line) => line.text)), sorted([
            'Starfarer',
            'Luna Starweaver', 'Tiamat',
            'Paladin', 'Lv 100',
            '部隊', '大國防聯軍', '在找什麼', ...fcValue, '雙蛇黨', '固定隊、部隊',
            '喜歡的內容', 'Savage', 'Glamour', 'Photo', 'Treasure', 'Housing', 'PvP',
            '遊玩時段', ...DAYS, ...SLOTS,
            '其他職業',
            'Discord: luna_star', FOOT
        ]));

        // 稱號：700、1.45／2.1cqw、不轉大寫、沒有字距；顏色是 readableOn(accent, #f4f5fa)，不是 accent 本身
        const title = lineOf(ctx, 'Starfarer');
        assert.equal(title.font, fontOf(700, cp(format, 1.45, 2.1)));
        assert.equal(title.fillStyle, titleColorOf());
        assert.notEqual(title.fillStyle, ACCENT);
        assert.equal(drawn(ctx).filter((piece) => piece.y === title.y && piece.font === title.font && piece.fillStyle === title.fillStyle).length, 1, '稱號整段畫一次，不是一個字一個字');
        near(title.x, info.x);
        // 名字、伺服器
        assert.equal(lineOf(ctx, 'Luna Starweaver').font, fontOf(700, cp(format, 4.2, 6.2)));
        assert.equal(lineOf(ctx, 'Tiamat').font, fontOf(500, cp(format, 1.4, 2)));

        // 小標（6 個）：500、1.02／1.5cqw、字距 0.08em 一個字一個字畫、#697084
        const labels = ['部隊', '大國防聯軍', '在找什麼', '喜歡的內容', '遊玩時段', '其他職業'];
        for (const label of labels) {
            const line = lineOf(ctx, label);
            assert.equal(line.font, fontOf(500, cp(format, 1.02, 1.5)), label);
            assert.equal(line.fillStyle, COLORS.gray, label);
        }
        const gcLabel = lineOf(ctx, '大國防聯軍');
        const glyphs = drawn(ctx).filter((piece) => piece.y === gcLabel.y && piece.fillStyle === COLORS.gray && piece.font === gcLabel.font && piece.x >= gcLabel.x - 1e-6 && piece.x < gcLabel.x + gcLabel.width);
        assert.equal(glyphs.length, 5, '小標是一個字一個字畫的');
        for (let i = 0; i + 1 < glyphs.length; i++) near(glyphs[i + 1].x - glyphs[i].x, glyphs[i].width + 0.08 * glyphs[i].px, '小標的字距 0.08em');

        // 三格小卡：白色、圓角 1cqw、3 等分、間隔 1cqw、同一列一樣高；值 700、1.4／2cqw、#1d2233
        const tiles = factTiles(ctx, format, info);
        assert.equal(tiles.length, 3);
        const tileWidth = (info.width - 2 * cq(format, 1)) / 3;
        tiles.forEach((tile, i) => {
            near(tile.w, tileWidth, `第 ${i + 1} 張小卡的寬`);
            near(tile.x, info.x + i * (tileWidth + cq(format, 1)), `第 ${i + 1} 張小卡的位置`);
            near(tile.h, tiles[0].h, '同一列一樣高', 1e-9);
        });
        for (const value of [...fcValue, '雙蛇黨', '固定隊、部隊']) {
            const line = lineOf(ctx, value);
            assert.equal(line.font, fontOf(700, cp(format, 1.4, 2)), value);
            assert.equal(line.fillStyle, COLORS.value, value);
        }

        // 膠囊：6 個，700、1.22／1.8cqw；底 mixOf(accent, #ffffff, 0.87)、字 readableOn(mixOf(accent, #1d2233, 0.2), 底)；沒有邊框
        assert.equal(chipShapes(ctx).length, 6);
        assert.equal(ctx.calls.filter((call) => call.op === 'stroke').length, 0, '沒有任何描邊（膠囊沒有邊框）');
        for (const label of ['Savage', 'Glamour', 'Photo', 'Treasure', 'Housing', 'PvP']) {
            const line = lineOf(ctx, label);
            assert.equal(line.font, fontOf(700, cp(format, 1.22, 1.8)), label);
            assert.equal(line.fillStyle, chipTextOf(), label);
        }

        // 時段格子 8 格：有選的 4 格是 accent、沒選的是 #e3e5ee；格高 1.15／1.7cqw、圓角 0.35cqw；欄名與列名 500、1.02／1.5cqw、#697084
        const cells = hourCells(ctx);
        assert.equal(cells.length, 8);
        assert.equal(cells.filter((cell) => cell.fillStyle === ACCENT).length, 4);
        near(cells[0].h, cp(format, 1.15, 1.7), '格高');
        near(cells[0].r, cq(format, 0.35), '格子的圓角');
        for (const label of [...DAYS, ...SLOTS]) {
            assert.equal(lineOf(ctx, label).fillStyle, COLORS.gray, label);
            assert.equal(lineOf(ctx, label).font, fontOf(500, cp(format, 1.02, 1.5)), label);
        }

        // 其他職業：3 個 #2a2f45 的方塊、圓角 0.8cqw，圖示 2.9／4.2cqw 在方塊正中（內距 0.35cqw）、間隔 0.8cqw
        const subs = subTiles(ctx);
        assert.equal(subs.length, 3);
        const iconSize = cp(format, 2.9, 4.2);
        SUB_ICONS.forEach((icon, i) => {
            const calls = imageCalls(ctx).filter((call) => call.image === icon);
            assert.equal(calls.length, 1, `其他職業的圖示 ${icon.picture} 畫了一次`);
            near(calls[0].w, iconSize);
            near(calls[0].h, iconSize);
            assert.equal(calls[0].call.globalAlpha, 1, '資訊卡的其他職業圖示不調淡');
            near(subs[i].w, iconSize + 2 * cq(format, 0.35), '方塊 = 圖示加兩邊的內距');
            near(subs[i].h, subs[i].w);
            near(subs[i].r, cq(format, 0.8), '方塊的圓角');
            near(calls[0].x, subs[i].x + cq(format, 0.35));
            near(calls[0].y, subs[i].y + cq(format, 0.35));
            if (i > 0) near(subs[i].x - (subs[i - 1].x + subs[i - 1].w), cq(format, 0.8), '方塊之間隔 0.8cqw');
        });
        near(subs[0].x, info.x, '靠資訊欄的左邊');

        // 自我介紹：白色、圓角 1cqw、和資訊欄一樣寬的框；字 500、1.45／2.1cqw、#1d2233，從框的左邊再隔 1.4cqw 開始
        const box = quoteBoxOf(ctx, format, info);
        assert.ok(box, '自我介紹的框');
        near(box.x, info.x);
        for (const line of quote) {
            assert.equal(line.fillStyle, COLORS.value);
            near(line.x, box.x + cq(format, 1.4), '字從框的左邊再隔 1.4cqw 開始');
        }

        // 底部一列：500、1.05／1.5cqw、#697084；左邊聯絡方式、右邊「FF14.tw · SE 版權字」
        for (const text of ['Discord: luna_star', FOOT]) {
            assert.equal(lineOf(ctx, text).font, fontOf(500, cp(format, 1.05, 1.5)));
            assert.equal(lineOf(ctx, text).fillStyle, COLORS.gray);
        }
        near(lineOf(ctx, 'Discord: luna_star').x, info.x);

        // 圖：主職 1 張加其他職業 3 張
        assert.equal(imageCalls(ctx).length, 4);

        // 由上到下：稱號、名字、伺服器、小卡的小標、兩欄的小標、其他職業的小標、自我介紹、底部一列
        const order = [title, lineOf(ctx, 'Luna Starweaver'), lineOf(ctx, 'Tiamat'), lineOf(ctx, '部隊'), lineOf(ctx, '喜歡的內容'), lineOf(ctx, '其他職業'), quote[0], lineOf(ctx, FOOT)];
        for (let i = 0; i + 1 < order.length; i++) assert.ok(order[i].y < order[i + 1].y, `${order[i].text} 在 ${order[i + 1].text} 上面`);
    }
});

test('區塊的位置：資訊欄由上往下疊，抬頭三行中間不留間距，區塊之間隔 1.4／2cqw，行高照草稿（名字 1.15、自我介紹 1.55，沒寫的 1.45 倍字級）', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        // 值都放得進一行（小卡一樣高的情形另外測）
        const ctx = render(fullModel('c', { format, fcName: 'Moonlit', fcTag: '', looking: '朋友' }));
        const gap = cp(format, 1.4, 2);
        const labelHeight = cp(format, 1.02, 1.5) * LINE_NORMAL;
        let top = info.y;

        // 抬頭：稱號、名字、伺服器，中間不留間距
        const titleHeight = cp(format, 1.45, 2.1) * LINE_NORMAL;
        near(lineOf(ctx, 'Starfarer').y, top + titleHeight / 2, '稱號的中線');
        top += titleHeight;
        const nameHeight = cp(format, 4.2, 6.2) * 1.15;
        near(lineOf(ctx, 'Luna Starweaver').y, top + nameHeight / 2, '名字的中線');
        top += nameHeight;
        const worldHeight = cp(format, 1.4, 2) * LINE_NORMAL;
        near(lineOf(ctx, 'Tiamat').y, top + worldHeight / 2, '伺服器的中線');
        top += worldHeight + gap;

        // 三格小卡：內距 1 × 1.2／1.4 × 1.6cqw，小標一行、值一行
        const padY = cp(format, 1, 1.4);
        const padX = cp(format, 1.2, 1.6);
        const valueHeight = cp(format, 1.4, 2) * LINE_NORMAL;
        const tiles = factTiles(ctx, format, info);
        assert.equal(tiles.length, 3);
        for (const tile of tiles) {
            near(tile.y, top, '小卡的上緣');
            near(tile.h, 2 * padY + labelHeight + valueHeight, '小卡的高');
        }
        near(lineOf(ctx, '部隊').y, top + padY + labelHeight / 2, '小標的中線');
        near(lineOf(ctx, '部隊').x, tiles[0].x + padX, '小標從小卡的左邊再隔 1.2／1.6cqw 開始');
        near(lineOf(ctx, 'Moonlit').y, top + padY + labelHeight + valueHeight / 2, '值的中線');
        near(lineOf(ctx, 'Moonlit').x, tiles[0].x + padX);
        top += tiles[0].h + gap;

        // 兩欄：小標下面直接接內容；高度是較高的那一邊
        near(lineOf(ctx, '喜歡的內容').y, top + labelHeight / 2, '喜歡的內容的小標');
        near(lineOf(ctx, '遊玩時段').y, top + labelHeight / 2, '遊玩時段的小標和它同一條中線');
        const chips = chipShapes(ctx);
        near(Math.min(...chips.map((chip) => chip.y)), top + labelHeight, '膠囊緊接在小標下面');
        const chipRows = distinct(chips.map((chip) => chip.y)).length;
        const chipHeight = cp(format, 1.22, 1.8) * LINE_NORMAL + 2 * cp(format, 0.3, 0.45);
        near(chips[0].h, chipHeight, '膠囊的高（沒有邊框）');
        const likesHeight = labelHeight + chipRows * chipHeight + (chipRows - 1) * cq(format, 0.7);
        const hoursHeight = labelHeight + 3 * cp(format, 1.02, 1.5) * LINE_NORMAL + 2 * cp(format, 0.45, 0.6);
        // 時段：第一列是欄名，隔 gapY 之後是平日那一列，格子（1.15／1.7cqw 高）在那一列（一行字的高度）裡垂直置中
        const hoursRow = cp(format, 1.02, 1.5) * LINE_NORMAL;
        near(Math.min(...hourCells(ctx).map((cell) => cell.y)), top + labelHeight + hoursRow + cp(format, 0.45, 0.6) + (hoursRow - cp(format, 1.15, 1.7)) / 2, '時段第一列格子的上緣');
        top += Math.max(likesHeight, hoursHeight) + gap;

        // 其他職業：小標加一排方塊
        near(lineOf(ctx, '其他職業').y, top + labelHeight / 2, '其他職業的小標');
        const tileSize = cp(format, 2.9, 4.2) + 2 * cq(format, 0.35);
        near(Math.min(...subTiles(ctx).map((tile) => tile.y)), top + labelHeight, '方塊緊接在小標下面');
        top += labelHeight + tileSize + gap;

        // 自我介紹：白色的框，內距 1.1 × 1.4cqw，行高 1.55
        const box = quoteBoxOf(ctx, format, info);
        near(box.y, top, '自我介紹的框的上緣');
        const quoteFont = cp(format, 1.45, 2.1);
        const quoteLines = lines(ctx).filter((line) => line.font === fontOf(500, quoteFont));
        near(box.h, 2 * cq(format, 1.1) + quoteLines.length * quoteFont * 1.55, '框的高');
        near(quoteLines[0].y, box.y + cq(format, 1.1) + quoteFont * 1.55 / 2, '第一行的中線');
        if (quoteLines.length > 1) near(quoteLines[1].y - quoteLines[0].y, quoteFont * 1.55, '行距是行高 1.55');
    }
});

test('三格小卡一樣高：值折成 2 行的那一張把同一列的小卡都撐高；值最多 2 行，超過的接「…」，每一行都在小卡的內距裡', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const padY = cp(format, 1, 1.4);
        const padX = cp(format, 1.2, 1.6);
        const labelHeight = cp(format, 1.02, 1.5) * LINE_NORMAL;
        const valueHeight = cp(format, 1.4, 2) * LINE_NORMAL;
        const tileWidth = (info.width - 2 * cq(format, 1)) / 3;
        const valueLines = (ctx) => lines(ctx).filter((line) => line.font === fontOf(700, cp(format, 1.4, 2)) && line.fillStyle === COLORS.value);

        // 三個值都是一行：小卡高 = 內距 + 小標 + 一行
        const short = render(fullModel('c', { format, fcName: 'Moon', fcTag: '', gc: '雙蛇黨', looking: '朋友' }));
        for (const tile of factTiles(short, format, info)) near(tile.h, 2 * padY + labelHeight + valueHeight);

        // 值很長（80 個寬字，在大國防聯軍那一欄）：折成 2 行、最後接「…」，三張小卡都一樣高（照 2 行）
        const long = render(fullModel('c', { format, gc: '寬'.repeat(80) }));
        const tiles = factTiles(long, format, info);
        for (const tile of tiles) near(tile.h, 2 * padY + labelHeight + 2 * valueHeight, '三張小卡照最高的那一張');
        const second = tiles[1];
        const inSecond = valueLines(long).filter((line) => line.x >= second.x - 1e-6 && line.x < second.x + second.w);
        assert.equal(inSecond.length, 2, `${format}：值最多 2 行`);
        assert.ok(inSecond[1].text.endsWith('…'), '超過 2 行的接「…」');
        assert.equal(inSecond[0].text.endsWith('…'), false);
        for (const line of inSecond) {
            near(line.x, second.x + padX, '值從小卡的左邊再隔內距開始');
            assert.ok(line.x + line.width <= second.x + second.w - padX + 1e-6, `「${line.text}」在小卡的內距裡`);
        }
        // 第一行在小標下面，第二行再往下一行
        near(inSecond[0].y, second.y + padY + labelHeight + valueHeight / 2);
        near(inSecond[1].y - inSecond[0].y, valueHeight);
        // 小卡的寬照舊是三等分
        for (const tile of tiles) near(tile.w, tileWidth);
    }
});

// ---------- 三格小卡的內容 ----------

test('部隊與在找什麼的值：只填名稱是「Moonlit Garden」、只填簡稱是「«MOON»」；只填大國防聯軍時它在第一張小卡；在找什麼只有一個時就是那一個', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const padX = cp(format, 1.2, 1.6);
        // 部隊只填名稱：不留空的「«»」；只填簡稱：只有「«MOON»」
        const nameOnly = render(fullModel('c', { format, fcName: 'Moonlit Garden', fcTag: '' }));
        assert.ok(hasLine(nameOnly, 'Moonlit Garden'));
        assert.equal(texts(nameOnly).some((text) => text.includes('«') || text.includes('»')), false);
        const tagOnly = render(fullModel('c', { format, fcName: '', fcTag: 'MOON' }));
        assert.ok(hasLine(tagOnly, '«MOON»'));
        assert.equal(texts(tagOnly).some((text) => text.includes('Moonlit')), false);
        assert.ok(hasLine(tagOnly, '部隊'), '只填簡稱也有「部隊」小標');
        assert.ok(hasLine(render(fullModel('c', { format, fcName: 'Moon', fcTag: 'MOON' })), 'Moon «MOON»'), '兩個都填：名稱加簡稱，中間一個空白');
        // 名稱加簡稱放不下一行就在空白處折成 2 行（橫版的小卡比較窄）
        const wrapped = texts(render(fullModel('c', { format })));
        if (format === 'landscape') assert.ok(wrapped.includes('Moonlit Garden') && wrapped.includes('«MOON»'));
        else assert.ok(wrapped.includes('Moonlit Garden «MOON»'));
        // 只有空白也當成沒填
        assert.equal(hasLine(render(fullModel('c', { format, fcName: '   ', fcTag: ' ' })), '部隊'), false);

        // 只填大國防聯軍：只有一張小卡，在第一欄（小卡的左邊是資訊欄的左邊），沒有「部隊」「在找什麼」
        const gcOnly = render(fullModel('c', { format, fcName: '', fcTag: '', looking: '' }));
        assert.ok(hasLine(gcOnly, '大國防聯軍') && hasLine(gcOnly, '雙蛇黨'));
        assert.equal(hasLine(gcOnly, '部隊') || hasLine(gcOnly, '在找什麼'), false);
        const tiles = factTiles(gcOnly, format, info);
        assert.equal(tiles.length, 1);
        near(tiles[0].x, info.x, '小卡在第一欄');
        near(lineOf(gcOnly, '大國防聯軍').x, info.x + padX, '小標在第一張小卡裡');
        near(lineOf(gcOnly, '雙蛇黨').x, info.x + padX, '值在第一張小卡裡');
        near(tiles[0].w, (info.width - 2 * cq(format, 1)) / 3, '欄寬照舊是三等分');

        // 在找什麼只有一個：就是那一個，沒有多出來的「、」
        const one = render(fullModel('c', { format, looking: '朋友' }));
        assert.ok(hasLine(one, '朋友'));
        assert.equal(texts(one).some((text) => text.includes('、')), false);

        // 三張小卡三等分、中間隔 1cqw；有值的從左邊那欄排（欄寬照舊是三等分）
        const column = (info.width - 2 * cq(format, 1)) / 3;
        const labelX = (ctx, label) => lineOf(ctx, label).x;
        const both = render(fullModel('c', { format }));
        near(labelX(both, '部隊'), info.x + padX);
        near(labelX(both, '大國防聯軍'), info.x + column + cq(format, 1) + padX);
        near(labelX(both, '在找什麼'), info.x + 2 * (column + cq(format, 1)) + padX);
        const compact = render(fullModel('c', { format, gc: '' }));
        near(labelX(compact, '部隊'), info.x + padX);
        near(labelX(compact, '在找什麼'), info.x + column + cq(format, 1) + padX, '沒填的那一欄拿掉，剩下的從左邊排');
        assert.equal(hasLine(compact, '大國防聯軍'), false);
        assert.equal(factTiles(compact, format, info).length, 2);
        // 三個都沒有：整列拿掉
        const none = render(fullModel('c', { format, fcName: '', fcTag: '', gc: '', looking: '' }));
        assert.deepEqual([hasLine(none, '部隊'), hasLine(none, '大國防聯軍'), hasLine(none, '在找什麼')], [false, false, false]);
        assert.equal(factTiles(none, format, info).length, 0);
    }
});

// ---------- 沒填的整塊不畫 ----------

test('沒填的整塊不畫、下面的往上靠', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const gap = cp(format, 1.4, 2);
        const labelHeight = cp(format, 1.02, 1.5) * LINE_NORMAL;
        const titleHeight = cp(format, 1.45, 2.1) * LINE_NORMAL;
        const worldHeight = cp(format, 1.4, 2) * LINE_NORMAL;
        const base = render(fullModel('c', { format }));
        const topOf = (ctx) => factTiles(ctx, format, info)[0].y;
        const headHeight = titleHeight + cp(format, 4.2, 6.2) * 1.15 + worldHeight;

        // 稱號沒填：稱號不見，名字往上靠一個稱號的高度（抬頭的三行中間沒有間距）
        const noTitle = render(fullModel('c', { format, title: '' }));
        assert.equal(hasLine(noTitle, 'Starfarer'), false);
        near(lineOf(base, 'Luna Starweaver').y - lineOf(noTitle, 'Luna Starweaver').y, titleHeight, '名字往上靠');
        near(topOf(base) - topOf(noTitle), titleHeight, '小卡也往上靠');
        // 伺服器沒填：下面的往上靠一個伺服器的高度；上面的不動
        const noWorld = render(fullModel('c', { format, world: '' }));
        assert.equal(hasLine(noWorld, 'Tiamat'), false);
        near(topOf(base) - topOf(noWorld), worldHeight, '小卡往上靠');
        near(lineOf(base, 'Luna Starweaver').y, lineOf(noWorld, 'Luna Starweaver').y, '上面的不動');
        // 稱號、名字、伺服器都沒填：整個抬頭不見，小卡往上靠抬頭的高度加一個間距，貼著資訊欄的上緣
        const noHead = render(fullModel('c', { format, title: '', name: '', world: '' }));
        near(topOf(base) - topOf(noHead), headHeight + gap, '小卡往上靠一整個抬頭加一個間距');
        near(topOf(noHead), info.y, '小卡貼著資訊欄的上緣');

        // 三格小卡沒填：整列不見，兩欄的小標往上靠小卡的高度加一個間距
        const tileHeight = factTiles(base, format, info)[0].h;
        const noMeta = render(fullModel('c', { format, fcName: '', fcTag: '', gc: '', looking: '' }));
        near(lineOf(base, '喜歡的內容').y - lineOf(noMeta, '喜歡的內容').y, tileHeight + gap, '兩欄往上靠');

        // 喜歡的內容沒填：小標、膠囊不見；時段照右欄原本的寬、靠左
        const noLikes = render(fullModel('c', { format, likes: [] }));
        for (const text of ['喜歡的內容', 'Savage', 'PvP']) assert.equal(hasLine(noLikes, text), false, text);
        assert.equal(chipShapes(noLikes).length, 0);
        near(lineOf(noLikes, '遊玩時段').x, info.x, '時段靠左');
        // 時段沒填：小標、欄名、列名、格子都不見
        const noHours = render(fullModel('c', { format, hours: { days: DAYS, slots: SLOTS, on: new Set() } }));
        for (const text of ['遊玩時段', ...DAYS, ...SLOTS]) assert.equal(hasLine(noHours, text), false, text);
        assert.equal(hourCells(noHours).length, 0);
        // 兩欄都沒填：整列不見，其他職業往上靠一整列的高度加一個間距
        const noColumns = render(fullModel('c', { format, likes: [], hours: { days: DAYS, slots: SLOTS, on: new Set() } }));
        const chipRows = distinct(chipShapes(base).map((chip) => chip.y)).length;
        const chipHeight = cp(format, 1.22, 1.8) * LINE_NORMAL + 2 * cp(format, 0.3, 0.45);
        const likesHeight = labelHeight + chipRows * chipHeight + (chipRows - 1) * cq(format, 0.7);
        const hoursHeight = labelHeight + 3 * cp(format, 1.02, 1.5) * LINE_NORMAL + 2 * cp(format, 0.45, 0.6);
        near(lineOf(base, '其他職業').y - lineOf(noColumns, '其他職業').y, Math.max(likesHeight, hoursHeight) + gap, '其他職業往上靠一整列的高度加一個間距', 0.05);

        // 其他職業沒填：小標與方塊都不見，自我介紹往上靠小標加方塊的高度加一個間距；只剩主職的圖示（在徽章裡）
        const noSubs = render(fullModel('c', { format, subJobs: [] }));
        assert.equal(hasLine(noSubs, '其他職業'), false);
        assert.equal(subTiles(noSubs).length, 0);
        assert.equal(imageCalls(noSubs).length, 1);
        near(quoteBoxOf(base, format, info).y - quoteBoxOf(noSubs, format, info).y, labelHeight + cp(format, 2.9, 4.2) + 2 * cq(format, 0.35) + gap, '自我介紹往上靠');

        // 自我介紹沒填：框與字都不見
        const noIntro = render(fullModel('c', { format, intro: '' }));
        assert.equal(quoteBoxOf(noIntro, format, info), undefined);
        assert.equal(lines(noIntro).some((line) => line.font === fontOf(500, cp(format, 1.45, 2.1))), false);
        // 聯絡方式沒填：只有右邊的「FF14.tw · SE 版權字」，還是靠右
        const noContact = render(fullModel('c', { format, contact: '' }));
        assert.equal(hasLine(noContact, 'Discord: luna_star'), false);
        near(lineOf(noContact, FOOT).x + lineOf(noContact, FOOT).width, info.x + info.width);

        // 沒有主職（名稱空白）：沒有徽章（膠囊、圓、圖示、職業名稱與 Lv），其他照舊
        const noJob = render(fullModel('c', { format, job: { name: ' ', level: 100, icon: null } }));
        assert.equal(hasLine(noJob, 'Lv 100'), false);
        assert.equal(whiteBoxes(noJob).filter((shape) => shape.call.shadowBlur > 0).length, 0);
        assert.equal(accentCircles(noJob).length, 0);
        assert.equal(imageCalls(noJob).length, 3, '只剩其他職業的圖示');
        near(lineOf(noJob, 'Luna Starweaver').y, lineOf(base, 'Luna Starweaver').y, '資訊欄不受影響');
        // 沒有等級：徽章裡只有職業名稱
        const noLevel = render(fullModel('c', { format, job: { name: 'Paladin', icon: picture('pld') } }));
        assert.ok(hasLine(noLevel, 'Paladin'));
        assert.equal(texts(noLevel).some((text) => text.includes('Lv')), false);
    }
});

test('兩欄的寬度：1 : 1、中間隔 2cqw；只有喜歡的內容時膠囊可以排到那一欄外面，只有時段時格子照右欄的寬靠左', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const room = info.width - cq(format, 2);
        const halfWidth = room / 2;
        const wideLikes = ['W'.repeat(14), 'V'.repeat(14), 'X'.repeat(14)]; // 一顆約 150～190px，三顆排不進半欄的一列、排得進整列
        const hoursOff = { days: DAYS, slots: SLOTS, on: new Set() };

        // 兩邊都有：左右各一半，中間隔 2cqw
        const both = render(fullModel('c', { format, likes: wideLikes }));
        near(lineOf(both, '喜歡的內容').x, info.x);
        near(lineOf(both, '遊玩時段').x, info.x + halfWidth + cq(format, 2), '右欄在左欄右邊隔 2cqw');
        near(Math.max(...hourCells(both).map((cell) => cell.x + cell.w)), info.x + info.width, '時段格子貼著資訊欄的右緣', 0.02);
        for (const chip of chipShapes(both)) assert.ok(chip.x + chip.w <= info.x + halfWidth + 1e-6, '兩邊都有時膠囊都在左欄裡');
        // 只有喜歡的內容：用整列的寬，膠囊可以排到半欄外面
        const likesOnly = render(fullModel('c', { format, likes: wideLikes, hours: hoursOff }));
        const rightEdge = Math.max(...chipShapes(likesOnly).map((chip) => chip.x + chip.w));
        assert.equal(chipShapes(likesOnly).length, 3);
        assert.ok(rightEdge > info.x + halfWidth, `膠囊排到左欄外面（${rightEdge} > ${info.x + halfWidth}）`);
        assert.ok(rightEdge <= info.x + info.width + 1e-6);
        // 只有時段：格子照右欄的寬（兩邊都有時右欄的寬），靠左
        const hoursOnly = render(fullModel('c', { format, likes: [] }));
        near(lineOf(hoursOnly, '遊玩時段').x, info.x, '小標靠左');
        near(Math.max(...hourCells(hoursOnly).map((cell) => cell.x + cell.w)) - info.x, halfWidth, '格子整塊的寬是右欄的寬', 0.02);
        near(Math.min(...DAYS.map((day) => lineOf(hoursOnly, day).x)), info.x, '列名靠資訊欄的左邊');
    }
});

test('英文、日文選滿 6 個最長的喜歡的內容：兩種版型 6 個膠囊都畫出來，字級不小於原本的 60%，字在膠囊裡左右的內距一樣', () => {
    for (const lang of ['en', 'ja']) {
        const likes = longestLikes(lang);
        assert.equal(likes.length, 6);
        for (const format of FORMATS) {
            const { info } = boxes(format);
            const ctx = render(fullModel('c', { format, likes }));
            const leftEdge = info.x + (info.width - cq(format, 2)) / 2;
            // 6 個膠囊都畫出來，字照順序
            assert.equal(chipShapes(ctx).length, 6, `${lang} ${format}：6 個膠囊`);
            for (const label of likes) assert.ok(hasLine(ctx, label), `${lang} ${format}：「${label}」`);
            // 最多 2 列，都在左欄裡
            assert.ok(distinct(chipShapes(ctx).map((chip) => chip.y)).length <= 2, '最多 2 列');
            for (const chip of chipShapes(ctx)) assert.ok(chip.x + chip.w <= leftEdge + 1e-6, '膠囊在左欄裡');
            // 字級：原本的 1.22／1.8cqw，縮也不小於 60%
            const base = cp(format, 1.22, 1.8);
            const chipPx = lineOf(ctx, likes[0]).px;
            assert.ok(chipPx <= base + 1e-6 && chipPx >= base * 0.6 - 0.011, `${lang} ${format}：字級 ${chipPx}／${base}`);
            // 膠囊整組縮小：字級、內距一起乘同一個倍數；沒有邊框，所以高 = 字級的一行加上下內距
            const scale = chipPx / base;
            near(chipShapes(ctx)[0].h, chipPx * LINE_NORMAL + 2 * cp(format, 0.3, 0.45) * scale, '膠囊的高', 0.05);
            // 字在膠囊裡左右的內距一樣，都是 padX × 倍數（沒有邊框）
            const padX = cp(format, 1, 1.4) * scale;
            chipShapes(ctx).forEach((chip, i) => {
                const line = lineOf(ctx, likes[i]);
                const left = line.x - chip.x;
                const right = chip.x + chip.w - (line.x + line.width);
                near(left, right, `${lang} ${format}：「${likes[i]}」左右的內距一樣`, 1e-9);
                near(left, padX, `${lang} ${format}：「${likes[i]}」的內距是 padX × 倍數`, 0.05);
            });
        }
    }
    // 中文不用縮
    for (const format of FORMATS) {
        const ctx = render(fullModel('c', { format, likes: longestLikes('zh') }));
        assert.equal(chipShapes(ctx).length, 6);
        near(lineOf(ctx, longestLikes('zh')[0]).px, cp(format, 1.22, 1.8), '中文的 6 個標籤照原本的字級');
    }
});

// ---------- 徽章 ----------

test('徽章：白色膠囊，左邊在照片框左邊 + 1.6／2.4cqw、底邊在照片框底邊 + 1.8／2.6cqw，帶陰影；accent 的圓、主職圖示、職業名稱與 Lv', () => {
    for (const format of FORMATS) {
        const { photo } = boxes(format);
        const ctx = render(fullModel('c', { format }));
        const left = cp(format, 1.6, 2.4);
        const drop = cp(format, 1.8, 2.6);
        const padY = cp(format, 0.6, 0.8);
        const padLeft = cp(format, 0.6, 0.8);
        const padRight = cp(format, 1.6, 2.2);
        const gap = cq(format, 0.9);
        const icon = cp(format, 3.6, 5.2);
        const ring = cq(format, 0.4);
        const diameter = icon + 2 * ring;
        const capsuleHeight = diameter + 2 * padY;
        const nameFont = fontOf(700, cp(format, 1.6, 2.3));
        const levelFont = fontOf(500, cp(format, 1.25, 1.8));
        const textWidth = fakeMeasure(nameFont, 'Paladin') + fakeMeasure(levelFont, ' ') + fakeMeasure(levelFont, 'Lv 100');

        // 膠囊：左邊、底邊、高（圓的直徑加上下內距）、寬（左內距 + 圓 + 隔 0.9 + 職業名稱 + 一個空白 + Lv + 右內距）、兩頭是半圓
        const capsule = badgeOf(ctx);
        near(capsule.x, photo.x + left, '膠囊的左邊');
        near(capsule.y + capsule.h, photo.y + photo.height + drop, '膠囊的底邊');
        near(capsule.h, capsuleHeight, '膠囊的高');
        near(capsule.w, padLeft + diameter + gap + textWidth + padRight, '膠囊的寬');
        near(capsule.r, capsuleHeight / 2, '膠囊兩頭是半圓');
        // 陰影：往下 0.6cqw、模糊 2cqw、rgba(29,34,51,0.18)；只有膠囊帶陰影（圓、圖示、字都沒有）
        near(capsule.call.shadowOffsetY, cq(format, 0.6));
        near(capsule.call.shadowBlur, cq(format, 2));
        assert.equal(capsule.call.shadowColor, 'rgba(29,34,51,0.18)');
        assert.equal(capsule.call.shadowOffsetX, 0);
        assert.deepEqual(shadowedDraws(ctx), [capsule.call], '整張卡片只有膠囊的那一次填色帶陰影（圓、圖示、字都沒有）');
        // 膠囊在照片框的左右範圍裡（左右各留一樣的邊），底邊在卡片裡
        assert.ok(capsule.x + capsule.w <= photo.x + photo.width - left + 1e-6, '右邊也留 1.6／2.4cqw');
        assert.ok(capsule.y + capsule.h <= SIZE[format].height);
        // 膠囊在照片之後畫（照片的 clip 已經結束）
        const clipEnd = ctx.calls.findIndex((call, i) => i > ctx.calls.findIndex((c) => c.op === 'clip') && call.op === 'restore');
        assert.ok(ctx.calls.indexOf(capsule.call) > clipEnd, '膠囊畫在照片框的 clip 之外');

        // accent 的圓：直徑 = 圖示 + 0.8cqw，在膠囊裡靠左（左內距）、上下置中
        const circles = accentCircles(ctx);
        assert.equal(circles.length, 1);
        near(circles[0].w, diameter, '圓的直徑');
        near(circles[0].x, capsule.x + padLeft);
        near(circles[0].y + circles[0].h / 2, capsule.y + capsule.h / 2, '圓和膠囊垂直置中');
        // 主職圖示在圓的正中，3.6／5.2cqw
        const main = imageCalls(ctx).find((call) => call.image.picture === 'pld');
        near(main.w, icon);
        near(main.h, icon);
        near(main.x, circles[0].x + ring);
        near(main.y, circles[0].y + ring);
        // 職業名稱在圓右邊隔 0.9cqw，Lv 在名稱後面隔一個空白（用 Lv 的字型量），兩段字在膠囊的中線上
        const name = lineOf(ctx, 'Paladin');
        const level = lineOf(ctx, 'Lv 100');
        near(name.x, circles[0].x + diameter + gap, '職業名稱在圓右邊隔 0.9cqw');
        near(level.x, name.x + name.width + fakeMeasure(levelFont, ' '), 'Lv 在名稱後面隔一個空白');
        near(name.y, capsule.y + capsule.h / 2, '名稱在膠囊的中線上', 1e-9);
        near(level.y, name.y, 'Lv 和名稱同一條中線', 1e-9);
        assert.equal(name.font, nameFont);
        assert.equal(level.font, levelFont);
        near(capsule.x + capsule.w - padRight, level.x + level.width, '右內距 1.6／2.2cqw');
    }
});

test('徽章放不下（職業名稱很長）：名稱與 Lv 一起縮小同一個倍數，膠囊最寬到照片框寬度減兩邊的邊（1.6／2.4cqw），縮得剛好、不低於 30%', () => {
    for (const format of FORMATS) {
        const { photo } = boxes(format);
        const left = cp(format, 1.6, 2.4);
        const long = '寬'.repeat(pick(format, 25, 40)); // 直版的照片框是整個內容寬，要更長的名稱才放不下
        const ctx = render(fullModel('c', { format, job: { name: long, level: 100, icon: picture('pld') } }));
        const capsule = badgeOf(ctx);
        const name = lineOf(ctx, long);
        const level = lineOf(ctx, 'Lv 100');
        const nameScale = name.px / cp(format, 1.6, 2.3);
        const levelScale = level.px / cp(format, 1.25, 1.8);
        assert.ok(nameScale < 1 && nameScale >= 0.3, `名稱縮小了（${nameScale}）`);
        near(nameScale, levelScale, '兩段字縮一樣多', 0.01);
        const limit = photo.x + photo.width - left;
        assert.ok(capsule.x + capsule.w <= limit + 0.5, `膠囊的右邊 ${capsule.x + capsule.w} 不超過 ${limit}`);
        assert.ok(capsule.x + capsule.w >= limit - 2, '縮得剛好放得下，沒有縮得比需要的多');
        // 高度不變（由圓決定），字還是在中線上
        near(capsule.h, cp(format, 3.6, 5.2) + 2 * cq(format, 0.4) + 2 * cp(format, 0.6, 0.8));
        near(name.y, capsule.y + capsule.h / 2, '', 1e-9);
        // 放得下的名稱不縮
        near(lineOf(render(fullModel('c', { format })), 'Paladin').px, cp(format, 1.6, 2.3), '放得下不縮');
    }
    // 沒有等級時只有名稱，膠囊少一個 Lv 與空白的寬
    const noLevel = badgeOf(render(fullModel('c', { job: { name: 'Paladin', icon: picture('pld') } })));
    const withLevel = badgeOf(render(fullModel('c')));
    assert.ok(noLevel.w < withLevel.w);
});

// ---------- 名字與顏色 ----------

test('名字用 Noto Sans TC 700，放不下整行縮小（最多縮到 30%），21 個寬字也縮到放得進資訊欄', () => {
    const LATIN_21 = 'Abcdefghijklmnopqrstu';
    const WIDE_21 = '甲乙丙丁戊己庚辛壬癸'.repeat(2) + '子';
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const base = cp(format, 4.2, 6.2);
        // 短的名字不縮
        const short = lineOf(render(fullModel('c', { format, name: 'Luna' })), 'Luna');
        near(short.px, base);
        assert.equal(short.font, fontOf(700, base));
        near(short.x, info.x);
        // 長的名字：放不下就縮到剛好放得下，放得下就不縮
        for (const name of [LATIN_21, WIDE_21, '寬'.repeat(21), 'W'.repeat(21)]) {
            const line = lineOf(render(fullModel('c', { format, name })), name);
            const natural = fakeMeasure(fontOf(700, base), name);
            assert.ok(line.x + line.width <= info.x + info.width + 1e-6, `${format} ${name} 畫出來 ${line.width}，超出資訊欄的寬 ${info.width}`);
            assert.equal(line.font, fontOf(700, line.px));
            assert.equal(line.fillStyle, COLORS.name);
            if (natural > info.width) {
                assert.ok(line.px < base, `${format} ${name}：縮小了`);
                assert.ok(line.px >= base * 0.3 - 0.011, '最多縮到 30%');
                assert.ok(line.width >= info.width * 0.97, `${format} ${name} 縮得比需要的多`);
            } else {
                near(line.px, base, `${format} ${name}：放得下不縮`);
            }
        }
        // 21 個寬字一定要縮（橫版、直版都放不下）
        assert.ok(lineOf(render(fullModel('c', { format, name: WIDE_21 })), WIDE_21).px < base);
        // 名字縮小時行高跟著縮（行高 1.15），下面的伺服器緊接在名字下面
        const shrunk = render(fullModel('c', { format, name: WIDE_21 }));
        const name = lineOf(shrunk, WIDE_21);
        near(lineOf(shrunk, 'Tiamat').y - name.y, name.px * 1.15 / 2 + cp(format, 1.4, 2) * LINE_NORMAL / 2, '伺服器緊接在縮小後的名字下面');
    }
});

test('稱號放不下資訊欄時整行縮小（最多縮到 30%），行高照原本的字級、其他字都不動；放得下的不縮', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const base = cp(format, 1.45, 2.1);
        // 放得下的不縮：一般的稱號與最長的 30 個字（預設的假量字）
        for (const text of ['Starfarer', '寬'.repeat(30), 'W'.repeat(30)]) {
            const line = lineOf(render(fullModel('c', { format, title: text })), text);
            near(line.px, base, `${format}「${text}」放得下，不縮`);
            assert.equal(line.font, fontOf(700, base));
            near(line.x, info.x);
        }

        // 放不下：用 recorder 的 measure 選項把稱號量得比資訊欄寬（只有稱號的字變寬，其他字照舊）
        const title = '寬'.repeat(30);
        const model = fullModel('c', { format, title });
        const normal = render(model);
        const normalLine = lineOf(normal, title);
        const stripped = (ctx) => ({ texts: plain(drawn(ctx).filter((piece) => piece.text !== title)), shapes: plain(fills(ctx).map(({ call, ...shape }) => shape)) });
        for (const factor of [1.5, 2, 4]) {
            const widened = render(model, { measure: (font, text) => fakeMeasure(font, text) * (text === title ? factor : 1) });
            const line = lineOf(widened, title);
            const where = `${format} 量寬 ${factor} 倍`;
            // 縮到剛好放得下（在量寬之後的量字下，整段的寬度就是資訊欄的寬），字型、顏色、位置照舊
            assert.ok(line.px < base, `${where}：縮小了（${line.px}／${base}）`);
            assert.ok(line.px >= base * 0.3 - 0.011, `${where}：最多縮到 30%`);
            const width = factor * fakeMeasure(line.font, title);
            assert.ok(line.x + width <= info.x + info.width + 1e-6, `${where}：稱號畫出來 ${width}，超出資訊欄的寬 ${info.width}`);
            assert.ok(width >= info.width * 0.97, `${where}：縮得比需要的多（${width}／${info.width}）`);
            assert.equal(line.font, fontOf(700, line.px));
            assert.equal(line.fillStyle, titleColorOf());
            near(line.x, info.x);
            // 行高照原本的字級：稱號的中線不動，名字、伺服器與其他每一段字、每一個形狀都和沒縮的時候一樣
            near(line.y, normalLine.y, `${where}：稱號的中線不動`, 1e-9);
            assert.deepEqual(stripped(widened), stripped(normal), `${where}：稱號以外的字與形狀都不動`);
        }
        // 縮到下限就不再縮（最多縮到 30%）
        const floor = lineOf(render(model, { measure: (font, text) => fakeMeasure(font, text) * (text === title ? 100 : 1) }), title);
        near(floor.px, base * 0.3, `${format}：縮到 30% 為止`, 0.011);
    }
});

test('灰字：小標、時段的字與底部一列是 #697084，伺服器與 Lv 是 #5b6275，名字是 #141826，值與自我介紹是 #1d2233；每一個灰字和它的底都是 4.5:1 以上', () => {
    for (const format of FORMATS) {
        const ctx = render(fullModel('c', { format, fcName: 'Moon', fcTag: 'MOON' }));
        const colorOf = (text) => lineOf(ctx, text).fillStyle;
        for (const text of ['部隊', '大國防聯軍', '在找什麼', '喜歡的內容', '遊玩時段', '其他職業', ...DAYS, ...SLOTS, 'Discord: luna_star', FOOT]) assert.equal(colorOf(text), COLORS.gray, text);
        for (const text of ['Tiamat', 'Lv 100']) assert.equal(colorOf(text), COLORS.world, text);
        assert.equal(colorOf('Luna Starweaver'), COLORS.name);
        for (const text of ['Moon «MOON»', '雙蛇黨', '固定隊、部隊', 'Paladin']) assert.equal(colorOf(text), COLORS.value, text);
        // 灰字在淺色底與白色的框上都夠（草稿的 #7a8195 是 3.57:1、#8a90a2 是 2.93:1，不夠）
        for (const gray of [COLORS.gray, COLORS.world]) {
            assert.ok(CardLayout.contrastRatio(gray, BASE) >= 4.5, `${gray} 在 ${BASE} 上`);
            assert.ok(CardLayout.contrastRatio(gray, WHITE) >= 4.5, `${gray} 在 ${WHITE} 上`);
        }
        assert.ok(CardLayout.contrastRatio('#7a8195', BASE) < 4.5 && CardLayout.contrastRatio('#8a90a2', BASE) < 4.5);
    }
});

// ---------- 對比度 ----------

// 唯一的例外：這裡的畫面模型（fullModel、maxedModel）職業都有圖示，檢查不到沒有圖示的職業畫在重點色方塊裡的大字（CardPaint.drawIcon）。它的字色是
// CardLayout.textColorOn 在白字與深字裡挑對比度高的，最差的重點色上約 4.2:1，不到 4.5:1；但它一定是粗體大字（方塊邊長的 0.55 倍：徽章裡 23.8px 起，
// 其他職業的方塊 19.1px 起），WCAG 的大字只要 3:1（見 card-style-c.js 檔案開頭）。這個字的大小與對比度另外在 tests/character-card-paint.test.js 檢查（三種風格都一樣）
test('每一段字和它的底至少 4.5:1：每種重點色（含很淺的）× 橫直版 × 全部填滿與每個欄位填到上限', () => {
    const ACCENTS = ['#4f74d6', '#3f9e5c', '#d4574e', '#8a63d2', '#c99a2e', '#ffff66', '#ffffff'];
    let checked = 0;
    for (const accent of ACCENTS) {
        for (const format of FORMATS) {
            const models = {
                full: fullModel('c', { format, accent }),
                maxed: maxedModel('c', { script: 'wide' }, { format, accent })
            };
            for (const [name, model] of Object.entries(models)) {
                const ctx = render(model);
                const where = `${accent} ${format} ${name}`;
                const backgrounds = new Set();
                for (const call of ctx.calls.filter((candidate) => candidate.op === 'fillText')) {
                    const background = backgroundOf(ctx, call);
                    assert.equal(typeof background, 'string', `${where}：「${call.args[0]}」的底是 #rrggbb（${background}）`);
                    const ratio = CardLayout.contrastRatio(call.fillStyle, background);
                    assert.ok(ratio >= 4.5, `${where}：「${call.args[0]}」${call.fillStyle} 在 ${background} 上只有 ${ratio.toFixed(2)}:1`);
                    backgrounds.add(background);
                    checked += 1;
                }
                // 不是空轉：字真的落在三種底上（整張卡片的淺色底、白色的框與徽章、膠囊的淡色底）
                for (const expected of [BASE, WHITE, chipFillOf(accent)]) assert.ok(backgrounds.has(expected), `${where}：有字落在 ${expected} 上`);
            }
        }
    }
    assert.ok(checked > 1000, `檢查了 ${checked} 段字`);
});

test('稱號的顏色：五個職能的預設重點色在 #f4f5fa 上不夠，所以是 readableOn(accent, #f4f5fa)（和 accent 不同）；本來就夠的（#000000）就是它自己', () => {
    const { ROLE_COLORS } = card.CardState;
    assert.equal(Object.keys(ROLE_COLORS).length, 5);
    for (const accent of Object.values(ROLE_COLORS)) {
        assert.ok(CardLayout.contrastRatio(accent, BASE) < 4.5, `${accent} 在 ${BASE} 上本來就不夠`);
        for (const format of FORMATS) {
            const title = lineOf(render(fullModel('c', { format, accent })), 'Starfarer');
            assert.equal(title.fillStyle, CardPaint.readableOn(accent, BASE), accent);
            assert.notEqual(title.fillStyle, accent, `${accent}：稱號不能用 accent 本身`);
            assert.ok(CardLayout.contrastRatio(title.fillStyle, BASE) >= 4.5);
        }
    }
    assert.equal(lineOf(render(fullModel('c', { accent: '#000000' })), 'Starfarer').fillStyle, '#000000');
    // 膠囊的底與字也跟著重點色走（淺色的重點色上，字會往深色混）
    for (const accent of ['#4f74d6', '#ffff66', '#ffffff']) {
        const ctx = render(fullModel('c', { accent }));
        // 白色的重點色：膠囊的底也是白色，和小卡、框、徽章分不開，只看有 6 個以上
        if (accent === '#ffffff') assert.ok(chipShapes(ctx, accent).length >= 6, accent);
        else assert.equal(chipShapes(ctx, accent).length, 6, accent);
        assert.equal(lineOf(ctx, 'Savage').fillStyle, chipTextOf(accent), accent);
        assert.ok(CardLayout.contrastRatio(chipTextOf(accent), chipFillOf(accent)) >= 4.5, accent);
    }
});

test('backgroundOf（測試輔助）：這一次畫字之前、包住字的中心點的最後一次填色；fillRect 與 roundRect 之後的 fill 算，clip、描邊、之後的填色不算', () => {
    const ctx = createRecordingContext();
    ctx.fillStyle = '#f4f5fa';
    ctx.fillRect(0, 0, 400, 200);
    // 圓角框 A：白色，(20, 20) 起 100 × 40
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(20, 20, 100, 40, 8);
    ctx.fill();
    // 圓角框 B：蓋在 A 的右半，(70, 20) 起 100 × 40，深色
    ctx.fillStyle = '#2a2f45';
    ctx.beginPath();
    ctx.roundRect(70, 20, 100, 40, 8);
    ctx.fill();
    // 只有 clip 與描邊（不是填色）：(200, 100) 起 100 × 50
    ctx.beginPath();
    ctx.roundRect(200, 100, 100, 50, 4);
    ctx.clip();
    ctx.strokeStyle = '#ff0000';
    ctx.stroke();
    ctx.fillStyle = '#000000';
    const at = (x, y, text = 'x') => {
        ctx.fillText(text, x, y);
        return ctx.calls[ctx.calls.length - 1];
    };
    const inA = at(25, 40, 'abc'); // 字的中心 x = 25 + 3 × 6 / 2 = 34，在 A 裡、不在 B 裡
    const inBoth = at(80, 40, 'abc'); // 中心 89，A 與 B 都包住，最後畫的 B 贏
    const outside = at(10, 150); // 只有整張卡片的底
    const clipped = at(200, 125, 'abcd'); // 中心 212，在 clip 的框裡，但 clip 不是填色：還是整張卡片的底
    // 這一次畫字「之後」才填的不算
    ctx.fillStyle = '#123456';
    ctx.fillRect(0, 0, 400, 200);

    assert.equal(backgroundOf(ctx, inA), '#ffffff');
    assert.equal(backgroundOf(ctx, inBoth), '#2a2f45');
    assert.equal(backgroundOf(ctx, outside), '#f4f5fa');
    assert.equal(backgroundOf(ctx, clipped), '#f4f5fa');
    // 字在所有填色的外面（卡片外）是 null
    ctx.fillText('x', 900, 900);
    assert.equal(backgroundOf(ctx, ctx.calls[ctx.calls.length - 1]), null);
    // 不是這個 ctx 的 fillText 就丟錯
    assert.throws(() => backgroundOf(ctx, { op: 'fillText', args: ['x', 0, 0], font: '10px x' }), /fillText/);
    assert.throws(() => backgroundOf(ctx, ctx.calls[0]), /fillText/);
});

// ---------- 填到上限 ----------

// 資訊欄放得下：每一段字都在資訊欄裡（徽章的字在照片框裡）、互不重疊，照片框裡只有徽章的字；形狀與圖示也都在範圍裡；
// 每個欄位都畫出來；底部一列貼著資訊欄的底
function assertFitsInfoColumn(ctx, model, format, where) {
    const { photo, info } = boxes(format);
    const photoRegion = { left: photo.x, right: photo.x + photo.width, top: photo.y, bottom: photo.y + photo.height };
    const found = textBoxes(ctx);
    assert.ok(found.length >= 30, `${where}：畫了 ${found.length} 段字`);
    const badgeTexts = [model.job.name, 'Lv 100'];
    for (const box of found) {
        assert.ok(Number.isFinite(box.left) && Number.isFinite(box.top));
        if (badgeTexts.includes(box.text)) {
            assert.ok(inside(box, photo), `${where}：徽章的「${box.text}」超出照片框`);
        } else {
            assert.ok(inside(box, info), `${where}：「${box.text}」超出資訊欄（${box.left}～${box.right}、${box.top}～${box.bottom}；資訊欄 ${JSON.stringify(info)}）`);
        }
    }
    // 照片框裡（和照片框的面積有重疊的字）只有徽章的兩段字
    assert.deepEqual(sorted(found.filter((box) => overlaps(box, photoRegion)).map((box) => box.text)), sorted(badgeTexts), `${where}：照片框裡只有徽章的字`);
    for (let i = 0; i < found.length; i++) {
        for (let j = i + 1; j < found.length; j++) {
            assert.equal(overlaps(found[i], found[j]), false, `${where}：「${found[i].text}」與「${found[j].text}」重疊`);
        }
    }
    // 資訊欄裡的形狀（小卡、自我介紹的框、膠囊、時段格子、其他職業的方塊）也都在資訊欄裡
    const shapes = [...framesOf(ctx, format), ...chipShapes(ctx), ...hourCells(ctx), ...subTiles(ctx)];
    assert.equal(shapes.length, 3 + 1 + 6 + 8 + 3, `${where}：資訊欄裡的形狀`);
    for (const shape of shapes) {
        assert.ok(shape.x >= info.x - 1e-6 && shape.x + shape.w <= info.x + info.width + 1e-6 && shape.y >= info.y - 1e-6 && shape.y + shape.h <= info.y + info.height + 1e-6, `${where}：形狀超出資訊欄 ${JSON.stringify({ x: shape.x, y: shape.y, w: shape.w, h: shape.h })}`);
    }
    // 其他職業的圖示在資訊欄裡，主職的圖示在徽章裡（照片框的左右範圍裡）
    for (const image of imageCalls(ctx)) {
        const region = image.image.picture === 'pld' ? { x: photo.x, width: photo.width, y: photo.y, height: photo.height + cp(format, 1.8, 2.6) } : info;
        assert.ok(image.x >= region.x - 1e-6 && image.x + image.w <= region.x + region.width + 1e-6 && image.y >= region.y - 1e-6 && image.y + image.h <= region.y + region.height + 1e-6, `${where}：圖示超出範圍`);
    }
    // 每個欄位都畫出來：3 張小卡、6 個膠囊、8 格時段、自我介紹最多 2 行、4 張圖示
    assert.equal(factTiles(ctx, format, info).length, 3);
    assert.equal(chipShapes(ctx).length, 6, `${where}：6 個膠囊`);
    assert.equal(hourCells(ctx).length, 8);
    assert.equal(lines(ctx).filter((line) => line.font === fontOf(500, cp(format, 1.45, 2.1))).length <= 2, true);
    assert.equal(imageCalls(ctx).length, 4);
    // 底部一列貼著資訊欄的底
    const foot = found.find((box) => box.text === FOOT);
    near(foot.bottom + (foot.bottom - foot.top) * (LINE_NORMAL - 1) / 2, info.y + info.height, `${where}：底部一列貼著資訊欄的底`, 0.02);
}

// 這一個量的是寬度：每個欄位都填到上限，但 wide 的名字 21 個字會縮小、latin 的自我介紹只有 1 行，量不到高度最擠的情況（見下一個測試）
test('每個欄位填到上限（wide、latin）：橫版、直版的每一段字都在資訊欄裡、互不重疊；照片框裡只有徽章的字', () => {
    for (const script of ['wide', 'latin']) {
        for (const format of FORMATS) {
            const model = maxedModel('c', { script }, { format });
            assertFitsInfoColumn(render(model), model, format, `${script} ${format}`);
        }
    }
});

// 這一個量的是高度：名字短（不縮）、其他區塊都到最高（tallestModel）。資訊卡兩種版型都放得下，區塊之間的間距照草稿，不用 stackDown 的保險
// （同一份內容，名片的直版就要把間距略縮小，見 tests/character-card-style-a.test.js）
test('名字短、其他區塊都到最高（zh、en、ja）：資訊欄放得下、互不重疊，區塊之間的間距照草稿的 1.4／2cqw，不用縮', () => {
    for (const lang of ['zh', 'en', 'ja']) {
        for (const format of FORMATS) {
            const where = `${lang} ${format}`;
            const { info } = boxes(format);
            const model = tallestModel('c', { lang }, { format });
            const ctx = render(model);

            // 這份內容真的是最高的（不是的話，下面的數字量到的是較矮的內容）：名字不縮、第一張小卡（部隊）的值折成 2 行、
            // 喜歡的內容 2 列而且字級是 100%、自我介紹 2 行、每個區塊都在
            near(lineOf(ctx, 'Luna').px, cp(format, 4.2, 6.2), `${where}：名字不縮`);
            const fcValues = lines(ctx).filter((line) => line.fillStyle === COLORS.value && line.font === fontOf(700, cp(format, 1.4, 2)) && Math.abs(line.x - (info.x + cp(format, 1.2, 1.6))) < 1e-6);
            assert.equal(distinct(fcValues.map((line) => line.y)).length, 2, `${where}：部隊的值折成 2 行`);
            assert.equal(distinct(chipShapes(ctx).map((chip) => chip.y)).length, 2, `${where}：喜歡的內容 2 列`);
            for (const label of model.likes) near(lineOf(ctx, label).px, cp(format, 1.22, 1.8), `${where}：膠囊「${label}」字級 100%`);
            assert.equal(lines(ctx).filter((line) => line.font === fontOf(500, cp(format, 1.45, 2.1))).length, 2, `${where}：自我介紹 2 行`);
            for (const text of [model.title, model.world, model.contact]) assert.ok(hasLine(ctx, text), `${where}：「${text}」有畫`);
            assert.equal(subTiles(ctx).length, 3, `${where}：3 個其他職業`);
            assert.equal(imageCalls(ctx).length, 4, `${where}：主職與 3 個其他職業的圖示`);

            assertFitsInfoColumn(ctx, model, format, where);

            // 資訊欄真的放得下：第一個區塊（抬頭）從資訊欄的頂開始，底部一列貼著資訊欄的底，最後一個區塊（自我介紹的框）的底在它上面；
            // 區塊之間的間距（stackDown 實際用的）量抬頭最後一行（伺服器）與第一張小卡之間的，照草稿的 rowGap，沒有縮
            near(lineOf(ctx, model.title).y, info.y + cp(format, 1.45, 2.1) * LINE_NORMAL / 2, `${where}：稱號從資訊欄的頂開始`, 0.011);
            const gap = factTiles(ctx, format, info)[0].y - (lineOf(ctx, model.world).y + cp(format, 1.4, 2) * LINE_NORMAL / 2);
            const foot = lineOf(ctx, FOOT);
            const footTop = foot.y - foot.px * LINE_NORMAL / 2;
            near(footTop + foot.px * LINE_NORMAL, info.y + info.height, `${where}：底部一列貼著資訊欄的底`, 0.011);
            const quote = quoteBoxOf(ctx, format, info);
            assert.ok(quote.y + quote.h <= footTop - gap + 1e-6, `${where}：最後一個區塊（自我介紹的框）的底 ${quote.y + quote.h} 在底部一列的頂 ${footTop} 上面，中間至少一個間距`);
            near(gap, cp(format, 1.4, 2), `${where}：區塊之間的間距照草稿，沒有縮`, 1e-6);
        }
    }
});

// ---------- 底部一列、自我介紹 ----------

test('底部一列：右邊「FF14.tw · SE 版權字」整句，左邊聯絡方式一行放不下整行縮小，中間至少隔 2cqw', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const size = cp(format, 1.05, 1.5);
        // 放得下：不縮
        near(lineOf(render(fullModel('c', { format })), 'Discord: luna_star').px, size);
        // 40 個寬字放不下：縮小，和右邊至少隔 2cqw，右邊不縮
        const long = '寬'.repeat(40);
        const ctx = render(fullModel('c', { format, contact: long }));
        const left = lineOf(ctx, long);
        const right = lineOf(ctx, FOOT);
        near(right.px, size, '右邊不縮');
        assert.ok(left.px < size && left.px >= size * 0.3 - 0.011, `聯絡方式縮小了（${left.px}／${size}）`);
        assert.ok(right.x - (left.x + left.width) >= cq(format, 2) - 0.15, `中間至少隔 2cqw（${right.x - (left.x + left.width)}）`);
        near(left.x, info.x);
        near(right.x + right.width, info.x + info.width);
        near(left.y, right.y, '兩段字在同一條中線上', 1e-9);
    }
});

test('自我介紹：白色的框，最多 2 行，超過的最後一行接「…」；每一行都在框的內距裡', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const ctx = render(fullModel('c', { format, intro: INTRO.repeat(4) }));
        const font = cp(format, 1.45, 2.1);
        const found = lines(ctx).filter((line) => line.font === fontOf(500, font));
        assert.equal(found.length, 2);
        assert.ok(found[1].text.endsWith('…'));
        const box = quoteBoxOf(ctx, format, info);
        for (const line of found) assert.ok(line.x + line.width <= box.x + box.w - cq(format, 1.4) + 1e-6, '每一行都在框的內距裡');
        near(box.h, 2 * cq(format, 1.1) + 2 * font * 1.55, '框的高：上下內距加 2 行');
        near(found[1].y - found[0].y, font * 1.55, '行距是行高 1.55');
    }
});

// ---------- 照片 ----------

test('照片框裡：有截圖時先 clip 成圓角 1.8cqw 的框，照 C 這一份位置畫截圖；沒有截圖時是預設背景；沒有光環與陰影，不畫模糊背景', () => {
    const PHOTO = picture('photo');
    const BACKDROP = picture('backdrop');
    const crop = { x: 0.5, y: -0.25, zoom: 1.5 };
    for (const format of FORMATS) {
        const { photo } = boxes(format);
        const inClip = (ctx) => {
            const at = ctx.calls.findIndex((call) => call.op === 'clip');
            assert.ok(at >= 0, '有 clip');
            const end = ctx.calls.findIndex((call, i) => i > at && call.op === 'restore');
            assert.ok(end > at, 'clip 包在 save／restore 裡');
            return ctx.calls.slice(at, end);
        };

        const withPhoto = render(fullModel('c', { format, image: { source: PHOTO, width: 2000, height: 1000 }, backdrop: { source: BACKDROP, width: 160, height: 90 }, crop }));
        const rect = CardLayout.coverRect(2000, 1000, photo.width, photo.height, crop);
        const photoCalls = imageCalls(withPhoto).filter((call) => call.image === PHOTO);
        assert.equal(photoCalls.length, 1);
        [photo.x + rect.dx, photo.y + rect.dy, rect.dw, rect.dh].forEach((expected, i) => near(photoCalls[0].args[i + 1], expected, `截圖的位置 ${i}`, 1e-6));
        assert.ok(inClip(withPhoto).includes(photoCalls[0].call), '截圖畫在 clip 裡面');
        const clipPath = withPhoto.calls[withPhoto.calls.findIndex((call) => call.op === 'clip') - 1];
        assert.equal(clipPath.op, 'roundRect');
        assert.deepEqual(plain(clipPath.args.map((n) => Math.round(n * 1000) / 1000)), [photo.x, photo.y, photo.width, photo.height, cq(format, 1.8)].map((n) => Math.round(n * 1000) / 1000));
        assert.equal(inClip(withPhoto).filter((call) => call.op === 'createRadialGradient').length, 0, '有截圖時照片框裡沒有預設背景');
        // 模糊背景（名片才用）不畫；沒有光環與陰影：只有徽章的膠囊帶陰影
        assert.equal(imageCalls(withPhoto).filter((call) => call.image === BACKDROP).length, 0, '資訊卡不畫模糊背景');
        assert.equal(shadowedDraws(withPhoto).length, 1, '只有徽章的膠囊帶陰影');
        assert.equal(withPhoto.calls.filter((call) => call.imageSmoothingQuality === 'high').length, 0);

        // 沒有截圖：照片框裡是預設背景，漸層從照片框左上到右下，光點都在照片框裡
        const plainCard = render(fullModel('c', { format }));
        const inside_ = inClip(plainCard);
        const gradient = inside_.find((call) => call.op === 'createLinearGradient');
        assert.ok(gradient, '照片框裡有預設背景的漸層');
        assert.deepEqual(plain(gradient.args.map((n) => Math.round(n * 1000) / 1000)), [photo.x, photo.y, photo.x + photo.width, photo.y + photo.height].map((n) => Math.round(n * 1000) / 1000));
        const dots = inside_.filter((call) => call.op === 'createRadialGradient');
        assert.ok(dots.length >= 20);
        for (const dot of dots) {
            const [x, y, , , , radius] = dot.args;
            assert.ok(x - radius >= photo.x - 1e-6 && x + radius <= photo.x + photo.width + 1e-6 && y - radius >= photo.y - 1e-6 && y + radius <= photo.y + photo.height + 1e-6, '光點在照片框裡');
        }
        assert.equal(plainCard.calls.filter((call) => call.op === 'createLinearGradient').length, 1, '整張卡片只有照片框裡一個預設背景（底是淺色，不畫整張的）');

        // 截圖的大小不對：改畫預設背景，不丟錯
        const broken = render(fullModel('c', { format, image: { source: PHOTO, width: 0, height: 0 } }));
        assert.equal(imageCalls(broken).filter((call) => call.image === PHOTO).length, 0);
        assert.ok(inClip(broken).some((call) => call.op === 'createLinearGradient'));
    }
});

// ---------- 畫面模型 ----------

test('畫面模型多的欄位：字串去掉前後空白、沒填是空字串；labels 沒給用中文預設（含「其他職業」），給了就用給的；不是字串的欄位當成沒填', () => {
    const base = requiredModel('c', { fcName: '  Moon  ', fcTag: 'MOON', gc: ' 雙蛇黨 ', looking: ' 固定隊、部隊 ', contact: '  Discord: luna_star  ' });
    assert.deepEqual(sorted(texts(render(base))), sorted(['Luna Starweaver', 'Tiamat', 'Paladin', 'Lv 100', '部隊', 'Moon «MOON»', '大國防聯軍', '雙蛇黨', '在找什麼', '固定隊、部隊', 'Discord: luna_star', FOOT]));
    // 不是字串的欄位（null、數字、物件）當成沒填，不丟錯
    for (const bad of [null, 3, {}, []]) {
        const broken = render(requiredModel('c', { fcName: bad, gc: bad, looking: bad, contact: bad, labels: bad, backdrop: bad }));
        assert.deepEqual(sorted(texts(broken)), sorted(['Luna Starweaver', 'Tiamat', 'Paladin', 'Lv 100', FOOT]));
    }
    // 沒給 labels：其他職業的小標是中文預設
    assert.ok(hasLine(render(requiredModel('c', { subJobs: [{ name: 'Bard', icon: SUB_ICONS[1] }] })), '其他職業'));
    // 小標跟著 labels（卡片上的字跟著介面語言），只給一部分時沒給的用中文
    const english = render(fullModel('c', { labels: { fc: 'Free Company', gc: 'Grand Company', looking: 'Looking for', likes: 'Favorite content', hours: 'Play hours', subJobs: 'Other jobs', mainJob: 'Main job' }, gc: 'Maelstrom' }));
    for (const text of ['Free Company', 'Grand Company', 'Looking for', 'Favorite content', 'Play hours', 'Other jobs']) assert.ok(hasLine(english, text), text);
    assert.equal(texts(english).some((text) => text.includes('Main job')), false, '資訊卡的徽章只寫職業名稱與 Lv，沒有「主職」小標');
    const partial = render(fullModel('c', { labels: { subJobs: 'Other jobs', gc: '  ' } }));
    assert.ok(hasLine(partial, 'Other jobs') && hasLine(partial, '大國防聯軍') && hasLine(partial, '部隊'));
});

test('沒有 roundRect 的瀏覽器：改用 arcTo 畫圓角，畫出一樣的字', () => {
    const modern = render(fullModel('c'));
    const old = render(fullModel('c'), { missing: ['roundRect'] });
    assert.equal(old.calls.some((call) => call.op === 'roundRect'), false);
    assert.ok(old.calls.some((call) => call.op === 'arcTo'));
    assert.deepEqual(drawn(old).map((piece) => [piece.text, piece.x, piece.y, piece.font]), drawn(modern).map((piece) => [piece.text, piece.x, piece.y, piece.font]));
    assert.equal(old.calls.filter((call) => call.op === 'clip').length, 1);
});

// ---------- 載入字型 ----------

test('fontsFor：名字、稱號與徽章的職業名稱都是 Noto Sans TC 700，沒有 Outfit 與 Noto Serif TC；畫出來的每一段字都有列到，也不多列', () => {
    const cjk = fullModel('c', {
        name: '光之戰士',
        title: '星海の旅人',
        world: '伊弗利特（繁中服）',
        fcName: '星海觀測所',
        fcTag: '星海',
        gc: '雙蛇黨',
        looking: '固定隊、朋友',
        contact: 'Discord：luna.starweaver',
        job: { name: '繪靈法師', level: 100, icon: null },
        subJobs: [{ name: '白魔法師', icon: null }, { name: String.fromCodePoint(0x20bb7) + '野', icon: null }],
        likes: ['高難度', '幻化', 'ガンブレイカー'],
        intro: '零式開荒中，晚上常在利姆薩・羅敏薩拍照，歡迎一起刷寶圖！'.repeat(2)
    });
    const models = [fullModel('c'), fullModel('c', { format: 'portrait' }), requiredModel('c'), emptyModel('c'), cjk];
    for (const model of models) {
        const fonts = plain(CardRenderer.fontsFor(model));
        const ctx = render(model);
        assert.ok(drawn(ctx).length >= 1 && fonts.length >= 1, '至少畫了底部一列，也列了它的字型');
        const family = (font) => font.replace(/\d+(?:\.\d+)?px/, 'Npx');
        const used = new Set();
        for (const piece of drawn(ctx)) {
            used.add(family(piece.font));
            const entry = fonts.find((candidate) => family(candidate.font) === family(piece.font));
            assert.ok(entry, `「${piece.text}」用的字型 ${piece.font} 在 fontsFor 裡`);
            for (const char of Array.from(piece.text)) assert.ok(entry.text.includes(char), `${piece.font} 要載入「${char}」（${piece.text}）`);
        }
        // 每一種畫出來的字型都有一筆，fontsFor 也不多列沒用到的；一種字型一筆
        assert.deepEqual([...new Set(fonts.map((entry) => family(entry.font)))].sort(), [...used].sort());
        assert.equal(new Set(fonts.map((entry) => entry.font)).size, fonts.length);
        // 資訊卡只用 Noto Sans TC 的 500 與 700
        for (const entry of fonts) assert.match(entry.font, /^(500|700) \d+(?:\.\d+)?px "Noto Sans TC", sans-serif$/);
    }

    // 700：名字、稱號、職業名稱、小卡的值、膠囊與沒有圖示的職業的第一個字；500：伺服器、Lv、小標、時段、自我介紹、底部一列
    const bold = (model) => plain(CardRenderer.fontsFor(model)).find((entry) => entry.font.startsWith('700 ')).text;
    const regular = (model) => plain(CardRenderer.fontsFor(model)).find((entry) => entry.font.startsWith('500 ')).text;
    for (const model of [fullModel('c'), cjk]) {
        const boldText = bold(model);
        const regularText = regular(model);
        for (const text of [model.name, model.title, model.job.name, ...model.likes, model.gc, model.looking]) assert.ok(boldText.includes(text), `700 要載入「${text}」`);
        for (const text of [model.world, 'Lv 100', model.labels.subJobs, model.labels.hours, model.contact, FOOT]) assert.ok(regularText.includes(text), `500 要載入「${text}」`);
    }
    // 沒有圖示的職業畫第一個字（700）：繪靈法師的「繪」、白魔法師的「白」、罕用字的第一個字
    for (const char of ['繪', '白', String.fromCodePoint(0x20bb7)]) assert.ok(bold(cjk).includes(char), `沒有圖示的職業的第一個字「${char}」`);
    // 只有必填三項、什麼都沒填：沒有畫的字不載入
    const required = plain(CardRenderer.fontsFor(requiredModel('c'))).map((entry) => entry.text).join('');
    for (const text of ['STAR', 'Savage', '平日', '早上', '部隊', '其他職業']) assert.equal(required.includes(text), false, `只有必填三項時不載入「${text}」`);
    assert.equal(plain(CardRenderer.fontsFor(emptyModel('c'))).map((entry) => entry.text).join(''), FOOT);
});

// ---------- 畫完不留痕跡 ----------

test('畫完 context 的設定還原：save 與 restore 一樣多，font、fillStyle、globalAlpha、shadow*、imageSmoothing* 都是畫之前的值', () => {
    const ctx = createRecordingContext();
    const before = {
        font: '12px serif', fillStyle: '#123456', strokeStyle: '#654321', lineWidth: 7, globalAlpha: 0.5, textAlign: 'center', textBaseline: 'top',
        shadowColor: 'rgba(1, 2, 3, 0.5)', shadowBlur: 7, shadowOffsetX: 3, shadowOffsetY: 4, imageSmoothingEnabled: false, imageSmoothingQuality: 'medium'
    };
    Object.assign(ctx, before);
    card.CardRenderer.draw(ctx, fullModel('c', { image: { source: picture('photo'), width: 2000, height: 1000 } }));
    for (const [key, value] of Object.entries(before)) assert.equal(ctx[key], value, key);
    const saves = ctx.calls.filter((call) => call.op === 'save').length;
    assert.ok(saves >= 2);
    assert.equal(ctx.calls.filter((call) => call.op === 'restore').length, saves);
    // 畫字的時候：靠左、垂直置中、不透明
    for (const call of ctx.calls.filter((candidate) => candidate.op === 'fillText')) assert.deepEqual([call.textAlign, call.textBaseline, call.globalAlpha], ['left', 'middle', 1]);
    // 不用 translate、scale、ctx.filter、letterSpacing：座標都是畫布上的絕對座標
    assert.equal(ctx.calls.some((call) => call.op === 'translate' || call.op === 'scale'), false);
    assert.equal('filter' in ctx, false);
    assert.equal('letterSpacing' in ctx, false);
});

test('畫圖不碰 DOM，量字很寬或很窄也畫得出每一種情況（沒有 NaN、沒有丟錯）', () => {
    // 腳本是在 vm 的 context 裡執行的（不是測試自己的 node 全域），那裡沒有 document：畫圖只要碰了 document 就會丟 ReferenceError，
    // 下面每一張都畫得出來，所以沒有碰
    assert.equal(vm.runInContext('typeof document', card), 'undefined');
    const models = (format) => [requiredModel('c', { format }), emptyModel('c', { format }), fullModel('c', { format }), maxedModel('c', { script: 'wide' }, { format }), maxedModel('c', { script: 'latin' }, { format })];
    for (const format of FORMATS) {
        for (const factor of [0.5, 1, 1.7, 3]) {
            // 記錄 context 遇到不是有限的數字（NaN、Infinity）會當場丟 TypeError，所以沒丟錯就是每個座標都是正常的數字
            for (const model of models(format)) assert.doesNotThrow(() => render(model, { measure: (font, text) => fakeMeasure(font, text) * factor }), `${format} 量字 ×${factor}`);
        }
    }
});
