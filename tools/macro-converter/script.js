/**
 * 巨集轉換器
 * 貼上或打字就立刻轉換，沒有「轉換」鈕：輸入框的 input 事件與目標語言的 change 都直接重轉，不 debounce。
 * 轉換規則在 conversion-engine.js，這裡只管畫面：輸出框、輸出標題列（目標語言與行數）與要注意的行。
 * 目標語言預設繁體中文，改了就記在 localStorage；網站介面語言只影響介面文字，不改目標語言。
 * 每一次讀寫 localStorage 都包 try/catch，瀏覽器封鎖網站資料時照常運作，只是不記住。
 * 資料（macro-mappings.json）載入完才轉得了：標記裡一開始就是載入中（輸入框與「貼上」停用、「複製」aria-disabled），
 * 載入完拿掉停用；失敗時在工具最上面顯示錯誤與「重試」，控制項維持停用。事件一開始就綁好，其他按鈕與目標語言的選單沒有停用，所以載入前後都要能用。
 */
class MacroConverter {
    static DATA_FILE = '../../data/macro-mappings.json';
    static STORAGE_KEY = 'ff14tw_macro_target_lang';
    static TARGET_LANGS = ['zh', 'en', 'ja'];
    static DEFAULT_TARGET_LANG = 'zh';
    // 遊戲裡一個巨集最多 15 行
    static MAX_MACRO_LINES = 15;
    // 複製成功後，按鈕寫「✓ 已複製」的毫秒數
    static COPIED_FEEDBACK_MS = 2000;
    // 貼上成功後，朗讀區先清空、隔這麼多毫秒才寫進結果（同 FF14Utils.showToast）
    static ANNOUNCE_DELAY_MS = 100;
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
        // 複製成功後按鈕暫時寫「✓ 已複製」：copied 是現在是不是這個狀態，copiedTimer 是變回來的計時
        this.copied = false;
        this.copiedTimer = null;
        // 貼上的朗讀還沒寫進朗讀區的計時（見 announcePasted()）
        this.announceTimer = null;

        this.elements = {
            inputMacro: document.getElementById('inputMacro'),
            outputMacro: document.getElementById('outputMacro'),
            outputTitle: document.getElementById('outputTitle'),
            targetLang: document.getElementById('targetLang'),
            copyOutput: document.getElementById('copyOutput'),
            clearInput: document.getElementById('clearInput'),
            pasteInput: document.getElementById('pasteInput'),
            pasteAnnounce: document.getElementById('pasteAnnounce'),
            warnings: document.getElementById('macroWarnings'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            loadError: document.getElementById('loadError'),
            retryLoad: document.getElementById('retryLoad')
        };

        this.elements.targetLang.value = this.readTargetLang();
        this.bindEvents();
        // 切換網站介面語言：只換字（標題列、要注意的行、複製鈕、輸出框的提示字），目標語言與輸出都不動
        window.i18n.onLanguageChange(() => this.renderStatus());
        this.renderStatus();

        // ready：目前這一次載入完成（或失敗）之後 resolve；按「重試」時換成新的那一次
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

    // 每一次都從載入中開始：錯誤訊息收起、提示出現；成功就拿掉輸入框與「貼上」的停用，失敗就顯示錯誤。「重試」重新跑這一段
    async load() {
        const { loadingIndicator, loadError, inputMacro, pasteInput, retryLoad } = this.elements;
        // 「重試」在錯誤訊息裡：按下去錯誤訊息收起來，按鈕跟著不見，鍵盤焦點會掉走，所以載入完要把焦點接住。
        // 滑鼠點的時候焦點可能不在它上面（Safari 與 macOS 的 Firefox 點按鈕不給焦點），那就不去動焦點
        const fromRetry = loadError.contains(document.activeElement);
        // 載入的期間玩家可能已經自己移到別的地方（按 Tab 到目標語言的選單、點了「清除」）：載入完只在焦點還掉在頁面上（body）時才接住，
        // 不然接著按的鍵會跑到搬過去的地方
        const focusLost = () => fromRetry && (!document.activeElement || document.activeElement === document.body);
        loadError.hidden = true;
        loadingIndicator.hidden = false;
        try {
            const response = await fetch(MacroConverter.DATA_FILE);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.engine = new ConversionEngine(await response.json());
        } catch {
            // 失敗：輸入框與「貼上」維持停用，錯誤訊息與「重試」留在工具最上面；不留任何除錯訊息
            loadError.hidden = false;
            if (focusLost()) retryLoad.focus();
            return;
        } finally {
            loadingIndicator.hidden = true;
        }
        inputMacro.disabled = false;
        pasteInput.disabled = false;
        // 瀏覽器可能在載入前就還原了輸入框的內容（上一頁、重新整理），載入完先轉一次
        this.convert();
        if (focusLost()) inputMacro.focus();
    }

    bindEvents() {
        const { inputMacro, targetLang, copyOutput, clearInput, pasteInput, retryLoad } = this.elements;
        // 打字、貼上、刪除都會觸發 input；改目標語言也立刻重轉，輸出不會停在舊的語言
        inputMacro.addEventListener('input', () => this.convert());
        targetLang.addEventListener('change', () => {
            this.saveTargetLang(targetLang.value);
            this.convert();
        });
        copyOutput.addEventListener('click', () => this.copyToClipboard());
        clearInput.addEventListener('click', () => this.clearInput());
        pasteInput.addEventListener('click', () => this.pasteFromClipboard());
        retryLoad.addEventListener('click', () => { this.ready = this.load(); });
    }

    // ---------- 轉換 ----------

    // 把輸入框現在的內容轉成目標語言（每一行自動判斷語言），再重畫標題列與要注意的行。
    // 資料還沒載入（載入中、載入失敗）時沒有東西可以轉：輸入框停用，所以通常也沒有輸入，瀏覽器還原的字等載入完再轉
    convert() {
        // 貼上的朗讀說的是貼上那一次轉出來的結果：重新轉換（打字、改目標語言、清除、再貼上）就清掉，還沒念到的也取消
        this.clearAnnouncement();
        const input = this.elements.inputMacro.value;
        const results = input.trim() && this.engine ? this.engine.convert(input, this.elements.targetLang.value) : [];

        const output = results.map((result) => result.output).join('\n');
        // 「✓ 已複製」說的是剛才複製的那一份輸出：輸出變了（打字、改目標語言、貼上、清除）它就不對了，馬上變回「複製」，
        // 不等 2 秒（清除之後還寫著它，複製鈕卻是 aria-disabled，更奇怪）；輸出沒變（例如多打了空白，轉出來一樣）就留著
        const changed = output !== this.elements.outputMacro.value;
        this.elements.outputMacro.value = output;
        if (changed && this.copied) this.resetCopied();

        // 行數只算到最後一個非空行：貼上的巨集結尾常帶著幾個空行，不能因此多跳「超過 15 行」
        let lineCount = results.length;
        while (lineCount > 0 && !results[lineCount - 1].output.trim()) lineCount -= 1;
        this.lineCount = lineCount;
        // 行號由陣列位置算（1 起算），空行也占一個行號
        this.problems = results.flatMap((result, index) => result.problems
            .map((problem) => ({ line: index + 1, kind: problem.kind, text: problem.text })));

        this.renderStatus();
    }

    // 標題列、要注意的行、複製鈕與輸出框的提示字：這四樣會跟著網站介面語言換字，轉換的結果換了也要重畫
    renderStatus() {
        this.renderTitle();
        this.renderWarnings();
        this.renderCopyButton();
        this.elements.outputMacro.placeholder = this.t('macro_converter_output_placeholder', '轉換結果會出現在這裡');
    }

    // 複製鈕：沒有輸出時 aria-disabled（不用 disabled：按鈕變灰時焦點留在原地）；複製成功後暫時寫「✓ 已複製」。
    // 文字每次都照目前的狀態與介面語言重畫：切換語言時 I18nManager 會把有 data-i18n 的按鈕改回「複製」，這裡接著補回「✓ 已複製」
    renderCopyButton() {
        const { copyOutput, outputMacro } = this.elements;
        const label = this.copied
            ? this.t('macro_converter_copied_button', '✓ 已複製')
            : this.t('macro_converter_copy', '複製');
        if (copyOutput.textContent !== label) copyOutput.textContent = label;
        if (outputMacro.value === '') copyOutput.setAttribute('aria-disabled', 'true');
        else copyOutput.removeAttribute('aria-disabled');
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

    // 要注意的行每一條的字：每個轉不了的詞、每一行不是指令的行各一條，依行號排；超過 15 行的提醒放在最後。
    // renderWarnings() 照這份畫，貼上後的朗讀照這份數
    warningTexts() {
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
        return texts;
    }

    // 一條一個 li，文字用 textContent（問題的文字是玩家貼上的原文，可能有 <me> 這類尖括號）。沒有任何一條時整塊 hidden
    renderWarnings() {
        const list = this.elements.warnings;
        const texts = this.warningTexts();
        list.textContent = '';
        for (const text of texts) {
            const item = document.createElement('li');
            item.textContent = text;
            list.appendChild(item);
        }
        list.hidden = texts.length === 0;
    }

    // ---------- 按鈕 ----------

    // 清除：清空輸入與輸出，焦點放回輸入框（玩家接著就是貼上或打字）
    clearInput() {
        this.elements.inputMacro.value = '';
        this.convert();
        this.elements.inputMacro.focus();
    }

    async pasteFromClipboard() {
        // 這一次的結果出來之前，朗讀區先清空、上一次還沒念的取消：讀不到時念的是 toast，不能接著念上一次的結果；
        // 同一份巨集連著貼兩次時，朗讀區也要先空過一次，換字才會再念
        this.clearAnnouncement();
        let text = '';
        try {
            text = await navigator.clipboard.readText();
        } catch { /* 讀不到：和下面「沒有字」一起處理 */ }
        // 讀不到（玩家沒給權限、瀏覽器不支援），或讀到的是沒有字的東西（空字串、只有空白，例如複製的是圖片）：
        // 輸入框一個字都不動（玩家已經有的字不能被換成空的，沒有復原），提示直接貼上，
        // 焦點放進輸入框，玩家馬上能按 Ctrl+V 或長按
        if (typeof text !== 'string' || !text.trim()) {
            FF14Utils.showToast(this.t('macro_converter_paste_error', '沒辦法讀取剪貼簿，請直接在框裡貼上（Ctrl+V 或長按）'), 'error');
            this.elements.inputMacro.focus();
            return;
        }
        // 程式改輸入框的值不會觸發 input 事件，所以自己轉。成功時焦點留在「貼上」，不彈出手機的鍵盤
        this.elements.inputMacro.value = text;
        this.convert();
        this.announcePasted();
    }

    // 貼上成功時給螢幕閱讀器一句結果：焦點留在「貼上」上，螢幕閱讀器念不到輸出框，沒有這一句就要自己移過去才知道轉出了什麼。
    // 「已貼上並轉換：繁體中文・13 行，有 2 條要注意」（標題列的字，加上要注意的條數）寫在看不到的朗讀區（#pasteAnnounce，
    // role="status"）：畫面上輸出框與要注意的行本來就看得到，不跳 toast。朗讀區在 pasteFromClipboard() 一開始就清空了，
    // 隔一下才寫進去（同 FF14Utils.showToast），區塊已經在頁面上才換字，螢幕閱讀器才會念。字在寫進去的時候才取，
    // 用那時的網站介面語言；在那之前重新轉換的話，convert() 會把這個計時取消
    announcePasted() {
        this.announceTimer = setTimeout(() => {
            const title = this.elements.outputTitle.textContent;
            const count = this.warningTexts().length;
            let message;
            if (count === 0) {
                message = this.t('macro_converter_pasted', '已貼上並轉換：{title}', { title });
            } else {
                const key = count === 1 ? 'macro_converter_pasted_warning_one' : 'macro_converter_pasted_warnings';
                message = this.t(key, '已貼上並轉換：{title}，有 {count} 條要注意', { title, count });
            }
            this.elements.pasteAnnounce.textContent = message;
        }, MacroConverter.ANNOUNCE_DELAY_MS);
    }

    // 清空朗讀區並取消還沒寫進去的那一句
    clearAnnouncement() {
        clearTimeout(this.announceTimer);
        this.announceTimer = null;
        if (this.elements.pasteAnnounce.textContent !== '') this.elements.pasteAnnounce.textContent = '';
    }

    async copyToClipboard() {
        // 沒有輸出時按鈕是 aria-disabled，click 照樣會送出，所以這裡自己擋
        const text = this.elements.outputMacro.value;
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            FF14Utils.showToast(this.t('macro_converter_copy_error', '複製失敗，請手動選取文字'), 'error');
            // 「✓ 已複製」是成功的意思：2 秒內再按一次而這次失敗時，不能和失敗的 toast 同時出現，馬上變回「複製」
            this.resetCopied();
            return;
        }
        FF14Utils.showToast(this.t('macro_converter_copied', '已複製'), 'success');
        // 剪貼簿可能晚一點才寫完（瀏覽器在問權限）：等的時候輸出變了（打字、改目標語言、貼上、清除），寫進去的是按下去那一刻的輸出，
        // 不是輸出框裡現在的字，按鈕就不寫「✓ 已複製」（toast 照跳：剪貼簿真的換了）
        if (this.elements.outputMacro.value === text) this.showCopied();
    }

    // 按鈕暫時寫「✓ 已複製」，2 秒後變回「複製」；期間再按一次，前一次的計時取消，重新算 2 秒
    showCopied() {
        clearTimeout(this.copiedTimer);
        this.copied = true;
        this.renderCopyButton();
        this.copiedTimer = setTimeout(() => this.resetCopied(), MacroConverter.COPIED_FEEDBACK_MS);
    }

    // 變回「複製」並取消還沒到的計時：2 秒到了，或複製失敗的時候
    resetCopied() {
        clearTimeout(this.copiedTimer);
        this.copied = false;
        this.renderCopyButton();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new MacroConverter();
});
