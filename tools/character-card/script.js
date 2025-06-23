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
        cardLayout: document.getElementById('cardLayout'),
        cardTheme: document.getElementById('cardTheme'),
        characterImage: document.getElementById('characterImage')
    };

    // 獲取角色卡元素
    const characterCard = document.getElementById('characterCard');
    
    // 獲取兩種版型的元素
    function getCardElements() {
        const isHorizontal = characterCard.classList.contains('layout-horizontal');
        const layoutSelector = isHorizontal ? '.horizontal-layout' : '.vertical-layout';
        
        return {
            characterName: characterCard.querySelectorAll(`${layoutSelector} .character-name`),
            characterTitle: characterCard.querySelectorAll(`${layoutSelector} .character-title`),
            serverName: characterCard.querySelectorAll(`${layoutSelector} .server-name`),
            jobName: characterCard.querySelectorAll(`${layoutSelector} .job-name`),
            jobLevel: characterCard.querySelectorAll(`${layoutSelector} .job-level`),
            jobIcon: characterCard.querySelectorAll(`${layoutSelector} .job-icon`),
            gearScore: characterCard.querySelectorAll(`${layoutSelector} .stat-value`),
            freeCompany: characterCard.querySelectorAll(`${layoutSelector} .stat-value`)
        };
    }

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

    // 圖片編輯相關元素
    const imageElements = {
        controls: document.querySelector('.image-controls'),
        backgroundImage: document.getElementById('backgroundImage'),
        positionGroup: document.getElementById('positionGroup'),
        scaleGroup: document.getElementById('scaleGroup'),
        rotateGroup: document.getElementById('rotateGroup'),
        actionGroup: document.getElementById('actionGroup'),
        moveUp: document.getElementById('moveUp'),
        moveDown: document.getElementById('moveDown'),
        moveLeft: document.getElementById('moveLeft'),
        moveRight: document.getElementById('moveRight'),
        scaleSlider: document.getElementById('scaleSlider'),
        scaleValue: document.getElementById('scaleValue'),
        rotateSlider: document.getElementById('rotateSlider'),
        rotateValue: document.getElementById('rotateValue'),
        resetImage: document.getElementById('resetImage'),
        removeImage: document.getElementById('removeImage')
    };

    // 圖片變換狀態
    let imageTransform = {
        x: 0,
        y: 0,
        scale: 1,
        rotate: 0
    };

    // 監聽所有輸入變化
    Object.keys(inputs).forEach(key => {
        if (inputs[key]) {
            inputs[key].addEventListener('input', updateCharacterCard);
            inputs[key].addEventListener('change', updateCharacterCard);
        }
    });

    // 版型切換函數
    function switchLayout() {
        const layout = inputs.cardLayout.value || 'horizontal';
        
        // 移除舊的版型class
        characterCard.classList.remove('layout-horizontal', 'layout-vertical');
        
        // 添加新的版型class
        characterCard.classList.add(`layout-${layout}`);
        
        // 更新角色卡內容
        updateCharacterCard();
    }

    // 更新角色卡函數
    function updateCharacterCard() {
        const cardElements = getCardElements();
        
        // 更新角色名稱
        const characterName = inputs.characterName.value.trim() || '角色名稱';
        cardElements.characterName.forEach(el => el.textContent = characterName);

        // 更新稱號
        const characterTitle = inputs.characterTitle.value.trim();
        cardElements.characterTitle.forEach(el => {
            if (characterTitle) {
                el.textContent = `《${characterTitle}》`;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        });

        // 更新伺服器
        const serverName = inputs.serverName.value || '伺服器';
        cardElements.serverName.forEach(el => el.textContent = serverName);

        // 更新職業
        const jobName = inputs.jobName.value || '職業';
        cardElements.jobName.forEach(el => el.textContent = jobName);

        // 更新職業圖示
        const jobIcon = jobIcons[jobName] || '⚔️';
        cardElements.jobIcon.forEach(el => el.textContent = jobIcon);

        // 更新等級
        const jobLevel = inputs.jobLevel.value;
        const levelText = (jobLevel && FF14Utils.validateNumber(jobLevel, 1, 100)) ? `Lv. ${jobLevel}` : 'Lv. --';
        cardElements.jobLevel.forEach(el => el.textContent = levelText);

        // 更新裝備等級
        const gearScore = inputs.gearScore.value;
        const gearText = (gearScore && FF14Utils.validateNumber(gearScore, 0, 999)) ? gearScore : '---';
        if (cardElements.gearScore.length > 0) {
            cardElements.gearScore[0].textContent = gearText;
        }

        // 更新部隊名稱
        const freeCompany = inputs.freeCompany.value.trim() || '---';
        if (cardElements.freeCompany.length > 1) {
            cardElements.freeCompany[1].textContent = freeCompany;
        }

        // 更新主題和版型
        const theme = inputs.cardTheme.value || 'default';
        const layout = inputs.cardLayout.value || 'horizontal';
        characterCard.className = `character-card theme-${theme} layout-${layout}`;
        if (characterCard.classList.contains('has-background')) {
            characterCard.classList.add('has-background');
        }
    }

    // 版型切換監聽
    inputs.cardLayout.addEventListener('change', switchLayout);

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

    // 圖片上傳處理
    inputs.characterImage.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            // 檢查檔案大小 (5MB 限制)
            if (file.size > 5 * 1024 * 1024) {
                FF14Utils.showToast('圖片檔案過大，請選擇小於 5MB 的圖片', 'error');
                return;
            }

            // 檢查檔案類型
            if (!file.type.startsWith('image/')) {
                FF14Utils.showToast('請選擇有效的圖片檔案', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                imageElements.backgroundImage.src = e.target.result;
                imageElements.backgroundImage.style.display = 'block';
                
                // 顯示編輯控制項
                imageElements.positionGroup.style.display = 'flex';
                imageElements.scaleGroup.style.display = 'flex';
                imageElements.rotateGroup.style.display = 'flex';
                imageElements.actionGroup.style.display = 'flex';
                
                characterCard.classList.add('has-background');
                
                // 重置變換狀態
                resetImageTransform();
                FF14Utils.showToast('圖片上傳成功！');
            };
            reader.readAsDataURL(file);
        }
    });

    // 圖片變換函數
    function updateImageTransform() {
        const transform = `translate(calc(-50% + ${imageTransform.x}px), calc(-50% + ${imageTransform.y}px)) scale(${imageTransform.scale}) rotate(${imageTransform.rotate}deg)`;
        imageElements.backgroundImage.style.transform = transform;
    }

    function resetImageTransform() {
        imageTransform = { x: 0, y: 0, scale: 1, rotate: 0 };
        imageElements.scaleSlider.value = 1;
        imageElements.rotateSlider.value = 0;
        imageElements.scaleValue.textContent = '100%';
        imageElements.rotateValue.textContent = '0°';
        updateImageTransform();
    }

    // 圖片位置控制
    imageElements.moveUp.addEventListener('click', function() {
        imageTransform.y -= 10;
        updateImageTransform();
    });

    imageElements.moveDown.addEventListener('click', function() {
        imageTransform.y += 10;
        updateImageTransform();
    });

    imageElements.moveLeft.addEventListener('click', function() {
        imageTransform.x -= 10;
        updateImageTransform();
    });

    imageElements.moveRight.addEventListener('click', function() {
        imageTransform.x += 10;
        updateImageTransform();
    });

    // 縮放控制
    imageElements.scaleSlider.addEventListener('input', function() {
        imageTransform.scale = parseFloat(this.value);
        imageElements.scaleValue.textContent = Math.round(imageTransform.scale * 100) + '%';
        updateImageTransform();
    });

    // 旋轉控制
    imageElements.rotateSlider.addEventListener('input', function() {
        imageTransform.rotate = parseInt(this.value);
        imageElements.rotateValue.textContent = imageTransform.rotate + '°';
        updateImageTransform();
    });

    // 重置圖片
    imageElements.resetImage.addEventListener('click', function() {
        resetImageTransform();
        FF14Utils.showToast('圖片已重置');
    });

    // 移除圖片
    imageElements.removeImage.addEventListener('click', function() {
        imageElements.backgroundImage.style.display = 'none';
        imageElements.backgroundImage.src = '';
        
        // 隱藏編輯控制項
        imageElements.positionGroup.style.display = 'none';
        imageElements.scaleGroup.style.display = 'none';
        imageElements.rotateGroup.style.display = 'none';
        imageElements.actionGroup.style.display = 'none';
        
        characterCard.classList.remove('has-background');
        inputs.characterImage.value = '';
        resetImageTransform();
        FF14Utils.showToast('圖片已移除');
    });

    // 拖拉功能 (滑鼠/觸控)
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    function startDrag(e) {
        if (!imageElements.backgroundImage.src) return;
        
        isDragging = true;
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        lastX = clientX;
        lastY = clientY;
        
        characterCard.style.cursor = 'grabbing';
        e.preventDefault();
    }

    function doDrag(e) {
        if (!isDragging) return;
        
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        
        const deltaX = clientX - lastX;
        const deltaY = clientY - lastY;
        
        imageTransform.x += deltaX;
        imageTransform.y += deltaY;
        
        lastX = clientX;
        lastY = clientY;
        
        updateImageTransform();
        e.preventDefault();
    }

    function endDrag() {
        isDragging = false;
        characterCard.style.cursor = 'default';
    }

    // 滑鼠事件
    characterCard.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);

    // 觸控事件
    characterCard.addEventListener('touchstart', startDrag);
    document.addEventListener('touchmove', doDrag);
    document.addEventListener('touchend', endDrag);

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