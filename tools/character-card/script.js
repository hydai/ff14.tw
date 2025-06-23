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
        cardTheme: document.getElementById('cardTheme'),
        characterImage: document.getElementById('characterImage')
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

    // 圖片編輯相關元素
    const imageElements = {
        controls: document.getElementById('imageControls'),
        backgroundImage: document.getElementById('backgroundImage'),
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
                imageElements.controls.style.display = 'block';
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
        const transform = `translate(${imageTransform.x}px, ${imageTransform.y}px) scale(${imageTransform.scale}) rotate(${imageTransform.rotate}deg)`;
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
        imageElements.controls.style.display = 'none';
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