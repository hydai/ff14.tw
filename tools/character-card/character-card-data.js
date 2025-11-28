/**
 * 角色卡產生器 - 靜態資料
 * 包含伺服器資料和職業圖示對應
 */

/**
 * 伺服器資料結構
 * 按區域 > 資料中心 > 伺服器 組織
 */
const CHARACTER_CARD_SERVER_DATA = {
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

/**
 * 職業圖示對應
 * 使用官方 SE 圖示路徑（相對於 assets/images/se/FFXIVJobIcons/）
 */
const CHARACTER_CARD_JOB_ICONS = {
    // 坦克
    '騎士': 'assets/images/se/FFXIVJobIcons/01_TANK/Job/Paladin.png',
    '戰士': 'assets/images/se/FFXIVJobIcons/01_TANK/Job/Warrior.png',
    '暗黑騎士': 'assets/images/se/FFXIVJobIcons/01_TANK/Job/DarkKnight.png',
    '絕槍戰士': 'assets/images/se/FFXIVJobIcons/01_TANK/Job/Gunbreaker.png',
    // 治療
    '白魔法師': 'assets/images/se/FFXIVJobIcons/02_HEALER/Job/WhiteMage.png',
    '學者': 'assets/images/se/FFXIVJobIcons/02_HEALER/Job/Scholar.png',
    '占星術士': 'assets/images/se/FFXIVJobIcons/02_HEALER/Job/Astrologian.png',
    '賢者': 'assets/images/se/FFXIVJobIcons/02_HEALER/Job/Sage.png',
    // DPS - 近戰
    '武僧': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Monk.png',
    '龍騎士': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Dragoon.png',
    '忍者': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Ninja.png',
    '武士': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Samurai.png',
    '鐮刀': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Reaper.png',
    // DPS - 遠程物理
    '詩人': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Bard.png',
    '機工士': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Machinist.png',
    '舞者': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Dancer.png',
    // DPS - 遠程魔法
    '黑魔法師': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/BlackMage.png',
    '召喚師': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/Summoner.png',
    '赤魔法師': 'assets/images/se/FFXIVJobIcons/03_DPS/Job/RedMage.png'
};

// 匯出到全域
window.CHARACTER_CARD_SERVER_DATA = CHARACTER_CARD_SERVER_DATA;
window.CHARACTER_CARD_JOB_ICONS = CHARACTER_CARD_JOB_ICONS;
