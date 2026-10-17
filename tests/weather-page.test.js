const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createWeatherPage } = require('./helpers/weather-page.js');

// 一段天氣＝8 ET 小時（WeatherCalculator.WEATHER_DURATION_MS，第一個測試核對）
const PERIOD = 1_400_000;
const MINUTE = 60_000;
// 2025-10-09 08:53:20 UTC：科薩馬爾卡是碧空，下一次陣雨在 50 分鐘後
const T0 = 1_760_000_000_000;
const STORAGE_KEY = 'ff14tw_weather_selection';
// 記住的選擇：科薩馬爾卡＋陣雨
const KOZAMAUKA_SHOWERS = {
    [STORAGE_KEY]: JSON.stringify({ zoneId: 'kozamauka', desiredWeathers: ['Showers'], previousWeathers: [], beginHour: 0, endHour: 24 })
};
const SHOWERS = { desiredWeathers: ['Showers'] };

const pad = (n) => String(n).padStart(2, '0');
const hm = (ts) => {
    const date = new Date(ts);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const text = (page, id) => page.$(id).textContent;
const chip = (page, listId, weather) => page.$(listId).querySelector(`[data-weather="${weather}"]`);
const isNow = (page) => page.$('answerCard').classList.contains('is-now');

// 今天／明天／M/D ＋本地 HH:MM（本地日期相減，跟頁面用同一個時區；同 weather-state.test.js）
function dayTime(ts, now, [today, tomorrow] = ['今天', '明天']) {
    const date = new Date(ts);
    const dayNumber = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const offset = (dayNumber(date) - dayNumber(new Date(now))) / 86_400_000;
    const day = offset === 0 ? today : offset === 1 ? tomorrow : `${date.getMonth() + 1}/${date.getDate()}`;
    return `${day} ${hm(ts)}`;
}

// 還要多久：WeatherAnswer.waitParts() 的天、時、分，照翻譯檔的寫法
function waitText(page, ms, lang = 'zh') {
    const { days, hours, minutes } = page.window.WeatherAnswer.waitParts(ms);
    const [d, h, m] = lang === 'en' ? ['d', 'h', 'min'] : ['天', '小時', '分'];
    if (days > 0) return hours > 0 ? `${days} ${d} ${hours} ${h}` : `${days} ${d}`;
    if (hours > 0) return minutes > 0 ? `${hours} ${h} ${minutes} ${m}` : `${hours} ${h}`;
    return `${minutes} ${m}`;
}

// ET 時段，例如 ET 16:00–08:00
function etText(page, start, end) {
    const { from, to } = page.window.WeatherAnswer.etHours(start, end);
    return `ET ${pad(from)}:00–${pad(to)}:00`;
}

// 天氣圖示＋空白＋名稱
function label(page, weather, lang = 'zh') {
    const info = page.window.WeatherZoneData.getWeatherInfo(weather);
    return `${info.icon} ${info[lang]}`;
}

// 對照：WeatherAnswer.occurrences() 在現在這一刻算出的前 limit 次（vm 裡的物件，只讀欄位）
function answers(page, zoneId, filters, limit) {
    return page.window.WeatherAnswer.occurrences(page.window.WeatherZoneData.getZone(zoneId), filters, page.now, limit);
}

// 答案卡：下一次（沒有時段）
function assertNextCard(page, occurrence) {
    assert.equal(isNow(page), false, '不是正在下');
    assert.equal(text(page, 'answerEyebrow'), `下次 ${label(page, occurrence.weather)}`);
    assert.equal(text(page, 'answerWhen'), dayTime(occurrence.start, page.now));
    assert.equal(text(page, 'answerWait'), `還要 ${waitText(page, occurrence.start - page.now)}，到 ${hm(occurrence.end)} 結束`);
    assert.equal(text(page, 'answerMeta'), `${etText(page, occurrence.start, occurrence.end)} · 前一段是 ${label(page, occurrence.previousWeather)}`);
    for (const id of ['answerWhen', 'answerWait', 'answerMeta']) assert.equal(page.$(id).hidden, false, `#${id} 要顯示`);
    assert.equal(page.$('answerExtra').hidden, true);
}

// 答案卡：正在下（綠色）
function assertNowCard(page, occurrence, next) {
    assert.equal(isNow(page), true, '正在下');
    assert.equal(text(page, 'answerEyebrow'), `現在就是 ${label(page, occurrence.weather)}`);
    assert.equal(text(page, 'answerWhen'), `到 ${hm(occurrence.end)}`);
    assert.equal(text(page, 'answerWait'), `還剩 ${waitText(page, occurrence.end - page.now)}`);
    assert.equal(text(page, 'answerMeta'), `${etText(page, occurrence.start, occurrence.end)} · 下一次：${dayTime(next.start, page.now)}`);
    assert.equal(page.$('answerExtra').hidden, true);
}

// 之後幾次：一次一列，三段是日期時間、還要多久、ET 與到幾點
function assertNextList(page, expected) {
    const rows = page.$('nextList').children;
    assert.equal(rows.length, expected.length, '之後幾次的列數');
    rows.forEach((row, i) => {
        const occurrence = expected[i];
        assert.equal(row.tagName, 'LI');
        assert.deepEqual(row.children.map((span) => span.className), ['wx-n-when', 'wx-n-wait', 'wx-n-et']);
        assert.equal(row.children[0].textContent, dayTime(occurrence.start, page.now));
        assert.equal(row.children[1].textContent, `還要 ${waitText(page, occurrence.start - page.now)}`);
        assert.equal(row.children[2].textContent, `${etText(page, occurrence.start, occurrence.end)} · 到 ${hm(occurrence.end)}`);
    });
}

// 答案卡和之後幾次都對得上對照：第一次正在進行就是綠色卡，不然是下一次
function assertAnswer(page, expected) {
    const [first, second] = expected;
    if (first.start <= page.now) assertNowCard(page, first, second);
    else assertNextCard(page, first);
    assertNextList(page, expected.slice(1));
}

test('記住的地區和天氣：一打開就是下次的答案卡', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    assert.equal(page.window.WeatherCalculator.WEATHER_DURATION_MS, PERIOD);
    const zone = page.window.WeatherZoneData.getZone('kozamauka');
    assert.notEqual(page.window.WeatherCalculator.getWeatherForZone(zone, page.now), 'Showers', '現在不是陣雨');
    const expected = answers(page, 'kozamauka', SHOWERS, 11);
    assert.ok(expected[0].start > page.now, '第一次在之後');

    assert.equal(page.$('zoneContent').hidden, false);
    assert.equal(text(page, 'answerEyebrow'), '下次 🌦️ 陣雨');
    assert.match(text(page, 'answerWhen'), /^(今天|明天) \d\d:\d\d$/);
    assert.ok(text(page, 'answerMeta').startsWith('ET '));
    assert.ok(text(page, 'answerMeta').includes('前一段是'));
    assertNextCard(page, expected[0]);
    // 每分鐘換字，不放在 aria-live 裡（不要一直唸）
    for (const id of ['answerCard', 'nextList']) assert.equal(page.$(id).hasAttribute('aria-live'), false);

    assert.equal(page.$('nextSection').hidden, false);
    assert.equal(text(page, 'nextTitle'), '之後幾次');
    assertNextList(page, expected.slice(1, 6));
    assert.equal(page.$('nextMoreBtn').hidden, false);
    page.$('nextMoreBtn').click();
    assertNextList(page, expected.slice(1, 11));
});

test('正在下：綠色卡、到幾點、還剩多久、下一次', () => {
    const page = createWeatherPage({ hash: '#kozamauka', now: T0 });
    const current = page.window.WeatherCalculator.getWeatherForZone(page.window.WeatherZoneData.getZone('kozamauka'), page.now);
    chip(page, 'desiredWeatherTags', current).click();
    const expected = answers(page, 'kozamauka', { desiredWeathers: [current] }, 6);
    assert.ok(expected[0].start <= page.now && page.now < expected[0].end, '第一次正在進行');

    assert.ok(text(page, 'answerEyebrow').startsWith('現在就是'));
    assert.ok(text(page, 'answerWait').startsWith('還剩'));
    assert.ok(text(page, 'answerMeta').includes('下一次：'));
    assertNowCard(page, expected[0], expected[1]);
    assertNextList(page, expected.slice(1));
});

test('時段裁剪：可以拍到幾點、其中哪一段在時段內', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    page.$('timeGrid').children[18].click();
    page.$('timeGrid').children[5].click();
    const expected = answers(page, 'kozamauka', { desiredWeathers: ['Showers'], beginHour: 18, endHour: 6 }, 6);
    const first = expected[0];
    assert.ok(first.start > page.now, '第一次在之後');
    assert.ok(first.end < first.periodEnd, '這一次只有一部分在時段內');

    assert.equal(text(page, 'answerEyebrow'), '下次 🌦️ 陣雨（你選的時段 ET 18:00–06:00）');
    assert.equal(text(page, 'answerWhen'), dayTime(first.start, page.now));
    assert.equal(text(page, 'answerWait'), `還要 ${waitText(page, first.start - page.now)}，可以拍到 ${hm(first.end)}`);
    // 句子中間的天氣只寫名稱，不放圖示
    assert.ok(text(page, 'answerMeta').startsWith('這段陣雨是 '));
    assert.equal(
        text(page, 'answerMeta'),
        `這段陣雨是 ${hm(first.periodStart)}–${hm(first.periodEnd)}（${etText(page, first.periodStart, first.periodEnd)}），` +
        `其中 ${etText(page, first.start, first.end)} 在你選的時段內`
    );
    assert.ok(text(page, 'answerMeta').includes('其中 ET'));
    // 之後幾次也用裁剪後的時間
    assertNextList(page, expected.slice(1));

    // 清除條件：回到不裁剪的答案
    page.$('clearFiltersBtn').click();
    assertAnswer(page, answers(page, 'kozamauka', SHOWERS, 6));
    // 前置天氣：只算前一段是小雨的
    chip(page, 'previousWeatherTags', 'Rain').click();
    const afterRain = answers(page, 'kozamauka', { desiredWeathers: ['Showers'], previousWeathers: ['Rain'] }, 6);
    assertAnswer(page, afterRain);
    assert.ok(text(page, 'answerMeta').endsWith('前一段是 🌧️ 小雨'));
});

test('時段頭尾在同一個時間（先點 8 再點 7 是 8–8）等於全天：答案卡照沒有時段的寫，只選了地區時不多那一行', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    page.$('timeGrid').children[8].click();
    page.$('timeGrid').children[7].click();
    assert.deepEqual([page.app.store.state.beginHour, page.app.store.state.endHour], [8, 8]);
    // 算出來的本來就和全天一樣，只是不能寫成「你選的時段 ET 08:00–08:00」「可以拍到」
    const expected = answers(page, 'kozamauka', { desiredWeathers: ['Showers'], beginHour: 8, endHour: 8 }, 6);
    const span = (list) => list.map((occurrence) => [occurrence.start, occurrence.end]);
    assert.deepEqual(span(expected), span(answers(page, 'kozamauka', SHOWERS, 6)));
    assert.equal(text(page, 'answerEyebrow'), '下次 🌦️ 陣雨');
    assertAnswer(page, expected);

    // 只選了地區：只有這種時段時沒有條件要用上，不多寫一行；還有前置天氣時照樣寫
    page.changeHash('#gridania---8-8');
    assert.equal(text(page, 'answerEyebrow'), '格里達尼亞現在');
    assert.equal(page.$('answerExtra').hidden, true);
    page.changeHash('#gridania--0-8-8');
    assert.equal(text(page, 'answerExtra'), '選了天氣，時段和前置天氣才會用上。');
});

test('答案卡的第一行是 h2：用標題跳著讀的人不會跳過答案卡，外觀照原本的段落', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    const eyebrow = page.$('answerEyebrow');
    assert.equal(eyebrow.tagName, 'H2');
    assert.equal(eyebrow.className, 'wx-eyebrow');
    assert.equal(page.$('answerCard').children[0], eyebrow);
    // 頁面的 h1 是隱藏的：接著依序是答案卡、之後幾次、時刻表三個 h2
    assert.deepEqual(page.document.querySelectorAll('h2').map((heading) => heading.id), ['answerEyebrow', 'nextTitle', 'timetableTitle']);
    // common.css 給 h2 的下邊距與行高拿掉：卡片裡的間距照 .wx-answer 的 gap，行高照一般段落
    const css = fs.readFileSync(path.join(__dirname, '../tools/weather-forecast/style.css'), 'utf8');
    const rule = css.match(/\n\.wx-eyebrow \{([^}]*)\}/)[1];
    assert.match(rule, /margin-bottom:\s*0;/);
    assert.match(rule, /line-height:\s*var\(--leading-normal\);/);
});

test('不是這個地區的天氣：60 天內沒有符合的時段', () => {
    const page = createWeatherPage({ hash: '#limsa-lominsa-12', now: T0 });
    assert.deepEqual([...page.app.store.state.desiredWeathers], ['Snow']);
    assert.equal(text(page, 'answerEyebrow'), '60 天內沒有符合的時段');
    assert.equal(text(page, 'answerMeta'), '試試放寬條件。');
    for (const id of ['answerWhen', 'answerWait', 'answerExtra']) {
        assert.equal(text(page, id), '', `#${id} 是空的`);
        assert.equal(page.$(id).hidden, true, `#${id} 要隱藏`);
    }
    assert.equal(isNow(page), false);
    assert.equal(page.$('nextSection').hidden, true);
    // 時刻表照樣在
    assert.equal(page.$('resultsBody').children.length, 24);
});

test('只選了地區：現在的天氣與提示；有時段沒天氣時多一行', () => {
    const calcOf = (page) => page.window.WeatherCalculator;
    // 找一個現在的天氣下一期還是同一種的時候：還剩多久要算到真的換天氣為止
    const probe = createWeatherPage({ now: T0 });
    const gridania = probe.window.WeatherZoneData.getZone('gridania');
    const weatherAt = (time) => calcOf(probe).getWeatherForZone(gridania, time);
    let now = T0;
    while (weatherAt(now) !== weatherAt(now + PERIOD)) now += PERIOD;
    const current = weatherAt(now);
    let end = calcOf(probe).getWeatherPeriodStart(now) + PERIOD;
    while (weatherAt(end) === current) end += PERIOD;

    const page = createWeatherPage({ hash: '#gridania', now });
    assert.equal(text(page, 'answerEyebrow'), '格里達尼亞現在');
    assert.equal(text(page, 'answerWhen'), label(page, current));
    assert.equal(text(page, 'answerWait'), `還剩 ${waitText(page, end - page.now)}，到 ${hm(end)}`);
    assert.equal(text(page, 'answerMeta'), '選一個天氣，這裡會寫它下次什麼時候出現。');
    assert.equal(page.$('answerExtra').hidden, true);
    assert.equal(isNow(page), false, '只選了地區時是一般樣式');
    assert.equal(page.$('nextSection').hidden, true);

    // 有時段和前置天氣、沒選天氣：多一行說明
    page.changeHash('#gridania--0-8-16');
    assert.equal(text(page, 'answerEyebrow'), '格里達尼亞現在');
    assert.equal(page.$('answerExtra').hidden, false);
    assert.equal(text(page, 'answerExtra'), '選了天氣，時段和前置天氣才會用上。');
    assert.equal(page.$('nextSection').hidden, true);
    // 清除條件之後那一行收起
    page.$('clearFiltersBtn').click();
    assert.equal(page.$('answerExtra').hidden, true);
    assert.equal(text(page, 'answerExtra'), '');
});

test('只有特殊事件：事件就是目標', () => {
    const page = createWeatherPage({ hash: '#eastern-la-noscea---0-24-garlok', now: T0 });
    const expected = answers(page, 'eastern-la-noscea', { event: 'garlok' }, 6);
    const first = expected[0];
    assert.ok(first.start > page.now, '第一次在之後');

    assert.ok(text(page, 'answerEyebrow').includes('哥布林首領'));
    assert.equal(text(page, 'answerEyebrow'), '下次符合 哥布林首領 的條件');
    assert.equal(text(page, 'answerWhen'), dayTime(first.start, page.now));
    assert.equal(text(page, 'answerWait'), `還要 ${waitText(page, first.start - page.now)}，到 ${hm(first.end)} 結束`);
    assert.equal(text(page, 'answerMeta'), `${etText(page, first.start, first.end)} · 前一段是 ${label(page, first.previousWeather)}`);
    assert.equal(page.$('nextSection').hidden, false);
    assertNextList(page, expected.slice(1));

    page.tick(first.start - page.now);
    assert.equal(isNow(page), true);
    assert.equal(text(page, 'answerEyebrow'), '現在符合 哥布林首領 的條件');
});

test('分鐘一變就更新等待時間，答案卡不重建', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    const ids = ['answerCard', 'answerEyebrow', 'answerWhen', 'answerWait', 'answerMeta', 'answerExtra'];
    const elements = ids.map((id) => page.$(id));
    const firstRow = page.$('nextList').children[0];
    const waitBefore = text(page, 'answerWait');
    const rowWaitBefore = firstRow.children[1].textContent;

    page.tick(MINUTE);
    assert.notEqual(text(page, 'answerWait'), waitBefore);
    assert.notEqual(firstRow.children[1].textContent, rowWaitBefore);
    assertAnswer(page, answers(page, 'kozamauka', SHOWERS, 6));
    // 同一張卡片、同樣的幾段文字；之後幾次的列也沿用，只換字
    ids.forEach((id, i) => assert.equal(page.$(id), elements[i], `#${id} 是同一個元素`));
    assert.ok(elements[0].contains(elements[1]));
    assert.equal(page.$('nextList').children[0], firstRow);
});

test('等到那一段開始：卡片變成正在下；結束後換成下一次', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    const [first, second, third] = answers(page, 'kozamauka', SHOWERS, 3);
    assert.ok(first.start > page.now);

    page.tick(first.start - page.now);
    assertNowCard(page, first, second);
    assertNextList(page, answers(page, 'kozamauka', SHOWERS, 6).slice(1));

    page.tick(first.end - page.now);
    assert.equal(isNow(page), false);
    assert.equal(text(page, 'answerWhen'), dayTime(second.start, page.now));
    assertNextCard(page, second);
    assertNextList(page, answers(page, 'kozamauka', SHOWERS, 6).slice(1));
    assert.equal(page.$('nextList').children[0].children[0].textContent, dayTime(third.start, page.now));
});

test('電腦睡著好幾期之後醒來，答案直接是現在的', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    page.tick(10 * PERIOD);
    assertAnswer(page, answers(page, 'kozamauka', SHOWERS, 6));
});

test('設了時段：答案卡上那一次在一分鐘中間開始或結束，那一秒就換，不等到下一分鐘', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    // ET 18–22：陣雨那一期（ET 16–24）裁剪後頭尾都在期中。艾歐澤亞的整點每 175 秒一個，不是新的一期，也多半不在整分鐘上
    page.$('timeGrid').children[18].click();
    page.$('timeGrid').children[21].click();
    const list = answers(page, 'kozamauka', { desiredWeathers: ['Showers'], beginHour: 18, endHour: 22 }, 20);
    const i = list.findIndex((o) => o.start - 1000 > page.now && o.start % MINUTE >= 1000 && o.end % MINUTE >= 1000);
    assert.ok(i >= 0, '測試資料裡要有頭尾都不在整分鐘上的一次');
    const [clipped, after] = list.slice(i, i + 2);
    assert.ok(clipped.start > clipped.periodStart && clipped.end < clipped.periodEnd, '頭尾都在期中');

    page.tick(clipped.start - 1000 - page.now);
    assert.equal(isNow(page), false);
    assert.equal(text(page, 'answerWhen'), dayTime(clipped.start, page.now));
    page.tick(1000); // 同一分鐘、同一期
    assertNowCard(page, clipped, after);

    page.tick(clipped.end - 1000 - page.now);
    assert.equal(isNow(page), true);
    page.tick(1000);
    assert.equal(isNow(page), false);
    assert.equal(text(page, 'answerWhen'), dayTime(after.start, page.now));
});

test('切換語言：答案卡換成英文', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    page.setLang('en');
    const [first, second] = answers(page, 'kozamauka', SHOWERS, 2);
    assert.ok(text(page, 'answerEyebrow').startsWith('Next '));
    assert.equal(text(page, 'answerEyebrow'), 'Next 🌦️ Showers');
    assert.equal(text(page, 'answerWhen'), dayTime(first.start, page.now, ['Today', 'Tomorrow']));
    assert.ok(text(page, 'answerWait').startsWith('In '));
    assert.equal(text(page, 'answerWait'), `In ${waitText(page, first.start - page.now, 'en')}, until ${hm(first.end)}`);
    assert.equal(text(page, 'answerMeta'), `${etText(page, first.start, first.end)} · after ${label(page, first.previousWeather, 'en')}`);
    assert.equal(text(page, 'nextTitle'), 'Coming up');
    const row = page.$('nextList').children[0].children;
    assert.equal(row[0].textContent, dayTime(second.start, page.now, ['Today', 'Tomorrow']));
    assert.equal(row[1].textContent, `in ${waitText(page, second.start - page.now, 'en')}`);
    assert.equal(row[2].textContent, `${etText(page, second.start, second.end)} · until ${hm(second.end)}`);

    page.setLang('ja');
    assert.equal(text(page, 'answerEyebrow'), '次の🌦️ にわか雨');
    assert.equal(text(page, 'nextTitle'), 'この後');
});

test('「顯示更多」：之後幾次加倍到 50，換期保留，換目標或地區回到 5', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    const more = page.$('nextMoreBtn');
    const count = () => page.$('nextList').children.length;
    // 和時刻表的「顯示更多」一樣是輪廓按鈕：這一頁的主要按鈕留給提醒
    assert.equal(more.className, 'btn btn-outline btn-block');

    more.click();
    assert.equal(count(), 10);
    page.tick(PERIOD);
    assertNextList(page, answers(page, 'kozamauka', SHOWERS, 11).slice(1));
    page.setLang('en');
    page.setLang('zh');
    assert.equal(count(), 10, '換語言保留');

    // 多選一種天氣（目標改了）：回到 5；答案寫的是這一次實際的天氣
    chip(page, 'desiredWeatherTags', 'Rain').click();
    const both = answers(page, 'kozamauka', { desiredWeathers: ['Showers', 'Rain'] }, 6);
    assert.equal(both[0].weather, 'Rain');
    assert.equal(text(page, 'answerEyebrow'), '下次 🌧️ 小雨');
    assertAnswer(page, both);
    assert.equal(count(), 5);

    // 每次加倍，最多 50 次，到了就藏起按鈕
    for (const expected of [10, 20, 40, 50]) {
        more.click();
        assert.equal(count(), expected);
    }
    assert.equal(more.hidden, true);
    assertNextList(page, answers(page, 'kozamauka', { desiredWeathers: ['Showers', 'Rain'] }, 51).slice(1));

    // 換地區：還沒選天氣，之後幾次藏起來；選了天氣從 5 開始
    page.selectZone('uldah');
    assert.equal(page.$('nextSection').hidden, true);
    chip(page, 'desiredWeatherTags', 'Rain').click();
    assert.equal(page.$('nextSection').hidden, false);
    assert.equal(count(), 5);
    assert.equal(more.hidden, false);
});

test('經過第一次來的畫面再回到同樣的選擇：之後幾次回到 5，和時刻表回到 24 一樣', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    const hash = page.window.location.hash;
    assert.equal(hash, '#kozamauka-7--0-24');
    page.$('nextMoreBtn').click();
    page.$('showMoreBtn').click();
    assert.equal(page.$('nextList').children.length, 10);
    assert.equal(page.$('resultsBody').children.length, 48);

    page.changeHash('#unknown-zone');
    assert.equal(page.$('zoneContent').hidden, true, '第一次來的畫面');
    page.changeHash(hash);
    assert.equal(page.$('resultsBody').children.length, 24);
    assertNextList(page, answers(page, 'kozamauka', SHOWERS, 6).slice(1));
    assert.equal(page.$('nextMoreBtn').hidden, false);
});

test('過了午夜：時刻表、答案卡與之後幾次的今天／明天跟著換', () => {
    // 本地 23:59，而且在一段天氣的中間（之後 3 分鐘內不換期）：時刻表重畫只能靠「日期變了」
    let now = null;
    for (let day = 0; day < 30 && now === null; day += 1) {
        const candidate = new Date(2026, 9, 18 + day, 23, 59, 0).getTime();
        const periodStart = Math.floor(candidate / PERIOD) * PERIOD;
        if (candidate - periodStart >= MINUTE && periodStart + PERIOD - candidate >= 3 * MINUTE) now = candidate;
    }
    assert.ok(now, '找得到本地 23:59 在一段天氣中間的日子');
    const page = createWeatherPage({ now, stored: KOZAMAUKA_SHOWERS });
    const calc = page.window.WeatherCalculator;
    const periodStart = calc.getWeatherPeriodStart(now);
    const timetable = () => page.$('resultsBody').children.map((row) => row.children[0].textContent);
    const before = timetable();
    assert.ok(before.some((day) => day.startsWith('明天')), '時刻表有明天的列');

    page.tick(2 * MINUTE);
    assert.equal(new Date(page.now).getHours(), 0, '過了午夜');
    assert.equal(calc.getWeatherPeriodStart(page.now), periodStart, '還在同一期');
    const after = timetable();
    after.forEach((day, i) => assert.equal(day, dayTime(periodStart + i * PERIOD, page.now)));
    assert.notDeepEqual(after, before);
    assertAnswer(page, answers(page, 'kozamauka', SHOWERS, 6));
});

test('「顯示更多」到了上限：焦點移到那一段的標題', () => {
    const page = createWeatherPage({ now: T0, stored: KOZAMAUKA_SHOWERS });
    // 之後幾次 5 → 10 → 20 → 40 → 50；時刻表 24 → 48 → 96 → 192 → 200
    for (const [buttonId, headingId] of [['nextMoreBtn', 'nextTitle'], ['showMoreBtn', 'timetableTitle']]) {
        const button = page.$(buttonId);
        const heading = page.$(headingId);
        // 頁面從隱藏的 h1 直接接這兩個 h2；標題可以用程式給焦點，但不在 Tab 順序裡
        assert.equal(heading.tagName, 'H2');
        assert.equal(heading.getAttribute('tabindex'), '-1');
        // 記下標題收到的 focus() 選項：用滑鼠點的人按鈕也會拿到焦點，焦點移到標題時畫面不能跟著捲上去
        const focusOptions = [];
        const focus = heading.focus;
        heading.focus = function (options) {
            focusOptions.push(options);
            return focus.call(this, options);
        };
        button.focus();
        for (let click = 1; click <= 3; click += 1) {
            button.click();
            assert.equal(button.hidden, false);
            assert.equal(page.document.activeElement, button, `第 ${click} 次：還沒到上限，焦點留在按鈕上`);
        }
        button.click();
        assert.equal(button.hidden, true);
        assert.equal(page.document.activeElement, heading, `#${buttonId} 藏起來後焦點在 #${headingId}`);
        assert.equal(focusOptions.length, 1);
        assert.equal(focusOptions[0]?.preventScroll, true, `#${headingId} 拿到焦點時不捲動畫面`);
    }
});

test('等待時間：分、小時、小時加分、天、天加小時', () => {
    const page = createWeatherPage({ now: T0 });
    const cases = [
        [30 * MINUTE, '30 分', '30 min', '30分'],
        [60 * MINUTE, '1 小時', '1 h', '1時間'],
        [61 * MINUTE, '1 小時 1 分', '1 h 1 min', '1時間1分'],
        [24 * 60 * MINUTE, '1 天', '1 d', '1日'],
        [26 * 60 * MINUTE, '1 天 2 小時', '1 d 2 h', '1日2時間']
    ];
    ['zh', 'en', 'ja'].forEach((lang, column) => {
        page.setLang(lang);
        for (const [ms, ...expected] of cases) assert.equal(page.app.formatWait(ms), expected[column], `${lang} ${ms}`);
    });
});

test('用 hidden 切換的答案卡元素在 style.css 都有 display: none', () => {
    // fake-dom 看不出「設了 hidden 卻沒藏起來」：.card、.btn 等共用樣式設了 display，會蓋過瀏覽器內建的 [hidden]
    const css = fs.readFileSync(path.join(__dirname, '../tools/weather-forecast/style.css'), 'utf8');
    for (const id of ['answerWhen', 'answerWait', 'answerMeta', 'answerExtra', 'nextSection', 'nextMoreBtn']) {
        assert.match(css, new RegExp(`#${id}\\[hidden\\][^{]*\\{\\s*display:\\s*none;`), `style.css 要有 #${id}[hidden] { display: none; }`);
    }
});
