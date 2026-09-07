const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

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
        FF14Utils: { getI18nText: (key, fallback) => fallback, showToast: message => toasts.push(message) },
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
    return { ...context, storage, requests, toasts };
}

test('creating a room uses ListManager, atomically submits retained maps and persists private credentials', async () => {
    const state = setup(request => ({ body: { ...room(request.body.initialMaps), memberId: member.id, memberToken: TOKEN } }));
    state.finder.listManager.add(sample);
    await state.client.createRoom();
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].body.initialMaps[0].id, sample.id);
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
    assert.equal(update.body.operations[0].type, 'add');
    assert.equal(update.body.operations[0].map.id, sample.id);
    assert.equal(update.body.treasureMaps, undefined);
    assert.equal(state.client.currentRoom.revision, 1);
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
