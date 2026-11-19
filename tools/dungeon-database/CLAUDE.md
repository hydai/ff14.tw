# 副本資料庫（tools/dungeon-database/）

這裡只記讀程式碼看不出來的原因與陷阱；資料的寫法見同一個目錄的 `README.md`。

- 資料：`data/dungeons.json` 803 筆，用 `visible: false` 藏起 441 筆、顯示中 362 筆（編號 1～362）。藏起來的有 278 筆是為了精簡列表藏的（機制與簡介只有「待補充」的 268 筆、只有另一種固定範本句的 8 筆、重複的 2 筆）：補好資料把 `visible` 改回 `true` 就會顯示，沒寫 `visible` 的也算顯示。資料檔自己的 `metadata.totalDungeons` 寫 804，是本來就有的落差。
- 類型、版本名稱、機制、簡介與掉落物是資料，三種語言都顯示中文。用語照官方：類型是「聯盟任務」，3.x 是「蒼天之禁城」（舊用語已拿掉，`tests/dungeon-data.test.js` 會擋）。
- 搜尋框沒打字時用 `#searchInput:placeholder-shown::-webkit-search-cancel-button { display: none; }` 拿掉清除鈕：`type=search` 的搜尋框在 Chrome 沒打字時也替清除鈕預留約 16.5px，提示字能用的寬度少一截。提示字三語的用詞一致比放得進 320 寬重要。只在 macOS 的 Chrome 量過（390 寬三語都完整，320 寬日文最後的「プ」被切約 3.6px），Safari、Firefox 沒量過。
- 電腦版面用 flex 的 `order` 把筆數排在篩選面板後面：DOM 的順序仍是搜尋框、筆數、按鈕、面板，換位置的只有不能互動的筆數，Tab 順序不變。
- 找不到時筆數換成和標題同一句並加 `visually-hidden`：畫面上不重複寫「找到 0 個副本」，螢幕閱讀器照樣念（`#noResults` 本身不是 live region）。
