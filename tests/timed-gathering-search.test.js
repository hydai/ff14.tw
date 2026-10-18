const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const items = require('../data/timed-gathering.json').items;

// search-filter.js 的 parseTime() 要用 TimeCalculator.parseSchedule()：兩個檔案依序載入同一個 context。
// search-filter.js 沒有掛到 window，頂層的 class 只能從 context 裡取出來
function loadSearchFilter() {
    const context = vm.createContext({});
    context.window = context;
    for (const name of ['time-calculator', 'search-filter']) {
        const file = path.resolve(__dirname, `../tools/timed-gathering/${name}.js`);
        vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: `${name}.js` });
    }
    return vm.runInContext('SearchFilter', context);
}

const SearchFilter = loadSearchFilter();

// vm 裡建出來的陣列與物件，原型和這邊不同，strict 的 deepEqual 前先轉成這邊的一般值
const plain = (value) => JSON.parse(JSON.stringify(value));
const sorted = (ids) => [...ids].sort();
const idsOf = (list) => Array.from(list, (item) => item.id);
const itemOf = (id) => items.find((item) => item.id === id);

// filter() 有 5 秒的快取，每次都用新的實例，不會拿到上一次的結果
const find = (term) => idsOf(new SearchFilter().filter(items, { searchTerm: term }));

// 對照組：不經過 SearchFilter 的判斷。每個字都出現在這幾欄其中一欄，這筆才算符合
const SEARCHED_FIELDS = ['name', 'nameJp', 'nameEn', 'zone', 'zoneJp', 'zoneEn', 'location', 'locationJp', 'locationEn',
    'description', 'coordinates', 'time', 'level'];
const expected = (term) => {
    const words = term.toLowerCase().split(/\s+/).filter(Boolean);
    return idsOf(items.filter((item) => words.every((word) => SEARCHED_FIELDS.some(
        (field) => item[field] != null && String(item[field]).toLowerCase().includes(word)
    ))));
};

const CORDIA = ['botany_cordia_resin_1', 'botany_cordia_resin_2', 'botany_cordia_log_72_1', 'botany_cordia_log_72_2'];
const CORDIA_LOG = ['botany_cordia_log_72_1', 'botany_cordia_log_72_2'];

test("zoneEn：搜 Yak T'el 找到雅克特爾樹海的 8 筆", () => {
    const yakTel = idsOf(items.filter((item) => item.zoneEn === "Yak T'el"));
    assert.equal(yakTel.length, 8);
    assert.ok(yakTel.every((id) => itemOf(id).zone === '雅克特爾樹海'));

    assert.deepEqual(sorted(find("yak t'el")), sorted(yakTel));
    assert.deepEqual(sorted(find("YAK T'EL")), sorted(yakTel), '大小寫都行');
    // 只搜 zoneEn 裡才有的字，一個字也找得到
    assert.deepEqual(sorted(find("t'el")), sorted(yakTel));
    assert.deepEqual(sorted(find('yak')), sorted(yakTel));
    assert.deepEqual(sorted(find("yak t'el")), sorted(expected("yak t'el")));
});

test('locationEn：搜 Mamook 找到瑪姆克的 6 筆、Leynode 找到雷諾德之火與之風的 6 筆', () => {
    const mamook = idsOf(items.filter((item) => item.location === '瑪姆克'));
    assert.equal(mamook.length, 6);
    assert.deepEqual(sorted(find('mamook')), sorted(mamook));
    assert.deepEqual(sorted(find('MAMOOK')), sorted(mamook), '大小寫都行');

    const leynode = idsOf(items.filter((item) => item.location.startsWith('雷諾德之')));
    assert.equal(leynode.length, 6);
    assert.deepEqual(sorted(find('leynode')), sorted(leynode));
    // 地點的英文名稱和別的欄位的字一起搜：每個字都要符合
    assert.deepEqual(sorted(find('cordia mamook')), sorted(CORDIA));
    assert.deepEqual(sorted(find('mamook')), sorted(expected('mamook')));
});

test('好幾個字時每個字都要符合：Cordia Log 只剩科迪亞原木的兩筆（以前 10 筆）', () => {
    assert.deepEqual(sorted(find('Cordia Log')), CORDIA_LOG);
    assert.deepEqual(sorted(find('log cordia')), CORDIA_LOG, '字的順序不影響結果');
    assert.deepEqual(find('cordia zzz'), [], '有一個字哪一欄都沒有，就一筆都不留');

    // 字可以分散在不同的欄位：名稱＋時間、名稱＋等級、名稱＋英文地區、中文地區＋英文名稱
    assert.deepEqual(sorted(find('cordia 12:00')), ['botany_cordia_log_72_2', 'botany_cordia_resin_2']);
    assert.deepEqual(sorted(find('cordia 110')), ['botany_cordia_resin_1', 'botany_cordia_resin_2']);
    assert.deepEqual(sorted(find('cordia yak')), sorted(CORDIA));
    assert.deepEqual(sorted(find('雅克特爾樹海 log')), CORDIA_LOG);
});

test('每個字都出現在某一欄才算符合：和對照組的判斷逐筆一致（中文、日文、英文、座標、時間、等級、全形空白）', () => {
    const terms = [
        "yak t'el", 'cordia log', 'log cordia', 'cordia', 'log', '  Cordia   LOG  ',
        '科迪亞 原木', '科迪亞　原木', 'コーディア ヤクテル', '雅克特爾樹海 resin', 'cordia ヤクテル 110',
        'x:35.7', 'x:35.7 00:00', '00:00', '12:00 110', '樹 木', '樹 12:00', 'ore yak', '樹 液 塊',
        '110 100', 'cordia zzz', 'zzz'
    ];
    for (const term of terms) {
        assert.deepEqual(sorted(find(term)), sorted(expected(term)), term);
    }
    // 兩邊不是都空的：多數的詞真的找得到東西
    assert.ok(terms.filter((term) => expected(term).length > 0).length > terms.length / 2);
    // 「每個字都要符合」真的擋掉了東西：只要有一個字符合的筆數（以前的結果）比每個字都符合的多
    const eitherWord = (term) => new Set(term.toLowerCase().split(/\s+/).filter(Boolean).flatMap((word) => expected(word))).size;
    for (const term of ['cordia log', '樹 木', '樹 12:00', 'ore yak']) {
        assert.ok(eitherWord(term) > expected(term).length, term);
    }

    // 每一筆資料自己的名稱與地區：不同欄位的兩個字一起搜，一定找得到自己
    for (const item of items) {
        const term = `${item.nameEn.split(/\s+/)[0]} ${item.zoneJp}`;
        assert.ok(find(term).includes(item.id), `${item.id}：${term}`);
        assert.deepEqual(sorted(find(term)), sorted(expected(term)), term);
    }
});

test('中、日、英文名稱搜到同樣的素材：科迪亞、コーディア、cordia', () => {
    for (const term of ['科迪亞', 'コーディア', 'cordia', 'CORDIA']) {
        assert.deepEqual(sorted(find(term)), sorted(CORDIA), term);
    }
});

test('分數照原本的權重：名稱完全符合加倍；有一個字不符合就是 0', () => {
    const filter = new SearchFilter();
    const cordiaLog = itemOf('botany_cordia_log_72_1');
    const score = (...words) => filter.scoreItem(cordiaLog, words);

    assert.equal(score('cordia'), 2);
    assert.equal(score(cordiaLog.name.toLowerCase()), 6);
    assert.equal(score('cordia', 'zzz'), 0);
    assert.equal(score('zzz', 'cordia'), 0);

    // 每一欄的權重
    assert.equal(filter.searchWeights.zoneEn, 1.5);
    assert.equal(filter.searchWeights.locationEn, 1.5);
    assert.equal(score('科迪亞'), 3, 'name 3.0');
    assert.equal(score('原木'), 7, 'name 3.0 ＋ nameJp 3.0 ＋ description 1.0（都不是完全符合，沒有加倍）');
    assert.equal(score(cordiaLog.nameJp), 6, 'nameJp 3.0，完全符合再加 3.0');
    assert.equal(score('コーディア'), 3, 'nameJp 3.0');
    assert.equal(score('cordia log'), 2, 'nameEn 2.0，完全符合也不加倍');
    assert.equal(score('雅克特爾樹海'), 1.5, 'zone 1.5');
    assert.equal(score('ヤクテル'), 1.5, 'zoneJp 1.5');
    assert.equal(score('yak'), 1.5, 'zoneEn 1.5');
    assert.equal(score("t'el"), 1.5, 'zoneEn 1.5，大小寫不拘');
    assert.equal(score('瑪姆克'), 1.5, 'location 1.5');
    assert.equal(score('マムーク'), 1.5, 'locationJp 1.5');
    assert.equal(score('mamook'), 1.5, 'locationEn 1.5');
    assert.equal(score('傳說級'), 1, 'description 1.0');
    assert.equal(score('x:35.7'), 0.5, 'coordinates 0.5');
    assert.equal(score('00:00'), 0.5, 'time 0.5');
    assert.equal(score('100'), 0.5, 'level 0.5');

    // 好幾個字：每個字的分數加起來，和順序無關；沒有字就沒有分數
    assert.equal(score('cordia', 'log'), 4);
    assert.equal(score('cordia', 'yak'), 3.5);
    assert.equal(score('yak', 'cordia'), 3.5);
    assert.equal(score('cordia', 'yak', "t'el", '00:00'), 2 + 1.5 + 1.5 + 0.5);
    assert.equal(score(), 0);
    assert.equal(filter.scoreItem({ name: '科迪亞原木' }, ['科迪亞原木']), 6, '沒有其他欄位的資料也算得出來');
});

test('結果依分數由高到低，同分的保留資料的順序', () => {
    const filter = new SearchFilter();
    for (const term of ['樹', '木', '7.3', '原木 log', '00:00']) {
        const found = Array.from(filter.filterBySearch(items, term));
        const words = SearchFilter.words(term);
        const scores = found.map((item) => filter.scoreItem(item, words));
        assert.ok(found.length > 0, term);
        assert.ok(scores.every((s) => s > 0), `${term}：只留分數大於 0 的`);
        for (let i = 1; i < found.length; i++) {
            assert.ok(scores[i - 1] >= scores[i], `${term}：第 ${i} 筆`);
            if (scores[i - 1] === scores[i]) {
                assert.ok(items.indexOf(found[i - 1]) < items.indexOf(found[i]), `${term}：同分的照資料的順序，第 ${i} 筆`);
            }
        }
    }
    // 上面這幾個詞有不同的分數，也有同分的，排序的檢查才不是空的
    const scoresOf = (term) => Array.from(filter.filterBySearch(items, term), (item) => filter.scoreItem(item, SearchFilter.words(term)));
    assert.ok(new Set(scoresOf('樹')).size >= 3);
    assert.ok(scoresOf('樹').length > new Set(scoresOf('樹')).size);

    // filter() 走同一條路：結果和 filterBySearch() 的一樣
    assert.deepEqual(find('樹'), idsOf(filter.filterBySearch(items, '樹')));
});

test('words：轉小寫、依空白切開、去掉空的', () => {
    const words = (term) => plain(SearchFilter.words(term));
    assert.deepEqual(words('Cordia Log'), ['cordia', 'log']);
    assert.deepEqual(words('  Cordia   LOG \t'), ['cordia', 'log']);
    assert.deepEqual(words("Yak T'el"), ['yak', "t'el"]);
    assert.deepEqual(words('科迪亞　原木'), ['科迪亞', '原木'], '全形空白也切開');
    assert.deepEqual(words('x:35.7'), ['x:35.7']);
    assert.deepEqual(words(''), []);
    assert.deepEqual(words('  \t '), []);
});

test('segments：每個字都標出來，重疊的合併，不分大小寫', () => {
    const segments = (text, words) => plain(SearchFilter.segments(text, words));

    assert.deepEqual(segments('Cordia Resin', ['cordia']), [{ text: 'Cordia', mark: true }, { text: ' Resin', mark: false }]);
    assert.deepEqual(segments('abcabc', ['bc', 'ca']), [{ text: 'a', mark: false }, { text: 'bcabc', mark: true }]);
    assert.deepEqual(segments("Yak T'el", ['yak', "t'el"]), [
        { text: 'Yak', mark: true }, { text: ' ', mark: false }, { text: "T'el", mark: true }
    ]);
    assert.deepEqual(segments('X', []), [{ text: 'X', mark: false }]);
    assert.deepEqual(segments('', ['a']), []);
    assert.deepEqual(segments('', []), []);

    // 同一個字出現好幾次：相鄰的接成一段，隔著別的字元的是兩段
    assert.deepEqual(segments('banana', ['an']), [
        { text: 'b', mark: false }, { text: 'anan', mark: true }, { text: 'a', mark: false }
    ]);
    assert.deepEqual(segments('a-a', ['a']), [
        { text: 'a', mark: true }, { text: '-', mark: false }, { text: 'a', mark: true }
    ]);
    // 自己和自己重疊的出現也都算：'aa' 在 'aaa' 的 0 與 1 各出現一次
    assert.deepEqual(segments('aaa', ['aa']), [{ text: 'aaa', mark: true }]);
    // 兩個字緊貼在一起（相鄰、沒有重疊）也是一段
    assert.deepEqual(segments('科迪亞樹液塊', ['科迪亞', '樹液']), [{ text: '科迪亞樹液', mark: true }, { text: '塊', mark: false }]);
    assert.deepEqual(segments('科迪亞樹液塊', ['科迪', '亞樹', '液']), [{ text: '科迪亞樹液', mark: true }, { text: '塊', mark: false }]);

    // 沒有命中、字是大寫、字是空的：都不會出錯
    assert.deepEqual(segments('Cordia', ['zzz']), [{ text: 'Cordia', mark: false }]);
    assert.deepEqual(segments('Cordia', ['CORDIA']), [{ text: 'Cordia', mark: true }], '傳進來的字不是小寫也行');
    assert.deepEqual(segments('abc', ['']), [{ text: 'abc', mark: false }]);
    assert.deepEqual(segments('abc', ['', 'b']), [
        { text: 'a', mark: false }, { text: 'b', mark: true }, { text: 'c', mark: false }
    ]);
    // 字是原樣比對，不是規則運算式
    assert.deepEqual(segments('a.b (c)', ['.', '(c)']), [
        { text: 'a', mark: false }, { text: '.', mark: true }, { text: 'b ', mark: false }, { text: '(c)', mark: true }
    ]);
    assert.deepEqual(segments('abc'), [{ text: 'abc', mark: false }], '沒有帶 words');
});

test('segments：對真的資料，標出來的字元就是每個字出現的地方，整段接回去還是原字', () => {
    // 逐個位置檢查有沒有字從這裡開始，蓋到的字元就該標起來（不經過 segments 的合併）
    const covered = (text, words) => {
        const lower = text.toLowerCase();
        const marks = Array(text.length).fill(false);
        for (const word of words) {
            for (let start = 0; start + word.length <= lower.length; start++) {
                if (lower.startsWith(word, start)) marks.fill(true, start, start + word.length);
            }
        }
        return marks;
    };
    const wordLists = [
        ['cordia'], ['cordia', 'resin'], ['o', 'r'], ['ra', 'ar', 'a'], ["t'el", 'yak'], ['e', 'l', 't'],
        ['科迪', '迪亞', '亞樹'], ['樹', '液'], ['ク', 'ー'], ['ヤクテル', 'クテ'], ['x', '5', '7'], ['zzz']
    ];
    const markedChars = wordLists.map(() => 0);
    for (const item of items) {
        for (const field of ['name', 'nameJp', 'nameEn', 'zone', 'zoneJp', 'zoneEn', 'location', 'locationJp', 'locationEn', 'coordinates']) {
            const text = item[field];
            // 比對用的小寫字串和原字一樣長，標出來的位置才對得上原字
            assert.equal(text.toLowerCase().length, text.length, `${item.id}.${field}`);
            for (const [index, words] of wordLists.entries()) {
                const result = Array.from(SearchFilter.segments(text, words));
                const where = `${item.id}.${field} ${JSON.stringify(words)}`;
                assert.equal(result.map((s) => s.text).join(''), text, where);
                assert.ok(result.every((s) => s.text.length > 0), `${where}：沒有空的段落`);
                assert.ok(result.every((s, i) => i === 0 || s.mark !== result[i - 1].mark), `${where}：相鄰的段落一標一不標`);
                const marks = result.flatMap((s) => Array(s.text.length).fill(s.mark));
                assert.deepEqual(marks, covered(text, words), where);
                markedChars[index] += marks.filter(Boolean).length;
            }
        }
    }
    // 每一組字在資料裡都真的標到字（只有故意找不到的 ['zzz'] 一個字也沒標）
    assert.deepEqual(markedChars.map((n) => n > 0), wordLists.map((words) => !words.includes('zzz')));
});

test('進階搜尋的 itemContainsTerm 也比對 zoneEn 與 locationEn', () => {
    const filter = new SearchFilter();
    const cordiaLog = itemOf('botany_cordia_log_72_1');
    assert.equal(filter.itemContainsTerm(cordiaLog, "Yak T'el"), true);
    assert.equal(filter.itemContainsTerm(cordiaLog, "yak t'el"), true);
    assert.equal(filter.itemContainsTerm(cordiaLog, 'Mamook'), true);
    assert.equal(filter.itemContainsTerm(cordiaLog, 'zzz'), false);
    assert.equal(filter.itemContainsTerm(cordiaLog, '科迪亞'), true, '原本比對的欄位照舊');

    assert.equal(filter.advancedSearch(items, "yak t'el").length, 8);
    assert.equal(filter.advancedSearch(items, "-t'el").length, items.length - 8);
    assert.deepEqual(sorted(idsOf(filter.advancedSearch(items, 'cordia yak'))), sorted(CORDIA));
    assert.equal(filter.advancedSearch(items, 'mamook').length, 6);
});
