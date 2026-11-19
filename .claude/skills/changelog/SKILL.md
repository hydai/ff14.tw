---
name: changelog
description: 在 ff14.tw 的 changelog.html 加新版本或改修改紀錄時用（發新版、GitCommit 前先更新修改紀錄）：月份區塊、三種寫法、四種標籤、id 與日期的規則。Use when adding or editing a version entry in changelog.html.
---

# 修改紀錄怎麼寫

CLAUDE.md 的修改與玩家無關，不寫進修改紀錄。

`changelog.html` 照月份分段：一個月一個 `<section class="changelog-month">`，**裡面只放月份標題（`<h2 class="changelog-month-title">YYYY年M月</h2>`）和這個月的版本**，不要加段落或其他元素；同一個月的收合列靠兄弟選擇器（`.changelog-month-title + .changelog-entry`、`.changelog-entry.is-latest + .changelog-entry`、`.changelog-entry:last-child`）接成一張圓角清單，多一個元素圓角就會跑掉。版本由新到舊，照日期排、不照版本號（v2.12.0 比 v2.11.1 早，不重新編號）。每一版有三種寫法：

```html
<!-- 最新一版（不論幾條都用這個寫法） -->
<details class="changelog-entry is-latest" id="version-v2270" open>
    <summary>
        <span class="changelog-meta">
            <time class="changelog-date" datetime="2026-11-07">11月7日</time>
            <span class="changelog-version">v2.27.0</span>
            <span class="changelog-latest" data-i18n="changelog_latest">最新</span>
        </span>
        <span class="changelog-headline">一句標題</span>
    </summary>
    <ul class="changelog-items">
        <li><span class="tag tag-info">改善</span> 條目</li>
    </ul>
</details>

<!-- 其他兩條以上的版本：同上，但沒有 is-latest、open 和「最新」 -->

<!-- 只有一條的舊版本：不能展開，沒有標題 -->
<div class="changelog-entry changelog-entry-single" id="version-v2114">
    <span class="changelog-meta">
        <time class="changelog-date" datetime="2026-03-29">3月29日</time>
        <span class="changelog-version">v2.11.4</span>
    </span>
    <p class="changelog-single-item"><span class="tag tag-warning">修正</span> 條目</p>
</div>
```

**發新版的兩個步驟：**
1. 在最上面的月份區塊最前面（新的月份就先加 `<section>` 與月份標題）加一個 `is-latest`、`open`、有「最新」的 `<details>`，寫日期、版本、一句標題和條目。
2. 上一版拿掉 `is-latest`、`open` 和「最新」那個 `<span>`；如果它只有一條，改成只有一條的寫法（拿掉標題）。

- 標籤只有四種：`tag tag-success` 新增、`tag tag-info` 改善、`tag tag-warning` 修正，以及 `tag tag-outline-primary` 里程碑（只有最舊的兩條用，新的條目不用）。不要再寫優化、調整、改進、資訊。
- 最新一版一定要有一句標題（不論幾條）；兩條以上的版本也都要有；只有一條的舊版本不要有，那一條直接寫出來。
- 標題與條目是寫給玩家看的：收起來時玩家只看得到標題，所以用玩家看得懂的說法寫「改了什麼、有什麼不同」，不寫開發者用語（例如「事件監聽器記憶體洩漏」）。條目與標題只有中文，不翻譯；頁面上固定的字才用 `data-i18n`。
- id 是 `version-` 加上版本文字去掉 `[A-Za-z0-9_]` 以外的字元（`v2.26.0` → `version-v2260`、`v2.5.0 - v2.5.2` → `version-v250v252`；「專案啟動」是 `version-start`），以前分享出去的連結才找得到。日期寫 `<time class="changelog-date" datetime="YYYY-MM-DD">M月D日</time>`（月、日不補零），而且要落在它所在的月份區塊。
- 「N 條」不手寫：`assets/js/changelog.js` 載入時把條數接在每個 `<details>` 版本的 `.changelog-meta` 最後（`span.changelog-count`，最新一版展開時由 CSS 藏起來，收起來時留在色帶裡），也負責網址 `#` 指到收起來的版本時把它展開。
- 發新版寫錯的地方，`tests/changelog-page.test.js` 會擋下來：只有第一版有 `is-latest`、`open` 和「最新」，月份區塊裡只放月份標題和版本，每一版的標題、id、日期（含所在的月份區塊）與標籤。
