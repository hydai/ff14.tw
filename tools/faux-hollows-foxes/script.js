class FauxHollowsFoxes {
    static CONSTANTS = {
        BOARD_SIZE: 6,
        TOTAL_CELLS: 36,
        MAX_CLICKS: 11,
        PERCENTAGE: 100,
        SCORES: {
            SWORD: 100,
            CHEST: 60,
            FOX: 20
        },
        SHAPES: {
            SWORD: { width: 2, height: 3 }, // Can be rotated to 3x2
            CHEST: { width: 2, height: 2 },
            FOX: { width: 1, height: 1 }
        },
        CELL_VALUES: {
            EMPTY: 0,
            OBSTACLE: 1,
            SWORD: 2,
            CHEST: 3,
            FOX_OR_EMPTY: 4
        }
    };


    static BOARD_DATA = window.FAUX_HOLLOWS_BOARD_DATA;

    constructor() {
        this.board = Array(FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS).fill(null);
        this.clickCount = 0;
        this.score = 0;
        this.selectedCell = null;
        this.obstacleProbabilities = Array(FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS).fill(0);
        this.treasureProbabilities = {
            sword: Array(FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS).fill(0),
            chest: Array(FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS).fill(0),
            fox: Array(FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS).fill(0)
        };
        this.showProbabilities = true;
        this.showTreasureProbabilities = false;
        this.obstaclesConfirmed = false;
        this.showOptimalHighlight = true; // 預設開啟高亮功能
        this.history = new StateHistoryManager(); // 儲存每一步的歷史狀態
        this.modalManager = new ModalManager();

        this.elements = {
            board: document.getElementById('game-board'),
            remainingClicks: document.getElementById('remaining-clicks'),
            matchingBoards: document.getElementById('matching-boards'),
            resetBtn: document.getElementById('reset-btn'),
            undoBtn: document.getElementById('undo-btn'),
            redoBtn: document.getElementById('redo-btn'),
            autoCalculateBtn: document.getElementById('auto-calculate'),
            toggleProbabilitiesBtn: document.getElementById('toggle-probabilities'),
            resultPanel: document.getElementById('result-panel'),
            finalScore: document.getElementById('final-score'),
            resultDetails: document.getElementById('result-details'),
            popup: document.getElementById('cell-popup'),
            popupBtns: document.querySelectorAll('.popup-btn'),
            popupClose: document.querySelector('.popup-close'),
            gameHint: document.getElementById('game-hint')
        };

        this.isUndoingOrRedoing = false;

        this.initializeBoard();
        this.initializeEvents();
        this.calculateObstacleProbabilities();

        // 設定按鈕初始文字
        this.elements.autoCalculateBtn.textContent = FF14Utils.getI18nText('faux_hollows_close_best', '關閉最佳策略');

        // 初始化歷史記錄按鈕狀態
        this.saveState();
    }

    initializeBoard() {
        SecurityUtils.clearElement(this.elements.board);
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell';
            cell.dataset.index = i;
            this.elements.board.appendChild(cell);
        }
    }

    initializeEvents() {
        // Board cell clicks
        this.handleCellClick = (e) => {
            // Find the board-cell element (could be clicked element or its parent)
            let targetCell = e.target;
            while (targetCell && !targetCell.classList.contains('board-cell')) {
                targetCell = targetCell.parentElement;
            }
            
            if (targetCell && targetCell.classList.contains('board-cell')) {
                this.onCellClick(targetCell);
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

        // Reset button
        this.elements.resetBtn.addEventListener('click', () => {
            this.reset();
        });

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

        // Auto calculate button (toggle)
        this.elements.autoCalculateBtn.addEventListener('click', () => {
            this.toggleOptimalHighlight();
        });

        // Toggle probabilities button
        this.elements.toggleProbabilitiesBtn.addEventListener('click', () => {
            this.toggleProbabilities();
        });
    }

    calculateObstacleProbabilities() {
        // 初始計算：基於所有盤面
        this.updateObstacleProbabilitiesBasedOnMatches();
        this.updateProbabilityDisplay();
        
        // 初始化時顯示所有盤面的數量
        const matchingCount = this.countMatchingBoards();
        this.elements.matchingBoards.textContent = matchingCount;
    }

    getMatchingBoards() {
        return FauxHollowsFoxes.BOARD_DATA.filter(board => this.boardMatches(board));
    }

    updateObstacleProbabilitiesBasedOnMatches() {
        const obstacleCount = Array(FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS).fill(0);
        const matchingBoards = this.getMatchingBoards();

        // 統計符合盤面中的障礙物位置
        for (const board of matchingBoards) {
            for (let row = 0; row < FauxHollowsFoxes.CONSTANTS.BOARD_SIZE; row++) {
                for (let col = 0; col < FauxHollowsFoxes.CONSTANTS.BOARD_SIZE; col++) {
                    const index = row * FauxHollowsFoxes.CONSTANTS.BOARD_SIZE + col;
                    if (board[row][col] === FauxHollowsFoxes.CONSTANTS.CELL_VALUES.OBSTACLE) {
                        obstacleCount[index]++;
                    }
                }
            }
        }

        // 基於符合的盤面計算機率
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            this.obstacleProbabilities[i] = matchingBoards.length > 0 ? 
                Math.round((obstacleCount[i] / matchingBoards.length) * FauxHollowsFoxes.CONSTANTS.PERCENTAGE) : 0;
        }
    }

    updateTreasureProbabilitiesBasedOnMatches() {
        const treasureCount = {
            sword: Array(FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS).fill(0),
            chest: Array(FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS).fill(0),
            fox: Array(FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS).fill(0)
        };
        const matchingBoards = this.getMatchingBoards();

        // 統計符合盤面中的寶物位置
        for (const board of matchingBoards) {
            for (let row = 0; row < FauxHollowsFoxes.CONSTANTS.BOARD_SIZE; row++) {
                for (let col = 0; col < FauxHollowsFoxes.CONSTANTS.BOARD_SIZE; col++) {
                    const index = row * FauxHollowsFoxes.CONSTANTS.BOARD_SIZE + col;
                    const value = board[row][col];
                    if (value === FauxHollowsFoxes.CONSTANTS.CELL_VALUES.SWORD) {
                        treasureCount.sword[index]++;
                    } else if (value === FauxHollowsFoxes.CONSTANTS.CELL_VALUES.CHEST) {
                        treasureCount.chest[index]++;
                    } else if (value === FauxHollowsFoxes.CONSTANTS.CELL_VALUES.FOX_OR_EMPTY) {
                        treasureCount.fox[index]++;
                    }
                }
            }
        }

        // 基於符合的盤面計算機率
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            this.treasureProbabilities.sword[i] = matchingBoards.length > 0 ? 
                Math.round((treasureCount.sword[i] / matchingBoards.length) * FauxHollowsFoxes.CONSTANTS.PERCENTAGE) : 0;
            this.treasureProbabilities.chest[i] = matchingBoards.length > 0 ? 
                Math.round((treasureCount.chest[i] / matchingBoards.length) * FauxHollowsFoxes.CONSTANTS.PERCENTAGE) : 0;
            this.treasureProbabilities.fox[i] = matchingBoards.length > 0 ? 
                Math.round((treasureCount.fox[i] / matchingBoards.length) * FauxHollowsFoxes.CONSTANTS.PERCENTAGE) : 0;
        }
    }

    updateProbabilityDisplay() {
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            const cell = this.elements.board.children[i];
            
            // 先清除所有機率顯示類別
            cell.classList.remove('probability-display', 'treasure-probability-display');
            
            if (this.board[i] === null) {
                // 只在未設置的格子上顯示機率
                cell.textContent = '';
                SecurityUtils.clearElement(cell);
                
                if (this.showTreasureProbabilities && this.obstaclesConfirmed) {
                    // 顯示寶物機率
                    this.displayTreasureProbabilities(cell, i);
                } else if (this.showProbabilities) {
                    // 顯示障礙物機率
                    if (this.obstacleProbabilities[i] > 0) {
                        cell.textContent = `${this.obstacleProbabilities[i]}%`;
                        cell.classList.add('probability-display');
                    }
                }
            } else {
                // 如果格子已經被設置，確保顯示正確的內容
                this.updateCellDisplay(cell, i);
            }
        }
    }

    displayTreasureProbabilities(cell, index) {
        const swordProb = this.treasureProbabilities.sword[index];
        const chestProb = this.treasureProbabilities.chest[index];
        const foxProb = this.treasureProbabilities.fox[index];
        
        // 收集有機率的項目，並按優先順序排列（劍、寶箱、宗長）
        const allProbabilities = [
            { type: 'sword', text: `劍${swordProb}%`, prob: swordProb, className: 'sword-prob' },
            { type: 'chest', text: `箱${chestProb}%`, prob: chestProb, className: 'chest-prob' },
            { type: 'fox', text: `狐${foxProb}%`, prob: foxProb, className: 'fox-prob' }
        ];
        
        // 只保留有機率的項目（自動往上替補）
        const validProbabilities = allProbabilities.filter(item => item.prob > 0);
        
        if (validProbabilities.length > 0) {
            // 創建三等份結構，只顯示有效的機率
            SecurityUtils.clearElement(cell);
            const container = document.createElement('div');
            container.className = 'treasure-prob-container';
            
            for (let i = 0; i < 3; i++) {
                const item = document.createElement('div');
                if (validProbabilities[i]) {
                    item.className = `treasure-prob-item ${validProbabilities[i].className}`;
                    const i18nKeys = {
                        'sword': 'faux_hollows_cell_sword',
                        'chest': 'faux_hollows_cell_chest',
                        'fox': 'faux_hollows_cell_fox'
                    };
                    const typeText = FF14Utils.getI18nText(i18nKeys[validProbabilities[i].type], validProbabilities[i].type);
                    item.textContent = `${typeText}: ${validProbabilities[i].prob}%`;
                } else {
                    item.className = 'treasure-prob-item empty-prob';
                }
                container.appendChild(item);
            }
            
            cell.appendChild(container);
            cell.classList.add('treasure-probability-display');
        }
    }

    updateCellDisplay(cell, index) {
        const value = this.board[index];
        
        switch (value) {
            case 'obstacle':
                cell.className = 'board-cell obstacle';
                cell.textContent = '✕';
                break;
            case 'sword':
                cell.className = 'board-cell sword';
                cell.textContent = '⚔️';
                break;
            case 'chest':
                cell.className = 'board-cell chest';
                cell.textContent = '📦';
                break;
            case 'fox':
                cell.className = 'board-cell fox';
                cell.textContent = '🦊';
                break;
            case 'empty':
                cell.className = 'board-cell empty';
                cell.textContent = '◯';
                break;
            case 'clicked':
                cell.className = 'board-cell clicked';
                cell.textContent = '';
                break;
            default:
                // 處理其他特殊情況
                if (value && value.startsWith('sword')) {
                    cell.className = 'board-cell sword connected';
                    cell.textContent = '⚔️';
                } else if (value && value.startsWith('chest')) {
                    cell.className = 'board-cell chest connected';
                    cell.textContent = '📦';
                }
                break;
        }
    }

    toggleProbabilities() {
        this.showProbabilities = !this.showProbabilities;
        this.elements.toggleProbabilitiesBtn.textContent =
            this.showProbabilities ? FF14Utils.getI18nText('faux_hollows_hide_prob', '隱藏機率') : FF14Utils.getI18nText('faux_hollows_show_prob', '顯示機率');

        if (this.showProbabilities) {
            this.updateProbabilityDisplay();
        } else {
            // 清除機率顯示
            for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
                const cell = this.elements.board.children[i];
                if (this.board[i] === null) {
                    cell.textContent = '';
                    cell.classList.remove('probability-display');
                }
            }
        }
    }

    updateMatchingBoards() {
        const matchingCount = this.countMatchingBoards();
        this.elements.matchingBoards.textContent = matchingCount;
        
        // 重新計算基於當前符合盤面的障礙物機率
        this.updateObstacleProbabilitiesBasedOnMatches();
        
        // 如果障礙物已確認，也計算寶物機率
        if (this.obstaclesConfirmed) {
            this.updateTreasureProbabilitiesBasedOnMatches();
        }
        
        this.updateProbabilityDisplay();
        
        // 檢查是否可以自動填充障礙物
        this.checkAndAutoFillObstacles();
        
        // 更新最佳策略高亮
        this.updateOptimalHighlight();
    }

    countMatchingBoards() {
        return this.getMatchingBoards().length;
    }

    boardMatches(dbBoard) {
        // 檢查使用者當前盤面是否與資料庫盤面相符
        if (!dbBoard || dbBoard.length !== FauxHollowsFoxes.CONSTANTS.BOARD_SIZE) return false;
        
        for (let row = 0; row < FauxHollowsFoxes.CONSTANTS.BOARD_SIZE; row++) {
            if (!dbBoard[row] || dbBoard[row].length !== FauxHollowsFoxes.CONSTANTS.BOARD_SIZE) return false;
            
            for (let col = 0; col < FauxHollowsFoxes.CONSTANTS.BOARD_SIZE; col++) {
                const index = row * FauxHollowsFoxes.CONSTANTS.BOARD_SIZE + col;
                const userValue = this.board[index];
                const dbValue = dbBoard[row][col];
                
                // 只有當使用者已經設置了某個位置時，才檢查是否與資料庫一致
                // null 值表示未設置，應該被視為「未知」，可以匹配任何資料庫值
                if (userValue !== null) {
                    const userMappedValue = this.mapUserValueToDbValue(userValue);
                    
                    // 特殊處理：資料庫中的 FOX_OR_EMPTY 表示可能是宗長或空格
                    if (dbValue === FauxHollowsFoxes.CONSTANTS.CELL_VALUES.FOX_OR_EMPTY) {
                        // 如果資料庫是 FOX_OR_EMPTY，使用者可以是 fox 或 empty
                        if (userMappedValue !== FauxHollowsFoxes.CONSTANTS.CELL_VALUES.FOX_OR_EMPTY && 
                            userMappedValue !== FauxHollowsFoxes.CONSTANTS.CELL_VALUES.EMPTY) {
                            return false;
                        }
                    } else {
                        // 一般情況：必須完全匹配
                        if (userMappedValue !== dbValue) {
                            return false;
                        }
                    }
                }
                // 如果 userValue === null，則跳過此位置的檢查（未知狀態可匹配任何值）
            }
        }
        
        return true;
    }

    mapUserValueToDbValue(userValue) {
        // 將使用者盤面的值映射到資料庫格式
        switch (userValue) {
            case 'obstacle': return FauxHollowsFoxes.CONSTANTS.CELL_VALUES.OBSTACLE;
            case 'sword': return FauxHollowsFoxes.CONSTANTS.CELL_VALUES.SWORD;
            case 'chest': return FauxHollowsFoxes.CONSTANTS.CELL_VALUES.CHEST;
            case 'fox': return FauxHollowsFoxes.CONSTANTS.CELL_VALUES.FOX_OR_EMPTY;
            case 'empty': return FauxHollowsFoxes.CONSTANTS.CELL_VALUES.EMPTY;
            default: return FauxHollowsFoxes.CONSTANTS.CELL_VALUES.EMPTY;
        }
    }

    checkAndAutoFillObstacles() {
        // 計算已經放置的障礙物數量
        let obstacleCount = 0;
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            if (this.board[i] === 'obstacle') {
                obstacleCount++;
            }
        }

        // 如果已經有2個或以上的障礙物，檢查是否可以自動填充
        if (obstacleCount >= 2) {
            this.tryAutoFillObstacles();
        }

        // 如果有2個障礙物了，隱藏提示
        if (obstacleCount >= 2 && this.elements.gameHint) {
            this.elements.gameHint.classList.add('hidden');
        }

        // 檢查障礙物是否已確認（自動填充完成後）
        this.checkObstaclesConfirmed();
    }

    checkObstaclesConfirmedWithoutAutoFill() {
        // 與 checkObstaclesConfirmed 相同的邏輯，但不觸發自動填充
        const matchingBoards = [];
        for (const board of FauxHollowsFoxes.BOARD_DATA) {
            if (this.boardMatches(board)) {
                matchingBoards.push(board);
            }
        }

        if (matchingBoards.length === 0) {
            this.obstaclesConfirmed = false;
            return;
        }

        // 檢查障礙物是否已確認
        let obstacleCount = 0;
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            if (this.board[i] === 'obstacle') {
                obstacleCount++;
            }
        }
        
        let allObstaclesConfirmed = false;
        if (obstacleCount === 0) {
            allObstaclesConfirmed = false;
        } else {
            // 檢查每個位置：如果在所有符合盤面中都是障礙物，則必須已被設定為障礙物
            allObstaclesConfirmed = true;
            for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
                const row = Math.floor(i / 6);
                const col = i % 6;
                
                // 檢查這個位置在所有符合盤面中是否都是障礙物
                let allAreObstacles = true;
                for (const board of matchingBoards) {
                    if (board[row][col] !== 1) {
                        allAreObstacles = false;
                        break;
                    }
                }
                
                // 如果這個位置在所有符合盤面中都是障礙物，但使用者還沒設定為障礙物
                if (allAreObstacles && this.board[i] !== 'obstacle') {
                    allObstaclesConfirmed = false;
                    break;
                }
            }
        }

        const wasConfirmed = this.obstaclesConfirmed;
        this.obstaclesConfirmed = allObstaclesConfirmed;

        // 如果障礙物剛確認，啟動寶物機率顯示
        if (!wasConfirmed && this.obstaclesConfirmed) {
            this.showTreasureProbabilities = true;
            this.updateTreasureProbabilitiesBasedOnMatches();
            this.updateProbabilityDisplay(); // 需要更新UI顯示
            FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_obstacles_confirmed', '障礙物位置已確認！現在顯示寶物機率，點擊格子可填寫實際發現的寶物'), 'success');

            // 更新最佳策略高亮
            this.updateOptimalHighlight();
        }
    }


    checkIfObstaclesComplete() {
        // 檢查所有未設置位置的障礙物機率是否都已確定（100%或0%）
        let allObstacleProbabilitiesDetermined = true;
        let guaranteedObstacles = [];
        
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            // 跳過已設置的位置
            if (this.board[i] !== null) continue;
            
            const probability = this.obstacleProbabilities[i];
            
            if (probability === FauxHollowsFoxes.CONSTANTS.PERCENTAGE) {
                // 100%機率的位置應該被自動填充，如果沒有就有問題
                guaranteedObstacles.push(i);
            } else if (probability !== 0) {
                // 介於0-100%之間，未確定
                allObstacleProbabilitiesDetermined = false;
            }
        }
        
        // 如果有100%機率但未填充的位置，先填充它們
        if (guaranteedObstacles.length > 0) {
            // 自動填充時不保存狀態
            for (const pos of guaranteedObstacles) {
                this.setObstacle(pos, true);
            }
            // 重新計算機率並再次檢查
            this.updateObstacleProbabilitiesBasedOnMatches();
            this.checkIfObstaclesComplete();
            return;
        }
        
        // 只有當所有位置的障礙物機率都已確定時，才切換到寶物階段
        if (allObstacleProbabilitiesDetermined && !this.obstaclesConfirmed) {
            this.obstaclesConfirmed = true;
            this.showTreasureProbabilities = true;
            this.updateTreasureProbabilitiesBasedOnMatches();
            FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_all_obstacles_confirmed', '所有障礙物位置已確定！現在顯示寶物機率，點擊格子可填寫實際發現的寶物'), 'success');

            // 更新最佳策略高亮
            this.updateOptimalHighlight();
        }
    }

    checkObstaclesConfirmed() {
        // 檢查是否所有障礙物位置都已確定
        const matchingBoards = [];
        for (const board of FauxHollowsFoxes.BOARD_DATA) {
            if (this.boardMatches(board)) {
                matchingBoards.push(board);
            }
        }

        if (matchingBoards.length === 0) {
            this.obstaclesConfirmed = false;
            return;
        }

        // 檢查障礙物是否已確認
        // 條件：至少有一些障礙物已設定，且所有符合盤面中必須為障礙物的位置都已設定
        let obstacleCount = 0;
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            if (this.board[i] === 'obstacle') {
                obstacleCount++;
            }
        }
        
        // 如果沒有任何障礙物，則未確認
        let allObstaclesConfirmed;
        if (obstacleCount === 0) {
            allObstaclesConfirmed = false;
        } else {
            // 檢查每個位置：如果在所有符合盤面中都是障礙物，則必須已被設定為障礙物
            allObstaclesConfirmed = true;
            for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
                const row = Math.floor(i / 6);
                const col = i % 6;
                
                // 檢查這個位置在所有符合盤面中是否都是障礙物
                let allAreObstacles = true;
                for (const board of matchingBoards) {
                    if (board[row][col] !== 1) {
                        allAreObstacles = false;
                        break;
                    }
                }
                
                // 如果這個位置在所有符合盤面中都是障礙物，但使用者還沒設定為障礙物
                if (allAreObstacles && this.board[i] !== 'obstacle') {
                    allObstaclesConfirmed = false;
                    break;
                }
            }
        }

        const wasConfirmed = this.obstaclesConfirmed;
        this.obstaclesConfirmed = allObstaclesConfirmed;

        // 如果障礙物剛確認，啟動寶物機率顯示
        if (!wasConfirmed && this.obstaclesConfirmed) {
            this.showTreasureProbabilities = true;
            this.updateTreasureProbabilitiesBasedOnMatches();
            this.updateProbabilityDisplay(); // 需要更新UI顯示
            FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_obstacles_confirmed', '障礙物位置已確認！現在顯示寶物機率，點擊格子可填寫實際發現的寶物'), 'success');

            // 更新最佳策略高亮
            this.updateOptimalHighlight();
        }
    }

    tryAutoFillObstacles() {
        // 收集所有符合的盤面
        const matchingBoards = this.getMatchingBoards();

        // 如果沒有符合的盤面，不執行自動填充
        if (matchingBoards.length === 0) return;

        // 檢查所有符合盤面中，每個位置的障礙物是否一致
        const confirmedObstacles = [];
        
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            // 跳過已經設置的格子
            if (this.board[i] !== null) continue;

            const row = Math.floor(i / FauxHollowsFoxes.CONSTANTS.BOARD_SIZE);
            const col = i % FauxHollowsFoxes.CONSTANTS.BOARD_SIZE;
            
            // 檢查這個位置在所有符合盤面中是否都是障礙物
            let allAreObstacles = true;
            let allAreNotObstacles = true;
            
            for (const board of matchingBoards) {
                if (board[row][col] === FauxHollowsFoxes.CONSTANTS.CELL_VALUES.OBSTACLE) {
                    allAreNotObstacles = false;
                } else {
                    allAreObstacles = false;
                }
            }

            // 如果所有符合的盤面在這個位置都是障礙物，則自動填充
            if (allAreObstacles) {
                confirmedObstacles.push(i);
            }
        }

        // 自動填充確定的障礙物
        if (confirmedObstacles.length > 0) {
            // 自動填充時，不保存狀態（因為使用者的手動操作已經保存過了）
            let fillCount = 0;
            for (const index of confirmedObstacles) {
                // 全部都跳過保存狀態
                this.setObstacle(index, true);
                fillCount++;
            }

            // 顯示自動填充的提示
            FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_auto_filled', '已自動填充 {count} 個確定的障礙物位置', { count: fillCount }), 'success');

            // 更新顯示（但不觸發 updateMatchingBoards 避免遞迴）
            this.updateDisplay();
            this.checkForCompletedShapes();
            this.validateShapes();
            
            // 手動更新符合盤面計數，但不觸發自動填充
            const matchingCount = this.countMatchingBoards();
            this.elements.matchingBoards.textContent = matchingCount;
            this.updateObstacleProbabilitiesBasedOnMatches();
            
            // 檢查是否完成障礙物階段
            this.checkIfObstaclesComplete();
            
            this.updateProbabilityDisplay();
        }
    }

    onCellClick(cell) {
        const index = parseInt(cell.dataset.index);
        
        // If cell is already clicked (gray) or occupied, do nothing
        if (cell.classList.contains('clicked') || cell.classList.contains('occupied')) {
            return;
        }

        if (this.obstaclesConfirmed) {
            this.handleTreasurePhaseClick(cell, index);
        } else {
            this.handleObstaclePhaseClick(cell, index);
        }
    }

    handleTreasurePhaseClick(cell, index) {
        // Allow clicking on: null cells, treasure probability display, or existing treasure cells
        const canClick = this.board[index] === null || 
                       cell.classList.contains('treasure-probability-display') ||
                       ['sword', 'chest', 'fox', 'empty'].includes(this.board[index]);
        
        if (canClick) {
            this.selectedCell = index;
            this.showPopup();
        }
    }

    handleObstaclePhaseClick(cell, index) {
        // In obstacle phase, directly place/remove obstacles
        if (this.board[index] === null || cell.classList.contains('treasure-probability-display')) {
            // Place obstacle on empty cell
            this.setObstacle(index);
        } else if (this.board[index] === 'obstacle') {
            // Remove obstacle if clicking on existing obstacle
            this.clearCell(index);
        } else {
            // Cell is occupied by something else, do nothing
            return;
        }
        
        this.updateObstaclePhaseState();
        this.saveState();
    }

    updateObstaclePhaseState() {
        this.updateDisplay();
        this.checkForCompletedShapes();
        this.validateShapes();
        
        // 更新符合盤面計數並觸發自動填充
        const matchingCount = this.countMatchingBoards();
        this.elements.matchingBoards.textContent = matchingCount;
        this.updateObstacleProbabilitiesBasedOnMatches();
        
        // 嘗試自動填充障礙物並檢查是否完成
        this.tryAutoFillObstacles();
        
        this.updateProbabilityDisplay();
    }

    showPopup() {
        // 根據遊戲階段顯示不同的選項
        this.updatePopupOptions();

        this.modalManager.show(this.elements.popup, {
            useClass: null,
            displayStyle: 'flex',
            onClose: () => {
                this.selectedCell = null;
            }
        });
    }

    updatePopupOptions() {
        const popupBtns = this.elements.popup.querySelectorAll('.popup-btn');

        if (this.obstaclesConfirmed) {
            // 填寶物階段：顯示劍、寶箱、宗長、空格、清除
            popupBtns.forEach(btn => {
                const type = btn.dataset.type;
                if (type === 'sword' || type === 'chest' || type === 'fox' || type === 'empty' || type === 'clear') {
                    btn.style.display = 'flex';
                } else {
                    btn.style.display = 'none';
                }
            });
        } else {
            // 填障礙物階段：只顯示障礙物、清除
            popupBtns.forEach(btn => {
                const type = btn.dataset.type;
                if (type === 'obstacle' || type === 'clear') {
                    btn.style.display = 'flex';
                } else {
                    btn.style.display = 'none';
                }
            });
        }
    }

    closePopup() {
        this.modalManager.hide();
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
                FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_max_clicks', '已達到最大點擊次數！'), 'error');
                this.closePopup();
                return;
            }
            this.placeEmpty(this.selectedCell);
        } else {
            // Check if we can place the shape
            if (this.clickCount >= FauxHollowsFoxes.CONSTANTS.MAX_CLICKS) {
                FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_max_clicks', '已達到最大點擊次數！'), 'error');
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
        this.updateMatchingBoards();
        this.updateOptimalHighlight();
    }

    setObstacle(index) {
        const cell = this.elements.board.children[index];

        // Set as obstacle directly without clearing first
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

        // Restore probability display if enabled
        if (this.showProbabilities && this.obstacleProbabilities[index] > 0) {
            cell.textContent = `${this.obstacleProbabilities[index]}%`;
            cell.classList.add('probability-display');
        }

        // Recalculate everything
        this.recalculateState();
    }

    placeSingleCell(index, type) {
        const cell = this.elements.board.children[index];

        // In treasure phase (obstacles confirmed), allow overwriting treasure cells
        if (this.obstaclesConfirmed) {
            // Allow placing on: null cells, treasure probability display, or existing treasure cells
            const canPlace = this.board[index] === null ||
                           cell.classList.contains('treasure-probability-display') ||
                           ['sword', 'chest', 'fox', 'empty'].includes(this.board[index]);

            if (!canPlace) {
                FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_cannot_modify', '此格子無法修改！'), 'error');
                return;
            }
        } else {
            // In obstacle phase, only allow placing on null cells or treasure probability display
            if (this.board[index] !== null && !cell.classList.contains('treasure-probability-display')) {
                FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_cell_occupied', '此格子已被佔用！'), 'error');
                return;
            }
        }

        // If overwriting an existing treasure cell, don't increment click count
        const isOverwriting = this.obstaclesConfirmed &&
                             ['sword', 'chest', 'fox', 'empty'].includes(this.board[index]);

        // Place the single cell
        this.board[index] = type;
        cell.className = `board-cell ${type}`;
        SecurityUtils.clearElement(cell);

        // Set display text
        if (type === 'fox') {
            cell.textContent = '狐';
        } else if (type === 'sword') {
            cell.textContent = '劍';
        } else if (type === 'chest') {
            cell.textContent = '箱';
        }

        // Only increment click count if not overwriting
        if (!isOverwriting) {
            this.clickCount++;
        }
    }

    placeEmpty(index) {
        const cell = this.elements.board.children[index];

        // In treasure phase (obstacles confirmed), allow overwriting treasure cells
        if (this.obstaclesConfirmed) {
            // Allow placing on: null cells, treasure probability display, or existing treasure cells
            const canPlace = this.board[index] === null ||
                           cell.classList.contains('treasure-probability-display') ||
                           ['sword', 'chest', 'fox', 'empty'].includes(this.board[index]);

            if (!canPlace) {
                FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_cannot_modify', '此格子無法修改！'), 'error');
                return;
            }
        } else {
            // In obstacle phase, only allow placing on null cells or treasure probability display
            if (this.board[index] !== null && !cell.classList.contains('treasure-probability-display')) {
                FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_cell_occupied', '此格子已被佔用！'), 'error');
                return;
            }
        }

        // If overwriting an existing treasure cell, don't increment click count
        const isOverwriting = this.obstaclesConfirmed &&
                             ['sword', 'chest', 'fox', 'empty'].includes(this.board[index]);

        this.board[index] = 'empty';
        cell.className = 'board-cell empty';
        SecurityUtils.clearElement(cell);
        cell.textContent = '';

        // Only increment click count if not overwriting
        if (!isOverwriting) {
            this.clickCount++;
        }
    }

    checkShapeLimits(type) {
        // Count existing cells of this type
        let count = 0;
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            if (this.board[i] === type) {
                count++;
            }
        }

        if (type === 'fox' && count >= 1) {
            FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_fox_limit', '宗長只能放置 1 格！'), 'error');
            return false;
        } else if (type === 'sword' && count >= 6) {
            FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_sword_limit', '劍最多只能放置 6 格！'), 'error');
            return false;
        } else if (type === 'chest' && count >= 4) {
            FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_chest_limit', '寶箱最多只能放置 4 格！'), 'error');
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
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
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

        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            if (this.board[i] === 'fox') counts.fox++;
            else if (this.board[i] === 'sword') counts.sword++;
            else if (this.board[i] === 'chest') counts.chest++;
        }

        // Check fox limit
        if (counts.fox > 1) {
            FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_fox_error', '錯誤：宗長只能有 0 或 1 格！'), 'error');
            return false;
        }

        // Check sword
        if (counts.sword > 6) {
            FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_sword_error', '錯誤：劍最多只能有 6 格！'), 'error');
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
                FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_sword_shape_error', '錯誤：6 格劍必須形成 2x3 或 3x2 的形狀！'), 'error');
                return false;
            }
        }

        // Check chest
        if (counts.chest > 4) {
            FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_chest_error', '錯誤：寶箱最多只能有 4 格！'), 'error');
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
                FF14Utils.showToast(FF14Utils.getI18nText('faux_hollows_chest_shape_error', '錯誤：4 格寶箱必須形成 2x2 的形狀！'), 'error');
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
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
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
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            const value = this.board[i];
            if (value && value !== 'obstacle') {
                this.clickCount++;
            }
        }

        // Recalculate shapes and score
        this.checkForCompletedShapes();
        this.validateShapes();
        this.updateMatchingBoards();
    }

    updateDisplay() {
        this.elements.remainingClicks.textContent = FauxHollowsFoxes.CONSTANTS.MAX_CLICKS - this.clickCount;

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
        
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            const value = this.board[i];
            if (value && !counted.has(value) && value !== 'obstacle' && value !== 'clicked') {
                counted.add(value);
                if (value === 'fox') shapes.fox++;
                else if (value.startsWith('sword')) shapes.sword++;
                else if (value.startsWith('chest')) shapes.chest++;
            }
        }

        SecurityUtils.clearElement(this.elements.resultDetails);

        const swordP = document.createElement('p');
        const swordText = FF14Utils.getI18nText('faux_hollows_cell_sword', '劍');
        swordP.textContent = `${swordText} x ${shapes.sword} = ${shapes.sword * FauxHollowsFoxes.CONSTANTS.SCORES.SWORD} 分`;
        this.elements.resultDetails.appendChild(swordP);

        const chestP = document.createElement('p');
        const chestText = FF14Utils.getI18nText('faux_hollows_cell_chest', '箱');
        chestP.textContent = `${chestText} x ${shapes.chest} = ${shapes.chest * FauxHollowsFoxes.CONSTANTS.SCORES.CHEST} 分`;
        this.elements.resultDetails.appendChild(chestP);

        const foxP = document.createElement('p');
        const foxText = FF14Utils.getI18nText('faux_hollows_cell_fox', '狐');
        foxP.textContent = `${foxText} x ${shapes.fox} = ${shapes.fox * FauxHollowsFoxes.CONSTANTS.SCORES.FOX} 分`;
        this.elements.resultDetails.appendChild(foxP);

        this.elements.resultPanel.style.display = 'block';
    }


    toggleOptimalHighlight() {
        this.showOptimalHighlight = !this.showOptimalHighlight;

        if (this.showOptimalHighlight) {
            this.elements.autoCalculateBtn.textContent = FF14Utils.getI18nText('faux_hollows_close_best', '關閉最佳策略');
            this.updateOptimalHighlight();
        } else {
            this.elements.autoCalculateBtn.textContent = FF14Utils.getI18nText('faux_hollows_show_best', '顯示最佳策略');
            this.clearHighlights();
        }
    }
    
    updateOptimalHighlight() {
        // 清除之前的高亮
        this.clearHighlights();
        
        // 如果功能關閉或障礙物未確認，不進行高亮
        if (!this.showOptimalHighlight || !this.obstaclesConfirmed) {
            return;
        }
        
        // 確保寶物機率已更新
        this.updateTreasureProbabilitiesBasedOnMatches();
        
        // 找出最高機率的劍和寶箱位置
        const optimalCells = this.findOptimalCells();
        
        if (optimalCells.length > 0) {
            // 高亮這些格子
            optimalCells.forEach(cellData => {
                const cell = this.elements.board.children[cellData.index];
                cell.classList.add('optimal-highlight');
                cell.dataset.optimalType = cellData.type;
                cell.dataset.optimalProbability = cellData.probability;
            });
        }
    }
    
    findOptimalCells() {
        const optimalCells = [];
        let maxSwordProb = 0;
        let maxChestProb = 0;
        
        // 先找出最高機率
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            // 跳過已經有內容的格子
            if (this.board[i] !== null) continue;
            
            const swordProb = this.treasureProbabilities.sword[i];
            const chestProb = this.treasureProbabilities.chest[i];
            
            if (swordProb > maxSwordProb) {
                maxSwordProb = swordProb;
            }
            
            if (chestProb > maxChestProb) {
                maxChestProb = chestProb;
            }
        }
        
        // 找出所有等於最高機率的格子
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            // 跳過已經有內容的格子
            if (this.board[i] !== null) continue;
            
            const swordProb = this.treasureProbabilities.sword[i];
            const chestProb = this.treasureProbabilities.chest[i];
            
            // 加入所有最高機率的劍位置
            if (swordProb > 0 && swordProb === maxSwordProb) {
                optimalCells.push({
                    index: i,
                    type: 'sword',
                    probability: swordProb
                });
            }
            
            // 加入所有最高機率的寶箱位置
            if (chestProb > 0 && chestProb === maxChestProb) {
                optimalCells.push({
                    index: i,
                    type: 'chest',
                    probability: chestProb
                });
            }
        }
        
        return optimalCells;
    }
    
    clearHighlights() {
        // 清除所有高亮效果
        const cells = this.elements.board.querySelectorAll('.optimal-highlight');
        cells.forEach(cell => {
            cell.classList.remove('optimal-highlight');
            delete cell.dataset.optimalType;
            delete cell.dataset.optimalProbability;
        });
    }

    saveState() {
        if (this.isUndoingOrRedoing) return;

        // 儲存目前狀態到歷史記錄
        const state = {
            board: [...this.board],
            clickCount: this.clickCount,
            score: this.score,
            obstaclesConfirmed: this.obstaclesConfirmed,
            showTreasureProbabilities: this.showTreasureProbabilities,
            obstacleProbabilities: [...this.obstacleProbabilities],
            treasureProbabilities: {
                sword: [...this.treasureProbabilities.sword],
                chest: [...this.treasureProbabilities.chest],
                fox: [...this.treasureProbabilities.fox]
            }
        };
        this.history.push(state);

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
        this.board = [...state.board];
        this.clickCount = state.clickCount;
        this.score = state.score;
        this.obstaclesConfirmed = state.obstaclesConfirmed;
        this.showTreasureProbabilities = state.showTreasureProbabilities;
        this.obstacleProbabilities = [...state.obstacleProbabilities];
        this.treasureProbabilities = {
            sword: [...state.treasureProbabilities.sword],
            chest: [...state.treasureProbabilities.chest],
            fox: [...state.treasureProbabilities.fox]
        };

        // 重新渲染盤面
        this.renderBoard();

        // 更新顯示
        this.updateDisplay();
        this.updateMatchingBoards();
        this.updateProbabilityDisplay();
        this.updateOptimalHighlight();

        // 檢查是否需要顯示提示
        if (!this.obstaclesConfirmed && this.elements.gameHint) {
            let obstacleCount = 0;
            for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
                if (this.board[i] === 'obstacle') {
                    obstacleCount++;
                }
            }
            if (obstacleCount < 2) {
                this.elements.gameHint.classList.remove('hidden');
            }
        }
    }

    updateHistoryButtons() {
        if (this.elements.undoBtn) {
            this.elements.undoBtn.disabled = !this.history.canUndo();
        }

        if (this.elements.redoBtn) {
            this.elements.redoBtn.disabled = !this.history.canRedo();
        }
    }

    renderBoard() {
        // 重新渲染整個盤面
        for (let i = 0; i < FauxHollowsFoxes.CONSTANTS.TOTAL_CELLS; i++) {
            const cell = this.elements.board.children[i];
            const value = this.board[i];
            
            // 清空內容
            cell.className = 'board-cell';
            cell.textContent = '';
            
            if (value === null) {
                // 空格子
                if (this.showProbabilities) {
                    if (!this.obstaclesConfirmed && this.obstacleProbabilities[i] > 0) {
                        cell.textContent = `${this.obstacleProbabilities[i]}%`;
                        cell.classList.add('probability-display');
                    } else if (this.obstaclesConfirmed && this.showTreasureProbabilities) {
                        const swordProb = this.treasureProbabilities.sword[i];
                        const chestProb = this.treasureProbabilities.chest[i];
                        const foxProb = this.treasureProbabilities.fox[i];
                        
                        if (swordProb > 0 || chestProb > 0 || foxProb > 0) {
                            SecurityUtils.clearElement(cell);
                            const container = document.createElement('div');
                            container.className = 'treasure-prob-container';
                            
                            if (swordProb > 0) {
                                const swordDiv = document.createElement('div');
                                swordDiv.className = 'treasure-prob sword-prob';
                                const swordText = FF14Utils.getI18nText('faux_hollows_cell_sword', '劍');
                                swordDiv.textContent = `${swordText}:${swordProb}%`;
                                container.appendChild(swordDiv);
                            }

                            if (chestProb > 0) {
                                const chestDiv = document.createElement('div');
                                chestDiv.className = 'treasure-prob chest-prob';
                                const chestText = FF14Utils.getI18nText('faux_hollows_cell_chest', '箱');
                                chestDiv.textContent = `${chestText}:${chestProb}%`;
                                container.appendChild(chestDiv);
                            }

                            if (foxProb > 0) {
                                const foxDiv = document.createElement('div');
                                foxDiv.className = 'treasure-prob fox-prob';
                                const foxText = FF14Utils.getI18nText('faux_hollows_cell_fox', '狐');
                                foxDiv.textContent = `${foxText}:${foxProb}%`;
                                container.appendChild(foxDiv);
                            }
                            
                            cell.appendChild(container);
                            cell.classList.add('treasure-probability-display');
                        }
                    }
                }
            } else if (value === 'obstacle') {
                cell.className = 'board-cell obstacle';
                cell.textContent = '✕';
            } else if (value === 'sword') {
                cell.className = 'board-cell sword';
                cell.textContent = FF14Utils.getI18nText('faux_hollows_cell_sword', '劍');
            } else if (value === 'chest') {
                cell.className = 'board-cell chest';
                cell.textContent = FF14Utils.getI18nText('faux_hollows_cell_chest', '箱');
            } else if (value === 'fox') {
                cell.className = 'board-cell fox';
                cell.textContent = FF14Utils.getI18nText('faux_hollows_cell_fox', '狐');
            } else if (value === 'empty') {
                cell.className = 'board-cell empty';
            } else if (value === 'clicked') {
                cell.className = 'board-cell clicked';
            }
        }
    }

    reset() {
        // Clear board
        this.board = Array(36).fill(null);
        this.clickCount = 0;
        this.score = 0;
        this.selectedCell = null;
        this.obstacleProbabilities = Array(36).fill(0);
        this.treasureProbabilities = {
            sword: Array(36).fill(0),
            chest: Array(36).fill(0),
            fox: Array(36).fill(0)
        };
        this.obstaclesConfirmed = false;
        this.showTreasureProbabilities = false;
        this.showOptimalHighlight = true; // 重置時回復預設開啟
        this.history.clear(); // 清空歷史記錄
        
        // 清除高亮
        this.clearHighlights();
        
        // 更新按鈕文字
        this.elements.autoCalculateBtn.textContent = FF14Utils.getI18nText('faux_hollows_close_best', '關閉最佳策略');
        
        // 禁用回到上一步按鈕
        this.elements.undoBtn.disabled = true;
        
        // Reset UI
        this.initializeBoard();
        this.updateDisplay();
        this.elements.resultPanel.style.display = 'none';
        
        // Restore probability display if enabled
        this.updateProbabilityDisplay();
        this.updateMatchingBoards();
        
        // 顯示提示
        if (this.elements.gameHint) {
            this.elements.gameHint.classList.remove('hidden');
        }

        // 保存初始狀態
        this.saveState();
    }
}

// Initialize the game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new FauxHollowsFoxes();
});
