/**
 * FF14.tw Lodestone 角色查詢翻譯檔
 */
const LodestoneLookupTranslations = {
    zh: {
        // 頁面資訊
        lodestone_title: 'Lodestone 角色查詢 - FF14.tw',
        lodestone_description: '使用 Lodestone ID 查詢 Final Fantasy XIV 角色資訊',

        // 頁面標題
        lodestone_header: 'Lodestone 角色查詢',
        lodestone_subtitle: '輸入角色的 Lodestone ID 來查詢詳細資訊',

        // 搜尋區
        lodestone_placeholder: '請輸入 Lodestone ID (例如：12345678)',
        lodestone_dc_na: '北美資料中心',
        lodestone_dc_jp: '日本資料中心',
        lodestone_search: '查詢',
        lodestone_hint: '提示：您可以在 Lodestone 官方網站的角色頁面 URL 中找到角色 ID',
        lodestone_example: '例如：https://na.finalfantasyxiv.com/lodestone/character/',

        // 載入狀態
        lodestone_loading: '正在查詢角色資訊...',

        // 區段標題
        lodestone_basic_info: '基本資訊',
        lodestone_job_levels: '職業等級',
        lodestone_special_content: '特殊內容',
        lodestone_equipment: '裝備資訊',
        lodestone_attributes: '角色屬性',
        lodestone_sub_attributes: '副屬性',
        lodestone_other_info: '其他資訊',

        // 基本資訊標籤
        lodestone_deity: '守護神：',
        lodestone_city: '開始城市：',

        // 屬性標籤
        lodestone_hp: '生命值：',
        lodestone_mp: 'MP/GP/CP：',
        lodestone_attack_power: '物理攻擊力：',
        lodestone_defense: '物理防禦力：',
        lodestone_magic_attack: '魔法攻擊力：',
        lodestone_magic_defense: '魔法防禦力：',

        // 副屬性標籤
        lodestone_strength: '力量：',
        lodestone_dexterity: '靈巧：',
        lodestone_vitality: '耐力：',
        lodestone_intelligence: '智力：',
        lodestone_mind: '精神：',
        lodestone_critical: '爆擊：',
        lodestone_determination: '意志：',
        lodestone_direct_hit: '直擊：',
        lodestone_skill_speed: '技巧速度：',
        lodestone_spell_speed: '咏唱速度：',
        lodestone_piety: '信仰：',
        lodestone_tenacity: '堅韌：',

        // 其他資訊標籤
        lodestone_grand_company: '大國防軍：',
        lodestone_nameday: '生日：',
        lodestone_bio: '個人簡介：',

        // 分頁
        lodestone_tab_overview: '總覽',
        lodestone_tab_achievements: '成就',
        lodestone_tab_mounts: '坐騎',
        lodestone_tab_minions: '寵物',
        lodestone_tab_fc: '公會',

        // 成就區
        lodestone_total_achievements: '總成就數：',
        lodestone_achievement_points: '成就點數：',

        // 收藏區
        lodestone_mounts_collection: '坐騎收藏',
        lodestone_minions_collection: '寵物收藏',
        lodestone_mounts_count: '{count} 個坐騎',
        lodestone_minions_count: '{count} 隻寵物',
        lodestone_mounts_count_unit: '個坐騎',
        lodestone_minions_count_unit: '隻寵物',

        // 公會資訊
        lodestone_fc_info: '公會資訊',
        lodestone_fc_members: '成員數：',
        lodestone_fc_rank: '排名：',
        lodestone_fc_recruitment: '招募狀態：',
        lodestone_fc_estate: '公會房屋',
        lodestone_fc_focus: '公會目標',
        lodestone_fc_seeking: '招募對象',
        lodestone_fc_reputation: '大國防軍聲望',
        lodestone_fc_member_list: '公會成員',

        // 連結
        lodestone_view_full: '在 Lodestone 查看完整資訊 →',
        lodestone_data_updated: '資料更新時間：',

        // 使用說明
        lodestone_usage_title: '使用說明',
        lodestone_usage_1: '本工具使用 FFXIV Lodestone 官方資料',
        lodestone_usage_2: '查詢結果會快取 24 小時以提升效能',
        lodestone_usage_3: '支援查詢角色資訊、職業等級、成就、坐騎和寵物收藏',
        lodestone_usage_4: '成就資料支援分頁瀏覽',
        lodestone_usage_5: '支援北美和日本資料中心的角色查詢',
        lodestone_usage_6: '請選擇正確的資料中心以確保查詢成功',
        lodestone_usage_7: '更多詳細資訊請前往官方 Lodestone 頁面查看'
    },
    en: {
        // Page info
        lodestone_title: 'Lodestone Lookup - FF14.tw',
        lodestone_description: 'Look up Final Fantasy XIV character info using Lodestone ID',

        // Page header
        lodestone_header: 'Lodestone Lookup',
        lodestone_subtitle: 'Enter character Lodestone ID to view detailed information',

        // Search section
        lodestone_placeholder: 'Enter Lodestone ID (e.g., 12345678)',
        lodestone_dc_na: 'North America DC',
        lodestone_dc_jp: 'Japan DC',
        lodestone_search: 'Search',
        lodestone_hint: 'Tip: You can find the character ID in the Lodestone profile URL',
        lodestone_example: 'Example: https://na.finalfantasyxiv.com/lodestone/character/',

        // Loading state
        lodestone_loading: 'Loading character information...',

        // Section titles
        lodestone_basic_info: 'Basic Information',
        lodestone_job_levels: 'Job Levels',
        lodestone_special_content: 'Special Content',
        lodestone_equipment: 'Equipment',
        lodestone_attributes: 'Attributes',
        lodestone_sub_attributes: 'Sub Attributes',
        lodestone_other_info: 'Other Information',

        // Basic info labels
        lodestone_deity: 'Guardian:',
        lodestone_city: 'Starting City:',

        // Attribute labels
        lodestone_hp: 'HP:',
        lodestone_mp: 'MP/GP/CP:',
        lodestone_attack_power: 'Attack Power:',
        lodestone_defense: 'Defense:',
        lodestone_magic_attack: 'Magic Attack:',
        lodestone_magic_defense: 'Magic Defense:',

        // Sub attribute labels
        lodestone_strength: 'Strength:',
        lodestone_dexterity: 'Dexterity:',
        lodestone_vitality: 'Vitality:',
        lodestone_intelligence: 'Intelligence:',
        lodestone_mind: 'Mind:',
        lodestone_critical: 'Critical Hit:',
        lodestone_determination: 'Determination:',
        lodestone_direct_hit: 'Direct Hit:',
        lodestone_skill_speed: 'Skill Speed:',
        lodestone_spell_speed: 'Spell Speed:',
        lodestone_piety: 'Piety:',
        lodestone_tenacity: 'Tenacity:',

        // Other info labels
        lodestone_grand_company: 'Grand Company:',
        lodestone_nameday: 'Nameday:',
        lodestone_bio: 'Bio:',

        // Tabs
        lodestone_tab_overview: 'Overview',
        lodestone_tab_achievements: 'Achievements',
        lodestone_tab_mounts: 'Mounts',
        lodestone_tab_minions: 'Minions',
        lodestone_tab_fc: 'Free Company',

        // Achievements section
        lodestone_total_achievements: 'Total Achievements:',
        lodestone_achievement_points: 'Achievement Points:',

        // Collection section
        lodestone_mounts_collection: 'Mount Collection',
        lodestone_minions_collection: 'Minion Collection',
        lodestone_mounts_count: '{count} mounts',
        lodestone_minions_count: '{count} minions',
        lodestone_mounts_count_unit: 'mounts',
        lodestone_minions_count_unit: 'minions',

        // FC info
        lodestone_fc_info: 'Free Company Info',
        lodestone_fc_members: 'Members:',
        lodestone_fc_rank: 'Rank:',
        lodestone_fc_recruitment: 'Recruiting:',
        lodestone_fc_estate: 'Estate',
        lodestone_fc_focus: 'Focus',
        lodestone_fc_seeking: 'Seeking',
        lodestone_fc_reputation: 'Grand Company Reputation',
        lodestone_fc_member_list: 'Members',

        // Links
        lodestone_view_full: 'View full info on Lodestone →',
        lodestone_data_updated: 'Data updated:',

        // Usage notes
        lodestone_usage_title: 'Usage Notes',
        lodestone_usage_1: 'This tool uses official FFXIV Lodestone data',
        lodestone_usage_2: 'Results are cached for 24 hours for better performance',
        lodestone_usage_3: 'Supports character info, job levels, achievements, mounts, and minions',
        lodestone_usage_4: 'Achievement data supports pagination',
        lodestone_usage_5: 'Supports NA and JP data center lookups',
        lodestone_usage_6: 'Please select the correct data center for successful queries',
        lodestone_usage_7: 'Visit the official Lodestone page for more details'
    },
    ja: {
        // ページ情報
        lodestone_title: 'Lodestone 検索 - FF14.tw',
        lodestone_description: 'Lodestone IDでFF14キャラクター情報を検索',

        // ページヘッダー
        lodestone_header: 'Lodestone 検索',
        lodestone_subtitle: 'Lodestone IDを入力してキャラクター情報を表示',

        // 検索セクション
        lodestone_placeholder: 'Lodestone IDを入力 (例：12345678)',
        lodestone_dc_na: '北米DC',
        lodestone_dc_jp: '日本DC',
        lodestone_search: '検索',
        lodestone_hint: 'ヒント：LodestoneプロフィールURLでキャラクターIDを確認できます',
        lodestone_example: '例：https://jp.finalfantasyxiv.com/lodestone/character/',

        // 読み込み状態
        lodestone_loading: 'キャラクター情報を取得中...',

        // セクションタイトル
        lodestone_basic_info: '基本情報',
        lodestone_job_levels: 'ジョブレベル',
        lodestone_special_content: '特殊コンテンツ',
        lodestone_equipment: '装備情報',
        lodestone_attributes: 'ステータス',
        lodestone_sub_attributes: 'サブステータス',
        lodestone_other_info: 'その他の情報',

        // 基本情報ラベル
        lodestone_deity: '守護神：',
        lodestone_city: '開始都市：',

        // ステータスラベル
        lodestone_hp: 'HP：',
        lodestone_mp: 'MP/GP/CP：',
        lodestone_attack_power: '物理攻撃力：',
        lodestone_defense: '物理防御力：',
        lodestone_magic_attack: '魔法攻撃力：',
        lodestone_magic_defense: '魔法防御力：',

        // サブステータスラベル
        lodestone_strength: 'STR：',
        lodestone_dexterity: 'DEX：',
        lodestone_vitality: 'VIT：',
        lodestone_intelligence: 'INT：',
        lodestone_mind: 'MND：',
        lodestone_critical: 'クリティカル：',
        lodestone_determination: '意思力：',
        lodestone_direct_hit: 'ダイレクトヒット：',
        lodestone_skill_speed: 'スキルスピード：',
        lodestone_spell_speed: 'スペルスピード：',
        lodestone_piety: '信仰：',
        lodestone_tenacity: '不屈：',

        // その他の情報ラベル
        lodestone_grand_company: 'グランドカンパニー：',
        lodestone_nameday: '誕生日：',
        lodestone_bio: '自己紹介：',

        // タブ
        lodestone_tab_overview: '概要',
        lodestone_tab_achievements: 'アチーブメント',
        lodestone_tab_mounts: 'マウント',
        lodestone_tab_minions: 'ミニオン',
        lodestone_tab_fc: 'フリーカンパニー',

        // アチーブメントセクション
        lodestone_total_achievements: '総アチーブメント数：',
        lodestone_achievement_points: 'アチーブメントポイント：',

        // コレクションセクション
        lodestone_mounts_collection: 'マウントコレクション',
        lodestone_minions_collection: 'ミニオンコレクション',
        lodestone_mounts_count: '{count} マウント',
        lodestone_minions_count: '{count} ミニオン',
        lodestone_mounts_count_unit: 'マウント',
        lodestone_minions_count_unit: 'ミニオン',

        // FC情報
        lodestone_fc_info: 'フリーカンパニー情報',
        lodestone_fc_members: 'メンバー数：',
        lodestone_fc_rank: 'ランク：',
        lodestone_fc_recruitment: '募集状態：',
        lodestone_fc_estate: 'カンパニーハウス',
        lodestone_fc_focus: '活動方針',
        lodestone_fc_seeking: '募集対象',
        lodestone_fc_reputation: 'グランドカンパニー評価',
        lodestone_fc_member_list: 'メンバー',

        // リンク
        lodestone_view_full: 'Lodestoneで詳細を見る →',
        lodestone_data_updated: 'データ更新：',

        // 使用説明
        lodestone_usage_title: '使用方法',
        lodestone_usage_1: '公式FFXIV Lodestoneデータを使用',
        lodestone_usage_2: 'パフォーマンス向上のため結果は24時間キャッシュ',
        lodestone_usage_3: 'キャラクター情報、ジョブレベル、アチーブメント、マウント、ミニオンをサポート',
        lodestone_usage_4: 'アチーブメントデータはページネーション対応',
        lodestone_usage_5: '北米と日本DCのキャラクター検索に対応',
        lodestone_usage_6: '正しいデータセンターを選択してください',
        lodestone_usage_7: '詳細は公式Lodestoneページをご覧ください'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('lodestone-lookup', LodestoneLookupTranslations);
}
