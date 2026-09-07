const test = require('node:test');
const assert = require('node:assert/strict');
const RoomMapSync = require('../tools/treasure-map-finder/room-map-sync.js');

const map = id => ({ id, type: 'G8', zone: 'Test', x: 10, y: 20 });
const room = (revision, ids, roomCode = 'ABC123') => ({ roomCode, revision, treasureMaps: ids.map(map) });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function setup(send) {
    let sequence = 0;
    const views = [], errors = [];
    const sync = new RoomMapSync({ send, onChange: (room, maps) => views.push({ revision: room.revision, ids: maps.map(map => map.id) }), onError: error => errors.push(error), createRequestId: () => `request-${++sequence}` });
    sync.connect(room(0, []));
    return { sync, views, errors };
}

test('polling merges remote changes with pending local edits and sends only operations', async () => {
    const response = deferred();
    const requests = [];
    const { sync, views } = setup((code, batch) => { requests.push(batch); return response.promise; });
    const sent = sync.replaceLocal([map('local')]);
    await Promise.resolve();
    sync.receive(room(1, ['remote']));
    assert.deepEqual(views.at(-1).ids, ['remote', 'local']);
    assert.deepEqual(requests[0].operations, [{ type: 'add', map: map('local') }]);
    assert.equal(requests[0].treasureMaps, undefined);
    response.resolve(room(2, ['remote', 'local']));
    await sent;
    assert.deepEqual(views.at(-1), { revision: 2, ids: ['remote', 'local'] });
});

test('two rapid edits are serialized without losing the second edit on acknowledgement', async () => {
    const first = deferred(), second = deferred(), requests = [];
    const { sync, views } = setup((code, batch) => { requests.push(batch); return requests.length === 1 ? first.promise : second.promise; });
    const sent = sync.replaceLocal([map('a')]);
    sync.replaceLocal([map('a'), map('b')]);
    await Promise.resolve();
    assert.equal(requests.length, 1);
    first.resolve(room(1, ['a']));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 2);
    assert.deepEqual(views.at(-1).ids, ['a', 'b']);
    assert.deepEqual(requests[1].operations, [{ type: 'add', map: map('b') }]);
    second.resolve(room(2, ['a', 'b']));
    await sent;
});

test('a failed transport retains edits and reuses the batch ID when retried', async () => {
    const requests = [];
    const { sync } = setup(async (code, batch) => {
        requests.push(batch);
        if (requests.length === 1) throw new TypeError('Failed to fetch');
        return room(1, ['a']);
    });
    assert.equal(await sync.replaceLocal([map('a')]), false);
    assert.equal(sync.pending.length, 1);
    await sync.flush();
    assert.equal(requests[0].clientRequestId, requests[1].clientRequestId);
    assert.equal(sync.pending.length, 0);
});

test('old polls and acknowledgements never replace a newer room revision', async () => {
    const response = deferred();
    const { sync, views } = setup(() => response.promise);
    const sent = sync.replaceLocal([map('a')]);
    sync.receive(room(3, ['a', 'b']));
    assert.equal(sync.receive(room(1, [])), false);
    response.resolve(room(2, ['a']));
    await sent;
    assert.deepEqual(views.at(-1), { revision: 3, ids: ['a', 'b'] });
});

test('responses for a disconnected session cannot change the next room', async () => {
    const response = deferred();
    const { sync, views } = setup(() => response.promise);
    const sent = sync.replaceLocal([map('a')]);
    await Promise.resolve();
    sync.disconnect();
    sync.connect(room(0, ['b'], 'DEF456'));
    response.resolve(room(1, ['a']));
    assert.equal(await sent, false);
    assert.deepEqual(views.at(-1).ids, ['b']);
    assert.equal(sync.room.roomCode, 'DEF456');
});

test('clearing the visible list does not remove a concurrent unseen remote addition', async () => {
    const response = deferred(), requests = [];
    const { sync, views } = setup((code, batch) => { requests.push(batch); return response.promise; });
    sync.receive(room(1, ['known']));
    const sent = sync.replaceLocal([]);
    await Promise.resolve();
    sync.receive(room(2, ['known', 'new']));
    assert.deepEqual(views.at(-1).ids, ['new']);
    assert.deepEqual(requests[0].operations, [{ type: 'remove', id: 'known' }]);
    response.resolve(room(3, ['new']));
    await sent;
});

test('persisted pending operations survive reconnection with their original request ID', async () => {
    const pending = [{ clientRequestId: 'original', operations: [{ type: 'add', map: map('a') }] }];
    const requests = [];
    const { sync } = setup(async (code, batch) => { requests.push(batch); return room(1, ['a']); });
    sync.connect(room(0, []), pending);
    assert.deepEqual(sync.getMaps().map(map => map.id), ['a']);
    await sync.flush();
    assert.equal(requests[0].clientRequestId, 'original');
});
