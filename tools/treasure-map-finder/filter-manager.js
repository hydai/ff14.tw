// 過濾器管理模組：篩選狀態（不碰 DOM）＋網址與 localStorage 的純函式；mount() 之後才接上等級、地區 chip 的畫面
class FilterManager {
    // 寶圖等級由新到舊：結果、地區選項與網址裡的順序都以它為準
    static GRADE_ORDER = ['g18', 'g17', 'g15', 'g14', 'g12', 'g10', 'g8'];

    // localStorage 記住篩選用的 key，內容是 { levels, zones }
    static STORAGE_KEY = 'ff14tw_treasure_map_filters';

    // 介面語言；地區 chip 的 title 依這個順序列出目前語言以外的地名
    static LANGUAGES = ['zh', 'en', 'ja'];

    static CONSTANTS = {
        CSS_CLASSES: {
            ACTIVE: 'active',
            HIDDEN: 'hidden'
        }
    };

    /**
     * 取得 win.localStorage；封鎖網站資料等情況連取得都會丟例外，一律當作不能用
     * @param {Window} win
     * @returns {Storage|null}
     */
    static safeStorage(win) {
        try {
            return win.localStorage || null;
        } catch {
            return null;
        }
    }

    /**
     * 讀出記住的篩選
     * @param {Storage|null} storage
     * @returns {{levels: string[], zones: string[]}|null} 沒有、讀不到、JSON 壞掉或形狀不對都是 null
     */
    static readStored(storage) {
        try {
            const raw = storage?.getItem(FilterManager.STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            const isList = value => Array.isArray(value) && value.every(item => typeof item === 'string');
            if (!data || !isList(data.levels) || !isList(data.zones)) return null;
            return { levels: [...data.levels], zones: [...data.zones] };
        } catch {
            return null;
        }
    }

    /**
     * 記住篩選；沒有 storage 或寫入失敗（空間滿了、被封鎖）就算了，不影響使用
     * @param {Storage|null} storage
     * @param {{levels: string[], zones: string[]}} state
     */
    static writeStored(storage, state) {
        try {
            storage?.setItem(FilterManager.STORAGE_KEY, JSON.stringify({ levels: state.levels, zones: state.zones }));
        } catch { /* 記不住只是下次要重選，不影響這次使用 */ }
    }

    /**
     * 從網址的查詢字串讀出 grade、zone（逗號分隔）；只負責切開，值對不對交給 restoreState()
     * @param {string} search - 例如 location.search
     * @returns {{levels: string[], zones: string[]}|null} 兩個參數都沒有時是 null
     */
    static parseUrl(search) {
        const params = new URLSearchParams(search);
        if (!params.has('grade') && !params.has('zone')) return null;
        const list = name => (params.get(name) || '').split(',').map(item => item.trim()).filter(Boolean);
        return { levels: list('grade'), zones: list('zone') };
    }

    /**
     * 把篩選寫進網址：有值就設定 grade、zone，沒有就刪掉；其他參數（例如 room）的值保留，hash 原樣保留。
     * 整個查詢字串會重新編碼，寫法可能跟著變、意思不變（例如 ?debug&a=b%20c 變成 ?debug=&a=b+c）
     * @param {string} href - 目前的完整網址
     * @param {{levels: string[], zones: string[]}} state
     * @returns {string}
     */
    static buildUrl(href, state) {
        const url = new URL(href);
        for (const [name, values] of [['grade', state.levels], ['zone', state.zones]]) {
            if (values.length > 0) {
                url.searchParams.set(name, values.join(','));
            } else {
                url.searchParams.delete(name);
            }
        }
        // URLSearchParams 會把逗號編成 %2C；逗號在查詢字串裡本來就合法，改回來網址比較好讀
        url.search = url.searchParams.toString().replace(/%2C/gi, ',');
        return url.toString();
    }

    /**
     * 開啟頁面時要用哪一份篩選：網址 > localStorage > 什麼都沒選
     * @param {{url: ?{levels: string[], zones: string[]}, stored: ?{levels: string[], zones: string[]}}} sources
     * @returns {{levels: string[], zones: string[]}}
     */
    static pickInitialState({ url, stored }) {
        return url || stored || { levels: [], zones: [] };
    }

    constructor() {
        // 初始化過濾器集合：目前選的等級與地區
        this.filters = {
            levels: new Set(),
            zones: new Set()
        };

        // 等級 -> (地區 id -> 張數)，地區照資料裡第一次出現的順序；由 setMaps() 建立
        this.zonesByLevel = new Map();

        // 儲存過濾器變更的回調函數
        this.onChangeCallback = null;

        // mount() 之後才有：兩個 chip 容器、地區列、「清除地區」，以及取地名、取目前語言的函式
        this.view = null;
        // 目前畫出來的地區選項（地區與張數的摘要），選項沒變時就地更新 chip，不重畫
        this.renderedZoneOptions = null;
    }

    /**
     * 設定過濾器變更時的回調函數（只留一個）
     * toggleLevel()、toggleZone()、clearZones() 每次真的改變了狀態就呼叫一次，參數是新的 getState()；
     * restoreState() 不呼叫（還原是呼叫者自己接著重畫）
     * @param {Function} callback - 回調函數
     */
    onChange(callback) {
        this.onChangeCallback = callback;
    }

    /**
     * 狀態真的改變了：先更新 chip 畫面（mount() 之後），再觸發變更事件
     */
    triggerChange() {
        this.syncView();
        if (this.onChangeCallback) {
            this.onChangeCallback(this.getState());
        }
    }

    /**
     * 告訴過濾器整份寶圖，用來算每個等級有哪些地區、各幾張；要在 restoreState() 之前呼叫
     * @param {Array} maps - 全部寶圖（要有 level 與 zoneId）
     */
    setMaps(maps) {
        this.zonesByLevel = new Map();
        for (const map of maps) {
            if (!this.zonesByLevel.has(map.level)) {
                this.zonesByLevel.set(map.level, new Map());
            }
            const zones = this.zonesByLevel.get(map.level);
            zones.set(map.zoneId, (zones.get(map.zoneId) || 0) + 1);
        }
    }

    /**
     * 認得、而且資料裡有寶圖的等級才選得到
     * @param {string} level
     * @returns {boolean}
     */
    isSelectableLevel(level) {
        return FilterManager.GRADE_ORDER.includes(level) && this.zonesByLevel.has(level);
    }

    /**
     * 選取或取消一個等級；取消時，不屬於剩下等級的已選地區一起取消
     * @param {string} level
     */
    toggleLevel(level) {
        if (this.filters.levels.has(level)) {
            this.filters.levels.delete(level);
            this.dropUnavailableZones();
        } else if (this.isSelectableLevel(level)) {
            this.filters.levels.add(level);
        } else {
            return;
        }
        this.triggerChange();
    }

    /**
     * 選取或取消一個地區；只有已選等級有寶圖的地區選得到
     * @param {string} zoneId
     */
    toggleZone(zoneId) {
        if (this.filters.zones.has(zoneId)) {
            this.filters.zones.delete(zoneId);
        } else if (this.getZoneOptions().some(option => option.zoneId === zoneId)) {
            this.filters.zones.add(zoneId);
        } else {
            return;
        }
        this.triggerChange();
    }

    /**
     * 取消所有已選地區（等級保留）
     */
    clearZones() {
        if (this.filters.zones.size === 0) return;
        this.filters.zones.clear();
        this.triggerChange();
    }

    /**
     * 把不在目前地區選項裡的已選地區取消
     */
    dropUnavailableZones() {
        const available = new Set(this.getZoneOptions().map(option => option.zoneId));
        for (const zoneId of [...this.filters.zones]) {
            if (!available.has(zoneId)) {
                this.filters.zones.delete(zoneId);
            }
        }
    }

    /**
     * 目前可選的地區：只列已選等級有寶圖的地區，張數只算已選等級；
     * 等級依 GRADE_ORDER，同等級的地區照資料第一次出現的順序
     * @returns {Array<{zoneId: string, count: number}>}
     */
    getZoneOptions() {
        const counts = new Map();
        for (const level of FilterManager.GRADE_ORDER) {
            if (!this.filters.levels.has(level)) continue;
            for (const [zoneId, count] of this.zonesByLevel.get(level) || []) {
                counts.set(zoneId, (counts.get(zoneId) || 0) + count);
            }
        }
        return Array.from(counts, ([zoneId, count]) => ({ zoneId, count }));
    }

    /**
     * 應用過濾器到地圖列表：沒選等級是空的；等級依 GRADE_ORDER 排，同等級照原始順序；
     * 沒選地區就是所選等級全部，選了就只留這些地區（用 zoneId 比對）
     * @param {Array} maps - 地圖列表
     * @returns {Array} 過濾後的地圖列表（新陣列，不改動傳入的）
     */
    applyFilters(maps) {
        const { levels, zones } = this.filters;
        if (levels.size === 0) return [];

        const rank = level => FilterManager.GRADE_ORDER.indexOf(level);
        return maps
            .filter(map => levels.has(map.level) && (zones.size === 0 || zones.has(map.zoneId)))
            .sort((a, b) => rank(a.level) - rank(b.level));
    }

    /**
     * 取得可儲存的狀態：等級依 GRADE_ORDER，地區依 getZoneOptions() 的順序，所以網址穩定
     * @returns {{levels: string[], zones: string[]}}
     */
    getState() {
        return {
            levels: FilterManager.GRADE_ORDER.filter(level => this.filters.levels.has(level)),
            zones: this.getZoneOptions()
                .map(option => option.zoneId)
                .filter(zoneId => this.filters.zones.has(zoneId))
        };
    }

    /**
     * 從儲存的狀態還原過濾器（整份取代）：丟掉不認得或沒有寶圖的等級，
     * 以及不屬於已選等級的地區。不碰畫面、不觸發變更事件
     * @param {{levels: string[], zones: string[]}} state - 網址或 localStorage 來的狀態
     */
    restoreState(state) {
        const wantedLevels = new Set(Array.isArray(state?.levels) ? state.levels : []);
        const wantedZones = new Set(Array.isArray(state?.zones) ? state.zones : []);

        this.filters.levels = new Set(
            FilterManager.GRADE_ORDER.filter(level => wantedLevels.has(level) && this.isSelectableLevel(level))
        );
        this.filters.zones = new Set(
            this.getZoneOptions().map(option => option.zoneId).filter(zoneId => wantedZones.has(zoneId))
        );
    }

    /**
     * 接上畫面並依目前的狀態畫一次（要在 setMaps()、restoreState() 之後呼叫；本身不觸發變更事件）。
     * 點擊用事件委派掛在兩個容器上，之後 toggleLevel()、toggleZone()、clearZones() 改變狀態時會自動更新畫面
     * @param {Object} view
     * @param {HTMLElement} view.levelContainer - 等級 chip（寫在 HTML 裡的 button[data-level]）的容器
     * @param {HTMLElement} view.zoneRow - 地區列，沒選等級時加上 .hidden
     * @param {HTMLElement} view.zoneContainer - 地區 chip 的容器，chip 由 renderZoneChips() 產生
     * @param {HTMLElement} view.clearZonesButton - 「清除地區」，沒選地區時加上 .hidden
     * @param {function(string): {zh: string, en: string, ja: string}} view.getZoneNames - 地區 id → 三種語言的地名
     * @param {function(): string} view.getLanguage - 目前的介面語言（zh、en、ja）
     */
    mount({ levelContainer, zoneRow, zoneContainer, clearZonesButton, getZoneNames, getLanguage }) {
        this.view = { levelContainer, zoneRow, zoneContainer, clearZonesButton, getZoneNames, getLanguage };

        // 點到 chip 裡的張數（span）也算點這顆 chip，所以用 closest() 往上找
        levelContainer.addEventListener('click', event => {
            const chip = event.target.closest('[data-level]');
            if (chip && levelContainer.contains(chip)) this.toggleLevel(chip.dataset.level);
        });
        zoneContainer.addEventListener('click', event => {
            const chip = event.target.closest('[data-zone-id]');
            if (chip && zoneContainer.contains(chip)) this.toggleZone(chip.dataset.zoneId);
        });
        clearZonesButton.addEventListener('click', () => {
            // 按完之後按鈕會藏起來：焦點原本在它身上（鍵盤操作）的話交給地區列的第一顆 chip，不讓焦點掉到 body
            const hadFocus = document.activeElement === clearZonesButton;
            this.clearZones();
            if (hadFocus) zoneContainer.querySelector('[data-zone-id]')?.focus();
        });

        this.renderZoneChips();
        this.syncView();
    }

    /**
     * 依目前的狀態更新畫面：等級 chip 的選取狀態；地區選項變了（選了或取消等級）才重畫地區 chip，
     * 只是選取、取消地區時就地更新，按下的 chip 不會被換掉，焦點留在原地；
     * 沒選等級時藏起地區列，沒選地區時藏起「清除地區」。mount() 之前什麼都不做
     */
    syncView() {
        if (!this.view) return;
        const { levelContainer, zoneRow, zoneContainer, clearZonesButton } = this.view;
        const { HIDDEN } = FilterManager.CONSTANTS.CSS_CLASSES;

        for (const chip of levelContainer.querySelectorAll('[data-level]')) {
            FilterManager.setPressed(chip, this.filters.levels.has(chip.dataset.level));
        }
        if (FilterManager.zoneOptionsKey(this.getZoneOptions()) === this.renderedZoneOptions) {
            for (const chip of zoneContainer.querySelectorAll('[data-zone-id]')) {
                FilterManager.setPressed(chip, this.filters.zones.has(chip.dataset.zoneId));
            }
        } else {
            this.renderZoneChips();
        }
        zoneRow.classList.toggle(HIDDEN, this.filters.levels.size === 0);
        clearZonesButton.classList.toggle(HIDDEN, this.filters.zones.size === 0);
    }

    /**
     * 重畫地區 chip（切換語言時也用它）：每顆是目前語言的地名＋張數，title 是另外兩種語言的地名；
     * 只列已選等級有寶圖的地區。mount() 之前什麼都不做
     */
    renderZoneChips() {
        if (!this.view) return;
        const { zoneContainer, getZoneNames, getLanguage } = this.view;
        const language = getLanguage();
        const options = this.getZoneOptions();

        zoneContainer.textContent = '';
        for (const { zoneId, count } of options) {
            const names = getZoneNames(zoneId) || {};
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip';
            chip.dataset.zoneId = zoneId;
            chip.setAttribute('title', FilterManager.LANGUAGES
                .filter(lang => lang !== language)
                .map(lang => names[lang])
                .filter(Boolean)
                .join(' / '));
            chip.appendChild(document.createTextNode(`${names[language] || names.zh || zoneId} `));

            const countLabel = document.createElement('span');
            countLabel.className = 'chip-count';
            countLabel.textContent = String(count);
            chip.appendChild(countLabel);

            FilterManager.setPressed(chip, this.filters.zones.has(zoneId));
            zoneContainer.appendChild(chip);
        }
        this.renderedZoneOptions = FilterManager.zoneOptionsKey(options);
    }

    /**
     * 地區選項的摘要（地區與張數），用來判斷畫出來的地區 chip 是否還是目前的選項
     * @param {Array<{zoneId: string, count: number}>} options - getZoneOptions() 的結果
     * @returns {string}
     */
    static zoneOptionsKey(options) {
        return options.map(({ zoneId, count }) => `${zoneId}:${count}`).join(',');
    }

    /**
     * chip 的選取狀態同時表現在外觀（.active）與無障礙資訊（aria-pressed）上
     * @param {HTMLElement} chip
     * @param {boolean} pressed
     */
    static setPressed(chip, pressed) {
        chip.classList.toggle(FilterManager.CONSTANTS.CSS_CLASSES.ACTIVE, pressed);
        chip.setAttribute('aria-pressed', String(pressed));
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FilterManager;
}