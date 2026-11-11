// 角色卡「畫圖」測試共用的輔助模組：共用小工具（card-paint.js）、名片（card-style-a.js）與資訊卡（card-style-c.js）的測試用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。畫圖的程式不碰 DOM，只拿 2D context 畫，
// 所以在 vm 裡載入真正的腳本、用 canvas-recorder.js 的記錄 context 畫，再從記錄裡把字、形狀與圖讀回來比對。
//
//   const { card, render, fullModel, lines, textBoxes, fills, imageCalls, SIZE, cq } = require('./helpers/card-drawing.js');
//   const ctx = render(fullModel('a', { format: 'portrait' }));      // 畫一張，回傳記錄 context
//   lines(ctx).map((line) => line.text);                             // 畫出來的每一段字（字距畫的字接回整個字串）
//   card.CardPaint.rgbaOf('#4f74d6', 0.34);                          // 載入好的全域：CardLayout、CardState、CardPaint、各風格、CardRenderer、FF14_JOBS
//
// 載入
// - loadCard()：新開一個 vm context，載入 assets/js/ff14-game-data.js（FF14_JOBS）與 tools/character-card/index.html 裡 `card-` 開頭、
//   到 card-renderer.js 為止的腳本，照頁面的順序（所以新增風格只要改 index.html，這裡跟著載入），回傳那個 context（window 就是它自己）。
//   要看「載入之後掛了哪些全域」這類每次都要乾淨的東西才自己呼叫；一般用 card，它是載入時建好的一份，所有測試共用
// - card：共用的那一份 context
//
// 尺寸
// - SIZE：{ landscape: { width: 1200, height: 675 }, portrait: { width: 1080, height: 1350 } }
// - cq(format, n)：草稿的 cqw（卡片寬度的 1%）換成像素：n × 寬度 / 100
//
// 範例資料（人名都是虛構的）。每個函式的第一個參數 style 是 'a'、'b'、'c'（寫進 model.style），最後一個 overrides 蓋掉欄位
// - ACCENT（'#4f74d6'）、NOTICE（SE 版權字）、INTRO（英文的一句話自我介紹）、DAYS／SLOTS（中文的列名與欄名）、LABELS_ZH（中文的小標）、
//   SUB_ICONS（三個其他職業的圖示替身）：範例資料用到的常數，測試要拿來比對時直接用
// - picture(name)：已載入的圖片的替身。drawImage 只會原樣傳進去，所以用物件本身（{ picture: name }）分辨是哪一張
// - requiredModel(style, overrides)：只有必填三項（名字、伺服器、主職）。沒有 labels，所以小標是中文預設
// - emptyModel(style, overrides)：什麼都沒填，必填的三項也是空的（頁面一打開的樣子）
// - fullModel(style, overrides)：每個欄位都填，包括海報不畫的部隊（名稱 Moonlit Garden、簡稱 MOON）、大國防聯軍、在找什麼與聯絡方式，
//   加上中文的 labels
// - maxedModel(style, { script }, overrides)：每個欄位都到上限。script 是 'wide'（用「寬」）或 'latin'（用 W）填滿名字 21、稱號 30、
//   伺服器 20、部隊名稱 20、簡稱 5、聯絡方式 40、自我介紹 60 個字；大國防聯軍與在找什麼用英文最長的選項，喜歡的內容是日文最寬的 6 個，
//   3 個其他職業，8 格時段全選（欄名與列名用英文全名），主職名稱是 FF14_JOBS 三種語言的名稱裡照 fakeMeasure 最寬的那一個
// - longestLikes(lang, count = 6)：翻譯檔裡那個語言的喜歡的內容的標籤，照 fakeMeasure 挑最寬的 count 個，排列照翻譯檔的順序（同 CardState.LIKES）
//
// 畫與讀記錄
// - render(model, options)：用 CardRenderer.draw 畫在記錄 context 上（options 同 createRecordingContext），回傳那個 context
// - drawn(ctx)：每一次 fillText：{ text, x, y, font, fillStyle, px, width, align, baseline }（字是靠左、垂直置中畫的，x 是左邊、y 是這一行的中線；
//   width 是 fakeMeasure 量出來的）
// - lines(ctx)：把字距畫出來的字接回一段：連續的 fillText、同一個 y、同一個字型與顏色，而且下一個字的 x 在上一段右邊 0～0.5 個字級之內，
//   就接成一段（字距 0.22em、0.14em 畫的字讀回整個字串）。回傳 drawn() 的形狀，text、width 是接起來的
// - textBoxes(ctx)：lines() 的每一段字的框：{ text, left, right, top: y - px / 2, bottom: y + px / 2 }
// - fills(ctx)：每一次 fill 與 fillRect 的形狀與顏色：{ kind: 'roundRect' | 'rect' | 'fillRect', x, y, w, h, r, fillStyle, call }。
//   fill 對到它前面最近的 roundRect／rect（弧線，像預設背景的光點，略過），call 是那一筆記錄（看得到當時的 shadow*、globalAlpha）
// - imageCalls(ctx)：每一次 drawImage：{ image, x, y, w, h, args, call }（後面三項只有 5 個參數的呼叫才有）
//
// 小工具
// - plain(value)：vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值
// - near(actual, expected, message, epsilon = 0.011)：差在 epsilon 以內
// - inside(box, region, epsilon = 1e-6)：textBoxes 的框 { left, right, top, bottom } 整個在 region { x, y, width, height } 裡面
// - overlaps(a, b, epsilon = 1e-6)：兩個框的面積有重疊（只是邊貼著邊不算）

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createRecordingContext, fakeMeasure, fontSize } = require('./canvas-recorder.js');
const { translationValues } = require('./translation-parsers.js');

const ROOT = path.join(__dirname, '..', '..');
const TOOL_DIR = 'tools/character-card';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/character-card.js';

// ---------- 載入 ----------

function loadCard() {
    const html = fs.readFileSync(path.join(ROOT, TOOL_DIR, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="(card-[^"]+)"/g)].map((match) => match[1]);
    const last = scripts.indexOf('card-renderer.js');
    assert.ok(last >= 0, 'index.html 要載入 card-renderer.js');
    const files = ['assets/js/ff14-game-data.js', ...scripts.slice(0, last + 1).map((name) => `${TOOL_DIR}/${name}`)];
    const context = vm.createContext({});
    context.window = context;
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    }
    return context;
}

const card = loadCard();

// ---------- 尺寸 ----------

const SIZE = Object.freeze({
    landscape: Object.freeze({ width: 1200, height: 675 }),
    portrait: Object.freeze({ width: 1080, height: 1350 })
});
const cq = (format, n) => (n * SIZE[format].width) / 100;

// ---------- 範例資料 ----------

const ACCENT = '#4f74d6';
const NOTICE = 'FINAL FANTASY XIV © SQUARE ENIX';
const picture = (name) => ({ picture: name });
const SUB_ICONS = [picture('whm'), picture('brd'), picture('blm')];
const DAYS = ['平日', '假日'];
const SLOTS = ['早上', '下午', '晚上', '深夜'];
const ON = ['weekday-evening', 'weekday-lateNight', 'weekend-afternoon', 'weekend-evening'];
const INTRO = 'Clearing savage on weekends and taking screenshots in Limsa at night. Treasure maps welcome!';
const LABELS_ZH = Object.freeze({ fc: '部隊', gc: '大國防聯軍', looking: '在找什麼', likes: '喜歡的內容', hours: '遊玩時段', subJobs: '其他職業', mainJob: '主職' });

function requiredModel(style, overrides = {}) {
    return {
        style,
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

function emptyModel(style, overrides = {}) {
    return requiredModel(style, { name: '', world: '', job: { name: '', level: 100, icon: null }, ...overrides });
}

function fullModel(style, overrides = {}) {
    return requiredModel(style, {
        title: 'Starfarer',
        fcName: 'Moonlit Garden',
        fcTag: 'MOON',
        gc: '雙蛇黨',
        looking: '固定隊、部隊',
        contact: 'Discord: luna_star',
        labels: { ...LABELS_ZH },
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

function longestLikes(lang, count = 6) {
    const labels = [...translationValues(TRANSLATIONS, lang)].filter(([key]) => key.startsWith('char_card_like_')).map(([, value]) => value);
    assert.ok(labels.length >= count, `${lang} 的翻譯檔裡找不到 ${count} 個喜歡的內容的標籤`);
    const width = (label) => fakeMeasure('10px x', label);
    const widest = new Set([...labels].sort((a, b) => width(b) - width(a)).slice(0, count));
    return labels.filter((label) => widest.has(label));
}

// 主職名稱：FF14_JOBS 三種語言的名稱裡照 fakeMeasure 最寬的那一個
function widestJobName() {
    const names = card.FF14_JOBS.flatMap((job) => Object.values(job.names));
    return names.reduce((widest, name) => (fakeMeasure('10px x', name) > fakeMeasure('10px x', widest) ? name : widest));
}

function maxedModel(style, { script = 'wide' } = {}, overrides = {}) {
    assert.ok(['wide', 'latin'].includes(script), `script 是 'wide' 或 'latin'，不是 ${JSON.stringify(script)}`);
    const fill = (count) => (script === 'wide' ? '寬' : 'W').repeat(count);
    const everyHour = card.CardState.DAYS.flatMap((day) => card.CardState.SLOTS.map((slot) => `${day}-${slot}`));
    return fullModel(style, {
        name: fill(21),
        title: fill(30),
        world: fill(20),
        fcName: fill(20),
        fcTag: fill(5),
        contact: fill(40),
        intro: fill(60),
        gc: 'Order of the Twin Adder',
        looking: 'Static, Free Company, Friends',
        likes: longestLikes('ja'),
        job: { name: widestJobName(), level: 100, icon: picture('pld') },
        hours: { days: ['Weekdays', 'Weekends'], slots: ['Morning', 'Afternoon', 'Evening', 'Late night'], on: new Set(everyHour) },
        ...overrides
    });
}

// ---------- 畫與讀記錄 ----------

function render(model, options) {
    const ctx = createRecordingContext(options);
    card.CardRenderer.draw(ctx, model);
    return ctx;
}

function drawn(ctx) {
    return ctx.calls
        .filter((call) => call.op === 'fillText')
        .map((call) => {
            const [text, x, y] = call.args;
            return { text, x, y, font: call.font, fillStyle: call.fillStyle, px: fontSize(call.font), width: fakeMeasure(call.font, text), align: call.textAlign, baseline: call.textBaseline };
        });
}

function lines(ctx) {
    const merged = [];
    for (const piece of drawn(ctx)) {
        const last = merged[merged.length - 1];
        const gap = last === undefined ? NaN : piece.x - (last.x + last.width);
        const continues = last !== undefined && piece.y === last.y && piece.font === last.font && piece.fillStyle === last.fillStyle && gap >= -1e-9 && gap <= 0.5 * last.px;
        if (continues) {
            last.text += piece.text;
            last.width = piece.x + piece.width - last.x;
        } else {
            merged.push({ ...piece });
        }
    }
    return merged;
}

const textBoxes = (ctx) => lines(ctx).map((line) => ({ text: line.text, left: line.x, right: line.x + line.width, top: line.y - line.px / 2, bottom: line.y + line.px / 2 }));

// 填色的形狀：每個 fill() 對到它前面最近的 roundRect／rect（弧線略過），fillRect 本身就是形狀
function fills(ctx) {
    const found = [];
    let current = null;
    for (const call of ctx.calls) {
        if (call.op === 'beginPath') {
            current = null;
        } else if (call.op === 'roundRect' || call.op === 'rect') {
            const [x, y, w, h, r] = call.args;
            current = { kind: call.op, x, y, w, h, r };
        } else if (call.op === 'fill' && current !== null) {
            found.push({ ...current, fillStyle: call.fillStyle, call });
        } else if (call.op === 'fillRect') {
            const [x, y, w, h] = call.args;
            found.push({ kind: 'fillRect', x, y, w, h, fillStyle: call.fillStyle, call });
        }
    }
    return found;
}

const imageCalls = (ctx) => ctx.calls
    .filter((call) => call.op === 'drawImage')
    .map((call) => ({ image: call.args[0], x: call.args[1], y: call.args[2], w: call.args[3], h: call.args[4], args: call.args, call }));

// ---------- 小工具 ----------

const plain = (value) => JSON.parse(JSON.stringify(value));

function near(actual, expected, message = '', epsilon = 0.011) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${message} ${actual} 不等於 ${expected}`.trim());
}

const inside = (box, region, epsilon = 1e-6) => box.left >= region.x - epsilon && box.right <= region.x + region.width + epsilon
    && box.top >= region.y - epsilon && box.bottom <= region.y + region.height + epsilon;

const overlaps = (a, b, epsilon = 1e-6) => a.left < b.right - epsilon && b.left < a.right - epsilon && a.top < b.bottom - epsilon && b.top < a.bottom - epsilon;

module.exports = {
    loadCard, card, SIZE, cq, ACCENT, NOTICE, INTRO, DAYS, SLOTS, LABELS_ZH, SUB_ICONS, picture,
    requiredModel, emptyModel, fullModel, maxedModel, longestLikes,
    render, drawn, lines, textBoxes, fills, imageCalls, plain, near, inside, overlaps
};
