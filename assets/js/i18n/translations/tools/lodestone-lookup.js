/**
 * FF14.tw Lodestone 角色查詢翻譯檔
 */
const LodestoneLookupTranslations = {
    zh: {
        // 頁面標題（頁首的工具名稱與看不見的 h1）
        lodestone_header: 'Lodestone 角色查詢',

        // 打開時：我的角色、找人、最近查過
        lodestone_intro: '輸入名字和伺服器，查國際版角色的職業等級、成就與收藏。',
        lodestone_mine: '我的角色',
        lodestone_open: '打開 →',
        lodestone_find: '找人',
        lodestone_name_label: '角色名字',
        lodestone_name_placeholder: '例如 Aoi Mizuno',
        lodestone_world: '伺服器',
        lodestone_world_all: '全部伺服器',
        lodestone_dcs: '資料中心',
        lodestone_find_note: '也可以直接貼上 Lodestone 角色頁的網址或 ID。只能查國際版的角色。',
        lodestone_data_lang: '名稱與成就顯示',
        lodestone_recent: '最近查過',
        lodestone_back: '← 找其他人',

        // 人的一列與角色標頭：伺服器（資料中心）・部隊、職業與等級
        lodestone_where: '{world}（{dc}）',
        lodestone_sep: '・',
        lodestone_level: 'Lv{level}',
        lodestone_fc: '部隊',
        lodestone_fc_named: '部隊 {name}',
        // 人的一列：名字和下面那一行之間給螢幕閱讀器的停頓（畫面上看不到）
        lodestone_spoken_sep: '，',

        // 搜尋結果
        lodestone_search_found_in: '在 {where} 找到 {count} 個「{name}」',
        lodestone_search_found: '找到 {count} 個「{name}」',
        lodestone_search_none_in: '在 {where} 找不到「{name}」',
        lodestone_search_none: '找不到「{name}」',
        lodestone_search_hint: '確認伺服器，或貼上他在 Lodestone 的角色頁網址',
        lodestone_search_more: '還有更多結果，請把名字打完整或選伺服器',
        lodestone_search_official: '到 Lodestone 官網搜尋「{name}」',
        lodestone_error_upstream: 'Lodestone 暫時連不上，請稍後再試',

        // 角色標頭
        lodestone_now: '現在：',
        lodestone_active_job: '目前職業',
        lodestone_set_mine: '☆ 設成我的角色',
        lodestone_is_mine: '★ 我的角色',
        lodestone_open_lodestone: '在 Lodestone 打開',
        lodestone_fetched_at: '資料時間：{time}',

        // 角色畫面的六個分頁（成就與部隊的名稱是 lodestone_tab_achievements、lodestone_tab_fc）
        lodestone_tabs_label: '角色資料',
        lodestone_tab_jobs: '職業',
        lodestone_tab_gear: '裝備',
        lodestone_tab_collections: '收藏',
        lodestone_tab_about: '其他',
        // 分頁載入失敗時，錯誤訊息旁重新載入那個分頁的按鈕
        lodestone_retry: '再試一次',

        // 職業分頁：七組的名稱、滿級幾個（特殊內容那一行是 lodestone_special_content）
        lodestone_role_tank: '坦克',
        lodestone_role_healer: '治療',
        lodestone_role_melee: '近戰',
        lodestone_role_ranged: '遠程',
        lodestone_role_magic: '魔法',
        lodestone_role_crafting: '生產',
        lodestone_role_gathering: '採集',
        lodestone_jobs_maxed: '滿級 {count} 個',

        // 成就分頁：數字後面的字、不公開
        lodestone_achievement_unit: '個成就',
        lodestone_point_unit: '點',
        lodestone_achievements_private: '這個角色沒有公開成就',

        // 裝備分頁（部位是 lodestone_equip_*，屬性是 lodestone_attributes 與下面的屬性標籤）
        lodestone_gear_note: 'Lodestone 的角色頁只有裝備圖示，沒有名稱。',
        lodestone_gear_none: '沒有裝備資料。',

        // 收藏分頁（坐騎、寵物還沒載入好時的標題是 lodestone_tab_mounts、lodestone_tab_minions）
        lodestone_mounts_total: '坐騎 {count}',
        lodestone_minions_total: '寵物 {count}',
        lodestone_filter_names: '篩選名稱',
        lodestone_filter_none: '沒有符合的名稱',

        // 部隊分頁（其他欄位是下面的 lodestone_fc_*）
        lodestone_fc_none: '沒有加入部隊',
        lodestone_fc_ranking_weekly: '每週 {rank}',
        lodestone_fc_ranking_monthly: '每月 {rank}',

        // 找人的搜尋鈕
        lodestone_search: '搜尋',

        // 載入狀態
        lodestone_loading: '載入中…',

        // 職業分頁最下面的特殊內容；裝備分頁的部位與屬性
        lodestone_special_content: '特殊內容：{content}',
        lodestone_equip_mainhand: '主手',
        lodestone_equip_offhand: '副手',
        lodestone_equip_head: '頭部',
        lodestone_equip_body: '身體',
        lodestone_equip_hands: '手部',
        lodestone_equip_legs: '腿部',
        lodestone_equip_feet: '腳部',
        lodestone_equip_earrings: '耳飾',
        lodestone_equip_necklace: '頸飾',
        lodestone_equip_bracelets: '腕飾',
        lodestone_equip_ring1: '戒指1',
        lodestone_equip_ring2: '戒指2',
        lodestone_equip_soulcrystal: '靈魂水晶',
        lodestone_attributes: '屬性',
        lodestone_main_attributes: '主屬性',
        lodestone_sub_attributes: '副屬性',

        // 其他分頁：守護神、開始城市
        lodestone_deity: '守護神',
        lodestone_city: '開始城市',

        // 裝備分頁的屬性名稱（主屬性與副屬性）
        lodestone_strength: '力量',
        lodestone_dexterity: '靈巧',
        lodestone_vitality: '耐力',
        lodestone_intelligence: '智力',
        lodestone_mind: '精神',
        lodestone_critical: '爆擊',
        lodestone_determination: '意志',
        lodestone_direct_hit: '直擊',
        lodestone_skill_speed: '技巧速度',
        lodestone_spell_speed: '詠唱速度',
        lodestone_piety: '信仰',
        lodestone_tenacity: '堅韌',

        // 其他分頁：大國防聯軍、生日、個人簡介
        lodestone_grand_company: '大國防聯軍',
        lodestone_nameday: '生日',
        lodestone_bio: '個人簡介',

        // 成就與部隊分頁的名稱；收藏的兩個清單還沒載入好時的標題
        lodestone_tab_achievements: '成就',
        lodestone_tab_mounts: '坐騎',
        lodestone_tab_minions: '寵物',
        lodestone_tab_fc: '部隊',

        // 部隊分頁的欄位
        lodestone_fc_members: '人數',
        lodestone_fc_rank: '排名',
        lodestone_fc_recruitment: '招募狀態',
        lodestone_fc_estate: '部隊房屋',
        lodestone_fc_focus: '活動重點',
        lodestone_fc_seeking: '招募對象',
        lodestone_fc_reputation: '大國防聯軍聲望',
        lodestone_fc_member_list: '成員',

        // 錯誤訊息
        lodestone_error_not_found: '找不到這個角色',
        lodestone_error_query_failed: '查詢失敗',

        // 換頁（成就與部隊成員）
        lodestone_pagination_info: '第 {page} 頁，共 {total} 頁',
        lodestone_pagination_prev: '上一頁',
        lodestone_pagination_next: '下一頁'
    },
    en: {
        // Page header (the tool name in the site header and the hidden h1)
        lodestone_header: 'Lodestone Lookup',

        // Landing: my character, find a character, recently viewed
        lodestone_intro: 'Enter a name and a world to look up the job levels, achievements and collections of a character on the global servers.',
        lodestone_mine: 'My character',
        lodestone_open: 'Open →',
        lodestone_find: 'Find a character',
        lodestone_name_label: 'Character name',
        lodestone_name_placeholder: 'e.g. Aoi Mizuno',
        lodestone_world: 'World',
        lodestone_world_all: 'All worlds',
        lodestone_dcs: 'Data centers',
        lodestone_find_note: 'You can also paste a Lodestone character page URL or ID. Global servers only.',
        lodestone_data_lang: 'Names and achievements in',
        lodestone_recent: 'Recently viewed',
        lodestone_back: '← Find someone else',

        // A person row and the character header: world (data center) · FC, job and level
        lodestone_where: '{world} ({dc})',
        lodestone_sep: ' · ',
        lodestone_level: 'Lv{level}',
        lodestone_fc: 'FC',
        lodestone_fc_named: 'FC {name}',
        // A person row: a pause for screen readers between the name and the line under it (not shown)
        lodestone_spoken_sep: ', ',

        // Search results
        lodestone_search_found_in: 'Found {count} for “{name}” on {where}',
        lodestone_search_found: 'Found {count} for “{name}”',
        lodestone_search_none_in: 'No “{name}” found on {where}',
        lodestone_search_none: 'No “{name}” found',
        lodestone_search_hint: 'Check the world, or paste their Lodestone character page URL',
        lodestone_search_more: 'There are more results. Type the full name or choose a world',
        lodestone_search_official: 'Search for “{name}” on the Lodestone',
        lodestone_error_upstream: 'The Lodestone can\'t be reached right now. Please try again later',

        // Character header
        lodestone_now: 'Now: ',
        lodestone_active_job: 'Current job',
        lodestone_set_mine: '☆ Set as my character',
        lodestone_is_mine: '★ My character',
        lodestone_open_lodestone: 'Open on the Lodestone',
        lodestone_fetched_at: 'Data as of {time}',

        // The six tabs of the character view
        lodestone_tabs_label: 'Character details',
        lodestone_tab_jobs: 'Jobs',
        lodestone_tab_gear: 'Gear',
        lodestone_tab_collections: 'Collections',
        lodestone_tab_about: 'Other',
        // Next to a tab's error message: loads that tab again
        lodestone_retry: 'Try again',

        // Jobs tab: the seven groups, how many are at max level
        lodestone_role_tank: 'Tank',
        lodestone_role_healer: 'Healer',
        lodestone_role_melee: 'Melee',
        lodestone_role_ranged: 'Ranged',
        lodestone_role_magic: 'Caster',
        lodestone_role_crafting: 'Crafter',
        lodestone_role_gathering: 'Gatherer',
        lodestone_jobs_maxed: '{count} at max level',

        // Achievements tab
        lodestone_achievement_unit: 'achievements',
        lodestone_point_unit: 'points',
        lodestone_achievements_private: 'This character\'s achievements are not public',

        // Gear tab
        lodestone_gear_note: 'The Lodestone character page shows gear icons only, without their names.',
        lodestone_gear_none: 'No gear data.',

        // Collections tab
        lodestone_mounts_total: 'Mounts {count}',
        lodestone_minions_total: 'Minions {count}',
        lodestone_filter_names: 'Filter by name',
        lodestone_filter_none: 'No matching names',

        // Free Company tab
        lodestone_fc_none: 'Not in a Free Company',
        lodestone_fc_ranking_weekly: 'Weekly {rank}',
        lodestone_fc_ranking_monthly: 'Monthly {rank}',

        // The search button
        lodestone_search: 'Search',

        // Loading state
        lodestone_loading: 'Loading…',

        // Jobs tab: the special content line; gear tab: slots and attributes
        lodestone_special_content: 'Special content: {content}',
        lodestone_equip_mainhand: 'Main Hand',
        lodestone_equip_offhand: 'Off Hand',
        lodestone_equip_head: 'Head',
        lodestone_equip_body: 'Body',
        lodestone_equip_hands: 'Hands',
        lodestone_equip_legs: 'Legs',
        lodestone_equip_feet: 'Feet',
        lodestone_equip_earrings: 'Earrings',
        lodestone_equip_necklace: 'Necklace',
        lodestone_equip_bracelets: 'Bracelets',
        lodestone_equip_ring1: 'Ring 1',
        lodestone_equip_ring2: 'Ring 2',
        lodestone_equip_soulcrystal: 'Soul Crystal',
        lodestone_attributes: 'Attributes',
        lodestone_main_attributes: 'Main attributes',
        lodestone_sub_attributes: 'Sub attributes',

        // Other tab: guardian and starting city
        lodestone_deity: 'Guardian',
        lodestone_city: 'Starting city',

        // Gear tab: attribute names (main and sub)
        lodestone_strength: 'Strength',
        lodestone_dexterity: 'Dexterity',
        lodestone_vitality: 'Vitality',
        lodestone_intelligence: 'Intelligence',
        lodestone_mind: 'Mind',
        lodestone_critical: 'Critical Hit',
        lodestone_determination: 'Determination',
        lodestone_direct_hit: 'Direct Hit',
        lodestone_skill_speed: 'Skill Speed',
        lodestone_spell_speed: 'Spell Speed',
        lodestone_piety: 'Piety',
        lodestone_tenacity: 'Tenacity',

        // Other tab: grand company, nameday and bio
        lodestone_grand_company: 'Grand Company',
        lodestone_nameday: 'Nameday',
        lodestone_bio: 'Bio',

        // Names of the achievements and Free Company tabs; the two collection lists' titles before they load
        lodestone_tab_achievements: 'Achievements',
        lodestone_tab_mounts: 'Mounts',
        lodestone_tab_minions: 'Minions',
        lodestone_tab_fc: 'Free Company',

        // Free Company tab: fields
        lodestone_fc_members: 'Active members',
        lodestone_fc_rank: 'Ranking',
        lodestone_fc_recruitment: 'Recruitment',
        lodestone_fc_estate: 'Estate',
        lodestone_fc_focus: 'Focus',
        lodestone_fc_seeking: 'Seeking',
        lodestone_fc_reputation: 'Grand Company Reputation',
        lodestone_fc_member_list: 'Members',

        // Error messages
        lodestone_error_not_found: 'Character not found',
        lodestone_error_query_failed: 'Lookup failed',

        // Pagination (achievements and Free Company members)
        lodestone_pagination_info: 'Page {page} of {total}',
        lodestone_pagination_prev: 'Previous',
        lodestone_pagination_next: 'Next'
    },
    ja: {
        // ページヘッダー（サイトのヘッダーのツール名と見えない h1）
        lodestone_header: 'Lodestone 検索',

        // 最初の画面：マイキャラクター、キャラクターを探す、最近見たキャラクター
        lodestone_intro: '名前とワールドを入力して、グローバル版キャラクターのジョブレベル・アチーブメント・コレクションを調べます。',
        lodestone_mine: 'マイキャラクター',
        lodestone_open: '開く →',
        lodestone_find: 'キャラクターを探す',
        lodestone_name_label: 'キャラクター名',
        lodestone_name_placeholder: '例：Aoi Mizuno',
        lodestone_world: 'ワールド',
        lodestone_world_all: 'すべてのワールド',
        lodestone_dcs: 'データセンター',
        lodestone_find_note: 'Lodestone のキャラクターページの URL や ID を貼り付けることもできます。グローバル版のキャラクターのみ検索できます。',
        lodestone_data_lang: '名前とアチーブメントの表示',
        lodestone_recent: '最近見たキャラクター',
        lodestone_back: '← 他の人を探す',

        // キャラクターの一行とヘッダー：ワールド（データセンター）・FC、ジョブとレベル
        lodestone_where: '{world}（{dc}）',
        lodestone_sep: '・',
        lodestone_level: 'Lv{level}',
        lodestone_fc: 'FC',
        lodestone_fc_named: 'FC {name}',
        // 人の一行：名前と下の行のあいだに入れるスクリーンリーダー用の区切り（画面には出ない）
        lodestone_spoken_sep: '、',

        // 検索結果
        lodestone_search_found_in: '{where}で「{name}」が{count}件見つかりました',
        lodestone_search_found: '「{name}」が{count}件見つかりました',
        lodestone_search_none_in: '{where}に「{name}」は見つかりませんでした',
        lodestone_search_none: '「{name}」は見つかりませんでした',
        lodestone_search_hint: 'ワールドを確認するか、Lodestone のキャラクターページの URL を貼り付けてください',
        lodestone_search_more: 'ほかにも結果があります。名前を最後まで入力するか、ワールドを選んでください',
        lodestone_search_official: 'Lodestone 公式サイトで「{name}」を検索',
        lodestone_error_upstream: 'Lodestone に接続できません。しばらくしてからもう一度お試しください',

        // キャラクターのヘッダー
        lodestone_now: '現在：',
        lodestone_active_job: '現在のジョブ',
        lodestone_set_mine: '☆ マイキャラクターに設定',
        lodestone_is_mine: '★ マイキャラクター',
        lodestone_open_lodestone: 'Lodestone で開く',
        lodestone_fetched_at: 'データ取得：{time}',

        // キャラクター画面の 6 つのタブ
        lodestone_tabs_label: 'キャラクター情報',
        lodestone_tab_jobs: 'ジョブ',
        lodestone_tab_gear: '装備',
        lodestone_tab_collections: 'コレクション',
        lodestone_tab_about: 'その他',
        // タブの読み込みに失敗したとき、エラーの横でそのタブを読み込み直すボタン
        lodestone_retry: 'もう一度試す',

        // ジョブタブ：7 つのグループ、カンストしたジョブの数
        lodestone_role_tank: 'タンク',
        lodestone_role_healer: 'ヒーラー',
        lodestone_role_melee: 'メレー',
        lodestone_role_ranged: 'レンジ',
        lodestone_role_magic: 'キャスター',
        lodestone_role_crafting: 'クラフター',
        lodestone_role_gathering: 'ギャザラー',
        lodestone_jobs_maxed: 'カンスト {count}',

        // アチーブメントタブ
        lodestone_achievement_unit: 'アチーブメント',
        lodestone_point_unit: 'ポイント',
        lodestone_achievements_private: 'このキャラクターはアチーブメントを公開していません',

        // 装備タブ
        lodestone_gear_note: 'Lodestone のキャラクターページには装備のアイコンだけがあり、名前はありません。',
        lodestone_gear_none: '装備のデータがありません。',

        // コレクションタブ
        lodestone_mounts_total: 'マウント {count}',
        lodestone_minions_total: 'ミニオン {count}',
        lodestone_filter_names: '名前で絞り込む',
        lodestone_filter_none: '一致する名前はありません',

        // フリーカンパニータブ
        lodestone_fc_none: 'フリーカンパニーに所属していません',
        lodestone_fc_ranking_weekly: '週間 {rank}位',
        lodestone_fc_ranking_monthly: '月間 {rank}位',

        // 検索ボタン
        lodestone_search: '検索',

        // 読み込み状態
        lodestone_loading: '読み込み中…',

        // ジョブタブの特殊コンテンツ、装備タブの部位とステータス
        lodestone_special_content: '特殊コンテンツ：{content}',
        lodestone_equip_mainhand: 'メインアーム',
        lodestone_equip_offhand: 'サブアーム',
        lodestone_equip_head: '頭',
        lodestone_equip_body: '胴',
        lodestone_equip_hands: '手',
        lodestone_equip_legs: '脚',
        lodestone_equip_feet: '足',
        lodestone_equip_earrings: '耳',
        lodestone_equip_necklace: '首',
        lodestone_equip_bracelets: '腕',
        lodestone_equip_ring1: '指1',
        lodestone_equip_ring2: '指2',
        lodestone_equip_soulcrystal: 'ソウルクリスタル',
        lodestone_attributes: 'ステータス',
        lodestone_main_attributes: 'メインステータス',
        lodestone_sub_attributes: 'サブステータス',

        // その他タブ：守護神、開始都市
        lodestone_deity: '守護神',
        lodestone_city: '開始都市',

        // 装備タブのステータス名（メインとサブ）
        lodestone_strength: 'STR',
        lodestone_dexterity: 'DEX',
        lodestone_vitality: 'VIT',
        lodestone_intelligence: 'INT',
        lodestone_mind: 'MND',
        lodestone_critical: 'クリティカル',
        lodestone_determination: '意思力',
        lodestone_direct_hit: 'ダイレクトヒット',
        lodestone_skill_speed: 'スキルスピード',
        lodestone_spell_speed: 'スペルスピード',
        lodestone_piety: '信仰',
        lodestone_tenacity: '不屈',

        // その他タブ：グランドカンパニー、誕生日、自己紹介
        lodestone_grand_company: 'グランドカンパニー',
        lodestone_nameday: '誕生日',
        lodestone_bio: '自己紹介',

        // アチーブメントとフリーカンパニーのタブ名、読み込み前のコレクションの 2 つのリストの見出し
        lodestone_tab_achievements: 'アチーブメント',
        lodestone_tab_mounts: 'マウント',
        lodestone_tab_minions: 'ミニオン',
        lodestone_tab_fc: 'フリーカンパニー',

        // フリーカンパニータブの項目
        lodestone_fc_members: 'メンバー数',
        lodestone_fc_rank: 'ランキング',
        lodestone_fc_recruitment: '募集状態',
        lodestone_fc_estate: 'カンパニーハウス',
        lodestone_fc_focus: '活動方針',
        lodestone_fc_seeking: '募集対象',
        lodestone_fc_reputation: 'グランドカンパニー評価',
        lodestone_fc_member_list: 'メンバー',

        // エラーメッセージ
        lodestone_error_not_found: 'キャラクターが見つかりません',
        lodestone_error_query_failed: '検索に失敗しました',

        // ページ送り（アチーブメントとフリーカンパニーのメンバー）
        lodestone_pagination_info: '{page} / {total} ページ',
        lodestone_pagination_prev: '前へ',
        lodestone_pagination_next: '次へ'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('lodestone-lookup', LodestoneLookupTranslations);
}
