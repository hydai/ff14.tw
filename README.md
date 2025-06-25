# FF14.tw

繁體中文 FF14 多功能工具網站。

## 特色

- 純靜態 HTML/CSS/JavaScript
- 工具獨立封裝 (`tools/`)
- 繁體中文介面
- 響應式設計
- 開源專案

## 🛠️ 已實作工具

### 副本資料庫 (`dungeon-database/`)
- 362 個副本 (2.x - 7.x)
- 搜尋過濾功能
- 圖片預覽
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
├── changelog.html          # 修改紀錄頁面
├── copyright.html          # 版權聲明頁
├── assets/                 # 共用資源
│   ├── css/
│   │   ├── common.css      # 全域樣式（含下拉式選單）
│   │   └── changelog.css   # 修改紀錄頁面專用樣式
│   ├── js/common.js        # 共用函式庫
│   └── images/             # 圖片資源
│       ├── ff14tw.ico      # 網站 favicon
│       └── se/             # Square Enix 官方素材
│           └── FFXIVJobIcons/  # FF14 職業圖示 (45個)
└── tools/                  # 工具目錄
    ├── character-card/     # 角色卡產生器
    ├── dungeon-database/   # 副本資料庫
    ├── faux-hollows-foxes/ # Faux Hollows Foxes 計算機
    ├── mini-cactpot/      # Mini Cactpot 計算機
    └── wondrous-tails/    # Wondrous Tails 預測器
```

### 架構
- 統一 header/nav/main/footer
- 下拉選單導航
- CSS 自訂屬性
- `FF14Utils` 全域物件
- Class-based JavaScript
- 響應式設計

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
