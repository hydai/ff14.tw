class WondrousTailsCalculator {
    constructor() {
        this.gridSize = 4;
        this.totalObjects = 9;
        this.grid = Array(16).fill(false); // 4x4 grid, false = empty, true = placed
        this.placedCount = 0;
        
        this.elements = {
            grid: document.getElementById('wondrous-grid'),
            placedCount: document.getElementById('placed-count'),
            resetBtn: document.getElementById('reset-btn'),
            calculateBtn: document.getElementById('calculate-btn'),
            resultsPanel: document.getElementById('results-panel'),
            prob1Line: document.getElementById('prob-1-line'),
            prob2Lines: document.getElementById('prob-2-lines'),
            prob3Lines: document.getElementById('prob-3-lines'),
            recommendationText: document.getElementById('recommendation-text')
        };
        
        this.initializeGrid();
        this.initializeEvents();
    }
    
    initializeGrid() {
        this.elements.grid.innerHTML = '';
        
        for (let i = 0; i < 16; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.position = i;
            this.elements.grid.appendChild(cell);
        }
    }
    
    initializeEvents() {
        this.handleCellClick = (e) => {
            if (e.target.classList.contains('grid-cell')) {
                this.toggleCell(parseInt(e.target.dataset.position));
            }
        };
        
        this.handleReset = () => {
            this.resetGrid();
        };
        
        this.handleCalculate = () => {
            this.calculateProbabilities();
        };
        
        this.elements.grid.addEventListener('click', this.handleCellClick);
        this.elements.resetBtn.addEventListener('click', this.handleReset);
        this.elements.calculateBtn.addEventListener('click', this.handleCalculate);
    }
    
    toggleCell(position) {
        if (this.grid[position]) {
            // Remove object
            this.grid[position] = false;
            this.placedCount--;
        } else {
            // Add object (max 9)
            if (this.placedCount < this.totalObjects) {
                this.grid[position] = true;
                this.placedCount++;
            } else {
                FF14Utils.showToast('最多只能放置 9 個物件', 'error');
                return;
            }
        }
        
        this.updateDisplay();
    }
    
    updateDisplay() {
        // Update grid visualization
        const cells = this.elements.grid.querySelectorAll('.grid-cell');
        cells.forEach((cell, index) => {
            cell.classList.toggle('placed', this.grid[index]);
        });
        
        // Update counter
        this.elements.placedCount.textContent = this.placedCount;
        
        // Hide results when grid changes
        this.elements.resultsPanel.style.display = 'none';
    }
    
    resetGrid() {
        this.grid = Array(16).fill(false);
        this.placedCount = 0;
        this.updateDisplay();
        FF14Utils.showToast('盤面已重置');
    }
    
    // Check if a line (4 consecutive positions) has all objects placed
    checkLine(positions) {
        return positions.every(pos => this.grid[pos]);
    }
    
    // Get all possible lines (horizontal, vertical, diagonal)
    getAllLines() {
        const lines = [];
        
        // Horizontal lines
        for (let row = 0; row < 4; row++) {
            lines.push([row * 4, row * 4 + 1, row * 4 + 2, row * 4 + 3]);
        }
        
        // Vertical lines  
        for (let col = 0; col < 4; col++) {
            lines.push([col, col + 4, col + 8, col + 12]);
        }
        
        // Diagonal lines
        lines.push([0, 5, 10, 15]); // Main diagonal
        lines.push([3, 6, 9, 12]);  // Anti-diagonal
        
        return lines;
    }
    
    // Count how many lines are completed in current state
    countCompletedLines(state) {
        const lines = this.getAllLines();
        return lines.filter(line => line.every(pos => state[pos])).length;
    }
    
    // Generate all possible ways to place remaining objects
    generatePossibleStates() {
        const emptyPositions = [];
        const currentState = [...this.grid];
        
        // Find empty positions
        for (let i = 0; i < 16; i++) {
            if (!currentState[i]) {
                emptyPositions.push(i);
            }
        }
        
        const remainingObjects = this.totalObjects - this.placedCount;
        
        if (remainingObjects === 0) {
            return [currentState];
        }
        
        if (remainingObjects > emptyPositions.length) {
            return [];
        }
        
        // Generate all combinations of placing remaining objects
        const combinations = this.getCombinations(emptyPositions, remainingObjects);
        const states = [];
        
        combinations.forEach(combination => {
            const state = [...currentState];
            combination.forEach(pos => {
                state[pos] = true;
            });
            states.push(state);
        });
        
        return states;
    }
    
    // Get all combinations of k elements from array
    getCombinations(array, k) {
        if (k === 0) return [[]];
        if (k > array.length) return [];
        
        const result = [];
        
        function backtrack(start, current) {
            if (current.length === k) {
                result.push([...current]);
                return;
            }
            
            for (let i = start; i <= array.length - (k - current.length); i++) {
                current.push(array[i]);
                backtrack(i + 1, current);
                current.pop();
            }
        }
        
        backtrack(0, []);
        return result;
    }
    
    calculateProbabilities() {
        if (this.placedCount === 0) {
            FF14Utils.showToast('請先放置一些物件', 'error');
            return;
        }
        
        const possibleStates = this.generatePossibleStates();
        
        if (possibleStates.length === 0) {
            FF14Utils.showToast('無法計算：物件數量超出限制', 'error');
            return;
        }
        
        const lineCounts = {
            0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0
        };
        
        // Count line completions for each possible state
        possibleStates.forEach(state => {
            const completedLines = this.countCompletedLines(state);
            lineCounts[completedLines]++;
        });
        
        const totalStates = possibleStates.length;
        
        // Calculate probabilities for exactly 1, 2, 3+ lines
        const prob1Line = (lineCounts[1] / totalStates * 100).toFixed(1);
        const prob2Lines = (lineCounts[2] / totalStates * 100).toFixed(1);
        const prob3PlusLines = (Object.keys(lineCounts)
            .filter(k => parseInt(k) >= 3)
            .reduce((sum, k) => sum + lineCounts[k], 0) / totalStates * 100).toFixed(1);
        
        // Calculate probability of at least 1, 2, 3 lines
        const probAtLeast1 = (Object.keys(lineCounts)
            .filter(k => parseInt(k) >= 1)
            .reduce((sum, k) => sum + lineCounts[k], 0) / totalStates * 100).toFixed(1);
        const probAtLeast2 = (Object.keys(lineCounts)
            .filter(k => parseInt(k) >= 2)
            .reduce((sum, k) => sum + lineCounts[k], 0) / totalStates * 100).toFixed(1);
        const probAtLeast3 = (Object.keys(lineCounts)
            .filter(k => parseInt(k) >= 3)
            .reduce((sum, k) => sum + lineCounts[k], 0) / totalStates * 100).toFixed(1);
        
        this.displayResults(probAtLeast1, probAtLeast2, probAtLeast3, {
            exactly1: prob1Line,
            exactly2: prob2Lines,
            exactly3Plus: prob3PlusLines,
            totalStates: totalStates
        });
    }
    
    displayResults(prob1, prob2, prob3, details) {
        // Update probability displays
        this.elements.prob1Line.textContent = `${prob1}%`;
        this.elements.prob2Lines.textContent = `${prob2}%`;
        this.elements.prob3Lines.textContent = `${prob3}%`;
        
        // Add color classes based on probability
        this.updateProbabilityColors(this.elements.prob1Line, parseFloat(prob1));
        this.updateProbabilityColors(this.elements.prob2Lines, parseFloat(prob2));
        this.updateProbabilityColors(this.elements.prob3Lines, parseFloat(prob3));
        
        // Generate recommendation
        const recommendation = this.generateRecommendation(parseFloat(prob1), parseFloat(prob2), parseFloat(prob3), details);
        this.elements.recommendationText.textContent = recommendation;
        
        // Show results panel
        this.elements.resultsPanel.style.display = 'block';
        this.elements.resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        FF14Utils.showToast('機率計算完成');
    }
    
    updateProbabilityColors(element, probability) {
        element.classList.remove('high', 'medium', 'low');
        
        if (probability >= 60) {
            element.classList.add('high');
        } else if (probability >= 30) {
            element.classList.add('medium');
        } else {
            element.classList.add('low');
        }
    }
    
    generateRecommendation(prob1, prob2, prob3, details) {
        const remainingObjects = this.totalObjects - this.placedCount;
        
        if (remainingObjects === 0) {
            if (prob1 >= 80) {
                return '很好的盤面！建議保留，有很高機率獲得獎勵。';
            } else if (prob1 >= 50) {
                return '中等盤面，可以考慮保留或重置。';
            } else {
                return '建議重置盤面，當前獲得獎勵的機率較低。';
            }
        }
        
        if (prob3 >= 20) {
            return `極佳盤面！有 ${prob3}% 機率獲得 3+ 條線獎勵，強烈建議繼續。`;
        } else if (prob2 >= 40) {
            return `良好盤面！有 ${prob2}% 機率獲得 2+ 條線獎勵，建議繼續。`;
        } else if (prob1 >= 60) {
            return `尚可盤面，有 ${prob1}% 機率獲得至少 1 條線獎勵。`;
        } else {
            return `當前盤面獲得獎勵機率較低，建議考慮重置。還有 ${remainingObjects} 個物件待放置。`;
        }
    }
}

// Initialize calculator when page loads
let calculator;

document.addEventListener('DOMContentLoaded', function() {
    calculator = new WondrousTailsCalculator();
});

// Reset function for reset button
function resetGrid() {
    if (calculator) {
        calculator.resetGrid();
    }
}