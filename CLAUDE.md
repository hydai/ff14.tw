# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FF14.tw is a multi-tool website for Final Fantasy XIV players in Taiwan, providing various utilities like character card generators, dungeon database, and game calculators. The project uses a vanilla web stack with a modular architecture where each tool is self-contained within the `tools/` directory.

## Architecture

- **Static Website**: Pure HTML/CSS/JavaScript with no build tools, bundlers, or frameworks
- **Multi-Tool Structure**: Each tool is completely self-contained in its own directory under `tools/`
- **Shared Resources**: Common utilities in `assets/` (CSS variables, utility functions, constants, and the job and world lists in `assets/js/ff14-game-data.js`: `FF14_JOBS` (34 jobs, official names in zh/en/ja), `FF14_WORLDS` (11 international data centers and 85 worlds), `FF14_TC_WORLDS` (the 6 Traditional Chinese worlds); the character card reads all three, the Lodestone lookup reads only `FF14_JOBS` and `FF14_WORLDS` because Lodestone has no Traditional Chinese worlds)
- **Data Management**: JSON files in `/data/` directory for large datasets (dungeons, treasure maps, translations)
- **Language**: Traditional Chinese (zh-Hant) - all UI text and content
- **I18n Support**: Multi-language support (zh/en/ja) via I18nManager
- **Deployment**: GitHub Pages with custom domain (ff14.tw via CNAME)

## Project Statistics

- **HTML Files**: 26 total — 20 across 13 tool directories (12 single-page tools + `guide/` with 8 pages) + 5 root pages (`index.html`, `about.html`, `changelog.html`, `copyright.html`, `404.html`) + 1 API test harness (`api/test.html`)
- **JavaScript Files**: 179 total — 59 tool scripts + 9 shared utilities (`assets/js/`) + 19 i18n (manager + translations) + 4 layout components (`assets/js/components/`) + 70 test files (`tests/*.test.js`) + 17 test helpers (`tests/helpers/`, not test files) + 1 Cloudflare Worker (`api/treasure-room-worker.js`); plus 4 Node build scripts (`scripts/*.mjs`) and the 4 modules of `scripts/share-preview/` with its preview card template `card.html` (not counted in the HTML files), none of them part of the site
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
- 陸行鳥染色計算器 (`chocobo-color/`) - loads `/data/chocobo-colors.json`

Tools that need a local server for another reason:
- 角色卡產生器 (`character-card/`) - 不載入資料檔，但用 `file://` 直接開時，卡片上的職業圖示會讓瀏覽器把 canvas 當成跨來源而不讓它轉成圖（`toBlob` 丟 `SecurityError`）：預覽與欄位照常、也照常記住，但產生不出圖。下載與分享都要先轉成 PNG，失敗時跳「沒辦法產生圖片，請再試一次。」；複製圖片失敗時跳「沒辦法複製，請改用下載。」。用本機伺服器開就沒有這個問題。只有下載實際在 Chrome 量過（`file://` 失敗、用 http 開的對照組正常）；分享與複製是照程式的流程推得的：這兩條路也都要先把 canvas 轉成 PNG，`toBlob` 丟錯就走到上面寫的失敗訊息

Tools that work without server (can open HTML directly):
- 仙人微彩計算機
- Wondrous Tails 預測器
- 宗長計算機
- 檢舉模板產生器
- 天氣預報
- 攻略資料 (`guide/`)（8 個頁面都不載入資料檔；染色計算器已經獨立成陸行鳥染色計算器）

**Testing:** Node 24；先執行 `npm --prefix api ci` 安裝 Miniflare/workerd，再執行 `node --test`（Node 內建 test runner，自動執行 `tests/*.test.js`）。`tests/design-system.test.js` 守住設計系統規則（token 完整性、對比度、token-clean 檔案清單，以及搜尋命中的底色 `--color-mark` 在卡片上看得出來、標出來的字一律用標題色）；`tests/pages.test.js` 守住每一頁的 CSS 載入順序（`tokens.css` 在 `common.css` 之前）與字型，以及有頁首的頁面（至少 23 頁）的 JS 載入順序：`tools-registry.js` 必須排在 `nav-template.js` 之前、`layout-loader.js` 必須排在 `common.js` 之前；`tests/timed-gathering-eorzea-time.test.js` 守住艾歐澤亞時間換算在不同時區下的一致性（時鐘一行用的 `TimeCalculator.getEorzeaTime()` 與卡片、提醒用的 `GatheringMaterials.etMinutes()` 在四個時區都算出同一個 ET）；`tests/scripts.test.js` 守住 `assets/`、`tools/` 底下的 JS 不得使用 `innerHTML`；`tests/docs.test.js` 守住 CLAUDE.md／README 的副本數、寶圖座標數與 JSON 資料檔案數這幾個關鍵統計數字不會與 `/data` 底下的實際資料脫節；`tests/modal-manager-stack.test.js` 用最小 DOM 替身（不需 jsdom）守住 `ModalManager` 的共用堆疊行為：只有最上層回應 Escape／焦點陷阱、關閉下層時由上而下連鎖收合、焦點依序回捲。新增行為測試涵蓋寶圖前後端契約、SQLite Durable Object 並行與權限、備份還原、通知降級、時間解析、陸行鳥染色的全部 7,225 組色對（`tests/chocobo-color-solver.test.js`）、宗長只放 🦊 不寫數字、Lodestone 角色查詢的請求競爭（`tests/lodestone-page.test.js`）與 i18n 儲存。`tests/design-system.test.js` 另守住按鈕與輸入框的 `min-height`（flex 直排時不被壓扁），以及三個猜謎方格工具（宗長計算機 36 格、Wondrous Tails 16 格、仙人微彩 9 格）的格子都是 `<button>`（沒有 `tabindex="-1"`，所以都能用 Tab 鍵移動焦點）；`tests/treasure-route-aetherytes.test.js` 守住每個有寶圖的地區都能算出傳送點；`tests/treasure-filters.test.js` 守住寶圖的等級／地區篩選：選取規則（地區依所選等級列出並附張數、取消等級時連帶取消只屬於它的地區）、記住與還原（網址 `grade`／`zone` 優先於 `localStorage`，保留 `room`，`localStorage` 不能用時照常運作），以及用 `fake-dom.js` 檢查 chip 的畫面與鍵盤焦點；`tests/treasure-find-page.test.js` 用 `fake-dom.js` 在 vm 裡執行寶圖頁，守住「選等級 → 選地區」流程、結果格與空狀態、步驟列與清單入口、卡片內容、複製的隊伍頻道句子（zh／en／ja）與詳細檢視（上一張／下一張、加入／移除、焦點）、每一張縮圖與每個地區的詳細地圖檔都在（227 張、28 個地區，地圖網址照詳細檢視真的組出來的），並檢查 `index.html`（資料來源的 7 行與 Game8 後面的冒號都由翻譯檔來，沒有寫死的字）、`style.css` 與三語鍵值的結構。寶圖清單與路線另有五份測試：`tests/treasure-list-manager.test.js` 守住瀏覽器封鎖網站資料時 `ListManager` 的加入、移除、清空、匯入照樣更新記憶體裡的清單並回報 `saved: false`；`tests/treasure-route-progress.test.js` 守住路線進度（站序與完成記號）的保存、12 小時過期與各種清掉規則；`tests/treasure-copy-format.test.js` 守住複製格式的三語預設範本（含在隊伍裡句尾接上主人的隊伍版）、變數替換（含 `<寶圖主人>`）、存檔（v2）與舊 `{ teleport, map }` 格式的轉換；`tests/treasure-list-share.test.js` 守住分享連結 `?maps=` 的產生、解析與從網址拿掉，以及匯入內容（連結或以前匯出的 JSON）的辨識；`tests/treasure-list-panel.test.js` 用 `tests/helpers/html-fragment.js`（取出 `index.html` 真正的標記）和真正的建構函式，守住清單頁、清空／匯入／分享三個頁內對話框、路線頁（站別與傳送、完成與進度、複製下一站與全部複製）與複製格式區塊，以及資料還在載入或載入失敗時，英日文介面的清單入口、清單頁標題與張數已經是那個語言（不會停在 `index.html` 的中文），入口右邊的「組隊」「生成路線」照舊藏著（事件還沒掛上）。清單面板的頁面替身（照 `index.html` 建出元素、載入頁面的腳本、取字自真正的翻譯檔）原本寫在這份測試裡，現在抽成 `tests/helpers/panel-page.js` 給組隊的測試共用，它的 `party` 選項可以接上真的 `RoomCollaboration`（只換掉 `request()`，不連伺服器），`data` 選項讓三份資料一直不回來（`'pending'`）或載入失敗（`'fail'`）。組隊另有兩份測試：`tests/treasure-party-names.test.js` 守住 `PartyNames`（預設名字的字串只用 31 個不易看錯的字元、3 碼、存一次一直用、存值壞掉就重新產生，英文預設名字剛好 20 字，自己改過的名字優先、舊版預設樣式不算，改名的三種存法，以及「誰的圖」四種情況與 `knownMembers` 的驗證）；`tests/treasure-party.test.js` 用 `panel-page.js` 守住隊伍狀態（三行、成員列表、每兩秒輪詢重畫不搶焦點）、建立／加入／離開／移出／改名的頁內對話框（錯誤寫在對話框裡、連線中停用、切換語言重畫）、邀請連結與「加入隊伍 X？」的四種情況和 `ready` 的時機、同步狀態（連續 3 次傳輸失敗才顯示「連不上，重試中」，不再跳 toast），以及三語鍵值與用語（翻譯檔的英文值不得出現 Room／Team、日文值不得出現ルーム／チーム、中文值不得出現「房間」）。天氣預報另有五份測試，共用的提醒排程另有一份，天氣頁的測試共用 `tests/helpers/weather-page.js`（取代 `weather-state.test.js` 原本內嵌的簡易替身，作法照 `panel-page.js`：用 `fake-dom.js` 照 `index.html` 建出 `#weatherTool`，依 `index.html` 的 `<script src>` 順序載入翻譯檔、共用的 `reminder-scheduler.js` 與工具目錄的每個腳本，再 `new WeatherForecast()`；取字自真正的翻譯檔，`Date.now` 與計時器由測試推進，`storageThrows` 讓光是讀 `localStorage` 就丟例外，`notification` 選項模擬通知權限（`default`／`granted`／`denied`／`unsupported`／`throws`／`dismissed`，`throws` 是 Android 的 Chrome：權限已允許但建構時丟錯，`dismissed` 是詢問被關掉：權限一直是 `default`），`AudioContext` 替身建出來是暫停的並記下排了幾聲提示音；這兩個替身寫在 `tests/helpers/notification-stubs.js`，和採集頁的替身共用）。`tests/weather-state.test.js`（用這個替身改寫）守住網址與頁面狀態：分享網址與 hash 導覽時地區、條件、時刻表一致，hash 變成無效或空的就回到第一次來的畫面、之後有效的 hash 照常還原，換期後時刻表自動往前推一期，「顯示更多」的列數換期保留、換地區回到 24 列，第一次來只有地區選單與說明，選地區後天氣只列這個地區會出現的，清除條件只清時段與前置天氣，切換語言選單換字、選取不變；`tests/weather-store.test.js` 在 vm 裡載入真正的 `zone-data.js` 與 `weather-store.js`，守住記住上次的選擇（`localStorage['ff14tw_weather_selection']`：地區、目標天氣、前置天氣、時段，特殊事件不存）與網址的先後：載入時有效的 hash（分享連結）優先並存成這次的選擇，hash 空的或無效就照記憶並寫回網址，都沒有才是第一次來（什麼都不寫），停留在頁面上 hash 變無效或清空仍然重設畫面，但不讀也不清記憶；另守住 `hashOf()` 的規則（天氣索引排序、結果能原樣讀回）、`clearConditions()` 只清前置天氣與時段、壞掉或過期的記憶，以及 `localStorage` 讀、寫或光是存取就丟例外時照常運作；`tests/weather-answer.test.js` 守住 `WeatherAnswer`（純函式，不碰 DOM）：`occurrences()` 把連續的同一種天氣合成一段、相鄰的不同天氣不合併、依時段裁剪（一段裡不相連的兩塊各算一次）、套用前置天氣、只選特殊事件時事件就是目標、正在進行的排第一個而且不論現在落在哪裡它的 `start`／`end` 都不變（提醒靠 `start` 分辨是哪一次）、60 天內開始的整段都列、只掃到夠用為止（提醒每秒都會算），以及 `waitParts`／`dayOffset`／`etHours`／`clip`；`tests/weather-page.test.js` 守住答案卡與右欄：記住的選擇一打開就是下次的答案卡，正在下時是綠色卡（到幾點、還剩多久、下一次），時段裁剪的寫法，60 天內沒有符合的時段，只選地區時寫現在的天氣，分鐘一變只換字不重建，等到那一段開始或電腦睡著醒來後直接是現在的（設了時段時，在一分鐘中間開始或結束的那一刻就換），切換語言，「之後幾次」先列 5 次、「顯示更多」加倍到 50 次（換期保留，換目標或地區回到 5，到上限時焦點移到標題），過了午夜今天／明天跟著換；並檢查頁面上每一個用 `hidden` 切換的元素在 `style.css` 都有 `#id[hidden] { display: none; }`（`fake-dom.js` 看不出設了 `hidden` 卻沒藏起來：`.card`、`.btn` 等共用樣式設了 `display`，會蓋過瀏覽器內建的 `[hidden]`）；`tests/weather-reminder.test.js` 守住 `WeatherReminder`（提早分鐘數、`localStorage['ff14tw_weather_reminder']` 的存取與壞掉內容的修正、`alerts()` 不丟例外）和頁面上的「提醒我」：按下時才問通知權限但不等回答就設好，權限被拒或不支援時照樣設好並寫出只有頁內提示和聲音，到時間的頁內提示、提示音與系統通知同一次只響一次，來不及提早時改在開始時提醒，提早 30 分鐘而前一次還沒結束時之後的一次照樣在開始前 30 分鐘提醒，前一次要等到開始、之後一次的提醒時間比它早時「幾點提醒」寫先響的那一次，提早 30 分鐘時接下來兩次都響過、再改成提早 1 分鐘時「幾點提醒」往後找還沒響的那一次，晚到的提醒標題寫實際還剩幾分鐘，換地區、換天氣、打開別的 hash 都不取消（答案卡上方多一行「提醒中」），在別的目標上按就換成新的，另一個分頁取消或新增時畫面跟著變，瀏覽器封鎖網站資料時這次打開期間照樣會提醒，重新整理後還原的提醒要等頁面上的點擊或按鍵才解開提示音，並檢查提醒的標記、腳本順序與這一頁唯一的 `.btn-primary`（`#remindBtn`）；`tests/reminder-scheduler.test.js` 是共用 `ReminderScheduler`（`assets/js/reminder-scheduler.js`，不認識任何工具）的測試，守住到期的判斷（提早 `leadMs`，設定時已在提早範圍內就等到開始，設定時已經開始的那一次不補）、已提醒的紀錄（每一次各存一個 `localStorage` 項目，名字是 `notifiedKey|id`、值是 start；兩個分頁同一次只有一個會響，兩個分頁同時記下不同的兩次也不會互相蓋掉，讀寫丟例外或值壞掉時照樣只提醒一次，只留一天）、跨分頁的鎖（有 `navigator.locks` 時先用 `notifiedKey|id` 要鎖，拿到才提醒並再握住 5 秒，兩個分頁在寫回之前都讀到「還沒提醒」時也只響一次；要鎖被拒絕時照舊只靠紀錄；拿到鎖或被拒絕時照現在的提醒與時間重新確認還到期，等的時候改了提早分鐘數、換了目標、取消或那一段已經結束就不響也不記）、背景分頁晚到時補一次（整段都睡過去就不發）、每秒檢查與切回前景馬上檢查、`deliver()` 的頁內提示（8 秒後收起；一起到時間的好幾個提醒放進同一個 `.reminder-alerts` 容器，由上往下排開，不會互相蓋住）、提示音與系統通知互不影響（`AudioContext` 還在暫停時這次不排聲音）、權限（只有 `default` 才真的去問），以及 `tools-common.css` 的 `.reminder-alert` 排在 `.toast` 之後。特殊採集時間管理器另有四份新測試，另外兩份舊測試跟著改，採集頁的測試共用 `tests/helpers/gathering-page.js`（作法照 `weather-page.js`：用 `fake-dom.js` 照 `index.html` 建出 `#gatheringTool` 與對話框，依 `index.html` 的 `<script src>` 順序載入翻譯檔、共用的 `security-utils.js` 與 `reminder-scheduler.js` 和工具目錄的每個腳本，再 `new TimedGatheringManager()` 並等它載入完資料；取字自真正的翻譯檔，`Date.now` 由 `page.now` 控制，`tick(ms)` 把時間往後推並跑每個 `setInterval`（時鐘、提醒排程的檢查、卡片與提醒列的倒數），`runTimeouts()` 跑搜尋的防抖，`storageThrows` 讓光是讀 `localStorage` 就丟例外，`stored` 給 `localStorage` 的初始內容、`storageEvent()` 模擬另一個分頁改了它，`notification` 選項模擬通知權限（同天氣頁），`clipboard: 'reject'` 讓寫入剪貼簿被拒絕，`items` 換掉採集物資料，`narrow` 讓視窗在 480px 以下（`matchMedia('(max-width: 480px)')` 的替身）、`setNarrow()` 模擬視窗跨過 480px，`cards()`／`cardOf(key)` 找卡片；頁面在 console 留下的任何東西（log、warn、error）都記在 `consoleErrors` 而不印出來，所以期待它是空的測試也擋得住多出來的除錯訊息）。`tests/gathering-materials.test.js` 在 vm 裡載入真正的 `time-calculator.js` 與 `gathering-materials.js`，守住 `GatheringMaterials`（純函式，不碰 DOM、不讀時鐘）：`group()` 把資料的 65 筆合成 34 種素材（key 是 id 去掉結尾的 `_數字`，兩個時段的照開始時間排）；`state()` 在時段裡是 `now`（到這一段結束）、不在是 `next`（最近的下一段）、全天是 `allday`，跨午夜的區間（22:00-02:00 在隔天 01:00 還在裡面）從前一天起算，時段無效的排最後、不影響有效的，全部無效是 `none`；`upcoming()` 把兩個時段照開始時間合在一起，`nextAlarm()` 在正在可採時是再下一段，`compare()` 讓現在可採的剩比較久的在前、接著照還要多久、全天最後；`etTime`／`etRange`／`slots`／`realMinutes`／`countdown`／`minutesCeil`／`localTime` 這些文字零件；同一段不管從哪個現在算，`start`／`end` 都一樣而且是整數（提醒靠 `start` 分辨是哪一次）；`windowAt`／`nextWindow` 的 `start` 含、`end` 不含，ET 午夜整點歸在正確的那一天；並用逐分鐘掃描的對照組檢查每個 ET 分鐘的 `state` 與 `nextAlarm`。`tests/timed-gathering-search.test.js` 守住 `SearchFilter`：搜英文地區名稱（`Yak T'el`，大小寫都行）找得到雅克特爾樹海的 8 筆、搜英文地點名稱（`Mamook`）找得到瑪姆克的 6 筆；好幾個字時每個字都要符合（`Cordia Log` 只剩科迪亞原木的兩筆，以前是 10 筆，字的順序不影響），結果和不經過 `SearchFilter` 的對照組逐筆一致（中文、日文、英文名稱、座標、時間、等級與全形空白）；中、日、英文名稱搜到同樣的素材；分數照原本的權重（名稱完全符合加倍，有一個字不符合整筆就是 0），結果依分數由高到低、同分保留資料的順序；`words()` 轉小寫、依空白切開、去掉空的；`segments()` 把每個字的每一次出現標出來（不分大小寫，重疊的合併），對真的資料標出來的字元就是每個字出現的地方、整段接回去還是原字；進階搜尋的 `itemContainsTerm` 也比對英文地區與地點名稱。`tests/gathering-reminders.test.js` 在 vm 裡載入真正的三個腳本（只有對照排程的測試才多載入 `reminder-scheduler.js`），守住 `GatheringReminders`（不碰 DOM）：預設（網頁提醒關著、提早 1 分鐘、沒有提醒，選項是 0／1／2／3／5／10）、加入與取消、存起來另一個實例讀得到、兩個分頁在收到對方的 storage 事件之前各自新增、取消或改設定都不蓋掉另一個分頁存的（每次改之前先重讀，上一次寫不進去時用記憶裡的）、不認得的素材不加、`setLead` 只收選項裡的、`setEnabled` 由關變開時記下 `enabledAt`、沒傳時間或不是有限的數字時用現在的時間；`reload()` 把壞掉的內容整理回預設、丟掉不認得的素材與重複的提醒，照另一個分頁存的改，存的被清掉就回到預設而且不會當成新的瀏覽器去遷移；舊使用者遷移（以前開著採集提醒的人，預設清單的素材變成我的提醒、網頁提醒維持開著，只遷移一次，舊的鍵與清單不動；照預設清單的順序、同一種素材只算一次、只有其中一個時段也認得、亂七八糟的清單內容不丟例外；全天的素材不帶過來；一種素材都沒有——資料沒載入——時不遷移也不存，等有素材的那一次再遷移；已經存過提醒——哪怕內容壞掉——不再遷移；以前沒開或內容壞掉就什麼都不做也不存）；瀏覽器封鎖網站資料或寫不進去時照樣能加能拿掉、不丟例外，這次打開期間用記憶裡的；`alerts()` 關著時是空的，開著時每一段提早 `leadMs`、`armedAt` 取設定與打開較晚的，提早範圍內會開始的每一次都列再加上之後的一次，時段無效的素材不產生提醒也不影響別的，永遠不丟例外、現在不是有限的時間時回傳空的；並拿 `alerts()` 去對真的 `ReminderScheduler`：設定時已經開始的那一次不補、提早範圍內的等到開始、其他的提早 `leadMs` 響。`tests/timed-gathering-page.test.js` 用 `gathering-page.js` 在 vm 裡執行採集頁：守住原本在 `timed-gathering-behavior.test.js` 裡跑整個控制器的三個測試（備份檔經匯入流程來回、清單名稱與搜尋保留原始字元、沒有 `Notification` 時頁面照常載入資料與清單而開關與測試鈕不變灰），以及瀏覽器封鎖網站資料時照常載入、類型篩選鈕、生成巨集、新增清單的對話框拒收空名稱和替身本身的行為；一種素材一張卡片（名稱、另外兩種語言、地點、時段、狀態），地點和地區同名時地點行只寫一次地區、英文介面的地點行沒有中文，下一次還不到 10 分鐘寫 m:ss、再久寫「N 分」；沒有搜尋時依現在可採（剩比較久的在前）→快出現的→全天排序，有搜尋時每個字都要符合、依分數再依出現時間排、命中的字用 `<mark>` 標出來（字用標題色）、計數寫「找到 N 種」，沒有符合時是空狀態；英文、日文介面的卡片、地點行、狀態行與清單面板的名稱都換成那個語言；「加入清單」加入這種素材的所有時段，兩個時段都在清單裡才寫「已加入」（用 `aria-disabled`，焦點留在原本的按鈕上），清單快滿、放不下全部時段就一筆都不加，瀏覽器封鎖網站資料時照樣把每個時段加進這次的清單、改跳記不住的警告，清單開始捲動時每一列保持原本的高度（`.list-item` 不縮小）；倒數每秒走，只換狀態行的文字，卡片與狀態行都是同一個元素；有素材從出現切到現在可採、現在可採結束或換成另一段時重排，搬動原本的卡片而不重建，有搜尋時分數優先；焦點在卡片的按鈕上時先不排，焦點離開清單才排（瀏覽器視窗失去焦點不算）；電腦睡著醒來後、或計時器還沒跑就先切換語言、篩選、搜尋，狀態與順序直接是現在的；沒有提醒時「我的提醒」隱藏、時鐘一行在搜尋框上面，有提醒時時鐘併進標題列；「提醒我」在點擊裡問通知權限但不等回答（詢問被關掉、權限還是 `default` 時每按一次都再問，取消不問），順便打開網頁提醒，按鈕就地改成「已設提醒」（焦點不動、不用 `disabled`），我的提醒因此出現、變高、變矮或藏起來時，被按的按鈕留在畫面上原本的位置（`keepInPlace()` 照按鈕前後的位置捲動；替身用 `getBoundingClientRect()` 與 `scrolls` 模擬），再按取消，全天的素材沒有提醒鈕；我的提醒依出現時間排，先列 5 個（480px 以下的手機 3 個，視窗跨過 480px 時跟著換、展開著的不收起），「顯示全部 7 個」與「收起」，每一列的名稱、每秒走的狀態、地點、有名稱的取消鈕 `aria-label`，取消後焦點移到補上這個位置的取消鈕，768px 以下提醒列的按鈕和名稱放同一行；到時間的頁內提示、提示音與系統通知同一次只響一次，提早 0 分寫「出現了」，電腦睡著而晚到時在那一段結束前補一次、標題寫實際還剩幾分鐘，整段都睡過去就不補；網頁提醒關著時到時間什麼都不做，在時段裡才打開時正在進行的那一次不補；提醒列切換時重排，焦點在列裡時延後；通知被拒或不支援時開關照樣能用，「我的提醒」下方寫出只有頁內提示和聲音（含「或改用遊戲鬧鐘」），Android 的 Chrome 丟錯後改寫不支援；改提早分鐘數會存起來並用在下一段；另一個分頁新增、取消或清掉網站資料時，這個分頁的我的提醒與卡片按鈕跟著變，還沒收到 storage 事件就按提醒我、改提早分鐘數或開關時也不蓋掉另一個分頁的；瀏覽器封鎖網站資料時這次打開期間照樣能設提醒、會響；舊使用者（全天的不帶過來）打開就看到預設清單的素材在我的提醒裡；重新整理後還原的提醒要等頁面上的點擊或按鍵才解開提示音（網頁提醒關著或沒有提醒時不解開）；測試通知；切換語言時提醒列、選項、按鈕、說明與之後的通知換字；採集物資料載入失敗時我的提醒不出現、不動存著的提醒與舊的採集提醒（下次載入成功時照樣遷移）；「複製鬧鐘」複製這種素材下一次出現的一行指令（正在可採時是再下一段，每次按的時候才算），toast 與卡片或提醒列下面的說明寫出複製了什麼，一次只留一個說明，剪貼簿不能用時 toast 寫複製失敗、說明改成「沒辦法自動複製」並換警告的配色、指令照樣顯示讓人自己選取，結果晚到時只改按下去的那個說明（同一張卡片連按兩次時，前一次的結果晚到不改說明、不跳 toast），提醒列也能複製鬧鐘（480px 以下只顯示 📋，名稱在 `aria-label`），卡片與提醒列重排時說明跟著搬動，換語言時舊語言寫的說明收掉；並檢查 `index.html` 的標記（三張時鐘卡拿掉、頁面與翻譯檔沒有寫錯的「艾歐爾傑亞」、腳本順序、不再載入 `notification-manager.js`、每個輸入框都有名稱：搜尋框有看不到的 `<label>`，巨集文字框用 `aria-labelledby` 指向「巨集匯出」標題；每個 `<label>` 都對到一個欄位，篩選區兩排按鈕是 `role="group"`、名稱是前面的「類型：」「版本：」，選取時 `.active` 與 `aria-pressed` 一起換）、每一個用 `hidden` 切換的元素在 `style.css` 都有 `display: none`、複製鬧鐘說明的樣式（可以選取、失敗時換警告的配色），以及新文字的三語鍵值（舊的時鐘與通知文字拿掉）。`tests/timed-gathering-behavior.test.js` 只在 vm 裡載入 `time-calculator.js`、`gathering-materials.js`、`list-manager.js`、`macro-exporter.js` 與 `search-filter.js`（不載入頁面），守住清單與備份（巢狀無效的備份與超過容量不會寫進一半、寫入失敗時匯入不套用而壞掉的備份還救得回來、十份清單的備份能還原到全新的瀏覽器、舊版匯入撞名時名稱照樣整理、沒碰過的預設清單換語言與重新載入後仍可被取代，改過名或用過的預設清單即使清空也保留）、跨午夜的區間與全天的時段在 `GatheringMaterials.state()`、排序與鬧鐘匯出之間一致，以及 `MacroExporter.generateOneTimeAlarm()`（就是整份清單那一行拿掉 `rp`，全天與時間無效是 `null`，沒有 `macroFormat` 時用描述，資料裡的每一筆都對得上；整份清單的匯出每一行仍然有 `rp`）。仙人微彩另有三份新測試，頁面測試共用 `tests/helpers/cactpot-page.js`（作法照 `weather-page.js`：用 `fake-dom.js` 照 `index.html` 建出 `#cactpotTool`，依 `index.html` 的 `<script src>` 順序載入翻譯檔、共用的 `cell-popover.js` 與工具目錄的每個腳本，再 `new MiniCactpotCalculator()`；取字自真正的翻譯檔，`setLang()` 換語言，`toasts` 記下每一次 toast；每個元素都有回傳 0 的 `getBoundingClientRect()` 與記下呼叫的 `scrollIntoView()`（記在 `scrolls`），disabled 的元素 `click()` 什麼都不做；`pick(p, 值)` 點格子再點小選單的選項，`fill({ 位置: 值 })` 照位置一格一格 `pick()`，`keyboardOpen(p)` 派送 `detail` 為 0 的 click（鍵盤按 Enter、空白鍵時瀏覽器送的），`key(鍵, 目標, init)` 派送 keydown，`payoutRows()` 取獎金表每一列，`suggestedCells()`／`suggestedBadges()` 取綠色的格子與線）。`tests/cactpot-solver.test.js` 在 vm 裡載入真正的 `cactpot-solver.js`，守住 `MiniCactpotSolver`（純函式，不碰 DOM、不靠 `this`）：刮格與選線的平均和 main 3a0d6a2 的演算法算出來的基準值一致（五個刮格盤面、三個選線盤面），同分要期望值差距小於 1e-6（浮點誤差造成的並列與門檻的邊界各有案例；畫面上寫成同一個數字的不一定同分），`possibleSums()`、`analyze()` 一打開／刮格／選線三種狀態、`formatMgp()` 四捨五入加千分位，以及不改到傳進來的盤面（傳凍結的盤面也算得對）。`tests/cell-popover.test.js` 在 fake-dom 上守住共用的 `CellPopover`：`place()` 的位置（開在格子下方或上方、水平置中、左右不超出盤面）、選項的 `disabled`（含目前的值）與只有寫了 `current` 才有的 `aria-pressed`、不是對話框（`role="group"`、沒有 `aria-modal`、不鎖捲動、不設 `inert`）、選完先關掉選單並讓焦點回到格子再呼叫一次 `onSelect`、Esc 關掉並把焦點還給格子、點選單外面（`click` 與 `pointerdown`，後者給點非互動元素時不送 click 的 iPhone Safari）與焦點移出選單就關但不搶回焦點（焦點離開被點的那一格而不是進到選單裡也關；選單換到另一格後，舊的那一格失去焦點不會關掉新的選單）、點另一格就換過去（盤面裡只有一個選單）、選單上的 `mousedown` 會 `preventDefault()`（Safari 與 macOS 的 Firefox 點按鈕不給焦點，不然選單會在 click 之前被 focusout 關掉）、視窗大小改變（手機轉向、視窗變窄或變寬）時照那一格的新位置重新放好選單（開在上方的照樣開在上方；先拿掉舊的位置再量選單，absolute 的選單離左邊越遠、量到的寬度越窄）而關掉之後不再聽 `resize`、`close()` 可以重複呼叫，以及 `tools-common.css` 有 `.cell-popover*` 的規則。`tests/mini-cactpot-page.test.js` 用 `cactpot-page.js` 在 vm 裡執行仙人微彩頁，守住狀態列的三步與同分的「或」、小數字盤（開在盤面裡而不是對話框、別格用掉的數字不能選、鍵盤打開時焦點在第一個能選的數字、Esc 與選完都回到格子、點另一格就換過去、點盤面外面就關掉、上兩列在格子下方而最下面一列在上方）、沒翻開的格子寫「平均 N」且推薦的格子綠色、填滿 4 格後外圈寫每條線的平均（外圈的膠囊照舊 `aria-hidden`，螢幕閱讀器改唸狀態列下面看不到的清單 `#cactpotLineAverages`：`.visually-hidden` 的 `<ul>`，選線時一條線一項「上橫列：平均 97」、照橫列、直行、斜線的順序，不用選線時 `hidden`，不在 `aria-live` 的狀態列裡）、推薦的線與它的 3 格綠色、沒翻開的格子不能點、清掉一格後回到刮格的樣子、點填好的格子改數字或清除並馬上重算、獎金表（19 列、1,000 以上粗體、表下面不加圖例、推薦的線還可能出現的總和標綠色）、上一步的 toast 寫出退回了什麼（填、改、清除、下一張都退得回來，沒得退時按鈕 `aria-disabled` 且焦點留在按鈕上）、下一張不跳 toast 且按「上一步」救得回來、小數字盤開著時按「上一步」「下一張」（或直接呼叫 `undo()`、`nextTicket()`）會先把它關掉、數字鍵 1–9（填進焦點所在的格子，小數字盤開在別格就先關掉它而不搶焦點——滑鼠打開後按 Tab 到另一格，Chrome 靠小選單自己關，Safari 點格子不給焦點、靠按鍵時關；焦點不在格子上而小數字盤開著時填進它開給的那一格；填入並 `preventDefault`；按著 Ctrl／⌘／Alt、焦點不在格子上而小數字盤沒開、數字已經用了的按鍵不 `preventDefault`，瀏覽器與系統的快速鍵照常；這些和填滿後沒翻開的格子按數字，都什麼都不變、不跳 toast、上一步不多一步）、切換語言（小數字盤先關掉，狀態列、格子、獎金表標題與之後的 toast 換字）、不會自動捲動；並檢查 `index.html` 的標記（沒有蓋住盤面的對話框、說明段落、結果卡與「重做」，格子是按鈕，不再載入 `state-history-manager.js` 與 `modal-manager.js`）、`style.css`（格子大小不隨內容改變、狀態列用 `content-box` 留三行高、413px 以下的手機英文用 `:lang(en)` 留四行、盤面 `position: relative`、卡片 `overflow: visible`、獎金表排成兩欄、手機獎金表在盤面下面而 768px 以上在右邊）、共用的 `.cell.suggested` 排在 `:disabled` 後面，以及不再用的翻譯鍵三語都拿掉。這支與 `cell-popover.test.js` 比較元素一律用 `isSame`（沿用 `timed-gathering-page.test.js`：`assert.equal` 失敗時會展開整份 fake-dom 而卡住不報錯，改成 `===` 加訊息才報得出來）。天書奇談另有兩份新測試，頁面測試用 `tests/helpers/wondrous-page.js`（作法照 `cactpot-page.js`：用 `fake-dom.js` 照 `index.html` 建出 `#wondrousTool`，依 `index.html` 的 `<script src>` 順序載入翻譯檔與工具目錄的每個腳本（`tails-odds.js`、`script.js`），再 `new WondrousTailsCalculator()`；頁首、頁尾、`common.js`、`security-utils.js` 不載入，頁面用到的 `i18n` 與 `FF14Utils.getI18nText()`、`showToast()` 換成替身，取字自真正的翻譯檔，`setLang()` 換語言，`toasts` 記下每一次 toast（這一頁不跳 toast，測試用它確認一直是空的）；disabled 的元素 `click()` 什麼都不做；`cell(p)`／`cells()` 取格子，`count()` 取張數的文字，`placed()` 取貼了貼紙的位置，`place(...位置)` 照順序點每一格（點已經貼了的格子就是拿掉），`doneCells()`／`nearCells()` 取有 `line-done`（在連成的線上）與 `line-near`（只差一張的空格）的格子位置，`clearButton()` 取「清空盤面」／「復原」那顆按鈕，`odds()` 取機率表三列的名稱、兩個數字與兩條長條的 `style.width`，`header()` 取表頭的兩個欄名）。`tests/wondrous-tails-odds.test.js` 在 vm 裡載入真正的 `tails-odds.js`，守住 `WondrousTailsOdds`（純函式，不碰 DOM、不靠 `this`）：10 條線的順序（4 條橫列、4 條直行、左上到右下、右上到左下）、空盤面（＝重置之後）有 11,440 種擺法而貼滿時至少 1／2／3 條是 6,688／1,208／24 種（58.5%、10.6%、0.21%，`RESET_ODDS` 是凍結的）、六個例子盤面（3 張到 9 張）的擺法數與百分比、`canReset()` 只有 3～7 張、`analyze()` 的已貼張數與重置之後（3～7 張才有數字，其他是 `null`）、`completedLines()` 與 `doneCells`（4 格都貼了的線與它們的格子）、`nearCells()`（剛好貼了 3 張的線缺的那一格，同一格補齊兩條線只列一次，已經連成的線不算，貼滿 9 張時是 `[]`）、`formatPercent()`（0 寫 `0%`，≥ 99.995% 寫 `100%`，≥ 1% 一位小數，其他兩位小數）、不改到傳進來的盤面（傳凍結的盤面也算得對），以及貼超過 9 張時 `lineCounts()` 與 `analyze()` 丟 `RangeError`。`tests/wondrous-tails-page.test.js` 用 `wondrous-page.js` 在 vm 裡執行天書奇談頁，守住：說明只有一句（三語）、一打開是「已貼 0／9 張」與 16 個還沒貼的按鈕、點空格貼上再點一次拿掉而張數跟著變、貼滿 9 張後其他 7 格 `disabled` 而且點了不會貼（拿掉一張後又能點）、`toggle()` 自己也擋（不靠格子的 `disabled`：盤面外的位置與第 10 張都什麼都不變、不丟錯）、整頁不跳 toast、重畫不重建格子（用鍵盤貼上之後焦點還在同一個按鈕上）、切換語言時張數、格子名稱、表頭、列名、連線標示與按鈕文字換字（機率的數字不變）；機率表一打開（0 張）「現在」是隨機 9 張的機率（58.5%／10.6%／0.21%）、「重置之後」寫「—」且長條長度是 `0.00%`，貼 3～7 張才有「重置之後」（2 張「—」、3 張與 7 張是 58.5%／10.6%／0.21%、8 張與 9 張又是「—」），例子盤面（6 張）現在是 70.0%／13.3%／0%，貼滿 9 張時「現在」只剩 100% 或 0%；連線標示：線上 4 格加 `line-done`、名稱寫「已連成線」，只差一張的空格加 `line-near`、名稱寫「貼了就連成線」，同一格補齊兩條線只標一次、連成的線和差一張的線可以同時出現，貼滿 9 張時不標虛線框（拿掉一張後標回來），拿掉一張讓線斷掉時綠框跟著拿掉、缺的那格改成虛線框；清空與復原：一打開「清空盤面」在盤面卡標題列的右邊、是一般按鈕、不能按，按下去盤面清空而按鈕變成「復原」（焦點留在按鈕上、不跳 toast），按「復原」放回剛才的盤面（貼滿 9 張時不能點的空格與連線框都和清空前一樣），清空之後貼了新的一格就不能再復原（按鈕變回「清空盤面」，再清空、復原的是新的盤面），一張一張拿掉到空（不是按清空）時按鈕不能按，兩種狀態的按鈕文字都隨語言換；並檢查 `index.html` 的標記（沒有「還原」「重做」、紅色的重置、結果面板與建議，格子是 16 個 `<button>`，不再載入 `state-history-manager.js`，機率卡在盤面卡後面，`tails-odds.js` 排在 `script.js` 前面，沒有圖例）、`style.css`（盤面四欄用滿寬度、格子是正方形、間距 `var(--space-3)`、盤面卡的 `padding` 是 `var(--space-4)`、標題列留一顆小按鈕的高度、`.cell.placed` 不設 `box-shadow`（不然會蓋掉共用的焦點外框）、768px 以上兩欄、長條用 `--color-primary`／`--color-muted` 而數字與長條不用好壞配色、綠框用 3px 的 `outline`（`outline-offset: 3px`、不含 `box-shadow`）、虛線框用 2px 的 `--color-success`），以及不再用的翻譯鍵三語都拿掉。這支比較元素一律用 `isSame`（沿用 `mini-cactpot-page.test.js`）。宗長計算機另有兩份新測試，原本的 `tests/faux-hollows-probability.test.js` 照新畫面改寫，頁面測試共用 `tests/helpers/hollows-page.js`（作法照 `cactpot-page.js`：用 `fake-dom.js` 照 `index.html` 建出 `#hollowsTool`，依 `index.html` 的 `<script src>` 順序載入 `common.js` 的翻譯檔（格子名稱用到 `label_sep_colon`、`label_sep_comma`）、這個工具的翻譯檔、共用的 `cell-popover.js` 與工具目錄的每個腳本（`board-data.js`、`hollows-solver.js`、`script.js`），再 `new FauxHollowsFoxes()`；頁首、頁尾、`common.js`、`security-utils.js` 不載入，頁面用到的 `i18n` 與 `FF14Utils.getI18nText()`、`showToast()` 換成替身，取字自真正的翻譯檔，`setLang()` 換語言，`toasts` 記下每一次 toast；每個元素都有回傳 0 的 `getBoundingClientRect()` 與記下呼叫的 `scrollIntoView()`（記在 `scrolls`），disabled 的元素 `click()` 什麼都不做；`cell(p)`／`cells()` 取格子，`status()` 取狀態列的文字，`enabled()` 取沒有 `disabled` 的格子位置，`obstacles()`／`autoCells()` 取有 `is-obstacle`（手動標的與自動補上的）與 `is-auto`（自動補上的）的格子位置，`menu()`／`option(值)` 取打開的小選單與其中的選項，`pick(p, 值)` 點格子再點小選單的選項（選單沒開、找不到選項或選項是灰的時丟錯），`itemOf(p)` 取翻開的是 `sword`、`chest`、`fox` 還是 `empty`（還沒翻開是 `null`），`hints(p)` 取格子上每個提示的文字（`⚔️75%`、`📦13%`、`🦊`），`nextCells()` 取有 `suggested`（下一格，共用的綠框）的格子位置，`tap(...位置)` 照順序點每一格，`keyboardOpen(p)` 派送 `detail` 為 0 的 click（鍵盤按 Enter、空白鍵時瀏覽器送的），`key(鍵, 目標, init)` 派送 keydown）。`tests/faux-hollows-solver.test.js` 在 vm 裡載入真正的 `board-data.js` 與 `hollows-solver.js`，守住 `FauxHollowsSolver`（純函式，不碰 DOM、不靠 `this`）：`flatten()` 把 252 種盤面接成 36 格（每種 5 個障礙物、6 格劍、4 格寶箱、4 個宗長或空，障礙物的擺法有 16 種）、一打開是障礙物階段（252 種盤面、32 格能標，格 1、11、24、34 在每一種盤面都不是障礙物，沒有目標）、障礙物階段只看手動標的障礙物（剩幾種盤面、已知幾格、能標的格子，擺法還沒確定也會自動補上：標 2 補上 10）、擺法確定就進入翻格（標 9、13 補上 16、28、30，剩 16 種盤面，找劍、下一格 26，劍與寶箱的比例照 16 種盤面裡的種數，障礙物沒有機率）、🦊 只放在還可能有宗長的格子而且沒有任何宗長的比例（`analyze()` 回傳的東西裡只有 `foxCells` 這份位置清單；只剩 1 種盤面時翻開 0、3、23 後只剩 29，剩 3 次劍還差 2 格、夠翻完，所以還是找劍；照建議翻完劍剩 1 次時，目標輪到宗長、下一格是 29）、找到宗長之後其他格都不放 🦊、兩種只有宗長位置不同的假想盤面（翻開 8 格空的、剩 3 次，劍和寶箱都來不及翻完，目標直接是宗長，兩種盤面裡都是宗長位置的格 1、2 先翻，只在一種盤面裡的格 4、5、6 只放 🦊）、目標的順序（劍 → 寶箱 → 宗長 → 完成；剩的次數不夠翻完劍就跳到寶箱，不夠翻完寶箱就跳到宗長；宗長的位置全部翻開都是空的就完成，次數用完也是完成，清掉一格目標就回來）、`choices()`（把這格當成還沒翻開時可能是什麼，照 `ITEMS` 的順序；只剩一種的格子；已經翻開的格子照樣當成還沒翻；宗長只有一隻，別格是宗長時不列宗長、自己是宗長時照樣列；手動標的與自動補上的障礙物是 `[]`）、`formatPercent()`（整數百分比帶 `%`，0 不寫，大於 0 但不到 1% 寫 `<1%`）、不改到傳進來的盤面與狀態（傳凍結的也算得對），以及把障礙物標在每一種盤面都不是障礙物的格子（對不上任何盤面）時不丟錯、什麼都不能做。`tests/faux-hollows-page.test.js` 用 `hollows-page.js` 在 vm 裡執行宗長計算機頁，守住：一打開是「① 點遊戲裡被擋住的格子」、36 個 `<button>`（名稱「第 N 格」、`aria-pressed="false"`），格 1、11、24、34 不能點，不跳 toast；標一格障礙物後寫「已知 1／5」、只剩可能是障礙物的格子能點，再點一次拿掉；自動補上（標 2 就補上 10：斜線、不能點、名稱寫「障礙物（自動補上）」，拿掉 2，10 跟著消失）；擺法確定就進入翻格（標 9、13 →「② 找劍・剩 11 次」，手動的 9、13 與自動補上的 16、28、30 都鎖住，不再有 `aria-pressed`）；`tapCell()` 自己也擋（不靠格子的 `disabled`：不可能是障礙物的格子、翻格階段的障礙物，直接呼叫也什麼都不變）；用鍵盤標障礙物時焦點留在同一格、同一個元素，標完第 2 個、那一格鎖住時焦點移到下一格 26；焦點所在的格子鎖住、而且沒有下一格（還在標障礙物）時，焦點移到第一個能點的格子；切換語言時狀態列與格子名稱換成那個語言；翻格：點還沒翻的格子，在旁邊開小選單（`role="group"`、名稱「第 26 格翻到什麼」，劍／寶箱／宗長／空四個選項，不可能的是灰的），選了就標好、選單關掉、焦點回到格子、不跳 toast；只有一種可能時點一下就標好、不開選單（25 是劍之後的 26，找到宗長（格 0）之後的格 3 只能是空）；宗長只有一隻（格 0 標成宗長之後，別格的選單裡宗長是灰的，清掉格 0 又能選）；點已經翻開的格子是同一個選單，目前的標成已選（`aria-pressed`）、最後多一個獨佔一列的「清除」，改了剩幾次不變、清掉就加回來；狀態列跟著目標換（劍翻完 →「③ 找寶箱」，剩的次數不夠翻完寶箱 →「④ 翻宗長（不一定有）」，宗長的位置全部翻開都是空的 →「完成」，「完成」但還有次數時還沒翻的格子照樣能點）；劍來不及翻完就跳到寶箱；次數用完（「完成」，還沒翻的格子不能點、翻開的照樣能點，清掉一格又能點）；`choose()`、`tapCell()` 自己也擋（不可能的選項、障礙物、清除還沒翻的格子、次數用完時還沒翻的格子，直接呼叫也什麼都不變）；用鍵盤打開小選單（焦點在第一個能選的選項，Esc 關掉、焦點回到格子，選了也回到格子）；小選單的位置（上三列開在格子下方、下三列開在上方）；切換語言時開著的小選單先關掉，之後打開的選單、狀態列與格子名稱換成那個語言；提示：進入翻格後還沒翻的格子寫 ⚔️、📦 的整數百分比（帶 %，0 不寫），可能有宗長的只放 🦊，下一格 26 框綠色，障礙物沒有提示，格子名稱也寫出這些提示（例如「第 27 格：劍 75%，寶箱 13%，建議翻這格」），宗長的格子上沒有任何數字；障礙物階段顯示障礙物機率、不放寶物提示、不框下一格；翻開的格子不寫提示，下一格跟著重算（25 是劍 → 26，改成寶箱 → 0、1、2、6、7、8 同分全部框起來）；翻開 0、3、23 之後格 29 只有 🦊、沒有數字，下一格還是劍的 32、33，照建議翻完劍剩 1 次時改成「④ 翻宗長（不一定有）」、下一格是 29；找到宗長（格 0）之後其他格都不放 🦊，下一格是劍的 26、27、32、33；切換語言時格子名稱裡的提示換成那個語言（`マス 27：剣 75%、宝箱 13%、次はこのマスがおすすめ`）、格子上的提示不變；🦊 的說明改短成一句（三語）、提示的字小、不換行、行高 1.1、只有一個提示時圖示自己一行、359px 以下提示 11px；翻了好幾格之後回頭改早先的一格（小選單只列還對得上的選項，清掉之後機率、🦊、下一格與剩幾次跟著重算）；上一步與重置遊戲：一打開兩顆都不能按（用 `aria-disabled`，不是 `disabled`），上一步退回上一個動作並用 toast 寫出退回了什麼（標障礙物、拿掉障礙物、翻開、改、清除），上一步跨過進入翻格的那一步時回到障礙物階段（自動補上的跟著消失、障礙物又能點、小選單留下的 `aria-expanded` 拿掉），重置遊戲清空盤面、不跳 toast，上一步整盤救回來，盤面是空的時按了什麼都不做，沒得退時按上一步什麼都不變、不跳 toast、焦點留在按鈕上，小選單開著時按重置遊戲先把它關掉，直接呼叫 `undo()`、`resetGame()` 時函式自己先關掉小選單（不靠「點外面」的處理），切換語言時按鈕與之後的 toast 換字；並檢查 `index.html` 的標記（沒有上方的提示說明、盤面資訊、最佳策略的開關、結果卡、對話框、回到頂部與 `.btn-primary`，格子是 36 個 `<button>`，不再載入 `state-history-manager.js` 與 `modal-manager.js`，`board-data.js`、`hollows-solver.js`、`script.js` 排在最後，「上一步」「重做」「重置遊戲」是 `aria-disabled` 的一般按鈕）、`style.css`（一欄最寬 28rem、6 欄的盤面、格子是正方形且 `gap: 0`、狀態列用 `content-box` 留兩行高、障礙物不會被 `:disabled` 淡掉（`opacity: 1`、不設 `box-shadow`）而自動補上的是斜線加虛線框、374px 以下格子間距 2px、359px 以下卡片內距 `var(--space-2)`、卡片 `overflow: visible`、盤面 `position: relative`（小選單掛在盤面裡）、翻開的格子底色照類型（`--color-info-tint`、`--color-danger-tint`、`--color-warning-tint`、`--color-surface-2`）而且不設 `box-shadow`、上一步與重做並排、重置另放一行、不能按時 `opacity: 0.55`），以及不再用的 36 個翻譯鍵三語都拿掉。這支比較元素一律用 `isSame`（沿用 `mini-cactpot-page.test.js`）。另涵蓋障礙物比例更新、兩階段的機率顯示切換、重做跨階段與清除、新動作清掉重做分支、重置與歷史往返，以及三語按鈕狀態。`tests/faux-hollows-probability.test.js`（照新畫面改寫，同樣用 `hollows-page.js`）守住宗長只放 🦊、不寫數字：只剩 1 種盤面時（擺法 0 加上寶箱 4、劍 25、26、27、31），4 個宗長的位置 0、3、23、29 只放 🦊，不寫成 100%、格子上沒有任何數字、名稱裡也沒有百分比，劍與寶箱確定的格子照實寫 100%（這種格子只有一個提示）；找到宗長之後其他格不再放 🦊（三語重畫照樣是 🦊、名稱照語言）；清掉宗長的格子，🦊 回到其他還可能的格子；上一步退回找到宗長，🦊 回到原本的 4 格。陸行鳥染色計算器另有兩份測試，攻略資料另有一份，頁面測試共用 `tests/helpers/chocobo-page.js`（作法照 `cactpot-page.js`：用 `fake-dom.js` 照 `index.html` 建出 `#chocoboTool` 與色票面板 `#colorSheet`，依 `index.html` 的 `<script src>` 順序載入這個工具的翻譯檔與工具目錄的每個腳本（`chocobo-solver.js`、`script.js`），再 `new ChocoboColorTool()` 並等 `app.ready`；頁首、頁尾、`common.js`、`i18n-manager.js`、`modal-manager.js` 不載入，頁面用到的 `i18n`、`FF14Utils.getI18nText()` 與 `ModalManager` 換成替身，取字自真正的翻譯檔，`setLang()` 換語言；`fetch` 只認 `../../data/chocobo-colors.json`（`fetchFails` 讓它失敗、`data` 換掉資料），`stored` 給 `localStorage` 的初始內容、`storageThrows` 讓光是讀 `localStorage` 就丟例外，頁面在 console 留下的任何東西都記在 `consoleErrors`；`answer()` 取答案卡目前的樣子、`check(i)` 點第 i 段的勾選框、`sheet()`／`swatch(id)` 取色票面板與其中一格、`key()` 派送 keydown、`reopen()` 用同一份儲存內容再開一次頁面）。`tests/chocobo-color-solver.test.js` 在 vm 裡載入真正的 `chocobo-solver.js`，守住 `ChocoboColorSolver`（純函式，不碰 DOM、不靠 `this`、不改傳進來的資料，傳凍結的資料也算得對）：全部 7,225 組顏色（85 組同色回傳 `same: true`，其餘 7,140 組）每一步都在 RGB 0～255、終點離目標色比離其他任何顏色都近、顆數加總等於 `total`、`total` 是直接調色與先餵檸檬較少的那個，配方的規則沒變（7,140 組直接調色加總 272,421 顆，取較省的做法加總 185,282 顆，其中 2,780 組檸檬比較省、92 組一樣多），檸檬的選擇（魔花綠 → 沙漠黃是 1 顆檸檬，煤煙黑 → 素雪白 35 顆，素雪白 → 天空藍直接調色 15 顆；一樣多時用檸檬；目前是沙漠黃時沒有檸檬做法），分段的段數與離 0／255 的距離等於暴力搜尋算出的最小值（總顆數 8 顆以下的全部組合）、同段數時挑離邊界最遠的、沙漠黃 → 素雪白是 4 段，`bestTotal()` 等於 `plan().total`，`colorGroups()` 的 7 組與 85 色各出現一次，以及找不到做法時的回傳值。`tests/chocobo-color-page.test.js` 用 `chocobo-page.js` 在 vm 裡執行頁面：一打開就是沙漠黃 → 素雪白的答案；兩顆顏色按鈕載入前不能按；打勾只改各列（計數、存檔、下一段的標示與跳過的提醒），全部勾完寫「全部勾完」；第一個還沒勾的段標成「下一段」，還沒勾而後面有勾的段寫提醒（`aria-describedby` 依序指到「下一段」與提醒；朗讀區只在新跳過一段時念；打勾、重新打開、切換語言都照 `done` 重算）；重新打開還原顏色與打勾；全部勾完後下次打開，目前顏色換成目標顏色、打勾清空並存回去，沒勾完時照舊；壞掉的記憶、封鎖網站資料、載入失敗、同色與找不到做法的資料；檸檬那一段與另一個做法那一行；步驟清單上面的「餵食順序」那一行（2 段以上才有後半句、同色時沒有、清單用 `aria-labelledby` 指向它）；三語與量詞；螢幕閱讀器的朗讀摘要；色票面板（85 格依色系分 7 組、目標顏色的面板每格寫要餵幾顆、點一格換答案並清空打勾、點目前已選的那一格只關掉面板而不清打勾、Esc／點遮罩／關閉鈕關掉並把焦點還給按鈕、開著時切換語言先關掉）；窄螢幕（480px 以下兩顆按鈕上下排、頁面說明視覺上隱藏）與面板的樣式（手機蓋滿畫面、沒有 `overflow-x`）；翻譯檔三語的鍵與 `{參數}` 一致。這支比較元素一律用 `isSame`（沿用 `mini-cactpot-page.test.js`）。`tests/guide-pages.test.js` 守住攻略資料（用 `fake-dom.js` 跑真正的 `sidebar-template.js`）：專屬陸行鳥的 `#color-calculator` 還在、下面是連到陸行鳥染色計算器的連結卡，舊計算器的檔案、樣式與翻譯鍵都拿掉了；4 個還沒寫的主題（部隊、副本、風脈、探索筆記）有 `noindex`、老實寫「撰寫中」的 meta description 與內文，副本頁連到副本資料庫；攻略首頁的卡片與側欄（`ITEMS` 的 `pending`）標「撰寫中」，另外 3 個主題不標；目錄是 `<details>`，電腦打開、手機（窄螢幕，或橫放的矮視窗：`MOBILE_QUERY` 是 `(max-width: 768px), (max-height: 500px)`，測試裡的 `matchMedia` 替身照查詢文字與視窗大小判斷）收起來，視窗跨過斷點（寬度 768px、高度 500px）時跟著換，焦點在目錄裡就維持打開；`style.css` 手機版面（和 `MOBILE_QUERY` 同一個 `@media`）裡的 `.toc-sidebar` 一定要有 `position: relative`、`width: 100%`、`max-height: none`、`overflow: visible`，`.guide-layout` 排成單欄，與目錄有關的其他規則不設 `overflow`（`visible` 除外）、`max-height` 只能是 `none`（不在框裡捲），整份 `style.css` 沒有 `overflow-x: auto|scroll`；以及用語（見下面「Current Tools」的攻略資料那一項）。`tests/changelog-page.test.js` 守住修改紀錄頁，發新版漏做的步驟會在這裡失敗：結構（只有第一版是展開、標「最新」的 `<details>`，每個兩條以上的版本與最新一版都有一句標題，只有一條的舊版本是單行，月份區塊裡只放月份標題和版本：`#changelogEntries` 底下只有 `section.changelog-month`，每個區塊的第一個子元素是 `h2.changelog-month-title`、其餘都是 `.changelog-entry`）、id 格式與不重複、日期由新到舊且落在所屬的月份區塊、標籤只有新增／改善／修正／里程碑四種；另外用 `fake-dom.js` 在 vm 裡執行 `assets/js/changelog.js`，守住每個 `<details>` 版本的「N 條」（三語，切換語言跟著換）與網址 `#` 指到收起來的版本時展開並捲到它。副本資料庫另有三份測試，頁面測試共用 `tests/helpers/dungeon-page.js`（作法照 `chocobo-page.js`：用 `fake-dom.js` 照 `index.html` 建出 `#dungeonTool` 與 `#dataSource`，依 `index.html` 的 `<script src>` 順序載入這個工具的翻譯檔與工具目錄的每個腳本（`dungeon-list.js`、`script.js`），再 `new DungeonDatabase()` 並等 `app.ready`；頁首、頁尾、`common.js`、`i18n-manager.js` 不載入，頁面用到的 `i18n` 與 `FF14Utils.getI18nText()` 換成替身，取字自真正的翻譯檔，`setLang()` 換語言；`fetch` 只認 `../../data/dungeons.json`（`fetchFails` 讓它失敗）；`setTimeout`／`clearTimeout` 只記下、不真的計時（頁面只用它延遲搜尋），`runTimeouts()` 把排著的各跑一次，`pendingDelays()` 看排著的延遲毫秒數；`matchMedia` 只認手機版面的查詢（`mobile` 選項決定一開始是不是手機版面，`setMobile()` 模擬視窗跨過斷點並通知監聽）；頁面在 console 留下的任何東西（log、warn、error）都記在 `consoleErrors` 而不印出來；disabled 的按鈕 `click()` 什麼都不做，在 `hidden` 裡的元素 `focus()` 拿不到焦點；`rows()` 取列表每一列目前的樣子，`row(name)`／`detail(name)` 取某一列的按鈕與展開的詳情，`marks(element)` 取 `<mark>` 標出來的字，`count()`、`more()`、`chip(value)`、`type(text)` 取筆數、「顯示更多」、篩選按鈕與在搜尋框打字）。`tests/dungeon-data.test.js` 讀真正的 `data/dungeons.json`，守住資料：顯示中（`visible` 不是 `false`）的正好是編號 1～362，總共 803 筆、藏起來 441 筆，`metadata.visible_count`／`hidden_count` 是 362／441；顯示中沒有範本內容（機制或簡介以「待補充」開頭），也沒有兩筆機制或簡介一模一樣；顯示中每一筆的等級落在它版本的範圍（2.x 1–50、3.x 51–60 … 7.x 91–100）；類型與版本的筆數；顯示中的每一種類型與版本，都有 `tools/dungeon-database/index.html` 裡 `#typeTags`（`data-type`）、`#expansionTags`（`data-expansion`）的篩選按鈕，每一顆按鈕都至少對到一筆，也沒有重複的按鈕；舊用語「24人大型任務」「蒼穹之禁城」已拿掉。`tests/dungeon-list.test.js` 在 vm 裡載入真正的 `dungeon-list.js` 與 `data/dungeons.json`，守住 `DungeonList`（純函式，不碰 DOM、不靠 `this`、不改傳進去的資料，傳深層凍結的資料也照常回傳）：`prepare()` 只取顯示中的 362 筆、版本由新到舊、同版本照資料原本的順序、不認得的版本排在最後；`normalizeQuery()` 去掉前後空白並轉小寫；`matches()`／`filter()` 比對名稱、簡介、機制與每一項掉落物（子字串、不分大小寫、不是正規表示式，類型、版本、獎勵不搜），類型與版本同一組是「或」、兩組之間與搜尋是「且」、空的代表全部；`hits()` 回傳名稱以外命中的欄位（第一個含搜尋字的掉落物與還有幾項也符合、機制、簡介）；`segments()` 把每一次出現都標出來而且接回去還是原字（資料裡每一個名稱、機制、簡介與掉落物都切一遍，擋住轉小寫會改變長度的字元）；`reward()` 把第一個「: 」換成空白、「無」是 `null`；`BATCH`（30）、`VERSION_ORDER` 與物件本身都是凍結的。`tests/dungeon-database-page.test.js` 用 `dungeon-page.js` 在 vm 裡執行副本資料庫頁，守住：一打開是 30 列、「共 362 個副本」與「顯示更多（還有 332 個）」，資料來源的筆數由程式填入（三語）；一列是一顆按鈕（`aria-expanded`、`aria-controls` 指到詳情），點列裡的字也能展開、點詳情不會收起，可以同時展開好幾列，展開與收起只改那一列（`li` 與焦點都留在原地），詳情第一行是名稱（在按鈕外面，選得起來），獎勵與掉落物的空值；「顯示更多」只在後面加 30 列、不重畫已經在的列，並把焦點移到新加的第一列；搜尋延遲 300 毫秒、後一次取代前一次，命中行（掉落物、機制、簡介；只有命中的才有、順序固定、只有名稱命中時沒有）與 `<mark>`（名稱、命中行與展開的詳情都標；詳情的標示要從 `aria-controls` 指到的詳情裡找，不能從列上找，列上的命中行用同樣的 `data-field`），沒有符合時列表藏起來、筆數換成找不到的那一句並加 `visually-hidden`；搜尋或重畫時焦點在某一列上，那個副本還在就留在它的按鈕上；篩選的「或」／「且」、`aria-pressed`、回到 30 列、展開保留，點篩選按鈕與「清除篩選」立刻套用搜尋框現在的字並取消還沒跑的延遲搜尋，沒選任何篩選時「清除篩選」是 `aria-disabled`；手機的「篩選」按鈕（三語的文字與數字、開合、不影響已套用的篩選、換語言不變），以及跨過斷點時焦點在面板裡才展開、其餘維持收起；找不到的畫面（標題與按鈕照搜尋字與篩選，搜尋字與篩選都有時說是在篩選裡找不到，筆數與標題同一句並有 `visually-hidden`、有結果時沒有，搜尋字用去掉前後空白的原字、不當成標記或參數，三語，載入失敗時不顯示；清除搜尋與清除篩選都把焦點放回搜尋框，清除搜尋取消還沒跑的延遲搜尋，手機的面板收起時照樣能清掉篩選）；切換語言時文字換、展開與已列出的筆數不變、焦點留在同一個副本；載入失敗只顯示錯誤訊息，沒有空的列表、筆數或「顯示更多」，console 是空的；替身本身的行為；並檢查 `index.html` 的標記（沒有等級那一組、深層迷宮與異聞迷宮的按鈕、圖片相關的標記、`.btn-primary` 與內嵌 `style=`，類型與版本按鈕的順序和名稱，腳本順序，不載入 `security-utils.js`，meta description，「篩選」按鈕（在 `.result-bar` 裡、筆數後面、面板前面）與找不到的空狀態，另外照真正的標記建出來檢查 `#filterCard` 的三塊與順序）、`style.css`（手機版面的 `@media` 條件和攻略資料的 `MOBILE_QUERY` 逐字相同、電腦版面看不到「篩選」按鈕並用 `order` 把筆數排在面板後面、手機版面的 `.result-bar` 一行（筆數靠左、按鈕靠右）、按鈕 `--control-md` 高、沒打字時搜尋框把清除鈕拿掉（整份只有這一條規則、只在 `:placeholder-shown`）、用 `hidden` 切換的元素都有 `display: none`、一列的格線與換行、整份沒有 `overflow-x`）與翻譯檔（三語的鍵與 `{參數}` 一致，不再用的鍵已拿掉）。這支比較元素一律用 `isSame`（沿用 `mini-cactpot-page.test.js`）。Lodestone 角色查詢另有三份測試與兩個輔助模組。頁面測試共用 `tests/helpers/lodestone-page.js`（作法照 `dungeon-page.js`：用 `fake-dom.js` 照 `index.html` 建出 `#lodestoneTool`，依 `index.html` 的 `<script src>` 順序載入這個工具的翻譯檔、共用的 `ff14-game-data.js` 與工具目錄的每個腳本（`lodestone-data.js`、`lodestone-model.js`、`lodestone-store.js`、`lodestone-tabs.js`、`script.js`），再 `new LodestoneLookup()`；頁首、頁尾、`common.js`、`i18n-manager.js` 不載入，頁面用到的 `i18n` 與 `FF14Utils.getI18nText()` 換成替身，取字自真正的翻譯檔，`setLang()` 換語言；`fetch` 只認 Worker 的網址（不連網路），每一次呼叫記在 `requests`（路徑、查詢參數與 `signal`），`routes` 以路徑為鍵、值是回答或回答的函式（回答可以晚到、可以失敗；沒設的路徑讓 `fetch` 丟 `TypeError`，就像舊 Worker 沒有的端點被瀏覽器擋下），取消時還沒回來的請求被拒絕，和瀏覽器一樣；`history` 替身讓 `pushState`／`replaceState` 換掉網址、`back()`／`forward()` 派送 `popstate`；`stored` 給 `localStorage` 的初始內容、`storageThrows` 讓光是讀 `localStorage` 就丟例外；頁面在 console 留下的任何東西都記在 `consoleErrors`；`view()`、`profile()`、`resultRows()`、`tabs()`、`panelText()` 取畫面目前的樣子，`type()`／`paste()`／`chooseWorld()`／`submit()`／`selectTab()`／`key()` 操作頁面，`flush()` 讓 promise 跑完）與 `tests/helpers/lodestone-fixtures.js`（假回應，格式照 Worker 的 README：新格式有部隊名稱、`ActiveClassJob`、`FetchedAt`、`Gear`，另有現在正式站舊 Worker 的格式：部隊只有 `{ ID, Crest }`、沒有 `ActiveClassJob`、`FetchedAt`、`Gear`；人名、部隊名稱、ID 與頭像網址全是假的，不放真實玩家的資料）。`tests/lodestone-model.test.js` 在 vm 裡載入真正的 `ff14-game-data.js`、`lodestone-data.js` 與 `lodestone-model.js`，守住四份靜態資料與 `LodestoneModel`（資料與模組本身都是深層凍結的；函式是純函式，不碰 DOM、不讀時鐘與 `localStorage`、不靠 `this`、不改傳進來的資料，傳深層凍結的資料也算得對）：`LODESTONE_JOBS` 是官方順序的 34 個職業，分七組，繁中、英文、日文名稱照 `TERMINOLOGY.md` 與官網，限定職業只有青魔法師與 Beastmaster，圖示是 `assets/images/se/FFXIVJobIcons/` 底下的路徑而且檔案存在（Beastmaster 沒有圖示）；`LODESTONE_BASE_CLASSES` 九個基本職業各放進它的職業那一格；`LODESTONE_WORLDS` 是 11 個資料中心與 85 個伺服器，值就是官網 `worldname`；`LODESTONE_TERMS` 五種原文對照（部隊活動重點、招募對象、大國防聯軍、聲望、開始城市）認得英文與日文原文；中文用語不用舊的錯誤寫法；`parseInput()` 從角色頁網址（不論哪個地區站）取出 ID、去掉空白後全是數字是 ID（全形數字與零寬字元先換掉，日文輸入法打的 `１２３４５６７８` 也是 ID）、其他是名字（撇號與連字號照舊，只去掉前後的空白與零寬字元，空白是 `empty`）；`jobGroups()`／`maxedCount()` 只有 Lv100 算滿級（限定職業不標，`-` 與 `0` 是沒解鎖），基本職業放在職業那一格，位置照 `LODESTONE_JOBS`、不照 Worker 放的組；`activeJob()` 的 `Key` 對到職業就用網站的名稱與圖示（基本職業換成它的職業），`Key` 是 `null` 時用官網的圖示，沒有 `ActiveClassJob` 是 `null`；`activeClassJobOf()`、`freeCompanyOf()` 把新舊 Worker 的目前職業與部隊換成同一個樣子（舊 Worker 的目前職業只有官網的圖示與等級，部隊沒有名稱）；`dcOf()`、`defaultDataLang()`、`characterUrl()`、`officialSearchUrl()`（名字裡的撇號、`&`、`#`、`?` 原樣送到官網）；`person()` 存職業鍵而不是名稱（名稱在畫面上才用目前的介面語言查，換語言後存著的卡片才不會是舊語言；舊 Worker 的角色存下的職業與等級和標頭寫的一樣）；`term()` 只有中文介面換官方繁中；`isEmptyBio()`、`filterByName()`、`worldLabel()`。`tests/lodestone-store.test.js` 只載入 `lodestone-store.js`，守住 `LodestoneStore`（用假的 storage 傳進去，不靠 `this`、不改傳進來的東西）：三個鍵與最多 5 個；我的角色存成固定七個欄位的 JSON（缺的補空字串或 `null`、多的拿掉、數字的 `id` 轉成字串），壞掉的內容讀出來是 `null`，不合格的人不寫也不蓋掉存著的；最近查過新的在前、最多 5 個、同一個 `id` 只留最新的、滿了之後再查裡面的人不會擠掉別人、我的角色不放進來、設成我的角色時從最近查過拿掉而其他人的順序不變、只存 `id`、`name`、`world`、`dc`、`avatar` 五個欄位（`job` 與 `level` 只有我的角色才存），存著的清單有壞項目、重複、太長或含我的角色時讀出來也整理好；名稱與成就顯示只認 `en` 與 `ja`；三樣東西各存各的；讀寫丟例外時照常運作（讀到預設值、寫回 `false`、不丟錯），寫不進去時回傳新的清單、存著的一個字不動；接上 `LodestoneModel.person()` 存的那一筆讀回來一樣。`tests/lodestone-page.test.js` 用 `lodestone-page.js` 在 vm 裡執行整頁，守住：打開時（第一次來只有一句說明與找人，伺服器選單是全部伺服器、11 個資料中心、85 個伺服器；有我的角色與最近查過時依序是我的角色 → 找人 → 最近查過；點我的角色或最近查過的一列打開那個角色，那一列跟著藏起來時焦點移到「← 找其他人」；我的角色、最近查過與搜尋結果的每一列，螢幕閱讀器念的名字和下面那一行中間有看不見的停頓，下面那一行的每一段（伺服器與資料中心、職業與等級、部隊）各自一個 `.person-meta-part`，「・」接在前一段後面）；搜尋（只帶 `name`、`world`、`dc`、`page` 四個參數，摘要用官網的總數，每一列有名字、伺服器與部隊；還有下一頁時寫「還有更多結果」，選資料中心時摘要寫資料中心；沒有結果寫在哪裡找不到；搜尋不能用——舊 Worker 沒有搜尋端點被瀏覽器擋下、連不上、502、其他失敗——時寫原因並給到官網搜尋的連結；名字欄貼角色頁網址或 ID 時不搜尋、直接打開，貼上網址時名字欄馬上換成 ID，`Y'shtola Rhul` 這種名字原樣搜尋，空白什麼都不打；只有一個結果也列出來、不自動打開）；角色標頭（名字、稱號、伺服器與部隊、現在的職業（網站的圖示、基本職業顯示它的職業、認不出的用官網圖示、Beastmaster 用文字圖示、名稱跟著介面語言）、資料時間、設成我的角色、在 Lodestone 打開的網域跟著名稱與成就顯示；舊 Worker 的回應（設成我的角色時存下的等級和標頭寫的一樣）；沒有加入部隊；稱號是空字串；404、502 與其他失敗各寫各的原因，都有「← 找其他人」，不記進最近查過）；網址與上一頁（`?id=` 直接打開那個角色，不是 ID 時是打開時；「← 找其他人」新增一筆紀錄並把焦點放在名字欄；上一頁、下一頁在打開時、搜尋結果與角色之間切換，搜尋結果從記憶體拿，不在了（或記憶體裡是之後另一次搜尋的結果）就是打開時，不再搜尋）；我的角色與最近查過（設成我的角色存進記憶並從最近查過拿掉，取消時放回去；打開成功時記進最近查過；打開我的角色時更新卡片；封鎖網站資料或寫不進去（容量已滿）時照常查，這次打開期間記得）；名稱與成就顯示（預設跟介面語言，日文介面是日本語；按了之後記住，之後的請求帶 `dc=jp`；看角色時切換會重新打標頭與目前的分頁，兩組按鈕一樣，舊語言的回應晚到不採用，標頭還在載入時切換、切換後打不開、搜尋結果上切換都照顧到）；六個分頁（`role="tab"` 與 `role="tabpanel"`，第一次打開才載入、只載入一次，打開角色只打標頭與 `/classjob`；鍵盤：左右方向鍵頭尾相接、Home／End，按著 Alt／Ctrl／⌘ 不處理；換角色回到職業，換名稱與成就顯示留在原本的分頁（開著部隊、裝備或其他時，等新的標頭回來再用新的語言載入）；職業、成就、裝備（只有圖示與染色，染色最多兩色、不是 `#rrggbb` 的不畫）、收藏（篩選框同時篩兩個清單）、部隊、部隊成員（點一列打開那個成員）、其他各自的內容、空狀態與錯誤；標頭的部隊名稱是切到部隊分頁的按鈕，舊 Worker 的部隊名稱等部隊分頁載入後補上；換介面語言時分頁的字換成那個語言，不重新打請求）；請求競爭（查 A 之後很快查 B、搜尋 A 之後很快搜尋 B，A 的資料、錯誤與收尾晚到都不能蓋掉 B，A 的請求已取消；新的角色清掉舊角色的部隊、稱號、目前職業、資料時間與分頁狀態；分頁的請求各自失敗時標頭與其他分頁照常，失敗的分頁寫原因與「再試一次」；A 的分頁回答晚到不蓋掉 B，也不幫 B 的標頭補部隊名稱；換頁用當下的名稱與成就顯示，較舊的頁數晚到不蓋掉最後選的那一頁；舊角色的換頁按鈕不能污染新角色）；並檢查 `index.html` 的標記（三種畫面、找人表單與六個分頁的順序，腳本順序，整頁只有一顆 `.btn-primary`，不載入 `security-utils.js`，meta description）、腳本（不用 `SecurityUtils`、`innerHTML` 與 console，翻譯鍵都是寫死的字串，沒有內嵌 `style=`，只有染色的色點由腳本設顏色）、`styles.css`（每個用 `hidden` 切換的元素都有 `display: none`，沒有 `overflow-x`、色碼、`@import` 與 `!important`，分頁放不下就換行，職業名稱放不下時換行而不截斷、格子放寬到每種語言最長的名稱放得進一行，名字下面那一行的每一段是 inline-block）、用語（中文不出現「公會」「大國防軍」「恆輝隊」與 7 個舊職業名，日文的官方職業名不算）與翻譯檔（三語的鍵與 `{參數}` 一致，每個鍵都有人讀，讀的鍵都在翻譯檔裡）。這支比較元素一律用 `isSame`（沿用 `mini-cactpot-page.test.js`）。`tests/ff14-game-data.test.js` 在 vm 裡載入真正的 `assets/js/ff14-game-data.js`（職業與伺服器的共用資料，Lodestone 角色查詢用它），守住：`FF14_JOBS` 是 34 個職業、`FF14_WORLDS` 是 11 個資料中心與 85 個伺服器、`FF14_TC_WORLDS` 是繁中服的 6 個伺服器而且都不在國際服清單裡、三份資料都是深層凍結的、共用檔只掛這三個全域（`deepFreeze` 不外露）、`lodestone-data.js` 的 `LODESTONE_JOBS`、`LODESTONE_WORLDS` 就是共用的那兩份（同一個物件），以及 `assets/`、`tools/`、`scripts/`、`api/` 底下共用檔以外的 JS 都不宣告、不指定這三個名稱（`common.js` 以前有一個同名的舊常數；頁面測試的替身不載入 `common.js`，只有直接掃檔案才看得到這種衝突）。Worker 測試需要允許 localhost 連接埠；`.github/workflows/test.yml` 在 push／PR 自動執行全套測試與兩個 Worker 環境的 dry-run。每次 commit 前執行。網站主體沒有 package.json、bundler 或 linter（`api/` 的 Cloudflare Worker 子專案另有自己的 `package.json`／`wrangler`，與網站建置無關）。

**導覽列、頁尾、首頁、版權聲明頁與 404 頁的測試：** 共用十七個輔助模組：`tests/helpers/fake-dom.js`（不需 jsdom 的最小 DOM 替身，在 vm 裡執行真正的瀏覽器腳本）、`tests/helpers/html-fragment.js`（解析頁面 HTML 的小工具，也能把 `index.html` 裡指定 id 的元素建成 fake-dom 節點，讓測試用真正的標記；寶圖搜尋器的測試使用）、`tests/helpers/translation-parsers.js`（翻譯檔的鍵值解析）、`tests/helpers/panel-page.js`（寶圖搜尋器清單面板的頁面替身，從 `treasure-list-panel.test.js` 抽出，可以接真的 `RoomCollaboration`，說明見上面的測試段落）、`tests/helpers/weather-page.js`（天氣預報頁的頁面替身，三份天氣頁測試共用，說明見上面的測試段落）、`tests/helpers/gathering-page.js`（特殊採集時間管理器頁的頁面替身，`timed-gathering-page.test.js` 使用，作法照 `weather-page.js`，說明見上面的測試段落）、`tests/helpers/cactpot-page.js`（仙人微彩頁的頁面替身，`mini-cactpot-page.test.js` 使用，作法照 `weather-page.js`，說明見上面的測試段落）、`tests/helpers/wondrous-page.js`（天書奇談頁的頁面替身，`wondrous-tails-page.test.js` 使用，作法照 `cactpot-page.js`，說明見上面的測試段落）、`tests/helpers/hollows-page.js`（宗長計算機頁的頁面替身，`faux-hollows-page.test.js` 與 `faux-hollows-probability.test.js` 使用，作法照 `cactpot-page.js`，說明見上面的測試段落）、`tests/helpers/chocobo-page.js`（陸行鳥染色計算器頁的頁面替身，`chocobo-color-page.test.js` 使用，作法照 `cactpot-page.js`，說明見上面的測試段落）、`tests/helpers/dungeon-page.js`（副本資料庫頁的頁面替身，`dungeon-database-page.test.js` 使用，作法照 `chocobo-page.js`，說明見上面的測試段落）、`tests/helpers/lodestone-page.js`（Lodestone 角色查詢頁的頁面替身，`lodestone-page.test.js` 使用，作法照 `dungeon-page.js`，說明見上面的測試段落）、`tests/helpers/lodestone-fixtures.js`（Lodestone 頁面測試用的假回應，新舊兩種 Worker 的格式，說明見上面的測試段落）、`tests/helpers/macro-page.js`（巨集轉換器頁的頁面替身，`macro-converter.test.js` 使用，作法照 `chocobo-page.js`，說明見上面的測試段落）、`tests/helpers/canvas-recorder.js`（記錄呼叫的 2D context 替身，`character-card-renderer.test.js` 與角色卡頁的頁面替身共用，說明見下面的角色卡測試）、`tests/helpers/card-page.js`（角色卡產生器頁的頁面替身，`character-card-page.test.js` 使用，作法照 `chocobo-page.js`，說明見下面的角色卡測試）與 `tests/helpers/notification-stubs.js`（`Notification`、`AudioContext` 的替身，從 `weather-page.js` 抽出，天氣頁與採集頁的頁面替身共用）。它們不是測試檔，`node --test` 不會直接執行。
- `tests/tools-registry.test.js`：登錄表依首頁順序列出 14 個工具、站內網址存在、名稱鍵在 `common.js` 的 zh／en／ja 都有；首頁工具卡與每個工具頁頁首的名稱都要和登錄表一致
- `tests/footer-template.test.js`：頁尾連結的順序與屬性、版權年份、沒有 i18n 時顯示 zh 文字、SQUARE ENIX 的版權標示（四列的第三列，切換語言時原封不動）、免責聲明分成前半句／公司名稱／後半句三段翻譯（名稱與後半句是 `span.footer-nowrap`，`common.css` 讓它不換行，切換語言時名稱整個在這一段裡）
- `tests/copyright-page.test.js`：版權聲明頁的 SQUARE ENIX 標示（HTML 預設字與 zh／en／ja 都是 `FINAL FANTASY XIV © SQUARE ENIX`），網站的頁面與翻譯檔不再有「2010 - 2025」與「Copyright (C)」；有連結的兩句（「FF14 圖示來源」與「聯絡方式」）照 I18nManager 的做法用 zh／en／ja 與 HTML 預設字組起來都是完整的一句（連結的字只出現一次、標點前面不多空格）；版權聲明頁的版面：標題前面沒有圖示、內文不左右對齊、768px 以下標題和電腦一樣靠左（SE 那一段照舊置中）、日文那一段和其他段一樣靠左（照舊是斜體小字）、SE 那一行用 `text-wrap: balance`（手機上不從名字中間斷開）；手機上其他名字也不從中間斷開：標題 `word-break: keep-all`（中文只在空格斷行，不會剩一個字掉到下一行），粗體的名字、連結與「FF14 圖示來源」那一句的遊戲名稱（`.nobr`，各語言的名稱在翻譯檔的 `copyright_icon_p1_game`）`white-space: nowrap`（SE 那一段除外）；「關於」頁共用的規則照舊（左右對齊、手機上標題置中、三個圖示）
- `tests/macro-engine.test.js`：巨集轉換器的轉換規則；在 vm 裡載入真正的 `conversion-engine.js` 與 `data/macro-mappings.json`（不載入頁面），守住 `ConversionEngine`：`convert()` 一行輸入對應一個 `{ output, problems }`（`\r\n`、`\n` 與單獨的 `\r`（舊式 Mac）都算換行，兩行不會黏成一行，輸出不帶 `\r`，舊的 `untranslatable` 欄位拿掉），`problems` 的項目是 `{ kind: 'action' | 'command' | 'text', text }`（技能名沒有收錄、指令不認得、不是指令的行，沒有問題是空陣列）；英文（Teamcraft 匯出）與日文攻略各一段完整巨集，逐行輸出照測試裡寫死的對照表、沒有任何問題；`SHORT_COMMANDS`（凍結的 30 個英文簡寫：`/mlock`、`/merror`、`/micon`、`/e`、`/p`、`/s`、`/sh`、`/y`、`/t`、`/r`、`/a`、`/fc`、`/em`、`/gs`、`/l1`～`/l8`、`/cwl1`～`/cwl8`，完整指令都在資料的 `baseCommand` 裡）不論目標語言都照打的大小寫原樣輸出、不列入問題，不在表裡的（`/mloc`、`/l9`）照樣是 command 問題；`/macroicon`、`/micon` 的參數當成技能名翻譯，第二個參數（`action`、`item`）原樣保留；彎引號（`“ ” „`）換成直引號再比對、技能名裡的 `’` 換成 `'`，輸出一律用直引號，`/echo` 之類的文字不動；引號裡的技能名比對前先把字與字中間、前後的空白（不換行空白 U+00A0、全形空白 U+3000、tab、好幾個空白）整理成一個空格，從網頁複製的名字不會被誤判成沒收錄，真的沒收錄的名字輸出與問題的文字照原文；沒加引號的技能名：`/ac`、`/action`、`/技能`、`/アクション` 要整段（指令後面到第一個 `<…>` 之前）查得到才換，查不到整段照原文、整段列成一個 action 問題（`/ac Manipulation II` 不會因為前半段是技能就悄悄變成 `"掌握" II`），只有 `/macroicon`、`/micon` 取最長的字首（`/micon Manipulation action`：它後面可以有第二個參數）；不認得的指令整行照原文、列入 command 問題；不是 `/` 開頭的行（貼上的標題、表格複製下來的編號如 `1\t/ac 確信 <wait.3>`、`#` 備註：遊戲沒有註解的寫法，沒有 `/` 的一行會被送到聊天）整行照原文、列入 text 問題（問題的文字是去掉前後空白的整行，`parseLine()` 沒有 comment 類型，`#` 開頭的行和其他沒有 `/` 的行一樣），空白行（含只有全形空白、不換行空白的行）不動、不是問題；全形空白、縮排與大小寫照樣認得；`<me>`、`<t>`、`<se.1>`、`<wait>` 這類尖括號原樣保留；目標是英文與日文時技能名與完整指令換成那個語言（`/ac` 照舊輸出 `/ac`）
- `tests/macro-converter.test.js`：巨集轉換器頁，用 `tests/helpers/macro-page.js`（頁面替身，作法照 `chocobo-page.js`：用 `fake-dom.js` 照 `index.html` 建出 `#macroTool`，依 `index.html` 的 `<script src>` 順序載入這個工具的翻譯檔與工具目錄的每個腳本（`conversion-engine.js`、`script.js`），再 `new MacroConverter()` 並等 `app.ready`；頁首、頁尾、`common.js`、`i18n-manager.js` 不載入，頁面用到的 `i18n`、`FF14Utils.getI18nText()` 與 `showToast()` 換成替身，取字自真正的翻譯檔，`setLang()` 換語言（只是網站的介面語言，和轉換的目標語言無關），`toasts` 記下每一次 toast；`fetch` 只認 `../../data/macro-mappings.json`，`fetchResults` 依序決定每一次載入的結果（`'ok'`、`'fail'`、`'pending'`，用完之後一直用最後一個），`stored` 給 `localStorage` 的初始內容、`storageThrows` 讓光是讀 `localStorage` 就丟例外，頁面在 console 留下的任何東西都記在 `consoleErrors`；`type(text)` 設定輸入框的值並派送 `input`，`output()`、`outputTitle()`、`warnings()` 取輸出框、輸出標題列與要注意的行（整塊 `hidden` 時是 `[]`），`reopen()` 用同一份儲存內容再開一次頁面；`clipboard` 選項是 `'ok'`（預設）、`'reject'` 或 `'hold'`，`'reject'` 讓 `navigator.clipboard` 的 `writeText()`、`readText()` 都回傳被拒絕的 Promise（`clipboardMode` 可讀可寫，先成功再失敗的情況在測試裡改它），`'hold'` 讓 `writeText()` 先不回來（瀏覽器還在問權限、剪貼簿還在寫），`releaseClipboard()` 才讓等著的每一筆照順序寫進去並回來（`releaseClipboard(index)` 只放還在等的第 index 筆，模擬後按的先寫完；`readText()` 同 `'ok'`），`'ok'` 時 `clipboard` 記下每一次寫進剪貼簿的字、`clipboardText` 是剪貼簿現在的內容（要「貼上」的字先寫在這裡，空字串、只有空白的字照實讀到：複製的是圖片時 `readText()` 讀到的就是空字串）；`setTimeout` 只記下、不真的計時，`runTimeouts()` 跑排著的、`pendingDelays()` 看排著的延遲毫秒數，`settle()` 等 `await` 跑完；這份 `document` 的元素 `disabled` 時 `click()` 什麼都不做，`disabled` 或在 `hidden` 裡的元素 `focus()` 拿不到焦點，`aria-disabled` 的不算：瀏覽器照樣送出 `click`，要由頁面自己擋；元素設成 `hidden` 時，焦點在它（或它的子孫）上就掉到 `body`（瀏覽器的行為；`fake-dom.js` 藏起來焦點照樣留著，「焦點回到某個元素」的測試就永遠不會失敗，只在這份替身補上，沒有動共用的 `fake-dom.js`），`disabled` 設成 `true` 不模擬焦點掉走，頁面用 `aria-disabled` 的地方由測試直接檢查沒有 `disabled`）守住：一打開輸入框是空的、目標語言是繁體中文、輸出是空的、標題列只有語言名稱；打字（`input` 事件）就立刻轉換，沒有「轉換」鈕也沒有 Ctrl／⌘＋Enter；輸出標題列的語言名稱（三種介面語言各自對三種目標語言）、中間的符號（每種語言自己的翻譯：中文、日文 `・`，英文 ` · `）與行數（英文照單複數；只算到最後一個非空行，結尾的空行與只有空白的行不算，空行在前面或中間照算，`\r\n` 照算、輸出不帶 `\r`；整份都是空白時只寫語言名稱、輸出是空的）；要注意的行（依行號列出沒有收錄的技能、不認得的指令與不是指令的行（貼上的標題、表格的編號、`# 備註`：三種混在一起依行號排，三語，問題的文字是去掉前後空白的整行，空白行不是問題，標題也算輸出的一行所以 15 行加一行標題是 16 行、要分成 2 個巨集，標題那一條在前、超過 15 行的提醒在最後），空行與 `\r\n` 也占行號，沒有問題或清空後整塊 `hidden`、舊的 `li` 不留，改目標語言後照舊；尖括號當成文字：問題的文字真的有 `<me>` 時（指令、技能名、整行的原文都一樣）`#macroWarnings` 裡也沒有元素）；超過 15 行時最後一條寫要分成幾個巨集（15 行沒有，16、30 行是 2 個，31、45 行是 3 個，46 行是 4 個，排在各行的問題後面；結尾有好幾個空行時照最後一個非空行算）；改目標語言立刻重轉、標題列的語言名稱也換、存進 `ff14tw_macro_target_lang`、重新打開還在，存著的值壞掉、讀不到（`localStorage` 光是存取就丟例外）或只有寫不進去（容量已滿）時是繁體中文、照常運作、console 是空的；切換網站介面語言不改目標語言、輸入、輸出與儲存，標題列、要注意的行（含超過 15 行的那一條）、按鈕、標籤與輸出框的提示字換成那個語言；載入中顯示 `#loadingIndicator`、載入失敗顯示 `#loadError`（切換語言時跟著換），兩種情況 console 都是空的、`app.ready` 都會完成；輸入是空的時改目標語言，輸出還是空的、標題列只換語言名稱；複製：整頁唯一的 `.btn-primary`，沒有輸出（一打開、刪光、只有空白、按清除之後）時 `aria-disabled="true"`（不是 `disabled`）、按了不寫剪貼簿、不跳 toast、不排計時、焦點還在按鈕上，有輸出就拿掉；成功時寫進剪貼簿的是輸出框的字、按鈕暫時寫「✓ 已複製」並跳 toast「已複製」、`pendingDelays()` 是 `[2000]`、`runTimeouts()` 之後變回「複製」；2 秒內輸出沒變再按一次，再寫一次剪貼簿、再跳一次 toast、前一次的計時取消（只剩一個 2000）；輸出變了（改目標語言、打字、貼上、清除）按鈕馬上變回「複製」、計時取消（`pendingDelays()` 是 `[]`；清除之後不會是「✓ 已複製」又 `aria-disabled`；日文介面變回日文的「複製」），輸出沒變（技能名後面多打空白轉出來一樣、選同一個目標語言、切換網站介面語言）照舊寫「✓ 已複製」、計時不動；2 秒內切換網站介面語言，按鈕換成那個語言的「✓ 已複製」、變回來也是那個語言的「複製」；按下去到剪貼簿寫完之間（`clipboard: 'hold'`）輸出變了（清除、改目標語言、打字、貼上）時，寫完照樣跳 toast「已複製」（剪貼簿裡是按下去那一刻的輸出）但按鈕不寫「✓ 已複製」、不排 2 秒的計時（前一次的「✓ 已複製」還在時也一樣），變了又變回來時照常寫「✓ 已複製」；連按兩次而兩次都還在寫時，後按的先寫完就寫「✓ 已複製」，先按的最後才寫完（剪貼簿換回舊的輸出）就變回「複製」、計時取消，照順序寫完時最後是「✓ 已複製」；失敗（`clipboard: 'reject'`）時 toast「複製失敗，請手動選取文字」、按鈕不變、沒有排計時；「✓ 已複製」還沒變回來時又失敗（先成功、再把 `clipboardMode` 改成 `'reject'`）按鈕馬上變回「複製」（不等 2 秒，換成別的介面語言也是那個語言的「複製」）、前一次的計時取消（`pendingDelays()` 是 `[]`，`runTimeouts()` 不會再改按鈕）、剪貼簿又能用時照常暫時寫「✓ 已複製」；toast 與按鈕的字在剪貼簿的結果回來時才取字、用那時的介面語言（按下去之後、結果回來之前切換語言，用的是切換之後的語言）；貼上：讀到有字的剪貼簿就整個換掉輸入框的字（`\r\n` 換行照轉、輸出不帶 `\r`，貼上的字不 trim）並立刻轉換、不跳 toast、焦點留在「貼上」，讀不到時 toast「沒辦法讀取剪貼簿，請直接在框裡貼上（Ctrl+V 或長按）」、焦點移到輸入框、輸入框原本的字不動；讀到的是沒有字的東西（空字串，只有空白、換行、tab 或全形空白）時和讀不到一樣：輸入框、輸出、標題列、要注意的行都一個字不動（輸入框裡已經有字時才看得出來）、跳同一句 toast、焦點移到輸入框、複製還能按，輸入框本來就是空的也一樣；貼上成功時給螢幕閱讀器的一句結果（`#pasteAnnounce`：按下去先清空、100 毫秒後（`pendingDelays()` 是 `[100]`）寫「已貼上並轉換：繁體中文・2 行」，有要注意的行時接「，有 N 條要注意」，超過 15 行的提醒也算一條，目標語言照標題列，同一份巨集再貼一次也先清空再寫，焦點留在「貼上」、不跳 toast；讀不到、剪貼簿沒有字或重新轉換（打字、改目標語言（輸出一樣也算）、清除）時清空，還沒寫進去就打字或再貼上時取消前一次；英文照單複數、日文，按下去之後與寫進去之前切換語言都用切換之後的語言；`index.html` 裡它在輸入卡片的「貼上」與輸入框中間，`.visually-hidden`、`role="status"`、`aria-live="polite"`、不 `hidden`、一開始是空的）；清除：清空輸入與輸出、標題列只剩語言名稱（目標語言不變）、要注意的行整塊 `hidden` 而且沒有舊的 `li`、複製變回 `aria-disabled`、焦點回到輸入框；資料載入中輸入框與貼上 `disabled`、複製 `aria-disabled`、停用的按鈕按了什麼都不做，目標語言的選單照常能用（記住、標題列換成那個語言）；載入失敗時 `#loadError` 是 `#macroTool` 的第一個元素、輸入框與貼上維持停用、沒有資料就轉不了（輸入框裡有字也不丟錯）、不跳 toast；按「重試」：載入中錯誤收起、提示出現、`app.ready` 換成這一次載入的 promise，成功後錯誤收起、輸入框與貼上恢復、失敗時選的目標語言與輸入框裡的字載入完照用，焦點在「重試」上時移到輸入框；又失敗時錯誤訊息再出現、控制項維持停用、「重試」跟著錯誤訊息收起來的當下焦點掉到頁面上、載入完焦點回到「重試」、可以再按；焦點不在「重試」上（滑鼠點、Safari）時載入完不去動焦點；按「重試」之後、載入完之前自己移到目標語言或「清除」時，載入完焦點留在那裡（成功與又失敗都一樣）；並檢查 `index.html` 的標記（拿掉的標記與翻譯鍵、工具區塊 `#macroTool` 就是 `.tool-content` 且裡面有頁面腳本與測試共用的每個 id、說明與範圍兩行在工具區塊上面、輸入框沒有預設內容而提示字是三行範例、三行轉出來都是 `/ac "堅信" <wait.3>`、輸出框唯讀並用 `aria-describedby` 指到要注意的行、輸出標題是輸出框的標籤、兩個框 `rows="8"`、整頁只有一個 `.btn-primary` 而且是 `#copyOutput`、一開始就 `hidden` 的元素、一開始就是載入中的狀態（輸入框與貼上 `disabled`，複製是 `aria-disabled="true"` 而不是 `disabled`，複製、清除、目標語言、輸出框、重試都不停用）、`<title>` 與 meta description 等於 zh 翻譯、腳本順序（不載入 `security-utils.js`，頁面載入的每個腳本也都沒有用到 `SecurityUtils`），以及 `script.js` 不再有預設範例、Ctrl／⌘＋Enter、`console` 與 `innerHTML`；另守住載入狀態的位置：`#loadError` 是 `#macroTool` 的第一個元素，`#loadingIndicator` 在輸出卡片裡、和輸出框同一個 `.macro-output` 容器（不在輸入卡片、不在錯誤訊息裡，在輸出標題列後面）而不是工具最上面）、`style.css`（手機一欄、輸入在上輸出在下且不靠 `order`、769px 以上兩欄而且沒有中間那一欄、沒有 `overflow-x`、標題列放不下時按鈕換行靠右、電腦的框高 `textarea.macro-textarea` 放得下 15 行、中文說明的 `keep-all` 只給 `:lang(zh)`、輸出框 `#outputMacro` 的字用內文色與 `cursor: text` 而且不另外設底色、用 `hidden` 切換的元素都有 `display: none`；載入中的提示蓋在輸出框上、不占版面：`.macro-output` 是 `position: relative` 的 flex 容器（`flex: 1 1 auto`，像原本的輸出框一樣吃滿卡片剩下的高度），`#loadingIndicator` 是 `position: absolute; inset: 0` 而且沒有 `margin`、`height`，也沒有舊的 `.tool-content .loading`；複製鈕沒有輸出時 `#copyOutput[aria-disabled="true"]` 半透明、`cursor: not-allowed`，hover 與 active 維持主要按鈕的底色、不浮起、沒有陰影，鍵盤焦點的外框還在；`#copyOutput` 有 `min-width: 10.5em`，放得下三種語言裡最長的「✓ コピーしました」，「複製」變成「✓ 已複製」時按鈕不變寬、標題列不會換行）與翻譯檔（三語的鍵與 `{參數}` 一致、每個鍵的 zh 文字寫死、貼上的朗讀的條數英文有單複數、輸出標題列的符號（en `{lang} · {lines}`，ja `{lang}・{lines}`）、拿掉的鍵三語都不在、頁面用到的鍵三語都有、`index.html` 的預設文字等於 zh 翻譯）；另外守住首頁巨集轉換器卡片的說明（`tool_macro_converter_desc`：首頁 `index.html` 的預設字與 `index.js` 的 zh 翻譯都是「把英文、日文攻略的生產巨集換成繁體中文」，en、ja 有值、和改版前的不同，而且寫出生產巨集）。
- `tests/character-card-state.test.js`：角色卡的欄位（`card-state.js`，`CardState`）；在 vm 裡載入真正的 `ff14-game-data.js` 與 `card-state.js`（不載入頁面），職業清單當參數傳進去，函式不靠 `this`、不改傳進來的東西，傳深層凍結的資料也算得對。守住：預設與 `LIMITS`、`LIKES` 等常數；`normalize()` 把任何東西整理成合格的狀態（壞掉的內容變回預設、丟掉壞的部分；不 trim；字數以 Unicode 字元算、不把一個字切成兩半；等級只認有限的數字或十進位的數字字串，其他是 100；主職與其他職業要在清單裡、其他職業不含主職且最多 3 個；喜歡的內容最多 6 個；重點色只收 `#rrggbb`；`crops` 只留合格的鍵並夾在範圍內）；`validate()`（依名字、伺服器、主職的順序列出沒填的，只有空白算沒填）；`roleOf()` 與 `accentOf()`（34 個職業都有職能，自訂顏色優先）；`cropKey()` 與 `cropOf()`（橫版、直版各記一份，沒記過是填滿置中）；`load()`／`save()`／`saveImage()`／`clear()`（欄位與圖片存在兩個鍵、圖片只收 `data:image/`、讀寫丟例外（封鎖網站資料、容量已滿）或沒有 storage 時照常打開預設、不丟錯、存著的不動，其中一個鍵刪不掉另一個照刪）。
- `tests/character-card-layout.test.js`：卡片的排版規則（`card-layout.js`，`CardLayout`，凍結的純函式，文字有多寬由測試傳進去的假量字函式回答：拉丁字母 6、其他 10）：`fitScale()`（放得下是 1、放不下照比例縮小、不低於下限）、`wrapText()`（中日韓與全形的字任兩個字之間都能斷、其他文字只在空白斷、超過 `maxLines` 時最後一行接上 `…`、行首不放逗號句號與右引號右括號、英文單字連同後面的標點一起下去、不拆代理對；另外用 10 段文字 × 80 種寬度掃過：不空行、不超寬、接起來是原文、行首沒有禁用的字）、`layoutChips()`（一列放不下就換列、超過 `maxRows` 的不回傳、比一整列還寬的不縮小）、`coverRect()` 與 `dragCrop()`（截圖填滿框、位移與縮放的換算、夾在 -1～1、寬度剛好時的浮點誤差不算多出來的寬度）、`textColorOn()`（照 WCAG 對比度挑白字或深字，和照公式另外算的 216 色逐色一致）。
- `tests/character-card-renderer.test.js`：卡片怎麼畫（`card-renderer.js`，`CardRenderer`，現在只有風格 B「海報」）；用 `tests/helpers/canvas-recorder.js` 的記錄 context（node 裡沒有 canvas），載入真正的 `card-layout.js`、`card-state.js` 與 `card-renderer.js`：`SIZES`（橫版 1200×675、直版 1080×1350）與 `fontsFor()`（涵蓋每一個畫出來的字）、只有必填三項時只畫名字、伺服器、主職與 Lv、`FF14.tw` 與 SE 的版權字、全部填滿時的稱號（重點色往白色混）、膠囊（最多 6 個）、時段格子與其他職業的圖示、名字放不下時整行縮小（21 個英文字母與全形字都不超出畫布）、直版的字比橫版大、有截圖時照 `coverRect()` 的位置畫而沒有時畫預設背景、職業圖示是 `null` 時畫名稱的第一個字、沒填的欄位整塊不畫、草稿的顏色與尺寸、畫完 context 的設定原樣還給呼叫端、沒有 `roundRect` 的瀏覽器改用 `arcTo` 畫出一樣的圓角。
- `tests/character-card-image.test.js`：角色圖的縮圖與讀回（`card-image.js`，`CardImage`，凍結的純函式，不碰 DOM；讀圖 `loadImage` 與建 canvas `createCanvas` 由測試傳替身進去，在 vm 裡載入真正的腳本，不需要 `fake-dom.js`）：只掛 `CardImage` 一個全域、常數（`MAX_EDGE` 2048、`QUALITY` 0.85、`FALLBACK` `{ maxEdge: 1600, quality: 0.8 }`、`MAX_DATA_URL` 1500000）；`targetSize()`（長邊縮成剛好 `maxEdge`、另一邊四捨五入且至少 1、不放大、直的圖長邊是高、`maxEdge` 由呼叫端給、大小或上限不對是 0 × 0，逐一掃過各種形狀）；`prepare()`（`loadImage` 收到傳進來的檔案、先鋪一層不透明的底色再畫（JPEG 沒有透明）、轉成 `image/jpeg` 品質 0.85、`createCanvas` 的大小就是縮小後的大小（假的 `createCanvas` 記下建出來時的大小，因為轉完的暫存 canvas 寬高是 0）；`dataUrl` 超過 `MAX_DATA_URL`（剛好等於不算）就從讀進來的那張圖用 1600 與 0.8 再轉一次，第二次還是太長也照用、不轉第三次，再縮也不放大；讀不出來、圖的大小是 0、轉不出圖片（瀏覽器回傳 `"data:,"`）、拿不到 2d 都是 rejected，不留半個結果；暫存的 canvas 轉完（這幾種失敗也一樣）就把寬高設成 0 放掉：轉的時候寬高還在、回傳的大小是轉出來那張的，再縮一次的兩張都放掉，iOS Safari 的 canvas 記憶體有總量上限）；`fromDataUrl()`（不是 `data:image/` 開頭的不交給 `loadImage`，讀不出來或大小不對是 rejected）；傳凍結的檔案與依賴也行、每次回傳新的物件。
- `tests/character-card-export.test.js`：角色卡的輸出（`card-export.js`，`CardExport`，凍結的純函式，不碰任何全域：`nav`、`win`、`doc` 都從參數來，測試傳替身，在 vm 裡載入真正的腳本，不需要 `fake-dom.js`）：只掛 `CardExport` 一個全域、模組凍結、只有規定的函式與 `PNG_TYPE`、`REVOKE_DELAY_MS`（至少 1 秒）；`fileName()`（`ff14-<名字>.png`，前後的空白去掉，`\ / : * ? " < > |` 與控制字元每個換成 `-`，中間的空白留著，空的、只有空白、不是字串是 `ff14-character-card.png`）；`toBlob()`（照 PNG 要 Blob，callback 收到 `null`、被汙染的 canvas 丟例外、沒有 `toBlob` 都是 rejected）；`download()`（`<a download>` 先接到 `body` 再點、點完拿掉，點的時候丟例外也照樣收尾，網址不在同一個 tick 撤銷，過 `REVOKE_DELAY_MS` 才用 `doc.defaultView.setTimeout` 撤銷）；`canShareFiles()` 與 `share()`（`shared`、`AbortError` 是 `cancelled`、`NotAllowedError`（點擊的使用者手勢過期了，或這裡不准分享）是 `blocked`、其他錯誤與沒有 `share` 是 `failed`，`navigator.share` 在呼叫的當下就呼叫）；`canCopy()`（要有 `clipboard.write` 與 `ClipboardItem`）與 `copy()`（收 Blob 或 Promise<Blob>，`ClipboardItem` 與 `clipboard.write` 都在呼叫的當下就建好、呼叫，圖晚一點才好也行，任何失敗都是 `false` 而且不留下沒人處理的拒絕）；`inAppBrowser()`（LINE、Facebook、Instagram、Discord 的 User-Agent，與一般的 Safari、Chrome、Firefox）；`externalUrl()`（加上 `openExternalBrowser=1`，原本的參數與 `#` 照舊，已經有就改成 1、只留一個，跑兩次結果一樣）；傳凍結的 `nav`、`win` 也行。
- `tests/character-card-page.test.js`：角色卡產生器的編輯畫面，用 `tests/helpers/card-page.js`（頁面替身，作法照 `chocobo-page.js`：用 `fake-dom.js` 照 `index.html` 建出 `#cardTool`，依 `index.html` 的 `<script src>` 順序載入這個工具的翻譯檔、共用的 `ff14-game-data.js`、工具目錄的每個腳本，再 `new CharacterCardApp()` 並等 `app.ready`；頁首、頁尾、`common.js`、`modal-manager.js` 不載入，`i18n`、`FF14Utils.getI18nText()`、`showToast()` 與 `ModalManager` 換成替身（`FakeModalManager`：fake-dom 不支援真的那個用到的 `:not()` 選擇器，作法照 `chocobo-page.js`：`show()` 記下開啟前的焦點、焦點移到第一個看得到的可聚焦元素，`hide()` 還原焦點再呼叫 `onClose`，Esc 與點遮罩本身關掉；`#imageViewer` 在 `#cardTool` 外面，頁面替身另外把它建出來），取字自真正的翻譯檔，`setLang()` 換語言，`toasts` 記下每一次 toast；每個 `<canvas>` 的 `getContext('2d')` 回傳 `canvas-recorder.js` 的記錄 context，設定寬高會像真的 canvas 一樣清掉畫面並重設，所以 `drawCalls()`、`texts()` 只看得到最近一次畫的東西，`drawCount()` 是畫了幾次，`toBlob`（呼叫的當下就把 `{ type, quality, width, height, draws, texts }` 記進 `blobRequests()`，`blobFails` 選項或 `setBlobFails(true)` 讓 callback 收到 `null`）、`toDataURL` 也有替身；`document.fonts.load()` 記在 `fontLoads`，`fontsDelay` 讓它一直不回來（同一次畫請求的算一批，`heldFontBatches()` 看還在等的是哪幾批），`releaseFonts()` 放行全部、`releaseFonts(index)` 只放行第 index 批（模擬後請求的先載完）、`{ fail: true }` 讓那一批載入失敗；`Image` 的替身依 `icons`（`'load'`、`'fail'`、`'hold'`）決定職業圖示怎麼結束，建出來的記在 `images`；角色圖的 `Image`（`src` 是 `blob:` 或 `data:`）另外記在 `pictures`：大小讀自 `file({ width, height })` 的檔案或 `dataUrlOf(寬, 高)` 的 data URL（canvas 的 `toDataURL` 替身轉出來的就是這種，所以轉出來再讀回來是同一個大小），`file({ broken })` 讓檔案讀不出來、`file({ hold })` 讓那個檔案讀得慢（`finishFile(檔案, ok)` 讓它結束）、`pictureLoads: 'hold'` 讓 `data:` 的一直不結束（`finishPictures(ok)` 全部結束），`blob:` 網址撤掉（`URL.revokeObjectURL`）之後才載入的和瀏覽器一樣讀不出來；`URL.createObjectURL`／`revokeObjectURL` 記在 `objectUrls`，不是物件的東西丟 `TypeError`；`pick(檔案)` 照瀏覽器選檔案（`#cardImageInput.files` 是 FileList 的替身，沒有陣列的方法，頁面把 `value` 設成 `''` 才清掉，派送 `input` 與 `change`）、`slide(值)` 動縮放滑桿（disabled 時丟錯）、`pointer('down' | 'move' | 'up' | 'cancel', …)` 與 `drag(點們)` 在卡片上派送 pointer 事件（事件的 `buttons` 照瀏覽器：按下去到放開之前是按著的那顆按鍵，其他時候是 0，也可以自己傳；`up`、`cancel` 之後，卡片還抓著那個 pointer 就和瀏覽器一樣放掉並派送 `lostpointercapture`，`releasePointerCapture` 放掉抓著的 pointer 也一樣；`lose(id)` 只派送 `lostpointercapture`（抓取被拿走、沒有 `pointerup`）；`captures` 記 `setPointerCapture` 等呼叫，`pointerCapture: 'throws'` 讓抓取丟 `NotFoundError`）；卡片的 `getBoundingClientRect()` 是 canvas 的寬高乘 `displayScale`（預設 0.5，拖曳的換算有 2 倍，`setDisplayScale(0)` 是藏起來）；`storageFull` 讓指定的鍵寫入時丟 `QuotaExceededError`（容量已滿），`storageWrites` 記每一次寫入的鍵，`dataUrlRequests` 記每一次 `toDataURL`；`matchMedia` 只認 `(max-width: 768px)`（`narrow`、`setNarrow()`）與 `(pointer: coarse)`（`coarse`、`setCoarse()`）；`setTimeout` 只記下，`runTimeouts()` 與 `pendingDelays()` 讓清除全部的 3 秒走完；`stored` 是 `localStorage` 背後的 Map，`storageThrows` 讓光是讀 `localStorage` 就丟例外；`userAgent`、`share`、`clipboard` 選項模擬 `navigator`（`shareCalls`、`clipboardCalls` 在呼叫的當下就記，測試靠它看是不是同步呼叫的：瀏覽器要求在使用者手勢裡；`shares`、`clipboardWrites` 是完成的，`clipboardWrites` 和瀏覽器一樣等每個 `ClipboardItem` 的內容（Blob 或 Promise<Blob>），內容被拒絕時 `write` 也被拒絕、不記；`share: 'expired'` 只收 `press()` 那一下點擊裡同步呼叫的 `navigator.share`，之後才呼叫的丟 `NotAllowedError`：點擊的手勢過期了，替身沒有時間，先 await 了什麼才呼叫就算過期；`'blocked'` 一律丟 `NotAllowedError`，`'fail'` 丟別的錯 `DataError`），`fileConstructor: false` 讓沒有 `File` 建構函式，`hideKeepsFocus: true` 模擬 Safari 藏起有焦點的元素時焦點不掉、不送 `focusout`（預設照 Chrome：掉到 `body`、送 `focusout`）；`downloads` 記每一次 `<a download href>` 被點（照 Firefox 的規則，沒接在文件上的連結點了沒有用，不記）；`focus()` 在焦點真的換過去之後派送 `focusin`（fake-dom 只送 `focusout`），`focus(目標)` 是替身的方法；disabled 的元素 `click()` 什麼都不做，勾選框與單選照瀏覽器的順序換 `checked` 並派送事件，藏起來的元素拿不到焦點、焦點所在的元素被藏起來時掉到 `body`（`hideKeepsFocus` 時不掉）；`querySelectorAll()` 與 `.children` 的結果和瀏覽器一樣是 NodeList、HTMLCollection 的替身（有 `length`、`item()`、索引、迭代，沒有 `map`、`filter`、`find` 這些陣列的方法，`.children` 連 `forEach` 都沒有；fake-dom 自己回傳一般的陣列，頁面少轉成陣列時測試照樣過、真的瀏覽器卻在那一行丟 TypeError，角色卡第一版就是這樣在 Chrome 裡一打開就壞掉），所以頁面與測試要用陣列的方法都先 `Array.from()`；`type()` 照 `maxlength` 截斷、`select()` 找不到選項就丟錯、`chip()` 取切換按鈕、`key()` 派送 keydown；頁面在 console 留下的任何東西都記在 `consoleErrors`）守住：一打開（說明、五組欄位的分頁與面板互相對應、1200×675 的 canvas、預設背景、只畫 `FF14.tw` 與版權字、要用的字型都請瀏覽器載入了）；名字、伺服器、主職（卡片重畫、canvas 的 `aria-label` 只寫填了的部分、記在 `ff14tw_character_card`、每次畫都從重設過的 canvas 開始）與等級（離開欄位時改成整理過的值）；字數計數（以 Unicode 字元計、格式跟著語言）與 `maxlength`、一句話自我介紹的換行換成空白；伺服器（繁中服 6 個排第一、國際服 85 個、「其他」出現自己輸入的欄位並把焦點移進去、重新打開選回對的那一項）；主職（8 組 34 個、限定職業放限定、重點色跟著職能）與其他職業（最多 3 個、滿了沒選的 `disabled`、主職那一顆不能按、主職換成已選的其他職業就從其他職業拿掉）；職業圖示（載入完才畫、載入前與載入失敗畫名稱的第一個字、每個只載入一次）；喜歡的內容（最多 6 個、卡片上照固定順序不是點選順序）、遊玩時段 8 格（名稱寫出是哪一格）與在找什麼；橫版與直版（canvas 尺寸、`aria-pressed`、記住）；重點色（跟著職能、自訂、改回跟著職能）；角色圖：上傳截圖（先寫處理中、縮成長邊 2048 的 JPEG 品質 0.85、記在 `ff14tw_character_card_image`、卡片用 `coverRect()` 畫的是記住的那一張（從 data URL 再讀出來的，不是原檔）、暫時的 `blob:` 網址讀完（失敗也一樣）就撤掉、檔案輸入選完就清掉所以同一個檔案能再選、新的圖從填滿置中開始；沒有圖片時縮放、置中、填滿、移除、調整都 `disabled`）、容量已滿時狀態寫這次不會記住而文字欄位照樣記住（舊的圖也拿掉，不會重新整理後冒出來；封鎖網站資料時只寫已上傳）、重新打開還原圖片與位置（`app.ready` 等還原；存著的圖解不開就丟掉並說明，頁面照常運作；還原的時候使用者已經上傳了新的，舊的晚到（讀得出來或讀不出來）都不蓋掉新的，也不能把剛上傳的新圖從記憶裡刪掉）、連續上傳只有最新的算數（先選的比較晚讀完或讀失敗都不理，不論卡在讀檔，還是轉成 JPEG 之後再讀回來那一步）、讀不出來的檔案現在的圖片不動、滑鼠拖曳（按下去抓住指標、照按下去那刻的位置算而不是累加（拖過邊界、x 被夾在 -1 再拖回來也照開始的位置算）、拖的過程不存放開才存一次、右鍵不拖、拖的時候別的 pointer 不理、取消、抓取被拿走（只有 `lostpointercapture`，沒有 `pointerup`）也結束並只存一次、指標抓不到照樣拖、卡片藏起來不亂動、橫版直版各一份；滑鼠的按鍵已經放開、`pointerup` 卻沒收到（`buttons` 是 0，例如 macOS 拖到一半按著 Ctrl 跳出右鍵選單）時，下一次移動就結束拖曳、存一次、放掉抓取，之後滑鼠移過卡片不再動圖片，調整模式裡手指與筆照舊不看 `buttons`）、縮放滑桿（100–300 間隔 5、`aria-valuetext`、`input` 只重畫 `change` 才存、跟著現在的版型）與置中、填滿、觸控不攔截（觸控為主而且不在調整模式時 `pointerdown` 不抓指標也不 `preventDefault`，按「調整圖片」才拖得動，滑鼠不用調整模式；裝置不是觸控為主就沒有「調整圖片」）、調整模式結束的各種時機（完成、切離圖片分頁、移除圖片、清除全部、裝置不再是觸控為主、手指還按著時）、移除圖片（回到預設背景、刪掉 `IMAGE_KEY`、焦點移到上傳、之後觸控照常捲）、清除全部也清掉角色圖與還在讀的、切換語言（按鈕、狀態與調整中的「完成」）；重新打開還原每一個欄位、記憶壞掉時照常打開、封鎖網站資料時照常運作且 console 是空的；清除全部（要按兩次、3 秒後變回原本的字、兩個鍵都清掉、等著確認時換語言）；切換語言（標籤、選項、其他職業的按鈕、卡片上的字與時段短標籤換字，選的值不變）；手機的分頁（只顯示目前分頁、左右鍵與 Home／End、按著 Alt／Ctrl／⌘ 不處理、跨過 768px 時焦點在哪一組就切到哪一組，手機變電腦時焦點在分頁上就移到那一組）與電腦的五組全顯示；字型（先畫再等字型、載入完重畫、只請求還沒請求過的字、`fontsReady()` 等到每一批都載完：後請求的先載完也一樣、等的時候又請求的也等、載入失敗照樣完成）；頁面載入的每一支工具腳本不在 `querySelectorAll()`、`.children` 這些結果上直接用陣列方法（掃原始碼，掃描函式自己也有正反兩面的例子）；輸出（下載圖片、分享、複製圖片、全螢幕大圖）：必填沒填就按下載、分享或複製時不產生圖、不碰分享與剪貼簿，在名字、伺服器、主職下面寫錯誤（欄位 `.is-invalid` 與 `aria-invalid`，錯誤的 id 接在 `aria-describedby` 後面而字數計數的 id 留著，填了、選了就拿掉，清除全部也拿掉，切換語言跟著換字），焦點到第一個沒填的欄位（伺服器選了「其他」而沒打字就是自己輸入的欄位），手機先切到基本分頁、電腦不動分頁；等字型才產生圖（`fontsDelay` 時 `toBlob` 還沒被呼叫，每一批都載完才產生，拍下來的畫面是載完重畫之後的）、也等職業圖示、等圖示的時候又請求的字型、記住的角色圖還原與還在處理的截圖（選了截圖馬上按下載時等它處理好，拍下來的是新的那張，讀不出來就照現在的圖產生；只等最新的一次，被後選的取代、移除圖片之後就不等它；分享、複製也等），最多等 `EXPORT_WAIT_MS`（10 秒，用頁面的 `setTimeout`，`runTimeouts()` 讓逾時走完：照目前的畫面產生並跳「字型還沒載完」的 toast，卡住的是上傳的截圖時寫「上傳的截圖還在處理」，沒逾時時把計時取消）；匯出中再按下載、分享、複製、點卡片都不理，做完或失敗之後又能按；電腦下載（`<a download>` 檔名 `ff14-Luna Starweaver.png`、橫版 1200×675、直版 1080×1350、toast、連結點完拿掉、網址不在同一個 tick 撤銷而是過一陣子才撤銷）；手機（768px 以下）與觸控為主的寬螢幕按下載打開大圖（圖是這一張的 object URL、`alt` 是卡片的說明、「長按圖片即可儲存」、下載檔案、分享（支援才有）、關閉，Esc 與關閉鈕關掉，焦點回到「下載圖片」（Safari 點按鈕不給焦點時也一樣），圖與下載連結馬上不再指到網址、網址過 `CardExport.REVOKE_DELAY_MS` 才撤銷（剛點完下載檔案就關掉時網址還有效，大圖開著時再按下載圖片，前一張照樣等計時、新的一張不動），切換語言時標題、按鈕與 `alt` 換字；大圖裡的分享同步呼叫 `navigator.share`、不再等任何東西，連按不重複）；點小卡看大圖（調整圖片模式不開、拖曳移動了圖片之後放開的那一下 click 不開而且只吃那一次、每次按下去都把記號清掉、手抖的一兩個像素還是點一下；必填沒填完時大圖裡只有圖與「關閉」，也不寫錯誤）；分享（`canShareFiles` 才出現，傳 PNG 檔與角色名稱，取消不說話，失敗與沒有 `File` 跳 toast；等太久、點擊的手勢過期了（`NotAllowedError`）就改開大圖，焦點在大圖的分享、toast 請玩家再按一次，大圖裡一按就分享做好的那個檔案、不再產生一張，大圖裡也被拒絕時說沒辦法分享）、複製（支援才出現，點擊的當下就把還沒做好的圖（Promise）交給 `ClipboardItem` 並呼叫 `clipboard.write`，成功與失敗的 toast）、轉不成 PNG 時說產生不出圖；LINE 的提示只在 LINE 出現（連結有 `openExternalBrowser=1`，三語的前半句都請玩家在填之前就換瀏覽器：「…建議先用瀏覽器打開再填：」）；手機打字時 `#cardTool` 的 `.is-typing`（文字欄、數字欄與文字框得到焦點時加上，離開時拿掉，欄位之間移動時不拿掉，選單（不開鍵盤，選完焦點還留在上面）、勾選、單選、滑桿、檔案、顏色與按鈕不算；選完最後一個必填的選單之後 `.is-typing` 是關著的、下載圖片照常能按；用 `hideKeepsFocus` 模擬 Safari 藏起有焦點的欄位時不送 `focusout`，手機打字到一半換分頁，`selectTab()` 要讓焦點離開被藏起來的欄位、`.is-typing` 收掉，同一組再選一次時焦點不動）；整頁只有一顆 `.btn-primary`（`#downloadCard`）；替身本身的行為；以及 `index.html`（腳本順序、標準字型連結加 Outfit、不載入 `security-utils.js`、每個輸入框都有名稱、`#cardActions` 的順序與一開始 `hidden` 的元素、大圖的 `role`／`aria-modal`）、`style.css`（沒有 `overflow-x`、色碼與比手機寬的固定寬度，用 `hidden` 切換的元素有 `display: none`，電腦兩欄、手機預覽 sticky 且高度最多 35vh；手機的按鈕列固定在最下方、下內距加 safe-area，頁尾與回到頂部鈕不被蓋住，`.is-typing` 的規則只在手機，大圖縮到放得進畫面、不左右捲；角色圖那一組：檔案輸入在 `<label>` 裡、`.visually-hidden` 但不能 `hidden` 或拿掉焦點、焦點外框畫在按鈕上、滑桿 100–300 間隔 5、按鈕都是 `type="button"`、`#imageAdjust[hidden]`，`touch-action: none` 整份只有調整模式（`.is-adjusting`）設、有圖片時的 `grab` 游標只在 `(pointer: fine)`、`.is-dragging` 的 `grabbing` 排在後面）與翻譯檔（三語的鍵與 `{參數}` 一致、`index.html` 的預設文字等於 zh 翻譯、遊戲用語與計畫的對照表一致、角色圖的狀態文字逐字照規定、輸出的新鍵三語逐字照規定）。
- `tests/nav-tools-menu.test.js`：導覽列順序、工具面板的內容、目前工具的標示（404 頁不標示）、面板的開關與焦點行為
- `tests/hamburger-menu.test.js`：☰ 的 `aria-expanded`／`aria-controls`、焦點進出、Escape／遮罩／焦點移出關閉、視窗放寬時重置
- `tests/recent-tools.test.js`：最近使用的記錄與讀取（含毀損資料、儲存空間不能用）、記錄時機、首頁「最近使用」的顯示與語言切換
- `tests/home-page.test.js`：首頁工具卡的結構與狀態標示、翻譯鍵與預設文字、hero 縮小與版面數值
- `tests/not-found-page.test.js`：404 頁的絕對路徑、載入順序、頁面結構、翻譯、工具清單與樣式
- `tests/fake-dom.test.js`：守住 `fake-dom.js` 本身的行為（事件的捕獲／冒泡、焦點與 `inert`、選擇器、屬性等），以及 `html-fragment.js` 的 `mountFromHtml()` 照 `index.html` 的寫法建出節點
- `tests/theme-toggle.test.js` 也改用 `fake-dom.js`：主題切換鈕只建立一次，跨過 768px 不搬動；另守住網址列顏色（載入真正的 `common.js`，`getComputedStyle`、`matchMedia` 與 `localStorage` 是測試補的替身，`getComputedStyle` 照 `tokens.css` 的值回答）：`ThemeManager` 套用深色時 `<meta name="theme-color">` 是 `#4b5ca8`、切回淺色是 `#667eea`（前後沒有空白）；打開頁面時就是深色（存著的偏好或系統偏好）的話一開始就是深色的值，沒存過偏好時系統在深淺色之間切換也跟著換；頁面沒有 `<meta name="theme-color">`，或讀不到 token（沒有 `getComputedStyle`、空字串、只有空白）時不改、不丟錯，也不替頁面補一個；另守住三段模式（淺色、深色、跟著系統；圖示是 SVG，要用的 `createElementNS`、`replaceChildren` fake-dom 沒有，測試在這份 document 上補，之後建出來的每個元素都有 `replaceChildren`）：`ThemeManager.nextMode()` 的循環順序（系統是深色時 跟著系統 → 淺色 → 深色 → 跟著系統，系統是淺色時先到深色）、沒存過偏好是跟著系統而連按三下依序換到相反的顏色、同色、跟著系統（只存 `light`／`dark`，回到跟著系統時把 `localStorage['theme']` 刪掉）、存著壞掉的值當成跟著系統、跟著系統時系統切換深淺色畫面與按鈕名稱跟著換（自己選了顏色時畫面不變，名稱的「按一下改成…」照系統重算）、圖示代表現在的狀態而 `aria-label` 與 `title` 是同一句、英文與日文的名稱，以及沒有翻譯時的中文與中文翻譯一字不差、`localStorage` 讀寫都丟例外或沒有 `matchMedia` 時照樣三段切換、真正的頁面流程（載入真正的 `I18nManager`（`i18n-manager.js`）、翻譯檔與 `common.js`，派送 `DOMContentLoaded`，由真正的 `initThemeToggle()` 建出切換鈕：`ThemeManager` 建立時切換鈕還不在頁面上，這時不去問主題鈕的翻譯；切換鈕一建好就有圖示與同一句的 `aria-label`、`title`，真的點三下，圖示、畫面外觀與名稱都對、焦點一直在同一顆按鈕上；真的 `setLanguage()` 切換 zh → en → ja，名稱與 `title` 換成那個語言；整段流程沒有 `console.warn`、`console.error`），以及翻譯檔三語都有主題鈕的 5 個鍵、`{參數}` 一致、舊的 `theme_toggle_dark`／`theme_toggle_light` 已拿掉
- `tests/share-preview.test.js`：守住分享預覽與主畫面（見「分享預覽與主畫面」；腳本是 ES module，測試用 `await import()` 載入 `scripts/share-preview/*.mjs`，不啟動真的 Chrome：用假的 Chrome 或不存在的 `CHROME_PATH`）。頁面：repo 裡的 HTML（不含 `api/`、`scripts/` 這類不屬於網站的目錄）剛好是 `loadSite().pages` 的 25 頁；每一頁的那一段逐字等於 `headBlock()`、前後註解各一個、在 `<head>` 裡，那一段以外沒有任何 `og:`、`twitter:`、`theme-color`、`apple-mobile-web-app-title`、manifest 或 `apple-touch-icon` 標籤；天氣預報那一段逐行等於設計文件的範例；`og:title`／`og:description` 等於頁面本身，沒有任何一頁有 `og:url`（含 404），`og:image` 指到存在的圖；404 那一段只有 `/` 開頭的路徑；14 個 manifest 逐字等於 `manifestJson()` 且內容照設計，每一頁連到的 manifest 與 `apple-touch-icon` 解析出來是對的檔案、scope 包含這一頁；`theme-color` 與 manifest 的 `theme_color` 等於 `tokens.css` 淺色的 `--color-browser-bar`；`TOOL_COLORS` 剛好涵蓋登錄表的 13 個站內工具，每個底色和白字的對比 ≥ 4.5:1；首頁與採集頁的分頁標題（採集頁用真正的 `I18nManager` 切換語言：「Timed Gathering Manager - FF14.tw」「タイムド採集管理 - FF14.tw」）；Lodestone 的 canonical 還在、舊的 `og-image.png` 不在任何頁面裡。腳本：`readTokens`（淺色是 `:root`、深色是 `[data-theme="dark"]`、`var()` 照同一個主題展開）、`pageText`（解開 HTML 實體，不認得的實體丟錯）、`headBlock` 的跳脫、`applyHeadBlock`（重跑一字不差；註解對不上或找不到 favicon 那一行就丟錯並寫出檔名；頁面是 CRLF 換行時照樣插入、換掉，寫回時整份保留 CRLF）、`pages` 指令在暫存複本上跑（重跑沒有檔案被改，只補回改壞的，有一頁出錯時所有檔案都不寫；25 頁都是 CRLF 時照樣跑完、換行不變）、`loadSite` 缺顏色 token 或缺說明時丟錯並指出是哪一個。圖：`png.mjs`（讀、解、編碼、重新壓縮、寫 `tEXt`，壞檔與不支援的格式丟錯，與另一個編碼器 ffmpeg 存出來的檔案對照）、`cards.mjs`（背景、雜湊、頁面；範本是 CRLF 還是 LF 雜湊一樣；真正的 `card.html` 換得出 21 張完整的頁面、固定 1200×630、外部網址只有 Google Fonts、說明只在標點與空格斷行、範本與腳本不寫色碼）、`render.mjs`（找不到 Chrome 時訊息寫出找的路徑與 `CHROME_PATH`，Chrome 一啟動就結束或連不上 DevTools 時也有訊息，而且關掉 Chrome、清掉暫存資料夾）；logo 原檔 1024×1024、SHA-256 開頭 `1f7113f6e2f5fc01`；21 張預覽圖存在、PNG 1200×630、≤ 307,200 bytes、`ff14tw-source` 等於照現在的內容重算的雜湊（忘了重跑 `images` 就失敗），`assets/images/og/` 沒有多餘的圖，4 張圖示的大小與雜湊，`apple-touch-icon` 與 manifest 的 `icons` 指到存在、大小相符的檔案；`images` 指令在暫存複本上跑：雜湊都對得上時一張都不畫也不改檔案，缺的、壞的、沒有雜湊的、雜湊不對的、尺寸不對的圖才算過期，Chrome 找不到時什麼都不寫不刪，範本改了重畫 21 張預覽圖、圖示頁面（`iconHtml()`）改了只重畫 4 張圖示、logo 改了連圖示都重畫、一張的說明改了只重畫那一張，`card.html` 與 `cards.mjs` 換成 CRLF 換行不用重畫，找不到 logo 時寫出檔名，並刪掉 `assets/images/og/` 裡不屬於這 21 張的 PNG。

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
Multi-select filters are groups of `.chip` toggle buttons. The selection lives in one `Set` per group, not in the DOM; one render function draws every chip from the `Set`s; the matching rules live in a file that never touches the DOM (副本資料庫: `dungeon-list.js`, tested on its own):

```javascript
// State: one Set per chip group; an empty Set means "this group filters nothing"
this.state = { types: new Set(), versions: new Set() };

// Click, delegated on the group (selected is that group's Set): toggle the value, then apply every condition again
group.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    const value = chip.dataset.type;
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    this.applyConditions();
});

// Render: the look (.active) and the screen-reader state (aria-pressed) always change together
chip.classList.toggle('active', on);
chip.setAttribute('aria-pressed', on ? 'true' : 'false');

// Matching: chips in the same group are OR, groups (and the search text) are AND, empty means show all
const results = DungeonList.filter(dungeons, { query, types: state.types, versions: state.versions });
```

HTML Structure (the group is `role="group"` named by its label through `aria-labelledby`; a chip is `type="button"` with `aria-pressed`):
```html
<span class="filter-label" id="typeLabel">類型</span>
<div class="chip-group" id="typeTags" role="group" aria-labelledby="typeLabel">
    <button type="button" class="chip" data-type="四人迷宮" aria-pressed="false">四人迷宮</button>
    <button type="button" class="chip" data-type="公會令" aria-pressed="false">公會令</button>
</div>
```
Every type and version that has a visible entry needs a button, and every button needs at least one entry (`tests/dungeon-data.test.js` checks this against `index.html`).

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
8. 加分享預覽與主畫面（見下面「分享預覽與主畫面」；預覽的名稱、圖示與那一句說明讀自上兩步的登錄表與首頁卡片翻譯 `tool_*_desc`）：
   - 工具頁的 `<head>` 要有 `<title>`、`<meta name="description">` 與單獨一行的 `<link rel="icon" …>`（預覽照抄標題與說明；腳本把那一段插在 favicon 那一行後面，找不到就報錯並寫出檔名）
   - 在 `scripts/share-preview/site.mjs` 的 `TOOL_COLORS` 加這個工具的顏色 token（沒加腳本會報錯；底色和白字的對比要 ≥ 4.5:1）
   - 跑 `node scripts/share-preview.mjs pages`（把那一段寫進頁面、寫出 `tools/[tool-name]/manifest.webmanifest`）與 `node scripts/share-preview.mjs images`（畫 `assets/images/og/[tool-name].png`；要本機 Chrome 與網路），把它們改到的檔案一起 commit；沒跑的話 `tests/share-preview.test.js` 會失敗
   - 新增頁面要多改的地方：工具以外的新頁面（像 `about.html`）要加進 `scripts/share-preview/site.mjs` 的 `ROOT_PAGES`，新的攻略主題要加進 `GUIDE_TOPICS`，沒加的話 `pages` 不會替它寫那一段；`tests/share-preview.test.js` 寫死了數量（25 頁、13 個工具、21 張預覽圖、14 個 manifest）、`EXPECTED_TOOL_COLORS` 與 `EXPECTED_GUIDE_TOPICS`，新增工具、主題或頁面時要照新的數字更新
9. Update changelog.html with new version entry（寫法見「修改紀錄怎麼寫」）

## Shared Component System

### Overview
The project includes a modular CSS component system in `/assets/css/components/` to ensure UI consistency across all tools. **Always use these shared components instead of creating custom styles.**

### Design Tokens (`assets/css/tokens.css`)
全站唯一的顏色、字級、間距、圓角、陰影來源；深色模式只在 `[data-theme="dark"]` 重新指定顏色類 token。**規則：**
- 工具的 `style.css` 只寫版面（grid / flex / 間距），不得出現任何色碼（`#hex`、`rgb()`、`white`）、不得引用 `tokens.css` 未定義的 `var(--…)`、不得 `@import`、不得 `!important`；`tests/design-system.test.js` 自動檢查 `assets/css/**` 與 `tools/*/` 底下所有 CSS（沒有例外；角色卡的卡片畫在 canvas 上，配色寫在 `card-renderer.js`，不在 CSS 裡），HTML／JS 不得使用 `tag-filter`、`btn-outline-*`、`tag-secondary`、`tag-light`、`tag-dark`、`tag-sm`、`tag-lg` 這些舊名稱，也不得再出現 `var(--primary-color)` 之類的相容別名。
- 顏色：`--color-primary`（互動色）、`--color-bg` / `--color-surface` / `--color-surface-2`、`--color-border` / `--color-border-strong`、`--color-heading` / `--color-text` / `--color-muted`、語意色 `--color-{success,warning,danger,info}` 及其 `-tint` / `-text` / `-border`，實心底上的字用 `--color-on-{primary,success,warning,danger,info,muted}`；手機瀏覽器的網址列顏色 `--color-browser-bar`（頁首漸層的起點色，淺色 `#667eea`、深色 `#4b5ca8`）只給 `<meta name="theme-color">`（與 manifest 的 `theme_color`）用，`ThemeManager.syncBrowserBar()` 在每次套用主題時從 CSS 讀它寫回 `theme-color`（見「分享預覽與主畫面」）。
- 字級 9 階 `--text-xs` … `--text-5xl`；間距 `--space-1` … `--space-10`（4px 基底）；圓角 `--radius-{sm,md,lg,xl,full}`；陰影 `--shadow-{sm,md,lg,xl}`；控制項高度 `--control-{sm,md,lg}` = 32 / 40 / 48；動態 `--duration-{fast,base,slow}` + `--ease`。
- 品牌漸層 `--gradient-brand` 只用在頁首、首頁 hero、工具卡 hover 頂線、無 JavaScript 時的導覽列，以及網站那張分享預覽圖 `assets/images/og/site.png` 的背景（`node scripts/share-preview.mjs images` 讀淺色的值畫成圖）。

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
<div class="cell suggested">7</div> <!-- 建議（綠色）：hover、disabled 時也維持綠色；仙人微彩、宗長計算機使用 -->

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

#### 9. 格子旁的小選單 (`assets/js/cell-popover.js` ＋ `tools-common.css` 的 `.cell-popover`)
點格子時在格子旁邊跳出一排選項（例如仙人微彩的 1–9），選完回到格子。`CellPopover` 不認識任何一個工具：選項寫什麼字、哪些不能選、選了之後做什麼都由呼叫端決定。仙人微彩與宗長計算機使用。
```javascript
// board 是放格子的元素；columns 是選項排幾欄（2 或 3）
const popover = new CellPopover({ board, columns: 3 });

// 在格子的 click 裡打開；對另一格再呼叫 open() 就是把選單換到那一格
popover.open(cell, [
    { value: 1, label: '1', current: false },
    { value: 2, label: '2', current: false, disabled: true },  // 不能選
    { value: 'clear', label: '清除', wide: true }              // 獨佔一整列
], {
    onSelect: (value, cell) => { /* 先關掉選單、焦點回到 cell，才呼叫 */ },
    label: '左上的數字',      // 選單的 aria-label
    placement: 'below',       // 'below'（預設）或 'above'：開在格子下方或上方，水平置中、左右不超出 board
    focusFirst: true          // 用鍵盤打開時，焦點移到第一個能選的選項
});

popover.close({ returnFocus: true });  // 沒開時什麼都不做；returnFocus 讓焦點回到格子
popover.isOpen;                        // 唯讀：開著嗎
popover.anchor;                        // 唯讀：開給哪一格（沒開是 null）
```
- **不是對話框**：不鎖捲動、不困住焦點、不設 `inert`、沒有 `aria-modal`（選單是 `role="group"`，打開的那一格有 `aria-expanded`）。選單會在這幾種情況關掉：點能選的選項、按 Esc（焦點回到格子）、點（`click` 或 `pointerdown`）選單與被點的那一格以外的地方、焦點移出選單、焦點離開被點的那一格而去了選單以外的地方（不搶回焦點；用鍵盤打開時焦點從那一格進到選單裡不算）。整個視窗失去焦點（例如切到遊戲）不算移出，選單照樣開著。Safari 點按鈕不給焦點，那一格沒有焦點可以失去，不會因此關掉，呼叫端要自己處理按鍵該對哪一格。
- 選項是 `{ value, label, disabled?, current?, wide? }`：`disabled` 不能選；`current` 寫了 `true` 或 `false` 才有 `aria-pressed`，`true` 是目前的值，同樣不能再選；`wide` 獨佔一整列（例如「清除」）。
- `board` 要 `position: relative`（選單掛在裡面，位置相對於它的左上角），而且不要有邊框（位置照 border-box 算）；外層的 `.card` 預設 `overflow: hidden`，要改成 `visible`，不然開在格子下方的選單會被切掉。
- 位置在打開時算好；之後視窗大小改變（手機轉向、視窗變窄或變寬，盤面與格子跟著變大變小）時，照那一格的新位置重新放好，選單照樣開著（`window` 的 `resize`，只在開著時登記）。重新放之前先拿掉舊的位置再量選單：選單是 absolute，`left` 越大能用的寬度越窄，選項的字長時會量到比打開時窄的寬度。
- 不要在 `onSelect` 裡同步再呼叫 `open()`：同一次點擊還會冒泡到 `document`，剛打開的選單會被當成點在外面而關掉。
- `CellPopover.place({ cell, board, menu, placement })` 是不靠 `this` 的純函式，三個位置都是 `getBoundingClientRect()` 的 `{ left, top, width, height }`，回傳選單相對於 board 左上角的 `{ left, top }`。

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
    ├── common.js            # 共用翻譯（導航、頁尾、14 個工具名稱 tool_*_title）
    ├── index.js             # 首頁翻譯
    ├── about.js             # 關於頁面翻譯
    ├── changelog.js         # 修改紀錄頁面翻譯
    ├── copyright.js         # 版權聲明頁面翻譯
    ├── not-found.js         # 404 頁翻譯
    └── tools/               # 工具翻譯（report-generator 目前未使用 i18n，沒有對應檔案）
        ├── character-card.js
        ├── chocobo-color.js
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

**timed-gathering/** (9 files):
```
├── index.html
├── script.js              # 主控制器：素材卡片與倒數、我的提醒、複製鬧鐘
├── gathering-materials.js # 素材（同一種採集物的幾筆合成一種）、時段、排序、時段文字零件（不碰 DOM）
├── gathering-reminders.js # 我的提醒：儲存、提早分鐘數、網頁提醒開關、舊使用者遷移（不碰 DOM）
├── list-manager.js        # 清單管理
├── macro-exporter.js      # 巨集匯出
├── search-filter.js       # 搜尋過濾
├── time-calculator.js     # 時間計算
└── style.css
```
（提醒到時間的排程、頁內提示、提示音與系統通知用共用的 `assets/js/reminder-scheduler.js`，不再有工具專屬的 `notification-manager.js`；已改用共用的 `assets/js/security-utils.js` 與共用 i18n 系統，不再有工具專屬的 `security-utils.js` / `i18n.js`）

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

- **tools-registry.js**: The single tool list (14 tools in homepage card order; 水晶商城清單 is `external`) with `findById`, `findByPath`, `readRecent` and `recordVisit`. The header 工具 ▾ panel, the homepage "最近使用" row and the 404 tool list all read it. Recent tools live in `localStorage['ff14tw_recent_tools']` (newest first, one entry per tool, at most 4; external tools, unknown ids, site pages and the 404 page are never recorded; every storage access is wrapped in try/catch)
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
- Theme toggle: created once by `initThemeToggle()` in `common.js`, inside `.header .container` right before ☰; CSS positions it and it never moves across 768px. One button, three modes (`ThemeManager.MODES`): follow the system (what a first visit gets), light and dark. Each press moves round the ring [follow the system, the colour opposite to the system's, the system's own colour] (`ThemeManager.nextMode()`, a pure function), so the first press always changes the page: with a dark system it goes system → light → dark → system, with a light system system → dark → light → system. The icon shows the current mode, not what the next press does (☀ light, ☾ dark, ◑ follow the system: an outline circle with its right half filled, drawn by the existing `.theme-toggle svg` styles), and `aria-label` and `title` are the same sentence naming the current mode and the next one (`toggleLabel()`; the keys `theme_toggle_label` and `theme_mode_*` in `translations/common.js`, with Chinese fallback text in `common.js` for pages without translations). `localStorage['theme']` holds only `light` or `dark`: choosing follow-the-system removes the key, and a missing, invalid or unreadable value means follow the system. While following the system the page changes with the system's colour scheme; with light or dark chosen it stays put, and only the "next" part of the label is worked out again
- Mobile hamburger menu (≤768px): ☰ has `aria-expanded` and `aria-controls`. The drawer (`min(320px, 85vw)` wide) shows the always-expanded tool list first (the 工具 ▾ button is hidden there), then 首頁 · 修改紀錄 · 版權聲明 and the language switcher. The drawer's 首頁 is a second link placed after the tool list (`.nav-drawer-only`; the header's first 首頁 is `.nav-desktop-only` and hidden in the drawer), so what the drawer shows, the Tab order and the screen-reader order all follow the DOM — don't reorder the drawer with CSS `order`. Opening moves focus to the first tool link; Escape, the overlay, ☰ again, or focus leaving the drawer closes it (the first three return focus to ☰); coming back from the back/forward cache or choosing a link that opens a new tab (水晶商城清單) also closes it, returning focus to ☰ if it was in the drawer. Crossing 768px moves focus that would otherwise be lost: into the drawer layout, focus in the header nav moves to ☰; back to desktop, focus on ☰ or a drawer tool link moves to 工具 ▾, and focus on the drawer's 首頁 moves to the desktop 首頁. This runs in a `matchMedia` change listener (`initHamburgerMenu()`), which fires before the browser drops focus from elements that have just become hidden; the 250ms-debounced resize reset is too late for that

### Footer Structure (Generated by footer-template.js)
The footer has four rows:
- Site links: 修改紀錄 · 回報問題 (GitHub Issues, new tab) · 關於 · 版權聲明 · GitHub (new tab). External links show ↗ in a separate `span.external-mark` and carry `data-i18n` on an inner `span`, so switching languages never wipes the ↗
- Disclaimer text (`p.footer-disclaimer`), in three translated parts on three `span`s: `footer_copyright_prefix`, `footer_copyright_name` (Square Enix / スクウェア・エニックス) and `footer_copyright_suffix`. The name and the part after it are `span.footer-nowrap` (`white-space: nowrap`), so phones never split "Square Enix" and Japanese never leaves 「係」 alone on a line
- `FINAL FANTASY XIV © SQUARE ENIX` (`p.footer-se-copyright`): carries the `© SQUARE ENIX` notice the SQUARE ENIX materials usage policy asks for, with `FINAL FANTASY XIV` in front as on the Traditional Chinese official site; the same in zh/en/ja, with no `data-i18n`, so switching languages never rewrites it
- `© 2024–<current year> FF14.tw · Made with ❤️ by hydai` (the end year is computed; `createDOM({ year })` overrides it)

### 分享預覽與主畫面（Generated by scripts/share-preview.mjs）
貼連結到 Discord、LINE、Facebook 時的預覽卡，與手機「加到主畫面」的圖示和名稱。聊天 App 讀 HTML 原始碼、不執行網站的 JS，所以這些全部寫死在 HTML 與檔案裡，由腳本（Node 24，沒有任何套件）產生後一起 commit，不是網站載入時才算的：
```bash
node scripts/share-preview.mjs pages    # 重寫每一頁 <head> 裡的那一段、寫出 14 個 manifest；不連網路，可以重跑
node scripts/share-preview.mjs images   # 畫 21 張預覽圖與 4 張圖示；要本機 Chrome 與網路（Google Fonts）
```
- 什麼時候重跑：新增工具或頁面，或改了某一頁的 `<title>` 或說明（包括把撰寫中的攻略主題寫成真正的摘要）、登錄表的名稱或圖示、首頁卡片的說明（`translations/index.js` 的 `tool_*_desc` 與 `hero_title`）、`TOOL_COLORS`、`tokens.css` 的顏色、logo、`card.html`，兩個指令都跑一次，沒變的檔案不會重寫。忘了跑，`tests/share-preview.test.js` 會失敗；CI 只檢查，不產生。
- 每一頁 `<head>` 的那一段：25 頁（不含 `api/test.html`）各有一段，插在單獨一行的 `<link rel="icon" …>` 後面，前後是一字不差的註解 `<!-- 分享預覽與主畫面：由 scripts/share-preview.mjs 產生，改了分頁標題或說明後重跑 -->` 與 `<!-- /分享預覽與主畫面 -->`，重跑時整段換掉（複製別的頁面當新頁面時，舊的那一段會跟著複製過來，`pages` 會換成這一頁自己的）。頁面用 CRLF 換行（例如編輯器存成 CRLF）時照樣處理，寫回時整份保留 CRLF。裡面是 `og:*`、`twitter:card`、`theme-color`、`apple-mobile-web-app-title`、`<link rel="manifest">` 與 `<link rel="apple-touch-icon">`；這些標籤只能在那一段裡，不要手改。
- 內容只照抄網站現有的字，不另外寫文案：`og:title` 是這一頁的 `<title>`、`og:description` 是 `<meta name="description">`（一字不差，HTML 跳脫照常，所以每一頁都要有這兩個）；`og:image` 是 `https://ff14.tw/…` 的絕對網址；manifest 連到同一個資料夾的 `manifest.webmanifest`，`apple-touch-icon` 照那一頁其他資源的寫法（根目錄 `assets/…`、工具與攻略 `../../assets/…`）。每一頁都不寫 `og:url`：Facebook 把它當正式網址、貼文的連結會指到它，分享出去的寶圖隊伍邀請（`?room=`）、寶圖清單（`?maps=`）、天氣（`#…`）與修改紀錄的版本（`#version-…`）會被導回沒有狀態的頁面；Discord、LINE、X 本來就用貼上的網址。`404.html` 會出現在任何打錯的網址上，所以它那一段只用 `/` 開頭的路徑，說明用頁面上那一句「網址可能打錯了，或這個頁面已經搬家。」。只有 Lodestone 頁另有 `<link rel="canonical">`（原本就有，保留）。
- 21 張預覽圖（`assets/images/og/`，1200×630，每張 ≤ 300KB）：13 個工具各一張（`<id>.png`）、攻略資料的 7 個主題各一張（`guide-<主題>.png`，主題的檔名是腳本的 `GUIDE_TOPICS`）、網站一張（`site.png`，首頁、關於、修改紀錄、版權聲明與 404 共用）。圖上的字也只用現有的：工具是登錄表的 `name` 與 `icon` 加首頁卡片那一句；攻略主題是那一頁 `<title>` 裡的主題名稱（上面多一行小字「攻略資料」）與那一頁的說明；網站是「FF14.tw」與首頁大標 `hero_title`。底色是 `TOOL_COLORS`（`scripts/share-preview/site.mjs`，工具 → `tokens.css` 的顏色 token）對到的淺色值，往右下漸暗，攻略主題同攻略資料，網站那張是 `--gradient-brand`；顏色照 token 名稱讀 `tokens.css`，腳本不寫色碼（例外只有 logo 的底色、漸暗用的黑與範本裡的白字）。
- `images` 的畫法：把每張圖的字套進範本 `scripts/share-preview/card.html`（範本，不是網站的頁面），交給本機 Chrome 截圖（預設是 macOS 的 Google Chrome，用環境變數 `CHROME_PATH` 換）。名稱只能一行、說明最多三行（只在標點與空格斷行），字型（Noto Sans TC、Noto Color Emoji）沒從 Google Fonts 載進來也算錯：放不下就報錯並列出是哪幾張，不產生任何圖，不會默默縮字或換字型。
- 4 張主畫面圖示（`assets/images/icons/`）從 logo 原檔（`assets/images/ff14tw-logo.png`，1024×1024，不修改）縮出來：`apple-touch-icon.png`（180）、`icon-192.png`、`icon-512.png`，以及留邊版 `icon-maskable-512.png`（Android 會把圖示裁成圓形或圓角方形，所以 logo 縮成 84% 放中間、四周補 logo 的底色，外圈金色圓與字樣才不會被裁到）。
- 14 個 manifest（`manifest.webmanifest`）：根目錄一個、13 個工具各在自己的目錄一個，攻略的 7 個主題用 `tools/guide/` 的。從哪一頁加到主畫面，就打開那個工具：工具自己的頁面用自己的 manifest，`start_url` 與 `scope` 是那個工具（`/tools/<id>/`），`short_name`（主畫面上的名稱）是登錄表的 `name`（`apple-mobile-web-app-title` 同它）；攻略資料的 7 個主題頁打開攻略資料（`/tools/guide/`），名稱是「攻略資料」；網站其他頁（首頁、關於、修改紀錄、版權聲明）與 404 用根目錄的，打開首頁，名稱是 FF14.tw。`display` 是 `browser`，打開還是有網址列的一般分頁。
- 網址列顏色：`tokens.css` 的 `--color-browser-bar`（頁首漸層的起點色，淺色 `#667eea`、深色 `#4b5ca8`）。HTML 與 manifest 的 `theme_color` 寫淺色的值（聊天 App 不執行 JS，看到的就是它）；`assets/js/common.js` 的 `ThemeManager.syncBrowserBar()` 在每次 `applyTheme()` 時，從 CSS 讀這個 token 寫回 `<meta name="theme-color">`（JS 不寫色碼），手機瀏覽器上方的顏色因此跟著深色模式換；頁面沒有 `<meta name="theme-color">`、讀不到 `getComputedStyle` 或 token 是空的時什麼都不做。
- 每個 PNG 的 `tEXt` 區塊（keyword `ff14tw-source`）記著畫它的內容的 SHA-256（預覽圖是名稱、上面那行小字、說明、圖示、底色、logo 檔與範本檔；圖示是 logo 檔、尺寸、留邊比例與圖示頁面 `iconHtml()` 的 HTML）：`images` 只重畫缺的、壞的、尺寸或雜湊對不上的圖，沒變的跳過（重跑不會把 25 張全部改一遍），也會刪掉 `assets/images/og/` 裡不屬於這 21 張的 PNG；測試照現在的內容重算雜湊來比對，所以忘了重跑 `images` 會失敗。
- 預覽一律是中文（`og:locale` 是 `zh_TW`），不跟著網站的語言換；網址後面的 `?room=`、`?maps=`、`?id=`、`#…` 也不會改變預覽（要依連結內容換預覽得在伺服器端做）。各家 App 會快取預覽：以前分享過的網址可能要幾小時到幾天才換成新的，Facebook 可以用分享偵錯工具手動更新。

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
├── dungeons.json (12,376 行) - 803 個副本資料，顯示中 362 筆（其餘 441 筆 `visible: false`，檔案內 metadata.totalDungeons 欄位仍寫 804，屬既有落差）
├── treasure-maps.json (2,712 行) - 227 個寶圖座標（G8/G10/G12/G14/G15/G17/G18）
├── macro-mappings.json (7,627 行) - 巨集轉換器的巨集指令對照表
├── timed-gathering.json (1,318 行) - 特殊採集點資料
├── chocobo-colors.json (139 行) - 陸行鳥毛色配方資料（陸行鳥染色計算器使用）
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
- **換行一律 LF**：`.gitattributes`（`* text=auto eol=lf`）讓每個文字檔在任何平台都用 LF 取出，二進位檔照舊自動判斷。沒有它時 Windows 的 git 預設會換成 CRLF，那樣的複本上 `node scripts/share-preview.mjs pages` 會停下、有測試會失敗。

### 修改紀錄怎麼寫
`changelog.html` 照月份分段：一個月一個 `<section class="changelog-month">`，**裡面只放月份標題（`<h2 class="changelog-month-title">YYYY年M月</h2>`）和這個月的版本**，不要加段落或其他元素；同一個月的收合列靠兄弟選擇器（`.changelog-month-title + .changelog-entry`、`.changelog-entry.is-latest + .changelog-entry`、`.changelog-entry:last-child`）接成一張圓角清單，多一個元素圓角就會跑掉。版本由新到舊，照日期排、不照版本號（v2.12.0 比 v2.11.1 早，不重新編號）。每一版有三種寫法：

```html
<!-- 最新一版（不論幾條都用這個寫法） -->
<details class="changelog-entry is-latest" id="version-v2270" open>
    <summary>
        <span class="changelog-meta">
            <time class="changelog-date" datetime="2026-11-07">11月7日</time>
            <span class="changelog-version">v2.27.0</span>
            <span class="changelog-latest" data-i18n="changelog_latest">最新</span>
        </span>
        <span class="changelog-headline">一句標題</span>
    </summary>
    <ul class="changelog-items">
        <li><span class="tag tag-info">改善</span> 條目</li>
    </ul>
</details>

<!-- 其他兩條以上的版本：同上，但沒有 is-latest、open 和「最新」 -->

<!-- 只有一條的舊版本：不能展開，沒有標題 -->
<div class="changelog-entry changelog-entry-single" id="version-v2114">
    <span class="changelog-meta">
        <time class="changelog-date" datetime="2026-03-29">3月29日</time>
        <span class="changelog-version">v2.11.4</span>
    </span>
    <p class="changelog-single-item"><span class="tag tag-warning">修正</span> 條目</p>
</div>
```

**發新版的兩個步驟：**
1. 在最上面的月份區塊最前面（新的月份就先加 `<section>` 與月份標題）加一個 `is-latest`、`open`、有「最新」的 `<details>`，寫日期、版本、一句標題和條目。
2. 上一版拿掉 `is-latest`、`open` 和「最新」那個 `<span>`；如果它只有一條，改成只有一條的寫法（拿掉標題）。

- 標籤只有四種：`tag tag-success` 新增、`tag tag-info` 改善、`tag tag-warning` 修正，以及 `tag tag-outline-primary` 里程碑（只有最舊的兩條用，新的條目不用）。不要再寫優化、調整、改進、資訊。
- 最新一版一定要有一句標題（不論幾條）；兩條以上的版本也都要有；只有一條的舊版本不要有，那一條直接寫出來。
- 標題與條目是寫給玩家看的：收起來時玩家只看得到標題，所以用玩家看得懂的說法寫「改了什麼、有什麼不同」，不寫開發者用語（例如「事件監聽器記憶體洩漏」）。條目與標題只有中文，不翻譯；頁面上固定的字才用 `data-i18n`。
- id 是 `version-` 加上版本文字去掉 `[A-Za-z0-9_]` 以外的字元（`v2.26.0` → `version-v2260`、`v2.5.0 - v2.5.2` → `version-v250v252`；「專案啟動」是 `version-start`），以前分享出去的連結才找得到。日期寫 `<time class="changelog-date" datetime="YYYY-MM-DD">M月D日</time>`（月、日不補零），而且要落在它所在的月份區塊。
- 「N 條」不手寫：`assets/js/changelog.js` 載入時把條數接在每個 `<details>` 版本的 `.changelog-meta` 最後（`span.changelog-count`，最新一版展開時由 CSS 藏起來，收起來時留在色帶裡），也負責網址 `#` 指到收起來的版本時把它展開。
- 發新版寫錯的地方，`tests/changelog-page.test.js` 會擋下來：只有第一版有 `is-latest`、`open` 和「最新」，月份區塊裡只放月份標題和版本，每一版的標題、id、日期（含所在的月份區塊）與標籤。

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
- **聯盟任務**: 24-person alliance raids
- **絕境戰**: Ultimate difficulty
- **誅滅戰**: 24-person chaotic alliance raids (The Cloud of Darkness)
- **幻巧戰**: Unreal trials
- **公會令**: Guildhest content

### Asset Management
- Job icons: `assets/images/se/FFXIVJobIcons/{category}/{type}/{JobName}.png`
- Tool images: `images/{id}.jpg` with 2:1 aspect ratio
- Fallback handling for missing assets

## AI Command Memories

- 當我呼叫 GitCommit 請幫我根據目前修改，對 changelog 進行更新以後，再產生一個 git commit（寫法見「修改紀錄怎麼寫」）
- 所有頁面的導航列都需保持一致的風格，包含版權聲明連結
- 所有頁面的頁尾都需與首頁風格一致
- 當我呼叫 Update 時，請更新 README.md 與 CLAUDE.md
- 使用 FF14 繁中服官方用語時，請參考 TERMINOLOGY.md 文件

## Current Tools

1. **Character Card Generator（角色卡產生器）** (`character-card/`): 做一張自己的冒險者自介卡，貼到 Discord、LINE、Facebook 或 Instagram，部隊招募、找固定隊時一張講完；填名字、伺服器和主職就能下載，其他都是選填。成品是一張圖，畫面上的預覽就是下載的那一張：卡片由程式直接畫在一個 `<canvas>` 上，預覽是同一張 canvas 用 CSS 縮小顯示（圓角是 CSS 加的，PNG 是整張矩形），下載、分享、複製的是它轉出來的 PNG，不用 `html2canvas` 之類的轉圖套件；大小橫版 1200×675、直版 1080×1350（預覽下面的「橫版／直版」切換，記住）。現在只有風格 B「海報」（截圖鋪滿整張卡，由上到下漸層成深色，主要的字都在下方）；風格 A（名片）、C（資訊卡）與在「樣式」裡換風格預定第二次上線，狀態的 `style` 欄位（`CardState.STYLES` 現在只有 `b`）與圖片位置的鍵（每一種「風格-版型」各一份，現在是 `b-landscape`、`b-portrait`）已經照那個形式留好；B 不畫的欄位（部隊全名、大國防聯軍、在找什麼、聯絡方式）現在照樣能填、也會記住，要等 A、C 才會出現在卡片上。欄位（字串的上限以 Unicode 字元計，到上限不能再打，欄位旁寫「12／30」這種計數）：必填是角色名稱（21 字）、伺服器與主職，等級 1～100（預設 100）；伺服器是一個選單，繁中服 6 個排第一、國際服 85 個一組，最後是「其他」（出現自己輸入的欄位，20 字），卡片上只寫伺服器名稱；主職是 34 個職業依職能分 8 組（坦克、補師、近戰、遠程、法系、生產、採集、限定），名稱照介面語言用官方名稱。選填：其他職業（最多 3 個、不含主職，卡片只畫圖示）、稱號（30 字）、部隊名稱（20 字）與簡稱（5 字）、大國防聯軍（黑渦團、雙蛇黨、不滅隊）、一句話自我介紹（60 字）、聯絡方式（40 字）、遊玩時段（平日、假日 × 早上、下午、晚上、深夜，8 格）、喜歡的內容（16 種，最多 6 個，卡片上照固定順序、不是點選的順序）、在找什麼（固定隊、部隊、朋友，都不選就是不找）、角色圖與重點色。重點色預設跟著主職的職能（坦克藍、補師綠、近戰／遠程／法系紅、生產紫、採集金，沒有主職時用紅），也可以自己選（`<input type="color">`），淺色的重點色上的字照 WCAG 對比度選白字或深字。卡片怎麼畫（風格 B）：左上伺服器與部隊簡稱的膠囊、右上小字「FF14.tw」；左下由上到下是稱號、角色名稱（最大的字，放不下就整行等比例縮小、最小到 30%，不換行）、主職（圖示、名稱、「Lv 100」）、喜歡的內容的膠囊（最多 2 列）、自我介紹（最多 2 行）；右下是其他職業的圖示、遊玩時段的小格子（2 列 × 4 欄，有選的用重點色）與 `FINAL FANTASY XIV © SQUARE ENIX`（卡片上畫了 SE 的職業圖示，所以一定畫，只填必填三項時也畫）；直版同樣的東西、字放大，右下那一組改成在自我介紹下面橫排。左下與右下的東西貼著底邊往上排，沒填的選填欄位整塊不畫、不留空位。沒有上傳角色圖時用程式畫的預設背景（由深藍紫到重點色的對角漸層，加幾點固定的光點，不是 SE 的圖）。卡片的顏色、字級與版面數字都寫在 `card-renderer.js`（畫在圖上的成品，不跟著網站的深淺色）；字型是 Google Fonts 的 Noto Sans TC 與 Outfit（頁面標準的字型連結再加一條 Outfit），中文字型依字分批載入、沒載到的字會退成備用字型，所以每畫一次就請瀏覽器載入還沒請求過的字，載完重畫。角色圖：「上傳截圖」（看不見但 Tab 得到的檔案輸入包在 `<label>` 裡）先縮成長邊最多 2048px 的 JPEG（品質 0.85；轉出來超過 150 萬字就從原圖再用 1600px、品質 0.8 轉一次；有透明的圖先鋪一層預設背景的底色），卡片畫的與瀏覽器記住的是同一張（轉出來之後再讀回來才用）。位置與縮放橫版、直版各記一份，沒記過是填滿置中：滑鼠在卡片上直接拖，縮放滑桿 100%～300%（間隔 5），另有「置中」「填滿」與「移除圖片」；手機上手指從卡片上滑要能捲動頁面，所以觸控為主的裝置要先按「調整圖片」（調整模式，按「完成」、切離圖片分頁、移除圖片或清除全部時結束）才拖得動，其他時候 `pointerdown` 什麼都不做。上傳與還原用流水號，同時有好幾次在讀只有最新的算數。輸出（「下載圖片」是整頁唯一的 `.btn-primary`）：按下去先驗必填（名字、伺服器、主職，沒填的在欄位下面寫錯誤，手機切到「基本」分頁，焦點移到第一個沒填的欄位，不產生圖），再等字型、職業圖示與還原中、上傳中的角色圖都好了（選了截圖馬上按下載，產生的也是新的那張）、重畫、同一個 tick 轉成 PNG（最多等 10 秒，逾時照目前的畫面產生並跳「字型還沒載完」的 toast，卡住的是上傳的截圖時寫「上傳的截圖還在處理」：卡住的請求不能讓按鈕永遠沒反應），匯出做到一半再按什麼都不理。電腦直接下載（`<a download>`，檔名 `ff14-<角色名稱>.png`，不能當檔名的字換成 `-`）；手機（768px 以下）與觸控為主的裝置（LINE、Facebook 等內建瀏覽器常常不能直接下載）改成打開全螢幕大圖（`#imageViewer`，`ModalManager`），上面寫「長按圖片即可儲存」，下面是「下載檔案」「分享」（支援才有）與「關閉」，焦點回到「下載圖片」；關掉時圖與下載連結馬上不再指到這一張圖的網址，網址本身等 `CardExport.REVOKE_DELAY_MS`（30 秒）才撤銷（剛點完「下載檔案」就關掉的話，有的瀏覽器網址一撤銷就取消這次下載，同 `CardExport.download`）；這些裝置上點一下小卡也看大圖（只是看，不驗證，必填沒填完時大圖裡只有圖與「關閉」；調整圖片模式、拖曳移動了圖片之後放開的那一下不算）。「分享」在瀏覽器能用 `navigator.share` 傳檔案時才出現（取消不算錯誤）；瀏覽器只在點擊之後的幾秒內收 `navigator.share`，等字型、等圖太久，點擊的使用者手勢就過期了（`NotAllowedError`），這時改開全螢幕大圖、焦點放在大圖的「分享」並跳 toast 請玩家再按一次（大圖裡分享的是已經做好的檔案，一按就呼叫）；「複製圖片」在支援 `ClipboardItem` 時才出現、手機版面不顯示，點擊的當下就把還沒做好的圖（Promise）交給剪貼簿（Safari 要求在使用者手勢裡）。LINE 的內建瀏覽器多一行「在 LINE 裡可能存不了圖，建議先用瀏覽器打開再填：用瀏覽器打開」（連結是同一頁加上 `?openExternalBrowser=1`；LINE 與手機的瀏覽器不共用這個網站記住的資料，填好才換瀏覽器會什麼都不在，所以提示請玩家在填之前就換）。記住：`localStorage['ff14tw_character_card']`（所有欄位與樣式，JSON，`v: 1`）與 `localStorage['ff14tw_character_card_image']`（縮過的 JPEG data URL），圖片分開存，存不進去（容量已滿）時文字欄位才照樣記得住；那時角色圖那一行寫「這張圖太大，這次不會記住，重新整理後要再上傳。」，以前存的那張也拿掉，不然重新整理後會冒出已經換掉的舊圖。每次讀寫都包 `try/catch`，壞掉的內容丟掉壞的部分、其他照用，瀏覽器封鎖網站資料時這次打開期間照常運作、只是不記住。「清除全部」（樣式分頁）要按兩次（第一次變成「再按一次清除」，3 秒內再按才清），清空欄位與圖片並刪掉兩個鍵。版面：電腦（769px 以上）兩欄，左邊表單的五組欄位（基本資料、名片資訊與自我介紹、怎麼玩、角色圖、樣式）全都看得到、沒有分頁，右邊是 `position: sticky` 的預覽，預覽下面是「橫版／直版」與下載、分享、複製。手機（768px 以下）上面是一張 sticky 的小卡（高度最多 35vh），下面用分頁切換五組欄位（基本、名片、怎麼玩、圖片、樣式；WAI-ARIA 分頁，左右方向鍵與 Home／End 移動，視窗跨過 768px 時焦點在哪一組就切到哪一組），最下方固定一列「下載圖片」與「分享」（分享要瀏覽器支援才有；下內距照 safe-area，頁尾與回到頂部鈕不被蓋住，焦點捲動用 `scroll-padding` 避開按鈕列與小卡）；打字時（文字欄、數字欄與文字框得到焦點，離開時拿掉，欄位之間移動不拿掉；選單不算：它不開鍵盤，Android 與電腦的 Chrome 選完之後焦點還留在選單上，算的話選完主職，按鈕列會一直收著）`#cardTool` 加 `.is-typing`，按鈕列收起來、小卡縮到 20vh，讓正在打的欄位看得到；換分頁要藏起有焦點的欄位時，`selectTab()` 先讓它失去焦點並拿掉 `.is-typing`（Safari 藏起有焦點的欄位時不一定送 `focusout`）。`style.css` 只寫版面、只用 token，沒有 `overflow-x`、不寫死比畫面寬的寬度（測試守住）；手機版面的實際高度與位置沒有自動測試守住（fake-dom 沒有版面），改版面要用瀏覽器量。三語（zh／en／ja，翻譯檔 `assets/js/i18n/translations/tools/character-card.js`，鍵都是 `char_card_` 開頭）：介面、錯誤，與卡片上的日子與時段（「平日」「假日」「早上」…，卡片上用短標籤）和喜歡的內容（膠囊裡的字用介面語言的名稱）跟著介面語言，換語言時重畫卡片；職業名稱用共用資料的官方名稱，伺服器名稱照原文（國際服英文、繁中服中文），「Lv」、「FF14.tw」與 `FINAL FANTASY XIV © SQUARE ENIX` 三語都一樣（`script.js` 的 `LEVEL_LABEL`、`MARK`、`NOTICE`）。預覽的 canvas 有 `role="img"` 與 `aria-label`（例如「角色卡預覽：Luna Starweaver，伊弗利特，騎士 Lv 100」，只寫填了的部分），隨欄位更新；下載、分享、複製的結果用 `FF14Utils.showToast`（同時念給螢幕閱讀器）。要用本機伺服器開：用 `file://` 直接開時，職業圖示讓 canvas 不能轉成圖，下載、分享、複製都會失敗（見上面的 CORS Requirements）。檔案分工：欄位的規則（預設值、字數與個數的上限、整理與驗證、重點色、圖片位置，以及讀寫 `localStorage`，storage 由呼叫端傳進來，不丟例外）在不碰 DOM 的 `card-state.js`（`CardState`）；版面計算（名字縮多少、折行、膠囊排列、截圖填滿框與拖曳縮放的換算、重點色上用白字還是深字，文字有多寬由呼叫端傳進來的量字函式回答，不碰 canvas）在 `card-layout.js`（`CardLayout`，凍結的純函式）；怎麼畫在 `card-renderer.js`（`CardRenderer`：`SIZES`、`fontsFor()`、`draw()`，只畫圖、不碰 DOM，收任何 2D context）；角色圖的縮小與讀回在 `card-image.js`（`CardImage`，讀圖與建 canvas 由呼叫端傳進來；轉 JPEG 用的暫存 canvas 轉完（失敗也一樣）就把寬高設成 0 放掉：iOS Safari 的 canvas 記憶體有總量上限，一個 session 裡傳很多張圖都不放，之後就轉不出圖）；輸出（檔名、`toBlob`、下載、分享、複製、內建瀏覽器偵測與 LINE 的外部瀏覽器網址）在 `card-export.js`（`CardExport`，不碰任何全域，`nav`、`win`、`doc` 都從參數來）；`script.js`（`CharacterCardApp`）只管畫面與事件：表單 ↔ 狀態 ↔ 重畫、分頁、上傳與拖曳、輸出與大圖、語言；`style.css` 是編輯畫面的版面。職業與伺服器的清單來自共用的 `assets/js/ff14-game-data.js`（`FF14_JOBS`、`FF14_WORLDS`、`FF14_TC_WORLDS`，頁面只從 `window` 讀；Lodestone 角色查詢也讀這個檔，但只用 `FF14_JOBS`、`FF14_WORLDS`）。舊版的兩種卡片版型（`card-templates.css`）與把國服列在 Taiwan 底下的 `character-card-data.js` 都已刪掉
2. **Dungeon Database（副本資料庫）** (`dungeon-database/`): 不放圖的精簡列表，一列一個副本（一顆按鈕：名稱、類型、「7.x 黃金之遺產」、Lv、展開記號，`aria-expanded`／`aria-controls`），版本由新到舊（7.x → 2.x），同版本照資料檔原本的順序。先列 30 個（`DungeonList.BATCH`），「顯示更多（還有 N 個）」每次再加 30 個，只在後面加新的列、不重畫已經在的列，焦點移到新加的第一列；換搜尋或篩選時回到 30 個，切換語言不動已列出的筆數。點一列就在原地展開名稱、簡介、機制、掉落物與獎勵（名稱在按鈕外面再寫一次：整列是一顆按鈕，按鈕裡的字選不起來、不能複製，詳情裡的這一段可以；沒有掉落物寫「資料裡沒有特殊掉落物」，沒有神典石寫「沒有神典石」；詳情和列一起建，收起時 `hidden`），展開與收起只改那一列，`li` 與焦點都留在原地；可以同時展開好幾列，展開的副本照 `id` 記，換搜尋、篩選、顯示更多、切換語言之後保留，被篩掉再篩回來還是展開的。搜尋框打字後延遲 300 毫秒才套用，比對名稱、簡介、機制與每一項掉落物（去掉前後空白的不分大小寫子字串，不用正規表示式）；名稱以外命中的欄位直接寫在列上，各一行，依掉落物（第一個符合的，其餘寫「（還有 N 項也符合）」）、機制、簡介的順序，只有名稱命中時不多寫，命中的字用 `<mark>` 標出來（列上的名稱、命中行與展開的詳情都標，詳情包含名稱那一格，字用標題色）。筆數（`#resultCount`，`aria-live`）和「篩選」按鈕同在 `.result-bar` 這一行：沒有搜尋也沒有篩選寫「共 N 個副本」，否則寫「找到 N 個副本」；找不到時換成和找不到的標題同一句並加 `visually-hidden`（畫面上不再重複寫「找到 0 個副本」，螢幕閱讀器照樣念，`#noResults` 本身不是 live region），有結果時拿掉 `visually-hidden`。篩選是類型（8 顆）與版本（2.x～7.x 共 6 顆）兩組按鈕，同一組是「或」、兩組之間與搜尋是「且」，沒有等級那一排（等級本來就跟著版本走）；點篩選按鈕與「清除篩選」立刻套用搜尋框現在的字並取消還沒跑的延遲搜尋，「清除篩選」沒選任何篩選時是 `aria-disabled`（焦點留在按鈕上），只清篩選、不清搜尋字。手機版面（`(max-width: 768px), (max-height: 500px)`，和攻略資料的 `MOBILE_QUERY` 逐字相同，含橫放的矮視窗）把篩選面板收在筆數那一行（`.result-bar`）右邊的「篩選」按鈕後面：搜尋框單獨一行、整行寬，下面一行是左邊筆數、右邊按鈕（`--control-md` 高，有選篩選時寫「篩選（N）」，`aria-expanded`／`aria-controls`；筆數藏起來時按鈕也靠右），面板在這一行下面展開，一開始是收起的；搜尋框的提示字是中文「搜尋副本、機制或掉落物」、英文「Name, mechanics, drops」、日文「名前・ギミック・ドロップ」（用詞一致比放得進 320 寬重要）：`type=search` 的搜尋框，在 Chrome 沒打字時也替清除鈕預留約 16.5px，提示字能用的寬度因此少一截，所以 `style.css` 用 `#searchInput:placeholder-shown::-webkit-search-cancel-button { display: none; }` 在沒打字時把清除鈕拿掉（一打字 `:placeholder-shown` 就不成立，清除鈕照常出現；整份 `style.css` 只有這一條、只動這個搜尋框）。這些寬度只在 macOS 的 Chrome 量過（390 寬三語都完整，320 寬（輸入框可用 212px）中文與英文完整，日文最後的「プ」被切約 3.6px），Safari、Firefox 沒有量過。電腦版面沒有這顆按鈕、面板一直在，`.result-bar` 這時只有筆數，用 flex 的 `order` 排在面板後面（篩選按鈕下面、卡片底部，接近列表；DOM 順序仍是搜尋框、筆數、按鈕、面板，換位置的只有不能互動的筆數，Tab 順序不變），手機版面把 `order` 還原成 0；視窗變成手機版面時，焦點在面板裡就把面板展開（不然焦點會掉回頁面最上面）。找不到（載入完而且 0 個符合）時顯示 `.empty-state`，標題（`noResultsText()`）照搜尋字與篩選：只有搜尋字寫「找不到符合「X」的副本」（X 是去掉前後空白的原字，用 `textContent` 放），搜尋字與篩選都有寫「在選了的篩選裡找不到「X」」，只有篩選寫「找不到符合條件的副本」；有搜尋字才有「清除搜尋」，有選篩選才有「清除篩選」，按了之後焦點移到搜尋框；這時筆數換成同一句並藏起來（見上面）。載入失敗只顯示錯誤訊息，不在 console 留東西。資料（`data/dungeons.json`）803 筆裡用 `visible: false` 藏起 441 筆，顯示中 362 筆（編號 1～362）：其中 278 筆是為了精簡列表而藏起來的（機制與簡介只有「待補充」的 268 筆，加上只有另一種固定範本句的 8 筆與重複的 2 筆），補好資料把 `visible` 改回 `true` 就會顯示，沒寫 `visible` 的也算顯示（寫法見 `tools/dungeon-database/README.md`）。類型、版本名稱、機制、簡介與掉落物是資料，三種語言都顯示中文；用語照官方：類型是「聯盟任務」（不是 24人大型任務）、3.x 是「蒼天之禁城」。資料來源那一段的副本數由程式填入顯示中的筆數，不寫死。規則（取出與排序、搜尋與篩選、命中的欄位、標示用的切段、獎勵文字）在不碰 DOM 的 `dungeon-list.js`（`DungeonList`，凍結的物件，不改傳進去的資料），頁面 `script.js`（`DungeonDatabase`）只管畫面與事件
3. **Mini Cactpot Calculator（仙人微彩計算機）** (`mini-cactpot/`): 點格子旁的小數字盤填數字（焦點在格子上或小數字盤開著時也能直接按 1–9；填好的格子再點可以改或清除）；盤面上方的狀態列寫下一步（點遊戲翻開的那一格 → 刮哪一格 → 選哪條線與平均 MGP，一樣好的用「或」連起來；狀態列留三行的高度（413px 以下的手機英文留四行），換行時盤面不會跳動，只有 320px 寬、七個同分這種很少見的情況例外）；沒翻開的格子寫刮了之後平均可拿多少 MGP，推薦的格子與線標綠色，填滿 4 格後外圈寫每條線的平均、沒翻開的格子不能再點；獎金表一直顯示（手機在盤面下面、768px 以上在右邊）並標出推薦線還可能出現的總和；上一步會寫出退回了什麼，「下一張」清空盤面、按錯可以用上一步救回來。期望值計算在不碰 DOM 的 `cactpot-solver.js`，小數字盤是共用的 `assets/js/cell-popover.js`
4. **Wondrous Tails Predictor（天書奇談預測器）** (`wondrous-tails/`): 4x4 盤面，點一格貼上貼紙、再點一次拿掉，最多 9 張（16 格都是 `<button>`；貼滿後其他的空格 `disabled`，`toggle()` 自己也不讓第 10 張與盤面外的位置通過；這一頁不跳 toast）；盤面卡標題列左邊寫「已貼 N／9 張」，右邊是同一顆「清空盤面」／「復原」按鈕（一般按鈕，不是紅色）：清空時先存一份清空前的盤面，按鈕就地變成「復原」（焦點不動），復原把它放回去；清空之後真的貼上或拿掉任何一張貼紙就不能再復原（被 `toggle()` 擋下來的點擊不算），盤面是空的、也沒有可以復原的盤面時按鈕 `disabled`。機率表每一列是貼滿 9 張時「至少 1／2／3 條」的機率，欄是「現在」（照目前的盤面，剩下的貼紙隨機落在空格，每一種落法一樣可能）與「重置之後」（隨機 9 張的盤面，11,440 種裡有 6,688／1,208／24 種，即 58.5%／10.6%／0.21%），每個數字配一條長條；只有貼 3～7 張（遊戲能重置）時才有「重置之後」，其他張數寫「—」、長條長度 0；不給建議，也不用好壞配色，要不要重置由玩家決定。連成的線上的格子框 3px 綠色 `outline`、只差一張的空格框 2px 綠色虛線（貼滿 9 張時不標），格子的 `aria-label` 也寫「已連成線」「貼了就連成線」；綠框用 `outline`、虛線框用 `border`，已貼的格子也不設 `box-shadow`，共用的 `.cell:focus-visible` 焦點外框才不會被蓋掉（用鍵盤時看得到焦點在哪一格）。手機上機率緊接在盤面下面，768px 以上盤面在左、機率在右。機率與連線的計算在不碰 DOM 的 `tails-odds.js`（`WondrousTailsOdds`），「重置之後」的機率載入時用同一個列舉算空盤面得到，不另外寫死
5. **Faux Hollows Calculator（宗長計算機）** (`faux-hollows-foxes/`): 6x6 盤面（`board-data.js` 的 252 種盤面，36 格都是 `<button>`），一欄、最寬 28rem（電腦也一樣）。盤面上方的狀態列（`aria-live="polite"`，固定留兩行高，英文、日文在手機上折成兩行時盤面不會跳動）寫現在要做什麼：① 點遊戲裡被擋住的格子（有確定的障礙物之後加「・已知 N／5」）→ ② 找劍 → ③ 找寶箱 → ④ 翻宗長（不一定有）→ 完成，②～④ 後面寫還剩幾次（一局最多翻 11 格）；目標照「劍還沒翻完而且剩的次數夠翻完 → 寶箱同樣 → 還有地方放 🦊 → 完成」判斷，次數不夠翻完劍或寶箱就跳到下一個目標。障礙物階段只看手動標的障礙物：候選格顯示障礙物機率，不可能是障礙物的格子 `disabled`，其他障礙物的位置能確定時自動補上（斜線加 2px 虛線框，名稱寫「障礙物（自動補上）」，不能點），自動補上的不存進狀態（每次重畫都從 36 格的狀態重新算，所以拿掉手動標的，它補上的跟著消失），擺法只剩一種就進入翻格，手動標的與自動補上的障礙物都鎖住，要改用「上一步」。翻格：點還沒翻的格子，在旁邊開共用的小選單（`CellPopover`，2 欄：劍、寶箱、宗長、空；上三列（位置 0–17）開在格子下方，下三列開在上方；用鍵盤打開時焦點在第一個能選的選項），和其他格對不上的選項是灰的（宗長只有一隻，別格已經是宗長時宗長是灰的），只剩一種可能時點一下就標好、不開選單；點翻開的格子是同一個選單，目前的標成已選，最後多一個獨佔一列的「清除」；翻了好幾格之後回頭改早先的一格，選單只列和其他格還對得上的選項（不會走到 0 種盤面），機率、🦊、下一格與剩幾次都跟著重算。次數用完時還沒翻的格子不能點、翻開的照樣能點；「完成」但還有次數時，還沒翻的格子照樣能點。`tapCell()`、`choose()` 自己也擋（不靠格子的 `disabled`：不可能的格子與選項、鎖住的障礙物、次數用完時還沒翻的格子，直接呼叫也什麼都不變）。焦點所在的格子可能跟著鎖住（擺法確定時它是障礙物，或次數用完時它還沒翻）：`render()` 先記下焦點在哪一格，鎖住了就把焦點移到第一個下一格，沒有下一格就移到第一個能點的格子（不然瀏覽器會把焦點丟到頁面上，只用鍵盤就玩不下去）。翻格候選依劍藍、寶箱紅、宗長黃等分底色；「隱藏機率／顯示機率」只切換百分比數字，保留兩個階段的候選底色、圖示、結果與下一格綠框。還沒翻的格子寫 ⚔️、📦 加整數百分比（`formatPercent()` 的結果，本身就帶「%」，0 不寫，不到 1% 寫「<1%」；只有一個提示的格子圖示一行、百分比一行，因為 `⚔️100%` 在手機上一行放不下；359px 以下提示字 11px，這是這一頁唯一沒有用 token 的字級；提示的寬度只在 macOS 的 Chrome 量過，Android、Safari、Firefox 沒有量過），可能有宗長的格子只放 🦊、**不寫任何數字**：宗長多常出現沒有公開，算不出實際的機率；而拿盤面的比例當機率會騙人，「假設這局有宗長」的比例每翻開一個空格就往上加（只剩 1 種盤面時 25% → 33% → 50% → 100%），「可能有宗長的盤面占幾成」在劍確定後會讓 4 格同時寫 100%。宗長只在決定「④ 翻宗長」的下一格時用「這格是還沒翻開的宗長位置的盤面種數」排先後；找到宗長之後其他格都不放 🦊；🦊 的說明留在頁面下方一句。下一格框共用的 `.cell.suggested`（同分全部框）；格子名稱（`aria-label`）寫「第 N 格」加狀態或提示（例如「第 27 格：劍 75%，寶箱 13%，建議翻這格」），螢幕閱讀器才聽得到畫面上的提示。「上一步」「重做」並排、「重置遊戲」另放一行（頁面上沒有 `.btn-primary`，不能按時用 `aria-disabled`，焦點留在按鈕上）：每個動作（標、拿掉、翻開、改、清除、重置遊戲）之前存一份，上一步退回並用 toast 寫出退回了什麼（「已退回：第 26 格標成劍」），重做恢復退回的動作，新動作清掉重做分支，切換顯示不改歷史；退回進入翻格的那一步時自動補上的跟著消失、障礙物又能點；「重置遊戲」清空盤面、不跳 toast，按錯了用上一步救回來，盤面是空的時按了什麼都不做；開著小選單時 `undo()`、`redo()`、`resetGame()` 自己先把它關掉。盤面的計算在不碰 DOM 的 `hollows-solver.js`（`FauxHollowsSolver`：`flatten()`、`analyze()`、`choices()`、`formatPercent()`，盤面資料當參數傳進去；同分比的是「幾種盤面」這個整數，不除成比例再比）
6. **Treasure Map Finder** (`treasure-map-finder/`): 227 treasure map coordinates (G8/G10/G12/G14/G15/G17/G18) with a personal or party list (invite link, every map labelled with whose it is), a stop-by-stop route with saved progress, and share links
7. **Lodestone Lookup（Lodestone 角色查詢）** (`lodestone-lookup/`): 查自己和隊友的角色：用名字加伺服器找人，或貼 Lodestone 角色頁的網址或 ID；只限國際版角色（繁中服在 Lodestone 上本來就沒有，首頁卡片標「僅限國際版角色」）。資料來自 logstone Worker（見 API Integration）。三種畫面，一次只看得到一個（`script.js` 切換 `hidden`）：打開時、搜尋結果、角色。打開時由上而下是「我的角色」（有設才有，整張卡片是一顆按鈕，點了打開；資料是設定時記下的快照，打開這個角色時更新）→「找人」→「最近查過」（有才有，最多 5 個，新的在前，同一個人只出現一次，不含我的角色），兩個都沒有是第一次來，上面多一句說明；找人有角色名字、伺服器選單（全部伺服器、11 個資料中心、85 個伺服器，值就是官網搜尋的 `worldname`）與搜尋鈕（這一頁唯一的 `.btn-primary`），名字欄收到 Lodestone 角色頁的網址或 ID（`LodestoneModel.parseInput()`）就直接打開那個角色、不搜尋，貼上網址時名字欄馬上換成 ID，有撇號或連字號的名字（`Y'shtola Rhul`）照樣是名字。搜尋結果上面是「← 找其他人」和填好剛才條件的找人表單，接著一行摘要（「在 Tiamat 找到 N 個「名字」」，N 用官網的總數）和結果，只列第一頁：每一列是頭像、名字、伺服器（資料中心）與部隊（有才寫），點了打開，只有一個結果也列出來、不自動打開；還有下一頁時寫「還有更多結果，請把名字打完整或選伺服器」，沒有結果時寫在哪裡找不到並提示確認伺服器或貼網址；搜尋失敗（Worker 還沒有搜尋端點、連不上、502 或其他）時寫原因，並給「到 Lodestone 官網搜尋」的連結（新分頁）。角色畫面是標頭加六個分頁。標頭有頭像、名字、稱號（沒有不寫）、「伺服器（資料中心）・部隊 名稱」（部隊名稱是切到部隊分頁的按鈕）、「現在：職業圖示 職業 LvN」、「☆ 設成我的角色」／「★ 我的角色」（同一顆按鈕，`aria-pressed`）、「在 Lodestone 打開 ↗」、名稱與成就顯示（下面說明）和資料時間。分頁是 WAI-ARIA 分頁（左右方向鍵移動並切換、Home／End 到頭尾），一開始是職業：職業（官方的七組，Lv100 才算滿級，青魔法師與 Beastmaster 的等級上限不同所以不標，「滿級 N 個」，最下面一行特殊內容）、成就（成就數與點數、名稱與取得日期、上一頁／下一頁，不公開時寫一句）、裝備（只有每一格的裝備圖示與染色：Lodestone 的角色頁沒有裝備名稱，頁面也寫明；另有「現在：職業」與收起來的屬性）、收藏（坐騎與寵物，一個名稱篩選框同時篩兩個清單，不用防抖）、部隊（資料與成員列表，成員有頁數，點一列打開那個成員；活動重點、招募對象與三國聲望在中文介面換成官方繁中；沒有加入部隊寫一句、不打請求）、其他（大國防聯軍的官方名稱加軍階原文、生日、守護神、開始城市、個人簡介）。打開角色時只打標頭與職業，其他分頁第一次打開才載入，同一個角色、同一種名稱與成就顯示只載入一次；每個分頁有自己的載入中、錯誤與「再試一次」。名稱與成就顯示 English／日本語取代以前的「北美／日本資料中心」（兩邊的角色資料是同一份，差別只在回來的文字是英文還是日文）：找人卡片與角色標頭各有一組按鈕，兩組永遠一樣；English 對到 Worker 的 `dc=na`，日本語對到 `dc=jp`；沒按過時日文介面用日本語、其他用 English，按過就記住；正在看角色時換，標頭與目前的分頁用新的語言重新載入，其他分頁下次打開再載入。角色名字、稱號、成就、坐騎、寵物、部隊是官網原文，不翻譯；職業名稱是共用的 `assets/js/ff14-game-data.js` 的 `FF14_JOBS`（`lodestone-data.js` 的 `LODESTONE_JOBS` 指到同一份；三種介面語言的官方名稱，跟著介面語言），大國防聯軍、部隊活動重點與招募對象、聲望與開始城市是 `lodestone-data.js` 的 `LODESTONE_TERMS`（只有中文介面換成官方繁中，認不得的原文照舊）；職能的名稱在翻譯檔（`lodestone_role_*`），`ff14-game-data.js` 只記每個職業屬於哪個職能。瀏覽器記憶只存在玩家自己的瀏覽器（`LodestoneStore`）：`localStorage['ff14tw_lodestone_mine']`（我的角色，`id`、`name`、`world`、`dc`、`avatar`、`job`、`level`）、`ff14tw_lodestone_recent`（最近查過，前五個欄位）、`ff14tw_lodestone_lang`（`en` 或 `ja`）；每次讀寫都包 `try/catch`，壞掉的內容丟掉壞的部分，瀏覽器封鎖網站資料或寫不進去（容量已滿）時改記在記憶體裡，這次打開期間照常運作、只是不記住。網址只有看角色時有 `?id=<Lodestone ID>`（可以分享，打開就是那個角色）；搜尋條件記在 `history.state`、不放網址；從別的畫面搜尋、打開角色與「← 找其他人」各新增一筆上一頁的紀錄，上一頁／下一頁回到那個畫面（搜尋結果從記憶體拿，不在了就是打開時），不會離開這個工具。每個 Worker 請求綁在一個 context（`AbortController`）上：搜尋、打開角色、回到打開時、換名稱與成就顯示都先取消舊的，舊的回應或錯誤晚到一律不採用；有頁數的（成就、部隊成員）較舊的頁數晚到也不蓋掉最後選的那一頁。角色標頭打不開時整個角色畫面換成錯誤訊息與「← 找其他人」：404 寫「找不到這個角色」，502 寫「Lodestone 暫時連不上，請稍後再試」，其他（500、400、連不上 Worker、回應不對）寫「查詢失敗」；分頁失敗只分 502 與其他。Worker 還是舊版時也能用：沒有 `ActiveClassJob` 就用官網的圖示加等級（`LodestoneModel.activeClassJobOf()`，存下的我的角色也有這個等級），部隊只有 `{ ID, Crest }` 時標頭只寫「部隊」（部隊分頁載入後補上名稱），沒有 `FetchedAt` 就不寫資料時間，沒有 `Gear` 寫「沒有裝備資料。」，搜尋端點不存在（它的 404 沒有 CORS 標頭，瀏覽器擋下請求，`fetch` 丟例外）當成搜尋不能用。用語照 `TERMINOLOGY.md`（部隊、大國防聯軍、不滅隊與各職業的官方名稱），Beastmaster 沒有官方中文名稱，顯示原文，`tests/lodestone-page.test.js` 擋舊用語。手機不能左右捲：`styles.css` 沒有 `overflow-x`，分頁放不下就換行；職業的格子放寬到每種語言最長的名稱連同圖示與等級放得進一行（英文 9.25em、日文 9.5em；中文的手機照草稿 6.6em，481px 以上 7.75em：1280 寬是中文 8 欄、英日文 6 欄，英日文的手機是一欄），名稱放不下時換到第二行、不截斷（例如 375px 以下手機上中文的 Beastmaster）；名字下面那一行（伺服器與資料中心、職業與等級、部隊）每一段是 inline-block，只在段與段中間換行，不會把「吟遊詩人」斷成兩行。手機的第一個畫面看得到標頭與第一組職業（用 Chrome 量過：390×844 三種語言都看得到（英日文是一欄），375×667、360×640 的中文看得到，320×568 在第一個畫面下面，要捲一下；沒有自動測試守住，改版面要用瀏覽器量）。檔案分工：不碰 DOM 的規則在 `lodestone-model.js`（`LodestoneModel`，凍結的純函式），記憶在 `lodestone-store.js`（`LodestoneStore`），靜態資料裡的基本職業與原文對照在 `lodestone-data.js`，職業與伺服器在共用的 `assets/js/ff14-game-data.js`（`LODESTONE_JOBS`、`LODESTONE_WORLDS` 指到它的 `FF14_JOBS`、`FF14_WORLDS`；Lodestone 查不到繁中服，所以它的 `FF14_TC_WORLDS` 這一頁用不到），六個分頁在 `lodestone-tabs.js`（`LodestoneTabs`），`script.js`（`LodestoneLookup`）只管三種畫面、標頭、事件、請求與網址
8. **Timed Gathering Manager** (`timed-gathering/`): 特殊採集點的艾歐澤亞時間管理，一種素材一張卡片（資料裡同一種素材的幾個時段合成一張），標題是介面語言的名稱、下面小字是另外兩種語言的名稱，地點行照介面語言寫地區與地點（地點就是地區本身時只寫一次），狀態行每秒倒數「現在可採 · 還剩…（到幾點）」或「幾點出現 · 還要…」，照出現時間排序（現在可採的在前、全天的最後；有素材出現或結束時重排，焦點在卡片裡時延後）；搜尋框用中文、日文或英文都搜得到（含英文地區與地點名稱），好幾個字時每個字都要符合，命中的字用 `<mark>` 標出來；「提醒我」（全天的素材沒有）與頁面最上面的「我的提醒」：出現前 0／1／2／3／5／10 分鐘通知（預設 1），頁面要開著才會響，用共用的 `assets/js/reminder-scheduler.js`（頁內提示加提示音，瀏覽器允許時加系統通知；通知被封鎖或不支援時網頁提醒的開關照樣能用），先列 5 個（手機 3 個）、其餘按「顯示全部」，另一個分頁改了會跟著變，舊版開著採集提醒的人，預設清單裡的素材（全天的除外）會帶進我的提醒；「複製鬧鐘」（全天的素材同樣沒有）複製這種素材下一次出現的一行 `/alarm` 指令（`/alarm "<名稱>" et HHMM 1 se04 mute`，格式同整份清單的巨集、只少了 `rp`；官方文字指令說明沒有寫不帶 `rp` 的鬧鐘會響幾次，所以畫面與文件都只寫複製了什麼，不承諾次數），並在卡片或提醒列下面寫出複製了什麼；多清單管理、匯入／匯出與整份清單的巨集匯出（每行仍然有 `rp`）照舊
9. **Guide** (`guide/`): FF14 新手攻略指南，8 個頁面（攻略首頁加 7 個主題：部隊、大國防聯軍、副本、隊伍系統、風脈、探索筆記、專屬陸行鳥），沒有任何頁面載入資料檔，不需要本機伺服器。專屬陸行鳥文章裡的「染色計算器」小節（`h2#color-calculator`，以前分享出去的連結停在這裡）只剩一張連到陸行鳥染色計算器的卡片。部隊、副本、風脈、探索筆記 4 個主題還沒有內容：內文只有一句「這一頁還在撰寫中。」（副本頁多一句連到副本資料庫），`<meta name="description">` 老實寫「撰寫中」並加 `<meta name="robots" content="noindex">`，攻略首頁的卡片（說明下面）與目錄（名稱後面）標共用的 `.tag.tag-warning`「撰寫中」，首頁的攻略卡片多一行「4 頁撰寫中」（`status_guide_pages_pending`）。目錄（`sidebar-template.js` 的 `GuideSidebarTemplate`）是 `<details>`：電腦（寬度 769px 以上而且高度 501px 以上）是左邊 sticky 的側欄，預設打開，標題「目錄」右邊的 ▾ 也能收起來（重新載入或視窗跨過斷點時又打開）；手機收成一行「目錄」，點開才列出全部主題與「← 返回總覽」，不在框裡捲。「手機」是 `MOBILE_QUERY`（`(max-width: 768px), (max-height: 500px)`）：窄螢幕，或橫放的手機（寬度超過 768px 但高度 500px 以下，例如 844×390：電腦版 sticky 側欄的框放不下整份目錄，會變成要在框裡捲的框）；`style.css` 裡目錄與單欄的版面用同一個 `@media`（`.toc-sidebar` 的 `max-height` 是 `none`、`overflow` 是 `visible`，目錄整個展開），字級、內距、卡片格、上一篇／下一篇堆疊這些只有窄螢幕才需要的規則留在 `(max-width: 768px)`，橫放的手機維持電腦版的樣子；整份 `style.css` 沒有 `overflow-x`；視窗跨過斷點（寬度 768px、高度 500px）時照大小開關，焦點在目錄裡就維持打開（收起來的話焦點會掉到頁面最上面）。高度超過 500px 的電腦視窗照舊是 sticky 側欄，視窗比整份目錄矮時側欄仍會在框裡捲（這是 main 上就有的電腦版行為，反目標只管手機）。用語照 `TERMINOLOGY.md`：Free Company 是「部隊」（檔名 `guild.html` 與 `guide_toc_guild` 等翻譯鍵不改，以前的連結照樣能用）、Guildhest 是「公會令」、「艾歐澤亞」、主屬性 Dexterity 是「靈巧」；「公會」只能出現在「公會令」裡，`tests/guide-pages.test.js` 會掃攻略資料的每個 html、`sidebar-template.js`、`guide.js` 與首頁翻譯的中文
   - 寫好 4 個撰寫中主題的其中一頁（`guild.html`、`dungeon.html`、`aether.html`、`sightseeing.html`）時，下面幾處要一起改：
     - 那一頁自己：拿掉 `<meta name="robots" content="noindex">`，meta description 改成真正的摘要（不再寫「撰寫中」），內文換成真正的內容（不再是 `guide_coming_soon` 那一句）
     - 改了那一頁的 `<title>` 或 meta description：要重跑 `node scripts/share-preview.mjs pages` 與 `node scripts/share-preview.mjs images`，因為那一頁的預覽標籤與它的預覽圖 `assets/images/og/guide-<檔名>.png`（例如 `guild.html` 的是 `guide-guild.png`）都照抄這兩段字；忘了跑，`tests/share-preview.test.js` 會失敗（見「分享預覽與主畫面」）
     - `tools/guide/sidebar-template.js` 的 `ITEMS`：拿掉那一項的 `pending: true`（目錄裡的「撰寫中」標籤就是靠它畫的）
     - `tools/guide/index.html`：拿掉那一張卡片的「撰寫中」標籤（`span.guide-card-pending`）
     - 首頁攻略卡片的 `status_guide_pages_pending`（「部隊、副本、風脈、探索筆記 4 頁撰寫中」）：`assets/js/i18n/translations/index.js` 的三語、根目錄 `index.html` 的預設文字，以及 `tests/home-page.test.js` 釘住的字串一起改，4 頁都寫完就拿掉這一行；沒有測試把它和 `PENDING` 對照，要自己記得改
     - `tests/guide-pages.test.js` 的 `PENDING`：拿掉那一頁；寫的是部隊那一頁時，「部隊」測試裡檢查首頁 `status_guide_pages_pending` 還寫著部隊、Free Company、フリーカンパニー 的幾行也要跟著改
     - 寫的是副本那一頁時，「4 個空頁」測試裡只給副本頁的那一段也要一起處理：`dungeon.html` 的 meta description 要提到副本資料庫、內文要有「想查副本，可以先用〈副本資料庫〉。」那一句（前後各一個 `guide_dungeon_db_prefix`／`guide_dungeon_db_suffix` 的 `span`，中間是連結），以及這兩個鍵的三語值。新內容不留這一句，就把那一段與翻譯檔裡的兩個鍵一起拿掉；留著就照新內容改
10. **Report Generator** (`report-generator/`): 產生不當行為檢舉的模板文字，協助申訴
11. **Macro Converter（巨集轉換器）** (`macro-converter/`): 把英文、日文攻略裡的生產巨集換成繁體中文（目標語言也可以選英文、日文）。範圍只有生產技能與文字指令，戰鬥、採集技能還沒有收錄（資料 `data/macro-mappings.json` 只有生產技能與文字指令），頁面上寫明（`.page-header` 的兩行：說明 `macro_converter_desc` 與小字的範圍 `macro_converter_scope`）。貼上或打字就立刻轉換，沒有「轉換」鈕也沒有 Ctrl／⌘＋Enter：輸入框的 `input` 與目標語言的 `change` 都直接重轉，不 debounce；輸入框（`#inputMacro`）一開始是空的，提示字是三行範例（英文、日文、繁中各一行，三行轉出來是同一行）。輸入、輸出框與目標語言選單都是 `autocomplete="off"`：瀏覽器重新整理時不會把輸入框還原成和輸出對不上的內容。目標語言預設繁體中文（不看網站介面語言），改了就存在 `localStorage['ff14tw_macro_target_lang']`（`zh`／`en`／`ja`，讀寫都包 `try/catch`，沒存過、存著的值壞掉或讀不到時是繁體中文）；切換網站介面語言只換介面文字（說明、按鈕、輸出框的提示字、輸出標題列、要注意的行），不改目標語言，輸出內容也不動。輸出標題列（`#outputTitle`，是輸出框的 `<label>`）寫「繁體中文・13 行」，用翻譯鍵 `macro_converter_output_title`（`{lang}`、`{lines}`）組成：語言名稱跟著介面語言（中文介面「繁體中文」，英文介面「Traditional Chinese」，日文介面「繁体字中国語」），行數照英文單複數（`1 line`／`2 lines`），兩者中間的符號是每種語言自己的翻譯、不寫死在程式裡（中文、日文是 `・`，英文是前後各一個空格的 `·`：`Traditional Chinese · 13 lines`），只算到最後一個非空行（結尾的空行、只有空白的行不算：貼上的巨集結尾常帶幾個換行，不能因此多跳「超過 15 行」；空行在前面或中間照算，是巨集的一部分），輸入是空的時只寫語言名稱；標題列右邊的「複製」是整頁唯一的 `.btn-primary`。標題列下面、輸出框上面是「要注意的行」（`#macroWarnings`，`.warning-message` 樣式的 `<ul role="list">`，沒有問題時整塊 `hidden`；不是 live region，輸出框用 `aria-describedby="macroWarnings"` 指到它，螢幕閱讀器聚焦到輸出框時念）：每個轉不了的詞、每一行不是指令的行各一條、依行號排——「第 12 行：「Final Appraisal」沒有收錄，照原文保留」（技能名不在資料裡）、「第 3 行：「/foo」不是認得的指令，照原文保留」（指令不認得）、「第 1 行：「マクロ1」不是指令，遊戲裡會當成聊天訊息送出」（不是 `/` 開頭的行：貼上的標題、表格複製下來的編號、`#` 備註；遊戲沒有註解的寫法，沒有 `/` 的一行會被送到聊天，所以整行照原文留著、也列出來，問題的文字是去掉前後空白的整行；空白行不是問題；標題也算輸出的一行，所以 15 行的巨集加一行標題是 16 行、要分成 2 個巨集）；三種問題的翻譯鍵放在 `MacroConverter.WARNINGS`；行號從 1 起算（空行、`\r\n` 都占一個行號），文字一律用 `textContent`（問題的文字是玩家貼上的原文，可能有 `<me>` 這類尖括號）；超過 15 行時最後一條寫「共 18 行：遊戲裡一個巨集最多 15 行，要分成 2 個巨集」（個數是行數除以 15 無條件進位，31 行是 3 個；只提醒，不自動拆）。轉換規則在不碰 DOM 的 `conversion-engine.js`（`ConversionEngine.convert()`：一行輸入對應一個 `{ output, problems }`，`problems` 的項目是 `{ kind: 'action' | 'command' | 'text', text }`）：`/ac`、`/action`、`/技能`、`/アクション` 一律輸出 `/ac`，輸出的技能名一律加直引號；30 個常見的英文簡寫（`/mlock`、`/merror`、`/micon`、`/e`、`/p`、`/s`、`/sh`、`/y`、`/t`、`/r`、`/a`、`/fc`、`/em`、`/gs`、`/l1`～`/l8`、`/cwl1`～`/cwl8`，完整指令都在資料裡）原樣輸出、不列入問題；`/macroicon`、`/micon` 後面的技能名也翻譯，第二個參數（`action`、`item`）原樣保留；彎引號換成直引號再比對；引號裡的技能名也先把字與字中間、前後的空白（不換行空白、全形空白、tab、好幾個空白）整理成一個空格再比對，從網頁複製的名字不會被誤判成沒收錄，真的沒收錄的名字輸出與問題的文字照原文；沒加引號、有空格的技能名（`/ac Muscle Memory <wait.3>`）整段查，查不到整段照原文保留並整段列成一個問題；`<wait>`、`<se>`、`/echo` 的文字不動。版面：手機（768px 以下）輸入在上、輸出在下，一欄，兩個框 `rows="8"`（用 Chrome 量過：390 × 844 的第一個畫面看得到輸出標題列與輸出的開頭，三種介面語言、有一條警告時也看得到，320px 寬沒有東西超出畫面；沒有自動測試守住，改版面要用瀏覽器量）；769px 以上左右兩欄（中間沒有「轉換」鈕），框高到放得下一個巨集的 15 行；輸入卡片的標題列有「貼上」與「清除」，標題列放不下時按鈕換到下一行靠右（320px 寬的日文）。`style.css` 沒有 `overflow-x`；中文說明只在標點後斷行（`:lang(zh)` 的 `word-break: keep-all`，日文套 `keep-all` 句號會單獨掉到下一行，所以只給中文）。輸出框（`#outputMacro`）是這一頁的答案，不能看起來像提示字：共用的 `.form-control[readonly]` 把字設成輔助色（和提示字同色）、游標設成 `not-allowed`，`style.css` 用 id 只在輸出框蓋掉這兩樣（字用內文色 `var(--color-text)`、游標 `cursor: text`），唯讀的底色照舊；輸入框照共用元件。按鈕：「複製」（`#copyOutput`，整頁唯一的 `.btn-primary`）沒有輸出時是 `aria-disabled="true"`，不用 `disabled`：按鈕變灰時焦點留在原地，鍵盤照樣 Tab 得到它；`click` 照樣會送出，所以 `copyToClipboard()` 自己看輸出框是空的就擋（不寫剪貼簿、不跳 toast）。標記裡一開始就是 `aria-disabled="true"`，之後 `renderCopyButton()` 在每一次轉換與切換語言時依輸出框是不是空字串加上或拿掉；外觀在 `style.css` 的 `#copyOutput[aria-disabled="true"]`（半透明、`cursor: not-allowed`，hover 與 active 維持主要按鈕的底色、不浮起、沒有陰影，鍵盤焦點的外框照樣看得到）。「複製」與「✓ 已複製」是同一顆按鈕，`#copyOutput` 有 `min-width: 10.5em`（字級 14px 時是 147px，放得下三種語言裡最長的「✓ コピーしました」145px），換字時按鈕不變寬，靠右的左邊緣不會跳，標題列也不會在複製的那 2 秒換行、把輸出框往下推（用 Chrome 量過：360×800、375×667、390×844 × 中英日共 9 組，正常與複製的狀態標題列高度、按鈕的位置與寬度完全一樣；沒有這條規則時，日文在 360、375px 與英文在 390px，複製的 2 秒標題列會從一行變成兩行、輸出框被推下約 34px；固定寬度之後英文在 360～390px、日文在 360、375px 的標題列一直是兩行（標題一行、按鈕靠右另一行），中文一直是一行；沒有自動測試守住版面，只守住這條規則，改版面要用瀏覽器量，只在 macOS 的 Chrome 量過）。複製成功時寫進剪貼簿的是輸出框現在的字（結尾的空行也在），按鈕暫時寫「✓ 已複製」（`macro_converter_copied_button`）`MacroConverter.COPIED_FEEDBACK_MS`（2000）毫秒再變回「複製」，並跳 toast「已複製」（`FF14Utils.showToast`，同時念給螢幕閱讀器）；期間再按一次就複製那一刻的輸出、再跳一次 toast，前一次的計時取消、重新算 2 秒。「✓ 已複製」說的是剛才複製的那一份輸出：`convert()` 轉完發現輸出和輸出框現在的字不一樣（打字、改目標語言、貼上、清除）而按鈕還寫著它，就呼叫 `resetCopied()`，按鈕馬上變回「複製」、計時取消（清除之後不會是「✓ 已複製」又 `aria-disabled` 的按鈕）；輸出沒變（多打空白、轉出來一樣，選同一個目標語言，切換網站介面語言）就照舊，計時不動。剪貼簿可能晚一點才寫完（瀏覽器在問權限），等的時候輸出變了（打字、改目標語言、貼上、清除）：寫進去的是按下去那一刻的輸出，不是輸出框裡現在的字，所以 `copyToClipboard()` 寫完先比對兩者，不一樣就只跳 toast「已複製」（剪貼簿真的換了），按鈕不寫「✓ 已複製」、寫著的也變回「複製」（`resetCopied()`：連按兩次而先按的那一次最後才寫完時，後按的那一次已經寫了「✓ 已複製」，剪貼簿卻換回舊的輸出）。按鈕的字每次都照目前的狀態與網站介面語言重畫：切換語言時 I18nManager 先把有 `data-i18n` 的按鈕改回「複製」，`renderStatus()` 接著補回「✓ 已複製」。複製失敗（玩家沒給權限、瀏覽器不支援，都在同一個 `try/catch` 裡）時 toast「複製失敗，請手動選取文字」，按鈕不變（寫「複製」），輸出還在，玩家可以自己選取；「✓ 已複製」是成功的意思，2 秒內再按一次而這次失敗時，`resetCopied()` 取消還沒到的計時、馬上把按鈕變回「複製」，不會和失敗的 toast 同時出現。「貼上」用 `navigator.clipboard.readText()`，讀到有字的內容就整個換掉輸入框的字並立刻轉換（程式改輸入框的值不會觸發 `input` 事件，所以自己轉），成功時焦點留在「貼上」上，不彈出手機的鍵盤；讀不到（玩家沒給權限、瀏覽器不支援），或讀到的是沒有字的東西（空字串、只有空白，例如複製的是圖片）時，toast「沒辦法讀取剪貼簿，請直接在框裡貼上（Ctrl+V 或長按）」並把焦點放進輸入框，輸入框原本的字一個字都不動：玩家已經有的字不能被換成空的，沒有復原（以前也會這樣換掉，這次是刻意改掉）；有字就照樣整個換掉，前後的空白與結尾的空行原樣留著，不 trim。貼上成功時焦點不在輸出框，螢幕閱讀器念不到轉出了什麼，所以在看不到的朗讀區（`#pasteAnnounce`：輸入卡片裡「貼上」與輸入框中間的 `<p>`，`.visually-hidden`、`role="status"`、`aria-live="polite"`）寫一句結果「已貼上並轉換：繁體中文・13 行，有 2 條要注意」（標題列的字，加上要注意的條數，超過 15 行的提醒也算一條；沒有要注意的就只到行數；英文照單複數：`macro_converter_pasted`、`macro_converter_pasted_warning_one`、`macro_converter_pasted_warnings`），畫面上輸出框與要注意的行本來就看得到，不跳 toast。朗讀區在按下「貼上」時先清空，成功後隔 `MacroConverter.ANNOUNCE_DELAY_MS`（100）毫秒才寫進去（同 `FF14Utils.showToast`：區塊已經在頁面上才換字，螢幕閱讀器才會念，同一份巨集連著貼兩次也會再念），字在寫進去的時候才取（用那時的網站介面語言）；那一句只說貼上那一次的結果，所以讀不到剪貼簿、剪貼簿沒有字，或重新轉換（`convert()`：打字、改目標語言、清除、再貼上）時清空，還沒寫進去的也取消（切換網站介面語言不清，已經寫進去的維持原本的語言；只在 macOS 的 Chrome 看過無障礙樹裡是 `status`，沒有用真的螢幕閱讀器聽過）。「清除」清空輸入與輸出（標題列只剩語言名稱，要注意的行收起來，複製變回 `aria-disabled`），焦點放回輸入框。toast 與按鈕的字都在剪貼簿的結果回來時才向翻譯檔取（不是建立頁面的時候，也不是按下去的那一刻：按下去之後、結果回來之前切換語言，用的是切換之後的語言），所以跟著那時的網站介面語言。資料載入：標記裡一開始就是載入中（`#inputMacro` 與 `#pasteInput` 是 `disabled`、`#copyOutput` 是 `aria-disabled`，資料載入完才可能有輸出）；`load()` 每一次都從載入中開始（錯誤訊息收起、提示出現），成功就拿掉輸入框與「貼上」的 `disabled`，並把輸入框裡瀏覽器還原的字轉一次；失敗就在工具最上面顯示錯誤訊息（`#loadError` 是 `#macroTool` 的第一個元素，`role="alert"`，裡面有 `#retryLoad`「重試」），輸入框與「貼上」維持停用、複製維持 `aria-disabled`，不在 console 留東西，也不跳 toast。載入中的提示（`#loadingIndicator`，共用的 `.loading`）在輸出卡片裡、和輸出框同一個 `.macro-output` 容器：它用 `position: absolute; inset: 0` 蓋在輸出框上面，不占版面，所以出現與收起都不會讓目標語言、輸入框、兩個標題列或按鈕移動（以前它是 `#macroTool` 的第一個子元素，每次打開頁面都出現在最上面再收起，整個工具往下推約 100px 再彈回來；用 Chrome 量過：390 × 844 載入中與載入完所有控制項的位置完全一樣，390 與 1280 的版面（空的、13 行、有要注意的行、18 行）的位置與大小和改版前逐項相同，320 寬三種介面語言提示都在輸出框裡、沒有東西超出畫面；沒有自動測試守住版面，改版面要用瀏覽器量，只在 macOS 的 Chrome 量過）。「重試」重新跑 `load()` 並把 `app.ready` 換成這一次載入的 promise（`app.ready` 是實例的屬性，不是 `MacroConverter` 的靜態屬性）；「重試」在錯誤訊息裡，按下去錯誤訊息收起、按鈕跟著不見，所以按下去時如果焦點在它上面，載入完把焦點接住：成功移到輸入框、又失敗回到「重試」，焦點不在它上面（Safari 與 macOS 的 Firefox 點按鈕不給焦點）就不去動；載入的期間玩家已經自己移到別的地方（按 Tab 到目標語言的選單、點了「清除」，焦點不是掉在頁面上的 body）時也不去動，不然接著按的鍵會跑到搬過去的地方。事件（`input`、`change`、四顆按鈕）在建構函式裡就綁好，不等資料：目標語言的選單與「清除」沒有停用，載入中、載入失敗時照常能用（選了就記住、標題列換成那個語言，載入完用它轉換）；`convert()` 沒有資料時當成沒有東西可轉，不丟錯。
12. **Weather Forecast** (`weather-forecast/`): 查詢艾歐澤亞各地區天氣預報，答案優先：記得上次選的地區與天氣（網址 hash 的分享連結優先於記憶）；答案卡寫選的天氣下次什麼時候出現、還要等多久、到幾點（正在下時寫還剩多久），連續同一種天氣合成一段，設了時段（艾歐澤亞時間）就只算時段內的部分；「提醒我」在開始前 1／3／5／10／15／30 分鐘（預設 5）提醒，頁面要開著才會響，用共用的 `assets/js/reminder-scheduler.js`（頁內提示加提示音，瀏覽器允許時加系統通知），提醒有自己的地區與天氣，換地區或打開別的分享連結都不取消
13. **Chocobo Color Calculator（陸行鳥染色計算器）** (`chocobo-color/`): 選陸行鳥現在的顏色和想要的顏色，一打開就是答案（預設沙漠黃 → 素雪白），沒有「計算」鈕，頁面上也沒有 `.btn-primary`；載入 `/data/chocobo-colors.json`，載入失敗時答案卡寫錯誤訊息、兩顆顏色按鈕不能按；顏色資料參考自 ffxivchocobo.com（頁面上有標示）。算法在不碰 DOM 的 `chocobo-solver.js`（`ChocoboColorSolver`：`recipe()`、`segments()`、`plan()`、`bestTotal()`、`colorGroups()`，資料當參數傳進去，不改傳進來的東西）：配方（要餵哪幾種水果、各幾顆）的規則沿用舊的計算器，沒有改；`plan()` 同時算「直接調色」與「先餵 1 顆拉札漢檸檬（變回沙漠黃）再從沙漠黃調色」，用顆數少的，一樣多時用檸檬（從確定的沙漠黃開始比較準），檸檬永遠是第一段，目前顏色是沙漠黃時沒有檸檬做法；餵食順序分成幾段：連續餵同一種水果算一段，在每一步都不超出 RGB 0～255 的餵法裡挑段數最少的，段數一樣時挑整個過程離 0／255 最遠的（用「各種水果已餵幾顆＋上一顆是哪一種」當狀態做動態規劃，不逐一試排列），例如沙漠黃 → 素雪白 34 顆分 4 段。答案卡第一行寫「共 N 顆」「分 M 段」「已勾 x／M 段」，下面是「要準備」（每種水果的總顆數，含檸檬）、一行「餵食順序：照 1 → M 餵，一段餵完再換下一段」（只有 1 段時只寫「餵食順序」；它也是步驟清單的名稱，`ol.answer-steps` 用 `aria-labelledby` 指向 `#answerOrderTitle`），再來是每一段一列（勾選框、水果、顆數，檸檬那一段寫「變回沙漠黃」；第一個還沒勾的段標成「下一段」（整列框起來，名稱下面小字寫「下一段」），還沒勾、後面卻有段已經勾了的段多一行提醒（朗讀區也念一次）；勾選框的名稱是 `aria-label`（不含「下一段」），所以 `aria-describedby` 依序指到「下一段」與提醒，Tab 走到勾選框時才聽得到；打勾照樣自由、存檔仍然只有 `done`），最後一行小字寫另一個做法的顆數；兩個顏色一樣時卡片只寫「已經是…，不用餵。」；答案卡本身不是 live region，換顏色後的朗讀摘要放在另一個 `#answerAnnounce`。記住：`localStorage['ff14tw_chocobo_color']` 存 `{ from, to, done }`（`done` 是已勾的段號），存著的東西壞掉時丟掉壞的那一部分（有一個顏色 id 不認得、換成預設時，打勾也整個丟掉：打勾屬於存下來的那一組顏色）；換任何一個顏色時打勾清空，在面板裡點目前已選的那一格只關掉面板、不清打勾；全部勾完之後，下次打開這一頁時目前顏色直接換成目標顏色、打勾清空並存回去，畫面寫「已經是…，不用餵。」（只在打開頁面時判斷，同一次開著勾完最後一段畫面照舊）；讀寫丟例外（封鎖網站資料）時照常運作，只是不記住。選顏色：「目前顏色」「目標顏色」兩顆按鈕各打開一個色票面板（共用的 `ModalManager` 加 `.dialog`，85 色依色系分 7 組；目標顏色的面板每格多一行「N 顆」，是從目前顏色換成它的最少顆數（已經算進檸檬），目前那一格寫「目前」），面板每次打開都重建，開著時切換語言會先關掉；手機（768px 以下）面板蓋滿畫面、色票在面板裡上下捲，電腦是置中、最寬 700px 的對話框。480px 以下兩顆顏色按鈕上下排成兩列（左標籤、右按鈕），頁首下的說明視覺上隱藏（螢幕閱讀器仍讀得到），為的是 390×844 的手機第一個畫面放得下總顆數與每一段（沒有自動測試守住，改版面要用瀏覽器量）。色票與水果色點的顏色是資料，由 JS 設定 `style.background`，`style.css` 裡沒有色碼

## Development Memories

- 對於 CLAUDE.md 的任何修改都不需要在 changelog 中提及，因為他與玩家無關，只與開發者有關
- 工具對應關係：
  - `character-card` 為角色卡產生器
  - `chocobo-color` 為陸行鳥染色計算器
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
- 資料來自 logstone Worker（hydai/logstone，`https://logstone.z54981220.workers.dev`；另外部署，手動 `wrangler deploy`）。完整的端點與回應格式見 logstone 的 README
- Worker 只接受 ff14.tw 的請求（`Origin`／`Referer` 檢查）；網站的測試一律用假資料，不連正式的 Worker 也不連 Lodestone 官網
- 頁面用到的端點（都是 `GET`，每個請求都帶 `dc`：名稱與成就顯示選 English 是 `na`、日本語是 `jp`，兩邊是同一份角色資料，差別只在回來的文字是英文還是日文）：
  - `/search/character?name=&world=&dc=&page=1`：用名字找人，`world` 是伺服器選單的值（空字串是全部，資料中心帶 `_dc_`）；只用第一頁，回應有 `Results`（`ID`、`Name`、`World`、`DC`、`Avatar`、`FreeCompany`）與 `Pagination`
  - `/character/<id>`：標頭與裝備、部隊、其他分頁用的資料，回應有 `Character`（部隊的 `ID` 與 `Name`、`ActiveClassJob`、`Gear`、大國防聯軍、屬性等）與最外層的 `FetchedAt`
  - `/character/<id>/classjob`（職業）、`/character/<id>/achievements?page=`（成就，有頁數）、`/character/<id>/mounts` 與 `/character/<id>/minions`（收藏，有真正的名稱與圖示）
  - `/freecompany/<id>` 與 `/freecompany/<id>/members?page=`（部隊與成員，成員有頁數）
- 錯誤是 HTTP 狀態碼加 `{ "error": … }`：400 `bad_request`、404 `not_found`（沒有這個角色或部隊）、403 `private`（成就不公開）、502 `upstream`（Lodestone 連不上或解析不出來），Worker 自己的程式錯誤是 500。頁面只看狀態碼：角色標頭 404 寫「找不到這個角色」、502 寫「Lodestone 暫時連不上，請稍後再試」、其他寫「查詢失敗」；分頁只分 502 與其他，並附「再試一次」；成就的 403 寫「這個角色沒有公開成就」；搜尋失敗另給到 Lodestone 官網搜尋的連結
- 成功的回應有 `FetchedAt`（Worker 從官網抓的時間，ISO 格式），標頭顯示成當地時間的「資料時間」
- 頁面也能接舊版的 Worker：沒有搜尋端點時（它的 404 沒有 CORS 標頭，瀏覽器擋下請求，`fetch` 丟例外）把搜尋當成「不能用」，其他的退路（沒有 `ActiveClassJob`、`FetchedAt`、`Gear`，部隊沒有名稱）見 Current Tools 第 7 項。上線順序是 Worker 先部署、網站的 PR 再合併
- 提供直接前往官方 Lodestone 頁面的連結（網域跟著名稱與成就顯示：English 是 `na.`，日本語是 `jp.`）

### Security Considerations
- All user inputs are properly escaped to prevent XSS attacks
- APIs implement origin-based CORS restrictions
- No sensitive data is exposed through API endpoints
- Rate limiting is handled by the upstream API providers
