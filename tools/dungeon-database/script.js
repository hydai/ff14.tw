// 副本資料庫
// 規則（取出與排序、搜尋與篩選、命中了哪些欄位、標示用的切段、獎勵文字）在不碰 DOM 的 dungeon-list.js（DungeonList），這裡只管畫面與事件。
// render() 照 state 重畫看得到的一切：篩選按鈕、手機的「篩選」按鈕、筆數、前 shown 列、找不到的畫面、「顯示更多」、資料來源的筆數。
// 展開與收起（toggleRow）只改那一列，「顯示更多」（showMore）只在後面加新的列，兩者都不重畫已經在的列，焦點才會留在原地。
// 手機版面（MOBILE_QUERY）把篩選面板收在搜尋框旁的「篩選」按鈕後面（state.filtersOpen）；收不收只有 style.css 的手機 @media 管，電腦版面面板一直在。
// 找不到（載入完而且 0 個符合）時顯示 #noResults：標題寫搜尋字或「條件」，有搜尋字才有「清除搜尋」，有選篩選才有「清除篩選」。
// 載入失敗只顯示錯誤訊息，不在 console 留東西。
class DungeonDatabase {
    static DATA_URL = '../../data/dungeons.json';
    // 搜尋框打字後延遲幾毫秒再套用
    static SEARCH_DELAY = 300;
    // 手機版面：窄螢幕，或橫放的矮視窗。和 tools/guide/sidebar-template.js 的 MOBILE_QUERY、style.css 的手機 @media 逐字相同
    static MOBILE_QUERY = '(max-width: 768px), (max-height: 500px)';

    // 建一個元素：class 與文字（沒給就不設）
    static element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    constructor() {
        // 載入完才有：dungeons（DungeonList.prepare() 的結果：顯示中的副本，版本由新到舊）、versionNames（data.metadata.expansions：版本 -> 名稱）
        this.dungeons = [];
        this.versionNames = {};
        this.loaded = false;
        this.loadFailed = false;
        // 目前的搜尋與篩選的結果（DungeonList.filter() 的結果，順序同 dungeons）；showMore() 從這裡接著加列
        this.results = [];
        // query 是套用中的搜尋字（去掉前後空白，沒轉小寫）；types、versions 是選取的篩選；shown 是最多列出幾列；expanded 是展開著的副本 id；
        // filtersOpen 是手機版面的篩選面板展開了沒（預設收起；電腦版面面板一直在，這個值不影響畫面）
        this.state = { query: '', types: new Set(), versions: new Set(), shown: DungeonList.BATCH, expanded: new Set(), filtersOpen: false };
        // 還沒跑的延遲搜尋
        this.searchTimer = null;

        this.elements = {
            searchInput: document.getElementById('searchInput'),
            filterCard: document.getElementById('filterCard'),
            filterToggle: document.getElementById('filterToggle'),
            filterPanel: document.getElementById('filterPanel'),
            typeTags: document.getElementById('typeTags'),
            expansionTags: document.getElementById('expansionTags'),
            clearFilters: document.getElementById('clearFilters'),
            resultCount: document.getElementById('resultCount'),
            loading: document.getElementById('loading'),
            list: document.getElementById('dungeonList'),
            noResults: document.getElementById('noResults'),
            noResultsTitle: document.getElementById('noResultsTitle'),
            clearSearch: document.getElementById('clearSearch'),
            clearFiltersEmpty: document.getElementById('clearFiltersEmpty'),
            showMore: document.getElementById('showMore'),
            loadError: document.getElementById('loadError'),
            dataCount: document.getElementById('dataCount')
        };

        // 搜尋：打字後延遲 SEARCH_DELAY 再套用，後一次取代前一次
        this.elements.searchInput.addEventListener('input', () => {
            this.cancelSearch();
            this.searchTimer = setTimeout(() => {
                this.searchTimer = null;
                this.applyConditions();
            }, DungeonDatabase.SEARCH_DELAY);
        });

        // 篩選按鈕：同一組裡選取或取消，立刻套用
        for (const [group, key, selected] of [
            [this.elements.typeTags, 'type', this.state.types],
            [this.elements.expansionTags, 'expansion', this.state.versions]
        ]) {
            group.addEventListener('click', (event) => {
                const chip = event.target.closest('.chip');
                if (!chip) return;
                const value = chip.dataset[key];
                if (selected.has(value)) selected.delete(value);
                else selected.add(value);
                this.applyConditions();
            });
        }

        // 清除篩選：只清兩組篩選，不清搜尋字。沒選任何篩選時是 aria-disabled，按了什麼都不做，焦點留在按鈕上
        this.elements.clearFilters.addEventListener('click', () => this.clearFilters());

        // 手機的「篩選」按鈕：展開或收起面板
        this.elements.filterToggle.addEventListener('click', () => this.toggleFilters());
        // 視窗變成手機版面時，焦點在面板裡就把面板展開（沒有 matchMedia 的環境不處理）
        const phone = window.matchMedia?.(DungeonDatabase.MOBILE_QUERY);
        if (phone) phone.addEventListener('change', (event) => this.followViewport(event.matches));

        // 找不到時的出路。兩顆按鈕都隨空狀態收起，焦點不能留在上面：清完回到搜尋框
        this.elements.clearSearch.addEventListener('click', () => this.clearSearch());
        this.elements.clearFiltersEmpty.addEventListener('click', () => {
            this.clearFilters();
            this.elements.searchInput.focus();
        });

        // 列表：點某一列（含裡面的字）展開或收起；事件委派在列表上，重畫之後不必重新綁
        this.elements.list.addEventListener('click', (event) => {
            const row = event.target.closest('.dungeon-row');
            if (row) this.toggleRow(Number(row.dataset.id));
        });
        this.elements.showMore.addEventListener('click', () => this.showMore());

        // 切換語言：重畫看得到的文字，展開與已列出的筆數不變
        window.i18n.onLanguageChange(() => this.render());

        this.ready = this.init();
    }

    t(key, fallback, params) {
        return FF14Utils.getI18nText(key, fallback, params);
    }

    async init() {
        try {
            const response = await fetch(DungeonDatabase.DATA_URL);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            this.dungeons = DungeonList.prepare(data);
            this.versionNames = (data.metadata && data.metadata.expansions) || {};
        } catch (error) {
            // 只顯示錯誤訊息（render() 畫），不在 console 留東西
            this.loadFailed = true;
            this.render();
            return;
        }
        this.loaded = true;
        // 瀏覽器重新整理後可能還原搜尋框裡的字：照搜尋框現在的字開始
        this.state.query = this.elements.searchInput.value.trim();
        this.render();
    }

    // ---------- 動作 ----------

    cancelSearch() {
        if (this.searchTimer === null) return;
        clearTimeout(this.searchTimer);
        this.searchTimer = null;
    }

    // 套用搜尋框現在的字與選取的篩選，回到第一批。搜尋框打字的延遲到了、點篩選按鈕、清除篩選都走這裡：
    // 按鈕立刻套用搜尋框現在的字，所以還沒跑的延遲搜尋要取消，不然它之後會再套用一次
    applyConditions() {
        this.cancelSearch();
        this.state.query = this.elements.searchInput.value.trim();
        this.state.shown = DungeonList.BATCH;
        this.render();
    }

    // 清掉兩組篩選（不動搜尋字）並重新套用。本來就沒選任何篩選時什麼都不做
    clearFilters() {
        const { types, versions } = this.state;
        if (types.size === 0 && versions.size === 0) return;
        types.clear();
        versions.clear();
        this.applyConditions();
    }

    // 清除搜尋：搜尋框清空並立刻套用（applyConditions() 會取消還沒跑的延遲搜尋，之後不會把舊的字套回來），焦點回到搜尋框。
    // 找不到時按的就是這個：按鈕隨空狀態收起，焦點不能留在上面
    clearSearch() {
        this.elements.searchInput.value = '';
        this.applyConditions();
        this.elements.searchInput.focus();
    }

    // 手機的「篩選」按鈕：展開或收起面板。面板跟著 state.filtersOpen，只改開合，不動已套用的篩選
    toggleFilters() {
        this.state.filtersOpen = !this.state.filtersOpen;
        this.renderFilterToggle();
    }

    // 視窗變成手機版面（isPhone）：焦點在面板裡就把面板展開，不然面板一收起來（display: none）焦點會掉回頁面最上面；
    // 焦點在別處就照原來的開合。變回電腦版面什麼都不用做：面板一直在，開合照舊記著
    followViewport(isPhone) {
        if (!isPhone || !this.elements.filterPanel.contains(document.activeElement)) return;
        this.state.filtersOpen = true;
        this.renderFilterToggle();
    }

    // 展開或收起某一列：只改那一列的 aria-expanded 與詳情，不重畫，焦點和 li 都留在原地。不在畫面上的副本什麼都不做
    toggleRow(id) {
        const row = document.getElementById(`dungeon-row-${id}`);
        if (!row) return;
        const open = !this.state.expanded.has(id);
        if (open) this.state.expanded.add(id);
        else this.state.expanded.delete(id);
        row.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.getElementById(`dungeon-detail-${id}`).hidden = !open;
    }

    // 再加一批：只在後面加新的列（已經在的列不重畫），焦點移到新加的第一列
    showMore() {
        const from = Math.min(this.state.shown, this.results.length);
        const to = Math.min(from + DungeonList.BATCH, this.results.length);
        if (from >= to) return;
        const query = DungeonList.normalizeQuery(this.state.query);
        for (const dungeon of this.results.slice(from, to)) this.elements.list.appendChild(this.buildItem(dungeon, query));
        this.state.shown = to;
        this.renderShowMore();
        document.getElementById(`dungeon-row-${this.results[from].id}`).focus();
    }

    // ---------- 畫面 ----------

    render() {
        const { elements, state } = this;
        // 重畫會把列換成新的元素：焦點原本在某一列的按鈕上，就在重畫完把焦點放回同一個副本的按鈕
        const focusedId = this.focusedRowId();
        this.renderFilters();
        elements.loading.hidden = this.loaded || this.loadFailed;
        elements.loadError.hidden = !this.loadFailed;
        if (this.loadFailed) elements.loadError.textContent = this.t('dungeon_db_msg_load_failed', '載入副本資料失敗，請重新整理頁面再試。');

        if (!this.loaded) {
            // 還在載入，或載入失敗：沒有列表、筆數、找不到與「顯示更多」
            elements.resultCount.textContent = '';
            elements.dataCount.textContent = '';
            elements.list.textContent = '';
            elements.list.hidden = true;
            elements.noResults.hidden = true;
            elements.showMore.hidden = true;
            return;
        }

        // 搜尋字整理一次，filter、hits、segments 都用這一份
        const query = DungeonList.normalizeQuery(state.query);
        this.results = DungeonList.filter(this.dungeons, { query, types: state.types, versions: state.versions });

        elements.dataCount.textContent = this.t('dungeon_db_data_count', '資料包含 {count} 個副本，涵蓋從重生之境（2.x）到黃金之遺產（7.x）。感謝灰機Wiki社群的貢獻。', { count: this.dungeons.length });
        elements.resultCount.textContent = this.countText(query !== '' || state.types.size > 0 || state.versions.size > 0);

        elements.list.textContent = '';
        for (const dungeon of this.results.slice(0, state.shown)) elements.list.appendChild(this.buildItem(dungeon, query));
        // 列表要先顯示出來：藏起來（display: none）的元素拿不到焦點
        elements.list.hidden = this.results.length === 0;
        this.renderNoResults(query);
        this.renderShowMore();

        if (focusedId !== null) {
            const row = document.getElementById(`dungeon-row-${focusedId}`);
            if (row) row.focus();
        }
    }

    // 焦點在列表裡某一列的按鈕上時，是那個副本的 id；否則是 null
    focusedRowId() {
        const active = document.activeElement;
        return active && active.classList.contains('dungeon-row') && this.elements.list.contains(active) ? Number(active.dataset.id) : null;
    }

    // 篩選按鈕的選取狀態（active 與 aria-pressed）、「清除篩選」能不能按和手機的「篩選」按鈕，都照 state 重設
    renderFilters() {
        const { elements, state } = this;
        for (const [group, key, selected] of [[elements.typeTags, 'type', state.types], [elements.expansionTags, 'expansion', state.versions]]) {
            for (const chip of group.querySelectorAll('.chip')) {
                const on = selected.has(chip.dataset[key]);
                chip.classList.toggle('active', on);
                chip.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
        }
        elements.clearFilters.setAttribute('aria-disabled', state.types.size === 0 && state.versions.size === 0 ? 'true' : 'false');
        this.renderFilterToggle();
    }

    // 手機的「篩選」按鈕：文字寫選了幾個篩選（沒選就只寫「篩選」），aria-expanded 與 #filterCard 的 is-collapsed 照 state.filtersOpen。
    // 載入前後都能開合，所以不靠資料
    renderFilterToggle() {
        const { elements, state } = this;
        const count = state.types.size + state.versions.size;
        elements.filterToggle.textContent = count > 0
            ? this.t('dungeon_db_filter_toggle_count', '篩選（{count}）', { count })
            : this.t('dungeon_db_filter_toggle', '篩選');
        elements.filterToggle.setAttribute('aria-expanded', state.filtersOpen ? 'true' : 'false');
        elements.filterCard.classList.toggle('is-collapsed', !state.filtersOpen);
    }

    // 找不到：載入完而且 0 個符合才顯示。有搜尋字，標題寫搜尋字（去掉前後空白的原字）並有「清除搜尋」；沒有就寫「條件」。有選篩選才有「清除篩選」
    renderNoResults(query) {
        const { elements, state } = this;
        const empty = this.results.length === 0;
        elements.noResults.hidden = !empty;
        if (!empty) return;
        elements.noResultsTitle.textContent = query === ''
            ? this.t('dungeon_db_no_results', '找不到符合條件的副本')
            : this.t('dungeon_db_no_results_query', '找不到符合「{query}」的副本', { query: state.query });
        elements.clearSearch.hidden = query === '';
        elements.clearFiltersEmpty.hidden = state.types.size === 0 && state.versions.size === 0;
    }

    // 筆數：沒有搜尋也沒有篩選寫「共 N 個」，否則寫「找到 N 個」；剛好 1 個用 _one（不判斷語言）
    countText(filtered) {
        const count = this.results.length;
        if (filtered) {
            return count === 1
                ? this.t('dungeon_db_count_found_one', '找到 1 個副本')
                : this.t('dungeon_db_count_found', '找到 {count} 個副本', { count });
        }
        return count === 1
            ? this.t('dungeon_db_count_all_one', '共 1 個副本')
            : this.t('dungeon_db_count_all', '共 {count} 個副本', { count });
    }

    // 還有沒列出的才出現「顯示更多（還有 N 個）」
    renderShowMore() {
        const remaining = this.results.length - Math.min(this.state.shown, this.results.length);
        this.elements.showMore.hidden = remaining <= 0;
        if (remaining > 0) this.elements.showMore.textContent = this.t('dungeon_db_show_more', '顯示更多（還有 {count} 個）', { count: remaining });
    }

    // ---------- 一列 ----------

    // 版本的顯示：「7.x 黃金之遺產」（名稱取自資料的 metadata.expansions，沒有就只寫版本）
    versionText(expansion) {
        const name = this.versionNames[expansion];
        return name ? `${expansion} ${name}` : expansion;
    }

    // 把 text 依 query 切成片段放進 parent：命中的包成 <mark>，沒命中的是文字節點（接起來等於原字）
    appendMarked(parent, text, query) {
        for (const part of DungeonList.segments(text, query)) {
            if (part.text === '') continue;
            if (part.hit) parent.appendChild(DungeonDatabase.element('mark', '', part.text));
            else parent.appendChild(document.createTextNode(part.text));
        }
    }

    // li > 按鈕（名稱、類型、版本、等級、展開記號、命中行）+ 詳情。詳情和列一起建，展開時只是不再 hidden
    buildItem(dungeon, query) {
        const { id } = dungeon;
        const expanded = this.state.expanded.has(id);
        const item = DungeonDatabase.element('li', 'dungeon-item');

        const row = DungeonDatabase.element('button', 'dungeon-row');
        row.setAttribute('type', 'button');
        row.id = `dungeon-row-${id}`;
        row.dataset.id = String(id);
        row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        row.setAttribute('aria-controls', `dungeon-detail-${id}`);

        const name = DungeonDatabase.element('span', 'dungeon-name');
        this.appendMarked(name, dungeon.name, query);
        row.appendChild(name);
        row.appendChild(DungeonDatabase.element('span', 'dungeon-type', dungeon.type));
        row.appendChild(DungeonDatabase.element('span', 'dungeon-version', this.versionText(dungeon.expansion)));
        row.appendChild(DungeonDatabase.element('span', 'dungeon-level tag tag-primary', `Lv${dungeon.level}`));
        const chevron = DungeonDatabase.element('span', 'dungeon-chevron');
        chevron.setAttribute('aria-hidden', 'true');
        row.appendChild(chevron);
        for (const line of this.buildHits(dungeon, query)) row.appendChild(line);

        item.appendChild(row);
        item.appendChild(this.buildDetail(dungeon, query, expanded));
        return item;
    }

    // 搜尋字在名稱以外命中的欄位，各一行，依掉落物、機制、簡介的順序；沒命中的不寫（只有名稱命中時沒有任何一行）
    buildHits(dungeon, query) {
        const hits = DungeonList.hits(dungeon, query);
        const lines = [];
        if (hits.drop) {
            const line = this.buildHit('drop', this.t('dungeon_db_hit_drop', '掉落：'), hits.drop.text, query);
            if (hits.drop.more > 0) {
                line.appendChild(DungeonDatabase.element('span', 'dungeon-hit-more', this.t('dungeon_db_hit_more', '（還有 {count} 項也符合）', { count: hits.drop.more })));
            }
            lines.push(line);
        }
        if (hits.mechanics) lines.push(this.buildHit('mechanics', this.t('dungeon_db_hit_mechanics', '機制：'), dungeon.mechanics, query));
        if (hits.description) lines.push(this.buildHit('description', this.t('dungeon_db_hit_description', '簡介：'), dungeon.description, query));
        return lines;
    }

    buildHit(field, label, text, query) {
        const line = DungeonDatabase.element('span', 'dungeon-hit');
        line.dataset.field = field;
        line.appendChild(DungeonDatabase.element('span', 'dungeon-hit-label', label));
        this.appendMarked(line, text, query);
        return line;
    }

    // 詳情：簡介、機制、掉落物、獎勵四項。收起時 hidden
    buildDetail(dungeon, query, expanded) {
        const detail = DungeonDatabase.element('div', 'dungeon-detail');
        detail.id = `dungeon-detail-${dungeon.id}`;
        detail.hidden = !expanded;

        const fields = DungeonDatabase.element('dl', 'dungeon-fields');
        fields.appendChild(this.buildField('description', this.t('dungeon_db_detail_description', '簡介'), (dd) => this.appendMarked(dd, dungeon.description, query)));
        fields.appendChild(this.buildField('mechanics', this.t('dungeon_db_detail_mechanics', '機制'), (dd) => this.appendMarked(dd, dungeon.mechanics, query)));
        fields.appendChild(this.buildField('drops', this.t('dungeon_db_detail_drops', '掉落物'), (dd) => this.appendDrops(dd, dungeon.specialDrops, query)));
        fields.appendChild(this.buildField('reward', this.t('dungeon_db_detail_reward', '獎勵'), (dd) => {
            // reward() 沒有獎勵時是 null：寫什麼由這裡決定
            dd.textContent = DungeonList.reward(dungeon.tombstoneReward) ?? this.t('dungeon_db_no_reward', '沒有神典石');
        }));
        detail.appendChild(fields);
        return detail;
    }

    // 詳情裡的一項：dt 是名稱，dd 的內容由 fill(dd) 放
    buildField(field, label, fill) {
        const wrapper = DungeonDatabase.element('div', 'dungeon-field');
        wrapper.dataset.field = field;
        wrapper.appendChild(DungeonDatabase.element('dt', '', label));
        const dd = DungeonDatabase.element('dd');
        fill(dd);
        wrapper.appendChild(dd);
        return wrapper;
    }

    // 掉落物：每一項一個 .tag；沒有掉落物就寫一句說明，不畫空的清單
    appendDrops(dd, drops, query) {
        if (drops.length === 0) {
            dd.appendChild(DungeonDatabase.element('span', 'dungeon-none', this.t('dungeon_db_no_drops', '資料裡沒有特殊掉落物')));
            return;
        }
        const list = DungeonDatabase.element('ul', 'dungeon-drops');
        for (const drop of drops) {
            const tag = DungeonDatabase.element('li', 'tag');
            this.appendMarked(tag, drop, query);
            list.appendChild(tag);
        }
        dd.appendChild(list);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.dungeonDatabase = new DungeonDatabase();
});
