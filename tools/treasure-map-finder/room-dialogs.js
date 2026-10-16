// 組隊的頁內對話框：目前是「建立隊伍」與「加入隊伍」（邀請連結、離開、移出成員的對話框之後再加進來）。
// 標記都在 index.html（#createPartyModal、#joinRoomModal）。開關照 ListDialogs#showModal()：拿掉 .hidden、交給 ModalManager 以 style.display 顯示，
// 關閉時加回 .hidden。說明、迷你清單、選項與錯誤的字帶張數、代號、還要換語言，由這裡依狀態組出來、不掛 data-i18n：
// I18nManager 切換語言時會把 [data-i18n] 的文字整個換掉。
// 由 RoomCollaboration 建立（this.dialogs）；建構時只抓元素，事件在 init() 才掛
class RoomDialogs {
    // renderChoice() 的確認鈕：prefix → 按鈕的 id（邀請連結的對話框做的時候再加一筆）
    static CONFIRM_BUTTONS = {
        create: 'confirmCreateBtn',
        join: 'confirmJoinBtn'
    };

    // 字不一樣才寫：textContent 一寫就會換掉整個文字節點，螢幕閱讀器的閱讀位置可能跟著跑掉（同 ListDialogs.setText）
    static setText(element, text) {
        if (element.textContent !== text) element.textContent = text;
    }

    // collaboration 是 RoomCollaboration：隊伍的連線（createRoom()、joinRoom()）、結束後的焦點與 toast 都在它那裡
    constructor(collaboration) {
        this.collaboration = collaboration;
        this.finder = collaboration.finder;
        // 自己的 ModalManager：清單面板那個實例正拿著 #myListPanel，一個實例一次只管一個視窗。
        // 對話框開在面板上面，共用的堆疊讓 Escape 與焦點陷阱只作用在對話框，關閉後焦點回到按下去的按鈕
        this.modalManager = new ModalManager();
        // 第幾次打開對話框（showModal() 每次打開、關閉都加一）。連線要等伺服器，這段時間玩家可能按 Escape 關掉：
        // 那一次的結果屬於已經關掉的對話框，不能再去關它、把錯誤寫進去
        this.opening = 0;
        // 正在連線（建立或加入隊伍）的是哪一次打開的對話框（opening 的值），沒有是 null。連線中選項與確認鈕停用著，refresh() 不重畫
        this.connecting = null;
        // 迷你清單上一次畫的內容（語言與每一張的 id），依 renderChoice() 的 prefix 記：沒變就不重建，縮圖才不會一直重載
        this.listKeys = new Map();

        const byId = id => document.getElementById(id);
        this.elements = {
            createModal: byId('createPartyModal'),
            closeCreate: byId('closeCreateModalBtn'),
            cancelCreate: byId('cancelCreateBtn'),
            createError: byId('createPartyError'),
            joinModal: byId('joinRoomModal'),
            closeJoin: byId('closeJoinModalBtn'),
            cancelJoin: byId('cancelJoinBtn'),
            roomCode: byId('roomCodeInput'),
            roomCodeHint: byId('roomCodeHint'),
            roomCodeError: byId('roomCodeError'),
            joinMaps: byId('joinPartyMaps')
        };
        // renderChoice() 用到的元素，依 prefix 記起來（建立與加入的現在抓，其他的第一次用到時才抓）
        this.choices = {};
        this.choiceElements('create');
        this.choiceElements('join');

        window.i18n.onLanguageChange(() => this.refresh());
    }

    // 「你的清單有 N 張寶圖」那一塊（說明、迷你清單、單選、提醒）與確認鈕的元素，id 都是 prefix 加固定的名字：
    // #${prefix}PartyLede、#${prefix}PartyList、#${prefix}PartyChoice、#${prefix}PartyNote、#${prefix}ModeBring、#${prefix}ModeClear，
    // 以及兩個選項的 …Title 與 …Hint
    choiceElements(prefix) {
        if (!this.choices[prefix]) {
            const byId = id => document.getElementById(id);
            this.choices[prefix] = {
                lede: byId(`${prefix}PartyLede`),
                list: byId(`${prefix}PartyList`),
                choice: byId(`${prefix}PartyChoice`),
                note: byId(`${prefix}PartyNote`),
                bring: byId(`${prefix}ModeBring`),
                clear: byId(`${prefix}ModeClear`),
                title: { bring: byId(`${prefix}ModeBringTitle`), clear: byId(`${prefix}ModeClearTitle`) },
                hint: { bring: byId(`${prefix}ModeBringHint`), clear: byId(`${prefix}ModeClearHint`) },
                confirm: byId(RoomDialogs.CONFIRM_BUTTONS[prefix])
            };
        }
        return this.choices[prefix];
    }

    // 由 RoomCollaboration#setupEventListeners() 呼叫：接上建立與加入隊伍對話框裡的按鈕、代號欄與兩個選項
    init() {
        const { elements } = this;
        const create = this.choiceElements('create');
        elements.closeCreate.addEventListener('click', () => this.close(elements.createModal));
        elements.cancelCreate.addEventListener('click', () => this.close(elements.createModal));
        create.confirm.addEventListener('click', () => this.confirmCreate());
        for (const radio of [create.bring, create.clear]) {
            radio.addEventListener('change', () => this.handleCreateModeChange());
        }

        const join = this.choiceElements('join');
        elements.closeJoin.addEventListener('click', () => this.close(elements.joinModal));
        elements.cancelJoin.addEventListener('click', () => this.close(elements.joinModal));
        join.confirm.addEventListener('click', () => this.confirmJoin());
        for (const radio of [join.bring, join.clear]) {
            radio.addEventListener('change', () => this.handleJoinModeChange());
        }
        // 改了代號，上一次失敗的錯誤就不再適用
        elements.roomCode.addEventListener('input', () => this.clearJoinError());
        // 代號欄按 Enter 等於按「加入」。輸入法選字時的 Enter 是選字（keydown 的 isComposing 是 true），不是送出
        elements.roomCode.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing) this.confirmJoin();
        });
    }

    // 拿掉 .hidden 再交給 ModalManager 顯示；關閉時加回 .hidden、清掉 ModalManager 設的 display，最後呼叫 onClose
    // （不管怎麼關：按鈕、Escape、點遮罩都會走到；ModalManager 已經先把焦點還給開啟前的元素）
    showModal(element, onClose) {
        element.classList.remove('hidden');
        this.opening += 1;
        this.modalManager.show(element, {
            useClass: null,
            displayStyle: 'flex',
            onClose: () => {
                this.opening += 1;
                element.classList.add('hidden');
                element.style.display = '';
                onClose?.();
            }
        });
    }

    // 只在這個對話框正是目前開著的那個時才關，避免關錯
    close(element) {
        if (this.modalManager.activeModal === element) this.modalManager.hide();
    }

    // 開著的對話框裡由程式組的字重畫：切換語言（I18nManager 先換掉 [data-i18n] 的固定字，再來這裡）會來。
    // 上一次失敗的錯誤是舊語言寫的，收起來（再按一次就用新語言重新產生）；玩家已經勾的選項不動。沒開著的下次打開時才畫。
    // 連線中（建立或加入）不重畫：選項與確認鈕停用著，連上之後清單也會換成隊伍的清單
    refresh() {
        if (this.connecting === this.opening) return;
        const open = this.modalManager.activeModal;
        if (open === this.elements.createModal) {
            this.hideCreateError();
            this.renderCreate(false);
        } else if (open === this.elements.joinModal) {
            // 加入也一樣：錯誤收起來，說明接著回來；玩家打的代號與勾的選項不動
            this.clearJoinError();
            this.renderJoin(false);
        }
    }

    /**
     * 「你的清單有 N 張寶圖」加迷你清單，以及帶不帶進隊伍的單選：建立、加入、邀請連結三個對話框共用，元素見 choiceElements()。
     * 「帶進」停用時（overLimit）寫提醒；確認鈕在超過上限、又沒選「不帶」時停用（預設不能是「不帶」：那會清掉玩家的寶圖）。
     * 清單是空的就沒有東西可問，整塊藏起來
     * @param {string} prefix - 'create'、'join' 或 'link'
     * @param {Object} options
     * @param {number} options.count - 清單現在有幾張
     * @param {boolean} options.overLimit - 帶進去會超過隊伍的上限
     * @param {string} options.bringHint - 「帶進」的說明（各對話框不一樣）
     * @param {string} options.clearHint - 「不帶」的說明
     * @param {boolean} options.reset - 剛打開：選項回到預設（帶進；超過上限時兩個都不勾）。否則玩家已經勾的選項不動
     */
    renderChoice(prefix, { count, overLimit, bringHint, clearHint, reset }) {
        const { lede, list, choice, note, bring, clear, title, hint, confirm } = this.choiceElements(prefix);
        for (const element of [lede, list, choice]) element.classList.toggle('hidden', count === 0);
        RoomDialogs.setText(lede, FF14Utils.getI18nText('treasure_map_party_your_maps', '你的清單有 {count} 張寶圖：', { count }));
        this.renderMiniList(prefix, list);
        RoomDialogs.setText(title.bring, FF14Utils.getI18nText('treasure_map_choice_bring', '帶進隊伍清單'));
        RoomDialogs.setText(hint.bring, bringHint);
        RoomDialogs.setText(title.clear, FF14Utils.getI18nText('treasure_map_choice_clear', '不帶，清空這 {count} 張', { count }));
        RoomDialogs.setText(hint.clear, clearHint);

        // 預設是「帶進」，超過上限時它停用、兩個都不勾。重畫時「不帶」勾著就不動；「帶進」不能停用了還勾著
        if (reset) clear.checked = false;
        bring.disabled = overLimit;
        if (overLimit) bring.checked = false;
        else if (!clear.checked) bring.checked = true;

        // 提醒的文字沒有提醒時是空的（它是 role="status"，藏起來的文字也不該留著）
        RoomDialogs.setText(note, overLimit
            ? FF14Utils.getI18nText('treasure_map_party_over_limit', '隊伍清單最多 8 張：先把清單刪到 8 張以內，或選「不帶」。')
            : '');
        note.classList.toggle('hidden', !overLimit);
        confirm.disabled = overLimit && !clear.checked;
    }

    // 迷你清單（ListDialogs.createMiniItem）：語言或清單的內容變了才重建，其餘時候不動，縮圖才不會一直重載
    renderMiniList(prefix, list) {
        const items = this.finder.listManager.getList();
        const key = [window.i18n.getCurrentLanguage(), ...items.map(item => item.id)].join('|');
        if (this.listKeys.get(prefix) === key) return;
        SecurityUtils.clearElement(list);
        for (const item of items) list.appendChild(ListDialogs.createMiniItem(this.finder, item));
        this.listKeys.set(prefix, key);
    }

    // ---------- 建立隊伍 ----------
    /**
     * 「建立隊伍」鈕：清單是空的沒有東西可問，直接建立，結束後的焦點與失敗的訊息在這裡處理（成功的 toast 是 createRoom() 跳的）；
     * 清單不是空的，先問這些寶圖要帶進隊伍還是清空
     */
    async openCreate() {
        const { collaboration, elements } = this;
        // 已經在隊伍裡、正在連線（按鈕本來就藏起來了、停用了），或對話框已經開著：沒有東西可開，也不重設玩家勾的選項
        if (collaboration.currentRoom || collaboration.isConnecting || this.modalManager.activeModal === elements.createModal) return;
        if (this.finder.listManager.getLength() === 0) {
            const trigger = collaboration.elements.createRoomBtn;
            const result = await collaboration.createRoom();
            collaboration.focusAfterConnecting(trigger);
            if (!result.success && result.message) collaboration.showToast(result.message, 'error');
            return;
        }
        this.hideCreateError();
        this.renderCreate(true);
        this.showModal(elements.createModal);
    }

    // 建立隊伍對話框裡由程式組的字與選項。reset 是剛打開（見 renderChoice）
    renderCreate(reset) {
        const count = this.finder.listManager.getLength();
        this.renderChoice('create', {
            count,
            overLimit: count > RoomCollaboration.CONSTANTS.MAX_MAPS,
            bringHint: FF14Utils.getI18nText('treasure_map_choice_bring_hint', '隊友也看得到，會標成你的圖'),
            clearHint: FF14Utils.getI18nText('treasure_map_choice_clear_hint_create', '隊伍清單從空的開始'),
            reset
        });
    }

    // 改了選項：上一次失敗的錯誤是對上一個選項說的（例如「選『不帶』，或先把它們刪掉」），收起來；
    // 超過上限時「建立隊伍」要等選了「不帶」才能按
    handleCreateModeChange() {
        this.hideCreateError();
        this.renderCreate(false);
    }

    /**
     * 對話框的「建立隊伍」：「不帶」那顆勾著就清空本機清單（clearLocal），否則把清單帶進隊伍。連線時對話框不關、選項與確認鈕停用。
     * 成功就關掉，焦點到「複製邀請連結」；失敗把原因寫在對話框裡，讓玩家改選項或再按一次（連不上時重試帶同一個 clientRequestId）。
     * 連線途中玩家自己關掉了對話框，結果照常處理：成功進隊伍，失敗改跳 toast
     */
    async confirmCreate() {
        const { collaboration, elements } = this;
        const { clear, confirm } = this.choiceElements('create');
        // 停用的確認鈕（連線中、超過上限又沒選「不帶」）不接受：Enter 或程式直接呼叫也一樣
        if (confirm.disabled) return;
        const opening = this.opening;
        const trigger = collaboration.elements.createRoomBtn;
        this.hideCreateError();
        const result = await this.whileBusy('create', opening, () => collaboration.createRoom({ clearLocal: clear.checked }));

        if (opening !== this.opening) {
            // 連線途中對話框被關掉了：成功就照常進隊伍，失敗沒有地方寫錯誤，改跳 toast
            if (!result.success && result.message) collaboration.showToast(result.message, 'error');
            collaboration.focusAfterConnecting(trigger);
        } else if (result.success) {
            this.close(elements.createModal);
            collaboration.focusAfterConnecting(trigger);
        } else {
            // 選項與確認鈕恢復（超過上限的停用接回去），錯誤寫在對話框裡。焦點不在對話框裡就放回確認鈕
            //（連線中停在 ✕ 的焦點，結束時已經放回去了），玩家可以直接再按一次
            this.renderCreate(false);
            if (result.message) this.showCreateError(result.message);
            if (!elements.createModal.contains(document.activeElement)) confirm.focus();
        }
    }

    // 連線中：選項與確認鈕停用，確認鈕轉圈（取消與 ✕ 不停用，玩家隨時可以關掉）。
    // 恢復時超過上限的停用由 renderChoice() 接回去（呼叫的人在失敗後重畫）
    setBusy(prefix, busy) {
        const { bring, clear, confirm } = this.choiceElements(prefix);
        bring.disabled = busy;
        clear.disabled = busy;
        confirm.disabled = busy;
        confirm.classList.toggle('btn-loading', busy);
    }

    // 連線：記下是哪一次打開的對話框在連線、停用選項與確認鈕，等 run()（建立或加入）回來，不論成功或失敗都恢復，回傳 run() 的結果。
    // 焦點在要停用的控制項上（剛按下去的確認鈕）時，停用之前先移到 ✕（見 parkFocus()）；恢復時焦點還停在 ✕（玩家沒有移開）、
    // 對話框也還是同一次打開的，就放回那一顆，失敗之後可以直接再按一次
    async whileBusy(prefix, opening, run) {
        this.connecting = opening;
        const { bring, clear, confirm } = this.choiceElements(prefix);
        const parked = this.parkFocus([bring, clear, confirm]);
        this.setBusy(prefix, true);
        try {
            return await run();
        } finally {
            if (this.connecting === opening) this.connecting = null;
            this.setBusy(prefix, false);
            if (parked && opening === this.opening && document.activeElement === parked.close) parked.control.focus();
        }
    }

    // 進行中要停用的控制項（controls）正拿著焦點：先把焦點移到開著的對話框的 ✕（進行中不停用），回傳 { control, close }；焦點不在它們身上回傳 null。
    // 停用拿著焦點的按鈕，Chrome 當場把焦點退回 body，而 ModalManager 的焦點陷阱只在第一個與最後一個可聚焦的元素上循環：
    // 等回應的這段時間按 Tab 就會跑到對話框外面（同 ListDialogs#keepFocus()）。用 ✕ 不用「取消」：每個對話框都有一顆 .btn-close
    parkFocus(controls) {
        const control = document.activeElement;
        const close = this.modalManager.activeModal?.querySelector('.btn-close');
        if (!close || !controls.includes(control)) return null;
        close.focus();
        return { control, close };
    }

    showCreateError(message) {
        const { createError } = this.elements;
        createError.textContent = message;
        createError.classList.remove('hidden');
    }

    hideCreateError() {
        const { createError } = this.elements;
        createError.textContent = '';
        createError.classList.add('hidden');
    }

    // ---------- 加入隊伍 ----------
    /**
     * 「加入隊伍」鈕：已經在隊伍裡就提示、不開；否則打開對話框，輸入隊伍代號。
     * 清單不是空的，同一個對話框裡再問這些寶圖要帶進隊伍還是清空（一步完成）；清單是空的就沒有東西可問。
     * 每次打開都從頭開始：代號欄是空的、沒有錯誤、選項回到預設。初始焦點放在代號欄
     */
    openJoin() {
        const { collaboration, elements } = this;
        if (collaboration.currentRoom) {
            collaboration.showToast(FF14Utils.getI18nText('treasure_map_already_in_room', '您已在隊伍中，請先離開現有隊伍'), 'warning');
            return;
        }
        // 正在連線（按鈕本來就停用了），或對話框已經開著：沒有東西可開，也不重設玩家打的代號與勾的選項
        if (collaboration.isConnecting || this.modalManager.activeModal === elements.joinModal) return;
        elements.roomCode.value = '';
        this.clearJoinError();
        this.renderJoin(true);
        this.showModal(elements.joinModal);
        elements.roomCode.focus();
    }

    // 加入隊伍對話框裡由程式組的字與選項。清單是空的就沒有東西可問，「你的清單」那一塊（#joinPartyMaps）整個藏起來。reset 是剛打開（見 renderChoice）
    renderJoin(reset) {
        const count = this.finder.listManager.getLength();
        this.elements.joinMaps.classList.toggle('hidden', count === 0);
        this.renderChoice('join', {
            count,
            overLimit: count > RoomCollaboration.CONSTANTS.MAX_MAPS,
            bringHint: FF14Utils.getI18nText('treasure_map_choice_bring_hint', '隊友也看得到，會標成你的圖'),
            clearHint: FF14Utils.getI18nText('treasure_map_choice_clear_hint_join', '只用隊伍清單'),
            reset
        });
    }

    // 改了選項：上一次失敗的錯誤是對上一個選項說的（例如「選『不帶』，或先把它們刪掉」），收起來；
    // 超過上限時「加入」要等選了「不帶」才能按
    handleJoinModeChange() {
        this.clearJoinError();
        this.renderJoin(false);
    }

    /**
     * 對話框的「加入」：代號去掉頭尾空白、轉大寫；「不帶」那顆勾著就清空本機清單（clearLocal），否則把清單帶進隊伍。
     * 同 confirmCreate()：連線時對話框不關、選項與「加入」停用；成功就關掉，焦點到「複製邀請連結」；連線途中玩家自己關掉了對話框，
     * 結果照常處理（成功進隊伍，失敗改跳 toast）。失敗把原因寫在代號欄下面（見 showJoinError()），讓玩家改代號或選項再按一次
     * （連不上時重試帶同一個 clientRequestId）。舊的唯讀隊伍（legacy）：寶圖已經留在本機、警告 recoverLegacyRoom() 跳過了，沒有東西可寫，關掉對話框
     */
    async confirmJoin() {
        const { collaboration, elements } = this;
        const { clear, confirm } = this.choiceElements('join');
        // 停用的「加入」（連線中、超過上限又沒選「不帶」）不接受：代號欄按 Enter 或程式直接呼叫也一樣
        if (confirm.disabled) return;
        const opening = this.opening;
        const trigger = collaboration.elements.joinRoomBtn;
        const code = elements.roomCode.value.trim().toUpperCase();
        // 先收起上一次的錯誤：同樣的錯誤再來一次會重新寫過，role="alert" 才會再唸
        this.clearJoinError();
        const result = await this.whileBusy('join', opening, () => collaboration.joinRoom(code, { clearLocal: clear.checked }));

        if (opening !== this.opening) {
            // 連線途中對話框被關掉了：成功就照常進隊伍，失敗沒有地方寫錯誤，改跳 toast
            if (!result.success && result.message) collaboration.showToast(result.message, 'error');
            collaboration.focusAfterConnecting(trigger);
        } else if (result.success || result.kind === 'legacy') {
            this.close(elements.joinModal);
            collaboration.focusAfterConnecting(trigger);
        } else {
            // 選項與「加入」恢復（超過上限的停用接回去），錯誤寫在代號欄下面。連線中停在 ✕ 的焦點 whileBusy() 已經放回「加入」；
            // 代號打錯時 showJoinError() 再把焦點移到代號欄；焦點不在對話框裡也放回「加入」，玩家可以直接再按一次
            this.renderJoin(false);
            if (result.message) this.showJoinError(result);
            if (!elements.joinModal.contains(document.activeElement)) confirm.focus();
        }
    }

    /**
     * 失敗的原因寫在代號欄下面，取代那一行說明（紅字）；代號欄加紅框與 aria-invalid，aria-describedby 本來就連到這一行，role="alert" 會唸出來。
     * 代號保留。格式不對、找不到是代號的問題：焦點回到代號欄並選取內容，直接重打；其他的錯誤不在代號上，焦點留在原處
     * @param {{kind: string, message: string}} failure - joinRoom() 回傳的失敗結果
     */
    showJoinError({ kind, message }) {
        const { roomCode, roomCodeHint, roomCodeError } = this.elements;
        roomCodeError.textContent = message;
        roomCodeError.classList.remove('hidden');
        roomCodeHint.classList.add('hidden');
        roomCode.classList.add('is-invalid');
        roomCode.setAttribute('aria-invalid', 'true');
        if (kind === 'format' || kind === 'not_found') {
            roomCode.focus();
            roomCode.select();
        }
    }

    // 收起錯誤、說明回來、紅框與 aria-invalid 拿掉：改了代號或選項、再按一次「加入」、打開對話框、切換語言時都會來（沒有錯誤時什麼都不變）
    clearJoinError() {
        const { roomCode, roomCodeHint, roomCodeError } = this.elements;
        roomCodeError.textContent = '';
        roomCodeError.classList.add('hidden');
        roomCodeHint.classList.remove('hidden');
        roomCode.classList.remove('is-invalid');
        roomCode.removeAttribute('aria-invalid');
    }
}

// 匯出給主程式使用
window.RoomDialogs = RoomDialogs;
