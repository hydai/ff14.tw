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

test('11 個變數都換得掉，同一個變數出現幾次就換幾次', () => {
    assert.equal(CopyFormat.render('<序號>/<總數> <序號> <寶圖等級> <地區> <地區_en> <地區_ja> <座標> <傳送點> <傳送點_en> <傳送點_ja> <寶圖主人>', { ...stop, owner: '光之戰士K7Q' }),
        '1/6 1 G17 烏爾科帕恰 Urqopacha オルコ・パチャ (21.6, 23.9) 瓦群佩洛 Wachunpelo ワチュンペロ 光之戰士K7Q');
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

test('常數：存檔 key、語言、七個按鈕變數與四個說明裡的變數、隊伍版句尾（格式區塊直接用它們建畫面）', () => {
    assert.equal(CopyFormat.STORAGE_KEY, KEY);
    assert.deepEqual(CopyFormat.LANGUAGES, ['zh', 'en', 'ja']);
    assert.deepEqual(CopyFormat.LANGUAGE_NAMES, { zh: '中文', en: 'English', ja: '日本語' });
    assert.deepEqual(CopyFormat.BUTTON_VARIABLES, ['<序號>', '<總數>', '<寶圖等級>', '<地區>', '<座標>', '<傳送點>', '<寶圖主人>']);
    assert.equal(CopyFormat.BUTTON_VARIABLES.length, 7);
    assert.equal(CopyFormat.BUTTON_VARIABLES.at(-1), '<寶圖主人>');
    assert.deepEqual(CopyFormat.MORE_VARIABLES, ['<地區_en>', '<地區_ja>', '<傳送點_en>', '<傳送點_ja>']);
    // 中文的名字後面有一個空格、英文的前面有一個空格，日文都沒有（設計 6.9）
    assert.deepEqual(CopyFormat.OWNER_SUFFIX, { zh: '（<寶圖主人> 的圖）', en: " (<寶圖主人>'s map)", ja: '（<寶圖主人>の地図）' });
});

test('範本表彼此對得上：沒有傳送點的版本是預設範本拿掉最後一段，所有範本只用 render 認得的變數', () => {
    const known = [...CopyFormat.BUTTON_VARIABLES, ...CopyFormat.MORE_VARIABLES];
    // 按鈕與說明裡的 11 個變數，render 一個都不能漏
    assert.equal(new Set(known).size, 11);
    assert.doesNotMatch(CopyFormat.render(known.join(' '), { ...stop, owner: '光之戰士K7Q' }), /[<>]/);
    for (const language of CopyFormat.LANGUAGES) {
        const full = CopyFormat.PRESETS[language];
        const lone = CopyFormat.PRESETS_NO_AETHERYTE[language];
        assert.ok(full.startsWith(`${lone} `), `${language}：${full}`);
        assert.doesNotMatch(lone, /傳送點/, `${language}：沒有傳送點的版本不能留下傳送點變數`);
        assert.equal(CopyFormat.OWNER_SUFFIX[language].match(/<寶圖主人>/g).length, 1, `${language}：隊伍版句尾要有一個 <寶圖主人>`);
        for (const table of [CopyFormat.PRESETS, CopyFormat.PRESETS_NO_AETHERYTE, CopyFormat.LEGACY_MAP_PRESETS, CopyFormat.OWNER_SUFFIX]) {
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
    // 主人的名字是隊伍裡別人取的：自訂範本與預設範本的句尾都一樣，名字照原樣放進去
    const sneaky = { ...stop, owner: '<座標>$&' };
    assert.equal(CopyFormat.render('<寶圖主人>|<座標>', sneaky), '<座標>$&|(21.6, 23.9)');
    assert.equal(CopyFormat.render(CopyFormat.PRESETS.zh, sneaky), '/p 1/6 G17 烏爾科帕恰 (21.6, 23.9) 最近：瓦群佩洛（<座標>$& 的圖）');
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

// ---------- 隊伍版（設計 6.9）：<寶圖主人> 與預設範本的句尾 ----------
// 設計 6.9 的例子：科扎馬烏卡 (20.0, 6.9)，最近的傳送點是奧克哈努。主人的名字每種語言各給一個，CopyFormat 不翻譯名字
const partyStop = {
    index: 1,
    total: 4,
    grade: 'G17',
    zone: { zh: '科扎馬烏卡', en: "Kozama'uka", ja: 'コザマ・ウカ' },
    coords: '(20.0, 6.9)',
    aetheryte: { zh: '奧克哈努', en: "Ok' Hanu", ja: 'オック・ハヌ' }
};
const loneStop = { ...partyStop, aetheryte: null };
const OWNER_NAMES = { zh: '光之戰士K7Q', en: 'Warrior of Light K7Q', ja: '光の戦士K7Q' };
// 預設範本的四種句子 × 三種語言：plain 沒有主人、party 有主人；Lone 是這一站查不到傳送點。
// plain 的兩種和隊伍版出現以前一模一樣
const SENTENCES = {
    zh: {
        plain: '/p 1/4 G17 科扎馬烏卡 (20.0, 6.9) 最近：奧克哈努',
        plainLone: '/p 1/4 G17 科扎馬烏卡 (20.0, 6.9)',
        party: '/p 1/4 G17 科扎馬烏卡 (20.0, 6.9) 最近：奧克哈努（光之戰士K7Q 的圖）',
        partyLone: '/p 1/4 G17 科扎馬烏卡 (20.0, 6.9)（光之戰士K7Q 的圖）'
    },
    en: {
        plain: "/p 1/4 G17 Kozama'uka (20.0, 6.9) Nearest: Ok' Hanu",
        plainLone: "/p 1/4 G17 Kozama'uka (20.0, 6.9)",
        party: "/p 1/4 G17 Kozama'uka (20.0, 6.9) Nearest: Ok' Hanu (Warrior of Light K7Q's map)",
        partyLone: "/p 1/4 G17 Kozama'uka (20.0, 6.9) (Warrior of Light K7Q's map)"
    },
    ja: {
        plain: '/p 1/4 G17 コザマ・ウカ (20.0, 6.9) 最寄り：オック・ハヌ',
        plainLone: '/p 1/4 G17 コザマ・ウカ (20.0, 6.9)',
        party: '/p 1/4 G17 コザマ・ウカ (20.0, 6.9) 最寄り：オック・ハヌ（光の戦士K7Qの地図）',
        partyLone: '/p 1/4 G17 コザマ・ウカ (20.0, 6.9)（光の戦士K7Qの地図）'
    }
};

test('隊伍版預設範本：預設範本＋owner 時句尾接上名字，和沒有傳送點的版本疊加（三語 × 有無傳送點）', () => {
    for (const language of CopyFormat.LANGUAGES) {
        const template = CopyFormat.PRESETS[language];
        const owner = OWNER_NAMES[language];
        assert.equal(CopyFormat.render(template, { ...partyStop, owner }), SENTENCES[language].party, `${language}：有傳送點`);
        assert.equal(CopyFormat.render(template, { ...loneStop, owner }), SENTENCES[language].partyLone, `${language}：沒有傳送點`);
    }
});

test('owner 是 null 或 undefined：預設範本和現在一樣', () => {
    // 舊的呼叫端根本沒有 owner 這個欄位；空字串也當作沒有主人，不會接上「（ 的圖）」
    const ownerless = [['沒有 owner 欄位', {}], ['undefined', { owner: undefined }], ['null', { owner: null }], ['空字串', { owner: '' }]];
    for (const language of CopyFormat.LANGUAGES) {
        for (const [label, extra] of ownerless) {
            assert.equal(CopyFormat.render(CopyFormat.PRESETS[language], { ...partyStop, ...extra }), SENTENCES[language].plain, `${language}：${label}`);
            assert.equal(CopyFormat.render(CopyFormat.PRESETS[language], { ...loneStop, ...extra }), SENTENCES[language].plainLone, `${language}：${label}，沒有傳送點`);
        }
    }
});

test('自訂範本的 <寶圖主人>：有值就換上；空的時套用「變空就收空白」', () => {
    const template = '/p <寶圖主人> 開 <座標>';
    assert.equal(CopyFormat.render(template, { ...partyStop, owner: '光之戰士K7Q' }), '/p 光之戰士K7Q 開 (20.0, 6.9)');
    assert.equal(CopyFormat.render(template, { ...partyStop, owner: null }), '/p 開 (20.0, 6.9)');
    assert.equal(CopyFormat.render(template, partyStop), '/p 開 (20.0, 6.9)', 'stop 沒有 owner 欄位時也是空的');
    assert.equal(CopyFormat.render('<寶圖主人> <座標> <寶圖主人>', { ...partyStop, owner: 'A' }), 'A (20.0, 6.9) A', '同一個變數出現幾次就換幾次');
    // 範本裡沒有 <寶圖主人>：有 owner 也完全不變，不會接上句尾
    assert.equal(CopyFormat.render('/p <座標>', { ...partyStop, owner: '光之戰士K7Q' }), '/p (20.0, 6.9)');
    // 預設範本多一個空白就是自訂範本：沒有句尾，也不改用沒有傳送點的版本
    assert.equal(CopyFormat.render(`${CopyFormat.PRESETS.zh} `, { ...loneStop, owner: '光之戰士K7Q' }), '/p 1/4 G17 科扎馬烏卡 (20.0, 6.9) 最近：');
    // 使用者自己把句尾打進範本：也是自訂範本，名字照變數換一次，句尾不會再被接上一次
    const typedByHand = CopyFormat.PRESETS.zh + CopyFormat.OWNER_SUFFIX.zh;
    assert.equal(CopyFormat.render(typedByHand, { ...partyStop, owner: OWNER_NAMES.zh }), SENTENCES.zh.party);
    assert.equal(CopyFormat.render(typedByHand, { ...loneStop, owner: OWNER_NAMES.zh }), '/p 1/4 G17 科扎馬烏卡 (20.0, 6.9) 最近：（光之戰士K7Q 的圖）');
});

test('owner 裡的換行與其他控制字元換成一個空格：名字不會讓一站多出一行（伺服器只限制名字長度，貼進巨集的那一行會變成另一個指令）；範本自己的換行照留', () => {
    // \n、\r\n、\u2028、\u2029、tab、NEL（\u0085），連在一起的算一個空格
    for (const owner of ['A\n/sh hi', 'A\r\n/sh hi', 'A\u2028/sh hi', 'A\u2029/sh hi', 'A\n\r\n/sh hi', 'A\t/sh hi', 'A\u0085/sh hi']) {
        const line = CopyFormat.render(CopyFormat.PRESETS.zh, { ...partyStop, owner });
        assert.equal(line, '/p 1/4 G17 科扎馬烏卡 (20.0, 6.9) 最近：奧克哈努（A /sh hi 的圖）', JSON.stringify(owner));
    }
    // 自訂範本裡使用者自己換的行留著，名字裡的換行一樣換掉
    assert.equal(CopyFormat.render('<寶圖主人>\n<座標>', { ...partyStop, owner: 'A\nB' }), 'A B\n(20.0, 6.9)');
    // 名字頭尾的控制字元去掉；只剩控制字元就當作沒有主人，不接「（ 的圖）」
    assert.equal(CopyFormat.render(CopyFormat.PRESETS.zh, { ...partyStop, owner: '\nA\n' }), '/p 1/4 G17 科扎馬烏卡 (20.0, 6.9) 最近：奧克哈努（A 的圖）');
    assert.equal(CopyFormat.render(CopyFormat.PRESETS.zh, { ...partyStop, owner: '\u0085' }), SENTENCES.zh.plain);
});

test('presetLanguage 照樣只認三個基本預設範本', () => {
    for (const language of CopyFormat.LANGUAGES) {
        const suffix = CopyFormat.OWNER_SUFFIX[language];
        assert.equal(CopyFormat.presetLanguage(CopyFormat.PRESETS[language]), language);
        assert.equal(CopyFormat.presetLanguage(CopyFormat.PRESETS[language] + suffix), null, `${language}：預設範本＋句尾`);
        assert.equal(CopyFormat.presetLanguage(CopyFormat.PRESETS_NO_AETHERYTE[language] + suffix), null, `${language}：沒有傳送點的版本＋句尾`);
        // describe() 跟著不變：存的是基本預設範本，格式區塊收起時還是寫那個語言的名稱（隊伍版只在 render() 當下組，不存）
        assert.deepEqual(CopyFormat.describe(CopyFormat.PRESETS[language]), { kind: 'preset', language }, language);
        assert.deepEqual(CopyFormat.describe(CopyFormat.PRESETS[language] + suffix), { kind: 'custom' }, language);
    }
});
