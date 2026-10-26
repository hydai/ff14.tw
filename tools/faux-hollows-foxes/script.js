// 宗長計算機
// 畫面上的每個字都從 FauxHollowsSolver.analyze(this.boards, this.state) 畫出來（hollows-solver.js，不碰 DOM）：
// 每次重畫都從 36 格的狀態重新算，自動補上的障礙物不存進 this.state。
// 36 個格子是 index.html 裡的按鈕（鍵盤按 Enter、空白鍵就能點），重畫只改內容與屬性，不重建。
//
// ① 標障礙物：狀態列寫已知幾個（共 5 個），格子是切換鈕（aria-pressed），只有可能是障礙物的格子能點；
//    其他障礙物的位置能確定時自動補上（斜線、不能點），擺法確定就進入翻格。
// ② 翻格：手動標的與自動補上的障礙物都鎖住（disabled）。
//
// 擺法確定的那一刻，焦點所在的格子可能跟著鎖住：瀏覽器會把焦點丟到頁面上，只用鍵盤就玩不下去，
// 所以重畫時先記下焦點在哪一格，鎖住了就把焦點移到下一格。
class FauxHollowsFoxes {
    // 格子狀態的名稱：翻譯鍵與中文預設文字。auto 是自動補上的障礙物，只用在名稱上，不存進 this.state
    static STATE_KEYS = {
        obstacle: 'faux_hollows_cell_state_obstacle',
        auto: 'faux_hollows_cell_state_auto'
    };
    static STATE_NAMES = {
        obstacle: '障礙物',
        auto: '障礙物（自動補上）'
    };

    constructor() {
        // board-data.js 的 252 種 6×6 盤面，每一種接成長度 36 的陣列
        this.boards = FauxHollowsSolver.flatten(window.FAUX_HOLLOWS_BOARD_DATA);
        // 36 格的狀態：null 是還沒標，'obstacle' 是手動標的障礙物
        this.state = new Array(FauxHollowsSolver.SIZE).fill(null);

        this.elements = {
            status: document.getElementById('hollowsStatus'),
            board: document.getElementById('hollows-grid')
        };
        // 36 格都在 index.html 裡，照位置收好；重畫時只改內容與屬性，不重建（焦點才留得在同一個元素上）
        this.cells = Array.from({ length: FauxHollowsSolver.SIZE }, (_, p) => this.elements.board.querySelector(`.grid-cell[data-position="${p}"]`));

        // 點格子：整個盤面只聽一次 click，由 handleBoardClick() 找出是哪一格
        this.elements.board.addEventListener('click', (event) => this.handleBoardClick(event));

        // 切換語言：狀態列與格子名稱都是 render() 寫的，用新的語言重畫
        window.i18n.onLanguageChange(() => this.render());

        this.render();
    }

    t(key, fallback, params) {
        return FF14Utils.getI18nText(key, fallback, params);
    }

    // 位置 p（0–35）照目前語言的名稱：第 p+1 格
    cellName(p) {
        return this.t('faux_hollows_cell_label', '第 {n} 格', { n: p + 1 });
    }

    // 格子狀態照目前語言的名稱，value 是 'obstacle'（手動標的）或 'auto'（自動補上的）
    stateName(value) {
        return this.t(FauxHollowsFoxes.STATE_KEYS[value], FauxHollowsFoxes.STATE_NAMES[value]);
    }

    handleBoardClick(event) {
        const cell = event.target.closest('.grid-cell');
        if (!cell || cell.disabled) return;

        // 鍵盤按 Enter、空白鍵送出的 click，detail 是 0（滑鼠點是 1 以上）
        this.tapCell(Number(cell.dataset.position), { keyboard: event.detail === 0 });
    }

    // 點一格。障礙物階段：手動標的拿掉，還能標的標上，其他（不可能的、自動補上的）什麼都不做；
    // 翻格階段的格子還不能點，什麼都不做。自己看 analyze() 擋，不靠格子的 disabled，直接呼叫也一樣。
    // keyboard：是不是用鍵盤點的，障礙物階段用不到
    tapCell(position, { keyboard = false } = {}) {
        const view = FauxHollowsSolver.analyze(this.boards, this.state);
        if (view.phase !== 'obstacles') return;

        if (this.state[position] === 'obstacle') {
            this.apply({ type: 'clear', position });
        } else if (view.obstacleCells.includes(position)) {
            this.apply({ type: 'set', position, value: 'obstacle' });
        }
    }

    // 標上或拿掉一格，然後重畫。action 是 { type: 'set', position, value } 或 { type: 'clear', position }
    apply(action) {
        if (action.type === 'set') this.state[action.position] = action.value;
        else if (action.type === 'clear') this.state[action.position] = null;
        this.render();
    }

    // 狀態列的一句話：障礙物階段寫已知幾個（還沒有就只寫要做什麼）；擺法確定後進入翻格，一開始一定是找劍，還剩 11 次
    statusText(view) {
        if (view.phase === 'obstacles') {
            if (view.known > 0) {
                return this.t('faux_hollows_status_obstacles_known', '① 點遊戲裡被擋住的格子・已知 {n}／5', { n: view.known });
            }
            return this.t('faux_hollows_status_obstacles', '① 點遊戲裡被擋住的格子');
        }
        return this.t('faux_hollows_status_sword', '② 找劍・剩 {n} 次', { n: view.left });
    }

    render() {
        const view = FauxHollowsSolver.analyze(this.boards, this.state);
        // 先記下焦點在哪一格：下面有的格子會變成 disabled，焦點要在那之前就記好
        const focused = this.cells.indexOf(document.activeElement);
        const revealing = view.phase === 'reveal';
        const separator = this.t('label_sep_colon', '：');

        this.elements.status.textContent = this.statusText(view);

        // class、disabled 與 aria 每次都從頭設，不留上一次的樣子；格子只改內容，不重建
        this.cells.forEach((cell, p) => {
            const manual = this.state[p] === 'obstacle';
            const auto = view.auto.includes(p);

            let className = 'cell grid-cell';
            let label = this.cellName(p);
            if (manual) {
                className += ' is-obstacle';
                label += separator + this.stateName('obstacle');
            } else if (auto) {
                className += ' is-obstacle is-auto';
                label += separator + this.stateName('auto');
            }

            cell.className = className;
            cell.textContent = '';
            // 障礙物階段：手動標的是切換鈕，還能標的才能點；翻格階段：障礙物都鎖住，其他格子可以點
            cell.disabled = revealing ? (manual || auto) : (!manual && !view.obstacleCells.includes(p));
            // 切換鈕才有 aria-pressed，翻格階段的格子不是切換鈕
            if (revealing) cell.removeAttribute('aria-pressed');
            else cell.setAttribute('aria-pressed', String(manual));
            cell.setAttribute('aria-label', label);
        });

        // 焦點所在的格子鎖住了（擺法確定，它是障礙物）：移到下一格，沒有下一格就移到第一個能點的格子
        if (focused !== -1 && this.cells[focused].disabled) {
            const target = view.next.length > 0 ? this.cells[view.next[0]] : this.cells.find((cell) => !cell.disabled);
            target?.focus();
        }
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.fauxHollows = new FauxHollowsFoxes();
});
