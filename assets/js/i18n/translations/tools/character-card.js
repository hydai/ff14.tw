/**
 * FF14.tw 角色卡產生器翻譯檔
 *
 * {n}、{max} 是字數計數的數字（char_card_count）；{day}、{slot} 是時段勾選框名稱裡的日子與時段（char_card_hours_cell）；
 * {job}、{level} 是預覽圖說明裡的主職與等級，{parts} 是已經填了的幾段（名字、伺服器、主職）用 char_card_preview_sep 接起來的字
 * （char_card_preview_label）：沒填的部分不寫，所以不是一個留空格的樣板，一個都沒填時用 char_card_preview_empty。
 * 遊戲用語（大國防聯軍、部隊、職能、喜歡的內容、在找什麼）照 TERMINOLOGY.md 與官方名稱；職業的名稱在 assets/js/ff14-game-data.js（三語都有）。
 * char_card_not_drawn 是部隊名稱、大國防聯軍、聯絡方式、在找什麼四個欄位底下的說明：現在的海報風格不會把它們畫在卡片上（欄位照樣能填、也會記住），
 * 只說現在的風格，不承諾之後的風格；四個欄位用同一句。
 * char_card_card_* 是畫在卡片上的短標籤（英文的全名縮在卡片上小到看不清）；char_card_day_*、char_card_slot_* 是表單上的全名。
 * char_card_image_* 是角色圖：按鈕與標籤，以及上傳狀態（處理中、已上傳、太大不會記住、讀不出來、已移除、上次的圖片讀不出來）；
 * char_card_image_adjust 與 char_card_image_adjust_done 是同一顆按鈕的兩種字（調整模式前後）。
 * 輸出：char_card_download、char_card_share、char_card_copy 是預覽下面（手機是最下方）的按鈕，char_card_share 也是大圖裡的分享鈕；
 * char_card_error_* 是必填沒填就按下載時寫在欄位下面的錯誤；{file} 是下載的檔名（char_card_downloaded）；
 * 產生圖之前等太久（10 秒）就照目前的畫面產生：char_card_image_slow 是上傳的截圖還在處理時的 toast，char_card_fonts_slow 是其他（字型、職業圖示）；
 * char_card_share_ready 是底部的分享等太久、點擊的使用者手勢過期之後改開大圖時的 toast（請再按一次大圖裡的分享，char_card_share）；
 * char_card_viewer_* 是全螢幕大圖（標題「長按圖片即可儲存」、下載檔案、關閉）；char_card_line_tip 接著連結 char_card_line_tip_link，
 * 兩段合起來是一句「在 LINE 裡可能存不了圖，建議先用瀏覽器打開再填：用瀏覽器打開」（英文的前半句結尾有一個空格）：
 * LINE 的內建瀏覽器和手機的瀏覽器不共用這個網站記住的資料，所以要請玩家在填之前就換瀏覽器，填好再換會什麼都不在。
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

        // 目前的海報風格不畫的欄位（部隊名稱、大國防聯軍、聯絡方式、在找什麼）底下的說明
        char_card_not_drawn: '目前的海報風格不會畫出這一項',

        // 畫在卡片上的時段短標籤
        char_card_card_day_weekday: '平日',
        char_card_card_day_weekend: '假日',
        char_card_card_slot_morning: '早上',
        char_card_card_slot_afternoon: '下午',
        char_card_card_slot_evening: '晚上',
        char_card_card_slot_late_night: '深夜',

        // 角色圖
        char_card_image_upload: '上傳截圖',
        char_card_image_zoom: '縮放',
        char_card_image_center: '置中',
        char_card_image_fill: '填滿',
        char_card_image_remove: '移除圖片',
        char_card_image_adjust: '調整圖片',
        char_card_image_adjust_done: '完成',
        char_card_image_processing: '處理中…',
        char_card_image_uploaded: '已上傳',
        char_card_image_not_saved: '這張圖太大，這次不會記住，重新整理後要再上傳。',
        char_card_image_failed: '這個檔案讀不出來，請換一張圖片。',
        char_card_image_removed: '已移除圖片',
        char_card_image_restore_failed: '上次的圖片讀不出來，請重新上傳。',

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

        // 輸出：按鈕、必填的錯誤、結果的說明、全螢幕大圖、LINE 的提示
        char_card_download: '下載圖片',
        char_card_share: '分享',
        char_card_copy: '複製圖片',
        char_card_error_name: '請填角色名稱',
        char_card_error_world: '請選伺服器',
        char_card_error_job: '請選主職',
        char_card_downloaded: '已下載 {file}',
        char_card_share_failed: '沒辦法分享，請改用下載。',
        char_card_copied: '已複製圖片',
        char_card_copy_failed: '沒辦法複製，請改用下載。',
        char_card_export_failed: '沒辦法產生圖片，請再試一次。',
        char_card_fonts_slow: '字型還沒載完，先用目前的畫面產生圖片。',
        char_card_image_slow: '上傳的截圖還在處理，先用目前的畫面產生圖片。',
        char_card_share_ready: '圖片做好了，請再按一次「分享」。',
        char_card_viewer_title: '長按圖片即可儲存',
        char_card_viewer_download: '下載檔案',
        char_card_viewer_close: '關閉',
        char_card_line_tip: '在 LINE 裡可能存不了圖，建議先用瀏覽器打開再填：',
        char_card_line_tip_link: '用瀏覽器打開',

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

        // Note under the fields the current poster style does not draw (Free Company name, Grand Company, contact, looking for)
        char_card_not_drawn: 'Not shown on the current poster style',

        // Short labels for the hours drawn on the card
        char_card_card_day_weekday: 'Wkdy',
        char_card_card_day_weekend: 'Wknd',
        char_card_card_slot_morning: 'Morn',
        char_card_card_slot_afternoon: 'Aft',
        char_card_card_slot_evening: 'Eve',
        char_card_card_slot_late_night: 'Late',

        // Character image
        char_card_image_upload: 'Upload screenshot',
        char_card_image_zoom: 'Zoom',
        char_card_image_center: 'Center',
        char_card_image_fill: 'Fill',
        char_card_image_remove: 'Remove picture',
        char_card_image_adjust: 'Adjust picture',
        char_card_image_adjust_done: 'Done',
        char_card_image_processing: 'Processing…',
        char_card_image_uploaded: 'Uploaded',
        char_card_image_not_saved: "This picture is too big to remember. You'll need to upload it again after reloading.",
        char_card_image_failed: "This file couldn't be read. Try another image.",
        char_card_image_removed: 'Picture removed',
        char_card_image_restore_failed: "Your last picture couldn't be loaded. Please upload it again.",

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

        // Output: buttons, errors for the required fields, results, the full-screen viewer, the LINE tip
        char_card_download: 'Download image',
        char_card_share: 'Share',
        char_card_copy: 'Copy image',
        char_card_error_name: 'Enter a character name',
        char_card_error_world: 'Choose a world',
        char_card_error_job: 'Choose a main job',
        char_card_downloaded: 'Downloaded {file}',
        char_card_share_failed: "Couldn't share. Please download instead.",
        char_card_copied: 'Image copied',
        char_card_copy_failed: "Couldn't copy. Please download instead.",
        char_card_export_failed: "Couldn't make the picture. Please try again.",
        char_card_fonts_slow: "Fonts are still loading, so the picture uses what's on screen now.",
        char_card_image_slow: "Your screenshot is still processing, so the picture uses what's on screen now.",
        char_card_share_ready: 'The picture is ready. Press Share again.',
        char_card_viewer_title: 'Press and hold the image to save it',
        char_card_viewer_download: 'Download file',
        char_card_viewer_close: 'Close',
        char_card_line_tip: 'LINE may not save the picture. Open this page in your browser before you fill it in: ',
        char_card_line_tip_link: 'Open in browser',

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

        // 今のポスタースタイルでは描かない項目（フリーカンパニー名、グランドカンパニー、連絡先、探していること）の下の説明
        char_card_not_drawn: '今のポスタースタイルには表示されません',

        // カードに描く時間帯の短いラベル
        char_card_card_day_weekday: '平日',
        char_card_card_day_weekend: '休日',
        char_card_card_slot_morning: '朝',
        char_card_card_slot_afternoon: '昼',
        char_card_card_slot_evening: '夜',
        char_card_card_slot_late_night: '深夜',

        // キャラクター画像
        char_card_image_upload: 'スクリーンショットを選ぶ',
        char_card_image_zoom: '拡大',
        char_card_image_center: '中央に戻す',
        char_card_image_fill: '全体に合わせる',
        char_card_image_remove: '画像を削除',
        char_card_image_adjust: '画像を調整',
        char_card_image_adjust_done: '完了',
        char_card_image_processing: '処理中…',
        char_card_image_uploaded: 'アップロードしました',
        char_card_image_not_saved: 'この画像は大きすぎて保存できません。再読み込みしたらもう一度アップロードしてください。',
        char_card_image_failed: 'このファイルは読み込めません。別の画像を選んでください。',
        char_card_image_removed: '画像を削除しました',
        char_card_image_restore_failed: '前回の画像を読み込めませんでした。もう一度アップロードしてください。',

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

        // 出力：ボタン、必須項目のエラー、結果のメッセージ、全画面の画像表示、LINE のヒント
        char_card_download: '画像をダウンロード',
        char_card_share: '共有',
        char_card_copy: '画像をコピー',
        char_card_error_name: 'キャラクター名を入力してください',
        char_card_error_world: 'ワールドを選んでください',
        char_card_error_job: 'メインジョブを選んでください',
        char_card_downloaded: '{file} をダウンロードしました',
        char_card_share_failed: '共有できませんでした。ダウンロードをお試しください。',
        char_card_copied: '画像をコピーしました',
        char_card_copy_failed: 'コピーできませんでした。ダウンロードをお試しください。',
        char_card_export_failed: '画像を作れませんでした。もう一度お試しください。',
        char_card_fonts_slow: 'フォントの読み込みが終わっていないため、今の表示のまま画像を作りました。',
        char_card_image_slow: 'スクリーンショットの処理が終わっていないため、今の表示のまま画像を作りました。',
        char_card_share_ready: '画像ができました。もう一度「共有」を押してください。',
        char_card_viewer_title: '画像を長押しして保存',
        char_card_viewer_download: 'ファイルをダウンロード',
        char_card_viewer_close: '閉じる',
        char_card_line_tip: 'LINEでは画像を保存できないことがあります。入力する前にブラウザで開いてください：',
        char_card_line_tip_link: 'ブラウザで開く',

        // 文字数カウンター（半角のスラッシュ）
        char_card_count: '{n}/{max}'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('character-card', CharacterCardTranslations);
}
