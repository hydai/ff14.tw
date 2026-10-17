const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

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
        // 帶不帶本機清單由 createRoom({ clearLocal })、joinRoom(code, { clearLocal }) 的選項決定，不再跳瀏覽器的確認視窗
        confirm: () => { throw new Error('不該呼叫 confirm()'); }, setTimeout, clearTimeout,
        fetch: async (url, options = {}) => {
            const request = { url, ...options, body: options.body ? JSON.parse(options.body) : undefined };
            requests.push(request);
            const result = await respond(request);
            return new Response(JSON.stringify(result.body), { status: result.status || 200 });
        }
    });
    // party-names.js、party-status.js、room-dialogs.js 要排在 room-collaboration.js 前面（和 index.html 的順序一樣；建構函式一開始就要建 PartyStatus 與 RoomDialogs）。
    // 這裡的 ModalManager 是空的替身、getElementById 回傳假元素：RoomDialogs 的建構函式只抓元素、建 ModalManager，其餘都在 init() 與打開對話框之後
    for (const file of ['assets/js/security-utils.js', 'tools/treasure-map-finder/coordinate-utils.js', 'tools/treasure-map-finder/list-manager.js', 'tools/treasure-map-finder/party-names.js', 'tools/treasure-map-finder/room-map-sync.js', 'tools/treasure-map-finder/party-status.js', 'tools/treasure-map-finder/room-dialogs.js', 'tools/treasure-map-finder/room-collaboration.js', 'tools/treasure-map-finder/list-share.js', 'tools/treasure-map-finder/script.js']) {
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

test('a leave acknowledgement racing a poll still clears the list and resolves with success (closing the dialog is RoomDialogs\' job)', async () => {
    let resolve;
    const delayed = new Promise(done => { resolve = done; });
    const state = setup(() => delayed);
    state.client.adoptSession(room([{ id: sample.id, type: sample.level, zone: sample.zone, x: 10, y: 20 }]), member, TOKEN);
    const leaving = state.client.leaveRoom(false);
    await new Promise(done => setImmediate(done));
    // The server has removed this member, but POST's acknowledgement is still in transit.
    state.client.mapSync.receive(room([], [], 1));
    resolve({ body: { message: 'Room deleted' } });
    assert.deepEqual(plain(await leaving), { success: true });
    assert.equal(state.finder.listManager.getLength(), 0);
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
            let pollingRestarts = 0;
            state.client.startPolling = () => { pollingRestarts++; };
            // 變更還沒送完：回傳失敗與原因，由呼叫的人顯示（leaveRoom 自己不跳 toast）
            const first = await state.client.leaveRoom(keepList);
            assert.deepEqual(plain(first), { success: false, message: '你的變更還沒送出，請稍後再試。' });
            assert.deepEqual(state.requests.map(request => request.method), ['PUT']);
            assert.equal(state.client.currentRoom.roomCode, 'ABC123');
            assert.equal(state.client.memberToken, TOKEN);
            assert.equal(state.client.mapSync.pending.length, 1);
            assert.equal(state.finder.listManager.getList()[0].id, sample.id);
            assert.equal(JSON.parse(state.storage.get('ff14tw_current_room')).pendingMapOperations[0].clientRequestId, pending[0].clientRequestId);
            assert.equal(state.client.isLeaving, false);
            assert.equal(state.client.isConnecting, false);
            assert.equal(pollingRestarts, 1);
            assert.ok(state.toasts.every(toast => !toast.includes('離開') && !toast.includes('還沒送出')), `失敗不跳 toast：${state.toasts}`);

            const second = await state.client.leaveRoom(keepList);
            assert.deepEqual(plain(second), { success: true });
            assert.deepEqual(state.requests.map(request => request.method), ['PUT', 'PUT', 'POST']);
            assert.equal(state.requests[1].body.clientRequestId, state.requests[0].body.clientRequestId);
            assert.equal(state.client.currentRoom, null);
            assert.equal(state.storage.has('ff14tw_current_room'), false);
            assert.equal(state.finder.listManager.getLength(), keepList ? 1 : 0);
            assert.equal(state.toasts.at(-1), '已離開隊伍');
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
    const polling = state.client.poll();
    const leaving = state.client.leaveRoom(false);
    await new Promise(done => setImmediate(done));
    resolveGet({ status: 404, body: { error: 'Room not found' } });
    await polling;
    resolveLeave({ body: { message: 'Room deleted' } });
    assert.deepEqual(plain(await leaving), { success: true });
    assert.equal(state.finder.listManager.getLength(), 0);
    assert.equal(state.client.currentRoom, null);
    assert.equal(state.toasts.at(-1), '已離開隊伍', '輪詢那一邊沒有跳「隊伍已過期」');
    assert.ok(!state.toasts.includes('隊伍已過期'));
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

test('離開隊伍的每一條路最後都重畫清單，而且重畫時隊伍已經沒了：畫面上才不會留著「誰的圖」', async () => {
    // [說明, 伺服器的回應, 走這一條路離開]。保留清單離開時清單不會變，沒有這次重畫，每一列與開著的路線頁就停在離開之前的樣子
    const paths = [
        ['直接 forceLeaveRoom()', () => ({ body: room() }), client => client.forceLeaveRoom()],
        ['離開隊伍（保留清單）', request => (request.method === 'POST' ? { body: { message: 'Left' } } : { body: room() }), client => client.leaveRoom(true)],
        ['離開隊伍時伺服器已經不認得我（404）', request => (request.method === 'POST' ? { status: 404, body: { error: 'Room not found' } } : { body: room() }), client => client.leaveRoom(true)],
        ['輪詢讀到 404（隊伍過期）', () => ({ status: 404, body: { error: 'Room not found' } }), client => client.poll()],
        ['被移出或連線失效（輪詢回來的成員裡沒有自己）', () => ({ body: room() }), client => client.mapSync.receive(room([], [mate], 1))],
        ['舊的唯讀隊伍', () => ({ body: { ...room(), readOnly: true, legacy: true } }), client => client.poll()]
    ];
    const problems = [];
    for (const [label, respond, leave] of paths) {
        const state = setup(respond);
        state.client.adoptSession(room([], [member, mate]), member, TOKEN);
        // 重畫時問 finder 這張圖是誰加的：在隊伍裡是自己，隊伍沒了是 null——清單的每一列、路線的每一站畫不畫「誰的圖」就看這個
        const owners = [];
        state.finder.renderMyList = () => owners.push(plain(state.finder.ownerOf({ addedBy: 'creator' })));
        assert.equal(plain(state.finder.ownerOf({ addedBy: 'creator' })).kind, 'me', `${label}：離開之前在隊伍裡`);
        await leave(state.client);
        if (state.client.currentRoom !== null) problems.push(`${label}：沒有離開`);
        else if (owners.length === 0) problems.push(`${label}：離開之後沒有重畫清單`);
        else if (owners.at(-1) !== null) problems.push(`${label}：最後一次重畫時隊伍還在`);
    }
    assert.deepEqual(problems, []);
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
    assert.deepEqual(state.toasts, ['隊伍 ABC123 建立成功！', '成功加入隊伍 XYZ789', '已改名']);

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

// ---------- 建立、加入：不用 confirm()，選項由呼叫的人帶進來，回傳結果 ----------
// createRoom()／joinRoom() 回傳 { success: true } 或 { success: false, kind, message }：錯誤訊息與焦點是呼叫的人的事，
// 這兩個函式自己只跳成功的 toast。setup() 的 confirm() 一被呼叫就丟錯，所以帶不帶本機清單只能靠選項。
// 結果是在 vm 裡建出來的物件，原型和測試端不同，assert.deepEqual 前先用 plain() 轉過

const GET = 'GET /rooms/ABC123';
const JOIN = 'POST /rooms/ABC123/join';
// 送出的請求，例如 [GET, JOIN]
const pathsOf = state => state.requests.map(request => `${request.method} ${request.url.replace(/^.*\/api/, '')}`);
// 本機清單放 count 張寶圖（id 是 local_0、local_1…）
const addLocalMaps = (state, count, prefix = 'local') => {
    for (const map of importMaps(count, prefix)) state.finder.listManager.add(map);
};
const localIds = state => Array.from(state.finder.listManager.getList(), map => map.id);
// 伺服器上 count 張別人加的寶圖（id 是 room_0、room_1…）
const serverMaps = (count, prefix = 'room') => importMaps(count, prefix).map(map => ({
    id: map.id, type: map.level, zone: map.zone, x: 10, y: 20, addedBy: member.id, addedAt: '2026-09-08T00:00:00.000Z'
}));
const eightMembers = Array.from({ length: 8 }, (_, index) => ({ id: `member_${index}`, nickname: `Member ${index}` }));
// 建立：伺服器照 initialMaps 開出 ABC123
const createsRoom = request => ({ body: { ...room(request.body.initialMaps), memberId: member.id, memberToken: TOKEN } });
// 加入 ABC123：GET 回 preview，POST …/join 把自己加進去（隊伍的寶圖加上自己帶來、隊伍裡還沒有的）
const joinsRoom = (preview = room()) => request => {
    if (request.method === 'GET') return { body: preview };
    const own = request.body.initialMaps.filter(map => !preview.treasureMaps.some(item => item.id === map.id));
    const joined = { ...preview, members: [...preview.members, newMember], treasureMaps: [...preview.treasureMaps, ...own.map(map => ({ ...map, addedBy: newMember.id }))] };
    return { body: { room: joined, newMember, memberId: newMember.id, memberToken: TOKEN } };
};
// GET 照常回 room()，送加入（POST）時才用 response
const afterPreview = response => request => (request.method === 'GET' ? { body: room() } : response(request));

const BUSY = { success: false, kind: 'busy', message: '' };
const FORMAT = '代號是 6 碼英文和數字。';
const NOT_FOUND = '找不到隊伍 ABC123。可能打錯了，或隊伍已經解散（24 小時沒有動靜就會解散）。';
const FULL = '隊伍 ABC123 已經滿 8 人了。';
const MAP_LIMIT_GENERIC = '隊伍清單最多 8 張，加上你的寶圖會超過。選「不帶」，或先刪掉幾張再加入。';
const NETWORK = '連不上隊伍伺服器，請稍後再試。';
const JOIN_FAILED = '加入失敗，請再試一次。';
const CREATE_FAILED = '建立失敗，請再試一次。';
const OVER_LIMIT = '隊伍清單最多 8 張：先把清單刪到 8 張以內，或選「不帶」。';
const INVALID_MAPS = '你的清單裡有隊伍不支援的寶圖。選「不帶」，或先把它們刪掉。';

test('room-collaboration.js 與 room-dialogs.js 都沒有 confirm(：建立、加入、離開、移出的確認都在頁內對話框裡', () => {
    for (const file of ['room-collaboration.js', 'room-dialogs.js']) {
        const source = fs.readFileSync(path.join(__dirname, '..', 'tools/treasure-map-finder', file), 'utf8');
        assert.deepEqual(source.split('\n').filter(line => /\bconfirm\(/.test(line)), [], file);
    }
});

// ---------- 離開、移出：回傳結果，訊息、對話框與焦點是呼叫的人（RoomDialogs）的事 ----------
// leaveRoom()／removeMember() 回傳 { success: true } 或 { success: false, message }：自己不關對話框、不移動焦點，失敗也不跳 toast。
// 結果是在 vm 裡建出來的物件，原型和測試端不同，assert.deepEqual 前先用 plain() 轉過
const LEAVE_FAILED = '離開失敗，請稍後再試。';
const SYNC_FAILED = '你的變更還沒送出，請稍後再試。';
const REMOVE_FAILED = '移出失敗，請稍後再試。';
// 已經在隊伍裡（自己是隊長、Mate 是隊友）。輪詢不真的開始，數一數被要求開始幾次
const inParty = (respond, options) => {
    const state = setup(respond, options);
    const polls = { count: 0 };
    state.client.startPolling = () => { polls.count++; };
    state.client.adoptSession(room([], [member, mate]), member, TOKEN, [], { poll: false });
    return { ...state, polls };
};

test('leaveRoom 成功：回傳 { success: true }，跳「已離開隊伍」；quiet 時不跳；清空要選才清，自己不關對話框', async () => {
    for (const quiet of [false, true]) {
        for (const keepList of [true, false]) {
            const state = inParty(request => (request.method === 'POST' ? { body: { message: 'Left' } } : { body: room() }));
            state.finder.listManager.add(sample);
            const result = await state.client.leaveRoom(keepList, { quiet });
            const label = `quiet=${quiet} keepList=${keepList}`;
            assert.deepEqual(plain(result), { success: true }, label);
            assert.equal(state.client.currentRoom, null, label);
            assert.equal(state.finder.listManager.getLength(), keepList ? 1 : 0, label);
            assert.deepEqual(state.toasts, quiet ? [] : ['已離開隊伍'], label);
            assert.equal(state.polls.count, 0, `${label}：離開了，沒有輪詢可以開始`);
        }
    }
});

test('leaveRoom 失敗：回傳 { success: false, message }（連不上、429、5xx、其他 4xx 都是「離開失敗，請稍後再試。」），不跳 toast、清單不動、還在隊伍裡；quiet 是 false 恢復輪詢，true 不恢復（由呼叫的人決定）', async () => {
    const failures = {
        '連不上（沒有狀態）': () => { throw new TypeError('Failed to fetch'); },
        503: () => ({ status: 503, body: { error: 'Unavailable' } }),
        429: () => ({ status: 429, body: { error: 'Slow down' } }),
        400: () => ({ status: 400, body: { error: 'Invalid request', code: 'INVALID_REQUEST' } })
    };
    for (const quiet of [false, true]) {
        for (const [label, fail] of Object.entries(failures)) {
            const state = inParty(request => (request.method === 'POST' ? fail() : { body: room() }));
            state.finder.listManager.add(sample);
            const result = await state.client.leaveRoom(false, { quiet });
            const name = `${label} quiet=${quiet}`;
            assert.deepEqual(plain(result), { success: false, message: LEAVE_FAILED }, name);
            assert.equal(state.client.currentRoom.roomCode, 'ABC123', name);
            assert.equal(state.client.memberToken, TOKEN, name);
            assert.equal(state.finder.listManager.getLength(), 1, `${name}：選了清空，離開成功才清`);
            assert.deepEqual(state.toasts, [], `${name}：不跳 toast`);
            assert.deepEqual([state.client.isLeaving, state.client.isConnecting], [false, false], name);
            assert.equal(state.polls.count, quiet ? 0 : 1, `${name}：輪詢`);
        }
    }
});

test('leaveRoom：變更還沒送完回傳 { success: false, message: 你的變更還沒送出… }，不送離開；quiet 時同樣不恢復輪詢', async () => {
    for (const quiet of [false, true]) {
        const state = setup(request => {
            if (request.method === 'PUT') throw new TypeError('Failed to fetch');
            throw new Error('變更沒送完，不該送離開');
        });
        let polls = 0;
        state.client.startPolling = () => { polls++; };
        const pending = [{ clientRequestId: webcrypto.randomUUID(), operations: [{ type: 'add', map: state.finder.toRoomMap(sample) }] }];
        state.client.adoptSession(room(), member, TOKEN, pending, { poll: false });
        assert.deepEqual(plain(await state.client.leaveRoom(true, { quiet })), { success: false, message: SYNC_FAILED }, `quiet=${quiet}`);
        assert.deepEqual(state.requests.map(request => request.method), ['PUT'], `quiet=${quiet}`);
        assert.equal(state.client.currentRoom.roomCode, 'ABC123', `quiet=${quiet}`);
        assert.equal(polls, quiet ? 0 : 1, `quiet=${quiet}`);
    }
});

test('leaveRoom：不在隊伍裡、或正在連線時什麼都不做（不送請求、不動清單），回傳失敗；途中隊伍就沒了（被移出）時也不多做事', async () => {
    const outside = setup(() => { throw new Error('不該送請求'); });
    outside.finder.listManager.add(sample);
    assert.deepEqual(plain(await outside.client.leaveRoom(false)), { success: false, message: LEAVE_FAILED });
    assert.equal(outside.finder.listManager.getLength(), 1);
    assert.equal(outside.requests.length, 0);

    const connecting = inParty(() => { throw new Error('不該送請求'); });
    connecting.client.setConnecting(true);
    assert.deepEqual(plain(await connecting.client.leaveRoom(true)), { success: false, message: LEAVE_FAILED });
    assert.equal(connecting.requests.length, 0);
    assert.equal(connecting.client.isConnecting, true, '別人的連線中不被這一次改掉');
    assert.equal(connecting.client.isLeaving, false);

    // 離開途中隊伍已經被別的路徑結束了（例如變更被伺服器拒絕、連線失效）：沒有東西可離開，回傳失敗但沒有訊息（原因已經由那條路徑說過了）
    let resolve;
    const delayed = new Promise(done => { resolve = done; });
    const ended = inParty(() => delayed);
    ended.finder.listManager.add(sample);
    const leaving = ended.client.leaveRoom(false);
    await new Promise(done => setImmediate(done));
    ended.client.forceLeaveRoom();
    resolve({ body: { message: 'Left' } });
    assert.deepEqual(plain(await leaving), { success: false, message: '' });
    assert.equal(ended.finder.listManager.getLength(), 1, '沒有走完離開，清單不動');
    assert.deepEqual(ended.toasts, []);
    assert.deepEqual([ended.client.isLeaving, ended.client.isConnecting], [false, false]);
});

test('removeMember：不問 confirm()（頁面替身的 confirm 一被呼叫就丟錯），帶隊長的憑證與 targetMemberId；成功回傳 { success: true } 並跳「已將 Mate 移出隊伍」', async () => {
    const state = inParty(() => ({ body: room([], [member], 1) }));
    const result = await state.client.removeMember(mate);
    assert.deepEqual(plain(result), { success: true });
    assert.equal(state.requests.length, 1);
    const [request] = state.requests;
    assert.equal(request.url.endsWith('/rooms/ABC123/remove-member'), true);
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(request.body.targetMemberId, 'mate');
    assert.match(request.body.clientRequestId, /^[a-f0-9-]{36}$/);
    assert.deepEqual(plain(state.client.currentRoom.members.map(item => item.id)), ['creator'], '伺服器回的隊伍已經換上了');
    assert.deepEqual(state.toasts, ['已將 Mate 移出隊伍']);
});

test('removeMember 失敗：回傳 { success: false, message: 移出失敗，請稍後再試。 }，不跳 toast、隊伍不動；不在隊伍裡什麼都不做；途中隊伍沒了不回報、也不跳 toast', async () => {
    const failing = inParty(() => ({ status: 503, body: { error: 'Unavailable' } }));
    assert.deepEqual(plain(await failing.client.removeMember(mate)), { success: false, message: REMOVE_FAILED });
    assert.deepEqual(failing.toasts, []);
    assert.deepEqual(plain(failing.client.currentRoom.members.map(item => item.id)), ['creator', 'mate']);

    const outside = setup(() => { throw new Error('不該送請求'); });
    assert.deepEqual(plain(await outside.client.removeMember(mate)), { success: false, message: REMOVE_FAILED });
    assert.equal(outside.requests.length, 0);

    let resolve;
    const delayed = new Promise(done => { resolve = done; });
    const ended = inParty(() => delayed);
    const removing = ended.client.removeMember(mate);
    await new Promise(done => setImmediate(done));
    ended.client.forceLeaveRoom();
    resolve({ body: room([], [member], 1) });
    assert.deepEqual(plain(await removing), { success: false, message: '' });
    assert.deepEqual(ended.toasts, []);
    assert.equal(ended.client.currentRoom, null, '舊的回應不會把隊伍接回來');
});

test('createRoom：預設把本機清單帶進隊伍；clearLocal 時 initialMaps 是空的，成功後本機清單是隊伍清單（空的）', async () => {
    const bring = setup(createsRoom);
    addLocalMaps(bring, 2);
    assert.deepEqual(plain(await bring.client.createRoom()), { success: true });
    assert.deepEqual(bring.requests[0].body.initialMaps.map(map => map.id), ['local_0', 'local_1']);
    assert.deepEqual(localIds(bring), ['local_0', 'local_1'], '帶進去的就是隊伍清單');
    assert.equal(bring.client.currentRoom.roomCode, 'ABC123');

    const clear = setup(createsRoom);
    addLocalMaps(clear, 2);
    assert.deepEqual(plain(await clear.client.createRoom({ clearLocal: true })), { success: true });
    assert.deepEqual(clear.requests[0].body.initialMaps, []);
    assert.equal(clear.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(localIds(clear), [], '本機清單成了隊伍清單（空的）');
    assert.deepEqual(clear.toasts, ['隊伍 ABC123 建立成功！']);
});

test('清單 9 張、帶進：createRoom 回 map_limit 與「隊伍清單最多 8 張」的字，不送請求；clearLocal 時照常建立；剛好 8 張可以帶', async () => {
    const state = setup(createsRoom);
    addLocalMaps(state, 9);
    assert.deepEqual(plain(await state.client.createRoom()), { success: false, kind: 'map_limit', message: OVER_LIMIT });
    assert.equal(state.requests.length, 0);
    assert.equal(state.client.isConnecting, false);
    assert.equal(state.client.currentRoom, null);
    assert.equal(state.finder.listManager.getLength(), 9, '清單沒動');
    assert.deepEqual(state.toasts, [], '訊息交給呼叫的人，這裡不跳 toast');

    assert.deepEqual(plain(await state.client.createRoom({ clearLocal: true })), { success: true });
    assert.deepEqual(state.requests[0].body.initialMaps, []);
    assert.deepEqual(localIds(state), []);

    const eight = setup(createsRoom);
    addLocalMaps(eight, 8);
    assert.deepEqual(plain(await eight.client.createRoom()), { success: true });
    assert.equal(eight.requests[0].body.initialMaps.length, 8);
});

test('createRoom 的錯誤：連不上與其他都回 kind 與建立的字，不跳 toast；請求留著給重試的只有連不上', async () => {
    // [說明, 伺服器, kind, 訊息, 請求留著給重試]
    const cases = [
        ['fetch 失敗', () => { throw new TypeError('Failed to fetch'); }, 'network', NETWORK, true],
        ['503', () => ({ status: 503, body: { error: 'Service unavailable' } }), 'network', NETWORK, true],
        ['429', () => ({ status: 429, body: { error: 'Too many requests' } }), 'network', NETWORK, true],
        ['其他 4xx', () => ({ status: 400, body: { error: 'Invalid nickname', code: 'INVALID_REQUEST' } }), 'failed', CREATE_FAILED, false]
    ];
    for (const [label, respond, kind, message, kept] of cases) {
        const state = setup(respond);
        addLocalMaps(state, 1);
        assert.deepEqual(plain(await state.client.createRoom()), { success: false, kind, message }, label);
        assert.deepEqual(pathsOf(state), ['POST /rooms'], label);
        assert.deepEqual(state.toasts, [], label);
        assert.equal(state.client.currentRoom, null, label);
        assert.equal(state.client.isConnecting, false, label);
        assert.equal(state.finder.listManager.getLength(), 1, `${label}：本機清單沒動`);
        assert.equal(state.client.connectionAttempt !== null, kept, label);
    }
});

test('joinRoom 的代號格式不對：回 format，不送請求', async () => {
    const state = setup(() => { throw new Error('格式不對不該送請求'); });
    addLocalMaps(state, 1);
    for (const code of ['', 'ABC12', 'ABC1234', 'abc123', 'AB-123', 'AB C12']) {
        assert.deepEqual(plain(await state.client.joinRoom(code)), { success: false, kind: 'format', message: FORMAT }, JSON.stringify(code));
    }
    assert.equal(state.requests.length, 0);
    assert.equal(state.client.isConnecting, false);
    assert.deepEqual(state.toasts, []);
});

test('joinRoom 的錯誤：找不到、滿了、超過 8 張、連不上、其他：都回 kind 與訊息，不跳 toast，不動本機清單', async () => {
    // [說明, 本機張數, 伺服器, kind, 訊息, 送出的請求, 送出後請求還留著給重試嗎（沒寫就不看）]
    const cases = [
        ['讀隊伍時 404', 0, () => ({ status: 404, body: { error: 'Room not found', code: 'ROOM_NOT_FOUND' } }), 'not_found', NOT_FOUND, [GET]],
        ['404 沒有 code 也是找不到', 0, () => ({ status: 404, body: { error: 'Not found' } }), 'not_found', NOT_FOUND, [GET]],
        ['讀到的成員已經 8 人：不送加入', 0, () => ({ body: room([], eightMembers) }), 'full', FULL, [GET]],
        ['帶進的合計超過 8（隊伍 5 張、自己 4 張）：訊息帶這兩個數字，不送加入', 4, () => ({ body: room(serverMaps(5)) }), 'map_limit',
            '隊伍清單已經有 5 張，加上你的 4 張會超過 8 張。選「不帶」，或先刪掉幾張再加入。', [GET]],
        ['加入時伺服器回 ROOM_FULL', 0, afterPreview(() => ({ status: 400, body: { error: 'Room is full', code: 'ROOM_FULL' } })), 'full', FULL, [GET, JOIN], false],
        ['加入時伺服器回 MAP_LIMIT：沒有張數可寫，用通用的字', 1,
            afterPreview(() => ({ status: 400, body: { error: 'Room can contain at most 8 treasure maps', code: 'MAP_LIMIT' } })), 'map_limit', MAP_LIMIT_GENERIC, [GET, JOIN], false],
        ['讀隊伍時 fetch 失敗', 0, () => { throw new TypeError('Failed to fetch'); }, 'network', NETWORK, [GET]],
        ['加入時 fetch 失敗：請求留著給重試', 0, afterPreview(() => { throw new TypeError('Failed to fetch'); }), 'network', NETWORK, [GET, JOIN], true],
        ['5xx 也是連不上', 0, () => ({ status: 503, body: { error: 'Service unavailable' } }), 'network', NETWORK, [GET]],
        ['429 也是連不上：請求留著給重試', 0, afterPreview(() => ({ status: 429, body: { error: 'Too many requests' } })), 'network', NETWORK, [GET, JOIN], true],
        ['其他 4xx（REQUEST_ALREADY_COMPLETED）：加入失敗', 0,
            afterPreview(() => ({ status: 409, body: { error: 'This member session has ended', code: 'REQUEST_ALREADY_COMPLETED' } })), 'failed', JOIN_FAILED, [GET, JOIN], false],
        ['其他 4xx（INVALID_REQUEST）：加入失敗', 0,
            afterPreview(() => ({ status: 400, body: { error: 'Invalid nickname', code: 'INVALID_REQUEST' } })), 'failed', JOIN_FAILED, [GET, JOIN], false]
    ];
    for (const [label, local, respond, kind, message, paths, kept] of cases) {
        const state = setup(respond);
        addLocalMaps(state, local);
        assert.deepEqual(plain(await state.client.joinRoom('ABC123')), { success: false, kind, message }, label);
        assert.deepEqual(pathsOf(state), paths, label);
        assert.deepEqual(state.toasts, [], `${label}：訊息交給呼叫的人，這裡不跳 toast`);
        assert.equal(state.client.currentRoom, null, label);
        assert.equal(state.client.isConnecting, false, label);
        assert.equal(state.finder.listManager.getLength(), local, `${label}：本機清單沒動`);
        if (kept !== undefined) assert.equal(state.client.connectionAttempt !== null, kept, `${label}：重試的請求${kept ? '留著' : '清掉'}`);
    }
});

test('joinRoom：帶進的合計以 id 去重再算：隊伍 5 張、自己 4 張但 2 張是同一個 id，合計 7 張可以加入', async () => {
    const state = setup(joinsRoom(room(serverMaps(5))));
    for (const map of [...importMaps(2, 'room'), ...importMaps(2, 'mine')]) state.finder.listManager.add(map);
    assert.deepEqual(plain(await state.client.joinRoom('ABC123')), { success: true });
    assert.deepEqual(pathsOf(state), [GET, JOIN]);
    assert.equal(state.client.currentRoom.roomCode, 'ABC123');
    assert.equal(state.finder.listManager.getLength(), 7);
});

test('joinRoom：預設把本機清單帶進隊伍；clearLocal 時 initialMaps 是空的，加入後本機清單變成隊伍清單', async () => {
    const bring = setup(joinsRoom(room(serverMaps(3))));
    addLocalMaps(bring, 2);
    assert.deepEqual(plain(await bring.client.joinRoom('ABC123')), { success: true });
    assert.deepEqual(bring.requests[1].body.initialMaps.map(map => map.id), ['local_0', 'local_1']);
    assert.deepEqual(localIds(bring), ['room_0', 'room_1', 'room_2', 'local_0', 'local_1']);

    const clear = setup(joinsRoom(room(serverMaps(3))));
    addLocalMaps(clear, 2);
    assert.deepEqual(plain(await clear.client.joinRoom('ABC123', { clearLocal: true })), { success: true });
    assert.deepEqual(clear.requests[1].body.initialMaps, []);
    assert.deepEqual(localIds(clear), ['room_0', 'room_1', 'room_2'], '本機清單變成隊伍清單');
    assert.deepEqual(clear.toasts, ['成功加入隊伍 ABC123']);
});

test('清單裡有 id 帶空白（或其他隊伍不收）的自訂寶圖：帶進時 create 與 join 都回 invalid_maps、不送請求；clearLocal 時照常進行', async () => {
    for (const [label, invalid] of [['id 有空白', { id: 'custom map' }], ['id 有斜線', { id: 'bad/id' }], ['等級不是 g1～g18', { level: 'g19' }]]) {
        for (const action of ['create', 'join']) {
            const name = `${label}、${action}`;
            const state = setup(action === 'create' ? createsRoom : joinsRoom());
            state.finder.listManager.add(sample);
            state.finder.listManager.add({ ...sample, id: 'custom_map', ...invalid });
            const connect = options => (action === 'create' ? state.client.createRoom(options) : state.client.joinRoom('ABC123', options));

            assert.deepEqual(plain(await connect()), { success: false, kind: 'invalid_maps', message: INVALID_MAPS }, name);
            assert.equal(state.requests.length, 0, `${name}：不送任何請求`);
            assert.equal(state.client.isConnecting, false, name);
            assert.deepEqual(state.toasts, [], name);
            assert.equal(state.finder.listManager.getLength(), 2, `${name}：清單原封不動`);

            // 選「不帶」：自訂寶圖不送出去，照常進行
            assert.deepEqual(plain(await connect({ clearLocal: true })), { success: true }, name);
            assert.deepEqual(state.requests.find(request => request.method === 'POST').body.initialMaps, [], name);
        }
    }
});

test('連線中再按一次：第二次回 busy（沒有訊息），只送出一個請求；已經在隊伍裡也是 busy', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const state = setup(async request => { await gate; return createsRoom(request); });
    // busy 是立刻回傳的；如果退步成又送出一個請求，它會卡在 gate 上，這裡讓出一輪就判它失敗，不讓測試卡住
    const immediate = promise => Promise.race([promise, new Promise(resolve => setImmediate(() => resolve('卡在連線上')))]);
    const first = state.client.createRoom();
    try {
        assert.equal(state.client.isConnecting, true);
        assert.deepEqual(plain(await immediate(state.client.createRoom())), BUSY);
        assert.deepEqual(plain(await immediate(state.client.joinRoom('XYZ789'))), BUSY, '連線中加入也一樣');
        assert.equal(state.requests.length, 1, '只送出一個請求');
        assert.equal(state.client.isConnecting, true, 'busy 的呼叫不能把第一個的連線中狀態關掉');
    } finally {
        release();
    }
    assert.deepEqual(plain(await first), { success: true });
    assert.equal(state.client.isConnecting, false);

    assert.deepEqual(plain(await state.client.createRoom()), BUSY, '已經在隊伍裡');
    assert.deepEqual(plain(await state.client.joinRoom('XYZ789')), BUSY, '已經在隊伍裡');
    assert.equal(state.requests.length, 1);
    assert.deepEqual(state.toasts, ['隊伍 ABC123 建立成功！']);
});

test('joinRoom 的 nickname 參數原樣送出，沒給就是預設名字；重試時沿用第一次送的名字', async () => {
    const stored = { ff14tw_nickname_tag: 'K7Q', ff14tw_user_nickname: 'Alice' };
    const given = setup(joinsRoom(), { stored });
    await given.client.joinRoom('ABC123', { nickname: 'Warrior of Light T8W' });
    assert.equal(given.requests[1].body.memberNickname, 'Warrior of Light T8W', '給的名字原樣送，不看存著的 Alice');

    const omitted = setup(joinsRoom(), { stored });
    await omitted.client.joinRoom('ABC123');
    assert.equal(omitted.requests[1].body.memberNickname, 'Alice', '沒給就是 defaultNickname()');

    // 第一次送出的內容（名字、清單）固定：伺服器可能已經收下，重試要送一模一樣的
    let attempts = 0;
    const retried = setup(request => {
        if (request.method === 'POST' && ++attempts === 1) throw new TypeError('Response lost');
        return joinsRoom()(request);
    }, { stored });
    assert.equal((await retried.client.joinRoom('ABC123', { nickname: '第一次寫的名字' })).kind, 'network');
    assert.deepEqual(plain(await retried.client.joinRoom('ABC123', { nickname: '第二次改的名字' })), { success: true });
    const joins = retried.requests.filter(request => request.method === 'POST');
    assert.equal(joins.length, 2);
    assert.deepEqual(joins[1].body, joins[0].body);
    assert.equal(joins[1].body.memberNickname, '第一次寫的名字');
});

test('重試同一個加入時，人數滿了也不擋：上一次可能已經成功（回應掉了），伺服器會把同一個成員還回來', async () => {
    const seven = [member, ...Array.from({ length: 6 }, (_, index) => ({ id: `member_${index}`, nickname: `Member ${index}` }))];
    let serverRoom = room([], seven);
    let attempts = 0;
    const state = setup(request => {
        if (request.method === 'GET') return { body: serverRoom };
        if (++attempts === 1) {
            serverRoom = room([], [...seven, newMember]);
            throw new TypeError('Join committed, but response was lost');
        }
        return { body: { room: serverRoom, newMember, memberId: newMember.id, memberToken: TOKEN } };
    });
    assert.equal((await state.client.joinRoom('ABC123')).kind, 'network');
    assert.deepEqual(plain(await state.client.joinRoom('ABC123')), { success: true });
    assert.deepEqual(pathsOf(state), [GET, JOIN, GET, JOIN]);
    assert.equal(state.client.currentUser.id, newMember.id);
    assert.equal(state.client.currentRoom.members.length, 8);
});

test('重試途中隊伍的張數加上新加的圖超過 8：回 map_limit 與通用的字，不跳 toast，不接上隊伍', async () => {
    const others = serverMaps(7);
    let attempts = 0;
    const state = setup(request => {
        if (request.method === 'GET') return { body: room(others) };
        if (++attempts === 1) throw new TypeError('Response lost');
        return { body: { room: room(others, [member, newMember]), newMember, memberId: newMember.id, memberToken: TOKEN } };
    });
    assert.equal((await state.client.joinRoom('ABC123')).kind, 'network');
    addLocalMaps(state, 2);
    assert.deepEqual(plain(await state.client.joinRoom('ABC123')), { success: false, kind: 'map_limit', message: MAP_LIMIT_GENERIC });
    assert.equal(state.client.currentRoom, null);
    assert.equal(state.client.isConnecting, false);
    assert.deepEqual(state.toasts, []);
    assert.equal(state.finder.listManager.getLength(), 2);
});

test('重試途中新加的圖：接上隊伍時排進佇列的那一筆記成自己的（同 toggleMapInList()），伺服器還沒收下時清單上就是自己的圖、算在自己的張數裡', async () => {
    let attempts = 0;
    const state = setup(request => {
        if (request.method === 'GET') return { body: room() };
        if (request.method === 'PUT') throw new TypeError('Failed to fetch');
        if (++attempts === 1) throw new TypeError('Join committed, but response was lost');
        return { body: { room: room([], [member, newMember]), newMember, memberId: newMember.id, memberToken: TOKEN } };
    });
    assert.equal((await state.client.joinRoom('ABC123')).kind, 'network');
    addLocalMaps(state, 1, 'later');
    assert.deepEqual(plain(await state.client.joinRoom('ABC123')), { success: true });
    // 送不出去（PUT 連不上）：那一筆留在佇列裡等重送，這段時間它也要是自己的
    const queued = Array.from(state.client.mapSync.pending.flatMap(batch => batch.operations), operation => [operation.type, operation.map.id, operation.map.addedBy]);
    assert.deepEqual(queued, [['add', 'later_0', newMember.id]]);
    assert.equal(state.client.mapSync.getMaps().find(map => map.id === 'later_0').addedBy, newMember.id, '隊伍的寶圖（含還沒送出的）裡它是自己的');
    assert.equal(state.finder.listManager.getList().find(map => map.id === 'later_0').addedBy, newMember.id, '清單上誰的圖也是自己');
});

test('舊的唯讀隊伍：讀到 readOnly、加入時 ROOM_RECREATE_REQUIRED 都由 recoverLegacyRoom() 提示一次，回 legacy 與空字串；沒附隊伍的當作一般失敗', async () => {
    const shared = { id: 'unknown_old_map', type: 'g8', x: 20, y: 25, zone: 'Old zone' };
    const legacy = { ...room([shared]), readOnly: true, legacy: true };
    const notice = '此隊伍已轉為唯讀，寶圖已保留在本機，請建立新隊伍。';

    const preview = setup(() => ({ body: legacy }));
    preview.finder.listManager.add(sample);
    assert.deepEqual(plain(await preview.client.joinRoom('ABC123')), { success: false, kind: 'legacy', message: '' });
    assert.deepEqual(pathsOf(preview), [GET]);
    assert.deepEqual(preview.toasts, [notice]);
    assert.deepEqual(localIds(preview), [sample.id, shared.id], '寶圖留在本機');

    const blocked = setup(afterPreview(() => ({ status: 409, body: { error: 'This legacy room is read-only', code: 'ROOM_RECREATE_REQUIRED', room: legacy } })));
    blocked.finder.listManager.add(sample);
    assert.deepEqual(plain(await blocked.client.joinRoom('ABC123')), { success: false, kind: 'legacy', message: '' });
    assert.deepEqual(pathsOf(blocked), [GET, JOIN]);
    assert.deepEqual(blocked.toasts, [notice]);
    assert.deepEqual(localIds(blocked), [sample.id, shared.id]);

    const bare = setup(afterPreview(() => ({ status: 409, body: { error: 'This legacy room is read-only', code: 'ROOM_RECREATE_REQUIRED' } })));
    assert.deepEqual(plain(await bare.client.joinRoom('ABC123')), { success: false, kind: 'failed', message: JOIN_FAILED });
    assert.deepEqual(bare.toasts, []);
});

test('RoomCollaboration.errorKind：404 與 ROOM_NOT_FOUND 是 not_found；ROOM_FULL、MAP_LIMIT、ROOM_RECREATE_REQUIRED 各一種；沒有 status、5xx、429 是 network；其他是 failed', () => {
    const { context } = setup(() => ({ body: room() }));
    const RoomCollaboration = vm.runInContext('RoomCollaboration', context);
    const cases = [
        ['404', { status: 404 }, 'not_found'], ['404 與 code', { status: 404, code: 'ROOM_NOT_FOUND' }, 'not_found'], ['只有 code', { code: 'ROOM_NOT_FOUND' }, 'not_found'],
        ['ROOM_FULL', { status: 400, code: 'ROOM_FULL' }, 'full'], ['MAP_LIMIT', { status: 400, code: 'MAP_LIMIT' }, 'map_limit'],
        ['ROOM_RECREATE_REQUIRED', { status: 409, code: 'ROOM_RECREATE_REQUIRED' }, 'legacy'],
        ['fetch 失敗（沒有 status）', new TypeError('Failed to fetch'), 'network'], ['500', { status: 500 }, 'network'], ['503', { status: 503 }, 'network'], ['429', { status: 429 }, 'network'],
        ['INVALID_REQUEST', { status: 400, code: 'INVALID_REQUEST' }, 'failed'], ['401', { status: 401 }, 'failed'], ['403', { status: 403 }, 'failed'],
        ['REQUEST_ALREADY_COMPLETED', { status: 409, code: 'REQUEST_ALREADY_COMPLETED' }, 'failed']
    ];
    for (const [label, error, kind] of cases) assert.equal(RoomCollaboration.errorKind(error), kind, label);
});

test('RoomCollaboration.errorMessage：每種 kind 的字；map_limit 有 room 與 mine 才寫張數；failed 在建立時是建立失敗；busy 與 legacy 是空字串', () => {
    const { context } = setup(() => ({ body: room() }));
    const RoomCollaboration = vm.runInContext('RoomCollaboration', context);
    const errorMessage = (kind, options) => RoomCollaboration.errorMessage(kind, options);
    assert.equal(errorMessage('format'), FORMAT);
    assert.equal(errorMessage('not_found', { code: 'XYZ789' }), '找不到隊伍 XYZ789。可能打錯了，或隊伍已經解散（24 小時沒有動靜就會解散）。');
    assert.equal(errorMessage('full', { code: 'XYZ789' }), '隊伍 XYZ789 已經滿 8 人了。');
    assert.equal(errorMessage('map_limit', { room: 5, mine: 4 }), '隊伍清單已經有 5 張，加上你的 4 張會超過 8 張。選「不帶」，或先刪掉幾張再加入。');
    assert.equal(errorMessage('map_limit', { room: 0, mine: 9 }), '隊伍清單已經有 0 張，加上你的 9 張會超過 8 張。選「不帶」，或先刪掉幾張再加入。', '0 張也要寫出來');
    assert.equal(errorMessage('map_limit'), MAP_LIMIT_GENERIC);
    assert.equal(errorMessage('map_limit', { room: 5 }), MAP_LIMIT_GENERIC, '只有一個數字寫不出整句：通用的字');
    assert.equal(errorMessage('invalid_maps'), INVALID_MAPS);
    assert.equal(errorMessage('network'), NETWORK);
    assert.equal(errorMessage('failed'), JOIN_FAILED);
    assert.equal(errorMessage('failed', { creating: true }), CREATE_FAILED);
    assert.equal(errorMessage('busy'), '');
    assert.equal(errorMessage('legacy'), '');
});

test('入口把結果接起來：建立鈕（清單是空的）失敗時跳回傳的訊息；成功只有成功的 toast；busy 不多跳；網址的 ?room= 自動加入失敗時也跳訊息（加入的對話框把失敗寫在代號欄下面，由 treasure-party.test.js 用真的頁面測）', async () => {
    const failing = setup(() => ({ status: 503, body: { error: 'Service unavailable' } }));
    await failing.client.dialogs.openCreate();
    assert.deepEqual(failing.toasts, [NETWORK]);

    const creating = setup(createsRoom);
    await creating.client.dialogs.openCreate();
    assert.deepEqual(creating.toasts, ['隊伍 ABC123 建立成功！']);
    await creating.client.dialogs.openCreate();
    assert.deepEqual(creating.toasts, ['隊伍 ABC123 建立成功！'], '已經在隊伍裡：busy 沒有訊息，不多跳');

    // 網址的 ?room=：載入時自動加入，失敗跳訊息，成功只有成功的 toast
    const link = 'http://localhost:8765/tools/treasure-map-finder/?room=abc123';
    const linkedFailure = setup(() => ({ status: 404, body: { error: 'Room not found', code: 'ROOM_NOT_FOUND' } }));
    linkedFailure.window.location.href = link;
    await linkedFailure.client.checkExistingRoom();
    assert.deepEqual(linkedFailure.toasts, [NOT_FOUND]);

    const linkedSuccess = setup(joinsRoom());
    linkedSuccess.window.location.href = link;
    await linkedSuccess.client.checkExistingRoom();
    assert.deepEqual(linkedSuccess.toasts, ['成功加入隊伍 ABC123']);
});

test('建立、加入的新字串：十個新鍵值三語都照設計寫；舊的 confirm 與錯誤字串三語都刪掉了；新字沒有舊用語', () => {
    const file = 'assets/js/i18n/translations/tools/treasure-map-finder.js';
    // key → [zh, en, ja]
    const added = {
        treasure_map_join_error_format: ['代號是 6 碼英文和數字。', 'The code is 6 letters and numbers.', 'コードは英数字 6 文字です。'],
        treasure_map_join_error_not_found: ['找不到隊伍 {code}。可能打錯了，或隊伍已經解散（24 小時沒有動靜就會解散）。',
            'Party {code} wasn\'t found. The code may be mistyped, or the party has ended (parties end after 24 hours without activity).',
            'パーティ {code} が見つかりません。コードの入力ミスか、パーティが解散した可能性があります（24 時間動きがないと解散します）。'],
        treasure_map_join_error_full: ['隊伍 {code} 已經滿 8 人了。', 'Party {code} is full (8 members).', 'パーティ {code} は満員です（8 人）。'],
        treasure_map_join_error_map_limit: ['隊伍清單已經有 {room} 張，加上你的 {mine} 張會超過 8 張。選「不帶」，或先刪掉幾張再加入。',
            'The party list ({room}) and your maps ({mine}) together would exceed 8. Choose "Don\'t bring them", or remove some first.',
            'パーティリストにはすでに {room} 枚あり、あなたの {mine} 枚を加えると 8 枚を超えます。「持ち込まない」を選ぶか、先に何枚か削除してください。'],
        treasure_map_join_error_map_limit_generic: ['隊伍清單最多 8 張，加上你的寶圖會超過。選「不帶」，或先刪掉幾張再加入。',
            'A party list holds up to 8 maps, and yours would go over. Choose "Don\'t bring them", or remove some first.',
            'パーティリストは 8 枚までで、あなたの地図を加えると超えてしまいます。「持ち込まない」を選ぶか、先に何枚か削除してください。'],
        treasure_map_join_error_network: ['連不上隊伍伺服器，請稍後再試。', 'Can\'t reach the party server. Please try again later.',
            'パーティのサーバーに接続できません。しばらくしてからもう一度お試しください。'],
        treasure_map_join_error_failed: ['加入失敗，請再試一次。', 'Couldn\'t join. Please try again.', '参加できませんでした。もう一度お試しください。'],
        treasure_map_create_error_failed: ['建立失敗，請再試一次。', 'Couldn\'t create the party. Please try again.', 'パーティを作成できませんでした。もう一度お試しください。'],
        treasure_map_party_invalid_maps: ['你的清單裡有隊伍不支援的寶圖。選「不帶」，或先把它們刪掉。',
            'Your list has maps a party can\'t hold. Choose "Don\'t bring them", or remove those maps first.',
            'あなたのリストにはパーティで扱えない地図があります。「持ち込まない」を選ぶか、先に削除してください。'],
        treasure_map_party_over_limit: ['隊伍清單最多 8 張：先把清單刪到 8 張以內，或選「不帶」。',
            'A party list holds up to 8 maps: shorten your list to 8 or fewer, or choose "Don\'t bring them".',
            'パーティリストは 8 枚までです：リストを 8 枚以下にするか、「持ち込まない」を選んでください。']
    };
    const removed = [
        'treasure_map_create_room_local_maps_confirm', 'treasure_map_join_room_local_maps_confirm',
        'treasure_map_create_room_failed', 'treasure_map_create_room_failed_retry', 'treasure_map_join_room_failed', 'treasure_map_join_room_failed_retry',
        'treasure_map_room_not_found', 'treasure_map_room_full', 'treasure_map_invalid_room_code', 'treasure_map_browser_room_limit',
        // 合計超過 8 張的三個地方（建立、加入、重試途中）都改成上面的字，沒有人用了
        'treasure_map_local_maps_limit'
    ];
    const oldWords = { zh: /房間/, en: /\b(?:room|team)\b/i, ja: /ルーム|チーム/ };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(file, lang);
        for (const [key, texts] of Object.entries(added)) {
            assert.equal(values.get(key), texts[index], `${lang} ${key}`);
            // {room} 是張數的參數名稱，不是字：掃用語之前先拿掉 {…}
            assert.doesNotMatch(texts[index].replace(/\{\w+\}/g, ''), oldWords[lang], `${lang} ${key} 還有舊用語`);
        }
        const keys = translationKeySet(file, lang);
        for (const key of removed) assert.equal(keys.has(key), false, `${lang} 還有 ${key}`);
    });
});
