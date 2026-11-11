const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createRecordingContext, fakeMeasure } = require('./helpers/canvas-recorder.js');
const {
    card, SIZE, cq, ACCENT, NOTICE, INTRO, DAYS, SLOTS, SUB_ICONS, picture, requiredModel, emptyModel, fullModel, maxedModel, longestLikes,
    render, drawn, lines, textBoxes, fills, imageCalls, plain, near, inside, overlaps
} = require('./helpers/card-drawing.js');

// 風格 A「名片」（card-style-a.js）：版面數字照草稿的 .card.a（cqw：卡片寬度的 1%），這裡的每個數字都是從計畫的表直接抄來、
// 自己算一遍，不去讀 card-style-a.js 的常數
const { CardRenderer, CardPaint, CardLayout, CardStyleA } = card;
const FORMATS = ['landscape', 'portrait'];
const pick = (format, landscape, portrait) => (format === 'landscape' ? landscape : portrait);

const FOOT = `FF14.tw · ${NOTICE}`;
const SANS = '"Noto Sans TC", sans-serif';
const SERIF = '"Noto Serif TC", serif';
const fontOf = (weight, family, px) => CardPaint.fontString({ weight, family }, px);
const tintOf = (accent = ACCENT) => CardPaint.tintOf(accent, 0.55);
const rgbaOf = (hex, alpha) => CardPaint.rgbaOf(hex, alpha);
const COLORS = {
    text: '#f3f1fa',
    world: 'rgba(243,241,250,0.78)',
    level: 'rgba(243,241,250,0.7)',
    label: 'rgba(243,241,250,0.55)',
    hoursLabel: 'rgba(243,241,250,0.6)',
    hoursOff: 'rgba(255,255,255,0.12)',
    foot: 'rgba(243,241,250,0.58)'
};
const hairline = (format) => pick(format, 0.125, 0.185);
const LINE_NORMAL = CardPaint.LINE_NORMAL;

// 照片框與資訊欄的範圍（canvas 像素）：內距 3／4cqw；橫版照片在左，寬是內容寬的 37%，和資訊欄隔 3cqw；
// 直版照片在上，高是內容高的 43%，和資訊欄隔 3.6cqw
function boxes(format) {
    const { width, height } = SIZE[format];
    const pad = cq(format, pick(format, 3, 4));
    const gap = cq(format, pick(format, 3, 3.6));
    const contentWidth = width - 2 * pad;
    const contentHeight = height - 2 * pad;
    if (format === 'landscape') {
        const photoWidth = contentWidth * 0.37;
        return {
            photo: { x: pad, y: pad, width: photoWidth, height: contentHeight },
            info: { x: pad + photoWidth + gap, y: pad, width: contentWidth - photoWidth - gap, height: contentHeight }
        };
    }
    const photoHeight = contentHeight * 0.43;
    return {
        photo: { x: pad, y: pad, width: contentWidth, height: photoHeight },
        info: { x: pad, y: pad + photoHeight + gap, width: contentWidth, height: contentHeight - photoHeight - gap }
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

// 自我介紹的每一行：字級 1.45／2.15cqw、顏色 #f3f1fa（伺服器的字級橫版也是 1.45cqw，但顏色不同）
const isIntro = (line, format) => line.fillStyle === COLORS.text && Math.abs(line.px - cq(format, pick(format, 1.45, 2.15))) < 0.011;
const introLines = (ctx, format) => lines(ctx).filter((line) => isIntro(line, format));
// 水平的漸層（細線）
const horizontal = (shape) => shape.kind === 'fillRect' && shape.fillStyle !== null && typeof shape.fillStyle === 'object' && shape.fillStyle.kind === 'linear' && shape.fillStyle.args[1] === shape.fillStyle.args[3];
const rules = (ctx) => fills(ctx).filter(horizontal);
const hourCells = (ctx) => fills(ctx).filter((shape) => shape.kind === 'roundRect' && (shape.fillStyle === ACCENT || shape.fillStyle === COLORS.hoursOff));
const chipShapes = (ctx) => fills(ctx).filter((shape) => shape.kind === 'roundRect' && shape.fillStyle === rgbaOf(ACCENT, 0.34));
const wholeCardGradient = (ctx, format) => ctx.calls.find((call) => call.op === 'createLinearGradient' && call.args[0] === 0 && call.args[1] === 0 && call.args[2] === SIZE[format].width && call.args[3] === SIZE[format].height);
const distinct = (numbers) => [...new Set(numbers.map((n) => Math.round(n * 100) / 100))].sort((a, b) => a - b);

// ---------- 模組與照片框 ----------

test('CardStyleA：凍結，只有 draw、texts、photoBox；載入時只多掛一個全域；renderer 認得 style: a，不認得的還是海報', () => {
    assert.equal(Object.isFrozen(CardStyleA), true);
    assert.deepEqual(Object.keys(CardStyleA).sort(), ['draw', 'photoBox', 'texts']);

    // card-style-a.js 要先載入 card-layout.js、card-state.js 與 card-paint.js；載入它只多掛一個全域，和頁面其他腳本的名稱不會撞到
    const context = vm.createContext({});
    context.window = context;
    const run = (file) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'tools/character-card', file), 'utf8'), context, { filename: file });
    for (const file of ['card-layout.js', 'card-state.js', 'card-paint.js']) run(file);
    const before = new Set(Object.keys(context));
    run('card-style-a.js');
    assert.deepEqual(Object.keys(context).filter((name) => !before.has(name)), ['CardStyleA']);

    const poster = plain(render(fullModel('b')).calls);
    const nameCard = plain(render(fullModel('a')).calls);
    assert.notDeepEqual(nameCard, poster, 'style: a 畫的是名片，不是海報');
    for (const style of [undefined, 'zzz', 'constructor', '__proto__']) {
        assert.deepEqual(plain(render(fullModel(style)).calls), poster, `style 是 ${String(style)} 時畫海報`);
    }
});

test('photoBox：A 橫版在左、直版在上', () => {
    const expected = {
        landscape: { x: 36, y: 36, width: 417.36, height: 603 },
        portrait: { x: 43.2, y: 43.2, width: 993.6, height: 543.348 }
    };
    for (const format of FORMATS) {
        const box = plain(CardRenderer.photoBox('a', format));
        assert.deepEqual(Object.keys(box).sort(), ['height', 'width', 'x', 'y']);
        for (const key of Object.keys(expected[format])) near(box[key], expected[format][key], `${format} 的 ${key}`, 0.01);
        // 這支測試自己算的範圍（其他測試用它）和任務書的數字一樣
        for (const key of Object.keys(expected[format])) near(boxes(format).photo[key], expected[format][key], `boxes(${format}).photo.${key}`, 0.01);
        assert.deepEqual(plain(CardStyleA.photoBox(format)), box);
        assert.notEqual(CardStyleA.photoBox(format), CardStyleA.photoBox(format), '每次回傳新的物件');
        assert.notEqual(CardRenderer.photoBox('a', format), CardRenderer.photoBox('a', format));
    }
    assert.deepEqual(plain(CardRenderer.photoBox('a', 'zzz')), plain(CardRenderer.photoBox('a', 'landscape')), '不認得的版型當成橫版');
    // 橫版的照片框是直的、直版是橫的；照片框的右邊與資訊欄隔 3cqw、下面與資訊欄隔 3.6cqw
    assert.ok(boxes('landscape').photo.height > boxes('landscape').photo.width);
    assert.ok(boxes('portrait').photo.width > boxes('portrait').photo.height);
    near(boxes('landscape').info.x - (boxes('landscape').photo.x + boxes('landscape').photo.width), cq('landscape', 3));
    near(boxes('portrait').info.y - (boxes('portrait').photo.y + boxes('portrait').photo.height), cq('portrait', 3.6));
});

// ---------- 只有必填三項、什麼都沒填 ----------

test('只有必填三項：照片框、名字、伺服器、主職與「Lv 100 · 主職」、底部一列；沒有稱號、小標、膠囊、時段、自我介紹與聯絡方式', () => {
    for (const format of FORMATS) {
        const { photo, info } = boxes(format);
        const ctx = render(requiredModel('a', { format }));
        assert.deepEqual(sorted(texts(ctx)), sorted(['Luna Starweaver', 'Tiamat', 'Paladin', 'Lv 100 · 主職', FOOT]));

        // 名字是襯線字 700（4.6／6.6cqw）、#f3f1fa，伺服器 500（1.45／2.1cqw）、淡白，都靠資訊欄的左邊
        const name = lineOf(ctx, 'Luna Starweaver');
        assert.equal(name.font, fontOf(700, SERIF, cq(format, pick(format, 4.6, 6.6))));
        assert.equal(name.fillStyle, COLORS.text);
        near(name.x, info.x);
        const world = lineOf(ctx, 'Tiamat');
        assert.equal(world.font, fontOf(500, SANS, cq(format, pick(format, 1.45, 2.1))));
        assert.equal(world.fillStyle, COLORS.world);
        near(world.x, info.x);

        // 圖：只有主職的圖示一張，5／7.4cqw 的正方形
        const pictures = imageCalls(ctx);
        assert.equal(pictures.length, 1);
        assert.equal(pictures[0].image.picture, 'pld');
        near(pictures[0].w, cq(format, pick(format, 5, 7.4)));
        near(pictures[0].h, cq(format, pick(format, 5, 7.4)));
        assert.equal(pictures[0].call.globalAlpha, 1);

        // 沒有膠囊、時段格子、自我介紹的線；照片框的光環與照片還是有
        assert.equal(chipShapes(ctx).length, 0);
        assert.equal(hourCells(ctx).length, 0);
        assert.equal(fills(ctx).filter((shape) => shape.kind === 'fillRect' && shape.fillStyle === ACCENT).length, 0, '沒有自我介紹左邊的線');
        assert.equal(ctx.calls.filter((call) => call.op === 'clip').length, 1, '照片框裡的東西先 clip');
        assert.equal(rules(ctx).length, 1, '名字與伺服器下面的細線');
        near(rules(ctx)[0].x, info.x);
        near(rules(ctx)[0].w, info.width);
        near(rules(ctx)[0].h, cq(format, hairline(format)));
        // 沒填的欄位什麼字都不畫：所有的字都在資訊欄裡，不在照片框裡
        for (const box of textBoxes(ctx)) {
            assert.ok(inside(box, info), `「${box.text}」在資訊欄裡`);
            assert.equal(overlaps(box, { left: photo.x, right: photo.x + photo.width, top: photo.y, bottom: photo.y + photo.height }), false, `「${box.text}」不在照片框裡`);
        }
        // 底部一列貼著資訊欄的底（右邊是「FF14.tw · SE 版權字」，靠右）
        const foot = lineOf(ctx, FOOT);
        near(foot.y + foot.px * LINE_NORMAL / 2, info.y + info.height, '底部一列貼著資訊欄的底', 0.02);
        near(foot.x + foot.width, info.x + info.width, '右邊貼著資訊欄的右緣');
    }
});

test('什麼都沒填：只有照片框裡的預設背景與底部一列', () => {
    for (const format of FORMATS) {
        const { photo, info } = boxes(format);
        const ctx = render(emptyModel('a', { format }));
        assert.deepEqual(texts(ctx), [FOOT]);
        assert.equal(imageCalls(ctx).length, 0);
        assert.equal(rules(ctx).length, 0, '名字、伺服器、稱號都沒有時沒有細線');
        assert.equal(chipShapes(ctx).length + hourCells(ctx).length, 0);
        // 照片框裡是預設背景：漸層從照片框左上到右下
        const gradient = ctx.calls.find((call) => call.op === 'createLinearGradient' && Math.abs(call.args[0] - photo.x) < 1e-6 && Math.abs(call.args[1] - photo.y) < 1e-6);
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

test('全部填滿：每個欄位都畫出來，包括海報不畫的部隊、大國防聯軍、在找什麼與聯絡方式', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const ctx = render(fullModel('a', { format }));
        const found = lines(ctx);
        const intro = found.filter((line) => isIntro(line, format));
        assert.ok(intro.length >= 1 && intro.length <= 2, '自我介紹最多 2 行');
        assert.equal(intro.map((line) => line.text).join(' '), INTRO);
        const rest = found.filter((line) => !isIntro(line, format)).map((line) => line.text);
        assert.deepEqual(sorted(rest), sorted([
            'Starfarer',
            'Luna Starweaver', 'Tiamat',
            'Paladin', 'Lv 100 · 主職',
            '部隊', '大國防聯軍', '在找什麼', 'Moonlit Garden «MOON»', '雙蛇黨', '固定隊、部隊',
            '喜歡的內容', 'Savage', 'Glamour', 'Photo', 'Treasure', 'Housing', 'PvP',
            '遊玩時段', ...DAYS, ...SLOTS,
            'Discord: luna_star', FOOT
        ]));

        // 稱號：原樣不轉大寫、500、1.35／1.9cqw、字距 0.22em 一個字一個字畫、淡色
        const title = lineOf(ctx, 'Starfarer');
        assert.equal(title.font, fontOf(500, SANS, cq(format, pick(format, 1.35, 1.9))));
        assert.equal(title.fillStyle, tintOf());
        const glyphs = drawn(ctx).filter((piece) => piece.y === title.y && piece.font === title.font && piece.fillStyle === title.fillStyle);
        assert.equal(glyphs.length, 9, '一個字一個字畫');
        for (let i = 0; i + 1 < glyphs.length; i++) near(glyphs[i + 1].x - glyphs[i].x, glyphs[i].width + 0.22 * glyphs[i].px, `稱號第 ${i + 1} 與 ${i + 2} 個字的間距`);
        near(title.x, info.x);

        // 小標：500、1.02／1.5cqw、字距 0.14em、rgba(243,241,250,0.55)；值：500、1.4／2.05cqw、#f3f1fa
        for (const label of ['部隊', '大國防聯軍', '在找什麼', '喜歡的內容', '遊玩時段']) {
            const line = lineOf(ctx, label);
            assert.equal(line.font, fontOf(500, SANS, cq(format, pick(format, 1.02, 1.5))), label);
            assert.equal(line.fillStyle, COLORS.label, label);
        }
        const gcLabel = lineOf(ctx, '大國防聯軍');
        const glyphsOfLabel = drawn(ctx).filter((piece) => piece.y === gcLabel.y && piece.fillStyle === COLORS.label && piece.x >= gcLabel.x - 1e-6 && piece.x < gcLabel.x + gcLabel.width);
        assert.equal(glyphsOfLabel.length, 5, '小標也是一個字一個字畫');
        for (let i = 0; i + 1 < glyphsOfLabel.length; i++) near(glyphsOfLabel[i + 1].x - glyphsOfLabel[i].x, glyphsOfLabel[i].width + 0.14 * glyphsOfLabel[i].px, '小標的字距 0.14em');
        for (const value of ['Moonlit Garden «MOON»', '雙蛇黨', '固定隊、部隊']) {
            const line = lineOf(ctx, value);
            assert.equal(line.font, fontOf(500, SANS, cq(format, pick(format, 1.4, 2.05))), value);
            assert.equal(line.fillStyle, COLORS.text, value);
        }

        // 膠囊：6 個，500、1.22／1.8cqw、#f3f1fa；底 rgba(accent, 0.34)、邊 rgba(淡色, 0.45)
        assert.equal(chipShapes(ctx).length, 6);
        const chipStrokes = ctx.calls.filter((call) => call.op === 'stroke' && call.strokeStyle === rgbaOf(tintOf(), 0.45));
        assert.equal(chipStrokes.length, 6);
        for (const label of ['Savage', 'Glamour', 'Photo', 'Treasure', 'Housing', 'PvP']) {
            const line = lineOf(ctx, label);
            assert.equal(line.font, fontOf(500, SANS, cq(format, pick(format, 1.22, 1.8))), label);
            assert.equal(line.fillStyle, COLORS.text, label);
        }

        // 時段格子 8 格，有選的 4 格是 accent、沒選的是 rgba(255,255,255,0.12)；欄名與列名 500、1.02／1.5cqw、rgba(243,241,250,0.6)
        const cells = hourCells(ctx);
        assert.equal(cells.length, 8);
        assert.equal(cells.filter((cell) => cell.fillStyle === ACCENT).length, 4);
        near(cells[0].h, cq(format, pick(format, 1.15, 1.7)), '格高');
        near(cells[0].r, cq(format, 0.35), '格子的圓角');
        for (const label of [...DAYS, ...SLOTS]) {
            assert.equal(lineOf(ctx, label).fillStyle, COLORS.hoursLabel, label);
            assert.equal(lineOf(ctx, label).font, fontOf(500, SANS, cq(format, pick(format, 1.02, 1.5))), label);
        }

        // 職業：圖示一張、名稱 700、2／2.9cqw、#f3f1fa，下面一行 500、1.3／1.9cqw、rgba(243,241,250,0.7)
        assert.equal(lineOf(ctx, 'Paladin').font, fontOf(700, SANS, cq(format, pick(format, 2, 2.9))));
        assert.equal(lineOf(ctx, 'Paladin').fillStyle, COLORS.text);
        assert.equal(lineOf(ctx, 'Lv 100 · 主職').font, fontOf(500, SANS, cq(format, pick(format, 1.3, 1.9))));
        assert.equal(lineOf(ctx, 'Lv 100 · 主職').fillStyle, COLORS.level);

        // 三個其他職業的圖示各畫一次，畫的時候 globalAlpha 是 0.88，主職那一張是 1
        for (const icon of SUB_ICONS) {
            const calls = imageCalls(ctx).filter((call) => call.image === icon);
            assert.equal(calls.length, 1, `其他職業的圖示 ${icon.picture} 畫了一次`);
            assert.equal(calls[0].call.globalAlpha, 0.88);
            near(calls[0].w, cq(format, pick(format, 2.9, 4.2)));
            near(calls[0].h, cq(format, pick(format, 2.9, 4.2)));
        }
        assert.equal(imageCalls(ctx).filter((call) => call.image.picture === 'pld')[0].call.globalAlpha, 1);
        assert.equal(imageCalls(ctx).length, 4);

        // 自我介紹：左邊一條 0.3cqw 寬、和字一樣高的 accent；字從線右邊再隔 1.2cqw 開始，500、1.45／2.15cqw、行高 1.55
        const bar = fills(ctx).find((shape) => shape.kind === 'fillRect' && shape.fillStyle === ACCENT);
        assert.ok(bar, '自我介紹左邊的線');
        near(bar.x, info.x);
        near(bar.w, cq(format, 0.3));
        near(bar.h, intro.length * cq(format, pick(format, 1.45, 2.15)) * 1.55, '線和字一樣高');
        for (const line of intro) {
            near(line.x, info.x + cq(format, 0.3 + 1.2), '字從線右邊再隔 1.2cqw 開始');
            assert.equal(line.font, fontOf(500, SANS, cq(format, pick(format, 1.45, 2.15))));
        }
        near(intro[0].y, bar.y + cq(format, pick(format, 1.45, 2.15)) * 1.55 / 2, '第一行的中線');

        // 底部一列：500、1.05／1.5cqw、rgba(243,241,250,0.58)；左邊聯絡方式、右邊「FF14.tw · SE 版權字」
        for (const text of ['Discord: luna_star', FOOT]) {
            assert.equal(lineOf(ctx, text).font, fontOf(500, SANS, cq(format, pick(format, 1.05, 1.5))));
            assert.equal(lineOf(ctx, text).fillStyle, COLORS.foot);
        }
        near(lineOf(ctx, 'Discord: luna_star').x, info.x);

        // 由上到下：稱號、名字、伺服器、職業、小標、喜歡的內容的小標、自我介紹、底部一列
        const order = [title, lineOf(ctx, 'Luna Starweaver'), lineOf(ctx, 'Tiamat'), lineOf(ctx, 'Paladin'), lineOf(ctx, '部隊'), lineOf(ctx, '喜歡的內容'), intro[0], lineOf(ctx, FOOT)];
        for (let i = 0; i + 1 < order.length; i++) assert.ok(order[i].y < order[i + 1].y, `${order[i].text} 在 ${order[i + 1].text} 上面`);
    }
});

test('區塊的位置：資訊欄由上往下疊，區塊之間隔 1.25／1.9cqw，行高照草稿（名字 1.12、職業名稱 1.2，沒寫的 1.45 倍字級）', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const ctx = render(fullModel('a', { format }));
        const gap = cq(format, pick(format, 1.25, 1.9));
        const px = (landscape, portrait) => cq(format, pick(format, landscape, portrait));
        let top = info.y;

        // 稱號
        const title = lineOf(ctx, 'Starfarer');
        near(title.y, top + px(1.35, 1.9) * LINE_NORMAL / 2, '稱號的中線');
        top += px(1.35, 1.9) * LINE_NORMAL + gap;
        // 名字：行高 1.12
        const name = lineOf(ctx, 'Luna Starweaver');
        near(name.y, top + px(4.6, 6.6) * 1.12 / 2, '名字的中線');
        top += px(4.6, 6.6) * 1.12 + gap;
        // 伺服器
        near(lineOf(ctx, 'Tiamat').y, top + px(1.45, 2.1) * LINE_NORMAL / 2, '伺服器的中線');
        top += px(1.45, 2.1) * LINE_NORMAL + gap;
        // 細線：高 hairline、寬是資訊欄寬，橫向漸層從淡色 0.7 到 0
        const rule = rules(ctx)[0];
        near(rule.y, top, '細線的上緣');
        near(rule.h, cq(format, hairline(format)), '細線的高');
        const gradient = rule.fillStyle;
        near(gradient.args[0], info.x);
        near(gradient.args[2], info.x + info.width);
        assert.deepEqual(plain(gradient.stops), [[0, rgbaOf(tintOf(), 0.7)], [1, rgbaOf(tintOf(), 0)]]);
        top += cq(format, hairline(format)) + gap;
        // 職業列：高度是主職圖示 5／7.4cqw，圖示靠資訊欄的左邊、和列一樣高
        const icon = imageCalls(ctx).find((call) => call.image.picture === 'pld');
        near(icon.x, info.x);
        near(icon.y, top, '主職圖示的上緣');
        const iconSize = px(5, 7.4);
        top += iconSize + gap;
        // 三欄資訊：小標一行、值一行（這份資料的值都放得進一欄）
        near(lineOf(ctx, '部隊').y, top + px(1.02, 1.5) * LINE_NORMAL / 2, '小標的中線');
        near(lineOf(ctx, 'Moonlit Garden «MOON»').y, top + px(1.02, 1.5) * LINE_NORMAL + px(1.4, 2.05) * LINE_NORMAL / 2, '值的中線');
        top += px(1.02, 1.5) * LINE_NORMAL + px(1.4, 2.05) * LINE_NORMAL + gap;
        // 兩欄：小標下面直接接內容
        near(lineOf(ctx, '喜歡的內容').y, top + px(1.02, 1.5) * LINE_NORMAL / 2, '兩欄的小標');
        const chips = chipShapes(ctx);
        near(Math.min(...chips.map((chip) => chip.y)), top + px(1.02, 1.5) * LINE_NORMAL, '膠囊緊接在小標下面');
    }
});

// ---------- 職業列 ----------

test('職業列：主職圖示、兩行字和圖示垂直置中；其他職業的圖示靠右、間隔 0.8cqw；放不下時職業那兩行字一起縮小，和其他職業至少隔 1.4cqw', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const px = (landscape, portrait) => cq(format, pick(format, landscape, portrait));
        const ctx = render(fullModel('a', { format }));
        const icon = imageCalls(ctx).find((call) => call.image.picture === 'pld');
        const iconCenter = icon.y + icon.h / 2;
        const name = lineOf(ctx, 'Paladin');
        const level = lineOf(ctx, 'Lv 100 · 主職');

        // 圖示到名稱隔 1cqw；兩行字（名稱行高 1.2、下面一行 1.45 倍字級）合起來和圖示垂直置中
        near(name.x, icon.x + icon.w + cq(format, 1), '名稱在圖示右邊隔 1cqw');
        near(level.x, name.x, '兩行字靠左對齊');
        const nameHeight = px(2, 2.9) * 1.2;
        const levelHeight = px(1.3, 1.9) * LINE_NORMAL;
        const blockTop = name.y - nameHeight / 2;
        near(level.y, blockTop + nameHeight + levelHeight / 2, '第二行緊接在第一行下面');
        near((blockTop + blockTop + nameHeight + levelHeight) / 2, iconCenter, '兩行字和圖示垂直置中');

        // 其他職業：圖示靠資訊欄的右邊，間隔 0.8cqw，和圖示的中線同一條
        const subs = SUB_ICONS.map((sub) => imageCalls(ctx).find((call) => call.image === sub));
        const size = px(2.9, 4.2);
        near(subs[2].x + subs[2].w, info.x + info.width, '最右邊的圖示貼著資訊欄的右緣');
        near(subs[1].x + subs[1].w + cq(format, 0.8), subs[2].x, '圖示間隔 0.8cqw');
        near(subs[0].x + subs[0].w + cq(format, 0.8), subs[1].x);
        for (const sub of subs) near(sub.y + size / 2, iconCenter, '其他職業的圖示和主職圖示同一條中線');
        assert.ok(name.x + name.width < subs[0].x - cq(format, 1.4), '名稱與其他職業的圖示隔得開');

        // 沒有其他職業：只有主職的圖示，字照舊
        const alone = render(fullModel('a', { format, subJobs: [] }));
        assert.equal(imageCalls(alone).length, 1);
        near(lineOf(alone, 'Paladin').x, name.x);
    }

    // 職業名稱太長（兩邊放不下）：兩行字一起縮小同一個倍數，和其他職業的圖示至少隔 1.4cqw
    for (const format of FORMATS) {
        const px = (landscape, portrait) => cq(format, pick(format, landscape, portrait));
        const long = '寬'.repeat(25);
        const ctx = render(fullModel('a', { format, job: { name: long, level: 100, icon: picture('pld') } }));
        const name = lineOf(ctx, long);
        const level = lineOf(ctx, 'Lv 100 · 主職');
        const nameScale = name.px / px(2, 2.9);
        const levelScale = level.px / px(1.3, 1.9);
        assert.ok(nameScale < 1 && nameScale >= 0.3, `名稱縮小了（${nameScale}）`);
        near(nameScale, levelScale, '兩行字縮一樣多', 0.01);
        const firstSub = Math.min(...SUB_ICONS.map((sub) => imageCalls(ctx).find((call) => call.image === sub).x));
        assert.ok(name.x + name.width <= firstSub - cq(format, 1.4) + 0.5, `名稱的右邊與其他職業的圖示至少隔 1.4cqw（${name.x + name.width}、${firstSub}）`);
        assert.ok(name.x + name.width >= firstSub - cq(format, 1.4) - 2, '縮得剛好放得下，沒有縮得比需要的多');
        // 兩行字還是和圖示垂直置中
        const icon = imageCalls(ctx).find((call) => call.image.picture === 'pld');
        const nameHeight = name.px * 1.2;
        const levelHeight = level.px * LINE_NORMAL;
        near((name.y - nameHeight / 2 + level.y + levelHeight / 2) / 2, icon.y + icon.h / 2, '縮小之後也垂直置中', 0.05);
    }

    // 沒有其他職業時，同一個名稱放得下，不縮
    const noSubs = render(fullModel('a', { job: { name: '寬'.repeat(25), level: 100, icon: picture('pld') }, subJobs: [] }));
    near(lineOf(noSubs, '寬'.repeat(25)).px, cq('landscape', 2), '沒有其他職業就不縮');
});

// ---------- 三欄資訊 ----------

test('部隊與在找什麼的值：只填名稱是「Moonlit Garden」、只填簡稱是「«MOON»」；只填大國防聯軍時它在第一欄；在找什麼只有一個時就是那一個', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        // 部隊只填名稱：不留空的「«»」；只填簡稱：只有「«MOON»」
        const nameOnly = render(fullModel('a', { format, fcName: 'Moonlit Garden', fcTag: '' }));
        assert.ok(hasLine(nameOnly, 'Moonlit Garden'));
        assert.equal(texts(nameOnly).some((text) => text.includes('«') || text.includes('»')), false);
        const tagOnly = render(fullModel('a', { format, fcName: '', fcTag: 'MOON' }));
        assert.ok(hasLine(tagOnly, '«MOON»'));
        assert.equal(texts(tagOnly).some((text) => text.includes('Moonlit')), false);
        assert.ok(hasLine(tagOnly, '部隊'), '只填簡稱也有「部隊」小標');
        const both = render(fullModel('a', { format }));
        assert.ok(hasLine(both, 'Moonlit Garden «MOON»'));
        // 只有空白也當成沒填
        const blank = render(fullModel('a', { format, fcName: '   ', fcTag: ' ' }));
        assert.equal(hasLine(blank, '部隊'), false);

        // 只填大國防聯軍：只有它一欄，在第一欄（x 是資訊欄的左邊），沒有「部隊」「在找什麼」
        const gcOnly = render(fullModel('a', { format, fcName: '', fcTag: '', looking: '' }));
        assert.ok(hasLine(gcOnly, '大國防聯軍') && hasLine(gcOnly, '雙蛇黨'));
        assert.equal(hasLine(gcOnly, '部隊') || hasLine(gcOnly, '在找什麼'), false);
        near(lineOf(gcOnly, '大國防聯軍').x, info.x, '小標在第一欄');
        near(lineOf(gcOnly, '雙蛇黨').x, info.x, '值在第一欄');

        // 在找什麼只有一個：就是那一個，沒有多出來的「、」
        const one = render(fullModel('a', { format, looking: '朋友' }));
        assert.ok(hasLine(one, '朋友'));
        assert.equal(texts(one).some((text) => text.includes('、')), false);

        // 三欄三等分、中間隔 1.2cqw；有值的從左邊那欄排（欄寬照舊是三等分）
        const column = (info.width - 2 * cq(format, 1.2)) / 3;
        const labelX = (ctx, label) => lineOf(ctx, label).x;
        near(labelX(both, '部隊'), info.x);
        near(labelX(both, '大國防聯軍'), info.x + column + cq(format, 1.2));
        near(labelX(both, '在找什麼'), info.x + 2 * (column + cq(format, 1.2)));
        const compact = render(fullModel('a', { format, gc: '' }));
        near(labelX(compact, '部隊'), info.x);
        near(labelX(compact, '在找什麼'), info.x + column + cq(format, 1.2), '沒填的那一欄拿掉，剩下的從左邊排');
        assert.equal(hasLine(compact, '大國防聯軍'), false);
        // 三個都沒有：整列拿掉
        const none = render(fullModel('a', { format, fcName: '', fcTag: '', gc: '', looking: '' }));
        assert.deepEqual([hasLine(none, '部隊'), hasLine(none, '大國防聯軍'), hasLine(none, '在找什麼')], [false, false, false]);
    }

    // 值很長：最多 2 行，超過的接「…」，每一行都在自己那一欄裡（大國防聯軍在第二欄）
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const column = (info.width - 2 * cq(format, 1.2)) / 3;
        const second = info.x + column + cq(format, 1.2);
        const ctx = render(fullModel('a', { format, gc: '寬'.repeat(80) }));
        const valueLines = lines(ctx).filter((line) => line.font === fontOf(500, SANS, cq(format, pick(format, 1.4, 2.05))) && line.fillStyle === COLORS.text && line.x >= second - 1e-6 && line.x < second + 1);
        assert.equal(valueLines.length, 2, `${format}：值最多 2 行`);
        assert.ok(valueLines[1].text.endsWith('…'), `${format}：超過 2 行的接「…」`);
        assert.equal(valueLines[0].text.endsWith('…'), false);
        for (const line of valueLines) assert.ok(line.x + line.width <= second + column + 1e-6, `${format}：「${line.text}」在自己那一欄裡`);
        // 名稱與簡稱加起來太長（20 + 5 個字）：欄位放得下就是 1～2 行，放不下也最多 2 行
        const fc = render(fullModel('a', { format, fcName: '寬'.repeat(20), fcTag: '寬寬寬寬寬' }));
        const fcLines = lines(fc).filter((line) => line.font === fontOf(500, SANS, cq(format, pick(format, 1.4, 2.05))) && line.fillStyle === COLORS.text && line.x < second - 1);
        assert.ok(fcLines.length >= 1 && fcLines.length <= 2, `${format}：部隊的值最多 2 行`);
    }
});

// ---------- 兩欄：喜歡的內容與遊玩時段 ----------

test('沒填的整塊不畫、下面的往上靠', () => {
    for (const format of FORMATS) {
        const px = (landscape, portrait) => cq(format, pick(format, landscape, portrait));
        const gap = px(1.25, 1.9);
        const base = render(fullModel('a', { format }));
        const name = lineOf(base, 'Luna Starweaver');
        const labelHeight = px(1.02, 1.5) * LINE_NORMAL;

        // 稱號沒填：稱號不見，名字往上靠，剛好少一個稱號的高度加一個間距
        const noTitle = render(fullModel('a', { format, title: '' }));
        assert.equal(hasLine(noTitle, 'Starfarer'), false);
        near(name.y - lineOf(noTitle, 'Luna Starweaver').y, px(1.35, 1.9) * LINE_NORMAL + gap, '名字往上靠');
        // 伺服器沒填：下面的往上靠
        const noWorld = render(fullModel('a', { format, world: '' }));
        assert.equal(hasLine(noWorld, 'Tiamat'), false);
        near(lineOf(base, 'Paladin').y - lineOf(noWorld, 'Paladin').y, px(1.45, 2.1) * LINE_NORMAL + gap, '職業列往上靠');
        near(lineOf(base, 'Luna Starweaver').y, lineOf(noWorld, 'Luna Starweaver').y, '上面的不動');
        // 名字、伺服器、稱號都沒有：細線也拿掉
        assert.equal(rules(render(fullModel('a', { format, title: '', name: '', world: '' }))).length, 0);

        // 三欄資訊沒填：整列不見，兩欄的小標往上靠一列的高度（小標加一行值）加一個間距
        const noMeta = render(fullModel('a', { format, fcName: '', fcTag: '', gc: '', looking: '' }));
        near(lineOf(base, '喜歡的內容').y - lineOf(noMeta, '喜歡的內容').y, labelHeight + px(1.4, 2.05) * LINE_NORMAL + gap, '兩欄往上靠');

        // 喜歡的內容沒填：小標、膠囊不見；時段照右欄的寬、靠左（欄寬的規則見下一個測試）
        const noLikes = render(fullModel('a', { format, likes: [] }));
        for (const text of ['喜歡的內容', 'Savage', 'PvP']) assert.equal(hasLine(noLikes, text), false, text);
        assert.equal(chipShapes(noLikes).length, 0);
        near(lineOf(noLikes, '遊玩時段').x, boxes(format).info.x, '時段靠左');
        // 時段沒填：小標、欄名、列名、格子都不見
        const noHours = render(fullModel('a', { format, hours: { days: DAYS, slots: SLOTS, on: new Set() } }));
        for (const text of ['遊玩時段', ...DAYS, ...SLOTS]) assert.equal(hasLine(noHours, text), false, text);
        assert.equal(hourCells(noHours).length, 0);
        // 兩欄都沒填：整列不見，自我介紹往上靠一整列的高度（兩邊較高的那一邊）加一個間距
        const noColumns = render(fullModel('a', { format, likes: [], hours: { days: DAYS, slots: SLOTS, on: new Set() } }));
        const chipRows = distinct(chipShapes(base).map((chip) => chip.y)).length;
        const chipHeight = px(1.22, 1.8) * LINE_NORMAL + 2 * px(0.3, 0.45) + 2 * cq(format, hairline(format));
        const likesHeight = labelHeight + chipRows * chipHeight + (chipRows - 1) * cq(format, 0.7);
        const hoursHeight = labelHeight + 3 * px(1.02, 1.5) * LINE_NORMAL + 2 * px(0.45, 0.6);
        near(introLines(base, format)[0].y - introLines(noColumns, format)[0].y, Math.max(likesHeight, hoursHeight) + gap, '自我介紹往上靠一整列的高度加一個間距', 0.05);

        // 自我介紹沒填：線與字都不見
        const noIntro = render(fullModel('a', { format, intro: '' }));
        assert.equal(introLines(noIntro, format).length, 0);
        assert.equal(fills(noIntro).filter((shape) => shape.kind === 'fillRect' && shape.fillStyle === ACCENT).length, 0);
        // 聯絡方式沒填：只有右邊的「FF14.tw · SE 版權字」，還是靠右
        const noContact = render(fullModel('a', { format, contact: '' }));
        assert.equal(hasLine(noContact, 'Discord: luna_star'), false);
        near(lineOf(noContact, FOOT).x + lineOf(noContact, FOOT).width, boxes(format).info.x + boxes(format).info.width);
        // 其他職業沒填：只有主職的圖示
        assert.equal(imageCalls(render(fullModel('a', { format, subJobs: [] }))).length, 1);
    }
});

test('兩欄的寬度：只有喜歡的內容時膠囊可以排到 1.3 那一欄外面，只有時段時格子照右欄的寬靠左', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const room = info.width - cq(format, 2);
        const leftWidth = (room * 1.3) / 2.3;
        const rightWidth = room / 2.3;
        const wideLikes = ['W'.repeat(14), 'V'.repeat(14), 'X'.repeat(14)]; // 一顆約 150px（橫版），三顆排不進左欄、排得進整列
        const hoursOff = { days: DAYS, slots: SLOTS, on: new Set() };

        // 兩邊都有：左欄 1.3、右欄 1，中間隔 2cqw
        const both = render(fullModel('a', { format, likes: wideLikes }));
        const bothRight = Math.min(...hourCells(both).map((cell) => cell.x));
        near(lineOf(both, '喜歡的內容').x, info.x);
        near(lineOf(both, '遊玩時段').x, info.x + leftWidth + cq(format, 2), '右欄在左欄右邊隔 2cqw');
        near(Math.max(...hourCells(both).map((cell) => cell.x + cell.w)), info.x + info.width, '時段格子貼著資訊欄的右緣', 0.02);
        assert.ok(bothRight > info.x + leftWidth);
        for (const chip of chipShapes(both)) assert.ok(chip.x + chip.w <= info.x + leftWidth + 1e-6, '兩邊都有時膠囊都在左欄裡');
        // 只有喜歡的內容：用整列的寬，膠囊可以排到 1.3 那一欄外面
        const likesOnly = render(fullModel('a', { format, likes: wideLikes, hours: hoursOff }));
        const rightEdge = Math.max(...chipShapes(likesOnly).map((chip) => chip.x + chip.w));
        assert.equal(chipShapes(likesOnly).length, 3);
        assert.ok(rightEdge > info.x + leftWidth, `膠囊排到左欄外面（${rightEdge} > ${info.x + leftWidth}）`);
        assert.ok(rightEdge <= info.x + info.width + 1e-6);
        // 只有時段：格子照右欄的寬（兩邊都有時右欄的寬），靠左
        const hoursOnly = render(fullModel('a', { format, likes: [] }));
        near(lineOf(hoursOnly, '遊玩時段').x, info.x, '小標靠左');
        const cells = hourCells(hoursOnly);
        near(Math.max(...cells.map((cell) => cell.x + cell.w)) - info.x, rightWidth, '格子整塊的寬是右欄的寬', 0.02);
        near(Math.min(...DAYS.map((day) => lineOf(hoursOnly, day).x)), info.x, '列名靠資訊欄的左邊');
    }
});

test('英文、日文選滿 6 個最長的喜歡的內容：兩種版型 6 個膠囊都畫出來，字級不小於原本的 60%', () => {
    for (const lang of ['en', 'ja']) {
        const likes = longestLikes(lang);
        assert.equal(likes.length, 6);
        for (const format of FORMATS) {
            const { info } = boxes(format);
            const ctx = render(fullModel('a', { format, likes }));
            const room = info.width - cq(format, 2);
            const leftEdge = info.x + (room * 1.3) / 2.3;
            // 6 個膠囊都畫出來，字照順序
            assert.equal(chipShapes(ctx).length, 6, `${lang} ${format}：6 個膠囊`);
            for (const label of likes) assert.ok(hasLine(ctx, label), `${lang} ${format}：「${label}」`);
            // 最多 2 列，都在左欄裡
            assert.ok(distinct(chipShapes(ctx).map((chip) => chip.y)).length <= 2, '最多 2 列');
            for (const chip of chipShapes(ctx)) assert.ok(chip.x + chip.w <= leftEdge + 1e-6, '膠囊在左欄裡');
            // 字級：原本的 1.22／1.8cqw，縮也不小於 60%
            const base = cq(format, pick(format, 1.22, 1.8));
            const chipPx = lineOf(ctx, likes[0]).px;
            assert.ok(chipPx <= base + 1e-6 && chipPx >= base * 0.6 - 0.011, `${lang} ${format}：字級 ${chipPx}／${base}`);
            // 膠囊整組縮小：字級、內距、間距一起乘同一個倍數，邊框不變
            const scale = chipPx / base;
            const first = chipShapes(ctx)[0];
            near(first.h, chipPx * LINE_NORMAL + 2 * cq(format, pick(format, 0.3, 0.45)) * scale + 2 * cq(format, hairline(format)), '膠囊的高', 0.05);
            // 字在膠囊裡左右的內距一樣，都是 padX × 倍數 加一條邊框（字從左邊框的內側開始，右邊留一樣多，縮小之後也是）
            const padX = cq(format, pick(format, 1, 1.4)) * scale + cq(format, hairline(format));
            chipShapes(ctx).forEach((chip, i) => {
                const line = lineOf(ctx, likes[i]);
                const left = line.x - chip.x;
                const right = chip.x + chip.w - (line.x + line.width);
                near(left, right, `${lang} ${format}：「${likes[i]}」左右的內距一樣`, 1e-9);
                near(left, padX, `${lang} ${format}：「${likes[i]}」的內距是 padX × 倍數加邊框`, 0.05);
            });
        }
    }
    // 中文不用縮
    for (const format of FORMATS) {
        const ctx = render(fullModel('a', { format, likes: longestLikes('zh') }));
        assert.equal(chipShapes(ctx).length, 6);
        near(lineOf(ctx, longestLikes('zh')[0]).px, cq(format, pick(format, 1.22, 1.8)), '中文的 6 個標籤照原本的字級');
    }
});

// ---------- 名字 ----------

test('名字用 Noto Serif TC 700，放不下整行縮小（最多縮到 30%），21 個寬字也縮到放得進資訊欄', () => {
    const LATIN_21 = 'Abcdefghijklmnopqrstu';
    const WIDE_21 = '甲乙丙丁戊己庚辛壬癸'.repeat(2) + '子';
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const base = cq(format, pick(format, 4.6, 6.6));
        // 短的名字不縮
        const short = lineOf(render(fullModel('a', { format, name: 'Luna' })), 'Luna');
        near(short.px, base);
        assert.equal(short.font, fontOf(700, SERIF, base));
        near(short.x, info.x);
        // 長的名字：放不下就縮到剛好放得下，放得下就不縮（21 個英文字母在直版放得下，在橫版放不下）
        for (const name of [LATIN_21, WIDE_21, '寬'.repeat(21), 'W'.repeat(21)]) {
            const line = lineOf(render(fullModel('a', { format, name })), name);
            const natural = fakeMeasure(fontOf(700, SERIF, base), name);
            assert.ok(line.x + line.width <= info.x + info.width + 1e-6, `${format} ${name} 畫出來 ${line.width}，超出資訊欄的寬 ${info.width}`);
            assert.equal(line.font, fontOf(700, SERIF, line.px));
            assert.equal(line.fillStyle, COLORS.text);
            if (natural > info.width) {
                assert.ok(line.px < base, `${format} ${name}：縮小了`);
                assert.ok(line.px >= base * 0.3 - 0.011, '最多縮到 30%');
                assert.ok(line.width >= info.width * 0.97, `${format} ${name} 縮得比需要的多`);
            } else {
                near(line.px, base, `${format} ${name}：放得下不縮`);
            }
        }
        // 21 個寬字一定要縮（橫版、直版都放不下）
        assert.ok(lineOf(render(fullModel('a', { format, name: WIDE_21 })), WIDE_21).px < base);
    }
});

// ---------- 背景與照片 ----------

test('背景：有 backdrop 時鋪滿整張卡片的是它（imageSmoothingQuality 是 high），沒有時是預設背景，最後都壓一層 rgba(0,0,0,0.58)', () => {
    const BACKDROP = picture('backdrop');
    for (const format of FORMATS) {
        const { width, height } = SIZE[format];
        const dim = (ctx) => ctx.calls.findIndex((call) => call.op === 'fillRect' && call.fillStyle === 'rgba(0,0,0,0.58)' && call.args[0] === 0 && call.args[1] === 0 && call.args[2] === width && call.args[3] === height);

        // 有 backdrop（16:9 的小圖）：先鋪 #120f24，再用 coverRect（置中、zoom 1）畫滿整張卡片，最後壓暗
        const withBackdrop = render(fullModel('a', { format, backdrop: { source: BACKDROP, width: 160, height: 90 } }));
        const first = fills(withBackdrop)[0];
        assert.deepEqual([first.kind, first.x, first.y, first.w, first.h, first.fillStyle], ['fillRect', 0, 0, width, height, '#120f24']);
        const backdropCalls = imageCalls(withBackdrop).filter((call) => call.image === BACKDROP);
        assert.equal(backdropCalls.length, 1);
        const rect = CardLayout.coverRect(160, 90, width, height, { x: 0, y: 0, zoom: 1 });
        assert.deepEqual(plain(backdropCalls[0].args.slice(1)), [rect.dx, rect.dy, rect.dw, rect.dh]);
        assert.equal(backdropCalls[0].call.imageSmoothingQuality, 'high');
        assert.equal(wholeCardGradient(withBackdrop, format), undefined, '有 backdrop 時整張卡片不畫預設背景');
        const dimAt = dim(withBackdrop);
        assert.ok(dimAt > withBackdrop.calls.indexOf(backdropCalls[0].call), '壓暗在 backdrop 之後');
        assert.equal(withBackdrop.calls.filter((call) => call.op === 'fillRect' && call.fillStyle === 'rgba(0,0,0,0.58)').length, 1);
        // 別的圖（職業圖示）不用 high
        for (const call of imageCalls(withBackdrop).filter((candidate) => candidate.image !== BACKDROP)) assert.equal(call.call.imageSmoothingQuality, 'low');

        // 沒有 backdrop：整張卡片畫預設背景（對角漸層加光點），再壓暗
        const plainCard = render(fullModel('a', { format }));
        const gradient = wholeCardGradient(plainCard, format);
        assert.ok(gradient, '左上到右下的對角漸層');
        assert.deepEqual(plain(gradient.result.stops), [[0, '#1b1d45'], [1, ACCENT]]);
        assert.ok(plainCard.calls.filter((call) => call.op === 'createRadialGradient').length >= 20);
        assert.ok(dim(plainCard) > plainCard.calls.indexOf(gradient), '壓暗在預設背景之後');
        assert.equal(imageCalls(plainCard).filter((call) => call.image === BACKDROP).length, 0);

        // backdrop 的大小不對（寬或高是 0）：不畫它，改畫預設背景；也不是物件時當成沒有
        for (const backdrop of [{ source: BACKDROP, width: 0, height: 0 }, { source: null, width: 160, height: 90 }, null, undefined, 'x']) {
            const ctx = render(fullModel('a', { format, backdrop }));
            assert.equal(imageCalls(ctx).filter((call) => call.image === BACKDROP).length, 0);
            assert.ok(wholeCardGradient(ctx, format), `backdrop ${JSON.stringify(backdrop)}：改畫預設背景`);
        }
    }
});

test('照片框裡：有截圖時先 clip 成圓角 1.3cqw 的框，照 A 這一份位置畫截圖；沒有截圖時是預設背景（漸層從照片框左上到右下）', () => {
    const PHOTO = picture('photo');
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

        const withPhoto = render(fullModel('a', { format, image: { source: PHOTO, width: 2000, height: 1000 }, crop }));
        const rect = CardLayout.coverRect(2000, 1000, photo.width, photo.height, crop);
        const photoCalls = imageCalls(withPhoto).filter((call) => call.image === PHOTO);
        assert.equal(photoCalls.length, 1);
        assert.deepEqual(plain(photoCalls[0].args.slice(1)), [photo.x + rect.dx, photo.y + rect.dy, rect.dw, rect.dh]);
        assert.ok(inClip(withPhoto).includes(photoCalls[0].call), '截圖畫在 clip 裡面');
        const clipPath = withPhoto.calls[withPhoto.calls.findIndex((call) => call.op === 'clip') - 1];
        assert.equal(clipPath.op, 'roundRect');
        assert.deepEqual(plain(clipPath.args.map((n) => Math.round(n * 1000) / 1000)), [photo.x, photo.y, photo.width, photo.height, cq(format, 1.3)].map((n) => Math.round(n * 1000) / 1000));
        // 有截圖時照片框裡沒有預設背景（整張卡片的預設背景還在，另外有）
        assert.equal(inClip(withPhoto).filter((call) => call.op === 'createRadialGradient').length, 0);

        // 沒有截圖：照片框裡是預設背景，漸層從照片框左上到右下，光點都在照片框裡
        const plainCard = render(fullModel('a', { format }));
        const inside = inClip(plainCard);
        const gradient = inside.find((call) => call.op === 'createLinearGradient');
        assert.ok(gradient, '照片框裡有預設背景的漸層');
        assert.deepEqual(plain(gradient.args.map((n) => Math.round(n * 1000) / 1000)), [photo.x, photo.y, photo.x + photo.width, photo.y + photo.height].map((n) => Math.round(n * 1000) / 1000));
        const dots = inside.filter((call) => call.op === 'createRadialGradient');
        assert.ok(dots.length >= 20);
        for (const dot of dots) {
            const [x, y, , , , radius] = dot.args;
            assert.ok(x - radius >= photo.x - 1e-6 && x + radius <= photo.x + photo.width + 1e-6 && y - radius >= photo.y - 1e-6 && y + radius <= photo.y + photo.height + 1e-6, '光點在照片框裡');
        }
        assert.equal(imageCalls(plainCard).filter((call) => call.image === PHOTO).length, 0);

        // 截圖的大小不對：改畫預設背景，不丟錯
        const broken = render(fullModel('a', { format, image: { source: PHOTO, width: 0, height: 0 } }));
        assert.equal(imageCalls(broken).filter((call) => call.image === PHOTO).length, 0);
        assert.ok(inClip(broken).some((call) => call.op === 'createLinearGradient'));
    }
});

test('照片框的光環與陰影：陰影由不透明的照片框形狀投出來（深度照草稿），光環另外畫在上面、不帶陰影，畫完陰影就關掉', () => {
    const isOpaqueHex = (color) => /^#[0-9a-f]{6}$/i.test(color);
    for (const format of FORMATS) {
        const { photo } = boxes(format);
        const ctx = render(fullModel('a', { format }));
        const ring = cq(format, 0.25);
        const noShadow = (call) => [call.shadowBlur, call.shadowOffsetX, call.shadowOffsetY, call.shadowColor];

        // 帶陰影的填色只有一次，而且是不透明的：canvas 的陰影強度跟著被畫的形狀的透明度，半透明的光環自己投陰影只有草稿的約 0.55 倍深
        const shadowed = fills(ctx).filter((shape) => shape.call.shadowBlur > 0);
        assert.equal(shadowed.length, 1, '帶陰影的填色只有一次');
        const caster = shadowed[0];
        assert.ok(isOpaqueHex(caster.fillStyle), `投陰影的形狀是不透明的顏色（${caster.fillStyle}）`);
        assert.equal(caster.call.globalAlpha, 1);
        // 形狀就是照片框（草稿的陰影沒有擴張，形狀是照片的框，圓角 1.3cqw）：和照片的 clip 一模一樣，所以照片把它整個蓋住
        assert.equal(caster.kind, 'roundRect');
        for (const [key, expected] of Object.entries({ x: photo.x, y: photo.y, w: photo.width, h: photo.height, r: cq(format, 1.3) })) near(caster[key], expected, `投陰影的形狀的 ${key}`);
        const clipAt = ctx.calls.findIndex((call) => call.op === 'clip');
        assert.deepEqual(plain(ctx.calls[clipAt - 1].args), [caster.x, caster.y, caster.w, caster.h, caster.r], '照片的 clip 和投陰影的形狀是同一個圓角框');
        // 陰影：往下 1.5cqw、模糊 4cqw、rgba(0,0,0,0.45)（草稿的 box-shadow: 0 1.5cqw 4cqw rgba(0,0,0,0.45)）
        near(caster.call.shadowOffsetY, cq(format, 1.5));
        near(caster.call.shadowBlur, cq(format, 4));
        assert.equal(caster.call.shadowColor, 'rgba(0,0,0,0.45)');
        assert.equal(caster.call.shadowOffsetX, 0);

        // 光環：rgba(淡色, 0.55)，照片框往外 0.25cqw 的圓角框（圓角 1.3 + 0.25cqw），沒有陰影；在投陰影的形狀之後、照片之前
        const halo = fills(ctx).find((shape) => shape.fillStyle === rgbaOf(tintOf(), 0.55));
        assert.ok(halo, '光環：rgba(淡色, 0.55)');
        near(halo.x, photo.x - ring, '光環的 x');
        near(halo.y, photo.y - ring, '光環的 y');
        near(halo.w, photo.width + 2 * ring, '光環的寬');
        near(halo.h, photo.height + 2 * ring, '光環的高');
        near(halo.r, cq(format, 1.3) + ring, '光環的圓角');
        assert.deepEqual(noShadow(halo.call), [0, 0, 0, 'rgba(0, 0, 0, 0)'], '光環自己不帶陰影');
        const casterAt = ctx.calls.indexOf(caster.call);
        const haloAt = ctx.calls.indexOf(halo.call);
        assert.ok(haloAt > casterAt, '光環畫在陰影上面');
        assert.ok(casterAt > ctx.calls.findIndex((call) => call.op === 'fillRect' && call.fillStyle === 'rgba(0,0,0,0.58)'), '陰影畫在背景之後');
        assert.ok(haloAt < clipAt, '照片畫在光環上面');

        // 畫完陰影就沒了：其他每一次畫（填色、描邊、字、圖、clip），包括投陰影之後的每一次，陰影都是預設值
        let later = 0;
        let others = 0;
        for (const call of ctx.calls.filter((candidate) => ['fill', 'fillRect', 'fillText', 'stroke', 'drawImage', 'clip'].includes(candidate.op) && candidate !== caster.call)) {
            others += 1;
            if (ctx.calls.indexOf(call) > casterAt) later += 1;
            assert.deepEqual(noShadow(call), [0, 0, 0, 'rgba(0, 0, 0, 0)'], `${call.op} 沒有陰影`);
        }
        assert.ok(others > 50 && later > 50, `其他的畫 ${others} 次，其中投陰影之後 ${later} 次`);
    }
});

// ---------- 填到上限 ----------

test('每個欄位填到上限（wide、latin）：橫版、直版的每一段字都在資訊欄裡、互不重疊，也沒有字在照片框裡', () => {
    for (const script of ['wide', 'latin']) {
        for (const format of FORMATS) {
            const { photo, info } = boxes(format);
            const photoBox = { left: photo.x, right: photo.x + photo.width, top: photo.y, bottom: photo.y + photo.height };
            const ctx = render(maxedModel('a', { script }, { format }));
            const found = textBoxes(ctx);
            assert.ok(found.length >= 30, `${script} ${format}：畫了 ${found.length} 段字`);
            const where = `${script} ${format}`;
            for (const box of found) {
                assert.ok(Number.isFinite(box.left) && Number.isFinite(box.top));
                assert.ok(inside(box, info), `${where}：「${box.text}」超出資訊欄（${box.left}～${box.right}、${box.top}～${box.bottom}；資訊欄 ${JSON.stringify(info)}）`);
                assert.equal(overlaps(box, photoBox), false, `${where}：「${box.text}」在照片框裡`);
            }
            for (let i = 0; i < found.length; i++) {
                for (let j = i + 1; j < found.length; j++) {
                    assert.equal(overlaps(found[i], found[j]), false, `${where}：「${found[i].text}」與「${found[j].text}」重疊`);
                }
            }
            // 形狀（膠囊、時段格子、自我介紹的線、細線）也都在資訊欄裡，圖示也是。整張卡片的底、壓暗與照片框（含光環）裡的不算
            const ring = cq(format, 0.25);
            const inPhoto = (shape) => shape.x >= photo.x - ring - 1e-6 && shape.y >= photo.y - ring - 1e-6 && shape.x + shape.w <= photo.x + photo.width + ring + 1e-6 && shape.y + shape.h <= photo.y + photo.height + ring + 1e-6;
            const infoShapes = fills(ctx).filter((shape) => shape.w < SIZE[format].width && !inPhoto(shape));
            assert.ok(infoShapes.length >= 6 + 8 + 2, `${where}：資訊欄裡的形狀 ${infoShapes.length} 個`);
            for (const shape of infoShapes) {
                assert.ok(shape.x >= info.x - 1e-6 && shape.x + shape.w <= info.x + info.width + 1e-6 && shape.y >= info.y - 1e-6 && shape.y + shape.h <= info.y + info.height + 1e-6, `${where}：形狀超出資訊欄 ${JSON.stringify({ x: shape.x, y: shape.y, w: shape.w, h: shape.h })}`);
            }
            for (const image of imageCalls(ctx)) {
                assert.ok(image.x >= info.x - 1e-6 && image.x + image.w <= info.x + info.width + 1e-6 && image.y >= info.y - 1e-6 && image.y + image.h <= info.y + info.height + 1e-6, `${where}：圖示超出資訊欄`);
            }
            // 每個欄位都畫出來：6 個膠囊、8 格時段、自我介紹最多 2 行、三個其他職業
            assert.equal(chipShapes(ctx).length, 6, `${where}：6 個膠囊`);
            assert.equal(hourCells(ctx).length, 8);
            assert.equal(introLines(ctx, format).length >= 1 && introLines(ctx, format).length <= 2, true);
            assert.equal(imageCalls(ctx).length, 4);
            // 底部一列貼著資訊欄的底（一行字的高度是字級的 1.45 倍，字的框是字級那麼高，在這一行的正中）
            const foot = found.find((box) => box.text === FOOT);
            near(foot.bottom + (foot.bottom - foot.top) * (LINE_NORMAL - 1) / 2, info.y + info.height, `${where}：底部一列貼著資訊欄的底`, 0.02);
        }
    }
});

// ---------- 底部一列 ----------

test('底部一列：右邊「FF14.tw · SE 版權字」整句，左邊聯絡方式一行放不下整行縮小，中間至少隔 2cqw', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const px = cq(format, pick(format, 1.05, 1.5));
        // 放得下：不縮
        const normal = render(fullModel('a', { format }));
        near(lineOf(normal, 'Discord: luna_star').px, px);
        // 40 個寬字放不下：縮小，和右邊至少隔 2cqw，右邊不縮
        const long = '寬'.repeat(40);
        const ctx = render(fullModel('a', { format, contact: long }));
        const left = lineOf(ctx, long);
        const right = lineOf(ctx, FOOT);
        near(right.px, px, '右邊不縮');
        assert.ok(left.px < px && left.px >= px * 0.3 - 0.011, `聯絡方式縮小了（${left.px}／${px}）`);
        assert.ok(right.x - (left.x + left.width) >= cq(format, 2) - 0.15, `中間至少隔 2cqw（${right.x - (left.x + left.width)}）`);
        near(left.x, info.x);
        near(right.x + right.width, info.x + info.width);
        near(left.y, right.y, '兩段字在同一條中線上', 1e-9);
    }
});

// ---------- 自我介紹 ----------

test('自我介紹：最多 2 行，超過的最後一行接「…」；線和字一樣高', () => {
    for (const format of FORMATS) {
        const { info } = boxes(format);
        const ctx = render(fullModel('a', { format, intro: INTRO.repeat(4) }));
        const found = introLines(ctx, format);
        assert.equal(found.length, 2);
        assert.ok(found[1].text.endsWith('…'));
        for (const line of found) assert.ok(line.x + line.width <= info.x + info.width + 1e-6, '每一行都在資訊欄裡');
        const bar = fills(ctx).find((shape) => shape.kind === 'fillRect' && shape.fillStyle === ACCENT);
        near(bar.h, 2 * cq(format, pick(format, 1.45, 2.15)) * 1.55);
        // 行距是行高 1.55
        near(found[1].y - found[0].y, cq(format, pick(format, 1.45, 2.15)) * 1.55);
    }
});

// ---------- 畫面模型多的欄位 ----------

test('畫面模型多的欄位：字串去掉前後空白、沒填是空字串；labels 沒給或空的用中文預設，給了就用給的', () => {
    const base = requiredModel('a', { fcName: '  Moonlit Garden  ', fcTag: 'MOON', gc: ' 雙蛇黨 ', looking: ' 固定隊、部隊 ', contact: '  Discord: luna_star  ' });
    const ctx = render(base);
    assert.deepEqual(sorted(texts(ctx)), sorted(['Luna Starweaver', 'Tiamat', 'Paladin', 'Lv 100 · 主職', '部隊', 'Moonlit Garden «MOON»', '大國防聯軍', '雙蛇黨', '在找什麼', '固定隊、部隊', 'Discord: luna_star', FOOT]));
    // 不是字串的欄位（null、數字、物件）當成沒填，不丟錯
    for (const bad of [null, 3, {}, []]) {
        const broken = render(requiredModel('a', { fcName: bad, gc: bad, looking: bad, contact: bad, labels: bad, backdrop: bad }));
        assert.deepEqual(sorted(texts(broken)), sorted(['Luna Starweaver', 'Tiamat', 'Paladin', 'Lv 100 · 主職', FOOT]));
    }
    // labels：每個小標可以只給一部分，空字串與只有空白用預設
    const partial = render(fullModel('a', { labels: { fc: 'Free Company', gc: '  ', mainJob: 'Main job' } }));
    for (const text of ['Free Company', '大國防聯軍', '在找什麼', '喜歡的內容', '遊玩時段', 'Lv 100 · Main job']) assert.ok(hasLine(partial, text), text);
    assert.equal(hasLine(partial, '部隊'), false);
    // 英文的小標（卡片上的字跟著介面語言）
    const english = render(fullModel('a', { labels: { fc: 'Free Company', gc: 'Grand Company', looking: 'Looking for', likes: 'Favorite content', hours: 'Play hours', subJobs: 'Other jobs', mainJob: 'Main job' }, gc: 'Maelstrom' }));
    for (const text of ['Free Company', 'Grand Company', 'Looking for', 'Favorite content', 'Play hours', 'Lv 100 · Main job']) assert.ok(hasLine(english, text), text);
    assert.equal(hasLine(english, 'Other jobs'), false, 'A 沒有「其他職業」小標');
    // 沒有等級：只寫小標「主職」
    const noLevel = render(requiredModel('a', { job: { name: 'Paladin', icon: picture('pld') } }));
    assert.ok(hasLine(noLevel, '主職'));
    assert.equal(texts(noLevel).some((text) => text.includes('Lv')), false);
    // 沒有職業（名稱空白）：沒有職業列的字，也沒有「主職」
    assert.equal(hasLine(render(requiredModel('a', { job: { name: ' ', level: 100, icon: null } })), '主職'), false);
});

test('沒有 roundRect 的瀏覽器：改用 arcTo 畫圓角，畫出一樣的字', () => {
    const modern = render(fullModel('a'));
    const old = render(fullModel('a'), { missing: ['roundRect'] });
    assert.equal(old.calls.some((call) => call.op === 'roundRect'), false);
    assert.ok(old.calls.some((call) => call.op === 'arcTo'));
    assert.deepEqual(drawn(old).map((piece) => [piece.text, piece.x, piece.y, piece.font]), drawn(modern).map((piece) => [piece.text, piece.x, piece.y, piece.font]));
    assert.equal(old.calls.filter((call) => call.op === 'clip').length, 1);
});

// ---------- 載入字型 ----------

test('fontsFor：名字用 Noto Serif TC 700；畫出來的每一段字都有列到，也不多列', () => {
    const cjk = fullModel('a', {
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
    const models = [fullModel('a'), fullModel('a', { format: 'portrait' }), requiredModel('a'), emptyModel('a'), cjk];
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
    }

    // 名字用 Noto Serif TC 700（含名字的每一個字），沒有 Outfit（A 不畫 Outfit 的字：FF14.tw 在底部一列裡，用 Noto Sans TC 500）
    for (const model of [fullModel('a'), cjk]) {
        const fonts = plain(CardRenderer.fontsFor(model));
        const serif = fonts.find((entry) => /^700 \d+(?:\.\d+)?px "Noto Serif TC", serif$/.test(entry.font));
        assert.ok(serif, '有 Noto Serif TC 700');
        for (const char of Array.from(model.name)) assert.ok(serif.text.includes(char), `Noto Serif TC 700 要載入「${char}」`);
        assert.equal(fonts.some((entry) => entry.font.includes('Outfit')), false);
        const regular = fonts.find((entry) => /^500 \d+(?:\.\d+)?px "Noto Sans TC", sans-serif$/.test(entry.font));
        for (const text of [FOOT, model.contact, '部隊', model.world]) assert.ok(regular.text.includes(text), `Noto Sans TC 500 要載入「${text}」`);
    }
    // 只有必填三項、什麼都沒填：沒有畫的字不載入
    const required = plain(CardRenderer.fontsFor(requiredModel('a'))).map((entry) => entry.text).join('');
    for (const text of ['STAR', 'Savage', '平日', '早上', '部隊']) assert.equal(required.includes(text), false, `只有必填三項時不載入「${text}」`);
    assert.equal(plain(CardRenderer.fontsFor(emptyModel('a'))).map((entry) => entry.text).join(''), FOOT);
});

// ---------- 畫完不留痕跡 ----------

test('畫完 context 的設定還原：save 與 restore 一樣多，font、fillStyle、globalAlpha、shadow*、imageSmoothing* 都是畫之前的值', () => {
    const ctx = createRecordingContext();
    const before = {
        font: '12px serif', fillStyle: '#123456', strokeStyle: '#654321', lineWidth: 7, globalAlpha: 0.5, textAlign: 'center', textBaseline: 'top',
        shadowColor: 'rgba(1, 2, 3, 0.5)', shadowBlur: 7, shadowOffsetX: 3, shadowOffsetY: 4, imageSmoothingEnabled: false, imageSmoothingQuality: 'medium'
    };
    Object.assign(ctx, before);
    card.CardRenderer.draw(ctx, fullModel('a', { backdrop: { source: picture('backdrop'), width: 160, height: 90 }, image: { source: picture('photo'), width: 2000, height: 1000 } }));
    for (const [key, value] of Object.entries(before)) assert.equal(ctx[key], value, key);
    const saves = ctx.calls.filter((call) => call.op === 'save').length;
    assert.ok(saves >= 2);
    assert.equal(ctx.calls.filter((call) => call.op === 'restore').length, saves);
    // 畫字的時候：靠左、垂直置中、不透明（其他職業的圖示用 0.88，畫完就還原）
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
    const models = (format) => [requiredModel('a', { format }), emptyModel('a', { format }), fullModel('a', { format }), maxedModel('a', { script: 'wide' }, { format }), maxedModel('a', { script: 'latin' }, { format })];
    for (const format of FORMATS) {
        for (const factor of [0.5, 1, 1.7, 3]) {
            // 記錄 context 遇到不是有限的數字（NaN、Infinity）會當場丟 TypeError，所以沒丟錯就是每個座標都是正常的數字
            for (const model of models(format)) assert.doesNotThrow(() => render(model, { measure: (font, text) => fakeMeasure(font, text) * factor }), `${format} 量字 ×${factor}`);
        }
    }
});
