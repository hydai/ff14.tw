// Lodestone 角色查詢頁測試用的假回應，給 tests/lodestone-page.test.js 共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。
//
//   const F = require('./helpers/lodestone-fixtures.js');
//   routes: { '/character/12345678': () => F.ok(F.character(F.HIKARI)), '/search/character': () => F.ok(F.search([F.AOI], { total: 1 })) }
//   F.ok(F.oldCharacter(F.HIKARI)); F.fail(404, 'not_found'); F.mineOf(F.HIKARI); F.entryOf(F.AOI)
//
// 回應照 Worker（hydai/logstone）的格式：
// - character(who)：新格式。部隊有名稱（沒有加入是 null）、ActiveClassJob（Key、Level、官網的 Icon）、最外層的 FetchedAt；
//   舊的 ActiveClassjob（官網的圖示網址）與 ActiveClassjobLevel 照舊留著（新 Worker 也還有）
// - oldCharacter(who)：現在正式站的舊 Worker。部隊只有 { ID, Crest }（沒有名稱；沒有加入時沒有這個欄位），沒有 ActiveClassJob 與 FetchedAt，
//   目前職業只有 ActiveClassjob（官網的圖示網址）與 ActiveClassjobLevel（{ Level: '100' }）。舊 Worker 沒有搜尋端點，所以沒有舊格式的搜尋回應：
//   頁面替身裡沒有設的路徑讓 fetch 丟 TypeError
// - search(people, { page, pageTotal, total })：{ Results, Pagination, FetchedAt }；total 沒給是人數，pageTotal 沒給時有人是 1、沒有人是 0
// - ok(body) 是 200 的回答，fail(status, error) 是 Worker 的錯誤回答 { error }（頁面替身的路由回傳這兩種）
// - mineOf(who)、entryOf(who)：存進 localStorage 的我的角色（七個欄位）與最近查過的一筆（五個欄位），同 LodestoneModel.person()
//
// who 的欄位：id、name、world、dc、title（沒有這個欄位就沒有稱號）、fc（{ id, name } 或 null）、job（職業鍵，null 是 Worker 認不出）、
// level、icon（官網的職業圖示網址，沒給就照 job 找；null 是 Worker 讀不到）。
// 名字、部隊名稱、ID、頭像網址都是假的，不放真實玩家的資料。
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
            Bio: '-'
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
        Bio: '-'
    };
    if (who.fc) result.FreeCompany = { ID: who.fc.id, Crest: [crestOf(who.fc.id)] };
    return { Character: result };
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
    FETCHED_AT, BARD_ICON, OFFICIAL_ICONS, avatarOf,
    HIKARI, AOI, AOI_YA, AOI_SAWA, REED, MIRA, KAEDE,
    character, oldCharacter, searchResult, search, ok, fail, entryOf, mineOf
};
