const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../tools/lodestone-lookup/script.js'), 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function element() {
    const classes = new Set();
    return {
        value: '', textContent: '', dataset: {}, onclick: null,
        classList: {
            add: name => classes.add(name), remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
        }
    };
}
function response(data, status = 200) {
    return { ok: status === 200, status, statusText: 'Unavailable', json: async () => data };
}
function defaultResponse(url) {
    const match = url.pathname.match(/^\/character\/(\d+)$/);
    if (match) return response({ Character: { ID: match[1], Name: match[1], FreeCompany: { Name: { ID: `fc-${match[1]}` } } } });
    if (url.pathname.endsWith('/classjob')) return response({ ClassJobs: { owner: url.pathname.split('/')[2] } });
    if (url.pathname.endsWith('/achievements')) return response({ TotalAchievements: 10, marker: `${url.pathname}:${url.searchParams.get('page')}` });
    if (url.pathname.endsWith('/mounts')) return response({ Mounts: [{ Name: 'mount' }] });
    if (url.pathname.endsWith('/minions')) return response({ Minions: [{ Name: 'minion' }] });
    if (url.pathname.endsWith('/members')) return response({ Members: [], marker: `${url.pathname}:${url.searchParams.get('page')}` });
    return response({ FreeCompany: { Name: url.pathname.split('/')[2], ActiveMemberCount: 15 } });
}
function fixture(route = defaultResponse) {
    const calls = [];
    const context = vm.createContext({
        window: {}, AbortController,
        document: { addEventListener() {} },
        console: { log() {}, warn() {}, error() {} },
        SecurityUtils: { buildSafeURL: (base, params) => `${base}?${new URLSearchParams(params)}` },
        FF14Utils: { getI18nText: (_key, fallback) => fallback },
        fetch: (url, options) => {
            const parsed = new URL(url);
            calls.push({ url: parsed, signal: options.signal });
            return Promise.resolve().then(() => route(parsed, options));
        }
    });
    vm.runInContext(source, context);
    const lookup = vm.runInContext('Object.create(LodestoneCharacterLookup.prototype)', context);
    lookup.searchContext = null;
    lookup.elements = new Proxy({}, { get: (items, key) => items[key] ||= element() });
    lookup.elements.characterId.value = '111';
    lookup.elements.datacenterSelect.value = 'jp';
    const trace = { main: [], errors: [], achievements: [], mounts: [], minions: [], jobs: [], fc: [], members: [] };
    lookup.hideCharacterInfo = () => { trace.visible = false; };
    lookup.displayCharacterInfo = character => { trace.main.push(character.ID); trace.visible = true; };
    lookup.showError = error => { trace.errors.push(error); };
    lookup.hideError = () => {};
    lookup.displayAchievements = data => trace.achievements.push(data);
    lookup.displayMounts = data => trace.mounts.push(data);
    lookup.displayMinions = data => trace.minions.push(data);
    lookup.displayJobLevels = data => trace.jobs.push(data);
    lookup.displayTimestamp = () => {};
    lookup.displayFreeCompanyInfo = data => { trace.fc.push(data); lookup.elements.fcMemberCount.textContent = data.ActiveMemberCount; };
    lookup.displayFreeCompanyMembers = data => trace.members.push(data);
    lookup.switchTab = () => {};
    lookup.createOverview = () => { lookup.overviewValues = Object.fromEntries(['achievements', 'points', 'mounts', 'minions', 'fc'].map(key => [key, element()])); };
    return { lookup, trace, calls };
}

test('選用網路、HTTP、JSON 失敗互相隔離，主要角色與可用資料仍顯示', async () => {
    const { lookup, trace } = fixture(url => {
        if (url.pathname.endsWith('/mounts')) throw new TypeError('network offline');
        if (url.pathname.endsWith('/achievements')) return response({}, 503);
        if (url.pathname.endsWith('/classjob')) return { ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } };
        if (url.pathname.endsWith('/members')) throw new TypeError('members unavailable');
        return defaultResponse(url);
    });
    await lookup.searchCharacter();
    assert.deepEqual(trace.main, ['111']);
    assert.equal(trace.visible, true);
    assert.deepEqual(trace.errors, []);
    assert.equal(trace.minions.at(-1).Minions.length, 1);
    assert.equal(trace.fc.at(-1).Name, 'fc-111', 'members failure must not discard FC details');
    assert.equal(trace.jobs.length, 0);
    assert.equal(lookup.elements.searchBtn.disabled, false);
});

test('選用端點仍在等待時主要角色已可使用', async () => {
    const slow = deferred();
    const { lookup, trace } = fixture(url => url.pathname.endsWith('/mounts') ? slow.promise : defaultResponse(url));
    const pending = lookup.searchCharacter();
    await turn();
    assert.deepEqual(trace.main, ['111']);
    assert.equal(trace.visible, true);
    assert.equal(lookup.elements.searchBtn.disabled, false);
    slow.resolve(response({ Mounts: [] }));
    await pending;
});

test('舊角色的 body 延後完成，仍不能覆寫較新的角色', async () => {
    const oldBody = deferred();
    const { lookup, trace, calls } = fixture(url => url.pathname === '/character/111'
        ? { ok: true, json: () => oldBody.promise } : defaultResponse(url));
    const old = lookup.searchCharacter();
    await turn();
    lookup.elements.characterId.value = '222';
    await lookup.searchCharacter();
    oldBody.resolve({ Character: { ID: '111' } });
    await old;
    assert.deepEqual(trace.main, ['222']);
    assert.equal(calls[0].signal.aborted, true);
    assert.equal(lookup.currentFCId, 'fc-222');
    assert.equal(lookup.elements.searchBtn.disabled, false);
});

test('舊查詢錯誤及 finally 不得覆蓋新查詢的錯誤與 loading', async () => {
    const old = deferred(), current = deferred();
    const { lookup, trace } = fixture(url => url.pathname === '/character/111' ? old.promise
        : url.pathname === '/character/222' ? current.promise : defaultResponse(url));
    const first = lookup.searchCharacter();
    lookup.elements.characterId.value = '222';
    const second = lookup.searchCharacter();
    old.reject(new Error('old request failed'));
    await first;
    assert.deepEqual(trace.errors, []);
    assert.equal(lookup.elements.searchBtn.disabled, true);
    current.resolve(response({ Character: { ID: '222' } }));
    await second;
    assert.equal(lookup.elements.searchBtn.disabled, false);
});

test('舊公會、職業、成就、坐騎與會員頁回覆全部綁定原角色', async () => {
    const oldData = deferred();
    const { lookup, trace } = fixture(url => {
        if (url.pathname.startsWith('/character/111/') || url.pathname.startsWith('/freecompany/fc-111')) {
            return oldData.promise.then(() => defaultResponse(url));
        }
        return defaultResponse(url);
    });
    const old = lookup.searchCharacter();
    await turn();
    assert.deepEqual(trace.main, ['111']);
    lookup.elements.characterId.value = '222';
    await lookup.searchCharacter();
    const counts = Object.fromEntries(['achievements', 'mounts', 'minions', 'jobs', 'fc', 'members'].map(key => [key, trace[key].length]));
    oldData.resolve();
    await old;
    for (const [key, count] of Object.entries(counts)) assert.equal(trace[key].length, count, key);
    assert.equal(lookup.elements.fcName.textContent, 'fc-222');
    assert.equal(lookup.currentFCId, 'fc-222');
});

test('分頁使用查詢當下的 DC，較舊分頁不能覆寫最後選的頁數', async () => {
    const delayed = deferred();
    const { lookup, trace, calls } = fixture(url => url.searchParams.get('page') === '2'
        ? delayed.promise.then(() => defaultResponse(url)) : defaultResponse(url));
    await lookup.searchCharacter();
    lookup.elements.datacenterSelect.value = 'eu';
    const oldAchievements = lookup.loadAchievementsPage('111', 2);
    const oldMembers = lookup.loadFCMembersPage(2);
    await lookup.loadAchievementsPage('111', 3);
    await lookup.loadFCMembersPage(3);
    delayed.resolve();
    await Promise.all([oldAchievements, oldMembers]);
    assert.ok(trace.achievements.at(-1).marker.endsWith(':3'));
    assert.ok(trace.members.at(-1).marker.endsWith(':3'));
    assert.ok(calls.every(call => call.url.searchParams.get('dc') === 'jp'));
});

test('舊分頁回覆與舊分頁按鈕不能污染新角色', async () => {
    const delayed = deferred();
    const { lookup, trace, calls } = fixture(url => url.searchParams.get('page') === '2'
        ? delayed.promise.then(() => defaultResponse(url)) : defaultResponse(url));
    await lookup.searchCharacter();
    const oldContext = lookup.searchContext;
    const achievements = lookup.loadAchievementsPage('111', 2, oldContext);
    const members = lookup.loadFCMembersPage(2, oldContext, 'fc-111');
    await turn();
    lookup.elements.characterId.value = '222';
    await lookup.searchCharacter();
    const achievementsCount = trace.achievements.length, memberCount = trace.members.length;
    delayed.resolve();
    await Promise.all([achievements, members]);
    assert.equal(trace.achievements.length, achievementsCount);
    assert.equal(trace.members.length, memberCount);
    const callCount = calls.length;
    await lookup.loadAchievementsPage('111', 3, oldContext);
    await lookup.loadFCMembersPage(3, oldContext, 'fc-111');
    assert.equal(calls.length, callCount);
});

test('新查詢會清除舊公會、時間戳、特殊內容及分頁狀態', async () => {
    const { lookup } = fixture(url => url.pathname === '/character/222' ? response({ Character: { ID: '222' } }) : defaultResponse(url));
    await lookup.searchCharacter();
    lookup.elements.specialContent.textContent = 'old Eureka';
    lookup.elements.dataTimestamp.classList.remove('hidden');
    lookup.elements.fcEstateInfo.classList.remove('hidden');
    lookup.elements.fcMembersPagination.textContent = 'old pagination';
    lookup.elements.characterId.value = '222';
    await lookup.searchCharacter();
    assert.equal(lookup.currentFCId, null);
    assert.equal(lookup.elements.specialContent.textContent, '');
    assert.equal(lookup.elements.fcMembersPagination.textContent, '');
    assert.equal(lookup.elements.fcMemberCount.textContent, '');
    assert.equal(lookup.elements.fcName.onclick, null);
    assert.equal(lookup.elements.dataTimestamp.classList.contains('hidden'), true);
    assert.equal(lookup.elements.fcEstateInfo.classList.contains('hidden'), true);
});
