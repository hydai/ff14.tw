// Mini Cactpot Calculator
class MiniCactpotCalculator {
    constructor() {
        this.grid = new Array(9).fill(null);
        this.selectedCells = [];
        this.history = []; // 歷史記錄
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
            numberPopup: document.getElementById('number-popup'),
            numberGrid: document.querySelector('.number-grid'),
            popupClose: document.querySelector('#number-popup .popup-close')
        };

        // 當前選中的格子位置（用於 popup）
        this.currentPopupPosition = null;
        this.currentPopupOptions = null;
        this.lastFocusedElement = null; // 用於 popup 的無障礙功能

        this.initializeGrid();
        this.initializePopup();
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
            if (btn && !btn.classList.contains('used')) {
                const number = parseInt(btn.dataset.number, 10);
                this.handleNumberSelection(number);
            }
        };
        this.elements.numberGrid.addEventListener('click', this.handleNumberGridClick);

        const cancelAction = () => {
            const { isNewSelection } = this.currentPopupOptions || {};
            this.hideNumberPopup();
            if (isNewSelection && this.history.length > 0) {
                const lastState = this.history.pop();
                this.restoreState(lastState);
                this.updateUndoButton();
            }
        };

        // 取消按鈕
        this.handlePopupCloseClick = cancelAction;
        this.elements.popupClose.addEventListener('click', this.handlePopupCloseClick);

        // 點擊 overlay 關閉
        this.handleOverlayClick = (e) => {
            if (e.target === this.elements.numberPopup) {
                cancelAction();
            }
        };
        this.elements.numberPopup.addEventListener('click', this.handleOverlayClick);

        // 鍵盤事件處理：ESC 關閉、Tab 焦點陷阱
        this.handlePopupKeydown = (e) => {
            if (e.key === 'Escape') {
                cancelAction();
                return;
            }

            if (e.key === 'Tab') {
                const focusableElements = Array.from(this.elements.numberPopup.querySelectorAll('button:not(:disabled)'));
                if (focusableElements.length === 0) return;
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) { // Shift + Tab
                    if (document.activeElement === firstElement) {
                        lastElement.focus();
                        e.preventDefault();
                    }
                } else { // Tab
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        e.preventDefault();
                    }
                }
            }
        };
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
        if (this.handleOverlayClick && this.elements.numberPopup) {
            this.elements.numberPopup.removeEventListener('click', this.handleOverlayClick);
        }
        if (this.handlePopupKeydown) {
            document.removeEventListener('keydown', this.handlePopupKeydown);
        }
    }

    showNumberPopup(position, options = {}) {
        this.currentPopupPosition = position;
        this.currentPopupOptions = options;
        this.lastFocusedElement = document.activeElement;
        this.updateNumberPopupState();
        this.elements.numberPopup.classList.add('visible');
        document.addEventListener('keydown', this.handlePopupKeydown);

        // 將焦點移至第一個可用的數字按鈕，如果沒有則移至關閉按鈕
        const firstAvailableBtn = this.elements.numberGrid.querySelector('.number-btn:not(:disabled)');
        if (firstAvailableBtn) {
            firstAvailableBtn.focus();
        } else {
            this.elements.popupClose.focus();
        }
    }

    hideNumberPopup() {
        this.elements.numberPopup.classList.remove('visible');
        document.removeEventListener('keydown', this.handlePopupKeydown);
        this.currentPopupPosition = null;
        this.currentPopupOptions = null;
        if (this.lastFocusedElement) {
            this.lastFocusedElement.focus();
            this.lastFocusedElement = null;
        }
    }

    updateNumberPopupState() {
        // 更新已使用數字的狀態
        const usedNumbers = this.grid.filter(n => n !== null);

        this.elements.numberGrid.querySelectorAll('.number-btn').forEach(btn => {
            const number = parseInt(btn.dataset.number, 10);
            const isUsed = usedNumbers.includes(number);

            btn.classList.toggle('used', isUsed);
            btn.disabled = isUsed;
        });
    }

    handleNumberSelection(number) {
        if (this.currentPopupPosition === null) return;

        // 檢查數字是否已被使用
        if (this.grid.includes(number)) {
            FF14Utils.showToast(this.getText('mini_cactpot_number_used', { value: number }), 'error');
            return;
        }

        // 保存狀態
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
        if (window.i18n) {
            return window.i18n.getText(this.lineNameKeys[index]);
        }
        return this.lineNamesFallback[index];
    }

    getText(key, params = {}) {
        if (window.i18n) {
            let text = window.i18n.getText(key);
            // Replace placeholders like {value} with actual values
            Object.keys(params).forEach(param => {
                text = text.replace(`{${param}}`, params[param]);
            });
            return text;
        }
        // Fallback for specific keys
        const fallbacks = {
            'mini_cactpot_max_cells': '最多只能選擇 4 個格子',
            'mini_cactpot_number_used': `數字 ${params.value} 已被使用`,
            'mini_cactpot_undone': '已回到上一步',
            'mini_cactpot_reset_done': '已重置九宮格',
            'mini_cactpot_expected_value': '期望值',
            'mini_cactpot_range': '範圍'
        };
        return fallbacks[key] || key;
    }

    saveState() {
        // 保存當前狀態到歷史記錄
        this.history.push({
            grid: [...this.grid],
            selectedCells: [...this.selectedCells],
            timestamp: Date.now()
        });
        
        // 更新撤銷按鈕狀態
        this.updateUndoButton();
    }

    restoreState(state) {
        // 恢復狀態
        this.grid = [...state.grid];
        this.selectedCells = [...state.selectedCells];
        
        // 重繪介面
        this.redrawGrid();
        this.updateUI();
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

    updateUndoButton() {
        // 顯示或隱藏撤銷按鈕
        if (this.history.length > 0) {
            this.elements.undoBtn.style.display = 'inline-block';
        } else {
            this.elements.undoBtn.style.display = 'none';
        }
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
            FF14Utils.showToast(this.getText('mini_cactpot_max_cells'), 'error');
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
            value: `${this.getText('mini_cactpot_expected_value')}：${FF14Utils.formatNumber(Math.round(bestResult.expectedValue))} MGP`,
            valueClass: 'best-choice-value',
            range: `${this.getText('mini_cactpot_range')}：${FF14Utils.formatNumber(bestResult.minMGP)} - ${FF14Utils.formatNumber(bestResult.maxMGP)} MGP`,
            rangeClass: 'best-choice-range'
        });
        
        // Move children from card to bestLineSummary
        while (card.firstChild) {
            this.elements.bestLineSummary.appendChild(card.firstChild);
        }
        
        this.elements.bestChoiceInfo.style.display = 'block';
        this.elements.bestChoiceInfo.scrollIntoView({ behavior: 'smooth' });
    }

    undo() {
        if (this.history.length === 0) return;
        
        // 取出最後的歷史記錄
        const lastState = this.history.pop();
        
        // 恢復狀態
        this.restoreState(lastState);
        
        // 更新撤銷按鈕狀態
        this.updateUndoButton();
        
        FF14Utils.showToast(this.getText('mini_cactpot_undone'), 'success');
    }

}

// 全域函數
function resetGrid() {
    // 清理舊的實例以移除事件監聽器
    if (calculator) {
        calculator.destroy();
    }

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
    document.getElementById('best-choice-info').style.display = 'none';
    
    // 隱藏撤銷按鈕
    document.getElementById('undo-btn').style.display = 'none';
    
    // 重置選擇計數顯示
    document.getElementById('selected-count').textContent = '0';
    
    // 重置計算器實例
    calculator = new MiniCactpotCalculator();
    const resetMsg = window.i18n ? window.i18n.getText('mini_cactpot_reset_done') : '已重置九宮格';
    FF14Utils.showToast(resetMsg, 'success');
}

function undoLastStep() {
    if (calculator) {
        calculator.undo();
    }
}

// 初始化
let calculator;
document.addEventListener('DOMContentLoaded', () => {
    calculator = new MiniCactpotCalculator();
});