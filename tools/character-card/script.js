// 角色卡產生器的編輯畫面
// 表單 ↔ 狀態（CardState）↔ 畫在 canvas 上的卡片（CardRenderer）：每改一個欄位，狀態先整理過（CardState.normalize）、存起來、再重畫；
// 卡片就是畫面上那張 canvas，之後下載的是同一張。欄位的規則（字數上限、預設值、重點色）在 card-state.js，畫圖在 card-renderer.js，
// 這裡只管畫面與事件。伺服器與職業的清單來自共用的 assets/js/ff14-game-data.js（window.FF14_JOBS、FF14_WORLDS、FF14_TC_WORLDS，只從 window 讀）。
// 手機（768px 以下）五組欄位用分頁切換（script.js 用 hidden 切換面板），電腦五組都顯示；預覽的位置、sticky 與分頁列的顯示都在 style.css。
// 記住：每一次讀寫都由 CardState 包 try/catch；瀏覽器封鎖網站資料時連 window.localStorage 本身都會丟例外，所以取 storage 也包 try，
// 取不到就傳 null（CardState 當成讀不到、寫不進去），這次打開期間照常運作，只是不記住。
// 字型：Google Fonts 的中文字型依字分批載入，沒載入的字會退成別的字型，所以每畫一次就看有沒有還沒請求過的字，有就請瀏覽器載入（這一次請求的算一批）；
// 這一批載入完（失敗也算：卡片用備用字型）就重畫一次，不等別批。fontsReady() 等到請求過的每一批都載入完並重畫過：等的時候又請求的也等，
// 先請求的那一批比後請求的慢（後請求的先載完）也一樣，下載、分享、複製之前要等它。
class CharacterCardApp {
    static PHONE_QUERY = '(max-width: 768px)';
    static CLEAR_CONFIRM_MS = 3000;
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
        this.state = CardState.load(this.storage, this.jobs).state;

        // 職業圖示：職業鍵 → { image }，每個只載入一次（載入失敗也留著，不再請求）
        this.icons = new Map();
        // 已經請求過的字型：字型字串 → 請求過的字（Set）。fontBatches 是還在載入的字型批次（見 requestFonts()），每一批載完並重畫後自己拿掉
        this.fontChars = new Map();
        this.fontBatches = new Set();
        this.clearTimer = null;

        const byId = (id) => document.getElementById(id);
        this.elements = {
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
            canvas: byId('cardCanvas')
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
        this.relabel();
        this.syncForm();
        this.render();
        // ready：第一次畫好、字型載入完並重畫過
        this.ready = this.fontsReady();
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
        // 切換語言：靜態的文字由 I18nManager 換，這裡換 JS 畫的（選項、按鈕、計數、勾選框的名稱），再用新的語言重畫卡片；選的值不變
        window.i18n.onLanguageChange(() => {
            this.relabel();
            this.render();
        });
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

    // 清空欄位與記憶（欄位與圖片兩個鍵），回到什麼都沒填的卡片
    clearAll() {
        CardState.clear(this.storage);
        this.state = CardState.defaults();
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
        for (const { key: tabKey, tab, panel } of this.tabs) {
            const on = tabKey === key;
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            tab.setAttribute('tabindex', on ? '0' : '-1');
            tab.classList.toggle('active', on);
            panel.hidden = phone && !on;
        }
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
        const custom = state.accent !== 'auto';
        this.elements.accentAuto.checked = !custom;
        this.elements.accentCustom.checked = custom;
        // 跟著職能時色票顯示現在用的顏色；自己選的顏色是使用者剛動過的，不再寫回去（色票開著時寫回去會跳）
        if (!custom) this.elements.accentColor.value = CardState.accentOf(state, this.jobs);
        this.renderCounters();
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
        this.renderCounters();
    }

    // [翻譯鍵, 中文預設文字] → 目前介面語言的字
    label([key, fallback]) {
        return this.t(key, fallback);
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
            image: null, // 角色圖：後面的 Task 接上
            crop: CardState.cropOf(state),
            levelLabel: CharacterCardApp.LEVEL_LABEL,
            mark: CharacterCardApp.MARK,
            notice: CharacterCardApp.NOTICE
        };
    }

    // 職業的圖示：載入完才給卡片（complete 而且有寬度），載入前與載入失敗是 null（卡片畫名稱的第一個字）。
    // 每個職業只載入一次；載入完重畫，失敗就維持 null、不再請求
    iconOf(job) {
        if (!job.icon) return null;
        let entry = this.icons.get(job.key);
        if (!entry) {
            const image = new Image();
            entry = { image };
            image.onload = () => this.render();
            image.onerror = () => {};
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
}

window.CharacterCardApp = CharacterCardApp;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.characterCardApp = new CharacterCardApp();
});
