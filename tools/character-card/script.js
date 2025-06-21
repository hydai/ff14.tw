// 角色卡產生器 JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // 獲取所有輸入元素
    const inputs = {
        characterName: document.getElementById('characterName'),
        serverName: document.getElementById('serverName'),
        jobName: document.getElementById('jobName'),
        jobLevel: document.getElementById('jobLevel'),
        gearScore: document.getElementById('gearScore'),
        characterTitle: document.getElementById('characterTitle'),
        freeCompany: document.getElementById('freeCompany'),
        cardTheme: document.getElementById('cardTheme')
    };

    // 獲取角色卡元素
    const characterCard = document.getElementById('characterCard');
    const cardElements = {
        characterName: characterCard.querySelector('.character-name'),
        characterTitle: characterCard.querySelector('.character-title'),
        serverName: characterCard.querySelector('.server-name'),
        jobName: characterCard.querySelector('.job-name'),
        jobLevel: characterCard.querySelector('.job-level'),
        jobIcon: characterCard.querySelector('.job-icon'),
        gearScore: characterCard.querySelectorAll('.stat-value')[0],
        freeCompany: characterCard.querySelectorAll('.stat-value')[1]
    };

    // 職業圖示對應
    const jobIcons = {
        '騎士': '🛡️',
        '戰士': '🪓',
        '暗黑騎士': '⚔️',
        '絕槍戰士': '🔫',
        '白魔法師': '✨',
        '學者': '📚',
        '占星術士': '🔮',
        '賢者': '🌟',
        '武僧': '👊',
        '龍騎士': '🐉',
        '忍者': '🥷',
        '武士': '⚡',
        '鐮刀': '🗡️',
        '詩人': '🎵',
        '機工士': '🔧',
        '舞者': '💃',
        '黑魔法師': '🔥',
        '召喚師': '👹',
        '赤魔法師': '🎭'
    };

    // 監聽所有輸入變化
    Object.keys(inputs).forEach(key => {
        if (inputs[key]) {
            inputs[key].addEventListener('input', updateCharacterCard);
            inputs[key].addEventListener('change', updateCharacterCard);
        }
    });

    // 更新角色卡函數
    function updateCharacterCard() {
        // 更新角色名稱
        const characterName = inputs.characterName.value.trim() || '角色名稱';
        cardElements.characterName.textContent = characterName;

        // 更新稱號
        const characterTitle = inputs.characterTitle.value.trim();
        if (characterTitle) {
            cardElements.characterTitle.textContent = `《${characterTitle}》`;
            cardElements.characterTitle.style.display = 'block';
        } else {
            cardElements.characterTitle.style.display = 'none';
        }

        // 更新伺服器
        const serverName = inputs.serverName.value || '伺服器';
        cardElements.serverName.textContent = serverName;

        // 更新職業
        const jobName = inputs.jobName.value || '職業';
        cardElements.jobName.textContent = jobName;

        // 更新職業圖示
        const jobIcon = jobIcons[jobName] || '⚔️';
        cardElements.jobIcon.textContent = jobIcon;

        // 更新等級
        const jobLevel = inputs.jobLevel.value;
        if (jobLevel && FF14Utils.validateNumber(jobLevel, 1, 100)) {
            cardElements.jobLevel.textContent = `Lv. ${jobLevel}`;
        } else {
            cardElements.jobLevel.textContent = 'Lv. --';
        }

        // 更新裝備等級
        const gearScore = inputs.gearScore.value;
        if (gearScore && FF14Utils.validateNumber(gearScore, 0, 999)) {
            cardElements.gearScore.textContent = gearScore;
        } else {
            cardElements.gearScore.textContent = '---';
        }

        // 更新部隊名稱
        const freeCompany = inputs.freeCompany.value.trim();
        if (freeCompany) {
            cardElements.freeCompany.textContent = freeCompany;
        } else {
            cardElements.freeCompany.textContent = '---';
        }

        // 更新主題
        const theme = inputs.cardTheme.value || 'default';
        characterCard.className = `character-card theme-${theme}`;
    }

    // 產生角色卡按鈕
    document.getElementById('generateCard').addEventListener('click', function() {
        // 驗證必填欄位
        if (!inputs.characterName.value.trim()) {
            FF14Utils.showToast('請輸入角色名稱', 'error');
            inputs.characterName.focus();
            return;
        }

        if (!inputs.serverName.value) {
            FF14Utils.showToast('請選擇伺服器', 'error');
            inputs.serverName.focus();
            return;
        }

        if (!inputs.jobName.value) {
            FF14Utils.showToast('請選擇職業', 'error');
            inputs.jobName.focus();
            return;
        }

        // 更新角色卡並顯示成功訊息
        updateCharacterCard();
        FF14Utils.showToast('角色卡已生成！');

        // 滾動到預覽區域
        document.querySelector('.preview-section').scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    });

    // 下載圖片按鈕
    document.getElementById('downloadCard').addEventListener('click', function() {
        // 檢查是否有有效的角色卡內容
        if (!inputs.characterName.value.trim()) {
            FF14Utils.showToast('請先產生角色卡', 'error');
            return;
        }

        // 使用 html2canvas 或類似功能（這裡先顯示提示）
        FF14Utils.showToast('下載功能開發中，敬請期待！');
        
        // TODO: 實作圖片下載功能
        // 可以使用 html2canvas 或 canvas API 來將角色卡轉換成圖片
    });

    // 初始化角色卡
    updateCharacterCard();

    // 為輸入欄位添加一些預設的驗證
    inputs.jobLevel.addEventListener('input', function() {
        const value = parseInt(this.value);
        if (value > 100) this.value = 100;
        if (value < 1) this.value = '';
    });

    inputs.gearScore.addEventListener('input', function() {
        const value = parseInt(this.value);
        if (value > 999) this.value = 999;
        if (value < 0) this.value = '';
    });

    // 角色名稱長度限制
    inputs.characterName.addEventListener('input', function() {
        if (this.value.length > 20) {
            this.value = this.value.substring(0, 20);
        }
    });

    // 稱號長度限制
    inputs.characterTitle.addEventListener('input', function() {
        if (this.value.length > 30) {
            this.value = this.value.substring(0, 30);
        }
    });

    // 部隊名稱長度限制
    inputs.freeCompany.addEventListener('input', function() {
        if (this.value.length > 25) {
            this.value = this.value.substring(0, 25);
        }
    });
});