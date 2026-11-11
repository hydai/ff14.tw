/**
 * 角色卡產生器的畫卡片：照畫面模型（model）在任何 2D context 上畫出一張卡片。
 * 畫面上的預覽與下載的 PNG 是同一張 canvas，所以怎麼畫都在這一組腳本裡，只畫圖、不碰 DOM，也不自己去拿 canvas。
 * 這支只做三件事：把 model 整理成畫圖用的 view、列出要載入的字型、照 model.style 交給那一種風格去畫（和回答那一種風格的照片框）。
 * 每一種風格一支腳本（現在只有風格 B「海報」：card-style-b.js），風格自己的顏色、版面數字與區塊都在它的檔案裡；
 * 三種風格共用的畫圖小工具在 card-paint.js（CardPaint）。
 *
 * - SIZES：兩種卡片的大小 { landscape: { width: 1200, height: 675 }, portrait: { width: 1080, height: 1350 } }，頁面照它設定 canvas 的寬高
 *   （CardPaint.SIZES 是同一個物件）
 * - fontsFor(model)：畫這張卡片要用的字型與要畫的字，每種字型（字重加字體）一筆 { font, text }，text 是用那個字型畫的每一段字接起來；
 *   頁面對每一筆呼叫 document.fonts.load(font, text)，載入完再畫（Google Fonts 的中文字型依字分批載入，沒載入的字會退成別的字型）。
 *   font 的字級是固定的（只有字重與字體有用），沒有畫的字（沒填的欄位）不列
 * - draw(ctx, model)：畫在 ctx 上。ctx 的設定（字型、顏色、對齊…）先 save()、畫完 restore()，所以畫完原樣還給呼叫端
 * - photoBox(style, format)：那種風格的截圖鋪滿的框 { x, y, width, height }（canvas 的像素，每次回傳新的物件）。風格不認得當成 'b'，版型不認得當成 'landscape'
 *
 * model 是頁面組好、已經翻譯的畫面模型：
 *   { style, format, name, title, world, fcTag, job: { name, level, icon }, subJobs: [{ name, icon }], likes: [string],
 *     hours: { days: [label, label], slots: [label × 4], on: Set<'weekday-evening'…> }, intro, accent,
 *     image: { source, width, height } | null, crop: { x, y, zoom }, levelLabel: 'Lv', mark: 'FF14.tw', notice: 'FINAL FANTASY XIV © SQUARE ENIX' }
 * - style 是風格表（STYLE_MODULES）的鍵（現在只有 'b'）；沒寫或不認得就是 'b'。format 是 SIZES 的鍵；沒寫或不認得就是 'landscape'
 * - icon 是已載入的圖片（drawImage 認得的東西）或 null；null 時畫重點色的圓角方塊與職業名稱的第一個字。image.source 同
 * - likes 照 CardState.LIKES 的順序、最多 CardState.LIMITS.likes 個，subJobs 最多 CardState.LIMITS.subJobs 個（多的不畫）；
 *   hours.on 的鍵是 `${CardState.DAYS 的一個}-${CardState.SLOTS 的一個}`，days、slots 是這些的標籤，照 DAYS、SLOTS 的順序
 * - accent 是 '#rrggbb'（CardState.accentOf 的結果），重點色全都從這裡來，這支不寫死任何職能的顏色
 * - 沒填的欄位（空字串、只有空白、null、undefined）整塊不畫，不留空位；什麼都沒填時只畫背景、FF14.tw 與 SE 版權字。
 *   SE 版權字一定畫（卡片上畫了 SE 的職業圖示）：model 沒給 notice 時用內建的那一句
 *
 * 交給風格的 view 是整理過的 model：字串去掉前後空白（稱號沒有轉大寫，要不要轉由風格決定）、沒填的是 ''，沒有的區塊是 null 或 []，
 * 部隊簡稱已經加上 « »，主職的等級已經接成 'Lv 100'。每一種風格是 { draw(ctx, view), texts(view), photoBox(format) }：
 * draw 畫出來的字與 texts 列的字是同一份 view，所以「要載入的字」與「畫出來的字」是同一份。
 *
 * 常數與小函式都收在最外層那個立即執行的函式裡，不會多出全域的名稱，和頁面其他腳本的名稱不會撞到；
 * 需要 card-state.js（CardState）、card-paint.js（CardPaint）與 card-style-b.js（CardStyleB）先載入。
 */
const CardRenderer = (() => {
    // 嚴格模式：傳進來的資料被凍結時，想改它的地方會丟 TypeError，不會被默默忽略
    'use strict';

    const { SIZES, fontString } = window.CardPaint;
    const { DAYS, SLOTS, LIMITS, ROLE_COLORS } = window.CardState;

    // 風格表：model.style 是這裡的鍵（之後的風格加在這裡）
    const STYLE_MODULES = Object.freeze({ b: window.CardStyleB });
    const DEFAULT_STYLE = 'b';
    const DEFAULT_FORMAT = 'landscape';

    // fontsFor() 給的字型字串用這個字級（載入字型只看字重與字體，字級用不到）
    const LOAD_PX = 16;

    const DEFAULT_LEVEL_LABEL = 'Lv';
    const DEFAULT_MARK = 'FF14.tw';
    const DEFAULT_NOTICE = 'FINAL FANTASY XIV © SQUARE ENIX';
    const HEX_COLOR = /^#[0-9a-f]{6}$/i;

    // ---------- 小工具 ----------

    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const hasText = (value) => typeof value === 'string' && value.trim() !== '';
    const clean = (value) => (typeof value === 'string' ? value.trim() : '');
    const isIterable = (value) => value !== null && value !== undefined && typeof value[Symbol.iterator] === 'function';
    // key 是表裡的鍵就用它，否則用 fallback（只認表自己的鍵：物件原型上的名字，像 'constructor'，不算）
    const keyOf = (table, key, fallback) => (Object.prototype.hasOwnProperty.call(table, key) ? key : fallback);

    // ---------- 整理畫面模型 ----------

    // 時段：有選的格子（DAYS × SLOTS 的 true／false 表）與列名、欄名。一格都沒選（或沒有這份資料）是 null：整塊不畫
    function hoursOf(value) {
        if (!isObject(value)) return null;
        const keys = new Set(isIterable(value.on) ? value.on : []);
        const on = DAYS.map((day) => SLOTS.map((slot) => keys.has(`${day}-${slot}`)));
        if (!on.some((row) => row.some(Boolean))) return null;
        const labels = (list, count) => Array.from({ length: count }, (_, i) => (Array.isArray(list) && typeof list[i] === 'string' ? list[i].trim() : ''));
        return { on, days: labels(value.days, DAYS.length), slots: labels(value.slots, SLOTS.length) };
    }

    // 任何東西 → 畫圖用的樣子：字串去掉前後空白、沒填的是 ''，沒有的區塊是 null 或 []。fontsFor() 與 draw() 都從這裡來，
    // 所以「要載入的字」與「畫出來的字」是同一份
    function viewOf(model) {
        const source = isObject(model) ? model : {};
        const job = isObject(source.job) ? source.job : {};
        const jobName = clean(job.name);
        const level = typeof job.level === 'number' ? job.level : Number(hasText(job.level) ? job.level : NaN);
        const levelLabel = hasText(source.levelLabel) ? source.levelLabel.trim() : DEFAULT_LEVEL_LABEL;
        const tag = clean(source.fcTag);
        const image = isObject(source.image) && source.image.source ? { source: source.image.source, width: source.image.width, height: source.image.height } : null;
        return {
            style: keyOf(STYLE_MODULES, source.style, DEFAULT_STYLE),
            format: keyOf(SIZES, source.format, DEFAULT_FORMAT),
            accent: typeof source.accent === 'string' && HEX_COLOR.test(source.accent) ? source.accent : ROLE_COLORS.dps,
            image,
            crop: source.crop,
            mark: hasText(source.mark) ? source.mark.trim() : DEFAULT_MARK,
            notice: hasText(source.notice) ? source.notice.trim() : DEFAULT_NOTICE,
            name: clean(source.name),
            title: clean(source.title),
            world: clean(source.world),
            tag: tag === '' ? '' : `«${tag}»`,
            job: jobName === '' ? null : { name: jobName, icon: job.icon || null, level: Number.isFinite(level) ? `${levelLabel} ${level}` : '' },
            subJobs: (Array.isArray(source.subJobs) ? source.subJobs : [])
                .filter(isObject)
                .map((sub) => ({ name: clean(sub.name), icon: sub.icon || null }))
                .filter((sub) => sub.name !== '' || sub.icon !== null)
                .slice(0, LIMITS.subJobs),
            likes: (Array.isArray(source.likes) ? source.likes : []).map(clean).filter((label) => label !== '').slice(0, LIMITS.likes),
            hours: hoursOf(source.hours),
            intro: clean(source.intro)
        };
    }

    // ---------- 載入字型 ----------

    function fontsFor(model) {
        const view = viewOf(model);
        const byFont = new Map(); // 字型字串 → 用它畫的每一段字
        for (const { kind, text } of STYLE_MODULES[view.style].texts(view)) {
            // 風格只該列畫出來的字；萬一有空的，這裡也不列，才不會多出一筆沒有字的字型
            if (typeof text !== 'string' || text === '') continue;
            const font = fontString(kind, LOAD_PX);
            if (!byFont.has(font)) byFont.set(font, []);
            byFont.get(font).push(text);
        }
        return [...byFont].map(([font, strings]) => ({ font, text: strings.join('') }));
    }

    // ---------- 畫一張卡片 ----------

    function draw(ctx, model) {
        const view = viewOf(model);
        ctx.save();
        try {
            // 從固定的設定開始畫，不管呼叫端留下什麼；字一律靠左、垂直置中
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            STYLE_MODULES[view.style].draw(ctx, view);
        } finally {
            ctx.restore();
        }
    }

    // ---------- 照片框 ----------

    // 截圖鋪滿的框：風格不認得當成海報，版型不認得當成橫版
    function photoBox(style, format) {
        return STYLE_MODULES[keyOf(STYLE_MODULES, style, DEFAULT_STYLE)].photoBox(keyOf(SIZES, format, DEFAULT_FORMAT));
    }

    return Object.freeze({ SIZES, fontsFor, draw, photoBox });
})();

// Export for use in other modules
window.CardRenderer = CardRenderer;
