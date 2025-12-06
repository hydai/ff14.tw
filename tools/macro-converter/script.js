/**
 * Macro Converter Tool
 * Main controller for the macro conversion UI
 */
class MacroConverter {
    static DATA_FILE = '../../data/macro-mappings.json';
    static DEFAULT_EXAMPLE = `/ac "精修" <wait.3>
/ac "Basic Synthesis" <wait.3>
/アクション "マスターズメンド" <wait.3>
/技能 "加工" <wait.2>`;

    constructor() {
        this.mappings = null;
        this.engine = null;

        // Cache DOM elements
        this.elements = {
            inputMacro: document.getElementById('inputMacro'),
            outputMacro: document.getElementById('outputMacro'),
            targetLang: document.getElementById('targetLang'),
            convertBtn: document.getElementById('convertBtn'),
            copyOutput: document.getElementById('copyOutput'),
            clearInput: document.getElementById('clearInput'),
            pasteInput: document.getElementById('pasteInput'),
            warningMessage: document.getElementById('warningMessage'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            errorMessage: document.getElementById('errorMessage')
        };

        this.init();
    }

    /**
     * Initialize the tool
     */
    async init() {
        this.showLoading(true);

        try {
            await this.loadMappings();
            this.engine = new ConversionEngine(this.mappings);
            this.bindEvents();
            this.setOutputPlaceholder();
            this.syncTargetLangWithI18n();
            this.loadDefaultExample();
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showError(this.getText('macro_converter_load_error') || '載入翻譯資料失敗，請重新整理頁面再試。');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Sets the target language in the dropdown.
     * @param {string} lang The language code.
     */
    _setTargetLang(lang) {
        if (lang && this.elements.targetLang) {
            this.elements.targetLang.value = lang;
        }
    }

    /**
     * Sync target language with i18n language
     */
    syncTargetLangWithI18n() {
        if (window.i18n) {
            // Set initial target language and listen for changes
            this._setTargetLang(window.i18n.getCurrentLanguage());
            window.i18n.onLanguageChange((newLang) => this._setTargetLang(newLang));
        }
    }

    /**
     * Load default example and convert
     */
    loadDefaultExample() {
        this.elements.inputMacro.value = MacroConverter.DEFAULT_EXAMPLE;
        this.convert();
    }

    /**
     * Load mapping data from JSON file
     */
    async loadMappings() {
        const response = await fetch(MacroConverter.DATA_FILE);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        this.mappings = await response.json();
    }

    /**
     * Bind all event listeners
     */
    bindEvents() {
        // Convert button
        this.elements.convertBtn.addEventListener('click', () => this.convert());

        // Copy output
        this.elements.copyOutput.addEventListener('click', () => this.copyToClipboard());

        // Clear input
        this.elements.clearInput.addEventListener('click', () => this.clearInput());

        // Paste input
        this.elements.pasteInput.addEventListener('click', () => this.pasteFromClipboard());

        // Keyboard shortcut: Ctrl/Cmd + Enter to convert
        this.elements.inputMacro.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.convert();
            }
        });
    }

    /**
     * Perform the conversion (auto-detect source language per token)
     */
    convert() {
        const input = this.elements.inputMacro.value;

        if (!input.trim()) {
            this.clearOutput();
            return;
        }

        const targetLang = this.elements.targetLang.value;

        // Perform conversion (source language is auto-detected per token)
        const results = this.engine.convert(input, targetLang);

        // Display results
        this.displayResults(results);
    }

    /**
     * Display conversion results
     * @param {object[]} results - Array of conversion results
     */
    displayResults(results) {
        const outputLines = [];
        let hasWarnings = false;

        results.forEach((result) => {
            outputLines.push(result.output);
            if (result.untranslatable.length > 0) {
                hasWarnings = true;
            }
        });

        // Set textarea value
        this.elements.outputMacro.value = outputLines.join('\n');

        // Show/hide warning message
        this.elements.warningMessage.style.display = hasWarnings ? 'flex' : 'none';
    }

    /**
     * Clear the output area
     */
    clearOutput() {
        this.elements.outputMacro.value = '';
        this.elements.warningMessage.style.display = 'none';
    }

    /**
     * Clear the input
     */
    clearInput() {
        this.elements.inputMacro.value = '';
        this.clearOutput();
    }

    /**
     * Paste from clipboard
     */
    async pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            this.elements.inputMacro.value = text;
        } catch (err) {
            console.error('Failed to read clipboard:', err);
            FF14Utils.showToast(this.getText('macro_converter_paste_error') || '無法讀取剪貼簿', 'error');
        }
    }

    /**
     * Copy output to clipboard
     */
    async copyToClipboard() {
        const text = this.elements.outputMacro.value;

        if (!text) {
            FF14Utils.showToast(this.getText('macro_converter_nothing_to_copy') || '沒有內容可複製', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            FF14Utils.showToast(this.getText('macro_converter_copied') || '已複製到剪貼簿', 'success');
        } catch (err) {
            console.error('Failed to copy:', err);
            FF14Utils.showToast(this.getText('macro_converter_copy_error') || '複製失敗', 'error');
        }
    }

    /**
     * Set placeholder for output area
     */
    setOutputPlaceholder() {
        this.elements.outputMacro.placeholder =
            this.getText('macro_converter_output_placeholder') || '轉換結果將顯示在這裡...';
    }

    /**
     * Show/hide loading indicator
     * @param {boolean} show
     */
    showLoading(show) {
        this.elements.loadingIndicator.style.display = show ? 'flex' : 'none';
        this.elements.convertBtn.disabled = show;
    }

    /**
     * Show error message
     * @param {string} message
     */
    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.style.display = 'block';
    }

    /**
     * Get i18n text
     * @param {string} key
     * @returns {string}
     */
    getText(key) {
        if (window.i18n && typeof window.i18n.getText === 'function') {
            return window.i18n.getText(key);
        }
        return '';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new MacroConverter();
});
