const test = require('node:test');
const assert = require('node:assert/strict');

const { createRecordingContext, fakeMeasure } = require('./helpers/canvas-recorder.js');
const { card, plain, near, picture } = require('./helpers/card-drawing.js');

// 共用的畫圖小工具（card-paint.js）：用 canvas-recorder.js 的記錄 context 與假的量字（碼位小於 U+0250 的字 0.6 × 字級，其他 1 × 字級）
const { CardPaint, CardLayout } = card;
const { LINE_NORMAL, FIT_FLOOR, FAMILIES } = CardPaint;

const TEXT = { weight: 500, family: FAMILIES.sans };
const measureOf = (px) => (text) => fakeMeasure(`${px}px x`, text);

// ---------- 模組 ----------

test('CardPaint：凍結，新增的小工具與 FAMILIES.serif 都在', () => {
    assert.equal(Object.isFrozen(CardPaint), true);
    for (const name of ['isObject', 'deepFreeze', 'geometryOf', 'rgbaOf', 'fitChips', 'fittedSpacedSize', 'stackDown', 'drawPhotoBox', 'metaItems', 'footText', 'footBlock', 'splitColumns', 'twoColumns', 'labelBlock', 'iconLetters', 'listTexts']) {
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
