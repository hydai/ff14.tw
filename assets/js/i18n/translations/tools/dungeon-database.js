/**
 * FF14.tw 副本資料庫翻譯檔
 */
const DungeonDatabaseTranslations = {
    zh: {
        // 頁面資訊
        dungeon_db_title: '副本資料庫 - FF14.tw',
        dungeon_db_description: 'FF14副本完整資料庫，包含所有副本資訊、獎勵和攻略指南。',

        // 頁面標題
        dungeon_db_header: '副本資料庫',

        // 搜尋
        dungeon_db_search_placeholder: '搜尋副本名稱、機制說明或掉落物... (支援上下鍵導航，Enter選取)',

        // 過濾器標籤
        dungeon_db_type_filter: '類型過濾：',
        dungeon_db_expansion_filter: '版本過濾：',
        dungeon_db_level_filter: '等級過濾：',
        dungeon_db_reset_filters: '重置過濾',

        // 狀態訊息
        dungeon_db_loading: '載入中...',
        dungeon_db_no_results: '找不到符合條件的副本',

        // 資料來源
        dungeon_db_data_source: '資料來源',
        dungeon_db_data_source_text: '本工具的副本資料來自',
        dungeon_db_data_source_link: '灰機Wiki',
        dungeon_db_data_source_desc: '，經過繁體中文化處理並使用台灣用語，提供更符合台灣玩家習慣的資訊呈現。',
        dungeon_db_data_count: '資料包含362個副本，涵蓋從重生之境（2.x）到黃金之遺產（7.x）的完整內容。感謝灰機Wiki社群的貢獻。'
    },
    en: {
        // Page info
        dungeon_db_title: 'Dungeon Database - FF14.tw',
        dungeon_db_description: 'Complete FF14 dungeon database with all dungeon info, rewards, and guides.',

        // Page header
        dungeon_db_header: 'Dungeon Database',

        // Search
        dungeon_db_search_placeholder: 'Search dungeon name, mechanics, or drops... (Use arrow keys to navigate, Enter to select)',

        // Filter labels
        dungeon_db_type_filter: 'Type Filter:',
        dungeon_db_expansion_filter: 'Expansion Filter:',
        dungeon_db_level_filter: 'Level Filter:',
        dungeon_db_reset_filters: 'Reset Filters',

        // Status messages
        dungeon_db_loading: 'Loading...',
        dungeon_db_no_results: 'No dungeons found matching your criteria',

        // Data source
        dungeon_db_data_source: 'Data Source',
        dungeon_db_data_source_text: 'Dungeon data is sourced from',
        dungeon_db_data_source_link: 'Huiji Wiki',
        dungeon_db_data_source_desc: ', converted to Traditional Chinese with Taiwan terminology for local players.',
        dungeon_db_data_count: 'Database contains 362 dungeons, covering all content from A Realm Reborn (2.x) to Dawntrail (7.x). Thanks to the Huiji Wiki community.'
    },
    ja: {
        // ページ情報
        dungeon_db_title: 'ダンジョンデータベース - FF14.tw',
        dungeon_db_description: 'FF14ダンジョン完全データベース、すべてのダンジョン情報、報酬、攻略ガイドを含む。',

        // ページヘッダー
        dungeon_db_header: 'ダンジョンデータベース',

        // 検索
        dungeon_db_search_placeholder: 'ダンジョン名、ギミック、ドロップを検索... (矢印キーで移動、Enterで選択)',

        // フィルターラベル
        dungeon_db_type_filter: 'タイプフィルター：',
        dungeon_db_expansion_filter: '拡張フィルター：',
        dungeon_db_level_filter: 'レベルフィルター：',
        dungeon_db_reset_filters: 'フィルターリセット',

        // ステータスメッセージ
        dungeon_db_loading: '読み込み中...',
        dungeon_db_no_results: '条件に一致するダンジョンが見つかりません',

        // データソース
        dungeon_db_data_source: 'データソース',
        dungeon_db_data_source_text: 'ダンジョンデータは',
        dungeon_db_data_source_link: '灰機Wiki',
        dungeon_db_data_source_desc: 'より取得し、繁体中文に変換し台湾の用語を使用しています。',
        dungeon_db_data_count: 'データベースには362のダンジョンが含まれ、新生エオルゼア（2.x）から黄金のレガシー（7.x）までの全コンテンツをカバーしています。灰機Wikiコミュニティに感謝します。'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('dungeon-database', DungeonDatabaseTranslations);
}
