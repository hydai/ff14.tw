/**
 * Macro Converter Tool
 * Main controller for the macro conversion UI
 */
class MacroConverter {
    static DEBOUNCE_DELAY = 300;
    static DATA_FILE = '../../data/macro-mappings.json';

    constructor() {
        this.mappings = null;
        this.engine = null;
        this.debounceTimeout = null;
        this.lastDetectedLang = null;

        // Cache DOM elements
        this.elements = {
            inputMacro: document.getElementById('inputMacro'),
            outputMacro: document.getElementById('outputMacro'),
            sourceLang: document.getElementById('sourceLang'),
            targetLang: document.getElementById('targetLang'),
            convertBtn: document.getElementById('convertBtn'),
            copyOutput: document.getElementById('copyOutput'),
            clearInput: document.getElementById('clearInput'),
            pasteInput: document.getElementById('pasteInput'),
            swapLangs: document.getElementById('swapLangs'),
            warningMessage: document.getElementById('warningMessage'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            errorMessage: document.getElementById('errorMessage'),
            detectedLang: document.getElementById('detectedLang'),
            detectedLangName: document.getElementById('detectedLangName')
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
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showError(this.getText('macro_converter_load_error') || '載入翻譯資料失敗，請重新整理頁面再試。');
        } finally {
            this.showLoading(false);
        }
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

        // Swap languages
        this.elements.swapLangs.addEventListener('click', () => this.swapLanguages());

        // Auto-detect on input change (debounced)
        this.elements.inputMacro.addEventListener('input', () => {
            this.debouncedAutoDetect();
        });

        // Keyboard shortcut: Ctrl/Cmd + Enter to convert
        this.elements.inputMacro.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.convert();
            }
        });

        // Language change events
        this.elements.sourceLang.addEventListener('change', () => {
            if (this.elements.sourceLang.value !== 'auto') {
                this.elements.detectedLang.style.display = 'none';
            }
        });
    }

    /**
     * Debounced auto-detect language
     */
    debouncedAutoDetect() {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }

        this.debounceTimeout = setTimeout(() => {
            this.autoDetectLanguage();
        }, MacroConverter.DEBOUNCE_DELAY);
    }

    /**
     * Auto-detect language of input
     */
    autoDetectLanguage() {
        const input = this.elements.inputMacro.value;

        if (!input.trim() || this.elements.sourceLang.value !== 'auto') {
            this.elements.detectedLang.style.display = 'none';
            return;
        }

        const detectedLang = this.engine.detectLanguage(input);
        this.lastDetectedLang = detectedLang;

        // Show detected language
        this.elements.detectedLangName.textContent = this.engine.getLanguageName(detectedLang);
        this.elements.detectedLang.style.display = 'flex';
    }

    /**
     * Perform the conversion
     */
    convert() {
        const input = this.elements.inputMacro.value;

        if (!input.trim()) {
            this.clearOutput();
            return;
        }

        // Determine source language
        let sourceLang = this.elements.sourceLang.value;
        if (sourceLang === 'auto') {
            sourceLang = this.engine.detectLanguage(input);
            this.lastDetectedLang = sourceLang;

            // Update detected language display
            this.elements.detectedLangName.textContent = this.engine.getLanguageName(sourceLang);
            this.elements.detectedLang.style.display = 'flex';
        }

        const targetLang = this.elements.targetLang.value;

        // Perform conversion
        const results = this.engine.convert(input, sourceLang, targetLang);

        // Display results
        this.displayResults(results);
    }

    /**
     * Display conversion results
     * @param {object[]} results - Array of conversion results
     */
    displayResults(results) {
        const container = this.elements.outputMacro;

        // Clear existing content safely
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        let hasWarnings = false;

        results.forEach((result) => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'output-line';

            if (result.untranslatable.length > 0) {
                lineDiv.classList.add('untranslatable');
                hasWarnings = true;

                // Add warning icon
                const warningIcon = document.createElement('span');
                warningIcon.className = 'warning-icon';
                warningIcon.textContent = '\u26a0';
                warningIcon.title = this.getText('macro_converter_untranslatable') + ': ' +
                    result.untranslatable.join(', ');
                lineDiv.appendChild(warningIcon);
            }

            // Add line text
            const lineText = document.createElement('span');
            lineText.className = 'line-text';
            lineText.textContent = result.output;
            lineDiv.appendChild(lineText);

            container.appendChild(lineDiv);
        });

        // Show/hide warning message
        this.elements.warningMessage.style.display = hasWarnings ? 'flex' : 'none';
    }

    /**
     * Clear the output area
     */
    clearOutput() {
        while (this.elements.outputMacro.firstChild) {
            this.elements.outputMacro.removeChild(this.elements.outputMacro.firstChild);
        }
        this.elements.warningMessage.style.display = 'none';
    }

    /**
     * Clear the input
     */
    clearInput() {
        this.elements.inputMacro.value = '';
        this.clearOutput();
        this.elements.detectedLang.style.display = 'none';
    }

    /**
     * Paste from clipboard
     */
    async pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            this.elements.inputMacro.value = text;
            this.autoDetectLanguage();
        } catch (err) {
            console.error('Failed to read clipboard:', err);
            FF14Utils.showToast(this.getText('macro_converter_paste_error') || '無法讀取剪貼簿', 'error');
        }
    }

    /**
     * Copy output to clipboard
     */
    async copyToClipboard() {
        // Get all output text
        const lines = [];
        const lineElements = this.elements.outputMacro.querySelectorAll('.line-text');
        lineElements.forEach(el => {
            lines.push(el.textContent);
        });

        const text = lines.join('\n');

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
     * Swap source and target languages
     */
    swapLanguages() {
        const sourceVal = this.elements.sourceLang.value;
        const targetVal = this.elements.targetLang.value;

        // If source is auto, use detected language
        const actualSource = sourceVal === 'auto' ? (this.lastDetectedLang || 'zh') : sourceVal;

        this.elements.sourceLang.value = targetVal;
        this.elements.targetLang.value = actualSource;

        // Hide detected language indicator since we're now using explicit source
        if (targetVal !== 'auto') {
            this.elements.detectedLang.style.display = 'none';
        }
    }

    /**
     * Set placeholder for output area
     */
    setOutputPlaceholder() {
        this.elements.outputMacro.setAttribute('data-placeholder',
            this.getText('macro_converter_output_placeholder') || '轉換結果將顯示在這裡...');
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
let macroConverter;
document.addEventListener('DOMContentLoaded', () => {
    macroConverter = new MacroConverter();
});
