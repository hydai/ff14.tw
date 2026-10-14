/**
 * FF14.tw 首頁腳本
 * 目前只有「最近使用」列：讀 ToolsRegistry.readRecent()（工具頁載入時由 layout-loader 記錄），
 * 有資料才把 index.html 裡預設 hidden 的 #recentTools 顯示出來。只有首頁載入。
 */
const HomePage = {
    /**
     * 依最近使用的工具，在 #recentToolsList 產生連結並顯示 #recentTools。
     * 第一次來、資料毀損、儲存空間不能用時沒有資料，區塊維持隱藏。可以重複呼叫，每次依目前的紀錄重建。
     * @param {Document|HTMLElement} [root] - 查詢範圍，預設整份文件
     */
    renderRecentTools(root = document) {
        const section = root.querySelector('#recentTools');
        const list = root.querySelector('#recentToolsList');
        if (!section || !list) return;

        const tools = window.ToolsRegistry?.readRecent() ?? [];
        list.textContent = '';
        tools.forEach((tool) => list.appendChild(HomePage._createRecentToolLink(tool)));
        section.hidden = tools.length === 0;
    },

    /**
     * 建立一個最近使用的連結：圖示＋名稱。
     * I18nManager 切換語言時會整段覆寫帶 data-i18n 的元素的文字，所以 data-i18n 只放在名稱的 span 上，
     * 圖示是它的兄弟節點，不會被洗掉。沒有載入 i18n 的頁面直接顯示登錄表的 zh 名稱。
     * @param {Object} tool - ToolsRegistry.tools 裡的站內工具
     * @returns {HTMLElement} a.recent-tool
     */
    _createRecentToolLink(tool) {
        const link = document.createElement('a');
        link.className = 'recent-tool';
        link.href = tool.href;

        const icon = document.createElement('span');
        icon.className = 'recent-tool-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = tool.icon;
        link.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'recent-tool-name';
        name.setAttribute('data-i18n', tool.i18nKey);
        name.textContent = window.i18n ? window.i18n.getText(tool.i18nKey) : tool.name;
        link.appendChild(name);

        return link;
    }
};

window.HomePage = HomePage;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HomePage.renderRecentTools());
} else {
    HomePage.renderRecentTools();
}

// 從工具頁按上一頁回到首頁時，瀏覽器可能直接從 bfcache 還原整個頁面，script 不會再跑一次，
// 還原出來的最近使用列是離開前的樣子：看不到剛用過的工具，第一次來的玩家區塊也還是隱藏的。
// 所以還原時（persisted）再畫一次；一般載入也會送 pageshow，但那時剛畫過（persisted 是 false）
window.addEventListener('pageshow', (event) => {
    if (event.persisted) HomePage.renderRecentTools();
});
