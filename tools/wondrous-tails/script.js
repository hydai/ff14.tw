// 天書奇談預測器
// 盤面是 index.html 裡寫好的 16 個按鈕：點空格貼上貼紙，再點一次拿掉，最多 9 張，貼滿後其他的空格不能點（disabled），不跳 toast。
// 畫面上的字與屬性都由 render() 照 this.grid 重畫，只改內容與屬性，不重建格子，用鍵盤（Enter、空白鍵）貼上或拿掉之後焦點才會留在同一格。
class WondrousTailsCalculator {
    // 最多貼幾張、盤面有幾格（4×4）
    static MAX_STICKERS = 9;
    static CELL_COUNT = 16;

    constructor() {
        // 16 格：false 是還沒貼，true 是貼了貼紙
        this.grid = new Array(WondrousTailsCalculator.CELL_COUNT).fill(false);

        this.elements = {
            board: document.getElementById('wondrous-grid'),
            count: document.getElementById('placed-count')
        };
        // 16 個格子照位置收好，重畫時只改內容與屬性
        this.cells = Array.from({ length: WondrousTailsCalculator.CELL_COUNT }, (_, p) => this.elements.board.querySelector(`.grid-cell[data-position="${p}"]`));

        // 點格子：貼上或拿掉。disabled 的格子瀏覽器本來就不送 click，這裡再擋一次
        this.elements.board.addEventListener('click', (event) => {
            const cell = event.target.closest('.grid-cell');
            if (!cell || cell.disabled) return;
            this.toggle(Number(cell.dataset.position));
        });

        // 切換語言：張數與格子的名稱換成新的語言
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
    // 位置不在 0–15 也不理，不然盤面上會多出看不見的貼紙
    toggle(position) {
        if (!Number.isInteger(position) || position < 0 || position >= WondrousTailsCalculator.CELL_COUNT) return;
        if (!this.grid[position] && this.placedCount >= WondrousTailsCalculator.MAX_STICKERS) return;

        this.grid[position] = !this.grid[position];
        this.render();
    }

    render() {
        const placed = this.placedCount;
        // 貼滿 9 張：還沒貼的格子不能再點
        const full = placed >= WondrousTailsCalculator.MAX_STICKERS;

        this.elements.count.textContent = this.t('wondrous_tails_count', '已貼 {n}／9 張', { n: placed });

        // class 與 disabled 每次都從頭設，不留上一次的樣子
        this.cells.forEach((cell, p) => {
            const isPlaced = this.grid[p];
            cell.className = isPlaced ? 'cell grid-cell placed' : 'cell grid-cell';
            cell.setAttribute('aria-pressed', String(isPlaced));
            cell.disabled = !isPlaced && full;
            cell.setAttribute('aria-label', this.t('wondrous_tails_cell_label', '第 {n} 格', { n: p + 1 }));
        });
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.wondrousTails = new WondrousTailsCalculator();
});
