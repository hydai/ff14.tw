# 寶圖搜尋器 - 詳細功能規格書 v1.0

## 1. 產品概述

### 1.1 產品定位
- **工具名稱**：寶圖搜尋器 (Treasure Map Finder)
- **URL路徑**：`/tools/treasure-map-finder/`
- **目標用戶**：所有需要查詢寶圖位置的 FF14 玩家
- **核心價值**：減少玩家在遊戲內外切換對照的時間

### 1.2 功能範圍
- ✅ 包含：寶圖位置查詢、篩選、個人清單管理（複製分享連結、匯入）、路線規劃（一站一張寶圖，可標記完成）、自訂複製格式
- ✅ 隊伍協作（多人同步清單）：規格另見 `room-collaboration-spec.md`
- ❌ 不包含：圖片上傳識別

## 2. 詳細功能規格

### 2.1 頁面結構

```
頁面頂部
├── 標題：寶圖搜尋器
├── 描述：快速查詢寶圖位置並建立個人清單
└── 操作區
    ├── 搜尋/篩選區（左側 70%）
    └── 清單入口（右側 30%；手機固定在畫面底部）
```

### 2.2 篩選系統規格

#### 2.2.1 寶圖等級篩選
```javascript
const mapLevels = [
  { id: 'g8', name: 'G8 巨龍革地圖', count: 35 },
  { id: 'g10', name: 'G10 瞪羚革地圖', count: 48 },
  { id: 'g12', name: 'G12 纏尾蛟革地圖', count: 0 },  // 已整合至傳送點，未加入寶圖資料
  { id: 'g14', name: 'G14 金毗羅鱷革地圖', count: 40 },
  { id: 'g15', name: 'G15 蛇牛革地圖', count: 8 },
  { id: 'g16', name: 'G16 銀狼革地圖', count: 0 },  // 尚未加入資料
  { id: 'g17', name: 'G17 獰豹革地圖', count: 40 }
];
// 總計：171 筆真實寶圖座標
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
          複製隊伍頻道句子 /p G12 Eastern Thanalan (24.5, 26.3) 最近：{最近傳送點}
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

#### 2.5.1 清單入口
```html
<div class="tm-list-entry" id="listEntryDesktop">
  <button class="btn btn-ghost" data-entry="list">📋 清單 3 張</button>
  <button class="btn btn-primary" data-entry="route">🗺️ 生成路線</button>
</div>
```
- 左邊的按鈕打開清單面板（清單頁）；右邊的動作依張數切換：不在隊伍裡時 0 張「組隊」、1 張以上「生成路線」；在隊伍裡標籤是「隊伍清單 N/8」，0 張時右邊不放動作
- 「生成路線」打開清單面板並直接切到路線頁；清單只有 1 張也能生成
- 桌機的入口在最上面那一列（捲動時固定在畫面頂端），手機的入口是固定在畫面底部的一條列，內容相同

#### 2.5.2 清單面板
清單面板 `#myListPanel` 是一個對話框，分成兩頁：清單頁 `#listView` 與路線頁 `#routeView`（見 10.1.1），用顯示／隱藏切換；Escape 一次關掉整個面板。

```html
<div class="my-list-panel" id="myListPanel" role="dialog" aria-modal="true" aria-labelledby="myListPanel-title">
  <div class="tm-panel-view" id="listView">
    <div class="panel-header">
      <h3 id="myListPanel-title">我的清單</h3><span class="tm-panel-count">6 張</span>  <!-- 在隊伍裡寫「隊伍清單」與「3/8」 -->
      <button class="btn btn-close" id="closePanelBtn" aria-label="關閉">×</button>
    </div>
    <div class="panel-body">
      <!-- 組隊區塊（建立／加入隊伍、隊伍狀態、清單／歷史分頁），規格見 room-collaboration-spec.md -->
      <div class="list-content" id="listContent">
        <ul class="tm-list-items">
          <li class="list-item" data-map-id="tm_010">
            <img src="縮圖" alt="">
            <div class="item-info">
              <p class="item-title"><span class="item-level tag tag-solid tag-primary">G17</span> <span class="item-zone">烏爾科帕恰</span> <span class="item-index">#4</span></p>
              <p class="item-sub">(21.6, 23.9) · 最近：瓦群佩洛</p>
            </div>
            <button class="btn-remove btn btn-close" data-map-id="tm_010" aria-label="移除 G17 烏爾科帕恰 #4">×</button>
          </li>
        </ul>
      </div>
      <div class="tm-list-actions" id="listActions">
        <button class="btn btn-sm" id="shareListBtn">🔗 複製分享連結</button>
        <button class="btn btn-sm" id="importListBtn">📥 匯入</button>
        <button class="btn btn-ghost btn-sm" id="clearAllBtn">清空清單</button>
      </div>
    </div>
    <div class="panel-footer">
      <p class="tm-footer-count">6 張寶圖</p>
      <button class="btn btn-primary" id="generateRouteBtn">🗺️ 生成路線</button>
    </div>
  </div>
  <div class="tm-panel-view hidden" id="routeView"><!-- 路線頁，見 10.1.1 --></div>
</div>
```
- 每一列的地名跟著介面語言；座標一位小數、不含 Z，「最近」的傳送點和卡片是同一個函式
- 清單是空的時只有「匯入」（「複製分享連結」與「清空清單」藏起來），「生成路線」停用
- 手機（≤768px）面板從底部滑上來，高度是畫面的 85%

#### 2.5.3 清單操作
- **新增**：卡片與詳細檢視的「加入清單」；加入後不跳提示，清單入口的張數與卡片上的「✓ 已加入」直接更新，張數由螢幕閱讀器唸出
- **移除**：每一列的 ✕ 直接移除，不確認、不跳提示；焦點移到下一列的 ✕（最後一列移到上一列，清單空了移到面板標題）。卡片上的「✓ 已加入」同樣直接移除
- **清空**：「清空清單」開啟頁內對話框「清空清單？」（「取消」、「清空 N 張」），初始焦點在「取消」；清空後路線進度一併清掉。清單是空的、或隊伍連線中時不開
- **上限**：個人清單無上限；隊伍清單最多 8 張

#### 2.5.4 分享連結與匯入
- **複製分享連結**：清單頁動作列的「🔗 複製分享連結」複製目前頁面網址（去掉查詢字串與 hash）加上 `?maps=` 與清單裡的寶圖 id（依清單順序、逗號分隔、逗號不編碼），例如 `https://ff14.tw/tools/treasure-map-finder/?maps=tm_019,tm_031,tm_010`；只帶寶圖，不帶篩選與隊伍代號
- **打開分享連結**：網址有 `maps` 時，等寶圖資料載入、隊伍還原或自動加入結束後，跳出頁內對話框「加入分享的寶圖」，列出找得到的每一張（縮圖、等級、地名、座標；已經在清單裡的標「已在清單」，目錄裡找不到的 id 略過並說明張數）；一張都找不到就提示並直接拿掉 `maps`
  - 清單不是空的時有兩個選項：「加進我的清單」（預設，重複的只留一張）與「取代我的清單」；清單是空的時不顯示選項
  - 按鈕是「不用了」與「加入清單」。在隊伍裡選項寫「加進隊伍清單」「取代隊伍清單」，結果會超過隊伍上限 8 張時直接說明並停用「加入清單」
  - 不管選了什麼、按「不用了」、✕ 或 Escape，都用 `history.replaceState` 拿掉網址裡的 `maps`（`grade`、`zone`、`room` 與 hash 保留），重新整理不會再問一次
- **匯入**：「📥 匯入」開啟頁內對話框「匯入清單」，貼上分享連結（完整網址，或只有 `?maps=…`），或以前「匯出」複製的 JSON（`{ maps: [{ id, … }] }`）。一邊貼一邊解析：看得懂寫「連結／內容裡有 N 張寶圖」，看不懂標成錯誤並停用「匯入」。清單不是空的時預設「合併」（重複的只留一張），也可以選「取代我的清單」；失敗（例如超過隊伍上限）時錯誤寫在對話框裡，對話框不關
- **取代**時路線進度整份清掉；合併、加進時保留
- **匯出已拿掉**：以前的「匯出」按鈕（顯示 JSON 的對話框）與檔案匯入都拿掉了，改用分享連結；以前匯出的內容仍然可以貼進「匯入」

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

// Key: 'ff14tw_treasure_route_progress'（路線的站序與完成記號；只記在這台裝置，不同步給隊友，超過 12 小時就丟掉）
{
  "order": ["tm_010", "tm_007", "tm_013"],
  "done": ["tm_010"],
  "updatedAt": "2026-10-16T08:00:00.000Z"
}

// Key: 'treasureMapFormatSettings'（複製格式；沒存過就跟著介面語言用預設範本）
{
  "version": 2,
  "template": "/p <序號>/<總數> <寶圖等級> <地區> <座標> 最近：<傳送點>"
}
```
- 複製格式以前存成 `{ teleport, map }`（傳送點與寶圖各一個格式）：讀到時轉成新的形狀並寫回；`map` 和舊的某個語言的預設範本完全相同就轉成那個語言的新預設範本，否則把 `map` 原文當作新的格式；`teleport` 不再使用

### 3.2 資料同步
- 每次操作後立即保存
- 頁面載入時恢復狀態
- 版本不匹配時清空舊資料
- 瀏覽器封鎖網站資料（`localStorage` 不能用或寫入失敗）時，加入、移除、清空、匯入照樣更新記憶體裡的清單，只是記不住，並提示一次；路線進度與複製格式存不起來時也照常運作

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
  height: 85vh;
  height: 85dvh;  /* 支援的瀏覽器用 dvh（網址列收起、展開時跟著變） */
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
- ✅ G8、G10、G14、G15、G17 寶圖等級篩選（G12、G16 尚無資料）
- ✅ 12個主要地區篩選
- ✅ 卡片式寶圖展示（縮圖、等級、座標）
- ✅ 個人清單管理（新增、移除、清空）
- ✅ 座標複製功能（複製成貼到隊伍頻道的句子：/p 等級 地名 (X, Y) 最近：傳送點）
- ✅ 響應式設計
- ✅ LocalStorage 資料持久化
- ✅ 載入更多功能（初始24個）
- ✅ 匯出/匯入清單功能（JSON格式；匯出已由分享連結取代，以前匯出的 JSON 仍可匯入，見 Phase 2.2）

### Phase 2：路線規劃功能（已完成）
**實作成果：**
1. **路線生成器**
   - ✅ 從「我的清單」生成最佳尋寶路線（清單有 1 張以上就能生成）
   - ✅ 傳送點分組策略優化（相同傳送點附近的寶圖一起收集）
   - ✅ 顯示傳送次數、訪問地區統計

2. **地圖整合**
   - ✅ 64個真實傳送點資料（G8、G10、G12、G14、G15、G17 地區）
   - ✅ 3D 歐幾里得距離計算
   - ✅ 支援多語言傳送點名稱（中文、英文、日文）

3. **路線展示**
   - ✅ 分步驟導航介面（Phase 2.2 起一站一張寶圖，傳送標在每組的第一站）
   - ✅ 單步驟點擊複製功能
   - ✅ 一鍵複製完整路線
   - ✅ 自訂輸出格式功能
   - ✅ 語言模板快速切換（中文、英文、日文）

**技術實作：**
- ✅ 傳送點座標資料庫（aetherytes.json）
- ✅ 傳送點分組演算法（取代原本的改良式最近鄰居法）
- ✅ 非對稱距離矩陣（任意點→傳送點 = 0）
- ✅ LocalStorage 儲存自訂格式

### Phase 2.1：自訂輸出格式（已完成；Phase 2.2 改版）
**實作成果：**
1. **格式自訂功能**
   - ✅ 每一站一個格式欄位（原本傳送點與寶圖分別設定；傳送不再單獨一行，舊的傳送點格式不再使用）
   - ✅ 支援多語言變數（<傳送點>、<傳送點_en>、<傳送點_ja>等）；<傳送點> 是這一站最近的傳送點
   - ✅ 支援序號與總數變數
   - ✅ 點變數按鈕就插在游標位置；預覽用目前這一站的真實資料，隨輸入即時更新
   - ✅ <座標> 輸出 (x, y)，不再是 /pos x y z

2. **語言模板**
   - ✅ 中文：/p <序號>/<總數> <寶圖等級> <地區> <座標> 最近：<傳送點>
   - ✅ 英文：/p <序號>/<總數> <寶圖等級> <地區_en> <座標> Nearest: <傳送點_en>
   - ✅ 日文：/p <序號>/<總數> <寶圖等級> <地區_ja> <座標> 最寄り：<傳送點_ja>
   - ✅ 一鍵切換語言模板（只換欄位內容，按「儲存格式」才存）

### Phase 2.2：清單、路線與分享連結改版（已完成）
**實作成果：**
1. **清單頁**
   - ✅ 每一列直接顯示座標與最近的傳送點；✕ 直接移除，不再確認
   - ✅ 動作列：複製分享連結、匯入、清空清單；清空與匯入改成頁內對話框，預設選項不會丟掉原本的清單
   - ✅ 手機（≤768px）面板高度是畫面的 85%，標題看得到
   - ✅ 瀏覽器封鎖網站資料時，加入、移除、清空、匯入照常運作（只是記不住，提示一次）

2. **路線頁**（清單面板的第二頁，不再另開路線面板與格式面板）
   - ✅ 清單有 1 張以上就能生成；寶圖多的地區先跑，跑到一半清單變了不重排（新寶圖插在同一組後面）
   - ✅ 一站一張寶圖，標出目前這一站，每一站可標記完成；進度存在這台裝置，重新整理後還在，12 小時後清掉
   - ✅ 「複製下一站」複製目前這一站，「全部複製」一站一行（超過遊戲使用者巨集的 15 行會提醒分兩次貼）
   - ✅ 複製格式（Phase 2.1）搬到路線頁站別下面，可以展開

3. **分享連結**
   - ✅ 複製帶 `?maps=` 的連結；打開時選擇加進或取代自己的清單，處理完網址拿掉 `maps`
   - ✅ 匯入分享連結或以前匯出的 JSON；拿掉「匯出」按鈕與檔案匯入

### Phase 3：進階功能（未來規劃）
1. **團隊協作**
   - 分享清單連結（已完成，見 Phase 2.2）
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
   - 匯入/匯出功能（清單的匯入與分享連結見 Phase 2.2）
   - 與其他工具串接
   - API 開放

## 10. Phase 2 詳細設計規格

### 10.1 路線規劃功能詳細設計

#### 10.1.1 使用者介面設計
```
[清單入口 / 清單頁] → [生成路線] → [路線頁：一站一站走] → [‹ 清單]
```

**UI元素：**
1. **生成路線按鈕**
   - 位置：清單入口與清單面板底部（清單頁唯一的主要按鈕）
   - 條件：清單內有 1 個以上寶圖時啟用（只有清單是空的時停用）
   - 行為：打開清單面板並切到路線頁（面板的第二頁），不再另開路線面板；Escape 一次關掉整個面板

2. **路線頁**（`#routeView`，標記在 `index.html`，站別由 `RouteView` 畫出來）
   ```html
   <div class="tm-panel-view" id="routeView">
     <div class="panel-header"><!-- ‹ 清單 ｜ 路線 ｜ × --></div>
     <div class="panel-body">
       <p class="tm-route-overview">6 張 · 3 個地區 · 5 次傳送</p>  <!-- 有完成的站時改寫「完成 2/6」 -->
       <ol class="tm-stops" role="list">
         <li class="tm-stop is-current" aria-current="step" data-map-id="tm_010">
           <span class="tm-stop-num" aria-hidden="true">1</span>
           <div class="tm-stop-body">
             <p class="tm-stop-tp">🔮 傳送 瓦群佩洛</p>
             <p class="tm-stop-title">G17 烏爾科帕恰 #4</p>
             <p class="tm-stop-coords">(21.6, 23.9)</p>
             <p class="tm-stop-preview">/p 1/6 G17 烏爾科帕恰 (21.6, 23.9) 最近：瓦群佩洛</p>
           </div>
           <div class="tm-stop-actions">
             <button aria-label="複製第 1 站">📋</button>
             <button aria-pressed="false" aria-label="第 1 站完成">完成</button>
           </div>
         </li>
         <!-- 更多站 -->
       </ol>
       <!-- 站別下面：可以展開的「⚙️ 複製格式」（10.1.6） -->
     </div>
     <div class="panel-footer">
       <button>全部複製</button>
       <button class="btn-primary">📋 複製下一站（1/6）</button>
     </div>
   </div>
   ```
   - 一站一張寶圖；這一站之前需要傳送時，先一行「🔮 傳送 …」（標在一組的第一站）
   - **目前這一站**＝依順序第一個還沒完成的站：外框與底色標亮，下方預覽會被複製的句子；完成的站淡化，站號變 ✓。任何一站都可以標記或取消完成
   - 「複製下一站」複製目前這一站，每站的 📋 複製那一站，「全部複製」一站一行（包括已完成的站）；全部完成時「複製下一站」停用並寫「全部完成」
   - 摘要旁有「順序依直線距離估算」；有完成的站時出現「重設進度」，按下去整份進度清掉、站序重新排
   - 路線頁開著時，清單變了（加入、移除、匯入、隊伍同步）或切換語言，都會更新站序並重畫路線頁；清單變成 0 張時回到清單頁

#### 10.1.2 資料結構設計

**傳送點資料（G8 實際資料）：**
```javascript
{
  "aetherytes": {
    // G8 蒼天地區傳送點
    "coerthas": [
      { 
        "id": "falcons_nest", 
        "name": {
          "zh": "隼巢",
          "ja": "ファルコンネスト",
          "en": "Falcon's Nest"
        },
        "coords": { "x": 32, "y": 36, "z": 0 } 
      }
    ],
    "abalathia": [
      { 
        "id": "camp_cloudtop", 
        "name": {
          "zh": "雲頂營地",
          "ja": "キャンプ・クラウドトップ",
          "en": "Camp Cloudtop"
        },
        "coords": { "x": 10, "y": 34, "z": 0 } 
      },
      { 
        "id": "ok_zundu", 
        "name": {
          "zh": "奧克·茲恩德",
          "ja": "オク・ズンド",
          "en": "Ok' Zundu"
        },
        "coords": { "x": 10, "y": 14, "z": 0 } 
      }
    ],
    "dravania": [
      { 
        "id": "tailfeather", 
        "name": {
          "zh": "尾羽集落",
          "ja": "テイルフェザー",
          "en": "Tailfeather"
        },
        "coords": { "x": 33, "y": 23, "z": 0 } 
      },
      { 
        "id": "anyx_trine", 
        "name": {
          "zh": "不潔三塔",
          "ja": "不浄の三塔",
          "en": "Anyx Trine"
        },
        "coords": { "x": 16, "y": 23, "z": 0 } 
      },
      { 
        "id": "moghome", 
        "name": {
          "zh": "莫古力之家",
          "ja": "モグモグホーム",
          "en": "Moghome"
        },
        "coords": { "x": 28, "y": 34, "z": 0 } 
      },
      { 
        "id": "zenith", 
        "name": {
          "zh": "白堊宮殿",
          "ja": "白亜の宮殿",
          "en": "Zenith"
        },
        "coords": { "x": 11, "y": 29, "z": 0 } 
      }
    ],
    
    // G10 紅蓮地區傳送點
    "gyr_abania": [
      {
        "id": "castrum_oriens",
        "name": {
          "zh": "東方堡",
          "ja": "カストルム・オリエンス",
          "en": "Castrum Oriens"
        },
        "coords": { "x": 9, "y": 11, "z": 0 }
      },
      {
        "id": "peering_stones",
        "name": {
          "zh": "窺石塔",
          "ja": "ピーリングストーンズ",
          "en": "The Peering Stones"
        },
        "coords": { "x": 30, "y": 26, "z": 0 }
      },
      {
        "id": "ala_gannha",
        "name": {
          "zh": "阿拉加納",
          "ja": "アラガーナ",
          "en": "Ala Gannha"
        },
        "coords": { "x": 24, "y": 7, "z": 0 }
      },
      {
        "id": "ala_ghiri",
        "name": {
          "zh": "阿拉基利",
          "ja": "アラギリ",
          "en": "Ala Ghiri"
        },
        "coords": { "x": 16, "y": 36, "z": 0 }
      },
      {
        "id": "porta_praetoria",
        "name": {
          "zh": "帝國東方堡",
          "ja": "ポルタ・プレトリア",
          "en": "Porta Praetoria"
        },
        "coords": { "x": 8, "y": 21, "z": 0 }
      },
      {
        "id": "ala_mhigan_quarter",
        "name": {
          "zh": "阿拉米格居住區",
          "ja": "アラミガン・クォーター",
          "en": "The Ala Mhigan Quarter"
        },
        "coords": { "x": 34, "y": 34, "z": 0 }
      }
    ],
    "othard": [
      {
        "id": "tamamizu",
        "name": {
          "zh": "碧玉水",
          "ja": "碧のタマミズ",
          "en": "Tamamizu"
        },
        "coords": { "x": 29, "y": 16, "z": 0 }
      },
      {
        "id": "onokoro",
        "name": {
          "zh": "奧諾可洛島",
          "ja": "オノコロ島",
          "en": "Onokoro"
        },
        "coords": { "x": 23, "y": 10, "z": 0 }
      },
      {
        "id": "house_of_the_fierce",
        "name": {
          "zh": "烈士庵",
          "ja": "烈士庵",
          "en": "The House of the Fierce"
        },
        "coords": { "x": 26, "y": 13, "z": 0 }
      },
      {
        "id": "namai",
        "name": {
          "zh": "納米村",
          "ja": "ナマイ村",
          "en": "Namai"
        },
        "coords": { "x": 30, "y": 20, "z": 0 }
      },
      {
        "id": "dhoro_iloh",
        "name": {
          "zh": "多羅·伊洛",
          "ja": "ドーロ・イロー",
          "en": "Dhoro Iloh"
        },
        "coords": { "x": 6, "y": 24, "z": 0 }
      },
      {
        "id": "dawn_throne",
        "name": {
          "zh": "明晨王座",
          "ja": "明けの玉座",
          "en": "The Dawn Throne"
        },
        "coords": { "x": 23, "y": 22, "z": 0 }
      },
      {
        "id": "reunion",
        "name": {
          "zh": "重逢集市",
          "ja": "再会の市",
          "en": "Reunion"
        },
        "coords": { "x": 33, "y": 28, "z": 0 }
      }
    ],
    
    // G12 漆黑地區傳送點
    "norvrandt": [
      {
        "id": "the_ostall_imperative",
        "name": {
          "zh": "奧斯塔爾嚴命城",
          "ja": "オスタル厳命城",
          "en": "The Ostall Imperative"
        },
        "coords": { "x": 7, "y": 17, "z": 0 }
      },
      {
        "id": "fort_jobb",
        "name": {
          "zh": "約布砦",
          "ja": "ジョッブ砦",
          "en": "Fort Jobb"
        },
        "coords": { "x": 37, "y": 21, "z": 0 }
      },
      {
        "id": "tomra",
        "name": {
          "zh": "托梅拉村",
          "ja": "トメラの村",
          "en": "Tomra"
        },
        "coords": { "x": 13, "y": 9, "z": 0 }
      },
      {
        "id": "stilltide",
        "name": {
          "zh": "寂靜潮",
          "ja": "スティルタイド",
          "en": "Stilltide"
        },
        "coords": { "x": 35, "y": 27, "z": 0 }
      },
      {
        "id": "twine",
        "name": {
          "zh": "特懷因",
          "ja": "トゥワイン",
          "en": "Twine"
        },
        "coords": { "x": 11, "y": 17, "z": 0 }
      },
      {
        "id": "mord_souq",
        "name": {
          "zh": "莫爾德集市",
          "ja": "モルド・スーク",
          "en": "Mord Souq"
        },
        "coords": { "x": 26, "y": 17, "z": 0 }
      },
      {
        "id": "inn_at_journeys_head",
        "name": {
          "zh": "旅立之宿",
          "ja": "旅立ちの宿",
          "en": "The Inn at Journey's Head"
        },
        "coords": { "x": 30, "y": 28, "z": 0 }
      },
      {
        "id": "lydha_lran",
        "name": {
          "zh": "麗達拉恩",
          "ja": "リダ・ラーン",
          "en": "Lydha Lran"
        },
        "coords": { "x": 15, "y": 32, "z": 0 }
      },
      {
        "id": "pla_enni",
        "name": {
          "zh": "普拉恩尼蘑菇洞",
          "ja": "プラ・エンニ茸窟",
          "en": "Pla Enni"
        },
        "coords": { "x": 20, "y": 4, "z": 0 }
      },
      {
        "id": "wolekdorf",
        "name": {
          "zh": "沃雷克多夫",
          "ja": "ヴォレクドルフ",
          "en": "Wolekdorf"
        },
        "coords": { "x": 29, "y": 8, "z": 0 }
      },
      {
        "id": "slitherbough",
        "name": {
          "zh": "蛇行枝",
          "ja": "スリザーバウ",
          "en": "Slitherbough"
        },
        "coords": { "x": 20, "y": 27, "z": 0 }
      },
      {
        "id": "fanow",
        "name": {
          "zh": "法諾之里",
          "ja": "ファノヴの里",
          "en": "Fanow"
        },
        "coords": { "x": 29, "y": 18, "z": 0 }
      },
      {
        "id": "the_ondo_cups",
        "name": {
          "zh": "翁德族潮池",
          "ja": "オンドの潮溜まり",
          "en": "The Ondo Cups"
        },
        "coords": { "x": 33, "y": 18, "z": 0 }
      },
      {
        "id": "the_macarenses_angle",
        "name": {
          "zh": "馬卡雷薩斯廣場",
          "ja": "マカレンサス広場",
          "en": "The Macarenses Angle"
        },
        "coords": { "x": 19, "y": 26, "z": 0 }
      }
    ],
    
    // G14 曉月地區傳送點
    "ilsabard": [
      {
        "id": "the_archeion",
        "name": {
          "zh": "阿爾凱昂保管院",
          "ja": "アルケイオン保管院",
          "en": "The Archeion"
        },
        "coords": { "x": 30, "y": 12, "z": 0 }
      },
      {
        "id": "sharlayan_hamlet",
        "name": {
          "zh": "小薩雷安",
          "ja": "リトルシャーレアン",
          "en": "Sharlayan Hamlet"
        },
        "coords": { "x": 22, "y": 21, "z": 0 }
      },
      {
        "id": "aporia",
        "name": {
          "zh": "阿波利亞總部",
          "ja": "アポリア本部",
          "en": "Aporia"
        },
        "coords": { "x": 7, "y": 28, "z": 0 }
      },
      {
        "id": "yedlihmad",
        "name": {
          "zh": "葉德利曼",
          "ja": "イェドリマン",
          "en": "Yedlihmad"
        },
        "coords": { "x": 25, "y": 34, "z": 0 }
      },
      {
        "id": "great_work",
        "name": {
          "zh": "德米爾遺烈鄉",
          "ja": "デミールの遺烈郷",
          "en": "The Great Work"
        },
        "coords": { "x": 11, "y": 22, "z": 0 }
      },
      {
        "id": "palaka_stand",
        "name": {
          "zh": "帕拉卡之里",
          "ja": "パーラカの里",
          "en": "Palaka's Stand"
        },
        "coords": { "x": 30, "y": 16, "z": 0 }
      },
      {
        "id": "camp_broken_glass",
        "name": {
          "zh": "碎玻璃營地",
          "ja": "キャンプ・ブロークングラス",
          "en": "Camp Broken Glass"
        },
        "coords": { "x": 13, "y": 31, "z": 0 }
      },
      {
        "id": "tertium",
        "name": {
          "zh": "第三站",
          "ja": "テルティウム駅",
          "en": "Tertium"
        },
        "coords": { "x": 32, "y": 18, "z": 0 }
      },
      {
        "id": "sinus_lacrimarum",
        "name": {
          "zh": "淚之灣",
          "ja": "涙の入江",
          "en": "Sinus Lacrimarum"
        },
        "coords": { "x": 10, "y": 34, "z": 0 }
      },
      {
        "id": "bestways_burrow",
        "name": {
          "zh": "貝斯特威巴羅",
          "ja": "ベストウェイ・バロー",
          "en": "Bestways Burrow"
        },
        "coords": { "x": 21, "y": 11, "z": 0 }
      },
      {
        "id": "reahs_tahra",
        "name": {
          "zh": "黎亞塔拉",
          "ja": "リア・ターラ",
          "en": "Reah Tahra"
        },
        "coords": { "x": 11, "y": 27, "z": 0 }
      },
      {
        "id": "base_omicron",
        "name": {
          "zh": "奧米克戎基地",
          "ja": "オミクロンベース",
          "en": "Base Omicron"
        },
        "coords": { "x": 31, "y": 28, "z": 0 }
      },
      {
        "id": "ostrakon_deka_hexi",
        "name": {
          "zh": "伊亞之里",
          "ja": "イーアの里",
          "en": "Ostrakon Deka-hexi"
        },
        "coords": { "x": 23, "y": 8, "z": 0 }
      }
    ],
    
    // G15 特殊地區傳送點
    "elpis": [
      {
        "id": "the_twelve_wonders",
        "name": {
          "zh": "十二節之園",
          "ja": "十二節の園",
          "en": "The Twelve Wonders"
        },
        "coords": { "x": 9, "y": 32, "z": 0 }
      },
      {
        "id": "anagnorisis",
        "name": {
          "zh": "阿納格諾里西斯天測園",
          "ja": "アナグノリシス天測園",
          "en": "Anagnorisis"
        },
        "coords": { "x": 25, "y": 24, "z": 0 }
      },
      {
        "id": "poieten_oikos",
        "name": {
          "zh": "波伊艾騰·奧伊科斯",
          "ja": "ポイエテーン・オイコス",
          "en": "Poieten Oikos"
        },
        "coords": { "x": 11, "y": 17, "z": 0 }
      }
    ],
    
    // G17 黃金地區傳送點
    "tural": [
      {
        "id": "wachunpelo",
        "name": {
          "zh": "瓦春佩洛",
          "ja": "ワチュン・ペロ",
          "en": "Wachunpelo"
        },
        "coords": { "x": 28, "y": 13, "z": 0 }
      },
      {
        "id": "worqor_zormor",
        "name": {
          "zh": "沃拉的殘響",
          "ja": "ウォーラーの残響",
          "en": "Worqor Zormor"
        },
        "coords": { "x": 31, "y": 34, "z": 0 }
      },
      {
        "id": "ok_hanu",
        "name": {
          "zh": "奧克哈努",
          "ja": "オック・ハヌ",
          "en": "Ok' Hanu"
        },
        "coords": { "x": 18, "y": 12, "z": 0 }
      },
      {
        "id": "earthenshire",
        "name": {
          "zh": "土陶郡",
          "ja": "アースンシャイア",
          "en": "Earthenshire"
        },
        "coords": { "x": 12, "y": 28, "z": 0 }
      },
      {
        "id": "many_fires",
        "name": {
          "zh": "朋友之燈火",
          "ja": "朋友の灯火",
          "en": "Many Fires"
        },
        "coords": { "x": 32, "y": 26, "z": 0 }
      },
      {
        "id": "dock_poga",
        "name": {
          "zh": "波加停船所",
          "ja": "ポガ停船所",
          "en": "Dock Poga"
        },
        "coords": { "x": 37, "y": 17, "z": 0 }
      },
      {
        "id": "iq_br_aak",
        "name": {
          "zh": "伊克布拉賈",
          "ja": "イクブラージャ",
          "en": "Iq Br'aak"
        },
        "coords": { "x": 14, "y": 13, "z": 0 }
      },
      {
        "id": "mamook",
        "name": {
          "zh": "馬穆克",
          "ja": "マムーク",
          "en": "Mamook"
        },
        "coords": { "x": 36, "y": 32, "z": 0 }
      },
      {
        "id": "meyhane",
        "name": {
          "zh": "梅瓦海索恩",
          "ja": "メワヘイゾーン",
          "en": "Meyhane"
        },
        "coords": { "x": 28, "y": 10, "z": 0 }
      },
      {
        "id": "sheshenewezi_springs",
        "name": {
          "zh": "謝謝內青燐泉",
          "ja": "シェシェネ青燐泉",
          "en": "Sheshenewezi Springs"
        },
        "coords": { "x": 16, "y": 19, "z": 0 }
      },
      {
        "id": "hhusatahwi",
        "name": {
          "zh": "胡薩塔維宿場町",
          "ja": "フーサタイ宿場町",
          "en": "Hhusatahwi"
        },
        "coords": { "x": 29, "y": 31, "z": 0 }
      },
      {
        "id": "the_outskirts",
        "name": {
          "zh": "郊外",
          "ja": "アウトスカーツ",
          "en": "The Outskirts"
        },
        "coords": { "x": 17, "y": 10, "z": 0 }
      },
      {
        "id": "electrope_strike",
        "name": {
          "zh": "電氣石採石場",
          "ja": "エレクトロープ採石場",
          "en": "Electrope Strike"
        },
        "coords": { "x": 17, "y": 24, "z": 0 }
      },
      {
        "id": "yyasulani_station",
        "name": {
          "zh": "雅斯拉尼站",
          "ja": "ヤースラニ駅",
          "en": "Yyasulani Station"
        },
        "coords": { "x": 32, "y": 26, "z": 0 }
      }
    ]
  }
}
```

**路線資料結構：**
路線頁拿到的是 `RouteCalculator#describeOrder(order, maps)` 的結果：站序（寶圖 id）展開成每一站的資訊與摘要。「傳送」標在一組（同地區、同最近傳送點）的第一站，摘要的傳送次數就是有傳送的站數。
```javascript
{
  "stops": [
    { "mapId": "tm_010", "zoneId": "urqopacha", "aetheryteId": "wachunpelo", "teleport": true },
    { "mapId": "tm_007", "zoneId": "urqopacha", "aetheryteId": "wachunpelo", "teleport": false },
    { "mapId": "tm_013", "zoneId": "urqopacha", "aetheryteId": "worqor_zormor", "teleport": true }
    // …（6 張寶圖的範例清單，其餘三站略）
  ],
  "summary": { "maps": 6, "zones": 3, "teleports": 5 }
}
```
站序（`order`）與完成記號（`done`）存在 `localStorage['ff14tw_treasure_route_progress']`，格式見 3.1。

#### 10.1.3 演算法設計（已實作）

**已實作的傳送點分組演算法：**
傳送點分組策略取代了原本的改良式最近鄰居法，核心概念是將相同傳送點附近的寶圖分組，一次性收集完畢再移動到下一個傳送點。

**演算法流程：**
1. 將所有寶圖按所屬地區分組
2. 對每個地區：
   - 找出每個寶圖最近的傳送點
   - 將使用相同傳送點的寶圖分為一組
   - 在每個傳送點群組內使用貪婪最近鄰居法規劃路線
3. 地區之間：寶圖多的地區先跑（見 10.1.4）
4. 連接各傳送點群組，生成完整路線（站序）

**實際實作的核心方法：**
```javascript
solveWithTeleportGrouping(maps) {
    // 將寶圖按地區分組
    const mapsByZone = {};
    maps.forEach(map => {
        const zoneId = this.getZoneId(map.zone);
        if (!mapsByZone[zoneId]) {
            mapsByZone[zoneId] = [];
        }
        mapsByZone[zoneId].push(map);
    });
    
    // 對每個地區生成路線
    const route = [];
    for (const [zoneId, zoneMaps] of Object.entries(mapsByZone)) {
        const teleportGroups = this.groupByNearestTeleport(zoneMaps, zoneId);
        
        for (const group of teleportGroups) {
            // 傳送到該傳送點
            route.push({
                type: 'teleport',
                to: group.teleport,
                zone: zoneId,
                coords: group.teleport.coords
            });
            
            // 收集該傳送點附近的所有寶圖
            const orderedMaps = this.orderMapsNearTeleport(group.maps, group.teleport);
            orderedMaps.forEach(map => {
                route.push({
                    type: 'move',
                    mapId: map.id,
                    mapLevel: map.level,
                    zone: zoneId,
                    coords: map.coords
                });
            });
        }
    }
    
    return route;
}
  
// 將寶圖按最近的傳送點分組
groupByNearestTeleport(maps, zoneId) {
    const aetherytes = this.aetherytesData[zoneId] || [];
    const groups = new Map();
    
    maps.forEach(map => {
        let nearestAetheryte = null;
        let minDistance = Infinity;
        
        aetherytes.forEach(aetheryte => {
            const distance = this.calculateDistance3D(map.coords, aetheryte.coords);
            if (distance < minDistance) {
                minDistance = distance;
                nearestAetheryte = aetheryte;
            }
        });
        
        if (nearestAetheryte) {
            const key = nearestAetheryte.id;
            if (!groups.has(key)) {
                groups.set(key, {
                    teleport: nearestAetheryte,
                    maps: []
                });
            }
            groups.get(key).maps.push(map);
        }
    });
    
    return Array.from(groups.values());
}
  
  // 地區內路線規劃（基於非對稱距離矩陣）
  planRegionRoute(regionMaps) {
    const normalMaps = regionMaps; // 所有寶圖都是普通點
    const teleports = this.getRegionAetherytes(regionMaps[0].zoneId);
    
    // 使用啟發式策略：先解決普通點TSP，再以最佳傳送點結束
    const result = this.solveWithHeuristic(normalMaps, teleports);
    
    // 轉換為路線步驟格式
    const route = [];
    let lastWasTeleport = false;
    
    for (let i = 0; i < result.path.length; i++) {
      const point = result.path[i];
      
      if (point.isTeleport) {
        if (i === 0 || !lastWasTeleport) {
          route.push({
            type: 'teleport',
            to: point.name,
            zone: point.zoneId || regionMaps[0].zoneId,
            coords: point.coords
          });
        }
        lastWasTeleport = true;
      } else {
        route.push({
          type: 'move',
          mapId: point.id,
          mapLevel: point.levelName,
          zone: point.zoneId,
          coords: point.coords
        });
        lastWasTeleport = false;
      }
    }
    
    return route;
  }
  
  // 啟發式求解（改編自演算法文件）
  solveWithHeuristic(normalPoints, teleportPoints) {
    // 特殊情況
    if (normalPoints.length === 0) {
      return { path: teleportPoints, distance: 0 };
    }
    
    if (normalPoints.length === 1) {
      return { 
        path: [...normalPoints, ...teleportPoints], 
        distance: 0 
      };
    }
    
    // 一般情況：先解決普通點的TSP
    const normalTSP = this.solvePureTSP(normalPoints);
    
    if (teleportPoints.length === 0) {
      return normalTSP;
    }
    
    // 找到距離最後一個普通點最近的傳送點
    const lastNormalPoint = normalTSP.path[normalTSP.path.length - 1];
    let bestTeleport = teleportPoints[0];
    let minDistance = this.calculateDistance(lastNormalPoint, bestTeleport);
    
    for (const teleport of teleportPoints.slice(1)) {
      const distance = this.calculateDistance(lastNormalPoint, teleport);
      if (distance < minDistance) {
        minDistance = distance;
        bestTeleport = teleport;
      }
    }
    
    // 構建最終路徑：普通點 → 最佳傳送點 → 其他傳送點
    const finalPath = [
      ...normalTSP.path,
      bestTeleport,
      ...teleportPoints.filter(t => t !== bestTeleport)
    ];
    
    return {
      path: finalPath,
      distance: normalTSP.distance + minDistance
    };
  }
  
  // 純TSP求解（貪婪最近鄰居法）
  solvePureTSP(points) {
    if (points.length <= 1) {
      return { path: points, distance: 0 };
    }
    
    let bestDistance = Infinity;
    let bestPath = [];
    
    // 嘗試每個起點
    for (let start = 0; start < points.length; start++) {
      const visited = new Array(points.length).fill(false);
      const path = [points[start]];
      visited[start] = true;
      let totalDistance = 0;
      let currentIdx = start;
      
      // 貪婪選擇最近的未訪問點
      for (let i = 1; i < points.length; i++) {
        let nearestIdx = -1;
        let nearestDistance = Infinity;
        
        for (let j = 0; j < points.length; j++) {
          if (!visited[j]) {
            const distance = this.calculateDistance(points[currentIdx], points[j]);
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestIdx = j;
            }
          }
        }
        
        if (nearestIdx !== -1) {
          visited[nearestIdx] = true;
          path.push(points[nearestIdx]);
          totalDistance += nearestDistance;
          currentIdx = nearestIdx;
        }
      }
      
      if (totalDistance < bestDistance) {
        bestDistance = totalDistance;
        bestPath = path;
      }
    }
    
    return { path: bestPath, distance: bestDistance };
  }
}
```

#### 10.1.4 地區訪問順序決定

寶圖多的地區先跑；張數一樣時，照該地區的寶圖在清單裡第一次出現的順序（穩定排序）。
沒有「起點地區」：原本的 `findStartingRegion()` 想找「離傳送點最近的寶圖」當起點，但任一點到傳送點的距離一律是 0，結果永遠是清單第一張寶圖所在的地區，所以拿掉了，路線不再受清單第一張影響。

```javascript
// 決定地區訪問順序（groupByZone 的 key 順序就是各地區的寶圖第一次出現的順序）
getRegionOrder(mapsByRegion) {
  return Object.keys(mapsByRegion).sort((a, b) =>
    mapsByRegion[b].length - mapsByRegion[a].length
  );
}

// 找最近的傳送點
findNearestAetheryte(maps) {
  const zone = maps[0].zoneId;
  const aetherytes = this.getRegionAetherytes(zone);
  
  let minTotalDistance = Infinity;
  let bestAetheryte = null;
  
  // 找出離所有寶圖總距離最短的傳送點
  for (const aetheryte of aetherytes) {
    let totalDistance = 0;
    for (const map of maps) {
      totalDistance += this.calculateDistance3D(aetheryte.coords, map.coords);
    }
    
    if (totalDistance < minTotalDistance) {
      minTotalDistance = totalDistance;
      bestAetheryte = aetheryte;
    }
  }
  
  return bestAetheryte;
}
```

#### 10.1.5 站序與進度

路線是「站序」（寶圖 id 的順序）加上完成記號，由 `RouteCalculator`（排序）與 `RouteProgress`（保存）負責：

- **第一次排序**（沒有存著的站序時，也就是第一次打開路線頁、或進度被清掉之後）：`firstOrder(maps)` 先依 10.1.4 排地區，每個地區裡照 10.1.3 的算法（每張圖分給最近的傳送點、傳送點組依張數多到少、組內用最近鄰居法），只取寶圖、不取傳送步驟。排好的站序存進進度的 `order`
- **跑到一半清單變了，不重排**：`mergeOrder(prevOrder, maps)` 讓還在清單裡的寶圖維持原本的順序，被移除的直接拿掉；新加入的寶圖插在同一組（同地區、同最近傳送點）的最後一站後面，沒有同一組就插在同地區的最後一站後面，地區也是新的就排在最後。這樣隊友挖完把圖從隊伍清單移除時，路線不會跳到別的地區，傳送點組也保持連在一起、傳送次數不會變多。要重新排序就按「重設進度」
- **展開成每一站**：`describeOrder(order, maps)` 回傳每一站的資訊與摘要（資料結構見 10.1.2）；地區沒有傳送點時，那個地區的站沒有傳送行
- **進度**（`RouteProgress`）：`{ order, done, updatedAt }` 存在 `localStorage['ff14tw_treasure_route_progress']`，只記在這台裝置。清單增減時，還在清單裡的已完成寶圖保持完成，不在清單裡的 id 從 `order`、`done` 移除。寶圖 id 就是地點，舊的完成記號留著會讓同一個地點的新寶圖被當成已完成而跳過，所以整份進度會在這些時候清掉：清單變成 0 張（清空清單、移除最後一張）、按「重設進度」、用「取代」匯入或打開分享連結、所有站都完成之後清單又有變化（上一趟跑完了，算新的一趟）、`updatedAt` 超過 12 小時
- 儲存空間不能用時進度只留在記憶體裡，路線頁照常運作

#### 10.1.6 複製格式

每一站複製成一行，格式由 `CopyFormat` 決定：

- **範本與變數**：預設範本跟著介面語言（三個語言的範本見 Phase 2.1），和卡片的隊伍頻道句子同一個句型、前面加站號。變數：`<序號>`、`<總數>`、`<寶圖等級>`（大寫，如 `G17`）、`<地區>`、`<座標>`（`(21.6, 23.9)`，一位小數、不含 Z）、`<傳送點>`；另有 `<地區_en>`、`<地區_ja>`、`<傳送點_en>`、`<傳送點_ja>`。同一個變數出現幾次就換幾次；`<傳送點>` 是這張圖最近的傳送點，查不到時換成空字串並收掉多出來的空白，預設範本則拿掉整段「最近：<傳送點>」
- **格式區塊**：路線頁站別下面可以展開的「⚙️ 複製格式」：語言範本 chip（中文、English、日本語，按了只換欄位內容）、一個有 label 的 textarea、六顆插入變數的按鈕、預覽（目前這一站，全部完成時用第 1 站；用還沒存的內容）、「恢復預設」與「儲存格式」。複製一律用目前生效的格式（存過的，或沒存過時的預設）
- **存檔**：`localStorage['treasureMapFormatSettings']` 存 `{ "version": 2, "template": "…" }`。有存就照存的格式，不跟介面語言變；沒存（從來沒存過，或按了「恢復預設」）才跟著介面語言。讀到舊的 `{ teleport, map }` 時轉成新的形狀並寫回（見 3.1）

### 10.2 實作成果總結
1. ✅ 建立完整傳送點資料（64個真實傳送點，涵蓋所有支援地區）
2. ✅ 實作 3D 歐幾里得距離計算函式
3. ✅ 開發傳送點分組演算法（優於原規劃的啟發式TSP）
4. ✅ 建立路線頁（一站一張寶圖、標記完成、單站複製、全部複製）
5. ✅ 加入「生成路線」按鈕功能（清單有 1 張以上就能生成）
6. ✅ 測試各種邊界情況（跨地區、單地區、相同傳送點等）
7. ✅ 實作自訂複製格式（一個欄位，點變數就能插入，預覽用目前這一站的真實資料）
8. ✅ 加入語言模板快速切換
9. ✅ 路線進度：完成記號重新整理後還在，跑到一半清單變了不重排

### 10.3 演算法優勢

**傳送點分組策略的優點：**
1. **直觀性**：符合玩家實際遊玩習慣（傳送到一個點，收集附近所有寶圖）
2. **效率**：減少不必要的傳送次數
3. **簡單性**：易於理解和實作
4. **實用性**：生成的路線符合實際遊戲體驗

**實作細節：**
- 使用 3D 歐幾里得距離計算
- 支援跨地區路線規劃
- 自動處理地區名稱到 zoneId 的轉換
- 在每個傳送點群組內使用貪婪最近鄰居法優化順序

## 11. 測試檢查清單

- [x] 篩選功能正常運作
- [x] 清單新增/移除/清空功能
- [x] LocalStorage 資料持久化
- [x] 響應式設計各裝置正常
- [x] 圖片載入與錯誤處理
- [x] 鍵盤導航與無障礙
- [x] 複製座標功能
- [x] Modal 開關與焦點管理
- [x] 路線生成與顯示功能
- [x] 自訂格式設定與儲存
- [x] 語言模板切換功能
- [x] 跨地區路線規劃
- [x] 複製分享連結與匯入清單功能（含以前匯出的 JSON）
- [x] 路線進度與完成記號（重新整理後還在、超過 12 小時清掉）
- [x] 瀏覽器封鎖網站資料時，清單與路線照常運作