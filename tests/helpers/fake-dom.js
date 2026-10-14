// 最小 DOM 替身（不需要 jsdom），給 tests/*.test.js 共用：在 vm 裡執行 repo 的瀏覽器腳本。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。
//
//   const dom = createFakeDom({ url: 'https://ff14.tw/tools/guide/', readyState: 'loading', innerWidth: 390 });
//   dom.load('assets/js/components/nav-template.js');   // 等同 <script src>；頂層 const／class 會留在同一個全域
//   dom.document.body.appendChild(dom.el('div', { id: 'header-placeholder', 'data-page': '404' }, '文字'));
//   dom.key('Escape');                                   // 在目前焦點元素上派送會冒泡的 keydown
//
// 刻意不做的事（做了反而會讓測試通過、瀏覽器卻不同）：
// - 選擇器（querySelector(All)、matches、closest）只支援 tag、#id、.class、[attr]、[attr="v"] 的複合寫法，以及空白、> 組合子；其他語法
//   （逗號、:scope、偽類別、*、屬性值的 i 旗標）會丟錯，不會悄悄回傳空結果。不加引號的屬性值只接受 ASCII 識別字
//   （[type=button]、[data-x=foo-bar]）；[data-x=1]、[href=/]、[data-x=a.b]、[data-x=] 瀏覽器也會丟 SyntaxError，
//   非 ASCII 識別字（[data-x=首頁]）瀏覽器接受，但這裡要加引號。dataset 不支援列舉。
// - 事件和瀏覽器一樣分三段：捕獲（window → document → 祖先，由外到內，只跑 capture 的監聽器）、目標、冒泡（只跑非 capture
//   的，而且事件要 bubbles）。不冒泡的事件，祖先的 capture 監聽器仍然會跑；目標上的 capture 監聽器先於非 capture 的，與登記
//   順序無關。addEventListener／removeEventListener 的第三個參數只看 capture（true 或 { capture: true }）：同一個函式以
//   capture 與非 capture 各登記一次算兩個監聽器，移除時要用同樣的 capture 值；once、passive 會被忽略，listener 只能是函式。
//   stopPropagation() 在哪一段呼叫，後面的節點與階段都不再執行（捕獲段呼叫的話，目標與冒泡段也不跑），同一個節點同一段的
//   其餘監聽器照跑。沒有 eventPhase、stopImmediatePropagation、composedPath。
// - focus()／blur() 只派送 focusout（沒有 focus、blur、focusin）。focus() 只檢查 inert：元素本身或祖先帶 inert 屬性就
//   什麼都不做（和瀏覽器一樣，焦點不動、不派送 focusout）；hidden、disabled、tabindex 等其他可聚焦條件不檢查，元素事後才
//   變成 inert 時焦點也不會自動退回 body（瀏覽器要等到下一次繪製才處理）。click() 不會導覽、也不送出表單。
// - 沒有 matchMedia、localStorage、i18n：需要時由測試自己指定到 dom.window 上。
// - vm 是另一個 realm：腳本在 vm 裡建出來的陣列與物件，原型和測試端不同，assert.deepEqual 會失敗，
//   請逐欄位比較，或先轉成測試端的物件（Array.from()、JSON.parse(JSON.stringify(x))）。
//   這個檔案回傳的節點、陣列與事件都建在測試端，不受影響。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');

// ---------- 事件 ----------
// Event 與 CustomEvent 共用同一個類別：init 的欄位（bubbles、cancelable、detail、key、relatedTarget…）直接成為事件的屬性
class FakeEvent {
    constructor(type, init = {}) {
        Object.assign(this, { bubbles: false, cancelable: false, detail: null, relatedTarget: null }, init);
        this.type = type;
        this.defaultPrevented = false;
        this.target = this.currentTarget = null;
        this._stopped = false; // stopPropagation()：同一個節點同一段的監聽器照跑，後面的節點與階段都不再執行
    }

    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { this._stopped = true; }
}

// 事件目標 -> Map(事件類型 -> 登記項陣列)；一筆登記項是 { listener, capture }，
// 和瀏覽器一樣以「類型、函式、capture」三者判斷是不是同一個監聽器
const listenerTable = new WeakMap();
function listenersOf(target, type) {
    if (!listenerTable.has(target)) listenerTable.set(target, new Map());
    const byType = listenerTable.get(target);
    if (!byType.has(type)) byType.set(type, []);
    return byType.get(type);
}

// 第三個參數：true 或 { capture: true } 是捕獲；其餘（沒給、false、只有 once／passive 的物件）都是非 capture
const isCapture = (options) => (typeof options === 'boolean' ? options : Boolean(options?.capture));

// 事件路徑：元素 -> 祖先 -> document -> window；沒有掛在 document 底下的節點，路徑到最上層的祖先為止
const eventParent = (target) => (target instanceof Document ? target.defaultView : target.parentNode ?? null);

class Target {
    addEventListener(type, listener, options) {
        const capture = isCapture(options);
        const list = listenersOf(this, type);
        if (!list.some((entry) => entry.listener === listener && entry.capture === capture)) list.push({ listener, capture });
    }

    removeEventListener(type, listener, options) {
        const capture = isCapture(options);
        const list = listenersOf(this, type);
        const index = list.findIndex((entry) => entry.listener === listener && entry.capture === capture);
        if (index !== -1) list.splice(index, 1);
    }

    // 捕獲：從最外層（window）往下到目標，每個節點只跑 capture 的監聽器（目標也在內，所以目標的 capture 先於它的非 capture）；
    // 然後目標與冒泡：從目標往上到 window，每個節點只跑非 capture 的，目標以外的節點要事件 bubbles 才跑
    dispatchEvent(event) {
        event.target = this;
        event._stopped = false;
        const path = [];
        for (let node = this; node; node = eventParent(node)) path.push(node); // 目標 -> … -> window
        const invoke = (node, capture) => {
            event.currentTarget = node;
            const list = listenersOf(node, event.type);
            for (const entry of [...list]) {
                if (entry.capture === capture && list.includes(entry)) entry.listener.call(node, event); // 前面的監聽器可能已經把它移除
            }
        };
        for (let index = path.length - 1; index >= 0 && !event._stopped; index -= 1) invoke(path[index], true);
        for (let index = 0; index < path.length && !event._stopped && (index === 0 || event.bubbles); index += 1) invoke(path[index], false);
        event.currentTarget = null;
        return !event.defaultPrevented;
    }
}

// ---------- 節點樹 ----------
const isElement = (node) => node?.nodeType === 1;

function* descendants(node) {
    for (const child of node.childNodes) {
        yield child;
        yield* descendants(child);
    }
}

class Node extends Target {
    constructor() {
        super();
        this.parentNode = null;
        this.childNodes = [];
    }

    // 包含文字節點（和 firstElementChild 不同）；沒有子節點時是 null。共用的 SecurityUtils.clearElement() 靠 firstChild 清空
    get firstChild() { return this.childNodes[0] ?? null; }
    get lastChild() { return this.childNodes.at(-1) ?? null; }

    contains(other) {
        for (let node = other; node; node = node.parentNode) if (node === this) return true;
        return false;
    }

    // 已經有父節點的節點會先從舊位置拿掉（搬移）；參考節點為 null 時附加在最後
    insertBefore(node, reference) {
        if (reference !== null && reference?.parentNode !== this) throw new Error('insertBefore 的參考節點不是這個節點的子節點');
        if (node.contains(this)) throw new Error('不能把節點插進它自己的後代');
        if (node === reference) return node;
        node.remove();
        this.childNodes.splice(reference === null ? this.childNodes.length : this.childNodes.indexOf(reference), 0, node);
        node.parentNode = this;
        return node;
    }

    appendChild(node) { return this.insertBefore(node, null); }

    removeChild(node) {
        if (node.parentNode !== this) throw new Error('removeChild 的節點不是這個節點的子節點');
        this.childNodes.splice(this.childNodes.indexOf(node), 1);
        node.parentNode = null;
        return node;
    }

    remove() { this.parentNode?.removeChild(this); }

    replaceWith(...nodes) {
        const parent = this.parentNode;
        if (!parent) return;
        const next = parent.childNodes[parent.childNodes.indexOf(this) + 1] ?? null;
        this.remove();
        for (const node of nodes) parent.insertBefore(node, next);
    }
}

class Text extends Node {
    constructor(data) {
        super();
        this.data = data;
    }

    get nodeType() { return 3; }
    get textContent() { return this.data; }
    set textContent(value) { this.data = String(value); }
}

// ---------- 選擇器 ----------
const unsupported = (selector) => new Error(`fake-dom 不支援的選擇器：${selector}`);

// 一個複合選擇器：tag 在最前面，後面接任意個 #id、.class、[attr]、[attr="v"]。
// 不加引號的屬性值只能是 ASCII 識別字（[type=button]）；[data-x=1]、[href=/]、[data-x=a.b]、[data-x=] 瀏覽器會丟 SyntaxError，
// [type="button" i] 這種旗標這裡沒實作，所以都不符合 piece，一律丟「不支援的選擇器」
function parseCompound(text, selector) {
    const compound = { tag: null, id: null, classes: [], attrs: [] };
    const piece = /([\w-]+)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|(-?[_a-zA-Z][\w-]*)))?\]/y;
    for (let index = 0; index < text.length; index = piece.lastIndex) {
        piece.lastIndex = index;
        const match = piece.exec(text);
        if (!match || (match[1] && index > 0)) throw unsupported(selector);
        if (match[1]) compound.tag = match[1].toUpperCase();
        else if (match[2]) compound.id = match[2];
        else if (match[3]) compound.classes.push(match[3]);
        else compound.attrs.push([match[4].toLowerCase(), match[5] ?? match[6] ?? match[7] ?? null]);
    }
    return compound;
}

// 由左到右的複合選擇器鏈；每一節的 child 表示它和前一節是 > （子代）還是空白（後代）
function parseSelector(selector) {
    const source = selector.trim();
    const step = /(\s*>\s*|\s+)?([\w-]*(?:[#.][\w-]+|\[[^\]]*\])*)/y;
    const chain = [];
    for (let index = 0; index < source.length; index = step.lastIndex) {
        step.lastIndex = index;
        const [, combinator, compound] = step.exec(source);
        if (!compound || (chain.length === 0) !== (combinator === undefined)) throw unsupported(selector);
        chain.push({ ...parseCompound(compound, selector), child: combinator?.includes('>') });
    }
    if (!chain.length) throw unsupported(selector);
    return chain;
}

const matchesCompound = (element, { tag, id, classes, attrs }) => (!tag || element.tagName === tag)
    && (!id || element.getAttribute('id') === id)
    && classes.every((name) => element.classList.contains(name))
    && attrs.every(([name, value]) => element.hasAttribute(name) && (value === null || element.getAttribute(name) === value));

// 由右到左比對；祖先可以在查詢範圍之外（和瀏覽器一樣）
function matchesChain(element, chain, index) {
    if (!matchesCompound(element, chain[index])) return false;
    if (index === 0) return true;
    if (chain[index].child) return isElement(element.parentNode) && matchesChain(element.parentNode, chain, index - 1);
    for (let ancestor = element.parentNode; isElement(ancestor); ancestor = ancestor.parentNode) {
        if (matchesChain(ancestor, chain, index - 1)) return true;
    }
    return false;
}

class ParentNode extends Node {
    get children() { return this.childNodes.filter(isElement); }
    get firstElementChild() { return this.children[0] ?? null; }

    querySelectorAll(selector) {
        const chain = parseSelector(selector);
        return [...descendants(this)].filter((node) => isElement(node) && matchesChain(node, chain, chain.length - 1));
    }

    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

// ---------- 元素 ----------
class ClassList {
    constructor(element) { this.element = element; }

    get tokens() { return this.element.className.split(/\s+/).filter(Boolean); }
    contains(token) { return this.tokens.includes(token); }
    add(...tokens) { this.element.className = [...new Set([...this.tokens, ...tokens])].join(' '); }
    remove(...tokens) { this.element.className = this.tokens.filter((token) => !tokens.includes(token)).join(' '); }

    toggle(token, force = !this.contains(token)) {
        if (force) this.add(token);
        else this.remove(token);
        return force;
    }
}

// dataset.fooBar <-> data-foo-bar：直接讀寫屬性，所以兩個方向永遠一致
const dataAttr = (prop) => `data-${prop.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

function datasetOf(element) {
    return new Proxy({}, {
        get: (_, prop) => (typeof prop === 'string' ? element.getAttribute(dataAttr(prop)) ?? undefined : undefined),
        set: (_, prop, value) => { element.setAttribute(dataAttr(prop), value); return true; },
        has: (_, prop) => element.hasAttribute(dataAttr(prop)),
        deleteProperty: (_, prop) => { element.removeAttribute(dataAttr(prop)); return true; }
    });
}

class Element extends ParentNode {
    constructor(ownerDocument, tag) {
        super();
        this.ownerDocument = ownerDocument;
        this.tagName = tag.toUpperCase();
        this.style = {};
        this._attrs = new Map();
        this.classList = new ClassList(this);
        this.dataset = datasetOf(this);
    }

    get nodeType() { return 1; }

    getAttribute(name) { return this._attrs.get(name.toLowerCase()) ?? null; }
    setAttribute(name, value) { this._attrs.set(name.toLowerCase(), String(value)); }
    hasAttribute(name) { return this._attrs.has(name.toLowerCase()); }
    removeAttribute(name) { this._attrs.delete(name.toLowerCase()); }

    get className() { return this.getAttribute('class') ?? ''; }
    set className(value) { this.setAttribute('class', value); }

    get previousElementSibling() { return this._sibling(-1); }
    get nextElementSibling() { return this._sibling(1); }

    _sibling(step) {
        const siblings = this.parentNode?.children ?? [];
        return siblings[siblings.indexOf(this) + step] ?? null;
    }

    // 選擇器語法和 querySelector 相同（不支援的照樣丟錯）；組合子的祖先可以在任何地方
    matches(selector) {
        const chain = parseSelector(selector);
        return matchesChain(this, chain, chain.length - 1);
    }

    // 從自己開始往上找第一個符合的元素（只看元素，不含 document）；找不到是 null
    closest(selector) {
        const chain = parseSelector(selector);
        for (let node = this; isElement(node); node = node.parentNode) {
            if (matchesChain(node, chain, chain.length - 1)) return node;
        }
        return null;
    }

    get textContent() { return this.childNodes.map((node) => node.textContent).join(''); }

    // 取代所有子節點；空字串不建立文字節點
    set textContent(value) {
        for (const child of [...this.childNodes]) this.removeChild(child);
        if (value != null && value !== '') this.appendChild(this.ownerDocument.createTextNode(value));
    }

    click() { this.dispatchEvent(new FakeEvent('click', { bubbles: true, cancelable: true })); }

    // 和瀏覽器一樣：元素本身或祖先帶 inert 就拿不到焦點（什麼都不做，焦點不動、也沒有 focusout）；
    // 舊元素失去焦點的當下，document.activeElement 是 body；之後才換成新元素
    focus() {
        const document = this.ownerDocument;
        const previous = document.activeElement;
        if (previous === this) return;
        for (let node = this; isElement(node); node = node.parentNode) if (node.hasAttribute('inert')) return;
        document._active = null;
        if (previous !== document.body) previous.dispatchEvent(new FakeEvent('focusout', { bubbles: true, relatedTarget: this }));
        document._active = this;
    }

    blur() {
        if (this.ownerDocument.activeElement !== this) return;
        this.ownerDocument._active = null;
        this.dispatchEvent(new FakeEvent('focusout', { bubbles: true }));
    }
}

// 對應到屬性的字串與布林屬性；href 回傳原始字串（不解析成完整網址）
for (const name of ['id', 'href', 'target', 'rel', 'type']) {
    Object.defineProperty(Element.prototype, name, {
        get() { return this.getAttribute(name) ?? ''; },
        set(value) { this.setAttribute(name, value); }
    });
}
for (const name of ['hidden', 'inert']) {
    Object.defineProperty(Element.prototype, name, {
        get() { return this.hasAttribute(name); },
        set(value) { if (value) this.setAttribute(name, ''); else this.removeAttribute(name); }
    });
}

// ---------- document 與 window ----------
class Document extends ParentNode {
    constructor(defaultView, readyState) {
        super();
        this.defaultView = defaultView;
        this.readyState = readyState;
        this._active = null;
        this.documentElement = this.createElement('html');
        this.head = this.createElement('head');
        this.body = this.createElement('body');
        this.appendChild(this.documentElement);
        this.documentElement.appendChild(this.head);
        this.documentElement.appendChild(this.body);
    }

    get nodeType() { return 9; }

    // 焦點元素被移出文件後，和瀏覽器一樣退回 body
    get activeElement() { return this._active && this.contains(this._active) ? this._active : this.body; }

    createElement(tag) { return new Element(this, tag); }
    createTextNode(data) { return new Text(String(data)); }
    getElementById(id) { return [...descendants(this)].find((node) => isElement(node) && node.getAttribute('id') === id) ?? null; }
}

function createFakeDom({ url = 'https://ff14.tw/', readyState = 'complete', innerWidth = 1280 } = {}) {
    const window = new Target();
    const document = new Document(window, readyState);
    // 腳本在 vm 裡呼叫 window.addEventListener() 時，this 不是這個物件，所以要先綁定
    for (const method of ['addEventListener', 'removeEventListener', 'dispatchEvent']) {
        window[method] = Target.prototype[method].bind(window);
    }
    Object.assign(window, {
        window,
        document,
        location: new URL(url),
        innerWidth,
        console,
        URL,
        Event: FakeEvent,
        CustomEvent: FakeEvent,
        // 呼叫時才取全域的計時器，node:test 的 mock.timers 在建立 dom 前後啟用都有效
        setTimeout: (...args) => setTimeout(...args),
        clearTimeout: (...args) => clearTimeout(...args)
    });
    vm.createContext(window);

    return {
        window,
        document,

        load(relPath) {
            vm.runInContext(fs.readFileSync(path.resolve(ROOT, relPath), 'utf8'), window, { filename: relPath });
        },

        // attrs 是屬性：{ class: 'a b', id: 'x', 'data-page': '404', hidden: true }；false、null、undefined 會略過
        el(tag, attrs = {}, ...children) {
            const element = document.createElement(tag);
            for (const [name, value] of Object.entries(attrs)) {
                if (value === true) element.setAttribute(name, '');
                else if (value !== false && value != null) element.setAttribute(name, value);
            }
            for (const child of children) element.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
            return element;
        },

        key(key, target = document.activeElement ?? document.body) {
            const event = new FakeEvent('keydown', { bubbles: true, cancelable: true, key });
            target.dispatchEvent(event);
            return event;
        }
    };
}

module.exports = { createFakeDom };
