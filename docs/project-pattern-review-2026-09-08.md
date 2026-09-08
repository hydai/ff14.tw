# 專案 patterns／anti-patterns 掃描紀錄

掃描日期：2026-09-08。基準 commit：`e909237`。

檢查範圍涵蓋 12 個工具、共用 JavaScript／CSS／i18n／layout、Cloudflare Worker 與環境設定、JSON 資料使用路徑、維護腳本、6 份測試與 GitHub workflow。主要缺口集中在跨模組契約、資料模型、非同步狀態及行為測試。

以下保留 14 項有具體證據的缺陷：4 項 P1、10 項 P2。P1 建議優先修復，涉及主要流程中斷、資料遺失或權限失效；P2 為特定環境、輸入或操作下的功能錯誤。這是目前版本的專案掃描，不限定最近一次變更引入的問題。

初次掃描只新增報告；以下缺陷描述、行號及 45 項測試是基準 commit 的歷史紀錄。使用者隨後指示開始修復，完成狀態如下。既有 `docs/superpowers/` 未追蹤文件保持原狀。

## 修復結果（2026-09-08）

14 項確認缺陷均已修正，以下為本機驗證結果；正式部署另行執行。行為測試由 6 份增至 15 份，`node --test` 共 **108 項通過、0 失敗**；執行需 Node 24，先 `npm --prefix api ci` 安裝 Worker 測試 runtime。

| 原項目 | 完成內容 | 回歸測試 |
| --- | --- | --- |
| 1、2、3、5 | 寶圖改用 ListManager；每房間 SQLite Durable Object 原子套用操作、私人 token 驗證、重試去重、revision 合併；逐環境 bindings | `treasure-room-api`、`treasure-room-client`、`room-map-sync` |
| 4、6、7、12 | 採集備份共用巢狀驗證與原子匯入；通知功能降級；區間／跨日／全天時間解析；原始清單名稱與搜尋 | `timed-gathering-behavior` |
| 8 | 水果完整 RGB 效果、整數配方與餵食順序；全部 7,225 組色對驗證 | `chocobo-calculator` |
| 9 | 宗長改用候選提示，找到後清除其餘候選，支援復原與語言重繪 | `faux-hollows-probability` |
| 10、11 | 角色主資料先顯示；選用端點獨立失敗；角色、公會、成就、會員分頁綁定查詢 context | `lodestone-requests` |
| 13 | i18n 讀寫儲存失敗仍可初始化、更新語言與通知訂閱者 | `i18n-storage` |
| 14 | 天氣分享網址、hash 導覽與重置共用完整畫面更新 | `weather-state` |

獨立審查另補上寶圖連線期間禁止覆寫、儲存歷史失敗不阻斷同步、遲到回應不恢復舊 session、離隊與輪詢競態，以及連線回覆遺失後的新本機編輯保護。重試沿用原始請求，本機差額在採納 session 時轉成操作；容量衝突仍保留本機清單。

驗證包含真正 Miniflare/workerd 的 Worker API、兩個本機瀏覽器的協作與重載恢復、採集 UI 下載備份後重新匯入及無 Notification 初始化、天氣 hash／reset、陸行鳥、宗長與 mocked Lodestone DOM 流程。Worker development／production dry-run、`actionlint`、`git diff --check` 均通過。開發依賴透過限定 Miniflare 範圍的 Undici 同主版修補，`npm audit` 為 0 vulnerabilities。

新增 [.github/workflows/test.yml](../.github/workflows/test.yml)，於 push／PR 執行全套測試與兩環境 dry-run。README、CLAUDE.md、API 文件與 changelog 已同步。

**上線注意：**前端與 API 必須配合更新；新房間套用 SQLite Durable Object migration，舊 KV 房間只讀至原 TTL 到期，寶圖保留本機後可重建隊伍，詳見 [API 遷移說明](../api/SECURITY.md)。本次沒有部署或操作正式 API；Lodestone 外部錯誤以本機 mock 驗證，陸行鳥是平均 RGB 模型，未在遊戲內驗證隨機餵食結果。


## 優先修復

### 1. P1：寶圖清單重構後，建立／加入隊伍仍呼叫舊介面

位置：[room-collaboration.js](../tools/treasure-map-finder/room-collaboration.js) 第 213、310 行；[主控制器](../tools/treasure-map-finder/script.js) 第 7 行。

`TreasureMapFinder` 現在把清單交給 `listManager`，協作模組卻仍讀 `this.finder.myList.length`，後續還使用已不存在的 `myListIds`、`saveToStorage()`。新使用者按建立隊伍，或輸入有效房號加入，會在發送 API 前發生 `Cannot read properties of undefined (reading 'length')`。

**驗證：**以實際兩個 class 的 prototype 和目前的 `listManager` 介面呼叫建立／加入；兩者均失敗，API 呼叫次數為 0。

**建議：**協作模組改用明確的清單操作介面，完整遷移讀取、清空、同步與儲存呼叫。加入建立／加入的跨模組測試，避免只測各 manager 自身。

### 2. P1：房間以整份快照覆寫，並行操作會遺失資料

位置：[treasure-room-worker.js](../api/treasure-room-worker.js) 第 122、127、268、293–297 行；[前端同步](../tools/treasure-map-finder/script.js) 第 1328 行。

join、leave、remove-member、update 都先讀 room，再修改本機副本並整份寫回。前端也上傳整份寶圖清單，沒有版本檢查。兩個操作讀到同一份資料時，後寫入者會覆蓋前一個操作。

**驗證：**本機 KV 替身讓 Alice、Bob 同時讀取只有房主的房間；兩個 join 都回 `200`，最終成員卻只有 `Creator, Bob`，Alice 遺失。此測試證明程式的 lost update；沒有宣稱觀察到正式站資料遺失。KV 本身也不提供此流程需要的原子交易一致性。[Cloudflare KV consistency 文件](https://developers.cloudflare.com/kv/concepts/how-kv-works/)

**建議：**每間房由 Durable Object 或具原子條件更新能力的儲存處理變更；前端傳新增／移除操作並帶 revision。只在目前的 KV read-modify-write 前加版本比較，仍無法保證比較與寫入的原子性。

### 3. P1：公開 ID 被當作房主憑證

位置：[treasure-room-worker.js](../api/treasure-room-worker.js) 第 213、350、364 行。

GET 房間公開完整 `creatorId` 與 member IDs；移除成員只檢查客戶端提供的 `requesterId === creatorId`。知道房號的人可以取得這個值，再冒用房主移除成員。這與協作規格要求的房主專屬權限不符。

**驗證：**對本機 Worker 直接 GET 房間，把回傳的公開 ID 放入 `/remove-member`；未持有任何 session 即得到 `200`，被指定的成員確實被移除。未操作正式 API。

**建議：**把公開識別碼與私密操作憑證分開；建立／加入時只把成員 token 回傳給本人，伺服器以 token 驗證操作身分與權限。公開房間回應不得包含該 token。Origin 白名單無法代替身分驗證。

### 4. P1：採集工具無法匯入自己產生的備份

位置：[script.js](../tools/timed-gathering/script.js) 第 935 行；[list-manager.js](../tools/timed-gathering/list-manager.js) 第 460–464 行。

`exportLists()` 產生的 `lists` 是以清單 ID 為 key 的 object，但匯入 schema 要求 array。使用者匯出後立刻匯入同一檔案就會被拒絕，影響備份還原。

**驗證：**實際執行 `exportLists()` → `importFile()`，得到 `Field lists must be of type array`，未進入 `importLists()`。

**建議：**儲存、匯出、匯入共用有版本的資料契約，驗證巢狀清單與項目；加入包含實際清單資料的 export/import round-trip 測試。時間欄位也應統一：目前匯出用 `exportedAt`，schema 寫 `exportDate`。

## 其他確認的功能缺陷

### 5. P2：具名 Worker 環境缺少 KV binding

位置：[wrangler.toml](../api/wrangler.toml) 第 20、25 行。

`TREASURE_ROOMS` 只宣告在頂層，`production`、`development` 沒有各自的 binding。依文件使用 `--env production` 時，該環境無法取得房間儲存。

**驗證：**使用專案已安裝 Wrangler 的設定解析器，default 有 `TREASURE_ROOMS`，production／development 的 `kv_namespaces` 均為空陣列；解析器也發出 bindings 不繼承的警告。這是 repository 設定的問題，未查核正式部署是否另行設定 binding。[Cloudflare 環境繼承文件](https://developers.cloudflare.com/workers/wrangler/environments/)

**建議：**逐環境宣告 bindings，對齊 npm scripts、環境變數、前端 API URL 和部署文件；加入只讀的環境設定檢查。

### 6. P2：缺少通知 API 會中斷整個採集工具初始化

位置：[script.js](../tools/timed-gathering/script.js) 第 91、326 行；[notification-manager.js](../tools/timed-gathering/notification-manager.js) 第 791 行。

通知模組已處理不支援的環境，但主控制器再次直接讀 `Notification.permission`。全域 `Notification` 不存在時，初始化會在載入清單與顯示資料之前拋錯，即使用者根本沒有啟用通知。

**驗證：**不提供 `Notification` 的 VM 中，通知模組正常回傳「瀏覽器不支援通知」，控制器卻拋出 `ReferenceError: Notification is not defined`。

**建議：**通知模組回傳 `{supported, permission, enabled}` 等結構化狀態，UI 只渲染結果；通知不可用時其餘採集功能仍須初始化。

### 7. P2：時間表示不一致，3 筆現有資料產生無效鬧鐘巨集

位置：[macro-exporter.js](../tools/timed-gathering/macro-exporter.js) 第 148 行；[timed-gathering.json](../data/timed-gathering.json)。

巨集只理解 `HH:MM`；不匹配時直接移除第一個冒號，卻未處理資料中的時間區間與「全天」。

**驗證：**以實際 65 筆資料呼叫 `generateAlarmCommand()`，確認雷電石英產生 `et rp 0000-04:00`、菖蒲根產生 `et rp 1600-20:00`、紫色舌尖產生 `et rp 全天`。這些輸出不符合時間參數格式。

**建議：**資料進入程式時解析成開始時間、結束時間與全天狀態；巨集採用開始時間，全天項目跳過或明確提示。通知、排序和顯示共用同一個解析結果。

### 8. P2：陸行鳥配方將 RGB 通道錯當成互不影響

位置：[chocobo-color-calculator.js](../tools/guide/chocobo-color-calculator.js) 第 219–226 行；[chocobo-colors.json](../data/chocobo-colors.json) 第 92 行起。

算法依各通道差值分別計算 `ceil(abs(diff)/5)`，水果資料也把其餘通道效果寫成 0。然而水果效果會同時改變其他通道，獨立計算不能得到有效配方。

**驗證：**沙漠黃→素雪白，本地產生沙果 2、油梨 9、漿果 25。對照資料檔所引用網站的公開原始 `Calculator.js`，相同 RGB 輸入得到青梅 16、醋栗 13、鳳梨 5；來源算法同時計算各通道效果。這是算法／來源對照，未在遊戲中逐一餵食驗證。[來源網站](https://ffxivchocobo.com/)、[公開 source map](https://ffxivchocobo.com/static/js/main.9e9847d3.chunk.js.map)

**建議：**校正水果完整 RGB 效果，算法直接使用該資料，避免另寫一份硬編碼對照；以已知配方與餵食後 RGB 建立回歸案例。

### 9. P2：宗長候選位置比例被呈現為實際出現機率

位置：[faux-hollows-foxes/script.js](../tools/faux-hollows-foxes/script.js) 第 257、270–271、1176 行；[board-data.js](../tools/faux-hollows-foxes/board-data.js) 第 10 行。

`FOX_OR_EMPTY` 代表宗長「或空格」，目前計算卻把它當作必有宗長，除以符合盤面數後顯示 `狐:100%`。程式自身又限制每盤最多一隻宗長。

**驗證：**以 0-based index 設障礙物 9、13、16、28、30；寶箱 4；劍 25、26、27、31。只有 5 次揭格且剩 1 個符合盤面，0、3、23、29 卻同時顯示 100%。第 6 次揭開 0 為宗長後，其他三格仍為 100%。

**建議：**明確區分「候選位置比例」與「實際出現機率」；已找到宗長後清除其他提示。若要顯示實際機率，需另有來源支持的機率模型，不能直接假設每個候選位置等機率。

### 10. P2：Lodestone 選用資料失敗會拖垮主要角色查詢

位置：[lodestone-lookup/script.js](../tools/lodestone-lookup/script.js) 第 210、256–258 行。

角色、職業、成就、坐騎、寵物五個請求綁在同一個 `Promise.all`。任一選用端點網路失敗會讓整次查詢失敗；職業 JSON 解析失敗則直接 `return`，連有效的角色資料都不顯示。

**驗證：**角色端點成功，僅坐騎端點拒絕時，角色渲染次數為 0 且出現錯誤；職業端點回非 JSON 時，角色渲染次數同樣為 0，連錯誤訊息都沒有。請求均使用本機 mock。

**建議：**必要角色資料與選用區塊分別處理。選用請求可個別 catch 或使用 `allSettled`；錯誤狀態限制在該區塊，並保留已有角色資料。

### 11. P2：Lodestone 較舊查詢會覆寫較新的結果

位置：[lodestone-lookup/script.js](../tools/lodestone-lookup/script.js) 第 101、308、833 行。

載入時只停用搜尋按鈕，輸入框 Enter 仍會啟動新查詢。回應更新 DOM 前沒有確認目前 ID／DC／請求世代，因此較慢的舊請求可覆蓋新角色。

**驗證：**先搜尋 111，再搜尋 222，讓 222 先回覆。實際 `searchCharacter()` 的渲染順序為 `222 → 111`，最後輸入框為 222，畫面卻顯示 111。

**建議：**每次搜尋建立 request generation，子請求共用該查詢上下文；寫入 DOM 前確認仍屬目前查詢。可以額外中止舊請求，但保留結果歸屬檢查。

### 12. P2：在資料輸入階段做 HTML escaping，污染清單名稱

位置：[timed-gathering/script.js](../tools/timed-gathering/script.js) 第 685、732、738 行；[security-utils.js](../assets/js/security-utils.js) 第 143 行。

清單名稱先經 `sanitizeInput()` 轉成 HTML entities，再儲存並交給 `textContent` 顯示。輸入 `A&B`，頁籤實際顯示 `A&amp;B`；重新命名時又可能再次編碼。DOM 使用 `textContent` 時已將內容視為純文字，這一層轉換會破壞資料。

**驗證：**在本機 Chromium 實際新增 `A&B` 清單，讀取頁籤 `textContent` 得到 `A&amp;B`。截圖位於本次 session 的 `/tmp/ff14-pattern-review-evidence/list-name-before.png`、`list-name-after.png`。

**建議：**儲存與搜尋使用原始文字，邊界只驗證長度／型別；輸出時選擇適合情境的安全 DOM API。不要用通用 HTML escaping 同時處理儲存、搜尋與顯示。

### 13. P2：i18n 將可選持久化變成必要依賴

位置：[i18n-manager.js](../assets/js/i18n/i18n-manager.js) 第 70、162–169 行。

初始語言讀取與切換語言的 localStorage 存取都沒有錯誤處理。讀取受限時，整個 `window.i18n` 建立失敗；寫入超出配額時，`currentLanguage` 已改變，畫面及訂閱者卻還保留舊語言。

**驗證：**讀取拋錯的 VM 中 `window.i18n` 不存在；寫入拋錯時 `currentLanguage === 'en'`，但渲染與 observer 通知均未執行。共用 `ThemeManager` 已有儲存失敗 fallback，可作為一致化起點。

**建議：**語言在記憶體中正常切換，持久化失敗獨立處理；讀取失敗回退至瀏覽器偏好。抽取共用 Storage adapter，明確區分成功、缺值、無法存取與壞資料。

### 14. P2：天氣 URL hash 更新狀態，卻沒有更新畫面

位置：[weather-store.js](../tools/weather-forecast/weather-store.js) 第 257–262 行；[script.js](../tools/weather-forecast/script.js) 第 298 行。

hash 載入流程透過 `setState()` 發出 `'state'` 事件，但控制器 `handleStateChange()` 沒有對應 case。同頁 fragment 導覽到另一地區時，模型已換地區，畫面仍保留舊結果。

**驗證：**實際 store subscriber 串接控制器 handler，hash 從 `#limsa-lominsa` 改為 `#gridania`；store 的 `zoneId` 已為 gridania，UI 更新呼叫卻為空陣列。

**建議：**所有狀態來源共用完整渲染入口，或為完整 state change 定義明確處理；一起同步地區選取、天氣條件、時間範圍與結果。

## 值得延伸的 patterns

以下是結構改善建議，不另計為確認缺陷：

1. **先定義模組契約，再重構呼叫端。** 清單資料由 ListManager 擁有，協作與 UI 透過少量公開方法操作。對照問題 1、4，優先建立跨模組與備份往返測試。
2. **在資料邊界統一解析與驗證。** 採集時間、清單備份、Worker 更新資料採共同 schema／normalizer。現有 `safeJSONParse()` 成功不等於巢狀資料有效；本機也確認 Worker 會把 `treasureMaps: {}` 當成功更新儲存。應在儲存前拒絕不符合契約的資料。
3. **讓可選功能獨立失敗，讓非同步結果有歸屬。** 通知、持久化、坐騎等資訊各有失敗狀態；查詢採世代編號，分享 URL 與 UI 共用 state 更新入口。對應問題 6、10、11、13、14。
4. **將計算與 DOM 分離，建立可驗證的領域模型。** 延伸目前 `conversion-engine.js`、`time-calculator.js` 的做法，讓配方、機率、時間轉換能直接輸入資料並檢查輸出；避免測試必須先偽造整個頁面才能執行算法。對應問題 7–9。
5. **保留既有規則測試，補足行為測試並接到 CI。** `tests/scripts.test.js`／`design-system.test.js` 等規則守門有用，但抓不到以上跨模組失效。目前 `.github/workflows/claude.yml` 是提及 Claude 時觸發的工作流程，沒有每次 PR 執行 `node --test` 的 workflow。優先加入本報告的契約、並行、錯誤隔離與結果順序案例，再設定 PR 自動執行。

## 驗證紀錄與限制

- `node --test`：45 項通過、0 失敗。
- 23 個玩家 HTML 頁面的本地 `src`／`href` 目標檢查：沒有遺失檔案。
- 寶圖協作的介面、並行與權限重現：`node /tmp/ff14-room-audit.mjs`。
- 採集／天氣重現：`node /tmp/ff14-time-weather-review.cjs`。
- 配方／宗長／Lodestone 重現：`node /tmp/ff14-tools-pattern-repros.cjs`，陸行鳥對照依賴本次下載的 `/tmp/ff14-chocobo-upstream.map`。
- 上述重現腳本由原始程式搭配最小 DOM／網路／KV 替身執行，主線已重跑確認；它們是本次 session 暫存證據，尚未加入 repository 測試套件。
- 瀏覽器驗證使用獨立 Chromium session 與本機靜態伺服器，確認清單名稱顯示錯誤。沒有對每個工具的所有流程進行端到端測試。
- 沒有呼叫正式房間 API 進行變更、部署 Worker、檢查雲端帳號設定，或進行完整遊戲資料正確性／依賴漏洞稽核。未列為缺陷的模組不代表已證明沒有問題。
