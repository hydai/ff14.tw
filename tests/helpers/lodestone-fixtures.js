// Lodestone 角色查詢頁測試用的假回應，給 tests/lodestone-page.test.js 共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。
//
//   const F = require('./helpers/lodestone-fixtures.js');
//   routes: { '/character/12345678': () => F.ok(F.character(F.HIKARI)), '/search/character': () => F.ok(F.search([F.AOI], { total: 1 })) }
//   F.ok(F.oldCharacter(F.HIKARI)); F.fail(404, 'not_found'); F.mineOf(F.HIKARI); F.entryOf(F.AOI)
//   F.ok(F.classJobs()); F.ok(F.achievements({ page: 2 })); F.ok(F.mounts()); F.ok(F.minions()); F.ok(F.freeCompany()); F.ok(F.members(1))
//
// 回應照 Worker（hydai/logstone）的格式（README 的 §1～§7）：
// - character(who)：新格式。部隊有名稱（沒有加入是 null）、ActiveClassJob（Key、Level、官網的 Icon）、最外層的 FetchedAt；
//   舊的 ActiveClassjob（官網的圖示網址）與 ActiveClassjobLevel 照舊留著（新 Worker 也還有）。
//   另有其他分頁用的欄位：Gear（每一格的圖示與染色，沒給是 DEFAULT_GEAR）、大國防聯軍、開始城市、生日、守護神、屬性、簡介（沒給是官網的 -）
// - oldCharacter(who)：現在正式站的舊 Worker。部隊只有 { ID, Crest }（沒有名稱；沒有加入時沒有這個欄位），沒有 ActiveClassJob、FetchedAt 與 Gear，
//   目前職業只有 ActiveClassjob（官網的圖示網址）與 ActiveClassjobLevel（{ Level: '100' }）。舊 Worker 沒有搜尋端點，所以沒有舊格式的搜尋回應：
//   頁面替身裡沒有設的路徑讓 fetch 丟 TypeError
// - search(people, { page, pageTotal, total })：{ Results, Pagination, FetchedAt }；total 沒給是人數，pageTotal 沒給時有人是 1、沒有人是 0
// - classJobs({ levels, shown, special })：/classjob。職業照 Worker 的分組放（CombatJobs 的五組、CraftingJobs、GatheringJobs），
//   levels 是職業鍵 → Level 字串（沒寫的是 '-'，沒給是 LEVELS），special 是 SpecialContent（沒給是 Occult Crescent 那一塊，鍵沿用 Bozja）
// - achievements({ page, pageTotal, total, points, list, pagination })：/achievements 的一頁；pagination 是 false 時沒有 Pagination
// - mounts(names, total)、minions(names, total)：/mounts、/minions（手機版頁面讀到的名稱與圖示，Total 是官網的總數）
// - freeCompany(fc, overrides)、freeCompanyJa(fc)：/freecompany/<id>（英文官網與日文官網的原文）；members(page, { pageTotal, people })：/members 的一頁
// - ok(body) 是 200 的回答，fail(status, error) 是 Worker 的錯誤回答 { error }（頁面替身的路由回傳這兩種）
// - mineOf(who)、entryOf(who)：存進 localStorage 的我的角色（七個欄位）與最近查過的一筆（五個欄位），同 LodestoneModel.person()
//
// who 的欄位：id、name、world、dc、title（沒有這個欄位就沒有稱號）、fc（{ id, name } 或 null）、job（職業鍵，null 是 Worker 認不出）、
// level、icon（官網的職業圖示網址，沒給就照 job 找；null 是 Worker 讀不到）、gear（沒給是 DEFAULT_GEAR，null 是回應裡沒有 Gear）、
// bio（沒給是 -）、details（蓋過大國防聯軍、開始城市這些欄位，例如日文官網的原文）。
// 名字、部隊名稱、ID、頭像網址、簡介都是假的，不放真實玩家的資料（成就、坐騎、寵物的名稱是遊戲裡的東西，不是玩家的資料）。
const FETCHED_AT = '2026-11-08T02:30:00.000Z';

// 官網的職業圖示網址（Worker 的 ActiveClassJob.Icon 與舊的 ActiveClassjob）：檔名是官網那個職業的圖示，路徑前面那一段是假的
const OFFICIAL_ICONS = {
    Bard: 'https://lds-img.finalfantasyxiv.com/h/F/KWI-9P3RX_Ojjn_mwCS2N0-3TI.png',
    Gladiator: 'https://lds-img.finalfantasyxiv.com/h/F/F5JzG9RPIKFSogtaKNBk455aYA.png',
    Beastmaster: 'https://lds-img.finalfantasyxiv.com/h/O/OFfyg3oiCvw6DQmECas-wZv01A.png'
};
const BARD_ICON = OFFICIAL_ICONS.Bard;

const avatarOf = (id) => `https://example.invalid/lodestone/avatar/${id}.jpg`;
const crestOf = (id) => `https://example.invalid/lodestone/crest/${id}.png`;

// 人（全部是假的）
const HIKARI = Object.freeze({
    id: '12345678', name: 'Hikari Senshi', title: 'Warrior of Light', world: 'Tonberry', dc: 'Elemental',
    fc: Object.freeze({ id: '9230000000000000001', name: 'Example Company' }), job: 'Bard', level: 100
});
const AOI = Object.freeze({
    id: '23456789', name: 'Aoi Mizuno', world: 'Tiamat', dc: 'Gaia',
    fc: Object.freeze({ id: '9230000000000000002', name: 'Moonlit Garden' }), job: 'WhiteMage', level: 92
});
const AOI_YA = Object.freeze({ id: '34567890', name: 'Aoi Mizunoya', world: 'Tiamat', dc: 'Gaia', fc: null, job: 'Samurai', level: 100 });
const AOI_SAWA = Object.freeze({
    id: '45678901', name: 'Aoi Mizusawa', world: 'Tiamat', dc: 'Gaia',
    fc: Object.freeze({ id: '9230000000000000003', name: 'Night Owls' }), job: 'Dancer', level: 80
});
const REED = Object.freeze({ id: '56789012', name: 'Reed Blacke', world: 'Ragnarok', dc: 'Chaos', fc: null, job: 'Warrior', level: 100 });
const MIRA = Object.freeze({ id: '67890123', name: 'Mira Sol', world: 'Ixion', dc: 'Mana', fc: null, job: 'Sage', level: 90 });
const KAEDE = Object.freeze({ id: '78901234', name: 'Kaede Aizawa', world: 'Cactuar', dc: 'Aether', fc: null, job: 'Reaper', level: 100 });

const iconOf = (who) => (who.icon !== undefined ? who.icon : OFFICIAL_ICONS[who.job] ?? null);
const levelOf = (who) => (who.level === undefined ? null : who.level);
// 物品、坐騎、寵物、部隊階級的圖示網址（假的）
const itemIcon = (name) => `https://example.invalid/lodestone/itemicon/${name}.png`;

// 每一格裝備（Worker 的 Gear，照它的順序）：吟遊詩人沒有副手。主手染一色、身體染兩色、手部只有第二道有染（Worker 只列有染的，
// 所以也是一色）、腳部的第二個顏色不是 #rrggbb（頁面不畫）；臉部（Facewear）Worker 有列，網站不列
const DEFAULT_GEAR = Object.freeze([
    { Slot: 'MainHand', Icon: itemIcon('main-hand'), Dyes: ['#e69f96'] },
    { Slot: 'Head', Icon: itemIcon('head'), Dyes: [] },
    { Slot: 'Body', Icon: itemIcon('body'), Dyes: ['#a1b2c3', '#334455'] },
    { Slot: 'Hands', Icon: itemIcon('hands'), Dyes: ['#123456'] },
    { Slot: 'Legs', Icon: itemIcon('legs'), Dyes: [] },
    { Slot: 'Feet', Icon: itemIcon('feet'), Dyes: ['#ABCDEF', 'red'] },
    { Slot: 'Earrings', Icon: itemIcon('earrings'), Dyes: [] },
    { Slot: 'Necklace', Icon: itemIcon('necklace'), Dyes: [] },
    { Slot: 'Bracelets', Icon: itemIcon('bracelets'), Dyes: [] },
    { Slot: 'Ring1', Icon: itemIcon('ring-1'), Dyes: [] },
    { Slot: 'Ring2', Icon: itemIcon('ring-2'), Dyes: [] },
    { Slot: 'SoulCrystal', Icon: itemIcon('soul-crystal'), Dyes: [] },
    { Slot: 'Facewear', Icon: itemIcon('facewear'), Dyes: [] }
]);

// 角色頁的屬性（Worker 的欄位名稱），值是官網寫的字
const ATTRIBUTES = Object.freeze({
    Hp: '153216', MpGpCp: '10000', MpGpCpParameterName: 'MP',
    Strength: '421', Dexterity: '4980', Vitality: '5190', Intelligence: '392', Mind: '1563',
    CriticalHitRate: '3174', Determination: '2163', DirectHitRate: '1564', Defense: '6012', MagicDefense: '5987',
    AttackPower: '4980', SkillSpeed: '420', AttackMagicPotency: '392', HealingMagicPotency: '1563', SpellSpeed: '411',
    Tenacity: '400', Piety: '440'
});

// 角色頁的其他欄位（英文官網）：大國防聯軍與軍階、開始城市、生日、守護神
const PROFILE_DETAILS = Object.freeze({
    Nameday: '1st Sun of the 1st Astral Moon',
    Town: { Name: 'Gridania', Icon: itemIcon('town') },
    GuardianDeity: { Name: 'Menphina, the Lover', Icon: itemIcon('guardian') },
    GrandCompany: { Name: 'Maelstrom', Rank: 'Storm Captain' }
});

// 其他分頁用的欄位：大國防聯軍、屬性、簡介、裝備（gear 是 null 時沒有 Gear 這個欄位）
function detailsOf(who, { gear = true } = {}) {
    const details = { ...PROFILE_DETAILS, ...ATTRIBUTES, Bio: who.bio === undefined ? '-' : who.bio };
    if (gear && who.gear !== null) details.Gear = who.gear === undefined ? DEFAULT_GEAR : who.gear;
    return { ...details, ...(who.details ?? {}) };
}

function character(who, { fetchedAt = FETCHED_AT } = {}) {
    const body = {
        Character: {
            ID: Number(who.id),
            Name: who.name,
            ...(who.title === undefined ? {} : { Title: who.title }),
            Server: { World: who.world, DC: who.dc },
            Avatar: avatarOf(who.id),
            FreeCompany: who.fc ? { ID: who.fc.id, Name: who.fc.name, Crest: [crestOf(who.fc.id), crestOf(who.fc.id), crestOf(who.fc.id)] } : null,
            ActiveClassJob: { Key: who.job === undefined ? null : who.job, Level: levelOf(who), Icon: iconOf(who) },
            ActiveClassjob: iconOf(who) ?? '',
            ActiveClassjobLevel: { Level: levelOf(who) === null ? '' : String(levelOf(who)) },
            ...detailsOf(who)
        }
    };
    if (fetchedAt !== null) body.FetchedAt = fetchedAt;
    return body;
}

function oldCharacter(who) {
    const result = {
        ID: Number(who.id),
        Name: who.name,
        ...(who.title === undefined ? {} : { Title: who.title }),
        Server: { World: who.world, DC: who.dc },
        Avatar: avatarOf(who.id),
        ActiveClassjob: iconOf(who) ?? '',
        ActiveClassjobLevel: { Level: levelOf(who) === null ? '' : String(levelOf(who)) },
        ...detailsOf(who, { gear: false })
    };
    if (who.fc) result.FreeCompany = { ID: who.fc.id, Crest: [crestOf(who.fc.id)] };
    return { Character: result };
}

// ---------- 分頁的回答 ----------

// Worker 的 /classjob 把職業分在這幾組（網站不照它分，照 LODESTONE_JOBS 的 role）
const WORKER_JOB_GROUPS = {
    CombatJobs: {
        Tank: ['Paladin', 'Warrior', 'DarkKnight', 'Gunbreaker'],
        Healer: ['WhiteMage', 'Scholar', 'Astrologian', 'Sage'],
        MeleeDPS: ['Monk', 'Dragoon', 'Ninja', 'Samurai', 'Reaper', 'Viper', 'Beastmaster'],
        RangedDPS: ['Bard', 'Machinist', 'Dancer'],
        MagicalDPS: ['BlackMage', 'Summoner', 'RedMage', 'Pictomancer', 'BlueMage']
    },
    CraftingJobs: ['Carpenter', 'Blacksmith', 'Armorer', 'Goldsmith', 'Leatherworker', 'Weaver', 'Alchemist', 'Culinarian'],
    GatheringJobs: ['Miner', 'Botanist', 'Fisher']
};
// 測試用的等級：13 個 Lv100（青魔法師 80、Beastmaster 50 不算），賢者沒解鎖（-），絕槍戰士 0 級
const LEVELS = Object.freeze({
    Paladin: '100', Warrior: '92', DarkKnight: '80', Gunbreaker: '0',
    WhiteMage: '100', Scholar: '90', Astrologian: '74', Sage: '-',
    Monk: '81', Dragoon: '100', Ninja: '64', Samurai: '100', Reaper: '90', Viper: '95', Beastmaster: '50',
    Bard: '100', Machinist: '77', Dancer: '88',
    BlackMage: '100', Summoner: '90', RedMage: '83', Pictomancer: '100', BlueMage: '80',
    Carpenter: '100', Blacksmith: '100', Armorer: '92', Goldsmith: '90', Leatherworker: '90', Weaver: '100', Alchemist: '100', Culinarian: '95',
    Miner: '100', Botanist: '100', Fisher: '72'
});
// 特殊內容：鍵沿用 Worker 的 Bozja，內容其實是 Occult Crescent 的 Knowledge Level（名稱照 Worker 的 Name）
const OCCULT = Object.freeze({ Bozja: { Name: 'Knowledge Level', Level: '3', Mettle: '716' } });

function classJobs({ levels = LEVELS, shown = {}, special = OCCULT } = {}) {
    const row = (key) => {
        const level = levels[key] ?? '-';
        const locked = level === '-';
        return { Level: level, UnlockState: shown[key] ?? key, CurrentEXP: locked ? '-' : '1,234', MaxEXP: locked ? '-' : '5,992,000' };
    };
    const group = (keys) => Object.fromEntries(keys.map((key) => [key, row(key)]));
    const jobs = {
        CombatJobs: Object.fromEntries(Object.entries(WORKER_JOB_GROUPS.CombatJobs).map(([name, keys]) => [name, group(keys)])),
        CraftingJobs: group(WORKER_JOB_GROUPS.CraftingJobs),
        GatheringJobs: group(WORKER_JOB_GROUPS.GatheringJobs)
    };
    if (special !== null) jobs.SpecialContent = special;
    return { CharacterID: 12345678, ClassJobs: jobs, FetchedAt: FETCHED_AT };
}

// 成就的每一頁 [ID, 名稱, 取得時間]：第 1 頁的第二筆沒有日期（官網沒給的是空字串）
const ACHIEVEMENT_PAGES = Object.freeze({
    1: [['2744', 'Tank You, Dawntrail III', '2026-11-07T10:00:00.000Z'], ['1990', 'Mastering War VII', '']],
    2: [['1501', 'Level with It III', '2026-11-05T09:30:00.000Z'], ['812', 'Leaves of Grass', '2025-03-01T00:00:00.000Z']],
    3: [['17', 'To Crush Your Enemies I', '2024-01-15T12:34:56.000Z']]
});

function achievements({ page = 1, pageTotal = 3, total = 2567, points = '24530', list, pagination = true } = {}) {
    const rows = list ?? ACHIEVEMENT_PAGES[page] ?? [];
    const body = {
        CharacterID: 12345678,
        Achievements: rows.map(([ID, Name, Time]) => ({ ID, Name, Time })),
        TotalAchievements: total,
        AchievementPoints: points,
        FetchedAt: FETCHED_AT
    };
    if (pagination) body.Pagination = { Page: page, PageTotal: pageTotal, PageNext: page < pageTotal ? page + 1 : null, PagePrev: page > 1 ? page - 1 : null };
    return body;
}

const MOUNTS = Object.freeze(['Company Chocobo', 'Black Chocobo', 'Magitek Armor']);
const MINIONS = Object.freeze(['Wayward Hatchling', 'Cait Sith Doll', 'Baby Behemoth', 'Black Chocobo Chick']);
const collection = (field, names, total) => ({
    CharacterID: 12345678,
    [field]: names.map((Name, index) => ({ Name, Icon: itemIcon(`${field.toLowerCase()}-${index}`) })),
    Total: total,
    FetchedAt: FETCHED_AT
});
const mounts = (names = MOUNTS, total = 103) => collection('Mounts', names, total);
const minions = (names = MINIONS, total = 269) => collection('Minions', names, total);

// 部隊（英文官網）：Tag 與 ActiveState 有值，頁面不寫（Worker 讀錯元素，設計也沒列）
function freeCompany(fc = HIKARI.fc, overrides = {}) {
    return {
        FreeCompany: {
            ID: fc.id,
            Name: fc.name,
            Tag: '«EXMP»',
            Slogan: 'Weekend raids, weekday crafting.',
            CrestLayers: [crestOf(fc.id)],
            Server: { World: 'Tonberry', DC: 'Elemental' },
            GrandCompany: { Name: 'Maelstrom', Rank: 'Allied' },
            ActiveState: 'Active',
            Recruitment: 'Open',
            ActiveMemberCount: '42',
            Rank: '8',
            Ranking: { Weekly: '12', Monthly: '34' },
            Estate: { Name: 'Example Manor', Greeting: 'Welcome!', Plot: 'Plot 30, 1st Ward, Mist (Medium)' },
            Reputation: {
                ADDERS: { NAME: 'Order of the Twin Adder', PROGRESS: { Progress: '20' }, RANK: 'Neutral' },
                FLAMES: { NAME: 'Immortal Flames', PROGRESS: { Progress: '0' }, RANK: 'Neutral' },
                MAELSTROM: { NAME: 'Maelstrom', PROGRESS: { Progress: '100' }, RANK: 'Allied' }
            },
            Focus: ['Role-playing', 'Guildhests', 'Raids'],
            Seeking: ['Tank', 'Healer'],
            ...overrides
        },
        FetchedAt: FETCHED_AT
    };
}

// 同一個部隊在日文官網的原文
const freeCompanyJa = (fc = HIKARI.fc) => freeCompany(fc, {
    Recruitment: '申請可',
    ActiveMemberCount: '42名',
    GrandCompany: { Name: '黒渦団', Rank: '盟友' },
    Reputation: {
        ADDERS: { NAME: '双蛇党', PROGRESS: { Progress: '20' }, RANK: '中立' },
        FLAMES: { NAME: '不滅隊', PROGRESS: { Progress: '0' }, RANK: '中立' },
        MAELSTROM: { NAME: '黒渦団', PROGRESS: { Progress: '100' }, RANK: '盟友' }
    },
    Focus: ['ロールプレイ', 'ギルドオーダー', 'レイド'],
    Seeking: ['TANK', 'HEALER']
});

// 部隊成員的每一頁 [人, 部隊階級]
const MEMBER_PAGES = Object.freeze({ 1: [[HIKARI, 'Master'], [AOI, 'Officer']], 2: [[REED, 'Member']], 3: [[KAEDE, 'Member']] });

function members(page = 1, { pageTotal = 3, people } = {}) {
    const rows = people ?? MEMBER_PAGES[page] ?? [];
    return {
        FreeCompanyID: HIKARI.fc.id,
        Members: rows.map(([who, rank]) => ({
            Avatar: avatarOf(who.id), ID: who.id, Name: who.name,
            FCRank: rank, FCRankIcon: itemIcon(`fc-rank-${rank}`),
            Rank: 'Second Storm Lieutenant', RankIcon: itemIcon('gc-rank'),
            Server: { World: 'Tonberry', DC: 'Elemental' }
        })),
        Pagination: { Page: page, PageTotal: pageTotal, PageNext: page < pageTotal ? page + 1 : null, PagePrev: page > 1 ? page - 1 : null },
        FetchedAt: FETCHED_AT
    };
}

function searchResult(who) {
    return {
        ID: Number(who.id),
        Name: who.name,
        World: who.world,
        DC: who.dc,
        Avatar: avatarOf(who.id),
        FreeCompany: who.fc ? { ID: who.fc.id, Name: who.fc.name } : null
    };
}

function search(people, { page = 1, pageTotal = people.length > 0 ? 1 : 0, total = people.length } = {}) {
    return {
        Results: people.map(searchResult),
        Pagination: { Page: page, PageTotal: pageTotal, Total: total },
        FetchedAt: FETCHED_AT
    };
}

const ok = (body) => ({ status: 200, body });
const fail = (status, error) => ({ status, body: { error } });

const entryOf = (who) => ({ id: who.id, name: who.name, world: who.world, dc: who.dc, avatar: avatarOf(who.id) });
const mineOf = (who) => ({ ...entryOf(who), job: who.job === undefined ? null : who.job, level: levelOf(who) });

module.exports = {
    FETCHED_AT, BARD_ICON, OFFICIAL_ICONS, avatarOf, itemIcon,
    HIKARI, AOI, AOI_YA, AOI_SAWA, REED, MIRA, KAEDE,
    DEFAULT_GEAR, ATTRIBUTES, LEVELS, OCCULT, MOUNTS, MINIONS,
    character, oldCharacter, searchResult, search, ok, fail, entryOf, mineOf,
    classJobs, achievements, mounts, minions, freeCompany, freeCompanyJa, members
};
