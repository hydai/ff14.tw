/**
 * FF14.tw 404 頁腳本
 * 在 404.html 的 #notFoundTools 依登錄表（ToolsRegistry.tools）的順序列出全部工具。
 * GitHub Pages 會在任何不存在的網址顯示這一頁（網址可能有好幾層），所以站內連結一律用根目錄絕對路徑。
 * 只有 404.html 載入。
 */
const NotFoundPage = {
    /**
     * 依登錄表在 #notFoundTools 產生每個工具的連結。可以重複呼叫，每次重建。
     * 找不到 #notFoundTools 或沒有載入登錄表時什麼都不做（不丟例外）。
     * 「或直接選一個工具」區塊（section.not-found-tools）在 404.html 預設 hidden：關掉 JavaScript 時清單不會產生，
     * 不能在空的清單上面留一個孤零零的標題。至少畫出一個工具才把它顯示出來。
     * @param {Document|HTMLElement} [root] - 查詢範圍，預設整份文件
     */
    renderToolList(root = document) {
        const list = root.querySelector('#notFoundTools');
        const tools = window.ToolsRegistry?.tools;
        if (!list || !tools) return;

        list.textContent = '';
        tools.forEach((tool) => list.appendChild(NotFoundPage._createToolLink(tool)));

        const section = root.querySelector('.not-found-tools');
        if (section) section.hidden = tools.length === 0;
    },

    /**
     * 建立一個工具連結：圖示＋名稱（外部網站再加 ↗）。
     * I18nManager 切換語言時會整段覆寫帶 data-i18n 的元素的文字，所以 data-i18n 只放在名稱的 span 上，
     * 圖示與 ↗ 是它的兄弟節點，不會被洗掉。沒有載入 i18n 的頁面直接顯示登錄表的 zh 名稱。
     * @param {Object} tool - ToolsRegistry.tools 裡的工具
     * @returns {HTMLElement} a.not-found-tool
     */
    _createToolLink(tool) {
        const link = document.createElement('a');
        link.className = 'not-found-tool';
        if (tool.external) {
            // 外部網站：用原網址，開新分頁
            link.href = tool.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        } else {
            // 站內工具：登錄表的 href 相對於網站根目錄，這一頁的網址有幾層都不知道，所以補上開頭的斜線
            link.href = '/' + tool.href;
        }

        const icon = document.createElement('span');
        icon.className = 'not-found-tool-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = tool.icon;
        link.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'not-found-tool-name';
        name.setAttribute('data-i18n', tool.i18nKey);
        name.textContent = window.i18n ? window.i18n.getText(tool.i18nKey) : tool.name;
        link.appendChild(name);

        if (tool.external) {
            const mark = document.createElement('span');
            mark.className = 'not-found-tool-ext';
            mark.setAttribute('aria-hidden', 'true');
            mark.textContent = '↗';
            link.appendChild(mark);
        }

        return link;
    }
};

window.NotFoundPage = NotFoundPage;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NotFoundPage.renderToolList());
} else {
    NotFoundPage.renderToolList();
}
