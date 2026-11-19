---
name: add-tool
description: 在 ff14.tw 新增一個工具（tools/<id>/）或新頁面時用：頁面骨架、共用 CSS／JS 的載入順序、頁首頁尾的 placeholder、登錄表、首頁卡片、分享預覽、修改紀錄。Use when adding a new tool or a new page to the ff14.tw site.
---

# 新增工具

1. 在 `tools/<id>/` 建目錄（`id` 就是登錄表的 `id`）。
2. 從現有的工具複製 HTML 結構，改標題與說明。`<head>` 要有 `<title>`、`<meta name="description">` 與單獨一行的 `<link rel="icon" …>`：分享預覽照抄標題與說明，腳本把那一段插在 favicon 那一行後面，找不到就報錯並寫出檔名。
3. 照這個順序載入共用的 CSS 與 JS（`tests/pages.test.js` 守住 `tokens.css` 在 `common.css` 之前、`tools-registry.js` 在 `nav-template.js` 之前、`layout-loader.js` 在 `common.js` 之前）：
   ```html
   <!-- CSS -->
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet">
   <link rel="stylesheet" href="../../assets/css/tokens.css">
   <link rel="stylesheet" href="../../assets/css/common.css">
   <link rel="stylesheet" href="../../assets/css/tools-common.css">
   <link rel="stylesheet" href="../../assets/css/components/language-switcher.css">
   <link rel="stylesheet" href="style.css">

   <!-- JavaScript (at end of body) -->
   <script src="../../assets/js/i18n/i18n-manager.js"></script>
   <script src="../../assets/js/i18n/translations/common.js"></script>
   <script src="../../assets/js/i18n/translations/tools/[tool-name].js"></script>
   <script src="../../assets/js/components/tools-registry.js"></script>
   <script src="../../assets/js/components/nav-template.js"></script>
   <script src="../../assets/js/components/footer-template.js"></script>
   <script src="../../assets/js/components/layout-loader.js"></script>
   <script src="../../assets/js/common.js"></script>
   <script src="../../assets/js/security-utils.js"></script>
   <script src="script.js"></script>
   ```
   改版過的工具多半不載入 `security-utils.js`（不用 `innerHTML` 就用不到它），各工具的頁面測試會照它自己的腳本順序檢查。
4. 頁首與頁尾用 placeholder：
   ```html
   <body>
       <div id="header-placeholder" data-base-path="../../" data-tool-name="工具名稱" data-tool-name-key="i18n_key"></div>
       <noscript>
           <nav class="noscript-nav">
               <a href="/" class="noscript-nav-link">首頁</a>
               <a href="/copyright.html" class="noscript-nav-link">版權聲明</a>
               <a href="https://github.com/hydai/ff14.tw" target="_blank" rel="noopener noreferrer" class="noscript-nav-link">GitHub</a>
               <a href="/about.html" class="noscript-nav-link">關於</a>
           </nav>
       </noscript>
       <!-- main content -->
       <div id="footer-placeholder" data-base-path="../../"></div>
   </body>
   ```
   - `data-base-path`：相對網址的基準（根目錄 `/`，工具 `../../`）
   - `data-tool-name`：頁首 logo 旁的工具名稱，要和登錄表的 `name` 一樣
   - `data-tool-name-key`：頁首工具名稱的翻譯鍵，zh／en／ja 的字要和 `common.js` 的名稱一樣
5. 用共用元件，不另寫樣式（規則見根目錄 CLAUDE.md 的「寫程式的規則」）：
   - 按鈕 `.btn`（次要按鈕）、`.btn-primary`（一個畫面最多一顆）、`.btn-secondary`、`.btn-success`、`.btn-danger`、`.btn-outline`、`.btn-ghost`、`.btn-sm`、`.btn-lg`
   - 卡片 `.card`、`.card-header`、`.card-body`、`.card-footer`、`.card-grid`、`.hoverable`（與 `.card` 並用）
   - 表單 `.form-control`、`.form-group`、`.form-label`、`.form-text`、`.form-check`
   - 標籤 `.tag`、`.tag-primary`、`.chip`（可切換的篩選膠囊）、`.badge`、`.tag-pill`、`.tag-outline-*`
   - 載入 `.loading`、`.loading-spinner`；訊息 `.error-message`、`.success-message`、`.info-message`、`.warning-message`
   - `tools-common.css` 另有 `.tabs`、`.toggle`、`.progress`、`.cell`（`.cell.suggested` 是建議的綠色）、`.table-wrap`／`.table`、`.empty-state`、`.dialog-overlay`／`.dialog`，以及格子旁的小選單 `CellPopover`（`assets/js/cell-popover.js`）
6. JavaScript 照現有工具的寫法：一個 class 當主控制器，規則放在不碰 DOM 的檔案裡另外測（例如陸行鳥染色計算器的 `chocobo-solver.js` 與 `script.js`），頁面測試照現有的頁面替身寫（`tests/helpers/*-page.js`，見 `tests/CLAUDE.md`）。
7. 在 `assets/js/components/tools-registry.js` 登錄。頁首的「工具 ▾」、首頁「最近使用」與 404 頁都讀它，順序就是首頁卡片的順序，`tests/tools-registry.test.js` 會對照：
   - 項目：`id`（`tools/` 底下的目錄名稱）、`href`、`icon`、`i18nKey`、zh 的 `name`
   - zh／en／ja 的名稱鍵 `tool_*_title` 放在 `translations/common.js`（不是 `index.js`），zh 的值要等於登錄表的 `name`
   - 工具頁的 `data-tool-name` 要等於登錄表的 `name`，`data-tool-name-key` 指到的鍵三語要和 `common.js` 的名稱一樣
8. 在首頁 `index.html` 加工具卡，位置、圖示與標題鍵和登錄表一樣。
9. 分享預覽與主畫面（預覽的名稱、圖示與那一句說明讀自登錄表與首頁卡片翻譯的 `tool_*_desc`；細節見 `scripts/share-preview/CLAUDE.md`）：
   - 在 `scripts/share-preview/site.mjs` 的 `TOOL_COLORS` 加這個工具的顏色 token（沒加腳本會報錯；底色和白字的對比要 ≥ 4.5:1）
   - 跑 `node scripts/share-preview.mjs pages`（把那一段寫進頁面、寫出 `tools/<id>/manifest.webmanifest`）與 `node scripts/share-preview.mjs images`（畫 `assets/images/og/<id>.png`；要本機 Chrome 與網路），把它們改到的檔案一起 commit
   - 工具以外的新頁面（像 `about.html`）要加進 `site.mjs` 的 `ROOT_PAGES`，新的攻略主題加進 `GUIDE_TOPICS`，沒加的話 `pages` 不會替它寫那一段
   - `tests/share-preview.test.js` 寫死了數量（25 頁、13 個工具、21 張預覽圖、14 個 manifest）、`EXPECTED_TOOL_COLORS` 與 `EXPECTED_GUIDE_TOPICS`，照新的數字更新
10. 在 `changelog.html` 加新版本（照 `changelog` skill）。
