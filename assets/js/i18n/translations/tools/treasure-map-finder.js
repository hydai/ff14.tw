/**
 * FF14.tw 寶圖搜尋器翻譯檔
 */
const TreasureMapTranslations = {
    zh: {
        // 頁面資訊
        treasure_map_title: '寶圖搜尋器 - FF14.tw',
        treasure_map_description: 'FF14 寶圖位置快速查詢工具，支援多條件篩選與個人清單管理',

        // 頁面標題
        treasure_map_header: '寶圖搜尋器',

        // 頂部操作
        treasure_map_my_list: '我的清單',
        treasure_map_create_room: '建立組隊',
        treasure_map_join_room: '加入隊伍',

        // 組隊區域
        treasure_map_room_code: '隊伍代號：',
        treasure_map_last_update: '最後更新：',
        treasure_map_room_ttl: '剩餘：',
        treasure_map_your_nickname: '您的暱稱：',
        treasure_map_leave_room: '離開隊伍',
        treasure_map_team_members: '隊伍成員：',

        // 篩選區
        treasure_map_filter_title: '篩選條件',
        treasure_map_reset_filters: '重置篩選',
        treasure_map_level_filter: '寶圖等級',
        treasure_map_map_filter: '地圖',
        treasure_map_multi_select: '可多選',

        // 結果區
        treasure_map_results: '顯示 {count} 個結果',
        treasure_map_load_more: '載入更多',

        // 資料來源
        treasure_map_data_source: '資料來源',
        treasure_map_data_source_intro: '本工具的座標資料來源於',

        // 面板操作
        treasure_map_export: '匯出',
        treasure_map_import: '匯入',
        treasure_map_clear_all: '清空',
        treasure_map_list_tab: '清單',
        treasure_map_history_tab: '歷史',
        treasure_map_total: '總計：',
        treasure_map_maps_unit: '張寶圖',
        treasure_map_generate_route: '生成路線',

        // 路線面板
        treasure_map_best_route: '最佳路線',
        treasure_map_copy_route: '複製路線',
        treasure_map_custom_format: '自訂格式',

        // 格式設定面板
        treasure_map_custom_output: '自訂輸出格式',
        treasure_map_quick_lang: '快速切換語言模板：',
        treasure_map_teleport_format: '傳送點格式',
        treasure_map_map_format: '寶圖格式',
        treasure_map_available_vars: '可用變數：',
        treasure_map_preview: '預覽',
        treasure_map_reset_default: '重置為預設值',
        treasure_map_save_settings: '儲存設定',

        // 加入隊伍對話框
        treasure_map_join_title: '加入隊伍',
        treasure_map_enter_code: '請輸入隊伍代號：',
        treasure_map_code_placeholder: '例如：A3B7K9',
        treasure_map_code_hint: '請向隊長取得 6 位英數字代號',

        // 編輯暱稱對話框
        treasure_map_edit_nickname: '編輯暱稱',
        treasure_map_nickname_label: '您的暱稱：',
        treasure_map_nickname_placeholder: '請輸入暱稱',
        treasure_map_nickname_hint: '其他成員將看到您的暱稱',

        // 離開隊伍對話框
        treasure_map_leave_title: '離開隊伍',
        treasure_map_leave_confirm: '您確定要離開隊伍嗎？',
        treasure_map_keep_list_question: '是否保留本地寶圖清單？',
        treasure_map_keep_and_leave: '保留清單並離開',
        treasure_map_clear_and_leave: '清空清單並離開',

        // 通用按鈕
        treasure_map_cancel: '取消',
        treasure_map_confirm: '確認',
        treasure_map_join: '加入',
        treasure_map_close: '關閉',

        // 訊息
        treasure_map_copy_success: '座標指令已複製',
        treasure_map_copy_failed: '複製失敗',
        treasure_map_copy_manual: '瀏覽器不支援自動複製，請手動選取文字後按 Ctrl+C 複製',
        treasure_map_copy_fallback_manual: '複製失敗，請手動選取文字後按 Ctrl+C 複製',
        treasure_map_remove_confirm: '確定要移除這張寶圖嗎？',
        treasure_map_clear_confirm: '確定要清空所有寶圖嗎？共 {count} 張',
        treasure_map_empty_list: '清單是空的',
        treasure_map_list_hint: '點擊寶圖卡片上的「加入清單」開始建立',
        treasure_map_loading: '載入中...',
        treasure_map_load_failed: '載入寶圖資料失敗，請重新整理頁面再試。',
        treasure_map_reload: '重新載入',
        treasure_map_no_maps_for_route: '至少需要 2 張寶圖才能生成路線',
        treasure_map_no_route_to_copy: '目前沒有可複製的路線',
        treasure_map_loading_aetherytes: '正在載入傳送點資料，請稍後再試',
        treasure_map_route_copy_success: '已複製 {count} 個地點',
        treasure_map_added_to_list: '✓ 已加入',
        treasure_map_add_to_list: '加入清單',
        treasure_map_view_detail: '詳細地圖',
        treasure_map_view_detail_tooltip: '查看詳細地圖',
        treasure_map_pos_placeholder: '座標：{coords}',

        // 對話框與清單訊息
        treasure_map_item_already_in_list: '此寶圖已在清單中',
        treasure_map_list_full: '清單已滿 ({current}/{max})',
        treasure_map_item_added: '已加入清單',
        treasure_map_item_not_in_list: '此寶圖不在清單中',
        treasure_map_item_removed: '已從清單移除',
        treasure_map_list_cleared: '已清空清單',
        treasure_map_export_title: '匯出清單',
        treasure_map_export_instruction: '請複製以下內容：',
        treasure_map_import_title: '匯入清單',
        treasure_map_import_instruction: '請貼上清單內容：',
        treasure_map_import_placeholder: '在此貼上清單資料...',
        treasure_map_import_success: '已匯入 {count} 張寶圖',
        treasure_map_import_merged: '已合併匯入 {count} 張新寶圖',
        treasure_map_copy_clipboard_success: '已複製到剪貼簿',
        treasure_map_route_summary: '路線摘要：',
        treasure_map_route_regions: '地區順序：{regions}',
        treasure_map_route_teleports: '總傳送次數：{count}',
        treasure_map_route_total_maps: '總寶圖數量：{count}',
        treasure_map_route_teleport_to: '傳送至 {name}'
    },
    en: {
        // Page info
        treasure_map_title: 'Treasure Map Finder - FF14.tw',
        treasure_map_description: 'FF14 treasure map location finder with filters and personal list management',

        // Page header
        treasure_map_header: 'Treasure Map Finder',

        // Top actions
        treasure_map_my_list: 'My List',
        treasure_map_create_room: 'Create Room',
        treasure_map_join_room: 'Join Room',

        // Room section
        treasure_map_room_code: 'Room Code:',
        treasure_map_last_update: 'Last Update:',
        treasure_map_room_ttl: 'Remaining:',
        treasure_map_your_nickname: 'Your Nickname:',
        treasure_map_leave_room: 'Leave Room',
        treasure_map_team_members: 'Team Members:',

        // Filter section
        treasure_map_filter_title: 'Filters',
        treasure_map_reset_filters: 'Reset Filters',
        treasure_map_level_filter: 'Map Level',
        treasure_map_map_filter: 'Zone',
        treasure_map_multi_select: 'Multi-select',

        // Results section
        treasure_map_results: 'Showing {count} results',
        treasure_map_load_more: 'Load More',

        // Data source
        treasure_map_data_source: 'Data Source',
        treasure_map_data_source_intro: 'Coordinate data sourced from',

        // Panel actions
        treasure_map_export: 'Export',
        treasure_map_import: 'Import',
        treasure_map_clear_all: 'Clear All',
        treasure_map_list_tab: 'List',
        treasure_map_history_tab: 'History',
        treasure_map_total: 'Total:',
        treasure_map_maps_unit: 'maps',
        treasure_map_generate_route: 'Generate Route',

        // Route panel
        treasure_map_best_route: 'Best Route',
        treasure_map_copy_route: 'Copy Route',
        treasure_map_custom_format: 'Custom Format',

        // Format settings panel
        treasure_map_custom_output: 'Custom Output Format',
        treasure_map_quick_lang: 'Quick Language Templates:',
        treasure_map_teleport_format: 'Teleport Format',
        treasure_map_map_format: 'Map Format',
        treasure_map_available_vars: 'Available Variables:',
        treasure_map_preview: 'Preview',
        treasure_map_reset_default: 'Reset to Default',
        treasure_map_save_settings: 'Save Settings',

        // Join room dialog
        treasure_map_join_title: 'Join Room',
        treasure_map_enter_code: 'Enter Room Code:',
        treasure_map_code_placeholder: 'e.g., A3B7K9',
        treasure_map_code_hint: 'Get the 6-character code from the room leader',

        // Edit nickname dialog
        treasure_map_edit_nickname: 'Edit Nickname',
        treasure_map_nickname_label: 'Your Nickname:',
        treasure_map_nickname_placeholder: 'Enter nickname',
        treasure_map_nickname_hint: 'Other members will see your nickname',

        // Leave room dialog
        treasure_map_leave_title: 'Leave Room',
        treasure_map_leave_confirm: 'Are you sure you want to leave?',
        treasure_map_keep_list_question: 'Keep your local treasure map list?',
        treasure_map_keep_and_leave: 'Keep List & Leave',
        treasure_map_clear_and_leave: 'Clear List & Leave',

        // Common buttons
        treasure_map_cancel: 'Cancel',
        treasure_map_confirm: 'Confirm',
        treasure_map_join: 'Join',
        treasure_map_close: 'Close',

        // Messages
        treasure_map_copy_success: 'Coordinates copied',
        treasure_map_copy_failed: 'Copy failed',
        treasure_map_copy_manual: 'Browser does not support auto-copy, please select text and press Ctrl+C to copy',
        treasure_map_copy_fallback_manual: 'Copy failed, please select text and press Ctrl+C to copy',
        treasure_map_remove_confirm: 'Are you sure you want to remove this map?',
        treasure_map_clear_confirm: 'Are you sure you want to clear all maps? Total: {count}',
        treasure_map_empty_list: 'List is empty',
        treasure_map_list_hint: 'Click "Add to List" on map cards to start building',
        treasure_map_loading: 'Loading...',
        treasure_map_load_failed: 'Failed to load map data, please refresh the page.',
        treasure_map_reload: 'Reload',
        treasure_map_no_maps_for_route: 'At least 2 maps are required to generate a route',
        treasure_map_no_route_to_copy: 'No route available to copy',
        treasure_map_loading_aetherytes: 'Loading aetheryte data, please try again later',
        treasure_map_route_copy_success: 'Copied {count} locations',
        treasure_map_added_to_list: '✓ Added',
        treasure_map_add_to_list: 'Add to List',
        treasure_map_view_detail: 'Detail Map',
        treasure_map_view_detail_tooltip: 'View detailed map',
        treasure_map_pos_placeholder: 'Coords: {coords}',

        // Dialogs and List Messages
        treasure_map_item_already_in_list: 'Item already in list',
        treasure_map_list_full: 'List is full ({current}/{max})',
        treasure_map_item_added: 'Added to list',
        treasure_map_item_not_in_list: 'Item not in list',
        treasure_map_item_removed: 'Removed from list',
        treasure_map_list_cleared: 'List cleared',
        treasure_map_export_title: 'Export List',
        treasure_map_export_instruction: 'Please copy the content below:',
        treasure_map_import_title: 'Import List',
        treasure_map_import_instruction: 'Please paste the list content:',
        treasure_map_import_placeholder: 'Paste list data here...',
        treasure_map_import_success: 'Imported {count} maps',
        treasure_map_import_merged: 'Merged {count} new maps',
        treasure_map_copy_clipboard_success: 'Copied to clipboard',
        treasure_map_route_summary: 'Route Summary:',
        treasure_map_route_regions: 'Region Order: {regions}',
        treasure_map_route_teleports: 'Total Teleports: {count}',
        treasure_map_route_total_maps: 'Total Maps: {count}',
        treasure_map_route_teleport_to: 'Teleport to {name}'
    },
    ja: {
        // ページ情報
        treasure_map_title: '宝の地図検索 - FF14.tw',
        treasure_map_description: 'FF14 宝の地図位置検索ツール、フィルターと個人リスト管理をサポート',

        // ページヘッダー
        treasure_map_header: '宝の地図検索',

        // トップアクション
        treasure_map_my_list: 'マイリスト',
        treasure_map_create_room: 'ルーム作成',
        treasure_map_join_room: 'ルーム参加',

        // ルームセクション
        treasure_map_room_code: 'ルームコード：',
        treasure_map_last_update: '最終更新：',
        treasure_map_room_ttl: '残り：',
        treasure_map_your_nickname: 'あなたの名前：',
        treasure_map_leave_room: 'ルームを離れる',
        treasure_map_team_members: 'メンバー：',

        // フィルターセクション
        treasure_map_filter_title: 'フィルター',
        treasure_map_reset_filters: 'フィルターリセット',
        treasure_map_level_filter: '地図レベル',
        treasure_map_map_filter: 'エリア',
        treasure_map_multi_select: '複数選択可',

        // 結果セクション
        treasure_map_results: '{count} 件の結果を表示',
        treasure_map_load_more: 'さらに読み込む',

        // データソース
        treasure_map_data_source: 'データソース',
        treasure_map_data_source_intro: '座標データの出典：',

        // パネルアクション
        treasure_map_export: 'エクスポート',
        treasure_map_import: 'インポート',
        treasure_map_clear_all: 'すべてクリア',
        treasure_map_list_tab: 'リスト',
        treasure_map_history_tab: '履歴',
        treasure_map_total: '合計：',
        treasure_map_maps_unit: '枚の地図',
        treasure_map_generate_route: 'ルート生成',

        // ルートパネル
        treasure_map_best_route: '最適ルート',
        treasure_map_copy_route: 'ルートをコピー',
        treasure_map_custom_format: 'カスタム形式',

        // フォーマット設定パネル
        treasure_map_custom_output: 'カスタム出力形式',
        treasure_map_quick_lang: '言語テンプレート切替：',
        treasure_map_teleport_format: 'テレポ形式',
        treasure_map_map_format: '地図形式',
        treasure_map_available_vars: '使用可能な変数：',
        treasure_map_preview: 'プレビュー',
        treasure_map_reset_default: 'デフォルトに戻す',
        treasure_map_save_settings: '設定を保存',

        // ルーム参加ダイアログ
        treasure_map_join_title: 'ルーム参加',
        treasure_map_enter_code: 'ルームコードを入力：',
        treasure_map_code_placeholder: '例：A3B7K9',
        treasure_map_code_hint: 'リーダーから6桁のコードを取得してください',

        // ニックネーム編集ダイアログ
        treasure_map_edit_nickname: 'ニックネーム編集',
        treasure_map_nickname_label: 'あなたの名前：',
        treasure_map_nickname_placeholder: 'ニックネームを入力',
        treasure_map_nickname_hint: '他のメンバーに表示されます',

        // ルーム退出ダイアログ
        treasure_map_leave_title: 'ルームを離れる',
        treasure_map_leave_confirm: '本当にルームを離れますか？',
        treasure_map_keep_list_question: 'ローカルリストを保持しますか？',
        treasure_map_keep_and_leave: 'リストを保持して離れる',
        treasure_map_clear_and_leave: 'リストをクリアして離れる',

        // 共通ボタン
        treasure_map_cancel: 'キャンセル',
        treasure_map_confirm: '確認',
        treasure_map_join: '参加',
        treasure_map_close: '閉じる',

        // メッセージ
        treasure_map_copy_success: '座標をコピーしました',
        treasure_map_copy_failed: 'コピーに失敗しました',
        treasure_map_copy_manual: 'ブラウザが自動コピーに対応していません。テキストを選択して Ctrl+C でコピーしてください',
        treasure_map_copy_fallback_manual: 'コピーに失敗しました。テキストを選択して Ctrl+C でコピーしてください',
        treasure_map_remove_confirm: 'この地図を削除してもよろしいですか？',
        treasure_map_clear_confirm: 'すべての地図をクリアしてもよろしいですか？合計：{count} 枚',
        treasure_map_empty_list: 'リストは空です',
        treasure_map_list_hint: 'カードの「リストに追加」をクリックして作成を開始します',
        treasure_map_loading: '読み込み中...',
        treasure_map_load_failed: 'データの読み込みに失敗しました。ページを更新してください。',
        treasure_map_reload: '再読み込み',
        treasure_map_no_maps_for_route: 'ルート生成には少なくとも 2 枚の地図が必要です',
        treasure_map_no_route_to_copy: 'コピーできるルートがありません',
        treasure_map_loading_aetherytes: 'エーテライトデータを読み込み中。後でもう一度お試しください',
        treasure_map_route_copy_success: '{count} 箇所の地点をコピーしました',
        treasure_map_added_to_list: '✓ 追加済み',
        treasure_map_add_to_list: 'リストに追加',
        treasure_map_view_detail: '詳細地図',
        treasure_map_view_detail_tooltip: '詳細地図を表示',
        treasure_map_pos_placeholder: '座標：{coords}',

        // ダイアログとリストメッセージ
        treasure_map_item_already_in_list: 'この地図は既にリストにあります',
        treasure_map_list_full: 'リストがいっぱいです ({current}/{max})',
        treasure_map_item_added: 'リストに追加しました',
        treasure_map_item_not_in_list: 'この地図はリストにありません',
        treasure_map_item_removed: 'リストから削除しました',
        treasure_map_list_cleared: 'リストをクリアしました',
        treasure_map_export_title: 'リストのエクスポート',
        treasure_map_export_instruction: '以下の内容をコピーしてください：',
        treasure_map_import_title: 'リストのインポート',
        treasure_map_import_instruction: 'リストの内容を貼り付けてください：',
        treasure_map_import_placeholder: 'ここにリストデータを貼り付け...',
        treasure_map_import_success: '{count} 枚の地図をインポートしました',
        treasure_map_import_merged: '{count} 枚の新しい地図をマージしました',
        treasure_map_copy_clipboard_success: 'クリップボードにコピーしました',
        treasure_map_route_summary: 'ルート概要：',
        treasure_map_route_regions: 'エリア順序：{regions}',
        treasure_map_route_teleports: '総テレポ回数：{count}',
        treasure_map_route_total_maps: '総地図数：{count}',
        treasure_map_route_teleport_to: '{name} へテレポ'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('treasure-map-finder', TreasureMapTranslations);
}
