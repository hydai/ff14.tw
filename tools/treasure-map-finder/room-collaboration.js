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
        this.operationHistory = [];
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

        // 顯示當前使用的 API URL（除錯用）
        console.log('Room Collaboration API URL:', RoomCollaboration.CONSTANTS.API_BASE_URL);
        console.log('Current location:', {
            hostname: window.location.hostname,
            port: window.location.port,
            protocol: window.location.protocol
        });

        this.elements = {
            roomSection: document.getElementById('roomSection'),
            roomActions: document.getElementById('roomActions'),
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

        // 語言切換時重繪隊伍區塊（成員數、隊長／移除成員 tooltip）與操作歷史的空狀態；
        // 歷史紀錄本身在記錄當下就已組好字串，不回溯翻譯（既有設計）
        window.i18n.onLanguageChange(() => {
            if (this.currentRoom) {
                this.updateRoomUI();
            }
            this.renderHistory();
        });

        this.init();
    }

    async init() {
        // Room restoration must wait until map IDs can be resolved against the catalogue.
        await this.finder.ready;
        this.setupEventListeners();
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

        // 標籤頁切換
        this.setupTabSwitching();

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
            this.addOperationHistory({ type: 'room_create',
                message: FF14Utils.getI18nText('treasure_map_history_room_created', '建立了隊伍 {code}', { code: room.roomCode }),
                timestamp: new Date().toISOString() });
            this.showToast(FF14Utils.getI18nText('treasure_map_create_room_success', '隊伍 {code} 建立成功！', { code: room.roomCode }));
            await this.mapSync.flush();
        } catch (error) {
            if (error.status >= 400 && error.status < 500 && error.status !== 429) this.connectionAttempt = null;
            console.error('建立隊伍失敗:', error);
            this.showToast(FF14Utils.getI18nText('treasure_map_create_room_failed_retry', '建立隊伍失敗，請稍後再試'), 'error');
        } finally {
            this.setConnecting(false);
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
        await this.joinRoom(roomCode);
    }

    // 加入隊伍
    async joinRoom(roomCode) {
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
            this.loadOperationHistory();
            this.addOperationHistory({ type: 'room_join',
                message: FF14Utils.getI18nText('treasure_map_history_member_joined', '{nickname} 加入了房間', { nickname: newMember.nickname }),
                timestamp: new Date().toISOString() });
            this.showToast(FF14Utils.getI18nText('treasure_map_join_room_success', '成功加入隊伍 {code}', { code: roomCode }));
            await this.mapSync.flush();
        } catch (error) {
            if (error.status >= 400 && error.status < 500 && error.status !== 429) this.connectionAttempt = null;
            console.error('加入隊伍失敗:', error);
            if (error.code === 'ROOM_RECREATE_REQUIRED' && error.room) this.recoverLegacyRoom(error.room);
            else this.showToast(FF14Utils.getI18nText(error.status === 404 ? 'treasure_map_room_not_found' : 'treasure_map_join_room_failed_retry', '加入隊伍失敗，請確認隊伍代號是否正確'), 'error');
        } finally {
            this.setConnecting(false);
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
            this.addOperationHistory({ type: 'nickname_update',
                message: FF14Utils.getI18nText('treasure_map_history_nickname_updated', '{nickname} 更新了暱稱', { nickname: newNickname }),
                timestamp: new Date().toISOString() });
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

    // 添加操作歷史
    addOperationHistory(operation) {
        const historyItem = {
            ...operation,
            id: Date.now(),
            roomCode: this.currentRoom?.roomCode
        };

        this.operationHistory.unshift(historyItem);

        // 限制歷史記錄數量（最多 50 筆）
        if (this.operationHistory.length > 50) {
            this.operationHistory = this.operationHistory.slice(0, 50);
        }

        // 儲存到 localStorage
        this.saveOperationHistory();
    }

    // 儲存操作歷史
    saveOperationHistory() {
        const historyKey = `ff14tw_room_history_${this.currentRoom?.roomCode}`;
        SecurityUtils.setStorageData(historyKey, this.operationHistory);
    }

    // 載入操作歷史
    loadOperationHistory() {
        if (!this.currentRoom) return;

        const historyKey = `ff14tw_room_history_${this.currentRoom.roomCode}`;
        const savedHistory = SecurityUtils.getValidatedStorageData(historyKey);
        this.operationHistory = Array.isArray(savedHistory)
            ? savedHistory.filter(item => item && typeof item.message === 'string').slice(0, 50) : [];
    }

    // 清理過期的操作歷史
    cleanupExpiredHistory() {
        let keys;
        try { keys = Object.keys(localStorage); } catch { return; }
        const now = Date.now();
        const ttl = RoomCollaboration.CONSTANTS.ROOM_TTL;

        keys.forEach(key => {
            if (key.startsWith('ff14tw_room_history_')) {
                try {
                    const historyStr = localStorage.getItem(key);
                    const parseResult = SecurityUtils.safeJSONParse(historyStr || '[]');
                    const history = parseResult.success ? parseResult.data : [];
                    if (Array.isArray(history) && history.length > 0) {
                        const lastOperation = history[0];
                        const lastTime = new Date(lastOperation.timestamp).getTime();

                        if (now - lastTime > ttl) {
                            localStorage.removeItem(key);
                        }
                    }
                } catch (error) {
                    // 無效的資料，直接刪除
                    try { localStorage.removeItem(key); } catch { /* optional history */ }
                }
            }
        });
    }

    // 記錄寶圖操作
    recordMapOperation(type, map, user) {
        const member = this.currentRoom?.members.find(m => m.id === (user?.id || this.currentUser?.id));
        const nickname = member?.nickname || FF14Utils.getI18nText('treasure_map_unknown_user', '未知使用者');

        let message;
        switch (type) {
            case 'add':
                message = FF14Utils.getI18nText('treasure_map_history_map_added', '{nickname} 新增了 {level} - {zone} ({x}, {y})', { nickname, level: map.level.toUpperCase(), zone: map.zone, x: map.coords.x, y: map.coords.y });
                break;
            case 'remove':
                message = FF14Utils.getI18nText('treasure_map_history_map_removed', '{nickname} 移除了 {level} - {zone} ({x}, {y})', { nickname, level: map.level.toUpperCase(), zone: map.zone, x: map.coords.x, y: map.coords.y });
                break;
            default:
                message = FF14Utils.getI18nText('treasure_map_history_map_operated', '{nickname} 操作了寶圖', { nickname });
        }

        this.addOperationHistory({
            type: 'map_' + type,
            message,
            mapId: map.id,
            userId: user?.id || this.currentUser?.id,
            timestamp: new Date().toISOString()
        });
    }

    // 設定標籤頁切換
    setupTabSwitching() {
        const panelTabs = document.getElementById('panelTabs');
        const listContent = document.getElementById('listContent');
        const historyContent = document.getElementById('historyContent');

        if (!panelTabs) return;

        panelTabs.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.tab-btn');
            if (!tabBtn) return;

            // 更新按鈕狀態
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
                btn.tabIndex = -1;
            });
            tabBtn.classList.add('active');
            tabBtn.setAttribute('aria-selected', 'true');
            tabBtn.tabIndex = 0;

            // 切換內容
            const tab = tabBtn.dataset.tab;
            if (tab === 'list') {
                listContent.classList.remove('hidden');
                historyContent.classList.add('hidden');
            } else if (tab === 'history') {
                listContent.classList.add('hidden');
                historyContent.classList.remove('hidden');
                this.renderHistory();
            }
        });

        // 方向鍵在分頁間移動並直接切換
        panelTabs.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const tabs = Array.from(panelTabs.querySelectorAll('.tab-btn'));
            const currentIndex = tabs.indexOf(document.activeElement);
            if (currentIndex === -1) return;
            e.preventDefault();
            const nextIndex = e.key === 'ArrowRight'
                ? (currentIndex + 1) % tabs.length
                : (currentIndex - 1 + tabs.length) % tabs.length;
            tabs[nextIndex].focus();
            tabs[nextIndex].click();
        });
    }

    // 渲染操作歷史
    renderHistory() {
        const historyContent = document.getElementById('historyContent');
        if (!historyContent) return;

        SecurityUtils.clearElement(historyContent);

        if (this.operationHistory.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            const p = document.createElement('p');
            p.textContent = FF14Utils.getI18nText('treasure_map_history_empty', '尚無操作記錄');
            emptyDiv.appendChild(p);
            historyContent.appendChild(emptyDiv);
            return;
        }

        this.operationHistory.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';

            const time = new Date(item.timestamp);
            const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

            const timeSpan = document.createElement('span');
            timeSpan.className = 'history-time';
            timeSpan.textContent = timeStr;
            
            const messageSpan = document.createElement('span');
            messageSpan.className = 'history-message';
            messageSpan.textContent = item.message;
            
            historyItem.appendChild(timeSpan);
            historyItem.appendChild(messageSpan);

            historyContent.appendChild(historyItem);
        });
    }

    // 更新隊伍 UI
    updateRoomUI() {
        const panelTabs = document.getElementById('panelTabs');
        const teamActions = document.getElementById('teamActions');

        if (this.currentRoom) {
            // 顯示隊伍狀態區域
            this.elements.roomSection.classList.remove('hidden');
            if (this.elements.roomStatus) {
                this.elements.roomStatus.classList.remove('hidden');
            }
            
            // 隱藏頂部的組隊按鈕
            if (teamActions) {
                teamActions.classList.add('hidden');
            }

            // 顯示標籤頁
            if (panelTabs) {
                panelTabs.classList.remove('hidden');
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
            
            // 顯示頂部的組隊按鈕
            if (teamActions) {
                teamActions.classList.remove('hidden');
            }

            // 隱藏標籤頁
            if (panelTabs) {
                panelTabs.classList.add('hidden');
            }
        }
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
