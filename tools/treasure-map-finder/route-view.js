// 路線頁：清單面板的第二頁（標記在 index.html 的 #routeView），一站一張寶圖，站序由 RouteCalculator 排。
// 目前這一站（依順序第一個還沒完成的）標亮並預覽會被複製的句子；每一站都能標記「完成」（RouteProgress，只記在這台裝置）；
// 「複製下一站」複製目前這一站，「全部複製」一站一行。摘要、站別與按鈕上帶參數的字由這裡依清單、進度與語言組出來、不掛 data-i18n：
// I18nManager 切換語言時會把 [data-i18n] 的文字整個換掉
class RouteView {
    // 遊戲的使用者巨集一個最多 15 行：全部複製超過這個行數就提醒要分兩次貼
    static MACRO_MAX_LINES = 15;

    constructor(finder) {
        this.finder = finder;
        this.calculator = new RouteCalculator();
        // 存過的複製格式；沒存過是 null（跟著介面語言用預設範本）。讀到舊的 { teleport, map } 時 CopyFormat.read() 順便轉成新格式寫回
        this.savedTemplate = CopyFormat.read(FilterManager.safeStorage(window));
        // 上一次畫的每一站（describeOrder 的站加上 describeListItem 的顯示資料與 done）：複製、完成的按鈕用它找到是哪一站。
        // 站序與完成記號以存著的進度為準，畫面上的這一份可能已經過時（見 toggleDone）
        this.stops = [];
        // 上一次畫的時候的清單 id（依清單順序）、介面語言與複製格式：refresh() 只在這幾樣變了才重畫
        this.renderedKey = null;

        const byId = id => document.getElementById(id);
        this.elements = {
            panel: byId('myListPanel'),
            listView: byId('listView'),
            listTitle: byId('myListPanel-title'),
            generateBtn: byId('generateRouteBtn'),
            routeView: byId('routeView'),
            backBtn: byId('routeBackBtn'),
            title: byId('routeViewTitle'),
            closeBtn: byId('closeRouteViewBtn'),
            body: byId('routeBody'),
            overview: byId('routeOverview'),
            note: byId('routeNote'),
            resetBtn: byId('resetRouteBtn'),
            stops: byId('routeStops'),
            copyAllBtn: byId('copyAllStopsBtn'),
            copyNextBtn: byId('copyNextStopBtn'),
            copyNextLabel: byId('copyNextStopLabel')
        };
    }

    // 由 TreasureMapFinder#setupEventListeners() 呼叫：接上標頭、摘要與底部的按鈕；每一站的 📋 與「完成」委派給 #routeStops
    init() {
        const { elements } = this;
        elements.backBtn.addEventListener('click', () => this.showList('generate'));
        // ✕ 關掉整個面板（Escape、點遮罩也是，由清單面板的 ModalManager 與遮罩處理）
        elements.closeBtn.addEventListener('click', () => this.finder.closeListPanel());
        elements.resetBtn.addEventListener('click', () => this.resetProgress());
        elements.copyAllBtn.addEventListener('click', () => this.copyAll());
        elements.copyNextBtn.addEventListener('click', () => this.copyNext());
        elements.stops.addEventListener('click', event => {
            const button = event.target.closest('button[data-action]');
            const mapId = button?.closest('.tm-stop')?.dataset.mapId;
            if (mapId === undefined) return;
            if (button.dataset.action === 'copy') {
                this.copyStop(this.stops.findIndex(stop => stop.mapId === mapId));
            } else if (button.dataset.action === 'done') {
                this.toggleDone(mapId);
            }
        });
    }

    // 清單面板開著，而且顯示的是路線頁
    isOpen() {
        return this.finder.modalManager.activeModal === this.elements.panel && !this.elements.routeView.classList.contains('hidden');
    }

    // 切到路線頁（「生成路線」，見 TreasureMapFinder#openRoute）；清單是空的就不切。面板改由標題「路線」命名，
    // 畫好之後焦點放到標題，螢幕閱讀器會唸出「路線」
    show() {
        if (this.finder.listManager.getLength() === 0) return;
        const { elements } = this;
        elements.listView.classList.add('hidden');
        elements.routeView.classList.remove('hidden');
        elements.panel.setAttribute('aria-labelledby', 'routeViewTitle');
        this.render();
        elements.title.focus();
    }

    // 切回清單頁。focusTarget：'generate' 焦點放到「生成路線」（按「‹ 清單」），'title' 放到清單頁的標題（清單空了），
    // null 不動（打開面板之前先回到清單頁，初始焦點由 ModalManager 決定）
    showList(focusTarget) {
        const { elements } = this;
        elements.routeView.classList.add('hidden');
        elements.listView.classList.remove('hidden');
        elements.panel.setAttribute('aria-labelledby', 'myListPanel-title');
        if (focusTarget === 'generate') {
            elements.generateBtn.focus();
        } else if (focusTarget === 'title') {
            elements.listTitle.focus();
        }
    }

    // 清單變了（加入、移除、匯入、隊伍同步）或切換語言時由 TreasureMapFinder#renderMyList() 呼叫。路線頁沒開著時只對齊進度、不畫（見 syncHiddenProgress）；
    // 清單空了回到清單頁（焦點放到標題，不掉到 body）。隊伍每 2 秒輪詢一次都會經過這裡：只有清單 id（依清單順序）、介面語言
    // 或複製格式和上一次畫的時候不同才重畫，路線頁不會跟著閃
    refresh() {
        if (!this.isOpen()) {
            this.syncHiddenProgress();
            return;
        }
        const list = this.finder.listManager.getList();
        if (list.length === 0) {
            this.showList('title');
        } else if (this.renderKey(list) !== this.renderedKey) {
            this.render();
        }
    }

    renderKey(list) {
        return JSON.stringify([list.map(item => item.id), window.i18n.getCurrentLanguage(), this.savedTemplate]);
    }

    // 路線頁沒開著時清單變了：已經有進度就照樣對齊清單（和開著時同一套規則，不在清單裡的從站序與完成記號拿掉），
    // 不然移除再加回同一個地點的寶圖時，它會帶著舊的完成記號被跳過。要整份重來（例如全部完成之後清單又有變化）就清掉，
    // 等打開路線頁才依第一次排序的規則排；還沒有進度（沒打開過路線頁、或已經清掉）就不建立；沒變不存，不延長 12 小時
    syncHiddenProgress() {
        const { routeProgress, listManager } = this.finder;
        if (!routeProgress.get()) return;
        const synced = this.syncedProgress(listManager.getList());
        if (synced.restarted) {
            routeProgress.clear();
        } else if (synced.changed) {
            routeProgress.save({ order: synced.order, done: synced.done });
        }
    }

    // 把進度對齊目前的清單（RouteProgress.sync：站序照 RouteCalculator 的規則；只有真的變了才存，光是打開路線頁不會延長 12 小時），
    // 再畫出摘要、站別與底部。站別整排換新：捲動位置與焦點先記下來、畫完放回去——焦點在某一站的 📋 或「完成」上就放回同一站的
    // 同一顆，那一站不在了放到標題；在「重設進度」或「複製下一站」上而它這次藏起來或停用了，也放到標題
    render() {
        const { finder, calculator, elements } = this;
        const list = finder.listManager.getList();
        const synced = this.syncedProgress(list);
        if (synced.changed) finder.routeProgress.save({ order: synced.order, done: synced.done });

        const items = new Map(list.map(item => [item.id, item]));
        const doneIds = new Set(synced.done);
        const { stops, summary } = calculator.describeOrder(synced.order, list);
        this.stops = stops.map(stop => ({ ...stop, info: finder.describeListItem(items.get(stop.mapId)), done: doneIds.has(stop.mapId) }));
        this.renderedKey = this.renderKey(list);

        const scrollTop = elements.body.scrollTop;
        const active = document.activeElement;
        const stopButton = elements.stops.contains(active) ? active.closest('button[data-action]') : null;
        const focused = stopButton ? { mapId: stopButton.closest('.tm-stop').dataset.mapId, action: stopButton.dataset.action } : null;

        this.renderSummary(summary);
        const current = this.currentIndex();
        SecurityUtils.clearElement(elements.stops);
        this.stops.forEach((stop, index) => elements.stops.appendChild(this.createStop(stop, index, index === current)));
        this.renderFooter(current);

        elements.body.scrollTop = scrollTop;
        if (focused) {
            // 不用 id 組選擇器：匯入的自訂寶圖 id 可能有引號
            const item = Array.from(elements.stops.children).find(li => li.dataset.mapId === focused.mapId);
            (item?.querySelector(`[data-action="${focused.action}"]`) ?? elements.title).focus();
        } else if ((active === elements.resetBtn && elements.resetBtn.classList.contains('hidden'))
            || (active === elements.copyNextBtn && elements.copyNextBtn.disabled)) {
            elements.title.focus();
        }
    }

    // 把存著的進度對齊目前的清單（RouteProgress.sync）：進度被清掉或過期就整份重來。不存：沒變的話不該延長 12 小時，要不要存由呼叫端決定
    syncedProgress(list) {
        const { finder, calculator } = this;
        return RouteProgress.sync(finder.routeProgress.get(), list.map(item => item.id), {
            firstOrder: () => calculator.firstOrder(list),
            mergeOrder: prev => calculator.mergeOrder(prev, list)
        });
    }

    // 摘要：還沒完成任何一站時寫張數、地區與傳送次數；有完成的改寫進度並出現「重設進度」；全部完成時收起「順序依直線距離估算」
    renderSummary(summary) {
        const { elements } = this;
        const total = this.stops.length;
        const done = this.stops.filter(stop => stop.done).length;
        if (done === 0) {
            elements.overview.textContent = FF14Utils.getI18nText('treasure_map_route_overview', '{maps} 張 · {zones} 個地區 · {teleports} 次傳送', summary);
        } else if (done < total) {
            elements.overview.textContent = FF14Utils.getI18nText('treasure_map_route_progress', '完成 {done}/{total}', { done, total });
        } else {
            elements.overview.textContent = FF14Utils.getI18nText('treasure_map_route_all_done', '{total} 站都完成了', { total });
        }
        elements.note.classList.toggle('hidden', done === total);
        elements.resetBtn.classList.toggle('hidden', done === 0);
    }

    // 一站：站號圓圈（對輔助科技隱藏，完成時是 ✓）；這一站之前要傳送時先一行「🔮 傳送 …」，再來是名稱與座標，目前這一站多一行
    // 會被複製的句子；右邊 📋 與「完成」切換鈕（aria-pressed）。兩顆按鈕的名稱都帶站號才分得出是哪一站
    createStop(stop, index, isCurrent) {
        const { info } = stop;
        const n = index + 1;
        const item = document.createElement('li');
        item.className = 'tm-stop';
        item.classList.toggle('is-current', isCurrent);
        item.classList.toggle('is-done', stop.done);
        item.dataset.mapId = stop.mapId;
        // 目前這一站對輔助科技標成「這一步」；整排站別每次重畫，換站時舊的那一站自然不再有它
        if (isCurrent) item.setAttribute('aria-current', 'step');

        const num = document.createElement('span');
        num.className = 'tm-stop-num';
        num.setAttribute('aria-hidden', 'true');
        num.textContent = stop.done ? '✓' : String(n);
        item.appendChild(num);

        const body = document.createElement('div');
        body.className = 'tm-stop-body';
        // 傳送標在一組（同地區、同最近傳送點）的第一站，傳送到這一站最近的傳送點（和卡片的「最近」同一個）
        if (stop.teleport && info.nearest) {
            const teleport = document.createElement('p');
            teleport.className = 'tm-stop-tp';
            const icon = document.createElement('span');
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = '🔮';
            teleport.appendChild(icon);
            const name = RouteView.pickName(info.nearest.name);
            teleport.appendChild(document.createTextNode(` ${FF14Utils.getI18nText('treasure_map_route_teleport', '傳送 {name}', { name })}`));
            body.appendChild(teleport);
        }
        body.appendChild(RouteView.createParagraph('tm-stop-title', info.name));
        body.appendChild(RouteView.createParagraph('tm-stop-coords', info.coordsText));
        if (isCurrent) body.appendChild(RouteView.createParagraph('tm-stop-preview', this.stopText(index)));
        item.appendChild(body);

        const actions = document.createElement('div');
        actions.className = 'tm-stop-actions';
        // 只有圖示：名稱放在 aria-label 與 title（同卡片的複製鈕）
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn btn-sm btn-icon-only';
        copyBtn.dataset.action = 'copy';
        const copyLabel = FF14Utils.getI18nText('treasure_map_route_copy_stop', '複製第 {n} 站', { n });
        copyBtn.setAttribute('aria-label', copyLabel);
        copyBtn.setAttribute('title', copyLabel);
        copyBtn.textContent = '📋';
        actions.appendChild(copyBtn);

        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'btn btn-sm tm-done';
        doneBtn.dataset.action = 'done';
        doneBtn.setAttribute('aria-pressed', String(stop.done));
        doneBtn.setAttribute('aria-label', FF14Utils.getI18nText('treasure_map_route_done_label', '標記第 {n} 站完成', { n }));
        if (stop.done) {
            const check = document.createElement('span');
            check.setAttribute('aria-hidden', 'true');
            check.textContent = '✓ ';
            doneBtn.appendChild(check);
        }
        doneBtn.appendChild(document.createTextNode(FF14Utils.getI18nText('treasure_map_route_done', '完成')));
        actions.appendChild(doneBtn);
        item.appendChild(actions);
        return item;
    }

    // 主要按鈕複製目前這一站；全部完成時停用並寫「全部完成」
    renderFooter(current) {
        const { elements } = this;
        elements.copyNextBtn.disabled = current === -1;
        elements.copyNextLabel.textContent = current === -1
            ? FF14Utils.getI18nText('treasure_map_route_finished', '全部完成')
            : FF14Utils.getI18nText('treasure_map_route_copy_next', '複製下一站（{n}/{total}）', { n: current + 1, total: this.stops.length });
    }

    // 目前這一站：依順序第一個還沒完成的（第幾個，從 0 開始）；全部完成時是 -1
    currentIndex() {
        return this.stops.findIndex(stop => !stop.done);
    }

    // 第 index 站（從 0 開始）用目前生效的格式複製成的句子；變數的值都來自 describeListItem()
    stopText(index) {
        const { info } = this.stops[index];
        return CopyFormat.render(this.activeTemplate(), {
            index: index + 1,
            total: this.stops.length,
            grade: info.grade,
            zone: info.zoneNames,
            coords: info.coordsText,
            aetheryte: info.nearest?.name ?? null
        });
    }

    // 目前生效的格式：存過的照存的，沒存過跟著介面語言
    activeTemplate() {
        return CopyFormat.activeTemplate(this.savedTemplate, window.i18n.getCurrentLanguage());
    }

    // 每站的 📋：複製那一站
    async copyStop(index) {
        if (!(await this.writeClipboard(this.stopText(index)))) return;
        FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_route_copied_stop', '已複製第 {n} 站', { n: index + 1 }), 'success');
    }

    // 「複製下一站」：複製目前這一站（全部完成時按鈕是停用的）
    async copyNext() {
        const index = this.currentIndex();
        if (index !== -1) await this.copyStop(index);
    }

    // 「全部複製」：每一站一行（包括完成的站）用換行接起來。自訂格式可能自己帶換行，所以照實際的行數判斷會不會超過一個巨集的 15 行
    async copyAll() {
        const text = this.stops.map((stop, index) => this.stopText(index)).join('\n');
        if (!(await this.writeClipboard(text))) return;
        const lines = text.split('\n').length;
        if (lines > RouteView.MACRO_MAX_LINES) {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_route_copied_too_many', '已複製 {count} 行。遊戲的使用者巨集最多 15 行，超過的部分要分兩次貼。', { count: lines }), 'warning');
        } else {
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_route_copied_all', '已複製 {count} 站', { count: this.stops.length }), 'success');
        }
    }

    // 寫進剪貼簿。被拒絕、或瀏覽器沒有剪貼簿 API（navigator.clipboard 是 undefined）都跳「複製失敗」並回傳 false
    async writeClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('複製失敗:', err);
            FF14Utils.showToast(FF14Utils.getI18nText('treasure_map_copy_failed', '複製失敗'), 'error');
            return false;
        }
    }

    // 「完成」：切換這一站的完成記號、存起來、重畫（焦點由 render() 放回按下的那一顆）。畫面上的站序與完成記號是上一次重畫時的樣子，
    // 進度可能在那之後被清掉（清空、取代）或過期（頁面開了一整夜）：先對齊一次存著的進度，再在它上面切換，不把畫面上舊的記號又存回去。
    // 標記完成時用 #listAnnouncer 唸出下一站（新的目前這一站），最後一站也完成了就唸全部完成；取消完成不唸
    toggleDone(mapId) {
        if (!this.stops.some(stop => stop.mapId === mapId)) return;
        const synced = this.syncedProgress(this.finder.listManager.getList());
        const marking = !synced.done.includes(mapId);
        const done = marking ? [...synced.done, mapId] : synced.done.filter(id => id !== mapId);
        this.finder.routeProgress.save({ order: synced.order, done });
        this.render();
        if (!marking) return;
        // 站號看重畫之後的站序：進度重來時站序可能和剛才畫面上的不一樣
        const n = this.stops.findIndex(stop => stop.mapId === mapId) + 1;
        const next = this.stops[this.currentIndex()];
        this.finder.elements.listAnnouncer.textContent = next
            ? FF14Utils.getI18nText('treasure_map_route_announce_done', '第 {n} 站完成。下一站：{next}', {
                n,
                next: `${next.info.grade} ${next.info.zoneName} ${next.info.coordsText}`
            })
            : FF14Utils.getI18nText('treasure_map_route_announce_all_done', '第 {n} 站完成。全部完成了', { n });
    }

    // 「重設進度」：完成記號與站序整份清掉，站序照第一次排序的規則重排；「重設進度」跟著藏起來，焦點放到標題
    resetProgress() {
        this.finder.routeProgress.clear();
        this.render();
        this.elements.title.focus();
    }

    // 名稱的目前語言版本，沒有這個語言時用中文（同清單的每一列）
    static pickName(names) {
        return names[window.i18n.getCurrentLanguage()] || names.zh;
    }

    static createParagraph(className, text) {
        const paragraph = document.createElement('p');
        paragraph.className = className;
        paragraph.textContent = text;
        return paragraph;
    }
}
