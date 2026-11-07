/**
 * FF14.tw 副本資料庫翻譯檔
 * 副本名稱、類型、版本名稱、機制、簡介與掉落物是資料（中文），三種語言都顯示中文，不在這裡翻譯。
 */
const DungeonDatabaseTranslations = {
    zh: {
        // 頁面資訊
        dungeon_db_title: '副本資料庫 - FF14.tw',
        dungeon_db_description: 'FF14 副本資料庫：查副本的等級、類型、機制與掉落物。',

        // 頁面標題
        dungeon_db_header: '副本資料庫',

        // 搜尋
        dungeon_db_search_label: '搜尋副本名稱、機制或掉落物',
        dungeon_db_search_placeholder: '搜尋副本、機制或掉落物',

        // 篩選
        dungeon_db_type_filter: '類型',
        dungeon_db_expansion_filter: '版本',
        dungeon_db_clear_filters: '清除篩選',

        // 筆數與顯示更多（_one 只在數字是 1 時用）
        dungeon_db_count_all: '共 {count} 個副本',
        dungeon_db_count_all_one: '共 1 個副本',
        dungeon_db_count_found: '找到 {count} 個副本',
        dungeon_db_count_found_one: '找到 1 個副本',
        dungeon_db_show_more: '顯示更多（還有 {count} 個）',

        // 列上命中的欄位（標籤後面直接接資料的字）
        dungeon_db_hit_drop: '掉落：',
        dungeon_db_hit_more: '（還有 {count} 項也符合）',
        dungeon_db_hit_mechanics: '機制：',
        dungeon_db_hit_description: '簡介：',

        // 展開的詳情
        dungeon_db_detail_name: '名稱',
        dungeon_db_detail_description: '簡介',
        dungeon_db_detail_mechanics: '機制',
        dungeon_db_detail_drops: '掉落物',
        dungeon_db_detail_reward: '獎勵',
        dungeon_db_no_drops: '資料裡沒有特殊掉落物',
        dungeon_db_no_reward: '沒有神典石',

        // 狀態訊息
        dungeon_db_loading: '載入中...',
        dungeon_db_no_results: '找不到符合條件的副本',

        // 資料來源
        dungeon_db_data_source: '資料來源',
        dungeon_db_data_source_text: '本工具的副本資料來自',
        dungeon_db_data_source_link: '灰機Wiki',
        dungeon_db_data_source_desc: '，經過繁體中文化處理並使用台灣用語，提供更符合台灣玩家習慣的資訊呈現。',
        dungeon_db_data_count: '資料包含 {count} 個副本，涵蓋從重生之境（2.x）到黃金之遺產（7.x）。感謝灰機Wiki社群的貢獻。',

        // 訊息
        dungeon_db_msg_load_failed: '載入副本資料失敗，請重新整理頁面再試。'
    },
    en: {
        // Page info
        dungeon_db_title: 'Dungeon Database - FF14.tw',
        dungeon_db_description: 'FF14 dungeon database: look up each duty\'s level, type, mechanics and drops.',

        // Page header
        dungeon_db_header: 'Dungeon Database',

        // Search
        dungeon_db_search_label: 'Search dungeon names, mechanics or drops',
        dungeon_db_search_placeholder: 'Search dungeons, mechanics or drops',

        // Filters
        dungeon_db_type_filter: 'Type',
        dungeon_db_expansion_filter: 'Expansion',
        dungeon_db_clear_filters: 'Clear filters',

        // Counts and show more (_one is used only when the number is 1)
        dungeon_db_count_all: '{count} dungeons',
        dungeon_db_count_all_one: '1 dungeon',
        dungeon_db_count_found: '{count} dungeons found',
        dungeon_db_count_found_one: '1 dungeon found',
        dungeon_db_show_more: 'Show more ({count} left)',

        // Matched fields on a row (the data's text follows the label directly)
        dungeon_db_hit_drop: 'Drop: ',
        dungeon_db_hit_more: ' (+{count} more)',
        dungeon_db_hit_mechanics: 'Mechanics: ',
        dungeon_db_hit_description: 'Overview: ',

        // Expanded details
        dungeon_db_detail_name: 'Name',
        dungeon_db_detail_description: 'Overview',
        dungeon_db_detail_mechanics: 'Mechanics',
        dungeon_db_detail_drops: 'Drops',
        dungeon_db_detail_reward: 'Reward',
        dungeon_db_no_drops: 'No special drops in the data',
        dungeon_db_no_reward: 'No tomestones',

        // Status messages
        dungeon_db_loading: 'Loading...',
        dungeon_db_no_results: 'No dungeons found matching your criteria',

        // Data source
        dungeon_db_data_source: 'Data Source',
        dungeon_db_data_source_text: 'Dungeon data is sourced from',
        dungeon_db_data_source_link: 'Huiji Wiki',
        dungeon_db_data_source_desc: ', converted to Traditional Chinese with Taiwan terminology for local players.',
        dungeon_db_data_count: 'Contains {count} dungeons from A Realm Reborn (2.x) to Dawntrail (7.x). Thanks to the Huiji Wiki community.',

        // Messages
        dungeon_db_msg_load_failed: 'Failed to load dungeon data, please refresh and try again.'
    },
    ja: {
        // ページ情報
        dungeon_db_title: 'ダンジョンデータベース - FF14.tw',
        dungeon_db_description: 'FF14 ダンジョンデータベース：レベル、タイプ、ギミック、ドロップを調べられます。',

        // ページヘッダー
        dungeon_db_header: 'ダンジョンデータベース',

        // 検索
        dungeon_db_search_label: 'ダンジョン名、ギミック、ドロップを検索',
        dungeon_db_search_placeholder: 'ダンジョン・ギミック・ドロップを検索',

        // 絞り込み
        dungeon_db_type_filter: 'タイプ',
        dungeon_db_expansion_filter: 'バージョン',
        dungeon_db_clear_filters: '絞り込みを解除',

        // 件数と「さらに表示」（_one は数が 1 のときだけ使う）
        dungeon_db_count_all: '全 {count} 件',
        dungeon_db_count_all_one: '全 1 件',
        dungeon_db_count_found: '{count} 件見つかりました',
        dungeon_db_count_found_one: '1 件見つかりました',
        dungeon_db_show_more: 'さらに表示（残り {count} 件）',

        // 行に出る一致した項目（ラベルのすぐ後にデータの文字が続く）
        dungeon_db_hit_drop: 'ドロップ：',
        dungeon_db_hit_more: '（ほか {count} 件）',
        dungeon_db_hit_mechanics: 'ギミック：',
        dungeon_db_hit_description: '概要：',

        // 開いたときの詳細
        dungeon_db_detail_name: '名前',
        dungeon_db_detail_description: '概要',
        dungeon_db_detail_mechanics: 'ギミック',
        dungeon_db_detail_drops: 'ドロップ',
        dungeon_db_detail_reward: '報酬',
        dungeon_db_no_drops: 'データに特別なドロップはありません',
        dungeon_db_no_reward: 'トームストーンなし',

        // ステータスメッセージ
        dungeon_db_loading: '読み込み中...',
        dungeon_db_no_results: '条件に一致するダンジョンが見つかりません',

        // データソース
        dungeon_db_data_source: 'データソース',
        dungeon_db_data_source_text: 'ダンジョンデータは',
        dungeon_db_data_source_link: '灰機Wiki',
        dungeon_db_data_source_desc: 'より取得し、繁体中文に変換し台湾の用語を使用しています。',
        dungeon_db_data_count: '{count} 件のダンジョンを収録しています（新生エオルゼア 2.x～黄金のレガシー 7.x）。灰機Wikiコミュニティに感謝します。',

        // メッセージ
        dungeon_db_msg_load_failed: 'ダンジョンデータの読み込みに失敗しました。ページを更新してください。'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('dungeon-database', DungeonDatabaseTranslations);
}
