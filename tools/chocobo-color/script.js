// 陸行鳥染色計算器
// 資料（data/chocobo-colors.json）載入完才能選顏色。目前顏色與目標顏色一選好就直接出答案（沒有「計算」鈕）：
// 算法在不碰 DOM 的 chocobo-solver.js（ChocoboColorSolver.plan），這裡只管畫面與記住。
// 答案卡（#answerCard）換顏色或換語言時整張重畫；打勾只改那一列的 class、計數與存檔，不重畫，焦點才會留在勾選框上。
// 記住：localStorage['ff14tw_chocobo_color'] = { from, to, done }。每一次讀寫都包 try/catch，
// 瀏覽器封鎖網站資料時照常運作，只是不記住。
class ChocoboColorTool {
    static STORAGE_KEY = 'ff14tw_chocobo_color';
    static DATA_URL = '../../data/chocobo-colors.json';
    // 目標顏色的預設；目前顏色的預設來自資料（data.meta.defaultColor）
    static DEFAULT_TARGET = 'snow-white';

    // 建一個元素：class 與文字（沒給文字就不設）
    static element(tag, className, text) {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    static rgbCss([r, g, b]) {
        return `rgb(${r}, ${g}, ${b})`;
    }

    constructor() {
        // 資料載入完才有：data（原樣）、colors／fruits（id -> 項目）
        this.data = null;
        this.colors = new Map();
        this.fruits = new Map();
        this.loadFailed = false;

        // 目前顏色、目標顏色與已勾的段號（done）。plan 是 ChocoboColorSolver.plan() 對這兩個顏色算出的答案，只在換顏色時重算
        this.state = { from: null, to: null, done: new Set() };
        this.plan = null;
        // 目前答案卡的每一段 { item, box, text, note, sub, next, warning, isNext }（見 buildStep()）與「已勾 x／M 段」那一格，打勾時只改這些。
        // skipAnnounced：朗讀區現在寫的是不是「跳過」的提醒（見 announceSkipped()）
        this.rows = [];
        this.doneElement = null;
        this.skipAnnounced = false;

        this.elements = {
            card: document.getElementById('answerCard'),
            announce: document.getElementById('answerAnnounce'),
            from: {
                button: document.getElementById('fromBtn'),
                name: document.getElementById('fromName'),
                chip: document.getElementById('fromChip')
            },
            to: {
                button: document.getElementById('toBtn'),
                name: document.getElementById('toName'),
                chip: document.getElementById('toChip')
            }
        };

        // 打勾：事件委派在答案卡上，整張卡重畫之後不必重新綁
        this.elements.card.addEventListener('change', (event) => {
            const box = event.target.closest('.answer-check');
            if (box) this.toggleStep(Number(box.dataset.index), box.checked);
        });

        // 切換語言：按鈕、答案卡與朗讀摘要換成新的語言，選的顏色與打勾不變
        window.i18n.onLanguageChange(() => this.render());

        this.ready = this.init();
    }

    t(key, fallback, params) {
        return FF14Utils.getI18nText(key, fallback, params);
    }

    // 顏色或水果的名稱，介面語言沒有就用中文
    nameOf(item) {
        return item.names[window.i18n.getCurrentLanguage()] || item.names.zh;
    }

    async init() {
        try {
            const response = await fetch(ChocoboColorTool.DATA_URL);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.load(await response.json());
        } catch (error) {
            console.error('載入顏色資料失敗:', error);
            this.loadFailed = true;
            this.render();
            return;
        }
        this.restore();
        this.elements.from.button.disabled = false;
        this.elements.to.button.disabled = false;
        this.render();
    }

    // 資料整理完才放進 this.data：中途失敗（資料缺東西）時頁面還是「沒載入」的樣子
    load(data) {
        this.colors = new Map(data.colors.map((color) => [color.id, color]));
        this.fruits = new Map(data.fruits.map((fruit) => [fruit.id, fruit]));
        this.data = data;
    }

    // ---------- 記住 ----------

    // 還原上次的顏色與打勾。存著的東西壞掉（不是 JSON、不是物件、id 不認得、段號不對）時丟掉壞的那一部分，不丟錯、不留 console。
    // 打勾屬於存下來的那一組顏色：兩個 id 有一個不認得，換成預設之後就不是同一組了，done 整個丟掉（不然會勾到沒勾過的段，
    // 或把換上去的那一組當成「全部勾完」）。
    // 每一段都勾了：陸行鳥已經餵完，目前顏色換成目標顏色、清空打勾、存回去（只在打開頁面時判斷）
    restore() {
        let saved = null;
        try {
            saved = JSON.parse(window.localStorage.getItem(ChocoboColorTool.STORAGE_KEY));
        } catch (error) {
            // 讀不到（封鎖網站資料）或內容壞掉：當成沒存過
        }
        if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) saved = {};

        const knownPair = this.colors.has(saved.from) && this.colors.has(saved.to);
        this.state.from = this.colors.has(saved.from) ? saved.from : this.data.meta.defaultColor;
        this.state.to = this.colors.has(saved.to) ? saved.to : ChocoboColorTool.DEFAULT_TARGET;
        this.plan = ChocoboColorSolver.plan(this.data, this.state.from, this.state.to);

        // 只留不重複、0 ≤ 段號 < 段數的整數
        const steps = this.plan.steps.length;
        const done = knownPair && Array.isArray(saved.done) ? saved.done.filter((i) => Number.isInteger(i) && i >= 0 && i < steps) : [];
        this.state.done = new Set(done);

        if (steps > 0 && this.state.done.size === steps) {
            this.state.from = this.state.to;
            this.state.done = new Set();
            this.plan = ChocoboColorSolver.plan(this.data, this.state.from, this.state.to);
            this.save();
        }
    }

    save() {
        try {
            window.localStorage.setItem(ChocoboColorTool.STORAGE_KEY, JSON.stringify({
                from: this.state.from,
                to: this.state.to,
                done: [...this.state.done].sort((a, b) => a - b)
            }));
        } catch (error) {
            // 寫不進去（封鎖網站資料、容量已滿）：這次打開期間照常運作，只是下次打開不記得
        }
    }

    // ---------- 動作 ----------

    // 換顏色：兩個顏色都沒變就什麼都不做（餵到一半的人不會因為重選同一個顏色失去進度）；
    // 變了就清空打勾、重算、存起來、重畫。不認得的顏色不理
    setColors(from, to) {
        if (!this.data || !this.colors.has(from) || !this.colors.has(to)) return;
        if (from === this.state.from && to === this.state.to) return;
        this.state.from = from;
        this.state.to = to;
        this.state.done = new Set();
        this.plan = ChocoboColorSolver.plan(this.data, from, to);
        this.save();
        this.render();
    }

    // 打勾或取消：只改各列的 class、勾選框、「下一段」的小字與「還沒勾」的提醒、「已勾 x／M 段」與存檔，不重畫整張卡。
    // 段號不是這張答案裡的整數段就不理。打勾照樣自由（任何順序都行），只是不照順序時看得到提醒；
    // 打勾或取消新跳過了一段時，朗讀區也念那一段的提醒
    toggleStep(index, checked) {
        if (!this.plan || !Number.isInteger(index) || index < 0 || index >= this.plan.steps.length) return;
        const before = this.stepOrder().skipped;
        if (checked) this.state.done.add(index);
        else this.state.done.delete(index);
        this.save();

        const order = this.stepOrder();
        this.markSteps(order);
        this.doneElement.textContent = this.doneText();
        this.announceSkipped(before, order.skipped);
    }

    // ---------- 畫面 ----------

    render() {
        if (this.loadFailed) {
            this.renderLoadError();
            return;
        }
        if (!this.data) return;
        this.renderButtons();
        this.renderAnswer();
    }

    renderLoadError() {
        const message = ChocoboColorTool.element('p', 'error-message', this.t('chocobo_color_load_error', '載入顏色資料失敗，請重新整理頁面再試。'));
        this.elements.card.textContent = '';
        this.elements.card.appendChild(message);
        this.elements.card.hidden = false;
    }

    // 兩顆顏色按鈕：色塊（顏色的 RGB）與介面語言的名稱
    renderButtons() {
        for (const key of ['from', 'to']) {
            const color = this.colors.get(this.state[key]);
            this.elements[key].name.textContent = this.nameOf(color);
            this.elements[key].chip.style.background = ChocoboColorTool.rgbCss(color.rgb);
        }
    }

    renderAnswer() {
        const { plan } = this;
        const card = this.elements.card;
        card.textContent = '';
        this.rows = [];
        this.doneElement = null;

        let announce;
        if (plan.same) {
            announce = this.t('chocobo_color_same', '已經是{color}，不用餵。', { color: this.nameOf(this.colors.get(this.state.to)) });
            card.appendChild(ChocoboColorTool.element('p', 'answer-message', announce));
        } else if (plan.route === null) {
            announce = this.t('chocobo_color_none', '找不到每一步都不超出 RGB 範圍的做法。');
            card.appendChild(ChocoboColorTool.element('p', 'answer-message', announce));
        } else {
            card.appendChild(this.buildHead());
            card.appendChild(this.buildPrepare());
            card.appendChild(this.buildOrder());
            card.appendChild(this.buildSteps());
            const alt = this.altText();
            if (alt) card.appendChild(ChocoboColorTool.element('p', 'answer-alt', alt));
            // 朗讀摘要用答案卡第一行那兩句組成（已經分好單複數），不另外寫一套單數的寫法
            announce = this.t('chocobo_color_announce', '{color}：{total}，{segments}', {
                color: this.nameOf(this.colors.get(this.state.to)),
                total: this.totalText(),
                segments: this.segmentsText()
            });
        }
        card.hidden = false;

        // 朗讀摘要只在內容真的不同時才換，同樣的內容重畫不會再念一次（朗讀區原本寫著跳過的提醒時，換成摘要，不再是提醒了）
        if (this.elements.announce.textContent !== announce) this.elements.announce.textContent = announce;
        this.skipAnnounced = false;
    }

    // 「共 N 顆」「分 M 段」：數字是 1 時用單數的寫法（三種語言各有自己的）。答案卡第一行與朗讀摘要都用這兩句
    totalText() {
        const n = this.plan.total;
        return n === 1
            ? this.t('chocobo_color_total_one', '共 1 顆')
            : this.t('chocobo_color_total', '共 {n} 顆', { n });
    }

    segmentsText() {
        const n = this.plan.steps.length;
        return n === 1
            ? this.t('chocobo_color_segments_one', '分 1 段')
            : this.t('chocobo_color_segments', '分 {n} 段', { n });
    }

    // 第一行：共 N 顆、分 M 段、已勾 x／M 段
    buildHead() {
        const head = ChocoboColorTool.element('div', 'answer-head');
        head.appendChild(ChocoboColorTool.element('span', 'answer-total', this.totalText()));
        head.appendChild(ChocoboColorTool.element('span', 'answer-segments', this.segmentsText()));
        this.doneElement = ChocoboColorTool.element('span', 'answer-done', this.doneText());
        head.appendChild(this.doneElement);
        return head;
    }

    doneText() {
        const total = this.plan.steps.length;
        const done = this.state.done.size;
        return done === total
            ? this.t('chocobo_color_all_done', '全部勾完')
            : this.t('chocobo_color_done', '已勾 {done}／{total} 段', { done, total });
    }

    // 要準備：每種水果的總顆數（含檸檬），照第一次出現在步驟裡的順序
    buildPrepare() {
        const totals = new Map();
        for (const step of this.plan.steps) totals.set(step.fruit, (totals.get(step.fruit) || 0) + step.count);

        const prepare = ChocoboColorTool.element('div', 'answer-prepare');
        prepare.appendChild(ChocoboColorTool.element('span', 'answer-prepare-label', this.t('chocobo_color_prepare', '要準備')));
        for (const [id, count] of totals) {
            const fruit = this.fruits.get(id);
            const item = ChocoboColorTool.element('span', 'answer-fruit');
            item.appendChild(this.fruitDot(fruit));
            item.appendChild(document.createTextNode(`${this.nameOf(fruit)} ×${count}`));
            prepare.appendChild(item);
        }
        return prepare;
    }

    // 步驟列表前面的一行標籤：「餵食順序」。一列一列帶編號、能打勾的東西，玩家不一定看得出那就是餵食順序，所以明講；
    // 兩段以上再接一句怎麼照著餵（只有一段沒有順序可言，就只有標題）。後半句自己帶前面的標點，直接接在標題後面。
    // 列表用標題當名稱（aria-labelledby 指向 #answerOrderTitle，見 buildSteps()）
    buildOrder() {
        const line = ChocoboColorTool.element('p', 'answer-order');
        const title = ChocoboColorTool.element('span', 'answer-order-title', this.t('chocobo_color_order_title', '餵食順序'));
        title.id = 'answerOrderTitle';
        line.appendChild(title);
        const n = this.plan.steps.length;
        if (n >= 2) {
            line.appendChild(ChocoboColorTool.element('span', 'answer-order-hint', this.t('chocobo_color_order_hint', '：照 1 → {n} 餵，一段餵完再換下一段', { n })));
        }
        return line;
    }

    buildSteps() {
        const list = ChocoboColorTool.element('ol', 'answer-steps');
        // 清單拿掉了項目符號（list-style: none），Safari 會因此不把它當清單；明寫 role="list"，名稱「餵食順序」才念得出來
        list.setAttribute('role', 'list');
        list.setAttribute('aria-labelledby', 'answerOrderTitle');
        const order = this.stepOrder();
        this.plan.steps.forEach((step, index) => {
            const row = this.buildStep(step, index);
            this.markStep(row, index, order);
            this.rows.push(row);
            list.appendChild(row.item);
        });
        return list;
    }

    // 一段一列：勾選框（名稱念出整段意思）加 label（段號、色點、水果名稱、×顆數）。
    // 水果是資料裡有 resetsTo 的那一顆（檸檬）時，有一個 note「變回沙漠黃」。
    // 打勾了沒、是不是下一段、有沒有被跳過都不在這裡畫：那些隨打勾改變的部分由 markStep() 補上（畫出來與打勾之後用同一個函式）。
    // 回傳這一列的 { item, box, text（名稱那一格）, note（檸檬的「變回…」，不是檸檬就是 null）, sub（名稱下面的小字，目前沒有是 null）,
    // next（小字裡的「下一段」，目前不是下一段就是 null）, warning（跳過的提醒，目前沒有是 null）, isNext（目前標成下一段嗎，還沒決定是 null） }
    buildStep(step, index) {
        const fruit = this.fruits.get(step.fruit);
        const name = this.nameOf(fruit);

        const item = ChocoboColorTool.element('li', 'answer-step');
        const box = ChocoboColorTool.element('input', 'answer-check');
        box.type = 'checkbox';
        box.id = `step-${index}`;
        box.dataset.index = String(index);
        box.setAttribute('aria-label', this.t('chocobo_color_step_label', '第 {n} 段：{fruit} {count} 顆', { n: index + 1, fruit: name, count: step.count }));

        const text = ChocoboColorTool.element('span', 'answer-step-text');
        text.appendChild(ChocoboColorTool.element('span', 'answer-step-name', name));
        const note = fruit.resetsTo
            ? ChocoboColorTool.element('span', 'answer-step-note', this.t('chocobo_color_reset_note', '變回{color}', { color: this.nameOf(this.colors.get(fruit.resetsTo)) }))
            : null;

        const label = document.createElement('label');
        label.setAttribute('for', box.id);
        label.appendChild(ChocoboColorTool.element('span', 'answer-step-no', String(index + 1)));
        label.appendChild(this.fruitDot(fruit));
        label.appendChild(text);
        label.appendChild(ChocoboColorTool.element('span', 'answer-step-count', `×${step.count}`));

        item.appendChild(box);
        item.appendChild(label);
        return { item, box, text, note, sub: null, next: null, warning: null, isNext: null };
    }

    // 勾的順序：next 是第一個還沒勾的段（全部勾完是 -1）；skipped 是還沒勾、後面卻有段已經勾了的那些段（由小到大）。
    // 有被跳過的段時，next 一定在裡面（它是最前面那個還沒勾的，後面既然有勾的，它就被跳過了）
    stepOrder() {
        const { done } = this.state;
        const last = Math.max(-1, ...done);
        let next = -1;
        const skipped = [];
        for (let index = 0; index < this.plan.steps.length; index += 1) {
            if (done.has(index)) continue;
            if (next === -1) next = index;
            if (index < last) skipped.push(index);
        }
        return { next, skipped };
    }

    // 每一列依現在的勾法補上或拿掉：is-done 與勾選框、is-next 與名稱下面的小字、被跳過的提醒、勾選框的描述。畫出來與打勾之後都用它
    markSteps(order) {
        this.rows.forEach((row, index) => this.markStep(row, index, order));
    }

    markStep(row, index, { next, skipped }) {
        const isDone = this.state.done.has(index);
        row.item.classList.toggle('is-done', isDone);
        row.item.classList.toggle('is-next', index === next);
        row.box.checked = isDone;
        this.setSub(row, index, index === next);
        this.setWarning(row, index, skipped.includes(index));
        this.describe(row);
    }

    // 名稱下面那一行小字：下一段那一列先寫「下一段」，檸檬那一列後面接「變回沙漠黃」（同一行，中間一個各語言自己的分隔字），
    // 都不是就沒有這一行。note 是這一列一直拿著的同一個元素，重組小字時搬進新的一行；是不是下一段沒變就不動。
    // 「下一段」有 id（step-next-N），給 describe() 指
    setSub(row, index, isNext) {
        if (row.isNext === isNext) return;
        row.isNext = isNext;
        row.sub?.remove();
        row.sub = null;
        row.next = null;
        if (!isNext && row.note === null) return;

        const sub = ChocoboColorTool.element('span', 'answer-step-sub');
        if (isNext) {
            row.next = ChocoboColorTool.element('span', 'answer-step-next', this.t('chocobo_color_next', '下一段'));
            row.next.id = `step-next-${index}`;
            sub.appendChild(row.next);
            if (row.note) sub.appendChild(document.createTextNode(this.t('chocobo_color_next_sep', '・')));
        }
        if (row.note) sub.appendChild(row.note);
        row.text.appendChild(sub);
        row.sub = sub;
    }

    // 被跳過的段在 label 下面多一行提醒（id 是 step-warning-N，給 describe() 指）；順序對了就拿掉。已經是這個狀態就不動
    setWarning(row, index, isSkipped) {
        if ((row.warning !== null) === isSkipped) return;
        if (!isSkipped) {
            row.warning.remove();
            row.warning = null;
            return;
        }
        const warning = ChocoboColorTool.element('p', 'answer-step-warning', this.skippedText(index));
        warning.id = `step-warning-${index}`;
        row.item.appendChild(warning);
        row.warning = warning;
    }

    // 勾選框的描述（aria-describedby）：「下一段」在前、跳過的提醒在後，兩個都有就都列（念成「下一段 第 2 段還沒勾…」），都沒有就拿掉屬性。
    // 勾選框的名稱是 aria-label（整段的意思，不含「下一段」），所以用 Tab 走到勾選框時，「下一段」要靠描述才聽得到。
    // 兩樣東西的 aria-describedby 都在這裡一起處理；值沒變就不動屬性
    describe(row) {
        const ids = [row.next, row.warning].filter((element) => element !== null).map((element) => element.id);
        if (ids.length === 0) {
            row.box.removeAttribute('aria-describedby');
        } else if (row.box.getAttribute('aria-describedby') !== ids.join(' ')) {
            row.box.setAttribute('aria-describedby', ids.join(' '));
        }
    }

    skippedText(index) {
        return this.t('chocobo_color_skipped', '第 {n} 段還沒勾：不照順序餵，顏色可能會跑掉', { n: index + 1 });
    }

    // 打勾或取消後新跳過了一段：朗讀區也念那一段的提醒（看不到畫面的人聽不到每一列的提醒）。同時新跳過好幾段時念最前面那一段
    // （也就是下一段，該回去補的就是它）。順序又對了、或這一次沒有新跳過的段時，什麼都不念；朗讀區若還寫著上一句提醒就清空
    // （不是換回摘要：那會再念一次）。清空是因為有些瀏覽器與輔助科技對文字沒變的內容不會再念，先清空，
    // 下一次寫進同一句提醒時內容就一定有變
    announceSkipped(before, after) {
        const fresh = after.find((index) => !before.includes(index));
        const { announce } = this.elements;
        if (fresh !== undefined) {
            announce.textContent = this.skippedText(fresh);
            this.skipAnnounced = true;
        } else if (this.skipAnnounced) {
            announce.textContent = '';
            this.skipAnnounced = false;
        }
    }

    // 水果的色點：只是裝飾（aria-hidden），顏色是資料
    fruitDot(fruit) {
        const dot = ChocoboColorTool.element('i', 'fruit-dot');
        dot.setAttribute('aria-hidden', 'true');
        dot.style.background = fruit.color;
        return dot;
    }

    // 另一個做法那一行：用了檸檬就寫直接調色要幾顆；沒用檸檬又有檸檬做法（目前顏色不是檸檬變回的顏色）就寫先餵檸檬要幾顆；都沒有就不寫
    altText() {
        const { route, directTotal, lemonTotal } = this.plan;
        if (route === 'lemon') {
            return directTotal === null
                ? this.t('chocobo_color_alt_direct_none', '直接調色找不到每一步都不超出 RGB 範圍的做法')
                : this.t('chocobo_color_alt_direct', '直接調色要 {n} 顆', { n: directTotal });
        }
        return lemonTotal === null ? null : this.t('chocobo_color_alt_lemon', '先餵 1 顆檸檬再調色要 {n} 顆', { n: lemonTotal });
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.chocoboColorTool = new ChocoboColorTool();
});
