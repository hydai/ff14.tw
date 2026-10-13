const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createFakeDom } = require('./helpers/fake-dom.js');
// 期望值直接取自登錄表檔案本身（Node 端 require），不是 vm 裡那一份，所以不會有跨 realm 的 deepEqual 問題
const ToolsRegistry = require('../assets/js/components/tools-registry.js');

const ROOT = path.join(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

// 在最小 DOM 替身裡載入真正的 tools-registry.js 與 nav-template.js（等同 <script src>，順序同真實頁面），
// 把 createDOM() 的結果放進 header.header 並掛到 body。不載入 i18n，所以選單顯示的是程式碼裡的 zh 名稱。
// 每個測試都建立自己的 dom：initToolsMenu 會在 document 上註冊監聽器，共用的話會互相疊加
function setupHeader(createOptions = {}) {
    const dom = createFakeDom();
    dom.load('assets/js/components/tools-registry.js');
    dom.load('assets/js/components/nav-template.js');
    const { NavTemplate } = dom.window;
    const header = dom.el('header', { class: 'header' }, NavTemplate.createDOM(createOptions));
    dom.document.body.appendChild(header);
    return {
        dom,
        NavTemplate,
        header,
        nav: header.querySelector('nav.nav'),
        toggle: header.querySelector('button.nav-tools-toggle'),
        menu: header.querySelector('div.tools-menu'),
        links: header.querySelectorAll('a.tools-menu-link')
    };
}

test('導覽列依序是首頁、工具、修改紀錄、版權聲明，不再有關於與 GitHub', () => {
    const { nav } = setupHeader({ basePath: '../../' });

    // 導覽列的直屬子節點：桌機用的首頁、只在手機抽屜顯示的小標、工具按鈕、工具面板、抽屜用的首頁、修改紀錄、版權聲明、語言切換器。
    // 抽屜（≤768px）裡桌機用的首頁與工具按鈕不顯示（common.css），抽屜的畫面順序就是剩下的 DOM 順序：
    // 小標、工具清單、首頁、修改紀錄、版權聲明、語言切換器。不靠 CSS order 排，畫面、Tab 與螢幕閱讀器的順序才會一致
    const describe = (element) => [element.tagName.toLowerCase(), ...element.className.split(/\s+/).filter(Boolean)].join('.');
    assert.deepEqual(
        nav.children.map(describe),
        ['a.nav-desktop-only', 'span.nav-section-label', 'button.nav-tools-toggle', 'div.tools-menu', 'a.nav-drawer-only', 'a', 'a', 'div.language-switcher']
    );
    assert.equal(nav.getAttribute('id'), 'site-nav', '手機選單的 ☰ 以 aria-controls 指向它');

    // 桌機的導覽項目（直屬的 a 與工具按鈕，去掉抽屜用的首頁）依 DOM 順序的 data-i18n 鍵。工具按鈕的鍵在內層 span 上；
    // 面板裡的 13 個工具連結也是 a，但不是直屬子節點，不算在內
    const items = nav.children.filter((element) => element.tagName === 'A' || element.classList.contains('nav-tools-toggle'));
    const keyOf = (element) => element.getAttribute('data-i18n') ?? element.querySelector('[data-i18n]').getAttribute('data-i18n');
    assert.deepEqual(
        items.filter((element) => !element.classList.contains('nav-drawer-only')).map(keyOf),
        ['nav_home', 'nav_tools', 'nav_changelog', 'nav_copyright']
    );
    assert.equal(nav.querySelector('[data-i18n="nav_about"]'), null, '關於已經移到頁尾');
    assert.equal(nav.querySelector('[data-i18n="nav_github"]'), null, 'GitHub 已經移到頁尾');

    const [homeDesktop, , , , homeDrawer, changelog, copyright] = nav.children;
    const links = [homeDesktop, homeDrawer, changelog, copyright];
    assert.deepEqual(links.map((link) => link.getAttribute('href')), ['../../', '../../', '../../changelog.html', '../../copyright.html']);
    assert.deepEqual(links.map((link) => link.textContent), ['首頁', '首頁', '修改紀錄', '版權聲明']);
    assert.deepEqual(links.map((link) => link.getAttribute('data-i18n')), ['nav_home', 'nav_home', 'nav_changelog', 'nav_copyright']);

    const sectionLabel = nav.querySelector('span.nav-section-label');
    assert.equal(sectionLabel.getAttribute('data-i18n'), 'nav_tools');
    assert.equal(sectionLabel.textContent, '工具');

    assert.deepEqual(
        nav.querySelectorAll('.language-switcher .language-btn').map((button) => button.getAttribute('data-lang')),
        ['zh', 'en', 'ja']
    );
});

test('工具按鈕預設收合，面板依登錄表列出 13 個工具，沒有 i18n 時顯示 zh 名稱', () => {
    const { dom, toggle, menu, links } = setupHeader({ basePath: '../../' });
    assert.equal(dom.window.i18n, undefined);

    assert.ok(toggle, '導覽列缺少 button.nav-tools-toggle');
    assert.equal(toggle.getAttribute('type'), 'button');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.getAttribute('aria-controls'), 'nav-tools-menu');
    assert.ok(menu, '導覽列缺少 div.tools-menu');
    assert.equal(menu.getAttribute('id'), 'nav-tools-menu');
    assert.equal(menu.hidden, true);

    // I18nManager 切換語言時會整段覆寫帶 data-i18n 的元素的 textContent：
    // data-i18n 不能放在 <button> 本身，▾ 也不能在帶 data-i18n 的 span 裡面，否則切換語言後 ▾ 會消失
    assert.ok(!toggle.hasAttribute('data-i18n'));
    const label = toggle.querySelector('span[data-i18n]');
    assert.equal(label.getAttribute('data-i18n'), 'nav_tools');
    assert.equal(label.textContent, '工具');
    const caret = toggle.querySelector('span.nav-tools-caret');
    assert.equal(caret.getAttribute('aria-hidden'), 'true');
    assert.equal(caret.textContent, '▾');
    assert.ok(!label.contains(caret));

    // 面板裡只有 13 個工具連結，順序、網址、圖示、名稱都來自登錄表
    assert.equal(links.length, 13);
    assert.equal(menu.children.length, 13);
    assert.ok(menu.children.every((child) => child.tagName === 'A' && child.classList.contains('tools-menu-link')));
    assert.equal(links.length, ToolsRegistry.tools.length);

    ToolsRegistry.tools.forEach((tool, index) => {
        const link = links[index];
        const what = `${tool.id} 的連結`;
        assert.equal(link.getAttribute('href'), tool.external ? tool.href : `../../${tool.href}`, what);

        // data-i18n 只放在名稱 span 上；圖示與 ↗ 是兄弟節點，不在它裡面，也不會被覆寫
        assert.ok(!link.hasAttribute('data-i18n'), `${what}：data-i18n 要放在名稱 span`);
        const icon = link.querySelector('span.tools-menu-icon');
        assert.equal(icon.getAttribute('aria-hidden'), 'true', what);
        assert.equal(icon.textContent, tool.icon, what);
        const name = link.querySelector('span.tools-menu-name');
        assert.equal(name.getAttribute('data-i18n'), tool.i18nKey, what);
        assert.equal(name.textContent, tool.name, what);
        assert.equal(name.children.length, 0, what);

        const mark = link.querySelector('span.tools-menu-ext');
        if (tool.external) {
            assert.equal(link.getAttribute('target'), '_blank', what);
            assert.equal(link.getAttribute('rel'), 'noopener noreferrer', what);
            assert.equal(mark.getAttribute('aria-hidden'), 'true', what);
            assert.equal(mark.textContent, '↗', what);
            assert.ok(!name.contains(mark), what);
        } else {
            assert.ok(!link.hasAttribute('target') && !link.hasAttribute('rel') && mark === null, `${what}是站內連結，不該開新分頁或標示外部`);
        }
    });

    assert.equal(links[0].getAttribute('href'), '../../tools/mini-cactpot/index.html');
    const last = links[links.length - 1];
    assert.equal(last.getAttribute('href'), 'https://tc-shop.ff14.tw');
    assert.equal(last.getAttribute('target'), '_blank');
    assert.equal(last.getAttribute('rel'), 'noopener noreferrer');
    assert.ok(last.querySelector('.tools-menu-ext'));

    // 站內連結的前綴跟著 basePath 走
    const rootLinks = setupHeader().links;
    assert.equal(rootLinks[0].getAttribute('href'), '/tools/mini-cactpot/index.html');
});

test('在工具頁時目前工具有 aria-current="page"，工具按鈕顯示為 active', () => {
    const onTool = setupHeader({ basePath: '../../', currentToolId: 'weather-forecast' });
    const current = onTool.links.filter((link) => link.hasAttribute('aria-current'));
    assert.equal(current.length, 1);
    assert.equal(current[0].getAttribute('href'), '../../tools/weather-forecast/index.html');
    assert.equal(current[0].getAttribute('aria-current'), 'page');
    assert.deepEqual(onTool.links.filter((link) => link.classList.contains('active')).map((link) => link.getAttribute('href')), ['../../tools/weather-forecast/index.html']);
    assert.ok(onTool.toggle.classList.contains('active'));

    // 沒有目前工具（站務頁、404）：沒有任何連結標示，按鈕也不亮
    const notOnTool = setupHeader({ basePath: '/', currentToolId: null });
    assert.equal(notOnTool.links.filter((link) => link.hasAttribute('aria-current')).length, 0);
    assert.equal(notOnTool.links.filter((link) => link.classList.contains('active')).length, 0);
    assert.ok(!notOnTool.toggle.classList.contains('active'));

    // 不帶 currentToolId 的呼叫等同 null
    const omitted = setupHeader();
    assert.ok(!omitted.toggle.classList.contains('active'));
    assert.equal(omitted.links.filter((link) => link.hasAttribute('aria-current')).length, 0);
});

test('initToolsMenu：點按鈕開關、Escape 關閉並把焦點還給按鈕、點外面與 Tab 移出都會關閉', () => {
    const { dom, NavTemplate, header, toggle, menu, links, nav } = setupHeader({ basePath: '/' });
    assert.ok(toggle && menu, '導覽列缺少工具按鈕或面板');
    const outside = dom.el('button', { type: 'button' }, '頁面上的其他元素');
    dom.document.body.appendChild(outside);
    const home = nav.querySelector('a');
    const controller = NavTemplate.initToolsMenu(header);

    // 面板的 hidden 與按鈕的 aria-expanded 永遠同步
    const assertState = (open, message) => {
        assert.equal(menu.hidden, !open, `${message}：面板 hidden`);
        assert.equal(toggle.getAttribute('aria-expanded'), String(open), `${message}：aria-expanded`);
        assert.equal(controller.isOpen(), open, `${message}：isOpen()`);
    };
    assertState(false, '初始');

    // 點按鈕切換開關
    toggle.click();
    assertState(true, '點按鈕開啟');
    toggle.click();
    assertState(false, '再點按鈕關閉');

    // Escape：關閉、焦點還給按鈕、preventDefault
    toggle.click();
    const escape = dom.key('Escape');
    assertState(false, 'Escape');
    assert.ok(dom.document.activeElement === toggle, 'Escape 之後焦點要回到按鈕');
    assert.equal(escape.defaultPrevented, true);

    // 沒開的時候 Escape 什麼都不做，也不攔截（別的元件可能要用）
    assert.equal(dom.key('Escape').defaultPrevented, false);
    assertState(false, '關閉時按 Escape');

    // 其他按鍵不影響；Tab 本身不關閉（移出才關，見下面的 focusout）
    toggle.click();
    assert.equal(dom.key('Tab').defaultPrevented, false);
    assertState(true, '按 Tab');

    // 點面板本身（例如內距）不關閉；點按鈕與面板以外的地方才關閉
    menu.click();
    assertState(true, '點面板');
    outside.click();
    assertState(false, '點外面');

    // Tab 從按鈕走進面板：不關閉；從面板第一個連結走到外面的元素：關閉
    toggle.click();
    toggle.focus();
    links[0].focus();
    assertState(true, '從按鈕走進面板');
    outside.focus();
    assertState(false, '從面板走到外面');

    // 在面板裡的連結之間移動：仍然開啟
    toggle.click();
    links[0].focus();
    links[1].focus();
    assertState(true, '面板內連結之間移動');

    // Shift+Tab 從按鈕往回走到導覽列的其他連結：關閉
    toggle.focus();
    assertState(true, '回到按鈕');
    home.focus();
    assertState(false, '從按鈕走到別的連結');

    // relatedTarget 是 null（視窗失焦、點到不能聚焦的地方）不算移出：交給 click 判斷。
    // 否則 Safari 點按鈕不會聚焦，面板裡有焦點時點按鈕會先因 focusout 關閉、再因 click 重新開啟
    toggle.click();
    links[0].focus();
    links[0].blur();
    assertState(true, 'relatedTarget 為 null 的 focusout');
    outside.click();
    assertState(false, '之後點外面');
});

test('initToolsMenu：點外面關閉不受別的元件 stopPropagation() 影響（document 的捕獲階段，pointerdown 與 click 都算）；面板與按鈕內的按壓不關閉', () => {
    const { dom, NavTemplate, header, toggle, menu, links } = setupHeader();
    const controller = NavTemplate.initToolsMenu(header);
    const press = (target, type) => target.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }));

    // 像寶圖搜尋器的摺疊標題：不能聚焦的元素，自己的處理器呼叫 stopPropagation()，事件到不了 document 的冒泡階段
    // （只在冒泡階段監聽 document 的話，面板會一直開著）
    const swallower = dom.el('div', {}, '摺疊標題');
    for (const type of ['pointerdown', 'click']) swallower.addEventListener(type, (event) => event.stopPropagation());
    dom.document.body.appendChild(swallower);
    let reachedBubblePhase = false;
    dom.document.addEventListener('click', () => { reachedBubblePhase = true; });
    swallower.click();
    assert.equal(reachedBubblePhase, false, '前提：被吞掉的 click 到不了 document 的冒泡階段');

    // 只有 click（鍵盤觸發、或沒有 pointer events 的環境）：按鈕有焦點時點到不能聚焦的元素，按鈕失去焦點
    // （relatedTarget 是 null，focusout 不處理），能關閉面板的只剩 document 捕獲階段的 click
    controller.open();
    toggle.focus();
    toggle.blur();
    assert.equal(controller.isOpen(), true, '前提：relatedTarget 為 null 的 focusout 不會關閉面板');
    swallower.click();
    assert.equal(controller.isOpen(), false, '被 stopPropagation 的 click');

    // 只有 pointerdown：按下的當下就關閉，不必等到 click
    controller.open();
    press(swallower, 'pointerdown');
    assert.equal(controller.isOpen(), false, '被 stopPropagation 的 pointerdown');

    // 點外面關閉時不把焦點搶回按鈕（只有 Escape 才還給按鈕）
    controller.open();
    links[0].focus();
    swallower.click();
    assert.equal(controller.isOpen(), false);
    assert.ok(dom.document.activeElement !== toggle, '點外面不是 Escape，不該動焦點');

    // 面板與按鈕裡的按壓不關閉；按鈕自己的 click 照舊負責開關
    controller.open();
    for (const target of [toggle, menu, links[0]]) {
        press(target, 'pointerdown');
        assert.equal(controller.isOpen(), true, `${target.className} 裡的 pointerdown`);
    }
    menu.click();
    links[0].click();
    assert.equal(controller.isOpen(), true, '面板裡的 click');
    toggle.click();
    assert.equal(controller.isOpen(), false, '按鈕自己的 click 關閉面板');
    toggle.click();
    assert.equal(controller.isOpen(), true, '按鈕自己的 click 再開啟');
});

test('initToolsMenu：從往返快取還原頁面（pageshow 的 persisted 為 true）時關閉開著的面板，焦點原本在面板裡就還給按鈕、不在就不動；一般載入的 pageshow 不處理', () => {
    // 在面板裡選了工具、按 Back：瀏覽器可能從往返快取（bfcache）原封不動地還原頁面，面板還開著，焦點也還在剛才選的連結上
    const { dom, NavTemplate, header, toggle, menu, links } = setupHeader();
    const controller = NavTemplate.initToolsMenu(header);
    // pageshow 是派送在 window 上的事件（不是 document）；persisted 要用 dom.window.Event 建，處理器才讀得到
    const pageshow = (persisted) => dom.window.dispatchEvent(new dom.window.Event('pageshow', { persisted }));
    const assertState = (open, message) => {
        assert.equal(menu.hidden, !open, `${message}：面板 hidden`);
        assert.equal(toggle.getAttribute('aria-expanded'), String(open), `${message}：aria-expanded`);
        assert.equal(controller.isOpen(), open, `${message}：isOpen()`);
    };

    controller.open();
    links[0].focus();
    assertState(true, '前提：面板開著、焦點在面板裡');

    // 每次載入頁面都會有 pageshow，persisted 是 false：不處理
    pageshow(false);
    assertState(true, 'persisted 為 false');

    // 面板收合後那個連結就看不到了，焦點留在它上面會掉回頁面最上面：和 Escape 一樣還給按鈕
    pageshow(true);
    assertState(false, 'persisted 為 true');
    assert.ok(dom.document.activeElement === toggle, '焦點原本在面板裡：還給按鈕');

    // 焦點不在面板裡（例如 Safari 點連結不會讓連結取得焦點）：只收合，不搶焦點
    controller.open();
    links[0].focus();
    links[0].blur(); // fake-dom 的 blur() 派送沒有 relatedTarget 的 focusout：面板不關，焦點退回 body
    assertState(true, '前提：面板開著、焦點不在面板裡');
    pageshow(true);
    assertState(false, '焦點不在面板裡時照樣收合');
    assert.ok(dom.document.activeElement === dom.document.body, '焦點不在面板裡：不搶焦點');

    // 面板本來就是關的：還原頁面時什麼都不變，之後照常開關
    pageshow(true);
    assertState(false, '本來就關著');
    toggle.click();
    assertState(true, '之後點按鈕照常開啟');
});

test('initToolsMenu：視窗縮到手機寬度（跨過 768px）時收合開著的面板，回到桌機不會自己重新出現', () => {
    // 桌機開著面板、把視窗縮到手機（或平板轉直）再放回桌機：手機上按鈕不顯示、清單在抽屜裡永遠展開，
    // 面板若沒有在進入手機寬度時收合，回到桌機會帶著 hidden=false 與 aria-expanded="true" 自己重新出現
    const { dom, NavTemplate, header, toggle, menu, links } = setupHeader();
    // matchMedia 替身：記錄查詢與 change 監聽器；crossTo() 像瀏覽器一樣在 matches 改變時通知監聽器
    const queries = [];
    dom.window.matchMedia = (media) => {
        const query = {
            media,
            matches: false,
            listeners: [],
            addEventListener(type, listener) { if (type === 'change') this.listeners.push(listener); }
        };
        queries.push(query);
        return query;
    };
    const crossTo = (mobile) => {
        for (const query of queries) {
            if (query.matches === mobile) continue;
            query.matches = mobile;
            for (const listener of query.listeners) listener({ type: 'change', media: query.media, matches: mobile });
        }
    };
    const controller = NavTemplate.initToolsMenu(header);
    const assertState = (open, message) => {
        assert.equal(menu.hidden, !open, `${message}：面板 hidden`);
        assert.equal(toggle.getAttribute('aria-expanded'), String(open), `${message}：aria-expanded`);
        assert.equal(controller.isOpen(), open, `${message}：isOpen()`);
    };

    assert.equal(queries.length, 1, '只監聽一個斷點');
    assert.equal(queries[0].media, '(max-width: 768px)', '斷點與 common.css 的 @media (max-width: 768px) 一致');
    assert.equal(queries[0].listeners.length, 1, '只註冊一個 change 監聽器');

    controller.open();
    links[0].focus();
    assertState(true, '前提：桌機寬度、面板開著');

    crossTo(true);
    assertState(false, '縮到手機寬度');
    assert.ok(dom.document.activeElement !== toggle, '不把焦點給「工具 ▾」：手機上它不顯示，焦點由 common.js 移到 ☰（見 hamburger-menu.test.js）');

    crossTo(false);
    assertState(false, '回到桌機寬度不會自己重新出現');

    // 面板本來就是關的：來回跨過斷點都不變，之後照常開關
    crossTo(true);
    crossTo(false);
    assertState(false, '本來就關著');
    toggle.click();
    assertState(true, '之後點按鈕照常開啟');
});

test('initToolsMenu：點了會開新分頁的連結（水晶商城清單）就收合，焦點原本在面板裡就還給按鈕、不在就不動；站內連結不處理', () => {
    // 開新分頁時這一頁不會卸載：面板不收合的話，切回這個分頁時它還開著
    const { dom, NavTemplate, header, toggle, menu, links } = setupHeader();
    const controller = NavTemplate.initToolsMenu(header);
    const assertState = (open, message) => {
        assert.equal(menu.hidden, !open, `${message}：面板 hidden`);
        assert.equal(toggle.getAttribute('aria-expanded'), String(open), `${message}：aria-expanded`);
        assert.equal(controller.isOpen(), open, `${message}：isOpen()`);
    };
    const external = links.filter((link) => link.getAttribute('target') === '_blank');
    assert.equal(external.length, 1, '前提：只有水晶商城清單會開新分頁');
    const [tcShop] = external;

    // 站內連結：這一頁會被換掉（從往返快取回來時由 pageshow 收合）；按著 Ctrl／⌘ 開到背景分頁時面板留著，方便接著開別的工具
    controller.open();
    links[0].focus();
    links[0].click();
    assertState(true, '點站內連結不收合');

    // 鍵盤（或 Chrome 的滑鼠）點下去時焦點在連結上：收合後連結看不到，和 Escape 一樣把焦點還給按鈕
    tcShop.focus();
    tcShop.click();
    assertState(false, '點水晶商城清單收合');
    assert.ok(dom.document.activeElement === toggle, '焦點原本在面板裡：還給按鈕');

    // 焦點不在面板裡（例如 Safari 點連結不會讓連結取得焦點）：只收合，不搶焦點
    controller.open();
    tcShop.focus();
    tcShop.blur(); // fake-dom 的 blur() 派送沒有 relatedTarget 的 focusout：面板不關，焦點退回 body
    tcShop.click();
    assertState(false, '焦點不在面板裡時照樣收合');
    assert.ok(dom.document.activeElement === dom.document.body, '焦點不在面板裡：不搶焦點');
});

test('initToolsMenu 回傳 { open, close, isOpen }；找不到按鈕或面板時回傳 null', () => {
    const { dom, NavTemplate, header, toggle, menu } = setupHeader();

    const controller = NavTemplate.initToolsMenu(header);
    assert.deepEqual(Object.keys(controller).sort(), ['close', 'isOpen', 'open']);

    controller.open();
    assert.equal(menu.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(controller.isOpen(), true);

    // close() 預設不動焦點；restoreFocus 才把焦點還給按鈕
    controller.close();
    assert.equal(controller.isOpen(), false);
    assert.equal(menu.hidden, true);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.ok(dom.document.activeElement !== toggle, 'close() 預設不搶焦點');

    controller.open();
    controller.close({ restoreFocus: true });
    assert.equal(controller.isOpen(), false);
    assert.ok(dom.document.activeElement === toggle, 'close({ restoreFocus: true }) 要把焦點還給按鈕');

    // 找不到按鈕或面板：回傳 null，什麼都不綁
    assert.equal(NavTemplate.initToolsMenu(dom.el('div')), null);
    assert.equal(NavTemplate.initToolsMenu(dom.el('div', {}, dom.el('button', { class: 'nav-tools-toggle' }))), null);
    assert.equal(NavTemplate.initToolsMenu(dom.el('div', {}, dom.el('div', { class: 'tools-menu' }))), null);
});

// 載入真正的 tools-registry.js、nav-template.js、layout-loader.js；readyState 是 loading，
// layout-loader 要等測試派送 DOMContentLoaded 才會動，所以 #header-placeholder 還在、可以直接呼叫 _getOptions()
function setupLoader(url, placeholderAttrs) {
    const dom = createFakeDom({ url, readyState: 'loading' });
    if (placeholderAttrs) dom.document.body.appendChild(dom.el('div', { id: 'header-placeholder', ...placeholderAttrs }));
    dom.load('assets/js/components/tools-registry.js');
    dom.load('assets/js/components/nav-template.js');
    dom.load('assets/js/components/layout-loader.js');
    return dom;
}

test('layout-loader：404 頁不標示目前工具，工具頁會算出目前工具', () => {
    // GitHub Pages 會在任何不存在的網址顯示 404.html：這個網址在天氣預報的目錄底下，但它不是天氣預報頁
    const notFound = setupLoader('https://ff14.tw/tools/weather-forecast/typo', { 'data-base-path': '/', 'data-page': '404' });
    assert.equal(notFound.window.ToolsRegistry.findByPath('/tools/weather-forecast/typo').id, 'weather-forecast', '沒有旗標的話，這個網址會被算成天氣預報');
    const notFoundOptions = notFound.window.layoutLoader._getOptions();
    assert.equal(notFoundOptions.page, '404');
    assert.equal(notFoundOptions.currentToolId, null);
    assert.equal(notFoundOptions.basePath, '/');

    const toolPage = setupLoader('https://ff14.tw/tools/weather-forecast/index.html', { 'data-base-path': '../../', 'data-tool-name': '天氣預報', 'data-tool-name-key': 'weather_header' });
    const toolOptions = toolPage.window.layoutLoader._getOptions();
    assert.equal(toolOptions.page, null);
    assert.equal(toolOptions.currentToolId, 'weather-forecast');
    assert.equal(toolOptions.basePath, '../../');
    assert.equal(toolOptions.toolName, '天氣預報');
    assert.equal(toolOptions.toolNameKey, 'weather_header');

    // 攻略資料的子頁也算攻略資料；站務頁與沒有頁首佔位元素的頁面沒有目前工具
    assert.equal(setupLoader('https://ff14.tw/tools/guide/chocobo.html', { 'data-base-path': '../../' }).window.layoutLoader._getOptions().currentToolId, 'guide');
    const aboutOptions = setupLoader('https://ff14.tw/about.html', { 'data-base-path': '/' }).window.layoutLoader._getOptions();
    assert.equal(aboutOptions.page, null);
    assert.equal(aboutOptions.currentToolId, null);
    const noPlaceholder = setupLoader('https://ff14.tw/tools/weather-forecast/index.html').window.layoutLoader._getOptions();
    assert.equal(noPlaceholder.page, null);
    assert.equal(noPlaceholder.currentToolId, 'weather-forecast');
    assert.equal(noPlaceholder.basePath, '/');
});

test('layout-loader：頁首載入後工具選單可以操作，目前工具有標示，首頁／修改紀錄／版權聲明的 active 照舊', () => {
    const dom = setupLoader('https://ff14.tw/tools/weather-forecast/index.html', { 'data-base-path': '../../' });
    dom.document.dispatchEvent(new dom.window.CustomEvent('DOMContentLoaded'));

    const header = dom.document.querySelector('header.header');
    assert.ok(header, '頁首沒有取代佔位元素');
    assert.equal(dom.document.getElementById('header-placeholder'), null);
    const toggle = header.querySelector('button.nav-tools-toggle');
    const menu = header.querySelector('#nav-tools-menu');
    assert.ok(toggle.classList.contains('active'), '工具頁的工具按鈕要亮');
    assert.deepEqual(
        menu.querySelectorAll('a[aria-current="page"]').map((link) => link.getAttribute('href')),
        ['../../tools/weather-forecast/index.html']
    );

    // _loadHeader 換掉佔位元素後有呼叫 initToolsMenu：點按鈕會開，Escape 會關
    assert.equal(menu.hidden, true);
    toggle.click();
    assert.equal(menu.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    dom.key('Escape');
    assert.equal(menu.hidden, true);
    assert.ok(dom.document.activeElement === toggle);

    // 工具頁上沒有任何直屬導覽連結是 active；工具面板的連結不歸 _setActiveNavItem 管
    assert.equal(header.querySelectorAll('.nav > a.active').length, 0);

    // 站務頁：只有對應的直屬連結 active，工具按鈕不亮，面板裡沒有目前工具
    const changelog = setupLoader('https://ff14.tw/changelog.html', { 'data-base-path': '/' });
    changelog.document.dispatchEvent(new changelog.window.CustomEvent('DOMContentLoaded'));
    assert.deepEqual(
        changelog.document.querySelectorAll('.nav > a.active').map((link) => link.getAttribute('href')),
        ['/changelog.html']
    );
    assert.ok(!changelog.document.querySelector('button.nav-tools-toggle').classList.contains('active'));
    assert.equal(changelog.document.querySelectorAll('.tools-menu-link.active').length, 0);

    const home = setupLoader('https://ff14.tw/index.html', { 'data-base-path': '/' });
    home.document.dispatchEvent(new home.window.CustomEvent('DOMContentLoaded'));
    // 桌機與抽屜各有一個首頁連結，兩個都要標示（同一時間只會顯示其中一個）
    assert.deepEqual(home.document.querySelectorAll('.nav > a.active').map((link) => link.getAttribute('href')), ['/', '/']);
});

test('layout-loader：瀏覽器快取的 nav-template.js 是沒有 initToolsMenu 的舊版時，頁尾與 layoutLoaded 照常完成', () => {
    // 快取偏差：訪客的瀏覽器還留著舊的 nav-template.js（沒有 initToolsMenu），卻拿到新的 layout-loader.js。
    // 無條件呼叫 initToolsMenu 會丟 TypeError，_load() 在頁首之後中斷：沒有頁尾、沒有 layoutLoaded 事件
    const dom = setupLoader('https://ff14.tw/changelog.html', { 'data-base-path': '/' });
    dom.document.body.appendChild(dom.el('div', { id: 'footer-placeholder', 'data-base-path': '/' }));
    dom.load('assets/js/components/footer-template.js');
    // layout-loader 的 NavTemplate 與 window.NavTemplate 是同一個物件：拿掉方法就等於載入了舊版
    delete dom.window.NavTemplate.initToolsMenu;
    assert.equal(typeof dom.window.NavTemplate.initToolsMenu, 'undefined', '前提：這份 NavTemplate 沒有 initToolsMenu');
    const events = [];
    dom.document.addEventListener('layoutLoaded', () => events.push('layoutLoaded'));

    assert.doesNotThrow(() => dom.document.dispatchEvent(new dom.window.CustomEvent('DOMContentLoaded')));
    assert.ok(dom.document.querySelector('header.header'), '頁首照常換進文件');
    assert.ok(dom.document.querySelector('footer.footer'), '頁尾照常換進文件');
    assert.equal(dom.document.getElementById('footer-placeholder'), null);
    assert.ok(dom.document.body.classList.contains('layout-loaded'));
    assert.deepEqual(events, ['layoutLoaded']);
});

// 取出所有 `@media <query> {` … 對應的 `}` 之間的內容（大括號配對；同一個條件在檔案裡可能出現不只一次，
// 例如 ≤768px 就有首頁與頁首兩段），合併成 inside；rest 是拿掉這些區塊之後的其餘 CSS
function splitMediaBlocks(css, query) {
    const marker = `@media ${query} {`;
    let inside = '';
    let rest = '';
    let found = 0;
    let cursor = 0;
    for (let start = css.indexOf(marker); start !== -1; start = css.indexOf(marker, cursor)) {
        const open = start + marker.length - 1;
        let depth = 0;
        let close = -1;
        for (let index = open; close === -1 && index < css.length; index += 1) {
            if (css[index] === '{') depth += 1;
            else if (css[index] === '}' && (depth -= 1) === 0) close = index;
        }
        assert.notEqual(close, -1, `common.css 的 @media ${query} 沒有對應的右大括號`);
        rest += css.slice(cursor, start);
        inside += css.slice(open + 1, close);
        cursor = close + 1;
        found += 1;
    }
    assert.ok(found > 0, `common.css 找不到 @media ${query}`);
    return { inside, rest: rest + css.slice(cursor) };
}

test('common.css：桌機的面板用 [hidden] 收合，手機抽屜明確覆寫成永遠顯示', () => {
    const css = read('assets/css/common.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const { inside: mobile, rest: desktop } = splitMediaBlocks(css, '(max-width: 768px)');
    // 用 assert.ok(regex.test(…)) 而不是 assert.match：失敗時不要把整份 CSS 印出來
    const has = (text, pattern) => pattern.test(text);

    // 桌機：面板自己設了 display（grid），作者樣式會蓋過瀏覽器內建的 [hidden] { display: none }，
    // 所以一定要自己寫收合規則，否則面板永遠是打開的
    assert.ok(has(desktop, /\.tools-menu\[hidden\]\s*\{[^}]*display:\s*none\s*;/), '桌機缺少 .tools-menu[hidden] { display: none; }');

    // ≤768px：抽屜裡的工具清單是靜態清單，即使帶 hidden 也要顯示（打開手機選單時要能把焦點移進清單）。
    // 明確寫出覆寫規則，不靠選擇器權重剛好蓋過去
    assert.ok(has(mobile, /\.nav \.tools-menu\[hidden\]\s*\{[^}]*display:\s*flex\s*;/), '≤768px 缺少 .nav .tools-menu[hidden] { display: flex; }');
    // 手機不需要按鈕，小標才顯示
    assert.ok(has(mobile, /\.nav-tools-toggle\s*\{[^}]*display:\s*none\s*;/), '≤768px 要隱藏 .nav-tools-toggle');
    assert.ok(has(mobile, /\.nav-section-label\s*\{[^}]*display:\s*block\s*;/), '≤768px 要顯示 .nav-section-label');
});

test('common.css：抽屜的畫面順序就是 DOM 順序，桌機與抽屜各自只顯示一個首頁', () => {
    const css = read('assets/css/common.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const { inside: mobile, rest: desktop } = splitMediaBlocks(css, '(max-width: 768px)');
    const has = (text, pattern) => pattern.test(text);

    // 桌機用排在最前面的首頁，抽屜用排在工具清單後面的首頁，同一時間只顯示其中一個
    assert.ok(has(desktop, /\.nav > a\.nav-drawer-only\s*\{[^}]*display:\s*none\s*;/), '桌機要隱藏抽屜用的首頁（.nav > a.nav-drawer-only）');
    assert.ok(has(mobile, /\.nav > a\.nav-desktop-only\s*\{[^}]*display:\s*none\s*;/), '≤768px 要隱藏桌機用的首頁（.nav > a.nav-desktop-only）');
    assert.ok(has(mobile, /\.nav > a\.nav-drawer-only\s*\{[^}]*display:\s*block\s*;/), '≤768px 要顯示抽屜用的首頁（.nav > a.nav-drawer-only）');

    // CSS order 只改畫面順序，Tab 與螢幕閱讀器仍照 DOM 順序走：抽屜裡的規則不能用 order 重新排序
    const drawerRulesWithOrder = [...mobile.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, selector, body]) => /\.nav\b|\.tools-menu/.test(selector) && /(^|[;\s])order\s*:/.test(body))
        .map(([, selector]) => selector.trim());
    assert.deepEqual(drawerRulesWithOrder, [], '抽屜裡的規則不能用 order');
});
