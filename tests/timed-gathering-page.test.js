const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { createGatheringPage } = require('./helpers/gathering-page.js');

const items = require('../data/timed-gathering.json').items;

// 頁面跑在 vm 裡，裡面建出來的物件和陣列，原型和測試端不同：比對前先轉成測試端的物件
const clone = (value) => JSON.parse(JSON.stringify(value));

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
    assert.equal(page.cards().length, items.length);
    assert.equal(app.elements.listTabs.children.length, 1);
    assert.equal(page.$('notificationToggle').disabled, true);
    assert.equal(page.$('testNotificationBtn').disabled, true);
    assert.equal(page.$('notificationStatus').textContent, '瀏覽器不支援通知');
    assert.doesNotThrow(() => app.notificationManager.testNotification());
    app.addItemToList(items[0]);
    assert.equal(app.listManager.getList('default').items.length, 1);
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
        assert.equal(app.filteredData.length, 1);
    }
    // 頁面一開始就只有這一筆，所以再確認沒有符合的字真的會濾掉它
    app.elements.searchInput.value = 'no-such-ore';
    app.applyFilters();
    assert.equal(app.filteredData.length, 0);
});

test('a type chip on a fresh page re-filters without throwing: fishing leaves its one record', async () => {
    const page = await createGatheringPage();
    const fishing = items.filter(item => item.type === 'fishing');
    assert.equal(fishing.length, 1);
    // 還沒碰過搜尋框就點篩選：頁面讀到的搜尋字是空字串
    const chip = page.$('typeFilters').querySelector('[data-type="fishing"]');
    chip.click();
    assert.ok(chip.classList.contains('active'));
    assert.equal(page.app.filteredData.length, 1);
    assert.deepEqual(page.cards().map(card => card.dataset.itemId), [fishing[0].id]);
    chip.click();
    assert.equal(page.app.filteredData.length, items.length);
    assert.equal(page.cards().length, items.length);
});

test('generating a macro fills the macro box and scrolls to it without throwing', async () => {
    const page = await createGatheringPage();
    page.app.addItemToList(items[0]);
    page.$('generateMacroBtn').click();
    assert.equal(page.$('macroText').value, `/alarm clear\n/alarm "${items[0].macroFormat}" et rp 0000 1 se04 mute`);
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
    assert.equal(page.cards().length, items.length);
    assert.ok(page.consoleErrors.length > 0);
    assert.ok(page.consoleErrors.every(entry => entry.includes('SecurityError')), page.consoleErrors.join('\n'));
    // console.error 與 console.warn 記下參數用空白接起來的字串；console.log 什麼都不留
    page.window.console.warn('careful', 1);
    page.window.console.log('quiet');
    assert.equal(page.consoleErrors.at(-1), 'careful 1');
    assert.deepEqual(printed.map(spy => spy.mock.callCount()), [0, 0, 0]);
});
