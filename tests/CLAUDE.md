# tests/

這裡只記寫測試時容易踩的地方；每支測試涵蓋什麼，讀測試檔本身。

- 頁面測試不用 jsdom：`tests/helpers/fake-dom.js` 是最小的 DOM 替身，在 vm 裡執行真正的瀏覽器腳本。各工具的頁面替身（`tests/helpers/*-page.js`）照 `index.html` 建出元素、依 `index.html` 的 `<script src>` 順序載入真正的腳本、取字自真正的翻譯檔。新工具的頁面測試照現有的替身寫。
- 比較 DOM 元素一律用 `isSame`（`===` 加訊息），不要用 `assert.equal`：失敗時它會展開整份 fake-dom，卡住而不報錯。
- `fake-dom.js` 和真的瀏覽器不一樣的地方，替身沒補上的話測試會照樣通過：
  - `querySelectorAll()`、`.children` 回傳一般的陣列；瀏覽器是 NodeList／HTMLCollection，沒有 `map`、`filter`、`find`（`card-page.js` 另外補了這個替身）。
  - 看不出 `[hidden]` 被共用樣式的 `display` 蓋過，所以頁面測試另外檢查 `style.css` 有 `#id[hidden] { display: none; }`。
  - 元素藏起來時焦點照樣留著；瀏覽器會掉到 `body`。只在 `macro-page.js` 補上（沒有動共用的 `fake-dom.js`），不然「焦點回到某個元素」的測試永遠不會失敗。
  - 沒有版面：寬、高、位置要用瀏覽器量。
- 頁面在 console 留下的任何東西（log、warn、error），頁面替身都記在 `consoleErrors` 而不印出來，期待它是空的測試才擋得住多出來的除錯訊息。
- Lodestone 的假回應（`tests/helpers/lodestone-fixtures.js`）不放真實玩家的資料：人名、部隊名稱、ID 與頭像網址都是假的。
