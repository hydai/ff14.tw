const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const { createFakeDom } = require('./helpers/fake-dom.js');
const { translationKeySet } = require('./helpers/translation-parsers.js');

const TOKEN = 'a'.repeat(64);
const sample = { id: 'g8_test_1', level: 'g8', zone: 'Test', coords: { x: 10, y: 20 } };
const member = { id: 'creator', nickname: 'Creator', isCreator: true };
const newMember = { id: 'joiner', nickname: 'Joiner' };
const room = (maps = [], members = [member], revision = 0) => ({ roomCode: 'ABC123', creatorId: member.id, members, treasureMaps: maps, revision, lastActivityAt: new Date().toISOString() });

// lang：getCurrentLanguage() 回的介面語言（用 setLang() 在測試中途換）；stored：開始時 localStorage 裡已經有的 key／值（字串）
function setup(respond, { lang = 'zh', stored = {} } = {}) {
    const storage = new Map(Object.entries(stored)), requests = [], toasts = [], historyCalls = [];
    const location = new URL('http://localhost:8765/tools/treasure-map-finder/');
    const element = () => ({ textContent: '', classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {} });
    // pushState／replaceState：記下呼叫，換掉 history.state 與 location（同瀏覽器）
    const history = { state: null };
    for (const method of ['pushState', 'replaceState']) {
        history[method] = (state, title, href) => {
            historyCalls.push({ method, state, href: String(href) });
            history.state = state;
            location.href = String(href);
        };
    }
    const context = vm.createContext({
        window: { location, history, i18n: { getCurrentLanguage: () => lang, onLanguageChange() {} } },
        document: { addEventListener() {}, getElementById: () => element(), querySelectorAll: () => [] },
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        console: { log() {}, warn() {}, error() {} },
        FF14Utils: { getI18nText: (key, fallback, values = {}) => fallback.replace(/\{(\w+)\}/g, (_, name) => values[name]), showToast: message => toasts.push(message) },
        URL, URLSearchParams, crypto: webcrypto, ModalManager: class {},
        confirm: () => false, setTimeout, clearTimeout,
        fetch: async (url, options = {}) => {
            const request = { url, ...options, body: options.body ? JSON.parse(options.body) : undefined };
            requests.push(request);
            const result = await respond(request);
            return new Response(JSON.stringify(result.body), { status: result.status || 200 });
        }
    });
    // party-names.js 要排在 room-collaboration.js 前面（和 index.html 的順序一樣）
    for (const file of ['assets/js/security-utils.js', 'tools/treasure-map-finder/coordinate-utils.js', 'tools/treasure-map-finder/list-manager.js', 'tools/treasure-map-finder/party-names.js', 'tools/treasure-map-finder/room-map-sync.js', 'tools/treasure-map-finder/room-collaboration.js', 'tools/treasure-map-finder/list-share.js', 'tools/treasure-map-finder/script.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`
        globalThis.originalInit = RoomCollaboration.prototype.init;
        RoomCollaboration.prototype.init = function () {};
        globalThis.finder = Object.create(TreasureMapFinder.prototype);
        finder.listManager = new ListManager();
        finder.maps = [];
        finder.ready = Promise.resolve();
        finder.updateListCount = finder.updateCardButtons = finder.renderMyList = () => {};
        globalThis.client = new RoomCollaboration(finder);
        finder.setRoomCollaboration(client);
        client.updateRoomUI = () => {};
        client.startPolling = () => {};
    `, context);
    context.finder.maps = [sample];
    return { ...context, context, storage, requests, toasts, historyCalls, setLang: value => { lang = value; } };
}

test('creating a room uses ListManager, atomically submits retained maps and persists private credentials', async () => {
    const state = setup(request => ({ body: { ...room(request.body.initialMaps), memberId: member.id, memberToken: TOKEN } }));
    state.finder.listManager.add(sample);
    await state.client.createRoom();
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].body.initialMaps[0].id, sample.id);
    assert.equal(state.requests[0].headers['Content-Type'], 'application/json');
    assert.match(state.requests[0].body.clientRequestId, /^[a-f0-9-]{36}$/);
    assert.equal(state.client.currentUser.id, member.id);
    assert.equal(state.client.memberToken, TOKEN);
    const saved = JSON.parse(state.storage.get('ff14tw_current_room'));
    assert.equal(saved.memberToken, TOKEN);
    assert.equal(state.client.currentRoom.memberToken, undefined);
    assert.equal(state.finder.listManager.getLength(), 1);
});

test('joining uses the returned member credential and subsequent edits send authenticated operations', async () => {
    const state = setup(request => {
        if (request.url.endsWith('/join')) return { body: { room: room([], [member, newMember]), newMember, memberId: newMember.id, memberToken: TOKEN } };
        if (request.method === 'PUT') return { body: room([request.body.operations[0].map], [member, newMember], 1) };
        return { body: room() };
    });
    await state.client.joinRoom('ABC123');
    assert.equal(state.client.currentUser.id, newMember.id);
    state.finder.listManager.add(sample);
    await state.finder.syncToRoom();
    const update = state.requests.find(request => request.method === 'PUT');
    assert.equal(update.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(update.headers['Content-Type'], 'application/json');
    assert.equal(update.body.operations[0].type, 'add');
    assert.equal(update.body.operations[0].map.id, sample.id);
    assert.equal(update.body.treasureMaps, undefined);
    assert.equal(state.client.currentRoom.revision, 1);
});

test('polling GETs have no JSON body or headers that require a CORS preflight', async () => {
    const state = setup(() => ({ body: room() }));
    state.client.adoptSession(room(), member, TOKEN);
    await state.client.poll();
    await state.client.poll();
    assert.equal(state.requests.length, 2);
    for (const request of state.requests) {
        assert.equal(request.method, 'GET');
        assert.equal(request.body, undefined);
        assert.equal(request.headers['Content-Type'], undefined);
        assert.equal(request.headers.Authorization, undefined);
    }
});

const importMaps = (count, prefix = 'import') => Array.from({ length: count }, (_, index) => ({ ...sample, id: `${prefix}_${index}` }));

test('oversized room imports fail before changing maps, storage or sending operations', async () => {
    for (const [merge, initialCount, incomingCount] of [[false, 1, 9], [false, 8, 17], [true, 8, 1]]) {
        const state = setup(() => ({ status: 400, body: { code: 'MAP_LIMIT', error: 'Map limit' } }));
        const initial = importMaps(initialCount, 'initial');
        state.client.adoptSession(room(initial.map(map => state.finder.toRoomMap(map))), member, TOKEN);
        const before = JSON.stringify(state.finder.listManager.getList());
        const stored = [...state.storage];
        const result = await state.finder.importFromText(JSON.stringify({ maps: importMaps(incomingCount) }), { merge });
        assert.equal(state.requests.length, 0);
        assert.equal(JSON.stringify(state.finder.listManager.getList()), before);
        assert.deepEqual([...state.storage], stored);
        assert.equal(state.client.mapSync.pending.length, 0);
        // 失敗的原因交給匯入對話框顯示，不跳 toast
        assert.equal(result.success, false);
        assert.match(result.message, /清單已滿/);
        assert.equal(state.toasts.length, 0);
    }
});

test('room-incompatible imports are rejected atomically before replacing or merging local maps', async () => {
    for (const merge of [false, true]) {
        for (const invalid of [
            { id: 'bad id' }, { id: 'bad/id' }, { id: '寶圖' },
            { level: 'g0' }, { level: 'g19' }, { level: 'G8' }, { zone: '   ' }
        ]) {
            const state = setup(() => ({ status: 400, body: { code: 'INVALID_REQUEST', error: 'Invalid map' } }));
            state.client.adoptSession(room([state.finder.toRoomMap(sample)]), member, TOKEN);
            const before = JSON.stringify(state.finder.listManager.getList());
            const stored = [...state.storage];
            const result = await state.finder.importFromText(JSON.stringify({ maps: [
                ...importMaps(1), { ...sample, id: 'invalid', ...invalid }
            ] }), { merge });
            assert.equal(state.requests.length, 0, JSON.stringify(invalid));
            assert.equal(JSON.stringify(state.finder.listManager.getList()), before);
            assert.deepEqual([...state.storage], stored);
            assert.equal(state.client.mapSync.pending.length, 0);
            assert.equal(result.success, false);
            assert.match(result.message, /不支援/);
            assert.equal(state.toasts.length, 0);
        }
    }
});

test('room imports deduplicate before capacity checks and a full replacement uses at most sixteen operations', async () => {
    for (const merge of [false, true]) {
        const initial = importMaps(8, 'initial');
        const incoming = merge ? initial : importMaps(8);
        const state = setup(() => ({ body: room(incoming.map(map => state.finder.toRoomMap(map)), [member], 1) }));
        state.client.adoptSession(room(initial.map(map => state.finder.toRoomMap(map))), member, TOKEN);
        await state.finder.importFromText(JSON.stringify({ maps: [...incoming, incoming[0]] }), { merge });
        assert.equal(state.finder.listManager.getLength(), 8);
        assert.deepEqual(Array.from(state.finder.listManager.getList(), map => map.id), incoming.map(map => map.id));
        assert.equal(state.requests.length, merge ? 0 : 1);
        if (!merge) {
            assert.equal(state.requests[0].body.operations.length, 16);
            assert.equal(state.requests[0].body.operations.filter(operation => operation.type === 'remove').length, 8);
            assert.equal(state.requests[0].body.operations.filter(operation => operation.type === 'add').length, 8);
        }
        assert.match(state.toasts.at(-1), /匯入/);
    }
});

test('an import exceeding the operation limit leaves concurrent pending edits intact', async () => {
    const state = setup(() => { throw new Error('An oversized import must not be sent'); });
    const initial = importMaps(8, 'initial');
    const pending = [{ clientRequestId: 'pending', operations: [{ type: 'add', map: state.finder.toRoomMap(sample) }] }];
    // A remote addition can fill the room while a local addition still awaits acknowledgement.
    state.client.adoptSession(room(initial.map(map => state.finder.toRoomMap(map))), member, TOKEN, pending);
    const before = JSON.stringify(state.finder.listManager.getList());
    const stored = [...state.storage];
    const result = await state.finder.importFromText(JSON.stringify({ maps: importMaps(8) }), { merge: false });
    assert.equal(state.requests.length, 0);
    assert.equal(JSON.stringify(state.finder.listManager.getList()), before);
    assert.deepEqual([...state.storage], stored);
    assert.deepEqual(state.client.mapSync.pending, pending);
    assert.equal(result.success, false);
    assert.match(result.message, /等待隊伍同步/);
    assert.equal(state.toasts.length, 0);
});

test('personal imports can exceed the room limit; when storage rejects the write the import still applies in memory', async () => {
    const state = setup(() => { throw new Error('Personal imports must not call the API'); });
    await state.finder.importFromText(JSON.stringify({ maps: importMaps(17) }), { merge: false });
    assert.equal(state.finder.listManager.getLength(), 17);
    const stored = [...state.storage];
    state.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
    await state.finder.importFromText(JSON.stringify({ maps: [sample] }), { merge: false });
    assert.deepEqual(Array.from(state.finder.listManager.getList(), map => map.id), [sample.id]);
    assert.deepEqual([...state.storage], stored);
    assert.equal(state.requests.length, 0);
    assert.match(state.toasts.at(-1), /瀏覽器不允許儲存資料/);
});

test('failed room creation preserves the personal list and retries the same request ID', async () => {
    let calls = 0;
    const state = setup(request => {
        if (++calls === 1) throw new TypeError('Connection lost');
        return { body: { ...room(request.body.initialMaps), memberId: member.id, memberToken: TOKEN } };
    });
    state.finder.listManager.add(sample);
    await state.client.createRoom();
    assert.equal(state.finder.listManager.getLength(), 1);
    assert.equal(state.client.currentRoom, null);
    await state.client.createRoom();
    assert.equal(state.requests[0].body.clientRequestId, state.requests[1].body.clientRequestId);
});

test('an older session poll cannot reconnect a room after leaving', async () => {
    let resolve;
    const delayed = new Promise(done => { resolve = done; });
    const state = setup(() => delayed);
    state.client.adoptSession(room(), member, TOKEN);
    const polling = state.client.poll();
    state.client.forceLeaveRoom();
    resolve({ body: room([], [member], 1) });
    await polling;
    assert.equal(state.client.currentRoom, null);
    assert.equal(state.storage.has('ff14tw_current_room'), false);
});

test('legacy shared maps are retained locally without exchanging a public ID for a token', async () => {
    const shared = { id: 'unknown_old_map', type: 'g8', x: 20, y: 25, zone: 'Old zone' };
    const state = setup(() => ({ body: { ...room([shared]), readOnly: true, legacy: true } }));
    state.finder.listManager.add(sample);
    await state.client.joinRoom('ABC123');
    assert.deepEqual(Array.from(state.finder.listManager.getList(), map => map.id), [sample.id, shared.id]);
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].method, 'GET');
    assert.equal(state.client.memberToken, null);
});

test('restoration waits for the catalogue before reading the saved room', async () => {
    const state = setup(() => ({ body: room() }));
    let resolve;
    state.finder.ready = new Promise(done => { resolve = done; });
    const events = [];
    state.client.setupEventListeners = () => events.push('events');
    state.client.checkExistingRoom = () => events.push('restore');
    state.client.loadUserPreferences = () => {};
    const init = state.originalInit.call(state.client);
    assert.deepEqual(events, []);
    resolve();
    await init;
    assert.deepEqual(events, ['events', 'restore']);
});

test('ready settles only after the saved room is restored or auto-joined (the shared-link dialog waits for it)', async () => {
    const state = setup(() => ({ body: room() }));
    const RoomCollaboration = vm.runInContext('RoomCollaboration', state.context);
    const events = [];
    let finishRestore;
    RoomCollaboration.prototype.init = state.originalInit;
    RoomCollaboration.prototype.setupEventListeners = () => events.push('events');
    RoomCollaboration.prototype.checkExistingRoom = () => new Promise(resolve => {
        finishRestore = () => { events.push('restored'); resolve(); };
    });
    const client = new RoomCollaboration(state.finder);
    let settled = false;
    client.ready.then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([events, settled], [['events'], false]);
    finishRestore();
    await client.ready;
    assert.deepEqual([events, settled], [['events', 'restored'], true]);
});

test('editing is blocked during connection so the initial room response cannot erase a local edit', async () => {
    let resolve;
    const delayed = new Promise(done => { resolve = done; });
    const state = setup(() => delayed);
    const connecting = state.client.createRoom();
    assert.equal(state.client.isConnecting, true);
    state.finder.toggleMapInList(sample);
    assert.equal(state.finder.listManager.getLength(), 0);
    resolve({ body: { ...room(), memberId: member.id, memberToken: TOKEN } });
    await connecting;
    assert.equal(state.client.isConnecting, false);
});

test('malformed pending session records are rejected without throwing or modifying local maps', () => {
    const state = setup(() => ({ body: room() }));
    state.client.adoptSession(room(), member, TOKEN);
    const saved = JSON.parse(state.storage.get('ff14tw_current_room'));
    for (const corrupted of [
        { ...saved, pendingMapOperations: [null] },
        { ...saved, pendingMapOperations: [{ clientRequestId: 'id', operations: [null] }] },
        { ...saved, members: [null] }
    ]) assert.equal(state.client.isRoomValid(corrupted), false);
});

test('a leave acknowledgement racing a poll still clears the list and closes the dialog', async () => {
    let resolve;
    const delayed = new Promise(done => { resolve = done; });
    const state = setup(() => delayed);
    state.client.adoptSession(room([{ id: sample.id, type: sample.level, zone: sample.zone, x: 10, y: 20 }]), member, TOKEN);
    const closed = [];
    state.client.hideModal = name => closed.push(name);
    const leaving = state.client.leaveRoom(false);
    await new Promise(done => setImmediate(done));
    // The server has removed this member, but POST's acknowledgement is still in transit.
    state.client.mapSync.receive(room([], [], 1));
    resolve({ body: { message: 'Room deleted' } });
    await leaving;
    assert.equal(state.finder.listManager.getLength(), 0);
    assert.deepEqual(closed, ['leaveRoom']);
    assert.equal(state.client.currentRoom, null);
    assert.equal(state.client.isLeaving, false);
});

test('leaving waits for pending edits to sync and retains the session for retry on transient failures', async () => {
    for (const keepList of [false, true]) {
        for (const failure of ['transport', 429, 503]) {
            let attempts = 0;
            const state = setup(request => {
                if (request.method === 'PUT') {
                    if (++attempts === 1) {
                        if (failure === 'transport') throw new TypeError('Failed to fetch');
                        return { status: failure, body: { error: 'Please retry' } };
                    }
                    return { body: room([state.finder.toRoomMap(sample)], [member], 1) };
                }
                assert.equal(request.method, 'POST');
                assert.equal(state.client.mapSync.pending.length, 0, 'leave only after the edit acknowledgement');
                return { body: { message: 'Room deleted' } };
            });
            const pending = [{ clientRequestId: webcrypto.randomUUID(), operations: [{ type: 'add', map: state.finder.toRoomMap(sample) }] }];
            state.client.adoptSession(room(), member, TOKEN, pending);
            const closed = [];
            let pollingRestarts = 0;
            state.client.hideModal = name => closed.push(name);
            state.client.startPolling = () => { pollingRestarts++; };
            await state.client.leaveRoom(keepList);
            assert.deepEqual(state.requests.map(request => request.method), ['PUT']);
            assert.equal(state.client.currentRoom.roomCode, 'ABC123');
            assert.equal(state.client.memberToken, TOKEN);
            assert.equal(state.client.mapSync.pending.length, 1);
            assert.equal(state.finder.listManager.getList()[0].id, sample.id);
            assert.equal(JSON.parse(state.storage.get('ff14tw_current_room')).pendingMapOperations[0].clientRequestId, pending[0].clientRequestId);
            assert.deepEqual(closed, []);
            assert.equal(state.client.isLeaving, false);
            assert.equal(state.client.isConnecting, false);
            assert.equal(pollingRestarts, 1);
            assert.match(state.toasts.at(-1), /尚未同步完成/);

            await state.client.leaveRoom(keepList);
            assert.deepEqual(state.requests.map(request => request.method), ['PUT', 'PUT', 'POST']);
            assert.equal(state.requests[1].body.clientRequestId, state.requests[0].body.clientRequestId);
            assert.equal(state.client.currentRoom, null);
            assert.equal(state.storage.has('ff14tw_current_room'), false);
            assert.equal(state.finder.listManager.getLength(), keepList ? 1 : 0);
            assert.deepEqual(closed, ['leaveRoom']);
        }
    }
});

for (const action of ['create', 'join']) {
    test(`${action} retries preserve new personal edits while replaying an immutable initial request`, async () => {
        let attempts = 0;
        const owner = action === 'create' ? member : newMember;
        let serverRoom;
        const state = setup(request => {
            if (request.method === 'GET') return { body: serverRoom || room() };
            if (request.method === 'PUT') {
                for (const op of request.body.operations) {
                    if (op.type === 'remove') serverRoom.treasureMaps = serverRoom.treasureMaps.filter(map => map.id !== op.id);
                    else serverRoom.treasureMaps.push(op.map);
                }
                serverRoom.revision++;
                return { body: serverRoom };
            }
            if (++attempts === 1) {
                serverRoom = room(request.body.initialMaps.map(map => ({ ...map, addedBy: owner.id })), [member, newMember]);
                throw new TypeError('Response lost after commit');
            }
            return { body: action === 'create'
                ? { ...serverRoom, memberId: owner.id, memberToken: TOKEN }
                : { room: serverRoom, newMember: owner, memberToken: TOKEN } };
        });
        const connect = () => action === 'create' ? state.client.createRoom() : state.client.joinRoom('ABC123');
        state.finder.listManager.add(sample);
        await connect();
        const second = { ...sample, id: 'second_map' };
        state.finder.maps.push(second);
        state.finder.listManager.add(second);
        await connect();
        const connections = state.requests.filter(request => request.method === 'POST');
        assert.deepEqual(connections[0].body, connections[1].body);
        assert.deepEqual(Array.from(state.finder.listManager.getList(), map => map.id), [sample.id, second.id]);
        assert.equal(serverRoom.treasureMaps.length, 2);
        assert.equal(attempts, 2);
    });
}

test('connection recovery does not erase a personal edit when another member fills the room first', async () => {
    let attempts = 0;
    const state = setup(request => {
        if (request.method === 'PUT') return { status: 400, body: { code: 'MAP_LIMIT', error: 'Room is full' } };
        if (++attempts === 1) throw new TypeError('Response lost');
        return { body: { ...room(), memberId: member.id, memberToken: TOKEN } };
    });
    await state.client.createRoom();
    state.finder.listManager.add(sample);
    await state.client.createRoom();
    assert.equal(state.client.currentRoom, null);
    assert.equal(state.finder.listManager.getList()[0].id, sample.id);
    assert.equal(state.storage.has('ff14tw_current_room'), false);
});

test('a full-room join retry replaces its own initial map while preserving the other seven maps', async () => {
    const others = Array.from({ length: 7 }, (_, index) => ({
        id: `other_${index}`, type: 'g8', zone: 'Test', x: 10, y: 20,
        addedBy: member.id, addedAt: '2026-09-08T00:00:00.000Z'
    }));
    const replacement = { ...sample, id: 'replacement_map' };
    let serverRoom = room([...others]);
    let attempts = 0;
    const state = setup(request => {
        if (request.method === 'GET') return { body: serverRoom };
        if (request.method === 'PUT') {
            const maps = [...serverRoom.treasureMaps];
            for (const operation of request.body.operations) {
                if (operation.type === 'remove') {
                    const index = maps.findIndex(map => map.id === operation.id);
                    if (index !== -1) maps.splice(index, 1);
                } else {
                    // Match the API's capacity check so add-before-remove cannot pass this scenario.
                    if (maps.length >= 8) return { status: 400, body: { code: 'MAP_LIMIT', error: 'Room is full' } };
                    maps.push({ ...operation.map, addedBy: newMember.id });
                }
            }
            serverRoom = room(maps, serverRoom.members, serverRoom.revision + 1);
            return { body: serverRoom };
        }
        if (++attempts === 1) {
            serverRoom = room([...others, ...request.body.initialMaps.map(map => ({ ...map, addedBy: newMember.id }))],
                [member, newMember], 1);
            throw new TypeError('Join committed, but response was lost');
        }
        return { body: { room: serverRoom, newMember, memberId: newMember.id, memberToken: TOKEN } };
    });
    state.finder.listManager.add(sample);
    await state.client.joinRoom('ABC123');
    assert.equal(state.client.currentRoom, null);
    assert.equal(serverRoom.treasureMaps.length, 8);

    state.finder.listManager.remove(sample.id);
    state.finder.listManager.add(replacement);
    await state.client.joinRoom('ABC123');

    const joins = state.requests.filter(request => request.url.endsWith('/join'));
    assert.equal(joins.length, 2);
    assert.deepEqual(joins[1].body, joins[0].body);
    const updates = state.requests.filter(request => request.method === 'PUT');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].headers.Authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(updates[0].body.operations.map(operation => [operation.type, operation.id || operation.map.id]),
        [['remove', sample.id], ['add', replacement.id]]);
    assert.deepEqual(serverRoom.treasureMaps.filter(map => map.addedBy === member.id), others);
    assert.deepEqual(Array.from(state.finder.listManager.getList(), map => map.id),
        [...others.map(map => map.id), replacement.id]);
    assert.equal(state.client.currentRoom.members.length, 2);
    assert.equal(state.client.mapSync.pending.length, 0);
});

test('join recovery removes only its own original map and retains a matching map already owned by another member', async () => {
    const shared = { id: sample.id, type: 'g8', zone: 'Test', x: 10, y: 20,
        addedBy: member.id, addedAt: '2026-09-08T00:00:00.000Z' };
    const own = { ...sample, id: 'own_initial_map' };
    const later = { ...shared, id: 'later_remote_map' };
    let serverRoom = room([shared]);
    let attempts = 0;
    const state = setup(request => {
        if (request.method === 'GET') return { body: serverRoom };
        if (request.method === 'PUT') {
            const removed = new Set(request.body.operations.filter(operation => operation.type === 'remove').map(operation => operation.id));
            serverRoom = room(serverRoom.treasureMaps.filter(map => !removed.has(map.id)), serverRoom.members, serverRoom.revision + 1);
            return { body: serverRoom };
        }
        if (++attempts === 1) {
            // The original join deduplicates the shared ID without changing its existing owner.
            const incoming = request.body.initialMaps.filter(map => map.id !== shared.id)
                .map(map => ({ ...map, addedBy: newMember.id }));
            serverRoom = room([shared, ...incoming], [member, newMember], 1);
            throw new TypeError('Join committed, but response was lost');
        }
        return { body: { room: serverRoom, newMember, memberId: newMember.id, memberToken: TOKEN } };
    });
    state.finder.listManager.add(sample);
    state.finder.listManager.add(own);
    await state.client.joinRoom('ABC123');
    assert.equal(state.client.currentRoom, null);
    state.finder.listManager.clear();
    serverRoom = room([...serverRoom.treasureMaps, later], serverRoom.members, 2);
    await state.client.joinRoom('ABC123');

    const joins = state.requests.filter(request => request.url.endsWith('/join'));
    assert.equal(joins.length, 2);
    assert.deepEqual(joins[1].body, joins[0].body);
    const updates = state.requests.filter(request => request.method === 'PUT');
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].body.operations, [{ type: 'remove', id: own.id }]);
    assert.deepEqual(serverRoom.treasureMaps, [shared, later]);
    assert.deepEqual(Array.from(state.finder.listManager.getList(), map => map.id), [shared.id, later.id]);
    assert.equal(state.client.currentUser.id, newMember.id);
    assert.equal(state.client.mapSync.pending.length, 0);
});

test('a delayed poll 404 cannot cancel the successful leave-and-clear flow', async () => {
    let resolveGet, resolveLeave;
    const state = setup(request => new Promise(resolve => {
        if (request.method === 'GET') resolveGet = resolve;
        else resolveLeave = resolve;
    }));
    state.client.adoptSession(room([{ id: sample.id, type: sample.level, zone: sample.zone, x: 10, y: 20 }]), member, TOKEN);
    const closed = [];
    state.client.hideModal = name => closed.push(name);
    const polling = state.client.poll();
    const leaving = state.client.leaveRoom(false);
    await new Promise(done => setImmediate(done));
    resolveGet({ status: 404, body: { error: 'Room not found' } });
    await polling;
    resolveLeave({ body: { message: 'Room deleted' } });
    await leaving;
    assert.equal(state.finder.listManager.getLength(), 0);
    assert.deepEqual(closed, ['leaveRoom']);
    assert.equal(state.client.currentRoom, null);
});

test('進出隊伍時清單入口跟著換：updateRoomUI() 最後更新清單張數與入口', () => {
    const { context, client, finder } = setup(async () => ({ body: {} }));
    let calls = 0;
    finder.updateListCount = () => { calls++; };
    client.currentRoom = null;
    vm.runInContext('RoomCollaboration.prototype.updateRoomUI.call(client)', context);
    assert.equal(calls, 1);
});

// ---------- 舊的隊伍歷史：整套拿掉，載入時清掉瀏覽器裡留下的 key ----------
// storage 替身是一般物件：key 是自己的屬性；removeItem 同真的 Storage 的方法，不可列舉，預設刪屬性
const storageOf = (items, removeItem = function (key) { delete this[key]; }) => {
    const storage = { ...items };
    Object.defineProperty(storage, 'removeItem', { value: removeItem });
    return storage;
};

test('clearOldHistory：只刪 ff14tw_room_history_ 開頭的 key，其他留著；Object.keys 丟例外、removeItem 丟例外都不丟出', () => {
    const { context } = setup(() => ({ body: room() }));
    const RoomCollaboration = vm.runInContext('RoomCollaboration', context);

    const storage = storageOf({
        ff14tw_room_history_ABC123: '[]', ff14tw_room_history_XYZ789: '[]',
        ff14tw_current_room: '{}', ff14tw_user_nickname: '光之戰士', ff14tw_nickname_tag: 'abc',
        ff14tw_room_history: '少了最後的底線，不是這個前綴', old_ff14tw_room_history_ABC123: '前綴不在開頭'
    });
    RoomCollaboration.clearOldHistory(storage);
    assert.deepEqual(Object.keys(storage), ['ff14tw_current_room', 'ff14tw_user_nickname', 'ff14tw_nickname_tag', 'ff14tw_room_history', 'old_ff14tw_room_history_ABC123']);

    // 列不出 key（封鎖網站資料時 safeStorage() 回傳 null；列舉本身也可能丟例外）：安靜結束
    const blocked = new Proxy({}, { ownKeys() { throw new Error('SecurityError'); } });
    for (const unavailable of [blocked, null, undefined]) assert.doesNotThrow(() => RoomCollaboration.clearOldHistory(unavailable));

    // 刪不掉：不丟出，而且一個刪不掉，其他的照樣試
    const attempted = [];
    const stubborn = storageOf({ ff14tw_room_history_A: '1', ff14tw_room_history_B: '2', ff14tw_current_room: '{}' }, (key) => {
        attempted.push(key);
        throw new Error('SecurityError');
    });
    assert.doesNotThrow(() => RoomCollaboration.clearOldHistory(stubborn));
    assert.deepEqual(attempted, ['ff14tw_room_history_A', 'ff14tw_room_history_B']);
});

test('init()：還原隊伍之前先清掉舊歷史；瀏覽器封鎖網站資料（讀 localStorage 就丟例外）時安靜跳過，照常還原', async () => {
    const state = setup(() => ({ body: room() }));
    const RoomCollaboration = vm.runInContext('RoomCollaboration', state.context);
    state.client.setupEventListeners = () => {};

    // safeStorage()：讀得到就是 localStorage
    assert.equal(RoomCollaboration.safeStorage(), state.context.localStorage);
    const items = { ff14tw_room_history_ABC123: '[]', ff14tw_current_room: '{}' };
    state.context.localStorage = storageOf(items);
    const keysWhenRestoring = [];
    state.client.checkExistingRoom = () => { keysWhenRestoring.push(Object.keys(state.context.localStorage)); };
    await state.originalInit.call(state.client);
    assert.deepEqual(keysWhenRestoring, [['ff14tw_current_room']], '還原隊伍時舊歷史已經清掉，隊伍的存檔還在');

    // 讀的時候丟例外（Chrome 封鎖網站資料時，光是讀 localStorage 就是 SecurityError）：safeStorage() 回傳 null，要走到它的 catch。
    // 存取器要在 context 裡面定義：主機端對 sandbox 物件定義的存取器，丟出的例外會被 vm 吞掉
    // （typeof 變成 'undefined'、直接讀變成 ReferenceError），safeStorage() 走的是「沒有 localStorage」那一支，走不到 catch。
    // 所以先確認這個 context 裡讀 localStorage 真的會丟例外，測試的前提才成立
    vm.runInContext("Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true })", state.context);
    assert.throws(() => vm.runInContext('typeof localStorage', state.context), /SecurityError/);
    assert.equal(RoomCollaboration.safeStorage(), null);
    let restored = 0;
    state.client.checkExistingRoom = () => { restored++; };
    await state.originalInit.call(state.client);
    assert.equal(restored, 1, '清不了舊歷史也不影響還原');

    // 根本沒有 localStorage：也是 null（走 typeof 那一支）
    vm.runInContext('delete globalThis.localStorage', state.context);
    assert.equal(vm.runInContext('typeof localStorage', state.context), 'undefined');
    assert.equal(RoomCollaboration.safeStorage(), null);
});

test('歷史整套拿掉：room-collaboration.js 與 script.js 沒有 operationHistory、addOperationHistory、recordMapOperation、renderHistory、showPanelTab、setupTabSwitching', () => {
    // 前六個是標題列的名字；後三個是同一套歷史裡的其他方法
    const names = ['operationHistory', 'addOperationHistory', 'recordMapOperation', 'renderHistory', 'showPanelTab', 'setupTabSwitching',
        'saveOperationHistory', 'loadOperationHistory', 'cleanupExpiredHistory'];
    for (const file of ['room-collaboration.js', 'script.js']) {
        const source = fs.readFileSync(path.join(__dirname, '..', 'tools/treasure-map-finder', file), 'utf8');
        for (const name of names) assert.ok(!source.includes(name), `${file} 還有 ${name}`);
    }
});

// ---------- 預設名字、看過的成員與網址（進出隊伍） ----------
// knownMembers、ownerOf() 回的物件是在 vm 裡建出來的：原型和測試端不同，assert.deepEqual 會失敗，先轉成測試端的物件再比
const plain = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const TAG_CHARS = '[23456789ABCDEFGHJKMNPQRSTUVWXYZ]';
const mate = { id: 'mate', nickname: 'Mate' };
const gone = { id: 'gone', nickname: 'Gone' };

// 瀏覽器封鎖網站資料：光是讀 localStorage 就丟例外。存取器要在 context 裡面定義（理由見上面 init() 的測試），
// 而且先確認這個 context 裡讀 localStorage 真的會丟例外，測試的前提才成立
const blockStorage = context => {
    vm.runInContext("Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true })", context);
    assert.throws(() => vm.runInContext('typeof localStorage', context), /SecurityError/);
};

// 伺服器：POST /rooms 建立 ABC123（自己是 member）；之後加入 XYZ789（GET 預覽、POST …/join，自己是 newMember）；PUT 是改名
const createThenJoin = request => {
    if (request.method === 'POST' && request.url.endsWith('/rooms')) {
        return { body: { ...room(request.body.initialMaps), memberId: member.id, memberToken: TOKEN } };
    }
    if (request.url.endsWith('/join')) {
        return { body: { room: { ...room([], [member, newMember]), roomCode: 'XYZ789' }, newMember, memberId: newMember.id, memberToken: TOKEN } };
    }
    if (request.method === 'PUT') {
        return { body: { ...room([], [member, { ...newMember, nickname: request.body.nickname }], 1), roomCode: 'XYZ789' } };
    }
    return { body: { ...room(), roomCode: 'XYZ789' } };
};

// 建立、加入送出的名字：[說明, setup() 的選項, 送出的名字]
const NAME_CASES = [
    ['沒改過名字：光之戰士＋這台機器的字串', { stored: { ff14tw_nickname_tag: 'K7Q' } }, '光之戰士K7Q'],
    ['自己改過的名字優先', { stored: { ff14tw_nickname_tag: 'K7Q', ff14tw_user_nickname: 'Alice' } }, 'Alice'],
    ['舊版的預設名字樣式不算自己取的', { stored: { ff14tw_nickname_tag: 'K7Q', ff14tw_user_nickname: '光之戰士1' } }, '光之戰士K7Q'],
    ['英文：開頭跟介面語言，中間一個空格', { lang: 'en', stored: { ff14tw_nickname_tag: 'K7Q' } }, 'Warrior of Light K7Q'],
    ['日文', { lang: 'ja', stored: { ff14tw_nickname_tag: 'K7Q' } }, '光の戦士K7Q']
];

test('建立時送存過的名字；沒有就是光之戰士＋這台機器的字串，英文是 Warrior of Light K7Q', async () => {
    for (const [label, options, expected] of NAME_CASES) {
        const state = setup(request => ({ body: { ...room(request.body.initialMaps), memberId: member.id, memberToken: TOKEN } }), options);
        await state.client.createRoom();
        assert.equal(state.requests.length, 1, label);
        assert.equal(state.requests[0].body.memberNickname, expected, label);
        assert.equal(state.client.currentUser.id, member.id, label);
        // 預設名字不寫進 ff14tw_user_nickname，建立也不動它（只有「改名」會寫）
        assert.equal(state.storage.get('ff14tw_user_nickname'), options.stored.ff14tw_user_nickname, label);
    }
});

test('沒有字串時產生一組 31 個允許字元裡的 3 碼、存進 ff14tw_nickname_tag；之後加入別隊用同一組', async () => {
    const state = setup(createThenJoin);
    assert.equal(state.storage.has('ff14tw_nickname_tag'), false);
    await state.client.createRoom();
    const tag = state.storage.get('ff14tw_nickname_tag');
    assert.match(tag, new RegExp(`^${TAG_CHARS}{3}$`));
    assert.equal(state.requests[0].body.memberNickname, `光之戰士${tag}`);
    assert.equal(state.client.nicknameTag(), tag);
    assert.equal(state.storage.has('ff14tw_user_nickname'), false);

    // 離開、換成英文介面再加入別隊：開頭換成英文，字串還是同一組
    state.client.forceLeaveRoom();
    state.setLang('en');
    await state.client.joinRoom('XYZ789');
    assert.equal(state.client.currentRoom.roomCode, 'XYZ789');
    assert.equal(state.requests.find(request => request.url.endsWith('/join')).body.memberNickname, `Warrior of Light ${tag}`);
    assert.equal(state.storage.get('ff14tw_nickname_tag'), tag);
});

test('加入時用同樣的規則送名字', async () => {
    for (const [label, options, expected] of NAME_CASES) {
        const state = setup(request => (request.method === 'GET'
            ? { body: room() }
            : { body: { room: room([], [member, newMember]), newMember, memberId: newMember.id, memberToken: TOKEN } }), options);
        await state.client.joinRoom('ABC123');
        const join = state.requests.find(request => request.url.endsWith('/join'));
        assert.equal(join.body.memberNickname, expected, label);
        assert.equal(state.client.currentUser.id, newMember.id, label);
        assert.equal(state.storage.get('ff14tw_user_nickname'), options.stored.ff14tw_user_nickname, label);
    }
});

test('knownMembers：每次隊伍資料都記下成員的名字，跟 session 一起存、重新整理後讀回；存值壞掉（陣列、非字串）當作空的，不影響接回隊伍；離開後清空', async () => {
    const state = setup(() => ({ body: room() }));
    assert.deepEqual(plain(state.client.knownMembers), {}, '建構時是空的');

    // adoptSession() 自己也記，不靠 mapSync.connect() 觸發的 onChange（那裡也會記，兩邊結果一樣）
    const direct = setup(() => ({ body: room() }));
    direct.client.mapSync.connect = () => {};
    direct.client.adoptSession(room([], [member, mate]), member, TOKEN);
    assert.deepEqual(plain(direct.client.knownMembers), { creator: 'Creator', mate: 'Mate' });

    // 進隊伍：隊裡現在的人
    state.client.adoptSession(room([], [member, mate, gone]), member, TOKEN);
    assert.deepEqual(plain(state.client.knownMembers), { creator: 'Creator', mate: 'Mate', gone: 'Gone' });

    // 輪詢：gone 離開、mate 改名、late 加入。離開的人留著，改名更新，新來的加上
    state.client.mapSync.receive(room([], [member, { id: 'mate', nickname: 'Mate2' }, { id: 'late', nickname: 'Late' }], 1));
    const known = { creator: 'Creator', mate: 'Mate2', gone: 'Gone', late: 'Late' };
    assert.deepEqual(plain(state.client.knownMembers), known);

    // 跟 session 一起存；房間資料裡沒有這個欄位
    const record = JSON.parse(state.storage.get('ff14tw_current_room'));
    assert.deepEqual(record.knownMembers, known);
    assert.equal(state.client.currentRoom.knownMembers, undefined);

    // 重新整理：讀回來。gone 已經不在隊裡，名字仍然寫得出來；knownMembers 不跟著房間交給 mapSync
    const reloaded = setup(() => ({ body: room() }), { stored: Object.fromEntries(state.storage) });
    await reloaded.client.checkExistingRoom();
    assert.equal(reloaded.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(plain(reloaded.client.knownMembers), known);
    assert.equal(reloaded.client.currentRoom.knownMembers, undefined);
    assert.equal(reloaded.client.mapSync.room.knownMembers, undefined);
    assert.deepEqual(plain(reloaded.client.ownerOf({ addedBy: 'gone' })), { kind: 'left', id: 'gone', name: 'Gone' });

    // 存值壞掉（不是物件、值不是字串）或欄位根本不存在（舊版的存檔）：當作空的，隊伍照樣接回，只剩現在隊裡的人
    const present = { creator: 'Creator', mate: 'Mate2', late: 'Late' };
    for (const bad of [['Gone'], 'Gone', 42, null, { gone: 5, '': 'x' }, undefined]) {
        const damaged = { ...record, knownMembers: bad };
        if (bad === undefined) delete damaged.knownMembers;
        const page = setup(() => ({ body: room() }), { stored: { ff14tw_current_room: JSON.stringify(damaged) } });
        await page.client.checkExistingRoom();
        assert.equal(page.client.currentRoom?.roomCode, 'ABC123', `${JSON.stringify(bad)} 照樣接回隊伍`);
        assert.deepEqual(plain(page.client.knownMembers), present, JSON.stringify(bad));
    }

    // 離開隊伍（不管保留或清空清單）：清空，存檔也刪掉
    await state.client.leaveRoom(true);
    assert.equal(state.client.currentRoom, null);
    assert.deepEqual(plain(state.client.knownMembers), {});
    assert.equal(state.storage.has('ff14tw_current_room'), false);

    // 被移出（輪詢回來的成員裡沒有自己）：一樣清空
    state.client.adoptSession(room([], [member, mate]), member, TOKEN);
    assert.deepEqual(Object.keys(plain(state.client.knownMembers)), ['creator', 'mate']);
    state.client.mapSync.receive(room([], [mate], 2));
    assert.equal(state.client.currentRoom, null);
    assert.deepEqual(plain(state.client.knownMembers), {});

    // rememberMembers()：沒有字串 id、名字不是字串的成員不記
    state.client.rememberMembers({ members: [{ id: 'x' }, { id: 'y', nickname: 7 }, null, { nickname: 'Nobody' }, { id: 'z', nickname: 'Zed' }] });
    assert.deepEqual(plain(state.client.knownMembers), { z: 'Zed' });
});

test('ownerOf：me、member、離開但記得名字、離開沒看過、addedBy 空的；不在隊伍裡是 null', () => {
    const state = setup(() => ({ body: room() }));
    assert.equal(state.client.ownerOf({ addedBy: 'creator' }), null, '還沒進隊伍');

    state.client.adoptSession(room([], [member, mate, gone]), member, TOKEN);
    state.client.mapSync.receive(room([], [member, mate], 1));
    const owner = addedBy => plain(state.client.ownerOf({ addedBy }));
    assert.deepEqual(owner('creator'), { kind: 'me', id: 'creator', name: 'Creator' });
    assert.deepEqual(owner('mate'), { kind: 'member', id: 'mate', name: 'Mate' });
    assert.deepEqual(owner('gone'), { kind: 'left', id: 'gone', name: 'Gone' });
    assert.deepEqual(owner('stranger'), { kind: 'left', id: 'stranger', name: null });
    for (const addedBy of [undefined, null, '']) assert.equal(state.client.ownerOf({ addedBy }), null, String(addedBy));
    assert.equal(state.client.ownerOf({}), null);

    state.client.forceLeaveRoom();
    assert.equal(state.client.ownerOf({ addedBy: 'creator' }), null, '離開之後');
});

test('進出隊伍只用 replaceState、只動 room：網址 ?grade=g17&maps=tm_017 建立後是 ?grade=g17&maps=tm_017&room=ABC123，離開後回到 ?grade=g17&maps=tm_017；沒有 pushState', async () => {
    const state = setup(createThenJoin);
    const base = 'http://localhost:8765/tools/treasure-map-finder/';
    // 瀏覽器原本的 history.state 要原樣帶著，不換成 {}
    const kept = { kept: true };
    state.window.history.state = kept;
    state.window.location.href = `${base}?grade=g17&maps=tm_017`;

    await state.client.createRoom();
    assert.equal(state.window.location.href, `${base}?grade=g17&maps=tm_017&room=ABC123`);
    state.client.forceLeaveRoom();
    assert.equal(state.window.location.href, `${base}?grade=g17&maps=tm_017`);

    // 複選的篩選（grade、zone）與分享的寶圖（maps）用逗號隔開：逗號照舊寫成逗號，不變成 %2C；hash 不動；
    // 建立、加入進來之後多一個 room，離開之後和進來前一模一樣
    const multi = `${base}?grade=g17,g10&zone=a,b&maps=tm_017,tm_018#route`;
    for (const [enter, code] of [[() => state.client.createRoom(), 'ABC123'], [() => state.client.joinRoom('XYZ789'), 'XYZ789']]) {
        state.window.location.href = multi;
        await enter();
        assert.equal(state.window.location.href, `${base}?grade=g17,g10&zone=a,b&maps=tm_017,tm_018&room=${code}#route`);
        state.client.forceLeaveRoom();
        assert.equal(state.window.location.href, multi);
    }

    // 建立、離開、建立、離開、加入、離開，共六次，都是 replaceState
    assert.deepEqual(state.historyCalls.map(call => call.method), Array(6).fill('replaceState'));
    for (const call of state.historyCalls) assert.equal(call.state, kept);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'tools/treasure-map-finder/room-collaboration.js'), 'utf8'), /pushState/);
});

test('RoomCollaboration.withRoom：只換 room 這一個參數，其他參數與 hash 照舊（逗號不編碼）；代號是 null 就拿掉，拿光了參數不留 ?', () => {
    const { context } = setup(() => ({ body: room() }));
    const RoomCollaboration = vm.runInContext('RoomCollaboration', context);
    const base = 'https://ff14.tw/tools/treasure-map-finder/';
    const multi = 'grade=g17,g10&zone=a,b&maps=tm_017,tm_018';
    // [說明, 原網址, 代號, 結果]
    const cases = [
        ['沒有參數：加上 room', base, 'ABC123', `${base}?room=ABC123`],
        ['接在其他參數後面；複選的值逗號照舊，hash 留著', `${base}?${multi}#route`, 'ABC123', `${base}?${multi}&room=ABC123#route`],
        ['已經有 room：原位換掉，其他參數的順序不變', `${base}?room=OLD111&grade=g17,g10`, 'ABC123', `${base}?room=ABC123&grade=g17,g10`],
        ['值裡編碼過的 & 不會被拆成兩個參數', `${base}?zone=a%26b&grade=g17`, 'ABC123', `${base}?zone=a%26b&grade=g17&room=ABC123`],
        ['拿掉 room：回到加上之前的網址', `${base}?${multi}&room=ABC123#route`, null, `${base}?${multi}#route`],
        ['拿掉最後一個參數：不留 ?，hash 留著', `${base}?room=ABC123#route`, null, `${base}#route`],
        ['本來就沒有 room：網址不變', `${base}?${multi}#route`, null, `${base}?${multi}#route`]
    ];
    for (const [label, href, code, expected] of cases) assert.equal(RoomCollaboration.withRoom(href, code), expected, label);
});

test('改名：自訂的名字存起來；改成自己的預設名字或舊樣式就刪掉存值；沒改不寫', async () => {
    // 在隊伍裡目前叫 current，名字欄填 typed 按確認；回傳之後 localStorage 裡的 ff14tw_user_nickname（沒有是 undefined）
    const renameTo = async ({ current, typed, stored = {} }) => {
        const me = { ...member, nickname: current };
        const state = setup(request => ({ body: room([], [{ ...me, nickname: request.body.nickname }], 1) }),
            { stored: { ff14tw_nickname_tag: 'K7Q', ...stored } });
        state.client.adoptSession(room([], [me]), me, TOKEN);
        const getElementById = state.document.getElementById;
        state.document.getElementById = id => (id === 'nicknameInput' ? { value: typed } : getElementById(id));
        await state.client.confirmEditNickname();
        assert.equal(state.client.currentUser.nickname, typed.trim(), `${typed}：改名送出去了`);
        return state.storage.get('ff14tw_user_nickname');
    };

    // 自訂的名字存起來（去掉頭尾空白）；原本存著別的名字就換掉
    assert.equal(await renameTo({ current: '光之戰士K7Q', typed: '  Alice  ' }), 'Alice');
    assert.equal(await renameTo({ current: 'Alice', typed: 'Bob', stored: { ff14tw_user_nickname: 'Alice' } }), 'Bob');

    // 改成自己的預設名字（任何一種語言的開頭加上這台機器的字串）或舊樣式：刪掉存值，下次回到預設名字
    for (const typed of ['光之戰士K7Q', '光の戦士K7Q', 'Warrior of Light K7Q', '光之戰士', '光之戰士1', 'Warrior of Light 2']) {
        assert.equal(await renameTo({ current: 'Alice', typed, stored: { ff14tw_user_nickname: 'Alice' } }), undefined, typed);
    }

    // 沒改：不寫。存著的 Old 不會被目前的名字蓋掉，本來沒存也維持沒存
    assert.equal(await renameTo({ current: 'Alice', typed: 'Alice', stored: { ff14tw_user_nickname: 'Old' } }), 'Old');
    assert.equal(await renameTo({ current: 'Alice', typed: ' Alice ' }), undefined);
    assert.equal(await renameTo({ current: '光之戰士K7Q', typed: '光之戰士K7Q' }), undefined);
});

test('讀 localStorage 就丟例外時：建立照樣送光之戰士＋字串，同一個頁面加入別隊時是同一組；不丟例外', async () => {
    const state = setup(createThenJoin);
    const errors = [];
    state.console.error = (...args) => errors.push(String(args[0]));
    blockStorage(state.context);
    assert.doesNotThrow(() => state.client.defaultNickname());

    await state.client.createRoom();
    assert.equal(state.client.currentRoom?.roomCode, 'ABC123');
    const created = state.requests[0].body.memberNickname;
    assert.match(created, new RegExp(`^光之戰士${TAG_CHARS}{3}$`));
    // 存檔（連同 knownMembers）真的試著寫了，寫不進去也只是記一筆錯誤，不丟出
    assert.ok(errors.some(message => message.includes('Storage write error')), errors.join('、'));

    // 存不起來，所以是這個頁面記住的那一組
    state.client.forceLeaveRoom();
    await state.client.joinRoom('XYZ789');
    assert.equal(state.client.currentRoom?.roomCode, 'XYZ789');
    assert.equal(state.requests.find(request => request.url.endsWith('/join')).body.memberNickname, created);

    // knownMembers 照樣記在這個頁面（存不起來也不出錯）；改名照常
    assert.deepEqual(plain(state.client.knownMembers), { creator: 'Creator', joiner: 'Joiner' });
    const getElementById = state.document.getElementById;
    state.document.getElementById = id => (id === 'nicknameInput' ? { value: 'Alice' } : getElementById(id));
    await state.client.confirmEditNickname();
    assert.equal(state.client.currentUser.nickname, 'Alice');
    assert.deepEqual(state.toasts, ['隊伍 ABC123 建立成功！', '成功加入隊伍 XYZ789', '暱稱已更新']);

    // 沒有 localStorage 這個東西（typeof 是 'undefined'）也一樣
    vm.runInContext('delete globalThis.localStorage', state.context);
    assert.equal(vm.runInContext('typeof localStorage', state.context), 'undefined');
    assert.match(state.client.defaultNickname(), new RegExp(`^光之戰士${TAG_CHARS}{3}$`));
});

test('adoptSession：poll 是 false 時不開始輪詢，預設要輪詢', () => {
    const state = setup(() => ({ body: room() }));
    let polls = 0;
    state.client.startPolling = () => { polls++; };
    state.client.adoptSession(room(), member, TOKEN);
    assert.equal(polls, 1);

    state.client.forceLeaveRoom();
    state.client.adoptSession(room(), member, TOKEN, [], { poll: false });
    assert.equal(polls, 1, 'poll: false 沒有開始輪詢');
    assert.equal(state.client.currentRoom.roomCode, 'ABC123', '其他照常接上');
    assert.equal(state.client.currentUser.id, member.id);
});

test('預設名字的開頭改由 PartyNames.BASES 提供：treasure_map_default_nickname 與 _creator 三語都刪掉了', () => {
    for (const lang of ['zh', 'en', 'ja']) {
        const keys = translationKeySet('assets/js/i18n/translations/tools/treasure-map-finder.js', lang);
        for (const key of ['treasure_map_default_nickname', 'treasure_map_default_nickname_creator']) {
            assert.equal(keys.has(key), false, `${lang} 還有 ${key}`);
        }
    }
});

// ---------- 清單面板裡的組隊：焦點（fake-dom） ----------
// 照 index.html 做出清單面板（標頭的關閉、組隊按鈕、隊伍狀態、清單與它下面的動作列）、三個隊伍對話框與面板外的一顆按鈕，
// fake-dom 裡載入真正的 list-manager.js、party-names.js、room-map-sync.js、room-collaboration.js 與 script.js（清單面板的開關、隊伍同步、預設名字）。
// finder 不跑建構函式，清單張數、卡片按鈕、清單內容換成空函式（同上面的 setup()）；client.init() 由測試自己呼叫（掛事件、處理網址的 ?room=）。
// request() 換成 respond(path, options)：回傳值就是伺服器的回應，丟出的錯誤就是失敗。
// 按鈕與輸入框照 Chrome 的行為：拿著焦點時一停用，當場就失去焦點（activeElement 退回 body）；停用的、自己或祖先帶 .hidden 的，focus() 什麼都不做。
// 少了這些，「連線中焦點掉到 body」與「焦點還給已經藏起來的按鈕」在測試裡都不會發生
function createTeamPanel({ url = 'https://ff14.tw/tools/treasure-map-finder/', respond }) {
    const dom = createFakeDom({ url });
    const { el } = dom;
    const storage = new Map();
    const button = (id, text) => el('button', { type: 'button', id, class: 'btn' }, text);
    const panel = el('div', { id: 'myListPanel', class: 'my-list-panel', role: 'dialog', inert: true },
        el('div', { class: 'panel-header' }, button('closePanelBtn', '×')),
        el('div', { class: 'panel-body' },
            el('div', { id: 'teamActions', class: 'team-actions' }, button('createRoomBtn', '建立組隊'), button('joinRoomBtn', '加入隊伍')),
            el('div', { id: 'roomSection', class: 'room-section hidden' },
                el('div', { id: 'roomStatus', class: 'room-status hidden' },
                    el('span', { id: 'roomCode' }), button('copyRoomCodeBtn', '📋'),
                    el('span', { id: 'roomMembers' }), el('span', { id: 'lastActivity' }), el('span', { id: 'roomTTL' }),
                    el('span', { id: 'userNickname' }), button('editNicknameBtn', '✏️'), button('leaveRoomBtn', '離開隊伍'),
                    el('div', { id: 'membersList' }))),
            el('div', { id: 'listContent' }),
            el('div', { id: 'listActions', class: 'tm-list-actions' }, button('importListBtn', '匯入'), button('clearAllBtn', '清空清單'))),
        el('div', { class: 'panel-footer' }, button('generateRouteBtn', '生成路線')));
    const dialog = (id, ...children) => el('div', { id, class: 'modal dialog-overlay hidden', role: 'dialog' }, ...children);
    for (const element of [
        button('pageButton', '面板外的按鈕'),
        el('div', { id: 'panelOverlay', class: 'panel-overlay' }),
        panel,
        dialog('joinRoomModal', button('closeJoinModalBtn', '×'), el('input', { id: 'roomCodeInput' }), button('cancelJoinBtn', '取消'), button('confirmJoinBtn', '加入')),
        dialog('editNicknameModal', button('closeNicknameModalBtn', '×'), el('input', { id: 'nicknameInput' }), button('cancelNicknameBtn', '取消'), button('confirmNicknameBtn', '確認')),
        dialog('leaveRoomModal', button('closeLeaveModalBtn', '×'), button('leaveKeepListBtn', '保留清單並離開'), button('leaveClearListBtn', '清空清單並離開'), button('cancelLeaveBtn', '取消'))
    ]) {
        dom.document.body.appendChild(element);
    }

    const rendered = element => {
        for (let node = element; node?.nodeType === 1; node = node.parentNode) if (node.classList.contains('hidden')) return false;
        return true;
    };
    for (const control of [...dom.document.querySelectorAll('button'), ...dom.document.querySelectorAll('input')]) {
        let disabled = false;
        const focus = control.focus;
        Object.defineProperty(control, 'disabled', {
            get: () => disabled,
            set(value) {
                disabled = Boolean(value);
                if (disabled) control.blur();
            }
        });
        control.focus = () => {
            if (!disabled && rendered(control)) focus.call(control);
        };
    }
    // fake-dom 不支援逗號分隔的選擇器清單（setConnecting() 用一個清單選出要停用的按鈕）：拆開各查一次再合併
    const querySelectorAll = dom.document.querySelectorAll.bind(dom.document);
    dom.document.querySelectorAll = selector => [...new Set(selector.split(',').flatMap(part => querySelectorAll(part.trim())))];

    // ModalManager 替身：照真正的順序，show() 記下開啟前的焦點、把下面那一層設成 inert、把焦點移到第一個可聚焦的元素；
    // hide() 解除下面那一層的 inert、把焦點還給開啟前的元素（還不回去就什麼都不做，同 Chrome），再呼叫 onClose
    const stack = [];
    const focusable = root => root.children.flatMap(child => (child.classList.contains('hidden')
        ? []
        : [...(['BUTTON', 'INPUT'].includes(child.tagName) && !child.disabled ? [child] : []), ...focusable(child)]));
    class FakeModalManager {
        static topmost() { return stack.at(-1) ?? null; }

        constructor() {
            this.activeModal = null;
            this.previousFocus = null;
            this.options = {};
        }

        show(element, options = {}) {
            if (this.activeModal === element) return;
            if (this.activeModal) this.hide();
            if (stack.length) stack.at(-1).activeModal.inert = true;
            Object.assign(this, { activeModal: element, previousFocus: dom.document.activeElement, options });
            stack.push(this);
            (focusable(element)[0] ?? element).focus();
        }

        hide() {
            if (!this.activeModal) return;
            while (stack.at(-1) !== this) stack.at(-1).hide();
            const { previousFocus, options } = this;
            stack.pop();
            if (stack.length) stack.at(-1).activeModal.inert = false;
            Object.assign(this, { activeModal: null, previousFocus: null, options: {} });
            if (previousFocus && dom.document.body.contains(previousFocus)) previousFocus.focus();
            options.onClose?.();
        }
    }

    // 進出隊伍用 replaceState（pushState 也留著，同瀏覽器）：換掉 history.state 與 location
    const navigate = (state, title, next) => {
        dom.window.history.state = state;
        dom.window.location = new URL(String(next));
    };
    Object.assign(dom.window, {
        URLSearchParams,
        crypto: webcrypto,
        confirm: () => false,
        console: { log() {}, warn() {}, error() {} },
        history: { state: null, pushState: navigate, replaceState: navigate },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
        i18n: { getCurrentLanguage: () => 'zh', onLanguageChange() {} },
        FF14Utils: { getI18nText: (key, fallback, values = {}) => fallback.replace(/\{(\w+)\}/g, (_, name) => values[name]), showToast() {} },
        ModalManager: FakeModalManager
    });
    for (const file of ['assets/js/security-utils.js', 'tools/treasure-map-finder/list-manager.js', 'tools/treasure-map-finder/party-names.js', 'tools/treasure-map-finder/room-map-sync.js', 'tools/treasure-map-finder/room-collaboration.js', 'tools/treasure-map-finder/script.js']) {
        dom.load(file);
    }

    const finder = vm.runInContext('Object.create(TreasureMapFinder.prototype)', dom.window);
    Object.assign(finder, {
        maps: [],
        listManager: vm.runInContext('new ListManager()', dom.window),
        modalManager: new FakeModalManager(),
        elements: { myListPanel: panel },
        ready: Promise.resolve(),
        updateListCount() {},
        updateCardButtons() {},
        renderMyList() {}
    });
    const RoomCollaboration = vm.runInContext('RoomCollaboration', dom.window);
    const { init } = RoomCollaboration.prototype;
    RoomCollaboration.prototype.init = function () {};
    const client = new RoomCollaboration(finder);
    RoomCollaboration.prototype.init = init;
    finder.setRoomCollaboration(client);
    client.request = async (path, options = {}) => respond(path, options);
    client.startPolling = () => {};
    return { dom, finder, client, $: id => dom.document.getElementById(id), focused: () => dom.document.activeElement };
}

// 焦點應該在 #id 上；比身分、訊息只寫 id（assert.equal 直接比節點，失敗時會把整頁的 DOM 展開成訊息）
function assertFocusOn(page, id, message) {
    const actual = page.focused();
    assert.ok(actual === page.$(id), `${message}：焦點在 ${actual.id ? `#${actual.id}` : `<${actual.tagName.toLowerCase()}>`}，應該在 #${id}`);
}

const roomError = (status, message) => Object.assign(new Error(message), { status });
const createAndLeave = (path, { method }) => {
    if (path === '/rooms' && method === 'POST') return { ...room(), memberId: member.id, memberToken: TOKEN };
    if (path === '/rooms/ABC123/leave' && method === 'POST') return { message: 'Left' };
    throw new Error(`unexpected ${method} ${path}`);
};
const joinable = (path, { method = 'GET' }) => {
    if (path === '/rooms/ABC123' && method === 'GET') return room();
    if (path === '/rooms/ABC123/join' && method === 'POST') return { room: room([], [member, newMember]), newMember, memberToken: TOKEN };
    throw new Error(`unexpected ${method} ${path}`);
};

test('建立組隊成功：焦點移到隊伍狀態的「複製隊伍代號」（連線中「建立組隊」停用、焦點退回 body）', async () => {
    const page = createTeamPanel({ respond: createAndLeave });
    await page.client.init();
    page.finder.handleListEntry('team');
    assertFocusOn(page, 'createRoomBtn', '按「組隊」打開面板');
    const creating = page.client.createRoom();
    assert.ok(page.focused() === page.dom.document.body, '連線中「建立組隊」停用，焦點當場退回 body');
    await creating;
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(page.$('teamActions').classList.contains('hidden'), true);
    assertFocusOn(page, 'copyRoomCodeBtn', '建立成功');
});

test('建立組隊失敗：焦點回到「建立組隊」', async () => {
    const page = createTeamPanel({ respond: () => { throw roomError(503, 'Service unavailable'); } });
    await page.client.init();
    page.finder.handleListEntry('team');
    await page.client.createRoom();
    assert.equal(page.client.currentRoom, null);
    assertFocusOn(page, 'createRoomBtn', '建立失敗');
});

test('加入隊伍成功：焦點移到「複製隊伍代號」；失敗：焦點回到「加入隊伍」', async () => {
    for (const [respond, expected] of [[joinable, 'copyRoomCodeBtn'], [() => { throw roomError(404, 'Room not found'); }, 'joinRoomBtn']]) {
        const page = createTeamPanel({ respond });
        await page.client.init();
        page.finder.openListPanel();
        page.$('joinRoomBtn').focus();
        page.$('joinRoomBtn').click();
        assertFocusOn(page, 'roomCodeInput', '打開加入隊伍對話框');
        page.$('roomCodeInput').value = 'abc123';
        await page.client.confirmJoinRoom();
        assert.equal(page.client.currentRoom?.roomCode ?? null, expected === 'copyRoomCodeBtn' ? 'ABC123' : null);
        assertFocusOn(page, expected, expected === 'copyRoomCodeBtn' ? '加入成功' : '加入失敗');
    }
});

test('離開隊伍（保留或清空清單）：焦點回到又出現的「建立組隊」，不是已經藏起來的離開鈕', async () => {
    for (const keepList of [true, false]) {
        const page = createTeamPanel({ respond: createAndLeave });
        await page.client.init();
        page.finder.handleListEntry('team');
        await page.client.createRoom();
        page.$('leaveRoomBtn').focus();
        page.$('leaveRoomBtn').click();
        const choice = keepList ? 'leaveKeepListBtn' : 'leaveClearListBtn';
        page.$(choice).focus();
        await page.client.leaveRoom(keepList);
        assert.equal(page.client.currentRoom, null);
        assert.equal(page.$('leaveRoomModal').classList.contains('hidden'), true);
        assertFocusOn(page, 'createRoomBtn', choice);
    }
});

test('用網址 ?room= 在載入時自動加入：不移動焦點（面板關著；加入途中才打開面板也一樣）', async () => {
    const url = 'https://ff14.tw/tools/treasure-map-finder/?room=ABC123';
    const closed = createTeamPanel({ url, respond: joinable });
    closed.$('pageButton').focus();
    await closed.client.init();
    assert.equal(closed.client.currentRoom.roomCode, 'ABC123');
    assertFocusOn(closed, 'pageButton', '面板關著');

    let release;
    const preview = new Promise(resolve => { release = resolve; });
    const opened = createTeamPanel({ url, respond: async (path, options) => {
        if (path === '/rooms/ABC123') await preview;
        return joinable(path, options);
    } });
    const joining = opened.client.init();
    await new Promise(resolve => setImmediate(resolve));
    opened.finder.openListPanel();
    assertFocusOn(opened, 'closePanelBtn', '加入途中打開面板');
    release();
    await joining;
    assert.equal(opened.client.currentRoom.roomCode, 'ABC123');
    assertFocusOn(opened, 'closePanelBtn', '加入途中打開面板，加入完成後');
});
