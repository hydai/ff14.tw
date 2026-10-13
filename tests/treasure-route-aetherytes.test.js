const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

const maps = readJson('data/treasure-maps.json').maps;
const zoneIdsWithMaps = [...new Set(maps.map(map => map.zoneId))];
const idsOf = aetherytes => aetherytes.map(aetheryte => aetheryte.id);

// 詳細地圖（script.js 的 getAetherytesForZone）列出的傳送點；路線計算必須和它一致。
const DETAIL_MAP_AETHERYTES = {
    amharaeng: ['twine', 'mord_souq', 'inn_at_journeys_head'],
    coerthaswesternhighlands: ['falcons_nest'],
    heritagefound: ['the_outskirts', 'electrope_strike', 'yyasulani_station'],
    ilmheg: ['lydha_lran', 'pla_enni', 'wolekdorf'],
    kozamauka: ['ok_hanu', 'earthenshire', 'many_fires', 'dock_poga'],
    labyrinthos: ['the_archeion', 'sharlayan_hamlet', 'aporia'],
    livingmemory: ['leynode_mnemes', 'leynode_aero', 'leynode_pyro'],
    shaaloani: ['hhusatahwi', 'meyhane', 'sheshenewezi_springs'],
    thavnair: ['yedlihmad', 'great_work', 'palaka_stand'],
    theazimsteppe: ['dhoro_iloh', 'dawn_throne', 'reunion'],
    thetempest: ['the_ondo_cups', 'the_macarenses_angle'],
    ultimathule: ['reahs_tahra', 'base_omicron', 'ostrakon_deka_hexi'],
    yaktel: ['iq_br_aak', 'mamook']
};

// 依頁面的載入順序執行真正的寶圖腳本；只把 fetch 換成從 /data 讀檔。
async function createRouteCalculator() {
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {} },
        fetch: async url => {
            const file = ['zones.json', 'aetherytes.json'].find(name => String(url).endsWith(`/${name}`));
            if (!file) throw new Error(`unexpected fetch: ${url}`);
            return { ok: true, json: async () => readJson(`data/${file}`) };
        }
    });
    context.window = context;
    for (const name of ['coordinate-utils', 'zone-manager', 'route-calculator']) {
        const file = `tools/treasure-map-finder/${name}.js`;
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    }
    await context.zoneManager.init();
    const calculator = new context.RouteCalculator();
    await calculator.loadAetherytes();
    assert.equal(context.zoneManager.loaded, true, 'zones.json 沒有載入');
    assert.ok(calculator.aetherytes, 'aetherytes.json 沒有載入');
    return { calculator, zoneManager: context.zoneManager };
}

test('每個有寶圖的地區都能算出傳送點，zones.json 列的 id 也都被路線用到', async () => {
    const { calculator, zoneManager } = await createRouteCalculator();
    const problems = [];
    for (const zoneId of zoneIdsWithMaps) {
        const zone = zoneManager.getZoneById(zoneId);
        if (!zone) {
            problems.push(`${zoneId}: zones.json 沒有這個地區`);
            continue;
        }
        const routeIds = idsOf(calculator.getRegionAetherytes(zoneId));
        const unused = zone.aetherytes.filter(id => !routeIds.includes(id));
        if (routeIds.length === 0) problems.push(`${zoneId}: 路線算不出任何傳送點`);
        if (unused.length > 0) problems.push(`${zoneId}: zones.json 列的 ${unused.join(', ')} 沒被路線用到`);
    }
    assert.deepEqual(problems, []);
});

test('修正過的 13 個地區，路線可用的傳送點和詳細地圖一致', async () => {
    const { calculator } = await createRouteCalculator();
    const mismatches = [];
    for (const [zoneId, expectedIds] of Object.entries(DETAIL_MAP_AETHERYTES)) {
        const actual = new Set(idsOf(calculator.getRegionAetherytes(zoneId)));
        const expected = new Set(expectedIds);
        const missing = [...expected].filter(id => !actual.has(id));
        const extra = [...actual].filter(id => !expected.has(id));
        if (missing.length > 0 || extra.length > 0) mismatches.push({ zoneId, missing, extra });
    }
    assert.deepEqual(mismatches, []);
});

test('G18 永生記憶 8 張圖的路線從傳送開始，總傳送次數至少 1', async () => {
    const { calculator } = await createRouteCalculator();
    const problems = [];

    const g18 = calculator.calculateRoute(maps.filter(map => map.zoneId === 'livingmemory'));
    if (!(g18.summary.totalTeleports >= 1)) problems.push(`livingmemory 8 張圖：總傳送次數 ${g18.summary.totalTeleports}`);
    if (g18.route[0]?.type !== 'teleport') problems.push(`livingmemory 8 張圖：第一步是 ${g18.route[0]?.type}`);

    for (const zoneId of zoneIdsWithMaps) {
        const single = calculator.calculateRoute([maps.find(map => map.zoneId === zoneId)]);
        if (single.route[0]?.type !== 'teleport') problems.push(`${zoneId}: 單張圖的路線第一步是 ${single.route[0]?.type}`);
    }
    assert.deepEqual(problems, []);
});
