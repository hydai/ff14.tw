/**
 * Macro Converter - i18n translations
 */
const MacroConverterTranslations = {
    zh: {
        // Page meta
        macro_converter_title: '巨集轉換器 - FF14.tw',
        macro_converter_description: 'FF14 巨集語言轉換工具，支援繁體中文、英文、日文巨集互相轉換',

        // Headers
        macro_converter_header: '巨集轉換器',
        macro_converter_desc: '將 FF14 巨集在繁體中文、英文、日文之間轉換',

        // Language selectors
        macro_converter_source_lang: '來源語言',
        macro_converter_target_lang: '目標語言',
        macro_converter_auto_detect: '自動偵測',
        macro_converter_detected: '偵測到',

        // Input/Output
        macro_converter_input: '輸入巨集',
        macro_converter_output: '輸出結果',
        macro_converter_output_placeholder: '轉換結果將顯示在這裡...',

        // Buttons
        macro_converter_convert: '轉換 →',
        macro_converter_copy: '複製',
        macro_converter_clear: '清除',
        macro_converter_paste: '貼上',

        // Messages
        macro_converter_warning: '部分指令無法翻譯（以橘色標記）',
        macro_converter_loading: '載入翻譯資料中...',
        macro_converter_load_error: '載入翻譯資料失敗，請重新整理頁面再試。',
        macro_converter_copied: '已複製到剪貼簿',
        macro_converter_copy_error: '複製失敗',
        macro_converter_paste_error: '無法讀取剪貼簿',
        macro_converter_nothing_to_copy: '沒有內容可複製',
        macro_converter_untranslatable: '無法翻譯'
    },
    en: {
        // Page meta
        macro_converter_title: 'Macro Converter - FF14.tw',
        macro_converter_description: 'FF14 macro language converter, supports Traditional Chinese, English, and Japanese macro conversion',

        // Headers
        macro_converter_header: 'Macro Converter',
        macro_converter_desc: 'Convert FF14 macros between Traditional Chinese, English, and Japanese',

        // Language selectors
        macro_converter_source_lang: 'Source Language',
        macro_converter_target_lang: 'Target Language',
        macro_converter_auto_detect: 'Auto Detect',
        macro_converter_detected: 'Detected',

        // Input/Output
        macro_converter_input: 'Input Macro',
        macro_converter_output: 'Output Result',
        macro_converter_output_placeholder: 'Converted result will appear here...',

        // Buttons
        macro_converter_convert: 'Convert →',
        macro_converter_copy: 'Copy',
        macro_converter_clear: 'Clear',
        macro_converter_paste: 'Paste',

        // Messages
        macro_converter_warning: 'Some commands could not be translated (marked in orange)',
        macro_converter_loading: 'Loading translation data...',
        macro_converter_load_error: 'Failed to load translation data. Please refresh the page.',
        macro_converter_copied: 'Copied to clipboard',
        macro_converter_copy_error: 'Copy failed',
        macro_converter_paste_error: 'Cannot read clipboard',
        macro_converter_nothing_to_copy: 'Nothing to copy',
        macro_converter_untranslatable: 'Cannot translate'
    },
    ja: {
        // Page meta
        macro_converter_title: 'マクロ変換ツール - FF14.tw',
        macro_converter_description: 'FF14マクロ言語変換ツール、繁体字中国語、英語、日本語のマクロ相互変換をサポート',

        // Headers
        macro_converter_header: 'マクロ変換ツール',
        macro_converter_desc: 'FF14マクロを繁体字中国語、英語、日本語間で変換',

        // Language selectors
        macro_converter_source_lang: '元の言語',
        macro_converter_target_lang: '変換先言語',
        macro_converter_auto_detect: '自動検出',
        macro_converter_detected: '検出済み',

        // Input/Output
        macro_converter_input: '入力マクロ',
        macro_converter_output: '出力結果',
        macro_converter_output_placeholder: '変換結果はここに表示されます...',

        // Buttons
        macro_converter_convert: '変換 →',
        macro_converter_copy: 'コピー',
        macro_converter_clear: 'クリア',
        macro_converter_paste: '貼り付け',

        // Messages
        macro_converter_warning: '一部のコマンドは翻訳できませんでした（オレンジ色で表示）',
        macro_converter_loading: '翻訳データを読み込み中...',
        macro_converter_load_error: '翻訳データの読み込みに失敗しました。ページを更新してください。',
        macro_converter_copied: 'クリップボードにコピーしました',
        macro_converter_copy_error: 'コピーに失敗しました',
        macro_converter_paste_error: 'クリップボードを読み取れません',
        macro_converter_nothing_to_copy: 'コピーするものがありません',
        macro_converter_untranslatable: '翻訳できません'
    }
};

// Load translations into global i18n manager
if (window.i18n) {
    window.i18n.loadTranslations('macro-converter', MacroConverterTranslations);
}
