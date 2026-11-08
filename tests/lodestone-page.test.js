// Lodestone 角色查詢頁：打開時（我的角色 → 找人 → 最近查過）、找人與搜尋結果、角色標頭、網址與上一頁、名稱與成就顯示、
// 舊的請求晚到（從 tests/lodestone-requests.test.js 搬來的標頭部分）。頁面替身見 tests/helpers/lodestone-page.js，假回應見 lodestone-fixtures.js
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
// 打開這個人的角色時，Worker 回新格式的角色
const characterRoute = (who) => ({ [`/character/${who.id}`]: () => F.ok(F.character(who)) });
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
    assert.deepEqual(paths(page), ['/character/12345678?dc=na']);
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
    assert.deepEqual(paths(page), ['/character/56789012?dc=na']);
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
        assert.deepEqual(paths(page), [`/character/${id}?dc=na`], input);
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
    assert.deepEqual(paths(page), ['/character/12345678?dc=na']);
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
    assert.deepEqual(paths(page).slice(1), ['/character/23456789?dc=na']);
    assert.equal(page.url(), `${PAGE}?id=23456789`);
    assert.equal(page.history.at(-1).method, 'pushState');

    page.back();
    await page.flush();
    assert.equal(page.view(), 'search');
    assert.equal(page.url(), PAGE);
    assert.equal(page.requests.length, 2, '回到搜尋結果不再搜尋一次');
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
    assert.deepEqual(paths(page), ['/character/12345678?dc=na'], '只打標頭');
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
    assert.deepEqual(paths(page), ['/character/12345678?dc=na', '/character/12345678?dc=na']);
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
    assert.equal(page.requests.length, 1);
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
    assert.deepEqual(paths(page), ['/character/12345678?dc=na', '/character/12345678?dc=jp'], '用日本語重新打標頭');
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
    assert.equal(page.requests.length, 2);

    // 很快地換回 English 又換成日本語：English 的回應晚到不採用
    profileButton('en').click();
    await page.flush();
    assert.equal(page.requests[2].params.dc, 'na');
    profileButton('ja').click();
    assert.equal(page.requests[2].signal.aborted, true, '取消 English 的請求');
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
    assert.deepEqual(paths(page), ['/character/12345678?dc=na', '/character/12345678?dc=jp']);
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
    assert.deepEqual(paths(page), ['/search/character?name=Aoi+Mizu&world=Tiamat&dc=na&page=1', '/character/23456789?dc=na']);

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
    assert.equal(page.requests.length, 2, '搜尋結果從記憶體拿，不再搜尋');

    page.forward();
    assert.deepEqual([page.view(), page.url()], ['character', `${PAGE}?id=23456789`]);
    await page.flush();
    assert.equal(page.profile().name, 'Aoi Mizuno');
    assert.deepEqual(paths(page).slice(2), ['/character/23456789?dc=na'], '角色重新打標頭');
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
    assert.deepEqual(paths(page), ['/character/12345678?dc=na', '/character/12345678?dc=jp']);
    assert.deepEqual([pressed(page.$('dataLang')), pressed(page.$('profileCard'))], [['false', 'true'], ['false', 'true']]);
    page.setLang('en');
    await page.flush();
    assert.equal(page.requests.at(-1).params.dc, 'na');
    assert.equal(page.requests.length, 3);

    const chosen = createLodestonePage({ search: '?id=12345678', stored: { [KEYS.lang]: 'en' }, routes: characterRoute(F.HIKARI) });
    await chosen.ready;
    chosen.setLang('ja');
    await chosen.flush();
    assert.equal(chosen.requests.length, 1, '按過 English 就不跟著介面語言');
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
    assert.equal(page.requests.length, 2, '按過 English：換介面語言不重打');
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
    assert.equal(page.$('tabsCard').children.length, 0, '分頁之後才放進來');

    assert.equal((HTML.match(/btn-primary/g) || []).length, 1, '這一頁只有一顆 .btn-primary');
    assert.ok(!HTML.includes('security-utils.js'));
    const sources = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(sources.slice(-4), ['lodestone-data.js', 'lodestone-model.js', 'lodestone-store.js', 'script.js']);
    assert.equal(sources.at(-5), '../../assets/js/common.js');

    // 舊頁面的全域都拿掉了，職業圖示的舊表也是（職業的圖示路徑寫在 LODESTONE_JOBS 裡）
    for (const name of ['LODESTONE_JOB_ICONS', 'LODESTONE_TRANSLATIONS', 'LODESTONE_ROLE_COLORS', 'LODESTONE_ROLE_TEXT_COLORS']) assert.equal(page.window[name], undefined, name);
    clean(page);
});

test('index.html 的 meta description 與 og:description：用名字和伺服器找國際版角色、也能貼網址或 ID，查職業等級、成就與收藏', () => {
    const DESCRIPTION = '輸入名字和伺服器，查 FF14 國際版角色的職業等級、成就與收藏；也可以直接貼上 Lodestone 角色頁的網址或 ID。';
    assert.equal(HTML.match(/<meta name="description" content="([^"]*)"/)[1], DESCRIPTION);
    assert.equal(HTML.match(/<meta property="og:description" content="([^"]*)"/)[1], DESCRIPTION);
});

test('script.js 不用 SecurityUtils、不寫 console，翻譯鍵都是寫死的字串', () => {
    const script = read('tools/lodestone-lookup/script.js');
    assert.ok(!script.includes('SecurityUtils'));
    assert.doesNotMatch(script, /console\./);
    // 翻譯鍵不用樣板字串或接字串組出來（之後檢查「每個鍵都有用到」才看得到）
    assert.doesNotMatch(script, /['"`]lodestone_[a-z0-9_]*['"`]\s*\+|`lodestone_[a-z0-9_]*\$\{/);
});
