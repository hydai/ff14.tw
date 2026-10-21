// 天書奇談預測器
// 盤面是 index.html 裡寫好的 16 個按鈕：點空格貼上貼紙，再點一次拿掉，最多 9 張，貼滿後其他的空格不能點（disabled），不跳 toast。
// 畫面上的字與屬性都由 render() 照 this.grid 重畫，只改內容與屬性，不重建格子，用鍵盤（Enter、空白鍵）貼上或拿掉之後焦點才會留在同一格。
// 機率表（現在、重置之後，各列「至少 N 條」）也由 render() 重畫：數字與長條的長度來自 tails-odds.js 的 analyze()，只改三列的文字與長度，不重建。
// 盤面上的標示同樣來自 analyze()：連成的線上的格子加 line-done（綠框）、只差一張的空格加 line-near（虛線框），
// 格子的名稱也跟著寫出來（cellLabel()），螢幕閱讀器才聽得到。
// 盤面卡標題列右邊是同一顆「清空盤面」／「復原」按鈕：清空時先把清空前的盤面存在 this.cleared，按鈕就地改成「復原」（不跳 toast，焦點不動）；
// 復原把它放回去。清空之後貼上或拿掉任何一張貼紙，就不能再復原。盤面是空的、也沒有可以復原的盤面時，按鈕不能按（disabled）。
class WondrousTailsCalculator {
    // 最多貼幾張、盤面有幾格（4×4）
    static MAX_STICKERS = 9;
    static CELL_COUNT = 16;
    // 機率表三列的 data-lines：「至少 1 條」「至少 2 條」「至少 3 條」
    static ODDS_LINES = [1, 2, 3];
    // 沒有「重置之後」的機率時（不是貼 3～7 張）寫的符號，U+2014
    static NO_ODDS = '—';

    // 長條的長度：機率就是百分比；沒有這個機率（null）是 0
    static barWidth(fraction) {
        return `${((fraction ?? 0) * 100).toFixed(2)}%`;
    }

    constructor() {
        // 16 格：false 是還沒貼，true 是貼了貼紙
        this.grid = new Array(WondrousTailsCalculator.CELL_COUNT).fill(false);
        // 按「清空盤面」之前的盤面（一份複本）；null 是沒有可以復原的盤面。按「復原」、或貼上與拿掉任何一張貼紙之後都回到 null
        this.cleared = null;

        this.elements = {
            board: document.getElementById('wondrous-grid'),
            count: document.getElementById('placed-count'),
            clear: document.getElementById('clear-btn'),
            odds: document.getElementById('odds-table')
        };
        // 16 個格子照位置收好，重畫時只改內容與屬性
        this.cells = Array.from({ length: WondrousTailsCalculator.CELL_COUNT }, (_, p) => this.elements.board.querySelector(`.grid-cell[data-position="${p}"]`));
        // 機率表的三列照 data-lines 收好，重畫時只改文字與長條的長度：now／after 是「現在」「重置之後」的數字，barNow／barAfter 是它們的長條
        this.oddsRows = WondrousTailsCalculator.ODDS_LINES.map((lines) => {
            const row = this.elements.odds.querySelector(`tr[data-lines="${lines}"]`);
            return {
                now: row.querySelector('.odds-now'),
                after: row.querySelector('.odds-after'),
                barNow: row.querySelector('.odds-bar-now'),
                barAfter: row.querySelector('.odds-bar-after')
            };
        });

        // 點格子：貼上或拿掉。disabled 的格子瀏覽器本來就不送 click，這裡再擋一次
        this.elements.board.addEventListener('click', (event) => {
            const cell = event.target.closest('.grid-cell');
            if (!cell || cell.disabled) return;
            this.toggle(Number(cell.dataset.position));
        });

        // 清空盤面／復原：disabled 的按鈕瀏覽器本來就不送 click
        this.elements.clear.addEventListener('click', () => this.clearOrRestore());

        // 切換語言：張數、按鈕與格子的名稱換成新的語言
        window.i18n.onLanguageChange(() => this.render());

        this.render();
    }

    t(key, fallback, params) {
        return FF14Utils.getI18nText(key, fallback, params);
    }

    // 貼了幾張
    get placedCount() {
        return this.grid.filter(Boolean).length;
    }

    // 點一格：貼了就拿掉，沒貼而且不到 9 張就貼上，然後重畫。
    // 已經 9 張時不能再貼：render() 會讓那些格子 disabled，這裡自己也擋（tails-odds.js 的機率計算遇到超過 9 張的盤面會丟 RangeError）。
    // 位置不在 0–15 也不理，不然盤面上會多出看不見的貼紙。
    // 被擋下來的點擊什麼都不變（包括可以復原的盤面）；真的貼上或拿掉了一張，清空前的盤面就不能再復原（放回去會蓋掉剛貼的）
    toggle(position) {
        if (!Number.isInteger(position) || position < 0 || position >= WondrousTailsCalculator.CELL_COUNT) return;
        if (!this.grid[position] && this.placedCount >= WondrousTailsCalculator.MAX_STICKERS) return;

        this.cleared = null;
        this.grid[position] = !this.grid[position];
        this.render();
    }

    // 「清空盤面」與「復原」是同一顆按鈕：有可以復原的盤面就放回去；否則盤面有貼紙時，先存一份複本再清空。
    // 盤面是空的、也沒有可以復原的盤面時什麼都不做（這時按鈕是 disabled）。不跳 toast：按鈕變成「復原」就是回饋
    clearOrRestore() {
        if (this.cleared !== null) {
            this.grid = this.cleared;
            this.cleared = null;
        } else if (this.placedCount > 0) {
            this.cleared = this.grid.slice();
            this.grid.fill(false);
        }
        this.render();
    }

    render() {
        const view = WondrousTailsOdds.analyze(this.grid);
        // 貼滿 9 張：還沒貼的格子不能再點
        const full = view.placed >= WondrousTailsCalculator.MAX_STICKERS;
        // 連成的線上的格子、只差一張的空格。前者一定貼了，後者一定還沒貼，所以兩個 class 不會同時出現在一格
        const done = new Set(view.doneCells);
        const near = new Set(view.nearCells);

        this.elements.count.textContent = this.t('wondrous_tails_count', '已貼 {n}／9 張', { n: view.placed });

        // 清空盤面／復原：有可以復原的盤面寫「復原」，否則寫「清空盤面」；盤面是空的、也沒有可以復原的盤面時沒東西可清，不能按。
        // 兩種文字會切換，所以不用 data-i18n，由這裡寫；按鈕不重建，焦點留在原處
        const restorable = this.cleared !== null;
        this.elements.clear.textContent = restorable
            ? this.t('wondrous_tails_restore', '復原')
            : this.t('wondrous_tails_clear', '清空盤面');
        this.elements.clear.disabled = !restorable && view.placed === 0;

        // class、disabled 與名稱每次都從頭設，不留上一次的樣子
        this.cells.forEach((cell, p) => {
            const isPlaced = this.grid[p];
            const isDone = done.has(p);
            const isNear = near.has(p);
            const classes = ['cell', 'grid-cell'];
            if (isPlaced) classes.push('placed');
            if (isDone) classes.push('line-done');
            if (isNear) classes.push('line-near');
            cell.className = classes.join(' ');
            cell.setAttribute('aria-pressed', String(isPlaced));
            cell.disabled = !isPlaced && full;
            cell.setAttribute('aria-label', this.cellLabel(p, isDone, isNear));
        });

        this.renderOdds(view);
    }

    // 格子的名稱：綠框與虛線框只畫在畫面上，螢幕閱讀器看不到，所以把意思也寫進名稱
    cellLabel(position, isDone, isNear) {
        const n = position + 1;
        if (isDone) return this.t('wondrous_tails_cell_line', '第 {n} 格：已連成線', { n });
        if (isNear) return this.t('wondrous_tails_cell_near', '第 {n} 格：貼了就連成線', { n });
        return this.t('wondrous_tails_cell_label', '第 {n} 格', { n });
    }

    // 機率表：每一列寫「現在」與「重置之後」的百分比，兩條長條的長度就是那個機率。
    // 不能重置（不是貼 3～7 張）時 view.afterReset 是 null：數字寫「—」，長條長度 0。
    // 表頭與每一列的名稱是 data-i18n，由 I18nManager 換語言，這裡不碰
    renderOdds(view) {
        this.oddsRows.forEach((row, i) => {
            const now = view.now[i];
            const after = view.afterReset ? view.afterReset[i] : null;
            row.now.textContent = WondrousTailsOdds.formatPercent(now);
            row.after.textContent = after === null ? WondrousTailsCalculator.NO_ODDS : WondrousTailsOdds.formatPercent(after);
            row.barNow.style.width = WondrousTailsCalculator.barWidth(now);
            row.barAfter.style.width = WondrousTailsCalculator.barWidth(after);
        });
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.wondrousTails = new WondrousTailsCalculator();
});
