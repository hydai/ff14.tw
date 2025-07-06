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

        try {
            // Using XIVAPI as a proxy to fetch Lodestone data
            const response = await fetch(`https://xivapi.com/character/${characterId}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('找不到此角色，請確認 ID 是否正確');
                }
                throw new Error('查詢失敗，請稍後再試');
            }

            const data = await response.json();
            
            if (data.Character) {
                this.displayCharacterInfo(data.Character);
            } else {
                throw new Error('無法取得角色資料');
            }
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    displayCharacterInfo(character) {
        // Basic info
        this.elements.characterAvatar.src = character.Avatar || '';
        this.elements.characterAvatar.alt = character.Name || '';
        this.elements.characterName.textContent = character.Name || '未知';
        this.elements.characterTitle.textContent = character.Title || '無稱號';
        this.elements.characterServer.textContent = `${character.Server || '未知'} (${character.DC || '未知'})`;
        
        // Race and other info
        this.elements.characterRace.textContent = `${character.Race || '未知'} / ${character.Tribe || '未知'}`;
        this.elements.characterDeity.textContent = character.GuardianDeity || '未知';
        this.elements.characterCity.textContent = character.Town || '未知';
        
        // Free Company
        if (character.FreeCompanyName) {
            this.elements.characterFC.textContent = character.FreeCompanyName;
        } else {
            this.elements.characterFC.textContent = '無';
        }

        // Job levels
        this.displayJobLevels(character.ClassJobs);

        // Collectibles and achievements
        if (character.ActiveClassJob) {
            const activeJob = character.ActiveClassJob;
            this.elements.collectibles.textContent = '暫無資料';
            this.elements.achievementPoints.textContent = '暫無資料';
        }

        // Lodestone link
        this.elements.lodestoneLink.href = `https://na.finalfantasyxiv.com/lodestone/character/${character.ID}/`;

        this.showCharacterInfo();
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