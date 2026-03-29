/**
 * FF14 Weather Forecast - Zone Data
 * Contains all 78 zones with weather tables for weather calculation
 */

const WeatherZoneData = {
    // Weather types with icons
    weatherTypes: {
        'Clear Skies': { icon: '☀️', zh: '晴朗', en: 'Clear Skies', ja: '快晴' },
        'Fair Skies': { icon: '🌤️', zh: '碧空', en: 'Fair Skies', ja: '晴れ' },
        'Clouds': { icon: '☁️', zh: '陰天', en: 'Clouds', ja: '曇り' },
        'Fog': { icon: '🌫️', zh: '濃霧', en: 'Fog', ja: '霧' },
        'Wind': { icon: '💨', zh: '微風', en: 'Wind', ja: '風' },
        'Gales': { icon: '🌬️', zh: '強風', en: 'Gales', ja: '暴風' },
        'Rain': { icon: '🌧️', zh: '小雨', en: 'Rain', ja: '雨' },
        'Showers': { icon: '🌦️', zh: '陣雨', en: 'Showers', ja: 'にわか雨' },
        'Thunder': { icon: '⛈️', zh: '雷雨', en: 'Thunder', ja: '雷' },
        'Thunderstorms': { icon: '🌩️', zh: '暴風雨', en: 'Thunderstorms', ja: '雷雨' },
        'Dust Storms': { icon: '🏜️', zh: '沙塵暴', en: 'Dust Storms', ja: '砂塵' },
        'Heat Waves': { icon: '🔥', zh: '熱浪', en: 'Heat Waves', ja: '灼熱波' },
        'Snow': { icon: '❄️', zh: '飄雪', en: 'Snow', ja: '雪' },
        'Blizzards': { icon: '🌨️', zh: '暴風雪', en: 'Blizzards', ja: '吹雪' },
        'Gloom': { icon: '🌑', zh: '薄暗', en: 'Gloom', ja: '妖霧' },
        'Umbral Wind': { icon: '🌀', zh: '靈風', en: 'Umbral Wind', ja: '霊風' },
        'Umbral Static': { icon: '⚡', zh: '靈電', en: 'Umbral Static', ja: '放電' },
        'Eruptions': { icon: '🌋', zh: '火山灰', en: 'Eruptions', ja: '噴煙' },
        'Moon Dust': { icon: '🌙', zh: '月塵', en: 'Moon Dust', ja: '月砂塵' },
        'Astromagnetic Storm': { icon: '💫', zh: '星磁暴', en: 'Astromagnetic Storm', ja: '星磁嵐' },
        'Hyperelectricity': { icon: '⚡', zh: '超電磁', en: 'Hyperelectricity', ja: '超電磁嵐' },
        'Royal Levin': { icon: '👑', zh: '皇雷', en: 'Royal Levin', ja: '皇雷' },
        'Shelf Clouds': { icon: '🌪️', zh: '弧狀雲', en: 'Shelf Clouds', ja: '弧状雲' },
        'Oppression': { icon: '😰', zh: '悶熱', en: 'Oppression', ja: '蒸熱' },
        'Sunshine': { icon: '🌞', zh: '烈日', en: 'Sunshine', ja: '陽光' }
    },

    // Regions
    regions: {
        'la-noscea': { zh: '拉諾西亞', en: 'La Noscea', ja: 'ラノシア' },
        'black-shroud': { zh: '黑衣森林', en: 'The Black Shroud', ja: '黒衣森' },
        'thanalan': { zh: '薩納蘭', en: 'Thanalan', ja: 'ザナラーン' },
        'coerthas': { zh: '庫爾札斯', en: 'Coerthas', ja: 'クルザス' },
        'mor-dhona': { zh: '摩杜納', en: 'Mor Dhona', ja: 'モードゥナ' },
        'abalathia': { zh: '阿巴拉提亞', en: "Abalathia's Spine", ja: 'アバラシア' },
        'dravania': { zh: '龍堡', en: 'Dravania', ja: 'ドラヴァニア' },
        'gyr-abania': { zh: '基拉巴尼亞', en: 'Gyr Abania', ja: 'ギラバニア' },
        'othard': { zh: '奧薩德', en: 'Othard', ja: 'オサード' },
        'norvrandt': { zh: '諾弗蘭特', en: 'Norvrandt', ja: 'ノルヴラント' },
        'ilsabard': { zh: '伊爾薩巴德', en: 'Ilsabard', ja: 'イルサバード' },
        'the-sea-of-stars': { zh: '星海', en: 'The Sea of Stars', ja: '星海' },
        'the-world-unsundered': { zh: '未分離的世界', en: 'The World Unsundered', ja: '未分裂の世界' },
        'tural': { zh: '圖拉爾', en: 'Tural', ja: 'トラル' }
    },

    // All 78 zones with weather tables
    // Weather table format: [weather1, chance1, weather2, chance2, ..., weatherN]
    // Chances are cumulative (0-99), last weather has no chance (covers remaining)
    zones: [
        // La Noscea
        { id: 'limsa-lominsa', region: 'la-noscea', zh: '利姆薩·羅敏薩', en: 'Limsa Lominsa', ja: 'リムサ・ロミンサ', weatherTable: ['Clouds', 20, 'Clear Skies', 50, 'Fair Skies', 80, 'Fog', 90, 'Rain'] },
        { id: 'middle-la-noscea', region: 'la-noscea', zh: '中拉諾西亞', en: 'Middle La Noscea', ja: '中央ラノシア', weatherTable: ['Clouds', 20, 'Clear Skies', 50, 'Fair Skies', 70, 'Wind', 80, 'Fog', 90, 'Rain'] },
        { id: 'lower-la-noscea', region: 'la-noscea', zh: '拉諾西亞低地', en: 'Lower La Noscea', ja: '低地ラノシア', weatherTable: ['Clouds', 20, 'Clear Skies', 50, 'Fair Skies', 70, 'Wind', 80, 'Fog', 90, 'Rain'] },
        { id: 'eastern-la-noscea', region: 'la-noscea', zh: '東拉諾西亞', en: 'Eastern La Noscea', ja: '東ラノシア', weatherTable: ['Fog', 5, 'Clear Skies', 50, 'Fair Skies', 80, 'Clouds', 90, 'Rain', 95, 'Showers'] },
        { id: 'western-la-noscea', region: 'la-noscea', zh: '西拉諾西亞', en: 'Western La Noscea', ja: '西ラノシア', weatherTable: ['Fog', 10, 'Clear Skies', 40, 'Fair Skies', 60, 'Clouds', 80, 'Wind', 90, 'Gales'] },
        { id: 'upper-la-noscea', region: 'la-noscea', zh: '拉諾西亞高地', en: 'Upper La Noscea', ja: '高地ラノシア', weatherTable: ['Clear Skies', 30, 'Fair Skies', 50, 'Clouds', 70, 'Fog', 80, 'Thunder', 90, 'Thunderstorms'] },
        { id: 'outer-la-noscea', region: 'la-noscea', zh: '拉諾西亞外地', en: 'Outer La Noscea', ja: '外地ラノシア', weatherTable: ['Clear Skies', 30, 'Fair Skies', 50, 'Clouds', 70, 'Fog', 85, 'Rain'] },
        { id: 'mist', region: 'la-noscea', zh: '海霧村', en: 'Mist', ja: 'ミスト・ヴィレッジ', weatherTable: ['Clouds', 20, 'Clear Skies', 50, 'Fair Skies', 70, 'Fog', 80, 'Rain'] },

        // The Black Shroud
        { id: 'gridania', region: 'black-shroud', zh: '格里達尼亞', en: 'Gridania', ja: 'グリダニア', weatherTable: ['Rain', 20, 'Fog', 30, 'Clouds', 40, 'Fair Skies', 55, 'Clear Skies', 85, 'Fair Skies'] },
        { id: 'central-shroud', region: 'black-shroud', zh: '黑衣森林中央林區', en: 'Central Shroud', ja: '黒衣森：中央森林', weatherTable: ['Thunder', 5, 'Rain', 20, 'Fog', 30, 'Clouds', 40, 'Fair Skies', 55, 'Clear Skies', 85, 'Fair Skies'] },
        { id: 'east-shroud', region: 'black-shroud', zh: '黑衣森林東部林區', en: 'East Shroud', ja: '黒衣森：東部森林', weatherTable: ['Thunder', 5, 'Rain', 20, 'Fog', 30, 'Clouds', 40, 'Fair Skies', 55, 'Clear Skies', 85, 'Fair Skies'] },
        { id: 'south-shroud', region: 'black-shroud', zh: '黑衣森林南部林區', en: 'South Shroud', ja: '黒衣森：南部森林', weatherTable: ['Fog', 5, 'Thunderstorms', 10, 'Thunder', 25, 'Fog', 30, 'Clouds', 40, 'Fair Skies', 70, 'Clear Skies'] },
        { id: 'north-shroud', region: 'black-shroud', zh: '黑衣森林北部林區', en: 'North Shroud', ja: '黒衣森：北部森林', weatherTable: ['Fog', 5, 'Showers', 10, 'Rain', 25, 'Fog', 30, 'Clouds', 40, 'Fair Skies', 70, 'Clear Skies'] },
        { id: 'lavender-beds', region: 'black-shroud', zh: '薰衣草苗圃', en: 'The Lavender Beds', ja: 'ラベンダーベッド', weatherTable: ['Clouds', 5, 'Rain', 20, 'Fog', 30, 'Clouds', 40, 'Fair Skies', 55, 'Clear Skies', 85, 'Fair Skies'] },

        // Thanalan
        { id: 'uldah', region: 'thanalan', zh: '烏爾達哈', en: "Ul'dah", ja: 'ウルダハ', weatherTable: ['Clear Skies', 40, 'Fair Skies', 60, 'Clouds', 85, 'Fog', 95, 'Rain'] },
        { id: 'western-thanalan', region: 'thanalan', zh: '西薩納蘭', en: 'Western Thanalan', ja: '西ザナラーン', weatherTable: ['Clear Skies', 40, 'Fair Skies', 60, 'Clouds', 85, 'Fog', 95, 'Rain'] },
        { id: 'central-thanalan', region: 'thanalan', zh: '中薩納蘭', en: 'Central Thanalan', ja: '中央ザナラーン', weatherTable: ['Dust Storms', 15, 'Clear Skies', 55, 'Fair Skies', 75, 'Clouds', 85, 'Fog', 95, 'Rain'] },
        { id: 'eastern-thanalan', region: 'thanalan', zh: '東薩納蘭', en: 'Eastern Thanalan', ja: '東ザナラーン', weatherTable: ['Clear Skies', 40, 'Fair Skies', 60, 'Clouds', 70, 'Fog', 80, 'Rain', 85, 'Showers'] },
        { id: 'southern-thanalan', region: 'thanalan', zh: '南薩納蘭', en: 'Southern Thanalan', ja: '南ザナラーン', weatherTable: ['Heat Waves', 20, 'Clear Skies', 60, 'Fair Skies', 80, 'Clouds', 90, 'Fog'] },
        { id: 'northern-thanalan', region: 'thanalan', zh: '北薩納蘭', en: 'Northern Thanalan', ja: '北ザナラーン', weatherTable: ['Clear Skies', 5, 'Fair Skies', 20, 'Clouds', 50, 'Fog'] },
        { id: 'goblet', region: 'thanalan', zh: '高腳孤丘', en: 'The Goblet', ja: 'ゴブレットビュート', weatherTable: ['Clear Skies', 40, 'Fair Skies', 60, 'Clouds', 85, 'Fog', 95, 'Rain'] },

        // Coerthas
        { id: 'ishgard', region: 'coerthas', zh: '伊修加德', en: 'Ishgard', ja: 'イシュガルド', weatherTable: ['Snow', 60, 'Fair Skies', 70, 'Clear Skies', 75, 'Clouds', 90, 'Fog'] },
        { id: 'coerthas-central', region: 'coerthas', zh: '庫爾札斯中央高地', en: 'Coerthas Central Highlands', ja: 'クルザス中央高地', weatherTable: ['Blizzards', 20, 'Snow', 60, 'Fair Skies', 70, 'Clear Skies', 75, 'Clouds', 90, 'Fog'] },
        { id: 'coerthas-western', region: 'coerthas', zh: '庫爾札斯西部高地', en: 'Coerthas Western Highlands', ja: 'クルザス西部高地', weatherTable: ['Blizzards', 20, 'Snow', 60, 'Fair Skies', 70, 'Clear Skies', 75, 'Clouds', 90, 'Fog'] },
        { id: 'empyreum', region: 'coerthas', zh: '穹頂皓天', en: 'Empyreum', ja: 'エンピレアム', weatherTable: ['Snow', 15, 'Fair Skies', 45, 'Clear Skies', 60, 'Clouds', 80, 'Fog'] },

        // Mor Dhona
        { id: 'mor-dhona', region: 'mor-dhona', zh: '摩杜納', en: 'Mor Dhona', ja: 'モードゥナ', weatherTable: ['Clouds', 15, 'Fog', 30, 'Gloom', 60, 'Clear Skies', 75, 'Fair Skies'] },

        // Abalathia's Spine
        { id: 'sea-of-clouds', region: 'abalathia', zh: '阿巴拉提亞雲海', en: 'The Sea of Clouds', ja: 'アバラシア雲海', weatherTable: ['Clear Skies', 30, 'Fair Skies', 60, 'Clouds', 70, 'Fog', 80, 'Wind', 90, 'Umbral Wind'] },
        { id: 'azys-lla', region: 'abalathia', zh: '魔大陸阿濟茲拉', en: 'Azys Lla', ja: 'アジス・ラー', weatherTable: ['Fair Skies', 35, 'Clouds', 70, 'Thunder'] },

        // Dravania
        { id: 'idyllshire', region: 'dravania', zh: '田園郡', en: 'Idyllshire', ja: 'イディルシャイア', weatherTable: ['Clouds', 10, 'Fog', 20, 'Rain', 30, 'Showers', 40, 'Clear Skies', 70, 'Fair Skies'] },
        { id: 'churning-mists', region: 'dravania', zh: '德拉瓦尼亞雲海', en: 'The Churning Mists', ja: 'ドラヴァニア雲海', weatherTable: ['Clouds', 10, 'Gales', 20, 'Umbral Static', 40, 'Clear Skies', 70, 'Fair Skies'] },
        { id: 'dravanian-forelands', region: 'dravania', zh: '德拉瓦尼亞山麓地', en: 'The Dravanian Forelands', ja: 'ドラヴァニア前線', weatherTable: ['Clouds', 10, 'Fog', 20, 'Thunder', 30, 'Dust Storms', 40, 'Clear Skies', 70, 'Fair Skies'] },
        { id: 'dravanian-hinterlands', region: 'dravania', zh: '龍堡內陸', en: 'The Dravanian Hinterlands', ja: 'ドラヴァニア内地', weatherTable: ['Clouds', 10, 'Fog', 20, 'Rain', 30, 'Showers', 40, 'Clear Skies', 70, 'Fair Skies'] },

        // Gyr Abania
        { id: 'rhalgrs-reach', region: 'gyr-abania', zh: '神拳痕', en: "Rhalgr's Reach", ja: 'ラールガーズリーチ', weatherTable: ['Clear Skies', 15, 'Fair Skies', 60, 'Clouds', 80, 'Fog', 90, 'Thunder'] },
        { id: 'fringes', region: 'gyr-abania', zh: '基拉巴尼亞邊區', en: 'The Fringes', ja: 'ギラバニア辺境地帯', weatherTable: ['Clear Skies', 15, 'Fair Skies', 60, 'Clouds', 80, 'Fog', 90, 'Thunder'] },
        { id: 'peaks', region: 'gyr-abania', zh: '基拉巴尼亞山區', en: 'The Peaks', ja: 'ギラバニア山岳地帯', weatherTable: ['Clear Skies', 10, 'Fair Skies', 60, 'Clouds', 75, 'Fog', 85, 'Wind', 95, 'Dust Storms'] },
        { id: 'lochs', region: 'gyr-abania', zh: '基拉巴尼亞湖區', en: 'The Lochs', ja: 'ギラバニア湖畔地帯', weatherTable: ['Clear Skies', 20, 'Fair Skies', 60, 'Clouds', 80, 'Fog', 90, 'Thunderstorms'] },

        // Othard
        { id: 'kugane', region: 'othard', zh: '神拳流國際港都', en: 'Kugane', ja: 'クガネ', weatherTable: ['Rain', 10, 'Fog', 20, 'Clouds', 40, 'Fair Skies', 80, 'Clear Skies'] },
        { id: 'ruby-sea', region: 'othard', zh: '紅玉海', en: 'The Ruby Sea', ja: '紅玉海', weatherTable: ['Thunder', 10, 'Wind', 20, 'Clouds', 35, 'Fair Skies', 75, 'Clear Skies'] },
        { id: 'yanxia', region: 'othard', zh: '延夏', en: 'Yanxia', ja: 'ヤンサ', weatherTable: ['Showers', 5, 'Rain', 15, 'Fog', 25, 'Clouds', 40, 'Fair Skies', 80, 'Clear Skies'] },
        { id: 'azim-steppe', region: 'othard', zh: '太陽神草原', en: 'The Azim Steppe', ja: 'アジムステップ', weatherTable: ['Gales', 5, 'Wind', 10, 'Rain', 17, 'Fog', 25, 'Clouds', 35, 'Fair Skies', 75, 'Clear Skies'] },
        { id: 'shirogane', region: 'othard', zh: '白銀鄉', en: 'Shirogane', ja: 'シロガネ', weatherTable: ['Rain', 10, 'Fog', 20, 'Clouds', 40, 'Fair Skies', 80, 'Clear Skies'] },

        // Norvrandt
        { id: 'crystarium', region: 'norvrandt', zh: '水晶都', en: 'The Crystarium', ja: 'クリスタリウム', weatherTable: ['Clear Skies', 20, 'Fair Skies', 60, 'Clouds', 75, 'Fog', 85, 'Rain', 95, 'Thunderstorms'] },
        { id: 'lakeland', region: 'norvrandt', zh: '雷克蘭德', en: 'Lakeland', ja: 'レイクランド', weatherTable: ['Clear Skies', 20, 'Fair Skies', 60, 'Clouds', 75, 'Fog', 85, 'Rain', 95, 'Thunderstorms'] },
        { id: 'kholusia', region: 'norvrandt', zh: '珂露西亞島', en: 'Kholusia', ja: 'コルシア島', weatherTable: ['Clear Skies', 15, 'Fair Skies', 55, 'Clouds', 70, 'Fog', 80, 'Rain', 90, 'Thunderstorms'] },
        { id: 'amh-araeng', region: 'norvrandt', zh: '安穆·艾蘭', en: 'Amh Araeng', ja: 'アム・アレーン', weatherTable: ['Fair Skies', 45, 'Clouds', 60, 'Dust Storms', 70, 'Heat Waves', 80, 'Clear Skies'] },
        { id: 'il-mheg', region: 'norvrandt', zh: '伊爾美格', en: 'Il Mheg', ja: 'イル・メグ', weatherTable: ['Clear Skies', 10, 'Fair Skies', 45, 'Clouds', 60, 'Fog', 75, 'Rain', 90, 'Thunderstorms'] },
        { id: 'rak-tika', region: 'norvrandt', zh: '拉凱提卡大森林', en: "The Rak'tika Greatwood", ja: 'ラケティカ大森林', weatherTable: ['Fog', 10, 'Rain', 20, 'Umbral Wind', 30, 'Clear Skies', 45, 'Fair Skies', 85, 'Clouds'] },
        { id: 'tempest', region: 'norvrandt', zh: '黑風海', en: 'The Tempest', ja: 'テンペスト', weatherTable: ['Clear Skies', 20, 'Fair Skies', 80, 'Clouds'] },
        { id: 'eulmore', region: 'norvrandt', zh: '遊末邦', en: 'Eulmore', ja: 'ユールモア', weatherTable: ['Gales', 10, 'Rain', 20, 'Fog', 30, 'Clouds', 45, 'Fair Skies', 85, 'Clear Skies'] },

        // Ilsabard
        { id: 'radz-at-han', region: 'ilsabard', zh: '拉札罕', en: 'Radz-at-Han', ja: 'ラザハン', weatherTable: ['Fog', 15, 'Rain', 25, 'Clear Skies', 55, 'Fair Skies', 85, 'Clouds'] },
        { id: 'thavnair', region: 'ilsabard', zh: '薩維奈島', en: 'Thavnair', ja: 'サベネア島', weatherTable: ['Fog', 10, 'Rain', 17, 'Showers', 25, 'Clear Skies', 55, 'Fair Skies', 85, 'Clouds'] },
        { id: 'garlemald', region: 'ilsabard', zh: '加雷馬', en: 'Garlemald', ja: 'ガレマルド', weatherTable: ['Snow', 45, 'Thunder', 50, 'Rain', 55, 'Fog', 60, 'Clouds', 70, 'Fair Skies', 85, 'Clear Skies'] },

        // The Sea of Stars
        { id: 'old-sharlayan', region: 'the-sea-of-stars', zh: '舊薩雷安', en: 'Old Sharlayan', ja: 'オールド・シャーレアン', weatherTable: ['Clear Skies', 10, 'Fair Skies', 50, 'Clouds', 70, 'Fog', 85, 'Rain'] },
        { id: 'labyrinthos', region: 'the-sea-of-stars', zh: '迷津', en: 'Labyrinthos', ja: 'ラヴィリンソス', weatherTable: ['Clear Skies', 15, 'Fair Skies', 60, 'Clouds'] },
        { id: 'mare-lamentorum', region: 'the-sea-of-stars', zh: '嘆息海', en: 'Mare Lamentorum', ja: '嘆きの海', weatherTable: ['Moon Dust', 50, 'Fair Skies', 90, 'Umbral Wind'] },
        { id: 'ultima-thule', region: 'the-sea-of-stars', zh: '厄爾庇斯', en: 'Ultima Thule', ja: 'ウルティマ・トゥーレ', weatherTable: ['Astromagnetic Storm', 20, 'Fair Skies', 55, 'Umbral Wind'] },

        // The World Unsundered
        { id: 'elpis', region: 'the-world-unsundered', zh: '艾爾庇斯', en: 'Elpis', ja: 'エルピス', weatherTable: ['Clear Skies', 25, 'Fair Skies', 70, 'Clouds', 80, 'Fog', 90, 'Umbral Wind'] },

        // Tural
        { id: 'tuliyollal', region: 'tural', zh: '圖莉尤拉爾', en: 'Tuliyollal', ja: 'トライヨラ', weatherTable: ['Clouds', 5, 'Rain', 15, 'Fog', 25, 'Fair Skies', 60, 'Clear Skies'] },
        { id: 'solution-nine', region: 'tural', zh: '九號解決方案', en: 'Solution Nine', ja: 'ソリューション・ナイン', weatherTable: ['Fair Skies', 50, 'Clouds', 80, 'Rain'] },
        { id: 'urqopacha', region: 'tural', zh: '奧爾卡帕查', en: 'Urqopacha', ja: 'オルコパチャ', weatherTable: ['Clear Skies', 20, 'Fair Skies', 60, 'Clouds', 80, 'Fog', 90, 'Rain'] },
        { id: 'kozamauka', region: 'tural', zh: '科薩馬爾卡', en: "Kozama'uka", ja: 'コザマル・カ', weatherTable: ['Rain', 15, 'Showers', 25, 'Fog', 35, 'Clouds', 50, 'Fair Skies', 80, 'Clear Skies'] },
        { id: 'yak-tel', region: 'tural', zh: '雅克·特爾', en: "Yak T'el", ja: 'ヤクテル樹海', weatherTable: ['Rain', 20, 'Fog', 35, 'Clouds', 50, 'Fair Skies', 80, 'Clear Skies'] },
        { id: 'shaaloani', region: 'tural', zh: '夏勞尼', en: 'Shaaloani', ja: 'シャーローニ荒野', weatherTable: ['Dust Storms', 10, 'Clear Skies', 50, 'Fair Skies', 80, 'Clouds'] },
        { id: 'heritage-found', region: 'tural', zh: '發現遺產', en: 'Heritage Found', ja: 'ヘリテージファウンド', weatherTable: ['Thunderstorms', 5, 'Rain', 15, 'Fog', 25, 'Clouds', 45, 'Fair Skies', 80, 'Clear Skies'] },
        { id: 'living-memory', region: 'tural', zh: '活記憶', en: 'Living Memory', ja: 'リビング・メモリー', weatherTable: ['Rain', 10, 'Fog', 20, 'Fair Skies', 60, 'Clear Skies'] },

        // Special / Miscellaneous
        { id: 'wolves-den-pier', region: 'la-noscea', zh: '狼獄演習場', en: "Wolves' Den Pier", ja: 'ウルヴズジェイル演習場', weatherTable: ['Clear Skies', 20, 'Fair Skies', 50, 'Clouds', 70, 'Fog', 80, 'Wind', 90, 'Rain'] },
        { id: 'eureka-anemos', region: 'othard', zh: '常風之地', en: 'Eureka Anemos', ja: '禁断の地 エウレカ：アネモス帯', weatherTable: ['Fair Skies', 30, 'Gales', 60, 'Showers', 90, 'Snow'] },
        { id: 'eureka-pagos', region: 'othard', zh: '恆冰之地', en: 'Eureka Pagos', ja: '禁断の地 エウレカ：パゴス帯', weatherTable: ['Clear Skies', 10, 'Fog', 28, 'Heat Waves', 46, 'Snow', 64, 'Thunder', 82, 'Blizzards'] },
        { id: 'eureka-pyros', region: 'othard', zh: '涌火之地', en: 'Eureka Pyros', ja: '禁断の地 エウレカ：ピューロス帯', weatherTable: ['Fair Skies', 10, 'Heat Waves', 28, 'Thunder', 46, 'Blizzards', 64, 'Umbral Wind', 82, 'Snow'] },
        { id: 'eureka-hydatos', region: 'othard', zh: '湧水之地', en: 'Eureka Hydatos', ja: '禁断の地 エウレカ：ヒュダトス帯', weatherTable: ['Fair Skies', 12, 'Showers', 34, 'Gloom', 56, 'Thunderstorms', 78, 'Snow'] },
        { id: 'bozjan-southern-front', region: 'ilsabard', zh: '博茲雅戰線南方戰區', en: 'The Bozjan Southern Front', ja: 'ボズヤ戦線', weatherTable: ['Fair Skies', 20, 'Rain', 40, 'Wind', 60, 'Thunder', 80, 'Dust Storms'] },
        { id: 'zadnor', region: 'ilsabard', zh: '扎杜諾爾高原', en: 'Zadnor', ja: 'ザトゥノル高原', weatherTable: ['Fair Skies', 15, 'Rain', 30, 'Wind', 50, 'Thunder', 70, 'Snow', 85, 'Gales'] },
        { id: 'diadem', region: 'abalathia', zh: '雲冠群島', en: 'The Diadem', ja: 'ディアデム諸島', weatherTable: ['Clear Skies', 20, 'Fair Skies', 50, 'Clouds', 70, 'Fog', 80, 'Wind', 90, 'Umbral Wind'] }
    ],

    /**
     * Get zone by ID
     * @param {string} zoneId - Zone ID
     * @returns {object|null} Zone data or null if not found
     */
    getZone(zoneId) {
        return this.zones.find(z => z.id === zoneId) || null;
    },

    /**
     * Get all zones in a region
     * @param {string} regionId - Region ID
     * @returns {array} Array of zones in the region
     */
    getZonesByRegion(regionId) {
        return this.zones.filter(z => z.region === regionId);
    },

    /**
     * Get zones grouped by region
     * @returns {object} Object with region IDs as keys and zone arrays as values
     */
    getZonesGroupedByRegion() {
        const grouped = {};
        for (const zone of this.zones) {
            if (!grouped[zone.region]) {
                grouped[zone.region] = [];
            }
            grouped[zone.region].push(zone);
        }
        return grouped;
    },

    /**
     * Get weather info
     * @param {string} weatherName - Weather name in English
     * @returns {object|null} Weather info or null if not found
     */
    getWeatherInfo(weatherName) {
        return this.weatherTypes[weatherName] || null;
    },

    /**
     * Get all unique weather types used across all zones
     * @returns {array} Array of unique weather names
     */
    getAllUsedWeatherTypes() {
        const weatherSet = new Set();
        for (const zone of this.zones) {
            const table = zone.weatherTable;
            for (let i = 0; i < table.length; i += 2) {
                weatherSet.add(table[i]);
            }
        }
        return Array.from(weatherSet).sort();
    }
};

// Export for use in other modules
window.WeatherZoneData = WeatherZoneData;
