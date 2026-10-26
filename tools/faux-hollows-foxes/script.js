// 宗長計算機
// 畫面上的每個字都從 FauxHollowsSolver.analyze(this.boards, this.state) 畫出來（hollows-solver.js，不碰 DOM）：
// 每次重畫都從 36 格的狀態重新算，自動補上的障礙物不存進 this.state。
// 36 個格子是 index.html 裡的按鈕（鍵盤按 Enter、空白鍵就能點），重畫只改內容與屬性，不重建。
//
// ① 標障礙物：狀態列寫已知幾個（共 5 個），格子是切換鈕（aria-pressed），只有可能是障礙物的格子能點；
//    其他障礙物的位置能確定時自動補上（斜線、不能點），擺法確定就進入翻格。
// ② 翻格：手動標的與自動補上的障礙物都鎖住（disabled）。點還沒翻的格子，在格子旁邊開小選單
//    （assets/js/cell-popover.js 的 CellPopover）選劍、寶箱、宗長、空，和其他格對不上的選項是灰的；只剩一種可能時點一下就標好，不開選單。
//    翻開的格子再點是同一個選單，目前的標成已選，最後多一個「清除」。一局最多翻 11 格，用完時還沒翻的格子不能點，翻開的照樣能點。
//    狀態列照 analyze() 的目標寫：② 找劍 → ③ 找寶箱 → ④ 翻宗長（不一定有）→ 完成。
//
// 擺法確定的那一刻，焦點所在的格子可能跟著鎖住：瀏覽器會把焦點丟到頁面上，只用鍵盤就玩不下去，
// 所以重畫時先記下焦點在哪一格，鎖住了就把焦點移到下一格。
class FauxHollowsFoxes {
    // 格子狀態的名稱：翻譯鍵與中文預設文字。auto 是自動補上的障礙物，只用在名稱上，不存進 this.state
    static STATE_KEYS = {
        obstacle: 'faux_hollows_cell_state_obstacle',
        auto: 'faux_hollows_cell_state_auto',
        sword: 'faux_hollows_cell_state_sword',
        chest: 'faux_hollows_cell_state_chest',
        fox: 'faux_hollows_cell_state_fox',
        empty: 'faux_hollows_cell_state_empty'
    };
    static STATE_NAMES = {
        obstacle: '障礙物',
        auto: '障礙物（自動補上）',
        sword: '劍',
        chest: '寶箱',
        fox: '宗長',
        empty: '空'
    };

    // 小選單的選項文字：翻譯鍵與中文預設文字。clear 是翻開的格子才有的「清除」
    static POPUP_KEYS = {
        sword: 'faux_hollows_popup_sword',
        chest: 'faux_hollows_popup_chest',
        fox: 'faux_hollows_popup_fox',
        empty: 'faux_hollows_popup_empty',
        clear: 'faux_hollows_popup_clear'
    };
    static POPUP_LABELS = {
        sword: '⚔️ 劍',
        chest: '📦 寶箱',
        fox: '🦊 宗長',
        empty: '空',
        clear: '清除'
    };

    // 翻開的格子上的圖示
    static ICONS = {
        sword: '⚔️',
        chest: '📦',
        fox: '🦊',
        empty: '✕'
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

        // 翻開格子用的小選單，掛在盤面裡（盤面要 position: relative）；選項排 2 欄
        this.popover = new CellPopover({ board: this.elements.board, columns: 2 });

        // 點格子：整個盤面只聽一次 click，由 handleBoardClick() 找出是哪一格。Esc、點外面、焦點移出由小選單自己關
        this.elements.board.addEventListener('click', (event) => this.handleBoardClick(event));

        // 切換語言：小選單的文字是打開時才寫的，先關掉；狀態列與格子名稱都是 render() 寫的，用新的語言重畫
        window.i18n.onLanguageChange(() => {
            this.popover.close();
            this.render();
        });

        this.render();
    }

    t(key, fallback, params) {
        return FF14Utils.getI18nText(key, fallback, params);
    }

    // 位置 p（0–35）照目前語言的名稱：第 p+1 格
    cellName(p) {
        return this.t('faux_hollows_cell_label', '第 {n} 格', { n: p + 1 });
    }

    // 格子狀態照目前語言的名稱，value 是 'obstacle'（手動標的）、'auto'（自動補上的）或翻開的 sword、chest、fox、empty
    stateName(value) {
        return this.t(FauxHollowsFoxes.STATE_KEYS[value], FauxHollowsFoxes.STATE_NAMES[value]);
    }

    // 這一格翻開的是什麼（sword、chest、fox、empty）；還沒翻、是障礙物、或不是盤面上的位置都是 null
    itemAt(position) {
        const mark = this.state[position];
        return FauxHollowsSolver.ITEMS.includes(mark) ? mark : null;
    }

    handleBoardClick(event) {
        const cell = event.target.closest('.grid-cell');
        if (!cell || cell.disabled) return;

        // 鍵盤按 Enter、空白鍵送出的 click，detail 是 0（滑鼠點是 1 以上）
        this.tapCell(Number(cell.dataset.position), { keyboard: event.detail === 0 });
    }

    // 點一格。障礙物階段：手動標的拿掉，還能標的標上，其他（不可能的、自動補上的）什麼都不做。
    // 翻格階段：障礙物什麼都不做；次數用完時還沒翻的格子也什麼都不做（翻開的照樣能點）；
    // 還沒翻而且只剩一種可能就直接標好，不開選單；其他在格子旁邊打開小選單。
    // 自己看 analyze() 與 choices() 擋，不靠格子的 disabled，直接呼叫也一樣。
    // keyboard：是不是用鍵盤點的，用鍵盤打開的小選單，焦點移到第一個能選的選項
    tapCell(position, { keyboard = false } = {}) {
        const view = FauxHollowsSolver.analyze(this.boards, this.state);
        if (view.phase === 'obstacles') {
            if (this.state[position] === 'obstacle') {
                this.apply({ type: 'clear', position });
            } else if (view.obstacleCells.includes(position)) {
                this.apply({ type: 'set', position, value: 'obstacle' });
            }
            return;
        }

        if (this.state[position] === 'obstacle' || view.auto.includes(position)) return;
        const revealed = this.itemAt(position) !== null;
        if (!revealed && view.left === 0) return;

        // 沒有任何選項的格子（不是盤面上的位置）也沒有東西可以開
        const options = FauxHollowsSolver.choices(this.boards, this.state, position);
        if (options.length === 0) return;
        if (!revealed && options.length === 1) {
            this.choose(position, options[0]);
            return;
        }

        this.popover.open(this.cells[position], this.menuOptions(position, options), {
            label: this.t('faux_hollows_menu_label', '{cell}翻到什麼', { cell: this.cellName(position) }),
            // 上三列開在格子下方，下三列開在上方
            placement: Math.floor(position / 6) < 3 ? 'below' : 'above',
            focusFirst: keyboard,
            onSelect: (value) => this.choose(position, value)
        });
    }

    // 位置 position 的小選單：劍、寶箱、宗長、空，和其他格對不上的是灰的（options 是 choices() 的結果），這一格目前的標成已選；
    // 翻開的格子最後多一個獨佔一列的「清除」
    menuOptions(position, options) {
        const items = FauxHollowsSolver.ITEMS.map((item) => ({
            value: item,
            label: this.t(FauxHollowsFoxes.POPUP_KEYS[item], FauxHollowsFoxes.POPUP_LABELS[item]),
            disabled: !options.includes(item),
            current: this.state[position] === item
        }));
        if (this.itemAt(position) !== null) {
            items.push({
                value: 'clear',
                label: this.t(FauxHollowsFoxes.POPUP_KEYS.clear, FauxHollowsFoxes.POPUP_LABELS.clear),
                wide: true
            });
        }
        return items;
    }

    // 這一格翻到了什麼：value 是 ITEMS 之一，或 'clear'（清掉翻開的這一格）。小選單與「只剩一種」都走這裡。
    // 自己再擋一次，不靠小選單只列得出能選的：不是翻格階段、障礙物、清除還沒翻的格子、不是選項、就是現在的值、
    // 次數用完時還沒翻的格子、和其他格對不上的選項，直接呼叫也什麼都不變
    choose(position, value) {
        const view = FauxHollowsSolver.analyze(this.boards, this.state);
        if (view.phase !== 'reveal') return;
        if (this.state[position] === 'obstacle' || view.auto.includes(position)) return;

        const current = this.itemAt(position);
        if (value === 'clear') {
            if (current === null) return;
        } else {
            if (!FauxHollowsSolver.ITEMS.includes(value) || value === current) return;
            if (current === null && view.left === 0) return;
            if (!FauxHollowsSolver.choices(this.boards, this.state, position).includes(value)) return;
        }

        this.apply(value === 'clear' ? { type: 'clear', position } : { type: 'set', position, value });
    }

    // 標上或拿掉一格，然後重畫。action 是 { type: 'set', position, value } 或 { type: 'clear', position }
    apply(action) {
        if (action.type === 'set') this.state[action.position] = action.value;
        else if (action.type === 'clear') this.state[action.position] = null;
        this.render();
    }

    // 狀態列的一句話：障礙物階段寫已知幾個（還沒有就只寫要做什麼）；擺法確定後進入翻格，一開始一定是找劍，還剩 11 次，
    // 之後照 analyze() 的目標寫：找劍 → 找寶箱 → 翻宗長（剩的次數不夠翻完劍或寶箱就跳到下一個），都沒有就是完成
    statusText(view) {
        if (view.phase === 'obstacles') {
            if (view.known > 0) {
                return this.t('faux_hollows_status_obstacles_known', '① 點遊戲裡被擋住的格子・已知 {n}／5', { n: view.known });
            }
            return this.t('faux_hollows_status_obstacles', '① 點遊戲裡被擋住的格子');
        }
        if (view.goal === 'sword') {
            return this.t('faux_hollows_status_sword', '② 找劍・剩 {n} 次', { n: view.left });
        }
        if (view.goal === 'chest') {
            return this.t('faux_hollows_status_chest', '③ 找寶箱・剩 {n} 次', { n: view.left });
        }
        if (view.goal === 'fox') {
            return this.t('faux_hollows_status_fox', '④ 翻宗長（不一定有）・剩 {n} 次', { n: view.left });
        }
        return this.t('faux_hollows_status_done', '完成');
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
            const item = this.itemAt(p);

            // 還沒翻的格子不加 class：會設底色或框的 class 會蓋掉共用的 .cell.suggested 綠框
            let className = 'cell grid-cell';
            let label = this.cellName(p);
            if (manual) {
                className += ' is-obstacle';
                label += separator + this.stateName('obstacle');
            } else if (auto) {
                className += ' is-obstacle is-auto';
                label += separator + this.stateName('auto');
            } else if (item !== null) {
                className += ` is-${item}`;
                label += separator + this.stateName(item);
            }

            cell.className = className;
            cell.textContent = '';
            if (item !== null) {
                const icon = document.createElement('span');
                icon.className = 'cell-icon';
                icon.textContent = FauxHollowsFoxes.ICONS[item];
                cell.appendChild(icon);
            }
            // 障礙物階段：手動標的是切換鈕，還能標的才能點；翻格階段：障礙物都鎖住，次數用完時還沒翻的格子也鎖住（翻開的照樣能點）
            // 次數用完時鎖住的還沒翻格子，上面照樣畫了提示（⚔️、📦 的機率與 🦊），是刻意的：設計 6.4「完成時盤面保留」，例如寶箱剩下的格子還寫著 📦100%
            cell.disabled = revealing ? (manual || auto || (item === null && view.left === 0)) : (!manual && !view.obstacleCells.includes(p));
            // 切換鈕才有 aria-pressed，翻格階段的格子不是切換鈕；開小選單的鈕才有 aria-expanded（CellPopover 設），障礙物階段的格子沒有
            if (revealing) {
                cell.removeAttribute('aria-pressed');
            } else {
                cell.setAttribute('aria-pressed', String(manual));
                cell.removeAttribute('aria-expanded');
            }
            cell.setAttribute('aria-label', label);
        });

        // 焦點所在的格子鎖住了（擺法確定，它是障礙物；或次數用完，它還沒翻）：移到下一格，沒有下一格就移到第一個能點的格子
        // 鎖住的原因還有第三種：還在標障礙物時，標了別的格子後它變得不可能或被自動補上，或拿掉它自己的標記後被自動補上
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
