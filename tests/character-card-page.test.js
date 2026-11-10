const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createCardPage } = require('./helpers/card-page.js');
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
// 卡片背景的對角漸層停在重點色上（card-renderer.js 的 drawBackdrop）
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
        assert.equal(page.$(id).getAttribute('aria-describedby'), `${id}Count`);
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
    const page = await createCardPage({ stored: { [IMAGE_KEY]: 'data:image/jpeg;base64,AAAA' } });
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

test('index.html：腳本順序、標準字型連結＋Outfit、不載入 security-utils.js、沒有 innerHTML；style.css：沒有 overflow-x、沒有色碼、用 hidden 切換的元素都有 display: none', () => {
    // 腳本順序：i18n 三個、頁首頁尾與共用腳本（tools-registry.js 在 nav-template.js 前、layout-loader.js 在 common.js 前）、共用的遊戲資料與 ModalManager、
    // 這個工具的模組（card-image.js、card-export.js 是後面的 Task 才會有），最後是 script.js
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
        'card-renderer.js',
        'card-image.js',
        'card-export.js',
        'script.js'
    ];
    assert.deepEqual(scripts, ORDER.filter((src) => scripts.includes(src)), '腳本照規定的順序載入，沒有多的');
    for (const src of ORDER.filter((item) => !['card-image.js', 'card-export.js'].includes(item))) assert.ok(scripts.includes(src), `載入 ${src}`);
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
    for (const expected of ['card-state.js', 'card-layout.js', 'card-renderer.js', 'script.js']) {
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
    // 卡片上的時段用短標籤（英文的全名縮在卡片上看不清）
    assert.deepEqual(['char_card_card_day_weekday', 'char_card_card_day_weekend', 'char_card_card_slot_morning', 'char_card_card_slot_afternoon', 'char_card_card_slot_evening', 'char_card_card_slot_late_night'].map((key) => values.en.get(key)),
        ['Wkdy', 'Wknd', 'Morn', 'Aft', 'Eve', 'Late']);
    assert.deepEqual(['char_card_card_day_weekday', 'char_card_card_day_weekend', 'char_card_card_slot_morning', 'char_card_card_slot_afternoon', 'char_card_card_slot_evening', 'char_card_card_slot_late_night'].map((key) => values.ja.get(key)),
        ['平日', '休日', '朝', '昼', '夜', '深夜']);
});
