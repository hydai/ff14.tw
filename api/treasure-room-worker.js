import { DurableObject } from 'cloudflare:workers';

const ROOM_TTL = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16384;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const result = (body, status = 200) => ({ status, body });
const failure = (status, code, error) => result({ error, code }, status);

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function assert(condition, message) {
  if (!condition) throw new RequestError(400, 'INVALID_REQUEST', message);
}

async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function credentials() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return { id: crypto.randomUUID(), token, tokenHash: await digest(token) };
}

async function readBody(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new RequestError(415, 'INVALID_CONTENT_TYPE', 'Content-Type must be application/json');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'INVALID_REQUEST', 'JSON body required');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError(413, 'BODY_TOO_LARGE', 'Request body exceeds 16 KiB');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestError(400, 'INVALID_REQUEST', 'Invalid JSON'); }
  assert(body !== null && typeof body === 'object' && !Array.isArray(body), 'JSON body must be an object');
  return body;
}

function nickname(value, fallback) {
  if (value === undefined && fallback) return fallback;
  assert(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 20,
    'Nickname must contain 1 to 20 characters');
  return value.trim();
}

function validateOperations(operations) {
  assert(Array.isArray(operations) && operations.length <= 16, 'operations must be an array with at most 16 entries');
  return operations.map(operation => {
    assert(operation && typeof operation === 'object', 'Invalid operation');
    if (operation.type === 'remove') {
      assert(typeof operation.id === 'string' && /^[a-zA-Z0-9_-]{1,50}$/.test(operation.id), 'Invalid map ID');
      return { type: 'remove', id: operation.id };
    }
    assert(operation.type === 'add', 'Unknown operation type');
    const map = operation.map;
    assert(map && typeof map === 'object', 'Map required');
    assert(typeof map.id === 'string' && /^[a-zA-Z0-9_-]{1,50}$/.test(map.id), 'Invalid map ID');
    assert(typeof map.type === 'string' && /^g(?:[1-9]|1[0-8])$/.test(map.type), 'Invalid map type');
    assert(typeof map.zone === 'string' && map.zone.trim().length > 0 && map.zone.length <= 50, 'Invalid zone');
    assert(Number.isFinite(map.x) && Number.isFinite(map.y) && map.x >= 0 && map.x <= 50 && map.y >= 0 && map.y <= 50,
      'Map coordinates must be finite numbers from 0 to 50');
    return { type: 'add', map: { id: map.id, type: map.type, x: map.x, y: map.y, zone: map.zone } };
  });
}

async function mutationBody(request, action) {
  const body = await readBody(request);
  if (['create', 'join', 'update'].includes(action) || body.clientRequestId !== undefined) {
    assert(typeof body.clientRequestId === 'string' && REQUEST_ID.test(body.clientRequestId), 'clientRequestId must be a UUID v4');
  }
  const requestKey = body.clientRequestId ? await digest(body.clientRequestId) : null;
  if (action === 'create' || action === 'join') {
    const initialMaps = body.initialMaps === undefined ? [] : body.initialMaps;
    assert(Array.isArray(initialMaps) && initialMaps.length <= 8, 'initialMaps must contain at most 8 maps');
    return {
      requestKey, nickname: nickname(body.memberNickname, action === 'create' ? '光之戰士1' : '光之戰士'),
      initialMaps: validateOperations(initialMaps.map(map => ({ type: 'add', map }))).map(operation => operation.map),
      credentials: await credentials(),
    };
  }
  if (action === 'update') {
    assert(body.treasureMaps === undefined, 'Use operations to update treasure maps');
    assert(body.operations !== undefined || body.nickname !== undefined, 'operations or nickname required');
    return {
      requestKey,
      operations: body.operations === undefined ? [] : validateOperations(body.operations),
      nickname: body.nickname === undefined ? undefined : nickname(body.nickname),
      memberId: body.memberId,
    };
  }
  if (action === 'remove-member') {
    assert(typeof body.targetMemberId === 'string' && body.targetMemberId.length <= 64, 'targetMemberId required');
  }
  return { requestKey, memberId: body.memberId, requesterId: body.requesterId, targetMemberId: body.targetMemberId };
}

// Public legacy IDs cannot safely be exchanged for credentials. Keep their KV
// data read-only until its existing TTL expires; never renew or overwrite it.
async function legacyRoom(roomCode, env) {
  if (!env.TREASURE_ROOMS) return null;
  const raw = await env.TREASURE_ROOMS.get(`room:${roomCode}`);
  if (!raw) return null;
  const room = JSON.parse(raw);
  if (!Number.isFinite(Date.parse(room.lastActivityAt)) || Date.parse(room.lastActivityAt) + ROOM_TTL <= Date.now()) return null;
  return {
    roomCode, createdAt: room.createdAt, lastActivityAt: room.lastActivityAt, creatorId: room.creatorId,
    members: Array.isArray(room.members) ? room.members : [],
    treasureMaps: Array.isArray(room.treasureMaps) ? room.treasureMaps : [],
    revision: 0, legacy: true, readOnly: true,
  };
}

async function route(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/api/rooms' && request.method === 'POST') {
    const payload = await mutationBody(request, 'create');
    // Private UUID request IDs route retries to the same room without a global
    // coordinator; collisions are resolved atomically by the destination DO.
    for (let attempt = 0; attempt < 10; attempt++) {
      const hash = await digest(`${payload.requestKey}:${attempt}`);
      const roomCode = (Number.parseInt(hash.slice(0, 12), 16) % (36 ** 6)).toString(36).toUpperCase().padStart(6, '0');
      if (await legacyRoom(roomCode, env)) continue;
      const response = await env.ROOMS.getByName(roomCode).execute('create', { ...payload, roomCode });
      if (response.body.code !== 'ROOM_CODE_CONFLICT') return response;
    }
    return failure(503, 'ROOM_CODE_UNAVAILABLE', 'Unable to allocate a room code');
  }
  if (path === '/api/cleanup' && request.method === 'POST') {
    return result({ message: 'Room expiry is handled automatically by Durable Object alarms' });
  }
  const match = path.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|leave|remove-member))?$/);
  if (!match) return failure(404, 'NOT_FOUND', 'Not found');
  const [, roomCode, suffix] = match;
  const action = suffix || (request.method === 'GET' ? 'get' : 'update');
  if ((suffix && request.method !== 'POST') || (!suffix && !['GET', 'PUT'].includes(request.method))) {
    return failure(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }
  const stub = env.ROOMS.getByName(roomCode);
  const existing = await stub.execute('get', {});
  if (existing.status === 404) {
    const legacy = await legacyRoom(roomCode, env);
    if (legacy) {
      return action === 'get' ? result(legacy) : result({
        error: 'This legacy room is read-only. Save its maps and create a new room.',
        code: 'ROOM_RECREATE_REQUIRED', room: legacy,
      }, 409);
    }
    return existing;
  }
  if (action === 'get') return existing;
  let tokenHash;
  if (action !== 'join') {
    const bearer = request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f]{64})$/);
    if (!bearer) return failure(401, 'UNAUTHORIZED', 'Member token required');
    tokenHash = await digest(bearer[1]);
  }
  return stub.execute(action, { ...await mutationBody(request, action), tokenHash });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const origins = ['https://ff14.tw', 'https://www.ff14.tw'];
    if (env.ENVIRONMENT === 'development') origins.push('http://localhost:8000', 'http://localhost:8080', 'http://127.0.0.1:8000', 'http://127.0.0.1:8080');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (!origins.includes(origin)) return Response.json({ error: 'Forbidden: Access denied', code: 'FORBIDDEN_ORIGIN' }, { status: 403, headers });
    Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      const response = await route(request, env);
      return Response.json(response.body, { status: response.status, headers });
    } catch (error) {
      if (error instanceof RequestError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
      console.error(JSON.stringify({ event: 'room_request_failed', message: error.message }));
      return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers });
    }
  },
};

export class TreasureRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.schemaReady = this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'room_state'").toArray().length > 0;
  }

  #ensureSchema() {
    if (this.schemaReady) return;
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    this.schemaReady = true;
  }

  #readState() {
    if (!this.schemaReady) return null;
    const row = this.ctx.storage.sql.exec('SELECT data FROM room_state WHERE id = 1').toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }

  #receipt(key) {
    if (!key) return null;
    const row = this.ctx.storage.sql.exec('SELECT data FROM receipts WHERE id = ?', key).toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }

  #save(state, receiptKey, receiptValue) {
    this.#ensureSchema();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO room_state (id, data) VALUES (1, ?)', JSON.stringify(state));
      if (receiptKey) this.ctx.storage.sql.exec('INSERT INTO receipts (id, data) VALUES (?, ?)', receiptKey, JSON.stringify(receiptValue));
    });
  }

  // SQL reads, validation and writes are synchronous: never add a network or
  // crypto await between readState and save, which would allow lost updates.
  async execute(action, payload) {
    let state = this.#readState();
    if (state && (state.closed || Date.parse(state.room.lastActivityAt) + ROOM_TTL <= Date.now())) {
      if (action === 'create' && state.creationKey !== payload.requestKey) return failure(409, 'ROOM_CODE_CONFLICT', 'Room code already in use');
      return failure(404, 'ROOM_NOT_FOUND', 'Room not found');
    }
    if (action === 'get') return state ? result(state.room) : failure(404, 'ROOM_NOT_FOUND', 'Room not found');
    let response;
    if (action === 'create') {
      if (state) {
        if (state.creationKey !== payload.requestKey) return failure(409, 'ROOM_CODE_CONFLICT', 'Room code already in use');
        const receipt = this.#receipt(`create:${payload.requestKey}`);
        if (!state.room.members.some(member => member.id === receipt.memberId)) return failure(409, 'REQUEST_ALREADY_COMPLETED', 'This member session has ended');
        response = result({ ...state.room, ...receipt });
      } else {
        const now = new Date().toISOString();
        const member = { id: payload.credentials.id, nickname: payload.nickname, joinedAt: now, isCreator: true };
        state = {
          creationKey: payload.requestKey,
          tokens: { [payload.credentials.tokenHash]: member.id },
          room: { roomCode: payload.roomCode, createdAt: now, lastActivityAt: now, creatorId: member.id, members: [member], treasureMaps: this.#initialMaps([], payload.initialMaps, member.id), revision: 1 },
        };
        const receipt = { memberId: member.id, memberToken: payload.credentials.token };
        this.#save(state, `create:${payload.requestKey}`, receipt);
        response = result({ ...state.room, ...receipt });
      }
    } else {
      if (!state) return failure(404, 'ROOM_NOT_FOUND', 'Room not found');
      response = this.#changeRoom(state, action, payload);
    }
    // Retrying an already committed request also repairs a failed alarm write.
    if (response.status === 200) await this.ctx.storage.setAlarm(Date.parse(state.room.lastActivityAt) + ROOM_TTL);
    return response;
  }

  #changeRoom(state, action, payload) {
    const room = state.room;
    if (action === 'join') {
      const key = `join:${payload.requestKey}`;
      const previous = this.#receipt(key);
      if (previous) {
        const newMember = room.members.find(member => member.id === previous.memberId);
        return newMember ? result({ room, newMember, ...previous }) : failure(409, 'REQUEST_ALREADY_COMPLETED', 'This member session has ended');
      }
      if (room.members.length >= 8) return failure(400, 'ROOM_FULL', 'Room is full');
      const maps = this.#initialMaps(room.treasureMaps, payload.initialMaps, payload.credentials.id);
      if (maps.length > 8) return failure(400, 'MAP_LIMIT', 'Room can contain at most 8 treasure maps');
      const newMember = { id: payload.credentials.id, nickname: payload.nickname, joinedAt: new Date().toISOString(), isCreator: false };
      room.members.push(newMember);
      room.treasureMaps = maps;
      state.tokens[payload.credentials.tokenHash] = newMember.id;
      const receipt = { memberId: newMember.id, memberToken: payload.credentials.token };
      this.#touch(room);
      this.#save(state, key, receipt);
      return result({ room, newMember, ...receipt });
    }
    const memberId = state.tokens[payload.tokenHash];
    const member = room.members.find(candidate => candidate.id === memberId);
    if (!member) return failure(401, 'UNAUTHORIZED', 'Invalid or revoked member token');
    const key = payload.requestKey ? `${memberId}:${payload.requestKey}` : null;
    const previous = this.#receipt(key);
    if (previous) {
      if (previous.action !== action) return failure(409, 'REQUEST_ID_REUSED', 'Request ID already used for another action');
      return result(room);
    }
    if ((payload.memberId !== undefined && payload.memberId !== memberId) ||
        (payload.requesterId !== undefined && payload.requesterId !== memberId)) return failure(403, 'FORBIDDEN_MEMBER', 'Cannot act as another member');
    if (action === 'update') {
      // A rejected batch must not partially change the room.
      let maps = room.treasureMaps.slice();
      for (const operation of payload.operations) {
        if (operation.type === 'remove') maps = maps.filter(map => map.id !== operation.id);
        else if (!maps.some(map => map.id === operation.map.id)) {
          if (maps.length >= 8) return failure(400, 'MAP_LIMIT', 'Room can contain at most 8 treasure maps');
          maps.push({ ...operation.map, addedBy: memberId, addedAt: new Date().toISOString() });
        }
      }
      room.treasureMaps = maps;
      if (payload.nickname !== undefined) member.nickname = payload.nickname;
    } else if (action === 'leave' || action === 'remove-member') {
      const targetId = action === 'leave' ? memberId : payload.targetMemberId;
      if (action === 'remove-member') {
        if (memberId !== room.creatorId) return failure(403, 'FORBIDDEN_CREATOR', 'Only room creator can remove members');
        if (targetId === room.creatorId) return failure(400, 'CANNOT_REMOVE_CREATOR', 'Cannot remove room creator');
        if (!room.members.some(candidate => candidate.id === targetId)) return failure(404, 'MEMBER_NOT_FOUND', 'Member not found');
      }
      room.members = room.members.filter(candidate => candidate.id !== targetId);
      for (const [hash, id] of Object.entries(state.tokens)) if (id === targetId) delete state.tokens[hash];
      state.closed = room.members.length === 0;
    } else return failure(400, 'INVALID_ACTION', 'Unknown room action');
    this.#touch(room);
    this.#save(state, key, { action });
    return room.members.length ? result(room) : result({ message: 'Room deleted', revision: room.revision });
  }

  #touch(room) {
    room.revision++;
    room.lastActivityAt = new Date().toISOString();
  }

  #initialMaps(existing, incoming, memberId) {
    const maps = existing.slice();
    for (const map of incoming) {
      if (!maps.some(current => current.id === map.id)) maps.push({ ...map, addedBy: memberId, addedAt: new Date().toISOString() });
    }
    return maps;
  }

  async alarm() {
    const state = this.#readState();
    if (!state || Date.parse(state.room.lastActivityAt) + ROOM_TTL <= Date.now()) {
      await this.ctx.storage.deleteAll();
      this.schemaReady = false;
    }
    else await this.ctx.storage.setAlarm(Date.parse(state.room.lastActivityAt) + ROOM_TTL);
  }
}
