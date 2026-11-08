// Lodestone 角色查詢頁：打開時（我的角色 → 找人 → 最近查過）、找人與搜尋結果、角色標頭、網址與上一頁、名稱與成就顯示、
// 六個分頁（職業、成就、裝備、收藏、部隊、其他）、舊的請求晚到（從 tests/lodestone-requests.test.js 搬來的標頭與分頁部分）。
// 頁面替身見 tests/helpers/lodestone-page.js，假回應見 lodestone-fixtures.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createLodestonePage } = require('./helpers/lodestone-page.js');
const F = require('./helpers/lodestone-fixtures.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HTML = read('tools/lodestone-lookup/index.html');

const PAGE = 'https://ff14.tw/tools/lodestone-lookup/';
const KEYS = { mine: 'ff14tw_lodestone_mine', recent: 'ff14tw_lodestone_recent', lang: 'ff14tw_lodestone_lang' };
const DCS = ['Aether', 'Crystal', 'Dynamis', 'Primal', 'Chaos', 'Light', 'Materia', 'Elemental', 'Gaia', 'Mana', 'Meteor'];
// 資料時間的寫法：年月日與時分，照介面語言（同 script.js 的 TIME_FORMAT 與 LOCALES）
const TIME_FORMAT = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
const fetchedText = (locale) => new Date(F.FETCHED_AT).toLocaleString(locale, TIME_FORMAT);

// 比較元素一律用 ===：assert.equal 失敗時會展開整份 fake-dom 而卡住不報錯，改成 === 加訊息才報得出來（同 mini-cactpot-page.test.js）
const isSame = (a, b, message) => assert.ok(a === b, message);
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
// 打開時看得到的部分，照畫面上的順序
const landingParts = (page) => page.$('landingView').children.filter((child) => !child.hidden).map((child) => child.id);
const paths = (page) => page.requests.map((request) => request.path);
// 打開這個人的角色時，Worker 回新格式的角色；打開角色時一起打的職業分頁回 F.classJobs()
const characterRoute = (who) => ({
    [`/character/${who.id}`]: () => F.ok(F.character(who)),
    [`/character/${who.id}/classjob`]: () => F.ok(F.classJobs())
});
// 打開一個角色打的兩個請求：標頭與職業分頁
const opened = (id, dc = 'na') => [`/character/${id}?dc=${dc}`, `/character/${id}/classjob?dc=${dc}`];
const storedJson = (page, key) => JSON.parse(page.stored(key));
const LODESTONE = (id, dc = 'na') => `https://${dc}.finalfantasyxiv.com/lodestone/character/${id}/`;
const clean = (page) => assert.deepEqual(page.consoleErrors, [], '頁面不在 console 留東西');
// 螢幕閱讀器念的字：element 底下的文字，略過 aria-hidden="true" 的元素（例如外部連結的 ↗）
const spokenText = (element) => element.childNodes.map((node) => {
    if (node.nodeType === 3) return node.textContent;
    return node.getAttribute('aria-hidden') === 'true' ? '' : spokenText(node);
}).join('');
// 名稱與成就顯示的按鈕（container 裡的每一顆）的 aria-pressed，照 English、日本語的順序
const pressed = (container) => container.querySelectorAll('button[data-lang]').map((button) => button.getAttribute('aria-pressed'));

// ---------- 分頁用的小工具 ----------
const TAB_KEYS = ['jobs', 'achievements', 'gear', 'collections', 'fc', 'about'];
// 選中的分頁（aria-selected="true" 的 data-tab）
const selectedTab = (page) => page.tabs().filter((tab) => tab.selected === 'true').map((tab) => tab.key);
// 打開這個人的角色時，每一個分頁的請求都有回答（Worker 的新格式）：標頭、職業、成就（照請求的頁數）、坐騎、寵物、部隊與成員（照請求的頁數）
function allRoutes(who = F.HIKARI) {
    const routes = {
        ...characterRoute(who),
        [`/character/${who.id}/achievements`]: (url) => F.ok(F.achievements({ page: Number(url.searchParams.get('page')) })),
        [`/character/${who.id}/mounts`]: () => F.ok(F.mounts()),
        [`/character/${who.id}/minions`]: () => F.ok(F.minions())
    };
    if (who.fc) {
        routes[`/freecompany/${who.fc.id}`] = () => F.ok(F.freeCompany(who.fc));
        routes[`/freecompany/${who.fc.id}/members`] = (url) => F.ok(F.members(Number(url.searchParams.get('page'))));
    }
    return routes;
}
// 面板裡的上一頁、下一頁與頁數；沒有換頁的按鈕時是 null
function pagerOf(page, key) {
    const pager = page.$(`panel-${key}`).querySelector('.pager');
    if (!pager) return null;
    const [prev, next] = pager.querySelectorAll('button');
    return {
        prev, next,
        info: pager.querySelector('.pager-info').textContent,
        prevDisabled: prev.getAttribute('aria-disabled') === 'true',
        nextDisabled: next.getAttribute('aria-disabled') === 'true'
    };
}
// dl 的每一列 [dt 的字, dd 的字]
const rowsOf = (list) => list.querySelectorAll('dt').map((term) => [term.textContent, term.nextElementSibling.textContent]);
// 在輸入框打字（設值並派送會冒泡的 input）
function typeInto(page, input, text) {
    input.value = text;
    input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
}
// 成就的日期寫法：年月日，照介面語言（同 lodestone-tabs.js 的 DATE_FORMAT）
const dateText = (iso, locale) => new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });

// ---------- 打開時 ----------

test('第一次來：只看得到一句說明與找人；伺服器選單是全部伺服器、11 個資料中心、85 個伺服器', async () => {
    const page = createLodestonePage();
    await page.ready;
    assert.equal(page.view(), 'landing');
    assert.deepEqual(landingParts(page), ['firstVisitIntro', 'findCard']);
    assert.equal(page.$('firstVisitIntro').textContent, '輸入名字和伺服器，查國際版角色的職業等級、成就與收藏。');
    assert.equal(page.mineName(), null);
    assert.deepEqual(page.recentNames(), []);

    const card = page.$('findCard');
    assert.equal(card.querySelector('h2').textContent, '找人');
    assert.deepEqual(card.querySelectorAll('label').map((label) => [label.getAttribute('for'), label.textContent]), [['nameInput', '角色名字'], ['worldSelect', '伺服器']]);
    assert.equal(page.$('searchButton').textContent, '搜尋');
    assert.ok(page.$('searchButton').classList.contains('btn-primary'));
    assert.equal(page.$('searchButton').getAttribute('type'), 'submit');
    assert.equal(card.querySelector('.find-note').textContent, '也可以直接貼上 Lodestone 角色頁的網址或 ID。只能查國際版的角色。');
    assert.equal(page.$('dataLangLabel').textContent, '名稱與成就顯示');
    assert.deepEqual(page.$('dataLang').querySelectorAll('button').map((button) => [button.dataset.lang, button.textContent, button.getAttribute('aria-pressed')]),
        [['en', 'English', 'true'], ['ja', '日本語', 'false']]);

    const select = page.$('worldSelect');
    const [all, dcGroup, worldGroup] = select.children;
    assert.deepEqual([all.tagName, all.value, all.textContent], ['OPTION', '', '全部伺服器']);
    assert.deepEqual([dcGroup.tagName, dcGroup.getAttribute('label'), worldGroup.tagName, worldGroup.getAttribute('label')], ['OPTGROUP', '資料中心', 'OPTGROUP', '伺服器']);
    assert.deepEqual(dcGroup.children.map((option) => [option.value, option.textContent]), DCS.map((dc) => [`_dc_${dc}`, dc]));
    const worlds = worldGroup.children.map((option) => [option.value, option.textContent]);
    assert.equal(worlds.length, 85);
    assert.deepEqual([worlds[0], worlds[84]], [['Adamantoise', 'Adamantoise'], ['Zurvan', 'Zurvan']]);
    assert.ok(worlds.every(([value, text]) => value === text), '伺服器的值就是名稱');
    assert.equal(select.children.length, 3, '全部伺服器之後就是兩組');
    assert.equal(select.value, '');

    assert.deepEqual(page.requests, [], '打開時不打 Worker');
    assert.equal(page.url(), PAGE);
    clean(page);
});

test('有我的角色與 3 個最近查過：我的角色 → 找人 → 最近查過；點我的角色打開它', async () => {
    const page = createLodestonePage({
        stored: { [KEYS.mine]: F.mineOf(F.HIKARI), [KEYS.recent]: [F.AOI, F.REED, F.MIRA].map(F.entryOf) },
        routes: characterRoute(F.HIKARI)
    });
    await page.ready;
    assert.deepEqual(landingParts(page), ['mineCard', 'findCard', 'recentCard']);

    const mine = page.$('mineCard');
    assert.equal(mine.tagName, 'BUTTON');
    assert.equal(mine.getAttribute('type'), 'button');
    assert.equal(mine.querySelector('.card-label').textContent, '我的角色');
    assert.equal(page.mineName(), 'Hikari Senshi');
    assert.equal(page.$('mineMeta').textContent, 'Tonberry（Elemental）・吟遊詩人 Lv100');
    assert.equal(page.$('mineAvatar').src, F.avatarOf('12345678'));
    assert.equal(page.$('mineAvatar').alt, '');

    assert.equal(page.$('recentCard').querySelector('h2').textContent, '最近查過');
    assert.deepEqual(page.recentNames(), ['Aoi Mizuno', 'Reed Blacke', 'Mira Sol']);
    assert.deepEqual(page.$('recentList').querySelectorAll('.person-meta').map((meta) => meta.textContent), ['Tiamat（Gaia）', 'Ragnarok（Chaos）', 'Ixion（Mana）']);
    assert.deepEqual(page.$('recentList').querySelectorAll('button.person').map((row) => [row.dataset.id, row.getAttribute('type')]),
        [['23456789', 'button'], ['56789012', 'button'], ['67890123', 'button']]);

    mine.click();
    assert.equal(page.view(), 'character');
    await page.flush();
    assert.deepEqual(paths(page), opened('12345678'));
    assert.equal(page.url(), `${PAGE}?id=12345678`);
    assert.deepEqual(page.history.at(-1), { method: 'pushState', state: { view: 'character', id: '12345678' }, url: `${PAGE}?id=12345678` });
    assert.equal(page.profile().name, 'Hikari Senshi');
    clean(page);
});

test('點最近查過的一列打開那個角色；那一列跟著打開時的畫面藏起來，焦點移到「← 找其他人」', async () => {
    const page = createLodestonePage({ stored: { [KEYS.recent]: [F.AOI, F.REED].map(F.entryOf) }, routes: characterRoute(F.REED) });
    await page.ready;
    const row = page.$('recentList').querySelectorAll('button.person')[1];
    row.focus();
    isSame(page.document.activeElement, row, '焦點在第二列');
    row.click();
    assert.equal(page.view(), 'character');
    isSame(page.document.activeElement, page.$('characterBack'), '焦點不會掉到頁面最上面');
    await page.flush();
    assert.deepEqual(paths(page), opened('56789012'));
    assert.equal(page.profile().name, 'Reed Blacke');
    clean(page);
});

// ---------- 找人：搜尋 ----------

test('搜尋：名字加伺服器，只帶 name、world、dc、page 四個參數；摘要用官網的總數；每一列有名字、伺服器與部隊', async () => {
    const page = createLodestonePage({ routes: { '/search/character': () => F.ok(F.search([F.AOI, F.AOI_YA, F.AOI_SAWA])) } });
    await page.ready;
    page.type('Aoi Mizu');
    page.chooseWorld('Tiamat');
    page.$('nameInput').focus();
    page.submit();
    assert.equal(page.view(), 'search');
    isSame(page.document.activeElement, page.$('nameInput'), '表單搬到搜尋結果上面，焦點留在名字欄');
    assert.equal(page.$('searchSummary').textContent, '載入中…');
    assert.equal(page.$('resultCard').getAttribute('aria-busy'), 'true');
    await page.flush();

    assert.deepEqual(paths(page), ['/search/character?name=Aoi+Mizu&world=Tiamat&dc=na&page=1']);
    assert.deepEqual(Object.keys(page.requests[0].params), ['name', 'world', 'dc', 'page']);
    assert.equal(page.$('resultCard').getAttribute('aria-busy'), 'false');
    assert.equal(page.$('searchSummary').textContent, '在 Tiamat 找到 3 個「Aoi Mizu」');
    assert.deepEqual(page.resultRows(), [
        { id: '23456789', name: 'Aoi Mizuno', meta: 'Tiamat（Gaia）・部隊 Moonlit Garden' },
        { id: '34567890', name: 'Aoi Mizunoya', meta: 'Tiamat（Gaia）' },
        { id: '45678901', name: 'Aoi Mizusawa', meta: 'Tiamat（Gaia）・部隊 Night Owls' }
    ]);
    assert.deepEqual([page.$('searchMore').hidden, page.$('searchHint').hidden, page.$('searchFallback').hidden], [true, true, true]);

    // 上面是「← 找其他人」與找人的表單（填好剛才的條件），下面是結果；搜尋不改網址
    assert.deepEqual(page.$('searchView').children.map((child) => child.id), ['searchBack', 'findCard', 'resultCard']);
    assert.equal(page.$('searchBack').textContent, '← 找其他人');
    assert.equal(page.$('nameInput').value, 'Aoi Mizu');
    assert.equal(page.$('worldSelect').value, 'Tiamat');
    // 搜尋新增一筆上一頁的紀錄，網址不變（搜尋條件不放進網址）
    assert.equal(page.url(), PAGE);
    assert.deepEqual(page.history.at(-1), { method: 'pushState', state: { view: 'search', name: 'Aoi Mizu', world: 'Tiamat' }, url: PAGE });
    clean(page);
});

test('搜尋：還有下一頁時寫「還有更多結果…」；選資料中心時摘要寫資料中心，全部伺服器時不寫在哪裡', async () => {
    let answer = F.search([F.AOI, F.AOI_SAWA], { pageTotal: 20, total: 1000 });
    const page = createLodestonePage({ routes: { '/search/character': () => F.ok(answer) } });
    await page.ready;
    page.type('Aoi');
    page.chooseWorld('_dc_Gaia');
    page.submit();
    await page.flush();
    assert.equal(page.requests.at(-1).path, '/search/character?name=Aoi&world=_dc_Gaia&dc=na&page=1');
    assert.equal(page.$('searchSummary').textContent, '在 Gaia 找到 1,000 個「Aoi」');
    assert.equal(page.$('searchMore').hidden, false);
    assert.equal(page.$('searchMore').textContent, '還有更多結果，請把名字打完整或選伺服器');
    assert.equal(page.resultRows().length, 2);

    answer = F.search([F.AOI, F.AOI_SAWA, F.KAEDE], { total: 3 });
    page.chooseWorld('_dc_Elemental');
    page.$('searchButton').focus();
    page.$('searchButton').click();
    isSame(page.document.activeElement, page.$('searchButton'), '在搜尋結果再搜尋一次：焦點留在搜尋鈕');
    await page.flush();
    assert.equal(page.requests.at(-1).params.world, '_dc_Elemental');
    assert.equal(page.$('searchSummary').textContent, '在 Elemental 找到 3 個「Aoi」');
    assert.equal(page.$('searchMore').hidden, true);

    page.chooseWorld('');
    page.submit();
    await page.flush();
    assert.equal(page.requests.at(-1).path, '/search/character?name=Aoi&world=&dc=na&page=1');
    assert.equal(page.$('searchSummary').textContent, '找到 3 個「Aoi」');
    assert.deepEqual(page.history.map((call) => call.method), ['replaceState', 'pushState', 'replaceState', 'replaceState'], '在搜尋結果上再搜尋：換掉這一筆，不多一筆');
    assert.deepEqual(page.history.at(-1).state, { view: 'search', name: 'Aoi', world: '' });
    assert.deepEqual(page.resultRows().map((row) => row.meta), ['Tiamat（Gaia）・部隊 Moonlit Garden', 'Tiamat（Gaia）・部隊 Night Owls', 'Cactuar（Aether）']);
    clean(page);
});

test('搜尋：沒有結果時寫在哪裡找不到，加一句確認伺服器或貼網址', async () => {
    const page = createLodestonePage({ routes: { '/search/character': () => F.ok(F.search([])) } });
    await page.ready;
    page.type('Aoi Mizu');
    page.chooseWorld('Tiamat');
    page.submit();
    await page.flush();
    assert.equal(page.$('searchSummary').textContent, '在 Tiamat 找不到「Aoi Mizu」');
    assert.equal(page.$('searchHint').hidden, false);
    assert.equal(page.$('searchHint').textContent, '確認伺服器，或貼上他在 Lodestone 的角色頁網址');
    assert.deepEqual(page.resultRows(), []);
    assert.deepEqual([page.$('searchMore').hidden, page.$('searchFallback').hidden], [true, true]);

    page.chooseWorld('');
    page.submit();
    await page.flush();
    assert.equal(page.$('searchSummary').textContent, '找不到「Aoi Mizu」');
    assert.equal(page.$('searchHint').hidden, false);
    clean(page);
});

test('搜尋不能用（舊 Worker 沒有搜尋、連不上、502、其他失敗）：寫出原因，給到官網搜尋的連結', async () => {
    const cases = [
        ['舊 Worker：沒有這個端點，請求被瀏覽器擋下（fetch 丟 TypeError）', undefined, '查詢失敗'],
        ['連不上 Worker（fetch 被拒絕）', () => { throw new TypeError('NetworkError when attempting to fetch resource.'); }, '查詢失敗'],
        ['連不上 Worker（回答的 promise 被拒絕）', () => Promise.reject(new TypeError('Load failed')), '查詢失敗'],
        ['502：Lodestone 連不上', () => F.fail(502, 'upstream'), 'Lodestone 暫時連不上，請稍後再試'],
        ['500：Worker 壞了', () => F.fail(500, 'internal'), '查詢失敗'],
        ['400', () => F.fail(400, 'bad_request'), '查詢失敗'],
        ['回應不是 JSON', () => ({ status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token')) }), '查詢失敗'],
        ['回應沒有 Results', () => F.ok({ FetchedAt: F.FETCHED_AT }), '查詢失敗']
    ];
    for (const [label, route, reason] of cases) {
        const page = createLodestonePage({ routes: route === undefined ? {} : { '/search/character': route } });
        await page.ready;
        page.type("A'lu-ne Moku");
        page.chooseWorld('Tiamat');
        page.submit();
        await page.flush();
        assert.equal(page.requests.length, 1, label);
        assert.equal(page.$('searchSummary').textContent, reason, label);
        assert.deepEqual(page.resultRows(), [], label);
        const link = page.$('searchFallback');
        assert.equal(link.hidden, false, label);
        assert.equal(link.tagName, 'A', label);
        assert.equal(link.href, page.window.LodestoneModel.officialSearchUrl("A'lu-ne Moku", 'Tiamat', 'en'), label);
        assert.equal(link.href, 'https://na.finalfantasyxiv.com/lodestone/character/?q=A%27lu-ne+Moku&worldname=Tiamat', label);
        assert.equal(link.target, '_blank', label);
        assert.equal(link.rel, 'noopener noreferrer', label);
        assert.equal(link.textContent, "到 Lodestone 官網搜尋「A'lu-ne Moku」 ↗", label);
        assert.equal(spokenText(link), "到 Lodestone 官網搜尋「A'lu-ne Moku」", `${label}：↗ 不念`);
        assert.deepEqual(link.querySelectorAll('[aria-hidden="true"]').map((mark) => mark.textContent), [' ↗'], label);
        assert.deepEqual([page.$('searchMore').hidden, page.$('searchHint').hidden], [true, true], label);
        assert.equal(page.$('resultCard').getAttribute('aria-busy'), 'false', label);
        clean(page);
    }
});

test('名字欄貼角色頁網址或 ID：不打搜尋，直接打開那個角色；貼上網址時名字欄馬上換成 ID', async () => {
    for (const [input, id] of [
        ['https://na.finalfantasyxiv.com/lodestone/character/12345678/', '12345678'],
        ['https://jp.finalfantasyxiv.com/lodestone/character/23456789/achievement/?page=2', '23456789'],
        ['  12345678 ', '12345678']
    ]) {
        const page = createLodestonePage({ routes: { ...characterRoute(F.HIKARI), ...characterRoute(F.AOI) } });
        await page.ready;
        page.paste(input);
        assert.equal(page.$('nameInput').value, id, `${input}：貼上就換成要打開的 ID`);
        page.submit();
        assert.equal(page.view(), 'character', input);
        await page.flush();
        assert.deepEqual(paths(page), opened(id), input);
        assert.equal(page.url(), `${PAGE}?id=${id}`, input);
        clean(page);
    }

    // 打字時不換（打到一半的網址不會被切成 ID 的前幾碼）；送出時照樣直接打開，名字欄換成 ID
    const page = createLodestonePage({ routes: characterRoute(F.HIKARI) });
    await page.ready;
    page.type('https://na.finalfantasyxiv.com/lodestone/character/1');
    assert.equal(page.$('nameInput').value, 'https://na.finalfantasyxiv.com/lodestone/character/1');
    page.type('https://na.finalfantasyxiv.com/lodestone/character/12345678/');
    page.submit();
    await page.flush();
    assert.deepEqual(paths(page), opened('12345678'));
    assert.equal(page.$('nameInput').value, '12345678');
    clean(page);
});

test("名字有撇號或連字號（Y'shtola Rhul）是名字不是 ID，原樣送去搜尋；名字欄空白時什麼都不打", async () => {
    const page = createLodestonePage({ routes: { '/search/character': () => F.ok(F.search([])) } });
    await page.ready;
    page.submit();
    assert.equal(page.view(), 'landing');
    assert.deepEqual(page.requests, []);
    isSame(page.document.activeElement, page.$('nameInput'), '空白時焦點回到名字欄');

    page.paste("  Y'shtola Rhul ");
    assert.equal(page.$('nameInput').value, "  Y'shtola Rhul ", '貼上名字不會被換掉');
    page.submit();
    await page.flush();
    assert.deepEqual(paths(page), ['/search/character?name=Y%27shtola+Rhul&world=&dc=na&page=1']);
    assert.equal(page.requests[0].params.name, "Y'shtola Rhul");
    assert.equal(page.$('searchSummary').textContent, "找不到「Y'shtola Rhul」");
    assert.equal(page.$('nameInput').value, "Y'shtola Rhul");
    clean(page);
});

test('只有一個結果時照樣列出、不自動打開；點那一列才打開（pushState），上一頁回到搜尋結果、不再打 Worker', async () => {
    const page = createLodestonePage({ routes: { '/search/character': () => F.ok(F.search([F.AOI])), ...characterRoute(F.AOI) } });
    await page.ready;
    page.type('Aoi Mizuno');
    page.chooseWorld('Tiamat');
    page.submit();
    await page.flush();
    assert.equal(page.view(), 'search');
    assert.equal(page.$('searchSummary').textContent, '在 Tiamat 找到 1 個「Aoi Mizuno」');
    assert.deepEqual(page.resultRows().map((row) => row.name), ['Aoi Mizuno']);
    assert.equal(page.requests.length, 1, '不會自己打開');

    const row = page.$('resultList').querySelector('button.person');
    row.focus();
    row.click();
    assert.equal(page.view(), 'character');
    isSame(page.document.activeElement, page.$('characterBack'), '焦點移到「← 找其他人」');
    await page.flush();
    assert.deepEqual(paths(page).slice(1), opened('23456789'));
    assert.equal(page.url(), `${PAGE}?id=23456789`);
    assert.equal(page.history.at(-1).method, 'pushState');

    page.back();
    await page.flush();
    assert.equal(page.view(), 'search');
    assert.equal(page.url(), PAGE);
    assert.equal(page.requests.length, 3, '回到搜尋結果不再搜尋一次');
    assert.deepEqual(page.resultRows().map((row) => row.name), ['Aoi Mizuno']);
    assert.equal(page.$('nameInput').value, 'Aoi Mizuno');
    assert.equal(page.$('worldSelect').value, 'Tiamat');
    clean(page);
});

test('最近查過與搜尋結果的每一列：螢幕閱讀器念的名字和下面那一行中間有停頓（看不見的分隔），畫面上的字不變', async () => {
    const page = createLodestonePage({ stored: { [KEYS.recent]: [F.AOI].map(F.entryOf) }, routes: { '/search/character': () => F.ok(F.search([F.AOI])) } });
    await page.ready;
    const recentRow = page.$('recentList').querySelector('button.person');
    assert.equal(spokenText(recentRow), 'Aoi Mizuno，Tiamat（Gaia）');
    assert.deepEqual([recentRow.querySelector('.person-name').textContent, recentRow.querySelector('.person-meta').textContent], ['Aoi Mizuno', 'Tiamat（Gaia）'], '看得到的字不變');
    const pause = recentRow.querySelector('.person-text').children[1];
    assert.deepEqual([pause.className, pause.textContent], ['visually-hidden', '，'], '停頓只給螢幕閱讀器');

    page.type('Aoi');
    page.submit();
    await page.flush();
    assert.equal(spokenText(page.$('resultList').querySelector('button.person')), 'Aoi Mizuno，Tiamat（Gaia）・部隊 Moonlit Garden');
    page.setLang('en');
    assert.equal(spokenText(page.$('resultList').querySelector('button.person')), 'Aoi Mizuno, Tiamat (Gaia) · FC Moonlit Garden');
    page.setLang('ja');
    page.$('searchBack').click();
    assert.equal(spokenText(page.$('recentList').querySelector('button.person')), 'Aoi Mizuno、Tiamat（Gaia）');
    clean(page);
});

test('我的角色卡片：螢幕閱讀器念的「我的角色」、名字和下面那一行中間都有停頓（看不見的分隔），畫面上的字不變', async () => {
    const page = createLodestonePage({ stored: { [KEYS.mine]: F.mineOf(F.HIKARI) } });
    await page.ready;
    const card = page.$('mineCard');
    assert.equal(spokenText(card), '我的角色，Hikari Senshi，Tonberry（Elemental）・吟遊詩人 Lv100');
    assert.deepEqual([card.querySelector('.card-label').textContent, page.$('mineName').textContent, page.$('mineMeta').textContent],
        ['我的角色', 'Hikari Senshi', 'Tonberry（Elemental）・吟遊詩人 Lv100'], '看得到的字不變');
    assert.deepEqual(card.querySelectorAll('.visually-hidden').map((pause) => pause.textContent), ['，', '，'], '停頓只給螢幕閱讀器');
    page.setLang('en');
    assert.equal(spokenText(card), 'My character, Hikari Senshi, Tonberry (Elemental) · Bard Lv100');
    page.setLang('ja');
    assert.equal(spokenText(card), 'マイキャラクター、Hikari Senshi、Tonberry（Elemental）・吟遊詩人 Lv100');
    clean(page);
});

test('我的角色卡片、最近查過與搜尋結果的下面那一行：每一段（伺服器與資料中心、職業與等級、部隊）各自一個 .person-meta-part，「・」接在前一段的後面，看得到的字不變', async () => {
    const page = createLodestonePage({
        stored: { [KEYS.mine]: F.mineOf(F.HIKARI), [KEYS.recent]: [F.AOI].map(F.entryOf) },
        routes: { '/search/character': () => F.ok(F.search([F.AOI, F.AOI_YA])) }
    });
    await page.ready;
    // 那一行的每一個節點：段是 [class, 字]，段外面的字是 ['text', 字]。styles.css 讓段整段換行，不從「吟遊／詩人」中間斷開；
    // 「・」接在前一段的後面：換行時留在行尾，和「）」在同一段，兩個全形標點中間才不會多出空白
    const pieces = (meta) => meta.childNodes.map((node) => (node.nodeType === 3 ? ['text', node.textContent] : [node.className, node.textContent]));
    assert.deepEqual(pieces(page.$('mineMeta')), [['person-meta-part', 'Tonberry（Elemental）・'], ['person-meta-part', '吟遊詩人 Lv100']]);
    assert.equal(page.$('mineMeta').textContent, 'Tonberry（Elemental）・吟遊詩人 Lv100');
    assert.deepEqual(pieces(page.$('recentList').querySelector('.person-meta')), [['person-meta-part', 'Tiamat（Gaia）']]);
    page.type('Aoi');
    page.submit();
    await page.flush();
    const [aoi, aoiYa] = page.$('resultList').querySelectorAll('.person-meta');
    assert.deepEqual(pieces(aoi), [['person-meta-part', 'Tiamat（Gaia）・'], ['person-meta-part', '部隊 Moonlit Garden']]);
    assert.deepEqual(pieces(aoiYa), [['person-meta-part', 'Tiamat（Gaia）']], '沒有部隊：只有一段，沒有分隔');
    // 英文的分隔是「 · 」：後面的空白放在段外面（段是 inline-block，結尾的空白會被吃掉）
    page.setLang('en');
    assert.deepEqual(pieces(page.$('resultList').querySelector('.person-meta')), [['person-meta-part', 'Tiamat (Gaia) ·'], ['text', ' '], ['person-meta-part', 'FC Moonlit Garden']]);
    page.$('searchBack').click();
    assert.deepEqual(pieces(page.$('mineMeta')), [['person-meta-part', 'Tonberry (Elemental) ·'], ['text', ' '], ['person-meta-part', 'Bard Lv100']]);
    assert.equal(page.$('mineMeta').textContent, 'Tonberry (Elemental) · Bard Lv100');
    clean(page);
});

// ---------- 角色標頭 ----------

test('角色標頭：名字、稱號、伺服器與部隊、現在的職業、資料時間、我的角色與在 Lodestone 打開', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: characterRoute(F.HIKARI) });
    assert.equal(page.view(), 'character', '網址帶 ?id= 一打開就是那個角色');
    assert.deepEqual([page.profile().busy, page.profile().loading, page.profile().name], [true, '載入中…', null]);
    assert.equal(page.$('tabsCard').hidden, true, '載入中沒有分頁');
    await page.ready;

    const profile = page.profile();
    assert.equal(profile.busy, false);
    assert.equal(profile.loading, null);
    assert.equal(profile.name, 'Hikari Senshi');
    assert.equal(page.$('profileCard').querySelector('.profile-name').tagName, 'H2');
    assert.equal(profile.title, 'Warrior of Light');
    assert.equal(profile.where, 'Tonberry（Elemental）・部隊 Example Company');
    assert.equal(profile.now, '現在：吟遊詩人 Lv100');
    assert.deepEqual(profile.nowIcon, { src: '../../assets/images/se/FFXIVJobIcons/03_DPS/Job/Bard.png', alt: '' });
    assert.equal(profile.nowTextIcon, null);
    assert.equal(profile.fetchedAt, `資料時間：${fetchedText('zh-TW')}`);
    assert.deepEqual(profile.mine, { text: '☆ 設成我的角色', pressed: 'false' });
    assert.deepEqual(profile.lodestone, { href: LODESTONE('12345678'), target: '_blank', rel: 'noopener noreferrer', text: '在 Lodestone 打開 ↗' });
    const lodestoneLink = page.$('profileCard').querySelector('.profile-lodestone');
    assert.equal(spokenText(lodestoneLink), '在 Lodestone 打開', '↗ 是另外一個 aria-hidden 的記號，不念');
    assert.deepEqual(lodestoneLink.querySelectorAll('[aria-hidden="true"]').map((mark) => mark.textContent), [' ↗']);
    assert.equal(page.$('profileCard').querySelector('.profile-avatar').src, F.avatarOf('12345678'));
    // 動作那一列：設成我的角色、在 Lodestone 打開、名稱與成就顯示（和找人卡片同一組按鈕：同樣的字、同樣的狀態）
    assert.deepEqual(profile.dataLang, { label: '名稱與成就顯示', role: 'group', buttons: [['en', 'English', 'true'], ['ja', '日本語', 'false']] });
    const actions = page.$('profileCard').querySelector('.profile-actions');
    const kind = (child) => ['profile-mine', 'profile-lodestone', 'data-lang'].find((name) => child.classList.contains(name)) ?? child.className;
    assert.deepEqual(actions.children.map(kind), ['profile-mine', 'profile-lodestone', 'data-lang']);
    assert.deepEqual(actions.querySelectorAll('button[data-lang]').map((button) => button.getAttribute('type')), ['button', 'button']);
    assert.deepEqual(pressed(page.$('dataLang')), ['true', 'false']);

    assert.equal(page.$('characterBack').textContent, '← 找其他人');
    assert.deepEqual([page.$('characterError').hidden, page.$('tabsCard').hidden], [true, false]);
    assert.deepEqual(paths(page), opened('12345678'), '只打標頭與職業分頁');
    assert.equal(page.url(), `${PAGE}?id=12345678`);
    assert.deepEqual(page.history, [{ method: 'replaceState', state: { view: 'character', id: '12345678' }, url: `${PAGE}?id=12345678` }], '直接打開網址不新增上一頁的紀錄');
    clean(page);
});

test('在 Lodestone 打開的網域跟著名稱與成就顯示：English 是 na.、日本語是 jp.', async () => {
    const en = createLodestonePage({ search: '?id=12345678', stored: { [KEYS.lang]: 'en' }, routes: characterRoute(F.HIKARI) });
    await en.ready;
    assert.equal(en.requests[0].path, '/character/12345678?dc=na');
    assert.equal(en.profile().lodestone.href, LODESTONE('12345678', 'na'));

    const ja = createLodestonePage({ search: '?id=12345678', stored: { [KEYS.lang]: 'ja' }, routes: characterRoute(F.HIKARI) });
    await ja.ready;
    assert.equal(ja.requests[0].path, '/character/12345678?dc=jp');
    assert.equal(ja.profile().lodestone.href, LODESTONE('12345678', 'jp'));
    assert.deepEqual([pressed(ja.$('dataLang')), pressed(ja.$('profileCard'))], [['false', 'true'], ['false', 'true']]);
    clean(en);
    clean(ja);
});

test('舊 Worker 的角色回應：部隊只寫「部隊」、目前職業是官網圖示加 LvN（替代文字「目前職業」）、沒有資料時間', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: { '/character/12345678': () => F.ok(F.oldCharacter(F.HIKARI)) } });
    await page.ready;
    const profile = page.profile();
    assert.equal(profile.name, 'Hikari Senshi');
    assert.equal(profile.title, 'Warrior of Light');
    assert.equal(profile.where, 'Tonberry（Elemental）・部隊');
    assert.equal(profile.now, '現在：Lv100');
    assert.deepEqual(profile.nowIcon, { src: F.BARD_ICON, alt: '目前職業' });
    assert.equal(profile.fetchedAt, null);
    assert.ok(page.$('profileCard').querySelector('.profile-fetched') === null, '沒有資料時間那一行');
    assert.equal(page.$('tabsCard').hidden, false);
    // 記進最近查過（舊 Worker 沒有職業鍵）
    assert.deepEqual(storedJson(page, KEYS.recent), [F.entryOf(F.HIKARI)]);
    // 設成我的角色：存下的職業與等級和標頭寫的一樣（認不出職業，等級是 100）；打開時的卡片寫伺服器與等級
    page.$('profileCard').querySelector('.profile-mine').click();
    assert.deepEqual(storedJson(page, KEYS.mine), { ...F.mineOf(F.HIKARI), job: null, level: 100 });
    page.$('characterBack').click();
    assert.equal(page.$('mineMeta').textContent, 'Tonberry（Elemental）・Lv100');

    // 舊 Worker、沒有加入部隊：只寫伺服器
    const loner = createLodestonePage({ search: `?id=${F.REED.id}`, routes: { [`/character/${F.REED.id}`]: () => F.ok(F.oldCharacter(F.REED)) } });
    await loner.ready;
    assert.equal(loner.profile().where, 'Ragnarok（Chaos）');
    clean(page);
    clean(loner);
});

test('沒有加入部隊（新 Worker 的 FreeCompany 是 null）：伺服器後面不寫部隊', async () => {
    const page = createLodestonePage({ search: `?id=${F.REED.id}`, routes: characterRoute(F.REED) });
    await page.ready;
    assert.equal(page.profile().where, 'Ragnarok（Chaos）');
    assert.ok(page.$('profileCard').querySelector('.profile-fc') === null, '沒有部隊那一段');
    assert.equal(page.profile().now, '現在：戰士 Lv100');
    clean(page);
});

test('目前職業：網站的圖示接在職業圖示目錄後面；基本職業顯示它的職業；認不出的用官網圖示；Beastmaster 用文字圖示；職業名稱跟著介面語言', async () => {
    const open = async (who, lang = 'zh') => {
        const page = createLodestonePage({ lang, search: `?id=${who.id}`, routes: characterRoute(who) });
        await page.ready;
        clean(page);
        return page.profile();
    };
    const gladiator = await open({ ...F.HIKARI, job: 'Gladiator', level: 30 });
    assert.equal(gladiator.now, '現在：騎士 Lv30');
    assert.deepEqual(gladiator.nowIcon, { src: '../../assets/images/se/FFXIVJobIcons/01_TANK/Job/Paladin.png', alt: '' });

    const unknown = await open({ ...F.HIKARI, job: null, level: 100, icon: 'https://lds-img.finalfantasyxiv.com/h/x/unknown-job.png' });
    assert.equal(unknown.now, '現在：Lv100');
    assert.deepEqual(unknown.nowIcon, { src: 'https://lds-img.finalfantasyxiv.com/h/x/unknown-job.png', alt: '目前職業' });

    const beastmaster = await open({ ...F.HIKARI, job: 'Beastmaster', level: 50 });
    assert.equal(beastmaster.nowIcon, null, '網站沒有 Beastmaster 的圖示');
    assert.equal(beastmaster.nowTextIcon, 'B');
    assert.equal(beastmaster.now, '現在：BBeastmaster Lv50');
    const beastmasterJa = await open({ ...F.HIKARI, job: 'Beastmaster', level: 50 }, 'ja');
    assert.equal(beastmasterJa.nowTextIcon, '魔');
    assert.equal(beastmasterJa.now, '現在：魔魔獣使い Lv50');

    assert.equal((await open(F.HIKARI, 'en')).now, 'Now: Bard Lv100');
    assert.equal((await open(F.HIKARI, 'ja')).now, '現在：吟遊詩人 Lv100');

    // 讀不到目前職業（沒有 Key、Level、Icon）：不寫「現在：」那一行
    assert.equal((await open({ ...F.HIKARI, job: null, level: null, icon: null })).now, null);
});

test('稱號是空字串時和沒有稱號一樣，不寫那一行', async () => {
    for (const title of ['', '   ', undefined]) {
        const page = createLodestonePage({ search: '?id=12345678', routes: characterRoute({ ...F.HIKARI, title }) });
        await page.ready;
        assert.equal(page.profile().title, null, JSON.stringify(title));
        assert.equal(page.profile().name, 'Hikari Senshi');
        clean(page);
    }
});

test('角色打不開：404 找不到這個角色、502 Lodestone 連不上、其他是查詢失敗；都有「← 找其他人」，不記進最近查過', async () => {
    const cases = [
        [() => F.fail(404, 'not_found'), '找不到這個角色'],
        [() => F.fail(502, 'upstream'), 'Lodestone 暫時連不上，請稍後再試'],
        [() => F.fail(500, 'internal'), '查詢失敗'],
        [() => F.fail(403, 'private'), '查詢失敗'],
        [() => ({ status: 500, body: 'Internal Server Error' }), '查詢失敗'],
        [undefined, '查詢失敗'],
        [() => { throw new TypeError('Failed to fetch'); }, '查詢失敗'],
        [() => F.ok({ FetchedAt: F.FETCHED_AT }), '查詢失敗']
    ];
    for (const [route, message] of cases) {
        const page = createLodestonePage({ search: '?id=12345678', routes: route === undefined ? {} : { '/character/12345678': route } });
        await page.ready;
        assert.equal(page.view(), 'character', message);
        assert.equal(page.profile(), null, `${message}：標頭換成錯誤訊息`);
        assert.equal(page.$('tabsCard').hidden, true, message);
        const error = page.$('characterError');
        assert.deepEqual([error.hidden, error.textContent, error.getAttribute('role')], [false, message, 'alert']);
        assert.equal(page.$('characterBack').hidden, false);
        assert.equal(page.$('characterBack').textContent, '← 找其他人');
        assert.equal(page.stored(KEYS.recent), null, `${message}：不記進最近查過`);
        clean(page);
    }
});

test('角色打開後點「← 找其他人」：回到打開時（新增一筆上一頁的紀錄、網址拿掉 ?id=），焦點在名字欄；剛查過的人在最近查過', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: characterRoute(F.HIKARI) });
    await page.ready;
    page.$('characterBack').click();
    assert.equal(page.view(), 'landing');
    isSame(page.document.activeElement, page.$('nameInput'), '焦點在名字欄');
    assert.equal(page.url(), PAGE);
    assert.deepEqual(page.history.at(-1), { method: 'pushState', state: { view: 'landing' }, url: PAGE });
    assert.deepEqual(landingParts(page), ['findCard', 'recentCard']);
    assert.deepEqual(page.recentNames(), ['Hikari Senshi']);

    // 上一頁回到那個角色（重新打標頭）
    page.back();
    assert.equal(page.view(), 'character');
    await page.flush();
    assert.equal(page.url(), `${PAGE}?id=12345678`);
    assert.deepEqual(paths(page), [...opened('12345678'), ...opened('12345678')]);
    assert.equal(page.profile().name, 'Hikari Senshi');
    clean(page);
});

test('搜尋結果點「← 找其他人」：回到打開時，表單搬回我的角色與最近查過中間，焦點在名字欄；還沒回來的搜尋不再採用', async () => {
    const late = deferred();
    const page = createLodestonePage({ stored: { [KEYS.mine]: F.mineOf(F.HIKARI) }, routes: { '/search/character': () => late.promise } });
    await page.ready;
    page.type('Aoi');
    page.$('searchButton').focus();
    page.$('searchButton').click();
    assert.equal(page.view(), 'search');
    isSame(page.document.activeElement, page.$('searchButton'), '按搜尋鈕送出：表單搬過去之後焦點還在搜尋鈕');
    page.$('searchBack').click();
    assert.equal(page.view(), 'landing');
    assert.deepEqual(landingParts(page), ['mineCard', 'findCard']);
    isSame(page.document.activeElement, page.$('nameInput'), '焦點在名字欄');
    assert.equal(page.requests[0].signal.aborted, true, '取消還沒回來的搜尋');
    late.resolve(F.ok(F.search([F.AOI])));
    await page.flush();
    assert.equal(page.view(), 'landing');
    assert.deepEqual(page.resultRows(), [], '晚到的結果不畫');
    assert.equal(page.url(), PAGE);
    clean(page);
});

test('上一頁：打開時 → 角色 → 上一頁回到打開時（不再打 Worker）；網址的 ?id= 不是 ID 時是打開時', async () => {
    const page = createLodestonePage({ stored: { [KEYS.recent]: [F.AOI].map(F.entryOf) }, routes: characterRoute(F.AOI) });
    await page.ready;
    await page.app.openCharacter('23456789');
    assert.equal(page.url(), `${PAGE}?id=23456789`);
    page.back();
    await page.flush();
    assert.equal(page.view(), 'landing');
    assert.equal(page.url(), PAGE);
    assert.equal(page.requests.length, 2);
    assert.deepEqual(page.recentNames(), ['Aoi Mizuno']);

    const bad = createLodestonePage({ search: '?id=abc' });
    await bad.ready;
    assert.equal(bad.view(), 'landing');
    assert.deepEqual(bad.requests, []);
    assert.equal(bad.url(), PAGE, '拿掉不是 ID 的 ?id=');
    clean(page);
    clean(bad);
});

// ---------- 我的角色與最近查過 ----------

test('設成我的角色：存進記憶、從最近查過拿掉；再按取消（放回最近查過）；打開成功時記進最近查過', async () => {
    const page = createLodestonePage({ stored: { [KEYS.recent]: [F.AOI].map(F.entryOf) }, routes: characterRoute(F.HIKARI) });
    await page.ready;
    await page.app.openCharacter('12345678');
    assert.deepEqual(storedJson(page, KEYS.recent), [F.entryOf(F.HIKARI), F.entryOf(F.AOI)], '打開成功時記進最近查過，新的在前');

    const toggle = page.$('profileCard').querySelector('.profile-mine');
    assert.equal(toggle.tagName, 'BUTTON');
    assert.equal(toggle.getAttribute('type'), 'button');
    toggle.focus();
    toggle.click();
    assert.deepEqual(page.profile().mine, { text: '★ 我的角色', pressed: 'true' });
    isSame(page.$('profileCard').querySelector('.profile-mine'), toggle, '同一顆按鈕');
    isSame(page.document.activeElement, toggle, '焦點留在按鈕上');
    assert.deepEqual(storedJson(page, KEYS.mine), F.mineOf(F.HIKARI));
    assert.deepEqual(storedJson(page, KEYS.recent), [F.entryOf(F.AOI)], '從最近查過拿掉');

    toggle.click();
    assert.deepEqual(page.profile().mine, { text: '☆ 設成我的角色', pressed: 'false' });
    assert.equal(page.stored(KEYS.mine), null);
    assert.deepEqual(storedJson(page, KEYS.recent), [F.entryOf(F.HIKARI), F.entryOf(F.AOI)], '取消之後放回最近查過');

    toggle.click();
    page.$('characterBack').click();
    assert.deepEqual(landingParts(page), ['mineCard', 'findCard', 'recentCard']);
    assert.equal(page.mineName(), 'Hikari Senshi');
    assert.deepEqual(page.recentNames(), ['Aoi Mizuno']);
    clean(page);
});

test('打開我的角色時更新卡片的資料（設定時記下的快照）；我的角色不進最近查過', async () => {
    const old = { ...F.mineOf(F.HIKARI), world: 'Ultros', dc: 'Primal', job: 'Monk', level: 90 };
    const page = createLodestonePage({ stored: { [KEYS.mine]: old, [KEYS.recent]: [F.AOI].map(F.entryOf) }, routes: characterRoute(F.HIKARI) });
    await page.ready;
    assert.equal(page.$('mineMeta').textContent, 'Ultros（Primal）・武僧 Lv90');
    page.$('mineCard').click();
    await page.flush();
    assert.deepEqual(page.profile().mine, { text: '★ 我的角色', pressed: 'true' });
    assert.deepEqual(storedJson(page, KEYS.mine), F.mineOf(F.HIKARI));
    assert.deepEqual(storedJson(page, KEYS.recent), [F.entryOf(F.AOI)]);
    page.back();
    assert.equal(page.$('mineMeta').textContent, 'Tonberry（Elemental）・吟遊詩人 Lv100');
    clean(page);
});

test('封鎖網站資料（光是讀 localStorage 就丟例外）：照常查得到、設我的角色不丟錯，這次打開期間記得', async () => {
    const page = createLodestonePage({ storageThrows: true, routes: { '/search/character': () => F.ok(F.search([F.AOI])), ...characterRoute(F.AOI), ...characterRoute(F.HIKARI) } });
    await page.ready;
    assert.deepEqual(landingParts(page), ['firstVisitIntro', 'findCard']);
    page.type('Aoi');
    page.submit();
    await page.flush();
    assert.deepEqual(page.resultRows().map((row) => row.name), ['Aoi Mizuno']);
    page.$('resultList').querySelector('button.person').click();
    await page.flush();
    assert.equal(page.profile().name, 'Aoi Mizuno');
    page.$('profileCard').querySelector('.profile-mine').click();
    assert.deepEqual(page.profile().mine, { text: '★ 我的角色', pressed: 'true' });
    await page.app.openCharacter('12345678');
    page.$('characterBack').click();
    assert.equal(page.mineName(), 'Aoi Mizuno');
    assert.deepEqual(page.recentNames(), ['Hikari Senshi']);
    page.$('dataLang').querySelector('button[data-lang="ja"]').click();
    assert.equal(page.$('dataLang').querySelector('button[data-lang="ja"]').getAttribute('aria-pressed'), 'true');
    assert.equal(page.stored(KEYS.mine), null, '什麼都沒存進 localStorage');
    clean(page);
});

test('寫不進 localStorage（容量已滿：讀得到，寫入丟例外）：這次打開期間照樣記得我的角色與最近查過，存著的不動', async () => {
    const before = [F.entryOf(F.HIKARI)];
    const page = createLodestonePage({ writeThrows: true, stored: { [KEYS.recent]: before }, routes: { '/search/character': () => F.ok(F.search([F.AOI])), ...characterRoute(F.AOI), ...characterRoute(F.HIKARI) } });
    await page.ready;
    assert.deepEqual(page.recentNames(), ['Hikari Senshi'], '讀得到存著的');
    page.type('Aoi');
    page.submit();
    await page.flush();
    page.$('resultList').querySelector('button.person').click();
    await page.flush();
    assert.equal(page.profile().name, 'Aoi Mizuno');
    const mine = page.$('profileCard').querySelector('.profile-mine');
    mine.click();
    assert.deepEqual(page.profile().mine, { text: '★ 我的角色', pressed: 'true' });
    mine.click();
    assert.deepEqual(page.profile().mine, { text: '☆ 設成我的角色', pressed: 'false' }, '取消也照樣');
    mine.click();
    assert.deepEqual(page.profile().mine, { text: '★ 我的角色', pressed: 'true' });
    await page.app.openCharacter('12345678');
    page.$('characterBack').click();
    assert.equal(page.mineName(), 'Aoi Mizuno');
    assert.deepEqual(page.recentNames(), ['Hikari Senshi'], '設成我的角色時從最近查過拿掉');
    assert.equal(page.stored(KEYS.mine), null, '沒有存進 localStorage');
    assert.deepEqual(storedJson(page, KEYS.recent), before, '存著的不動');
    clean(page);
});

// ---------- 名稱與成就顯示 ----------

test('名稱與成就顯示：預設跟介面語言（日文介面是日本語）；按了之後記住，之後的請求帶 dc=jp', async () => {
    const ja = createLodestonePage({ lang: 'ja', routes: { '/search/character': () => F.ok(F.search([])) } });
    await ja.ready;
    assert.deepEqual(ja.$('dataLang').querySelectorAll('button').map((button) => button.getAttribute('aria-pressed')), ['false', 'true']);
    assert.ok(ja.$('dataLang').querySelector('button[data-lang="ja"]').classList.contains('active'));
    ja.type('Aoi');
    ja.submit();
    await ja.flush();
    assert.equal(ja.requests[0].params.dc, 'jp');
    assert.equal(ja.stored(KEYS.lang), null, '沒按過不記');

    const page = createLodestonePage({ routes: { '/search/character': () => F.ok(F.search([])) } });
    await page.ready;
    const [english, japanese] = page.$('dataLang').querySelectorAll('button');
    assert.deepEqual([english.getAttribute('aria-pressed'), japanese.getAttribute('aria-pressed')], ['true', 'false']);
    japanese.click();
    assert.deepEqual([english.getAttribute('aria-pressed'), japanese.getAttribute('aria-pressed')], ['false', 'true']);
    assert.deepEqual([english.classList.contains('active'), japanese.classList.contains('active')], [false, true]);
    assert.equal(page.stored(KEYS.lang), 'ja');
    assert.equal(page.view(), 'landing', '按了不送出表單');
    page.type('Aoi');
    page.submit();
    await page.flush();
    assert.equal(page.requests[0].path, '/search/character?name=Aoi&world=&dc=jp&page=1');

    // 按過之後再打開頁面，照記住的
    const again = createLodestonePage({ stored: { [KEYS.lang]: 'ja' } });
    await again.ready;
    assert.deepEqual(again.$('dataLang').querySelectorAll('button').map((button) => button.getAttribute('aria-pressed')), ['false', 'true']);
    clean(ja);
    clean(page);
    clean(again);
});

test('看角色時切換會重新打標頭：按標頭裡的名稱與成就顯示，記住並用新的語言重新打；兩組按鈕一樣；舊語言的回應晚到不採用', async () => {
    const japanese = deferred();
    const lateEnglish = deferred();
    const calls = { na: 0, jp: 0 };
    const page = createLodestonePage({
        search: '?id=12345678',
        routes: {
            // English：第一次馬上回來，第二次已經回來、身體還在讀（不受取消影響）；日本語：第一次等 japanese，第二次馬上回來
            '/character/12345678': (url) => {
                const dc = url.searchParams.get('dc');
                calls[dc] += 1;
                if (dc === 'na') return calls.na === 1 ? F.ok(F.character({ ...F.HIKARI, title: 'English Title' })) : { status: 200, json: () => lateEnglish.promise };
                return calls.jp === 1 ? japanese.promise : F.ok(F.character({ ...F.HIKARI, title: 'Japanese Title 2' }));
            }
        }
    });
    await page.ready;
    const profileButton = (lang) => page.$('profileCard').querySelector(`button[data-lang="${lang}"]`);
    assert.deepEqual([pressed(page.$('dataLang')), pressed(page.$('profileCard'))], [['true', 'false'], ['true', 'false']]);

    profileButton('ja').focus();
    profileButton('ja').click();
    assert.deepEqual(paths(page), [...opened('12345678'), ...opened('12345678', 'jp')], '用日本語重新打標頭（與目前的分頁）');
    assert.equal(page.stored(KEYS.lang), 'ja', '記住按的');
    assert.deepEqual([pressed(page.$('dataLang')), pressed(page.$('profileCard'))], [['false', 'true'], ['false', 'true']], '兩組按鈕一樣');
    // 新的還沒回來：標頭留著（載入中），按鈕不會不見，焦點留在按下去的那一顆
    assert.deepEqual([page.profile().busy, page.profile().title, page.profile().loading], [true, 'English Title', '載入中…']);
    isSame(page.document.activeElement, profileButton('ja'), '焦點留在日本語');
    japanese.resolve(F.ok(F.character({ ...F.HIKARI, title: 'Japanese Title' })));
    await page.flush();
    assert.deepEqual([page.profile().busy, page.profile().title, page.profile().loading], [false, 'Japanese Title', null]);
    assert.equal(page.profile().lodestone.href, LODESTONE('12345678', 'jp'));
    isSame(page.document.activeElement, profileButton('ja'), '新的標頭畫好之後焦點還在日本語');
    assert.equal(page.url(), `${PAGE}?id=12345678`);
    assert.ok(page.history.every((call) => call.method === 'replaceState'), '重新打標頭不新增上一頁的紀錄');

    // 再按一次同一個語言：不重打
    profileButton('ja').click();
    assert.equal(page.requests.length, 4);

    // 很快地換回 English 又換成日本語：English 的回應晚到不採用
    profileButton('en').click();
    await page.flush();
    assert.equal(page.requests[4].params.dc, 'na');
    profileButton('ja').click();
    assert.equal(page.requests[4].signal.aborted, true, '取消 English 的請求');
    await page.flush();
    assert.equal(page.profile().title, 'Japanese Title 2');
    lateEnglish.resolve(F.character({ ...F.HIKARI, title: 'Late English Title' }));
    await page.flush();
    assert.deepEqual([page.profile().busy, page.profile().title], [false, 'Japanese Title 2'], '舊語言的回應晚到不採用');
    assert.equal(page.stored(KEYS.lang), 'ja');
    assert.deepEqual([pressed(page.$('dataLang')), pressed(page.$('profileCard'))], [['false', 'true'], ['false', 'true']]);
    clean(page);
});

test('標頭還在載入時換名稱與成就顯示（沒按過時切換介面語言）：舊語言的回應晚到不採用', async () => {
    // 舊語言的回應已經回來、身體還在讀（不受取消影響），才換語言
    const englishBody = deferred();
    const page = createLodestonePage({
        search: '?id=12345678',
        routes: {
            '/character/12345678': (url) => (url.searchParams.get('dc') === 'na'
                ? { status: 200, json: () => englishBody.promise }
                : F.ok(F.character({ ...F.HIKARI, title: 'Japanese Title' })))
        }
    });
    await page.flush();
    assert.equal(page.profile().busy, true);
    page.setLang('ja');
    assert.equal(page.requests[0].signal.aborted, true, '取消舊語言的請求');
    await page.flush();
    assert.deepEqual(paths(page), [...opened('12345678'), ...opened('12345678', 'jp')]);
    assert.equal(page.profile().title, 'Japanese Title');
    englishBody.resolve(F.character({ ...F.HIKARI, title: 'English Title' }));
    await page.ready;
    assert.equal(page.profile().title, 'Japanese Title', '舊語言的回應晚到不採用');
    assert.equal(page.profile().lodestone.href, LODESTONE('12345678', 'jp'));
    assert.equal(page.profile().busy, false);
    assert.equal(page.stored(KEYS.lang), null, '沒按過：不記');
    clean(page);
});

test('名稱與成就顯示換了之後標頭打不開：換成錯誤訊息，焦點移到「← 找其他人」', async () => {
    const page = createLodestonePage({
        search: '?id=12345678',
        routes: { '/character/12345678': (url) => (url.searchParams.get('dc') === 'na' ? F.ok(F.character(F.HIKARI)) : F.fail(502, 'upstream')) }
    });
    await page.ready;
    const button = page.$('profileCard').querySelector('button[data-lang="ja"]');
    button.focus();
    button.click();
    await page.flush();
    assert.equal(page.profile(), null);
    assert.equal(page.$('characterError').textContent, 'Lodestone 暫時連不上，請稍後再試');
    isSame(page.document.activeElement, page.$('characterBack'), '按鈕跟著標頭不見了：焦點移到「← 找其他人」');
    assert.equal(page.stored(KEYS.lang), 'ja');
    clean(page);
});

test('搜尋結果上換名稱與成就顯示：不重新搜尋，重畫結果，官網搜尋的連結換網域', async () => {
    const page = createLodestonePage();
    await page.ready;
    page.type('Aoi');
    page.chooseWorld('_dc_Gaia');
    page.submit();
    await page.flush();
    assert.equal(page.$('searchSummary').textContent, '查詢失敗', '舊 Worker：搜尋不能用');
    assert.equal(page.$('searchFallback').href, 'https://na.finalfantasyxiv.com/lodestone/character/?q=Aoi&worldname=_dc_Gaia');
    page.$('dataLang').querySelector('button[data-lang="ja"]').click();
    assert.equal(page.view(), 'search');
    assert.equal(page.requests.length, 1, '不重新搜尋');
    assert.equal(page.$('searchFallback').href, 'https://jp.finalfantasyxiv.com/lodestone/character/?q=Aoi&worldname=_dc_Gaia');
    assert.equal(page.$('searchSummary').textContent, '查詢失敗');
    assert.equal(page.stored(KEYS.lang), 'ja');

    // 有結果時：換語言也不重新搜尋，結果照舊；下一次搜尋才用新的語言
    page.routes['/search/character'] = () => F.ok(F.search([F.AOI]));
    page.submit();
    await page.flush();
    assert.equal(page.requests.at(-1).params.dc, 'jp');
    page.$('dataLang').querySelector('button[data-lang="en"]').click();
    assert.equal(page.requests.length, 2);
    assert.deepEqual(page.resultRows().map((row) => row.name), ['Aoi Mizuno']);
    assert.equal(page.$('searchSummary').textContent, '在 Gaia 找到 1 個「Aoi」');
    clean(page);
});

test('重新打標頭的時候按「☆ 設成我的角色」：照樣設好；新的標頭回來時更新我的角色的資料', async () => {
    const japanese = deferred();
    const page = createLodestonePage({
        search: '?id=12345678',
        routes: { '/character/12345678': (url) => (url.searchParams.get('dc') === 'na' ? F.ok(F.character(F.HIKARI)) : japanese.promise) }
    });
    await page.ready;
    page.$('profileCard').querySelector('button[data-lang="ja"]').click();
    assert.equal(page.profile().busy, true, '日本語的標頭還沒回來');
    page.$('profileCard').querySelector('.profile-mine').click();
    assert.deepEqual(page.profile().mine, { text: '★ 我的角色', pressed: 'true' }, '這一下沒有被吃掉');
    assert.deepEqual(storedJson(page, KEYS.mine), F.mineOf(F.HIKARI));
    assert.equal(page.stored(KEYS.recent), '[]', '從最近查過拿掉');

    const fresh = F.character(F.HIKARI);
    fresh.Character.Avatar = `${F.avatarOf(F.HIKARI.id)}?1700000002`;
    japanese.resolve(F.ok(fresh));
    await page.flush();
    assert.deepEqual([page.profile().busy, page.profile().mine], [false, { text: '★ 我的角色', pressed: 'true' }]);
    assert.equal(storedJson(page, KEYS.mine).avatar, `${F.avatarOf(F.HIKARI.id)}?1700000002`, '新的標頭回來時更新我的角色的資料');
    clean(page);
});

test('上一頁、下一頁：打開時 → 搜尋結果 → 角色 → 上一頁 → 上一頁 → 下一頁 → 下一頁；搜尋結果從記憶體拿，網址只有看角色時有 ?id=', async () => {
    const page = createLodestonePage({ routes: { '/search/character': () => F.ok(F.search([F.AOI, F.AOI_SAWA])), ...characterRoute(F.AOI) } });
    await page.ready;
    page.type('Aoi Mizu');
    page.chooseWorld('Tiamat');
    page.submit();
    await page.flush();
    page.$('resultList').querySelector('button.person').click();
    await page.flush();
    assert.deepEqual(page.history.map((call) => [call.method, call.url]), [
        ['replaceState', PAGE],
        ['pushState', PAGE],
        ['pushState', `${PAGE}?id=23456789`]
    ], '搜尋與打開角色各新增一筆，搜尋的那一筆網址不變');
    assert.deepEqual(paths(page), ['/search/character?name=Aoi+Mizu&world=Tiamat&dc=na&page=1', ...opened('23456789')]);

    page.back();
    assert.deepEqual([page.view(), page.url()], ['search', PAGE], '回到搜尋結果');
    assert.equal(page.$('searchSummary').textContent, '在 Tiamat 找到 2 個「Aoi Mizu」');
    assert.deepEqual(page.resultRows().map((row) => row.name), ['Aoi Mizuno', 'Aoi Mizusawa']);
    assert.deepEqual([page.$('nameInput').value, page.$('worldSelect').value], ['Aoi Mizu', 'Tiamat']);

    page.back();
    assert.deepEqual([page.view(), page.url()], ['landing', PAGE], '回到打開時，還在這個工具裡');
    assert.deepEqual(landingParts(page), ['findCard', 'recentCard']);

    page.forward();
    assert.deepEqual([page.view(), page.url()], ['search', PAGE], '下一頁回到搜尋結果');
    assert.deepEqual(page.resultRows().map((row) => row.name), ['Aoi Mizuno', 'Aoi Mizusawa']);
    assert.equal(page.requests.length, 3, '搜尋結果從記憶體拿，不再搜尋');

    page.forward();
    assert.deepEqual([page.view(), page.url()], ['character', `${PAGE}?id=23456789`]);
    await page.flush();
    assert.equal(page.profile().name, 'Aoi Mizuno');
    assert.deepEqual(paths(page).slice(3), opened('23456789'), '角色重新打標頭與職業分頁');
    assert.equal(page.history.filter((call) => call.method === 'pushState').length, 2, '上一頁、下一頁不新增紀錄');
    clean(page);
});

test('「← 找其他人」之後的上一頁：新增一筆打開時（沒有 ?id=），上一頁依序回到角色、搜尋結果、打開時', async () => {
    const page = createLodestonePage({ routes: { '/search/character': () => F.ok(F.search([F.AOI])), ...characterRoute(F.AOI) } });
    await page.ready;
    page.type('Aoi');
    page.submit();
    await page.flush();
    page.$('resultList').querySelector('button.person').click();
    await page.flush();
    page.$('characterBack').click();
    assert.deepEqual([page.view(), page.url()], ['landing', PAGE]);
    isSame(page.document.activeElement, page.$('nameInput'), '焦點在名字欄');
    assert.deepEqual(page.history.at(-1), { method: 'pushState', state: { view: 'landing' }, url: PAGE });

    page.back();
    assert.deepEqual([page.view(), page.url()], ['character', `${PAGE}?id=23456789`]);
    await page.flush();
    page.back();
    assert.deepEqual([page.view(), page.url()], ['search', PAGE]);
    assert.deepEqual(page.resultRows().map((row) => row.name), ['Aoi Mizuno']);
    page.back();
    assert.deepEqual([page.view(), page.url()], ['landing', PAGE]);

    // 搜尋結果上點「← 找其他人」：也是新增一筆打開時；上一頁回到搜尋結果
    page.forward();
    assert.equal(page.view(), 'search');
    page.$('searchBack').click();
    assert.deepEqual([page.view(), page.url()], ['landing', PAGE]);
    assert.deepEqual(page.history.at(-1), { method: 'pushState', state: { view: 'landing' }, url: PAGE });
    page.back();
    assert.equal(page.view(), 'search');
    clean(page);
});

test('上一頁、下一頁回到搜尋結果，但結果已經不在記憶體裡：是打開時，不再搜尋', async () => {
    // 搜尋還沒回來就按上一頁（搜尋取消），再按下一頁
    const pending = deferred();
    const page = createLodestonePage({ routes: { '/search/character': () => pending.promise } });
    await page.ready;
    page.type('Aoi');
    page.submit();
    page.back();
    assert.equal(page.view(), 'landing');
    assert.equal(page.requests[0].signal.aborted, true);
    page.forward();
    assert.deepEqual([page.view(), page.url()], ['landing', PAGE]);
    assert.equal(page.requests.length, 1, '不再搜尋');

    // 在搜尋結果那一筆重新整理：頁面是新的，結果不在了
    const reloaded = createLodestonePage({ historyState: { view: 'search', name: 'Aoi', world: '' } });
    await reloaded.ready;
    assert.deepEqual([reloaded.view(), reloaded.url()], ['landing', PAGE]);
    assert.deepEqual(reloaded.requests, []);
    clean(page);
    clean(reloaded);
});

test('上一頁回到搜尋 A 那一筆，記憶體裡卻是之後搜尋 B 的結果（名字或伺服器不同）：是打開時，不把 B 的結果當成 A 的，也不再搜尋', async () => {
    // 搜尋 A → 打開一個角色 → 「← 找其他人」→ 搜尋 B → 上一頁三次回到 A 那一筆
    for (const [label, name, world] of [['名字不同', 'Reed', 'Tiamat'], ['只有伺服器不同', 'Aoi', '']]) {
        const page = createLodestonePage({
            routes: { '/search/character': (url) => F.ok(F.search(url.searchParams.get('name') === 'Reed' ? [F.REED] : [F.AOI])), ...characterRoute(F.AOI) }
        });
        const searches = () => page.requests.filter((request) => request.pathname === '/search/character').map((request) => [request.params.name, request.params.world]);
        await page.ready;
        page.type('Aoi');
        page.chooseWorld('Tiamat');
        page.submit();
        await page.flush();
        page.$('resultList').querySelector('button.person').click();
        await page.flush();
        page.$('characterBack').click();
        page.type(name);
        page.chooseWorld(world);
        page.submit();
        await page.flush();
        assert.equal(page.view(), 'search', label);
        assert.deepEqual(searches(), [['Aoi', 'Tiamat'], [name, world]], label);

        page.back();
        assert.equal(page.view(), 'landing', `${label}：先回到「← 找其他人」那一筆`);
        page.back();
        await page.flush();
        assert.deepEqual([page.view(), page.url()], ['character', `${PAGE}?id=23456789`], label);
        page.back();
        await page.flush();
        assert.deepEqual([page.view(), page.url()], ['landing', PAGE], `${label}：A 的結果已經不在記憶體裡，不顯示 B 的結果`);
        assert.deepEqual(searches(), [['Aoi', 'Tiamat'], [name, world]], `${label}：不再搜尋`);
        clean(page);
    }
});

test('沒按過名稱與成就顯示時跟著介面語言：看角色時切成日文介面就用日本語重新打標頭；按過就不跟', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: characterRoute(F.HIKARI) });
    await page.ready;
    page.setLang('ja');
    await page.flush();
    assert.deepEqual(paths(page), [...opened('12345678'), ...opened('12345678', 'jp')]);
    assert.deepEqual([pressed(page.$('dataLang')), pressed(page.$('profileCard'))], [['false', 'true'], ['false', 'true']]);
    page.setLang('en');
    await page.flush();
    assert.equal(page.requests.at(-1).params.dc, 'na');
    assert.equal(page.requests.length, 6);

    const chosen = createLodestonePage({ search: '?id=12345678', stored: { [KEYS.lang]: 'en' }, routes: characterRoute(F.HIKARI) });
    await chosen.ready;
    chosen.setLang('ja');
    await chosen.flush();
    assert.equal(chosen.requests.length, 2, '按過 English 就不跟著介面語言');
    assert.equal(chosen.profile().now, '現在：吟遊詩人 Lv100', '畫面上的字照樣換成日文');
    clean(page);
    clean(chosen);
});

test('切換介面語言：打開時、搜尋結果、角色標頭的字換成那個語言', async () => {
    const page = createLodestonePage({
        stored: { [KEYS.lang]: 'en', [KEYS.mine]: F.mineOf(F.HIKARI), [KEYS.recent]: [F.AOI].map(F.entryOf) },
        routes: { '/search/character': () => F.ok(F.search([F.AOI], { pageTotal: 2, total: 60 })), ...characterRoute(F.HIKARI) }
    });
    await page.ready;
    page.setLang('en');
    assert.equal(page.$('mineMeta').textContent, 'Tonberry (Elemental) · Bard Lv100');
    assert.equal(page.$('recentList').querySelector('.person-meta').textContent, 'Tiamat (Gaia)');
    assert.equal(page.$('searchButton').textContent, 'Search');
    page.setLang('ja');
    assert.equal(page.$('mineMeta').textContent, 'Tonberry（Elemental）・吟遊詩人 Lv100');

    page.type('Aoi');
    page.chooseWorld('Tiamat');
    page.submit();
    await page.flush();
    assert.equal(page.$('searchSummary').textContent, 'Tiamatで「Aoi」が60件見つかりました');
    page.setLang('en');
    assert.equal(page.$('searchSummary').textContent, 'Found 60 for “Aoi” on Tiamat');
    assert.equal(page.resultRows()[0].meta, 'Tiamat (Gaia) · FC Moonlit Garden');

    await page.app.openCharacter('12345678');
    assert.equal(page.profile().where, 'Tonberry (Elemental) · FC Example Company');
    assert.equal(page.profile().fetchedAt, `Data as of ${fetchedText('en-US')}`);
    assert.deepEqual(page.profile().mine, { text: '★ My character', pressed: 'true' }, '打開的是我的角色');
    page.setLang('zh');
    assert.deepEqual(page.profile().mine, { text: '★ 我的角色', pressed: 'true' });
    assert.equal(page.profile().fetchedAt, `資料時間：${fetchedText('zh-TW')}`);
    assert.equal(page.profile().where, 'Tonberry（Elemental）・部隊 Example Company');
    assert.equal(page.requests.length, 3, '按過 English：換介面語言不重打');
    clean(page);
});

// ---------- 舊的請求晚到（從 tests/lodestone-requests.test.js 搬來的標頭部分）----------

test('查 A 之後很快查 B：A 的資料晚到也不能蓋掉 B，A 的請求已取消', async () => {
    const oldBody = deferred();
    const page = createLodestonePage({
        routes: {
            '/character/12345678': () => ({ status: 200, json: () => oldBody.promise }),
            ...characterRoute(F.AOI)
        }
    });
    await page.ready;
    const first = page.app.openCharacter('12345678');
    await page.flush();
    await page.app.openCharacter('23456789');
    assert.equal(page.profile().name, 'Aoi Mizuno');
    oldBody.resolve(F.character(F.HIKARI));
    await first;
    assert.equal(page.profile().name, 'Aoi Mizuno');
    assert.equal(page.profile().where, 'Tiamat（Gaia）・部隊 Moonlit Garden', 'B 的部隊');
    assert.deepEqual([page.profile().busy, page.profile().loading], [false, null], 'A 晚到也不會讓 B 回到載入中');
    assert.equal(page.requests[0].signal.aborted, true);
    assert.equal(page.url(), `${PAGE}?id=23456789`);
    assert.deepEqual(storedJson(page, KEYS.recent).map((who) => who.id), ['23456789'], 'A 晚到的資料不記進最近查過');
    clean(page);
});

test('A 的錯誤與收尾不能蓋掉 B 的錯誤與載入狀態', async () => {
    const oldBody = deferred();
    const current = deferred();
    const page = createLodestonePage({
        routes: {
            '/character/12345678': () => ({ status: 200, json: () => oldBody.promise }),
            '/character/23456789': () => current.promise
        }
    });
    await page.ready;
    const first = page.app.openCharacter('12345678');
    await page.flush();
    const second = page.app.openCharacter('23456789');
    oldBody.reject(new SyntaxError('old body failed'));
    await first;
    assert.equal(page.$('characterError').hidden, true, 'A 的錯誤不顯示');
    assert.deepEqual([page.profile().busy, page.profile().loading], [true, '載入中…'], 'B 還在載入');
    current.resolve(F.fail(502, 'upstream'));
    await second;
    assert.equal(page.$('characterError').textContent, 'Lodestone 暫時連不上，請稍後再試');
    assert.equal(page.profile(), null);

    // 再換 C：B 的錯誤不留著
    page.routes['/character/34567890'] = () => F.ok(F.character(F.AOI_YA));
    await page.app.openCharacter('34567890');
    assert.equal(page.$('characterError').hidden, true);
    assert.equal(page.profile().name, 'Aoi Mizunoya');
    clean(page);
});

test('新的角色清掉舊角色的部隊、稱號、目前職業與資料時間', async () => {
    const page = createLodestonePage({
        routes: { ...characterRoute(F.HIKARI), [`/character/${F.REED.id}`]: () => F.ok(F.oldCharacter({ ...F.REED, job: null, level: null })) }
    });
    await page.ready;
    await page.app.openCharacter('12345678');
    assert.equal(page.profile().where, 'Tonberry（Elemental）・部隊 Example Company');
    await page.app.openCharacter(F.REED.id);
    const profile = page.profile();
    assert.equal(profile.name, 'Reed Blacke');
    assert.deepEqual([profile.title, profile.now, profile.fetchedAt], [null, null, null]);
    assert.equal(profile.where, 'Ragnarok（Chaos）');
    assert.equal(profile.lodestone.href, LODESTONE(F.REED.id));
    clean(page);
});

test('搜尋 A 之後很快搜尋 B：A 的結果晚到、A 失敗都不能蓋掉 B 的結果與載入狀態', async () => {
    // A 的回應已經回來、身體還在讀（不受取消影響），才搜尋 B
    const bodies = { Aoi: deferred(), Mira: deferred() };
    const reed = deferred();
    const page = createLodestonePage({
        routes: {
            '/search/character': (url) => {
                const name = url.searchParams.get('name');
                return name === 'Reed' ? reed.promise : { status: 200, json: () => bodies[name].promise };
            }
        }
    });
    await page.ready;
    page.type('Aoi');
    page.submit();
    await page.flush();
    page.type('Reed');
    page.submit();
    assert.equal(page.requests[0].signal.aborted, true, '取消 A');
    bodies.Aoi.resolve(F.search([F.AOI]));
    await page.flush();
    assert.equal(page.$('searchSummary').textContent, '載入中…', 'A 的結果晚到不畫，B 還在載入');
    assert.deepEqual(page.resultRows(), []);
    reed.resolve(F.ok(F.search([F.REED])));
    await page.flush();
    assert.equal(page.$('searchSummary').textContent, '找到 1 個「Reed」');
    assert.deepEqual(page.resultRows().map((row) => row.name), ['Reed Blacke']);

    // 搜尋 Mira 之後很快搜尋 Reed：Mira 的失敗晚到，不蓋掉 Reed 的結果
    page.type('Mira');
    page.submit();
    await page.flush();
    page.routes['/search/character'] = () => F.ok(F.search([F.REED, F.KAEDE]));
    page.type('Reed');
    page.submit();
    await page.flush();
    bodies.Mira.reject(new SyntaxError('late failure'));
    await page.flush();
    assert.equal(page.$('searchSummary').textContent, '找到 2 個「Reed」');
    assert.equal(page.$('searchFallback').hidden, true, 'Mira 的失敗不顯示');
    clean(page);
});

// ---------- 分頁 ----------

test('分頁：#tabList 裡六個 role="tab"（data-tab、id、aria-controls），六個 role="tabpanel"（aria-labelledby，沒選中的 hidden）；一打開是職業', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: characterRoute(F.HIKARI) });
    await page.ready;
    await page.flush();
    const list = page.$('tabList');
    assert.deepEqual([list.getAttribute('role'), list.getAttribute('aria-label')], ['tablist', '角色資料']);
    assert.deepEqual(list.children.map((tab) => [tab.tagName, tab.getAttribute('type'), tab.getAttribute('role'), tab.dataset.tab, tab.id, tab.getAttribute('aria-controls')]),
        TAB_KEYS.map((key) => ['BUTTON', 'button', 'tab', key, `tab-${key}`, `panel-${key}`]));
    assert.deepEqual(page.tabs().map((tab) => tab.text), ['職業', '成就', '裝備', '收藏', '部隊', '其他']);
    for (const key of TAB_KEYS) {
        const panel = page.$(`panel-${key}`);
        assert.deepEqual([panel.getAttribute('role'), panel.getAttribute('aria-labelledby')], ['tabpanel', `tab-${key}`], key);
    }
    assert.deepEqual(page.tabs().map((tab) => [tab.key, tab.selected, tab.tabindex, tab.active, tab.panelHidden]), [
        ['jobs', 'true', '0', true, false],
        ['achievements', 'false', '-1', false, true],
        ['gear', 'false', '-1', false, true],
        ['collections', 'false', '-1', false, true],
        ['fc', 'false', '-1', false, true],
        ['about', 'false', '-1', false, true]
    ]);
    clean(page);
});

test('分頁第一次打開才載入：打開角色只打標頭與 /classjob；成就打 /achievements?dc=…&page=1、再點一次不再打；收藏打 /mounts 與 /minions；部隊打 /freecompany/<id> 與 /members?page=1；裝備與其他不打', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: allRoutes() });
    await page.ready;
    await page.flush();
    assert.deepEqual(paths(page), opened('12345678'));

    page.selectTab('achievements');
    assert.deepEqual(selectedTab(page), ['achievements']);
    await page.flush();
    assert.deepEqual(paths(page).slice(2), ['/character/12345678/achievements?dc=na&page=1']);
    page.selectTab('jobs');
    page.selectTab('achievements');
    await page.flush();
    assert.equal(page.requests.length, 3, '再點一次不再打');

    page.selectTab('gear');
    page.selectTab('about');
    await page.flush();
    assert.equal(page.requests.length, 3, '裝備與其他的資料在角色回應裡');

    page.selectTab('collections');
    await page.flush();
    assert.deepEqual(paths(page).slice(3), ['/character/12345678/mounts?dc=na', '/character/12345678/minions?dc=na']);

    page.selectTab('fc');
    await page.flush();
    assert.deepEqual(paths(page).slice(5), ['/freecompany/9230000000000000001?dc=na', '/freecompany/9230000000000000001/members?dc=na&page=1']);

    for (const key of TAB_KEYS) page.selectTab(key);
    await page.flush();
    assert.equal(page.requests.length, 7, '每個分頁只載入一次');
    clean(page);
});

test('分頁鍵盤：左右方向鍵移動並切換（頭尾相接），Home／End 到第一個／最後一個，只有選中的 tabindex="0"；按著 Alt、Ctrl、⌘ 或別的鍵不處理', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: allRoutes() });
    await page.ready;
    const tab = (key) => page.$(`tab-${key}`);
    const where = () => [selectedTab(page)[0], page.document.activeElement.id];
    tab('jobs').focus();

    const right = page.key('ArrowRight');
    assert.equal(right.defaultPrevented, true);
    assert.deepEqual(where(), ['achievements', 'tab-achievements'], '右鍵：下一個，焦點跟著移過去');
    assert.deepEqual(page.tabs().map((t) => [t.selected, t.tabindex, t.active, t.panelHidden]), [
        ['false', '-1', false, true], ['true', '0', true, false], ['false', '-1', false, true],
        ['false', '-1', false, true], ['false', '-1', false, true], ['false', '-1', false, true]
    ]);
    assert.equal(page.key('End').defaultPrevented, true);
    assert.deepEqual(where(), ['about', 'tab-about']);
    page.key('ArrowRight');
    assert.deepEqual(where(), ['jobs', 'tab-jobs'], '最後一個再往右回到第一個');
    page.key('ArrowLeft');
    assert.deepEqual(where(), ['about', 'tab-about'], '第一個再往左到最後一個');
    page.key('ArrowLeft');
    assert.deepEqual(where(), ['fc', 'tab-fc']);
    assert.equal(page.key('Home').defaultPrevented, true);
    assert.deepEqual(where(), ['jobs', 'tab-jobs']);
    assert.deepEqual(page.tabs().map((t) => t.tabindex), ['0', '-1', '-1', '-1', '-1', '-1']);

    // 瀏覽器與系統的快速鍵（Alt＋← 是上一頁）、其他的鍵：不處理
    for (const init of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
        const event = page.key('ArrowRight', undefined, init);
        assert.equal(event.defaultPrevented, false, JSON.stringify(init));
        assert.deepEqual(where(), ['jobs', 'tab-jobs'], JSON.stringify(init));
    }
    for (const name of ['a', 'Enter', 'ArrowDown', 'constructor']) {
        assert.equal(page.key(name).defaultPrevented, false, name);
        assert.deepEqual(where(), ['jobs', 'tab-jobs'], name);
    }
    // 焦點在面板裡時，方向鍵是面板自己的
    page.$('panel-jobs').focus();
    assert.equal(page.key('ArrowRight').defaultPrevented, false);
    assert.deepEqual(selectedTab(page), ['jobs']);
    await page.flush();
    clean(page);
});

test('換角色回到職業；換名稱與成就顯示留在原本的分頁、重新打那個分頁，其他打開過的分頁下次打開再載入', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: { ...allRoutes(F.HIKARI), ...allRoutes(F.AOI) } });
    await page.ready;
    page.selectTab('collections');
    page.selectTab('achievements');
    await page.flush();
    const before = page.requests.length;
    assert.equal(before, 5);

    const japanese = page.$('profileCard').querySelector('button[data-lang="ja"]');
    japanese.focus();
    japanese.click();
    assert.deepEqual(selectedTab(page), ['achievements'], '留在成就');
    isSame(page.document.activeElement, page.$('profileCard').querySelector('button[data-lang="ja"]'), '焦點留在按下去的按鈕');
    assert.equal(page.$('panel-achievements').getAttribute('aria-busy'), 'true', '成就重新載入');
    await page.flush();
    assert.deepEqual(paths(page).slice(before), ['/character/12345678?dc=jp', '/character/12345678/achievements?dc=jp&page=1'], '重新打標頭與成就，職業與收藏沒有打');
    assert.equal(page.$('panel-achievements').getAttribute('aria-busy'), 'false');
    page.selectTab('collections');
    await page.flush();
    assert.deepEqual(paths(page).slice(before + 2), ['/character/12345678/mounts?dc=jp', '/character/12345678/minions?dc=jp'], '收藏下次打開再載入');
    page.selectTab('jobs');
    await page.flush();
    assert.deepEqual(paths(page).slice(before + 4), ['/character/12345678/classjob?dc=jp']);

    // 換角色：回到職業，其他分頁清空
    page.selectTab('fc');
    await page.flush();
    await page.app.openCharacter(F.AOI.id);
    await page.flush();
    assert.deepEqual(selectedTab(page), ['jobs']);
    assert.deepEqual(page.tabs().map((t) => [t.tabindex, t.panelHidden]), [['0', false], ['-1', true], ['-1', true], ['-1', true], ['-1', true], ['-1', true]]);
    for (const key of TAB_KEYS.slice(1)) assert.equal(page.panelText(key), '', `${key} 清空了`);
    assert.deepEqual(paths(page).slice(-2), opened(F.AOI.id, 'jp'));
    clean(page);
});

test('換名稱與成就顯示時開著部隊、裝備或其他：留在那個分頁，新的標頭回來之前寫載入中，回來之後用新的語言載入（部隊打 dc=jp 的部隊與成員第 1 頁，裝備與其他照新的標頭重畫）', async () => {
    // 日本語的標頭先扣住；放行時回來的是 who（日文官網的角色）
    const open = async (tab) => {
        const header = deferred();
        const page = createLodestonePage({
            search: '?id=12345678',
            routes: {
                ...allRoutes(),
                '/character/12345678': (url) => (url.searchParams.get('dc') === 'jp' ? header.promise : F.ok(F.character(F.HIKARI))),
                '/freecompany/9230000000000000001': (url) => F.ok(url.searchParams.get('dc') === 'jp' ? F.freeCompanyJa() : F.freeCompany())
            }
        });
        await page.ready;
        page.selectTab(tab);
        await page.flush();
        const before = page.requests.length;
        page.$('profileCard').querySelector('button[data-lang="ja"]').click();
        await page.flush();
        assert.deepEqual(selectedTab(page), [tab], `${tab}：留在原本的分頁`);
        assert.deepEqual(paths(page).slice(before), ['/character/12345678?dc=jp'], `${tab}：先等新的標頭`);
        assert.deepEqual([page.$(`panel-${tab}`).getAttribute('aria-busy'), page.panelText(tab)], ['true', '載入中…'], `${tab}：新的標頭回來之前`);
        return { page, after: () => paths(page).slice(before), release: (who) => header.resolve(F.ok(F.character(who))) };
    };

    // 部隊：標頭回來之後才打部隊的資料與成員（dc=jp），畫的是日文官網的原文
    const fc = await open('fc');
    fc.release(F.HIKARI);
    await fc.page.flush();
    assert.deepEqual(fc.after(), ['/character/12345678?dc=jp', '/freecompany/9230000000000000001?dc=jp', '/freecompany/9230000000000000001/members?dc=jp&page=1']);
    const fcPanel = fc.page.$('panel-fc');
    assert.deepEqual([selectedTab(fc.page), fcPanel.getAttribute('aria-busy')], [['fc'], 'false']);
    assert.deepEqual(rowsOf(fcPanel.querySelector('.fc-facts')).filter(([label]) => ['人數', '招募狀態'].includes(label)), [['人數', '42名'], ['招募狀態', '申請可']]);
    assert.equal(fcPanel.querySelectorAll('.fc-members button.person').length, 2);
    clean(fc.page);

    // 裝備：不打請求，照新的標頭重畫（目前職業與裝備都換了）
    const gear = await open('gear');
    gear.release({ ...F.HIKARI, job: 'Dancer', level: 90, gear: [{ Slot: 'MainHand', Icon: F.itemIcon('chakrams'), Dyes: ['#112233'] }] });
    await gear.page.flush();
    assert.deepEqual(gear.after(), ['/character/12345678?dc=jp'], '裝備不打新的請求');
    const gearPanel = gear.page.$('panel-gear');
    assert.deepEqual([gearPanel.getAttribute('aria-busy'), gearPanel.querySelector('.gear-now').textContent], ['false', '現在：舞者 Lv90']);
    assert.deepEqual(gearPanel.querySelectorAll('.gear-slot img').map((img) => img.src), [F.itemIcon('chakrams')]);
    clean(gear.page);

    // 其他：同樣照新的標頭重畫
    const about = await open('about');
    about.release({ ...F.HIKARI, details: { GrandCompany: { Name: '双蛇党', Rank: '二等双蛇兵' } } });
    await about.page.flush();
    assert.deepEqual(about.after(), ['/character/12345678?dc=jp']);
    assert.deepEqual(rowsOf(about.page.$('panel-about').querySelector('dl'))[0], ['大國防聯軍', '雙蛇黨・二等双蛇兵']);
    assert.equal(about.page.$('panel-about').getAttribute('aria-busy'), 'false');
    clean(about.page);
});

test('職業：七組照官方順序與名稱，蝮蛇劍士與 Beastmaster（文字圖示）在近戰，繪靈法師與青魔法師在魔法；Lv100 才是滿級，青魔法師 80 不是；沒解鎖寫「—」；滿級 N 個；特殊內容照 Worker 的名稱', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: characterRoute(F.HIKARI) });
    await page.ready;
    await page.flush();
    const panel = page.$('panel-jobs');
    assert.equal(panel.getAttribute('aria-busy'), 'false');
    const groups = panel.querySelectorAll('.role-group').map((group) => ({
        label: group.querySelector('.role-label').textContent,
        jobs: group.querySelectorAll('.job').map((job) => [job.querySelector('.job-name').textContent, job.querySelector('.job-level').textContent])
    }));
    assert.deepEqual(groups.map((group) => group.label), ['坦克', '治療', '近戰', '遠程', '魔法', '生產', '採集']);
    assert.deepEqual(groups.map((group) => group.jobs.length), [4, 4, 7, 3, 5, 8, 3]);
    assert.deepEqual(groups[0].jobs, [['騎士', '100'], ['戰士', '92'], ['暗黑騎士', '80'], ['絕槍戰士', '—']]);
    assert.deepEqual(groups[1].jobs, [['白魔法師', '100'], ['學者', '90'], ['占星術士', '74'], ['賢者', '—']]);
    assert.deepEqual(groups[2].jobs, [['武僧', '81'], ['龍騎士', '100'], ['忍者', '64'], ['武士', '100'], ['鐮刀客', '90'], ['蝮蛇劍士', '95'], ['Beastmaster', '50']]);
    assert.deepEqual(groups[3].jobs, [['吟遊詩人', '100'], ['機工士', '77'], ['舞者', '88']]);
    assert.deepEqual(groups[4].jobs, [['黑魔法師', '100'], ['召喚師', '90'], ['赤魔法師', '83'], ['繪靈法師', '100'], ['青魔法師', '80']]);
    assert.deepEqual(groups[5].jobs.map(([name]) => name), ['刻木匠', '鍛鐵匠', '鎧甲匠', '雕金匠', '製革匠', '裁縫匠', '煉金術士', '烹調師']);
    assert.deepEqual(groups[6].jobs, [['採礦工', '100'], ['園藝工', '100'], ['捕魚人', '72']]);

    const job = (name) => panel.querySelectorAll('.job').find((item) => item.querySelector('.job-name').textContent === name);
    const flags = (name) => [job(name).classList.contains('max'), job(name).classList.contains('none')];
    assert.deepEqual(flags('繪靈法師'), [true, false], 'Lv100 是滿級（綠色加粗）');
    assert.deepEqual(flags('青魔法師'), [false, false], '青魔法師的等級上限不是 100');
    assert.deepEqual(flags('Beastmaster'), [false, false]);
    assert.deepEqual(flags('戰士'), [false, false]);
    assert.deepEqual(flags('賢者'), [false, true], '沒解鎖（-）變淡');
    assert.deepEqual(flags('絕槍戰士'), [false, true], '0 級也是沒解鎖');
    assert.deepEqual([job('騎士').querySelector('img').src, job('騎士').querySelector('img').alt], ['../../assets/images/se/FFXIVJobIcons/01_TANK/Job/Paladin.png', '']);
    assert.equal(job('青魔法師').querySelector('img').src, '../../assets/images/se/FFXIVJobIcons/06_LIMITED/BlueMage.png');
    assert.ok(job('Beastmaster').querySelector('img') === null, '網站沒有 Beastmaster 的圖示');
    const textIcon = job('Beastmaster').querySelector('.job-text-icon');
    assert.deepEqual([textIcon.textContent, textIcon.getAttribute('aria-hidden')], ['B', 'true']);
    assert.equal(panel.querySelector('.maxed-count').textContent, '滿級 13 個');
    assert.equal(panel.querySelector('.special-content').textContent, '特殊內容：Knowledge Level 3', '名稱照 Worker 的 Name，不照鍵名');
    clean(page);

    // 還沒轉職的騎士（官網那一列是 Gladiator）放在騎士那一格；沒有特殊內容就沒有那一行；日文的特殊內容照原文
    const routes = (special) => ({
        ...characterRoute(F.HIKARI),
        '/character/12345678/classjob': () => F.ok(F.classJobs({ levels: { Paladin: '30' }, shown: { Paladin: 'Gladiator' }, special }))
    });
    const fresh = createLodestonePage({ search: '?id=12345678', routes: routes(null) });
    await fresh.ready;
    await fresh.flush();
    const freshPanel = fresh.$('panel-jobs');
    assert.deepEqual(freshPanel.querySelector('.job').textContent, '騎士30');
    assert.equal(freshPanel.querySelector('.maxed-count').textContent, '滿級 0 個');
    assert.ok(freshPanel.querySelector('.special-content') === null, '沒有特殊內容就不寫');
    clean(fresh);
    const occult = createLodestonePage({ search: '?id=12345678', routes: routes({ Bozja: { Name: 'ナレッジレベル', Level: '12', Mettle: '0' }, Eureka: { Name: 'Elemental Level', Level: '-' } }) });
    await occult.ready;
    await occult.flush();
    assert.equal(occult.$('panel-jobs').querySelector('.special-content').textContent, '特殊內容：ナレッジレベル 12', '沒有等級的不寫');
    clean(occult);
});

test('成就：成就數與點數、每一筆的名稱與日期（沒有日期的不寫）；上一頁／下一頁；沒有 Pagination 是一頁；403 是「這個角色沒有公開成就」；其他失敗寫原因', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: allRoutes() });
    await page.ready;
    page.selectTab('achievements');
    const panel = page.$('panel-achievements');
    assert.equal(panel.getAttribute('aria-busy'), 'true');
    assert.equal(page.panelText('achievements'), '載入中…');
    await page.flush();
    assert.equal(panel.getAttribute('aria-busy'), 'false');
    assert.deepEqual(panel.querySelectorAll('.achievement-stat').map((stat) => stat.textContent), ['2,567 個成就', '24,530 點']);
    const rows = () => panel.querySelectorAll('.achievement').map((item) => {
        const time = item.querySelector('time');
        return [item.querySelector('.achievement-name').textContent, time ? [time.getAttribute('datetime'), time.textContent] : null];
    });
    assert.deepEqual(rows(), [
        ['Tank You, Dawntrail III', ['2026-11-07T10:00:00.000Z', dateText('2026-11-07T10:00:00.000Z', 'zh-TW')]],
        ['Mastering War VII', null]
    ]);
    let pager = pagerOf(page, 'achievements');
    assert.deepEqual([pager.prev.textContent, pager.info, pager.next.textContent, pager.prevDisabled, pager.nextDisabled], ['上一頁', '第 1 頁，共 3 頁', '下一頁', true, false]);
    assert.deepEqual([pager.prev.getAttribute('type'), pager.next.getAttribute('type')], ['button', 'button']);

    pager.next.focus();
    pager.next.click();
    assert.equal(page.requests.at(-1).path, '/character/12345678/achievements?dc=na&page=2');
    assert.equal(pagerOf(page, 'achievements').info, '第 2 頁，共 3 頁');
    isSame(page.document.activeElement, pagerOf(page, 'achievements').next, '換頁時焦點留在下一頁');
    await page.flush();
    assert.deepEqual(rows().map(([name]) => name), ['Level with It III', 'Leaves of Grass']);
    pager = pagerOf(page, 'achievements');
    assert.deepEqual([pager.info, pager.prevDisabled, pager.nextDisabled], ['第 2 頁，共 3 頁', false, false]);
    isSame(page.document.activeElement, pager.next, '新的一頁畫好之後焦點還在下一頁');
    pager.next.click();
    await page.flush();
    pager = pagerOf(page, 'achievements');
    assert.deepEqual([pager.info, pager.prevDisabled, pager.nextDisabled], ['第 3 頁，共 3 頁', false, true]);
    assert.deepEqual(rows().map(([name]) => name), ['To Crush Your Enemies I']);
    assert.deepEqual(panel.querySelectorAll('.achievement-stat').map((stat) => stat.textContent), ['2,567 個成就', '24,530 點']);
    // 最後一頁的下一頁按了沒反應（aria-disabled，焦點不會掉）
    const count = page.requests.length;
    pager.next.focus();
    pager.next.click();
    assert.equal(page.requests.length, count);
    isSame(page.document.activeElement, pager.next, '焦點留在按鈕上');
    pager.prev.click();
    await page.flush();
    assert.equal(page.requests.at(-1).params.page, '2');
    assert.equal(pagerOf(page, 'achievements').info, '第 2 頁，共 3 頁');
    clean(page);

    const open = async (route) => {
        const other = createLodestonePage({ search: '?id=12345678', routes: { ...characterRoute(F.HIKARI), '/character/12345678/achievements': route } });
        await other.ready;
        other.selectTab('achievements');
        await other.flush();
        clean(other);
        return other;
    };
    // 沒有 Pagination：只有一頁，沒有上一頁／下一頁
    const single = await open(() => F.ok(F.achievements({ pagination: false })));
    assert.ok(pagerOf(single, 'achievements') === null);
    assert.equal(single.$('panel-achievements').querySelectorAll('.achievement').length, 2);
    // 只有一頁的 Pagination 也一樣
    assert.ok(pagerOf(await open(() => F.ok(F.achievements({ pageTotal: 1 }))), 'achievements') === null);
    // 不公開
    const hidden = await open(() => F.fail(403, 'private'));
    assert.equal(hidden.panelText('achievements'), '這個角色沒有公開成就');
    assert.ok(hidden.$('panel-achievements').querySelector('.error-message') === null, '不是錯誤');
    assert.ok(pagerOf(hidden, 'achievements') === null);
    // Lodestone 連不上、其他失敗
    assert.equal((await open(() => F.fail(502, 'upstream'))).$('panel-achievements').querySelector('.error-message').textContent, 'Lodestone 暫時連不上，請稍後再試');
    assert.equal((await open(() => F.fail(500, 'internal'))).$('panel-achievements').querySelector('.error-message').textContent, '查詢失敗');
    assert.equal((await open(() => F.ok({ FetchedAt: F.FETCHED_AT }))).$('panel-achievements').querySelector('.error-message').textContent, '查詢失敗', '回應沒有 Achievements');
});

test('裝備：現在的職業；每一格是 Gear 的圖示（alt 空的）與部位名稱，有副手時列副手，臉部不列；染過的部位畫出顏色（最多兩色、不是 #rrggbb 的不畫）；說明一行；屬性收在 <details>', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: characterRoute(F.HIKARI) });
    await page.ready;
    page.selectTab('gear');
    const panel = page.$('panel-gear');
    assert.equal(panel.getAttribute('aria-busy'), 'false');
    assert.equal(panel.querySelector('.gear-now').textContent, '現在：吟遊詩人 Lv100');
    const slots = (p) => p.$('panel-gear').querySelectorAll('.gear-slot').map((cell) => {
        const icon = cell.querySelector('img');
        return {
            name: cell.querySelector('.gear-slot-name').textContent,
            icon: [icon.src, icon.alt],
            dyes: cell.querySelectorAll('.dye').map((dot) => [dot.style.background, dot.getAttribute('aria-hidden')])
        };
    });
    const cells = slots(page);
    assert.deepEqual(cells.map((cell) => cell.name), ['主手', '頭部', '身體', '手部', '腿部', '腳部', '耳飾', '頸飾', '腕飾', '戒指1', '戒指2', '靈魂水晶']);
    assert.deepEqual(cells[0].icon, [F.itemIcon('main-hand'), '']);
    assert.ok(cells.every((cell) => cell.icon[1] === ''), '圖示的替代文字是空的，格子的名稱是部位名稱');
    assert.deepEqual(cells.map((cell) => cell.dyes.map(([color]) => color)), [
        ['#e69f96'], [], ['#a1b2c3', '#334455'], ['#123456'], [], ['#ABCDEF'], [], [], [], [], [], []
    ]);
    assert.ok(cells.flatMap((cell) => cell.dyes).every(([, hidden]) => hidden === 'true'), '色點只是畫面');
    assert.equal(panel.querySelector('.gear-note').textContent, 'Lodestone 的角色頁只有裝備圖示，沒有名稱。');
    assert.ok(panel.querySelector('.gear-none') === null);

    const details = panel.querySelector('details');
    assert.ok(details.classList.contains('attributes'));
    assert.equal(details.hasAttribute('open'), false, '屬性收起來');
    assert.equal(details.querySelector('summary').textContent, '屬性');
    assert.deepEqual(details.querySelectorAll('.attribute-group').map((group) => [group.querySelector('h4').textContent, rowsOf(group.querySelector('dl'))]), [
        ['主屬性', [['力量', '421'], ['靈巧', '4980'], ['耐力', '5190'], ['智力', '392'], ['精神', '1563']]],
        ['副屬性', [['爆擊', '3174'], ['意志', '2163'], ['直擊', '1564'], ['技巧速度', '420'], ['詠唱速度', '411'], ['信仰', '440'], ['堅韌', '400']]]
    ]);
    assert.equal(page.requests.length, 2, '裝備不打新的請求');
    clean(page);

    // 騎士：有副手（照部位的順序，不照回應的順序）；超過兩色只畫兩色；認不得的部位不列
    const paladin = createLodestonePage({
        search: '?id=12345678',
        routes: characterRoute({
            ...F.HIKARI, job: 'Paladin',
            gear: [
                { Slot: 'OffHand', Icon: F.itemIcon('shield'), Dyes: ['#111111', '#222222', '#333333'] },
                { Slot: 'MainHand', Icon: F.itemIcon('sword'), Dyes: [] },
                { Slot: 'Waist', Icon: F.itemIcon('belt'), Dyes: [] },
                { Slot: 'Head', Icon: '', Dyes: [] }
            ]
        })
    });
    await paladin.ready;
    paladin.selectTab('gear');
    assert.deepEqual(slots(paladin).map((cell) => [cell.name, cell.icon[0], cell.dyes.map(([color]) => color)]), [
        ['主手', F.itemIcon('sword'), []],
        ['副手', F.itemIcon('shield'), ['#111111', '#222222']]
    ]);
    clean(paladin);

    // 舊 Worker（沒有 Gear）、Gear 是空的：寫「沒有裝備資料。」，屬性照樣有
    for (const [label, routes] of [
        ['舊 Worker', { '/character/12345678': () => F.ok(F.oldCharacter(F.HIKARI)) }],
        ['Gear 是空的', characterRoute({ ...F.HIKARI, gear: [] })]
    ]) {
        const other = createLodestonePage({ search: '?id=12345678', routes });
        await other.ready;
        other.selectTab('gear');
        const otherPanel = other.$('panel-gear');
        assert.equal(otherPanel.querySelector('.gear-none').textContent, '沒有裝備資料。', label);
        assert.ok(otherPanel.querySelector('.gear-slot') === null && otherPanel.querySelector('.gear-note') === null, label);
        assert.equal(otherPanel.querySelectorAll('.attribute-group').length, 2, label);
        clean(other);
    }
    // 舊 Worker 的目前職業：官網圖示加等級
    const old = createLodestonePage({ search: '?id=12345678', routes: { '/character/12345678': () => F.ok(F.oldCharacter(F.HIKARI)) } });
    await old.ready;
    old.selectTab('gear');
    const now = old.$('panel-gear').querySelector('.gear-now');
    assert.equal(now.textContent, '現在：Lv100');
    assert.deepEqual([now.querySelector('img').src, now.querySelector('img').alt], [F.BARD_ICON, '目前職業']);
    clean(old);
});

test('收藏：坐騎 N、寵物 N；篩選框同時篩兩個清單（不分大小寫），一個都沒有時寫出來；一邊失敗不影響另一邊', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: allRoutes() });
    await page.ready;
    page.selectTab('collections');
    assert.equal(page.$('panel-collections').getAttribute('aria-busy'), 'true');
    await page.flush();
    const panel = page.$('panel-collections');
    assert.equal(panel.getAttribute('aria-busy'), 'false');
    const sections = () => panel.querySelectorAll('.collection').map((section) => {
        const none = section.querySelector('.collection-empty');
        return {
            title: section.querySelector('.collection-title').textContent,
            shown: section.querySelectorAll('.collection-item').filter((item) => !item.hidden).map((item) => item.textContent),
            none: none && !none.hidden ? none.textContent : null
        };
    });
    assert.deepEqual(sections(), [
        { title: '坐騎 103', shown: [...F.MOUNTS], none: null },
        { title: '寵物 269', shown: [...F.MINIONS], none: null }
    ]);
    const icon = panel.querySelector('.collection-item img');
    assert.deepEqual([icon.src, icon.alt], [F.itemIcon('mounts-0'), '']);

    const filter = panel.querySelector('input');
    const label = panel.querySelector('label');
    assert.deepEqual([label.textContent, label.getAttribute('for'), filter.id, filter.getAttribute('type')], ['篩選名稱', filter.id, 'collectionFilter', 'search']);
    typeInto(page, filter, 'CHOCO');
    assert.deepEqual(sections().map((section) => [section.shown, section.none]), [
        [['Company Chocobo', 'Black Chocobo'], null],
        [['Black Chocobo Chick'], null]
    ]);
    typeInto(page, filter, '  behemoth ');
    assert.deepEqual(sections().map((section) => [section.shown, section.none]), [[[], '沒有符合的名稱'], [['Baby Behemoth'], null]]);
    assert.deepEqual(sections().map((section) => section.title), ['坐騎 103', '寵物 269'], '數字照舊是總數');

    // 換到別的分頁再回來：篩選照舊，不再打
    const count = page.requests.length;
    page.selectTab('jobs');
    page.selectTab('collections');
    assert.equal(panel.querySelector('input').value, '  behemoth ');
    assert.deepEqual(sections()[1].shown, ['Baby Behemoth']);
    typeInto(page, panel.querySelector('input'), '');
    assert.deepEqual(sections().map((section) => section.shown.length), [3, 4]);
    assert.equal(page.requests.length, count);
    clean(page);

    // 坐騎失敗、寵物照常；寵物晚一點才回來，篩選框打的字不會被清掉
    const minions = deferred();
    const half = createLodestonePage({
        search: '?id=12345678',
        routes: { ...allRoutes(), '/character/12345678/mounts': () => F.fail(502, 'upstream'), '/character/12345678/minions': () => minions.promise }
    });
    await half.ready;
    half.selectTab('collections');
    await half.flush();
    const halfPanel = half.$('panel-collections');
    const halfFilter = halfPanel.querySelector('input');
    halfFilter.focus();
    typeInto(half, halfFilter, 'cait');
    minions.resolve(F.ok(F.minions()));
    await half.flush();
    isSame(halfPanel.querySelector('input'), halfFilter, '篩選框還是同一個');
    isSame(half.document.activeElement, halfFilter, '焦點還在篩選框');
    const [mountSection, minionSection] = halfPanel.querySelectorAll('.collection');
    assert.deepEqual([mountSection.querySelector('.collection-title').textContent, mountSection.querySelector('.error-message').textContent], ['坐騎', 'Lodestone 暫時連不上，請稍後再試']);
    assert.deepEqual(minionSection.querySelectorAll('.collection-item').filter((item) => !item.hidden).map((item) => item.textContent), ['Cait Sith Doll']);
    clean(half);
});

test('部隊：名稱、標語、人數、排名、招募狀態、部隊房屋、活動重點、招募對象與三國聲望（中文介面換成官方中文，英文介面是原文）；不寫 Tag 與 ActiveState；沒有加入部隊寫出來、不打請求', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: allRoutes() });
    await page.ready;
    page.selectTab('fc');
    assert.equal(page.$('panel-fc').getAttribute('aria-busy'), 'true');
    await page.flush();
    const panel = page.$('panel-fc');
    assert.equal(panel.getAttribute('aria-busy'), 'false');
    assert.equal(panel.querySelector('.fc-name').textContent, 'Example Company');
    assert.equal(panel.querySelector('.fc-slogan').textContent, 'Weekend raids, weekday crafting.');
    assert.deepEqual(rowsOf(panel.querySelector('.fc-facts')), [
        ['人數', '42'],
        ['排名', '每週 12・每月 34'],
        ['招募狀態', 'Open'],
        ['部隊房屋', 'Example Manor・Plot 30, 1st Ward, Mist (Medium)'],
        ['活動重點', '角色扮演・公會令・大型任務'],
        ['招募對象', '坦克・治療'],
        ['大國防聯軍聲望', '黑渦團・同盟雙蛇黨・中立不滅隊・中立']
    ]);
    assert.deepEqual(panel.querySelectorAll('.fc-reputation li').map((item) => item.textContent), ['黑渦團・同盟', '雙蛇黨・中立', '不滅隊・中立']);
    for (const hidden of ['«EXMP»', 'Active', 'Welcome!']) assert.ok(!page.panelText('fc').includes(hidden), `不寫 ${hidden}`);
    clean(page);

    // 日文官網的原文（名稱與成就顯示是日本語）：中文介面一樣換成官方中文
    const ja = createLodestonePage({
        search: '?id=12345678', stored: { [KEYS.lang]: 'ja' },
        routes: { ...allRoutes(), '/freecompany/9230000000000000001': () => F.ok(F.freeCompanyJa()) }
    });
    await ja.ready;
    ja.selectTab('fc');
    await ja.flush();
    assert.equal(ja.requests.at(-2).path, '/freecompany/9230000000000000001?dc=jp');
    assert.deepEqual(rowsOf(ja.$('panel-fc').querySelector('.fc-facts')).filter(([label]) => ['人數', '招募狀態', '活動重點', '招募對象'].includes(label)), [
        ['人數', '42名'], ['招募狀態', '申請可'], ['活動重點', '角色扮演・公會令・大型任務'], ['招募對象', '坦克・治療']
    ]);
    assert.deepEqual(ja.$('panel-fc').querySelectorAll('.fc-reputation li').map((item) => item.textContent), ['黑渦團・同盟', '雙蛇黨・中立', '不滅隊・中立']);
    clean(ja);

    // 英文介面：原文
    const en = createLodestonePage({ lang: 'en', search: '?id=12345678', routes: allRoutes() });
    await en.ready;
    en.selectTab('fc');
    await en.flush();
    assert.deepEqual(rowsOf(en.$('panel-fc').querySelector('.fc-facts')), [
        ['Active members', '42'],
        ['Ranking', 'Weekly 12 · Monthly 34'],
        ['Recruitment', 'Open'],
        ['Estate', 'Example Manor · Plot 30, 1st Ward, Mist (Medium)'],
        ['Focus', 'Role-playing · Guildhests · Raids'],
        ['Seeking', 'Tank · Healer'],
        ['Grand Company Reputation', 'Maelstrom · AlliedOrder of the Twin Adder · NeutralImmortal Flames · Neutral']
    ]);
    clean(en);

    // 沒有加入部隊：不打部隊的請求
    const loner = createLodestonePage({ search: `?id=${F.REED.id}`, routes: allRoutes(F.REED) });
    await loner.ready;
    loner.selectTab('fc');
    await loner.flush();
    assert.equal(loner.panelText('fc'), '沒有加入部隊');
    assert.equal(loner.$('panel-fc').getAttribute('aria-busy'), 'false');
    assert.deepEqual(paths(loner), opened(F.REED.id));
    clean(loner);
});

test('部隊成員：分頁換頁；點一列打開那個成員（新增一筆上一頁、回到職業、焦點在「← 找其他人」），點自己那一列是重新打開（換掉這一筆，不新增上一頁）', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: { ...allRoutes(F.HIKARI), ...allRoutes(F.AOI) } });
    await page.ready;
    page.selectTab('fc');
    await page.flush();
    const panel = page.$('panel-fc');
    const rows = () => panel.querySelectorAll('.fc-members button.person').map((row) => [row.dataset.id, row.querySelector('.person-name').textContent, row.querySelector('.person-meta').textContent]);
    assert.equal(panel.querySelector('.fc-members h3').textContent, '成員');
    assert.deepEqual(rows(), [['12345678', 'Hikari Senshi', 'Master'], ['23456789', 'Aoi Mizuno', 'Officer']]);
    assert.equal(spokenText(panel.querySelector('.fc-members button.person')), 'Hikari Senshi，Master', '螢幕閱讀器念的名字和部隊階級中間有停頓');
    let pager = pagerOf(page, 'fc');
    assert.deepEqual([pager.info, pager.prevDisabled, pager.nextDisabled], ['第 1 頁，共 3 頁', true, false]);
    pager.next.focus();
    pager.next.click();
    assert.equal(page.requests.at(-1).path, '/freecompany/9230000000000000001/members?dc=na&page=2');
    await page.flush();
    assert.deepEqual(rows(), [['56789012', 'Reed Blacke', 'Member']]);
    assert.equal(panel.querySelector('.fc-name').textContent, 'Example Company', '部隊的資料留著');
    isSame(page.document.activeElement, pagerOf(page, 'fc').next, '焦點留在下一頁');
    pagerOf(page, 'fc').prev.click();
    await page.flush();
    assert.deepEqual(rows().map(([id]) => id), ['12345678', '23456789']);

    // 點自己那一列：已經在看這個角色，換掉這一筆（不新增上一頁），重新打標頭與職業，回到職業
    const pushes = () => page.history.filter((call) => call.method === 'pushState').length;
    const before = pushes();
    const self = panel.querySelector('button.person[data-id="12345678"]');
    self.focus();
    self.click();
    assert.equal(pushes(), before, '不新增上一頁');
    assert.deepEqual(page.history.at(-1), { method: 'replaceState', state: { view: 'character', id: '12345678' }, url: `${PAGE}?id=12345678` });
    assert.deepEqual(selectedTab(page), ['jobs']);
    isSame(page.document.activeElement, page.$('characterBack'), '那一列跟著分頁清掉了：焦點移到「← 找其他人」');
    await page.flush();
    assert.deepEqual(paths(page).slice(-2), opened('12345678'));
    assert.equal(page.profile().name, 'Hikari Senshi');

    // 點別人：新增一筆上一頁，打開那個人
    page.selectTab('fc');
    await page.flush();
    const aoi = page.$('panel-fc').querySelector('button.person[data-id="23456789"]');
    aoi.focus();
    aoi.click();
    assert.equal(pushes(), before + 1);
    assert.deepEqual(page.history.at(-1), { method: 'pushState', state: { view: 'character', id: '23456789' }, url: `${PAGE}?id=23456789` });
    isSame(page.document.activeElement, page.$('characterBack'), '焦點移到「← 找其他人」');
    await page.flush();
    assert.equal(page.profile().name, 'Aoi Mizuno');
    assert.deepEqual(selectedTab(page), ['jobs']);
    assert.deepEqual(paths(page).slice(-2), opened('23456789'));

    // 上一頁回到原本的角色：重新打標頭，回到職業
    page.back();
    await page.flush();
    assert.equal(page.profile().name, 'Hikari Senshi');
    assert.deepEqual(selectedTab(page), ['jobs']);
    clean(page);
});

test('其他：大國防聯軍（官方中文加軍階原文）、生日、守護神、開始城市（官方中文）、簡介保留換行；- 與 未設定 的簡介不寫那一行；英文介面是原文', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: characterRoute({ ...F.HIKARI, bio: 'Weekend raids.\nWeekday crafting.' }) });
    await page.ready;
    page.selectTab('about');
    const list = page.$('panel-about').querySelector('dl');
    assert.deepEqual(rowsOf(list), [
        ['大國防聯軍', '黑渦團・Storm Captain'],
        ['生日', '1st Sun of the 1st Astral Moon'],
        ['守護神', 'Menphina, the Lover'],
        ['開始城市', '格里達尼亞'],
        ['個人簡介', 'Weekend raids.Weekday crafting.']
    ]);
    const bio = list.querySelectorAll('dd').at(-1);
    assert.deepEqual(bio.childNodes.map((node) => (node.nodeType === 1 ? node.tagName : node.textContent)), ['Weekend raids.', 'BR', 'Weekday crafting.'], '簡介的換行是 <br>');
    assert.equal(page.requests.length, 2, '其他不打新的請求');
    clean(page);

    // 日文官網的原文：双蛇党 → 雙蛇黨、グリダニア → 格里達尼亞，軍階照原文
    const ja = createLodestonePage({
        search: '?id=12345678', stored: { [KEYS.lang]: 'ja' },
        routes: characterRoute({ ...F.HIKARI, details: { GrandCompany: { Name: '双蛇党', Rank: '二等双蛇兵' }, Town: { Name: 'グリダニア' }, Nameday: '星1月1日', GuardianDeity: { Name: '月神メネフィナ' } } })
    });
    await ja.ready;
    ja.selectTab('about');
    assert.deepEqual(rowsOf(ja.$('panel-about').querySelector('dl')), [
        ['大國防聯軍', '雙蛇黨・二等双蛇兵'], ['生日', '星1月1日'], ['守護神', '月神メネフィナ'], ['開始城市', '格里達尼亞']
    ]);
    clean(ja);

    // 簡介沒填（官網的 -、日文版的 未設定、空白）：不寫那一行
    for (const empty of ['-', '未設定', '', '   ']) {
        const other = createLodestonePage({ search: '?id=12345678', routes: characterRoute({ ...F.HIKARI, bio: empty }) });
        await other.ready;
        other.selectTab('about');
        assert.ok(!rowsOf(other.$('panel-about').querySelector('dl')).some(([label]) => label === '個人簡介'), JSON.stringify(empty));
        clean(other);
    }

    // 英文介面：原文
    const en = createLodestonePage({ lang: 'en', search: '?id=12345678', routes: characterRoute(F.HIKARI) });
    await en.ready;
    en.selectTab('about');
    assert.deepEqual(rowsOf(en.$('panel-about').querySelector('dl')), [
        ['Grand Company', 'Maelstrom · Storm Captain'], ['Nameday', '1st Sun of the 1st Astral Moon'], ['Guardian', 'Menphina, the Lover'], ['Starting city', 'Gridania']
    ]);
    clean(en);
});

test('標頭的部隊名稱是按鈕：切到部隊分頁、焦點移過去；舊 Worker 標頭先寫「部隊」，部隊分頁載入後補上名稱（重畫標頭、換名稱與成就顯示都留著）', async () => {
    const page = createLodestonePage({ search: '?id=12345678', routes: allRoutes() });
    await page.ready;
    const button = page.$('profileCard').querySelector('.profile-fc');
    assert.deepEqual([button.tagName, button.getAttribute('type'), button.textContent], ['BUTTON', 'button', '部隊 Example Company']);
    button.focus();
    button.click();
    assert.deepEqual(selectedTab(page), ['fc']);
    isSame(page.document.activeElement, page.$('tab-fc'), '焦點移到部隊分頁');
    await page.flush();
    assert.equal(page.$('panel-fc').querySelector('.fc-name').textContent, 'Example Company');
    clean(page);

    const old = createLodestonePage({ search: '?id=12345678', routes: { ...allRoutes(), '/character/12345678': () => F.ok(F.oldCharacter(F.HIKARI)) } });
    await old.ready;
    assert.equal(old.profile().where, 'Tonberry（Elemental）・部隊');
    old.$('profileCard').querySelector('.profile-fc').click();
    await old.flush();
    assert.equal(old.profile().where, 'Tonberry（Elemental）・部隊 Example Company', '部隊分頁載入後補上名稱');
    old.setLang('en');
    assert.equal(old.profile().where, 'Tonberry (Elemental) · FC Example Company', '換介面語言重畫標頭也留著');
    old.setLang('zh');
    // 換名稱與成就顯示：重新打的舊 Worker 標頭沒有名稱，同一個角色照樣留著（部隊分頁沒有打開）
    old.selectTab('jobs');
    old.$('profileCard').querySelector('button[data-lang="ja"]').click();
    await old.flush();
    assert.equal(old.requests.at(-1).path, '/character/12345678/classjob?dc=jp');
    assert.equal(old.profile().where, 'Tonberry（Elemental）・部隊 Example Company');
    // 換成別的角色就沒有了
    old.routes[`/character/${F.AOI.id}`] = () => F.ok(F.oldCharacter(F.AOI));
    await old.app.openCharacter(F.AOI.id);
    assert.equal(old.profile().where, 'Tiamat（Gaia）・部隊');
    clean(old);
});

test('切換介面語言：分頁名稱、職業與分組、成就、部位與屬性、收藏、部隊與其他的字換成那個語言，不重新打請求；篩選框的字留著', async () => {
    const page = createLodestonePage({ search: '?id=12345678', stored: { [KEYS.lang]: 'en' }, routes: allRoutes() });
    await page.ready;
    for (const key of TAB_KEYS) page.selectTab(key);
    await page.flush();
    typeInto(page, page.$('panel-collections').querySelector('input'), 'choco');
    const count = page.requests.length;

    page.setLang('en');
    assert.deepEqual(page.tabs().map((tab) => tab.text), ['Jobs', 'Achievements', 'Gear', 'Collections', 'Free Company', 'Other']);
    assert.equal(page.$('tabList').getAttribute('aria-label'), 'Character details');
    const jobs = page.$('panel-jobs');
    assert.deepEqual(jobs.querySelectorAll('.role-label').map((label) => label.textContent), ['Tank', 'Healer', 'Melee', 'Ranged', 'Caster', 'Crafter', 'Gatherer']);
    assert.equal(jobs.querySelector('.job-name').textContent, 'Paladin');
    assert.equal(jobs.querySelector('.maxed-count').textContent, '13 at max level');
    assert.equal(jobs.querySelector('.special-content').textContent, 'Special content: Knowledge Level 3');
    assert.deepEqual(page.$('panel-achievements').querySelectorAll('.achievement-stat').map((stat) => stat.textContent), ['2,567 achievements', '24,530 points']);
    assert.equal(page.$('panel-achievements').querySelector('time').textContent, dateText('2026-11-07T10:00:00.000Z', 'en-US'));
    assert.deepEqual([pagerOf(page, 'achievements').prev.textContent, pagerOf(page, 'achievements').info, pagerOf(page, 'achievements').next.textContent], ['Previous', 'Page 1 of 3', 'Next']);
    const gear = page.$('panel-gear');
    assert.equal(gear.querySelector('.gear-now').textContent, 'Now: Bard Lv100');
    assert.deepEqual(gear.querySelectorAll('.gear-slot-name').map((name) => name.textContent).slice(0, 3), ['Main Hand', 'Head', 'Body']);
    assert.equal(gear.querySelector('.gear-note').textContent, 'The Lodestone character page shows gear icons only, without their names.');
    assert.equal(gear.querySelector('summary').textContent, 'Attributes');
    assert.deepEqual(gear.querySelectorAll('h4').map((title) => title.textContent), ['Main attributes', 'Sub attributes']);
    const collections = page.$('panel-collections');
    assert.deepEqual(collections.querySelectorAll('.collection-title').map((title) => title.textContent), ['Mounts 103', 'Minions 269']);
    assert.deepEqual([collections.querySelector('label').textContent, collections.querySelector('input').value], ['Filter by name', 'choco']);
    assert.deepEqual(collections.querySelectorAll('.collection-item').filter((item) => !item.hidden).map((item) => item.textContent), ['Company Chocobo', 'Black Chocobo', 'Black Chocobo Chick']);
    assert.equal(page.$('panel-fc').querySelector('.fc-members h3').textContent, 'Members');
    assert.equal(rowsOf(page.$('panel-fc').querySelector('.fc-facts'))[4][1], 'Role-playing · Guildhests · Raids');
    assert.equal(rowsOf(page.$('panel-about').querySelector('dl'))[0][1], 'Maelstrom · Storm Captain');

    page.setLang('ja');
    assert.deepEqual(page.tabs().map((tab) => tab.text), ['ジョブ', 'アチーブメント', '装備', 'コレクション', 'フリーカンパニー', 'その他']);
    assert.equal(jobs.querySelector('.job-name').textContent, 'ナイト');
    assert.equal(page.$('panel-fc').querySelector('.fc-members h3').textContent, 'メンバー');
    assert.equal(page.requests.length, count, '換介面語言不重新打請求');
    clean(page);
});

// ---------- 舊的請求晚到（從 tests/lodestone-requests.test.js 搬來的分頁部分）----------

test('分頁的請求各自失敗（連不上、HTTP 錯誤、JSON 壞掉）：標頭與其他分頁照常，失敗的分頁寫原因，下次打開再試一次', async () => {
    let classJobsBroken = true;
    const page = createLodestonePage({
        search: '?id=12345678',
        routes: {
            ...allRoutes(),
            '/character/12345678/classjob': () => (classJobsBroken ? { status: 200, json: () => Promise.reject(new SyntaxError('invalid JSON')) } : F.ok(F.classJobs())),
            '/character/12345678/achievements': () => F.fail(503, 'upstream'),
            '/character/12345678/mounts': () => { throw new TypeError('network offline'); },
            '/freecompany/9230000000000000001/members': () => { throw new TypeError('members unavailable'); }
        }
    });
    await page.ready;
    await page.flush();
    assert.equal(page.profile().name, 'Hikari Senshi');
    assert.deepEqual([page.$('tabsCard').hidden, page.$('characterError').hidden], [false, true]);
    assert.equal(page.$('panel-jobs').querySelector('.error-message').textContent, '查詢失敗');
    assert.equal(page.$('panel-jobs').getAttribute('aria-busy'), 'false');
    page.selectTab('achievements');
    await page.flush();
    assert.equal(page.$('panel-achievements').querySelector('.error-message').textContent, '查詢失敗');
    page.selectTab('collections');
    await page.flush();
    const [mountSection, minionSection] = page.$('panel-collections').querySelectorAll('.collection');
    assert.equal(mountSection.querySelector('.error-message').textContent, '查詢失敗');
    assert.equal(minionSection.querySelectorAll('.collection-item').length, 4, '寵物照常');
    page.selectTab('fc');
    await page.flush();
    assert.equal(page.$('panel-fc').querySelector('.fc-name').textContent, 'Example Company', '成員失敗不丟掉部隊的資料');
    assert.equal(page.$('panel-fc').querySelector('.fc-members .error-message').textContent, '查詢失敗');
    page.selectTab('gear');
    assert.equal(page.$('panel-gear').querySelectorAll('.gear-slot').length, 12);

    // 下次打開再試一次（只打失敗的）
    classJobsBroken = false;
    const count = page.requests.length;
    page.selectTab('jobs');
    await page.flush();
    assert.deepEqual(paths(page).slice(count), ['/character/12345678/classjob?dc=na']);
    assert.equal(page.$('panel-jobs').querySelectorAll('.role-group').length, 7);
    page.selectTab('collections');
    page.selectTab('fc');
    await page.flush();
    assert.deepEqual(paths(page).slice(count + 1), ['/character/12345678/mounts?dc=na', '/freecompany/9230000000000000001/members?dc=na&page=1']);
    page.selectTab('jobs');
    await page.flush();
    assert.equal(page.requests.length, count + 3, '載入好的不再打');
    clean(page);
});

test('分頁載入失敗時有「再試一次」：重新載入那個分頁失敗的部分（用目前的名稱與成就顯示），焦點移到面板，新的內容畫在面板裡', async () => {
    const failing = { classjob: true, mounts: true };
    const page = createLodestonePage({
        search: '?id=12345678',
        routes: {
            ...allRoutes(),
            '/character/12345678/classjob': () => (failing.classjob ? F.fail(502, 'upstream') : F.ok(F.classJobs())),
            '/character/12345678/mounts': () => (failing.mounts ? F.fail(500, 'internal') : F.ok(F.mounts()))
        }
    });
    await page.ready;
    await page.flush();
    const jobs = page.$('panel-jobs');
    assert.equal(jobs.querySelector('.error-message').textContent, 'Lodestone 暫時連不上，請稍後再試');
    assert.deepEqual([jobs.querySelector('button[data-retry]').textContent, jobs.querySelector('button[data-retry]').getAttribute('type')], ['再試一次', 'button']);
    // 換介面語言重畫時，焦點回到（重畫的）同一顆按鈕
    jobs.querySelector('button[data-retry]').focus();
    page.setLang('en');
    isSame(page.document.activeElement, jobs.querySelector('button[data-retry]'), '焦點留在再試一次');
    assert.equal(page.document.activeElement.textContent, 'Try again');
    page.setLang('zh');
    const retry = jobs.querySelector('button[data-retry]');
    isSame(page.document.activeElement, retry);

    // 職業（一打開就是它）：不用先切到別的分頁再切回來
    failing.classjob = false;
    const count = page.requests.length;
    retry.click();
    assert.deepEqual(paths(page).slice(count), ['/character/12345678/classjob?dc=na']);
    assert.equal(jobs.getAttribute('aria-busy'), 'true');
    isSame(page.document.activeElement, jobs, '按鈕跟著載入中不見了：焦點移到面板');
    await page.flush();
    assert.equal(jobs.querySelector('.maxed-count').textContent, '滿級 13 個');
    assert.ok(jobs.querySelector('button[data-retry]') === null);
    isSame(page.document.activeElement, jobs, '新的內容畫好之後焦點還在面板');
    assert.deepEqual(selectedTab(page), ['jobs']);

    // 收藏（第一次打開才載入）：坐騎失敗、寵物照常，再試一次只打坐騎
    page.selectTab('collections');
    await page.flush();
    const collections = page.$('panel-collections');
    const section = (kind) => collections.querySelector(`section[data-collection="${kind}"]`);
    assert.ok(section('minions').querySelector('button[data-retry]') === null, '寵物沒有失敗');
    failing.mounts = false;
    const before = page.requests.length;
    const mountsRetry = section('mounts').querySelector('button[data-retry]');
    assert.equal(mountsRetry.textContent, '再試一次');
    mountsRetry.focus();
    mountsRetry.click();
    assert.deepEqual(paths(page).slice(before), ['/character/12345678/mounts?dc=na']);
    isSame(page.document.activeElement, collections, '焦點移到面板');
    await page.flush();
    assert.equal(section('mounts').querySelector('.collection-title').textContent, '坐騎 103');
    assert.equal(section('mounts').querySelectorAll('.collection-item').length, 3);
    assert.equal(section('minions').querySelectorAll('.collection-item').length, 4);
    isSame(page.document.activeElement, collections, '新的內容畫好之後焦點還在面板');

    // 換成日本語之後又失敗：再試一次用目前的 context（dc=jp）
    failing.mounts = true;
    page.$('profileCard').querySelector('button[data-lang="ja"]').click();
    await page.flush();
    failing.mounts = false;
    const later = page.requests.length;
    section('mounts').querySelector('button[data-retry]').click();
    assert.deepEqual(paths(page).slice(later), ['/character/12345678/mounts?dc=jp']);
    await page.flush();
    assert.equal(section('mounts').querySelectorAll('.collection-item').length, 3);
    clean(page);
});

test('職業分頁還在等的時候標頭已經能用：分頁看得到、職業寫載入中，設成我的角色、裝備照常', async () => {
    const slow = deferred();
    const page = createLodestonePage({ search: '?id=12345678', routes: { ...characterRoute(F.HIKARI), '/character/12345678/classjob': () => slow.promise } });
    await page.ready;
    await page.flush();
    assert.deepEqual([page.profile().busy, page.$('tabsCard').hidden], [false, false]);
    assert.equal(page.$('panel-jobs').getAttribute('aria-busy'), 'true');
    assert.equal(page.panelText('jobs'), '載入中…');
    page.$('profileCard').querySelector('.profile-mine').click();
    assert.deepEqual(page.profile().mine, { text: '★ 我的角色', pressed: 'true' });
    page.selectTab('gear');
    assert.equal(page.$('panel-gear').querySelector('.gear-now').textContent, '現在：吟遊詩人 Lv100');
    slow.resolve(F.ok(F.classJobs()));
    await page.flush();
    page.selectTab('jobs');
    assert.equal(page.$('panel-jobs').getAttribute('aria-busy'), 'false');
    assert.equal(page.$('panel-jobs').querySelector('.maxed-count').textContent, '滿級 13 個');
    clean(page);
});

test('查 A 之後很快查 B：A 的職業、成就、坐騎、寵物、部隊與成員的回答晚到都不能蓋掉 B，也不幫 B 的標頭補部隊名稱', async () => {
    // A 的分頁回答都已經回來、身體還在讀（不受取消影響）；B 是舊 Worker（標頭的部隊沒有名稱）
    const gate = deferred();
    const late = (body) => () => ({ status: 200, json: () => gate.promise.then(() => body) });
    const page = createLodestonePage({
        search: '?id=12345678',
        routes: {
            ...characterRoute(F.HIKARI),
            '/character/12345678/classjob': late(F.classJobs({ levels: { Paladin: '1' } })),
            '/character/12345678/achievements': late(F.achievements({ list: [['1', 'Old Achievement', ''] ] })),
            '/character/12345678/mounts': late(F.mounts(['Old Mount'])),
            '/character/12345678/minions': late(F.minions(['Old Minion'])),
            '/freecompany/9230000000000000001': late(F.freeCompany()),
            '/freecompany/9230000000000000001/members': late(F.members(1)),
            ...allRoutes(F.AOI),
            [`/character/${F.AOI.id}`]: () => F.ok(F.oldCharacter(F.AOI))
        }
    });
    await page.ready;
    for (const key of ['achievements', 'collections', 'fc']) page.selectTab(key);
    await page.flush();
    const old = page.requests.length;
    assert.equal(old, 7, 'A 的六個分頁請求都在等');
    const oldContext = page.app.state.character.context;

    await page.app.openCharacter(F.AOI.id);
    page.selectTab('achievements');
    page.selectTab('collections');
    await page.flush();
    page.selectTab('jobs');
    const texts = () => TAB_KEYS.map((key) => page.panelText(key));
    const before = texts();
    assert.equal(page.profile().where, 'Tiamat（Gaia）・部隊');
    assert.ok(page.requests.slice(1, old).every((request) => request.signal.aborted), 'A 的分頁請求都取消了');

    gate.resolve();
    await page.flush();
    assert.deepEqual(texts(), before, 'A 晚到的回答不畫');
    assert.ok(!texts().join('').includes('Old'), '沒有 A 的資料');
    assert.equal(page.profile().where, 'Tiamat（Gaia）・部隊', 'A 的部隊名稱不補到 B 的標頭');
    // 補部隊名稱只認目前的 context（分頁傳的是發出請求時的 context）
    page.app.setFreeCompanyName(oldContext, 'Example Company');
    assert.equal(page.profile().where, 'Tiamat（Gaia）・部隊');
    assert.deepEqual(selectedTab(page), ['jobs']);
    clean(page);
});

test('換頁用當下的名稱與成就顯示；較舊的頁數晚到不能蓋掉最後選的那一頁（成就與部隊成員）', async () => {
    // 測試扣住的回答：`${種類}:${dc}:${頁數}` → deferred（已經回來、身體還在讀）
    const held = new Map();
    const hold = (name) => {
        const gate = deferred();
        held.set(name, gate);
        return gate;
    };
    const route = (kind, make) => (url) => {
        const number = Number(url.searchParams.get('page'));
        const body = make(number);
        const gate = held.get(`${kind}:${url.searchParams.get('dc')}:${number}`);
        if (!gate) return F.ok(body);
        held.delete(`${kind}:${url.searchParams.get('dc')}:${number}`);
        return { status: 200, json: () => gate.promise.then(() => body) };
    };
    const page = createLodestonePage({
        search: '?id=12345678', stored: { [KEYS.lang]: 'ja' },
        routes: {
            ...allRoutes(),
            '/character/12345678/achievements': route('achievements', (number) => F.achievements({ page: number })),
            '/freecompany/9230000000000000001/members': route('members', (number) => F.members(number))
        }
    });
    await page.ready;
    const memberIds = () => page.$('panel-fc').querySelectorAll('.fc-members button.person').map((row) => row.dataset.id);
    const achievementNames = () => page.$('panel-achievements').querySelectorAll('.achievement-name').map((name) => name.textContent);

    // 部隊成員：第 2 頁晚到，已經換到第 3 頁
    page.selectTab('fc');
    await page.flush();
    const lateMembers = hold('members:jp:2');
    pagerOf(page, 'fc').next.click();
    pagerOf(page, 'fc').next.click();
    await page.flush();
    assert.deepEqual([memberIds(), pagerOf(page, 'fc').info], [[F.KAEDE.id], '第 3 頁，共 3 頁']);
    lateMembers.resolve();
    await page.flush();
    assert.deepEqual([memberIds(), pagerOf(page, 'fc').info], [[F.KAEDE.id], '第 3 頁，共 3 頁'], '較舊的第 2 頁不蓋掉第 3 頁');

    // 成就：同樣
    page.selectTab('achievements');
    await page.flush();
    const lateAchievements = hold('achievements:jp:2');
    pagerOf(page, 'achievements').next.click();
    pagerOf(page, 'achievements').next.click();
    await page.flush();
    lateAchievements.resolve();
    await page.flush();
    assert.deepEqual([achievementNames(), pagerOf(page, 'achievements').info], [['To Crush Your Enemies I'], '第 3 頁，共 3 頁']);
    const pageRequests = page.requests.filter((request) => request.params.page !== undefined);
    assert.equal(pageRequests.length, 6);
    assert.ok(pageRequests.every((request) => request.params.dc === 'jp'), '日本語時換頁都帶 dc=jp');

    // 日本語的第 2 頁還在等，換成 English：留在成就、重新打第 1 頁（dc=na）；日本語的晚到不採用；之後換頁帶 dc=na
    const lateJapanese = hold('achievements:jp:2');
    pagerOf(page, 'achievements').prev.click();
    page.$('profileCard').querySelector('button[data-lang="en"]').click();
    await page.flush();
    assert.equal(page.requests.at(-1).path, '/character/12345678/achievements?dc=na&page=1');
    lateJapanese.resolve();
    await page.flush();
    assert.deepEqual([achievementNames(), pagerOf(page, 'achievements').info], [['Tank You, Dawntrail III', 'Mastering War VII'], '第 1 頁，共 3 頁']);
    pagerOf(page, 'achievements').next.click();
    assert.equal(page.requests.at(-1).path, '/character/12345678/achievements?dc=na&page=2');
    await page.flush();
    assert.deepEqual(achievementNames(), ['Level with It III', 'Leaves of Grass']);
    clean(page);
});

test('舊角色的換頁回答與舊的換頁按鈕不能污染新角色', async () => {
    const gates = { achievements: deferred(), members: deferred() };
    const page = createLodestonePage({
        search: '?id=12345678',
        routes: {
            ...allRoutes(F.HIKARI),
            '/character/12345678/achievements': (url) => (url.searchParams.get('page') === '2'
                ? { status: 200, json: () => gates.achievements.promise.then(() => F.achievements({ page: 2 })) }
                : F.ok(F.achievements())),
            '/freecompany/9230000000000000001/members': (url) => (url.searchParams.get('page') === '2'
                ? { status: 200, json: () => gates.members.promise.then(() => F.members(2)) }
                : F.ok(F.members(1))),
            ...allRoutes(F.AOI)
        }
    });
    await page.ready;
    page.selectTab('achievements');
    await page.flush();
    pagerOf(page, 'achievements').next.click();
    const oldAchievementsNext = pagerOf(page, 'achievements').next;
    page.selectTab('fc');
    await page.flush();
    pagerOf(page, 'fc').next.click();
    const oldMembersNext = pagerOf(page, 'fc').next;

    await page.app.openCharacter(F.AOI.id);
    page.selectTab('achievements');
    page.selectTab('fc');
    await page.flush();
    const texts = () => TAB_KEYS.map((key) => page.panelText(key));
    const before = texts();
    assert.deepEqual(page.$('panel-fc').querySelectorAll('.fc-members button.person').map((row) => row.dataset.id), [F.HIKARI.id, F.AOI.id], 'B 的成員第 1 頁');

    gates.achievements.resolve();
    gates.members.resolve();
    await page.flush();
    assert.deepEqual(texts(), before, 'A 的第 2 頁晚到不畫');
    assert.equal(pagerOf(page, 'achievements').info, '第 1 頁，共 3 頁');
    assert.equal(pagerOf(page, 'fc').info, '第 1 頁，共 3 頁');

    // A 的舊按鈕（已經不在頁面上）按了也不打請求
    const count = page.requests.length;
    oldAchievementsNext.click();
    oldMembersNext.click();
    await page.flush();
    assert.equal(page.requests.length, count);
    assert.deepEqual(texts(), before);
    clean(page);
});

test('新的角色清掉舊角色的特殊內容與分頁狀態：成就回到第 1 頁，部隊分頁沒有舊的成員與頁數', async () => {
    const page = createLodestonePage({
        search: '?id=12345678',
        routes: {
            ...allRoutes(F.HIKARI),
            ...allRoutes(F.REED),
            [`/character/${F.REED.id}/classjob`]: () => F.ok(F.classJobs({ special: null }))
        }
    });
    await page.ready;
    await page.flush();
    assert.ok(page.$('panel-jobs').querySelector('.special-content') !== null);
    page.selectTab('achievements');
    await page.flush();
    pagerOf(page, 'achievements').next.click();
    page.selectTab('fc');
    await page.flush();
    pagerOf(page, 'fc').next.click();
    await page.flush();
    assert.equal(pagerOf(page, 'fc').info, '第 2 頁，共 3 頁');

    await page.app.openCharacter(F.REED.id);
    await page.flush();
    assert.ok(page.$('panel-jobs').querySelector('.special-content') === null, '沒有舊角色的特殊內容');
    page.selectTab('achievements');
    assert.equal(page.requests.at(-1).path, `/character/${F.REED.id}/achievements?dc=na&page=1`);
    await page.flush();
    assert.equal(pagerOf(page, 'achievements').info, '第 1 頁，共 3 頁');
    page.selectTab('fc');
    assert.equal(page.panelText('fc'), '沒有加入部隊');
    assert.ok(pagerOf(page, 'fc') === null && page.$('panel-fc').querySelector('.person') === null);
    clean(page);
});

// ---------- 標記與資料 ----------

test('index.html：#lodestoneTool 裡的三種畫面與找人表單；腳本順序；整頁只有一顆 .btn-primary；不載入 security-utils.js', async () => {
    const page = createLodestonePage();
    await page.ready;
    assert.deepEqual(page.$('lodestoneTool').children.map((child) => child.id), ['landingView', 'searchView', 'characterView']);
    assert.deepEqual(page.$('landingView').children.map((child) => child.id), ['firstVisitIntro', 'mineCard', 'findCard', 'recentCard']);
    assert.deepEqual(page.$('characterView').children.map((child) => child.id), ['characterBack', 'profileCard', 'characterError', 'tabsCard']);
    assert.deepEqual(page.$('resultCard').children.map((child) => child.id), ['searchSummary', 'resultList', 'searchHint', 'searchMore', 'searchFallback']);
    const form = page.$('findForm');
    assert.equal(form.tagName, 'FORM');
    for (const id of ['nameInput', 'worldSelect', 'searchButton', 'dataLang']) assert.ok(form.contains(page.$(id)), `#${id} 在 #findForm 裡`);
    assert.ok(page.$('findCard').contains(form));
    assert.deepEqual(page.$('dataLang').querySelectorAll('button').map((button) => button.getAttribute('type')), ['button', 'button'], '不會送出表單');
    assert.deepEqual(page.$('tabsCard').children.map((child) => child.id), ['tabList', ...TAB_KEYS.map((key) => `panel-${key}`)], '分頁列在前，六個面板在後');
    for (const key of TAB_KEYS) assert.equal(page.$(`panel-${key}`).children.length, 0, `#panel-${key} 的內容由 lodestone-tabs.js 畫`);

    assert.equal((HTML.match(/btn-primary/g) || []).length, 1, '這一頁只有一顆 .btn-primary');
    assert.ok(!HTML.includes('security-utils.js'));
    const sources = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(sources.slice(-5), ['lodestone-data.js', 'lodestone-model.js', 'lodestone-store.js', 'lodestone-tabs.js', 'script.js']);
    assert.equal(sources.at(-6), '../../assets/js/common.js');

    // 舊頁面的全域都拿掉了，職業圖示的舊表也是（職業的圖示路徑寫在 LODESTONE_JOBS 裡）
    for (const name of ['LODESTONE_JOB_ICONS', 'LODESTONE_TRANSLATIONS', 'LODESTONE_ROLE_COLORS', 'LODESTONE_ROLE_TEXT_COLORS']) assert.equal(page.window[name], undefined, name);
    clean(page);
});

test('index.html 的 meta description 與 og:description：用名字和伺服器找國際版角色、也能貼網址或 ID，查職業等級、成就與收藏', () => {
    const DESCRIPTION = '輸入名字和伺服器，查 FF14 國際版角色的職業等級、成就與收藏；也可以直接貼上 Lodestone 角色頁的網址或 ID。';
    assert.equal(HTML.match(/<meta name="description" content="([^"]*)"/)[1], DESCRIPTION);
    assert.equal(HTML.match(/<meta property="og:description" content="([^"]*)"/)[1], DESCRIPTION);
});

test('script.js 與 lodestone-tabs.js 不用 SecurityUtils、不寫 console，翻譯鍵都是寫死的字串', () => {
    for (const file of ['tools/lodestone-lookup/script.js', 'tools/lodestone-lookup/lodestone-tabs.js']) {
        const script = read(file);
        assert.ok(!script.includes('SecurityUtils'), file);
        assert.doesNotMatch(script, /console\./, file);
        // 翻譯鍵不用樣板字串或接字串組出來（之後檢查「每個鍵都有用到」才看得到）
        assert.doesNotMatch(script, /['"`]lodestone_[a-z0-9_]*['"`]\s*\+|`lodestone_[a-z0-9_]*\$\{/, file);
    }
});
