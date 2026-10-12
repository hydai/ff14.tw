const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools/report-generator/script.js'), 'utf8');

// index.html 裡一開始就帶 hidden 的元素；假元素照樣開場，「不再隱藏」的斷言才有意義。
const INITIALLY_HIDDEN = new Set(['resultSection', 'charLimitWarning', 'serverCustom', 'incidentTypeCustom']);

// Runs the real controller against a minimal DOM stand-in.
function createReportPage() {
    const elements = new Map();
    const copied = [];
    const toasts = [];
    function element(initialClasses = []) {
        const classes = new Set(initialClasses);
        const children = new Map();
        return {
            value: '', textContent: '', required: false, focusCount: 0, scrollCount: 0,
            classList: {
                add: (...names) => names.forEach(name => classes.add(name)),
                remove: (...names) => names.forEach(name => classes.delete(name)),
                contains: name => classes.has(name)
            },
            focus() { this.focusCount++; },
            scrollIntoView() { this.scrollCount++; },
            addEventListener() {},
            querySelector(selector) {
                if (!children.has(selector)) children.set(selector, element());
                return children.get(selector);
            }
        };
    }
    const byId = id => {
        if (!elements.has(id)) elements.set(id, element(INITIALLY_HIDDEN.has(id) ? ['hidden'] : []));
        return elements.get(id);
    };
    const context = vm.createContext({
        document: { getElementById: byId, addEventListener() {} },
        navigator: { clipboard: { writeText: async text => { copied.push(text); } } },
        FF14Utils: { showToast: (message, type) => { toasts.push({ message, type }); } },
        setTimeout() {}, scrollTo() {}
    });
    context.window = context;
    vm.runInContext(source, context, { filename: 'script.js' });
    const app = vm.runInContext('new ReportGenerator()', context);
    return { app, copied, toasts, byId };
}

function fillForm(page, details) {
    page.byId('playerName').value = '測試玩家';
    page.byId('serverSelect').value = '伊弗利特';
    page.byId('location').value = '烏爾達哈';
    page.byId('incidentType').value = '惡意 BM';
    page.byId('details').value = details;
}

// 自動複製是 async：writeText 在呼叫當下就記錄，但成功 toast 要等 await 之後才出現。
const flush = () => new Promise(resolve => setImmediate(resolve));

// 用 detailsLength 個字的事件細節產生一份模板，回傳模板長度與自動複製、toast 的結果。
async function generateWithDetails(detailsLength) {
    const page = createReportPage();
    fillForm(page, '很'.repeat(detailsLength));
    page.app.generateReport();
    await flush();
    return {
        limit: page.app.constructor.MAX_CHAR_LIMIT,
        length: page.byId('resultText').textContent.length,
        copied: page.copied,
        success: page.toasts.filter(toast => toast.type === 'success'),
        error: page.toasts.filter(toast => toast.type === 'error')
    };
}

test('超過 1000 字時不自動複製、不顯示成功，並把焦點帶回事件細節', async () => {
    const page = createReportPage();
    fillForm(page, '很'.repeat(1000));

    page.app.generateReport();
    await flush();

    // 只比長度：失敗時不必把 1000 多字的模板整份倒進輸出。
    assert.equal(page.copied.length, 0, '超過上限的模板不應被自動複製');
    assert.deepEqual(page.toasts.filter(toast => toast.type === 'success'), []);
    const errors = page.toasts.filter(toast => toast.type === 'error');
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /1000/);
    assert.equal(page.byId('details').focusCount, 1);
    // 結果區照常顯示，使用者可以看到紅色超限提示，並自行按「複製」。
    assert.equal(page.byId('resultSection').classList.contains('hidden'), false);
    assert.equal(page.byId('charLimitWarning').classList.contains('hidden'), false);
});

test('1000 字以內照常自動複製並顯示成功', async () => {
    const page = createReportPage();
    const details = '對方在副本裡一直辱罵隊友。';
    fillForm(page, details);

    page.app.generateReport();
    await flush();

    assert.equal(page.copied.length, 1);
    assert.ok(page.copied[0].includes(details), page.copied[0]);
    assert.ok(page.toasts.some(toast => toast.type === 'success'), JSON.stringify(page.toasts));
});

test('剛好 1000 字仍自動複製，1001 字就不複製', async () => {
    // 模板除了事件細節還有標題與各欄位：先用 1 個字的事件細節產生一次，量出這些固定部分的長度，再補到剛好。
    const probe = await generateWithDetails(1);
    const limit = probe.limit;
    const overhead = probe.length - 1;

    const exact = await generateWithDetails(limit - overhead);
    assert.equal(exact.length, limit);
    assert.equal(exact.copied.length, 1, '剛好等於上限不算超過，應照常自動複製');
    assert.ok(exact.success.length > 0, JSON.stringify(exact.success));
    assert.deepEqual(exact.error, []);

    const over = await generateWithDetails(limit - overhead + 1);
    assert.equal(over.length, limit + 1);
    assert.equal(over.copied.length, 0, '多一個字就超過上限，不應自動複製');
    assert.deepEqual(over.success, []);
    assert.equal(over.error.length, 1);
});
