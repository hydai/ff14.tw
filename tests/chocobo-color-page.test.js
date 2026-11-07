const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createChocoboPage } = require('./helpers/chocobo-page.js');
const { tagAttrs } = require('./helpers/html-fragment.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 色票面板每一格的顆數用 ChocoboColorSolver.bestTotal 算：測試自己載入 chocobo-solver.js，和頁面各載一份，
// 不靠頁面（它和 plan().total 一致由 chocobo-color-solver.test.js 守住）。chocobo-solver.js 把 ChocoboColorSolver 掛在 window 上，
// 所以讓 window 指向 context 本身（同 chocobo-color-solver.test.js）
const { bestTotal, colorGroups } = (() => {
    const context = vm.createContext({});
    context.window = context;
    vm.runInContext(read('tools/chocobo-color/chocobo-solver.js'), context, { filename: 'chocobo-solver.js' });
    return context.ChocoboColorSolver;
})();

const LANGS = ['zh', 'en', 'ja'];
const TRANSLATIONS = 'assets/js/i18n/translations/tools/chocobo-color.js';
const KEY = 'ff14tw_chocobo_color';
const DATA = JSON.parse(read('data/chocobo-colors.json'));
const HTML = read('tools/chocobo-color/index.html');
const CSS = read('tools/chocobo-color/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
const COMMON_CSS = read('assets/css/common.css').replace(/\/\*[\s\S]*?\*\//g, '');

const saved = (page) => JSON.parse(page.storage.get(KEY));
// stored 的值要是字串：物件先 JSON.stringify，壞掉的內容（'{' 之類）原樣給
const store = (value) => ({ [KEY]: typeof value === 'string' ? value : JSON.stringify(value) });
// 比較元素一律用 ===：assert.equal 失敗時會展開整份 fake-dom 而卡住不報錯，改成 === 加訊息才報得出來（同 mini-cactpot-page.test.js）
const isSame = (a, b, message) => assert.ok(a === b, message);
// 現在標成「下一段」的段號（1 起算，最多一個；全部勾完是 []）、寫著「還沒勾」提醒的段號，與提醒的字（n 是 1 起算的段號）
const nextNos = (page) => page.answer().steps.filter((step) => step.isNext).map((step) => step.no);
const warnedNos = (page) => page.answer().steps.filter((step) => step.warning !== null).map((step) => step.no);
const SKIPPED = (n) => `第 ${n} 段還沒勾：不照順序餵，顏色可能會跑掉`;
// 每一段勾選框的 aria-describedby（沒有是 null）：下一段的 step-next-N 在前，被跳過的提醒 step-warning-N 在後，兩個都有就用空白接起來
const describedBy = (page) => page.answer().steps.map((step) => step.describedBy);
// source（預設是整份 style.css）裡選擇器清單含 selector 的每一條規則的宣告區，接在一起（找不到是空字串）
const declarations = (selector, source = CSS) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => rule[1].split(',').map((s) => s.trim()).includes(selector))
    .map((rule) => rule[2])
    .join('\n');
// 一條規則的宣告區 "a: b; c: d" → Set { 'a: b', 'c: d' }（空白壓成一個）
const declarationSet = (body) => new Set(body.split(';').map((d) => d.replace(/\s+/g, ' ').trim()).filter(Boolean));
// style.css 裡每一個 @media：{ condition: '(max-width: 480px)', body: 大括號裡面的規則, start, end: 在整份樣式裡的位置 }（大括號要對起來，裡面的規則沒有巢狀）
function mediaBlocks(css) {
    const blocks = [];
    for (let start = css.indexOf('@media'); start !== -1; start = css.indexOf('@media', start + 1)) {
        const open = css.indexOf('{', start);
        let depth = 0;
        let close = open;
        for (; close < css.length; close += 1) {
            if (css[close] === '{') depth += 1;
            else if (css[close] === '}' && (depth -= 1) === 0) break;
        }
        blocks.push({ condition: css.slice(start + '@media'.length, open).trim(), body: css.slice(open + 1, close), start, end: close + 1 });
    }
    return blocks;
}
const MEDIA = mediaBlocks(CSS);
// 拿掉所有 @media 之後剩下的基本規則（從後面往前拿，前面的位置才不會跑掉）
const BASE_CSS = [...MEDIA].reverse().reduce((css, block) => css.slice(0, block.start) + css.slice(block.end), CSS);
// index.html 裡含 id="…" 的開始標籤（含沒有值的布林屬性，tagAttrs 看不到它們）
const openTag = (id) => HTML.match(new RegExp(`<[a-zA-Z][\\w-]*\\b[^>]*\\sid="${id}"[^>]*>`))[0];

test('一打開就是沙漠黃 → 素雪白的答案', async () => {
    const page = await createChocoboPage();
    const answer = page.answer();
    assert.equal(answer.total, '共 34 顆');
    assert.equal(answer.segments, '分 4 段');
    assert.equal(answer.done, '已勾 0／4 段');
    assert.deepEqual(answer.prepare, ['多瑪青梅 ×16', '瓦爾醋栗 ×13', '謝爾達萊鳳梨 ×5']);
    assert.deepEqual(answer.steps.map((step) => [step.no, step.fruit, step.count]), [
        [1, '多瑪青梅', '×10'], [2, '瓦爾醋栗', '×13'], [3, '多瑪青梅', '×6'], [4, '謝爾達萊鳳梨', '×5']
    ]);
    assert.ok(answer.steps.every((step) => step.note === null && step.checked === false));
    assert.equal(answer.alt, null, '目前是沙漠黃，沒有檸檬做法，不寫另一個做法');
    assert.equal(answer.message, null);
    assert.deepEqual(page.consoleErrors, []);

    // 步驟列表前面有一行「餵食順序」：標題加後半句（段數是 {n}），夾在「要準備」與列表之間，列表用標題當名稱
    assert.equal(answer.order, '餵食順序：照 1 → 4 餵，一段餵完再換下一段');
    const card = page.$('answerCard');
    const title = page.$('answerOrderTitle');
    assert.equal(title.textContent, '餵食順序');
    assert.equal(title.className, 'answer-order-title');
    assert.equal(card.querySelector('.answer-order-hint').textContent, '：照 1 → 4 餵，一段餵完再換下一段');
    const line = title.parentNode;
    assert.equal(line.tagName, 'P');
    assert.equal(line.className, 'answer-order');
    assert.equal(card.querySelectorAll('.answer-order').length, 1, '整張答案卡只有一行');
    const list = card.querySelector('ol.answer-steps');
    assert.equal(list.getAttribute('aria-labelledby'), 'answerOrderTitle');
    assert.equal(list.getAttribute('role'), 'list', 'list-style: none 的清單在 Safari 要明寫 role="list"');
    isSame(line.previousElementSibling, card.querySelector('.answer-prepare'), '前一個元素是「要準備」');
    isSame(line.nextElementSibling, list, '緊接在步驟列表前面');

    // 下一段：第一個還沒勾的段（一打開什麼都沒勾，所以是第 1 段）整列加 is-next，名稱下面（檸檬那一段「變回…」的位置）多一行小字「下一段」；
    // 其他列沒有，沒有人被跳過所以也沒有任何提醒。勾選框的名稱是 aria-label（整段的意思，不含「下一段」），所以「下一段」放進描述：
    // aria-describedby 指到那行小字（step-next-N），用 Tab 走到勾選框才聽得到
    assert.deepEqual(nextNos(page), [1]);
    assert.deepEqual(answer.steps.map((step) => step.next), ['下一段', null, null, null]);
    assert.deepEqual(answer.steps.map((step) => step.warning), [null, null, null, null]);
    assert.deepEqual(answer.steps.map((step) => step.describedBy), ['step-next-0', null, null, null]);
    assert.deepEqual(answer.steps.map((step) => step.description), ['下一段', null, null, null]);
    assert.equal(page.$('step-0').getAttribute('aria-label'), '第 1 段：多瑪青梅 10 顆', '名稱照舊，不含「下一段」');
    assert.equal(card.querySelectorAll('li.is-next').length, 1, '整張答案卡只有一列是下一段');
    assert.equal(card.querySelectorAll('.answer-step-next').length, 1);
    assert.equal(card.querySelectorAll('.answer-step-warning').length, 0);
    isSame(card.querySelector('li.is-next'), page.$('step-0').parentNode, '下一段是第 1 列');
    const label = card.querySelector('.answer-step-next');
    assert.equal(label.tagName, 'SPAN');
    assert.equal(label.id, 'step-next-0');
    assert.equal(label.parentNode.className, 'answer-step-sub', '小字是名稱下面的一行');
    isSame(label.parentNode.previousElementSibling, card.querySelector('li.is-next .answer-step-name'), '緊接在名稱後面');
    isSame(label.parentNode.parentNode, card.querySelector('li.is-next .answer-step-text'), '在名稱那一格裡');
    assert.equal(answer.steps[0].line, '下一段', '沒有「變回…」時這一行只有「下一段」');
    assert.deepEqual(answer.steps.slice(1).map((step) => step.line), [null, null, null], '其他列沒有這一行');
    assert.equal(page.$('answerAnnounce').textContent, '素雪白：共 34 顆，分 4 段', '打開頁面時朗讀區只有摘要');
});

test('水果色點的顏色來自資料，色點只是裝飾', async () => {
    const page = await createChocoboPage();
    const color = (id) => DATA.fruits.find((fruit) => fruit.id === id).color;
    const dots = (selector) => page.$('answerCard').querySelectorAll(`${selector} .fruit-dot`);
    // 沙漠黃 → 素雪白的四段：多瑪青梅、瓦爾醋栗、多瑪青梅、謝爾達萊鳳梨
    assert.deepEqual(dots('li.answer-step').map((dot) => dot.style.background),
        ['doman-plum', 'valfruit', 'doman-plum', 'cieldalaes-pineapple'].map(color));
    assert.deepEqual(dots('.answer-prepare').map((dot) => dot.style.background),
        ['doman-plum', 'valfruit', 'cieldalaes-pineapple'].map(color));
    for (const dot of [...dots('li.answer-step'), ...dots('.answer-prepare')]) {
        assert.equal(dot.getAttribute('aria-hidden'), 'true');
        assert.equal(dot.textContent, '');
    }
});

test('按鈕：載入前不能按，載入後寫顏色名稱與色塊', async () => {
    // 載入前：兩顆按鈕在標記裡就是 disabled，資料載入完才打開
    for (const id of ['fromBtn', 'toBtn']) assert.match(openTag(id), /\sdisabled(?=[\s>])/, `#${id} 要先 disabled`);

    const page = await createChocoboPage();
    assert.equal(page.$('fromBtn').disabled, false);
    assert.equal(page.$('toBtn').disabled, false);
    assert.equal(page.$('fromLabel').textContent, '目前顏色');
    assert.equal(page.$('toLabel').textContent, '目標顏色');
    assert.equal(page.$('fromName').textContent, '沙漠黃');
    assert.equal(page.$('toName').textContent, '素雪白');
    assert.equal(page.$('fromChip').style.background, 'rgb(219, 180, 87)');
    assert.equal(page.$('toChip').style.background, 'rgb(228, 223, 208)');
    assert.equal(page.$('fromBtn').getAttribute('aria-labelledby'), 'fromLabel fromName');
    assert.equal(page.$('toBtn').getAttribute('aria-labelledby'), 'toLabel toName');
    for (const id of ['fromBtn', 'toBtn']) assert.equal(page.$(id).getAttribute('aria-haspopup'), 'dialog');
    assert.equal(page.$('fromChip').getAttribute('aria-hidden'), 'true');
    assert.equal(page.$('answerCard').hidden, false);
});

test('打勾：那一段變淡、計數更新、存起來；全部勾完寫全部勾完', async () => {
    const page = await createChocoboPage();
    const box = page.$('step-0');
    box.focus();

    page.check(0);
    assert.equal(page.answer().steps[0].checked, true);
    assert.ok(page.$('step-0').parentNode.classList.contains('is-done'));
    assert.ok(!page.$('step-1').parentNode.classList.contains('is-done'));
    assert.equal(page.answer().done, '已勾 1／4 段');
    assert.deepEqual(saved(page), { from: 'desert-yellow', to: 'snow-white', done: [0] });
    // 只改那一列：勾選框還是同一個元素，焦點留在上面
    isSame(page.$('step-0'), box, '打勾不重畫整張卡');
    isSame(page.document.activeElement, box, '焦點留在勾選框上');

    // 再點一次取消
    page.check(0);
    assert.equal(page.answer().steps[0].checked, false);
    assert.ok(!page.$('step-0').parentNode.classList.contains('is-done'));
    assert.equal(page.answer().done, '已勾 0／4 段');
    assert.deepEqual(saved(page).done, []);

    // 下一段與跳過：第一個還沒勾的段是「下一段」；還沒勾、後面卻有段已經勾了的，那一列多一行提醒，新跳過一段時朗讀區也念一次。
    // 打勾照樣自由：任何順序、勾了再取消都行，計數與存檔不變。勾選框的名稱是 aria-label（不含「下一段」），所以「下一段」與提醒都用
    // aria-describedby 指到（「下一段」在前，兩個都有時念成「下一段 第 2 段還沒勾…」），Tab 走到勾選框時才聽得到；不是下一段了就拿掉
    const announce = page.$('answerAnnounce');
    const summary = '素雪白：共 34 顆，分 4 段';
    assert.deepEqual(nextNos(page), [1], '取消之後又回到第 1 段');
    assert.deepEqual(describedBy(page), ['step-next-0', null, null, null]);
    page.check(0);
    assert.deepEqual(nextNos(page), [2], '勾了第 1 段，下一段是第 2 段');
    assert.deepEqual(page.answer().steps.map((step) => step.next), [null, '下一段', null, null]);
    assert.deepEqual(warnedNos(page), [], '照順序勾沒有提醒');
    assert.equal(announce.textContent, summary, '照順序勾不改朗讀區');
    assert.deepEqual(describedBy(page), [null, 'step-next-1', null, null], '第 1 段不是下一段了，描述拿掉；第 2 段成了下一段');
    assert.deepEqual(page.answer().steps.map((step) => step.description), [null, '下一段', null, null]);
    isSame(page.$('step-next-0'), null, '第 1 段的「下一段」元素也沒了');

    page.check(2); // 跳過第 2 段
    assert.deepEqual(warnedNos(page), [2]);
    const skipped = page.answer().steps[1];
    assert.equal(skipped.warning, SKIPPED(2));
    assert.equal(skipped.describedBy, 'step-next-1 step-warning-1', '第 2 段是下一段、也被跳過：描述先指「下一段」再指提醒');
    assert.equal(skipped.description, `下一段 ${SKIPPED(2)}`);
    const warning = page.$('step-warning-1');
    assert.equal(warning.textContent, SKIPPED(2));
    assert.equal(warning.tagName, 'P');
    assert.equal(warning.className, 'answer-step-warning');
    isSame(warning.parentNode, page.$('step-1').parentNode, '提醒在那一列（li）裡');
    isSame(warning.previousElementSibling, page.$('step-1').parentNode.querySelector('label'), '在 label 的下面');
    assert.equal(announce.textContent, SKIPPED(2), '新跳過的段也寫進朗讀區');
    assert.deepEqual(nextNos(page), [2], '第 2 段還是下一段');
    assert.equal(page.answer().done, '已勾 2／4 段', '計數不變');
    assert.deepEqual(page.answer().steps.map((step) => step.checked), [true, false, true, false]);
    assert.deepEqual(saved(page), { from: 'desert-yellow', to: 'snow-white', done: [0, 2] }, '存檔不變');
    assert.deepEqual(describedBy(page), [null, 'step-next-1 step-warning-1', null, null], '只有第 2 段有描述');

    page.check(1); // 補勾第 2 段：順序又對了
    assert.deepEqual(warnedNos(page), []);
    isSame(page.$('step-warning-1'), null, '提醒拿掉了');
    isSame(page.$('step-next-1'), null, '「下一段」也跟著拿掉了');
    assert.deepEqual(describedBy(page), [null, null, null, 'step-next-3'], '第 2 段的描述拿掉；第 4 段成了下一段，只有「下一段」');
    assert.deepEqual(page.answer().steps.map((step) => step.description), [null, null, null, '下一段']);
    assert.deepEqual(nextNos(page), [4], '下一段是第 4 段');
    assert.equal(announce.textContent, '', '順序又對了不念任何東西：朗讀區清空（不是再念一次摘要）；先清空，下一次寫進同一句提醒時內容就一定有變（有些瀏覽器與輔助科技不會再念文字沒變的內容）');

    page.check(3); // 4 段都勾了
    assert.deepEqual(nextNos(page), [], '全部勾完沒有下一段');
    assert.equal(page.answer().done, '全部勾完');
    assert.equal(page.$('answerCard').querySelectorAll('.answer-step-next').length, 0);
    assert.equal(page.$('answerCard').querySelectorAll('li.is-next').length, 0);
    assert.deepEqual(describedBy(page), [null, null, null, null], '全部勾完，沒有任何描述');

    page.check(1); // 取消第 2 段，後面還有勾著的第 3、4 段：取消也會跳過
    assert.deepEqual(warnedNos(page), [2]);
    assert.deepEqual(describedBy(page), [null, 'step-next-1 step-warning-1', null, null], '取消造成的跳過一樣是「下一段」加提醒');
    assert.equal(announce.textContent, SKIPPED(2), '取消造成的跳過也念一次；同一句前面寫過、中間清空過，所以這次寫進去內容一定有變');
    assert.deepEqual(nextNos(page), [2]);
    assert.equal(page.answer().done, '已勾 3／4 段');
    page.check(3); // 再取消第 4 段：第 2 段還是被跳過（後面還有第 3 段），沒有新的跳過，朗讀區不再念
    assert.deepEqual(warnedNos(page), [2]);
    assert.equal(announce.textContent, '');
    page.check(2);
    page.check(0); // 全部取消
    assert.deepEqual(warnedNos(page), []);
    assert.deepEqual(nextNos(page), [1]);
    assert.equal(page.answer().done, '已勾 0／4 段');
    assert.deepEqual(saved(page).done, []);

    // 四段都勾完：寫全部勾完，清單照舊是四段。先勾第 4 段：前面三段都被跳過，朗讀區念最前面那一段（也就是下一段）
    page.check(3);
    assert.deepEqual(warnedNos(page), [1, 2, 3]);
    assert.deepEqual(nextNos(page), [1]);
    assert.equal(announce.textContent, SKIPPED(1));
    // 只有下一段（第 1 段）的描述有「下一段」，其他被跳過的段只有提醒
    assert.deepEqual(describedBy(page), ['step-next-0 step-warning-0', 'step-warning-1', 'step-warning-2', null]);
    assert.deepEqual(page.answer().steps.map((step) => step.description), [`下一段 ${SKIPPED(1)}`, SKIPPED(2), SKIPPED(3), null]);
    page.check(1);
    assert.deepEqual(describedBy(page), ['step-next-0 step-warning-0', null, 'step-warning-2', null]);
    page.check(0); // 下一段換到第 3 段，它本來就被跳過：前面的第 1 段兩樣都拿掉，第 3 段多了「下一段」
    assert.deepEqual(describedBy(page), [null, null, 'step-next-2 step-warning-2', null]);
    page.check(2);
    const answer = page.answer();
    assert.equal(answer.done, '全部勾完');
    assert.equal(answer.steps.length, 4);
    assert.ok(answer.steps.every((step) => step.checked));
    assert.deepEqual(warnedNos(page), []);
    assert.deepEqual(describedBy(page), [null, null, null, null]);
    assert.equal(announce.textContent, '');
    assert.equal(answer.total, '共 34 顆');
    assert.deepEqual(saved(page), { from: 'desert-yellow', to: 'snow-white', done: [0, 1, 2, 3] });
    // 一路上都只改各列的 class、勾選框、小字與提醒：整張卡沒有重畫，焦點還在原來的勾選框上
    isSame(page.$('step-0'), box, '打勾不重畫整張卡');
    isSame(page.document.activeElement, box, '焦點留在勾選框上');
    assert.deepEqual(page.consoleErrors, []);
});

test('重新打開還原顏色與打勾', async () => {
    const page = await createChocoboPage({ stored: store({ from: 'snow-white', to: 'sky-blue', done: [1] }) });
    const answer = page.answer();
    assert.equal(page.$('fromName').textContent, '素雪白');
    assert.equal(page.$('toName').textContent, '天空藍');
    assert.equal(answer.total, '共 15 顆');
    assert.deepEqual(answer.steps.map((step) => step.checked), [false, true]);
    assert.equal(answer.done, '已勾 1／2 段');
    assert.deepEqual(page.consoleErrors, []);

    // 下一段與跳過的提醒每次都從存著的 done 重算，不存進記憶：只勾了第 2 段，第 1 段被跳過，也是下一段
    assert.deepEqual(nextNos(page), [1]);
    assert.deepEqual(warnedNos(page), [1]);
    assert.equal(answer.steps[0].warning, SKIPPED(1));
    assert.equal(answer.steps[0].describedBy, 'step-next-0 step-warning-0', '下一段也被跳過：描述先指「下一段」再指提醒');
    assert.equal(answer.steps[0].description, `下一段 ${SKIPPED(1)}`);
    assert.equal(answer.steps[1].warning, null);
    assert.equal(answer.steps[1].describedBy, null);
    assert.equal(page.$('answerAnnounce').textContent, '天空藍：共 15 顆，分 2 段', '打開頁面時不另外念提醒');
    assert.deepEqual(saved(page), { from: 'snow-white', to: 'sky-blue', done: [1] }, '沒有多存任何東西');

    // 沙漠黃 → 素雪白勾了 [0, 2, 3]：第 2 段被跳過，還沒勾完所以照舊（不換成新顏色）；再開一次也一樣
    const stored = store({ from: 'desert-yellow', to: 'snow-white', done: [0, 2, 3] });
    const skipped = await createChocoboPage({ stored });
    assert.deepEqual(skipped.answer().steps.map((step) => step.checked), [true, false, true, true]);
    assert.deepEqual(warnedNos(skipped), [2]);
    assert.equal(skipped.answer().steps[1].warning, SKIPPED(2));
    assert.deepEqual(describedBy(skipped), [null, 'step-next-1 step-warning-1', null, null]);
    assert.deepEqual(nextNos(skipped), [2]);
    assert.equal(skipped.answer().done, '已勾 3／4 段');
    assert.equal(skipped.storage.get(KEY), stored[KEY], '打開時沒有改寫記憶');
    const again = await skipped.reopen();
    assert.deepEqual(warnedNos(again), [2]);
    assert.deepEqual(nextNos(again), [2]);
    assert.deepEqual(skipped.consoleErrors, []);
});

test('全部勾完後下次打開：目前顏色換成目標顏色；沒勾完時照舊', async () => {
    const page = await createChocoboPage();
    for (const i of [0, 1, 2, 3]) page.check(i);

    const next = await page.reopen();
    assert.equal(next.$('fromName').textContent, '素雪白');
    assert.equal(next.$('toName').textContent, '素雪白');
    assert.equal(next.answer().message, '已經是素雪白，不用餵。');
    assert.deepEqual(saved(next), { from: 'snow-white', to: 'snow-white', done: [] });
    // 再開一次還是一樣（不會變回舊的）
    assert.equal((await next.reopen()).answer().message, '已經是素雪白，不用餵。');

    // 只勾 3 段：下次打開照舊，四段，前三段勾著
    const partial = await createChocoboPage();
    for (const i of [0, 1, 2]) partial.check(i);
    const again = await partial.reopen();
    assert.equal(again.$('fromName').textContent, '沙漠黃');
    assert.deepEqual(again.answer().steps.map((step) => step.checked), [true, true, true, false]);
    assert.deepEqual(saved(again), { from: 'desert-yellow', to: 'snow-white', done: [0, 1, 2] });

    // 同一次開著勾完最後一段，畫面照舊（還能對照清單），不會當場換成「已經是…」
    assert.equal(page.answer().steps.length, 4);
    assert.equal(page.answer().message, null);
});

test('壞掉的記憶：照常打開，不認得的 id 換成預設，done 只留有效的段號，console 什麼都不留', async () => {
    const opened = async (value) => {
        const page = await createChocoboPage({ stored: store(value) });
        assert.deepEqual(page.consoleErrors, [], `${JSON.stringify(value)} 打開時 console 不留東西`);
        return page;
    };

    // 不是 JSON、不是物件：整個丟掉，回到沙漠黃 → 素雪白
    for (const value of ['{', '[]', '"x"', 'null', '42', 'true', '']) {
        const page = await opened(value);
        assert.equal(page.$('fromName').textContent, '沙漠黃', `${JSON.stringify(value)} 的目前顏色`);
        assert.equal(page.$('toName').textContent, '素雪白', `${JSON.stringify(value)} 的目標顏色`);
        assert.equal(page.answer().total, '共 34 顆');
        assert.ok(page.answer().steps.every((step) => !step.checked));
    }

    // 不認得的 id 各自換成預設，另一個照用
    let page = await opened({ from: 'nope', to: 'sky-blue' });
    assert.equal(page.$('fromName').textContent, '沙漠黃');
    assert.equal(page.$('toName').textContent, '天空藍');
    assert.equal(page.answer().total, '共 29 顆');

    page = await opened({ from: 'snow-white', to: 'nope' });
    assert.equal(page.$('fromName').textContent, '素雪白');
    assert.equal(page.$('toName').textContent, '素雪白', '目標預設是素雪白');
    assert.equal(page.answer().message, '已經是素雪白，不用餵。');

    page = await opened({ from: 5, to: ['snow-white'] });
    assert.equal(page.$('fromName').textContent, '沙漠黃');
    assert.equal(page.$('toName').textContent, '素雪白');

    page = await opened({ from: 'nope', to: 'snow-white' });
    assert.equal(page.$('fromName').textContent, '沙漠黃');
    assert.equal(page.answer().total, '共 34 顆');

    // 打勾屬於存下來的那一組顏色：兩個 id 有一個不認得，換成預設之後就不是同一組了，done 整個丟掉。
    // 以前第一組換成沙漠黃 → 素雪白後四段全勾，被當成「全部勾完」：打開就寫「已經是素雪白，不用餵。」，存檔也被蓋成素雪白 → 素雪白；
    // 第二組則勾到從沒勾過的第 1 段
    for (const value of [
        { from: 'nope', to: 'snow-white', done: [0, 1, 2, 3] },
        { from: 'desert-yellow', to: 'nope', done: [0] },
        { from: 'nope', to: 'nope', done: [0, 1, 2, 3] }
    ]) {
        const label = JSON.stringify(value);
        page = await opened(value);
        assert.equal(page.$('fromName').textContent, '沙漠黃', `${label} 的目前顏色`);
        assert.equal(page.$('toName').textContent, '素雪白', `${label} 的目標顏色`);
        assert.equal(page.answer().message, null, `${label} 不是「已經是…」`);
        assert.equal(page.answer().total, '共 34 顆', `${label} 的答案`);
        assert.deepEqual(page.answer().steps.map((step) => step.checked), [false, false, false, false], `${label} 一段都沒勾`);
        assert.equal(page.answer().done, '已勾 0／4 段', `${label} 的計數`);
        assert.equal(page.storage.get(KEY), label, `${label} 打開時沒有把存檔蓋成別的顏色`);
    }

    // done 只留不重複、0 ≤ 段號 < 段數的整數：負數、小數、超出範圍、字串都丟掉
    page = await opened({ from: 'desert-yellow', to: 'snow-white', done: [0, 0, -1, 1.5, 9, '2'] });
    assert.deepEqual(page.answer().steps.map((step) => step.checked), [true, false, false, false]);
    assert.equal(page.answer().done, '已勾 1／4 段');

    // done 不是陣列：沒有打勾
    for (const done of ['x', { 0: true }, 3, null]) {
        page = await opened({ from: 'desert-yellow', to: 'snow-white', done });
        assert.ok(page.answer().steps.every((step) => !step.checked), `done: ${JSON.stringify(done)}`);
    }

    // 兩個顏色一樣（沒有段）時，done 的段號全部超出範圍，也不會被當成「全部勾完」
    page = await opened({ from: 'snow-white', to: 'snow-white', done: [0, 1] });
    assert.equal(page.answer().message, '已經是素雪白，不用餵。');
    assert.equal(page.$('fromName').textContent, '素雪白');
});

test('封鎖網站資料：照常算答案、能打勾、能換顏色，不丟錯；重新打開回到預設', async () => {
    const page = await createChocoboPage({ storageThrows: true });
    assert.equal(page.answer().total, '共 34 顆');

    page.check(0);
    assert.equal(page.answer().steps[0].checked, true);
    assert.equal(page.answer().done, '已勾 1／4 段');

    page.app.setColors('soot-black', 'snow-white');
    assert.equal(page.answer().total, '共 35 顆');
    assert.equal(page.$('fromName').textContent, '煤煙黑');
    assert.ok(page.answer().steps.every((step) => !step.checked), '換顏色清空打勾');
    page.check(1);
    assert.equal(page.answer().steps[1].checked, true);
    assert.equal(page.storage.size, 0, '什麼都沒寫進去');
    assert.deepEqual(page.consoleErrors, []);

    const next = await page.reopen();
    assert.equal(next.$('fromName').textContent, '沙漠黃');
    assert.equal(next.$('toName').textContent, '素雪白');
    assert.equal(next.answer().total, '共 34 顆');
    assert.ok(next.answer().steps.every((step) => !step.checked));
    assert.deepEqual(next.consoleErrors, []);

    // 勾完所有段也不會有「下次打開變成已經是…」：什麼都沒存，下次回到預設
    for (const i of [0, 1, 2, 3]) next.check(i);
    const last = await next.reopen();
    assert.equal(last.$('fromName').textContent, '沙漠黃');
    assert.equal(last.answer().message, null);
});

test('用了檸檬的答案：檸檬是第一段，寫變回沙漠黃，另一個做法是直接調色', async () => {
    const page = await createChocoboPage();
    page.app.setColors('soot-black', 'snow-white');
    const answer = page.answer();
    assert.equal(answer.total, '共 35 顆');
    assert.equal(answer.segments, '分 5 段');
    assert.equal(answer.done, '已勾 0／5 段');
    assert.equal(answer.order, '餵食順序：照 1 → 5 餵，一段餵完再換下一段', '檸檬那一段也算一段');
    const { no, fruit, count, note } = answer.steps[0];
    assert.deepEqual({ no, fruit, count, note }, { no: 1, fruit: '拉札漢檸檬', count: '×1', note: '變回沙漠黃' });
    assert.deepEqual(answer.steps.slice(1).map((step) => [step.fruit, step.count, step.note]), [
        ['多瑪青梅', '×10', null], ['瓦爾醋栗', '×13', null], ['多瑪青梅', '×6', null], ['謝爾達萊鳳梨', '×5', null]
    ]);
    assert.equal(answer.alt, '直接調色要 109 顆');
    assert.equal(answer.prepare[0], '拉札漢檸檬 ×1');
    assert.deepEqual(answer.prepare, ['拉札漢檸檬 ×1', '多瑪青梅 ×16', '瓦爾醋栗 ×13', '謝爾達萊鳳梨 ×5']);
    assert.equal(page.$('step-0').getAttribute('aria-label'), '第 1 段：拉札漢檸檬 1 顆');
    // 檸檬的色點用資料裡檸檬的顏色
    const lemon = DATA.fruits.find((f) => f.resetsTo);
    assert.equal(page.$('step-0').parentNode.querySelector('.fruit-dot').style.background, lemon.color);
    assert.deepEqual(saved(page), { from: 'soot-black', to: 'snow-white', done: [] });

    // 檸檬是第一段，一打開也是下一段：名稱下面同一行小字先寫「下一段」，接著是「變回沙漠黃」（兩個 span 加分隔字，不多一行）
    assert.deepEqual(nextNos(page), [1]);
    assert.deepEqual([answer.steps[0].next, answer.steps[0].note, answer.steps[0].line], ['下一段', '變回沙漠黃', '下一段・變回沙漠黃']);
    // 勾選框的描述只指到「下一段」那一個 span（不含分隔字與「變回沙漠黃」）
    assert.deepEqual([answer.steps[0].describedBy, answer.steps[0].description], ['step-next-0', '下一段']);
    assert.equal(page.$('answerCard').querySelectorAll('li.is-next .answer-step-sub').length, 1, '只有一行小字');
    assert.equal(page.$('answerCard').querySelectorAll('li.is-next .answer-step-note').length, 1);
    assert.deepEqual(answer.steps.slice(1).map((step) => step.next), [null, null, null, null]);

    // 勾了檸檬：下一段換成第 2 段，檸檬那一列回到只有「變回沙漠黃」（同一個元素搬回來，不是兩個）；取消又回到同一行
    page.check(0);
    assert.deepEqual(nextNos(page), [2]);
    assert.deepEqual(page.answer().steps.map((step) => step.line), ['變回沙漠黃', '下一段', null, null, null]);
    assert.deepEqual([page.answer().steps[0].next, page.answer().steps[0].note], [null, '變回沙漠黃']);
    assert.equal(page.$('answerCard').querySelectorAll('.answer-step-note').length, 1);
    page.check(0);
    assert.deepEqual(nextNos(page), [1]);
    assert.deepEqual(page.answer().steps.map((step) => step.line), ['下一段・變回沙漠黃', null, null, null, null]);
    assert.equal(page.$('answerCard').querySelectorAll('.answer-step-note').length, 1);

    // 魔花綠 → 沙漠黃：只有檸檬這一段，一樣是下一段
    page.app.setColors('morbol-green', 'desert-yellow');
    assert.equal(page.answer().steps.length, 1);
    assert.deepEqual(nextNos(page), [1]);
    assert.equal(page.answer().steps[0].line, '下一段・變回沙漠黃');
});

test('另一個做法那一行：用了檸檬寫直接調色，沒用寫先餵檸檬，目前是沙漠黃不寫', async () => {
    const page = await createChocoboPage();

    // 沒用檸檬而且目前不是沙漠黃：寫先餵檸檬再調色要幾顆
    page.app.setColors('snow-white', 'sky-blue');
    assert.equal(page.answer().total, '共 15 顆');
    assert.equal(page.answer().alt, '先餵 1 顆檸檬再調色要 30 顆');
    assert.equal(page.$('answerCard').querySelectorAll('.answer-alt').length, 1);

    // 目前是沙漠黃：沒有檸檬做法，任何目標都不寫
    const targets = DATA.colors.map((color) => color.id).filter((id) => id !== DATA.meta.defaultColor);
    assert.equal(targets.length, 84);
    for (const id of targets) {
        page.app.setColors(DATA.meta.defaultColor, id);
        assert.equal(page.$('answerCard').querySelector('.answer-alt'), null, `沙漠黃 → ${id}`);
    }

    // 目標是沙漠黃：一顆檸檬就好，另一個做法是直接調色
    page.app.setColors('morbol-green', 'desert-yellow');
    const answer = page.answer();
    assert.equal(answer.total, '共 1 顆');
    assert.equal(answer.segments, '分 1 段');
    assert.equal(answer.done, '已勾 0／1 段');
    assert.deepEqual(answer.prepare, ['拉札漢檸檬 ×1']);
    assert.equal(answer.steps.length, 1);
    assert.equal(answer.alt, '直接調色要 80 顆');
    // 只有 1 段：「餵食順序」只剩標題，沒有「照 1 → 1 餵」這種後半句
    assert.equal(answer.order, '餵食順序');
    isSame(page.$('answerCard').querySelector('.answer-order-hint'), null, '只有 1 段時沒有後半句');

    // 直接與檸檬一樣多：用檸檬，另一個做法寫同樣的顆數（玉米黃 → 古卜灰各 18 顆）
    page.app.setColors('millioncorn-yellow', 'goobbue-grey');
    assert.equal(page.answer().total, '共 18 顆');
    assert.equal(page.answer().steps[0].fruit, '拉札漢檸檬');
    assert.equal(page.answer().alt, '直接調色要 18 顆');
});

test('同色只寫已經是…不用餵', async () => {
    const page = await createChocoboPage();
    page.check(0);
    page.app.setColors('snow-white', 'snow-white');
    const card = page.$('answerCard');
    const answer = page.answer();
    assert.equal(answer.message, '已經是素雪白，不用餵。');
    assert.equal(answer.total, null);
    assert.equal(answer.segments, null);
    assert.equal(answer.done, null);
    assert.equal(answer.prepare, null);
    assert.equal(answer.steps, null);
    assert.equal(answer.alt, null);
    assert.equal(answer.order, null, '沒有步驟就沒有「餵食順序」那一行');
    for (const selector of ['.answer-steps', '.answer-head', '.answer-prepare', '.answer-alt', '.answer-order']) {
        assert.equal(card.querySelector(selector), null, selector);
    }
    assert.equal(card.querySelectorAll('.answer-message').length, 1);
    assert.equal(page.$('answerAnnounce').textContent, '已經是素雪白，不用餵。');
    assert.deepEqual(saved(page), { from: 'snow-white', to: 'snow-white', done: [] });
});

test('載入失敗：答案卡寫錯誤訊息，兩顆按鈕不能按，切換語言跟著換', async () => {
    const page = await createChocoboPage({ fetchFails: true });
    const error = page.$('answerCard').querySelector('.error-message');
    assert.ok(error, '#answerCard 裡有 .error-message');
    assert.equal(error.textContent, '載入顏色資料失敗，請重新整理頁面再試。');
    assert.equal(page.$('answerCard').hidden, false);
    assert.equal(page.$('fromBtn').disabled, true);
    assert.equal(page.$('toBtn').disabled, true);
    assert.equal(page.answer().steps, null);
    assert.equal(page.consoleErrors.length, 1, '失敗的原因留在 console');

    page.setLang('en');
    assert.equal(page.$('answerCard').querySelector('.error-message').textContent, 'Failed to load color data. Please refresh the page and try again.');
    assert.equal(page.$('answerCard').querySelectorAll('.error-message').length, 1);
    page.setLang('ja');
    assert.equal(page.$('answerCard').querySelector('.error-message').textContent, '色データを読み込めませんでした。ページを再読み込みしてください。');
    assert.equal(page.$('fromBtn').disabled, true);
});

test('找不到做法的資料：寫找不到，用了檸檬但直接調色找不到時寫在另一個做法那一行', async () => {
    // 拿掉三種水果：沙漠黃要變亮，三種基底水果都得是負的，一顆也湊不出來
    const data = { ...DATA, fruits: DATA.fruits.filter((f) => !['doman-plum', 'valfruit', 'cieldalaes-pineapple'].includes(f.id)) };
    const page = await createChocoboPage({ data });
    assert.equal(page.answer().message, '找不到每一步都不超出 RGB 範圍的做法。');
    assert.equal(page.answer().steps, null);
    assert.equal(page.answer().total, null);
    assert.equal(page.answer().order, null, '找不到做法就沒有步驟，也沒有「餵食順序」那一行');
    assert.equal(page.$('fromBtn').disabled, false, '兩顆按鈕照常能按');
    assert.equal(page.$('answerAnnounce').textContent, '找不到每一步都不超出 RGB 範圍的做法。');

    page.app.setColors('soot-black', 'millioncorn-yellow');
    const answer = page.answer();
    assert.equal(answer.total, '共 12 顆');
    assert.equal(answer.steps[0].fruit, '拉札漢檸檬');
    assert.equal(answer.alt, '直接調色找不到每一步都不超出 RGB 範圍的做法');

    page.setLang('en');
    assert.equal(page.answer().alt, 'Without the lemon, no way stays within RGB 0–255');
    page.app.setColors('desert-yellow', 'snow-white');
    assert.equal(page.answer().message, 'No way stays within RGB 0–255.');
});

test('三語：答案卡、按鈕與量詞跟著語言；切換語言時顏色與打勾不變', async () => {
    const en = await createChocoboPage({ lang: 'en' });
    assert.equal(en.answer().total, '34 fruits in total');
    assert.equal(en.answer().segments, 'in 4 steps');
    assert.equal(en.answer().done, '0 of 4 done');
    assert.equal(en.answer().order, 'Feeding order: 1 → 4, one step at a time');
    assert.equal(en.$('answerOrderTitle').textContent, 'Feeding order');
    assert.equal(en.answer().steps[0].fruit, 'Doman Plum');
    assert.deepEqual(en.answer().prepare, ['Doman Plum ×16', 'Valfruit ×13', 'Cieldalaes Pineapple ×5']);
    assert.equal(en.$('fromName').textContent, 'Desert Yellow');
    assert.equal(en.$('toName').textContent, 'Snow White');
    assert.equal(en.$('fromLabel').textContent, 'Current color');
    assert.equal(en.$('step-0').getAttribute('aria-label'), 'Step 1: 10 × Doman Plum');
    assert.deepEqual(en.answer().steps.map((step) => step.next), ['Next', null, null, null]);
    assert.deepEqual(en.answer().steps.map((step) => step.description), ['Next', null, null, null], '勾選框的描述是介面語言的「下一段」');

    const ja = await createChocoboPage({ lang: 'ja' });
    assert.equal(ja.answer().total, '合計 34個');
    assert.equal(ja.answer().segments, '4段階');
    assert.equal(ja.answer().done, '0／4 完了');
    assert.equal(ja.answer().order, '与える順番：1 → 4 の順に、1段階ずつ');
    assert.equal(ja.$('answerOrderTitle').textContent, '与える順番');
    assert.equal(ja.answer().steps[0].fruit, 'ドマの梅');
    assert.equal(ja.$('fromName').textContent, 'デザートイエロー');
    assert.equal(ja.$('step-0').getAttribute('aria-label'), '1段階目：ドマの梅 10個');
    assert.deepEqual(ja.answer().steps.map((step) => step.next), ['次はここ', null, null, null]);
    assert.deepEqual(ja.answer().steps.map((step) => step.description), ['次はここ', null, null, null]);

    // 切換語言：顏色與打勾不變，名稱、量詞、朗讀摘要換成新的語言；「下一段」與跳過的提醒也換（勾了第 1、3 段，第 2 段被跳過，也是下一段）
    const page = await createChocoboPage();
    page.check(0);
    page.check(2);
    assert.equal(page.answer().steps[1].warning, SKIPPED(2));
    page.setLang('en');
    assert.equal(page.$('fromName').textContent, 'Desert Yellow');
    assert.equal(page.answer().total, '34 fruits in total');
    assert.equal(page.answer().done, '2 of 4 done');
    assert.deepEqual(page.answer().steps.map((step) => step.checked), [true, false, true, false]);
    assert.equal(page.$('answerAnnounce').textContent, 'Snow White: 34 fruits in total, in 4 steps');
    assert.equal(page.answer().order, 'Feeding order: 1 → 4, one step at a time', '切換語言時「餵食順序」跟著換');
    assert.deepEqual(saved(page), { from: 'desert-yellow', to: 'snow-white', done: [0, 2] });
    assert.deepEqual(page.answer().steps.map((step) => step.next), [null, 'Next', null, null]);
    assert.equal(page.answer().steps[1].warning, 'Step 2 isn\'t ticked yet: feeding out of order can throw the color off');
    assert.deepEqual(warnedNos(page), [2], '提醒只在第 2 段');
    assert.equal(page.$('step-warning-1').textContent, page.answer().steps[1].warning, '勾選框指到的是重畫之後的提醒');
    // 描述（螢幕閱讀器念的）：「下一段」在前、提醒在後，兩個都是目前語言的字
    assert.equal(page.answer().steps[1].describedBy, 'step-next-1 step-warning-1');
    assert.equal(page.answer().steps[1].description, 'Next Step 2 isn\'t ticked yet: feeding out of order can throw the color off');
    page.setLang('ja');
    assert.equal(page.answer().total, '合計 34個');
    assert.equal(page.answer().order, '与える順番：1 → 4 の順に、1段階ずつ');
    assert.equal(page.$('answerAnnounce').textContent, 'スノウホワイト：合計 34個、4段階');
    assert.deepEqual(page.answer().steps.map((step) => step.next), [null, '次はここ', null, null]);
    assert.equal(page.answer().steps[1].warning, '2段階目がまだです。順番どおりに与えないと色がずれることがあります');
    assert.equal(page.answer().steps[1].describedBy, 'step-next-1 step-warning-1');
    assert.equal(page.answer().steps[1].description, '次はここ 2段階目がまだです。順番どおりに与えないと色がずれることがあります');
    page.setLang('zh');
    assert.equal(page.answer().total, '共 34 顆');
    assert.equal(page.answer().order, '餵食順序：照 1 → 4 餵，一段餵完再換下一段');
    assert.deepEqual(page.answer().steps.map((step) => step.next), [null, '下一段', null, null]);
    assert.equal(page.answer().steps[1].warning, SKIPPED(2));
    assert.equal(page.answer().steps[1].description, `下一段 ${SKIPPED(2)}`);
    assert.equal(page.$('answerCard').querySelector('ol.answer-steps').getAttribute('aria-labelledby'), 'answerOrderTitle');
    assert.equal(page.$('answerOrderTitle').textContent, '餵食順序', '重畫之後列表的名稱還是指到那一行的標題');
    assert.deepEqual(page.answer().steps.map((step) => step.checked), [true, false, true, false]);

    // 單數：只有 1 顆、1 段時三種語言各有自己的寫法；「餵食順序」只剩標題。這一段是檸檬，也是下一段：
    // 小字同一行寫「下一段」、分隔字、「變回…」，分隔字各語言自己的（中日全形的「・」，英文的「 · 」兩邊有空白）
    for (const [lang, total, segments, order, line] of [
        ['zh', '共 1 顆', '分 1 段', '餵食順序', '下一段・變回沙漠黃'],
        ['en', '1 fruit in total', 'in 1 step', 'Feeding order', 'Next · Back to Desert Yellow'],
        ['ja', '合計 1個', '1段階', '与える順番', '次はここ・デザートイエローに戻る']
    ]) {
        const single = await createChocoboPage({ lang, stored: store({ from: 'morbol-green', to: 'desert-yellow' }) });
        assert.equal(single.answer().total, total, lang);
        assert.equal(single.answer().segments, segments, lang);
        assert.equal(single.answer().order, order, lang);
        isSame(single.$('answerCard').querySelector('.answer-order-hint'), null, `${lang}：只有 1 段時沒有後半句`);
        assert.equal(single.answer().steps[0].line, line, `${lang}：下一段的小字`);
    }

    // 2 段就有後半句（沙漠黃 → 玫瑰粉 10 顆、2 段）
    for (const [lang, order] of [
        ['zh', '餵食順序：照 1 → 2 餵，一段餵完再換下一段'],
        ['en', 'Feeding order: 1 → 2, one step at a time'],
        ['ja', '与える順番：1 → 2 の順に、1段階ずつ']
    ]) {
        const two = await createChocoboPage({ lang, stored: store({ from: 'desert-yellow', to: 'rose-pink' }) });
        assert.equal(two.answer().steps.length, 2, lang);
        assert.equal(two.answer().order, order, lang);
    }

    // 已經是…也跟著語言
    const same = await createChocoboPage({ lang: 'en', stored: store({ from: 'snow-white', to: 'snow-white' }) });
    assert.equal(same.answer().message, 'Already Snow White. Nothing to feed.');
    same.setLang('ja');
    assert.equal(same.answer().message, 'すでにスノウホワイトです。与える必要はありません。');
});

test('朗讀摘要用已經分好單複數的「共 N 顆」「分 N 段」組成：英文只有 1 顆 1 段時不會念成「1 fruits in 1 steps」', async () => {
    // 預設 沙漠黃 → 素雪白：34 顆、4 段（複數）
    const zh = await createChocoboPage();
    assert.equal(zh.$('answerAnnounce').textContent, '素雪白：共 34 顆，分 4 段');
    const en = await createChocoboPage({ lang: 'en' });
    assert.equal(en.$('answerAnnounce').textContent, 'Snow White: 34 fruits in total, in 4 steps');
    const ja = await createChocoboPage({ lang: 'ja' });
    assert.equal(ja.$('answerAnnounce').textContent, 'スノウホワイト：合計 34個、4段階');

    // 魔花綠 → 沙漠黃：1 顆檸檬、1 段（單數）。摘要用的就是答案卡第一行那兩句，所以單數跟著走
    en.app.setColors('morbol-green', 'desert-yellow');
    assert.equal(en.answer().total, '1 fruit in total');
    assert.equal(en.answer().segments, 'in 1 step');
    assert.equal(en.$('answerAnnounce').textContent, 'Desert Yellow: 1 fruit in total, in 1 step');
    zh.app.setColors('morbol-green', 'desert-yellow');
    assert.equal(zh.$('answerAnnounce').textContent, '沙漠黃：共 1 顆，分 1 段');
    ja.app.setColors('morbol-green', 'desert-yellow');
    assert.equal(ja.$('answerAnnounce').textContent, 'デザートイエロー：合計 1個、1段階');

    // 換語言時摘要跟著換，單複數照答案走（單數的答案切到別的語言還是單數的寫法）
    en.setLang('ja');
    assert.equal(en.$('answerAnnounce').textContent, 'デザートイエロー：合計 1個、1段階');
    en.setLang('en');
    assert.equal(en.$('answerAnnounce').textContent, 'Desert Yellow: 1 fruit in total, in 1 step');

    // 摘要裡不會留下沒換掉的 {…}
    for (const page of [zh, en, ja]) assert.doesNotMatch(page.$('answerAnnounce').textContent, /[{}]/);
});

test('螢幕閱讀器：換顏色後朗讀摘要，答案卡本身不是 live，照順序打勾不朗讀', async () => {
    const page = await createChocoboPage();
    const announce = page.$('answerAnnounce');
    assert.equal(announce.getAttribute('aria-live'), 'polite');
    assert.ok(announce.classList.contains('visually-hidden'));
    assert.equal(announce.textContent, '素雪白：共 34 顆，分 4 段');
    assert.equal(page.$('answerCard').hasAttribute('aria-live'), false, '整張答案卡不設 aria-live');
    assert.equal(page.$('step-0').getAttribute('aria-label'), '第 1 段：多瑪青梅 10 顆');
    assert.equal(page.$('step-3').getAttribute('aria-label'), '第 4 段：謝爾達萊鳳梨 5 顆');

    // 照順序打勾不改朗讀摘要（摘要只在換顏色、換語言時換）；不照順序打勾、新跳過一段時，朗讀區改念那一段的提醒（見「打勾」那個測試）
    page.check(0);
    page.check(1);
    assert.equal(announce.textContent, '素雪白：共 34 顆，分 4 段');
    assert.equal(announce.getAttribute('aria-live'), 'polite');

    page.app.setColors('desert-yellow', 'sky-blue');
    assert.equal(announce.textContent, '天空藍：共 29 顆，分 3 段');

    // 每個勾選框都有對應的 label，label 的 for 指向它
    for (const i of [0, 1, 2]) {
        const box = page.$(`step-${i}`);
        assert.equal(box.getAttribute('type'), 'checkbox');
        assert.equal(box.parentNode.querySelector('label').getAttribute('for'), `step-${i}`);
    }
});

test('setColors：顏色沒變就什麼都不做，變了就清空打勾、存起來、重畫；不認得的顏色不理', async () => {
    const page = await createChocoboPage();
    page.check(0);

    page.app.setColors('desert-yellow', 'snow-white');
    assert.equal(page.answer().steps[0].checked, true, '顏色沒變，打勾還在');
    assert.deepEqual(saved(page).done, [0]);

    page.app.setColors('nope', 'snow-white');
    page.app.setColors('desert-yellow', 'nope');
    page.app.setColors(undefined, undefined);
    assert.equal(page.answer().steps[0].checked, true, '不認得的顏色不理');
    assert.equal(page.$('fromName').textContent, '沙漠黃');

    page.app.setColors('desert-yellow', 'sky-blue');
    assert.equal(page.answer().total, '共 29 顆');
    assert.equal(page.$('toName').textContent, '天空藍');
    assert.equal(page.$('toChip').style.background, 'rgb(154, 195, 232)');
    assert.ok(page.answer().steps.every((step) => !step.checked), '換顏色清空打勾');
    assert.deepEqual(saved(page), { from: 'desert-yellow', to: 'sky-blue', done: [] });
    assert.deepEqual(page.consoleErrors, []);
});

test('toggleStep：段號超出範圍或不是整數時什麼都不變，直接呼叫時畫面的勾選框跟著變', async () => {
    const page = await createChocoboPage();
    for (const bad of [-1, 4, 1.5, '1', NaN, undefined, null]) page.app.toggleStep(bad, true);
    assert.ok(page.answer().steps.every((step) => !step.checked));
    assert.equal(page.storage.size, 0, '被擋下來的呼叫不寫入');
    assert.deepEqual(nextNos(page), [1], '被擋下來的呼叫不動下一段');
    assert.deepEqual(warnedNos(page), []);
    assert.equal(page.$('answerAnnounce').textContent, '素雪白：共 34 顆，分 4 段', '也不動朗讀區');

    // 直接呼叫也一樣：只勾第 3 段，前面兩段被跳過，朗讀區念最前面那一段（第 1 段，也是下一段）
    page.app.toggleStep(2, true);
    assert.deepEqual(page.answer().steps.map((step) => step.checked), [false, false, true, false]);
    assert.equal(page.answer().done, '已勾 1／4 段');
    assert.ok(page.$('step-2').parentNode.classList.contains('is-done'));
    assert.deepEqual(saved(page).done, [2]);
    assert.deepEqual(warnedNos(page), [1, 2]);
    assert.deepEqual(nextNos(page), [1]);
    assert.equal(page.$('answerAnnounce').textContent, SKIPPED(1));

    page.app.toggleStep(2, false);
    assert.ok(page.answer().steps.every((step) => !step.checked));
    assert.ok(!page.$('step-2').parentNode.classList.contains('is-done'));
    assert.deepEqual(saved(page).done, []);
    assert.deepEqual(warnedNos(page), []);
    assert.deepEqual(nextNos(page), [1]);
    assert.equal(page.$('answerAnnounce').textContent, '', '順序又對了，朗讀區清空');
});

test('標記與樣式：沒有主要按鈕與計算鈕，頁首名稱與鍵、資料來源，答案卡的樣式', () => {
    assert.doesNotMatch(HTML, /btn-primary/, '頁面上沒有 .btn-primary');
    assert.doesNotMatch(HTML, />\s*計算\s*</, '沒有「計算」按鈕');
    assert.doesNotMatch(HTML, /calculateBtn/);

    const header = tagAttrs(HTML, 'header-placeholder');
    assert.equal(header['data-tool-name'], '陸行鳥染色計算器');
    assert.equal(header['data-tool-name-key'], 'chocobo_color_header');
    assert.equal(tagAttrs(HTML, 'answerAnnounce').class, 'visually-hidden');
    assert.equal(tagAttrs(HTML, 'answerAnnounce')['aria-live'], 'polite');
    assert.doesNotMatch(openTag('answerCard'), /aria-live/);

    // 資料來源
    const credit = HTML.match(/<a\b[^>]*href="https:\/\/ffxivchocobo\.com\/"[^>]*>/)[0];
    assert.match(credit, /target="_blank"/);
    assert.match(credit, /rel="noopener noreferrer"/);

    // 腳本順序：翻譯檔、頁首頁尾與共用腳本、solver 在 script.js 前面；不載入 security-utils.js
    const scripts = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(scripts.indexOf('chocobo-solver.js') !== -1 && scripts.indexOf('chocobo-solver.js') < scripts.indexOf('script.js'));
    assert.equal(scripts.at(-1), 'script.js');
    assert.ok(scripts.includes('../../assets/js/i18n/translations/tools/chocobo-color.js'));
    assert.ok(!scripts.some((src) => src.endsWith('security-utils.js')));
    assert.match(HTML, /<title>陸行鳥染色計算器 - FF14\.tw<\/title>/);

    // 答案卡：每一列至少 48px 高（手機好點），欄位可以縮、名稱放不下就換行，整份樣式沒有左右捲動
    assert.match(declarations('.answer-step label'), /min-height:\s*48px/);
    assert.match(declarations('.answer-step label'), /grid-template-columns:[^;]*minmax\(0, 1fr\)/);
    assert.match(declarations('.answer-step-name'), /overflow-wrap:\s*anywhere/);
    assert.doesNotMatch(CSS, /overflow-x/);

    // 一列是 grid：勾選框與 label 疊在同一格（勾選框垂直置中在 label 那一行，不管下面有沒有提醒），提醒在第二行
    assert.match(declarations('.answer-step'), /display:\s*grid/);
    assert.match(declarations('.answer-step'), /grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(declarations('.answer-step label'), /grid-area:\s*1 \/ 1/);
    assert.match(declarations('.answer-check'), /grid-area:\s*1 \/ 1/);
    assert.match(declarations('.answer-check'), /align-self:\s*center/);
    assert.match(declarations('.answer-check'), /z-index:\s*1/, '勾選框疊在 label 上面');
    assert.match(declarations('.answer-step-warning'), /grid-row:\s*2/);

    // 下一段：整列框起來（主色外框加淡底）。外框用 outline 往裡畫，不佔版面（下一段換到別列時其他列不會跳動，forced-colors 也看得到）；
    // 列與列之間的灰色上框線藏起來，不和外框疊成兩條。名稱下面那一行小字（--text-xs）裡「下一段」用主色加半粗體
    const next = declarations('.answer-step.is-next');
    assert.match(next, /outline:\s*2px solid var\(--color-primary\)/);
    assert.match(next, /outline-offset:\s*-2px/);
    assert.match(next, /background:\s*var\(--color-primary-tint\)/);
    assert.match(next, /border-top-color:\s*transparent/);
    // 外框往左右各多框 --space-2（負外距加同樣寬的內距）：列裡的內容位置和別列一樣，勾選框與 ×顆數不會貼著外框
    assert.match(next, /(?:^|[\s;])margin:\s*0 calc\(-1 \* var\(--space-2\)\)/);
    assert.match(next, /(?:^|[\s;])padding:\s*0 var\(--space-2\)/);
    assert.match(declarations('.answer-step.is-next + .answer-step'), /border-top-color:\s*transparent/);
    assert.match(declarations('.answer-step-sub'), /font-size:\s*var\(--text-xs\)/);
    assert.match(declarations('.answer-step-sub'), /display:\s*block/);
    assert.match(declarations('.answer-step-next'), /color:\s*var\(--color-primary\)/);
    assert.match(declarations('.answer-step-next'), /font-weight:\s*var\(--weight-semibold\)/);
    // 「下一段」後面接著「變回…」而放不下時（日文 390px），整句換到下一行，不從字中間斷開、不留一個字掛在第二行
    assert.match(declarations('.answer-step-next ~ .answer-step-note'), /display:\s*inline-block/);
    // 淡底上的字：輔助色（--color-muted）在淺色的 --color-primary-tint 上不到 4.5:1，所以下一段那一列的段號改用主色、小字改用內文色
    assert.match(declarations('.answer-step.is-next .answer-step-no'), /color:\s*var\(--color-primary\)/);
    assert.match(declarations('.answer-step.is-next .answer-step-sub'), /color:\s*var\(--color-text\)/);

    // 被跳過的段（還沒勾、後面卻有段已經勾了）在 label 下面多一行提醒：警告色的字加淡底與邊框，--text-sm，放不下就換行
    const warning = declarations('.answer-step-warning');
    assert.match(warning, /color:\s*var\(--color-warning-text\)/);
    assert.match(warning, /background:\s*var\(--color-warning-tint\)/);
    assert.match(warning, /border:\s*1px solid var\(--color-warning-border\)/);
    assert.match(warning, /font-size:\s*var\(--text-sm\)/);
    assert.match(warning, /overflow-wrap:\s*anywhere/);
    assert.match(warning, /text-wrap:\s*balance/, '折成兩行時長度接近，第二行不會只剩一兩個字');

    // 這幾組字色與底色的對比，淺色與深色都要 ≥ 4.5:1（寫在 tokens.css 的值；深色的警告淡底是半透明，疊在列的底色——卡片或下一段的淡底——上算）
    const tokens = (selector) => {
        const css = read('assets/css/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');
        const start = css.indexOf(`${selector} {`);
        assert.notEqual(start, -1, `tokens.css 找不到 ${selector}`);
        return new Map([...css.slice(start, css.indexOf('}', start)).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    };
    const hex = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    // 顏色（#rrggbb 或 rgba(r, g, b, a)）疊在 #rrggbb 的底色上之後的 [r, g, b]
    const over = (color, base) => {
        const [r, g, b, a = 1] = color.startsWith('#') ? hex(color) : color.match(/[\d.]+/g).map(Number);
        return hex(base).map((channel, i) => [r, g, b][i] * a + channel * (1 - a));
    };
    const luminance = (rgb) => rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    for (const [theme, selector] of [['淺色', ':root'], ['深色', '[data-theme="dark"]']]) {
        const t = tokens(selector);
        const surface = t.get('--color-surface');
        const tint = t.get('--color-primary-tint');
        const checks = [
            ['下一段的字（主色）在淡底上', hex(t.get('--color-primary')), hex(tint)],
            ['下一段那一列的段號（主色）', hex(t.get('--color-primary')), hex(tint)],
            ['下一段那一列的小字（內文色）', hex(t.get('--color-text')), hex(tint)],
            ['下一段那一列的名稱與顆數（標題色）', hex(t.get('--color-heading')), hex(tint)],
            ['提醒的字在卡片上', over(t.get('--color-warning-text'), surface), over(t.get('--color-warning-tint'), surface)],
            ['提醒的字在下一段的淡底上', over(t.get('--color-warning-text'), tint), over(t.get('--color-warning-tint'), tint)]
        ];
        for (const [what, foreground, background] of checks) {
            assert.ok(ratio(foreground, background) >= 4.5, `${theme}：${what}的對比 ${ratio(foreground, background).toFixed(2)} 不到 4.5`);
        }
    }

    // 「餵食順序」那一行：整行 --text-sm，標題用標題色加半粗體，後半句用輔助色（都是 token）
    assert.match(declarations('.answer-order'), /font-size:\s*var\(--text-sm\)/);
    assert.match(declarations('.answer-order-title'), /color:\s*var\(--color-heading\)/);
    assert.match(declarations('.answer-order-title'), /font-weight:\s*var\(--weight-semibold\)/);
    assert.match(declarations('.answer-order-hint'), /color:\s*var\(--color-muted\)/);

    // 選顏色的兩顆按鈕：基本是左右排、中間一個箭頭，兩邊可以縮，顏色名稱放不下就換行（窄螢幕改上下排，見下一個測試）
    assert.match(declarations('.color-pick-card', BASE_CSS), /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
    assert.match(declarations('.color-pick'), /min-width:\s*0/);
    assert.match(declarations('.color-btn'), /min-height:\s*var\(--control-md\)/);
    assert.match(declarations('.color-btn-name'), /overflow-wrap:\s*anywhere/);
    assert.match(declarations('.chocobo-layout'), /max-width:\s*760px/);

    // 答案卡一開始 hidden，.card 的 display 會蓋掉瀏覽器內建的 [hidden]，所以要自己寫
    assert.match(openTag('answerCard'), /\shidden(?=[\s>])/);
    assert.match(declarations('#answerCard[hidden]'), /display:\s*none/);
});

test('窄螢幕：480px 以下兩個選擇器上下排成兩列（左標籤、右按鈕）、箭頭收起來、頁面說明視覺上隱藏；481px 以上照舊', async () => {
    // 481px 以上（沒有 @media 的基本規則）：三欄左右排，箭頭在中間不隱藏，說明照常顯示
    assert.match(declarations('.color-pick-card', BASE_CSS), /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
    assert.doesNotMatch(declarations('.color-pick-arrow', BASE_CSS), /display:\s*none/);
    assert.doesNotMatch(declarations('.page-header .description', BASE_CSS), /position:|clip:|display:|visibility:/);

    // 動到這兩個地方的 @media 只有 (max-width: 480px) 這一個：481px 不在裡面；上一版的 359px 規則已經拿掉
    const touching = MEDIA.filter((block) => /\.color-pick|\.description/.test(block.body));
    assert.deepEqual(touching.map((block) => block.condition), ['(max-width: 480px)']);
    assert.ok(!MEDIA.some((block) => block.condition.includes('359px')), '359px 的 @media 不在了');
    const narrow = touching[0].body;

    // 兩欄 grid：第一欄 auto（兩個標籤共用比較寬的那個的寬度，兩顆按鈕對齊），第二欄 minmax(0, 1fr)（按鈕佔滿剩下的寬度，
    // 放不下的名稱換行，整列不會被撐寬）。.color-pick 是 display: contents：標籤與按鈕直接成為這個 grid 的格子，
    // 一個選擇器一列；箭頭 display: none
    assert.match(declarations('.color-pick-card', narrow), /grid-template-columns:\s*auto minmax\(0, 1fr\)\s*;/);
    assert.match(declarations('.color-pick', narrow), /display:\s*contents/);
    assert.match(declarations('.color-pick-arrow', narrow), /display:\s*none/);
    assert.doesNotMatch(CSS, /overflow-x/);

    // DOM 順序不變（display: contents 之後格子的順序就是：標籤、按鈕、標籤、按鈕；箭頭收起來，不佔格子）
    const page = await createChocoboPage();
    const card = page.$('fromBtn').parentNode.parentNode;
    assert.ok(card.classList.contains('color-pick-card'));
    assert.deepEqual(card.children.map((child) => child.className), ['color-pick', 'color-pick-arrow', 'color-pick']);
    assert.deepEqual(card.children[0].children.map((child) => child.id), ['fromLabel', 'fromBtn']);
    assert.deepEqual(card.children[2].children.map((child) => child.id), ['toLabel', 'toBtn']);

    // 說明：視覺上隱藏，螢幕閱讀器照樣讀得到——所以不用 display: none、visibility: hidden，<p> 也還在。
    // 寫法就是 common.css 的 .visually-hidden：它的每一條宣告，這裡都有
    const description = declarations('.page-header .description', narrow);
    assert.doesNotMatch(description, /(?:^|[;\s])display:/);
    assert.doesNotMatch(description, /visibility:/);
    assert.match(HTML, /<p class="description" data-i18n="chocobo_color_desc">/);
    const site = declarationSet(declarations('.visually-hidden', COMMON_CSS));
    assert.ok(site.size >= 8, `解析不到 common.css 的 .visually-hidden（${site.size} 條）`);
    const mine = declarationSet(description);
    for (const declaration of site) assert.ok(mine.has(declaration), `說明少了 .visually-hidden 的「${declaration}」`);
});

// ---------- 色票面板 ----------

const pressedIds = (page) => page.sheet().swatches.filter((swatch) => swatch.pressed).map((swatch) => swatch.id);
const costOf = (page, id) => page.sheet().swatches.find((swatch) => swatch.id === id).cost;
const openPanels = (page) => page.document.querySelectorAll('.color-sheet-overlay.active').length;

test('點目標顏色：打開選目標顏色的面板，85 格依色系分 7 組，每格寫從目前顏色要餵幾顆', async () => {
    const page = await createChocoboPage();
    assert.equal(page.sheet().open, false, '一打開頁面面板是關著的');
    assert.equal(openPanels(page), 0);

    page.$('toBtn').click();
    const sheet = page.sheet();
    assert.equal(sheet.open, true);
    assert.equal(sheet.title, '選目標顏色');
    assert.equal(sheet.hint, '每格是從目前的沙漠黃要餵幾顆（已經算進檸檬）。');
    assert.equal(page.$('colorSheetHint').hidden, false);
    assert.deepEqual(sheet.groups.map((group) => [group.key, group.count]),
        [['white', 7], ['yellow', 8], ['red', 11], ['brown', 17], ['purple', 8], ['blue', 17], ['green', 17]]);
    assert.equal(sheet.groups[0].title, '白・灰・黑');
    assert.deepEqual(sheet.groups.map((group) => group.title), ['白・灰・黑', '黃・橙', '紅・粉', '棕', '紫', '藍', '綠']);

    // 85 格，照 colorGroups() 的順序（每組由亮到暗）
    const expectedIds = Array.from(colorGroups(DATA), (group) => Array.from(group.ids)).flat();
    assert.equal(expectedIds.length, 85);
    assert.deepEqual(sheet.swatches.map((swatch) => swatch.id), expectedIds);
    assert.deepEqual(sheet.swatches.map((swatch) => swatch.name), expectedIds.map((id) => DATA.colors.find((color) => color.id === id).names.zh));

    // 目前選的目標（素雪白）框起來，打開時焦點就在它上面；只有這一格是 pressed
    assert.deepEqual(pressedIds(page), ['snow-white']);
    for (const swatch of sheet.swatches) {
        assert.equal(page.swatch(swatch.id).getAttribute('aria-pressed'), swatch.id === 'snow-white' ? 'true' : 'false', swatch.id);
    }
    isSame(page.document.activeElement, page.swatch('snow-white'), '打開時焦點在目前選的那一格');

    // 目前顏色（沙漠黃）那一格寫「目前」；其他 84 格是從沙漠黃到它的最少顆數（已經算進檸檬）
    assert.equal(sheet.swatches.find((swatch) => swatch.id === 'desert-yellow').cost, '目前');
    const others = sheet.swatches.filter((swatch) => swatch.id !== 'desert-yellow');
    assert.equal(others.length, 84);
    for (const swatch of others) assert.equal(swatch.cost, `${bestTotal(DATA, 'desert-yellow', swatch.id)} 顆`, swatch.id);
    assert.equal(costOf(page, 'morbol-green'), '80 顆');
    assert.equal(costOf(page, 'snow-white'), '34 顆', '和答案卡的總顆數一樣');

    // 螢幕閱讀器聽得到名稱與顆數
    assert.equal(page.swatch('morbol-green').getAttribute('aria-label'), '魔花綠，80 顆');
    assert.equal(page.swatch('snow-white').getAttribute('aria-label'), '素雪白，34 顆');
    assert.equal(page.swatch('desert-yellow').getAttribute('aria-label'), '沙漠黃，目前');

    // 色塊的顏色是資料（JS 設的 style.background），只是裝飾
    for (const color of DATA.colors) {
        const chip = page.swatch(color.id).querySelector('.color-swatch-chip');
        assert.equal(chip.style.background, `rgb(${color.rgb.join(', ')})`, color.id);
        assert.equal(chip.getAttribute('aria-hidden'), 'true');
        assert.equal(chip.textContent, '');
        assert.equal(page.swatch(color.id).getAttribute('type'), 'button');
    }
    assert.deepEqual(page.consoleErrors, []);
});

test('點一格：面板關掉、焦點回到目標按鈕、答案換成新的、勾選清空；再打開時內容是新的', async () => {
    const page = await createChocoboPage();
    page.check(0);
    assert.deepEqual(saved(page).done, [0]);

    page.$('toBtn').click();
    // 點色票裡的字（不是按鈕本身）也算
    page.swatch('sky-blue').querySelector('.color-swatch-name').click();
    assert.equal(page.sheet().open, false);
    assert.equal(openPanels(page), 0);
    isSame(page.document.activeElement, page.$('toBtn'), '焦點回到目標按鈕');
    assert.equal(page.$('toName').textContent, '天空藍');
    assert.equal(page.$('toChip').style.background, 'rgb(154, 195, 232)');
    assert.equal(page.$('fromName').textContent, '沙漠黃', '目前顏色沒動');
    assert.equal(page.answer().total, '共 29 顆');
    assert.ok(page.answer().steps.every((step) => !step.checked), '換顏色清空打勾');
    assert.deepEqual(saved(page), { from: 'desert-yellow', to: 'sky-blue', done: [] });
    assert.equal(page.$('answerAnnounce').textContent, '天空藍：共 29 顆，分 3 段');

    // 每一次打開都重畫：框起來的與焦點都是新的目標
    page.$('toBtn').click();
    assert.deepEqual(pressedIds(page), ['sky-blue']);
    isSame(page.document.activeElement, page.swatch('sky-blue'));
    assert.equal(costOf(page, 'sky-blue'), '29 顆');
    assert.deepEqual(page.consoleErrors, []);
});

test('點目前已選的那一格：只關掉面板，勾選不清，答案卡也不重畫', async () => {
    const page = await createChocoboPage();
    page.check(0);
    const box = page.$('step-0');

    // 目標面板：素雪白是目前的目標
    page.$('toBtn').click();
    page.swatch('snow-white').click();
    assert.equal(page.sheet().open, false);
    isSame(page.document.activeElement, page.$('toBtn'), '焦點回到目標按鈕');
    assert.deepEqual(saved(page), { from: 'desert-yellow', to: 'snow-white', done: [0] });
    assert.equal(page.answer().steps[0].checked, true);
    assert.equal(page.answer().done, '已勾 1／4 段');
    isSame(page.$('step-0'), box, '答案卡沒有重畫');

    // 目前顏色面板：沙漠黃是目前的目前顏色
    page.$('fromBtn').click();
    page.swatch('desert-yellow').click();
    assert.equal(page.sheet().open, false);
    isSame(page.document.activeElement, page.$('fromBtn'), '焦點回到目前顏色按鈕');
    assert.deepEqual(saved(page), { from: 'desert-yellow', to: 'snow-white', done: [0] });
    assert.equal(page.answer().steps[0].checked, true);
    isSame(page.$('step-0'), box, '答案卡沒有重畫');
});

test('點目前顏色：標題與提示，色票沒有顆數；選魔花綠之後用檸檬，再開目標面板的顆數從魔花綠算起', async () => {
    const page = await createChocoboPage();
    page.$('fromBtn').click();
    const sheet = page.sheet();
    assert.equal(sheet.open, true);
    assert.equal(sheet.title, '選目前顏色');
    assert.equal(page.$('colorSheetHint').hidden, true, '目前顏色的面板沒有顆數，不需要那句提示');
    assert.equal(sheet.hint, '', '藏起來的提示不留舊的字');
    assert.equal(sheet.swatches.length, 85);
    assert.equal(page.$('colorSheet').querySelectorAll('.color-swatch-cost').length, 0, '沒有任何一格有顆數');
    assert.ok(sheet.swatches.every((swatch) => swatch.cost === null));
    assert.deepEqual(pressedIds(page), ['desert-yellow'], '框起來的是目前顏色');
    isSame(page.document.activeElement, page.swatch('desert-yellow'), '打開時焦點在目前顏色上');
    assert.equal(page.swatch('morbol-green').getAttribute('aria-label'), '魔花綠', '色票的名稱只有顏色名稱');

    page.swatch('morbol-green').click();
    assert.equal(page.sheet().open, false);
    isSame(page.document.activeElement, page.$('fromBtn'), '焦點回到目前顏色按鈕');
    assert.equal(page.$('fromName').textContent, '魔花綠');
    assert.equal(page.$('fromChip').style.background, 'rgb(25, 41, 17)');
    assert.equal(page.$('toName').textContent, '素雪白', '目標顏色沒動');
    const answer = page.answer();
    assert.equal(answer.steps[0].fruit, '拉札漢檸檬');
    assert.equal(answer.total, '共 35 顆');
    assert.deepEqual(saved(page), { from: 'morbol-green', to: 'snow-white', done: [] });

    // 目標面板的顆數、提示與「目前」都是從新的目前顏色（魔花綠）算的
    page.$('toBtn').click();
    assert.equal(page.sheet().hint, '每格是從目前的魔花綠要餵幾顆（已經算進檸檬）。');
    assert.equal(costOf(page, 'morbol-green'), '目前');
    assert.equal(costOf(page, 'desert-yellow'), '1 顆');
    assert.equal(costOf(page, 'snow-white'), '35 顆');
    page.key('Escape');

    // 目前顏色選成和目標一樣：答案卡只寫已經是…
    page.$('fromBtn').click();
    page.swatch('snow-white').click();
    assert.equal(page.answer().message, '已經是素雪白，不用餵。');
    assert.deepEqual(saved(page), { from: 'snow-white', to: 'snow-white', done: [] });
});

test('Esc、點遮罩、關閉鈕都會關掉，焦點回到打開它的按鈕；點面板裡面不會關，什麼都沒存', async () => {
    const page = await createChocoboPage();
    for (const [button, title] of [['toBtn', '選目標顏色'], ['fromBtn', '選目前顏色']]) {
        for (const [how, close] of [
            ['Esc', () => page.key('Escape')],
            ['點遮罩', () => page.$('colorSheet').click()],
            ['關閉鈕', () => page.$('colorSheetClose').click()]
        ]) {
            page.$(button).click();
            assert.equal(page.sheet().open, true, `#${button} 打開面板`);
            assert.equal(page.sheet().title, title);
            close();
            assert.equal(page.sheet().open, false, `#${button}：${how} 關掉面板`);
            isSame(page.document.activeElement, page.$(button), `#${button}：${how} 之後焦點回到按鈕`);
        }
    }
    assert.equal(page.storage.size, 0, '只是開關面板，顏色沒變，什麼都沒存');
    assert.equal(page.answer().total, '共 34 顆');

    // 點面板裡面（標題、提示、色票之間的空白、面板本身）不是點遮罩，不會關；Esc 以外的鍵也不會
    page.$('toBtn').click();
    const inside = [page.$('colorSheetTitle'), page.$('colorSheetHint'), page.$('colorGroups'), page.$('colorSheet').children[0]];
    for (const element of inside) {
        element.click();
        assert.equal(page.sheet().open, true, `點 ${element.id || element.className} 不會關`);
    }
    page.key('ArrowDown');
    assert.equal(page.sheet().open, true);
    page.key('Escape');
    assert.equal(page.sheet().open, false);
    assert.equal(page.storage.size, 0);
});

test('面板開著時切換語言：先關掉、焦點回到按鈕，再打開是新語言', async () => {
    const page = await createChocoboPage();
    page.$('toBtn').click();
    page.setLang('ja');
    assert.equal(page.sheet().open, false, '切換語言時面板先關掉');
    assert.equal(openPanels(page), 0);
    isSame(page.document.activeElement, page.$('toBtn'), '焦點回到打開它的按鈕');
    assert.equal(page.$('toName').textContent, 'スノウホワイト');
    assert.equal(page.answer().total, '合計 34個');
    assert.equal(page.$('colorSheetClose').getAttribute('aria-label'), '閉じる', '關閉鈕的名稱也換了');

    page.$('toBtn').click();
    const sheet = page.sheet();
    assert.equal(sheet.title, '目標の色を選ぶ');
    assert.equal(sheet.hint, '各色は今のデザートイエローから必要な数です（レモン込み）。');
    assert.deepEqual(sheet.groups.map((group) => group.title), ['白・灰・黒', '黄・橙', '赤・ピンク', '茶', '紫', '青', '緑']);
    assert.equal(sheet.groups[0].title, '白・灰・黒');
    assert.equal(sheet.swatches.find((swatch) => swatch.id === 'snow-white').name, 'スノウホワイト');
    assert.equal(costOf(page, 'snow-white'), '34個');
    assert.equal(costOf(page, 'desert-yellow'), '今の色');
    assert.equal(page.swatch('snow-white').getAttribute('aria-label'), 'スノウホワイト、34個');
    isSame(page.document.activeElement, page.swatch('snow-white'));

    // 目前顏色的面板也一樣：開著時換語言先關掉
    page.key('Escape');
    page.$('fromBtn').click();
    page.setLang('en');
    assert.equal(page.sheet().open, false);
    isSame(page.document.activeElement, page.$('fromBtn'));
    page.$('fromBtn').click();
    assert.equal(page.sheet().title, 'Choose the current color');
    assert.equal(page.sheet().swatches.find((swatch) => swatch.id === 'desert-yellow').name, 'Desert Yellow');
    assert.equal(page.$('colorSheetClose').getAttribute('aria-label'), 'Close');
    assert.deepEqual(page.consoleErrors, []);
});

test('openSheet：開著時再開另一種面板，畫面上只有一個，關掉後焦點回到最後打開的那顆按鈕', async () => {
    const page = await createChocoboPage();
    page.app.openSheet('to');
    assert.equal(page.sheet().title, '選目標顏色');
    page.app.openSheet('from');
    assert.equal(openPanels(page), 1, '畫面上只有一個面板開著');
    assert.equal(page.sheet().title, '選目前顏色');
    assert.equal(page.$('colorSheetHint').hidden, true);
    assert.ok(page.sheet().swatches.every((swatch) => swatch.cost === null));
    assert.deepEqual(pressedIds(page), ['desert-yellow']);
    isSame(page.document.activeElement, page.swatch('desert-yellow'));

    // 點的色票換的是現在開著的那一種（目前顏色），不是先開的目標顏色
    page.swatch('morbol-green').click();
    assert.equal(page.$('fromName').textContent, '魔花綠');
    assert.equal(page.$('toName').textContent, '素雪白');
    isSame(page.document.activeElement, page.$('fromBtn'));

    page.app.openSheet('to');
    page.app.openSheet('from');
    page.key('Escape');
    assert.equal(page.sheet().open, false);
    assert.equal(openPanels(page), 0);
    isSame(page.document.activeElement, page.$('fromBtn'), '關掉後焦點回到 #fromBtn');

    // 同一種再開一次：先關掉再開，面板還是只有一個
    page.app.openSheet('to');
    page.app.openSheet('to');
    assert.equal(openPanels(page), 1);
    assert.equal(page.sheet().title, '選目標顏色');
    page.$('colorSheetClose').click();
    assert.equal(page.sheet().open, false);
    isSame(page.document.activeElement, page.$('toBtn'), '關掉後焦點回到 #toBtn');

    // 不認得的種類不開；沒開著時關閉什麼都不做
    page.app.openSheet('nope');
    page.app.openSheet(undefined);
    assert.equal(page.sheet().open, false);
    page.app.closeSheet();
    assert.equal(page.sheet().open, false);
    assert.deepEqual(page.consoleErrors, []);
});

test('資料沒載入：面板打不開，兩顆按鈕本來就不能按', async () => {
    const page = await createChocoboPage({ fetchFails: true });
    page.$('toBtn').click();
    page.$('fromBtn').click();
    assert.equal(page.sheet().open, false);
    page.app.openSheet('to');
    assert.equal(page.sheet().open, false, '直接呼叫也一樣');
    assert.equal(page.sheet().swatches.length, 0);
});

test('量詞：中文「顆」、日文「個」、英文照數量寫 fruit／fruits，目前顏色那一格寫「目前」', async () => {
    const en = await createChocoboPage({ lang: 'en' });
    en.app.setColors('morbol-green', 'snow-white');
    en.$('toBtn').click();
    assert.equal(en.sheet().title, 'Choose the target color');
    assert.equal(en.sheet().hint, 'Each color shows how many fruits it takes from Morbol Green (lemon included).');
    assert.equal(costOf(en, 'desert-yellow'), '1 fruit');
    assert.equal(costOf(en, 'snow-white'), '35 fruits');
    assert.equal(costOf(en, 'morbol-green'), 'Current');
    assert.equal(en.swatch('desert-yellow').getAttribute('aria-label'), 'Desert Yellow, 1 fruit');
    assert.equal(en.swatch('snow-white').getAttribute('aria-label'), 'Snow White, 35 fruits');
    assert.equal(en.swatch('morbol-green').getAttribute('aria-label'), 'Morbol Green, Current');
    assert.deepEqual(en.sheet().groups.map((group) => group.title),
        ['White, grey and black', 'Yellow and orange', 'Red and pink', 'Brown', 'Purple', 'Blue', 'Green']);
    assert.ok(!en.sheet().swatches.some((swatch) => /\b1 fruits\b/.test(swatch.cost ?? '')), '英文 1 顆是 fruit');

    // 一顆（魔花綠 → 沙漠黃）三種語言各有自己的單數寫法
    for (const [lang, current, one, many] of [
        ['zh', '目前', '1 顆', '35 顆'],
        ['en', 'Current', '1 fruit', '35 fruits'],
        ['ja', '今の色', '1個', '35個']
    ]) {
        const page = await createChocoboPage({ lang, stored: store({ from: 'morbol-green', to: 'snow-white' }) });
        page.$('toBtn').click();
        assert.equal(costOf(page, 'morbol-green'), current, lang);
        assert.equal(costOf(page, 'desert-yellow'), one, lang);
        assert.equal(costOf(page, 'snow-white'), many, lang);
    }
});

test('找不到做法的顏色：色票只寫名稱，不寫顆數，也不寫成 null', async () => {
    // 同「找不到做法的資料」：拿掉三種水果，一部分顏色算不出做法
    const data = { ...DATA, fruits: DATA.fruits.filter((f) => !['doman-plum', 'valfruit', 'cieldalaes-pineapple'].includes(f.id)) };
    const page = await createChocoboPage({ data });
    page.$('toBtn').click();
    const sheet = page.sheet();
    const unreachable = sheet.swatches.filter((swatch) => swatch.id !== 'desert-yellow' && bestTotal(data, 'desert-yellow', swatch.id) === null);
    assert.ok(unreachable.length > 0, '這份資料裡有算不出做法的顏色，測試才有意義');
    assert.ok(unreachable.length < 84, '也有算得出來的');
    for (const swatch of unreachable) {
        assert.equal(swatch.cost, null, swatch.id);
        assert.equal(page.swatch(swatch.id).getAttribute('aria-label'), swatch.name, swatch.id);
    }
    for (const swatch of sheet.swatches.filter((s) => s.id !== 'desert-yellow' && !unreachable.includes(s))) {
        assert.equal(swatch.cost, `${bestTotal(data, 'desert-yellow', swatch.id)} 顆`, swatch.id);
    }
    assert.doesNotMatch(page.$('colorSheet').textContent, /null|undefined|NaN/);
    assert.deepEqual(page.consoleErrors, []);
});

test('色票面板的標記：role 與名稱在遮罩層上，標題是 h2，關閉鈕有可翻譯的名稱，ModalManager 緊接在 common.js 後面載入', async () => {
    const overlay = tagAttrs(HTML, 'colorSheet');
    assert.deepEqual(overlay.class.split(/\s+/).sort(), ['color-sheet-overlay', 'dialog-overlay']);
    assert.equal(overlay.role, 'dialog');
    assert.equal(overlay['aria-modal'], 'true');
    assert.equal(overlay['aria-labelledby'], 'colorSheetTitle');
    assert.doesNotMatch(openTag('colorSheet'), /\sstyle=/, '顯示與隱藏靠 class，不靠內嵌樣式');
    assert.match(openTag('colorSheetTitle'), /^<h2\b/);
    assert.equal(tagAttrs(HTML, 'colorSheetTitle').class, 'dialog-title');
    assert.match(openTag('colorSheetHint'), /^<p\b/);
    assert.equal(tagAttrs(HTML, 'colorSheetHint').class, 'color-sheet-hint');
    assert.match(openTag('colorSheetHint'), /\shidden(?=[\s>])/);

    const close = tagAttrs(HTML, 'colorSheetClose');
    assert.match(openTag('colorSheetClose'), /^<button\b/);
    assert.equal(close.type, 'button');
    assert.deepEqual(close.class.split(/\s+/), ['btn', 'btn-close']);
    assert.equal(close['aria-label'], '關閉');
    assert.equal(close['data-i18n'], 'chocobo_color_close');
    assert.equal(close['data-i18n-attr'], 'aria-label');

    assert.ok(HTML.indexOf('id="colorSheet"') > HTML.indexOf('id="chocoboTool"'), '面板在 #chocoboTool 後面');
    assert.doesNotMatch(HTML, /btn-primary/, '面板裡也沒有主要按鈕');

    const scripts = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    const common = scripts.indexOf('../../assets/js/common.js');
    const modal = scripts.indexOf('../../assets/js/modal-manager.js');
    assert.ok(common !== -1 && modal === common + 1, 'modal-manager.js 緊接在 common.js 後面');
    assert.ok(modal < scripts.indexOf('chocobo-solver.js') && modal < scripts.indexOf('script.js'));

    // 照 index.html 建出來的結構：遮罩層 > .dialog.color-sheet（沒有 role）> 標題列、提示、色票容器
    const page = await createChocoboPage();
    assert.deepEqual(page.$('colorSheet').children.map((child) => child.className), ['dialog color-sheet']);
    const dialog = page.$('colorSheet').children[0];
    assert.equal(dialog.hasAttribute('role'), false, '內層的 .dialog 不帶 role');
    assert.deepEqual(dialog.children.map((child) => child.id || child.className), ['dialog-header', 'colorSheetHint', 'colorGroups']);
    assert.deepEqual(dialog.children[0].children.map((child) => child.id), ['colorSheetTitle', 'colorSheetClose']);
    assert.equal(page.sheet().open, false);
    assert.equal(page.$('colorSheetClose').getAttribute('aria-label'), '關閉');
});

test('色票面板的樣式：遮罩預設藏起來，電腦置中最寬 700px，手機蓋滿畫面，色票的名稱換行、格子不撐寬，沒有 overflow-x', () => {
    // 共用的 .dialog-overlay 是 display: flex，所以預設要自己藏起來，ModalManager 加 .active 才顯示
    assert.match(declarations('.color-sheet-overlay', BASE_CSS), /display:\s*none/);
    assert.match(declarations('.color-sheet-overlay.active', BASE_CSS), /display:\s*flex/);
    // 提示藏起來時：寫 display 的規則會蓋掉瀏覽器內建的 [hidden]，所以要自己寫
    assert.match(declarations('#colorSheetHint[hidden]'), /display:\s*none/);

    // 電腦：置中的對話框，最寬 700px，太高時在框裡上下捲；標題列捲動時留在最上面（要有底色，不然底下的色票會透出來）
    assert.match(declarations('.color-sheet', BASE_CSS), /max-width:\s*700px/);
    assert.match(declarations('.color-sheet', BASE_CSS), /max-height:\s*80vh/);
    const header = declarations('.color-sheet .dialog-header', BASE_CSS);
    assert.match(header, /(?:^|[\s;])position:\s*sticky/);
    assert.match(header, /(?:^|[\s;])top:\s*0(?:[\s;]|$)/);
    assert.match(header, /(?:^|[\s;])background:\s*var\(--color-surface\)/);
    // 標題列固定在上面，所以用 Shift+Tab 往上走時，焦點格要留出標題列的高度，不然焦點會藏在標題列後面（實際用 Chrome 量過）
    assert.match(declarations('.color-sheet', BASE_CSS), /scroll-padding-top:/);

    // 疊放順序：手機上面板蓋滿畫面，頁首的漢堡按鈕（common.css 的 .hamburger）不能壓在關閉鈕上（z-index 比它高），也不能蓋住 toast
    const token = (name) => Number(read('assets/css/tokens.css').match(new RegExp(`${name}:\\s*(\\d+)`))[1]);
    const layer = declarations('.color-sheet-overlay', BASE_CSS).match(/z-index:\s*calc\(var\((--z-[a-z]+)\)\s*\+\s*(\d+)\)/);
    assert.ok(layer, '.color-sheet-overlay 的 z-index 是 calc(var(--z-…) + n)');
    const sheetLayer = token(layer[1]) + Number(layer[2]);
    const hamburgerLayer = Number(declarations('.hamburger', COMMON_CSS).match(/z-index:\s*(\d+)/)[1]);
    assert.ok(sheetLayer > hamburgerLayer, `面板的 z-index ${sheetLayer} 要比漢堡按鈕的 ${hamburgerLayer} 高`);
    assert.ok(sheetLayer < token('--z-toast'), '面板在 toast 之下');

    // 手機（768px 以下）：遮罩沒有內距，面板寬高都是 100%、不留圓角與邊框，蓋滿畫面（max-height 要放掉，不然上限還是 80vh）
    const phone = MEDIA.filter((block) => block.condition === '(max-width: 768px)');
    assert.equal(phone.length, 1, '768px 的 @media 只有一個');
    assert.match(declarations('.color-sheet-overlay', phone[0].body), /(?:^|[\s;])padding:\s*0(?:[\s;]|$)/);
    const sheet = declarations('.color-sheet', phone[0].body);
    assert.match(sheet, /max-width:\s*none/);
    assert.match(sheet, /max-height:\s*none/);
    assert.match(sheet, /(?:^|[\s;])width:\s*100%/);
    assert.match(sheet, /(?:^|[\s;])height:\s*100%/);
    assert.match(sheet, /border-radius:\s*0/);
    // 這個 @media 只管面板，不動選顏色那一列（那邊是 480px 的事，見上一個「窄螢幕」測試）
    assert.doesNotMatch(phone[0].body, /\.color-pick|\.description/);

    // 色票：每組一個 grid，欄寬最小值固定、其餘平分；名稱放不下就換行，格子不撐寬
    const grid = declarations('.color-group-swatches');
    assert.match(grid, /display:\s*grid/);
    assert.match(grid, /grid-template-columns:\s*repeat\(auto-fill, minmax\([^)]+, 1fr\)\)/);
    assert.match(declarations('.color-swatch'), /min-width:\s*0/);
    assert.match(declarations('.color-swatch'), /border-radius:\s*var\(--radius-md\)/);
    assert.match(declarations('.color-swatch-name'), /overflow-wrap:\s*anywhere/);
    assert.match(declarations('.color-swatch-name'), /font-size:\s*var\(--text-xs\)/);
    // 目前選的那一格框起來，不只靠顏色以外的東西（有邊框色、也有外圈）
    const pressed = declarations('.color-swatch[aria-pressed="true"]');
    assert.match(pressed, /border-color:\s*var\(--color-primary\)/);
    assert.match(pressed, /box-shadow:/);
    assert.match(declarations('.color-swatch:focus-visible'), /outline:\s*2px solid var\(--color-primary\)/);

    // 整份樣式沒有左右捲動（面板只有垂直捲動：共用的 .dialog 是 overflow: auto）
    assert.doesNotMatch(CSS, /overflow-x/);
});

test('翻譯：三語的鍵一樣，每個鍵的 {參數} 三語一樣，index.html 的預設文字等於 zh 翻譯', () => {
    const keys = Object.fromEntries(LANGS.map((lang) => [lang, translationKeySet(TRANSLATIONS, lang)]));
    const values = Object.fromEntries(LANGS.map((lang) => [lang, translationValues(TRANSLATIONS, lang)]));
    assert.ok(keys.zh.size >= 20, `解析不到 ${TRANSLATIONS} 的 zh 語系，測試可能失效（${keys.zh.size} 個）`);
    for (const lang of LANGS) {
        assert.deepEqual([...keys[lang]].sort(), [...keys.zh].sort(), `${lang} 的鍵和 zh 一樣`);
        assert.equal(values[lang].size, keys[lang].size, `${lang} 每個鍵都有字串值`);
    }

    // {n}、{fruit}…：某一語少寫一個參數，畫面上就會少一個數字或名稱，或是留下沒換掉的 {…}
    const params = (text) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
    for (const key of keys.zh) {
        for (const lang of ['en', 'ja']) {
            assert.deepEqual(params(values[lang].get(key)), params(values.zh.get(key)), `${key} 的 ${lang} 參數和 zh 一樣`);
        }
    }

    // 頁面上有 data-i18n 的元素：靜態的預設文字和 zh 翻譯相同（I18nManager 套用前後不會閃一下別的字）。逐字比，不 trim：
    // 資料來源那一句的翻譯值自己帶著結尾的空白（見下一個測試）。
    // 有 data-i18n-attr 的元素換的是那個屬性（面板關閉鈕的 aria-label），文字是 ×，所以比的是屬性的預設值
    const found = [...HTML.matchAll(/(<[a-zA-Z][\w-]*\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([^<]*)</g)];
    assert.ok(found.length >= 8, `只找到 ${found.length} 個 data-i18n，解析可能失效`);
    for (const [, tag, key, text] of found) {
        const attribute = tag.match(/\sdata-i18n-attr="([^"]+)"/)?.[1];
        const preset = attribute ? tag.match(new RegExp(`\\s${attribute}="([^"]*)"`))?.[1] : text;
        assert.equal(preset, values.zh.get(key), `index.html 的 ${key} 預設文字`);
    }
    assert.ok(found.some(([, tag]) => /\sdata-i18n-attr="aria-label"/.test(tag)), '關閉鈕的 aria-label 也有翻譯');
});

test('資料來源那一行：和連結之間的空白寫在翻譯值裡，三種語言各自接得剛好（日文「：」後面不多一個空白）', async () => {
    // 標記裡 span 和連結之間沒有空白。空白若寫在標記裡，日文會變成「色データの出典： ffxivchocobo.com」（全形冒號後面多一格）
    const credit = HTML.match(/<span data-i18n="chocobo_color_credit">([^<]*)<\/span>(\s*)<a\b[^>]*href="https:\/\/ffxivchocobo\.com\/"/);
    assert.ok(credit, '找不到資料來源那一行（span 後面緊接著 ffxivchocobo.com 的連結）');
    assert.equal(credit[2], '', 'span 和連結之間不能有空白，空白是翻譯值的一部分');

    // 翻譯值：中文、英文以一個空白結尾（接著連結），日文以「：」結尾、後面沒有空白
    const credits = Object.fromEntries(LANGS.map((lang) => [lang, translationValues(TRANSLATIONS, lang).get('chocobo_color_credit')]));
    assert.deepEqual(credits, { zh: '顏色資料參考自 ', en: 'Color data from ', ja: '色データの出典：' });

    // 畫面上那一行的字（span 加連結）：一打開、切換語言之後都一樣
    const line = (page) => page.$('chocoboTool').querySelector('[data-i18n="chocobo_color_credit"]').parentNode.textContent;
    const page = await createChocoboPage();
    assert.equal(line(page), '顏色資料參考自 ffxivchocobo.com');
    page.setLang('en');
    assert.equal(line(page), 'Color data from ffxivchocobo.com');
    page.setLang('ja');
    assert.equal(line(page), '色データの出典：ffxivchocobo.com');
    page.setLang('zh');
    assert.equal(line(page), '顏色資料參考自 ffxivchocobo.com');
    assert.equal(line(await createChocoboPage({ lang: 'ja' })), '色データの出典：ffxivchocobo.com');
});
