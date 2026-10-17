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

    /**
     * 網址換上（或拿掉）隊伍代號：只動 room 這一個參數，其他參數與 hash 的內容不變；已經有 room 就原位換掉，沒有就接在最後。
     * 整個查詢字串會重新編碼，寫法可能跟著變、意思不變（例如 %20 變成 +）；逗號改回不編碼（同 FilterManager.buildUrl()、ListShare.stripParam()），
     * 所以 ?grade=g17,g10&maps=tm_017,tm_018 進隊伍後只多一個 room，離開後和進來前一模一樣
     * @param {string} href - 目前的完整網址，例如 location.href
     * @param {?string} code - 隊伍代號；null 就拿掉 room（參數拿光了就不留 ?）
     * @returns {string}
     */
    static withRoom(href, code) {
        const url = new URL(href);
        if (code) url.searchParams.set('room', code);
        else url.searchParams.delete('room');
        // URLSearchParams 會把逗號編成 %2C；逗號在查詢字串裡本來就合法，改回來網址比較好讀，也和篩選、分享連結寫的一樣
        url.search = url.searchParams.toString().replace(/%2C/gi, ',');
        return url.toString();
    }

    /**
     * 建立、加入隊伍的結果：{ success: true }，或 { success: false, kind, message }。
     * kind：busy（已經在隊伍裡或連線中）、format（代號格式不對）、not_found、full、map_limit、invalid_maps（清單裡有隊伍不收的寶圖）、
     * network、failed，或 legacy（舊的唯讀隊伍，recoverLegacyRoom() 已經提示過）。
     * busy 與 legacy 的 message 是空字串；錯誤訊息跳不跳、寫在哪裡、結束後的焦點，都是呼叫的人的事
     * @param {string} kind
     * @param {Object} [options] - 同 errorMessage()
     * @returns {{success: false, kind: string, message: string}}
     */
    static failure(kind, options) {
        return { success: false, kind, message: RoomCollaboration.errorMessage(kind, options) };
    }

    // 連不上（傳輸失敗）：沒有 status（fetch 失敗、回應不是 JSON）、5xx、429。伺服器沒有給出明確的答案，同一個請求之後再送可能就成功；
    // 其他的 4xx 是伺服器看過、明確拒絕。同步狀態只算連不上的失敗（noteTransportFailure()），拒絕的有各自的提示（onError）
    static isTransportError(error) {
        return !error?.status || error.status >= 500 || error.status === 429;
    }

    // 請求失敗的種類（failure() 的 kind）：先看 code 再看 status；連不上（isTransportError()）是 network
    static errorKind(error) {
        if (error?.code === 'ROOM_NOT_FOUND' || error?.status === 404) return 'not_found';
        if (error?.code === 'ROOM_FULL') return 'full';
        if (error?.code === 'MAP_LIMIT') return 'map_limit';
        if (error?.code === 'ROOM_RECREATE_REQUIRED') return 'legacy';
        return RoomCollaboration.isTransportError(error) ? 'network' : 'failed';
    }

    /**
     * 每種 kind 要給玩家看的字（busy、legacy 沒有字）。code 是要加入的隊伍代號；
     * map_limit 有 room（隊伍清單現有幾張）和 mine（要帶進去幾張）兩個數字才寫張數，沒有就用通用的句子；
     * failed 在建立隊伍（creating）時寫建立失敗
     */
    static errorMessage(kind, { code = '', room = null, mine = null, creating = false } = {}) {
        switch (kind) {
            case 'format':
                return FF14Utils.getI18nText('treasure_map_join_error_format', '代號是 6 碼英文和數字。');
            case 'not_found':
                return FF14Utils.getI18nText('treasure_map_join_error_not_found', '找不到隊伍 {code}。可能打錯了，或隊伍已經解散（24 小時沒有動靜就會解散）。', { code });
            case 'full':
                return FF14Utils.getI18nText('treasure_map_join_error_full', '隊伍 {code} 已經滿 8 人了。', { code });
            case 'map_limit':
                return room !== null && mine !== null
                    ? FF14Utils.getI18nText('treasure_map_join_error_map_limit', '隊伍清單已經有 {room} 張，加上你的 {mine} 張會超過 8 張。選「不帶」，或先刪掉幾張再加入。', { room, mine })
                    : FF14Utils.getI18nText('treasure_map_join_error_map_limit_generic', '隊伍清單最多 8 張，加上你的寶圖會超過。選「不帶」，或先刪掉幾張再加入。');
            case 'invalid_maps':
                return FF14Utils.getI18nText('treasure_map_party_invalid_maps', '你的清單裡有隊伍不支援的寶圖。選「不帶」，或先把它們刪掉。');
            case 'network':
                return FF14Utils.getI18nText('treasure_map_join_error_network', '連不上隊伍伺服器，請稍後再試。');
            case 'failed':
                return creating
                    ? FF14Utils.getI18nText('treasure_map_create_error_failed', '建立失敗，請再試一次。')
                    : FF14Utils.getI18nText('treasure_map_join_error_failed', '加入失敗，請再試一次。');
            default:
                return '';
        }
    }

    // 要帶進隊伍的寶圖（toRoomMap() 之後的樣子）能不能過隊伍的規則：以前匯入的自訂寶圖可能有隊伍不收的 id（空白、特殊字元），
    // 照樣送出去整個建立或加入都會被拒絕，所以送出之前先用 validateMapOperations() 檢查
    static mapsFitParty(initialMaps) {
        try {
            RoomCollaboration.validateMapOperations(initialMaps.map(map => ({ type: 'add', map })));
            return true;
        } catch {
            return false;
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
        // 同步狀態：'ok'，或連續 RETRY_ATTEMPTS 次傳輸失敗之後的 'failing'（noteTransportFailure()、noteSyncSuccess()）；PartyStatus 照它畫
        this.syncState = 'ok';
        this.transportFailures = 0;   // 連續傳輸失敗的次數，有一次成功就歸零
        this.tag = null;          // 這台機器的預設名字字串；第一次需要時才讀或產生（nicknameTag()）
        this.knownMembers = {};   // 看過的成員 id → 名字；離開隊伍的人之後還寫得出名字（rememberMembers()）
        this.modalManager = new ModalManager();
        this.mapSync = new RoomMapSync({
            // 送出成功就是連得上，失敗次數歸零；送出時的隊伍已經換了（離開、換隊伍）的過期回應不算
            send: async (roomCode, batch) => {
                const generation = this.sessionGeneration;
                const room = await this.request(`/rooms/${roomCode}`, {
                    method: 'PUT', body: batch, authenticated: true
                });
                if (generation === this.sessionGeneration) this.noteSyncSuccess();
                return room;
            },
            onChange: (room, maps) => {
                this.currentRoom = room;
                const member = room.members.find(item => item.id === this.currentUser?.id);
                if (!member) {
                    if (this.isLeaving) return;
                    this.forceLeaveRoom();
                    this.showSessionExpiredToast();
                    return;
                }
                this.currentUser = member;
                // 先記名字再重畫、存檔：畫面要用它決定誰的圖，存檔要帶著它
                this.rememberMembers(room);
                this.finder.syncFromRoom(maps);
                this.updateRoomUI();
                this.saveSession();
                // 開著的離開、移出對話框跟著新的隊伍重畫（張數、成員有變；被移出的人已經不在了就關掉）
                this.dialogs?.refresh();
            },
            onError: error => {
                if (error.preserveLocal) {
                    this.forceLeaveRoom();
                    this.showSessionExpiredToast();
                } else if (error.code === 'ROOM_RECREATE_REQUIRED' && error.room) {
                    this.recoverLegacyRoom(error.room);
                } else if (error.status === 401 || error.status === 403 || error.status === 404) {
                    if (this.isLeaving) return;
                    this.forceLeaveRoom();
                    this.showSessionExpiredToast();
                } else if (RoomCollaboration.isTransportError(error)) {
                    // 連不上：那一筆留著之後重送，不跳 toast，由同步狀態說（連續失敗到一定次數才顯示，不會每失敗一次就跳一次）
                    this.noteTransportFailure();
                } else {
                    // 伺服器明確拒絕了這一筆變更：RoomMapSync 已經把它丟掉、清單換成隊伍目前的樣子，告訴玩家剛剛的變更沒有進去。
                    // 伺服器回得出答案就是連得上：失敗次數歸零（之前送不出去的那幾次不和之後的連起來算），已經是連不上就回到已同步
                    this.noteSyncSuccess();
                    this.showToast(error.code === 'MAP_LIMIT'
                        ? FF14Utils.getI18nText('treasure_map_sync_rejected_limit', '隊伍清單最多 8 張，剛剛加的寶圖沒有加進去。')
                        : FF14Utils.getI18nText('treasure_map_sync_rejected', '有一筆變更沒有送進隊伍，清單已換成隊伍目前的樣子。'), 'error');
                }
            }
        });

        this.elements = {
            createRoomBtn: document.getElementById('createRoomBtn'),
            joinRoomBtn: document.getElementById('joinRoomBtn'),
            copyInviteBtn: document.getElementById('copyInviteBtn')
        };

        // 只剩改名對話框由這裡開關（RoomCollaboration 自己的 ModalManager）；建立、加入、離開與移出的對話框在 RoomDialogs
        this.modals = {
            editNickname: document.getElementById('editNicknameModal')
        };

        // 隊伍狀態（代號、同步狀態、成員一行與成員列表）由 PartyStatus 畫，建構時只抓元素，事件在 setupEventListeners() 才掛
        this.status = new PartyStatus(this);
        // 組隊的頁內對話框（建立、加入、離開隊伍與移出成員）由 RoomDialogs 管，同樣建構時只抓元素，事件在 setupEventListeners() 才掛
        this.dialogs = new RoomDialogs(this);

        // 語言切換時重畫隊伍狀態（成員一行的字、每一列的標籤與按鈕都帶語言）
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
            knownMembers: this.knownMembers,
            lastSyncAt: new Date().toISOString()
        });
    }

    // 這台機器的字串（光之戰士K7Q 的 K7Q）：第一次需要時才讀或產生，記在 this.tag。
    // 瀏覽器封鎖網站資料時存不起來，所以要靠這裡記住：這個頁面開著的期間一直用同一組
    nicknameTag() {
        if (!this.tag) this.tag = PartyNames.readTag(RoomCollaboration.safeStorage());
        return this.tag;
    }

    // 建立、加入隊伍時送出的名字：自己改過的優先，沒有就是目前介面語言的開頭接上這台機器的字串。不寫進 localStorage
    defaultNickname() {
        return PartyNames.resolveNickname(RoomCollaboration.safeStorage(), window.i18n.getCurrentLanguage(), this.nicknameTag());
    }

    // 把隊伍資料裡每位成員的名字併進 knownMembers：改名會更新，已經離開的人不會被拿掉。
    // mapSync 的 onChange 在本機變更時也會觸發，每次都併，結果一樣
    rememberMembers(room) {
        for (const member of room.members) {
            if (typeof member?.id === 'string' && typeof member.nickname === 'string') this.knownMembers[member.id] = member.nickname;
        }
    }

    // 一張寶圖是誰加的（PartyNames.ownerOf()）；不在隊伍裡回 null
    ownerOf(map) {
        if (!this.currentRoom) return null;
        return PartyNames.ownerOf(map, {
            members: this.currentRoom.members,
            knownMembers: this.knownMembers,
            meId: this.currentUser?.id
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

    // 伺服器收下建立或加入之後接上隊伍；回傳結果（見 failure()）。重試途中別人加了圖、合計超過 8 張時不接上，
    // 也不跳 toast：結果往外回，由呼叫的人顯示
    completeConnection(room, member, memberToken, retained) {
        const original = new Map(this.connectionAttempt.body.initialMaps.map(map => [map.id, map]));
        const latest = new Map(retained.map(map => [map.id, this.finder.toRoomMap(map)]));
        const operations = [];
        for (const map of room.treasureMaps) {
            if (original.has(map.id) && !latest.has(map.id) && map.addedBy === member.id) {
                operations.push({ type: 'remove', id: map.id });
            }
        }
        // 重試途中才加進清單的圖：記成自己的（同 toggleMapInList()，伺服器收到之後也會這樣記），還沒送出去時「誰的圖」就是對的
        for (const [id, map] of latest) {
            if (!original.has(id) && !room.treasureMaps.some(item => item.id === id)) operations.push({ type: 'add', map: { ...map, addedBy: member.id } });
        }
        const projected = new Set(room.treasureMaps.map(map => map.id));
        for (const operation of operations) {
            if (operation.type === 'remove') projected.delete(operation.id);
            else projected.add(operation.map.id);
        }
        if (projected.size > RoomCollaboration.CONSTANTS.MAX_MAPS) return RoomCollaboration.failure('map_limit');
        const pending = operations.length ? [{ clientRequestId: crypto.randomUUID(), operations,
            preserveLocalOnRejection: true }] : [];
        this.adoptSession(room, member, memberToken, pending);
        return { success: true };
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

    // 建立或加入隊伍結束後、清單面板開著時的焦點，由呼叫 createRoom()／joinRoom() 的人在拿到結果之後呼叫
    //（那時 setConnecting(false) 已經執行）。按下去的那顆連線中被停用，Chrome 當下就把焦點退回 body：
    // 成功了它也跟著組隊按鈕藏起來，焦點放到隊伍狀態的第一個按鈕「複製邀請連結」；沒成功就放回那顆（trigger）
    focusAfterConnecting(trigger) {
        if (!this.isListPanelOpen()) return;
        (this.currentRoom ? this.elements.copyInviteBtn : trigger)?.focus?.();
    }

    // poll 是 false 時不開始輪詢：呼叫的人還要先做別的事（例如先送完變更再離開）才會自己呼叫 startPolling()
    adoptSession(room, member, memberToken, pending = [], { poll = true } = {}) {
        if (!member || !/^[a-f0-9]{64}$/.test(memberToken || '')) throw new Error('Invalid room credentials');
        this.sessionGeneration++;
        this.currentUser = member;
        this.memberToken = memberToken;
        // 新的隊伍從「已同步」、失敗 0 次開始，上一個隊伍的連線問題不帶過來。要在 connect() 之前：connect() 會重畫隊伍狀態，畫的就是 syncState
        this.noteSyncSuccess();
        this.rememberMembers(room);
        this.mapSync.connect(room, pending);
        this.connectionAttempt = null;
        // 進出隊伍不新增瀏覽紀錄，網址只多一個 room（其他參數與 hash 的內容不變，見 withRoom()）
        window.history.replaceState(window.history.state, '', RoomCollaboration.withRoom(window.location.href, room.roomCode));
        if (poll) this.startPolling();
    }

    /**
     * 用存著的連線紀錄（ff14tw_current_room）接回隊伍：載入時的情況 a，以及邀請連結的對話框（RoomDialogs#openLink()）接回原本的隊伍 A。
     * knownMembers 是存檔裡的欄位，不屬於隊伍資料：拿出來驗證（存值壞掉就當作空的），不交給 mapSync.connect()。poll 同 adoptSession()
     * @param {Object} saved - isRoomValid() 檢查過的紀錄
     * @param {{poll?: boolean}} [options]
     */
    restoreSession(saved, { poll = true } = {}) {
        const { currentUser, memberToken, pendingMapOperations, lastSyncAt, knownMembers, ...room } = saved;
        this.knownMembers = PartyNames.validKnownMembers(knownMembers);
        this.adoptSession(room, currentUser, memberToken, pendingMapOperations || [], { poll });
    }

    recoverLegacyRoom(room) {
        // Keep both the personal list and the former shared list available in the personal list and for new rooms.
        const maps = new Map(this.finder.listManager.getList().map(map => [map.id, this.finder.toRoomMap(map)]));
        for (const map of room.treasureMaps || []) if (!maps.has(map.id)) maps.set(map.id, map);
        this.finder.listManager.syncFromRoom([...maps.values()], this.finder.maps);
        this.finder.updateListCount();
        this.finder.updateCardButtons();
        this.finder.renderMyList();
        this.forceLeaveRoom();
        this.showToast(FF14Utils.getI18nText('treasure_map_legacy_room', '這個隊伍已轉為唯讀，寶圖已保留在你的清單，請建立新的隊伍。'), 'warning');
    }

    setupEventListeners() {
        // 隊伍操作：建立、加入、離開隊伍與移出成員由 RoomDialogs 處理（建立：清單是空的直接建立，不是空的先問帶不帶；加入：輸入隊伍代號；
        // 離開：留在我的清單還是清空；移出：隊長按成員列表裡的「移出」）
        this.elements.createRoomBtn.addEventListener('click', () => this.dialogs.openCreate());
        this.elements.joinRoomBtn.addEventListener('click', () => this.dialogs.openJoin());
        // 隊伍狀態的按鈕：複製邀請連結、複製代號、離開、成員一行與成員列表裡的改名、移出
        this.status.init();
        // 建立、加入、離開隊伍與移出成員對話框裡的按鈕、代號欄與選項
        this.dialogs.init();

        // 改名對話框
        document.getElementById('closeNicknameModalBtn').addEventListener('click', () => this.hideModal('editNickname'));
        document.getElementById('cancelNicknameBtn').addEventListener('click', () => this.hideModal('editNickname'));
        document.getElementById('confirmNicknameBtn').addEventListener('click', () => this.confirmEditNickname());

        // Enter 鍵確認
        document.getElementById('nicknameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.confirmEditNickname();
        });

        // 追蹤活動
        document.addEventListener('click', () => this.updateActivity());
        document.addEventListener('keypress', () => this.updateActivity());
    }

    /**
     * 載入時依網址的 ?room= 與這台裝置存的連線紀錄（ff14tw_current_room）接回或加入隊伍（設計 6.5）。代號先轉大寫（邀請連結被改成小寫也認得）；
     * 格式不對的代號不用讀隊伍就知道加不進去：提示、從網址拿掉 room，之後當作網址沒有 room。接著分四種：
     * a. 有這一隊、還有效的紀錄（或網址沒有 room）：直接接回去，不問；
     * b. 舊格式紀錄（沒有 token）：唯讀就保留寶圖，否則提示失效；
     * c. 沒有紀錄，或紀錄已失效（先清掉，網址的 room 留著）：讀隊伍，問要不要加入（RoomDialogs#openLink()）；
     * d. 有另一隊 A 的有效紀錄：先不接回 A，同樣讀隊伍、問要不要加入（對話框多一行「加入會先離開 A」，「不用了」才接回 A）。
     * c、d 等對話框有答案才結束，所以 ready（見 init()）也一樣：分享寶圖的對話框（?maps=）排在加入的對話框之後
     */
    async checkExistingRoom() {
        let requestedCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() || null;
        if (requestedCode && !/^[A-Z0-9]{6}$/.test(requestedCode)) {
            this.showToast(RoomCollaboration.errorMessage('format'), 'error');
            window.history.replaceState(window.history.state, '', RoomCollaboration.withRoom(window.location.href, null));
            requestedCode = null;
        }
        const saved = SecurityUtils.getValidatedStorageData('ff14tw_current_room');
        const valid = Boolean(saved) && this.isRoomValid(saved);
        if (valid && (!requestedCode || saved.roomCode === requestedCode)) {
            this.restoreSession(saved);
            return;
        }
        if (saved?.roomCode && !saved.memberToken && (!requestedCode || requestedCode === saved.roomCode)) {
            try {
                const room = await this.request(`/rooms/${saved.roomCode}`);
                if (room.readOnly) this.recoverLegacyRoom(room);
                else {
                    this.forceLeaveRoom();
                    this.showSessionExpiredToast();
                }
            } catch (error) {
                if (error.status === 404) this.forceLeaveRoom();
                else this.showToast(FF14Utils.getI18nText('treasure_map_room_sync_failed_network', '連不上隊伍伺服器，請檢查網路連線。'), 'error');
            }
            return;
        }
        if (saved && !valid) this.forceLeaveRoom({ keepRoomParam: true });
        if (requestedCode) await this.dialogs.openLink({ code: requestedCode, current: valid ? saved : null });
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

    /**
     * 建立新隊伍。本機清單帶不帶是玩家的選擇：clearLocal 是 false 就把清單帶進隊伍清單，true 就不帶（隊伍清單從空的開始，
     * 成功後本機清單就是隊伍清單）。回傳結果（見 failure()）；這裡只跳成功的 toast，焦點與錯誤訊息是呼叫的人
     * （RoomDialogs#openCreate()、#confirmCreate()）的事
     * @param {{clearLocal?: boolean}} [options]
     */
    async createRoom({ clearLocal = false } = {}) {
        if (this.currentRoom || this.isConnecting) return RoomCollaboration.failure('busy');
        // 到 setConnecting(true) 之前都沒有 await：連按兩次時，第二次一定看得到第一次的連線中
        const retained = clearLocal ? [] : this.finder.listManager.getList();
        if (retained.length > RoomCollaboration.CONSTANTS.MAX_MAPS) {
            return { success: false, kind: 'map_limit', message: FF14Utils.getI18nText('treasure_map_party_over_limit', '隊伍清單最多 8 張：先把清單刪到 8 張以內，或選「不帶」。') };
        }
        const initialMaps = retained.map(map => this.finder.toRoomMap(map));
        if (!RoomCollaboration.mapsFitParty(initialMaps)) return RoomCollaboration.failure('invalid_maps');
        this.setConnecting(true);
        try {
            const body = this.connectionRequest('create', '', this.defaultNickname(), initialMaps);
            const data = await this.request('/rooms', { method: 'POST', body });
            const { memberId, memberToken, ...room } = data;
            const connected = this.completeConnection(room, room.members.find(member => member.id === memberId), memberToken, retained);
            if (!connected.success) return connected;
            this.showToast(FF14Utils.getI18nText('treasure_map_create_room_success', '隊伍 {code} 建立成功！', { code: room.roomCode }));
            await this.mapSync.flush();
            return { success: true };
        } catch (error) {
            if (error.status >= 400 && error.status < 500 && error.status !== 429) this.connectionAttempt = null;
            console.error('建立隊伍失敗:', error);
            return RoomCollaboration.failure(RoomCollaboration.errorKind(error), { creating: true });
        } finally {
            this.setConnecting(false);
        }
    }

    /**
     * 讀隊伍目前的樣子（GET /rooms/:code），給邀請連結的對話框（RoomDialogs#openLink()）用：讀得到回 { room }；
     * 舊的唯讀隊伍回 { kind: 'legacy', room }（寶圖怎麼留由呼叫的人決定）；成員已經 8 人回 { kind: 'full', message, room }；
     * 請求失敗照 errorKind()／errorMessage() 回 { kind, message }（not_found、network、failed）。只讀：不跳 toast，不動隊伍與清單
     * @param {string} code - 隊伍代號（6 碼大寫英數字）
     * @returns {Promise<{room: Object} | {kind: string, message: string, room?: Object}>}
     */
    async previewRoom(code) {
        try {
            const room = await this.request(`/rooms/${code}`);
            if (room.readOnly) return { kind: 'legacy', room };
            if (room.members.length >= RoomCollaboration.CONSTANTS.MAX_MEMBERS) {
                return { kind: 'full', message: RoomCollaboration.errorMessage('full', { code }), room };
            }
            return { room };
        } catch (error) {
            let kind = RoomCollaboration.errorKind(error);
            // 讀取不會回 ROOM_RECREATE_REQUIRED（舊的唯讀隊伍是上面的 readOnly）：萬一回了也沒有隊伍可以留，當作一般的失敗
            if (kind === 'legacy') kind = 'failed';
            return { kind, message: RoomCollaboration.errorMessage(kind, { code }) };
        }
    }

    /**
     * 加入隊伍。clearLocal 同 createRoom()；nickname 有給就原樣送出（邀請連結的對話框裡寫的名字），沒給用這台機器的預設名字。
     * 回傳結果（見 failure()）；這裡只跳成功的 toast，焦點與錯誤訊息是呼叫的人
     * （RoomDialogs#confirmJoin()、#confirmLink()）的事
     * @param {string} roomCode
     * @param {{clearLocal?: boolean, nickname?: ?string}} [options]
     */
    async joinRoom(roomCode, { clearLocal = false, nickname = null } = {}) {
        if (this.currentRoom || this.isConnecting) return RoomCollaboration.failure('busy');
        if (!/^[A-Z0-9]{6}$/.test(roomCode)) return RoomCollaboration.failure('format');
        // 到 setConnecting(true) 之前都沒有 await：連按兩次時，第二次一定看得到第一次的連線中
        const retained = clearLocal ? [] : this.finder.listManager.getList();
        const initialMaps = retained.map(map => this.finder.toRoomMap(map));
        if (!RoomCollaboration.mapsFitParty(initialMaps)) return RoomCollaboration.failure('invalid_maps');
        this.setConnecting(true);
        try {
            // Check before joining so a full room never destroys the player's personal list.
            const preview = await this.request(`/rooms/${roomCode}`);
            if (preview.readOnly) {
                this.recoverLegacyRoom(preview);
                return RoomCollaboration.failure('legacy');
            }
            // 重試同一個加入時，上一次可能已經成功、只是回應掉了（自己可能就是第 8 位成員，清單也已經併進隊伍）：
            // 伺服器會把同一個成員還回來，所以人數與張數都不擋
            if (this.connectionAttempt?.key !== `join:${roomCode}`) {
                if (preview.members.length >= RoomCollaboration.CONSTANTS.MAX_MEMBERS) return RoomCollaboration.failure('full', { code: roomCode });
                if (new Set([...preview.treasureMaps, ...retained].map(map => map.id)).size > RoomCollaboration.CONSTANTS.MAX_MAPS) {
                    return RoomCollaboration.failure('map_limit', { room: preview.treasureMaps.length, mine: retained.length });
                }
            }
            const { room, newMember, memberToken } = await this.request(`/rooms/${roomCode}/join`, {
                method: 'POST', body: this.connectionRequest('join', roomCode, nickname ?? this.defaultNickname(), initialMaps)
            });
            const connected = this.completeConnection(room, newMember, memberToken, retained);
            if (!connected.success) return connected;
            this.showToast(FF14Utils.getI18nText('treasure_map_join_room_success', '已加入隊伍 {code}', { code: roomCode }));
            await this.mapSync.flush();
            return { success: true };
        } catch (error) {
            if (error.status >= 400 && error.status < 500 && error.status !== 429) this.connectionAttempt = null;
            console.error('加入隊伍失敗:', error);
            let kind = RoomCollaboration.errorKind(error);
            if (kind === 'legacy') {
                // 舊的唯讀隊伍：寶圖留在本機，由 recoverLegacyRoom() 提示；沒附隊伍就沒有東西可留，當作一般失敗
                if (error.room) {
                    this.recoverLegacyRoom(error.room);
                    return RoomCollaboration.failure('legacy');
                }
                kind = 'failed';
            }
            return RoomCollaboration.failure(kind, { code: roomCode });
        } finally {
            this.setConnecting(false);
        }
    }

    // 顯示改名對話框
    showEditNicknameDialog() {
        const input = document.getElementById('nicknameInput');
        input.value = this.currentUser.nickname;
        this.showModal('editNickname');
        input.focus();
        input.select();
    }

    // 確認改名
    async confirmEditNickname() {
        const newNickname = document.getElementById('nicknameInput').value.trim();
        if (!newNickname || newNickname.length > 20 || !this.currentRoom) return;
        const generation = this.sessionGeneration;
        // 送出前自己的名字：mapSync.receive() 一收到新名字就換掉 currentUser，之後再讀就是新名字了
        const previous = this.currentUser.nickname;
        try {
            const updatedRoom = await this.request(`/rooms/${this.currentRoom.roomCode}`, {
                method: 'PUT', authenticated: true,
                body: { nickname: newNickname, clientRequestId: crypto.randomUUID() }
            });
            if (generation !== this.sessionGeneration) return;
            this.mapSync.receive(updatedRoom);
            // 只有「改名」會寫 ff14tw_user_nickname：自訂的名字存起來，沒改就不寫，改成預設名字（或舊樣式）就刪掉
            PartyNames.rememberRename(RoomCollaboration.safeStorage(), newNickname, { previous, tag: this.nicknameTag() });
            this.hideModal('editNickname');
            this.showToast(FF14Utils.getI18nText('treasure_map_nickname_updated', '已改名'));
        } catch (error) {
            if (generation === this.sessionGeneration) this.showToast(FF14Utils.getI18nText('treasure_map_update_nickname_failed_retry', '更新暱稱失敗，請稍後再試'), 'error');
        }
    }

    // 離開隊伍：開 RoomDialogs 的離開對話框（留在我的清單還是清空），真正離開是對話框裡的確認鈕呼叫 leaveRoom()
    showLeaveRoomDialog() {
        this.dialogs.openLeave();
    }

    /**
     * 離開隊伍：先把還沒送出的變更送完，再送離開（401、403、404 是伺服器已經不認得我，當作已經離開了）。
     * 回傳結果：{ success: true }，或 { success: false, message }。message 是要給玩家看的原因：變更還沒送完是 treasure_map_leave_room_sync_failed，
     * 其他失敗是 treasure_map_leave_room_failed_retry；不在隊伍裡、正在連線時什麼都沒做，同樣回失敗；
     * 離開途中隊伍就被別的路徑結束了（變更被拒絕、連線失效…），沒有東西可離開，message 是空字串（那條路徑已經說過原因了）。
     * 這裡不關對話框、不移動焦點，失敗也不跳 toast：訊息寫在哪裡、焦點放哪，是呼叫的人（RoomDialogs#confirmLeave()）的事。
     * 成功時 quiet 是 false 才跳「已離開隊伍」。失敗後人還在隊伍裡：quiet 是 false 就恢復輪詢；
     * quiet 是 true 不恢復，由呼叫的人決定（切換隊伍時，要等玩家選了才輪詢）
     * @param {boolean} keepList - false 就在離開之後清空本機清單
     * @param {{quiet?: boolean}} [options]
     * @returns {Promise<{success: true} | {success: false, message: string}>}
     */
    async leaveRoom(keepList, { quiet = false } = {}) {
        if (!this.currentRoom || this.isConnecting) {
            return { success: false, message: FF14Utils.getI18nText('treasure_map_leave_room_failed_retry', '離開失敗，請稍後再試。') };
        }
        this.setConnecting(true);
        this.isLeaving = true;
        this.stopPolling();
        const generation = this.sessionGeneration;
        const interrupted = { success: false, message: '' };
        const finish = () => {
            this.forceLeaveRoom();
            if (!keepList) {
                this.finder.listManager.clear();
                this.finder.updateListCount();
                this.finder.updateCardButtons();
                this.finder.renderMyList();
            }
            if (!quiet) this.showToast(FF14Utils.getI18nText('treasure_map_left_room', '已離開隊伍'));
            return { success: true };
        };
        try {
            const synced = await this.mapSync.flush();
            if (generation !== this.sessionGeneration) return interrupted;
            if (!synced) {
                return { success: false, message: FF14Utils.getI18nText('treasure_map_leave_room_sync_failed', '你的變更還沒送出，請稍後再試。') };
            }
            await this.request(`/rooms/${this.currentRoom.roomCode}/leave`, {
                method: 'POST', authenticated: true, body: { clientRequestId: crypto.randomUUID() }
            });
            if (generation !== this.sessionGeneration) return interrupted;
            return finish();
        } catch (error) {
            if (generation !== this.sessionGeneration) return interrupted;
            if ([401, 403, 404].includes(error.status)) return finish();
            return { success: false, message: FF14Utils.getI18nText('treasure_map_leave_room_failed_retry', '離開失敗，請稍後再試。') };
        } finally {
            this.isLeaving = false;
            this.setConnecting(false);
            if (!quiet && this.currentRoom && generation === this.sessionGeneration) this.startPolling();
        }
    }

    // 離開隊伍之後、清單面板開著時的焦點，由呼叫 leaveRoom() 的人在拿到結果之後呼叫（那時 setConnecting(false) 已經執行）：
    // 隊伍狀態連同離開鈕藏起來了，關掉對話框時焦點還給離開鈕等於沒還；改放到又出現的「建立隊伍」
    focusAfterLeaving() {
        if (this.isListPanelOpen()) this.elements.createRoomBtn?.focus?.();
    }

    /**
     * 邀請連結：網址的來源、路徑加上 ?room=代號。不帶等級、地區、maps 與 hash：對方打開的是乾淨的頁面，直接問要不要加入這個隊伍
     * @param {string} href - 目前的完整網址，例如 location.href
     * @param {string} code - 隊伍代號
     * @returns {string}
     */
    static inviteLink(href, code) {
        const url = new URL(href);
        return `${url.origin}${url.pathname}?room=${code}`;
    }

    // 複製邀請連結
    copyInviteLink() {
        this.copyText(RoomCollaboration.inviteLink(window.location.href, this.currentRoom.roomCode), 'treasure_map_invite_copied', '已複製邀請連結');
    }

    // 複製隊伍代號
    copyRoomCode() {
        this.copyText(this.currentRoom.roomCode, 'treasure_map_room_code_copied', '已複製隊伍代號');
    }

    // 把文字複製到剪貼簿，成功後跳 key 的 toast（fallback 是預設文字）。剪貼簿被拒絕、或根本沒有剪貼簿（不安全的環境）時改用備用複製
    copyText(text, key, fallback) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                this.showToast(FF14Utils.getI18nText(key, fallback));
            }).catch(() => {
                this.fallbackCopy(text, key, fallback);
            });
        } else {
            this.fallbackCopy(text, key, fallback);
        }
    }

    // 備用複製方法：選取一個暫時的 textarea 再下 copy 指令，之後跳同樣的 toast
    fallbackCopy(text, key, fallback) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.showToast(FF14Utils.getI18nText(key, fallback));
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
            // 這一輪成功＝讀得到隊伍、而且排著的變更也送完了（flush() 回 true）。不能一讀到隊伍就歸零：變更一直送不出去（PUT 回 5xx、429）
            // 而讀取沒問題時，每一輪的 GET 都成功，歸零會把送出失敗的次數洗掉，永遠累計不到 3，卡片一直寫「已同步」。
            // 還要看 generation：隊伍沒了（送變更的回覆裡已經沒有自己）flush() 也回 true，過期的輪詢不能動到新隊伍的狀態
            if (await this.mapSync.flush() && generation === this.sessionGeneration) this.noteSyncSuccess();
        } catch (error) {
            if (generation !== this.sessionGeneration || this.isLeaving) return;
            if (error.status === 404) {
                this.forceLeaveRoom();
                this.showToast(FF14Utils.getI18nText('treasure_map_room_expired', '隊伍已經解散，寶圖留在你的清單。'), 'error');
            } else {
                // 讀不到隊伍：不跳 toast，由同步狀態說。讀取不會有「伺服器拒絕一筆變更」的情況，所以連續被拒絕的 403 之類也算連不上
                this.noteTransportFailure();
            }
        } finally {
            if (generation === this.sessionGeneration) this.isPolling = false;
        }
    }

    /**
     * 同步狀態：連續 RETRY_ATTEMPTS（3）次傳輸失敗（輪詢讀不到隊伍、送不出變更，見 isTransportError()）才是 'failing'；
     * 有一次成功就歸零、回到 'ok'：一筆變更送出去了（mapSync 的 send）、伺服器明確拒絕了一筆變更（mapSync 的 onError：回得出答案就是連得上），
     * 或一次輪詢讀得到隊伍、排著的變更也送完了（poll()）。
     * 只讀得到隊伍不算成功：變更一直送不出去時，每次輪詢的 GET 都成功，不能把送出失敗的次數洗掉。
     * 失敗次數一直累計（不在 3 次時歸零）：狀態只在 ok 與 failing 互換的那一次才通知 PartyStatus，
     * 已經是 failing 時再失敗什麼都不重畫，同步狀態的字不會被重寫
     */
    noteTransportFailure() {
        this.transportFailures += 1;
        if (this.transportFailures >= RoomCollaboration.CONSTANTS.RETRY_ATTEMPTS) this.setSyncState('failing');
    }

    noteSyncSuccess() {
        this.transportFailures = 0;
        this.setSyncState('ok');
    }

    setSyncState(state) {
        if (this.syncState === state) return;
        this.syncState = state;
        this.status?.setSync(state);
    }

    syncTreasureMaps() {
        this.mapSync.notify();
    }

    forceLeaveRoom({ keepRoomParam = false } = {}) {
        this.sessionGeneration++;
        this.stopPolling();
        this.mapSync.disconnect();
        this.currentRoom = null;
        this.currentUser = null;
        this.memberToken = null;
        this.knownMembers = {};
        // 離開了：同步狀態回到 ok、失敗次數歸零，下一個隊伍從頭開始（同 adoptSession()）
        this.noteSyncSuccess();
        try {
            localStorage.removeItem('ff14tw_current_room');
            localStorage.removeItem('ff14tw_room_created');
        } catch { /* keep the current page usable when storage is unavailable */ }
        // 同 adoptSession()：不新增瀏覽紀錄，網址只拿掉 room。載入時清掉失效的紀錄（keepRoomParam）不拿：網址的 room 是接著要問的邀請，
        // 留到對話框有答案（RoomDialogs#finishLink()），對話框開著時重新整理還是同一個邀請
        if (!keepRoomParam) window.history.replaceState(window.history.state, '', RoomCollaboration.withRoom(window.location.href, null));
        this.updateRoomUI();
        // 隊伍沒了：清單的每一列與開著的路線頁重畫，ownerOf() 回 null，畫面上的「誰的圖」就一起消失（保留清單離開時清單本身沒變，
        // 不重畫的話每一列會停在離開之前的樣子）。每一條離開隊伍的路都走到這裡。測試替身不一定有 renderMyList
        this.finder?.renderMyList?.();
        // 改名、離開、移出的對話框只在隊伍裡才有意義（被移出、連線失效、隊伍過期、自己離開都會走到這裡）：隊伍沒了就關掉，
        // 不留一顆按了也沒用的確認鈕。建立、加入與邀請連結的對話框不動：切換隊伍時離開 A 之後，邀請連結的對話框還要留著加入 B。
        // 關掉時 ModalManager 把焦點還給開啟前的按鈕，那顆已經跟著隊伍狀態藏起來了：焦點放到又出現的「建立隊伍」
        const renameClosed = this.hideModal('editNickname');
        const partyDialogClosed = this.dialogs?.closeInParty() ?? false;
        if (renameClosed || partyDialogClosed) this.focusAfterLeaving();
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

    // 隱藏對話框（只在名字對應的對話框正是目前開著的那個時才關，避免關錯）；回傳有沒有關
    hideModal(modalName) {
        const modal = this.modals[modalName];
        if (!modal || this.modalManager.activeModal !== modal) return false;
        this.modalManager.hide();
        return true;
    }

    // 顯示提示訊息
    showToast(message, type = 'success') {
        FF14Utils.showToast(message, type);
    }

    // 隊伍連線失效（被移出、請求被拒絕、存著的紀錄已經不能用）的警告：寶圖留在玩家的清單，說出可能的原因和怎麼回去。
    // 所有連線失效的情況都用這一句，所以原因寫「可能」是被移出了
    showSessionExpiredToast() {
        this.showToast(FF14Utils.getI18nText('treasure_map_session_expired',
            '隊伍連線已失效，可能是被移出了隊伍。寶圖留在你的清單；要回去可以再點一次邀請連結，或輸入隊伍代號。'), 'warning');
    }

    // 更新隊伍 UI：清單面板裡的組隊按鈕（建立、加入）只在不在隊伍裡時顯示；隊伍狀態由 PartyStatus 畫
    updateRoomUI() {
        document.getElementById('teamActions')?.classList.toggle('hidden', Boolean(this.currentRoom));
        this.status.render();

        // 進出隊伍時清單入口跟著換（「隊伍 N/8」或「清單 N 張」）
        this.finder?.updateListCount?.();
    }

    /**
     * 移出成員（只有隊長按得到）。要不要移出已經在呼叫的人（RoomDialogs 的移出對話框）那裡問過了：這裡不問，不移動焦點，失敗也不跳 toast。
     * 回傳 { success: true }（跳「已將 X 移出隊伍」），或 { success: false, message }；
     * 請求途中隊伍就沒了（連線失效…）時 message 是空字串（那條路徑已經說過原因了）
     * @param {{id: string, nickname: string}} member - 隊伍成員裡的那一位
     * @returns {Promise<{success: true} | {success: false, message: string}>}
     */
    async removeMember(member) {
        const failed = () => ({ success: false, message: FF14Utils.getI18nText('treasure_map_remove_member_failed_retry', '移出失敗，請稍後再試。') });
        if (!this.currentRoom) return failed();
        const generation = this.sessionGeneration;
        try {
            const room = await this.request(`/rooms/${this.currentRoom.roomCode}/remove-member`, {
                method: 'POST', authenticated: true,
                body: { targetMemberId: member.id, clientRequestId: crypto.randomUUID() }
            });
            if (generation !== this.sessionGeneration) return { success: false, message: '' };
            this.mapSync.receive(room);
            this.showToast(FF14Utils.getI18nText('treasure_map_member_removed', '已將 {nickname} 移出隊伍', { nickname: member.nickname }));
            return { success: true };
        } catch (error) {
            return generation === this.sessionGeneration ? failed() : { success: false, message: '' };
        }
    }
}

// 給主程式使用
window.RoomCollaboration = RoomCollaboration;
