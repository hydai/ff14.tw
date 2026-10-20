// 仙人微彩計算機
// 盤面上的每個字都從 MiniCactpotSolver.analyze(this.grid) 畫出來（cactpot-solver.js，不碰 DOM）：
// 狀態列寫下一步，格子寫數字或「平均」，外圈在選線時寫每條線的平均，推薦的格子與線標綠色。
// 填數字用格子旁的小選單（assets/js/cell-popover.js 的 CellPopover）。上一步、下一張還不能按。
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

    constructor() {
        // 九格的數字：null 是還沒填，1–9 是填了的數字
        this.grid = new Array(9).fill(null);

        this.elements = {
            status: document.getElementById('cactpotStatus'),
            lineAverages: document.getElementById('cactpotLineAverages'),
            board: document.getElementById('extended-grid'),
            undo: document.getElementById('undo-btn'),
            next: document.getElementById('next-btn')
        };
        // 九格與外圈的膠囊都在 index.html 裡，照位置、線的編號收好，重畫時只改內容，不重建
        this.cells = Array.from({ length: 9 }, (_, p) => this.elements.board.querySelector(`.grid-cell[data-position="${p}"]`));
        this.badges = Array.from({ length: 8 }, (_, line) => this.elements.board.querySelector(`.line-badge[data-line="${line}"]`));

        this.popover = new CellPopover({ board: this.elements.board, columns: 3 });

        // 點格子：在格子旁邊打開小數字盤。Esc、點外面、焦點移出由小選單自己關；點另一格就是對另一格再呼叫 open()
        this.elements.board.addEventListener('click', (event) => this.handleBoardClick(event));

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

    // 填、改或清除一格，然後重畫。action 是 { type: 'set', position, value } 或 { type: 'clear', position }
    apply(action) {
        if (action.type === 'set') this.grid[action.position] = action.value;
        else if (action.type === 'clear') this.grid[action.position] = null;
        this.render();
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

        // 上一步、下一張還不能按（用 aria-disabled，不用 disabled：按鈕變灰時焦點留在原地）
        this.elements.undo.setAttribute('aria-disabled', 'true');
        this.elements.next.setAttribute('aria-disabled', 'true');
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.miniCactpot = new MiniCactpotCalculator();
});
