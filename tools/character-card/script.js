// 角色卡產生器的編輯畫面
// 表單 ↔ 狀態（CardState）↔ 畫在 canvas 上的卡片（CardRenderer）：每改一個欄位，狀態先整理過（CardState.normalize）、存起來、再重畫；
// 卡片就是畫面上那張 canvas，之後下載的是同一張。欄位的規則（字數上限、預設值、重點色）在 card-state.js，畫圖在 card-renderer.js，
// 這裡只管畫面與事件。伺服器與職業的清單來自共用的 assets/js/ff14-game-data.js（window.FF14_JOBS、FF14_WORLDS、FF14_TC_WORLDS，只從 window 讀）。
// 手機（768px 以下）五組欄位用分頁切換（script.js 用 hidden 切換面板），電腦五組都顯示；預覽的位置、sticky 與分頁列的顯示都在 style.css。
// 記住：每一次讀寫都由 CardState 包 try/catch；瀏覽器封鎖網站資料時連 window.localStorage 本身都會丟例外，所以取 storage 也包 try，
// 取不到就傳 null（CardState 當成讀不到、寫不進去），這次打開期間照常運作，只是不記住。
// 角色圖：上傳的圖由 card-image.js 縮小、轉成 JPEG（卡片畫的與瀏覽器記住的是同一張：轉出來之後再讀回來才用），位置與縮放存在 state.crops
// （每個版型各一份）。卡片上拖曳（pointer 事件）：滑鼠直接拖；手指從卡片上滑要能捲動頁面，所以只有按了「調整圖片」（調整模式，觸控為主的裝置才有）才拖，
// 其他時候 pointerdown 什麼都不做。上傳、還原都用流水號（imageToken）：同時有好幾次在讀，只有最新的算數。
// 字型：Google Fonts 的中文字型依字分批載入，沒載入的字會退成別的字型，所以每畫一次就看有沒有還沒請求過的字，有就請瀏覽器載入（這一次請求的算一批）；
// 這一批載入完（失敗也算：卡片用備用字型）就重畫一次，不等別批。fontsReady() 等到請求過的每一批都載入完並重畫過：等的時候又請求的也等，
// 先請求的那一批比後請求的慢（後請求的先載完）也一樣，下載、分享、複製之前要等它。
// 輸出（下載圖片、分享、複製圖片、全螢幕大圖）：三顆按鈕先看必填有沒有填（CardState.validate：沒填的在欄位下面寫錯誤、手機切到基本分頁、焦點移到第一個沒填的欄位，不產生圖），
// 再等字型、職業圖示與還原中、上傳中的角色圖都好了（assetsReady()，最多等 EXPORT_WAIT_MS：卡住的請求不能讓按鈕永遠沒反應，逾時就照目前的畫面產生並說一聲）、重畫、轉成 PNG（CardExport，card-export.js）。
// 手機（768px 以下）與觸控為主的裝置按「下載圖片」不直接下載，打開全螢幕大圖（#imageViewer，ModalManager），上面寫「長按圖片即可儲存」（LINE、Facebook 等內建瀏覽器常常不能直接下載）；
// 這些裝置上點一下小卡也看大圖（只是看，不驗證，必填沒填完時大圖裡只有圖與「關閉」）。匯出做到一半再按什麼都不理（exporting）。
// 複製要在點擊的當下就把「之後才會有的圖」（Promise）交給剪貼簿（Safari 要求 clipboard.write 在使用者手勢裡呼叫）。大圖裡的分享用已經做好的檔案，馬上分享，不再等任何東西。
// 底部的分享要等圖做好才呼叫 navigator.share，等太久點擊的使用者手勢就過期了（瀏覽器只給幾秒，丟 NotAllowedError）：這時改開大圖，請使用者按大圖裡的分享（新的一下點擊）。
// 手機打字（表單裡的文字欄、文字框得到焦點；選單不算：不開鍵盤，選完焦點還留在上面）時 #cardTool 加 .is-typing：style.css 把按鈕列收起來、預覽縮小，
// 讓正在打的欄位看得到。換分頁要藏起有焦點的欄位時，先讓它失去焦點（selectTab()：Safari 藏起有焦點的欄位時不一定送 focusout，.is-typing 就收不掉）。
class CharacterCardApp {
    static PHONE_QUERY = '(max-width: 768px)';
    static COARSE_QUERY = '(pointer: coarse)';
    static CLEAR_CONFIRM_MS = 3000;
    // 下載、分享、複製之前，等字型、職業圖示與還原中的角色圖最多等多久（毫秒）：卡住的請求不能讓按鈕永遠沒反應
    static EXPORT_WAIT_MS = 10000;
    // 卡片上拖曳：指標離按下去的地方至少這麼遠（CSS 像素）才算移動；手抖的一兩個像素還是「點一下」（點小卡看大圖）
    static DRAG_SLOP_PX = 4;
    static CUSTOM_WORLD = '__custom';
    static ICON_DIR = '../../assets/images/se/FFXIVJobIcons/';
    // 畫在卡片上、不跟著介面語言換的字
    static MARK = 'FF14.tw';
    static NOTICE = 'FINAL FANTASY XIV © SQUARE ENIX';
    static LEVEL_LABEL = 'Lv';

    // 五組欄位，照分頁與面板的順序
    static TABS = ['basic', 'profile', 'play', 'image', 'style'];
    // 分頁上的鍵盤：方向鍵與 Home／End → 新的位置（超出頭尾時接回另一頭）
    static TAB_MOVES = new Map([
        ['ArrowRight', (index) => index + 1],
        ['ArrowLeft', (index) => index - 1],
        ['Home', () => 0],
        ['End', (index, count) => count - 1]
    ]);

    // 必填的欄位（CardState.validate 的 missing 裡的名字）→ 錯誤的元素 id 與要標成錯誤的欄位 id。
    // 伺服器選了「其他」而沒打字時，焦點會在自己輸入的欄位，所以那個欄位也要指到同一句錯誤
    static ERROR_FIELDS = new Map([
        ['name', { error: 'cardNameError', fields: ['cardName'] }],
        ['world', { error: 'cardWorldError', fields: ['cardWorld', 'cardWorldCustom'] }],
        ['mainJob', { error: 'cardMainJobError', fields: ['cardMainJob'] }]
    ]);
    // 焦點在這些 input 上是在打字（手機的鍵盤多半開著）；沒寫 type 的 input 也是 text。勾選框、單選、滑桿、檔案、顏色與按鈕不算
    static TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'number']);

    // 有字數上限的文字欄位 id → 狀態的鍵（自己輸入的伺服器另外處理：它是 world，而且只有選了「其他」才算數）
    static TEXT_FIELDS = new Map([
        ['cardName', 'name'], ['cardTitle', 'title'], ['cardFcName', 'fcName'], ['cardFcTag', 'fcTag'], ['cardIntro', 'intro'], ['cardContact', 'contact']
    ]);
    // 字數計數：欄位 id → 狀態的鍵（計數的元素是 `${id}Count`）
    static COUNTED_FIELDS = [
        ['cardName', 'name'], ['cardWorldCustom', 'world'], ['cardTitle', 'title'], ['cardFcName', 'fcName'], ['cardFcTag', 'fcTag'],
        ['cardIntro', 'intro'], ['cardContact', 'contact']
    ];

    // 主職選單的分組：職能（限定職業不管職能都放 limited）→ [翻譯鍵, 中文預設文字]
    static ROLES = [
        ['tank', 'char_card_role_tank', '坦克'],
        ['healer', 'char_card_role_healer', '補師'],
        ['melee', 'char_card_role_melee', '近戰'],
        ['ranged', 'char_card_role_ranged', '遠程'],
        ['magic', 'char_card_role_magic', '法系'],
        ['crafting', 'char_card_role_crafting', '生產'],
        ['gathering', 'char_card_role_gathering', '採集'],
        ['limited', 'char_card_role_limited', '限定']
    ];
    // 喜歡的內容（CardState.LIKES 的鍵）→ [翻譯鍵, 中文預設文字]；翻譯鍵一律寫成完整的字串（tests/scripts.test.js 才掃得到），不用組的
    static LIKES = {
        msq: ['char_card_like_msq', '主線劇情'],
        leveling: ['char_card_like_leveling', '練等'],
        trials: ['char_card_like_trials', '討伐殲滅戰'],
        savage: ['char_card_like_savage', '零式'],
        ultimate: ['char_card_like_ultimate', '絕境戰'],
        alliance: ['char_card_like_alliance', '聯盟任務'],
        pvp: ['char_card_like_pvp', 'PvP'],
        crafting: ['char_card_like_crafting', '生產'],
        gathering: ['char_card_like_gathering', '採集'],
        treasure: ['char_card_like_treasure', '寶圖'],
        deepDungeon: ['char_card_like_deep_dungeon', '深層迷宮'],
        housing: ['char_card_like_housing', '房屋'],
        glamour: ['char_card_like_glamour', '幻化'],
        photo: ['char_card_like_photo', '拍照'],
        roleplay: ['char_card_like_roleplay', '角色扮演'],
        fishing: ['char_card_like_fishing', '釣魚']
    };
    // 角色圖狀態那一行寫的句子（setImageStatus 的名字）→ [翻譯鍵, 中文預設文字]；翻譯鍵一律寫成完整的字串，不用組的
    static IMAGE_STATUS = new Map([
        ['processing', ['char_card_image_processing', '處理中…']],
        ['uploaded', ['char_card_image_uploaded', '已上傳']],
        ['not_saved', ['char_card_image_not_saved', '這張圖太大，這次不會記住，重新整理後要再上傳。']],
        ['failed', ['char_card_image_failed', '這個檔案讀不出來，請換一張圖片。']],
        ['removed', ['char_card_image_removed', '已移除圖片']],
        ['restore_failed', ['char_card_image_restore_failed', '上次的圖片讀不出來，請重新上傳。']]
    ]);
    // 遊玩時段的日子與時段：form 是表單上的全名（勾選框的名稱），card 是畫在卡片上的短標籤（英文的全名縮在卡片上小到看不清）
    static DAY_LABELS = {
        weekday: { form: ['char_card_day_weekday', '平日'], card: ['char_card_card_day_weekday', '平日'] },
        weekend: { form: ['char_card_day_weekend', '假日'], card: ['char_card_card_day_weekend', '假日'] }
    };
    static SLOT_LABELS = {
        morning: { form: ['char_card_slot_morning', '早上'], card: ['char_card_card_slot_morning', '早上'] },
        afternoon: { form: ['char_card_slot_afternoon', '下午'], card: ['char_card_card_slot_afternoon', '下午'] },
        evening: { form: ['char_card_slot_evening', '晚上'], card: ['char_card_card_slot_evening', '晚上'] },
        lateNight: { form: ['char_card_slot_late_night', '深夜'], card: ['char_card_card_slot_late_night', '深夜'] }
    };

    constructor() {
        this.jobs = window.FF14_JOBS;
        let storage;
        try {
            storage = window.localStorage;
        } catch (error) {
            storage = null;
        }
        this.storage = storage;
        const loaded = CardState.load(this.storage, this.jobs);
        this.state = loaded.state;

        // 職業圖示：職業鍵 → { image }，每個只載入一次（載入失敗也留著，不再請求）
        this.icons = new Map();
        // 已經請求過的字型：字型字串 → 請求過的字（Set）。fontBatches 是還在載入的字型批次（見 requestFonts()），每一批載完並重畫後自己拿掉
        this.fontChars = new Map();
        this.fontBatches = new Set();
        this.clearTimer = null;
        // 還在載入的職業圖示：每一個是載入完（成功或失敗）就解決的 Promise，下載、分享、複製之前要等它們
        this.iconLoads = new Set();
        // 輸出：exporting 是匯出做到一半（再按什麼都不理）；errors 是現在寫著錯誤的必填欄位（ERROR_FIELDS 的鍵）；
        // viewerState 是大圖開著時的 { url（這一張圖的 object URL）, file（大圖裡分享用的檔案，必填沒填完時是 null）, title }，沒開是 null；
        // suppressClick 是剛才在卡片上拖曳移動了圖片，放開之後的那一下 click 不算點一下
        this.exporting = false;
        this.errors = new Set();
        this.viewerState = null;
        this.suppressClick = false;
        // 角色圖：image 是畫卡片用的 { source, width, height }（縮過、轉成 JPEG 再讀回來的那一張）或 null；imageToken 是上傳與還原的流水號
        // （每開始一次、圖片拿掉與清除全部都加一，慢的那一次回來發現流水號變了就不算）；imageLoad 是還在讀的上傳（只有最新的一次算數，所以只記它）：
        // 那一次的 Promise，沒有是 null，下載、分享、複製之前要等它讀完；imageWaits 是正在等它的匯出（imageSettled()），imageLoad 一換（見 setImageLoad()）就叫醒；
        // imageStatus 是狀態那一行現在寫的句子（IMAGE_STATUS 的名字，null 是空的，換語言時照它重寫）；adjusting 是調整模式；
        // drag 是拖曳到一半的狀態 { pointerId, x, y, crop, moved（離按下去的地方超過 DRAG_SLOP_PX 了嗎）}，沒在拖是 null
        this.image = null;
        this.imageToken = 0;
        this.imageLoad = null;
        this.imageWaits = new Set();
        this.imageStatus = null;
        this.adjusting = false;
        this.drag = null;

        const byId = (id) => document.getElementById(id);
        this.elements = {
            tool: byId('cardTool'),
            form: byId('cardForm'),
            tabs: byId('cardTabs'),
            name: byId('cardName'),
            world: byId('cardWorld'),
            worldCustomGroup: byId('cardWorldCustomGroup'),
            worldCustom: byId('cardWorldCustom'),
            mainJob: byId('cardMainJob'),
            level: byId('cardLevel'),
            subJobs: byId('cardSubJobs'),
            subJobsCount: byId('cardSubJobsCount'),
            title: byId('cardTitle'),
            fcName: byId('cardFcName'),
            fcTag: byId('cardFcTag'),
            gc: byId('cardGc'),
            hours: byId('cardHours'),
            likes: byId('cardLikes'),
            likesCount: byId('cardLikesCount'),
            looking: byId('cardLooking'),
            intro: byId('cardIntro'),
            contact: byId('cardContact'),
            accentAuto: byId('accentAuto'),
            accentCustom: byId('accentCustom'),
            accentColor: byId('accentColor'),
            clearAll: byId('clearAll'),
            canvas: byId('cardCanvas'),
            imageInput: byId('cardImageInput'),
            imageStatus: byId('cardImageStatus'),
            imageZoom: byId('imageZoom'),
            imageZoomValue: byId('imageZoomValue'),
            imageCenter: byId('imageCenter'),
            imageFill: byId('imageFill'),
            imageRemove: byId('imageRemove'),
            imageAdjust: byId('imageAdjust'),
            downloadCard: byId('downloadCard'),
            shareCard: byId('shareCard'),
            copyCard: byId('copyCard'),
            lineTip: byId('lineTip'),
            lineTipLink: byId('lineTipLink'),
            viewer: byId('imageViewer'),
            viewerImage: byId('viewerImage'),
            viewerDownload: byId('viewerDownload'),
            viewerShare: byId('viewerShare'),
            viewerClose: byId('viewerClose')
        };
        this.formatButtons = new Map([['landscape', byId('formatLandscape')], ['portrait', byId('formatPortrait')]]);
        this.likeChips = this.chipsOf(this.elements.likes, 'like');
        this.lookingChips = this.chipsOf(this.elements.looking, 'looking');
        this.worldNames = new Set([...window.FF14_TC_WORLDS, ...window.FF14_WORLDS.worlds]);

        this.buildWorldSelect();
        this.buildJobSelect();
        this.buildSubJobs();
        this.bindEvents();
        this.initTabs();
        this.initImage();
        this.initExport();
        this.relabel();
        this.syncForm();
        this.render();
        // 存著的圖片讀回來（讀好重畫一次，讀不出來就丟掉）。ready：第一次畫好、字型載入完並重畫過、存著的圖片讀回來了（失敗也算）
        this.restored = this.restoreImage(loaded.image);
        this.ready = Promise.all([this.restored, this.fontsReady()]).then(() => undefined);
    }

    t(key, fallback, params) {
        return FF14Utils.getI18nText(key, fallback, params);
    }

    get lang() {
        return window.i18n.getCurrentLanguage();
    }

    // 職業名稱，介面語言沒有就用中文
    nameOf(job) {
        return job.names[this.lang] || job.names.zh;
    }

    // 一組按鈕：data-<attribute> 的值 → 按鈕。querySelectorAll() 回傳 NodeList：沒有 map、filter、find 這些陣列的方法，先 Array.from()
    chipsOf(group, attribute) {
        return new Map(Array.from(group.querySelectorAll('button'), (chip) => [chip.dataset[attribute], chip]));
    }

    // ---------- 建選單與按鈕（文字由 relabel() 照介面語言寫） ----------

    // 伺服器：選擇伺服器、繁中服一組、國際服一組（FF14_WORLDS.worlds 照共用資料的順序）、其他（自己輸入）
    buildWorldSelect() {
        const select = this.elements.world;
        select.textContent = '';
        const append = (parent, tag, value) => {
            const node = document.createElement(tag);
            if (value !== undefined) node.setAttribute('value', value);
            parent.appendChild(node);
            return node;
        };
        const fill = (group, worlds) => {
            for (const world of worlds) append(group, 'option', world).textContent = world;
        };
        const placeholder = append(select, 'option', '');
        const tcGroup = append(select, 'optgroup');
        fill(tcGroup, window.FF14_TC_WORLDS);
        const globalGroup = append(select, 'optgroup');
        fill(globalGroup, window.FF14_WORLDS.worlds);
        const custom = append(select, 'option', CharacterCardApp.CUSTOM_WORLD);
        this.worldParts = { placeholder, tcGroup, globalGroup, custom };
    }

    // 主職：選擇主職、依職能分 8 組（限定職業放限定），選項的 value 是職業鍵
    buildJobSelect() {
        const select = this.elements.mainJob;
        select.textContent = '';
        this.jobPlaceholder = document.createElement('option');
        this.jobPlaceholder.setAttribute('value', '');
        select.appendChild(this.jobPlaceholder);
        this.jobGroups = new Map();
        for (const [role] of CharacterCardApp.ROLES) {
            const group = document.createElement('optgroup');
            select.appendChild(group);
            this.jobGroups.set(role, group);
        }
        this.jobOptions = new Map();
        for (const job of this.jobs) {
            const option = document.createElement('option');
            option.setAttribute('value', job.key);
            this.jobGroups.get(job.limited ? 'limited' : job.role).appendChild(option);
            this.jobOptions.set(job.key, option);
        }
    }

    // 其他職業：每個職業一顆切換按鈕，照共用資料的順序
    buildSubJobs() {
        const group = this.elements.subJobs;
        group.textContent = '';
        this.subJobChips = new Map();
        for (const job of this.jobs) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip';
            chip.dataset.job = job.key;
            chip.setAttribute('aria-pressed', 'false');
            group.appendChild(chip);
            this.subJobChips.set(job.key, chip);
        }
    }

    // ---------- 事件 ----------

    bindEvents() {
        const { form } = this.elements;
        // 表單永遠不送出：在文字欄按 Enter 不會換頁
        form.addEventListener('submit', (event) => event.preventDefault());
        form.addEventListener('input', (event) => this.handleInput(event));
        form.addEventListener('change', (event) => this.handleChange(event));

        const { LIMITS } = CardState;
        this.bindChips(this.elements.subJobs, 'job', (key) => this.toggleItem('subJobs', key, { max: LIMITS.subJobs, locked: this.state.mainJob }));
        this.bindChips(this.elements.likes, 'like', (key) => this.toggleItem('likes', key, { max: LIMITS.likes }));
        this.bindChips(this.elements.looking, 'looking', (key) => this.toggleItem('looking', key));
        for (const [format, button] of this.formatButtons) button.addEventListener('click', () => this.update({ format }));

        this.elements.clearAll.addEventListener('click', () => this.handleClear());

        // 角色圖：按鈕，與卡片上的拖曳（pointer 事件：按下去、移動、放開、被取消、抓取被拿走都要結束這一次拖曳）
        const { canvas, imageCenter, imageFill, imageRemove, imageAdjust } = this.elements;
        imageCenter.addEventListener('click', () => this.setCrop({ x: 0, y: 0 }, { save: true }));
        imageFill.addEventListener('click', () => this.setCrop({ x: 0, y: 0, zoom: 1 }, { save: true }));
        imageRemove.addEventListener('click', () => this.removeImage());
        imageAdjust.addEventListener('click', () => this.setAdjusting(!this.adjusting));
        canvas.addEventListener('pointerdown', (event) => this.startDrag(event));
        canvas.addEventListener('pointermove', (event) => this.moveDrag(event));
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, (event) => this.endDrag(event));
        // 點一下小卡看大圖（用大圖的裝置）：卡片不是按鈕，鍵盤的人用「下載圖片」
        canvas.addEventListener('click', () => this.handleCanvasClick());

        // 輸出：三顆按鈕與大圖裡的分享、關閉
        const { downloadCard, shareCard, copyCard, viewerShare, viewerClose } = this.elements;
        downloadCard.addEventListener('click', () => this.handleDownload());
        shareCard.addEventListener('click', () => this.handleShare());
        copyCard.addEventListener('click', () => this.handleCopy());
        viewerShare.addEventListener('click', () => this.shareFromViewer());
        viewerClose.addEventListener('click', () => this.closeViewer());

        // 手機打字：焦點進了文字欄、文字框就加 .is-typing，離開時拿掉（移到另一個這種欄位時不拿掉；選單不算）。focusin、focusout 會冒泡，所以掛在表單上
        form.addEventListener('focusin', (event) => {
            if (this.isTypingField(event.target)) this.elements.tool.classList.add('is-typing');
        });
        form.addEventListener('focusout', (event) => {
            if (!(form.contains(event.relatedTarget) && this.isTypingField(event.relatedTarget))) this.elements.tool.classList.remove('is-typing');
        });

        // 切換語言：靜態的文字由 I18nManager 換，這裡換 JS 畫的（選項、按鈕、計數、勾選框的名稱），再用新的語言重畫卡片；選的值不變。
        // 大圖開著時，圖的說明（alt）是卡片現在的說明，跟著換（圖本身是這一張的快照）
        window.i18n.onLanguageChange(() => {
            this.relabel();
            this.render();
            if (this.viewerState !== null) this.elements.viewerImage.setAttribute('alt', this.elements.canvas.getAttribute('aria-label') ?? '');
        });
    }

    // 焦點在這個元素上是在打字嗎：文字相關的 input 與文字框。選單不算：它不開鍵盤，Android 與電腦的 Chrome 選完之後焦點還留在選單上，
    // 算的話選完最後一個必填欄位（主職）之後 .is-typing 一直關不掉，按鈕列一直收著
    isTypingField(element) {
        if (!element || typeof element.tagName !== 'string') return false;
        if (element.tagName === 'TEXTAREA') return true;
        return element.tagName === 'INPUT' && CharacterCardApp.TEXT_INPUT_TYPES.has((element.getAttribute('type') || 'text').toLowerCase());
    }

    // 一組切換按鈕：事件委派在群組上，點到按鈕（不能按的瀏覽器本來就不送 click）就把它的值交給 onToggle
    bindChips(group, attribute, onToggle) {
        group.addEventListener('click', (event) => {
            const chip = event.target.closest('button');
            if (!chip || chip.disabled === true || !group.contains(chip)) return;
            const value = chip.dataset[attribute];
            if (value !== undefined) onToggle(value);
        });
    }

    // 文字欄、等級與重點色的色票：每打一個字（或動一下）就更新。不把值寫回欄位（使用者正在打），一句話自我介紹的換行除外
    handleInput(event) {
        const target = event.target;
        if (CharacterCardApp.TEXT_FIELDS.has(target.id)) {
            if (target.id === 'cardIntro') this.keepOneLine(target);
            this.update({ [CharacterCardApp.TEXT_FIELDS.get(target.id)]: target.value });
        } else if (target.id === 'cardWorldCustom') {
            this.update({ world: target.value });
        } else if (target.id === 'cardLevel') {
            this.update({ level: target.value });
        } else if (target.id === 'accentColor') {
            this.update({ accent: target.value });
        } else if (target.id === 'imageZoom') {
            // 拖滑桿的過程只重畫，放開（change）才存
            const zoom = Number(target.value) / 100;
            if (Number.isFinite(zoom)) this.setCrop({ zoom }, { save: false });
        }
    }

    // 選單、單選與勾選框：選好才更新；等級欄離開時才把沒整理過的字（150、空的）改成整理過的值
    handleChange(event) {
        const target = event.target;
        if (target.id === 'cardWorld') {
            this.chooseWorld(target.value);
        } else if (target.id === 'cardMainJob') {
            this.update({ mainJob: target.value });
        } else if (target.id === 'cardGc') {
            this.update({ gc: target.value });
        } else if (target.id === 'cardLevel') {
            target.value = String(this.state.level);
        } else if (target.id === 'accentAuto' || target.id === 'accentCustom') {
            if (target.checked === true) this.update({ accent: target.id === 'accentAuto' ? 'auto' : this.elements.accentColor.value });
        } else if (target.id === 'imageZoom') {
            CardState.save(this.storage, this.state);
        } else if (target.id === 'cardImageInput') {
            this.chooseImage(target);
        } else if (target.getAttribute('type') === 'checkbox' && this.elements.hours.contains(target)) {
            this.toggleHour(target);
        }
    }

    // 一句話自我介紹是一句話：換行（\r\n、\r、\n）一律換成空白，卡片自己照寬度折行
    keepOneLine(textarea) {
        const value = textarea.value.replace(/\r\n|\r|\n/g, ' ');
        if (value !== textarea.value) textarea.value = value;
    }

    // 選了伺服器：「其他」就讓自己輸入的欄位出現、焦點移進去，伺服器是欄位裡的字（還沒打就是空的）；選清單裡的就藏起來
    chooseWorld(value) {
        const { worldCustomGroup, worldCustom } = this.elements;
        if (value === CharacterCardApp.CUSTOM_WORLD) {
            worldCustomGroup.hidden = false;
            worldCustom.focus();
            this.update({ world: String(worldCustom.value ?? '') });
        } else {
            worldCustomGroup.hidden = true;
            this.update({ world: value });
        }
    }

    // 其他職業、喜歡的內容、在找什麼：已經選了就拿掉，沒選且沒滿（max）也不是鎖住的（locked：主職）才加上去
    toggleItem(field, key, { max = Infinity, locked = null } = {}) {
        const list = this.state[field];
        if (list.includes(key)) this.update({ [field]: list.filter((item) => item !== key) });
        else if (list.length < max && key !== locked) this.update({ [field]: [...list, key] });
    }

    toggleHour(box) {
        const value = box.getAttribute('value');
        const hours = this.state.hours.filter((item) => item !== value);
        if (box.checked === true) hours.push(value);
        this.update({ hours });
    }

    // 改了狀態：整理、存起來、更新由狀態算出來的控制項（按鈕、計數、重點色）、重畫卡片
    update(patch) {
        this.state = CardState.normalize({ ...this.state, ...patch }, this.jobs);
        CardState.save(this.storage, this.state);
        this.syncDerived();
        this.syncErrors();
        this.render();
    }

    // ---------- 清除全部 ----------

    // 第一次按：按鈕變成「再按一次清除」，3 秒內再按才清；3 秒沒再按就變回原本的字。不用 confirm()
    handleClear() {
        if (this.clearTimer === null) {
            this.clearTimer = window.setTimeout(() => this.disarmClear(), CharacterCardApp.CLEAR_CONFIRM_MS);
            this.renderClearButton();
            return;
        }
        this.disarmClear();
        this.clearAll();
    }

    disarmClear() {
        if (this.clearTimer !== null) {
            window.clearTimeout(this.clearTimer);
            this.clearTimer = null;
        }
        this.renderClearButton();
    }

    // 清空欄位、角色圖（還在讀的也不算了）與記憶（欄位與圖片兩個鍵），回到什麼都沒填的卡片
    clearAll() {
        CardState.clear(this.storage);
        this.state = CardState.defaults();
        this.dropImage();
        this.setImageStatus(null);
        this.hideErrors();
        this.syncForm();
        this.render();
        FF14Utils.showToast(this.t('char_card_cleared', '已清除全部資料'));
    }

    renderClearButton() {
        const armed = this.clearTimer !== null;
        const button = this.elements.clearAll;
        button.textContent = armed ? this.t('char_card_clear_confirm', '再按一次清除') : this.t('char_card_clear_all', '清除全部');
        button.classList.toggle('btn-danger', armed);
        button.classList.toggle('btn-secondary', !armed);
    }

    // ---------- 分頁（手機） ----------

    initTabs() {
        this.tabs = CharacterCardApp.TABS.map((key) => ({ key, tab: document.getElementById(`tab-${key}`), panel: document.getElementById(`panel-${key}`) }));
        this.elements.tabs.addEventListener('click', (event) => {
            const tab = event.target.closest('[role="tab"]');
            if (tab) this.selectTab(tab.dataset.tab);
        });
        this.elements.tabs.addEventListener('keydown', (event) => this.moveTab(event));
        // 沒有 matchMedia 的環境當成電腦（五組都顯示）
        this.phone = window.matchMedia ? window.matchMedia(CharacterCardApp.PHONE_QUERY) : null;
        if (this.phone) this.phone.addEventListener('change', () => this.followViewport());
        this.followViewport();
    }

    isPhone() {
        return this.phone !== null && this.phone.matches === true;
    }

    // 視窗跨過 768px（也在一打開時跑一次）。這個監聽在瀏覽器把焦點從剛被藏起來的元素丟掉之前執行，所以焦點還在的時候搬得動：
    // 變成手機：焦點在哪一組的欄位裡就切到那一組，不然切到基本，焦點不會掉到頁面最上面；
    // 變成電腦：五組都顯示；焦點在分頁上（電腦沒有分頁列）就移到那一組
    followViewport() {
        const active = document.activeElement;
        if (this.isPhone()) {
            const inside = this.tabs.find(({ panel }) => panel.contains(active));
            this.selectTab(inside ? inside.key : 'basic');
            return;
        }
        const onTab = this.tabs.find(({ tab }) => tab === active);
        for (const { panel } of this.tabs) panel.hidden = false;
        if (onTab) onTab.panel.focus();
    }

    /**
     * 切到一組欄位：選中的分頁 aria-selected="true"、tabindex="0"、.active，其他的 tabindex="-1"；手機只顯示選中的那一組（其他的 hidden），電腦五組都顯示。
     * @param {string} key - basic、profile、play、image、style（其他的不理）
     * @param {{focus?: boolean}} options - focus 是 true 時焦點移到那個分頁（鍵盤）
     */
    selectTab(key, { focus = false } = {}) {
        const chosen = this.tabs.find((item) => item.key === key);
        if (!chosen) return;
        const phone = this.isPhone();
        // 手機要藏起來的那幾組裡有焦點的話，藏起來之前先讓焦點離開：Chrome 藏起有焦點的欄位時會丟掉焦點並送 focusout，Safari 不一定，
        // 那樣 .is-typing 沒人拿掉，按鈕列就一直收著。blur() 會送 focusout（拿掉 .is-typing），這裡不靠它一定送，再拿一次。電腦五組都顯示，沒有要藏的
        const active = document.activeElement;
        if (phone && this.tabs.some(({ key: tabKey, panel }) => tabKey !== key && panel.contains(active))) {
            active.blur();
            this.elements.tool.classList.remove('is-typing');
        }
        for (const { key: tabKey, tab, panel } of this.tabs) {
            const on = tabKey === key;
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            tab.setAttribute('tabindex', on ? '0' : '-1');
            tab.classList.toggle('active', on);
            panel.hidden = phone && !on;
        }
        // 調整模式只在圖片那一組：切到別組就結束（不然卡片一直攔截手指，手機上滑不動頁面）
        if (key !== 'image') this.setAdjusting(false);
        if (focus) chosen.tab.focus();
    }

    // 分頁上的方向鍵與 Home／End：移到那個分頁並切換過去（WAI-ARIA 的自動啟用），頭尾相接；按著 Alt、Ctrl、⌘ 時不處理（那是瀏覽器的快速鍵）
    moveTab(event) {
        const tab = event.target.closest('[role="tab"]');
        const move = CharacterCardApp.TAB_MOVES.get(event.key);
        if (!tab || !move || event.altKey || event.ctrlKey || event.metaKey) return;
        const keys = CharacterCardApp.TABS;
        const next = move(keys.indexOf(tab.dataset.tab), keys.length);
        event.preventDefault();
        this.selectTab(keys[(next + keys.length) % keys.length], { focus: true });
    }

    // ---------- 把狀態寫進控制項 ----------

    // 把整份狀態寫進每一個控制項（打開頁面與清除全部時）。平常使用者正在打字，不寫回文字欄
    syncForm() {
        const { state, elements } = this;
        elements.name.value = state.name;
        elements.title.value = state.title;
        elements.fcName.value = state.fcName;
        elements.fcTag.value = state.fcTag;
        elements.intro.value = state.intro;
        elements.contact.value = state.contact;
        elements.level.value = String(state.level);
        elements.mainJob.value = state.mainJob;
        elements.gc.value = state.gc;
        this.syncWorld();
        for (const box of elements.hours.querySelectorAll('input')) box.checked = state.hours.includes(box.getAttribute('value'));
        this.syncDerived();
        elements.accentColor.value = CardState.accentOf(state, this.jobs);
    }

    // 伺服器：沒選或在兩份清單裡的就選那一項，自己輸入的欄位藏起來；不在清單裡的選「其他」，欄位出現並帶著那個字
    syncWorld() {
        const { world, worldCustom, worldCustomGroup } = this.elements;
        const name = this.state.world;
        if (name === '' || this.worldNames.has(name)) {
            world.value = name;
            worldCustom.value = '';
            worldCustomGroup.hidden = true;
        } else {
            world.value = CharacterCardApp.CUSTOM_WORLD;
            worldCustom.value = name;
            worldCustomGroup.hidden = false;
        }
    }

    // 由狀態算出來的控制項：切換按鈕（按下與不能按）、字數與個數的計數、重點色的單選與色票、版型的按鈕。不碰文字欄，使用者正在打字
    syncDerived() {
        const { state } = this;
        const { LIMITS } = CardState;
        this.syncChips(this.subJobChips, state.subJobs, LIMITS.subJobs, state.mainJob);
        this.syncChips(this.likeChips, state.likes, LIMITS.likes);
        this.syncChips(this.lookingChips, state.looking, Infinity);
        for (const [format, button] of this.formatButtons) {
            const on = state.format === format;
            button.setAttribute('aria-pressed', on ? 'true' : 'false');
            button.classList.toggle('active', on);
        }
        this.syncImage();
        const custom = state.accent !== 'auto';
        this.elements.accentAuto.checked = !custom;
        this.elements.accentCustom.checked = custom;
        // 跟著職能時色票顯示現在用的顏色；自己選的顏色是使用者剛動過的，不再寫回去（色票開著時寫回去會跳）
        if (!custom) this.elements.accentColor.value = CardState.accentOf(state, this.jobs);
        this.renderCounters();
    }

    // 角色圖的控制項：沒有圖片時縮放、置中、填滿、移除、調整都不能按；滑桿與百分比跟著這個版型的縮放（沒有圖片寫預設的 100%，存著的位置要有圖片才用得上）；
    // 「調整圖片」只有觸控為主的裝置才顯示；卡片有圖片時才有拖曳的游標（.has-image）
    syncImage() {
        const { elements } = this;
        const has = this.image !== null;
        const percent = Math.round((has ? CardState.cropOf(this.state).zoom : 1) * 100);
        for (const control of [elements.imageZoom, elements.imageCenter, elements.imageFill, elements.imageRemove, elements.imageAdjust]) control.disabled = !has;
        elements.imageZoom.value = String(percent);
        elements.imageZoom.setAttribute('aria-valuetext', `${percent}%`);
        elements.imageZoomValue.textContent = `${percent}%`;
        elements.imageAdjust.hidden = !this.isCoarse();
        elements.canvas.classList.toggle('has-image', has);
    }

    // 一組切換按鈕：選了的 aria-pressed 與 .active 一起換；滿了（max）時沒選的都不能按，locked（主職）永遠不能按
    syncChips(chips, selected, max, locked = null) {
        const full = selected.length >= max;
        for (const [key, chip] of chips) {
            const on = selected.includes(key);
            chip.setAttribute('aria-pressed', on ? 'true' : 'false');
            chip.classList.toggle('active', on);
            chip.disabled = key === locked || (!on && full);
        }
    }

    // 「5／21」：以 Unicode 字元計（𠮷 是一個字）。文字欄的計數看欄位現在的字，其他職業與喜歡的內容的計數是選了幾個
    renderCounters() {
        const { LIMITS } = CardState;
        const count = (n, max) => this.t('char_card_count', '{n}／{max}', { n, max });
        for (const [id, key] of CharacterCardApp.COUNTED_FIELDS) {
            const field = document.getElementById(id);
            document.getElementById(`${id}Count`).textContent = count(Array.from(String(field.value ?? '')).length, LIMITS[key]);
        }
        this.elements.subJobsCount.textContent = count(this.state.subJobs.length, LIMITS.subJobs);
        this.elements.likesCount.textContent = count(this.state.likes.length, LIMITS.likes);
    }

    // ---------- 介面語言 ----------

    // JS 畫的文字：選項、其他職業的按鈕、勾選框的名稱、清除全部的按鈕、計數。同一批節點改字，選的值還在
    relabel() {
        const { placeholder, tcGroup, globalGroup, custom } = this.worldParts;
        placeholder.textContent = this.t('char_card_world_placeholder', '選擇伺服器');
        tcGroup.setAttribute('label', this.t('char_card_world_group_tc', '繁中服'));
        globalGroup.setAttribute('label', this.t('char_card_world_group_global', '國際服'));
        custom.textContent = this.t('char_card_world_custom', '其他（自己輸入）');

        this.jobPlaceholder.textContent = this.t('char_card_job_placeholder', '選擇主職');
        for (const [role, key, fallback] of CharacterCardApp.ROLES) this.jobGroups.get(role).setAttribute('label', this.t(key, fallback));
        for (const job of this.jobs) {
            this.jobOptions.get(job.key).textContent = this.nameOf(job);
            this.subJobChips.get(job.key).textContent = this.nameOf(job);
        }

        // 每個時段勾選框的名稱：「平日 晚上」
        for (const box of this.elements.hours.querySelectorAll('input')) {
            const [day, slot] = box.getAttribute('value').split('-');
            box.setAttribute('aria-label', this.t('char_card_hours_cell', '{day} {slot}', {
                day: this.label(CharacterCardApp.DAY_LABELS[day].form),
                slot: this.label(CharacterCardApp.SLOT_LABELS[slot].form)
            }));
        }
        this.renderClearButton();
        this.renderAdjustButton();
        this.renderImageStatus();
        this.renderCounters();
    }

    // [翻譯鍵, 中文預設文字] → 目前介面語言的字
    label([key, fallback]) {
        return this.t(key, fallback);
    }

    // ---------- 角色圖 ----------

    initImage() {
        // 讀圖與建 canvas 交給 CardImage（它不碰 DOM）
        this.imageDeps = {
            loadImage: (input) => this.loadImage(input),
            createCanvas: (width, height) => this.createCanvas(width, height)
        };
        // 觸控為主的裝置才有「調整圖片」；沒有 matchMedia 的環境當成滑鼠
        this.coarse = window.matchMedia ? window.matchMedia(CharacterCardApp.COARSE_QUERY) : null;
        if (this.coarse) this.coarse.addEventListener('change', () => this.followPointer());
    }

    isCoarse() {
        return this.coarse !== null && this.coarse.matches === true;
    }

    // 裝置變成不是觸控為主（例如平板接上滑鼠）：「調整圖片」藏起來，調整模式也要結束，不然卡片一直攔截手指，又沒有「完成」可以按
    followPointer() {
        if (!this.isCoarse()) this.setAdjusting(false);
        this.syncImage();
    }

    // File（或 data URL 字串）→ 解碼好的圖 { source, width, height }。File 先轉成 blob: 網址，圖載入完（成功或失敗）就撤掉：
    // 撤得太早圖會讀不到，不撤會一直占著記憶體。沒有固有大小的圖（沒寫寬高的 SVG）width、height 是 0，由 CardImage 擋下來
    loadImage(input) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const url = typeof input === 'string' ? input : URL.createObjectURL(input);
            const release = () => {
                if (url !== input) URL.revokeObjectURL(url);
            };
            image.onload = () => {
                release();
                resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
            };
            image.onerror = () => {
                release();
                reject(new Error('圖片讀不出來'));
            };
            image.src = url;
        });
    }

    // 縮圖用的 canvas（不放進頁面）
    createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    // 選了檔案（<input type="file"> 的 change）：先拿出檔案再清掉輸入框，同一個檔案再選一次才會有 change；在選檔視窗按取消沒有檔案，什麼都不做。
    // 讀完之前記在 imageLoad：選了截圖馬上按下載的話，要等它（assetsReady()），不然產生的是舊的圖，畫面卻在一會兒之後換成新的那張
    chooseImage(input) {
        const file = input.files && input.files.length > 0 ? input.files[0] : null;
        input.value = '';
        if (file === null) return;
        const load = this.uploadImage(file).finally(() => {
            if (this.imageLoad === load) this.setImageLoad(null);
        });
        this.setImageLoad(load);
    }

    // 上傳中的那一次換了（開始讀一張、讀完、被後選的取代、移除圖片、清除全部）：記下現在的（沒有是 null），叫醒在等的匯出，
    // 讓它們照現在的重新看要不要等。不叫醒的話，已經在等的匯出會一直等一張不算數的圖，等到逾時才產生，還說是字型沒載完
    setImageLoad(load) {
        this.imageLoad = load;
        for (const wake of this.imageWaits) wake();
        this.imageWaits.clear();
    }

    // 等到現在上傳中的那一次讀完，或它換掉了（不算數了）就回來：回來之後由呼叫端（assetsReady()）照 imageLoad 再看一次
    imageSettled() {
        if (this.imageLoad === null) return Promise.resolve();
        return new Promise((resolve) => this.imageWaits.add(resolve));
    }

    /**
     * 上傳一張圖：縮小、轉成 JPEG（CardImage.prepare），再把轉出來的讀回來，卡片畫的、瀏覽器記的都是這一張；新的圖從填滿置中開始
     * （舊的位置與縮放是照上一張調的）。要等好幾個步驟，使用者可能已經選了別張、移除了圖片或清除全部：每個步驟之後看流水號，
     * 不是自己這一次就收手（只有最新的一次算數）。讀不出來時現在的圖片照舊。不丟例外。
     * @param {File} file
     */
    async uploadImage(file) {
        const token = ++this.imageToken;
        this.setImageStatus('processing');
        let prepared;
        let picture;
        try {
            prepared = await CardImage.prepare(file, this.imageDeps);
            if (token !== this.imageToken) return;
            picture = await CardImage.fromDataUrl(prepared.dataUrl, this.imageDeps);
            if (token !== this.imageToken) return;
        } catch (error) {
            // 只有讀圖、縮圖、轉換失敗算「這個檔案讀不出來」；後面換圖、存檔、重畫出的問題不是檔案的錯
            if (token === this.imageToken) this.setImageStatus('failed');
            return;
        }
        this.image = picture;
        this.state = CardState.normalize({ ...this.state, crops: {} }, this.jobs);
        CardState.save(this.storage, this.state);
        this.setImageStatus(this.rememberImage(prepared.dataUrl) ? 'uploaded' : 'not_saved');
        this.syncImage();
        this.render();
    }

    /**
     * 打開頁面時把記住的圖片讀回來。讀不出來（記著的內容壞了）就丟掉並說明，下次打開不會再失敗一次。
     * 讀的時候使用者已經上傳了新的（或移除、清除全部）就不算。不丟例外。
     * @param {string | null} dataUrl - CardState.load 讀到的；沒有是 null
     */
    async restoreImage(dataUrl) {
        if (dataUrl === null) return;
        const token = ++this.imageToken;
        try {
            const picture = await CardImage.fromDataUrl(dataUrl, this.imageDeps);
            if (token !== this.imageToken) return;
            this.image = picture;
        } catch (error) {
            if (token !== this.imageToken) return;
            CardState.saveImage(this.storage, null);
            this.setImageStatus('restore_failed');
        }
        this.syncImage();
        this.render();
    }

    // 記住圖片，回傳「用不著特別說這次記不住」：沒有儲存空間（瀏覽器封鎖網站資料）什麼都記不住，不算這張圖的問題；
    // 有儲存空間卻存不進去（容量已滿）是 false，這時把以前存的那一張也拿掉，不然重新整理之後會冒出已經換掉的舊圖
    rememberImage(dataUrl) {
        if (this.storage === null || CardState.saveImage(this.storage, dataUrl)) return true;
        CardState.saveImage(this.storage, null);
        return false;
    }

    // 移除圖片：回到預設背景，記住的圖片刪掉。按鈕按下去就不能按了，所以焦點移到上傳（鍵盤才接得下去）
    removeImage() {
        if (this.image === null) return;
        this.dropImage();
        CardState.saveImage(this.storage, null);
        this.setImageStatus('removed');
        this.syncImage();
        this.render();
        this.elements.imageInput.focus();
    }

    // 圖片拿掉（移除圖片、清除全部）：還在讀的上傳與還原都不算了（下載也不用等它），檔案輸入清空，拖曳與調整模式結束（卡片不再攔截手指）。呼叫端自己重畫
    dropImage() {
        this.imageToken += 1;
        this.setImageLoad(null);
        this.image = null;
        this.elements.imageInput.value = '';
        this.stopDrag({ save: false });
        this.setAdjusting(false);
    }

    // 狀態那一行：name 是 IMAGE_STATUS 的名字，null 是清空。換語言時照 imageStatus 重寫
    setImageStatus(name) {
        this.imageStatus = name;
        this.renderImageStatus();
    }

    renderImageStatus() {
        const entry = this.imageStatus === null ? undefined : CharacterCardApp.IMAGE_STATUS.get(this.imageStatus);
        this.elements.imageStatus.textContent = entry ? this.label(entry) : '';
    }

    // ---------- 角色圖的位置與縮放、拖曳 ----------

    /**
     * 改這個版型的位置與縮放（patch 蓋在目前的上面，整理過再寫回 state.crops；另一個版型的不動），重畫。
     * 拖曳與拖滑桿的過程 save 是 false，只重畫，放開才存。沒有圖片時什麼都不做。
     * @param {{x?: number, y?: number, zoom?: number}} patch
     * @param {{save: boolean}} options
     */
    setCrop(patch, { save }) {
        if (this.image === null) return;
        const key = CardState.cropKey(this.state);
        const crops = { ...this.state.crops, [key]: { ...CardState.cropOf(this.state), ...patch } };
        this.state = CardState.normalize({ ...this.state, crops }, this.jobs);
        if (save) CardState.save(this.storage, this.state);
        this.syncImage();
        this.render();
    }

    // 調整模式（觸控為主的裝置）：卡片上拖曳才會移動圖片，平常手指在卡片上滑頁面照常捲。卡片加 .is-adjusting（touch-action: none；
    // 要在手指按下去之前就設好才有用，所以按「調整圖片」的當下就加）。按鈕的字說了狀態，不另外用 aria-pressed。結束時拖到一半的也結束
    setAdjusting(on) {
        const next = on === true && this.image !== null;
        if (next === this.adjusting) return;
        this.adjusting = next;
        this.elements.canvas.classList.toggle('is-adjusting', next);
        if (!next) this.stopDrag({ save: true });
        this.renderAdjustButton();
    }

    renderAdjustButton() {
        this.elements.imageAdjust.textContent = this.adjusting
            ? this.t('char_card_image_adjust_done', '完成')
            : this.t('char_card_image_adjust', '調整圖片');
    }

    // 卡片上按下去：有圖片，而且是滑鼠左鍵、或在調整模式（手指、筆）才開始拖。其他情況什麼都不做，也不 preventDefault：手指在卡片上滑，頁面照常捲。
    // 每一次按下去都先把「剛才拖曳過」的記號清掉（上一次拖曳放開之後的 click 沒送到卡片的話，不能讓它擋住這一次的點一下）
    startDrag(event) {
        this.suppressClick = false;
        if (this.image === null) return;
        const mouse = event.pointerType === 'mouse' && event.button === 0;
        if (!mouse && !this.adjusting) return;
        // 拖的時候別的 pointer（另一根手指）按下去不理；同一個 pointer 又按下去，是上一次的放開沒收到，結束它再重新開始
        if (this.drag !== null) {
            if (this.drag.pointerId !== event.pointerId) return;
            this.stopDrag({ save: true });
        }
        try {
            // 抓住這個 pointer：移到卡片外面也繼續收到移動與放開。瀏覽器對已經不在作用的 pointer 會丟例外，抓不到照樣拖
            this.elements.canvas.setPointerCapture(event.pointerId);
        } catch (error) {
            // 不處理
        }
        this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, crop: CardState.cropOf(this.state), moved: false };
        this.elements.canvas.classList.add('is-dragging');
        event.preventDefault();
    }

    // 拖：一律從按下去那一刻的位置與座標算（不是一段一段累加）。滑鼠與手指的座標是 CSS 像素，卡片的座標是 canvas 像素，差 canvas.width / 畫面上的寬度。
    // 卡片藏起來（畫面上的寬度是 0）時不算
    moveDrag(event) {
        const { drag, image } = this;
        if (drag === null || event.pointerId !== drag.pointerId || image === null) return;
        // 滑鼠的按鍵已經放開（buttons 是 0），放開的事件卻沒收到（例如 macOS 上拖到一半按著 Ctrl 跳出右鍵選單，放開被選單吃掉）：
        // 這一次移動不算，拖曳到此為止，照一般的結束存起來，並放掉抓取（不然滑鼠移到哪裡，事件都一直送到卡片上）；
        // 不然滑鼠只是移過卡片，圖片就一直跟著動。手指與筆（調整模式）照舊不看 buttons
        if (event.pointerType === 'mouse' && event.buttons === 0) {
            this.stopDrag({ save: true, release: true });
            return;
        }
        // 離按下去的地方至少 DRAG_SLOP_PX 才算拖曳（放開之後的 click 就不算點一下）；手抖的一兩個像素還是點一下
        if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= CharacterCardApp.DRAG_SLOP_PX) drag.moved = true;
        const { canvas } = this.elements;
        const rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0)) return;
        const scale = canvas.width / rect.width;
        const crop = CardLayout.dragCrop(drag.crop, (event.clientX - drag.x) * scale, (event.clientY - drag.y) * scale, image.width, image.height, canvas.width, canvas.height);
        this.setCrop(crop, { save: false });
    }

    // 放開、被取消、抓取被拿走：結束這一次拖曳（三個事件常常連著來，第二個起 drag 已經是 null，什麼都不做，所以只存一次）
    endDrag(event) {
        if (this.drag !== null && event.pointerId === this.drag.pointerId) this.stopDrag({ save: true });
    }

    // 結束拖曳。save：把現在的位置存起來；release：放掉指標抓取（放開、取消、抓取被拿走時瀏覽器已經放掉了，不用；放開的事件沒收到時還抓著，要自己放）。
    // 拖曳移動了圖片的話，記下來：緊接著放開之後瀏覽器送的那一下 click 是拖曳的收尾，不是點一下（handleCanvasClick 吃掉它）
    stopDrag({ save, release = false }) {
        if (this.drag === null) return;
        const { pointerId, moved } = this.drag;
        this.drag = null;
        this.suppressClick = moved;
        this.elements.canvas.classList.remove('is-dragging');
        if (release) {
            try {
                this.elements.canvas.releasePointerCapture(pointerId);
            } catch (error) {
                // 沒抓著，或瀏覽器認為這個 pointer 已經不在作用：不處理
            }
        }
        if (save) CardState.save(this.storage, this.state);
    }

    // ---------- 畫卡片 ----------

    // 畫面模型：CardRenderer.draw 要的樣子，文字照介面語言。重點色一律來自 CardState.accentOf，這裡不寫顏色；
    // 喜歡的內容照 CardState.LIKES 的順序（不是點選的順序）
    buildModel() {
        const { state } = this;
        const jobOf = (key) => this.jobs.find((job) => job.key === key);
        const main = jobOf(state.mainJob);
        return {
            format: state.format,
            name: state.name,
            title: state.title,
            world: state.world,
            fcTag: state.fcTag,
            job: main ? { name: this.nameOf(main), level: state.level, icon: this.iconOf(main) } : null,
            subJobs: state.subJobs.map(jobOf).filter(Boolean).map((job) => ({ name: this.nameOf(job), icon: this.iconOf(job) })),
            likes: CardState.LIKES.filter((key) => state.likes.includes(key)).map((key) => this.label(CharacterCardApp.LIKES[key])),
            hours: {
                days: CardState.DAYS.map((day) => this.label(CharacterCardApp.DAY_LABELS[day].card)),
                slots: CardState.SLOTS.map((slot) => this.label(CharacterCardApp.SLOT_LABELS[slot].card)),
                on: new Set(state.hours)
            },
            intro: state.intro,
            accent: CardState.accentOf(state, this.jobs),
            image: this.image,
            crop: CardState.cropOf(state),
            levelLabel: CharacterCardApp.LEVEL_LABEL,
            mark: CharacterCardApp.MARK,
            notice: CharacterCardApp.NOTICE
        };
    }

    // 職業的圖示：載入完才給卡片（complete 而且有寬度），載入前與載入失敗是 null（卡片畫名稱的第一個字）。
    // 每個職業只載入一次；載入完重畫，失敗就維持 null、不再請求。還在載入的記在 iconLoads（載完或失敗就拿掉）：下載、分享、複製之前要等它們，
    // 不然圖上畫的是名稱的第一個字，不是圖示
    iconOf(job) {
        if (!job.icon) return null;
        let entry = this.icons.get(job.key);
        if (!entry) {
            const image = new Image();
            entry = { image };
            const loading = new Promise((resolve) => {
                const settle = () => {
                    this.iconLoads.delete(loading);
                    resolve();
                };
                image.onload = () => {
                    settle();
                    this.render();
                };
                image.onerror = settle;
            });
            this.iconLoads.add(loading);
            image.src = `${CharacterCardApp.ICON_DIR}${job.icon}`;
            this.icons.set(job.key, entry);
        }
        return entry.image.complete && entry.image.naturalWidth > 0 ? entry.image : null;
    }

    // 預覽的說明（canvas 的 aria-label）：只寫填了的部分，名字、伺服器、「主職 Lv 等級」；一個都沒填寫沒填資料
    previewLabel() {
        const { state } = this;
        const main = this.jobs.find((job) => job.key === state.mainJob);
        const parts = [state.name.trim(), state.world.trim()].filter((part) => part !== '');
        if (main) parts.push(this.t('char_card_preview_job', '{job} Lv {level}', { job: this.nameOf(main), level: state.level }));
        if (parts.length === 0) return this.t('char_card_preview_empty', '角色卡預覽：還沒填資料');
        return this.t('char_card_preview_label', '角色卡預覽：{parts}', { parts: parts.join(this.t('char_card_preview_sep', '，')) });
    }

    // 畫一次：canvas 的寬高一律是 CardRenderer.SIZES[版型]（設定寬高會清掉畫面並重設 context，上一次的設定不會留下來），
    // CSS 負責縮小顯示（不變形）。畫完看有沒有還沒請求過的字型
    render() {
        const { canvas } = this.elements;
        const model = this.buildModel();
        const size = CardRenderer.SIZES[this.state.format];
        canvas.width = size.width;
        canvas.height = size.height;
        CardRenderer.draw(canvas.getContext('2d'), model);
        canvas.setAttribute('aria-label', this.previewLabel());
        this.requestFonts(model);
    }

    // 請瀏覽器載入畫這張卡片要用的字型與字（只請求還沒請求過的字）。這一次請求的算一批：這一批載完（失敗也算，不丟錯：卡片用備用字型）就重畫一次，
    // 不等別批（慢的中文字型子集不會擋住已經載好的字）；重畫時沒有新的字就不再請求，不會一直畫。每一批記在 fontBatches，重畫完才拿掉，
    // fontsReady() 靠它知道還有哪幾批沒完成。沒有 document.fonts 的瀏覽器什麼都不做
    requestFonts(model) {
        const fonts = document.fonts;
        if (!fonts || typeof fonts.load !== 'function') return;
        const loads = [];
        for (const { font, text } of CardRenderer.fontsFor(model)) {
            let known = this.fontChars.get(font);
            if (!known) {
                known = new Set();
                this.fontChars.set(font, known);
            }
            const fresh = [...new Set(Array.from(text))].filter((char) => !known.has(char));
            if (fresh.length === 0) continue;
            for (const char of fresh) known.add(char);
            loads.push(Promise.resolve(fonts.load(font, fresh.join(''))).catch(() => {}));
        }
        if (loads.length === 0) return;
        const batch = Promise.all(loads)
            .then(() => this.render())
            .finally(() => this.fontBatches.delete(batch));
        this.fontBatches.add(batch);
    }

    // 等到請求過的每一批字型都載入完、卡片用載入好的字型重畫過。不管哪一批先完成，都要等到最慢的那一批；等的時候又請求的（使用者又打了字、換了語言）
    // 也等：每等完一輪就再看一次，直到沒有還在載入的批次為止。下載、分享、複製之前要等它
    async fontsReady() {
        while (this.fontBatches.size > 0) await Promise.all([...this.fontBatches]);
    }

    // ---------- 輸出：下載、分享、複製、全螢幕大圖 ----------

    // 這個瀏覽器能做什麼：分享要能傳 PNG 檔（拿一個真的檔案問 canShare：有的瀏覽器只能分享文字與網址；沒有 File 建構函式的不能分享）、複製要有 ClipboardItem；
    // LINE 的內建瀏覽器多一行「用瀏覽器打開」。瀏覽器的功能不會變，判斷一次就好
    initExport() {
        const { shareCard, copyCard, lineTip, lineTipLink } = this.elements;
        this.viewerModal = new ModalManager();
        const probe = this.makeFile([''], 'card.png');
        this.canShare = probe !== null && CardExport.canShareFiles(window.navigator, probe);
        this.canCopy = CardExport.canCopy(window.navigator, window);
        shareCard.hidden = !this.canShare;
        copyCard.hidden = !this.canCopy;
        if (CardExport.inAppBrowser(window.navigator.userAgent) === 'line') {
            lineTipLink.setAttribute('href', CardExport.externalUrl(window.location.href));
            lineTip.hidden = false;
        }
    }

    // 一個 PNG 檔；沒有 File 建構函式（或建不起來）的瀏覽器是 null
    makeFile(parts, name) {
        if (typeof window.File !== 'function') return null;
        try {
            return new window.File(parts, name, { type: CardExport.PNG_TYPE });
        } catch (error) {
            return null;
        }
    }

    // 手機（768px 以下）與觸控為主的裝置用全螢幕大圖，不直接下載：LINE、Facebook 等內建瀏覽器常常不能直接下載，長按圖片存檔最可靠
    usesViewer() {
        return this.isPhone() || this.isCoarse();
    }

    // 卡片上點一下（click）：用大圖的裝置才看大圖，電腦（寬螢幕、滑鼠）什麼都不做；調整圖片時卡片上的點與拖都是在調整；
    // 拖曳移動了圖片之後放開的那一下 click 是拖曳的收尾（stopDrag 記下來的），不算
    handleCanvasClick() {
        if (this.suppressClick) {
            this.suppressClick = false;
            return;
        }
        if (this.adjusting || !this.usesViewer()) return;
        this.handleEnlarge();
    }

    // 一次只做一件：等字型、轉 PNG 的時候再按（慢的手機會連按），什麼都不做（呼叫端先看 exporting）。任何沒接住的錯誤都告訴使用者，不留在 console。
    // 必填的驗證在 runExport 之前做（同步的，沒過就不算「忙」）
    async runExport(task) {
        this.exporting = true;
        try {
            await task();
        } catch (error) {
            this.toastError('char_card_export_failed', '沒辦法產生圖片，請再試一次。');
        } finally {
            this.exporting = false;
        }
    }

    toastError(key, fallback) {
        FF14Utils.showToast(this.t(key, fallback), 'error');
    }

    // 下載圖片：必填都填了才產生；電腦直接存檔，手機（與觸控為主的裝置）打開全螢幕大圖
    handleDownload() {
        if (this.exporting || !this.validateForExport()) return undefined;
        return this.runExport(async () => {
            const blob = await this.makeBlob();
            const name = CardExport.fileName(this.state.name);
            if (this.usesViewer()) {
                // Safari 與 macOS 的 Firefox 點按鈕不給焦點：先把焦點放在按鈕上，ModalManager 才記得關掉時要回到這裡
                this.elements.downloadCard.focus();
                this.openViewer(blob, name, true);
                return;
            }
            CardExport.download(blob, name, document);
            FF14Utils.showToast(this.t('char_card_downloaded', '已下載 {file}', { file: name }));
        });
    }

    // 點小卡看大圖：只是看，不驗證、不寫錯誤；必填沒填完時大圖裡只有圖與「關閉」（沒有下載檔案與分享）
    handleEnlarge() {
        if (this.exporting) return undefined;
        return this.runExport(async () => {
            const complete = CardState.validate(this.state).ok;
            const blob = await this.makeBlob();
            this.openViewer(blob, CardExport.fileName(this.state.name), complete);
        });
    }

    // 分享：分享一個 PNG 檔，標題是角色名稱。使用者取消不說話；失敗（含沒有 File）建議改用下載。
    // 等字型、等圖太久，點擊的使用者手勢就過期了（瀏覽器只在點擊之後的幾秒內收 navigator.share，丟 NotAllowedError）：改開大圖，
    // 焦點放在大圖的分享，請使用者再按一次（新的手勢，大圖裡分享的是已經做好的檔案，馬上就呼叫）。先把焦點放在分享鈕上，ModalManager 才記得關掉時要回到這裡
    handleShare() {
        if (this.exporting || !this.validateForExport()) return undefined;
        return this.runExport(async () => {
            const blob = await this.makeBlob();
            const name = CardExport.fileName(this.state.name);
            const file = this.makeFile([blob], name);
            const result = file === null ? 'failed' : await CardExport.share(window.navigator, file, this.state.name.trim());
            if (result === 'blocked') {
                this.elements.shareCard.focus();
                this.openViewer(blob, name, true);
                this.elements.viewerShare.focus();
                FF14Utils.showToast(this.t('char_card_share_ready', '圖片做好了，請再按一次「分享」。'), 'info');
            } else if (result === 'failed') {
                this.toastError('char_card_share_failed', '沒辦法分享，請改用下載。');
            }
        });
    }

    // 複製圖片：在點擊的當下（還在使用者手勢裡）就把「之後才會有的圖」（Promise）交給剪貼簿，Safari 要求 clipboard.write 在手勢裡呼叫，
    // 等圖做好才呼叫會被拒絕；圖晚一點才好沒關係。圖轉不出來（Promise 被拒絕）時 write 也被拒絕，一樣是複製失敗
    handleCopy() {
        if (this.exporting || !this.validateForExport()) return undefined;
        this.exporting = true;
        const blob = this.makeBlob();
        return CardExport.copy(window.navigator, window, blob).then((copied) => {
            if (copied) FF14Utils.showToast(this.t('char_card_copied', '已複製圖片'));
            else this.toastError('char_card_copy_failed', '沒辦法複製，請改用下載。');
        }).finally(() => {
            this.exporting = false;
        });
    }

    // 等到產生圖要用的東西都好了：還原中的角色圖（this.ready）、上傳中的角色圖（imageSettled()）、還在載入的職業圖示、字型的每一批。
    // 等的時候又請求的（使用者又打了字、換了語言、又選了一張截圖）也等，每等完一輪就再看一次，直到沒有還在等的為止
    // （失敗也算好了：卡片用備用字型、名稱的第一個字或現在的圖；等的那一次上傳不算數了也算，見 setImageLoad()）
    async assetsReady() {
        await this.ready;
        do {
            await Promise.all([this.fontsReady(), ...this.iconLoads, this.imageSettled()]);
        } while (this.fontBatches.size > 0 || this.iconLoads.size > 0 || this.imageLoad !== null);
    }

    // 卡片轉成 PNG：等 assetsReady()（最多 EXPORT_WAIT_MS，逾時就照目前的畫面產生並說一聲：截圖還在處理，或字型還沒載完），然後重畫一次、在同一個 tick 裡轉成 PNG
    // （中間沒有 await，畫面不會被別的重畫換掉）。回傳 Promise<Blob>，轉不出來是 rejected
    async makeBlob() {
        let timer;
        const capped = new Promise((resolve) => {
            timer = window.setTimeout(() => resolve(true), CharacterCardApp.EXPORT_WAIT_MS);
        });
        const slow = await Promise.race([this.assetsReady().then(() => false), capped]);
        window.clearTimeout(timer);
        if (slow && this.imageLoad !== null) FF14Utils.showToast(this.t('char_card_image_slow', '上傳的截圖還在處理，先用目前的畫面產生圖片。'), 'warning');
        else if (slow) FF14Utils.showToast(this.t('char_card_fonts_slow', '字型還沒載完，先用目前的畫面產生圖片。'), 'warning');
        this.render();
        return CardExport.toBlob(this.elements.canvas);
    }

    // ---------- 必填的驗證 ----------

    // 名字、伺服器、主職都填了才能輸出。沒填的在欄位下面寫錯誤，手機切到基本分頁（三個必填都在那一組），焦點移到第一個沒填的欄位。回傳能不能輸出
    validateForExport() {
        const { ok, missing } = CardState.validate(this.state);
        if (ok) return true;
        for (const key of missing) this.showError(key);
        if (this.isPhone()) this.selectTab('basic');
        this.focusField(missing[0]);
        return false;
    }

    // 焦點移到沒填的欄位。伺服器選了「其他（自己輸入）」而沒打字時，要填的是自己輸入的欄位
    focusField(key) {
        const { name, world, worldCustom, mainJob } = this.elements;
        if (key === 'name') name.focus();
        else if (key === 'world') (world.value === CharacterCardApp.CUSTOM_WORLD ? worldCustom : world).focus();
        else mainJob.focus();
    }

    // 錯誤寫在欄位下面（共用的 .form-control.is-invalid ~ .invalid-feedback 才會顯示）：欄位標成 .is-invalid 與 aria-invalid，
    // 錯誤的 id 接在欄位原本的 aria-describedby 後面（字數計數的 id 留著），螢幕閱讀器聚焦到欄位時才聽得到
    showError(key) {
        const { error, fields } = CharacterCardApp.ERROR_FIELDS.get(key);
        for (const id of fields) {
            const field = document.getElementById(id);
            field.classList.add('is-invalid');
            field.setAttribute('aria-invalid', 'true');
            const ids = this.describedBy(field);
            if (!ids.includes(error)) field.setAttribute('aria-describedby', [...ids, error].join(' '));
        }
        this.errors.add(key);
    }

    hideError(key) {
        const { error, fields } = CharacterCardApp.ERROR_FIELDS.get(key);
        for (const id of fields) {
            const field = document.getElementById(id);
            field.classList.remove('is-invalid');
            field.removeAttribute('aria-invalid');
            const ids = this.describedBy(field).filter((item) => item !== error);
            if (ids.length > 0) field.setAttribute('aria-describedby', ids.join(' '));
            else field.removeAttribute('aria-describedby');
        }
        this.errors.delete(key);
    }

    hideErrors() {
        for (const key of [...this.errors]) this.hideError(key);
    }

    // 欄位的 aria-describedby 現在指到哪幾個 id
    describedBy(field) {
        return (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    }

    // 填了的欄位把錯誤拿掉（每次狀態改變都看一下：打字、選單、自己輸入的伺服器）
    syncErrors() {
        if (this.errors.size === 0) return;
        const { missing } = CardState.validate(this.state);
        for (const key of [...this.errors]) if (!missing.includes(key)) this.hideError(key);
    }

    // ---------- 全螢幕大圖 ----------

    /**
     * 打開全螢幕大圖，顯示這一次產生的圖（這一張的 object URL，關掉之後過一陣子撤銷，見 releaseViewer()）。圖的說明（alt）是卡片現在的說明。
     * 完整時（必填都填了）有「下載檔案」（<a download>，給支援的瀏覽器）與「分享」（這個瀏覽器能分享檔案時）；
     * 必填沒填完（只是看大圖）時只有圖與「關閉」。關掉時（Esc、關閉鈕、點遮罩）焦點回到開啟前的元素（ModalManager）。
     * @param {Blob} blob - 這一次產生的 PNG
     * @param {string} name - 下載的檔名
     * @param {boolean} complete - 必填都填了嗎
     */
    openViewer(blob, name, complete) {
        this.closeViewer();
        const { viewer, viewerImage, viewerDownload, viewerShare, canvas } = this.elements;
        const url = window.URL.createObjectURL(blob);
        const file = complete ? this.makeFile([blob], name) : null;
        this.viewerState = { url, file, title: this.state.name.trim() };
        viewerImage.setAttribute('src', url);
        viewerImage.setAttribute('alt', canvas.getAttribute('aria-label') ?? '');
        if (complete) {
            viewerDownload.setAttribute('href', url);
            viewerDownload.setAttribute('download', name);
        } else {
            viewerDownload.removeAttribute('href');
        }
        viewerDownload.hidden = !complete;
        viewerShare.hidden = !(this.canShare && file !== null);
        this.viewerModal.show(viewer, { onClose: () => this.releaseViewer() });
    }

    // 沒開著就什麼都不做；開著就關掉（ModalManager 還原焦點，再呼叫 releaseViewer）
    closeViewer() {
        this.viewerModal.hide();
    }

    // 大圖關掉了：圖與下載連結馬上不再指到這一張的 object URL，網址本身過一陣子才撤銷。剛點完「下載檔案」就關掉的話，瀏覽器是在 click() 之後才
    // （非同步）去讀網址，太早撤銷有的瀏覽器會取消這次下載，所以和 CardExport.download 一樣等 REVOKE_DELAY_MS
    releaseViewer() {
        const state = this.viewerState;
        if (state === null) return;
        this.viewerState = null;
        this.elements.viewerImage.removeAttribute('src');
        this.elements.viewerDownload.removeAttribute('href');
        window.setTimeout(() => window.URL.revokeObjectURL(state.url), CardExport.REVOKE_DELAY_MS);
    }

    // 大圖裡的分享：分享已經做好的檔案，同步呼叫 navigator.share（這一下點擊是新的使用者手勢，不能再等字型或轉檔）；連按不重複。
    // 這裡被拒絕（blocked：這裡不准分享）就沒有別的退路了，和其他失敗一樣建議改用下載（大圖裡就有「下載檔案」）
    shareFromViewer() {
        const state = this.viewerState;
        if (state === null || state.file === null || this.exporting) return undefined;
        this.exporting = true;
        return CardExport.share(window.navigator, state.file, state.title).then((result) => {
            if (result === 'failed' || result === 'blocked') this.toastError('char_card_share_failed', '沒辦法分享，請改用下載。');
        }).finally(() => {
            this.exporting = false;
        });
    }
}

window.CharacterCardApp = CharacterCardApp;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.characterCardApp = new CharacterCardApp();
});
