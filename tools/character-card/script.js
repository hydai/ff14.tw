// 角色卡產生器 JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // 獲取所有輸入元素
    const inputs = {
        characterName: document.getElementById('characterName'),
        serverName: document.getElementById('serverName'),
        jobName: document.getElementById('jobName'),
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
            jobIcon: characterCard.querySelectorAll(`${layoutSelector} .job-icon`),
            freeCompany: characterCard.querySelectorAll(`${layoutSelector} .company-name`)
        };
    }

    // 伺服器資料結構
    const serverData = {
        'Japan': {
            'Elemental': ['Aegis', 'Atomos', 'Carbuncle', 'Garuda', 'Gungnir', 'Kujata', 'Ramuh', 'Tonberry', 'Typhon', 'Unicorn'],
            'Gaia': ['Alexander', 'Bahamut', 'Durandal', 'Fenrir', 'Ifrit', 'Ridill', 'Tiamat', 'Ultima', 'Valefor', 'Yojimbo', 'Zeromus'],
            'Mana': ['Anima', 'Asura', 'Belias', 'Chocobo', 'Hades', 'Ixion', 'Mandragora', 'Masamune', 'Pandaemonium', 'Shinryu', 'Titan']
        },
        'Oceanian': {
            'Materia': ['Bismarck', 'Ravana', 'Sephirot', 'Sophia', 'Zurvan']
        },
        'Europe': {
            'Chaos': ['Cerberus', 'Louisoix', 'Moogle', 'Omega', 'Phantom', 'Ragnarok', 'Sagittarius', 'Spriggan'],
            'Light': ['Alpha', 'Lich', 'Odin', 'Phoenix', 'Shiva', 'Twintania', 'Zodiark']
        },
        'North America': {
            'Aether': ['Adamantoise', 'Cactuar', 'Faerie', 'Gilgamesh', 'Jenova', 'Midgardsormr', 'Sargatanas', 'Siren'],
            'Crystal': ['Balmung', 'Brynhildr', 'Coeurl', 'Diabolos', 'Goblin', 'Malboro', 'Mateus', 'Zalera'],
            'Dynamis': ['Halicarnassus', 'Maduin', 'Marilith', 'Seraph'],
            'Primal': ['Behemoth', 'Excalibur', 'Exodus', 'Famfrit', 'Hyperion', 'Lamia', 'Leviathan', 'Ultros']
        },
        'Taiwan': {
            '繁體中文版': ['陸行鳥', '莫古力', '貓小胖', '紅玉海', '神意之地', '幻影群島', '拉諾西亞', '潮風亭']
        }
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

    // 監聽所有輸入變化（除了jobName和serverName，因為它們現在由按鈕控制）
    Object.keys(inputs).forEach(key => {
        if (inputs[key] && key !== 'jobName' && key !== 'serverName') {
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

        // 更新部隊名稱
        const freeCompany = inputs.freeCompany.value.trim() || '---';
        cardElements.freeCompany.forEach(el => el.textContent = freeCompany);

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

    // 伺服器選擇相關元素
    const serverSelectionElements = {
        regionButtons: document.querySelectorAll('[data-region]'),
        datacenterStep: document.getElementById('datacenterStep'),
        datacenterGrid: document.getElementById('datacenterGrid'),
        serverStep: document.getElementById('serverStep'),
        serverGrid: document.getElementById('serverGrid'),
        selectedServer: document.getElementById('selectedServer'),
        selectedServerName: document.getElementById('selectedServerName'),
        clearServer: document.getElementById('clearServer'),
        hiddenInput: document.getElementById('serverName')
    };

    // 伺服器選擇狀態
    let serverSelection = {
        region: null,
        datacenter: null,
        server: null
    };

    // 區域選擇處理
    serverSelectionElements.regionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const region = this.dataset.region;
            
            // 更新選擇狀態
            serverSelection.region = region;
            serverSelection.datacenter = null;
            serverSelection.server = null;
            
            // 更新按鈕狀態
            serverSelectionElements.regionButtons.forEach(btn => btn.classList.remove('selected'));
            this.classList.add('selected');
            
            // 顯示資料中心選擇
            showDatacenterSelection(region);
            
            // 隱藏伺服器選擇和結果
            serverSelectionElements.serverStep.style.display = 'none';
            serverSelectionElements.selectedServer.style.display = 'none';
        });
    });

    // 顯示資料中心選擇
    function showDatacenterSelection(region) {
        const datacenters = serverData[region];
        if (!datacenters) return;

        // 清空並重新生成資料中心按鈕
        serverSelectionElements.datacenterGrid.innerHTML = '';
        
        Object.keys(datacenters).forEach(datacenter => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'selection-btn';
            button.dataset.datacenter = datacenter;
            button.textContent = datacenter;
            
            button.addEventListener('click', function() {
                // 更新選擇狀態
                serverSelection.datacenter = datacenter;
                serverSelection.server = null;
                
                // 更新按鈕狀態
                serverSelectionElements.datacenterGrid.querySelectorAll('.selection-btn').forEach(btn => btn.classList.remove('selected'));
                this.classList.add('selected');
                
                // 顯示伺服器選擇
                showServerSelection(region, datacenter);
                
                // 隱藏結果
                serverSelectionElements.selectedServer.style.display = 'none';
            });
            
            serverSelectionElements.datacenterGrid.appendChild(button);
        });

        // 顯示資料中心步驟
        serverSelectionElements.datacenterStep.style.display = 'block';
    }

    // 顯示伺服器選擇
    function showServerSelection(region, datacenter) {
        const servers = serverData[region][datacenter];
        if (!servers) return;

        // 清空並重新生成伺服器按鈕
        serverSelectionElements.serverGrid.innerHTML = '';
        
        servers.forEach(server => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'selection-btn';
            button.dataset.server = server;
            button.textContent = server;
            
            button.addEventListener('click', function() {
                // 更新選擇狀態
                serverSelection.server = server;
                
                // 更新按鈕狀態
                serverSelectionElements.serverGrid.querySelectorAll('.selection-btn').forEach(btn => btn.classList.remove('selected'));
                this.classList.add('selected');
                
                // 顯示選擇結果
                showSelectedServer(region, datacenter, server);
                
                // 更新隱藏的input值
                serverSelectionElements.hiddenInput.value = server;
                
                // 更新角色卡
                updateCharacterCard();
            });
            
            serverSelectionElements.serverGrid.appendChild(button);
        });

        // 顯示伺服器步驟
        serverSelectionElements.serverStep.style.display = 'block';
    }

    // 顯示已選擇的伺服器
    function showSelectedServer(region, datacenter, server) {
        const displayText = `${region} > ${datacenter} > ${server}`;
        serverSelectionElements.selectedServerName.textContent = displayText;
        serverSelectionElements.selectedServer.style.display = 'flex';
    }

    // 重新選擇按鈕
    serverSelectionElements.clearServer.addEventListener('click', function() {
        // 重置選擇狀態
        serverSelection = { region: null, datacenter: null, server: null };
        
        // 清除所有選中狀態
        document.querySelectorAll('[data-region]').forEach(btn => btn.classList.remove('selected'));
        
        // 隱藏所有步驟
        serverSelectionElements.datacenterStep.style.display = 'none';
        serverSelectionElements.serverStep.style.display = 'none';
        serverSelectionElements.selectedServer.style.display = 'none';
        
        // 清空隱藏input
        serverSelectionElements.hiddenInput.value = '';
        
        // 更新角色卡
        updateCharacterCard();
    });

    // 職業選擇相關元素
    const jobSelectionElements = {
        jobButtons: document.querySelectorAll('.job-btn'),
        selectedJob: document.getElementById('selectedJob'),
        selectedJobName: document.getElementById('selectedJobName'),
        clearJob: document.getElementById('clearJob'),
        hiddenJobInput: document.getElementById('jobName')
    };

    // 職業選擇處理
    jobSelectionElements.jobButtons.forEach(button => {
        button.addEventListener('click', function() {
            const job = this.dataset.job;
            const category = this.dataset.category;
            
            // 清除所有職業按鈕的選中狀態
            jobSelectionElements.jobButtons.forEach(btn => btn.classList.remove('selected'));
            
            // 設置當前按鈕為選中狀態
            this.classList.add('selected');
            
            // 顯示選擇結果
            showSelectedJob(job, category);
            
            // 更新隱藏的input值
            jobSelectionElements.hiddenJobInput.value = job;
            
            // 更新角色卡
            updateCharacterCard();
        });
    });

    // 顯示已選擇的職業
    function showSelectedJob(job, category) {
        const displayText = `${category} - ${job}`;
        jobSelectionElements.selectedJobName.textContent = displayText;
        jobSelectionElements.selectedJob.style.display = 'flex';
    }

    // 重新選擇職業按鈕
    jobSelectionElements.clearJob.addEventListener('click', function() {
        // 清除所有選中狀態
        jobSelectionElements.jobButtons.forEach(btn => btn.classList.remove('selected'));
        
        // 隱藏選擇結果
        jobSelectionElements.selectedJob.style.display = 'none';
        
        // 清空隱藏input
        jobSelectionElements.hiddenJobInput.value = '';
        
        // 更新角色卡
        updateCharacterCard();
    });

    // 初始化角色卡
    updateCharacterCard();

    // 為輸入欄位添加一些預設的驗證

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