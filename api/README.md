# 寶圖房間協作 API

這是 FF14.tw 寶圖搜尋器的房間協作功能 API，使用 Cloudflare Workers 和 KV 儲存。

## 本地開發測試

### 1. 安裝依賴
```bash
npm install
```

### 2. 啟動本地開發伺服器
```bash
npm run dev
```

這會在 `http://localhost:8787` 啟動本地 Worker。

### 3. 測試 API

開啟 `test.html` 在瀏覽器中測試各個 API 端點：
```bash
open test.html
```

或在另一個終端機執行：
```bash
python3 -m http.server 8000
# 然後開啟 http://localhost:8000/test.html
```

### 4. 使用 curl 測試

建立房間：
```bash
curl -X POST http://localhost:8787/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"roomCode":"TEST01","memberNickname":"測試玩家"}'
```

查詢房間：
```bash
curl http://localhost:8787/api/rooms/TEST01
```

加入房間：
```bash
curl -X POST http://localhost:8787/api/rooms/TEST01/join \
  -H "Content-Type: application/json" \
  -d '{"memberNickname":"新玩家"}'
```

更新寶圖：
```bash
curl -X PUT http://localhost:8787/api/rooms/TEST01 \
  -H "Content-Type: application/json" \
  -d '{"treasureMaps":[{"id":"g12_1","type":"g12","x":15.2,"y":23.1,"zone":"厄爾庇斯","addedBy":1,"addedAt":"2024-01-01T10:00:00Z"}]}'
```

## 功能特點

- **本地 KV 儲存**：使用 `--persist` 參數讓資料在重啟後保留
- **24 小時過期**：房間會在最後活動 24 小時後自動過期
- **8 人上限**：每個房間最多 8 位成員
- **8 張寶圖上限**：每個房間最多 8 張寶圖

## 部署到生產環境

1. 建立 KV namespace：
```bash
wrangler kv:namespace create TREASURE_ROOMS
```

2. 更新 `wrangler.toml` 中的 KV namespace ID

3. 部署：
```bash
npm run deploy
```

## API 端點

- `POST /api/rooms` - 建立新房間
- `GET /api/rooms/:code` - 取得房間資訊
- `PUT /api/rooms/:code` - 更新房間（寶圖清單）
- `POST /api/rooms/:code/join` - 加入房間
- `POST /api/rooms/:code/leave` - 離開房間

## 注意事項

- 本地開發時，KV 資料儲存在 `.wrangler/state` 目錄
- 使用 `--local` 參數確保在本地執行，不連接 Cloudflare
- CORS 已設定為允許所有來源（`*`），生產環境可能需要調整