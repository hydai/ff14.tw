/**
 * FF14.tw 攻略資料翻譯檔
 */
const GuideTranslations = {
    zh: {
        // 頁面資訊
        guide_title: '攻略資料 - FF14.tw',
        guide_description: 'FF14 新手攻略指南，包含公會系統、軍階、副本、風脈、探索筆記與專屬陸行鳥完整說明',

        // 頁面標題
        guide_header: '攻略資料',

        // Landing page
        guide_landing_desc: '選擇主題開始閱讀',
        guide_back_to_index: '← 返回總覽',

        // 目錄
        guide_toc_title: '目錄',
        guide_toc_guild: '公會',
        guide_toc_grand_company: '大國防聯軍',
        guide_toc_dungeon: '副本',
        guide_toc_aether: '風脈',
        guide_toc_sightseeing: '探索筆記',

        // 卡片描述
        guide_guild_desc: '部隊系統、加入方式與福利',
        guide_grand_company_desc: '三大軍團、軍階系統與軍票',
        guide_dungeon_desc: '副本類型與開放條件',
        guide_aether_desc: '風脈泉解鎖與飛行系統',
        guide_sightseeing_desc: '探索筆記機制與獎勵',

        // 章節標題
        guide_section_guild_title: '公會',
        guide_section_grand_company_title: '大國防聯軍',
        guide_section_dungeon_title: '副本',
        guide_section_aether_title: '風脈',
        guide_section_sightseeing_title: '探索筆記',
        guide_section_chocobo_title: '專屬陸行鳥',

        // 陸行鳥
        guide_toc_chocobo: '專屬陸行鳥',
        guide_chocobo_desc: '陸行鳥夥伴系統與養成指南',

        // 準備中
        guide_coming_soon: '本頁面內容準備中，敬請期待！'
    },
    en: {
        // Page info
        guide_title: 'Game Guide - FF14.tw',
        guide_description: 'FF14 beginner guide covering Free Company, Grand Company ranks, dungeons, aether currents, sightseeing log, and Chocobo Companion',

        // Page header
        guide_header: 'Game Guide',

        // Landing page
        guide_landing_desc: 'Select a topic to start reading',
        guide_back_to_index: '← Back to Overview',

        // Table of contents
        guide_toc_title: 'Contents',
        guide_toc_guild: 'Free Company',
        guide_toc_grand_company: 'Grand Company',
        guide_toc_dungeon: 'Dungeons',
        guide_toc_aether: 'Aether Currents',
        guide_toc_sightseeing: 'Sightseeing Log',

        // Card descriptions
        guide_guild_desc: 'FC system, how to join, and benefits',
        guide_grand_company_desc: 'Three nations, ranks and company seals',
        guide_dungeon_desc: 'Dungeon types and unlock requirements',
        guide_aether_desc: 'Aether currents and flying unlock',
        guide_sightseeing_desc: 'Sightseeing log mechanics and rewards',

        // Section titles
        guide_section_guild_title: 'Free Company',
        guide_section_grand_company_title: 'Grand Company',
        guide_section_dungeon_title: 'Dungeons',
        guide_section_aether_title: 'Aether Currents',
        guide_section_sightseeing_title: 'Sightseeing Log',
        guide_section_chocobo_title: 'Chocobo Companion',

        // Chocobo
        guide_toc_chocobo: 'Chocobo Companion',
        guide_chocobo_desc: 'Chocobo companion system and training guide',

        // Coming soon
        guide_coming_soon: 'This page is under construction. Stay tuned!'
    },
    ja: {
        // ページ情報
        guide_title: '攻略情報 - FF14.tw',
        guide_description: 'FF14初心者ガイド。フリーカンパニー、グランドカンパニー階級、ダンジョン、風脈、探検手帳、バディチョコボの完全ガイド',

        // ページヘッダー
        guide_header: '攻略情報',

        // ランディングページ
        guide_landing_desc: 'トピックを選んで読み始める',
        guide_back_to_index: '← 概要に戻る',

        // 目次
        guide_toc_title: '目次',
        guide_toc_guild: 'フリーカンパニー',
        guide_toc_grand_company: 'グランドカンパニー',
        guide_toc_dungeon: 'ダンジョン',
        guide_toc_aether: '風脈',
        guide_toc_sightseeing: '探検手帳',

        // カード説明
        guide_guild_desc: 'FCシステム、参加方法、特典',
        guide_grand_company_desc: '三国軍、階級システムと軍票',
        guide_dungeon_desc: 'ダンジョンの種類と開放条件',
        guide_aether_desc: '風脈の解放とフライング',
        guide_sightseeing_desc: '探検手帳の仕組みと報酬',

        // セクションタイトル
        guide_section_guild_title: 'フリーカンパニー',
        guide_section_grand_company_title: 'グランドカンパニー',
        guide_section_dungeon_title: 'ダンジョン',
        guide_section_aether_title: '風脈',
        guide_section_sightseeing_title: '探検手帳',
        guide_section_chocobo_title: 'バディチョコボ',

        // チョコボ
        guide_toc_chocobo: 'バディチョコボ',
        guide_chocobo_desc: 'バディチョコボシステムと育成ガイド',

        // 準備中
        guide_coming_soon: 'このページは準備中です。お楽しみに！'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('guide', GuideTranslations);
}
