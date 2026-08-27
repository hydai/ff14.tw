# FF14.tw

繁體中文 FF14 多功能工具網站。

## 特色

- 純靜態 HTML/CSS/JavaScript
- 工具獨立封裝 (`tools/`)
- 多語言介面支援（繁體中文/English/日本語）
- 響應式設計（含手機版漢堡選單）
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
- 期望值計算
- 最佳策略推薦
- 機率分析

### Wondrous Tails 預測器 (`wondrous-tails/`)
- 連線機率計算
- 4x4 互動介面
- 策略建議

### 角色卡產生器 (`character-card/`)
- 名稱顏色自訂
- 背景圖片編輯
- 橫/直版型
- 完整伺服器/職業選擇

### Faux Hollows Foxes 計算機 (`faux-hollows-foxes/`)
- 6x6 棋盤策略工具
- 自動填充障礙物
- 252 種盤面機率計算
- 三段式寶物機率顯示

### 寶圖搜尋器 (`treasure-map-finder/`)
- 真實寶圖座標資料庫（227個座標）
- 支援 G8、G10、G12、G14、G15、G17、G18 等級篩選
- 12個地區篩選（含漆黑地區）
- 個人清單管理（新增、移除、匯出/匯入）
- 座標複製功能（/pos 指令）
- 最佳路線規劃功能
- 自訂輸出格式（支援中文、英文、日文）

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
- 艾歐澤亞時間特殊採集點管理
- 搜尋與過濾功能
- 多清單管理（新增、移除、匯出/匯入）
- 巨集匯出功能
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
- 查看艾歐澤亞各地區的天氣預報
- 支援搜尋特定天氣條件

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
- Faux Hollows Foxes 計算機
- 檢舉模板產生器
- 天氣預報

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
├── api/                    # Cloudflare Workers API（寶圖房間協作，含自己的 package.json / wrangler.toml）
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
│   │   ├── pages.css       # 關於／版權聲明頁面專用樣式
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
│   │   ├── components/     # 動態載入元件
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
├── tests/                  # node --test 測試
│   ├── design-system.test.js
│   ├── docs.test.js
│   ├── pages.test.js
│   ├── scripts.test.js
│   └── timed-gathering-eorzea-time.test.js
└── tools/                  # 工具目錄
    ├── character-card/     # 角色卡產生器
    ├── dungeon-database/   # 副本資料庫
    ├── faux-hollows-foxes/ # Faux Hollows Foxes 計算機
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
3. 提交變更：`git commit -m 'Add new tool'`
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
