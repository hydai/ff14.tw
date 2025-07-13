# FF14.tw

繁體中文 FF14 多功能工具網站。

## 特色

- 純靜態 HTML/CSS/JavaScript
- 工具獨立封裝 (`tools/`)
- 繁體中文介面
- 響應式設計（含手機版漢堡選單）
- 工具名稱動態顯示於導航列
- 開源專案

## 🛠️ 已實作工具

### 副本資料庫 (`dungeon-database/`)
- 804 個副本 (2.x - 7.x，640 個可見項目)
- 搜尋過濾功能
- 圖片預覽
- 鍵盤導航支援
- 資料來源：灰機Wiki

### Mini Cactpot 計算機 (`mini-cactpot/`)
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
- 真實寶圖座標資料庫（219個座標）
- 支援 G8、G10、G12、G14、G15、G17 等級篩選
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
- 寶圖搜尋器 (`treasure-map-finder/`) - 載入 `/data/treasure-maps.json`
- Lodestone 角色查詢 (`lodestone-lookup/`) - 使用 logstone API

**可直接開啟的工具：**
- Mini Cactpot 計算機
- Wondrous Tails 預測器
- 角色卡產生器
- Faux Hollows Foxes 計算機

### 專案結構
```
ff14.tw/
├── .gitignore              # Git 忽略規則
├── index.html              # 主頁
├── about.html              # 關於頁面
├── changelog.html          # 修改紀錄頁面
├── copyright.html          # 版權聲明頁
├── data/                   # 資料檔案
│   ├── dungeons.json       # 副本資料庫 JSON
│   ├── treasure-maps.json  # 寶圖座標資料
│   └── zone-translations.json # 地區名稱翻譯
├── assets/                 # 共用資源
│   ├── css/
│   │   ├── common.css      # 全域樣式（含下拉式選單、漢堡選單）
│   │   └── changelog.css   # 修改紀錄頁面專用樣式
│   ├── js/common.js        # 共用函式庫（含動態 logo、漢堡選單）
│   └── images/             # 圖片資源
│       ├── ff14tw.ico      # 網站 favicon
│       └── se/             # Square Enix 官方素材
│           └── FFXIVJobIcons/  # FF14 職業圖示 (45個)
└── tools/                  # 工具目錄
    ├── character-card/     # 角色卡產生器
    ├── dungeon-database/   # 副本資料庫
    ├── faux-hollows-foxes/ # Faux Hollows Foxes 計算機
    ├── lodestone-lookup/   # Lodestone 角色查詢
    ├── mini-cactpot/      # Mini Cactpot 計算機
    ├── treasure-map-finder/# 寶圖搜尋器
    └── wondrous-tails/    # Wondrous Tails 預測器
```

### 架構
- 統一 header/nav/main/footer
- 下拉選單導航
- CSS 自訂屬性
- `FF14Utils` 全域物件
- Class-based JavaScript
- 響應式設計
- 共用元件系統 (`/assets/css/components/`)
  - 按鈕元件 (`buttons.css`)
  - 卡片元件 (`cards.css`)
  - 表單元件 (`forms.css`)
  - 標籤/徽章元件 (`tags.css`)
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
