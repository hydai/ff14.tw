# 寶圖搜尋器 - 詳細功能規格書 v1.0

## 1. 產品概述

### 1.1 產品定位
- **工具名稱**：寶圖搜尋器 (Treasure Map Finder)
- **URL路徑**：`/tools/treasure-map-finder/`
- **目標用戶**：所有需要查詢寶圖位置的 FF14 玩家
- **核心價值**：減少玩家在遊戲內外切換對照的時間

### 1.2 功能範圍
- ✅ 包含：寶圖位置查詢、篩選、個人清單管理
- ❌ 不包含：路線規劃、團隊分享、圖片上傳識別

## 2. 詳細功能規格

### 2.1 頁面結構

```
頁面頂部
├── 標題：寶圖搜尋器
├── 描述：快速查詢寶圖位置並建立個人清單
└── 操作區
    ├── 搜尋/篩選區（左側 70%）
    └── 我的清單按鈕（右側 30%）
```

### 2.2 篩選系統規格

#### 2.2.1 寶圖等級篩選
```javascript
const mapLevels = [
  { id: 'g8', name: 'G8 皮革寶圖', minLevel: 40 },
  { id: 'g10', name: 'G10 山羊革寶圖', minLevel: 50 },
  { id: 'g12', name: 'G12 瞪羚革寶圖', minLevel: 60 },
  { id: 'g14', name: 'G14 蓋澤爾革寶圖', minLevel: 70 },
  { id: 'g16', name: 'G16 薩維奈革寶圖', minLevel: 80 },
  { id: 'g18', name: 'G18 麒麟革寶圖', minLevel: 90 }
];
```

**互動行為**：
- 預設：全部未選中（顯示所有）
- 點擊：toggle 選中狀態
- 選中樣式：藍色背景 + 白色文字
- 多選邏輯：OR 條件（選 G12 + G14 = 顯示 G12 或 G14）

#### 2.2.2 地區篩選
```javascript
const zones = [
  {
    id: 'la_noscea',
    name: '拉諾西亞',
    subZones: [
      'Middle La Noscea',
      'Lower La Noscea', 
      'Eastern La Noscea',
      'Western La Noscea',
      'Upper La Noscea',
      'Outer La Noscea'
    ]
  },
  // ... 其他地區
];
```

**互動行為**：
- 顯示方式：主要地區名稱按鈕
- 篩選邏輯：選擇「拉諾西亞」= 顯示所有子區域的寶圖

### 2.3 寶圖卡片詳細規格

#### 2.3.1 卡片結構
```html
<div class="treasure-card" data-map-id="tm_001">
  <div class="card-image-wrapper">
    <img src="縮圖路徑" alt="寶圖預覽" loading="lazy">
    <span class="map-level-badge">G12</span>
  </div>
  <div class="card-content">
    <h4 class="map-zone">Eastern Thanalan</h4>
    <p class="map-coords">X: 24.5 Y: 26.3</p>
    <button class="btn-add-to-list" data-state="default">
      <span class="btn-text">加入清單</span>
    </button>
  </div>
</div>
```

#### 2.3.2 卡片狀態
- **預設**：顯示「加入清單」按鈕
- **已加入**：按鈕變為「✓ 已加入」（綠色）
- **Hover**：卡片陰影加深，圖片輕微放大（scale: 1.05）

### 2.4 圖片彈出視窗規格

#### 2.4.1 觸發方式
- 點擊卡片圖片區域（不含按鈕）

#### 2.4.2 視窗內容
```html
<div class="modal-overlay">
  <div class="modal-content">
    <button class="modal-close">×</button>
    <img src="完整圖片路徑" alt="寶圖詳細">
    <div class="modal-info">
      <h3>G12 瞪羚革寶圖 - Eastern Thanalan</h3>
      <p class="coords-display">座標：X: 24.5 Y: 26.3</p>
      <div class="modal-actions">
        <button class="btn-copy-coords">
          複製座標指令 /pos 24.5 26.3
        </button>
        <button class="btn-add-modal">加入清單</button>
      </div>
    </div>
  </div>
</div>
```

#### 2.4.3 互動細節
- ESC 鍵關閉
- 點擊遮罩關閉
- 複製成功顯示 toast 提示

### 2.5 我的清單功能規格

#### 2.5.1 清單按鈕
```html
<button class="my-list-toggle">
  我的清單 <span class="list-count">(3)</span>
</button>
```

#### 2.5.2 清單面板
```html
<div class="my-list-panel">
  <div class="panel-header">
    <h3>我的寶圖清單</h3>
    <button class="btn-clear-all">清空全部</button>
  </div>
  <div class="list-content">
    <div class="list-item">
      <img src="縮圖" alt="G12">
      <div class="item-info">
        <span class="item-level">G12</span>
        <span class="item-zone">Eastern Thanalan</span>
        <span class="item-coords">(24.5, 26.3)</span>
      </div>
      <button class="btn-remove" data-map-id="tm_001">×</button>
    </div>
  </div>
  <div class="panel-footer">
    <p>總計：3 張寶圖</p>
  </div>
</div>
```

#### 2.5.3 清單操作
- **新增**：自動滾動到底部，淡入動畫
- **移除**：確認對話框「確定要移除這張寶圖嗎？」
- **清空**：二次確認「確定要清空所有寶圖嗎？」
- **上限**：無上限（但顯示警告 >20 張）

## 3. 資料儲存規格

### 3.1 LocalStorage 結構
```javascript
// Key: 'ff14tw_treasure_map_list'
{
  "version": "1.0",
  "lastUpdated": "2025-01-03T10:00:00Z",
  "maps": [
    {
      "id": "tm_001",
      "level": "G12",
      "zone": "Eastern Thanalan",
      "coords": { "x": 24.5, "y": 26.3 },
      "addedAt": "2025-01-03T10:00:00Z"
    }
  ]
}
```

### 3.2 資料同步
- 每次操作後立即保存
- 頁面載入時恢復狀態
- 版本不匹配時清空舊資料

## 4. 效能規格

### 4.1 圖片載入
- 縮圖：最大 200x200px，WebP 格式優先
- 使用 `loading="lazy"` 延遲載入
- 預設顯示 placeholder

### 4.2 搜尋效能
- Debounce：無（使用即時篩選）
- 最大顯示數量：初始 24 個
- 載入更多：滾動到底部自動載入

## 5. 響應式設計規格

```css
/* 桌面版 (>1024px) */
.treasure-grid { 
  grid-template-columns: repeat(4, 1fr); 
}

/* 平板 (768-1024px) */
.treasure-grid { 
  grid-template-columns: repeat(3, 1fr); 
}

/* 手機 (<768px) */
.treasure-grid { 
  grid-template-columns: repeat(2, 1fr); 
}
.my-list-panel {
  position: fixed;
  bottom: 0;
  height: 50vh;
}
```

## 6. 錯誤處理

### 6.1 資料載入失敗
```javascript
// 顯示錯誤訊息
showError('載入寶圖資料失敗，請重新整理頁面再試。');

// 提供手動重試按鈕
<button onclick="retryLoadData()">重新載入</button>
```

### 6.2 圖片載入失敗
- 顯示預設圖片：`/assets/images/treasure-map-placeholder.png`
- Alt 文字：「圖片載入失敗」

## 7. 無障礙規格

- **鍵盤導航**：Tab 順序正確，Enter 觸發按鈕
- **ARIA 標籤**：
  ```html
  <button aria-label="加入 G12 Eastern Thanalan 寶圖到清單">
  <div role="dialog" aria-labelledby="modal-title">
  ```
- **焦點管理**：Modal 開啟時 trap focus

## 8. 開發注意事項

### 8.1 命名規範
- CSS 類別：`.treasure-` 前綴
- JS 變數：camelCase
- 資料 ID：snake_case

### 8.2 程式碼結構
```
/tools/treasure-map-finder/
├── index.html
├── style.css
├── script.js
├── SPEC.md (本文件)
└── /images/
    └── /treasures/
        ├── g12_e_thanalan_01_thumb.jpg
        └── g12_e_thanalan_01.jpg
```

### 8.3 Git Commit 規範
- 新功能：`新增功能：寶圖搜尋器基礎架構`
- 修正：`修正：寶圖清單計數錯誤問題`

## 9. 開發階段規劃

### Phase 1：基礎搜尋與清單管理（已完成）
**實作成果：**
- ✅ G1-G17 寶圖等級篩選
- ✅ 11個主要地區篩選
- ✅ 卡片式寶圖展示（縮圖、等級、座標）
- ✅ 個人清單管理（新增、移除、清空）
- ✅ 座標複製功能（/pos X Y Z 指令）
- ✅ 響應式設計
- ✅ LocalStorage 資料持久化
- ✅ 載入更多功能（初始24個）

### Phase 2：路線規劃功能（規劃中）
**核心功能：**
1. **路線生成器**
   - 從「我的清單」生成最佳尋寶路線
   - 支援多種優化策略（最短距離、最少傳送、區域集中）
   - 顯示預估時間和傳送費用

2. **地圖整合**
   - 各地區傳送點資料
   - 計算傳送點到寶圖的步行距離
   - 考慮飛行解鎖狀態

3. **路線展示**
   - 分步驟導航介面
   - 可拖曳調整順序
   - 一鍵複製路線指令

**技術需求：**
- 傳送點座標資料庫
- 路徑演算法（TSP變體）
- 地圖距離計算

### Phase 3：進階功能（未來規劃）
1. **團隊協作**
   - 分享清單連結
   - 多人同步編輯
   - 分配寶圖給隊員

2. **資料擴充**
   - 寶圖掉落物資訊
   - 入場門檻提醒
   - 寶物庫出現機率

3. **使用分析**
   - 歷史記錄追蹤
   - 熱門寶圖統計
   - 個人尋寶數據

### Phase 4：社群功能（遠期規劃）
1. **寶圖回報系統**
   - 使用者上傳新位置
   - 社群驗證機制
   - 自動更新資料庫

2. **整合功能**
   - 匯入/匯出功能
   - 與其他工具串接
   - API 開放

## 10. Phase 2 詳細設計規格

### 10.1 路線規劃功能詳細設計

#### 10.1.1 使用者介面設計
```
[我的清單] → [生成路線] → [路線檢視] → [開始導航]
```

**新增UI元素：**
1. **生成路線按鈕**
   - 位置：我的清單面板底部
   - 條件：清單內有2個以上寶圖時啟用
   - 樣式：主要按鈕，藍色背景

2. **路線設定面板**
   ```html
   <div class="route-settings">
     <h4>路線優化選項</h4>
     <label>
       <input type="radio" name="optimize" value="distance" checked>
       最短總距離
     </label>
     <label>
       <input type="radio" name="optimize" value="teleports">
       最少傳送次數
     </label>
     <label>
       <input type="radio" name="optimize" value="zones">
       區域集中（推薦）
     </label>
   </div>
   ```

3. **路線結果顯示**
   ```html
   <div class="route-result">
     <div class="route-summary">
       <h3>最佳路線</h3>
       <p>總計：5個寶圖 | 預估時間：25分鐘 | 傳送費：1,847 Gil</p>
     </div>
     <div class="route-steps">
       <!-- 路線步驟 -->
     </div>
   </div>
   ```

#### 10.1.2 資料結構設計

**傳送點資料：**
```javascript
{
  "aetherytes": [
    {
      "id": "limsa_lominsa",
      "name": "海都",
      "nameEn": "Limsa Lominsa",
      "zone": "la_noscea",
      "coords": { "x": 11.0, "y": 11.0 },
      "type": "major_city",
      "unlockLevel": 1
    },
    {
      "id": "costa_del_sol",
      "name": "太陽海岸",
      "nameEn": "Costa del Sol",
      "zone": "eastern_la_noscea",
      "coords": { "x": 33.8, "y": 30.5 },
      "type": "aetheryte",
      "unlockLevel": 30
    }
  ]
}
```

**路線資料結構：**
```javascript
{
  "route": {
    "totalMaps": 5,
    "estimatedTime": 1500, // 秒
    "totalCost": 1847,
    "steps": [
      {
        "type": "teleport",
        "to": "costa_del_sol",
        "cost": 456,
        "time": 10
      },
      {
        "type": "travel",
        "to": "tm_001",
        "distance": 234.5,
        "time": 120,
        "method": "mount"
      },
      {
        "type": "treasure",
        "mapId": "tm_001",
        "coords": { "x": 24.5, "y": 26.3, "z": 0.1 }
      }
    ]
  }
}
```

#### 10.1.3 演算法設計

**基礎路徑計算：**
```javascript
class RouteCalculator {
  calculateRoute(maps, strategy = 'zones') {
    switch(strategy) {
      case 'distance':
        return this.shortestPath(maps);
      case 'teleports':
        return this.fewestTeleports(maps);
      case 'zones':
        return this.zoneGrouping(maps);
    }
  }
  
  // 區域分組策略（推薦）
  zoneGrouping(maps) {
    // 1. 按區域分組
    const groups = this.groupByZone(maps);
    
    // 2. 決定區域訪問順序
    const zoneOrder = this.optimizeZoneOrder(groups);
    
    // 3. 每個區域內部優化
    return this.optimizeWithinZones(zoneOrder);
  }
  
  // 計算兩點間距離
  calculateDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  // 估算移動時間（考慮坐騎速度）
  estimateTravelTime(distance, hasFlying = true) {
    const speed = hasFlying ? 6.0 : 4.2; // 單位/秒
    return Math.ceil(distance / speed);
  }
}
```

#### 10.1.4 傳送費計算
```javascript
// 基於 FF14 實際傳送費公式
function calculateTeleportCost(fromZone, toZone, level) {
  const baseCost = 100;
  const levelMultiplier = Math.floor(level / 10) * 50;
  const distanceMultiplier = this.getZoneDistance(fromZone, toZone) * 20;
  
  return Math.min(baseCost + levelMultiplier + distanceMultiplier, 999);
}
```

### 10.2 實作順序
1. 建立傳送點資料庫
2. 實作基礎距離計算
3. 開發區域分組演算法
4. 建立路線顯示介面
5. 加入拖曳調整功能
6. 實作路線匯出功能

## 11. 測試檢查清單

- [ ] 篩選功能正常運作
- [ ] 清單新增/移除/清空功能
- [ ] LocalStorage 資料持久化
- [ ] 響應式設計各裝置正常
- [ ] 圖片載入與錯誤處理
- [ ] 鍵盤導航與無障礙
- [ ] 複製座標功能
- [ ] Modal 開關與焦點管理