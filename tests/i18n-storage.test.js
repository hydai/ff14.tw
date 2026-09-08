const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(storage, language = 'en') {
    const document = {
        readyState: 'loading', addEventListener() {},
        documentElement: { dataset: {}, lang: 'zh-Hant' },
        querySelectorAll: () => []
    };
    const context = vm.createContext({
        window: {}, document, navigator: { languages: [language] }, localStorage: storage,
        console: { warn() {}, error() {} }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/i18n/i18n-manager.js'), 'utf8'), context);
    return { i18n: context.window.i18n, document };
}

test('blocked storage still initializes i18n using the browser preference', () => {
    const { i18n } = load({ getItem() { throw new Error('SecurityError'); } }, 'ja-JP');
    assert.equal(i18n.getCurrentLanguage(), 'ja');
});

test('failed preference persistence still translates, updates lang and notifies subscribers', () => {
    const { i18n, document } = load({ getItem: () => 'zh', setItem() { throw new Error('QuotaExceededError'); } });
    i18n.loadTranslations('test', { zh: { greeting: '你好' }, en: { greeting: 'Hello' } });
    const seen = [];
    i18n.onLanguageChange(language => seen.push([language, i18n.getText('greeting')]));
    assert.equal(i18n.setLanguage('en'), true);
    assert.equal(document.documentElement.lang, 'en');
    assert.deepEqual(seen, [['en', 'Hello']]);
});

test('restored language also sets the document language on first render', () => {
    const { i18n, document } = load({ getItem: () => 'ja' });
    i18n.updatePageLanguage();
    assert.equal(document.documentElement.lang, 'ja');
});
