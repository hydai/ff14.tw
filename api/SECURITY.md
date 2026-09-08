# 房間 API：認證與資料一致性

每間新房間由一個 SQLite-backed Durable Object 管理。公開房號讓隊友讀取／加入房間；私密 `memberToken` 驗證成員身分。公開的 `memberId`、`creatorId` 和 `Origin` 均不是憑證。

## 身分與權限

- 建立、加入時產生 256-bit 隨機 `memberToken`。只在該次回覆或同一私密 `clientRequestId` 的重試回覆提供，GET 和一般更新不回傳 token。
- 所有 PUT、leave、remove-member 需要 `Authorization: Bearer <memberToken>`。伺服器從 token hash 找出成員，不能用 body 的 ID 冒充他人。
- 成員只能修改自己的暱稱或自行離開。只有房間建立者可以移除其他成員，建立者不能被踢除。成員離開或被移除後立即撤銷 token。
- 允許房內成員共同新增／移除寶圖；`addedBy`、`addedAt` 由伺服器產生，客戶端不能偽造。
- token 與 create/join 的 `clientRequestId` 都是私密資料：不得放入分享 URL、公開 room、錯誤日誌。用於安全重試的 token 回覆僅存在該房間的私有 SQLite receipt；驗證索引只保存 token hash。

## 同步與重試

PUT 只接受操作陣列，不再接受整份 `treasureMaps` 覆寫。DO 同步讀取與驗證資料，再於同一 SQL transaction 寫入 room 和去重 receipt；中間沒有非同步等待，避免並行更新遺失資料。

create／join／PUT 要求 UUID v4 `clientRequestId`，同一次操作的網路重試必須沿用原值。PUT 去重 key 綁定房間與已驗證成員；同 key 重送只回目前 room，不重新套用舊操作。leave／remove-member 可附同欄位。GET 的 `revision` 供前端拒絕過期快照。

create／join 可以附 `initialMaps` 保留原清單。伺服器將成員與初始寶圖在同一 transaction 寫入，超過 8 人／8 張寶圖即整筆拒絕；重複 map ID 保留原寶圖與原歸屬。所有 mutation body 限制 16 KiB，暱稱、操作類型、ID、座標與數量均先驗證。

## 過期與舊房遷移

- 新房間的有效活動延長 24 小時 TTL；讀取與重複重試不延長活動時間。DO alarm 清除房間及去重資料；每次存取亦檢查期限，不能依靠 alarm 執行時間決定是否過期。
- 最後一人離開後房間立即回 404，不能透過舊 join 重新開啟。
- 舊 KV 房間缺少可驗證的私密憑證，因此不以公開 member ID 自動換發 token。GET 保留舊資料，附 `legacy: true`、`readOnly: true`、`revision: 0`。
- 舊房間的 join／PUT／leave／remove-member 回 `409 ROOM_RECREATE_REQUIRED`，回覆的 `room` 包含可保存的寶圖。使用者可保留／匯出清單後建立新房。
- 遷移期間保留 `TREASURE_ROOMS` KV binding，程式只讀取，絕不覆寫、刪除或延長舊 TTL。舊資料自然過期後可另行移除此 fallback；本次變更不操作線上 KV 資料。

## CORS 與環境

正式環境允許 `https://ff14.tw`、`https://www.ff14.tw`；development 額外允許 localhost／127.0.0.1 的 8000、8080 port。preflight 允許 Authorization header。CORS 限制瀏覽器的跨站存取，不能取代上述 token 驗證。所有回覆使用 `Cache-Control: no-store` 與 `Vary: Origin`。

`wrangler.toml` 的 default、production、development 均明確宣告 DO 與舊 KV binding，因為環境不繼承 binding。production 名稱維持 `ff14-tw-treasure`，與現有前端 `ff14-tw-treasure.z54981220.workers.dev` 一致。

```sh
# 本地開發，明確使用 development，資料由本機 Miniflare 保存
npm ci
npm run dev

# 本機回歸測試（Node.js 24）
npm test

# 檢查 development 與 production 的 bundle/config，不發布
npm run check:deploy

# 真正發布需另行執行；會套用首次 SQLite Durable Object migration
npm run deploy
```

部署時前後端須一起更新，舊前端無法對新 API 寫入；後端會明確拒絕而不覆寫資料。`v1-treasure-room-sqlite` migration 建立新的 DO class，不將既有 KV 無憑證資料轉成可寫房間。

尚未套用的 Durable Object migration 無法用 `wrangler versions upload` 上傳，會回報 Cloudflare API 錯誤 10211；必須由正式的 `npm run deploy` 套用。dry-run 只驗證本機 bundle/config，不會驗證或變更遠端 migration 狀態。Cloudflare Workers Builds 的正式／非正式分支命令設定見 [README.md](README.md#cloudflare-workers-builds-設定)。

Wrangler 更新至 `4.129.1`；測試直接使用的 Miniflare 更新至最新穩定 4.x（`4.20260730.0`）。Miniflare 的 `latest` 標籤目前指向 `5.20260907.0-alpha`，也是此版 Wrangler 官方指定的相依版本；lockfile 因此同時保留兩個版本，各自使用對應的 workerd。直接使用的 Miniflare 4 仍依賴 Undici 7.28.0，`package.json` 的 scoped override 將其升至同主版號的 `^7.29.0`，修補已知安全問題。待所有 Miniflare 相依版本均包含修正版時，可移除此 override；更新後執行 `npm audit`、`npm test` 與上述 dry-run。
