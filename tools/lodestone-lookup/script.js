// Lodestone 角色查詢
// 三種畫面（#lodestoneTool 裡，一次只看得到一個）：
// - 打開時（#landingView）：我的角色（有設才有）→ 找人 → 最近查過（有才有）；兩個都沒有是第一次來，上面多一句說明
// - 搜尋結果（#searchView）：「← 找其他人」、找人（填好剛才的條件）、結果
// - 角色（#characterView）：「← 找其他人」、標頭（#profileCard）、放分頁的容器（#tabsCard）
// 找人的表單（#findCard）只有一份：打開時放在我的角色與最近查過中間，搜尋結果時搬到結果上面（showView()）。
// 規則在不碰 DOM 的 lodestone-model.js（LodestoneModel），我的角色、最近查過與名稱與成就顯示的記憶在 lodestone-store.js（LodestoneStore），
// 這裡只管畫面、事件、請求與網址。
//
// 請求：每一個 Worker 請求都綁在一個 context（AbortController）上（request()）。搜尋、打開角色、回到打開時、換名稱與成就顯示都先取消舊的
// context（newContext()、cancelRequests()）；舊的回應、錯誤晚到時 isCurrent() 不成立，一律不碰畫面與記憶。
// 網址：只有看角色時有 ?id=（可以分享）。從別的畫面搜尋、打開角色、「← 找其他人」都新增一筆上一頁的紀錄（搜尋那一筆網址不變：
// 搜尋條件不放進網址，記在 history.state）；上一頁、下一頁回到那個畫面，搜尋結果從記憶體拿，不在了就是打開時（restore()）。
// 名稱與成就顯示（English／日本語）：找人卡片（#dataLang）與角色標頭各有一組，兩組永遠一樣。按過就照按的（記住），沒按過跟著介面語言；
// 正在看角色時換了，就用新的語言重新打標頭（reloadCharacter()：新的回來之前標頭留著，按鈕不會不見）。
class LodestoneLookup {
    static WORKER_BASE = 'https://logstone.z54981220.workers.dev';
    // 網站的職業圖示（LodestoneModel.activeJob() 的 icon 是這底下的路徑）
    static JOB_ICON_BASE = '../../assets/images/se/FFXIVJobIcons/';
    // 介面語言 → 日期與數字的寫法
    static LOCALES = Object.freeze({ zh: 'zh-TW', en: 'en-US', ja: 'ja-JP' });
    // 資料時間：年月日與時分
    static TIME_FORMAT = Object.freeze({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    // 請求失敗的原因 → 畫面上的字。鍵一律寫成完整的字串，不用組的
    static REASONS = Object.freeze({
        notFound: ['lodestone_error_not_found', '找不到這個角色'],
        upstream: ['lodestone_error_upstream', 'Lodestone 暫時連不上，請稍後再試'],
        failed: ['lodestone_error_query_failed', '查詢失敗']
    });

    // 建一個元素：class 與文字（沒給就不設）
    static element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // 頁面的 localStorage；拿不到是 null（瀏覽器封鎖網站資料時，光是讀 window.localStorage 就丟例外（Chrome），也可能是 null）
    static localStorageOrNull() {
        try {
            return window.localStorage || null;
        } catch (error) {
            return null;
        }
    }

    // 頁面用的儲存：storage（localStorage，沒有是 null）加上記憶體裡的一層。沒有 storage、寫不進去（容量已滿）或拿掉失敗時，
    // 那個鍵改記在記憶體裡，之後讀它先看記憶體：這次打開期間照樣記得我的角色、最近查過與名稱顯示，只是關掉就忘了。
    // 寫成功就拿掉記憶體裡的那一筆，之後照樣讀 storage。寫不進去時照樣丟例外，LodestoneStore 的寫入照實回傳 false
    static pageStorage(storage) {
        // 鍵 → 字串；null 是拿掉了
        const memory = new Map();
        const write = (key, value, apply) => {
            memory.set(key, value);
            if (!storage) throw new Error('No localStorage');
            apply();
            memory.delete(key);
        };
        return {
            getItem: (key) => (memory.has(key) ? memory.get(key) : storage ? storage.getItem(key) : null),
            setItem: (key, value) => write(key, String(value), () => storage.setItem(key, String(value))),
            removeItem: (key) => write(key, null, () => storage.removeItem(key))
        };
    }

    // 開新分頁的外部連結的字：字放在一個 span，↗ 另外放在 aria-hidden 的記號裡，螢幕閱讀器不念（同頁尾的外部連結）
    static fillExternalLink(link, text) {
        link.textContent = '';
        link.appendChild(LodestoneLookup.element('span', '', text));
        const mark = LodestoneLookup.element('span', 'external-mark', ' ↗');
        mark.setAttribute('aria-hidden', 'true');
        link.appendChild(mark);
    }

    // 元素本身與祖先都沒有 hidden。只看元素：document.hidden 是分頁在不在背景，不是這個意思
    static isShown(element) {
        for (let node = element; node && node.nodeType === 1; node = node.parentNode) if (node.hidden) return false;
        return true;
    }

    // 請求失敗的原因：404 是找不到（只有角色會有），502 是 Lodestone 連不上，其他（500、400、403、連不上 Worker、回應不對）是查詢失敗
    static reasonOf(error) {
        if (error && error.status === 404) return 'notFound';
        if (error && error.status === 502) return 'upstream';
        return 'failed';
    }

    constructor({ workerBase = LodestoneLookup.WORKER_BASE, storage } = {}) {
        this.workerBase = String(workerBase).replace(/\/+$/, '');
        this.storage = LodestoneLookup.pageStorage(storage !== undefined ? storage : LodestoneLookup.localStorageOrNull());
        // 名稱與成就顯示：按過的（en、ja），沒按過是 null，這時跟著介面語言（dataLang()）
        this.langChoice = LodestoneStore.readLang(this.storage);
        // 目前的請求：{ controller, dataLang }；沒有在等的請求是 null
        this.context = null;
        // view：看得到的畫面。search：搜尋結果 { name, world, context, status: 'loading' | 'done' | 'failed', data, reason }；
        // character：角色 { id, context, dataLang, status: 'loading' | 'done' | 'error', character, fetchedAt, reason }
        this.state = { view: 'landing', search: null, character: null };

        this.elements = {
            landingView: document.getElementById('landingView'),
            firstVisitIntro: document.getElementById('firstVisitIntro'),
            mineCard: document.getElementById('mineCard'),
            mineAvatar: document.getElementById('mineAvatar'),
            mineName: document.getElementById('mineName'),
            mineMeta: document.getElementById('mineMeta'),
            findCard: document.getElementById('findCard'),
            findForm: document.getElementById('findForm'),
            nameInput: document.getElementById('nameInput'),
            worldSelect: document.getElementById('worldSelect'),
            dcOptions: document.getElementById('dcOptions'),
            worldOptions: document.getElementById('worldOptions'),
            dataLang: document.getElementById('dataLang'),
            recentCard: document.getElementById('recentCard'),
            recentList: document.getElementById('recentList'),
            searchView: document.getElementById('searchView'),
            searchBack: document.getElementById('searchBack'),
            resultCard: document.getElementById('resultCard'),
            searchSummary: document.getElementById('searchSummary'),
            resultList: document.getElementById('resultList'),
            searchHint: document.getElementById('searchHint'),
            searchMore: document.getElementById('searchMore'),
            searchFallback: document.getElementById('searchFallback'),
            characterView: document.getElementById('characterView'),
            characterBack: document.getElementById('characterBack'),
            profileCard: document.getElementById('profileCard'),
            characterError: document.getElementById('characterError'),
            tabsCard: document.getElementById('tabsCard')
        };

        this.fillWorlds();
        this.bindEvents();
        this.ready = this.start();
    }

    t(key, fallback, params) {
        return FF14Utils.getI18nText(key, fallback, params);
    }

    uiLang() {
        return window.i18n.getCurrentLanguage();
    }

    locale() {
        return Object.prototype.hasOwnProperty.call(LodestoneLookup.LOCALES, this.uiLang()) ? LodestoneLookup.LOCALES[this.uiLang()] : 'zh-TW';
    }

    // 名稱與成就顯示：按過的，沒按過照介面語言（日文介面是日本語，其他是 English）
    dataLang() {
        return this.langChoice ?? LodestoneModel.defaultDataLang(this.uiLang());
    }

    // 伺服器選單：「全部伺服器」寫在 index.html，這裡照 LODESTONE_WORLDS 填資料中心與伺服器兩組，選項的字是去掉 _dc_ 的名稱
    fillWorlds() {
        const { dcs, worlds } = window.LODESTONE_WORLDS;
        for (const [group, values] of [[this.elements.dcOptions, dcs], [this.elements.worldOptions, worlds]]) {
            for (const value of values) {
                const option = LodestoneLookup.element('option', '', LodestoneModel.worldLabel(value));
                option.value = value;
                group.appendChild(option);
            }
        }
    }

    bindEvents() {
        const { findForm, nameInput, mineCard, recentList, resultList, searchBack, characterBack, dataLang, profileCard } = this.elements;
        findForm.addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitFind();
        });
        // 貼上（或拖進來）角色頁網址時，名字欄馬上換成網址裡的 ID：看得到要打開的是哪個角色。名字不會被換掉；
        // 打字時不換（打到一半的網址不會被切掉），送出時照樣直接打開
        nameInput.addEventListener('input', (event) => {
            if (typeof event.inputType !== 'string' || !event.inputType.startsWith('insertFrom')) return;
            const parsed = LodestoneModel.parseInput(nameInput.value);
            if (parsed.kind === 'id' && parsed.id !== nameInput.value) nameInput.value = parsed.id;
        });
        mineCard.addEventListener('click', () => {
            const mine = LodestoneStore.readMine(this.storage);
            if (mine) this.openCharacter(mine.id);
        });
        // 最近查過與搜尋結果的每一列：點了打開那個角色（事件委派在清單上，重畫之後不必重新綁）
        for (const list of [recentList, resultList]) {
            list.addEventListener('click', (event) => {
                const row = event.target.closest('.person');
                if (row) this.openCharacter(row.dataset.id);
            });
        }
        for (const back of [searchBack, characterBack]) back.addEventListener('click', () => this.findSomeoneElse());
        dataLang.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-lang]');
            if (button) this.setDataLang(button.dataset.lang);
        });
        // 標頭：設成我的角色、名稱與成就顯示（和找人卡片那一組一樣）
        profileCard.addEventListener('click', (event) => {
            const mine = event.target.closest('.profile-mine');
            if (mine) {
                this.toggleMine(mine);
                return;
            }
            const lang = event.target.closest('button[data-lang]');
            if (lang) this.setDataLang(lang.dataset.lang);
        });
        // 上一頁、下一頁：照網址與 history.state 回到那個畫面
        window.addEventListener('popstate', (event) => this.restore(event.state));
        // 切換介面語言：重畫看得到的字；沒按過名稱與成就顯示時，正在看的角色換成新的語言重新打
        window.i18n.onLanguageChange(() => {
            this.renderDataLang();
            if (this.reloadIfDataLangChanged()) return;
            this.render();
        });
    }

    // 打開頁面：網址帶 ?id= 就直接打開那個角色，否則是打開時（不是 ID 的 ?id= 從網址拿掉）。回傳的 promise 是 this.ready
    start() {
        this.renderDataLang();
        const id = this.idInUrl();
        if (id !== null) return this.openCharacter(id, { push: false });
        this.navigate({ view: 'landing' }, false);
        this.enterLanding();
        return Promise.resolve();
    }

    // 網址的 ?id=：是 ID（或角色頁網址）才算，否則是 null
    idInUrl() {
        const raw = new URLSearchParams(window.location.search).get('id');
        if (raw === null) return null;
        const parsed = LodestoneModel.parseInput(raw);
        return parsed.kind === 'id' ? parsed.id : null;
    }

    // ---------- 動作 ----------

    // 找人的表單送出：名字欄是角色頁網址或 ID 就直接打開，是名字就搜尋，空白就回到名字欄
    submitFind() {
        const { nameInput, worldSelect } = this.elements;
        const parsed = LodestoneModel.parseInput(nameInput.value);
        if (parsed.kind === 'empty') {
            nameInput.focus();
            return;
        }
        if (parsed.kind === 'id') {
            nameInput.value = parsed.id;
            this.openCharacter(parsed.id);
            return;
        }
        this.search(parsed.name, worldSelect.value);
    }

    /**
     * 回到打開時：取消還沒回來的請求，網址拿掉 ?id=，從別的畫面過來時新增一筆上一頁的紀錄。
     * @param {{history?: boolean}} options - history 是 false 時不動 history（上一頁、下一頁回到這裡時）
     */
    showLanding({ history = true } = {}) {
        this.cancelRequests();
        if (history) this.navigate({ view: 'landing' }, this.state.view !== 'landing');
        this.enterLanding();
    }

    // 「← 找其他人」：回到打開時，焦點在名字欄（裡面的字選起來，打字就換掉）
    findSomeoneElse() {
        this.showLanding();
        const { nameInput } = this.elements;
        nameInput.focus();
        if (typeof nameInput.select === 'function') nameInput.select();
    }

    /**
     * 用名字搜尋（只看第一頁）。從別的畫面來的搜尋新增一筆上一頁的紀錄，在搜尋結果上再搜尋就換掉這一筆；
     * 網址不變（搜尋條件不放進網址），條件記在 history.state，上一頁、下一頁才回得到搜尋結果。
     * @param {string} name - 名字（去掉前後空白的）
     * @param {string} world - 伺服器選單的值：空字串是全部，資料中心帶 _dc_
     * @returns {Promise<void>} 這一次搜尋結束（被更新的動作取代也算結束）
     */
    search(name, world = '') {
        const query = { name: String(name), world: String(world ?? '') };
        const push = this.state.view !== 'search';
        const context = this.newContext();
        this.state.search = { ...query, context, status: 'loading', data: null, reason: null };
        this.elements.nameInput.value = query.name;
        this.elements.worldSelect.value = query.world;
        this.navigate({ view: 'search', ...query }, push);
        this.showView('search');
        this.renderSearch();
        return this.loadSearch(context, query);
    }

    async loadSearch(context, query) {
        let outcome;
        try {
            const params = new URLSearchParams({ name: query.name, world: query.world, dc: LodestoneModel.dcOf(context.dataLang), page: '1' });
            const data = await this.request(context, '/search/character', params);
            if (!Array.isArray(data.Results)) throw new Error('Worker 的搜尋回應沒有 Results');
            outcome = { status: 'done', data };
        } catch (error) {
            outcome = { status: 'failed', reason: LodestoneLookup.reasonOf(error) === 'upstream' ? 'upstream' : 'failed' };
        }
        if (!this.isCurrent(context) || this.state.search?.context !== context) return;
        Object.assign(this.state.search, outcome);
        this.renderSearch();
    }

    /**
     * 打開一個角色：先打標頭（/character/<id>）。網址換成 ?id=<id>。
     * @param {string | number} id - Lodestone 的角色 ID
     * @param {{push?: boolean}} options - push 是 true 時新增一筆上一頁的紀錄（已經在看這個角色時照樣換掉這一筆）；
     *   直接打開網址、上一頁或下一頁回到角色時是 false
     * @returns {Promise<void>} 標頭載入結束（成功、失敗或被更新的動作取代）
     */
    openCharacter(id, { push = true } = {}) {
        const characterId = String(id);
        const showing = this.state.view === 'character' && this.state.character?.id === characterId;
        const context = this.newContext();
        this.state.character = {
            id: characterId, context, dataLang: context.dataLang, status: 'loading', character: null, fetchedAt: null, reason: null
        };
        this.navigate({ view: 'character', id: characterId }, push && !showing);
        this.showView('character');
        this.renderCharacter();
        return this.loadCharacter(context, characterId);
    }

    async loadCharacter(context, id) {
        let outcome;
        try {
            const params = new URLSearchParams({ dc: LodestoneModel.dcOf(context.dataLang) });
            const data = await this.request(context, `/character/${encodeURIComponent(id)}`, params);
            const character = data.Character;
            if (!character || typeof character !== 'object' || Array.isArray(character)) throw new Error('Worker 的角色回應沒有 Character');
            outcome = { status: 'done', character, fetchedAt: typeof data.FetchedAt === 'string' ? data.FetchedAt : null };
        } catch (error) {
            outcome = { status: 'error', reason: LodestoneLookup.reasonOf(error), character: null, fetchedAt: null };
        }
        if (!this.isCurrent(context) || this.state.character?.context !== context) return;
        Object.assign(this.state.character, outcome);
        if (outcome.status === 'done') this.rememberCharacter();
        this.renderCharacter();
    }

    // 標頭打開成功：是我的角色就更新我的角色（設定時記下的快照），否則記進最近查過
    rememberCharacter() {
        const who = this.personOf(this.state.character);
        if (LodestoneStore.readMine(this.storage)?.id === who.id) LodestoneStore.writeMine(this.storage, who);
        else LodestoneStore.remember(this.storage, who);
    }

    // 設成我的角色／取消（標頭那顆按鈕，按鈕就地換字，焦點不動）。取消時放回最近查過：剛剛才查過。
    // 畫面上有標頭就算數：換名稱與成就顯示而重新打的時候，標頭還是這個角色；新的回來時 rememberCharacter() 更新我的角色的資料
    toggleMine(button) {
        const current = this.state.character;
        if (!current || current.character === null) return;
        const who = this.personOf(current);
        if (LodestoneStore.readMine(this.storage)?.id === who.id) {
            LodestoneStore.writeMine(this.storage, null);
            LodestoneStore.remember(this.storage, who);
        } else {
            LodestoneStore.writeMine(this.storage, who);
        }
        this.paintMineToggle(button, who.id);
    }

    /**
     * 名稱與成就顯示：English（en）或日本語（ja），記住按的；正在看角色時用新的語言重新打標頭。
     * @param {'en' | 'ja'} lang
     * @returns {Promise<void>} 重新打標頭的 promise（不用重新打時是馬上 resolve 的 promise）
     */
    setDataLang(lang) {
        if (lang !== 'en' && lang !== 'ja') return Promise.resolve();
        this.langChoice = lang;
        LodestoneStore.writeLang(this.storage, lang);
        this.renderDataLang();
        const reload = this.reloadIfDataLangChanged();
        if (reload) return reload;
        // 搜尋結果不跟著語言換（名字、伺服器、部隊都是原文），只有到官網搜尋的連結換網域
        if (this.state.view === 'search') this.renderSearch();
        return Promise.resolve();
    }

    // 正在看的角色是用別的語言打的（按了名稱與成就顯示，或沒按過時換了介面語言）：用現在的語言重新打標頭。
    // 回傳重新打的 promise；不用重新打時是 null
    reloadIfDataLangChanged() {
        const current = this.state.character;
        if (this.state.view !== 'character' || !current || current.dataLang === this.dataLang()) return null;
        return this.reloadCharacter();
    }

    // 用現在的名稱與成就顯示重新打正在看的角色（網址不變，不多一筆上一頁）。已經畫出來的標頭留著（載入中）直到新的回來：
    // 切換的按鈕就在標頭裡，不會不見，焦點也不會掉。之前是錯誤訊息或還在載入（沒有標頭）時，照一般的載入中畫
    reloadCharacter() {
        const previous = this.state.character;
        const context = this.newContext();
        this.state.character = {
            id: previous.id, context, dataLang: context.dataLang, status: 'loading',
            character: previous.character, fetchedAt: previous.fetchedAt, reason: null
        };
        this.renderCharacter();
        return this.loadCharacter(context, previous.id);
    }

    // 上一頁、下一頁：網址有 ?id= 就打開那個角色（重新打標頭）。這一筆是搜尋結果，而且結果還在記憶體裡（最後一次的搜尋、已經回來）
    // 就直接顯示，不再搜尋；結果不在了（例如在這一筆重新整理過、搜尋還沒回來就離開了）或其他都是打開時
    restore(state) {
        const id = this.idInUrl();
        if (id !== null) {
            this.openCharacter(id, { push: false });
            return;
        }
        const last = this.state.search;
        if (state && state.view === 'search' && last && last.status !== 'loading' && last.name === state.name && last.world === state.world) {
            this.showResults();
            return;
        }
        this.showLanding({ history: false });
    }

    // 回到記憶體裡的搜尋結果：表單填回那一次的條件，不再打 Worker
    showResults() {
        const { name, world } = this.state.search;
        this.cancelRequests();
        this.elements.nameInput.value = name;
        this.elements.worldSelect.value = world;
        this.showView('search');
        this.renderSearch();
    }

    // ---------- 請求與網址 ----------

    // 開始新的請求：取消舊的，之後只採用這個 context 的回應
    newContext() {
        this.cancelRequests();
        this.context = { controller: new AbortController(), dataLang: this.dataLang() };
        return this.context;
    }

    cancelRequests() {
        if (this.context) this.context.controller.abort();
        this.context = null;
    }

    isCurrent(context) {
        return this.context === context && !context.controller.signal.aborted;
    }

    // 打 Worker：每個請求都綁在 context 上。不是 2xx 時丟出帶 status 的錯誤；回應不是 JSON 物件也丟錯；
    // 連不上（舊 Worker 沒有的端點，瀏覽器擋下它沒有 CORS 標頭的 404 也是）由 fetch 自己丟例外
    async request(context, path, params) {
        const response = await fetch(`${this.workerBase}${path}?${params}`, { signal: context.controller.signal });
        if (!response.ok) throw Object.assign(new Error(`Worker 回應 ${response.status}`), { status: response.status });
        const data = await response.json();
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Worker 的回應不是 JSON 物件');
        return data;
    }

    // 網址只放角色的 ID（?id=，看角色時才有）；state 記住是哪一個畫面。push 時新增一筆上一頁的紀錄，否則換掉這一筆
    navigate(state, push) {
        const url = new URL(window.location.href);
        if (state.view === 'character') url.searchParams.set('id', state.id);
        else url.searchParams.delete('id');
        if (push) window.history.pushState(state, '', url.href);
        else window.history.replaceState(state, '', url.href);
    }

    // ---------- 畫面 ----------

    // 換畫面。找人的表單跟著搬：打開時放在最近查過前面，搜尋結果時放在結果前面
    showView(view) {
        const { landingView, searchView, characterView, findCard, recentCard, resultCard } = this.elements;
        const active = document.activeElement;
        landingView.hidden = view !== 'landing';
        searchView.hidden = view !== 'search';
        characterView.hidden = view !== 'character';
        this.state.view = view;
        if (view === 'landing' && findCard.parentNode !== landingView) landingView.insertBefore(findCard, recentCard);
        if (view === 'search' && findCard.parentNode !== searchView) searchView.insertBefore(findCard, resultCard);
        // 搬動表單時瀏覽器會拿掉表單裡的焦點：搬完放回去（要在新的畫面看得到之後，藏起來的元素拿不到焦點）
        if (active && findCard.contains(active) && document.activeElement !== active) active.focus();
        // 焦點所在的元素跟著藏起來了（例如點了最近查過的一列）：移到這個畫面最上面的控制項，不讓焦點掉到頁面最上面
        if (active && active !== document.body && !LodestoneLookup.isShown(active)) {
            const first = { landing: this.elements.nameInput, search: this.elements.searchBack, character: this.elements.characterBack }[view];
            first.focus();
        }
    }

    enterLanding() {
        this.showView('landing');
        this.renderLanding();
    }

    // 重畫看得到的畫面（切換介面語言時）
    render() {
        this.renderDataLang();
        if (this.state.view === 'landing') this.renderLanding();
        else if (this.state.view === 'search') this.renderSearch();
        else this.renderCharacter();
    }

    // 名稱與成就顯示的兩組按鈕（找人卡片的 #dataLang 與角色標頭裡的那一組）一起畫，兩組永遠一樣
    renderDataLang() {
        const current = this.dataLang();
        const buttons = [
            ...this.elements.dataLang.querySelectorAll('button[data-lang]'),
            ...this.elements.profileCard.querySelectorAll('button[data-lang]')
        ];
        for (const button of buttons) {
            const on = button.dataset.lang === current;
            button.classList.toggle('active', on);
            button.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    }

    // 打開時：我的角色、最近查過照記憶畫；兩個都沒有才有第一次來的說明
    renderLanding() {
        const { firstVisitIntro, mineCard, mineAvatar, mineName, mineMeta, recentCard, recentList } = this.elements;
        const mine = LodestoneStore.readMine(this.storage);
        const recent = LodestoneStore.readRecent(this.storage);
        mineCard.hidden = mine === null;
        if (mine) {
            this.setAvatar(mineAvatar, mine.avatar);
            mineName.textContent = mine.name;
            this.fillMeta(mineMeta, [this.whereText(mine.world, mine.dc), this.jobText(mine.job, mine.level)]);
        }
        recentCard.hidden = recent.length === 0;
        recentList.textContent = '';
        for (const who of recent) recentList.appendChild(this.personRow(who, [this.whereText(who.world, who.dc)]));
        firstVisitIntro.hidden = mine !== null || recent.length > 0;
    }

    renderSearch() {
        const { resultCard, searchSummary, resultList, searchHint, searchMore, searchFallback } = this.elements;
        const current = this.state.search;
        resultList.textContent = '';
        searchHint.hidden = true;
        searchMore.hidden = true;
        searchFallback.hidden = true;
        resultCard.setAttribute('aria-busy', current && current.status === 'loading' ? 'true' : 'false');
        if (!current) return;
        if (current.status === 'loading') {
            searchSummary.textContent = this.t('lodestone_loading', '載入中…');
            return;
        }
        if (current.status === 'failed') {
            // 搜尋不能用（舊 Worker 沒有搜尋、連不上、502）：寫原因，給到官網搜尋的連結
            searchSummary.textContent = this.reasonText(current.reason);
            searchFallback.href = LodestoneModel.officialSearchUrl(current.name, current.world, this.dataLang());
            LodestoneLookup.fillExternalLink(searchFallback, this.t('lodestone_search_official', '到 Lodestone 官網搜尋「{name}」', { name: current.name }));
            searchFallback.hidden = false;
            return;
        }
        const results = current.data.Results.filter((item) => item && (typeof item.ID === 'number' || typeof item.ID === 'string') && typeof item.Name === 'string');
        const pagination = current.data.Pagination || {};
        const total = Number.isInteger(pagination.Total) ? pagination.Total : results.length;
        const where = LodestoneModel.worldLabel(current.world);
        const params = { where, name: current.name, count: total.toLocaleString(this.locale()) };
        if (results.length === 0) {
            searchSummary.textContent = where
                ? this.t('lodestone_search_none_in', '在 {where} 找不到「{name}」', params)
                : this.t('lodestone_search_none', '找不到「{name}」', params);
            searchHint.hidden = false;
            return;
        }
        searchSummary.textContent = where
            ? this.t('lodestone_search_found_in', '在 {where} 找到 {count} 個「{name}」', params)
            : this.t('lodestone_search_found', '找到 {count} 個「{name}」', params);
        for (const item of results) {
            const fc = LodestoneModel.freeCompanyOf(item);
            const parts = [this.whereText(item.World, item.DC), fc && fc.name ? this.t('lodestone_fc_named', '部隊 {name}', { name: fc.name }) : ''];
            resultList.appendChild(this.personRow({ id: String(item.ID), name: item.Name, avatar: item.Avatar }, parts));
        }
        searchMore.hidden = !(Number(pagination.PageTotal) > 1);
    }

    // 角色畫面：載入中、標頭或錯誤訊息。標頭打不開時標頭與分頁藏起來，只留錯誤訊息與「← 找其他人」。
    // 換名稱與成就顯示而重新打時（reloadCharacter()），新的回來之前照舊畫著標頭，下面多一塊載入中（aria-busy）。
    // 重畫前焦點在標頭的某個按鈕上：畫好之後放回同一個按鈕；那個按鈕不在了（標頭換成錯誤訊息）就移到「← 找其他人」
    renderCharacter() {
        const { profileCard, characterError, tabsCard, characterBack } = this.elements;
        const current = this.state.character;
        const focused = this.profileControl(document.activeElement);
        profileCard.textContent = '';
        if (!current) return;
        if (current.status === 'error') {
            profileCard.hidden = true;
            tabsCard.hidden = true;
            characterError.textContent = this.reasonText(current.reason);
            characterError.hidden = false;
        } else {
            const loading = current.status === 'loading';
            characterError.hidden = true;
            characterError.textContent = '';
            profileCard.hidden = false;
            profileCard.setAttribute('aria-busy', loading ? 'true' : 'false');
            tabsCard.hidden = current.character === null;
            if (current.character !== null) this.buildProfile(profileCard, current);
            if (loading) profileCard.appendChild(this.loadingBlock());
        }
        if (focused !== null) {
            const target = profileCard.hidden ? null : profileCard.querySelector(focused);
            (target || characterBack).focus();
        }
    }

    // 標頭裡焦點所在的那個按鈕，換成重畫之後找得到它的選擇器；焦點不在標頭的按鈕上是 null
    profileControl(element) {
        if (!element || !this.elements.profileCard.contains(element)) return null;
        if (element.matches('.profile-mine')) return '.profile-mine';
        if (element.matches('.profile-lodestone')) return '.profile-lodestone';
        if (element.matches('button[data-lang]')) return `button[data-lang="${element.dataset.lang}"]`;
        return null;
    }

    // 標頭：頭像、名字、稱號（有才寫）、伺服器與部隊、現在的職業、設成我的角色、在 Lodestone 打開與名稱與成就顯示、資料時間（有才寫）
    buildProfile(card, current) {
        const { character } = current;
        const who = this.personOf(current);
        const head = LodestoneLookup.element('div', 'profile');
        head.appendChild(this.avatar('profile-avatar', who.avatar));
        const text = LodestoneLookup.element('div', 'profile-text');
        text.appendChild(LodestoneLookup.element('h2', 'profile-name', who.name));
        // 稱號是空字串（或只有空白）時和沒有稱號一樣
        const title = typeof character.Title === 'string' ? character.Title.trim() : '';
        if (title !== '') text.appendChild(LodestoneLookup.element('p', 'profile-title', title));
        text.appendChild(this.whereLine(character, who));
        head.appendChild(text);
        card.appendChild(head);

        const now = this.nowLine(character);
        if (now) card.appendChild(now);

        const actions = LodestoneLookup.element('div', 'profile-actions');
        const mine = LodestoneLookup.element('button', 'btn btn-sm profile-mine');
        mine.type = 'button';
        this.paintMineToggle(mine, who.id);
        actions.appendChild(mine);
        const link = LodestoneLookup.element('a', 'btn btn-sm btn-ghost profile-lodestone');
        LodestoneLookup.fillExternalLink(link, this.t('lodestone_open_lodestone', '在 Lodestone 打開'));
        link.href = LodestoneModel.characterUrl(who.id, current.dataLang);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        actions.appendChild(link);
        actions.appendChild(this.dataLangGroup());
        card.appendChild(actions);

        const time = this.timeText(current.fetchedAt);
        if (time !== null) card.appendChild(LodestoneLookup.element('p', 'profile-fetched', this.t('lodestone_fetched_at', '資料時間：{time}', { time })));
        this.renderDataLang();
    }

    // 標頭裡的名稱與成就顯示：和找人卡片的 #dataLang 同一組按鈕（照它的按鈕建：同樣的 data-lang 與字），按下去的狀態由 renderDataLang() 畫
    dataLangGroup() {
        const wrapper = LodestoneLookup.element('div', 'data-lang profile-data-lang');
        const label = LodestoneLookup.element('span', '', this.t('lodestone_data_lang', '名稱與成就顯示'));
        label.id = 'profileDataLangLabel';
        const group = LodestoneLookup.element('div', 'data-lang-options');
        group.id = 'profileDataLang';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', label.id);
        for (const source of this.elements.dataLang.querySelectorAll('button[data-lang]')) {
            const button = LodestoneLookup.element('button', 'chip', source.textContent);
            button.type = 'button';
            button.dataset.lang = source.dataset.lang;
            group.appendChild(button);
        }
        wrapper.appendChild(label);
        wrapper.appendChild(group);
        return wrapper;
    }

    // 「伺服器（資料中心）・部隊 名稱」；舊 Worker 的部隊沒有名稱，只寫「部隊」；沒有加入部隊只寫伺服器
    whereLine(character, who) {
        const line = LodestoneLookup.element('p', 'profile-where', this.whereText(who.world, who.dc));
        const fc = LodestoneModel.freeCompanyOf(character);
        if (fc) {
            if (line.textContent !== '') line.appendChild(document.createTextNode(this.t('lodestone_sep', '・')));
            const label = fc.name !== '' ? this.t('lodestone_fc_named', '部隊 {name}', { name: fc.name }) : this.t('lodestone_fc', '部隊');
            line.appendChild(LodestoneLookup.element('span', 'profile-fc', label));
        }
        return line;
    }

    // 「現在：<圖示> 職業 LvN」；讀不到目前職業時是 null
    nowLine(character) {
        const job = LodestoneModel.activeJob(LodestoneModel.activeClassJobOf(character), this.uiLang());
        if (!job || (job.name === null && job.icon === null && job.level === null)) return null;
        const line = LodestoneLookup.element('p', 'profile-now');
        line.appendChild(LodestoneLookup.element('span', 'profile-now-label', this.t('lodestone_now', '現在：')));
        const icon = this.jobIcon(job);
        if (icon) line.appendChild(icon);
        line.appendChild(LodestoneLookup.element('span', 'profile-now-job', this.jobLabel(job)));
        return line;
    }

    // 目前職業的圖示（activeJob() 的 icon）：
    // - 認得的職業（key 有值）有網站的圖示：路徑接在 JOB_ICON_BASE 後面；名稱寫在旁邊，替代文字留空
    // - 認不出的職業（key 是 null）：icon 是官網圖示的完整網址，原樣用；旁邊只有等級，替代文字寫「目前職業」
    // - 網站沒有圖示的職業（Beastmaster，icon 是 null）：名稱的第一個字當文字圖示
    jobIcon(job) {
        if (job.icon !== null) {
            const img = LodestoneLookup.element('img', 'job-icon');
            if (job.key !== null) {
                img.src = LodestoneLookup.JOB_ICON_BASE + job.icon;
                img.alt = '';
            } else {
                img.src = job.icon;
                img.alt = this.t('lodestone_active_job', '目前職業');
            }
            return img;
        }
        if (job.key !== null && job.name) {
            const textIcon = LodestoneLookup.element('span', 'job-text-icon', Array.from(job.name)[0]);
            textIcon.setAttribute('aria-hidden', 'true');
            return textIcon;
        }
        return null;
    }

    paintMineToggle(button, id) {
        const mine = LodestoneStore.readMine(this.storage)?.id === id;
        button.setAttribute('aria-pressed', mine ? 'true' : 'false');
        button.textContent = mine ? this.t('lodestone_is_mine', '★ 我的角色') : this.t('lodestone_set_mine', '☆ 設成我的角色');
    }

    loadingBlock() {
        const block = LodestoneLookup.element('div', 'loading');
        block.appendChild(LodestoneLookup.element('div', 'loading-spinner'));
        block.appendChild(LodestoneLookup.element('p', '', this.t('lodestone_loading', '載入中…')));
        return block;
    }

    // 人的一列（最近查過、搜尋結果）：頭像、名字、下面一行（parts：伺服器與部隊，一段一段，見 fillMeta()）、右邊的箭頭；
    // 整列是一顆按鈕，點了打開（事件委派在清單上）。螢幕閱讀器把按鈕裡的字接在一起念：名字和下面那一行中間放一個看不見的停頓
    // （.visually-hidden），畫面不變
    personRow(who, parts) {
        const item = LodestoneLookup.element('li');
        const button = LodestoneLookup.element('button', 'person');
        button.type = 'button';
        button.dataset.id = who.id;
        button.appendChild(this.avatar('person-avatar', who.avatar));
        const text = LodestoneLookup.element('span', 'person-text');
        text.appendChild(LodestoneLookup.element('span', 'person-name', who.name));
        const meta = LodestoneLookup.element('span', 'person-meta');
        this.fillMeta(meta, parts);
        if (meta.textContent !== '') text.appendChild(LodestoneLookup.element('span', 'visually-hidden', this.t('lodestone_spoken_sep', '，')));
        text.appendChild(meta);
        button.appendChild(text);
        const go = LodestoneLookup.element('span', 'person-go', '→');
        go.setAttribute('aria-hidden', 'true');
        button.appendChild(go);
        item.appendChild(button);
        return item;
    }

    // 頭像：名字就寫在旁邊，替代文字留空。頭像是正方形：先給尺寸，圖片還沒載入時版面不會跳（畫面上的大小由 styles.css 決定）
    avatar(className, src) {
        const img = LodestoneLookup.element('img', className);
        img.alt = '';
        img.width = 48;
        img.height = 48;
        img.setAttribute('loading', 'lazy');
        this.setAvatar(img, src);
        return img;
    }

    setAvatar(img, src) {
        if (typeof src === 'string' && src !== '') img.src = src;
        else img.removeAttribute('src');
    }

    // ---------- 字 ----------

    // 「伺服器（資料中心）」；少一個時只寫有的那一個
    whereText(world, dc) {
        const w = typeof world === 'string' ? world : '';
        const d = typeof dc === 'string' ? dc : '';
        if (w !== '' && d !== '') return this.t('lodestone_where', '{world}（{dc}）', { world: w, dc: d });
        return w || d;
    }

    // 職業與等級（「吟遊詩人 Lv100」）：存的是職業鍵，名稱照目前的介面語言查；認不出職業時只有等級，都沒有是空字串
    jobText(key, level) {
        if (key === null && level === null) return '';
        return this.jobLabel(LodestoneModel.activeJob({ Key: key, Level: level }, this.uiLang()));
    }

    jobLabel(job) {
        const parts = [];
        if (job.name) parts.push(job.name);
        if (job.level !== null) parts.push(this.t('lodestone_level', 'Lv{level}', { level: job.level }));
        return parts.join(' ');
    }

    // 名字下面那一行（我的角色卡片、人的一列）：每一段放在自己的 span（.person-meta-part：放不下時整段換到下一行，不從段的中間斷開，
    // 例如「吟遊／詩人」）；空的段不算。分隔的「・」接在前一段的後面：換行時留在行尾，和「）」在同一段，兩個全形標點中間才不會多出空白。
    // 英文的分隔「 · 」後面的空白放在段外面（段是 inline-block，結尾的空白會被吃掉）。看得到與念出來的字和用分隔接成一串時一樣
    fillMeta(element, parts) {
        const separator = this.t('lodestone_sep', '・');
        const mark = separator.trimEnd();
        const space = separator.slice(mark.length);
        const shown = parts.filter((part) => part);
        element.textContent = '';
        shown.forEach((part, index) => {
            const last = index === shown.length - 1;
            element.appendChild(LodestoneLookup.element('span', 'person-meta-part', last ? part : part + mark));
            if (!last && space !== '') element.appendChild(document.createTextNode(space));
        });
    }

    reasonText(reason) {
        const [key, fallback] = Object.prototype.hasOwnProperty.call(LodestoneLookup.REASONS, reason) ? LodestoneLookup.REASONS[reason] : LodestoneLookup.REASONS.failed;
        return this.t(key, fallback);
    }

    // 資料時間（FetchedAt）換成當地時間；沒有（舊 Worker）或讀不懂是 null
    timeText(fetchedAt) {
        if (typeof fetchedAt !== 'string' || fetchedAt === '') return null;
        const date = new Date(fetchedAt);
        if (Number.isNaN(date.getTime())) return null;
        return date.toLocaleString(this.locale(), LodestoneLookup.TIME_FORMAT);
    }

    // 角色畫面的那個人（LodestoneModel.person()）；回應裡沒有 ID 時用打開的 ID
    personOf(current) {
        const who = LodestoneModel.person(current.character);
        if (who.id === '') who.id = current.id;
        return who;
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.lodestoneLookup = new LodestoneLookup();
});
