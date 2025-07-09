# 寶圖數據轉換腳本

## 功能說明

此腳本 (`migrate-data.js`) 用於將現有的 `treasure-maps.json` 轉換為簡化版本，主要變更包括：

1. **zoneId 正規化**: 將群組性質的 zoneId（如 "tural"）轉換為具體的地區 ID（如 "urqopacha"）
2. **添加索引**: 為每個地區的寶圖建立 index（從 1 開始編號）
3. **移除冗餘欄位**: 刪除 `levelName`、`zone`、`thumbnail`、`fullImage` 欄位
4. **保留核心數據**: 保留 `id`、`level`、`coords` 和新的 `zoneId`、`index`

## 使用方法

```bash
cd /Users/hydai/workspace/ff14.tw/tools/treasure-map-finder
node migrate-data.js
```

## 轉換範例

**原始格式:**
```json
{
  "id": "tm_007",
  "level": "g17",
  "levelName": "獰豹革地圖",
  "zone": "Urqopacha",
  "zoneId": "tural",
  "coords": {
    "x": 13.7,
    "y": 14.2,
    "z": 1.7
  },
  "thumbnail": "images/treasures/g17_urqopacha_01.webp",
  "fullImage": "images/treasures/g17_urqopacha_01_full_3x.webp"
}
```

**轉換後格式:**
```json
{
  "id": "tm_007",
  "level": "g17",
  "zoneId": "urqopacha",
  "index": 1,
  "coords": {
    "x": 13.7,
    "y": 14.2,
    "z": 1.7
  }
}
```

## 地區映射關係

腳本包含完整的地區名稱到 zoneId 的映射：

- **Tural 地區**: Urqopacha → urqopacha, Kozama'uka → kozamauka 等
- **Ilsabard 地區**: Elpis → elpis, Labyrinthos → labyrinthos 等
- **其他地區**: 包含 Gyr Abania、Othard、Norvrandt 等所有地區

## 輸出結果

- **輸入文件**: `/Users/hydai/workspace/ff14.tw/data/treasure-maps.json`
- **輸出文件**: `/Users/hydai/workspace/ff14.tw/data/treasure-maps-new.json`
- **數據統計**: 轉換 219 個寶圖，涵蓋 27 個地區
- **完整性檢查**: 自動驗證所有地區都已正確轉換

## 注意事項

1. 腳本會自動檢查數據完整性，確保沒有遺漏的地區
2. 每個地區的寶圖都會獲得正確的索引編號（從 1 開始）
3. 轉換後的文件會保留原始的 `mapLevels` 和 `zones` 結構
4. 腳本包含詳細的統計資訊和錯誤檢查

## 數據結構變更

### 移除的欄位
- `levelName`: 可透過 `mapLevels` 查找
- `zone`: 已整合到 `zoneId`
- `thumbnail`: 減少數據大小
- `fullImage`: 減少數據大小

### 新增的欄位
- `index`: 每個地區內的寶圖編號（從 1 開始）

### 修改的欄位
- `zoneId`: 從群組 ID 改為具體地區 ID