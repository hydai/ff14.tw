// 仙人微彩計算機
// 盤面上的每個字都從 MiniCactpotSolver.analyze(this.grid) 畫出來（cactpot-solver.js，不碰 DOM）：
// 狀態列寫下一步，格子寫數字或「平均」，外圈在選線時寫每條線的平均，推薦的格子與線標綠色。
// 獎金表（三格總和 → MGP）一直顯示，選線時推薦的線還可能出現的總和標綠色。
// 填數字用格子旁的小選單（assets/js/cell-popover.js 的 CellPopover）；焦點在格子上時也能直接按 1–9（先填焦點所在的格子，
// 焦點不在格子上而小選單開著時填進它開給的那一格）。
// 每個動作（填、改、清除、下一張）改盤面之前先存一份到 undoStack，「上一步」退回最後一份並用 toast 寫出退回了什麼；
// 「下一張」清空盤面，按「上一步」救得回來。
class MiniCactpotCalculator {
    // 位置 0–8 的名稱：翻譯鍵與中文預設文字（左上、上中、右上 / 左中、中央、右中 / 左下、下中、右下）
    static POSITION_KEYS = [
        'mini_cactpot_pos_top_left', 'mini_cactpot_pos_top_center', 'mini_cactpot_pos_top_right',
        'mini_cactpot_pos_mid_left', 'mini_cactpot_pos_center', 'mini_cactpot_pos_mid_right',
        'mini_cactpot_pos_bot_left', 'mini_cactpot_pos_bot_center', 'mini_cactpot_pos_bot_right'
    ];
    static POSITION_NAMES = ['左上', '上中', '右上', '左中', '中央', '右中', '左下', '下中', '右下'];

    // 線 0–7 的名稱，和 MiniCactpotSolver.LINES 同順序：三條橫列、三條直行、兩條斜線
    static LINE_KEYS = [
        'mini_cactpot_line_row_top', 'mini_cactpot_line_row_mid', 'mini_cactpot_line_row_bot',
        'mini_cactpot_line_col_left', 'mini_cactpot_line_col_mid', 'mini_cactpot_line_col_right',
        'mini_cactpot_line_diag_left', 'mini_cactpot_line_diag_right'
    ];
    static LINE_NAMES = ['上橫列', '中橫列', '下橫列', '左直行', '中直行', '右直行', '左斜線', '右斜線'];

    // 外圈膠囊在還沒有建議時寫的箭頭，以線的編號為索引：橫列 →、直行 ↓、斜線 ↘ ↙
    static LINE_ARROWS = ['→', '→', '→', '↓', '↓', '↓', '↘', '↙'];

    // 獎金表裡 MGP 到這個數字以上的列用粗體
    static BIG_MGP = 1000;

    constructor() {
        // 九格的數字：null 是還沒填，1–9 是填了的數字
        this.grid = new Array(9).fill(null);
        // 上一步：每個動作之前存一份 { grid: 動作之前的盤面（複本）, action: 那個動作 }，最後存的最先退回
        this.undoStack = [];

        this.elements = {
            status: document.getElementById('cactpotStatus'),
            lineAverages: document.getElementById('cactpotLineAverages'),
            board: document.getElementById('extended-grid'),
            undo: document.getElementById('undo-btn'),
            next: document.getElementById('next-btn'),
            payout: document.getElementById('payoutTable')
        };
        // 九格與外圈的膠囊都在 index.html 裡，照位置、線的編號收好，重畫時只改內容，不重建
        this.cells = Array.from({ length: 9 }, (_, p) => this.elements.board.querySelector(`.grid-cell[data-position="${p}"]`));
        this.badges = Array.from({ length: 8 }, (_, line) => this.elements.board.querySelector(`.line-badge[data-line="${line}"]`));
        // 獎金表的 19 列照 MiniCactpotSolver.MGP 建出來（HTML 裡不寫第二份），照總和收好；重畫時只切換 possible
        this.payoutRows = this.buildPayoutRows();

        this.popover = new CellPopover({ board: this.elements.board, columns: 3 });

        // 點格子：在格子旁邊打開小數字盤。Esc、點外面、焦點移出由小選單自己關；點另一格就是對另一格再呼叫 open()
        this.elements.board.addEventListener('click', (event) => this.handleBoardClick(event));

        // 上一步、下一張：不能按的時候用 aria-disabled（不用 disabled），click 照樣會送出，所以 undo()、nextTicket() 自己擋
        this.elements.undo.addEventListener('click', () => this.undo());
        this.elements.next.addEventListener('click', () => this.nextTicket());

        // 數字鍵 1–9：整頁聽 keydown，由 handleDigitKey() 判斷填不填、填哪一格
        document.addEventListener('keydown', (event) => this.handleDigitKey(event));

        // 切換語言：小選單的文字是打開時才寫的，先關掉，再用新的語言重畫整個盤面
        window.i18n.onLanguageChange(() => {
            this.popover.close();
            this.render();
        });

        this.render();
    }

    t(key, fallback, params) {
        return FF14Utils.getI18nText(key, fallback, params);
    }

    // 獎金表：總和 6–24 照順序各一列，<dt> 是總和、<dd> 是 MGP，MGP 到 BIG_MGP 以上加 big。回傳 Map：總和 → 那一列
    buildPayoutRows() {
        const rows = new Map();
        const sums = Object.keys(MiniCactpotSolver.MGP).map(Number).sort((a, b) => a - b);
        for (const sum of sums) {
            const mgp = MiniCactpotSolver.MGP[sum];

            const term = document.createElement('dt');
            term.textContent = String(sum);
            const detail = document.createElement('dd');
            detail.textContent = MiniCactpotSolver.formatMgp(mgp);

            const row = document.createElement('div');
            row.className = mgp >= MiniCactpotCalculator.BIG_MGP ? 'payout-row big' : 'payout-row';
            row.dataset.sum = String(sum);
            row.appendChild(term);
            row.appendChild(detail);
            this.elements.payout.appendChild(row);
            rows.set(sum, row);
        }
        return rows;
    }

    // 位置 p（0–8）、線 i（0–7）照目前語言的名稱
    positionName(p) {
        return this.t(MiniCactpotCalculator.POSITION_KEYS[p], MiniCactpotCalculator.POSITION_NAMES[p]);
    }

    lineName(i) {
        return this.t(MiniCactpotCalculator.LINE_KEYS[i], MiniCactpotCalculator.LINE_NAMES[i]);
    }

    // 每個名字套上 mini_cactpot_name（【右上】），再用 mini_cactpot_or 接起來（【右上】或【左下】）
    joinNames(names) {
        return names
            .map((name) => this.t('mini_cactpot_name', '【{name}】', { name }))
            .join(this.t('mini_cactpot_or', '或'));
    }

    handleBoardClick(event) {
        const cell = event.target.closest('.grid-cell');
        if (!cell || cell.disabled) return;

        const p = Number(cell.dataset.position);
        this.popover.open(cell, this.pickerOptions(p), {
            label: this.t('mini_cactpot_picker_label', '{pos}的數字', { pos: this.positionName(p) }),
            // 上兩列開在格子下方，最下面一列開在上方
            placement: Math.floor(p / 3) < 2 ? 'below' : 'above',
            // 鍵盤按 Enter、空白鍵送出的 click，detail 是 0（滑鼠點是 1 以上）：用鍵盤打開時焦點移到第一個能選的數字
            focusFirst: event.detail === 0,
            onSelect: (value) => this.apply(value === 'clear'
                ? { type: 'clear', position: p }
                : { type: 'set', position: p, value })
        });
    }

    // 位置 p 的小數字盤：1–9，別格已經用了的不能選，這一格目前的數字標成已選；這一格有數字時最後多一個「清除」
    pickerOptions(p) {
        const options = [];
        for (let n = 1; n <= 9; n++) {
            options.push({
                value: n,
                label: String(n),
                current: this.grid[p] === n,
                disabled: this.grid.some((value, q) => q !== p && value === n)
            });
        }
        if (this.grid[p] !== null) {
            options.push({ value: 'clear', label: this.t('mini_cactpot_clear', '清除'), wide: true });
        }
        return options;
    }

    // 數字鍵 1–9：填進焦點所在的格子；焦點不在格子上而小選單開著時，填進它開給的那一格（焦點在選單的選項上，或 Safari 點按鈕不會給焦點）。
    // 看得到焦點的格子優先：小選單開在別格時（Safari 點格子不給焦點，按 Tab 到旁邊的格子沒有 focusout 可以關掉選單），先關掉它再填焦點所在的格子。
    // 不能填的一律什麼都不做、不跳 toast，也不擋瀏覽器原本的行為：按著 Ctrl／⌘／Alt（瀏覽器與系統的快速鍵）、焦點不在格子上而小選單也沒開、
    // 格子不能點（填滿 4 格後沒翻開的），或這個數字已經在盤面上（別格用了，或就是這一格目前的數字）
    handleDigitKey(event) {
        if (!/^[1-9]$/.test(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;

        // event.target 可能是 document 這種沒有 closest 的東西，當成沒有格子；小選單沒開時 popover.anchor 是 null
        const cell = event.target.closest?.('.grid-cell') ?? this.popover.anchor;
        if (!cell || cell.disabled) return;

        const value = Number(event.key);
        if (this.grid.includes(value)) return;

        event.preventDefault();
        // 先關掉小選單再填。開給這一格（或焦點在選單裡）：焦點回到這一格；開給別格：焦點本來就在這一格上，不搶焦點。
        // 沒開小選單時焦點本來就在格子上，重畫不會動到它
        if (this.popover.isOpen) this.popover.close({ returnFocus: cell === this.popover.anchor });
        this.apply({ type: 'set', position: Number(cell.dataset.position), value });
    }

    // 填、改、清除一格或換下一張，然後重畫。action 是 { type: 'set', position, value }、{ type: 'clear', position } 或 { type: 'next' }
    // 改盤面之前先把動作之前的盤面連同這個動作存進 undoStack，「上一步」才退得回來
    apply(action) {
        this.undoStack.push({ grid: [...this.grid], action });
        if (action.type === 'set') this.grid[action.position] = action.value;
        else if (action.type === 'clear') this.grid[action.position] = null;
        else if (action.type === 'next') this.grid.fill(null);
        this.render();
    }

    // 上一步：退回最後一個動作，再用 toast 寫出退回了什麼。沒得退的時候按鈕是 aria-disabled，click 照樣會送出，所以這裡自己看 undoStack 擋
    undo() {
        if (this.undoStack.length === 0) return;

        // 小選單的選項是照退回之前的盤面畫的，先關掉（不把焦點移回格子，按鈕上的焦點不動）
        this.popover.close();
        const { grid, action } = this.undoStack.pop();
        this.grid = grid;
        this.render();
        FF14Utils.showToast(this.undoneText(action), 'info');
    }

    // toast 的字：填或改寫被退回的那個數字，清除寫清除哪一格，下一張就寫下一張
    undoneText(action) {
        if (action.type === 'set') {
            return this.t('mini_cactpot_undone_set', '已退回：{pos}的 {n}', { pos: this.positionName(action.position), n: action.value });
        }
        if (action.type === 'clear') {
            return this.t('mini_cactpot_undone_clear', '已退回：清除{pos}', { pos: this.positionName(action.position) });
        }
        return this.t('mini_cactpot_undone_next', '已退回：下一張');
    }

    // 下一張：清空盤面開始新的一張，不跳 toast（按錯了按「上一步」救回來）。盤面是空的時按鈕是 aria-disabled，
    // click 照樣會送出，所以這裡自己看盤面是不是空的擋，不然「上一步」會多一步什麼都沒改的
    nextTicket() {
        if (this.grid.every((value) => value === null)) return;

        this.popover.close();
        this.apply({ type: 'next' });
    }

    // 狀態列的一句話：還沒填是 ① 第一步，填了 1–3 格是 ② 刮哪格，填滿 4 格是 ③ 選哪條線；同分的全部寫出來
    statusText(view) {
        if (view.known >= 4) {
            return this.t('mini_cactpot_status_pick', '③ 選{lines}・平均可拿 {mgp} MGP', {
                lines: this.joinNames(view.suggestedLines.map((line) => this.lineName(line))),
                mgp: MiniCactpotSolver.formatMgp(view.bestLineEv)
            });
        }
        if (view.known >= 1) {
            return this.t('mini_cactpot_status_scratch', '② 刮開{cells}', {
                cells: this.joinNames(view.suggestedCells.map((p) => this.positionName(p)))
            });
        }
        return this.t('mini_cactpot_status_start', '① 點遊戲已經翻開的那一格');
    }

    render() {
        const view = MiniCactpotSolver.analyze(this.grid);
        // 填滿 4 格就要選線：沒翻開的格子不能點（遊戲接下來會整張翻開），外圈寫每條線的平均
        const picking = view.known >= 4;
        // 刮格時沒翻開的格子寫「平均」；view.cells 只有這時才有東西
        const averages = new Map(view.cells.map((entry) => [entry.position, entry.ev]));
        // 綠色的格子：刮格時是推薦要刮的格子，選線時是推薦的線上的每一格
        const suggested = new Set(picking
            ? view.suggestedLines.flatMap((line) => MiniCactpotSolver.LINES[line])
            : view.suggestedCells);

        this.elements.status.textContent = this.statusText(view);

        // 選線時外圈寫每條線的平均，但膠囊是 aria-hidden（照 DOM 唸會先唸五條直行與斜線，再唸一條橫列與它的三格）：
        // 螢幕閱讀器改唸狀態列下面這份看不到的清單，一條線一項「上橫列：平均 97」，照橫列、直行、斜線的順序；不用選線時藏起來
        const lineAverages = this.elements.lineAverages;
        lineAverages.textContent = '';
        for (const { line, ev } of view.lines) {
            const item = document.createElement('li');
            item.textContent = this.t('mini_cactpot_line_avg', '{line}：平均 {mgp}', { line: this.lineName(line), mgp: MiniCactpotSolver.formatMgp(ev) });
            lineAverages.appendChild(item);
        }
        lineAverages.hidden = !picking;

        // class 與 disabled 每次都從頭設，不留上一次的樣子；格子只改內容，不重建（小選單關掉時焦點才回得到同一個格子）
        this.cells.forEach((cell, p) => {
            const value = this.grid[p];
            const name = this.positionName(p);
            let text = '?';
            let state = 'is-unknown';
            let label = name;
            if (value !== null) {
                text = String(value);
                state = 'is-number';
                label = this.t('mini_cactpot_cell_number', '{pos}：{n}', { pos: name, n: value });
            } else if (averages.has(p)) {
                const mgp = MiniCactpotSolver.formatMgp(averages.get(p));
                text = this.t('mini_cactpot_avg', '平均 {mgp}', { mgp });
                state = 'is-avg';
                label = this.t('mini_cactpot_cell_avg', '{pos}：平均 {mgp}', { pos: name, mgp });
            }

            cell.textContent = text;
            cell.className = suggested.has(p) ? `cell grid-cell ${state} suggested` : `cell grid-cell ${state}`;
            cell.setAttribute('aria-label', label);
            cell.disabled = picking && value === null;
        });

        // 外圈的膠囊另外還有 line-badge-top 等 class，只切換 suggested，不重設 class
        this.badges.forEach((badge, line) => {
            badge.textContent = picking
                ? MiniCactpotSolver.formatMgp(view.lines[line].ev)
                : MiniCactpotCalculator.LINE_ARROWS[line];
            badge.classList.toggle('suggested', view.suggestedLines.includes(line));
        });

        // 獎金表：推薦的線還可能出現的總和標綠色（view.possibleSums 只有填滿 4 格時才有東西）。只切換 possible，不重設 class（big 要留著）
        this.payoutRows.forEach((row, sum) => {
            row.classList.toggle('possible', view.possibleSums.includes(sum));
        });

        // 上一步：有動作可以退才能按；下一張：盤面上有數字才能按。用 aria-disabled，不用 disabled：按鈕變灰時焦點留在原地
        this.elements.undo.setAttribute('aria-disabled', String(this.undoStack.length === 0));
        this.elements.next.setAttribute('aria-disabled', String(view.known === 0));
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.miniCactpot = new MiniCactpotCalculator();
});
