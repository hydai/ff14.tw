// 記錄呼叫的 2D context 替身，給 tests/character-card-renderer.test.js、tests/helpers/card-drawing.js（名片與資訊卡的畫圖測試）與角色卡頁面的替身共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。node 裡沒有 canvas，畫圖的程式要靠它測。
//
//   const { createRecordingContext, fakeMeasure } = require('./helpers/canvas-recorder.js');
//   const ctx = createRecordingContext();                              // 量字用 fakeMeasure
//   const ctx2 = createRecordingContext({ measure: (font, text) => 8 * text.length, missing: ['roundRect'] });
//   CardRenderer.draw(ctx, model);
//   ctx.calls.filter((call) => call.op === 'fillText');                // [{ op: 'fillText', args: [text, x, y], font, fillStyle, ... }]
//
// - fakeMeasure(font, text)：假的量字，同 tests/character-card-layout.test.js 的規則：碼位小於 U+0250 的字（拉丁字母、數字、
//   標點、©、«»）一個字 0.6 × 字級，其他（中日韓、全形字、…）一個字 1 × 字級。字級從 font 字串裡的 `<數字>px` 讀，讀不到是 10
//   （真的 canvas 預設的 10px sans-serif）。createRecordingContext 的 measure 選項是同樣形狀的函式 (font, text) => 寬度，
//   measureText(text) 傳進去的 font 是量的當下 context.font
// - context.calls：每一次方法呼叫依序記一筆 { op, args, font, fillStyle, strokeStyle, lineWidth, globalAlpha, textAlign, textBaseline,
//   shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, imageSmoothingEnabled, imageSmoothingQuality }，
//   後面幾項是呼叫當下的設定（所以 fillText 看得到當時的字型與顏色）。measureText 也記；createLinearGradient／createRadialGradient
//   另外多一個 result（那個漸層物件：{ kind, args, stops: [[位置, 顏色]…] }，addColorStop 加的停點記在 stops 裡）。
//   fillStyle 設成漸層物件時，記下來的 fillStyle 就是那個物件
// - 實作的方法：save、restore、translate、scale、rotate、setTransform、beginPath、closePath、moveTo、lineTo、arc、arcTo、ellipse、
//   quadraticCurveTo、bezierCurveTo、rect、roundRect、fill、stroke、clip、fillRect、strokeRect、clearRect、fillText、strokeText、
//   drawImage、measureText、createLinearGradient、createRadialGradient。用到沒列在這裡的方法會丟 TypeError（is not a function），
//   所以畫圖的程式用了這裡沒有的 API，測試會當場失敗。translate、scale 只記下來，不會真的改後面的座標（目前的畫法都用絕對座標）
// - 設定（一般的屬性）：font、fillStyle、strokeStyle、lineWidth、globalAlpha、textAlign、textBaseline，加上陰影的 shadowColor、
//   shadowBlur、shadowOffsetX、shadowOffsetY 與圖片縮放的 imageSmoothingEnabled、imageSmoothingQuality（初始值同真的 canvas：
//   陰影是 'rgba(0, 0, 0, 0)' 與 0、縮放是 true 與 'low'）；save() 存下它們、restore() 還原（沒有可還原的 save 時什麼都不做，
//   同真的 canvas），所以「畫完把 context 的設定還原」測得到，每一筆 call 也記著當下的陰影與縮放（看得出哪一次 fill 帶著陰影）
// - 比真的 canvas 嚴格的地方（真的 canvas 會默默忽略，測試要當場看到）：數字參數不是有限的數字（NaN、Infinity）丟 TypeError；
//   fillText／strokeText 的字不是字串丟 TypeError；drawImage 的參數不是 3、5、9 個丟 TypeError；addColorStop 的位置不在 0～1 丟 RangeError
// - missing 選項：列出的方法不定義，用來模擬舊的瀏覽器（例如 ['roundRect']）

const DEFAULT_SIZE = 10;
const SIZE_PATTERN = /(\d+(?:\.\d+)?)px/;

// font 字串裡的字級（像素）
function fontSize(font) {
    const match = SIZE_PATTERN.exec(String(font));
    return match === null ? DEFAULT_SIZE : Number(match[1]);
}

function fakeMeasure(font, text) {
    const size = fontSize(font);
    return Array.from(String(text)).reduce((sum, char) => sum + (char.codePointAt(0) < 0x250 ? 0.6 : 1) * size, 0);
}

// 記錄下來的設定，與它們一開始的值（同真的 canvas）
const STATE_DEFAULTS = Object.freeze({
    font: '10px sans-serif',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low'
});

const RECORDED_METHODS = Object.freeze([
    'save', 'restore', 'translate', 'scale', 'rotate', 'setTransform',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo',
    'rect', 'roundRect', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect',
    'fillText', 'strokeText', 'drawImage'
]);

function checkArguments(op, args) {
    args.forEach((arg, index) => {
        if (typeof arg === 'number' && !Number.isFinite(arg)) {
            throw new TypeError(`${op}：第 ${index + 1} 個參數不是有限的數字（${arg}）`);
        }
    });
    if ((op === 'fillText' || op === 'strokeText') && typeof args[0] !== 'string') {
        throw new TypeError(`${op}：要畫的字不是字串（${typeof args[0]}）`);
    }
    if (op === 'drawImage' && ![3, 5, 9].includes(args.length)) {
        throw new TypeError(`drawImage：參數要 3、5 或 9 個，收到 ${args.length} 個`);
    }
}

function createRecordingContext({ measure = fakeMeasure, missing = [] } = {}) {
    const context = { calls: [], ...STATE_DEFAULTS };
    const stack = [];
    const snapshot = () => Object.fromEntries(Object.keys(STATE_DEFAULTS).map((key) => [key, context[key]]));

    function record(op, args, extra = {}) {
        context.calls.push({ op, args, ...snapshot(), ...extra });
    }

    for (const op of RECORDED_METHODS) {
        if (missing.includes(op)) continue;
        context[op] = (...args) => {
            checkArguments(op, args);
            record(op, args);
            if (op === 'save') {
                stack.push(snapshot());
            } else if (op === 'restore' && stack.length > 0) {
                Object.assign(context, stack.pop());
            }
        };
    }

    context.measureText = (text) => {
        record('measureText', [text]);
        return { width: measure(context.font, text) };
    };

    function createGradient(op, kind, args) {
        checkArguments(op, args);
        const gradient = {
            kind,
            args,
            stops: [],
            addColorStop(offset, color) {
                if (!Number.isFinite(offset) || offset < 0 || offset > 1) {
                    throw new RangeError(`addColorStop：位置要在 0～1 之間（${offset}）`);
                }
                gradient.stops.push([offset, color]);
            }
        };
        record(op, args, { result: gradient });
        return gradient;
    }
    context.createLinearGradient = (...args) => createGradient('createLinearGradient', 'linear', args);
    context.createRadialGradient = (...args) => createGradient('createRadialGradient', 'radial', args);

    return context;
}

module.exports = { createRecordingContext, fakeMeasure, fontSize };
