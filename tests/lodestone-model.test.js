const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const TOOL_DIR = path.join(ROOT, 'tools/lodestone-lookup');

// 職業與伺服器的資料在共用的 ff14-game-data.js，要比 lodestone-data.js 先載入（路徑照 index.html 的寫法，相對於工具目錄）
const SHARED_DATA = '../../assets/js/ff14-game-data.js';

// ff14-game-data.js、lodestone-data.js 與 lodestone-model.js 都把東西掛在 window 上，所以讓 window 指向 context 本身（同 dungeon-list.test.js）。
// URLSearchParams 是瀏覽器與 Node 才有的全域，vm 的 context 裡沒有，officialSearchUrl() 要用，所以放進去
function loadContext() {
    const context = vm.createContext({ URLSearchParams });
    context.window = context;
    for (const file of [SHARED_DATA, 'lodestone-data.js', 'lodestone-model.js']) {
        vm.runInContext(fs.readFileSync(path.join(TOOL_DIR, file), 'utf8'), context, { filename: file });
    }
    return context;
}

const context = loadContext();
const { LodestoneModel, LODESTONE_JOBS, LODESTONE_BASE_CLASSES, LODESTONE_WORLDS, LODESTONE_TERMS } = context;
// 故意用解構取出：頁面不一定用 LodestoneModel.xxx() 的寫法呼叫，這些函式不能靠 this
const {
    parseInput, jobGroups, maxedCount, activeJob, activeClassJobOf, freeCompanyOf, dcOf, defaultDataLang, characterUrl,
    officialSearchUrl, person, term, isEmptyBio, filterByName, worldLabel
} = LodestoneModel;

// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
    for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
    return Object.freeze(value);
}

const isDeeplyFrozen = (value) => Object.isFrozen(value) &&
    Object.values(value).every((child) => !child || typeof child !== 'object' || isDeeplyFrozen(child));

// ---------- 職業表（官方順序）----------
// [職業鍵, 分組, 繁中官方名稱, 英文官方名稱, 日文官方名稱]
// 繁中照 TERMINOLOGY.md；刻木匠到捕魚人與 Beastmaster 不在 TERMINOLOGY.md 裡（Beastmaster 沒有官方中文名，顯示原文）。
// 英文與日文是 Lodestone 職業頁上的字（Beastmaster 的日文是頁面上的「魔獣使い」）
const JOB_TABLE = [
    ['Paladin', 'tank', '騎士', 'Paladin', 'ナイト'],
    ['Warrior', 'tank', '戰士', 'Warrior', '戦士'],
    ['DarkKnight', 'tank', '暗黑騎士', 'Dark Knight', '暗黒騎士'],
    ['Gunbreaker', 'tank', '絕槍戰士', 'Gunbreaker', 'ガンブレイカー'],
    ['WhiteMage', 'healer', '白魔法師', 'White Mage', '白魔道士'],
    ['Scholar', 'healer', '學者', 'Scholar', '学者'],
    ['Astrologian', 'healer', '占星術士', 'Astrologian', '占星術師'],
    ['Sage', 'healer', '賢者', 'Sage', '賢者'],
    ['Monk', 'melee', '武僧', 'Monk', 'モンク'],
    ['Dragoon', 'melee', '龍騎士', 'Dragoon', '竜騎士'],
    ['Ninja', 'melee', '忍者', 'Ninja', '忍者'],
    ['Samurai', 'melee', '武士', 'Samurai', '侍'],
    ['Reaper', 'melee', '鐮刀客', 'Reaper', 'リーパー'],
    ['Viper', 'melee', '蝮蛇劍士', 'Viper', 'ヴァイパー'],
    ['Beastmaster', 'melee', 'Beastmaster', 'Beastmaster', '魔獣使い'],
    ['Bard', 'ranged', '吟遊詩人', 'Bard', '吟遊詩人'],
    ['Machinist', 'ranged', '機工士', 'Machinist', '機工士'],
    ['Dancer', 'ranged', '舞者', 'Dancer', '踊り子'],
    ['BlackMage', 'magic', '黑魔法師', 'Black Mage', '黒魔道士'],
    ['Summoner', 'magic', '召喚師', 'Summoner', '召喚士'],
    ['RedMage', 'magic', '赤魔法師', 'Red Mage', '赤魔道士'],
    ['Pictomancer', 'magic', '繪靈法師', 'Pictomancer', 'ピクトマンサー'],
    ['BlueMage', 'magic', '青魔法師', 'Blue Mage', '青魔道士'],
    ['Carpenter', 'crafting', '刻木匠', 'Carpenter', '木工師'],
    ['Blacksmith', 'crafting', '鍛鐵匠', 'Blacksmith', '鍛冶師'],
    ['Armorer', 'crafting', '鎧甲匠', 'Armorer', '甲冑師'],
    ['Goldsmith', 'crafting', '雕金匠', 'Goldsmith', '彫金師'],
    ['Leatherworker', 'crafting', '製革匠', 'Leatherworker', '革細工師'],
    ['Weaver', 'crafting', '裁縫匠', 'Weaver', '裁縫師'],
    ['Alchemist', 'crafting', '煉金術士', 'Alchemist', '錬金術師'],
    ['Culinarian', 'crafting', '烹調師', 'Culinarian', '調理師'],
    ['Miner', 'gathering', '採礦工', 'Miner', '採掘師'],
    ['Botanist', 'gathering', '園藝工', 'Botanist', '園芸師'],
    ['Fisher', 'gathering', '捕魚人', 'Fisher', '漁師']
];
const OFFICIAL_ORDER = JOB_TABLE.map(([key]) => key);
const ROLE_ORDER = ['tank', 'healer', 'melee', 'ranged', 'magic', 'crafting', 'gathering'];
const ROLE_SIZES = [4, 4, 7, 3, 5, 8, 3];
const nameIn = (key, lang) => JOB_TABLE.find(([jobKey]) => jobKey === key)[{ zh: 2, en: 3, ja: 4 }[lang]];
// 網站的職業圖示：assets/images/se/FFXIVJobIcons/ 底下的路徑。Beastmaster 沒有圖示，不在這裡
const ICON_PATHS = {
    Paladin: '01_TANK/Job/Paladin.png', Warrior: '01_TANK/Job/Warrior.png', DarkKnight: '01_TANK/Job/DarkKnight.png', Gunbreaker: '01_TANK/Job/Gunbreaker.png',
    WhiteMage: '02_HEALER/Job/WhiteMage.png', Scholar: '02_HEALER/Job/Scholar.png', Astrologian: '02_HEALER/Job/Astrologian.png', Sage: '02_HEALER/Job/Sage.png',
    Monk: '03_DPS/Job/Monk.png', Dragoon: '03_DPS/Job/Dragoon.png', Ninja: '03_DPS/Job/Ninja.png', Samurai: '03_DPS/Job/Samurai.png',
    Reaper: '03_DPS/Job/Reaper.png', Viper: '03_DPS/Job/Viper.png',
    Bard: '03_DPS/Job/Bard.png', Machinist: '03_DPS/Job/Machinist.png', Dancer: '03_DPS/Job/Dancer.png',
    BlackMage: '03_DPS/Job/BlackMage.png', Summoner: '03_DPS/Job/Summoner.png', RedMage: '03_DPS/Job/RedMage.png', Pictomancer: '03_DPS/Job/Pictomancer.png',
    BlueMage: '06_LIMITED/BlueMage.png',
    Carpenter: '04_CRAFTER/Carpenter.png', Blacksmith: '04_CRAFTER/Blacksmith.png', Armorer: '04_CRAFTER/Armorer.png', Goldsmith: '04_CRAFTER/Goldsmith.png',
    Leatherworker: '04_CRAFTER/Leatherworker.png', Weaver: '04_CRAFTER/Weaver.png', Alchemist: '04_CRAFTER/Alchemist.png', Culinarian: '04_CRAFTER/Culinarian.png',
    Miner: '05_GATHERER/Miner.png', Botanist: '05_GATHERER/Botanist.png', Fisher: '05_GATHERER/Fisher.png'
};

// ---------- Worker 的職業回答 ----------
// 照 Worker 的 /character/<id>/classjob：職業分在 CombatJobs 的五組、CraftingJobs、GatheringJobs 裡，
// 每一個職業是 { Level, CurrentEXP, MaxEXP, UnlockState }，Level 是字串，沒解鎖是 '-'。
// 網站不照 Worker 放的組分，照 LODESTONE_JOBS 的 role；這裡寫出 Worker 的分法，是為了做出和真的回答一樣的資料
const WORKER_GROUPS = {
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

function workerRow(level, shown) {
    const locked = level === '-';
    return {
        Level: level,
        UnlockState: shown,
        CurrentEXP: locked ? '-' : '1,234,567',
        MaxEXP: locked ? '-' : '5,992,000'
    };
}

// levels：職業鍵 → Level 字串（沒寫的是 '-'）；shown：職業鍵 → 官網那一列寫的名字（沒寫的是職業鍵）
function classJobsAnswer(levels = {}, shown = {}) {
    const rowOf = (key) => workerRow(levels[key] ?? '-', shown[key] ?? key);
    const group = (keys) => Object.fromEntries(keys.map((key) => [key, rowOf(key)]));
    return {
        CharacterID: 12345678,
        ClassJobs: {
            CombatJobs: Object.fromEntries(Object.entries(WORKER_GROUPS.CombatJobs).map(([name, keys]) => [name, group(keys)])),
            CraftingJobs: group(WORKER_GROUPS.CraftingJobs),
            GatheringJobs: group(WORKER_GROUPS.GatheringJobs),
            SpecialContent: { Bozja: { Name: 'Knowledge Level', Level: '3', Mettle: '716' } }
        },
        FetchedAt: '2026-11-08T02:30:00.000Z'
    };
}

const groupsOf = (classJobs, lang = 'zh') => plain(jobGroups(classJobs, lang));
const jobsOf = (groups) => Object.fromEntries(groups.flatMap((group) => group.jobs.map((job) => [job.key, job])));

// ---------- TERMINOLOGY.md ----------
// 以 ## 標題分區（### 底下的列算進它上面的 ##），每一列是一個陣列；表頭與分隔線不算
function terminologyTables() {
    const sections = new Map();
    let rows = null;
    for (const line of fs.readFileSync(path.join(ROOT, 'TERMINOLOGY.md'), 'utf8').split('\n')) {
        if (line.startsWith('## ')) {
            rows = [];
            sections.set(line.slice(3).trim(), rows);
        } else if (rows && line.startsWith('|')) {
            const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
            if (!cells.every((cell) => /^-+$/.test(cell)) && cells[0] !== '英文') rows.push(cells);
        }
    }
    return sections;
}
const terminology = terminologyTables();

// ---------- 原文 → 官方中文 ----------
// [種類, 原文, 官方中文]：英文與日文的原文都要認得（Lodestone 角色頁與部隊頁會依 dc 送出英文或日文）。
// 聲望的日文只有「中立」「盟友」是在官網日文部隊頁上看過的，其他四級只有英文原文
const TERM_ROWS = [
    ['focus', 'Role-playing', '角色扮演'], ['focus', 'ロールプレイ', '角色扮演'],
    ['focus', 'Leveling', '練級'], ['focus', 'レベリング', '練級'],
    ['focus', 'Casual', '休閒'], ['focus', 'カジュアル', '休閒'],
    ['focus', 'Hardcore', '硬派'], ['focus', 'ハードコア', '硬派'],
    ['focus', 'Dungeons', '迷宮'], ['focus', 'ダンジョン', '迷宮'],
    ['focus', 'Guildhests', '公會令'], ['focus', 'ギルドオーダー', '公會令'],
    ['focus', 'Trials', '討伐殲滅戰'], ['focus', '討伐・討滅戦', '討伐殲滅戰'],
    ['focus', 'Raids', '大型任務'], ['focus', 'レイド', '大型任務'],
    ['focus', 'PvP', 'PvP'],
    ['seeking', 'Tank', '坦克'], ['seeking', 'TANK', '坦克'],
    ['seeking', 'Healer', '治療'], ['seeking', 'HEALER', '治療'],
    ['seeking', 'DPS', '輸出'],
    ['seeking', 'Crafter', '生產職'], ['seeking', 'CRAFTER', '生產職'],
    ['seeking', 'Gatherer', '採集職'], ['seeking', 'GATHERER', '採集職'],
    ['grandCompany', 'Maelstrom', '黑渦團'], ['grandCompany', '黒渦団', '黑渦團'],
    ['grandCompany', 'Order of the Twin Adder', '雙蛇黨'], ['grandCompany', '双蛇党', '雙蛇黨'],
    ['grandCompany', 'Immortal Flames', '不滅隊'], ['grandCompany', '不滅隊', '不滅隊'],
    ['reputation', 'Neutral', '中立'], ['reputation', '中立', '中立'],
    ['reputation', 'Friendly', '友好'],
    ['reputation', 'Trusted', '信賴'],
    ['reputation', 'Respected', '敬重'],
    ['reputation', 'Honored', '崇敬'],
    ['reputation', 'Allied', '同盟'], ['reputation', '盟友', '同盟'],
    ['town', 'Limsa Lominsa', '利姆薩·羅敏薩'], ['town', 'リムサ・ロミンサ', '利姆薩·羅敏薩'],
    ['town', 'Gridania', '格里達尼亞'], ['town', 'グリダニア', '格里達尼亞'],
    ['town', "Ul'dah", '烏爾達哈'], ['town', 'ウルダハ', '烏爾達哈']
];

// ---------- 職業表與其他資料 ----------

test('LODESTONE_JOBS：官方順序的 34 個職業，分成七組，名稱是繁中、英文、日文官方名', () => {
    assert.equal(LODESTONE_JOBS.length, 34);
    assert.equal(JOB_TABLE.length, 34);
    assert.deepEqual(
        plain(LODESTONE_JOBS.map(({ key, role, names }) => [key, role, names.zh, names.en, names.ja])),
        JOB_TABLE
    );
    // 每一筆只有這五個欄位，names 只有三種語言
    for (const job of LODESTONE_JOBS) {
        assert.deepEqual(Object.keys(job).sort(), ['icon', 'key', 'limited', 'names', 'role'], job.key);
        assert.deepEqual(Object.keys(job.names).sort(), ['en', 'ja', 'zh'], job.key);
    }
    // 七組的順序與各組的職業數：坦克 4、治療 4、近戰 7（含蝮蛇劍士、Beastmaster）、遠程 3、魔法 5（含繪靈法師、青魔法師）、生產 8、採集 3
    const roles = [...new Set(LODESTONE_JOBS.map((job) => job.role))];
    assert.deepEqual(roles, ROLE_ORDER);
    assert.deepEqual(roles.map((role) => LODESTONE_JOBS.filter((job) => job.role === role).length), ROLE_SIZES);
    assert.equal(new Set(LODESTONE_JOBS.map((job) => job.key)).size, 34, '職業鍵不重複');
});

test('LODESTONE_JOBS：繁中與英文名稱照 TERMINOLOGY.md，大國防聯軍與副本類型的用語也照它', () => {
    const jobs = terminology.get('職業相關');
    assert.equal(jobs.length, 22, 'TERMINOLOGY.md 的職業表有 22 列（解析沒有壞）');
    for (const [english, chinese] of jobs) {
        const job = LODESTONE_JOBS.find((candidate) => candidate.key === english.replace(/ /g, ''));
        assert.ok(job, `${english} 不在 LODESTONE_JOBS 裡`);
        assert.equal(job.names.zh, chinese, `${english} 的繁中名稱`);
        assert.equal(job.names.en, english, `${english} 的英文名稱`);
    }
    // 英文名稱就是職業鍵在大小寫交界處加一個空白（DarkKnight → Dark Knight），所有職業都一樣
    for (const job of LODESTONE_JOBS) assert.equal(job.names.en, job.key.replace(/([a-z])([A-Z])/g, '$1 $2'), job.key);

    // 用語：大國防聯軍的名稱與總部所在的開始城市，副本類型的名稱
    const companies = terminology.get('大國防聯軍 (Grand Company)');
    assert.equal(companies.length, 3);
    const headquarters = { Maelstrom: 'Limsa Lominsa', 'Order of the Twin Adder': 'Gridania', 'Immortal Flames': "Ul'dah" };
    for (const [english, chinese, city] of companies) {
        assert.equal(term('grandCompany', english, 'zh'), chinese, english);
        assert.equal(term('town', headquarters[english], 'zh'), city, headquarters[english]);
    }
    const duties = new Map(terminology.get('副本類型'));
    assert.equal(term('focus', 'Dungeons', 'zh'), duties.get('Dungeon'));
    assert.equal(term('focus', 'Trials', 'zh'), duties.get('Trial'));
    assert.equal(term('focus', 'Raids', 'zh'), duties.get('Raid'));
    assert.equal(term('focus', 'Guildhests', 'zh'), duties.get('Guildhest'));
});

test('LODESTONE_JOBS：限定職業只有青魔法師與 Beastmaster，圖示是網站職業圖示目錄底下的路徑（Beastmaster 沒有）而且檔案存在', () => {
    assert.deepEqual(Array.from(LODESTONE_JOBS.filter((job) => job.limited), (job) => job.key), ['Beastmaster', 'BlueMage']);
    assert.equal(Object.keys(ICON_PATHS).length, 33, '34 個職業裡只有 Beastmaster 沒有圖示');
    for (const job of LODESTONE_JOBS) {
        assert.equal(typeof job.limited, 'boolean', job.key);
        if (job.key === 'Beastmaster') {
            assert.equal(job.icon, null, 'Beastmaster 沒有圖示，頁面用文字圖示');
            continue;
        }
        assert.equal(job.icon, ICON_PATHS[job.key], `${job.key} 的圖示路徑`);
        const file = path.join(ROOT, 'assets/images/se/FFXIVJobIcons', job.icon);
        assert.ok(fs.existsSync(file), `${job.key} 的圖示檔不存在：${job.icon}`);
    }
});

test('LODESTONE_BASE_CLASSES：九個基本職業各放進它的職業那一格', () => {
    assert.deepEqual(plain(LODESTONE_BASE_CLASSES), {
        Gladiator: 'Paladin', Marauder: 'Warrior', Conjurer: 'WhiteMage', Arcanist: 'Summoner', Pugilist: 'Monk',
        Lancer: 'Dragoon', Rogue: 'Ninja', Archer: 'Bard', Thaumaturge: 'BlackMage'
    });
    for (const [baseClass, jobKey] of Object.entries(LODESTONE_BASE_CLASSES)) {
        assert.ok(OFFICIAL_ORDER.includes(jobKey), `${baseClass} 對到的 ${jobKey} 要是 LODESTONE_JOBS 裡的職業`);
        assert.ok(!OFFICIAL_ORDER.includes(baseClass), `${baseClass} 是基本職業，不能同時是職業鍵`);
    }
});

test('LODESTONE_WORLDS：11 個資料中心與 85 個伺服器，值就是官網 worldname 的值', () => {
    const { dcs, worlds } = LODESTONE_WORLDS;
    assert.deepEqual(Object.keys(LODESTONE_WORLDS), ['dcs', 'worlds']);
    // 資料中心：照官網的順序，值帶 _dc_（顯示時才去掉，見 worldLabel）
    assert.equal(dcs.length, 11);
    assert.deepEqual(plain(dcs), [
        '_dc_Aether', '_dc_Crystal', '_dc_Dynamis', '_dc_Primal', '_dc_Chaos', '_dc_Light',
        '_dc_Materia', '_dc_Elemental', '_dc_Gaia', '_dc_Mana', '_dc_Meteor'
    ]);
    // 伺服器：照官網的字母順序
    assert.equal(worlds.length, 85);
    assert.deepEqual(plain(worlds.slice(0, 4)), ['Adamantoise', 'Aegis', 'Alexander', 'Alpha']);
    assert.deepEqual(plain(worlds.slice(-4)), ['Zalera', 'Zeromus', 'Zodiark', 'Zurvan']);
    assert.deepEqual(plain(worlds), [...worlds].sort(), '伺服器照字母順序');
    assert.equal(new Set(worlds).size, 85, '伺服器不重複');
    assert.ok(worlds.every((name) => /^[A-Z][a-z]+$/.test(name)), '伺服器名稱是一個英文單字');
    assert.ok(!worlds.some((name) => name.startsWith('_dc_')), '伺服器不帶 _dc_');
    // 頁面測試與搜尋用到的幾個
    for (const name of ['Tonberry', 'Tiamat', 'Bahamut', 'Zurvan']) assert.ok(worlds.includes(name), name);
    assert.ok(dcs.includes('_dc_Elemental') && dcs.includes('_dc_Gaia'));
});

test('LODESTONE_TERMS：五種原文對照表的內容一筆不多一筆不少，認得英文與日文原文', () => {
    assert.deepEqual(Object.keys(LODESTONE_TERMS), ['focus', 'seeking', 'grandCompany', 'reputation', 'town']);
    // 沒有重複的 (種類, 原文)，下面比對才有意義
    assert.equal(new Set(TERM_ROWS.map(([kind, original]) => `${kind}\u0000${original}`)).size, TERM_ROWS.length);
    for (const kind of Object.keys(LODESTONE_TERMS)) {
        const expected = TERM_ROWS.filter(([rowKind]) => rowKind === kind).map(([, original]) => original);
        assert.deepEqual(Object.keys(LODESTONE_TERMS[kind]).sort(), expected.sort(), `${kind} 的原文`);
    }
    for (const [kind, original, chinese] of TERM_ROWS) {
        assert.equal(LODESTONE_TERMS[kind][original], chinese, `${kind} ${original}`);
    }
});

test('中文用語不用舊的錯誤寫法', () => {
    const chinese = [
        ...LODESTONE_JOBS.map((job) => job.names.zh),
        ...Object.values(LODESTONE_TERMS).flatMap((table) => Object.values(table))
    ];
    assert.equal(chinese.length, LODESTONE_JOBS.length + TERM_ROWS.length, '34 個職業名稱加上每一筆原文對照');
    for (const text of chinese) {
        for (const wrong of ['恆輝隊', '魔道士', '召喚士', '鐮刀師', '毒蛇使', '大國防軍']) {
            assert.ok(!text.includes(wrong), `「${text}」含有舊的寫法「${wrong}」`);
        }
        // 「公會」只能出現在「公會令」裡（部隊是 Free Company）
        assert.ok(!text.replace(/公會令/g, '').includes('公會'), `「${text}」`);
    }
});

test('資料與模組都是凍結的（深層）', () => {
    assert.ok(Object.isFrozen(LodestoneModel));
    assert.deepEqual(Object.keys(LodestoneModel).sort(), [
        'activeClassJobOf', 'activeJob', 'characterUrl', 'dcOf', 'defaultDataLang', 'filterByName', 'freeCompanyOf', 'isEmptyBio', 'jobGroups',
        'maxedCount', 'officialSearchUrl', 'parseInput', 'person', 'term', 'worldLabel'
    ]);
    for (const [name, data] of Object.entries({ LODESTONE_JOBS, LODESTONE_BASE_CLASSES, LODESTONE_WORLDS, LODESTONE_TERMS })) {
        assert.ok(isDeeplyFrozen(data), `${name} 要深層凍結`);
    }
});

test('lodestone-data.js 提供目前的 script.js 用到的每一個 LODESTONE_ 全域', () => {
    // 頁面讀的資料都要由 lodestone-data.js 提供；拿掉資料檔裡的全域之前，這個測試擋住頁面還在讀它的情況
    const script = fs.readFileSync(path.join(TOOL_DIR, 'script.js'), 'utf8');
    for (const name of new Set(script.match(/\bLODESTONE_[A-Z_]+\b/g) || [])) {
        assert.notEqual(context[name], undefined, `script.js 用到 ${name}，lodestone-data.js 要提供`);
    }
});

// ---------- 輸入框 ----------

test('parseInput：角色頁網址取出 ID，不管哪個地區站、有沒有 https、後面接什麼', () => {
    const id = (text) => plain(parseInput(text));
    assert.deepEqual(id('https://na.finalfantasyxiv.com/lodestone/character/12345678/?page=2'), { kind: 'id', id: '12345678' });
    assert.deepEqual(id('https://jp.finalfantasyxiv.com/lodestone/character/12345678'), { kind: 'id', id: '12345678' });
    assert.deepEqual(id('  https://eu.finalfantasyxiv.com/lodestone/character/12345678/class_job/#top\n'), { kind: 'id', id: '12345678' });
    assert.deepEqual(id('na.finalfantasyxiv.com/lodestone/character/12345678/'), { kind: 'id', id: '12345678' });
    assert.deepEqual(id('HTTPS://NA.FINALFANTASYXIV.COM/lodestone/character/12345678/'), { kind: 'id', id: '12345678' });
    assert.deepEqual(id('\u200Bhttps://na.finalfantasyxiv.com/lodestone/character/12345678/\u200B'), { kind: 'id', id: '12345678' }, '複製時夾帶的零寬字元不算');
    // 不是 Lodestone 的網址、ID 後面還黏著字，都不是角色頁網址：當成名字
    for (const text of [
        'https://example.com/lodestone/character/12345678/',
        'https://evilfinalfantasyxiv.com/lodestone/character/12345678/',
        'https://finalfantasyxiv.com.example.com/lodestone/character/12345678/',
        'https://na.finalfantasyxiv.com/lodestone/character/12345678abc/'
    ]) {
        assert.deepEqual(id(text), { kind: 'name', name: text }, text);
    }
});

test('parseInput：去掉空白後全是數字就是 ID（全形數字與零寬字元先換掉），其他是去掉前後空白的名字，空白是 empty', () => {
    const parsed = (text) => plain(parseInput(text));
    assert.deepEqual(parsed(' 12345678 '), { kind: 'id', id: '12345678' });
    assert.deepEqual(parsed('12345678'), { kind: 'id', id: '12345678' });
    assert.deepEqual(parsed('1234 5678\n'), { kind: 'id', id: '12345678' }, '去掉空白後全是數字');
    assert.deepEqual(parsed(12345678), { kind: 'id', id: '12345678' }, '數字也行');
    // 日文輸入法預設打出全形數字；從網頁或通訊軟體複製時可能夾帶看不見的零寬字元
    assert.deepEqual(parsed('１２３４５６７８'), { kind: 'id', id: '12345678' }, '全形數字也是 ID');
    assert.deepEqual(parsed(' １２３４　５６７８　'), { kind: 'id', id: '12345678' }, '全形數字中間有全形空白');
    assert.deepEqual(parsed('\u200B12345678\uFEFF'), { kind: 'id', id: '12345678' }, '前後的零寬字元');
    assert.deepEqual(parsed('1234\u200C5678\u2060'), { kind: 'id', id: '12345678' }, '中間的零寬字元');

    // 名字：撇號、連字號原樣留著，不被當成 ID；只去掉前後空白（含全形空白），中間的空白不動
    assert.deepEqual(parsed("  Y'shtola Rhul "), { kind: 'name', name: "Y'shtola Rhul" });
    assert.deepEqual(parsed("A'lu-ne Moku"), { kind: 'name', name: "A'lu-ne Moku" });
    assert.deepEqual(parsed('　Hikari Senshi　'), { kind: 'name', name: 'Hikari Senshi' });
    assert.deepEqual(parsed('Hikari  Senshi'), { kind: 'name', name: 'Hikari  Senshi' });
    assert.deepEqual(parsed('12345678a'), { kind: 'name', name: '12345678a' });
    assert.deepEqual(parsed('Hikari 2'), { kind: 'name', name: 'Hikari 2' });
    assert.deepEqual(parsed('１２３４５６７８ａ'), { kind: 'name', name: '１２３４５６７８ａ' }, '換成半形之後不全是數字：名字照原樣');
    assert.deepEqual(parsed('\u200BHikari Senshi\u200D'), { kind: 'name', name: 'Hikari Senshi' }, '名字前後的零寬字元也去掉');

    for (const text of ['', '   ', '　 \n', '\u200B', ' \u200B\uFEFF ', undefined, null]) assert.deepEqual(parsed(text), { kind: 'empty' }, JSON.stringify(text));
});

// ---------- 職業 ----------

test('jobGroups：官方順序的七組，名稱跟著介面語言，沒有資料時每個職業都是 null', () => {
    const groups = groupsOf(null);
    assert.deepEqual(groups.map((group) => group.role), ROLE_ORDER);
    assert.deepEqual(groups.map((group) => group.jobs.length), ROLE_SIZES);
    assert.deepEqual(groups.flatMap((group) => group.jobs.map((job) => job.key)), OFFICIAL_ORDER);
    for (const job of groups.flatMap((group) => group.jobs)) {
        assert.deepEqual(Object.keys(job).sort(), ['icon', 'key', 'level', 'max', 'name'], job.key);
        assert.equal(job.level, null, job.key);
        assert.equal(job.max, false, job.key);
    }
    // 名稱：三種介面語言
    for (const lang of ['zh', 'en', 'ja']) {
        const names = groupsOf(null, lang).flatMap((group) => group.jobs.map((job) => job.name));
        assert.deepEqual(names, OFFICIAL_ORDER.map((key) => nameIn(key, lang)), lang);
    }
    // 不認得的介面語言用網站預設的中文
    assert.equal(groupsOf(null, 'fr')[0].jobs[0].name, '騎士');
    assert.equal(groupsOf(null, undefined)[0].jobs[0].name, '騎士');
    // 圖示：LODESTONE_JOBS 的路徑，Beastmaster 沒有
    const jobs = jobsOf(groups);
    assert.equal(jobs.Paladin.icon, '01_TANK/Job/Paladin.png');
    assert.equal(jobs.BlueMage.icon, '06_LIMITED/BlueMage.png');
    assert.equal(jobs.Fisher.icon, '05_GATHERER/Fisher.png');
    assert.equal(jobs.Beastmaster.icon, null);
    // 沒有資料的各種樣子都一樣
    for (const empty of [undefined, {}, 'garbage', 42, { CombatJobs: null, CraftingJobs: 'x' }, { ClassJobs: null }]) {
        assert.deepEqual(groupsOf(empty), groups, JSON.stringify(empty));
    }
});

test('jobGroups：等級照 Worker 的字串，Lv100 才是滿級，限定職業不標滿級，基本職業放在職業那一格', () => {
    const answer = classJobsAnswer(
        {
            Paladin: '30', Warrior: '100', DarkKnight: '-', Gunbreaker: '0',
            Viper: '100', Beastmaster: '50', Bard: '100', Dancer: '99', Pictomancer: '91', BlueMage: '80',
            Miner: '100', Fisher: '13'
        },
        // 還沒轉職的騎士，官網那一列寫的是基本職業 Gladiator
        { Paladin: 'Gladiator' }
    );
    const jobs = jobsOf(groupsOf(answer.ClassJobs));
    const summary = (key) => [jobs[key].name, jobs[key].level, jobs[key].max];
    assert.deepEqual(summary('Paladin'), ['騎士', 30, false], '基本職業 Gladiator 30 級放在騎士那一格，顯示職業的名稱');
    assert.deepEqual(summary('Warrior'), ['戰士', 100, true]);
    assert.deepEqual(summary('DarkKnight'), ['暗黑騎士', null, false], "'-' 是沒解鎖");
    assert.deepEqual(summary('Gunbreaker'), ['絕槍戰士', null, false], "'0' 也是沒解鎖");
    assert.deepEqual(summary('Viper'), ['蝮蛇劍士', 100, true]);
    assert.deepEqual(summary('Beastmaster'), ['Beastmaster', 50, false]);
    assert.deepEqual(summary('Bard'), ['吟遊詩人', 100, true]);
    assert.deepEqual(summary('Dancer'), ['舞者', 99, false], '99 級不是滿級');
    assert.deepEqual(summary('Pictomancer'), ['繪靈法師', 91, false]);
    assert.deepEqual(summary('BlueMage'), ['青魔法師', 80, false]);
    assert.deepEqual(summary('Miner'), ['採礦工', 100, true]);
    assert.deepEqual(summary('Fisher'), ['捕魚人', 13, false]);
    assert.deepEqual(summary('Monk'), ['武僧', null, false], '沒解鎖的職業在回答裡是 "-"');
    // 基本職業的鍵不會多出一格
    assert.ok(!('Gladiator' in jobs));

    // 限定職業就算寫到 100 也不標滿級（它們的等級上限不是 100）
    const capped = jobsOf(groupsOf(classJobsAnswer({ Beastmaster: '100', BlueMage: '100', Reaper: '100' }).ClassJobs));
    assert.deepEqual([capped.Beastmaster.level, capped.Beastmaster.max], [100, false]);
    assert.deepEqual([capped.BlueMage.level, capped.BlueMage.max], [100, false]);
    assert.deepEqual([capped.Reaper.level, capped.Reaper.max], [100, true]);
});

test('jobGroups：職業的位置照 LODESTONE_JOBS，不照 Worker 放的組，也不照鍵在回答裡的順序', () => {
    const answer = classJobsAnswer({ Viper: '80', Warrior: '60', Fisher: '5' });
    // 把蝮蛇劍士搬到遠程那一組、整份回答的鍵倒過來排：結果不變
    const { Viper } = answer.ClassJobs.CombatJobs.MeleeDPS;
    delete answer.ClassJobs.CombatJobs.MeleeDPS.Viper;
    answer.ClassJobs.CombatJobs.RangedDPS.Viper = Viper;
    const reversed = {
        ...answer,
        ClassJobs: {
            GatheringJobs: Object.fromEntries(Object.entries(answer.ClassJobs.GatheringJobs).reverse()),
            CraftingJobs: Object.fromEntries(Object.entries(answer.ClassJobs.CraftingJobs).reverse()),
            CombatJobs: Object.fromEntries(Object.entries(answer.ClassJobs.CombatJobs).reverse())
        }
    };
    const groups = groupsOf(reversed.ClassJobs);
    assert.deepEqual(groups.flatMap((group) => group.jobs.map((job) => job.key)), OFFICIAL_ORDER);
    assert.equal(groups.find((group) => group.role === 'melee').jobs.find((job) => job.key === 'Viper').level, 80);
    assert.equal(groups.find((group) => group.role === 'ranged').jobs.some((job) => job.key === 'Viper'), false);
    // 特殊內容（優雷卡、博茲雅）不是職業，由頁面另外寫一行
    assert.equal(groups.flatMap((group) => group.jobs).length, 34);
});

test('jobGroups：整份 Worker 回答（有 ClassJobs 那一層）也行；等級的各種寫法', () => {
    const answer = classJobsAnswer({ Warrior: '100', Bard: '90' });
    assert.deepEqual(groupsOf(answer), groupsOf(answer.ClassJobs));
    assert.equal(jobsOf(groupsOf(answer)).Bard.level, 90);

    const level = (value) => {
        const input = classJobsAnswer({ Bard: '1' }).ClassJobs;
        input.CombatJobs.RangedDPS.Bard.Level = value;
        return jobsOf(groupsOf(input)).Bard;
    };
    assert.equal(level('100').level, 100);
    assert.equal(level(100).level, 100, '數字也行');
    assert.equal(level(' 70 ').level, 70);
    assert.equal(level('1').level, 1);
    for (const bad of ['-', '0', 0, '', '  ', 'abc', '12abc', '--', null, undefined, NaN, '-5']) {
        assert.equal(level(bad).level, null, `Level ${JSON.stringify(bad)}`);
        assert.equal(level(bad).max, false);
    }
    // 回答裡缺一整列、缺一整組
    const partial = classJobsAnswer({ Monk: '70' }).ClassJobs;
    delete partial.CombatJobs.MeleeDPS.Monk;
    delete partial.CraftingJobs;
    delete partial.GatheringJobs;
    const jobs = jobsOf(groupsOf(partial));
    assert.equal(jobs.Monk.level, null);
    assert.equal(jobs.Carpenter.level, null);
    assert.equal(jobs.Miner.level, null);
    assert.equal(Object.keys(jobs).length, 34);
});

test('jobGroups：每次都回新的物件，改它不會影響下一次', () => {
    const first = jobGroups(null, 'zh');
    first[0].jobs[0].level = 99;
    first[0].jobs[0].name = '被改過';
    first[0].jobs.pop();
    first.pop();
    const second = jobGroups(null, 'zh');
    assert.equal(second.length, 7);
    assert.equal(second[0].jobs.length, 4);
    assert.equal(second[0].jobs[0].level, null);
    assert.equal(second[0].jobs[0].name, '騎士');
    assert.equal(LODESTONE_JOBS[0].names.zh, '騎士');
});

test('maxedCount：數滿級（Lv100 而且不是限定職業）的職業', () => {
    const answer = classJobsAnswer({
        Warrior: '100', Viper: '100', Bard: '100', Miner: '100', Beastmaster: '100', BlueMage: '100', Paladin: '99', Fisher: '13'
    }, { Paladin: 'Gladiator' });
    assert.equal(maxedCount(jobGroups(answer.ClassJobs, 'zh')), 4);
    assert.equal(maxedCount(jobGroups(answer.ClassJobs, 'ja')), 4, '和介面語言無關');
    assert.equal(maxedCount(jobGroups(null, 'zh')), 0);
    assert.equal(maxedCount([]), 0);
    assert.equal(maxedCount(jobGroups(classJobsAnswer(Object.fromEntries(OFFICIAL_ORDER.map((key) => [key, '100']))).ClassJobs, 'en')), 32,
        '34 個職業全部 100 級也只有 32 個滿級（青魔法師與 Beastmaster 不算）');
});

test('activeJob：Key 對到職業用網站的名稱與圖示，基本職業換成它的職業', () => {
    const officialIcon = 'https://lds-img.finalfantasyxiv.com/h/x/KWI-9P3RX_Ojjn_mwCS2N0-3TI.png';
    const active = (value, lang = 'zh') => plain(activeJob(value, lang));

    assert.deepEqual(active({ Key: 'Bard', Level: 100, Icon: officialIcon }),
        { key: 'Bard', name: '吟遊詩人', icon: '03_DPS/Job/Bard.png', level: 100 }, '用網站的圖示，不用官網的');
    assert.equal(active({ Key: 'Dancer', Level: 83, Icon: officialIcon }, 'en').name, 'Dancer');
    assert.equal(active({ Key: 'Dancer', Level: 83, Icon: officialIcon }, 'ja').name, '踊り子');
    assert.equal(active({ Key: 'Dancer', Level: 83, Icon: officialIcon }, 'zh').name, '舞者');
    assert.deepEqual(active({ Key: 'Viper', Level: 80 }, 'zh'),
        { key: 'Viper', name: '蝮蛇劍士', icon: '03_DPS/Job/Viper.png', level: 80 }, '沒有官網圖示也行');

    // 基本職業：Gladiator 30 級 → 騎士 Lv30，圖示也是騎士的
    assert.deepEqual(active({ Key: 'Gladiator', Level: 30, Icon: officialIcon }),
        { key: 'Paladin', name: '騎士', icon: '01_TANK/Job/Paladin.png', level: 30 });
    for (const [baseClass, jobKey] of Object.entries(LODESTONE_BASE_CLASSES)) {
        const result = active({ Key: baseClass, Level: 12, Icon: officialIcon }, 'en');
        assert.equal(result.key, jobKey, baseClass);
        assert.equal(result.name, nameIn(jobKey, 'en'), baseClass);
        assert.equal(result.icon, LODESTONE_JOBS.find((job) => job.key === jobKey).icon, baseClass);
        assert.equal(result.level, 12, baseClass);
    }

    // Beastmaster 沒有網站的圖示：icon 是 null，頁面用文字圖示
    assert.deepEqual(active({ Key: 'Beastmaster', Level: 50, Icon: officialIcon }),
        { key: 'Beastmaster', name: 'Beastmaster', icon: null, level: 50 });
});

test('activeJob：Key 是 null 或對不到時沒有名稱，圖示用官網的；沒有 ActiveClassJob 是 null', () => {
    const officialIcon = 'https://lds-img.finalfantasyxiv.com/h/d/some-icon.png';
    const active = (value, lang = 'zh') => plain(activeJob(value, lang));

    assert.deepEqual(active({ Key: null, Level: 87, Icon: officialIcon }), { key: null, name: null, icon: officialIcon, level: 87 });
    assert.deepEqual(active({ Key: 'SomethingNew', Level: 5, Icon: officialIcon }), { key: null, name: null, icon: officialIcon, level: 5 });
    assert.deepEqual(active({ Level: 5, Icon: officialIcon }), { key: null, name: null, icon: officialIcon, level: 5 }, '沒有 Key');
    assert.deepEqual(active({ Key: null, Level: 5 }), { key: null, name: null, icon: null, level: 5 }, '官網圖示也沒有');
    assert.deepEqual(active({ Key: 'Bard' }), { key: 'Bard', name: '吟遊詩人', icon: '03_DPS/Job/Bard.png', level: null }, '沒有等級');
    assert.equal(active({ Key: 'Bard', Level: 0 }).level, null);
    assert.equal(active({ Key: 'Bard', Level: '45' }).level, 45);
    // 跟 Object.prototype 同名的 Key 不會被當成職業或基本職業
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
        assert.deepEqual(active({ Key: key, Level: 1, Icon: officialIcon }), { key: null, name: null, icon: officialIcon, level: 1 }, key);
    }

    for (const missing of [undefined, null, '', 0, 'Bard']) assert.equal(activeJob(missing, 'zh'), null, String(missing));
});

// ---------- 新舊 Worker 的目前職業與部隊 ----------

test('activeClassJobOf：新 Worker 的 ActiveClassJob 原樣回傳；舊 Worker 的官網圖示網址與等級換成 Key 是 null 的 ActiveClassJob；都沒有是 undefined', () => {
    const officialIcon = 'https://lds-img.finalfantasyxiv.com/h/F/KWI-9P3RX_Ojjn_mwCS2N0-3TI.png';
    // 新 Worker（也還留著舊的兩個欄位）：用 ActiveClassJob
    const fresh = { ActiveClassJob: { Key: 'Bard', Level: 100, Icon: officialIcon }, ActiveClassjob: officialIcon, ActiveClassjobLevel: { Level: '100' } };
    assert.ok(activeClassJobOf(fresh) === fresh.ActiveClassJob, '原樣回傳');
    // 舊 Worker（現在正式站的）：沒有 ActiveClassJob，目前職業只有官網的圖示網址（ActiveClassjob）與等級（ActiveClassjobLevel）
    const old = { ActiveClassjob: officialIcon, ActiveClassjobLevel: { Level: '100' } };
    assert.deepEqual(plain(activeClassJobOf(old)), { Key: null, Level: '100', Icon: officialIcon });
    assert.deepEqual(plain(activeJob(activeClassJobOf(old), 'zh')), { key: null, name: null, icon: officialIcon, level: 100 }, '標頭寫官網的圖示加 Lv100');
    assert.deepEqual(plain(activeClassJobOf({ ...old, ActiveClassJob: null })), { Key: null, Level: '100', Icon: officialIcon }, 'ActiveClassJob 是 null 也看舊的欄位');
    assert.deepEqual(plain(activeClassJobOf({ ActiveClassjob: '', ActiveClassjobLevel: { Level: '90' } })), { Key: null, Level: '90', Icon: null }, '沒有圖示只有等級');
    assert.deepEqual(plain(activeClassJobOf({ ActiveClassjob: officialIcon })), { Key: null, Icon: officialIcon }, '沒有等級只有圖示');
    for (const missing of [{}, { ActiveClassjob: '' }, { ActiveClassjob: '', ActiveClassjobLevel: {} }, { ActiveClassjobLevel: { Level: null } }, { ActiveClassjobLevel: 'x' }, null, undefined]) {
        assert.equal(activeClassJobOf(missing), undefined, JSON.stringify(missing));
    }
});

test('freeCompanyOf：角色回應或搜尋結果裡的部隊 { id, name }；舊 Worker 的部隊沒有名稱；沒有加入是 null', () => {
    const fc = (value) => plain(freeCompanyOf(value));
    assert.deepEqual(fc({ FreeCompany: { ID: '9230000000000000001', Name: 'Example Company', Crest: ['a', 'b'] } }), { id: '9230000000000000001', name: 'Example Company' });
    assert.deepEqual(fc({ FreeCompany: { ID: '9230000000000000001', Crest: ['a'] } }), { id: '9230000000000000001', name: '' }, '舊 Worker：只有 ID 與 Crest');
    assert.deepEqual(fc({ FreeCompany: { ID: 9230, Name: '  Moonlit Garden  ' } }), { id: '9230', name: 'Moonlit Garden' }, 'ID 是數字也行，名稱去掉前後空白');
    assert.deepEqual(fc({ FreeCompany: { Name: 'Night Owls' } }), { id: '', name: 'Night Owls' }, '只有名稱');
    for (const none of [{ FreeCompany: null }, {}, { FreeCompany: { Crest: ['a'] } }, { FreeCompany: { ID: true, Name: '   ' } }, { FreeCompany: 'Example Company' }, null, undefined]) {
        assert.equal(freeCompanyOf(none), null, JSON.stringify(none));
    }
});

// ---------- 資料中心與網址 ----------

test('dcOf、defaultDataLang：名稱與成就顯示 English／日本語 對到 na／jp', () => {
    assert.equal(dcOf('en'), 'na');
    assert.equal(dcOf('ja'), 'jp');
    for (const other of ['zh', undefined, null, '']) assert.equal(dcOf(other), 'na', String(other));

    assert.equal(defaultDataLang('ja'), 'ja');
    for (const other of ['zh', 'en', undefined, null, '']) assert.equal(defaultDataLang(other), 'en', String(other));
});

test('characterUrl：Lodestone 角色頁的網址，na 或 jp', () => {
    assert.equal(characterUrl('12345678', 'en'), 'https://na.finalfantasyxiv.com/lodestone/character/12345678/');
    assert.equal(characterUrl(12345678, 'ja'), 'https://jp.finalfantasyxiv.com/lodestone/character/12345678/');
    assert.equal(characterUrl('12345678'), 'https://na.finalfantasyxiv.com/lodestone/character/12345678/', '沒給語言用 na');
    // ID 不是數字也不能跳出路徑
    assert.equal(characterUrl('1/../2?x#y', 'en'), 'https://na.finalfantasyxiv.com/lodestone/character/1%2F..%2F2%3Fx%23y/');
});

test('officialSearchUrl：官網角色搜尋的網址，名字原樣送過去（撇號、連字號、& # ? 都不會弄壞參數）', () => {
    assert.equal(officialSearchUrl('Aoi Mizu', 'Tiamat', 'en'),
        'https://na.finalfantasyxiv.com/lodestone/character/?q=Aoi+Mizu&worldname=Tiamat');
    assert.equal(officialSearchUrl('Aoi Mizu', '_dc_Elemental', 'ja'),
        'https://jp.finalfantasyxiv.com/lodestone/character/?q=Aoi+Mizu&worldname=_dc_Elemental');
    assert.equal(officialSearchUrl('Aoi Mizu', '', 'en'),
        'https://na.finalfantasyxiv.com/lodestone/character/?q=Aoi+Mizu&worldname=', '全部伺服器');

    for (const name of ["Y'shtola Rhul", "A'lu-ne Moku", 'Hikari Senshi', 'a&b=c#d?e', '  前後空白  ']) {
        const url = new URL(officialSearchUrl(name, 'Tiamat', 'en'));
        assert.equal(url.origin, 'https://na.finalfantasyxiv.com');
        assert.equal(url.pathname, '/lodestone/character/');
        assert.equal(url.searchParams.get('q'), name, `q 解出來要和輸入一樣：${name}`);
        assert.equal(url.searchParams.get('worldname'), 'Tiamat');
        assert.deepEqual([...url.searchParams.keys()], ['q', 'worldname'], `不多出參數：${name}`);
        assert.equal(url.hash, '');
    }
    // 沒給值時不會寫成 undefined 三個字
    const url = new URL(officialSearchUrl(undefined, undefined, 'en'));
    assert.equal(url.searchParams.get('q'), '');
    assert.equal(url.searchParams.get('worldname'), '');
});

// ---------- 人的摘要 ----------

test('person：角色回應換成「我的角色」存的那一筆（最近查過只留其中五個欄位），職業存職業鍵（名稱在畫面上才查）', () => {
    const character = {
        ID: 12345678,
        Name: 'Hikari Senshi',
        Title: 'Example Title',
        Server: { World: 'Tonberry', DC: 'Elemental' },
        Avatar: 'https://example.invalid/avatar.jpg',
        FreeCompany: { ID: '9230000000000000001', Name: 'Example Company' },
        ActiveClassJob: { Key: 'Bard', Level: 100, Icon: 'https://example.invalid/icon.png' },
        Bio: '第一行\n第二行'
    };
    const summary = (value) => plain(person(value));
    assert.equal(person.length, 1, 'person(character)：不收介面語言');
    assert.deepEqual(summary(character), {
        id: '12345678', name: 'Hikari Senshi', world: 'Tonberry', dc: 'Elemental',
        avatar: 'https://example.invalid/avatar.jpg', job: 'Bard', level: 100
    });
    assert.deepEqual(summary({ ...character, ID: '12345678' }).id, '12345678', 'ID 是字串也行');

    const jobOf = (activeClassJob) => {
        const { job, level } = summary({ ...character, ActiveClassJob: activeClassJob });
        return [job, level];
    };
    // 基本職業：存 Worker 給的 Key，不換成職業
    assert.deepEqual(jobOf({ Key: 'Gladiator', Level: 30, Icon: 'x' }), ['Gladiator', 30]);
    // Worker 認不出目前職業（Key 是 null）：job 是 null，等級照舊
    assert.deepEqual(jobOf({ Key: null, Level: 100, Icon: 'x' }), [null, 100]);
    // 沒有任何目前職業的欄位：job 與 level 都是 null
    const { ActiveClassJob, ...none } = character;
    assert.ok(ActiveClassJob);
    assert.deepEqual(summary(none), {
        id: '12345678', name: 'Hikari Senshi', world: 'Tonberry', dc: 'Elemental',
        avatar: 'https://example.invalid/avatar.jpg', job: null, level: null
    });
    // 舊 Worker：沒有 ActiveClassJob，只有官網的圖示網址與等級（activeClassJobOf()）。job 是 null（認不出職業），level 照官網的等級，
    // 和標頭寫的「現在：Lv100」（activeJob(activeClassJobOf())）一樣，存下的我的角色才有等級
    const old = { ...none, ActiveClassjob: 'https://example.invalid/icon.png', ActiveClassjobLevel: { Level: '100' } };
    assert.deepEqual(summary(old), {
        id: '12345678', name: 'Hikari Senshi', world: 'Tonberry', dc: 'Elemental',
        avatar: 'https://example.invalid/avatar.jpg', job: null, level: 100
    });
    const header = activeJob(activeClassJobOf(old), 'zh');
    assert.deepEqual([summary(old).job, summary(old).level], [header.key, header.level], '和標頭寫的職業與等級一樣');
    // 新 Worker 也還留著舊的兩個欄位：照 ActiveClassJob
    const both = summary({ ...old, ActiveClassJob: { Key: 'Dancer', Level: 80, Icon: 'x' } });
    assert.deepEqual([both.job, both.level], ['Dancer', 80]);
    // 名字原樣留著
    assert.equal(summary({ ...character, Name: "Y'shtola Rhul" }).name, "Y'shtola Rhul");
    // 缺欄位時是空字串，不是 undefined（存進 localStorage 的 JSON 不能少欄位）
    assert.deepEqual(summary({ ID: 7 }), { id: '7', name: '', world: '', dc: '', avatar: '', job: null, level: null });
    assert.deepEqual(summary({ ID: 7, Server: null, ActiveClassJob: null }), { id: '7', name: '', world: '', dc: '', avatar: '', job: null, level: null });
});

// ---------- 原文換官方中文 ----------

test('term：中文介面把英文與日文原文換成官方中文', () => {
    assert.equal(term('grandCompany', '双蛇党', 'zh'), '雙蛇黨');
    assert.equal(term('focus', 'Guildhests', 'zh'), '公會令');
    for (const [kind, original, chinese] of TERM_ROWS) {
        assert.equal(term(kind, original, 'zh'), chinese, `${kind} ${original}`);
    }
});

test('term：英文與日文介面、認不得的原文、認不得的種類都照舊', () => {
    assert.equal(term('focus', 'Guildhests', 'en'), 'Guildhests');
    assert.equal(term('reputation', '名誉', 'zh'), '名誉');
    for (const [kind, original] of TERM_ROWS) {
        assert.equal(term(kind, original, 'en'), original, `en ${kind} ${original}`);
        assert.equal(term(kind, original, 'ja'), original, `ja ${kind} ${original}`);
        assert.equal(term(kind, original, undefined), original, `沒給語言 ${kind} ${original}`);
        assert.equal(term(kind, original, 'zh-TW'), original, `只有 zh 換：${kind} ${original}`);
    }
    // 認不得的原文（舊表有、官網沒有的，或是亂寫的）、大小寫不同、前後有空白
    for (const [kind, original] of [['focus', 'Questing'], ['focus', 'casual'], ['focus', 'Casual '], ['seeking', 'Tankk'], ['grandCompany', 'Maelstrom Inc'],
        ['reputation', 'Exalted'], ['town', 'Mor Dhona'], ['focus', '']]) {
        assert.equal(term(kind, original, 'zh'), original, `${kind} ${JSON.stringify(original)}`);
    }
    // 種類也對不上時照舊
    assert.equal(term('notAKind', 'Casual', 'zh'), 'Casual');
    // 和 Object.prototype 同名的原文或種類不會被當成表裡有
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
        assert.equal(term('focus', name, 'zh'), name, `原文 ${name}`);
        assert.equal(term(name, 'Casual', 'zh'), 'Casual', `種類 ${name}`);
        assert.equal(term(name, name, 'zh'), name, `種類與原文 ${name}`);
    }
});

// ---------- 簡介、名稱篩選、伺服器選單 ----------

test('isEmptyBio：沒有、空白、-、未設定都算沒填', () => {
    for (const empty of [undefined, null, '', ' ', '   ', '　', '\n', '-', ' - ', '未設定', ' 未設定\n']) {
        assert.equal(isEmptyBio(empty), true, JSON.stringify(empty));
    }
    for (const filled of ['你好', 'Hello', '第一行\n第二行', '--', '- 一', '未設定了', '0']) {
        assert.equal(isEmptyBio(filled), false, JSON.stringify(filled));
    }
});

test('filterByName：去掉前後空白、不分大小寫的子字串，空的回全部（新陣列）', () => {
    const items = [
        { Name: 'Company Chocobo', Icon: 'a' }, { Name: 'Wind-up Leader', Icon: 'b' }, { Name: 'Chocobo Chick', Icon: 'c' },
        { Name: '陸行鳥雛鳥', Icon: 'd' }, { Name: 'Mog (Moogle)', Icon: 'e' }
    ];
    const names = (list) => Array.from(list, (item) => item.Name);
    assert.deepEqual(names(filterByName(items, 'choco')), ['Company Chocobo', 'Chocobo Chick']);
    assert.deepEqual(names(filterByName(items, '  CHOCO  ')), ['Company Chocobo', 'Chocobo Chick'], '去掉前後空白、不分大小寫');
    assert.deepEqual(names(filterByName(items, 'wind-up')), ['Wind-up Leader']);
    assert.deepEqual(names(filterByName(items, 'o c')), ['Chocobo Chick'], '中間的空白算一個字');
    assert.deepEqual(names(filterByName(items, '雛鳥')), ['陸行鳥雛鳥']);
    assert.deepEqual(names(filterByName(items, '(')), ['Mog (Moogle)'], '不是正規表示式');
    assert.deepEqual(names(filterByName(items, '.')), []);
    assert.deepEqual(names(filterByName(items, 'zzz')), []);
    // 順序不變，元素是同一批物件
    const result = filterByName(items, 'o');
    assert.deepEqual(names(result), ['Company Chocobo', 'Chocobo Chick', 'Mog (Moogle)']);
    assert.ok(Array.from(result).every((item) => items.includes(item)));
    // 空的、只有空白、沒給：全部，而且是新陣列
    for (const empty of ['', '   ', '　', undefined, null]) {
        const all = filterByName(items, empty);
        assert.deepEqual(names(all), names(items), JSON.stringify(empty));
        assert.notEqual(all, items);
    }
    assert.deepEqual(names(filterByName([], 'x')), []);
    // 沒有 Name 的項目不會讓它丟錯
    assert.deepEqual(names(filterByName([{ Icon: 'x' }, { Name: 'Moogle' }], 'moo')), ['Moogle']);
});

test('worldLabel：資料中心的 _dc_ 前綴去掉，其他照舊', () => {
    assert.equal(worldLabel(''), '');
    assert.equal(worldLabel('_dc_Elemental'), 'Elemental');
    assert.equal(worldLabel('Tonberry'), 'Tonberry');
    assert.equal(worldLabel('Tonberry_dc_'), 'Tonberry_dc_', '只去掉開頭的');
    for (const dc of LODESTONE_WORLDS.dcs) assert.equal(worldLabel(dc), dc.slice('_dc_'.length), dc);
    for (const world of LODESTONE_WORLDS.worlds) assert.equal(worldLabel(world), world, world);
});

// ---------- 不改傳進來的資料 ----------

test('不改傳進來的資料：沒凍結的輸入前後一樣，深層凍結的輸入也照常回傳', () => {
    const character = {
        ID: 12345678, Name: "Y'shtola Rhul", Server: { World: 'Tonberry', DC: 'Elemental' }, Avatar: 'https://example.invalid/a.jpg',
        ActiveClassJob: { Key: 'Gladiator', Level: 30, Icon: 'https://example.invalid/i.png' }
    };
    const cases = [
        [classJobsAnswer({ Warrior: '100', Paladin: '30' }, { Paladin: 'Gladiator' }), (input) => jobGroups(input.ClassJobs, 'zh')],
        [classJobsAnswer({ Warrior: '100', Paladin: '30' }, { Paladin: 'Gladiator' }), (input) => jobGroups(input, 'ja')],
        [plain(jobGroups(classJobsAnswer({ Warrior: '100', Viper: '100' }).ClassJobs, 'en')), (input) => maxedCount(input)],
        [character.ActiveClassJob, (input) => activeJob(input, 'en')],
        [character, (input) => person(input)],
        [character, (input) => activeClassJobOf(input)],
        [{ ID: 7, Name: 'Aoi Mizuno', ActiveClassjob: 'https://example.invalid/i.png', ActiveClassjobLevel: { Level: '90' } }, (input) => person(input)],
        [{ ActiveClassjob: 'https://example.invalid/i.png', ActiveClassjobLevel: { Level: '90' } }, (input) => activeClassJobOf(input)],
        [{ FreeCompany: { ID: '9230000000000000001', Name: ' Example Company ', Crest: ['a'] } }, (input) => freeCompanyOf(input)],
        [[{ Name: 'Company Chocobo' }, { Name: 'Wind-up Leader' }, { Name: 'Chocobo Chick' }], (input) => filterByName(input, 'choco')],
        [[{ Name: 'Company Chocobo' }, { Name: 'Wind-up Leader' }], (input) => filterByName(input, '')]
    ];
    for (const [input, call] of cases) {
        const before = JSON.stringify(input);
        const expected = JSON.stringify(call(input));
        assert.equal(JSON.stringify(input), before, '輸入不能被改');
        // 模組是嚴格模式，想改凍結的資料會丟 TypeError
        assert.equal(JSON.stringify(call(deepFreeze(JSON.parse(before)))), expected, '凍結的輸入也要算得出同樣的結果');
    }
});
