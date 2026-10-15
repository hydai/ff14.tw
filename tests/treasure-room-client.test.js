const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const { createFakeDom } = require('./helpers/fake-dom.js');

const TOKEN = 'a'.repeat(64);
const sample = { id: 'g8_test_1', level: 'g8', zone: 'Test', coords: { x: 10, y: 20 } };
const member = { id: 'creator', nickname: 'Creator', isCreator: true };
const newMember = { id: 'joiner', nickname: 'Joiner' };
const room = (maps = [], members = [member], revision = 0) => ({ roomCode: 'ABC123', creatorId: member.id, members, treasureMaps: maps, revision, lastActivityAt: new Date().toISOString() });

function setup(respond) {
    const storage = new Map(), requests = [], toasts = [];
    const location = new URL('http://localhost:8765/tools/treasure-map-finder/');
    const element = () => ({ textContent: '', classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {} });
    const context = vm.createContext({
        window: { location, history: { pushState(state, title, url) { location.href = String(url); } }, i18n: { onLanguageChange() {} } },
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
    for (const file of ['assets/js/security-utils.js', 'tools/treasure-map-finder/coordinate-utils.js', 'tools/treasure-map-finder/list-manager.js', 'tools/treasure-map-finder/room-map-sync.js', 'tools/treasure-map-finder/room-collaboration.js', 'tools/treasure-map-finder/script.js']) {
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
        client.updateRoomUI = client.addOperationHistory = client.loadOperationHistory = () => {};
        client.startPolling = () => {};
    `, context);
    context.finder.maps = [sample];
    return { ...context, context, storage, requests, toasts };
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
        state.context.confirm = () => merge;
        const initial = importMaps(initialCount, 'initial');
        state.client.adoptSession(room(initial.map(map => state.finder.toRoomMap(map))), member, TOKEN);
        const before = JSON.stringify(state.finder.listManager.getList());
        const stored = [...state.storage];
        await state.finder.importFromText(JSON.stringify({ maps: importMaps(incomingCount) }));
        assert.equal(state.requests.length, 0);
        assert.equal(JSON.stringify(state.finder.listManager.getList()), before);
        assert.deepEqual([...state.storage], stored);
        assert.equal(state.client.mapSync.pending.length, 0);
        assert.equal(state.toasts.length, 1);
        assert.match(state.toasts[0], /清單已滿/);
    }
});

test('room-incompatible imports are rejected atomically before replacing or merging local maps', async () => {
    for (const merge of [false, true]) {
        for (const invalid of [
            { id: 'bad id' }, { id: 'bad/id' }, { id: '寶圖' },
            { level: 'g0' }, { level: 'g19' }, { level: 'G8' }, { zone: '   ' }
        ]) {
            const state = setup(() => ({ status: 400, body: { code: 'INVALID_REQUEST', error: 'Invalid map' } }));
            state.context.confirm = () => merge;
            state.client.adoptSession(room([state.finder.toRoomMap(sample)]), member, TOKEN);
            const before = JSON.stringify(state.finder.listManager.getList());
            const stored = [...state.storage];
            await state.finder.importFromText(JSON.stringify({ maps: [
                ...importMaps(1), { ...sample, id: 'invalid', ...invalid }
            ] }));
            assert.equal(state.requests.length, 0, JSON.stringify(invalid));
            assert.equal(JSON.stringify(state.finder.listManager.getList()), before);
            assert.deepEqual([...state.storage], stored);
            assert.equal(state.client.mapSync.pending.length, 0);
            assert.equal(state.toasts.length, 1);
            assert.match(state.toasts[0], /不支援/);
        }
    }
});

test('room imports deduplicate before capacity checks and a full replacement uses at most sixteen operations', async () => {
    for (const merge of [false, true]) {
        const initial = importMaps(8, 'initial');
        const incoming = merge ? initial : importMaps(8);
        const state = setup(() => ({ body: room(incoming.map(map => state.finder.toRoomMap(map)), [member], 1) }));
        state.context.confirm = () => merge;
        state.client.adoptSession(room(initial.map(map => state.finder.toRoomMap(map))), member, TOKEN);
        await state.finder.importFromText(JSON.stringify({ maps: [...incoming, incoming[0]] }));
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
    await state.finder.importFromText(JSON.stringify({ maps: importMaps(8) }));
    assert.equal(state.requests.length, 0);
    assert.equal(JSON.stringify(state.finder.listManager.getList()), before);
    assert.deepEqual([...state.storage], stored);
    assert.deepEqual(state.client.mapSync.pending, pending);
    assert.match(state.toasts.at(-1), /等待隊伍同步/);
});

test('personal imports can exceed the room limit; when storage rejects the write the import still applies in memory', async () => {
    const state = setup(() => { throw new Error('Personal imports must not call the API'); });
    await state.finder.importFromText(JSON.stringify({ maps: importMaps(17) }));
    assert.equal(state.finder.listManager.getLength(), 17);
    const stored = [...state.storage];
    state.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
    await state.finder.importFromText(JSON.stringify({ maps: [sample] }));
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

test('optional history quota errors do not prevent an edit from reaching the room', async () => {
    const state = setup(request => ({ body: room([request.body.operations[0].map], [member], 1) }));
    state.client.adoptSession(room(), member, TOKEN);
    delete state.client.addOperationHistory;
    const originalSet = state.localStorage.setItem;
    state.localStorage.setItem = (key, value) => {
        if (key.startsWith('ff14tw_room_history_')) throw new Error('QuotaExceededError');
        originalSet(key, value);
    };
    state.finder.toggleMapInList(sample);
    await state.client.mapSync.flush();
    assert.equal(state.requests.length, 1);
    assert.equal(state.client.currentRoom.treasureMaps[0].id, sample.id);
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

test('離開隊伍後清單面板回到清單分頁，歷史內容隱藏', () => {
    const { context, client } = setup(async () => ({ body: {} }));
    // classList.toggle 與瀏覽器一致：有 force 時依 force 加入或移除，沒有才反轉
    const fakeElement = (...initialClasses) => {
        const classes = new Set(initialClasses), attributes = new Map();
        return {
            dataset: {}, tabIndex: 0,
            classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name),
                contains: name => classes.has(name),
                toggle(name, force = !classes.has(name)) {
                    if (force) classes.add(name); else classes.delete(name);
                    return force;
                }
            },
            setAttribute: (name, value) => attributes.set(name, String(value)),
            getAttribute: name => attributes.get(name) ?? null
        };
    };
    const elements = new Map();
    context.document.getElementById = id => {
        if (!elements.has(id)) elements.set(id, fakeElement());
        return elements.get(id);
    };
    const tabButton = (tab, active) => {
        const button = fakeElement(...(active ? ['active'] : []));
        button.dataset.tab = tab;
        button.tabIndex = active ? 0 : -1;
        button.setAttribute('aria-selected', active);
        return button;
    };
    // 離開前停在「歷史」分頁：歷史鈕為作用中，清單內容被隱藏、歷史內容顯示
    const listButton = tabButton('list', false), historyButton = tabButton('history', true);
    context.document.querySelectorAll = selector => selector === '.tab-btn' ? [listButton, historyButton] : [];
    const listContent = context.document.getElementById('listContent');
    const historyContent = context.document.getElementById('historyContent');
    listContent.classList.add('hidden');

    client.currentRoom = null;
    client.elements = { roomSection: fakeElement(), roomStatus: fakeElement() };
    vm.runInContext('RoomCollaboration.prototype.updateRoomUI.call(client)', context);

    assert.equal(listContent.classList.contains('hidden'), false);
    assert.equal(historyContent.classList.contains('hidden'), true);
    assert.equal(listButton.getAttribute('aria-selected'), 'true');
    assert.equal(historyButton.getAttribute('aria-selected'), 'false');
    assert.equal(listButton.classList.contains('active'), true);
    assert.equal(historyButton.classList.contains('active'), false);
    assert.deepEqual([listButton.tabIndex, historyButton.tabIndex], [0, -1]);
});

test('進出隊伍時清單入口跟著換：updateRoomUI() 最後更新清單張數與入口', () => {
    const { context, client, finder } = setup(async () => ({ body: {} }));
    let calls = 0;
    finder.updateListCount = () => { calls++; };
    client.currentRoom = null;
    vm.runInContext('RoomCollaboration.prototype.updateRoomUI.call(client)', context);
    assert.equal(calls, 1);
});

// ---------- 清單面板裡的組隊：焦點（fake-dom） ----------
// 照 index.html 做出清單面板（標頭的匯出…關閉、組隊按鈕、隊伍狀態、頁籤、清單）、三個隊伍對話框與面板外的一顆按鈕，
// fake-dom 裡載入真正的 list-manager.js、room-map-sync.js、room-collaboration.js 與 script.js（清單面板的開關、隊伍同步）。
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
        el('div', { class: 'panel-header' }, button('exportListBtn', '匯出'), button('importListBtn', '匯入'), button('clearAllBtn', '清空'), button('closePanelBtn', '×')),
        el('div', { class: 'panel-body' },
            el('div', { id: 'teamActions', class: 'team-actions' }, button('createRoomBtn', '建立組隊'), button('joinRoomBtn', '加入隊伍')),
            el('div', { id: 'roomSection', class: 'room-section hidden' },
                el('div', { id: 'roomStatus', class: 'room-status hidden' },
                    el('span', { id: 'roomCode' }), button('copyRoomCodeBtn', '📋'),
                    el('span', { id: 'roomMembers' }), el('span', { id: 'lastActivity' }), el('span', { id: 'roomTTL' }),
                    el('span', { id: 'userNickname' }), button('editNicknameBtn', '✏️'), button('leaveRoomBtn', '離開隊伍'),
                    el('div', { id: 'membersList' }))),
            el('div', { id: 'panelTabs', class: 'panel-tabs hidden' },
                el('button', { type: 'button', class: 'tab-btn active', 'data-tab': 'list' }, '清單'),
                el('button', { type: 'button', class: 'tab-btn', 'data-tab': 'history' }, '歷史')),
            el('div', { id: 'listContent' }),
            el('div', { id: 'historyContent', class: 'hidden' })),
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

    Object.assign(dom.window, {
        URLSearchParams,
        crypto: webcrypto,
        confirm: () => false,
        console: { log() {}, warn() {}, error() {} },
        history: { pushState(state, title, next) { dom.window.location = new URL(String(next)); } },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
        i18n: { getCurrentLanguage: () => 'zh', onLanguageChange() {} },
        FF14Utils: { getI18nText: (key, fallback, values = {}) => fallback.replace(/\{(\w+)\}/g, (_, name) => values[name]), showToast() {} },
        ModalManager: FakeModalManager
    });
    for (const file of ['assets/js/security-utils.js', 'tools/treasure-map-finder/list-manager.js', 'tools/treasure-map-finder/room-map-sync.js', 'tools/treasure-map-finder/room-collaboration.js', 'tools/treasure-map-finder/script.js']) {
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
    assertFocusOn(opened, 'exportListBtn', '加入途中打開面板');
    release();
    await joining;
    assert.equal(opened.client.currentRoom.roomCode, 'ABC123');
    assertFocusOn(opened, 'exportListBtn', '加入途中打開面板，加入完成後');
});
