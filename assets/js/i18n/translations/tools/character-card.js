/**
 * FF14.tw 角色卡產生器翻譯檔
 *
 * {n}、{max} 是字數計數的數字（char_card_count）；{day}、{slot} 是時段勾選框名稱裡的日子與時段（char_card_hours_cell）；
 * {job}、{level} 是預覽圖說明裡的主職與等級，{parts} 是已經填了的幾段（名字、伺服器、主職）用 char_card_preview_sep 接起來的字
 * （char_card_preview_label）：沒填的部分不寫，所以不是一個留空格的樣板，一個都沒填時用 char_card_preview_empty。
 * 遊戲用語（大國防聯軍、部隊、職能、喜歡的內容、在找什麼）照 TERMINOLOGY.md 與官方名稱；職業的名稱在 assets/js/ff14-game-data.js（三語都有）。
 * char_card_card_* 是畫在卡片上的短標籤（英文的全名縮在卡片上小到看不清）；char_card_day_*、char_card_slot_* 是表單上的全名。
 */
const CharacterCardTranslations = {
    zh: {
        // 頁面
        char_card_header: '角色卡產生器',
        char_card_lead: '填名字、伺服器和主職就能下載；其他都是選填。',

        // 手機的分頁與每一組的標題
        char_card_tabs_label: '欄位分組',
        char_card_tab_basic: '基本',
        char_card_tab_profile: '名片',
        char_card_tab_play: '怎麼玩',
        char_card_tab_image: '圖片',
        char_card_tab_style: '樣式',
        char_card_panel_basic: '基本資料（必填）',
        char_card_panel_profile: '名片資訊',
        char_card_panel_about: '自我介紹與聯絡',
        char_card_panel_play: '怎麼玩',
        char_card_panel_image: '角色圖',
        char_card_panel_style: '樣式',

        // 基本資料
        char_card_name_label: '角色名稱',
        char_card_name_placeholder: 'Luna Starweaver',
        char_card_world_label: '伺服器',
        char_card_world_placeholder: '選擇伺服器',
        char_card_world_group_tc: '繁中服',
        char_card_world_group_global: '國際服',
        char_card_world_custom: '其他（自己輸入）',
        char_card_world_custom_label: '自己輸入的伺服器名稱',
        char_card_job_label: '主職',
        char_card_job_placeholder: '選擇主職',
        char_card_level_label: '等級',
        char_card_role_tank: '坦克',
        char_card_role_healer: '補師',
        char_card_role_melee: '近戰',
        char_card_role_ranged: '遠程',
        char_card_role_magic: '法系',
        char_card_role_crafting: '生產',
        char_card_role_gathering: '採集',
        char_card_role_limited: '限定',

        // 名片資訊
        char_card_subjobs_label: '其他職業',
        char_card_title_label: '稱號',
        char_card_title_placeholder: '例：光之戰士',
        char_card_fc_name_label: '部隊名稱',
        char_card_fc_tag_label: '部隊簡稱',
        char_card_gc_label: '大國防聯軍',
        char_card_gc_none: '不填',
        char_card_gc_maelstrom: '黑渦團',
        char_card_gc_twin_adder: '雙蛇黨',
        char_card_gc_immortal_flames: '不滅隊',

        // 自我介紹與聯絡
        char_card_intro_label: '一句話自我介紹',
        char_card_intro_placeholder: '例：想找一起打零式的固定隊',
        char_card_contact_label: '聯絡方式（選填）',
        char_card_contact_placeholder: '例：Discord：luna_star',

        // 怎麼玩
        char_card_hours_label: '遊玩時段',
        char_card_hours_hint: '早上 6–12 點、下午 12–18 點、晚上 18–24 點、深夜 0–6 點',
        char_card_hours_cell: '{day} {slot}',
        char_card_day_weekday: '平日',
        char_card_day_weekend: '假日',
        char_card_slot_morning: '早上',
        char_card_slot_afternoon: '下午',
        char_card_slot_evening: '晚上',
        char_card_slot_late_night: '深夜',
        char_card_likes_label: '喜歡的內容',
        char_card_like_msq: '主線劇情',
        char_card_like_leveling: '練等',
        char_card_like_trials: '討伐殲滅戰',
        char_card_like_savage: '零式',
        char_card_like_ultimate: '絕境戰',
        char_card_like_alliance: '聯盟任務',
        char_card_like_pvp: 'PvP',
        char_card_like_crafting: '生產',
        char_card_like_gathering: '採集',
        char_card_like_treasure: '寶圖',
        char_card_like_deep_dungeon: '深層迷宮',
        char_card_like_housing: '房屋',
        char_card_like_glamour: '幻化',
        char_card_like_photo: '拍照',
        char_card_like_roleplay: '角色扮演',
        char_card_like_fishing: '釣魚',
        char_card_looking_label: '在找什麼',
        char_card_looking_static: '固定隊',
        char_card_looking_fc: '部隊',
        char_card_looking_friends: '朋友',

        // 畫在卡片上的時段短標籤
        char_card_card_day_weekday: '平日',
        char_card_card_day_weekend: '假日',
        char_card_card_slot_morning: '早上',
        char_card_card_slot_afternoon: '下午',
        char_card_card_slot_evening: '晚上',
        char_card_card_slot_late_night: '深夜',

        // 樣式
        char_card_accent_label: '重點色',
        char_card_accent_auto: '跟著職能',
        char_card_accent_custom: '自己選',
        char_card_accent_color_label: '自己選的顏色',
        char_card_clear_all: '清除全部',
        char_card_clear_confirm: '再按一次清除',
        char_card_clear_hint: '清除所有欄位、上傳的圖片，以及這個瀏覽器記住的資料。',
        char_card_cleared: '已清除全部資料',

        // 預覽
        char_card_preview_title: '卡片預覽',
        char_card_preview_label: '角色卡預覽：{parts}',
        char_card_preview_empty: '角色卡預覽：還沒填資料',
        char_card_preview_sep: '，',
        char_card_preview_job: '{job} Lv {level}',
        char_card_format_label: '版型',
        char_card_format_landscape: '橫版',
        char_card_format_portrait: '直版',

        // 字數計數（全形的斜線；英文與日文是半形）
        char_card_count: '{n}／{max}'
    },
    en: {
        // Page
        char_card_header: 'Character Card Generator',
        char_card_lead: 'Fill in a name, world and main job to download. Everything else is optional.',

        // Phone tabs and the title of each group
        char_card_tabs_label: 'Form sections',
        char_card_tab_basic: 'Basics',
        char_card_tab_profile: 'Profile',
        char_card_tab_play: 'Play',
        char_card_tab_image: 'Image',
        char_card_tab_style: 'Style',
        char_card_panel_basic: 'Basics (required)',
        char_card_panel_profile: 'Card details',
        char_card_panel_about: 'Intro and contact',
        char_card_panel_play: 'How you play',
        char_card_panel_image: 'Character image',
        char_card_panel_style: 'Style',

        // Basics
        char_card_name_label: 'Character name',
        char_card_name_placeholder: 'Luna Starweaver',
        char_card_world_label: 'World',
        char_card_world_placeholder: 'Choose a world',
        char_card_world_group_tc: 'Traditional Chinese',
        char_card_world_group_global: 'International',
        char_card_world_custom: 'Other (type it in)',
        char_card_world_custom_label: 'World name',
        char_card_job_label: 'Main job',
        char_card_job_placeholder: 'Choose a main job',
        char_card_level_label: 'Level',
        char_card_role_tank: 'Tank',
        char_card_role_healer: 'Healer',
        char_card_role_melee: 'Melee DPS',
        char_card_role_ranged: 'Physical Ranged DPS',
        char_card_role_magic: 'Magical Ranged DPS',
        char_card_role_crafting: 'Crafter',
        char_card_role_gathering: 'Gatherer',
        char_card_role_limited: 'Limited',

        // Card details
        char_card_subjobs_label: 'Other jobs',
        char_card_title_label: 'Title',
        char_card_title_placeholder: 'e.g. Warrior of Light',
        char_card_fc_name_label: 'Free Company name',
        char_card_fc_tag_label: 'Free Company tag',
        char_card_gc_label: 'Grand Company',
        char_card_gc_none: 'None',
        char_card_gc_maelstrom: 'Maelstrom',
        char_card_gc_twin_adder: 'Order of the Twin Adder',
        char_card_gc_immortal_flames: 'Immortal Flames',

        // Intro and contact
        char_card_intro_label: 'One-line intro',
        char_card_intro_placeholder: 'e.g. Looking for a Savage static',
        char_card_contact_label: 'Contact (optional)',
        char_card_contact_placeholder: 'e.g. Discord: luna_star',

        // How you play
        char_card_hours_label: 'Play hours',
        char_card_hours_hint: 'Morning 6–12, Afternoon 12–18, Evening 18–24, Late night 0–6',
        char_card_hours_cell: '{day} {slot}',
        char_card_day_weekday: 'Weekdays',
        char_card_day_weekend: 'Weekends',
        char_card_slot_morning: 'Morning',
        char_card_slot_afternoon: 'Afternoon',
        char_card_slot_evening: 'Evening',
        char_card_slot_late_night: 'Late night',
        char_card_likes_label: 'Favorite content',
        char_card_like_msq: 'Main Scenario',
        char_card_like_leveling: 'Leveling',
        char_card_like_trials: 'Trials',
        char_card_like_savage: 'Savage',
        char_card_like_ultimate: 'Ultimate',
        char_card_like_alliance: 'Alliance Raids',
        char_card_like_pvp: 'PvP',
        char_card_like_crafting: 'Crafting',
        char_card_like_gathering: 'Gathering',
        char_card_like_treasure: 'Treasure Hunts',
        char_card_like_deep_dungeon: 'Deep Dungeons',
        char_card_like_housing: 'Housing',
        char_card_like_glamour: 'Glamour',
        char_card_like_photo: 'Screenshots',
        char_card_like_roleplay: 'Roleplay',
        char_card_like_fishing: 'Fishing',
        char_card_looking_label: 'Looking for',
        char_card_looking_static: 'Static',
        char_card_looking_fc: 'Free Company',
        char_card_looking_friends: 'Friends',

        // Short labels for the hours drawn on the card
        char_card_card_day_weekday: 'Wkdy',
        char_card_card_day_weekend: 'Wknd',
        char_card_card_slot_morning: 'Morn',
        char_card_card_slot_afternoon: 'Aft',
        char_card_card_slot_evening: 'Eve',
        char_card_card_slot_late_night: 'Late',

        // Style
        char_card_accent_label: 'Accent color',
        char_card_accent_auto: 'Match the job role',
        char_card_accent_custom: 'Pick my own',
        char_card_accent_color_label: 'Custom color',
        char_card_clear_all: 'Clear everything',
        char_card_clear_confirm: 'Press again to clear',
        char_card_clear_hint: 'Clears every field, the uploaded image and what this browser remembers.',
        char_card_cleared: 'Everything was cleared',

        // Preview
        char_card_preview_title: 'Card preview',
        char_card_preview_label: 'Character card preview: {parts}',
        char_card_preview_empty: 'Character card preview: nothing filled in yet',
        char_card_preview_sep: ', ',
        char_card_preview_job: '{job} Lv {level}',
        char_card_format_label: 'Card shape',
        char_card_format_landscape: 'Landscape',
        char_card_format_portrait: 'Portrait',

        // Character counter (a half-width slash)
        char_card_count: '{n}/{max}'
    },
    ja: {
        // ページ
        char_card_header: 'キャラクターカード生成',
        char_card_lead: '名前・ワールド・メインジョブを入力すればダウンロードできます。ほかはすべて任意です。',

        // スマホのタブと各グループの見出し
        char_card_tabs_label: '入力項目のグループ',
        char_card_tab_basic: '基本',
        char_card_tab_profile: '名刺',
        char_card_tab_play: '遊び方',
        char_card_tab_image: '画像',
        char_card_tab_style: 'スタイル',
        char_card_panel_basic: '基本情報（必須）',
        char_card_panel_profile: '名刺の情報',
        char_card_panel_about: '自己紹介と連絡先',
        char_card_panel_play: '遊び方',
        char_card_panel_image: 'キャラクター画像',
        char_card_panel_style: 'スタイル',

        // 基本情報
        char_card_name_label: 'キャラクター名',
        char_card_name_placeholder: 'Luna Starweaver',
        char_card_world_label: 'ワールド',
        char_card_world_placeholder: 'ワールドを選択',
        char_card_world_group_tc: '繁体字中国語版',
        char_card_world_group_global: '国際版',
        char_card_world_custom: 'その他（自分で入力）',
        char_card_world_custom_label: '入力したワールド名',
        char_card_job_label: 'メインジョブ',
        char_card_job_placeholder: 'メインジョブを選択',
        char_card_level_label: 'レベル',
        char_card_role_tank: 'タンク',
        char_card_role_healer: 'ヒーラー',
        char_card_role_melee: 'メレー',
        char_card_role_ranged: '物理レンジ',
        char_card_role_magic: '魔法レンジ',
        char_card_role_crafting: 'クラフター',
        char_card_role_gathering: 'ギャザラー',
        char_card_role_limited: 'リミテッド',

        // 名刺の情報
        char_card_subjobs_label: 'ほかのジョブ',
        char_card_title_label: '称号',
        char_card_title_placeholder: '例：光の戦士',
        char_card_fc_name_label: 'フリーカンパニー名',
        char_card_fc_tag_label: 'FCタグ',
        char_card_gc_label: 'グランドカンパニー',
        char_card_gc_none: '指定なし',
        char_card_gc_maelstrom: '黒渦団',
        char_card_gc_twin_adder: '双蛇党',
        char_card_gc_immortal_flames: '不滅隊',

        // 自己紹介と連絡先
        char_card_intro_label: 'ひとこと自己紹介',
        char_card_intro_placeholder: '例：零式の固定を探しています',
        char_card_contact_label: '連絡先（任意）',
        char_card_contact_placeholder: '例：Discord：luna_star',

        // 遊び方
        char_card_hours_label: 'プレイ時間帯',
        char_card_hours_hint: '朝 6〜12時、昼 12〜18時、夜 18〜24時、深夜 0〜6時',
        char_card_hours_cell: '{day} {slot}',
        char_card_day_weekday: '平日',
        char_card_day_weekend: '休日',
        char_card_slot_morning: '朝',
        char_card_slot_afternoon: '昼',
        char_card_slot_evening: '夜',
        char_card_slot_late_night: '深夜',
        char_card_likes_label: '好きなコンテンツ',
        char_card_like_msq: 'メインクエスト',
        char_card_like_leveling: 'レベル上げ',
        char_card_like_trials: '討伐・討滅戦',
        char_card_like_savage: '零式',
        char_card_like_ultimate: '絶境戦',
        char_card_like_alliance: 'アライアンスレイド',
        char_card_like_pvp: 'PvP',
        char_card_like_crafting: '製作',
        char_card_like_gathering: '採集',
        char_card_like_treasure: 'トレジャーハント',
        char_card_like_deep_dungeon: 'ディープダンジョン',
        char_card_like_housing: 'ハウジング',
        char_card_like_glamour: 'ミラプリ',
        char_card_like_photo: 'SS撮影',
        char_card_like_roleplay: 'ロールプレイ',
        char_card_like_fishing: '釣り',
        char_card_looking_label: '探していること',
        char_card_looking_static: '固定',
        char_card_looking_fc: 'FC',
        char_card_looking_friends: 'フレンド',

        // カードに描く時間帯の短いラベル
        char_card_card_day_weekday: '平日',
        char_card_card_day_weekend: '休日',
        char_card_card_slot_morning: '朝',
        char_card_card_slot_afternoon: '昼',
        char_card_card_slot_evening: '夜',
        char_card_card_slot_late_night: '深夜',

        // スタイル
        char_card_accent_label: '強調色',
        char_card_accent_auto: 'ロールに合わせる',
        char_card_accent_custom: '自分で選ぶ',
        char_card_accent_color_label: '自分で選んだ色',
        char_card_clear_all: 'すべて消去',
        char_card_clear_confirm: 'もう一度押すと消去',
        char_card_clear_hint: 'すべての入力、アップロードした画像、このブラウザーに保存した内容を消します。',
        char_card_cleared: 'すべて消去しました',

        // プレビュー
        char_card_preview_title: 'カードのプレビュー',
        char_card_preview_label: 'キャラクターカードのプレビュー：{parts}',
        char_card_preview_empty: 'キャラクターカードのプレビュー：まだ入力されていません',
        char_card_preview_sep: '、',
        char_card_preview_job: '{job} Lv {level}',
        char_card_format_label: 'カードの向き',
        char_card_format_landscape: '横型',
        char_card_format_portrait: '縦型',

        // 文字数カウンター（半角のスラッシュ）
        char_card_count: '{n}/{max}'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('character-card', CharacterCardTranslations);
}
