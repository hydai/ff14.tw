# API 安全設定指南

## CORS 限制設定

目前 API 已實施以下安全措施：

### 1. Origin 白名單

```javascript
// 生產環境只允許 ff14.tw
const allowedOrigins = [
  'https://ff14.tw',
  'https://www.ff14.tw'
];

// 開發環境可額外允許 localhost
if (env.ENVIRONMENT === 'development') {
  allowedOrigins.push(
    'http://localhost:8000',
    'http://localhost:8080',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8080'
  );
}
```

### 2. 嚴格的 Origin 檢查

- 所有請求都必須有 `Origin` header
- 只有在白名單中的來源才會收到 CORS headers
- 非授權來源會收到 403 Forbidden 且沒有 CORS headers
- **沒有 Origin header 的請求（curl、Postman 等）也會被拒絕**

### 3. 部署指令

```bash
# 部署到生產環境（只允許 ff14.tw）
wrangler deploy --env production

# 本地測試
wrangler dev
```

### 4. 測試 CORS 保護

```bash
# 沒有 Origin header - 應該被拒絕（403）
curl -X GET https://ff14-tw-treasure.z54981220.workers.dev/api/rooms/ABCDEF -v

# Postman 等工具 - 應該被拒絕（403）
curl -X POST https://ff14-tw-treasure.z54981220.workers.dev/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"memberNickname": "Test"}' -v

# 惡意網站 - 應該被拒絕（403）
curl -X GET https://ff14-tw-treasure.z54981220.workers.dev/api/rooms/ABCDEF \
  -H "Origin: https://malicious-site.com" -v

# 只有 ff14.tw - 應該成功
curl -X GET https://ff14-tw-treasure.z54981220.workers.dev/api/rooms/ABCDEF \
  -H "Origin: https://ff14.tw" -v
```

## 其他安全措施

1. **房主權限控制**：只有房主可以移除成員
2. **輸入驗證**：暱稱長度、房間人數限制
3. **自動過期**：24 小時後自動刪除
4. **UUID 生成**：使用 crypto.randomUUID() 確保唯一性

## 注意事項

- 確保部署時使用 `--env production` 參數
- 定期檢查 wrangler.toml 中的環境變數設定
- 監控 API 使用情況，注意異常請求