// 宗長計算機 JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // 獲取所有輸入元素
    const inputs = {
        currentLevel: document.getElementById('currentLevel'),
        targetLevel: document.getElementById('targetLevel'),
        currentXP: document.getElementById('currentXP'),
        dailyTime: document.getElementById('dailyTime'),
        taskPreference: document.getElementById('taskPreference'),
        includeTribeQuests: document.getElementById('includeTribeQuests'),
        includeRoulette: document.getElementById('includeRoulette'),
        includeHuntLog: document.getElementById('includeHuntLog')
    };

    // 獲取結果區域元素
    const resultElements = {
        calculationResult: document.getElementById('calculationResult'),
        placeholderCard: document.getElementById('placeholderCard'),
        requiredXP: document.getElementById('requiredXP'),
        estimatedDays: document.getElementById('estimatedDays'),
        totalHours: document.getElementById('totalHours'),
        dailyRoutePlan: document.getElementById('dailyRoutePlan'),
        optimizationTips: document.getElementById('optimizationTips')
    };

    // 宗長經驗值表（簡化版本，實際遊戲資料會更複雜）
    const levelXPTable = {
        // 每級所需經驗值
        getRequiredXP: function(level) {
            if (level <= 15) return level * 1000;
            if (level <= 30) return level * 1500;
            if (level <= 50) return level * 2000;
            if (level <= 70) return level * 3000;
            if (level <= 80) return level * 4000;
            if (level <= 90) return level * 5000;
            return level * 6000;
        },
        
        // 計算等級間總經驗值
        getTotalXPBetweenLevels: function(startLevel, endLevel, currentXP = 0) {
            let totalXP = 0;
            for (let level = startLevel; level < endLevel; level++) {
                totalXP += this.getRequiredXP(level + 1);
            }
            return totalXP - currentXP;
        }
    };

    // 任務效率數據
    const taskEfficiency = {
        balanced: {
            mainQuest: { xpPerHour: 50000, description: '主線任務' },
            sideQuest: { xpPerHour: 30000, description: '支線任務' },
            dungeon: { xpPerHour: 80000, description: '地下城' },
            fates: { xpPerHour: 45000, description: 'FATE事件' }
        },
        fast: {
            dungeon: { xpPerHour: 100000, description: '地下城刷怪' },
            roulette: { xpPerHour: 120000, description: '每日隨機' },
            deepDungeon: { xpPerHour: 90000, description: '深層迷宮' }
        },
        safe: {
            mainQuest: { xpPerHour: 45000, description: '主線任務' },
            sideQuest: { xpPerHour: 35000, description: '支線任務' },
            fates: { xpPerHour: 40000, description: 'FATE事件' },
            hunting: { xpPerHour: 25000, description: '討伐筆記' }
        },
        profitable: {
            crafting: { xpPerHour: 40000, description: '製作任務', gil: 50000 },
            gathering: { xpPerHour: 35000, description: '採集任務', gil: 30000 },
            leve: { xpPerHour: 60000, description: '理符任務', gil: 40000 }
        }
    };

    // 計算按鈕事件
    document.getElementById('calculateRoute').addEventListener('click', function() {
        if (!validateInputs()) return;
        
        const calculation = calculateOptimalRoute();
        displayResults(calculation);
    });

    // 重置按鈕事件
    document.getElementById('resetForm').addEventListener('click', function() {
        Object.values(inputs).forEach(input => {
            if (input.type === 'checkbox') {
                input.checked = true;
            } else {
                input.value = '';
            }
        });
        hideResults();
        FF14Utils.showToast('表單已重置');
    });

    // 驗證輸入
    function validateInputs() {
        const currentLevel = parseInt(inputs.currentLevel.value);
        const targetLevel = parseInt(inputs.targetLevel.value);
        const dailyTime = parseFloat(inputs.dailyTime.value);

        if (!FF14Utils.validateNumber(currentLevel, 1, 100)) {
            FF14Utils.showToast('請輸入有效的目前等級 (1-100)', 'error');
            inputs.currentLevel.focus();
            return false;
        }

        if (!FF14Utils.validateNumber(targetLevel, 1, 100)) {
            FF14Utils.showToast('請輸入有效的目標等級 (1-100)', 'error');
            inputs.targetLevel.focus();
            return false;
        }

        if (targetLevel <= currentLevel) {
            FF14Utils.showToast('目標等級必須高於目前等級', 'error');
            inputs.targetLevel.focus();
            return false;
        }

        if (!dailyTime || dailyTime < 0.5 || dailyTime > 24) {
            FF14Utils.showToast('請輸入有效的每日時間 (0.5-24小時)', 'error');
            inputs.dailyTime.focus();
            return false;
        }

        return true;
    }

    // 計算最佳路線
    function calculateOptimalRoute() {
        const currentLevel = parseInt(inputs.currentLevel.value);
        const targetLevel = parseInt(inputs.targetLevel.value);
        const currentXP = parseInt(inputs.currentXP.value) || 0;
        const dailyTime = parseFloat(inputs.dailyTime.value);
        const preference = inputs.taskPreference.value;

        // 計算需要的總經驗值
        const requiredXP = levelXPTable.getTotalXPBetweenLevels(currentLevel, targetLevel, currentXP);

        // 根據偏好選擇任務效率
        const selectedTasks = taskEfficiency[preference];
        
        // 計算每日可獲得經驗值
        let dailyXP = 0;
        const routePlan = [];

        Object.entries(selectedTasks).forEach(([taskType, taskData]) => {
            const timeAllocation = dailyTime / Object.keys(selectedTasks).length;
            const xpGained = taskData.xpPerHour * timeAllocation;
            dailyXP += xpGained;

            routePlan.push({
                type: taskType,
                description: taskData.description,
                time: timeAllocation,
                xp: xpGained,
                gil: taskData.gil || 0
            });
        });

        // 加入每日任務加成
        let dailyBonus = 0;
        if (inputs.includeTribeQuests.checked) dailyBonus += 15000;
        if (inputs.includeRoulette.checked) dailyBonus += 100000;
        if (inputs.includeHuntLog.checked) dailyBonus += 25000;

        dailyXP += dailyBonus;

        // 計算預估天數
        const estimatedDays = Math.ceil(requiredXP / dailyXP);
        const totalHours = estimatedDays * dailyTime;

        return {
            requiredXP,
            dailyXP,
            estimatedDays,
            totalHours,
            routePlan,
            dailyBonus,
            preference
        };
    }

    // 顯示結果
    function displayResults(calculation) {
        // 隱藏佔位卡片，顯示結果
        resultElements.placeholderCard.classList.add('hidden');
        resultElements.calculationResult.classList.remove('hidden');

        // 更新統計數據
        resultElements.requiredXP.textContent = FF14Utils.formatNumber(calculation.requiredXP);
        resultElements.estimatedDays.textContent = `${calculation.estimatedDays} 天`;
        resultElements.totalHours.textContent = `${calculation.totalHours.toFixed(1)} 小時`;

        // 生成每日路線計劃
        resultElements.dailyRoutePlan.innerHTML = '';
        calculation.routePlan.forEach((step, index) => {
            const stepElement = createRouteStep(index + 1, step);
            resultElements.dailyRoutePlan.appendChild(stepElement);
        });

        // 添加每日任務步驟
        if (calculation.dailyBonus > 0) {
            const bonusStep = createRouteStep(calculation.routePlan.length + 1, {
                description: '每日任務加成',
                time: 0.5,
                xp: calculation.dailyBonus,
                type: 'bonus'
            });
            resultElements.dailyRoutePlan.appendChild(bonusStep);
        }

        // 生成優化建議
        generateOptimizationTips(calculation);

        // 滾動到結果區域
        resultElements.calculationResult.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

        FF14Utils.showToast('計算完成！');
    }

    // 創建路線步驟元素
    function createRouteStep(stepNumber, step) {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'route-step';
        
        stepDiv.innerHTML = `
            <div class="step-icon">${stepNumber}</div>
            <div class="step-content">
                <div class="step-title">${step.description}</div>
                <div class="step-description">
                    預估獲得 ${FF14Utils.formatNumber(Math.round(step.xp))} 經驗值
                    ${step.gil ? ` | ${FF14Utils.formatNumber(step.gil)} 金幣` : ''}
                </div>
            </div>
            <div class="step-time">${step.time.toFixed(1)} 小時</div>
        `;
        
        return stepDiv;
    }

    // 生成優化建議
    function generateOptimizationTips(calculation) {
        const tips = [];
        
        if (calculation.estimatedDays > 30) {
            tips.push('建議增加每日遊戲時間或選擇更高效的任務類型');
        }
        
        if (calculation.preference === 'balanced') {
            tips.push('平衡路線適合新手，如果想要更快升級可以考慮「快速升級」模式');
        }
        
        if (!inputs.includeRoulette.checked) {
            tips.push('每日隨機任務提供大量經驗值，強烈建議開啟');
        }
        
        if (parseInt(inputs.currentLevel.value) < 50) {
            tips.push('50級前建議專注主線任務，經驗值獲得效率最高');
        }
        
        tips.push('記得使用經驗值加成食物和部隊加成');
        tips.push('在休息區域下線可以獲得額外的休息經驗值加成');

        resultElements.optimizationTips.innerHTML = '';
        tips.forEach(tip => {
            const li = document.createElement('li');
            li.textContent = tip;
            resultElements.optimizationTips.appendChild(li);
        });
    }

    // 隱藏結果
    function hideResults() {
        resultElements.calculationResult.classList.add('hidden');
        resultElements.placeholderCard.classList.remove('hidden');
    }

    // 匯出計劃按鈕
    document.getElementById('exportPlan').addEventListener('click', function() {
        FF14Utils.showToast('匯出功能開發中');
        // TODO: 實作匯出功能
    });

    // 分享計劃按鈕
    document.getElementById('sharePlan').addEventListener('click', function() {
        const currentLevel = inputs.currentLevel.value;
        const targetLevel = inputs.targetLevel.value;
        const shareText = `我的FF14宗長升級計劃：${currentLevel}級 → ${targetLevel}級`;
        
        if (navigator.share) {
            navigator.share({
                title: 'FF14宗長計算機',
                text: shareText,
                url: window.location.href
            });
        } else {
            FF14Utils.copyToClipboard(shareText + ' - ' + window.location.href);
        }
    });

    // 輸入驗證
    inputs.currentLevel.addEventListener('input', function() {
        const value = parseInt(this.value);
        if (value > 100) this.value = 100;
        if (value < 1) this.value = '';
    });

    inputs.targetLevel.addEventListener('input', function() {
        const value = parseInt(this.value);
        if (value > 100) this.value = 100;
        if (value < 1) this.value = '';
    });

    inputs.dailyTime.addEventListener('input', function() {
        const value = parseFloat(this.value);
        if (value > 24) this.value = 24;
        if (value < 0) this.value = '';
    });
});