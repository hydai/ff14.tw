const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDom } = require('./helpers/fake-dom.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const readJson = file => JSON.parse(read(file));

const maps = readJson('data/treasure-maps.json').maps;
const zonesJson = readJson('data/zones.json');
const aetherytes = readJson('data/aetherytes.json').aetherytes;
const zoneIdsWithMaps = [...new Set(maps.map(map => map.zoneId))];
const allSubZones = () => Object.values(zonesJson.zones).flatMap(region => region.subZones);
const zoneNameEn = zoneId => allSubZones().find(zone => zone.id === zoneId).names.en;

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
    assert.equal(context.zoneManager.loaded, true, 'zones.json 沒有載入');
    assert.ok(context.zoneManager.aetherytes.tural, 'aetherytes.json 沒有載入');
    return { calculator, zoneManager: context.zoneManager };
}

// 和頁面一樣，寶圖帶著英文地名 zone（script.js 的 loadData() 加上的）
const byId = id => {
    const map = maps.find(entry => entry.id === id);
    return { ...map, zone: zoneNameEn(map.zoneId) };
};
const plan = (calculator, list) => calculator.describeOrder(calculator.firstOrder(list), list);
// 烏爾科帕恰 3 張（tm_007、tm_013、tm_010）、科扎馬烏卡 2 張（tm_017、tm_022）、夏羅尼荒野 1 張（tm_033）
const EXAMPLE = ['tm_017', 'tm_007', 'tm_013', 'tm_022', 'tm_010', 'tm_033'];

test('zones.json 每個地區列的傳送點，都在 aetherytes.json 對應的區域裡', () => {
    for (const zone of allSubZones()) {
        const pool = aetherytes[zonesJson.mappings.zoneIdToRegion[zone.id]] || [];
        for (const id of zone.aetherytes) assert.ok(pool.some(a => a.id === id), `${zone.id}: ${id}`);
    }
});

test('aetherytes.json 的傳送點都有地區列出（圖拉優拉是主城，不屬於任何地區）', () => {
    const listed = new Set(allSubZones().flatMap(zone => zone.aetherytes));
    assert.deepEqual(Object.values(aetherytes).flat().map(a => a.id).filter(id => !listed.has(id)), ['tuliyollal']);
});

test('每個地區的傳送點，ZoneManager 依 zones.json 的 id 全部查得到', async () => {
    const { zoneManager } = await createRouteCalculator();
    for (const zone of allSubZones()) {
        assert.deepEqual(zoneManager.getAetherytes(zone.id).map(a => a.id), zone.aetherytes, zone.id);
    }
    // 空陣列是在 vm 裡建立的，Array.prototype 和測試不同，先轉成一般陣列再比
    assert.deepEqual(Array.from(zoneManager.getAetherytes('atlantis')), []);
});

test('有寶圖的地區至少一個傳送點，路線和 ZoneManager 用同一份', async () => {
    const { calculator, zoneManager } = await createRouteCalculator();
    for (const zoneId of zoneIdsWithMaps) {
        const ids = zoneManager.getAetherytes(zoneId).map(a => a.id);
        assert.ok(ids.length >= 1, zoneId);
        assert.deepEqual(calculator.getRegionAetherytes(zoneId).map(a => a.id), ids, zoneId);
    }
});

test('厄爾庇斯 3 個傳送點；tm_048 最近的是 8.6 遠的波伊艾騰·奧伊科斯', async () => {
    const { zoneManager } = await createRouteCalculator();
    assert.deepEqual(zoneManager.getAetherytes('elpis').map(a => a.id), ['the_twelve_wonders', 'anagnorisis', 'poieten_oikos']);
    const nearest = zoneManager.findNearestAetheryte('elpis', maps.find(m => m.id === 'tm_048').coords);
    assert.equal(nearest.aetheryte.id, 'poieten_oikos');
    assert.equal(nearest.distance.toFixed(1), '8.6');
});

test('227 張寶圖的最近傳送點，都和路線分配的傳送點相同', async () => {
    const { calculator, zoneManager } = await createRouteCalculator();
    for (const map of maps) {
        const byRoute = calculator.getRegionAetherytes(map.zoneId).reduce((best, t) => {
            const d = calculator.calculateDistance(t, { coords: map.coords, zoneId: map.zoneId });
            return !best || d < best.d ? { id: t.id, d } : best;
        }, null);
        assert.equal(zoneManager.findNearestAetheryte(map.zoneId, map.coords).aetheryte.id, byRoute.id, map.id);
    }
});

test('只剩一份傳送點資料：沒有寫死的對照表，路線與詳細地圖都用 ZoneManager', () => {
    const script = read('tools/treasure-map-finder/script.js');
    for (const gone of ['getAetherytesForZone', 'theraktikagreatwod', 'aetheryteData']) assert.ok(!script.includes(gone), gone);
    assert.doesNotMatch(read('tools/treasure-map-finder/route-calculator.js'), /fetch\(|this\.aetherytes/);
    assert.doesNotMatch(read('tools/treasure-map-finder/zone-manager.js'), /getAetheryteInfo/);
    assert.match(read('tools/treasure-map-finder/ui-dialog-manager.js'), /zoneManager\.getAetherytes\(/);
});

test('匯入的清單沒有 zoneId，只剩英文地名也要查到同一個地區：227 張寶圖的站都和有 zoneId 的相同', async () => {
    const { calculator } = await createRouteCalculator();
    const stopsOf = list => Array.from(plan(calculator, list).stops, s => `${s.mapId}:${s.aetheryteId}:${s.teleport}`);
    for (const map of maps) {
        const imported = { ...map, zoneId: null, zone: zoneNameEn(map.zoneId) };
        assert.deepEqual(stopsOf([imported]), stopsOf([map]), map.id);
    }
});

test('第一次排序：寶圖多的地區先跑，張數一樣照清單裡第一次出現的順序；傳送標在每一組的第一站', async () => {
    const { calculator } = await createRouteCalculator();
    const { stops, summary } = plan(calculator, EXAMPLE.map(byId));
    assert.deepEqual(Array.from(stops, s => [s.mapId, s.aetheryteId, s.teleport]), [
        ['tm_010', 'wachunpelo', true], ['tm_007', 'wachunpelo', false], ['tm_013', 'worqor_zormor', true],
        ['tm_017', 'ok_hanu', true], ['tm_022', 'dock_poga', true], ['tm_033', 'sheshenewezi_springs', true]
    ]);
    assert.deepEqual({ ...summary }, { maps: 6, zones: 3, teleports: 5 });
    const order = ids => Array.from(calculator.firstOrder(ids.map(byId)));
    assert.deepEqual(order(['tm_048', 'tm_007', 'tm_010']), ['tm_010', 'tm_007', 'tm_048'], '烏爾科帕恰 2 張，排在清單第一張的厄爾庇斯前面');
    assert.deepEqual(order(['tm_048', 'tm_007']), ['tm_048', 'tm_007'], '張數一樣照清單順序');
    assert.deepEqual(order(['tm_007', 'tm_048']), ['tm_007', 'tm_048']);
    assert.doesNotMatch(read('tools/treasure-map-finder/route-calculator.js'), /findStartingRegion/);
});

test('跑到一半清單變了：留下的照原本順序，新的插在同一組最後一站後面，沒有同一組就插在同地區最後，新地區排最後', async () => {
    const { calculator } = await createRouteCalculator();
    const prev = ['tm_017', 'tm_007', 'tm_013'];
    const merge = ids => Array.from(calculator.mergeOrder(prev, ids.map(byId)));
    assert.deepEqual(merge(['tm_017', 'tm_007', 'tm_013', 'tm_008']), ['tm_017', 'tm_007', 'tm_008', 'tm_013'], 'tm_008 和 tm_007 同組（瓦群佩洛）');
    assert.deepEqual(merge(['tm_017', 'tm_007', 'tm_013', 'tm_015']), ['tm_017', 'tm_015', 'tm_007', 'tm_013'], 'tm_015 同地區（科扎馬烏卡）不同組');
    assert.deepEqual(merge(['tm_033', 'tm_017', 'tm_007', 'tm_013']), ['tm_017', 'tm_007', 'tm_013', 'tm_033'], '新地區排最後');
    assert.deepEqual(merge(['tm_017', 'tm_013']), ['tm_017', 'tm_013'], '移除不重排');
    assert.deepEqual(merge(['tm_013', 'tm_007', 'tm_017']), prev, '清單順序變了也不重排');
});

test('describeOrder：同一組連著的站只有第一站傳送；不在清單裡的 id 略過；地區沒有傳送點時不傳送', async () => {
    const { calculator } = await createRouteCalculator();
    const list = ['tm_007', 'tm_008', 'tm_013', 'tm_010'].map(byId);
    const { stops, summary } = calculator.describeOrder(['tm_007', 'tm_013', 'tm_999', 'tm_008', 'tm_010'], list);
    assert.deepEqual(Array.from(stops, s => [s.mapId, s.teleport]), [['tm_007', true], ['tm_013', true], ['tm_008', true], ['tm_010', false]]);
    assert.deepEqual({ ...summary }, { maps: 4, zones: 1, teleports: 3 });
    const unknown = { id: 'g8_test_1', level: 'g8', zone: 'Test', coords: { x: 10, y: 20 } };
    const lone = calculator.describeOrder(['g8_test_1'], [unknown]);
    assert.deepEqual(Array.from(lone.stops, s => [s.mapId, s.aetheryteId, s.teleport]), [['g8_test_1', null, false]]);
    assert.deepEqual({ ...lone.summary }, { maps: 1, zones: 1, teleports: 0 });
});

test('每個有寶圖的地區，單張圖的路線是 1 站且要傳送；G18 永生記憶 8 張圖的第一站要傳送，總傳送次數至少 1', async () => {
    const { calculator } = await createRouteCalculator();
    const problems = [];

    const g18 = plan(calculator, maps.filter(map => map.zoneId === 'livingmemory'));
    if (!(g18.summary.teleports >= 1)) problems.push(`livingmemory 8 張圖：總傳送次數 ${g18.summary.teleports}`);
    if (g18.stops[0]?.teleport !== true) problems.push(`livingmemory 8 張圖：第一站的 teleport 是 ${g18.stops[0]?.teleport}`);

    for (const zoneId of zoneIdsWithMaps) {
        const single = plan(calculator, [maps.find(map => map.zoneId === zoneId)]);
        const { maps: stopCount, zones, teleports } = single.summary;
        if (single.stops.length !== 1 || single.stops[0].teleport !== true) problems.push(`${zoneId}: 單張圖的路線是 ${single.stops.length} 站、第一站 teleport ${single.stops[0]?.teleport}`);
        if (stopCount !== 1 || zones !== 1 || teleports !== 1) problems.push(`${zoneId}: 單張圖的 summary 是 maps ${stopCount}、zones ${zones}、teleports ${teleports}`);
    }
    assert.deepEqual(problems, []);
});

// ---------- 頁面載入的順序（TreasureMapFinder#init） ----------
// fake-dom 裡載入真正的 script.js 與 zone-manager.js。zones.json／aetherytes.json 的 fetch 可以先擱著不回；
// 傳送點圖示是 Image 替身，iconLoads 為 false 時一直不會載入完成。載入資料之後的步驟（掛事件、清單張數、畫出結果）
// 在別的測試裡，這裡換成只記下有沒有走到的替身
function startFinder({ holdZones = false, iconLoads = true, failFiles = [] } = {}) {
    const dom = createFakeDom({ url: 'https://ff14.tw/tools/treasure-map-finder/' });
    const icons = [];
    let releaseZones = () => {};
    const zonesArrive = holdZones ? new Promise(resolve => { releaseZones = resolve; }) : Promise.resolve();
    Object.assign(dom.window, {
        console: { log() {}, warn() {}, error() {} },
        FF14Utils: { getI18nText: (key, fallback) => fallback },
        Image: class {
            constructor() { icons.push(this); }
            set src(value) {
                this.url = value;
                if (iconLoads) queueMicrotask(() => this.onload?.());
            }
        },
        fetch: async url => {
            const file = ['zones.json', 'aetherytes.json', 'treasure-maps.json'].find(name => String(url).endsWith(`/${name}`));
            if (!file) throw new Error(`unexpected fetch: ${url}`);
            if (file !== 'treasure-maps.json') await zonesArrive;
            if (failFiles.includes(file)) return { ok: false, status: 404, json: async () => { throw new Error('404'); } };
            return { ok: true, json: async () => readJson(`data/${file}`) };
        }
    });
    for (const file of ['assets/js/security-utils.js', 'tools/treasure-map-finder/coordinate-utils.js', 'tools/treasure-map-finder/zone-manager.js', 'tools/treasure-map-finder/script.js']) {
        dom.load(file);
    }
    const grid = dom.el('div', { id: 'treasureGrid', class: 'treasure-grid' });
    dom.document.body.appendChild(grid);
    const steps = [];
    const finder = vm.runInContext('Object.create(TreasureMapFinder.prototype)', dom.window);
    Object.assign(finder, {
        maps: [],
        aetheryteIcon: null,
        elements: { treasureGrid: grid },
        setupEventListeners: () => steps.push('events'),
        updateListCount: () => steps.push('count'),
        // 畫出結果：initFilters() 還原篩選之後由 updateFilteredMaps() 畫
        initFilters: () => steps.push('results'),
        updateFilteredMaps: () => steps.push('results')
    });
    finder.init();
    return { dom, finder, grid, icons, steps, releaseZones };
}

// 假的 fetch 只靠 microtask 往下走：跑幾輪 setImmediate，init() 裡能跑完的 await 就都跑完了（卡住的不會讓測試停在這裡）
const settle = async () => {
    for (let round = 0; round < 5; round += 1) await new Promise(resolve => setImmediate(resolve));
};

test('init：一開始就顯示「載入中」，地區與傳送點資料還沒回來時也是', async () => {
    const page = startFinder({ holdZones: true });
    await settle();
    assert.equal(page.grid.querySelectorAll('.loading').length, 1, '地區與傳送點資料載入時，結果格要顯示「載入中」');
    assert.deepEqual(page.steps, []);
    page.releaseZones();
    await settle();
    assert.equal(page.finder.maps.length, maps.length);
    assert.deepEqual(page.steps, ['events', 'count', 'results']);
});

test('init：地區或傳送點資料載入失敗時顯示載入失敗與重新載入，不留下只有一半資料的頁面', async () => {
    for (const file of ['zones.json', 'aetherytes.json']) {
        const page = startFinder({ failFiles: [file] });
        await settle();
        const error = page.grid.querySelector('.error-message');
        assert.ok(error, `${file}：結果格要顯示載入失敗`);
        assert.match(error.textContent, /載入寶圖資料失敗/, file);
        assert.deepEqual(page.steps, [], `${file}：不能接著掛事件、畫結果`);
        assert.equal(page.finder.maps.length, 0, `${file}：不能用缺了地區資料的寶圖（地名會變成 id、縮圖路徑會錯）`);
        assert.equal(vm.runInContext('zoneManager.loaded', page.dom.window), false, file);
    }
});

test('init：傳送點圖示載入慢或載入不了都不延後結果；圖示晚到時照樣補上（之後打開的詳細地圖畫得出傳送點）', async () => {
    const page = startFinder({ iconLoads: false });
    await settle();
    assert.deepEqual(page.steps, ['events', 'count', 'results'], '不等傳送點圖示就畫出結果');
    assert.equal(page.finder.maps.length, maps.length);
    assert.equal(page.finder.aetheryteIcon, null);
    assert.equal(page.icons.length, 1);
    page.icons[0].onload();
    await settle();
    assert.ok(page.finder.aetheryteIcon === page.icons[0], '圖示載入完成後記下來');
});

test('init：傳送點圖示晚到時，開著的詳細地圖重畫一次補上傳送點；什麼都沒開就不重畫', async () => {
    for (const [kind, expected] of [['mapDetail', ['mapDetail']], [null, []]]) {
        const page = startFinder({ iconLoads: false });
        const refreshed = [];
        page.finder.uiDialogManager = {
            activeDialog: kind ? { kind } : null,
            refreshActiveDialog() { refreshed.push(this.activeDialog.kind); }
        };
        await settle();
        assert.deepEqual(refreshed, [], `${kind}：圖示還沒到`);
        page.icons[0].onload();
        await settle();
        assert.deepEqual(refreshed, expected, `${kind}：圖示到了之後`);
    }
});
