/**
 * Macro Converter - i18n translations
 */
const MacroConverterTranslations = {
    zh: {
        // Page meta
        macro_converter_title: '巨集轉換器 - FF14.tw',
        macro_converter_description: '把英文、日文攻略的 FF14 生產巨集換成繁體中文；支援生產技能與文字指令。',

        // Headers
        macro_converter_header: '巨集轉換器',
        macro_converter_desc: '貼上英文或日文的生產巨集，馬上換成繁體中文。',
        macro_converter_scope: '支援生產技能與文字指令；戰鬥、採集技能還沒有收錄。',

        // Language selector
        macro_converter_target_lang: '目標語言',

        // Input/Output
        macro_converter_input: '輸入巨集',
        macro_converter_output_placeholder: '轉換結果會出現在這裡',

        // Output title: "<target language>・N 行" ({lang} is the language name, {lines} is the line count text)
        macro_converter_lang_zh: '繁體中文',
        macro_converter_lang_en: '英文',
        macro_converter_lang_ja: '日文',
        macro_converter_line_one: '{count} 行',
        macro_converter_lines: '{count} 行',
        macro_converter_output_title: '{lang}・{lines}',

        // Lines that need attention
        macro_converter_warn_action: '第 {line} 行：「{text}」沒有收錄，照原文保留',
        macro_converter_warn_command: '第 {line} 行：「{text}」不是認得的指令，照原文保留',
        macro_converter_warn_text: '第 {line} 行：「{text}」不是指令，遊戲裡會當成聊天訊息送出',
        macro_converter_warn_too_long: '共 {lines} 行：遊戲裡一個巨集最多 15 行，要分成 {macros} 個巨集',

        // Buttons
        macro_converter_copy: '複製',
        macro_converter_copied_button: '✓ 已複製',
        macro_converter_clear: '清除',
        macro_converter_paste: '貼上',
        macro_converter_retry: '重試',

        // Messages
        macro_converter_loading: '載入翻譯資料中...',
        macro_converter_load_error: '載入翻譯資料失敗，請按「重試」再試一次。',
        macro_converter_copied: '已複製',
        macro_converter_copy_error: '複製失敗，請手動選取文字',
        macro_converter_paste_error: '沒辦法讀取剪貼簿，請直接在框裡貼上（Ctrl+V 或長按）'
    },
    en: {
        // Page meta
        macro_converter_title: 'Macro Converter - FF14.tw',
        macro_converter_description: 'Convert FF14 crafting macros from English and Japanese guides into Traditional Chinese; supports crafting actions and text commands.',

        // Headers
        macro_converter_header: 'Macro Converter',
        macro_converter_desc: 'Paste a crafting macro in English or Japanese and convert it to Traditional Chinese right away.',
        macro_converter_scope: 'Supports crafting actions and text commands; combat and gathering actions are not included yet.',

        // Language selector
        macro_converter_target_lang: 'Target Language',

        // Input/Output
        macro_converter_input: 'Input Macro',
        macro_converter_output_placeholder: 'The converted macro will appear here',

        // Output title: "<target language> · N lines" ({lang} is the language name, {lines} is the line count text)
        macro_converter_lang_zh: 'Traditional Chinese',
        macro_converter_lang_en: 'English',
        macro_converter_lang_ja: 'Japanese',
        macro_converter_line_one: '{count} line',
        macro_converter_lines: '{count} lines',
        macro_converter_output_title: '{lang} · {lines}',

        // Lines that need attention
        macro_converter_warn_action: 'Line {line}: "{text}" is not in the data, so it is kept as written',
        macro_converter_warn_command: 'Line {line}: "{text}" is not a recognized command, so it is kept as written',
        macro_converter_warn_text: 'Line {line}: "{text}" is not a command, so the game would send it as a chat message',
        macro_converter_warn_too_long: '{lines} lines in total: a game macro holds 15 lines at most, so split it into {macros} macros',

        // Buttons
        macro_converter_copy: 'Copy',
        macro_converter_copied_button: '✓ Copied',
        macro_converter_clear: 'Clear',
        macro_converter_paste: 'Paste',
        macro_converter_retry: 'Retry',

        // Messages
        macro_converter_loading: 'Loading translation data...',
        macro_converter_load_error: 'Failed to load the translation data. Press "Retry" to try again.',
        macro_converter_copied: 'Copied',
        macro_converter_copy_error: 'Copy failed. Please select the text and copy it yourself.',
        macro_converter_paste_error: 'Cannot read the clipboard. Paste into the box directly (Ctrl+V or long-press).'
    },
    ja: {
        // Page meta
        macro_converter_title: 'マクロ変換ツール - FF14.tw',
        macro_converter_description: '英語・日本語の攻略サイトにあるFF14の製作マクロを繁体字中国語に変換します。製作アクションとテキストコマンドに対応。',

        // Headers
        macro_converter_header: 'マクロ変換ツール',
        macro_converter_desc: '英語または日本語の製作マクロを貼り付けると、すぐに繁体字中国語に変換します。',
        macro_converter_scope: '製作アクションとテキストコマンドに対応しています。戦闘・採集アクションはまだ収録していません。',

        // Language selector
        macro_converter_target_lang: '変換先言語',

        // Input/Output
        macro_converter_input: '入力マクロ',
        macro_converter_output_placeholder: '変換結果はここに表示されます',

        // Output title: "<target language>・N 行" ({lang} is the language name, {lines} is the line count text)
        macro_converter_lang_zh: '繁体字中国語',
        macro_converter_lang_en: '英語',
        macro_converter_lang_ja: '日本語',
        macro_converter_line_one: '{count} 行',
        macro_converter_lines: '{count} 行',
        macro_converter_output_title: '{lang}・{lines}',

        // Lines that need attention
        macro_converter_warn_action: '{line} 行目：「{text}」は収録されていないため、そのまま残しました',
        macro_converter_warn_command: '{line} 行目：「{text}」は認識できないコマンドのため、そのまま残しました',
        macro_converter_warn_text: '{line} 行目：「{text}」はコマンドではないため、ゲームではチャットとして送信されます',
        macro_converter_warn_too_long: '全 {lines} 行：ゲーム内のマクロは最大 15 行までなので、{macros} 個のマクロに分けてください',

        // Buttons
        macro_converter_copy: 'コピー',
        macro_converter_copied_button: '✓ コピーしました',
        macro_converter_clear: 'クリア',
        macro_converter_paste: '貼り付け',
        macro_converter_retry: '再試行',

        // Messages
        macro_converter_loading: '翻訳データを読み込み中...',
        macro_converter_load_error: '翻訳データの読み込みに失敗しました。「再試行」を押してもう一度お試しください。',
        macro_converter_copied: 'コピーしました',
        macro_converter_copy_error: 'コピーに失敗しました。テキストを手動で選択してください',
        macro_converter_paste_error: 'クリップボードを読み取れません。入力欄に直接貼り付けてください（Ctrl+V または長押し）'
    }
};

// Load translations into global i18n manager
if (window.i18n) {
    window.i18n.loadTranslations('macro-converter', MacroConverterTranslations);
}
