/**
 * 巨集轉換器
 * 貼上或打字就立刻轉換，沒有「轉換」鈕：輸入框的 input 事件與目標語言的 change 都直接重轉，不 debounce。
 * 轉換規則在 conversion-engine.js，這裡只管畫面：輸出框、輸出標題列（目標語言與行數）與要注意的行。
 * 目標語言預設繁體中文，改了就記在 localStorage；網站介面語言只影響介面文字，不改目標語言。
 * 每一次讀寫 localStorage 都包 try/catch，瀏覽器封鎖網站資料時照常運作，只是不記住。
 */
class MacroConverter {
    static DATA_FILE = '../../data/macro-mappings.json';
    static STORAGE_KEY = 'ff14tw_macro_target_lang';
    static TARGET_LANGS = ['zh', 'en', 'ja'];
    static DEFAULT_TARGET_LANG = 'zh';
    // 遊戲裡一個巨集最多 15 行
    static MAX_MACRO_LINES = 15;
    // 輸出標題列的語言名稱（跟著網站介面語言）：目標語言 -> [翻譯鍵, 中文預設]
    static LANG_NAMES = {
        zh: ['macro_converter_lang_zh', '繁體中文'],
        en: ['macro_converter_lang_en', '英文'],
        ja: ['macro_converter_lang_ja', '日文']
    };
    // 要注意的行的三種問題（引擎的 problems 的 kind）：種類 -> [翻譯鍵, 中文預設]。
    // action：技能名沒有收錄；command：指令不認得；text：不是 / 開頭的行（貼上的標題、表格的編號、# 備註），遊戲裡會當成聊天訊息送出
    static WARNINGS = {
        action: ['macro_converter_warn_action', '第 {line} 行：「{text}」沒有收錄，照原文保留'],
        command: ['macro_converter_warn_command', '第 {line} 行：「{text}」不是認得的指令，照原文保留'],
        text: ['macro_converter_warn_text', '第 {line} 行：「{text}」不是指令，遊戲裡會當成聊天訊息送出']
    };

    constructor() {
        this.engine = null;
        // 最近一次轉換的結果：到最後一個非空行為止的行數，與每個轉不了的詞或不是指令的行 { line, kind, text }（依行號排，
        // kind 見 WARNINGS）。切換網站介面語言時照這份重畫標題列與要注意的行，不重轉、不動輸出框
        this.lineCount = 0;
        this.problems = [];

        this.elements = {
            inputMacro: document.getElementById('inputMacro'),
            outputMacro: document.getElementById('outputMacro'),
            outputTitle: document.getElementById('outputTitle'),
            targetLang: document.getElementById('targetLang'),
            copyOutput: document.getElementById('copyOutput'),
            clearInput: document.getElementById('clearInput'),
            pasteInput: document.getElementById('pasteInput'),
            warnings: document.getElementById('macroWarnings'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            loadError: document.getElementById('loadError')
        };

        this.elements.targetLang.value = this.readTargetLang();
        // 切換網站介面語言：只換字（標題列、要注意的行、輸出框的提示字），目標語言與輸出都不動
        window.i18n.onLanguageChange(() => this.renderStatus());
        this.renderStatus();

        // ready：目前這一次載入完成（或失敗）之後 resolve
        this.ready = this.load();
    }

    t(key, fallback, params) {
        return FF14Utils.getI18nText(key, fallback, params);
    }

    // ---------- 目標語言 ----------

    // 存著的值不是三種語言之一（壞掉、沒存過、讀不到）就用繁體中文
    readTargetLang() {
        try {
            const saved = localStorage.getItem(MacroConverter.STORAGE_KEY);
            if (MacroConverter.TARGET_LANGS.includes(saved)) return saved;
        } catch { /* 封鎖網站資料時讀不到：用預設 */ }
        return MacroConverter.DEFAULT_TARGET_LANG;
    }

    saveTargetLang(lang) {
        try {
            localStorage.setItem(MacroConverter.STORAGE_KEY, lang);
        } catch { /* 封鎖網站資料或寫不進去：這次照常用，只是記不住 */ }
    }

    // ---------- 載入資料 ----------

    async load() {
        const { loadingIndicator, loadError } = this.elements;
        loadError.hidden = true;
        loadingIndicator.hidden = false;
        try {
            const response = await fetch(MacroConverter.DATA_FILE);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.engine = new ConversionEngine(await response.json());
        } catch {
            loadError.hidden = false;
            return;
        } finally {
            loadingIndicator.hidden = true;
        }
        this.bindEvents();
        // 瀏覽器可能在載入前就還原了輸入框的內容（上一頁、重新整理），載入完先轉一次
        this.convert();
    }

    bindEvents() {
        const { inputMacro, targetLang, copyOutput, clearInput, pasteInput } = this.elements;
        // 打字、貼上、刪除都會觸發 input；改目標語言也立刻重轉，輸出不會停在舊的語言
        inputMacro.addEventListener('input', () => this.convert());
        targetLang.addEventListener('change', () => {
            this.saveTargetLang(targetLang.value);
            this.convert();
        });
        copyOutput.addEventListener('click', () => this.copyToClipboard());
        clearInput.addEventListener('click', () => this.clearInput());
        pasteInput.addEventListener('click', () => this.pasteFromClipboard());
    }

    // ---------- 轉換 ----------

    // 把輸入框現在的內容轉成目標語言（每一行自動判斷語言），再重畫標題列與要注意的行
    convert() {
        const input = this.elements.inputMacro.value;
        const results = input.trim() ? this.engine.convert(input, this.elements.targetLang.value) : [];

        this.elements.outputMacro.value = results.map((result) => result.output).join('\n');

        // 行數只算到最後一個非空行：貼上的巨集結尾常帶著幾個空行，不能因此多跳「超過 15 行」
        let lineCount = results.length;
        while (lineCount > 0 && !results[lineCount - 1].output.trim()) lineCount -= 1;
        this.lineCount = lineCount;
        // 行號由陣列位置算（1 起算），空行也占一個行號
        this.problems = results.flatMap((result, index) => result.problems
            .map((problem) => ({ line: index + 1, kind: problem.kind, text: problem.text })));

        this.renderStatus();
    }

    // 標題列、要注意的行與輸出框的提示字：這三樣會跟著網站介面語言換字，轉換的結果換了也要重畫
    renderStatus() {
        this.renderTitle();
        this.renderWarnings();
        this.elements.outputMacro.placeholder = this.t('macro_converter_output_placeholder', '轉換結果會出現在這裡');
    }

    // 「繁體中文・13 行」（英文是 Traditional Chinese · 13 lines）：語言名稱與行數中間的符號是每種語言自己的翻譯
    // （macro_converter_output_title）。輸入是空的（沒有任何非空行）時只寫語言名稱
    renderTitle() {
        const [key, fallback] = MacroConverter.LANG_NAMES[this.elements.targetLang.value];
        const lang = this.t(key, fallback);
        if (this.lineCount === 0) {
            this.elements.outputTitle.textContent = lang;
            return;
        }
        const lines = this.lineCount === 1
            ? this.t('macro_converter_line_one', '{count} 行', { count: this.lineCount })
            : this.t('macro_converter_lines', '{count} 行', { count: this.lineCount });
        this.elements.outputTitle.textContent = this.t('macro_converter_output_title', '{lang}・{lines}', { lang, lines });
    }

    // 每個轉不了的詞、每一行不是指令的行各一條，依行號排；超過 15 行的提醒放在最後。一條一個 li，文字用 textContent
    // （問題的文字是玩家貼上的原文，可能有 <me> 這類尖括號）。沒有任何一條時整塊 hidden
    renderWarnings() {
        const list = this.elements.warnings;
        const texts = this.problems.map(({ line, kind, text }) => {
            // 不認得的種類當成沒有收錄（引擎只會給 WARNINGS 裡的三種）
            const [key, fallback] = MacroConverter.WARNINGS[kind] ?? MacroConverter.WARNINGS.action;
            return this.t(key, fallback, { line, text });
        });
        if (this.lineCount > MacroConverter.MAX_MACRO_LINES) {
            texts.push(this.t('macro_converter_warn_too_long', '共 {lines} 行：遊戲裡一個巨集最多 15 行，要分成 {macros} 個巨集', {
                lines: this.lineCount,
                macros: Math.ceil(this.lineCount / MacroConverter.MAX_MACRO_LINES)
            }));
        }

        list.textContent = '';
        for (const text of texts) {
            const item = document.createElement('li');
            item.textContent = text;
            list.appendChild(item);
        }
        list.hidden = texts.length === 0;
    }

    // ---------- 按鈕 ----------

    clearInput() {
        this.elements.inputMacro.value = '';
        this.convert();
    }

    async pasteFromClipboard() {
        let text;
        try {
            text = await navigator.clipboard.readText();
        } catch {
            FF14Utils.showToast(this.t('macro_converter_paste_error', '沒辦法讀取剪貼簿，請直接在框裡貼上（Ctrl+V 或長按）'), 'error');
            return;
        }
        // 程式改輸入框的值不會觸發 input 事件，所以自己轉
        this.elements.inputMacro.value = text;
        this.convert();
    }

    async copyToClipboard() {
        const text = this.elements.outputMacro.value;
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            FF14Utils.showToast(this.t('macro_converter_copy_error', '複製失敗，請手動選取文字'), 'error');
            return;
        }
        FF14Utils.showToast(this.t('macro_converter_copied', '已複製'), 'success');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new MacroConverter();
});
