const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element() {
    const node = { className: '', children: [], style: {}, dataset: {}, attributes: {}, text: '' };
    node.classList = {
        contains: name => node.className.split(' ').includes(name),
        add: (...names) => { node.className = [...new Set([...node.className.split(' '), ...names])].join(' '); },
        remove: (...names) => { node.className = node.className.split(' ').filter(name => !names.includes(name)).join(' '); }
    };
    Object.defineProperty(node, 'textContent', {
        get: () => node.text + node.children.map(child => child.textContent).join(''),
        set: text => { node.text = String(text); node.children.length = 0; }
    });
    node.appendChild = child => { node.children.push(child); };
    node.querySelectorAll = selector => node.children.flatMap(child => [
        ...(child.classList.contains(selector.slice(1)) ? [child] : []), ...child.querySelectorAll(selector)
    ]);
    node.setAttribute = (key, value) => { node.attributes[key] = value; };
    node.removeAttribute = key => { delete node.attributes[key]; };
    return node;
}

function fixture() {
    let language = 'zh';
    let translations;
    const context = vm.createContext({
        window: { i18n: { loadTranslations: (_name, values) => { translations = values; } } },
        document: { addEventListener() {}, createElement: element },
        SecurityUtils: { clearElement: node => { node.textContent = ''; } },
        FF14Utils: { getI18nText: (key, fallback, values = {}) =>
            Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), translations[language][key] || fallback) }
    });
    for (const file of ['assets/js/i18n/translations/tools/faux-hollows-foxes.js', 'tools/faux-hollows-foxes/board-data.js', 'tools/faux-hollows-foxes/script.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    }
    const game = vm.runInContext('Object.create(FauxHollowsFoxes.prototype)', context);
    game.board = Array(36).fill(null);
    for (const i of [9, 13, 16, 28, 30]) game.board[i] = 'obstacle';
    game.board[4] = 'chest';
    for (const i of [25, 26, 27, 31]) game.board[i] = 'sword';
    game.treasureProbabilities = { sword: [], chest: [] };
    game.foxCandidates = Array(36).fill(false);
    game.obstacleProbabilities = Array(36).fill(0);
    game.obstaclesConfirmed = game.showTreasureProbabilities = game.showProbabilities = true;
    game.clickCount = 5;
    game.score = 0;
    game.elements = { board: element(), matchingBoards: element(), gameHint: null };
    game.elements.board.children = Array.from({ length: 36 }, () => element());
    game.updateDisplay = game.updateOptimalHighlight = game.updateHistoryButtons = () => {};
    game.updateTreasureProbabilitiesBasedOnMatches();
    return { game, setLanguage: value => { language = value; } };
}

test('唯一符合盤面中的四個 FOX_OR_EMPTY 只標候選，不當成 100% 出現率', () => {
    const { game } = fixture();
    assert.equal(game.countMatchingBoards(), 1);
    assert.deepEqual(game.foxCandidates.flatMap((candidate, i) => candidate ? [i] : []), [0, 3, 23, 29]);
    game.renderBoard();
    const fox = game.elements.board.children[0];
    assert.equal(fox.querySelectorAll('.fox-prob')[0].textContent, '宗長候選');
    assert.equal(fox.querySelectorAll('.fox-prob')[0].textContent.includes('%'), false);
    assert.ok(fox.attributes['aria-label'].includes('宗長候選'));
});

test('找到宗長後移除剩餘候選；還原歷史與三語重繪仍保留候選語意', () => {
    const { game, setLanguage } = fixture();
    let saved;
    game.history = { push: state => { saved = state; } };
    game.saveState();
    game.board[0] = 'fox';
    game.updateTreasureProbabilitiesBasedOnMatches();
    assert.equal(game.foxCandidates.some(Boolean), false);
    game.renderBoard();
    assert.equal(game.elements.board.children[3].querySelectorAll('.fox-prob').length, 0);
    game.restoreState(saved);
    for (const [language, expected] of [['zh', '宗長候選'], ['en', 'Fox candidate'], ['ja', '宗長候補']]) {
        setLanguage(language);
        game.updateProbabilityDisplay();
        assert.equal(game.elements.board.children[3].querySelectorAll('.fox-prob')[0].textContent, expected);
        assert.ok(game.elements.board.children[3].attributes['aria-label'].includes(expected));
    }
    game.board[3] = 'empty';
    game.updateTreasureProbabilitiesBasedOnMatches();
    assert.equal(game.foxCandidates[3], false);
    assert.equal(game.foxCandidates[23], true);
});
