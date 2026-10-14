/**
 * FF14.tw 導航欄 DOM 建構器
 * 使用安全的 DOM 操作方法建立導航欄元素
 */
const NavTemplate = {
    /**
     * 建立導航欄 DOM 結構：首頁（桌機用）、工具選單（按鈕＋面板）、首頁（手機抽屜用，排在工具清單之後）、修改紀錄、版權聲明、語言切換器。
     * 兩個首頁同一時間只顯示一個（common.css）。關於與 GitHub 在頁尾。
     * @param {Object} options - 配置選項
     * @param {string} options.basePath - 基礎路徑（預設為 '/'）
     * @param {string} options.toolName - 工具名稱（選填）
     * @param {string} options.toolNameKey - 工具名稱的 i18n key（選填）
     * @param {Array} options.tools - 工具選單列出的工具（預設為 ToolsRegistry.tools，沒有登錄表時是空的）
     * @param {string|null} options.currentToolId - 目前所在的工具 id（選填）；有值時工具按鈕顯示為 active，
     *   面板裡該工具的連結加上 active 與 aria-current="page"
     * @returns {HTMLElement} 導航欄 DOM 元素
     */
    createDOM({ basePath = '/', toolName, toolNameKey, tools = window.ToolsRegistry?.tools ?? [], currentToolId = null } = {}) {
        // 建立容器
        const container = document.createElement('div');
        container.className = 'container';

        // 建立 Logo
        const logo = document.createElement('a');
        logo.href = basePath;
        logo.className = 'logo';

        // 設定 Logo 內容
        if (toolName || toolNameKey) {
            // 工具頁面：FF14.tw | 工具名稱
            logo.appendChild(document.createTextNode('FF14.tw'));

            const separator = document.createElement('span');
            separator.className = 'logo-separator';
            separator.textContent = ' | ';
            logo.appendChild(separator);

            const toolNameSpan = document.createElement('span');
            toolNameSpan.className = 'logo-tool-name';
            if (toolNameKey) {
                toolNameSpan.setAttribute('data-i18n', toolNameKey);
            }
            toolNameSpan.textContent = toolName || '';
            logo.appendChild(toolNameSpan);
        } else {
            // 主頁面：純文字
            logo.textContent = 'FF14.tw';
        }

        container.appendChild(logo);

        // 建立導航欄（id 讓手機選單的 ☰ 以 aria-controls 指向它）
        const nav = document.createElement('nav');
        nav.className = 'nav';
        nav.id = 'site-nav';

        // 站內導航連結：文字與 data-i18n 都在 <a> 上
        const createNavLink = ({ href, i18nKey, text, className }) => {
            const link = document.createElement('a');
            link.href = href;
            if (className) link.className = className;
            link.setAttribute('data-i18n', i18nKey);
            link.textContent = text;
            return link;
        };

        // 順序：首頁（桌機用）、（手機抽屜才顯示的小標、）工具按鈕、工具面板、首頁（抽屜用）、修改紀錄、版權聲明。
        // 首頁有兩個：桌機排在最前面，抽屜排在工具清單之後，同一時間只顯示一個（common.css）。
        // 抽屜不用 CSS order 把清單排到首頁前面：Tab 與螢幕閱讀器照 DOM 順序走，畫面順序必須和 DOM 一致
        nav.appendChild(createNavLink({ href: basePath, i18nKey: 'nav_home', text: '首頁', className: 'nav-desktop-only' }));

        // 小標只在手機抽屜顯示（桌機用下面的按鈕），樣式見 common.css
        const sectionLabel = document.createElement('span');
        sectionLabel.className = 'nav-section-label';
        sectionLabel.setAttribute('data-i18n', 'nav_tools');
        sectionLabel.textContent = '工具';
        nav.appendChild(sectionLabel);

        nav.appendChild(NavTemplate._createToolsToggle(currentToolId));
        nav.appendChild(NavTemplate._createToolsMenu({ basePath, tools, currentToolId }));

        nav.appendChild(createNavLink({ href: basePath, i18nKey: 'nav_home', text: '首頁', className: 'nav-drawer-only' }));
        nav.appendChild(createNavLink({ href: basePath + 'changelog.html', i18nKey: 'nav_changelog', text: '修改紀錄' }));
        nav.appendChild(createNavLink({ href: basePath + 'copyright.html', i18nKey: 'nav_copyright', text: '版權聲明' }));

        // 建立語言切換器
        const languageSwitcher = document.createElement('div');
        languageSwitcher.className = 'language-switcher';

        const languages = [
            { lang: 'zh', text: 'ZH-TW' },
            { lang: 'en', text: 'EN' },
            { lang: 'ja', text: 'JP' }
        ];

        languages.forEach(langConfig => {
            const btn = document.createElement('button');
            btn.className = 'language-btn';
            btn.setAttribute('data-lang', langConfig.lang);
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = langConfig.text;
            languageSwitcher.appendChild(btn);
        });

        nav.appendChild(languageSwitcher);
        container.appendChild(nav);

        return container;
    },

    /**
     * 建立「工具 ▾」按鈕（預設收合）。
     * I18nManager 切換語言時會整段覆寫帶 data-i18n 的元素的 textContent，
     * 所以 data-i18n 放在內層的文字 span，▾ 另外放在 aria-hidden 的 span，不會被洗掉。
     * @param {string|null} currentToolId - 有值時加上 active（和 .nav a.active 同樣式）
     * @returns {HTMLElement} button.nav-tools-toggle
     */
    _createToolsToggle(currentToolId) {
        const toggle = document.createElement('button');
        toggle.setAttribute('type', 'button');
        toggle.className = 'nav-tools-toggle';
        if (currentToolId) {
            toggle.classList.add('active');
        }
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'nav-tools-menu');

        const label = document.createElement('span');
        label.setAttribute('data-i18n', 'nav_tools');
        label.textContent = '工具';
        toggle.appendChild(label);

        const caret = document.createElement('span');
        caret.className = 'nav-tools-caret';
        caret.setAttribute('aria-hidden', 'true');
        caret.textContent = '▾';
        toggle.appendChild(caret);

        return toggle;
    },

    /**
     * 建立工具面板（預設 hidden）：登錄表每個工具一個連結，順序同登錄表。
     * 站內工具的網址是 basePath + href；外部網站開新分頁並標示 ↗。
     * 工具名稱的 data-i18n 只放在名稱 span 上，圖示與 ↗ 是它的兄弟節點，切換語言時不會被覆寫。
     * @param {Object} options
     * @param {string} options.basePath - 基礎路徑
     * @param {Array} options.tools - 工具清單（ToolsRegistry.tools 的格式）
     * @param {string|null} options.currentToolId - 目前所在的工具 id
     * @returns {HTMLElement} div#nav-tools-menu.tools-menu
     */
    _createToolsMenu({ basePath, tools, currentToolId }) {
        const menu = document.createElement('div');
        menu.id = 'nav-tools-menu';
        menu.className = 'tools-menu';
        menu.hidden = true;

        tools.forEach(tool => {
            const link = document.createElement('a');
            link.className = 'tools-menu-link';
            link.href = tool.external ? tool.href : basePath + tool.href;

            const icon = document.createElement('span');
            icon.className = 'tools-menu-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = tool.icon;
            link.appendChild(icon);

            const name = document.createElement('span');
            name.className = 'tools-menu-name';
            name.setAttribute('data-i18n', tool.i18nKey);
            name.textContent = tool.name;
            link.appendChild(name);

            if (tool.external) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';

                const mark = document.createElement('span');
                mark.className = 'tools-menu-ext';
                mark.setAttribute('aria-hidden', 'true');
                mark.textContent = '↗';
                link.appendChild(mark);
            }

            if (tool.id === currentToolId) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'page');
            }

            menu.appendChild(link);
        });

        return menu;
    },

    /**
     * 讓「工具 ▾」按鈕與面板動起來；頁首換進文件後呼叫一次（LayoutLoader._loadHeader）。
     * - 點按鈕切換開關；開關時同步面板的 hidden 與按鈕的 aria-expanded
     * - 開啟中按 Escape：關閉、把焦點還給按鈕、preventDefault
     * - 開啟中點按鈕與面板以外的地方（document 的 pointerdown、click，捕獲階段，不受別的元件 stopPropagation() 影響）：關閉，不動焦點
     * - 按鈕或面板觸發 focusout，而焦點移到兩者以外的元素（Tab 移出）：關閉
     * - 從往返快取（bfcache）還原頁面（window 的 pageshow，persisted 為 true）：關閉；焦點原本在面板裡就還給按鈕，不在就不動
     * - 點了會開新分頁的連結（target="_blank"，水晶商城清單）：關閉；焦點原本在面板裡就還給按鈕，不在就不動
     * - 視窗縮到手機寬度（matchMedia('(max-width: 768px)') 變成符合，例如平板轉直）：關閉；這裡不動焦點，
     *   焦點在導覽列裡時由 common.js 的 initHamburgerMenu 移到 ☰（手機上這顆按鈕不顯示）
     * 面板不是對話框：不鎖焦點、不鎖捲動。
     * 手機（≤768px）抽屜裡的工具清單永遠展開、按鈕不顯示；進入手機寬度時面板先收合，之後也沒有東西能把它開啟，所以這些監聽器在手機上不會動作。
     * @param {HTMLElement} root - 含有按鈕與面板的元素（通常是 header.header）
     * @returns {{open: Function, close: Function, isOpen: Function}|null} 找不到按鈕或面板時回傳 null
     */
    initToolsMenu(root) {
        const toggle = root.querySelector('.nav-tools-toggle');
        const menu = root.querySelector('.tools-menu');
        if (!toggle || !menu) return null;

        const isOpen = () => !menu.hidden;
        const isInside = node => toggle.contains(node) || menu.contains(node);

        const open = () => {
            menu.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');
        };

        const close = ({ restoreFocus = false } = {}) => {
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            if (restoreFocus) toggle.focus();
        };

        toggle.addEventListener('click', () => {
            if (isOpen()) {
                close();
            } else {
                open();
            }
        });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !isOpen()) return;
            event.preventDefault();
            close({ restoreFocus: true });
        });

        // 點按鈕與面板以外的地方：關閉（不還焦點，只有 Escape 才把焦點還給按鈕）。
        // 在 document 的捕獲階段監聽，而且 pointerdown 與 click 都聽：頁面上別的元件可能在自己的處理器裡呼叫
        // stopPropagation()（例如寶圖搜尋器的摺疊標題），冒泡階段的 document 監聽器就收不到事件，面板會一直開著；
        // 捕獲階段先於任何目標與祖先的處理器執行，不受影響。pointerdown 讓滑鼠、觸控、觸控筆在按下的當下就關閉，
        // click 補上沒有 pointer 事件的情況（例如鍵盤觸發）。按鈕與面板內的按壓要排除：按鈕自己的 click 由上面的處理器切換開關
        const closeOnOutsidePress = event => {
            if (isOpen() && !isInside(event.target)) close();
        };
        document.addEventListener('pointerdown', closeOnOutsidePress, { capture: true });
        document.addEventListener('click', closeOnOutsidePress, { capture: true });

        // relatedTarget 是 null（視窗失焦、點到不能聚焦的地方）不算移出，交給上面的 pointerdown／click：
        // 它們在捕獲階段執行，不會被別的元件的 stopPropagation() 擋住。
        // 若把 null 也當成移出，Safari 點按鈕不會聚焦，面板裡有焦點時點按鈕會先因 focusout 關閉、再因 click 重新開啟
        const handleFocusOut = event => {
            const next = event.relatedTarget;
            if (isOpen() && next && !isInside(next)) close();
        };
        toggle.addEventListener('focusout', handleFocusOut);
        menu.addEventListener('focusout', handleFocusOut);

        // 在面板裡選了工具再按 Back：瀏覽器可能從往返快取（bfcache）原封不動地還原頁面，面板還開著，
        // 焦點也可能還在剛才選的連結上。每次載入頁面都會有 pageshow，只有 persisted 為 true 才是還原。
        // 焦點在面板裡就和 Escape 一樣還給按鈕：面板收合後那個連結看不到，焦點留在上面會掉回頁面最上面；
        // 焦點不在面板裡（例如 Safari 點連結不會讓連結取得焦點）就不動
        window.addEventListener('pageshow', event => {
            if (event.persisted && isOpen()) close({ restoreFocus: menu.contains(document.activeElement) });
        });

        // 選了會開新分頁的連結（水晶商城清單，target="_blank"）：這一頁不會卸載，面板要自己收合，否則切回這個分頁時它還開著。
        // 焦點在面板裡就和 Escape 一樣還給按鈕（連結收合後看不到），不在就不動。站內連結不處理：這一頁會被換掉，
        // 從往返快取回來時由上面的 pageshow 收合；按著 Ctrl／⌘ 把站內工具開到背景分頁時面板留著，方便接著開別的工具
        menu.querySelectorAll('a[target="_blank"]').forEach(link => {
            link.addEventListener('click', () => {
                if (isOpen()) close({ restoreFocus: menu.contains(document.activeElement) });
            });
        });

        // 開著面板把視窗縮到手機寬度（或平板轉直）：手機上按鈕不顯示、清單在抽屜裡永遠展開（common.css 覆寫了 [hidden]），
        // 面板若不收合，回到桌機時會帶著 hidden=false 與 aria-expanded="true" 自己重新出現。
        // 斷點與 common.css 的 @media (max-width: 768px) 一致。這裡不動焦點：手機上按鈕不顯示，
        // 焦點在導覽列裡時由 common.js 的 initHamburgerMenu 移到 ☰（它管抽屜與 ☰，回到桌機時也由它把焦點移回來）
        const mobileQuery = window.matchMedia?.('(max-width: 768px)');
        mobileQuery?.addEventListener('change', event => {
            if (event.matches && isOpen()) close();
        });

        return { open, close, isOpen };
    }
};

// 匯出給其他模組使用
window.NavTemplate = NavTemplate;
