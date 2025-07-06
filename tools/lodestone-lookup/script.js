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
            characterFC: document.getElementById('characterFC'),
            jobLevels: document.getElementById('jobLevels'),
            collectibles: document.getElementById('collectibles'),
            achievementPoints: document.getElementById('achievementPoints'),
            lodestoneLink: document.getElementById('lodestoneLink')
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
        console.log('API URL:', apiUrl);

        try {
            console.log('正在發送請求...');
            const response = await fetch(apiUrl);
            
            console.log('Response 狀態:', response.status);
            console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
                console.error('Response 不是 OK:', response.status, response.statusText);
                if (response.status === 404) {
                    throw new Error('找不到此角色，請確認 ID 是否正確');
                }
                throw new Error(`查詢失敗 (${response.status}): ${response.statusText}`);
            }

            const responseText = await response.text();
            console.log('原始回應內容:', responseText);
            
            let data;
            try {
                data = JSON.parse(responseText);
                console.log('解析後的 JSON 資料:', data);
            } catch (parseError) {
                console.error('JSON 解析錯誤:', parseError);
                console.error('無法解析的內容:', responseText);
                throw new Error('伺服器回應格式錯誤');
            }
            
            if (data && data.Character) {
                console.log('準備顯示角色資料...');
                this.displayCharacterInfo(data.Character);
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

    displayCharacterInfo(character) {
        console.log('=== 顯示角色資料 ===');
        console.log('接收到的資料結構:', character);
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
        
        // Server info
        const serverInfo = character.Server;
        console.log('伺服器資訊:', serverInfo);
        if (serverInfo && serverInfo.World) {
            this.elements.characterServer.textContent = `${serverInfo.World} (${serverInfo.DC || '未知'})`;
        } else {
            this.elements.characterServer.textContent = '未知';
        }
        
        // Additional character info
        if (character.Race && character.Tribe) {
            this.elements.characterRace.textContent = `${character.Race} / ${character.Tribe}`;
        } else {
            this.elements.characterRace.textContent = '未知';
        }
        
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
            this.elements.characterFC.textContent = '有公會（名稱需額外查詢）';
        } else {
            this.elements.characterFC.textContent = '無';
        }
        
        // Active job info
        if (character.ActiveClassjobLevel && character.ActiveClassjobLevel.Level) {
            this.elements.jobLevels.innerHTML = `
                <div class="job-item">
                    <img src="${character.ActiveClassjob}" alt="當前職業" class="job-icon">
                    <div class="job-details">
                        <p class="job-name">當前職業</p>
                        <p class="job-level ${character.ActiveClassjobLevel.Level === '100' ? 'max-level' : ''}">Lv. ${character.ActiveClassjobLevel.Level}</p>
                    </div>
                </div>
                <p style="margin-top: 1rem; color: var(--text-color-secondary);">詳細職業列表請前往官方 Lodestone 查看</p>
            `;
        } else {
            this.elements.jobLevels.innerHTML = '<p>職業等級資料暫不可用</p>';
        }
        
        // Stats info
        if (character.Hp) {
            this.elements.collectibles.textContent = `HP: ${character.Hp}`;
        } else {
            this.elements.collectibles.textContent = '暫無資料';
        }
        
        if (character.AttackPower) {
            this.elements.achievementPoints.textContent = `攻擊力: ${character.AttackPower}`;
        } else {
            this.elements.achievementPoints.textContent = '暫無資料';
        }

        // Lodestone link
        const lodestoneUrl = `https://na.finalfantasyxiv.com/lodestone/character/${character.ID}/`;
        console.log('Lodestone 連結:', lodestoneUrl);
        this.elements.lodestoneLink.href = lodestoneUrl;

        console.log('顯示角色資訊區塊');
        this.showCharacterInfo();
        console.log('=== 顯示完成 ===');
    }

    displayJobLevels(classJobs) {
        if (!classJobs || classJobs.length === 0) {
            this.elements.jobLevels.innerHTML = '<p>無職業資料</p>';
            return;
        }

        const jobCategories = {
            tank: ['劍術士', '斧術士', '騎士', '戰士', '暗黑騎士', '絕槍戰士'],
            healer: ['幻術士', '白魔道士', '學者', '占星術士', '賢者'],
            dps: ['格鬥士', '槍術士', '弓術士', '雙劍士', '忍者', '武士', '龍騎士', '吟遊詩人', '機工士', '舞者', '鐮刀師', '毒蛇使'],
            magic: ['咒術士', '巴術士', '黑魔道士', '召喚士', '赤魔道士', '祕術師', '畫師'],
            crafting: ['刻木匠', '鍛鐵匠', '鎧甲匠', '雕金匠', '製革匠', '裁縫匠', '煉金術士', '烹調師'],
            gathering: ['採礦工', '園藝工', '捕魚人']
        };

        const jobsHtml = classJobs
            .filter(job => job.Level > 0)
            .sort((a, b) => b.Level - a.Level)
            .map(job => {
                const isMaxLevel = job.Level === 100;
                const levelClass = isMaxLevel ? 'job-level max-level' : 'job-level';
                
                return `
                    <div class="job-item">
                        <img src="https://xivapi.com${job.Job.Icon}" alt="${job.Job.Name}" class="job-icon">
                        <div class="job-details">
                            <p class="job-name">${job.Job.Name}</p>
                            <p class="${levelClass}">Lv. ${job.Level}</p>
                        </div>
                    </div>
                `;
            })
            .join('');

        this.elements.jobLevels.innerHTML = jobsHtml || '<p>無職業資料</p>';
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