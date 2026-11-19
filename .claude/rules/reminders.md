---
paths:
  - "assets/js/reminder-scheduler.js"
  - "tools/weather-forecast/**"
  - "tools/timed-gathering/**"
---

# 提醒（assets/js/reminder-scheduler.js）

`ReminderScheduler` 不認識任何工具，天氣預報與特殊採集時間管理器共用（到期判斷、已提醒的紀錄、跨分頁的鎖、頁內提示、提示音與系統通知）。頁面要開著才會響。讀程式碼看不出來的原因與陷阱：

- Android 的 Chrome：通知權限已經允許，`new Notification()` 照樣丟錯，要當成不支援（只剩頁內提示與聲音）。詢問被關掉時權限一直是 `default`，所以每按一次「提醒我」都再問一次；只有權限是 `default` 才真的去問。
- `AudioContext` 在頁面上有點擊或按鍵之前是暫停的：重新整理後還原的提醒，要等頁面上的點擊或按鍵才解開提示音；還在暫停時這次不排聲音。
- 兩個分頁同一次只響一次：有 `navigator.locks` 時先用 `notifiedKey|id` 要鎖，拿到才提醒並再握住 5 秒，兩個分頁在寫回之前都讀到「還沒提醒」時也只響一次；要鎖被拒絕時只靠 `localStorage` 的紀錄（每一次各存一個項目，名字是 `notifiedKey|id`，兩個分頁同時記下不同的兩次也不會互相蓋掉）。拿到鎖或被拒絕時照現在的提醒與時間重新確認還到期：等的時候改了提早分鐘數、換了目標、取消或那一段已經結束，就不響也不記。
