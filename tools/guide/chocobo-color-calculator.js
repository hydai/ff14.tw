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
        await this.loadData();
        this.cacheElements();
        this.bindEvents();
        this.populateSelects();
        this.updatePreviews();

        // 監聽語言變更
        if (window.i18n) {
            window.i18n.addObserver(() => this.updateLanguage());
            this.lang = window.i18n.currentLang || 'zh';
        }
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
        } catch (error) {
            console.error('Failed to load chocobo colors data:', error);
            this.showError();
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
        this.elements.currentSelect.value = this.defaultColorId;
        this.elements.targetSelect.value = 'snow-white';
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

        // 計算 RGB 差值
        const diff = {
            r: targetColor.rgb[0] - currentColor.rgb[0],
            g: targetColor.rgb[1] - currentColor.rgb[1],
            b: targetColor.rgb[2] - currentColor.rgb[2]
        };

        // 計算所需水果
        const requiredFruits = this.calculateRequiredFruits(diff);

        // 顯示結果
        this.displayResults(requiredFruits);
    }

    /**
     * 計算所需水果數量
     */
    calculateRequiredFruits(diff) {
        const fruits = [];
        const fruitMap = {
            r: { positive: 'xelphatol-apple', negative: 'doman-plum' },
            g: { positive: 'mamook-pear', negative: 'valfruit' },
            b: { positive: 'oghomoro-berries', negative: 'cieldalaes-pineapple' }
        };

        for (const channel of ['r', 'g', 'b']) {
            const value = diff[channel];
            if (value === 0) continue;

            const fruitId = value > 0 ? fruitMap[channel].positive : fruitMap[channel].negative;
            fruits.push({
                fruit: this.getFruitById(fruitId),
                count: Math.ceil(Math.abs(value) / 5)
            });
        }

        return fruits;
    }

    /**
     * 顯示計算結果
     */
    displayResults(requiredFruits) {
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

        // 儲存結果供餵食順序使用
        this.lastResult = requiredFruits;
    }

    /**
     * 切換餵食順序顯示
     */
    toggleFeedingOrder() {
        if (!this.elements.feedingOrder || !this.lastResult) return;

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
        if (!this.elements.feedingOrder || !this.lastResult) return;

        // 建立餵食順序（交替餵食不同水果）
        const order = [];
        const remaining = this.lastResult.map(item => ({
            fruit: item.fruit,
            count: item.count
        }));

        // 交替取出每種水果
        let hasRemaining = true;
        while (hasRemaining) {
            hasRemaining = false;
            for (const item of remaining) {
                if (item.count > 0) {
                    order.push(item.fruit);
                    item.count--;
                    hasRemaining = true;
                }
            }
        }

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
        if (window.i18n && typeof window.i18n.t === 'function') {
            const translation = window.i18n.t(key);
            return translation !== key ? translation : fallback;
        }
        return fallback;
    }

    /**
     * 更新語言
     */
    updateLanguage() {
        if (window.i18n) {
            this.lang = window.i18n.currentLang || 'zh';
        }
        this.populateSelects();
        this.updatePreviews();

        // 如果有結果，重新計算以更新語言
        if (this.lastResult) {
            this.calculate();
        }
    }

    /**
     * 顯示錯誤訊息
     */
    showError() {
        if (this.elements.calculator) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = this.getTranslation('chocobo_load_error', '載入顏色資料失敗，請重新整理頁面再試。');
            this.elements.calculator.appendChild(errorDiv);
        }
    }
}

// 全域匯出
window.ChocoboColorCalculator = ChocoboColorCalculator;
