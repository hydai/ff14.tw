# FF14.tw

FF14.tw 是一個專為繁體中文版《Final Fantasy XIV》玩家設計的多功能工具網站，提供各種實用的遊戲輔助工具與資訊查詢服務。

## 🌟 功能特色

- **純靜態網站**：使用原生 HTML/CSS/JavaScript，無需複雜的建置流程
- **多工具整合**：每個工具獨立封裝在 `tools/` 目錄下
- **繁體中文**：完全針對繁體中文玩家優化的介面與用語
- **響應式設計**：支援手機、平板、桌面等各種裝置
- **開源專案**：歡迎社群貢獻與改進

## 🛠️ 已實作工具

### 副本資料庫 (`dungeon-database/`)
完整的 FF14 副本資訊查詢系統
- 🔍 智慧搜尋與過濾功能
- 📊 362 個副本完整收錄（2.x - 7.x）
- 🗺️ 支援圖片預覽與詳細資訊
- 📚 資料來源：灰機Wiki，經繁中化處理

### Mini Cactpot 計算機 (`mini-cactpot/`)
黃金碟片 Mini Cactpot 遊戲最佳策略工具
- 🎯 期望值即時計算
- 💡 最佳選擇推薦
- 🎲 完整機率分析

### Wondrous Tails 預測器 (`wondrous-tails/`)
天書奇談連線機率預測工具
- 🎯 即時機率計算
- 📊 多條線連線分析
- 💡 策略建議系統
- 🎮 4x4 互動式介面

### 角色卡產生器 (`character-card/`)
快速生成專屬的 FF14 角色資訊卡片
- 🎨 角色名稱顏色自訂功能
- 🖼️ 背景圖片上傳與編輯（位置、縮放、旋轉）
- 📐 多種版型選擇（橫版/直版）
- 🌏 完整伺服器與職業選擇
- ⚡ 可折疊的直覺式介面
- 🖱️ 圖片拖拽調整功能

### Faux Hollows Foxes 計算機 (`faux-hollows-foxes/`)
智慧型 6x6 棋盤策略輔助工具
- 🎯 直接點擊障礙物設置，無需選單操作
- 🤖 即時自動填充確定的障礙物位置
- 📊 基於 252 種盤面配置的機率計算
- 💡 三段式寶物機率顯示（劍/寶箱/宗長）
- 🔄 階段性操作體驗，智慧錯誤修正
- 🎨 FF14 官方配色，視覺清晰易讀


## 🏗️ 技術架構

### 開發環境
```bash
# 本地開發 - 直接開啟檔案
open index.html

# 或使用本地伺服器（推薦，避免 CORS 問題）
python -m http.server
# 或
npx serve .
```

### 專案結構
```
ff14.tw/
├── .gitignore              # Git 忽略規則
├── index.html              # 主頁
├── about.html              # 關於頁面
├── copyright.html          # 版權聲明頁
├── assets/                 # 共用資源
│   ├── css/common.css      # 全域樣式
│   ├── js/common.js        # 共用函式庫
│   └── images/             # 圖片資源
│       └── se/             # Square Enix 官方素材
│           └── FFXIVJobIcons/  # FF14 職業圖示 (45個)
└── tools/                  # 工具目錄
    ├── character-card/     # 角色卡產生器
    ├── dungeon-database/   # 副本資料庫
    ├── faux-hollows-foxes/ # Faux Hollows Foxes 計算機
    ├── mini-cactpot/      # Mini Cactpot 計算機
    └── wondrous-tails/    # Wondrous Tails 預測器
```

### 共用架構模式
- **HTML 結構**：統一的 header/nav/main/footer 佈局
- **CSS 架構**：基於 CSS 自訂屬性的設計系統
- **JavaScript 工具**：`FF14Utils` 全域物件提供常用函式
- **類別架構**：每個工具使用 class-based 的 JavaScript 架構
- **圖片資源**：整合 Square Enix 官方 Fankit 素材
- **響應式設計**：多breakpoint 適配各種裝置
- **階段性 UX**：複雜工具採用階段性操作流程設計

## 🚀 部署

本專案透過 GitHub Pages 自動部署至 [ff14.tw](https://ff14.tw)

## 🤝 貢獻指南

1. Fork 本專案
2. 建立功能分支：`git checkout -b feature/new-tool`
3. 提交變更：`git commit -m 'Add new tool'`
4. 推送到分支：`git push origin feature/new-tool`
5. 建立 Pull Request

### 開發規範
- 使用繁體中文與台灣遊戲用語
- 遵循現有的 HTML/CSS 結構模式
- JavaScript 採用 ES6+ 語法與 class-based 架構
- 確保響應式設計相容性
- 複雜工具採用階段性操作流程設計
- 使用 FF14 官方配色與視覺元素
- 實作即時計算與智慧輔助功能

## 📄 版權聲明

本網站為非官方粉絲網站，與 SQUARE ENIX 公司無關。所有 Final Fantasy XIV 相關內容之著作權歸 SQUARE ENIX 所有。

**圖片資源聲明：**
- FF14 職業圖示來源：Square Enix Official Fankit
- 所有遊戲相關圖片版權歸 SQUARE ENIX 所有

網站內容採用教育與非商業用途，符合合理使用原則。

## 📞 聯絡資訊

- 開發者：hydai
- GitHub：https://github.com/hydai/ff14.tw
- 網站：https://ff14.tw

---

Made with ❤️ for FF14 Taiwan Community
