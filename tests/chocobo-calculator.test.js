const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/chocobo-colors.json'), 'utf8'));
function calculator() {
    const context = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../tools/guide/chocobo-color-calculator.js'), 'utf8'), context);
    const instance = new context.window.ChocoboColorCalculator();
    instance.colors = data.colors;
    instance.fruits = data.fruits;
    instance.colorMap = new Map(data.colors.map(color => [color.id, color]));
    instance.fruitMap = new Map(data.fruits.map(fruit => [fruit.id, fruit]));
    return instance;
}
const distance = (a, b) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);

test('水果完整 RGB 效果成對相反，檸檬是重置色而不是 RGB 增量', () => {
    const calc = calculator();
    assert.deepEqual(calc.getFruitById('xelphatol-apple').effect, { r: 5, g: -5, b: -5 });
    assert.deepEqual(calc.getFruitById('mamook-pear').effect, { r: -5, g: 5, b: -5 });
    assert.deepEqual(calc.getFruitById('oghomoro-berries').effect, { r: -5, g: -5, b: 5 });
    for (const fruit of data.fruits.filter(fruit => fruit.effect)) {
        assert.ok(data.fruits.some(other => other.effect && ['r', 'g', 'b'].every(channel => other.effect[channel] === -fruit.effect[channel])));
    }
    assert.equal(calc.getFruitById('han-lemon').resetsTo, 'desert-yellow');
    assert.equal(calc.getFruitById('han-lemon').effect, null);
});

test('沙漠黃到素雪白符合已知配方，且按順序餵食不發生 clipping', () => {
    // Same RGB inputs and result as https://ffxivchocobo.com/en/desert-yellow/snow-white
    // independently implemented from RGB effect vectors, without importing its algorithm.
    const calc = calculator();
    const plan = calc.planFeeding(calc.getColorById('desert-yellow'), calc.getColorById('snow-white'));
    assert.deepEqual(Object.fromEntries(plan.fruits.map(item => [item.fruit.id, item.count])), {
        'doman-plum': 16, valfruit: 13, 'cieldalaes-pineapple': 5
    });
    assert.equal(plan.order.length, 34);
    assert.deepEqual(Array.from(plan.rgb), [229, 220, 207]);
});

test('所有 7,225 組色對：配方數量等於順序、每一步在 RGB 範圍內、終點最接近目標色', () => {
    const calc = calculator();
    for (const from of data.colors) for (const to of data.colors) {
        const label = `${from.id} -> ${to.id}`;
        const plan = calc.planFeeding(from, to);
        assert.ok(plan, label);
        let rgb = [...from.rgb];
        const used = new Map();
        for (const fruit of plan.order) {
            rgb = rgb.map((value, index) => value + fruit.effect[['r', 'g', 'b'][index]]);
            assert.ok(rgb.every(value => value >= 0 && value <= 255), `${label}: ${rgb}`);
            used.set(fruit.id, (used.get(fruit.id) || 0) + 1);
        }
        assert.deepEqual(rgb, Array.from(plan.rgb), label);
        assert.deepEqual(Object.fromEntries(used), Object.fromEntries(plan.fruits.map(item => [item.fruit.id, item.count])), label);
        const targetDistance = distance(rgb, to.rgb);
        for (const other of data.colors) {
            if (other.id !== to.id) assert.ok(targetDistance < distance(rgb, other.rgb), `${label}: closer to ${other.id}`);
        }
        if (from.id === to.id) assert.equal(plan.order.length, 0, label);
    }
});

test('切換語言保留使用者選的目前及目標色', () => {
    const calc = calculator();
    const makeSelect = value => ({ value, firstChild: null, appendChild() {} });
    calc.elements.currentSelect = makeSelect('soot-black');
    calc.elements.targetSelect = makeSelect('coral-pink');
    // Exercise selection preservation without a browser DOM.
    calc.colors = [];
    calc.populateSelects();
    assert.equal(calc.elements.currentSelect.value, 'soot-black');
    assert.equal(calc.elements.targetSelect.value, 'coral-pink');
});
