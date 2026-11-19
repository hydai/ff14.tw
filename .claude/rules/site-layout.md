---
paths:
  - "assets/js/components/**"
  - "assets/js/common.js"
  - "assets/css/common.css"
  - "assets/js/i18n/translations/common.js"
---

# 頁首、主題鈕與頁尾

讀程式碼看不出來的原因與陷阱：

- 「工具 ▾」的面板不是對話框：不困住焦點、不鎖捲動。
- 手機的抽屜（≤ 768px）畫面上的順序、Tab 的順序與螢幕閱讀器念的順序都跟著 DOM：抽屜的「首頁」是工具清單後面的第二個連結（`.nav-drawer-only`；頁首的第一個「首頁」是 `.nav-desktop-only`，在抽屜裡藏起來），不要用 CSS 的 `order` 重排抽屜。
- 視窗跨過 768px 時把會不見的焦點搬走：進抽屜版面時，頁首導覽裡的焦點移到 ☰；回到電腦版面時，☰ 或抽屜工具連結上的焦點移到「工具 ▾」，抽屜「首頁」上的移到電腦版的「首頁」。這要在 `initHamburgerMenu()` 的 `matchMedia` change 監聽裡做：它在瀏覽器把剛藏起來的元素的焦點拿掉之前觸發，250ms 防抖的 resize 重置已經太晚。
- 主題鈕由 `common.js` 的 `initThemeToggle()` 只建立一次，放在 ☰ 前面、由 CSS 定位，跨過 768px 不搬動。三段模式（跟著系統、淺色、深色）照 `ThemeManager.nextMode()` 的循環，第一下一定會改變畫面；圖示代表現在的狀態，不是下一下會變成什麼；`localStorage['theme']` 只存 `light` 或 `dark`，選跟著系統時刪掉這個鍵，沒有、壞掉或讀不到都當成跟著系統。
- 頁尾的 `FINAL FANTASY XIV © SQUARE ENIX` 是 SQUARE ENIX 素材使用規範要的 `© SQUARE ENIX` 標示（前面的 `FINAL FANTASY XIV` 照繁中官網）：三語都一樣、沒有 `data-i18n`，切換語言時不改它。免責聲明的公司名稱與後半句是 `span.footer-nowrap`：手機上不會把「Square Enix」拆開，日文不會把「係」單獨留在一行。
- 頁尾外部連結的 ↗ 放在另外的 `span.external-mark`，`data-i18n` 放在裡面的 `span` 上，切換語言才不會把 ↗ 洗掉。
