# FF14.tw

繁體中文 FF14 多功能工具網站。

## 特色

- 純靜態 HTML/CSS/JavaScript
- 工具獨立封裝 (`tools/`)
- 多語言介面支援（繁體中文/English/日本語）
- 響應式設計（含手機版漢堡選單，選單最上面就是工具清單）
- 導航列：首頁、工具 ▾、修改紀錄、版權聲明（關於、回報問題、GitHub 在頁尾）；「工具 ▾」選單在每一頁都能直接換工具，並標示目前所在的工具
- 工具名稱動態顯示於導航列
- 開源專案

## 🛠️ 已實作工具

### 副本資料庫 (`dungeon-database/`)
- 803 個副本 (2.x - 7.x，640 個可見項目)
- 搜尋過濾功能
- 圖片預覽
- 鍵盤導航支援
- 資料來源：灰機Wiki

### 仙人微彩計算機 (`mini-cactpot/`)
- 點格子旁的小數字盤填數字（焦點在格子上或小數字盤開著時也能按鍵盤 1–9），填好的格子再點可以改或清除
- 狀態列寫下一步（點遊戲翻開的那一格 → 刮哪一格 → 選哪條線與平均 MGP，一樣好的用「或」連起來），沒翻開的格子寫刮了之後平均可拿多少 MGP，推薦的格子與線標綠色，填滿 4 格後外圈寫每條線的平均
- 獎金表一直顯示（手機在盤面下面、電腦在右邊），標出推薦的線還可能出現的總和
- 上一步會寫出退回了什麼，「下一張」清空盤面、按錯可以救回來

### Wondrous Tails 預測器 (`wondrous-tails/`)
- 連線機率計算
- 4x4 互動介面
- 策略建議

### 角色卡產生器 (`character-card/`)
- 名稱顏色自訂
- 背景圖片編輯
- 橫/直版型
- 完整伺服器/職業選擇

### 宗長計算機 (`faux-hollows-foxes/`)
- Faux Hollows Foxes 活動的 6x6 棋盤策略工具
- 自動填充障礙物
- 252 種盤面機率計算
- 三段式寶物機率顯示

### 寶圖搜尋器 (`treasure-map-finder/`)
- 真實寶圖座標資料庫（227個座標）
- 先選等級（G8、G10、G12、G14、G15、G17、G18，可多選），再選地區：地區只列出所選等級有寶圖的地區並附張數，每個等級都能依地區篩選
- 一次列出所有符合的寶圖（不分頁）；卡片直接顯示座標與最近的傳送點，點縮圖開啟詳細檢視
- 詳細檢視：加入／移除清單、複製，在目前的結果裡用按鈕或 ← → 切換上一張與下一張，地圖標示最近的傳送點（手機版為全螢幕）
- 複製鈕會複製一句可以直接貼到隊伍頻道的話（例如 `/p G17 烏爾科帕恰 (13.7, 14.2) 最近：瓦群佩洛`），地名與最近的傳送點隨介面語言
- 步驟提示（選等級、加入清單、生成路線）標出目前進行到哪一步
- 清單入口一直看得到（電腦版捲動時固定在畫面上方、手機版固定在畫面底部），清單是空的時顯示「組隊」，有寶圖就顯示「生成路線」
- 記住上次選的等級與地區
- 清單面板：每一列直接顯示座標與最近的傳送點，✕ 直接移除；「複製分享連結」、「匯入」、「清空清單」；手機上面板高度是畫面的 85%
- 分享連結：複製一條帶 `?maps=` 的連結，打開連結時可以選「加進我的清單」或「取代我的清單」；以前「匯出」的內容仍然可以匯入；匯入與清空都是頁面裡的對話框，預設不會丟掉原本的清單
- 路線規劃：清單有 1 張以上就能生成，路線顯示在清單面板的第二頁，一站一張寶圖，寶圖多的地區先跑；標出目前這一站、可以標記完成（進度記在這台裝置、保留 12 小時），「複製下一站」一次複製一站，「全部複製」一站一行
- 複製格式：預設和卡片的隊伍頻道句子相同、前面加站號（例如 `/p 1/6 G17 烏爾科帕恰 (21.6, 23.9) 最近：瓦群佩洛`），可以換成中文、English、日本語範本或自訂，點變數就能插入，預覽用目前這一站的真實資料
- 瀏覽器封鎖網站資料時，清單與路線照常運作（只是記不住）
- 隊伍協作：最多 8 人、8 張寶圖，多人同步、斷線重試與私人操作憑證；建立或加入時在頁面裡選要不要帶自己的寶圖（預設帶進）；預設名字是「光之戰士＋3 碼字串」（例如光之戰士K7Q），同一台裝置每次都一樣；可以複製邀請連結，打開時先問「加入隊伍 X？」；清單和路線每張圖都寫是誰的，路線複製到隊伍頻道的句子也帶上主人的名字；連不上時顯示「連不上，重試中」

### Lodestone 角色查詢 (`lodestone-lookup/`)
- 使用 Lodestone ID 查詢角色資訊
- 顯示完整角色屬性：HP、MP、攻擊力、防禦力等主要屬性
- 顯示副屬性：力量、靈巧、耐力、智力、精神、爆擊、意志、直擊
- 顯示所有職業等級，滿級職業特別標示
- 顯示裝備資訊：所有裝備部位和幻化狀態
- 顯示其他資訊：大國防軍階級、生日、個人簡介
- 使用 logstone API 取得資料
- 提供直接前往官方 Lodestone 頁面的連結

### 特殊採集時間管理器 (`timed-gathering/`)
- 艾歐澤亞時間特殊採集點管理：一種素材一張卡片（同一種素材的幾個時段合在一張），標題是介面語言的名稱，下面小字寫另外兩種語言的名稱，再加上地點（英文、日文介面寫英文、日文的地區與地點，地點就是地區本身時只寫一次）、座標與每天的艾歐澤亞時間時段
- 直接寫還剩多久：現在可採的寫「還剩 m:ss（到幾點）」，還沒到的寫「幾點出現 · 還要 N 分」（不到 10 分鐘改寫 m:ss），全天的素材寫「全天都可以採」；倒數每秒走，現在可採的排在最前面，接著是快出現的，全天的最後，素材出現或結束時自動重排
- 搜尋框用中文、日文或英文都搜得到（連英文的地區與地點名稱，例如 Yak T'el、Mamook），好幾個字時每個字都要符合，命中的字會標出來；還可以依類型與版本篩選；英文、日文介面的卡片和清單顯示英文、日文名稱
- 「提醒我」（全天的素材沒有）與頁面最上面的「我的提醒」：素材出現前 0／1／2／3／5／10 分鐘通知（預設 1 分鐘，所有提醒共用）；設定時離出現已經不到這麼久，就在出現時提醒，設定時已經開始的那一次不補；每次出現都提醒，直到取消；頁面要開著才會響
- 提醒到時間時，頁面上跳出提示並發出提示音，瀏覽器允許時再加系統通知；通知被封鎖，或瀏覽器不支援、不讓網頁跳通知時，仍然有頁面提示和聲音，「網頁提醒」開關照樣能用，「我的提醒」下方寫出目前只有頁面提示和聲音；關掉「網頁提醒」時到時間什麼都不做，提醒清單照樣留著
- 「我的提醒」先列 5 個（手機 3 個），其餘按「顯示全部」；標題列有「測試通知」；另一個分頁新增或取消提醒時這一頁跟著變；以前開著「採集提醒」的人，預設清單裡的素材（全天的除外）會自動放進「我的提醒」
- 「複製鬧鐘」：複製這種素材下一次出現的一行遊戲內 `/alarm` 指令（正在可採時複製的是再下一段），貼到遊戲的聊天輸入框就設好；卡片或提醒列下面會寫出複製了什麼，剪貼簿不能用時改寫成請自己選取複製
- 多清單管理（新增、移除、匯出/匯入）與整份清單的巨集匯出照舊；卡片上的「加入清單」會把這種素材的每個時段一起加進去
- 瀏覽器封鎖網站資料時，頁面照常載入，提醒與清單記不住，但這次打開期間設好的提醒照樣會響，「加入清單」也照樣加得進去（並提醒重新整理後就不見了）
- 多語言支援

### 攻略資料 (`guide/`)
- FF14 新手攻略指南，8 個子頁面：公會、大國防聯軍、副本、風脈、隊伍系統、探索筆記、專屬陸行鳥（含毛色計算機）、目錄首頁
- 多語言支援

### 檢舉模板產生器 (`report-generator/`)
- 快速產生不當行為檢舉的模板文字
- 協助玩家進行申訴

### 巨集轉換器 (`macro-converter/`)
- FF14 巨集在繁體中文、英文、日文之間互相轉換
- 資料來源：`data/macro-mappings.json`

### 天氣預報 (`weather-forecast/`)
- 查看艾歐澤亞 73 個地區的天氣預報；地區是依 14 個區域分組的下拉選單，手機上不用再捲過一整排按鈕
- 答案優先：選好地區和天氣，第一張卡就寫它下次什麼時候出現（今天／明天＋幾點）、還要等多久、到幾點結束；正在下時改寫到幾點、還剩多久與下一次；找不到時寫「60 天內沒有符合的時段」
- 連在一起的同一種天氣合成一段；設了時段（艾歐澤亞時間）時，答案只算時段裡的部分，並寫出整段與其中在時段內的部分
- 記住上次選的地區、天氣、前置天氣與時段，下次打開直接接著看；分享連結（網址 hash）優先於這台裝置記住的
- 時段與前置天氣（釣魚用）收在預設收起的「更多條件」；答案卡下面是「之後幾次」（先列 5 次，「顯示更多」最多 50 次），最下面是這個地區的天氣時刻表（每 8 個艾歐澤亞小時一列，先列 24 列，「顯示更多」最多 200 列）
- 「提醒我」：天氣開始前 1／3／5／10／15／30 分鐘提醒（預設 5 分鐘）；設定時離開始已經不到這麼久，就在開始時提醒；每次出現都提醒，直到取消；頁面要開著才會響
- 提醒到時間時，頁面上跳出提示並發出提示音，瀏覽器允許時再加系統通知；通知被封鎖，或瀏覽器不支援、不讓網頁跳通知時，仍然有頁面提示和聲音
- 提醒有自己的地區和天氣：換地區或打開別人的分享連結都不會取消，答案卡顯示的不是它的目標時，上方用一行寫出提醒中的是哪個
- 瀏覽器封鎖網站資料時，頁面照常運作（選擇與提醒記不住，這次打開期間提醒照樣會響）

## 🏗️ 技術架構

### 開發環境

由於部分工具需要載入 JSON 資料檔案，受瀏覽器 CORS 限制影響，**建議使用本地伺服器**進行開發：

```bash
# 推薦：使用本地伺服器
python3 -m http.server
# 或
npx serve .

# 瀏覽器訪問
http://localhost:8000
```

**需要本地伺服器的工具：**
- 副本資料庫 (`dungeon-database/`) - 載入 `/data/dungeons.json`
- 寶圖搜尋器 (`treasure-map-finder/`) - 載入 `/data/aetherytes.json`、`/data/treasure-maps.json`、`/data/zones.json`
- Lodestone 角色查詢 (`lodestone-lookup/`) - 使用 logstone API
- 特殊採集時間管理器 (`timed-gathering/`) - 載入 `/data/timed-gathering.json`
- 巨集轉換器 (`macro-converter/`) - 載入 `/data/macro-mappings.json`
- 攻略資料 (`guide/`) - 僅陸行鳥毛色頁面載入 `/data/chocobo-colors.json`

**可直接開啟的工具：**
- 仙人微彩計算機
- Wondrous Tails 預測器
- 角色卡產生器
- 宗長計算機
- 檢舉模板產生器
- 天氣預報

### 測試與協作 API

使用 Node 24，在專案根目錄執行：

```bash
npm --prefix api ci
node --test
```

測試涵蓋 UI／資料契約、非同步競爭與真實 Miniflare/workerd 的 SQLite Durable Object；需允許本機連接埠。GitHub Actions 會在 push／Pull Request 執行相同測試及 Worker 環境 dry-run。

寶圖協作另開一個終端執行 `npm --prefix api run dev`（本機 API 為 `localhost:8787`），靜態頁面使用 `localhost:8000` 或 `8080`。部署與舊隊伍過渡方式見 [API 文件](api/README.md)。

### 專案結構
```
ff14.tw/
├── .gitignore              # Git 忽略規則
├── CNAME                   # GitHub Pages 自訂網域
├── LICENSE
├── TERMINOLOGY.md          # FF14 繁中服官方用語對照
├── index.html              # 主頁
├── about.html              # 關於頁面
├── changelog.html          # 修改紀錄頁面
├── copyright.html          # 版權聲明頁
├── 404.html                # 404 頁（GitHub Pages 對不存在的網址顯示它）
├── api/                    # Cloudflare Workers API（寶圖隊伍協作，含自己的 package.json / wrangler.toml）
│   └── treasure-room-worker.js
├── data/                   # 資料檔案
│   ├── dungeons.json       # 副本資料庫 (803 筆)
│   ├── treasure-maps.json  # 寶圖座標資料 (227 筆)
│   ├── macro-mappings.json # 巨集轉換器對照表
│   ├── timed-gathering.json # 特殊採集點資料
│   ├── chocobo-colors.json # 陸行鳥毛色配方資料
│   ├── zones.json          # 地區定義與元資料
│   ├── aetherytes.json     # 傳送點資料
│   ├── zone-translations.json # 地區名稱翻譯 (zh/en/ja)
│   └── ff14-gp.csv         # GP 值參考資料
├── assets/                 # 共用資源
│   ├── css/
│   │   ├── tokens.css      # 設計 token（顏色／字級／間距／陰影唯一來源）
│   │   ├── common.css      # 全域樣式（含漢堡選單）
│   │   ├── pages.css       # 關於／版權聲明／404 頁面專用樣式
│   │   ├── tools-common.css    # 工具共用樣式（@import 匯入 buttons/cards/forms/tags）
│   │   ├── changelog.css   # 修改紀錄頁面專用樣式
│   │   └── components/     # UI 元件
│   │       ├── buttons.css
│   │       ├── cards.css
│   │       ├── forms.css
│   │       ├── tags.css
│   │       └── language-switcher.css
│   ├── js/
│   │   ├── common.js       # 共用函式庫（含漢堡選單、FF14Utils）
│   │   ├── security-utils.js # 安全工具（XSS 防護）
│   │   ├── modal-manager.js  # 對話框管理
│   │   ├── state-history-manager.js # 狀態歷史管理
│   │   ├── reminder-scheduler.js # 提醒排程（頁內提示、提示音、系統通知；天氣預報與特殊採集時間管理器的「提醒我」使用）
│   │   ├── cell-popover.js # 格子旁的小選單（不是對話框；仙人微彩使用）
│   │   ├── home.js         # 首頁腳本（最近使用）
│   │   ├── not-found.js    # 404 頁腳本（工具清單）
│   │   ├── components/     # 動態載入元件
│   │   │   ├── tools-registry.js   # 工具登錄表（全站工具清單的唯一來源）
│   │   │   ├── nav-template.js     # 導航列模板
│   │   │   ├── footer-template.js  # 頁尾模板
│   │   │   └── layout-loader.js    # 佈局載入器
│   │   └── i18n/           # 國際化系統
│   │       ├── i18n-manager.js
│   │       └── translations/
│   │           ├── common.js
│   │           └── tools/  # 各工具翻譯檔（report-generator 尚無）
│   └── images/             # 圖片資源
│       ├── ff14tw.ico      # 網站 favicon
│       ├── se/             # Square Enix 官方素材
│       │   └── FFXIVJobIcons/  # FF14 職業圖示 (45個)
│       ├── tools/          # 工具用圖片（如副本封面圖說明）
│       └── ui/             # 介面小圖示
├── scripts/                # 開發用腳本（不隨網站部署）
│   ├── generate-macro-mappings.py
│   ├── add-design-links.mjs
│   ├── remove-dark-mode-links.mjs
│   └── replace-noscript-nav.mjs
├── tests/                  # 48 份 node --test 測試（下列為部分範例）
│   ├── design-system.test.js
│   ├── docs.test.js
│   ├── gathering-materials.test.js
│   ├── gathering-reminders.test.js
│   ├── helpers/            # 測試輔助模組（不是測試檔）
│   │   ├── cactpot-page.js         # 仙人微彩頁的頁面替身
│   │   ├── gathering-page.js       # 採集頁的頁面替身
│   │   └── notification-stubs.js   # Notification／AudioContext 替身
│   ├── modal-manager-stack.test.js
│   ├── pages.test.js
│   ├── scripts.test.js
│   ├── timed-gathering-eorzea-time.test.js
│   ├── timed-gathering-page.test.js
│   └── timed-gathering-search.test.js
└── tools/                  # 工具目錄
    ├── character-card/     # 角色卡產生器
    ├── dungeon-database/   # 副本資料庫
    ├── faux-hollows-foxes/ # 宗長計算機
    ├── guide/              # 攻略資料
    ├── lodestone-lookup/   # Lodestone 角色查詢
    ├── macro-converter/    # 巨集轉換器
    ├── mini-cactpot/       # 仙人微彩計算機
    ├── report-generator/   # 檢舉模板產生器
    ├── timed-gathering/    # 特殊採集時間管理器
    ├── treasure-map-finder/# 寶圖搜尋器
    ├── weather-forecast/   # 天氣預報
    └── wondrous-tails/     # Wondrous Tails 預測器
```

### 架構
- 動態載入 header/footer 元件（JavaScript 模組化）
- 簡潔導航列（含工具名稱顯示）
- CSS 自訂屬性
- `FF14Utils` 全域物件
- Class-based JavaScript
- 響應式設計
- 國際化支援（I18nManager）
- 共用元件系統 (`/assets/css/components/`)
- 佈局元件系統 (`/assets/js/components/`)
  - 按鈕元件 (`buttons.css`)
  - 卡片元件 (`cards.css`)
  - 表單元件 (`forms.css`)
  - 標籤/徽章元件 (`tags.css`)
  - 語言切換器 (`language-switcher.css`)
  - 載入狀態與訊息元件 (`tools-common.css`)

## 🚀 部署

本專案透過 GitHub Pages 自動部署至 [ff14.tw](https://ff14.tw)

## 🤝 貢獻指南

1. Fork 本專案
2. 建立功能分支：`git checkout -b feature/new-tool`
3. 提交變更：`git commit -m 'feat: add new tool'`
4. 推送到分支：`git push origin feature/new-tool`
5. 建立 Pull Request

### 開發規範
- 繁體中文/台灣用語
- ES6+ class-based JavaScript
- 響應式設計
- FF14 官方配色
- 優先使用共用元件，避免重複定義樣式
- 新工具必須引入 `tools-common.css`

## 📄 版權聲明

非官方粉絲網站。FF14 相關內容版權歸 SQUARE ENIX 所有。
圖片來源：Square Enix Official Fankit
僅供教育與非商業用途。

## 聯絡

- 開發者：hydai
- GitHub：https://github.com/hydai/ff14.tw
- 網站：https://ff14.tw

---

Made with ❤️ for FF14 Taiwan Community
