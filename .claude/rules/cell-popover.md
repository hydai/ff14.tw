---
paths:
  - "assets/js/cell-popover.js"
  - "assets/css/tools-common.css"
  - "tools/mini-cactpot/**"
  - "tools/faux-hollows-foxes/**"
---

# 格子旁的小選單 CellPopover（assets/js/cell-popover.js）

用法看 `cell-popover.js`（`open(cell, options, { onSelect, label, placement, focusFirst })`、`close({ returnFocus })`、`isOpen`、`anchor`，以及不靠 `this` 的純函式 `CellPopover.place()`）。它不認識任何工具：選項寫什麼字、哪些不能選、選了之後做什麼都由呼叫端決定。仙人微彩與宗長計算機使用。容易踩的地方：

- 不是對話框：不鎖捲動、不困住焦點、不設 `inert`、沒有 `aria-modal`（選單是 `role="group"`，打開的那一格有 `aria-expanded`）。整個視窗失去焦點（例如切到遊戲）不算移出，選單照樣開著。
- `board` 要 `position: relative`（選單掛在裡面），而且不要有邊框（位置照 border-box 算）；外層的 `.card` 預設 `overflow: hidden`，要改成 `visible`，不然開在格子下方的選單會被切掉。
- 不要在 `onSelect` 裡同步再呼叫 `open()`：同一次點擊還會冒泡到 `document`，剛打開的選單會被當成點在外面而關掉。
- Safari 與 macOS 的 Firefox 點按鈕不給焦點：選單上的 `mousedown` 要 `preventDefault()`，不然選單會在 click 之前被 focusout 關掉；被點的那一格沒有焦點可以失去，不會因此關掉，按鍵該對哪一格由呼叫端自己處理。點外面同時聽 `click` 與 `pointerdown`：iPhone Safari 點非互動元素時不送 click。
- 視窗大小改變（手機轉向、視窗變窄或變寬）時照那一格的新位置重新放好，`resize` 只在開著時登記。重新放之前先拿掉舊的位置再量選單：absolute 的選單離左邊越遠、能用的寬度越窄，選項的字長時會量到比打開時窄的寬度。
