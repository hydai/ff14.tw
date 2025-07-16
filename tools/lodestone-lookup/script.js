class LodestoneCharacterLookup {
    constructor() {
        this.elements = {
            characterId: document.getElementById('characterId'),
            datacenterSelect: document.getElementById('datacenterSelect'),
            searchBtn: document.getElementById('searchBtn'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            errorMessage: document.getElementById('errorMessage'),
            characterInfo: document.getElementById('characterInfo'),
            // Character info elements
            characterAvatar: document.getElementById('characterAvatar'),
            characterName: document.getElementById('characterName'),
            characterTitle: document.getElementById('characterTitle'),
            characterServer: document.getElementById('characterServer'),
            characterDeity: document.getElementById('characterDeity'),
            characterCity: document.getElementById('characterCity'),
            fcName: document.getElementById('fcName'),
            fcIcon: document.getElementById('fcIcon'),
            characterPortrait: document.getElementById('characterPortrait'),
            jobLevels: document.getElementById('jobLevels'),
            lodestoneLink: document.getElementById('lodestoneLink'),
            // Stats
            hp: document.getElementById('hp'),
            mp: document.getElementById('mp'),
            attackPower: document.getElementById('attackPower'),
            defense: document.getElementById('defense'),
            attackMagicPotency: document.getElementById('attackMagicPotency'),
            magicDefense: document.getElementById('magicDefense'),
            // Sub stats
            strength: document.getElementById('strength'),
            dexterity: document.getElementById('dexterity'),
            vitality: document.getElementById('vitality'),
            intelligence: document.getElementById('intelligence'),
            mind: document.getElementById('mind'),
            criticalHit: document.getElementById('criticalHit'),
            determination: document.getElementById('determination'),
            directHit: document.getElementById('directHit'),
            skillSpeed: document.getElementById('skillSpeed'),
            spellSpeed: document.getElementById('spellSpeed'),
            piety: document.getElementById('piety'),
            tenacity: document.getElementById('tenacity'),
            // Other info
            grandCompany: document.getElementById('grandCompany'),
            nameday: document.getElementById('nameday'),
            bio: document.getElementById('bio'),
            equipmentInfo: document.getElementById('equipmentInfo'),
            dataTimestamp: document.getElementById('dataTimestamp'),
            updateTime: document.getElementById('updateTime'),
            // Achievements
            achievementsSection: document.getElementById('achievementsSection'),
            totalAchievements: document.getElementById('totalAchievements'),
            achievementPoints: document.getElementById('achievementPoints'),
            achievementsList: document.getElementById('achievementsList'),
            achievementsPagination: document.getElementById('achievementsPagination'),
            // Mounts
            mountsSection: document.getElementById('mountsSection'),
            mountsCount: document.getElementById('mountsCount'),
            mountsList: document.getElementById('mountsList'),
            // Minions
            minionsSection: document.getElementById('minionsSection'),
            minionsCount: document.getElementById('minionsCount'),
            minionsList: document.getElementById('minionsList'),
            // Free Company
            freeCompanySection: document.getElementById('freeCompanySection'),
            fcCrest: document.getElementById('fcCrest'),
            fcDetailName: document.getElementById('fcDetailName'),
            fcSlogan: document.getElementById('fcSlogan'),
            fcMemberCount: document.getElementById('fcMemberCount'),
            fcRank: document.getElementById('fcRank'),
            fcRecruitment: document.getElementById('fcRecruitment'),
            fcEstateInfo: document.getElementById('fcEstateInfo'),
            fcEstateName: document.getElementById('fcEstateName'),
            fcEstatePlot: document.getElementById('fcEstatePlot'),
            fcEstateGreeting: document.getElementById('fcEstateGreeting'),
            fcFocusList: document.getElementById('fcFocusList'),
            fcSeekingList: document.getElementById('fcSeekingList'),
            fcReputationList: document.getElementById('fcReputationList'),
            fcMembersList: document.getElementById('fcMembersList'),
            fcMembersPagination: document.getElementById('fcMembersPagination'),
            // Special Content
            specialContentSection: document.getElementById('specialContentSection'),
            specialContent: document.getElementById('specialContent'),
            // Tabs
            tabNavigation: document.getElementById('tabNavigation'),
            tabButtons: document.querySelectorAll('.tab-button'),
            tabPanes: document.querySelectorAll('.tab-pane')
        };
        
        this.currentAchievementPage = 1;
        this.currentFCId = null;

        this.initializeEvents();
    }

    initializeEvents() {
        this.elements.searchBtn.addEventListener('click', () => this.searchCharacter());
        this.elements.characterId.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchCharacter();
            }
        });

        // Only allow numbers in the input
        this.elements.characterId.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
        
        // Tab navigation
        this.elements.tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
    }
    
    switchTab(tabName) {
        // 更新按鈕狀態
        this.elements.tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // 更新分頁內容
        this.elements.tabPanes.forEach(pane => {
            const isActive = pane.id === `${tabName}Tab`;
            pane.classList.toggle('active', isActive);
        });
    }

    async searchCharacter() {
        const characterId = this.elements.characterId.value.trim();
        
        console.log('=== 開始查詢角色 ===');
        console.log('輸入的角色 ID:', characterId);
        
        if (!characterId) {
            this.showError('請輸入角色 ID');
            return;
        }

        if (!/^\d+$/.test(characterId)) {
            this.showError('角色 ID 必須是數字');
            return;
        }

        this.showLoading(true);
        this.hideError();
        this.hideCharacterInfo();

        const datacenter = this.elements.datacenterSelect.value;
        const apiUrl = `https://logstone.z54981220.workers.dev/character/${characterId}?dc=${datacenter}`;
        const jobApiUrl = `https://logstone.z54981220.workers.dev/character/${characterId}/classjob?dc=${datacenter}`;
        const achievementsApiUrl = `https://logstone.z54981220.workers.dev/character/${characterId}/achievements?page=1&dc=${datacenter}`;
        const mountsApiUrl = `https://logstone.z54981220.workers.dev/character/${characterId}/mounts?dc=${datacenter}`;
        const minionsApiUrl = `https://logstone.z54981220.workers.dev/character/${characterId}/minions?dc=${datacenter}`;
        
        console.log('API URLs (DC: ' + datacenter + '):', {
            character: apiUrl,
            job: jobApiUrl,
            achievements: achievementsApiUrl,
            mounts: mountsApiUrl,
            minions: minionsApiUrl
        });

        try {
            console.log('正在發送請求...');
            // 同時發送所有請求
            const [characterResponse, jobResponse, achievementsResponse, mountsResponse, minionsResponse] = await Promise.all([
                fetch(apiUrl),
                fetch(jobApiUrl),
                fetch(achievementsApiUrl),
                fetch(mountsApiUrl),
                fetch(minionsApiUrl)
            ]);
            
            console.log('Character Response 狀態:', characterResponse.status);
            console.log('Job Response 狀態:', jobResponse.status);
            
            if (!characterResponse.ok) {
                console.error('Character Response 不是 OK:', characterResponse.status, characterResponse.statusText);
                if (characterResponse.status === 404) {
                    throw new Error('找不到此角色，請確認 ID 是否正確');
                }
                throw new Error(`查詢失敗 (${characterResponse.status}): ${characterResponse.statusText}`);
            }

            const characterText = await characterResponse.text();
            console.log('原始角色回應內容:', characterText);
            
            let characterData;
            try {
                characterData = JSON.parse(characterText);
                console.log('解析後的角色 JSON 資料:', characterData);
            } catch (parseError) {
                console.error('角色 JSON 解析錯誤:', parseError);
                console.error('無法解析的內容:', characterText);
                throw new Error('伺服器回應格式錯誤');
            }
            
            // 處理職業資料（如果請求成功）
            let jobData = null;
            if (jobResponse.ok) {
                const jobText = await jobResponse.text();
                console.log('原始職業回應內容:', jobText);
                try {
                    const jobDataResponse = JSON.parse(jobText);
                    console.log('完整職業資料結構:', jobDataResponse);
                    jobData = jobDataResponse.data || jobDataResponse;  // 嘗試兩種可能的資料結構
                    console.log('解析後的職業 JSON 資料:', jobData);
                } catch (parseError) {
                    console.error('職業 JSON 解析錯誤:', parseError);
                    console.error('無法解析的內容:', jobText);
                    // 職業資料解析失敗不影響主要功能
                }
            } else {
                console.warn('無法取得職業資料:', jobResponse.status);
            }
            
            // 處理成就資料
            let achievementsData = null;
            if (achievementsResponse.ok) {
                try {
                    achievementsData = await achievementsResponse.json();
                    console.log('成就資料:', achievementsData);
                } catch (parseError) {
                    console.error('成就資料解析錯誤:', parseError);
                }
            }
            
            // 處理坐騎資料
            let mountsData = null;
            if (mountsResponse.ok) {
                try {
                    mountsData = await mountsResponse.json();
                    console.log('坐騎資料:', mountsData);
                } catch (parseError) {
                    console.error('坐騎資料解析錯誤:', parseError);
                }
            }
            
            // 處理寵物資料
            let minionsData = null;
            if (minionsResponse.ok) {
                try {
                    minionsData = await minionsResponse.json();
                    console.log('寵物資料:', minionsData);
                } catch (parseError) {
                    console.error('寵物資料解析錯誤:', parseError);
                }
            }
            
            if (characterData && characterData.Character) {
                console.log('準備顯示角色資料...');
                this.displayCharacterInfo(characterData.Character, jobData);
                
                // 顯示額外資料
                if (achievementsData) {
                    this.displayAchievements(achievementsData);
                }
                if (mountsData) {
                    this.displayMounts(mountsData);
                }
                if (minionsData) {
                    this.displayMinions(minionsData);
                }
                
                // 顯示分頁導航並創建總覽
                this.elements.tabNavigation.style.display = 'flex';
                this.createOverview(achievementsData, mountsData, minionsData);
                
                // 預設顯示總覽分頁
                this.switchTab('overview');
                
                // 顯示時間戳記（如果職業資料中有）
                if (jobData && jobData.timestamp) {
                    this.displayTimestamp(jobData.timestamp);
                }
            } else {
                console.error('資料格式錯誤或資料為空');
                console.error('預期格式: {Character: {...}}');
                throw new Error('無法取得角色資料');
            }
        } catch (error) {
            console.error('查詢過程發生錯誤:', error);
            console.error('錯誤詳情:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            this.showError(`錯誤: ${error.message}`);
        } finally {
            this.showLoading(false);
            console.log('=== 查詢結束 ===');
        }
    }

    displayCharacterInfo(character, jobData) {
        console.log('=== 顯示角色資料 ===');
        console.log('接收到的資料結構:', character);
        console.log('接收到的職業資料:', jobData);
        console.log('資料類型:', typeof character);
        console.log('資料的所有屬性:', Object.keys(character));
        
        // Basic info from Character object
        console.log('設定頭像:', character.Avatar);
        this.elements.characterAvatar.src = character.Avatar || '';
        this.elements.characterAvatar.alt = character.Name || '';
        
        console.log('設定名稱:', character.Name);
        this.elements.characterName.textContent = character.Name || '未知';
        
        console.log('設定稱號:', character.Title);
        this.elements.characterTitle.textContent = character.Title || '無稱號';
        
        // Portrait (立繪)
        if (character.Portrait) {
            console.log('設定立繪:', character.Portrait);
            this.elements.characterPortrait.src = character.Portrait;
            this.elements.characterPortrait.alt = `${character.Name} 立繪`;
            this.elements.characterPortrait.style.display = 'block';
        } else {
            this.elements.characterPortrait.style.display = 'none';
        }
        
        // Server info
        const serverInfo = character.Server;
        console.log('伺服器資訊:', serverInfo);
        if (serverInfo && serverInfo.World) {
            this.elements.characterServer.textContent = `${serverInfo.World} (${serverInfo.DC || '未知'})`;
        } else {
            this.elements.characterServer.textContent = '未知';
        }
        
        // Additional character info
        
        if (character.GuardianDeity && character.GuardianDeity.Name) {
            this.elements.characterDeity.textContent = character.GuardianDeity.Name;
        } else {
            this.elements.characterDeity.textContent = '未知';
        }
        
        if (character.Town && character.Town.Name) {
            this.elements.characterCity.textContent = character.Town.Name;
        } else {
            this.elements.characterCity.textContent = '未知';
        }
        
        // Free Company
        if (character.FreeCompany && character.FreeCompany.Name && character.FreeCompany.Name.ID) {
            const fcId = character.FreeCompany.Name.ID;
            this.elements.fcName.textContent = '載入公會資訊中...';
            this.elements.fcName.dataset.fcId = fcId;
            
            // 查詢公會詳細資訊
            this.loadFreeCompanyInfo(fcId);
            
            // Display FC icon if available
            if (character.FreeCompany.IconLayers) {
                const iconLayers = character.FreeCompany.IconLayers;
                // 使用 Bottom layer 作為主要圖標
                if (iconLayers.Bottom) {
                    this.elements.fcIcon.src = iconLayers.Bottom;
                    this.elements.fcIcon.alt = '公會圖標';
                    this.elements.fcIcon.style.display = 'inline-block';
                }
            }
        } else {
            this.elements.fcName.textContent = '無';
            this.elements.fcIcon.style.display = 'none';
        }
        
        // Job levels info
        if (jobData && jobData.ClassJobs) {
            this.displayJobLevels(jobData.ClassJobs);
        } else {
            // Fallback to displaying current job only
            this.elements.jobLevels.textContent = '';
            
            if (character.ActiveClassjobLevel && character.ActiveClassjobLevel.Level) {
                // Create job item container
                const jobItem = document.createElement('div');
                jobItem.className = 'job-item';
                
                // Create and set job icon
                const jobIcon = document.createElement('img');
                jobIcon.src = character.ActiveClassjob || '';
                jobIcon.alt = '當前職業';
                jobIcon.className = 'job-icon';
                
                // Create job details container
                const jobDetails = document.createElement('div');
                jobDetails.className = 'job-details';
                
                // Create job name
                const jobName = document.createElement('p');
                jobName.className = 'job-name';
                jobName.textContent = '當前職業';
                
                // Create job level
                const jobLevel = document.createElement('p');
                jobLevel.className = 'job-level';
                if (character.ActiveClassjobLevel.Level === '100') {
                    jobLevel.className += ' max-level';
                }
                jobLevel.textContent = `Lv. ${character.ActiveClassjobLevel.Level}`;
                
                // Assemble job item
                jobDetails.appendChild(jobName);
                jobDetails.appendChild(jobLevel);
                jobItem.appendChild(jobIcon);
                jobItem.appendChild(jobDetails);
                
                // Create note
                const note = document.createElement('p');
                note.style.marginTop = '1rem';
                note.style.color = 'var(--text-color-secondary)';
                note.textContent = '載入詳細職業列表中...';
                
                // Add to container
                this.elements.jobLevels.appendChild(jobItem);
                this.elements.jobLevels.appendChild(note);
            } else {
                const noData = document.createElement('p');
                noData.textContent = '職業等級資料暫不可用';
                this.elements.jobLevels.appendChild(noData);
            }
        }
        
        // Primary Stats
        this.elements.hp.textContent = character.Hp || '0';
        this.elements.mp.textContent = `${character.MpGpCp || '0'} ${character.MpGpCpParameterName || ''}`;
        this.elements.attackPower.textContent = character.AttackPower || '0';
        this.elements.defense.textContent = character.Defense || '0';
        this.elements.attackMagicPotency.textContent = character.AttackMagicPotency || '0';
        this.elements.magicDefense.textContent = character.MagicDefense || '0';
        
        // Sub Stats
        this.elements.strength.textContent = character.Strength || '0';
        this.elements.dexterity.textContent = character.Dexterity || '0';
        this.elements.vitality.textContent = character.Vitality || '0';
        this.elements.intelligence.textContent = character.Intelligence || '0';
        this.elements.mind.textContent = character.Mind || '0';
        this.elements.criticalHit.textContent = character.CriticalHitRate || '0';
        this.elements.determination.textContent = character.Determination || '0';
        this.elements.directHit.textContent = character.DirectHitRate || '0';
        this.elements.skillSpeed.textContent = character.SkillSpeed || '0';
        this.elements.spellSpeed.textContent = character.SpellSpeed || '0';
        this.elements.piety.textContent = character.Piety || '0';
        this.elements.tenacity.textContent = character.Tenacity || '0';
        
        // Other Info
        if (character.GrandCompany && character.GrandCompany.Name) {
            this.elements.grandCompany.textContent = `${character.GrandCompany.Name}${character.GrandCompany.Rank ? ' - ' + character.GrandCompany.Rank : ''}`;
        } else {
            this.elements.grandCompany.textContent = '無';
        }
        
        this.elements.nameday.textContent = character.Nameday || '未知';
        this.elements.bio.textContent = character.Bio || '無';
        
        // Equipment Info
        this.displayEquipment(character);

        // Lodestone link
        const lodestoneUrl = `https://na.finalfantasyxiv.com/lodestone/character/${character.ID}/`;
        console.log('Lodestone 連結:', lodestoneUrl);
        this.elements.lodestoneLink.href = lodestoneUrl;

        console.log('顯示角色資訊區塊');
        this.showCharacterInfo();
        console.log('=== 顯示完成 ===');
    }

    displayEquipment(character) {
        // Clear existing content
        this.elements.equipmentInfo.textContent = '';
        
        const equipmentSlots = [
            { key: 'Mainhand', label: '主手' },
            { key: 'Head', label: '頭部' },
            { key: 'Body', label: '身體' },
            { key: 'Hands', label: '手部' },
            { key: 'Legs', label: '腿部' },
            { key: 'Feet', label: '腳部' },
            { key: 'Earrings', label: '耳環' },
            { key: 'Necklace', label: '項鍊' },
            { key: 'Bracelets', label: '手鐲' },
            { key: 'Ring1', label: '戒指1' },
            { key: 'Ring2', label: '戒指2' },
            { key: 'Soulcrystal', label: '靈魂水晶' }
        ];
        
        equipmentSlots.forEach(slot => {
            const equipment = character[slot.key];
            if (equipment && equipment.Name) {
                const equipItem = document.createElement('div');
                equipItem.className = 'equipment-item';
                
                const label = document.createElement('strong');
                label.textContent = `${slot.label}：`;
                
                const name = document.createElement('span');
                name.textContent = equipment.Name;
                
                if (equipment.MirageName && equipment.MirageName !== equipment.Name) {
                    const mirage = document.createElement('span');
                    mirage.className = 'mirage-name';
                    mirage.textContent = ` (幻化: ${equipment.MirageName})`;
                    name.appendChild(mirage);
                }
                
                // Display stain info if available
                if (equipment.Stain && equipment.Stain !== '') {
                    const stain = document.createElement('span');
                    stain.className = 'stain-info';
                    stain.textContent = ` [已染色]`;
                    stain.title = `染料: ${equipment.Stain}`;
                    name.appendChild(stain);
                }
                
                equipItem.appendChild(label);
                equipItem.appendChild(name);
                this.elements.equipmentInfo.appendChild(equipItem);
            }
        });
        
        if (this.elements.equipmentInfo.children.length === 0) {
            const noData = document.createElement('p');
            noData.textContent = '無裝備資料';
            this.elements.equipmentInfo.appendChild(noData);
        }
    }

    displayJobLevels(classJobs) {
        // Clear existing content
        this.elements.jobLevels.textContent = '';
        
        if (!classJobs) {
            const noData = document.createElement('p');
            noData.textContent = '無職業資料';
            this.elements.jobLevels.appendChild(noData);
            return;
        }
        
        // 創建統一的職業網格容器
        const jobGrid = document.createElement('div');
        jobGrid.className = 'job-levels-grid-unified';

        // 職業中文名稱對照
        const jobNames = {
            'Paladin': '騎士',
            'Warrior': '戰士',
            'Dark Knight': '暗黑騎士',
            'Gunbreaker': '絕槍戰士',
            'White Mage': '白魔道士',
            'Scholar': '學者',
            'Astrologian': '占星術士',
            'Sage': '賢者',
            'Monk': '武僧',
            'Dragoon': '龍騎士',
            'Ninja': '忍者',
            'Samurai': '武士',
            'Reaper': '鐮刀師',
            'Viper': '毒蛇使',
            'Bard': '吟遊詩人',
            'Machinist': '機工士',
            'Dancer': '舞者',
            'Black Mage': '黑魔道士',
            'Summoner': '召喚士',
            'Red Mage': '赤魔道士',
            'Pictomancer': '繪靈法師',
            'Blue Mage': '青魔道士',
            'Carpenter': '刻木匠',
            'Blacksmith': '鍛鐵匠',
            'Armorer': '鎧甲匠',
            'Goldsmith': '雕金匠',
            'Leatherworker': '製革匠',
            'Weaver': '裁縫匠',
            'Alchemist': '煉金術士',
            'Culinarian': '烹調師',
            'Miner': '採礦工',
            'Botanist': '園藝工',
            'Fisher': '捕魚人'
        };

        // 處理戰鬥職業 - 依照原本的分類順序，但不顯示分類標題
        if (classJobs.CombatJobs) {
            const combatCategories = [
                { class: 'tank', data: classJobs.CombatJobs.Tank },
                { class: 'healer', data: classJobs.CombatJobs.Healer },
                { class: 'melee', data: classJobs.CombatJobs.MeleeDPS },
                { class: 'ranged', data: classJobs.CombatJobs.RangedDPS },
                { class: 'magic', data: classJobs.CombatJobs.MagicalDPS }
            ];

            combatCategories.forEach(category => {
                if (category.data) {
                    this.displayJobsInUnifiedGrid(jobGrid, category.data, category.class, jobNames);
                }
            });
        }

        // 處理生產職業
        if (classJobs.CraftingJobs) {
            this.displayJobsInUnifiedGrid(jobGrid, classJobs.CraftingJobs, 'crafting', jobNames);
        }

        // 處理採集職業
        if (classJobs.GatheringJobs) {
            this.displayJobsInUnifiedGrid(jobGrid, classJobs.GatheringJobs, 'gathering', jobNames);
        }
        
        this.elements.jobLevels.appendChild(jobGrid);

        // 處理特殊內容 (Eureka/Bozja) - 移到獨立區塊
        if (classJobs.SpecialContent && (classJobs.SpecialContent.Eureka || classJobs.SpecialContent.Bozja)) {
            this.displaySpecialContent(classJobs.SpecialContent);
        }
    }

    displayJobsInUnifiedGrid(jobGrid, jobs, categoryClass, jobNames) {
        const jobEntries = Object.entries(jobs).filter(([_, job]) => job && job.Level && parseInt(job.Level) > 0);
        
        if (jobEntries.length === 0) return;

        // 不排序，保持原本的順序
        jobEntries.forEach(([jobKey, job]) => {
            const jobItem = document.createElement('div');
            jobItem.className = `job-item job-category-${categoryClass}`;
            
            // 創建職業圖標
            const jobIcon = document.createElement('img');
            jobIcon.className = 'job-icon';
            const displayName = job.UnlockState || jobKey;
            const chineseName = jobNames[displayName] || displayName;
            
            // 根據職業名稱找到對應的圖標路徑
            jobIcon.src = this.getJobIconPath(displayName);
            jobIcon.alt = chineseName;
            
            // 如果圖標載入失敗，使用文字圖標作為後備
            jobIcon.addEventListener('error', function() {
                const textIcon = document.createElement('div');
                textIcon.className = 'job-icon-text';
                textIcon.textContent = chineseName.charAt(0);
                this.parentNode.replaceChild(textIcon, this);
            });
            
            const jobDetails = document.createElement('div');
            jobDetails.className = 'job-details';
            
            const jobName = document.createElement('p');
            jobName.className = 'job-name';
            jobName.textContent = chineseName;
            
            const jobLevel = document.createElement('p');
            const level = parseInt(job.Level);
            jobLevel.className = level === 100 ? 'job-level max-level' : 'job-level';
            jobLevel.textContent = `Lv. ${job.Level}`;
            
            // 如果有經驗值資訊且未滿級，顯示進度條
            if (job.CurrentEXP && job.MaxEXP && job.CurrentEXP !== '--' && level < 100) {
                const currentExp = parseInt(job.CurrentEXP.replace(/,/g, ''));
                const maxExp = parseInt(job.MaxEXP.replace(/,/g, ''));
                if (!isNaN(currentExp) && !isNaN(maxExp) && maxExp > 0) {
                    const progressBar = document.createElement('div');
                    progressBar.className = 'exp-progress';
                    const progress = document.createElement('div');
                    progress.className = 'exp-progress-bar';
                    progress.style.width = `${(currentExp / maxExp) * 100}%`;
                    progressBar.appendChild(progress);
                    jobDetails.appendChild(progressBar);
                }
            }
            
            jobDetails.appendChild(jobName);
            jobDetails.appendChild(jobLevel);
            jobItem.appendChild(jobIcon);
            jobItem.appendChild(jobDetails);
            
            jobGrid.appendChild(jobItem);
        });
    }

    displaySpecialContent(specialContent) {
        if (!specialContent || Object.keys(specialContent).length === 0) return;

        // 清空特殊內容區域
        this.elements.specialContent.textContent = '';

        // 創建網格容器
        const contentGrid = document.createElement('div');
        contentGrid.className = 'job-levels-grid job-category-special';

        // 處理 Eureka（元素等級）
        if (specialContent.Eureka) {
            const eurekaItem = this.createSpecialContentItem(
                'Eureka',
                'Elemental Level',  // 固定為正確的名稱
                specialContent.Eureka.Level,
                specialContent.Eureka.CurrentEXP,
                null  // Eureka 使用 CurrentEXP 但不顯示 MaxEXP
            );
            contentGrid.appendChild(eurekaItem);
        }

        // 處理 Bozja（抵抗軍階級）
        if (specialContent.Bozja) {
            const bozjaItem = this.createSpecialContentItem(
                'Bozja',
                'Resistance Rank',  // 固定為正確的名稱
                specialContent.Bozja.Level,
                specialContent.Bozja.Mettle,
                null
            );
            contentGrid.appendChild(bozjaItem);
        }

        this.elements.specialContent.appendChild(contentGrid);
        
        // 顯示特殊內容區塊
        this.elements.specialContentSection.style.display = 'block';
    }

    createSpecialContentItem(area, name, level, current, max) {
        const item = document.createElement('div');
        item.className = 'job-item';
        
        const icon = document.createElement('div');
        icon.className = 'job-icon-text';
        icon.style.background = '#ffc107';
        icon.textContent = area.charAt(0);
        
        const details = document.createElement('div');
        details.className = 'job-details';
        
        const itemName = document.createElement('p');
        itemName.className = 'job-name';
        itemName.textContent = `${area} - ${name}`;
        
        const itemLevel = document.createElement('p');
        itemLevel.className = 'job-level';
        itemLevel.textContent = `Lv. ${level}`;
        
        details.appendChild(itemName);
        details.appendChild(itemLevel);
        
        // 如果有額外資訊，顯示
        if (current) {
            const info = document.createElement('p');
            info.className = 'job-extra-info';
            info.style.fontSize = '0.8rem';
            info.style.color = 'var(--text-color-secondary)';
            
            // 根據區域決定顯示格式
            if (area === 'Eureka') {
                info.textContent = `EXP: ${current}`;
            } else if (area === 'Bozja') {
                info.textContent = `Mettle: ${current}`;
            } else if (max) {
                info.textContent = `EXP: ${current} / ${max}`;
            } else {
                info.textContent = current;
            }
            details.appendChild(info);
        }
        
        item.appendChild(icon);
        item.appendChild(details);
        
        return item;
    }

    showLoading(show) {
        this.elements.loadingIndicator.classList.toggle('hidden', !show);
        this.elements.searchBtn.disabled = show;
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.classList.remove('hidden');
    }

    hideError() {
        this.elements.errorMessage.classList.add('hidden');
    }

    showCharacterInfo() {
        this.elements.characterInfo.classList.remove('hidden');
    }

    hideCharacterInfo() {
        this.elements.characterInfo.classList.add('hidden');
    }

    displayTimestamp(timestamp) {
        if (!timestamp) return;
        
        const date = new Date(timestamp);
        const formattedDate = date.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        this.elements.updateTime.textContent = formattedDate;
        this.elements.dataTimestamp.style.display = 'block';
    }

    getJobIconPath(jobName) {
        // 基礎路徑
        const basePath = '../../assets/images/se/FFXIVJobIcons/';
        
        // 將職業名稱標準化（移除空格）
        const normalizedName = jobName.replace(/\s+/g, '');
        
        // 職業分類對應
        const jobCategories = {
            // 坦克
            'Paladin': '01_TANK/Job/Paladin.png',
            'Warrior': '01_TANK/Job/Warrior.png',
            'DarkKnight': '01_TANK/Job/DarkKnight.png',
            'Gunbreaker': '01_TANK/Job/Gunbreaker.png',
            // 治療
            'WhiteMage': '02_HEALER/Job/WhiteMage.png',
            'Scholar': '02_HEALER/Job/Scholar.png',
            'Astrologian': '02_HEALER/Job/Astrologian.png',
            'Sage': '02_HEALER/Job/Sage.png',
            // DPS
            'Monk': '03_DPS/Job/Monk.png',
            'Dragoon': '03_DPS/Job/Dragoon.png',
            'Ninja': '03_DPS/Job/Ninja.png',
            'Samurai': '03_DPS/Job/Samurai.png',
            'Reaper': '03_DPS/Job/Reaper.png',
            'Viper': '03_DPS/Job/Viper.png',
            'Bard': '03_DPS/Job/Bard.png',
            'Machinist': '03_DPS/Job/Machinist.png',
            'Dancer': '03_DPS/Job/Dancer.png',
            'BlackMage': '03_DPS/Job/BlackMage.png',
            'Summoner': '03_DPS/Job/Summoner.png',
            'RedMage': '03_DPS/Job/RedMage.png',
            'Pictomancer': '03_DPS/Job/Pictomancer.png',
            'BlueMage': '06_LIMITED/BlueMage.png',
            // 生產
            'Carpenter': '04_CRAFTER/Carpenter.png',
            'Blacksmith': '04_CRAFTER/Blacksmith.png',
            'Armorer': '04_CRAFTER/Armorer.png',
            'Goldsmith': '04_CRAFTER/Goldsmith.png',
            'Leatherworker': '04_CRAFTER/Leatherworker.png',
            'Weaver': '04_CRAFTER/Weaver.png',
            'Alchemist': '04_CRAFTER/Alchemist.png',
            'Culinarian': '04_CRAFTER/Culinarian.png',
            // 採集
            'Miner': '05_GATHERER/Miner.png',
            'Botanist': '05_GATHERER/Botanist.png',
            'Fisher': '05_GATHERER/Fisher.png'
        };
        
        return basePath + (jobCategories[normalizedName] || '00_ROLE/DPSRole.png');
    }
    
    displayAchievements(data) {
        console.log('顯示成就資料:', data);
        
        // 顯示成就統計
        this.elements.totalAchievements.textContent = data.TotalAchievements || '0';
        this.elements.achievementPoints.textContent = data.AchievementPoints || '0';
        
        // 清空並顯示成就列表
        this.elements.achievementsList.textContent = '';
        
        if (data.Achievements && data.Achievements.length > 0) {
            data.Achievements.forEach(achievement => {
                const achievementItem = document.createElement('div');
                achievementItem.className = 'achievement-item';
                
                const name = document.createElement('p');
                name.className = 'achievement-name';
                name.textContent = achievement.Name || '未知成就';
                
                achievementItem.appendChild(name);
                this.elements.achievementsList.appendChild(achievementItem);
            });
            
            // 顯示分頁
            if (data.Pagination) {
                this.displayAchievementsPagination(data.Pagination, data.CharacterID);
            }
        } else {
            const noData = document.createElement('p');
            noData.textContent = '暫無成就資料';
            this.elements.achievementsList.appendChild(noData);
        }
    }
    
    displayAchievementsPagination(pagination, characterId) {
        this.elements.achievementsPagination.textContent = '';
        
        const paginationInfo = document.createElement('div');
        paginationInfo.className = 'pagination-info';
        paginationInfo.textContent = `第 ${pagination.Page} 頁，共 ${pagination.PageTotal} 頁`;
        
        const paginationButtons = document.createElement('div');
        paginationButtons.className = 'pagination-buttons';
        
        if (pagination.PagePrev) {
            const prevBtn = document.createElement('button');
            prevBtn.textContent = '上一頁';
            prevBtn.onclick = () => this.loadAchievementsPage(characterId, pagination.PagePrev);
            paginationButtons.appendChild(prevBtn);
        }
        
        if (pagination.PageNext) {
            const nextBtn = document.createElement('button');
            nextBtn.textContent = '下一頁';
            nextBtn.onclick = () => this.loadAchievementsPage(characterId, pagination.PageNext);
            paginationButtons.appendChild(nextBtn);
        }
        
        this.elements.achievementsPagination.appendChild(paginationInfo);
        this.elements.achievementsPagination.appendChild(paginationButtons);
    }
    
    async loadAchievementsPage(characterId, page) {
        try {
            const datacenter = this.elements.datacenterSelect.value;
            const response = await fetch(`https://logstone.z54981220.workers.dev/character/${characterId}/achievements?page=${page}&dc=${datacenter}`);
            if (response.ok) {
                const data = await response.json();
                this.displayAchievements(data);
            }
        } catch (error) {
            console.error('載入成就頁面失敗:', error);
        }
    }
    
    displayMounts(data) {
        console.log('顯示坐騎資料:', data);
        
        // 顯示坐騎數量
        const mountCount = data.Mounts ? data.Mounts.length : 0;
        this.elements.mountsCount.textContent = mountCount;
        
        // 清空並顯示坐騎列表
        this.elements.mountsList.textContent = '';
        
        if (data.Mounts && data.Mounts.length > 0) {
            data.Mounts.forEach(mount => {
                const mountItem = document.createElement('div');
                mountItem.className = 'mount-item';
                
                if (mount.Icon) {
                    const icon = document.createElement('img');
                    icon.src = mount.Icon;
                    icon.alt = mount.Name || '未知坐騎';
                    icon.className = 'mount-icon';
                    mountItem.appendChild(icon);
                }
                
                // 暫時隱藏坐騎名稱，因為是 name-hash
                // const name = document.createElement('p');
                // name.className = 'mount-name';
                // name.textContent = mount.Name || '未知坐騎';
                // mountItem.appendChild(name);
                this.elements.mountsList.appendChild(mountItem);
            });
        } else {
            const noData = document.createElement('p');
            noData.textContent = '暫無坐騎資料';
            this.elements.mountsList.appendChild(noData);
        }
    }
    
    displayMinions(data) {
        console.log('顯示寵物資料:', data);
        
        // 顯示寵物數量
        const minionCount = data.Minions ? data.Minions.length : 0;
        this.elements.minionsCount.textContent = minionCount;
        
        // 清空並顯示寵物列表
        this.elements.minionsList.textContent = '';
        
        if (data.Minions && data.Minions.length > 0) {
            data.Minions.forEach(minion => {
                const minionItem = document.createElement('div');
                minionItem.className = 'minion-item';
                
                if (minion.Icon) {
                    const icon = document.createElement('img');
                    icon.src = minion.Icon;
                    icon.alt = minion.Name || '未知寵物';
                    icon.className = 'minion-icon';
                    minionItem.appendChild(icon);
                }
                
                // 暫時隱藏寵物名稱，因為是 name-hash
                // const name = document.createElement('p');
                // name.className = 'minion-name';
                // name.textContent = minion.Name || '未知寵物';
                // minionItem.appendChild(name);
                this.elements.minionsList.appendChild(minionItem);
            });
        } else {
            const noData = document.createElement('p');
            noData.textContent = '暫無寵物資料';
            this.elements.minionsList.appendChild(noData);
        }
    }
    
    async loadFreeCompanyInfo(fcId) {
        try {
            this.currentFCId = fcId;
            const datacenter = this.elements.datacenterSelect.value;
            
            // 同時載入公會資訊和成員列表
            const [fcResponse, membersResponse] = await Promise.all([
                fetch(`https://logstone.z54981220.workers.dev/freecompany/${fcId}?dc=${datacenter}`),
                fetch(`https://logstone.z54981220.workers.dev/freecompany/${fcId}/members?page=1&dc=${datacenter}`)
            ]);
            
            if (fcResponse.ok) {
                const data = await fcResponse.json();
                console.log('公會資料:', data);
                if (data.FreeCompany) {
                    this.displayFreeCompanyInfo(data.FreeCompany);
                    // 更新頂部的公會名稱為可點擊連結
                    this.elements.fcName.textContent = data.FreeCompany.Name || '未知公會';
                    this.elements.fcName.style.cursor = 'pointer';
                    this.elements.fcName.style.color = 'var(--primary-color)';
                    this.elements.fcName.onclick = () => {
                        document.getElementById('freeCompanySection').scrollIntoView({ behavior: 'smooth' });
                    };
                }
            }
            
            if (membersResponse.ok) {
                const membersData = await membersResponse.json();
                console.log('公會成員資料:', membersData);
                this.displayFreeCompanyMembers(membersData);
            }
        } catch (error) {
            console.error('載入公會資訊失敗:', error);
            this.elements.fcName.textContent = '公會資訊載入失敗';
        }
    }
    
    displayFreeCompanyInfo(fc) {
        console.log('顯示公會資訊:', fc);
        
        // 顯示公會徽章
        if (fc.CrestLayers && fc.CrestLayers.length > 0) {
            this.elements.fcCrest.textContent = '';
            fc.CrestLayers.forEach(layer => {
                const img = document.createElement('img');
                img.src = layer;
                img.className = 'fc-crest-layer';
                this.elements.fcCrest.appendChild(img);
            });
        }
        
        // 基本資訊
        this.elements.fcDetailName.textContent = fc.Name || '未知公會';
        this.elements.fcSlogan.textContent = fc.Slogan || '無標語';
        this.elements.fcMemberCount.textContent = fc.ActiveMemberCount || '0';
        this.elements.fcRank.textContent = fc.Rank || '--';
        this.elements.fcRecruitment.textContent = fc.Recruitment === 'Open' ? '開放' : '關閉';
        
        // 房屋資訊
        if (fc.Estate && fc.Estate.Plot) {
            this.elements.fcEstateName.textContent = fc.Estate.Name || '未命名';
            this.elements.fcEstatePlot.textContent = fc.Estate.Plot;
            this.elements.fcEstateGreeting.textContent = fc.Estate.Greeting || '無歡迎詞';
            this.elements.fcEstateInfo.style.display = 'block';
        }
        
        // 公會目標
        this.elements.fcFocusList.textContent = '';
        if (fc.Focus && fc.Focus.length > 0) {
            fc.Focus.forEach(focus => {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.textContent = this.translateFocusTag(focus);
                this.elements.fcFocusList.appendChild(tag);
            });
        }
        
        // 招募對象
        this.elements.fcSeekingList.textContent = '';
        if (fc.Seeking && fc.Seeking.length > 0) {
            fc.Seeking.forEach(seeking => {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.textContent = this.translateSeekingTag(seeking);
                this.elements.fcSeekingList.appendChild(tag);
            });
        }
        
        // 聲望
        this.elements.fcReputationList.textContent = '';
        if (fc.Reputation) {
            ['ADDERS', 'FLAMES', 'MAELSTROM'].forEach(key => {
                const rep = fc.Reputation[key];
                if (rep) {
                    const repItem = this.createReputationItem(rep);
                    this.elements.fcReputationList.appendChild(repItem);
                }
            });
        }
    }
    
    translateFocusTag(tag) {
        const translations = {
            'Casual': '休閒',
            'Dungeons': '副本',
            'Leveling': '練級',
            'Raids': '團隊戰',
            'Trials': '討伐戰',
            'Guildhests': '公會令',
            'Role-playing': '角色扮演',
            'Questing': '任務',
            'Crafting': '生產',
            'Gathering': '採集',
            'PvP': 'PvP'
        };
        return translations[tag] || tag;
    }
    
    translateSeekingTag(tag) {
        const translations = {
            'Tank': '坦克',
            'Healer': '治療',
            'DPS': 'DPS',
            'Crafter': '生產職',
            'Gatherer': '採集職'
        };
        return translations[tag] || tag;
    }
    
    createReputationItem(rep) {
        const container = document.createElement('div');
        container.className = 'reputation-item';
        
        const name = document.createElement('div');
        name.className = 'reputation-name';
        name.textContent = this.translateGrandCompany(rep.NAME);
        
        const rank = document.createElement('div');
        rank.className = 'reputation-rank';
        rank.textContent = this.translateReputationRank(rep.RANK);
        
        const progressBar = document.createElement('div');
        progressBar.className = 'reputation-progress';
        
        const progressFill = document.createElement('div');
        progressFill.className = 'reputation-progress-fill';
        progressFill.style.width = `${rep.PROGRESS.Progress || 0}%`;
        
        progressBar.appendChild(progressFill);
        
        container.appendChild(name);
        container.appendChild(rank);
        container.appendChild(progressBar);
        
        return container;
    }
    
    translateGrandCompany(name) {
        const translations = {
            'Order of the Twin Adder': '雙蛇黨',
            'Immortal Flames': '恆輝隊',
            'Maelstrom': '黑渦團'
        };
        return translations[name] || name;
    }
    
    translateReputationRank(rank) {
        const translations = {
            'Neutral': '中立',
            'Friendly': '友好',
            'Trusted': '信賴',
            'Respected': '敬重',
            'Honored': '崇敬',
            'Allied': '同盟'
        };
        return translations[rank] || rank;
    }
    
    displayFreeCompanyMembers(data) {
        console.log('顯示公會成員:', data);
        
        // 清空成員列表
        this.elements.fcMembersList.textContent = '';
        
        if (data.Members && data.Members.length > 0) {
            data.Members.forEach(member => {
                const memberItem = document.createElement('div');
                memberItem.className = 'member-item';
                
                // 頭像
                const avatar = document.createElement('img');
                avatar.src = member.Avatar;
                avatar.alt = member.Name;
                avatar.className = 'member-avatar';
                
                // 成員資訊容器
                const memberInfo = document.createElement('div');
                memberInfo.className = 'member-info';
                
                // 名稱（可點擊查看角色）
                const name = document.createElement('a');
                name.className = 'member-name';
                name.textContent = member.Name;
                name.href = '#';
                name.onclick = (e) => {
                    e.preventDefault();
                    // 將角色 ID 填入查詢框並查詢
                    this.elements.characterId.value = member.ID;
                    this.searchCharacter();
                };
                
                // 公會階級
                const fcRank = document.createElement('div');
                fcRank.className = 'member-fc-rank';
                
                if (member.FCRankIcon) {
                    const fcRankIcon = document.createElement('img');
                    fcRankIcon.src = member.FCRankIcon;
                    fcRankIcon.alt = member.FCRank;
                    fcRankIcon.className = 'rank-icon';
                    fcRank.appendChild(fcRankIcon);
                }
                
                const fcRankText = document.createElement('span');
                fcRankText.textContent = member.FCRank;
                fcRank.appendChild(fcRankText);
                
                // 大國防軍階級
                const gcRank = document.createElement('div');
                gcRank.className = 'member-gc-rank';
                
                if (member.RankIcon) {
                    const gcRankIcon = document.createElement('img');
                    gcRankIcon.src = member.RankIcon;
                    gcRankIcon.alt = member.Rank;
                    gcRankIcon.className = 'rank-icon';
                    gcRank.appendChild(gcRankIcon);
                }
                
                const gcRankText = document.createElement('span');
                gcRankText.textContent = member.Rank;
                gcRank.appendChild(gcRankText);
                
                // 組裝成員資訊
                memberInfo.appendChild(name);
                memberInfo.appendChild(fcRank);
                memberInfo.appendChild(gcRank);
                
                memberItem.appendChild(avatar);
                memberItem.appendChild(memberInfo);
                
                this.elements.fcMembersList.appendChild(memberItem);
            });
            
            // 顯示分頁
            if (data.Pagination && data.Pagination.PageTotal > 1) {
                this.displayFCMembersPagination(data.Pagination);
            }
        } else {
            const noData = document.createElement('p');
            noData.textContent = '暫無成員資料';
            this.elements.fcMembersList.appendChild(noData);
        }
    }
    
    displayFCMembersPagination(pagination) {
        this.elements.fcMembersPagination.textContent = '';
        
        const paginationInfo = document.createElement('div');
        paginationInfo.className = 'pagination-info';
        paginationInfo.textContent = `第 ${pagination.Page} 頁，共 ${pagination.PageTotal} 頁`;
        
        const paginationButtons = document.createElement('div');
        paginationButtons.className = 'pagination-buttons';
        
        if (pagination.Page > 1) {
            const prevBtn = document.createElement('button');
            prevBtn.textContent = '上一頁';
            prevBtn.onclick = () => this.loadFCMembersPage(pagination.Page - 1);
            paginationButtons.appendChild(prevBtn);
        }
        
        if (pagination.Page < pagination.PageTotal) {
            const nextBtn = document.createElement('button');
            nextBtn.textContent = '下一頁';
            nextBtn.onclick = () => this.loadFCMembersPage(pagination.Page + 1);
            paginationButtons.appendChild(nextBtn);
        }
        
        this.elements.fcMembersPagination.appendChild(paginationInfo);
        this.elements.fcMembersPagination.appendChild(paginationButtons);
    }
    
    async loadFCMembersPage(page) {
        if (!this.currentFCId) return;
        
        try {
            const datacenter = this.elements.datacenterSelect.value;
            const response = await fetch(`https://logstone.z54981220.workers.dev/freecompany/${this.currentFCId}/members?page=${page}&dc=${datacenter}`);
            if (response.ok) {
                const data = await response.json();
                this.displayFreeCompanyMembers(data);
            }
        } catch (error) {
            console.error('載入公會成員頁面失敗:', error);
        }
    }
    
    createOverview(achievementsData, mountsData, minionsData) {
        const overviewTab = document.getElementById('overviewTab');
        overviewTab.textContent = '';
        
        const overviewGrid = document.createElement('div');
        overviewGrid.className = 'overview-grid';
        
        // 成就統計
        const achievementCard = document.createElement('div');
        achievementCard.className = 'overview-card';
        
        // 建立 h4 標題
        const achievementTitle = document.createElement('h4');
        achievementTitle.textContent = '成就';
        achievementCard.appendChild(achievementTitle);
        
        // 建立總成就數統計
        const totalAchievementsStat = document.createElement('div');
        totalAchievementsStat.className = 'overview-stat';
        const totalAchievementsValue = document.createElement('span');
        totalAchievementsValue.className = 'stat-value';
        totalAchievementsValue.textContent = achievementsData?.TotalAchievements || 0;
        const totalAchievementsLabel = document.createElement('span');
        totalAchievementsLabel.className = 'stat-label';
        totalAchievementsLabel.textContent = '總成就數';
        totalAchievementsStat.appendChild(totalAchievementsValue);
        totalAchievementsStat.appendChild(totalAchievementsLabel);
        achievementCard.appendChild(totalAchievementsStat);
        
        // 建立成就點數統計
        const achievementPointsStat = document.createElement('div');
        achievementPointsStat.className = 'overview-stat';
        const achievementPointsValue = document.createElement('span');
        achievementPointsValue.className = 'stat-value';
        achievementPointsValue.textContent = achievementsData?.AchievementPoints || 0;
        const achievementPointsLabel = document.createElement('span');
        achievementPointsLabel.className = 'stat-label';
        achievementPointsLabel.textContent = '成就點數';
        achievementPointsStat.appendChild(achievementPointsValue);
        achievementPointsStat.appendChild(achievementPointsLabel);
        achievementCard.appendChild(achievementPointsStat);
        achievementCard.onclick = () => this.switchTab('achievements');
        
        // 坐騎統計
        const mountCard = document.createElement('div');
        mountCard.className = 'overview-card';
        
        // 建立 h4 標題
        const mountTitle = document.createElement('h4');
        mountTitle.textContent = '坐騎';
        mountCard.appendChild(mountTitle);
        
        // 建立坐騎統計
        const mountStat = document.createElement('div');
        mountStat.className = 'overview-stat';
        const mountValue = document.createElement('span');
        mountValue.className = 'stat-value';
        mountValue.textContent = mountsData?.Mounts?.length || 0;
        const mountLabel = document.createElement('span');
        mountLabel.className = 'stat-label';
        mountLabel.textContent = '已收集';
        mountStat.appendChild(mountValue);
        mountStat.appendChild(mountLabel);
        mountCard.appendChild(mountStat);
        mountCard.onclick = () => this.switchTab('mounts');
        
        // 寵物統計
        const minionCard = document.createElement('div');
        minionCard.className = 'overview-card';
        
        // 建立 h4 標題
        const minionTitle = document.createElement('h4');
        minionTitle.textContent = '寵物';
        minionCard.appendChild(minionTitle);
        
        // 建立寵物統計
        const minionStat = document.createElement('div');
        minionStat.className = 'overview-stat';
        const minionValue = document.createElement('span');
        minionValue.className = 'stat-value';
        minionValue.textContent = minionsData?.Minions?.length || 0;
        const minionLabel = document.createElement('span');
        minionLabel.className = 'stat-label';
        minionLabel.textContent = '已收集';
        minionStat.appendChild(minionValue);
        minionStat.appendChild(minionLabel);
        minionCard.appendChild(minionStat);
        minionCard.onclick = () => this.switchTab('minions');
        
        // 公會統計（如果有）
        if (this.currentFCId) {
            const fcCard = document.createElement('div');
            fcCard.className = 'overview-card';
            
            // 建立 h4 標題
            const fcTitle = document.createElement('h4');
            fcTitle.textContent = '公會';
            fcCard.appendChild(fcTitle);
            
            // 建立公會統計
            const fcStat = document.createElement('div');
            fcStat.className = 'overview-stat';
            const fcValue = document.createElement('span');
            fcValue.className = 'stat-value';
            fcValue.textContent = this.elements.fcMemberCount.textContent;
            const fcLabel = document.createElement('span');
            fcLabel.className = 'stat-label';
            fcLabel.textContent = '成員數';
            fcStat.appendChild(fcValue);
            fcStat.appendChild(fcLabel);
            fcCard.appendChild(fcStat);
            fcCard.onclick = () => this.switchTab('freecompany');
            overviewGrid.appendChild(fcCard);
        }
        
        overviewGrid.appendChild(achievementCard);
        overviewGrid.appendChild(mountCard);
        overviewGrid.appendChild(minionCard);
        
        overviewTab.appendChild(overviewGrid);
    }
}

// Initialize the tool
document.addEventListener('DOMContentLoaded', () => {
    new LodestoneCharacterLookup();
});