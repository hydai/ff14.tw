const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createCardPage, dataUrlOf } = require('./helpers/card-page.js');
const { tagAttrs, sliceElementById, classesOf } = require('./helpers/html-fragment.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const LANGS = ['zh', 'en', 'ja'];
const TRANSLATIONS = 'assets/js/i18n/translations/tools/character-card.js';
const KEY = 'ff14tw_character_card';
const IMAGE_KEY = 'ff14tw_character_card_image';
const MARK = 'FF14.tw';
const NOTICE = 'FINAL FANTASY XIV © SQUARE ENIX';
const HTML = read('tools/character-card/index.html');
const SCRIPT = read('tools/character-card/script.js');
const CSS = read('tools/character-card/style.css').replace(/\/\*[\s\S]*?\*\//g, '');

const saved = (page) => JSON.parse(page.stored.get(KEY));
// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));
// 比較元素一律用 ===：assert.equal 失敗時會展開整份 fake-dom 而卡住不報錯，改成 === 加訊息才報得出來（同 mini-cactpot-page.test.js）
const isSame = (a, b, message) => assert.ok(a === b, message);
const TABS = ['basic', 'profile', 'play', 'image', 'style'];
const shownPanels = (page) => TABS.filter((key) => page.isShown(`panel-${key}`));
const selectedTabs = (page) => TABS.filter((key) => page.$(`tab-${key}`).getAttribute('aria-selected') === 'true');
// 卡片背景的對角漸層停在重點色上（card-paint.js 的 drawBackdrop）
const accentOnCard = (page) => {
    const gradient = page.drawCalls().find((call) => call.op === 'createLinearGradient');
    assert.ok(gradient, '預設背景有一個對角漸層');
    return gradient.result.stops.at(-1)[1];
};
const roleColors = (page) => plain(page.window.CardState.ROLE_COLORS);
// querySelectorAll() 與 .children 的結果和瀏覽器一樣沒有 map、filter、find 這些陣列的方法（見 tests/helpers/card-page.js）：要用先轉成陣列
const all = (root, selector) => Array.from(root.querySelectorAll(selector));
const kids = (element) => Array.from(element.children);
const labelOf = (page, id) => all(page.document, 'label').find((label) => label.getAttribute('for') === id).textContent;
const optionTexts = (select) => all(select, 'option').map((option) => option.textContent);
// ---------- 在 NodeList／HTMLCollection 上直接用陣列方法 ----------
// 瀏覽器的 querySelectorAll() 回傳 NodeList：有 forEach，沒有 map、filter、find、some…；.children 是 HTMLCollection：連 forEach 都沒有。
// fake-dom 兩個都回傳一般的陣列，頁面少轉成陣列時測試照樣過、真的瀏覽器卻在建構函式就丟 TypeError，所以另外掃原始碼
const ARRAY_ONLY = ['map', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every', 'reduce', 'reduceRight', 'includes', 'indexOf',
    'lastIndexOf', 'at', 'flat', 'flatMap', 'slice', 'splice', 'concat', 'join', 'sort', 'reverse', 'push', 'pop', 'shift', 'unshift', 'fill'];
// 回傳 NodeList 的呼叫（有 forEach）與回傳 HTMLCollection 的呼叫（沒有 forEach）、同名的屬性
const LIST_CALLS = [['querySelectorAll', false], ['getElementsByName', false], ['getElementsByClassName', true], ['getElementsByTagName', true]];
const LIST_PROPERTIES = [['children', true], ['childNodes', false]];

// 註解換成空白（長度與換行不變，行號才對得上）。// 只在行首或空白後才算註解，'https://…' 不會被當成註解
const blankComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/.*$/gm, (match, lead) => lead + ' '.repeat(match.length - lead.length));

// open 是 '(' 的位置，回傳對應的 ')' 的位置（引號裡的括號不算）；找不到是 -1
function closingParen(code, open) {
    let depth = 0;
    for (let i = open; i < code.length; i += 1) {
        const char = code[i];
        if (char === "'" || char === '"' || char === '`') {
            for (i += 1; i < code.length && code[i] !== char; i += 1) if (code[i] === '\\') i += 1;
        } else if (char === '(') {
            depth += 1;
        } else if (char === ')') {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return -1;
}

// 一個 JS 檔裡在 NodeList／HTMLCollection 上直接用陣列方法的每個地方，例如「第 160 行：querySelectorAll(...).map()」
function listMisuse(source) {
    const code = blankComments(source);
    const found = [];
    const lineOf = (index) => code.slice(0, index).split('\n').length;
    // from 後面緊接著（可以換行、可以 ?.）的是不是這些方法的呼叫
    const callOf = (from, noForEach) => new RegExp(`^\\s*\\??\\.\\s*(${(noForEach ? [...ARRAY_ONLY, 'forEach'] : ARRAY_ONLY).join('|')})\\s*\\(`).exec(code.slice(from));
    for (const [name, noForEach] of LIST_CALLS) {
        for (const match of code.matchAll(new RegExp(`\\.${name}\\s*\\(`, 'g'))) {
            const close = closingParen(code, match.index + match[0].length - 1);
            const next = close === -1 ? null : callOf(close + 1, noForEach);
            if (next) found.push(`第 ${lineOf(match.index)} 行：${name}(...).${next[1]}()`);
        }
    }
    for (const [name, noForEach] of LIST_PROPERTIES) {
        for (const match of code.matchAll(new RegExp(`\\.${name}(?![\\w$])`, 'g'))) {
            const next = callOf(match.index + match[0].length, noForEach);
            if (next) found.push(`第 ${lineOf(match.index)} 行：.${name}.${next[1]}()`);
        }
    }
    return found;
}

// CSS：選擇器清單含 selector 的每一條規則的宣告區，接在一起（找不到是空字串）
const declarations = (selector, source = CSS) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => rule[1].split(',').map((s) => s.trim()).includes(selector))
    .map((rule) => rule[2])
    .join('\n');
// style.css 裡每一個 @media：{ condition, body }（大括號要對起來，裡面的規則沒有巢狀）
function mediaBlocks(css) {
    const blocks = [];
    for (let start = css.indexOf('@media'); start !== -1; start = css.indexOf('@media', start + 1)) {
        const open = css.indexOf('{', start);
        let depth = 0;
        let close = open;
        for (; close < css.length; close += 1) {
            if (css[close] === '{') depth += 1;
            else if (css[close] === '}' && (depth -= 1) === 0) break;
        }
        blocks.push({ condition: css.slice(start + '@media'.length, open).trim(), body: css.slice(open + 1, close), start, end: close + 1 });
    }
    return blocks;
}
const MEDIA = mediaBlocks(CSS);
const mediaBody = (condition) => {
    const block = MEDIA.find((item) => item.condition === condition);
    assert.ok(block, `style.css 沒有 @media ${condition}`);
    return block.body;
};
// 拿掉所有 @media 之後剩下的基本規則（從後面往前拿，前面的位置才不會跑掉）
const BASE_CSS = [...MEDIA].reverse().reduce((css, block) => css.slice(0, block.start) + css.slice(block.end), CSS);

// 把每一個欄位都填上，回傳填的內容（頁面還原後要一模一樣）
function fillEverything(page) {
    page.type('cardName', 'Luna Starweaver');
    page.select('cardWorld', 'Tiamat');
    page.select('cardMainJob', 'Pictomancer');
    page.type('cardLevel', '87');
    page.chip('cardSubJobs', 'Paladin').click();
    page.chip('cardSubJobs', 'Fisher').click();
    page.type('cardTitle', 'Hero of Light');
    page.type('cardFcName', 'Moonlit Garden');
    page.type('cardFcTag', 'MOON');
    page.select('cardGc', 'twinAdder');
    page.toggle('hours-weekday-evening');
    page.toggle('hours-weekend-lateNight');
    page.chip('cardLikes', 'savage').click();
    page.chip('cardLikes', 'glamour').click();
    page.chip('cardLooking', 'static').click();
    page.type('cardIntro', 'Looking for a Savage static.');
    page.type('cardContact', 'Discord: luna_star');
    page.type('accentColor', '#123456');
    page.press('formatPortrait');
}

test('一打開：說明、五組欄位、canvas 1200×675、預設背景、只畫 SE 版權字與 FF14.tw（還沒填名字）', async () => {
    const page = await createCardPage();
    assert.equal(page.$('cardLead').textContent, '填名字、伺服器和主職就能下載；其他都是選填。');
    assert.equal(page.$('cardLead').getAttribute('data-i18n'), 'char_card_lead');

    // 五組欄位：分頁與面板一一對應（分頁控制面板，面板的名稱是分頁），一開始選的是第一個
    assert.equal(page.$('cardTabs').getAttribute('role'), 'tablist');
    assert.deepEqual(all(page.$('cardTabs'), 'button').map((tab) => tab.getAttribute('id')), TABS.map((key) => `tab-${key}`));
    for (const key of TABS) {
        const tab = page.$(`tab-${key}`);
        const panel = page.$(`panel-${key}`);
        assert.equal(tab.getAttribute('role'), 'tab');
        assert.equal(tab.getAttribute('aria-controls'), `panel-${key}`);
        assert.equal(panel.getAttribute('role'), 'tabpanel');
        assert.equal(panel.getAttribute('aria-labelledby'), `tab-${key}`);
        assert.ok(panel.querySelector('h2'), `panel-${key} 有標題`);
    }
    assert.deepEqual(all(page.$('cardTabs'), 'button').map((tab) => tab.textContent), ['基本', '名片', '怎麼玩', '圖片', '樣式']);
    assert.deepEqual(selectedTabs(page), ['basic']);
    assert.equal(page.$('cardForm').tagName, 'FORM');
    for (const key of TABS) assert.ok(page.$('cardForm').contains(page.$(`panel-${key}`)), `panel-${key} 在表單裡`);
    for (const id of ['cardName', 'cardWorld', 'cardWorldCustom', 'cardMainJob', 'cardLevel', 'cardSubJobs', 'cardTitle', 'cardFcName', 'cardFcTag', 'cardGc',
        'cardHours', 'cardLikes', 'cardLooking', 'cardIntro', 'cardContact', 'accentAuto', 'accentCustom', 'accentColor', 'clearAll',
        'cardPreview', 'cardCanvas', 'formatLandscape', 'formatPortrait', 'cardActions']) {
        assert.ok(page.$(id), `找不到 #${id}`);
    }

    // 卡片：1200×675，預設背景（對角漸層，停在沒選主職時的重點色），沒有截圖，只有 FF14.tw 與 SE 的版權字
    const canvas = page.$('cardCanvas');
    assert.equal(canvas.width, 1200);
    assert.equal(canvas.height, 675);
    assert.equal(canvas.getAttribute('role'), 'img');
    assert.equal(canvas.getAttribute('aria-label'), '角色卡預覽：還沒填資料');
    assert.deepEqual(page.texts().sort(), [MARK, NOTICE].sort());
    assert.equal(accentOnCard(page), roleColors(page).dps);
    assert.ok(page.drawCalls().some((call) => call.op === 'createRadialGradient'), '預設背景有光點');
    assert.ok(!page.drawCalls().some((call) => call.op === 'drawImage'), '沒有截圖也沒有職業圖示');
    assert.ok(page.drawCount() >= 1);

    // 還沒改任何東西：什麼都沒存，console 是空的；要用的字型都請瀏覽器載入了（FF14.tw 用 Outfit 600，版權字用 Noto Sans TC 500）
    assert.ok(!page.stored.has(KEY));
    assert.deepEqual(page.consoleErrors, []);
    const loads = page.fontLoads;
    assert.ok(loads.some(({ font, text }) => font.startsWith('600 ') && font.includes('Outfit') && [...'FF14.tw'].every((char) => text.includes(char))), 'FF14.tw 的字型');
    assert.ok(loads.some(({ font, text }) => font.startsWith('500 ') && font.includes('Noto Sans TC') && [...NOTICE].every((char) => text.includes(char))), '版權字的字型');
});

test('打名字、選伺服器與主職：卡片重畫出這些字，aria-label 跟著換，記在 ff14tw_character_card', async () => {
    const page = await createCardPage();
    const canvas = page.$('cardCanvas');

    let before = page.drawCount();
    page.type('cardName', 'Luna Starweaver');
    assert.equal(page.drawCount(), before + 1, '每改一次欄位就重畫一次');
    assert.ok(page.texts().includes('Luna Starweaver'));
    assert.equal(canvas.getAttribute('aria-label'), '角色卡預覽：Luna Starweaver');

    before = page.drawCount();
    page.select('cardWorld', '伊弗利特');
    assert.equal(page.drawCount(), before + 1);
    assert.ok(page.texts().includes('伊弗利特'));
    assert.equal(canvas.getAttribute('aria-label'), '角色卡預覽：Luna Starweaver，伊弗利特');

    page.select('cardMainJob', 'Pictomancer');
    assert.ok(page.texts().includes('繪靈法師'));
    assert.ok(page.texts().includes('Lv 100'));
    assert.equal(canvas.getAttribute('aria-label'), '角色卡預覽：Luna Starweaver，伊弗利特，繪靈法師 Lv 100');

    // 每次畫都從重設過的 canvas 開始：記錄裡只有這一次畫的東西，不會越積越多
    const calls = page.drawCalls().length;
    page.type('cardName', 'Luna Starweaver ');
    assert.equal(page.drawCalls().length, calls);

    // 記在 ff14tw_character_card（JSON，v: 1）：每改一次就存，不 trim（邊打邊存，打到一半的空白不能吃掉）
    const stored = saved(page);
    assert.equal(stored.v, 1);
    assert.equal(stored.name, 'Luna Starweaver ');
    assert.equal(stored.world, '伊弗利特');
    assert.equal(stored.mainJob, 'Pictomancer');
    assert.equal(stored.level, 100);
    page.type('cardName', 'Luna Starweaver');
    assert.equal(saved(page).name, 'Luna Starweaver');
    assert.deepEqual(page.consoleErrors, []);

    // 等級：改了卡片上的 Lv 跟著換；超出範圍的欄位離開時改回有效的值
    page.type('cardLevel', '87');
    assert.ok(page.texts().includes('Lv 87'));
    assert.equal(canvas.getAttribute('aria-label'), '角色卡預覽：Luna Starweaver，伊弗利特，繪靈法師 Lv 87');
    assert.equal(saved(page).level, 87);
    page.type('cardLevel', '150');
    assert.equal(saved(page).level, 100);
    page.$('cardLevel').dispatchEvent(new page.window.Event('change', { bubbles: true }));
    assert.equal(page.$('cardLevel').value, '100');
});

test('字數計數「5／21」與 maxlength', async () => {
    const page = await createCardPage();
    const { LIMITS } = page.window.CardState;
    // 有字數上限的欄位：maxlength 等於 CardState.LIMITS，旁邊的計數一開始是「0／上限」，輸入框用 aria-describedby 指到它
    const fields = [['cardName', 'name'], ['cardWorldCustom', 'world'], ['cardTitle', 'title'], ['cardFcName', 'fcName'], ['cardFcTag', 'fcTag'],
        ['cardIntro', 'intro'], ['cardContact', 'contact']];
    for (const [id, key] of fields) {
        assert.equal(page.$(id).getAttribute('maxlength'), String(LIMITS[key]), `#${id} 的 maxlength`);
        assert.equal(page.$(`${id}Count`).textContent, `0／${LIMITS[key]}`, `#${id}Count`);
        // 計數的 id 排第一；海報風格不畫的欄位（部隊名稱、聯絡方式）後面再接一個說明的 id（見「海報風格不畫的四個欄位」的測試）
        const [first, ...more] = (page.$(id).getAttribute('aria-describedby') ?? '').split(/\s+/);
        assert.equal(first, `${id}Count`);
        assert.deepEqual(more, ['cardFcName', 'cardContact'].includes(id) ? [`${id}NotDrawn`] : [], `#${id} 的 aria-describedby 後面`);
    }

    page.type('cardName', 'Aerin');
    assert.equal(page.$('cardNameCount').textContent, '5／21');
    // 到上限時不能再打（瀏覽器的 maxlength）：卡片與記憶裡也只有 21 個字
    page.type('cardName', 'x'.repeat(30));
    assert.equal(page.$('cardName').value.length, 21);
    assert.equal(page.$('cardNameCount').textContent, '21／21');
    assert.equal(saved(page).name, 'x'.repeat(21));
    // 以 Unicode 字元計：𠮷 一個字，不是兩個
    page.type('cardName', '𠮷野家');
    assert.equal(page.$('cardNameCount').textContent, '3／21');
    page.type('cardIntro', '一二三四五');
    assert.equal(page.$('cardIntroCount').textContent, '5／60');
    page.type('cardFcTag', 'MOON');
    assert.equal(page.$('cardFcTagCount').textContent, '4／5');
    // 計數的格式跟著介面語言：中文是全形斜線，英文與日文是半形
    page.setLang('en');
    assert.equal(page.$('cardNameCount').textContent, '3/21');
    assert.equal(page.$('cardIntroCount').textContent, '5/60');
    page.setLang('ja');
    assert.equal(page.$('cardFcTagCount').textContent, '4/5');

    // 一句話自我介紹：換行（\r\n、\r、\n）一律換成空白，輸入框、記憶與計數都是換過的
    page.type('cardIntro', 'a\r\nb\nc\rd');
    assert.equal(page.$('cardIntro').value, 'a b c d');
    assert.equal(saved(page).intro, 'a b c d');
    assert.equal(page.$('cardIntroCount').textContent, '7/60');
});

test('伺服器：繁中服一組 6 個排第一、國際服 85 個；選「其他」出現自己輸入的欄位，卡片畫自己輸入的字', async () => {
    const page = await createCardPage();
    const select = page.$('cardWorld');
    const [placeholder, tc, global, custom, ...rest] = select.children;
    assert.deepEqual(rest, []);
    assert.equal(placeholder.getAttribute('value'), '');
    assert.equal(placeholder.textContent, '選擇伺服器');
    assert.equal(tc.tagName, 'OPTGROUP');
    assert.equal(tc.getAttribute('label'), '繁中服');
    assert.deepEqual(kids(tc).map((option) => option.getAttribute('value')), plain(page.window.FF14_TC_WORLDS));
    assert.equal(tc.children.length, 6);
    assert.equal(global.tagName, 'OPTGROUP');
    assert.equal(global.getAttribute('label'), '國際服');
    assert.deepEqual(kids(global).map((option) => option.getAttribute('value')), plain(page.window.FF14_WORLDS.worlds));
    assert.equal(global.children.length, 85);
    for (const option of [...tc.children, ...global.children]) assert.equal(option.textContent, option.getAttribute('value'));
    assert.equal(custom.getAttribute('value'), '__custom');
    assert.equal(custom.textContent, '其他（自己輸入）');

    // 選一個：卡片寫伺服器名稱，自己輸入的欄位藏著
    assert.equal(page.isShown('cardWorldCustomGroup'), false);
    page.select('cardWorld', 'Tiamat');
    assert.ok(page.texts().includes('Tiamat'));
    assert.equal(page.isShown('cardWorldCustomGroup'), false);
    assert.equal(saved(page).world, 'Tiamat');

    // 選「其他」：自己輸入的欄位出現、焦點移進去，卡片先拿掉伺服器（欄位還是空的），打什麼就畫什麼
    page.select('cardWorld', '__custom');
    assert.equal(page.isShown('cardWorldCustomGroup'), true);
    isSame(page.document.activeElement, page.$('cardWorldCustom'), '焦點在自己輸入的欄位');
    assert.ok(!page.texts().includes('Tiamat'));
    page.type('cardWorldCustom', 'Nevermore');
    assert.ok(page.texts().includes('Nevermore'));
    assert.equal(saved(page).world, 'Nevermore');
    assert.equal(page.$('cardWorldCustomCount').textContent, '9／20');
    assert.equal(page.$('cardCanvas').getAttribute('aria-label'), '角色卡預覽：Nevermore');

    // 換回清單裡的：欄位藏起來，伺服器是選的那個；選回「選擇伺服器」就沒有伺服器
    page.select('cardWorld', '迦樓羅');
    assert.equal(page.isShown('cardWorldCustomGroup'), false);
    assert.ok(page.texts().includes('迦樓羅'));
    assert.ok(!page.texts().includes('Nevermore'));
    page.select('cardWorld', '');
    assert.equal(saved(page).world, '');

    // 重新打開：清單裡的伺服器選回那一項；不在兩份清單裡的選「其他」，欄位出現並帶著那個字
    const custom1 = await createCardPage({ stored: { [KEY]: JSON.stringify({ world: 'Nevermore' }) } });
    assert.equal(custom1.$('cardWorld').value, '__custom');
    assert.equal(custom1.isShown('cardWorldCustomGroup'), true);
    assert.equal(custom1.$('cardWorldCustom').value, 'Nevermore');
    assert.equal(custom1.$('cardWorldCustomCount').textContent, '9／20');
    assert.ok(custom1.texts().includes('Nevermore'));
    const listed = await createCardPage({ stored: { [KEY]: JSON.stringify({ world: '伊弗利特' }) } });
    assert.equal(listed.$('cardWorld').value, '伊弗利特');
    assert.equal(listed.isShown('cardWorldCustomGroup'), false);
    const none = await createCardPage();
    assert.equal(none.$('cardWorld').value, '');
});

test('主職：8 組、34 個；選騎士重點色變藍；其他職業最多 3 個，主職那一顆不能按', async () => {
    const page = await createCardPage();
    const select = page.$('cardMainJob');
    const [placeholder, ...groups] = select.children;
    assert.equal(placeholder.getAttribute('value'), '');
    assert.equal(placeholder.textContent, '選擇主職');
    assert.deepEqual(groups.map((group) => group.tagName), Array(8).fill('OPTGROUP'));
    assert.deepEqual(groups.map((group) => group.getAttribute('label')), ['坦克', '補師', '近戰', '遠程', '法系', '生產', '採集', '限定']);
    assert.deepEqual(groups.map((group) => group.children.length), [4, 4, 6, 3, 4, 8, 3, 2]);
    const jobs = plain(page.window.FF14_JOBS);
    const keysIn = (group) => kids(group).map((option) => option.getAttribute('value'));
    assert.equal(select.querySelectorAll('option').length - 1, 34);
    assert.deepEqual(keysIn(groups[0]), ['Paladin', 'Warrior', 'DarkKnight', 'Gunbreaker']);
    assert.deepEqual(keysIn(groups[7]), ['Beastmaster', 'BlueMage'], '限定職業不管職能都放在限定');
    assert.ok(!keysIn(groups[2]).includes('Beastmaster') && !keysIn(groups[4]).includes('BlueMage'));
    assert.deepEqual(groups.flatMap(keysIn).sort(), jobs.map((job) => job.key).sort(), '34 個職業各出現一次');
    assert.equal(all(select, 'option').find((option) => option.getAttribute('value') === 'Pictomancer').textContent, '繪靈法師');

    // 重點色跟著主職的職能：騎士是坦克，藍色
    assert.equal(accentOnCard(page), roleColors(page).dps);
    page.select('cardMainJob', 'Paladin');
    assert.equal(accentOnCard(page), roleColors(page).tank);
    assert.equal(roleColors(page).tank, '#4f74d6');
    assert.equal(page.$('accentColor').value, roleColors(page).tank);
    assert.equal(saved(page).mainJob, 'Paladin');

    // 其他職業：每個職業一顆按鈕，照共用資料的順序；主職那一顆不能按、也不是選取的
    const chips = all(page.$('cardSubJobs'), 'button');
    assert.deepEqual(chips.map((chip) => chip.dataset.job), jobs.map((job) => job.key));
    assert.deepEqual(chips.map((chip) => chip.textContent), jobs.map((job) => job.names.zh));
    assert.ok(chips.every((chip) => chip.getAttribute('type') === 'button' && ['true', 'false'].includes(chip.getAttribute('aria-pressed'))));
    const paladin = page.chip('cardSubJobs', 'Paladin');
    assert.equal(paladin.disabled, true);
    assert.equal(paladin.getAttribute('aria-pressed'), 'false');
    paladin.click();
    assert.deepEqual(plain(saved(page).subJobs), []);

    for (const key of ['Warrior', 'WhiteMage', 'Monk']) page.chip('cardSubJobs', key).click();
    assert.deepEqual(plain(saved(page).subJobs), ['Warrior', 'WhiteMage', 'Monk']);
    assert.equal(page.$('cardSubJobsCount').textContent, '3／3');
    for (const chip of page.$('cardSubJobs').querySelectorAll('button')) {
        const picked = ['Warrior', 'WhiteMage', 'Monk'].includes(chip.dataset.job);
        assert.equal(chip.getAttribute('aria-pressed'), picked ? 'true' : 'false', `${chip.dataset.job} 的 aria-pressed`);
        assert.equal(chip.classList.contains('active'), picked, `${chip.dataset.job} 的 .active 與 aria-pressed 一起換`);
        assert.equal(chip.disabled, !picked, `${chip.dataset.job}：滿 3 個時沒選的都不能按（含主職）`);
    }
    page.chip('cardSubJobs', 'Ninja').click();
    assert.equal(plain(saved(page).subJobs).length, 3, '滿了之後再按沒有效果');

    // 拿掉一個：其他的又能按，主職那一顆還是不能按
    page.chip('cardSubJobs', 'Monk').click();
    assert.equal(page.$('cardSubJobsCount').textContent, '2／3');
    assert.equal(page.chip('cardSubJobs', 'Ninja').disabled, false);
    assert.equal(page.chip('cardSubJobs', 'Paladin').disabled, true);

    // 主職換成已經選了的其他職業：它從其他職業拿掉，主職換了之後原本的主職又能選
    page.select('cardMainJob', 'Warrior');
    assert.deepEqual(plain(saved(page).subJobs), ['WhiteMage']);
    assert.equal(page.chip('cardSubJobs', 'Warrior').disabled, true);
    assert.equal(page.chip('cardSubJobs', 'Warrior').getAttribute('aria-pressed'), 'false');
    assert.equal(page.chip('cardSubJobs', 'Paladin').disabled, false);
    assert.equal(page.$('cardSubJobsCount').textContent, '1／3');
    assert.equal(accentOnCard(page), roleColors(page).tank);
});

test('職業圖示：載入完才畫圖示，載入前與載入失敗畫名稱的第一個字，每個圖示只載入一次，載入完重畫', async () => {
    const page = await createCardPage({ icons: 'hold' });
    const drawn = () => page.drawCalls().filter((call) => call.op === 'drawImage');
    page.select('cardMainJob', 'Pictomancer');
    page.chip('cardSubJobs', 'Paladin').click();
    // 載入前：沒有圖示，主職與其他職業各畫一個重點色方塊，裡面是名稱的第一個字
    assert.equal(page.images.length, 2);
    assert.deepEqual(page.images.map((image) => image.src), [
        '../../assets/images/se/FFXIVJobIcons/03_DPS/Job/Pictomancer.png',
        '../../assets/images/se/FFXIVJobIcons/01_TANK/Job/Paladin.png'
    ]);
    assert.equal(drawn().length, 0);
    assert.ok(page.texts().includes('繪') && page.texts().includes('騎'));

    // 載入成功：重畫，圖示換上去，方塊裡的字不見
    const before = page.drawCount();
    page.finishImages(true);
    assert.equal(page.drawCount(), before + 2, '每一張載入完各重畫一次');
    assert.equal(drawn().length, 2);
    for (const image of page.images) assert.ok(drawn().some((call) => call.args[0] === image), `${image.src} 畫了`);
    assert.ok(!page.texts().includes('繪') && !page.texts().includes('騎'));

    // 每個職業的圖示只載入一次：重畫、取消再選、換主職再換回來都用同一張
    page.chip('cardSubJobs', 'Paladin').click();
    page.chip('cardSubJobs', 'Paladin').click();
    page.select('cardMainJob', 'Pictomancer');
    assert.equal(page.images.length, 2);

    // 沒有圖示的職業（Beastmaster）不請求圖片，畫名稱的第一個字
    page.select('cardMainJob', 'Beastmaster');
    assert.equal(page.images.length, 2);
    assert.ok(page.texts().includes('B'));

    // 載入失敗：維持名稱的第一個字，不再請求、不丟錯
    const failing = await createCardPage({ icons: 'fail' });
    failing.select('cardMainJob', 'Pictomancer');
    await failing.flush();
    assert.equal(failing.images.length, 1);
    assert.ok(failing.texts().includes('繪'));
    assert.ok(!failing.drawCalls().some((call) => call.op === 'drawImage'));
    failing.type('cardName', 'Luna');
    failing.select('cardMainJob', 'Pictomancer');
    assert.equal(failing.images.length, 1);
    assert.deepEqual(failing.consoleErrors, []);
});

test('喜歡的內容最多 6 個，滿了其他的 disabled；時段 8 格；在找什麼', async () => {
    const page = await createCardPage();
    const { LIKES, DAYS, SLOTS } = page.window.CardState;

    // 喜歡的內容：16 顆按鈕照 CardState.LIKES 的順序，名稱是中文
    const likes = all(page.$('cardLikes'), 'button');
    assert.deepEqual(likes.map((chip) => chip.dataset.like), [...LIKES]);
    assert.deepEqual(likes.map((chip) => chip.textContent), ['主線劇情', '練等', '討伐殲滅戰', '零式', '絕境戰', '聯盟任務', 'PvP', '生產', '採集',
        '寶圖', '深層迷宮', '房屋', '幻化', '拍照', '角色扮演', '釣魚']);
    assert.ok(likes.every((chip) => chip.getAttribute('aria-pressed') === 'false' && chip.disabled !== true));
    assert.equal(page.$('cardLikesCount').textContent, '0／6');

    // 最多 6 個：滿了沒選的都 disabled，再按沒有效果；卡片上照 LIKES 的順序寫，不是點選的順序
    const picks = ['fishing', 'roleplay', 'photo', 'glamour', 'housing', 'deepDungeon'];
    for (const key of picks) page.chip('cardLikes', key).click();
    assert.deepEqual(plain(saved(page).likes), picks);
    assert.equal(page.$('cardLikesCount').textContent, '6／6');
    for (const chip of page.$('cardLikes').querySelectorAll('button')) {
        const picked = picks.includes(chip.dataset.like);
        assert.equal(chip.getAttribute('aria-pressed'), picked ? 'true' : 'false');
        assert.equal(chip.classList.contains('active'), picked);
        assert.equal(chip.disabled, !picked, `${chip.dataset.like}：滿 6 個時沒選的不能按`);
    }
    page.chip('cardLikes', 'msq').click();
    assert.equal(plain(saved(page).likes).length, 6);
    const labels = ['深層迷宮', '房屋', '幻化', '拍照', '角色扮演', '釣魚'];
    assert.deepEqual(plain(page.app.buildModel().likes), labels);
    for (const label of labels) assert.ok(page.texts().includes(label), `卡片上有 ${label}`);
    page.chip('cardLikes', 'housing').click();
    assert.equal(page.$('cardLikesCount').textContent, '5／6');
    assert.ok(all(page.$('cardLikes'), 'button').every((chip) => chip.disabled !== true), '少一個之後都能按了');
    assert.ok(!page.texts().includes('房屋'));

    // 遊玩時段：2 列（平日、假日）× 4 欄（早上、下午、晚上、深夜）共 8 個勾選框，value 是「日-時段」，名稱寫出是哪一格
    const boxes = all(page.$('cardHours'), 'input');
    assert.equal(boxes.length, 8);
    assert.deepEqual(boxes.map((box) => box.getAttribute('value')), plain(DAYS.flatMap((day) => SLOTS.map((slot) => `${day}-${slot}`))));
    assert.ok(boxes.every((box) => box.getAttribute('type') === 'checkbox'));
    assert.deepEqual(boxes.map((box) => box.getAttribute('aria-label')), ['平日 早上', '平日 下午', '平日 晚上', '平日 深夜', '假日 早上', '假日 下午', '假日 晚上', '假日 深夜']);
    const rows = all(page.$('cardHours'), '.hours-day');
    assert.deepEqual(rows.map((row) => row.querySelectorAll('input').length), [4, 4]);
    assert.ok(!page.texts().includes('平日'), '沒選時段，卡片上沒有時段格子');
    page.toggle('hours-weekday-evening');
    page.toggle('hours-weekend-lateNight');
    assert.deepEqual(plain(saved(page).hours), ['weekday-evening', 'weekend-lateNight']);
    assert.deepEqual([...page.app.buildModel().hours.on].sort(), ['weekday-evening', 'weekend-lateNight']);
    assert.deepEqual(plain(page.app.buildModel().hours.days), ['平日', '假日']);
    assert.deepEqual(plain(page.app.buildModel().hours.slots), ['早上', '下午', '晚上', '深夜']);
    for (const label of ['平日', '假日', '早上', '下午', '晚上', '深夜']) assert.ok(page.texts().includes(label), `時段格子上有 ${label}`);
    page.toggle('hours-weekday-evening');
    assert.deepEqual(plain(saved(page).hours), ['weekend-lateNight']);

    // 在找什麼：三顆按鈕（固定隊、部隊、朋友），都不選就是不找，可以多選
    const looking = all(page.$('cardLooking'), 'button');
    assert.deepEqual(looking.map((chip) => chip.dataset.looking), ['static', 'fc', 'friends']);
    assert.deepEqual(looking.map((chip) => chip.textContent), ['固定隊', '部隊', '朋友']);
    page.chip('cardLooking', 'fc').click();
    page.chip('cardLooking', 'static').click();
    assert.deepEqual(plain(saved(page).looking), ['fc', 'static']);
    assert.equal(page.chip('cardLooking', 'fc').getAttribute('aria-pressed'), 'true');
    assert.ok(looking.every((chip) => chip.disabled !== true));
    page.chip('cardLooking', 'fc').click();
    assert.deepEqual(plain(saved(page).looking), ['static']);
    assert.equal(page.chip('cardLooking', 'fc').getAttribute('aria-pressed'), 'false');
});

test('橫版／直版切換 canvas 尺寸，記住', async () => {
    const page = await createCardPage();
    const canvas = page.$('cardCanvas');
    const flags = () => ['formatLandscape', 'formatPortrait'].map((id) => page.$(id).getAttribute('aria-pressed'));
    assert.deepEqual(flags(), ['true', 'false']);
    assert.ok(page.$('formatLandscape').classList.contains('active') && !page.$('formatPortrait').classList.contains('active'));

    const before = page.drawCount();
    page.press('formatPortrait');
    assert.equal(canvas.width, 1080);
    assert.equal(canvas.height, 1350);
    assert.deepEqual(flags(), ['false', 'true']);
    assert.ok(page.$('formatPortrait').classList.contains('active') && !page.$('formatLandscape').classList.contains('active'));
    assert.equal(page.drawCount(), before + 1);
    assert.equal(saved(page).format, 'portrait');
    assert.deepEqual(page.texts().sort(), [MARK, NOTICE].sort(), '直版也是只有 FF14.tw 與版權字');

    // 重新打開還是直版
    const again = await page.reopen();
    assert.equal(again.$('cardCanvas').width, 1080);
    assert.equal(again.$('cardCanvas').height, 1350);
    assert.deepEqual(['formatLandscape', 'formatPortrait'].map((id) => again.$(id).getAttribute('aria-pressed')), ['false', 'true']);

    page.press('formatLandscape');
    assert.equal(canvas.width, 1200);
    assert.equal(canvas.height, 675);
    assert.equal(saved(page).format, 'landscape');
});

test('重點色：跟著職能／自訂顏色／改回跟著職能', async () => {
    const page = await createCardPage();
    const colors = roleColors(page);
    assert.equal(page.$('accentAuto').checked, true);
    assert.equal(page.$('accentCustom').checked, false);
    assert.equal(page.$('accentColor').getAttribute('type'), 'color');

    // 跟著職能：補師綠、輸出紅；色票顯示現在用的顏色
    page.select('cardMainJob', 'WhiteMage');
    assert.equal(accentOnCard(page), colors.healer);
    assert.equal(page.$('accentColor').value, colors.healer);
    page.select('cardMainJob', 'RedMage');
    assert.equal(accentOnCard(page), colors.dps);
    page.select('cardMainJob', 'Carpenter');
    assert.equal(accentOnCard(page), colors.crafting);
    assert.equal(saved(page).accent, 'auto');

    // 自訂顏色：動色票就改成自己選的，重點色不再跟著主職
    page.type('accentColor', '#123456');
    assert.equal(page.$('accentCustom').checked, true);
    assert.equal(page.$('accentAuto').checked, false);
    assert.equal(saved(page).accent, '#123456');
    assert.equal(accentOnCard(page), '#123456');
    page.select('cardMainJob', 'Paladin');
    assert.equal(accentOnCard(page), '#123456');
    assert.equal(page.$('accentColor').value, '#123456');

    // 改回跟著職能：色票也回到現在主職的顏色
    page.toggle('accentAuto');
    assert.equal(saved(page).accent, 'auto');
    assert.equal(accentOnCard(page), colors.tank);
    assert.equal(page.$('accentColor').value, colors.tank);
    assert.equal(page.$('accentAuto').checked, true);
    assert.equal(page.$('accentCustom').checked, false);

    // 選「自己選」但沒動色票：就用現在的顏色，之後換主職也不變
    page.toggle('accentCustom');
    assert.equal(saved(page).accent, colors.tank);
    page.select('cardMainJob', 'WhiteMage');
    assert.equal(accentOnCard(page), colors.tank);

    // 重新打開：自訂的顏色還在
    const again = await page.reopen();
    assert.equal(again.$('accentCustom').checked, true);
    assert.equal(again.$('accentColor').value, colors.tank);
    assert.equal(accentOnCard(again), colors.tank);
});

test('重新打開還原所有欄位；記憶壞掉時照常打開；瀏覽器封鎖網站資料時照常運作、console 是空的', async () => {
    const page = await createCardPage();
    fillEverything(page);
    await page.flush();
    const again = await page.reopen();
    const value = (id) => again.$(id).value;
    assert.equal(value('cardName'), 'Luna Starweaver');
    assert.equal(value('cardWorld'), 'Tiamat');
    assert.equal(value('cardMainJob'), 'Pictomancer');
    assert.equal(value('cardLevel'), '87');
    assert.equal(value('cardTitle'), 'Hero of Light');
    assert.equal(value('cardFcName'), 'Moonlit Garden');
    assert.equal(value('cardFcTag'), 'MOON');
    assert.equal(value('cardGc'), 'twinAdder');
    assert.equal(value('cardIntro'), 'Looking for a Savage static.');
    assert.equal(value('cardContact'), 'Discord: luna_star');
    assert.equal(value('accentColor'), '#123456');
    assert.equal(again.$('accentCustom').checked, true);
    const pressed = (group) => all(again.$(group), 'button').filter((chip) => chip.getAttribute('aria-pressed') === 'true')
        .map((chip) => chip.dataset.job ?? chip.dataset.like ?? chip.dataset.looking);
    assert.deepEqual(pressed('cardSubJobs'), ['Paladin', 'Fisher']);
    assert.deepEqual(pressed('cardLikes'), ['savage', 'glamour']);
    assert.deepEqual(pressed('cardLooking'), ['static']);
    assert.deepEqual(all(again.$('cardHours'), 'input').filter((box) => box.checked === true).map((box) => box.getAttribute('value')),
        ['weekday-evening', 'weekend-lateNight']);
    assert.equal(again.$('cardCanvas').width, 1080);
    for (const text of ['Luna Starweaver', 'Tiamat', '繪靈法師', 'Lv 87', 'Looking for a Savage static.']) {
        assert.ok(again.texts().some((drawn) => drawn.includes(text)), `還原後卡片上有 ${text}`);
    }
    assert.equal(again.$('cardNameCount').textContent, '15／21');
    assert.deepEqual(plain(saved(again)), plain(saved(page)));
    assert.deepEqual(again.consoleErrors, []);

    // 記憶壞掉：不是 JSON → 預設；是 JSON 但欄位壞掉 → 丟掉壞的、其他照用；都不留 console，也不影響圖片那個鍵
    const broken = await createCardPage({ stored: { [KEY]: '{' } });
    assert.equal(broken.$('cardName').value, '');
    assert.equal(broken.$('cardMainJob').value, '');
    assert.deepEqual(broken.texts().sort(), [MARK, NOTICE].sort());
    assert.deepEqual(broken.consoleErrors, []);
    const partial = await createCardPage({ stored: { [KEY]: JSON.stringify({ name: 123, mainJob: 'Nope', world: 'Tiamat', likes: ['msq', 'bad'], format: 'oops', level: 'x' }) } });
    assert.equal(partial.$('cardName').value, '');
    assert.equal(partial.$('cardMainJob').value, '');
    assert.equal(partial.$('cardWorld').value, 'Tiamat');
    assert.equal(partial.$('cardLevel').value, '100');
    assert.deepEqual(all(partial.$('cardLikes'), 'button').filter((chip) => chip.getAttribute('aria-pressed') === 'true').map((chip) => chip.dataset.like), ['msq']);
    assert.equal(partial.$('cardCanvas').width, 1200);
    assert.deepEqual(partial.consoleErrors, []);
    partial.type('cardName', 'Luna');
    assert.equal(saved(partial).world, 'Tiamat', '下一次存的時候才把壞掉的內容換成整理過的');

    // 瀏覽器封鎖網站資料：光是讀 localStorage 就丟例外，照常打開、照常運作，只是不記住
    const blocked = await createCardPage({ storageThrows: true });
    blocked.type('cardName', 'Luna Starweaver');
    blocked.select('cardMainJob', 'Paladin');
    blocked.chip('cardLikes', 'msq').click();
    blocked.press('formatPortrait');
    assert.ok(blocked.texts().includes('Luna Starweaver'));
    assert.equal(blocked.$('cardCanvas').width, 1080);
    assert.equal(blocked.stored.size, 0);
    assert.deepEqual(blocked.consoleErrors, []);
    const blockedAgain = await blocked.reopen();
    assert.equal(blockedAgain.$('cardName').value, '');
    assert.deepEqual(blockedAgain.consoleErrors, []);
});

test('清除全部：要按兩次，3 秒後變回原本的字', async () => {
    const page = await createCardPage({ stored: { [IMAGE_KEY]: dataUrlOf(640, 360) } });
    fillEverything(page);
    const button = page.$('clearAll');
    assert.equal(button.textContent, '清除全部');
    assert.ok(page.stored.has(KEY) && page.stored.has(IMAGE_KEY));

    // 第一次按：只換字、排 3 秒的計時，什麼都沒清
    page.press(button);
    assert.equal(button.textContent, '再按一次清除');
    assert.deepEqual(page.pendingDelays(), [3000]);
    assert.equal(page.$('cardName').value, 'Luna Starweaver');
    assert.ok(page.stored.has(KEY) && page.stored.has(IMAGE_KEY));
    assert.equal(page.toasts.length, 0);

    // 3 秒沒再按：變回原本的字；之後再按又要兩次
    page.runTimeouts();
    assert.equal(button.textContent, '清除全部');
    assert.deepEqual(page.pendingDelays(), []);
    page.press(button);
    assert.equal(button.textContent, '再按一次清除');
    assert.equal(page.$('cardName').value, 'Luna Starweaver');
    assert.deepEqual(page.pendingDelays(), [3000]);

    // 3 秒內再按一次：欄位、記憶（兩個鍵）全清，卡片回到什麼都沒填的樣子，計時取消，按鈕變回原本的字，toast 說清掉了
    page.press(button);
    assert.equal(button.textContent, '清除全部');
    assert.deepEqual(page.pendingDelays(), []);
    assert.ok(!page.stored.has(KEY) && !page.stored.has(IMAGE_KEY));
    for (const id of ['cardName', 'cardTitle', 'cardFcName', 'cardFcTag', 'cardIntro', 'cardContact', 'cardWorld', 'cardMainJob', 'cardGc']) {
        assert.equal(page.$(id).value, '', `#${id} 清空`);
    }
    assert.equal(page.$('cardLevel').value, '100');
    assert.equal(page.$('accentAuto').checked, true);
    assert.equal(page.$('accentCustom').checked, false);
    assert.equal(page.$('cardNameCount').textContent, '0／21');
    for (const group of ['cardSubJobs', 'cardLikes', 'cardLooking']) {
        assert.ok(all(page.$(group), 'button').every((chip) => chip.getAttribute('aria-pressed') === 'false' && chip.disabled !== true), `${group} 都沒選`);
    }
    assert.ok(all(page.$('cardHours'), 'input').every((box) => box.checked !== true));
    assert.equal(page.$('cardCanvas').width, 1200, '版型回到橫版');
    assert.deepEqual(page.texts().sort(), [MARK, NOTICE].sort());
    assert.equal(page.$('cardCanvas').getAttribute('aria-label'), '角色卡預覽：還沒填資料');
    assert.deepEqual(page.toasts.map((toast) => toast.message), ['已清除全部資料']);
    assert.deepEqual(page.consoleErrors, []);

    // 清掉之後再填，又會記住
    page.type('cardName', 'Luna');
    assert.equal(saved(page).name, 'Luna');

    // 等著確認的時候換語言：按鈕寫的是那個語言的「再按一次清除」，再按一次還是清掉
    page.press(button);
    page.setLang('en');
    assert.equal(button.textContent, 'Press again to clear');
    page.press(button);
    assert.equal(page.$('cardName').value, '');
    assert.equal(button.textContent, 'Clear everything');
});

test('切換語言：標籤、選項與卡片上的字換成那個語言，選的值不變', async () => {
    const page = await createCardPage();
    fillEverything(page);
    page.type('cardLevel', '100');
    const values = () => ['cardName', 'cardWorld', 'cardMainJob', 'cardLevel', 'cardGc', 'cardTitle', 'cardIntro'].map((id) => page.$(id).value);
    const before = values();
    const stateBefore = page.stored.get(KEY);
    const draws = page.drawCount();

    page.setLang('en');
    assert.ok(page.drawCount() > draws, '換語言要重畫');
    assert.deepEqual(values(), before, '選的值不變');
    assert.equal(page.stored.get(KEY), stateBefore, '語言不存進欄位的記憶');
    assert.equal(labelOf(page, 'cardName'), 'Character name');
    assert.equal(page.$('cardLead').textContent, 'Fill in a name, world and main job to download. Everything else is optional.');
    assert.deepEqual(all(page.$('cardTabs'), 'button').map((tab) => tab.textContent), ['Basics', 'Profile', 'Play', 'Image', 'Style']);
    assert.equal(page.$('cardName').getAttribute('placeholder'), 'Luna Starweaver');
    // 主職、其他職業、伺服器的選單與按鈕：用同一批節點改字，選的值還在
    const jobOption = (key) => all(page.$('cardMainJob'), 'option').find((option) => option.getAttribute('value') === key);
    assert.equal(jobOption('Pictomancer').textContent, 'Pictomancer');
    assert.equal(jobOption('WhiteMage').textContent, 'White Mage');
    assert.equal(jobOption('').textContent, 'Choose a main job');
    assert.deepEqual(all(page.$('cardMainJob'), 'optgroup').map((group) => group.getAttribute('label')),
        ['Tank', 'Healer', 'Melee DPS', 'Physical Ranged DPS', 'Magical Ranged DPS', 'Crafter', 'Gatherer', 'Limited']);
    assert.equal(page.chip('cardSubJobs', 'Paladin').textContent, 'Paladin');
    assert.equal(page.chip('cardSubJobs', 'Fisher').textContent, 'Fisher');
    assert.deepEqual(all(page.$('cardWorld'), 'optgroup').map((group) => group.getAttribute('label')), ['Traditional Chinese', 'International']);
    assert.deepEqual([optionTexts(page.$('cardWorld'))[0], optionTexts(page.$('cardWorld')).at(-1)], ['Choose a world', 'Other (type it in)']);
    assert.equal(page.chip('cardLikes', 'treasure').textContent, 'Treasure Hunts');
    assert.equal(page.chip('cardLooking', 'fc').textContent, 'Free Company');
    assert.deepEqual(all(page.$('cardHours'), 'input').slice(0, 2).map((box) => box.getAttribute('aria-label')), ['Weekdays Morning', 'Weekdays Afternoon']);
    assert.equal(page.$('cardNameCount').textContent, '15/21');
    assert.equal(page.$('formatPortrait').textContent, 'Portrait');
    assert.equal(page.$('clearAll').textContent, 'Clear everything');
    // 卡片：職業、喜歡的內容、時段格子的字是英文；時段用短標籤，不然縮到看不清
    assert.equal(page.$('cardCanvas').getAttribute('aria-label'), 'Character card preview: Luna Starweaver, Tiamat, Pictomancer Lv 100');
    for (const text of ['Luna Starweaver', 'Tiamat', 'Pictomancer', 'Lv 100', 'Savage', 'Glamour', 'Wkdy', 'Wknd', 'Morn', 'Aft', 'Eve', 'Late']) {
        assert.ok(page.texts().includes(text), `英文的卡片上有 ${text}`);
    }
    for (const text of ['繪靈法師', '零式', '幻化', '平日', '晚上', 'Morning', 'Weekdays']) assert.ok(!page.texts().includes(text), `英文的卡片上沒有 ${text}`);

    page.setLang('ja');
    assert.deepEqual(values(), before);
    assert.equal(page.chip('cardSubJobs', 'Paladin').textContent, 'ナイト');
    assert.equal(page.chip('cardLikes', 'glamour').textContent, 'ミラプリ');
    assert.equal(jobOption('Pictomancer').textContent, 'ピクトマンサー');
    assert.equal(page.$('cardCanvas').getAttribute('aria-label'), 'キャラクターカードのプレビュー：Luna Starweaver、Tiamat、ピクトマンサー Lv 100');
    for (const text of ['ピクトマンサー', '零式', 'ミラプリ', '平日', '休日', '夜', '深夜']) assert.ok(page.texts().includes(text), `日文的卡片上有 ${text}`);

    // 選的狀態也不變：勾選、按下的按鈕、版型
    assert.deepEqual(all(page.$('cardHours'), 'input').filter((box) => box.checked === true).map((box) => box.getAttribute('value')), ['weekday-evening', 'weekend-lateNight']);
    assert.equal(page.chip('cardLikes', 'savage').getAttribute('aria-pressed'), 'true');
    assert.equal(page.$('cardCanvas').width, 1080);

    page.setLang('zh');
    assert.equal(labelOf(page, 'cardName'), '角色名稱');
    assert.equal(page.chip('cardSubJobs', 'Paladin').textContent, '騎士');
    assert.ok(page.texts().includes('繪靈法師'));
});

test('手機：只顯示目前分頁，左右鍵與 Home／End 切換；電腦：五組都顯示、沒有分頁列；跨過 768px 時焦點不會掉', async () => {
    // 電腦：五組都顯示（分頁列由樣式藏起來，見下面的樣式測試）
    const desktop = await createCardPage();
    assert.deepEqual(shownPanels(desktop), TABS);

    // 手機：只有目前的分頁（一開始是基本）。aria-selected、tabindex、.active 一起換
    const page = await createCardPage({ narrow: true });
    assert.deepEqual(shownPanels(page), ['basic']);
    assert.deepEqual(selectedTabs(page), ['basic']);
    assert.deepEqual(TABS.map((key) => page.$(`tab-${key}`).getAttribute('tabindex')), ['0', '-1', '-1', '-1', '-1']);
    assert.deepEqual(TABS.filter((key) => page.$(`tab-${key}`).classList.contains('active')), ['basic']);

    page.press('tab-play');
    assert.deepEqual(shownPanels(page), ['play']);
    assert.deepEqual(selectedTabs(page), ['play']);
    assert.deepEqual(TABS.map((key) => page.$(`tab-${key}`).getAttribute('tabindex')), ['-1', '-1', '0', '-1', '-1']);
    assert.deepEqual(TABS.filter((key) => page.$(`tab-${key}`).classList.contains('active')), ['play']);

    // 鍵盤：左右鍵移動並切換（頭尾相接），Home／End 到第一個／最後一個；焦點跟著走；按著 Alt／Ctrl／⌘ 或別的鍵不處理
    page.$('tab-play').focus();
    const arrow = (key, init) => page.key(key, page.document.activeElement, init);
    assert.equal(arrow('ArrowRight').defaultPrevented, true);
    assert.deepEqual(shownPanels(page), ['image']);
    isSame(page.document.activeElement, page.$('tab-image'), '焦點跟著到圖片分頁');
    arrow('ArrowRight');
    isSame(page.document.activeElement, page.$('tab-style'), '到最後一個');
    arrow('ArrowRight');
    assert.deepEqual(selectedTabs(page), ['basic'], '最後一個再往右回到第一個');
    isSame(page.document.activeElement, page.$('tab-basic'));
    arrow('ArrowLeft');
    assert.deepEqual(selectedTabs(page), ['style'], '第一個再往左到最後一個');
    arrow('Home');
    assert.deepEqual(selectedTabs(page), ['basic']);
    assert.deepEqual(shownPanels(page), ['basic']);
    arrow('End');
    assert.deepEqual(selectedTabs(page), ['style']);
    assert.deepEqual(shownPanels(page), ['style']);
    isSame(page.document.activeElement, page.$('tab-style'));
    for (const init of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
        const event = arrow('Home', init);
        assert.equal(event.defaultPrevented, false);
        assert.deepEqual(selectedTabs(page), ['style'], `${Object.keys(init)[0]} 不處理`);
    }
    for (const key of ['Enter', 'ArrowDown', 'a', 'Tab']) {
        assert.equal(arrow(key).defaultPrevented, false);
        assert.deepEqual(selectedTabs(page), ['style']);
    }

    // 跨過 768px：焦點在哪一組的欄位裡，就切到那一組，焦點不會掉
    const wide = await createCardPage();
    wide.$('cardContact').focus();
    wide.setNarrow(true);
    assert.deepEqual(shownPanels(wide), ['profile']);
    assert.deepEqual(selectedTabs(wide), ['profile']);
    isSame(wide.document.activeElement, wide.$('cardContact'), '焦點還在自己輸入的欄位上');
    // 焦點不在任何一組裡：切到基本
    const idle = await createCardPage();
    idle.setNarrow(true);
    assert.deepEqual(shownPanels(idle), ['basic']);
    assert.deepEqual(selectedTabs(idle), ['basic']);
    // 手機變電腦：五組都出來（藏著的 hidden 都拿掉），選的欄位照舊
    idle.press('tab-style');
    idle.setNarrow(false);
    assert.deepEqual(shownPanels(idle), TABS);
    // 手機變電腦時焦點在分頁上（電腦沒有分頁列）：移到那一組，不丟到頁面最上面
    const onTab = await createCardPage({ narrow: true });
    onTab.press('tab-play');
    onTab.$('tab-play').focus();
    onTab.setNarrow(false);
    assert.deepEqual(shownPanels(onTab), TABS);
    isSame(onTab.document.activeElement, onTab.$('panel-play'), '焦點移到那一組');
    // 再變回手機：焦點在那一組裡，就切到那一組
    onTab.setNarrow(true);
    assert.deepEqual(selectedTabs(onTab), ['play']);
    isSame(onTab.document.activeElement, onTab.$('panel-play'));

    // 表單永遠不送出（按 Enter 不會換頁）
    const submit = new page.window.Event('submit', { bubbles: true, cancelable: true });
    page.$('cardForm').dispatchEvent(submit);
    assert.equal(submit.defaultPrevented, true);
});

test('字型：先畫再等字型，載入完重畫；只請求還沒請求過的字；切換語言與改名字時載入新的字', async () => {
    const page = await createCardPage({ fontsDelay: true });
    // 字型還沒回來：卡片已經畫了（用備用字型），ready 還沒完成
    assert.ok(page.drawCount() >= 1);
    let ready = false;
    page.app.ready.then(() => { ready = true; });
    await page.flush();
    assert.equal(ready, false);
    assert.ok(page.fontLoads.length > 0);
    const first = page.fontLoads.length;
    const drawn = page.drawCount();
    page.releaseFonts();
    await page.flush();
    assert.equal(ready, true, '字型載入完 ready 才完成');
    assert.equal(page.drawCount(), drawn + 1, '載入完重畫一次');
    assert.equal(page.fontLoads.length, first, '沒有新的字就不再請求');

    // 改名字：只請求新的字（名字用 Outfit 800），載入完再畫一次
    page.type('cardName', 'Luna');
    assert.ok(page.fontLoads.slice(first).some(({ font, text }) => font.startsWith('800 ') && font.includes('Outfit') && [...'Luna'].every((char) => text.includes(char))));
    const second = page.fontLoads.length;
    const afterType = page.drawCount();
    page.releaseFonts();
    await page.flush();
    assert.equal(page.drawCount(), afterType + 1);
    page.type('cardName', 'Lun');
    assert.equal(page.fontLoads.length, second, '名字裡的字都請求過了，不再請求');
    await page.flush();

    // 等到所有字型載入並重畫（下載、分享、複製之前用它）
    page.type('cardName', 'Luna Starweaver');
    let settled = false;
    const wait = page.app.fontsReady().then(() => { settled = true; });
    await page.flush();
    assert.equal(settled, false);
    const beforeRelease = page.drawCount();
    page.releaseFonts();
    await wait;
    assert.equal(settled, true);
    assert.ok(page.drawCount() > beforeRelease, 'fontsReady 完成時已經用載入好的字型重畫過');

    // 切換語言：新語言的字（職業名稱、時段短標籤…）也請求字型
    page.select('cardMainJob', 'Pictomancer');
    page.toggle('hours-weekday-evening');
    page.releaseFonts();
    await page.flush();
    const beforeLang = page.fontLoads.length;
    page.setLang('en');
    assert.ok(page.fontLoads.length > beforeLang);
    assert.ok(page.fontLoads.slice(beforeLang).some(({ text }) => text.includes('W') && text.includes('k')), '英文的時段短標籤 Wkdy');
    page.releaseFonts();
    await page.flush();

    // 沒有 document.fonts 的瀏覽器：照常畫，ready 照常完成，不丟錯
    const plainPage = await createCardPage();
    delete plainPage.document.fonts;
    plainPage.type('cardName', 'Luna');
    await plainPage.app.fontsReady();
    assert.ok(plainPage.texts().includes('Luna'));
    assert.deepEqual(plainPage.consoleErrors, []);
});

test('fontsReady 等到每一批字型都載完（後一批先完成時也一樣）', async () => {
    // 畫一次請求一批字型。中文字型依字分批載入，先請求的那一批可能比後請求的慢（一個子集還在下載）：
    // fontsReady() 要等到每一批，不能只等最後請求的那一批
    const page = await createCardPage({ fontsDelay: true });
    page.releaseFonts();
    await page.app.ready;
    assert.deepEqual(page.heldFontBatches(), []);

    // 先打 ABC（第一批），再打 ABCz（第二批，只多一個 z）：兩批都在等
    page.type('cardName', 'ABC');
    page.type('cardName', 'ABCz');
    const batches = page.heldFontBatches();
    assert.equal(batches.length, 2);
    assert.ok(batches[0].some(({ font, text }) => font.startsWith('800 ') && [...'ABC'].every((char) => text.includes(char))), '第一批是 ABC');
    assert.deepEqual(batches[1].map(({ text }) => text), ['z'], '第二批只有 z');
    let settled = false;
    const wait = page.app.fontsReady().then(() => { settled = true; });
    await page.flush();
    assert.equal(settled, false);

    // 後一批先載完：卡片先照它重畫（載好的字不用等慢的那一批），但 fontsReady() 還要等第一批
    const drawn = page.drawCount();
    page.releaseFonts(1);
    await page.flush();
    assert.equal(page.drawCount(), drawn + 1, '第二批載完就重畫一次');
    assert.equal(settled, false, '第一批還沒載完，fontsReady() 不能完成');
    assert.equal(page.heldFontBatches().length, 1);

    // 第一批也載完：再重畫一次，fontsReady() 完成
    page.releaseFonts(0);
    await wait;
    assert.equal(settled, true);
    assert.equal(page.drawCount(), drawn + 2);
    assert.deepEqual(page.heldFontBatches(), []);

    // 第一次畫請求的那一批也一樣：ready 要等它，後來請求的先載完，新呼叫的 fontsReady() 也不能提早完成
    const early = await createCardPage({ fontsDelay: true });
    let ready = false;
    let waited = false;
    early.app.ready.then(() => { ready = true; });
    early.type('cardName', 'ABC');
    assert.equal(early.heldFontBatches().length, 2, '第一次畫的那一批與 ABC 那一批');
    early.app.fontsReady().then(() => { waited = true; });
    early.releaseFonts(1);
    await early.flush();
    assert.deepEqual([ready, waited], [false, false]);
    early.releaseFonts(0);
    await early.flush();
    assert.deepEqual([ready, waited], [true, true]);
});

test('fontsReady 也等載入的時候又請求的那一批，而且一批都不漏', async () => {
    const page = await createCardPage({ fontsDelay: true });
    page.releaseFonts();
    await page.app.ready;

    // 等的時候又請求了新的字（使用者又打了字）：先請求的那一批載完了，fontsReady() 還要等後來的那一批
    page.type('cardName', 'ABC');
    let first = false;
    const waitFirst = page.app.fontsReady().then(() => { first = true; });
    page.type('cardName', 'ABCz');
    assert.equal(page.heldFontBatches().length, 2);
    page.releaseFonts(0);
    await page.flush();
    assert.equal(first, false, '等的時候請求的那一批還沒載完');
    page.releaseFonts(0);
    await waitFirst;
    assert.equal(first, true);

    // 慢的第一批、後來的第二批，fontsReady() 在等的時候又來第三批：第三批與第二批先載完，第一批還沒，就不能完成
    page.type('cardName', 'ABCzy');
    page.type('cardName', 'ABCzyx');
    let second = false;
    const waitSecond = page.app.fontsReady().then(() => { second = true; });
    page.type('cardName', 'ABCzyxw');
    assert.deepEqual(page.heldFontBatches().map((batch) => batch.map(({ text }) => text)), [['y'], ['x'], ['w']]);
    page.releaseFonts(2);
    page.releaseFonts(1);
    await page.flush();
    assert.equal(second, false, '第三批與第二批都載完了，第一批還沒：不能完成');
    page.releaseFonts(0);
    await waitSecond;
    assert.equal(second, true);
    assert.deepEqual(page.heldFontBatches(), []);
    assert.deepEqual(page.consoleErrors, []);
});

test('字型載入失敗：不丟錯，卡片照樣重畫（備用字型），fontsReady() 照樣完成，失敗的字不再請求', async () => {
    const page = await createCardPage({ fontsDelay: true });
    page.releaseFonts();
    await page.app.ready;

    page.type('cardName', 'Luna');
    page.type('cardName', 'Lunaz');
    let settled = false;
    const wait = page.app.fontsReady().then(() => { settled = true; });
    const drawn = page.drawCount();
    page.releaseFonts(0, { fail: true });
    await page.flush();
    assert.equal(page.drawCount(), drawn + 1, '失敗也重畫');
    assert.equal(settled, false, '另一批還在載');
    page.releaseFonts(0);
    await wait;
    assert.equal(settled, true);
    assert.equal(page.drawCount(), drawn + 2);
    assert.ok(page.texts().includes('Lunaz'));
    assert.deepEqual(page.consoleErrors, []);

    // 請求過的字不管成功或失敗都不再請求
    const requested = page.fontLoads.length;
    page.type('cardName', 'Lun');
    page.type('cardName', 'Lunaz');
    assert.equal(page.fontLoads.length, requested);
    assert.deepEqual(page.heldFontBatches(), []);
});

test('頁面替身本身：canvas 重設、matchMedia、字型與圖示的控制、Web Share 與剪貼簿', async () => {
    const page = await createCardPage({ narrow: true, coarse: true, userAgent: 'Line/14.0', share: 'cancel', clipboard: 'reject' });
    // matchMedia 只認兩種查詢，現在的值照選項；setNarrow 通知監聽
    assert.equal(page.window.matchMedia('(max-width: 768px)').matches, true);
    assert.equal(page.window.matchMedia('(pointer: coarse)').matches, true);
    assert.throws(() => page.window.matchMedia('(min-width: 1px)'), /沒有準備 matchMedia/);
    const seen = [];
    page.window.matchMedia('(max-width: 768px)').addEventListener('change', (event) => seen.push(event.matches));
    page.setNarrow(false);
    assert.deepEqual(seen, [false]);
    assert.equal(page.window.matchMedia('(max-width: 768px)').matches, false);

    // canvas：設寬高會重設（記錄清空），getContext 只認 2d；toBlob 非同步、toDataURL 有值
    const canvas = page.$('cardCanvas');
    assert.ok(page.drawCalls().length > 0);
    canvas.width = 1200;
    assert.equal(page.drawCalls().length, 0);
    assert.throws(() => canvas.getContext('webgl'), /只有 2d/);
    let blob = null;
    canvas.toBlob((value) => { blob = value; }, 'image/png');
    assert.equal(blob, null);
    await page.flush();
    assert.equal(blob.type, 'image/png');
    assert.deepEqual(page.blobRequests().map((request) => request.type), ['image/png']);
    assert.match(canvas.toDataURL('image/png'), /^data:image\/png;base64,/);

    // navigator 與剪貼簿
    assert.equal(page.window.navigator.userAgent, 'Line/14.0');
    assert.equal(page.window.navigator.canShare({ files: [1] }), true);
    await assert.rejects(page.window.navigator.share({ files: [1] }), { name: 'AbortError' });
    await assert.rejects(page.window.navigator.clipboard.write([]), { name: 'NotAllowedError' });
    const bare = await createCardPage();
    assert.equal(bare.window.navigator.share, undefined);
    assert.equal(bare.window.navigator.clipboard, undefined);
    assert.equal(bare.window.ClipboardItem, undefined);
    const ok = await createCardPage({ share: 'ok', clipboard: 'ok' });
    await ok.window.navigator.share({ files: [1] });
    await ok.window.navigator.clipboard.write([new ok.window.ClipboardItem({ 'image/png': 1 })]);
    assert.equal(ok.shares.length, 1);
    assert.equal(ok.clipboardWrites.length, 1);
    assert.equal(ok.window.navigator.canShare({}), false);
    const none = await createCardPage({ share: 'no-files' });
    assert.equal(none.window.navigator.canShare({ files: [1] }), false);

    // querySelectorAll() 與 .children 和瀏覽器一樣：NodeList 有 forEach 沒有 map 這些陣列的方法，HTMLCollection 連 forEach 都沒有；
    // 頁面少轉成陣列時，在頁面的程式裡呼叫就丟 TypeError（真的瀏覽器的錯誤訊息一樣），不再是測試過、瀏覽器壞
    const group = page.$('cardLikes');
    const buttons = group.querySelectorAll('button');
    assert.equal(buttons.length, 16);
    assert.equal(typeof buttons.forEach, 'function');
    assert.equal(buttons.item(0).dataset.like, 'msq');
    assert.equal(buttons.item(99), null);
    isSame(buttons[1], buttons.item(1));
    assert.equal([...buttons].length, 16);
    assert.equal(Array.from(buttons.keys()).length, 16);
    const indexes = [];
    buttons.forEach((button, index, list) => { indexes.push(index); isSame(list, buttons); });
    assert.equal(indexes.length, 16);
    const arrayMethods = ['map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce', 'includes', 'indexOf', 'at', 'flatMap', 'slice', 'join', 'push'];
    for (const name of arrayMethods) {
        assert.equal(buttons[name], undefined, `NodeList 沒有 ${name}`);
        assert.equal(group.children[name], undefined, `HTMLCollection 沒有 ${name}`);
        assert.equal(page.document.querySelectorAll('button')[name], undefined);
        assert.equal(page.document.body.querySelectorAll('button')[name], undefined);
    }
    assert.equal(group.children.length, 16);
    assert.equal(group.children.forEach, undefined);
    isSame(group.children.item(0), buttons[0]);
    assert.equal(group.children.namedItem('nope'), null);
    assert.equal([...group.children].length, 16);
    // fake-dom 自己靠 [0]、.children 的功能照常
    isSame(group.querySelector('button'), buttons[0]);
    isSame(group.firstElementChild, buttons[0]);
    isSame(buttons[0].nextElementSibling, buttons[1]);
    isSame(buttons[1].previousElementSibling, buttons[0]);
    assert.equal(buttons[15].nextElementSibling, null);
    assert.equal(buttons[0].previousElementSibling, null);
    // 在頁面的程式裡直接用陣列方法會丟錯，先 Array.from() 就行
    assert.throws(() => vm.runInContext("document.getElementById('cardLikes').querySelectorAll('button').map((chip) => chip)", page.window), /map is not a function/);
    assert.throws(() => vm.runInContext("document.getElementById('cardLikes').children.forEach((chip) => chip)", page.window), /forEach is not a function/);
    assert.equal(vm.runInContext("Array.from(document.getElementById('cardLikes').querySelectorAll('button')).map((chip) => chip.dataset.like).length", page.window), 16);

    // type 照 maxlength 截斷；select 找不到的選項丟錯；toggle 只認勾選框與單選
    page.type('cardFcTag', 'ABCDEFGH');
    assert.equal(page.$('cardFcTag').value, 'ABCDE');
    assert.throws(() => page.select('cardMainJob', 'Nope'), /沒有 value/);
    assert.throws(() => page.toggle('cardName'), /不是勾選框或單選/);
});

// ---------- 角色圖：上傳、拖曳、縮放、調整模式 ----------
// 上傳一個檔案並等頁面處理完（讀檔、縮圖、轉成 JPEG、再讀回來）
async function upload(page, init = {}) {
    const file = page.file(init);
    page.pick(file);
    await page.flush();
    return file;
}
// 卡片上畫的角色圖：drawImage 的第一個參數是角色圖（不是職業圖示）的那幾次
const pictureDraws = (page) => page.drawCalls().filter((call) => call.op === 'drawImage' && page.pictures.includes(call.args[0]));
const drawnRect = (call) => ({ dx: call.args[1], dy: call.args[2], dw: call.args[3], dh: call.args[4] });
// 照 CardLayout.coverRect 算出來，這張圖在現在這張卡片上該畫在哪裡
const expectedRect = (page, image, crop) => plain(page.window.CardLayout.coverRect(image.width, image.height, page.$('cardCanvas').width, page.$('cardCanvas').height, crop));
// 拖曳的換算用 CardLayout.dragCrop，這裡拿它算預期值（dragCrop 自己有 character-card-layout.test.js 守住）
const expectedDrag = (page, image, start, dx, dy) => plain(page.window.CardLayout.dragCrop(start, dx, dy, image.width, image.height, page.$('cardCanvas').width, page.$('cardCanvas').height));
const cropsOf = (page) => plain(saved(page).crops);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}：${actual} 不等於 ${expected}`);
const nearCrop = (actual, expected, message) => {
    for (const field of ['x', 'y', 'zoom']) near(actual[field], expected[field], `${message} 的 ${field}`);
};
const IMAGE_CONTROLS = ['imageZoom', 'imageCenter', 'imageFill', 'imageRemove', 'imageAdjust'];
const FILL = { x: 0, y: 0, zoom: 1 };
// 4000×1500 的檔案縮成 2048×768：橫版的卡片（1200×675）左右有多出來的部分，可以左右拖
const WIDE = { width: 4000, height: 1500 };
const WIDE_IMAGE = { width: 2048, height: 768 };

test('上傳截圖：卡片用 coverRect 畫這張圖、記在 IMAGE_KEY、狀態寫已上傳', async () => {
    const page = await createCardPage();
    const status = page.$('cardImageStatus');

    // 一打開：還沒有圖片。上傳是 <label> 包著的檔案輸入（只收圖片）；縮放、置中、填滿、移除、調整都不能按；狀態是空的
    assert.equal(page.$('cardImageInput').getAttribute('type'), 'file');
    assert.equal(page.$('cardImageInput').getAttribute('accept'), 'image/*');
    assert.equal(page.$('cardImageInput').closest('label').textContent, '上傳截圖');
    for (const id of IMAGE_CONTROLS) assert.equal(page.$(id).disabled, true, `#${id} 還沒有圖片時不能按`);
    assert.equal(page.$('imageZoom').value, '100');
    assert.equal(page.$('imageZoomValue').textContent, '100%');
    assert.equal(status.getAttribute('aria-live'), 'polite');
    assert.equal(status.textContent, '');
    assert.ok(!page.drawCalls().some((call) => call.op === 'drawImage'));
    assert.ok(page.drawCalls().some((call) => call.op === 'createRadialGradient'), '預設背景的光點');
    assert.equal(page.$('cardCanvas').classList.contains('has-image'), false);

    // 選檔案：先寫處理中；選好就把檔案輸入清掉（同一個檔案再選一次才會有 change）
    page.pick(page.file({ name: 'luna.png', ...WIDE }));
    assert.equal(status.textContent, '處理中…');
    assert.equal(page.$('cardImageInput').files.length, 0);
    assert.equal(page.$('cardImageInput').value, '');
    await page.flush();

    // 縮成長邊 2048、轉成 JPEG（品質 0.85）：記住的是這一張，卡片畫的也是這一張（從 data URL 再讀出來的），不是原檔
    assert.deepEqual(page.dataUrlRequests, [{ type: 'image/jpeg', quality: 0.85, width: 2048, height: 768 }]);
    const url = dataUrlOf(2048, 768);
    assert.equal(page.stored.get(IMAGE_KEY), url);
    const draws = pictureDraws(page);
    assert.equal(draws.length, 1, '圖片只畫一次');
    assert.equal(draws[0].args[0].src, url, '畫的是記住的那一張');
    assert.deepEqual(drawnRect(draws[0]), expectedRect(page, WIDE_IMAGE, FILL), '用 coverRect 填滿、置中');
    assert.ok(!page.drawCalls().some((call) => call.op === 'createRadialGradient'), '有圖片就不畫預設背景');
    assert.equal(status.textContent, '已上傳');
    assert.equal(page.$('cardCanvas').classList.contains('has-image'), true);
    // 暫時的 blob: 網址讀完就撤掉（不撤會一直占著記憶體）
    assert.equal(page.objectUrls.created.length, 1);
    assert.deepEqual(page.objectUrls.revoked, page.objectUrls.created);
    // 控制項都能按了；「調整圖片」只有觸控為主的裝置才出現
    for (const id of IMAGE_CONTROLS) assert.equal(page.$(id).disabled, false, `#${id} 有圖片之後能按`);
    assert.equal(page.isShown('imageAdjust'), false);
    // 位置還沒動過：記住的欄位裡沒有位置（預設填滿置中）
    assert.deepEqual(cropsOf(page), {});
    assert.deepEqual(page.consoleErrors, []);
    assert.deepEqual(page.toasts, []);

    // 圖片與欄位各存各的：改名字不動圖片；換版型畫的還是同一張圖
    page.type('cardName', 'Luna');
    assert.equal(page.stored.get(IMAGE_KEY), url);
    page.press('formatPortrait');
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, WIDE_IMAGE, FILL));
    assert.equal(page.$('cardCanvas').width, 1080);

    // 再上傳一張：換掉圖片、記的也換掉；新的圖從填滿置中開始（舊的位置是照上一張調的）
    page.slide(200);
    page.drag([[100, 100], [160, 100]]);
    assert.ok(Object.keys(cropsOf(page)).length > 0);
    await upload(page, { width: 1000, height: 3000 });
    assert.equal(page.stored.get(IMAGE_KEY), dataUrlOf(683, 2048));
    assert.deepEqual(cropsOf(page), {}, '新的圖片從填滿置中開始');
    assert.equal(page.$('imageZoom').value, '100');
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, { width: 683, height: 2048 }, FILL));
    assert.equal(pictureDraws(page).length, 1);
    assert.deepEqual(page.consoleErrors, []);
});

test('容量已滿：狀態寫這次不會記住，文字欄位照樣記住', async () => {
    const page = await createCardPage({ storageFull: [IMAGE_KEY] });
    const status = page.$('cardImageStatus');
    page.type('cardName', 'Luna Starweaver');
    await upload(page, WIDE);
    assert.equal(status.textContent, '這張圖太大，這次不會記住，重新整理後要再上傳。');
    assert.ok(page.storageWrites.includes(IMAGE_KEY), '有試著存');
    assert.ok(!page.stored.has(IMAGE_KEY));
    assert.equal(pictureDraws(page).length, 1, '圖片這次照常畫');
    for (const id of IMAGE_CONTROLS.filter((id) => id !== 'imageAdjust')) assert.equal(page.$(id).disabled, false, `#${id} 這次照常能用`);

    // 文字欄位照樣記住（欄位與圖片是兩個鍵）；圖片的位置跟著欄位存
    assert.equal(saved(page).name, 'Luna Starweaver');
    page.type('cardTitle', 'Hero of Light');
    assert.equal(saved(page).title, 'Hero of Light');
    page.slide(200);
    assert.equal(cropsOf(page)['b-landscape'].zoom, 2);

    // 重新整理之後沒有圖片（要再上傳），文字與位置都在，不留 console
    const again = await page.reopen({ storageFull: [] });
    assert.equal(again.$('cardName').value, 'Luna Starweaver');
    assert.equal(again.$('cardTitle').value, 'Hero of Light');
    assert.equal(pictureDraws(again).length, 0);
    assert.equal(again.$('cardImageStatus').textContent, '');
    assert.equal(again.$('imageZoom').disabled, true);
    assert.deepEqual(again.consoleErrors, []);

    // 以前存著一張、這次換的存不進去：舊的也拿掉，重新整理之後不會冒出已經換掉的舊圖
    const old = await createCardPage({ stored: { [IMAGE_KEY]: dataUrlOf(640, 360) }, storageFull: [IMAGE_KEY] });
    assert.equal(pictureDraws(old).length, 1, '舊的圖片照常還原');
    await upload(old, WIDE);
    assert.equal(old.$('cardImageStatus').textContent, '這張圖太大，這次不會記住，重新整理後要再上傳。');
    assert.ok(!old.stored.has(IMAGE_KEY), '舊的也拿掉');
    assert.equal(pictureDraws(old).length, 1);
    assert.equal(pictureDraws(old)[0].args[0].src, dataUrlOf(2048, 768), '這次畫的是新的');

    // 瀏覽器封鎖網站資料：什麼都記不住，這次照常運作；不用特別說「太大」（和容量無關），狀態就是已上傳
    const blocked = await createCardPage({ storageThrows: true });
    await upload(blocked, WIDE);
    assert.equal(blocked.$('cardImageStatus').textContent, '已上傳');
    assert.equal(blocked.stored.size, 0);
    assert.equal(pictureDraws(blocked).length, 1);
    blocked.slide(150);
    assert.deepEqual(drawnRect(pictureDraws(blocked)[0]), expectedRect(blocked, WIDE_IMAGE, { x: 0, y: 0, zoom: 1.5 }));
    assert.deepEqual(blocked.consoleErrors, []);
});

test('重新打開還原圖片與位置', async () => {
    const page = await createCardPage();
    await upload(page, WIDE);
    page.slide(200);
    page.drag([[300, 200], [330, 205]]);
    const crop = cropsOf(page)['b-landscape'];
    assert.equal(crop.zoom, 2);
    assert.ok(crop.x < 0 && crop.y !== 0, '拖過了');

    // 還原：圖片是記住的那一張，位置照記住的，滑桿也是；不用說什麼，也不跳 toast
    const again = await page.reopen();
    const draws = pictureDraws(again);
    assert.equal(draws.length, 1);
    assert.equal(draws[0].args[0].src, page.stored.get(IMAGE_KEY));
    assert.deepEqual(drawnRect(draws[0]), expectedRect(again, WIDE_IMAGE, crop));
    assert.equal(again.$('imageZoom').value, '200');
    assert.equal(again.$('imageZoom').getAttribute('aria-valuetext'), '200%');
    assert.equal(again.$('imageZoomValue').textContent, '200%');
    for (const id of IMAGE_CONTROLS) assert.equal(again.$(id).disabled, false, `#${id} 還原之後能按`);
    assert.equal(again.$('cardImageStatus').textContent, '');
    assert.equal(again.$('cardCanvas').classList.contains('has-image'), true);
    assert.ok(!again.drawCalls().some((call) => call.op === 'createRadialGradient'));
    assert.deepEqual(again.toasts, []);
    assert.deepEqual(again.consoleErrors, []);
    // 還原之後照樣能拖、能存
    again.drag([[300, 200], [320, 200]]);
    assert.notDeepEqual(cropsOf(again)['b-landscape'], crop);

    // 沒有圖片時，滑桿與位置的說明寫預設的 100%（存著的位置要等有圖片才用得上）
    const orphan = await createCardPage({ stored: { [KEY]: JSON.stringify({ crops: { 'b-landscape': { x: 0.5, y: 0, zoom: 2.5 } } }) } });
    assert.equal(orphan.$('imageZoom').value, '100');
    assert.equal(orphan.$('imageZoomValue').textContent, '100%');
    assert.equal(orphan.$('imageZoom').disabled, true);
});

test('滑鼠拖曳改變 crops[\'b-landscape\'] 並記住；直版有自己的一份', async () => {
    const page = await createCardPage();
    await upload(page, WIDE);
    const canvas = page.$('cardCanvas');
    // 卡片在畫面上縮成一半（600×337.5 的 CSS 像素）：滑鼠移 30 個 CSS 像素，是卡片上的 60 個像素
    assert.equal(canvas.getBoundingClientRect().width, 600);

    const writes = page.storageWrites.length;
    const down = page.pointer('down', { x: 300, y: 200 });
    assert.deepEqual(page.captures, [{ call: 'set', pointerId: 1 }], '按下去就抓住指標：滑鼠移到卡片外面也繼續拖');
    assert.equal(canvas.classList.contains('is-dragging'), true);
    assert.equal(down.defaultPrevented, true);
    const start = FILL;

    // 往右拖：圖跟著往右，x 變小。照開始的位置算，不是一段一段累加（第二次移動算的是離按下去的地方 60 像素，不是離上一次）
    page.pointer('move', { x: 330, y: 205 });
    nearCrop(page.app.state.crops['b-landscape'], { x: -0.2, y: 0, zoom: 1 }, '往右拖 30 個 CSS 像素');
    nearCrop(page.app.state.crops['b-landscape'], expectedDrag(page, WIDE_IMAGE, start, 60, 10), '和 dragCrop 一致');
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, WIDE_IMAGE, plain(page.app.state.crops['b-landscape'])), '一邊拖一邊重畫');
    page.pointer('move', { x: 360, y: 200 });
    nearCrop(page.app.state.crops['b-landscape'], { x: -0.4, y: 0, zoom: 1 }, '往右拖 60 個 CSS 像素');
    // 拖過邊界再拖回來：上面都在 x 沒被夾住的範圍裡，從開始的位置算與一段一段累加的結果一樣，分不出來。這裡移到離按下去 400 個 CSS 像素（卡片上 800 個像素，
    // 圖只能再往右 300 個像素，x 夾在 -1），再移回離按下去 100 個 CSS 像素（卡片上 200 個像素）：從開始的位置算是 x = -2/3；
    // 累加的話第二次是從夾住的 -1 往回 300 個 CSS 像素，變成 +1
    page.pointer('move', { x: 700, y: 200 });
    nearCrop(page.app.state.crops['b-landscape'], { x: -1, y: 0, zoom: 1 }, '拖過邊界：夾在 -1');
    page.pointer('move', { x: 400, y: 200 });
    nearCrop(page.app.state.crops['b-landscape'], { x: -2 / 3, y: 0, zoom: 1 }, '拖回來：離按下去 100 個 CSS 像素');
    nearCrop(page.app.state.crops['b-landscape'], expectedDrag(page, WIDE_IMAGE, start, 200, 0), '和從開始的位置算的 dragCrop 一致');
    // 拖回起點：回到原本的位置
    page.pointer('move', { x: 300, y: 200 });
    nearCrop(page.app.state.crops['b-landscape'], FILL, '拖回起點');
    page.pointer('move', { x: 360, y: 200 });
    assert.equal(page.storageWrites.length, writes, '拖的過程不存');
    assert.deepEqual(plain(page.app.state.crops['b-landscape']).zoom, 1);

    // 放開才存，只存一次（放開之後瀏覽器還會送 lostpointercapture，不再存第二次）
    page.pointer('up', { x: 360, y: 200 });
    assert.equal(canvas.classList.contains('is-dragging'), false);
    assert.equal(page.storageWrites.length, writes + 1);
    assert.deepEqual(page.captures.map((capture) => capture.call).filter((call) => call !== 'release'), ['set', 'lost']);
    const landscape = cropsOf(page)['b-landscape'];
    nearCrop(landscape, { x: -0.4, y: 0, zoom: 1 }, '記住的位置');
    assert.deepEqual(Object.keys(cropsOf(page)), ['b-landscape'], '直版還沒動過');

    // 放開之後再動不算：不拖了
    page.pointer('move', { x: 500, y: 300 });
    nearCrop(plain(page.app.state.crops['b-landscape']), landscape, '放開之後的移動不算');

    // 直版有自己的一份：預設填滿置中，拖它不動橫版的
    page.press('formatPortrait');
    assert.equal(canvas.width, 1080);
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, WIDE_IMAGE, FILL), '直版沒動過，填滿置中');
    page.drag([[200, 300], [230, 300]]);
    const portrait = cropsOf(page)['b-portrait'];
    nearCrop(portrait, expectedDrag(page, WIDE_IMAGE, FILL, 60, 0), '直版的位置');
    assert.ok(portrait.x < 0);
    assert.deepEqual(cropsOf(page)['b-landscape'], landscape, '橫版的位置不變');
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, WIDE_IMAGE, portrait));

    // 切回橫版：畫的是橫版自己記的位置；重新打開兩份都在
    page.press('formatLandscape');
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, WIDE_IMAGE, landscape));
    const again = await page.reopen();
    assert.deepEqual(plain(again.app.state.crops), { 'b-landscape': landscape, 'b-portrait': portrait });
    assert.deepEqual(page.consoleErrors, []);
});

test('拖曳的細節：只有滑鼠左鍵、沒有圖片不拖、別的 pointer 不理、取消也存一次、指標抓不到照樣拖、卡片藏起來不亂動', async () => {
    const page = await createCardPage();
    const canvas = page.$('cardCanvas');

    // 還沒有圖片：滑鼠按下去什麼都不做，不抓、不攔截
    const bare = page.pointer('down', { x: 300, y: 200 });
    assert.equal(bare.defaultPrevented, false);
    assert.deepEqual(page.captures, []);
    assert.equal(canvas.classList.contains('is-dragging'), false);
    page.pointer('up', {});

    await upload(page, { width: 1500, height: 4000 }); // 直的圖：橫版的卡片上下有多出來的部分，可以上下拖
    const image = { width: 768, height: 2048 };

    // 滑鼠右鍵、中鍵不拖
    for (const button of [1, 2]) {
        const event = page.pointer('down', { x: 300, y: 200, button });
        assert.equal(event.defaultPrevented, false, `按鍵 ${button}`);
    }
    assert.deepEqual(page.captures, []);

    // 上下拖：往下拖，y 變小
    page.pointer('down', { x: 300, y: 200, id: 3 });
    assert.deepEqual(page.captures, [{ call: 'set', pointerId: 3 }]);
    page.pointer('move', { x: 300, y: 210, id: 3 });
    nearCrop(page.app.state.crops['b-landscape'], expectedDrag(page, image, FILL, 0, 20), '往下拖 10 個 CSS 像素');
    assert.ok(page.app.state.crops['b-landscape'].y < 0);
    const after = plain(page.app.state.crops['b-landscape']);
    // 拖的時候別的 pointer（另一根手指、另一支筆）按下與移動都不理
    page.pointer('down', { x: 10, y: 10, id: 4, pointerType: 'touch' });
    page.pointer('down', { x: 10, y: 10, id: 5 });
    page.pointer('move', { x: 500, y: 300, id: 4, pointerType: 'touch' });
    page.pointer('move', { x: 500, y: 300, id: 5 });
    page.pointer('up', { id: 4, pointerType: 'touch' });
    assert.deepEqual(page.captures, [{ call: 'set', pointerId: 3 }], '只抓一個 pointer');
    nearCrop(plain(page.app.state.crops['b-landscape']), after, '別的 pointer 不影響');
    assert.equal(canvas.classList.contains('is-dragging'), true, '別的 pointer 放開也不結束這一次拖曳');

    // 被取消（例如系統手勢搶走）：結束，存一次
    const writes = page.storageWrites.length;
    page.pointer('cancel', { id: 3 });
    assert.equal(canvas.classList.contains('is-dragging'), false);
    assert.equal(page.storageWrites.length, writes + 1);
    page.pointer('move', { x: 300, y: 400, id: 3 });
    nearCrop(plain(page.app.state.crops['b-landscape']), after, '取消之後的移動不算');

    // 指標抓不到（瀏覽器對不在作用的 pointer 會丟例外）：照樣能拖，不丟錯
    const noCapture = await createCardPage({ pointerCapture: 'throws' });
    await upload(noCapture, { width: 1500, height: 4000 });
    noCapture.drag([[300, 200], [300, 230]]);
    assert.ok(noCapture.app.state.crops['b-landscape'].y < 0);
    assert.ok(noCapture.stored.get(KEY).includes('"b-landscape"'));
    assert.deepEqual(noCapture.consoleErrors, []);

    // 卡片的大小量出來是 0（藏起來）：不拖，不丟錯、不出現 NaN
    const hidden = await createCardPage();
    await upload(hidden, { width: 1500, height: 4000 });
    hidden.setDisplayScale(0);
    hidden.drag([[300, 200], [300, 230]]);
    assert.deepEqual(plain(hidden.app.state.crops), {});
    assert.deepEqual(hidden.consoleErrors, []);

    // 同一個 pointer 又按下去（上一次的放開沒收到）：重新開始，不會卡在拖到一半
    const stuck = await createCardPage();
    await upload(stuck, { width: 1500, height: 4000 });
    stuck.pointer('down', { x: 300, y: 200 });
    stuck.pointer('down', { x: 300, y: 300 });
    stuck.pointer('move', { x: 300, y: 310 });
    nearCrop(stuck.app.state.crops['b-landscape'], expectedDrag(stuck, { width: 768, height: 2048 }, FILL, 0, 20), '從第二次按下去的地方算');
});

test('抓取被拿走（只有 lostpointercapture，沒有 pointerup）：拖曳也結束，存一次，之後的移動與放開都不算', async () => {
    const page = await createCardPage();
    await upload(page, WIDE);
    const canvas = page.$('cardCanvas');
    const writes = page.storageWrites.length;
    page.pointer('down', { x: 300, y: 200 });
    page.pointer('move', { x: 330, y: 200 });
    nearCrop(page.app.state.crops['b-landscape'], { x: -0.2, y: 0, zoom: 1 }, '拖到一半');
    assert.equal(canvas.classList.contains('is-dragging'), true);
    assert.equal(page.storageWrites.length, writes, '拖的過程不存');

    // 抓取被拿走（元素被移出頁面、有人放掉抓取…）：瀏覽器只送 lostpointercapture，不一定有 pointerup 或 pointercancel
    page.lose();
    assert.equal(canvas.classList.contains('is-dragging'), false, '抓取沒了，這一次拖曳就結束');
    assert.equal(page.storageWrites.length, writes + 1, '存一次');
    nearCrop(cropsOf(page)['b-landscape'], { x: -0.2, y: 0, zoom: 1 }, '存的是畫面上的位置');
    // 之後的移動不算，放開也不再存
    page.pointer('move', { x: 500, y: 200 });
    nearCrop(plain(page.app.state.crops['b-landscape']), { x: -0.2, y: 0, zoom: 1 }, '抓取沒了之後的移動不算');
    page.pointer('up', { x: 500, y: 200 });
    assert.equal(page.storageWrites.length, writes + 1, '之後的 pointerup 也不再存');
    assert.deepEqual(page.consoleErrors, []);

    // 沒有卡在拖到一半：下一次按下去照常從現在的位置開始拖
    page.drag([[300, 200], [360, 200]]);
    nearCrop(page.app.state.crops['b-landscape'], expectedDrag(page, WIDE_IMAGE, { x: -0.2, y: 0, zoom: 1 }, 120, 0), '下一次拖曳');
    assert.equal(page.storageWrites.length, writes + 2);
});

test('滑鼠的按鍵已經放開、pointerup 卻沒收到（例如 macOS 拖到一半按著 Ctrl 跳出右鍵選單）：下一次移動就結束拖曳，存一次，之後滑鼠移過卡片不再動圖片', async () => {
    const page = await createCardPage();
    await upload(page, WIDE);
    const canvas = page.$('cardCanvas');
    const writes = page.storageWrites.length;
    page.pointer('down', { x: 300, y: 200 });
    page.pointer('move', { x: 330, y: 200 });
    const half = { x: -0.2, y: 0, zoom: 1 };
    nearCrop(page.app.state.crops['b-landscape'], half, '拖到一半（按著，buttons 是 1）');
    assert.equal(page.pointer('move', { x: 340, y: 200 }).buttons, 1, '按著的時候 buttons 是 1');
    assert.equal(canvas.classList.contains('is-dragging'), true);
    assert.equal(page.storageWrites.length, writes, '拖的過程不存');
    const dragged = plain(page.app.state.crops['b-landscape']);

    // 按鍵已經放開（buttons 是 0）：這一次移動不算，拖曳結束，存一次（存的是畫面上的位置）
    page.pointer('move', { x: 450, y: 220, buttons: 0 });
    assert.equal(canvas.classList.contains('is-dragging'), false, '沒按著了，拖曳結束');
    nearCrop(plain(page.app.state.crops['b-landscape']), dragged, '沒按著的那一次移動不算');
    assert.equal(page.storageWrites.length, writes + 1, '存一次');
    nearCrop(cropsOf(page)['b-landscape'], dragged, '存的是拖到一半的位置');
    // 也放掉抓取：不然滑鼠移到哪裡，事件都一直送到卡片上，頁面其他地方的 hover 也壞掉
    assert.deepEqual(page.captures, [{ call: 'set', pointerId: 1 }, { call: 'release', pointerId: 1 }, { call: 'lost', pointerId: 1 }]);

    // 之後滑鼠只是移過卡片：圖片不再跟著動，也不再存；晚到的（或根本不會來的）pointerup 一樣不再存
    page.pointer('move', { x: 500, y: 250, buttons: 0 });
    page.pointer('move', { x: 100, y: 100, buttons: 0 });
    nearCrop(plain(page.app.state.crops['b-landscape']), dragged, '之後滑鼠移過卡片');
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, WIDE_IMAGE, dragged), '畫面上的位置也沒動');
    page.pointer('up', { x: 100, y: 100 });
    assert.equal(page.storageWrites.length, writes + 1);
    assert.deepEqual(page.consoleErrors, []);

    // 下一次按下去照常拖
    page.drag([[300, 200], [360, 200]]);
    nearCrop(page.app.state.crops['b-landscape'], expectedDrag(page, WIDE_IMAGE, dragged, 120, 0), '下一次拖曳');
    assert.equal(page.storageWrites.length, writes + 2);

    // 只看滑鼠：調整模式裡手指（與筆）的移動照舊，就算 buttons 是 0 也照樣拖
    for (const pointerType of ['touch', 'pen']) {
        const coarse = await createCardPage({ coarse: true });
        await upload(coarse, WIDE);
        coarse.press('imageAdjust');
        coarse.pointer('down', { pointerType, x: 300, y: 200, id: 7 });
        coarse.pointer('move', { pointerType, x: 330, y: 200, id: 7, buttons: 0 });
        nearCrop(coarse.app.state.crops['b-landscape'], half, `${pointerType}：buttons 是 0 也照樣拖`);
        assert.equal(coarse.$('cardCanvas').classList.contains('is-dragging'), true, `${pointerType} 還在拖`);
        coarse.pointer('up', { pointerType, x: 330, y: 200, id: 7 });
        assert.equal(coarse.$('cardCanvas').classList.contains('is-dragging'), false);
    }
});

test('縮放滑桿、置中、填滿', async () => {
    const page = await createCardPage();
    page.type('cardName', 'Luna');
    await upload(page, WIDE);
    const slider = page.$('imageZoom');

    // 滑桿 100%～300%、間隔 5%；說明寫在標籤旁，螢幕閱讀器念的 aria-valuetext 是同一個百分比
    assert.deepEqual(['min', 'max', 'step'].map((name) => slider.getAttribute(name)), ['100', '300', '5']);
    assert.equal(slider.getAttribute('type'), 'range');
    assert.equal(slider.value, '100');
    assert.equal(slider.getAttribute('aria-valuetext'), '100%');
    assert.equal(page.$('imageZoomValue').textContent, '100%');
    assert.equal(labelOf(page, 'imageZoom'), '縮放');

    // 拖滑桿（input）：馬上重畫、不存；放開（change）才存
    const writes = page.storageWrites.length;
    const draws = page.drawCount();
    page.slide(150, { release: false });
    assert.equal(page.drawCount(), draws + 1);
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, WIDE_IMAGE, { x: 0, y: 0, zoom: 1.5 }));
    assert.equal(slider.getAttribute('aria-valuetext'), '150%');
    assert.equal(page.$('imageZoomValue').textContent, '150%');
    assert.equal(page.storageWrites.length, writes, '拖滑桿的過程不存');
    page.slide(150);
    assert.equal(page.storageWrites.length, writes + 1, '放開存一次');
    assert.deepEqual(cropsOf(page)['b-landscape'], { x: 0, y: 0, zoom: 1.5 });

    // 拖一下，再按「置中」：x、y 歸 0，縮放不變
    page.drag([[300, 200], [340, 230]]);
    const moved = cropsOf(page)['b-landscape'];
    assert.ok(moved.x !== 0 && moved.y !== 0, '兩個方向都拖得動（放大之後上下左右都有多出來的部分）');
    assert.equal(moved.zoom, 1.5);
    page.press('imageCenter');
    assert.deepEqual(cropsOf(page)['b-landscape'], { x: 0, y: 0, zoom: 1.5 });
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, WIDE_IMAGE, { x: 0, y: 0, zoom: 1.5 }));
    assert.equal(slider.value, '150');

    // 再拖一下，按「填滿」：縮放 100%、置中
    page.drag([[300, 200], [340, 230]]);
    page.press('imageFill');
    assert.deepEqual(cropsOf(page)['b-landscape'], FILL);
    assert.equal(slider.value, '100');
    assert.equal(slider.getAttribute('aria-valuetext'), '100%');
    assert.equal(page.$('imageZoomValue').textContent, '100%');
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, WIDE_IMAGE, FILL));

    // 兩端與超出範圍的值：300% 就是 3 倍；比 300 大的收回 300，滑桿跟著收回來
    page.slide(300);
    assert.equal(cropsOf(page)['b-landscape'].zoom, 3);
    page.slide(999);
    assert.equal(cropsOf(page)['b-landscape'].zoom, 3);
    assert.equal(slider.value, '300');
    page.slide(100);
    assert.equal(cropsOf(page)['b-landscape'].zoom, 1);

    // 滑桿跟著現在的版型：橫版 200%，直版沒動過是 100%；各動各的
    page.slide(200);
    page.press('formatPortrait');
    assert.equal(slider.value, '100');
    assert.equal(page.$('imageZoomValue').textContent, '100%');
    page.slide(150);
    assert.deepEqual(plain(Object.fromEntries(Object.entries(cropsOf(page)).map(([key, crop]) => [key, crop.zoom]))), { 'b-landscape': 2, 'b-portrait': 1.5 });
    page.press('formatLandscape');
    assert.equal(slider.value, '200');
    assert.equal(slider.getAttribute('aria-valuetext'), '200%');
    page.press('formatPortrait');
    assert.equal(slider.value, '150');

    // 重新打開：兩份縮放都在
    const again = await page.reopen();
    assert.equal(again.$('imageZoom').value, '150', '直版');
    assert.deepEqual(page.consoleErrors, []);
});

test('觸控不攔截：coarse 而且不在調整模式時，pointerdown 不 setPointerCapture、不 preventDefault；按「調整圖片」後才拖得動', async () => {
    const page = await createCardPage({ coarse: true });
    const canvas = page.$('cardCanvas');
    const adjust = page.$('imageAdjust');
    const touch = (type, init) => page.pointer(type, { pointerType: 'touch', x: 300, y: 200, id: 7, ...init });

    // 觸控為主的裝置才有「調整圖片」；還沒有圖片時不能按，手指在卡片上滑頁面照常捲
    assert.equal(page.isShown('imageAdjust'), true);
    assert.equal(adjust.disabled, true);
    assert.equal(adjust.textContent, '調整圖片');
    assert.equal(touch('down').defaultPrevented, false);
    assert.deepEqual(page.captures, []);

    await upload(page, WIDE);
    page.type('cardName', 'Luna');
    assert.equal(adjust.disabled, false);
    assert.equal(canvas.classList.contains('is-adjusting'), false);

    // 不在調整模式：手指在卡片上按下去、移動、放開，什麼都不做（不抓、不攔截），位置不動，頁面照常捲
    const down = touch('down');
    assert.equal(down.defaultPrevented, false);
    assert.deepEqual(page.captures, []);
    assert.equal(canvas.classList.contains('is-dragging'), false);
    touch('move', { x: 360, y: 230 });
    assert.equal(touch('up', { x: 360, y: 230 }).defaultPrevented, false);
    assert.deepEqual(plain(page.app.state.crops), {});
    // 筆也一樣（只有滑鼠左鍵可以直接拖）
    assert.equal(page.pointer('down', { pointerType: 'pen', x: 300, y: 200, id: 9 }).defaultPrevented, false);
    assert.deepEqual(page.captures, []);

    // 按「調整圖片」：按鈕變「完成」（不用 aria-pressed，字就說了狀態），卡片加 .is-adjusting（touch-action: none 要在手指按下去之前就設好）
    page.press('imageAdjust');
    assert.equal(adjust.textContent, '完成');
    assert.equal(adjust.getAttribute('aria-pressed'), null);
    assert.equal(canvas.classList.contains('is-adjusting'), true);
    touch('down', { id: 8 });
    assert.deepEqual(page.captures, [{ call: 'set', pointerId: 8 }]);
    assert.equal(canvas.classList.contains('is-dragging'), true);
    const writes = page.storageWrites.length;
    touch('move', { id: 8, x: 330, y: 205 });
    nearCrop(page.app.state.crops['b-landscape'], expectedDrag(page, WIDE_IMAGE, FILL, 60, 10), '手指拖 30 個 CSS 像素');
    assert.ok(page.app.state.crops['b-landscape'].x < 0);
    assert.equal(page.storageWrites.length, writes, '拖的過程不存');
    touch('up', { id: 8, x: 330, y: 205 });
    assert.equal(page.storageWrites.length, writes + 1);
    assert.equal(canvas.classList.contains('is-dragging'), false);
    assert.ok(cropsOf(page)['b-landscape'].x < 0, '放開存起來');
    // 調整模式裡筆也拖得動
    page.pointer('down', { pointerType: 'pen', x: 300, y: 200, id: 10 });
    assert.deepEqual(page.captures.filter((capture) => capture.call === 'set').map((capture) => capture.pointerId), [8, 10]);
    page.pointer('up', { pointerType: 'pen', id: 10 });

    // 按「完成」：卡片不再攔截，手指又照常捲
    page.press('imageAdjust');
    assert.equal(adjust.textContent, '調整圖片');
    assert.equal(canvas.classList.contains('is-adjusting'), false);
    const before = page.captures.length;
    assert.equal(touch('down', { id: 11 }).defaultPrevented, false);
    assert.equal(page.captures.length, before);

    // 觸控為主的裝置接了滑鼠：滑鼠不用調整模式，直接拖
    page.pointer('down', { x: 300, y: 200, id: 1 });
    assert.equal(page.captures.at(-1).pointerId, 1);
    page.pointer('up', { id: 1 });

    // 滑鼠為主的裝置：沒有「調整圖片」，手指在卡片上什麼都不做
    const desktop = await createCardPage();
    await upload(desktop, WIDE);
    assert.equal(desktop.isShown('imageAdjust'), false);
    assert.equal(desktop.pointer('down', { pointerType: 'touch', id: 3 }).defaultPrevented, false);
    assert.deepEqual(desktop.captures, []);
    // 裝置變成觸控為主（例如平板拿掉鍵盤）：「調整圖片」出現；變回來就藏起來
    desktop.setCoarse(true);
    assert.equal(desktop.isShown('imageAdjust'), true);
    desktop.setCoarse(false);
    assert.equal(desktop.isShown('imageAdjust'), false);
    assert.deepEqual(page.consoleErrors, []);
});

test('調整模式：按「完成」、切離圖片分頁、移除圖片、清除全部、不再是觸控為主時都會結束，結束之後觸控照常捲', async () => {
    let id = 100;
    // 手機版面、觸控為主、已上傳、進入調整模式
    async function adjusting(options = {}) {
        const page = await createCardPage({ narrow: true, coarse: true, ...options });
        page.press('tab-image');
        await upload(page, WIDE);
        page.press('imageAdjust');
        assert.equal(page.$('cardCanvas').classList.contains('is-adjusting'), true);
        assert.equal(page.$('imageAdjust').textContent, '完成');
        return page;
    }
    const assertFree = (page, why) => {
        assert.equal(page.$('cardCanvas').classList.contains('is-adjusting'), false, `${why}：.is-adjusting 拿掉`);
        assert.equal(page.$('imageAdjust').textContent, '調整圖片', `${why}：按鈕變回「調整圖片」`);
        const before = page.captures.length;
        id += 1;
        assert.equal(page.pointer('down', { pointerType: 'touch', x: 300, y: 200, id }).defaultPrevented, false, `${why}：觸控不攔截`);
        assert.equal(page.captures.length, before, `${why}：觸控不抓`);
    };

    // 完成
    const done = await adjusting();
    done.press('imageAdjust');
    assertFree(done, '按完成');

    // 切到別的分頁（手機分頁離開圖片）：點分頁、鍵盤方向鍵都一樣；回到圖片分頁不會自己又進入調整模式
    const tabs = await adjusting();
    tabs.press('tab-style');
    assertFree(tabs, '切到樣式分頁');
    tabs.press('tab-image');
    assert.equal(tabs.$('cardCanvas').classList.contains('is-adjusting'), false, '回到圖片分頁不會自己進入調整模式');
    const keys = await adjusting();
    keys.$('tab-image').focus();
    keys.key('ArrowLeft');
    assertFree(keys, '用方向鍵切到別的分頁');
    // 還在圖片分頁時（再點一下圖片分頁）不結束
    const stay = await adjusting();
    stay.press('tab-image');
    assert.equal(stay.$('cardCanvas').classList.contains('is-adjusting'), true);
    assert.equal(stay.$('imageAdjust').textContent, '完成');

    // 移除圖片、清除全部
    const removed = await adjusting();
    removed.press('imageRemove');
    assertFree(removed, '移除圖片');
    const cleared = await adjusting();
    cleared.press('clearAll');
    cleared.press('clearAll');
    assertFree(cleared, '清除全部');

    // 不再是觸控為主：按鈕藏起來，調整模式也結束（不然卡片一直攔截手指，又沒有「完成」可以按）
    const mouse = await adjusting();
    mouse.setCoarse(false);
    assert.equal(mouse.isShown('imageAdjust'), false);
    assertFree(mouse, '不再是觸控為主');

    // 調整到一半（手指還按著）結束：拖曳也結束，不再跟著動
    const mid = await adjusting();
    mid.pointer('down', { pointerType: 'touch', x: 300, y: 200, id: 50 });
    mid.pointer('move', { pointerType: 'touch', x: 330, y: 200, id: 50 });
    const moved = plain(mid.app.state.crops['b-landscape']);
    mid.press('tab-style');
    assert.equal(mid.$('cardCanvas').classList.contains('is-dragging'), false);
    mid.pointer('move', { pointerType: 'touch', x: 400, y: 200, id: 50 });
    assert.deepEqual(plain(mid.app.state.crops['b-landscape']), moved);
    assert.deepEqual(cropsOf(mid)['b-landscape'], moved, '結束時存起來');
    assert.deepEqual(mid.consoleErrors, []);
});

test('移除圖片：回到預設背景、刪掉 IMAGE_KEY，之後觸控照常捲', async () => {
    const page = await createCardPage({ coarse: true });
    const canvas = page.$('cardCanvas');
    page.type('cardName', 'Luna');
    await upload(page, WIDE);
    page.press('imageAdjust');
    assert.equal(canvas.classList.contains('is-adjusting'), true);
    assert.ok(page.stored.has(IMAGE_KEY));

    // 按「移除圖片」：焦點在那顆按鈕上，按下去它就不能按了，所以焦點移到上傳（鍵盤才接得下去）
    page.$('imageRemove').focus();
    isSame(page.document.activeElement, page.$('imageRemove'));
    page.press('imageRemove');
    assert.equal(pictureDraws(page).length, 0, '回到預設背景');
    assert.ok(page.drawCalls().some((call) => call.op === 'createRadialGradient'), '預設背景的光點');
    assert.ok(!page.stored.has(IMAGE_KEY));
    assert.equal(page.$('cardImageStatus').textContent, '已移除圖片');
    for (const id of IMAGE_CONTROLS) assert.equal(page.$(id).disabled, true, `#${id} 沒有圖片了不能按`);
    assert.equal(page.$('imageZoom').value, '100');
    assert.equal(canvas.classList.contains('has-image'), false);
    isSame(page.document.activeElement, page.$('cardImageInput'), '焦點移到上傳');
    assert.equal(saved(page).name, 'Luna', '欄位不動');

    // 修掉舊版 CC-12：移除之後手指在卡片上滑頁面照常捲（不攔截、不抓、沒有調整模式）
    assert.equal(canvas.classList.contains('is-adjusting'), false);
    assert.equal(page.$('imageAdjust').textContent, '調整圖片');
    const down = page.pointer('down', { pointerType: 'touch', x: 300, y: 200, id: 21 });
    assert.equal(down.defaultPrevented, false);
    assert.deepEqual(page.captures.filter((capture) => capture.pointerId === 21), []);
    // 滑鼠也一樣沒有圖片可拖
    assert.equal(page.pointer('down', { x: 300, y: 200 }).defaultPrevented, false);
    assert.equal(page.captures.filter((capture) => capture.call === 'set').length, 0);

    // 重新整理：沒有圖片；可以再上傳同一個檔案
    const again = await page.reopen();
    assert.equal(pictureDraws(again).length, 0);
    assert.equal(again.$('imageRemove').disabled, true);
    const file = await upload(page, WIDE);
    assert.equal(pictureDraws(page).length, 1);
    const created = page.objectUrls.created.length;
    page.pick(file);
    await page.flush();
    assert.equal(page.objectUrls.created.length, created + 1, '同一個檔案再選一次也會處理');
    assert.deepEqual(page.consoleErrors, []);
});

test('連續上傳：只有最新的一次算數，先選的那張比較晚讀完也一樣', async () => {
    const page = await createCardPage();
    const status = page.$('cardImageStatus');
    const slow = page.file({ name: 'slow.png', ...WIDE, hold: true });
    const fast = page.file({ name: 'fast.png', width: 1000, height: 3000 });
    page.pick(slow);
    page.pick(fast);
    assert.equal(status.textContent, '處理中…');
    await page.flush();

    // 後選的讀完了：畫的、記的都是它（1000×3000 縮成 683×2048）
    const fastUrl = dataUrlOf(683, 2048);
    assert.equal(page.stored.get(IMAGE_KEY), fastUrl);
    assert.equal(status.textContent, '已上傳');
    assert.equal(pictureDraws(page).length, 1);
    assert.equal(pictureDraws(page)[0].args[0].src, fastUrl);

    // 先選的那張現在才讀完：不蓋過最新的，也不再存、不再改狀態
    const writes = page.storageWrites.length;
    page.finishFile(slow, true);
    await page.flush();
    assert.equal(page.stored.get(IMAGE_KEY), fastUrl);
    assert.equal(page.storageWrites.length, writes);
    assert.equal(pictureDraws(page).length, 1);
    assert.equal(pictureDraws(page)[0].args[0].src, fastUrl);
    assert.equal(status.textContent, '已上傳');
    // 先選的讀不出來也一樣：不會顯示失敗
    const slow2 = page.file({ name: 'slow2.png', hold: true });
    const fast2 = page.file({ name: 'fast2.png', width: 640, height: 360 });
    page.pick(slow2);
    page.pick(fast2);
    await page.flush();
    page.finishFile(slow2, false);
    await page.flush();
    assert.equal(status.textContent, '已上傳');
    assert.equal(page.stored.get(IMAGE_KEY), dataUrlOf(640, 360));
    assert.deepEqual(page.consoleErrors, []);
    // 暫時的網址一個不漏地撤掉
    assert.deepEqual([...page.objectUrls.revoked].sort(), [...page.objectUrls.created].sort());
});

test('連續上傳：轉出來再讀回來的那一步也看流水號，先選的比較晚讀回來（成功或失敗）都不蓋掉後選的', async () => {
    // 上面那個測試只讓第一步（讀檔）晚到。這裡讓檔案都讀完、轉成 JPEG 了，卡在「轉出來再讀回來」那一步（pictureLoads: 'hold'：data: 的圖一直等著），
    // 兩次都在等的時候後選的先讀回來，先選的才讀回來（讀得出來或讀不出來）
    for (const lateOk of [true, false]) {
        const page = await createCardPage({ pictureLoads: 'hold' });
        const status = page.$('cardImageStatus');
        page.pick(page.file({ name: 'a.png', ...WIDE }));
        await page.flush();
        page.pick(page.file({ name: 'b.png', width: 1000, height: 3000 }));
        await page.flush();
        const reread = page.pictures.filter((picture) => picture.src.startsWith('data:'));
        assert.deepEqual(reread.map((picture) => picture.src), [dataUrlOf(2048, 768), dataUrlOf(683, 2048)], '兩張都轉成 JPEG 了，正在讀回來');
        assert.equal(status.textContent, '處理中…');
        assert.equal(pictureDraws(page).length, 0);
        assert.ok(!page.stored.has(IMAGE_KEY));

        // 後選的先讀回來：畫的、記的都是它
        const newer = dataUrlOf(683, 2048);
        reread[1].finish(true);
        await page.flush();
        assert.equal(page.stored.get(IMAGE_KEY), newer);
        assert.equal(pictureDraws(page)[0].args[0].src, newer);
        assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, { width: 683, height: 2048 }, FILL));
        assert.equal(status.textContent, '已上傳');
        const writes = page.storageWrites.length;

        // 先選的現在才讀回來：不蓋掉，不再存，不改狀態（讀不出來也不寫失敗）
        reread[0].finish(lateOk);
        await page.flush();
        const why = lateOk ? '先選的讀回來了' : '先選的讀不出來';
        assert.equal(page.stored.get(IMAGE_KEY), newer, `${why}：記憶還是後選的`);
        assert.equal(page.storageWrites.length, writes, `${why}：不再存`);
        assert.equal(pictureDraws(page).length, 1, why);
        assert.equal(pictureDraws(page)[0].args[0].src, newer, `${why}：畫的還是後選的`);
        assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, { width: 683, height: 2048 }, FILL), why);
        assert.equal(status.textContent, '已上傳', `${why}：狀態不變`);
        assert.deepEqual(page.consoleErrors, []);
    }
});

test('讀不出來的檔案：狀態寫原因，現在的圖片與記住的都不動', async () => {
    const page = await createCardPage();
    await upload(page, WIDE);
    const stored = page.stored.get(IMAGE_KEY);
    page.pick(page.file({ name: 'notes.txt', type: 'text/plain', broken: true }));
    assert.equal(page.$('cardImageStatus').textContent, '處理中…');
    await page.flush();
    assert.equal(page.$('cardImageStatus').textContent, '這個檔案讀不出來，請換一張圖片。');
    assert.equal(page.stored.get(IMAGE_KEY), stored);
    assert.equal(pictureDraws(page).length, 1, '現在的圖片還在卡片上');
    assert.equal(page.$('imageRemove').disabled, false);
    assert.deepEqual(page.objectUrls.revoked, page.objectUrls.created, '讀失敗也撤掉暫時的網址');
    assert.deepEqual(page.toasts, []);
    assert.deepEqual(page.consoleErrors, []);

    // 之後選一張好的，照常上傳
    await upload(page, { width: 640, height: 360 });
    assert.equal(page.$('cardImageStatus').textContent, '已上傳');
    assert.equal(page.stored.get(IMAGE_KEY), dataUrlOf(640, 360));

    // 第一次就讀不出來：沒有圖片可留，維持預設背景，控制項不能按
    const fresh = await createCardPage();
    await upload(fresh, { broken: true });
    assert.equal(fresh.$('cardImageStatus').textContent, '這個檔案讀不出來，請換一張圖片。');
    assert.equal(pictureDraws(fresh).length, 0);
    assert.ok(!fresh.stored.has(IMAGE_KEY));
    assert.equal(fresh.$('imageZoom').disabled, true);
    // 沒有固有大小的圖（0×0，例如沒寫寬高的 SVG）也當成讀不出來
    const empty = await createCardPage();
    await upload(empty, { width: 0, height: 0 });
    assert.equal(empty.$('cardImageStatus').textContent, '這個檔案讀不出來，請換一張圖片。');
    assert.equal(pictureDraws(empty).length, 0);
    assert.deepEqual(empty.consoleErrors, []);
    // 在選檔案的視窗按取消（沒有選任何檔案）：什麼都不變
    const cancelled = await createCardPage();
    cancelled.pick();
    await cancelled.flush();
    assert.equal(cancelled.$('cardImageStatus').textContent, '');
    assert.equal(cancelled.objectUrls.created.length, 0);
});

test('重新打開時 app.ready 等還原的圖片；存著的圖片解不開就丟掉並說明，頁面照常運作', async () => {
    const fields = JSON.stringify({ name: 'Luna Starweaver' });
    const stored = { [KEY]: fields, [IMAGE_KEY]: dataUrlOf(1024, 576) };

    // 還原還沒完成：ready 還沒完成，卡片先用預設背景
    const held = await createCardPage({ stored, pictureLoads: 'hold' });
    let ready = false;
    held.app.ready.then(() => { ready = true; });
    await held.flush();
    assert.equal(ready, false, '圖片還沒讀回來，ready 不能完成');
    assert.equal(pictureDraws(held).length, 0);
    assert.ok(held.drawCalls().some((call) => call.op === 'createRadialGradient'));
    assert.equal(held.$('imageRemove').disabled, true);
    held.finishPictures(true);
    await held.flush();
    assert.equal(ready, true);
    assert.equal(pictureDraws(held).length, 1);
    assert.deepEqual(drawnRect(pictureDraws(held)[0]), expectedRect(held, { width: 1024, height: 576 }, FILL));
    assert.equal(held.$('imageRemove').disabled, false);
    assert.equal(held.$('cardImageStatus').textContent, '');

    // 讀回來失敗也算完成：ready 完成，說明原因，把解不開的圖片刪掉（不要每次打開都再失敗一次），欄位照舊
    const failing = await createCardPage({ stored, pictureLoads: 'hold' });
    let failedReady = false;
    failing.app.ready.then(() => { failedReady = true; });
    failing.finishPictures(false);
    await failing.flush();
    assert.equal(failedReady, true);
    assert.equal(failing.$('cardImageStatus').textContent, '上次的圖片讀不出來，請重新上傳。');
    assert.ok(!failing.stored.has(IMAGE_KEY));
    assert.equal(failing.stored.get(KEY), fields, '欄位不動');
    assert.equal(failing.$('cardName').value, 'Luna Starweaver');

    // 存著的內容根本不是圖片（壞掉）：同樣丟掉，頁面照常運作，console 是空的
    const broken = await createCardPage({ stored: { ...stored, [IMAGE_KEY]: 'data:image/jpeg;base64,AAAA' } });
    assert.equal(broken.$('cardImageStatus').textContent, '上次的圖片讀不出來，請重新上傳。');
    assert.ok(!broken.stored.has(IMAGE_KEY));
    assert.equal(pictureDraws(broken).length, 0);
    assert.equal(broken.$('imageZoom').disabled, true);
    assert.ok(broken.drawCalls().some((call) => call.op === 'createRadialGradient'));
    assert.deepEqual(broken.consoleErrors, []);
    await upload(broken, WIDE);
    assert.equal(broken.$('cardImageStatus').textContent, '已上傳');
    assert.equal(broken.stored.get(IMAGE_KEY), dataUrlOf(2048, 768));
    // 不是 data:image/ 開頭的（被改過的記憶）：CardState 讀的時候就丟掉，不當圖片
    const foreign = await createCardPage({ stored: { [IMAGE_KEY]: 'https://example.com/a.png' } });
    assert.equal(pictureDraws(foreign).length, 0);
    assert.equal(foreign.$('cardImageStatus').textContent, '');

    // 還原還沒完成時使用者已經上傳了新的：新的算數，舊的比較晚讀回來不蓋掉新的。讀得出來與讀不出來都要試：
    // 讀不出來的那一條會把「記著的圖片壞了」的處理（刪掉記著的、寫上次的圖片讀不出來）用在已經換成新圖的記憶上，把剛上傳的圖刪掉
    for (const lateOk of [true, false]) {
        const racing = await createCardPage({ stored, pictureLoads: 'hold' });
        racing.pick(racing.file(WIDE));
        await racing.flush();
        assert.equal(racing.pictures.length, 3, '存著的圖、上傳的檔案、轉出來再讀回來的圖');
        racing.pictures[2].finish(true);
        await racing.flush();
        const newUrl = dataUrlOf(2048, 768);
        assert.equal(racing.stored.get(IMAGE_KEY), newUrl);
        assert.equal(pictureDraws(racing)[0].args[0].src, newUrl);
        const writes = racing.storageWrites.length;
        racing.pictures[0].finish(lateOk);
        await racing.flush();
        const why = lateOk ? '還原的舊圖讀回來了' : '還原的舊圖讀不出來';
        assert.equal(pictureDraws(racing).length, 1, why);
        assert.equal(pictureDraws(racing)[0].args[0].src, newUrl, `${why}：不蓋掉新的`);
        assert.equal(racing.stored.get(IMAGE_KEY), newUrl, `${why}：記憶裡還是新的（不能被刪掉）`);
        assert.equal(racing.storageWrites.length, writes, `${why}：不再寫`);
        assert.equal(racing.$('cardImageStatus').textContent, '已上傳', `${why}：狀態不變`);
        assert.equal(racing.$('imageRemove').disabled, false);
        assert.deepEqual(racing.consoleErrors, []);
    }
});

test('清除全部也清掉角色圖：圖片、檔案輸入、狀態、調整模式都回到沒有圖片的樣子，還在讀的圖也不會又冒出來', async () => {
    const page = await createCardPage({ coarse: true });
    page.type('cardName', 'Luna');
    await upload(page, WIDE);
    page.slide(200);
    page.press('imageAdjust');
    const slow = page.file({ name: 'slow.png', width: 1000, height: 3000, hold: true });
    page.pick(slow);
    assert.equal(page.$('cardImageStatus').textContent, '處理中…');

    page.press('clearAll');
    assert.ok(page.stored.has(IMAGE_KEY), '第一次按還沒清');
    page.press('clearAll');
    assert.ok(!page.stored.has(IMAGE_KEY) && !page.stored.has(KEY), '兩個鍵都清掉');
    assert.equal(pictureDraws(page).length, 0);
    assert.ok(page.drawCalls().some((call) => call.op === 'createRadialGradient'), '回到預設背景');
    assert.equal(page.$('cardImageStatus').textContent, '');
    assert.equal(page.$('cardImageInput').files.length, 0);
    assert.equal(page.$('cardCanvas').classList.contains('is-adjusting'), false);
    assert.equal(page.$('cardCanvas').classList.contains('has-image'), false);
    assert.equal(page.$('imageAdjust').textContent, '調整圖片');
    assert.equal(page.$('imageZoom').value, '100');
    for (const id of IMAGE_CONTROLS) assert.equal(page.$(id).disabled, true, `#${id} 沒有圖片不能按`);
    assert.equal(page.pointer('down', { pointerType: 'touch', x: 300, y: 200, id: 31 }).defaultPrevented, false);
    assert.deepEqual(page.captures.filter((capture) => capture.pointerId === 31), []);

    // 清除之前還在讀的那一張現在才讀完：不會又冒出來，也不會把記憶寫回去
    page.finishFile(slow, true);
    await page.flush();
    assert.equal(pictureDraws(page).length, 0);
    assert.ok(!page.stored.has(IMAGE_KEY) && !page.stored.has(KEY));
    assert.equal(page.$('cardImageStatus').textContent, '');
    assert.deepEqual(page.consoleErrors, []);

    // 清除之後再上傳，從頭開始
    await upload(page, WIDE);
    assert.equal(page.$('imageZoom').value, '100');
    assert.equal(pictureDraws(page).length, 1);
});

test('切換語言：角色圖的標籤、按鈕與狀態換成那個語言，圖片與位置不變', async () => {
    const page = await createCardPage({ coarse: true });
    const labels = () => [
        page.$('cardImageInput').closest('label').textContent, labelOf(page, 'imageZoom'), page.$('imageCenter').textContent,
        page.$('imageFill').textContent, page.$('imageRemove').textContent, page.$('imageAdjust').textContent
    ];
    assert.deepEqual(labels(), ['上傳截圖', '縮放', '置中', '填滿', '移除圖片', '調整圖片']);
    await upload(page, WIDE);
    page.slide(150);
    assert.equal(page.$('cardImageStatus').textContent, '已上傳');

    page.setLang('en');
    assert.deepEqual(labels(), ['Upload screenshot', 'Zoom', 'Center', 'Fill', 'Remove picture', 'Adjust picture']);
    assert.equal(page.$('cardImageStatus').textContent, 'Uploaded');
    page.setLang('ja');
    assert.deepEqual(labels(), ['スクリーンショットを選ぶ', '拡大', '中央に戻す', '全体に合わせる', '画像を削除', '画像を調整']);
    assert.equal(page.$('cardImageStatus').textContent, 'アップロードしました');
    // 圖片、位置、滑桿的百分比都不變（百分比不是文字，不跟著語言）
    assert.equal(pictureDraws(page).length, 1);
    assert.deepEqual(drawnRect(pictureDraws(page)[0]), expectedRect(page, WIDE_IMAGE, { x: 0, y: 0, zoom: 1.5 }));
    assert.equal(page.$('imageZoom').value, '150');
    assert.equal(page.$('imageZoomValue').textContent, '150%');
    assert.equal(page.$('imageZoom').getAttribute('aria-valuetext'), '150%');

    // 調整中的按鈕寫「完成」，換語言之後還是「完成」那個語言的字（共用的翻譯會先把按鈕改回「調整圖片」，頁面再補回來）
    page.press('imageAdjust');
    assert.equal(page.$('imageAdjust').textContent, '完了');
    page.setLang('en');
    assert.equal(page.$('imageAdjust').textContent, 'Done');
    page.setLang('zh');
    assert.equal(page.$('imageAdjust').textContent, '完成');
    assert.equal(page.$('cardCanvas').classList.contains('is-adjusting'), true, '換語言不結束調整模式');

    // 其他的狀態也跟著語言：讀不出來、移除、存不進去
    page.pick(page.file({ broken: true }));
    await page.flush();
    assert.equal(page.$('cardImageStatus').textContent, '這個檔案讀不出來，請換一張圖片。');
    page.setLang('en');
    assert.equal(page.$('cardImageStatus').textContent, "This file couldn't be read. Try another image.");
    page.press('imageRemove');
    assert.equal(page.$('cardImageStatus').textContent, 'Picture removed');
    page.setLang('ja');
    assert.equal(page.$('cardImageStatus').textContent, '画像を削除しました');
    const full = await createCardPage({ lang: 'en', storageFull: [IMAGE_KEY] });
    await upload(full, WIDE);
    assert.equal(full.$('cardImageStatus').textContent, "This picture is too big to remember. You'll need to upload it again after reloading.");
    full.setLang('ja');
    assert.equal(full.$('cardImageStatus').textContent, 'この画像は大きすぎて保存できません。再読み込みしたらもう一度アップロードしてください。');
    const lost = await createCardPage({ lang: 'ja', stored: { [IMAGE_KEY]: 'data:image/jpeg;base64,AAAA' } });
    assert.equal(lost.$('cardImageStatus').textContent, '前回の画像を読み込めませんでした。もう一度アップロードしてください。');
    lost.setLang('en');
    assert.equal(lost.$('cardImageStatus').textContent, "Your last picture couldn't be loaded. Please upload it again.");
    assert.deepEqual(page.consoleErrors, []);
});

test('角色圖的標記與樣式：看不見但能聚焦的檔案輸入、滑桿、只有調整模式才設 touch-action、有圖片時的游標、用 hidden 切換的元素', () => {
    const panel = sliceElementById(HTML, 'panel-image');
    // 上傳：<label> 包著檔案輸入，label 是按鈕的樣子，輸入框用 .visually-hidden（看不見但還是 Tab 得到）；字在輸入框外面的 <span>
    assert.match(panel, /<label [^>]*class="[^"]*\bbtn\b[^"]*"[^>]*>\s*<span [^>]*data-i18n="char_card_image_upload"[^>]*>上傳截圖<\/span>\s*<input [^>]*id="cardImageInput"[^>]*>\s*<\/label>/);
    const input = tagAttrs(HTML, 'cardImageInput');
    assert.equal(input.type, 'file');
    assert.equal(input.accept, 'image/*');
    assert.ok(classesOf(input).includes('visually-hidden'));
    assert.doesNotMatch(panel, /<input [^>]*id="cardImageInput"[^>]*(?:\shidden|display:\s*none|tabindex="-1")/, '輸入框不能 hidden、不能拿掉焦點');
    // 看不見的輸入框獲得鍵盤焦點時，焦點外框畫在按鈕（label）上
    assert.match(declarations('.image-upload:has(input:focus-visible)'), /box-shadow:\s*var\(--ring-primary\)/);
    assert.match(declarations('.image-upload'), /position:\s*relative/);

    // 狀態：aria-live，沒字時不占位
    assert.equal(tagAttrs(HTML, 'cardImageStatus')['aria-live'], 'polite');
    assert.match(declarations('.editor-panel .image-status:empty'), /margin-top:\s*0/);

    // 滑桿 100～300、間隔 5，沒有圖片時 disabled；旁邊的百分比不是 <output>（它自帶 role="status"，每動一下就念一次，和滑桿自己念的重複）
    const zoom = tagAttrs(HTML, 'imageZoom');
    assert.deepEqual([zoom.type, zoom.min, zoom.max, zoom.step], ['range', '100', '300', '5']);
    assert.match(panel, /<input [^>]*id="imageZoom"[^>]*\sdisabled/);
    assert.doesNotMatch(panel, /<output/);
    assert.match(panel, /<label [^>]*for="imageZoom"[^>]*>縮放<\/label>/);
    // 按鈕：在表單裡，一律 type="button"；沒有圖片時 disabled
    for (const id of ['imageCenter', 'imageFill', 'imageRemove', 'imageAdjust']) {
        assert.equal(tagAttrs(HTML, id).type, 'button', `#${id}`);
        assert.match(panel, new RegExp(`<button [^>]*id="${id}"[^>]*\\sdisabled`), `#${id} 一開始就 disabled`);
    }
    // 「調整圖片」一開始就 hidden（觸控為主的裝置才由 script.js 顯示），.btn 設了 display，要自己寫 display: none
    assert.match(panel, /<button [^>]*id="imageAdjust"[^>]*\shidden/);
    assert.match(declarations('#imageAdjust[hidden]'), /display:\s*none/);
    assert.doesNotMatch(panel, /id="imageAdjust"[^>]*aria-pressed/, '不用 aria-pressed：按鈕的字就說了狀態');

    // 拖曳：touch-action: none 只在調整模式（要在手指按下去之前就設好才有用），平常不設，手指在卡片上滑頁面照常捲
    assert.doesNotMatch(declarations('.preview-canvas', BASE_CSS), /touch-action/);
    assert.match(declarations('.preview-canvas.is-adjusting'), /touch-action:\s*none/);
    assert.match(declarations('.preview-canvas.is-adjusting'), /cursor:\s*grab/);
    assert.equal((CSS.match(/touch-action/g) ?? []).length, 1, '整份 style.css 只有調整模式設 touch-action');
    // 游標：有圖片時滑鼠指到卡片是 grab（只在 pointer: fine，手指沒有游標），拖的時候是 grabbing
    assert.match(declarations('.preview-canvas.has-image', mediaBody('(pointer: fine)')), /cursor:\s*grab/);
    assert.doesNotMatch(declarations('.preview-canvas.has-image', BASE_CSS), /cursor/);
    assert.match(declarations('.preview-canvas.is-dragging'), /cursor:\s*grabbing/);
    assert.ok(CSS.indexOf('.preview-canvas.is-dragging') > CSS.indexOf('.preview-canvas.has-image'), 'grabbing 排在 grab 後面才蓋得掉它');
    // 拖曳不選到字
    assert.match(declarations('.preview-canvas'), /user-select:\s*none/);
    assert.match(declarations('.image-zoom'), /width:\s*100%/);
});

test('頁面替身本身（角色圖）：檔案輸入、blob: 網址、角色圖的 Image、指標與抓取、容量已滿、觸控為主的切換', async () => {
    const page = await createCardPage({ pictureLoads: 'hold', pointerCapture: 'throws', displayScale: 0.25, storageFull: ['no-room'] });

    // file()：假的 File，預設是 1600×900 的 png
    assert.deepEqual(page.file(), { name: 'screenshot.png', type: 'image/png', size: 1600 * 900, width: 1600, height: 900, broken: false, hold: false });
    assert.deepEqual(page.file({ name: 'a.jpg', type: 'image/jpeg', width: 10, height: 20, broken: true, hold: true }),
        { name: 'a.jpg', type: 'image/jpeg', size: 200, width: 10, height: 20, broken: true, hold: true });

    // pick()：files 換成選的檔案（FileList 的替身：沒有陣列的方法），先 input 再 change；value 設 '' 才清掉，設別的字丟錯。
    // 頁面自己在 change 裡就把輸入框清掉了（同一個檔案再選才有 change），也會開始處理第一個檔案，所以這一段用另一個頁面，不影響後面的記錄；
    // 在輸入框自己的監聽裡看 files（它比冒泡到表單的頁面處理先跑）
    const picker = await createCardPage();
    const input = picker.$('cardImageInput');
    const events = [];
    let during = null;
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => {
        events.push('change');
        during = {
            length: input.files.length, first: input.files[0], second: input.files.item(1), third: input.files.item(2),
            names: [...input.files].map((file) => file.name), value: input.value,
            arrayMethods: ['map', 'filter', 'find', 'slice', 'forEach'].map((name) => input.files[name])
        };
    });
    const [one, two] = [page.file({ name: 'one.png' }), page.file({ name: 'two.png' })];
    picker.pick(one, two);
    assert.deepEqual(events, ['input', 'change']);
    assert.equal(during.length, 2);
    isSame(during.first, one);
    isSame(during.second, two);
    assert.equal(during.third, null);
    assert.deepEqual(during.names, ['one.png', 'two.png']);
    assert.deepEqual(during.arrayMethods, [undefined, undefined, undefined, undefined, undefined], 'FileList 沒有陣列的方法');
    assert.equal(during.value, 'C:\\fakepath\\one.png');
    assert.equal(input.files.length, 0, '頁面把輸入框清掉了');
    assert.equal(input.value, '');
    assert.throws(() => { input.value = 'x.png'; }, { name: 'InvalidStateError' });
    picker.pick();
    assert.equal(during.length, 0, '沒給檔案是取消');
    assert.deepEqual(events, ['input', 'change', 'input', 'change']);

    // URL：createObjectURL 記下網址（不是物件的東西丟 TypeError），revokeObjectURL 也記；原本的 URL 照常能用
    const { URL: PageURL } = page.window;
    const url = PageURL.createObjectURL(one);
    assert.match(url, /^blob:https:\/\/ff14\.tw\//);
    assert.throws(() => PageURL.createObjectURL('檔案'), TypeError);
    assert.throws(() => PageURL.createObjectURL(null), TypeError);
    assert.equal(new PageURL('https://ff14.tw/tools/').pathname, '/tools/');
    assert.deepEqual(page.objectUrls, { created: [url], revoked: [] });

    // Image：角色圖（blob:、data:）和職業圖示分開記，不影響 images
    const load = (src) => {
        const image = new page.window.Image();
        const seen = [];
        image.onload = () => seen.push('load');
        image.onerror = () => seen.push('error');
        image.src = src;
        return { image, seen };
    };
    const blob = load(url);
    assert.equal(blob.image.file, one);
    assert.deepEqual(page.pictures, [blob.image]);
    assert.deepEqual(page.images, [], '角色圖不算職業圖示');
    page.finishFile(one, true);
    assert.deepEqual([blob.seen, blob.image.naturalWidth, blob.image.naturalHeight, blob.image.complete], [['load'], 1600, 900, true]);
    // 讀不出來的檔案、撤掉之後才載入的、藏著不放（hold）的檔案
    const broken = page.file({ name: 'broken.png', broken: true });
    const brokenUrl = PageURL.createObjectURL(broken);
    const brokenImage = load(brokenUrl);
    page.finishFile(broken, true);
    assert.deepEqual([brokenImage.seen, brokenImage.image.naturalWidth], [['error'], 0]);
    const late = page.file({ name: 'late.png', width: 30, height: 40 });
    const lateUrl = PageURL.createObjectURL(late);
    const lateImage = load(lateUrl);
    PageURL.revokeObjectURL(lateUrl);
    page.finishFile(late, true);
    assert.deepEqual(lateImage.seen, ['error'], '撤掉的網址之後才載入，和瀏覽器一樣讀不出來');
    assert.deepEqual(page.objectUrls.revoked, [lateUrl]);
    const held = page.file({ name: 'held.png', width: 30, height: 40, hold: true });
    const heldImage = load(PageURL.createObjectURL(held));
    await page.flush();
    assert.deepEqual([heldImage.seen, heldImage.image.complete], [[], false], 'hold 的檔案不自己結束');
    page.finishFile(held, false);
    assert.deepEqual(heldImage.seen, ['error'], 'finishFile(檔案, false) 讓它讀不出來');
    assert.throws(() => page.finishFile(page.file({ name: 'never.png' })), /還沒讀 never\.png/);
    // data:：canvas 的 toDataURL 替身轉出來的讀回那個大小；其他內容讀不出來；pictureLoads 'hold' 時不自己結束
    const data = load(dataUrlOf(640, 360));
    const garbage = load('data:image/jpeg;base64,AAAA');
    const text = load('data:text/plain;base64,AAAA');
    await page.flush();
    assert.deepEqual([data.seen, garbage.seen, text.seen], [[], [], []]);
    page.finishPictures(true);
    assert.deepEqual([data.seen, data.image.naturalWidth, data.image.naturalHeight], [['load'], 640, 360]);
    assert.deepEqual([garbage.seen, text.seen], [['error'], ['error']]);
    // 職業圖示照舊：路徑、64×64
    const icon = load('../../assets/images/se/FFXIVJobIcons/x.png');
    await page.flush();
    assert.deepEqual([icon.seen, icon.image.naturalWidth], [['load'], 64]);
    assert.deepEqual(page.images, [icon.image]);

    // pointer()：在卡片的 canvas 上派送，會冒泡、可取消；up 之後 canvas 還抓著就自己放掉並派送 lostpointercapture（pointerCapture 'throws' 時抓不到）
    const canvas = page.$('cardCanvas');
    const received = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, (event) => received.push(event));
    const down = page.pointer('down', { x: 12, y: 34, id: 5, pointerType: 'touch', button: 0 });
    assert.deepEqual([down.type, down.clientX, down.clientY, down.pointerId, down.pointerType, down.button, down.bubbles, down.cancelable], ['pointerdown', 12, 34, 5, 'touch', 0, true, true]);
    assert.throws(() => canvas.setPointerCapture(5), { name: 'NotFoundError' });
    page.pointer('up', { id: 5 });
    assert.deepEqual(received.map((event) => event.type), ['pointerdown', 'pointerup'], '沒抓著就沒有 lostpointercapture');
    assert.throws(() => page.pointer('sideways'), /pointer 的類型/);
    const capturing = await createCardPage();
    const log = [];
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) capturing.$('cardCanvas').addEventListener(type, (event) => log.push(`${event.type}:${event.pointerId}`));
    capturing.$('cardCanvas').setPointerCapture(8);
    capturing.pointer('cancel', { id: 8 });
    assert.deepEqual(log, ['pointercancel:8', 'lostpointercapture:8']);
    assert.deepEqual(capturing.captures, [{ call: 'set', pointerId: 8 }, { call: 'lost', pointerId: 8 }]);
    capturing.$('cardCanvas').releasePointerCapture(8);
    assert.deepEqual(capturing.captures.at(-1), { call: 'release', pointerId: 8 });
    // 抓著的 pointer 被 releasePointerCapture 放掉：和瀏覽器一樣 canvas 收到 lostpointercapture。lose() 只送 lostpointercapture（沒有 pointerup、pointercancel），沒抓著就丟錯
    log.length = 0;
    capturing.$('cardCanvas').setPointerCapture(9);
    capturing.$('cardCanvas').releasePointerCapture(9);
    assert.deepEqual(log, ['lostpointercapture:9']);
    assert.deepEqual(capturing.captures.slice(-3), [{ call: 'set', pointerId: 9 }, { call: 'release', pointerId: 9 }, { call: 'lost', pointerId: 9 }]);
    log.length = 0;
    capturing.$('cardCanvas').setPointerCapture(10);
    capturing.lose(10);
    assert.deepEqual(log, ['lostpointercapture:10']);
    assert.deepEqual(capturing.captures.slice(-2), [{ call: 'set', pointerId: 10 }, { call: 'lost', pointerId: 10 }]);
    assert.throws(() => capturing.lose(10), /沒有抓著 pointer 10/);
    assert.throws(() => capturing.lose(), /沒有抓著 pointer 1/);
    // buttons：按下去到放開之前是按著的按鍵（左 1、右 2、中 4），其他時候（只是移動、放開的那一刻、取消之後）是 0；傳 buttons 就照傳的
    const buttonsOf = (...events) => events.map((event) => event.buttons);
    assert.deepEqual(buttonsOf(
        capturing.pointer('move', { id: 11 }), capturing.pointer('down', { id: 11, button: 2 }), capturing.pointer('move', { id: 11 }),
        capturing.pointer('move', { id: 11, buttons: 0 }), capturing.pointer('up', { id: 11, button: 2 }), capturing.pointer('move', { id: 11 }),
        capturing.pointer('down', { id: 12 }), capturing.pointer('down', { id: 13, button: 1 }), capturing.pointer('cancel', { id: 12 }), capturing.pointer('move', { id: 12 }),
        capturing.pointer('move', { id: 13 }), capturing.pointer('move', { id: 13, buttons: 5 })
    ), [0, 2, 2, 0, 0, 0, 1, 4, 0, 0, 4, 5]);
    assert.throws(() => capturing.drag([[1, 1]]), /至少要按下與放開/);

    // getBoundingClientRect()：canvas 的寬高乘 displayScale，藏起來是 0；每張 canvas 都有（頁面自己建的也是）；toDataURL 記下請求
    assert.deepEqual([canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height], [300, 168.75]);
    page.setDisplayScale(0);
    assert.deepEqual([canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height], [0, 0]);
    page.setDisplayScale(1);
    const scratch = page.document.createElement('canvas');
    scratch.width = 40;
    scratch.height = 30;
    assert.equal(scratch.getBoundingClientRect().width, 40);
    assert.equal(scratch.toDataURL('image/jpeg', 0.5), dataUrlOf(40, 30));
    assert.deepEqual(page.dataUrlRequests, [{ type: 'image/jpeg', quality: 0.5, width: 40, height: 30 }]);

    // storageFull：這些鍵的 setItem 丟 QuotaExceededError，別的照常；storageWrites 兩種都記
    assert.throws(() => page.window.localStorage.setItem('no-room', 'x'), { name: 'QuotaExceededError' });
    page.window.localStorage.setItem('room', 'y');
    assert.equal(page.stored.get('room'), 'y');
    assert.ok(!page.stored.has('no-room'));
    assert.deepEqual(page.storageWrites.slice(-2), ['no-room', 'room']);

    // slide() 對 disabled 的滑桿丟錯（使用者動不了）
    assert.equal(page.$('imageZoom').disabled, true);
    assert.throws(() => page.slide(150), /disabled/);

    // setCoarse() 通知 (pointer: coarse) 的監聽並改 matches；setNarrow 的監聽不受影響；reopen 帶著新的選項
    const coarse = page.window.matchMedia('(pointer: coarse)');
    const seen = [];
    coarse.addEventListener('change', (event) => seen.push(event.matches));
    const narrowSeen = [];
    page.window.matchMedia('(max-width: 768px)').addEventListener('change', (event) => narrowSeen.push(event.matches));
    page.setCoarse(true);
    assert.deepEqual([seen, coarse.matches, narrowSeen], [[true], true, []]);
    page.setNarrow(true);
    assert.deepEqual([seen, narrowSeen], [[true], [true]]);
    const again = await page.reopen({ pictureLoads: 'load' });
    assert.equal(again.window.matchMedia('(pointer: coarse)').matches, true, 'reopen 帶著現在的觸控為主');
    assert.equal(again.$('cardCanvas').getBoundingClientRect().width, 1200, 'displayScale 也帶著（setDisplayScale(1) 之後是 1）');
    assert.throws(() => again.$('cardCanvas').setPointerCapture(1), { name: 'NotFoundError' }, 'pointerCapture 也帶著');
    await assert.rejects(createCardPage({ pictureLoads: 'nope' }), /不認得的 pictureLoads/);
    await assert.rejects(createCardPage({ pointerCapture: 'nope' }), /不認得的 pointerCapture/);
});

test('index.html：腳本順序、標準字型連結＋Outfit、不載入 security-utils.js、沒有 innerHTML；style.css：沒有 overflow-x、沒有色碼、用 hidden 切換的元素都有 display: none', () => {
    // 腳本順序：i18n 三個、頁首頁尾與共用腳本（tools-registry.js 在 nav-template.js 前、layout-loader.js 在 common.js 前）、共用的遊戲資料與 ModalManager、
    // 這個工具的模組（card-paint.js、card-style-a.js、card-style-b.js 在 card-renderer.js 前面，card-export.js 在 card-image.js 後面、script.js 前面），最後是 script.js
    const scripts = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    const ORDER = [
        '../../assets/js/i18n/i18n-manager.js',
        '../../assets/js/i18n/translations/common.js',
        '../../assets/js/i18n/translations/tools/character-card.js',
        '../../assets/js/components/tools-registry.js',
        '../../assets/js/components/nav-template.js',
        '../../assets/js/components/footer-template.js',
        '../../assets/js/components/layout-loader.js',
        '../../assets/js/common.js',
        '../../assets/js/ff14-game-data.js',
        '../../assets/js/modal-manager.js',
        'card-state.js',
        'card-layout.js',
        'card-paint.js',
        'card-style-a.js',
        'card-style-b.js',
        'card-renderer.js',
        'card-image.js',
        'card-export.js',
        'script.js'
    ];
    assert.deepEqual(scripts, ORDER, '腳本照規定的順序載入，沒有多的');
    for (const src of ORDER) assert.ok(scripts.includes(src), `載入 ${src}`);
    assert.equal(scripts.at(-1), 'script.js');
    assert.ok(!scripts.some((src) => src.endsWith('security-utils.js')), '不載入 security-utils.js');
    assert.ok(!scripts.includes('character-card-data.js'), '舊的資料檔拿掉了');

    // 字型：標準的 Noto Sans TC 連結照舊，另外多一條 Outfit（名字與 FF14.tw 用；FF14.tw 是 600，名字是 800）
    assert.ok(HTML.includes('<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet">'));
    assert.ok(HTML.includes('<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;800&display=swap" rel="stylesheet">'));
    assert.ok(HTML.indexOf('Outfit:wght') > HTML.indexOf('Noto+Sans+TC:wght'));
    assert.ok(HTML.includes('href="https://fonts.gstatic.com" crossorigin'));
    assert.doesNotMatch(HTML, /card-templates\.css/, '舊的卡片樣式拿掉了');
    assert.ok(HTML.indexOf('assets/css/tokens.css') < HTML.indexOf('assets/css/common.css'));
    assert.ok(HTML.indexOf('assets/css/tools-common.css') < HTML.indexOf('href="style.css"'));
    assert.ok(!fs.existsSync(path.join(ROOT, 'tools/character-card/card-templates.css')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'tools/character-card/character-card-data.js')));

    // 分享預覽那一段、標題與說明這次不動（首頁說明的改寫與重新產生是後面的 Task）
    assert.match(HTML, /<title>角色卡產生器 - FF14\.tw<\/title>/);
    assert.match(HTML, /<!-- 分享預覽與主畫面：由 scripts\/share-preview\.mjs 產生，改了分頁標題或說明後重跑 -->/);

    // 腳本：不用 innerHTML／outerHTML／insertAdjacentHTML、不用 SecurityUtils、不用原生的 confirm()；共用資料只從 window 讀，不另外宣告同名的變數
    const code = SCRIPT.replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\.(innerHTML|outerHTML)\s*\+?=|insertAdjacentHTML|SecurityUtils|\bconfirm\(/);
    assert.match(code, /window\.CharacterCardApp = CharacterCardApp/);
    assert.doesNotMatch(code, /(?:const|let|var)\s+FF14_(?:JOBS|WORLDS|TC_WORLDS)\b/);

    // 樣式：不能左右捲、不寫色碼（顏色全部來自 tokens.css，同 design-system.test.js 的規則）、不寫比手機寬的固定寬度
    assert.doesNotMatch(CSS, /overflow-x/);
    assert.doesNotMatch(CSS, /!important/);
    assert.doesNotMatch(CSS, /@import/);
    const noUrls = CSS.replace(/url\([^)]*\)/g, 'url()');
    const literal = noUrls.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|(?<![\w-])(white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|brown)(?![\w-])/i);
    assert.equal(literal, null, `style.css 含有色碼：${literal && literal[0]}`);
    // 固定寬度（width、min-width）不超過手機的 320px；最大寬度（max-width）不在這裡檢查；@media 的條件不是宣告，先拿掉
    for (const match of CSS.replace(/@media[^{]*\{/g, '{').matchAll(/(?<![\w-])(?:min-)?width:\s*(\d+)px/g)) {
        assert.ok(Number(match[1]) <= 320, `寫死的寬度 ${match[0]} 比手機寬`);
    }

    // .card 與 .form-control 等共用樣式設了 display，會蓋掉瀏覽器內建的 [hidden]：JS 用 hidden 切換的元素都要自己寫 display: none
    // （五個面板、自己輸入的伺服器欄位）。標記裡一開始就 hidden 的也一樣
    for (const selector of ['.editor-panel[hidden]', '#cardWorldCustomGroup[hidden]']) {
        assert.match(declarations(selector), /display:\s*none/, `${selector} 要有 display: none`);
    }
    assert.match(SCRIPT, /\.hidden\s*=/);
    for (const [, id] of HTML.matchAll(/<[a-zA-Z][\w-]*\b[^>]*\sid="([^"]+)"[^>]*\shidden(?=[\s>])/g)) {
        assert.match(declarations(`#${id}[hidden]`), /display:\s*none/, `標記裡一開始就 hidden 的 #${id} 要有 display: none`);
    }
});

test('script.js 不在 NodeList／HTMLCollection 上直接用陣列方法', () => {
    // 掃描函式自己：下面這些要抓到，這些不能抓到（掃描壞掉時，後面「沒有」就沒有意義了）
    const flagged = [
        "group.querySelectorAll('button').map((chip) => chip)",
        'box.querySelectorAll(`input[value="${value}"]`).filter(Boolean)',
        "root.querySelectorAll('a:not(.b)').find(Boolean)",
        "root.querySelectorAll('x')\n    .some(Boolean)",
        "root.querySelectorAll('x')?.every(Boolean)",
        "root.querySelectorAll('x').reduce((sum, item) => sum, 0)",
        "root.querySelectorAll('x').includes(item)",
        "root.querySelectorAll('x').indexOf(item)",
        "root.querySelectorAll('x').at(-1)",
        "root.querySelectorAll('x').flatMap(fn)",
        "root.querySelectorAll('x').slice(0, 2)",
        'list.children.map(fn)',
        'list.children.forEach(fn)',
        'list.children.filter(fn)',
        'list.childNodes.find(fn)',
        "document.getElementsByClassName('x').map(fn)",
        "document.getElementsByTagName('x').forEach(fn)"
    ];
    for (const code of flagged) assert.equal(listMisuse(code).length, 1, `要抓到：${code}`);
    const allowed = [
        "Array.from(root.querySelectorAll('x')).map(fn)",
        "[...root.querySelectorAll('x')].filter(fn)",
        "new Map(Array.from(group.querySelectorAll('button'), (chip) => [chip.id, chip]))",
        "for (const item of root.querySelectorAll('x')) {}",
        "root.querySelectorAll('x').forEach(fn)",
        "root.querySelectorAll('x').length",
        "root.querySelectorAll('x')[0]",
        "root.querySelectorAll('x').item(0)",
        'list.childNodes.forEach(fn)',
        'Array.from(list.children).forEach(fn)',
        'list.children[0]',
        'list.children.length',
        "document.getElementsByName('x').forEach(fn)",
        "// root.querySelectorAll('x').map(fn)",
        "/* list.children.map(fn) */",
        "const url = 'https://example.com'; Array.from(list.children).map(fn)"
    ];
    for (const code of allowed) assert.deepEqual(listMisuse(code), [], `不能抓：${code}`);
    assert.match(listMisuse("a();\nb();\nroot.querySelectorAll('x').map(fn)")[0], /^第 3 行/);

    // 掃的是頁面載入的每一支這個工具的腳本（index.html 的 <script src> 裡沒有 / 的那幾個），不只 script.js
    const files = [...HTML.matchAll(/<script src="([^"/]+\.js)"/g)].map((m) => `tools/character-card/${m[1]}`);
    for (const expected of ['card-state.js', 'card-layout.js', 'card-renderer.js', 'card-image.js', 'card-export.js', 'script.js']) {
        assert.ok(files.includes(`tools/character-card/${expected}`), `掃描的清單裡有 ${expected}`);
    }
    for (const file of files) {
        assert.deepEqual(listMisuse(read(file)), [], `${file} 在 NodeList／HTMLCollection 上直接用陣列方法：先 Array.from() 或 [...]（for...of 與 .length、[0] 可以直接用）`);
    }
});

test('標記與版面：表單、預覽、群組與輸入框的名稱；電腦兩欄、分頁列只在手機，預覽 sticky，手機的預覽高度最多 35vh', () => {
    // 標記：表單不送出、不讓瀏覽器自動帶入；預覽的 canvas 是圖片；每個輸入框都有名稱；單選與按鈕群組有自己的名稱；沒有內嵌樣式
    assert.match(HTML, /<form class="[^"]*" id="cardForm" novalidate autocomplete="off">/);
    assert.match(HTML, /<canvas [^>]*id="cardCanvas"[^>]*role="img"/);
    assert.doesNotMatch(HTML, /<h1[^>]*>(?!角色卡產生器)/);
    for (const id of ['cardName', 'cardWorld', 'cardWorldCustom', 'cardMainJob', 'cardLevel', 'cardTitle', 'cardFcName', 'cardFcTag', 'cardGc', 'cardIntro', 'cardContact']) {
        assert.match(HTML, new RegExp(`<label [^>]*for="${id}"`), `#${id} 有 <label>`);
    }
    for (const id of ['cardSubJobs', 'cardLikes', 'cardLooking', 'cardHours']) {
        assert.match(HTML, new RegExp(`id="${id}"[^>]*role="group"[^>]*aria-labelledby="${id}Label"`), `#${id} 是有名稱的群組`);
        assert.match(HTML, new RegExp(`id="${id}Label"`));
    }
    assert.match(HTML, /<div class="[^"]*" role="radiogroup" aria-labelledby="cardAccentLabel">/);
    assert.equal((HTML.match(/<input [^>]*type="radio"/g) ?? []).length, 2);
    for (const id of ['formatLandscape', 'formatPortrait']) assert.match(HTML, new RegExp(`id="${id}"[^>]*aria-pressed="(true|false)"`));
    assert.doesNotMatch(HTML, /style="/, '沒有內嵌樣式');

    // 電腦（769px 以上）：兩欄，分頁列不顯示；手機（768px 以下，沒有 @media 的基本規則）：預覽在最上面、sticky、高度最多 35vh
    const desktop = mediaBody('(min-width: 769px)');
    assert.match(declarations('.editor', desktop), /display:\s*grid/);
    assert.match(declarations('.editor', desktop), /grid-template-columns:\s*minmax\(0, 3fr\) minmax\(0, 2fr\)/);
    assert.match(declarations('.editor-tabs', desktop), /display:\s*none/);
    // 預覽 sticky 是基本規則（手機與電腦都一樣），電腦只調位置：離頂端一段距離、靠上對齊（grid 那一列有整個表單那麼高，才有空間往下走）
    assert.doesNotMatch(declarations('.preview-pane', desktop), /position:/, '電腦不改 position');
    assert.match(declarations('.preview-pane', desktop), /top:\s*var\(--space-4\)/);
    assert.match(declarations('.preview-pane', desktop), /align-self:\s*start/);
    assert.match(declarations('.editor', BASE_CSS), /display:\s*flex/);
    assert.match(declarations('.editor', BASE_CSS), /flex-direction:\s*column/);
    assert.match(declarations('.preview-pane', BASE_CSS), /position:\s*sticky/);
    assert.match(declarations('.preview-pane', BASE_CSS), /order:\s*-1/);
    assert.match(declarations('.preview-canvas', BASE_CSS), /max-height:\s*35vh/);
    assert.match(declarations('.preview-canvas', BASE_CSS), /max-width:\s*100%/);
    assert.match(declarations('.preview-canvas', BASE_CSS), /height:\s*auto/);
    // 欄寫 minmax(0, …)，長的字換行，不撐開版面；不能按的按鈕看得出來；放不下的分頁換行，不左右捲
    assert.match(declarations('.editor-form', BASE_CSS), /min-width:\s*0/);
    assert.match(declarations('.chip:disabled', BASE_CSS), /cursor:\s*not-allowed/);
    assert.match(declarations('.editor-tabs', BASE_CSS), /flex-wrap:\s*wrap/);
});

test('翻譯：三語的鍵一樣，每個鍵的 {參數} 三語一樣，index.html 的預設文字等於 zh 翻譯，頁首名稱與登錄表一致', () => {
    const keys = Object.fromEntries(LANGS.map((lang) => [lang, translationKeySet(TRANSLATIONS, lang)]));
    const values = Object.fromEntries(LANGS.map((lang) => [lang, translationValues(TRANSLATIONS, lang)]));
    assert.ok(keys.zh.size >= 90, `解析不到 ${TRANSLATIONS} 的 zh 語系，測試可能失效（${keys.zh.size} 個）`);
    for (const lang of LANGS) {
        assert.deepEqual([...keys[lang]].sort(), [...keys.zh].sort(), `${lang} 的鍵和 zh 一樣`);
        assert.equal(values[lang].size, keys[lang].size, `${lang} 每個鍵都有字串值`);
    }
    assert.ok([...keys.zh].every((key) => key.startsWith('char_card_')));

    // {n}、{max}、{parts}…：某一語少寫一個參數，畫面上就會少一個數字或名稱，或是留下沒換掉的 {…}
    const params = (text) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
    for (const key of keys.zh) {
        for (const lang of ['en', 'ja']) {
            assert.deepEqual(params(values[lang].get(key)), params(values.zh.get(key)), `${key} 的 ${lang} 參數和 zh 一樣`);
        }
    }
    assert.deepEqual(params(values.zh.get('char_card_count')), ['{max}', '{n}']);
    assert.deepEqual(params(values.zh.get('char_card_preview_label')), ['{parts}']);

    // 每個 data-i18n 的元素：靜態的預設文字和 zh 翻譯相同（I18nManager 套用前後不會閃一下別的字）；有 data-i18n-attr 的比那個屬性
    const found = [...HTML.matchAll(/(<[a-zA-Z][\w-]*\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([^<]*)(?=<)/g)];
    assert.ok(found.length >= 70, `只找到 ${found.length} 個 data-i18n，解析可能失效`);
    for (const [, tag, key, text] of found) {
        assert.ok(keys.zh.has(key), `${key} 要在翻譯檔裡`);
        const attribute = tag.match(/\sdata-i18n-attr="([^"]+)"/)?.[1];
        const preset = attribute ? tag.match(new RegExp(`\\s${attribute}="([^"]*)"`))?.[1] : text;
        assert.equal(preset, values.zh.get(key), `index.html 的 ${key} 預設文字`);
    }
    // script.js 裡用到的鍵（寫死的字串）三語都有：tests/scripts.test.js 也掃這個，這裡先確定都有人讀、不多不少
    const usedInScript = new Set([...SCRIPT.matchAll(/'(char_card_[a-z0-9_]+)'/g)].map((m) => m[1]));
    const usedInHtml = new Set(found.map(([, , key]) => key));
    for (const key of keys.zh) assert.ok(usedInScript.has(key) || usedInHtml.has(key), `${key} 沒有人用`);
    for (const key of usedInScript) assert.ok(keys.zh.has(key), `script.js 用到的 ${key} 不在翻譯檔裡`);

    // 頁首名稱：和 common.js 的工具名稱逐字相同（tests/tools-registry.test.js 也守）
    for (const lang of LANGS) {
        assert.equal(values[lang].get('char_card_header'), translationValues('assets/js/i18n/translations/common.js', lang).get('tool_character_card_title'));
    }

    // 遊戲用語：三語照 TERMINOLOGY.md 與計畫的對照表
    const expected = {
        zh: { like_msq: '主線劇情', like_savage: '零式', like_deep_dungeon: '深層迷宮', looking_static: '固定隊', day_weekend: '假日', slot_late_night: '深夜', gc_twin_adder: '雙蛇黨', role_magic: '法系', role_limited: '限定' },
        en: { like_msq: 'Main Scenario', like_savage: 'Savage', like_deep_dungeon: 'Deep Dungeons', looking_static: 'Static', day_weekend: 'Weekends', slot_late_night: 'Late night', gc_twin_adder: 'Order of the Twin Adder', role_magic: 'Magical Ranged DPS', role_limited: 'Limited' },
        ja: { like_msq: 'メインクエスト', like_savage: '零式', like_deep_dungeon: 'ディープダンジョン', looking_static: '固定', day_weekend: '休日', slot_late_night: '深夜', gc_twin_adder: '双蛇党', role_magic: '魔法レンジ', role_limited: 'リミテッド' }
    };
    for (const lang of LANGS) {
        for (const [key, text] of Object.entries(expected[lang])) assert.equal(values[lang].get(`char_card_${key}`), text, `${lang} 的 ${key}`);
    }
    // 角色圖：狀態文字與按鈕的字（不存進欄位的記憶，只是畫面上的字）；「這張圖太大」那一句的中文一字不差
    const image = {
        zh: {
            upload: '上傳截圖', zoom: '縮放', center: '置中', fill: '填滿', remove: '移除圖片', adjust: '調整圖片', adjust_done: '完成',
            processing: '處理中…', uploaded: '已上傳', not_saved: '這張圖太大，這次不會記住，重新整理後要再上傳。',
            failed: '這個檔案讀不出來，請換一張圖片。', removed: '已移除圖片', restore_failed: '上次的圖片讀不出來，請重新上傳。'
        },
        en: {
            upload: 'Upload screenshot', zoom: 'Zoom', center: 'Center', fill: 'Fill', remove: 'Remove picture', adjust: 'Adjust picture', adjust_done: 'Done',
            processing: 'Processing…', uploaded: 'Uploaded', not_saved: "This picture is too big to remember. You'll need to upload it again after reloading.",
            failed: "This file couldn't be read. Try another image.", removed: 'Picture removed', restore_failed: "Your last picture couldn't be loaded. Please upload it again."
        },
        ja: {
            upload: 'スクリーンショットを選ぶ', zoom: '拡大', center: '中央に戻す', fill: '全体に合わせる', remove: '画像を削除', adjust: '画像を調整', adjust_done: '完了',
            processing: '処理中…', uploaded: 'アップロードしました', not_saved: 'この画像は大きすぎて保存できません。再読み込みしたらもう一度アップロードしてください。',
            failed: 'このファイルは読み込めません。別の画像を選んでください。', removed: '画像を削除しました', restore_failed: '前回の画像を読み込めませんでした。もう一度アップロードしてください。'
        }
    };
    for (const lang of LANGS) {
        for (const [name, text] of Object.entries(image[lang])) assert.equal(values[lang].get(`char_card_image_${name}`), text, `${lang} 的 char_card_image_${name}`);
    }
    // 卡片上的時段用短標籤（英文的全名縮在卡片上看不清）
    assert.deepEqual(['char_card_card_day_weekday', 'char_card_card_day_weekend', 'char_card_card_slot_morning', 'char_card_card_slot_afternoon', 'char_card_card_slot_evening', 'char_card_card_slot_late_night'].map((key) => values.en.get(key)),
        ['Wkdy', 'Wknd', 'Morn', 'Aft', 'Eve', 'Late']);
    assert.deepEqual(['char_card_card_day_weekday', 'char_card_card_day_weekend', 'char_card_card_slot_morning', 'char_card_card_slot_afternoon', 'char_card_card_slot_evening', 'char_card_card_slot_late_night'].map((key) => values.ja.get(key)),
        ['平日', '休日', '朝', '昼', '夜', '深夜']);
});

// 海報風格不畫的四個欄位（部隊名稱、大國防聯軍、聯絡方式、在找什麼）：欄位照樣能填、也會記住，但卡片上不會出現。欄位底下各寫一行小字說明，
// 接進 aria-describedby（螢幕閱讀器聚焦到欄位時念）；會畫在卡片上的欄位沒有。之後換風格、這四項裡有哪一項畫上卡片了，要把它的說明拿掉
const NOT_DRAWN_TEXT = { zh: '目前的海報風格不會畫出這一項', en: 'Not shown on the current poster style', ja: '今のポスタースタイルには表示されません' };
const NOT_DRAWN = [['cardFcName', 'cardFcNameNotDrawn'], ['cardGc', 'cardGcNotDrawn'], ['cardContact', 'cardContactNotDrawn'], ['cardLooking', 'cardLookingNotDrawn']];
test('海報風格不畫的四個欄位底下各寫一行說明，接進 aria-describedby；會畫的欄位沒有；說明跟著介面語言', async () => {
    const page = await createCardPage();
    const describedIds = (element) => (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);

    // 翻譯：三語逐字
    for (const lang of LANGS) assert.equal(translationValues(TRANSLATIONS, lang).get('char_card_not_drawn'), NOT_DRAWN_TEXT[lang], `${lang} 的 char_card_not_drawn`);

    // 四個欄位：底下緊接著一行 .form-text（每個欄位各有自己的 id），欄位的 aria-describedby 指到它（有字數計數的欄位，計數的 id 還在、排前面）
    assert.equal(new Set(NOT_DRAWN.map(([, hint]) => hint)).size, 4, '每個欄位各有自己的 id');
    for (const [fieldId, hintId] of NOT_DRAWN) {
        const field = page.$(fieldId);
        const hint = page.$(hintId);
        assert.equal(hint.tagName, 'SPAN', hintId);
        assert.ok(hint.classList.contains('form-text'), `#${hintId} 用共用的 .form-text`);
        assert.equal(hint.getAttribute('data-i18n'), 'char_card_not_drawn', hintId);
        assert.equal(hint.textContent, NOT_DRAWN_TEXT.zh, hintId);
        isSame(hint.previousElementSibling, field, `#${hintId} 緊接在 #${fieldId} 底下`);
        assert.deepEqual(describedIds(field), page.$(`${fieldId}Count`) ? [`${fieldId}Count`, hintId] : [hintId], `#${fieldId} 的 aria-describedby`);
    }
    // 在找什麼是一組按鈕：說明接在 role="group" 的那個元素上，群組的名稱照舊指到標題
    assert.equal(page.$('cardLooking').getAttribute('role'), 'group');
    assert.equal(page.$('cardLooking').getAttribute('aria-labelledby'), 'cardLookingLabel');

    // 只有這四個：整頁用這個字串的元素就是這四行；其他的控制項（會畫在卡片上的）的 aria-describedby 都沒有指到它們
    assert.deepEqual(all(page.document, '[data-i18n="char_card_not_drawn"]').map((element) => element.getAttribute('id')).sort(), NOT_DRAWN.map(([, hint]) => hint).sort());
    const hintIds = new Set(NOT_DRAWN.map(([, hint]) => hint));
    const withHint = all(page.$('cardForm'), '[aria-describedby]').filter((element) => describedIds(element).some((id) => hintIds.has(id)));
    assert.deepEqual(withHint.map((element) => element.getAttribute('id')).sort(), NOT_DRAWN.map(([field]) => field).sort());
    for (const id of ['cardName', 'cardWorld', 'cardWorldCustom', 'cardMainJob', 'cardLevel', 'cardSubJobs', 'cardTitle', 'cardFcTag', 'cardHours', 'cardLikes', 'cardIntro']) {
        assert.ok(!describedIds(page.$(id)).some((item) => hintIds.has(item)), `#${id} 會畫在卡片上，沒有這行說明`);
    }

    // 說明說的是實話：四個欄位都填了，卡片上還是沒有它們的字（中文與英文介面都一樣）；會畫的欄位都在卡片上
    fillEverything(page);
    page.chip('cardLooking', 'fc').click();
    page.chip('cardLooking', 'friends').click();
    for (const lang of ['zh', 'en']) {
        page.setLang(lang);
        const texts = page.texts();
        for (const hidden of ['Moonlit Garden', 'Discord: luna_star', ...['gc_twin_adder', 'looking_static', 'looking_fc', 'looking_friends'].map((key) => translationValues(TRANSLATIONS, lang).get(`char_card_${key}`))]) {
            assert.ok(!texts.some((text) => text.includes(hidden)), `${lang}：卡片上不會有 ${hidden}`);
        }
        for (const drawn of ['Luna Starweaver', 'Tiamat', '«MOON»', 'Looking for a Savage static.']) assert.ok(texts.includes(drawn), `${lang}：卡片上有 ${drawn}`);
    }
    page.setLang('zh');

    // 說明跟著介面語言（欄位的名稱與選項不變）
    for (const lang of ['en', 'ja', 'zh']) {
        page.setLang(lang);
        for (const [, hintId] of NOT_DRAWN) assert.equal(page.$(hintId).textContent, NOT_DRAWN_TEXT[lang], `${lang}：#${hintId}`);
    }
    assert.deepEqual(page.consoleErrors, []);
});

// ---------- 輸出：下載、分享、複製、全螢幕大圖、必填的驗證、LINE 的提示、手機打字 ----------
const NAME = 'Luna Starweaver';
const OUT_FILE = `ff14-${NAME}.png`;
const FIELD_OF = { name: 'cardName', world: 'cardWorld', mainJob: 'cardMainJob' };
const ERROR_OF = { name: 'cardNameError', world: 'cardWorldError', mainJob: 'cardMainJobError' };
const ERROR_ZH = { name: '請填角色名稱', world: '請選伺服器', mainJob: '請選主職' };
const FONTS_SLOW = '字型還沒載完，先用目前的畫面產生圖片。';
const IMAGE_SLOW = '上傳的截圖還在處理，先用目前的畫面產生圖片。';
const SHARE_READY = '圖片做好了，請再按一次「分享」。';
const LINE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.8.0';

// 必填的三樣（名字、伺服器、主職）都填好
function fillRequired(page, name = NAME) {
    page.type('cardName', name);
    page.select('cardWorld', 'Tiamat');
    page.select('cardMainJob', 'Pictomancer');
}
const messages = (page) => page.toasts.map((toast) => toast.message);
const describedBy = (page, id) => (page.$(id).getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
// 現在顯示著錯誤的欄位（共用的 .form-control.is-invalid ~ .invalid-feedback 才會把緊接在欄位後面的錯誤顯示出來）
const shownErrors = (page) => Object.keys(FIELD_OF).filter((key) => page.$(FIELD_OF[key]).classList.contains('is-invalid'));
const viewerOpen = (page) => page.$('imageViewer').classList.contains('active');
const isTyping = (page) => page.$('cardTool').classList.contains('is-typing');

// 不產生圖；欄位下面寫錯誤（填了、選了就拿掉）；焦點在第一個沒填的欄位；手機先切到基本分頁（電腦五組都看得到，不動分頁）
test('沒填名字就按下載：不產生圖、寫錯誤、焦點在名字欄；手機切到基本分頁', async () => {
    const page = await createCardPage();
    page.press('downloadCard');
    await page.flush();
    // 不產生圖：沒有 toBlob、沒有下載、沒有大圖、沒有 toast（錯誤寫在欄位下面）
    assert.equal(page.blobRequests().length, 0);
    assert.deepEqual(page.downloads, []);
    assert.equal(viewerOpen(page), false);
    assert.deepEqual(page.toasts, []);
    assert.deepEqual(page.consoleErrors, []);

    // 三樣必填都沒填：欄位下面各寫一句，欄位標成錯誤，aria-describedby 指到它（字數計數的 id 留著）
    assert.deepEqual(shownErrors(page), ['name', 'world', 'mainJob']);
    for (const key of Object.keys(FIELD_OF)) {
        const field = page.$(FIELD_OF[key]);
        const error = page.$(ERROR_OF[key]);
        assert.equal(field.getAttribute('aria-invalid'), 'true', `${key}：aria-invalid`);
        assert.ok(describedBy(page, FIELD_OF[key]).includes(ERROR_OF[key]), `${key}：aria-describedby 指到錯誤`);
        assert.equal(error.textContent, ERROR_ZH[key]);
        assert.ok(error.classList.contains('invalid-feedback'), `${key}：用共用的 .invalid-feedback`);
        isSame(error.previousElementSibling, field, `${key}：錯誤緊接在欄位後面（共用的 .form-control.is-invalid ~ .invalid-feedback 才會顯示）`);
    }
    assert.deepEqual(describedBy(page, 'cardName'), ['cardNameCount', 'cardNameError']);
    isSame(page.document.activeElement, page.$('cardName'), '焦點在第一個沒填的欄位：名字');

    // 只有空白還是沒填；有字了錯誤才拿掉（input），aria-describedby 回到只剩字數計數
    page.type('cardName', '   ');
    assert.deepEqual(shownErrors(page), ['name', 'world', 'mainJob']);
    page.type('cardName', 'Luna');
    assert.deepEqual(shownErrors(page), ['world', 'mainJob']);
    assert.equal(page.$('cardName').getAttribute('aria-invalid'), null);
    assert.deepEqual(describedBy(page, 'cardName'), ['cardNameCount']);
    // 伺服器與主職是選單：選了（change）錯誤拿掉，沒有別的 id 時整個 aria-describedby 拿掉
    page.select('cardWorld', 'Tiamat');
    assert.deepEqual(shownErrors(page), ['mainJob']);
    assert.equal(page.$('cardWorld').getAttribute('aria-describedby'), null);
    assert.equal(page.$('cardWorld').getAttribute('aria-invalid'), null);
    page.select('cardMainJob', 'Pictomancer');
    assert.deepEqual(shownErrors(page), []);
    assert.equal(page.$('cardMainJob').getAttribute('aria-describedby'), null);

    // 填好了就產生；再清掉名字，下載又擋住（欄位下面又寫錯誤）
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.downloads.length, 1);
    page.type('cardName', '');
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.downloads.length, 1, '名字空了又擋住');
    assert.deepEqual(shownErrors(page), ['name']);
    isSame(page.document.activeElement, page.$('cardName'));

    // 手機：切到基本分頁（三個必填都在那一組）再把焦點移到第一個沒填的欄位
    const phone = await createCardPage({ narrow: true });
    phone.press('tab-style');
    assert.deepEqual(shownPanels(phone), ['style']);
    phone.press('downloadCard');
    await phone.flush();
    assert.deepEqual(shownPanels(phone), ['basic']);
    assert.deepEqual(selectedTabs(phone), ['basic']);
    isSame(phone.document.activeElement, phone.$('cardName'), '面板顯示出來之後焦點才拿得到');
    assert.deepEqual(shownErrors(phone), ['name', 'world', 'mainJob']);
    assert.equal(phone.blobRequests().length, 0);
    assert.equal(viewerOpen(phone), false, '手機也只寫錯誤，不開大圖');

    // 只差主職：也切到基本分頁（三個必填都在那一組）
    const jobOnly = await createCardPage({ narrow: true });
    jobOnly.type('cardName', NAME);
    jobOnly.select('cardWorld', 'Tiamat');
    jobOnly.press('tab-play');
    jobOnly.press('downloadCard');
    assert.deepEqual(shownPanels(jobOnly), ['basic']);
    isSame(jobOnly.document.activeElement, jobOnly.$('cardMainJob'));

    // 電腦五組都看得到，不用切；沒有動分頁的選取
    const desktop = await createCardPage();
    desktop.app.selectTab('style');
    desktop.press('downloadCard');
    assert.deepEqual(shownPanels(desktop), TABS);
    assert.deepEqual(selectedTabs(desktop), ['style']);
    isSame(desktop.document.activeElement, desktop.$('cardName'));
});

test('必填沒填：焦點到第一個沒填的欄位（名字 → 伺服器 → 主職）；選了「其他」而沒打字就到自己輸入的欄位；分享與複製也一樣擋住', async () => {
    const worldFirst = await createCardPage({ share: 'ok', clipboard: 'ok' });
    worldFirst.type('cardName', NAME);
    worldFirst.press('downloadCard');
    assert.deepEqual(shownErrors(worldFirst), ['world', 'mainJob']);
    isSame(worldFirst.document.activeElement, worldFirst.$('cardWorld'));
    worldFirst.select('cardWorld', 'Tiamat');
    worldFirst.focus('cardName');
    worldFirst.press('shareCard');
    isSame(worldFirst.document.activeElement, worldFirst.$('cardMainJob'), '分享也擋住，焦點到主職');
    worldFirst.focus('cardName');
    worldFirst.press('copyCard');
    await worldFirst.flush();
    isSame(worldFirst.document.activeElement, worldFirst.$('cardMainJob'), '複製也擋住');
    assert.deepEqual(worldFirst.shareCalls, []);
    assert.deepEqual(worldFirst.clipboardCalls, []);
    assert.equal(worldFirst.blobRequests().length, 0);
    assert.deepEqual(worldFirst.toasts, []);

    // 選了「其他（自己輸入）」而什麼都沒打：沒填的是伺服器，焦點到自己輸入的欄位；錯誤也指到那個欄位
    const custom = await createCardPage();
    custom.type('cardName', NAME);
    custom.select('cardMainJob', 'Pictomancer');
    custom.select('cardWorld', '__custom');
    custom.focus('cardName');
    custom.press('downloadCard');
    isSame(custom.document.activeElement, custom.$('cardWorldCustom'));
    assert.deepEqual(shownErrors(custom), ['world']);
    assert.ok(custom.$('cardWorldCustom').classList.contains('is-invalid'));
    assert.deepEqual(describedBy(custom, 'cardWorldCustom'), ['cardWorldCustomCount', 'cardWorldError']);
    assert.equal(custom.$('cardWorldCustom').getAttribute('aria-invalid'), 'true');
    custom.type('cardWorldCustom', 'Home Server');
    assert.deepEqual(shownErrors(custom), []);
    assert.equal(custom.$('cardWorldCustom').classList.contains('is-invalid'), false);
    assert.deepEqual(describedBy(custom, 'cardWorldCustom'), ['cardWorldCustomCount']);
    assert.equal(custom.$('cardWorldCustom').getAttribute('aria-invalid'), null);
    custom.press('downloadCard');
    await custom.flush();
    assert.equal(custom.downloads.length, 1, '自己輸入的伺服器也算填了');
});

test('清除全部也拿掉必填的錯誤；切換語言時顯示著的錯誤換成那個語言', async () => {
    const page = await createCardPage();
    page.press('downloadCard');
    assert.deepEqual(shownErrors(page), ['name', 'world', 'mainJob']);
    assert.deepEqual(Object.keys(ERROR_OF).map((key) => page.$(ERROR_OF[key]).textContent), ['請填角色名稱', '請選伺服器', '請選主職']);
    page.setLang('en');
    assert.deepEqual(Object.keys(ERROR_OF).map((key) => page.$(ERROR_OF[key]).textContent), ['Enter a character name', 'Choose a world', 'Choose a main job']);
    assert.deepEqual(shownErrors(page), ['name', 'world', 'mainJob'], '還是顯示著');
    page.setLang('ja');
    assert.deepEqual(Object.keys(ERROR_OF).map((key) => page.$(ERROR_OF[key]).textContent), ['キャラクター名を入力してください', 'ワールドを選んでください', 'メインジョブを選んでください']);

    page.press('clearAll');
    page.press('clearAll');
    assert.deepEqual(shownErrors(page), [], '清除全部之後沒有人按下載，錯誤不留著');
    assert.deepEqual(describedBy(page, 'cardName'), ['cardNameCount']);
    assert.equal(page.$('cardWorld').getAttribute('aria-describedby'), null);
    assert.equal(page.$('cardMainJob').getAttribute('aria-describedby'), null);
});

// 字型還沒載完（fontsDelay）時 toBlob 還沒被呼叫；每一批都載完、重畫之後才產生（中文字型依字分批載入，下載的圖不能用到備用字型）
test('等字型才產生圖', async () => {
    const page = await createCardPage({ fontsDelay: true });
    fillRequired(page);
    await page.flush();
    // 職業圖示載完時會自己重畫一次；先等它畫完，之後的重畫次數才數得準
    assert.ok(page.images.length >= 1 && page.images.every((image) => image.complete), '主職的圖示已經載完');
    const batches = page.heldFontBatches().length;
    assert.ok(batches >= 2, `打名字、選伺服器與主職各請求了新的字：${batches} 批還在等`);
    const drawsBefore = page.drawCount();
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.blobRequests().length, 0, '字型還沒載完，toBlob 還沒被呼叫');
    assert.deepEqual(page.downloads, []);
    assert.deepEqual(page.toasts, []);

    // 只放行其中一批：還有一批在等，還是不能產生（中文字型依字分批載入，下載時還沒載完的字會用到備用字型）
    page.releaseFonts(0);
    await page.flush();
    assert.equal(page.blobRequests().length, 0, '還有一批沒載完');
    page.releaseFonts();
    await page.flush();
    assert.equal(page.blobRequests().length, 1);
    assert.equal(page.downloads.length, 1);
    assert.equal(page.downloads[0].file, OUT_FILE);
    // 拍下來的那一刻字型都載完了（沒有還在等的批次），而且每一批載完各重畫過一次、產生之前又重畫了一次
    assert.deepEqual(page.heldFontBatches(), []);
    const [request] = page.blobRequests();
    assert.equal(request.draws, drawsBefore + batches + 1, `重畫：之前 ${drawsBefore} 次，${batches} 批各一次、再加產生之前一次`);
    assert.ok(request.texts.includes(NAME) && request.texts.includes('Tiamat'), '拍下來的畫面有名字與伺服器');
});

test('產生圖也等職業圖示：圖示還沒載完（icons: hold）時 toBlob 還沒被呼叫，載完（或失敗）才產生', async () => {
    const page = await createCardPage({ icons: 'hold' });
    fillRequired(page);
    assert.ok(page.images.length >= 1 && page.images.every((image) => !image.complete), '主職的圖示請求了，一直沒回來');
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.blobRequests().length, 0, '圖示還沒載完');
    page.finishImages(true);
    await page.flush();
    assert.equal(page.blobRequests().length, 1);
    assert.equal(page.downloads.length, 1);
    assert.ok(page.drawCalls().some((call) => call.op === 'drawImage'), '卡片畫的是圖示（不是名稱的第一個字）');

    // 等圖示的時候字型又有新的批次（使用者又打了字）：圖示載完時還有一批在等，照樣要等它載完才產生，不是圖示好了就產生
    const typing = await createCardPage({ icons: 'hold', fontsDelay: true });
    fillRequired(typing);
    typing.press('downloadCard');
    typing.releaseFonts();
    await typing.flush();
    assert.equal(typing.heldFontBatches().length, 0, '字型都載完了，只剩圖示');
    typing.type('cardTitle', '光之戰士');
    assert.equal(typing.heldFontBatches().length, 1, '等圖示的時候又請求了新的字');
    typing.finishImages(true);
    await typing.flush();
    assert.equal(typing.blobRequests().length, 0, '圖示好了，但新請求的字型還沒載完');
    typing.releaseFonts();
    await typing.flush();
    assert.equal(typing.blobRequests().length, 1);
    assert.equal(typing.downloads.length, 1);
    // 稱號是一個字一個字畫的：新請求的字也畫在拍下來的圖上
    assert.ok(Array.from('光之戰士').every((char) => typing.blobRequests()[0].texts.includes(char)), '稱號也畫上去了');

    // 載入失敗也算結束：卡片用名稱的第一個字，照樣產生
    const failed = await createCardPage({ icons: 'hold' });
    fillRequired(failed);
    failed.press('downloadCard');
    await failed.flush();
    assert.equal(failed.blobRequests().length, 0);
    failed.finishImages(false);
    await failed.flush();
    assert.equal(failed.blobRequests().length, 1);
    assert.equal(failed.downloads.length, 1);
    assert.deepEqual(failed.toasts.map((toast) => toast.message), [`已下載 ${OUT_FILE}`], '沒有逾時的 toast');
});

test('產生圖也等記住的角色圖還原好：還在讀（pictureLoads: hold）時 toBlob 還沒被呼叫，讀好（或讀不出來）才產生，圖畫在卡片上', async () => {
    const stored = { [KEY]: JSON.stringify({ v: 1, name: NAME, world: 'Tiamat', mainJob: 'Pictomancer' }), [IMAGE_KEY]: dataUrlOf(640, 360) };
    const page = await createCardPage({ stored, pictureLoads: 'hold' });
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.blobRequests().length, 0, '記住的圖片還在讀');
    assert.deepEqual(page.downloads, []);
    page.finishPictures(true);
    await page.flush();
    assert.equal(page.blobRequests().length, 1);
    assert.equal(page.downloads.length, 1);
    assert.ok(pictureDraws(page).length >= 1, '拍下來的卡片上有還原的角色圖');

    // 讀不出來也算結束：卡片用預設背景，照樣產生
    const broken = await createCardPage({ stored, pictureLoads: 'hold' });
    broken.press('downloadCard');
    await broken.flush();
    assert.equal(broken.blobRequests().length, 0);
    broken.finishPictures(false);
    await broken.flush();
    assert.equal(broken.blobRequests().length, 1);
    assert.equal(broken.downloads.length, 1);
    assert.equal(pictureDraws(broken).length, 0);
});

// 選了截圖之後馬上按下載：截圖還在縮小、轉成 JPEG 再讀回來，不等它的話下載的是舊的圖（或預設背景），畫面卻在一會兒之後換成新的那張
test('產生圖也等還在處理的截圖：選了截圖還在處理（hold）時 toBlob 還沒被呼叫，處理好才產生，拍下來的是新的那張；讀不出來就照現在的圖產生', async () => {
    const page = await createCardPage();
    fillRequired(page);
    await upload(page, { width: 640, height: 360 });
    const file = page.file({ name: 'new.png', ...WIDE, hold: true });
    page.pick(file);
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.$('cardImageStatus').textContent, '處理中…');
    assert.equal(page.blobRequests().length, 0, '新的截圖還在處理');
    assert.deepEqual(page.downloads, []);
    assert.deepEqual(pictureDraws(page).map((call) => call.args[0].src), [dataUrlOf(640, 360)], '畫面上還是舊的那張');
    page.finishFile(file, true);
    await page.flush();
    assert.equal(page.blobRequests().length, 1);
    assert.equal(page.downloads.length, 1);
    assert.equal(page.blobRequests()[0].draws, page.drawCount(), '產生之後沒有再重畫：現在畫著的就是拍下來的那一張');
    assert.deepEqual(pictureDraws(page).map((call) => call.args[0].src), [dataUrlOf(2048, 768)], '拍下來的是新的那張');
    assert.ok(!page.pendingDelays().includes(10000), '沒逾時，計時取消了');
    assert.deepEqual(messages(page), [`已下載 ${OUT_FILE}`]);

    // 讀不出來：照現在的圖（剛才那張）產生，不說產生失敗
    const broken = page.file({ name: 'broken.png', hold: true });
    page.pick(broken);
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.blobRequests().length, 1);
    page.finishFile(broken, false);
    await page.flush();
    assert.equal(page.blobRequests().length, 2);
    assert.equal(page.downloads.length, 2);
    assert.equal(page.$('cardImageStatus').textContent, '這個檔案讀不出來，請換一張圖片。');
    assert.deepEqual(pictureDraws(page).map((call) => call.args[0].src), [dataUrlOf(2048, 768)], '圖片照舊');
    assert.deepEqual(messages(page), [`已下載 ${OUT_FILE}`, `已下載 ${OUT_FILE}`]);
    assert.deepEqual(page.consoleErrors, []);
});

test('還在處理的截圖只等最新的一次：被後選的取代、移除圖片之後就不等它；分享、複製也等', async () => {
    // 先選的還在處理、後選的已經好了：只有後選的算數，不等先選的
    const page = await createCardPage();
    fillRequired(page);
    const slow = page.file({ name: 'slow.png', ...WIDE, hold: true });
    page.pick(slow);
    await upload(page, { width: 640, height: 360 });
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.downloads.length, 1, '不等被取代的那一次');
    assert.deepEqual(pictureDraws(page).map((call) => call.args[0].src), [dataUrlOf(640, 360)]);
    // 移除圖片：還在處理的那一次不算了，也不等它
    const pending = page.file({ name: 'pending.png', hold: true });
    page.pick(pending);
    page.press('imageRemove');
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.downloads.length, 2, '移除圖片之後不等還在處理的那一次');
    assert.deepEqual(pictureDraws(page), [], '預設背景');
    // 那兩次現在才讀完：不換圖、不再產生
    page.finishFile(slow, true);
    page.finishFile(pending, true);
    await page.flush();
    assert.equal(page.downloads.length, 2);
    assert.deepEqual(pictureDraws(page), []);
    assert.deepEqual(page.consoleErrors, []);

    // 分享與複製也等截圖處理好
    const both = await createCardPage({ share: 'ok', clipboard: 'ok' });
    fillRequired(both);
    const shared = both.file({ name: 'shared.png', hold: true });
    both.pick(shared);
    both.press('shareCard');
    await both.flush();
    assert.deepEqual(both.shareCalls, [], '分享等截圖處理好');
    both.finishFile(shared, true);
    await both.flush();
    assert.equal(both.shares.length, 1);
    assert.deepEqual(pictureDraws(both).map((call) => call.args[0].src), [dataUrlOf(1600, 900)], '分享的是新的那張');
    const copied = both.file({ name: 'copied.png', width: 640, height: 360, hold: true });
    both.pick(copied);
    both.press('copyCard');
    await both.flush();
    assert.equal(both.clipboardCalls.length, 1, '點擊的當下就交給剪貼簿');
    assert.deepEqual(both.clipboardWrites, [], '圖還沒好：等截圖處理好');
    both.finishFile(copied, true);
    await both.flush();
    assert.equal(both.clipboardWrites.length, 1);
    assert.deepEqual(pictureDraws(both).map((call) => call.args[0].src), [dataUrlOf(640, 360)], '複製的是新的那張');
    assert.deepEqual(both.consoleErrors, []);
});

// 下載已經在等的那一次上傳不算數了（移除圖片、改選另一張），就不能再等它：不然匯出卡到 10 秒逾時，還跳「字型還沒載完」
test('已經在等上傳中的截圖時移除圖片或改選另一張：不再等原本那一次，移除就馬上產生，改選就等新的那張', async () => {
    const page = await createCardPage();
    fillRequired(page);
    await upload(page, { width: 640, height: 360 });
    const stuck = page.file({ name: 'stuck.png', ...WIDE, hold: true });
    page.pick(stuck);
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.blobRequests().length, 0, '在等新選的截圖');
    page.press('imageRemove');
    await page.flush();
    assert.equal(page.blobRequests().length, 1, '移除圖片之後馬上產生，不等到逾時');
    assert.equal(page.downloads.length, 1);
    assert.deepEqual(pictureDraws(page), [], '預設背景');
    assert.ok(!page.pendingDelays().includes(10000), '10 秒的計時取消了');
    assert.deepEqual(messages(page), [`已下載 ${OUT_FILE}`], '沒有「字型還沒載完」');

    // 改選另一張：等新的那張處理好就產生，畫的是新的那張；先選的那張一直沒讀完也不影響
    const slow = page.file({ name: 'slow.png', hold: true });
    page.pick(slow);
    page.press('downloadCard');
    await page.flush();
    const next = page.file({ name: 'next.png', width: 1000, height: 3000, hold: true });
    page.pick(next);
    await page.flush();
    assert.equal(page.blobRequests().length, 1, '改選的那張還在處理');
    page.finishFile(next, true);
    await page.flush();
    assert.equal(page.blobRequests().length, 2, '新的那張好了就產生，不等先選的那張');
    assert.equal(page.downloads.length, 2);
    assert.deepEqual(pictureDraws(page).map((call) => call.args[0].src), [dataUrlOf(683, 2048)]);
    assert.ok(!page.pendingDelays().includes(10000));
    assert.deepEqual(messages(page), [`已下載 ${OUT_FILE}`, `已下載 ${OUT_FILE}`]);
    assert.deepEqual(page.consoleErrors, []);
});

test('等太久就不等了：EXPORT_WAIT_MS（10 秒）一到，照目前的畫面產生圖、跳「字型還沒載完」的 toast（卡住的是上傳的截圖時寫截圖還在處理）；沒逾時時把計時取消', async () => {
    const page = await createCardPage({ fontsDelay: true });
    assert.equal(page.window.CharacterCardApp.EXPORT_WAIT_MS, 10000);
    fillRequired(page);
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.blobRequests().length, 0);
    assert.ok(page.pendingDelays().includes(10000), '用頁面的 setTimeout 等最多 10 秒');
    page.runTimeouts();
    await page.flush();
    assert.equal(page.blobRequests().length, 1, '逾時後照現在的畫面產生');
    assert.equal(page.downloads.length, 1);
    assert.deepEqual(messages(page), [FONTS_SLOW, `已下載 ${OUT_FILE}`]);
    assert.equal(page.toasts[0].type, 'warning');
    // 字型之後才回來：不會再產生第二張
    page.releaseFonts();
    await page.flush();
    assert.equal(page.blobRequests().length, 1);
    assert.equal(page.downloads.length, 1);

    // 圖示卡住也一樣
    const icons = await createCardPage({ icons: 'hold' });
    fillRequired(icons);
    icons.press('downloadCard');
    await icons.flush();
    assert.equal(icons.blobRequests().length, 0);
    icons.runTimeouts();
    await icons.flush();
    assert.equal(icons.blobRequests().length, 1);
    assert.ok(messages(icons).includes(FONTS_SLOW));

    // 卡住的是上傳的截圖：toast 寫截圖還在處理（不是字型），玩家才知道等它處理好再下載一次
    const picture = await createCardPage();
    fillRequired(picture);
    picture.pick(picture.file({ hold: true }));
    picture.press('downloadCard');
    await picture.flush();
    assert.equal(picture.blobRequests().length, 0);
    picture.runTimeouts();
    await picture.flush();
    assert.equal(picture.blobRequests().length, 1);
    assert.equal(picture.downloads.length, 1);
    assert.deepEqual(messages(picture), [IMAGE_SLOW, `已下載 ${OUT_FILE}`]);
    assert.equal(picture.toasts[0].type, 'warning');

    // 沒逾時：載完就產生，10 秒的計時已經取消（只剩撤銷網址的計時）
    const fine = await createCardPage();
    fillRequired(fine);
    fine.press('downloadCard');
    await fine.flush();
    assert.equal(fine.downloads.length, 1);
    assert.ok(!fine.pendingDelays().includes(10000), '沒逾時，計時取消了');
    assert.deepEqual(messages(fine), [`已下載 ${OUT_FILE}`]);
});

const EXPORT_FAILED = '沒辦法產生圖片，請再試一次。';

test('匯出中再按下載、分享、複製、點卡片都不理：一次只產生一張；做完（或失敗）之後又能按', async () => {
    const page = await createCardPage({ fontsDelay: true, share: 'ok', clipboard: 'ok' });
    fillRequired(page);
    page.press('downloadCard');
    page.press('downloadCard');
    page.press('shareCard');
    page.press('copyCard');
    page.press('cardCanvas');
    await page.flush();
    assert.equal(page.blobRequests().length, 0);
    assert.deepEqual(page.clipboardCalls, [], '複製沒有呼叫 clipboard.write');
    assert.deepEqual(page.shareCalls, []);
    page.releaseFonts();
    await page.flush();
    assert.equal(page.blobRequests().length, 1, '只產生一張');
    assert.equal(page.downloads.length, 1, '只下載一次');
    assert.deepEqual(page.shareCalls, []);
    assert.deepEqual(page.clipboardCalls, []);
    assert.deepEqual(messages(page), [`已下載 ${OUT_FILE}`]);

    // 做完了：再按又能做
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.downloads.length, 2);
    // 失敗（轉不成 PNG）也把「忙」放掉，而且告訴使用者
    page.setBlobFails(true);
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.downloads.length, 2);
    assert.equal(messages(page).at(-1), EXPORT_FAILED);
    page.setBlobFails(false);
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.downloads.length, 3);
    // 必填沒過也不會卡住：再填好又能下載
    page.type('cardName', '');
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.downloads.length, 3);
    page.type('cardName', NAME);
    page.press('downloadCard');
    await page.flush();
    assert.equal(page.downloads.length, 4);

    // 手機：下載還在等時，再點卡片不會多開一個大圖，也不會多產生一張
    const phone = await createCardPage({ fontsDelay: true, narrow: true });
    fillRequired(phone);
    phone.press('downloadCard');
    phone.press('cardCanvas');
    phone.press('downloadCard');
    phone.releaseFonts();
    await phone.flush();
    assert.equal(phone.blobRequests().length, 1);
    assert.equal(viewerOpen(phone), true);
    assert.equal(phone.objectUrls.created.length, 1, '只建了一個 object URL');
});

// 橫版 1200×675、直版 1080×1350；連結點完就拿掉；網址不在同一個 tick 撤銷（過一陣子才撤銷）
test('電腦下載：檔名 ff14-Luna Starweaver.png 的 <a download> 被點、toast', async () => {
    const page = await createCardPage();
    fillRequired(page);
    page.press('downloadCard');
    await page.flush();
    assert.deepEqual(page.blobRequests().map(({ type, width, height }) => ({ type, width, height })), [{ type: 'image/png', width: 1200, height: 675 }]);
    assert.equal(page.downloads.length, 1);
    const [download] = page.downloads;
    assert.equal(download.file, OUT_FILE);
    assert.match(download.href, /^blob:/);
    assert.ok(download.blob && download.blob.size > 0 && download.blob.type === 'image/png', '點的是這張 PNG 的 object URL');
    assert.deepEqual(messages(page), [`已下載 ${OUT_FILE}`]);
    assert.equal(page.toasts[0].type, undefined, '成功的 toast 用預設的樣式');
    assert.equal(viewerOpen(page), false, '電腦直接下載，不開大圖');
    assert.deepEqual(page.consoleErrors, []);
    // 連結點完就拿掉，不留在 body 上
    assert.deepEqual(kids(page.document.body).filter((node) => node.tagName === 'A'), []);

    // 網址不在同一個 tick 撤銷（有的瀏覽器網址一撤銷就取消這次下載）：還沒撤銷，排了 1 秒以上的計時，時間到才撤銷
    assert.ok(!page.objectUrls.revoked.includes(download.href), '點完還沒撤銷');
    const delays = page.pendingDelays();
    assert.equal(delays.length, 1);
    assert.ok(delays[0] >= 1000, `撤銷的計時 ${delays[0]} 毫秒，至少 1000`);
    page.runTimeouts();
    assert.deepEqual(page.objectUrls.revoked.filter((url) => url === download.href), [download.href]);

    // 直版：1080×1350，同一個檔名；名字裡不能當檔名的字換掉
    page.press('formatPortrait');
    page.type('cardName', 'Luna/Star:weaver?');
    page.press('downloadCard');
    await page.flush();
    assert.deepEqual(page.blobRequests().map(({ width, height }) => [width, height]), [[1200, 675], [1080, 1350]]);
    assert.equal(page.downloads.at(-1).file, 'ff14-Luna-Star-weaver-.png');
    assert.equal(messages(page).at(-1), '已下載 ff14-Luna-Star-weaver-.png');
    // 兩次下載各是各的網址
    assert.notEqual(page.downloads[0].href, page.downloads[1].href);
    assert.equal(page.consoleErrors.length, 0);
});

test('下載的圖就是畫面上那張 canvas：拍下來的畫面有名字、伺服器、主職與版權字，頁面不再多畫別的', async () => {
    const page = await createCardPage();
    fillRequired(page);
    const drawsBefore = page.drawCount();
    page.press('downloadCard');
    await page.flush();
    const [request] = page.blobRequests();
    assert.ok(request.draws >= drawsBefore, '沒有另外建一張 canvas 重畫別的東西');
    for (const text of [NAME, 'Tiamat', MARK, NOTICE]) assert.ok(request.texts.includes(text), `畫面上有 ${text}`);
    assert.deepEqual(request.texts, page.texts(), '拍下來的就是現在畫面上畫的字');
});

// 關掉（Esc 或關閉鈕）時圖與下載連結不再指到這一張的網址，網址過一陣子才撤銷（見下面的測試）；Safari 點按鈕不給焦點時焦點也要回到下載鈕
test('手機下載：對話框打開、圖是 object URL、長按的說明、關閉後焦點回到下載鈕', async () => {
    const page = await createCardPage({ narrow: true, share: 'ok' });
    fillRequired(page);
    page.focus('downloadCard');
    page.press('downloadCard');
    await page.flush();
    const viewer = page.$('imageViewer');
    assert.equal(viewerOpen(page), true);
    assert.equal(viewer.getAttribute('role'), 'dialog');
    assert.equal(viewer.getAttribute('aria-modal'), 'true');
    assert.equal(viewer.getAttribute('aria-labelledby'), 'viewerTitle');
    assert.equal(page.$('viewerTitle').textContent, '長按圖片即可儲存');
    // 手機不直接下載：沒有 <a download> 被點、沒有 toast
    assert.deepEqual(page.downloads, []);
    assert.deepEqual(page.toasts, []);
    assert.equal(page.blobRequests().length, 1);

    // 圖是這一張的 object URL；說明（alt）是卡片現在的說明
    const image = page.$('viewerImage');
    const src = image.getAttribute('src');
    assert.match(src, /^blob:/);
    assert.deepEqual(page.objectUrls.created.filter((url) => url === src), [src]);
    assert.ok(!page.objectUrls.revoked.includes(src), '開著的時候不能撤銷');
    assert.equal(image.getAttribute('alt'), page.$('cardCanvas').getAttribute('aria-label'));
    assert.equal(image.getAttribute('alt'), '角色卡預覽：Luna Starweaver，Tiamat，繪靈法師 Lv 100');
    // 「下載檔案」是 <a download>（給支援的瀏覽器）：同一個網址、同一個檔名
    const link = page.$('viewerDownload');
    assert.equal(link.tagName, 'A');
    assert.equal(link.hidden, false);
    assert.equal(link.getAttribute('href'), src);
    assert.equal(link.getAttribute('download'), OUT_FILE);
    assert.equal(link.textContent, '下載檔案');
    // 分享（這個瀏覽器支援才出現）與關閉
    assert.equal(page.$('viewerShare').hidden, false);
    assert.equal(page.$('viewerShare').textContent, '分享');
    assert.equal(page.$('viewerClose').textContent, '關閉');
    // 焦點移進對話框裡
    assert.ok(viewer.contains(page.document.activeElement), '焦點在對話框裡');
    assert.deepEqual(page.consoleErrors, []);

    // Esc 關掉：焦點回到「下載圖片」；關掉的當下還沒撤銷這一張的網址，過一陣子才撤銷（只撤銷一次）
    page.key('Escape');
    assert.equal(viewerOpen(page), false);
    isSame(page.document.activeElement, page.$('downloadCard'));
    assert.ok(!page.objectUrls.revoked.includes(src), '關掉的當下還沒撤銷');
    page.runTimeouts();
    assert.deepEqual(page.objectUrls.revoked.filter((url) => url === src), [src]);

    // 再開一次：新的網址；用「關閉」鈕關掉也一樣
    page.press('downloadCard');
    await page.flush();
    assert.equal(viewerOpen(page), true);
    const second = page.$('viewerImage').getAttribute('src');
    assert.notEqual(second, src);
    assert.equal(page.$('viewerDownload').getAttribute('href'), second);
    page.press('viewerClose');
    assert.equal(viewerOpen(page), false);
    isSame(page.document.activeElement, page.$('downloadCard'));
    assert.ok(!page.objectUrls.revoked.includes(second), '關掉的當下還沒撤銷');
    page.runTimeouts();
    assert.deepEqual(page.objectUrls.revoked.filter((url) => url === second), [second]);
    assert.equal(page.downloads.length, 0);

    // Safari 與 macOS 的 Firefox 點按鈕不給焦點（activeElement 是 body）：照樣要回到「下載圖片」
    const safari = await createCardPage({ narrow: true });
    fillRequired(safari);
    safari.document.body.focus();
    assert.equal(safari.document.activeElement, safari.document.body);
    safari.press('downloadCard');
    await safari.flush();
    assert.equal(viewerOpen(safari), true);
    safari.key('Escape');
    isSame(safari.document.activeElement, safari.$('downloadCard'));
});

// 剛點完「下載檔案」就關掉大圖：瀏覽器是在 click() 之後才（非同步）去讀網址，太早撤銷有的瀏覽器會取消這次下載（電腦下載的 CardExport.download 也是等
// REVOKE_DELAY_MS 才撤銷）。所以關掉大圖時，圖與下載連結馬上不再指到網址，網址則等同樣的時間才撤銷
test('關掉大圖：圖與下載連結馬上不再指到網址，網址等 REVOKE_DELAY_MS 才撤銷（剛點完下載檔案就關掉，下載不會被取消）', async () => {
    const page = await createCardPage({ narrow: true });
    fillRequired(page);
    page.press('downloadCard');
    await page.flush();
    const url = page.$('viewerImage').getAttribute('src');
    assert.equal(page.$('viewerDownload').getAttribute('href'), url);
    assert.deepEqual(page.pendingDelays(), [], '開著的時候沒有排任何計時');

    // 點「下載檔案」（<a download>），馬上關掉
    page.$('viewerDownload').click();
    assert.deepEqual(page.downloads.map((download) => download.href), [url], '點的是這一張的網址');
    page.press('viewerClose');
    assert.equal(viewerOpen(page), false);
    // 圖與下載連結馬上不再指到它
    assert.equal(page.$('viewerImage').hasAttribute('src'), false);
    assert.equal(page.$('viewerDownload').hasAttribute('href'), false);
    // 網址還沒撤銷：排了一個計時，等的時間和電腦下載一樣（CardExport.REVOKE_DELAY_MS，至少 1 秒）
    assert.deepEqual(page.objectUrls.revoked, [], '網址還有效：下載的瀏覽器還在讀它');
    const { REVOKE_DELAY_MS } = page.window.CardExport;
    assert.ok(REVOKE_DELAY_MS >= 1000);
    assert.deepEqual(page.pendingDelays(), [REVOKE_DELAY_MS]);
    // 時間到才撤銷，只撤銷一次
    page.runTimeouts();
    assert.deepEqual(page.objectUrls.revoked, [url]);
    page.runTimeouts();
    assert.deepEqual(page.objectUrls.revoked, [url]);
    assert.deepEqual(page.pendingDelays(), []);

    // 大圖已經開著時再按「下載圖片」：先關掉前一張（它照樣等計時），新的那張一直有效，直到它自己關掉
    page.press('downloadCard');
    await page.flush();
    const first = page.$('viewerImage').getAttribute('src');
    page.press('downloadCard');
    await page.flush();
    const second = page.$('viewerImage').getAttribute('src');
    assert.notEqual(second, first);
    assert.equal(page.$('viewerDownload').getAttribute('href'), second);
    assert.deepEqual(page.objectUrls.revoked, [url], '前一張只是排了計時，還沒撤銷');
    assert.deepEqual(page.pendingDelays(), [REVOKE_DELAY_MS]);
    page.runTimeouts();
    assert.deepEqual(page.objectUrls.revoked, [url, first], '前一張時間到才撤銷，開著的這一張不動');
    page.key('Escape');
    assert.deepEqual(page.objectUrls.revoked, [url, first]);
    page.runTimeouts();
    assert.deepEqual(page.objectUrls.revoked, [url, first, second]);
    assert.deepEqual(page.consoleErrors, []);
});

test('大圖裡沒有分享時（瀏覽器不支援）沒有分享鈕；有 canShare 卻不收檔案時也沒有', async () => {
    for (const options of [{}, { share: 'no-files' }, { share: 'ok', fileConstructor: false }]) {
        const page = await createCardPage({ narrow: true, ...options });
        fillRequired(page);
        page.press('downloadCard');
        await page.flush();
        assert.equal(viewerOpen(page), true, JSON.stringify(options));
        assert.equal(page.$('viewerShare').hidden, true, JSON.stringify(options));
        assert.equal(page.$('viewerDownload').hidden, false);
        assert.equal(page.$('shareCard').hidden, true, JSON.stringify(options));
    }
});

test('觸控為主的寬螢幕（平板）也用大圖，滑鼠的寬螢幕直接下載；視窗大小變了照現在的算', async () => {
    const tablet = await createCardPage({ coarse: true });
    fillRequired(tablet);
    tablet.press('downloadCard');
    await tablet.flush();
    assert.equal(viewerOpen(tablet), true, '(pointer: coarse) 就用大圖');
    assert.deepEqual(tablet.downloads, []);

    const mouse = await createCardPage();
    fillRequired(mouse);
    mouse.press('downloadCard');
    await mouse.flush();
    assert.equal(viewerOpen(mouse), false);
    assert.equal(mouse.downloads.length, 1);

    // 按的當下才看：視窗縮到手機寬度就用大圖，放寬了又直接下載
    const resizing = await createCardPage();
    fillRequired(resizing);
    resizing.setNarrow(true);
    resizing.press('downloadCard');
    await resizing.flush();
    assert.equal(viewerOpen(resizing), true);
    assert.equal(resizing.downloads.length, 0);
    resizing.key('Escape');
    resizing.setNarrow(false);
    resizing.press('downloadCard');
    await resizing.flush();
    assert.equal(viewerOpen(resizing), false);
    assert.equal(resizing.downloads.length, 1);
    resizing.setCoarse(true);
    resizing.press('downloadCard');
    await resizing.flush();
    assert.equal(viewerOpen(resizing), true, '改成觸控為主也跟著');
});

test('點小卡看大圖：用大圖的裝置上，點一下卡片就打開大圖；必填沒填完時只有圖與「關閉」，也不寫錯誤', async () => {
    const page = await createCardPage({ narrow: true, share: 'ok' });
    // 必填沒填完：照樣打開，只有圖與關閉（沒有下載檔案、分享），沒有驗證的錯誤、沒有 toast
    page.press('cardCanvas');
    await page.flush();
    assert.equal(viewerOpen(page), true);
    assert.match(page.$('viewerImage').getAttribute('src'), /^blob:/);
    assert.equal(page.$('viewerImage').getAttribute('alt'), '角色卡預覽：還沒填資料');
    assert.equal(page.$('viewerDownload').hidden, true);
    assert.equal(page.$('viewerShare').hidden, true);
    assert.equal(page.$('viewerClose').hidden, false);
    assert.deepEqual(shownErrors(page), []);
    assert.deepEqual(page.toasts, []);
    assert.deepEqual(page.downloads, []);
    assert.deepEqual(page.consoleErrors, []);
    assert.ok(page.$('imageViewer').contains(page.document.activeElement), '焦點在大圖裡');
    // 卡片不是按鈕：不能聚焦，沒有 role="button"、tabindex
    assert.equal(page.$('cardCanvas').getAttribute('role'), 'img');
    assert.equal(page.$('cardCanvas').hasAttribute('tabindex'), false);
    // 點的不是任何能聚焦的東西：關掉之後不硬把焦點拉到別的元素
    page.press('viewerClose');
    assert.equal(viewerOpen(page), false);
    assert.equal(page.document.activeElement, page.document.body);
    assert.equal(page.objectUrls.revoked.length, 0, '關掉的當下還沒撤銷');
    page.runTimeouts();
    assert.equal(page.objectUrls.revoked.length, 1, '過一陣子才撤銷');

    // 填好之後：下載檔案與分享都有
    fillRequired(page);
    page.press('cardCanvas');
    await page.flush();
    assert.equal(viewerOpen(page), true);
    assert.equal(page.$('viewerDownload').hidden, false);
    assert.equal(page.$('viewerDownload').getAttribute('download'), OUT_FILE);
    assert.equal(page.$('viewerDownload').getAttribute('href'), page.$('viewerImage').getAttribute('src'));
    assert.equal(page.$('viewerShare').hidden, false);
    assert.equal(page.$('viewerImage').getAttribute('alt'), '角色卡預覽：Luna Starweaver，Tiamat，繪靈法師 Lv 100');
    page.key('Escape');
    // 接著用下載圖片：大圖的按鈕又跟著這一次（沒有留著上一次的狀態）
    page.type('cardName', '');
    page.press('cardCanvas');
    await page.flush();
    assert.equal(page.$('viewerDownload').hidden, true, '名字清掉了，只有圖與關閉');
    assert.equal(page.$('viewerShare').hidden, true);

    // 電腦（寬螢幕、滑鼠）：點卡片什麼都不發生
    const desktop = await createCardPage();
    fillRequired(desktop);
    desktop.press('cardCanvas');
    await desktop.flush();
    assert.equal(viewerOpen(desktop), false);
    assert.equal(desktop.blobRequests().length, 0);
    assert.deepEqual(desktop.toasts, []);
    // 觸控為主的寬螢幕（平板）也算
    const tablet = await createCardPage({ coarse: true });
    tablet.press('cardCanvas');
    await tablet.flush();
    assert.equal(viewerOpen(tablet), true);
});

test('點小卡看大圖：調整圖片模式不開；拖曳移動了圖片之後放開的那一下 click 不開；沒移動（點一下）才開', async () => {
    const page = await createCardPage({ narrow: true, coarse: true });
    await upload(page, WIDE);
    // 調整模式（要在手指按下去之前設好 touch-action，所以按「調整圖片」的當下就進入）：卡片上的點與拖都是在調整圖片，不開大圖
    page.press('tab-image');
    page.press('imageAdjust');
    page.press('cardCanvas');
    await page.flush();
    assert.equal(viewerOpen(page), false, '調整模式不開大圖');
    assert.equal(page.blobRequests().length, 0);
    page.press('imageAdjust');
    page.press('cardCanvas');
    await page.flush();
    assert.equal(viewerOpen(page), true, '離開調整模式又能點');
    page.key('Escape');

    // 滑鼠：按下、移動超過幾個像素、放開，之後瀏覽器送的 click 是拖曳的收尾，不開大圖；下一次點才開
    const crop = () => JSON.stringify(saved(page).crops);
    const before = crop();
    page.drag([[300, 200], [340, 212]]);
    assert.notEqual(crop(), before, '圖片真的被拖動了');
    page.press('cardCanvas');
    await page.flush();
    assert.equal(viewerOpen(page), false, '拖曳之後的 click 不開');
    page.press('cardCanvas');
    await page.flush();
    assert.equal(viewerOpen(page), true, '只吃掉那一次 click');
    page.key('Escape');

    // 按下去再放開，沒有移動：是點一下，開大圖
    page.pointer('down', { x: 300, y: 200 });
    page.pointer('up', { x: 300, y: 200 });
    page.press('cardCanvas');
    await page.flush();
    assert.equal(viewerOpen(page), true, '沒移動的點一下');
    page.key('Escape');
    // 手抖了一兩個像素也是點一下
    page.pointer('down', { x: 300, y: 200 });
    page.pointer('move', { x: 301, y: 201 });
    page.pointer('up', { x: 301, y: 201 });
    page.press('cardCanvas');
    await page.flush();
    assert.equal(viewerOpen(page), true, '小小的抖動不算拖曳');
    page.key('Escape');

    // 拖曳之後放開的 click 沒送到卡片（放在卡片外面）：下一次按下去就把「拖曳過」的記號清掉，那一次點一下照開
    page.drag([[300, 200], [360, 220]]);
    page.pointer('down', { x: 300, y: 200 });
    page.pointer('up', { x: 300, y: 200 });
    page.press('cardCanvas');
    await page.flush();
    assert.equal(viewerOpen(page), true, '新的一次按下去，上一次拖曳的記號不留著');
    assert.deepEqual(page.consoleErrors, []);
});

// 沒填必填不分享；分享傳的是 PNG 檔與角色名稱（標題）；沒有 File 建構函式也不顯示
test('分享鈕只在支援時出現；取消不跳 toast、失敗跳 toast', async () => {
    // 不支援：沒有 navigator.share、canShare 不收檔案、沒有 File 建構函式
    for (const options of [{}, { share: 'no-files' }, { share: 'ok', fileConstructor: false }]) {
        const page = await createCardPage(options);
        assert.equal(page.$('shareCard').hidden, true, JSON.stringify(options));
    }
    const page = await createCardPage({ share: 'ok' });
    assert.equal(page.$('shareCard').hidden, false);
    assert.equal(page.$('shareCard').textContent, '分享');
    assert.equal(page.$('shareCard').classList.contains('btn-primary'), false, '主要按鈕只有下載圖片');

    // 必填沒填完：不產生、不分享，寫錯誤
    page.press('shareCard');
    await page.flush();
    assert.deepEqual(page.shareCalls, []);
    assert.equal(page.blobRequests().length, 0);
    assert.deepEqual(shownErrors(page), ['name', 'world', 'mainJob']);

    // 填好：分享一個 PNG 檔（檔名同下載），標題是角色名稱；分享成功不跳 toast，不開大圖
    fillRequired(page);
    page.press('shareCard');
    await page.flush();
    assert.equal(page.shares.length, 1);
    const [data] = page.shares;
    assert.equal(data.files.length, 1);
    assert.equal(data.files[0].name, OUT_FILE);
    assert.equal(data.files[0].type, 'image/png');
    assert.ok(data.files[0].size > 0);
    assert.equal(data.title, NAME);
    assert.deepEqual(page.toasts, []);
    assert.equal(viewerOpen(page), false);
    assert.deepEqual(page.downloads, []);
    assert.deepEqual(page.consoleErrors, []);

    // 使用者取消（AbortError）：什麼都不說
    const cancel = await createCardPage({ share: 'cancel' });
    fillRequired(cancel);
    cancel.press('shareCard');
    await cancel.flush();
    assert.equal(cancel.shareCalls.length, 1);
    assert.deepEqual(cancel.toasts, []);

    // 別的錯誤：告訴使用者，建議改用下載
    const fail = await createCardPage({ share: 'fail' });
    fillRequired(fail);
    fail.press('shareCard');
    await fail.flush();
    assert.equal(fail.shareCalls.length, 1);
    assert.deepEqual(messages(fail), ['沒辦法分享，請改用下載。']);
    assert.equal(fail.toasts[0].type, 'error');
    // 等字型的時候也一樣：載完才產生、才分享
    const slow = await createCardPage({ share: 'ok', fontsDelay: true });
    fillRequired(slow);
    slow.press('shareCard');
    await slow.flush();
    assert.equal(slow.blobRequests().length, 0);
    assert.deepEqual(slow.shareCalls, []);
    slow.releaseFonts();
    await slow.flush();
    assert.equal(slow.shares.length, 1);
    // 轉不成 PNG：說產生不出圖，不分享
    const broken = await createCardPage({ share: 'ok', blobFails: true });
    fillRequired(broken);
    broken.press('shareCard');
    await broken.flush();
    assert.deepEqual(broken.shareCalls, []);
    assert.deepEqual(messages(broken), [EXPORT_FAILED]);
});

// 底部的分享先等字型、圖示與截圖，再轉成 PNG，才呼叫 navigator.share；瀏覽器只在點擊之後的幾秒內收它，等太久就丟 NotAllowedError。
// 這時改開全螢幕大圖（同手機的下載），焦點在大圖的「分享」：在大圖裡再按一次是新的手勢，馬上分享已經做好的檔案
test('分享等太久、點擊的手勢過期了（NotAllowedError）：改開大圖，焦點在大圖的分享，toast 請再按一次；大圖裡一按就分享，不再產生一張', async () => {
    const page = await createCardPage({ share: 'expired', fontsDelay: true });
    fillRequired(page);
    page.press('shareCard');
    await page.flush();
    assert.deepEqual(page.shareCalls, [], '還在等字型');
    page.releaseFonts();
    await page.flush();
    assert.equal(page.shareCalls.length, 1, '字型載完才呼叫：這時點擊的手勢已經過期');
    assert.deepEqual(page.shares, []);
    assert.equal(viewerOpen(page), true, '改開大圖');
    assert.equal(page.$('viewerImage').getAttribute('src'), page.objectUrls.created.at(-1), '大圖是這一次產生的圖');
    assert.equal(page.isShown('viewerShare'), true);
    assert.equal(page.isShown('viewerDownload'), true, '必填都填了：也能下載檔案');
    isSame(page.document.activeElement, page.$('viewerShare'), '焦點在大圖的分享，鍵盤與螢幕閱讀器接著按');
    assert.deepEqual(messages(page), [SHARE_READY]);
    assert.equal(page.toasts[0].type, 'info');
    assert.equal(page.blobRequests().length, 1);

    // 在大圖裡按分享：新的手勢，同步分享做好的那個檔案，不再產生一張
    page.press('viewerShare');
    assert.equal(page.shareCalls.length, 2, '同步呼叫');
    await page.flush();
    assert.equal(page.shares.length, 1);
    assert.equal(page.shares[0].files[0].name, OUT_FILE);
    assert.equal(page.shares[0].files[0].type, 'image/png');
    assert.equal(page.shares[0].title, NAME);
    assert.equal(page.blobRequests().length, 1, '沒有再產生一張圖');
    assert.deepEqual(messages(page), [SHARE_READY], '分享成功不再說話');
    // 關掉大圖：焦點回到底部的分享（Safari 點按鈕不給焦點也一樣）
    page.press('viewerClose');
    assert.equal(viewerOpen(page), false);
    isSame(page.document.activeElement, page.$('shareCard'));
    assert.deepEqual(page.consoleErrors, []);

    // 大圖裡的分享也被拒絕（這裡不准分享，例如網頁放在不准分享的 iframe 裡）：說沒辦法分享，大圖照樣開著，還能下載檔案
    const blocked = await createCardPage({ narrow: true, share: 'blocked' });
    fillRequired(blocked);
    blocked.press('shareCard');
    await blocked.flush();
    assert.equal(viewerOpen(blocked), true);
    blocked.press('viewerShare');
    await blocked.flush();
    assert.deepEqual(messages(blocked), [SHARE_READY, '沒辦法分享，請改用下載。']);
    assert.equal(blocked.toasts[1].type, 'error');
    assert.equal(viewerOpen(blocked), true);
    assert.equal(blocked.isShown('viewerDownload'), true);
    assert.deepEqual(blocked.consoleErrors, []);
});

test('大圖裡的分享：馬上分享做好的檔案（同步呼叫 navigator.share，不再等字型，手勢還新鮮）；取消不說話、失敗跳 toast；大圖照樣開著', async () => {
    const page = await createCardPage({ narrow: true, share: 'ok', fontsDelay: true });
    fillRequired(page);
    page.releaseFonts();
    await page.flush();
    page.press('downloadCard');
    await page.flush();
    assert.equal(viewerOpen(page), true);
    // 字型又有新的在載（大圖開著時照理動不了，這裡硬動）：大圖裡的分享也不等，同步就呼叫了
    page.type('cardTitle', '光之戰士');
    assert.ok(page.heldFontBatches().length > 0);
    page.press('viewerShare');
    assert.equal(page.shareCalls.length, 1, '同步呼叫 navigator.share');
    assert.equal(page.blobRequests().length, 1, '沒有再產生一張圖');
    await page.flush();
    assert.equal(page.shares.length, 1);
    assert.equal(page.shares[0].files[0].name, OUT_FILE);
    assert.equal(page.shares[0].files[0].type, 'image/png');
    assert.equal(page.shares[0].title, NAME);
    assert.equal(viewerOpen(page), true, '分享之後大圖還開著');
    assert.deepEqual(page.toasts, []);

    const cancel = await createCardPage({ narrow: true, share: 'cancel' });
    fillRequired(cancel);
    cancel.press('downloadCard');
    await cancel.flush();
    cancel.press('viewerShare');
    await cancel.flush();
    assert.equal(cancel.shareCalls.length, 1);
    assert.deepEqual(cancel.toasts, []);

    const fail = await createCardPage({ narrow: true, share: 'fail' });
    fillRequired(fail);
    fail.press('downloadCard');
    await fail.flush();
    fail.press('viewerShare');
    await fail.flush();
    assert.deepEqual(messages(fail), ['沒辦法分享，請改用下載。']);
    assert.equal(viewerOpen(fail), true);
    // 連按兩下不會連續呼叫兩次（上一次還沒完成時 navigator.share 會丟 InvalidStateError）
    const twice = await createCardPage({ narrow: true, share: 'ok' });
    fillRequired(twice);
    twice.press('downloadCard');
    await twice.flush();
    twice.press('viewerShare');
    twice.press('viewerShare');
    await twice.flush();
    assert.equal(twice.shareCalls.length, 1);
    twice.press('viewerShare');
    await twice.flush();
    assert.equal(twice.shareCalls.length, 2, '做完了又能分享');
});

// 沒填必填不複製；圖轉不出來也是複製失敗
test('複製鈕只在支援時出現；成功與失敗的 toast', async () => {
    for (const options of [{}, { share: 'ok' }]) {
        const page = await createCardPage(options);
        assert.equal(page.$('copyCard').hidden, true, JSON.stringify(options));
    }
    const page = await createCardPage({ clipboard: 'ok' });
    assert.equal(page.$('copyCard').hidden, false);
    assert.equal(page.$('copyCard').textContent, '複製圖片');
    assert.equal(page.$('copyCard').classList.contains('btn-primary'), false);
    page.press('copyCard');
    await page.flush();
    assert.deepEqual(page.clipboardCalls, [], '必填沒填完，不碰剪貼簿');
    assert.deepEqual(shownErrors(page), ['name', 'world', 'mainJob']);

    fillRequired(page);
    page.press('copyCard');
    await page.flush();
    assert.equal(page.clipboardWrites.length, 1);
    assert.deepEqual(Object.keys(page.clipboardWrites[0][0]), ['image/png']);
    const blob = page.clipboardWrites[0][0]['image/png'];
    assert.equal(blob.type, 'image/png');
    assert.ok(blob.size > 0);
    assert.deepEqual(messages(page), ['已複製圖片']);
    assert.equal(page.toasts[0].type, undefined);
    assert.deepEqual(page.downloads, [], '複製不下載');
    assert.equal(viewerOpen(page), false);

    // 寫入被拒絕（沒給權限）：告訴使用者，建議改用下載
    const denied = await createCardPage({ clipboard: 'reject' });
    fillRequired(denied);
    denied.press('copyCard');
    await denied.flush();
    assert.deepEqual(messages(denied), ['沒辦法複製，請改用下載。']);
    assert.equal(denied.toasts[0].type, 'error');
    assert.deepEqual(denied.clipboardWrites, []);

    // 圖轉不出來：ClipboardItem 裡的 Promise 被拒絕，write 也被拒絕，一樣是複製失敗（不是產生不出圖）
    const broken = await createCardPage({ clipboard: 'ok', blobFails: true });
    fillRequired(broken);
    broken.press('copyCard');
    await broken.flush();
    assert.deepEqual(messages(broken), ['沒辦法複製，請改用下載。']);
    assert.deepEqual(broken.clipboardWrites, []);
    assert.deepEqual(broken.consoleErrors, []);
    // 失敗之後「忙」放掉了，又能複製
    broken.setBlobFails(false);
    broken.press('copyCard');
    await broken.flush();
    assert.equal(broken.clipboardWrites.length, 1);
});

test('複製：點擊的當下就把「還沒做好的圖」（Promise）交給 ClipboardItem 並呼叫 clipboard.write（Safari 要求在使用者手勢裡），圖做好了才寫進去', async () => {
    const page = await createCardPage({ clipboard: 'ok', fontsDelay: true });
    fillRequired(page);
    page.press('copyCard');
    // 同步：還沒有任何 await 回來
    assert.equal(page.clipboardCalls.length, 1, '同步呼叫 clipboard.write');
    const [item] = page.clipboardCalls[0];
    assert.ok(item instanceof page.window.ClipboardItem, '建的是 ClipboardItem');
    assert.deepEqual(item.types, ['image/png']);
    assert.equal(typeof item.data['image/png'].then, 'function', '交進去的是 Promise<Blob>，不是等圖做好才建');
    assert.deepEqual(page.clipboardWrites, [], '圖還沒做好，還沒寫進去');
    await page.flush();
    assert.equal(page.blobRequests().length, 0, '字型還沒載完，圖還沒產生');
    assert.deepEqual(page.clipboardWrites, []);
    assert.deepEqual(page.toasts, []);
    page.releaseFonts();
    await page.flush();
    assert.equal(page.blobRequests().length, 1);
    assert.equal(page.clipboardWrites.length, 1);
    assert.equal(page.clipboardWrites[0][0]['image/png'].type, 'image/png');
    assert.deepEqual(messages(page), ['已複製圖片']);
    assert.equal(page.clipboardCalls.length, 1, '只呼叫一次');

    // 等太久：逾時照目前的畫面產生，複製照樣成功，也說一聲字型還沒載完
    const slow = await createCardPage({ clipboard: 'ok', fontsDelay: true });
    fillRequired(slow);
    slow.press('copyCard');
    await slow.flush();
    slow.runTimeouts();
    await slow.flush();
    assert.equal(slow.clipboardWrites.length, 1);
    assert.deepEqual(messages(slow), [FONTS_SLOW, '已複製圖片']);
});

// 其他內建瀏覽器（Facebook、Instagram、Discord）沒有這個提示
test('LINE 的提示只在 LINE 出現，連結有 openExternalBrowser=1', async () => {
    const normal = await createCardPage();
    assert.equal(normal.$('lineTip').hidden, true);
    assert.equal(normal.$('cardActions').contains(normal.$('lineTip')), true, '提示在按鈕列裡，緊接在下載圖片的旁邊');

    const line = await createCardPage({ userAgent: LINE_UA, narrow: true });
    const tip = line.$('lineTip');
    assert.equal(tip.hidden, false);
    assert.equal(tip.textContent, '在 LINE 裡可能存不了圖，建議先用瀏覽器打開再填：用瀏覽器打開');
    const link = line.$('lineTipLink');
    assert.equal(link.tagName, 'A');
    assert.equal(link.textContent, '用瀏覽器打開');
    assert.equal(link.getAttribute('href'), 'https://ff14.tw/tools/character-card/index.html?openExternalBrowser=1');
    assert.ok(tip.contains(link));
    assert.equal(link.getAttribute('target'), null, '同一個分頁：LINE 看到參數會改用手機預設的瀏覽器打開');
    // 切換語言：兩段字都換
    line.setLang('en');
    assert.equal(tip.textContent, 'LINE may not save the picture. Open this page in your browser before you fill it in: Open in browser');
    line.setLang('ja');
    assert.equal(tip.textContent, 'LINEでは画像を保存できないことがあります。入力する前にブラウザで開いてください：ブラウザで開く');
    // LINE 裡手機的下載照樣用大圖
    fillRequired(line);
    line.press('downloadCard');
    await line.flush();
    assert.equal(viewerOpen(line), true);

    for (const userAgent of [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.37.108;]',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.34.105',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Discord/260.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    ]) {
        const other = await createCardPage({ userAgent, narrow: true });
        assert.equal(other.$('lineTip').hidden, true, userAgent);
    }
});

// #cardTool 的 .is-typing：文字欄、數字欄與文字框得到焦點時加上，離開時拿掉，欄位之間移動不拿掉；
// 選單（不開鍵盤，選完焦點還留在上面）、勾選、單選、滑桿、檔案、顏色與按鈕不算
test('手機打字時 .is-typing', async () => {
    const page = await createCardPage({ narrow: true });
    await upload(page);
    const tool = page.$('cardTool');
    assert.equal(isTyping(page), false);

    // 文字欄、數字欄、文字框：焦點進去就是在打字（鍵盤多半開著）
    page.app.selectTab('basic');
    for (const id of ['cardName', 'cardLevel']) {
        page.focus(id);
        assert.equal(isTyping(page), true, `#${id} 得到焦點`);
        page.focus('downloadCard');
        assert.equal(isTyping(page), false, `離開 #${id}（移到按鈕）`);
    }
    page.app.selectTab('profile');
    for (const id of ['cardTitle', 'cardFcName', 'cardFcTag', 'cardIntro', 'cardContact']) {
        page.focus(id);
        assert.equal(isTyping(page), true, `#${id} 得到焦點`);
        page.focus('downloadCard');
        assert.equal(isTyping(page), false);
    }
    // 選單不算：不開鍵盤（Android 與電腦的 Chrome 選完焦點還留在選單上），按鈕列要看得到
    page.app.selectTab('basic');
    for (const id of ['cardWorld', 'cardMainJob']) {
        page.focus(id);
        assert.equal(isTyping(page), false, `#${id}（選單）得到焦點`);
    }
    page.app.selectTab('profile');
    page.focus('cardGc');
    assert.equal(isTyping(page), false, '#cardGc（選單）得到焦點');
    // 焦點離開（失焦，沒有移到別的元素）也拿掉
    page.focus('cardContact');
    assert.equal(isTyping(page), true);
    page.document.activeElement.blur();
    assert.equal(isTyping(page), false);

    // 在兩個欄位之間移動（relatedTarget 是另一個欄位）：不拿掉再加上，一直是在打字
    page.app.selectTab('profile');
    page.focus('cardTitle');
    const original = tool.classList.remove.bind(tool.classList);
    let removed = 0;
    tool.classList.remove = (...tokens) => {
        removed += 1;
        return original(...tokens);
    };
    page.focus('cardFcName');
    page.focus('cardFcTag');
    page.focus('cardIntro');
    assert.equal(isTyping(page), true);
    assert.equal(removed, 0, '欄位之間移動時沒有拿掉過');
    // 從欄位移到不是欄位的東西（切換按鈕）：拿掉
    page.focus(page.chip('cardSubJobs', 'Paladin'));
    assert.equal(removed, 1);
    assert.equal(isTyping(page), false);
    tool.classList.remove = original;
    // 文字欄 → 選單：拿掉（選單不算）；選單 → 文字欄：又加上
    page.focus('cardTitle');
    assert.equal(isTyping(page), true);
    page.focus('cardGc');
    assert.equal(isTyping(page), false, '從文字欄移到選單');
    page.focus('cardIntro');
    assert.equal(isTyping(page), true, '從選單移到文字欄');
    page.document.activeElement.blur();
    assert.equal(isTyping(page), false);

    // 勾選框、單選、滑桿、檔案、顏色、按鈕、切換按鈕：不算在打字
    page.app.selectTab('play');
    page.focus('hours-weekday-evening');
    assert.equal(isTyping(page), false, '勾選框');
    page.focus(page.chip('cardLikes', 'msq'));
    assert.equal(isTyping(page), false, '切換按鈕');
    page.app.selectTab('style');
    page.focus('accentAuto');
    assert.equal(isTyping(page), false, '單選');
    page.focus('accentColor');
    assert.equal(isTyping(page), false, '顏色');
    page.focus('clearAll');
    assert.equal(isTyping(page), false, '按鈕');
    page.app.selectTab('image');
    page.focus('imageZoom');
    assert.equal(isTyping(page), false, '滑桿');
    page.focus('cardImageInput');
    assert.equal(isTyping(page), false, '檔案');
    page.focus('imageCenter');
    assert.equal(isTyping(page), false);

    // 文字相關的 input 類型都算：text、search、email、url、tel、number（沒寫 type 的也是 text）；其他不算
    const form = page.$('cardForm');
    const typeAs = (type) => {
        const input = page.document.createElement('input');
        if (type !== null) input.setAttribute('type', type);
        form.appendChild(input);
        return input;
    };
    for (const type of [null, 'text', 'search', 'email', 'url', 'tel', 'number', 'SEARCH']) {
        const input = typeAs(type);
        input.focus();
        assert.equal(isTyping(page), true, `type=${type}`);
        page.document.activeElement.blur();
        assert.equal(isTyping(page), false);
        input.remove();
    }
    for (const type of ['checkbox', 'radio', 'range', 'file', 'color', 'button', 'submit', 'reset', 'image', 'hidden', 'date']) {
        const input = typeAs(type);
        input.focus();
        assert.equal(isTyping(page), false, `type=${type}`);
        input.remove();
    }
    const textarea = page.document.createElement('textarea');
    form.appendChild(textarea);
    textarea.focus();
    assert.equal(isTyping(page), true, 'textarea');
    page.document.activeElement.blur();
    const select = page.document.createElement('select');
    form.appendChild(select);
    select.focus();
    assert.equal(isTyping(page), false, 'select 不算：不開鍵盤');
    page.document.activeElement.blur();
    assert.equal(isTyping(page), false);
    // 表單外面的欄位不管（預覽、頁首的東西）
    const outside = page.document.createElement('input');
    page.document.body.appendChild(outside);
    outside.focus();
    assert.equal(isTyping(page), false, '表單外面的欄位不算');

    // 必填沒填就按下載：焦點被程式移進第一個沒填的欄位，那也是在打字
    const empty = await createCardPage({ narrow: true });
    empty.press('downloadCard');
    isSame(empty.document.activeElement, empty.$('cardName'));
    assert.equal(isTyping(empty), true);
    // 名字填了、伺服器沒選：焦點被程式移進選單，選單不算在打字，按鈕列不會被收起來
    const noWorld = await createCardPage({ narrow: true });
    noWorld.type('cardName', NAME);
    noWorld.press('downloadCard');
    isSame(noWorld.document.activeElement, noWorld.$('cardWorld'));
    assert.equal(isTyping(noWorld), false);
});

// Android 與電腦的 Chrome：選完選單焦點還留在選單上，也沒有鍵盤開著。主職是最後一個必填欄位，選完之後 .is-typing 要是關著的，
// 手機最下方的「下載圖片」按鈕列才看得到（以前選單也算在打字，選完主職按鈕列一直收著，小卡也一直縮在 20vh）
test('選完選單（焦點還留在選單上）：.is-typing 是關著的，按鈕列看得到，下載圖片照常能按', async () => {
    const page = await createCardPage({ narrow: true });
    // 名字打完（鍵盤開著：按鈕列收起來），再去選伺服器：焦點一移到選單就不是在打字
    page.focus('cardName');
    page.type('cardName', NAME);
    assert.equal(isTyping(page), true, '打字中');
    page.focus('cardWorld');
    assert.equal(isTyping(page), false, '焦點移到選單');
    page.select('cardWorld', 'Tiamat');
    isSame(page.document.activeElement, page.$('cardWorld'), '選完焦點還留在選單上');
    assert.equal(isTyping(page), false, '選完伺服器');
    // 主職：最後一個必填欄位
    page.focus('cardMainJob');
    page.select('cardMainJob', 'Pictomancer');
    isSame(page.document.activeElement, page.$('cardMainJob'), '選完焦點還留在選單上');
    assert.equal(isTyping(page), false, '選完最後一個必填欄位：按鈕列要出現');
    assert.equal(page.isShown('cardActions'), true);
    assert.equal(page.window.CardState.validate(page.app.state).ok, true, '必填都填好了');
    // 選單裡再改選別的：還是不算打字
    page.select('cardMainJob', 'Paladin');
    assert.equal(isTyping(page), false);
    // 按鈕列只靠 .is-typing 收起來（見樣式的測試），所以現在按得到：下載圖片打開大圖
    page.press('downloadCard');
    await page.flush();
    assert.equal(viewerOpen(page), true);
    assert.deepEqual(page.consoleErrors, []);
});

// Safari：藏起有焦點的欄位時不一定送 focusout（Chrome 會把焦點丟到 body 並送 focusout）。手機打字到一半點分頁換到別組，
// 被藏起來的欄位還留著焦點的話，沒有人拿掉 .is-typing，按鈕列就一直收著。selectTab() 在藏起來之前先讓有焦點的欄位失去焦點
test('手機打字到一半換分頁（Safari 藏起欄位時不送 focusout）：焦點離開被藏起來的欄位，.is-typing 收掉', async () => {
    const page = await createCardPage({ narrow: true, hideKeepsFocus: true });
    page.press('tab-profile');
    page.focus('cardTitle');
    assert.equal(isTyping(page), true, '在名片分頁打字');
    // 點「基本」分頁（Safari 點按鈕不給焦點，焦點還在欄位上）
    page.press('tab-basic');
    assert.deepEqual(shownPanels(page), ['basic']);
    assert.equal(page.$('panel-profile').hidden, true);
    isSame(page.document.activeElement, page.document.body, '焦點離開了被藏起來的欄位，不留在看不到的欄位上');
    assert.equal(isTyping(page), false, '換分頁之後 .is-typing 收掉');

    // 鍵盤（左右鍵）換分頁：焦點本來就在分頁上，不是在打字
    page.focus('tab-basic');
    page.key('ArrowRight');
    assert.deepEqual(shownPanels(page), ['profile']);
    isSame(page.document.activeElement, page.$('tab-profile'));
    assert.equal(isTyping(page), false);

    // 再選同一組（焦點在這一組的欄位裡）：這一組沒有被藏起來，焦點與 .is-typing 都不動
    page.focus('cardIntro');
    assert.equal(isTyping(page), true);
    page.press('tab-profile');
    isSame(page.document.activeElement, page.$('cardIntro'), '同一組再選一次，焦點留在欄位上');
    assert.equal(isTyping(page), true);
    // 焦點在另一組的欄位裡、而那一組被藏起來：切過去之前先放掉焦點（選單也一樣：焦點離開，.is-typing 本來就是關著的）
    page.press('tab-basic');
    isSame(page.document.activeElement, page.document.body);
    assert.equal(isTyping(page), false);
    page.focus('cardWorld');
    page.press('tab-play');
    isSame(page.document.activeElement, page.document.body, '焦點在選單上，那一組被藏起來也先放掉焦點');
    assert.equal(isTyping(page), false);

    // 必填沒填就按下載（焦點還在名片分頁的欄位上，例如用鍵盤送出）：切到基本分頁、焦點移到第一個沒填的欄位，那是文字欄，所以又在打字
    page.press('tab-profile');
    page.focus('cardContact');
    assert.equal(isTyping(page), true);
    page.press('downloadCard');
    await page.flush();
    assert.deepEqual(shownPanels(page), ['basic']);
    isSame(page.document.activeElement, page.$('cardName'));
    assert.equal(isTyping(page), true);

    // 電腦：五組都顯示，沒有被藏起來的，焦點不動
    const desktop = await createCardPage({ hideKeepsFocus: true });
    desktop.focus('cardTitle');
    desktop.app.selectTab('basic');
    assert.deepEqual(shownPanels(desktop), TABS);
    isSame(desktop.document.activeElement, desktop.$('cardTitle'));
    assert.equal(isTyping(desktop), true);
    assert.deepEqual(page.consoleErrors, []);
});

// 上面的測試靠 hideKeepsFocus 模擬 Safari：預設（Chrome）藏起有焦點的元素時，焦點掉到 body、送 focusout；hideKeepsFocus 時什麼都不發生，
// 焦點與 activeElement 留在被藏起來的元素上，沒有 focusout。藏起來的元素 focus() 都拿不到焦點
test('頁面替身本身（hidden 與焦點）：藏起有焦點的元素時，預設掉到 body 並送 focusout，hideKeepsFocus 時焦點留著', async () => {
    for (const keeps of [false, true]) {
        const page = await createCardPage({ hideKeepsFocus: keeps });
        const events = [];
        page.$('cardForm').addEventListener('focusout', (event) => events.push(event.target.getAttribute('id')));
        page.focus('cardTitle');
        page.$('panel-profile').hidden = true;
        if (keeps) {
            isSame(page.document.activeElement, page.$('cardTitle'), 'hideKeepsFocus：焦點還在被藏起來的欄位上');
            assert.deepEqual(events, [], 'hideKeepsFocus：沒有 focusout');
        } else {
            isSame(page.document.activeElement, page.document.body, '預設：焦點掉到 body');
            assert.deepEqual(events, ['cardTitle'], '預設：送 focusout');
        }
        // 藏起來的元素 focus() 什麼都不做；藏起來的不是焦點所在的那一組不影響焦點
        page.focus('cardIntro');
        assert.notEqual(page.document.activeElement, page.$('cardIntro'), '藏起來的欄位拿不到焦點');
        page.focus('cardName');
        isSame(page.document.activeElement, page.$('cardName'));
        page.$('panel-play').hidden = true;
        isSame(page.document.activeElement, page.$('cardName'), '藏起來的是別組，焦點不動');
        // 拿掉 hidden 不影響焦點
        page.$('panel-profile').hidden = false;
        isSame(page.document.activeElement, page.$('cardName'));
    }
    // reopen 帶著 hideKeepsFocus；選項不是布林值就丟錯（拼錯字不會默默變成預設）
    const reopened = await (await createCardPage({ hideKeepsFocus: true })).reopen();
    reopened.focus('cardTitle');
    reopened.$('panel-profile').hidden = true;
    isSame(reopened.document.activeElement, reopened.$('cardTitle'), 'reopen 帶著 hideKeepsFocus');
    await assert.rejects(createCardPage({ hideKeepsFocus: 'yes' }), /hideKeepsFocus/);
});

// 唯一的主要按鈕是 #downloadCard；#cardActions 照下載、分享、複製、LINE 提示的順序；大圖裡的按鈕都不是主要按鈕
test('整頁只有一顆 .btn-primary', async () => {
    const page = await createCardPage();
    const primaries = [...HTML.matchAll(/<[a-zA-Z][^>]*\sclass="([^"]*)"[^>]*>/g)].filter((m) => m[1].split(/\s+/).includes('btn-primary'));
    assert.equal(primaries.length, 1, '整頁只有一個 .btn-primary');
    assert.ok(classesOf(tagAttrs(HTML, 'downloadCard')).includes('btn-primary'));
    assert.deepEqual(all(page.document, '.btn-primary').map((button) => button.getAttribute('id')), ['downloadCard']);
    assert.equal(page.$('downloadCard').textContent, '下載圖片');
    assert.equal(page.$('downloadCard').getAttribute('type'), 'button');
    assert.equal(page.$('downloadCard').hidden, false);
    assert.deepEqual(kids(page.$('cardActions')).map((node) => node.getAttribute('id')), ['downloadCard', 'shareCard', 'copyCard', 'lineTip']);
    // 預覽那一欄：卡片、版型、按鈕列
    assert.deepEqual(kids(page.$('cardPreview')).map((node) => node.getAttribute('id')), ['cardCanvas', null, 'cardActions']);
    // 分享、複製、LINE 的提示一開始是藏起來的（瀏覽器支援與 User-Agent 由 script.js 判斷）
    for (const id of ['shareCard', 'copyCard', 'lineTip', 'viewerDownload', 'viewerShare']) assert.equal(page.$(id).hidden, true, `#${id} 一開始 hidden`);
    assert.equal(page.$('viewerClose').hidden, false);

    // 大圖：role、aria-modal、名稱在遮罩層上，內層的 .dialog 是沒有 role 的一般容器；圖有 alt，按鈕是 type="button"
    const viewer = page.$('imageViewer');
    assert.deepEqual(classesOf(tagAttrs(HTML, 'imageViewer')), ['dialog-overlay', 'viewer-overlay']);
    assert.equal(viewer.getAttribute('role'), 'dialog');
    assert.equal(viewer.getAttribute('aria-modal'), 'true');
    assert.equal(page.$('viewerTitle').tagName, 'H2');
    assert.equal(viewer.firstElementChild.getAttribute('role'), null);
    assert.equal(page.$('viewerImage').tagName, 'IMG');
    assert.equal(page.$('viewerImage').hasAttribute('alt'), true);
    assert.equal(page.$('viewerDownload').hasAttribute('download'), true);
    assert.equal(page.$('viewerDownload').hasAttribute('href'), false, '網址由 script.js 照這一次的圖填');
    for (const id of ['viewerShare', 'viewerClose']) assert.equal(page.$(id).getAttribute('type'), 'button');
    assert.ok(!viewer.querySelector('.btn-primary'));
    assert.equal(viewerOpen(page), false, '一開始是關著的');
    assert.doesNotMatch(HTML, /style="/, '沒有內嵌樣式');
});

test('輸出失敗：轉不成 PNG 時說產生不出圖（不是下載成功），console 是空的', async () => {
    const page = await createCardPage({ blobFails: true });
    fillRequired(page);
    page.press('downloadCard');
    await page.flush();
    assert.deepEqual(page.downloads, []);
    assert.deepEqual(messages(page), [EXPORT_FAILED]);
    assert.equal(page.toasts[0].type, 'error');
    assert.deepEqual(page.consoleErrors, []);
    // 手機也一樣：不開空的大圖
    const phone = await createCardPage({ narrow: true, blobFails: true });
    fillRequired(phone);
    phone.press('downloadCard');
    await phone.flush();
    assert.equal(viewerOpen(phone), false);
    assert.deepEqual(messages(phone), [EXPORT_FAILED]);
    phone.press('cardCanvas');
    await phone.flush();
    assert.equal(viewerOpen(phone), false);
    assert.deepEqual(messages(phone), [EXPORT_FAILED, EXPORT_FAILED]);
    assert.deepEqual(phone.consoleErrors, []);
});

test('切換語言：大圖開著時標題、按鈕與圖的說明換成那個語言；之後的 toast 用新的語言；按鈕列與提示照語言', async () => {
    const page = await createCardPage({ narrow: true, share: 'ok', clipboard: 'ok', userAgent: LINE_UA });
    fillRequired(page);
    assert.deepEqual(['downloadCard', 'shareCard', 'copyCard'].map((id) => page.$(id).textContent), ['下載圖片', '分享', '複製圖片']);
    page.setLang('en');
    assert.deepEqual(['downloadCard', 'shareCard', 'copyCard'].map((id) => page.$(id).textContent), ['Download image', 'Share', 'Copy image']);
    page.setLang('ja');
    assert.deepEqual(['downloadCard', 'shareCard', 'copyCard'].map((id) => page.$(id).textContent), ['画像をダウンロード', '共有', '画像をコピー']);
    page.setLang('zh');

    page.press('downloadCard');
    await page.flush();
    assert.equal(viewerOpen(page), true);
    page.setLang('en');
    assert.equal(viewerOpen(page), true);
    assert.equal(page.$('viewerTitle').textContent, 'Press and hold the image to save it');
    assert.equal(page.$('viewerDownload').textContent, 'Download file');
    assert.equal(page.$('viewerShare').textContent, 'Share');
    assert.equal(page.$('viewerClose').textContent, 'Close');
    assert.equal(page.$('viewerImage').getAttribute('alt'), 'Character card preview: Luna Starweaver, Tiamat, Pictomancer Lv 100');
    assert.equal(page.$('viewerImage').getAttribute('alt'), page.$('cardCanvas').getAttribute('aria-label'));
    page.setLang('ja');
    assert.equal(page.$('viewerTitle').textContent, '画像を長押しして保存');
    assert.equal(page.$('viewerDownload').textContent, 'ファイルをダウンロード');
    assert.equal(page.$('viewerClose').textContent, '閉じる');
    assert.equal(page.$('viewerImage').getAttribute('alt'), page.$('cardCanvas').getAttribute('aria-label'));
    assert.match(page.$('viewerImage').getAttribute('alt'), /^キャラクターカードのプレビュー：/);
    page.key('Escape');

    // 之後的 toast（下載、分享失敗、複製）用新的語言
    const desktop = await createCardPage({ lang: 'en', clipboard: 'ok', share: 'fail' });
    fillRequired(desktop);
    desktop.press('downloadCard');
    await desktop.flush();
    desktop.press('shareCard');
    await desktop.flush();
    desktop.press('copyCard');
    await desktop.flush();
    assert.deepEqual(messages(desktop), [`Downloaded ${OUT_FILE}`, "Couldn't share. Please download instead.", 'Image copied']);
    desktop.setLang('ja');
    desktop.press('downloadCard');
    await desktop.flush();
    assert.equal(messages(desktop).at(-1), `${OUT_FILE} をダウンロードしました`);
});

test('輸出的樣式：手機的按鈕列固定在最下方（照 safe-area 加內距）、頁尾與回到頂部鈕不被蓋住、.is-typing 收起按鈕列並把預覽縮到 20vh；電腦在預覽下面；大圖不左右捲', () => {
    const phone = mediaBody('(max-width: 768px)');
    const desktop = mediaBody('(min-width: 769px)');

    // 手機（768px 以下）：按鈕列固定在畫面最下方，有不透明的底（要蓋住底下捲上來的欄位）、上框線，下內距加 safe-area（有瀏海與手勢列的手機）
    const bar = declarations('.preview-actions', phone);
    assert.match(bar, /position:\s*fixed/);
    assert.match(bar, /bottom:\s*0/);
    assert.match(bar, /left:\s*0/);
    assert.match(bar, /right:\s*0/);
    assert.match(bar, /padding:[^;]*env\(safe-area-inset-bottom/);
    assert.match(bar, /background:\s*var\(--color-surface\)/);
    assert.match(bar, /border-top:\s*1px solid var\(--color-border\)/);
    // 按鈕不被壓扁：height 有同值的 min-height；放不下的字不撐寬，兩顆按鈕平分一列
    const bigButton = declarations('.preview-actions .btn', phone);
    assert.match(bigButton, /height:\s*var\(--control-lg\)/);
    assert.match(bigButton, /min-height:\s*var\(--control-lg\)/);
    assert.match(bigButton, /flex:\s*1 1 auto/);
    assert.match(bigButton, /min-width:\s*0/);
    // 電腦與基本規則：按鈕列在預覽下面（同一欄，跟著 sticky 的預覽走），不是 fixed
    assert.doesNotMatch(declarations('.preview-actions', BASE_CSS), /position:/);
    assert.doesNotMatch(declarations('.preview-actions', desktop), /position:/);
    assert.match(declarations('.preview-actions', BASE_CSS), /display:\s*flex/);
    assert.match(declarations('.preview-actions', BASE_CSS), /flex-wrap:\s*wrap/);
    assert.doesNotMatch(CSS, /\.preview-actions:empty/, '按鈕列不再是空的');
    // 設計：手機最下方是「下載圖片」與「分享」，複製圖片是電腦的
    assert.match(declarations('#copyCard', phone), /display:\s*none/);

    // 頁面底部留出按鈕列那麼高：頁尾加下內距（頁尾的底色一路接到按鈕列底下），回到頂部鈕（共用的 .back-to-top 是 fixed，bottom: var(--space-5)）提高到按鈕列上面，
    // 捲動到焦點時也不會被按鈕列（下）與 sticky 的預覽（上）蓋住
    const root = declarations(':root', phone);
    assert.match(root, /--card-actions-height:\s*calc\([^;]*var\(--control-lg\)[^;]*env\(safe-area-inset-bottom/);
    assert.match(root, /scroll-padding-bottom:\s*var\(--card-actions-height\)/);
    assert.match(root, /scroll-padding-top:\s*calc\(35vh \+ var\(--space-10\)\)/);
    assert.match(declarations('.footer', phone), /padding-bottom:\s*calc\(var\(--space-6\) \+ var\(--card-actions-height\)\)/);
    assert.match(declarations('.back-to-top', phone), /bottom:\s*calc\(var\(--space-5\) \+ var\(--card-actions-height\)\)/);
    // 有 LINE 的提示（按鈕下面多兩行字）時按鈕列比較高
    const withTip = declarations(':root:has(#lineTip:not([hidden]))', phone);
    assert.match(withTip, /--card-actions-height:\s*calc\([^;]*var\(--space-8\)[^;]*env\(safe-area-inset-bottom/);

    // 手機打字（.is-typing，script.js 在文字欄得到焦點時加在 #cardTool 上）：按鈕列收起來，上方的卡片縮到 20vh；只在手機，電腦與基本規則沒有
    assert.match(declarations('.is-typing #cardActions', phone), /display:\s*none/);
    assert.match(declarations('.is-typing .preview-canvas', phone), /max-height:\s*20vh/);
    assert.match(declarations(':root:has(.is-typing)', phone), /scroll-padding-top:\s*calc\(20vh \+ var\(--space-10\)\)/);
    assert.match(declarations(':root:has(.is-typing)', phone), /scroll-padding-bottom:\s*0/);
    assert.doesNotMatch(BASE_CSS, /is-typing/);
    assert.doesNotMatch(desktop, /is-typing/);
    // 預覽原本的 35vh 還在基本規則裡（上面的測試守住）；.is-typing 的規則比它具體，排在它後面
    assert.ok(CSS.indexOf('.is-typing .preview-canvas') > CSS.indexOf('.preview-canvas {'));

    // 用 hidden 切換的元素（.btn 與 .form-text 設了 display，會蓋掉 [hidden]）：分享、複製、LINE 的提示、大圖裡的下載與分享
    for (const id of ['shareCard', 'copyCard', 'lineTip', 'viewerDownload', 'viewerShare']) {
        assert.match(declarations(`#${id}[hidden]`), /display:\s*none/, `#${id}[hidden] 要有 display: none`);
    }
    // LINE 的提示在按鈕列裡獨占一整列
    assert.match(declarations('.line-tip'), /flex:\s*1 0 100%/);

    // 大圖（全螢幕）：用共用的 .dialog-overlay / .dialog，預設藏起來、ModalManager 加 .active 才顯示；疊在頁首的 ☰（1002）與回到頂部鈕（--z-overlay）上面；
    // 圖縮到放得進畫面（不超過寬度與高度，不變形），沒有 overflow-x；長按存圖靠圖片本身，不能關掉圖片的觸控與選取
    assert.match(declarations('.viewer-overlay'), /display:\s*none/);
    assert.match(declarations('.viewer-overlay'), /z-index:\s*calc\(var\(--z-modal\) \+ 2\)/);
    assert.match(declarations('.viewer-overlay.active'), /display:\s*flex/);
    assert.match(declarations('.viewer'), /height:\s*100%/);
    assert.match(declarations('.viewer'), /width:\s*100%/);
    assert.match(declarations('.viewer'), /max-width:\s*none/);
    assert.match(declarations('.viewer'), /max-height:\s*none/);
    const image = declarations('.viewer-image');
    assert.match(image, /max-width:\s*100%/);
    assert.match(image, /max-height:\s*100%/);
    assert.match(image, /object-fit:\s*contain/);
    assert.doesNotMatch(image, /pointer-events|touch-callout|user-select|touch-action/);
    assert.match(declarations('.viewer-body'), /min-height:\s*0/);
    assert.match(declarations('.viewer-actions'), /padding-bottom:[^;]*env\(safe-area-inset-bottom/);
    assert.doesNotMatch(CSS, /overflow-x/);
});

test('頁面替身本身（輸出）：focusin、下載連結、分享與剪貼簿的同步記錄、File、toBlob、ModalManager', async () => {
    const page = await createCardPage({ share: 'ok', clipboard: 'ok' });

    // focus() 派送 focusin（冒泡）：relatedTarget 是剛失去焦點的元素（原本是 body 就是 null）；先 focusout 再 focusin，同一個元素再 focus() 什麼都不發生
    const events = [];
    const form = page.$('cardForm');
    for (const type of ['focusin', 'focusout']) {
        form.addEventListener(type, (event) => events.push([type, event.target.getAttribute('id'), event.relatedTarget ? event.relatedTarget.getAttribute('id') : null]));
    }
    page.focus('cardName');
    page.focus('cardTitle');
    page.focus('cardTitle');
    assert.deepEqual(events, [['focusin', 'cardName', null], ['focusout', 'cardName', 'cardTitle'], ['focusin', 'cardTitle', 'cardName']]);
    events.length = 0;
    page.document.activeElement.blur();
    assert.deepEqual(events, [['focusout', 'cardTitle', null]]);
    events.length = 0;
    page.$('cardTitle').disabled = true;
    page.focus('cardTitle');
    assert.deepEqual(events, [], 'disabled 的元素拿不到焦點，也沒有 focusin');
    page.$('cardTitle').disabled = false;

    // <a download href> 被點：接在文件上才記（Firefox 的規則）；沒有 download 或沒有 href 的連結不算；blob 是 object URL 對到的那一個
    const blob = new Blob(['png'], { type: 'image/png' });
    const url = page.window.URL.createObjectURL(blob);
    const link = page.document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'a.png');
    link.click();
    assert.deepEqual(page.downloads, [], '沒有接在文件上，點了沒有用');
    page.document.body.appendChild(link);
    link.click();
    assert.equal(page.downloads.length, 1);
    assert.deepEqual({ ...page.downloads[0], blob: null }, { file: 'a.png', href: url, blob: null });
    assert.equal(page.downloads[0].blob, blob);
    const plainLink = page.document.createElement('a');
    plainLink.setAttribute('href', url);
    page.document.body.appendChild(plainLink);
    plainLink.click();
    const noHref = page.document.createElement('a');
    noHref.setAttribute('download', 'b.png');
    page.document.body.appendChild(noHref);
    noHref.click();
    assert.equal(page.downloads.length, 1, '沒有 download 或沒有 href 的連結不是下載');
    const unknown = page.document.createElement('a');
    unknown.setAttribute('href', 'blob:https://ff14.tw/nope');
    unknown.setAttribute('download', 'c.png');
    page.document.body.appendChild(unknown);
    unknown.click();
    assert.equal(page.downloads[1].blob, null, '不是這份頁面建的網址，blob 是 null');

    // toBlob：呼叫的當下記下畫面（寬高、畫了幾次、畫了哪些字）；blobFails（或 setBlobFails）時 callback 收到 null
    const canvas = page.$('cardCanvas');
    let got = 'unset';
    canvas.toBlob((value) => { got = value; }, 'image/png');
    const [request] = page.blobRequests();
    assert.deepEqual({ ...request, texts: null }, { type: 'image/png', quality: undefined, width: 1200, height: 675, draws: page.drawCount(), texts: null });
    assert.deepEqual(request.texts, page.texts());
    assert.equal(got, 'unset');
    await page.flush();
    assert.equal(got.type, 'image/png');
    page.setBlobFails(true);
    canvas.toBlob((value) => { got = value; }, 'image/png');
    await page.flush();
    assert.equal(got, null);
    page.setBlobFails(false);
    const failing = await createCardPage({ blobFails: true });
    failing.$('cardCanvas').toBlob((value) => { got = value; });
    await failing.flush();
    assert.equal(got, null);
    const reopened = await failing.reopen();
    got = 'unset';
    reopened.$('cardCanvas').toBlob((value) => { got = value; });
    await reopened.flush();
    assert.equal(got, null, 'reopen 帶著 blobFails');

    // 分享：navigator.share 在呼叫的當下就記在 shareCalls（不管結果）；成功才記在 shares
    const calls = page.shareCalls.length;
    const sharing = page.window.navigator.share({ files: [1] });
    assert.equal(page.shareCalls.length, calls + 1, '同步記下');
    await sharing;
    assert.equal(page.shares.length, 1);
    const cancel = await createCardPage({ share: 'cancel' });
    const cancelled = cancel.window.navigator.share({ files: [1] });
    assert.equal(cancel.shareCalls.length, 1);
    await assert.rejects(cancelled, { name: 'AbortError' });
    assert.deepEqual(cancel.shares, []);
    // 'fail' 丟 NotAllowedError 以外的錯（DataError）；'blocked' 一律丟 NotAllowedError；
    // 'expired' 只有在 press() 那一下點擊裡同步呼叫的才成功，之後才呼叫的（先 await 了別的）丟 NotAllowedError
    const failShare = await createCardPage({ share: 'fail' });
    await assert.rejects(failShare.window.navigator.share({ files: [1] }), { name: 'DataError' });
    const blockedPage = await createCardPage({ share: 'blocked' });
    await assert.rejects(blockedPage.window.navigator.share({ files: [1] }), { name: 'NotAllowedError' });
    assert.deepEqual(blockedPage.shares, []);
    const expired = await createCardPage({ share: 'expired' });
    const nav = expired.window.navigator;
    const attempts = [];
    const button = expired.document.createElement('button');
    button.addEventListener('click', () => {
        attempts.push(nav.share({ files: ['now'] }));
        attempts.push(Promise.resolve().then(() => nav.share({ files: ['later'] })));
    });
    expired.document.body.appendChild(button);
    expired.press(button);
    const [inClick, afterAwait] = await Promise.allSettled(attempts);
    assert.equal(inClick.status, 'fulfilled', '點擊裡同步呼叫的成功');
    assert.equal(afterAwait.status, 'rejected');
    assert.equal(afterAwait.reason.name, 'NotAllowedError', '點擊之後才呼叫的：手勢過期了');
    await assert.rejects(nav.share({ files: ['outside'] }), { name: 'NotAllowedError' }, '不在任何點擊裡');
    assert.deepEqual(expired.shares.map((data) => data.files[0]), ['now']);

    // 剪貼簿：write() 在呼叫的當下記在 clipboardCalls（內容可能還是 Promise）；等每個 ClipboardItem 的內容都好了才記在 clipboardWrites；內容被拒絕時 write 也被拒絕、不記
    let resolveBlob;
    const later = new Promise((resolve) => { resolveBlob = resolve; });
    const item = new page.window.ClipboardItem({ 'image/png': later });
    assert.deepEqual(item.types, ['image/png']);
    const writing = page.window.navigator.clipboard.write([item]);
    assert.equal(page.clipboardCalls.length, 1);
    assert.equal(page.clipboardCalls[0][0], item);
    assert.deepEqual(page.clipboardWrites, []);
    resolveBlob(blob);
    await writing;
    assert.equal(page.clipboardWrites.length, 1);
    assert.equal(page.clipboardWrites[0][0]['image/png'], blob);
    await assert.rejects(page.window.navigator.clipboard.write([new page.window.ClipboardItem({ 'image/png': Promise.reject(new Error('no png')) })]), /no png/);
    assert.equal(page.clipboardWrites.length, 1);
    assert.equal(page.clipboardCalls.length, 2);

    // File：預設有（Node 的 File）；fileConstructor: false 時沒有
    const file = new page.window.File([blob], 'x.png', { type: 'image/png' });
    assert.deepEqual([file.name, file.type, file.size], ['x.png', 'image/png', 3]);
    assert.equal(typeof (await createCardPage({ fileConstructor: false })).window.File, 'undefined');

    // ModalManager 替身：show() 記下開啟前的焦點、加 .active、焦點移到第一個看得到的可聚焦元素（藏起來的跳過）；hide() 拿掉 .active、還原焦點，最後才呼叫 onClose；
    // Esc 與點遮罩本身（不是裡面的內容）關掉；已經開著的同一個元素再 show() 什麼都不做
    const viewer = page.$('imageViewer');
    const modal = new page.window.ModalManager();
    const closed = [];
    page.focus('downloadCard');
    modal.show(viewer, { onClose: () => closed.push(page.document.activeElement.getAttribute('id')) });
    assert.equal(viewerOpen(page), true);
    isSame(page.document.activeElement, page.$('viewerClose'), '下載檔案與分享藏著，第一個看得到的是關閉');
    modal.show(viewer);
    page.$('imageViewer').firstElementChild.click();
    assert.equal(viewerOpen(page), true, '點到裡面的內容不關');
    viewer.click();
    assert.equal(viewerOpen(page), false, '點遮罩本身關掉');
    assert.deepEqual(closed, ['downloadCard'], '先還原焦點再呼叫 onClose');
    modal.show(viewer);
    page.key('Escape');
    assert.equal(viewerOpen(page), false);
    modal.show(viewer, { closeOnEsc: false, closeOnOverlayClick: false });
    page.key('Escape');
    viewer.click();
    assert.equal(viewerOpen(page), true, '選項說不關就不關');
    modal.hide();
    modal.hide();
    assert.equal(viewerOpen(page), false);
});

test('輸出的翻譯：每個新的 char_card_* 鍵三語都有，zh 照規定的字（下載圖片、錯誤、長按的說明、LINE 的提示…）', () => {
    const values = Object.fromEntries(LANGS.map((lang) => [lang, translationValues(TRANSLATIONS, lang)]));
    const expected = {
        zh: {
            download: '下載圖片', share: '分享', copy: '複製圖片',
            error_name: '請填角色名稱', error_world: '請選伺服器', error_job: '請選主職',
            downloaded: '已下載 {file}', share_failed: '沒辦法分享，請改用下載。', copied: '已複製圖片', copy_failed: '沒辦法複製，請改用下載。',
            export_failed: '沒辦法產生圖片，請再試一次。', fonts_slow: '字型還沒載完，先用目前的畫面產生圖片。',
            image_slow: '上傳的截圖還在處理，先用目前的畫面產生圖片。', share_ready: '圖片做好了，請再按一次「分享」。',
            viewer_title: '長按圖片即可儲存', viewer_download: '下載檔案', viewer_close: '關閉',
            line_tip: '在 LINE 裡可能存不了圖，建議先用瀏覽器打開再填：', line_tip_link: '用瀏覽器打開'
        },
        en: {
            download: 'Download image', share: 'Share', copy: 'Copy image',
            error_name: 'Enter a character name', error_world: 'Choose a world', error_job: 'Choose a main job',
            downloaded: 'Downloaded {file}', share_failed: "Couldn't share. Please download instead.", copied: 'Image copied', copy_failed: "Couldn't copy. Please download instead.",
            export_failed: "Couldn't make the picture. Please try again.", fonts_slow: "Fonts are still loading, so the picture uses what's on screen now.",
            image_slow: "Your screenshot is still processing, so the picture uses what's on screen now.", share_ready: 'The picture is ready. Press Share again.',
            viewer_title: 'Press and hold the image to save it', viewer_download: 'Download file', viewer_close: 'Close',
            line_tip: 'LINE may not save the picture. Open this page in your browser before you fill it in: ', line_tip_link: 'Open in browser'
        },
        ja: {
            download: '画像をダウンロード', share: '共有', copy: '画像をコピー',
            error_name: 'キャラクター名を入力してください', error_world: 'ワールドを選んでください', error_job: 'メインジョブを選んでください',
            downloaded: '{file} をダウンロードしました', share_failed: '共有できませんでした。ダウンロードをお試しください。', copied: '画像をコピーしました', copy_failed: 'コピーできませんでした。ダウンロードをお試しください。',
            export_failed: '画像を作れませんでした。もう一度お試しください。', fonts_slow: 'フォントの読み込みが終わっていないため、今の表示のまま画像を作りました。',
            image_slow: 'スクリーンショットの処理が終わっていないため、今の表示のまま画像を作りました。', share_ready: '画像ができました。もう一度「共有」を押してください。',
            viewer_title: '画像を長押しして保存', viewer_download: 'ファイルをダウンロード', viewer_close: '閉じる',
            line_tip: 'LINEでは画像を保存できないことがあります。入力する前にブラウザで開いてください：', line_tip_link: 'ブラウザで開く'
        }
    };
    for (const lang of LANGS) {
        for (const [name, text] of Object.entries(expected[lang])) assert.equal(values[lang].get(`char_card_${name}`), text, `${lang} 的 char_card_${name}`);
    }
    // 大圖與按鈕列的 data-i18n 鍵都有人用（頁面上的字是翻譯檔的 zh；script.js 用到的鍵 tests 前面已經掃過）
    for (const key of ['download', 'share', 'copy', 'error_name', 'error_world', 'error_job', 'viewer_title', 'viewer_download', 'viewer_close', 'line_tip', 'line_tip_link']) {
        assert.ok(HTML.includes(`data-i18n="char_card_${key}"`), `index.html 用 char_card_${key}`);
    }
    for (const key of ['downloaded', 'share_failed', 'copied', 'copy_failed', 'export_failed', 'fonts_slow', 'image_slow', 'share_ready']) {
        assert.ok(SCRIPT.includes(`'char_card_${key}'`), `script.js 用 char_card_${key}`);
    }
});
