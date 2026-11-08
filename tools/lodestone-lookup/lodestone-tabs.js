/**
 * Lodestone 角色查詢：角色畫面的六個分頁（職業、成就、裝備、收藏、部隊、其他）。
 *
 * 標記在 index.html（#tabList 的六個 role="tab" 與六個 role="tabpanel"），這裡管：
 * - WAI-ARIA 分頁：選中的分頁 aria-selected="true"、tabindex="0"、.active，其他的 tabindex="-1"，沒選中的面板 hidden；
 *   左右方向鍵移動並切換（頭尾相接），Home／End 到第一個／最後一個；按著 Alt、Ctrl、⌘ 時不處理（那是瀏覽器的快速鍵，Alt＋← 是上一頁）
 * - 第一次打開才載入，同一個角色、同一種名稱與成就顯示只載入一次：職業（/classjob，打開角色時就打）、成就（/achievements，有頁數）、
 *   收藏（/mounts 與 /minions）、部隊（/freecompany/<id> 與 /members，有頁數）；裝備與其他用標頭（角色回應）的資料，不打請求。
 *   失敗的部分寫原因與「再試一次」（重新載入那個分頁失敗的部分，retry()）；下次打開那個分頁時也會再試
 * - 換角色（open()）回到職業、清掉所有分頁；換名稱與成就顯示（reload()）留在原本的分頁、重新載入它，其他分頁清掉，下次打開再載入
 * - 請求都經過 LodestoneLookup 給的 request(context, …)：context 是這個角色的，換角色、換名稱與成就顯示、離開角色畫面時取消。
 *   回答晚到時 isCurrent(context) 不成立就不採用；換頁的請求用當下的 context（它的名稱與成就顯示）。有頁數的（成就、部隊成員）
 *   每打一次多一個號碼，較舊的頁數晚到也不蓋掉最後選的那一頁
 * - 面板的內容換掉時，焦點在裡面某個有 data-focus 的控制項上（換頁按鈕、篩選框、成員的一列、屬性），就放回新畫出來的同一個控制項
 *
 * 規則（職業分組與滿級、角色回應裡的部隊、原文換官方繁中、收藏的名稱篩選、簡介有沒有填）都用 LodestoneModel，這裡只管畫面、事件與請求。
 * 翻譯鍵一律寫成完整的字串（對照表裡也是），不用組的。
 */
class LodestoneTabs {
    static KEYS = Object.freeze(['jobs', 'achievements', 'gear', 'collections', 'fc', 'about']);
    // 鍵盤：方向鍵與 Home／End → 新的位置（超出頭尾時由 moveFocus() 接回另一頭）
    static MOVES = Object.freeze({
        ArrowRight: (index) => index + 1,
        ArrowLeft: (index) => index - 1,
        Home: () => 0,
        End: (index, count) => count - 1
    });
    // 用標頭（角色回應）資料的分頁：裝備與其他直接畫，部隊要標頭裡的部隊 ID
    static FROM_CHARACTER = Object.freeze(['gear', 'fc', 'about']);
    // 職業的分組（LodestoneModel.jobGroups() 的 role）→ 名稱
    static ROLES = Object.freeze({
        tank: ['lodestone_role_tank', '坦克'],
        healer: ['lodestone_role_healer', '治療'],
        melee: ['lodestone_role_melee', '近戰'],
        ranged: ['lodestone_role_ranged', '遠程'],
        magic: ['lodestone_role_magic', '魔法'],
        crafting: ['lodestone_role_crafting', '生產'],
        gathering: ['lodestone_role_gathering', '採集']
    });
    // 裝備的部位（Worker 的 Slot），照遊戲裡的順序；臉部（Facewear）不列：TERMINOLOGY.md 沒有它的官方名稱
    static SLOTS = Object.freeze([
        ['MainHand', 'lodestone_equip_mainhand', '主手'],
        ['OffHand', 'lodestone_equip_offhand', '副手'],
        ['Head', 'lodestone_equip_head', '頭部'],
        ['Body', 'lodestone_equip_body', '身體'],
        ['Hands', 'lodestone_equip_hands', '手部'],
        ['Legs', 'lodestone_equip_legs', '腿部'],
        ['Feet', 'lodestone_equip_feet', '腳部'],
        ['Earrings', 'lodestone_equip_earrings', '耳飾'],
        ['Necklace', 'lodestone_equip_necklace', '頸飾'],
        ['Bracelets', 'lodestone_equip_bracelets', '腕飾'],
        ['Ring1', 'lodestone_equip_ring1', '戒指1'],
        ['Ring2', 'lodestone_equip_ring2', '戒指2'],
        ['SoulCrystal', 'lodestone_equip_soulcrystal', '靈魂水晶']
    ]);
    // 屬性（Worker 角色回應的欄位）：主屬性與副屬性
    static ATTRIBUTE_GROUPS = Object.freeze([
        [['lodestone_main_attributes', '主屬性'], [
            ['Strength', 'lodestone_strength', '力量'],
            ['Dexterity', 'lodestone_dexterity', '靈巧'],
            ['Vitality', 'lodestone_vitality', '耐力'],
            ['Intelligence', 'lodestone_intelligence', '智力'],
            ['Mind', 'lodestone_mind', '精神']
        ]],
        [['lodestone_sub_attributes', '副屬性'], [
            ['CriticalHitRate', 'lodestone_critical', '爆擊'],
            ['Determination', 'lodestone_determination', '意志'],
            ['DirectHitRate', 'lodestone_direct_hit', '直擊'],
            ['SkillSpeed', 'lodestone_skill_speed', '技巧速度'],
            ['SpellSpeed', 'lodestone_spell_speed', '詠唱速度'],
            ['Piety', 'lodestone_piety', '信仰'],
            ['Tenacity', 'lodestone_tenacity', '堅韌']
        ]]
    ]);
    // 收藏的兩個清單：Worker 的端點與欄位、標題（載入好之前只寫名稱，載入好了加上總數）
    static COLLECTIONS = Object.freeze({
        mounts: { path: 'mounts', field: 'Mounts', title: ['lodestone_tab_mounts', '坐騎'], total: ['lodestone_mounts_total', '坐騎 {count}'] },
        minions: { path: 'minions', field: 'Minions', title: ['lodestone_tab_minions', '寵物'], total: ['lodestone_minions_total', '寵物 {count}'] }
    });
    // 部隊和三個大國防聯軍的聲望（Worker 的 Reputation 的鍵），照遊戲裡的順序：黑渦團、雙蛇黨、不滅隊
    static REPUTATIONS = Object.freeze(['MAELSTROM', 'ADDERS', 'FLAMES']);
    // 染色：只畫 #rrggbb 的顏色（由 script 設 style.background，先確認是顏色），一格最多兩色
    static DYE = /^#[0-9a-f]{6}$/i;
    static MAX_DYES = 2;
    // 成就的取得日期：年月日
    static DATE_FORMAT = Object.freeze({ year: 'numeric', month: '2-digit', day: '2-digit' });
    // 裝備、坐騎、寵物的圖示是正方形：先給尺寸，圖片還沒載入時版面不會跳（畫面上的大小由 styles.css 決定）
    static ICON_SIZE = 40;

    // 建一個元素：class 與文字（沒給就不設）
    static element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // Worker 給的字：字串去掉前後空白，數字照寫，其他是空字串
    static plain(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
        return typeof value === 'string' ? value.trim() : '';
    }

    // 一份請求還沒載入，或上次失敗：要打
    static needsLoad(part) {
        return !part.status || part.status === 'error';
    }

    // 有頁數的回答一共幾頁：沒有 Pagination（或讀不懂）是一頁
    static pageTotalOf(data) {
        const total = data && data.Pagination ? Number(data.Pagination.PageTotal) : NaN;
        return Number.isInteger(total) && total > 0 ? total : 1;
    }

    /**
     * @param {object} page - LodestoneLookup 交給分頁的東西
     * @param {Element} page.root - #tabsCard（裡面有 #tabList 與六個面板）
     * @param {(context: object, path: string, params: URLSearchParams) => Promise<object>} page.request - 打 Worker，綁在 context 上
     * @param {(context: object) => boolean} page.isCurrent - 這個 context 還是目前的（沒有換角色、換名稱與成就顯示、離開角色畫面）
     * @param {(key: string, fallback: string, params?: object) => string} page.t - 翻譯
     * @param {() => 'zh' | 'en' | 'ja'} page.uiLang - 介面語言
     * @param {() => string} page.locale - 日期與數字的寫法（zh-TW、en-US、ja-JP）
     * @param {(job: object) => Element | null} page.jobIcon - 職業的圖示（網站的圖示；Beastmaster 是文字圖示）
     * @param {(character: object, className: string) => Element | null} page.nowLine - 「現在：<職業> LvN」那一行
     * @param {(who: object, parts: string[]) => Element} page.personRow - 人的一列（li > button.person[data-id]；parts 是名字下面那一行的每一段）
     * @param {() => Element} page.loadingBlock - 載入中
     * @param {(id: string) => void} page.openCharacter - 打開一個角色（部隊成員的一列）
     * @param {(context: object, name: string) => void} page.setFreeCompanyName - 部隊分頁載入了部隊的名稱（舊 Worker 的標頭沒有名稱）
     */
    constructor(page) {
        this.page = page;
        this.root = page.root;
        this.tabList = this.root.querySelector('[role="tablist"]');
        this.tabs = new Map();
        this.panels = new Map();
        for (const key of LodestoneTabs.KEYS) {
            const tab = this.tabList.querySelector(`[data-tab="${key}"]`);
            this.tabs.set(key, tab);
            this.panels.set(key, document.getElementById(tab.getAttribute('aria-controls')));
        }
        // 目前的角色：LodestoneLookup 的 context、角色 ID、標頭的 Character（還沒回來是 null）
        this.context = null;
        this.id = null;
        this.character = null;
        this.selected = 'jobs';
        // 打開過的分頁 → 它的狀態（見各分頁的 load*()）；換角色、換名稱與成就顯示時整個換新
        this.states = new Map();
        this.bindEvents();
    }

    t(key, fallback, params) {
        return this.page.t(key, fallback, params);
    }

    separator() {
        return this.t('lodestone_sep', '・');
    }

    bindEvents() {
        // 點分頁、換頁按鈕、再試一次、部隊成員的一列（事件委派在 #tabsCard 上，重畫之後不必重新綁；已經不在頁面上的舊按鈕按了也到不了這裡）
        this.root.addEventListener('click', (event) => {
            const tab = event.target.closest('[role="tab"]');
            if (tab && this.tabList.contains(tab)) {
                this.select(tab.dataset.tab);
                return;
            }
            const pageButton = event.target.closest('button[data-pager]');
            if (pageButton) {
                this.turnPage(pageButton);
                return;
            }
            const retry = event.target.closest('button[data-retry]');
            if (retry) {
                this.retry(retry.dataset.retry);
                return;
            }
            const person = event.target.closest('.person');
            if (person && /^\d+$/.test(person.dataset.id ?? '')) this.page.openCharacter(person.dataset.id);
        });
        this.tabList.addEventListener('keydown', (event) => this.moveFocus(event));
        this.root.addEventListener('input', (event) => {
            if (event.target.id === 'collectionFilter') this.filterCollections(event.target.value);
        });
    }

    // 分頁上的方向鍵與 Home／End：移到那個分頁並切換過去（WAI-ARIA 的自動啟用），頭尾相接
    moveFocus(event) {
        const tab = event.target.closest('[role="tab"]');
        if (!tab || event.altKey || event.ctrlKey || event.metaKey) return;
        if (!Object.prototype.hasOwnProperty.call(LodestoneTabs.MOVES, event.key)) return;
        const { KEYS } = LodestoneTabs;
        const next = LodestoneTabs.MOVES[event.key](KEYS.indexOf(tab.dataset.tab), KEYS.length);
        event.preventDefault();
        this.select(KEYS[(next + KEYS.length) % KEYS.length], { focus: true });
    }

    // ---------- 選分頁、換角色 ----------

    /**
     * 切到一個分頁：畫出選中的樣子，第一次打開時載入。
     * @param {string} key - jobs、achievements、gear、collections、fc、about（其他的不理）
     * @param {{focus?: boolean}} options - focus 是 true 時焦點移到那個分頁（鍵盤、標頭的部隊名稱）
     */
    select(key, { focus = false } = {}) {
        if (!this.tabs.has(key)) return;
        this.selected = key;
        for (const [tabKey, tab] of this.tabs) {
            const on = tabKey === key;
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            tab.setAttribute('tabindex', on ? '0' : '-1');
            tab.classList.toggle('active', on);
            this.panels.get(tabKey).hidden = !on;
        }
        if (focus) this.tabs.get(key).focus();
        this.load(key);
    }

    // 打開一個角色（換角色，或同一個角色重新打開）：回到職業，清掉所有分頁，打職業
    open(context, id) {
        this.reset(context, id);
        this.select('jobs');
    }

    // 換了名稱與成就顯示、同一個角色重新載入：留在原本的分頁並重新載入它；其他分頁清掉，下次打開再載入
    reload(context, id) {
        this.reset(context, id);
        this.select(this.selected);
    }

    reset(context, id) {
        this.context = context;
        this.id = String(id);
        this.character = null;
        this.states = new Map();
        for (const panel of this.panels.values()) {
            panel.textContent = '';
            panel.setAttribute('aria-busy', 'false');
        }
    }

    // 標頭（角色回應）回來了：打開過、在等標頭的分頁（裝備、其他、部隊）現在畫得出來
    setCharacter(context, character) {
        if (context !== this.context) return;
        this.character = character;
        for (const key of LodestoneTabs.FROM_CHARACTER) if (this.states.has(key)) this.load(key);
    }

    // 換了介面語言：打開過的分頁照已經有的資料重畫，不重新打請求
    render() {
        for (const key of this.states.keys()) this.draw(key);
    }

    // 打開一個分頁時：還沒載入（或上次失敗）的部分現在載入，已經載入或正在載入的不再打
    load(key) {
        if (this.context === null) return;
        if (key === 'jobs') this.loadJobs();
        else if (key === 'achievements') this.loadAchievements();
        else if (key === 'collections') this.loadCollections();
        else if (key === 'fc') this.loadFreeCompany();
        else this.loadFromCharacter(key);
    }

    // 錯誤訊息旁的「再試一次」：重新載入這個分頁失敗的部分（同 load()，用目前的 context）。按鈕跟著載入中不見了，
    // 所以焦點先移到面板（tabindex="0"），新的內容也畫在面板裡，焦點不會掉到頁面最上面
    retry(key) {
        const panel = this.panels.get(key);
        if (!panel) return;
        if (panel.contains(document.activeElement)) panel.focus();
        this.load(key);
    }

    draw(key) {
        if (key === 'jobs') this.drawJobs();
        else if (key === 'achievements') this.drawAchievements();
        else if (key === 'collections') this.drawCollections();
        else if (key === 'fc') this.drawFreeCompany();
        else if (key === 'gear') this.drawGear();
        else this.drawAbout();
    }

    // ---------- 請求 ----------

    // 請求的參數：dc 是這個角色的名稱與成就顯示（目前的 context 的），有頁數的加上 page
    params(page) {
        const params = new URLSearchParams({ dc: LodestoneModel.dcOf(this.context.dataLang) });
        if (page !== undefined) params.set('page', String(page));
        return params;
    }

    characterPath(endpoint) {
        return `/character/${encodeURIComponent(this.id)}/${endpoint}`;
    }

    /**
     * 打一份請求。part 是它的狀態：status（loading、done、error，403 時可能是 private）、data、reason、token。
     * read(data) 檢查 Worker 的回答，不對就丟錯；它的回傳值是 part.data（read 不能動其他狀態：這時還不知道回答是不是目前的）。
     * 回答晚到時 context 不是目前的（換了角色或名稱與成就顯示、離開了角色畫面），或之後這份請求又打了一次（換頁），就不採用。
     * @returns {Promise<boolean>} 回答有沒有採用（不會被拒絕）
     */
    async fetchPart(part, path, params, read) {
        const context = this.context;
        const token = (part.token ?? 0) + 1;
        Object.assign(part, { token, status: 'loading', reason: null });
        let outcome;
        try {
            outcome = { status: 'done', data: read(await this.page.request(context, path, params)) };
        } catch (error) {
            outcome = part.privateOn403 && error && error.status === 403
                ? { status: 'private' }
                : { status: 'error', reason: error && error.status === 502 ? 'upstream' : 'failed' };
        }
        if (!this.page.isCurrent(context) || context !== this.context || part.token !== token) return false;
        Object.assign(part, outcome);
        return true;
    }

    // fetchPart() 之後先畫一次（載入中），回答有採用時再畫一次
    run(part, path, params, read, draw) {
        const answer = this.fetchPart(part, path, params, read);
        draw();
        return answer.then((current) => {
            if (current) draw();
            return current;
        });
    }

    // ---------- 職業 ----------

    loadJobs() {
        if (!this.states.has('jobs')) this.states.set('jobs', { part: {} });
        const { part } = this.states.get('jobs');
        if (!LodestoneTabs.needsLoad(part)) return;
        this.run(part, this.characterPath('classjob'), this.params(), (data) => {
            if (!data.ClassJobs || typeof data.ClassJobs !== 'object') throw new Error('Worker 的職業回應沒有 ClassJobs');
            return data.ClassJobs;
        }, () => this.drawJobs());
    }

    // 滿級幾個、七組職業、特殊內容
    drawJobs() {
        const { part } = this.states.get('jobs');
        this.fill(this.panels.get('jobs'), (panel) => {
            if (!this.drawPart(panel, part, 'jobs')) return;
            const groups = LodestoneModel.jobGroups(part.data, this.page.uiLang());
            panel.appendChild(LodestoneTabs.element('p', 'maxed-count', this.t('lodestone_jobs_maxed', '滿級 {count} 個', { count: LodestoneModel.maxedCount(groups) })));
            for (const group of groups) panel.appendChild(this.roleGroup(group));
            const special = this.specialContent(part.data.SpecialContent);
            if (special) panel.appendChild(special);
        });
        this.markBusy('jobs');
    }

    // 一組職業：名稱與每個職業（圖示、名稱、等級）。Lv100 是滿級（.max），沒解鎖或 0 級寫「—」（.none）
    roleGroup(group) {
        const box = LodestoneTabs.element('div', 'role-group');
        const [key, fallback] = Object.prototype.hasOwnProperty.call(LodestoneTabs.ROLES, group.role) ? LodestoneTabs.ROLES[group.role] : [null, group.role];
        box.appendChild(LodestoneTabs.element('h3', 'role-label', key === null ? fallback : this.t(key, fallback)));
        const list = LodestoneTabs.element('ul', 'job-list');
        for (const job of group.jobs) {
            const item = LodestoneTabs.element('li', 'job');
            item.classList.toggle('max', job.max);
            item.classList.toggle('none', job.level === null);
            const icon = this.page.jobIcon(job);
            if (icon) item.appendChild(icon);
            item.appendChild(LodestoneTabs.element('span', 'job-name', job.name));
            item.appendChild(LodestoneTabs.element('span', 'job-level', job.level === null ? '—' : String(job.level)));
            list.appendChild(item);
        }
        box.appendChild(list);
        return box;
    }

    // 最下面一行特殊內容：名稱照 Worker 回傳的原文（不照鍵名：鍵沿用 Bozja，內容其實是 Occult Crescent），有等級的才寫；沒有就沒有這一行
    specialContent(special) {
        if (!special || typeof special !== 'object') return null;
        const entries = Object.values(special)
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => [LodestoneTabs.plain(entry.Name), LodestoneTabs.plain(entry.Level)])
            .filter(([name, level]) => name !== '' && /^\d+$/.test(level) && Number(level) > 0)
            .map(([name, level]) => `${name} ${Number(level)}`);
        if (entries.length === 0) return null;
        return LodestoneTabs.element('p', 'special-content', this.t('lodestone_special_content', '特殊內容：{content}', { content: entries.join(this.separator()) }));
    }

    // ---------- 成就 ----------

    loadAchievements() {
        if (!this.states.has('achievements')) this.states.set('achievements', { page: 1, part: { privateOn403: true } });
        const state = this.states.get('achievements');
        if (LodestoneTabs.needsLoad(state.part)) this.loadAchievementsPage(state.page);
    }

    loadAchievementsPage(page) {
        const state = this.states.get('achievements');
        state.page = page;
        this.run(state.part, this.characterPath('achievements'), this.params(page), (data) => {
            if (!Array.isArray(data.Achievements)) throw new Error('Worker 的成就回應沒有 Achievements');
            return data;
        }, () => this.drawAchievements());
    }

    // 成就數與點數、這一頁的成就、上一頁／下一頁。數字與一共幾頁用最後一次載入好的那一頁（換頁時照樣看得到）；
    // 不公開（403）只寫一句
    drawAchievements() {
        const state = this.states.get('achievements');
        const { part } = state;
        this.fill(this.panels.get('achievements'), (panel) => {
            if (part.status === 'private') {
                panel.appendChild(this.emptyState(this.t('lodestone_achievements_private', '這個角色沒有公開成就')));
                return;
            }
            const last = part.data;
            if (last) panel.appendChild(this.achievementSummary(last));
            if (this.drawPart(panel, part, 'achievements')) panel.appendChild(this.achievementList(part.data.Achievements));
            const total = LodestoneTabs.pageTotalOf(last);
            if (total > 1) panel.appendChild(this.pager('achievements', state.page, total));
        });
        this.markBusy('achievements');
    }

    achievementSummary(data) {
        const line = LodestoneTabs.element('p', 'achievement-summary');
        const stat = (value, unit) => {
            const item = LodestoneTabs.element('span', 'achievement-stat');
            item.appendChild(LodestoneTabs.element('span', 'achievement-number', this.number(value)));
            item.appendChild(document.createTextNode(' '));
            item.appendChild(LodestoneTabs.element('span', 'achievement-unit', unit));
            return item;
        };
        line.appendChild(stat(data.TotalAchievements, this.t('lodestone_achievement_unit', '個成就')));
        line.appendChild(stat(data.AchievementPoints, this.t('lodestone_point_unit', '點')));
        return line;
    }

    achievementList(achievements) {
        const list = LodestoneTabs.element('ul', 'achievement-list');
        for (const achievement of achievements) {
            if (!achievement || typeof achievement.Name !== 'string') continue;
            const item = LodestoneTabs.element('li', 'achievement');
            item.appendChild(LodestoneTabs.element('span', 'achievement-name', achievement.Name));
            const date = this.dateOf(achievement.Time);
            if (date) item.appendChild(date);
            list.appendChild(item);
        }
        return list;
    }

    // 取得日期：<time datetime="ISO">年月日</time>；空字串（官網沒給日期）或讀不懂是 null
    dateOf(time) {
        if (typeof time !== 'string' || time === '') return null;
        const date = new Date(time);
        if (Number.isNaN(date.getTime())) return null;
        const node = LodestoneTabs.element('time', 'achievement-date', date.toLocaleDateString(this.page.locale(), LodestoneTabs.DATE_FORMAT));
        node.setAttribute('datetime', time);
        return node;
    }

    // ---------- 換頁（成就、部隊成員） ----------

    // 上一頁、「第 N 頁，共 M 頁」、下一頁。到頭的按鈕用 aria-disabled（不用 disabled：焦點會掉），按了沒反應；
    // data-focus 讓重畫之後焦點回到同一顆按鈕
    pager(name, page, total) {
        const box = LodestoneTabs.element('div', 'pager');
        box.appendChild(this.pageButton(name, 'prev', page - 1, page <= 1, this.t('lodestone_pagination_prev', '上一頁')));
        box.appendChild(LodestoneTabs.element('span', 'pager-info', this.t('lodestone_pagination_info', '第 {page} 頁，共 {total} 頁', { page, total })));
        box.appendChild(this.pageButton(name, 'next', page + 1, page >= total, this.t('lodestone_pagination_next', '下一頁')));
        return box;
    }

    pageButton(name, direction, target, off, label) {
        const button = LodestoneTabs.element('button', 'btn btn-sm', label);
        button.type = 'button';
        button.dataset.pager = name;
        button.dataset.page = String(target);
        button.dataset.focus = `${name}-${direction}`;
        if (off) button.setAttribute('aria-disabled', 'true');
        return button;
    }

    // 換頁按鈕：打那一頁（用當下的 context）
    turnPage(button) {
        if (button.getAttribute('aria-disabled') === 'true') return;
        const page = Number(button.dataset.page);
        if (!Number.isInteger(page) || page < 1) return;
        if (button.dataset.pager === 'achievements' && this.states.has('achievements')) this.loadAchievementsPage(page);
        else if (button.dataset.pager === 'members' && this.states.get('fc')?.members) this.loadMembersPage(page);
    }

    // ---------- 裝備與其他（用標頭的資料） ----------

    // 不打請求。標頭還沒回來（換名稱與成就顯示、重新打標頭的時候）先寫載入中，回來了再畫（setCharacter()）
    loadFromCharacter(key) {
        const state = this.states.get(key);
        if (state && state.ready) return;
        this.states.set(key, { ready: this.character !== null });
        this.draw(key);
    }

    // 現在的職業、每一格裝備（圖示、部位名稱、染色）與說明（沒有裝備時寫沒有）、收起來的屬性
    drawGear() {
        const panel = this.panels.get('gear');
        const opened = panel.querySelector('details')?.open === true;
        this.fill(panel, (box) => {
            const { character } = this;
            if (!character) {
                box.appendChild(this.page.loadingBlock());
                return;
            }
            const now = this.page.nowLine(character, 'gear-now');
            if (now) box.appendChild(now);
            const cells = this.gearCells(character.Gear);
            if (cells.length === 0) {
                box.appendChild(LodestoneTabs.element('p', 'gear-none', this.t('lodestone_gear_none', '沒有裝備資料。')));
            } else {
                const list = LodestoneTabs.element('ul', 'gear-list');
                for (const cell of cells) list.appendChild(cell);
                box.appendChild(list);
                box.appendChild(LodestoneTabs.element('p', 'gear-note', this.t('lodestone_gear_note', 'Lodestone 的角色頁只有裝備圖示，沒有名稱。')));
            }
            const attributes = this.attributes(character, opened);
            if (attributes) box.appendChild(attributes);
        });
        this.markBusy('gear');
    }

    // 每一格裝備：照部位的順序（不照回應的順序），有圖示的才列；臉部與認不得的部位不列。
    // 圖示的替代文字是空的，格子的名稱是寫在裡面的部位名稱
    gearCells(gear) {
        const items = Array.isArray(gear) ? gear.filter((item) => item && typeof item.Icon === 'string' && item.Icon !== '') : [];
        const cells = [];
        for (const [slot, key, fallback] of LodestoneTabs.SLOTS) {
            const item = items.find((candidate) => candidate.Slot === slot);
            if (!item) continue;
            const cell = LodestoneTabs.element('li', 'gear-slot');
            cell.appendChild(this.icon('gear-icon', item.Icon));
            cell.appendChild(LodestoneTabs.element('span', 'gear-slot-name', this.t(key, fallback)));
            const dyes = this.dyes(item.Dyes);
            if (dyes) cell.appendChild(dyes);
            cells.push(cell);
        }
        return cells;
    }

    // 染過的顏色：#rrggbb 的才畫（由 script 設 style.background），最多兩色；色點只是畫面（aria-hidden）。沒有染就是 null
    dyes(colors) {
        const valid = Array.isArray(colors) ? colors.filter((color) => typeof color === 'string' && LodestoneTabs.DYE.test(color)).slice(0, LodestoneTabs.MAX_DYES) : [];
        if (valid.length === 0) return null;
        const box = LodestoneTabs.element('span', 'dyes');
        for (const color of valid) {
            const dot = LodestoneTabs.element('span', 'dye');
            dot.style.background = color;
            dot.setAttribute('aria-hidden', 'true');
            box.appendChild(dot);
        }
        return box;
    }

    // 屬性（<details>，一開始收起來；換介面語言重畫時照原本開著或收著）：主屬性與副屬性，官網沒有寫的不列，一個都沒有就沒有這一塊
    attributes(character, opened) {
        const groups = LodestoneTabs.ATTRIBUTE_GROUPS
            .map(([[key, fallback], rows]) => [this.t(key, fallback), rows.filter(([field]) => LodestoneTabs.plain(character[field]) !== '')])
            .filter(([, rows]) => rows.length > 0);
        if (groups.length === 0) return null;
        const details = LodestoneTabs.element('details', 'attributes');
        if (opened) details.open = true;
        const summary = LodestoneTabs.element('summary', '', this.t('lodestone_attributes', '屬性'));
        summary.dataset.focus = 'attributes';
        details.appendChild(summary);
        for (const [title, rows] of groups) {
            const group = LodestoneTabs.element('div', 'attribute-group');
            group.appendChild(LodestoneTabs.element('h4', 'attribute-title', title));
            const list = LodestoneTabs.element('dl', 'attribute-list');
            for (const [field, key, fallback] of rows) this.definition(list, this.t(key, fallback), LodestoneTabs.plain(character[field]));
            group.appendChild(list);
            details.appendChild(group);
        }
        return details;
    }

    // 大國防聯軍（官方名稱加軍階原文）、生日、守護神、開始城市（官方名稱）、個人簡介（保留換行；沒填就不寫）
    drawAbout() {
        this.fill(this.panels.get('about'), (box) => {
            const { character } = this;
            if (!character) {
                box.appendChild(this.page.loadingBlock());
                return;
            }
            const uiLang = this.page.uiLang();
            const list = LodestoneTabs.element('dl', 'about-list');
            this.definition(list, this.t('lodestone_grand_company', '大國防聯軍'), this.grandCompanyText(character.GrandCompany));
            this.definition(list, this.t('lodestone_nameday', '生日'), LodestoneTabs.plain(character.Nameday));
            this.definition(list, this.t('lodestone_deity', '守護神'), LodestoneTabs.plain(character.GuardianDeity?.Name));
            const town = LodestoneTabs.plain(character.Town?.Name);
            this.definition(list, this.t('lodestone_city', '開始城市'), town === '' ? '' : LodestoneModel.term('town', town, uiLang));
            if (!LodestoneModel.isEmptyBio(character.Bio)) this.definition(list, this.t('lodestone_bio', '個人簡介'), (dd) => this.appendLines(dd, character.Bio));
            box.appendChild(list);
        });
        this.markBusy('about');
    }

    // 「雙蛇黨・<軍階原文>」：名稱在中文介面換成官方繁中，軍階照原文；沒有加入是空字串
    grandCompanyText(grandCompany) {
        if (!grandCompany || typeof grandCompany !== 'object') return '';
        const name = LodestoneTabs.plain(grandCompany.Name);
        if (name === '') return '';
        return [LodestoneModel.term('grandCompany', name, this.page.uiLang()), LodestoneTabs.plain(grandCompany.Rank)].filter(Boolean).join(this.separator());
    }

    // 保留換行：每一行一個文字節點，中間放 <br>（不用 innerHTML）
    appendLines(container, text) {
        String(text).replace(/\r\n?/g, '\n').trim().split('\n').forEach((line, index) => {
            if (index > 0) container.appendChild(document.createElement('br'));
            container.appendChild(document.createTextNode(line));
        });
    }

    // ---------- 收藏 ----------

    // 坐騎與寵物同時打；篩選框的字與每一列在 state 裡（篩選只切換 hidden，不重畫）
    loadCollections() {
        if (!this.states.has('collections')) {
            this.states.set('collections', { filter: '', mounts: {}, minions: {}, views: { mounts: null, minions: null } });
            this.drawCollections();
        }
        const state = this.states.get('collections');
        for (const kind of Object.keys(LodestoneTabs.COLLECTIONS)) {
            const { path, field } = LodestoneTabs.COLLECTIONS[kind];
            if (!LodestoneTabs.needsLoad(state[kind])) continue;
            this.run(state[kind], this.characterPath(path), this.params(), (data) => {
                if (!Array.isArray(data[field])) throw new Error(`Worker 的收藏回應沒有 ${field}`);
                return data;
            }, () => this.drawCollection(kind));
        }
    }

    // 篩選框與兩個清單
    drawCollections() {
        const state = this.states.get('collections');
        this.fill(this.panels.get('collections'), (panel) => {
            const filter = LodestoneTabs.element('div', 'form-group collection-filter');
            const label = LodestoneTabs.element('label', 'form-label', this.t('lodestone_filter_names', '篩選名稱'));
            label.setAttribute('for', 'collectionFilter');
            const input = LodestoneTabs.element('input', 'form-control');
            input.type = 'search';
            input.id = 'collectionFilter';
            input.value = state.filter;
            input.setAttribute('autocomplete', 'off');
            input.setAttribute('spellcheck', 'false');
            input.dataset.focus = 'collection-filter';
            filter.appendChild(label);
            filter.appendChild(input);
            panel.appendChild(filter);
            for (const kind of Object.keys(LodestoneTabs.COLLECTIONS)) {
                const section = LodestoneTabs.element('section', 'collection');
                section.dataset.collection = kind;
                panel.appendChild(section);
                this.fillCollection(section, kind);
            }
        });
        this.markBusy('collections');
    }

    // 只重畫一個清單：另一個清單與篩選框不動，打到一半的字與焦點都留著
    drawCollection(kind) {
        const section = this.panels.get('collections').querySelector(`section[data-collection="${kind}"]`);
        if (section) this.fillCollection(section, kind);
        else this.drawCollections();
        this.markBusy('collections');
    }

    // 一個清單：標題（坐騎 N）、圖示加名稱的每一列、篩選後一個都沒有時的一句
    fillCollection(section, kind) {
        const state = this.states.get('collections');
        const part = state[kind];
        const { field, title, total } = LodestoneTabs.COLLECTIONS[kind];
        state.views[kind] = null;
        this.fill(section, (box) => {
            if (part.status !== 'done') {
                box.appendChild(LodestoneTabs.element('h3', 'collection-title', this.t(title[0], title[1])));
                this.drawPart(box, part, 'collections', kind);
                return;
            }
            const items = part.data[field].filter((item) => item && typeof item.Name === 'string');
            const count = Number.isInteger(part.data.Total) ? part.data.Total : items.length;
            box.appendChild(LodestoneTabs.element('h3', 'collection-title', this.t(total[0], total[1], { count: this.number(count) })));
            const list = LodestoneTabs.element('ul', 'collection-list');
            const rows = items.map((item) => {
                const row = LodestoneTabs.element('li', 'collection-item');
                row.appendChild(this.icon('collection-icon', item.Icon));
                row.appendChild(LodestoneTabs.element('span', 'collection-name', item.Name));
                list.appendChild(row);
                return [item, row];
            });
            box.appendChild(list);
            const empty = LodestoneTabs.element('p', 'collection-empty', this.t('lodestone_filter_none', '沒有符合的名稱'));
            box.appendChild(empty);
            state.views[kind] = { rows, empty };
            this.applyFilter(state.views[kind], state.filter);
        });
    }

    filterCollections(query) {
        const state = this.states.get('collections');
        if (!state) return;
        state.filter = String(query);
        for (const kind of Object.keys(LodestoneTabs.COLLECTIONS)) this.applyFilter(state.views[kind], state.filter);
    }

    // 名稱篩選（LodestoneModel.filterByName()：不分大小寫的子字串）只切換每一列的 hidden；清單有東西卻一個都不符合時寫出來
    applyFilter(view, query) {
        if (!view) return;
        const shown = new Set(LodestoneModel.filterByName(view.rows.map(([item]) => item), query));
        for (const [item, row] of view.rows) row.hidden = !shown.has(item);
        view.empty.hidden = shown.size > 0 || view.rows.length === 0;
    }

    // ---------- 部隊 ----------

    // 要標頭裡的部隊 ID：標頭還沒回來時先寫載入中（setCharacter() 再來）；沒有加入部隊不打請求
    loadFreeCompany() {
        if (!this.character) {
            if (!this.states.has('fc')) this.states.set('fc', { waiting: true });
            this.drawFreeCompany();
            return;
        }
        let state = this.states.get('fc');
        if (!state || state.waiting) {
            const fc = LodestoneModel.freeCompanyOf(this.character);
            state = fc ? { id: fc.id, details: {}, members: { page: 1 } } : { none: true };
            this.states.set('fc', state);
            this.drawFreeCompany();
        }
        if (state.none) return;
        if (LodestoneTabs.needsLoad(state.details)) {
            const { context } = this;
            this.run(state.details, `/freecompany/${encodeURIComponent(state.id)}`, this.params(), (data) => {
                const fc = data.FreeCompany;
                if (!fc || typeof fc !== 'object' || Array.isArray(fc)) throw new Error('Worker 的部隊回應沒有 FreeCompany');
                return fc;
            }, () => this.drawFreeCompanyPart('.fc-details')).then((current) => {
                // 舊 Worker 的標頭沒有部隊名稱：補上
                if (current && state.details.status === 'done') this.page.setFreeCompanyName(context, LodestoneTabs.plain(state.details.data.Name));
            });
        }
        if (LodestoneTabs.needsLoad(state.members)) this.loadMembersPage(state.members.page);
    }

    loadMembersPage(page) {
        const state = this.states.get('fc');
        state.members.page = page;
        this.run(state.members, `/freecompany/${encodeURIComponent(state.id)}/members`, this.params(page), (data) => {
            if (!Array.isArray(data.Members)) throw new Error('Worker 的成員回應沒有 Members');
            return data;
        }, () => this.drawFreeCompanyPart('.fc-members'));
    }

    // 部隊的資料與成員列表（兩個請求，各自畫）；沒有加入部隊寫一句
    drawFreeCompany() {
        const state = this.states.get('fc');
        this.fill(this.panels.get('fc'), (panel) => {
            if (state.waiting) {
                panel.appendChild(this.page.loadingBlock());
                return;
            }
            if (state.none) {
                panel.appendChild(this.emptyState(this.t('lodestone_fc_none', '沒有加入部隊')));
                return;
            }
            const details = LodestoneTabs.element('div', 'fc-details');
            panel.appendChild(details);
            this.fillFreeCompanyDetails(details);
            const members = LodestoneTabs.element('section', 'fc-members');
            panel.appendChild(members);
            this.fillMembers(members);
        });
        this.markBusy('fc');
    }

    // 只重畫部隊的資料（.fc-details）或成員（.fc-members），另一塊不動
    drawFreeCompanyPart(selector) {
        const box = this.panels.get('fc').querySelector(selector);
        if (!box) this.drawFreeCompany();
        else if (selector === '.fc-details') this.fillFreeCompanyDetails(box);
        else this.fillMembers(box);
        this.markBusy('fc');
    }

    // 名稱、標語、人數、排名、招募狀態、部隊房屋、活動重點、招募對象、三國聲望（不寫 Tag 與 ActiveState：Worker 讀錯元素，設計也沒列）
    fillFreeCompanyDetails(container) {
        const { details } = this.states.get('fc');
        this.fill(container, (box) => {
            if (!this.drawPart(box, details, 'fc', 'details')) return;
            const fc = details.data;
            box.appendChild(LodestoneTabs.element('h3', 'fc-name', LodestoneTabs.plain(fc.Name)));
            const slogan = LodestoneTabs.plain(fc.Slogan);
            if (slogan !== '') box.appendChild(LodestoneTabs.element('p', 'fc-slogan', slogan));
            const facts = LodestoneTabs.element('dl', 'fc-facts');
            this.definition(facts, this.t('lodestone_fc_members', '人數'), LodestoneTabs.plain(fc.ActiveMemberCount));
            this.definition(facts, this.t('lodestone_fc_rank', '排名'), this.rankingText(fc.Ranking));
            this.definition(facts, this.t('lodestone_fc_recruitment', '招募狀態'), LodestoneTabs.plain(fc.Recruitment));
            this.definition(facts, this.t('lodestone_fc_estate', '部隊房屋'), this.estateText(fc.Estate));
            this.definition(facts, this.t('lodestone_fc_focus', '活動重點'), this.termList('focus', fc.Focus));
            this.definition(facts, this.t('lodestone_fc_seeking', '招募對象'), this.termList('seeking', fc.Seeking));
            this.definition(facts, this.t('lodestone_fc_reputation', '大國防聯軍聲望'), this.reputationList(fc.Reputation));
            box.appendChild(facts);
        });
    }

    // 上週與上個月的排名；沒有排名是空字串
    rankingText(ranking) {
        if (!ranking || typeof ranking !== 'object') return '';
        const weekly = LodestoneTabs.plain(ranking.Weekly);
        const monthly = LodestoneTabs.plain(ranking.Monthly);
        return [
            weekly === '' ? '' : this.t('lodestone_fc_ranking_weekly', '每週 {rank}', { rank: weekly }),
            monthly === '' ? '' : this.t('lodestone_fc_ranking_monthly', '每月 {rank}', { rank: monthly })
        ].filter(Boolean).join(this.separator());
    }

    // 部隊房屋的名稱與位置；沒有房屋是空字串
    estateText(estate) {
        if (!estate || typeof estate !== 'object') return '';
        return [LodestoneTabs.plain(estate.Name), LodestoneTabs.plain(estate.Plot)].filter(Boolean).join(this.separator());
    }

    // 活動重點、招募對象：每一項在中文介面換成官方繁中（LodestoneModel.term()）
    termList(kind, values) {
        if (!Array.isArray(values)) return '';
        const uiLang = this.page.uiLang();
        return values.map(LodestoneTabs.plain).filter(Boolean).map((value) => LodestoneModel.term(kind, value, uiLang)).join(this.separator());
    }

    // 三國聲望：「黑渦團・同盟」一國一項，名稱與聲望等級在中文介面換成官方繁中；一國都沒有是 null
    reputationList(reputation) {
        if (!reputation || typeof reputation !== 'object') return null;
        const uiLang = this.page.uiLang();
        const list = LodestoneTabs.element('ul', 'fc-reputation');
        for (const key of LodestoneTabs.REPUTATIONS) {
            const entry = reputation[key];
            const name = entry && typeof entry === 'object' ? LodestoneTabs.plain(entry.NAME) : '';
            if (name === '') continue;
            const rank = LodestoneTabs.plain(entry.RANK);
            const text = [LodestoneModel.term('grandCompany', name, uiLang), rank === '' ? '' : LodestoneModel.term('reputation', rank, uiLang)].filter(Boolean).join(this.separator());
            list.appendChild(LodestoneTabs.element('li', '', text));
        }
        return list.children.length > 0 ? list : null;
    }

    // 成員列表：每一列是人的一列（頭像、名字、部隊階級的原文），點了打開那個成員；上一頁／下一頁
    fillMembers(container) {
        const { members } = this.states.get('fc');
        this.fill(container, (box) => {
            box.appendChild(LodestoneTabs.element('h3', 'fc-members-title', this.t('lodestone_fc_member_list', '成員')));
            if (this.drawPart(box, members, 'fc', 'members')) {
                const list = LodestoneTabs.element('ul', 'person-list');
                for (const member of members.data.Members) {
                    const id = member && (typeof member.ID === 'string' || typeof member.ID === 'number') ? String(member.ID) : '';
                    if (!/^\d+$/.test(id) || typeof member.Name !== 'string') continue;
                    const row = this.page.personRow({ id, name: member.Name, avatar: member.Avatar }, [LodestoneTabs.plain(member.FCRank)]);
                    row.querySelector('button.person').dataset.focus = `member-${id}`;
                    list.appendChild(row);
                }
                box.appendChild(list);
            }
            const total = LodestoneTabs.pageTotalOf(members.data);
            if (total > 1) box.appendChild(this.pager('members', members.page, total));
        });
    }

    // ---------- 畫面的小零件 ----------

    /**
     * 換掉 container 裡的東西。焦點在裡面某個有 data-focus 的控制項上時，畫好之後放回新畫出來的同一個控制項
     * （換頁按鈕、篩選框、成員的一列、屬性）；找不到就算了。
     * @param {Element} container
     * @param {(container: Element) => void} build
     */
    fill(container, build) {
        const active = document.activeElement;
        const focusKey = active && active !== container && container.contains(active) ? active.getAttribute('data-focus') : null;
        container.textContent = '';
        build(container);
        if (focusKey) {
            const target = container.querySelector(`[data-focus="${focusKey}"]`);
            if (target) target.focus();
        }
    }

    // 一份請求還沒好時畫載入中或錯誤訊息（回傳 false），載入好了回傳 true（由呼叫的地方畫資料）。
    // key 是這份請求的分頁（「再試一次」重新載入它），name 分辨同一個分頁裡的兩份請求（收藏的坐騎與寵物、部隊的資料與成員）
    drawPart(container, part, key, name = key) {
        if (part.status === 'done') return true;
        container.appendChild(part.status === 'error' ? this.errorMessage(part.reason, key, name) : this.page.loadingBlock());
        return false;
    }

    // 錯誤訊息（502 是 Lodestone 連不上，其他是查詢失敗）與「再試一次」；data-focus 讓重畫（換介面語言）之後焦點回到同一顆按鈕
    errorMessage(reason, key, name) {
        const box = LodestoneTabs.element('div', 'tab-error');
        const text = reason === 'upstream'
            ? this.t('lodestone_error_upstream', 'Lodestone 暫時連不上，請稍後再試')
            : this.t('lodestone_error_query_failed', '查詢失敗');
        box.appendChild(LodestoneTabs.element('p', 'error-message', text));
        const retry = LodestoneTabs.element('button', 'btn btn-sm', this.t('lodestone_retry', '再試一次'));
        retry.type = 'button';
        retry.dataset.retry = key;
        retry.dataset.focus = `retry-${name}`;
        box.appendChild(retry);
        return box;
    }

    // 不是錯誤、只是沒有（成就不公開、沒有加入部隊）
    emptyState(text) {
        const box = LodestoneTabs.element('div', 'empty-state');
        box.appendChild(LodestoneTabs.element('p', 'empty-state-title', text));
        return box;
    }

    // dl 的一列；value 是字（空的不寫這一列）、元素（null 不寫），或往 dd 裡放東西的函式
    definition(list, label, value) {
        if (value === '' || value === null || value === undefined) return;
        const term = LodestoneTabs.element('dt', '', label);
        const description = LodestoneTabs.element('dd');
        if (typeof value === 'string') description.textContent = value;
        else if (typeof value === 'function') value(description);
        else description.appendChild(value);
        list.appendChild(term);
        list.appendChild(description);
    }

    // 圖示（裝備、坐騎、寵物）：名稱寫在旁邊，替代文字留空
    icon(className, src) {
        const img = LodestoneTabs.element('img', className);
        if (typeof src === 'string' && src !== '') img.src = src;
        img.alt = '';
        img.width = LodestoneTabs.ICON_SIZE;
        img.height = LodestoneTabs.ICON_SIZE;
        img.setAttribute('loading', 'lazy');
        return img;
    }

    // 數字照介面語言加千分位（成就數是數字，點數與部隊人數是 Worker 的字串）；不是數字的照原樣
    number(value) {
        const digits = LodestoneTabs.plain(value);
        return /^\d+$/.test(digits) ? Number(digits).toLocaleString(this.page.locale()) : digits;
    }

    // 面板的 aria-busy：裡面還有在載入的請求（或在等標頭）時是 true
    markBusy(key) {
        this.panels.get(key).setAttribute('aria-busy', this.isBusy(key) ? 'true' : 'false');
    }

    isBusy(key) {
        const state = this.states.get(key);
        if (!state) return false;
        const loading = (part) => Boolean(part) && part.status === 'loading';
        if (key === 'jobs' || key === 'achievements') return loading(state.part);
        if (key === 'collections') return loading(state.mounts) || loading(state.minions);
        if (key === 'fc') return Boolean(state.waiting) || loading(state.details) || loading(state.members);
        return !state.ready;
    }
}

// Export for use in other modules
window.LodestoneTabs = LodestoneTabs;
