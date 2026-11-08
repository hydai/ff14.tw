/**
 * Lodestone 角色查詢 - 靜態資料
 *
 * 頁面（lodestone-model.js 與 script.js）讀這四份，都是深層凍結的全域：
 * - LODESTONE_JOBS：34 個職業，官方順序，附分組、三種語言的官方名稱、圖示與是否為限定職業
 * - LODESTONE_BASE_CLASSES：基本職業 → 它的職業（頁面把基本職業放在職業那一格）
 * - LODESTONE_WORLDS：搜尋的伺服器選單，11 個資料中心與 85 個伺服器，值就是官網 worldname 的值
 * - LODESTONE_TERMS：官網的英文與日文原文 → 官方繁中（部隊活動重點、招募對象、大國防聯軍、聲望、開始城市）
 */

// ==================== 頁面用的資料 ====================
// 深層凍結。包在立即執行的函式裡，不多出全域的名稱：只有下面四個掛到 window 上。
(() => {
    // 嚴格模式：想改凍結的資料時會丟 TypeError，不會被默默忽略
    'use strict';

    const deepFreeze = (value) => {
        for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
        return Object.freeze(value);
    };

    /**
     * 職業，照官方順序（Lodestone 職業頁的順序）。
     * - role：分組，tank、healer、melee、ranged、magic、crafting、gathering
     * - names：三種介面語言的官方名稱。zh 照 TERMINOLOGY.md（生產與採集職業、Beastmaster 不在裡面：
     *   Beastmaster 沒有官方中文名，顯示原文），en、ja 是 Lodestone 職業頁上的字
     * - icon：../../assets/images/se/FFXIVJobIcons/ 底下的路徑；Beastmaster 沒有圖示，是 null
     * - limited：等級上限不是 100 的限定職業，不標滿級
     */
    window.LODESTONE_JOBS = deepFreeze([
        // 坦克
        { key: 'Paladin', role: 'tank', names: { zh: '騎士', en: 'Paladin', ja: 'ナイト' }, icon: '01_TANK/Job/Paladin.png', limited: false },
        { key: 'Warrior', role: 'tank', names: { zh: '戰士', en: 'Warrior', ja: '戦士' }, icon: '01_TANK/Job/Warrior.png', limited: false },
        { key: 'DarkKnight', role: 'tank', names: { zh: '暗黑騎士', en: 'Dark Knight', ja: '暗黒騎士' }, icon: '01_TANK/Job/DarkKnight.png', limited: false },
        { key: 'Gunbreaker', role: 'tank', names: { zh: '絕槍戰士', en: 'Gunbreaker', ja: 'ガンブレイカー' }, icon: '01_TANK/Job/Gunbreaker.png', limited: false },
        // 治療
        { key: 'WhiteMage', role: 'healer', names: { zh: '白魔法師', en: 'White Mage', ja: '白魔道士' }, icon: '02_HEALER/Job/WhiteMage.png', limited: false },
        { key: 'Scholar', role: 'healer', names: { zh: '學者', en: 'Scholar', ja: '学者' }, icon: '02_HEALER/Job/Scholar.png', limited: false },
        { key: 'Astrologian', role: 'healer', names: { zh: '占星術士', en: 'Astrologian', ja: '占星術師' }, icon: '02_HEALER/Job/Astrologian.png', limited: false },
        { key: 'Sage', role: 'healer', names: { zh: '賢者', en: 'Sage', ja: '賢者' }, icon: '02_HEALER/Job/Sage.png', limited: false },
        // 近戰
        { key: 'Monk', role: 'melee', names: { zh: '武僧', en: 'Monk', ja: 'モンク' }, icon: '03_DPS/Job/Monk.png', limited: false },
        { key: 'Dragoon', role: 'melee', names: { zh: '龍騎士', en: 'Dragoon', ja: '竜騎士' }, icon: '03_DPS/Job/Dragoon.png', limited: false },
        { key: 'Ninja', role: 'melee', names: { zh: '忍者', en: 'Ninja', ja: '忍者' }, icon: '03_DPS/Job/Ninja.png', limited: false },
        { key: 'Samurai', role: 'melee', names: { zh: '武士', en: 'Samurai', ja: '侍' }, icon: '03_DPS/Job/Samurai.png', limited: false },
        { key: 'Reaper', role: 'melee', names: { zh: '鐮刀客', en: 'Reaper', ja: 'リーパー' }, icon: '03_DPS/Job/Reaper.png', limited: false },
        { key: 'Viper', role: 'melee', names: { zh: '蝮蛇劍士', en: 'Viper', ja: 'ヴァイパー' }, icon: '03_DPS/Job/Viper.png', limited: false },
        { key: 'Beastmaster', role: 'melee', names: { zh: 'Beastmaster', en: 'Beastmaster', ja: '魔獣使い' }, icon: null, limited: true },
        // 遠程
        { key: 'Bard', role: 'ranged', names: { zh: '吟遊詩人', en: 'Bard', ja: '吟遊詩人' }, icon: '03_DPS/Job/Bard.png', limited: false },
        { key: 'Machinist', role: 'ranged', names: { zh: '機工士', en: 'Machinist', ja: '機工士' }, icon: '03_DPS/Job/Machinist.png', limited: false },
        { key: 'Dancer', role: 'ranged', names: { zh: '舞者', en: 'Dancer', ja: '踊り子' }, icon: '03_DPS/Job/Dancer.png', limited: false },
        // 魔法
        { key: 'BlackMage', role: 'magic', names: { zh: '黑魔法師', en: 'Black Mage', ja: '黒魔道士' }, icon: '03_DPS/Job/BlackMage.png', limited: false },
        { key: 'Summoner', role: 'magic', names: { zh: '召喚師', en: 'Summoner', ja: '召喚士' }, icon: '03_DPS/Job/Summoner.png', limited: false },
        { key: 'RedMage', role: 'magic', names: { zh: '赤魔法師', en: 'Red Mage', ja: '赤魔道士' }, icon: '03_DPS/Job/RedMage.png', limited: false },
        { key: 'Pictomancer', role: 'magic', names: { zh: '繪靈法師', en: 'Pictomancer', ja: 'ピクトマンサー' }, icon: '03_DPS/Job/Pictomancer.png', limited: false },
        { key: 'BlueMage', role: 'magic', names: { zh: '青魔法師', en: 'Blue Mage', ja: '青魔道士' }, icon: '06_LIMITED/BlueMage.png', limited: true },
        // 生產
        { key: 'Carpenter', role: 'crafting', names: { zh: '刻木匠', en: 'Carpenter', ja: '木工師' }, icon: '04_CRAFTER/Carpenter.png', limited: false },
        { key: 'Blacksmith', role: 'crafting', names: { zh: '鍛鐵匠', en: 'Blacksmith', ja: '鍛冶師' }, icon: '04_CRAFTER/Blacksmith.png', limited: false },
        { key: 'Armorer', role: 'crafting', names: { zh: '鎧甲匠', en: 'Armorer', ja: '甲冑師' }, icon: '04_CRAFTER/Armorer.png', limited: false },
        { key: 'Goldsmith', role: 'crafting', names: { zh: '雕金匠', en: 'Goldsmith', ja: '彫金師' }, icon: '04_CRAFTER/Goldsmith.png', limited: false },
        { key: 'Leatherworker', role: 'crafting', names: { zh: '製革匠', en: 'Leatherworker', ja: '革細工師' }, icon: '04_CRAFTER/Leatherworker.png', limited: false },
        { key: 'Weaver', role: 'crafting', names: { zh: '裁縫匠', en: 'Weaver', ja: '裁縫師' }, icon: '04_CRAFTER/Weaver.png', limited: false },
        { key: 'Alchemist', role: 'crafting', names: { zh: '煉金術士', en: 'Alchemist', ja: '錬金術師' }, icon: '04_CRAFTER/Alchemist.png', limited: false },
        { key: 'Culinarian', role: 'crafting', names: { zh: '烹調師', en: 'Culinarian', ja: '調理師' }, icon: '04_CRAFTER/Culinarian.png', limited: false },
        // 採集
        { key: 'Miner', role: 'gathering', names: { zh: '採礦工', en: 'Miner', ja: '採掘師' }, icon: '05_GATHERER/Miner.png', limited: false },
        { key: 'Botanist', role: 'gathering', names: { zh: '園藝工', en: 'Botanist', ja: '園芸師' }, icon: '05_GATHERER/Botanist.png', limited: false },
        { key: 'Fisher', role: 'gathering', names: { zh: '捕魚人', en: 'Fisher', ja: '漁師' }, icon: '05_GATHERER/Fisher.png', limited: false }
    ]);

    /**
     * 基本職業 → 它的職業。Worker 的職業回答裡，還沒轉職的職業那一列寫的是基本職業（例如騎士那一列寫 Gladiator），
     * 目前職業也可能是基本職業；網站沒有基本職業的圖示，所以把它放在職業那一格，顯示職業的名稱與圖示。
     */
    window.LODESTONE_BASE_CLASSES = deepFreeze({
        Gladiator: 'Paladin',
        Marauder: 'Warrior',
        Conjurer: 'WhiteMage',
        Arcanist: 'Summoner',
        Pugilist: 'Monk',
        Lancer: 'Dragoon',
        Rogue: 'Ninja',
        Archer: 'Bard',
        Thaumaturge: 'BlackMage'
    });

    /**
     * 伺服器選單。值就是官網搜尋的 worldname 參數：資料中心帶 _dc_ 前綴（顯示時去掉，見 LodestoneModel.worldLabel），
     * 沒有選的「全部伺服器」是空字串，由頁面自己放在第一個。資料中心照官網的順序，伺服器照官網的字母順序。
     */
    window.LODESTONE_WORLDS = deepFreeze({
        dcs: [
            '_dc_Aether', '_dc_Crystal', '_dc_Dynamis', '_dc_Primal', '_dc_Chaos', '_dc_Light',
            '_dc_Materia', '_dc_Elemental', '_dc_Gaia', '_dc_Mana', '_dc_Meteor'
        ],
        worlds: [
            'Adamantoise', 'Aegis', 'Alexander', 'Alpha', 'Anima', 'Asura', 'Atomos', 'Bahamut', 'Balmung', 'Behemoth',
            'Belias', 'Bismarck', 'Brynhildr', 'Cactuar', 'Carbuncle', 'Cerberus', 'Chocobo', 'Coeurl', 'Cuchulainn', 'Diabolos',
            'Durandal', 'Excalibur', 'Exodus', 'Faerie', 'Famfrit', 'Fenrir', 'Garuda', 'Gilgamesh', 'Goblin', 'Golem',
            'Gungnir', 'Hades', 'Halicarnassus', 'Hyperion', 'Ifrit', 'Ixion', 'Jenova', 'Kraken', 'Kujata', 'Lamia',
            'Leviathan', 'Lich', 'Louisoix', 'Maduin', 'Malboro', 'Mandragora', 'Marilith', 'Masamune', 'Mateus', 'Midgardsormr',
            'Moogle', 'Odin', 'Omega', 'Pandaemonium', 'Phantom', 'Phoenix', 'Rafflesia', 'Ragnarok', 'Raiden', 'Ramuh',
            'Ravana', 'Ridill', 'Sagittarius', 'Sargatanas', 'Sephirot', 'Seraph', 'Shinryu', 'Shiva', 'Siren', 'Sophia',
            'Spriggan', 'Tiamat', 'Titan', 'Tonberry', 'Twintania', 'Typhon', 'Ultima', 'Ultros', 'Unicorn', 'Valefor',
            'Yojimbo', 'Zalera', 'Zeromus', 'Zodiark', 'Zurvan'
        ]
    });

    /**
     * 官網的原文 → 官方繁中。官網依「名稱與成就顯示」送來英文或日文，兩種原文放在同一張表裡；
     * 只有中文介面才換（見 LodestoneModel.term），認不得的原文照舊顯示。
     * 用語照 TERMINOLOGY.md：大國防聯軍的名稱、開始城市（大國防聯軍的總部所在），部隊活動重點的「迷宮」「討伐殲滅戰」
     * 「大型任務」「公會令」是它的副本類型；「硬派」不在裡面，是這個網站自己選的用詞。
     * 聲望的日文只收在 Lodestone 日文部隊頁看過的「中立」「盟友」，其他四級只有英文原文。
     */
    window.LODESTONE_TERMS = deepFreeze({
        // 部隊的活動重點
        focus: {
            'Role-playing': '角色扮演', 'ロールプレイ': '角色扮演',
            'Leveling': '練級', 'レベリング': '練級',
            'Casual': '休閒', 'カジュアル': '休閒',
            'Hardcore': '硬派', 'ハードコア': '硬派',
            'Dungeons': '迷宮', 'ダンジョン': '迷宮',
            'Guildhests': '公會令', 'ギルドオーダー': '公會令',
            'Trials': '討伐殲滅戰', '討伐・討滅戦': '討伐殲滅戰',
            'Raids': '大型任務', 'レイド': '大型任務',
            'PvP': 'PvP'
        },
        // 部隊的招募對象
        seeking: {
            'Tank': '坦克', 'TANK': '坦克',
            'Healer': '治療', 'HEALER': '治療',
            'DPS': '輸出',
            'Crafter': '生產職', 'CRAFTER': '生產職',
            'Gatherer': '採集職', 'GATHERER': '採集職'
        },
        // 大國防聯軍
        grandCompany: {
            'Maelstrom': '黑渦團', '黒渦団': '黑渦團',
            'Order of the Twin Adder': '雙蛇黨', '双蛇党': '雙蛇黨',
            'Immortal Flames': '不滅隊', '不滅隊': '不滅隊'
        },
        // 大國防聯軍的聲望
        reputation: {
            'Neutral': '中立', '中立': '中立',
            'Friendly': '友好',
            'Trusted': '信賴',
            'Respected': '敬重',
            'Honored': '崇敬',
            'Allied': '同盟', '盟友': '同盟'
        },
        // 開始城市
        town: {
            'Limsa Lominsa': '利姆薩·羅敏薩', 'リムサ・ロミンサ': '利姆薩·羅敏薩',
            'Gridania': '格里達尼亞', 'グリダニア': '格里達尼亞',
            "Ul'dah": '烏爾達哈', 'ウルダハ': '烏爾達哈'
        }
    });
})();
