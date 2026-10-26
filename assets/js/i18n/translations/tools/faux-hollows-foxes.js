/**
 * FF14.tw 宗長計算機翻譯檔
 */
const FauxHollowsTranslations = {
    zh: {
        // 頁面資訊
        faux_hollows_title: '宗長計算機 - FF14.tw',
        faux_hollows_description: '計算 FF14 Faux Hollows Foxes 活動的最佳點擊策略',

        // 頁面標題
        faux_hollows_header: '宗長計算機',

        // 狀態列
        faux_hollows_status_obstacles: '① 點遊戲裡被擋住的格子',
        faux_hollows_status_obstacles_known: '① 點遊戲裡被擋住的格子・已知 {n}／5',
        faux_hollows_status_sword: '② 找劍・剩 {n} 次',

        // 按鈕
        faux_hollows_undo: '回到上一步',

        // 彈窗
        faux_hollows_popup_sword: '⚔️ 劍 (2x3)',
        faux_hollows_popup_chest: '📦 寶箱 (2x2)',
        faux_hollows_popup_fox: '🦊 宗長 (1x1)',
        faux_hollows_popup_empty: '✅ 空格',
        faux_hollows_popup_clear: '🗑️ 清除',

        // 資料來源
        faux_hollows_data_source: '盤面資料來源',

        // 格子內容
        faux_hollows_candidate_note: '宗長標記只表示候選位置，不代表出現機率；找到宗長後會移除其他候選提示。',

        // 格子無障礙標籤與狀態
        faux_hollows_cell_label: '第 {n} 格',
        faux_hollows_cell_state_obstacle: '障礙物',
        faux_hollows_cell_state_auto: '障礙物（自動補上）',
        faux_hollows_cell_state_sword: '劍',
        faux_hollows_cell_state_chest: '寶箱',
        faux_hollows_cell_state_fox: '宗長',
        faux_hollows_cell_state_empty: '空格'
    },
    en: {
        // Page info
        faux_hollows_title: 'Faux Hollows Calculator - FF14.tw',
        faux_hollows_description: 'Calculate optimal clicking strategy for FF14 Faux Hollows event',

        // Page header
        faux_hollows_header: 'Faux Hollows Calculator',

        // Status line
        faux_hollows_status_obstacles: '① Mark the blocked cells',
        faux_hollows_status_obstacles_known: '① Mark the blocked cells · {n}/5 known',
        faux_hollows_status_sword: '② Find the sword · Clicks left: {n}',

        // Buttons
        faux_hollows_undo: 'Undo',

        // Popup
        faux_hollows_popup_sword: '⚔️ Sword (2x3)',
        faux_hollows_popup_chest: '📦 Chest (2x2)',
        faux_hollows_popup_fox: '🦊 Fox (1x1)',
        faux_hollows_popup_empty: '✅ Empty',
        faux_hollows_popup_clear: '🗑️ Clear',

        // Data source
        faux_hollows_data_source: 'Board data source',

        // Cell content
        faux_hollows_candidate_note: 'Fox markers show possible locations, not spawn probabilities. Other candidates disappear once the fox is found.',

        // Cell accessible label and state
        faux_hollows_cell_label: 'Cell {n}',
        faux_hollows_cell_state_obstacle: 'Obstacle',
        faux_hollows_cell_state_auto: 'Obstacle (filled in)',
        faux_hollows_cell_state_sword: 'Sword',
        faux_hollows_cell_state_chest: 'Chest',
        faux_hollows_cell_state_fox: 'Fox',
        faux_hollows_cell_state_empty: 'Empty'
    },
    ja: {
        // ページ情報
        faux_hollows_title: '幻フォールスホロー計算機 - FF14.tw',
        faux_hollows_description: 'FF14 幻フォールスホローイベントの最適クリック戦略を計算',

        // ページヘッダー
        faux_hollows_header: '幻フォールスホロー計算機',

        // ステータス行
        faux_hollows_status_obstacles: '① ふさがれたマスをクリック',
        faux_hollows_status_obstacles_known: '① ふさがれたマスをクリック・判明 {n}／5',
        faux_hollows_status_sword: '② 剣を探す・残り {n} 回',

        // ボタン
        faux_hollows_undo: '元に戻す',

        // ポップアップ
        faux_hollows_popup_sword: '⚔️ 剣 (2x3)',
        faux_hollows_popup_chest: '📦 宝箱 (2x2)',
        faux_hollows_popup_fox: '🦊 宗長 (1x1)',
        faux_hollows_popup_empty: '✅ 空',
        faux_hollows_popup_clear: '🗑️ クリア',

        // データソース
        faux_hollows_data_source: 'ボードデータソース',

        // セル内容
        faux_hollows_candidate_note: '宗長の表示は候補位置であり、出現確率ではありません。宗長を発見すると他の候補表示は消えます。',

        // セルのアクセシブルラベルと状態
        faux_hollows_cell_label: 'マス {n}',
        faux_hollows_cell_state_obstacle: '障害物',
        faux_hollows_cell_state_auto: '障害物（自動）',
        faux_hollows_cell_state_sword: '剣',
        faux_hollows_cell_state_chest: '宝箱',
        faux_hollows_cell_state_fox: '狐',
        faux_hollows_cell_state_empty: '空き'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('faux-hollows-foxes', FauxHollowsTranslations);
}
