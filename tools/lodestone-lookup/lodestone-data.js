/**
 * Lodestone 角色查詢 - 靜態資料
 * 包含職業圖示路徑對應和翻譯資料
 */

/**
 * 職業圖示路徑對應
 * 基礎路徑: ../../assets/images/se/FFXIVJobIcons/
 */
const LODESTONE_JOB_ICONS = {
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
    // DPS - 近戰
    'Monk': '03_DPS/Job/Monk.png',
    'Dragoon': '03_DPS/Job/Dragoon.png',
    'Ninja': '03_DPS/Job/Ninja.png',
    'Samurai': '03_DPS/Job/Samurai.png',
    'Reaper': '03_DPS/Job/Reaper.png',
    'Viper': '03_DPS/Job/Viper.png',
    // DPS - 遠程物理
    'Bard': '03_DPS/Job/Bard.png',
    'Machinist': '03_DPS/Job/Machinist.png',
    'Dancer': '03_DPS/Job/Dancer.png',
    // DPS - 遠程魔法
    'BlackMage': '03_DPS/Job/BlackMage.png',
    'Summoner': '03_DPS/Job/Summoner.png',
    'RedMage': '03_DPS/Job/RedMage.png',
    'Pictomancer': '03_DPS/Job/Pictomancer.png',
    // 特殊職業
    'BlueMage': '06_LIMITED/BlueMage.png',
    // 生產職業
    'Carpenter': '04_CRAFTER/Carpenter.png',
    'Blacksmith': '04_CRAFTER/Blacksmith.png',
    'Armorer': '04_CRAFTER/Armorer.png',
    'Goldsmith': '04_CRAFTER/Goldsmith.png',
    'Leatherworker': '04_CRAFTER/Leatherworker.png',
    'Weaver': '04_CRAFTER/Weaver.png',
    'Alchemist': '04_CRAFTER/Alchemist.png',
    'Culinarian': '04_CRAFTER/Culinarian.png',
    // 採集職業
    'Miner': '05_GATHERER/Miner.png',
    'Botanist': '05_GATHERER/Botanist.png',
    'Fisher': '05_GATHERER/Fisher.png'
};

/**
 * 翻譯資料
 */
const LODESTONE_TRANSLATIONS = {
    // 自由部隊活動重點
    focus: {
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
    },
    // 招募角色類型
    seeking: {
        'Tank': '坦克',
        'Healer': '治療',
        'DPS': 'DPS',
        'Crafter': '生產職',
        'Gatherer': '採集職'
    },
    // 三國防聯軍
    grandCompany: {
        'Order of the Twin Adder': '雙蛇黨',
        'Immortal Flames': '恆輝隊',
        'Maelstrom': '黑渦團'
    },
    // 聲望等級
    reputationRank: {
        'Neutral': '中立',
        'Friendly': '友好',
        'Trusted': '信賴',
        'Respected': '敬重',
        'Honored': '崇敬',
        'Allied': '同盟'
    }
};

// 匯出到全域
window.LODESTONE_JOB_ICONS = LODESTONE_JOB_ICONS;
window.LODESTONE_TRANSLATIONS = LODESTONE_TRANSLATIONS;
