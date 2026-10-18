const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createGatheringPage } = require('./helpers/gathering-page.js');
const { translationValues } = require('./helpers/translation-parsers.js');

const items = require('../data/timed-gathering.json').items;
const TRANSLATIONS = 'assets/js/i18n/translations/tools/timed-gathering.js';
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// 頁面跑在 vm 裡，裡面建出來的物件和陣列，原型和測試端不同：比對前先轉成測試端的物件
const clone = (value) => JSON.parse(JSON.stringify(value));

// 期望的時間用測試自己的 ET 換算（同 gathering-materials.test.js）：1 ET 分鐘 = 175000 / 60 ms，1 ET 天 = 4,200,000 ms；
// at(offset, h, m) 是 T 所在的 ET 日往後 offset 天的 ET h:m。倒數與本地時間的寫法用頁面自己的 GatheringMaterials 算
const T = 1_760_000_000_000;
const ET_MINUTE_MS = 175000 / 60;
const day = Math.floor(T / 4_200_000);
const at = (offset, h, m = 0) => Math.round(((day + offset) * 1440 + h * 60 + m) * ET_MINUTE_MS);

// 元素用 === 比：assert.equal 失敗時 test runner 會展開 actual／expected，fake-dom 的元素連著整份文件與 vm 的全域，
// 展開不完（測試卡住、吃光記憶體），所以只讓 assert 看到 true／false
const isSame = (actual, expected, message) => assert.ok(actual === expected, message);
const keysOf = (page) => page.cards().map((card) => card.dataset.material);
const textOf = (root, selector) => root.querySelector(selector).textContent;
const marksIn = (element) => element.querySelectorAll('mark').map((mark) => mark.textContent);
// 在搜尋框打字：派送 input，再跑防抖的計時器
function search(page, term) {
    const input = page.$('searchInput');
    input.value = term;
    input.dispatchEvent(new page.window.Event('input'));
    page.runTimeouts();
}
// localStorage 裡的清單（ListManager 的格式），預設清單裡放 listItems
const storedLists = (listItems) => ({
    ff14tw_timed_gathering_lists: JSON.stringify({ version: '1.0', lists: { default: { id: 'default', name: '預設清單', items: listItems } } })
});
const listIds = (page, listId = 'default') => Array.from(page.app.listManager.getList(listId).items, (item) => item.id);
// 加入鈕的狀態：已加入是 aria-disabled="true"，否則沒有這個屬性；兩種都不設 disabled（停用的按鈕拿不住焦點）
function assertAdded(button, added) {
    assert.equal(button.getAttribute('aria-disabled'), added ? 'true' : null);
    assert.ok(!button.disabled, '加入鈕不用 disabled');
}

test('a real exported backup round-trips through the file import controller, including all item formats', async () => {
    // 第一次打開頁面的人：每一種資料都加進清單「A&B」，匯出備份；清單也存進了 localStorage
    const first = await createGatheringPage();
    const source = first.app.listManager;
    source.renameList('default', 'A&B');
    for (const item of items) assert.equal(source.addToList('default', item).success, true);
    const backup = JSON.stringify(source.exportLists());
    // 之後再打開：清單從 localStorage 載入，匯入備份
    const page = await createGatheringPage({ stored: Object.fromEntries(first.storage) });
    page.app.importFile(backup);
    const imported = page.app.listManager.getAllLists().find(list => list.name === 'A&B (1)');
    assert.ok(imported);
    assert.deepEqual(clone(imported.items), clone(source.getList('default').items));
    assert.ok(vm.runInContext('new ListManager()', page.window).getList(imported.id), 'the imported list survives a reload');
    assert.equal(page.toasts.at(-1).type, 'success');
});

test('without Notification API the complete controller still loads data and lists', async () => {
    const page = await createGatheringPage({ notification: 'unsupported' });
    const { app } = page;
    assert.equal(app.data.length, items.length);
    assert.equal(page.cards().length, 34);
    assert.equal(app.elements.listTabs.children.length, 1);
    assert.equal(page.$('notificationToggle').disabled, true);
    assert.equal(page.$('testNotificationBtn').disabled, true);
    assert.equal(page.$('notificationStatus').textContent, '瀏覽器不支援通知');
    assert.doesNotThrow(() => app.notificationManager.testNotification());
    page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn').click();
    assert.equal(app.listManager.getList('default').items.length, 2);
});

test('list names and search preserve raw ampersands, apostrophes and literal markup as text', async () => {
    const page = await createGatheringPage({ items: [{ ...items[0], nameEn: "A&B's ore" }] });
    const { app } = page;
    app.showNewListDialog();
    page.$('newListName').value = 'A&B';
    app.elements.dialogConfirm.onclick();
    const created = app.listManager.getList(app.currentListId);
    assert.equal(created.name, 'A&B');
    assert.equal(app.elements.currentListName.textContent, 'A&B');
    app.showRenameListDialog();
    page.$('renameListInput').value = "A&B's <plan>";
    app.elements.dialogConfirm.onclick();
    assert.equal(created.name, "A&B's <plan>");
    assert.equal(app.currentListId, created.id);
    assert.equal(app.elements.currentListName.textContent, "A&B's <plan>");
    assert.equal(app.elements.currentListName.children.length, 0);
    for (const query of ["B's", 'A&B']) {
        app.elements.searchInput.value = query;
        app.applyFilters();
        assert.equal(page.cards().length, 1);
        const card = page.cards()[0];
        assert.equal(textOf(card, '.gx-name'), '科迪亞樹液塊');
        assert.equal(textOf(card, '.gx-alt'), "A&B's ore · コーディア樹液塊");
        assert.deepEqual(marksIn(card.querySelector('.gx-alt')), [query]);
    }
    // 頁面一開始就只有這一張卡片，所以再確認沒有符合的字真的會濾掉它
    app.elements.searchInput.value = 'no-such-ore';
    app.applyFilters();
    assert.equal(page.cards().length, 0);
});

test('a type chip on a fresh page re-filters without throwing: fishing leaves its one card', async () => {
    const page = await createGatheringPage();
    const fishing = items.filter(item => item.type === 'fishing');
    assert.equal(fishing.length, 1);
    // 還沒碰過搜尋框就點篩選：頁面讀到的搜尋字是空字串
    const chip = page.$('typeFilters').querySelector('[data-type="fishing"]');
    chip.click();
    assert.ok(chip.classList.contains('active'));
    assert.deepEqual(keysOf(page), ['fishing_purple_tongue']);
    chip.click();
    assert.equal(page.cards().length, 34);
});

test('generating a macro fills the macro box and scrolls to it without throwing', async () => {
    const page = await createGatheringPage();
    page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn').click();
    page.$('generateMacroBtn').click();
    const alarm = (time) => `/alarm "${items[0].macroFormat}" et rp ${time} 1 se04 mute`;
    assert.equal(page.$('macroText').value, ['/alarm clear', alarm('0000'), alarm('1200')].join('\n'));
    assert.equal(page.$('macroOutput').style.display, 'block');
});

test('an input the page creates starts empty: confirming the new-list dialog with nothing typed is refused', async () => {
    const page = await createGatheringPage();
    page.app.showNewListDialog();
    assert.equal(page.$('newListName').value, '');
    page.app.elements.dialogConfirm.onclick();
    assert.deepEqual(page.toasts.at(-1), { message: '清單名稱長度不符合要求', type: 'error' });
    assert.equal(page.app.listManager.getAllLists().length, 1);
    assert.ok(page.$('dialogOverlay').classList.contains('active'), 'the dialog stays open');
});

test('elements on the stand-in have what the page relies on: string values, select() and scrollIntoView()', async () => {
    const page = await createGatheringPage();
    // index.html 裡的：沒有 value 屬性是空字串，textarea 沒有文字也是
    assert.equal(page.$('searchInput').value, '');
    assert.equal(page.$('macroText').value, '');
    // 頁面自己建的（例如 SecurityUtils 建的輸入框與下拉選單）
    const [input, textarea, select] = ['input', 'textarea', 'select'].map(tag => page.document.createElement(tag));
    assert.deepEqual([input.value, textarea.value, select.value], ['', '', '']);
    // value 屬性是預設值（textarea 是裡面的文字），設過之後以設的為準
    input.setAttribute('value', 'a');
    textarea.textContent = 'b';
    assert.deepEqual([input.value, textarea.value], ['a', 'b']);
    input.value = 'c';
    input.setAttribute('value', 'd');
    assert.equal(input.value, 'c');
    assert.doesNotThrow(() => {
        input.select();
        textarea.select();
        input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        page.document.createElement('div').scrollIntoView();
        page.$('macroOutput').scrollIntoView();
    });
});

test('with localStorage blocked the page still loads, and what it logs is recorded instead of printed', async t => {
    const printed = ['log', 'warn', 'error'].map(method => t.mock.method(console, method, () => {}));
    const page = await createGatheringPage({ storageThrows: true });
    assert.equal(page.cards().length, 34);
    assert.ok(page.consoleErrors.length > 0);
    assert.ok(page.consoleErrors.every(entry => entry.includes('SecurityError')), page.consoleErrors.join('\n'));
    // console.error 與 console.warn 記下 util.format(...參數) 的結果（同 Node 的 console：物件、Symbol 照樣寫得出來）；console.log 什麼都不留
    page.window.console.warn('careful', 1);
    page.window.console.error('obj', { a: 1 }, Symbol('s'));
    page.window.console.log('quiet');
    assert.deepEqual(page.consoleErrors.slice(-2), ['careful 1', 'obj { a: 1 } Symbol(s)']);
    assert.deepEqual(printed.map(spy => spy.mock.callCount()), [0, 0, 0]);
});

// ---------- 一種素材一張卡片 ----------
test('一種素材一張卡片：34 張；科迪亞樹液塊的名稱、另外兩種語言、地點、時段、狀態', async () => {
    const page = await createGatheringPage({ now: at(0, 12, 30) });
    const M = page.window.GatheringMaterials;
    assert.deepEqual(page.consoleErrors, [], '乾淨地載入，頁面沒有記下任何錯誤');
    assert.equal(page.cards().length, 34);
    assert.equal(new Set(keysOf(page)).size, 34);

    const card = page.cardOf('botany_cordia_resin');
    assert.equal(card.tagName, 'ARTICLE');
    assert.ok(card.classList.contains('card') && card.classList.contains('gx-card'));
    const icon = card.querySelector('.gx-head > .gx-icon');
    assert.equal(icon.textContent, '🌿');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(textOf(card, '.gx-head > .gx-names > h3.gx-name'), '科迪亞樹液塊');
    assert.equal(textOf(card, '.gx-head > .gx-names > p.gx-alt'), 'Cordia Resin · コーディア樹液塊');
    assert.equal(textOf(card, '.gx-head > .tag'), 'v7.3');
    assert.equal(textOf(card, 'p.gx-where'), '📍 雅克特爾樹海 · 瑪姆克　X:35.7, Y:22.3');
    assert.equal(page.app.placeOf(page.app.materialByKey.get('botany_cordia_resin'), 'zh'), '雅克特爾樹海 · 瑪姆克　X:35.7, Y:22.3');
    assert.equal(textOf(card, 'p.gx-sched'), '每天 ET 00:00、ET 12:00，每次約 6 分鐘');
    // ET 12:30 在 12:00–14:00 那一段裡：還剩到 14:00
    const status = card.querySelector('p.gx-status');
    assert.equal(status.textContent, `現在可採 · 還剩 ${M.countdown(at(0, 14) - page.now)}（到 ${M.localTime(at(0, 14))}）`);
    assert.ok(status.classList.contains('now'));
    assert.ok(card.classList.contains('is-now'));
    // 現在可採前面的 ● 只是裝飾：替代文字是空的，螢幕閱讀器不念；不認得這種寫法的瀏覽器略過第二行，用第一行照樣畫出來
    const dot = read('tools/timed-gathering/style.css').match(/\.gx-status\.now::before\s*\{([^}]*)\}/);
    assert.ok(dot, 'style.css 要有 .gx-status.now::before');
    assert.match(dot[1], /^\s*content:\s*'● ';\s*content:\s*'● '\s*\/\s*'';\s*$/);
    // 沒有搜尋就沒有 <mark>；卡片不寫資料的說明
    assert.equal(card.querySelectorAll('mark').length, 0);
    assert.ok(!card.textContent.includes(items[0].description));
    const button = card.querySelector('.gx-actions > button.gx-add-btn');
    assert.equal(button.type, 'button');
    assert.equal(button.className, 'btn btn-sm btn-ghost gx-add-btn');
    assert.equal(button.textContent, '➕ 加入清單');
    assertAdded(button, false);

    // 區間寫 ET 00:00–04:00；全天的寫全天
    assert.equal(textOf(page.cardOf('mining_lightning_quartz'), '.gx-sched'), '每天 ET 00:00–04:00，每次約 12 分鐘');
    const fishing = page.cardOf('fishing_purple_tongue');
    assert.equal(textOf(fishing, '.gx-sched'), '全天');
    assert.equal(textOf(fishing, '.gx-status'), '全天都可以採');
    assert.ok(!fishing.classList.contains('is-now'));
    assert.ok(!fishing.querySelector('.gx-status').classList.contains('now'));
});

test('地點行：地點和地區同名時只寫一次；英文介面的地點也是英文', async () => {
    const page = await createGatheringPage();
    const whereOf = (key) => textOf(page.cardOf(key), '.gx-where');
    const placeOf = (key, lang) => page.app.placeOf(page.app.materialByKey.get(key), lang);
    // 深琥珀的地點就是科扎瑪爾卡本身：三種語言都只寫一次地區
    const expected = {
        zh: ['科扎瑪爾卡　X:32.0, Y:21.0', '雅克特爾樹海 · 瑪姆克　X:35.7, Y:22.3'],
        en: ["Kozama'uka　X:32.0, Y:21.0", "Yak T'el · Mamook　X:35.7, Y:22.3"],
        ja: ['コザマル・カ　X:32.0, Y:21.0', 'ヤクテル樹海 · マムーク　X:35.7, Y:22.3']
    };
    for (const [lang, [darkAmber, cordia]] of Object.entries(expected)) {
        page.setLang(lang);
        assert.equal(whereOf('mining_dark_amber_70'), `📍 ${darkAmber}`, lang);
        assert.equal(placeOf('mining_dark_amber_70', lang), darkAmber, lang);
        assert.equal(whereOf('botany_cordia_resin'), `📍 ${cordia}`, lang);
        assert.equal(placeOf('botany_cordia_resin', lang), cordia, lang);
    }
    for (const material of page.app.materialByKey.values()) {
        for (const lang of ['zh', 'en', 'ja']) {
            const [zone, location] = placeOf(material.key, lang).split('　')[0].split(' · ');
            assert.notEqual(location, zone, `${material.key} 的地點行不重複寫地區（${lang}）`);
        }
        // 英文介面的地點行沒有中文或日文
        assert.doesNotMatch(placeOf(material.key, 'en'), /[぀-ヿ㐀-鿿]/, material.key);
    }
    assert.deepEqual(page.consoleErrors, []);
});

test('下一次還不到 10 分鐘寫 m:ss，再久寫 N 分', async () => {
    // 科迪亞樹液塊的下一次是 ET 12:00；開始前 10 分鐘左右是 ET 8 點多，兩段都不在
    const start = at(0, 12);
    const statusBefore = async (ms) => {
        const page = await createGatheringPage({ now: start - ms });
        const card = page.cardOf('botany_cordia_resin');
        assert.ok(!card.classList.contains('is-now'));
        assert.ok(!card.querySelector('.gx-status').classList.contains('now'));
        return { time: page.window.GatheringMaterials.localTime(start), text: textOf(card, '.gx-status') };
    };
    const { time, text } = await statusBefore(599_000);
    assert.equal(text, `${time} 出現 · 還要 9:59`);
    assert.equal((await statusBefore(600_000)).text, `${time} 出現 · 還要 10 分`);
    assert.equal((await statusBefore(601_000)).text, `${time} 出現 · 還要 11 分`);
});

test('沒有搜尋時照出現時間排序：現在可採（剩比較久的在前）→ 快出現的 → 全天；計數寫「34 種 · 照出現時間排序」', async () => {
    const page = await createGatheringPage({ now: at(0, 12, 30) });
    const M = page.window.GatheringMaterials;
    // 對照：自己用 state 與 compare 排；都同分時照資料的順序
    const expected = Array.from(M.group(items), (material, index) => ({ key: material.key, state: M.state(material, page.now), index }))
        .sort((a, b) => M.compare(a.state, b.state) || a.index - b.index);
    assert.deepEqual(keysOf(page), expected.map((entry) => entry.key));
    assert.deepEqual([...new Set(expected.map((entry) => entry.state.kind))], ['now', 'next', 'allday']);
    assert.ok(page.cards()[0].classList.contains('is-now'));
    assert.equal(keysOf(page).at(-1), 'fishing_purple_tongue');
    assert.equal(page.$('itemCount').textContent, '34 種 · 照出現時間排序');
});

test('搜尋：每個字都要符合、照分數排、同分照出現時間；命中的字用 <mark> 標出來；計數寫「找到 N 種」', async () => {
    // ET 07:00：科迪亞兩種的下一次都是 12:00，八面體 10:00、甜卡庫魯 14:00；菱錳礦 08:00、深琥珀 10:00
    const page = await createGatheringPage({ now: at(0, 7) });
    const M = page.window.GatheringMaterials;
    const filter = page.app.searchFilter;
    // 對照：素材的分數是它的資料裡最高的；照分數由高到低，同分照 state 與 compare，再同分照資料的順序
    const expectedOrder = (term) => {
        const words = filter.constructor.words(term);
        return Array.from(M.group(items), (material, index) => ({
            key: material.key,
            index,
            state: M.state(material, page.now),
            score: Math.max(...Array.from(material.records, (record) => filter.scoreItem(record, words)))
        }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || M.compare(a.state, b.state) || a.index - b.index)
            .map((entry) => entry.key);
    };
    // 沒有搜尋時菱錳礦（08:00）排在深琥珀（10:00）前面
    const unsearched = keysOf(page);
    assert.ok(unsearched.indexOf('mining_rhodochrosite_72') < unsearched.indexOf('mining_dark_amber_70'));

    search(page, 'Cordia');
    assert.deepEqual(keysOf(page), ['botany_cordia_resin', 'botany_cordia_log_72']);
    assert.equal(page.$('itemCount').textContent, '找到 2 種');
    for (const card of page.cards()) {
        assert.deepEqual(marksIn(card.querySelector('.gx-alt')), ['Cordia']);
        assert.deepEqual(marksIn(card.querySelector('.gx-name')), []);
    }

    // 好幾個字時每個字都要符合；每個字各自標，中間的空白不標
    search(page, 'Cordia Log');
    assert.deepEqual(keysOf(page), ['botany_cordia_log_72']);
    assert.deepEqual(marksIn(page.cardOf('botany_cordia_log_72').querySelector('.gx-alt')), ['Cordia', 'Log']);

    // 四種都在 Yak T'el：甜卡庫魯的地區與地點都是 Yak T'el，分數最高；其他三種同分，照出現時間，八面體最先；
    // 科迪亞兩種的時段相同，照資料的順序
    search(page, "Yak T'el");
    assert.deepEqual(keysOf(page), ['botany_sweet_kukuru_70', 'mining_octahedrite_72', 'botany_cordia_resin', 'botany_cordia_log_72']);
    assert.deepEqual(keysOf(page), expectedOrder("Yak T'el"));
    for (const card of page.cards()) assert.deepEqual(marksIn(card.querySelector('.gx-where')), [], '中文介面的地區是中文，沒有命中的字');

    // 照分數排：深琥珀的地區與地點都是科扎瑪爾卡，分數最高；菱錳礦與紫色舌尖同分，照出現時間（全天的最後）
    search(page, '科扎瑪爾卡');
    assert.deepEqual(keysOf(page), ['mining_dark_amber_70', 'mining_rhodochrosite_72', 'fishing_purple_tongue']);
    assert.deepEqual(keysOf(page), expectedOrder('科扎瑪爾卡'));
    assert.equal(page.$('itemCount').textContent, '找到 3 種');
    // 深琥珀的地點行只寫一次科扎瑪爾卡（地點和地區同名）
    assert.deepEqual(marksIn(page.cardOf('mining_dark_amber_70').querySelector('.gx-where')), ['科扎瑪爾卡']);
    assert.deepEqual(marksIn(page.cardOf('mining_rhodochrosite_72').querySelector('.gx-where')), ['科扎瑪爾卡']);
    // 標出來的字一律用標題色：跟著周圍時，淡色的小字（另外兩種語言的名稱）在 --color-mark 的底色上對比不夠
    const markRule = read('tools/timed-gathering/style.css').match(/\.gx-name mark,\s*\.gx-alt mark,\s*\.gx-where mark\s*\{([^}]*)\}/);
    assert.ok(markRule, 'style.css 要有 .gx-name mark, .gx-alt mark, .gx-where mark 的規則');
    assert.match(markRule[1], /background:\s*var\(--color-mark\);/);
    assert.match(markRule[1], /color:\s*var\(--color-heading\);/);

    // 沒有符合的：空狀態
    search(page, 'no-such-ore');
    assert.equal(page.cards().length, 0);
    assert.equal(textOf(page.$('itemsContainer'), '.empty-state'), '沒有符合條件的採集物');
    assert.equal(page.$('itemCount').textContent, '找到 0 種');

    // 清除：回到全部，沒有標示
    page.$('clearSearchBtn').click();
    assert.equal(page.cards().length, 34);
    assert.equal(page.$('itemsContainer').querySelectorAll('mark').length, 0);
    assert.equal(page.$('itemCount').textContent, '34 種 · 照出現時間排序');

    // 英文介面的地點行寫英文地區：Yak 與 T'el 各自標
    page.setLang('en');
    search(page, "Yak T'el");
    assert.equal(page.cards().length, 4);
    for (const card of page.cards()) assert.deepEqual(marksIn(card.querySelector('.gx-where')), ['Yak', "T'el"]);
    assert.equal(page.$('itemCount').textContent, '4 found');
    assert.deepEqual(page.consoleErrors, []);
});

test('英文介面顯示英文名稱、日文介面顯示日文名稱，另外兩種寫在下面；清單面板的名稱也跟著換', async () => {
    const page = await createGatheringPage({ now: at(0, 12, 30) });
    const M = page.window.GatheringMaterials;
    page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn').click();
    const listNames = () => page.$('listItems').querySelectorAll('.list-item-name').map((name) => name.textContent);
    assert.deepEqual(listNames(), ['科迪亞樹液塊', '科迪亞樹液塊']);
    // 科迪亞樹液塊正在可採（到 ET 14:00）；雷電石英下一次是隔天 ET 00:00，還要 34 分
    const left = M.countdown(at(0, 14) - page.now);
    const end = M.localTime(at(0, 14));
    const next = M.localTime(at(1, 0));
    const wait = M.minutesCeil(at(1, 0) - page.now);
    assert.equal(wait, 34);

    page.setLang('en');
    let card = page.cardOf('botany_cordia_resin');
    assert.equal(textOf(card, '.gx-name'), 'Cordia Resin');
    assert.equal(textOf(card, '.gx-alt'), '科迪亞樹液塊 · コーディア樹液塊');
    assert.ok(textOf(card, '.gx-where').startsWith("📍 Yak T'el · Mamook"), textOf(card, '.gx-where'));
    assert.equal(textOf(card, '.gx-where'), `📍 ${page.app.placeOf(page.app.materialByKey.get('botany_cordia_resin'), 'en')}`);
    assert.equal(textOf(card, '.gx-status'), `Up now · ${left} left (until ${end})`);
    assert.equal(textOf(card, '.gx-sched'), 'Daily at ET 00:00, ET 12:00, about 6 min each');
    assert.equal(textOf(card, '.gx-add-btn'), '✔️ Added');
    assert.equal(textOf(page.cardOf('mining_lightning_quartz'), '.gx-status'), `Appears at ${next} · in ${wait} min`);
    assert.equal(textOf(page.cardOf('fishing_purple_tongue'), '.gx-status'), 'Available all day');
    assert.equal(textOf(page.cardOf('fishing_purple_tongue'), '.gx-sched'), 'All day');
    assert.equal(page.$('itemCount').textContent, '34 items · soonest first');
    assert.equal(textOf(page.document, '.items-panel .panel-header h2'), 'Gatherables');
    assert.equal(page.$('searchInput').getAttribute('placeholder'), 'Search in EN, JP or ZH-TW');
    assert.deepEqual(listNames(), ['Cordia Resin', 'Cordia Resin']);

    page.setLang('ja');
    card = page.cardOf('botany_cordia_resin');
    assert.equal(textOf(card, '.gx-name'), 'コーディア樹液塊');
    assert.equal(textOf(card, '.gx-alt'), '科迪亞樹液塊 · Cordia Resin');
    assert.equal(textOf(card, '.gx-where'), '📍 ヤクテル樹海 · マムーク　X:35.7, Y:22.3');
    assert.equal(textOf(card, '.gx-where'), `📍 ${page.app.placeOf(page.app.materialByKey.get('botany_cordia_resin'), 'ja')}`);
    assert.equal(textOf(card, '.gx-status'), `採集可能 ・ 残り${left}（${end}まで）`);
    assert.equal(textOf(card, '.gx-sched'), '毎日 ET 00:00、ET 12:00、1回約6分');
    assert.equal(textOf(page.cardOf('mining_lightning_quartz'), '.gx-status'), `${next}に出現 ・ あと${wait}分`);
    assert.equal(textOf(page.cardOf('fishing_purple_tongue'), '.gx-status'), '終日採集できます');
    assert.equal(textOf(page.cardOf('fishing_purple_tongue'), '.gx-sched'), '終日');
    assert.equal(page.$('itemCount').textContent, '34種 ・ 出現が近い順');
    assert.deepEqual(listNames(), ['コーディア樹液塊', 'コーディア樹液塊']);
    assert.deepEqual(page.consoleErrors, []);
});

test('加入清單加入這種素材的所有時段；兩個都在清單裡才寫已加入，移掉一筆就變回加入清單', async () => {
    const page = await createGatheringPage();
    const button = page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn');
    button.click();
    assert.deepEqual(listIds(page), ['botany_cordia_resin_1', 'botany_cordia_resin_2']);
    assert.equal(page.$('listItems').querySelectorAll('.list-item').length, 2);
    assert.deepEqual(page.toasts.at(-1), { message: '已加入清單', type: 'success' });
    // 就地更新：還是同一個按鈕
    isSame(page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn'), button, '還是同一個按鈕');
    assert.equal(button.textContent, '✔️ 已加入');
    assertAdded(button, true);
    assert.equal(button.className, 'btn btn-sm btn-ghost gx-add-btn');

    page.app.removeItemFromList('botany_cordia_resin_1');
    isSame(page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn'), button, '還是同一個按鈕');
    assert.equal(button.textContent, '➕ 加入清單');
    assertAdded(button, false);
    // 再按只補上少的那一筆
    button.click();
    assert.deepEqual(listIds(page), ['botany_cordia_resin_2', 'botany_cordia_resin_1']);
    assert.equal(button.textContent, '✔️ 已加入');
    assertAdded(button, true);

    // 換到另一個清單：那裡沒有就寫加入清單；換回來又是已加入；清空之後變回加入清單
    const created = page.app.listManager.createList('B');
    page.app.loadLists();
    page.app.switchToList(created.listId);
    isSame(page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn'), button, '還是同一個按鈕');
    assert.equal(button.textContent, '➕ 加入清單');
    assertAdded(button, false);
    page.app.switchToList('default');
    assert.equal(button.textContent, '✔️ 已加入');
    assertAdded(button, true);
    page.$('clearListBtn').click();
    page.app.elements.dialogConfirm.onclick();
    assert.deepEqual(listIds(page), []);
    isSame(page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn'), button, '還是同一個按鈕');
    assert.equal(button.textContent, '➕ 加入清單');
    assertAdded(button, false);
    assert.deepEqual(page.consoleErrors, []);

    // 打開頁面時也一樣：清單（或匯入的舊備份）只有其中一個時段時寫加入清單，兩個都在才寫已加入
    const partial = await createGatheringPage({ stored: storedLists([items[0]]) });
    assert.equal(textOf(partial.cardOf('botany_cordia_resin'), '.gx-add-btn'), '➕ 加入清單');
    const full = await createGatheringPage({ stored: storedLists([items[0], items[1]]) });
    const fullButton = full.cardOf('botany_cordia_resin').querySelector('.gx-add-btn');
    assert.equal(fullButton.textContent, '✔️ 已加入');
    assertAdded(fullButton, true);
});

test('按加入清單之後焦點還在同一個按鈕上：已加入用 aria-disabled，再按什麼都不做', async () => {
    const page = await createGatheringPage();
    const button = page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn');
    button.focus();
    button.click();
    assert.deepEqual(listIds(page), ['botany_cordia_resin_1', 'botany_cordia_resin_2']);
    isSame(page.document.activeElement, button, '焦點還在按過的那個按鈕上');
    // fake-dom 的 focus 不管 disabled（瀏覽器會把焦點從停用的按鈕移到 body），所以另外確認沒有停用
    assert.equal(button.textContent, '✔️ 已加入');
    assertAdded(button, true);
    // 再按一次（鍵盤的 Enter、空白鍵也是 click）：清單與提示都不變，焦點不動
    const toastCount = page.toasts.length;
    button.click();
    assert.deepEqual(listIds(page), ['botany_cordia_resin_1', 'botany_cordia_resin_2']);
    assert.equal(page.toasts.length, toastCount);
    isSame(page.document.activeElement, button, '再按一次焦點也不動');
    // 外觀照 .btn:disabled：淡、不能按的游標
    assert.match(read('tools/timed-gathering/style.css'), /\.gx-add-btn\[aria-disabled="true"\]\s*\{[^}]*opacity:\s*0\.55;[^}]*cursor:\s*not-allowed;/);
});

test('清單快滿時一筆都不加：99 筆再加兩個時段的素材', async () => {
    const filler = Array.from({ length: 99 }, (_, i) => ({ ...items[0], id: `item_${i}` }));
    const page = await createGatheringPage({ stored: storedLists(filler) });
    assert.equal(page.app.listManager.getList('default').items.length, 99);
    const button = page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn');
    button.click();
    assert.deepEqual(page.toasts.at(-1), { message: '清單最多只能包含 100 個項目', type: 'warning' });
    assert.equal(page.app.listManager.getList('default').items.length, 99);
    assert.equal(button.textContent, '➕ 加入清單');
    assertAdded(button, false);
    // 英文、日文的提示也寫出上限（換語言會重畫卡片，按鈕要重新找）
    page.setLang('en');
    page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn').click();
    assert.deepEqual(page.toasts.at(-1), { message: 'List can contain maximum of 100 items', type: 'warning' });
    page.setLang('ja');
    page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn').click();
    assert.deepEqual(page.toasts.at(-1), { message: 'リストには最大 100 個のアイテムまで', type: 'warning' });
    page.setLang('zh');
    assert.equal(page.app.listManager.getList('default').items.length, 99);
    // 只有一個時段的素材剛好放得下第 100 筆
    const single = page.cardOf('mining_lightning_quartz').querySelector('.gx-add-btn');
    single.click();
    assert.equal(page.app.listManager.getList('default').items.length, 100);
    assert.deepEqual(page.toasts.at(-1), { message: '已加入清單', type: 'success' });
    assert.equal(single.textContent, '✔️ 已加入');
    assertAdded(single, true);
});

test('瀏覽器封鎖網站資料：加入清單照樣把每個時段加進這次的清單，按鈕變成已加入，改跳記不住的警告', async () => {
    const page = await createGatheringPage({ storageThrows: true });
    // 打開頁面時 ListManager 與 NotificationManager 讀不到存的資料，各記下一筆
    const loadErrors = [...page.consoleErrors];
    assert.equal(loadErrors.length, 2, loadErrors.join('\n'));
    assert.match(loadErrors[0], /^載入清單失敗: Error: SecurityError/);
    assert.match(loadErrors[1], /^載入通知設定失敗: Error: SecurityError/);
    const toastCount = page.toasts.length;

    const button = page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn');
    assert.doesNotThrow(() => button.click(), '存不起來也不丟出點擊處理');
    assert.deepEqual(listIds(page), ['botany_cordia_resin_1', 'botany_cordia_resin_2'], '兩個時段都加進記憶體裡的清單');
    assert.equal(page.$('listItems').querySelectorAll('.list-item').length, 2, '清單面板跟著畫');
    isSame(page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn'), button, '還是同一個按鈕');
    assert.equal(button.textContent, '✔️ 已加入');
    assertAdded(button, true);
    assert.equal(page.toasts.length, toastCount + 1, '只跳一個 toast：警告取代「已加入清單」');
    assert.deepEqual(page.toasts.at(-1), { message: '已加入清單，但瀏覽器不讓這個網站存資料，重新整理後就不見了', type: 'warning' });
    // console 只有打開時讀不到的那兩筆，加上每個時段存不起來各一筆（ListManager 的 saveToStorage() 先記下再丟出來）
    assert.equal(page.consoleErrors.length, 4, page.consoleErrors.join('\n'));
    assert.deepEqual(page.consoleErrors.slice(0, 2), loadErrors);
    for (const entry of page.consoleErrors.slice(2)) assert.match(entry, /^儲存清單失敗: Error: SecurityError/);

    // 再按一次：都在清單裡了，什麼都不做
    button.click();
    assert.equal(listIds(page).length, 2);
    assert.equal(page.toasts.length, toastCount + 1);
});

test('新增清單、匯入、匯出在清單那一欄；卡片上沒有 .btn-primary', async () => {
    const page = await createGatheringPage();
    const panel = page.document.querySelector('.lists-panel');
    const actions = panel.querySelector('.toolbar-actions');
    isSame(panel.firstElementChild, actions, '.toolbar-actions 在清單那一欄的最上面');
    isSame(actions.nextElementSibling, page.$('listTabs'), '接著是清單的頁籤');
    for (const id of ['newListBtn', 'importBtn', 'exportBtn']) isSame(page.$(id).parentNode, actions, id);
    isSame(page.document.querySelector('.toolbar .toolbar-actions'), null, '搜尋框那一列不再有這三顆按鈕');
    const container = page.$('itemsContainer');
    assert.equal(container.className, 'gx-cards');
    assert.equal(page.cards().length, 34);
    assert.equal(container.querySelectorAll('.btn-primary').length, 0);
    // gathering-materials.js 緊接在 time-calculator.js 後面載入
    const scripts = [...read('tools/timed-gathering/index.html').matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(scripts.indexOf('gathering-materials.js'), scripts.indexOf('time-calculator.js') + 1);
});

test('卡片與搜尋結果的文字三語都有；index.html 的預設文字是中文', () => {
    const expected = {
        // 英文、日文寫短一點：手機（360px）的搜尋框放得下，不被切掉
        searchPlaceholder: ['用中文、日文或英文搜尋', 'Search in EN, JP or ZH-TW', '日・英・中国語で検索'],
        itemsListTitle: ['採集物', 'Gatherables', '採集物'],
        resultsCount: ['{count} 種 · 照出現時間排序', '{count} items · soonest first', '{count}種 ・ 出現が近い順'],
        resultsFound: ['找到 {count} 種', '{count} found', '{count}種見つかりました'],
        statusNow: ['現在可採 · 還剩 {left}（到 {end}）', 'Up now · {left} left (until {end})', '採集可能 ・ 残り{left}（{end}まで）'],
        statusNext: ['{time} 出現 · 還要 {wait}', 'Appears at {time} · in {wait}', '{time}に出現 ・ あと{wait}'],
        statusAllDay: ['全天都可以採', 'Available all day', '終日採集できます'],
        waitMinutes: ['{m} 分', '{m} min', '{m}分'],
        scheduleDaily: ['每天 {slots}，每次約 {minutes} 分鐘', 'Daily at {slots}, about {minutes} min each', '毎日 {slots}、1回約{minutes}分'],
        scheduleAllDay: ['全天', 'All day', '終日'],
        listSeparator: ['、', ', ', '、'],
        // 瀏覽器封鎖網站資料時按「加入清單」：加進去了，但記不住
        listAddedNotSaved: [
            '已加入清單，但瀏覽器不讓這個網站存資料，重新整理後就不見了',
            "Added to the list, but your browser won't let this site save data, so it will be gone after a reload",
            'リストに追加しましたが、ブラウザがこのサイトのデータ保存を許可していないため、再読み込みすると消えます'
        ]
    };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(expected)) assert.equal(values.get(key), texts[index], `${lang} ${key}`);
    });
    const html = read('tools/timed-gathering/index.html');
    assert.match(html, /<h2 data-i18n="itemsListTitle">採集物<\/h2>/);
    assert.match(html, /id="searchInput"[^>]*placeholder="用中文、日文或英文搜尋"/);
});
