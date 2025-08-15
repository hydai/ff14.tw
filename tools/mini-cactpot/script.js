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
        this.lineNames = this.getLineNames();
        
        // DOM 元素快取
        this.elements = {
            grid: document.getElementById('extended-grid'),
            selectedCount: document.getElementById('selected-count'),
            bestChoiceInfo: document.getElementById('best-choice-info'),
            bestLineSummary: document.getElementById('best-line-summary'),
            undoBtn: document.getElementById('undo-btn')
        };
        
        this.initializeGrid();
    }

    getLineNames() {
        if (window.i18n?.isInitialized) {
            return [
                window.i18n.t('lines.topRow'),
                window.i18n.t('lines.middleRow'),
                window.i18n.t('lines.bottomRow'),
                window.i18n.t('lines.leftColumn'),
                window.i18n.t('lines.middleColumn'),
                window.i18n.t('lines.rightColumn'),
                window.i18n.t('lines.leftDiagonal'),
                window.i18n.t('lines.rightDiagonal')
            ];
        }
        // Default Chinese names
        return [
            '上橫列', '中橫列', '下橫列',
            '左直行', '中直行', '右直行',
            '左斜線', '右斜線'
        ];
    }
    
    updateLineNames() {
        this.lineNames = this.getLineNames();
        if (this.selectedCells.length === 4) {
            this.updateUI();
        }
    }

    initializeGrid() {
        // 移除可能存在的舊事件監聽器
        this.elements.grid.removeEventListener('click', this.handleGridClick);
        
        // 綁定新的事件監聽器
        this.handleGridClick = (e) => {
            if (e.target.classList.contains('grid-cell')) {
                this.handleCellClick(parseInt(e.target.dataset.position));
            }
        };
        
        this.elements.grid.addEventListener('click', this.handleGridClick);
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
                // 重新創建輸入框
                const input = document.createElement('input');
                input.type = 'number';
                input.min = '1';
                input.max = '9';
                input.placeholder = '?';
                input.addEventListener('input', (e) => {
                    this.handleNumberInput(position, parseInt(e.target.value));
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.target.blur();
                    }
                });
                SecurityUtils.clearElement(cell);
                cell.appendChild(input);
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
            // 取消選擇
            this.unselectCell(position);
        } else if (this.selectedCells.length < 4) {
            // 選擇格子
            this.selectCell(position);
        } else {
            const msg = window.i18n?.t('messages.maxCells') || '最多只能選擇 4 個格子';
            FF14Utils.showToast(msg, 'error');
        }
    }

    selectCell(position) {
        // 保存狀態
        this.saveState();
        
        const cell = document.querySelector(`[data-position="${position}"]`);
        cell.classList.add('selected');
        this.selectedCells.push(position);
        
        // 創建輸入框
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = '9';
        input.placeholder = '?';
        input.addEventListener('input', (e) => {
            this.handleNumberInput(position, parseInt(e.target.value));
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        });
        
        SecurityUtils.clearElement(cell);
        cell.appendChild(input);
        input.focus();
        
        this.updateUI();
    }

    unselectCell(position) {
        // 保存狀態
        this.saveState();
        
        const cell = document.querySelector(`[data-position="${position}"]`);
        cell.classList.remove('selected', 'revealed');
        cell.textContent = '';
        
        this.selectedCells = this.selectedCells.filter(pos => pos !== position);
        this.grid[position] = null;
        
        this.updateUI();
    }

    handleNumberInput(position, value) {
        if (value >= 1 && value <= 9) {
            // 檢查數字是否已被使用
            if (this.grid.includes(value)) {
                const msg = window.i18n?.t('messages.duplicateNumber', { num: value }) || `數字 ${value} 已被使用`;
                FF14Utils.showToast(msg, 'error');
                return;
            }
            
            // 保存狀態
            this.saveState();
            
            this.grid[position] = value;
            const cell = document.querySelector(`[data-position="${position}"]`);
            cell.classList.add('revealed');
            cell.textContent = value;
            
            this.updateUI();
        }
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
                name: this.lineNames[lineIdx],
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
        
        // Get translated text
        const expectedValueText = window.i18n?.t('bestChoice.expectedValue') || '期望值';
        const mgpText = window.i18n?.t('bestChoice.mgp') || 'MGP';
        
        // Create the card using SecurityUtils
        const card = SecurityUtils.createCard({
            className: '',
            title: bestResult.name,
            titleClass: 'best-choice-title',
            value: `${expectedValueText}：${FF14Utils.formatNumber(Math.round(bestResult.expectedValue))} ${mgpText}`,
            valueClass: 'best-choice-value',
            range: `${FF14Utils.formatNumber(bestResult.minMGP)} - ${FF14Utils.formatNumber(bestResult.maxMGP)} ${mgpText}`,
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
        
        FF14Utils.showToast('已回到上一步', 'success');
    }

}

// 全域函數
function resetGrid() {
    // 移除舊的事件監聽器
    if (calculator && calculator.handleGridClick) {
        calculator.elements.grid.removeEventListener('click', calculator.handleGridClick);
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
    FF14Utils.showToast('已重置九宮格', 'success');
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
    window.calculator = calculator; // Expose for i18n updates
});

// Listen for language changes
document.addEventListener('i18n:languageChanged', () => {
    if (calculator) {
        calculator.updateLineNames();
    }
});