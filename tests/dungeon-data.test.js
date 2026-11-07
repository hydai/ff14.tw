const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseAttrs, sliceElementById } = require('./helpers/html-fragment.js');

const ROOT = path.resolve(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'data/dungeons.json'), 'utf8');
const { metadata, dungeons } = JSON.parse(raw);

// 顯示中：資料檔用 visible: false 藏起來，沒寫或 true 都是顯示
const visible = dungeons.filter((dungeon) => dungeon.visible !== false);
const hidden = dungeons.filter((dungeon) => dungeon.visible === false);

const label = (dungeon) => `${dungeon.id} ${dungeon.name}`;

const countBy = (list, field) => list.reduce((counts, item) => {
    counts[item[field]] = (counts[item[field]] || 0) + 1;
    return counts;
}, {});

// 同一個欄位的值出現在兩筆以上的副本，照值分組列出
const duplicates = (list, field) => {
    const groups = new Map();
    for (const item of list) {
        const key = String(item[field]);
        groups.set(key, [...(groups.get(key) || []), label(item)]);
    }
    return [...groups.values()].filter((names) => names.length > 1);
};

test('顯示中的副本正好是編號 1～362', () => {
    const ids = visible.map((dungeon) => dungeon.id).sort((a, b) => a - b);
    assert.deepEqual(ids, Array.from({ length: 362 }, (_, i) => i + 1));
    assert.equal(hidden.length, 441);
    assert.equal(dungeons.length, 803);
    assert.equal(metadata.visible_count, 362);
    assert.equal(metadata.hidden_count, 441);
});

test('顯示中沒有範本內容', () => {
    const templates = visible
        .filter((dungeon) => [dungeon.mechanics, dungeon.description].some((text) => String(text).startsWith('待補充')))
        .map(label);
    assert.deepEqual(templates, [], `範本內容還在顯示中：${templates.join('、')}`);
    assert.deepEqual(duplicates(visible, 'mechanics'), [], '顯示中有兩筆以上的 mechanics 一模一樣');
    assert.deepEqual(duplicates(visible, 'description'), [], '顯示中有兩筆以上的 description 一模一樣');
});

test('等級落在版本的範圍', () => {
    const RANGES = {
        '2.x': [1, 50],
        '3.x': [51, 60],
        '4.x': [61, 70],
        '5.x': [71, 80],
        '6.x': [81, 90],
        '7.x': [91, 100]
    };
    const outOfRange = visible
        .filter((dungeon) => {
            const range = RANGES[dungeon.expansion];
            return !range || !Number.isInteger(dungeon.level) || dungeon.level < range[0] || dungeon.level > range[1];
        })
        .map((dungeon) => `${label(dungeon)}（${dungeon.expansion}，Lv${dungeon.level}）`);
    assert.deepEqual(outOfRange, [], `等級超出版本範圍：${outOfRange.join('、')}`);
});

test('類型與版本的筆數', () => {
    assert.deepEqual(countBy(visible, 'type'), {
        '8人大型任務': 129,
        '四人迷宮': 100,
        '8人討伐殲滅戰': 95,
        '聯盟任務': 16,
        '公會令': 14,
        '絕境戰': 6,
        '幻巧戰': 1,
        '誅滅戰': 1
    });
    assert.deepEqual(countBy(visible, 'expansion'), {
        '2.x': 91,
        '3.x': 59,
        '4.x': 61,
        '5.x': 56,
        '6.x': 57,
        '7.x': 38
    });
});

// 上面兩份寫死的筆數和 index.html 的按鈕清單各自對得上也不夠：有人把某筆深層迷宮改回顯示並更新筆數，
// 兩邊都會過，但頁面上沒有那個類型的按鈕，玩家篩不到它。這裡直接拿資料和 index.html 的按鈕對照
test('顯示中的每一種類型與版本都有篩選按鈕，每一顆按鈕都至少有一筆', () => {
    const html = fs.readFileSync(path.join(ROOT, 'tools/dungeon-database/index.html'), 'utf8');
    // 一組按鈕（#typeTags、#expansionTags）裡每一顆 <button> 的 data-* 值，照頁面上的順序；少寫屬性的按鈕列成「(沒有 data-…)」，讓它出現在失敗訊息裡
    const buttonValues = (groupId, attribute) => [...sliceElementById(html, groupId).matchAll(/<button\b[^>]*>/g)]
        .map((match) => parseAttrs(match[0])[attribute] ?? `(沒有 ${attribute})`);
    const check = (what, groupId, attribute, field) => {
        const buttons = buttonValues(groupId, attribute);
        const shown = [...new Set(visible.map((dungeon) => dungeon[field]))];
        const withoutButton = shown.filter((value) => !buttons.includes(value));
        const withoutDungeon = buttons.filter((value) => !shown.includes(value));
        const repeated = buttons.filter((value, index) => buttons.indexOf(value) !== index);
        assert.deepEqual(withoutButton, [], `顯示中的${what}沒有篩選按鈕：${withoutButton.join('、')}`);
        assert.deepEqual(withoutDungeon, [], `${what}的篩選按鈕沒有任何一筆顯示中的副本：${withoutDungeon.join('、')}`);
        assert.deepEqual(repeated, [], `${what}的篩選按鈕重複了：${repeated.join('、')}`);
    };
    check('類型', 'typeTags', 'data-type', 'type');
    check('版本', 'expansionTags', 'data-expansion', 'expansion');
});

test('用語', () => {
    assert.ok(!raw.includes('24人大型任務'), '資料檔裡還有「24人大型任務」，官方用語是「聯盟任務」');
    assert.ok(!raw.includes('蒼穹之禁城'), '資料檔裡還有「蒼穹之禁城」，官方用語是「蒼天之禁城」');
    assert.equal(metadata.expansions['3.x'], '蒼天之禁城');
    assert.ok(Object.hasOwn(metadata.categories, '聯盟任務'), 'metadata.categories 沒有「聯盟任務」');
    assert.ok(Object.hasOwn(metadata.statistics.byType, '聯盟任務'), 'metadata.statistics.byType 沒有「聯盟任務」');
});
