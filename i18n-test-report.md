# FF14.tw i18n HTML 渲染問題測試報告

## 測試概要
- **測試日期**: 2025-08-16
- **測試範圍**: 所有 8 個工具及主要頁面的 i18n 介面
- **測試重點**: HTML tag 渲染問題
- **測試方法**: 使用 Playwright 自動化測試

## 發現的問題

### 🔴 嚴重問題

#### 1. HTML 標籤直接顯示為文字
**影響頁面**:
- copyright.html (版權聲明頁面)
- dungeon-database/index.html (副本資料庫)

**問題詳情**:
使用 `data-i18n-html` 屬性的元素，其 HTML 標籤沒有被正確渲染，而是直接顯示為純文字。

**實際顯示範例**:
```
<span class="highlight">Final Fantasy XIV</span> is produced by <strong>SQUARE ENIX</strong>.
```

**預期顯示**:
Final Fantasy XIV is produced by **SQUARE ENIX**.

**問題根源**: 
- i18n.js 第 297-299 行，在某些情況下使用了 `textContent` 而非正確的 DOM 操作
- 當翻譯文字包含 HTML 時，沒有正確處理

#### 2. Timed Gathering 工具缺少翻譯檔案
**影響頁面**: tools/timed-gathering/index.html

**錯誤訊息**:
```
TypeError: Cannot read properties of undefined (reading 'pageTitle')
TypeError: Cannot read properties of undefined (reading 'defaultListName')
TypeError: Cannot read properties of undefined (reading 'initFailedError')
```

**問題根源**: 
- 缺少 `/assets/i18n/tools/timed-gathering.json` 翻譯檔案
- 使用了 `data-i18n-html` 但沒有對應的翻譯內容

### ⚠️ 中等問題

#### 3. 職業名稱未翻譯
**影響頁面**: tools/character-card/index.html

**問題詳情**:
切換語言時，職業名稱（如「騎士」、「戰士」等）保持中文，未根據語言切換進行翻譯。

## 問題位置詳細分析

### data-i18n-html 使用位置
1. **copyright.html**: 
   - 6 處使用 (line 214-233, 248)
   - 包含 `<span>`, `<strong>`, `<a>` 標籤

2. **about.html**:
   - 1 處使用 (line 268)
   - 包含 `<a>` 連結

3. **dungeon-database/index.html**:
   - 1 處使用 (line 116)
   - 包含 `<a>` 連結

4. **treasure-map-finder/index.html**:
   - 資料來源描述使用 HTML
   - 實際測試中正確渲染（可能使用不同方法）

5. **timed-gathering/index.html**:
   - 8 處使用 (line 83-189)
   - 主要用於按鈕元素

## 修復建議

### 1. 修復 i18n.js HTML 處理邏輯
**位置**: `/assets/js/i18n.js:276-308`

**建議修改**:
```javascript
// 修復 data-i18n-html 的處理
document.querySelectorAll('[data-i18n-html]').forEach(element => {
    const key = element.dataset.i18nHtml;
    const text = this.t(key);
    
    // 確保正確渲染 HTML
    if (text && text.includes('<')) {
        // 使用 innerHTML 而非 textContent
        element.innerHTML = text;
    } else {
        element.textContent = text;
    }
});
```

### 2. 創建缺失的翻譯檔案
**需要創建**: `/assets/i18n/tools/timed-gathering.json`

包含所需的翻譯鍵值：
- pageTitle
- defaultListName
- initFailedError
- 按鈕文字翻譯

### 3. 實作職業名稱翻譯
為 character-card 工具添加職業名稱的多語言支援。

## 測試截圖
- `dungeon-database-test.png`: 副本資料庫 HTML 渲染問題
- `copyright-html-rendering-issue.png`: 版權聲明頁面 HTML 標籤顯示問題

## 總結
主要問題集中在 `data-i18n-html` 的處理邏輯上，需要修復 i18n.js 中的 HTML 渲染邏輯，並為 Timed Gathering 工具創建缺失的翻譯檔案。這些問題影響了用戶體驗，特別是在切換語言時會看到未渲染的 HTML 標籤。

## 優先級建議
1. **高優先級**: 修復 i18n.js 的 HTML 渲染邏輯
2. **高優先級**: 創建 timed-gathering.json 翻譯檔案
3. **中優先級**: 實作職業名稱多語言支援