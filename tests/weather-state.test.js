const test = require('node:test');
const assert = require('node:assert/strict');

const { createWeatherPage } = require('./helpers/weather-page.js');

// 一段天氣＝8 ET 小時（WeatherCalculator.WEATHER_DURATION_MS，第一個測試核對）
const PERIOD = 1_400_000;
const STORAGE_KEY = 'ff14tw_weather_selection';

const pad = (n) => String(n).padStart(2, '0');
const rows = (page) => page.$('resultsBody').children;
const chips = (page, id) => page.$(id).querySelectorAll('.weather-tag');
const activeWeathers = (page, id) => chips(page, id).filter((tag) => tag.classList.contains('active')).map((tag) => tag.dataset.weather);

// 時刻表第一欄的期望值：今天／明天／M/D ＋本地 HH:MM（本地日期相減，跟頁面用同一個時區）
function dayTime(ts, now) {
    const date = new Date(ts);
    const today = new Date(now);
    const dayNumber = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const offset = (dayNumber(date) - dayNumber(today)) / 86_400_000;
    const day = offset === 0 ? '今天' : offset === 1 ? '明天' : `${date.getMonth() + 1}/${date.getDate()}`;
    return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 時刻表每一列都對得上計算機：從目前這一段起，每 8 ET 小時一列，不套任何條件
function assertTimetable(page, zoneId, count) {
    const calc = page.window.WeatherCalculator;
    const zones = page.window.WeatherZoneData;
    const periodStart = calc.getWeatherPeriodStart(page.now);
    assert.equal(rows(page).length, count);
    rows(page).forEach((row, i) => {
        const start = periodStart + i * PERIOD;
        const info = zones.getWeatherInfo(calc.getWeatherForZone(zones.getZone(zoneId), start));
        assert.equal(row.children.length, 3, '三欄：本地時間、ET、天氣');
        assert.equal(row.children[0].textContent, dayTime(start, page.now));
        assert.equal(row.children[1].textContent, `${pad(calc.getEorzeaTime(start).hours)}:00`);
        assert.equal(row.children[2].textContent, `${info.icon}${info.zh}`);
        assert.equal(row.classList.contains('current-weather'), i === 0, '只有目前這一段標出來');
    });
}

// 第一次來：只有地區選單與說明，其他都藏起來
function assertFirstVisit(page) {
    for (const id of ['firstVisitPrompt', 'zoneHint', 'noZoneSelected']) assert.equal(page.$(id).hidden, false, `#${id} 要顯示`);
    for (const id of ['weatherField', 'moreConditions', 'shareBtn', 'zoneContent']) assert.equal(page.$(id).hidden, true, `#${id} 要隱藏`);
    assert.equal(page.$('zoneSelect').value, '');
}

function assertZoneShown(page) {
    for (const id of ['firstVisitPrompt', 'zoneHint', 'noZoneSelected']) assert.equal(page.$(id).hidden, true, `#${id} 要隱藏`);
    for (const id of ['weatherField', 'moreConditions', 'shareBtn', 'zoneContent']) assert.equal(page.$(id).hidden, false, `#${id} 要顯示`);
}

test('分享網址與 hash 導覽：地區、條件、時刻表一致', () => {
    const page = createWeatherPage({ hash: '#limsa-lominsa' });
    assert.equal(page.window.WeatherCalculator.WEATHER_DURATION_MS, PERIOD);
    assert.equal(page.$('zoneSelect').value, 'limsa-lominsa');
    assert.equal(page.$('timetableTitle').textContent, '利姆薩·羅敏薩的天氣時刻表');
    assertTimetable(page, 'limsa-lominsa', 24);

    // 時段只點了第一格（選到一半）就換 hash
    page.$('timeGrid').children[3].click();
    page.changeHash('#gridania-6--8-16');
    assert.equal(page.$('zoneSelect').value, 'gridania');
    assert.equal(page.$('timetableTitle').textContent, '格里達尼亞的天氣時刻表');
    assert.equal(page.$('timeRangeText').textContent, '08:00 - 16:00');
    assert.deepEqual(activeWeathers(page, 'desiredWeatherTags'), ['Rain']);
    for (const tag of chips(page, 'desiredWeatherTags')) assert.equal(tag.getAttribute('aria-pressed'), String(tag.dataset.weather === 'Rain'));
    assert.deepEqual(activeWeathers(page, 'previousWeatherTags'), []);
    for (const [hour, cell] of page.$('timeGrid').children.entries()) {
        assert.equal(cell.classList.contains('in-range'), hour >= 8 && hour < 16);
        assert.equal(cell.classList.contains('selected'), false, '選到一半的預覽清掉');
    }
    assert.equal(page.$('moreSummary').textContent, '· 已設定 ET 08:00–16:00');
    assert.equal(page.$('moreConditions').hasAttribute('open'), false, '有條件也不會自己打開');
    // 選到一半的狀態清掉：再點一格只是開始新的選取，時段不變
    page.$('timeGrid').children[20].click();
    assert.equal(page.$('timeRangeText').textContent, '08:00 - 16:00');
    assert.equal(page.window.location.hash, '#gridania-6--8-16');
    // 時刻表不套條件：第一列是目前這一段，每一列都照實際的天氣
    assertTimetable(page, 'gridania', 24);
});

test('hash 變成無效或空的：回到第一次來的畫面，之後有效的 hash 照常還原', () => {
    const page = createWeatherPage({ hash: '#gridania-6--8-16' });
    for (const hash of ['#unknown-zone', '']) {
        page.changeHash(hash);
        assertFirstVisit(page);
        page.changeHash('#uldah');
        assertZoneShown(page);
        assert.equal(page.$('zoneSelect').value, 'uldah');
        assert.equal(page.$('timetableTitle').textContent, '烏爾達哈的天氣時刻表');
        assert.deepEqual(activeWeathers(page, 'desiredWeatherTags'), []);
        assert.equal(page.$('timeRangeText').textContent, '00:00 - 24:00');
        assert.equal(page.$('moreSummary').textContent, '');
        assertTimetable(page, 'uldah', 24);
    }
});

test('停留在頁面上，天氣換期後時刻表自動往前推一期，同一期內不重畫', () => {
    const page = createWeatherPage({ hash: '#limsa-lominsa', now: PERIOD * 1_257_143 + PERIOD / 2 });
    const times = () => rows(page).map((row) => row.children[0].textContent);
    const before = times();
    const firstRow = rows(page)[0];
    page.tick(1_000);
    assert.equal(rows(page)[0], firstRow);
    page.tick(PERIOD);
    assert.equal(times()[0], before[1]);
    assert.ok(rows(page)[0].classList.contains('current-weather'));
    const rowAfterChange = rows(page)[0];
    page.tick(1_000);
    assert.equal(rows(page)[0], rowAfterChange);
});

test('「顯示更多」展開的列數在換期後保留，換地區時回到 24', () => {
    const page = createWeatherPage({ hash: '#limsa-lominsa' });
    const more = page.$('showMoreBtn');
    assert.equal(more.hidden, false);
    more.click();
    assertTimetable(page, 'limsa-lominsa', 48);
    page.tick(PERIOD);
    assertTimetable(page, 'limsa-lominsa', 48);
    // 時刻表不套條件：選天氣、設前置天氣不會收回去
    chips(page, 'desiredWeatherTags')[0].click();
    chips(page, 'previousWeatherTags')[0].click();
    assert.equal(rows(page).length, 48);
    // 每次加倍，最多 200 列，到了就藏起按鈕
    for (const expected of [96, 192, 200]) {
        more.click();
        assert.equal(rows(page).length, expected);
    }
    assert.equal(more.hidden, true);
    page.selectZone('uldah');
    assertTimetable(page, 'uldah', 24);
    assert.equal(more.hidden, false);
});

test('電腦睡著好幾期之後醒來，時刻表第一列直接是現在這一段', () => {
    const page = createWeatherPage({ hash: '#limsa-lominsa' });
    page.tick(10 * PERIOD);
    assertTimetable(page, 'limsa-lominsa', 24);
});

test('第一次來：只有地區選單與說明', () => {
    const page = createWeatherPage();
    assertFirstVisit(page);
    const select = page.$('zoneSelect');
    const groups = select.querySelectorAll('optgroup');
    assert.equal(groups.length, 14);
    assert.equal(groups[0].getAttribute('label'), '拉諾西亞');
    const options = select.querySelectorAll('option');
    assert.equal(options.filter((option) => option.getAttribute('value')).length, 73);
    // 第一個選項是「選擇地區」：不能選、也不列在下拉清單裡
    const placeholder = options[0];
    assert.equal(placeholder.getAttribute('value'), '');
    assert.equal(placeholder.textContent, '選擇地區');
    assert.equal(placeholder.disabled, true);
    assert.equal(placeholder.hidden, true);
    assert.equal(groups[0].querySelector('option').getAttribute('value'), 'limsa-lominsa');
    assert.equal(groups[0].querySelector('option').textContent, '利姆薩·羅敏薩');
    assert.equal(page.$('moreConditions').hasAttribute('open'), false);
    assert.equal(page.storage.has(STORAGE_KEY), false);
});

test('選地區：天氣只列這個地區會出現的，記憶寫入', () => {
    const page = createWeatherPage();
    page.selectZone('kozamauka');
    assertZoneShown(page);
    assert.equal(page.$('zoneSelect').value, 'kozamauka');
    assert.equal(page.window.location.hash, '#kozamauka');
    const expected = ['Rain', 'Showers', 'Fog', 'Clouds', 'Fair Skies', 'Clear Skies'];
    for (const id of ['desiredWeatherTags', 'previousWeatherTags']) {
        assert.deepEqual(chips(page, id).map((tag) => tag.dataset.weather), expected);
        for (const tag of chips(page, id)) {
            assert.equal(tag.tagName, 'BUTTON');
            assert.equal(tag.className, 'chip weather-tag');
            assert.equal(tag.getAttribute('aria-pressed'), 'false');
        }
    }
    assert.equal(chips(page, 'desiredWeatherTags')[1].textContent, '🌦️陣雨');
    assert.equal(page.$('timetableTitle').textContent, '科薩馬爾卡的天氣時刻表');
    assert.equal(JSON.parse(page.storage.get(STORAGE_KEY)).zoneId, 'kozamauka');

    chips(page, 'desiredWeatherTags')[1].click();
    assert.deepEqual(activeWeathers(page, 'desiredWeatherTags'), ['Showers']);
    assert.equal(chips(page, 'desiredWeatherTags')[1].getAttribute('aria-pressed'), 'true');
    assert.deepEqual(JSON.parse(page.storage.get(STORAGE_KEY)).desiredWeathers, ['Showers']);

    // 時段點兩格選範圍，可以跨午夜
    page.$('timeGrid').children[18].click();
    page.$('timeGrid').children[5].click();
    assert.equal(page.$('timeRangeText').textContent, '18:00 - 06:00');
    assert.equal(page.$('moreSummary').textContent, '· 已設定 ET 18:00–06:00');
    const saved = JSON.parse(page.storage.get(STORAGE_KEY));
    assert.equal(saved.beginHour, 18);
    assert.equal(saved.endHour, 6);
});

test('清除條件只清時段與前置天氣', () => {
    const page = createWeatherPage({ hash: '#gridania-6-0-8-16' });
    assert.deepEqual(activeWeathers(page, 'previousWeatherTags'), ['Clear Skies']);
    assert.equal(page.$('moreSummary').textContent, '· 已設定 ET 08:00–16:00、前置天氣 1 個');
    page.$('clearFiltersBtn').click();
    assert.deepEqual(activeWeathers(page, 'desiredWeatherTags'), ['Rain']);
    assert.deepEqual(activeWeathers(page, 'previousWeatherTags'), []);
    for (const cell of page.$('timeGrid').children) assert.equal(cell.classList.contains('in-range'), false);
    assert.equal(page.$('timeRangeText').textContent, '00:00 - 24:00');
    assert.equal(page.$('moreSummary').textContent, '');
    assert.equal(page.window.location.hash, '#gridania-6--0-24');
    const saved = JSON.parse(page.storage.get(STORAGE_KEY));
    assert.deepEqual([saved.desiredWeathers, saved.previousWeathers, saved.beginHour, saved.endHour], [['Rain'], [], 0, 24]);
});

test('時段頭尾在同一個時間（先點 8 再點 7 是 8–8）等於全天：摘要不寫時段、格子不標', () => {
    const page = createWeatherPage({ hash: '#gridania-6' });
    page.$('timeGrid').children[8].click();
    page.$('timeGrid').children[7].click();
    assert.deepEqual([page.app.store.state.beginHour, page.app.store.state.endHour], [8, 8]);
    // WeatherCalculator.isInTimeRange() 把頭尾相同當成一整天，所以不能寫成「ET 08:00–08:00」這種時段
    assert.equal(page.window.WeatherCalculator.isInTimeRange(3, 8, 8), true);
    assert.equal(page.$('timeRangeText').textContent, '08:00 - 08:00');
    assert.equal(page.$('moreSummary').textContent, '');
    for (const cell of page.$('timeGrid').children) assert.equal(cell.classList.contains('in-range'), false, '全天不標格子');

    // 還有前置天氣時，摘要只寫前置天氣
    chips(page, 'previousWeatherTags')[0].click();
    assert.equal(page.$('moreSummary').textContent, '· 已設定 前置天氣 1 個');

    // 分享連結帶來的也一樣
    page.changeHash('#gridania-6--20-20');
    assert.deepEqual([page.app.store.state.beginHour, page.app.store.state.endHour], [20, 20]);
    assert.equal(page.$('moreSummary').textContent, '');
});

test('切換語言：選單與標題換字，選取不變', () => {
    const page = createWeatherPage({ hash: '#gridania-6-0-8-16' });
    page.setLang('en');
    const select = page.$('zoneSelect');
    assert.equal(select.value, 'gridania');
    assert.equal(select.querySelector('option[value="gridania"]').textContent, 'Gridania');
    assert.equal(select.querySelector('option').textContent, 'Choose a zone');
    assert.equal(select.querySelector('optgroup').getAttribute('label'), 'La Noscea');
    assert.equal(page.$('timetableTitle').textContent, 'Weather in Gridania');
    assert.equal(page.$('moreSummary').textContent, '· Set: ET 08:00–16:00, previous weather: 1');
    assert.equal(chips(page, 'desiredWeatherTags')[0].textContent, '🌧️Rain');
    assert.deepEqual(activeWeathers(page, 'desiredWeatherTags'), ['Rain']);
    const first = rows(page)[0].children;
    assert.match(first[0].textContent, /^(Today|\d+\/\d+) \d\d:\d\d$/);
    assert.ok(first[2].textContent.endsWith(page.window.WeatherZoneData.getWeatherInfo(
        page.window.WeatherCalculator.getWeatherForZone(page.window.WeatherZoneData.getZone('gridania'), page.now)).en));
});
