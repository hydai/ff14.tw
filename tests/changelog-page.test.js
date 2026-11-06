const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeDom } = require('./helpers/fake-dom.js');
const { mountFromHtml, sliceElementById } = require('./helpers/html-fragment.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PAGE = 'changelog.html';
const CSS = 'assets/css/changelog.css';
const TRANSLATIONS = 'assets/js/i18n/translations/changelog.js';
const LANGS = ['zh', 'en', 'ja'];

// 照 changelog.html 的標記建出 #changelogEntries（每次呼叫都是新的一份）
function entries(url = 'https://ff14.tw/changelog.html') {
    const dom = createFakeDom({ url });
    mountFromHtml(dom, read(PAGE), ['changelogEntries']);
    return { dom, list: dom.document.getElementById('changelogEntries'), all: dom.document.querySelectorAll('.changelog-entry') };
}
// fake-dom 不支援逗號選擇器，分開查
const itemsOf = (entry) => [...entry.querySelectorAll('li'), ...entry.querySelectorAll('.changelog-single-item')];
const versionOf = (entry) => entry.querySelector('.changelog-version').textContent.trim();
const TAG_WORDS = new Map([['tag-success', '新增'], ['tag-info', '改善'], ['tag-warning', '修正'], ['tag-outline-primary', '里程碑']]);

// ---------- 標籤與圖例 ----------

test('條目的標籤只有新增、改善、修正、里程碑四種，里程碑只有最早的兩條', () => {
    const { list } = entries();
    const tags = list.querySelectorAll('.tag');
    assert.ok(tags.length >= 185, `只找到 ${tags.length} 個標籤，解析可能失效`);

    for (const tag of tags) {
        const text = tag.textContent.trim();
        const kinds = [...TAG_WORDS.keys()].filter((name) => tag.classList.contains(name));
        assert.equal(kinds.length, 1, `標籤「${text}」的 class 是「${tag.className}」，要剛好有 ${[...TAG_WORDS.keys()].join('、')} 其中一個`);
        assert.equal(text, TAG_WORDS.get(kinds[0]), `class 是「${tag.className}」的標籤應該寫「${TAG_WORDS.get(kinds[0])}」`);
    }

    const milestones = tags.filter((tag) => tag.textContent.trim() === '里程碑');
    assert.deepEqual(milestones.map((tag) => versionOf(tag.closest('.changelog-entry'))), ['v1.0.0', '專案啟動']);

    // 標籤的字沒有別的說法（優化、調整、改進、資訊），連圖例也算
    assert.doesNotMatch(read(PAGE), />(?:優化|調整|改進|資訊)</);
});

test('圖例是一行三個標籤，放在副標題後面、第一版前面；頁尾說明不再有圖例', () => {
    const html = read(PAGE);
    const at = (needle) => {
        const index = html.indexOf(needle);
        assert.notEqual(index, -1, `${PAGE} 找不到 ${needle}`);
        return index;
    };
    const subtitle = at('data-i18n="changelog_hero_subtitle"');
    const legend = at('id="changelogLegend"');
    const firstEntry = at('class="changelog-entry');
    assert.ok(subtitle < legend, '圖例要在副標題後面');
    assert.ok(legend < firstEntry, '圖例要在第一版前面');

    const legendHtml = sliceElementById(html, 'changelogLegend');
    const tags = [...legendHtml.matchAll(/<span class="tag (tag-[\w-]+)">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(tags, [['tag-success', '新增'], ['tag-info', '改善'], ['tag-warning', '修正']]);
    const keys = [...legendHtml.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(keys, ['changelog_tag_new', 'changelog_tag_improve', 'changelog_tag_fix']);

    // 頁尾「關於修改紀錄」只剩說明文字與連結
    assert.doesNotMatch(html, /tag-legend/);
});

test('不再用的圖例翻譯鍵三語都拿掉', () => {
    for (const lang of LANGS) {
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of ['changelog_tag_new', 'changelog_tag_improve', 'changelog_tag_fix']) {
            assert.ok(keys.has(key), `${lang} 缺少圖例還在用的 ${key}（翻譯檔解析可能失效）`);
        }
        for (const key of ['changelog_tag_legend_title', 'changelog_tag_info']) {
            assert.ok(!keys.has(key), `${lang} 還有不再用的 ${key}`);
        }
    }
});

// ---------- 每一版的標題 ----------

test('兩條以上的版本與最新一版都有一句標題，其他只有一條的版本沒有', () => {
    const { all } = entries();
    assert.ok(all.length >= 47, `只找到 ${all.length} 版，解析可能失效`);

    // 之後每發一版都會多一句，所以不寫死總數；比較節點一律用 === 加訊息（assert.equal 失敗時會展開整份 fake-dom）
    let titled = 0;
    all.forEach((entry, index) => {
        const version = versionOf(entry);
        const count = itemsOf(entry).length;
        const headlines = entry.querySelectorAll('.changelog-headline');
        if (count >= 2 || index === 0) {
            assert.ok(headlines.length === 1, `${version} 有 ${count} 條${index === 0 ? '（最新一版）' : ''}，要剛好有一句標題，實際有 ${headlines.length} 個`);
            assert.notEqual(headlines[0].textContent.trim(), '', `${version} 的標題是空的`);
            assert.ok(headlines[0].querySelector('.tag') === null, `${version} 的標題裡不該有標籤（標籤只屬於條目）`);
            titled += 1;
        } else {
            assert.ok(headlines.length === 0, `${version} 只有 ${count} 條，那一條直接寫出來，不該另外有標題`);
        }
    });
    assert.ok(titled >= 29, `只有 ${titled} 版要有標題，解析可能失效（兩條以上的舊版本就有 29 版）`);
});
