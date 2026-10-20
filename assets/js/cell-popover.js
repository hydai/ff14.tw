/**
 * 格子旁的小選單：仙人微彩、宗長計算機共用；不是對話框。
 * 在某一格旁邊打開一排選項，讓人選這一格的值。選單掛在放格子的元素（board）裡，位置相對於 board 的左上角。
 * 這裡不認識任何一個工具：選項寫什麼字、哪些不能選、選了之後要做什麼，都由呼叫端決定。
 *
 * - 不鎖捲動、不困住焦點、不設 inert、沒有 aria-modal。點能選的選項、按 Esc、點選單和那一格以外的地方、焦點移出選單、
 *   焦點離開那一格而沒有進到選單裡（滑鼠打開後按 Tab 到旁邊的格子）都會關掉；整個視窗失去焦點（切到別的視窗，例如遊戲）不算，選單照樣開著；
 *   工具在格子的 click 裡對另一格再呼叫 open()，就是把選單換到那一格。
 * - 只有開著的時候才登記 document、window、選單與那一格上的監聽器。close() 先拿掉監聽器、把選單移出頁面，最後才（要求時）把焦點移回格子，
 *   所以移動焦點引起的 focusout 不會再呼叫一次 close()。
 * - 位置在打開時算好；視窗大小改變（手機轉向、視窗變窄或變寬，盤面與格子跟著變大變小）時，照那一格的新位置重新放好，選單照樣開著。
 * - 樣式在 assets/css/tools-common.css 的 .cell-popover*。board 要 position: relative；外層的 .card 預設 overflow: hidden，
 *   要改成 visible，不然開在格子下方的選單會被切掉。
 *
 *   const popover = new CellPopover({ board, columns: 3 });
 *   popover.open(cell, [
 *       { value: 1, label: '1', current: false },
 *       { value: 'clear', label: '清除', wide: true }
 *   ], { label: '左上的數字', placement: 'below', focusFirst: true, onSelect: (value, cell) => { ... } });
 */
class CellPopover {
    /** 選單與那一格之間的距離（px） */
    static GAP = 4;

    /**
     * 選單相對於 board 左上角的位置：水平置中在那一格上，左右不超出 board（board 比選單窄時貼齊左邊）；
     * 垂直開在那一格的下方，placement 是 'above' 時開在上方，都不蓋住那一格。不依賴 this，可以單獨拿出來呼叫。
     * @param {{cell: Object, board: Object, menu: Object, placement: string}} rects
     *        cell、board、menu 都是 getBoundingClientRect() 的 { left, top, width, height }
     * @returns {{left: number, top: number}}
     */
    static place({ cell, board, menu, placement }) {
        const centered = cell.left + cell.width / 2 - menu.width / 2 - board.left;
        const left = Math.max(0, Math.min(centered, board.width - menu.width));
        const top = placement === 'above'
            ? cell.top - board.top - menu.height - CellPopover.GAP
            : cell.top + cell.height - board.top + CellPopover.GAP;
        return { left, top };
    }

    /**
     * @param {{board: HTMLElement, columns?: number}} config board 是放格子的元素；columns 是選項排幾欄（2 或 3）
     */
    constructor({ board, columns = 3 }) {
        this.board = board;
        this.columns = columns;
        this._menu = null;
        this._anchor = null;
        this._placement = 'below';
        this._onSelect = null;
        this._values = new Map(); // 選項的按鈕 -> 原樣交給 onSelect 的 value（data-value 只留得住字串）

        // 登記和移除要用同一個函式，所以在這裡各做一次；這些監聽器只在開著的時候登記
        this._onDocumentPress = (event) => { // document 的 click 與 pointerdown 共用
            if (!this._menu) return;
            // 按在選單裡或被點的那一格上不關：工具在格子的 click 裡打開另一格時，這個監聽器看到的目標就是新的那一格
            if (this._menu.contains(event.target) || this._anchor.contains(event.target)) return;
            this.close();
        };
        this._onDocumentKeydown = (event) => {
            if (event.key === 'Escape') this.close({ returnFocus: true });
        };
        this._onMenuFocusout = (event) => {
            // 切到別的視窗（例如遊戲）時整個視窗失去焦點，瀏覽器在這個 focusout 裡回報 document.hasFocus() 是 false：選單照樣開著，切回來時焦點還在原來的元素上
            if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
            // relatedTarget 是 null（焦點沒有去任何元素，例如點在不能聚焦的地方）或那一格都算移出；這裡不搶回焦點，焦點要去哪裡就讓它去
            if (!this._menu || this._menu.contains(event.relatedTarget)) return;
            this.close();
        };
        this._onAnchorFocusout = (event) => {
            // 滑鼠打開的選單，焦點一直在那一格上、沒進過選單，選單自己的 focusout 不會動；焦點離開那一格（按 Tab 到旁邊的格子）時靠這個關掉，
            // 不然選單還開在已經沒有焦點的格子旁。規則同選單的 focusout：進到選單裡（用鍵盤打開時的 focusFirst）不算，去了別處都算，
            // 不搶回焦點。Safari 點按鈕不給焦點，那一格本來就沒有焦點可以失去，不會有這個 focusout：這種情況由呼叫端處理
            // 切到別的視窗（例如遊戲）時整個視窗失去焦點，不算離開那一格：選單照樣開著（同選單的 focusout）
            if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
            if (!this._menu || this._menu.contains(event.relatedTarget)) return;
            this.close();
        };
        this._onWindowResize = () => this._reposition();
        this._onMenuMousedown = (event) => {
            // Safari、macOS 的 Firefox 點按鈕不會給按鈕焦點，原本有焦點的選項會失焦而觸發 focusout，選單在 click 之前就被關掉；按下去不移動焦點，click 照常發生
            event.preventDefault();
        };
        this._onMenuClick = (event) => {
            const option = event.target.closest('.cell-popover-option');
            // disabled 的選項（含目前的值）自己擋，不靠瀏覽器不對它送 click
            if (!option || option.disabled || !this._values.has(option)) return;
            const value = this._values.get(option);
            const anchor = this._anchor;
            const onSelect = this._onSelect;
            this.close({ returnFocus: true });
            if (typeof onSelect === 'function') onSelect(value, anchor);
        };
    }

    /** 選單開著嗎（唯讀） */
    get isOpen() {
        return this._menu !== null;
    }

    /** 選單是開給哪一格的；沒開時是 null（唯讀） */
    get anchor() {
        return this._anchor;
    }

    /**
     * 在 cell 旁邊打開選單。已經開著（不論開在哪一格）就先關掉舊的（焦點不動），再開新的。
     * @param {HTMLElement} cell 被點的那一格
     * @param {Array<{value: *, label: string, disabled?: boolean, current?: boolean, wide?: boolean}>} options
     *        value 原樣交給 onSelect；寫了 current（true 或 false）的才有 aria-pressed，current: true 是目前的值，
     *        和 disabled 的選項一樣不能選；wide 的選項獨佔一整列
     * @param {Object} [config]
     * @param {function(*, HTMLElement): void} [config.onSelect] 點了能選的選項：先關掉選單、焦點回到 cell，再呼叫一次
     * @param {string} [config.label] 選單的 aria-label
     * @param {'below'|'above'} [config.placement] 開在格子的下方或上方
     * @param {boolean} [config.focusFirst] true 時焦點移到第一個能選的選項（用鍵盤打開時用）
     */
    open(cell, options, { onSelect, label = '', placement = 'below', focusFirst = false } = {}) {
        this.close();

        const menu = document.createElement('div');
        menu.className = `cell-popover cell-popover-cols-${this.columns}`;
        menu.setAttribute('role', 'group');
        menu.setAttribute('aria-label', label);

        const buttons = [];
        for (const option of options) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = option.wide ? 'cell-popover-option cell-popover-option-wide' : 'cell-popover-option';
            button.dataset.value = String(option.value);
            button.textContent = option.label;
            if (typeof option.current === 'boolean') button.setAttribute('aria-pressed', String(option.current));
            button.disabled = Boolean(option.disabled) || option.current === true;
            menu.appendChild(button);
            this._values.set(button, option.value);
            buttons.push(button);
        }

        // 要先掛上 board 才量得到選單的大小
        this.board.appendChild(menu);
        this._menu = menu;
        this._anchor = cell;
        this._placement = placement;
        this._onSelect = onSelect;
        this._reposition();

        cell.setAttribute('aria-expanded', 'true');
        document.addEventListener('click', this._onDocumentPress);
        // iPhone 的 Safari 點非互動的元素（狀態列、空白處）時不會把 click 送到 document，所以按下去（pointerdown）也算點外面
        document.addEventListener('pointerdown', this._onDocumentPress);
        document.addEventListener('keydown', this._onDocumentKeydown);
        window.addEventListener('resize', this._onWindowResize);
        menu.addEventListener('focusout', this._onMenuFocusout);
        cell.addEventListener('focusout', this._onAnchorFocusout);
        menu.addEventListener('mousedown', this._onMenuMousedown);
        menu.addEventListener('click', this._onMenuClick);

        if (focusFirst) {
            const first = buttons.find((button) => !button.disabled);
            if (first) first.focus();
        }
    }

    /**
     * 照那一格現在的位置放好選單：打開時一次，之後每次視窗大小改變再一次。只在開著的時候呼叫（resize 監聽器只在開著時登記）。
     * 先拿掉上一次的位置才量選單：選單是 absolute，left 越大能用的寬度越窄，選項的字長時會量到比打開時窄的寬度
     */
    _reposition() {
        const menu = this._menu;
        menu.style.left = '';
        menu.style.top = '';
        const position = CellPopover.place({
            cell: this._anchor.getBoundingClientRect(),
            board: this.board.getBoundingClientRect(),
            menu: menu.getBoundingClientRect(),
            placement: this._placement
        });
        menu.style.left = `${position.left}px`;
        menu.style.top = `${position.top}px`;
    }

    /**
     * 關掉選單；沒開時什麼都不做，可以重複呼叫。
     * 順序很重要：先拿掉監聽器、把選單移出頁面，最後才移動焦點，移動焦點引起的 focusout 才不會再呼叫一次 close()。
     * @param {{returnFocus?: boolean}} [config] returnFocus 為 true 時焦點回到那一格
     */
    close({ returnFocus = false } = {}) {
        const menu = this._menu;
        if (!menu) return;
        const anchor = this._anchor;

        document.removeEventListener('click', this._onDocumentPress);
        document.removeEventListener('pointerdown', this._onDocumentPress);
        document.removeEventListener('keydown', this._onDocumentKeydown);
        window.removeEventListener('resize', this._onWindowResize);
        menu.removeEventListener('focusout', this._onMenuFocusout);
        anchor.removeEventListener('focusout', this._onAnchorFocusout);
        menu.removeEventListener('mousedown', this._onMenuMousedown);
        menu.removeEventListener('click', this._onMenuClick);
        menu.remove();
        anchor.setAttribute('aria-expanded', 'false');
        this._menu = null;
        this._anchor = null;
        this._onSelect = null;
        this._values.clear();

        if (returnFocus) anchor.focus();
    }
}

window.CellPopover = CellPopover;
