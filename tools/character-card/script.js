// 角色卡產生器 JavaScript

class CharacterCardGenerator {
    static CONSTANTS = {
        // 預設值
        DEFAULT_CHARACTER_NAME: '角色名稱',
        DEFAULT_JOB_NAME: '職業',
        DEFAULT_JOB_ICON: '⚔️',
        DEFAULT_NAME_COLOR: '#FFFFFF',
        DEFAULT_OPACITY: 40,
        DEFAULT_LAYOUT: 'horizontal',

        // 限制
        MAX_NAME_LENGTH: 20,
        MAX_TITLE_LENGTH: 30,
        MAX_COMPANY_LENGTH: 25,
        MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB

        // 驗證規則
        COLOR_REGEX: /^#([0-9a-f]{3}){1,2}$/i, // 支援 3 位 (#FFF) 和 6 位 (#FFFFFF) 色碼

        // 圖片控制
        IMAGE_MOVE_STEP: 10,
        AUTO_COLLAPSE_DELAY: 500,

        // 伺服器資料結構
        SERVER_DATA: {
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
        },

        // 職業圖示對應 - 使用官方 SE 圖示
        JOB_ICONS: {
            '騎士': 'assets/images/se/FFXIVJobIcons/01_TANK/Job/Paladin.png',
            '戰士': 'assets/images/se/FFXIVJobIcons/01_TANK/Job/Warrior.png',
            '暗黑騎士': 'assets/images/se/FFXIVJobIcons/01_TANK/Job/DarkKnight.png',
            '絕槍戰士': 'assets/images/se/FFXIVJobIcons/01_TANK/Job/Gunbreaker.png',
            '白魔法師': 'assets/images/se/FFXIVJobIcons/02_HEALER/Job/WhiteMage.png',
            '學者': 'assets/images/se/FFXIVJobIcons/02_HEALER/Job/Scholar.png',
            '占星術士': 'assets/images/se/FFXIVJobIcons/02_HEALER/Job/Astrologian.png',
            '賢者': 'assets/images/se/FFXIVJobIcons/02_HEALER/Job/Sage.png',
            '武僧': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Monk.png',
            '龍騎士': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Dragoon.png',
            '忍者': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Ninja.png',
            '武士': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Samurai.png',
            '鐮刀': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Reaper.png',
            '詩人': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Bard.png',
            '機工士': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Machinist.png',
            '舞者': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Dancer.png',
            '黑魔法師': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/BlackMage.png',
            '召喚師': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Summoner.png',
            '赤魔法師': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/RedMage.png'
        }
    };

    constructor() {
        // 輸入元素
        this.inputs = {
            characterName: document.getElementById('characterName'),
            serverName: document.getElementById('serverName'),
            jobName: document.getElementById('jobName'),
            characterTitle: document.getElementById('characterTitle'),
            freeCompany: document.getElementById('freeCompany'),
            cardLayout: document.getElementById('cardLayout'),
            nameColor: document.getElementById('nameColor'),
            nameColorText: document.getElementById('nameColorText'),
            characterImage: document.getElementById('characterImage')
        };

        // 角色卡元素
        this.characterCard = document.getElementById('characterCard');

        // 圖片編輯元素
        this.imageElements = {
            controls: document.querySelector('.image-controls'),
            backgroundImage: document.getElementById('backgroundImage'),
            positionGroup: document.getElementById('positionGroup'),
            scaleGroup: document.getElementById('scaleGroup'),
            rotateGroup: document.getElementById('rotateGroup'),
            opacityGroup: document.getElementById('opacityGroup'),
            actionGroup: document.getElementById('actionGroup'),
            moveUp: document.getElementById('moveUp'),
            moveDown: document.getElementById('moveDown'),
            moveLeft: document.getElementById('moveLeft'),
            moveRight: document.getElementById('moveRight'),
            scaleSlider: document.getElementById('scaleSlider'),
            scaleValue: document.getElementById('scaleValue'),
            rotateSlider: document.getElementById('rotateSlider'),
            rotateValue: document.getElementById('rotateValue'),
            opacitySlider: document.getElementById('opacitySlider'),
            opacityValue: document.getElementById('opacityValue'),
            resetImage: document.getElementById('resetImage'),
            removeImage: document.getElementById('removeImage')
        };

        // 伺服器選擇元素
        this.serverSelectionElements = {
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

        // 職業選擇元素
        this.jobSelectionElements = {
            jobButtons: document.querySelectorAll('.job-btn'),
            selectedJob: document.getElementById('selectedJob'),
            selectedJobName: document.getElementById('selectedJobName'),
            clearJob: document.getElementById('clearJob'),
            hiddenJobInput: document.getElementById('jobName')
        };

        // 可折疊元素
        this.collapsibleElements = {
            serverHeader: document.getElementById('serverCollapsibleHeader'),
            serverToggle: document.getElementById('serverCollapseToggle'),
            serverContent: document.getElementById('serverCollapsibleContent'),
            jobHeader: document.getElementById('jobCollapsibleHeader'),
            jobToggle: document.getElementById('jobCollapseToggle'),
            jobContent: document.getElementById('jobCollapsibleContent')
        };

        // 按鈕元素
        this.buttons = {
            generateCard: document.getElementById('generateCard'),
            downloadCard: document.getElementById('downloadCard')
        };

        // 區域元素
        this.sections = {
            preview: document.querySelector('.preview-section')
        };

        // 狀態管理
        this.state = {
            imageTransform: {
                x: 0,
                y: 0,
                scale: 1,
                rotate: 0,
                opacity: CharacterCardGenerator.CONSTANTS.DEFAULT_OPACITY
            },
            dragging: {
                isDragging: false,
                lastX: 0,
                lastY: 0
            },
            serverSelection: {
                region: null,
                datacenter: null,
                server: null
            },
            collapsible: {
                server: false, // false = 展開, true = 折疊
                job: false
            }
        };

        // 初始化
        this.initializeEvents();
        this.updateCharacterCard();
    }

    // ===== 初始化方法 =====

    initializeEvents() {
        // 輸入欄位監聽（除了 jobName 和 serverName）
        Object.keys(this.inputs).forEach(key => {
            if (this.inputs[key] && key !== 'jobName' && key !== 'serverName') {
                this.inputs[key].addEventListener('input', () => this.updateCharacterCard());
                this.inputs[key].addEventListener('change', () => this.updateCharacterCard());
            }
        });

        // 版型切換
        this.inputs.cardLayout.addEventListener('change', () => this.switchLayout());

        // 顏色選擇器同步
        this.inputs.nameColor.addEventListener('change', () => {
            this.inputs.nameColorText.value = this.inputs.nameColor.value;
            this.updateCharacterCard();
        });

        this.inputs.nameColorText.addEventListener('input', () => {
            const color = this.inputs.nameColorText.value.trim();
            if (CharacterCardGenerator.CONSTANTS.COLOR_REGEX.test(color)) {
                this.inputs.nameColor.value = color;
                this.updateCharacterCard();
            }
        });

        // 產生角色卡按鈕
        this.buttons.generateCard.addEventListener('click', () => this.generateCard());

        // 下載圖片按鈕
        this.buttons.downloadCard.addEventListener('click', () => this.downloadCard());

        // 圖片上傳
        this.inputs.characterImage.addEventListener('change', (e) => this.handleImageUpload(e));

        // 圖片編輯控制
        this.initializeImageControls();

        // 拖拉功能
        this.initializeDragFeature();

        // 伺服器選擇
        this.initializeServerSelection();

        // 職業選擇
        this.initializeJobSelection();

        // 可折疊區塊
        this.initializeCollapsible();

        // 輸入驗證
        this.initializeValidation();
    }

    initializeImageControls() {
        // 位置控制
        this.imageElements.moveUp.addEventListener('click', () => {
            this.state.imageTransform.y -= CharacterCardGenerator.CONSTANTS.IMAGE_MOVE_STEP;
            this.updateImageTransform();
        });

        this.imageElements.moveDown.addEventListener('click', () => {
            this.state.imageTransform.y += CharacterCardGenerator.CONSTANTS.IMAGE_MOVE_STEP;
            this.updateImageTransform();
        });

        this.imageElements.moveLeft.addEventListener('click', () => {
            this.state.imageTransform.x -= CharacterCardGenerator.CONSTANTS.IMAGE_MOVE_STEP;
            this.updateImageTransform();
        });

        this.imageElements.moveRight.addEventListener('click', () => {
            this.state.imageTransform.x += CharacterCardGenerator.CONSTANTS.IMAGE_MOVE_STEP;
            this.updateImageTransform();
        });

        // 縮放控制
        this.imageElements.scaleSlider.addEventListener('input', () => {
            this.state.imageTransform.scale = parseFloat(this.imageElements.scaleSlider.value);
            this.imageElements.scaleValue.textContent = Math.round(this.state.imageTransform.scale * 100) + '%';
            this.updateImageTransform();
        });

        // 旋轉控制
        this.imageElements.rotateSlider.addEventListener('input', () => {
            this.state.imageTransform.rotate = parseInt(this.imageElements.rotateSlider.value);
            this.imageElements.rotateValue.textContent = this.state.imageTransform.rotate + '°';
            this.updateImageTransform();
        });

        // 不透明度控制
        this.imageElements.opacitySlider.addEventListener('input', () => {
            this.state.imageTransform.opacity = parseInt(this.imageElements.opacitySlider.value);
            this.imageElements.opacityValue.textContent = this.state.imageTransform.opacity + '%';
            this.updateBackgroundOpacity();
        });

        // 重置圖片
        this.imageElements.resetImage.addEventListener('click', () => {
            this.resetImageTransform();
            FF14Utils.showToast('圖片已重置');
        });

        // 移除圖片
        this.imageElements.removeImage.addEventListener('click', () => this.removeImage());
    }

    initializeDragFeature() {
        // 綁定拖拉事件處理器（保持 this 上下文）
        this.handleStartDrag = (e) => this.startDrag(e);
        this.handleDoDrag = (e) => this.doDrag(e);
        this.handleEndDrag = () => this.endDrag();

        // 只附加開始拖拉的監聽器
        // move 和 end 監聽器會在 startDrag 中動態附加，在 endDrag 中移除
        this.characterCard.addEventListener('mousedown', this.handleStartDrag);
        this.characterCard.addEventListener('touchstart', this.handleStartDrag);
    }

    initializeServerSelection() {
        // 區域選擇
        this.serverSelectionElements.regionButtons.forEach(button => {
            button.addEventListener('click', () => {
                const region = button.dataset.region;

                // 更新選擇狀態
                this.state.serverSelection.region = region;
                this.state.serverSelection.datacenter = null;
                this.state.serverSelection.server = null;

                // 更新按鈕狀態
                this.serverSelectionElements.regionButtons.forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');

                // 顯示資料中心選擇
                this.showDatacenterSelection(region);

                // 隱藏伺服器選擇和結果
                this.serverSelectionElements.serverStep.style.display = 'none';
                this.serverSelectionElements.selectedServer.style.display = 'none';
            });
        });

        // 重新選擇按鈕
        this.serverSelectionElements.clearServer.addEventListener('click', () => this.clearServerSelection());
    }

    initializeJobSelection() {
        // 職業選擇
        this.jobSelectionElements.jobButtons.forEach(button => {
            button.addEventListener('click', () => {
                const job = button.dataset.job;
                const category = button.dataset.category;

                // 清除所有職業按鈕的選中狀態
                this.jobSelectionElements.jobButtons.forEach(btn => btn.classList.remove('selected'));

                // 設置當前按鈕為選中狀態
                button.classList.add('selected');

                // 顯示選擇結果
                this.showSelectedJob(job, category);

                // 更新隱藏的input值
                this.jobSelectionElements.hiddenJobInput.value = job;

                // 更新角色卡
                this.updateCharacterCard();

                // 自動折疊職業選擇區域
                this.autoCollapse('job');
            });
        });

        // 重新選擇職業按鈕
        this.jobSelectionElements.clearJob.addEventListener('click', () => this.clearJobSelection());
    }

    initializeCollapsible() {
        // 輔助函數：設定折疊功能
        const setupCollapsible = (section) => {
            const header = this.collapsibleElements[`${section}Header`];
            const toggle = this.collapsibleElements[`${section}Toggle`];

            // 標頭點擊事件
            header.addEventListener('click', (e) => {
                // 如果點擊的是切換按鈕或其子元素，則由按鈕自己的事件處理器處理
                if (toggle.contains(e.target)) {
                    return;
                }
                this.toggleCollapsible(section);
            });

            // 切換按鈕點擊事件
            toggle.addEventListener('click', () => {
                this.toggleCollapsible(section);
            });
        };

        // 設定伺服器和職業的折疊功能
        setupCollapsible('server');
        setupCollapsible('job');
    }

    initializeValidation() {
        // 輔助函數：為輸入框添加長度驗證
        const addValidation = (input, maxLength) => {
            input.addEventListener('input', () => {
                if (input.value.length > maxLength) {
                    input.value = input.value.substring(0, maxLength);
                }
            });
        };

        // 應用長度驗證
        addValidation(this.inputs.characterName, CharacterCardGenerator.CONSTANTS.MAX_NAME_LENGTH);
        addValidation(this.inputs.characterTitle, CharacterCardGenerator.CONSTANTS.MAX_TITLE_LENGTH);
        addValidation(this.inputs.freeCompany, CharacterCardGenerator.CONSTANTS.MAX_COMPANY_LENGTH);
    }

    // ===== 角色卡更新方法 =====

    updateCharacterCard() {
        const cardElements = this.getCardElements();

        // 更新角色名稱
        const characterName = this.inputs.characterName.value.trim() || CharacterCardGenerator.CONSTANTS.DEFAULT_CHARACTER_NAME;
        cardElements.characterName.forEach(el => el.textContent = characterName);

        // 更新稱號
        const characterTitle = this.inputs.characterTitle.value.trim();
        cardElements.characterTitle.forEach(el => {
            if (characterTitle) {
                el.textContent = `《${characterTitle}》`;
                el.style.display = 'inline';
            } else {
                el.style.display = 'none';
            }
        });

        // 更新伺服器
        const serverName = this.inputs.serverName.value;
        cardElements.serverName.forEach(el => {
            if (serverName) {
                el.textContent = serverName;
                el.style.display = 'inline';
            } else {
                el.style.display = 'none';
            }
        });

        // 更新職業
        const jobName = this.inputs.jobName.value || CharacterCardGenerator.CONSTANTS.DEFAULT_JOB_NAME;
        cardElements.jobName.forEach(el => el.textContent = jobName);

        // 更新職業圖示
        const jobIconPath = CharacterCardGenerator.CONSTANTS.JOB_ICONS[jobName];
        cardElements.jobIcon.forEach(el => {
            if (jobIconPath) {
                SecurityUtils.clearElement(el);
                const img = document.createElement('img');
                img.src = `../../${jobIconPath}`;
                img.alt = jobName;
                img.className = 'job-icon-img';
                el.appendChild(img);
            } else {
                // 回退到預設圖示
                el.textContent = CharacterCardGenerator.CONSTANTS.DEFAULT_JOB_ICON;
            }
        });

        // 更新部隊名稱
        const freeCompany = this.inputs.freeCompany.value.trim();
        cardElements.freeCompany.forEach(el => {
            if (freeCompany) {
                el.textContent = `《${freeCompany}》`;
                el.style.display = 'inline';
            } else {
                el.style.display = 'none';
            }
        });

        // 重新排列資訊行元素
        this.reorganizeInfoLine();

        // 更新版型
        const layout = this.inputs.cardLayout.value || CharacterCardGenerator.CONSTANTS.DEFAULT_LAYOUT;
        this.characterCard.className = `character-card layout-${layout}`;
        if (this.characterCard.classList.contains('has-background')) {
            this.characterCard.classList.add('has-background');
        }

        // 更新角色名稱顏色
        const nameColor = this.inputs.nameColor.value || CharacterCardGenerator.CONSTANTS.DEFAULT_NAME_COLOR;
        cardElements.characterName.forEach(el => {
            el.style.color = nameColor;
        });
    }

    getCardElements() {
        const isHorizontal = this.characterCard.classList.contains('layout-horizontal');
        const layoutSelector = isHorizontal ? '.horizontal-layout' : '.vertical-layout';

        return {
            characterName: this.characterCard.querySelectorAll(`${layoutSelector} .character-name`),
            characterTitle: this.characterCard.querySelectorAll(`${layoutSelector} .character-title`),
            serverName: this.characterCard.querySelectorAll(`${layoutSelector} .server-name`),
            jobName: this.characterCard.querySelectorAll(`${layoutSelector} .job-name`),
            jobIcon: this.characterCard.querySelectorAll(`${layoutSelector} .job-icon`),
            freeCompany: this.characterCard.querySelectorAll(`${layoutSelector} .company-name`)
        };
    }

    reorganizeInfoLine() {
        const infoLines = document.querySelectorAll('.info-line');
        infoLines.forEach(infoLine => {
            const titleElement = infoLine.querySelector('.character-title');
            const companyElement = infoLine.querySelector('.company-name');
            const serverElement = infoLine.querySelector('.server-name');
            const separators = infoLine.querySelectorAll('.separator');

            // 檢查哪些元素有內容
            const hasTitle = titleElement && titleElement.style.display !== 'none' &&
                           titleElement.textContent.trim() && titleElement.textContent.trim() !== '---';
            const hasCompany = companyElement && companyElement.style.display !== 'none' &&
                             companyElement.textContent.trim() && companyElement.textContent.trim() !== '---';
            const hasServer = serverElement && serverElement.style.display !== 'none' &&
                            serverElement.textContent.trim() &&
                            serverElement.textContent.trim() !== '伺服器';

            // 創建可見元素的數組
            const visibleElements = [];
            if (hasTitle) visibleElements.push('title');
            if (hasCompany) visibleElements.push('company');
            if (hasServer) visibleElements.push('server');

            // 隱藏所有分隔符號
            separators.forEach(sep => sep.style.display = 'none');

            // 如果只有一個或沒有元素，不需要分隔符號
            if (visibleElements.length <= 1) return;

            // 根據可見元素重新顯示相應的分隔符號
            if (visibleElements.length >= 2) {
                if (separators[0]) separators[0].style.display = 'inline';
            }
            if (visibleElements.length >= 3) {
                if (separators[1]) separators[1].style.display = 'inline';
            }
        });
    }

    switchLayout() {
        const layout = this.inputs.cardLayout.value || CharacterCardGenerator.CONSTANTS.DEFAULT_LAYOUT;

        // 移除舊的版型class
        this.characterCard.classList.remove('layout-horizontal', 'layout-vertical');

        // 添加新的版型class
        this.characterCard.classList.add(`layout-${layout}`);

        // 更新角色卡內容
        this.updateCharacterCard();
    }

    // ===== 圖片處理方法 =====

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 檢查檔案大小
        if (file.size > CharacterCardGenerator.CONSTANTS.MAX_IMAGE_SIZE) {
            FF14Utils.showToast('圖片檔案過大，請選擇小於 5MB 的圖片', 'error');
            return;
        }

        // 檢查檔案類型
        if (!file.type.startsWith('image/')) {
            FF14Utils.showToast('請選擇有效的圖片檔案', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.imageElements.backgroundImage.src = e.target.result;
            this.imageElements.backgroundImage.style.display = 'block';

            // 顯示編輯控制項
            this.imageElements.positionGroup.style.display = 'flex';
            this.imageElements.scaleGroup.style.display = 'flex';
            this.imageElements.rotateGroup.style.display = 'flex';
            this.imageElements.opacityGroup.style.display = 'flex';
            this.imageElements.actionGroup.style.display = 'flex';

            this.characterCard.classList.add('has-background');

            // 重置變換狀態
            this.resetImageTransform();
            // 立即應用背景透明度
            this.updateBackgroundOpacity();
            FF14Utils.showToast('圖片上傳成功！');
        };
        reader.readAsDataURL(file);
    }

    updateImageTransform() {
        const { x, y, scale, rotate } = this.state.imageTransform;
        const transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale}) rotate(${rotate}deg)`;
        this.imageElements.backgroundImage.style.transform = transform;
    }

    updateBackgroundOpacity() {
        const cardContent = this.characterCard.querySelector('.card-content');
        if (cardContent) {
            const opacityValue = this.state.imageTransform.opacity / 100;
            cardContent.style.backgroundColor = `rgba(0,0,0,${opacityValue})`;
        }
    }

    resetImageTransform() {
        this.state.imageTransform = {
            x: 0,
            y: 0,
            scale: 1,
            rotate: 0,
            opacity: CharacterCardGenerator.CONSTANTS.DEFAULT_OPACITY
        };

        this.imageElements.scaleSlider.value = 1;
        this.imageElements.rotateSlider.value = 0;
        this.imageElements.opacitySlider.value = CharacterCardGenerator.CONSTANTS.DEFAULT_OPACITY;
        this.imageElements.scaleValue.textContent = '100%';
        this.imageElements.rotateValue.textContent = '0°';
        this.imageElements.opacityValue.textContent = CharacterCardGenerator.CONSTANTS.DEFAULT_OPACITY + '%';

        this.updateImageTransform();
        this.updateBackgroundOpacity();
    }

    removeImage() {
        this.imageElements.backgroundImage.style.display = 'none';
        this.imageElements.backgroundImage.src = '';

        // 隱藏編輯控制項
        this.imageElements.positionGroup.style.display = 'none';
        this.imageElements.scaleGroup.style.display = 'none';
        this.imageElements.rotateGroup.style.display = 'none';
        this.imageElements.opacityGroup.style.display = 'none';
        this.imageElements.actionGroup.style.display = 'none';

        this.characterCard.classList.remove('has-background');
        this.inputs.characterImage.value = '';

        // 重置背景透明度
        const cardContent = this.characterCard.querySelector('.card-content');
        if (cardContent) {
            cardContent.style.backgroundColor = '';
        }

        this.resetImageTransform();
        FF14Utils.showToast('圖片已移除');
    }

    // ===== 拖拉功能方法 =====

    startDrag(e) {
        if (!this.imageElements.backgroundImage.src) return;

        this.state.dragging.isDragging = true;
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        this.state.dragging.lastX = clientX;
        this.state.dragging.lastY = clientY;

        this.characterCard.style.cursor = 'grabbing';

        // 動態附加 move 和 end 監聽器（只在拖拉期間）
        document.addEventListener('mousemove', this.handleDoDrag);
        document.addEventListener('mouseup', this.handleEndDrag);
        document.addEventListener('touchmove', this.handleDoDrag);
        document.addEventListener('touchend', this.handleEndDrag);

        e.preventDefault();
    }

    doDrag(e) {
        if (!this.state.dragging.isDragging) return;

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        const deltaX = clientX - this.state.dragging.lastX;
        const deltaY = clientY - this.state.dragging.lastY;

        this.state.imageTransform.x += deltaX;
        this.state.imageTransform.y += deltaY;

        this.state.dragging.lastX = clientX;
        this.state.dragging.lastY = clientY;

        this.updateImageTransform();
        e.preventDefault();
    }

    endDrag() {
        this.state.dragging.isDragging = false;
        this.characterCard.style.cursor = 'default';

        // 移除 move 和 end 監聽器（拖拉結束，不再需要）
        document.removeEventListener('mousemove', this.handleDoDrag);
        document.removeEventListener('mouseup', this.handleEndDrag);
        document.removeEventListener('touchmove', this.handleDoDrag);
        document.removeEventListener('touchend', this.handleEndDrag);
    }

    // ===== 伺服器選擇方法 =====

    showDatacenterSelection(region) {
        const datacenters = CharacterCardGenerator.CONSTANTS.SERVER_DATA[region];
        if (!datacenters) return;

        // 清空並重新生成資料中心按鈕
        SecurityUtils.clearElement(this.serverSelectionElements.datacenterGrid);

        Object.keys(datacenters).forEach(datacenter => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'selection-btn';
            button.dataset.datacenter = datacenter;
            button.textContent = datacenter;

            button.addEventListener('click', () => {
                // 更新選擇狀態
                this.state.serverSelection.datacenter = datacenter;
                this.state.serverSelection.server = null;

                // 更新按鈕狀態
                this.serverSelectionElements.datacenterGrid.querySelectorAll('.selection-btn').forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');

                // 顯示伺服器選擇
                this.showServerSelection(region, datacenter);

                // 隱藏結果
                this.serverSelectionElements.selectedServer.style.display = 'none';
            });

            this.serverSelectionElements.datacenterGrid.appendChild(button);
        });

        // 顯示資料中心步驟
        this.serverSelectionElements.datacenterStep.style.display = 'block';
    }

    showServerSelection(region, datacenter) {
        const servers = CharacterCardGenerator.CONSTANTS.SERVER_DATA[region][datacenter];
        if (!servers) return;

        // 清空並重新生成伺服器按鈕
        SecurityUtils.clearElement(this.serverSelectionElements.serverGrid);

        servers.forEach(server => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'selection-btn';
            button.dataset.server = server;
            button.textContent = server;

            button.addEventListener('click', () => {
                // 更新選擇狀態
                this.state.serverSelection.server = server;

                // 更新按鈕狀態
                this.serverSelectionElements.serverGrid.querySelectorAll('.selection-btn').forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');

                // 顯示選擇結果
                this.showSelectedServer(region, datacenter, server);

                // 更新隱藏的input值
                this.serverSelectionElements.hiddenInput.value = server;

                // 更新角色卡
                this.updateCharacterCard();

                // 自動折疊伺服器選擇區域
                this.autoCollapse('server');
            });

            this.serverSelectionElements.serverGrid.appendChild(button);
        });

        // 顯示伺服器步驟
        this.serverSelectionElements.serverStep.style.display = 'block';
    }

    showSelectedServer(region, datacenter, server) {
        const displayText = `${region} > ${datacenter} > ${server}`;
        this.serverSelectionElements.selectedServerName.textContent = displayText;
        this.serverSelectionElements.selectedServer.style.display = 'flex';
    }

    clearServerSelection() {
        // 重置選擇狀態
        this.state.serverSelection = { region: null, datacenter: null, server: null };

        // 清除所有選中狀態
        document.querySelectorAll('[data-region]').forEach(btn => btn.classList.remove('selected'));

        // 隱藏所有步驟
        this.serverSelectionElements.datacenterStep.style.display = 'none';
        this.serverSelectionElements.serverStep.style.display = 'none';
        this.serverSelectionElements.selectedServer.style.display = 'none';

        // 清空隱藏input
        this.serverSelectionElements.hiddenInput.value = '';

        // 更新角色卡
        this.updateCharacterCard();

        // 自動展開伺服器選擇區域
        if (this.state.collapsible.server) {
            this.toggleCollapsible('server');
        }
    }

    // ===== 職業選擇方法 =====

    showSelectedJob(job, category) {
        const displayText = `${category} - ${job}`;
        this.jobSelectionElements.selectedJobName.textContent = displayText;
        this.jobSelectionElements.selectedJob.style.display = 'flex';
    }

    clearJobSelection() {
        // 清除所有選中狀態
        this.jobSelectionElements.jobButtons.forEach(btn => btn.classList.remove('selected'));

        // 隱藏選擇結果
        this.jobSelectionElements.selectedJob.style.display = 'none';

        // 清空隱藏input
        this.jobSelectionElements.hiddenJobInput.value = '';

        // 更新角色卡
        this.updateCharacterCard();

        // 自動展開職業選擇區域
        if (this.state.collapsible.job) {
            this.toggleCollapsible('job');
        }
    }

    // ===== 可折疊區塊方法 =====

    toggleCollapsible(section) {
        const isCollapsed = this.state.collapsible[section];
        const content = this.collapsibleElements[`${section}Content`];
        const toggle = this.collapsibleElements[`${section}Toggle`];

        if (isCollapsed) {
            // 展開
            content.classList.remove('collapsed');
            toggle.classList.remove('collapsed');
            this.state.collapsible[section] = false;
        } else {
            // 折疊
            content.classList.add('collapsed');
            toggle.classList.add('collapsed');
            this.state.collapsible[section] = true;
        }
    }

    autoCollapse(section) {
        if (!this.state.collapsible[section]) {
            setTimeout(() => {
                this.toggleCollapsible(section);
            }, CharacterCardGenerator.CONSTANTS.AUTO_COLLAPSE_DELAY);
        }
    }

    // ===== 產生和下載方法 =====

    generateCard() {
        // 驗證必填欄位
        if (!this.inputs.characterName.value.trim()) {
            FF14Utils.showToast('請輸入角色名稱', 'error');
            this.inputs.characterName.focus();
            return;
        }

        if (!this.inputs.jobName.value) {
            FF14Utils.showToast('請選擇職業', 'error');
            return;
        }

        // 更新角色卡並顯示成功訊息
        this.updateCharacterCard();
        FF14Utils.showToast('角色卡已生成！');

        // 滾動到預覽區域
        if (this.sections.preview) {
            this.sections.preview.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }

    downloadCard() {
        // 檢查是否有有效的角色卡內容
        if (!this.inputs.characterName.value.trim()) {
            FF14Utils.showToast('請先產生角色卡', 'error');
            return;
        }

        // TODO: 實作圖片下載功能
        FF14Utils.showToast('下載功能開發中，敬請期待！');
    }
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    new CharacterCardGenerator();
});
