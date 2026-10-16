const test = require('node:test');
const assert = require('node:assert/strict');

const CoordinateUtils = require('../tools/treasure-map-finder/coordinate-utils.js');
const CopyFormat = require('../tools/treasure-map-finder/copy-format.js');

// ---------- CopyFormat（tools/treasure-map-finder/copy-format.js）與 CoordinateUtils.formatPair ----------
// 兩個都不碰 DOM，直接 require。storage 用記憶體替身（Storage 找不到 key 時 getItem 回傳 null）。
const KEY = 'treasureMapFormatSettings';

function memoryStorage() {
    const map = new Map();
    return {
        map,
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: key => { map.delete(key); }
    };
}

const stop = {
    index: 1,
    total: 6,
    grade: 'G17',
    zone: { zh: '烏爾科帕恰', en: 'Urqopacha', ja: 'オルコ・パチャ' },
    coords: '(21.6, 23.9)',
    aetheryte: { zh: '瓦群佩洛', en: 'Wachunpelo', ja: 'ワチュンペロ' }
};

test('formatPair：一位小數、不含 Z', () => {
    assert.equal(CoordinateUtils.formatPair({ x: 21.6, y: 23.9, z: 1.2 }), '(21.6, 23.9)');
    assert.equal(CoordinateUtils.formatPair({ x: 20, y: 6.9 }), '(20.0, 6.9)');
});

test('三語預設範本：和卡片的隊伍頻道句子同一個句型，前面加站號', () => {
    assert.equal(CopyFormat.render(CopyFormat.PRESETS.zh, stop), '/p 1/6 G17 烏爾科帕恰 (21.6, 23.9) 最近：瓦群佩洛');
    assert.equal(CopyFormat.render(CopyFormat.PRESETS.en, stop), '/p 1/6 G17 Urqopacha (21.6, 23.9) Nearest: Wachunpelo');
    assert.equal(CopyFormat.render(CopyFormat.PRESETS.ja, stop), '/p 1/6 G17 オルコ・パチャ (21.6, 23.9) 最寄り：ワチュンペロ');
});

test('10 個變數都換得掉，同一個變數出現幾次就換幾次', () => {
    assert.equal(CopyFormat.render('<序號>/<總數> <序號> <寶圖等級> <地區> <地區_en> <地區_ja> <座標> <傳送點> <傳送點_en> <傳送點_ja>', stop),
        '1/6 1 G17 烏爾科帕恰 Urqopacha オルコ・パチャ (21.6, 23.9) 瓦群佩洛 Wachunpelo ワチュンペロ');
});

test('沒有傳送點：預設範本拿掉「最近」那段；自訂範本換成空字串並收掉多的空白（Review Focus 5）', () => {
    const lone = { ...stop, aetheryte: null };
    assert.equal(CopyFormat.render(CopyFormat.PRESETS.zh, lone), '/p 1/6 G17 烏爾科帕恰 (21.6, 23.9)');
    assert.equal(CopyFormat.render(CopyFormat.PRESETS.en, lone), '/p 1/6 G17 Urqopacha (21.6, 23.9)');
    assert.equal(CopyFormat.render('/p <寶圖等級> <傳送點> <座標>', lone), '/p G17 (21.6, 23.9)');
    assert.equal(CopyFormat.render('/p <寶圖等級>  <座標>', stop), '/p G17  (21.6, 23.9)', '有傳送點時不動使用者自己打的空白');
});

test('read：v2 照存的；舊格式轉成新形狀並寫回（Review Focus 3）', () => {
    const cases = [
        [{ version: 2, template: '/p <寶圖等級> <地區>' }, '/p <寶圖等級> <地區>', false],
        [{ teleport: '/p <傳送點_ja>にテレポート <座標>', map: '/p 次 <寶圖等級> - <地區_ja> <座標>' }, CopyFormat.PRESETS.ja, true],
        [{ teleport: '/p TP <傳送點>', map: '/p 下一個 <寶圖等級> - <地區> <座標>' }, CopyFormat.PRESETS.zh, true],
        [{ teleport: '/p 傳送至 <傳送點> <座標>', map: '/p <寶圖等級> <地區> <座標>' }, '/p <寶圖等級> <地區> <座標>', true]
    ];
    for (const [stored, expected, rewritten] of cases) {
        const storage = memoryStorage();
        storage.map.set('treasureMapFormatSettings', JSON.stringify(stored));
        assert.equal(CopyFormat.read(storage), expected, JSON.stringify(stored));
        if (rewritten) assert.deepEqual(JSON.parse(storage.map.get('treasureMapFormatSettings')), { version: 2, template: expected });
    }
    for (const raw of ['not json', '{}', '{"version":2,"template":"  "}', '{"teleport":"x"}']) {
        const storage = memoryStorage();
        storage.map.set('treasureMapFormatSettings', raw);
        assert.equal(CopyFormat.read(storage), null, raw);
    }
    assert.equal(CopyFormat.read(null), null);
    assert.equal(CopyFormat.read({ getItem() { throw new Error('SecurityError'); } }), null);
});

test('write／remove：存成 v2；瀏覽器不讓存時 write 回報 false、不丟例外', () => {
    const storage = memoryStorage();
    assert.equal(CopyFormat.write(storage, CopyFormat.PRESETS.ja), true);
    assert.equal(storage.map.get('treasureMapFormatSettings'), JSON.stringify({ version: 2, template: CopyFormat.PRESETS.ja }));
    CopyFormat.remove(storage);
    assert.equal(storage.map.has('treasureMapFormatSettings'), false);
    assert.equal(CopyFormat.write(null, 'x'), false);
    assert.equal(CopyFormat.write({ setItem() { throw new Error('QuotaExceeded'); } }, 'x'), false);
    assert.doesNotThrow(() => CopyFormat.remove({ removeItem() { throw new Error('SecurityError'); } }));
});

test('describe 與 activeTemplate：沒存跟著介面語言；存的就照存的，不跟介面語言變', () => {
    assert.deepEqual(CopyFormat.describe(null), { kind: 'follow' });
    assert.deepEqual(CopyFormat.describe(CopyFormat.PRESETS.en), { kind: 'preset', language: 'en' });
    assert.deepEqual(CopyFormat.describe('/p <地區>'), { kind: 'custom' });
    assert.equal(CopyFormat.activeTemplate(null, 'ja'), CopyFormat.PRESETS.ja);
    assert.equal(CopyFormat.activeTemplate(null, 'fr'), CopyFormat.PRESETS.zh);
    assert.equal(CopyFormat.activeTemplate(CopyFormat.PRESETS.ja, 'en'), CopyFormat.PRESETS.ja);
});

test('insertAtCursor：取代選取的文字，游標在插入的文字後面', () => {
    assert.deepEqual(CopyFormat.insertAtCursor('/p  (x)', 3, 3, '<地區>'), { value: '/p <地區> (x)', caret: 7 });
    assert.deepEqual(CopyFormat.insertAtCursor('/p OLD end', 3, 6, '<座標>'), { value: '/p <座標> end', caret: 7 });
    assert.deepEqual(CopyFormat.insertAtCursor('/p', undefined, undefined, ' <序號>'), { value: '/p <序號>', caret: 7 });
});

// ---------- 以下是計畫的測試沒有守住的地方 ----------

test('常數：存檔 key、語言、六個按鈕變數與四個說明裡的變數（格式區塊直接用它們建畫面）', () => {
    assert.equal(CopyFormat.STORAGE_KEY, KEY);
    assert.deepEqual(CopyFormat.LANGUAGES, ['zh', 'en', 'ja']);
    assert.deepEqual(CopyFormat.LANGUAGE_NAMES, { zh: '中文', en: 'English', ja: '日本語' });
    assert.deepEqual(CopyFormat.BUTTON_VARIABLES, ['<序號>', '<總數>', '<寶圖等級>', '<地區>', '<座標>', '<傳送點>']);
    assert.deepEqual(CopyFormat.MORE_VARIABLES, ['<地區_en>', '<地區_ja>', '<傳送點_en>', '<傳送點_ja>']);
});

test('範本表彼此對得上：沒有傳送點的版本是預設範本拿掉最後一段，所有範本只用 render 認得的變數', () => {
    const known = [...CopyFormat.BUTTON_VARIABLES, ...CopyFormat.MORE_VARIABLES];
    // 按鈕與說明裡的 10 個變數，render 一個都不能漏
    assert.equal(new Set(known).size, 10);
    assert.doesNotMatch(CopyFormat.render(known.join(' '), stop), /[<>]/);
    for (const language of CopyFormat.LANGUAGES) {
        const full = CopyFormat.PRESETS[language];
        const lone = CopyFormat.PRESETS_NO_AETHERYTE[language];
        assert.ok(full.startsWith(`${lone} `), `${language}：${full}`);
        assert.doesNotMatch(lone, /傳送點/, `${language}：沒有傳送點的版本不能留下傳送點變數`);
        for (const table of [CopyFormat.PRESETS, CopyFormat.PRESETS_NO_AETHERYTE, CopyFormat.LEGACY_MAP_PRESETS]) {
            for (const variable of table[language].match(/<[^>]*>/g)) {
                assert.ok(known.includes(variable), `${language}：${variable}`);
            }
        }
    }
});

test('render：日文預設範本沒有傳送點時一樣拿掉「最寄り」那段；aetheryte 是 undefined 也算沒有', () => {
    assert.equal(CopyFormat.render(CopyFormat.PRESETS.ja, { ...stop, aetheryte: null }), '/p 1/6 G17 オルコ・パチャ (21.6, 23.9)');
    assert.equal(CopyFormat.render(CopyFormat.PRESETS.zh, { ...stop, aetheryte: undefined }), '/p 1/6 G17 烏爾科帕恰 (21.6, 23.9)');
});

test('render：只有範本裡真的用到的變數換成空字串才收空白；收的是連續的空格，不動換行', () => {
    const lone = { ...stop, aetheryte: null };
    // 沒有傳送點，但範本沒用到任何傳送點變數 → 沒有變數是空的，使用者打的空白照舊
    assert.equal(CopyFormat.render('/p <寶圖等級>  <座標>', lone), '/p G17  (21.6, 23.9)');
    // 三種語言的傳送點變數都算；頭尾的空白一起去掉
    assert.equal(CopyFormat.render('<傳送點_en>  <傳送點_ja> /p  <座標> <傳送點>', lone), '/p (21.6, 23.9)');
    // 一站一行：全部複製用換行接起來，所以範本裡使用者自己換的行不能被收成空格
    assert.equal(CopyFormat.render('/p <座標> <傳送點>\n<寶圖等級>', lone).split('\n').length, 2);
});

test('render：自訂範本不猜意思——只有和預設範本完全相同才換成沒有傳送點的版本', () => {
    const lone = { ...stop, aetheryte: null };
    assert.equal(CopyFormat.render(`${CopyFormat.PRESETS.zh} `, lone), '/p 1/6 G17 烏爾科帕恰 (21.6, 23.9) 最近：');
});

test('render：換進去的值不會再被當成變數換一次，值裡的 $ 也不是取代語法', () => {
    const tricky = { ...stop, zone: { zh: '<座標>', en: '$&', ja: '$1' } };
    assert.equal(CopyFormat.render('<地區> <座標>', tricky), '<座標> (21.6, 23.9)');
    assert.equal(CopyFormat.render('<地區_en>|<地區_ja>', tricky), '$&|$1');
});

test('render：欄位缺漏時換成空字串，不會把 undefined 寫進剪貼簿', () => {
    const partial = { ...stop, zone: { zh: '烏爾科帕恰' }, aetheryte: { zh: '瓦群佩洛' } };
    assert.equal(CopyFormat.render('<地區> <地區_ja> <傳送點> <傳送點_en>', partial), '烏爾科帕恰 瓦群佩洛');
});

test('presetLanguage：和三個預設範本完全相同才有語言；多一個空白、沒有傳送點的版本、舊範本都不算', () => {
    for (const language of CopyFormat.LANGUAGES) {
        assert.equal(CopyFormat.presetLanguage(CopyFormat.PRESETS[language]), language);
        assert.equal(CopyFormat.presetLanguage(`${CopyFormat.PRESETS[language]} `), null);
        assert.equal(CopyFormat.presetLanguage(CopyFormat.PRESETS_NO_AETHERYTE[language]), null);
        assert.equal(CopyFormat.presetLanguage(CopyFormat.LEGACY_MAP_PRESETS[language]), null);
    }
    assert.equal(CopyFormat.presetLanguage(''), null);
});

test('describe 與 activeTemplate：undefined 和 null 一樣是沒存', () => {
    assert.deepEqual(CopyFormat.describe(undefined), { kind: 'follow' });
    assert.equal(CopyFormat.activeTemplate(undefined, 'en'), CopyFormat.PRESETS.en);
});

test('read：舊的三個預設寶圖範本各自轉成同語言的新預設範本並寫回，之後算「存過的預設範本」而不是跟著介面語言', () => {
    // 這三句是舊版寫進使用者瀏覽器的，不能改：照字面寫，不引用 LEGACY_MAP_PRESETS，改壞了才抓得到
    const legacyMaps = {
        zh: '/p 下一個 <寶圖等級> - <地區> <座標>',
        en: '/p Next <寶圖等級> - <地區_en> <座標>',
        ja: '/p 次 <寶圖等級> - <地區_ja> <座標>'
    };
    assert.deepEqual(CopyFormat.LEGACY_MAP_PRESETS, legacyMaps);
    for (const language of CopyFormat.LANGUAGES) {
        const storage = memoryStorage();
        storage.map.set(KEY, JSON.stringify({ teleport: '/p 隨便', map: legacyMaps[language] }));
        assert.equal(CopyFormat.read(storage), CopyFormat.PRESETS[language], language);
        assert.deepEqual(JSON.parse(storage.map.get(KEY)), { version: 2, template: CopyFormat.PRESETS[language] }, language);
        // 寫回之後就是 v2：再讀一次一樣，而且描述成那個語言的預設範本（固定語言）
        const again = CopyFormat.read(storage);
        assert.equal(again, CopyFormat.PRESETS[language], language);
        assert.deepEqual(CopyFormat.describe(again), { kind: 'preset', language }, language);
    }
});

test('read：v2 原樣回傳（頭尾的空白也不動）、讀不懂的回 null，兩種都不寫 storage', () => {
    // 重寫 v2 會得到一模一樣的字串，所以不比內容，直接記下有沒有呼叫 setItem
    const readWithoutWriting = raw => {
        const writes = [];
        const storage = { ...memoryStorage(), setItem: (key, value) => { writes.push([key, value]); } };
        storage.map.set(KEY, raw);
        const result = CopyFormat.read(storage);
        assert.deepEqual(writes, [], `不該寫 storage：${JSON.stringify(raw)}`);
        return result;
    };

    assert.equal(readWithoutWriting(JSON.stringify({ version: 2, template: ' /p <座標> ' })), ' /p <座標> ');
    for (const raw of [
        '', 'not json', 'null', '[]', '"text"', '5', 'true', '{}',
        '{"version":2}', '{"version":2,"template":5}', '{"version":2,"template":""}', '{"version":2,"template":"  "}',
        '{"version":3,"template":"/p x"}', '{"template":"/p x"}',
        '{"teleport":"x"}', '{"map":5}', '{"map":"  "}', '{"teleport":"x","map":null}', '{"map":["a"]}'
    ]) {
        assert.equal(readWithoutWriting(raw), null, JSON.stringify(raw));
    }
});

test('read：舊格式寫回失敗不影響回傳值——setItem 丟例外、或根本沒有 setItem', () => {
    const legacy = JSON.stringify({ teleport: '/p TP <傳送點>', map: '/p 下一個 <寶圖等級> - <地區> <座標>' });
    for (const setItem of [() => { throw new Error('QuotaExceededError'); }, undefined]) {
        assert.equal(CopyFormat.read({ getItem: () => legacy, setItem }), CopyFormat.PRESETS.zh);
    }
});

test('write 存的範本 read 讀得回來（含引號、反斜線、換行與表情符號）；remove 之後讀不到，remove(null) 不丟例外', () => {
    const storage = memoryStorage();
    for (const template of [...Object.values(CopyFormat.PRESETS), '/p "引號" \\ 反斜線\n第二行 😀 <座標>']) {
        assert.equal(CopyFormat.write(storage, template), true);
        assert.equal(CopyFormat.read(storage), template);
    }
    CopyFormat.remove(storage);
    assert.equal(CopyFormat.read(storage), null);
    assert.doesNotThrow(() => CopyFormat.remove(null));
});

test('insertAtCursor：只要有一端不是數字就接在最後，不會刪掉游標後面的字；整段選取就整段取代', () => {
    assert.deepEqual(CopyFormat.insertAtCursor('abc', null, null, '<序號>'), { value: 'abc<序號>', caret: 7 });
    assert.deepEqual(CopyFormat.insertAtCursor('abc', 1, undefined, 'X'), { value: 'abcX', caret: 4 });
    assert.deepEqual(CopyFormat.insertAtCursor('abc', NaN, 2, 'X'), { value: 'abcX', caret: 4 });
    assert.deepEqual(CopyFormat.insertAtCursor('abc', 0, 3, 'X'), { value: 'X', caret: 1 });
    assert.deepEqual(CopyFormat.insertAtCursor('', 0, 0, '<座標>'), { value: '<座標>', caret: 4 });
});

test('formatPair：和卡片的 formatXY 同一種進位寫法，數字字串也行', () => {
    assert.equal(CoordinateUtils.formatPair({ x: '21.6', y: '23.9' }), '(21.6, 23.9)');
    for (const coords of [{ x: 13.7, y: 14.2 }, { x: 17, y: 8 }, { x: 9.04, y: 41.96 }]) {
        const [, x, y] = CoordinateUtils.formatXY(coords).match(/^X (\S+)・Y (\S+)$/);
        assert.equal(CoordinateUtils.formatPair(coords), `(${x}, ${y})`);
    }
});
