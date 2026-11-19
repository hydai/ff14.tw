# CLAUDE.md

FF14.tw 是給台灣 FF14 玩家用的工具網站。純 HTML／CSS／JavaScript 的靜態網站：沒有 build、bundler、框架，網站主體也沒有 package.json 或 linter（`api/` 的 Cloudflare Worker 子專案另有自己的 `package.json`／`wrangler`，與網站建置無關）。部署在 GitHub Pages（自訂網域 ff14.tw）。每個工具自成一個 `tools/<id>/` 目錄，共用的東西在 `assets/`，大份資料在 `data/`。

這份只寫讀程式碼推不出來的東西。工具目錄裡的 `CLAUDE.md` 寫那個工具的原因、陷阱與已知限制，改那個工具之前先看；寫測試的陷阱在 `tests/CLAUDE.md`，分享預覽的細節在 `scripts/share-preview/CLAUDE.md`。

## Project Statistics

`tests/docs.test.js` 拿下面三行對照 `data/` 的實際內容，格式不要改：

- **Total Dungeons**: 803 entries（`dungeons.json` 自己的 `metadata.totalDungeons` 欄位寫 804，是資料檔裡本來就有的落差，不是文件錯）
- **Total Treasure Map Coordinates**: 227 entries (G8/G10/G12/G14/G15/G17/G18)
- **JSON Data Files**: 8（`/data/` 另有一個不是 JSON 的 `ff14-gp.csv`）

## 本機開發與測試

- 用本機伺服器開：從專案根目錄 `python3 -m http.server`，開 http://localhost:8000。要讀 `/data/` 的工具（副本資料庫、寶圖搜尋器、特殊採集時間管理器、巨集轉換器、陸行鳥染色計算器）與 Lodestone 角色查詢不能用 `file://` 開。
- 角色卡產生器不讀資料檔，但用 `file://` 開時，卡片上的職業圖示讓瀏覽器把 canvas 當成跨來源，`toBlob` 丟 `SecurityError`：預覽與欄位照常，下載、分享、複製都產生不出圖。
- 404 頁：GitHub Pages 對任何不存在的網址顯示根目錄的 `404.html`，`python3 -m http.server` 不會。本機直接開 `http://localhost:8000/404.html`（頁面的樣式、腳本與連結都是根目錄絕對路徑，不能用 `file://` 開）。
- 測試：Node 24。先 `npm --prefix api ci`（裝 Miniflare／workerd），再 `node --test`（Node 內建的 test runner，跑 `tests/*.test.js`；`tests/helpers/` 是輔助模組，不是測試檔）。Worker 的測試要能連 localhost 的連接埠。每次 commit 前跑全套；`.github/workflows/test.yml` 在 push／PR 也會跑全套測試與兩個 Worker 環境的 dry-run。
- 版面（寬、高、位置）沒有自動測試守得住（測試用的 `fake-dom.js` 沒有版面），改版面要用瀏覽器量；目前量過的幾乎都只在 macOS 的 Chrome。

## 寫程式的規則

- **不要用 `innerHTML`**：一律用 `createElement`、`textContent`、`appendChild` 建 DOM，不要用 template literal 組 HTML 字串（`tests/scripts.test.js` 會擋 `assets/`、`tools/` 底下的 JS）。
- `querySelectorAll()` 與 `.children` 回傳的是 NodeList／HTMLCollection，不是陣列：要用 `map`、`filter`、`find` 先 `Array.from()`。測試用的 `fake-dom.js` 回傳一般陣列，少轉的話測試照樣過，真的瀏覽器卻在那一行丟 TypeError（角色卡第一版就是這樣在 Chrome 裡一打開就壞掉）。
- 用 `hidden` 切換顯示的元素，`style.css` 要有 `#id[hidden] { display: none; }`：`.card`、`.btn` 等共用樣式設了 `display`，會蓋過瀏覽器內建的 `[hidden]`，而 `fake-dom.js` 看不出這個問題。
- 顏色、字級、間距、圓角、陰影只用 `assets/css/tokens.css` 的 token。工具的 `style.css` 只寫版面：不寫色碼（`#hex`、`rgb()`、`white`）、不引用 `tokens.css` 沒定義的 `var(--…)`、不 `@import`、不 `!important`。深色模式只在 `tokens.css` 的 `[data-theme="dark"]` 改 token，元件與工具不寫 `[data-theme=` 規則。頁面不放內嵌 `<style>`，`style=` 只給 JS 切換顯示用的 `display: none`（`tests/design-system.test.js`、`tests/pages.test.js` 會擋）。
- 先用共用元件（`assets/css/components/` 與 `assets/css/tools-common.css`：`.btn`、`.card`、`.form-control`、`.chip`、`.tag`、`.cell`、`.dialog`、`.empty-state`…），不要為一個工具另寫一套樣式；共用元件不夠用時改共用元件。一個畫面最多一顆 `.btn-primary`。
- 手機版面不能做成要左右捲：不寫 `overflow-x`，也不寫比畫面寬的固定寬度。

## 用語與語言

- 使用繁體中文與台灣用語：「資料」而非「數據」，「智慧」而非「智能」。FF14 繁中服的官方用語照 `TERMINOLOGY.md`。
- 介面有三種語言：zh（預設）、en、ja，用 `assets/js/i18n/` 的 `I18nManager`（全域實例 `window.i18n`，工具不要自己 new）。HTML 用 `data-i18n`（屬性用 `data-i18n-attr`），JS 用 `window.i18n.getText()`；14 個工具名稱 `tool_*_title` 在 `translations/common.js`，不在 `index.js`。
- 檢舉模板產生器只給繁中服用，刻意不做多國語言。
- 副本的內容分類：
  - **四人迷宮**: Standard 4-person dungeons
  - **8人大型任務**: 8-person raids (Bahamut, Alexander, Omega, Eden, Pandaemonium, Arcadion)
  - **8人討伐殲滅戰**: 8-person trials
  - **聯盟任務**: 24-person alliance raids
  - **絕境戰**: Ultimate difficulty
  - **誅滅戰**: 24-person chaotic alliance raids (The Cloud of Darkness)
  - **幻巧戰**: Unreal trials
  - **公會令**: Guildhest content

## 工具

目錄與名稱的對應（照首頁的順序；名稱以 `assets/js/components/tools-registry.js` 為準）。請記住對應關係，避免改錯工具：

| `tools/` 底下 | 名稱 | 備註 |
|---|---|---|
| `mini-cactpot` | 仙人微彩計算機 | |
| `wondrous-tails` | 天書奇談預測器 | |
| `dungeon-database` | 副本資料庫 | |
| `character-card` | 角色卡產生器 | |
| `faux-hollows-foxes` | 宗長計算機 | |
| `treasure-map-finder` | 寶圖搜尋器 | 組隊用 `api/` 的 Worker |
| `lodestone-lookup` | Lodestone 角色查詢 | 只限國際版角色，資料來自另外部署的 logstone Worker |
| `timed-gathering` | 特殊採集時間管理器 | |
| `guide` | 攻略資料 | 8 頁，其中 4 頁撰寫中 |
| `chocobo-color` | 陸行鳥染色計算器 | |
| `report-generator` | 檢舉模板產生器 | 只有繁中 |
| `macro-converter` | 巨集轉換器 | 只有生產技能與文字指令 |
| `weather-forecast` | 天氣預報 | |

水晶商城清單（`tc-shop`）是外部網站，只在登錄表裡。新增工具或頁面照 `add-tool` skill（`.claude/skills/add-tool/`）。

## 頁首、頁尾與工具登錄

- 頁首與頁尾由 `assets/js/components/` 的 `tools-registry.js`、`nav-template.js`、`footer-template.js`、`layout-loader.js` 在執行時換掉 `#header-placeholder`、`#footer-placeholder`。所有頁面的導覽列都要保持一致的風格（包含版權聲明連結），頁尾都要與首頁一致。
- `tools-registry.js` 是唯一的工具清單，順序就是首頁卡片的順序；頁首的「工具 ▾」、首頁「最近使用」與 404 頁都讀它。
- 只有 `404.html` 的頁首 placeholder 設 `data-page="404"`：GitHub Pages 在任何打錯的網址顯示 404 頁，網址可能剛好在某個工具的目錄底下（例如 `/tools/weather-forecast/typo`），有這個屬性頁首才不會把它標成那個工具、也不會記進最近使用。

## 分享預覽與主畫面

- 每一頁 `<head>` 裡從 `<!-- 分享預覽與主畫面：… -->` 到 `<!-- /分享預覽與主畫面 -->` 的那一段、`assets/images/og/`、`assets/images/icons/` 與每個 `manifest.webmanifest` 都是 `scripts/share-preview.mjs` 產生的，不要手改。
- 改了任何一頁的 `<title>` 或 `<meta name="description">`、登錄表的名稱或圖示、首頁卡片的說明（`translations/index.js` 的 `tool_*_desc` 與 `hero_title`）、`TOOL_COLORS`、`tokens.css` 的顏色、logo 或 `card.html`，兩個指令都要跑，把它們改到的檔案一起 commit（沒變的檔案不會重寫；忘了跑，`tests/share-preview.test.js` 會失敗；CI 只檢查、不產生）：
  ```bash
  node scripts/share-preview.mjs pages    # 重寫每一頁的那一段、寫出 manifest；不連網路
  node scripts/share-preview.mjs images   # 畫預覽圖與圖示；要本機 Chrome 與網路（Google Fonts）
  ```
- 每一頁都不寫 `og:url`：Facebook 把它當正式網址，分享出去的寶圖隊伍邀請（`?room=`）、寶圖清單（`?maps=`）、天氣（`#…`）與修改紀錄的版本（`#version-…`）會被導回沒有狀態的頁面。

## Git

- **不要用 `git add .`**：先 `git status`，只加這次要 commit 的檔案。一個 commit 只做一件事。
- Commit 訊息照 git log 的寫法：Conventional Commits（`feat:`、`fix:`、`docs:`、`refactor:`、`chore:`…），英文標題。
- 換行一律 LF：`.gitattributes`（`* text=auto eol=lf`）讓每個文字檔在任何平台都用 LF 取出。沒有它時 Windows 的 git 預設會換成 CRLF，那樣的複本上 `node scripts/share-preview.mjs pages` 會停下、有測試會失敗。

## 指令與慣例

- 當我呼叫 GitCommit：先根據目前的修改更新 `changelog.html`（寫法照 `changelog` skill），再產生 git commit。CLAUDE.md 的修改與玩家無關，不寫進修改紀錄。
- 當我呼叫 Update：更新 README.md 與 CLAUDE.md。CLAUDE.md 只寫讀程式碼推不出來的東西（陷阱、原因、刻意的決定、和預設不同的慣例、已知的限制）；測試涵蓋了什麼、檔案清單、元件用法與版面數字不寫進來。只和一個工具有關的，寫在那個工具目錄的 `CLAUDE.md`。
- 加入外部資料來源時：在工具的畫面上標示來源（範例見寶圖搜尋器），連結加 `rel="noopener noreferrer"`，並遵守原始資料的授權。

## API

- 寶圖組隊：`api/` 的 Cloudflare Worker（每個隊伍一個 SQLite Durable Object），CORS 只允許 ff14.tw，development 環境可以用環境變數開放 localhost。前後端一起上線的順序與本機開發見 `api/README.md`，前端的注意事項見 `tools/treasure-map-finder/CLAUDE.md`。
- Lodestone 角色查詢：資料來自另外部署的 logstone Worker（hydai/logstone），見 `tools/lodestone-lookup/CLAUDE.md`。
