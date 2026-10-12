const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const mappings = JSON.parse(fs.readFileSync(path.join(root, 'data/macro-mappings.json'), 'utf8'));

const MACRO = '/ac "Basic Synthesis" <wait.3>';

// Runs the real engine and controller against a minimal DOM stand-in.
async function createMacroPage() {
    const elements = new Map();
    const languageListeners = [];
    const consoleErrors = [];
    function element() {
        const listeners = {};
        return {
            value: '', placeholder: '', textContent: '', disabled: false, style: {}, listeners,
            classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
            addEventListener(type, callback) { (listeners[type] ||= []).push(callback); }
        };
    }
    const byId = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
    const context = vm.createContext({
        console: { log() {}, warn() {}, error: (...args) => consoleErrors.push(args) },
        document: { getElementById: byId, addEventListener() {} },
        FF14Utils: { getI18nText: (_key, fallback) => fallback, showToast() {} },
        i18n: { getCurrentLanguage: () => 'zh', onLanguageChange: callback => languageListeners.push(callback) },
        fetch: async () => ({ ok: true, json: async () => mappings })
    });
    context.window = context;
    for (const name of ['conversion-engine', 'script']) {
        vm.runInContext(fs.readFileSync(path.join(root, `tools/macro-converter/${name}.js`), 'utf8'), context, { filename: `${name}.js` });
    }
    const app = vm.runInContext('new MacroConverter()', context);
    // init() is async and not awaited by the constructor; everything after the engine is created runs synchronously.
    for (let turn = 0; turn < 20 && !app.engine; turn++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(app.engine, consoleErrors.length ? String(consoleErrors[0]) : 'the converter did not finish initialising');
    assert.deepEqual(consoleErrors, []);
    return {
        app, languageListeners,
        input: byId('inputMacro'), output: byId('outputMacro'), targetLang: byId('targetLang'),
        emit(id, type) { for (const callback of byId(id).listeners[type] || []) callback({ type, target: byId(id) }); }
    };
}

test('改目標語言立刻重新轉換', async () => {
    const page = await createMacroPage();
    page.input.value = MACRO;
    page.targetLang.value = 'zh';
    page.app.convert();
    assert.match(page.output.value, /製作/);

    page.targetLang.value = 'en';
    page.emit('targetLang', 'change');
    assert.match(page.output.value, /Basic Synthesis/);
    assert.doesNotMatch(page.output.value, /製作/);
});

test('切換網站語言時，目標語言與輸出一起更新', async () => {
    const page = await createMacroPage();
    page.input.value = MACRO;
    page.targetLang.value = 'zh';
    page.app.convert();
    assert.match(page.output.value, /製作/);

    page.languageListeners[0]('ja');
    assert.equal(page.targetLang.value, 'ja');
    assert.match(page.output.value, /作業/);
});

test('輸入是空的時候改目標語言，輸出保持空白', async () => {
    const page = await createMacroPage();
    // 清除按鈕：輸入與輸出都是空的（初始化時載入的範例輸出會被一併清掉）
    page.app.clearInput();
    assert.equal(page.input.value, '');
    assert.equal(page.output.value, '');

    page.targetLang.value = 'en';
    page.emit('targetLang', 'change');
    assert.equal(page.output.value, '');
});
