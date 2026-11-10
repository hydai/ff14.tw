const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SHARED = 'assets/js/ff14-game-data.js';
const LODESTONE_DATA = 'tools/lodestone-lookup/lodestone-data.js';

// 這些腳本都把東西掛在 window 上，所以讓 window 指向 context 本身（同 lodestone-model.test.js）。
// 每個測試各載一個新的 context，改了其中一個不會影響另一個
function loadContext(files) {
    const context = vm.createContext({});
    context.window = context;
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    }
    return context;
}

// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));

test('FF14_JOBS 是 34 個職業，FF14_WORLDS 是 11 個資料中心與 85 個伺服器', () => {
    const { FF14_JOBS, FF14_WORLDS } = loadContext([SHARED]);
    assert.equal(FF14_JOBS.length, 34);
    assert.deepEqual(Object.keys(FF14_WORLDS), ['dcs', 'worlds']);
    assert.equal(FF14_WORLDS.dcs.length, 11);
    assert.equal(FF14_WORLDS.worlds.length, 85);
    assert.equal(FF14_JOBS.find((job) => job.key === 'Pictomancer').names.zh, '繪靈法師');
});

test('FF14_TC_WORLDS 是繁中服的 6 個伺服器，不在國際服清單裡', () => {
    const { FF14_TC_WORLDS, FF14_WORLDS } = loadContext([SHARED]);
    assert.deepEqual(plain(FF14_TC_WORLDS), ['伊弗利特', '迦樓羅', '利維坦', '鳳凰', '奧汀', '巴哈姆特']);
    for (const world of FF14_TC_WORLDS) {
        assert.ok(!FF14_WORLDS.worlds.includes(world), `${world} 不該在國際服的 FF14_WORLDS.worlds 裡`);
    }
});

test('三份資料都是深層凍結的', () => {
    const { FF14_JOBS, FF14_WORLDS, FF14_TC_WORLDS } = loadContext([SHARED]);
    assert.ok(Object.isFrozen(FF14_JOBS), 'FF14_JOBS');
    for (const job of FF14_JOBS) {
        assert.ok(Object.isFrozen(job), `${job.key}`);
        assert.ok(Object.isFrozen(job.names), `${job.key}.names`);
    }
    assert.ok(Object.isFrozen(FF14_WORLDS), 'FF14_WORLDS');
    assert.ok(Object.isFrozen(FF14_WORLDS.dcs), 'FF14_WORLDS.dcs');
    assert.ok(Object.isFrozen(FF14_WORLDS.worlds), 'FF14_WORLDS.worlds');
    assert.ok(Object.isFrozen(FF14_TC_WORLDS), 'FF14_TC_WORLDS');
});

test('共用檔只掛 FF14_JOBS、FF14_WORLDS、FF14_TC_WORLDS 三個全域，deepFreeze 不外露', () => {
    // 包在立即執行的函式裡：頂層的名稱會和別的腳本（classic script 共用同一個全域）宣告的同名東西撞在一起
    const context = loadContext([SHARED]);
    assert.deepEqual(Object.keys(context).filter((name) => name !== 'window').sort(), ['FF14_JOBS', 'FF14_TC_WORLDS', 'FF14_WORLDS']);
    assert.equal(vm.runInContext('typeof deepFreeze', context), 'undefined');
});

test('lodestone-data.js 的 LODESTONE_JOBS、LODESTONE_WORLDS 就是共用的那兩份', () => {
    // 先載共用檔，再載 lodestone-data.js（index.html 的順序也是這樣）
    const context = loadContext([SHARED, LODESTONE_DATA]);
    assert.strictEqual(context.LODESTONE_JOBS, context.FF14_JOBS);
    assert.strictEqual(context.LODESTONE_WORLDS, context.FF14_WORLDS);
});

// ---------- 共用檔以外的 JS 不能碰這三個名稱 ----------

const SHARED_NAMES = ['FF14_JOBS', 'FF14_WORLDS', 'FF14_TC_WORLDS'];
// 不進 node_modules 與工具產生的資料夾（作法同 tests/share-preview.test.js 的 SKIP_DIRS）；api/.wrangler 是 wrangler 的暫存，不在版本控制裡
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.superpowers', '.wrangler']);

// 遞迴列出 dir（相對於 ROOT）底下所有 JS 檔（.js、.mjs、.cjs），回傳用 / 分隔的相對路徑
function listScripts(dir, out = []) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) listScripts(rel, out);
        } else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
            out.push(rel);
        }
    }
    return out;
}

// 宣告：const、let、var、class 或 function 後面直接接這個名稱。
// 指定：window、globalThis、self 的同名屬性被指定（.名稱 = 或 ['名稱'] =，含 ||=、&&=、??=，不含 == 與 ===）。
// 只看文字、不分作用域：函式裡的區域變數取同名也會被擋，改個名字或直接寫 window.FF14_JOBS 就好
const declares = (name) => new RegExp(`\\b(?:(?:const|let|var|class)\\s+|function\\s*\\*?\\s*)${name}\\b`);
const assigns = (name) => new RegExp(`\\b(?:window|globalThis|self)(?:\\.${name}|\\[\\s*["']${name}["']\\s*\\])\\s*(?:\\|\\||&&|\\?\\?)?=(?!=)`);
const PATTERNS = SHARED_NAMES.flatMap((name) => [declares(name), assigns(name)]);
const touchesSharedName = (line) => PATTERNS.some((pattern) => pattern.test(line));

test('共用檔以外的 JS 都不宣告、不指定 FF14_JOBS／FF14_WORLDS／FF14_TC_WORLDS', () => {
    // 以前 common.js 頂層有一個同名的 const FF14_JOBS（職能分組的舊物件）和 window.FF14_JOBS = FF14_JOBS。每一頁都載入 common.js：
    // 頂層的 const 會蓋住 window 上的同名屬性（裸的 FF14_JOBS 讀到舊物件，window.FF14_JOBS 讀到共用檔的陣列），
    // 載入順序反過來時 window.FF14_JOBS 又被舊物件蓋回去。頁面測試的替身不載入 common.js，沒有別的測試看得到，所以直接掃檔案

    // 檢查本身：抓得到以前 common.js 的寫法與其他的宣告、指定方式，不誤抓讀取、比較與名稱只是前綴相同的別的名稱
    for (const line of [
        'const FF14_JOBS = {', 'let FF14_WORLDS;', 'var FF14_TC_WORLDS = [];', 'function FF14_JOBS() {}', 'class FF14_WORLDS {}',
        'window.FF14_JOBS = FF14_JOBS;', "window['FF14_WORLDS'] = [];", 'globalThis.FF14_TC_WORLDS = [];', 'self.FF14_JOBS ??= [];'
    ]) assert.ok(touchesSharedName(line), `要抓到：${line}`);
    for (const line of [
        'const jobs = window.FF14_JOBS;', 'window.LODESTONE_JOBS = window.FF14_JOBS;', 'if (window.FF14_JOBS === jobs) {}',
        'FF14_WORLDS.worlds.includes(name)', 'const FF14_JOBS_COPY = [];', 'window.FF14_JOBS_COPY = [];'
    ]) assert.ok(!touchesSharedName(line), `不該抓到：${line}`);

    // 掃描清單：assets/、tools/、scripts/、api/ 底下的 JS，除了共用檔自己（它就是在 window 上指定這三個名稱的地方）
    const files = ['assets', 'tools', 'scripts', 'api'].flatMap((dir) => listScripts(dir)).filter((file) => file !== SHARED);
    // 清單本身壞了（空的、少了一整個資料夾、進了 node_modules）就大聲失敗，不默默通過
    assert.ok(files.length >= 50, `掃描清單只有 ${files.length} 個檔案`);
    for (const known of ['assets/js/common.js', 'tools/lodestone-lookup/lodestone-data.js', 'scripts/share-preview.mjs', 'api/treasure-room-worker.js']) {
        assert.ok(files.includes(known), `${known} 要在掃描清單裡`);
    }
    assert.ok(!files.includes(SHARED), '共用檔自己不掃');
    assert.ok(!files.some((file) => file.split('/').some((part) => SKIP_DIRS.has(part))), '不掃 node_modules 與工具產生的資料夾');

    const hits = [];
    for (const file of files) {
        fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, index) => {
            if (touchesSharedName(line)) hits.push(`${file}:${index + 1}: ${line.trim()}`);
        });
    }
    assert.deepEqual(hits, [], `共用檔以外的 JS 不能宣告或指定 ${SHARED_NAMES.join('、')}（只有 ${SHARED} 掛它們）`);
});
