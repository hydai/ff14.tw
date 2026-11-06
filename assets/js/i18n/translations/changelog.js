/**
 * FF14.tw 修改紀錄頁面翻譯檔
 */
const ChangelogTranslations = {
    zh: {
        // 頁面資訊
        changelog_title: '修改紀錄 - FF14.tw',
        changelog_description: 'FF14.tw 網站功能更新與修改紀錄',

        // Hero
        changelog_hero_title: '修改紀錄',
        changelog_hero_subtitle: '記錄 FF14.tw 的功能更新與改進',

        // 最新一版的標記
        changelog_latest: '最新',

        // 收起來的那一行右邊的條數（{count} 由 changelog.js 換成數字）
        changelog_item_count: '{count} 條',

        // 關於區塊
        changelog_about_title: '關於修改紀錄',
        changelog_about_desc: '本頁面記錄 FF14.tw 的重要功能更新與改進。詳細的技術變更請參考',
        changelog_about_desc_suffix: '。',

        // 標籤說明
        changelog_tag_new: '新功能或新工具',
        changelog_tag_improve: '功能優化或體驗提升',
        changelog_tag_fix: '錯誤修復'
    },
    en: {
        // Page info
        changelog_title: 'Changelog - FF14.tw',
        changelog_description: 'FF14.tw website updates and changelog',

        // Hero
        changelog_hero_title: 'Changelog',
        changelog_hero_subtitle: 'Track FF14.tw feature updates and improvements',

        // Latest version marker
        changelog_latest: 'Latest',

        // Entry count on the right of a folded row ({count} is replaced by changelog.js)
        changelog_item_count: '{count} items',

        // About section
        changelog_about_title: 'About Changelog',
        changelog_about_desc: 'This page records important feature updates and improvements of FF14.tw. For detailed technical changes, please refer to',
        changelog_about_desc_suffix: '.',

        // Tag legend
        changelog_tag_new: 'New features or tools',
        changelog_tag_improve: 'Feature optimization or UX improvement',
        changelog_tag_fix: 'Bug fixes'
    },
    ja: {
        // ページ情報
        changelog_title: '更新履歴 - FF14.tw',
        changelog_description: 'FF14.tw サイトの機能更新と変更履歴',

        // Hero
        changelog_hero_title: '更新履歴',
        changelog_hero_subtitle: 'FF14.tw の機能更新と改善を記録',

        // 最新バージョンの印
        changelog_latest: '最新',

        // 折りたたんだ行の右側の件数（{count} は changelog.js が数字に置き換える）
        changelog_item_count: '{count} 件',

        // About セクション
        changelog_about_title: '更新履歴について',
        changelog_about_desc: 'このページは FF14.tw の重要な機能更新と改善を記録しています。詳細な技術変更については',
        changelog_about_desc_suffix: 'をご参照ください。',

        // タグ凡例
        changelog_tag_new: '新機能またはツール',
        changelog_tag_improve: '機能最適化またはUX改善',
        changelog_tag_fix: 'バグ修正'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('changelog', ChangelogTranslations);
}
