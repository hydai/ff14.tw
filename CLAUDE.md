# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FF14.tw is a multi-tool website for Final Fantasy XIV players in Taiwan, providing various utilities like character card generators, dungeon database, and game calculators. The project uses a vanilla web stack with a modular architecture where each tool is self-contained within the `tools/` directory.

## Architecture

- **Static Website**: Pure HTML/CSS/JavaScript with no build tools, bundlers, or frameworks
- **Multi-Tool Structure**: Each tool is completely self-contained in its own directory under `tools/`
- **Shared Resources**: Common utilities in `assets/` (CSS variables, utility functions, constants)
- **Data Management**: JSON files in `/data/` directory for large datasets (dungeons, treasure maps, translations)
- **Language**: Traditional Chinese (zh-Hant) - all UI text and content
- **I18n Support**: Multi-language support (zh/en/ja) via I18nManager
- **Deployment**: GitHub Pages with custom domain (ff14.tw via CNAME)

## Project Statistics

- **HTML Files**: 25 total — 19 across 12 tool directories (11 single-page tools + `guide/` with 8 pages) + 5 root pages (`index.html`, `about.html`, `changelog.html`, `copyright.html`, `404.html`) + 1 API test harness (`api/test.html`)
- **JavaScript Files**: 113 total — 44 tool scripts + 6 shared utilities (`assets/js/`) + 18 i18n (manager + translations) + 4 layout components (`assets/js/components/`) + 36 test files (`tests/*.test.js`) + 4 test helpers (`tests/helpers/`, not test files) + 1 Cloudflare Worker (`api/treasure-room-worker.js`); plus 3 Node build scripts (`scripts/*.mjs`, not shipped to the site)
- **CSS Files**: 23 (shared + components + tool-specific)
- **JSON Data Files**: 8 (total ~25,600 lines); `/data/` also has one non-JSON `ff14-gp.csv`
- **Total Dungeons**: 803 entries (data file's own `metadata.totalDungeons` field still says 804 — pre-existing inconsistency inside `dungeons.json` itself, not a doc bug)
- **Total Treasure Map Coordinates**: 227 entries (G8/G10/G12/G14/G15/G17/G18)

## Development Commands

This is a static website with **no build process**. Files can be edited directly and changes are reflected immediately.

**Local Development:**
```bash
# Recommended: Use local server (required for tools with JSON data)
python3 -m http.server
# Access at: http://localhost:8000

# Alternative servers:
npx serve .
# or
php -S localhost:8000
```

**404 頁：** GitHub Pages 會對任何不存在的網址顯示根目錄的 `404.html`，但 `python3 -m http.server` 不會（不存在的網址只會得到它內建的錯誤頁）。本機要檢查 404 頁時，從專案根目錄啟動伺服器後直接開 `http://localhost:8000/404.html`（頁面的樣式、腳本與連結都是根目錄絕對路徑，不能用 `file://` 開啟）。

**CORS Requirements:**
Tools that fetch JSON data require a local server:
- 副本資料庫 (`dungeon-database/`) - loads `/data/dungeons.json`
- 寶圖搜尋器 (`treasure-map-finder/`) - loads `/data/aetherytes.json`, `/data/treasure-maps.json` and `/data/zones.json`
- Lodestone 角色查詢 (`lodestone-lookup/`) - uses logstone API
- 特殊採集時間管理器 (`timed-gathering/`) - loads `/data/timed-gathering.json`
- 巨集轉換器 (`macro-converter/`) - loads `/data/macro-mappings.json`
- 攻略資料 (`guide/`) - 僅陸行鳥毛色頁面 (`chocobo.html`) loads `/data/chocobo-colors.json`，其餘 7 個頁面不需要伺服器

Tools that work without server (can open HTML directly):
- 仙人微彩計算機
- Wondrous Tails 預測器
- 角色卡產生器
- 宗長計算機
- 檢舉模板產生器
- 天氣預報
- 攻略資料（陸行鳥毛色頁面除外）

**Testing:** Node 24；先執行 `npm --prefix api ci` 安裝 Miniflare/workerd，再執行 `node --test`（Node 內建 test runner，自動執行 `tests/*.test.js`）。`tests/design-system.test.js` 守住設計系統規則（token 完整性、對比度、token-clean 檔案清單）；`tests/pages.test.js` 守住每一頁的 CSS 載入順序（`tokens.css` 在 `common.css` 之前）與字型，以及有頁首的頁面（至少 23 頁）的 JS 載入順序：`tools-registry.js` 必須排在 `nav-template.js` 之前、`layout-loader.js` 必須排在 `common.js` 之前；`tests/timed-gathering-eorzea-time.test.js` 守住艾歐澤亞時間換算在不同時區下的一致性；`tests/scripts.test.js` 守住 `assets/`、`tools/` 底下的 JS 不得使用 `innerHTML`；`tests/docs.test.js` 守住 CLAUDE.md／README 的副本數、寶圖座標數與 JSON 資料檔案數這幾個關鍵統計數字不會與 `/data` 底下的實際資料脫節；`tests/modal-manager-stack.test.js` 用最小 DOM 替身（不需 jsdom）守住 `ModalManager` 的共用堆疊行為：只有最上層回應 Escape／焦點陷阱、關閉下層時由上而下連鎖收合、焦點依序回捲。新增行為測試涵蓋寶圖前後端契約、SQLite Durable Object 並行與權限、備份還原、通知降級、時間解析、陸行鳥全部色對、宗長候選、Lodestone 請求競爭、i18n 儲存與天氣網址狀態。`tests/design-system.test.js` 另守住按鈕與輸入框的 `min-height`（flex 直排時不被壓扁）；`tests/treasure-route-aetherytes.test.js` 守住每個有寶圖的地區都能算出傳送點；`tests/treasure-filters.test.js` 守住寶圖的等級／地區篩選：選取規則（地區依所選等級列出並附張數、取消等級時連帶取消只屬於它的地區）、記住與還原（網址 `grade`／`zone` 優先於 `localStorage`，保留 `room`，`localStorage` 不能用時照常運作），以及用 `fake-dom.js` 檢查 chip 的畫面與鍵盤焦點；`tests/treasure-find-page.test.js` 用 `fake-dom.js` 在 vm 裡執行寶圖頁，守住「選等級 → 選地區」流程、結果格與空狀態、步驟列與清單入口、卡片內容、複製的隊伍頻道句子（zh／en／ja）與詳細檢視（上一張／下一張、加入／移除、焦點），並檢查 `index.html`、`style.css` 與三語鍵值的結構。寶圖清單與路線另有五份測試：`tests/treasure-list-manager.test.js` 守住瀏覽器封鎖網站資料時 `ListManager` 的加入、移除、清空、匯入照樣更新記憶體裡的清單並回報 `saved: false`；`tests/treasure-route-progress.test.js` 守住路線進度（站序與完成記號）的保存、12 小時過期與各種清掉規則；`tests/treasure-copy-format.test.js` 守住複製格式的三語預設範本（含在隊伍裡句尾接上主人的隊伍版）、變數替換（含 `<寶圖主人>`）、存檔（v2）與舊 `{ teleport, map }` 格式的轉換；`tests/treasure-list-share.test.js` 守住分享連結 `?maps=` 的產生、解析與從網址拿掉，以及匯入內容（連結或以前匯出的 JSON）的辨識；`tests/treasure-list-panel.test.js` 用 `tests/helpers/html-fragment.js`（取出 `index.html` 真正的標記）和真正的建構函式，守住清單頁、清空／匯入／分享三個頁內對話框、路線頁（站別與傳送、完成與進度、複製下一站與全部複製）與複製格式區塊。清單面板的頁面替身（照 `index.html` 建出元素、載入頁面的腳本、取字自真正的翻譯檔）原本寫在這份測試裡，現在抽成 `tests/helpers/panel-page.js` 給組隊的測試共用，它的 `party` 選項可以接上真的 `RoomCollaboration`（只換掉 `request()`，不連伺服器）。組隊另有兩份測試：`tests/treasure-party-names.test.js` 守住 `PartyNames`（預設名字的字串只用 31 個不易看錯的字元、3 碼、存一次一直用、存值壞掉就重新產生，英文預設名字剛好 20 字，自己改過的名字優先、舊版預設樣式不算，改名的三種存法，以及「誰的圖」四種情況與 `knownMembers` 的驗證）；`tests/treasure-party.test.js` 用 `panel-page.js` 守住隊伍狀態（三行、成員列表、每兩秒輪詢重畫不搶焦點）、建立／加入／離開／移出／改名的頁內對話框（錯誤寫在對話框裡、連線中停用、切換語言重畫）、邀請連結與「加入隊伍 X？」的四種情況和 `ready` 的時機、同步狀態（連續 3 次傳輸失敗才顯示「連不上，重試中」，不再跳 toast），以及三語鍵值與用語（翻譯檔的英文值不得出現 Room／Team、日文值不得出現ルーム／チーム、中文值不得出現「房間」）。Worker 測試需要允許 localhost 連接埠；`.github/workflows/test.yml` 在 push／PR 自動執行全套測試與兩個 Worker 環境的 dry-run。每次 commit 前執行。網站主體沒有 package.json、bundler 或 linter（`api/` 的 Cloudflare Worker 子專案另有自己的 `package.json`／`wrangler`，與網站建置無關）。

**導覽列、頁尾、首頁與 404 頁的測試：** 共用四個輔助模組：`tests/helpers/fake-dom.js`（不需 jsdom 的最小 DOM 替身，在 vm 裡執行真正的瀏覽器腳本）、`tests/helpers/html-fragment.js`（解析頁面 HTML 的小工具，也能把 `index.html` 裡指定 id 的元素建成 fake-dom 節點，讓測試用真正的標記；寶圖搜尋器的測試使用）、`tests/helpers/translation-parsers.js`（翻譯檔的鍵值解析）與 `tests/helpers/panel-page.js`（寶圖搜尋器清單面板的頁面替身，從 `treasure-list-panel.test.js` 抽出，可以接真的 `RoomCollaboration`，說明見上面的測試段落）。它們不是測試檔，`node --test` 不會直接執行。
- `tests/tools-registry.test.js`：登錄表依首頁順序列出 13 個工具、站內網址存在、名稱鍵在 `common.js` 的 zh／en／ja 都有；首頁工具卡與每個工具頁頁首的名稱都要和登錄表一致
- `tests/footer-template.test.js`：頁尾連結的順序與屬性、版權年份、沒有 i18n 時顯示 zh 文字
- `tests/nav-tools-menu.test.js`：導覽列順序、工具面板的內容、目前工具的標示（404 頁不標示）、面板的開關與焦點行為
- `tests/hamburger-menu.test.js`：☰ 的 `aria-expanded`／`aria-controls`、焦點進出、Escape／遮罩／焦點移出關閉、視窗放寬時重置
- `tests/recent-tools.test.js`：最近使用的記錄與讀取（含毀損資料、儲存空間不能用）、記錄時機、首頁「最近使用」的顯示與語言切換
- `tests/home-page.test.js`：首頁工具卡的結構與狀態標示、翻譯鍵與預設文字、hero 縮小與版面數值
- `tests/not-found-page.test.js`：404 頁的絕對路徑、載入順序、頁面結構、翻譯、工具清單與樣式
- `tests/fake-dom.test.js`：守住 `fake-dom.js` 本身的行為（事件的捕獲／冒泡、焦點與 `inert`、選擇器、屬性等），以及 `html-fragment.js` 的 `mountFromHtml()` 照 `index.html` 的寫法建出節點
- `tests/theme-toggle.test.js` 也改用 `fake-dom.js`：主題切換鈕只建立一次，跨過 768px 不搬動

## Core Patterns

### Tool JavaScript Architecture
Each tool uses a consistent class-based pattern:

```javascript
class ToolCalculator {
    // Constants definition at class level
    static CONSTANTS = {
        DEBOUNCE_DELAY: 300,
        CSS_CLASSES: {
            ACTIVE: 'active',
            FOCUSED: 'focused'
        }
    };

    constructor() {
        this.state = {};
        this.elements = {
            grid: document.getElementById('tool-grid'),
            result: document.getElementById('result-display')
        };
        this.initializeEvents();
    }
    
    initializeEvents() {
        // Use named methods for removable event handlers
        this.handleClick = (e) => { /* handler logic */ };
        this.elements.grid.addEventListener('click', this.handleClick);
    }
}
```

### Multi-Select Tag Filtering Pattern
Modern tools implement multi-select filtering with tag buttons:

```javascript
// State management with Sets for O(1) lookup performance
this.selectedTypes = new Set();
this.selectedExpansions = new Set();

// Toggle method pattern
toggleTypeTag(tagElement) {
    const type = tagElement.dataset.type;
    if (this.selectedTypes.has(type)) {
        this.selectedTypes.delete(type);
        tagElement.classList.remove('active');
    } else {
        this.selectedTypes.add(type);
        tagElement.classList.add('active');
    }
    this.applyFilters();
}

// Matching logic - empty set means show all
matchesTypes(item) {
    if (this.selectedTypes.size === 0) return true;
    return this.selectedTypes.has(item.type);
}
```

HTML Structure:
```html
<div class="filter-group type-filter-group">
    <label>類型過濾：</label>
    <div class="type-tags" id="typeTags">
        <button class="type-tag" data-type="四人迷宮">四人迷宮</button>
        <button class="type-tag" data-type="公會令">公會令</button>
    </div>
</div>
```

### Adding New Tools
1. Create directory under `tools/[tool-name]/`
2. Copy HTML structure from existing tool, update title/descriptions
3. Import shared CSS/JS in the following order:
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
4. Use placeholder elements for header and footer:
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
5. **Use shared UI components instead of creating custom styles:**
   - **Buttons**: Use `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-danger`, `.btn-sm`, `.btn-lg`
   - **Cards**: Use `.card`, `.card-header`, `.card-body`, `.card-footer`, `.card-grid`, `.hoverable`（需與 `.card` 並用，例：`class="card hoverable clickable"`；也可用等效的獨立修飾類 `.card-hover` / `.card-clickable`）
   - **Forms**: Use `.form-control`, `.form-group`, `.form-label`, `.form-text`, `.form-check`
   - **Tags/Badges**: Use `.tag`, `.tag-primary`, `.chip`, `.badge`, `.tag-pill`, `.tag-outline-*`
   - **Loading states**: Use `.loading`, `.loading-spinner`
   - **Messages**: Use `.error-message`, `.success-message`, `.info-message`, `.warning-message`
5. Follow the class-based JavaScript architecture pattern
6. Register the tool in `assets/js/components/tools-registry.js` (the single tool list behind the header 工具 ▾ panel, the homepage "最近使用" row and the 404 page). The order there is the homepage card order, and `tests/tools-registry.test.js` compares the registry with the rest:
   - the entry: `id` (the directory name under `tools/`), `href`, `icon`, `i18nKey`, zh `name`
   - the zh/en/ja name key `tool_*_title` in `translations/common.js` (not `index.js`); its zh value must equal the registry `name`
   - the tool page: `data-tool-name` on `#header-placeholder` must equal the registry `name`, and the header key it points to (`data-tool-name-key`) must have the same zh/en/ja text as the `common.js` name
7. Add tool card to main `index.html`, at the same position and with the same icon and title key as in the registry
8. Update changelog.html with new version entry

## Shared Component System

### Overview
The project includes a modular CSS component system in `/assets/css/components/` to ensure UI consistency across all tools. **Always use these shared components instead of creating custom styles.**

### Design Tokens (`assets/css/tokens.css`)
全站唯一的顏色、字級、間距、圓角、陰影來源；深色模式只在 `[data-theme="dark"]` 重新指定顏色類 token。**規則：**
- 工具的 `style.css` 只寫版面（grid / flex / 間距），不得出現任何色碼（`#hex`、`rgb()`、`white`）、不得引用 `tokens.css` 未定義的 `var(--…)`、不得 `@import`、不得 `!important`；`tests/design-system.test.js` 自動檢查 `assets/css/**` 與 `tools/*/` 底下所有 CSS（唯一例外是 `tools/character-card/card-templates.css`——角色卡的卡片成品是使用者自訂的畫面，不隨主題變色），HTML／JS 不得使用 `tag-filter`、`btn-outline-*`、`tag-secondary`、`tag-light`、`tag-dark`、`tag-sm`、`tag-lg` 這些舊名稱，也不得再出現 `var(--primary-color)` 之類的相容別名。
- 顏色：`--color-primary`（互動色）、`--color-bg` / `--color-surface` / `--color-surface-2`、`--color-border` / `--color-border-strong`、`--color-heading` / `--color-text` / `--color-muted`、語意色 `--color-{success,warning,danger,info}` 及其 `-tint` / `-text` / `-border`，實心底上的字用 `--color-on-{primary,success,warning,danger,info,muted}`。
- 字級 9 階 `--text-xs` … `--text-5xl`；間距 `--space-1` … `--space-10`（4px 基底）；圓角 `--radius-{sm,md,lg,xl,full}`；陰影 `--shadow-{sm,md,lg,xl}`；控制項高度 `--control-{sm,md,lg}` = 32 / 40 / 48；動態 `--duration-{fast,base,slow}` + `--ease`。
- 品牌漸層 `--gradient-brand` 只用在頁首、首頁 hero、工具卡 hover 頂線、無 JavaScript 時的導覽列。

### Available Components

#### 1. Buttons (`components/buttons.css`)
```html
<!-- Basic buttons -->
<button class="btn btn-primary">Primary Button</button>
<button class="btn btn-secondary">Secondary Button</button>
<button class="btn btn-success">Success Button</button>
<button class="btn btn-danger">Danger Button</button>

<!-- Size variants -->
<button class="btn btn-primary btn-sm">Small Button</button>
<button class="btn btn-primary btn-lg">Large Button</button>

<!-- 輪廓 / 文字 -->
<button class="btn btn-outline">輪廓按鈕</button>
<button class="btn btn-ghost">文字按鈕</button>
<!-- 純 .btn = 次要按鈕；一個畫面最多一顆 .btn-primary -->

<!-- Icon buttons -->
<button class="btn btn-primary">
    <span class="btn-icon">🔍</span> Search
</button>

<!-- Block button -->
<button class="btn btn-primary btn-block">Full Width Button</button>

<!-- Loading state -->
<button class="btn btn-primary btn-loading">Loading...</button>
```

#### 2. Cards (`components/cards.css`)
```html
<!-- Basic card -->
<div class="card">
    <div class="card-header">Card Header</div>
    <div class="card-body">
        <h3 class="card-title">Card Title</h3>
        <p class="card-text">Card content goes here.</p>
    </div>
    <div class="card-footer">Card Footer</div>
</div>

<!-- Hoverable clickable card -->
<div class="card hoverable clickable">
    <div class="card-body">
        <h3 class="card-title">Interactive Card</h3>
        <p class="card-text">This card responds to hover and click.</p>
    </div>
</div>

<!-- Card grid layout -->
<div class="card-grid">
    <div class="card">...</div>
    <div class="card">...</div>
    <div class="card">...</div>
</div>

<!-- Card states -->
<div class="card card-selected">Selected card</div>
<div class="card card-disabled">Disabled card</div>
```

#### 3. Loading States (`tools-common.css`)
```html
<!-- Simple loading message -->
<div class="loading">
    <p>載入中...</p>
</div>

<!-- Loading with spinner -->
<div class="loading">
    <div class="loading-spinner"></div>
    <p>載入資料中...</p>
</div>
```

#### 4. Message Components (`tools-common.css`)
```html
<!-- Error message -->
<div class="error-message">
    發生錯誤：無法載入資料
</div>

<!-- Success message -->
<div class="success-message">
    操作成功完成！
</div>

<!-- Info message -->
<div class="info-message">
    提示：您可以使用鍵盤快捷鍵
</div>

<!-- Warning message -->
<div class="warning-message">
    警告：此操作無法復原
</div>
```

#### 5. Forms (`components/forms.css`)
```html
<!-- Basic input -->
<input type="text" class="form-control" placeholder="請輸入文字">

<!-- Size variants -->
<input type="text" class="form-control form-control-sm" placeholder="小型輸入框">
<input type="text" class="form-control form-control-lg" placeholder="大型輸入框">

<!-- Form group -->
<div class="form-group">
    <label class="form-label">標籤</label>
    <input type="text" class="form-control">
    <small class="form-text">說明文字</small>
</div>

<!-- Select -->
<select class="form-control">
    <option>選項 1</option>
    <option>選項 2</option>
</select>

<!-- Textarea -->
<textarea class="form-control" rows="3"></textarea>

<!-- Search box -->
<div class="search-box">
    <input type="text" class="form-control search-input" placeholder="搜尋...">
</div>

<!-- Validation states -->
<input type="text" class="form-control is-valid">
<div class="valid-feedback">輸入正確！</div>

<input type="text" class="form-control is-invalid">
<div class="invalid-feedback">請輸入有效的資料</div>

<!-- Checkbox -->
<div class="form-check">
    <input class="form-check-input" type="checkbox" id="check1">
    <label class="form-check-label" for="check1">
        核取方塊
    </label>
</div>

<!-- Radio -->
<div class="form-check">
    <input class="form-check-input" type="radio" name="radio" id="radio1">
    <label class="form-check-label" for="radio1">
        單選按鈕
    </label>
</div>
```

#### 6. Language Switcher (`components/language-switcher.css`)
```html
<!-- 語言切換器 -->
<div class="language-switcher" id="languageSwitcher">
    <button class="language-btn active" data-lang="zh">🇹🇼 中文</button>
    <button class="language-btn" data-lang="en">🇺🇸 EN</button>
    <button class="language-btn" data-lang="ja">🇯🇵 日本語</button>
</div>
```

#### 7. Tags/Badges (`components/tags.css`)
```html
<!-- Basic tags -->
<span class="tag">預設標籤</span>
<span class="tag tag-primary">主要標籤</span>
<span class="tag tag-success">成功標籤</span>
<span class="tag tag-danger">危險標籤</span>
<span class="tag tag-warning">警告標籤</span>
<span class="tag tag-info">資訊標籤</span>

<!-- Pill tags -->
<span class="tag tag-pill tag-primary">藥丸標籤</span>

<!-- Outline tags -->
<span class="tag tag-outline-primary">輪廓標籤</span>

<!-- 篩選膠囊（可切換） -->
<button class="chip">四人迷宮</button>
<button class="chip active">八人副本</button>
<!-- 實心狀態徽章 -->
<span class="tag tag-solid tag-warning">施工中</span>

<!-- Tag groups -->
<div class="tag-group">
    <span class="tag tag-primary">標籤1</span>
    <span class="tag tag-success">標籤2</span>
    <span class="tag tag-info">標籤3</span>
</div>

<!-- Badges -->
<span class="badge">99+</span>
```

#### 8. Tabs / Toggle / Progress / Cell / Table / Empty State / Dialog (`tools-common.css`)
```html
<!-- 頁籤 -->
<div class="tabs">
    <button class="tab active">預設清單</button>
    <button class="tab">週任務</button>
</div>

<!-- 開關（勾選狀態由 :checked 驅動） -->
<label class="toggle">
    <input type="checkbox">
    <span class="toggle-track"></span>
    採集提醒
</label>

<!-- 進度條 -->
<div class="progress"><div class="progress-bar" style="width: 35%"></div></div>

<!-- 互動格子（計算型工具的棋盤；尺寸由工具的 grid 決定） -->
<div class="cell">7</div>
<div class="cell selected">?</div>
<div class="cell best"><span class="cell-label">最佳揭開</span>1,612</div>

<!-- 表格 -->
<div class="table-wrap">
    <table class="table">…</table>
</div>

<!-- 空狀態 -->
<div class="empty-state">
    <div class="empty-state-icon">🗺️</div>
    <div class="empty-state-title">找不到符合條件的副本</div>
    <div class="empty-state-text">試試放寬篩選條件</div>
</div>

<!-- 對話框（顯示／隱藏由工具自己的 class 切換，例如 .dialog-overlay.active） -->
<div class="dialog-overlay">
    <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog-header">
            <h3 class="dialog-title">選擇數字</h3>
            <button class="btn btn-close" aria-label="關閉">×</button>
        </div>
        <div class="dialog-body">…</div>
        <div class="dialog-actions">
            <button class="btn btn-secondary">取消</button>
            <button class="btn btn-primary">確認</button>
        </div>
    </div>
</div>
```

### Component Usage Guidelines

1. **Always check for existing components** before creating custom styles
2. **Use semantic class names** from the component system
3. **Avoid inline styles** - use component classes instead
4. **Extend components** by adding modifier classes, not overriding base styles
5. **Maintain consistency** - if a component doesn't meet your needs, consider updating the shared component instead of creating a one-off solution

### Dark Mode Support
All components support Dark Mode automatically: `assets/css/tokens.css` redefines every colour token under `[data-theme="dark"]`, and components contain no dark rules of their own（`tests/design-system.test.js` 會擋下元件與已遷移工具內的 `[data-theme=` 規則）。需要調整深色外觀時改 token，不要在元件或工具加 `[data-theme="dark"]` 覆寫。`dark-mode-tools.css` 已刪除；深色模式的捲軸與原生表單控制項由 `tokens.css` 的 `color-scheme` 自動配色。頁面不得有內嵌 `<style>`，`style=` 屬性只允許 JS 控制顯示用的 `display: none`（`tests/pages.test.js` 會擋）。

### Responsive Design
Components include responsive breakpoints:
- Mobile: < 480px
- Tablet: < 768px
- Desktop: ≥ 768px

## Internationalization (I18n) System

### Overview
The project supports 3 languages via the I18nManager class:
- **zh**: 繁體中文（預設）
- **en**: English
- **ja**: 日本語

### File Structure
```
/assets/js/i18n/
├── i18n-manager.js          # I18nManager 類別
└── translations/
    ├── common.js            # 共用翻譯（導航、頁尾、13 個工具名稱 tool_*_title）
    ├── index.js             # 首頁翻譯
    ├── about.js             # 關於頁面翻譯
    ├── changelog.js         # 修改紀錄頁面翻譯
    ├── copyright.js         # 版權聲明頁面翻譯
    ├── not-found.js         # 404 頁翻譯
    └── tools/               # 工具翻譯（report-generator 目前未使用 i18n，沒有對應檔案）
        ├── character-card.js
        ├── dungeon-database.js
        ├── faux-hollows-foxes.js
        ├── guide.js
        ├── lodestone-lookup.js
        ├── macro-converter.js
        ├── mini-cactpot.js
        ├── timed-gathering.js
        ├── treasure-map-finder.js
        ├── weather-forecast.js
        └── wondrous-tails.js
```

### Usage Pattern
```html
<!-- HTML 標記 -->
<h1 data-i18n="hero.title">預設文字</h1>
<input data-i18n="search.placeholder" data-i18n-attr="placeholder">

<!-- 引入 I18n 系統 -->
<script src="../../assets/js/i18n/i18n-manager.js"></script>
<script src="../../assets/js/i18n/translations/common.js"></script>
<script src="../../assets/js/i18n/translations/tools/tool-name.js"></script>
```

```javascript
// 全域實例由 i18n-manager.js 建立（window.i18n），工具不需自行 new
const text = window.i18n.getText('key');
const lang = window.i18n.getCurrentLanguage();
window.i18n.onLanguageChange(() => this.updateUI());
```

### Language Switcher
```html
<!-- 在 header 中加入語言切換器 -->
<link rel="stylesheet" href="../../assets/css/components/language-switcher.css">

<div class="language-switcher" id="languageSwitcher">
    <button class="language-btn active" data-lang="zh">🇹🇼 中文</button>
    <button class="language-btn" data-lang="en">🇺🇸 EN</button>
    <button class="language-btn" data-lang="ja">🇯🇵 日本語</button>
</div>
```

## Modular Tool Architecture

### Complex Tools Structure
Tools with advanced features use modular architecture:

**treasure-map-finder/** (20 個程式檔 + 3 份文件；另有 `images/` 圖片資源目錄，不逐一列出):
```
├── index.html
├── script.js              # 主控制器
├── room-collaboration.js  # 隊伍連線（建立、加入、離開、移出、改名）、輪詢與同步狀態、邀請連結、私人 session 憑證
├── room-dialogs.js        # 組隊的五個頁內對話框：建立、加入、邀請連結（加入隊伍 X？）、離開、移出
├── party-status.js        # 隊伍狀態：代號與同步狀態、複製邀請連結／複製代號／離開隊伍、成員一行與成員列表
├── party-names.js         # 預設名字（光之戰士＋3 碼字串）、改名的存法、誰的圖（不碰 DOM，node 裡就能測）
├── room-map-sync.js       # 操作佇列、重試去重與 revision 合併
├── filter-manager.js      # 過濾器管理
├── list-manager.js        # 清單管理（瀏覽器封鎖網站資料時照樣改記憶體裡的清單）
├── list-dialogs.js        # 清空、匯入與分享三個頁內對話框
├── list-share.js          # 分享連結 ?maps= 的產生與解析、匯入內容（連結或以前匯出的 JSON）的辨識
├── ui-dialog-manager.js   # 對話框管理（只剩詳細檢視）
├── zone-manager.js        # 地區管理
├── coordinate-utils.js    # 座標工具
├── route-calculator.js    # 路線排序（寶圖多的地區先跑、跑到一半不重排、傳送標記）
├── route-progress.js      # 路線進度（站序與完成記號）的保存、12 小時過期與清掉規則
├── route-view.js          # 路線頁（一站一張寶圖、完成、複製）與複製格式區塊
├── copy-format.js         # 複製格式：範本、變數替換、存檔（v2）與舊格式轉換
├── migrate-data.js        # 資料遷移工具
└── style.css
```
（另有 README-migration.md、room-collaboration-spec.md、SPEC.md 三份文件，不計入程式碼檔案數）

**timed-gathering/** (8 files):
```
├── index.html
├── script.js              # 主控制器
├── list-manager.js        # 清單管理
├── macro-exporter.js      # 巨集匯出
├── notification-manager.js # 通知管理
├── search-filter.js       # 搜尋過濾
├── time-calculator.js     # 時間計算
└── style.css
```
（已改用共用的 `assets/js/security-utils.js` 與共用 i18n 系統，不再有工具專屬的 `security-utils.js` / `i18n.js`）

### Module Pattern
```javascript
// 模組匯出模式
class ModuleName {
    constructor(mainController) {
        this.main = mainController;
        this.elements = {};
        this.state = {};
    }

    init() {
        this.cacheElements();
        this.bindEvents();
    }
}

// 全域匯出
window.ModuleName = ModuleName;
```

```javascript
// 主控制器載入模組
async loadModules() {
    this.filterManager = new FilterManager(this);
    this.listManager = new ListManager(this);
    await Promise.all([
        this.filterManager.init(),
        this.listManager.init()
    ]);
}
```

## UI Consistency Requirements

### Dynamic Layout Components
Navigation and footer are now loaded dynamically via JavaScript components in `/assets/js/components/`:

- **tools-registry.js**: The single tool list (13 tools in homepage card order; 水晶商城清單 is `external`) with `findById`, `findByPath`, `readRecent` and `recordVisit`. The header 工具 ▾ panel, the homepage "最近使用" row and the 404 tool list all read it. Recent tools live in `localStorage['ff14tw_recent_tools']` (newest first, one entry per tool, at most 4; external tools, unknown ids, site pages and the 404 page are never recorded; every storage access is wrapped in try/catch)
- **nav-template.js**: Creates navigation bar with logo, nav links, the 工具 ▾ button and panel (`initToolsMenu()` makes them work), and language switcher
- **footer-template.js**: Creates footer with site links, disclaimer and copyright
- **layout-loader.js**: Orchestrates loading of both components (marking the current tool in the header), records the current tool as recently used, handles i18n integration

Every page with a header must load `tools-registry.js` before `nav-template.js` (the header reads `window.ToolsRegistry`) and `layout-loader.js` before `common.js` (`common.js` adds ☰ and the theme toggle to the header the loader built); `tests/pages.test.js` enforces both.

All pages use placeholder elements that are replaced at runtime:
```html
<!-- Header placeholder with configuration -->
<div id="header-placeholder" data-base-path="/" data-tool-name="工具名稱" data-tool-name-key="i18n_key"></div>

<!-- Footer placeholder -->
<div id="footer-placeholder" data-base-path="/"></div>
```

**Placeholder attributes:**
- `data-base-path`: Base path for relative URLs (e.g., "/" for root, "../../" for tools)
- `data-tool-name`: Tool name to display in logo (e.g., "FF14.tw | 副本資料庫"); on a tool page it must equal that tool's registry `name`
- `data-tool-name-key`: i18n key for tool name translation
- `data-page`: Optional page type on the header placeholder. Only `404.html` sets it (`data-page="404"`): the loader then skips the URL-to-tool lookup, so no tool is marked as current and nothing is recorded as recently used. GitHub Pages shows the 404 page at whatever URL was mistyped (e.g. `/tools/weather-forecast/typo`), which would otherwise match a tool's directory

### Navigation Structure (Generated by nav-template.js)
The navigation includes, in this order:
- Logo with optional tool name (at 769–899px the tool name and its separator are hidden so the header does not overflow; the name stays in the page title and in the tools panel)
- Navigation links: 首頁, 工具 ▾, 修改紀錄, 版權聲明 (關於 and GitHub are in the footer)
- 工具 ▾: a button (`aria-expanded`, `aria-controls="nav-tools-menu"`) that opens a panel listing every registry tool in registry order (a floating 3-column panel on desktop). The current tool's link gets `active` and `aria-current="page"` (the button gets `active` too); 水晶商城清單 is external, so it opens a new tab and shows ↗. The panel closes on Escape (focus returns to the button), a press outside, Tab moving out, the page coming back from the back/forward cache, choosing a link that opens a new tab such as 水晶商城清單 (in these two cases focus returns to the button if it was in the panel), or the window narrowing to the drawer layout (≤768px; focus in the header nav then moves to ☰, see below); it is not a dialog (no focus trap, no scroll lock)
- Language switcher (ZH-TW, EN, JP)
- Theme toggle: created once by `initThemeToggle()` in `common.js`, inside `.header .container` right before ☰; CSS positions it and it never moves across 768px
- Mobile hamburger menu (≤768px): ☰ has `aria-expanded` and `aria-controls`. The drawer (`min(320px, 85vw)` wide) shows the always-expanded tool list first (the 工具 ▾ button is hidden there), then 首頁 · 修改紀錄 · 版權聲明 and the language switcher. The drawer's 首頁 is a second link placed after the tool list (`.nav-drawer-only`; the header's first 首頁 is `.nav-desktop-only` and hidden in the drawer), so what the drawer shows, the Tab order and the screen-reader order all follow the DOM — don't reorder the drawer with CSS `order`. Opening moves focus to the first tool link; Escape, the overlay, ☰ again, or focus leaving the drawer closes it (the first three return focus to ☰); coming back from the back/forward cache or choosing a link that opens a new tab (水晶商城清單) also closes it, returning focus to ☰ if it was in the drawer. Crossing 768px moves focus that would otherwise be lost: into the drawer layout, focus in the header nav moves to ☰; back to desktop, focus on ☰ or a drawer tool link moves to 工具 ▾, and focus on the drawer's 首頁 moves to the desktop 首頁. This runs in a `matchMedia` change listener (`initHamburgerMenu()`), which fires before the browser drops focus from elements that have just become hidden; the 250ms-debounced resize reset is too late for that

### Footer Structure (Generated by footer-template.js)
The footer has three rows:
- Site links: 修改紀錄 · 回報問題 (GitHub Issues, new tab) · 關於 · 版權聲明 · GitHub (new tab). External links show ↗ in a separate `span.external-mark` and carry `data-i18n` on an inner `span`, so switching languages never wipes the ↗
- Disclaimer text
- `© 2024–<current year> FF14.tw · Made with ❤️ by hydai` (the end year is computed; `createDOM({ year })` overrides it)

## Advanced Patterns

### Animation Standards
```css
/* Glow effect for important elements */
@keyframes glow {
    0%, 100% {
        box-shadow: 0 0 15px rgba(74, 144, 226, 0.8);
        transform: scale(1);
    }
    50% {
        box-shadow: 0 0 25px rgba(74, 144, 226, 1);
        transform: scale(1.05);
    }
}

.best-choice {
    animation: glow 2s ease-in-out infinite;
}
```

### Phase-Based Interactions
For complex tools with multiple interaction modes:
```javascript
handleCellClick(e) {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    
    if (this.phase === 'obstacle') {
        this.placeObstacle(cell);
    } else if (this.phase === 'treasure') {
        this.showTreasurePopup(cell);
    }
}
```

### Data Management
Tools with external data follow this structure:
- Main data file: `/data/[tool-name].json`
- Supporting data: Zone translations, metadata, etc.

**Data Files (`/data/`):**
```
/data/
├── dungeons.json (12,376 行) - 803 個副本資料（檔案內 metadata.totalDungeons 欄位仍寫 804，屬既有落差）
├── treasure-maps.json (2,712 行) - 227 個寶圖座標（G8/G10/G12/G14/G15/G17/G18）
├── macro-mappings.json (7,627 行) - 巨集轉換器的巨集指令對照表
├── timed-gathering.json (1,253 行) - 特殊採集點資料
├── chocobo-colors.json (139 行) - 陸行鳥毛色配方資料（攻略資料工具使用）
├── zones.json (671 行) - 地區定義與元資料
├── aetherytes.json (633 行) - 傳送點資料
├── zone-translations.json (151 行) - 地區名稱翻譯 (zh/en/ja)（目前沒有任何程式碼引用，疑似孤兒檔案）
└── ff14-gp.csv - GP 值參考資料
```

Loading pattern with error handling:

```javascript
async loadData() {
    this.showLoading(true);
    try {
        const response = await fetch('../../data/dungeons.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        this.processData(data);
    } catch (error) {
        console.error('Data loading failed:', error);
        this.showError('載入資料失敗，請重新整理頁面再試。');
    } finally {
        this.showLoading(false);
    }
}
```

## Development Guidelines

### Language Standards
- 使用繁體中文與台灣用語
- 「資料」而非「數據」
- 「智慧」而非「智能」

### Git Commit Standards
```
功能類別：簡短描述主要變更

- 詳細變更項目1
- 詳細變更項目2

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Git Usage Guidelines
- **NEVER use `git add .`**: Always add specific files you intend to commit to ensure only relevant changes are included.
- **Check status first**: Run `git status` before adding files to understand the current state.
- **Atomic commits**: Separate commits logically; each commit should address a single concern.


### Performance Guidelines
- Debounce search/filter operations at 300ms
- Use CSS transforms for animations (GPU acceleration)  
- Implement lazy loading for images
- Early returns in filter functions
- Use Set for O(1) lookup performance in filtering

### Security Guidelines
- **NEVER use innerHTML**: Always use DOM manipulation methods (createElement, appendChild, textContent)
- **Prevent XSS attacks**: All user inputs and dynamic content must be properly escaped
- **Use textContent for text**: When setting text content, always use textContent instead of innerHTML
- **DOM manipulation pattern**: Create elements with createElement, set properties, then appendChild
- **No direct HTML string injection**: Avoid template literals with HTML, build DOM trees programmatically
- Example of correct approach:
  ```javascript
  // ❌ Wrong - Security Risk
  element.innerHTML = `<div>${userContent}</div>`;
  
  // ✅ Correct - Safe DOM Manipulation
  const div = document.createElement('div');
  div.textContent = userContent;
  element.appendChild(div);
  ```

### Accessibility Standards
- Keyboard navigation for interactive elements
- Focus indicators with proper contrast
- ARIA labels for screen readers
- Focus trapping in modals
- Use `.visually-hidden` class for content that should be accessible to screen readers and SEO but visually hidden (e.g., H1 titles when already displayed in navigation)

## FF14-Specific Standards

### Content Classifications
- **四人迷宮**: Standard 4-person dungeons
- **8人大型任務**: 8-person raids (Bahamut, Alexander, Omega, Eden, Pandaemonium, Arcadion)
- **8人討伐殲滅戰**: 8-person trials
- **24人大型任務**: 24-person alliance raids
- **絕境戰**: Ultimate difficulty
- **幻巧戰**: Unreal trials
- **公會令**: Guildhest content

### Asset Management
- Job icons: `assets/images/se/FFXIVJobIcons/{category}/{type}/{JobName}.png`
- Tool images: `images/{id}.jpg` with 2:1 aspect ratio
- Fallback handling for missing assets

## AI Command Memories

- 當我呼叫 GitCommit 請幫我根據目前修改，對 changelog 進行更新以後，再產生一個 git commit
- 所有頁面的導航列都需保持一致的風格，包含版權聲明連結
- 所有頁面的頁尾都需與首頁風格一致
- 當我呼叫 Update 時，請更新 README.md 與 CLAUDE.md
- 使用 FF14 繁中服官方用語時，請參考 TERMINOLOGY.md 文件

## Current Tools

1. **Character Card Generator** (`character-card/`): Customizable FF14 character cards
2. **Dungeon Database** (`dungeon-database/`): 803 dungeons with multi-select filtering
3. **Mini Cactpot Calculator** (`mini-cactpot/`): 3x3 lottery probability calculator
4. **Wondrous Tails Predictor** (`wondrous-tails/`): 4x4 bingo probability calculator
5. **Faux Hollows Calculator（宗長計算機）** (`faux-hollows-foxes/`): 6x6 treasure hunting puzzle solver
6. **Treasure Map Finder** (`treasure-map-finder/`): 227 treasure map coordinates (G8/G10/G12/G14/G15/G17/G18) with a personal or party list (invite link, every map labelled with whose it is), a stop-by-stop route with saved progress, and share links
7. **Lodestone Lookup** (`lodestone-lookup/`): Character information lookup using Lodestone ID with complete stats, jobs, and equipment display
8. **Timed Gathering Manager** (`timed-gathering/`): Eorzea time-based gathering node tracker with multi-list management and macro export
9. **Guide** (`guide/`): FF14 新手攻略指南，涵蓋公會、大國防聯軍、副本、風脈、隊伍系統、探索筆記與陸行鳥毛色計算（8 個子頁面）
10. **Report Generator** (`report-generator/`): 產生不當行為檢舉的模板文字，協助申訴
11. **Macro Converter** (`macro-converter/`): 在繁體中文、英文、日文之間轉換 FF14 巨集
12. **Weather Forecast** (`weather-forecast/`): 查詢艾歐澤亞各地區天氣預報，支援特定天氣條件搜尋

## Development Memories

- 對於 CLAUDE.md 的任何修改都不需要在 changelog 中提及，因為他與玩家無關，只與開發者有關
- 工具對應關係：
  - `character-card` 為角色卡產生器
  - `dungeon-database` 為副本資料庫
  - `faux-hollows-foxes` 為宗長計算機
  - `treasure-map-finder` 為寶圖搜尋器
  - `lodestone-lookup` 為 Lodestone 角色查詢
  - `timed-gathering` 為特殊採集時間管理器
  - `guide` 為攻略資料
  - `report-generator` 為檢舉模板產生器
  - `macro-converter` 為巨集轉換器
  - `weather-forecast` 為天氣預報
  - 請記住他們的對應關係，避免改錯工具
- 永遠使用 DOM 操作來取代 innerHTML

## Data Sources and Attribution

When adding external data sources, always:
1. Add attribution in the tool's UI (see treasure-map-finder for example)
2. Include source links with proper rel="noopener noreferrer"
3. Respect original data licensing terms

## API Integration

### Treasure Map Room Collaboration API
- Deployed on Cloudflare Workers, with one SQLite Durable Object per room
- Supports room create/read/update (`POST /api/rooms`, `GET`/`PUT /api/rooms/:code`), join/leave/remove-member, and automatic expiry cleanup (`POST /api/cleanup`) — no user-facing per-room delete endpoint exists today
- Implements CORS security restrictions - only allows requests from ff14.tw domain
- Development environment can enable localhost support via environment variables
- Create/join atomically import initial maps and return a private member token; authenticated mutations send add/remove operations with idempotency IDs, never whole-list snapshots
- Legacy KV rooms are read-only until their existing TTL expires; keep their maps locally and create a new room
- See `api/README.md` for coordinated frontend/API rollout and local development; default, development and production declare their own bindings
- 前端的預設名字、誰的圖、邀請連結都用伺服器現有的資料（成員的 `nickname`、寶圖的 `addedBy`、`creatorId`），沒有改 API
- Provides real-time collaboration features for treasure map hunting groups

### Lodestone Character Lookup API
- Uses logstone API for character data queries
- Fetches complete character information including:
  - Main attributes (HP, MP, Attack, Defense)
  - Sub-attributes (STR, DEX, VIT, INT, MND, Critical Hit, Tenacity, Direct Hit)
  - All job levels with max level highlighting
  - Equipment information with glamour status
  - Grand Company rank, birthday, and character biography
- Provides direct links to official Lodestone pages
- Implements proper error handling for invalid IDs or API failures

### Security Considerations
- All user inputs are properly escaped to prevent XSS attacks
- APIs implement origin-based CORS restrictions
- No sensitive data is exposed through API endpoints
- Rate limiting is handled by the upstream API providers