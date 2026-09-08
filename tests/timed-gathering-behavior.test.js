const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const items = require('../data/timed-gathering.json').items;
const root = path.resolve(__dirname, '..');

// Keep browser globals isolated while executing the real controllers and modules.
function createEnvironment() {
    const nodes = [];
    function element(tag = 'div') {
        const node = {
            tagName: tag, children: [], dataset: {}, attributes: {}, style: {}, value: '', className: '',
            appendChild(child) { this.children.push(child); return child; },
            removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
            get firstChild() { return this.children[0]; },
            set textContent(value) { this.text = String(value); this.children = []; },
            get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            getAttribute(name) { return this.attributes[name]; },
            addEventListener() {}, scrollIntoView() {}, select() {}, focus() {},
            querySelectorAll(selector) {
                const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
                return descendants.filter(child => selector === '*' || (selector.startsWith('.')
                    ? selector.slice(1).split('.').every(name => child.className.split(' ').includes(name))
                    : child.tagName === selector));
            },
            querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        };
        node.classList = {
            add(...names) { node.className = [...new Set([...node.className.split(' ').filter(Boolean), ...names])].join(' '); },
            remove(...names) { node.className = node.className.split(' ').filter(name => !names.includes(name)).join(' '); },
            toggle(name, force) { const enabled = force ?? !node.className.split(' ').includes(name); this[enabled ? 'add' : 'remove'](name); return enabled; }
        };
        nodes.push(node);
        return node;
    }
    const storage = new Map();
    const toasts = [];
    const context = vm.createContext({
        console: { log() {}, error() {}, warn() {} },
        document: {
            createElement: element,
            createTextNode(text) { const node = element('#text'); node.textContent = text; return node; },
            getElementById(id) { let node = nodes.find(candidate => candidate.id === id); if (!node) { node = element(); node.id = id; } return node; },
            querySelectorAll() { return []; }, addEventListener() {}
        },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        FF14Utils: { getI18nText: (key, fallback, values = {}) => fallback.replace(/\{(\w+)\}/g, (_, name) => values[name]), showToast: (message, type) => toasts.push({ message, type }) },
        i18n: { getCurrentLanguage: () => 'zh', onLanguageChange() {} },
        ModalManager: class { show() {} hide() {} },
        FileReader: class { readAsText(text) { this.onload({ target: { result: text } }); } },
        fetch: async () => ({ ok: true, text: async () => JSON.stringify({ items }) }),
        setInterval: () => 1, clearInterval() {}, setTimeout() {}, clearTimeout() {}
    });
    context.window = context;
    for (const file of ['assets/js/security-utils.js', ...['time-calculator', 'list-manager', 'notification-manager', 'macro-exporter', 'search-filter', 'script'].map(name => `tools/timed-gathering/${name}.js`)]) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
    const classes = vm.runInContext('({ TimeCalculator, ListManager, NotificationManager, MacroExporter, SearchFilter, TimedGatheringManager })', context);
    return { context, ...classes, storage, toasts };
}

async function initializeController(env) {
    const app = vm.runInContext('new (class extends TimedGatheringManager { initialize() { this.ready = super.initialize(); return this.ready; } })()', env.context);
    await app.ready;
    return app;
}

const clone = value => JSON.parse(JSON.stringify(value));

test('a real exported backup round-trips through the file import controller, including all item formats', async () => {
    const env = createEnvironment();
    const source = new env.ListManager();
    source.renameList('default', 'A&B');
    for (const item of items) assert.equal(source.addToList('default', item).success, true);
    const backup = JSON.stringify(source.exportLists());
    const app = await initializeController(env);
    app.importFile(backup);
    const imported = app.listManager.getAllLists().find(list => list.name === 'A&B (1)');
    assert.ok(imported);
    assert.deepEqual(clone(imported.items), clone(source.getList('default').items));
    assert.ok(new env.ListManager().getList(imported.id), 'the imported list survives a reload');
    assert.equal(env.toasts.at(-1).type, 'success');
});

test('nested invalid backups and capacity overflow cannot partially modify lists or storage', () => {
    const env = createEnvironment();
    const manager = new env.ListManager();
    manager.addToList('default', items[0]);
    const original = JSON.stringify(manager.exportLists());
    const stored = env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY);
    const mutations = [
        data => { data.lists = []; },
        data => { data.lists.default = null; },
        data => { data.lists.default.items = {}; },
        data => { data.lists.default.name = ''; },
        data => { data.lists.default.id = 'other'; },
        data => { data.lists.default.items[0].time = '99:00'; },
        data => { data.lists.default.items[0].duration = '55'; },
        data => { data.lists.default.items[0].name = {}; },
        data => { data.lists.default.items.push(clone(data.lists.default.items[0])); },
        data => { data.lists.default.items = Array.from({ length: 101 }, (_, i) => ({ ...items[0], id: `item_${i}` })); },
        data => { data.lists.bad = { id: 'bad', name: 'Bad', items: [null] }; },
        data => { data.lists = JSON.parse('{"__proto__":{"id":"__proto__","name":"Bad","items":[]}}'); }
    ];
    for (const mutate of mutations) {
        const data = JSON.parse(original);
        mutate(data);
        assert.equal(manager.importLists(data).success, false);
        assert.deepEqual(clone(manager.exportLists()).lists, JSON.parse(original).lists);
        assert.equal(env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY), stored);
    }
    const full = { version: '1.0', lists: {} };
    for (let i = 0; i < 10; i++) full.lists[`list_${i}`] = { id: `list_${i}`, name: `List ${i}`, items: [] };
    assert.equal(manager.importLists(full).success, false);
    assert.equal(manager.getAllLists().length, 1);
});

test('failed storage writes leave an import unapplied, and malformed saved backups remain recoverable', () => {
    const env = createEnvironment();
    const manager = new env.ListManager();
    const before = clone(manager.exportLists()).lists;
    env.context.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
    assert.equal(manager.importLists(manager.exportLists()).success, false);
    assert.deepEqual(clone(manager.exportLists()).lists, before);
    env.storage.set(env.ListManager.CONSTANTS.STORAGE_KEY, '{broken');
    const recovered = new env.ListManager();
    assert.equal(recovered.getAllLists().length, 1);
    assert.equal(env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY), '{broken');
});

test('a full ten-list backup can restore into a fresh browser without losing a list to the placeholder', () => {
    const sourceEnv = createEnvironment();
    const source = new sourceEnv.ListManager();
    for (let i = 1; i < 10; i++) source.createList(`List ${i}`);
    for (const list of source.getAllLists()) source.addToList(list.id, items[0]);
    const destinationEnv = createEnvironment();
    const destination = new destinationEnv.ListManager();
    assert.equal(destination.importLists(clone(source.exportLists())).success, true);
    assert.equal(destination.getAllLists().length, 10);
    for (const list of source.getAllLists()) {
        assert.equal(destination.getList(list.id).name, list.name);
        assert.deepEqual(clone(destination.getList(list.id).items), clone(list.items));
    }
});

test('legacy import collision names normalize without losing saved lists, items or valid names', () => {
    const env = createEnvironment();
    const source = new env.ListManager();
    source.addToList('default', items[0]);
    const originalList = clone(source.exportLists()).lists.default;
    const base = 'A'.repeat(50);
    const boundedCollision = `${'A'.repeat(46)} (1)`;
    const names = [base, `${base} (1)`, boundedCollision, `${base} (1) (1)`];
    const backup = { version: '1.0', lists: Object.fromEntries(names.map((name, index) => [
        `legacy_${index}`, { ...clone(originalList), id: `legacy_${index}`, name }
    ])) };
    const stored = JSON.stringify(backup);
    env.storage.set(env.ListManager.CONSTANTS.STORAGE_KEY, stored);
    const loaded = new env.ListManager();
    assert.equal(loaded.storageLoadFailed, false);
    assert.equal(loaded.getAllLists().length, names.length);
    assert.equal(loaded.getList('legacy_0').name, base);
    assert.equal(loaded.getList('legacy_2').name, boundedCollision);
    assert.equal(new Set(loaded.getAllLists().map(list => list.name)).size, names.length);
    for (const list of loaded.getAllLists()) {
        assert.ok(list.name.length <= 50);
        assert.deepEqual(clone(list.items), originalList.items);
    }
    assert.equal(env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY), stored, 'loading does not overwrite the original backup');
    loaded.addToList('legacy_1', items[1]);
    const reloaded = new env.ListManager();
    assert.equal(reloaded.getAllLists().length, names.length);
    assert.equal(reloaded.getList('legacy_1').items.length, 2);
    const fresh = new (createEnvironment().ListManager)();
    assert.equal(fresh.importLists(backup).success, true);
    assert.equal(fresh.getAllLists().length, names.length);
});

test('an untouched default remains replaceable after language changes and reloads, including legacy storage', () => {
    const full = { version: '1.0', lists: {} };
    for (let i = 0; i < 10; i++) full.lists[`list_${i}`] = { id: `list_${i}`, name: `List ${i}`, items: [] };
    for (const defaultName of ['預設清單', 'デフォルトリスト', 'Default List']) {
        for (const legacy of [false, true]) {
            const env = createEnvironment();
            const translate = env.context.FF14Utils.getI18nText;
            env.context.FF14Utils.getI18nText = (key, ...args) => key === 'defaultListName' ? defaultName : translate(key, ...args);
            const fresh = new env.ListManager();
            if (legacy) {
                const stored = clone(fresh.exportLists());
                delete stored.lists.default.isPlaceholder;
                env.storage.set(env.ListManager.CONSTANTS.STORAGE_KEY, JSON.stringify(stored));
            }
            env.context.FF14Utils.getI18nText = (key, ...args) => key === 'defaultListName' ? 'Changed language' : translate(key, ...args);
            const reloaded = new env.ListManager();
            assert.equal(reloaded.importLists(full).success, true, `${defaultName}, legacy=${legacy}`);
            assert.equal(reloaded.getAllLists().length, 10);
        }
    }
});

test('a renamed or previously used default list is preserved even when it is empty again', () => {
    const full = { version: '1.0', lists: {} };
    for (let i = 0; i < 10; i++) full.lists[`list_${i}`] = { id: `list_${i}`, name: `List ${i}`, items: [] };
    for (const edit of [
        manager => { manager.renameList('default', 'My list'); manager.renameList('default', 'Default List'); },
        manager => { manager.addToList('default', items[0]); manager.clearList('default'); }
    ]) {
        const env = createEnvironment();
        edit(new env.ListManager());
        const reloaded = new env.ListManager();
        const before = env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY);
        assert.equal(reloaded.importLists(full).success, false);
        assert.equal(reloaded.getAllLists().length, 1);
        assert.equal(env.storage.get(env.ListManager.CONSTANTS.STORAGE_KEY), before);
    }
});

test('without Notification API the complete controller still loads data and lists', async () => {
    const env = createEnvironment();
    const app = await initializeController(env);
    assert.equal(app.data.length, items.length);
    assert.equal(app.elements.itemsContainer.children.length, items.length);
    assert.equal(app.elements.listTabs.children.length, 1);
    assert.equal(env.context.document.getElementById('notificationToggle').disabled, true);
    assert.equal(env.context.document.getElementById('testNotificationBtn').disabled, true);
    assert.equal(env.context.document.getElementById('notificationStatus').textContent, '瀏覽器不支援通知');
    assert.doesNotThrow(() => app.notificationManager.testNotification());
    app.addItemToList(items[0]);
    assert.equal(app.listManager.getList('default').items.length, 1);
});

test('ranged and all-day schedules agree across notification windows, sorting and alarm export', () => {
    const env = createEnvironment();
    const exporter = new env.MacroExporter();
    const notification = new env.NotificationManager();
    const at = (hours, minutes = 0) => ({ hours, minutes, seconds: 0 });
    const crossMidnight = { time: '22:00-00:00', duration: 55 };
    assert.equal(notification.isInGatheringWindow(crossMidnight, at(23, 59)), true);
    assert.equal(notification.isInGatheringWindow(crossMidnight, at(0)), false);
    assert.equal(notification.isInGatheringWindow({ time: '22:00-02:00' }, at(1)), true);
    assert.equal(notification.isInGatheringWindow({ time: '全天', duration: 1440 }, at(13)), true);
    assert.equal(notification.getTimeUntilGathering({ time: '全天', duration: 1440 }, at(13)), -1);
    const selected = items.filter(item => ['mining_lightning_quartz', 'botany_iris_root', 'fishing_purple_tongue'].includes(item.id));
    const macro = exporter.generate([...selected].reverse());
    assert.equal(macro.split('\n')[0], '/alarm clear');
    assert.match(macro.split('\n')[1], /et rp 0000 /);
    assert.match(macro.split('\n')[2], /et rp 1600 /);
    assert.equal(macro.split('\n').length, 3);
    for (const generate of ['generate', 'generateSimplified']) {
        assert.equal(exporter[generate]([{ ...items[0], time: '全天', duration: 1440 }]), '');
        assert.equal(exporter[generate]([{ ...items[0], time: '99:00' }]), '');
    }
    for (const time of ['25:00', '12:60', '22:00-24:01', 'bad']) assert.equal(env.TimeCalculator.parseSchedule(time), null);
    assert.equal(new env.SearchFilter().parseTime('16:00-20:00'), 960);
});

test('list names and search preserve raw ampersands, apostrophes and literal markup as text', async () => {
    const env = createEnvironment();
    const app = await initializeController(env);
    app.showNewListDialog();
    env.context.document.getElementById('newListName').value = 'A&B';
    app.elements.dialogConfirm.onclick();
    const created = app.listManager.getList(app.currentListId);
    assert.equal(created.name, 'A&B');
    assert.equal(app.elements.currentListName.textContent, 'A&B');
    app.showRenameListDialog();
    env.context.document.getElementById('renameListInput').value = "A&B's <plan>";
    app.elements.dialogConfirm.onclick();
    assert.equal(created.name, "A&B's <plan>");
    assert.equal(app.currentListId, created.id);
    assert.equal(app.elements.currentListName.textContent, "A&B's <plan>");
    assert.equal(app.elements.currentListName.children.length, 0);
    app.data = [{ ...items[0], nameEn: "A&B's ore" }];
    for (const query of ["B's", 'A&B']) {
        app.elements.searchInput.value = query;
        app.applyFilters();
        assert.equal(app.filteredData.length, 1);
    }
});
