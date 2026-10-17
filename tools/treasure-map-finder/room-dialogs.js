// 組隊的頁內對話框：「建立隊伍」、「加入隊伍」、邀請連結的「加入隊伍 X？」、「離開隊伍」與「移出成員」（改名對話框在 RoomCollaboration）。
// 標記都在 index.html（#createPartyModal、#joinRoomModal、#joinLinkModal、#leaveRoomModal、#removeMemberModal）。開關照 ListDialogs#showModal()：
// 拿掉 .hidden、交給 ModalManager 以 style.display 顯示，關閉時加回 .hidden。說明、迷你清單、選項與錯誤的字帶張數、代號、名字、還要換語言，
// 由這裡依狀態組出來、不掛 data-i18n：I18nManager 切換語言時會把 [data-i18n] 的文字整個換掉。
// 由 RoomCollaboration 建立（this.dialogs）；建構時只抓元素，事件在 init() 才掛
class RoomDialogs {
    // renderChoice() 的確認鈕：prefix → 按鈕的 id
    static CONFIRM_BUTTONS = {
        create: 'confirmCreateBtn',
        join: 'confirmJoinBtn',
        link: 'confirmLinkBtn'
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
        // 正在進行（連線：建立或加入隊伍；離開隊伍；移出成員）的是哪一次打開的對話框（opening 的值），沒有是 null。
        // 進行中選項與確認鈕停用著，refresh() 不重畫
        this.connecting = null;
        // 移出對話框現在要移出的是哪位成員（成員 id），對話框關著時是 null。名字與張數每次重畫都從隊伍資料裡查最新的
        this.removing = null;
        // 迷你清單上一次畫的內容（語言與每一張的 id），依 renderChoice() 的 prefix 記：沒變就不重建，縮圖才不會一直重載
        this.listKeys = new Map();
        // 邀請連結對話框這一次打開的狀態（openLink() 設定，finishLink() 收尾時清掉），沒有是 null：
        // { code, current（另一隊 A 的紀錄，沒有或已經離開 A 是 null）, room（讀到的隊伍）, failure（讀隊伍就失敗的種類，讀得到是 null）,
        //   running（「加入」正在進行）, joined（已經加入了）, resolve（讓 openLink() 回傳的 Promise 完成）}
        this.link = null;
        // 邀請連結對話框裡寫的名字（renderLink() 每次重畫時用 RoomCollaboration#defaultNickname() 重算；上一次加入連不上、請求還留著時是那次請求的名字）：
        // 按「加入」送出去的就是這個字串
        this.linkNickname = '';

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
            joinMaps: byId('joinPartyMaps'),
            linkModal: byId('joinLinkModal'),
            linkTitle: byId('joinLinkModal-title'),
            closeLink: byId('closeLinkModalBtn'),
            linkSummary: byId('joinLinkSummary'),
            linkName: byId('joinLinkName'),
            linkLeave: byId('joinLinkLeave'),
            linkMaps: byId('linkPartyMaps'),
            linkError: byId('joinLinkError'),
            dismissLink: byId('dismissLinkBtn'),
            leaveModal: byId('leaveRoomModal'),
            closeLeave: byId('closeLeaveModalBtn'),
            cancelLeave: byId('cancelLeaveBtn'),
            confirmLeaveBtn: byId('confirmLeaveBtn'),
            leaveLede: byId('leaveLede'),
            leaveChoice: byId('leaveChoice'),
            leaveKeep: byId('leaveModeKeep'),
            leaveClear: byId('leaveModeClear'),
            leaveLeaderNote: byId('leaveLeaderNote'),
            leaveLastNote: byId('leaveLastNote'),
            leaveError: byId('leaveError'),
            removeModal: byId('removeMemberModal'),
            removeTitle: byId('removeMemberModal-title'),
            closeRemove: byId('closeRemoveModalBtn'),
            cancelRemove: byId('cancelRemoveBtn'),
            confirmRemoveBtn: byId('confirmRemoveBtn'),
            removeBody: byId('removeMemberBody'),
            removeError: byId('removeMemberError')
        };
        // renderChoice() 用到的元素，依 prefix 記起來（建立與加入的現在抓，其他的第一次用到時才抓）
        this.choices = {};
        this.choiceElements('create');
        this.choiceElements('join');

        window.i18n.onLanguageChange(() => this.handleLanguageChange());
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

    // 由 RoomCollaboration#setupEventListeners() 呼叫：接上建立、加入、邀請連結、離開隊伍與移出成員對話框裡的按鈕、代號欄與選項
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

        // 邀請連結：「不用了」（只剩錯誤時是「關閉」）與 ✕ 只關對話框，怎麼收尾由關閉時的 handleLinkClose() 決定
        const link = this.choiceElements('link');
        elements.closeLink.addEventListener('click', () => this.close(elements.linkModal));
        elements.dismissLink.addEventListener('click', () => this.close(elements.linkModal));
        link.confirm.addEventListener('click', () => this.confirmLink());
        for (const radio of [link.bring, link.clear]) {
            radio.addEventListener('change', () => this.handleLinkModeChange());
        }

        elements.closeLeave.addEventListener('click', () => this.close(elements.leaveModal));
        elements.cancelLeave.addEventListener('click', () => this.close(elements.leaveModal));
        elements.confirmLeaveBtn.addEventListener('click', () => this.confirmLeave());

        elements.closeRemove.addEventListener('click', () => this.close(elements.removeModal));
        elements.cancelRemove.addEventListener('click', () => this.close(elements.removeModal));
        elements.confirmRemoveBtn.addEventListener('click', () => this.confirmRemove());
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

    // 隊伍沒了（被移出、連線失效、隊伍過期、自己離開）：離開與移出的對話框只在隊伍裡才有意義，開著就關掉；回傳有沒有關。
    // 建立、加入與邀請連結的對話框不動（邀請連結切換隊伍時，離開 A 之後它還要留著加入 B）。
    // RoomCollaboration#forceLeaveRoom() 呼叫，不看 connecting：離開自己的確認鈕還在進行中（離開成功時 forceLeaveRoom() 也會來到這裡）
    closeInParty() {
        const open = this.modalManager.activeModal;
        if (open !== this.elements.leaveModal && open !== this.elements.removeModal) return false;
        this.modalManager.hide();
        return true;
    }

    // 切換語言（I18nManager 先換掉 [data-i18n] 的固定字，再來這裡）：上一次失敗的錯誤是舊語言寫的，收起來（再按一次就用新語言重新產生），
    // 其餘由程式組的字照 refresh() 重畫；玩家已經勾的選項、打的代號不動。沒開著的下次打開時才畫。
    // 邀請連結對話框「只剩錯誤」的樣子例外：錯誤就是全部的內容，renderLink() 用新語言重寫，不收起來。
    // 進行中不動：連線中選項與確認鈕停用著，重畫會把它們解開
    handleLanguageChange() {
        if (this.connecting === this.opening) return;
        const { elements } = this;
        const open = this.modalManager.activeModal;
        if (open === elements.createModal) this.hideCreateError();
        else if (open === elements.joinModal) this.clearJoinError();
        else if (open === elements.linkModal) this.hideLinkError();
        else if (open === elements.leaveModal) this.hideLeaveError();
        else if (open === elements.removeModal) this.hideRemoveError();
        this.refresh();
    }

    // 開著的對話框裡跟著狀態走的部分重畫：切換語言（handleLanguageChange()）、隊伍變了（RoomCollaboration 的 mapSync onChange：每兩秒的輪詢、
    // 自己與隊友的變更）都會來。只重畫由程式組的字與顯示，玩家勾的選項與已經寫出來的錯誤不動（錯誤只在切換語言、再按一次確認時收起來）。
    // 離開對話框跟著隊伍清單的張數與成員換說明；移出對話框的那個人已經不在隊伍裡就關掉。進行中（見 connecting）不重畫
    refresh() {
        if (this.connecting === this.opening) return;
        const { elements } = this;
        const open = this.modalManager.activeModal;
        if (open === elements.createModal) {
            this.renderCreate(false);
        } else if (open === elements.joinModal) {
            this.renderJoin(false);
        } else if (open === elements.linkModal) {
            this.renderLink(false);
        } else if (open === elements.leaveModal) {
            // 清單被隊友清空時整組選項藏起來，焦點正在選項上就移到取消，不能掉到 body
            const active = document.activeElement;
            this.renderLeave();
            this.keepFocus(active, elements.cancelLeave);
        } else if (open === elements.removeModal) {
            const target = this.removalTarget();
            if (target) {
                this.renderRemove(target);
            } else {
                // 他已經不在隊伍裡了（自己離開、被別的路徑移出）：沒有東西可確認，關掉。他那一列的按鈕不在了，焦點到成員那一行
                this.close(elements.removeModal);
                this.focusMembersToggle();
            }
        }
    }

    // 重畫之後，焦點原本所在的那顆藏起來（自己或外層有 .hidden）或停用了：焦點放到 fallback（同一個對話框裡一直都在的那顆）。
    // 不然焦點會掉到 body：ModalManager 的焦點陷阱只在第一個與最後一個可聚焦的元素上循環，再按 Tab 會跑到對話框外面（同 ListDialogs#keepFocus()）
    keepFocus(active, fallback) {
        if (!active || !this.modalManager.activeModal?.contains(active)) return;
        if (active.disabled || active.closest('.hidden')) fallback.focus();
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

    // 進行中要停用的控制項（選項）與轉圈的確認鈕，依對話框的 prefix：建立與加入是 choiceElements() 的兩個選項加確認鈕，
    // 離開是「留在我的清單」與「清空」加確認鈕，移出沒有選項、只有確認鈕
    busyControls(prefix) {
        const { elements } = this;
        if (prefix === 'leave') return { disable: [elements.leaveKeep, elements.leaveClear], confirm: elements.confirmLeaveBtn };
        if (prefix === 'remove') return { disable: [], confirm: elements.confirmRemoveBtn };
        const { bring, clear, confirm } = this.choiceElements(prefix);
        return { disable: [bring, clear], confirm };
    }

    // 進行中（連線、離開、移出）：選項與確認鈕停用，確認鈕轉圈（取消與 ✕ 不停用，玩家隨時可以關掉）。
    // 恢復時超過上限的停用由 renderChoice() 接回去（呼叫的人在失敗後重畫）
    setBusy(prefix, busy) {
        const { disable, confirm } = this.busyControls(prefix);
        for (const control of [...disable, confirm]) control.disabled = busy;
        confirm.classList.toggle('btn-loading', busy);
    }

    // 進行中：記下是哪一次打開的對話框在進行、停用選項與確認鈕，等 run()（建立、加入、離開或移出）回來，不論成功或失敗都恢復，回傳 run() 的結果。
    // 焦點在要停用的控制項上（剛按下去的確認鈕）時，停用之前先移到 ✕（見 parkFocus()）；恢復時焦點還停在 ✕（玩家沒有移開）、
    // 對話框也還是同一次打開的，就放回那一顆，失敗之後可以直接再按一次
    async whileBusy(prefix, opening, run) {
        this.connecting = opening;
        const { disable, confirm } = this.busyControls(prefix);
        const parked = this.parkFocus([...disable, confirm]);
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
    // 等回應的這段時間按 Tab 就會跑到對話框外面（同 ListDialogs#keepFocus()）。用 ✕ 不用「取消」：每個對話框都有一顆 .btn-close，
    // 而且邀請連結對話框的「取消」是「不用了」，剛按下「加入」就唸出它容易誤會
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
            collaboration.showToast(FF14Utils.getI18nText('treasure_map_already_in_room', '你已經在隊伍裡了，請先離開目前的隊伍。'), 'warning');
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

    // ---------- 邀請連結 ----------
    /**
     * 打開邀請連結（載入時網址的 ?room=，RoomCollaboration#checkExistingRoom() 的情況 c、d）：先讀隊伍，讀完才打開「加入隊伍 X？」。
     * current 是另一隊 A 的有效紀錄（情況 d，A 還沒接回），沒有是 null（情況 c）。舊的唯讀隊伍不開對話框：c 照 recoverLegacyRoom() 把寶圖留在本機，
     * d 接回 A。讀隊伍就失敗（找不到、滿了、連不上）時對話框只寫原因、只有「關閉」。
     * 回傳的 Promise 在對話框關掉（任何方式）、收好尾之後 resolve（見 finishLink()）；「加入」還在進行時被關掉，要等它結束才收尾（見 confirmLink()）
     * @param {{code: string, current: ?Object}} options
     * @returns {Promise<void>}
     */
    async openLink({ code, current }) {
        const { collaboration, elements } = this;
        const preview = await this.readParty(code);
        if (preview.kind === 'legacy') {
            if (current) collaboration.restoreSession(current);
            else collaboration.recoverLegacyRoom(preview.room);
            return;
        }
        await new Promise(resolve => {
            this.link = { code, current, room: preview.room ?? null, failure: preview.kind ?? null, running: false, joined: false, resolve };
            this.hideLinkError();
            this.renderLink(true);
            // 讀隊伍的這段時間卡片的縮圖照樣按得到：開著的寶圖詳細檢視先關掉。它疊得比頁內對話框高（style.css 的 .map-detail-modal），
            // 不關會蓋住這個對話框，Escape 與點遮罩卻作用在看不到的這個對話框上，悄悄把邀請丟掉
            const detail = this.finder.uiDialogManager;
            if (detail?.activeDialog?.kind === 'mapDetail') detail.hideMapDetail();
            this.showModal(elements.linkModal, () => this.handleLinkClose());
        });
    }

    /**
     * 讀隊伍（RoomCollaboration#previewRoom()），這段時間當作連線中（setConnecting()，同以前載入時自動加入）：建立、加入隊伍與清單的按鈕停用，
     * openCreate()／openJoin() 不開、清單改不了。還沒問完要不要加入，不能先建立或加入別的隊伍（之後接回 A 或加入 B 會把它丟掉）；
     * 清單的變更也會被接回 A 時的同步蓋掉。載入時、與情況 d 按「加入」後再讀一次 B 時用（對話框在加入途中被關掉時，頁面又能操作了）
     * @param {string} code
     */
    async readParty(code) {
        const { collaboration } = this;
        collaboration.setConnecting(true);
        try {
            return await collaboration.previewRoom(code);
        } finally {
            collaboration.setConnecting(false);
        }
    }

    /**
     * 邀請連結對話框裡由程式組的字與顯示。讀隊伍就失敗（failure）時只剩錯誤（依失敗的種類用目前的語言寫）與「關閉」，沒有「加入」。
     * 否則：標題、摘要（隊長——creatorId——已經不在成員裡時不寫是誰的隊伍）、名字（就是「加入」送出去的那一個，見 linkNickname）、
     * 情況 d 的「你目前在隊伍 A」，以及清單不是空的時的「你的清單」那一塊（帶進去的合計以 id 去重）。reset 是剛打開（見 renderChoice）
     * @param {boolean} reset
     */
    renderLink(reset) {
        const { collaboration, elements } = this;
        const { code, current, room, failure } = this.link;
        const { confirm } = this.choiceElements('link');
        RoomDialogs.setText(elements.linkTitle, FF14Utils.getI18nText('treasure_map_link_title', '加入隊伍 {code}？', { code }));
        for (const element of [elements.linkSummary, elements.linkName, confirm]) element.classList.toggle('hidden', Boolean(failure));
        elements.linkLeave.classList.toggle('hidden', Boolean(failure) || !current);
        RoomDialogs.setText(elements.dismissLink, failure
            ? FF14Utils.getI18nText('treasure_map_close', '關閉')
            : FF14Utils.getI18nText('treasure_map_link_dismiss', '不用了'));
        if (failure) {
            elements.linkMaps.classList.add('hidden');
            RoomDialogs.setText(elements.linkError, RoomCollaboration.errorMessage(failure, { code }));
            elements.linkError.classList.remove('hidden');
            return;
        }

        // 人數與張數的上限都是 8，句子裡共用一個 {max}
        const counts = { members: room.members.length, maps: room.treasureMaps.length, max: RoomCollaboration.CONSTANTS.MAX_MEMBERS };
        const leader = room.members.find(member => member.id === room.creatorId);
        RoomDialogs.setText(elements.linkSummary, leader
            ? FF14Utils.getI18nText('treasure_map_link_summary', '{leader} 的隊伍 · {members}/{max} 人 · 隊伍清單 {maps}/{max} 張', { ...counts, leader: leader.nickname })
            : FF14Utils.getI18nText('treasure_map_link_summary_no_leader', '{members}/{max} 人 · 隊伍清單 {maps}/{max} 張', counts));
        // 名字照 6.6：自己改過的優先，沒有就是目前介面語言的開頭接上這台機器的字串（換語言就跟著換開頭）。
        // 例外：上一次「加入」連不上、請求還留著（connectionAttempt 是 join:代號）時，重試送出去的是那次請求的名字（見 connectionRequest()），寫那一個
        const attempt = collaboration.connectionAttempt;
        this.linkNickname = attempt?.key === `join:${code}` ? attempt.body.memberNickname : collaboration.defaultNickname();
        RoomDialogs.setText(elements.linkName, FF14Utils.getI18nText('treasure_map_link_name', '你會叫「{name}」，加入後可以改名。', { name: this.linkNickname }));
        RoomDialogs.setText(elements.linkLeave, current
            ? FF14Utils.getI18nText('treasure_map_link_leave_current', '你目前在隊伍 {current}。加入 {code} 會先離開 {current}，{current} 的寶圖會留在你的清單。', { current: current.roomCode, code })
            : '');

        // 帶進去之後的隊伍清單：隊伍現有的加上這台裝置的清單（情況 d 就是上次同步下來的 A 隊清單），同一張只算一次
        const list = this.finder.listManager.getList();
        const total = new Set([...room.treasureMaps, ...list].map(map => map.id)).size;
        elements.linkMaps.classList.toggle('hidden', list.length === 0);
        this.renderChoice('link', {
            count: list.length,
            overLimit: total > RoomCollaboration.CONSTANTS.MAX_MAPS,
            bringHint: FF14Utils.getI18nText('treasure_map_choice_bring_hint_total', '隊伍清單會變成 {total}/{max} 張', { total, max: RoomCollaboration.CONSTANTS.MAX_MAPS }),
            clearHint: FF14Utils.getI18nText('treasure_map_choice_clear_hint_join', '只用隊伍清單'),
            reset
        });
    }

    // 改了選項：上一次失敗的錯誤是對上一個選項說的（例如「選『不帶』，或先刪掉幾張」），收起來；超過上限時「加入」要等選了「不帶」才能按
    handleLinkModeChange() {
        this.hideLinkError();
        this.renderLink(false);
    }

    /**
     * 對話框的「加入」：「不帶」那顆勾著就清空本機清單（clearLocal），否則把清單帶進隊伍；名字用對話框裡寫的那一個（linkNickname）。
     * 進行中選項與「加入」停用、「加入」轉圈（「不用了」與 ✕ 還能按），對話框不關。成功就關掉、打開清單面板（照面板自己的焦點規則）；
     * 失敗把原因寫在對話框裡，讓玩家改選項或再按一次。舊的唯讀隊伍（legacy）沒有東西可寫，關掉。
     * 進行中玩家自己關掉了對話框：同建立、加入隊伍，結果照常處理——成功就在新的隊伍裡（不再打開面板），失敗改跳 toast——之後才收尾
     */
    async confirmLink() {
        const { collaboration, elements } = this;
        const link = this.link;
        const { clear, confirm } = this.choiceElements('link');
        // 只剩錯誤的樣子沒有「加入」；停用的「加入」（進行中、超過上限又沒選「不帶」）不接受：程式直接呼叫也一樣
        if (!link || link.failure || confirm.disabled) return;
        const opening = this.opening;
        const clearLocal = clear.checked;
        // 先收起上一次的錯誤：同樣的錯誤再來一次會重新寫過，role="alert" 才會再唸
        this.hideLinkError();
        link.running = true;
        let result;
        try {
            result = await this.whileBusy('link', opening, () => this.joinFromLink(link, clearLocal));
        } catch (error) {
            // 預期之外的錯誤（例如清單裡壞掉的存值）：當作一般的失敗，不讓對話框卡在進行中、ready 一直不完成
            console.error('從邀請連結加入失敗:', error);
            result = RoomCollaboration.failure('failed');
        }
        link.running = false;
        link.joined = result.success;

        if (opening !== this.opening) {
            if (!result.success && result.message) collaboration.showToast(result.message, 'error');
            this.finishLink();
        } else if (result.success || result.kind === 'legacy') {
            this.close(elements.linkModal);
            if (result.success) this.finder.openListPanel();
        } else {
            // 選項與「加入」恢復（超過上限的停用接回去）；已經離開 A（情況 d 的最後一步失敗）就換成情況 c 的樣子。
            // 焦點不在對話框裡就放回「加入」（進行中停在 ✕ 的焦點 whileBusy() 已經放回去了），玩家可以直接再按一次
            this.renderLink(false);
            if (result.message) this.showLinkError(result.message);
            if (!elements.linkModal.contains(document.activeElement)) confirm.focus();
        }
    }

    /**
     * 「加入」的連線。情況 c 直接加入。情況 d 先再讀一次 B：找不到、滿了、照玩家的選擇帶進去會超過 8 張（或有隊伍收不下的寶圖），就到此為止，A 完全沒動；
     * B 可以加入，才離開 A——用存著的紀錄接回 A（還沒接回的話）但不輪詢，先送完 A 還沒送出的變更再送離開，清單一律保留；
     * 離開失敗時人還在 A（沒有輪詢，收尾時才開始），離開了（或離開途中 A 就被別的路徑結束了）才加入 B，之後同情況 c。回傳結果同 joinRoom()
     * @param {Object} link - this.link
     * @param {boolean} clearLocal
     */
    async joinFromLink(link, clearLocal) {
        const { collaboration, finder } = this;
        if (link.current) {
            const preview = await this.readParty(link.code);
            if (preview.room && preview.kind !== 'legacy') link.room = preview.room;
            if (preview.kind) return { success: false, kind: preview.kind, message: preview.message ?? '' };
            const retained = clearLocal ? [] : finder.listManager.getList();
            if (!RoomCollaboration.mapsFitParty(retained.map(map => finder.toRoomMap(map)))) return RoomCollaboration.failure('invalid_maps');
            if (new Set([...preview.room.treasureMaps, ...retained].map(map => map.id)).size > RoomCollaboration.CONSTANTS.MAX_MAPS) {
                return RoomCollaboration.failure('map_limit', { room: preview.room.treasureMaps.length, mine: retained.length });
            }
            // 防呆：已經在別的隊伍裡（讀 B 時入口都停用了，正常不會發生）就不切換：不接回 A、不離開 A，也不動那個隊伍
            if (collaboration.currentRoom && collaboration.currentRoom.roomCode !== link.current.roomCode) return RoomCollaboration.failure('busy');
            if (!collaboration.currentRoom) collaboration.restoreSession(link.current, { poll: false });
            const left = await collaboration.leaveRoom(true, { quiet: true });
            if (!left.success && left.message) {
                return {
                    success: false,
                    kind: 'leave',
                    message: FF14Utils.getI18nText('treasure_map_link_leave_failed', '還沒離開隊伍 {current}：{reason}', { current: link.current.roomCode, reason: left.message })
                };
            }
            link.current = null;
        }
        return collaboration.joinRoom(link.code, { clearLocal, nickname: this.linkNickname });
    }

    // 對話框關掉（「不用了」「關閉」、✕、Escape、點遮罩，或加入成功、唯讀隊伍時由程式關）：「加入」還在進行就等它結束再收尾（confirmLink()），否則現在收尾。
    // 已經收過尾（this.link 是 null）就沒有事要做：五個對話框共用一個 ModalManager，打開別的對話框也會先關掉這一個
    handleLinkClose() {
        if (this.link && !this.link.running) this.finishLink();
    }

    /**
     * 邀請連結的收尾，然後 resolve openLink()（RoomCollaboration#ready 跟著完成）。加入了就沒有事要做；沒加入照現在的狀態（設計 6.5）：
     * 還沒離開 A——A 還沒接回就接回（開始輪詢、網址換成 ?room=A），已經接回（離開 A 失敗）就開始輪詢；
     * 沒有 A（情況 c，或已經離開 A）——網址只拿掉 room（分享的 maps 留給 handleSharedMaps()），留在個人清單。
     * 防呆：已經在別的隊伍裡（讀隊伍時入口都停用了，正常不會發生）就什麼都不動：不接回 A，網址的 room 是那個隊伍的，也不拿掉
     */
    finishLink() {
        const { collaboration } = this;
        const link = this.link;
        this.link = null;
        try {
            const live = collaboration.currentRoom;
            if (link.joined || (live && live.roomCode !== link.current?.roomCode)) return;
            if (live) {
                collaboration.startPolling();
            } else if (link.current) {
                collaboration.restoreSession(link.current);
            } else {
                window.history.replaceState(window.history.state, '', RoomCollaboration.withRoom(window.location.href, null));
            }
        } finally {
            // 接回 A 時出了預期之外的錯也一樣：ready 不能一直不完成（分享寶圖的對話框在等它）
            link.resolve();
        }
    }

    showLinkError(message) {
        const { linkError } = this.elements;
        linkError.textContent = message;
        linkError.classList.remove('hidden');
    }

    hideLinkError() {
        const { linkError } = this.elements;
        linkError.textContent = '';
        linkError.classList.add('hidden');
    }

    // ---------- 離開隊伍 ----------
    /**
     * 「離開隊伍」鈕：開對話框，問隊伍清單的寶圖離開後要留在我的清單還是清空。每次打開都從頭開始：預設留在我的清單（所以主要按鈕不會清掉東西）、
     * 沒有舊的錯誤。不在隊伍裡、離開已經在進行（連線中）、對話框已經開著時什麼都不做，也不重設玩家勾的選項
     */
    openLeave() {
        const { collaboration, elements } = this;
        if (!collaboration.currentRoom || collaboration.isConnecting || this.modalManager.activeModal === elements.leaveModal) return;
        this.hideLeaveError();
        // 兩顆都明確設成預設值，不靠同一組 radio 的互斥
        elements.leaveKeep.checked = true;
        elements.leaveClear.checked = false;
        this.renderLeave();
        this.showModal(elements.leaveModal);
    }

    /**
     * 離開對話框裡由程式組的字與顯示：隊伍清單有幾張寶圖就寫幾張、顯示單選；清單是空的沒有東西可選，說明改成問要不要離開（帶代號）、整組單選藏起來。
     * 自己是隊長而且隊裡還有別人，提醒離開後沒有人能移出成員（隊長不會轉給別人）；自己是最後一位成員，提醒隊伍會解散（這時不提隊長）。
     * 隊長已經離開（creatorId 不在成員裡）時沒有誰是隊長，只剩最後一位成員的提醒可能出現。字一樣不重寫（輪詢每兩秒都會來）
     */
    renderLeave() {
        const { collaboration, elements } = this;
        const room = collaboration.currentRoom;
        if (!room) return;
        const count = this.finder.listManager.getLength();
        const meId = collaboration.currentUser?.id;
        const others = room.members.filter(member => member.id !== meId).length;
        elements.leaveChoice.classList.toggle('hidden', count === 0);
        RoomDialogs.setText(elements.leaveLede, count > 0
            ? FF14Utils.getI18nText('treasure_map_leave_lede', '隊伍清單的 {count} 張寶圖：', { count })
            : FF14Utils.getI18nText('treasure_map_leave_lede_empty', '確定要離開隊伍 {code}？', { code: room.roomCode }));
        elements.leaveLeaderNote.classList.toggle('hidden', !(room.creatorId === meId && others > 0));
        elements.leaveLastNote.classList.toggle('hidden', others > 0);
    }

    /**
     * 對話框的「離開隊伍」：只看「清空」那顆有沒有勾決定要不要清空本機清單（keepList），進行中選項與確認鈕停用、確認鈕轉圈。
     * 成功就關掉（RoomCollaboration#forceLeaveRoom() 可能已經先關了，這裡不再關第二次），焦點到又出現的「建立隊伍」，toast 是 leaveRoom() 跳的；
     * 失敗（變更還沒送完、連不上）把原因寫在對話框裡、人還在隊伍裡，讓玩家再按一次；進行中玩家自己關掉了對話框，失敗改跳 toast。
     * 結果是空訊息的失敗（隊伍在途中就被別的路徑結束了）什麼都不寫：那條路徑已經說過原因，對話框也已經被它關了
     */
    async confirmLeave() {
        const { collaboration, elements } = this;
        const confirm = elements.confirmLeaveBtn;
        // 停用的確認鈕（進行中）不接受：程式直接呼叫也一樣
        if (confirm.disabled) return;
        const opening = this.opening;
        const keepList = !elements.leaveClear.checked;
        // 先收起上一次的錯誤：同樣的錯誤再來一次會重新寫過，role="alert" 才會再唸
        this.hideLeaveError();
        const result = await this.whileBusy('leave', opening, () => collaboration.leaveRoom(keepList));

        if (result.success) {
            this.close(elements.leaveModal);
            collaboration.focusAfterLeaving();
        } else if (opening !== this.opening) {
            if (result.message) collaboration.showToast(result.message, 'error');
        } else {
            // 還在隊伍裡：說明照最新的隊伍畫，原因寫在對話框裡。焦點不在對話框裡就放回確認鈕（進行中停在 ✕ 的焦點 whileBusy() 已經放回去了），
            // 玩家可以直接再按一次
            this.renderLeave();
            if (result.message) this.showLeaveError(result.message);
            if (!elements.leaveModal.contains(document.activeElement)) confirm.focus();
        }
    }

    showLeaveError(message) {
        const { leaveError } = this.elements;
        leaveError.textContent = message;
        leaveError.classList.remove('hidden');
    }

    hideLeaveError() {
        const { leaveError } = this.elements;
        leaveError.textContent = '';
        leaveError.classList.add('hidden');
    }

    // ---------- 移出成員 ----------
    // 移出對話框現在要移出的那位成員：隊伍資料裡的那一筆（名字、張數跟著最新的）；對話框沒開著、或他已經不在隊伍裡是 undefined
    removalTarget() {
        return this.collaboration.currentRoom?.members.find(member => member.id === this.removing);
    }

    /**
     * 隊長按成員列表裡的「移出」：開確認對話框（標題「把 X 移出隊伍？」、內文帶他加的張數）。他不在隊伍裡、對話框已經開著時什麼都不做。
     * 初始焦點照 ModalManager 的預設（✕）：多按一下 Enter 只會關掉對話框，不會移出誰
     * @param {{id: string}} member - 成員列表裡的那一位
     */
    openRemove(member) {
        const { collaboration, elements } = this;
        if (this.modalManager.activeModal === elements.removeModal) return;
        const target = collaboration.currentRoom?.members.find(item => item.id === member.id);
        if (!target) return;
        this.removing = target.id;
        this.hideRemoveError();
        this.renderRemove(target);
        this.showModal(elements.removeModal, () => { this.removing = null; });
    }

    /**
     * 移出對話框裡由程式組的字：標題帶他現在的名字；內文寫他加的幾張寶圖會留在隊伍清單（張數是隊伍的寶圖裡 addedBy 是他的，
     * 含還沒送出的變更，和成員列表上的一致），他一張都沒加就只寫之後還能重新加入。字一樣不重寫
     * @param {{id: string, nickname: string}} target - removalTarget() 的結果
     */
    renderRemove(target) {
        const { elements } = this;
        const count = this.collaboration.mapSync.getMaps().filter(map => map.addedBy === target.id).length;
        RoomDialogs.setText(elements.removeTitle, FF14Utils.getI18nText('treasure_map_remove_title', '把 {nickname} 移出隊伍？', { nickname: target.nickname }));
        RoomDialogs.setText(elements.removeBody, count > 0
            ? FF14Utils.getI18nText('treasure_map_remove_body', '對方加的 {count} 張寶圖會留在隊伍清單。對方之後還是可以用代號或邀請連結重新加入。', { count })
            : FF14Utils.getI18nText('treasure_map_remove_body_none', '對方之後還是可以用代號或邀請連結重新加入。'));
    }

    /**
     * 對話框的「移出」：進行中確認鈕停用、轉圈（取消與 ✕ 還能按）。成功就關掉（toast 是 removeMember() 跳的），焦點到「成員」那一行
     * （被移出那一列的按鈕已經不在了）；失敗把原因寫在對話框裡、人還在隊伍裡，讓隊長再按一次；
     * 進行中隊長自己關掉了對話框（Escape、✕），結果照常處理：成功照樣移出了，失敗改跳 toast
     */
    async confirmRemove() {
        const { collaboration, elements } = this;
        const confirm = elements.confirmRemoveBtn;
        // 停用的確認鈕（進行中）不接受：程式直接呼叫也一樣
        if (confirm.disabled) return;
        const target = this.removalTarget();
        if (!target) return;
        const opening = this.opening;
        // 先收起上一次的錯誤：同樣的錯誤再來一次會重新寫過，role="alert" 才會再唸
        this.hideRemoveError();
        const result = await this.whileBusy('remove', opening, () => collaboration.removeMember(target));

        if (opening !== this.opening) {
            // 對話框在進行中被關掉了（玩家自己，或隊伍沒了由 forceLeaveRoom() 關的）：成功照樣移出了，失敗沒有地方寫錯誤，改跳 toast。
            // 不能再去關對話框：隊長可能已經開了另一位成員的
            if (!result.success && result.message) collaboration.showToast(result.message, 'error');
        } else if (result.success) {
            this.close(elements.removeModal);
            this.focusMembersToggle();
        } else {
            // 還在隊伍裡：標題與內文照最新的隊伍畫，原因寫在對話框裡。焦點不在對話框裡就放回確認鈕（進行中停在 ✕ 的焦點 whileBusy() 已經放回去了），
            // 隊長可以直接再按一次
            const latest = this.removalTarget();
            if (latest) this.renderRemove(latest);
            if (result.message) this.showRemoveError(result.message);
            if (!elements.removeModal.contains(document.activeElement)) confirm.focus();
        }
    }

    // 焦點到「成員」那一行（被移出的那一列的按鈕已經不在了）
    focusMembersToggle() {
        if (this.collaboration.isListPanelOpen()) this.collaboration.status.elements.toggle.focus();
    }

    showRemoveError(message) {
        const { removeError } = this.elements;
        removeError.textContent = message;
        removeError.classList.remove('hidden');
    }

    hideRemoveError() {
        const { removeError } = this.elements;
        removeError.textContent = '';
        removeError.classList.add('hidden');
    }
}

// 匯出給主程式使用
window.RoomDialogs = RoomDialogs;
