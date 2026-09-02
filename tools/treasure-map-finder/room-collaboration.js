// 組隊協作功能
class RoomCollaboration {
    static CONSTANTS = {
        ROOM_CODE_LENGTH: 6,
        MAX_MEMBERS: 8,
        MAX_MAPS: 8,
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

    constructor(treasureMapFinder) {
        this.finder = treasureMapFinder;
        this.currentRoom = null;
        this.currentUser = null;
        this.pollingTimer = null;
        this.lastActivity = Date.now();
        this.isPolling = false;
        this.retryCount = 0;
        this.operationHistory = [];
        this.modalManager = new ModalManager();

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

    init() {
        this.setupEventListeners();
        this.checkExistingRoom();
        this.loadUserPreferences();
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
    checkExistingRoom() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');

        if (roomCode) {
            // 先檢查 localStorage 是否已有相同隊伍的資料
            const savedRoom = localStorage.getItem('ff14tw_current_room');
            if (savedRoom) {
                try {
                    const parseResult = SecurityUtils.safeJSONParse(savedRoom);
                    if (!parseResult.success) {
                        console.warn('Invalid room data format');
                        return;
                    }
                    const roomData = parseResult.data;
                    // 如果已在相同隊伍且資料有效，直接恢復會話
                    if (roomData.roomCode === roomCode && this.isRoomValid(roomData)) {
                        this.currentRoom = roomData;
                        this.currentUser = roomData.currentUser;
                        this.updateRoomUI();
                        this.startPolling();
                        return; // 避免重複加入
                    }
                } catch (error) {
                    console.error('載入隊伍資料失敗:', error);
                }
            }
            // 如果不在隊伍或在不同隊伍，才執行加入
            this.joinRoom(roomCode);
        } else {
            const savedRoom = localStorage.getItem('ff14tw_current_room');
            if (savedRoom) {
                try {
                    const parseResult = SecurityUtils.safeJSONParse(savedRoom);
                    if (!parseResult.success) {
                        console.warn('Invalid saved room data');
                        localStorage.removeItem('ff14tw_current_room');
                        return;
                    }
                    const roomData = parseResult.data;
                    if (this.isRoomValid(roomData)) {
                        this.currentRoom = roomData;
                        this.currentUser = roomData.currentUser;
                        this.updateRoomUI();
                        this.startPolling();
                    } else {
                        localStorage.removeItem('ff14tw_current_room');
                    }
                } catch (error) {
                    console.error('載入隊伍資料失敗:', error);
                    localStorage.removeItem('ff14tw_current_room');
                }
            }
        }
    }

    // 載入使用者偏好設定
    loadUserPreferences() {
        const savedNickname = localStorage.getItem('ff14tw_user_nickname');
        if (savedNickname && this.currentUser) {
            this.currentUser.nickname = savedNickname;
            this.elements.userNickname.textContent = savedNickname;
        }
    }

    // 檢查隊伍是否有效（未過期且格式正確）
    isRoomValid(roomData) {
        if (!roomData || !roomData.lastSyncAt) return false;
        // 檢查是否為新格式（必須有 creatorId）
        if (!roomData.creatorId) return false;
        const now = Date.now();
        const lastSync = new Date(roomData.lastSyncAt).getTime();
        return (now - lastSync) < RoomCollaboration.CONSTANTS.ROOM_TTL;
    }

    // 建立新隊伍
    async createRoom() {
        // 檢查是否已有隊伍
        if (this.currentRoom) {
            this.showToast(FF14Utils.getI18nText('treasure_map_already_in_room', '您已在隊伍中，請先離開現有隊伍'), 'warning');
            return;
        }

        // 檢查瀏覽器限制
        const browserLimit = localStorage.getItem('ff14tw_room_created');
        if (browserLimit) {
            this.showToast(FF14Utils.getI18nText('treasure_map_browser_room_limit', '此瀏覽器已有隊伍記錄，請先清除或使用其他瀏覽器'), 'warning');
            return;
        }

        // 檢查是否有本地寶圖
        if (this.finder.myList.length > 0) {
            const clearLocal = confirm(FF14Utils.getI18nText('treasure_map_create_room_local_maps_confirm', '您目前有 {count} 張本地寶圖。\n\n建立隊伍後，這些寶圖會被歸屬為您新增的，但實際新增時間可能不正確。\n\n建議清空本地清單以確保協作資料的準確性。\n\n要清空本地清單嗎？', { count: this.finder.myList.length }));

            if (clearLocal) {
                this.finder.myList = [];
                this.finder.myListIds.clear();
                this.finder.saveToStorage();
                this.finder.updateListCount();
                this.finder.updateCardButtons();
                this.finder.renderMyList();
            }
        }

        const memberNickname = FF14Utils.getI18nText('treasure_map_default_nickname_creator', '光之戰士1');

        try {
            // 呼叫 API 建立隊伍（隊伍代號由伺服器生成）
            const response = await fetch(`${RoomCollaboration.CONSTANTS.API_BASE_URL}/rooms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    memberNickname
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || FF14Utils.getI18nText('treasure_map_create_room_failed', '建立隊伍失敗'));
            }

            const room = await response.json();
            this.currentRoom = room;
            this.currentUser = room.members[0];

            // 儲存至 localStorage
            localStorage.setItem('ff14tw_current_room', JSON.stringify({
                ...this.currentRoom,
                currentUser: this.currentUser,
                lastSyncAt: new Date().toISOString()
            }));
            localStorage.setItem('ff14tw_room_created', 'true');

            // 更新 URL
            const url = new URL(window.location);
            url.searchParams.set('room', room.roomCode);
            window.history.pushState({}, '', url);

            this.updateRoomUI();
            this.startPolling();

            // 記錄操作歷史
            this.addOperationHistory({
                type: 'room_create',
                message: FF14Utils.getI18nText('treasure_map_history_room_created', '建立了隊伍 {code}', { code: room.roomCode }),
                timestamp: new Date().toISOString()
            });

            // 顯示成功訊息
            this.showToast(FF14Utils.getI18nText('treasure_map_create_room_success', '隊伍 {code} 建立成功！', { code: room.roomCode }));

        } catch (error) {
            console.error('建立隊伍失敗:', error);
            this.showToast(error.message || FF14Utils.getI18nText('treasure_map_create_room_failed_retry', '建立隊伍失敗，請稍後再試'), 'error');
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
        try {
            // 檢查是否有本地寶圖
            if (this.finder.myList.length > 0) {
                const clearLocal = confirm(FF14Utils.getI18nText('treasure_map_join_room_local_maps_confirm', '您目前有 {count} 張本地寶圖。\n\n加入隊伍後，這些寶圖會被歸屬為您新增的，但實際新增時間可能不正確。\n\n建議清空本地清單以確保協作資料的準確性。\n\n要清空本地清單嗎？', { count: this.finder.myList.length }));

                if (clearLocal) {
                    this.finder.myList = [];
                    this.finder.myListIds.clear();
                    this.finder.saveToStorage();
                    this.finder.updateListCount();
                    this.finder.updateCardButtons();
                    this.finder.renderMyList();
                }
            }

            // 生成暱稱
            const existingNickname = localStorage.getItem('ff14tw_user_nickname');
            const memberNickname = existingNickname || FF14Utils.getI18nText('treasure_map_default_nickname', '光之戰士');

            // 直接嘗試加入房間（伺服器會處理所有錯誤情況）
            const joinResponse = await fetch(`${RoomCollaboration.CONSTANTS.API_BASE_URL}/rooms/${roomCode}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    memberNickname
                })
            });

            if (!joinResponse.ok) {
                const error = await joinResponse.json();
                // 根據錯誤類型提供適當的中文訊息
                let errorMessage = error.error || FF14Utils.getI18nText('treasure_map_join_room_failed', '加入房間失敗');
                if (joinResponse.status === 404) {
                    errorMessage = FF14Utils.getI18nText('treasure_map_room_not_found', '房間不存在或已過期');
                } else if (error.error === 'Room is full') {
                    errorMessage = FF14Utils.getI18nText('treasure_map_room_full', '房間已滿');
                }
                throw new Error(errorMessage);
            }

            const { room, newMember } = await joinResponse.json();
            this.currentRoom = room;
            this.currentUser = newMember;

            // 儲存至 localStorage
            localStorage.setItem('ff14tw_current_room', JSON.stringify({
                ...this.currentRoom,
                currentUser: this.currentUser,
                lastSyncAt: new Date().toISOString()
            }));

            // 更新 URL
            const url = new URL(window.location);
            url.searchParams.set('room', roomCode);
            window.history.pushState({}, '', url);

            this.updateRoomUI();
            this.startPolling();

            // 載入操作歷史
            this.loadOperationHistory();

            // 記錄操作歷史
            this.addOperationHistory({
                type: 'room_join',
                message: FF14Utils.getI18nText('treasure_map_history_member_joined', '{nickname} 加入了房間', { nickname: this.currentUser.nickname }),
                timestamp: new Date().toISOString()
            });

            // 同步現有的寶圖清單
            this.syncTreasureMaps();

            this.showToast(FF14Utils.getI18nText('treasure_map_join_room_success', '成功加入隊伍 {code}', { code: roomCode }));

        } catch (error) {
            console.error('加入隊伍失敗:', error);
            this.showToast(error.message || FF14Utils.getI18nText('treasure_map_join_room_failed_retry', '加入隊伍失敗，請確認隊伍代號是否正確'), 'error');
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

        if (!newNickname) {
            this.showToast(FF14Utils.getI18nText('treasure_map_nickname_placeholder', '請輸入暱稱'), 'warning');
            return;
        }

        if (newNickname.length > 20) {
            this.showToast(FF14Utils.getI18nText('treasure_map_nickname_too_long', '暱稱不能超過 20 個字元'), 'warning');
            return;
        }

        try {
            // 呼叫 API 更新暱稱
            // 注意：目前系統基於信任，只應更新自己的暱稱
            const response = await fetch(`${RoomCollaboration.CONSTANTS.API_BASE_URL}/rooms/${this.currentRoom.roomCode}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    memberId: this.currentUser.id,  // 只能更新自己的暱稱
                    nickname: newNickname
                })
            });

            if (!response.ok) {
                throw new Error(FF14Utils.getI18nText('treasure_map_update_nickname_failed', '更新暱稱失敗'));
            }

            const updatedRoom = await response.json();
            this.currentRoom = updatedRoom;

            // 更新本地資料
            this.currentUser.nickname = newNickname;
            this.elements.userNickname.textContent = newNickname;

            // 儲存偏好設定
            localStorage.setItem('ff14tw_user_nickname', newNickname);

            // 更新成員列表顯示
            this.updateMembersList();

            // 更新 localStorage 中的房間資料
            const savedDataStr = localStorage.getItem('ff14tw_current_room') || '{}';
            const parseResult = SecurityUtils.safeJSONParse(savedDataStr);
            const savedData = parseResult.success ? parseResult.data : {};
            savedData.currentUser = this.currentUser;
            localStorage.setItem('ff14tw_current_room', JSON.stringify({
                ...this.currentRoom,
                currentUser: this.currentUser,
                lastSyncAt: savedData.lastSyncAt
            }));

            this.hideModal('editNickname');
            this.showToast(FF14Utils.getI18nText('treasure_map_nickname_updated', '暱稱已更新'));

            // 記錄操作歷史
            this.addOperationHistory({
                type: 'nickname_update',
                message: FF14Utils.getI18nText('treasure_map_history_nickname_updated', '{nickname} 更新了暱稱', { nickname: this.currentUser.nickname }),
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('更新暱稱失敗:', error);
            this.showToast(FF14Utils.getI18nText('treasure_map_update_nickname_failed_retry', '更新暱稱失敗，請稍後再試'), 'error');
        }
    }

    // 顯示離開隊伍對話框
    showLeaveRoomDialog() {
        this.showModal('leaveRoom');
    }

    // 離開隊伍
    async leaveRoom(keepList) {
        try {
            // 記錄離開前的資訊
            const roomCode = this.currentRoom.roomCode;
            const nickname = this.currentUser.nickname;

            // 呼叫 API 離開房間
            // 注意：目前系統基於信任，只應傳送自己的 memberId
            const response = await fetch(`${RoomCollaboration.CONSTANTS.API_BASE_URL}/rooms/${roomCode}/leave`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    memberId: this.currentUser.id  // 只能移除自己
                })
            });

            if (!response.ok) {
                throw new Error(FF14Utils.getI18nText('treasure_map_leave_room_failed', '離開房間失敗'));
            }

            // 記錄操作歷史（在清除資料前）
            this.addOperationHistory({
                type: 'room_leave',
                message: FF14Utils.getI18nText('treasure_map_history_member_left', '{nickname} 離開了隊伍', { nickname }),
                timestamp: new Date().toISOString()
            });

            // 清除房間資料
            this.currentRoom = null;
            this.currentUser = null;
            localStorage.removeItem('ff14tw_current_room');
            localStorage.removeItem('ff14tw_room_created');

            // 移除 URL 參數
            const url = new URL(window.location);
            url.searchParams.delete('room');
            window.history.pushState({}, '', url);

            // 停止輪詢
            this.stopPolling();

            // 處理清單
            if (!keepList) {
                this.finder.clearAllMaps();
            }

            this.hideModal('leaveRoom');
            this.updateRoomUI();

            this.showToast(FF14Utils.getI18nText('treasure_map_left_room', '已離開隊伍'));

        } catch (error) {
            console.error('離開隊伍失敗:', error);
            this.showToast(FF14Utils.getI18nText('treasure_map_leave_room_failed_retry', '離開隊伍失敗，請稍後再試'), 'error');
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

        this.poll(); // 立即執行一次
        this.scheduleNextPoll();
    }

    // 停止輪詢
    stopPolling() {
        if (this.pollingTimer) {
            clearTimeout(this.pollingTimer);
            this.pollingTimer = null;
        }
        this.isPolling = false;
    }

    // 排程下次輪詢
    scheduleNextPoll() {
        const now = Date.now();
        const timeSinceActivity = now - this.lastActivity;
        const interval = timeSinceActivity > RoomCollaboration.CONSTANTS.POLL_INTERVAL.IDLE_THRESHOLD
            ? RoomCollaboration.CONSTANTS.POLL_INTERVAL.IDLE
            : RoomCollaboration.CONSTANTS.POLL_INTERVAL.ACTIVE;

        this.pollingTimer = setTimeout(() => {
            this.poll();
            this.scheduleNextPoll();
        }, interval);
    }

    // 執行輪詢
    async poll() {
        if (!this.currentRoom || this.isPolling) return;

        this.isPolling = true;

        try {
            // 呼叫 API 取得最新房間資料
            const response = await fetch(`${RoomCollaboration.CONSTANTS.API_BASE_URL}/rooms/${this.currentRoom.roomCode}`);

            if (!response.ok) {
                if (response.status === 404) {
                    // 隊伍已過期
                    this.showToast(FF14Utils.getI18nText('treasure_map_room_expired', '隊伍已過期'), 'error');
                    this.forceLeaveRoom();
                    return;
                }
                throw new Error('同步失敗');
            }

            const roomData = await response.json();

            // 檢查是否有更新
            const hasUpdate = this.checkForUpdates(roomData);

            if (hasUpdate) {
                this.currentRoom = roomData;

                // 同步寶圖清單
                this.syncTreasureMaps();

                // 更新 UI
                this.updateRoomUI();

                // 儲存更新
                const savedDataStr = localStorage.getItem('ff14tw_current_room') || '{}';
                const parseResult = SecurityUtils.safeJSONParse(savedDataStr);
                const savedData = parseResult.success ? parseResult.data : {};
                savedData.lastSyncAt = new Date().toISOString();
                localStorage.setItem('ff14tw_current_room', JSON.stringify({
                    ...roomData,
                    currentUser: this.currentUser,
                    lastSyncAt: savedData.lastSyncAt
                }));
            }

            // 更新時間顯示
            this.updateActivityTime();
            this.updateRoomTTL();

            this.retryCount = 0; // 重置重試計數

        } catch (error) {
            console.error('同步失敗:', error);
            this.retryCount++;

            if (this.retryCount >= RoomCollaboration.CONSTANTS.RETRY_ATTEMPTS) {
                this.showToast(FF14Utils.getI18nText('treasure_map_room_sync_failed_network', '同步失敗，請檢查網路連線'), 'error');
                this.retryCount = 0;
            }
        } finally {
            this.isPolling = false;
        }
    }

    // 檢查是否有更新
    checkForUpdates(newData) {
        if (!this.currentRoom) return true;

        // 比較成員數量
        if (newData.members.length !== this.currentRoom.members.length) {
            return true;
        }

        // 比較寶圖數量
        if (newData.treasureMaps.length !== this.currentRoom.treasureMaps.length) {
            return true;
        }

        // 比較最後活動時間
        if (newData.lastActivityAt !== this.currentRoom.lastActivityAt) {
            return true;
        }

        return false;
    }

    // 同步寶圖清單
    syncTreasureMaps() {
        if (!this.currentRoom || !this.finder) return;

        // 從房間同步寶圖到本地
        this.finder.syncFromRoom();

        // 記錄操作歷史
        this.addOperationHistory({
            type: 'sync',
            message: FF14Utils.getI18nText('treasure_map_history_synced', '同步房間寶圖清單'),
            timestamp: new Date().toISOString()
        });
    }

    // 強制離開房間（房間過期時）
    forceLeaveRoom() {
        this.currentRoom = null;
        this.currentUser = null;
        localStorage.removeItem('ff14tw_current_room');
        localStorage.removeItem('ff14tw_room_created');

        const url = new URL(window.location);
        url.searchParams.delete('room');
        window.history.pushState({}, '', url);

        this.stopPolling();
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
        localStorage.setItem(historyKey, JSON.stringify(this.operationHistory));
    }

    // 載入操作歷史
    loadOperationHistory() {
        if (!this.currentRoom) return;

        const historyKey = `ff14tw_room_history_${this.currentRoom.roomCode}`;
        const savedHistory = localStorage.getItem(historyKey);

        if (savedHistory) {
            try {
                const parseResult = SecurityUtils.safeJSONParse(savedHistory);
                this.operationHistory = parseResult.success ? parseResult.data : [];
            } catch (error) {
                console.error('載入操作歷史失敗:', error);
                this.operationHistory = [];
            }
        }
    }

    // 清理過期的操作歷史
    cleanupExpiredHistory() {
        const keys = Object.keys(localStorage);
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
                    localStorage.removeItem(key);
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
        if (!confirm(FF14Utils.getI18nText('treasure_map_remove_member_confirm', '確定要移除 {nickname} 嗎？', { nickname: member.nickname }))) {
            return;
        }

        try {
            // 呼叫 API 移除成員
            const response = await fetch(`${RoomCollaboration.CONSTANTS.API_BASE_URL}/rooms/${this.currentRoom.roomCode}/remove-member`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requesterId: this.currentUser.id,  // 請求者 ID
                    targetMemberId: member.id          // 要移除的成員 ID
                })
            });

            if (!response.ok) {
                throw new Error(FF14Utils.getI18nText('treasure_map_remove_member_failed', '移除成員失敗'));
            }

            const updatedRoom = await response.json();
            this.currentRoom = updatedRoom;

            // 更新成員列表顯示
            this.updateMembersList();

            // 更新房間人數顯示
            this.elements.roomMembers.textContent = FF14Utils.getI18nText('treasure_map_member_count', '{count}/{max}人', { count: this.currentRoom.members.length, max: RoomCollaboration.CONSTANTS.MAX_MEMBERS });

            // 記錄操作歷史
            this.addOperationHistory({
                type: 'member_remove',
                message: FF14Utils.getI18nText('treasure_map_history_member_kicked', '{actor} 將 {target} 移出隊伍', { actor: this.currentUser.nickname, target: member.nickname }),
                timestamp: new Date().toISOString()
            });

            this.showToast(FF14Utils.getI18nText('treasure_map_member_removed', '已將 {nickname} 移出隊伍', { nickname: member.nickname }));

        } catch (error) {
            console.error('移除成員失敗:', error);
            this.showToast(FF14Utils.getI18nText('treasure_map_remove_member_failed_retry', '移除成員失敗，請稍後再試'), 'error');
        }
    }
}

// 匯出給主程式使用
window.RoomCollaboration = RoomCollaboration;
