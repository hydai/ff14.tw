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
        this.initializeGrid();
    }

    initializeGrid() {
        const gridElement = document.getElementById('cactpot-grid');
        gridElement.addEventListener('click', (e) => {
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
        
        document.getElementById('selected-count').textContent = selectedCount;
        
        const calculateBtn = document.getElementById('calculate-btn');
        calculateBtn.disabled = revealedCount !== 3;
        
        if (revealedCount === 3) {
            calculateBtn.textContent = '計算期望值';
        } else {
            calculateBtn.textContent = `請輸入數字 (${revealedCount}/3)`;
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

    calculateExpectedValues() {
        const combinations = this.getAllPossibleCombinations();
        const lineResults = [];
        
        for (let lineIdx = 0; lineIdx < this.lines.length; lineIdx++) {
            const line = this.lines[lineIdx];
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
            
            const expectedValue = totalMGP / combinations.length;
            
            lineResults.push({
                name: this.lineNames[lineIdx],
                positions: line,
                expectedValue: expectedValue,
                minMGP: minMGP,
                maxMGP: maxMGP
            });
        }
        
        // 排序找出最佳和最差選擇
        lineResults.sort((a, b) => b.expectedValue - a.expectedValue);
        
        this.displayResults(lineResults, combinations.length);
    }

    displayResults(lineResults, totalCombinations) {
        const resultsElement = document.getElementById('results');
        const bestLineElement = document.getElementById('best-line');
        const linesGridElement = document.getElementById('lines-grid');
        
        // 顯示最佳選擇
        const bestLine = lineResults[0];
        bestLineElement.innerHTML = `
            <div class="best-line-display">
                <div>🏆 推薦選擇：${bestLine.name}</div>
                <div>期望值：<span class="mgp-display">${FF14Utils.formatNumber(Math.round(bestLine.expectedValue))} MGP</span></div>
                <div>範圍：${FF14Utils.formatNumber(bestLine.minMGP)} - ${FF14Utils.formatNumber(bestLine.maxMGP)} MGP</div>
            </div>
        `;
        
        // 顯示所有線條結果
        linesGridElement.innerHTML = '';
        lineResults.forEach((line, index) => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'line-result';
            
            if (index === 0) {
                lineDiv.classList.add('best');
            } else if (index === lineResults.length - 1) {
                lineDiv.classList.add('worst');
            }
            
            lineDiv.innerHTML = `
                <div class="line-name">${line.name}</div>
                <div class="line-expected">${FF14Utils.formatNumber(Math.round(line.expectedValue))} MGP</div>
                <div class="line-range">
                    範圍：${FF14Utils.formatNumber(line.minMGP)} - ${FF14Utils.formatNumber(line.maxMGP)}
                </div>
            `;
            
            linesGridElement.appendChild(lineDiv);
        });
        
        resultsElement.style.display = 'block';
        resultsElement.scrollIntoView({ behavior: 'smooth' });
        
        FF14Utils.showToast(`已分析 ${FF14Utils.formatNumber(totalCombinations)} 種可能組合`, 'success');
    }
}

// 全域函數
function resetGrid() {
    calculator = new MiniCactpotCalculator();
    document.getElementById('results').style.display = 'none';
    FF14Utils.showToast('已重置九宮格', 'success');
}

function calculateExpectedValues() {
    calculator.calculateExpectedValues();
}

// 初始化
let calculator;
document.addEventListener('DOMContentLoaded', () => {
    calculator = new MiniCactpotCalculator();
});