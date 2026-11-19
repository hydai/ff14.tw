# 分享預覽與主畫面（scripts/share-preview/）

`node scripts/share-preview.mjs pages` 與 `images` 產生貼連結到 Discord、LINE、Facebook 時的預覽卡，與手機「加到主畫面」的圖示和名稱：每一頁 `<head>` 裡的那一段、14 個 `manifest.webmanifest`、`assets/images/og/` 的 21 張預覽圖與 `assets/images/icons/` 的 4 張圖示。什麼時候要重跑，寫在根目錄的 CLAUDE.md。

- 為什麼寫死在 HTML 與檔案裡：聊天 App 讀 HTML 原始碼、不執行網站的 JS，所以這些不能在網站載入時才算，要由腳本（Node 24，沒有任何套件）產生後一起 commit。
- 每一頁那一段插在單獨一行的 `<link rel="icon" …>` 後面，前後是一字不差的註解 `<!-- 分享預覽與主畫面：由 scripts/share-preview.mjs 產生，改了分頁標題或說明後重跑 -->` 與 `<!-- /分享預覽與主畫面 -->`，重跑時整段換掉；複製別的頁面當新頁面時，舊的那一段會跟著過來，`pages` 會換成這一頁自己的。註解對不上或找不到 favicon 那一行就報錯並寫出檔名。頁面用 CRLF 換行時照樣插入、換掉，寫回時整份保留 CRLF。`og:*`、`twitter:card`、`theme-color`、`apple-mobile-web-app-title`、manifest 與 `apple-touch-icon` 的標籤只能在那一段裡。
- 內容只照抄網站現有的字，不另外寫文案：`og:title` 是這一頁的 `<title>`、`og:description` 是 `<meta name="description">`（每一頁都要有這兩個）；圖上的字，工具是登錄表的 `name` 與 `icon` 加首頁卡片那一句，攻略主題是那一頁 `<title>` 裡的主題名稱與那一頁的說明，網站那張是「FF14.tw」與首頁大標 `hero_title`。
- 不寫 `og:url`（包括 404）：Facebook 把它當正式網址，貼文的連結會指到它，分享出去的 `?room=`、`?maps=`、`#…`、`#version-…` 會被導回沒有狀態的頁面；Discord、LINE、X 本來就用貼上的網址。`404.html` 會出現在任何打錯的網址上，所以它那一段只用 `/` 開頭的路徑。只有 Lodestone 頁另有 `<link rel="canonical">`（原本就有，保留）。
- 預覽一律是中文（`og:locale` 是 `zh_TW`），網址後面的 `?room=`、`?maps=`、`?id=`、`#…` 也不改變預覽：要依連結內容換預覽得在伺服器端做。各家 App 會快取預覽，以前分享過的網址可能要幾小時到幾天才換新（Facebook 可以用分享偵錯工具手動更新）。
- 底色是 `TOOL_COLORS`（`site.mjs`，工具 → `tokens.css` 的顏色 token）對到的淺色值，往右下漸暗；攻略主題同攻略資料，網站那張是 `--gradient-brand`。顏色照 token 名稱讀 `tokens.css`，腳本不寫色碼（例外只有 logo 的底色、漸暗用的黑與範本裡的白字）。
- `images` 把字套進範本 `card.html`（範本，不是網站的頁面），交給本機 Chrome 截圖（預設是 macOS 的 Google Chrome，用環境變數 `CHROME_PATH` 換）。名稱只能一行、說明最多三行（只在標點與空格斷行），字型（Noto Sans TC、Noto Color Emoji）沒從 Google Fonts 載進來也算錯：放不下就報錯並列出是哪幾張、不產生任何圖，不會默默縮字或換字型。
- 每個 PNG 的 `tEXt` 區塊（keyword `ff14tw-source`）記著畫它的內容的 SHA-256：`images` 只重畫缺的、壞的、尺寸或雜湊對不上的圖（重跑不會把 25 張全部改一遍），也會刪掉 `assets/images/og/` 裡不屬於這 21 張的 PNG；測試照現在的內容重算雜湊，所以忘了重跑 `images` 會失敗。
- 4 張圖示從 logo 原檔（`assets/images/ff14tw-logo.png`，1024×1024，不修改）縮出來。留邊版 `icon-maskable-512.png` 把 logo 縮成 84% 放中間、四周補 logo 的底色：Android 會把圖示裁成圓形或圓角方形，外圈金色圓與字樣才不會被裁到。
- manifest：從哪一頁加到主畫面就打開那個工具。工具頁用自己目錄的 manifest（`start_url` 與 `scope` 是那個工具，`short_name` 是登錄表的 `name`），攻略的 7 個主題頁用 `tools/guide/` 的，其他頁與 404 用根目錄的。`display` 是 `browser`：打開還是有網址列的一般分頁。
- 網址列顏色是 `tokens.css` 的 `--color-browser-bar`（頁首漸層的起點色），只給 `<meta name="theme-color">` 與 manifest 的 `theme_color` 用：HTML 寫淺色的值（聊天 App 不執行 JS，看到的就是它），`assets/js/common.js` 的 `ThemeManager.syncBrowserBar()` 在每次套用主題時從 CSS 讀它寫回（JS 不寫色碼），手機瀏覽器上方的顏色因此跟著深色模式換。
- 新增頁面：工具以外的新頁面加進 `site.mjs` 的 `ROOT_PAGES`，新的攻略主題加進 `GUIDE_TOPICS`，新工具加 `TOOL_COLORS`（底色和白字的對比要 ≥ 4.5:1）；`tests/share-preview.test.js` 寫死了數量（25 頁、13 個工具、21 張預覽圖、14 個 manifest）、`EXPECTED_TOOL_COLORS` 與 `EXPECTED_GUIDE_TOPICS`，要照新的數字更新。
