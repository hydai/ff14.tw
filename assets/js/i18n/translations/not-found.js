/**
 * FF14.tw 404 頁翻譯檔
 */
const NotFoundTranslations = {
    zh: {
        // 訊息區（標題同時是瀏覽器分頁的標題）
        not_found_title: '找不到這個頁面',
        not_found_text: '網址可能打錯了，或這個頁面已經搬家。',
        not_found_home: '回首頁',

        // 工具清單小標
        not_found_tools_title: '或直接選一個工具'
    },
    en: {
        // Message (the title is also the browser tab title)
        not_found_title: 'Page not found',
        not_found_text: 'The address may be mistyped, or the page has moved.',
        not_found_home: 'Back to home',

        // Tool list label
        not_found_tools_title: 'Or pick a tool'
    },
    ja: {
        // メッセージ（タイトルはブラウザのタブのタイトルにもなる）
        not_found_title: 'ページが見つかりません',
        not_found_text: 'URLが間違っているか、ページが移動した可能性があります。',
        not_found_home: 'ホームに戻る',

        // ツール一覧の見出し
        not_found_tools_title: 'またはツールを選ぶ'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('not-found', NotFoundTranslations);
}
