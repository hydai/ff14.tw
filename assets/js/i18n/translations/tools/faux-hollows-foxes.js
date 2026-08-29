/**
 * FF14.tw Faux Hollows Foxes 計算機翻譯檔
 */
const FauxHollowsTranslations = {
    zh: {
        // 頁面資訊
        faux_hollows_title: 'Faux Hollows Foxes 計算機 - FF14.tw',
        faux_hollows_description: '計算 FF14 Faux Hollows Foxes 活動的最佳點擊策略',

        // 頁面標題
        faux_hollows_header: 'Faux Hollows Foxes 計算機',

        // 遊戲提示
        faux_hollows_hint: '💡 提示：請先點擊兩個格子設定為障礙物，系統將自動判斷並填充剩餘的障礙物位置',

        // 遊戲資訊
        faux_hollows_remaining_clicks: '剩餘點擊次數',
        faux_hollows_matching_boards: '符合盤面',
        faux_hollows_boards_unit: '種',

        // 按鈕
        faux_hollows_reset: '重置遊戲',
        faux_hollows_undo: '回到上一步',
        faux_hollows_redo: '重做',
        faux_hollows_hide_prob: '隱藏機率',
        faux_hollows_show_prob: '顯示機率',
        faux_hollows_close_best: '關閉最佳策略',
        faux_hollows_show_best: '顯示最佳策略',

        // 彈窗
        faux_hollows_popup_title: '選擇此格類型',
        faux_hollows_popup_obstacle: '🚫 障礙物',
        faux_hollows_popup_sword: '⚔️ 劍 (2x3)',
        faux_hollows_popup_chest: '📦 寶箱 (2x2)',
        faux_hollows_popup_fox: '🦊 宗長 (1x1)',
        faux_hollows_popup_empty: '✅ 空格',
        faux_hollows_popup_clear: '🗑️ 清除',
        faux_hollows_popup_cancel: '取消',

        // 結果面板
        faux_hollows_result_title: '遊戲結果',
        faux_hollows_final_score: '最終得分',
        faux_hollows_score_unit: ' 分',

        // 資料來源
        faux_hollows_data_source: '盤面資料來源',

        // 返回頂部
        faux_hollows_back_to_top: '回到頂部',

        // Toast 訊息
        faux_hollows_obstacles_confirmed: '障礙物位置已確認！現在顯示寶物機率，點擊格子可填寫實際發現的寶物',
        faux_hollows_all_obstacles_confirmed: '所有障礙物位置已確定！現在顯示寶物機率，點擊格子可填寫實際發現的寶物',
        faux_hollows_auto_filled: '已自動填充 {count} 個確定的障礙物位置',
        faux_hollows_max_clicks: '已達到最大點擊次數！',
        faux_hollows_cannot_modify: '此格子無法修改！',
        faux_hollows_cell_occupied: '此格子已被佔用！',
        faux_hollows_fox_limit: '宗長只能放置 1 格！',
        faux_hollows_sword_limit: '劍最多只能放置 6 格！',
        faux_hollows_chest_limit: '寶箱最多只能放置 4 格！',
        faux_hollows_fox_error: '錯誤：宗長只能有 0 或 1 格！',
        faux_hollows_sword_error: '錯誤：劍最多只能有 6 格！',
        faux_hollows_sword_shape_error: '錯誤：6 格劍必須形成 2x3 或 3x2 的形狀！',
        faux_hollows_chest_error: '錯誤：寶箱最多只能有 4 格！',
        faux_hollows_chest_shape_error: '錯誤：4 格寶箱必須形成 2x2 的形狀！',

        // 格子內容
        faux_hollows_cell_fox: '狐',
        faux_hollows_cell_sword: '劍',
        faux_hollows_cell_chest: '箱',

        // 格子無障礙標籤與狀態
        faux_hollows_cell_label: '第 {n} 格',
        faux_hollows_cell_state_obstacle: '障礙物',
        faux_hollows_cell_state_sword: '劍',
        faux_hollows_cell_state_chest: '寶箱',
        faux_hollows_cell_state_fox: '宗長',
        faux_hollows_cell_state_empty: '空格',
        faux_hollows_cell_state_used: '已用',
        faux_hollows_cell_state_unknown: '未揭開',
        faux_hollows_cell_obstacle_prob: '障礙物機率 {value}'
    },
    en: {
        // Page info
        faux_hollows_title: 'Faux Hollows Calculator - FF14.tw',
        faux_hollows_description: 'Calculate optimal clicking strategy for FF14 Faux Hollows event',

        // Page header
        faux_hollows_header: 'Faux Hollows Calculator',

        // Game hint
        faux_hollows_hint: '💡 Tip: Click two cells to set as obstacles, the system will auto-detect and fill remaining obstacle positions',

        // Game info
        faux_hollows_remaining_clicks: 'Remaining Clicks',
        faux_hollows_matching_boards: 'Matching Boards',
        faux_hollows_boards_unit: '',

        // Buttons
        faux_hollows_reset: 'Reset Game',
        faux_hollows_undo: 'Undo',
        faux_hollows_redo: 'Redo',
        faux_hollows_hide_prob: 'Hide Probability',
        faux_hollows_show_prob: 'Show Probability',
        faux_hollows_close_best: 'Close Best Strategy',
        faux_hollows_show_best: 'Show Best Strategy',

        // Popup
        faux_hollows_popup_title: 'Select Cell Type',
        faux_hollows_popup_obstacle: '🚫 Obstacle',
        faux_hollows_popup_sword: '⚔️ Sword (2x3)',
        faux_hollows_popup_chest: '📦 Chest (2x2)',
        faux_hollows_popup_fox: '🦊 Fox (1x1)',
        faux_hollows_popup_empty: '✅ Empty',
        faux_hollows_popup_clear: '🗑️ Clear',
        faux_hollows_popup_cancel: 'Cancel',

        // Result panel
        faux_hollows_result_title: 'Game Result',
        faux_hollows_final_score: 'Final Score',
        faux_hollows_score_unit: ' pts',

        // Data source
        faux_hollows_data_source: 'Board data source',

        // Back to top
        faux_hollows_back_to_top: 'Back to top',

        // Toast messages
        faux_hollows_obstacles_confirmed: 'Obstacles confirmed! Now showing treasure probabilities, click cells to fill in actual discoveries',
        faux_hollows_all_obstacles_confirmed: 'All obstacles confirmed! Now showing treasure probabilities, click cells to fill in actual discoveries',
        faux_hollows_auto_filled: 'Auto-filled {count} confirmed obstacle positions',
        faux_hollows_max_clicks: 'Maximum clicks reached!',
        faux_hollows_cannot_modify: 'This cell cannot be modified!',
        faux_hollows_cell_occupied: 'This cell is occupied!',
        faux_hollows_fox_limit: 'Fox can only occupy 1 cell!',
        faux_hollows_sword_limit: 'Sword can occupy maximum 6 cells!',
        faux_hollows_chest_limit: 'Chest can occupy maximum 4 cells!',
        faux_hollows_fox_error: 'Error: Fox can only have 0 or 1 cell!',
        faux_hollows_sword_error: 'Error: Sword can have maximum 6 cells!',
        faux_hollows_sword_shape_error: 'Error: 6-cell sword must form 2x3 or 3x2 shape!',
        faux_hollows_chest_error: 'Error: Chest can have maximum 4 cells!',
        faux_hollows_chest_shape_error: 'Error: 4-cell chest must form 2x2 shape!',

        // Cell content
        faux_hollows_cell_fox: 'Fox',
        faux_hollows_cell_sword: 'Swd',
        faux_hollows_cell_chest: 'Box',

        // Cell accessible label and state
        faux_hollows_cell_label: 'Cell {n}',
        faux_hollows_cell_state_obstacle: 'Obstacle',
        faux_hollows_cell_state_sword: 'Sword',
        faux_hollows_cell_state_chest: 'Chest',
        faux_hollows_cell_state_fox: 'Fox',
        faux_hollows_cell_state_empty: 'Empty',
        faux_hollows_cell_state_used: 'Used',
        faux_hollows_cell_state_unknown: 'Unrevealed',
        faux_hollows_cell_obstacle_prob: 'Obstacle probability {value}'
    },
    ja: {
        // ページ情報
        faux_hollows_title: '幻フォールスホロー計算機 - FF14.tw',
        faux_hollows_description: 'FF14 幻フォールスホローイベントの最適クリック戦略を計算',

        // ページヘッダー
        faux_hollows_header: '幻フォールスホロー計算機',

        // ゲームヒント
        faux_hollows_hint: '💡 ヒント：2つのセルをクリックして障害物として設定すると、システムが自動的に残りの障害物位置を検出して埋めます',

        // ゲーム情報
        faux_hollows_remaining_clicks: '残りクリック数',
        faux_hollows_matching_boards: '一致するボード',
        faux_hollows_boards_unit: '種',

        // ボタン
        faux_hollows_reset: 'ゲームをリセット',
        faux_hollows_undo: '元に戻す',
        faux_hollows_redo: 'やり直す',
        faux_hollows_hide_prob: '確率を隠す',
        faux_hollows_show_prob: '確率を表示',
        faux_hollows_close_best: '最適戦略を閉じる',
        faux_hollows_show_best: '最適戦略を表示',

        // ポップアップ
        faux_hollows_popup_title: 'セルタイプを選択',
        faux_hollows_popup_obstacle: '🚫 障害物',
        faux_hollows_popup_sword: '⚔️ 剣 (2x3)',
        faux_hollows_popup_chest: '📦 宝箱 (2x2)',
        faux_hollows_popup_fox: '🦊 宗長 (1x1)',
        faux_hollows_popup_empty: '✅ 空',
        faux_hollows_popup_clear: '🗑️ クリア',
        faux_hollows_popup_cancel: 'キャンセル',

        // 結果パネル
        faux_hollows_result_title: 'ゲーム結果',
        faux_hollows_final_score: '最終スコア',
        faux_hollows_score_unit: '点',

        // データソース
        faux_hollows_data_source: 'ボードデータソース',

        // トップに戻る
        faux_hollows_back_to_top: 'トップに戻る',

        // Toastメッセージ
        faux_hollows_obstacles_confirmed: '障害物の位置が確認されました！宝物の確率を表示中、セルをクリックして実際の発見を入力',
        faux_hollows_all_obstacles_confirmed: 'すべての障害物の位置が確定しました！宝物の確率を表示中、セルをクリックして実際の発見を入力',
        faux_hollows_auto_filled: '{count}個の確定した障害物位置を自動入力しました',
        faux_hollows_max_clicks: '最大クリック数に達しました！',
        faux_hollows_cannot_modify: 'このセルは変更できません！',
        faux_hollows_cell_occupied: 'このセルは使用中です！',
        faux_hollows_fox_limit: '宗長は1セルのみ配置可能！',
        faux_hollows_sword_limit: '剣は最大6セルまで！',
        faux_hollows_chest_limit: '宝箱は最大4セルまで！',
        faux_hollows_fox_error: 'エラー：宗長は0または1セルのみ！',
        faux_hollows_sword_error: 'エラー：剣は最大6セルまで！',
        faux_hollows_sword_shape_error: 'エラー：6セルの剣は2x3または3x2の形状である必要があります！',
        faux_hollows_chest_error: 'エラー：宝箱は最大4セルまで！',
        faux_hollows_chest_shape_error: 'エラー：4セルの宝箱は2x2の形状である必要があります！',

        // セル内容
        faux_hollows_cell_fox: '狐',
        faux_hollows_cell_sword: '剣',
        faux_hollows_cell_chest: '箱',

        // セルのアクセシブルラベルと状態
        faux_hollows_cell_label: 'マス {n}',
        faux_hollows_cell_state_obstacle: '障害物',
        faux_hollows_cell_state_sword: '剣',
        faux_hollows_cell_state_chest: '宝箱',
        faux_hollows_cell_state_fox: '狐',
        faux_hollows_cell_state_empty: '空き',
        faux_hollows_cell_state_used: '使用済み',
        faux_hollows_cell_state_unknown: '未公開',
        faux_hollows_cell_obstacle_prob: '障害物確率 {value}'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('faux-hollows-foxes', FauxHollowsTranslations);
}
