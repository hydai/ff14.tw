/**
 * FF14.tw 陸行鳥染色計算器翻譯檔
 *
 * {n}、{done}、{total}、{count} 是數字，{fruit}、{color} 是介面語言的水果與顏色名稱（資料裡的 names），{cost} 是色票上那一格的顆數（或「目前」）。
 * 單複數只在 chocobo_color_total、chocobo_color_segments、chocobo_color_count 分（_one）：數字是 1 時用，三種語言各寫各的，程式不判斷語言。
 * 例外是朗讀摘要 chocobo_color_announce：它的 {total}、{segments} 不是數字，是那兩組已經分好單複數的句子
 * （例如「共 34 顆」「in 1 step」），摘要跟著答案卡第一行走，不必另外分單數。
 * 另一個例外是 chocobo_color_credit：它後面直接接資料來源的連結（index.html 裡兩者之間沒有空白），所以和連結之間的空白寫在翻譯值裡：
 * 中文、英文以一個空白結尾，日文以「：」結尾、後面不空。
 */
const ChocoboColorTranslations = {
    zh: {
        // 頁面標題（和 common.js 的 tool_chocobo_color_title 逐字相同）
        chocobo_color_header: '陸行鳥染色計算器',
        chocobo_color_desc: '選陸行鳥現在的顏色和想要的顏色，算出要餵哪些水果、照什麼順序餵。',

        // 選顏色
        chocobo_color_current: '目前顏色',
        chocobo_color_target: '目標顏色',

        // 答案卡
        chocobo_color_total: '共 {n} 顆',
        chocobo_color_total_one: '共 1 顆',
        chocobo_color_segments: '分 {n} 段',
        chocobo_color_segments_one: '分 1 段',
        chocobo_color_done: '已勾 {done}／{total} 段',
        chocobo_color_all_done: '全部勾完',
        chocobo_color_prepare: '要準備',
        // 步驟列表前面那一行：後半句直接接在標題後面（兩個 span 之間沒有空白），所以前面的標點寫在翻譯值裡（英文是「: 」，冒號後面有空白）
        chocobo_color_order_title: '餵食順序',
        chocobo_color_order_hint: '：照 1 → {n} 餵，一段餵完再換下一段',
        chocobo_color_step_label: '第 {n} 段：{fruit} {count} 顆',
        chocobo_color_reset_note: '變回{color}',
        // 下一段（第一個還沒勾的段）名稱下面的小字；那一段是檸檬時，「下一段」、分隔字、「變回…」接成同一行。
        // 分隔字各語言自己的，英文的兩邊有空白。skipped 是還沒勾、後面卻有段已經勾了的那一段的提醒，{n} 是段號（1 起算）
        chocobo_color_next: '下一段',
        chocobo_color_next_sep: '・',
        chocobo_color_skipped: '第 {n} 段還沒勾：不照順序餵，顏色可能會跑掉',
        chocobo_color_alt_direct: '直接調色要 {n} 顆',
        chocobo_color_alt_direct_none: '直接調色找不到每一步都不超出 RGB 範圍的做法',
        chocobo_color_alt_lemon: '先餵 1 顆檸檬再調色要 {n} 顆',
        chocobo_color_same: '已經是{color}，不用餵。',
        chocobo_color_none: '找不到每一步都不超出 RGB 範圍的做法。',
        chocobo_color_announce: '{color}：{total}，{segments}',

        // 選顏色的面板（色票）
        chocobo_color_pick_current: '選目前顏色',
        chocobo_color_pick_target: '選目標顏色',
        chocobo_color_sheet_hint: '每格是從目前的{color}要餵幾顆（已經算進檸檬）。',
        chocobo_color_now: '目前',
        chocobo_color_count: '{n} 顆',
        chocobo_color_count_one: '1 顆',
        chocobo_color_swatch_label: '{color}，{cost}',
        chocobo_color_close: '關閉',
        chocobo_color_group_white: '白・灰・黑',
        chocobo_color_group_yellow: '黃・橙',
        chocobo_color_group_red: '紅・粉',
        chocobo_color_group_brown: '棕',
        chocobo_color_group_purple: '紫',
        chocobo_color_group_blue: '藍',
        chocobo_color_group_green: '綠',

        // 說明與資料來源
        chocobo_color_note_range: '顏色名稱涵蓋一小段 RGB。之前餵過水果的話，實際數值可能和標準值有落差，結果可能差一點；先餵檸檬是從確定的沙漠黃開始。',
        chocobo_color_note_wait: '一般水果餵完約 6 小時才會變色。',
        chocobo_color_credit: '顏色資料參考自 ',

        // 錯誤
        chocobo_color_load_error: '載入顏色資料失敗，請重新整理頁面再試。'
    },
    en: {
        // Page header (identical to tool_chocobo_color_title in common.js)
        chocobo_color_header: 'Chocobo Color Calculator',
        chocobo_color_desc: 'Pick your chocobo\'s current and wanted colors to see which fruits to feed, in what order.',

        // Color pickers
        chocobo_color_current: 'Current color',
        chocobo_color_target: 'Target color',

        // Answer card
        chocobo_color_total: '{n} fruits in total',
        chocobo_color_total_one: '1 fruit in total',
        chocobo_color_segments: 'in {n} steps',
        chocobo_color_segments_one: 'in 1 step',
        chocobo_color_done: '{done} of {total} done',
        chocobo_color_all_done: 'All done',
        chocobo_color_prepare: 'You need',
        chocobo_color_order_title: 'Feeding order',
        chocobo_color_order_hint: ': 1 → {n}, one step at a time',
        chocobo_color_step_label: 'Step {n}: {count} × {fruit}',
        chocobo_color_reset_note: 'Back to {color}',
        chocobo_color_next: 'Next',
        chocobo_color_next_sep: ' · ',
        chocobo_color_skipped: 'Step {n} isn\'t ticked yet: feeding out of order can throw the color off',
        chocobo_color_alt_direct: 'Without the lemon: {n} fruits',
        chocobo_color_alt_direct_none: 'Without the lemon, no way stays within RGB 0–255',
        chocobo_color_alt_lemon: 'Starting with 1 lemon: {n} fruits',
        chocobo_color_same: 'Already {color}. Nothing to feed.',
        chocobo_color_none: 'No way stays within RGB 0–255.',
        chocobo_color_announce: '{color}: {total}, {segments}',

        // Color panel (swatches)
        chocobo_color_pick_current: 'Choose the current color',
        chocobo_color_pick_target: 'Choose the target color',
        chocobo_color_sheet_hint: 'Each color shows how many fruits it takes from {color} (lemon included).',
        chocobo_color_now: 'Current',
        chocobo_color_count: '{n} fruits',
        chocobo_color_count_one: '1 fruit',
        chocobo_color_swatch_label: '{color}, {cost}',
        chocobo_color_close: 'Close',
        chocobo_color_group_white: 'White, grey and black',
        chocobo_color_group_yellow: 'Yellow and orange',
        chocobo_color_group_red: 'Red and pink',
        chocobo_color_group_brown: 'Brown',
        chocobo_color_group_purple: 'Purple',
        chocobo_color_group_blue: 'Blue',
        chocobo_color_group_green: 'Green',

        // Notes and data source
        chocobo_color_note_range: 'A color name covers a small RGB range. If your chocobo has eaten fruit before, its actual values may be a little off, and so may the result. A lemon starts it from exactly Desert Yellow.',
        chocobo_color_note_wait: 'Regular fruit takes about 6 hours to change the color.',
        chocobo_color_credit: 'Color data from ',

        // Errors
        chocobo_color_load_error: 'Failed to load color data. Please refresh the page and try again.'
    },
    ja: {
        // ページヘッダー（common.js の tool_chocobo_color_title と同じ）
        chocobo_color_header: 'チョコボカラー計算機',
        chocobo_color_desc: 'チョコボの今の色と目標の色を選ぶと、与える果物と順番がわかります。',

        // 色の選択
        chocobo_color_current: '今の色',
        chocobo_color_target: '目標の色',

        // 答えのカード
        chocobo_color_total: '合計 {n}個',
        chocobo_color_total_one: '合計 1個',
        chocobo_color_segments: '{n}段階',
        chocobo_color_segments_one: '1段階',
        chocobo_color_done: '{done}／{total} 完了',
        chocobo_color_all_done: 'すべて完了',
        chocobo_color_prepare: '用意するもの',
        chocobo_color_order_title: '与える順番',
        chocobo_color_order_hint: '：1 → {n} の順に、1段階ずつ',
        chocobo_color_step_label: '{n}段階目：{fruit} {count}個',
        chocobo_color_reset_note: '{color}に戻る',
        chocobo_color_next: '次はここ',
        chocobo_color_next_sep: '・',
        chocobo_color_skipped: '{n}段階目がまだです。順番どおりに与えないと色がずれることがあります',
        chocobo_color_alt_direct: 'レモンなしだと {n}個',
        chocobo_color_alt_direct_none: 'レモンなしでは RGB の範囲内に収まる方法がありません',
        chocobo_color_alt_lemon: '先にレモンを1個与えると {n}個',
        chocobo_color_same: 'すでに{color}です。与える必要はありません。',
        chocobo_color_none: 'RGB の範囲内に収まる方法が見つかりません。',
        chocobo_color_announce: '{color}：{total}、{segments}',

        // 色の選択パネル（色見本）
        chocobo_color_pick_current: '今の色を選ぶ',
        chocobo_color_pick_target: '目標の色を選ぶ',
        chocobo_color_sheet_hint: '各色は今の{color}から必要な数です（レモン込み）。',
        chocobo_color_now: '今の色',
        chocobo_color_count: '{n}個',
        chocobo_color_count_one: '1個',
        chocobo_color_swatch_label: '{color}、{cost}',
        chocobo_color_close: '閉じる',
        chocobo_color_group_white: '白・灰・黒',
        chocobo_color_group_yellow: '黄・橙',
        chocobo_color_group_red: '赤・ピンク',
        chocobo_color_group_brown: '茶',
        chocobo_color_group_purple: '紫',
        chocobo_color_group_blue: '青',
        chocobo_color_group_green: '緑',

        // 説明とデータの出典
        chocobo_color_note_range: '色の名前は RGB の小さな範囲をまとめたものです。以前に果物を与えていると実際の値が少しずれ、結果も少しずれることがあります。レモンを与えると正確なデザートイエローから始められます。',
        chocobo_color_note_wait: '通常の果物は与えてから約6時間で色が変わります。',
        chocobo_color_credit: '色データの出典：',

        // エラー
        chocobo_color_load_error: '色データを読み込めませんでした。ページを再読み込みしてください。'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('chocobo-color', ChocoboColorTranslations);
}
