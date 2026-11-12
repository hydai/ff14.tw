const test = require('node:test');
const assert = require('node:assert/strict');

const { createRecordingContext, fakeMeasure, fontSize } = require('./helpers/canvas-recorder.js');
const { card, plain, near, picture, lines, render, fullModel, backgroundOf } = require('./helpers/card-drawing.js');

// 共用的畫圖小工具（card-paint.js）：用 canvas-recorder.js 的記錄 context 與假的量字（碼位小於 U+0250 的字 0.6 × 字級，其他 1 × 字級）
const { CardPaint, CardLayout } = card;
const { LINE_NORMAL, FIT_FLOOR, FAMILIES } = CardPaint;

const TEXT = { weight: 500, family: FAMILIES.sans };
const measureOf = (px) => (text) => fakeMeasure(`${px}px x`, text);

// ---------- 模組 ----------

test('CardPaint：凍結，新增的小工具與 FAMILIES.serif 都在', () => {
    assert.equal(Object.isFrozen(CardPaint), true);
    for (const name of ['isObject', 'deepFreeze', 'geometryOf', 'rgbaOf', 'fitChips', 'fittedSpacedSize', 'stackDown', 'drawPhotoBox', 'metaItems', 'footText', 'footBlock', 'splitColumns', 'twoColumns', 'labelBlock', 'iconLetters', 'listTexts', 'mixOf', 'readableOn', 'tintOf', 'drawCapsule', 'photoInfoBoxes', 'metaCells', 'likesAndHours', 'drawInfoColumn']) {
        assert.equal(typeof CardPaint[name], 'function', `CardPaint.${name}`);
    }
    assert.equal(FAMILIES.serif, '"Noto Serif TC", serif');
    assert.equal(Object.isFrozen(FAMILIES), true);
});

// ---------- 顏色 ----------

test('rgbaOf：十六進位的顏色加透明度，寫成 rgba(r,g,b,a)', () => {
    assert.equal(CardPaint.rgbaOf('#4f74d6', 0.34), 'rgba(79,116,214,0.34)');
    assert.equal(CardPaint.rgbaOf('#000000', 0), 'rgba(0,0,0,0)');
    assert.equal(CardPaint.rgbaOf('#ffffff', 1), 'rgba(255,255,255,1)');
    assert.equal(CardPaint.rgbaOf('#F3F1FA', 0.7), 'rgba(243,241,250,0.7)', '大寫也行');
});

test('mixOf：往另一個顏色混 amount，每個色版 Math.round(a + (b - a) * amount)，輸出一律小寫；tintOf 就是往白色混', () => {
    const { mixOf, tintOf } = CardPaint;
    assert.equal(mixOf('#4f74d6', '#1d2233', 0), '#4f74d6', '0 是原本的顏色');
    assert.equal(mixOf('#4f74d6', '#1d2233', 1), '#1d2233', '1 是另一個顏色');
    assert.equal(mixOf('#4f74d6', '#1d2233', 0.2), '#4564b5', '79→69、116→99.6 進位成 100、214→181.4 捨去成 181');
    assert.equal(mixOf('#000000', '#ffffff', 0.5), '#808080', '127.5 進位成 128');
    assert.equal(mixOf('#4F74D6', '#1D2233', 0.2), '#4564b5', '大寫也行');
    assert.equal(mixOf('#ffffff', '#ffffff', 0.87), '#ffffff');

    // tintOf(hex, x) 就是 mixOf(hex, '#ffffff', x)：海報的稱號用它，顏色不能變
    assert.equal(mixOf('#4f74d6', '#ffffff', 0.55), tintOf('#4f74d6', 0.55));
    assert.equal(tintOf('#4f74d6', 0.55), '#b0c0ed');
    for (const hex of ['#000000', '#4f74d6', '#3f9e5c', '#d4574e', '#8a63d2', '#c99a2e', '#ffff66', '#ffffff']) {
        for (const amount of [0, 0.13, 0.34, 0.55, 0.87, 1]) assert.equal(tintOf(hex, amount), mixOf(hex, '#ffffff', amount), `${hex} 往白色混 ${amount}`);
    }
});

test('readableOn：文字色一步一步（每次 0.05）往 toward 混，第一個和底色的對比 ≥ min 的就是答案；本來就夠就不動，都不夠是 toward', () => {
    const { readableOn, mixOf } = CardPaint;
    const ratio = CardLayout.contrastRatio;
    const BASE = '#f4f5fa';
    const stepsOf = (text, toward = '#1d2233') => Array.from({ length: 20 }, (_, i) => mixOf(text, toward, i / 20));

    // 本來就夠（t 是 0）：原樣，輸出小寫
    assert.equal(readableOn('#000000', BASE), '#000000');
    assert.equal(readableOn('#1D2233', BASE), '#1d2233');

    // 不夠：採集的金色在 #f4f5fa 上只有 2.37，往 #1d2233 混到第一個 ≥ 4.5 的，少混 0.05 就不到
    for (const text of ['#c99a2e', '#3f9e5c', '#d4574e', '#4f74d6', '#8a63d2', '#ffff66', '#ffffff']) {
        const found = readableOn(text, BASE);
        const steps = stepsOf(text);
        const at = steps.indexOf(found);
        assert.ok(at > 0, `${text}：要混過（第 ${at} 步）`);
        assert.ok(ratio(found, BASE) >= 4.5, `${text}：${found} 的對比 ${ratio(found, BASE)}`);
        assert.ok(ratio(steps[at - 1], BASE) < 4.5, `${text}：少混 0.05（${steps[at - 1]}）就不到 4.5`);
        for (let i = 0; i < at; i++) assert.ok(ratio(steps[i], BASE) < 4.5, `${text}：第 ${i} 步還不夠`);
    }

    // toward：往別的顏色混（淺色字在深色底上）；min：要的對比度（越高混得越多）
    assert.equal(readableOn('#ffff66', '#1d2233', { toward: '#ffffff' }), '#ffff66', '本來就夠');
    const lifted = readableOn('#555577', '#1d2233', { toward: '#ffffff' });
    assert.ok(ratio('#555577', '#1d2233') < 4.5 && ratio(lifted, '#1d2233') >= 4.5, `${lifted} 的對比 ${ratio(lifted, '#1d2233')}`);
    assert.ok(stepsOf('#555577', '#ffffff').includes(lifted));
    const strict = readableOn('#c99a2e', BASE, { min: 7 });
    assert.ok(ratio(strict, BASE) >= 7);
    assert.ok(stepsOf('#c99a2e').indexOf(strict) > stepsOf('#c99a2e').indexOf(readableOn('#c99a2e', BASE)), 'min 越高混得越多');

    // 都不夠：toward 自己
    assert.equal(readableOn('#c99a2e', BASE, { min: 22 }), '#1d2233');
    assert.equal(readableOn('#808080', '#808080', { toward: '#808080' }), '#808080');
});

test('drawCapsule：半透明的底加邊框（描邊的路徑往裡縮半條線寬）；沒有邊框（border 是 0）時只填色、不描邊', () => {
    const { drawCapsule } = CardPaint;
    const opsOf = (ctx) => ctx.calls.map((call) => call.op);

    const ctx = createRecordingContext();
    drawCapsule(ctx, 10, 20, 100, 30, 'rgba(1,2,3,0.5)', '#abcdef', 2);
    assert.deepEqual(opsOf(ctx), ['beginPath', 'roundRect', 'fill', 'beginPath', 'roundRect', 'stroke']);
    assert.deepEqual(plain(ctx.calls[1].args), [10, 20, 100, 30, 15], '底是整個膠囊，兩頭半圓');
    assert.equal(ctx.calls[2].fillStyle, 'rgba(1,2,3,0.5)');
    assert.deepEqual(plain(ctx.calls[4].args), [11, 21, 98, 28, 14], '邊框在框裡面：路徑往裡縮半條線寬');
    assert.equal(ctx.calls[5].strokeStyle, '#abcdef');
    assert.equal(ctx.calls[5].lineWidth, 2);

    // 沒有邊框（border 是 0，或不給 stroke 與 border）：只填色。canvas 的 lineWidth 設成 0 會被忽略（沿用上一次的線寬），所以不能照樣描邊
    for (const args of [['#ffffff', '#000000', 0], ['#ffffff']]) {
        const flat = createRecordingContext();
        flat.lineWidth = 7;
        drawCapsule(flat, 10, 20, 100, 30, ...args);
        assert.deepEqual(opsOf(flat), ['beginPath', 'roundRect', 'fill'], `參數 ${JSON.stringify(args)}`);
        assert.equal(flat.calls[2].fillStyle, '#ffffff');
        assert.equal(flat.lineWidth, 7, '不動線寬');
    }
    // 沒有 roundRect 的瀏覽器：改用 arcTo，照樣只填色
    const old = createRecordingContext({ missing: ['roundRect'] });
    drawCapsule(old, 10, 20, 100, 30, '#ffffff', '#000000', 0);
    assert.equal(opsOf(old).includes('stroke'), false);
    assert.equal(opsOf(old).includes('arcTo'), true);
});

// ---------- 版面數字 ----------

test('isObject、deepFreeze、geometryOf', () => {
    const { isObject, deepFreeze, geometryOf } = CardPaint;
    assert.deepEqual([{}, { a: 1 }, [], null, undefined, 'x', 3].map(isObject), [true, true, false, false, false, false, false]);

    // deepFreeze：往下每一層的物件都凍結，回傳同一個物件
    const nested = { a: { b: { c: 1 } }, d: 2 };
    assert.equal(deepFreeze(nested), nested);
    assert.equal(Object.isFrozen(nested) && Object.isFrozen(nested.a) && Object.isFrozen(nested.a.b), true);

    // geometryOf：{ width, height } 加上那一種版型的版面數字（cqw）乘上 寬度 / 100 換成像素，字串照舊，不改傳進去的資料（凍結的也行）
    const specs = deepFreeze({ landscape: { gap: 2, inner: { font: 1.5 }, mode: 'row' }, portrait: { gap: 2, inner: { font: 1.5 }, mode: 'column' } });
    const landscape = plain(geometryOf(specs, 'landscape'));
    assert.deepEqual(Object.keys(landscape).sort(), ['gap', 'height', 'inner', 'mode', 'width']);
    assert.deepEqual([landscape.width, landscape.height, landscape.mode], [1200, 675, 'row']);
    near(landscape.gap, 24, '2cqw 是 24px', 1e-9);
    near(landscape.inner.font, 18, '1.5cqw 是 18px', 1e-9);
    const portrait = plain(geometryOf(specs, 'portrait'));
    assert.deepEqual([portrait.width, portrait.height, portrait.mode], [1080, 1350, 'column']);
    near(portrait.gap, 21.6, '2cqw 是 21.6px', 1e-9);
    near(portrait.inner.font, 16.2, '1.5cqw 是 16.2px', 1e-9);
    assert.notEqual(geometryOf(specs, 'landscape'), geometryOf(specs, 'landscape'), '每次都是新的物件');
});

// ---------- 膠囊排列 ----------

test('fitChips：排得進 2 列是 1；要 3 列時縮到剛好 2 列（每次 0.05）；到下限還排不下就用下限、排不下的不回傳', () => {
    // 假的量字：4 個全形字 = 4 × 字級。每顆寬 = 字寬 + 2 × (padX × 倍數 + border)，高 = 字級 × LINE_NORMAL + 2 × padY × 倍數 + 2 × border
    const ctx = createRecordingContext();
    const spec = { kind: TEXT, font: 10, padX: 2, padY: 1, gap: 4, border: 1, maxWidth: 100, maxRows: 2, floor: 0.6 };
    const four = (n) => Array.from({ length: n }, (_, i) => String.fromCodePoint(0x4e00 + i * 4).repeat(4));
    const rowsOf = (chips) => new Set(chips.map((chip) => Math.round(chip.y * 1000))).size;

    // 4 顆：一列放 2 顆（46 + 4 + 46 = 96 ≤ 100），2 列剛好，倍數 1
    const fits = CardPaint.fitChips(ctx, four(4), spec);
    assert.equal(fits.scale, 1);
    assert.equal(fits.px, 10);
    assert.equal(fits.chips.length, 4);
    assert.equal(rowsOf(fits.chips), 2);
    near(fits.chips[0].h, 10 * LINE_NORMAL + 2 + 2, '一顆的高');
    near(fits.chips[0].w, 40 + 2 * (2 + 1), '一顆的寬');
    near(fits.chips[2].y, fits.chips[0].h + 4, '第二列在第一列下面隔一個 gap');
    near(fits.height, fits.chips[2].y + fits.chips[2].h, 'height 是最後一列的底');
    assert.deepEqual(plain(fits.chips.map((chip) => chip.label)), four(4));

    // 6 顆：倍數 1 要 3 列。一列放 3 顆要 140 × 倍數 + 6 ≤ 100，倍數 0.65 是第一個排得進的（0.7 要 104），所以縮到 0.65
    const shrunk = CardPaint.fitChips(ctx, four(6), spec);
    assert.equal(shrunk.scale, 0.65);
    assert.equal(shrunk.px, 6.5, '字級乘倍數');
    assert.equal(shrunk.chips.length, 6);
    assert.equal(rowsOf(shrunk.chips), 2);
    near(shrunk.chips[0].h, 6.5 * LINE_NORMAL + 2 * 1 * 0.65 + 2 * 1, '高：字級、padY 乘倍數，邊框線寬不變');
    near(shrunk.chips[0].w, 4 * 6.5 + 2 * (2 * 0.65 + 1), '寬：字級、padX 乘倍數，邊框線寬不變');
    near(shrunk.chips[1].x - (shrunk.chips[0].x + shrunk.chips[0].w), 4 * 0.65, '間距乘倍數');
    near(shrunk.chips[3].y - (shrunk.chips[0].y + shrunk.chips[0].h), 4 * 0.65, '列距也是間距乘倍數');
    // 再大一格（0.7）排不進：把下限設在 0.7，回傳的倍數就停在 0.7，而且排不完
    const stopsAt = CardPaint.fitChips(ctx, four(6), { ...spec, floor: 0.7 });
    assert.equal(stopsAt.scale, 0.7);
    assert.ok(stopsAt.chips.length < 6);

    // 到 0.6 還排不下：用 0.6，排得下的照排、排不下的不回傳（12 顆，0.6 一列 3 顆，2 列只有 6 顆）
    const full = CardPaint.fitChips(ctx, four(12), spec);
    assert.equal(full.scale, 0.6);
    assert.equal(full.chips.length, 6);
    assert.deepEqual(plain(full.chips.map((chip) => chip.label)), four(6), '前面的照順序排，後面的不回傳');
    assert.equal(rowsOf(full.chips), 2);

    // 一顆就比一整列寬（到下限也一樣）：不回傳，別顆照排
    const tooWide = '寬'.repeat(20);
    const mixed = CardPaint.fitChips(ctx, [four(1)[0], tooWide, four(2)[1]], spec);
    assert.equal(mixed.scale, 0.6, '有一顆怎麼縮都排不進，縮到下限');
    assert.deepEqual(plain(mixed.chips.map((chip) => chip.label)), [four(1)[0], four(2)[1]]);

    // 下限不是 0.05 的倍數：最後一次剛好是下限
    assert.equal(CardPaint.fitChips(ctx, four(12), { ...spec, floor: 0.62 }).scale, 0.62);

    // 沒有膠囊：倍數 1、沒有東西、高度 0
    assert.deepEqual(plain(CardPaint.fitChips(ctx, [], spec)), { scale: 1, px: 10, chips: [], height: 0 });

    // 量字用縮過的字型（每次先套上去再量）
    const measured = createRecordingContext();
    CardPaint.fitChips(measured, four(6), spec);
    const fonts = new Set(measured.calls.filter((call) => call.op === 'measureText').map((call) => call.font));
    assert.ok(fonts.has(CardPaint.fontString(TEXT, 6.5)), '用 0.65 的字級量過');
    // 傳凍結的 spec 也行
    assert.doesNotThrow(() => CardPaint.fitChips(ctx, Object.freeze(four(4)), Object.freeze({ ...spec, kind: Object.freeze(TEXT) })));
});

// ---------- 縮小到放得下的字距字 ----------

test('fittedSpacedSize：字距畫出來放得下是原本的字級，放不下縮到剛好放得下（最多縮到 FIT_FLOOR）', () => {
    const ctx = createRecordingContext();
    const { fittedSpacedSize, spacedWidth } = CardPaint;
    // 'WWWW'：4 × 6 + 3 × 10 × 0.2 = 30
    assert.equal(spacedWidth(ctx, 'WWWW', TEXT, 10, 0.2), 30);
    assert.equal(fittedSpacedSize(ctx, TEXT, 10, 'WWWW', 0.2, 30), 10, '剛好放得下不縮');
    assert.equal(fittedSpacedSize(ctx, TEXT, 10, 'WWWW', 0.2, 100), 10);
    near(fittedSpacedSize(ctx, TEXT, 10, 'WWWW', 0.2, 15), 5, '寬度只有一半，字級也是一半（字距跟著字級縮，所以剛好放得下）', 1e-9);
    assert.equal(fittedSpacedSize(ctx, TEXT, 10, 'WWWW', 0.2, 1), 10 * FIT_FLOOR, '再窄也只縮到 FIT_FLOOR');
    assert.equal(fittedSpacedSize(ctx, TEXT, 10, '', 0.2, 1), 10, '沒有字不縮');
    assert.equal(FIT_FLOOR, 0.3);
});

test('spacedWidth：空字串是 0，一個字沒有字距，多個字加上字與字之間的字距', () => {
    const ctx = createRecordingContext();
    const { spacedWidth } = CardPaint;
    assert.equal(spacedWidth(ctx, '', TEXT, 10, 0.5), 0);
    assert.equal(spacedWidth(ctx, 'A', TEXT, 10, 0.5), 6, '一個字後面沒有字距');
    assert.equal(spacedWidth(ctx, '寬寬', TEXT, 10, 0.2), 22);
    near(spacedWidth(ctx, 'ABC', TEXT, 10, 0.2), 3 * 6 + 2 * 2, '', 1e-9);
    assert.equal(spacedWidth(ctx, '寬寬', TEXT, 10, 0), 20);
    // 代理對（罕用字）是一個字，不拆開
    assert.equal(spacedWidth(ctx, String.fromCodePoint(0x20bb7), TEXT, 10, 0.5), 10);
});

// ---------- 看起來是一個字的（字素）一起畫 ----------

// 看起來是一個字、卻不只一個 Unicode 字元的東西。用跳脫寫：編輯器與工具不會悄悄把它們改寫成別的形式（零寬連接符號是看不見的）
const FLAG = '\u{1F1F9}\u{1F1FC}'; // 🇹🇼：兩個區域指示符號（2 個字元）
const FAMILY = '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}'; // 👨‍👩‍👧：三個 emoji 用零寬連接符號接起來（5 個字元）
const E_ACUTE = 'e\u{301}'; // é：e 加上組合用的重音符號（2 個字元）

test('spacedWidth、drawSpaced、firstChar 以字素為單位：國旗與家庭 emoji 各畫一次，字距加在字素後面', () => {
    const { spacedWidth, drawSpaced, firstChar, fontString } = CardPaint;
    const text = `${FLAG}A${FAMILY}`;
    const font = fontString(TEXT, 10);
    // 假的量字：碼位小於 U+0250 的字 0.6 × 字級，其他 1 × 字級 → 國旗（2 個字元）20、A 6、家庭 emoji（5 個字元）50
    assert.deepEqual([FLAG, 'A', FAMILY].map((piece) => fakeMeasure(font, piece)), [20, 6, 50]);

    // 字距 0.2em = 2px：三個字素的寬度加兩個字距（不是八個字元之間的七個字距）
    const ctx = createRecordingContext();
    near(spacedWidth(ctx, text, TEXT, 10, 0.2), 20 + 6 + 50 + 2 * 2, '', 1e-9);
    near(spacedWidth(ctx, FLAG, TEXT, 10, 0.5), 20, '只有一個字素：沒有字距', 1e-9);
    near(spacedWidth(ctx, `${FLAG}${FLAG}`, TEXT, 10, 0.5), 20 + 20 + 5, '兩個字素之間一個字距', 1e-9);
    assert.equal(spacedWidth(ctx, '', TEXT, 10, 0.2), 0);

    // drawSpaced：每個字素一次 fillText，x 每次前進 字素的寬度 + 字距
    drawSpaced(ctx, text, 100, 50, TEXT, 10, 0.2, '#abcdef');
    const glyphs = ctx.calls.filter((call) => call.op === 'fillText');
    assert.deepEqual(glyphs.map((call) => call.args[0]), [FLAG, 'A', FAMILY]);
    near(glyphs[0].args[1], 100, '第一個字素在 x', 1e-9);
    near(glyphs[1].args[1], 100 + 20 + 2, '第二個字素在第一個字素的寬度加一個字距之後', 1e-9);
    near(glyphs[2].args[1], 100 + 20 + 2 + 6 + 2, '', 1e-9);
    for (const call of glyphs) {
        assert.equal(call.args[2], 50);
        assert.equal(call.font, font);
        assert.equal(call.fillStyle, '#abcdef');
    }
    // 最後畫完的位置就是 spacedWidth 加上最後一個字距：整段字畫出來的寬度和量出來的一樣
    near(glyphs[2].args[1] + 50 - 100, spacedWidth(ctx, text, TEXT, 10, 0.2), '最後一個字素的右邊 = 起點 + spacedWidth', 1e-9);

    // 沒有字距（0）時字素緊接著；組合字（e 加重音符號）也是一次
    const tight = createRecordingContext();
    drawSpaced(tight, `${E_ACUTE}${FLAG}`, 0, 10, TEXT, 10, 0, '#000000');
    const tightGlyphs = tight.calls.filter((call) => call.op === 'fillText');
    assert.deepEqual(tightGlyphs.map((call) => call.args[0]), [E_ACUTE, FLAG]);
    assert.deepEqual(tightGlyphs.map((call) => call.args[1]), [0, fakeMeasure(font, E_ACUTE)]);

    // firstChar：第一個字素（一般的字就是第一個字元）
    assert.equal(firstChar(`${FLAG}X`), FLAG);
    assert.equal(firstChar(`${E_ACUTE}x`), E_ACUTE);
    assert.equal(firstChar(FAMILY), FAMILY);
    assert.equal(firstChar('Paladin'), 'P');
    assert.equal(firstChar('\u{20BB7}野'), '\u{20BB7}');
    assert.equal(firstChar(''), '');
});

test('labelBlock、drawIcon、iconLetters 也以字素為單位：小標一個字素畫一次，沒有圖示的職業畫名稱的第一個字素', () => {
    const { labelBlock, drawIcon, iconLetters } = CardPaint;
    const glyphs = (ctx) => ctx.calls.filter((call) => call.op === 'fillText').map((call) => call.args[0]);

    const labelCtx = createRecordingContext();
    labelBlock(labelCtx, `${FLAG}A${E_ACUTE}`, { kind: TEXT, font: 10, spacing: 0.2, color: '#697084' }, 200).draw(0, 0);
    assert.deepEqual(glyphs(labelCtx), [FLAG, 'A', E_ACUTE]);

    const iconCtx = createRecordingContext();
    drawIcon(iconCtx, { name: `${FLAG}戰士`, icon: null }, 0, 0, 40, '#4f74d6');
    assert.deepEqual(glyphs(iconCtx), [FLAG], '方塊裡是整個國旗，不是半個');
    assert.deepEqual(plain(iconLetters({ job: { name: `${FLAG}戰士`, icon: null }, subJobs: [{ name: `${E_ACUTE}clair`, icon: null }, { name: `${FAMILY}X`, icon: null }] })), [FLAG, E_ACUTE, FAMILY]);
});

// ---------- 小標 ----------

test('labelBlock：字距一個字一個字畫，高度是原本字級的一行，放不下整行縮小到剛好放得下（最多縮到 FIT_FLOOR）', () => {
    const { labelBlock, fontString } = CardPaint;
    const spec = { kind: TEXT, font: 10, spacing: 0.2, color: '#697084' };
    const glyphs = (ctx) => ctx.calls.filter((call) => call.op === 'fillText');

    // 放得下：原本的字級，一個字一個字畫（每個字 6 寬，字距 0.2em = 2），中線在這一行的正中，顏色照 spec
    let ctx = createRecordingContext();
    const block = labelBlock(ctx, 'WWWW', spec, 100);
    near(block.height, 10 * LINE_NORMAL, '一行字的高度', 1e-9);
    assert.equal(glyphs(ctx).length, 0, '還沒 draw 不畫');
    block.draw(20, 50);
    assert.deepEqual(glyphs(ctx).map((call) => call.args[0]), ['W', 'W', 'W', 'W']);
    glyphs(ctx).forEach((call, i) => {
        near(call.args[1], 20 + i * 8, `第 ${i + 1} 個字的 x`, 1e-9);
        near(call.args[2], 50 + block.height / 2, '中線在這一行的正中', 1e-9);
        assert.equal(call.font, fontString(TEXT, 10));
        assert.equal(call.fillStyle, '#697084');
    });

    // 放不下（原本 4 × 6 + 3 × 2 = 30，只有 15 可用）：字級縮到一半，字距跟著縮，高度照舊是原本字級的一行
    ctx = createRecordingContext();
    const narrow = labelBlock(ctx, 'WWWW', spec, 15);
    near(narrow.height, 10 * LINE_NORMAL, '高度不跟著縮', 1e-9);
    narrow.draw(0, 0);
    glyphs(ctx).forEach((call, i) => {
        assert.equal(call.font, fontString(TEXT, 5));
        near(call.args[1], i * (3 + 1), `縮小之後第 ${i + 1} 個字的 x`, 1e-9);
    });

    // 再窄也只縮到 FIT_FLOOR
    ctx = createRecordingContext();
    labelBlock(ctx, 'W'.repeat(400), spec, 1).draw(0, 0);
    assert.equal(glyphs(ctx)[0].font, fontString(TEXT, 10 * FIT_FLOOR));
    // 傳凍結的資料也行
    assert.doesNotThrow(() => labelBlock(createRecordingContext(), 'WW', Object.freeze({ ...spec, kind: Object.freeze(TEXT) }), 50).draw(0, 0));
});

// ---------- 由上往下疊 ----------

test('stackDown：放得下時間距照給的、底部一列貼著 bottom；太高時間距一起縮到剛好放得下，最小 0', () => {
    const tops = (heights) => {
        const drawn = [];
        const blocks = heights.map((height, i) => ({ height, draw: (top) => drawn.push([i, top]) }));
        return { drawn, blocks };
    };

    // 放得下：10 + 20 + 5 + 2 個間距 8 = 51 ≤ 100
    let { drawn, blocks } = tops([10, 20]);
    let foot = { height: 5, draw: (top) => drawn.push(['foot', top]) };
    assert.equal(CardPaint.stackDown(blocks, foot, { top: 0, bottom: 100, gap: 8 }), 8);
    assert.deepEqual(drawn, [[0, 0], [1, 18], ['foot', 95]]);

    // 剛好放得下：不縮
    ({ drawn, blocks } = tops([10, 20]));
    foot = { height: 5, draw: (top) => drawn.push(['foot', top]) };
    assert.equal(CardPaint.stackDown(blocks, foot, { top: 0, bottom: 51, gap: 8 }), 8);
    assert.deepEqual(drawn, [[0, 0], [1, 18], ['foot', 46]]);

    // 太高：可以用的高度 40，內容 35，剩 5 平分給 2 個間距（區塊之間 1 個、最後一個區塊與底部一列之間 1 個）
    ({ drawn, blocks } = tops([10, 20]));
    foot = { height: 5, draw: (top) => drawn.push(['foot', top]) };
    assert.equal(CardPaint.stackDown(blocks, foot, { top: 0, bottom: 40, gap: 8 }), 2.5);
    assert.deepEqual(drawn, [[0, 0], [1, 12.5], ['foot', 35]]);
    assert.equal(12.5 + 20 + 2.5, 35, '最後一個區塊的底加上間距剛好是底部一列的上緣');

    // 高度不是從 0 起算
    ({ drawn, blocks } = tops([10, 20]));
    foot = { height: 5, draw: (top) => drawn.push(['foot', top]) };
    assert.equal(CardPaint.stackDown(blocks, foot, { top: 100, bottom: 140, gap: 8 }), 2.5);
    assert.deepEqual(drawn, [[0, 100], [1, 112.5], ['foot', 135]]);

    // 怎麼縮都放不下：間距最小是 0（不是負的），區塊緊貼著排
    ({ drawn, blocks } = tops([10, 20]));
    foot = { height: 5, draw: (top) => drawn.push(['foot', top]) };
    assert.equal(CardPaint.stackDown(blocks, foot, { top: 0, bottom: 30, gap: 8 }), 0);
    assert.deepEqual(drawn, [[0, 0], [1, 10], ['foot', 25]]);

    // 沒有區塊：只有底部一列，貼著 bottom，沒有間距可縮，回傳給的間距
    ({ drawn, blocks } = tops([]));
    foot = { height: 5, draw: (top) => drawn.push(['foot', top]) };
    assert.equal(CardPaint.stackDown(blocks, foot, { top: 0, bottom: 3, gap: 8 }), 8);
    assert.deepEqual(drawn, [['foot', -2]]);

    // 一個區塊：它與底部一列之間有一個間距
    ({ drawn, blocks } = tops([30]));
    foot = { height: 5, draw: (top) => drawn.push(['foot', top]) };
    assert.equal(CardPaint.stackDown(blocks, foot, { top: 0, bottom: 40, gap: 8 }), 5);
    assert.deepEqual(drawn, [[0, 0], ['foot', 35]]);
});

// ---------- 兩欄 ----------

test('splitColumns：兩邊都有照比例分（中間隔 gap），只有左邊用整列的寬，只有右邊照右欄的寬靠左，都沒有是 null', () => {
    const { splitColumns } = CardPaint;
    // 1.3 : 1，整列 460、間隔 20：剩下 440 分成 1.3 / 2.3 與 1 / 2.3
    const both = plain(splitColumns(460, 20, [1.3, 1], { left: true, right: true }));
    near(both.left.width, (440 * 1.3) / 2.3, '左欄的寬', 1e-9);
    near(both.right.width, 440 / 2.3, '右欄的寬', 1e-9);
    assert.equal(both.left.x, 0);
    near(both.right.x, both.left.width + 20, '右欄在左欄右邊隔一個 gap', 1e-9);
    near(both.left.width + 20 + both.right.width, 460, '兩欄加間隔剛好是整列', 1e-9);
    // 1 : 1
    const even = splitColumns(460, 20, [1, 1], { left: true, right: true });
    assert.equal(even.left.width, 220);
    assert.equal(even.right.width, 220);

    // 只有左邊：整列的寬，靠左
    assert.deepEqual(plain(splitColumns(460, 20, [1.3, 1], { left: true, right: false })), { left: { x: 0, width: 460 }, right: null });
    // 只有右邊：右欄原本的寬（兩邊都有時的寬），靠左
    const rightOnly = plain(splitColumns(460, 20, [1.3, 1], { left: false, right: true }));
    assert.equal(rightOnly.left, null);
    assert.equal(rightOnly.right.x, 0);
    near(rightOnly.right.width, both.right.width, '只有時段時照右欄的寬', 1e-9);
    // 都沒有
    assert.deepEqual(plain(splitColumns(460, 20, [1.3, 1], { left: false, right: false })), { left: null, right: null });
    // 整列比間隔還窄：寬度最小是 0，不是負的
    assert.equal(splitColumns(10, 20, [1, 1], { left: true, right: true }).left.width, 0);
});

test('twoColumns：兩欄並排，寬度與位置照 splitColumns，兩欄從上面對齊、高度是較高的那一欄；畫不出來（回傳 null）的那一邊不畫，另一邊照舊在自己的欄裡', () => {
    const { twoColumns } = CardPaint;
    const calls = [];
    const column = (name, height) => (width) => {
        calls.push(['made', name, width]);
        return { height, draw: (x, top) => calls.push(['draw', name, x, top]) };
    };
    const reset = () => { calls.length = 0; };
    const room = 440; // 整列 460 扣掉間隔 20
    const leftWidth = (room * 1.3) / 2.3;
    const rightWidth = room / 2.3;

    // 兩邊都有：1.3 : 1，各拿到自己那一欄的寬；高度是較高的那一欄；整列的左邊是 100，右欄在左欄右邊隔一個 gap，兩欄的 top 一樣
    const both = twoColumns(100, 460, 20, [1.3, 1], { left: column('left', 30), right: column('right', 50) });
    assert.equal(both.height, 50);
    assert.deepEqual(plain(calls.map((call) => call.slice(0, 2))), [['made', 'left'], ['made', 'right']]);
    near(calls[0][2], leftWidth, '左欄的寬', 1e-9);
    near(calls[1][2], rightWidth, '右欄的寬', 1e-9);
    reset();
    both.draw(7);
    assert.equal(calls.length, 2);
    assert.deepEqual(plain(calls[0]), ['draw', 'left', 100, 7]);
    assert.deepEqual(plain(calls[1].slice(0, 2).concat([calls[1][3]])), ['draw', 'right', 7]);
    near(calls[1][2], 100 + leftWidth + 20, '右欄在左欄右邊隔一個 gap', 1e-9);

    // 高度取較高的那一欄，不管是哪一邊
    reset();
    assert.equal(twoColumns(100, 460, 20, [1.3, 1], { left: column('left', 80), right: column('right', 50) }).height, 80);

    // 只有左邊：整列的寬；只有右邊：右欄原本的寬（兩邊都有時的寬），靠左（x 就是整列的左邊）
    reset();
    const leftOnly = twoColumns(100, 460, 20, [1.3, 1], { left: column('left', 30), right: null });
    assert.deepEqual(plain(calls), [['made', 'left', 460]]);
    reset();
    leftOnly.draw(7);
    assert.deepEqual(plain(calls), [['draw', 'left', 100, 7]]);
    reset();
    const rightOnly = twoColumns(100, 460, 20, [1.3, 1], { left: null, right: column('right', 50) });
    assert.equal(calls.length, 1);
    near(calls[0][2], rightWidth, '只有右邊時照右欄的寬', 1e-9);
    reset();
    rightOnly.draw(7);
    assert.deepEqual(plain(calls), [['draw', 'right', 100, 7]]);

    // 一邊畫不出來（回傳 null，例如一顆膠囊都排不進去）：那一邊不畫，另一邊照舊在自己的欄裡（寬度照兩邊都有時的算法，位置在右欄）
    reset();
    const emptyLeft = twoColumns(100, 460, 20, [1.3, 1], { left: () => null, right: column('right', 50) });
    assert.equal(emptyLeft.height, 50);
    reset();
    emptyLeft.draw(7);
    assert.equal(calls.length, 1);
    assert.deepEqual(plain(calls[0].slice(0, 2).concat([calls[0][3]])), ['draw', 'right', 7]);
    near(calls[0][2], 100 + leftWidth + 20, '右欄還在右邊', 1e-9);

    // 都沒有（或都畫不出來）是 null
    assert.equal(twoColumns(100, 460, 20, [1.3, 1], { left: null, right: null }), null);
    assert.equal(twoColumns(100, 460, 20, [1.3, 1], { left: () => null, right: () => null }), null);
    // 回傳的區塊可以直接放進 stackDown：{ height, draw(top) }
    reset();
    const drawn = [];
    CardPaint.stackDown([twoColumns(100, 460, 20, [1.3, 1], { left: column('left', 30), right: null })], { height: 5, draw: (top) => drawn.push(['foot', top]) }, { top: 10, bottom: 100, gap: 4 });
    assert.deepEqual(plain(calls), [['made', 'left', 460], ['draw', 'left', 100, 10]]);
    assert.deepEqual(drawn, [['foot', 95]]);
    // 傳凍結的資料也行
    assert.doesNotThrow(() => twoColumns(100, 460, 20, Object.freeze([1.3, 1]), Object.freeze({ left: column('left', 1), right: null })));
});

// ---------- 三欄資訊的內容 ----------

test('metaItems：部隊、大國防聯軍、在找什麼，沒填的拿掉，部隊的值是名稱加簡稱', () => {
    const { metaItems } = CardPaint;
    const labels = { fc: '部隊', gc: '大國防聯軍', looking: '在找什麼' };
    const view = (fields) => ({ fcName: '', tag: '', gc: '', looking: '', labels, ...fields });

    assert.deepEqual(plain(metaItems(view({ fcName: 'Moonlit Garden', tag: '«MOON»', gc: '雙蛇黨', looking: '固定隊、部隊' }))), [
        { label: '部隊', value: 'Moonlit Garden «MOON»' },
        { label: '大國防聯軍', value: '雙蛇黨' },
        { label: '在找什麼', value: '固定隊、部隊' }
    ]);
    // 部隊只填名稱或只填簡稱：只寫填了的那一個，不留空的「«»」
    assert.deepEqual(plain(metaItems(view({ fcName: 'Moonlit Garden' }))), [{ label: '部隊', value: 'Moonlit Garden' }]);
    assert.deepEqual(plain(metaItems(view({ tag: '«MOON»' }))), [{ label: '部隊', value: '«MOON»' }]);
    // 沒填的拿掉，剩下的照原本的順序
    assert.deepEqual(plain(metaItems(view({ gc: '雙蛇黨' }))), [{ label: '大國防聯軍', value: '雙蛇黨' }]);
    assert.deepEqual(plain(metaItems(view({ fcName: 'Moonlit Garden', looking: '朋友' }))).map((item) => item.label), ['部隊', '在找什麼']);
    assert.deepEqual(plain(metaItems(view({}))), []);
    // 小標是 view.labels 的字（介面語言）
    assert.deepEqual(plain(metaItems(view({ gc: 'Maelstrom', labels: { fc: 'Free Company', gc: 'Grand Company', looking: 'Looking for' } }))), [{ label: 'Grand Company', value: 'Maelstrom' }]);
    // 傳凍結的 view 也行
    assert.doesNotThrow(() => metaItems(Object.freeze(view({ gc: 'x' }))));
});

test('metaCells：三欄資訊排成三等分的欄（有值的從左邊那欄排），每一欄是小標加最多 2 行的值，同一列一樣高；padX、padY 是每一欄裡面的內距；paintBox 在每一欄的字之前畫底', () => {
    const { metaCells } = CardPaint;
    const labels = { fc: '部隊', gc: '大國防聯軍', looking: '在找什麼' };
    const view = (fields) => ({ fcName: '', tag: '', gc: '', looking: '', labels, ...fields });
    const label = { kind: TEXT, font: 10, spacing: 0, color: '#aaaaaa' };
    const spec = { x: 100, width: 320, gap: 10, label, kind: TEXT, font: 10, color: '#111111' }; // 三欄各 100 寬，左邊分別在 100、210、320
    const LINE = 10 * LINE_NORMAL; // 小標與值的一行：字級都是 10
    const full = view({ fcName: 'Moonlit Garden', tag: '«MOON»', gc: '雙蛇黨', looking: '固定隊' });
    const at = (ctx, text) => {
        const found = lines(ctx).filter((line) => line.text === text);
        assert.equal(found.length, 1, `剛好有一段「${text}」`);
        return found[0];
    };

    // 沒有任何一項是 null
    assert.equal(metaCells(createRecordingContext(), view({}), spec), null);

    // 三項都有：部隊的值「Moonlit Garden «MOON»」（21 個字 × 6 = 126）一欄（100）放不下，在空白處折成 2 行，另外兩個是一行；
    // 同一列一樣高：小標一行加最多的那一欄的行數
    const ctx = createRecordingContext();
    const block = metaCells(ctx, full, spec);
    near(block.height, LINE + 2 * LINE, '小標加 2 行', 1e-9);
    assert.equal(lines(ctx).length, 0, '還沒 draw 不畫');
    block.draw(50);
    for (const [text, x] of [['部隊', 100], ['大國防聯軍', 210], ['在找什麼', 320]]) {
        near(at(ctx, text).x, x, `小標「${text}」的 x`, 1e-9);
        near(at(ctx, text).y, 50 + LINE / 2, `小標「${text}」的中線`, 1e-9);
        assert.equal(at(ctx, text).font, CardPaint.fontString(TEXT, 10));
        assert.equal(at(ctx, text).fillStyle, '#aaaaaa');
    }
    for (const [text, x, row] of [['Moonlit Garden', 100, 0], ['«MOON»', 100, 1], ['雙蛇黨', 210, 0], ['固定隊', 320, 0]]) {
        near(at(ctx, text).x, x, `值「${text}」的 x`, 1e-9);
        near(at(ctx, text).y, 50 + LINE + LINE * (row + 0.5), `值「${text}」的中線`, 1e-9);
        assert.equal(at(ctx, text).fillStyle, '#111111');
    }

    // 沒填的拿掉，有值的從左邊那欄排（欄寬照舊是三等分）；每次 draw 都照給的 top
    const gcOnly = createRecordingContext();
    const gcBlock = metaCells(gcOnly, view({ gc: '雙蛇黨' }), spec);
    near(gcBlock.height, LINE + LINE, '一行的值', 1e-9);
    gcBlock.draw(0);
    near(at(gcOnly, '大國防聯軍').x, 100, '只有大國防聯軍時它在第一欄');
    assert.equal(lines(gcOnly).length, 2);

    // 值最多 2 行，超過的最後一行接「…」，每一行都在欄裡
    const long = createRecordingContext();
    metaCells(long, view({ gc: '寬'.repeat(80) }), spec).draw(0);
    const wrapped = lines(long).filter((line) => line.fillStyle === '#111111');
    assert.equal(wrapped.length, 2);
    assert.ok(wrapped[1].text.endsWith('…'));
    for (const line of wrapped) assert.ok(line.x + line.width <= 210 + 100 + 1e-9, '在自己那一欄裡');

    // padX、padY：每一欄裡面的內距，小標與值都在內距裡面，值折行的寬度扣掉左右內距（這一欄的字比 92 寬就折）；paintBox 先畫每一欄的底
    const padded = createRecordingContext();
    const paintBox = (x, top, width, height) => padded.fillRect(x, top, width, height);
    const paddedBlock = metaCells(padded, view({ fcName: 'Moonlit Garden', gc: '雙蛇黨', looking: '固定隊' }), { ...spec, padX: 4, padY: 3, paintBox });
    near(paddedBlock.height, 2 * 3 + LINE + LINE, '上下內距加小標加一行', 1e-9);
    paddedBlock.draw(50);
    const boxes = padded.calls.map((call, i) => ({ call, i })).filter(({ call }) => call.op === 'fillRect');
    assert.equal(boxes.length, 3, '每一欄一個底');
    boxes.forEach(({ call }, column) => {
        assert.deepEqual(plain(call.args.slice(0, 3)), [100 + 110 * column, 50, 100], `第 ${column + 1} 個底的位置與欄寬`);
        near(call.args[3], paddedBlock.height, '每一欄一樣高', 1e-9);
    });
    for (const [text, column] of [['部隊', 0], ['Moonlit Garden', 0], ['大國防聯軍', 1], ['雙蛇黨', 1], ['在找什麼', 2], ['固定隊', 2]]) {
        near(at(padded, text).x, 100 + 110 * column + 4, `「${text}」從欄的左邊再隔 padX 開始`, 1e-9);
        // 這一欄的底在這一欄的字之前畫（字才不會被蓋住）
        const first = padded.calls.findIndex((call) => call.op === 'fillText' && call.args[1] >= 100 + 110 * column + 4 - 1e-9 && call.args[1] < 100 + 110 * (column + 1));
        assert.ok(boxes[column].i < first, `第 ${column + 1} 欄的底在字之前`);
    }
    near(at(padded, '部隊').y, 50 + 3 + LINE / 2, '小標在上內距之後', 1e-9);
    near(at(padded, 'Moonlit Garden').y, 50 + 3 + LINE + LINE / 2, '值在小標下面', 1e-9);
    // 內距讓可用的寬度變成 92：「Moonlit Garden」（84）放得下一行，「Moonlit Garden «MOON»」（126）還是要折
    assert.equal(lines(padded).filter((line) => line.text.includes('«')).length, 0);
    const wrappedPadded = createRecordingContext();
    metaCells(wrappedPadded, full, { ...spec, padX: 4, padY: 3 }).draw(0);
    assert.ok(lines(wrappedPadded).some((line) => line.text === '«MOON»'));
    // 傳凍結的資料也行
    assert.doesNotThrow(() => metaCells(createRecordingContext(), Object.freeze(full), Object.freeze({ ...spec, label: Object.freeze(label) })).draw(0));
});

// ---------- 底部一列 ----------

test('footText 與 footBlock：右邊「FF14.tw · SE 版權字」整句畫出來，左邊聯絡方式放不下整行縮小，中間至少隔 gap', () => {
    const { footText, footBlock } = CardPaint;
    const view = { mark: 'FF14.tw', notice: 'FINAL FANTASY XIV © SQUARE ENIX', contact: 'Discord: luna_star' };
    assert.equal(footText(view), 'FF14.tw · FINAL FANTASY XIV © SQUARE ENIX');

    const spec = { kind: TEXT, font: 10, color: '#cccccc', gap: 20, x: 100, width: 400 };
    const rightWidth = fakeMeasure('10px x', footText(view)); // 41 個字 × 6 = 246
    assert.equal(rightWidth, 246);
    const texts = (ctx) => ctx.calls.filter((call) => call.op === 'fillText');

    // 放得下：右邊貼著右緣、左邊貼著左緣，都用 spec 的字級與顏色，兩段字在同一條中線上，高度是一行字
    let ctx = createRecordingContext();
    const block = footBlock(ctx, view, spec);
    near(block.height, 10 * LINE_NORMAL, '一行字的高度');
    assert.equal(texts(ctx).length, 0, '還沒 draw 不畫');
    block.draw(50);
    assert.equal(texts(ctx).length, 2);
    const right = texts(ctx).find((call) => call.args[0] === 'FF14.tw · FINAL FANTASY XIV © SQUARE ENIX');
    const left = texts(ctx).find((call) => call.args[0] === 'Discord: luna_star');
    assert.equal(right.args[1], 100 + 400 - rightWidth);
    assert.equal(left.args[1], 100);
    for (const call of [left, right]) {
        near(call.args[2], 50 + block.height / 2, '中線在這一列的正中');
        assert.equal(call.font, CardPaint.fontString(TEXT, 10));
        assert.equal(call.fillStyle, '#cccccc');
    }

    // 聯絡方式太長：整行縮小到剛好放得下（和右邊至少隔 gap），右邊照舊整句不縮
    ctx = createRecordingContext();
    const long = 'W'.repeat(40); // 40 × 6 = 240，能用的是 400 - 246 - 20 = 134
    footBlock(ctx, { ...view, contact: long }, spec).draw(0);
    const rightLong = texts(ctx).find((call) => call.args[0] === footText(view));
    const leftLong = texts(ctx).find((call) => call.args[0] === long);
    assert.equal(rightLong.font, CardPaint.fontString(TEXT, 10), '右邊不縮');
    assert.equal(leftLong.font, CardPaint.fontString(TEXT, 10 * (134 / 240)));
    near(100 + fakeMeasure(leftLong.font, long) + 20, rightLong.args[1], '左邊的右緣加上 gap 剛好碰到右邊的左緣（字級取到 0.01px，差一點點）', 0.2);

    // 縮到 FIT_FLOOR 為止
    ctx = createRecordingContext();
    footBlock(ctx, { ...view, contact: 'W'.repeat(400) }, spec).draw(0);
    assert.equal(texts(ctx).find((call) => call.args[0] === 'W'.repeat(400)).font, CardPaint.fontString(TEXT, 10 * FIT_FLOOR));

    // 沒有聯絡方式：只畫右邊，還是靠右
    ctx = createRecordingContext();
    footBlock(ctx, { ...view, contact: '' }, spec).draw(0);
    assert.equal(texts(ctx).length, 1);
    assert.equal(texts(ctx)[0].args[1], 100 + 400 - rightWidth);

    // 傳凍結的資料也行
    assert.doesNotThrow(() => footBlock(createRecordingContext(), Object.freeze({ ...view }), Object.freeze({ ...spec, kind: Object.freeze(TEXT) })).draw(0));
});

test('drawInfoColumn：區塊（沒填的是 null，拿掉）由上往下疊、之間隔 gap，底部一列貼著資訊欄的底，x 與寬照資訊欄；放不下時間距一起縮小', () => {
    const { drawInfoColumn, footText } = CardPaint;
    const info = { x: 100, y: 40, width: 300, height: 200 };
    const view = { mark: 'FF14.tw', notice: 'N', contact: 'Hi' };
    const foot = { kind: TEXT, font: 10, color: '#333333', gap: 20 };
    const tops = [];
    const block = (name, height) => ({ height, draw: (top) => tops.push([name, top]) });

    // null 拿掉；放得下時第一個區塊貼著資訊欄的上緣，之間隔 gap（12）
    const ctx = createRecordingContext();
    drawInfoColumn(ctx, view, info, { blocks: [null, block('a', 30), null, block('b', 50), null], foot, gap: 12 });
    assert.deepEqual(tops, [['a', 40], ['b', 40 + 30 + 12]]);
    // 底部一列：高是一行字（14.5），貼著資訊欄的底，兩段字在同一條中線上；右邊整句貼著資訊欄的右緣，左邊聯絡方式在資訊欄的左邊
    const texts = ctx.calls.filter((call) => call.op === 'fillText');
    assert.equal(texts.length, 2);
    const right = texts.find((call) => call.args[0] === footText(view));
    const left = texts.find((call) => call.args[0] === 'Hi');
    near(right.args[2], 40 + 200 - (10 * LINE_NORMAL) / 2, '中線貼著底', 1e-9);
    near(left.args[2], right.args[2], '兩段字同一條中線', 1e-9);
    near(right.args[1] + fakeMeasure(right.font, footText(view)), 100 + 300, '右邊貼著資訊欄的右緣', 1e-9);
    assert.equal(left.args[1], 100);
    assert.equal(right.fillStyle, '#333333');

    // 全部都是 null：只有底部一列
    const emptyCtx = createRecordingContext();
    tops.length = 0;
    drawInfoColumn(emptyCtx, view, info, { blocks: [null, null], foot, gap: 12 });
    assert.deepEqual(tops, []);
    assert.equal(emptyCtx.calls.filter((call) => call.op === 'fillText').length, 2);

    // 放不下（兩個 100 高加底部一列 14.5 比 200 高）：間距一起縮到 0（stackDown 的規矩），不超出資訊欄
    tops.length = 0;
    drawInfoColumn(createRecordingContext(), view, info, { blocks: [block('a', 100), block('b', 100)], foot, gap: 12 });
    assert.deepEqual(tops, [['a', 40], ['b', 140]]);
    // 傳凍結的資料也行
    assert.doesNotThrow(() => drawInfoColumn(createRecordingContext(), Object.freeze(view), Object.freeze(info), Object.freeze({ blocks: Object.freeze([null]), foot: Object.freeze(foot), gap: 12 })));
});

// ---------- 要載入的字 ----------

test('iconLetters：沒有圖示的職業（主職與其他職業）各是名稱的第一個字；有圖示的、沒有主職、名稱是空的都不算；ICON_LETTER 是 drawIcon 畫這個字用的字型', () => {
    const { iconLetters, ICON_LETTER } = CardPaint;
    const view = {
        job: { name: 'Beastmaster', icon: null, level: 'Lv 100' },
        subJobs: [{ name: '白魔法師', icon: null }, { name: 'Bard', icon: picture('brd') }, { name: String.fromCodePoint(0x20bb7) + '野', icon: null }]
    };
    assert.deepEqual(plain(iconLetters(view)), ['B', '白', String.fromCodePoint(0x20bb7)], '主職在前、其他職業照順序；代理對不會被切成兩半');
    assert.deepEqual(plain(iconLetters({ job: { name: 'Paladin', icon: picture('pld') }, subJobs: [{ name: 'Bard', icon: picture('brd') }] })), [], '都有圖示');
    assert.deepEqual(plain(iconLetters({ job: null, subJobs: [] })), [], '沒有主職、沒有其他職業');
    assert.deepEqual(plain(iconLetters({ job: null, subJobs: [{ name: '', icon: null }] })), [], '名稱是空的沒有字可畫');
    // 傳凍結的 view 也行
    assert.doesNotThrow(() => iconLetters(Object.freeze({ job: Object.freeze({ name: 'Bard', icon: null }), subJobs: Object.freeze([]) })));

    // drawIcon 真的用 ICON_LETTER 畫這個字：風格的 texts() 把這些字列進 ICON_LETTER 的字型，才載得到
    assert.equal(Object.isFrozen(ICON_LETTER), true);
    const ctx = createRecordingContext();
    CardPaint.drawIcon(ctx, { name: 'Beastmaster', icon: null }, 0, 0, 40, '#4f74d6');
    const letter = ctx.calls.find((call) => call.op === 'fillText');
    assert.equal(letter.args[0], 'B');
    assert.equal(letter.font, CardPaint.fontString(ICON_LETTER, 22), '字級是方塊邊長的 0.55 倍');
});

test('listTexts：每一組 [字型, ...字] 照順序列成 { kind, text }，不是字串與空字串略過', () => {
    const bold = { weight: 700, family: FAMILIES.sans };
    const listed = plain(CardPaint.listTexts([
        [bold, 'A', '', undefined, null, 3, 'B'],
        [TEXT, ' ', 'C'],
        [bold],
        [TEXT, 'D']
    ]));
    assert.deepEqual(listed, [
        { kind: bold, text: 'A' }, { kind: bold, text: 'B' },
        { kind: TEXT, text: ' ' }, { kind: TEXT, text: 'C' },
        { kind: TEXT, text: 'D' }
    ]);
    assert.deepEqual(plain(CardPaint.listTexts([])), []);
    // 傳凍結的資料也行；字型物件原樣放進去（不複製）
    const frozen = Object.freeze([Object.freeze([Object.freeze(bold), 'x'])]);
    const [entry] = CardPaint.listTexts(frozen);
    assert.equal(entry.kind, frozen[0][0]);
});

// ---------- 預設背景畫在任何一塊 rect 裡 ----------

test('drawBackdrop：畫在傳進來的 rect 裡，漸層從 rect 左上到右下，底色填滿 rect，每顆光點都在 rect 裡，光點只是平移、半徑照 unit 算', () => {
    const { drawBackdrop } = CardPaint;
    const rect = { x: 100, y: 50, width: 300, height: 200 };
    const ctx = createRecordingContext();
    drawBackdrop(ctx, '#4f74d6', rect, 12);

    const gradient = ctx.calls.find((call) => call.op === 'createLinearGradient');
    assert.deepEqual(plain(gradient.args), [100, 50, 400, 250], '從 rect 的左上到右下');
    assert.deepEqual(plain(gradient.result.stops), [[0, '#1b1d45'], [1, '#4f74d6']]);
    const base = ctx.calls.find((call) => call.op === 'fillRect');
    assert.deepEqual(plain(base.args), [100, 50, 300, 200], '底色填滿 rect');
    assert.equal(base.fillStyle, gradient.result);

    const dots = ctx.calls.filter((call) => call.op === 'createRadialGradient').map((call) => call.args);
    assert.ok(dots.length >= 20, `光點有 ${dots.length} 個`);
    for (const [x, y, , , , radius] of dots) {
        assert.ok(x - radius >= rect.x - 1e-9 && x + radius <= rect.x + rect.width + 1e-9, `光點的左右在 rect 裡（${x}、${radius}）`);
        assert.ok(y - radius >= rect.y - 1e-9 && y + radius <= rect.y + rect.height + 1e-9, `光點的上下在 rect 裡（${y}、${radius}）`);
    }

    // 平移：在原點畫同樣大小的 rect，每顆光點的位置只差 rect 的左上角（亂數種子固定，和 rect 的位置無關）
    const origin = createRecordingContext();
    drawBackdrop(origin, '#4f74d6', { x: 0, y: 0, width: 300, height: 200 }, 12);
    const originDots = origin.calls.filter((call) => call.op === 'createRadialGradient').map((call) => call.args);
    assert.equal(originDots.length, dots.length);
    originDots.forEach(([x, y, , , , radius], i) => {
        near(dots[i][0], x + 100, `第 ${i + 1} 顆的 x`, 1e-9);
        near(dots[i][1], y + 50, `第 ${i + 1} 顆的 y`, 1e-9);
        near(dots[i][5], radius, `第 ${i + 1} 顆的半徑`, 1e-9);
    });
    // 半徑照 unit 算：unit 加倍，每顆光點的半徑加倍
    const bigger = createRecordingContext();
    drawBackdrop(bigger, '#4f74d6', { x: 0, y: 0, width: 300, height: 200 }, 24);
    bigger.calls.filter((call) => call.op === 'createRadialGradient').forEach((call, i) => near(call.args[5], originDots[i][5] * 2, `第 ${i + 1} 顆的半徑加倍`, 1e-9));
});

// ---------- 照片框 ----------

test('drawPhotoBox：clip 成圓角的框；有截圖照位置填滿框，沒有截圖（或圖的大小不對）畫預設背景；clip 包在 save／restore 裡', () => {
    const { drawPhotoBox } = CardPaint;
    const box = { x: 40, y: 30, width: 200, height: 300 };
    const PHOTO = { picture: 'shot' };
    const crop = { x: 0.5, y: -0.25, zoom: 1.5 };
    const opsOf = (ctx) => ctx.calls.map((call) => call.op);

    // 有截圖：save → 圓角的路徑 → clip → 照 coverRect 的位置畫（加上框的左上角）→ restore
    const withPhoto = createRecordingContext();
    drawPhotoBox(withPhoto, { image: { source: PHOTO, width: 2000, height: 1000 }, crop, accent: '#4f74d6' }, box, 16, 12);
    assert.deepEqual(opsOf(withPhoto), ['save', 'beginPath', 'roundRect', 'clip', 'drawImage', 'restore']);
    assert.deepEqual(plain(withPhoto.calls[2].args), [40, 30, 200, 300, 16]);
    const rect = CardLayout.coverRect(2000, 1000, 200, 300, crop);
    assert.equal(withPhoto.calls[4].args[0], PHOTO);
    assert.deepEqual(plain(withPhoto.calls[4].args.slice(1)), [40 + rect.dx, 30 + rect.dy, rect.dw, rect.dh]);

    // 沒有截圖：預設背景畫在框裡（漸層從框的左上到右下），沒有 drawImage；clip 之後、restore 之前
    const plainBox = createRecordingContext();
    drawPhotoBox(plainBox, { image: null, crop, accent: '#4f74d6' }, box, 16, 12);
    assert.equal(plainBox.calls[0].op, 'save');
    assert.equal(plainBox.calls.at(-1).op, 'restore');
    assert.ok(opsOf(plainBox).indexOf('clip') < opsOf(plainBox).indexOf('createLinearGradient'), '預設背景畫在 clip 裡');
    assert.deepEqual(plain(plainBox.calls.find((call) => call.op === 'createLinearGradient').args), [40, 30, 240, 330]);
    assert.equal(opsOf(plainBox).includes('drawImage'), false);

    // 圖的大小不對（寬或高是 0）：不畫它，改畫預設背景
    const broken = createRecordingContext();
    drawPhotoBox(broken, { image: { source: PHOTO, width: 0, height: 0 }, crop, accent: '#4f74d6' }, box, 16, 12);
    assert.equal(opsOf(broken).includes('drawImage'), false);
    assert.ok(opsOf(broken).includes('createLinearGradient'));

    // 沒有位置（crop 不是物件）：照 coverRect 的規矩當成置中、填滿
    const noCrop = createRecordingContext();
    drawPhotoBox(noCrop, { image: { source: PHOTO, width: 2000, height: 1000 }, crop: undefined, accent: '#4f74d6' }, box, 16, 12);
    const centered = CardLayout.coverRect(2000, 1000, 200, 300, { x: 0, y: 0, zoom: 1 });
    assert.deepEqual(plain(noCrop.calls.find((call) => call.op === 'drawImage').args.slice(1)), [40 + centered.dx, 30 + centered.dy, centered.dw, centered.dh]);

    // 沒有 roundRect 的瀏覽器：改用 arcTo 畫一樣的圓角路徑
    const old = createRecordingContext({ missing: ['roundRect'] });
    drawPhotoBox(old, { image: null, crop, accent: '#4f74d6' }, box, 16, 12);
    assert.ok(opsOf(old).includes('arcTo') && opsOf(old).includes('clip'));
    // 傳凍結的資料也行
    assert.doesNotThrow(() => drawPhotoBox(createRecordingContext(), Object.freeze({ image: Object.freeze({ source: PHOTO, width: 20, height: 10 }), crop: Object.freeze({ ...crop }), accent: '#4f74d6' }), Object.freeze({ ...box }), 16, 12));
});

// ---------- 照片框與資訊欄的範圍 ----------

test('photoInfoBoxes：橫版照片框在左、資訊欄在右，直版照片框在上、資訊欄在下，中間隔 gap；照片框占內容寬（橫版）或內容高（直版）的 share；photo.margin 只讓照片框矮一截，沒有 photo 是 0', () => {
    const { photoInfoBoxes } = CardPaint;
    const share = { left: 0.25, top: 0.5 };
    const landscapeG = { width: 1000, height: 500, pad: 20, gap: 10, photoAt: 'left' }; // 內容 960 × 460
    const portraitG = { width: 800, height: 1000, pad: 20, gap: 10, photoAt: 'top' }; // 內容 760 × 960

    // 橫版：照片框寬是內容寬的 25%（240）、和內容一樣高；資訊欄在右邊隔 gap，和內容一樣高，右緣停在內距上
    const landscape = plain(photoInfoBoxes(landscapeG, share));
    assert.deepEqual(landscape.photo, { x: 20, y: 20, width: 240, height: 460 });
    assert.deepEqual(landscape.info, { x: 270, y: 20, width: 710, height: 460 });
    assert.equal(landscape.info.x + landscape.info.width, 1000 - 20);
    // 直版：照片框寬是整個內容寬、高是內容高的 50%（480）；資訊欄在下面隔 gap，底邊停在內距上
    const portrait = plain(photoInfoBoxes(portraitG, share));
    assert.deepEqual(portrait.photo, { x: 20, y: 20, width: 760, height: 480 });
    assert.deepEqual(portrait.info, { x: 20, y: 510, width: 760, height: 470 });
    assert.equal(portrait.info.y + portrait.info.height, 1000 - 20);

    // photo.margin：照片框下面留給別的東西（資訊卡的徽章）的空間，只讓照片框矮一截，資訊欄不動（橫版直版都一樣）
    const landscapeMargin = plain(photoInfoBoxes({ ...landscapeG, photo: { radius: 3, margin: 15 } }, share));
    assert.deepEqual(landscapeMargin.photo, { x: 20, y: 20, width: 240, height: 445 });
    assert.deepEqual(landscapeMargin.info, landscape.info);
    const portraitMargin = plain(photoInfoBoxes({ ...portraitG, photo: { margin: 15 } }, share));
    assert.deepEqual(portraitMargin.photo, { x: 20, y: 20, width: 760, height: 465 });
    assert.deepEqual(portraitMargin.info, portrait.info, '資訊欄從內容高的 share.top 再隔 gap 開始，不管 margin');
    // 有 photo 但沒有 margin（名片的 photo 只有光環與陰影的數字）和沒有 photo 一樣
    assert.deepEqual(plain(photoInfoBoxes({ ...portraitG, photo: { radius: 3, ring: 1 } }, share)), portrait);

    // 另一個方向的 share 用不到，可以不給；每次回傳新的物件，傳凍結的資料也行
    assert.deepEqual(plain(photoInfoBoxes(landscapeG, { left: 0.25 })), landscape);
    assert.notEqual(photoInfoBoxes(landscapeG, share), photoInfoBoxes(landscapeG, share));
    assert.doesNotThrow(() => photoInfoBoxes(Object.freeze({ ...portraitG, photo: Object.freeze({ margin: 15 }) }), Object.freeze(share)));
});

// ---------- 時段格子 ----------

test('hoursBlock：沒有時段（view.hours 是 null）是 null；有時段回傳寬、高與 draw', () => {
    const ctx = createRecordingContext();
    const spec = { kind: TEXT, width: 300, font: 10, cell: 8, gapX: 4, gapY: 3, radius: 2, labelColor: '#aaaaaa', offColor: '#222222', accent: '#4f74d6' };
    assert.equal(CardPaint.hoursBlock(ctx, null, spec), null);

    const hours = { days: ['平日', '假日'], slots: ['早上', '下午', '晚上', '深夜'], on: [[false, false, true, true], [false, true, true, false]] };
    const block = CardPaint.hoursBlock(ctx, hours, spec);
    assert.equal(block.width, 300);
    near(block.height, 3 * 10 * LINE_NORMAL + 2 * 3, '一列欄名加兩列格子，列距 gapY');
    assert.equal(ctx.calls.filter((call) => call.op === 'fillText').length, 0, '還沒 draw 不畫');
    block.draw(10, 20);
    assert.equal(ctx.calls.filter((call) => call.op === 'fillText').length, 6, '4 個欄名與 2 個列名');
    const cells = ctx.calls.filter((call) => call.op === 'fill');
    assert.equal(cells.length, 8);
    assert.equal(cells.filter((call) => call.fillStyle === '#4f74d6').length, 4, '有選的是重點色');
    assert.equal(cells.filter((call) => call.fillStyle === '#222222').length, 4, '沒選的是淡色');
    // 格子與整塊的右緣對齊：最右邊的格子右邊是 x + width
    const lastCell = ctx.calls.filter((call) => call.op === 'roundRect').map((call) => call.args[0] + call.args[2]);
    near(Math.max(...lastCell), 10 + 300, '最右邊的格子貼著區塊的右緣', 1e-9);
    // 傳凍結的資料也行
    assert.doesNotThrow(() => CardPaint.hoursBlock(createRecordingContext(), Object.freeze(hours), Object.freeze({ ...spec, kind: Object.freeze(TEXT) })).draw(0, 0));
});

test('fitChips 與 CardLayout.layoutChips 的座標一致：從 (0, 0) 起，列與列之間隔 gap', () => {
    const ctx = createRecordingContext();
    const spec = { kind: TEXT, font: 10, padX: 2, padY: 1, gap: 4, border: 1, maxWidth: 100, maxRows: 2, floor: 0.6 };
    const labels = ['寬寬寬寬', '寬寬寬寬', '寬寬寬寬'];
    const result = CardPaint.fitChips(ctx, labels, spec);
    const direct = CardLayout.layoutChips(labels, measureOf(10), { maxWidth: 100, height: 10 * LINE_NORMAL + 2 + 2, padX: 3, gap: 4, rowGap: 4, maxRows: 2 });
    assert.deepEqual(plain(result.chips), plain(direct));
});

// ---------- 喜歡的內容與遊玩時段 ----------

test('likesAndHours：左邊喜歡的內容（小標加膠囊）、右邊遊玩時段（小標加格子），沒有喜歡的內容或沒有時段那一邊就沒有；膠囊的邊框、底、邊、字色照 spec，排成最多 2 列、排不下時整組縮小到最多 60%', () => {
    const { likesAndHours, fontString } = CardPaint;
    const label = { kind: TEXT, font: 10, spacing: 0, color: '#aaaaaa' };
    const chips = { kind: TEXT, font: 10, padX: 4, padY: 2, gap: 3, border: 1, fill: 'rgba(1,2,3,0.5)', stroke: '#abcdef', color: '#222222' };
    const hours = { kind: TEXT, font: 10, cell: 8, gapX: 4, gapY: 3, radius: 2, labelColor: '#999999', offColor: '#eeeeee', accent: '#4f74d6' };
    const spec = { x: 100, width: 420, gap: 20, ratio: [1, 1], label, chips, hours }; // 兩欄各 200 寬：左欄 100、右欄 320
    const HOURS = { days: ['平日', '假日'], slots: ['早上', '下午', '晚上', '深夜'], on: [[false, false, true, true], [false, true, true, false]] };
    const view = (fields) => ({ likes: ['Savage', 'Glamour'], hours: HOURS, labels: { likes: '喜歡的內容', hours: '遊玩時段' }, ...fields });
    const LINE = 10 * LINE_NORMAL;
    const at = (ctx, text) => lines(ctx).find((line) => line.text === text);
    const capsules = (ctx, fillStyle) => ctx.calls.filter((call) => call.op === 'fill' && call.fillStyle === fillStyle);

    // 兩邊都有：左欄在 x（100），右欄在左欄右邊隔 gap（320）；小標用 label 的字距與顏色，在最上面；高度是較高的那一欄（時段：小標加 3 行加 2 個列距）
    const ctx = createRecordingContext();
    const block = likesAndHours(ctx, view(), spec);
    near(block.height, LINE + 3 * LINE + 2 * 3, '時段那一欄比較高', 1e-9);
    assert.equal(lines(ctx).length, 0, '還沒 draw 不畫');
    block.draw(50);
    near(at(ctx, '喜歡的內容').x, 100, '左欄的小標', 1e-9);
    near(at(ctx, '遊玩時段').x, 320, '右欄的小標在左欄右邊隔 gap', 1e-9);
    for (const text of ['喜歡的內容', '遊玩時段']) {
        near(at(ctx, text).y, 50 + LINE / 2, `「${text}」在最上面`, 1e-9);
        assert.equal(at(ctx, text).fillStyle, '#aaaaaa');
    }
    // 膠囊：2 顆，底是 fill，邊是 stroke、線寬是 border，字是 color、在小標下面；字左右的內距一樣，都是 padX 加一條邊框
    assert.equal(capsules(ctx, 'rgba(1,2,3,0.5)').length, 2);
    const strokes = ctx.calls.filter((call) => call.op === 'stroke');
    assert.equal(strokes.length, 2);
    assert.ok(strokes.every((call) => call.strokeStyle === '#abcdef' && call.lineWidth === 1));
    const savage = at(ctx, 'Savage');
    const glamour = at(ctx, 'Glamour');
    assert.equal(savage.fillStyle, '#222222');
    assert.equal(savage.font, fontString(TEXT, 10));
    near(savage.x, 100 + 4 + 1, '字從膠囊的左邊再隔 padX 加一條邊框開始', 1e-9);
    near(glamour.x, 100 + (36 + 2 * 5) + 3 + 5, '第二顆在第一顆右邊隔 gap', 1e-9);
    near(savage.y, 50 + LINE + (10 * LINE_NORMAL + 2 * 2 + 2 * 1) / 2, '膠囊緊接在小標下面，字在膠囊的正中', 1e-9);
    // 時段格子：8 格，有選的 4 格是 accent、沒選的是 offColor；欄名與列名是 labelColor
    assert.equal(capsules(ctx, '#4f74d6').length, 4);
    assert.equal(capsules(ctx, '#eeeeee').length, 4);
    assert.equal(at(ctx, '早上').fillStyle, '#999999');
    assert.equal(at(ctx, '平日').fillStyle, '#999999');
    assert.ok(at(ctx, '平日').x >= 320 - 1e-9, '時段格子在右欄裡');

    // 沒有邊框（border 沒給）：只填色、不描邊，字左右的內距都是 padX × 倍數；stroke 也不用給
    const flat = createRecordingContext();
    likesAndHours(flat, view(), { ...spec, chips: { ...chips, border: undefined, stroke: undefined } }).draw(50);
    assert.equal(flat.calls.filter((call) => call.op === 'stroke').length, 0);
    near(at(flat, 'Savage').x, 100 + 4, '內距只有 padX', 1e-9);
    near(at(flat, 'Glamour').x, 100 + (36 + 2 * 4) + 3 + 4, '', 1e-9);

    // 只有喜歡的內容：用整列的寬（420），沒有時段的小標與格子；只有時段：右欄照兩邊都有時的寬、靠左（x 就是整列的左邊）
    const likesOnly = createRecordingContext();
    likesAndHours(likesOnly, view({ hours: null }), spec).draw(0);
    assert.ok(at(likesOnly, '喜歡的內容') && !at(likesOnly, '遊玩時段'));
    assert.equal(capsules(likesOnly, '#4f74d6').length, 0);
    const hoursOnly = createRecordingContext();
    likesAndHours(hoursOnly, view({ likes: [] }), spec).draw(0);
    assert.ok(!at(hoursOnly, '喜歡的內容') && !hoursOnly.calls.some((call) => call.op === 'stroke'));
    near(at(hoursOnly, '遊玩時段').x, 100, '只有時段時靠左', 1e-9);
    // 兩邊都沒有是 null
    assert.equal(likesAndHours(createRecordingContext(), view({ likes: [], hours: null }), spec), null);

    // 膠囊排成最多 2 列，排不下整組一起縮小（每次 0.05）：7 顆 'WWWWWWWW'（48 寬）排不進 2 列（一列 3 顆），縮到 0.8 就一列 4 顆
    const many = createRecordingContext();
    likesAndHours(many, view({ likes: Array(7).fill('WWWWWWWW'), hours: null }), { ...spec, width: 200 }).draw(0);
    const manyTexts = many.calls.filter((call) => call.op === 'fillText' && call.args[0] === 'WWWWWWWW');
    assert.equal(manyTexts.length, 7, '7 顆都畫出來');
    assert.ok(manyTexts.every((call) => call.font === fontString(TEXT, 8)), '字級縮到 0.8');
    assert.equal(new Set(manyTexts.map((call) => call.args[2])).size, 2, '排成 2 列');
    // 縮到 60% 還排不下：用 60%，排不下的不畫（60% 時一列 5 顆、2 列 10 顆）
    const tooMany = createRecordingContext();
    likesAndHours(tooMany, view({ likes: Array(30).fill('WWWWWWWW'), hours: null }), { ...spec, width: 200 }).draw(0);
    const tooManyTexts = tooMany.calls.filter((call) => call.op === 'fillText' && call.args[0] === 'WWWWWWWW');
    assert.equal(tooManyTexts.length, 10);
    assert.ok(tooManyTexts.every((call) => call.font === fontString(TEXT, 6)), '最多縮到 60%');
    // 一顆都排不進去（比整欄還寬）：那一邊不畫（連小標也不畫），時段仍在右欄
    const wide = createRecordingContext();
    likesAndHours(wide, view({ likes: ['W'.repeat(200)] }), spec).draw(0);
    assert.ok(!at(wide, '喜歡的內容'));
    near(at(wide, '遊玩時段').x, 320, '時段還在右欄', 1e-9);
    // 傳凍結的資料也行
    assert.doesNotThrow(() => likesAndHours(createRecordingContext(), Object.freeze(view()), Object.freeze({ ...spec, chips: Object.freeze(chips), hours: Object.freeze(hours), label: Object.freeze(label) })).draw(0));
});

// ---------- 沒有圖示的職業畫在重點色方塊裡的字 ----------

// 職業沒有圖示（例如 Beastmaster）時，CardPaint.drawIcon 畫一個重點色的圓角方塊，中間是名稱的第一個字，字色是 CardLayout.textColorOn 在白字與深字裡挑對比度高的。
// 最差的重點色上它不到 4.5:1，而資訊卡「每一段字至少 4.5:1」的測試（character-card-style-c.test.js）用的畫面模型職業都有圖示，畫不出這個字，所以「它一定是
// WCAG 的大字（粗體 14pt，18.67px 以上），大字只要 3:1」要在這裡守住。三種風格都用 drawIcon 畫主職與其他職業，所以畫整張卡片、從記錄裡讀回這些字來檢查
test('沒有圖示的職業畫在重點色方塊裡的字：三種風格 × 橫直版 × 每種重點色，都是粗體大字（18.67px 以上）、字色是 textColorOn(重點色)、底就是重點色、至少 3:1', () => {
    const { ICON_LETTER, fontString } = CardPaint;
    // 重點色：五個職能的預設色，加上自己選得到的幾種：白字與深字交界的 #7b7b7b、#7c7c7c（對比度最低的兩階灰）、很淺的黃、白、黑
    const ACCENTS = [...Object.values(card.CardState.ROLE_COLORS), '#7b7b7b', '#7c7c7c', '#ffff66', '#ffffff', '#000000'];
    const LETTERS = new Set(['B', '白', '黑']);
    const LARGE_BOLD_PX = (14 * 4) / 3; // WCAG 的大字：粗體 14pt，也就是 18.67px
    assert.ok(ICON_LETTER.weight >= 700, '字是粗體：18.67px 才是大字的門檻（不是粗體要 24px）');

    let checked = 0;
    let smallest = Infinity;
    let lowest = Infinity;
    for (const style of card.CardState.STYLES) {
        for (const format of card.CardState.FORMATS) {
            for (const accent of ACCENTS) {
                const where = `${style} ${format} ${accent}`;
                // 主職與三個其他職業都沒有圖示：每張卡片畫 4 個字（主職的 B，其他職業的 白、B、黑）
                const ctx = render(fullModel(style, {
                    format,
                    accent,
                    job: { name: 'Beastmaster', level: 100, icon: null },
                    subJobs: [{ name: '白魔法師', icon: null }, { name: 'Bard', icon: null }, { name: '黑魔法師', icon: null }]
                }));
                // 代替圖示的字要同時符合三件事：字是上面那幾個之一、字型是 drawIcon 用的 ICON_LETTER（字級不限）、畫字之前最後一次填色是這個重點色（方塊就畫在字的底下）
                const letters = ctx.calls.filter((call) => call.op === 'fillText'
                    && LETTERS.has(call.args[0])
                    && call.font === fontString(ICON_LETTER, fontSize(call.font))
                    && backgroundOf(ctx, call) === accent);
                assert.deepEqual(letters.map((call) => call.args[0]).sort(), ['B', 'B', '白', '黑'], `${where}：畫在重點色方塊裡的字`);
                for (const call of letters) {
                    const px = fontSize(call.font);
                    const ratio = CardLayout.contrastRatio(call.fillStyle, accent);
                    assert.ok(px >= LARGE_BOLD_PX, `${where}：「${call.args[0]}」是 ${px}px，不到大字的 ${LARGE_BOLD_PX.toFixed(2)}px`);
                    assert.equal(call.fillStyle, CardLayout.textColorOn(accent), `${where}：「${call.args[0]}」的字色`);
                    assert.ok(ratio >= 3, `${where}：「${call.args[0]}」${call.fillStyle} 在 ${accent} 上只有 ${ratio.toFixed(2)}:1`);
                    smallest = Math.min(smallest, px);
                    lowest = Math.min(lowest, ratio);
                    checked += 1;
                }
            }
        }
    }
    assert.equal(checked, 240, '3 種風格 × 2 種版型 × 10 種重點色 × 每張 4 個字');
    // 現在量到的邊界：最小的字是名片與資訊卡橫版的其他職業（方塊邊長 2.9cqw = 34.8px，字級是它的 0.55 倍）；最低的對比度是 #7b7b7b 上的白字，約 4.23:1。對比度比大字的 3:1 高出很多；字級只比大字的 18.67px 多 0.47px，邊界很窄
    near(smallest, 19.14, '最小的字級');
    assert.ok(lowest > 4.2, `最低的對比度 ${lowest}`);
});

// ---------- 名字放 21 個 emoji ----------

// 欄位的字數上限以 Unicode 字元計（一個 emoji 算 1 個字，同旁邊的計數），所以名字可以放 21 個 emoji。別的平台的 emoji 字型可能比中文字寬：這裡假設一個 emoji 1.3 倍寬
// （比 Mac 的 Chrome 寬 30%）。三種風格 × 橫直版的名字都要縮到放得進它的欄：右邊不超出 21 個全形字的名字（那是它的欄原本就要放得下的），而且沒有縮到底限（FIT_FLOOR）。
// 2026-11-12 用這個量字量過：最緊的海報直版縮到 31.8%，底限是 30%
test('名字 21 個 emoji、emoji 量成 1.3 倍寬時（別的平台的 emoji 字型可能比中文字寬），三種風格 × 橫直版都縮到放得進它的欄', () => {
    // 字級是 fontString 無條件捨去到 0.01px 的，兩個名字的右邊都貼著欄的右邊，但各自少了捨去的那一點：21 個全形字的名字，右邊最多比欄的右邊少 21 × 0.01 = 0.21px
    // （量到 emoji 名字的右邊比它多出來的，海報橫版最多 0.126px，名片橫版 0.063px，就是這一點，不是超出欄）。所以比較時，emoji 名字可以比 21 個全形字的名字多出這個量，不能再多
    const FLOOR_SLACK = 21 * 0.01 + 1e-6;
    // 假的量字：字級乘每個 Unicode 字元的寬度。碼位 U+1F000 以後（emoji）是 1.3，零寬連接符號與變體選擇符號是 0，U+0250 以前（拉丁字母、數字、標點）是 0.6，其他（中日韓）是 1
    const widthOf = (char) => {
        const code = char.codePointAt(0);
        if (code >= 0x1F000) return 1.3;
        if (code === 0x200D || code === 0xFE0F) return 0;
        return code < 0x250 ? 0.6 : 1;
    };
    const measure = (font, text) => Array.from(text).reduce((sum, char) => sum + widthOf(char) * fontSize(font), 0);
    const EMOJI = '😀'.repeat(21);
    const WIDE = '寬'.repeat(21);
    // 這種風格與版型畫這個名字的那一次 fillText：字級，與右邊（字是靠左畫的：x 加整個名字的寬）
    const nameOf = (style, format, name) => {
        const calls = render(fullModel(style, { format, name }), { measure }).calls.filter((call) => call.op === 'fillText' && call.args[0] === name);
        assert.equal(calls.length, 1, `${style} ${format}：名字「${name}」畫了幾次`);
        return { size: fontSize(calls[0].font), right: calls[0].args[1] + measure(calls[0].font, name) };
    };

    for (const style of card.CardState.STYLES) {
        for (const format of card.CardState.FORMATS) {
            const where = `${style} ${format}`;
            const short = nameOf(style, format, 'Luna');
            const emoji = nameOf(style, format, EMOJI);
            const wide = nameOf(style, format, WIDE);
            assert.ok(emoji.size > short.size * FIT_FLOOR, `${where}：emoji 名字的字級 ${emoji.size} 縮到底限了（${short.size} × ${FIT_FLOOR}）`);
            assert.ok(emoji.right <= wide.right + FLOOR_SLACK, `${where}：emoji 名字的右邊 ${emoji.right} 超出 21 個全形字的右邊 ${wide.right}（可以多 ${FLOOR_SLACK}）`);
        }
    }
});
