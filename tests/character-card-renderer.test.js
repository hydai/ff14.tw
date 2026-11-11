const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createRecordingContext, fakeMeasure, fontSize } = require('./helpers/canvas-recorder.js');

const ROOT = path.join(__dirname, '..');
const FILES = [
    'tools/character-card/card-layout.js',
    'tools/character-card/card-state.js',
    'tools/character-card/card-paint.js',
    'tools/character-card/card-style-a.js',
    'tools/character-card/card-style-b.js',
    'tools/character-card/card-renderer.js'
];

// 這幾支腳本把東西掛在 window 上，所以讓 window 指向 context 本身（同 character-card-layout.test.js）。
// 載入順序同頁面：card-layout.js、card-state.js 在 card-paint.js 前面，card-paint.js、card-style-a.js、card-style-b.js 在 card-renderer.js 前面
function loadContext(files) {
    const context = vm.createContext({});
    context.window = context;
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    }
    return context;
}

const context = loadContext(FILES);
const { CardRenderer, CardLayout, CardState, CardPaint, CardStyleB } = context;

// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));

function deepFrozen(value) {
    return Object.isFrozen(value) && Object.values(value).every((child) => child === null || typeof child !== 'object' || deepFrozen(child));
}

function near(actual, expected, message = '', epsilon = 0.011) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${message} ${actual} 不等於 ${expected}`.trim());
}

// ---------- 草稿的尺寸：數字都是 cqw（卡片寬度的 1%），換成像素 ----------

const SIZE = { landscape: { width: 1200, height: 675 }, portrait: { width: 1080, height: 1350 } };
const cq = (format, n) => (n * SIZE[format].width) / 100;
// 卡片左右（底下那一塊與上方那一列）的邊距，與底邊的邊距：草稿的 .bottom、.top
const EDGE = { landscape: 3.4, portrait: 4.4 };
const FLOOR = { landscape: 3, portrait: 4.4 };

// ---------- 範例資料（人名都是虛構的）----------

const ACCENT = '#4f74d6';
const NOTICE = 'FINAL FANTASY XIV © SQUARE ENIX';
const WHITE = '#ffffff';

// 已載入的圖片的替身：drawImage 只會原樣傳進去，所以用物件本身（同一個物件）分辨是哪一張
const picture = (name) => ({ picture: name });
const SUB_ICONS = [picture('whm'), picture('brd'), picture('blm')];
const DAYS = ['平日', '假日'];
const SLOTS = ['早上', '下午', '晚上', '深夜'];
const ON = ['weekday-evening', 'weekday-lateNight', 'weekend-afternoon', 'weekend-evening'];

function requiredModel(overrides = {}) {
    return {
        format: 'landscape',
        name: 'Luna Starweaver',
        title: '',
        world: 'Tiamat',
        fcTag: '',
        job: { name: 'Paladin', level: 100, icon: picture('pld') },
        subJobs: [],
        likes: [],
        hours: { days: DAYS, slots: SLOTS, on: new Set() },
        intro: '',
        accent: ACCENT,
        image: null,
        crop: { x: 0, y: 0, zoom: 1 },
        levelLabel: 'Lv',
        mark: 'FF14.tw',
        notice: NOTICE,
        ...overrides
    };
}

const INTRO = 'Clearing savage on weekends and taking screenshots in Limsa at night. Treasure maps welcome!';

function fullModel(overrides = {}) {
    return requiredModel({
        title: 'Starfarer',
        fcTag: 'STAR',
        subJobs: [
            { name: 'White Mage', icon: SUB_ICONS[0] },
            { name: 'Bard', icon: SUB_ICONS[1] },
            { name: 'Black Mage', icon: SUB_ICONS[2] }
        ],
        likes: ['Savage', 'Glamour', 'Photo', 'Treasure', 'Housing', 'PvP'],
        hours: { days: DAYS, slots: SLOTS, on: new Set(ON) },
        intro: INTRO,
        ...overrides
    });
}

// 什麼都沒填：必填的三項也是空的（頁面一打開的樣子）
function emptyModel(overrides = {}) {
    return requiredModel({ name: '', world: '', job: { name: '', level: 100, icon: null }, ...overrides });
}

// ---------- 從記錄裡取東西 ----------

function render(model, options) {
    const ctx = createRecordingContext(options);
    CardRenderer.draw(ctx, model);
    return ctx;
}

// 畫出來的每一段字：{ text, x, y, font, fillStyle, px, width }（靠左、垂直置中，所以 x 是左邊、y 是這一行的中線）
function drawn(ctx) {
    return ctx.calls
        .filter((call) => call.op === 'fillText')
        .map((call) => {
            const [text, x, y] = call.args;
            return { text, x, y, font: call.font, fillStyle: call.fillStyle, px: fontSize(call.font), width: fakeMeasure(call.font, text), align: call.textAlign, baseline: call.textBaseline };
        });
}

// 填色的形狀：每個 fill() 對到它前面最近的 roundRect／rect（弧線，像光點，略過），fillRect 本身就是形狀
function shapes(ctx) {
    const found = [];
    let current = null;
    for (const call of ctx.calls) {
        if (call.op === 'beginPath') current = null;
        else if (call.op === 'roundRect' || call.op === 'rect') {
            const [x, y, w, h, r] = call.args;
            current = { kind: call.op, x, y, w, h, r };
        } else if (call.op === 'fill' && current !== null) found.push({ ...current, fillStyle: call.fillStyle });
        else if (call.op === 'fillRect') {
            const [x, y, w, h] = call.args;
            found.push({ kind: 'fillRect', x, y, w, h, fillStyle: call.fillStyle });
        }
    }
    return found;
}

// 描邊的形狀（膠囊的邊框）：stroke() 對到它前面最近的 roundRect
function strokes(ctx) {
    const found = [];
    let current = null;
    for (const call of ctx.calls) {
        if (call.op === 'beginPath') current = null;
        else if (call.op === 'roundRect') {
            const [x, y, w, h] = call.args;
            current = { x, y, w, h };
        } else if (call.op === 'stroke' && current !== null) found.push({ ...current, strokeStyle: call.strokeStyle, lineWidth: call.lineWidth });
    }
    return found;
}

const capsules = (ctx) => shapes(ctx).filter((shape) => shape.kind === 'roundRect');
const images = (ctx) => ctx.calls.filter((call) => call.op === 'drawImage');
// 伺服器與部隊簡稱的膠囊在卡片最上面，其他職業的深色方塊在下半部（兩者的底色一樣）
const PANEL = 'rgba(10,8,26,0.45)';
const pillShapes = (ctx, format) => capsules(ctx).filter((shape) => shape.fillStyle === PANEL && shape.y < SIZE[format].height / 4);
const tileShapes = (ctx, format) => capsules(ctx).filter((shape) => shape.fillStyle === PANEL && shape.y > SIZE[format].height / 2);
// 時段格子：有選的是重點色、沒選的是白色 18%
const hourCells = (ctx) => capsules(ctx).filter((shape) => shape.fillStyle === ACCENT || shape.fillStyle === 'rgba(255,255,255,0.18)');
// 自我介紹的每一行（顏色是草稿的 .quote：白色 88%）
const QUOTE_COLOR = 'rgba(255,255,255,0.88)';
const quoteLines = (texts) => texts.filter((t) => t.fillStyle === QUOTE_COLOR);
// 不重複的值，由小到大
const distinct = (numbers) => [...new Set(numbers.map((n) => Math.round(n * 100) / 100))].sort((a, b) => a - b);
const sizeKey = (px) => Math.round(px * 100);
const bySize = (texts, px) => texts.filter((t) => sizeKey(t.px) === sizeKey(px));

// 字型字串去掉字級，剩下字重與字體：fontsFor 的字型字串用固定的字級，只比字重與字體
const family = (font) => font.replace(/\d+(?:\.\d+)?px/, 'Npx');

// 兩個顏色的對比度（WCAG），讀 '#rrggbb'
function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

// ---------- 模組與尺寸 ----------

test('SIZES 與 fontsFor', () => {
    // 模組：凍結、只有規定的四個成員、每支腳本各掛一個全域（照載入順序）
    assert.equal(Object.isFrozen(CardRenderer), true);
    assert.deepEqual(Object.keys(CardRenderer).sort(), ['SIZES', 'draw', 'fontsFor', 'photoBox']);
    assert.equal(typeof CardRenderer.draw, 'function');
    assert.equal(typeof CardRenderer.fontsFor, 'function');
    const alone = loadContext(FILES);
    assert.deepEqual(Object.keys(alone).filter((name) => name !== 'window'), ['CardLayout', 'CardState', 'CardPaint', 'CardStyleA', 'CardStyleB', 'CardRenderer']);

    // 兩種尺寸，凍結的；和共用畫圖小工具的是同一個物件
    assert.deepEqual(plain(CardRenderer.SIZES), SIZE);
    assert.equal(deepFrozen(CardRenderer.SIZES), true);
    assert.equal(CardRenderer.SIZES, CardPaint.SIZES);

    // fontsFor：名字用 Outfit 800（中文退回 Noto Sans TC），其他字是 Noto Sans TC 500、700，FF14.tw 是 Outfit 600
    const fonts = plain(CardRenderer.fontsFor(fullModel()));
    const textOf = (prefix) => fonts.filter((entry) => entry.font.startsWith(prefix)).map((entry) => entry.text);
    assert.deepEqual(textOf('800 '), ['Luna Starweaver']);
    assert.match(fonts.find((entry) => entry.font.startsWith('800 ')).font, /^800 \d+(?:\.\d+)?px Outfit, "Noto Sans TC", sans-serif$/);
    assert.deepEqual(textOf('600 '), ['FF14.tw']);
    assert.match(fonts.find((entry) => entry.font.startsWith('600 ')).font, /^600 \d+(?:\.\d+)?px Outfit, "Noto Sans TC", sans-serif$/);
    const bold = fonts.find((entry) => /^700 \d+(?:\.\d+)?px "Noto Sans TC", sans-serif$/.test(entry.font));
    assert.ok(bold, '職業名稱用 Noto Sans TC 700');
    assert.ok(bold.text.includes('Paladin'));
    const regular = fonts.find((entry) => /^500 \d+(?:\.\d+)?px "Noto Sans TC", sans-serif$/.test(entry.font));
    assert.ok(regular, '其他字用 Noto Sans TC 500');
    for (const text of ['Tiamat', '«STAR»', 'STARFARER', 'Lv 100', 'Savage', 'PvP', INTRO, ...DAYS, ...SLOTS, NOTICE]) {
        assert.ok(regular.text.includes(text), `Noto Sans TC 500 要載入「${text}」`);
    }

    // 一種字型一筆，沒有畫的字不載入（只有必填三項時沒有稱號、膠囊、自我介紹與時段）
    assert.equal(new Set(fonts.map((entry) => entry.font)).size, fonts.length);
    const small = plain(CardRenderer.fontsFor(requiredModel()));
    const smallText = small.map((entry) => entry.text).join('');
    assert.ok(smallText.includes('Luna Starweaver') && smallText.includes('Tiamat') && smallText.includes(NOTICE));
    for (const text of ['STAR', 'Savage', '平日', '早上']) assert.equal(smallText.includes(text), false, `只有必填三項時不載入「${text}」`);

    // 什麼都沒填：只剩 FF14.tw 與 SE 版權字
    const none = plain(CardRenderer.fontsFor(emptyModel()));
    assert.deepEqual(none.map((entry) => entry.text).sort(), [NOTICE, 'FF14.tw'].sort());
});

// ---------- 風格與照片框 ----------

test('photoBox：海報是整張卡片，每次回傳新的物件；不認得的風格當成海報、不認得的版型當成橫版', () => {
    const landscape = { x: 0, y: 0, width: 1200, height: 675 };
    const portrait = { x: 0, y: 0, width: 1080, height: 1350 };
    assert.deepEqual(plain(CardRenderer.photoBox('b', 'landscape')), landscape);
    assert.deepEqual(plain(CardRenderer.photoBox('b', 'portrait')), portrait);

    // 每次回傳新的物件：呼叫端拿去改也不會動到下一次的結果
    assert.notEqual(CardRenderer.photoBox('b', 'landscape'), CardRenderer.photoBox('b', 'landscape'));
    assert.notEqual(CardStyleB.photoBox('landscape'), CardStyleB.photoBox('landscape'));

    // 不認得的風格當成海報，不認得的版型當成橫版（物件原型上的名字也不算認得）
    assert.deepEqual(plain(CardRenderer.photoBox('zzz', 'portrait')), portrait);
    assert.deepEqual(plain(CardRenderer.photoBox('b', 'zzz')), landscape);
    assert.deepEqual(plain(CardRenderer.photoBox('constructor', 'constructor')), landscape);
    assert.deepEqual(plain(CardRenderer.photoBox(undefined, undefined)), landscape);
});

test("model.style 沒寫、是 'b' 或不認得時都畫海報", () => {
    const expected = plain(render(fullModel()).calls);
    assert.ok(expected.length > 100, '海報畫了不少東西');
    for (const style of ['b', 'zzz', 'constructor']) {
        assert.deepEqual(plain(render(fullModel({ style })).calls), expected, `style 是 ${JSON.stringify(style)}`);
    }
});

test('CardPaint、CardStyleB 凍結', () => {
    assert.equal(Object.isFrozen(CardPaint), true);
    assert.equal(Object.isFrozen(CardStyleB), true);
    assert.deepEqual(Object.keys(CardStyleB).sort(), ['draw', 'photoBox', 'texts']);
    // 海報要用的小工具都在（名字照任務書，之後的風格也靠這些名字），常數也是凍結的
    for (const name of [
        'fontString', 'toPixels', 'firstChar', 'sum', 'tintOf', 'roundedRect', 'drawText', 'measurer', 'fittedSize',
        'drawCapsule', 'drawIcon', 'stackUp', 'spacedWidth', 'drawSpaced', 'drawBackdrop', 'hoursBlock'
    ]) {
        assert.equal(typeof CardPaint[name], 'function', `CardPaint.${name}`);
    }
    assert.equal(CardPaint.LINE_NORMAL, 1.45);
    assert.equal(CardPaint.FIT_FLOOR, 0.3);
    assert.equal(CardPaint.ELLIPSIS, '…');
    assert.deepEqual(plain(CardPaint.FAMILIES), { display: 'Outfit, "Noto Sans TC", sans-serif', sans: '"Noto Sans TC", sans-serif', serif: '"Noto Serif TC", serif' });
    assert.equal(deepFrozen(CardPaint.FAMILIES), true);
});

// ---------- 只有必填三項 ----------

test('只有必填三項：畫了名字、伺服器、主職與 Lv、SE 版權字與 FF14.tw，沒有稱號、膠囊、自我介紹與時段', () => {
    const ctx = render(requiredModel());
    const texts = drawn(ctx);

    // 畫出來的字剛好是這幾段：沒有稱號、部隊簡稱、喜歡的內容、自我介紹，也沒有時段格子的名稱
    assert.deepEqual(texts.map((t) => t.text).sort(), ['FF14.tw', 'Luna Starweaver', 'Lv 100', 'Paladin', 'Tiamat', NOTICE].sort());

    const name = texts.find((t) => t.text === 'Luna Starweaver');
    assert.equal(name.font, '800 84px Outfit, "Noto Sans TC", sans-serif');
    assert.equal(name.fillStyle, WHITE);
    assert.equal(texts.find((t) => t.text === 'Paladin').font, '700 21.6px "Noto Sans TC", sans-serif');
    assert.equal(texts.find((t) => t.text === 'Lv 100').font, '500 18px "Noto Sans TC", sans-serif');
    assert.equal(texts.find((t) => t.text === 'FF14.tw').font, '600 15.6px Outfit, "Noto Sans TC", sans-serif');
    assert.equal(texts.find((t) => t.text === NOTICE).font, '500 11.4px "Noto Sans TC", sans-serif');

    // 形狀：只有伺服器那一顆膠囊（沒有部隊簡稱、喜歡的內容、時段格子、其他職業的底）
    assert.equal(capsules(ctx).length, 1);
    // 圖：只有主職的圖示一張，3.6cqw 的正方形
    const pictures = images(ctx);
    assert.equal(pictures.length, 1);
    assert.equal(pictures[0].args[0].picture, 'pld');
    assert.deepEqual(plain(pictures[0].args.slice(3)), [cq('landscape', 3.6), cq('landscape', 3.6)]);

    // 直版也一樣；SE 版權字不管有沒有其他職業與時段，都在右下角（橫版、直版一樣）
    const portrait = render(requiredModel({ format: 'portrait' }));
    assert.deepEqual(drawn(portrait).map((t) => t.text).sort(), ['FF14.tw', 'Luna Starweaver', 'Lv 100', 'Paladin', 'Tiamat', NOTICE].sort());
    assert.equal(capsules(portrait).length, 1);
    for (const [format, ctxOf] of [['landscape', ctx], ['portrait', portrait]]) {
        const notice = drawn(ctxOf).find((t) => t.text === NOTICE);
        near(notice.x + notice.width, SIZE[format].width - cq(format, EDGE[format]), `${format} 只有必填三項時 SE 版權字的右邊`);
    }
});

// ---------- 全部填滿 ----------

test('全部填滿：稱號用重點色，喜歡的內容最多 6 個，時段格子 8 格、有選的格數用重點色，其他職業的圖示畫了 3 次', () => {
    const ctx = render(fullModel());
    const texts = drawn(ctx);

    // 稱號：大寫、字距 0.3em、一個字一個字畫，用重點色的淺色（白色與重點色各混一部分，不是白色也不是重點色本身）
    const titleSize = cq('landscape', 1.4);
    const title = bySize(texts, titleSize);
    assert.equal(title.map((t) => t.text).join(''), 'STARFARER');
    for (let i = 0; i + 1 < title.length; i++) {
        near(title[i + 1].x - title[i].x, title[i].width + 0.3 * title[i].px, `稱號第 ${i + 1} 與 ${i + 2} 個字的間距`);
    }
    const tint = title[0].fillStyle;
    assert.match(tint, /^#[0-9a-f]{6}$/);
    assert.ok(title.every((t) => t.fillStyle === tint), '稱號每個字同一個顏色');
    assert.notEqual(tint, WHITE);
    assert.notEqual(tint, ACCENT);
    const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    channels(tint).forEach((value, i) => assert.ok(value > channels(ACCENT)[i] && value < 255, `淺色的第 ${i + 1} 個色版比重點色亮、比白色暗`));
    // 這個淺色在深色漸層上看得清楚：不管重點色是什麼（職能的顏色、自己選的黑、白、純藍），對比都在 4.5 以上（WCAG AA）
    for (const accent of [...Object.values(plain(CardState.ROLE_COLORS)), '#000000', '#ffffff', '#101010', '#0000ff']) {
        const color = bySize(drawn(render(fullModel({ accent }))), titleSize)[0].fillStyle;
        assert.ok(contrast(color, '#0a081a') >= 4.5, `${accent} 的稱號顏色 ${color} 在深色底上的對比只有 ${contrast(color, '#0a081a')}`);
    }

    // 部隊簡稱：加上 « »，和伺服器各一顆膠囊
    assert.ok(texts.some((t) => t.text === '«STAR»'));
    assert.ok(texts.some((t) => t.text === 'Tiamat'));

    // 喜歡的內容：6 個膠囊，順序照傳進來的
    const chipTexts = bySize(texts, cq('landscape', 1.25));
    assert.deepEqual(chipTexts.map((t) => t.text), ['Savage', 'Glamour', 'Photo', 'Treasure', 'Housing', 'PvP']);
    const chips = capsules(ctx).filter((shape) => shape.fillStyle === 'rgba(255,255,255,0.14)');
    assert.equal(chips.length, 6);
    // 傳進來 8 個也只畫 6 個
    const eight = render(fullModel({ likes: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }));
    assert.deepEqual(bySize(drawn(eight), cq('landscape', 1.25)).map((t) => t.text), ['a', 'b', 'c', 'd', 'e', 'f']);

    // 時段格子：2 列 × 4 欄 8 格，有選的 4 格用重點色（平日晚上、平日深夜、假日下午、假日晚上），其他是淡色
    const cells = hourCells(ctx);
    assert.equal(cells.length, 8);
    assert.equal(cells.filter((cell) => cell.fillStyle === ACCENT).length, 4);
    const rows = distinct(cells.map((cell) => cell.y));
    const columns = distinct(cells.map((cell) => cell.x));
    assert.equal(rows.length, 2);
    assert.equal(columns.length, 4);
    const grid = rows.map((y) => columns.map((x) => cells.find((cell) => Math.abs(cell.y - y) < 0.01 && Math.abs(cell.x - x) < 0.01).fillStyle === ACCENT));
    assert.deepEqual(grid, [[false, false, true, true], [false, true, true, false]]);
    // 欄名在格子上面、靠著每一欄的左邊，列名在格子左邊
    const labelOf = (label) => texts.find((t) => t.text === label);
    SLOTS.forEach((label, i) => {
        near(labelOf(label).x, columns[i], `「${label}」靠著第 ${i + 1} 欄的左邊`);
        assert.ok(labelOf(label).y < rows[0], `「${label}」在格子上面`);
    });
    DAYS.forEach((label, i) => {
        assert.ok(labelOf(label).x + labelOf(label).width <= columns[0], `「${label}」在格子左邊`);
        assert.ok(labelOf(label).y > rows[i] && labelOf(label).y < rows[i] + cells[0].h, `「${label}」和第 ${i + 1} 列格子同一行`);
    });

    // 其他職業：3 張圖示各畫一次，3cqw 的正方形（主職是 3.6cqw 那一張）
    for (const icon of SUB_ICONS) {
        const calls = images(ctx).filter((call) => call.args[0] === icon);
        assert.equal(calls.length, 1, `其他職業的圖示 ${icon.picture} 畫了一次`);
        assert.deepEqual(plain(calls[0].args.slice(3)), [cq('landscape', 3), cq('landscape', 3)]);
    }
    assert.equal(images(ctx).length, 4);

    // 由上到下：稱號、名字、主職、膠囊、自我介紹；自我介紹最多 2 行，最後一行的底在底邊 3cqw 之上
    const name = texts.find((t) => t.text === 'Luna Starweaver');
    const job = texts.find((t) => t.text === 'Paladin');
    const quote = quoteLines(texts);
    assert.ok(quote.length >= 1 && quote.length <= 2);
    assert.equal(quote.map((t) => t.text).join(' '), INTRO);
    quote.forEach((line) => near(line.px, cq('landscape', 1.5), '自我介紹的字級'));
    assert.ok(title[0].y < name.y && name.y < job.y && job.y < chipTexts[0].y && chipTexts[chipTexts.length - 1].y < quote[0].y);
    near(quote[quote.length - 1].y + (cq('landscape', 1.5) * 1.5) / 2, SIZE.landscape.height - cq('landscape', FLOOR.landscape), '自我介紹最後一行的底');
});

// ---------- 名字縮放 ----------

test('名字縮放', () => {
    const LATIN_21 = 'Abcdefghijklmnopqrstu'; // 21 個英文字母，沒有空白
    const WIDE_21 = '甲乙丙丁戊己庚辛壬癸'.repeat(2) + '子'; // 21 個全形字
    assert.equal(Array.from(LATIN_21).length, 21);
    assert.equal(Array.from(WIDE_21).length, 21);

    for (const format of ['landscape', 'portrait']) {
        const base = cq(format, format === 'landscape' ? 7 : 10.5);
        // 可用寬度：底下那一塊的寬度（兩邊各留邊距）；橫版還要讓開右邊的那一欄（時段格子 20cqw 寬）與兩欄之間的 2.4cqw
        const available = cq(format, 100 - 2 * EDGE[format] - (format === 'landscape' ? 2.4 + 20 : 0));

        // 短的名字不縮
        const short = drawn(render(fullModel({ format, name: 'Luna' }))).find((t) => t.text === 'Luna');
        near(short.px, base, `${format} 短名字的字級`);

        for (const name of [LATIN_21, WIDE_21]) {
            const ctx = render(fullModel({ format, name }));
            const line = drawn(ctx).find((t) => t.text === name);
            assert.ok(line, `${format}：畫了名字`);
            // measureText × 縮放：用畫出來的字型量出來的寬度，不超過可用寬度，也沒有縮得比需要的多
            assert.ok(line.width <= available + 1e-6, `${format} ${name} 畫出來 ${line.width}，超過可用寬度 ${available}`);
            assert.ok(line.width >= available * 0.97, `${format} ${name} 縮得比需要的多（${line.width} / ${available}）`);
            assert.ok(line.px < base);
            assert.equal(line.font, `800 ${line.px}px Outfit, "Noto Sans TC", sans-serif`);
            // 不超出卡片：右邊在右邊距之內，橫版也不壓到右邊那一欄
            assert.ok(line.x + line.width <= SIZE[format].width - cq(format, EDGE[format]) + 1e-6);
            if (format === 'landscape') {
                const sideLeft = Math.min(...hourCells(ctx).map((shape) => shape.x), ...drawn(ctx).filter((t) => DAYS.includes(t.text)).map((t) => t.x));
                assert.ok(line.x + line.width <= sideLeft - cq(format, 2.4) + 1e-6, `${name} 不壓到右邊那一欄`);
            }
        }

        // 全形字縮得比預設下限 55% 還多（21 個全形字在 55% 還是放不下），不然會超出卡片
        const wide = drawn(render(fullModel({ format, name: WIDE_21 }))).find((t) => t.text === WIDE_21);
        assert.ok(wide.px / base < 0.55, `${format}：21 個全形字縮到 ${wide.px / base}`);
    }
});

// ---------- 直版與橫版 ----------

test('直版的字比橫版大，版面不同', () => {
    // 短的名字：兩種版面都放得下，名字是草稿的字級（長一點的名字直版也會縮，見「名字縮放」）
    const land = render(fullModel({ format: 'landscape', name: 'Luna' }));
    const port = render(fullModel({ format: 'portrait', name: 'Luna' }));
    const landTexts = drawn(land);
    const portTexts = drawn(port);
    const pxOf = (texts, text) => texts.find((t) => t.text === text).px;

    // 字級：名字、主職、自我介紹、時段、SE 版權字都是直版比較大（草稿的數字）
    near(pxOf(landTexts, 'Luna'), cq('landscape', 7));
    near(pxOf(portTexts, 'Luna'), cq('portrait', 10.5));
    assert.ok(pxOf(portTexts, 'Luna') > pxOf(landTexts, 'Luna'));
    near(pxOf(portTexts, 'Paladin'), cq('portrait', 2.7));
    near(pxOf(landTexts, 'Paladin'), cq('landscape', 1.8));
    near(pxOf(portTexts, NOTICE), cq('portrait', 1.4));
    near(pxOf(landTexts, NOTICE), cq('landscape', 0.95));
    near(pxOf(portTexts, '平日'), cq('portrait', 1.5));
    near(pxOf(landTexts, '平日'), cq('landscape', 1));
    near(pxOf(portTexts, 'Savage'), cq('portrait', 1.9));
    near(pxOf(landTexts, 'Savage'), cq('landscape', 1.25));
    near(quoteLines(portTexts)[0].px, cq('portrait', 2.3), '直版的自我介紹 2.3cqw');

    // SE 版權字：一定在畫布裡，右邊緣貼著右邊距
    for (const [format, texts] of [['landscape', landTexts], ['portrait', portTexts]]) {
        const notice = texts.find((t) => t.text === NOTICE);
        assert.ok(notice.x >= 0 && notice.x + notice.width <= SIZE[format].width && notice.y > 0 && notice.y < SIZE[format].height);
        near(notice.x + notice.width, SIZE[format].width - cq(format, EDGE[format]), `${format} SE 版權字的右邊`);
    }

    // 版面不同。橫版：右下那一組由上到下疊起來（其他職業、時段格子、SE 版權字），
    // 時段格子在 SE 版權字上面，兩者都在名字的右邊
    const landNotice = landTexts.find((t) => t.text === NOTICE);
    const landCells = capsules(land).filter((shape) => shape.fillStyle === ACCENT || shape.fillStyle === 'rgba(255,255,255,0.18)');
    assert.ok(Math.max(...landCells.map((cell) => cell.y + cell.h)) < landNotice.y, '橫版：時段格子在 SE 版權字上面');
    const landName = landTexts.find((t) => t.text === 'Luna');
    assert.ok(landName.x + landName.width < Math.min(...landCells.map((cell) => cell.x)), '橫版：時段格子在名字的右邊');
    // 直版：右下那一組在自我介紹下方橫排，其他職業、時段格子、SE 版權字在同一排，由左到右
    const portNotice = portTexts.find((t) => t.text === NOTICE);
    const portCells = capsules(port).filter((shape) => shape.fillStyle === ACCENT || shape.fillStyle === 'rgba(255,255,255,0.18)');
    const gridTop = Math.min(...portCells.map((cell) => cell.y));
    const gridBottom = Math.max(...portCells.map((cell) => cell.y + cell.h));
    assert.ok(portNotice.y > gridTop && portNotice.y < gridBottom + 24, '直版：SE 版權字和時段格子同一排');
    assert.ok(Math.max(...portCells.map((cell) => cell.x + cell.w)) < portNotice.x, '直版：時段格子在 SE 版權字左邊');
    const portSubs = images(port).filter((call) => SUB_ICONS.includes(call.args[0]));
    assert.ok(Math.max(...portSubs.map((call) => call.args[1] + call.args[3])) < Math.min(...portCells.map((cell) => cell.x)), '直版：其他職業在時段格子左邊');
    const portQuote = quoteLines(portTexts);
    assert.ok(portQuote[portQuote.length - 1].y < gridTop, '直版：這一排在自我介紹下方');
    // 直版的自我介紹不限 52cqw 寬（橫版限制，直版沒有）：用滿整行
    const widest = Math.max(...portQuote.map((t) => t.width));
    assert.ok(widest > cq('portrait', 52), `直版的自我介紹一行 ${widest}，比 52cqw 寬`);
    const landQuote = quoteLines(landTexts);
    assert.ok(Math.max(...landQuote.map((t) => t.width)) <= cq('landscape', 52) + 1e-6, '橫版的自我介紹最寬 52cqw');

    // 底邊：橫版 3cqw、直版 4.4cqw
    for (const [format, texts] of [['landscape', landTexts], ['portrait', portTexts]]) {
        const bottoms = texts.map((t) => t.y + t.px / 2);
        assert.ok(Math.max(...bottoms) <= SIZE[format].height - cq(format, FLOOR[format]) + 1, `${format} 底邊的邊距`);
    }
});

// ---------- 背景 ----------

test('有截圖時用 coverRect 的位置畫，沒有截圖時畫預設背景、沒有 drawImage 截圖', () => {
    const PHOTO = picture('photo');
    const crop = { x: 0.5, y: -0.25, zoom: 1.5 };

    for (const format of ['landscape', 'portrait']) {
        const { width, height } = SIZE[format];
        // 有截圖：照 coverRect 的位置畫（整張卡片為框），畫一次；沒有預設背景的光點
        const withPhoto = render(fullModel({ format, image: { source: PHOTO, width: 2000, height: 1000 }, crop }));
        const photoCalls = images(withPhoto).filter((call) => call.args[0] === PHOTO);
        assert.equal(photoCalls.length, 1);
        const rect = CardLayout.coverRect(2000, 1000, width, height, crop);
        assert.deepEqual(plain(photoCalls[0].args.slice(1)), [rect.dx, rect.dy, rect.dw, rect.dh]);
        assert.equal(withPhoto.calls.filter((call) => call.op === 'createRadialGradient').length, 0, '有截圖時不畫光點');
        // 深色漸層蓋在截圖上面：先畫截圖，再畫整張卡片大小的漸層
        const photoIndex = withPhoto.calls.indexOf(photoCalls[0]);
        const shadeIndex = withPhoto.calls.findIndex((call) => call.op === 'fillRect' && call.fillStyle.kind === 'linear' && call.fillStyle.args[3] === height && call.fillStyle.args[0] === 0 && call.fillStyle.args[2] === 0);
        assert.ok(photoIndex >= 0 && shadeIndex > photoIndex, '深色漸層在截圖之後畫');

        // 沒有截圖：預設背景，從深藍紫到重點色的對角漸層，加上光點；沒有 drawImage 截圖
        const plainCard = render(fullModel({ format, image: null }));
        assert.equal(images(plainCard).filter((call) => call.args[0] === PHOTO).length, 0);
        assert.ok(images(plainCard).every((call) => call.args[3] < width / 2), '沒有任何一張圖畫成整張卡片那麼大');
        const backdrop = plainCard.calls.find((call) => call.op === 'createLinearGradient' && call.args[2] === width && call.args[3] === height);
        assert.ok(backdrop, '對角的漸層：左上到右下');
        assert.deepEqual(plain(backdrop.result.stops), [[0, '#1b1d45'], [1, ACCENT]]);
        const dots = plainCard.calls.filter((call) => call.op === 'createRadialGradient');
        assert.ok(dots.length >= 20, `光點有 ${dots.length} 個`);
        for (const dot of dots) {
            const [x, y, , , , radius] = dot.args;
            assert.ok(x - radius >= 0 && x + radius <= width && y - radius >= 0 && y + radius <= height, '光點在畫布裡');
        }
        // 深色漸層一樣有
        assert.ok(plainCard.calls.some((call) => call.op === 'fillRect' && call.fillStyle.kind === 'linear' && call.fillStyle.args[1] === 0 && call.fillStyle.args[3] === height && call.fillStyle.args[0] === 0 && call.fillStyle.args[2] === 0));
    }

    // 圖的大小不對（寬或高是 0）：不畫它，改畫預設背景，不丟錯
    const broken = render(requiredModel({ image: { source: PHOTO, width: 0, height: 0 } }));
    assert.equal(images(broken).filter((call) => call.args[0] === PHOTO).length, 0);
    assert.ok(broken.calls.some((call) => call.op === 'createRadialGradient'));

    // 預設背景每次都一樣（光點的位置是固定的亂數種子），不跟著重點色、名字變
    const first = render(requiredModel());
    const second = render(requiredModel({ accent: '#d4574e', name: 'Another Name' }));
    const dotsOf = (ctx) => ctx.calls.filter((call) => call.op === 'createRadialGradient').map((call) => call.args);
    assert.deepEqual(dotsOf(first), dotsOf(second));
    assert.equal(JSON.stringify(first.calls), JSON.stringify(render(requiredModel()).calls));
});

// ---------- 職業圖示 ----------

test('職業圖示是 null 時不丟錯，畫職業名稱的第一個字', () => {
    // 主職：圖示是 null → 重點色的圓角方塊，名稱的第一個字用 textColorOn(重點色)
    for (const accent of ['#4f74d6', '#f4d35e', '#3f9e5c', '#d4574e', '#8a63d2', '#c99a2e']) {
        const ctx = render(requiredModel({ accent, job: { name: 'Paladin', level: 100, icon: null } }));
        assert.equal(images(ctx).length, 0, '沒有圖示可畫');
        const tile = shapes(ctx).find((shape) => shape.kind === 'roundRect' && shape.fillStyle === accent);
        assert.ok(tile, `${accent}：重點色的圓角方塊`);
        near(tile.w, cq('landscape', 3.6));
        near(tile.h, cq('landscape', 3.6));
        const letter = drawn(ctx).find((t) => t.text === 'P');
        assert.ok(letter, `${accent}：畫了「P」`);
        assert.equal(letter.fillStyle, CardLayout.textColorOn(accent), `${accent}：字用 textColorOn`);
        assert.ok(letter.x >= tile.x && letter.x + letter.width <= tile.x + tile.w && letter.y > tile.y && letter.y < tile.y + tile.h, '字在方塊裡');
    }
    // 淺色與深色的重點色，字色一黑一白
    assert.equal(CardLayout.textColorOn('#f4d35e'), '#141826');
    assert.equal(CardLayout.textColorOn('#4f74d6'), WHITE);

    // 名稱的第一個字：中文是第一個字，罕用字（代理對）不拆開
    const cjk = drawn(render(requiredModel({ job: { name: '繪靈法師', level: 100, icon: null } })));
    assert.ok(cjk.some((t) => t.text === '繪'));
    const astral = drawn(render(requiredModel({ job: { name: String.fromCodePoint(0x20bb7) + '野', level: 100, icon: null } })));
    assert.ok(astral.some((t) => t.text === String.fromCodePoint(0x20bb7)), '第一個字是完整的罕用字');
    assert.equal(astral.some((t) => t.text.length === 1 && t.text.charCodeAt(0) >= 0xd800 && t.text.charCodeAt(0) <= 0xdfff), false, '沒有拆開代理對');

    // 其他職業的圖示是 null：在深色的底上畫重點色的小方塊，只有這一個沒有 drawImage
    const subs = [{ name: 'Beastmaster', icon: null }, { name: 'Bard', icon: SUB_ICONS[1] }];
    const ctx = render(requiredModel({ subJobs: subs }));
    assert.equal(images(ctx).filter((call) => SUB_ICONS.includes(call.args[0])).length, 1);
    assert.ok(drawn(ctx).some((t) => t.text === 'B' && t.fillStyle === CardLayout.textColorOn(ACCENT)));
    const accentTile = shapes(ctx).find((shape) => shape.kind === 'roundRect' && shape.fillStyle === ACCENT);
    near(accentTile.w, cq('landscape', 3));

    // 沒有圖示也沒有名稱的其他職業：不畫；圖示 undefined 與 null 一樣
    assert.doesNotThrow(() => render(requiredModel({ subJobs: [{ name: '', icon: null }, {}, { name: 'Bard' }, null], job: { name: 'Paladin', level: 100 } })));
});

// ---------- 沒填的欄位 ----------

test('沒填的欄位什麼都不畫', () => {
    // 什麼都沒填：只有背景（含深色漸層）、FF14.tw 與 SE 版權字
    for (const format of ['landscape', 'portrait']) {
        const ctx = render(emptyModel({ format }));
        assert.deepEqual(drawn(ctx).map((t) => t.text).sort(), [NOTICE, 'FF14.tw'].sort());
        assert.equal(capsules(ctx).length, 0);
        assert.equal(images(ctx).length, 0);
        assert.equal(ctx.calls.filter((call) => call.op === 'stroke').length, 0);
    }

    // null、undefined、只有空白，都和空字串一樣
    const blank = drawn(render(emptyModel())).map((t) => t.text);
    const nulls = render({ format: 'landscape', name: null, title: null, world: null, fcTag: null, job: null, subJobs: null, likes: undefined, hours: null, intro: null, accent: ACCENT, image: undefined, crop: null, levelLabel: 'Lv', mark: 'FF14.tw', notice: NOTICE });
    assert.deepEqual(drawn(nulls).map((t) => t.text), blank);
    const spaces = render(emptyModel({ name: '   ', world: String.fromCodePoint(0x3000), title: ' ', fcTag: ' ', intro: '\n', job: { name: ' ', level: 100, icon: null }, likes: ['', '  '] }));
    assert.deepEqual(drawn(spaces).map((t) => t.text), blank);
    assert.equal(capsules(spaces).length, 0);

    // 一次拿掉一組：那一組的字不見，其他的照舊（稱號是一個字一個字畫的，自我介紹是一行一行畫的）
    const strings = (ctx) => drawn(ctx).map((t) => t.text);
    const fullStrings = strings(render(fullModel()));
    const introLines = quoteLines(drawn(render(fullModel()))).map((t) => t.text);
    assert.ok(introLines.length >= 1);
    const cases = [
        ['name', { name: '' }, ['Luna Starweaver']],
        ['title', { title: '' }, Array.from('STARFARER')],
        ['world', { world: '' }, ['Tiamat']],
        ['fcTag', { fcTag: '' }, ['«STAR»']],
        ['job', { job: { name: '', level: 100, icon: picture('pld') } }, ['Paladin', 'Lv 100']],
        ['intro', { intro: '' }, introLines],
        ['likes', { likes: [] }, ['Savage', 'Glamour', 'Photo', 'Treasure', 'Housing', 'PvP']],
        ['hours', { hours: { days: DAYS, slots: SLOTS, on: new Set() } }, [...DAYS, ...SLOTS]]
    ];
    for (const [field, overrides, removed] of cases) {
        const expected = [...fullStrings];
        for (const text of removed) expected.splice(expected.indexOf(text), 1);
        assert.deepEqual(strings(render(fullModel(overrides))).sort(), expected.sort(), `沒有 ${field}`);
    }
    // 沒有其他職業：只剩主職的圖示；沒有時段：沒有 8 格
    assert.equal(images(render(fullModel({ subJobs: [] }))).length, 1);
    const noHours = render(fullModel({ hours: { days: DAYS, slots: SLOTS, on: new Set() } }));
    assert.equal(capsules(noHours).filter((shape) => shape.fillStyle === 'rgba(255,255,255,0.18)').length, 0);
    // 沒有喜歡的內容：沒有膠囊（只剩伺服器與部隊簡稱兩顆）
    assert.equal(capsules(render(fullModel({ likes: [] }))).filter((shape) => shape.fillStyle === 'rgba(255,255,255,0.14)').length, 0);
});

// ---------- 載入字型 ----------

test('fontsFor 涵蓋每一個畫出來的字', () => {
    const models = [
        fullModel(),
        fullModel({ format: 'portrait' }),
        requiredModel(),
        emptyModel(),
        // 中文、日文、罕用字，與沒有圖示的職業（畫名稱的第一個字）
        fullModel({
            name: '光之戰士',
            title: '星海の旅人',
            world: '伊弗利特（繁中服）',
            fcTag: '星海',
            job: { name: '繪靈法師', level: 100, icon: null },
            subJobs: [{ name: '白魔法師', icon: null }, { name: String.fromCodePoint(0x20bb7) + '野', icon: null }],
            likes: ['高難度', '幻化', 'ガンブレイカー'],
            intro: '零式開荒中，晚上常在利姆薩・羅敏薩拍照，歡迎一起刷寶圖！'.repeat(2),
            mark: 'FF14.tw'
        })
    ];
    for (const model of models) {
        const fonts = plain(CardRenderer.fontsFor(model));
        const ctx = render(model);
        assert.ok(drawn(ctx).length >= 2 && fonts.length >= 2, '至少畫了 FF14.tw 與 SE 版權字，也列了它們的字型');
        const used = new Set();
        for (const t of drawn(ctx)) {
            used.add(family(t.font));
            const entry = fonts.find((candidate) => family(candidate.font) === family(t.font));
            assert.ok(entry, `「${t.text}」用的字型 ${t.font} 在 fontsFor 裡`);
            for (const char of Array.from(t.text)) assert.ok(entry.text.includes(char), `${t.font} 要載入「${char}」（${t.text}）`);
        }
        // 每一種畫出來的字型都有一筆，fontsFor 也不多列沒用到的
        assert.deepEqual([...new Set(fonts.map((entry) => family(entry.font)))].sort(), [...used].sort());
        assert.equal(new Set(fonts.map((entry) => entry.font)).size, fonts.length);
    }
});

// ---------- 草稿的顏色與尺寸 ----------

test('草稿的顏色與尺寸：深色漸層、膠囊、喜歡的內容、時段格子、其他職業的底', () => {
    for (const format of ['landscape', 'portrait']) {
        const land = format === 'landscape';
        const { width, height } = SIZE[format];
        const ctx = render(fullModel({ format }));
        const texts = drawn(ctx);

        // 由上到下的深色漸層：22% 以上幾乎透明，55% 約一半，底部 92%
        const shade = ctx.calls.find((call) => call.op === 'createLinearGradient' && call.args[0] === 0 && call.args[1] === 0 && call.args[2] === 0 && call.args[3] === height);
        assert.deepEqual(plain(shade.result.stops), [[0.22, 'rgba(10,8,26,0.05)'], [0.55, 'rgba(10,8,26,0.55)'], [1, 'rgba(10,8,26,0.92)']]);

        // 左上的兩顆膠囊：深色半透明的底、1px 左右的白色邊，字用白色，兩顆之間隔 1cqw；右上的 FF14.tw 貼著右邊距
        const pills = pillShapes(ctx, format);
        assert.equal(pills.length, 2);
        near(pills[0].x, cq(format, EDGE[format]), '第一顆膠囊的左邊');
        near(pills[0].y, cq(format, land ? 3 : 4), '膠囊的上邊');
        near(pills[1].x - (pills[0].x + pills[0].w), cq(format, 1), '兩顆膠囊的間距');
        near(pills[0].r, pills[0].h / 2, '全圓角');
        const pillStroke = strokes(ctx).filter((stroke) => stroke.strokeStyle === 'rgba(255,255,255,0.28)');
        assert.equal(pillStroke.length, 2);
        near(pillStroke[0].lineWidth, land ? 1.5 : 2, '膠囊的邊', 0.6);
        const world = texts.find((t) => t.text === 'Tiamat');
        near(world.px, cq(format, land ? 1.3 : 1.9));
        near(world.x - pills[0].x, cq(format, land ? 1.2 : 1.7) + pillStroke[0].lineWidth, '膠囊的左內距（含邊）', 0.05);
        assert.equal(world.fillStyle, WHITE);
        near(world.y, pills[0].y + pills[0].h / 2, '字在膠囊的正中', 0.5);
        const mark = texts.find((t) => t.text === 'FF14.tw');
        near(mark.x + mark.width, width - cq(format, EDGE[format]), 'FF14.tw 的右邊');
        near(mark.px, cq(format, land ? 1.3 : 1.9));
        assert.equal(mark.fillStyle, 'rgba(255,255,255,0.8)');

        // 喜歡的內容：白色 14% 的底、22% 的邊，字白色
        const chips = capsules(ctx).filter((shape) => shape.fillStyle === 'rgba(255,255,255,0.14)');
        assert.equal(strokes(ctx).filter((stroke) => stroke.strokeStyle === 'rgba(255,255,255,0.22)').length, 6);
        near(chips[1].x - (chips[0].x + chips[0].w), cq(format, 0.7), '膠囊間距 0.7cqw');
        const chipText = texts.find((t) => t.text === 'Savage');
        assert.equal(chipText.fillStyle, WHITE);
        near(chipText.px, cq(format, land ? 1.25 : 1.9));

        // 時段格子：淡色是白色 18%，欄名與列名白色 70%；格子高 1.1cqw（橫）／1.7cqw（直），欄與欄隔 0.45cqw，列與列隔一行字的高度加 0.4cqw
        const cells = hourCells(ctx);
        near(cells[0].h, cq(format, land ? 1.1 : 1.7));
        near(cells[0].r, cq(format, 0.35), '格子的圓角');
        const columns = distinct(cells.map((cell) => cell.x));
        near(columns[1] - (columns[0] + cells[0].w), cq(format, 0.45), '欄距');
        const label = texts.find((t) => t.text === '深夜');
        assert.equal(label.fillStyle, 'rgba(255,255,255,0.7)');
        // 時段整塊 20cqw（橫）／34cqw（直）寬，右邊貼著右邊距（橫）
        const gridLeft = Math.min(...texts.filter((t) => DAYS.includes(t.text)).map((t) => t.x));
        const gridRight = Math.max(...cells.map((cell) => cell.x + cell.w));
        near(gridRight - gridLeft, cq(format, land ? 20 : 34), '時段整塊的寬度');
        if (land) near(gridRight, width - cq(format, EDGE[format]));
        const notice = texts.find((t) => t.text === NOTICE);
        assert.equal(notice.fillStyle, 'rgba(255,255,255,0.6)');

        // 其他職業：深色半透明的圓角方塊（圖示 3cqw／4.6cqw 加四周 0.4cqw 的內距，圓角 0.8cqw），圖示在正中
        const tiles = tileShapes(ctx, format);
        assert.equal(tiles.length, 3);
        near(tiles[0].w, cq(format, (land ? 3 : 4.6) + 0.8));
        near(tiles[0].r, cq(format, 0.8));
        near(tiles[1].x - (tiles[0].x + tiles[0].w), cq(format, 0.8), '方塊的間距');
        const iconCalls = images(ctx).filter((call) => call.args[0] === SUB_ICONS[0]);
        near(iconCalls[0].args[1] - tiles[0].x, cq(format, 0.4), '圖示的左內距');
        near(iconCalls[0].args[2] - tiles[0].y, cq(format, 0.4), '圖示的上內距');

        // 主職：圖示 3.6cqw／5.4cqw，名稱粗體白色，Lv 比名稱小、白色 75%，三者之間隔 1cqw
        const pld = images(ctx).find((call) => call.args[0].picture === 'pld');
        near(pld.args[3], cq(format, land ? 3.6 : 5.4));
        const jobName = texts.find((t) => t.text === 'Paladin');
        const level = texts.find((t) => t.text === 'Lv 100');
        near(jobName.x - (pld.args[1] + pld.args[3]), cq(format, 1), '圖示與名稱的間距');
        near(level.x - (jobName.x + jobName.width), cq(format, 1), '名稱與 Lv 的間距');
        assert.equal(level.fillStyle, 'rgba(255,255,255,0.75)');
        near(level.px, cq(format, land ? 1.5 : 2.2));
        near(jobName.y, pld.args[2] + pld.args[4] / 2, '名稱與圖示同一條中線', 0.5);
        assert.equal(jobName.fillStyle, WHITE);
    }
});

// ---------- 畫完不留痕跡 ----------

test('畫完 context 的設定還原，從固定的設定開始畫', () => {
    const ctx = createRecordingContext();
    // 呼叫端留下的設定：不影響畫出來的東西，畫完也要還原
    Object.assign(ctx, { font: '12px serif', fillStyle: '#123456', strokeStyle: '#654321', lineWidth: 7, globalAlpha: 0.5, textAlign: 'center', textBaseline: 'top' });
    CardRenderer.draw(ctx, fullModel());
    assert.equal(ctx.font, '12px serif');
    assert.equal(ctx.fillStyle, '#123456');
    assert.equal(ctx.strokeStyle, '#654321');
    assert.equal(ctx.lineWidth, 7);
    assert.equal(ctx.globalAlpha, 0.5);
    assert.equal(ctx.textAlign, 'center');
    assert.equal(ctx.textBaseline, 'top');
    const saves = ctx.calls.filter((call) => call.op === 'save').length;
    assert.ok(saves >= 1);
    assert.equal(ctx.calls.filter((call) => call.op === 'restore').length, saves);
    // 畫的時候：不透明、字靠左、垂直置中（所有的 fillText 都是，所以座標是字的左邊與中線）
    for (const call of ctx.calls.filter((c) => ['fill', 'fillRect', 'fillText', 'drawImage', 'stroke'].includes(c.op))) assert.equal(call.globalAlpha, 1, call.op);
    for (const t of drawn(ctx)) assert.deepEqual([t.align, t.baseline], ['left', 'middle'], t.text);
    // 不用 translate、scale：座標都是畫布上的絕對座標
    assert.equal(ctx.calls.some((call) => call.op === 'translate' || call.op === 'scale'), false);
});

test('沒有 roundRect 的瀏覽器改用 arcTo 畫圓角，畫出一樣的東西', () => {
    const modern = render(fullModel());
    const old = render(fullModel(), { missing: ['roundRect'] });
    assert.equal(old.roundRect, undefined);
    assert.equal(old.calls.some((call) => call.op === 'roundRect'), false);
    assert.ok(old.calls.some((call) => call.op === 'arcTo'));
    assert.deepEqual(drawn(old).map((t) => [t.text, t.x, t.y, t.font]), drawn(modern).map((t) => [t.text, t.x, t.y, t.font]));
    assert.equal(old.calls.filter((call) => call.op === 'fill').length, modern.calls.filter((call) => call.op === 'fill').length);
    assert.equal(old.calls.filter((call) => call.op === 'stroke').length, modern.calls.filter((call) => call.op === 'stroke').length);
});

// ---------- 不超出畫布 ----------

test('字數到上限、很寬的字也不超出畫布，膠囊不互相壓到', () => {
    const wide = (n) => '寬'.repeat(n);
    const long = (n) => 'W'.repeat(n);
    const cases = [
        { name: wide(21), title: wide(30), world: wide(20), fcTag: wide(5), intro: wide(60), likes: ['長'.repeat(12), '長'.repeat(11), 'L'.repeat(24), 'L'.repeat(18), 'LongLabel', 'x'] },
        { name: long(21), title: long(30), world: long(20), fcTag: long(5), intro: long(60), likes: ['Deep Dungeon', 'Alliance Raids', 'Role-playing', 'Ultimate', 'Gathering', 'Crafting'] },
        { name: 'Luna Starweaver', title: 'Starfarer', world: 'Tiamat', fcTag: 'STAR', intro: INTRO }
    ];
    for (const format of ['landscape', 'portrait']) {
        const { width, height } = SIZE[format];
        for (const fields of cases) {
            const ctx = render(fullModel({ format, ...fields, hours: { days: ['Weekdays', 'Weekends'], slots: ['Morning', 'Afternoon', 'Evening', 'Late night'], on: new Set(ON) } }));
            for (const t of drawn(ctx)) {
                assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y));
                assert.ok(t.x >= 0 && t.x + t.width <= width + 1e-6, `${format}「${t.text}」超出左右：${t.x}～${t.x + t.width}`);
                assert.ok(t.y - t.px / 2 >= 0 && t.y + t.px / 2 <= height, `${format}「${t.text}」超出上下：${t.y}`);
            }
            // 形狀（背景那張整張卡片大小的 fillRect 除外）都在畫布裡
            for (const shape of shapes(ctx).filter((s) => s.kind !== 'fillRect')) {
                assert.ok(shape.x >= 0 && shape.y >= 0 && shape.x + shape.w <= width + 1e-6 && shape.y + shape.h <= height + 1e-6, `${format} 形狀超出畫布：${JSON.stringify(shape)}`);
            }
            for (const call of images(ctx).filter((c) => SUB_ICONS.some((icon) => icon === c.args[0]) || c.args[0].picture === 'pld')) {
                assert.ok(call.args[1] >= 0 && call.args[2] >= 0 && call.args[1] + call.args[3] <= width && call.args[2] + call.args[4] <= height);
            }
            // 上面那一列：伺服器、部隊簡稱的膠囊不互相壓到，也不壓到右上的 FF14.tw
            const texts = drawn(ctx);
            const mark = texts.find((t) => t.text === 'FF14.tw');
            const pills = pillShapes(ctx, format);
            assert.equal(pills.length, 2);
            assert.ok(pills[0].x + pills[0].w <= pills[1].x + 1e-6);
            assert.ok(pills[1].x + pills[1].w <= mark.x + 1e-6, `${format} 部隊簡稱的膠囊壓到 FF14.tw`);
            // 名字、稱號不壓到橫版右邊的那一欄；自我介紹最多 2 行；膠囊最多 2 列
            const quote = quoteLines(texts);
            assert.ok(quote.length >= 1 && quote.length <= 2);
            const chipRows = distinct(capsules(ctx).filter((shape) => shape.fillStyle === 'rgba(255,255,255,0.14)').map((shape) => shape.y));
            assert.ok(chipRows.length <= 2);
            if (format === 'landscape') {
                const sideLeft = Math.min(...texts.filter((t) => ['Weekdays', 'Weekends'].includes(t.text)).map((t) => t.x));
                for (const t of texts.filter((candidate) => candidate.x < sideLeft && candidate.y > cq(format, 8))) {
                    assert.ok(t.x + t.width <= sideLeft + 1e-6, `橫版「${t.text}」壓到右邊那一欄`);
                }
            }
        }
    }

    // 時段的欄名很長（英文）：縮小到放得進每一欄，不超出那個 20cqw／34cqw 的區塊
    for (const format of ['landscape', 'portrait']) {
        const ctx = render(fullModel({ format, hours: { days: ['Weekdays', 'Weekends'], slots: ['Morning', 'Afternoon', 'Evening', 'Late night'], on: new Set(ON) } }));
        const cells = hourCells(ctx);
        const columns = distinct(cells.map((cell) => cell.x));
        const texts = drawn(ctx);
        ['Morning', 'Afternoon', 'Evening', 'Late night'].forEach((slot, i) => {
            const t = texts.find((candidate) => candidate.text === slot);
            const right = i + 1 < columns.length ? columns[i + 1] : columns[i] + cells[0].w;
            assert.ok(t.x + t.width <= right + 1e-6, `${format}「${slot}」放得進自己那一欄`);
        });
        const weekdays = texts.find((t) => t.text === 'Weekdays');
        assert.ok(weekdays.x + weekdays.width <= columns[0] + 1e-6, `${format}「Weekdays」在格子左邊`);
    }
});
