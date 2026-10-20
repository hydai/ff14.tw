// 仙人微彩計算機
// 這一版只畫「一打開」的樣子：狀態列寫第一步、九格都是「?」、外圈是選線的箭頭、兩顆按鈕不能按。
// 期望值的計算在 cactpot-solver.js（MiniCactpotSolver），格子旁的小選單在 assets/js/cell-popover.js（CellPopover）。
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
            board: document.getElementById('extended-grid'),
            undo: document.getElementById('undo-btn'),
            next: document.getElementById('next-btn')
        };
        // 九格與外圈的膠囊都在 index.html 裡，照位置、線的編號收好，重畫時只改內容，不重建
        this.cells = Array.from({ length: 9 }, (_, p) => this.elements.board.querySelector(`.grid-cell[data-position="${p}"]`));
        this.badges = Array.from({ length: 8 }, (_, line) => this.elements.board.querySelector(`.line-badge[data-line="${line}"]`));

        this.popover = new CellPopover({ board: this.elements.board, columns: 3 });

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

    render() {
        this.elements.status.textContent = this.t('mini_cactpot_status_start', '① 點遊戲已經翻開的那一格');

        this.cells.forEach((cell, p) => {
            cell.textContent = '?';
            cell.className = 'cell grid-cell is-unknown';
            cell.setAttribute('aria-label', this.positionName(p));
            cell.disabled = false;
        });

        this.badges.forEach((badge, line) => {
            badge.textContent = MiniCactpotCalculator.LINE_ARROWS[line];
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
