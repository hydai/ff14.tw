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

        // 狀態列
        mini_cactpot_status_start: '① 點遊戲已經翻開的那一格',

        // 按鈕
        mini_cactpot_undo: '上一步',
        mini_cactpot_next: '下一張',

        // 線條名稱
        mini_cactpot_line_row_top: '上橫列',
        mini_cactpot_line_row_mid: '中橫列',
        mini_cactpot_line_row_bot: '下橫列',
        mini_cactpot_line_col_left: '左直行',
        mini_cactpot_line_col_mid: '中直行',
        mini_cactpot_line_col_right: '右直行',
        mini_cactpot_line_diag_left: '左斜線',
        mini_cactpot_line_diag_right: '右斜線',

        // 格子位置名稱
        mini_cactpot_pos_top_left: '左上',
        mini_cactpot_pos_top_center: '上中',
        mini_cactpot_pos_top_right: '右上',
        mini_cactpot_pos_mid_left: '左中',
        mini_cactpot_pos_center: '中央',
        mini_cactpot_pos_mid_right: '右中',
        mini_cactpot_pos_bot_left: '左下',
        mini_cactpot_pos_bot_center: '下中',
        mini_cactpot_pos_bot_right: '右下'
    },
    en: {
        // Page info
        mini_cactpot_title: 'Mini Cactpot Calculator - FF14.tw',
        mini_cactpot_description: 'FF14 Mini Cactpot optimal strategy calculator with expected value analysis',

        // Page header
        mini_cactpot_header: 'Mini Cactpot Calculator',

        // Status line
        mini_cactpot_status_start: '① Click the cell the game has already revealed',

        // Buttons
        mini_cactpot_undo: 'Undo',
        mini_cactpot_next: 'Next ticket',

        // Line names
        mini_cactpot_line_row_top: 'Top Row',
        mini_cactpot_line_row_mid: 'Middle Row',
        mini_cactpot_line_row_bot: 'Bottom Row',
        mini_cactpot_line_col_left: 'Left Column',
        mini_cactpot_line_col_mid: 'Middle Column',
        mini_cactpot_line_col_right: 'Right Column',
        mini_cactpot_line_diag_left: 'Left Diagonal',
        mini_cactpot_line_diag_right: 'Right Diagonal',

        // Cell position names
        mini_cactpot_pos_top_left: 'Top Left',
        mini_cactpot_pos_top_center: 'Top Center',
        mini_cactpot_pos_top_right: 'Top Right',
        mini_cactpot_pos_mid_left: 'Middle Left',
        mini_cactpot_pos_center: 'Center',
        mini_cactpot_pos_mid_right: 'Middle Right',
        mini_cactpot_pos_bot_left: 'Bottom Left',
        mini_cactpot_pos_bot_center: 'Bottom Center',
        mini_cactpot_pos_bot_right: 'Bottom Right'
    },
    ja: {
        // ページ情報
        mini_cactpot_title: 'ミニくじテンダー計算機 - FF14.tw',
        mini_cactpot_description: 'FF14 ミニくじテンダーの最適戦略計算機、期待値分析と最適ライン推奨',

        // ページヘッダー
        mini_cactpot_header: 'ミニくじテンダー計算機',

        // ステータス行
        mini_cactpot_status_start: '① ゲームで最初から開いているマスをクリック',

        // ボタン
        mini_cactpot_undo: '元に戻す',
        mini_cactpot_next: '次のくじ',

        // ライン名
        mini_cactpot_line_row_top: '上段横列',
        mini_cactpot_line_row_mid: '中段横列',
        mini_cactpot_line_row_bot: '下段横列',
        mini_cactpot_line_col_left: '左縦列',
        mini_cactpot_line_col_mid: '中央縦列',
        mini_cactpot_line_col_right: '右縦列',
        mini_cactpot_line_diag_left: '左斜め',
        mini_cactpot_line_diag_right: '右斜め',

        // マス位置名
        mini_cactpot_pos_top_left: '左上',
        mini_cactpot_pos_top_center: '上中央',
        mini_cactpot_pos_top_right: '右上',
        mini_cactpot_pos_mid_left: '左中央',
        mini_cactpot_pos_center: '中央',
        mini_cactpot_pos_mid_right: '右中央',
        mini_cactpot_pos_bot_left: '左下',
        mini_cactpot_pos_bot_center: '下中央',
        mini_cactpot_pos_bot_right: '右下'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('mini-cactpot', MiniCactpotTranslations);
}
