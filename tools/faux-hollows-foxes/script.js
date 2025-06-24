class FauxHollowsFoxes {
    static CONSTANTS = {
        BOARD_SIZE: 6,
        MAX_CLICKS: 11,
        SCORES: {
            SWORD: 100,
            CHEST: 60,
            FOX: 20
        },
        SHAPES: {
            SWORD: { width: 2, height: 3 }, // Can be rotated to 3x2
            CHEST: { width: 2, height: 2 },
            FOX: { width: 1, height: 1 }
        }
    };

    constructor() {
        this.board = Array(36).fill(null); // 6x6 grid
        this.clickCount = 0;
        this.score = 0;
        this.selectedCell = null;
        
        this.elements = {
            board: document.getElementById('game-board'),
            remainingClicks: document.getElementById('remaining-clicks'),
            currentScore: document.getElementById('current-score'),
            resetBtn: document.getElementById('reset-btn'),
            autoCalculateBtn: document.getElementById('auto-calculate'),
            resultPanel: document.getElementById('result-panel'),
            finalScore: document.getElementById('final-score'),
            resultDetails: document.getElementById('result-details'),
            popup: document.getElementById('cell-popup'),
            popupBtns: document.querySelectorAll('.popup-btn'),
            popupClose: document.querySelector('.popup-close')
        };

        this.initializeBoard();
        this.initializeEvents();
    }

    initializeBoard() {
        this.elements.board.innerHTML = '';
        for (let i = 0; i < 36; i++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell';
            cell.dataset.index = i;
            this.elements.board.appendChild(cell);
        }
    }

    initializeEvents() {
        // Board cell clicks
        this.handleCellClick = (e) => {
            if (e.target.classList.contains('board-cell')) {
                this.onCellClick(e.target);
            }
        };
        this.elements.board.addEventListener('click', this.handleCellClick);

        // Popup buttons
        this.elements.popupBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.handlePopupSelection(btn.dataset.type);
            });
        });

        // Popup close
        this.elements.popupClose.addEventListener('click', () => {
            this.closePopup();
        });

        // Close popup on overlay click
        this.elements.popup.addEventListener('click', (e) => {
            if (e.target === this.elements.popup) {
                this.closePopup();
            }
        });

        // Reset button
        this.elements.resetBtn.addEventListener('click', () => {
            this.reset();
        });

        // Auto calculate button
        this.elements.autoCalculateBtn.addEventListener('click', () => {
            this.autoCalculate();
        });
    }

    onCellClick(cell) {
        const index = parseInt(cell.dataset.index);
        
        // If cell is already clicked (gray) or occupied, do nothing
        if (cell.classList.contains('clicked') || cell.classList.contains('occupied')) {
            return;
        }

        this.selectedCell = index;
        this.showPopup();
    }

    showPopup() {
        this.elements.popup.style.display = 'flex';
    }

    closePopup() {
        this.elements.popup.style.display = 'none';
        this.selectedCell = null;
    }

    handlePopupSelection(type) {
        if (this.selectedCell === null) return;

        const cell = this.elements.board.children[this.selectedCell];

        if (type === 'clear') {
            this.clearCell(this.selectedCell);
        } else if (type === 'obstacle') {
            this.setObstacle(this.selectedCell);
        } else if (type === 'empty') {
            // Check if we can place empty
            if (this.clickCount >= FauxHollowsFoxes.CONSTANTS.MAX_CLICKS) {
                FF14Utils.showToast('已達到最大點擊次數！', 'error');
                this.closePopup();
                return;
            }
            this.placeEmpty(this.selectedCell);
        } else {
            // Check if we can place the shape
            if (this.clickCount >= FauxHollowsFoxes.CONSTANTS.MAX_CLICKS) {
                FF14Utils.showToast('已達到最大點擊次數！', 'error');
                this.closePopup();
                return;
            }

            // Check shape limits before placing
            if (!this.checkShapeLimits(type)) {
                this.closePopup();
                return;
            }

            // Place single cell
            this.placeSingleCell(this.selectedCell, type);
        }

        this.closePopup();
        this.updateDisplay();
        this.checkForCompletedShapes();
        this.validateShapes();
    }

    setObstacle(index) {
        const cell = this.elements.board.children[index];
        
        // Clear previous state
        this.clearCell(index);
        
        // Set as obstacle
        this.board[index] = 'obstacle';
        cell.className = 'board-cell obstacle';
        cell.textContent = '✕';
    }

    clearCell(index) {
        const cell = this.elements.board.children[index];
        
        // Don't allow clearing if it's a gray cell from game completion
        if (this.clickCount >= FauxHollowsFoxes.CONSTANTS.MAX_CLICKS && this.board[index] === null) {
            return;
        }
        
        // Clear the cell
        this.board[index] = null;
        cell.className = 'board-cell';
        cell.textContent = '';
        
        // Recalculate everything
        this.recalculateState();
    }

    placeSingleCell(index, type) {
        if (this.board[index] !== null) {
            FF14Utils.showToast('此格子已被佔用！', 'error');
            return;
        }

        // Place the single cell
        this.board[index] = type;
        const cell = this.elements.board.children[index];
        cell.className = `board-cell ${type}`;
        
        // Set display text
        if (type === 'fox') {
            cell.textContent = '狐';
        } else if (type === 'sword') {
            cell.textContent = '劍';
        } else if (type === 'chest') {
            cell.textContent = '箱';
        }
        
        this.clickCount++;
    }

    placeEmpty(index) {
        if (this.board[index] !== null) {
            FF14Utils.showToast('此格子已被佔用！', 'error');
            return;
        }

        this.board[index] = 'empty';
        const cell = this.elements.board.children[index];
        cell.className = 'board-cell empty';
        this.clickCount++;
    }

    checkShapeLimits(type) {
        // Count existing cells of this type
        let count = 0;
        for (let i = 0; i < 36; i++) {
            if (this.board[i] === type) {
                count++;
            }
        }

        if (type === 'fox' && count >= 1) {
            FF14Utils.showToast('宗長只能放置 1 格！', 'error');
            return false;
        } else if (type === 'sword' && count >= 6) {
            FF14Utils.showToast('劍最多只能放置 6 格！', 'error');
            return false;
        } else if (type === 'chest' && count >= 4) {
            FF14Utils.showToast('寶箱最多只能放置 4 格！', 'error');
            return false;
        }

        return true;
    }


    checkForCompletedShapes() {
        // Reset score
        this.score = 0;
        
        // Track processed cells to avoid double counting
        const processed = new Set();
        
        // Check for foxes (1x1)
        for (let i = 0; i < 36; i++) {
            if (this.board[i] === 'fox' && !processed.has(i)) {
                processed.add(i);
                this.score += FauxHollowsFoxes.CONSTANTS.SCORES.FOX;
            }
        }
        
        // Check for chests (2x2)
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                if (this.checkShapePattern(row, col, 2, 2, 'chest', processed)) {
                    this.score += FauxHollowsFoxes.CONSTANTS.SCORES.CHEST;
                }
            }
        }
        
        // Check for swords (2x3 or 3x2)
        // Check 2x3
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 5; col++) {
                if (this.checkShapePattern(row, col, 2, 3, 'sword', processed)) {
                    this.score += FauxHollowsFoxes.CONSTANTS.SCORES.SWORD;
                }
            }
        }
        
        // Check 3x2
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 4; col++) {
                if (this.checkShapePattern(row, col, 3, 2, 'sword', processed)) {
                    this.score += FauxHollowsFoxes.CONSTANTS.SCORES.SWORD;
                }
            }
        }
        
        // Only mark surrounding cells as gray when game is complete
        if (this.clickCount >= FauxHollowsFoxes.CONSTANTS.MAX_CLICKS) {
            this.markGrayCells();
        }
        
        this.updateDisplay();
    }

    validateShapes() {
        // Count cells of each type
        const counts = {
            fox: 0,
            sword: 0,
            chest: 0
        };

        for (let i = 0; i < 36; i++) {
            if (this.board[i] === 'fox') counts.fox++;
            else if (this.board[i] === 'sword') counts.sword++;
            else if (this.board[i] === 'chest') counts.chest++;
        }

        // Check fox limit
        if (counts.fox > 1) {
            FF14Utils.showToast('錯誤：宗長只能有 0 或 1 格！', 'error');
            return false;
        }

        // Check sword
        if (counts.sword > 6) {
            FF14Utils.showToast('錯誤：劍最多只能有 6 格！', 'error');
            return false;
        } else if (counts.sword === 6) {
            // Check if it forms a valid 2x3 or 3x2 shape
            let validShape = false;
            const processed = new Set();
            
            // Check 2x3
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 5; col++) {
                    if (this.checkShapePattern(row, col, 2, 3, 'sword', processed)) {
                        validShape = true;
                        break;
                    }
                }
                if (validShape) break;
            }
            
            // Check 3x2
            if (!validShape) {
                processed.clear();
                for (let row = 0; row < 5; row++) {
                    for (let col = 0; col < 4; col++) {
                        if (this.checkShapePattern(row, col, 3, 2, 'sword', processed)) {
                            validShape = true;
                            break;
                        }
                    }
                    if (validShape) break;
                }
            }

            if (!validShape && processed.size === 6) {
                FF14Utils.showToast('錯誤：6 格劍必須形成 2x3 或 3x2 的形狀！', 'error');
                return false;
            }
        }

        // Check chest
        if (counts.chest > 4) {
            FF14Utils.showToast('錯誤：寶箱最多只能有 4 格！', 'error');
            return false;
        } else if (counts.chest === 4) {
            // Check if it forms a valid 2x2 shape
            let validShape = false;
            const processed = new Set();
            
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < 5; col++) {
                    if (this.checkShapePattern(row, col, 2, 2, 'chest', processed)) {
                        validShape = true;
                        break;
                    }
                }
                if (validShape) break;
            }

            if (!validShape) {
                FF14Utils.showToast('錯誤：4 格寶箱必須形成 2x2 的形狀！', 'error');
                return false;
            }
        }

        return true;
    }
    
    checkShapePattern(row, col, width, height, type, processed) {
        // Check if all cells in the pattern match the type
        const cells = [];
        
        for (let r = row; r < row + height; r++) {
            for (let c = col; c < col + width; c++) {
                const index = r * 6 + c;
                if (this.board[index] !== type || processed.has(index)) {
                    return false;
                }
                cells.push(index);
            }
        }
        
        // Mark all cells as processed
        cells.forEach(index => processed.add(index));
        return true;
    }

    
    markGrayCells() {
        // Mark all remaining empty cells as gray when game is complete
        for (let i = 0; i < 36; i++) {
            if (this.board[i] === null) {
                const cell = this.elements.board.children[i];
                cell.className = 'board-cell clicked';
            }
        }
    }


    recalculateState() {
        // Reset click count
        this.clickCount = 0;

        // Count all non-obstacle, non-null cells
        for (let i = 0; i < 36; i++) {
            const value = this.board[i];
            if (value && value !== 'obstacle') {
                this.clickCount++;
            }
        }

        // Recalculate shapes and score
        this.checkForCompletedShapes();
        this.validateShapes();
    }

    updateDisplay() {
        this.elements.remainingClicks.textContent = FauxHollowsFoxes.CONSTANTS.MAX_CLICKS - this.clickCount;
        this.elements.currentScore.textContent = this.score;

        // Check if game is complete
        if (this.clickCount >= FauxHollowsFoxes.CONSTANTS.MAX_CLICKS) {
            this.showResult();
        }
    }

    showResult() {
        this.elements.finalScore.textContent = this.score;
        
        // Calculate shape counts
        const shapes = { sword: 0, chest: 0, fox: 0 };
        const counted = new Set();
        
        for (let i = 0; i < 36; i++) {
            const value = this.board[i];
            if (value && !counted.has(value) && value !== 'obstacle' && value !== 'clicked') {
                counted.add(value);
                if (value === 'fox') shapes.fox++;
                else if (value.startsWith('sword')) shapes.sword++;
                else if (value.startsWith('chest')) shapes.chest++;
            }
        }

        this.elements.resultDetails.innerHTML = `
            <p>劍 x ${shapes.sword} = ${shapes.sword * FauxHollowsFoxes.CONSTANTS.SCORES.SWORD} 分</p>
            <p>寶箱 x ${shapes.chest} = ${shapes.chest * FauxHollowsFoxes.CONSTANTS.SCORES.CHEST} 分</p>
            <p>宗長 x ${shapes.fox} = ${shapes.fox * FauxHollowsFoxes.CONSTANTS.SCORES.FOX} 分</p>
        `;

        this.elements.resultPanel.style.display = 'block';
    }

    autoCalculate() {
        FF14Utils.showToast('自動計算功能開發中...', 'info');
    }

    reset() {
        // Clear board
        this.board = Array(36).fill(null);
        this.clickCount = 0;
        this.score = 0;
        
        // Reset UI
        this.initializeBoard();
        this.updateDisplay();
        this.elements.resultPanel.style.display = 'none';
    }
}

// Initialize the game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new FauxHollowsFoxes();
});