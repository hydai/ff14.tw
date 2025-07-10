class LodestoneCharacterLookup {
    constructor() {
        this.elements = {
            characterId: document.getElementById('characterId'),
            searchBtn: document.getElementById('searchBtn'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            errorMessage: document.getElementById('errorMessage'),
            characterInfo: document.getElementById('characterInfo'),
            // Character info elements
            characterAvatar: document.getElementById('characterAvatar'),
            characterName: document.getElementById('characterName'),
            characterTitle: document.getElementById('characterTitle'),
            characterServer: document.getElementById('characterServer'),
            characterRace: document.getElementById('characterRace'),
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
            equipmentInfo: document.getElementById('equipmentInfo')
        };

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

        const apiUrl = `https://logstone.z54981220.workers.dev/character/${characterId}`;
        const jobApiUrl = `https://logstone.z54981220.workers.dev/character/${characterId}/classjob`;
        console.log('API URL:', apiUrl);
        console.log('Job API URL:', jobApiUrl);

        try {
            console.log('正在發送請求...');
            // 同時發送兩個請求
            const [characterResponse, jobResponse] = await Promise.all([
                fetch(apiUrl),
                fetch(jobApiUrl)
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
                try {
                    const jobDataResponse = JSON.parse(jobText);
                    jobData = jobDataResponse.data;  // 根據 API 格式，資料在 data 欄位內
                    console.log('解析後的職業 JSON 資料:', jobData);
                } catch (parseError) {
                    console.error('職業 JSON 解析錯誤:', parseError);
                    // 職業資料解析失敗不影響主要功能
                }
            } else {
                console.warn('無法取得職業資料:', jobResponse.status);
            }
            
            if (characterData && characterData.Character) {
                console.log('準備顯示角色資料...');
                this.displayCharacterInfo(characterData.Character, jobData);
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
        // Note: Race and Tribe are not provided in the current API response
        this.elements.characterRace.textContent = '資料未提供';
        
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
            this.elements.fcName.textContent = '有公會（名稱需額外查詢）';
            
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

        // 處理戰鬥職業
        if (classJobs.CombatJobs) {
            const combatCategories = [
                { name: '坦克', icon: '🛡️', class: 'tank', data: classJobs.CombatJobs.Tank },
                { name: '治療', icon: '💚', class: 'healer', data: classJobs.CombatJobs.Healer },
                { name: '近戰 DPS', icon: '⚔️', class: 'melee', data: classJobs.CombatJobs.MeleeDPS },
                { name: '遠程物理 DPS', icon: '🏹', class: 'ranged', data: classJobs.CombatJobs.RangedDPS },
                { name: '遠程魔法 DPS', icon: '🔮', class: 'magic', data: classJobs.CombatJobs.MagicalDPS }
            ];

            combatCategories.forEach(category => {
                if (category.data) {
                    this.displayJobCategory(category, category.data, jobNames);
                }
            });
        }

        // 處理生產職業
        if (classJobs.CraftingJobs) {
            this.displayJobCategory(
                { name: '生產職業', icon: '🔨', class: 'crafting' },
                classJobs.CraftingJobs,
                jobNames
            );
        }

        // 處理採集職業
        if (classJobs.GatheringJobs) {
            this.displayJobCategory(
                { name: '採集職業', icon: '⛏️', class: 'gathering' },
                classJobs.GatheringJobs,
                jobNames
            );
        }

        // 處理特殊內容 (Eureka/Bozja)
        if (classJobs.SpecialContent) {
            this.displaySpecialContent(classJobs.SpecialContent);
        }
    }

    displayJobCategory(category, jobs, jobNames) {
        const jobEntries = Object.entries(jobs).filter(([_, job]) => job && job.Level && parseInt(job.Level) > 0);
        
        if (jobEntries.length === 0) return;

        // 創建分類標題
        const categoryHeader = document.createElement('h4');
        categoryHeader.className = 'job-category-title';
        
        // 使用 DOM 操作替代 innerHTML
        const iconSpan = document.createElement('span');
        iconSpan.className = 'job-category-icon';
        iconSpan.textContent = category.icon;
        
        categoryHeader.appendChild(iconSpan);
        categoryHeader.appendChild(document.createTextNode(` ${category.name}`));
        
        this.elements.jobLevels.appendChild(categoryHeader);

        // 創建職業網格容器
        const jobGrid = document.createElement('div');
        jobGrid.className = `job-levels-grid job-category-${category.class}`;

        jobEntries
            .sort(([_, a], [__, b]) => parseInt(b.Level) - parseInt(a.Level))
            .forEach(([jobKey, job]) => {
                const jobItem = document.createElement('div');
                jobItem.className = 'job-item';
                
                // 創建職業圖標
                const jobIcon = document.createElement('div');
                jobIcon.className = 'job-icon-text';
                const displayName = job.UnlockState || jobKey;
                const chineseName = jobNames[displayName] || displayName;
                jobIcon.textContent = chineseName.charAt(0);
                
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

        this.elements.jobLevels.appendChild(jobGrid);
    }

    displaySpecialContent(specialContent) {
        if (!specialContent || Object.keys(specialContent).length === 0) return;

        // 創建分類標題
        const categoryHeader = document.createElement('h4');
        categoryHeader.className = 'job-category-title';
        
        // 使用 DOM 操作替代 innerHTML
        const iconSpan = document.createElement('span');
        iconSpan.className = 'job-category-icon';
        iconSpan.textContent = '⭐';
        
        categoryHeader.appendChild(iconSpan);
        categoryHeader.appendChild(document.createTextNode(' 特殊內容'));
        
        this.elements.jobLevels.appendChild(categoryHeader);

        // 創建網格容器
        const contentGrid = document.createElement('div');
        contentGrid.className = 'job-levels-grid job-category-special';

        // 處理 Eureka
        if (specialContent.Eureka) {
            const eurekaItem = this.createSpecialContentItem(
                'Eureka',
                specialContent.Eureka.Name || 'Elemental Level',
                specialContent.Eureka.Level,
                specialContent.Eureka.CurrentEXP,
                specialContent.Eureka.MaxEXP
            );
            contentGrid.appendChild(eurekaItem);
        }

        // 處理 Bozja
        if (specialContent.Bozja) {
            const bozjaItem = this.createSpecialContentItem(
                'Bozja',
                specialContent.Bozja.Name || 'Resistance Rank',
                specialContent.Bozja.Level,
                specialContent.Bozja.Mettle,
                null
            );
            contentGrid.appendChild(bozjaItem);
        }

        this.elements.jobLevels.appendChild(contentGrid);
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
            if (max) {
                info.textContent = `EXP: ${current} / ${max}`;
            } else {
                info.textContent = `Mettle: ${current}`;
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
}

// Initialize the tool
document.addEventListener('DOMContentLoaded', () => {
    new LodestoneCharacterLookup();
});