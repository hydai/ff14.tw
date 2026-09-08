# 寶圖房間 API

Cloudflare Worker + 每房間 SQLite Durable Object。安全與部署／遷移說明見 [SECURITY.md](SECURITY.md)。

開發工具需要 Node.js 22 以上；建議使用與 CI 相同的 Node.js 24，並以 `npm ci` 安裝 lockfile 中的依賴。

## Cloudflare Workers Builds 設定

在 Worker 的 **Settings > Build** 設定以下欄位；這些設定儲存在 Cloudflare，修改儲存庫不會自動更新。

| 欄位 | 值 |
| --- | --- |
| Root directory | `api` |
| Build command | 留空（無額外建置步驟） |
| Deploy command | `npm run deploy` |
| Non-production branch deploy command | `npm run check:deploy` |

正式分支使用 `wrangler deploy --env production`，會發布 Worker 並套用待執行的 Durable Object migration。其他分支只對 development／production 做 bundle 與設定 dry-run，不發布版本或套用 migration；回歸測試由 GitHub Actions 執行。

若建置在 `npx wrangler versions upload` 回報 **10211**，代表這次版本包含尚未套用的 Durable Object migration。Cloudflare [要求以 `wrangler deploy` 套用這類 migration](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/#durable-object-class-lifecycle-changes)。請更新上述對應分支的命令後重跑建置；正式 migration 會在正式分支部署時套用，保留 `wrangler.toml` 中的 migration 記錄。

Workers Builds 預設對非正式分支執行 `versions upload`；含 Durable Object 的 Worker 也不會產生 Preview URL，詳見 [Cloudflare 建置設定](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#non-production-branch-deploy-command)。單加 `--env production` 只能消除環境選擇警告，無法解決 migration 錯誤。

## API 契約

所有請求需允許的 Origin，JSON body 需 `Content-Type: application/json`。可寫入房間的 mutation 需私密 `Authorization: Bearer <memberToken>`；建立／加入無須 token。

| 路由 | Body | 成功回覆 |
| --- | --- | --- |
| `POST /api/rooms` | `{memberNickname?, clientRequestId, initialMaps?}` | `{...room, memberId, memberToken}` |
| `POST /api/rooms/:code/join` | `{memberNickname?, clientRequestId, initialMaps?}` | `{room, newMember, memberId, memberToken}` |
| `GET /api/rooms/:code` | 無 | `room`，不含私密憑證 |
| `PUT /api/rooms/:code` | `{clientRequestId, operations?, nickname?}` | 更新後 `room` |
| `POST /api/rooms/:code/leave` | `{clientRequestId?}` | `room`，最後一人離開回 `{message, revision}` |
| `POST /api/rooms/:code/remove-member` | `{targetMemberId, clientRequestId?}` | 更新後 `room` |
| `POST /api/cleanup` | 無 | 說明過期由 alarm 處理，無需手動掃描 |

`clientRequestId` 是 `crypto.randomUUID()` 產生的 UUID v4；一次操作只生成一次，網路重試重用。create／join request ID 可恢復該次私密憑證，因此不可公開。

```json
{
  "clientRequestId": "1e7d89a5-f2a1-44e8-9300-5dd49f057cc2",
  "operations": [
    {"type": "add", "map": {"id": "tm_007", "type": "g17", "x": 12.3, "y": 24.5, "zone": "Urqopacha"}},
    {"type": "remove", "id": "tm_008"}
  ]
}
```

`initialMaps` 使用與 add 相同的 map 結構。相同 map ID 的 add 不覆寫既存寶圖。所有寶圖歸屬與新增時間由伺服器設定。

`room` 包含 `roomCode`、`createdAt`、`lastActivityAt`、`creatorId`、`members`、`treasureMaps`、單調遞增的 `revision`。一間房間最多 8 人／8 張寶圖；PUT 每批最多 16 個操作。

錯誤回覆為 `{error, code}`。常見狀態：400 輸入／容量錯誤、401 token 缺少／失效、403 權限不足、404 房間不存在／過期、409 request ID 已完成或舊房需重建、413 body 超過 16 KiB。舊房 `409 ROOM_RECREATE_REQUIRED` 另附完整唯讀 `room`，供前端保留或匯出清單。
