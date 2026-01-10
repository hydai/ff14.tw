// Mini Cactpot Calculator
class MiniCactpotCalculator {
    constructor() {
        this.grid = new Array(9).fill(null);
        this.selectedCells = [];
        this.history = new StateHistoryManager(); // 歷史記錄
        this.modalManager = new ModalManager();
        this.isUndoingOrRedoing = false;

        this.mgpTable = {
            6: 10000, 7: 36, 8: 720, 9: 360, 10: 80,
            11: 252, 12: 108, 13: 72, 14: 54, 15: 180,
            16: 72, 17: 180, 18: 119, 19: 36, 20: 306,
            21: 1080, 22: 144, 23: 1800, 24: 3600
        };
        this.lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // 橫列
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // 直行
            [0, 4, 8], [2, 4, 6]             // 斜線
        ];
        // Line names will be fetched via i18n
        this.lineNameKeys = [
            'mini_cactpot_line_row_top', 'mini_cactpot_line_row_mid', 'mini_cactpot_line_row_bot',
            'mini_cactpot_line_col_left', 'mini_cactpot_line_col_mid', 'mini_cactpot_line_col_right',
            'mini_cactpot_line_diag_left', 'mini_cactpot_line_diag_right'
        ];
        // Fallback line names (Chinese)
        this.lineNamesFallback = [
            '上橫列', '中橫列', '下橫列',
            '左直行', '中直行', '右直行',
            '左斜線', '右斜線'
        ];

        // DOM 元素快取
        this.elements = {
            grid: document.getElementById('extended-grid'),
            selectedCount: document.getElementById('selected-count'),
            bestChoiceInfo: document.getElementById('best-choice-info'),
            bestLineSummary: document.getElementById('best-line-summary'),
            undoBtn: document.getElementById('undo-btn'),
            redoBtn: document.getElementById('redo-btn'),
            resetBtn: document.getElementById('reset-btn'),
            numberPopup: document.getElementById('number-popup'),
            numberGrid: document.querySelector('.number-grid'),
            popupClose: document.querySelector('#number-popup .popup-close')
        };

        // 當前選中的格子位置（用於 popup）
        this.currentPopupPosition = null;
        this.currentPopupOptions = null;
        this.selectionMade = false;
        this.lastFocusedElement = null; // 用於 popup 的無障礙功能

        this.initializeGrid();
        this.initializePopup();
        this.initializeControls();

        // 保存初始狀態
        this.saveState();
    }

    initializeGrid() {
        // 移除可能存在的舊事件監聽器
        this.elements.grid.removeEventListener('click', this.handleGridClick);

        // 綁定新的事件監聽器
        this.handleGridClick = (e) => {
            if (e.target.classList.contains('grid-cell')) {
                this.handleCellClick(parseInt(e.target.dataset.position, 10));
            }
        };

        this.elements.grid.addEventListener('click', this.handleGridClick);
    }

    initializePopup() {
        // 使用事件委派處理數字按鈕點擊
        this.handleNumberGridClick = (e) => {
            const btn = e.target.closest('.number-btn');
            if (btn && !btn.disabled) {
                const number = parseInt(btn.dataset.number, 10);
                this.handleNumberSelection(number);
            }
        };
        this.elements.numberGrid.addEventListener('click', this.handleNumberGridClick);

        // 取消按鈕
        this.handlePopupCloseClick = () => {
            this.hideNumberPopup();
        };
        this.elements.popupClose.addEventListener('click', this.handlePopupCloseClick);
    }

    initializeControls() {
        // Undo button
        this.elements.undoBtn.addEventListener('click', () => {
            this.undo();
        });

        // Redo button
        if (this.elements.redoBtn) {
            this.elements.redoBtn.addEventListener('click', () => {
                this.redo();
            });
        }

        // Reset button
        this.elements.resetBtn.addEventListener('click', () => {
            this.reset();
        });
    }

    destroy() {
        // 移除 grid 事件監聽器
        if (this.handleGridClick && this.elements.grid) {
            this.elements.grid.removeEventListener('click', this.handleGridClick);
        }

        // 移除 popup 事件監聽器
        if (this.handleNumberGridClick && this.elements.numberGrid) {
            this.elements.numberGrid.removeEventListener('click', this.handleNumberGridClick);
        }
        if (this.handlePopupCloseClick && this.elements.popupClose) {
            this.elements.popupClose.removeEventListener('click', this.handlePopupCloseClick);
        }

        // 隱藏 popup (也會清理 ModalManager)
        this.hideNumberPopup();
    }

    showNumberPopup(position, options = {}) {
        this.currentPopupPosition = position;
        this.currentPopupOptions = options;
        this.selectionMade = false;
        this.updateNumberPopupState();

        this.modalManager.show(this.elements.numberPopup, {
            useClass: 'visible',
            onClose: () => {
                // If closed without selection (cancelled) and was a new selection (clicked empty cell)
                // we need to revert the '?' state
                if (
                    !this.selectionMade &&
                    this.currentPopupOptions?.isNewSelection &&
                    this.history.canUndo()
                ) {
                    this.undo();
                }

                this.currentPopupPosition = null;
                this.currentPopupOptions = null;
            }
        });
    }

    hideNumberPopup() {
        this.modalManager.hide();
    }

    updateNumberPopupState() {
        // 更新已使用數字的狀態
        const usedNumbers = this.grid.filter(n => n !== null);

        this.elements.numberGrid.querySelectorAll('.number-btn').forEach(btn => {
            const number = parseInt(btn.dataset.number, 10);
            const isUsed = usedNumbers.includes(number);

            btn.disabled = isUsed;
        });
    }

    handleNumberSelection(number) {
        if (this.currentPopupPosition === null) return;

        // 標記已選擇，避免關閉時觸發取消邏輯
        this.selectionMade = true;

        // 在修改前保存狀態
        this.saveState();

        // 填入數字
        const position = this.currentPopupPosition;
        this.grid[position] = number;
        const cell = document.querySelector(`[data-position="${position}"]`);
        cell.classList.add('revealed');
        cell.textContent = number;

        // 關閉 popup
        this.hideNumberPopup();

        // 更新 UI
        this.updateUI();
    }

    getLineName(index) {
        return FF14Utils.getI18nText(this.lineNameKeys[index], this.lineNamesFallback[index]);
    }

    saveState() {
        if (this.isUndoingOrRedoing) return;

        // 保存當前狀態到歷史記錄
        this.history.push({
            grid: [...this.grid],
            selectedCells: [...this.selectedCells]
        });

        // 更新按鈕狀態
        this.updateHistoryButtons();
    }

    undo() {
        if (!this.history.canUndo()) return;

        this.isUndoingOrRedoing = true;
        const previousState = this.history.undo();

        if (previousState) {
            this.restoreState(previousState);
            FF14Utils.showToast(FF14Utils.getI18nText('msg_success', '操作成功'));
        }

        this.isUndoingOrRedoing = false;
        this.updateHistoryButtons();
    }

    redo() {
        if (!this.history.canRedo()) return;

        this.isUndoingOrRedoing = true;
        const nextState = this.history.redo();

        if (nextState) {
            this.restoreState(nextState);
            FF14Utils.showToast(FF14Utils.getI18nText('msg_success', '操作成功'));
        }

        this.isUndoingOrRedoing = false;
        this.updateHistoryButtons();
    }

    restoreState(state) {
        // 恢復狀態
        this.grid = [...state.grid];
        this.selectedCells = [...state.selectedCells];

        // 重繪介面
        this.redrawGrid();
        this.updateUI();
    }

    updateHistoryButtons() {
        if (this.elements.undoBtn) {
            this.elements.undoBtn.disabled = !this.history.canUndo();
        }

        if (this.elements.redoBtn) {
            this.elements.redoBtn.disabled = !this.history.canRedo();
        }
    }

    redrawGrid() {
        // 清除所有格子
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.remove('selected', 'revealed');
            cell.textContent = '';
        });

        // 重新繪製格子狀態
        this.selectedCells.forEach(position => {
            const cell = document.querySelector(`[data-position="${position}"]`);
            cell.classList.add('selected');

            if (this.grid[position] !== null) {
                cell.classList.add('revealed');
                cell.textContent = this.grid[position];
            } else {
                // 顯示問號表示尚未輸入數字
                cell.textContent = '?';
            }
        });
    }

    handleCellClick(position) {
        const cell = document.querySelector(`[data-position="${position}"]`);

        if (cell.classList.contains('revealed')) {
            return; // 已經輸入數字的格子不能再點選
        }

        if (cell.classList.contains('selected')) {
            // 已選擇但尚未輸入數字的格子，重新顯示 popup
            this.showNumberPopup(position, { isNewSelection: false });
        } else if (this.selectedCells.length < 4) {
            // 選擇格子
            this.selectCell(position);
        } else {
            FF14Utils.showToast(FF14Utils.getI18nText('mini_cactpot_max_cells', '最多只能選擇 4 個格子'), 'error');
        }
    }

    selectCell(position) {
        // 保存狀態
        this.saveState();

        const cell = document.querySelector(`[data-position="${position}"]`);
        cell.classList.add('selected');
        cell.textContent = '?';
        this.selectedCells.push(position);

        this.updateUI();

        // 顯示數字選擇 popup
        this.showNumberPopup(position, { isNewSelection: true });
    }

    updateUI() {
        const selectedCount = this.selectedCells.length;
        const revealedCount = this.selectedCells.filter(pos => this.grid[pos] !== null).length;

        this.elements.selectedCount.textContent = selectedCount;

        // 當輸入完成四個數字時，自動計算並顯示期望值
        if (revealedCount === 4) {
            this.calculateAndDisplayExpectations();
        } else {
            this.clearExpectations();
        }
    }

    getAllPossibleCombinations() {
        const knownNumbers = this.grid.filter(n => n !== null);
        const availableNumbers = [];

        for (let i = 1; i <= 9; i++) {
            if (!knownNumbers.includes(i)) {
                availableNumbers.push(i);
            }
        }

        const emptyPositions = [];
        for (let i = 0; i < 9; i++) {
            if (this.grid[i] === null) {
                emptyPositions.push(i);
            }
        }

        // 生成所有可能的排列組合
        const combinations = [];
        this.generatePermutations(availableNumbers, emptyPositions.length, [], combinations);

        return combinations.map(combo => {
            const fullGrid = [...this.grid];
            combo.forEach((num, idx) => {
                fullGrid[emptyPositions[idx]] = num;
            });
            return fullGrid;
        });
    }

    generatePermutations(arr, length, current, results) {
        if (current.length === length) {
            results.push([...current]);
            return;
        }

        for (let i = 0; i < arr.length; i++) {
            if (!current.includes(arr[i])) {
                current.push(arr[i]);
                this.generatePermutations(arr, length, current, results);
                current.pop();
            }
        }
    }

    calculateAndDisplayExpectations() {
        const lineResults = this.calculateExpectedValues();
        this.displayExpectationsInGrid(lineResults);
        this.showBestChoice(lineResults[0]);
    }

    calculateExpectedValues() {
        const combinations = this.getAllPossibleCombinations();
        const lineResults = this.lines.map((line, lineIdx) => {
            let totalMGP = 0;
            let minMGP = Infinity;
            let maxMGP = -Infinity;

            combinations.forEach(grid => {
                const sum = line.reduce((acc, pos) => acc + grid[pos], 0);
                const mgp = this.mgpTable[sum] || 0;
                totalMGP += mgp;
                minMGP = Math.min(minMGP, mgp);
                maxMGP = Math.max(maxMGP, mgp);
            });

            return {
                name: this.getLineName(lineIdx),
                positions: line,
                expectedValue: totalMGP / combinations.length,
                minMGP,
                maxMGP,
                lineIndex: lineIdx
            };
        });

        // 排序找出最佳選擇
        return lineResults.sort((a, b) => b.expectedValue - a.expectedValue);
    }

    clearExpectations() {
        // 清除所有期望值顯示
        const expectationCells = document.querySelectorAll('.expectation-cell');
        expectationCells.forEach(cell => {
            cell.classList.remove('active', 'best');
            const valueElement = cell.querySelector('.expectation-value');
            if (valueElement) {
                valueElement.remove();
            }
        });

        // 隱藏最佳選擇資訊
        this.elements.bestChoiceInfo.style.display = 'none';
    }

    displayExpectationsInGrid(lineResults) {
        this.clearExpectations();

        lineResults.forEach((result, index) => {
            this.updateExpectationCell(result, index === 0);
        });
    }

    updateExpectationCell(result, isBest) {
        const cell = document.querySelector(`[data-line="${result.lineIndex}"]`);
        if (!cell) return;

        cell.classList.add('active');
        if (isBest) {
            cell.classList.add('best');
        }

        const valueElement = document.createElement('div');
        valueElement.className = 'expectation-value';
        valueElement.textContent = FF14Utils.formatNumber(Math.round(result.expectedValue));
        cell.appendChild(valueElement);
    }

    showBestChoice(bestResult) {
        // Clear existing content
        SecurityUtils.clearElement(this.elements.bestLineSummary);

        // Create the card using SecurityUtils
        const card = SecurityUtils.createCard({
            className: '',
            title: bestResult.name,
            titleClass: 'best-choice-title',
            value: `${FF14Utils.getI18nText('mini_cactpot_expected_value', '期望值')}：${FF14Utils.formatNumber(Math.round(bestResult.expectedValue))} MGP`,
            valueClass: 'best-choice-value',
            range: `${FF14Utils.getI18nText('mini_cactpot_range', '範圍')}：${FF14Utils.formatNumber(bestResult.minMGP)} - ${FF14Utils.formatNumber(bestResult.maxMGP)} MGP`,
            rangeClass: 'best-choice-range'
        });

        // Move children from card to bestLineSummary
        while (card.firstChild) {
            this.elements.bestLineSummary.appendChild(card.firstChild);
        }

        this.elements.bestChoiceInfo.style.display = 'block';
        this.elements.bestChoiceInfo.scrollIntoView({ behavior: 'smooth' });
    }

    reset() {
        // 清除所有格子的狀態
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.remove('selected', 'revealed');
            cell.textContent = '';
        });

        // 清除期望值顯示
        document.querySelectorAll('.expectation-cell').forEach(cell => {
            cell.classList.remove('active', 'best');
            const valueElement = cell.querySelector('.expectation-value');
            if (valueElement) {
                valueElement.remove();
            }
        });

        // 隱藏最佳選擇資訊
        this.elements.bestChoiceInfo.style.display = 'none';

        // 重置選擇計數顯示
        this.elements.selectedCount.textContent = '0';

        // 重置資料
        this.grid = new Array(9).fill(null);
        this.selectedCells = [];
        this.history.clear();

        // 保存初始狀態
        this.saveState();

        FF14Utils.showToast(FF14Utils.getI18nText('mini_cactpot_reset_done', '已重置九宮格'), 'success');
    }
}

// 初始化
let calculator;
document.addEventListener('DOMContentLoaded', () => {
    calculator = new MiniCactpotCalculator();
});
