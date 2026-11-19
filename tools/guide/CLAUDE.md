# 攻略資料（tools/guide/）

8 個頁面（攻略首頁加 7 個主題）都不載入資料檔。這裡只記讀程式碼看不出來的原因與要一起改的地方。

- 專屬陸行鳥文章裡的 `h2#color-calculator` 要留著：以前分享出去的連結停在這裡，下面只剩一張連到陸行鳥染色計算器的卡片。
- 用語照 `TERMINOLOGY.md`：Free Company 是「部隊」，但檔名 `guild.html` 與 `guide_toc_guild` 等翻譯鍵不改（以前的連結照樣能用）；Guildhest 是「公會令」，「公會」只能出現在「公會令」裡（`tests/guide-pages.test.js` 會擋）；「艾歐澤亞」；主屬性 Dexterity 是「靈巧」。
- 目錄的「手機」是 `MOBILE_QUERY`（`(max-width: 768px), (max-height: 500px)`）：包括橫放的手機（寬度超過 768px 但高度 500px 以下，例如 844×390），電腦版的 sticky 側欄放不下整份目錄，會變成要在框裡捲的框。高度超過 500px 的電腦視窗比整份目錄矮時，側欄仍會在框裡捲，這是 main 上就有的電腦版行為（反目標只管手機）。視窗跨過斷點時焦點在目錄裡就維持打開，不然焦點會掉到頁面最上面。

## 寫好撰寫中的主題時

部隊、副本、風脈、探索筆記 4 頁還沒有內容。寫好其中一頁（`guild.html`、`dungeon.html`、`aether.html`、`sightseeing.html`）時，下面幾處要一起改：

- 那一頁自己：拿掉 `<meta name="robots" content="noindex">`，meta description 改成真正的摘要（不再寫「撰寫中」），內文換成真正的內容（不再是 `guide_coming_soon` 那一句）
- 改了那一頁的 `<title>` 或 meta description：要重跑 `node scripts/share-preview.mjs pages` 與 `node scripts/share-preview.mjs images`，因為那一頁的預覽標籤與它的預覽圖 `assets/images/og/guide-<檔名>.png`（例如 `guild.html` 的是 `guide-guild.png`）都照抄這兩段字；忘了跑，`tests/share-preview.test.js` 會失敗
- `tools/guide/sidebar-template.js` 的 `ITEMS`：拿掉那一項的 `pending: true`（目錄裡的「撰寫中」標籤就是靠它畫的）
- `tools/guide/index.html`：拿掉那一張卡片的「撰寫中」標籤（`span.guide-card-pending`）
- 首頁攻略卡片的 `status_guide_pages_pending`（「部隊、副本、風脈、探索筆記 4 頁撰寫中」）：`assets/js/i18n/translations/index.js` 的三語、根目錄 `index.html` 的預設文字，以及 `tests/home-page.test.js` 釘住的字串一起改，4 頁都寫完就拿掉這一行；沒有測試把它和 `PENDING` 對照，要自己記得改
- `tests/guide-pages.test.js` 的 `PENDING`：拿掉那一頁；寫的是部隊那一頁時，「部隊」測試裡檢查首頁 `status_guide_pages_pending` 還寫著部隊、Free Company、フリーカンパニー 的幾行也要跟著改
- 寫的是副本那一頁時，「4 個空頁」測試裡只給副本頁的那一段也要一起處理：`dungeon.html` 的 meta description 要提到副本資料庫、內文要有「想查副本，可以先用〈副本資料庫〉。」那一句（前後各一個 `guide_dungeon_db_prefix`／`guide_dungeon_db_suffix` 的 `span`，中間是連結），以及這兩個鍵的三語值。新內容不留這一句，就把那一段與翻譯檔裡的兩個鍵一起拿掉；留著就照新內容改
