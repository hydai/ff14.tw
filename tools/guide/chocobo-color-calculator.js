/**
 * Chocobo Color Calculator
 * 陸行鳥染色計算器
 *
 * 計算從當前顏色到目標顏色所需的水果數量與餵食順序
 */
class ChocoboColorCalculator {
    constructor() {
        this.colors = [];
        this.fruits = [];
        this.colorMap = new Map();
        this.fruitMap = new Map();
        this.lang = 'zh';

        this.elements = {
            calculator: null,
            currentSelect: null,
            targetSelect: null,
            currentPreview: null,
            targetPreview: null,
            calculateBtn: null,
            resultArea: null,
            fruitList: null,
            showOrderBtn: null,
            feedingOrder: null
        };
    }

    /**
     * 初始化計算器
     */
    async init() {
        this.cacheElements();
        if (!await this.loadData()) {
            if (this.elements.calculateBtn) this.elements.calculateBtn.disabled = true;
            return;
        }
        this.bindEvents();

        // 監聽語言變更；讀取目前語言要放在畫面渲染前，避免第一次載入時畫面停留在中文
        if (window.i18n) {
            this.lang = window.i18n.getCurrentLanguage() || 'zh';
            window.i18n.onLanguageChange(() => this.updateLanguage());
        }

        this.populateSelects();
        this.updatePreviews();
    }

    /**
     * 載入顏色資料
     */
    async loadData() {
        try {
            const response = await fetch('../../data/chocobo-colors.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.colors = data.colors;
            this.fruits = data.fruits;
            this.defaultColorId = data.meta?.defaultColor || 'desert-yellow';

            // 建立 Map 以加速查詢 (O(1))
            this.colorMap.clear();
            for (const color of this.colors) {
                this.colorMap.set(color.id, color);
            }
            this.fruitMap.clear();
            for (const fruit of this.fruits) {
                this.fruitMap.set(fruit.id, fruit);
            }
            return true;
        } catch (error) {
            console.error('Failed to load chocobo colors data:', error);
            this.showError();
            return false;
        }
    }

    /**
     * 快取 DOM 元素
     */
    cacheElements() {
        this.elements = {
            calculator: document.getElementById('colorCalculator'),
            currentSelect: document.getElementById('currentColorSelect'),
            targetSelect: document.getElementById('targetColorSelect'),
            currentPreview: document.getElementById('currentColorPreview'),
            targetPreview: document.getElementById('targetColorPreview'),
            calculateBtn: document.getElementById('calculateBtn'),
            resultArea: document.getElementById('resultArea'),
            fruitList: document.getElementById('fruitList'),
            showOrderBtn: document.getElementById('showOrderBtn'),
            feedingOrder: document.getElementById('feedingOrder')
        };
    }

    /**
     * 綁定事件
     */
    bindEvents() {
        if (this.elements.currentSelect) {
            this.elements.currentSelect.addEventListener('change', () => this.updatePreviews());
        }
        if (this.elements.targetSelect) {
            this.elements.targetSelect.addEventListener('change', () => this.updatePreviews());
        }
        if (this.elements.calculateBtn) {
            this.elements.calculateBtn.addEventListener('click', () => this.calculate());
        }
        if (this.elements.showOrderBtn) {
            this.elements.showOrderBtn.addEventListener('click', () => this.toggleFeedingOrder());
        }
    }

    /**
     * 清空元素的所有子節點
     */
    clearChildren(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    /**
     * 填充顏色選單
     */
    populateSelects() {
        if (!this.elements.currentSelect || !this.elements.targetSelect) return;

        const currentId = this.elements.currentSelect.value || this.defaultColorId;
        const targetId = this.elements.targetSelect.value || 'snow-white';
        // 清空選單
        this.clearChildren(this.elements.currentSelect);
        this.clearChildren(this.elements.targetSelect);

        // 填入顏色選項
        this.colors.forEach(color => {
            const optionCurrent = document.createElement('option');
            optionCurrent.value = color.id;
            optionCurrent.textContent = color.names[this.lang] || color.names.zh;

            const optionTarget = optionCurrent.cloneNode(true);

            this.elements.currentSelect.appendChild(optionCurrent);
            this.elements.targetSelect.appendChild(optionTarget);
        });

        // 設定預設值
        this.elements.currentSelect.value = currentId;
        this.elements.targetSelect.value = targetId;
    }

    /**
     * 更新顏色預覽
     */
    updatePreviews() {
        const currentColor = this.getColorById(this.elements.currentSelect?.value);
        const targetColor = this.getColorById(this.elements.targetSelect?.value);

        if (currentColor && this.elements.currentPreview) {
            this.elements.currentPreview.style.backgroundColor =
                `rgb(${currentColor.rgb[0]}, ${currentColor.rgb[1]}, ${currentColor.rgb[2]})`;
        }

        if (targetColor && this.elements.targetPreview) {
            this.elements.targetPreview.style.backgroundColor =
                `rgb(${targetColor.rgb[0]}, ${targetColor.rgb[1]}, ${targetColor.rgb[2]})`;
        }
    }

    /**
     * 根據 ID 取得顏色資料 (O(1) Map 查詢)
     */
    getColorById(id) {
        return this.colorMap.get(id);
    }

    /**
     * 根據 ID 取得水果資料 (O(1) Map 查詢)
     */
    getFruitById(id) {
        return this.fruitMap.get(id);
    }

    /**
     * 計算所需水果
     */
    calculate() {
        const currentColorId = this.elements.currentSelect?.value;
        const targetColorId = this.elements.targetSelect?.value;

        if (!currentColorId || !targetColorId) return;

        const currentColor = this.getColorById(currentColorId);
        const targetColor = this.getColorById(targetColorId);

        if (!currentColor || !targetColor) return;

        const plan = this.planFeeding(currentColor, targetColor);
        if (!plan) {
            this.lastPlan = null;
            if (this.elements.resultArea) this.elements.resultArea.style.display = 'none';
            this.showError(this.getTranslation('chocobo_no_safe_recipe', '無法找到不超出 RGB 範圍的配方，請嘗試先染成其他顏色。'));
            return;
        }
        this.elements.calculator?.querySelector('.error-message')?.remove();
        this.displayResults(plan);
    }

    /**
     * 水果同時改變三個通道。用三個線性獨立的效果向量求整數用量，
     * 負用量則選效果完全相反的水果；不將水果名稱與通道效果另寫一份對照。
     */
    calculateRequiredFruits(diff) {
        const channels = ['r', 'g', 'b'];
        const basis = ['xelphatol-apple', 'mamook-pear', 'oghomoro-berries'].map(id => this.getFruitById(id));
        const columns = basis.map(fruit => channels.map(channel => fruit.effect[channel]));
        const determinant = ([a, b, c]) =>
            a[0] * (b[1] * c[2] - b[2] * c[1]) -
            b[0] * (a[1] * c[2] - a[2] * c[1]) +
            c[0] * (a[1] * b[2] - a[2] * b[1]);
        const denominator = determinant(columns);
        const delta = channels.map(channel => diff[channel]);
        const result = [];
        for (let i = 0; i < basis.length; i++) {
            const replaced = columns.map((column, index) => index === i ? delta : column);
            const amount = determinant(replaced) / denominator;
            if (!Number.isInteger(amount)) return null;
            if (amount === 0) continue;
            const fruit = amount > 0 ? basis[i] : this.fruits.find(candidate =>
                candidate.effect && channels.every(channel => candidate.effect[channel] === -basis[i].effect[channel]));
            if (!fruit) return null;
            result.push({ fruit, count: Math.abs(amount) });
        }
        return result;
    }

    /**
     * RGB 以 5 為步長，目標色通常不在可達格點上。從附近格點中選擇
     * 最接近目標且仍會對應到目標色的點，再安排全程不發生 clipping 的餵食順序。
     * 這是依平均 RGB 效果的估算，遊戲中的隨機變化仍可能需要後續微調。
     */
    planFeeding(currentColor, targetColor) {
        if (currentColor.id === targetColor.id) return { fruits: [], order: [], rgb: [...currentColor.rgb] };
        const distance = (a, b) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
        const nearby = targetColor.rgb.map((value, index) => {
            const nearest = Math.round((value - currentColor.rgb[index]) / 5);
            return [-2, -1, 0, 1, 2].map(offset => currentColor.rgb[index] + (nearest + offset) * 5)
                .filter(channel => channel >= 0 && channel <= 255);
        });
        const candidates = [];
        for (const r of nearby[0]) for (const g of nearby[1]) for (const b of nearby[2]) {
            const rgb = [r, g, b];
            const error = distance(rgb, targetColor.rgb);
            if (this.colors.some(color => color.id !== targetColor.id && distance(rgb, color.rgb) <= error)) continue;
            const fruits = this.calculateRequiredFruits({
                r: r - currentColor.rgb[0], g: g - currentColor.rgb[1], b: b - currentColor.rgb[2]
            });
            if (fruits) candidates.push({ rgb, error, fruits, count: fruits.reduce((sum, item) => sum + item.count, 0) });
        }
        candidates.sort((a, b) => a.error - b.error || a.count - b.count);
        for (const candidate of candidates) {
            const order = this.planFeedingOrder(currentColor.rgb, candidate.rgb, candidate.fruits);
            if (order) return { fruits: candidate.fruits, order, rgb: candidate.rgb };
        }
        return null;
    }

    planFeedingOrder(start, target, fruits) {
        const remaining = fruits.map(item => item.count);
        const total = remaining.reduce((sum, count) => sum + count, 0);
        const failed = new Set();
        const order = [];
        const channels = ['r', 'g', 'b'];
        const visit = rgb => {
            if (order.length === total) return true;
            const key = remaining.join(',');
            if (failed.has(key)) return false;
            const progress = (order.length + 1) / total;
            const choices = [];
            fruits.forEach((item, index) => {
                if (remaining[index] === 0) return;
                const next = rgb.map((value, channel) => value + item.fruit.effect[channels[channel]]);
                if (next.some(value => value < 0 || value > 255)) return;
                // 接近直線路徑能交替使用水果；遇到邊界時回溯，不能直接截斷 RGB。
                const deviation = next.reduce((sum, value, channel) =>
                    sum + (value - (start[channel] + (target[channel] - start[channel]) * progress)) ** 2, 0);
                choices.push({ index, next, deviation });
            });
            choices.sort((a, b) => a.deviation - b.deviation);
            for (const choice of choices) {
                remaining[choice.index]--;
                order.push(fruits[choice.index].fruit);
                if (visit(choice.next)) return true;
                order.pop();
                remaining[choice.index]++;
            }
            failed.add(key);
            return false;
        };
        return visit([...start]) ? order : null;
    }

    /**
     * 顯示計算結果
     */
    displayResults(plan) {
        const requiredFruits = plan.fruits;
        this.lastPlan = plan;
        if (!this.elements.resultArea || !this.elements.fruitList) return;

        // 清空結果
        this.clearChildren(this.elements.fruitList);

        if (requiredFruits.length === 0) {
            // 相同顏色
            const li = document.createElement('li');
            li.className = 'fruit-item same-color';
            li.textContent = this.getTranslation('chocobo_same_color', '目前顏色與目標顏色相同，無需餵食水果。');
            this.elements.fruitList.appendChild(li);
        } else {
            // 顯示所需水果
            requiredFruits.forEach(item => {
                if (!item.fruit) return;

                const li = document.createElement('li');
                li.className = 'fruit-item';

                const colorDot = document.createElement('span');
                colorDot.className = 'fruit-color-dot';
                colorDot.style.backgroundColor = item.fruit.color;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'fruit-name';
                nameSpan.textContent = item.fruit.names[this.lang] || item.fruit.names.zh;

                const countSpan = document.createElement('span');
                countSpan.className = 'fruit-count';
                countSpan.textContent = ` × ${item.count}`;

                li.appendChild(colorDot);
                li.appendChild(nameSpan);
                li.appendChild(countSpan);
                this.elements.fruitList.appendChild(li);
            });
        }

        // 顯示結果區域
        this.elements.resultArea.style.display = 'block';

        // 隱藏餵食順序
        if (this.elements.feedingOrder) {
            this.elements.feedingOrder.style.display = 'none';
        }

        // 更新顯示順序按鈕狀態
        if (this.elements.showOrderBtn) {
            this.elements.showOrderBtn.style.display = requiredFruits.length > 0 ? 'inline-flex' : 'none';
            this.elements.showOrderBtn.dataset.expanded = 'false';
        }

    }

    /**
     * 切換餵食順序顯示
     */
    toggleFeedingOrder() {
        if (!this.elements.feedingOrder || !this.lastPlan) return;

        const isExpanded = this.elements.showOrderBtn.dataset.expanded === 'true';

        if (isExpanded) {
            this.elements.feedingOrder.style.display = 'none';
            this.elements.showOrderBtn.dataset.expanded = 'false';
        } else {
            this.generateFeedingOrder();
            this.elements.feedingOrder.style.display = 'block';
            this.elements.showOrderBtn.dataset.expanded = 'true';
        }
    }

    /**
     * 產生交替餵食順序
     */
    generateFeedingOrder() {
        if (!this.elements.feedingOrder || !this.lastPlan) return;

        const order = this.lastPlan.order;

        // 清空並顯示順序
        this.clearChildren(this.elements.feedingOrder);

        const orderContainer = document.createElement('div');
        orderContainer.className = 'feeding-order-container';

        order.forEach((fruit, index) => {
            if (!fruit) return;

            const step = document.createElement('span');
            step.className = 'feeding-step';
            step.style.backgroundColor = fruit.color;
            step.style.color = this.getContrastColor(fruit.color);
            step.textContent = fruit.names[this.lang] || fruit.names.zh;
            step.title = `${index + 1}. ${fruit.names[this.lang] || fruit.names.zh}`;

            orderContainer.appendChild(step);

            // 加入箭頭（最後一個除外）
            if (index < order.length - 1) {
                const arrow = document.createElement('span');
                arrow.className = 'feeding-arrow';
                arrow.textContent = '→';
                orderContainer.appendChild(arrow);
            }
        });

        this.elements.feedingOrder.appendChild(orderContainer);
    }

    /**
     * 取得對比色（用於文字顏色）
     */
    getContrastColor(hexColor) {
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#333333' : '#ffffff';
    }

    /**
     * 取得翻譯文字
     */
    getTranslation(key, fallback) {
        if (window.i18n && typeof window.i18n.getText === 'function') {
            const translation = window.i18n.getText(key);
            return translation !== key ? translation : fallback;
        }
        return fallback;
    }

    /**
     * 更新語言
     */
    updateLanguage() {
        if (window.i18n) {
            this.lang = window.i18n.getCurrentLanguage() || 'zh';
        }
        this.populateSelects();
        this.updatePreviews();

        // 如果有結果，重新計算以更新語言
        if (this.lastPlan) {
            this.calculate();
        }
    }

    /**
     * 顯示錯誤訊息
     */
    showError(message) {
        if (this.elements.calculator) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            this.elements.calculator.querySelector('.error-message')?.remove();
            errorDiv.textContent = message || this.getTranslation('chocobo_load_error', '載入顏色資料失敗，請重新整理頁面再試。');
            this.elements.calculator.appendChild(errorDiv);
        }
    }
}

// 全域匯出
window.ChocoboColorCalculator = ChocoboColorCalculator;
