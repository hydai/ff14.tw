# 寶圖搜尋器（tools/treasure-map-finder/）

設計文件在同一個目錄：`SPEC.md`、`room-collaboration-spec.md`、`README-migration.md`。這裡只記讀程式碼看不出來的原因與限制。

- 組隊的 API 是 `api/` 的 Cloudflare Worker（每個隊伍一個 SQLite Durable Object）：建立與加入時一次匯入初始的寶圖並回傳私人的成員 token；之後有權限的改動只送加入／移除的操作（帶 idempotency ID），不送整份清單的快照。前後端一起上線的順序與本機開發見 `api/README.md`。
- 舊的 KV 隊伍在現有的 TTL 到期之前是唯讀的：寶圖留在本機，請玩家建新的隊伍。
- 前端的預設名字、誰的圖、邀請連結都用伺服器現有的資料（成員的 `nickname`、寶圖的 `addedBy`、`creatorId`），沒有改 API。
- 用語：中文叫「隊伍」，翻譯檔的中文值不得出現「房間」、英文值不得出現 Room／Team、日文值不得出現ルーム／チーム（`tests/treasure-party.test.js` 會擋）。
