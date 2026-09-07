// Serialize local edits as operations; a room snapshot is never uploaded as a replacement.
class RoomMapSync {
    constructor({ send, onChange, onError, createRequestId = () => crypto.randomUUID() }) {
        this.send = send;
        this.onChange = onChange;
        this.onError = onError;
        this.createRequestId = createRequestId;
        this.room = null;
        this.pending = [];
        this.generation = 0;
        this.inFlight = null;
    }

    connect(room, pending = []) {
        this.disconnect();
        this.room = room;
        this.pending = pending;
        this.notify();
    }

    disconnect() {
        this.generation++;
        this.room = null;
        this.pending = [];
        this.inFlight = null;
    }

    getMaps() {
        const maps = new Map((this.room?.treasureMaps || []).map(map => [map.id, map]));
        for (const batch of this.pending) {
            for (const operation of batch.operations) {
                if (operation.type === 'remove') maps.delete(operation.id);
                else if (operation.type === 'add' && !maps.has(operation.map.id)) {
                    maps.set(operation.map.id, operation.map);
                }
            }
        }
        return [...maps.values()];
    }

    notify() {
        if (this.room) this.onChange(this.room, this.getMaps());
    }

    receive(room) {
        if (!this.room || room.roomCode !== this.room.roomCode) return false;
        if (room.revision < this.room.revision) return false;
        this.room = room;
        this.notify();
        return true;
    }

    // Compare against the projected view, including edits already awaiting acknowledgement.
    replaceLocal(maps) {
        if (!this.room) return Promise.resolve(false);
        const previous = new Map(this.getMaps().map(map => [map.id, map]));
        const next = new Map(maps.map(map => [map.id, map]));
        const operations = [];
        for (const id of previous.keys()) {
            if (!next.has(id)) operations.push({ type: 'remove', id });
        }
        for (const [id, map] of next) {
            if (!previous.has(id)) operations.push({ type: 'add', map });
        }
        return this.enqueue(operations);
    }

    enqueue(operations) {
        if (!this.room) return Promise.resolve(false);
        if (operations.length) {
            this.pending.push({ clientRequestId: this.createRequestId(), operations });
            this.notify();
        }
        return this.flush();
    }

    flush() {
        if (this.inFlight) return this.inFlight;
        if (!this.room || !this.pending.length) return Promise.resolve(true);
        const generation = this.generation;
        const roomCode = this.room.roomCode;
        // Defer sending until inFlight has been assigned, including for synchronously throwing senders.
        const request = Promise.resolve().then(async () => {
            while (this.pending.length && generation === this.generation) {
                const batch = this.pending[0];
                let room;
                try {
                    room = await this.send(roomCode, batch);
                } catch (error) {
                    if (generation !== this.generation) return false;
                    if ([401, 403, 404].includes(error.status) || error.code === 'ROOM_RECREATE_REQUIRED') {
                        // The caller ends the session while preserving the user's current local view.
                        this.onError(error);
                        return false;
                    }
                    // Keep the same request ID on transport failures: the server may have committed it.
                    const rejected = error.status >= 400 && error.status < 500 && error.status !== 429;
                    if (rejected && batch.preserveLocalOnRejection) {
                        // Edits made between connection retries still belong to the personal list.
                        // End the session before a rejected recovery batch can erase that local view.
                        error.preserveLocal = true;
                        this.onError(error);
                        return false;
                    }
                    if (rejected) {
                        this.pending.shift();
                        this.notify();
                    }
                    this.onError(error);
                    if (!rejected) return false;
                    continue;
                }
                if (generation !== this.generation) return false;
                this.pending.shift();
                // A newer poll can arrive before this acknowledgement; never move revision backwards.
                if (room.revision >= this.room.revision) this.room = room;
                this.notify();
            }
            return true;
        }).finally(() => {
            if (generation === this.generation) this.inFlight = null;
        });
        this.inFlight = request;
        return request;
    }
}

if (typeof window !== 'undefined') window.RoomMapSync = RoomMapSync;
if (typeof module !== 'undefined' && module.exports) module.exports = RoomMapSync;
