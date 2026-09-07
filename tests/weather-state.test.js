const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createWeatherPage(hash = '') {
    const elements = new Map();
    const listeners = new Map();
    const frames = [];
    function element(tag = 'div') {
        const node = {
            tag, children: [], className: '', attributes: {}, dataset: {}, style: {},
            appendChild(child) { this.children.push(...(child.tag === '#fragment' ? child.children : [child])); return child; },
            set textContent(value) { this.text = String(value); this.children = []; },
            get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            getAttribute(name) { return this.attributes[name]; },
            addEventListener() {},
            querySelectorAll(selector) {
                return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(child =>
                    selector === '*' || selector.slice(1).split('.').every(name => child.className.split(' ').includes(name)));
            },
            querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        };
        node.classList = {
            contains(name) { return node.className.split(' ').includes(name); },
            add(...names) { node.className = [...new Set([...node.className.split(' ').filter(Boolean), ...names])].join(' '); },
            remove(...names) { node.className = node.className.split(' ').filter(name => !names.includes(name)).join(' '); },
            toggle(name, force) { const enabled = force ?? !this.contains(name); this[enabled ? 'add' : 'remove'](name); return enabled; }
        };
        return node;
    }
    const context = vm.createContext({
        document: {
            getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
            createElement: element, createDocumentFragment: () => element('#fragment'), addEventListener() {}
        },
        location: { hash, pathname: '/tools/weather-forecast/' },
        i18n: { currentLanguage: 'zh', onLanguageChange() {}, getText: key => key },
        addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
        removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
        setInterval: () => 1, clearInterval() {},
        requestAnimationFrame(callback) { frames.push(callback); },
        history: { replaceState(_state, _title, url) { context.location.hash = url.startsWith('#') ? url : ''; } }
    });
    context.window = context;
    for (const name of ['zone-data', 'weather-calculator', 'weather-store', 'weather-search', 'script']) {
        vm.runInContext(fs.readFileSync(path.resolve(__dirname, `../tools/weather-forecast/${name}.js`), 'utf8'), context, { filename: `${name}.js` });
    }
    const app = vm.runInContext('new WeatherForecast()', context);
    const flush = () => { while (frames.length) frames.shift()(); };
    flush();
    return {
        app, context, elements, flush,
        changeHash(nextHash) { context.location.hash = nextHash; for (const callback of listeners.get('hashchange') || []) callback(); flush(); }
    };
}

function assertSelectedZone(page, id) {
    for (const button of page.elements.get('zoneList').querySelectorAll('.zone-btn')) {
        assert.equal(button.classList.contains('active'), button.dataset.zone === id);
        assert.equal(button.getAttribute('aria-pressed'), String(button.dataset.zone === id));
    }
}

test('initial shared URL and subsequent hash navigation keep zone, filters and results synchronized', () => {
    const page = createWeatherPage('#limsa-lominsa');
    assertSelectedZone(page, 'limsa-lominsa');
    assert.equal(page.elements.get('selectedZoneName').textContent, '利姆薩·羅敏薩');
    assert.equal(page.elements.get('resultsBody').children.length, 24);

    page.app.isSelectingTimeRange = true;
    page.app.timeRangeStart = 3;
    page.app.resultCount = 100;
    page.changeHash('#gridania-6--8-16');
    assertSelectedZone(page, 'gridania');
    assert.equal(page.app.store.state.zoneId, 'gridania');
    assert.equal(page.elements.get('selectedZoneName').textContent, '格里達尼亞');
    assert.equal(page.elements.get('timeRangeText').textContent, '08:00 - 16:00');
    assert.equal(page.app.isSelectingTimeRange, false);
    assert.equal(page.app.timeRangeStart, null);
    assert.equal(page.app.resultCount, 24);
    const desired = page.elements.get('desiredWeatherTags').querySelectorAll('.weather-tag');
    assert.deepEqual(desired.filter(tag => tag.classList.contains('active')).map(tag => tag.dataset.weather), ['Rain']);
    const rows = page.elements.get('resultsBody').children;
    assert.equal(rows.length, 24);
    for (const row of rows) {
        assert.equal(row.children[1].textContent, '08:00');
        assert.equal(row.children[2].textContent, '🌧️小雨');
    }
    for (const [hour, cell] of page.elements.get('timeGrid').children.entries()) {
        assert.equal(cell.classList.contains('in-range'), hour >= 8 && hour < 16);
    }
});

test('invalid or cleared hash resets visible selection, and a later valid hash restores the page', () => {
    const page = createWeatherPage('#gridania-6--8-16');
    for (const hash of ['#unknown-zone', '']) {
        page.changeHash(hash);
        assert.equal(page.app.store.state.zoneId, null);
        assert.equal(page.elements.get('zoneContent').style.display, 'none');
        assert.equal(page.elements.get('noZoneSelected').style.display, 'flex');
        assertSelectedZone(page, null);
        page.changeHash('#uldah');
        assert.equal(page.elements.get('zoneContent').style.display, 'block');
        assert.equal(page.elements.get('selectedZoneName').textContent, '烏爾達哈');
        assertSelectedZone(page, 'uldah');
        assert.equal(page.app.store.hasActiveFilters(), false);
        assert.equal(page.elements.get('timeRangeText').textContent, '00:00 - 24:00');
        assert.equal(page.elements.get('resultsBody').children.length, 24);
    }
});
