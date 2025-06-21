// Mini Cactpot Calculator
class MiniCactpotCalculator {
    constructor() {
        this.grid = new Array(9).fill(null);
        this.selectedCells = [];
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
        this.lineNames = [
            '上橫列', '中橫列', '下橫列',
            '左直行', '中直行', '右直行',
            '左斜線', '右斜線'
        ];
        
        // DOM 元素快取
        this.elements = {
            grid: document.getElementById('extended-grid'),
            selectedCount: document.getElementById('selected-count'),
            bestChoiceInfo: document.getElementById('best-choice-info'),
            bestLineSummary: document.getElementById('best-line-summary')
        };
        
        this.initializeGrid();
    }

    initializeGrid() {
        this.elements.grid.addEventListener('click', (e) => {
            if (e.target.classList.contains('grid-cell')) {
                this.handleCellClick(parseInt(e.target.dataset.position));
            }
        });
    }

    handleCellClick(position) {
        const cell = document.querySelector(`[data-position="${position}"]`);
        
        if (cell.classList.contains('revealed')) {
            return; // 已經輸入數字的格子不能再點選
        }

        if (cell.classList.contains('selected')) {
            // 取消選擇
            this.unselectCell(position);
        } else if (this.selectedCells.length < 3) {
            // 選擇格子
            this.selectCell(position);
        } else {
            FF14Utils.showToast('最多只能選擇 3 個格子', 'error');
        }
    }

    selectCell(position) {
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
        
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        
        this.updateUI();
    }

    unselectCell(position) {
        const cell = document.querySelector(`[data-position="${position}"]`);
        cell.classList.remove('selected', 'revealed');
        cell.innerHTML = '';
        
        this.selectedCells = this.selectedCells.filter(pos => pos !== position);
        this.grid[position] = null;
        
        this.updateUI();
    }

    handleNumberInput(position, value) {
        if (value >= 1 && value <= 9) {
            // 檢查數字是否已被使用
            if (this.grid.includes(value)) {
                FF14Utils.showToast(`數字 ${value} 已被使用`, 'error');
                return;
            }
            
            this.grid[position] = value;
            const cell = document.querySelector(`[data-position="${position}"]`);
            cell.classList.add('revealed');
            cell.innerHTML = value;
            
            this.updateUI();
        }
    }
    

    updateUI() {
        const selectedCount = this.selectedCells.length;
        const revealedCount = this.selectedCells.filter(pos => this.grid[pos] !== null).length;
        
        this.elements.selectedCount.textContent = selectedCount;
        
        // 當輸入完成三個數字時，自動計算並顯示期望值
        if (revealedCount === 3) {
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
        this.elements.bestLineSummary.innerHTML = `
            <div class="best-choice-title">
                <strong>${bestResult.name}</strong>
            </div>
            <div class="best-choice-value">
                期望值：${FF14Utils.formatNumber(Math.round(bestResult.expectedValue))} MGP
            </div>
            <div class="best-choice-range">
                範圍：${FF14Utils.formatNumber(bestResult.minMGP)} - ${FF14Utils.formatNumber(bestResult.maxMGP)} MGP
            </div>
        `;
        
        this.elements.bestChoiceInfo.style.display = 'block';
        this.elements.bestChoiceInfo.scrollIntoView({ behavior: 'smooth' });
    }

}

// 全域函數
function resetGrid() {
    calculator = new MiniCactpotCalculator();
    FF14Utils.showToast('已重置九宮格', 'success');
}

// 初始化
let calculator;
document.addEventListener('DOMContentLoaded', () => {
    calculator = new MiniCactpotCalculator();
});