/**
 * FF14.tw Wondrous Tails 預測器翻譯檔
 */
const WondrousTailsTranslations = {
    zh: {
        // 頁面資訊
        wondrous_tails_title: '天書奇談預測器 - FF14.tw',
        wondrous_tails_description: 'FF14 天書奇談機率預測工具，計算連線成功機率',

        // 頁面標題
        wondrous_tails_header: '天書奇談預測器',
        wondrous_tails_desc: '點一格貼上貼紙，再點一次拿掉（最多 9 張）',

        // 盤面
        wondrous_tails_count: '已貼 {n}／9 張',
        wondrous_tails_cell_label: '第 {n} 格',
        wondrous_tails_cell_line: '第 {n} 格：已連成線',
        wondrous_tails_cell_near: '第 {n} 格：貼了就連成線',

        // 機率
        wondrous_tails_now: '現在',
        wondrous_tails_after_reset: '重置之後',
        wondrous_tails_at_least_1: '至少 1 條',
        wondrous_tails_at_least_2: '至少 2 條',
        wondrous_tails_at_least_3: '至少 3 條'
    },
    en: {
        // Page info
        wondrous_tails_title: 'Wondrous Tails Predictor - FF14.tw',
        wondrous_tails_description: 'FF14 Wondrous Tails probability prediction tool for calculating line completion chances',

        // Page header
        wondrous_tails_header: 'Wondrous Tails Predictor',
        wondrous_tails_desc: 'Click a cell to place a sticker, click it again to remove it (up to 9)',

        // Board
        wondrous_tails_count: 'Stickers: {n}/9',
        wondrous_tails_cell_label: 'Cell {n}',
        wondrous_tails_cell_line: 'Cell {n}: in a completed line',
        wondrous_tails_cell_near: 'Cell {n}: completes a line',

        // Odds
        wondrous_tails_now: 'Now',
        wondrous_tails_after_reset: 'After reset',
        wondrous_tails_at_least_1: 'At least 1 line',
        wondrous_tails_at_least_2: 'At least 2 lines',
        wondrous_tails_at_least_3: 'At least 3 lines'
    },
    ja: {
        // ページ情報
        wondrous_tails_title: 'クロの空想帳予測器 - FF14.tw',
        wondrous_tails_description: 'FF14 クロの空想帳の確率予測ツール、ライン完成確率を計算',

        // ページヘッダー
        wondrous_tails_header: 'クロの空想帳予測器',
        wondrous_tails_desc: 'マスをクリックしてシールを貼り、もう一度クリックで剥がす（最大9枚）',

        // 盤面
        wondrous_tails_count: 'シール {n}／9 枚',
        wondrous_tails_cell_label: 'マス {n}',
        wondrous_tails_cell_line: 'マス {n}：ライン完成',
        wondrous_tails_cell_near: 'マス {n}：貼るとライン完成',

        // 確率
        wondrous_tails_now: '現在',
        wondrous_tails_after_reset: 'リセット後',
        wondrous_tails_at_least_1: '1ライン以上',
        wondrous_tails_at_least_2: '2ライン以上',
        wondrous_tails_at_least_3: '3ライン以上'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('wondrous-tails', WondrousTailsTranslations);
}
