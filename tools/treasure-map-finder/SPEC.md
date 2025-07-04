# 寶圖搜尋器 - 詳細功能規格書 v1.0

## 1. 產品概述

### 1.1 產品定位
- **工具名稱**：寶圖搜尋器 (Treasure Map Finder)
- **URL路徑**：`/tools/treasure-map-finder/`
- **目標用戶**：所有需要查詢寶圖位置的 FF14 玩家
- **核心價值**：減少玩家在遊戲內外切換對照的時間

### 1.2 功能範圍
- ✅ 包含：寶圖位置查詢、篩選、個人清單管理、路線規劃、自訂輸出格式
- ❌ 不包含：團隊分享、圖片上傳識別

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
- ✅ G8、G10、G14、G15、G17 寶圖等級篩選（G12、G16 尚無資料）
- ✅ 12個主要地區篩選
- ✅ 卡片式寶圖展示（縮圖、等級、座標）
- ✅ 個人清單管理（新增、移除、清空）
- ✅ 座標複製功能（/pos X Y Z 指令）
- ✅ 響應式設計
- ✅ LocalStorage 資料持久化
- ✅ 載入更多功能（初始24個）
- ✅ 匯出/匯入清單功能（JSON格式）

### Phase 2：路線規劃功能（已完成）
**實作成果：**
1. **路線生成器**
   - ✅ 從「我的清單」生成最佳尋寶路線（需至少2張寶圖）
   - ✅ 傳送點分組策略優化（相同傳送點附近的寶圖一起收集）
   - ✅ 顯示傳送次數、訪問地區統計

2. **地圖整合**
   - ✅ 64個真實傳送點資料（G8、G10、G12、G14、G15、G17 地區）
   - ✅ 3D 歐幾里得距離計算
   - ✅ 支援多語言傳送點名稱（中文、英文、日文）

3. **路線展示**
   - ✅ 分步驟導航介面（傳送點、寶圖位置）
   - ✅ 單步驟點擊複製功能
   - ✅ 一鍵複製完整路線
   - ✅ 自訂輸出格式功能
   - ✅ 語言模板快速切換（中文、英文、日文）

**技術實作：**
- ✅ 傳送點座標資料庫（aetherytes.json）
- ✅ 傳送點分組演算法（取代原本的改良式最近鄰居法）
- ✅ 非對稱距離矩陣（任意點→傳送點 = 0）
- ✅ LocalStorage 儲存自訂格式

### Phase 2.1：自訂輸出格式（已完成）
**實作成果：**
1. **格式自訂功能**
   - ✅ 傳送點與寶圖分別設定格式
   - ✅ 支援多語言變數（<傳送點>、<傳送點_en>、<傳送點_ja>等）
   - ✅ 支援序號與總數變數
   - ✅ 即時預覽功能

2. **語言模板**
   - ✅ 中文：/p 傳送至 <傳送點> <座標>
   - ✅ 英文：/p Teleport to <傳送點_en> <座標>
   - ✅ 日文：/p <傳送點_ja>にテレポート <座標>
   - ✅ 一鍵切換語言模板

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

2. **路線結果顯示**
   ```html
   <div class="route-result">
     <div class="route-summary">
       <h3>最佳路線</h3>
       <p>總計：5個寶圖 | 傳送次數：3次</p>
     </div>
     <div class="route-steps">
       <div class="route-step">
         <span class="step-icon">🔄</span>
         <span class="step-text">傳送至 Labyrinthos - 傳送點1</span>
       </div>
       <div class="route-step">
         <span class="step-icon">📍</span>
         <span class="step-text">前往寶圖 (6.8, 20.9, 2.2)</span>
       </div>
       <!-- 更多步驟 -->
     </div>
   </div>
   ```

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
```javascript
{
  "summary": {
    "totalMaps": 5,
    "totalTeleports": 3,
    "regionsVisited": ["ilsabard", "othard"]
  },
  "route": [
    {
      "type": "teleport",
      "to": "Labyrinthos - 傳送點1",
      "zone": "ilsabard",
      "coords": { "x": 0, "y": 0, "z": 0 }
    },
    {
      "type": "move",
      "mapId": "tm_055",
      "mapLevel": "G14",
      "zone": "ilsabard",
      "coords": { "x": 6.8, "y": 20.9, "z": 2.2 }
    },
    {
      "type": "teleport",
      "to": "Labyrinthos - 傳送點3",
      "zone": "ilsabard",
      "coords": { "x": 20, "y": 20, "z": 20 }
    },
    {
      "type": "move",
      "mapId": "tm_056",
      "mapLevel": "G14",
      "zone": "ilsabard",
      "coords": { "x": 25.1, "y": 18.3, "z": 15.2 }
    }
  ]
}
```

#### 10.1.3 演算法設計（已實作）

**已實作的傳送點分組演算法：**
傳送點分組策略取代了原本的改良式最近鄰居法，核心概念是將相同傳送點附近的寶圖分組，一次性收集完畢再移動到下一個傳送點。

**演算法流程：**
1. 將所有寶圖按所屬地區分組
2. 對每個地區：
   - 找出每個寶圖最近的傳送點
   - 將使用相同傳送點的寶圖分為一組
   - 在每個傳送點群組內使用貪婪最近鄰居法規劃路線
3. 連接各傳送點群組，生成完整路線

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
  
  // 找出全域最近的寶圖-傳送點配對
  findStartingRegion(maps) {
    let minDistance = Infinity;
    let startRegion = null;
    let startMap = null;
    
    for (const map of maps) {
      const aetherytes = this.getRegionAetherytes(map.zoneId);
      for (const aetheryte of aetherytes) {
        const dist = this.calculateDistance3D(map.coords, aetheryte.coords);
        if (dist < minDistance) {
          minDistance = dist;
          startRegion = map.zoneId;
          startMap = map;
        }
      }
    }
    return { startRegion, startMap };
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

```javascript
// 決定地區訪問順序
getRegionOrder(mapsByRegion, startRegion) {
  // 第一個地區已經由 findStartingRegion 決定
  const regions = Object.keys(mapsByRegion);
  const otherRegions = regions.filter(r => r !== startRegion);
  
  // 其餘地區按寶圖數量排序（多的優先）
  otherRegions.sort((a, b) => 
    mapsByRegion[b].length - mapsByRegion[a].length
  );
  
  return [startRegion, ...otherRegions];
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

### 10.2 實作成果總結
1. ✅ 建立完整傳送點資料（64個真實傳送點，涵蓋所有支援地區）
2. ✅ 實作 3D 歐幾里得距離計算函式
3. ✅ 開發傳送點分組演算法（優於原規劃的啟發式TSP）
4. ✅ 建立路線顯示 UI（含單步驟複製、完整路線複製）
5. ✅ 加入「生成路線」按鈕功能（至少需要2張寶圖）
6. ✅ 測試各種邊界情況（跨地區、單地區、相同傳送點等）
7. ✅ 實作自訂輸出格式功能
8. ✅ 加入語言模板快速切換

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
- [x] 匯出/匯入清單功能