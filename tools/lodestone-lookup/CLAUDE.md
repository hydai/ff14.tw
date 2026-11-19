# Lodestone 角色查詢（tools/lodestone-lookup/）

這裡只記讀程式碼看不出來的原因與限制。

- 只限國際版角色：繁中服的角色本來就不在 Lodestone 上（首頁卡片標「僅限國際版角色」），所以共用資料的 `FF14_TC_WORLDS` 這一頁用不到。
- 資料來自 logstone Worker（hydai/logstone，另外部署，手動 `wrangler deploy`；端點與回應格式見 logstone 的 README）。Worker 只接受 ff14.tw 的請求（`Origin`／`Referer` 檢查）。網站的測試一律用假資料，不連正式的 Worker，也不連 Lodestone 官網。
- 上線順序：Worker 先部署，網站的 PR 再合併。網站也要能接舊版的 Worker：舊 Worker 沒有搜尋端點，它的 404 沒有 CORS 標頭，瀏覽器擋下請求、`fetch` 丟例外，所以把這種情況當成「搜尋不能用」並給到 Lodestone 官網搜尋的連結；沒有 `ActiveClassJob`（用官網的圖示加等級）、`FetchedAt`（不寫資料時間）、`Gear`（寫「沒有裝備資料。」）與部隊名稱（標頭只寫「部隊」，部隊分頁載入後補上）時各有退路。
- 名稱與成就顯示 English／日本語取代以前的「北美／日本資料中心」，對到 Worker 的 `dc=na`／`dc=jp`：兩邊是同一份角色資料，差別只在回來的文字是英文還是日文。
- 角色名字、稱號、成就、坐騎、寵物、部隊是官網原文，不翻譯；職業名稱用共用的 `assets/js/ff14-game-data.js`，大國防聯軍、部隊活動重點與招募對象、聲望與開始城市在 `lodestone-data.js` 的 `LODESTONE_TERMS`，只有中文介面換成官方繁中，認不得的原文照舊。Beastmaster 沒有官方中文名稱，顯示原文。
- 裝備分頁只有每一格的圖示與染色：Lodestone 的角色頁沒有裝備名稱（頁面也寫明）。
- 職業的格子放寬到每種語言最長的名稱連同圖示與等級放得進一行，名稱放不下時換到第二行、不截斷。手機第一個畫面的量測（390×844 三種語言都看得到標頭與第一組職業，320×568 要捲一下）只在 Chrome 量過，沒有自動測試守住。
