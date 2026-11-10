const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const mappings = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/macro-mappings.json'), 'utf8'));

// conversion-engine.js 把 ConversionEngine 掛在 window 上，所以讓 window 指向 context 本身（同 dungeon-list.test.js）
function loadEngineClass() {
    const context = vm.createContext({});
    context.window = context;
    const file = path.join(ROOT, 'tools/macro-converter/conversion-engine.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: 'conversion-engine.js' });
    return context.ConversionEngine;
}

const ConversionEngine = loadEngineClass();
const engine = new ConversionEngine(mappings);

// vm 裡建出來的陣列與物件原型和這邊不同，deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));

// 全形空白（U+3000）與不換行空白（U+00A0）：String.prototype.trim() 與 \s 都把它們當空白。
// 用 fromCharCode 寫：看得出這一個字是什麼，不會被編輯器或複製貼上換成一般的空白
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);
const NBSP = String.fromCharCode(0x00a0);

// 轉換一段巨集，回傳每一行的 { output, problems }
function convert(text, targetLang = 'zh') {
    return plain(engine.convert(text, targetLang));
}

// 一行輸入只會有一個結果
function convertLine(line, targetLang = 'zh') {
    const results = convert(line, targetLang);
    assert.equal(results.length, 1, `一行輸入要剛好一個結果：${JSON.stringify(line)}`);
    return results[0];
}

// 一行輸入的輸出與問題清單
function assertLine(line, expectedOutput, expectedProblems = [], targetLang = 'zh') {
    const result = convertLine(line, targetLang);
    const label = `輸入 ${JSON.stringify(line)}（目標 ${targetLang}）`;
    assert.equal(result.output, expectedOutput, `${label} 的輸出`);
    assert.deepEqual(result.problems, expectedProblems, `${label} 的問題`);
}

// 整段巨集：每一行 [輸入, 繁中輸出]，都不該有問題
function assertMacro(rows) {
    const results = convert(rows.map(([input]) => input).join('\n'));
    assert.equal(results.length, rows.length, '行數要和輸入一樣');
    rows.forEach(([input, expected], index) => {
        const label = `第 ${index + 1} 行 ${input}`;
        assert.equal(results[index].output, expected, `${label} 的輸出`);
        assert.deepEqual(results[index].problems, [], `${label} 不該有問題`);
    });
}

// ---------- 兩段代表樣本（目標繁體中文）----------
// 2026-11-10 巨集轉換器改版時定下的：照 Teamcraft 匯出與日文攻略的常見寫法組出來，不是逐字抄某一份攻略。
// 輸入與輸出的每一行都不能改，改了就是改了轉換的結果。

// 英文（Teamcraft 匯出的格式）
const ENGLISH_MACRO = [
    ['/mlock', '/mlock'],
    [`/macroicon "Byregot's Blessing"`, '/巨集圖標 "比爾格的祝福"'],
    ['/ac "Muscle Memory" <wait.3>', '/ac "堅信" <wait.3>'],
    ['/ac Manipulation <wait.2>', '/ac "掌握" <wait.2>'],
    ['/ac "Waste Not II" <wait.2>', '/ac "長期儉約" <wait.2>'],
    ['/ac Groundwork <wait.3>', '/ac "坯料製作" <wait.3>'],
    ['/ac "Trained Perfection" <wait.2>', '/ac "工匠的絕技" <wait.2>'],
    ['/ac Innovation <wait.2>', '/ac "改革" <wait.2>'],
    ['/ac "Preparatory Touch" <wait.3>', '/ac "坯料加工" <wait.3>'],
    ['/ac "Great Strides" <wait.2>', '/ac "闊步" <wait.2>'],
    [`/ac "Byregot's Blessing" <wait.3>`, '/ac "比爾格的祝福" <wait.3>'],
    ['/ac "Immaculate Mend" <wait.3>', '/ac "巧奪天工" <wait.3>'],
    ['/echo Macro #1 complete <se.1>', '/默語 Macro #1 complete <se.1>']
];

// 日文（攻略常見的寫法，技能名不加引號）
const JAPANESE_MACRO = [
    ['/merror off', '/merror off'],
    ['/micon マニピュレーション', '/micon "掌握"'],
    ['/ac 確信 <wait.3>', '/ac "堅信" <wait.3>'],
    ['/ac マニピュレーション <wait.2>', '/ac "掌握" <wait.2>'],
    ['/ac 長期倹約 <wait.2>', '/ac "長期儉約" <wait.2>'],
    ['/ac 下地作業 <wait.3>', '/ac "坯料製作" <wait.3>'],
    ['/ac イノベーション <wait.2>', '/ac "改革" <wait.2>'],
    ['/ac "ビエルゴの祝福" <wait.3>', '/ac "比爾格的祝福" <wait.3>'],
    ['/e マクロ1完了 <se.1>', '/e マクロ1完了 <se.1>']
];

// 簡寫表：測試自己寫一份，不從引擎抄，引擎少一個或多一個都會被抓到
const EXPECTED_SHORT_COMMANDS = {
    '/mlock': '/macrolock',
    '/merror': '/macroerror',
    '/micon': '/macroicon',
    '/e': '/echo',
    '/p': '/party',
    '/s': '/say',
    '/sh': '/shout',
    '/y': '/yell',
    '/t': '/tell',
    '/r': '/reply',
    '/a': '/alliance',
    '/fc': '/freecompany',
    '/em': '/emote',
    '/gs': '/gearset'
};
for (let n = 1; n <= 8; n++) {
    EXPECTED_SHORT_COMMANDS[`/l${n}`] = `/linkshell${n}`;
    EXPECTED_SHORT_COMMANDS[`/cwl${n}`] = `/cwlinkshell${n}`;
}

// ---------- 兩段完整的攻略巨集 ----------

test('英文攻略（Teamcraft 格式）整段換成繁中：逐行與測試裡的對照表相同，沒有任何問題', () => {
    assertMacro(ENGLISH_MACRO);
});

test('日文攻略的寫法整段換成繁中：逐行與測試裡的對照表相同，沒有任何問題', () => {
    assertMacro(JAPANESE_MACRO);
});

test('每一行只回傳 output 與 problems，舊的 untranslatable 欄位拿掉', () => {
    const results = convert([
        '/ac Innovation <wait.2>',
        '/ac Final Appraisal <wait.2>',
        '/foo bar',
        '# 第一段',
        ''
    ].join('\n'));
    assert.equal(results.length, 5);
    for (const result of results) {
        assert.deepEqual(Object.keys(result).sort(), ['output', 'problems'], '一行的結果只有 output 與 problems');
        assert.ok(Array.isArray(result.problems), 'problems 是陣列');
        for (const problem of result.problems) {
            assert.deepEqual(Object.keys(problem).sort(), ['kind', 'text'], '一個問題只有 kind 與 text');
        }
    }
    // 問題照行的位置對上，沒有問題的行是空陣列；不是 / 開頭的行是 text 問題
    assert.deepEqual(results.map((result) => result.problems), [
        [],
        [{ kind: 'action', text: 'Final Appraisal' }],
        [{ kind: 'command', text: '/foo' }],
        [{ kind: 'text', text: '# 第一段' }],
        []
    ]);
});

// ---------- 英文簡寫 ----------

test('30 個英文簡寫都原樣輸出、不列入問題，後面的參數照完整指令處理', () => {
    const { SHORT_COMMANDS } = ConversionEngine;
    assert.ok(Object.isFrozen(SHORT_COMMANDS), 'SHORT_COMMANDS 是凍結的');
    assert.equal(Object.keys(EXPECTED_SHORT_COMMANDS).length, 30, '測試自己的對照表就是 30 個');
    assert.equal(Object.keys(SHORT_COMMANDS).length, 30, 'SHORT_COMMANDS 有 30 個簡寫');
    assert.deepEqual(plain(SHORT_COMMANDS), EXPECTED_SHORT_COMMANDS, '簡寫與完整指令的對照');

    // 只收完整指令在資料裡的簡寫
    const baseCommands = new Set(mappings.textCommands.map((command) => command.baseCommand));
    for (const [short, full] of Object.entries(EXPECTED_SHORT_COMMANDS)) {
        assert.ok(baseCommands.has(full), `${short} 的完整指令 ${full} 要在 mappings.textCommands 的 baseCommand 裡`);
    }

    // 每一個簡寫、每一種目標語言都原樣輸出，連大小寫都照打的
    for (const short of Object.keys(EXPECTED_SHORT_COMMANDS)) {
        for (const lang of ['zh', 'en', 'ja']) {
            assertLine(short, short, [], lang);
            assertLine(short.toUpperCase(), short.toUpperCase(), [], lang);
            // /micon 後面的字是技能名，由下一個測試守住
            if (short !== '/micon') assertLine(`${short} 完成 <se.1>`, `${short} 完成 <se.1>`, [], lang);
        }
    }

    assertLine('/mlock', '/mlock');
    assertLine('/merror off', '/merror off');
    assertLine('/e 完成 <se.1>', '/e 完成 <se.1>');
    assertLine('/MLOCK', '/MLOCK');

    // 簡寫表之外的不算：只差一個字、或是沒有的編號，照樣列入問題
    assertLine('/mloc', '/mloc', [{ kind: 'command', text: '/mloc' }]);
    assertLine('/ec 完成', '/ec 完成', [{ kind: 'command', text: '/ec' }]);
    assertLine('/l9 hi', '/l9 hi', [{ kind: 'command', text: '/l9' }]);
    assertLine('/cwl0 hi', '/cwl0 hi', [{ kind: 'command', text: '/cwl0' }]);
});

test('/macroicon、/micon 的參數當成技能名翻譯，第二個參數原樣保留', () => {
    assertLine('/micon "Muscle Memory"', '/micon "堅信"');
    assertLine('/micon Manipulation action', '/micon "掌握" action');
    assertLine(`/macroicon "Byregot's Blessing"`, '/巨集圖標 "比爾格的祝福"');
    assertLine('/巨集圖標 "堅信"', '/macroicon "Muscle Memory"', [], 'en');
    assertLine('/micon "Hi-Cordial" item', '/micon "Hi-Cordial" item', [{ kind: 'action', text: 'Hi-Cordial' }]);

    // 沒加引號時第二個參數直接接在名字後面：只有這兩個指令取最長的字首當技能名，其餘的字原樣接著
    assertLine('/micon Waste Not II', '/micon "長期儉約"');
    assertLine('/micon Waste Not II item', '/micon "長期儉約" item');
    assertLine('/macroicon Muscle Memory action', '/巨集圖標 "堅信" action');
    assertLine('/巨集圖標 Manipulation action', '/巨集圖標 "掌握" action');
    // 整段（含第二個參數）都查不到：整段照原文，整段列成一個問題
    assertLine('/micon Hi-Cordial item', '/micon Hi-Cordial item', [{ kind: 'action', text: 'Hi-Cordial item' }]);

    // 技能名可以是任何一種語言，目標語言決定換成哪一種；簡寫照打的，完整指令換成別名或 baseCommand
    assertLine('/micon "Muscle Memory"', '/micon "確信"', [], 'ja');
    assertLine('/macroicon 確信 action', '/macroicon "Muscle Memory" action', [], 'en');
    assertLine('/macroicon Manipulation', '/巨集圖標 "掌握"');
    assertLine('/MICON manipulation', '/MICON "掌握"');
    // 沒有技能名時沒有東西可翻，也不是問題
    assertLine('/micon', '/micon');
    assertLine('/macroicon', '/巨集圖標');
});

// ---------- 引號與技能名 ----------

test('彎引號換成直引號再比對，輸出用直引號；/echo 的文字不動', () => {
    assertLine('/ac “Muscle Memory” <wait.3>', '/ac "堅信" <wait.3>');
    assertLine('/ac "Byregot’s Blessing"', '/ac "比爾格的祝福"');
    assertLine('/ac “Final Appraisal” <wait.2>', '/ac "Final Appraisal" <wait.2>', [{ kind: 'action', text: 'Final Appraisal' }]);
    assertLine('/echo “done”', '/默語 “done”');

    // 三種彎引號都算；技能名的彎撇號（沒有加引號時也一樣）比對時換成直的
    assertLine('/ac „Muscle Memory“ <wait.3>', '/ac "堅信" <wait.3>');
    assertLine('/ac Byregot’s Blessing <wait.3>', '/ac "比爾格的祝福" <wait.3>');
    assertLine('/macroicon “Byregot’s Blessing”', '/巨集圖標 "比爾格的祝福"');
    // 文字內容只動指令，引號與撇號都留著
    assertLine('/e “Byregot’s” 完成 <se.1>', '/e “Byregot’s” 完成 <se.1>');
});

test('引號裡的技能名：不換行空白、全形空白、tab 與前後的空白都當成一個空格再比對', () => {
    // 從網頁複製下來的技能名，字與字中間可能是不換行空白（U+00A0）或全形空白（U+3000）：看起來和一般的空白一樣，不能被當成沒收錄
    assertLine(`/ac "Muscle${NBSP}Memory" <wait.3>`, '/ac "堅信" <wait.3>');
    assertLine(`/ac "Muscle${IDEOGRAPHIC_SPACE}Memory" <wait.3>`, '/ac "堅信" <wait.3>');
    assertLine(`/ac "Waste${NBSP}Not${IDEOGRAPHIC_SPACE}II" <wait.2>`, '/ac "長期儉約" <wait.2>');
    // 好幾個空白、tab，與引號裡面前後的空白
    assertLine('/ac "Muscle \t  Memory"', '/ac "堅信"');
    assertLine('/ac "  Muscle Memory  " <wait.3>', '/ac "堅信" <wait.3>');
    assertLine(`/ac " ${NBSP}Muscle Memory${IDEOGRAPHIC_SPACE}"`, '/ac "堅信"');
    // /macroicon、/micon、彎引號與彎撇號也一樣；目標語言不影響
    assertLine(`/macroicon "Byregot's${NBSP}Blessing"`, '/巨集圖標 "比爾格的祝福"');
    assertLine(`/micon "Muscle${NBSP}Memory"`, '/micon "堅信"');
    assertLine(`/ac “Byregot’s${NBSP}Blessing”`, '/ac "比爾格的祝福"');
    assertLine(`/ac "Muscle${NBSP}Memory" <wait.3>`, '/ac "確信" <wait.3>', [], 'ja');
    assertLine(`/ac "Muscle${NBSP}Memory" <wait.3>`, '/ac "Muscle Memory" <wait.3>', [], 'en');
    // 沒加引號的技能名本來就是照空白切開再接起來，結果一樣
    assertLine(`/ac Muscle${NBSP}Memory <wait.3>`, '/ac "堅信" <wait.3>');

    // 真的沒收錄的名字：輸出與問題的文字都照原文（空白也照打的字），不是整理過的樣子
    assertLine(`/ac "Final${NBSP}Appraisal" <wait.2>`, `/ac "Final${NBSP}Appraisal" <wait.2>`, [{ kind: 'action', text: `Final${NBSP}Appraisal` }]);
    assertLine('/ac "  Final Appraisal " <wait.2>', '/ac "  Final Appraisal " <wait.2>', [{ kind: 'action', text: '  Final Appraisal ' }]);
    // 引號裡只有空白：沒有技能名可查，和以前一樣列成問題
    assertLine('/ac " "', '/ac " "', [{ kind: 'action', text: ' ' }]);
});

test('沒加引號的技能名：/ac 要整段查得到才換，查不到整段照原文', () => {
    assertLine('/ac Muscle Memory <wait.3>', '/ac "堅信" <wait.3>');
    assertLine('/ac Final Appraisal <wait.2>', '/ac Final Appraisal <wait.2>', [{ kind: 'action', text: 'Final Appraisal' }]);
    assertLine('/ac "Final Appraisal" <wait.2>', '/ac "Final Appraisal" <wait.2>', [{ kind: 'action', text: 'Final Appraisal' }]);

    // 名字有好幾個字：整段是技能名就換，Waste Not II 是一個技能名，不是「Waste Not」加一個 II
    assertLine('/ac Waste Not II <wait.2>', '/ac "長期儉約" <wait.2>');
    assertLine('/ac Waste Not <wait.2>', '/ac "儉約" <wait.2>');
    // 整段不是技能名，就算前半段是（資料裡有 Manipulation、沒有 Manipulation II）：不取字首，
    // 不能悄悄變成 "掌握" II；整行照原文，整段列成一個問題
    assertLine('/ac Manipulation II <wait.2>', '/ac Manipulation II <wait.2>', [{ kind: 'action', text: 'Manipulation II' }]);
    assertLine('/ac Muscle Memory extra <wait.3>', '/ac Muscle Memory extra <wait.3>', [{ kind: 'action', text: 'Muscle Memory extra' }]);
    // /ac 的每一種寫法都一樣（指令一律輸出 /ac）
    for (const command of ['/ac', '/action', '/技能', '/アクション']) {
        assertLine(`${command} Manipulation II <wait.2>`, '/ac Manipulation II <wait.2>', [{ kind: 'action', text: 'Manipulation II' }]);
    }
    // 沒有 <wait>：整行就是技能名
    assertLine('/ac Muscle Memory', '/ac "堅信"');
    assertLine('/ac Final Appraisal', '/ac Final Appraisal', [{ kind: 'action', text: 'Final Appraisal' }]);
    // 沒有技能名的行不是問題
    assertLine('/ac <wait.2>', '/ac <wait.2>');
    assertLine('/ac', '/ac');
});

test('不認得的指令原樣保留、列入 command 問題；空行不動', () => {
    assertLine('/foo bar', '/foo bar', [{ kind: 'command', text: '/foo' }]);
    assertLine('', '');

    // 空白行也不動
    assertLine('   ', '   ');
    // 不認得的指令後面的字不是技能名，不查；指令照打的字列出來
    assertLine('/FOO Muscle Memory', '/FOO Muscle Memory', [{ kind: 'command', text: '/FOO' }]);
    // 縮排拿掉，指令與後面的字之間的空白照原樣（不認得的指令整行照原文）
    assertLine('  /foo   bar  ', '/foo   bar', [{ kind: 'command', text: '/foo' }]);
    // / 開頭就是指令：只有一個 / 或 / 後面接空白，也是不認得的指令
    assertLine('/', '/', [{ kind: 'command', text: '/' }]);
    assertLine('/ ac Innovation', '/ ac Innovation', [{ kind: 'command', text: '/' }]);

    // 問題跟著行走：每一行各有各的
    const results = convert([
        '# 第一段',
        '/ac Final Appraisal <wait.2>',
        '',
        '/foo bar',
        '/ac "Muscle Memory" <wait.3>',
        '/bar baz',
        'hello'
    ].join('\n'));
    assert.deepEqual(results.map((result) => result.output), [
        '# 第一段',
        '/ac Final Appraisal <wait.2>',
        '',
        '/foo bar',
        '/ac "堅信" <wait.3>',
        '/bar baz',
        'hello'
    ]);
    assert.deepEqual(results.map((result) => result.problems), [
        [{ kind: 'text', text: '# 第一段' }],
        [{ kind: 'action', text: 'Final Appraisal' }],
        [],
        [{ kind: 'command', text: '/foo' }],
        [],
        [{ kind: 'command', text: '/bar' }],
        [{ kind: 'text', text: 'hello' }]
    ]);
});

test('不是指令的行（貼上的標題、表格的編號、# 備註）照原文保留、列入 text 問題；空白行不是問題', () => {
    // 遊戲裡沒有 / 開頭的一行會當成聊天訊息送出：攻略的標題行（15 行的巨集上面常有一行「マクロ1」）也一樣
    assertLine('マクロ1', 'マクロ1', [{ kind: 'text', text: 'マクロ1' }]);
    assertLine('Macro 1', 'Macro 1', [{ kind: 'text', text: 'Macro 1' }]);
    assertLine('hello', 'hello', [{ kind: 'text', text: 'hello' }]);

    // 表格複製下來的編號在指令前面：整行不轉換（技能名也不翻），問題的文字是整行（去掉前後的空白）
    assertLine('1\t/ac 確信 <wait.3>', '1\t/ac 確信 <wait.3>', [{ kind: 'text', text: '1\t/ac 確信 <wait.3>' }]);
    assertLine('1. /ac "Muscle Memory" <wait.3>', '1. /ac "Muscle Memory" <wait.3>', [{ kind: 'text', text: '1. /ac "Muscle Memory" <wait.3>' }]);

    // # 開頭的行也是：FFXIV 沒有註解的寫法，遊戲照樣把它送到聊天
    assertLine('# 第一段', '# 第一段', [{ kind: 'text', text: '# 第一段' }]);
    assertLine('#', '#', [{ kind: 'text', text: '#' }]);

    // 前後的空白（含全形空白）只影響問題的文字，輸出照原樣
    assertLine('  # 備註', '  # 備註', [{ kind: 'text', text: '# 備註' }]);
    assertLine(`${IDEOGRAPHIC_SPACE}マクロ1${IDEOGRAPHIC_SPACE}`, `${IDEOGRAPHIC_SPACE}マクロ1${IDEOGRAPHIC_SPACE}`, [{ kind: 'text', text: 'マクロ1' }]);
    assertLine(`${NBSP}Macro 1`, `${NBSP}Macro 1`, [{ kind: 'text', text: 'Macro 1' }]);
    // 尖括號與引號照原文，問題的文字不跳脫
    assertLine('<me> "第一段"', '<me> "第一段"', [{ kind: 'text', text: '<me> "第一段"' }]);

    // 目標語言不影響
    for (const lang of ['zh', 'en', 'ja']) {
        assertLine('マクロ1', 'マクロ1', [{ kind: 'text', text: 'マクロ1' }], lang);
        assertLine('1\t/ac 確信 <wait.3>', '1\t/ac 確信 <wait.3>', [{ kind: 'text', text: '1\t/ac 確信 <wait.3>' }], lang);
    }

    // 空白行（沒有字，或只有半形、全形、不換行空白、tab）不是問題，輸出照原樣
    for (const blank of ['', ' ', '   ', '\t', ' \t ', IDEOGRAPHIC_SPACE, NBSP, `${IDEOGRAPHIC_SPACE} ${NBSP}`]) {
        assertLine(blank, blank);
    }

    // 縮排之後是 / 的照樣是指令，不是 text：沒有問題
    assertLine('  /ac Innovation <wait.2>', '/ac "改革" <wait.2>');
    assertLine(`${IDEOGRAPHIC_SPACE}/mlock`, '/mlock');

    // 標題在最上面、指令在下面：只有標題那一行有問題，行數照算（標題是輸出的一行）
    const results = convert(['マクロ1', '/mlock', '', '/ac Innovation <wait.2>'].join('\n'));
    assert.deepEqual(results.map((result) => result.output), ['マクロ1', '/mlock', '', '/ac "改革" <wait.2>']);
    assert.deepEqual(results.map((result) => result.problems), [[{ kind: 'text', text: 'マクロ1' }], [], [], []]);
});

// ---------- 換行、空白、大小寫、尖括號 ----------

test('Windows 換行、全形空白、縮排與大小寫都照樣認得', () => {
    // Windows 網頁複製下來的是 \r\n：和 \n 一樣一行一個結果，輸出不帶 \r
    const crlf = convert('/ac "Muscle Memory" <wait.3>\r\n/ac Innovation <wait.2>', 'zh');
    assert.equal(crlf.length, 2);
    assert.deepEqual(crlf.map((result) => result.output), ['/ac "堅信" <wait.3>', '/ac "改革" <wait.2>']);
    assert.ok(crlf.every((result) => !result.output.includes('\r')), '輸出不含 \\r');
    assert.deepEqual(crlf.map((result) => result.problems), [[], []]);

    // 整段巨集換成 \r\n 之後，結果和 \n 完全一樣
    const lines = ENGLISH_MACRO.map(([input]) => input);
    assert.deepEqual(convert(lines.join('\r\n')), convert(lines.join('\n')));
    // 空行與結尾的換行照樣算一行，輸出是空字串、不是 \r
    const blank = convert('/mlock\r\n\r\n/ac Innovation <wait.2>\r\n', 'zh');
    assert.deepEqual(blank.map((result) => result.output), ['/mlock', '', '/ac "改革" <wait.2>', '']);

    // 日文攻略常用全形空白（U+3000）分隔指令與技能名，也可能整行縮排
    assertLine('/ac\u3000確信\u3000<wait.3>', '/ac "堅信" <wait.3>');
    assertLine('/ac\u3000Muscle\u3000Memory\u3000<wait.3>', '/ac "堅信" <wait.3>');
    assertLine('/e\u3000マクロ1完了 <se.1>', '/e マクロ1完了 <se.1>');
    assertLine('  /ac Innovation <wait.2>', '/ac "改革" <wait.2>');
    assertLine('\t/ac Innovation <wait.2>', '/ac "改革" <wait.2>');
    assertLine('\u3000/ac Innovation <wait.2>', '/ac "改革" <wait.2>');
    // 好幾個空白也一樣
    assertLine('/ac   Muscle   Memory   <wait.3>', '/ac "堅信" <wait.3>');

    // 指令與技能名的大小寫和資料不同
    assertLine('/AC "muscle memory"', '/ac "堅信"');
    assertLine('/Ac INNOVATION <wait.2>', '/ac "改革" <wait.2>');
    assertLine('/ECHO hi', '/默語 hi');
    assertLine('/Macroicon "BYREGOT’S BLESSING"', '/巨集圖標 "比爾格的祝福"');
});

test('只有 \\r 的換行（舊式 Mac）也算一個換行：兩行不會黏成一行', () => {
    // 以前只用 \n 切行，translateLine 又把每個 \r 拿掉，兩行會黏成一條壞掉的 /ac 確信/ac 下地作業
    const cr = convert('/ac 確信\r/ac 下地作業');
    assert.equal(cr.length, 2, '一個 \\r 就是一個換行，兩行各一個結果');
    assert.deepEqual(cr.map((result) => result.output), ['/ac "堅信"', '/ac "坯料製作"']);
    assert.deepEqual(cr.map((result) => result.problems), [[], []]);

    // \r\n、\r、\n 混在一起：各算一個換行（\r\n 是一個，不是兩個）
    const mixed = convert('/mlock\r\n/merror off\r/e hi\n/p ok');
    assert.deepEqual(mixed.map((result) => result.output), ['/mlock', '/merror off', '/e hi', '/p ok']);
    // 空行與結尾的換行照樣算一行，輸出是空字串、不含 \r
    const blank = convert('/mlock\r\r/ac Innovation <wait.2>\r');
    assert.deepEqual(blank.map((result) => result.output), ['/mlock', '', '/ac "改革" <wait.2>', '']);
    assert.ok(blank.every((result) => !result.output.includes('\r')), '輸出不含 \\r');
    // 問題照行的位置對上
    assert.deepEqual(convert('/ac Final Appraisal\r/foo').map((result) => result.problems), [
        [{ kind: 'action', text: 'Final Appraisal' }],
        [{ kind: 'command', text: '/foo' }]
    ]);
});

test('<me>、<t>、<se.1>、<wait> 這類尖括號原樣保留', () => {
    assertLine('/p 開始 <se.1>', '/p 開始 <se.1>');
    assertLine('/foo <me>', '/foo <me>', [{ kind: 'command', text: '/foo' }]);
    assertLine('/ac Innovation <wait>', '/ac "改革" <wait>');

    // 技能名後面不只一個尖括號，位置與順序都不變
    assertLine('/ac Innovation <wait.2> <se.1>', '/ac "改革" <wait.2> <se.1>');
    assertLine('/ac "Muscle Memory" <wait.3> <se.2>', '/ac "堅信" <wait.3> <se.2>');
    assertLine('/echo <t> 完成 <me> <se.1>', '/默語 <t> 完成 <me> <se.1>');
    // 查不到的技能：問題只寫技能名，不含後面的尖括號
    assertLine('/ac Final Appraisal <me>', '/ac Final Appraisal <me>', [{ kind: 'action', text: 'Final Appraisal' }]);

    // 問題的 text 是原文，引擎不跳脫、不加標記：頁面要用 textContent 當文字顯示，尖括號才不會變成標籤
    assertLine('/foo<me> bar', '/foo<me> bar', [{ kind: 'command', text: '/foo<me>' }]);
    assertLine('/ac "<me>"', '/ac "<me>"', [{ kind: 'action', text: '<me>' }]);
});

// ---------- 目標語言 ----------

test('目標是英文與日文時照舊：技能名換成那個語言，/ac 照舊，完整指令換成那個語言的別名或 baseCommand', () => {
    assertLine('/ac "堅信" <wait.3>', '/ac "Muscle Memory" <wait.3>', [], 'en');
    assertLine('/ac "堅信" <wait.3>', '/ac "確信" <wait.3>', [], 'ja');
    assertLine('/默語 hi', '/echo hi', [], 'en');

    // /ac 的各語言寫法一律輸出 /ac
    assertLine('/技能 "堅信" <wait.3>', '/ac "堅信" <wait.3>');
    assertLine('/アクション "確信" <wait.3>', '/ac "堅信" <wait.3>');
    assertLine('/action "Muscle Memory" <wait.3>', '/ac "確信" <wait.3>', [], 'ja');
    // 日文沒有別名的指令用 baseCommand；有別名的換成那個語言的別名
    assertLine('/默語 hi', '/echo hi', [], 'ja');
    assertLine('/echo hi', '/默語 hi', [], 'zh');
    assertLine('/鎖定巨集指令', '/macrolock', [], 'en');
    // 簡寫不管目標語言都照打的，後面的技能名照目標語言翻
    assertLine('/micon 確信', '/micon "Muscle Memory"', [], 'en');
    assertLine('/e 完成 <se.1>', '/e 完成 <se.1>', [], 'en');

    // 整段英文攻略換成日文：技能名都換成日文，沒有問題
    const results = convert(ENGLISH_MACRO.map(([input]) => input).join('\n'), 'ja');
    assert.deepEqual(results.map((result) => result.output), [
        '/mlock',
        '/macroicon "ビエルゴの祝福"',
        '/ac "確信" <wait.3>',
        '/ac "マニピュレーション" <wait.2>',
        '/ac "長期倹約" <wait.2>',
        '/ac "下地作業" <wait.3>',
        '/ac "匠の絶技" <wait.2>',
        '/ac "イノベーション" <wait.2>',
        '/ac "下地加工" <wait.3>',
        '/ac "グレートストライド" <wait.2>',
        '/ac "ビエルゴの祝福" <wait.3>',
        '/ac "パーフェクトメンド" <wait.3>',
        '/echo Macro #1 complete <se.1>'
    ]);
    assert.ok(results.every((result) => result.problems.length === 0), '整段英文攻略換成日文也沒有問題');
});
