# 副本資料庫 - 開發者指南

## 資料管理說明

副本資料已分離到獨立的 JSON 檔案中，方便維護和擴充。

### 檔案結構
```
tools/dungeon-database/
├── data-template.json     # 資料格式模板和參考
├── README.md             # 開發者指南
├── index.html            # 主頁面
├── style.css             # 樣式檔案
├── dungeon-list.js       # 列表規則（取出與排序、搜尋與篩選、命中的欄位、標示、獎勵文字；不碰 DOM）
└── script.js             # 頁面（畫面與事件）
```

副本資料在專案根目錄的 `data/dungeons.json`，不在這個目錄裡。頁面不放圖片。

## 新增副本資料

### 步驟 1: 查看模板
參考 `data-template.json` 檔案中的格式說明和範例。

### 步驟 2: 編輯資料檔案
在 `data/dungeons.json` 的 `dungeons` 陣列中新增副本物件：

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
  "description": "副本背景描述。",
  "visible": true
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
| `image` | String/null | ✓ | 目前沒有用到，請設為 `null`（舊資料裡的 `images/{id}.jpg` 路徑也不會被讀取） |
| `tombstoneReward` | String | ✓ | 神典石獎勵 |
| `specialDrops` | Array | ✓ | 特殊掉落物列表 |
| `mechanics` | String | ✓ | 機制說明 |
| `description` | String | ✓ | 副本描述 |
| `visible` | Boolean | 選填 | 沒寫就是顯示；`true` 顯示在頁面上，`false` 藏起來（見下方「藏起來的副本」） |

### 副本類型選項
- `四人迷宮`
- `公會令`
- `8人大型任務`
- `8人討伐殲滅戰`
- `聯盟任務`
- `絕境戰`
- `誅滅戰`
- `幻巧戰`

### 版本代號
- `2.x` - 重生之境
- `3.x` - 蒼天之禁城
- `4.x` - 紅蓮之狂潮
- `5.x` - 暗影之逆焰
- `6.x` - 曉月之終途
- `7.x` - 黃金之遺產

### 藏起來的副本（`visible`）
頁面只顯示 `visible` 不是 `false` 的副本（沒寫 `visible` 的也會顯示）。`visible: false` 的副本還留在資料檔裡，只是不出現在列表、筆數與搜尋結果裡。目前藏起來的有兩種：

- 還只有範本內容的副本：`mechanics` 與 `description` 寫「待補充」，或是「8人團隊戰鬥，注意BOSS機制和時間軸。」「依照指示完成目標。」這類固定的範本句（教學關卡、PvP、小遊戲，以及深層迷宮、多變迷宮、異聞迷宮等還沒有資料的內容）
- 和另一筆是同一場戰鬥的重複副本（只差字的寫法，例如「豔」與「艷」）

補好真正的機制、簡介與掉落物之後，把 `visible` 改回 `true`，它就會出現在列表裡。改的時候要一起更新：

- `metadata.visible_count` 與 `metadata.hidden_count`
- 根目錄 `README.md` 副本資料庫那一段的「N 個可見項目」
- `index.html` 的類型與版本按鈕（`#typeTags` 的 `data-type`、`#expansionTags` 的 `data-expansion`）：改回顯示的副本如果是新的類型或版本（例如深層迷宮），要加一顆按鈕，不然玩家篩不到它；某個類型或版本的副本全部藏起來時，要拿掉它的按鈕（`tests/dungeon-data.test.js` 兩種都會擋）
- `tests/dungeon-data.test.js`、`tests/dungeon-list.test.js`、`tests/dungeon-database-page.test.js` 裡寫死的筆數（目前顯示中 362 筆，藏起來 441 筆）

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

## 開發規劃

- [ ] 完善所有版本副本資料
- [ ] 實作詳細攻略頁面
- [ ] 新增更多過濾選項
