/**
 * FF14.tw 仙人微彩計算機翻譯檔
 */
const MiniCactpotTranslations = {
    zh: {
        // 頁面資訊
        mini_cactpot_title: '仙人微彩計算機 - FF14.tw',
        mini_cactpot_description: 'FF14 仙人微彩最佳策略計算工具，分析期望值並推薦最佳選擇',

        // 頁面標題
        mini_cactpot_header: '仙人微彩計算機',
        mini_cactpot_desc: '點選四個格子並輸入對應數字 (1-9)，期望值將自動顯示在對應位置並推薦最佳線條',

        // 格子資訊
        mini_cactpot_selected: '已選擇',
        mini_cactpot_cells: '個格子',

        // 按鈕
        mini_cactpot_undo: '回到上一步',
        mini_cactpot_reset: '重置',

        // 最佳選擇
        mini_cactpot_best_choice: '最佳選擇',
        mini_cactpot_expected_value: '期望值',
        mini_cactpot_range: '範圍',

        // 線條名稱
        mini_cactpot_line_row_top: '上橫列',
        mini_cactpot_line_row_mid: '中橫列',
        mini_cactpot_line_row_bot: '下橫列',
        mini_cactpot_line_col_left: '左直行',
        mini_cactpot_line_col_mid: '中直行',
        mini_cactpot_line_col_right: '右直行',
        mini_cactpot_line_diag_left: '左斜線',
        mini_cactpot_line_diag_right: '右斜線',

        // Toast 訊息
        mini_cactpot_max_cells: '最多只能選擇 4 個格子',
        mini_cactpot_number_used: '數字 {value} 已被使用',
        mini_cactpot_undone: '已回到上一步',
        mini_cactpot_reset_done: '已重置九宮格',

        // Popup
        mini_cactpot_popup_title: '選擇數字',
        mini_cactpot_popup_cancel: '取消',
    },
    en: {
        // Page info
        mini_cactpot_title: 'Mini Cactpot Calculator - FF14.tw',
        mini_cactpot_description: 'FF14 Mini Cactpot optimal strategy calculator with expected value analysis',

        // Page header
        mini_cactpot_header: 'Mini Cactpot Calculator',
        mini_cactpot_desc: 'Select 4 cells and enter numbers (1-9). Expected values will display automatically with the best line recommendation',

        // Grid info
        mini_cactpot_selected: 'Selected',
        mini_cactpot_cells: 'cells',

        // Buttons
        mini_cactpot_undo: 'Undo',
        mini_cactpot_reset: 'Reset',

        // Best choice
        mini_cactpot_best_choice: 'Best Choice',
        mini_cactpot_expected_value: 'Expected Value',
        mini_cactpot_range: 'Range',

        // Line names
        mini_cactpot_line_row_top: 'Top Row',
        mini_cactpot_line_row_mid: 'Middle Row',
        mini_cactpot_line_row_bot: 'Bottom Row',
        mini_cactpot_line_col_left: 'Left Column',
        mini_cactpot_line_col_mid: 'Middle Column',
        mini_cactpot_line_col_right: 'Right Column',
        mini_cactpot_line_diag_left: 'Left Diagonal',
        mini_cactpot_line_diag_right: 'Right Diagonal',

        // Toast messages
        mini_cactpot_max_cells: 'Maximum 4 cells can be selected',
        mini_cactpot_number_used: 'Number {value} is already used',
        mini_cactpot_undone: 'Undone',
        mini_cactpot_reset_done: 'Grid has been reset',

        // Popup
        mini_cactpot_popup_title: 'Select Number',
        mini_cactpot_popup_cancel: 'Cancel',
    },
    ja: {
        // ページ情報
        mini_cactpot_title: 'ミニくじテンダー計算機 - FF14.tw',
        mini_cactpot_description: 'FF14 ミニくじテンダーの最適戦略計算機、期待値分析と最適ライン推奨',

        // ページヘッダー
        mini_cactpot_header: 'ミニくじテンダー計算機',
        mini_cactpot_desc: '4つのマスを選択して数字（1-9）を入力すると、期待値が自動的に表示され、最適なラインが推奨されます',

        // グリッド情報
        mini_cactpot_selected: '選択済み',
        mini_cactpot_cells: 'マス',

        // ボタン
        mini_cactpot_undo: '元に戻す',
        mini_cactpot_reset: 'リセット',

        // 最適選択
        mini_cactpot_best_choice: '最適な選択',
        mini_cactpot_expected_value: '期待値',
        mini_cactpot_range: '範囲',

        // ライン名
        mini_cactpot_line_row_top: '上段横列',
        mini_cactpot_line_row_mid: '中段横列',
        mini_cactpot_line_row_bot: '下段横列',
        mini_cactpot_line_col_left: '左縦列',
        mini_cactpot_line_col_mid: '中央縦列',
        mini_cactpot_line_col_right: '右縦列',
        mini_cactpot_line_diag_left: '左斜め',
        mini_cactpot_line_diag_right: '右斜め',

        // Toastメッセージ
        mini_cactpot_max_cells: '最大4つのマスのみ選択できます',
        mini_cactpot_number_used: '数字 {value} は既に使用されています',
        mini_cactpot_undone: '元に戻しました',
        mini_cactpot_reset_done: 'グリッドをリセットしました',

        // ポップアップ
        mini_cactpot_popup_title: '数字を選択',
        mini_cactpot_popup_cancel: 'キャンセル'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('mini-cactpot', MiniCactpotTranslations);
}
