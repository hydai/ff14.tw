// 特殊採集時間管理器主控制器
class TimedGatheringManager {
    static CONSTANTS = {
        DEBOUNCE_DELAY: 300,
        STORAGE_KEY_PREFIX: 'ff14tw_timed_gathering_',
        DEFAULT_LIST_NAME: '預設清單',
        MAX_LIST_NAME_LENGTH: 50,
        MAX_LISTS: 10,
        // 下一次出現還不到這麼久時，狀態行的「還要」寫 m:ss，否則寫幾分
        SHORT_WAIT_MS: 10 * 60 * 1000,
        // 每隔這麼久更新一次卡片與我的提醒的倒數（tick()）
        TICK_INTERVAL_MS: 1000,
        // 我的提醒最多先列幾個（其餘按「顯示全部」）；手機（NARROW_MEDIA）先列 REMINDERS_SHOWN_NARROW 個，搜尋框才留在第一個畫面
        REMINDERS_SHOWN: 5,
        REMINDERS_SHOWN_NARROW: 3,
        NARROW_MEDIA: '(max-width: 480px)',
        // localStorage：已經提醒過的每一次（ReminderScheduler 每一次存成一個項目，名字是這個開頭）
        NOTIFIED_KEY: 'ff14tw_timed_gathering_notified',
        // 頁面上的這些操作讓之後的提示音放得出來（ReminderScheduler.unlockSound()）。
        // 觸控到 pointerup 才算一次操作、滑鼠是 pointerdown，所以兩個都聽（同天氣預報）
        UNLOCK_SOUND_EVENTS: ['pointerdown', 'pointerup', 'keydown']
    };

    constructor() {
        this.data = [];
        // 素材：資料裡同一種採集物的幾筆（不同時段）合成一種，一種素材一張卡片
        this.materials = [];
        this.materialByKey = new Map();
        // 目前顯示的素材（已排序）、搜尋時每種素材的分數（key -> 分數；沒有搜尋時是空的）與搜尋字
        this.shown = [];
        this.scores = new Map();
        this.searchWords = [];
        // 畫面上的卡片：key -> { card, status, addBtn, remindBtn, kind, start }；remindBtn 在全天的素材是 null；
        // kind 與 start 是上一次 tick() 看到的狀態，用來發現切換
        this.cards = new Map();
        // 卡片清單的重排（焦點在清單裡時延後，見 keepOrder()）；initializeEvents() 建立
        this.cardOrder = null;
        // 我的提醒：GatheringReminders 與 ReminderScheduler，資料載入了才建立（見 initialize()），之前都是 null
        this.reminders = null;
        this.scheduler = null;
        // 我的提醒畫面上的列：key -> { row, name, status, where, alarmBtn, cancelBtn }，只有列出來的那幾個
        this.reminderRows = new Map();
        // 我的提醒列的重排（同卡片）；initializeReminders() 建立
        this.reminderOrder = null;
        // 我的提醒按了「顯示全部」
        this.remindersExpanded = false;
        // 複製鬧鐘：每個說明（div.gx-copied）最近一次的複製，剪貼簿的結果晚到時只有它能改說明、跳 toast（見 copyAlarm()）
        this.copyAttempts = new WeakMap();
        this.tickInterval = null;
        this.listManager = null;
        this.macroExporter = null;
        this.searchFilter = null;
        this.timeCalculator = null;
        this.currentListId = 'default';
        this.debounceTimer = null;
        this.currentLanguage = window.i18n.getCurrentLanguage();

        this.elements = {
            // 我的提醒與時鐘一行
            reminders: document.getElementById('reminders'),
            remindersHead: document.getElementById('remindersHead'),
            reminderCount: document.getElementById('reminderCount'),
            notificationToggle: document.getElementById('notificationToggle'),
            leadSelect: document.getElementById('leadSelect'),
            testNotificationBtn: document.getElementById('testNotificationBtn'),
            reminderList: document.getElementById('reminderList'),
            reminderMoreBtn: document.getElementById('reminderMoreBtn'),
            notifyStatus: document.getElementById('notifyStatus'),
            clockSlot: document.getElementById('clockSlot'),
            clockLine: document.getElementById('clockLine'),

            // 搜尋與篩選
            searchInput: document.getElementById('searchInput'),
            clearSearchBtn: document.getElementById('clearSearchBtn'),
            typeFilters: document.getElementById('typeFilters'),
            expansionFilters: document.getElementById('expansionFilters'),

            // 項目顯示
            itemsContainer: document.getElementById('itemsContainer'),
            itemCount: document.getElementById('itemCount'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            errorMessage: document.getElementById('errorMessage'),

            // 清單管理
            listTabs: document.getElementById('listTabs'),
            currentListName: document.getElementById('currentListName'),
            listItems: document.getElementById('listItems'),
            newListBtn: document.getElementById('newListBtn'),
            renameListBtn: document.getElementById('renameListBtn'),
            deleteListBtn: document.getElementById('deleteListBtn'),
            clearListBtn: document.getElementById('clearListBtn'),

            // 匯入/匯出
            importBtn: document.getElementById('importBtn'),
            exportBtn: document.getElementById('exportBtn'),

            // 巨集
            generateMacroBtn: document.getElementById('generateMacroBtn'),
            includeClearCmd: document.getElementById('includeClearCmd'),
            sortByTime: document.getElementById('sortByTime'),
            macroOutput: document.getElementById('macroOutput'),
            macroText: document.getElementById('macroText'),
            copyMacroBtn: document.getElementById('copyMacroBtn'),

            // 對話框
            dialogOverlay: document.getElementById('dialogOverlay'),
            dialogTitle: document.getElementById('dialogTitle'),
            dialogBody: document.getElementById('dialogBody'),
            dialogClose: document.getElementById('dialogClose'),
            dialogCancel: document.getElementById('dialogCancel'),
            dialogConfirm: document.getElementById('dialogConfirm'),

            // 語言選擇器
            languageButtons: document.querySelectorAll('.language-btn')
        };

        this.ready = this.initialize();
    }

    async initialize() {
        try {
            // 初始化模組
            this.listManager = new ListManager();
            this.modalManager = new ModalManager();
            this.macroExporter = new MacroExporter();
            this.searchFilter = new SearchFilter();
            this.timeCalculator = new TimeCalculator();

            // 載入資料
            await this.loadData();

            // 初始化事件
            this.initializeEvents();

            // 我的提醒：資料載入了才建立。loadData() 失敗時沒有任何素材，GatheringReminders 會認不得存著的提醒
            // （讀進來就全部丟掉），以前開著採集提醒的人也不能在這時遷移；所以這時「我的提醒」維持隱藏，提醒的儲存一個字都不碰
            if (this.materials.length > 0) {
                this.reminders = new GatheringReminders(this.materials);
                this.scheduler = new ReminderScheduler({
                    notifiedKey: TimedGatheringManager.CONSTANTS.NOTIFIED_KEY,
                    getAlerts: (now) => this.reminders.alerts(now),
                    onDue: (alert) => this.handleReminderDue(alert)
                });
                this.initializeReminders();
                // 每秒檢查一次要不要提醒，分頁切回前景時馬上檢查
                this.scheduler.start();
            }

            // 載入清單
            this.loadLists();

            // 初始顯示：照目前的篩選與搜尋框畫出卡片
            this.applyFilters();

            // 每秒更新卡片與我的提醒的倒數，有切換時重排
            this.tickInterval = setInterval(() => this.tick(), TimedGatheringManager.CONSTANTS.TICK_INTERVAL_MS);

        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError(FF14Utils.getI18nText('initFailedError', 'Initialization failed, please refresh the page'));
        }
    }

    async loadData() {
        this.showLoading(true);
        try {
            const response = await fetch('../../data/timed-gathering.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const jsonText = await response.text();

            // Define schema for gathering items
            const itemSchema = {
                required: ['items'],
                properties: {
                    items: {
                        type: 'array',
                        minItems: 0
                    }
                }
            };

            // Use safe JSON parsing with schema validation
            const parseResult = SecurityUtils.safeJSONParse(jsonText, itemSchema);

            if (!parseResult.success) {
                throw new Error(parseResult.error);
            }

            // Validate and sanitize each item in the array
            const items = parseResult.data.items || [];
            this.data = items.filter(item => {
                // Basic validation for each item
                return item &&
                    typeof item.id === 'string' &&
                    typeof item.name === 'string' &&
                    typeof item.type === 'string' &&
                    (typeof item.level === 'number' || typeof item.level === 'string') &&
                    typeof item.zone === 'string';
            });

            // 同一種素材的幾筆資料合成一張卡片
            this.materials = GatheringMaterials.group(this.data);
            this.materialByKey = new Map(this.materials.map(material => [material.key, material]));

        } catch (error) {
            console.error('載入資料失敗:', error);
            this.showError(FF14Utils.getI18nText('dataLoadFailedError', 'Failed to load item data, please refresh and try again'));
        } finally {
            this.showLoading(false);
        }
    }

    initializeEvents() {
        // 語言切換
        // 這些 .language-btn 是共用 header 切換器（nav-template.js／layout-loader.js 載入）插入的按鈕，
        // 點擊時已經由 I18nManager._initializeLanguageSwitcher() 掛在 .language-switcher 容器上的
        // 委派監聽器負責呼叫 window.i18n.setLanguage()，這裡不再另外掛一份按鈕點擊監聽器
        // （實測過：若兩邊都掛，同一次點擊 setLanguage() 會被呼叫兩次，下面的 observer 也會跟著
        // 重繪兩次）。這個 TimedGatheringManager 是全站 12 個工具裡唯一有自己 .language-btn
        // 監聽器的（其餘工具都只靠共用 header 的委派監聽器 + 自己的 onLanguageChange observer），
        // 屬於既有的重複邏輯，這裡一併拿掉、統一成跟其他工具一樣的寫法。
        // 重繪統一交給下面註冊的 onLanguageChange observer，不論語言變更是從共用 header 的按鈕，
        // 還是其他呼叫 window.i18n.setLanguage() 的地方觸發，都只會重繪一次；observer 本身不會呼叫
        // setLanguage()／switchLanguage()，所以不會有「setLanguage → 通知 observer → 又呼叫
        // setLanguage」的遞迴風險。
        // 語言切換時重新以目前語言重繪：按鈕狀態、採集物卡片（名稱、狀態行、計數）、清單畫面，
        // 以及我的提醒（提早分鐘數的選項、每一列的字、「顯示全部」與通知的說明；有 data-i18n 的由 I18nManager 翻譯）。
        // 之後才響的提醒在響的時候用那時的語言寫
        // （呼叫的方法與順序沿用原本 switchLanguage() 的重繪部分，只是不再由這裡呼叫 setLanguage()）
        window.i18n.onLanguageChange((lang) => {
            this.currentLanguage = lang;
            this.updateLanguageButtons();
            this.renderItems();
            this.updateListDisplay();
            if (this.reminders) {
                this.relabelLeadSelect();
                this.relabelReminderRows();
                this.renderReminders();
            }
        });

        // 初始化語言按鈕狀態
        this.updateLanguageButtons();

        // 搜尋
        this.elements.searchInput.addEventListener('input', () => {
            this.debounceSearch();
        });

        this.elements.clearSearchBtn.addEventListener('click', () => {
            this.elements.searchInput.value = '';
            this.applyFilters();
        });

        // 卡片清單的重排：焦點在清單裡時延後，焦點離開清單才排（見 keepOrder()）
        this.cardOrder = this.keepOrder(this.elements.itemsContainer, (now) => this.arrangeCards(now));

        // 類型篩選
        this.elements.typeFilters.querySelectorAll('.chip').forEach(tag => {
            tag.addEventListener('click', () => {
                tag.classList.toggle('active');
                this.applyFilters();
            });
        });

        // 資料片篩選
        this.elements.expansionFilters.querySelectorAll('.chip').forEach(tag => {
            tag.addEventListener('click', () => {
                tag.classList.toggle('active');
                this.applyFilters();
            });
        });

        // 清單管理
        this.elements.newListBtn.addEventListener('click', () => {
            this.showNewListDialog();
        });

        this.elements.renameListBtn.addEventListener('click', () => {
            this.showRenameListDialog();
        });

        this.elements.deleteListBtn.addEventListener('click', () => {
            this.showDeleteListDialog();
        });

        this.elements.clearListBtn.addEventListener('click', () => {
            this.clearCurrentList();
        });

        // 匯入/匯出
        this.elements.importBtn.addEventListener('click', () => {
            this.showImportDialog();
        });

        this.elements.exportBtn.addEventListener('click', () => {
            this.exportLists();
        });

        // 巨集
        this.elements.generateMacroBtn.addEventListener('click', () => {
            this.generateMacro();
        });

        this.elements.copyMacroBtn.addEventListener('click', () => {
            this.copyMacroToClipboard();
        });

        // 對話框
        this.elements.dialogClose.addEventListener('click', () => {
            this.hideDialog();
        });

        this.elements.dialogCancel.addEventListener('click', () => {
            this.hideDialog();
        });

        // ESC 關閉對話框 (由 ModalManager 處理)
        /*
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.dialogOverlay.style.display !== 'none') {
                this.hideDialog();
            }
        });
        */

        // 方向鍵在清單分頁間移動並直接切換
        this.elements.listTabs.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const tabs = Array.from(this.elements.listTabs.querySelectorAll('.list-tab'));
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

    /**
     * 我的提醒：提早分鐘數的選項，開關、選單、測試鈕與「顯示全部」的事件，另一個分頁改了提醒時跟著改，
     * 頁面上的操作解開提示音；最後畫一次。資料載入了、this.reminders 建好之後才呼叫（initialize()）
     */
    initializeReminders() {
        const { notificationToggle, leadSelect, testNotificationBtn, reminderList, reminderMoreBtn } = this.elements;

        // 提早分鐘數的選項：文字裡有數字，所以在這裡寫（不用 data-i18n）；換語言時 relabelLeadSelect() 只換字，選取不變
        GatheringReminders.LEAD_OPTIONS.forEach(minutes => {
            const option = document.createElement('option');
            option.setAttribute('value', String(minutes));
            leadSelect.appendChild(option);
        });
        this.relabelLeadSelect();

        // 列的重排：焦點在列裡時延後，焦點離開才排（同卡片，見 keepOrder()）
        this.reminderOrder = this.keepOrder(reminderList, (now) => this.arrangeReminderRows(now));

        // 「網頁提醒」開關：永遠不停用（瀏覽器不能跳通知時，到時間照樣有頁內提示和提示音）；關著時到時間什麼都不做。
        // 開關與提早分鐘數改之前會重讀（GatheringReminders.refresh()），可能帶進另一個分頁剛設或取消的提醒，卡片的按鈕也跟著畫
        notificationToggle.addEventListener('change', () => {
            if (notificationToggle.checked) {
                this.turnOnWebReminders();
            } else {
                this.reminders.setEnabled(false);
            }
            this.renderReminders();
            this.refreshCardButtons();
        });

        leadSelect.addEventListener('change', () => {
            this.reminders.setLead(Number(leadSelect.value));
            this.renderReminders();
            this.refreshCardButtons();
        });

        testNotificationBtn.addEventListener('click', () => {
            this.testNotification();
        });

        reminderMoreBtn.addEventListener('click', () => {
            this.remindersExpanded = !this.remindersExpanded;
            this.renderReminders();
        });

        // 視窗跨過 480px（手機轉向、調整視窗大小）時，先列的個數跟著換；展開著的照樣展開
        this.narrowMedia = window.matchMedia?.(TimedGatheringManager.CONSTANTS.NARROW_MEDIA);
        this.narrowMedia?.addEventListener('change', () => {
            this.renderReminders();
        });

        // 另一個分頁新增、取消提醒或改了設定；key 是 null：另一個分頁清掉了這個網站的資料
        this.handleStorage = (event) => {
            if (event.key === GatheringReminders.STORAGE_KEY || event.key === null) {
                this.reminders.reload();
                this.renderReminders();
                this.refreshCardButtons();
            }
        };
        window.addEventListener('storage', this.handleStorage);

        // 瀏覽器只讓使用者操作時建立或 resume() 的 AudioContext 出聲：重新整理後從記憶還原的提醒，
        // 沒有人按「提醒我」也要等頁面上的一次操作才放得出提示音（同天氣預報）。只在網頁提醒開著、而且有提醒時才解開，
        // 不替每個訪客建立 AudioContext；每次操作都解開一次（聲音已經能放時不花什麼，手機也可能又把它暫停）
        this.handleUnlockSound = () => {
            if (this.reminders.enabled && this.reminders.keys.length > 0) {
                ReminderScheduler.unlockSound();
            }
        };
        TimedGatheringManager.CONSTANTS.UNLOCK_SOUND_EVENTS.forEach(type => {
            document.addEventListener(type, this.handleUnlockSound, { capture: true, passive: true });
        });

        this.renderReminders();
    }

    /** 提早分鐘數的選項寫成目前的語言：0 是「出現時」，其他是「出現前 N 分鐘」；選項還是同樣的節點，選取不變 */
    relabelLeadSelect() {
        this.elements.leadSelect.querySelectorAll('option').forEach(option => {
            const minutes = Number(option.getAttribute('value'));
            option.textContent = minutes === 0
                ? FF14Utils.getI18nText('leadOptionAtStart', '出現時')
                : FF14Utils.getI18nText('leadOption', '出現前 {n} 分鐘', { n: minutes });
        });
    }

    /**
     * 打開網頁提醒。要在使用者的點擊（或開關的 change）裡呼叫：瀏覽器只在這時讓網頁要通知權限、解開提示音。
     * 不等權限的回答就打開：玩家可能把詢問晾著回到遊戲裡，提醒不能因此沒設好；頁內提示和提示音不管回答是什麼都會有。
     * 回答來了再畫一次我的提醒（#notifyStatus 照權限寫）
     */
    turnOnWebReminders() {
        ReminderScheduler.unlockSound();
        const answer = ReminderScheduler.requestPermission();
        this.reminders.setEnabled(true, Date.now());
        answer.then(() => this.renderReminders());
    }

    /**
     * 執行 update（會改變頁面高度的更新），讓 anchor 留在畫面上原來的位置。
     * 我的提醒在頁面最上面：第一次設提醒時整塊冒出來、取消最後一個時收起來，已經顯示時多一列、少一列也一樣，
     * 下面的內容整個被推開或拉回，剛按下的按鈕就跑到別處（手機上掉出畫面，再按一下就按到搬到手指下面的篩選鈕）。
     * Chrome 在捲動過的頁面上會自己錨定，捲動位置是 0 時不會，Safari 完全沒有。
     * 所以更新前後各量一次 anchor 的位置，差了超過 1px 就用 window.scrollBy() 捲回去。
     * 更新後才量：Chrome 自己的錨定在量的那次排版裡就已經套用了，剩下的差才是還要補的，兩邊不會加在一起。
     * 量不到位置或不能捲動的環境（沒有 getBoundingClientRect() 或 window.scrollBy()）只執行 update
     * @param {HTMLElement} anchor - 要留在原位的元素（按下的按鈕）
     * @param {function(): void} update - 改動畫面的更新，要同步做完
     */
    keepInPlace(anchor, update) {
        if (typeof anchor.getBoundingClientRect !== 'function' || typeof window.scrollBy !== 'function') {
            update();
            return;
        }
        const before = anchor.getBoundingClientRect().top;
        update();
        const moved = anchor.getBoundingClientRect().top - before;
        if (Math.abs(moved) > 1) {
            window.scrollBy(0, moved);
        }
    }

    /**
     * 卡片上的「提醒我」：沒設就設（網頁提醒關著時順便打開），已設就取消。
     * 設的時候在點擊裡問通知權限：網頁提醒已經開著、但玩家之前把詢問關掉了（權限還是 default）時再問一次；
     * 允許或封鎖了就不會再跳出詢問（ReminderScheduler.requestPermission() 只在 default 時問）。取消時不問。
     * 卡片的按鈕與我的提醒就地更新，焦點留在按過的按鈕上，按鈕也留在畫面上原來的位置（見 keepInPlace()）
     * @param {Object} material - GatheringMaterials.group() 的結果
     */
    toggleReminder(material) {
        ReminderScheduler.unlockSound();
        const name = this.nameOf(material, this.currentLanguage);
        if (this.reminders.has(material.key)) {
            this.reminders.remove(material.key);
            FF14Utils.showToast(FF14Utils.getI18nText('reminderRemovedToast', '已取消提醒：{name}', { name }), 'info');
        } else {
            this.reminders.add(material.key, Date.now());
            if (!this.reminders.enabled) {
                this.turnOnWebReminders();
            } else {
                // 不等回答（同 turnOnWebReminders()）：回答來了再畫一次我的提醒（#notifyStatus 照權限寫）
                ReminderScheduler.requestPermission().then(() => this.renderReminders());
            }
            FF14Utils.showToast(FF14Utils.getI18nText('reminderAddedToast', '已設提醒：{name}', { name }), 'success');
        }
        this.keepInPlace(this.cards.get(material.key).remindBtn, () => {
            this.refreshCardButtons();
            this.renderReminders();
        });
    }

    /**
     * 提醒列的取消鈕：取消提醒，卡片的按鈕跟著變。焦點在這一列上時，交給補上這個位置的列的取消鈕，
     * 沒有下一列就給上一列，一列都沒有了（我的提醒收起來了）就給搜尋框
     * @param {string} key - 素材的 key
     */
    cancelReminder(key) {
        const list = this.elements.reminderList;
        const entry = this.reminderRows.get(key);
        const index = entry ? Array.from(list.children).indexOf(entry.row) : -1;
        const hadFocus = Boolean(entry) && entry.row.contains(document.activeElement);
        const name = this.nameOf(this.materialByKey.get(key), this.currentLanguage);

        this.reminders.remove(key);
        FF14Utils.showToast(FF14Utils.getI18nText('reminderRemovedToast', '已取消提醒：{name}', { name }), 'info');
        this.refreshCardButtons();

        // 先拿掉這一列：焦點跟著離開清單，下面的 renderReminders() 才不會因為焦點還在列裡而延後重排。
        // 拿掉有焦點的元素時瀏覽器會同步觸發 focusout，先清掉延後的重排，不讓它在半途排
        if (entry) {
            this.reminderOrder.pending = false;
            this.reminderRows.delete(key);
            entry.row.remove();
        }
        this.renderReminders();

        if (hadFocus) {
            const rows = Array.from(list.children);
            const next = rows[Math.min(index, rows.length - 1)];
            (next ? next.querySelector('.gx-cancel-btn') : this.elements.searchInput).focus();
        }
    }

    /**
     * 複製鬧鐘鈕（卡片與提醒列共用，全天的素材沒有）：按下時複製這種素材下一次出現的遊戲鬧鐘，說明寫在 host 裡。
     * 外觀是 .btn-outline（卡片與提醒列上都不用 .btn-primary），不用 disabled：按過之後焦點還在這顆按鈕上
     * @param {Object} material - GatheringMaterials.group() 的結果
     * @param {HTMLElement} host - 按鈕所在的卡片或提醒列
     * @returns {HTMLElement}
     */
    createAlarmButton(material, host) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline gx-alarm-btn';
        this.writeAlarmButton(button);
        button.addEventListener('click', () => {
            this.copyAlarm(material, host);
        });
        return button;
    }

    /**
     * 複製鬧鐘鈕的字：📋 加目前語言的字（建鈕與提醒列換語言時寫）。字放在 .gx-btn-label 裡：
     * 480px 以下提醒列的按鈕只顯示 📋（style.css），名稱在 aria-label
     */
    writeAlarmButton(button) {
        SecurityUtils.clearElement(button);
        const icon = document.createElement('span');
        icon.className = 'btn-icon';
        icon.textContent = '📋';
        const label = document.createElement('span');
        label.className = 'gx-btn-label';
        label.textContent = FF14Utils.getI18nText('copyAlarmButton', '複製鬧鐘');
        button.appendChild(icon);
        button.appendChild(document.createTextNode(' '));
        button.appendChild(label);
    }

    /**
     * 複製鬧鐘：把這種素材下一次出現的遊戲鬧鐘（一行不帶 rp 的 /alarm 指令，見 MacroExporter.generateOneTimeAlarm()）
     * 放進剪貼簿；正在可採時複製的是再下一段。要在使用者的點擊裡呼叫（瀏覽器只在這時讓網頁寫剪貼簿）。
     * 說明先寫好、不等寫入的結果：指令馬上看得到，剪貼簿一直沒回應也不會什麼都沒有。
     * 寫入失敗（被拒絕、沒有 navigator.clipboard）時，結果來的時候把這個說明改寫成沒辦法自動複製、換警告的配色，
     * 指令留著讓使用者自己選取複製。同一張卡片（提醒列）再按一次時說明是同一個元素：比較早的那一次結果晚到時，
     * 說明和 toast 都照最近一次，不改（原因照樣用 console.warn 記下）。按鈕不動、焦點不動
     * @param {Object} material - GatheringMaterials.group() 的結果
     * @param {HTMLElement} host - 按鈕所在的卡片或提醒列，說明寫在這裡面
     */
    copyAlarm(material, host) {
        const next = GatheringMaterials.nextAlarm(material, Date.now());
        const command = next && this.macroExporter.generateOneTimeAlarm(next.record);
        if (!command) return;

        const time = GatheringMaterials.etTime(next.schedule.startMinutes);
        const note = this.showCopiedNote(host, time, command);
        const attempt = {};
        this.copyAttempts.set(note, attempt);
        const latest = () => this.copyAttempts.get(note) === attempt;

        let written;
        try {
            written = navigator.clipboard.writeText(command);
        } catch (error) {
            // 沒有 navigator.clipboard（不是安全的連線、很舊的瀏覽器）或同步丟錯：當成複製失敗
            written = Promise.reject(error);
        }
        written.then(
            () => {
                if (latest()) FF14Utils.showToast(FF14Utils.getI18nText('alarmCopiedToast', '已複製鬧鐘指令'), 'success');
            },
            (error) => {
                console.warn('複製鬧鐘失敗:', error);
                if (!latest()) return;
                // 結果來的時候，可能已經複製了別的（別張的說明正在顯示）、或卡片已經重畫：只改這一次寫的說明（拿在手上的那個，
                // 不是再去 host 裡找），不動誰顯示誰收起；說明已經不在畫面上時改了也沒有影響
                this.writeNote(note, time, false);
                FF14Utils.showToast(FF14Utils.getI18nText('copyFailedError', '複製失敗，請手動選取複製'), 'error');
            }
        );
    }

    /**
     * 在 host（卡片或提醒列）裡寫出複製了什麼：「已複製下一次（ET 12:00）的遊戲鬧鐘，貼到遊戲的聊天輸入框就設好：」加上指令本身。
     * 一次只留一個：頁面上其他的說明收起來（hidden），這個 host 已經有就重用。說明裡沒有可以聚焦的元素，焦點不動。
     * 卡片重畫（換語言、篩選、搜尋）時說明跟著消失；提醒列換語言時不重建，由 relabelReminderRows() 收掉
     * @param {HTMLElement} host - 卡片或提醒列
     * @param {string} time - 下一次的 ET 開始時間（HH:MM）
     * @param {string} command - 複製的指令
     * @returns {HTMLElement} 寫好的說明（div.gx-copied）
     */
    showCopiedNote(host, time, command) {
        document.querySelectorAll('.gx-copied').forEach(other => {
            if (!host.contains(other)) other.hidden = true;
        });

        let note = host.querySelector('.gx-copied');
        if (!note) {
            note = document.createElement('div');
            note.className = 'gx-copied';
            note.appendChild(document.createElement('span'));
            note.appendChild(document.createElement('code'));
            host.appendChild(note);
        }
        note.hidden = false;
        this.writeNote(note, time, true);
        TimedGatheringManager.writeText(note.querySelector('code'), command);
        return note;
    }

    /**
     * 說明的字與外觀：複製成功寫 alarmCopiedNote（「已複製下一次…」，成功的配色）；沒成功寫 alarmCopyFailedNote
     * （「沒辦法自動複製。…在下面，請自己選取複製…」）並加上 .is-failed（警告的配色）。只改這個說明，不動顯示或收起
     * @param {HTMLElement} note - div.gx-copied
     * @param {string} time - 下一次的 ET 開始時間（HH:MM）
     * @param {boolean} copied - 剪貼簿有沒有寫成功
     */
    writeNote(note, time, copied) {
        TimedGatheringManager.writeText(
            note.querySelector('span'),
            copied
                ? FF14Utils.getI18nText('alarmCopiedNote', '已複製下一次（ET {time}）的遊戲鬧鐘，貼到遊戲的聊天輸入框就設好：', { time })
                : FF14Utils.getI18nText('alarmCopyFailedNote', '沒辦法自動複製。下一次（ET {time}）的遊戲鬧鐘在下面，請自己選取複製，貼到遊戲的聊天輸入框：', { time })
        );
        note.classList.toggle('is-failed', !copied);
    }

    /** 測試通知：和到時間的提醒一樣（頁內提示、提示音，允許時加系統通知），不問權限 */
    testNotification() {
        ReminderScheduler.unlockSound();
        ReminderScheduler.deliver({
            title: FF14Utils.getI18nText('notificationTitle', 'FF14 採集提醒'),
            body: FF14Utils.getI18nText('testNotificationBody', '這是一個測試通知，請確認您是否看到了'),
            tag: 'ff14tw-gathering-test'
        });
        // 系統通知跳不出來時（Android 的 Chrome），旁邊的說明改寫成不能跳通知
        this.renderReminders();
    }

    /**
     * 一個提醒到了（ReminderScheduler）：頁內提示、提示音，允許時加系統通知，用現在的語言寫。
     * 標題寫實際還剩幾分鐘（進位、至少 1；晚到時比提早分鐘數少），已經開始（出現時通知、來不及提早或晚到）就寫出現了；
     * 內容寫那一次的本地時間、ET 時段與地點。送出之後重畫我的提醒：new Notification() 丟錯過（Android 的 Chrome）時，
     * 旁邊的說明改寫成不能跳通知
     * @param {Object} alert - GatheringReminders.alerts() 回傳的一個
     */
    handleReminderDue(alert) {
        const material = alert.data && this.materialByKey.get(alert.data.materialKey);
        if (!material) return;

        const lang = this.currentLanguage;
        const name = this.nameOf(material, lang);
        const left = alert.start - Date.now();
        const title = left <= 0
            ? FF14Utils.getI18nText('notifyTitleNow', '{name}出現了', { name })
            : FF14Utils.getI18nText('notifyTitle', '{name} {n} 分鐘後出現', { name, n: GatheringMaterials.minutesCeil(left) });
        const body = FF14Utils.getI18nText('notifyBody', '{start} 開始，到 {end}（{et}）· {place}', {
            start: GatheringMaterials.localTime(alert.start),
            end: GatheringMaterials.localTime(alert.end),
            et: GatheringMaterials.etRange(alert.data.schedule),
            place: this.placeOf(material, lang)
        });

        ReminderScheduler.deliver({ title, body, tag: ReminderScheduler.idOf(alert) });
        this.renderReminders();
    }

    /** 這個瀏覽器到時間做不到的事：通知被封鎖或不能跳時寫出來（頁內提示和提示音照樣有），其他情況不用說（空字串） */
    notifyStatusText() {
        switch (ReminderScheduler.permission()) {
            case 'denied':
                return FF14Utils.getI18nText('notifyDenied', '瀏覽器封鎖了這個網站的通知，到時間只會在頁面上提示和發出聲音。可以從網址列左邊的網站設定打開，或改用遊戲鬧鐘。');
            case 'unsupported':
                return FF14Utils.getI18nText('notifyUnsupported', '這個瀏覽器不能跳通知，到時間只會在頁面上提示和發出聲音，或改用遊戲鬧鐘。');
            default:
                return '';
        }
    }

    /**
     * 畫我的提醒。沒有提醒時整塊隱藏、時鐘一行放在搜尋框上面；有提醒時顯示、時鐘一行併進標題列，
     * 寫個數、開關、提早分鐘數、「顯示全部」與通知的說明，列照現在的時間排好（焦點在列裡時等焦點離開再排）。
     * 提醒有變（設、取消、另一個分頁改了）、提醒響過、換語言時呼叫；每秒的倒數不經過這裡（updateReminderRows()）
     */
    renderReminders() {
        const {
            reminders, remindersHead, reminderCount, notificationToggle, leadSelect, reminderMoreBtn, notifyStatus, clockSlot, clockLine
        } = this.elements;
        const count = this.reminders.keys.length;
        const limit = this.remindersShown();

        reminders.hidden = count === 0;
        const clockHome = count > 0 ? remindersHead : clockSlot;
        if (clockLine.parentNode !== clockHome) {
            clockHome.appendChild(clockLine);
        }

        TimedGatheringManager.writeText(reminderCount, String(count));
        notificationToggle.checked = this.reminders.enabled;
        // 值不一樣時才改（另一個分頁改了）：使用者可能正打開著這個選單
        const lead = String(this.reminders.leadMinutes);
        if (leadSelect.value !== lead) {
            leadSelect.value = lead;
        }

        // 沒超過上限就用不到「顯示全部」，下次超過時從收起開始
        if (count <= limit) {
            this.remindersExpanded = false;
        }
        reminderMoreBtn.hidden = count <= limit;
        // 按鈕控制提醒列（index.html 的 aria-controls）：展開時 true、收起時 false
        reminderMoreBtn.setAttribute('aria-expanded', String(this.remindersExpanded));
        TimedGatheringManager.writeText(reminderMoreBtn, this.remindersExpanded
            ? FF14Utils.getI18nText('showFewerReminders', '收起')
            : FF14Utils.getI18nText('showAllReminders', '顯示全部 {count} 個', { count }));

        const status = this.notifyStatusText();
        TimedGatheringManager.writeText(notifyStatus, status);
        notifyStatus.hidden = !status;

        this.reminderOrder.request(Date.now());
    }

    updateLanguageButtons() {
        this.elements.languageButtons.forEach(btn => {
            const isActive = btn.dataset.lang === this.currentLanguage;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    debounceSearch() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.applyFilters();
        }, TimedGatheringManager.CONSTANTS.DEBOUNCE_DELAY);
    }

    applyFilters() {
        // Search operates on text, just like the dataset and textContent rendering.
        const searchTerm = this.elements.searchInput.value.trim().toLowerCase();
        const activeTypes = Array.from(this.elements.typeFilters.querySelectorAll('.chip.active'))
            .map(tag => tag.dataset.type);
        const activeExpansions = Array.from(this.elements.expansionFilters.querySelectorAll('.chip.active'))
            .map(tag => tag.dataset.expansion);

        // 符合的資料（有搜尋時已照分數排過；這是 SearchFilter 快取裡的陣列，不要改它）
        const matched = this.searchFilter.filter(this.data, {
            searchTerm,
            types: activeTypes,
            expansions: activeExpansions
        });

        // 依素材收起來：素材的分數＝它符合的資料裡最高的分數（沒有搜尋時不算）
        this.searchWords = SearchFilter.words(searchTerm);
        this.scores = new Map();
        const matchedKeys = new Set();
        matched.forEach(record => {
            const key = GatheringMaterials.keyOf(record);
            matchedKeys.add(key);
            if (this.searchWords.length > 0) {
                const score = this.searchFilter.scoreItem(record, this.searchWords);
                this.scores.set(key, Math.max(this.scores.get(key) || 0, score));
            }
        });

        // 照資料的順序取出符合的素材；排序在 renderItems() 裡照畫的當下的時間做
        this.shown = this.materials.filter(material => matchedKeys.has(material.key));
        this.renderItems();
    }

    /**
     * 卡片的順序：有搜尋時照分數由高到低，同分照出現時間（GatheringMaterials.compare）；沒有搜尋時只照出現時間。
     * 都同分時照資料的順序（不看傳進來的順序，所以拿畫面上的順序來重排也一樣）
     * @param {Object[]} materials - 要排的素材
     * @param {number} now - 毫秒時間戳
     * @param {boolean} [byScore=true] - 先看搜尋的分數；我的提醒傳 false（只照出現時間，搜尋不影響它的順序）
     * @returns {Object[]} 排好的新陣列（不改傳進來的陣列）
     */
    sortMaterials(materials, now, byScore = true) {
        const order = new Map(this.materials.map((material, index) => [material.key, index]));
        // 沒有搜尋時 this.scores 是空的，分數都當成 0
        const scoreOf = (material) => (byScore && this.scores.get(material.key)) || 0;
        return materials
            .map(material => ({ material, state: GatheringMaterials.state(material, now) }))
            .sort((a, b) => (scoreOf(b.material) - scoreOf(a.material)) ||
                GatheringMaterials.compare(a.state, b.state) ||
                (order.get(a.material.key) - order.get(b.material.key)))
            .map(entry => entry.material);
    }

    /** 照現在的時間排好 this.shown、重建卡片，並寫上計數；沒有符合的素材時顯示空狀態 */
    renderItems() {
        const container = this.elements.itemsContainer;
        const now = Date.now();
        // 篩選、搜尋、換語言都從這裡重畫。this.shown 可能是之前排的（計時器被放慢、電腦睡著、重排還在延後），
        // 照現在的時間再排一次，順序才和卡片上的狀態是同一個時間
        this.shown = this.sortMaterials(this.shown, now);
        // 整個重畫就沒有延後的重排了。先清掉：瀏覽器移除有焦點的元素時會同步觸發 focusout，不能讓它動到半清掉的清單
        this.cardOrder.pending = false;
        SecurityUtils.clearElement(container);
        this.cards.clear();

        const count = this.shown.length;
        this.elements.itemCount.textContent = this.searchWords.length > 0
            ? FF14Utils.getI18nText('resultsFound', '找到 {count} 種', { count })
            : FF14Utils.getI18nText('resultsCount', '{count} 種 · 照出現時間排序', { count });

        if (count === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-state';
            emptyMessage.textContent = FF14Utils.getI18nText('noItemsFound', '沒有符合條件的採集物');
            container.appendChild(emptyMessage);
            return;
        }

        this.shown.forEach(material => {
            container.appendChild(this.createMaterialCard(material, now));
        });
    }

    /**
     * 一種素材的卡片：標題是目前語言的名稱，下面小字是另外兩種語言的名稱；狀態行、地點行、時段行與按鈕。
     * 搜尋命中的字（名稱、另外兩種語言的名稱、地區、地點）用 <mark> 標出來。卡片登記在 this.cards
     * @param {Object} material - GatheringMaterials.group() 的結果
     * @param {number} now - 毫秒時間戳
     * @returns {HTMLElement}
     */
    createMaterialCard(material, now) {
        const lang = this.currentLanguage;
        const state = GatheringMaterials.state(material, now);
        const isNow = state.kind === 'now';

        const card = document.createElement('article');
        card.className = isNow ? 'card gx-card is-now' : 'card gx-card';
        card.dataset.material = material.key;

        const head = document.createElement('div');
        head.className = 'gx-head';

        const icon = document.createElement('span');
        icon.className = 'gx-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = this.getTypeIcon(material.type);
        head.appendChild(icon);

        const names = document.createElement('div');
        names.className = 'gx-names';

        const title = document.createElement('h3');
        title.className = 'gx-name';
        this.appendMarked(title, this.nameOf(material, lang));
        names.appendChild(title);

        const alt = document.createElement('p');
        alt.className = 'gx-alt';
        this.otherNames(material, lang).forEach((name, index) => {
            if (index > 0) alt.appendChild(document.createTextNode(' · '));
            this.appendMarked(alt, name);
        });
        names.appendChild(alt);
        head.appendChild(names);

        const version = document.createElement('span');
        version.className = 'tag';
        version.textContent = `v${material.expansion}`;
        head.appendChild(version);
        card.appendChild(head);

        const status = document.createElement('p');
        status.className = 'gx-status';
        this.writeStatus(status, state, now);
        card.appendChild(status);

        // 地點行：「📍 地區 · 地點　座標」（地點和地區同名時只寫地區），地區與地點各自標出命中的字
        const place = this.placeParts(material, lang);
        const where = document.createElement('p');
        where.className = 'gx-where';
        where.appendChild(document.createTextNode('📍 '));
        this.appendMarked(where, place.zone);
        if (place.location) {
            where.appendChild(document.createTextNode(' · '));
            this.appendMarked(where, place.location);
        }
        where.appendChild(document.createTextNode(`　${place.coordinates}`));
        card.appendChild(where);

        const schedule = document.createElement('p');
        schedule.className = 'gx-sched';
        schedule.textContent = this.scheduleText(material);
        card.appendChild(schedule);

        const actions = document.createElement('div');
        actions.className = 'gx-actions';

        // 提醒我與複製鬧鐘：全天的素材一直都能採，沒有「出現」可以提醒、也沒有鬧鐘可設，都不放
        let remindBtn = null;
        if (!material.allDay) {
            remindBtn = document.createElement('button');
            remindBtn.type = 'button';
            remindBtn.addEventListener('click', () => {
                this.toggleReminder(material);
            });
            actions.appendChild(remindBtn);
            actions.appendChild(this.createAlarmButton(material, card));
        }

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.addEventListener('click', () => {
            this.addMaterialToList(material);
        });
        actions.appendChild(addBtn);
        card.appendChild(actions);

        this.cards.set(material.key, { card, status, addBtn, remindBtn, kind: state.kind, start: state.start });
        this.updateCardButtons(material);

        return card;
    }

    /** 把文字依目前的搜尋字切段接到 parent 後面：命中的段落包在 <mark> 裡，其餘是文字節點 */
    appendMarked(parent, text) {
        SearchFilter.segments(text, this.searchWords).forEach(segment => {
            if (segment.mark) {
                const mark = document.createElement('mark');
                mark.textContent = segment.text;
                parent.appendChild(mark);
            } else {
                parent.appendChild(document.createTextNode(segment.text));
            }
        });
    }

    /** 素材（或清單裡的一筆）在某個語言的名稱：zh 是 name，en、ja 沒有自己的名稱時用 name */
    nameOf(material, lang) {
        if (lang === 'en') return material.nameEn || material.name;
        if (lang === 'ja') return material.nameJp || material.name;
        return material.name;
    }

    /** 卡片標題下面的另外兩種語言的名稱：照 zh、en、ja 的順序，去掉目前語言、空的和重複的 */
    otherNames(material, lang) {
        const title = this.nameOf(material, lang);
        const names = [];
        ['zh', 'en', 'ja'].forEach(other => {
            const name = this.nameOf(material, other);
            if (other !== lang && name && name !== title && !names.includes(name)) names.push(name);
        });
        return names;
    }

    /**
     * 地點行的三段：地區（zh zone、en zoneEn、ja zoneJp，沒有時用 zone）、地點（zh location、en locationEn、ja locationJp，
     * 沒有時用 location）、座標。資料裡很多地點就是地區本身（location 和 zone 相同），這時地點是空字串，地區只寫一次
     */
    placeParts(material, lang) {
        const zone = (lang === 'en' && material.zoneEn) || (lang === 'ja' && material.zoneJp) || material.zone;
        const location = (lang === 'en' && material.locationEn) || (lang === 'ja' && material.locationJp) || material.location;
        return { zone, location: location === zone ? '' : location, coordinates: material.coordinates };
    }

    /** 地點行的文字（不含 📍）：「地區 · 地點　座標」（地點是空的就是「地區　座標」），座標前面是全形空白 */
    placeOf(material, lang) {
        const { zone, location, coordinates } = this.placeParts(material, lang);
        return location ? `${zone} · ${location}　${coordinates}` : `${zone}　${coordinates}`;
    }

    /**
     * 狀態行：現在可採寫還剩多久、到幾點；不能採寫幾點出現、還要多久（不到 10 分鐘寫 m:ss，否則寫幾分）；全天寫全天都可以採
     * @param {Object} state - GatheringMaterials.state() 的結果
     * @param {number} now - 毫秒時間戳
     * @returns {string} 沒有有效時段（none）時是空字串
     */
    statusText(state, now) {
        if (state.kind === 'now') {
            return FF14Utils.getI18nText('statusNow', '現在可採 · 還剩 {left}（到 {end}）', {
                left: GatheringMaterials.countdown(state.end - now),
                end: GatheringMaterials.localTime(state.end)
            });
        }
        if (state.kind === 'next') {
            const wait = state.start - now;
            return FF14Utils.getI18nText('statusNext', '{time} 出現 · 還要 {wait}', {
                time: GatheringMaterials.localTime(state.start),
                wait: wait < TimedGatheringManager.CONSTANTS.SHORT_WAIT_MS
                    ? GatheringMaterials.countdown(wait)
                    : FF14Utils.getI18nText('waitMinutes', '{m} 分', { m: GatheringMaterials.minutesCeil(wait) })
            });
        }
        if (state.kind === 'allday') {
            return FF14Utils.getI18nText('statusAllDay', '全天都可以採');
        }
        return '';
    }

    /**
     * 把狀態行寫成 state 的樣子：文字有變才寫，現在可採時有 .now。每秒呼叫，所以只動文字與 class，不重建元素
     * @param {HTMLElement} status - 狀態行（p.gx-status）
     * @param {Object} state - GatheringMaterials.state() 的結果
     * @param {number} now - 毫秒時間戳
     */
    writeStatus(status, state, now) {
        TimedGatheringManager.writeText(status, this.statusText(state, now));
        status.classList.toggle('now', state.kind === 'now');
    }

    /** 文字有變才寫：每秒或常常重畫的地方用，沒變的文字節點不換掉 */
    static writeText(element, text) {
        if (element.textContent !== text) {
            element.textContent = text;
        }
    }

    /** 時段行：「每天 ET 00:00、ET 12:00，每次約 6 分鐘」；全天的素材寫「全天」 */
    scheduleText(material) {
        if (material.allDay) {
            return FF14Utils.getI18nText('scheduleAllDay', '全天');
        }
        return FF14Utils.getI18nText('scheduleDaily', '每天 {slots}，每次約 {minutes} 分鐘', {
            slots: GatheringMaterials.slots(material).join(FF14Utils.getI18nText('listSeparator', '、')),
            minutes: GatheringMaterials.realMinutes(material)
        });
    }

    /** 每秒一次（initialize() 設的計時器）：更新卡片與我的提醒的倒數；有切換了就重排（焦點在那個清單裡時延後） */
    tick() {
        const now = Date.now();
        if (this.updateCards(now)) {
            this.cardOrder.request(now);
        }
        if (this.reminders) {
            this.updateReminderRows(now);
        }
    }

    /**
     * 照 now 更新畫面上每張卡片的狀態行與 .is-now，有變才寫，不重建任何元素、不碰焦點。
     * 計時器被放慢或電腦睡著時，下一次執行就直接寫成現在的狀態
     * @param {number} now - 毫秒時間戳
     * @returns {boolean} 有沒有卡片切換了，要重排：kind 不同（出現 → 現在可採、現在可採 → 下一次），
     *     或 kind 一樣但換成另一段（start 不同：睡了很久之後同樣是下一次、卻已經是別的時段，或兩段重疊時換成另一段）
     */
    updateCards(now) {
        let switched = false;
        for (const [key, entry] of this.cards) {
            const state = GatheringMaterials.state(this.materialByKey.get(key), now);
            if (state.kind !== entry.kind || state.start !== entry.start) {
                switched = true;
            }
            entry.kind = state.kind;
            entry.start = state.start;
            this.writeStatus(entry.status, state, now);
            entry.card.classList.toggle('is-now', state.kind === 'now');
        }
        return switched;
    }

    /**
     * 一個清單的重排：搬動清單裡現有的元素，不重建。焦點在清單裡時先不排（搬動有焦點的元素，瀏覽器會讓它失去焦點），
     * 只記下 pending，等焦點離開清單（清單的 focusout，接手焦點的元素不在清單裡）再照那時的時間排。
     * 卡片（#itemsContainer）與我的提醒的列（#reminderList）共用
     * @param {HTMLElement} container - 清單
     * @param {function(number): void} arrange - 照 now 把清單排好（搬動現有的元素）
     * @returns {{pending: boolean, request: function(number=): void}} request(now)：照 now（預設現在）排，
     *     焦點在清單裡時只記下 pending。整個重畫、或先拿掉有焦點的元素之前，把 pending 設成 false：
     *     瀏覽器移除有焦點的元素時會同步觸發 focusout，不能讓它在半途排
     */
    keepOrder(container, arrange) {
        const order = {
            pending: false,
            request(now = Date.now()) {
                if (container.contains(document.activeElement)) {
                    order.pending = true;
                    return;
                }
                order.pending = false;
                arrange(now);
            }
        };
        // relatedTarget 是接手焦點的元素：還在清單裡（只是在按鈕之間移動）時不排；
        // 視窗失去焦點時 relatedTarget 是 null，但 document.activeElement 還在清單裡，request() 會繼續延後
        container.addEventListener('focusout', (event) => {
            if (order.pending && !container.contains(event.relatedTarget)) {
                order.request();
            }
        });
        return order;
    }

    /** 照 now 重排卡片：搬動現有的卡片元素，不重建。由 this.cardOrder 呼叫（焦點在卡片清單裡時延後） */
    arrangeCards(now) {
        const container = this.elements.itemsContainer;
        this.shown = this.sortMaterials(this.shown, now);
        this.shown.forEach(material => {
            container.appendChild(this.cards.get(material.key).card);
        });
    }

    /** 我的提醒最多先列幾個：手機（480px 以下）REMINDERS_SHOWN_NARROW 個，其他 REMINDERS_SHOWN 個 */
    remindersShown() {
        const { REMINDERS_SHOWN, REMINDERS_SHOWN_NARROW } = TimedGatheringManager.CONSTANTS;
        return this.narrowMedia?.matches ? REMINDERS_SHOWN_NARROW : REMINDERS_SHOWN;
    }

    /**
     * 我的提醒要列出來的素材 key：照出現時間排（同卡片：GatheringMaterials.compare，同分照資料的順序；不看搜尋的分數），
     * 沒按「顯示全部」時只取前 remindersShown() 個
     * @param {number} now - 毫秒時間戳
     * @returns {string[]}
     */
    visibleReminderKeys(now) {
        const materials = this.reminders.keys.map(key => this.materialByKey.get(key));
        const keys = this.sortMaterials(materials, now, false).map(material => material.key);
        return this.remindersExpanded ? keys : keys.slice(0, this.remindersShown());
    }

    /**
     * 照 now 把我的提醒的列放好：不該列的拿掉，該列的照順序放（已經有的列搬動、不重建，沒有的才建）。
     * 由 this.reminderOrder 呼叫（焦點在列裡時延後）
     * @param {number} now - 毫秒時間戳
     */
    arrangeReminderRows(now) {
        const list = this.elements.reminderList;
        const keys = this.visibleReminderKeys(now);
        const wanted = new Set(keys);
        for (const [key, entry] of this.reminderRows) {
            if (!wanted.has(key)) {
                this.reminderRows.delete(key);
                entry.row.remove();
            }
        }
        keys.forEach((key, index) => {
            const { row } = this.reminderRows.get(key) || this.createReminderRow(key, now);
            const current = list.children[index] || null;
            if (current !== row) {
                list.insertBefore(row, current);
            }
        });
    }

    /**
     * 我的提醒的一列：圖示、名稱、狀態行（同卡片）、「地區 · 地點　座標」、複製鬧鐘鈕與取消鈕；登記在 this.reminderRows
     * @param {string} key - 素材的 key
     * @param {number} now - 毫秒時間戳
     * @returns {{row: HTMLElement, name: HTMLElement, status: HTMLElement, where: HTMLElement, alarmBtn: HTMLElement, cancelBtn: HTMLElement}}
     */
    createReminderRow(key, now) {
        const material = this.materialByKey.get(key);
        const row = document.createElement('li');
        row.className = 'gx-reminder';
        row.dataset.material = key;

        const icon = document.createElement('span');
        icon.className = 'gx-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = this.getTypeIcon(material.type);
        row.appendChild(icon);

        const main = document.createElement('div');
        main.className = 'gx-r-main';
        const name = document.createElement('b');
        main.appendChild(name);
        const status = document.createElement('span');
        status.className = 'gx-status';
        main.appendChild(status);
        const where = document.createElement('span');
        where.className = 'gx-r-where';
        main.appendChild(where);
        row.appendChild(main);

        const actions = document.createElement('div');
        actions.className = 'gx-r-actions';
        // 我的提醒裡的素材都有時段（全天的不能設提醒），所以每一列都有複製鬧鐘
        const alarmBtn = this.createAlarmButton(material, row);
        actions.appendChild(alarmBtn);
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-sm btn-ghost btn-icon-only gx-cancel-btn';
        cancelBtn.textContent = '✕';
        cancelBtn.addEventListener('click', () => {
            this.cancelReminder(key);
        });
        actions.appendChild(cancelBtn);
        row.appendChild(actions);

        const entry = { row, name, status, where, alarmBtn, cancelBtn };
        this.reminderRows.set(key, entry);
        this.writeReminderRow(key, entry, now);
        return entry;
    }

    /**
     * 一列上跟語言或時間有關的字：名稱、狀態行、地點行，複製鬧鐘鈕的字與 aria-label「複製鬧鐘：名稱」，
     * 取消鈕的 aria-label「取消提醒：名稱」（建列與換語言時寫）。每一列的按鈕字都一樣，加上名稱才分得出是哪一列；
     * 卡片上的複製鬧鐘鈕在素材自己的卡片裡，不加
     */
    writeReminderRow(key, entry, now) {
        const material = this.materialByKey.get(key);
        const lang = this.currentLanguage;
        const name = this.nameOf(material, lang);
        TimedGatheringManager.writeText(entry.name, name);
        TimedGatheringManager.writeText(entry.where, this.placeOf(material, lang));
        this.writeAlarmButton(entry.alarmBtn);
        entry.alarmBtn.setAttribute('aria-label', FF14Utils.getI18nText('copyAlarmLabel', '複製鬧鐘：{name}', { name }));
        entry.cancelBtn.setAttribute('aria-label', FF14Utils.getI18nText('cancelReminderLabel', '取消提醒：{name}', { name }));
        this.writeStatus(entry.status, GatheringMaterials.state(material, now), now);
    }

    /**
     * 換語言：每一列就地改字，不重建（焦點不動）。列裡複製鬧鐘的說明是舊語言寫的，列不重畫就收不掉，
     * 所以在這裡拿掉（和重畫的卡片一樣，說明跟著消失）
     */
    relabelReminderRows() {
        const now = Date.now();
        for (const [key, entry] of this.reminderRows) {
            this.writeReminderRow(key, entry, now);
            const note = entry.row.querySelector('.gx-copied');
            if (note) note.remove();
        }
    }

    /**
     * 每秒（tick()）：照 now 更新每一列的狀態行，只換文字與 .now，不重建、不碰焦點。該列的素材或順序和畫面上的不一樣時
     * （有提醒在出現與現在可採之間切換，包括沒列出來的那幾個）重排，焦點在列裡時延後。
     * 計時器被放慢或電腦睡著時，下一次執行就直接寫成現在的狀態與順序
     * @param {number} now - 毫秒時間戳
     */
    updateReminderRows(now) {
        for (const [key, entry] of this.reminderRows) {
            this.writeStatus(entry.status, GatheringMaterials.state(this.materialByKey.get(key), now), now);
        }
        const shown = Array.from(this.elements.reminderList.children, row => row.dataset.material);
        const wanted = this.visibleReminderKeys(now);
        if (wanted.length !== shown.length || wanted.some((key, index) => key !== shown[index])) {
            this.reminderOrder.request(now);
        }
    }

    getTypeIcon(type) {
        const icons = {
            'mining': '⛏️',
            'botany': '🌿',
            'fishing': '🎣'
        };
        return icons[type] || '❓';
    }

    /**
     * 把素材的每一個時段（資料的每一筆）加進目前的清單；已經在清單裡的不重複加。
     * 放不下全部的時段時一筆都不加（清單最多 ListManager.CONSTANTS.MAX_ITEMS_PER_LIST 筆）。
     * 瀏覽器封鎖網站資料時 addToList() 先把這一筆放進記憶體裡的清單、存的時候才丟例外：每一筆各自接住，
     * 所有時段照樣加進這次的清單、畫面照樣重畫，改跳警告說重新整理後就不見了
     * @param {Object} material - GatheringMaterials.group() 的結果
     */
    addMaterialToList(material) {
        const list = this.listManager.getList(this.currentListId);
        if (!list) return;

        const missing = material.records.filter(record => !this.listManager.hasInCurrentList(this.currentListId, record.id));
        if (missing.length === 0) return;

        const max = ListManager.CONSTANTS.MAX_ITEMS_PER_LIST;
        if (list.items.length + missing.length > max) {
            FF14Utils.showToast(FF14Utils.getI18nText('listMaxItems', '清單最多只能包含 {max} 個項目', { max }), 'warning');
            return;
        }

        let saved = true;
        missing.forEach(record => {
            try {
                this.listManager.addToList(this.currentListId, record);
            } catch (error) {
                // 存不起來（ListManager 已經記在 console）：這一筆已經在記憶體裡的清單，接著加下一筆
                saved = false;
            }
        });
        this.updateListDisplay();
        this.refreshCardButtons();
        if (saved) {
            FF14Utils.showToast(FF14Utils.getI18nText('addedToListNotification', '已加入清單'), 'success');
        } else {
            FF14Utils.showToast(
                FF14Utils.getI18nText('listAddedNotSaved', '已加入清單，但瀏覽器不讓這個網站存資料，重新整理後就不見了'),
                'warning'
            );
        }
    }

    /**
     * 照目前的清單與我的提醒就地更新每張卡片的按鈕（不重建卡片，焦點不動）；
     * 換清單、清空、加入或移除，以及設、取消提醒（包括另一個分頁改的）之後呼叫
     */
    refreshCardButtons() {
        for (const key of this.cards.keys()) {
            this.updateCardButtons(this.materialByKey.get(key));
        }
    }

    /**
     * 一張卡片的按鈕。兩顆都不用 disabled：剛按過的按鈕還拿著焦點，停用的按鈕拿不住焦點，焦點會掉到 body。
     * - 提醒鈕（全天的素材沒有）：沒設寫「提醒我」，已設寫「已設提醒」並且 aria-pressed="true"，再按就取消
     * - 加入鈕：素材的每一筆都在目前的清單裡才寫已加入（aria-disabled），否則寫加入清單；
     *   再按一次也沒事（addMaterialToList() 沒有要加的就什麼都不做）
     */
    updateCardButtons(material) {
        const { addBtn, remindBtn } = this.cards.get(material.key);
        if (remindBtn) {
            const reminded = this.reminders.has(material.key);
            remindBtn.className = reminded ? 'btn btn-sm btn-success gx-remind-btn' : 'btn btn-sm btn-outline gx-remind-btn';
            SecurityUtils.updateButtonContent(
                remindBtn,
                '🔔',
                reminded
                    ? FF14Utils.getI18nText('remindSetButton', '已設提醒')
                    : FF14Utils.getI18nText('remindButton', '提醒我')
            );
            remindBtn.setAttribute('aria-pressed', reminded ? 'true' : 'false');
        }

        const added = material.records.every(record => this.listManager.hasInCurrentList(this.currentListId, record.id));
        addBtn.className = 'btn btn-sm btn-ghost gx-add-btn';
        SecurityUtils.updateButtonContent(
            addBtn,
            added ? '✔️' : '➕',
            added
                ? FF14Utils.getI18nText('addedToListButton', '已加入')
                : FF14Utils.getI18nText('addToListButton', '加入清單')
        );
        if (added) {
            addBtn.setAttribute('aria-disabled', 'true');
        } else {
            addBtn.removeAttribute('aria-disabled');
        }
    }

    updateListDisplay() {
        const list = this.listManager.getList(this.currentListId);
        const container = this.elements.listItems;
        SecurityUtils.clearElement(container);

        if (!list || list.items.length === 0) {
            // Use safe DOM manipulation instead of innerHTML
            const emptyMessage = SecurityUtils.createEmptyMessage(
                FF14Utils.getI18nText('emptyListMessage', 'List is empty'),
                FF14Utils.getI18nText('emptyListHint', 'Click "Add to List" button on the left to add items')
            );
            container.appendChild(emptyMessage);
            return;
        }

        list.items.forEach(item => {
            const listItem = this.createListItem(item);
            container.appendChild(listItem);
        });
    }

    createListItem(item) {
        const div = document.createElement('div');
        div.className = 'list-item card';
        div.dataset.itemId = item.id;

        const info = document.createElement('div');
        info.className = 'list-item-info';

        const typeIcon = document.createElement('span');
        typeIcon.className = 'list-item-type';
        typeIcon.textContent = this.getTypeIcon(item.type);
        info.appendChild(typeIcon);

        const name = document.createElement('span');
        name.className = 'list-item-name';
        // 目前語言的名稱（同卡片的標題）
        name.textContent = this.nameOf(item, this.currentLanguage);
        info.appendChild(name);

        const version = document.createElement('span');
        version.className = 'list-item-version tag tag-solid tag-primary';
        version.textContent = `v${item.expansion}`;
        info.appendChild(version);

        const time = document.createElement('span');
        time.className = 'list-item-time tag';
        time.textContent = item.time;
        info.appendChild(time);

        div.appendChild(info);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-sm btn-danger';
        removeBtn.textContent = '🗑️';  // Use textContent instead of innerHTML
        removeBtn.title = FF14Utils.getI18nText('removeFromList', 'Remove');
        removeBtn.addEventListener('click', () => {
            this.removeItemFromList(item.id);
        });

        div.appendChild(removeBtn);

        return div;
    }

    removeItemFromList(itemId) {
        this.listManager.removeFromList(this.currentListId, itemId);
        this.updateListDisplay();
        this.refreshCardButtons(); // 更新卡片上的加入鈕
        FF14Utils.showToast(FF14Utils.getI18nText('removedFromListNotification', 'Removed from list'), 'info');
    }

    loadLists() {
        const lists = this.listManager.getAllLists();
        this.renderListTabs(lists);

        if (lists.length > 0) {
            const selectedList = lists.find(list => list.id === this.currentListId) || lists[0];
            this.switchToList(selectedList.id);
        }
    }

    renderListTabs(lists) {
        const container = this.elements.listTabs;
        SecurityUtils.clearElement(container);

        container.setAttribute('role', 'tablist');
        lists.forEach(list => {
            const tab = document.createElement('button');
            tab.className = 'tab list-tab';
            tab.dataset.listId = list.id;
            tab.textContent = list.name;
            tab.id = `tab-list-${list.id}`;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', 'listItems');

            const isActive = list.id === this.currentListId;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', String(isActive));
            tab.tabIndex = isActive ? 0 : -1;

            tab.addEventListener('click', () => {
                this.switchToList(list.id);
            });

            container.appendChild(tab);
        });
    }

    switchToList(listId) {
        this.currentListId = listId;
        const list = this.listManager.getList(listId);

        if (list) {
            this.elements.currentListName.textContent = list.name;

            // 更新標籤頁狀態
            this.elements.listTabs.querySelectorAll('.list-tab').forEach(tab => {
                const isActive = tab.dataset.listId === listId;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-selected', String(isActive));
                tab.tabIndex = isActive ? 0 : -1;
            });
            this.elements.listItems.setAttribute('role', 'tabpanel');
            this.elements.listItems.setAttribute('aria-labelledby', `tab-list-${listId}`);

            // 更新清單顯示
            this.updateListDisplay();

            // 更新卡片上的加入鈕
            this.refreshCardButtons();
        }
    }

    showNewListDialog() {
        if (this.listManager.getAllLists().length >= TimedGatheringManager.CONSTANTS.MAX_LISTS) {
            const warning = FF14Utils.getI18nText(
                'maxListsWarning',
                'Maximum of {max} lists allowed',
                { max: TimedGatheringManager.CONSTANTS.MAX_LISTS }
            );
            FF14Utils.showToast(warning, 'warning');
            return;
        }

        this.elements.dialogTitle.textContent = FF14Utils.getI18nText('newListDialogTitle', 'New List');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);
        const formGroup = SecurityUtils.createFormGroup({
            label: FF14Utils.getI18nText('listNameLabel', 'List Name:'),
            inputId: 'newListName',
            placeholder: FF14Utils.getI18nText('enterListNamePlaceholder', 'Enter list name'),
            maxLength: TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH
        });
        // Add autofocus to the input for better UX with ModalManager
        const input = formGroup.querySelector('input');
        if (input) input.setAttribute('autofocus', '');

        this.elements.dialogBody.appendChild(formGroup);

        this.elements.dialogConfirm.onclick = () => {
            const input = document.getElementById('newListName');
            const rawName = input.value.trim();

            // Validate and sanitize input
            if (!SecurityUtils.validateTextLength(rawName, 1, TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH)) {
                FF14Utils.showToast(FF14Utils.getI18nText('invalidListNameError', 'List name length does not meet requirements'), 'error');
                return;
            }

            const name = rawName;

            if (name) {
                const result = this.listManager.createList(name);
                if (result.success) {
                    this.loadLists();
                    this.switchToList(result.listId);
                    this.hideDialog();
                    FF14Utils.showToast(FF14Utils.getI18nText('listCreatedNotification', 'List created'), 'success');
                } else {
                    FF14Utils.showToast(result.message, 'error');
                }
            }
        };

        this.showDialog();
    }

    showRenameListDialog() {
        const currentList = this.listManager.getList(this.currentListId);

        this.elements.dialogTitle.textContent = FF14Utils.getI18nText('renameListDialogTitle', 'Rename List');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);
        const formGroup = SecurityUtils.createFormGroup({
            label: FF14Utils.getI18nText('newNameLabel', 'New Name:'),
            inputId: 'renameListInput',
            value: currentList.name,
            maxLength: TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH
        });
        // Add autofocus to the input
        const input = formGroup.querySelector('input');
        if (input) input.setAttribute('autofocus', '');

        this.elements.dialogBody.appendChild(formGroup);

        this.elements.dialogConfirm.onclick = () => {
            const input = document.getElementById('renameListInput');
            const rawName = input.value.trim();

            // Validate and sanitize input
            if (!SecurityUtils.validateTextLength(rawName, 1, TimedGatheringManager.CONSTANTS.MAX_LIST_NAME_LENGTH)) {
                FF14Utils.showToast(FF14Utils.getI18nText('invalidListNameError', 'List name length does not meet requirements'), 'error');
                return;
            }

            const newName = rawName;

            if (newName && newName !== currentList.name) {
                const result = this.listManager.renameList(this.currentListId, newName);
                if (result.success) {
                    this.loadLists();
                    this.elements.currentListName.textContent = newName;
                    this.hideDialog();
                    FF14Utils.showToast(FF14Utils.getI18nText('listRenamedNotification', 'List renamed'), 'success');
                } else {
                    FF14Utils.showToast(result.message, 'error');
                }
            }
        };

        this.showDialog();

        // Optional: Select text after modal is shown (ModalManager handles focus)
        // Note: 'input' is already declared above; reuse the same reference
        const renameInput = document.getElementById('renameListInput');
        if (renameInput) renameInput.select();
    }

    showDeleteListDialog() {
        const lists = this.listManager.getAllLists();

        if (lists.length <= 1) {
            FF14Utils.showToast(FF14Utils.getI18nText('atLeastOneListWarning', '至少需要保留一個清單'), 'warning');
            return;
        }

        const currentList = this.listManager.getList(this.currentListId);

        this.elements.dialogTitle.textContent = FF14Utils.getI18nText('deleteListDialogTitle', '刪除清單');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);

        const confirmText = document.createElement('p');
        // Updated to use format with placeholder
        confirmText.textContent = FF14Utils.getI18nText(
            'confirmDeleteList',
            'Are you sure you want to delete the list "{name}"?',
            { name: currentList.name }
        );

        const warningText = document.createElement('p');
        warningText.className = 'text-danger';
        warningText.textContent = FF14Utils.getI18nText('operationCannotUndo', 'This operation cannot be undone!');

        this.elements.dialogBody.appendChild(confirmText);
        this.elements.dialogBody.appendChild(warningText);

        this.elements.dialogConfirm.onclick = () => {
            const result = this.listManager.deleteList(this.currentListId);
            if (result.success) {
                const remainingLists = this.listManager.getAllLists();
                this.loadLists();
                if (remainingLists.length > 0) {
                    this.switchToList(remainingLists[0].id);
                }
                this.hideDialog();
                FF14Utils.showToast(FF14Utils.getI18nText('listDeletedNotification', 'List deleted'), 'success');
            } else {
                FF14Utils.showToast(result.message, 'error');
            }
        };

        this.showDialog();
    }

    clearCurrentList() {
        const list = this.listManager.getList(this.currentListId);

        if (!list || list.items.length === 0) {
            FF14Utils.showToast(FF14Utils.getI18nText('listAlreadyEmptyInfo', 'List is already empty'), 'info');
            return;
        }

        this.elements.dialogTitle.textContent = FF14Utils.getI18nText('clearListDialogTitle', '清空清單');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);

        const confirmText = document.createElement('p');
        // Updated to use format with placeholder
        confirmText.textContent = FF14Utils.getI18nText(
            'confirmClearList',
            'Are you sure you want to clear the list "{name}"?',
            { name: list.name }
        );

        const itemCountText = document.createElement('p');
        // Updated to use format with placeholder
        itemCountText.textContent = FF14Utils.getI18nText(
            'willRemoveItems',
            'Will remove {count} items',
            { count: list.items.length }
        );

        this.elements.dialogBody.appendChild(confirmText);
        this.elements.dialogBody.appendChild(itemCountText);

        this.elements.dialogConfirm.onclick = () => {
            this.listManager.clearList(this.currentListId);
            this.updateListDisplay();
            this.refreshCardButtons();
            this.hideDialog();
            FF14Utils.showToast(FF14Utils.getI18nText('listClearedNotification', 'List cleared'), 'success');
        };

        this.showDialog();
    }

    generateMacro() {
        const list = this.listManager.getList(this.currentListId);

        if (!list || list.items.length === 0) {
            FF14Utils.showToast(FF14Utils.getI18nText('emptyListNoMacroWarning', 'List is empty, cannot generate macro'), 'warning');
            return;
        }

        const options = {
            includeClear: this.elements.includeClearCmd.checked,
            sortByTime: this.elements.sortByTime.checked
        };

        const macro = this.macroExporter.generate(list.items, options);

        const skippedCount = list.items.filter(item => {
            const schedule = TimeCalculator.parseSchedule(item.time, item.duration);
            return !schedule || schedule.allDay;
        }).length;
        if (!macro) {
            this.elements.macroText.value = '';
            this.elements.macroOutput.style.display = 'none';
            FF14Utils.showToast(FF14Utils.getI18nText('noScheduledItems', '清單沒有可設定鬧鐘的採集時段'), 'info');
            return;
        }
        if (skippedCount > 0) {
            FF14Utils.showToast(FF14Utils.getI18nText('macroSkippedItems', '已略過 {count} 個全天或時間無效的項目', { count: skippedCount }), 'info');
        }

        this.elements.macroText.value = macro;
        this.elements.macroOutput.style.display = 'block';

        // 滾動到巨集區域
        this.elements.macroOutput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    copyMacroToClipboard() {
        const macroText = this.elements.macroText.value;

        if (!macroText) {
            FF14Utils.showToast(FF14Utils.getI18nText('noMacroToCopyWarning', 'No macro to copy'), 'warning');
            return;
        }

        navigator.clipboard.writeText(macroText).then(() => {
            FF14Utils.showToast(FF14Utils.getI18nText('macroCopiedNotification', 'Macro copied to clipboard'), 'success');

            // 暫時改變按鈕文字
            // Store original button content
            const originalIcon = this.elements.copyMacroBtn.querySelector('.btn-icon')?.textContent || '📋';
            const originalText = this.elements.copyMacroBtn.textContent.replace(originalIcon, '').trim();

            // Update button safely
            SecurityUtils.updateButtonContent(this.elements.copyMacroBtn, '✔️', FF14Utils.getI18nText('copiedButton', 'Copied!'));

            setTimeout(() => {
                // Restore original content
                SecurityUtils.updateButtonContent(this.elements.copyMacroBtn, originalIcon, originalText || FF14Utils.getI18nText('copyMacroButton', 'Copy to Clipboard'));
            }, 2000);
        }).catch(err => {
            console.error('複製失敗:', err);
            FF14Utils.showToast(FF14Utils.getI18nText('copyFailedError', 'Copy failed, please select and copy manually'), 'error');
        });
    }

    showImportDialog() {
        this.elements.dialogTitle.textContent = FF14Utils.getI18nText('importDialogTitle', 'Import List');
        // Use safe DOM manipulation instead of innerHTML
        SecurityUtils.clearElement(this.elements.dialogBody);

        const formGroup = SecurityUtils.createFormGroup({
            label: FF14Utils.getI18nText('selectFileLabel', 'Select File:'),
            inputId: 'importFile',
            inputType: 'file',
            accept: '.json'
        });

        const helpText = document.createElement('p');
        helpText.className = 'text-muted';
        helpText.textContent = FF14Utils.getI18nText('selectJsonFileHint', 'Select a previously exported JSON file');

        this.elements.dialogBody.appendChild(formGroup);
        this.elements.dialogBody.appendChild(helpText);

        this.elements.dialogConfirm.onclick = () => {
            const fileInput = document.getElementById('importFile');
            const file = fileInput.files[0];

            if (file) {
                this.importFile(file);
            }
        };

        this.showDialog();
    }

    importFile(file) {
        const reader = new FileReader();

        reader.onload = (e) => {
            // ListManager owns the nested validation contract shared with storage/export.
            const parseResult = SecurityUtils.safeJSONParse(e.target.result);

            if (!parseResult.success) {
                console.error('匯入失敗:', parseResult.error);
                FF14Utils.showToast(FF14Utils.getI18nText('fileFormatError', 'File format error') + ': ' + parseResult.error, 'error');
                return;
            }

            const result = this.listManager.importLists(parseResult.data);

            if (result.success) {
                this.loadLists();
                this.hideDialog();
                FF14Utils.showToast(
                    FF14Utils.getI18nText('listsImportedNotification', 'Successfully imported {count} lists', { count: result.count }),
                    'success'
                );
            } else {
                FF14Utils.showToast(result.message, 'error');
            }
        };

        reader.onerror = () => {
            FF14Utils.showToast(FF14Utils.getI18nText('fileReadFailed', '無法讀取檔案，請重新選取'), 'error');
        };

        reader.readAsText(file);
    }

    exportLists() {
        const data = this.listManager.exportLists();

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `ff14tw_timed_gathering_lists_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);

        FF14Utils.showToast(FF14Utils.getI18nText('listsExportedNotification', 'Lists exported'), 'success');
    }

    showDialog(onClose = null) {
        this.modalManager.show(this.elements.dialogOverlay, {
            onClose: onClose,
            useClass: 'active'
        });
    }

    hideDialog() {
        this.modalManager.hide();
    }

    showLoading(show) {
        this.elements.loadingIndicator.style.display = show ? 'flex' : 'none';
        // 載入完拿掉行內的 display，讓 .gx-cards 的 grid 生效
        this.elements.itemsContainer.style.display = show ? 'none' : '';
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.style.display = 'block';
        this.elements.loadingIndicator.style.display = 'none';
        this.elements.itemsContainer.style.display = 'none';
    }
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    new TimedGatheringManager();
});
