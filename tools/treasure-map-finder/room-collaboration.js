// 組隊協作功能
class RoomCollaboration {
    static CONSTANTS = {
        ROOM_CODE_LENGTH: 6,
        MAX_MEMBERS: 8,
        MAX_MAPS: 8,
        MAX_MAP_OPERATIONS: 16,
        POLL_INTERVAL: {
            ACTIVE: 2000,      // 2秒
            IDLE: 10000,       // 10秒
            IDLE_THRESHOLD: 30000  // 30秒後進入閒置
        },
        RETRY_ATTEMPTS: 3,
        ROOM_TTL: 24 * 60 * 60 * 1000,  // 24小時
        API_BASE_URL: (window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1' ||
                       window.location.port === '8000' ||
                       window.location.protocol === 'file:')
            ? 'http://localhost:8787/api'  // 本地開發
            : 'https://ff14-tw-treasure.z54981220.workers.dev/api'    // 生產環境
    };

    // Match the Worker's validateOperations contract before an import changes local storage.
    // The API integration test checks these rules against the running Worker.
    static validateMapOperations(operations) {
        if (!Array.isArray(operations) || operations.length > RoomCollaboration.CONSTANTS.MAX_MAP_OPERATIONS) {
            throw new Error(FF14Utils.getI18nText('treasure_map_import_wait_for_sync', '請等待隊伍同步完成後再匯入。'));
        }
        const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,50}$/.test(id);
        const valid = operations.every(operation => {
            if (!operation || typeof operation !== 'object') return false;
            if (operation.type === 'remove') return validId(operation.id);
            const map = operation.map;
            return operation.type === 'add' && map && validId(map.id) &&
                typeof map.type === 'string' && /^g(?:[1-9]|1[0-8])$/.test(map.type) &&
                typeof map.zone === 'string' && map.zone.trim().length > 0 && map.zone.length <= 50 &&
                Number.isFinite(map.x) && Number.isFinite(map.y) && map.x >= 0 && map.x <= 50 && map.y >= 0 && map.y <= 50;
        });
        if (!valid) {
            throw new Error(FF14Utils.getI18nText('treasure_map_import_invalid_room_maps', '匯入清單含有隊伍不支援的寶圖資料，請檢查後再試。'));
        }
    }

    // 瀏覽器封鎖網站資料時，光是讀 localStorage 就會丟例外（Chrome 是 SecurityError）：讀不到就回傳 null，由呼叫的人略過
    static safeStorage() {
        try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
    }

    // 舊版每加入過一個隊伍，就在 ff14tw_room_history_<隊伍代號> 留下一份歷史，從來沒清過；
    // 歷史拿掉後這些 key 沒有用了，載入時全部刪掉。storage 是 safeStorage() 的回傳值，可以是 null：
    // 列不出 key 就什麼都不做；每個 key 各刪各的，刪不掉的略過，不影響使用
    static clearOldHistory(storage) {
        let keys;
        try { keys = Object.keys(storage); } catch { return; }
        for (const key of keys) {
            if (!key.startsWith('ff14tw_room_history_')) continue;
            try { storage.removeItem(key); } catch { /* 刪不掉就留著 */ }
        }
    }

    constructor(treasureMapFinder) {
        this.finder = treasureMapFinder;
        this.currentRoom = null;
        this.currentUser = null;
        this.memberToken = null;
        this.sessionGeneration = 0;
        this.isConnecting = false;
        this.isLeaving = false;
        this.connectionAttempt = null;
        this.pollingTimer = null;
        this.lastActivity = Date.now();
        this.isPolling = false;
        this.retryCount = 0;
        this.modalManager = new ModalManager();
        this.mapSync = new RoomMapSync({
            send: (roomCode, batch) => this.request(`/rooms/${roomCode}`, {
                method: 'PUT', body: batch, authenticated: true
            }),
            onChange: (room, maps) => {
                this.currentRoom = room;
                const member = room.members.find(item => item.id === this.currentUser?.id);
                if (!member) {
                    if (this.isLeaving) return;
                    this.forceLeaveRoom();
                    this.showToast(FF14Utils.getI18nText('treasure_map_session_expired', '隊伍連線已失效，寶圖已保留在本機，請重新加入或建立隊伍。'), 'warning');
                    return;
                }
                this.currentUser = member;
                this.finder.syncFromRoom(maps);
                this.updateRoomUI();
                this.saveSession();
            },
            onError: error => {
                if (error.preserveLocal) {
                    this.forceLeaveRoom();
                    this.showToast(FF14Utils.getI18nText('treasure_map_session_expired', '隊伍連線已失效，寶圖已保留在本機，請重新加入或建立隊伍。'), 'warning');
                } else if (error.code === 'ROOM_RECREATE_REQUIRED' && error.room) {
                    this.recoverLegacyRoom(error.room);
                } else if (error.status === 401 || error.status === 403 || error.status === 404) {
                    if (this.isLeaving) return;
                    this.forceLeaveRoom();
                    this.showToast(FF14Utils.getI18nText('treasure_map_session_expired', '隊伍連線已失效，寶圖已保留在本機，請重新加入或建立隊伍。'), 'warning');
                } else {
                    this.showToast(FF14Utils.getI18nText('treasure_map_sync_to_room_failed', '同步失敗，請稍後再試'), 'error');
                }
            }
        });

        this.elements = {
            roomSection: document.getElementById('roomSection'),
            roomStatus: document.getElementById('roomStatus'),
            createRoomBtn: document.getElementById('createRoomBtn'),
            joinRoomBtn: document.getElementById('joinRoomBtn'),
            leaveRoomBtn: document.getElementById('leaveRoomBtn'),
            roomCode: document.getElementById('roomCode'),
            roomMembers: document.getElementById('roomMembers'),
            lastActivity: document.getElementById('lastActivity'),
            roomTTL: document.getElementById('roomTTL'),
            userNickname: document.getElementById('userNickname'),
            editNicknameBtn: document.getElementById('editNicknameBtn'),
            copyRoomCodeBtn: document.getElementById('copyRoomCodeBtn')
        };

        this.modals = {
            joinRoom: document.getElementById('joinRoomModal'),
            editNickname: document.getElementById('editNicknameModal'),
            leaveRoom: document.getElementById('leaveRoomModal')
        };

        // 語言切換時重繪隊伍區塊（成員數、隊長／移除成員 tooltip）
        window.i18n.onLanguageChange(() => {
            if (this.currentRoom) this.updateRoomUI();
        });

        this.ready = this.init();
    }

    async init() {
        // Room restoration must wait until map IDs can be resolved against the catalogue.
        await this.finder.ready;
        this.setupEventListeners();
        RoomCollaboration.clearOldHistory(RoomCollaboration.safeStorage());
        await this.checkExistingRoom();
    }

    async request(path, { method = 'GET', body, authenticated = false } = {}) {
        const headers = body === undefined ? {} : { 'Content-Type': 'application/json' };
        if (authenticated) headers.Authorization = `Bearer ${this.memberToken || ''}`;
        const response = await fetch(`${RoomCollaboration.CONSTANTS.API_BASE_URL}${path}`, {
            method, headers,
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.error || 'Room request failed');
            Object.assign(error, { status: response.status, code: data.code, room: data.room });
            throw error;
        }
        return data;
    }

    saveSession() {
        if (!this.currentRoom || !this.currentUser) return;
        SecurityUtils.setStorageData('ff14tw_current_room', {
            ...this.currentRoom,
            currentUser: this.currentUser,
            memberToken: this.memberToken,
            pendingMapOperations: this.mapSync.pending,
            lastSyncAt: new Date().toISOString()
        });
    }

    connectionRequest(kind, roomCode, memberNickname, initialMaps) {
        const key = `${kind}:${roomCode}`;
        if (this.connectionAttempt?.key !== key) {
            this.connectionAttempt = { key, body: {
                clientRequestId: crypto.randomUUID(), memberNickname, initialMaps
            } };
        }
        // A retry must carry the original intent: the first request may already be committed.
        return this.connectionAttempt.body;
    }

    completeConnection(room, member, memberToken, retained) {
        const original = new Map(this.connectionAttempt.body.initialMaps.map(map => [map.id, map]));
        const latest = new Map(retained.map(map => [map.id, this.finder.toRoomMap(map)]));
        const operations = [];
        for (const map of room.treasureMaps) {
            if (original.has(map.id) && !latest.has(map.id) && map.addedBy === member.id) {
                operations.push({ type: 'remove', id: map.id });
            }
        }
        for (const [id, map] of latest) {
            if (!original.has(id) && !room.treasureMaps.some(item => item.id === id)) operations.push({ type: 'add', map });
        }
        const projected = new Set(room.treasureMaps.map(map => map.id));
        for (const operation of operations) {
            if (operation.type === 'remove') projected.delete(operation.id);
            else projected.add(operation.map.id);
        }
        if (projected.size > RoomCollaboration.CONSTANTS.MAX_MAPS) {
            this.showToast(FF14Utils.getI18nText('treasure_map_local_maps_limit', '個人與隊伍清單合計超過 {max} 張，請先整理清單再加入。', { max: RoomCollaboration.CONSTANTS.MAX_MAPS }), 'warning');
            return false;
        }
        const pending = operations.length ? [{ clientRequestId: crypto.randomUUID(), operations,
            preserveLocalOnRejection: true }] : [];
        this.adoptSession(room, member, memberToken, pending);
        return true;
    }

    setConnecting(connecting) {
        this.isConnecting = connecting;
        document.querySelectorAll('#createRoomBtn, #joinRoomBtn, #clearAllBtn, #importListBtn, .btn-add-to-list, .btn-remove')
            .forEach(button => { button.disabled = connecting; });
    }

    // 清單面板（finder 的 ModalManager 管的那一層）是不是開著：組隊按鈕與隊伍狀態都在面板裡
    isListPanelOpen() {
        const panel = this.finder?.elements?.myListPanel;
        return Boolean(panel) && this.finder.modalManager?.activeModal === panel;
    }

    // 建立或加入隊伍結束後（setConnecting(false) 之後）、清單面板開著時的焦點。按下去的那顆連線中被停用，
    // Chrome 當下就把焦點退回 body：成功了它也跟著組隊按鈕藏起來，焦點放到隊伍狀態的第一個按鈕「複製隊伍代號」；
    // 沒成功就放回那顆
    focusAfterConnecting(trigger) {
        if (!this.isListPanelOpen()) return;
        (this.currentRoom ? this.elements.copyRoomCodeBtn : trigger)?.focus?.();
    }

    adoptSession(room, member, memberToken, pending = []) {
        if (!member || !/^[a-f0-9]{64}$/.test(memberToken || '')) throw new Error('Invalid room credentials');
        this.sessionGeneration++;
        this.currentUser = member;
        this.memberToken = memberToken;
        this.mapSync.connect(room, pending);
        this.connectionAttempt = null;
        const url = new URL(window.location.href);
        url.searchParams.set('room', room.roomCode);
        window.history.pushState({}, '', url);
        this.startPolling();
    }

    recoverLegacyRoom(room) {
        // Keep both the personal list and the former shared list available for export/new rooms.
        const maps = new Map(this.finder.listManager.getList().map(map => [map.id, this.finder.toRoomMap(map)]));
        for (const map of room.treasureMaps || []) if (!maps.has(map.id)) maps.set(map.id, map);
        this.finder.listManager.syncFromRoom([...maps.values()], this.finder.maps);
        this.finder.updateListCount();
        this.finder.updateCardButtons();
        this.finder.renderMyList();
        this.forceLeaveRoom();
        this.showToast(FF14Utils.getI18nText('treasure_map_legacy_room', '此隊伍已轉為唯讀，寶圖已保留在本機，請建立新隊伍。'), 'warning');
    }

    setupEventListeners() {
        // 隊伍操作
        this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.showJoinRoomDialog());
        this.elements.leaveRoomBtn.addEventListener('click', () => this.showLeaveRoomDialog());
        this.elements.copyRoomCodeBtn.addEventListener('click', () => this.copyRoomCode());
        this.elements.editNicknameBtn.addEventListener('click', () => this.showEditNicknameDialog());

        // 加入隊伍對話框
        document.getElementById('closeJoinModalBtn').addEventListener('click', () => this.hideModal('joinRoom'));
        document.getElementById('cancelJoinBtn').addEventListener('click', () => this.hideModal('joinRoom'));
        document.getElementById('confirmJoinBtn').addEventListener('click', () => this.confirmJoinRoom());

        // 編輯暱稱對話框
        document.getElementById('closeNicknameModalBtn').addEventListener('click', () => this.hideModal('editNickname'));
        document.getElementById('cancelNicknameBtn').addEventListener('click', () => this.hideModal('editNickname'));
        document.getElementById('confirmNicknameBtn').addEventListener('click', () => this.confirmEditNickname());

        // 離開隊伍對話框
        document.getElementById('closeLeaveModalBtn').addEventListener('click', () => this.hideModal('leaveRoom'));
        document.getElementById('cancelLeaveBtn').addEventListener('click', () => this.hideModal('leaveRoom'));
        document.getElementById('leaveKeepListBtn').addEventListener('click', () => this.leaveRoom(true));
        document.getElementById('leaveClearListBtn').addEventListener('click', () => this.leaveRoom(false));

        // Enter 鍵確認
        document.getElementById('roomCodeInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.confirmJoinRoom();
        });
        document.getElementById('nicknameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.confirmEditNickname();
        });

        // 追蹤活動
        document.addEventListener('click', () => this.updateActivity());
        document.addEventListener('keypress', () => this.updateActivity());
    }

    // 檢查是否已有隊伍（從 URL 或 localStorage）
    async checkExistingRoom() {
        const requestedCode = new URLSearchParams(window.location.search).get('room');
        const saved = SecurityUtils.getValidatedStorageData('ff14tw_current_room');
        if (saved && (!requestedCode || saved.roomCode === requestedCode) && this.isRoomValid(saved)) {
            const { currentUser, memberToken, pendingMapOperations, lastSyncAt, ...room } = saved;
            this.adoptSession(room, currentUser, memberToken, pendingMapOperations || []);
            return;
        }
        if (saved?.roomCode && !saved.memberToken && (!requestedCode || requestedCode === saved.roomCode)) {
            try {
                const room = await this.request(`/rooms/${saved.roomCode}`);
                if (room.readOnly) this.recoverLegacyRoom(room);
                else {
                    this.forceLeaveRoom();
                    this.showToast(FF14Utils.getI18nText('treasure_map_session_expired', '隊伍連線已失效，寶圖已保留在本機，請重新加入或建立隊伍。'), 'warning');
                }
            } catch (error) {
                if (error.status === 404) this.forceLeaveRoom();
                else this.showToast(FF14Utils.getI18nText('treasure_map_room_sync_failed_network', '同步失敗，請檢查網路連線'), 'error');
            }
            return;
        }
        if (saved && !this.isRoomValid(saved)) this.forceLeaveRoom();
        if (requestedCode) await this.joinRoom(requestedCode.toUpperCase());
    }

    // 檢查隊伍是否有效（未過期且格式正確）
    isRoomValid(roomData) {
        if (!roomData || !/^[A-Z0-9]{6}$/.test(roomData.roomCode || '')) return false;
        if (!/^[a-f0-9]{64}$/.test(roomData.memberToken || '') || !roomData.currentUser?.id) return false;
        if (!Array.isArray(roomData.members) || !Array.isArray(roomData.treasureMaps)) return false;
        if (!roomData.members.every(member => member && typeof member.id === 'string')) return false;
        if (!roomData.members.some(member => member.id === roomData.currentUser.id)) return false;
        if (!roomData.treasureMaps.every(map => map && typeof map.id === 'string')) return false;
        if (!Number.isSafeInteger(roomData.revision)) return false;
        const pending = roomData.pendingMapOperations || [];
        if (!Array.isArray(pending) || !pending.every(batch => batch &&
            typeof batch.clientRequestId === 'string' && Array.isArray(batch.operations) &&
            batch.operations.every(op => op && ((op.type === 'remove' && typeof op.id === 'string') ||
                (op.type === 'add' && op.map && typeof op.map.id === 'string'))))) return false;
        return Date.now() - new Date(roomData.lastSyncAt).getTime() < RoomCollaboration.CONSTANTS.ROOM_TTL;
    }

    // 建立新隊伍
    async createRoom() {
        if (this.currentRoom || this.isConnecting) return;
        this.setConnecting(true);
        try {
            const localMaps = this.finder.listManager.getList();
            const clearLocal = localMaps.length > 0 && confirm(FF14Utils.getI18nText(
                'treasure_map_create_room_local_maps_confirm', '要清空本地清單嗎？', { count: localMaps.length }));
            const retained = clearLocal ? [] : localMaps;
            if (retained.length > RoomCollaboration.CONSTANTS.MAX_MAPS) {
                this.showToast(FF14Utils.getI18nText('treasure_map_local_maps_limit', '個人與隊伍清單合計超過 {max} 張，請先整理清單再加入。', { max: RoomCollaboration.CONSTANTS.MAX_MAPS }), 'warning');
                return;
            }
            const body = this.connectionRequest('create', '',
                FF14Utils.getI18nText('treasure_map_default_nickname_creator', '光之戰士1'),
                retained.map(map => this.finder.toRoomMap(map)));
            const data = await this.request('/rooms', { method: 'POST', body });
            const { memberId, memberToken, ...room } = data;
            if (!this.completeConnection(room, room.members.find(member => member.id === memberId), memberToken, retained)) return;
            this.showToast(FF14Utils.getI18nText('treasure_map_create_room_success', '隊伍 {code} 建立成功！', { code: room.roomCode }));
            await this.mapSync.flush();
        } catch (error) {
            if (error.status >= 400 && error.status < 500 && error.status !== 429) this.connectionAttempt = null;
            console.error('建立隊伍失敗:', error);
            this.showToast(FF14Utils.getI18nText('treasure_map_create_room_failed_retry', '建立隊伍失敗，請稍後再試'), 'error');
        } finally {
            this.setConnecting(false);
            this.focusAfterConnecting(this.elements.createRoomBtn);
        }
    }

    // 顯示加入隊伍對話框
    showJoinRoomDialog() {
        if (this.currentRoom) {
            this.showToast(FF14Utils.getI18nText('treasure_map_already_in_room', '您已在隊伍中，請先離開現有隊伍'), 'warning');
            return;
        }

        document.getElementById('roomCodeInput').value = '';
        this.showModal('joinRoom');
        document.getElementById('roomCodeInput').focus();
    }

    // 確認加入隊伍
    async confirmJoinRoom() {
        const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();

        if (!roomCode || roomCode.length !== RoomCollaboration.CONSTANTS.ROOM_CODE_LENGTH) {
            this.showToast(FF14Utils.getI18nText('treasure_map_invalid_room_code', '請輸入有效的 6 位隊伍代號'), 'warning');
            return;
        }

        this.hideModal('joinRoom');
        await this.joinRoom(roomCode, this.elements.joinRoomBtn);
    }

    // 加入隊伍；trigger 是使用者按下的「加入隊伍」，結束後由它決定焦點（見 focusAfterConnecting）。
    // 用網址的 ?room= 在載入時自動加入時沒有 trigger：不移動焦點
    async joinRoom(roomCode, trigger = null) {
        if (this.currentRoom || this.isConnecting) return;
        if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
            this.showToast(FF14Utils.getI18nText('treasure_map_invalid_room_code', '請輸入有效的 6 位隊伍代號'), 'warning');
            return;
        }
        this.setConnecting(true);
        try {
            const localMaps = this.finder.listManager.getList();
            const clearLocal = localMaps.length > 0 && confirm(FF14Utils.getI18nText(
                'treasure_map_join_room_local_maps_confirm', '要清空本地清單嗎？', { count: localMaps.length }));
            const retained = clearLocal ? [] : localMaps;
            // Check before joining so a full room never destroys the player's personal list.
            const preview = await this.request(`/rooms/${roomCode}`);
            if (preview.readOnly) {
                this.recoverLegacyRoom(preview);
                return;
            }
            if (this.connectionAttempt?.key !== `join:${roomCode}` &&
                new Set([...preview.treasureMaps, ...retained].map(map => map.id)).size > RoomCollaboration.CONSTANTS.MAX_MAPS) {
                this.showToast(FF14Utils.getI18nText('treasure_map_local_maps_limit', '個人與隊伍清單合計超過 {max} 張，請先整理清單再加入。', { max: RoomCollaboration.CONSTANTS.MAX_MAPS }), 'warning');
                return;
            }
            let memberNickname = FF14Utils.getI18nText('treasure_map_default_nickname', '光之戰士');
            try { memberNickname = localStorage.getItem('ff14tw_user_nickname') || memberNickname; } catch { /* optional preference */ }
            const { room, newMember, memberToken } = await this.request(`/rooms/${roomCode}/join`, {
                method: 'POST', body: this.connectionRequest('join', roomCode, memberNickname,
                    retained.map(map => this.finder.toRoomMap(map)))
            });
            if (!this.completeConnection(room, newMember, memberToken, retained)) return;
            this.showToast(FF14Utils.getI18nText('treasure_map_join_room_success', '成功加入隊伍 {code}', { code: roomCode }));
            await this.mapSync.flush();
        } catch (error) {
            if (error.status >= 400 && error.status < 500 && error.status !== 429) this.connectionAttempt = null;
            console.error('加入隊伍失敗:', error);
            if (error.code === 'ROOM_RECREATE_REQUIRED' && error.room) this.recoverLegacyRoom(error.room);
            else this.showToast(FF14Utils.getI18nText(error.status === 404 ? 'treasure_map_room_not_found' : 'treasure_map_join_room_failed_retry', '加入隊伍失敗，請確認隊伍代號是否正確'), 'error');
        } finally {
            this.setConnecting(false);
            if (trigger) this.focusAfterConnecting(trigger);
        }
    }

    // 顯示編輯暱稱對話框
    showEditNicknameDialog() {
        const input = document.getElementById('nicknameInput');
        input.value = this.currentUser.nickname;
        this.showModal('editNickname');
        input.focus();
        input.select();
    }

    // 確認編輯暱稱
    async confirmEditNickname() {
        const newNickname = document.getElementById('nicknameInput').value.trim();
        if (!newNickname || newNickname.length > 20 || !this.currentRoom) return;
        const generation = this.sessionGeneration;
        try {
            const updatedRoom = await this.request(`/rooms/${this.currentRoom.roomCode}`, {
                method: 'PUT', authenticated: true,
                body: { nickname: newNickname, clientRequestId: crypto.randomUUID() }
            });
            if (generation !== this.sessionGeneration) return;
            this.mapSync.receive(updatedRoom);
            try { localStorage.setItem('ff14tw_user_nickname', newNickname); } catch { /* optional preference */ }
            this.hideModal('editNickname');
            this.showToast(FF14Utils.getI18nText('treasure_map_nickname_updated', '暱稱已更新'));
        } catch (error) {
            if (generation === this.sessionGeneration) this.showToast(FF14Utils.getI18nText('treasure_map_update_nickname_failed_retry', '更新暱稱失敗，請稍後再試'), 'error');
        }
    }

    // 顯示離開隊伍對話框
    showLeaveRoomDialog() {
        this.showModal('leaveRoom');
    }

    // 離開隊伍
    async leaveRoom(keepList) {
        if (!this.currentRoom || this.isConnecting) return;
        this.setConnecting(true);
        this.isLeaving = true;
        this.stopPolling();
        const generation = this.sessionGeneration;
        let left = false;
        const finish = () => {
            this.forceLeaveRoom();
            if (!keepList) {
                this.finder.listManager.clear();
                this.finder.updateListCount();
                this.finder.updateCardButtons();
                this.finder.renderMyList();
            }
            this.hideModal('leaveRoom');
            this.showToast(FF14Utils.getI18nText('treasure_map_left_room', '已離開隊伍'));
            left = true;
        };
        try {
            const synced = await this.mapSync.flush();
            if (generation !== this.sessionGeneration) return;
            if (!synced) {
                this.showToast(FF14Utils.getI18nText('treasure_map_leave_room_sync_failed', '寶圖尚未同步完成，請稍後再試離開隊伍。'), 'error');
                return;
            }
            await this.request(`/rooms/${this.currentRoom.roomCode}/leave`, {
                method: 'POST', authenticated: true, body: { clientRequestId: crypto.randomUUID() }
            });
            if (generation !== this.sessionGeneration) return;
            finish();
        } catch (error) {
            if (generation !== this.sessionGeneration) return;
            if ([401, 403, 404].includes(error.status)) finish();
            else this.showToast(FF14Utils.getI18nText('treasure_map_leave_room_failed_retry', '離開隊伍失敗，請稍後再試'), 'error');
        } finally {
            this.isLeaving = false;
            this.setConnecting(false);
            if (this.currentRoom && generation === this.sessionGeneration) this.startPolling();
            // 離開了：隊伍狀態連同離開鈕藏起來，關掉對話框時焦點還給離開鈕等於沒還；改放到又出現的「建立組隊」
            //（連線中它是停用的，所以等 setConnecting(false) 之後）
            if (left && this.isListPanelOpen()) this.elements.createRoomBtn?.focus?.();
        }
    }

    // 複製隊伍代號
    copyRoomCode() {
        const code = this.currentRoom.roomCode;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(code).then(() => {
                this.showToast(FF14Utils.getI18nText('treasure_map_room_code_copied', '隊伍代號已複製'));
            }).catch(() => {
                this.fallbackCopy(code);
            });
        } else {
            this.fallbackCopy(code);
        }
    }

    // 備用複製方法
    fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.showToast(FF14Utils.getI18nText('treasure_map_room_code_copied', '隊伍代號已複製'));
    }


    // 更新最後活動時間
    updateActivityTime() {
        if (!this.currentRoom) return;

        const lastActivity = new Date(this.currentRoom.lastActivityAt);
        const now = new Date();
        const diff = now - lastActivity;

        let text;
        if (diff < 60000) { // 1分鐘內
            text = FF14Utils.getI18nText('treasure_map_just_now', '剛剛');
        } else if (diff < 3600000) { // 1小時內
            const minutes = Math.floor(diff / 60000);
            text = FF14Utils.getI18nText('treasure_map_minutes_ago', '{minutes}分鐘前', { minutes });
        } else if (diff < 86400000) { // 1天內
            const hours = Math.floor(diff / 3600000);
            text = FF14Utils.getI18nText('treasure_map_hours_ago', '{hours}小時前', { hours });
        } else {
            text = FF14Utils.getI18nText('treasure_map_more_than_a_day_ago', '超過1天前');
        }

        this.elements.lastActivity.textContent = text;
    }

    // 更新房間剩餘時間
    updateRoomTTL() {
        if (!this.currentRoom) return;

        const lastActivity = new Date(this.currentRoom.lastActivityAt);
        const expireTime = lastActivity.getTime() + RoomCollaboration.CONSTANTS.ROOM_TTL;
        const now = Date.now();
        const remaining = expireTime - now;

        if (remaining <= 0) {
            this.elements.roomTTL.textContent = FF14Utils.getI18nText('treasure_map_ttl_expired', '已過期');
            return;
        }

        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);

        if (hours > 0) {
            this.elements.roomTTL.textContent = FF14Utils.getI18nText('treasure_map_ttl_hours_minutes', '{hours}小時{minutes}分', { hours, minutes });
        } else {
            this.elements.roomTTL.textContent = FF14Utils.getI18nText('treasure_map_ttl_minutes', '{minutes}分鐘', { minutes });
        }
    }

    // 開始輪詢
    startPolling() {
        if (this.pollingTimer) return;
        void this.poll();
        this.scheduleNextPoll();
    }

    stopPolling() {
        clearTimeout(this.pollingTimer);
        this.pollingTimer = null;
        this.isPolling = false;
    }

    scheduleNextPoll() {
        if (!this.currentRoom) return;
        const generation = this.sessionGeneration;
        const idle = Date.now() - this.lastActivity > RoomCollaboration.CONSTANTS.POLL_INTERVAL.IDLE_THRESHOLD;
        this.pollingTimer = setTimeout(async () => {
            this.pollingTimer = null;
            await this.poll();
            if (generation === this.sessionGeneration && !this.isLeaving) this.scheduleNextPoll();
        }, RoomCollaboration.CONSTANTS.POLL_INTERVAL[idle ? 'IDLE' : 'ACTIVE']);
    }

    async poll() {
        if (!this.currentRoom || this.isPolling || this.isLeaving) return;
        this.isPolling = true;
        const generation = this.sessionGeneration;
        try {
            const room = await this.request(`/rooms/${this.currentRoom.roomCode}`);
            if (generation !== this.sessionGeneration || this.isLeaving) return;
            if (room.readOnly) {
                this.recoverLegacyRoom(room);
                return;
            }
            this.mapSync.receive(room);
            if (generation !== this.sessionGeneration) return;
            await this.mapSync.flush();
            this.retryCount = 0;
        } catch (error) {
            if (generation !== this.sessionGeneration || this.isLeaving) return;
            if (error.status === 404) {
                this.forceLeaveRoom();
                this.showToast(FF14Utils.getI18nText('treasure_map_room_expired', '隊伍已過期'), 'error');
            } else if (++this.retryCount >= RoomCollaboration.CONSTANTS.RETRY_ATTEMPTS) {
                this.showToast(FF14Utils.getI18nText('treasure_map_room_sync_failed_network', '同步失敗，請檢查網路連線'), 'error');
                this.retryCount = 0;
            }
        } finally {
            if (generation === this.sessionGeneration) this.isPolling = false;
        }
    }

    syncTreasureMaps() {
        this.mapSync.notify();
    }

    forceLeaveRoom() {
        this.sessionGeneration++;
        this.stopPolling();
        this.mapSync.disconnect();
        this.currentRoom = null;
        this.currentUser = null;
        this.memberToken = null;
        try {
            localStorage.removeItem('ff14tw_current_room');
            localStorage.removeItem('ff14tw_room_created');
        } catch { /* keep the current page usable when storage is unavailable */ }
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.pushState({}, '', url);
        this.updateRoomUI();
    }

    // 更新活動時間
    updateActivity() {
        this.lastActivity = Date.now();
    }

    // 顯示對話框
    showModal(modalName) {
        const modal = this.modals[modalName];
        if (modal) {
            modal.classList.remove('hidden');
            this.modalManager.show(modal, {
                useClass: null,
                displayStyle: 'flex',
                onClose: () => {
                    modal.classList.add('hidden');
                    modal.style.display = '';
                }
            });
        }
    }

    // 隱藏對話框（只在名字對應的對話框正是目前開著的那個時才關，避免關錯）
    hideModal(modalName) {
        const modal = this.modals[modalName];
        if (modal && this.modalManager.activeModal === modal) {
            this.modalManager.hide();
        }
    }

    // 顯示提示訊息
    showToast(message, type = 'success') {
        FF14Utils.showToast(message, type);
    }

    // 更新隊伍 UI
    updateRoomUI() {
        const teamActions = document.getElementById('teamActions');

        if (this.currentRoom) {
            // 顯示隊伍狀態區域
            this.elements.roomSection.classList.remove('hidden');
            if (this.elements.roomStatus) {
                this.elements.roomStatus.classList.remove('hidden');
            }
            
            // 隱藏清單面板裡的組隊按鈕
            if (teamActions) {
                teamActions.classList.add('hidden');
            }

            // 更新隊伍資訊
            this.elements.roomCode.textContent = this.currentRoom.roomCode;
            this.elements.roomMembers.textContent = FF14Utils.getI18nText('treasure_map_member_count', '{count}/{max}人', { count: this.currentRoom.members.length, max: RoomCollaboration.CONSTANTS.MAX_MEMBERS });
            this.elements.userNickname.textContent = this.currentUser.nickname;

            // 更新成員列表
            this.updateMembersList();

            this.updateActivityTime();
            this.updateRoomTTL();
        } else {
            // 隱藏隊伍狀態區域
            this.elements.roomSection.classList.add('hidden');
            if (this.elements.roomStatus) {
                this.elements.roomStatus.classList.add('hidden');
            }
            
            // 顯示清單面板裡的組隊按鈕
            if (teamActions) {
                teamActions.classList.remove('hidden');
            }
        }

        // 進出隊伍時清單入口跟著換（「隊伍清單 N/8」或「清單 N 張」）
        this.finder?.updateListCount?.();
    }

    // 更新成員列表
    updateMembersList() {
        const membersList = document.getElementById('membersList');
        if (!membersList || !this.currentRoom) return;

        SecurityUtils.clearElement(membersList);

        // 排序成員（隊長優先，其次當前使用者，其他按加入時間）
        const sortedMembers = [...this.currentRoom.members].sort((a, b) => {
            // 隊長永遠排第一
            if (a.id === this.currentRoom.creatorId) return -1;
            if (b.id === this.currentRoom.creatorId) return 1;

            // 當前使用者排第二（除非已經是隊長）
            if (a.id === this.currentUser.id) return -1;
            if (b.id === this.currentUser.id) return 1;

            // 其他按加入時間排序
            return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
        });

        sortedMembers.forEach(member => {
            const memberTag = document.createElement('div');
            memberTag.className = 'member-tag';
            if (member.id === this.currentUser.id) {
                memberTag.classList.add('current-user');
            }

            // 成員名稱
            const nameSpan = document.createElement('span');
            nameSpan.textContent = member.nickname;

            // 標示隊長
            const isCreator = member.id === this.currentRoom.creatorId;
            if (isCreator) {
                const crownIcon = document.createElement('span');
                crownIcon.textContent = ' 👑';
                crownIcon.title = FF14Utils.getI18nText('treasure_map_room_leader', '隊長');
                nameSpan.appendChild(crownIcon);
            }

            memberTag.appendChild(nameSpan);

            // 移除按鈕（只有隊長可以移除其他成員）
            const currentUserIsCreator = this.currentUser.id === this.currentRoom.creatorId;
            if (currentUserIsCreator && !isCreator) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'member-remove-btn';
                removeBtn.textContent = '×';
                removeBtn.title = FF14Utils.getI18nText('treasure_map_remove_member_tooltip', '移除 {nickname}', { nickname: member.nickname });
                removeBtn.onclick = () => this.removeMember(member);
                memberTag.appendChild(removeBtn);
            }

            membersList.appendChild(memberTag);
        });
    }

    // 移除成員
    async removeMember(member) {
        if (!this.currentRoom || !confirm(FF14Utils.getI18nText('treasure_map_remove_member_confirm', '確定要移除 {nickname} 嗎？', { nickname: member.nickname }))) return;
        const generation = this.sessionGeneration;
        try {
            const room = await this.request(`/rooms/${this.currentRoom.roomCode}/remove-member`, {
                method: 'POST', authenticated: true,
                body: { targetMemberId: member.id, clientRequestId: crypto.randomUUID() }
            });
            if (generation !== this.sessionGeneration) return;
            this.mapSync.receive(room);
            this.showToast(FF14Utils.getI18nText('treasure_map_member_removed', '已將 {nickname} 移出隊伍', { nickname: member.nickname }));
        } catch (error) {
            if (generation === this.sessionGeneration) this.showToast(FF14Utils.getI18nText('treasure_map_remove_member_failed_retry', '移除成員失敗，請稍後再試'), 'error');
        }
    }


}

// 匯出給主程式使用
window.RoomCollaboration = RoomCollaboration;
