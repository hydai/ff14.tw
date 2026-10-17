/**
 * FF14.tw 天氣預報工具翻譯檔
 */
const WeatherForecastTranslations = {
    zh: {
        // 頁面資訊
        weather_title: '天氣預報 - FF14.tw',
        weather_description: '查看艾歐澤亞各地區的天氣預報，搜尋特定天氣條件，追蹤特殊事件',

        // 頁面標題
        weather_header: '天氣預報',

        // 選擇區
        weather_first_prompt: '想查哪裡的什麼天氣？',
        weather_zone_label: '地區',
        weather_zone_placeholder: '選擇地區',
        weather_zone_hint: '選了地區，這裡會列出那裡會出現的天氣。',
        weather_weather_label: '天氣',

        // 更多條件
        weather_more_conditions: '更多條件：時段、前置天氣',
        weather_more_summary: '· 已設定 {items}',
        weather_more_item_previous: '前置天氣 {count} 個',
        weather_list_separator: '、',
        weather_time_range: '時段（艾歐澤亞時間）',
        weather_previous_weather: '前置天氣（釣魚用）',
        weather_clear_filters: '清除條件',

        // 時間
        weather_time_all: '全天',
        weather_time_custom: '自訂',

        // 還沒選地區
        weather_empty_title: '先選地區和天氣',
        weather_empty_text: '這裡會寫它下次什麼時候出現、還要等多久。下次打開會記得你選的。',

        // 時刻表
        weather_timetable_title: '{zone}的天氣時刻表',
        weather_show_more: '顯示更多',

        // 表格標題
        weather_col_local_time: '本地時間',
        weather_col_eorzea_time: 'ET',
        weather_col_weather: '天氣',
        weather_col_duration: '持續時間',

        // 日期
        weather_day_today: '今天',
        weather_day_tomorrow: '明天',
        weather_day_date: '{month}/{day}',
        weather_day_time: '{day} {time}',

        // 當前時間
        weather_current_et: 'ET',
        weather_current_lt: '本地',

        // 特殊事件
        weather_events: '特殊事件',
        weather_event_garlok: '哥布林首領',
        weather_event_laideronnette: '湖中女妖',

        // 狀態
        weather_current: '目前',
        weather_upcoming: '即將',

        // 分享
        weather_share: '分享連結',
        weather_copied: '已複製到剪貼簿',

        // 天氣類型
        weather_clear_skies: '晴朗',
        weather_fair_skies: '碧空',
        weather_clouds: '陰天',
        weather_fog: '濃霧',
        weather_wind: '微風',
        weather_gales: '強風',
        weather_rain: '小雨',
        weather_showers: '陣雨',
        weather_thunder: '雷雨',
        weather_thunderstorms: '暴風雨',
        weather_dust_storms: '沙塵暴',
        weather_heat_waves: '熱浪',
        weather_snow: '飄雪',
        weather_blizzards: '暴風雪',
        weather_gloom: '薄暗',
        weather_umbral_wind: '靈風',
        weather_umbral_static: '靈電',
        weather_eruptions: '火山灰',
        weather_moon_dust: '月塵',
        weather_astromagnetic_storm: '星磁暴',
        weather_hyperelectricity: '超電磁',
        weather_royal_levin: '皇雷',
        weather_shelf_clouds: '弧狀雲',
        weather_oppression: '悶熱',
        weather_sunshine: '烈日',

        // 訊息
        weather_msg_select_zone: '請先選擇一個地區',
        weather_msg_no_weather: '此地區沒有天氣資料'
    },
    en: {
        // Page info
        weather_title: 'Weather Forecast - FF14.tw',
        weather_description: 'View weather forecasts for Eorzea zones, search for specific conditions, track special events',

        // Page header
        weather_header: 'Weather Forecast',

        // Selection
        weather_first_prompt: 'Which zone and weather are you after?',
        weather_zone_label: 'Zone',
        weather_zone_placeholder: 'Choose a zone',
        weather_zone_hint: 'Pick a zone to see the weather it can have.',
        weather_weather_label: 'Weather',

        // More conditions
        weather_more_conditions: 'More conditions: time of day, previous weather',
        weather_more_summary: '· Set: {items}',
        weather_more_item_previous: 'previous weather: {count}',
        weather_list_separator: ', ',
        weather_time_range: 'Time of day (Eorzea time)',
        weather_previous_weather: 'Previous weather (for fishing)',
        weather_clear_filters: 'Clear conditions',

        // Time
        weather_time_all: 'All Day',
        weather_time_custom: 'Custom',

        // No zone yet
        weather_empty_title: 'Pick a zone and a weather',
        weather_empty_text: 'This is where you\'ll see when it comes next and how long to wait. Your choice is remembered for next time.',

        // Timetable
        weather_timetable_title: 'Weather in {zone}',
        weather_show_more: 'Show More',

        // Table headers
        weather_col_local_time: 'Local Time',
        weather_col_eorzea_time: 'ET',
        weather_col_weather: 'Weather',
        weather_col_duration: 'Duration',

        // Dates
        weather_day_today: 'Today',
        weather_day_tomorrow: 'Tomorrow',
        weather_day_date: '{month}/{day}',
        weather_day_time: '{day} {time}',

        // Current time
        weather_current_et: 'ET',
        weather_current_lt: 'Local',

        // Special events
        weather_events: 'Special Events',
        weather_event_garlok: 'Garlok',
        weather_event_laideronnette: 'Laideronnette',

        // Status
        weather_current: 'Current',
        weather_upcoming: 'Upcoming',

        // Share
        weather_share: 'Share Link',
        weather_copied: 'Copied to clipboard',

        // Weather types
        weather_clear_skies: 'Clear Skies',
        weather_fair_skies: 'Fair Skies',
        weather_clouds: 'Clouds',
        weather_fog: 'Fog',
        weather_wind: 'Wind',
        weather_gales: 'Gales',
        weather_rain: 'Rain',
        weather_showers: 'Showers',
        weather_thunder: 'Thunder',
        weather_thunderstorms: 'Thunderstorms',
        weather_dust_storms: 'Dust Storms',
        weather_heat_waves: 'Heat Waves',
        weather_snow: 'Snow',
        weather_blizzards: 'Blizzards',
        weather_gloom: 'Gloom',
        weather_umbral_wind: 'Umbral Wind',
        weather_umbral_static: 'Umbral Static',
        weather_eruptions: 'Eruptions',
        weather_moon_dust: 'Moon Dust',
        weather_astromagnetic_storm: 'Astromagnetic Storm',
        weather_hyperelectricity: 'Hyperelectricity',
        weather_royal_levin: 'Royal Levin',
        weather_shelf_clouds: 'Shelf Clouds',
        weather_oppression: 'Oppression',
        weather_sunshine: 'Sunshine',

        // Messages
        weather_msg_select_zone: 'Please select a zone first',
        weather_msg_no_weather: 'No weather data for this zone'
    },
    ja: {
        // ページ情報
        weather_title: '天気予報 - FF14.tw',
        weather_description: 'エオルゼア各地域の天気予報を確認、特定の天気条件を検索、特別なイベントを追跡',

        // ページヘッダー
        weather_header: '天気予報',

        // 選択
        weather_first_prompt: 'どのエリアのどの天気を調べますか？',
        weather_zone_label: 'エリア',
        weather_zone_placeholder: 'エリアを選択',
        weather_zone_hint: 'エリアを選ぶと、そこで起きる天気が表示されます。',
        weather_weather_label: '天気',

        // 詳細条件
        weather_more_conditions: '詳細条件：時間帯・前の天気',
        weather_more_summary: '・設定中：{items}',
        weather_more_item_previous: '前の天気 {count} 件',
        weather_list_separator: '、',
        weather_time_range: '時間帯（エオルゼア時間）',
        weather_previous_weather: '前の天気（釣り用）',
        weather_clear_filters: '条件をクリア',

        // 時間
        weather_time_all: '全日',
        weather_time_custom: 'カスタム',

        // エリア未選択
        weather_empty_title: 'エリアと天気を選んでください',
        weather_empty_text: '次にいつ来るか、あとどれくらい待つかがここに表示されます。選んだ内容は次回も覚えています。',

        // 天気予報表
        weather_timetable_title: '{zone}の天気',
        weather_show_more: 'もっと見る',

        // テーブルヘッダー
        weather_col_local_time: 'ローカル時間',
        weather_col_eorzea_time: 'ET',
        weather_col_weather: '天気',
        weather_col_duration: '継続時間',

        // 日付
        weather_day_today: '今日',
        weather_day_tomorrow: '明日',
        weather_day_date: '{month}/{day}',
        weather_day_time: '{day} {time}',

        // 現在時刻
        weather_current_et: 'ET',
        weather_current_lt: 'ローカル',

        // 特別イベント
        weather_events: '特別イベント',
        weather_event_garlok: 'ガーロック',
        weather_event_laideronnette: 'レデロネット',

        // ステータス
        weather_current: '現在',
        weather_upcoming: 'まもなく',

        // シェア
        weather_share: 'リンクをシェア',
        weather_copied: 'クリップボードにコピーしました',

        // 天気タイプ
        weather_clear_skies: '快晴',
        weather_fair_skies: '晴れ',
        weather_clouds: '曇り',
        weather_fog: '霧',
        weather_wind: '風',
        weather_gales: '暴風',
        weather_rain: '雨',
        weather_showers: 'にわか雨',
        weather_thunder: '雷',
        weather_thunderstorms: '雷雨',
        weather_dust_storms: '砂塵',
        weather_heat_waves: '灼熱波',
        weather_snow: '雪',
        weather_blizzards: '吹雪',
        weather_gloom: '妖霧',
        weather_umbral_wind: '霊風',
        weather_umbral_static: '放電',
        weather_eruptions: '噴煙',
        weather_moon_dust: '月砂塵',
        weather_astromagnetic_storm: '星磁嵐',
        weather_hyperelectricity: '超電磁嵐',
        weather_royal_levin: '皇雷',
        weather_shelf_clouds: '弧状雲',
        weather_oppression: '蒸熱',
        weather_sunshine: '陽光',

        // メッセージ
        weather_msg_select_zone: '最初に地域を選択してください',
        weather_msg_no_weather: 'この地域の天気データがありません'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('weather-forecast', WeatherForecastTranslations);
}
