// 清單的頁內對話框：清空確認與匯入（之後再加分享連結）。標記都在 index.html（#clearListModal、#importListModal）。
// 開關照 RoomCollaboration#showModal()：拿掉 .hidden、交給 ModalManager 以 style.display 顯示，關閉時加回 .hidden。
// 說明、狀態與選項的字帶張數、在隊伍裡還要換字，由這裡依狀態組出來、不掛 data-i18n：
// I18nManager 切換語言時會把 [data-i18n] 的文字整個換掉
class ListDialogs {
    constructor(finder) {
        this.finder = finder;
        // 自己的 ModalManager：清單面板那個實例正拿著 #myListPanel，一個實例一次只管一個視窗。
        // 對話框開在面板上面，共用的堆疊讓 Escape 與焦點陷阱只作用在對話框，關閉後焦點回到按下去的按鈕
        this.modalManager = new ModalManager();
        // 第幾次打開對話框（兩個對話框共用；showModal() 每次打開、關閉都加一）。隊伍裡匯入要等同步，這段時間玩家可能按 Escape
        // 關掉又重新打開：那是新的一次，上一次匯入的結果不能把它關掉、把錯誤寫進去，也不能擋住它的按鈕
        this.opening = 0;
        // 正在匯入的是哪一次打開的對話框（opening 的值），沒有是 null。隊伍裡要等同步：
        // 同一次打開不接受第二次按下，那一次的對話框還開著時也不重畫（見 refresh）
        this.importing = null;

        const byId = id => document.getElementById(id);
        this.elements = {
            clearModal: byId('clearListModal'),
            closeClear: byId('closeClearModalBtn'),
            clearBody: byId('clearListBody'),
            cancelClear: byId('cancelClearBtn'),
            confirmClear: byId('confirmClearBtn'),
            importModal: byId('importListModal'),
            closeImport: byId('closeImportModalBtn'),
            importText: byId('importListText'),
            importStatus: byId('importListStatus'),
            importChoice: byId('importListChoice'),
            modeMerge: byId('importModeMerge'),
            modeReplace: byId('importModeReplace'),
            mergeTitle: byId('importModeMergeTitle'),
            mergeHint: byId('importModeMergeHint'),
            replaceTitle: byId('importModeReplaceTitle'),
            replaceHint: byId('importModeReplaceHint'),
            importError: byId('importListError'),
            cancelImport: byId('cancelImportBtn'),
            confirmImport: byId('confirmImportBtn')
        };

        window.i18n.onLanguageChange(() => this.handleLanguageChange());
    }

    // 由 TreasureMapFinder#setupEventListeners() 呼叫：接上兩個對話框裡的按鈕與貼上內容的欄位
    init() {
        const { elements } = this;
        elements.closeClear.addEventListener('click', () => this.close(elements.clearModal));
        elements.cancelClear.addEventListener('click', () => this.close(elements.clearModal));
        elements.confirmClear.addEventListener('click', () => this.confirmClear());
        elements.closeImport.addEventListener('click', () => this.close(elements.importModal));
        elements.cancelImport.addEventListener('click', () => this.close(elements.importModal));
        elements.confirmImport.addEventListener('click', () => this.confirmImport());
        elements.importText.addEventListener('input', () => this.handleImportInput());
    }

    // 拿掉 .hidden 再交給 ModalManager 顯示；關閉時加回 .hidden、清掉 ModalManager 設的 display
    showModal(element) {
        element.classList.remove('hidden');
        this.opening += 1;
        this.modalManager.show(element, {
            useClass: null,
            displayStyle: 'flex',
            onClose: () => {
                this.opening += 1;
                element.classList.add('hidden');
                element.style.display = '';
            }
        });
    }

    // 只在這個對話框正是目前開著的那個時才關，避免關錯
    close(element) {
        if (this.modalManager.activeModal === element) this.modalManager.hide();
    }

    // 字不一樣才寫：textContent 一寫就會換掉整個文字節點，螢幕閱讀器的閱讀位置可能跟著跑掉。
    // refresh() 隊伍每兩秒輪詢一次都會來，開著的對話框裡沒變的字不該每兩秒重寫一遍
    static setText(element, text) {
        if (element.textContent !== text) element.textContent = text;
    }

    // 切換語言：上一次失敗的錯誤是舊語言寫的，收起來（再按一次就用新語言重新產生）；匯入的狀態也是舊語言寫的，用新語言重寫；
    // 其餘由程式組的字照 refresh() 重畫（固定的字由 I18nManager 依 [data-i18n] 換）
    handleLanguageChange() {
        this.hideImportError();
        if (this.modalManager.activeModal === this.elements.importModal) this.updateImportStatus();
        this.refresh();
    }

    // 開著的對話框裡跟著清單與語言走的部分重畫：切換語言、清單變了（隊友同步、進出隊伍；TreasureMapFinder#updateListCount()）都會來，
    // 這樣隊友的同步不會讓「清空 6 張」其實清掉 7 張。只重畫文字與顯示，玩家已經選的（模式、貼上的內容）不動；沒開著的下次打開時才畫。
    // 匯入進行中不重畫：隊伍裡要等同步，清單已經換成新的、對話框還沒關，這時重畫只會讓選項冒出來又消失。
    // 重畫可能把焦點所在的那顆藏起來（隊友清空清單時「合併／取代」整組藏起來）：焦點先記下來，畫完再看
    refresh() {
        if (this.importing === this.opening) return;
        const { finder, elements } = this;
        const open = this.modalManager.activeModal;
        const active = document.activeElement;
        if (open === elements.clearModal) {
            if (finder.listManager.getLength() === 0) {
                // 清單被清空了（隊友清的）：沒有東西可問了。「清空清單」已經藏起來，焦點放到面板標題（同 confirmClear）
                this.close(elements.clearModal);
                finder.elements.listTitle?.focus();
            } else {
                this.renderClear();
            }
        } else if (open === elements.importModal) {
            // 匯入的狀態（#importListStatus 是 aria-live）只跟貼上的內容與語言有關，清單變了不重寫：
            // 隊伍每兩秒輪詢一次都會經過這裡，同樣的字重寫一遍會讓螢幕閱讀器重念
            this.renderImportChoice();
            this.keepFocus(active, elements.importText);
        }
    }

    // 重畫之後，焦點原本所在的那顆藏起來（自己或外層有 .hidden）或停用了：焦點放到 fallback（同一個對話框裡一直都在的那顆）。
    // 不然焦點會掉到 body：ModalManager 的焦點陷阱只在第一個與最後一個可聚焦的元素上循環，再按 Tab 會跑到對話框外面
    keepFocus(active, fallback) {
        if (!active || !this.modalManager.activeModal?.contains(active)) return;
        if (active.disabled || active.closest('.hidden')) fallback.focus();
    }

    // ---------- 清空 ----------
    // 「清空清單」先問一次。清單是空的、或隊伍連線中（canEditList() 會提示）就不開。
    // 初始焦點放在「取消」：清掉整份清單要多一個動作才行
    openClear() {
        const { finder, elements } = this;
        if (!finder.canEditList() || finder.listManager.getLength() === 0) return;
        this.renderClear();
        this.showModal(elements.clearModal);
        elements.cancelClear.focus();
    }

    // 說明與確認鈕都帶張數；在隊伍裡說明還要提到隊友的清單也會跟著清空
    renderClear() {
        const { finder, elements } = this;
        const count = finder.listManager.getLength();
        ListDialogs.setText(elements.clearBody, finder.roomCollaboration?.currentRoom
            ? FF14Utils.getI18nText('treasure_map_clear_body_room', '隊伍清單裡的 {count} 張寶圖都會移除，隊友的清單也會跟著清空。', { count })
            : FF14Utils.getI18nText('treasure_map_clear_body', '清單裡的 {count} 張寶圖都會移除。', { count }));
        ListDialogs.setText(elements.confirmClear, FF14Utils.getI18nText('treasure_map_clear_confirm_button', '清空 {count} 張', { count }));
    }

    // 清空之後「清空清單」已經藏起來了（清單是空的），ModalManager 把焦點還給它等於沒還：焦點放到面板標題，一直留在面板裡
    confirmClear() {
        const { finder, elements } = this;
        finder.clearList();
        this.close(elements.clearModal);
        finder.elements.listTitle?.focus();
    }

    // ---------- 匯入 ----------
    // 每次打開都是乾淨的：內容、狀態、錯誤與模式回到預設。清單不是空的才有「合併／取代」可選，預設合併。
    // 初始焦點放在貼上內容的欄位
    openImport() {
        const { finder, elements } = this;
        if (!finder.canEditList()) return;
        elements.importText.value = '';
        this.hideImportError();
        // 兩顆都明確設成預設值，不靠同一組 radio 的互斥
        elements.modeMerge.checked = true;
        elements.modeReplace.checked = false;
        this.renderImportChoice();
        this.updateImportStatus();
        this.showModal(elements.importModal);
        elements.importText.focus();
    }

    // 清單不是空的才有「合併／取代」可選；選項的標題與說明：「取代」在隊伍裡寫成取代隊伍清單
    renderImportChoice() {
        const { elements } = this;
        elements.importChoice.classList.toggle('hidden', this.finder.listManager.getLength() === 0);
        ListDialogs.setText(elements.mergeTitle, FF14Utils.getI18nText('treasure_map_import_merge', '合併'));
        ListDialogs.setText(elements.mergeHint, FF14Utils.getI18nText('treasure_map_import_merge_hint', '重複的只留一張'));
        ListDialogs.setText(elements.replaceTitle, this.finder.roomCollaboration?.currentRoom
            ? FF14Utils.getI18nText('treasure_map_share_replace_room', '取代隊伍清單')
            : FF14Utils.getI18nText('treasure_map_share_replace', '取代我的清單'));
        ListDialogs.setText(elements.replaceHint, FF14Utils.getI18nText('treasure_map_import_replace_hint', '原本的寶圖會移除'));
    }

    // 貼上的內容一變，上一次匯入失敗的錯誤就不再適用
    handleImportInput() {
        this.hideImportError();
        this.updateImportStatus();
    }

    // 一邊貼一邊解析（和按「匯入」時用同一份解析，所以「連結裡有 N 張」就是會匯入的 N 張）：
    // 空的 → 什麼都不寫、不能按；看不懂 → 欄位標成錯誤；連結但目錄裡一張都找不到 → 說明找不到；否則寫有幾張、可以按
    updateImportStatus() {
        const { finder, elements } = this;
        const text = elements.importText.value;
        let message = '';
        let unreadable = false;
        let importable = false;
        if (text.trim()) {
            const read = finder.parseImportText(text);
            importable = read.ok;
            unreadable = !read.ok && read.kind === null;
            if (!read.ok) {
                message = read.message;
            } else if (read.kind === 'link') {
                message = FF14Utils.getI18nText('treasure_map_import_found_link', '連結裡有 {count} 張寶圖', { count: read.maps.length });
            } else {
                message = FF14Utils.getI18nText('treasure_map_import_found_json', '內容有 {count} 張寶圖', { count: read.maps.length });
            }
        }
        elements.importStatus.textContent = message;
        elements.importText.classList.toggle('is-invalid', unreadable);
        if (unreadable) {
            elements.importText.setAttribute('aria-invalid', 'true');
        } else {
            elements.importText.removeAttribute('aria-invalid');
        }
        elements.confirmImport.disabled = !importable;
    }

    hideImportError() {
        const { importError } = this.elements;
        importError.textContent = '';
        importError.classList.add('hidden');
    }

    // 合併還是取代：清單是空的沒有「合併」可言（對話框也不給選），等於取代，成功訊息寫「已匯入 N 張」而不是「已合併匯入」；
    // 清單裡有寶圖時只看「取代」那顆有沒有選
    isMerge(replaceRadio) {
        return this.finder.listManager.getLength() > 0 && !replaceRadio.checked;
    }

    // 「匯入」：成功就關閉（ModalManager 把焦點還給「匯入」）；失敗把原因寫在對話框裡、不關，讓玩家改內容或改選項再試
    confirmImport() {
        const { elements } = this;
        return this.submitImport(
            () => this.finder.importFromText(elements.importText.value, { merge: this.isMerge(elements.modeReplace) }),
            elements.importModal,
            message => {
                elements.importError.textContent = message;
                elements.importError.classList.remove('hidden');
            }
        );
    }

    // 送出：apply() 回傳 { success, message }，成功就關閉 modal，失敗交給 showError。
    // 同一次打開只送一次；隊伍裡要等同步，等的時候對話框被關掉（也可能又打開了一次）：結果屬於已經關掉的那一次，
    // 不關、不寫錯誤，也不擋住之後打開的那一次
    async submitImport(apply, modal, showError) {
        const opening = this.opening;
        if (this.importing === opening) return;
        this.importing = opening;
        try {
            const result = await apply();
            if (opening !== this.opening) return;
            if (result.success) {
                this.close(modal);
            } else {
                showError(result.message);
            }
        } finally {
            if (this.importing === opening) this.importing = null;
        }
    }
}
