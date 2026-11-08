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

        // 搜尋區
        lodestone_placeholder: '請輸入 Lodestone ID (例如：12345678)',
        lodestone_dc_na: '北美資料中心',
        lodestone_dc_jp: '日本資料中心',
        lodestone_search: '搜尋',
        lodestone_hint: '提示：您可以在 Lodestone 官方網站的角色頁面 URL 中找到角色 ID',
        lodestone_example: '例如：https://na.finalfantasyxiv.com/lodestone/character/',

        // 載入狀態
        lodestone_loading: '載入中…',

        // 區段標題
        lodestone_basic_info: '基本資訊',
        lodestone_job_levels: '職業等級',
        lodestone_special_content: '特殊內容',
        lodestone_equipment: '裝備資訊',
        lodestone_equip_mainhand: '主手：',
        lodestone_equip_head: '頭部：',
        lodestone_equip_body: '身體：',
        lodestone_equip_hands: '手部：',
        lodestone_equip_legs: '腿部：',
        lodestone_equip_feet: '腳部：',
        lodestone_equip_earrings: '耳飾：',
        lodestone_equip_necklace: '頸飾：',
        lodestone_equip_bracelets: '腕飾：',
        lodestone_equip_ring1: '戒指1：',
        lodestone_equip_ring2: '戒指2：',
        lodestone_equip_soulcrystal: '靈魂水晶：',
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
        lodestone_go_to_tab: '前往{tab}分頁',

        // 成就區
        lodestone_total_achievements: '總成就數：',
        lodestone_achievement_points: '成就點數：',
        // 成就標籤（無冒號，用於總覽卡片）
        lodestone_total_achievements_label: '總成就數',
        lodestone_achievement_points_label: '成就點數',

        // 收藏區
        lodestone_mounts_collection: '坐騎收藏',
        lodestone_minions_collection: '寵物收藏',
        lodestone_mounts_count: '{count} 個坐騎',
        lodestone_minions_count: '{count} 隻寵物',
        lodestone_mounts_count_unit: '個坐騎',
        lodestone_minions_count_unit: '隻寵物',

        // 公會招募狀態
        lodestone_fc_recruitment_open: '開放',
        lodestone_fc_recruitment_closed: '關閉',

        // 公會資訊
        lodestone_fc_info: '公會資訊',
        lodestone_fc_members: '成員數：',
        lodestone_fc_members_label: '成員數',
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
        lodestone_usage_7: '更多詳細資訊請前往官方 Lodestone 頁面查看',

        // 錯誤訊息
        lodestone_error_no_id: '請輸入角色 ID',
        lodestone_error_invalid_id: '角色 ID 必須是數字',
        lodestone_error_not_found: '找不到這個角色',
        lodestone_error_query_failed: '查詢失敗',
        lodestone_error_format: '伺服器回應格式錯誤',
        lodestone_error_no_data: '無法取得角色資料',
        lodestone_error_job_list_loading: '載入詳細職業列表中...',
        lodestone_error_job_data_unavailable: '職業等級資料暫不可用',
        lodestone_error_no_equipment: '無裝備資料',
        lodestone_error_no_jobs: '無職業資料',
        lodestone_error_no_achievements: '暫無成就資料',
        lodestone_error_no_mounts: '暫無坐騎資料',
        lodestone_error_no_minions: '暫無寵物資料',
        lodestone_error_fc_loading: '載入公會資訊中...',
        lodestone_error_fc_failed: '公會資訊載入失敗',
        lodestone_error_no_members: '暫無成員資料',

        // 分頁文字
        lodestone_pagination_info: '第 {page} 頁，共 {total} 頁',
        lodestone_pagination_prev: '上一頁',
        lodestone_pagination_next: '下一頁'
    },
    en: {
        // Page info
        lodestone_title: 'Lodestone Lookup - FF14.tw',
        lodestone_description: 'Look up Final Fantasy XIV character info using Lodestone ID',

        // Page header
        lodestone_header: 'Lodestone Lookup',
        lodestone_subtitle: 'Enter character Lodestone ID to view detailed information',

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

        // Search section
        lodestone_placeholder: 'Enter Lodestone ID (e.g., 12345678)',
        lodestone_dc_na: 'North America DC',
        lodestone_dc_jp: 'Japan DC',
        lodestone_search: 'Search',
        lodestone_hint: 'Tip: You can find the character ID in the Lodestone profile URL',
        lodestone_example: 'Example: https://na.finalfantasyxiv.com/lodestone/character/',

        // Loading state
        lodestone_loading: 'Loading…',

        // Section titles
        lodestone_basic_info: 'Basic Information',
        lodestone_job_levels: 'Job Levels',
        lodestone_special_content: 'Special Content',
        lodestone_equipment: 'Equipment',
        lodestone_equip_mainhand: 'Main Hand:',
        lodestone_equip_head: 'Head:',
        lodestone_equip_body: 'Body:',
        lodestone_equip_hands: 'Hands:',
        lodestone_equip_legs: 'Legs:',
        lodestone_equip_feet: 'Feet:',
        lodestone_equip_earrings: 'Earrings:',
        lodestone_equip_necklace: 'Necklace:',
        lodestone_equip_bracelets: 'Bracelets:',
        lodestone_equip_ring1: 'Ring 1:',
        lodestone_equip_ring2: 'Ring 2:',
        lodestone_equip_soulcrystal: 'Soul Crystal:',
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
        lodestone_go_to_tab: 'Go to the {tab} tab',

        // Achievements section
        lodestone_total_achievements: 'Total Achievements:',
        lodestone_achievement_points: 'Achievement Points:',
        // Achievement labels (no colon, for overview cards)
        lodestone_total_achievements_label: 'Total Achievements',
        lodestone_achievement_points_label: 'Achievement Points',

        // Collection section
        lodestone_mounts_collection: 'Mount Collection',
        lodestone_minions_collection: 'Minion Collection',
        lodestone_mounts_count: '{count} mounts',
        lodestone_minions_count: '{count} minions',
        lodestone_mounts_count_unit: 'mounts',
        lodestone_minions_count_unit: 'minions',

        // FC Recruitment status
        lodestone_fc_recruitment_open: 'Open',
        lodestone_fc_recruitment_closed: 'Closed',

        // FC info
        lodestone_fc_info: 'Free Company Info',
        lodestone_fc_members: 'Members:',
        lodestone_fc_members_label: 'Members',
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
        lodestone_usage_7: 'Visit the official Lodestone page for more details',

        // Error messages
        lodestone_error_no_id: 'Please enter character ID',
        lodestone_error_invalid_id: 'Character ID must be a number',
        lodestone_error_not_found: 'Character not found',
        lodestone_error_query_failed: 'Lookup failed',
        lodestone_error_format: 'Server response format error',
        lodestone_error_no_data: 'Unable to get character data',
        lodestone_error_job_list_loading: 'Loading detailed job list...',
        lodestone_error_job_data_unavailable: 'Job level data temporarily unavailable',
        lodestone_error_no_equipment: 'No equipment data',
        lodestone_error_no_jobs: 'No job data',
        lodestone_error_no_achievements: 'No achievement data available',
        lodestone_error_no_mounts: 'No mount data available',
        lodestone_error_no_minions: 'No minion data available',
        lodestone_error_fc_loading: 'Loading Free Company info...',
        lodestone_error_fc_failed: 'Failed to load Free Company info',
        lodestone_error_no_members: 'No member data available',

        // Pagination text
        lodestone_pagination_info: 'Page {page} of {total}',
        lodestone_pagination_prev: 'Previous',
        lodestone_pagination_next: 'Next'
    },
    ja: {
        // ページ情報
        lodestone_title: 'Lodestone 検索 - FF14.tw',
        lodestone_description: 'Lodestone IDでFF14キャラクター情報を検索',

        // ページヘッダー
        lodestone_header: 'Lodestone 検索',
        lodestone_subtitle: 'Lodestone IDを入力してキャラクター情報を表示',

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

        // 検索セクション
        lodestone_placeholder: 'Lodestone IDを入力 (例：12345678)',
        lodestone_dc_na: '北米DC',
        lodestone_dc_jp: '日本DC',
        lodestone_search: '検索',
        lodestone_hint: 'ヒント：LodestoneプロフィールURLでキャラクターIDを確認できます',
        lodestone_example: '例：https://jp.finalfantasyxiv.com/lodestone/character/',

        // 読み込み状態
        lodestone_loading: '読み込み中…',

        // セクションタイトル
        lodestone_basic_info: '基本情報',
        lodestone_job_levels: 'ジョブレベル',
        lodestone_special_content: '特殊コンテンツ',
        lodestone_equipment: '装備情報',
        lodestone_equip_mainhand: 'メインアーム：',
        lodestone_equip_head: '頭：',
        lodestone_equip_body: '胴：',
        lodestone_equip_hands: '手：',
        lodestone_equip_legs: '脚：',
        lodestone_equip_feet: '足：',
        lodestone_equip_earrings: '耳：',
        lodestone_equip_necklace: '首：',
        lodestone_equip_bracelets: '腕：',
        lodestone_equip_ring1: '指1：',
        lodestone_equip_ring2: '指2：',
        lodestone_equip_soulcrystal: 'ソウルクリスタル：',
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
        lodestone_go_to_tab: '{tab}タブへ移動',

        // アチーブメントセクション
        lodestone_total_achievements: '総アチーブメント数：',
        lodestone_achievement_points: 'アチーブメントポイント：',
        // アチーブメントラベル（コロンなし、概要カード用）
        lodestone_total_achievements_label: '総アチーブメント数',
        lodestone_achievement_points_label: 'アチーブメントポイント',

        // コレクションセクション
        lodestone_mounts_collection: 'マウントコレクション',
        lodestone_minions_collection: 'ミニオンコレクション',
        lodestone_mounts_count: '{count} マウント',
        lodestone_minions_count: '{count} ミニオン',
        lodestone_mounts_count_unit: 'マウント',
        lodestone_minions_count_unit: 'ミニオン',

        // FC募集状態
        lodestone_fc_recruitment_open: '参加可能',
        lodestone_fc_recruitment_closed: '参加不可',

        // FC情報
        lodestone_fc_info: 'フリーカンパニー情報',
        lodestone_fc_members: 'メンバー数：',
        lodestone_fc_members_label: 'メンバー数',
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
        lodestone_usage_7: '詳細は公式Lodestoneページをご覧ください',

        // エラーメッセージ
        lodestone_error_no_id: 'キャラクターIDを入力してください',
        lodestone_error_invalid_id: 'キャラクターIDは数字でなければなりません',
        lodestone_error_not_found: 'キャラクターが見つかりません',
        lodestone_error_query_failed: '検索に失敗しました',
        lodestone_error_format: 'サーバーレスポンス形式エラー',
        lodestone_error_no_data: 'キャラクター情報を取得できませんでした',
        lodestone_error_job_list_loading: '詳細ジョブリストを読み込み中...',
        lodestone_error_job_data_unavailable: 'ジョブレベルデータは現在利用できません',
        lodestone_error_no_equipment: '装備情報なし',
        lodestone_error_no_jobs: 'ジョブ情報なし',
        lodestone_error_no_achievements: 'アチーブメント情報なし',
        lodestone_error_no_mounts: 'マウント情報なし',
        lodestone_error_no_minions: 'ミニオン情報なし',
        lodestone_error_fc_loading: 'フリーカンパニー情報を読み込み中...',
        lodestone_error_fc_failed: 'フリーカンパニー情報の読み込みに失敗しました',
        lodestone_error_no_members: 'メンバー情報なし',

        // ページネーションテキスト
        lodestone_pagination_info: '{page} / {total} ページ',
        lodestone_pagination_prev: '前へ',
        lodestone_pagination_next: '次へ'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('lodestone-lookup', LodestoneLookupTranslations);
}
