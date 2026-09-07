const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { Miniflare } = require('../api/node_modules/miniflare');

const root = path.join(__dirname, '..');
const workerPath = path.join(root, 'api/treasure-room-worker.js');
const runtimeOptions = {
    modules: true,
    scriptPath: workerPath,
    compatibilityDate: '2026-07-22',
    durableObjects: { ROOMS: { className: 'TreasureRoom', useSQLite: true } },
    kvNamespaces: ['TREASURE_ROOMS'],
    bindings: { ENVIRONMENT: 'development' },
};
let mf;
test.before(async () => {
    mf = new Miniflare(runtimeOptions);
    await mf.ready;
});
test.after(async () => { await mf?.dispose(); });

async function request(method, suffix = '', body, token, instance = mf, origin = 'https://ff14.tw') {
    const response = await instance.dispatchFetch(`https://test.invalid/api/rooms${suffix}`, {
        method,
        headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
}
const map = id => ({ id, type: 'g17', x: 12.3, y: 24.5, zone: 'Urqopacha' });
const add = id => ({ type: 'add', map: map(id) });
const create = (overrides = {}) => request('POST', '', { memberNickname: '隊長', clientRequestId: randomUUID(), ...overrides });
const join = (roomCode, overrides = {}) => request('POST', `/${roomCode}/join`, { memberNickname: '隊員', clientRequestId: randomUUID(), ...overrides });
const update = (room, operations, overrides = {}) => request('PUT', `/${room.roomCode}`, { operations, clientRequestId: randomUUID(), ...overrides }, room.memberToken);

test('create retries return the same room and private session without leaking credentials in GET', async () => {
    const clientRequestId = randomUUID();
    const [first, retry] = await Promise.all([create({ clientRequestId }), create({ clientRequestId })]);
    assert.equal(first.status, 200);
    assert.equal(retry.status, 200);
    assert.equal(first.body.roomCode, retry.body.roomCode);
    assert.equal(first.body.memberToken, retry.body.memberToken);
    assert.equal(first.body.members.length, 1);
    assert.match(first.body.memberToken, /^[0-9a-f]{64}$/);
    const current = await request('GET', `/${first.body.roomCode}`);
    assert.equal(current.body.revision, 1);
    assert.equal(current.body.memberToken, undefined);
    assert.equal(current.body.memberId, undefined);
    assert.ok(!JSON.stringify(current.body).includes(first.body.memberToken));
    assert.equal(current.headers.get('Cache-Control'), 'no-store');
});

test('concurrent joins retain every admitted member and enforce the eight member limit', async () => {
    const { body: room } = await create();
    const responses = await Promise.all(Array.from({ length: 9 }, (_, i) => join(room.roomCode, { memberNickname: `隊員${i}` })));
    assert.equal(responses.filter(response => response.status === 200).length, 7);
    assert.equal(responses.filter(response => response.body.code === 'ROOM_FULL').length, 2);
    const current = (await request('GET', `/${room.roomCode}`)).body;
    assert.equal(current.members.length, 8);
    for (const response of responses.filter(response => response.status === 200)) {
        assert.ok(current.members.some(member => member.id === response.body.memberId));
    }
    const admitted = responses.find(response => response.status === 200).body;
    assert.equal(admitted.room.memberToken, undefined);
});

test('join retries reuse the session and do not re-admit a removed member', async () => {
    const { body: room } = await create();
    const clientRequestId = randomUUID();
    const [first, retry] = await Promise.all([join(room.roomCode, { clientRequestId }), join(room.roomCode, { clientRequestId })]);
    assert.equal(first.body.memberId, retry.body.memberId);
    assert.equal(first.body.memberToken, retry.body.memberToken);
    assert.equal(retry.body.room.members.length, 2);
    const removed = await request('POST', `/${room.roomCode}/remove-member`, { targetMemberId: first.body.memberId }, room.memberToken);
    assert.equal(removed.status, 200);
    const staleJoin = await join(room.roomCode, { clientRequestId });
    assert.equal(staleJoin.status, 409);
    assert.equal(staleJoin.body.code, 'REQUEST_ALREADY_COMPLETED');
});

test('public member IDs cannot impersonate the creator, rename or leave another member', async () => {
    const { body: creator } = await create();
    const { body: joined } = await join(creator.roomCode);
    const suffix = `/${creator.roomCode}`;
    const publicRoom = (await request('GET', suffix)).body;
    const forged = { requesterId: publicRoom.creatorId, targetMemberId: joined.memberId };
    assert.equal((await request('POST', `${suffix}/remove-member`, forged)).status, 401);
    assert.equal((await request('POST', `${suffix}/remove-member`, forged, joined.memberToken)).status, 403);
    assert.equal((await request('POST', `${suffix}/leave`, { memberId: creator.memberId }, joined.memberToken)).status, 403);
    assert.equal((await request('PUT', suffix, { memberId: creator.memberId, nickname: '冒名', clientRequestId: randomUUID() }, joined.memberToken)).status, 403);
    assert.equal((await request('PUT', suffix, { nickname: '自己', clientRequestId: randomUUID() }, joined.memberToken)).status, 200);
    const removed = await request('POST', `${suffix}/remove-member`, { targetMemberId: joined.memberId }, creator.memberToken);
    assert.equal(removed.status, 200);
    assert.equal((await request('PUT', suffix, { operations: [add('revoked')], clientRequestId: randomUUID() }, joined.memberToken)).status, 401);
    assert.equal((await request('POST', `${suffix}/remove-member`, { targetMemberId: creator.memberId }, creator.memberToken)).status, 400);
});

test('concurrent map operations preserve both edits and derive ownership from the token', async () => {
    const { body: creator } = await create();
    const { body: joined } = await join(creator.roomCode);
    const member = { roomCode: creator.roomCode, memberToken: joined.memberToken };
    const [a, b] = await Promise.all([
        update(creator, [{ type: 'add', map: { ...map('map_a'), addedBy: joined.memberId, addedAt: '2000-01-01' } }]),
        update(member, [add('map_b')]),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    let current = (await request('GET', `/${creator.roomCode}`)).body;
    assert.deepEqual(current.treasureMaps.map(item => item.id).sort(), ['map_a', 'map_b']);
    const original = current.treasureMaps.find(item => item.id === 'map_a');
    assert.equal(original.addedBy, creator.memberId);
    assert.notEqual(original.addedAt, '2000-01-01');
    await update(member, [{ type: 'add', map: { ...map('map_a'), x: 30 } }]);
    current = (await request('GET', `/${creator.roomCode}`)).body;
    assert.deepEqual(current.treasureMaps.find(item => item.id === 'map_a'), original);
});

test('a replayed mutation does not resurrect a map removed by a later edit', async () => {
    const { body: room } = await create();
    const clientRequestId = randomUUID();
    await update(room, [add('map_a')], { clientRequestId });
    const removed = await update(room, [{ type: 'remove', id: 'map_a' }]);
    const replay = await update(room, [add('map_a')], { clientRequestId });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.revision, removed.body.revision);
    assert.deepEqual(replay.body.treasureMaps, []);
    const { body: joined } = await join(room.roomCode);
    const otherMember = { roomCode: room.roomCode, memberToken: joined.memberToken };
    assert.equal((await update(otherMember, [add('map_b')], { clientRequestId })).body.treasureMaps.length, 1);
});

test('initial maps merge atomically with membership and never replace existing ownership', async () => {
    const { body: room } = await create({ initialMaps: [map('map_a')] });
    assert.equal(room.treasureMaps[0].addedBy, room.memberId);
    const joined = await join(room.roomCode, { initialMaps: [map('map_a'), map('map_b')] });
    assert.equal(joined.status, 200);
    assert.equal(joined.body.room.treasureMaps.length, 2);
    assert.equal(joined.body.room.treasureMaps[0].addedBy, room.memberId);
    assert.equal(joined.body.room.treasureMaps[1].addedBy, joined.body.memberId);
    const before = (await request('GET', `/${room.roomCode}`)).body;
    const tooMany = await join(room.roomCode, { initialMaps: Array.from({ length: 8 }, (_, i) => map(`new_${i}`)) });
    assert.equal(tooMany.body.code, 'MAP_LIMIT');
    assert.deepEqual((await request('GET', `/${room.roomCode}`)).body, before);
});

test('invalid or over-capacity batches have no partial side effects', async () => {
    const { body: room } = await create({ initialMaps: Array.from({ length: 8 }, (_, i) => map(`map_${i}`)) });
    const before = (await request('GET', `/${room.roomCode}`)).body;
    const response = await update(room, [{ type: 'remove', id: 'map_0' }, add('new_a'), add('new_b')]);
    assert.equal(response.body.code, 'MAP_LIMIT');
    assert.deepEqual((await request('GET', `/${room.roomCode}`)).body, before);
    assert.equal((await update(room, [add('valid'), { type: 'add', map: { ...map('invalid'), x: '12' } }])).status, 400);
    assert.deepEqual((await request('GET', `/${room.roomCode}`)).body, before);
    assert.equal((await request('PUT', `/${room.roomCode}`, { treasureMaps: {}, clientRequestId: randomUUID() }, room.memberToken)).status, 400);
});

test('request validation rejects malformed JSON, unbounded payloads and invalid nicknames', async () => {
    assert.equal((await request('POST', '', '{')).status, 400);
    assert.equal((await request('POST', '', 'null')).status, 400);
    assert.equal((await create({ memberNickname: 123 })).status, 400);
    assert.equal((await create({ memberNickname: 'x'.repeat(21) })).status, 400);
    assert.equal((await create({ clientRequestId: 'guessable' })).status, 400);
    assert.equal((await create({ padding: 'x'.repeat(17000) })).status, 413);
});

test('legacy rooms remain readable and every mutation refuses insecure credential migration', async () => {
    const kv = await mf.getKVNamespace('TREASURE_ROOMS');
    const legacy = {
        roomCode: 'OLD123', creatorId: 'public-creator', createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(),
        members: [{ id: 'public-creator', nickname: '舊隊長' }], treasureMaps: [map('old_map')],
    };
    await kv.put('room:OLD123', JSON.stringify(legacy));
    const read = await request('GET', '/OLD123');
    assert.equal(read.status, 200);
    assert.equal(read.body.readOnly, true);
    assert.equal(read.body.legacy, true);
    assert.equal(read.body.revision, 0);
    for (const [method, suffix] of [['POST', '/join'], ['PUT', ''], ['POST', '/leave'], ['POST', '/remove-member']]) {
        const response = await request(method, `/OLD123${suffix}`, { memberId: 'public-creator', clientRequestId: randomUUID() });
        assert.equal(response.status, 409);
        assert.equal(response.body.code, 'ROOM_RECREATE_REQUIRED');
        assert.deepEqual(response.body.room.treasureMaps, legacy.treasureMaps);
        assert.equal(response.body.memberToken, undefined);
    }
    assert.equal(await kv.get('room:OLD123'), JSON.stringify(legacy));
});

test('leaving the last member closes the room and does not allow a stale join', async () => {
    const { body: room } = await create();
    assert.equal((await request('POST', `/${room.roomCode}/leave`, {}, room.memberToken)).status, 200);
    assert.equal((await request('GET', `/${room.roomCode}`)).status, 404);
    assert.equal((await join(room.roomCode)).status, 404);
});

test('CORS accepts Authorization preflights, allows local development and rejects foreign origins', async () => {
    const preflight = await request('OPTIONS', '', undefined, undefined, mf, 'http://localhost:8000');
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
    assert.equal((await request('GET', '/ABC123', undefined, undefined, mf, 'https://foreign.invalid')).status, 403);
    const production = new Miniflare({ ...runtimeOptions, bindings: { ENVIRONMENT: 'production' } });
    try {
        assert.equal((await request('OPTIONS', '', undefined, undefined, production, 'http://localhost:8000')).status, 403);
    } finally { await production.dispose(); }
});

// A controllable clock and Node's real SQLite engine exercise expiry and restart
// without waiting 24 hours or exposing test-only RPCs from the deployed Worker.
test('SQLite state survives object reconstruction and expires exactly 24 hours after activity', async () => {
    const db = new DatabaseSync(':memory:');
    let now = Date.parse('2026-09-08T00:00:00Z');
    let alarmAt;
    const storage = {
        sql: { exec(query, ...args) { return { toArray: () => db.prepare(query).all(...args) }; } },
        transactionSync(callback) {
            db.exec('BEGIN');
            try { const value = callback(); db.exec('COMMIT'); return value; }
            catch (error) { db.exec('ROLLBACK'); throw error; }
        },
        async setAlarm(value) { alarmAt = value; },
        async deleteAll() { db.exec('DROP TABLE room_state; DROP TABLE receipts'); },
    };
    // SQL exec must execute immediately, just like Cloudflare's SqlStorage.
    storage.sql.exec = (query, ...args) => {
        const rows = db.prepare(query).all(...args);
        return { toArray: () => rows };
    };
    class ClockDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const context = vm.createContext({ DurableObject: class { constructor(ctx) { this.ctx = ctx; } }, Date: ClockDate });
    const source = fs.readFileSync(workerPath, 'utf8')
        .replace("import { DurableObject } from 'cloudflare:workers';", '')
        .replace('export default {', 'const worker = {')
        .replace('export class TreasureRoom', 'class TreasureRoom');
    vm.runInContext(`${source}\nglobalThis.RoomClass = TreasureRoom;`, context);
    let roomObject = new context.RoomClass({ storage }, {});
    const created = await roomObject.execute('create', {
        requestKey: 'creation-key', roomCode: 'ABC123', nickname: '隊長', initialMaps: [],
        credentials: { id: 'creator', token: 'private-token', tokenHash: 'token-hash' },
    });
    assert.equal(created.status, 200);
    const started = now;
    assert.equal(alarmAt, started + 86400000);
    roomObject = new context.RoomClass({ storage }, {});
    assert.equal((await roomObject.execute('get', {})).body.members[0].id, 'creator');
    now += 1000;
    await roomObject.execute('update', { requestKey: 'change', tokenHash: 'token-hash', operations: [] });
    assert.equal(alarmAt, now + 86400000);
    now += 86400000;
    assert.equal((await roomObject.execute('get', {})).status, 404);
    assert.equal((await roomObject.execute('update', { requestKey: 'late', tokenHash: 'token-hash', operations: [] })).status, 404);
    await roomObject.alarm();
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().length, 0);
    db.close();
});

test('all configured environments bind SQLite rooms and legacy KV; production keeps the existing hostname', () => {
    process.env.WRANGLER_LOG_PATH = path.join(os.tmpdir(), 'ff14-api-config-test.log');
    const { unstable_readConfig } = require('../api/node_modules/wrangler');
    for (const env of [undefined, 'development', 'production']) {
        const config = unstable_readConfig({ config: path.join(root, 'api/wrangler.toml'), ...(env ? { env } : {}) }, { hideWarnings: true });
        assert.ok(config.durable_objects.bindings.some(binding => binding.name === 'ROOMS' && binding.class_name === 'TreasureRoom'));
        assert.ok(config.kv_namespaces.some(binding => binding.binding === 'TREASURE_ROOMS'));
        assert.ok(config.migrations.some(migration => migration.new_sqlite_classes?.includes('TreasureRoom')));
        if (env !== 'development') assert.equal(config.name, 'ff14-tw-treasure');
        assert.equal(config.vars.ENVIRONMENT, env === 'development' ? 'development' : 'production');
    }
});
