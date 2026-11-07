const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createDungeonPage } = require('./helpers/dungeon-page.js');
const { tagAttrs, sliceElementById } = require('./helpers/html-fragment.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const LANGS = ['zh', 'en', 'ja'];
const TRANSLATIONS = 'assets/js/i18n/translations/tools/dungeon-database.js';
const HTML = read('tools/dungeon-database/index.html');
const CSS = read('tools/dungeon-database/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
const DATA = JSON.parse(read('data/dungeons.json'));
const MOBILE_QUERY = '(max-width: 768px), (max-height: 500px)';

// 比較元素一律用 ===：assert.equal 失敗時會展開整份 fake-dom 而卡住不報錯，改成 === 加訊息才報得出來（同 mini-cactpot-page.test.js）
const isSame = (a, b, message) => assert.ok(a === b, message);
// index.html 裡含 id="…" 的開始標籤（含沒有值的布林屬性，tagAttrs 看不到它們）
const openTag = (id) => HTML.match(new RegExp(`<[a-zA-Z][\\w-]*\\b[^>]*\\sid="${id}"[^>]*>`))[0];
// source（預設是整份 style.css，@media 裡面的規則也算）裡選擇器清單含 selector 的每一條規則的宣告區，接在一起（找不到是空字串）
const declarations = (selector, source = CSS) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => rule[1].split(',').map((s) => s.trim()).includes(selector))
    .map((rule) => rule[2])
    .join('\n');
// style.css 裡每一個 @media：{ condition, body: 大括號裡面的規則, start, end }（大括號要對起來，裡面的規則沒有巢狀）
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
// 拿掉所有 @media 之後剩下的基本規則（從後面往前拿，前面的位置才不會跑掉）
const BASE_CSS = [...MEDIA].reverse().reduce((css, block) => css.slice(0, block.start) + css.slice(block.end), CSS);

const NAME = '叢林競流生息河岸';
const BISMARCK = '俾斯麥殲滅戰';
const BISMARCK_EX = '俾斯麥殲殛戰';
// 那一列詳情（按鈕的 aria-controls 指到的 div.dungeon-detail）裡的某一格（description、mechanics、drops、reward）。
// 不能從 li 往下找 [data-field]：列的按鈕裡的命中行（span.dungeon-hit）用同樣的 data-field（description、mechanics），而且排在詳情前面，
// 找到的會是命中行，詳情裡有沒有標示就沒人看了
const detailField = (page, name, key) => {
    const field = page.$(page.row(name).getAttribute('aria-controls')).querySelector(`.dungeon-field[data-field="${key}"]`);
    assert.ok(field, `「${name}」的詳情裡找不到 ${key} 這一格`);
    return field;
};

test('一打開：30 列、筆數、顯示更多與資料來源', async () => {
    const page = await createDungeonPage();
    const rows = page.rows();
    assert.equal(rows.length, 30);
    const { id, ...first } = rows[0];
    assert.equal(id, 283);
    assert.deepEqual(first, { name: NAME, type: '四人迷宮', version: '7.x 黃金之遺產', level: 'Lv91', expanded: false, hits: [] });
    assert.ok(rows.every((row) => row.version.startsWith('7.x ')), '前 30 列都是 7.x（版本由新到舊）');
    assert.equal(page.count(), '共 362 個副本');
    assert.equal(page.more(), '顯示更多（還有 332 個）');
    assert.equal(page.$('loading').hidden, true);
    assert.equal(page.$('dungeonList').hidden, false);
    assert.equal(page.$('loadError').hidden, true);
    assert.equal(page.$('dataCount').textContent, '資料包含 362 個副本，涵蓋從重生之境（2.x）到黃金之遺產（7.x）。感謝灰機Wiki社群的貢獻。');
    assert.equal(page.app.constructor.DATA_URL, '../../data/dungeons.json');
    assert.deepEqual([page.app.state.query, page.app.state.types.size, page.app.state.versions.size, page.app.state.shown, page.app.state.expanded.size], ['', 0, 0, 30, 0]);
    assert.deepEqual(page.consoleErrors, []);
});

test('一列的標記：按鈕、展開記號與詳情', async () => {
    const page = await createDungeonPage();
    const item = page.$('dungeonList').children[0];
    assert.equal(item.tagName, 'LI');
    assert.equal(item.className, 'dungeon-item');
    assert.equal(item.children.length, 2, 'li 裡只有按鈕和詳情');
    const [button, detail] = item.children;
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.getAttribute('type'), 'button');
    assert.equal(button.className, 'dungeon-row');
    assert.equal(button.id, 'dungeon-row-283');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.getAttribute('aria-controls'), 'dungeon-detail-283');
    assert.deepEqual(button.children.map((child) => [child.tagName, child.className]), [
        ['SPAN', 'dungeon-name'], ['SPAN', 'dungeon-type'], ['SPAN', 'dungeon-version'], ['SPAN', 'dungeon-level tag tag-primary'], ['SPAN', 'dungeon-chevron']
    ]);
    assert.equal(button.querySelector('.dungeon-chevron').getAttribute('aria-hidden'), 'true');

    assert.equal(detail.tagName, 'DIV');
    assert.equal(detail.className, 'dungeon-detail');
    assert.equal(detail.id, 'dungeon-detail-283');
    assert.equal(detail.hidden, true);
    assert.equal(detail.children.length, 1);
    const list = detail.children[0];
    assert.equal(list.tagName, 'DL');
    assert.equal(list.className, 'dungeon-fields');
    assert.deepEqual(list.children.map((field) => [field.tagName, field.className, field.dataset.field, field.children.map((part) => part.tagName).join(' ')]), [
        ['DIV', 'dungeon-field', 'description', 'DT DD'], ['DIV', 'dungeon-field', 'mechanics', 'DT DD'],
        ['DIV', 'dungeon-field', 'drops', 'DT DD'], ['DIV', 'dungeon-field', 'reward', 'DT DD']
    ]);
    const drops = list.children[2].querySelector('dd').children[0];
    assert.equal(drops.tagName, 'UL');
    assert.equal(drops.className, 'dungeon-drops');
    assert.deepEqual(drops.children.map((drop) => [drop.tagName, drop.className]), Array(4).fill(['LI', 'tag']));
});

test('顯示更多：再加 30 列，焦點移到新加的第一列', async () => {
    const page = await createDungeonPage();
    const list = page.$('dungeonList');
    const firstItem = list.children[0];
    page.$('showMore').focus();
    page.$('showMore').click();
    assert.equal(page.rows().length, 60);
    assert.equal(page.more(), '顯示更多（還有 302 個）');
    isSame(page.document.activeElement, page.row('阿卡狄亞零式登天鬥技場 輕量級3'), '焦點在新加的第一列的按鈕上');
    isSame(list.children[0], firstItem, '已經在的列沒有重畫');
    assert.equal(page.app.state.shown, 60);

    let clicks = 1;
    while (page.more() !== null) {
        assert.ok(clicks < 20, '12 次就要按完');
        page.$('showMore').click();
        clicks += 1;
    }
    assert.equal(clicks, 12);
    const names = page.rows().map((row) => row.name);
    assert.equal(names.length, 362);
    assert.equal(new Set(names).size, 362, '沒有重複的列');
    assert.equal(page.$('showMore').hidden, true);
    isSame(page.document.activeElement, page.row(names[360]), '最後一批的第一列拿到焦點');
    // 每一列的 aria-controls 都指到存在的詳情（收起來的），id 沒有重複
    const buttons = list.querySelectorAll('button.dungeon-row');
    assert.equal(new Set(buttons.map((button) => button.id)).size, 362);
    assert.ok(buttons.every((button) => page.$(button.getAttribute('aria-controls'))?.hidden === true), '每一列的詳情都在，而且收起來');
    assert.deepEqual(page.consoleErrors, []);

    // 沒有可加的列時，showMore() 什麼都不做
    page.app.showMore();
    assert.equal(page.rows().length, 362);
});

test('展開與收起', async () => {
    const page = await createDungeonPage();
    const button = page.row(NAME);
    const item = button.closest('li');
    assert.equal(page.detail(NAME), null);
    button.focus();
    button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(page.detail(NAME), {
        description: '充滿生命力的河流生態系統，萬物生息的和諧樂園。',
        mechanics: '在生機盎然的河流中戰鬥，與自然生物和諧共處。',
        drops: ['小小海牛', '九宮幻卡：瞌睡怪', '管弦樂琴樂譜：海牛逆流而上', '生息花叢'],
        reward: '黃金古典神典石 130',
        labels: ['簡介', '機制', '掉落物', '獎勵']
    });
    isSame(page.document.activeElement, button, '焦點留在同一個按鈕上');
    isSame(page.row(NAME), button, '按鈕還是同一個元素');
    isSame(page.row(NAME).closest('li'), item, 'li 還是同一個元素');
    assert.equal(page.rows().length, 30);
    assert.ok(page.app.state.expanded.has(283));

    button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(page.detail(NAME), null);
    isSame(page.document.activeElement, button, '收起之後焦點還在同一個按鈕上');
    isSame(page.row(NAME).closest('li'), item, '收起之後 li 還是同一個元素');
    assert.ok(!page.app.state.expanded.has(283));

    // 兩列可以同時展開
    const other = page.rows()[1].name;
    button.click();
    page.row(other).click();
    assert.deepEqual(page.rows().slice(0, 3).map((row) => row.expanded), [true, true, false]);
    assert.notEqual(page.detail(NAME), null);
    assert.notEqual(page.detail(other), null);

    // toggleRow() 和點那一列一樣；不在畫面上的副本什麼都不做
    page.app.toggleRow(283);
    assert.equal(page.rows()[0].expanded, false);
    page.app.toggleRow(283);
    assert.equal(page.rows()[0].expanded, true);
    page.app.toggleRow(999999);
    assert.ok(!page.app.state.expanded.has(999999));
    assert.deepEqual(page.consoleErrors, []);
});

test('點列裡面的字也能展開；點詳情不會收起', async () => {
    const page = await createDungeonPage();
    page.type('河岸');
    page.runTimeouts();
    page.row(NAME).querySelector('mark').click();
    assert.equal(page.rows()[0].expanded, true, '點名稱裡的 mark 也算點那一列');
    page.row(NAME).querySelector('.dungeon-level').click();
    assert.equal(page.rows()[0].expanded, false);
    page.row(NAME).click();
    detailField(page, NAME, 'description').querySelector('dd').click();
    assert.equal(page.rows()[0].expanded, true, '點詳情（選取文字）不收起');
});

test('獎勵與掉落物的空值', async () => {
    const page = await createDungeonPage();
    const eighth = page.rows()[7].name;
    assert.equal(eighth, '憶中金曦亞歷山德里亞');
    page.row(eighth).click();
    assert.equal(page.detail(eighth).reward, '黃金古典神典石 50 20');

    page.type('完成集團戰訓練');
    page.runTimeouts();
    assert.equal(page.rows().length, 1);
    const name = '完成集團戰訓練';
    page.row(name).click();
    const detail = page.detail(name);
    assert.deepEqual(detail.drops, []);
    assert.equal(detail.reward, '沒有神典石');
    const dd = detailField(page, name, 'drops').querySelector('dd');
    assert.equal(dd.textContent, '資料裡沒有特殊掉落物');
    assert.equal(dd.children.length, 1);
    assert.equal(dd.children[0].className, 'dungeon-none');
    assert.equal(dd.querySelector('ul'), null, '沒有掉落物時不畫空的清單');
});

test('搜尋：延遲、命中行與標示', async () => {
    const page = await createDungeonPage();
    page.type('俾斯麥');
    assert.equal(page.rows().length, 30, '還沒到延遲，列表不變');
    assert.equal(page.count(), '共 362 個副本');
    page.runTimeouts();
    assert.equal(page.count(), '找到 2 個副本');
    const byName = (name) => page.rows().find((row) => row.name === name);
    assert.equal(page.rows().length, 2);
    assert.deepEqual(byName(BISMARCK).hits, ['掉落：九宮幻卡：俾斯麥（還有 1 項也符合）']);
    assert.deepEqual(byName(BISMARCK_EX).hits, ['掉落：九宮幻卡：俾斯麥（還有 2 項也符合）', '簡介：俾斯麥的完全覺醒狀態，天空霸主的終極威嚴。']);
    const nameOf = (name) => page.row(name).querySelector('.dungeon-name');
    assert.deepEqual(page.marks(nameOf(BISMARCK)), ['俾斯麥']);
    assert.equal(nameOf(BISMARCK).textContent, BISMARCK, '名稱的文字不因為標示而變');
    // 命中行：欄位依掉落物、機制、簡介的順序，命中的字也標出來，標籤不標
    const hitLines = page.row(BISMARCK_EX).querySelectorAll('.dungeon-hit');
    assert.deepEqual(hitLines.map((line) => line.dataset.field), ['drop', 'description']);
    assert.deepEqual(hitLines.map((line) => page.marks(line)), [['俾斯麥'], ['俾斯麥']]);
    assert.equal(hitLines[0].querySelector('.dungeon-hit-label').textContent, '掉落：');
    assert.equal(hitLines[0].querySelector('.dungeon-hit-more').textContent, '（還有 2 項也符合）');
    assert.equal(hitLines[1].querySelector('.dungeon-hit-more'), null);

    page.type('浮空');
    page.runTimeouts();
    assert.equal(page.count(), '找到 2 個副本');
    assert.deepEqual(byName(BISMARCK_EX).hits, ['機制：極限模式的天空巨鯨，在浮空島嶼上進行終極對決。']);
    assert.deepEqual(page.marks(page.row(BISMARCK_EX).querySelector('.dungeon-hit')), ['浮空']);
    assert.equal(page.row(BISMARCK_EX).querySelector('.dungeon-hit').dataset.field, 'mechanics');

    page.type('河岸');
    page.runTimeouts();
    assert.equal(page.count(), '找到 1 個副本');
    assert.deepEqual(page.rows().map((row) => [row.name, row.hits]), [[NAME, []]]);
    assert.deepEqual(page.marks(page.row(NAME).querySelector('.dungeon-name')), ['河岸'], '只有名稱命中時，標在名稱上，不多寫行');

    page.type('  泥小點  ');
    page.runTimeouts();
    assert.equal(page.count(), '找到 1 個副本');
    assert.deepEqual(page.rows().map((row) => row.hits), [['掉落：泥小點']]);

    page.type('(');
    page.runTimeouts();
    assert.deepEqual(page.rows().map((row) => row.name), ['討伐大型妖異(注意無敵眷屬)']);
    assert.equal(page.count(), '找到 1 個副本');
    assert.deepEqual(page.marks(page.row('討伐大型妖異(注意無敵眷屬)').querySelector('.dungeon-name')), ['(']);

    page.type('   ');
    page.runTimeouts();
    assert.equal(page.count(), '共 362 個副本');
    assert.equal(page.rows().length, 30);
    assert.deepEqual(page.consoleErrors, []);
});

test('搜尋：不分大小寫；沒有符合時列表藏起來，筆數寫 0', async () => {
    const page = await createDungeonPage();
    page.type('SASTASHA');
    page.runTimeouts();
    assert.equal(page.count(), '找到 0 個副本');
    assert.equal(page.$('dungeonList').hidden, true);
    assert.equal(page.$('dungeonList').children.length, 0);
    assert.equal(page.$('showMore').hidden, true);
    assert.equal(page.$('loadError').hidden, true);

    page.setLang('en');
    assert.equal(page.count(), '0 dungeons found');
    page.setLang('ja');
    assert.equal(page.count(), '0 件見つかりました');
    assert.equal(page.$('dungeonList').hidden, true);

    page.type('');
    page.runTimeouts();
    assert.equal(page.count(), '全 362 件');
    assert.equal(page.$('dungeonList').hidden, false);
    assert.equal(page.rows().length, 30);
    assert.equal(page.more(), 'さらに表示（残り 332 件）');
    assert.deepEqual(page.consoleErrors, []);
});

test('搜尋套用時焦點在某一列上：那個副本還在就留在它的按鈕上，不在了也不出錯', async () => {
    const page = await createDungeonPage();
    page.row(NAME).focus();
    page.type('河岸');
    page.runTimeouts();
    isSame(page.document.activeElement, page.row(NAME), '搜尋後那個副本還在，焦點留在它的新按鈕上');

    page.type('泥小點');
    page.runTimeouts();
    assert.ok(!page.rows().some((row) => row.name === NAME));
    assert.equal(page.rows().length, 1);
    assert.ok(page.document.activeElement === page.document.body, '焦點所在的列不在了：沒有焦點可以放，也沒有東西丟錯');
    assert.deepEqual(page.consoleErrors, []);
});

test('搜尋：展開的列在搜尋時，詳情的簡介與掉落物裡的命中處也有 mark', async () => {
    const page = await createDungeonPage();
    page.type('俾斯麥');
    page.runTimeouts();
    page.row(BISMARCK_EX).click();
    // 都是詳情裡的那一格（不是列上的命中行），標示不改變文字
    assert.deepEqual(page.marks(detailField(page, BISMARCK_EX, 'description')), ['俾斯麥']);
    assert.deepEqual(page.marks(detailField(page, BISMARCK_EX, 'mechanics')), []);
    assert.deepEqual(page.marks(detailField(page, BISMARCK_EX, 'drops')), ['俾斯麥', '俾斯麥', '俾斯麥']);
    const detail = page.detail(BISMARCK_EX);
    assert.equal(detail.description, '俾斯麥的完全覺醒狀態，天空霸主的終極威嚴。');
    assert.equal(detail.mechanics, '極限模式的天空巨鯨，在浮空島嶼上進行終極對決。');
    assert.deepEqual(detail.drops, ['白雲獵鷹笛', '九宮幻卡：俾斯麥', '陳舊的樂譜：無盡蒼空', '陳舊的樂譜：災厄狂起', '俾斯麥之角', '俾斯麥魔角']);
});

test('搜尋：先展開、再換搜尋字，詳情的機制命中處標出來、舊的標示拿掉；搜尋字清掉後標示全拿掉', async () => {
    const page = await createDungeonPage();
    page.type('俾斯麥');
    page.runTimeouts();
    page.row(BISMARCK_EX).click();

    // 換搜尋字：展開的列還是展開的，詳情重畫成新的標示（機制命中「浮空」，簡介與掉落物不再命中）
    page.type('浮空');
    page.runTimeouts();
    assert.notEqual(page.detail(BISMARCK_EX), null, '展開的列還是展開的');
    assert.deepEqual(page.marks(detailField(page, BISMARCK_EX, 'mechanics')), ['浮空']);
    assert.deepEqual(page.marks(detailField(page, BISMARCK_EX, 'description')), [], '舊搜尋字的標示拿掉了');
    assert.deepEqual(page.marks(detailField(page, BISMARCK_EX, 'drops')), []);

    // 搜尋字清掉：沒有搜尋時這一列在第 30 列之後（3.x），按「顯示更多」列出來之後還是展開的，沒有標示
    page.type('');
    page.runTimeouts();
    assert.ok(!page.rows().some((row) => row.name === BISMARCK_EX), '清掉搜尋之後，這一列在第一批之外');
    for (let clicks = 0; clicks < 20 && !page.rows().some((row) => row.name === BISMARCK_EX); clicks += 1) page.$('showMore').click();
    assert.notEqual(page.detail(BISMARCK_EX), null);
    assert.deepEqual(page.marks(page.row(BISMARCK_EX).closest('li')), []);
});

test('搜尋延遲 300 毫秒，後一次取代前一次', async () => {
    const page = await createDungeonPage();
    assert.equal(page.app.constructor.SEARCH_DELAY, 300);
    page.type('a');
    assert.deepEqual(page.pendingDelays(), [300]);
    page.type('俾斯麥');
    assert.deepEqual(page.pendingDelays(), [300], '前一個計時器清掉了，只剩一個');
    page.runTimeouts();
    assert.equal(page.count(), '找到 2 個副本');
    assert.deepEqual(page.pendingDelays(), []);
    assert.equal(page.app.state.query, '俾斯麥');
});

test('篩選：或／且、按鈕狀態、回到 30 列、展開保留', async () => {
    const page = await createDungeonPage();
    const alliance = page.chip('聯盟任務');
    assert.equal(alliance.getAttribute('aria-pressed'), 'false');
    alliance.click();
    assert.equal(page.count(), '找到 16 個副本');
    assert.equal(alliance.getAttribute('aria-pressed'), 'true');
    assert.ok(alliance.classList.contains('active'));
    assert.equal(page.rows().length, 16);
    assert.equal(page.more(), null);
    page.chip('7.x').click();
    assert.equal(page.count(), '找到 1 個副本');
    assert.deepEqual(page.rows().map((row) => row.name), ['朱諾：第一巡行']);
    assert.equal(page.chip('7.x').getAttribute('aria-pressed'), 'true');
    page.chip('7.x').click();
    page.chip('聯盟任務').click();
    assert.equal(page.count(), '共 362 個副本');
    assert.equal(page.chip('聯盟任務').getAttribute('aria-pressed'), 'false');
    assert.ok(!page.chip('聯盟任務').classList.contains('active'));

    // 同一組是「或」
    page.chip('四人迷宮').click();
    page.chip('公會令').click();
    assert.equal(page.count(), '找到 114 個副本');
    assert.equal(page.rows().length, 30);
    assert.equal(page.more(), '顯示更多（還有 84 個）');

    // 按過顯示更多再換條件：回到 30 列
    page.$('showMore').click();
    assert.equal(page.rows().length, 60);
    page.chip('8人大型任務').click();
    assert.equal(page.count(), '找到 243 個副本');
    assert.equal(page.rows().length, 30, '條件一變就回到 30 列');
    assert.equal(page.more(), '顯示更多（還有 213 個）');
    page.chip('8人大型任務').click();
    assert.equal(page.count(), '找到 114 個副本');

    // 展開的列被篩掉再篩回來，還是展開的
    page.row(NAME).click();
    page.chip('6.x').click();
    assert.ok(!page.rows().some((row) => row.name === NAME), '7.x 的列被 6.x 篩掉了');
    page.chip('6.x').click();
    assert.equal(page.rows().find((row) => row.name === NAME).expanded, true);
    assert.notEqual(page.detail(NAME), null);
    assert.deepEqual(page.consoleErrors, []);
});

test('篩選：按鈕立刻套用搜尋框現在的字，取消還沒跑的延遲搜尋', async () => {
    const page = await createDungeonPage();
    page.type('俾斯麥');
    assert.deepEqual(page.pendingDelays(), [300]);
    page.chip('8人討伐殲滅戰').click();
    assert.equal(page.count(), '找到 2 個副本', '搜尋與篩選一起算');
    assert.deepEqual(page.pendingDelays(), [], '還沒跑的延遲搜尋取消了');
    page.runTimeouts();
    assert.equal(page.count(), '找到 2 個副本');

    // 清除篩選也一樣：搜尋框新打的字立刻算進去，篩選清掉
    page.type('泥小點');
    page.$('clearFilters').click();
    assert.equal(page.count(), '找到 1 個副本');
    assert.deepEqual(page.pendingDelays(), []);
    assert.equal(page.$('searchInput').value, '泥小點', '清除篩選不清搜尋字');
});

test('清除篩選', async () => {
    const page = await createDungeonPage();
    const clear = page.$('clearFilters');
    assert.equal(clear.getAttribute('aria-disabled'), 'true');
    clear.focus();
    clear.click();
    assert.equal(page.count(), '共 362 個副本');
    assert.equal(page.rows().length, 30);
    assert.equal(clear.getAttribute('aria-disabled'), 'true');
    isSame(page.document.activeElement, clear, '不能按的時候焦點還在按鈕上');

    page.type('零式');
    page.runTimeouts();
    const searchOnly = page.count();
    assert.match(searchOnly, /^找到 \d+ 個副本$/);
    page.chip('絕境戰').click();
    page.chip('2.x').click();
    assert.equal(clear.getAttribute('aria-disabled'), 'false');
    assert.notEqual(page.count(), searchOnly);
    clear.focus();
    clear.click();
    assert.equal(page.chip('絕境戰').getAttribute('aria-pressed'), 'false');
    assert.equal(page.chip('2.x').getAttribute('aria-pressed'), 'false');
    assert.ok(!page.chip('絕境戰').classList.contains('active') && !page.chip('2.x').classList.contains('active'));
    assert.equal(page.count(), searchOnly, '只清篩選，搜尋照舊');
    assert.equal(page.$('searchInput').value, '零式', '只清篩選，不清搜尋字');
    assert.equal(clear.getAttribute('aria-disabled'), 'true');
    isSame(page.document.activeElement, clear, '焦點留在清除篩選上');

    page.type('');
    page.runTimeouts();
    page.chip('聯盟任務').click();
    clear.click();
    assert.equal(page.count(), '共 362 個副本');
    assert.deepEqual(page.consoleErrors, []);
});

test('手機：篩選收進一顆按鈕，文字寫選了幾個，點一下展開、再點收起', async () => {
    const page = await createDungeonPage({ mobile: true });
    assert.equal(page.app.constructor.MOBILE_QUERY, MOBILE_QUERY);
    const toggle = page.$('filterToggle');
    const collapsed = () => page.$('filterCard').classList.contains('is-collapsed');
    assert.equal(toggle.textContent, '篩選');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.getAttribute('aria-controls'), 'filterPanel');
    assert.ok(collapsed(), '一打開是收起的');
    assert.equal(page.app.state.filtersOpen, false);

    toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(!collapsed());
    assert.equal(page.app.state.filtersOpen, true);
    assert.equal(toggle.textContent, '篩選', '還沒選篩選，只寫「篩選」');

    page.chip('四人迷宮').click();
    assert.equal(toggle.textContent, '篩選（1）');
    page.chip('7.x').click();
    assert.equal(toggle.textContent, '篩選（2）');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true', '選篩選不會把面板收起來');
    assert.ok(!collapsed());

    toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.ok(collapsed());
    assert.equal(page.app.state.filtersOpen, false);
    assert.equal(toggle.textContent, '篩選（2）', '收起來之後數字還在');
    assert.equal(page.count(), '找到 10 個副本', '收起面板不影響已套用的篩選');

    toggle.click();
    page.chip('四人迷宮').click();
    assert.equal(toggle.textContent, '篩選（1）', '取消一個，數字少一');
    page.chip('7.x').click();
    assert.equal(toggle.textContent, '篩選', '全部取消，回到只寫「篩選」');
    assert.equal(page.count(), '共 362 個副本');
    assert.deepEqual(page.consoleErrors, []);
});

test('手機：「篩選」按鈕的文字與數字跟著語言，開合不變', async () => {
    for (const [lang, plain, counted] of [['en', 'Filters', 'Filters (2)'], ['ja', '絞り込み', '絞り込み（2）']]) {
        const page = await createDungeonPage({ lang, mobile: true });
        assert.equal(page.$('filterToggle').textContent, plain, `${lang}：沒選篩選`);
        page.chip('四人迷宮').click();
        page.chip('7.x').click();
        assert.equal(page.$('filterToggle').textContent, counted, `${lang}：選了兩個`);
    }

    // 換語言時頁面先照 data-i18n 重新翻譯（按鈕變成沒有數字的字），語言監聽再重畫：數字與開合都留著
    const page = await createDungeonPage({ mobile: true });
    page.$('filterToggle').click();
    page.chip('四人迷宮').click();
    page.chip('7.x').click();
    page.setLang('en');
    assert.equal(page.$('filterToggle').textContent, 'Filters (2)');
    assert.equal(page.$('filterToggle').getAttribute('aria-expanded'), 'true');
    assert.ok(!page.$('filterCard').classList.contains('is-collapsed'));
    page.setLang('ja');
    assert.equal(page.$('filterToggle').textContent, '絞り込み（2）');
    page.setLang('zh');
    assert.equal(page.$('filterToggle').textContent, '篩選（2）');
    assert.deepEqual(page.consoleErrors, []);
});

test('跨過斷點變成手機版面：焦點在篩選面板裡就展開，其餘維持收起', async () => {
    const inPanel = await createDungeonPage({ mobile: false });
    const chip = inPanel.chip('四人迷宮');
    chip.focus();
    isSame(inPanel.document.activeElement, chip, '前提：焦點在面板裡的按鈕上');
    inPanel.setMobile(true);
    assert.equal(inPanel.$('filterToggle').getAttribute('aria-expanded'), 'true');
    assert.ok(!inPanel.$('filterCard').classList.contains('is-collapsed'));
    assert.equal(inPanel.app.state.filtersOpen, true);
    isSame(inPanel.document.activeElement, chip, '焦點還在那顆按鈕上');
    inPanel.setMobile(false);
    assert.equal(inPanel.$('filterToggle').getAttribute('aria-expanded'), 'true', '變回電腦版面不改開合');
    inPanel.$('searchInput').focus();
    inPanel.setMobile(true);
    assert.equal(inPanel.$('filterToggle').getAttribute('aria-expanded'), 'true', '焦點不在面板裡，再變成手機版面也不會收起，開合是記著的');

    // 面板裡的「清除篩選」也算面板裡
    const inClear = await createDungeonPage({ mobile: false });
    inClear.$('clearFilters').focus();
    inClear.setMobile(true);
    assert.equal(inClear.$('filterToggle').getAttribute('aria-expanded'), 'true');
    isSame(inClear.document.activeElement, inClear.$('clearFilters'));

    // 焦點在搜尋框（面板外）：照舊收起，焦點不動
    const inSearch = await createDungeonPage({ mobile: false });
    inSearch.$('searchInput').focus();
    inSearch.setMobile(true);
    assert.equal(inSearch.$('filterToggle').getAttribute('aria-expanded'), 'false');
    assert.ok(inSearch.$('filterCard').classList.contains('is-collapsed'));
    assert.equal(inSearch.app.state.filtersOpen, false);
    isSame(inSearch.document.activeElement, inSearch.$('searchInput'));

    // 沒有焦點：照舊收起
    const nowhere = await createDungeonPage({ mobile: false });
    nowhere.setMobile(true);
    assert.equal(nowhere.$('filterToggle').getAttribute('aria-expanded'), 'false');
    assert.deepEqual(inPanel.consoleErrors.concat(inClear.consoleErrors, inSearch.consoleErrors, nowhere.consoleErrors), []);
});

test('找不到：標題與按鈕照條件，清除搜尋與清除篩選都把焦點放回搜尋框', async () => {
    const page = await createDungeonPage();
    const none = page.$('noResults');
    const title = () => page.$('noResultsTitle').textContent;
    // [清除搜尋, 清除篩選] 各自有沒有顯示
    const shown = () => [!page.$('clearSearch').hidden, !page.$('clearFiltersEmpty').hidden];
    assert.equal(none.hidden, true, '有副本的時候不顯示');

    // 只有搜尋字
    page.type('Sastasha');
    page.runTimeouts();
    assert.equal(none.hidden, false);
    assert.equal(title(), '找不到符合「Sastasha」的副本');
    assert.deepEqual(shown(), [true, false]);
    assert.equal(page.count(), '找到 0 個副本');
    assert.equal(page.$('dungeonList').hidden, true);
    assert.equal(page.$('showMore').hidden, true);
    page.$('clearSearch').focus();
    page.$('clearSearch').click();
    assert.equal(page.$('searchInput').value, '');
    assert.equal(page.count(), '共 362 個副本');
    assert.equal(none.hidden, true);
    assert.equal(page.$('dungeonList').hidden, false);
    assert.equal(page.rows().length, 30);
    isSame(page.document.activeElement, page.$('searchInput'), '按鈕隨空狀態收起，焦點回到搜尋框');

    // 只有篩選
    page.chip('絕境戰').click();
    page.chip('2.x').click();
    assert.equal(none.hidden, false);
    assert.equal(title(), '找不到符合條件的副本');
    assert.deepEqual(shown(), [false, true]);
    assert.equal(page.count(), '找到 0 個副本');
    page.$('clearFiltersEmpty').focus();
    page.$('clearFiltersEmpty').click();
    assert.equal(page.chip('絕境戰').getAttribute('aria-pressed'), 'false');
    assert.equal(page.chip('2.x').getAttribute('aria-pressed'), 'false');
    assert.ok(!page.chip('絕境戰').classList.contains('active') && !page.chip('2.x').classList.contains('active'));
    assert.equal(page.count(), '共 362 個副本');
    assert.equal(none.hidden, true);
    isSame(page.document.activeElement, page.$('searchInput'), '焦點回到搜尋框');

    // 搜尋字與篩選都有：標題寫搜尋字，兩顆按鈕都在
    page.type('Sastasha');
    page.runTimeouts();
    page.chip('四人迷宮').click();
    assert.equal(none.hidden, false);
    assert.equal(title(), '找不到符合「Sastasha」的副本');
    assert.deepEqual(shown(), [true, true]);
    // 只清篩選：搜尋字還在，還是找不到，只剩「清除搜尋」
    page.$('clearFiltersEmpty').click();
    assert.equal(page.chip('四人迷宮').getAttribute('aria-pressed'), 'false');
    assert.equal(page.$('searchInput').value, 'Sastasha', '只清篩選，不清搜尋字');
    assert.equal(none.hidden, false);
    assert.equal(title(), '找不到符合「Sastasha」的副本');
    assert.deepEqual(shown(), [true, false]);
    isSame(page.document.activeElement, page.$('searchInput'));
    page.$('clearSearch').click();
    assert.equal(none.hidden, true);
    assert.equal(page.count(), '共 362 個副本');

    // 有結果的搜尋或篩選不顯示
    page.type('俾斯麥');
    page.runTimeouts();
    page.chip('8人討伐殲滅戰').click();
    assert.equal(page.count(), '找到 2 個副本');
    assert.equal(none.hidden, true);
    assert.deepEqual(page.consoleErrors, []);
});

test('找不到：標題的搜尋字用搜尋框去掉前後空白的原字，三種語言', async () => {
    const page = await createDungeonPage();
    const title = () => page.$('noResultsTitle').textContent;
    page.type('  SASTASHA  ');
    page.runTimeouts();
    assert.equal(title(), '找不到符合「SASTASHA」的副本', '去掉前後空白、不轉小寫');
    assert.equal(page.$('clearSearch').textContent, '清除搜尋');
    assert.equal(page.$('clearFiltersEmpty').textContent, '清除篩選');

    page.setLang('en');
    assert.equal(title(), 'No dungeons match "SASTASHA"');
    assert.equal(page.$('clearSearch').textContent, 'Clear search');
    assert.equal(page.$('clearFiltersEmpty').textContent, 'Clear filters');
    assert.equal(page.count(), '0 dungeons found');
    page.setLang('ja');
    assert.equal(title(), '「SASTASHA」に一致するダンジョンはありません');
    assert.equal(page.$('clearSearch').textContent, '検索をクリア');
    assert.equal(page.$('clearFiltersEmpty').textContent, '絞り込みを解除');

    // 英文開著一打開就找不到：標題與按鈕都是英文
    const en = await createDungeonPage({ lang: 'en' });
    en.type('Sastasha');
    en.runTimeouts();
    assert.equal(en.$('noResultsTitle').textContent, 'No dungeons match "Sastasha"');
    assert.equal(en.$('clearSearch').textContent, 'Clear search');
    assert.equal(en.count(), '0 dungeons found');

    // 只有篩選時的標題是原有的 dungeon_db_no_results
    page.type('');
    page.runTimeouts();
    page.chip('絕境戰').click();
    page.chip('2.x').click();
    assert.equal(title(), '条件に一致するダンジョンが見つかりません');
    page.setLang('en');
    assert.equal(title(), 'No dungeons found matching your criteria');
    page.setLang('zh');
    assert.equal(title(), '找不到符合條件的副本');

    // 搜尋字是文字，不會被當成標記，也不會碰 {參數}
    page.chip('絕境戰').click();
    page.chip('2.x').click();
    for (const query of ['<b>x</b>', '{count} $& {query}']) {
        page.type(query);
        page.runTimeouts();
        assert.equal(title(), `找不到符合「${query}」的副本`);
        assert.equal(page.$('noResultsTitle').children.length, 0, '標題裡只有文字');
    }
    assert.deepEqual(page.consoleErrors, []);
});

test('找不到：只在載入完、真的沒有符合時顯示；載入失敗只顯示錯誤訊息', async () => {
    const page = await createDungeonPage({ fetchFails: true });
    assert.equal(page.$('noResults').hidden, true);
    page.chip('絕境戰').click();
    page.type('Sastasha');
    page.runTimeouts();
    assert.equal(page.$('noResults').hidden, true, '載入失敗時搜尋與篩選都不會冒出找不到的畫面');
    assert.equal(page.$('loadError').hidden, false);
    assert.deepEqual(page.consoleErrors, []);
});

test('清除搜尋：取消還沒跑的延遲搜尋，之後不會把舊的字套回來', async () => {
    const page = await createDungeonPage();
    page.type('Sastasha');
    page.runTimeouts();
    assert.equal(page.$('noResults').hidden, false);
    page.type('Sastashaa');
    assert.deepEqual(page.pendingDelays(), [300], '前提：還有一個沒跑的延遲搜尋');
    page.$('clearSearch').click();
    assert.deepEqual(page.pendingDelays(), [], '還沒跑的延遲搜尋取消了');
    page.runTimeouts();
    assert.equal(page.count(), '共 362 個副本');
    assert.equal(page.$('searchInput').value, '');
    assert.equal(page.$('noResults').hidden, true);
    assert.equal(page.rows().length, 30);
    assert.equal(page.app.state.query, '');
    assert.deepEqual(page.consoleErrors, []);

    // 直接呼叫也一樣：清掉搜尋框、立刻套用、焦點到搜尋框
    page.type('Sastasha');
    page.runTimeouts();
    page.app.clearSearch();
    assert.equal(page.$('searchInput').value, '');
    assert.equal(page.count(), '共 362 個副本');
    assert.deepEqual(page.pendingDelays(), []);
    isSame(page.document.activeElement, page.$('searchInput'));
});

test('手機：面板收起來時，找不到的畫面照樣能清掉篩選，「篩選」的數字跟著歸零', async () => {
    const page = await createDungeonPage({ mobile: true });
    page.$('filterToggle').click();
    page.chip('絕境戰').click();
    page.chip('2.x').click();
    page.$('filterToggle').click();
    assert.equal(page.$('filterToggle').textContent, '篩選（2）');
    assert.equal(page.$('filterToggle').getAttribute('aria-expanded'), 'false');
    assert.equal(page.$('noResults').hidden, false);
    assert.equal(page.$('noResultsTitle').textContent, '找不到符合條件的副本');
    assert.equal(page.$('clearFiltersEmpty').hidden, false);

    page.$('clearFiltersEmpty').click();
    assert.equal(page.$('filterToggle').textContent, '篩選');
    assert.equal(page.$('filterToggle').getAttribute('aria-expanded'), 'false', '面板還是收起的');
    assert.ok(page.$('filterCard').classList.contains('is-collapsed'));
    assert.equal(page.count(), '共 362 個副本');
    assert.equal(page.$('noResults').hidden, true);
    isSame(page.document.activeElement, page.$('searchInput'));
    assert.deepEqual(page.consoleErrors, []);
});

test('切換語言：文字換、展開與已列出的筆數不變、焦點留在同一個副本', async () => {
    const page = await createDungeonPage();
    page.$('showMore').click();
    page.row(NAME).click();
    const button = page.row(NAME);
    button.focus();
    page.setLang('en');
    assert.equal(page.count(), '362 dungeons');
    assert.equal(page.more(), 'Show more (302 left)');
    assert.equal(page.$('searchInput').getAttribute('placeholder'), 'Search dungeons, mechanics or drops');
    assert.equal(page.$('dataCount').textContent, 'Contains 362 dungeons from A Realm Reborn (2.x) to Dawntrail (7.x). Thanks to the Huiji Wiki community.');
    assert.equal(page.$('clearFilters').textContent, 'Clear filters');
    assert.equal(page.rows().length, 60, '已列出的筆數不變');
    assert.equal(page.rows()[0].type, '四人迷宮', '類型是資料，不翻譯');
    assert.equal(page.rows()[0].version, '7.x 黃金之遺產');
    assert.equal(page.rows()[0].expanded, true);
    assert.deepEqual(page.detail(NAME).labels, ['Overview', 'Mechanics', 'Drops', 'Reward']);
    assert.equal(page.detail(NAME).reward, '黃金古典神典石 130');
    isSame(page.document.activeElement, page.row(NAME), '焦點在同一個副本的按鈕上');
    assert.ok(page.row(NAME) !== button, '重畫之後是新的按鈕');

    page.setLang('ja');
    assert.equal(page.count(), '全 362 件');
    assert.equal(page.more(), 'さらに表示（残り 302 件）');
    assert.deepEqual(page.detail(NAME).labels, ['概要', 'ギミック', 'ドロップ', '報酬']);
    isSame(page.document.activeElement, page.row(NAME));

    page.setLang('zh');
    assert.equal(page.count(), '共 362 個副本');
    assert.equal(page.more(), '顯示更多（還有 302 個）');
    assert.deepEqual(page.consoleErrors, []);
});

test('切換語言：焦點不在列上時不搶焦點；日文一打開就是日文', async () => {
    const page = await createDungeonPage();
    page.$('searchInput').focus();
    page.type('還沒套用的字');
    page.setLang('en');
    isSame(page.document.activeElement, page.$('searchInput'), '焦點在搜尋框，換語言不動它');
    assert.equal(page.$('searchInput').value, '還沒套用的字', '換語言不動搜尋框裡的字');
    assert.deepEqual(page.pendingDelays(), [300], '也不取消還沒跑的延遲搜尋');
    assert.equal(page.count(), '362 dungeons', '還沒套用的字不算進筆數');

    const ja = await createDungeonPage({ lang: 'ja' });
    assert.equal(ja.count(), '全 362 件');
    assert.equal(ja.more(), 'さらに表示（残り 332 件）');
    assert.equal(ja.$('dataCount').textContent, '362 件のダンジョンを収録しています（新生エオルゼア 2.x～黄金のレガシー 7.x）。灰機Wikiコミュニティに感謝します。');
});

test('切換語言：命中行的標籤與數量跟著語言', async () => {
    const page = await createDungeonPage({ lang: 'en' });
    page.type('泥小點');
    page.runTimeouts();
    assert.equal(page.count(), '1 dungeon found');
    assert.deepEqual(page.rows().map((row) => row.hits), [['Drop: 泥小點']]);
    page.type('俾斯麥');
    page.runTimeouts();
    assert.equal(page.count(), '2 dungeons found');
    const hitsOf = (name) => page.rows().find((row) => row.name === name).hits;
    assert.deepEqual(hitsOf(BISMARCK), ['Drop: 九宮幻卡：俾斯麥 (+1 more)']);
    assert.deepEqual(hitsOf(BISMARCK_EX), ['Drop: 九宮幻卡：俾斯麥 (+2 more)', 'Overview: 俾斯麥的完全覺醒狀態，天空霸主的終極威嚴。']);
    page.type('浮空');
    page.runTimeouts();
    assert.deepEqual(hitsOf(BISMARCK_EX), ['Mechanics: 極限模式的天空巨鯨，在浮空島嶼上進行終極對決。']);

    page.setLang('ja');
    assert.equal(page.count(), '2 件見つかりました');
    assert.deepEqual(hitsOf(BISMARCK_EX), ['ギミック：極限模式的天空巨鯨，在浮空島嶼上進行終極對決。']);
    page.type('俾斯麥');
    page.runTimeouts();
    assert.deepEqual(hitsOf(BISMARCK), ['ドロップ：九宮幻卡：俾斯麥（ほか 1 件）']);
    page.setLang('zh');
    assert.deepEqual(hitsOf(BISMARCK), ['掉落：九宮幻卡：俾斯麥（還有 1 項也符合）']);
});

test('載入失敗：只顯示錯誤訊息，沒有空的列表、筆數或顯示更多，console 是空的', async () => {
    const page = await createDungeonPage({ fetchFails: true });
    assert.equal(page.$('loadError').hidden, false);
    assert.equal(page.$('loadError').textContent, '載入副本資料失敗，請重新整理頁面再試。');
    assert.equal(page.$('dungeonList').hidden, true);
    assert.equal(page.$('showMore').hidden, true);
    assert.equal(page.$('loading').hidden, true);
    assert.equal(page.count(), '');
    assert.equal(page.$('dungeonList').children.length, 0);
    assert.equal(page.$('dataCount').textContent, '');
    assert.deepEqual(page.consoleErrors, []);

    page.setLang('en');
    assert.equal(page.$('loadError').textContent, 'Failed to load dungeon data, please refresh and try again.');
    assert.equal(page.$('loadError').hidden, false);
    assert.equal(page.$('dungeonList').hidden, true);
    assert.equal(page.count(), '');

    // 搜尋與篩選不會讓列表冒出來
    page.chip('四人迷宮').click();
    page.type('俾斯麥');
    page.runTimeouts();
    assert.equal(page.$('dungeonList').hidden, true);
    assert.equal(page.$('showMore').hidden, true);
    assert.equal(page.count(), '');
    assert.deepEqual(page.consoleErrors, []);
});

test('頁面替身：matchMedia 只認手機版面的查詢，setMobile() 改值並通知監聽', async () => {
    const page = await createDungeonPage({ mobile: true });
    const query = page.window.matchMedia(MOBILE_QUERY);
    assert.equal(query.matches, true);
    assert.equal((await createDungeonPage()).window.matchMedia(MOBILE_QUERY).matches, false);
    const seen = [];
    const listener = (event) => seen.push(event.matches);
    query.addEventListener('change', listener);
    page.setMobile(false);
    assert.equal(query.matches, false);
    page.setMobile(true);
    assert.deepEqual(seen, [false, true]);
    query.removeEventListener('change', listener);
    page.setMobile(false);
    assert.deepEqual(seen, [false, true]);
    assert.throws(() => page.window.matchMedia('(max-width: 480px)'), /沒有準備 matchMedia/);
});

test('頁面替身：停用的按鈕點不動、hidden 裡的元素拿不到焦點', async () => {
    const page = await createDungeonPage();
    let clicks = 0;
    const clear = page.$('clearFilters');
    clear.addEventListener('click', () => { clicks += 1; });
    clear.disabled = true;
    clear.click();
    assert.equal(clicks, 0);
    clear.disabled = false;
    clear.click();
    assert.equal(clicks, 1);

    page.$('searchInput').focus();
    const detail = page.$('dungeonList').children[0].querySelector('.dungeon-detail');
    const inner = page.document.createElement('button');
    detail.appendChild(inner);
    assert.equal(detail.hidden, true);
    inner.focus();
    isSame(page.document.activeElement, page.$('searchInput'), 'hidden 的元素裡面的按鈕拿不到焦點');
    detail.hidden = false;
    inner.focus();
    isSame(page.document.activeElement, inner, '詳情顯示出來之後就拿得到');
    assert.equal(page.$('searchInput').value, '', 'input 的 value 一開始是空字串');
});

test('index.html：標記、腳本順序與 meta description', () => {
    for (const gone of ['levelTags', 'level-tag', '深層迷宮', '異聞迷宮', 'dungeon-image', 'btn-primary', 'style=']) {
        assert.ok(!HTML.includes(gone), `index.html 不該有 ${gone}`);
    }

    // 腳本：共用的那一串之後是 dungeon-list.js、script.js；不載入 security-utils.js
    const sources = HTML.split('<script').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1]);
    assert.deepEqual(sources.slice(-2), ['dungeon-list.js', 'script.js']);
    assert.ok(!sources.some((src) => src.includes('security-utils.js')), '不載入 security-utils.js');
    assert.ok(sources.indexOf('../../assets/js/common.js') < sources.indexOf('dungeon-list.js'));
    assert.ok(sources.includes('../../assets/js/i18n/translations/tools/dungeon-database.js'));

    const meta = HTML.match(/<meta\s+name="description"[^>]*>/)[0];
    assert.equal(meta.match(/\scontent="([^"]*)"/)[1], translationValues(TRANSLATIONS, 'zh').get('dungeon_db_description'));
    assert.match(meta, /\sdata-i18n="dungeon_db_description"\s+data-i18n-attr="content"/);

    // 工具主體與資料來源
    assert.ok(HTML.includes('<h1 class="visually-hidden" data-i18n="dungeon_db_header">'));
    assert.ok(HTML.indexOf('id="dungeonTool"') < HTML.indexOf('id="dataSource"'));
    assert.match(openTag('dataSource'), /^<section\b/);
    assert.match(openTag('dataSource'), /\sclass="[^"]*\binfo-panel\b/);
    assert.ok(!/\sdata-i18n=/.test(openTag('dataCount')), '#dataCount 沒有 data-i18n，由程式填');
    const label = tagAttrs(HTML, 'searchLabel');
    assert.match(openTag('searchLabel'), /^<label\b/);
    assert.equal(label.for, 'searchInput');
    assert.equal(label.class, 'visually-hidden');
    assert.equal(tagAttrs(HTML, 'searchInput').type, 'search');
    assert.equal(tagAttrs(HTML, 'searchInput')['data-i18n-attr'], 'placeholder');
    assert.match(openTag('filterCard'), /^<section\b/);
    assert.match(openTag('filterCard'), /\sclass="[^"]*\bcard\b/);
    assert.ok(HTML.includes('class="search-row"'));
    assert.equal(tagAttrs(HTML, 'resultCount')['aria-live'], 'polite');
    assert.match(HTML, /<p[^>]*\sid="resultCount"[^>]*><\/p>/, '#resultCount 一開始是空的');
    assert.match(openTag('loading'), /\sclass="loading"/);
    assert.ok(!/\shidden[\s>]/.test(openTag('loading')), '載入中的提示預設顯示');
    assert.match(openTag('dungeonList'), /^<ul\b/);
    assert.match(openTag('dungeonList'), /\sclass="[^"]*\bcard\b/);
    for (const id of ['dungeonList', 'showMore', 'loadError']) assert.match(openTag(id), /\shidden[\s>]/, `#${id} 預設 hidden`);
    assert.match(openTag('showMore'), /\sclass="btn"/);
    assert.match(openTag('loadError'), /\sclass="error-message"/);
    assert.match(openTag('clearFilters'), /\sclass="btn btn-sm"/);
    assert.equal(tagAttrs(HTML, 'clearFilters')['aria-disabled'], 'true');
    assert.equal(tagAttrs(HTML, 'clearFilters')['data-i18n'], 'dungeon_db_clear_filters');
});

test('index.html：類型與版本按鈕', () => {
    const buttons = (id) => [...HTML.slice(HTML.indexOf(`id="${id}"`)).split('</div>')[0].matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)]
        .map((match) => ({ attrs: match[1], text: match[2].trim() }));
    const types = ['四人迷宮', '公會令', '8人大型任務', '8人討伐殲滅戰', '聯盟任務', '絕境戰', '誅滅戰', '幻巧戰'];
    assert.deepEqual(buttons('typeTags').map((button) => button.attrs.match(/data-type="([^"]*)"/)[1]), types);
    assert.deepEqual(buttons('typeTags').map((button) => button.text), types, '按鈕的字就是類型名稱（資料是中文，不翻譯）');
    const versions = Object.keys(DATA.metadata.expansions);
    assert.deepEqual(versions, ['2.x', '3.x', '4.x', '5.x', '6.x', '7.x']);
    assert.deepEqual(buttons('expansionTags').map((button) => button.attrs.match(/data-expansion="([^"]*)"/)[1]), versions);
    assert.deepEqual(buttons('expansionTags').map((button) => button.text), versions.map((version) => `${version} (${DATA.metadata.expansions[version]})`));
    assert.equal(buttons('expansionTags')[1].text, '3.x (蒼天之禁城)');
    for (const button of [...buttons('typeTags'), ...buttons('expansionTags')]) {
        assert.match(button.attrs, /\sclass="chip"/);
        assert.match(button.attrs, /\stype="button"/);
        assert.match(button.attrs, /\saria-pressed="false"/);
        assert.ok(!/\sdata-i18n=/.test(button.attrs), '類型與版本是資料，不翻譯');
    }
    // 組名：role="group" 加 aria-labelledby，指到有字的組名
    for (const [groupId, key] of [['typeTags', 'dungeon_db_type_filter'], ['expansionTags', 'dungeon_db_expansion_filter']]) {
        const group = tagAttrs(HTML, groupId);
        assert.equal(group.role, 'group');
        assert.equal(tagAttrs(HTML, group['aria-labelledby'])['data-i18n'], key);
    }
});

test('index.html：「篩選」按鈕與找不到的空狀態', () => {
    // 篩選按鈕：在搜尋列裡、搜尋框右邊；一開始是收起的，和程式的預設一致（手機第一個畫面不會先展開再收起）
    const searchRow = HTML.slice(HTML.indexOf('class="search-row"'), HTML.indexOf('class="filter-panel"'));
    assert.ok(searchRow.includes('id="filterToggle"'), '「篩選」在 .search-row 裡');
    assert.ok(searchRow.indexOf('id="searchInput"') < searchRow.indexOf('id="filterToggle"'), '「篩選」在搜尋框右邊');
    assert.match(openTag('filterToggle'), /^<button\b/);
    const toggle = tagAttrs(HTML, 'filterToggle');
    assert.equal(toggle.type, 'button');
    assert.equal(toggle.class, 'btn');
    assert.equal(toggle['aria-expanded'], 'false');
    assert.equal(toggle['aria-controls'], 'filterPanel');
    assert.equal(toggle['data-i18n'], 'dungeon_db_filter_toggle', '載入前的字照語言，載入後由程式加上數字');
    assert.equal(HTML.match(/<button\b[^>]*\sid="filterToggle"[^>]*>([^<]*)<\/button>/)[1], '篩選');
    assert.match(tagAttrs(HTML, 'filterCard').class, /(?:^|\s)is-collapsed(?:\s|$)/, '#filterCard 一開始就是收起的');
    assert.ok(tagAttrs(HTML, 'filterPanel'), '#filterPanel 存在');

    // 找不到：在列表後面，一開始 hidden；標題一個 p，兩顆按鈕各自 hidden
    assert.match(openTag('noResults'), /^<div\b/);
    assert.equal(tagAttrs(HTML, 'noResults').class, 'empty-state');
    assert.match(openTag('noResults'), /\shidden[\s>]/);
    assert.ok(HTML.indexOf('id="dungeonList"') < HTML.indexOf('id="noResults"'), '#noResults 在 #dungeonList 後面');
    assert.match(openTag('noResultsTitle'), /^<p\b/);
    assert.equal(tagAttrs(HTML, 'noResultsTitle').class, 'empty-state-title');
    assert.ok(!/\sdata-i18n=/.test(openTag('noResultsTitle')), '標題要代入搜尋字，由程式填');
    const empty = sliceElementById(HTML, 'noResults');
    assert.ok(empty.indexOf('id="noResultsTitle"') < empty.indexOf('id="clearSearch"') && empty.indexOf('id="clearSearch"') < empty.indexOf('id="clearFiltersEmpty"'));
    for (const [id, key] of [['clearSearch', 'dungeon_db_clear_search'], ['clearFiltersEmpty', 'dungeon_db_clear_filters']]) {
        assert.match(openTag(id), /^<button\b/);
        assert.equal(tagAttrs(HTML, id).type, 'button');
        assert.equal(tagAttrs(HTML, id).class, 'btn');
        assert.equal(tagAttrs(HTML, id)['data-i18n'], key);
        assert.match(openTag(id), /\shidden[\s>]/, `#${id} 預設 hidden`);
        assert.ok(empty.includes(`id="${id}"`), `#${id} 在 #noResults 裡`);
    }
});

test('style.css：手機的「篩選」按鈕與收起的面板、找不到的空狀態', () => {
    // 手機版面的條件和攻略資料的 MOBILE_QUERY 逐字相同
    assert.equal(read('tools/guide/sidebar-template.js').match(/MOBILE_QUERY:\s*'([^']*)'/)[1], MOBILE_QUERY);

    // 電腦版面（@media 外）看不到「篩選」，面板也不會因為 is-collapsed 收起
    assert.match(declarations('#filterToggle', BASE_CSS), /(?:^|[\s;])display:\s*none;/, '電腦版面看不到「篩選」');
    assert.equal(declarations('#filterCard.is-collapsed #filterPanel', BASE_CSS), '', '電腦版面的面板一直在');
    assert.doesNotMatch(BASE_CSS, /\.is-collapsed/, '@media 外面沒有任何依 is-collapsed 的規則');

    // 手機版面：按鈕顯示，收起的面板 display: none
    const phone = MEDIA.filter((block) => block.condition === MOBILE_QUERY);
    assert.equal(phone.length, 1, `有一個 @media ${MOBILE_QUERY}`);
    assert.match(declarations('#filterToggle', phone[0].body), /(?:^|[\s;])display:\s*inline-flex;/, '手機版面顯示「篩選」');
    assert.match(declarations('#filterCard.is-collapsed #filterPanel', phone[0].body), /(?:^|[\s;])display:\s*none;/, '手機版面收起時面板 display: none');
    // 按鈕和旁邊的搜尋框一樣高；搜尋框 .form-control-lg 是 --control-lg
    assert.match(declarations('#filterToggle', BASE_CSS), /(?:^|[\s;])height:\s*var\(--control-lg\);/);
    assert.match(declarations('#filterToggle', BASE_CSS), /(?:^|[\s;])min-height:\s*var\(--control-lg\);/);

    // 找不到：.empty-state、.btn 設了 display，要自己寫 [hidden]；很長的搜尋字要能換行
    for (const selector of ['#noResults', '#clearSearch', '#clearFiltersEmpty']) {
        assert.match(declarations(`${selector}[hidden]`), /(?:^|[\s;])display:\s*none;/, `style.css 要有 ${selector}[hidden] { display: none; }`);
    }
    assert.match(declarations('#noResultsTitle'), /(?:^|[\s;])overflow-wrap:\s*anywhere;/, '很長的搜尋字也要能換行');
});

test('style.css：用 hidden 切換的元素、換行、一列的格線、展開記號', () => {
    for (const selector of ['#dungeonList', '#showMore', '#loading', '#loadError', '.dungeon-detail']) {
        assert.match(declarations(`${selector}[hidden]`), /(?:^|[\s;])display:\s*none;/, `style.css 要有 ${selector}[hidden] { display: none; }`);
    }
    for (const selector of ['.dungeon-name', '.dungeon-hit', '.dungeon-drops li']) {
        assert.match(declarations(selector), /(?:^|[\s;])overflow-wrap:\s*anywhere;/, `${selector} 要能在任何地方換行`);
    }
    assert.doesNotMatch(CSS, /overflow-x/, '任何寬度都不左右捲動');

    // 一列的按鈕：格線、最少 --control-lg 高；展開記號在展開時轉向
    assert.match(declarations('.dungeon-row', BASE_CSS), /(?:^|[\s;])display:\s*grid;/);
    assert.match(declarations('.dungeon-row', BASE_CSS), /(?:^|[\s;])min-height:\s*var\(--control-lg\);/);
    assert.match(declarations('.dungeon-row[aria-expanded="true"] .dungeon-chevron'), /transform:\s*rotate\(/);
    assert.match(declarations('.dungeon-version::before', BASE_CSS), /content:\s*'·'/, '手機的第二行是「類型 · 版本」');
    assert.match(declarations('.dungeon-hit', BASE_CSS), /grid-column:\s*1\s*\/\s*-1;/, '命中行各佔一整行');

    // 電腦版（769px 以上）：名稱、類型、版本、等級、展開記號排在同一行的格線，類型與版本欄寬固定
    const desktop = MEDIA.filter((block) => block.condition === '(min-width: 769px)').map((block) => block.body).join('\n');
    assert.notEqual(desktop, '', '有 @media (min-width: 769px)');
    const columns = declarations('.dungeon-row', desktop).match(/grid-template-columns:\s*([^;]+);/)[1].trim();
    const tracks = columns.match(/minmax\([^)]*\)|\S+/g);
    assert.equal(tracks.length, 5, `電腦版的格線是五欄：${columns}`);
    assert.equal(tracks[0].replace(/\s+/g, ''), 'minmax(0,1fr)', '名稱吃剩下的寬度');
    assert.match(tracks[1], /^[\d.]+rem$/, '類型欄寬固定');
    assert.match(tracks[2], /^[\d.]+rem$/, '版本欄寬固定');
    for (const part of ['name', 'type', 'version', 'level', 'chevron']) {
        assert.match(declarations(`.dungeon-${part}`, desktop), /(?:^|[\s;])grid-row:\s*1;/, `電腦版的 .dungeon-${part} 在第一行`);
    }
    assert.match(declarations('.dungeon-version::before', desktop), /content:\s*none;/, '電腦版不寫「·」');

    // 詳情：dt 一欄、dd 一欄
    assert.match(declarations('.dungeon-field'), /(?:^|[\s;])display:\s*grid;/);
    assert.match(declarations('.dungeon-field'), /grid-template-columns:\s*[\d.]+rem\s+minmax\(0,\s*1fr\);/);

    // 搜尋命中的字、不能按的「清除篩選」
    assert.match(declarations('.dungeon-item mark'), /background:\s*var\(--color-mark\);/);
    assert.match(declarations('#clearFilters[aria-disabled="true"]'), /opacity:\s*0\.55;/);
});

test('翻譯檔：三語的鍵與 {參數} 一致，新文字照規格，不再用的鍵已拿掉', () => {
    const keys = Object.fromEntries(LANGS.map((lang) => [lang, translationKeySet(TRANSLATIONS, lang)]));
    const values = Object.fromEntries(LANGS.map((lang) => [lang, translationValues(TRANSLATIONS, lang)]));
    assert.ok(keys.zh.size >= 35, `zh 只有 ${keys.zh.size} 個鍵`);
    for (const lang of ['en', 'ja']) {
        assert.deepEqual([...keys[lang]].sort(), [...keys.zh].sort(), `${lang} 的鍵集合和 zh 一樣`);
    }
    for (const lang of LANGS) assert.equal(values[lang].size, keys[lang].size, `${lang}：每個鍵都解析得出字串值`);
    const params = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',');
    for (const key of keys.zh) {
        for (const lang of ['en', 'ja']) assert.equal(params(values[lang].get(key)), params(values.zh.get(key)), `${key} 的 {參數} 在 ${lang} 和 zh 不一樣`);
    }

    const EXPECTED = {
        dungeon_db_description: ['FF14 副本資料庫：查副本的等級、類型、機制與掉落物。', "FF14 dungeon database: look up each duty's level, type, mechanics and drops.", 'FF14 ダンジョンデータベース：レベル、タイプ、ギミック、ドロップを調べられます。'],
        dungeon_db_search_label: ['搜尋副本名稱、機制或掉落物', 'Search dungeon names, mechanics or drops', 'ダンジョン名、ギミック、ドロップを検索'],
        dungeon_db_search_placeholder: ['搜尋副本、機制或掉落物', 'Search dungeons, mechanics or drops', 'ダンジョン・ギミック・ドロップを検索'],
        dungeon_db_type_filter: ['類型', 'Type', 'タイプ'],
        dungeon_db_expansion_filter: ['版本', 'Expansion', 'バージョン'],
        dungeon_db_clear_filters: ['清除篩選', 'Clear filters', '絞り込みを解除'],
        dungeon_db_filter_toggle: ['篩選', 'Filters', '絞り込み'],
        dungeon_db_filter_toggle_count: ['篩選（{count}）', 'Filters ({count})', '絞り込み（{count}）'],
        dungeon_db_clear_search: ['清除搜尋', 'Clear search', '検索をクリア'],
        dungeon_db_no_results: ['找不到符合條件的副本', 'No dungeons found matching your criteria', '条件に一致するダンジョンが見つかりません'],
        dungeon_db_no_results_query: ['找不到符合「{query}」的副本', 'No dungeons match "{query}"', '「{query}」に一致するダンジョンはありません'],
        dungeon_db_count_all: ['共 {count} 個副本', '{count} dungeons', '全 {count} 件'],
        dungeon_db_count_all_one: ['共 1 個副本', '1 dungeon', '全 1 件'],
        dungeon_db_count_found: ['找到 {count} 個副本', '{count} dungeons found', '{count} 件見つかりました'],
        dungeon_db_count_found_one: ['找到 1 個副本', '1 dungeon found', '1 件見つかりました'],
        dungeon_db_show_more: ['顯示更多（還有 {count} 個）', 'Show more ({count} left)', 'さらに表示（残り {count} 件）'],
        dungeon_db_hit_drop: ['掉落：', 'Drop: ', 'ドロップ：'],
        dungeon_db_hit_more: ['（還有 {count} 項也符合）', ' (+{count} more)', '（ほか {count} 件）'],
        dungeon_db_hit_mechanics: ['機制：', 'Mechanics: ', 'ギミック：'],
        dungeon_db_hit_description: ['簡介：', 'Overview: ', '概要：'],
        dungeon_db_detail_description: ['簡介', 'Overview', '概要'],
        dungeon_db_detail_mechanics: ['機制', 'Mechanics', 'ギミック'],
        dungeon_db_detail_drops: ['掉落物', 'Drops', 'ドロップ'],
        dungeon_db_detail_reward: ['獎勵', 'Reward', '報酬'],
        dungeon_db_no_drops: ['資料裡沒有特殊掉落物', 'No special drops in the data', 'データに特別なドロップはありません'],
        dungeon_db_no_reward: ['沒有神典石', 'No tomestones', 'トームストーンなし'],
        dungeon_db_data_count: [
            '資料包含 {count} 個副本，涵蓋從重生之境（2.x）到黃金之遺產（7.x）。感謝灰機Wiki社群的貢獻。',
            'Contains {count} dungeons from A Realm Reborn (2.x) to Dawntrail (7.x). Thanks to the Huiji Wiki community.',
            '{count} 件のダンジョンを収録しています（新生エオルゼア 2.x～黄金のレガシー 7.x）。灰機Wikiコミュニティに感謝します。'
        ]
    };
    for (const [key, texts] of Object.entries(EXPECTED)) {
        LANGS.forEach((lang, index) => assert.equal(values[lang].get(key), texts[index], `${lang} 的 ${key}`));
    }

    // 沿用不改的鍵還在（dungeon_db_no_results 是只有篩選、沒有搜尋字時找不到的標題）
    const KEPT = ['dungeon_db_title', 'dungeon_db_header', 'dungeon_db_loading', 'dungeon_db_data_source', 'dungeon_db_data_source_text',
        'dungeon_db_data_source_link', 'dungeon_db_data_source_desc', 'dungeon_db_msg_load_failed', 'dungeon_db_no_results'];
    const REMOVED = ['dungeon_db_level_filter', 'dungeon_db_reset_filters', 'dungeon_db_reward', 'dungeon_db_tombstone', 'dungeon_db_special_drops',
        'dungeon_db_mechanics', 'dungeon_db_image_loading', 'dungeon_db_image_preparing', 'dungeon_db_msg_reset_filters', 'dungeon_db_msg_detail_dev'];
    for (const lang of LANGS) {
        for (const key of KEPT) assert.ok(keys[lang].has(key), `${lang} 要有 ${key}`);
        for (const key of REMOVED) assert.ok(!keys[lang].has(key), `${lang} 不該再有 ${key}`);
    }
    assert.equal(values.zh.get('dungeon_db_msg_load_failed'), '載入副本資料失敗，請重新整理頁面再試。');
    assert.equal(values.en.get('dungeon_db_msg_load_failed'), 'Failed to load dungeon data, please refresh and try again.');

    // 英文的翻譯值不留中文字
    for (const [key, value] of values.en) assert.doesNotMatch(value, /[一-鿿]/, `en 的 ${key} 不該有中文字`);
});
