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
// 沒有搜尋時卡片該有的順序：自己用 state 與 compare 排（同「沒有搜尋時照出現時間排序」那個測試），都同分時照資料的順序
const expectedKeys = (page) => {
    const M = page.window.GatheringMaterials;
    return Array.from(M.group(items), (material, index) => ({ key: material.key, state: M.state(material, page.now), index }))
        .sort((a, b) => M.compare(a.state, b.state) || a.index - b.index)
        .map((entry) => entry.key);
};
// this.shown 的 key：它跟著畫面上卡片的順序（重排延後時，跟著還沒動的畫面）
const shownKeys = (page) => Array.from(page.app.shown, (material) => material.key);
// 把畫面上的順序倒過來丟給 sortMaterials()：它不看傳進來的順序（只看分數、狀態與資料的順序），所以結果要和畫面上的一樣。
// 回傳測試端的字串陣列（頁面在 vm 裡建出來的陣列，原型和測試端不同）
const sortedFromReversed = (page) => Array.from(
    page.app.sortMaterials([...page.app.shown].reverse(), page.now),
    (material) => material.key
);
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
    // 網頁提醒的開關與測試鈕照樣能用（設計 6.1：不變灰），舊的通知狀態徽章拿掉了
    for (const id of ['notificationToggle', 'testNotificationBtn']) {
        assert.ok(!page.$(id).disabled && !page.$(id).hasAttribute('disabled'), `#${id} 不停用`);
    }
    isSame(page.$('notificationStatus'), null, '沒有 #notificationStatus');
    page.cardOf('botany_cordia_resin').querySelector('.gx-add-btn').click();
    assert.equal(app.listManager.getList('default').items.length, 2);
    // 設了提醒：下方寫出這個瀏覽器不能跳通知（到時間只有頁內提示和提示音）
    page.cardOf('botany_cordia_resin').querySelector('.gx-remind-btn').click();
    assert.equal(page.$('notificationToggle').checked, true);
    assert.equal(page.$('notifyStatus').hidden, false);
    assert.equal(page.$('notifyStatus').textContent, '這個瀏覽器不能跳通知，到時間只會在頁面上提示和發出聲音，或改用遊戲鬧鐘。');
    assert.doesNotThrow(() => page.$('testNotificationBtn').click());
    assert.equal(page.document.body.querySelectorAll('.reminder-alert').length, 1, '測試通知照樣有頁內提示');
    assert.deepEqual(page.consoleErrors, []);
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

test('elements on the stand-in have what the page relies on: string values, select(), scrollIntoView() and getBoundingClientRect()', async () => {
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
    // 沒有排版：每個元素量出來的位置都是 0（頁面不會補捲動）；window.scrollBy() 只記下每一次呼叫，不真的捲動
    for (const element of [page.$('macroOutput'), page.document.createElement('div')]) {
        const rect = element.getBoundingClientRect();
        assert.deepEqual([rect.top, rect.bottom, rect.left, rect.right, rect.width, rect.height], [0, 0, 0, 0, 0, 0]);
    }
    assert.deepEqual(page.scrolls, []);
    page.window.scrollBy(0, 5);
    assert.deepEqual(page.scrolls, [[0, 5]]);
});

test('with localStorage blocked the page still loads, and what it logs is recorded instead of printed', async t => {
    const printed = ['log', 'warn', 'error'].map(method => t.mock.method(console, method, () => {}));
    const page = await createGatheringPage({ storageThrows: true });
    assert.equal(page.cards().length, 34);
    assert.ok(page.consoleErrors.length > 0);
    assert.ok(page.consoleErrors.every(entry => entry.includes('SecurityError')), page.consoleErrors.join('\n'));
    // console.error、console.warn 與 console.log 都記下 util.format(...參數) 的結果（同 Node 的 console：物件、Symbol 照樣寫得出來）。
    // 頁面不該在 console 留下任何東西，所以 console.log 也記：期待 consoleErrors 是空的測試也擋得住多出來的除錯訊息
    page.window.console.warn('careful', 1);
    page.window.console.error('obj', { a: 1 }, Symbol('s'));
    page.window.console.log('debug', 2);
    assert.deepEqual(page.consoleErrors.slice(-3), ['careful 1', 'obj { a: 1 } Symbol(s)', 'debug 2']);
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
    assert.deepEqual(sortedFromReversed(page), keysOf(page), 'sortMaterials() 不看傳進來的順序');
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
    assert.deepEqual(sortedFromReversed(page), keysOf(page), '有搜尋時 sortMaterials() 也不看傳進來的順序');
    for (const card of page.cards()) assert.deepEqual(marksIn(card.querySelector('.gx-where')), [], '中文介面的地區是中文，沒有命中的字');

    // 照分數排：深琥珀的地區與地點都是科扎瑪爾卡，分數最高；菱錳礦與紫色舌尖同分，照出現時間（全天的最後）
    search(page, '科扎瑪爾卡');
    assert.deepEqual(keysOf(page), ['mining_dark_amber_70', 'mining_rhodochrosite_72', 'fishing_purple_tongue']);
    assert.deepEqual(keysOf(page), expectedOrder('科扎瑪爾卡'));
    assert.deepEqual(sortedFromReversed(page), keysOf(page), '分數不同時也一樣');
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
    // 打開頁面時 ListManager 讀不到清單，記下一筆
    const loadErrors = [...page.consoleErrors];
    assert.equal(loadErrors.length, 1, loadErrors.join('\n'));
    assert.match(loadErrors[0], /^載入清單失敗: Error: SecurityError/);
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
    // console 只有 ListManager 自己記的：打開時讀不到的那一筆，加上每個時段存不起來各一筆（saveToStorage() 先記下再丟出來）
    assert.equal(page.consoleErrors.length, 3, page.consoleErrors.join('\n'));
    assert.equal(page.consoleErrors[0], loadErrors[0]);
    for (const entry of page.consoleErrors.slice(1)) assert.match(entry, /^儲存清單失敗: Error: SecurityError/);

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

// ---------- 倒數每秒走、切換時重排 ----------
// 資料的時段都落在每 2 個艾歐澤亞小時一格的整點上，所以 ET 12:00 整同時有兩群切換：
// 10:00 開始的四種（八面體隕鐵礦石、黑琥珀原石、金合歡原木、真銀礦）在 12:00 結束（end 不含），
// 12:00 開始的五種（科迪亞樹液塊、科迪亞原木、高山亞麻、風勞雷爾、伊佩原木）在 12:00 出現
const ENDING = ['mining_octahedrite_72', 'mining_dark_amber_70', 'botany_acacia_log_70', 'mining_true_silver_70'];
const STARTING = ['botany_cordia_resin', 'botany_cordia_log_72', 'botany_alpine_flax_70', 'botany_wind_laurel_70', 'botany_ipe_log_70'];

test('倒數每秒走，只換狀態行的文字，卡片和狀態行都是同一個元素', async () => {
    // ET 12:30：科迪亞樹液塊正在可採（到 ET 14:00）；雷電石英下一次是隔天 ET 00:00，還要 34 分；紫色舌尖全天
    const page = await createGatheringPage({ now: at(0, 12, 30) });
    const M = page.window.GatheringMaterials;
    const keys = keysOf(page);
    const cards = page.cards();
    const card = page.cardOf('botany_cordia_resin');
    const status = card.querySelector('.gx-status');
    const parts = Array.from(card.children);
    const upNow = () => `現在可採 · 還剩 ${M.countdown(at(0, 14) - page.now)}（到 ${M.localTime(at(0, 14))}）`;
    assert.equal(status.textContent, upNow());
    // 這一分鐘裡「還要 34 分」和「全天都可以採」都不會變：文字節點還是同一個，沒有重寫
    const quartz = page.cardOf('mining_lightning_quartz').querySelector('.gx-status');
    const fishing = page.cardOf('fishing_purple_tongue').querySelector('.gx-status');
    const [quartzText, fishingText] = [quartz.firstChild, fishing.firstChild];

    for (let second = 1; second <= 5; second += 1) {
        const written = status.textContent;
        page.tick(1000);
        assert.notEqual(status.textContent, written, `第 ${second} 秒倒數變了`);
        assert.equal(status.textContent, upNow());
    }

    isSame(page.cardOf('botany_cordia_resin'), card, '還是同一張卡片');
    isSame(card.querySelector('.gx-status'), status, '還是同一個狀態行');
    assert.ok(card.children.length === parts.length && card.children.every((child, index) => child === parts[index]), '卡片裡其他的部分沒動');
    assert.ok(page.cards().length === cards.length && page.cards().every((element, index) => element === cards[index]), '34 張卡片都是原本的元素、順序也沒變');
    assert.deepEqual(keysOf(page), keys);
    assert.ok(status.classList.contains('now') && card.classList.contains('is-now'));
    isSame(quartz.firstChild, quartzText, '沒變的文字不重寫');
    isSame(fishing.firstChild, fishingText, '沒變的文字不重寫');
    assert.equal(quartz.textContent, `${M.localTime(at(1, 0))} 出現 · 還要 34 分`);
    assert.equal(fishing.textContent, '全天都可以採');
    assert.deepEqual(page.consoleErrors, []);
});

test('下一次的倒數：滿 10 分鐘寫 N 分，不到 10 分鐘改寫 m:ss 並每秒走，開始的那一秒換成現在可採', async () => {
    // 科迪亞樹液塊的下一次是 ET 12:00；開始前 600.5 秒還寫「11 分」
    const start = at(0, 12);
    const page = await createGatheringPage({ now: start - 600_500 });
    const M = page.window.GatheringMaterials;
    const card = page.cardOf('botany_cordia_resin');
    const status = card.querySelector('.gx-status');
    const time = M.localTime(start);
    assert.equal(status.textContent, `${time} 出現 · 還要 11 分`);
    page.tick(1000);
    assert.equal(status.textContent, `${time} 出現 · 還要 10:00`);
    page.tick(1000);
    assert.equal(status.textContent, `${time} 出現 · 還要 9:59`);
    assert.ok(!status.classList.contains('now') && !card.classList.contains('is-now'));

    page.tick(start - 1000 - page.now);
    assert.equal(status.textContent, `${time} 出現 · 還要 0:01`);
    page.tick(1000);
    assert.equal(page.now, start);
    assert.equal(status.textContent, `現在可採 · 還剩 ${M.countdown(at(0, 14) - start)}（到 ${M.localTime(at(0, 14))}）`);
    assert.ok(status.classList.contains('now') && card.classList.contains('is-now'));
    isSame(page.cardOf('botany_cordia_resin'), card, '還是同一張卡片');
    isSame(card.querySelector('.gx-status'), status, '還是同一個狀態行');

    // 現在可採的結束了：回到「幾點出現・還要多久」，標示拿掉
    page.tick(at(0, 14) - page.now);
    assert.equal(status.textContent, `${M.localTime(at(1, 0))} 出現 · 還要 ${M.minutesCeil(at(1, 0) - page.now)} 分`);
    assert.ok(!status.classList.contains('now') && !card.classList.contains('is-now'));
    assert.deepEqual(page.consoleErrors, []);
});

test('從出現切換到現在可採、從現在可採切換到下一次時重排：搬動原本的卡片，不重建', async () => {
    // ET 12:00 前 1 秒：10:00 開始的四種還能採，12:00 開始的五種 1 秒後出現
    const page = await createGatheringPage({ now: at(0, 12) - 1000 });
    const M = page.window.GatheringMaterials;
    const cards = new Map(page.cards().map((card) => [card.dataset.material, card]));
    assert.deepEqual(keysOf(page).slice(0, 4), ENDING, '最前面是還在採的四種');
    assert.deepEqual(keysOf(page), expectedKeys(page));
    for (const key of ENDING) assert.ok(page.cardOf(key).classList.contains('is-now'), key);
    for (const key of STARTING) assert.ok(!page.cardOf(key).classList.contains('is-now'), key);

    page.tick(1000);
    assert.equal(page.now, at(0, 12));
    // 12:00 出現的五種排進現在可採的那一群（同時結束的照資料的順序）；結束的四種跑到快出現的那一群裡
    assert.deepEqual(keysOf(page).slice(0, 5), STARTING);
    assert.deepEqual(keysOf(page), expectedKeys(page));
    assert.deepEqual(shownKeys(page), keysOf(page), 'this.shown 跟著畫面上的順序');
    assert.ok(keysOf(page).indexOf(ENDING[0]) > 5, '結束的排到後面');
    // 搬動，不重建：34 張都還是原本的元素
    assert.equal(page.cards().length, 34);
    for (const [key, card] of cards) isSame(page.cardOf(key), card, `${key} 還是同一張卡片`);
    for (const key of STARTING) {
        const card = page.cardOf(key);
        assert.ok(card.classList.contains('is-now') && card.querySelector('.gx-status').classList.contains('now'), key);
        assert.equal(textOf(card, '.gx-status'), `現在可採 · 還剩 ${M.countdown(at(0, 14) - page.now)}（到 ${M.localTime(at(0, 14))}）`);
    }
    for (const key of ENDING) {
        const card = page.cardOf(key);
        assert.ok(!card.classList.contains('is-now') && !card.querySelector('.gx-status').classList.contains('now'), key);
        assert.equal(textOf(card, '.gx-status'), `${M.localTime(at(0, 22))} 出現 · 還要 ${M.minutesCeil(at(0, 22) - page.now)} 分`);
    }

    // 沒有卡片切換的下一秒不排；換語言整個重畫，也是照現在的順序
    const sorted = keysOf(page);
    page.tick(1000);
    assert.deepEqual(keysOf(page), sorted);
    page.setLang('en');
    assert.deepEqual(keysOf(page), expectedKeys(page));
    assert.deepEqual(page.consoleErrors, []);
});

test('有搜尋時重排仍然先看分數：現在可採的不會把分數高的擠到後面', async () => {
    // 搜「科扎瑪爾卡」：黑琥珀原石的地區與地點都符合，分數最高；薔薇輝石原石（ET 08:00 開始）和紫色舌尖各符合一次
    const page = await createGatheringPage({ now: at(0, 8) - 1000 });
    search(page, '科扎瑪爾卡');
    const order = ['mining_dark_amber_70', 'mining_rhodochrosite_72', 'fishing_purple_tongue'];
    assert.deepEqual(keysOf(page), order);
    const cards = page.cards();
    // 地點行只寫一次科扎瑪爾卡（地點和地區同名）
    const marks = marksIn(page.cardOf('mining_dark_amber_70').querySelector('.gx-where'));
    assert.deepEqual(marks, ['科扎瑪爾卡']);

    page.tick(1000);
    assert.ok(page.cardOf('mining_rhodochrosite_72').classList.contains('is-now'), '薔薇輝石原石開始了');
    assert.ok(!page.cardOf('mining_dark_amber_70').classList.contains('is-now'));
    assert.deepEqual(keysOf(page), order, '只看狀態的話薔薇輝石原石會排到最前面，有搜尋時分數優先');
    assert.deepEqual(sortedFromReversed(page), order);
    assert.ok(page.cards().every((card, index) => card === cards[index]), '還是原本的卡片');
    assert.deepEqual(marksIn(page.cardOf('mining_dark_amber_70').querySelector('.gx-where')), marks, '命中的字還在');
    assert.equal(page.$('itemCount').textContent, '找到 3 種');
    assert.deepEqual(page.consoleErrors, []);
});

test('現在可採的素材換成另一段（kind 沒變、start 變了）也重排：兩段重疊時取最晚結束的', async () => {
    // 甲有兩段重疊的時段 ET 00:00–04:00 與 02:00–08:00，乙是 00:00–06:00。ET 02:00 之前甲只在第一段裡（到 04:00），乙剩比較久；
    // ET 02:00 第二段也開始了，甲改成第二段（到 08:00），剩比較久的換成甲。兩個一直是現在可採，只有順序要換
    const record = (id, time, duration) => ({ ...items[0], id, name: id, nameEn: id, nameJp: id, time, duration });
    const page = await createGatheringPage({
        now: at(0, 2) - 1000,
        items: [record('jia_1', '00:00-04:00', 240), record('jia_2', '02:00-08:00', 360), record('yi', '00:00-06:00', 360)]
    });
    const M = page.window.GatheringMaterials;
    const cards = page.cards();
    assert.deepEqual(keysOf(page), ['yi', 'jia']);
    assert.ok(cards.every((card) => card.classList.contains('is-now')));

    page.tick(1000);
    assert.equal(page.now, at(0, 2));
    assert.deepEqual(keysOf(page), ['jia', 'yi']);
    assert.ok(page.cards().every((card) => card.classList.contains('is-now')), '一直是現在可採');
    assert.ok(page.cards().length === cards.length && page.cards().every((card) => cards.includes(card)), '搬動的是原本的卡片');
    assert.equal(textOf(page.cardOf('jia'), '.gx-status'), `現在可採 · 還剩 ${M.countdown(at(0, 8) - page.now)}（到 ${M.localTime(at(0, 8))}）`);
    assert.deepEqual(page.consoleErrors, []);
});

test('只有一張從出現切到現在可採（沒有任何一張結束、start 沒變）也重排', async () => {
    // 甲（aa）ET 00:00–03:00 一直是現在可採；乙（bb）02:00–08:00 在 ET 02:00 開始。乙出現前後的 start 都是 ET 02:00，
    // 又沒有任何一張結束，所以只有 kind 變了（出現 → 現在可採）；乙剩比較久，要排到甲前面。
    // （真的資料每個整點都有卡片同時結束，結束的那幾張 start 會變，單靠它們就會重排，所以這裡要用自己的資料）
    const record = (id, time, duration) => ({ ...items[0], id, name: id, nameEn: id, nameJp: id, time, duration });
    const page = await createGatheringPage({
        now: at(0, 2) - 1000,
        items: [record('aa', '00:00-03:00', 180), record('bb', '02:00-08:00', 360)]
    });
    const cards = page.cards();
    assert.deepEqual(keysOf(page), ['aa', 'bb']);
    assert.ok(page.cardOf('aa').classList.contains('is-now') && !page.cardOf('bb').classList.contains('is-now'));

    page.tick(1000);
    assert.equal(page.now, at(0, 2));
    assert.ok(page.cardOf('aa').classList.contains('is-now') && page.cardOf('bb').classList.contains('is-now'));
    assert.deepEqual(keysOf(page), ['bb', 'aa']);
    assert.ok(page.cards().length === cards.length && page.cards().every((card) => cards.includes(card)), '搬動的是原本的卡片');
    assert.deepEqual(page.consoleErrors, []);
});

test('焦點在卡片的按鈕上時先不排，焦點離開清單才排；按鈕還是同一個元素、焦點不動', async () => {
    const page = await createGatheringPage({ now: at(0, 12) - 1000 });
    const before = keysOf(page);
    // 八面體隕鐵礦石在 ET 12:00 結束，重排會把它從最前面搬到後面
    const key = 'mining_octahedrite_72';
    const button = page.cardOf(key).querySelector('.gx-add-btn');
    button.focus();

    page.tick(1000);
    // 倒數和標示照樣更新，只是順序先不動，焦點也不動
    assert.ok(!page.cardOf(key).classList.contains('is-now'));
    assert.ok(page.cardOf('botany_cordia_resin').classList.contains('is-now'));
    assert.deepEqual(keysOf(page), before);
    assert.deepEqual(shownKeys(page), before, '延後的時候 this.shown 也還是畫面上的順序');
    isSame(page.document.activeElement, button, '焦點還在按鈕上');

    // 焦點只是在清單裡的卡片之間移動：還在清單裡，先不排
    const other = page.cardOf('mining_dark_amber_70').querySelector('.gx-add-btn');
    other.focus();
    assert.deepEqual(keysOf(page), before);
    isSame(page.document.activeElement, other);
    // 沒有切換的下一秒也不排
    page.tick(1000);
    assert.deepEqual(keysOf(page), before);

    // 焦點離開清單：照現在的時間排
    const searchInput = page.$('searchInput');
    searchInput.focus();
    assert.deepEqual(keysOf(page), expectedKeys(page));
    assert.deepEqual(shownKeys(page), keysOf(page));
    assert.notDeepEqual(keysOf(page), before);
    assert.deepEqual(keysOf(page).slice(0, 5), STARTING);
    isSame(page.document.activeElement, searchInput, '焦點在搜尋框，沒被搶走');
    // 搬動的是原本的卡片：按鈕還在文件裡，而且是原本的元素
    isSame(page.cardOf(key).querySelector('.gx-add-btn'), button, '還是同一顆按鈕');
    assert.ok(page.document.contains(button) && page.document.contains(other));

    // 排好了就不再排
    const sorted = keysOf(page);
    page.tick(1000);
    assert.deepEqual(keysOf(page), sorted);
    assert.deepEqual(page.consoleErrors, []);
});

test('瀏覽器視窗失去焦點（焦點還在按鈕上）不排；按鈕自己失去焦點才排', async () => {
    const page = await createGatheringPage({ now: at(0, 12) - 1000 });
    const before = keysOf(page);
    const button = page.cardOf('mining_octahedrite_72').querySelector('.gx-add-btn');
    button.focus();
    page.tick(1000);
    assert.deepEqual(keysOf(page), before);

    // 視窗失去焦點時 focusout 的 relatedTarget 是 null，但 document.activeElement 還是那顆按鈕
    button.dispatchEvent(new page.window.Event('focusout', { bubbles: true }));
    isSame(page.document.activeElement, button);
    assert.deepEqual(keysOf(page), before);

    button.blur();
    assert.deepEqual(keysOf(page), expectedKeys(page));
    assert.notDeepEqual(keysOf(page), before);
    assert.deepEqual(page.consoleErrors, []);
});

test('電腦睡著很久之後醒來，狀態和順序直接是現在的', async () => {
    const page = await createGatheringPage({ now: at(0, 12, 30) });
    const before = keysOf(page);
    const cards = page.cards();
    // 睡了 3 小時（約 2.5 個艾歐澤亞天），計時器整段都沒跑，醒來後第一次執行
    page.tick(3 * 3_600_000);
    assert.deepEqual(keysOf(page), expectedKeys(page));
    assert.notDeepEqual(keysOf(page), before);
    // 和這個時間才打開的頁面一模一樣：順序、每張卡片的狀態行與現在可採的標示
    const fresh = await createGatheringPage({ now: page.now });
    assert.deepEqual(keysOf(page), keysOf(fresh));
    for (const key of keysOf(page)) {
        const [card, other] = [page.cardOf(key), fresh.cardOf(key)];
        assert.equal(textOf(card, '.gx-status'), textOf(other, '.gx-status'), key);
        assert.equal(card.className, other.className, key);
        assert.equal(card.querySelector('.gx-status').className, other.querySelector('.gx-status').className, key);
    }
    assert.ok(cards.every((card) => page.cardOf(card.dataset.material) === card), '搬動的是原本的卡片');
    assert.deepEqual(page.consoleErrors, []);
});

test('整個重畫（換語言、篩選、搜尋）時順序也是現在的：醒來後計時器還沒跑就先切換語言', async () => {
    const page = await createGatheringPage({ now: at(0, 12, 30) });
    const before = keysOf(page);
    page.now += 3 * 3_600_000; // 睡了 3 小時，醒來後計時器還沒跑
    page.setLang('en');
    assert.deepEqual(keysOf(page), expectedKeys(page));
    assert.notDeepEqual(keysOf(page), before);
    // 重畫的卡片已經是現在的狀態：之後的計時器不會再改順序
    const sorted = keysOf(page);
    page.tick(1000);
    assert.deepEqual(keysOf(page), sorted);
    assert.deepEqual(keysOf(page), expectedKeys(page));

    // 篩選與搜尋也一樣：照畫的當下的時間排
    page.now += 3 * 3_600_000;
    search(page, "Yak T'el");
    assert.equal(page.cards().length, 4);
    assert.deepEqual(sortedFromReversed(page), keysOf(page));
    const yak = new Set(keysOf(page));
    assert.deepEqual(keysOf(page), expectedKeys(page).filter((key) => yak.has(key)));
    assert.deepEqual(page.consoleErrors, []);
});

test('篩選時計數是篩選後的種數，倒數只走畫面上的卡片', async () => {
    const page = await createGatheringPage({ now: at(0, 12, 30) });
    const chip = page.$('typeFilters').querySelector('[data-type="fishing"]');
    chip.click();
    assert.deepEqual(keysOf(page), ['fishing_purple_tongue']);
    assert.equal(page.$('itemCount').textContent, '1 種 · 照出現時間排序');
    // 畫面上只有一張卡片，過一個艾歐澤亞天之後計數還是篩選後的種數
    page.tick(4_200_000);
    assert.deepEqual(keysOf(page), ['fishing_purple_tongue']);
    assert.equal(page.$('itemCount').textContent, '1 種 · 照出現時間排序');
    // 沒有符合的：空狀態，計時器照走也不丟錯
    search(page, 'no-such-ore');
    assert.equal(page.cards().length, 0);
    page.tick(1000);
    assert.equal(textOf(page.$('itemsContainer'), '.empty-state'), '沒有符合條件的採集物');
    // 取消篩選與搜尋：回到全部，畫成現在的時間
    page.$('clearSearchBtn').click();
    chip.click();
    assert.equal(page.cards().length, 34);
    assert.equal(page.$('itemCount').textContent, '34 種 · 照出現時間排序');
    assert.deepEqual(keysOf(page), expectedKeys(page));
    assert.deepEqual(page.consoleErrors, []);
});

// ---------- 我的提醒與「提醒我」 ----------
const KEY = 'ff14tw_timed_gathering_reminders';
const NOTIFIED_KEY = 'ff14tw_timed_gathering_notified';
const LEGACY_KEY = 'ff14tw_timed_gathering_notifications';
const MINUTE = 60_000;
// 科迪亞樹液塊：ET 00:00、12:00，每次 2 個艾歐澤亞小時（約 6 分鐘）；八面體隕鐵礦石：ET 10:00、22:00
const CORDIA = 'botany_cordia_resin';
const OCTA = 'mining_octahedrite_72';
const CORDIA_PLACE = '雅克特爾樹海 · 瑪姆克　X:35.7, Y:22.3';
const DENIED_TEXT = '瀏覽器封鎖了這個網站的通知，到時間只會在頁面上提示和發出聲音。可以從網址列左邊的網站設定打開，或改用遊戲鬧鐘。';
const UNSUPPORTED_TEXT = '這個瀏覽器不能跳通知，到時間只會在頁面上提示和發出聲音，或改用遊戲鬧鐘。';

// localStorage 裡的我的提醒（GatheringReminders 的格式）：keys 照加入的順序，都在 armedAt 設定，網頁提醒也在 armedAt 打開
const storedReminders = (keys, { enabled = true, lead = 1, armedAt }) => ({
    [KEY]: JSON.stringify({ enabled, enabledAt: armedAt, leadMinutes: lead, entries: keys.map((key) => ({ key, armedAt })) })
});
const savedReminders = (page) => JSON.parse(page.storage.get(KEY));
// 我的提醒每一列的素材 key，照畫面上的順序
const rowKeys = (page) => page.$('reminderList').children.map((row) => row.dataset.material);
const rowOf = (page, key) => page.$('reminderList').querySelector(`[data-material="${key}"]`);
const cancelBtnOf = (page, key) => rowOf(page, key).querySelector('.gx-cancel-btn');
const remindBtnOf = (page, key) => page.cardOf(key).querySelector('.gx-remind-btn');
// 頁內提示：ReminderScheduler.deliver() 加在 body 上的 .reminder-alert（測試裡的 setTimeout 不會自己跑，所以不會收起）
const alertsOn = (page) => page.document.body.querySelectorAll('.reminder-alert');
// 元素在、而且本身和祖先都沒有 hidden（fake-dom 看不出 CSS，只看屬性）
function shown(page, id) {
    const element = page.$(id);
    assert.ok(element, `#${id} 不存在`);
    for (let node = element; node && node.nodeType === 1; node = node.parentNode) {
        if (node.hidden) return false;
    }
    return true;
}
// fake-dom 的 click() 不會切換核取方塊，也不會換下拉選單的值：直接設好，再派送 change（同使用者操作後瀏覽器做的）
function setToggle(page, on) {
    const toggle = page.$('notificationToggle');
    toggle.checked = on;
    toggle.dispatchEvent(new page.window.Event('change', { bubbles: true }));
}
function setLead(page, minutes) {
    const select = page.$('leadSelect');
    select.value = String(minutes);
    select.dispatchEvent(new page.window.Event('change', { bubbles: true }));
}

test('沒有提醒時「我的提醒」不顯示，時鐘一行在搜尋框上面；有提醒時時鐘搬進標題列', async () => {
    // ET 12:30 再過 1 秒（不落在整分鐘的邊界上）
    const page = await createGatheringPage({ now: at(0, 12, 30) + 1000 });
    const M = page.window.GatheringMaterials;
    assert.equal(shown(page, 'reminders'), false);
    isSame(page.$('clockLine').parentNode, page.$('clockSlot'), '沒有提醒：時鐘一行在 #clockSlot');
    isSame(page.$('reminders').nextElementSibling, page.$('clockSlot'), '我的提醒在時鐘的位置上面');
    isSame(page.$('clockSlot').nextElementSibling, page.document.querySelector('.tool-content'), '時鐘一行緊接在搜尋框那一區前面');
    assert.equal(page.$('clockEt').textContent, '12:30');
    assert.equal(page.$('clockLocal').textContent, M.localTime(page.now));
    // 艾歐澤亞的一分鐘約 2.9 秒：時鐘跟著走
    page.tick(3000);
    assert.equal(page.$('clockEt').textContent, '12:31');
    assert.equal(page.$('clockLocal').textContent, M.localTime(page.now));

    remindBtnOf(page, CORDIA).click();
    assert.equal(shown(page, 'reminders'), true);
    isSame(page.$('clockLine').parentNode, page.$('remindersHead'), '有提醒：時鐘一行在我的提醒的標題列');
    assert.equal(page.$('reminderCount').textContent, '1');
    page.tick(3000);
    assert.equal(page.$('clockEt').textContent, '12:32', '搬過去照樣走');

    remindBtnOf(page, CORDIA).click();
    assert.equal(shown(page, 'reminders'), false);
    isSame(page.$('clockLine').parentNode, page.$('clockSlot'), '沒有提醒了：搬回搜尋框上面');
    assert.deepEqual(page.consoleErrors, []);

    // 我的提醒到搜尋框的距離和沒有提醒時時鐘一行到搜尋框一樣，只有共用的 .tool-content 上方留白：
    // .gx-reminders 的 margin-bottom 是 0（桌機與 ≤768px 的規則都是）
    const css = read('tools/timed-gathering/style.css');
    const margins = Array.from(css.matchAll(/\.gx-reminders\s*\{([^}]*)\}/g), (rule) => rule[1].match(/margin-bottom:\s*([^;]+);/)?.[1]);
    assert.deepEqual(margins, ['0', '0']);
});

test('按「提醒我」：加進我的提醒，網頁提醒順便打開（只問一次權限、不等回答），按鈕改成已設提醒；再按取消', async () => {
    // ET 11:00：科迪亞樹液塊與科迪亞原木下一次都是 ET 12:00
    const page = await createGatheringPage({ now: at(0, 11) });
    const card = page.cardOf(CORDIA);
    const button = remindBtnOf(page, CORDIA);
    assert.equal(button.type, 'button');
    assert.equal(button.className, 'btn btn-sm btn-outline gx-remind-btn');
    assert.equal(button.textContent, '🔔 提醒我');
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    isSame(button.parentNode, card.querySelector('.gx-actions'), '提醒鈕在卡片的按鈕列');
    // 卡片的按鈕列：提醒我 → 複製鬧鐘（Task 8）→ 加入清單
    isSame(button.nextElementSibling, card.querySelector('.gx-alarm-btn'), '提醒鈕後面是複製鬧鐘');
    isSame(card.querySelector('.gx-alarm-btn').nextElementSibling, card.querySelector('.gx-add-btn'), '提醒鈕在加入清單前面');
    assert.equal(page.$('notificationToggle').checked, false);
    assert.equal(page.permissionRequests, 0, '打開頁面時不問權限');

    button.focus();
    button.click();
    assert.equal(page.permissionRequests, 1, '在點擊裡問一次權限');
    assert.equal(page.$('notificationToggle').checked, true, '網頁提醒順便打開');
    assert.deepEqual(rowKeys(page), [CORDIA]);
    assert.deepEqual(page.toasts.at(-1), { message: '已設提醒：科迪亞樹液塊', type: 'success' });
    assert.deepEqual(savedReminders(page), { enabled: true, enabledAt: page.now, leadMinutes: 1, entries: [{ key: CORDIA, armedAt: page.now }] });
    // 就地更新：還是同一個按鈕、焦點不動、不停用
    isSame(remindBtnOf(page, CORDIA), button, '還是同一個按鈕');
    isSame(page.document.activeElement, button, '焦點還在按鈕上');
    assert.equal(button.textContent, '🔔 已設提醒');
    assert.equal(button.className, 'btn btn-sm btn-success gx-remind-btn');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.ok(!button.disabled && !button.hasAttribute('disabled'), '提醒鈕不用 disabled');
    await page.settle();

    // 網頁提醒已經開著、也允許了：再設一個不再問
    remindBtnOf(page, 'botany_cordia_log_72').click();
    await page.settle();
    assert.equal(page.permissionRequests, 1);
    assert.deepEqual(rowKeys(page), [CORDIA, 'botany_cordia_log_72']);

    // 再按一次：取消
    button.click();
    assert.deepEqual(rowKeys(page), ['botany_cordia_log_72']);
    assert.deepEqual(page.toasts.at(-1), { message: '已取消提醒：科迪亞樹液塊', type: 'info' });
    isSame(remindBtnOf(page, CORDIA), button, '還是同一個按鈕');
    isSame(page.document.activeElement, button, '取消之後焦點也不動');
    assert.equal(button.textContent, '🔔 提醒我');
    assert.equal(button.className, 'btn btn-sm btn-outline gx-remind-btn');
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    remindBtnOf(page, 'botany_cordia_log_72').click();
    assert.deepEqual(rowKeys(page), []);
    assert.equal(shown(page, 'reminders'), false);
    assert.deepEqual(savedReminders(page).entries, []);
    assert.deepEqual(page.consoleErrors, []);

    // 不等回答：問題一直沒有回答（玩家回到遊戲裡）也已經設好、網頁提醒已經打開
    const waiting = await createGatheringPage({ now: at(0, 11) });
    let asked = 0;
    waiting.window.Notification.requestPermission = () => {
        asked += 1;
        return new Promise(() => {});
    };
    remindBtnOf(waiting, CORDIA).click();
    assert.equal(asked, 1, '在點擊裡問');
    assert.deepEqual(rowKeys(waiting), [CORDIA]);
    assert.equal(waiting.$('notificationToggle').checked, true);
    assert.equal(savedReminders(waiting).enabled, true);
    await waiting.settle();
    assert.deepEqual(rowKeys(waiting), [CORDIA]);
});

// 按卡片上的「提醒我」時，頁面最上面的我的提醒冒出來、收起來或多一列少一列，下面的內容整個被推開或拉回，剛按下的按鈕就跑到別處：
// 捲動位置是 0 時 Chrome 不會自己錨定，Safari 完全沒有，390×844 的手機上按鈕從 y=557 掉到 y=858，掉出畫面。
// 所以頁面更新前後各量一次按鈕的位置，差了就把頁面捲回去。fake-dom 沒有排版，由測試讓按鈕自己回報畫面上的位置：
// 它在文件裡的位置（top），加上上面我的提醒的高度（藏著是 0；顯示時 237 加每一列 64，一列就是手機上量到的 301），
// 再減掉已經捲動的距離（page.scrolls 累加，捲不到負的）。回傳一個函式，讀出按鈕現在在畫面上的位置
const REMINDERS_BASE_HEIGHT = 237;
const REMINDER_ROW_HEIGHT = 64;
function layOutAt(page, button, top) {
    const scrolledBy = () => page.scrolls.reduce((sum, [, y]) => Math.max(0, sum + y), 0);
    button.getBoundingClientRect = () => {
        const rows = page.$('reminderList').children.length;
        const above = page.$('reminders').hidden ? 0 : REMINDERS_BASE_HEIGHT + REMINDER_ROW_HEIGHT * rows;
        return { top: top + above - scrolledBy() };
    };
    return () => button.getBoundingClientRect().top;
}

test('按卡片上的「提醒我」：我的提醒把下面的內容推開，頁面捲動同樣的量，按下的按鈕留在畫面上原來的位置；取消、多一列、少一列也一樣', async () => {
    // ET 11:00：科迪亞樹液塊與科迪亞原木下一次都是 ET 12:00
    const page = await createGatheringPage({ now: at(0, 11) });
    const first = remindBtnOf(page, CORDIA);
    const second = remindBtnOf(page, 'botany_cordia_log_72');
    const firstTop = layOutAt(page, first, 557);
    const secondTop = layOutAt(page, second, 700);
    assert.equal(firstTop(), 557);
    assert.deepEqual(page.scrolls, [], '還沒按就沒有捲動');

    // 第一個提醒：我的提醒從沒有變成有，下面整個往下 301，頁面往下捲 301，按鈕又在 557
    first.click();
    await page.settle();
    assert.equal(page.$('reminders').hidden, false);
    assert.deepEqual(page.scrolls, [[0, 301]]);
    assert.equal(firstTop(), 557, '按下的按鈕留在原位');
    assert.equal(secondTop(), 700, '頁面整個捲回去，別的按鈕也一樣');

    // 我的提醒已經顯示，再設一個：多一列（64）
    second.click();
    await page.settle();
    assert.equal(page.$('reminderList').children.length, 2);
    assert.deepEqual(page.scrolls, [[0, 301], [0, 64]]);
    assert.equal(secondTop(), 700);

    // 取消其中一個：少一列
    second.click();
    await page.settle();
    assert.equal(page.$('reminderList').children.length, 1);
    assert.deepEqual(page.scrolls, [[0, 301], [0, 64], [0, -64]]);
    assert.equal(secondTop(), 700);

    // 取消最後一個：我的提醒收起來，下面整個往上 301
    first.click();
    await page.settle();
    assert.equal(page.$('reminders').hidden, true);
    assert.deepEqual(page.scrolls, [[0, 301], [0, 64], [0, -64], [0, -301]]);
    assert.equal(firstTop(), 557);
    assert.deepEqual(page.consoleErrors, []);
});

test('按下的按鈕沒有被推開（Chrome 在捲動過的頁面上自己錨定了）或只差 1px 以內：不捲動，超過 1px 才補', async () => {
    // 位置不跟著我的提醒走：量前量後都是 557，設提醒與取消都不捲動，提醒照樣設好、取消
    const page = await createGatheringPage({ now: at(0, 11) });
    const button = remindBtnOf(page, CORDIA);
    button.getBoundingClientRect = () => ({ top: 557 });
    button.click();
    assert.deepEqual(rowKeys(page), [CORDIA]);
    assert.equal(page.$('reminders').hidden, false);
    button.click();
    assert.deepEqual(rowKeys(page), []);
    assert.equal(page.$('reminders').hidden, true);
    await page.settle();
    assert.deepEqual(page.scrolls, []);

    // 我的提醒顯示時按鈕偏了 moved：1px 以內（小數的進位）不動，超過才補，偏多少補多少
    for (const [moved, expected] of [[0.5, []], [1, []], [-1, []], [1.5, [[0, 1.5]]], [2, [[0, 2]]], [-2, [[0, -2]]]]) {
        const shifted = await createGatheringPage({ now: at(0, 11) });
        const target = remindBtnOf(shifted, CORDIA);
        target.getBoundingClientRect = () => ({ top: 557 + (shifted.$('reminders').hidden ? 0 : moved) });
        target.click();
        assert.deepEqual(rowKeys(shifted), [CORDIA], `按鈕偏了 ${moved}px，提醒照樣設好`);
        assert.deepEqual(shifted.scrolls, expected, `按鈕偏了 ${moved}px`);
    }
});

test('提醒列的 ✕ 不補捲動：只有卡片上的「提醒我」會（取消後焦點交給補上來的那一列，不是留在按鈕上）', async () => {
    const page = await createGatheringPage({ now: at(0, 11) });
    const button = remindBtnOf(page, CORDIA);
    const top = layOutAt(page, button, 557);
    button.click();
    await page.settle();
    assert.deepEqual(page.scrolls, [[0, 301]]);

    // 從提醒列取消最後一個：我的提醒收起來，卡片上的按鈕被往上拉了 301，沒有人把頁面捲回去
    cancelBtnOf(page, CORDIA).click();
    await page.settle();
    assert.equal(page.$('reminders').hidden, true);
    assert.deepEqual(page.scrolls, [[0, 301]], '✕ 沒有捲動');
    assert.equal(top(), 256, '按鈕確實被拉走了（要是 ✕ 也補捲動，上面就會多一筆 -301）');
    assert.deepEqual(page.consoleErrors, []);
});

test('量不到位置或不能捲動的環境（沒有 getBoundingClientRect() 或 window.scrollBy()）：提醒照樣設好，只是不補捲動', async () => {
    const page = await createGatheringPage({ now: at(0, 11) });
    // 按鈕沒有 getBoundingClientRect()
    const first = remindBtnOf(page, CORDIA);
    first.getBoundingClientRect = undefined;
    first.click();
    assert.deepEqual(rowKeys(page), [CORDIA]);
    assert.equal(first.getAttribute('aria-pressed'), 'true');

    // window 沒有 scrollBy()：按鈕量得到、也被推開了（多一列），只是沒辦法捲回去
    const second = remindBtnOf(page, OCTA);
    const secondTop = layOutAt(page, second, 700);
    const topBefore = secondTop();
    page.window.scrollBy = undefined;
    second.click();
    await page.settle();
    assert.deepEqual([...rowKeys(page)].sort(), [CORDIA, OCTA].sort());
    assert.equal(second.getAttribute('aria-pressed'), 'true');
    assert.equal(secondTop(), topBefore + REMINDER_ROW_HEIGHT, '被推開了一列，沒有補');
    assert.deepEqual(page.scrolls, []);
    assert.deepEqual(page.consoleErrors, []);
});

test('詢問被關掉（權限還是 default）：網頁提醒開著時，每按一次「提醒我」都在點擊裡再問；取消不問；到時間照樣有頁內提示和提示音', async () => {
    // ET 11:00：科迪亞樹液塊、科迪亞原木下一次都是 ET 12:00；八面體隕鐵礦石正在可採（到 ET 12:00）
    const page = await createGatheringPage({ now: at(0, 11), notification: 'dismissed' });
    remindBtnOf(page, CORDIA).click();
    await page.settle();
    assert.equal(page.permissionRequests, 1, '第一個提醒：網頁提醒順便打開，問一次');
    assert.equal(page.$('notificationToggle').checked, true);
    assert.equal(page.window.Notification.permission, 'default', '詢問被關掉：沒有允許也沒有封鎖');

    // 網頁提醒已經開著，權限還是 default：再設一個就再問（允許或封鎖了就不會再跳出詢問，見上一個測試與通知被拒的測試）
    remindBtnOf(page, 'botany_cordia_log_72').click();
    assert.equal(page.permissionRequests, 2, '在點擊裡問，不等前一次的回答');
    await page.settle();
    remindBtnOf(page, OCTA).click();
    await page.settle();
    assert.equal(page.permissionRequests, 3, '三個提醒問三次');
    assert.deepEqual([...rowKeys(page)].sort(), [CORDIA, OCTA, 'botany_cordia_log_72'].sort());

    // 取消不問：卡片上再按一次、提醒列的取消鈕
    remindBtnOf(page, OCTA).click();
    cancelBtnOf(page, 'botany_cordia_log_72').click();
    await page.settle();
    assert.equal(page.permissionRequests, 3, '取消不問');
    assert.deepEqual(rowKeys(page), [CORDIA]);

    // 到時間：頁內提示與提示音照樣有，沒有系統通知
    page.tick(at(0, 12) - MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.beeps, 2);
    assert.equal(page.notifications.length, 0);
    assert.deepEqual(page.consoleErrors, []);
});

test('全天的素材沒有提醒鈕', async () => {
    const page = await createGatheringPage();
    isSame(remindBtnOf(page, 'fishing_purple_tongue'), null, '紫色舌尖全天都能採，提醒沒有意義');
    assert.equal(page.cards().filter((card) => card.querySelector('.gx-remind-btn')).length, 33, '其他 33 種都有');
});

test('我的提醒先出現的在前，最多先列 5 個，「顯示全部 7 個」，再按收起', async () => {
    // ET 01:00：雷電石英（00:00–04:00）與科迪亞樹液塊（00:00–02:00）正在可採，剩比較久的在前；其餘照出現時間
    const now = at(0, 1);
    const order = ['mining_lightning_quartz', CORDIA, 'mining_fulgrite', 'botany_shaaloani_coffee_72', 'botany_cochineal', 'mining_rhodochrosite_72', OCTA];
    // 存的順序（加入的順序）打亂
    const added = [OCTA, CORDIA, 'botany_cochineal', 'mining_lightning_quartz', 'botany_shaaloani_coffee_72', 'mining_rhodochrosite_72', 'mining_fulgrite'];
    const page = await createGatheringPage({ now, stored: storedReminders(added, { armedAt: now - MINUTE }) });
    const M = page.window.GatheringMaterials;
    // 對照：自己用 state 與 compare 排（同卡片），都同分時照資料的順序
    const expected = Array.from(M.group(items), (material, index) => ({ key: material.key, state: M.state(material, now), index }))
        .filter((entry) => added.includes(entry.key))
        .sort((a, b) => M.compare(a.state, b.state) || a.index - b.index)
        .map((entry) => entry.key);
    assert.deepEqual(expected, order);
    assert.equal(page.$('reminderCount').textContent, '7');
    assert.deepEqual(rowKeys(page), order.slice(0, 5));

    const more = page.$('reminderMoreBtn');
    assert.equal(more.type, 'button');
    assert.equal(more.className, 'btn btn-sm btn-ghost');
    assert.equal(shown(page, 'reminderMoreBtn'), true);
    assert.equal(more.textContent, '顯示全部 7 個');
    // 「顯示全部」控制提醒列：aria-controls 指向它，aria-expanded 跟著展開或收起
    assert.equal(more.getAttribute('aria-controls'), 'reminderList');
    assert.equal(more.getAttribute('aria-expanded'), 'false', '收起時是 false');
    const firstFive = page.$('reminderList').children;
    more.focus();
    more.click();
    assert.deepEqual(rowKeys(page), order);
    assert.equal(more.textContent, '收起');
    assert.equal(more.getAttribute('aria-expanded'), 'true', '展開時是 true');
    assert.ok(firstFive.every((row, index) => row === page.$('reminderList').children[index]), '原本的 5 列還是同樣的元素');
    isSame(page.document.activeElement, more, '焦點還在按鈕上');
    more.click();
    assert.deepEqual(rowKeys(page), order.slice(0, 5));
    assert.equal(more.textContent, '顯示全部 7 個');
    assert.equal(more.getAttribute('aria-expanded'), 'false', '再按收起又是 false');

    // 剩 5 個：用不到「顯示全部」（展開著也一樣，下次超過時從收起開始）
    more.click();
    assert.equal(more.getAttribute('aria-expanded'), 'true');
    remindBtnOf(page, OCTA).click();
    remindBtnOf(page, 'mining_rhodochrosite_72').click();
    assert.equal(page.$('reminderCount').textContent, '5');
    assert.deepEqual(rowKeys(page), order.slice(0, 5));
    assert.equal(shown(page, 'reminderMoreBtn'), false);
    // 又變成 6 個：又是只列前 5 個
    remindBtnOf(page, 'mining_rhodochrosite_72').click();
    assert.deepEqual(rowKeys(page), order.slice(0, 5));
    assert.equal(shown(page, 'reminderMoreBtn'), true);
    assert.equal(more.textContent, '顯示全部 6 個');
    assert.equal(more.getAttribute('aria-expanded'), 'false', '從收起開始');
    assert.deepEqual(page.consoleErrors, []);
});

test('手機（480px 以下）我的提醒先列 3 個；視窗跨過 480px 時跟著改，展開著的不收起', async () => {
    const now = at(0, 1);
    const order = ['mining_lightning_quartz', CORDIA, 'mining_fulgrite', 'botany_shaaloani_coffee_72', 'botany_cochineal', 'mining_rhodochrosite_72', OCTA];
    const page = await createGatheringPage({ now, narrow: true, stored: storedReminders(order, { armedAt: now - MINUTE }) });
    const more = page.$('reminderMoreBtn');
    assert.deepEqual(rowKeys(page), order.slice(0, 3));
    assert.equal(more.textContent, '顯示全部 7 個');

    // 放寬：先列 5 個（原本的 3 列是同樣的元素）；再變窄又是 3 個
    const firstThree = page.$('reminderList').children;
    page.setNarrow(false);
    assert.deepEqual(rowKeys(page), order.slice(0, 5));
    assert.ok(firstThree.every((row, index) => row === page.$('reminderList').children[index]), '原本的 3 列還是同樣的元素');
    page.setNarrow(true);
    assert.deepEqual(rowKeys(page), order.slice(0, 3));

    // 展開著的：跨過 480px 也不收起
    more.click();
    assert.deepEqual(rowKeys(page), order);
    page.setNarrow(false);
    assert.deepEqual(rowKeys(page), order);
    assert.equal(more.textContent, '收起');
    page.setNarrow(true);
    assert.deepEqual(rowKeys(page), order);
    more.click();
    assert.deepEqual(rowKeys(page), order.slice(0, 3));

    // 剩 4 個：手機上還是要「顯示全部 4 個」，寬的畫面用不到
    for (const key of order.slice(4)) remindBtnOf(page, key).click();
    assert.deepEqual(rowKeys(page), order.slice(0, 3));
    assert.equal(shown(page, 'reminderMoreBtn'), true);
    assert.equal(more.textContent, '顯示全部 4 個');
    page.setNarrow(false);
    assert.deepEqual(rowKeys(page), order.slice(0, 4));
    assert.equal(shown(page, 'reminderMoreBtn'), false);
    assert.deepEqual(page.consoleErrors, []);
});

test('768px 以下提醒列的按鈕和名稱放同一行，狀態行與地點行用名稱以下的整個寬度', () => {
    const css = read('tools/timed-gathering/style.css');
    const start = css.indexOf('@media (max-width: 768px) {');
    assert.ok(start !== -1, 'style.css 要有 @media (max-width: 768px)');
    // @media 裡的規則都有縮排：到下一個在行首的 } 為止
    const block = css.slice(start, css.indexOf('\n}', start));
    const ruleIn = (selector) => {
        const found = block.match(new RegExp(`\\n\\s+${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
        assert.ok(found, `@media (max-width: 768px) 裡要有 ${selector} 的規則`);
        return found[1];
    };
    // 名稱、狀態行與地點行的外框不佔格子，三行直接排進列的 grid
    assert.match(ruleIn('.gx-r-main'), /display:\s*contents;/);
    assert.match(ruleIn('.gx-reminder-list > li'), /row-gap:\s*2px;/);
    assert.match(ruleIn('.gx-reminder > .gx-icon,\n    .gx-r-main > b,\n    .gx-r-actions'), /grid-row:\s*1;/);
    assert.match(ruleIn('.gx-r-main > .gx-status,\n    .gx-r-where'), /grid-column:\s*2\s*\/\s*-1;/);
    // 以前把按鈕排到名稱下面的規則拿掉了
    assert.doesNotMatch(block, /grid-template-columns:\s*auto minmax\(0, 1fr\);/);
    assert.doesNotMatch(block, /\.gx-r-actions\s*\{\s*grid-column:\s*2;/);
});

test('每一列：名稱、狀態每秒走、地區 · 地點　座標、取消鈕的 aria-label 有名稱；取消後焦點到下一列的取消鈕', async () => {
    // ET 12:30：科迪亞樹液塊正在可採（到 ET 14:00）；陽風岩下一次 ET 20:00；八面體隕鐵礦石下一次 ET 22:00
    const now = at(0, 12, 30);
    const SUNWIND = 'mining_sunwind_rock_70';
    const page = await createGatheringPage({ now, stored: storedReminders([OCTA, CORDIA, SUNWIND], { armedAt: now - MINUTE }) });
    const M = page.window.GatheringMaterials;
    assert.equal(page.$('reminderList').tagName, 'UL');
    assert.deepEqual(rowKeys(page), [CORDIA, SUNWIND, OCTA]);

    const row = rowOf(page, CORDIA);
    assert.equal(row.tagName, 'LI');
    assert.equal(row.className, 'gx-reminder');
    const icon = row.querySelector('.gx-icon');
    assert.equal(icon.textContent, '🌿');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(textOf(row, '.gx-r-main > b'), '科迪亞樹液塊');
    const status = row.querySelector('.gx-r-main > .gx-status');
    const upNow = () => `現在可採 · 還剩 ${M.countdown(at(0, 14) - page.now)}（到 ${M.localTime(at(0, 14))}）`;
    assert.equal(status.textContent, upNow());
    assert.ok(status.classList.contains('now'));
    assert.equal(textOf(row, '.gx-r-main > .gx-r-where'), CORDIA_PLACE);
    const cancel = row.querySelector('.gx-r-actions > button.gx-cancel-btn');
    assert.equal(cancel.type, 'button');
    // 只有 ✕ 的按鈕用共用的 .btn-icon-only（正方形），名稱那一行多一點寬度
    assert.equal(cancel.className, 'btn btn-sm btn-ghost btn-icon-only gx-cancel-btn');
    assert.equal(cancel.textContent, '✕');
    assert.equal(cancel.getAttribute('aria-label'), '取消提醒：科迪亞樹液塊');
    // 還沒出現的：狀態行同卡片
    assert.equal(textOf(rowOf(page, OCTA), '.gx-status'), textOf(page.cardOf(OCTA), '.gx-status'));
    assert.ok(!rowOf(page, OCTA).querySelector('.gx-status').classList.contains('now'));
    assert.equal(textOf(rowOf(page, SUNWIND), '.gx-r-where'), '永生記憶 · 雷諾德之風　X:10.4, Y:11.0');
    assert.equal(page.$('reminders').querySelectorAll('.btn-primary').length, 0, '我的提醒裡沒有 .btn-primary');

    // 每秒只換狀態行的文字，列與狀態行都是同一個元素
    for (let second = 1; second <= 3; second += 1) {
        const written = status.textContent;
        page.tick(1000);
        assert.notEqual(status.textContent, written, `第 ${second} 秒倒數變了`);
        assert.equal(status.textContent, upNow());
    }
    isSame(rowOf(page, CORDIA), row, '還是同一列');
    isSame(row.querySelector('.gx-status'), status, '還是同一個狀態行');

    // 取消第一列：焦點交給補上這個位置的列（陽風岩）的取消鈕
    cancel.focus();
    cancel.click();
    assert.deepEqual(rowKeys(page), [SUNWIND, OCTA]);
    assert.equal(page.$('reminderCount').textContent, '2');
    assert.deepEqual(page.toasts.at(-1), { message: '已取消提醒：科迪亞樹液塊', type: 'info' });
    assert.equal(remindBtnOf(page, CORDIA).getAttribute('aria-pressed'), 'false', '卡片上的提醒鈕跟著變');
    assert.deepEqual(savedReminders(page).entries.map((entry) => entry.key), [OCTA, SUNWIND]);
    isSame(page.document.activeElement, cancelBtnOf(page, SUNWIND), '焦點到下一列的取消鈕');
    // 取消最後一列：沒有下一列，焦點到上一列
    cancelBtnOf(page, OCTA).focus();
    cancelBtnOf(page, OCTA).click();
    assert.deepEqual(rowKeys(page), [SUNWIND]);
    isSame(page.document.activeElement, cancelBtnOf(page, SUNWIND), '沒有下一列時到上一列');
    // 取消剩下的一個：我的提醒收起，焦點到搜尋框
    cancelBtnOf(page, SUNWIND).click();
    assert.deepEqual(rowKeys(page), []);
    assert.equal(shown(page, 'reminders'), false);
    isSame(page.document.activeElement, page.$('searchInput'), '沒有列了就到搜尋框');
    assert.deepEqual(savedReminders(page).entries, []);
    assert.deepEqual(page.consoleErrors, []);
});

test('到時間：頁內提示、提示音，允許時加系統通知；同一次只響一次；提早 0 分時寫出現了', async () => {
    // ET 11:00：科迪亞樹液塊下一次是 ET 12:00（175 秒後）；預設出現前 1 分鐘通知
    const page = await createGatheringPage({ now: at(0, 11), notification: 'granted' });
    const M = page.window.GatheringMaterials;
    remindBtnOf(page, CORDIA).click();
    await page.settle();
    const start = at(0, 12);
    const fireAt = start - MINUTE;
    const body = `${M.localTime(start)} 開始，到 ${M.localTime(at(0, 14))}（ET 12:00–14:00）· ${CORDIA_PLACE}`;

    page.tick(fireAt - 1000 - page.now);
    assert.equal(alertsOn(page).length, 0, '還沒到');
    page.tick(1000);
    const alerts = alertsOn(page);
    assert.equal(alerts.length, 1);
    assert.ok(alerts[0].textContent.startsWith('科迪亞樹液塊 1 分鐘後出現\n'));
    assert.equal(alerts[0].textContent, `科迪亞樹液塊 1 分鐘後出現\n${body}`);
    assert.equal(page.beeps, 2);
    assert.deepEqual(clone(page.notifications), [{ title: '科迪亞樹液塊 1 分鐘後出現', body, tag: `gathering:${CORDIA}|${start}` }]);
    // 記在 localStorage（這一次自己的項目）：重新整理、另一個分頁都不會再響這一次
    assert.deepEqual(
        Array.from(page.storage).filter(([name]) => name.startsWith(`${NOTIFIED_KEY}|`)),
        [[`${NOTIFIED_KEY}|gathering:${CORDIA}|${start}`, String(start)]]
    );

    page.tick(1000);
    assert.equal(alertsOn(page).length, 1, '下一秒不重複');
    assert.equal(page.beeps, 2);
    assert.equal(page.notifications.length, 1);
    assert.deepEqual(rowKeys(page), [CORDIA], '提醒照樣在（一直提醒到取消）');

    // 用選單改成出現時：下一段（隔天 ET 00:00）在開始的那一刻響，標題寫出現了
    setLead(page, 0);
    const next = at(1, 0);
    page.tick(next - 1000 - page.now);
    assert.equal(alertsOn(page).length, 1, '開始前不響');
    page.tick(1000);
    assert.equal(alertsOn(page).length, 2);
    assert.ok(alertsOn(page)[1].textContent.startsWith('科迪亞樹液塊出現了\n'));
    assert.equal(page.notifications[1].title, '科迪亞樹液塊出現了');
    assert.equal(page.notifications[1].body, `${M.localTime(next)} 開始，到 ${M.localTime(at(1, 2))}（ET 00:00–02:00）· ${CORDIA_PLACE}`);
    assert.equal(page.beeps, 4);
    assert.deepEqual(page.consoleErrors, []);
});

test('背景分頁晚到（電腦睡著）：那一段結束前補一次，標題寫實際還剩幾分鐘，已經開始就寫出現了；整段都過了就不補', async () => {
    // 出現前 5 分鐘通知，ET 10:00 設的；科迪亞樹液塊下一次是 ET 12:00（約 5 分 50 秒後）
    const now = at(0, 10);
    const page = await createGatheringPage({ now, notification: 'granted', stored: storedReminders([CORDIA], { lead: 5, armedAt: now }) });
    // 睡過提早 5 分鐘的那一刻，開始前 2 分鐘才醒來：補一次，寫 2 分鐘後
    page.tick(at(0, 12) - 2 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.notifications[0].title, '科迪亞樹液塊 2 分鐘後出現');
    assert.ok(alertsOn(page)[0].textContent.startsWith('科迪亞樹液塊 2 分鐘後出現\n'));
    // 醒來後提醒列的倒數直接是現在的（同卡片）
    assert.equal(textOf(rowOf(page, CORDIA), '.gx-status'), textOf(page.cardOf(CORDIA), '.gx-status'));

    // 下一段（隔天 ET 00:00）開始以後、結束以前才醒來：寫出現了
    page.tick(at(1, 0) + MINUTE - page.now);
    assert.equal(alertsOn(page).length, 2);
    assert.equal(page.notifications[1].title, '科迪亞樹液塊出現了');
    assert.ok(alertsOn(page)[1].textContent.startsWith('科迪亞樹液塊出現了\n'));
    assert.ok(rowOf(page, CORDIA).querySelector('.gx-status').classList.contains('now'));

    // 隔天 ET 12:00 那一段整段都睡過去：不補
    page.tick(at(1, 14) + 1000 - page.now);
    assert.equal(alertsOn(page).length, 2, '整段都過了就不補');
    assert.equal(page.notifications.length, 2);
    // 再下一段照常提早 5 分鐘
    page.tick(at(2, 0) - 5 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 3);
    assert.equal(page.notifications[2].title, '科迪亞樹液塊 5 分鐘後出現');
    assert.deepEqual(page.consoleErrors, []);
});

test('網頁提醒關掉時到時間什麼都不做；在時段裡才打開，正在進行的那一次不補，下一段照常', async () => {
    const page = await createGatheringPage({ now: at(0, 10), notification: 'granted' });
    remindBtnOf(page, CORDIA).click();
    await page.settle();
    assert.equal(page.$('notificationToggle').checked, true);

    // 關掉：存起來；提醒清單、卡片上的按鈕與倒數照樣留著
    setToggle(page, false);
    assert.equal(savedReminders(page).enabled, false);
    assert.deepEqual(rowKeys(page), [CORDIA]);
    assert.equal(remindBtnOf(page, CORDIA).getAttribute('aria-pressed'), 'true');
    page.tick(at(0, 12) - MINUTE - page.now);
    page.tick(2 * MINUTE);
    assert.equal(alertsOn(page).length, 0, '關著：不提示');
    assert.equal(page.beeps, 0, '關著：不出聲');
    assert.equal(page.notifications.length, 0, '關著：不跳通知');
    assert.ok(rowOf(page, CORDIA).querySelector('.gx-status').classList.contains('now'), '倒數照樣走');

    // 在時段裡打開：正在進行的這一次不補
    setToggle(page, true);
    await page.settle();
    assert.equal(savedReminders(page).enabled, true);
    assert.equal(savedReminders(page).enabledAt, page.now);
    page.tick(at(0, 14) - 1000 - page.now);
    assert.equal(alertsOn(page).length, 0, '正在進行的那一次不補');
    // 下一段照常提早 1 分鐘
    page.tick(at(1, 0) - MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.notifications[0].title, '科迪亞樹液塊 1 分鐘後出現');
    assert.equal(page.permissionRequests, 0, '已經允許了，打開開關也不再問');
    assert.deepEqual(page.consoleErrors, []);
});

test('提醒列切換時重排；焦點在提醒列裡時延後，焦點離開才排，按鈕還是同一個元素', async () => {
    // ET 12:00 前 1 秒：八面體隕鐵礦石還能採（到 12:00），科迪亞樹液塊 1 秒後出現
    const now = at(0, 12) - 1000;
    const page = await createGatheringPage({ now, stored: storedReminders([CORDIA, OCTA], { armedAt: now - MINUTE }) });
    assert.deepEqual(rowKeys(page), [OCTA, CORDIA]);
    const rows = page.$('reminderList').children;
    const button = cancelBtnOf(page, OCTA);
    button.focus();

    page.tick(1000);
    // 倒數與標示照樣更新、到時間的提示照樣有（提示之後重畫我的提醒），只是順序先不動，焦點也不動
    assert.ok(rowOf(page, CORDIA).querySelector('.gx-status').classList.contains('now'));
    assert.ok(!rowOf(page, OCTA).querySelector('.gx-status').classList.contains('now'));
    assert.equal(alertsOn(page).length, 1);
    assert.deepEqual(rowKeys(page), [OCTA, CORDIA], '焦點在提醒列裡：先不排');
    isSame(page.document.activeElement, button, '焦點還在按鈕上');
    // 焦點在提醒列裡移動：還在裡面，先不排；沒有切換的下一秒也不排
    const other = cancelBtnOf(page, CORDIA);
    other.focus();
    assert.deepEqual(rowKeys(page), [OCTA, CORDIA]);
    page.tick(1000);
    assert.deepEqual(rowKeys(page), [OCTA, CORDIA]);
    isSame(page.document.activeElement, other);

    // 焦點離開提醒列：照現在的時間排
    page.$('searchInput').focus();
    assert.deepEqual(rowKeys(page), [CORDIA, OCTA]);
    isSame(page.document.activeElement, page.$('searchInput'), '焦點在搜尋框，沒被搶走');
    assert.ok(page.$('reminderList').children.every((row) => rows.includes(row)), '搬動的是原本的列');
    isSame(cancelBtnOf(page, OCTA), button, '還是同一顆按鈕');

    // 焦點不在提醒列裡：切換時馬上排（ET 14:00 科迪亞樹液塊結束，下一次是隔天 ET 00:00，排到 ET 22:00 的八面體後面）
    page.tick(at(0, 14) - page.now);
    assert.deepEqual(rowKeys(page), [OCTA, CORDIA]);
    assert.ok(page.$('reminderList').children.every((row) => rows.includes(row)), '搬動的是原本的列');
    assert.deepEqual(page.consoleErrors, []);
});

test('通知被拒或不支援：開關照樣能用，下方寫說明（含「或改用遊戲鬧鐘」）；Android 的 Chrome 丟錯後改寫不支援', async () => {
    const denied = await createGatheringPage({ now: at(0, 11), notification: 'denied' });
    assert.equal(shown(denied, 'notifyStatus'), false, '還沒有提醒');
    remindBtnOf(denied, CORDIA).click();
    await denied.settle();
    assert.equal(denied.permissionRequests, 0, '被拒了就不再問');
    const toggle = denied.$('notificationToggle');
    assert.equal(toggle.checked, true, '網頁提醒照樣打開');
    assert.ok(!toggle.disabled && !toggle.hasAttribute('disabled'), '開關不停用');
    assert.equal(shown(denied, 'notifyStatus'), true);
    assert.equal(denied.$('notifyStatus').className, 'warning-message');
    assert.equal(denied.$('notifyStatus').textContent, DENIED_TEXT);
    assert.ok(denied.$('notifyStatus').textContent.includes('或改用遊戲鬧鐘'));
    // 開關照樣能關、能開
    setToggle(denied, false);
    assert.equal(savedReminders(denied).enabled, false);
    setToggle(denied, true);
    await denied.settle();
    assert.equal(savedReminders(denied).enabled, true);
    // 到時間：頁內提示與提示音照樣有，沒有系統通知
    denied.tick(at(0, 12) - MINUTE - denied.now);
    assert.equal(alertsOn(denied).length, 1);
    assert.equal(denied.beeps, 2);
    assert.equal(denied.notifications.length, 0);
    assert.equal(denied.$('notifyStatus').textContent, DENIED_TEXT);

    // 允許了但跳不出來（Android 的 Chrome）：設好時看不出來；第一次到時間跳不出來之後改寫不支援
    const android = await createGatheringPage({ now: at(0, 11), notification: 'throws' });
    remindBtnOf(android, CORDIA).click();
    await android.settle();
    assert.equal(shown(android, 'notifyStatus'), false, '還沒試過跳通知');
    android.tick(at(0, 12) - MINUTE - android.now);
    assert.equal(alertsOn(android).length, 1);
    assert.equal(android.beeps, 2);
    assert.equal(android.notifications.length, 0);
    assert.equal(shown(android, 'notifyStatus'), true, '第一次跳不出來之後');
    assert.equal(android.$('notifyStatus').textContent, UNSUPPORTED_TEXT);
    assert.deepEqual(android.consoleErrors, []);
});

test('改提早分鐘數：存起來，下一段照新的提早分鐘數提醒', async () => {
    const now = at(0, 10);
    const page = await createGatheringPage({ now, notification: 'granted', stored: storedReminders([CORDIA], { armedAt: now }) });
    const select = page.$('leadSelect');
    isSame(select.parentNode, page.document.querySelector('#remindersHead > label.gx-lead'), '選單包在 label 裡');
    assert.equal(textOf(page.document, 'label.gx-lead > span'), '通知時間');
    assert.equal(select.className, 'form-control form-control-sm');
    assert.deepEqual(select.children.map((option) => option.getAttribute('value')), ['0', '1', '2', '3', '5', '10']);
    assert.deepEqual(select.children.map((option) => option.textContent), ['出現時', '出現前 1 分鐘', '出現前 2 分鐘', '出現前 3 分鐘', '出現前 5 分鐘', '出現前 10 分鐘']);
    assert.equal(select.value, '1', '預設出現前 1 分鐘');

    setLead(page, 5);
    assert.equal(savedReminders(page).leadMinutes, 5);
    assert.equal(select.value, '5');
    page.tick(at(0, 12) - 5 * MINUTE - 1000 - page.now);
    assert.equal(alertsOn(page).length, 0);
    page.tick(1000);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.notifications[0].title, '科迪亞樹液塊 5 分鐘後出現');

    // 重新整理之後照樣是 5 分鐘
    const reloaded = await createGatheringPage({ now: page.now, stored: Object.fromEntries(page.storage) });
    assert.equal(reloaded.$('leadSelect').value, '5');
    assert.deepEqual(page.consoleErrors, []);
});

test('另一個分頁新增或取消：這個分頁的我的提醒與卡片按鈕跟著變', async () => {
    const page = await createGatheringPage({ now: at(0, 10), notification: 'granted' });
    assert.equal(shown(page, 'reminders'), false);
    // 另一個分頁設了科迪亞樹液塊（出現前 3 分鐘）
    page.storage.set(KEY, JSON.stringify({ enabled: true, enabledAt: page.now, leadMinutes: 3, entries: [{ key: CORDIA, armedAt: page.now }] }));
    page.storageEvent('ff14tw_weather_selection');
    assert.equal(shown(page, 'reminders'), false, '別的 key：不理');
    page.storageEvent(KEY);
    assert.equal(shown(page, 'reminders'), true);
    assert.deepEqual(rowKeys(page), [CORDIA]);
    assert.equal(remindBtnOf(page, CORDIA).getAttribute('aria-pressed'), 'true');
    assert.equal(remindBtnOf(page, CORDIA).textContent, '🔔 已設提醒');
    assert.equal(page.$('notificationToggle').checked, true);
    assert.equal(page.$('leadSelect').value, '3');

    // 另一個分頁取消：這裡跟著收起，也不再提醒
    page.storage.set(KEY, JSON.stringify({ enabled: true, enabledAt: page.now, leadMinutes: 3, entries: [] }));
    page.storageEvent(KEY);
    assert.deepEqual(rowKeys(page), []);
    assert.equal(shown(page, 'reminders'), false);
    assert.equal(remindBtnOf(page, CORDIA).getAttribute('aria-pressed'), 'false');
    assert.equal(remindBtnOf(page, CORDIA).textContent, '🔔 提醒我');
    page.tick(at(0, 12) - 3 * MINUTE - page.now);
    page.tick(at(0, 12) - page.now);
    assert.equal(alertsOn(page).length, 0, '取消的不再提醒');

    // 另一個分頁清掉這個網站的資料（storage 事件的 key 是 null）：這裡的提醒也跟著清掉
    remindBtnOf(page, CORDIA).click();
    assert.deepEqual(rowKeys(page), [CORDIA]);
    page.storage.clear();
    page.storageEvent(null);
    assert.deepEqual(rowKeys(page), []);
    assert.equal(remindBtnOf(page, CORDIA).getAttribute('aria-pressed'), 'false');
    assert.equal(page.$('notificationToggle').checked, false);
    assert.deepEqual(page.consoleErrors, []);
});

test('另一個分頁剛存、這裡還沒收到 storage 事件就改：不蓋掉另一個分頁的，我的提醒與卡片按鈕跟著變', async () => {
    // ET 12:30：科迪亞樹液塊正在可採；陽風岩下一次 ET 20:00；八面體隕鐵礦石下一次 ET 22:00
    const now = at(0, 12, 30);
    const SUNWIND = 'mining_sunwind_rock_70';
    const page = await createGatheringPage({ now, notification: 'granted', stored: storedReminders([CORDIA], { armedAt: now - MINUTE }) });
    const savedKeys = () => savedReminders(page).entries.map((entry) => entry.key);
    // 另一個分頁設了八面體隕鐵礦石：只改 localStorage，不派送 storage 事件（這裡還沒收到）
    page.storage.set(KEY, storedReminders([CORDIA, OCTA], { armedAt: now - MINUTE })[KEY]);
    remindBtnOf(page, SUNWIND).click();
    await page.settle();
    assert.deepEqual(savedKeys(), [CORDIA, OCTA, SUNWIND], '提醒我沒有蓋掉另一個分頁設的');
    assert.deepEqual(rowKeys(page), [CORDIA, SUNWIND, OCTA]);
    assert.equal(remindBtnOf(page, OCTA).textContent, '🔔 已設提醒');

    // 另一個分頁取消了科迪亞樹液塊，這裡改提早分鐘數：取消的不會被帶回來，卡片的按鈕也跟著變
    page.storage.set(KEY, storedReminders([OCTA, SUNWIND], { armedAt: now - MINUTE })[KEY]);
    setLead(page, 5);
    assert.deepEqual(savedKeys(), [OCTA, SUNWIND]);
    assert.equal(savedReminders(page).leadMinutes, 5);
    assert.deepEqual(rowKeys(page), [SUNWIND, OCTA]);
    assert.equal(remindBtnOf(page, CORDIA).textContent, '🔔 提醒我');
    assert.equal(remindBtnOf(page, CORDIA).getAttribute('aria-pressed'), 'false');

    // 開關也一樣：另一個分頁又設了科迪亞樹液塊，這裡關掉網頁提醒
    page.storage.set(KEY, storedReminders([OCTA, SUNWIND, CORDIA], { lead: 5, armedAt: now - MINUTE })[KEY]);
    setToggle(page, false);
    assert.deepEqual(savedKeys(), [OCTA, SUNWIND, CORDIA]);
    assert.equal(savedReminders(page).enabled, false);
    assert.equal(savedReminders(page).leadMinutes, 5);
    assert.deepEqual(rowKeys(page), [CORDIA, SUNWIND, OCTA]);
    assert.equal(remindBtnOf(page, CORDIA).textContent, '🔔 已設提醒');
    assert.deepEqual(page.consoleErrors, []);
});

test('瀏覽器封鎖網站資料：這次打開期間照樣能設提醒、會響', async () => {
    const page = await createGatheringPage({ now: at(0, 11), storageThrows: true, notification: 'granted' });
    remindBtnOf(page, CORDIA).click();
    await page.settle();
    assert.deepEqual(rowKeys(page), [CORDIA]);
    assert.equal(page.$('notificationToggle').checked, true);
    assert.equal(remindBtnOf(page, CORDIA).getAttribute('aria-pressed'), 'true');
    setLead(page, 2);
    assert.equal(page.$('leadSelect').value, '2');

    page.tick(at(0, 12) - 2 * MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.notifications[0].title, '科迪亞樹液塊 2 分鐘後出現');
    page.tick(1000);
    assert.equal(alertsOn(page).length, 1, '記不住已提醒，這個頁面照樣只響一次');
    // 記下來的只有讀不到 localStorage 的那幾筆（ListManager 的）
    assert.ok(page.consoleErrors.every((entry) => entry.includes('SecurityError')), page.consoleErrors.join('\n'));
});

test('舊使用者：以前開著採集提醒，打開就看到預設清單的素材在我的提醒裡、網頁提醒開著', async () => {
    const record = (id) => items.find((item) => item.id === id);
    const stored = {
        [LEGACY_KEY]: JSON.stringify({ enabled: true }),
        ...storedLists([record('botany_cordia_resin_1'), record('mining_octahedrite_72_1'), record('fishing_purple_tongue')])
    };
    const now = at(0, 11);
    const page = await createGatheringPage({ now, notification: 'granted', stored });
    // ET 11:00：八面體隕鐵礦石正在可採（到 12:00）排第一；全天的紫色舌尖不帶過來
    assert.equal(shown(page, 'reminders'), true);
    assert.deepEqual(rowKeys(page), [OCTA, CORDIA]);
    assert.equal(page.$('notificationToggle').checked, true);
    for (const key of [OCTA, CORDIA]) assert.equal(remindBtnOf(page, key).getAttribute('aria-pressed'), 'true', key);
    assert.deepEqual(savedReminders(page), { enabled: true, enabledAt: now, leadMinutes: 1, entries: [{ key: CORDIA, armedAt: now }, { key: OCTA, armedAt: now }] });
    assert.equal(page.storage.get(LEGACY_KEY), stored[LEGACY_KEY], '舊的開關不動');
    assert.equal(page.storage.get('ff14tw_timed_gathering_lists'), stored.ff14tw_timed_gathering_lists, '清單不動');

    // 網頁提醒開著：到時間就提醒
    page.tick(at(0, 12) - MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.notifications[0].title, '科迪亞樹液塊 1 分鐘後出現');
    assert.equal(page.permissionRequests, 0, '沒有點擊就不問權限');
    assert.deepEqual(page.consoleErrors, []);
});

test('重新整理後還原的提醒：頁面上的點擊或按鍵就解開提示音；網頁提醒關著或沒有提醒時不解開', async () => {
    const now = at(0, 11);
    const page = await createGatheringPage({ now, stored: storedReminders([CORDIA], { armedAt: now - MINUTE }) });
    const scheduler = page.window.ReminderScheduler;
    const unlock = scheduler.unlockSound;
    let unlocks = 0;
    scheduler.unlockSound = function () {
        unlocks += 1;
        return unlock.call(this);
    };
    // 瀏覽器只讓使用者操作時建立或 resume 的 AudioContext 出聲：沒按過「提醒我」，頁面上的操作都去解開一次
    const press = (target) => {
        for (const type of ['pointerdown', 'pointerup', 'keydown']) target.dispatchEvent(new page.window.Event(type, { bubbles: true }));
    };
    for (const type of ['pointerdown', 'pointerup', 'keydown']) {
        const before = unlocks;
        page.$('itemsContainer').dispatchEvent(new page.window.Event(type, { bubbles: true }));
        assert.equal(unlocks, before + 1, type);
    }
    page.tick(at(0, 12) - MINUTE - page.now);
    assert.equal(alertsOn(page).length, 1);
    assert.equal(page.beeps, 2);
    assert.equal(page.permissionRequests, 0, '沒有點擊就不問權限');

    // 網頁提醒關著：到時間什麼都不做，也就不用解開
    setToggle(page, false);
    const off = unlocks;
    press(page.$('itemsContainer'));
    assert.equal(unlocks, off);

    // 沒有提醒的頁面：不解開、不替每個訪客建立 AudioContext；「提醒我」在點擊裡自己解開
    const empty = await createGatheringPage({ now });
    const BaseAudioContext = empty.window.AudioContext;
    let contexts = 0;
    empty.window.AudioContext = class extends BaseAudioContext {
        constructor() {
            super();
            contexts += 1;
        }
    };
    for (const type of ['pointerdown', 'pointerup', 'keydown']) empty.$('itemsContainer').dispatchEvent(new empty.window.Event(type, { bubbles: true }));
    assert.equal(contexts, 0, '沒有提醒：不建立 AudioContext');
    remindBtnOf(empty, CORDIA).click();
    assert.equal(contexts, 1);
});

test('測試通知：頁內提示與提示音，允許時加系統通知', async () => {
    for (const [mode, system] of [['granted', 1], ['default', 0], ['denied', 0], ['unsupported', 0]]) {
        const page = await createGatheringPage({ now: at(0, 11), notification: mode, stored: storedReminders([CORDIA], { armedAt: at(0, 11) }) });
        const button = page.$('testNotificationBtn');
        assert.ok(page.$('remindersHead').contains(button), '測試鈕在我的提醒的標題列');
        assert.equal(button.getAttribute('title'), '測試通知');
        assert.equal(button.className, 'btn btn-sm btn-ghost');
        assert.equal(button.type, 'button');
        button.click();
        const alerts = alertsOn(page);
        assert.equal(alerts.length, 1, mode);
        assert.equal(alerts[0].textContent, 'FF14 採集提醒\n這是一個測試通知，請確認您是否看到了');
        assert.equal(page.beeps, 2, `${mode}：提示音`);
        assert.equal(page.notifications.length, system, `${mode}：系統通知`);
        if (system) {
            assert.deepEqual(clone(page.notifications), [{ title: 'FF14 採集提醒', body: '這是一個測試通知，請確認您是否看到了', tag: 'ff14tw-gathering-test' }]);
        }
        assert.equal(page.permissionRequests, 0, `${mode}：測試不問權限`);
    }
});

test('切換語言：提醒列、選項、按鈕換字；之後的通知用新語言', async () => {
    // ET 11:00：科迪亞樹液塊下一次 ET 12:00、菖蒲根下一次 ET 16:00
    const now = at(0, 11);
    const IRIS = 'botany_iris_root';
    const page = await createGatheringPage({ now, notification: 'denied', stored: storedReminders([CORDIA, IRIS], { armedAt: now }) });
    const M = page.window.GatheringMaterials;
    const select = page.$('leadSelect');
    const rows = page.$('reminderList').children;
    assert.deepEqual(rowKeys(page), [CORDIA, IRIS]);

    page.setLang('en');
    const row = rowOf(page, CORDIA);
    isSame(row, rows[0], '換語言不重建列');
    assert.equal(textOf(row, '.gx-r-main > b'), 'Cordia Resin');
    assert.equal(textOf(row, '.gx-r-where'), "Yak T'el · Mamook　X:35.7, Y:22.3");
    assert.equal(textOf(row, '.gx-status'), `Appears at ${M.localTime(at(0, 12))} · in ${M.countdown(at(0, 12) - page.now)}`);
    assert.equal(cancelBtnOf(page, CORDIA).getAttribute('aria-label'), 'Cancel reminder: Cordia Resin');
    assert.deepEqual(select.children.map((option) => option.textContent), ['When it appears', '1 min before', '2 min before', '3 min before', '5 min before', '10 min before']);
    assert.equal(select.value, '1', '換語言不改選取');
    assert.equal(remindBtnOf(page, CORDIA).textContent, '🔔 Reminder on');
    assert.equal(remindBtnOf(page, 'botany_cordia_log_72').textContent, '🔔 Remind me');
    assert.equal(textOf(page.$('remindersTitle'), 'span'), 'My reminders');
    assert.equal(page.$('notifyStatus').textContent, "Your browser blocks notifications from this site, so you'll only get an on-page alert and a sound. You can allow them in the site settings next to the address bar, or use the in-game alarm.");
    // 之後的通知用英文
    page.tick(at(0, 12) - MINUTE - page.now);
    const body = `${M.localTime(at(0, 12))}–${M.localTime(at(0, 14))} (ET 12:00–14:00) · Yak T'el · Mamook　X:35.7, Y:22.3`;
    assert.equal(alertsOn(page)[0].textContent, `Cordia Resin appears in 1 min\n${body}`);
    // 設好、取消的提示也是英文
    remindBtnOf(page, CORDIA).click();
    assert.deepEqual(page.toasts.at(-1), { message: 'Reminder cancelled: Cordia Resin', type: 'info' });
    remindBtnOf(page, CORDIA).click();
    assert.deepEqual(page.toasts.at(-1), { message: 'Reminder set: Cordia Resin', type: 'success' });

    page.setLang('ja');
    assert.equal(textOf(rowOf(page, CORDIA), '.gx-r-main > b'), 'コーディア樹液塊');
    assert.equal(textOf(rowOf(page, CORDIA), '.gx-r-where'), 'ヤクテル樹海 · マムーク　X:35.7, Y:22.3');
    assert.equal(cancelBtnOf(page, CORDIA).getAttribute('aria-label'), '通知を取り消す：コーディア樹液塊');
    assert.deepEqual(select.children.map((option) => option.textContent), ['出現時', '1分前', '2分前', '3分前', '5分前', '10分前']);
    assert.equal(remindBtnOf(page, CORDIA).textContent, '🔔 通知中');
    assert.equal(remindBtnOf(page, 'botany_cordia_log_72').textContent, '🔔 通知する');
    assert.equal(page.$('notifyStatus').textContent, 'このサイトの通知はブラウザでブロックされています。時間になるとページ上の表示と音でお知らせします。アドレスバー左のサイト設定から許可するか、ゲーム内アラームを使ってください。');
    // 隔天 ET 00:00 那一次用日文（菖蒲根的 ET 16:00 那一段整段睡過去，不補）
    page.tick(at(1, 0) - MINUTE - page.now);
    assert.equal(alertsOn(page).length, 2);
    const jaBody = `${M.localTime(at(1, 0))}開始、${M.localTime(at(1, 2))}まで（ET 00:00–02:00）・ヤクテル樹海 · マムーク　X:35.7, Y:22.3`;
    assert.equal(alertsOn(page)[1].textContent, `コーディア樹液塊が1分後に出現\n${jaBody}`);
    assert.deepEqual(page.consoleErrors, []);
});

test('採集物資料載入失敗：我的提醒不出現，也不動存著的提醒與舊的採集提醒（下次載入成功時照樣遷移）', async () => {
    const legacy = JSON.stringify({ enabled: true });
    const stored = { [LEGACY_KEY]: legacy, ...storedLists([items[0]]) };
    // 以前開著採集提醒、還沒遷移的人：資料（items 不是陣列）載入失敗
    const fresh = await createGatheringPage({ items: null, stored });
    assert.equal(fresh.storage.has(KEY), false, '沒有遷移成空的我的提醒');
    assert.equal(fresh.storage.get(LEGACY_KEY), legacy, '舊的開關不動');
    assert.equal(shown(fresh, 'reminders'), false);
    isSame(fresh.$('clockLine').parentNode, fresh.$('clockSlot'));
    assert.equal(fresh.$('errorMessage').textContent, '載入採集物資料失敗，請重新整理頁面再試');
    assert.equal(fresh.consoleErrors.length, 1, fresh.consoleErrors.join('\n'));
    assert.ok(fresh.consoleErrors[0].startsWith('載入資料失敗:'), fresh.consoleErrors[0]);
    // 計時器、另一個分頁的 storage 事件、頁面上的按鍵都照樣不出錯，也不寫任何提醒
    fresh.tick(1000);
    fresh.storageEvent(KEY);
    fresh.storageEvent(null);
    fresh.$('searchInput').dispatchEvent(new fresh.window.Event('keydown', { bubbles: true }));
    assert.equal(fresh.storage.has(KEY), false);
    assert.equal(fresh.consoleErrors.length, 1, fresh.consoleErrors.join('\n'));

    // 已經有提醒的人：存著的原封不動，到時間也不提醒、不記已提醒
    const reminders = storedReminders([CORDIA], { armedAt: T - MINUTE });
    const kept = await createGatheringPage({ items: null, stored: { ...reminders, [LEGACY_KEY]: legacy } });
    kept.tick(at(1, 0) - kept.now);
    kept.tick(at(1, 12) - kept.now);
    assert.equal(kept.storage.get(KEY), reminders[KEY]);
    assert.ok(![...kept.storage.keys()].some((name) => name.startsWith(`${NOTIFIED_KEY}|`)), '沒有已提醒的紀錄');
    assert.equal(alertsOn(kept).length, 0);
    assert.equal(shown(kept, 'reminders'), false);
    assert.equal(kept.consoleErrors.length, 1, kept.consoleErrors.join('\n'));

    // 之後資料載入成功：照樣遷移
    const later = await createGatheringPage({ stored: Object.fromEntries(fresh.storage) });
    assert.deepEqual(rowKeys(later), [CORDIA]);
    assert.equal(savedReminders(later).enabled, true);
});

test('index.html：三張時鐘卡拿掉、用語是艾歐澤亞；腳本順序；不再載入 notification-manager.js', async () => {
    const html = read('tools/timed-gathering/index.html');
    assert.ok(!html.includes('time-display-container'));
    for (const id of ['localTimeDisplay', 'eorzeaTimeDisplay', 'etPeriod', 'notificationStatus']) assert.ok(!html.includes(`id="${id}"`), `#${id} 要拿掉`);
    for (const file of ['tools/timed-gathering/index.html', TRANSLATIONS, ...fs.readdirSync(path.join(__dirname, '../tools/timed-gathering')).map((name) => `tools/timed-gathering/${name}`)]) {
        assert.ok(!read(file).includes('艾歐爾傑亞'), `${file} 要寫艾歐澤亞`);
    }
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    const position = (src) => {
        assert.ok(scripts.includes(src), `index.html 要載入 ${src}`);
        return scripts.indexOf(src);
    };
    assert.ok(position('../../assets/js/security-utils.js') < position('../../assets/js/reminder-scheduler.js'));
    assert.ok(position('../../assets/js/reminder-scheduler.js') < position('time-calculator.js'), '共用的提醒排程在工具自己的腳本之前');
    assert.equal(position('gathering-materials.js'), position('time-calculator.js') + 1);
    assert.equal(position('gathering-reminders.js'), position('gathering-materials.js') + 1);
    assert.ok(position('gathering-reminders.js') < position('script.js'));
    assert.ok(!scripts.includes('notification-manager.js'), '不再載入 notification-manager.js');
    assert.equal(fs.existsSync(path.join(__dirname, '../tools/timed-gathering/notification-manager.js')), false, 'notification-manager.js 刪掉了');

    // 我的提醒與時鐘一行的標記
    const page = await createGatheringPage();
    const section = page.$('reminders');
    assert.equal(section.tagName, 'SECTION');
    assert.equal(section.className, 'card gx-reminders');
    assert.equal(section.getAttribute('aria-labelledby'), 'remindersTitle');
    assert.ok(section.hasAttribute('hidden'));
    assert.deepEqual(section.children.map((child) => child.id || child.className), ['remindersHead', 'reminderList', 'reminderMoreBtn', 'gx-note', 'notifyStatus']);
    const head = page.$('remindersHead');
    assert.equal(head.className, 'gx-reminders-head');
    assert.deepEqual(head.children.map((child) => child.id || child.className), ['remindersTitle', 'toggle', 'gx-lead', 'testNotificationBtn']);
    assert.equal(page.$('remindersTitle').tagName, 'H2');
    assert.equal(textOf(page.$('remindersTitle'), 'span[data-i18n="remindersTitle"]'), '我的提醒');
    assert.equal(page.$('reminderCount').className, 'gx-count');
    const toggle = page.$('notificationToggle');
    assert.equal(toggle.getAttribute('type'), 'checkbox');
    isSame(toggle.parentNode, head.querySelector('label.toggle'));
    assert.equal(textOf(head, 'label.toggle > span[data-i18n="webReminderToggle"]'), '網頁提醒');
    assert.ok(head.querySelector('label.toggle > span.toggle-track'));
    assert.equal(page.$('testNotificationBtn').getAttribute('data-i18n'), 'testNotificationButtonShort');
    assert.equal(page.$('testNotificationBtn').getAttribute('data-i18n-attr'), 'title');
    assert.equal(page.$('reminderList').className, 'gx-reminder-list');
    assert.ok(page.$('reminderMoreBtn').hasAttribute('hidden'));
    assert.equal(textOf(section, 'p.gx-note'), '頁面要開著才會響。');
    assert.ok(page.$('notifyStatus').hasAttribute('hidden'));
    assert.equal(page.$('clockSlot').className, 'gx-clock-slot');
    assert.equal(page.$('clockLine').className, 'gx-clock');
    assert.equal(textOf(page.$('clockLine'), 'span[data-i18n="clockEt"]'), 'ET');
    assert.equal(textOf(page.$('clockLine'), 'span[data-i18n="clockLocal"]'), '本地');
    assert.equal(page.$('clockEt').tagName, 'B');
    assert.equal(page.$('clockLocal').tagName, 'B');
});

test('頁面上每一個用 hidden 切換的元素在 style.css 都有 display: none', () => {
    // fake-dom 看不出「設了 hidden 卻沒藏起來」：.card、.btn、.warning-message 等共用樣式設了 display，會蓋過瀏覽器內建的 [hidden]
    const css = read('tools/timed-gathering/style.css');
    const html = read('tools/timed-gathering/index.html');
    for (const id of ['reminders', 'reminderMoreBtn', 'notifyStatus']) {
        assert.ok(html.includes(` id="${id}"`), `index.html 要有 #${id}`);
        assert.match(css, new RegExp(`#${id}\\[hidden\\][^{]*\\{\\s*display:\\s*none;`), `style.css 要有 #${id}[hidden] { display: none; }`);
    }
    // 複製鬧鐘的說明是頁面程式建的 div.gx-copied（沒有 id），複製另一張時前一個設成 hidden；.gx-copied 自己設了 display: grid
    assert.match(css, /\.gx-copied\s*\{[^}]*display:\s*grid;/, '.gx-copied 設了 display，蓋過內建的 [hidden]');
    assert.match(css, /\.gx-copied\[hidden\][^{]*\{\s*display:\s*none;/, 'style.css 要有 .gx-copied[hidden] { display: none; }');
});

test('我的提醒與通知的文字三語都有；舊的時鐘與通知文字拿掉', () => {
    const expected = {
        remindersTitle: ['我的提醒', 'My reminders', 'マイ通知'],
        webReminderToggle: ['網頁提醒', 'Page alerts', 'ページ通知'],
        leadLabel: ['通知時間', 'Notify', '通知'],
        leadOptionAtStart: ['出現時', 'When it appears', '出現時'],
        leadOption: ['出現前 {n} 分鐘', '{n} min before', '{n}分前'],
        clockEt: ['ET', 'ET', 'ET'],
        clockLocal: ['本地', 'Local', 'ローカル'],
        remindersNote: ['頁面要開著才會響。', 'Keep this page open to get them.', 'このページを開いたままにしてください。'],
        showAllReminders: ['顯示全部 {count} 個', 'Show all {count}', 'すべて表示（{count}件）'],
        showFewerReminders: ['收起', 'Show fewer', '折りたたむ'],
        remindButton: ['提醒我', 'Remind me', '通知する'],
        remindSetButton: ['已設提醒', 'Reminder on', '通知中'],
        cancelReminderLabel: ['取消提醒：{name}', 'Cancel reminder: {name}', '通知を取り消す：{name}'],
        reminderAddedToast: ['已設提醒：{name}', 'Reminder set: {name}', '通知を設定しました：{name}'],
        reminderRemovedToast: ['已取消提醒：{name}', 'Reminder cancelled: {name}', '通知を取り消しました：{name}'],
        notifyTitle: ['{name} {n} 分鐘後出現', '{name} appears in {n} min', '{name}が{n}分後に出現'],
        notifyTitleNow: ['{name}出現了', '{name} is up now', '{name}が出現しました'],
        notifyBody: ['{start} 開始，到 {end}（{et}）· {place}', '{start}–{end} ({et}) · {place}', '{start}開始、{end}まで（{et}）・{place}'],
        notifyDenied: [
            DENIED_TEXT,
            "Your browser blocks notifications from this site, so you'll only get an on-page alert and a sound. You can allow them in the site settings next to the address bar, or use the in-game alarm.",
            'このサイトの通知はブラウザでブロックされています。時間になるとページ上の表示と音でお知らせします。アドレスバー左のサイト設定から許可するか、ゲーム内アラームを使ってください。'
        ],
        notifyUnsupported: [
            UNSUPPORTED_TEXT,
            "This browser can't show notifications, so you'll only get an on-page alert and a sound, or use the in-game alarm.",
            'このブラウザは通知を表示できません。時間になるとページ上の表示と音でお知らせします。ゲーム内アラームも使えます。'
        ],
        // 留著：測試通知用
        notificationTitle: ['FF14 採集提醒', 'FF14 Gathering Reminder', 'FF14 採集リマインダー'],
        testNotificationButtonShort: ['測試通知', 'Test Notification', '通知テスト']
    };
    const removed = [
        'localTimeLabel', 'eorzeaTimeLabel', 'dayTime', 'nightTime', 'notificationLabel', 'notificationToggleLabel',
        'notificationDisabled', 'notificationEnabled', 'notificationPermissionDenied', 'notificationNotSupported', 'notificationHint',
        'notificationBodyTemplate', 'testNotificationButton', 'visualNotificationTitle', 'visualNotificationBody',
        'visualNotificationTime', 'visualNotificationLocation', 'testItemName', 'testZoneName'
    ];
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(expected)) assert.equal(values.get(key), texts[index], `${lang} ${key}`);
        assert.ok(values.has('testNotificationBody'), `${lang} testNotificationBody 留著`);
        for (const key of removed) assert.ok(!values.has(key), `${lang} ${key} 要拿掉`);
    });
});

// ---------- 複製鬧鐘 ----------
// 複製的是一行不帶 rp 的 /alarm 指令：資料的 macroFormat，ET 開始時間，提前 1 分鐘，se04，mute（格式見 generateOneTimeAlarm）
const CORDIA_ALARM = (hhmm) => `/alarm "園/樹液/マムーク/コーディア樹液塊" et ${hhmm} 1 se04 mute`;
const OCTA_ALARM = (hhmm) => `/alarm "採/鉱/マムーク/オクタヘドライト鉱石" et ${hhmm} 1 se04 mute`;
const QUARTZ_ALARM = (hhmm) => `/alarm "採/石/レイノード・ウィンド/ライトニングクォーツ" et ${hhmm} 1 se04 mute`;
const NOTE_ZH = (time) => `已複製下一次（ET ${time}）的遊戲鬧鐘，貼到遊戲的聊天輸入框就設好：`;
// 剪貼簿沒寫成功時說明改寫成這個（不再寫已複製），並加上 .is-failed
const NOTE_FAILED_ZH = (time) => `沒辦法自動複製。下一次（ET ${time}）的遊戲鬧鐘在下面，請自己選取複製，貼到遊戲的聊天輸入框：`;
const NOTE_FAILED_EN = (time) => `Couldn't copy it automatically. Here is the in-game alarm for the next one (ET ${time}); select and copy it, then paste it into the game's chat box:`;
const alarmBtnOf = (page, key) => page.cardOf(key).querySelector('.gx-alarm-btn');
const rowAlarmBtnOf = (page, key) => rowOf(page, key).querySelector('.gx-alarm-btn');
// 頁面上所有複製鬧鐘的說明（含收起來的）與沒有收起來的
const notesOn = (page) => page.document.querySelectorAll('.gx-copied');
const visibleNotes = (page) => notesOn(page).filter((note) => !note.hidden);

test('複製鬧鐘：正在可採時複製再下一段；toast 與卡片下方的說明寫出複製了什麼', async () => {
    // ET 12:30：科迪亞樹液塊正在可採（12:00–14:00），下一次是隔天 ET 00:00，不是正在進行的這一段
    const page = await createGatheringPage({ now: at(0, 12, 30) });
    const card = page.cardOf(CORDIA);
    const button = alarmBtnOf(page, CORDIA);
    assert.equal(button.type, 'button');
    assert.equal(button.className, 'btn btn-sm btn-outline gx-alarm-btn');
    assert.equal(button.textContent, '📋 複製鬧鐘');
    assert.ok(!button.disabled && !button.hasAttribute('disabled'), '複製鬧鐘鈕不用 disabled');
    isSame(button.parentNode, card.querySelector('.gx-actions'), '複製鬧鐘鈕在卡片的按鈕列');
    isSame(button.previousElementSibling, remindBtnOf(page, CORDIA), '接在提醒鈕後面');
    isSame(button.nextElementSibling, card.querySelector('.gx-add-btn'), '加入清單鈕在最後');
    assert.equal(notesOn(page).length, 0, '還沒複製就沒有說明');
    assert.deepEqual(page.clipboard, []);

    button.focus();
    button.click();
    await page.settle();
    assert.deepEqual(page.clipboard, [CORDIA_ALARM('0000')]);
    assert.deepEqual(page.toasts.at(-1), { message: '已複製鬧鐘指令', type: 'success' });
    // 說明在卡片裡、按鈕列下面：一句話加上指令本身（指令是文字，剪貼簿不能用時可以自己選取）
    const note = card.querySelector('.gx-copied');
    assert.equal(note.tagName, 'DIV');
    assert.equal(note.hidden, false);
    isSame(note.parentNode, card, '說明在卡片裡');
    isSame(note.previousElementSibling, card.querySelector('.gx-actions'), '緊接在按鈕列下面');
    assert.deepEqual(note.children.map((child) => child.tagName), ['SPAN', 'CODE']);
    assert.equal(textOf(note, 'span'), NOTE_ZH('00:00'));
    assert.equal(textOf(note, 'code'), CORDIA_ALARM('0000'));
    assert.ok(!note.classList.contains('is-failed'), '複製成功：沒有失敗的樣子');
    // 按鈕還是同一顆、焦點不動
    isSame(alarmBtnOf(page, CORDIA), button, '還是同一顆按鈕');
    isSame(page.document.activeElement, button, '焦點還在按鈕上');
    assert.deepEqual(page.consoleErrors, []);

    // 再按一次：重用同一個說明，不會一張卡片出現兩個
    button.click();
    await page.settle();
    assert.equal(page.clipboard.length, 2);
    isSame(card.querySelector('.gx-copied'), note, '重用同一個說明');
    assert.equal(card.querySelectorAll('.gx-copied').length, 1);
    isSame(page.document.activeElement, button);
});

test('複製鬧鐘：每次按的時候才算下一次，兩個時段選最近的，區間用開始時間', async () => {
    // ET 11:00：科迪亞樹液塊下一次是 ET 12:00；八面體隕鐵礦石 10:00–12:00 正在可採，下一段是 ET 22:00；雷電石英（00:00–04:00）是隔天 ET 00:00
    const page = await createGatheringPage({ now: at(0, 11) });
    const cases = [
        [CORDIA, CORDIA_ALARM('1200'), '12:00'],
        [OCTA, OCTA_ALARM('2200'), '22:00'],
        ['mining_lightning_quartz', QUARTZ_ALARM('0000'), '00:00']
    ];
    for (const [key, command, time] of cases) {
        alarmBtnOf(page, key).click();
        await page.settle();
        assert.equal(page.clipboard.at(-1), command, key);
        assert.equal(textOf(page.cardOf(key), '.gx-copied span'), NOTE_ZH(time), key);
        assert.equal(textOf(page.cardOf(key), '.gx-copied code'), command, key);
    }

    // 卡片還沒重畫，但時間已經走到 ET 12:30：12:00 那一段開始了，再按複製的就是隔天 ET 00:00
    const note = page.cardOf(CORDIA).querySelector('.gx-copied');
    page.tick(at(0, 12, 30) - page.now);
    alarmBtnOf(page, CORDIA).click();
    await page.settle();
    assert.equal(page.clipboard.at(-1), CORDIA_ALARM('0000'));
    isSame(page.cardOf(CORDIA).querySelector('.gx-copied'), note, '同一個說明改寫成新的');
    assert.equal(textOf(note, 'span'), NOTE_ZH('00:00'));
    assert.equal(textOf(note, 'code'), CORDIA_ALARM('0000'));
});

test('一次只留一個說明：複製另一張時前一個收起，再複製回來時重用', async () => {
    const page = await createGatheringPage({ now: at(0, 11) });
    alarmBtnOf(page, CORDIA).click();
    await page.settle();
    const first = page.cardOf(CORDIA).querySelector('.gx-copied');
    assert.equal(visibleNotes(page).length, 1);

    alarmBtnOf(page, OCTA).click();
    await page.settle();
    const second = page.cardOf(OCTA).querySelector('.gx-copied');
    assert.equal(first.hidden, true, '前一個收起來（hidden），不是拿掉');
    assert.equal(second.hidden, false);
    assert.equal(notesOn(page).length, 2);
    assert.equal(visibleNotes(page).length, 1);
    assert.equal(textOf(second, 'code'), OCTA_ALARM('2200'));

    alarmBtnOf(page, CORDIA).click();
    await page.settle();
    isSame(page.cardOf(CORDIA).querySelector('.gx-copied'), first, '重用收起來的那一個');
    assert.equal(first.hidden, false);
    assert.equal(second.hidden, true);
    assert.equal(notesOn(page).length, 2);
    assert.equal(visibleNotes(page).length, 1);
    assert.equal(textOf(first, 'code'), CORDIA_ALARM('1200'));
    assert.deepEqual(page.consoleErrors, []);
});

test('剪貼簿不能用：toast 寫複製失敗，說明改寫成沒辦法自動複製、換警告的配色，照樣顯示指令讓人自己選取', async () => {
    // 剪貼簿拒絕寫入（writeText() 的 Promise 被拒絕）
    const rejected = await createGatheringPage({ now: at(0, 12, 30), clipboard: 'reject' });
    const button = alarmBtnOf(rejected, CORDIA);
    button.focus();
    button.click();
    await rejected.settle();
    assert.deepEqual(rejected.clipboard, []);
    assert.deepEqual(rejected.toasts, [{ message: '複製失敗，請手動選取複製', type: 'error' }]);
    const note = rejected.cardOf(CORDIA).querySelector('.gx-copied');
    assert.equal(note.hidden, false, '說明照樣顯示');
    assert.ok(note.classList.contains('is-failed'), '失敗的樣子：不用成功的配色');
    assert.equal(textOf(note, 'span'), NOTE_FAILED_ZH('00:00'), '不再寫已複製');
    assert.equal(textOf(note, 'code'), CORDIA_ALARM('0000'), '指令在說明裡，使用者可以自己選取');
    isSame(rejected.document.activeElement, button, '焦點還在按鈕上');
    // 失敗的原因用 console.warn 記下，剛好一則
    assert.equal(rejected.consoleErrors.length, 1, rejected.consoleErrors.join('\n'));
    assert.ok(rejected.consoleErrors[0].startsWith('複製鬧鐘失敗: '), rejected.consoleErrors[0]);
    assert.ok(rejected.consoleErrors[0].includes('NotAllowedError'), rejected.consoleErrors[0]);

    // 之後剪貼簿又能用了：再按一次，同一個說明改回已複製，失敗的樣子拿掉
    rejected.window.navigator.clipboard.writeText = async (text) => { rejected.clipboard.push(text); };
    button.click();
    await rejected.settle();
    isSame(rejected.cardOf(CORDIA).querySelector('.gx-copied'), note, '還是同一個說明');
    assert.ok(!note.classList.contains('is-failed'));
    assert.equal(textOf(note, 'span'), NOTE_ZH('00:00'));
    assert.deepEqual(rejected.clipboard, [CORDIA_ALARM('0000')]);
    assert.deepEqual(rejected.toasts.at(-1), { message: '已複製鬧鐘指令', type: 'success' });

    // 沒有 navigator.clipboard（不是安全的連線）：英文介面，同樣是複製失敗，頁面不丟錯
    const missing = await createGatheringPage({ now: at(0, 12, 30), lang: 'en' });
    delete missing.window.navigator.clipboard;
    assert.equal(missing.window.navigator.clipboard, undefined);
    assert.doesNotThrow(() => alarmBtnOf(missing, CORDIA).click());
    await missing.settle();
    assert.deepEqual(missing.clipboard, []);
    assert.deepEqual(missing.toasts, [{ message: 'Copy failed, please select and copy manually', type: 'error' }]);
    const missingNote = missing.cardOf(CORDIA).querySelector('.gx-copied');
    assert.equal(missingNote.hidden, false);
    assert.ok(missingNote.classList.contains('is-failed'));
    assert.equal(textOf(missingNote, 'span'), NOTE_FAILED_EN('00:00'));
    assert.equal(textOf(missingNote, 'code'), CORDIA_ALARM('0000'));
    assert.equal(missing.consoleErrors.length, 1, missing.consoleErrors.join('\n'));
    assert.ok(missing.consoleErrors[0].startsWith('複製鬧鐘失敗: '), missing.consoleErrors[0]);
    assert.ok(missing.consoleErrors[0].includes('TypeError'), missing.consoleErrors[0]);
});

test('剪貼簿的結果晚到：失敗只改按下去的那個說明，正在顯示的別張不動；卡片已經重畫就什麼都不改', async () => {
    const page = await createGatheringPage({ now: at(0, 11) });
    // 寫入的結果由測試決定什麼時候來
    const writes = [];
    page.window.navigator.clipboard.writeText = (text) => new Promise((resolve, reject) => { writes.push({ text, resolve, reject }); });

    alarmBtnOf(page, CORDIA).click();
    alarmBtnOf(page, OCTA).click();
    assert.deepEqual(writes.map((write) => write.text), [CORDIA_ALARM('1200'), OCTA_ALARM('2200')]);
    const first = page.cardOf(CORDIA).querySelector('.gx-copied');
    const second = page.cardOf(OCTA).querySelector('.gx-copied');
    // 結果還不知道：說明先照成功寫好（指令馬上看得到），只顯示最後複製的那一個
    assert.deepEqual([first.hidden, second.hidden], [true, false]);
    assert.ok(!first.classList.contains('is-failed') && !second.classList.contains('is-failed'));
    assert.equal(textOf(second, 'span'), NOTE_ZH('22:00'));
    assert.equal(page.toasts.length, 0, '結果來之前沒有 toast');

    // 第一張的寫入被拒絕，結果晚到：只改它自己的說明（還是收起的）；別張正在顯示的說明不動、不被收起
    writes[0].reject(new Error('NotAllowedError'));
    await page.settle();
    assert.ok(first.classList.contains('is-failed'));
    assert.equal(textOf(first, 'span'), NOTE_FAILED_ZH('12:00'));
    assert.equal(first.hidden, true, '改寫不動誰顯示誰收起');
    assert.deepEqual([second.hidden, second.classList.contains('is-failed')], [false, false]);
    assert.equal(textOf(second, 'span'), NOTE_ZH('22:00'));
    assert.deepEqual(visibleNotes(page).map((note) => note === second), [true]);
    assert.deepEqual(page.toasts, [{ message: '複製失敗，請手動選取複製', type: 'error' }]);

    // 第二張成功：toast 成功，說明還是成功的樣子
    writes[1].resolve();
    await page.settle();
    assert.deepEqual(page.toasts.at(-1), { message: '已複製鬧鐘指令', type: 'success' });
    assert.ok(!second.classList.contains('is-failed'));

    // 結果來之前卡片已經重畫（換語言）：說明跟著舊卡片不在了；晚到的失敗什麼都不改，也不丟錯
    alarmBtnOf(page, CORDIA).click();
    assert.equal(writes.length, 3);
    page.setLang('en');
    assert.equal(notesOn(page).length, 0);
    writes[2].reject(new Error('NotAllowedError'));
    await page.settle();
    assert.equal(notesOn(page).length, 0);
    assert.deepEqual(page.toasts.at(-1), { message: 'Copy failed, please select and copy manually', type: 'error' });
    // 每一次失敗各用 console.warn 記下原因，其他都沒有
    assert.equal(page.consoleErrors.length, 2, page.consoleErrors.join('\n'));
    assert.ok(page.consoleErrors.every((entry) => entry.startsWith('複製鬧鐘失敗: ')), page.consoleErrors.join('\n'));
});

test('同一張卡片連按兩次：前一次的結果比後一次晚到時不改說明、不跳 toast，說明照後一次', async () => {
    const page = await createGatheringPage({ now: at(0, 11) });
    const writes = [];
    page.window.navigator.clipboard.writeText = (text) => new Promise((resolve, reject) => { writes.push({ text, resolve, reject }); });

    // ET 11:00 按一次（下一次是 ET 12:00）；走到 ET 12:30 再按一次（12:00 那一段開始了，下一次是隔天 ET 00:00）
    alarmBtnOf(page, CORDIA).click();
    page.tick(at(0, 12, 30) - page.now);
    alarmBtnOf(page, CORDIA).click();
    assert.deepEqual(writes.map((write) => write.text), [CORDIA_ALARM('1200'), CORDIA_ALARM('0000')]);
    const note = page.cardOf(CORDIA).querySelector('.gx-copied');
    assert.equal(textOf(note, 'span'), NOTE_ZH('00:00'));

    // 後一次先成功，前一次才被拒絕：說明還是後一次的成功，不改成前一次的時間或失敗的樣子，也不跳失敗的 toast
    writes[1].resolve();
    await page.settle();
    writes[0].reject(new Error('NotAllowedError'));
    await page.settle();
    assert.ok(!note.classList.contains('is-failed'));
    assert.equal(textOf(note, 'span'), NOTE_ZH('00:00'));
    assert.equal(textOf(note, 'code'), CORDIA_ALARM('0000'));
    assert.deepEqual(page.toasts, [{ message: '已複製鬧鐘指令', type: 'success' }]);

    // 反過來：後一次先失敗，前一次才成功：說明維持失敗（請自己選取），不跳成功的 toast
    alarmBtnOf(page, CORDIA).click();
    alarmBtnOf(page, CORDIA).click();
    writes[3].reject(new Error('NotAllowedError'));
    await page.settle();
    writes[2].resolve();
    await page.settle();
    assert.ok(note.classList.contains('is-failed'));
    assert.equal(textOf(note, 'span'), NOTE_FAILED_ZH('00:00'));
    assert.deepEqual(page.toasts.slice(1), [{ message: '複製失敗，請手動選取複製', type: 'error' }]);
    // 失敗的原因照樣每一次都記下（被取代的那一次也是）
    assert.equal(page.consoleErrors.length, 2, page.consoleErrors.join('\n'));
    assert.ok(page.consoleErrors.every((entry) => entry.startsWith('複製鬧鐘失敗: ')), page.consoleErrors.join('\n'));
});

test('全天的素材沒有複製鬧鐘；提醒列也能複製鬧鐘', async () => {
    // ET 12:30：科迪亞樹液塊正在可採；八面體隕鐵礦石下一次 ET 22:00
    const now = at(0, 12, 30);
    const page = await createGatheringPage({ now, stored: storedReminders([CORDIA, OCTA], { armedAt: now - MINUTE }) });
    isSame(alarmBtnOf(page, 'fishing_purple_tongue'), null, '紫色舌尖全天都能採，沒有鬧鐘可設');
    assert.equal(page.cards().filter((card) => card.querySelector('.gx-alarm-btn')).length, 33, '其他 33 種都有');

    // 提醒列：複製鬧鐘在取消鈕前面，一樣是 btn-sm btn-outline、不是 btn-primary
    const row = rowOf(page, CORDIA);
    const button = rowAlarmBtnOf(page, CORDIA);
    isSame(button.parentNode, row.querySelector('.gx-r-actions'));
    isSame(button.nextElementSibling, cancelBtnOf(page, CORDIA), '複製鬧鐘在取消鈕前面');
    assert.equal(button.type, 'button');
    assert.equal(button.className, 'btn btn-sm btn-outline gx-alarm-btn');
    assert.equal(button.textContent, '📋 複製鬧鐘');
    // 480px 以下提醒列的按鈕只顯示 📋：字放在 .gx-btn-label 裡由 style.css 藏起來，按鈕的名稱照樣在 aria-label
    assert.equal(textOf(button, '.btn-icon'), '📋');
    assert.equal(textOf(button, '.gx-btn-label'), '複製鬧鐘');
    assert.ok(!button.disabled && !button.hasAttribute('disabled'));
    // 每一列的按鈕字都一樣，aria-label 加上素材名稱才分得出是哪一列（同取消鈕）；卡片上的按鈕在素材自己的卡片裡，不加
    assert.equal(button.getAttribute('aria-label'), '複製鬧鐘：科迪亞樹液塊');
    assert.equal(rowAlarmBtnOf(page, OCTA).getAttribute('aria-label'), '複製鬧鐘：八面體隕鐵礦石');
    assert.equal(alarmBtnOf(page, CORDIA).hasAttribute('aria-label'), false, '卡片上的複製鬧鐘鈕沒有 aria-label');
    assert.equal(page.$('reminders').querySelectorAll('.btn-primary').length, 0, '我的提醒裡沒有 .btn-primary');

    button.focus();
    button.click();
    await page.settle();
    assert.deepEqual(page.clipboard, [CORDIA_ALARM('0000')]);
    assert.deepEqual(page.toasts.at(-1), { message: '已複製鬧鐘指令', type: 'success' });
    const note = row.querySelector('.gx-copied');
    isSame(note.parentNode, row, '說明在提醒列裡');
    assert.equal(note.hidden, false);
    assert.deepEqual(note.children.map((child) => child.tagName), ['SPAN', 'CODE']);
    assert.equal(textOf(note, 'span'), NOTE_ZH('00:00'));
    assert.equal(textOf(note, 'code'), CORDIA_ALARM('0000'));
    isSame(rowAlarmBtnOf(page, CORDIA), button, '還是同一顆按鈕');
    isSame(page.document.activeElement, button, '焦點還在按鈕上');
    assert.equal(notesOn(page).length, 1, '卡片上沒有說明');
    // 每秒的倒數與重排都不動說明：列還是同一列，說明還在
    page.tick(1000);
    isSame(rowOf(page, CORDIA).querySelector('.gx-copied'), note);

    // 一次只留一個：在卡片上複製另一種，提醒列的說明收起來
    alarmBtnOf(page, OCTA).click();
    await page.settle();
    assert.equal(note.hidden, true);
    assert.equal(visibleNotes(page).length, 1);
    assert.equal(textOf(page.cardOf(OCTA), '.gx-copied code'), OCTA_ALARM('2200'));
    // 同一種素材的卡片與提醒列各有自己的說明，一樣只留一個
    rowAlarmBtnOf(page, OCTA).click();
    await page.settle();
    assert.equal(page.cardOf(OCTA).querySelector('.gx-copied').hidden, true);
    assert.equal(textOf(rowOf(page, OCTA), '.gx-copied code'), OCTA_ALARM('2200'));
    assert.equal(visibleNotes(page).length, 1);
    assert.deepEqual(page.consoleErrors, []);
});

test('說明跟著重排：卡片與提醒列切換順序時搬動原本的元素，說明還在原本的卡片與列裡，顯示或收起不變', async () => {
    // ET 12:00 前 1 秒：八面體隕鐵礦石還能採（到 12:00），科迪亞樹液塊 1 秒後出現；12:00 兩邊對調，14:00 又對調
    const now = at(0, 12) - 1000;
    const page = await createGatheringPage({ now, stored: storedReminders([CORDIA, OCTA], { armedAt: now - MINUTE }) });
    assert.deepEqual(rowKeys(page), [OCTA, CORDIA]);
    assert.equal(keysOf(page)[0], OCTA, '最前面的卡片是還在採的八面體隕鐵礦石');
    const rows = { [CORDIA]: rowOf(page, CORDIA), [OCTA]: rowOf(page, OCTA) };
    const cards = { [CORDIA]: page.cardOf(CORDIA), [OCTA]: page.cardOf(OCTA) };

    // 在提醒列上複製（顯示）。焦點不在清單裡，12:00 到了馬上重排：提醒列與卡片都對調
    rowAlarmBtnOf(page, OCTA).click();
    await page.settle();
    const rowNote = rows[OCTA].querySelector('.gx-copied');
    assert.equal(rowNote.hidden, false);
    page.tick(1000);
    assert.deepEqual(rowKeys(page), [CORDIA, OCTA], '提醒列對調了');
    assert.deepEqual(keysOf(page), expectedKeys(page), '卡片照現在的時間排好了');
    assert.equal(keysOf(page)[0], CORDIA, '最前面換成剛出現的科迪亞樹液塊');
    isSame(rowOf(page, OCTA), rows[OCTA], '搬動的是原本的列');
    isSame(rowOf(page, CORDIA), rows[CORDIA]);
    isSame(page.cardOf(OCTA), cards[OCTA], '搬動的是原本的卡片');
    isSame(page.cardOf(CORDIA), cards[CORDIA]);
    isSame(rows[OCTA].querySelector('.gx-copied'), rowNote, '說明還在原本的列裡');
    isSame(rowNote.parentNode, rows[OCTA]);
    assert.equal(rowNote.hidden, false, '還是顯示');
    assert.equal(textOf(rowNote, 'code'), OCTA_ALARM('2200'));
    assert.equal(visibleNotes(page).length, 1);

    // 在卡片上複製（顯示，提醒列的收起）。14:00 到了又重排：科迪亞樹液塊結束，卡片排到後面，提醒列又對調
    alarmBtnOf(page, CORDIA).click();
    await page.settle();
    const cardNote = cards[CORDIA].querySelector('.gx-copied');
    assert.deepEqual([cardNote.hidden, rowNote.hidden], [false, true]);
    page.tick(at(0, 14) - page.now);
    assert.deepEqual(rowKeys(page), [OCTA, CORDIA], '提醒列又對調了');
    assert.deepEqual(keysOf(page), expectedKeys(page));
    assert.notEqual(keysOf(page)[0], CORDIA, '科迪亞樹液塊的卡片排到後面了');
    isSame(page.cardOf(CORDIA), cards[CORDIA], '搬動的是原本的卡片');
    isSame(rowOf(page, OCTA), rows[OCTA]);
    isSame(cards[CORDIA].querySelector('.gx-copied'), cardNote, '說明還在原本的卡片裡');
    isSame(cardNote.parentNode, cards[CORDIA]);
    isSame(rows[OCTA].querySelector('.gx-copied'), rowNote, '提醒列的說明也還在');
    assert.deepEqual([cardNote.hidden, rowNote.hidden], [false, true], '顯示的還是顯示，收起的還是收起');
    assert.equal(visibleNotes(page).length, 1);
    assert.equal(textOf(cardNote, 'code'), CORDIA_ALARM('0000'));
    assert.equal(textOf(rowNote, 'code'), OCTA_ALARM('2200'));
});

test('切換語言：複製鬧鐘的按鈕與之後的 toast、說明換字；舊語言寫的說明收掉', async () => {
    const now = at(0, 11);
    const page = await createGatheringPage({ now, stored: storedReminders([CORDIA], { armedAt: now - MINUTE }) });
    const rowButton = rowAlarmBtnOf(page, CORDIA);
    assert.equal(rowButton.getAttribute('aria-label'), '複製鬧鐘：科迪亞樹液塊');
    rowButton.click();
    await page.settle();
    alarmBtnOf(page, CORDIA).click();
    await page.settle();
    assert.equal(notesOn(page).length, 2, '提醒列與卡片各有一個說明');
    assert.equal(visibleNotes(page).length, 1, '但只留一個');

    // 提醒列就地改字（還是同一顆按鈕，焦點不會掉），卡片整個重畫；兩邊舊語言的說明（含收起來的）都收掉
    rowButton.focus();
    page.setLang('en');
    isSame(rowAlarmBtnOf(page, CORDIA), rowButton, '換語言不重建提醒列的按鈕');
    isSame(page.document.activeElement, rowButton, '焦點還在按鈕上');
    assert.equal(rowButton.textContent, '📋 Copy alarm');
    assert.equal(alarmBtnOf(page, CORDIA).textContent, '📋 Copy alarm');
    assert.equal(rowButton.getAttribute('aria-label'), 'Copy alarm: Cordia Resin', '提醒列按鈕的 aria-label 跟著換語言，和取消鈕一樣');
    assert.equal(alarmBtnOf(page, CORDIA).hasAttribute('aria-label'), false, '卡片上的按鈕沒有 aria-label');
    assert.equal(notesOn(page).length, 0, '舊語言寫的說明都收掉了');

    alarmBtnOf(page, CORDIA).click();
    await page.settle();
    assert.deepEqual(page.toasts.at(-1), { message: 'Alarm command copied', type: 'success' });
    assert.equal(
        textOf(page.cardOf(CORDIA), '.gx-copied span'),
        "Copied the in-game alarm for the next one (ET 12:00). Paste it into the game's chat box to set it:"
    );
    assert.equal(textOf(page.cardOf(CORDIA), '.gx-copied code'), CORDIA_ALARM('1200'), '指令不分語言');

    // 日文；這次在提醒列上複製，卡片重畫之前先搜尋：搜尋重畫卡片，卡片上的說明跟著消失
    page.setLang('ja');
    assert.equal(rowButton.textContent, '📋 アラームをコピー');
    assert.equal(alarmBtnOf(page, CORDIA).textContent, '📋 アラームをコピー');
    assert.equal(rowButton.getAttribute('aria-label'), 'アラームをコピー：コーディア樹液塊');
    rowButton.click();
    await page.settle();
    assert.deepEqual(page.toasts.at(-1), { message: 'アラームのコマンドをコピーしました', type: 'success' });
    assert.equal(
        textOf(rowOf(page, CORDIA), '.gx-copied span'),
        '次回（ET 12:00）のゲーム内アラームをコピーしました。ゲームのチャット欄に貼り付ければ設定できます：'
    );
    alarmBtnOf(page, OCTA).click();
    await page.settle();
    assert.equal(visibleNotes(page).length, 1);
    search(page, 'octa');
    assert.equal(page.cards().length, 1);
    isSame(page.cardOf(OCTA).querySelector('.gx-copied'), null, '重畫的卡片沒有舊的說明');
    assert.deepEqual(page.consoleErrors, []);

    // 取消提醒：這一列連同它（已經收起來）的說明拿掉
    assert.equal(notesOn(page).length, 1, '只剩提醒列裡收起來的那一個');
    cancelBtnOf(page, CORDIA).click();
    assert.equal(notesOn(page).length, 0);
});

test('複製鬧鐘的文字三語都有；說明可以選取、失敗時換警告的配色、提醒列的說明橫跨整列、提醒列的按鈕可以換行', () => {
    const expected = {
        copyAlarmButton: ['複製鬧鐘', 'Copy alarm', 'アラームをコピー'],
        copyAlarmLabel: ['複製鬧鐘：{name}', 'Copy alarm: {name}', 'アラームをコピー：{name}'],
        alarmCopiedToast: ['已複製鬧鐘指令', 'Alarm command copied', 'アラームのコマンドをコピーしました'],
        alarmCopiedNote: [
            '已複製下一次（ET {time}）的遊戲鬧鐘，貼到遊戲的聊天輸入框就設好：',
            "Copied the in-game alarm for the next one (ET {time}). Paste it into the game's chat box to set it:",
            '次回（ET {time}）のゲーム内アラームをコピーしました。ゲームのチャット欄に貼り付ければ設定できます：'
        ],
        alarmCopyFailedNote: [
            '沒辦法自動複製。下一次（ET {time}）的遊戲鬧鐘在下面，請自己選取複製，貼到遊戲的聊天輸入框：',
            "Couldn't copy it automatically. Here is the in-game alarm for the next one (ET {time}); select and copy it, then paste it into the game's chat box:",
            '自動でコピーできませんでした。次回（ET {time}）のゲーム内アラームは下にあります。選択してコピーし、ゲームのチャット欄に貼り付けてください：'
        ],
        // 已有的鍵：複製失敗的 toast
        copyFailedError: ['複製失敗，請手動選取複製', 'Copy failed, please select and copy manually', 'コピーに失敗しました。手動で選択してコピーしてください']
    };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(expected)) assert.equal(values.get(key), texts[index], `${lang} ${key}`);
    });

    const css = read('tools/timed-gathering/style.css');
    // 最外層（行首）的規則內容；@media 裡縮排的同名規則不算
    const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ruleOf = (selector) => {
        const found = css.match(new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`));
        assert.ok(found, `style.css 要有 ${selector} 的規則`);
        return found[1];
    };
    // 指令是 <code> 裡的文字：等寬字，長的指令在窄螢幕換行；點一下就選取整行指令（剪貼簿不能用時要自己選取），沒有任何地方設成不能選取
    const code = ruleOf('.gx-copied code');
    assert.match(code, /font-family:\s*var\(--font-mono\);/);
    assert.match(code, /overflow-wrap:\s*anywhere;/);
    assert.match(code, /(?:^|[\s;])user-select:\s*all;/, '點一下選取整行指令');
    const noteRules = [...css.matchAll(/\.gx-copied[^{]*\{[^}]*\}/g)].map((match) => match[0]).join('\n');
    assert.ok(noteRules.length > 0 && !/user-select:\s*none/.test(noteRules), '.gx-copied 的規則沒有 user-select: none');
    // 複製沒成功：說明換警告的配色（邊框、底、字），不用成功的
    const failed = ruleOf('.gx-copied.is-failed');
    for (const token of ['border-color: var(--color-warning-border)', 'background: var(--color-warning-tint)', 'color: var(--color-warning-text)']) {
        assert.ok(failed.includes(token), `.gx-copied.is-failed 要有 ${token}`);
    }
    assert.ok(!/color-success/.test(failed), '失敗的說明不用成功的配色');
    // 提醒列是 3 欄的 grid（手機也是）：說明自己一整列，不是擠進第一欄
    assert.match(ruleOf('.gx-reminder > .gx-copied'), /grid-column:\s*1\s*\/\s*-1;/);
    // 提醒列的按鈕在窄螢幕（日文的「アラームをコピー」加 ✕）放不下時換行，不超出
    assert.match(ruleOf('.gx-r-actions'), /flex-wrap:\s*wrap;/);
    // 480px 以下提醒列的複製鬧鐘鈕只顯示 📋：寬度同共用的 .btn-icon-only.btn-sm（正方形），字藏起來，名稱那一行才有寬度
    const start = css.indexOf('@media (max-width: 480px) {');
    assert.ok(start !== -1, 'style.css 要有 @media (max-width: 480px)');
    const narrow = css.slice(start, css.indexOf('\n}', start));
    const alarm = narrow.match(/\n\s+\.gx-reminder \.gx-alarm-btn\s*\{([^}]*)\}/);
    assert.ok(alarm, '@media (max-width: 480px) 裡要有 .gx-reminder .gx-alarm-btn 的規則');
    assert.match(alarm[1], /width:\s*var\(--control-sm\);/);
    assert.match(alarm[1], /padding:\s*0;/);
    assert.match(narrow, /\n\s+\.gx-reminder \.gx-btn-label\s*\{\s*display:\s*none;\s*\}/);
});
