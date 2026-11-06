/**
 * FF14.tw 修改紀錄頁腳本
 * 做兩件事：
 * 1. 在每個可以展開的版本（details.changelog-entry）那一行的最後，寫上這一版有幾條（「10 條」「10 items」「10 件」），切換語言時跟著換。
 * 2. 網址的 # 指到某一版時，把它展開並捲到它（載入時與 hashchange）。
 * 只有一條的舊版本是不能展開的單行（div.changelog-entry-single）：不寫條數，# 指到它時也由瀏覽器自己捲過去。
 * 只有 changelog.html 載入。
 */
const ChangelogPage = {
    /**
     * 在每個 details.changelog-entry 的 .changelog-meta 最後放一個 span.changelog-count，文字是這一版 .changelog-items 裡的條數。
     * 可以重複呼叫：已經有的就更新文字，不會疊加。沒有載入 i18n 時寫中文；取到的範本沒有 {count} 時也寫中文：
     * 部署後有一小段空窗，可能拿到新的 HTML 配舊的翻譯檔，getText 找不到鍵就回傳鍵名本身，每一列會寫成「changelog_item_count」。
     * 最新一版也畫（展開時 CSS 把它藏起來，收起來時它留在色帶裡），所以發新版、上一版降級時不用再動這支腳本。
     * 條數是算出來的，span 不能帶 data-i18n：I18nManager 切換語言時會整段覆寫那種元素的文字，所以由 init() 登記的語言變更回呼重畫。
     * 「{count}」在這裡自己換掉，不呼叫 getText(key, params)：那會用到 common.js 的 FF14Utils，這支腳本只靠 i18n-manager.js。
     * @param {Document|HTMLElement} [root] - 查詢範圍，預設整份文件
     */
    renderCounts(root = document) {
        const fallback = '{count} 條';
        let template = window.i18n ? window.i18n.getText('changelog_item_count') : fallback;
        if (!template.includes('{count}')) template = fallback;
        root.querySelectorAll('details.changelog-entry').forEach((entry) => {
            const meta = entry.querySelector('summary > .changelog-meta');
            if (!meta) return;

            let count = meta.querySelector('.changelog-count');
            if (!count) {
                count = document.createElement('span');
                count.className = 'changelog-count';
                meta.appendChild(count);
            }
            count.textContent = template.replace('{count}', String(entry.querySelectorAll('.changelog-items > li').length));
        });
    },

    /**
     * 網址的 # 指到一個 details.changelog-entry 時，把它展開並捲到它。
     * 其他情況什麼都不做，也不丟例外：# 是空的、編碼壞掉（例如 #%）、沒有這個 id、指到只有一條的單行版本（不能展開，瀏覽器自己會捲過去）、
     * 指到的元素不是一個版本。已經展開的版本維持展開；展開別的版本不會收起這一個。
     */
    openFromHash() {
        let id;
        try {
            id = decodeURIComponent(window.location.hash.slice(1));
        } catch {
            return; // 編碼壞掉的 # 不是任何一版的 id
        }

        const entry = id ? document.getElementById(id) : null;
        if (!entry || !entry.matches('details.changelog-entry')) return;
        entry.setAttribute('open', '');
        entry.scrollIntoView();
    },

    /** 畫「N 條」、展開網址指到的版本，並登記 hashchange 與語言變更 */
    init() {
        ChangelogPage.renderCounts();
        ChangelogPage.openFromHash();
        window.addEventListener('hashchange', () => ChangelogPage.openFromHash());
        // 回呼會收到新語言的代碼，不能直接把 renderCounts 交給它（第一個參數是查詢範圍）
        if (window.i18n) window.i18n.onLanguageChange(() => ChangelogPage.renderCounts());
    }
};

window.ChangelogPage = ChangelogPage;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ChangelogPage.init());
} else {
    ChangelogPage.init();
}
