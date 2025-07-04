# 副本資料庫 - 開發者指南

## 資料管理說明

副本資料已分離到獨立的 JSON 檔案中，方便維護和擴充。

### 檔案結構
```
tools/dungeon-database/
├── dungeons.json          # 主要副本資料
├── data-template.json     # 資料格式模板和參考
├── README.md             # 開發者指南
├── index.html            # 主頁面
├── style.css             # 樣式檔案
├── script.js             # 功能邏輯
└── images/               # 副本圖片目錄
    ├── README.md         # 圖片使用說明
    ├── 1.jpg            # 副本封面圖片 (按ID命名)
    ├── 2.jpg
    └── ...
```

## 新增副本資料

### 步驟 1: 查看模板
參考 `data-template.json` 檔案中的格式說明和範例。

### 步驟 2: 編輯資料檔案
在 `dungeons.json` 的 `dungeons` 陣列中新增副本物件：

```json
{
  "id": 11,
  "name": "新副本名稱",
  "level": 90,
  "type": "四人迷宮",
  "expansion": "6.x",
  "image": null,
  "tombstoneReward": "因果神典石: 90",
  "specialDrops": ["特殊裝備1", "特殊裝備2"],
  "mechanics": "主要機制說明。",
  "description": "副本背景描述。"
}
```

### 資料欄位說明

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `id` | Number | ✓ | 唯一識別碼 |
| `name` | String | ✓ | 副本名稱 |
| `level` | Number | ✓ | 副本等級 |
| `type` | String | ✓ | 副本類型（見下方選項） |
| `expansion` | String | ✓ | 版本代號 |
| `image` | String/null | ✓ | 圖片路徑（目前設為 null） |
| `tombstoneReward` | String | ✓ | 神典石獎勵 |
| `specialDrops` | Array | ✓ | 特殊掉落物列表 |
| `mechanics` | String | ✓ | 機制說明 |
| `description` | String | ✓ | 副本描述 |

### 副本類型選項
- `四人迷宮`
- `公會令`
- `8人討伐殲滅戰`
- `24人大型任務`
- `絕境戰`
- `誅滅戰`

### 版本代號
- `2.x` - 重生之境
- `3.x` - 蒼穹之禁城
- `4.x` - 紅蓮之狂潮
- `5.x` - 暗影使者
- `6.x` - 曉月之終途
- `7.x` - 黃金之遺產

## 注意事項

1. **CORS 限制**: 直接開啟 HTML 檔案會遇到 CORS 錯誤，請使用本地伺服器：
   ```bash
   # 在專案根目錄執行
   python -m http.server 8000
   # 或
   npx serve .
   ```
   然後訪問 `http://localhost:8000/tools/dungeon-database/`

2. **ID 唯一性**: 確保每個副本的 `id` 都是唯一的
3. **JSON 格式**: 注意 JSON 語法，最後一個物件後不要加逗號
4. **中文編碼**: 確保檔案以 UTF-8 編碼儲存
5. **測試**: 新增資料後請在瀏覽器中測試功能是否正常

## 圖片管理

### 圖片命名規則
每個副本的圖片按照ID命名：
- 格式：`images/{id}.jpg`
- 範例：`images/1.jpg`, `images/362.jpg`

### 圖片規格
- **格式**：JPG (建議)
- **尺寸**：400x200像素或以上
- **比例**：2:1 (寬:高)
- **檔案大小**：建議小於200KB

### 圖片載入機制
- 自動從 `images/{id}.jpg` 載入對應圖片
- 載入失敗時顯示預設漸層背景
- 支援圖片載入中的過渡效果

### 添加新圖片
1. 將圖片命名為 `{副本ID}.jpg`
2. 放入 `images/` 目錄
3. 重新整理頁面即可看到圖片

## 開發規劃

- [ ] 完善所有版本副本資料
- [ ] 新增副本圖片
- [ ] 實作詳細攻略頁面
- [ ] 新增更多過濾選項
- [ ] 支援多語言介面