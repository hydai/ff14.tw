// 從真正的頁面 HTML 取出元素，給 tests/*.test.js 共用。這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。
//
//   const html = read('tools/treasure-map-finder/index.html');
//   classesOf(tagAttrs(html, 'clearAllBtn'));            // 開始標籤的 class：['btn', 'btn-ghost', 'btn-sm']
//   sliceElementById(html, 'listView');                  // 從開始標籤切到對應的結束標籤（字串）
//   mountFromHtml(dom, html, ['myListPanel']);           // 照頁面的標記建出 fake-dom 節點，接到 dom.document.body
//
// mountFromHtml 只解析 index.html 用到的寫法：雙引號屬性、沒有值的布林屬性、<!-- --> 註解、空元素（img、input、br）、
// &lt; &gt; &amp; &quot; 四個實體、textarea 的內容。其他寫法（單引號或不加引號的屬性、其他實體、沒有結束標籤的元素、
// 對不上的結束標籤、單獨的 <）會丟錯，不會悄悄建出和頁面不同的節點。
// fake-dom 的 disabled、checked、value 不是屬性：布林屬性 disabled、checked 另外設成 property true，textarea 的內容也設成 value。
// 有換行的純空白文字節點（標籤之間的縮排）丟掉；不含換行的保留，例如 <span>🔗</span> <span>文字</span> 中間那個空白。

// ---------- 只解析字串（不需要 DOM；不假設屬性順序） ----------
// 有值的屬性：name="值" 或 name='值'；沒有值的布林屬性不在結果裡
function parseAttrs(source) {
    const attrs = {};
    for (const m of source.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = m[2] ?? m[3];
    return attrs;
}

const classesOf = (attrs) => (attrs.class || '').split(/\s+/).filter(Boolean);

// 含 id="…" 的那個開始標籤的屬性
function tagAttrs(html, id) {
    const m = html.match(new RegExp(`<[a-zA-Z][\\w-]*\\b[^>]*\\sid="${id}"[^>]*>`));
    if (!m) throw new Error(`找不到 id="${id}" 的開始標籤`);
    return parseAttrs(m[0]);
}

// 從 id="…" 那個元素的開始標籤切到對應的結束標籤（計算同名標籤的巢狀）。id= 前面要是空白：data-map-id="…" 不算
function sliceElementById(html, id) {
    const at = html.search(new RegExp(`\\sid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    if (at === -1) throw new Error(`找不到 id="${id}"`);
    const start = html.lastIndexOf('<', at);
    const tag = html.slice(start + 1).match(/^[a-zA-Z][\w-]*/)[0];
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    re.lastIndex = start;
    let depth = 0;
    for (let m = re.exec(html); m; m = re.exec(html)) {
        depth += m[1] ? -1 : 1;
        if (depth === 0) return html.slice(start, m.index + m[0].length);
    }
    throw new Error(`id="${id}" 的 <${tag}> 沒有結束標籤`);
}

// ---------- 建出 fake-dom 節點 ----------
const VOID_TAGS = new Set(['img', 'input', 'br']);
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"' };
// 一次換完：&amp;lt; 是字面上的 &lt;，不會再被換成 <。&名稱; 或 &#數字; 的形狀但不是上面四個的一律丟錯（不會悄悄留下 &nbsp; 這種字面文字）；
// 單獨的 &（後面不是這種形狀）不是實體，原樣保留
const decode = (text) => text.replace(/&(#?\w+);/g, (match, name) => {
    if (!Object.hasOwn(ENTITIES, name)) throw new Error(`html-fragment 不認得實體 ${match}`);
    return ENTITIES[name];
});
const ATTR = /([^\s"'<>/=]+)(?:="([^"]*)")?/g;

// fragment 是 sliceElementById 切出來的一個元素：回傳建好的那個節點
function buildElement(dom, fragment) {
    // 註解、結束標籤、開始標籤（屬性是 name="值" 或沒有值的 name）、文字；sticky：每一段都要從上一段結束的地方接著符合
    const token = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'<>/=]+(?:="[^"]*")?)*)\s*>|([^<]+)/y;
    const holder = dom.document.createElement('div');
    const open = [holder];
    while (token.lastIndex < fragment.length) {
        const at = token.lastIndex;
        const m = token.exec(fragment);
        if (!m) throw new Error(`html-fragment 看不懂這段標記：${fragment.slice(at, at + 40)}`);
        const [, endTag, startTag, attrs, text] = m;
        const parent = open.at(-1);
        if (text !== undefined) {
            if (/^\s*$/.test(text) && text.includes('\n')) continue;
            parent.appendChild(dom.document.createTextNode(decode(text)));
        } else if (endTag !== undefined) {
            if (parent === holder || parent.tagName !== endTag.toUpperCase()) throw new Error(`html-fragment：</${endTag}> 對不上開始標籤`);
            open.pop();
        } else if (startTag !== undefined) {
            const element = dom.document.createElement(startTag);
            for (const [, name, value] of attrs.matchAll(ATTR)) {
                element.setAttribute(name, value === undefined ? '' : decode(value));
                if (name === 'disabled' || name === 'checked') element[name] = true;
            }
            parent.appendChild(element);
            const tag = startTag.toLowerCase();
            if (tag === 'textarea') {
                // 內容是純文字（只換實體），一直到 </textarea>
                const close = fragment.indexOf('</textarea>', token.lastIndex);
                if (close === -1) throw new Error('html-fragment：<textarea> 沒有結束標籤');
                const content = decode(fragment.slice(token.lastIndex, close));
                if (content) element.appendChild(dom.document.createTextNode(content));
                element.value = content;
                token.lastIndex = close + '</textarea>'.length;
            } else if (!VOID_TAGS.has(tag)) {
                open.push(element);
            }
        }
    }
    if (open.length > 1) throw new Error(`html-fragment：<${open.at(-1).tagName.toLowerCase()}> 沒有結束標籤`);
    if (holder.childNodes.length !== 1) throw new Error('html-fragment：應該正好是一個元素');
    return holder.firstChild;
}

// 依序把每個 id 的元素（連同裡面的一切）建成 fake-dom 節點，接到 dom.document.body；找不到 id 時丟錯
function mountFromHtml(dom, html, ids) {
    for (const id of ids) dom.document.body.appendChild(buildElement(dom, sliceElementById(html, id)));
}

module.exports = { parseAttrs, classesOf, tagAttrs, sliceElementById, mountFromHtml };
