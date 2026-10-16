// 複製格式模組：路線上每一站複製成什麼句子——範本、變數替換、存在這台裝置的格式，以及舊格式的轉換。
// 不碰 DOM；storage 從外面傳進來，render() 要用的資料全部由 stop 帶進來，不讀任何全域
class CopyFormat {
    // localStorage 的 key，內容是 { version: 2, template }
    static STORAGE_KEY = 'treasureMapFormatSettings';

    static LANGUAGES = ['zh', 'en', 'ja'];

    // 範本語言的名稱：說的是貼到哪個語言的伺服器，不隨介面語言變
    static LANGUAGE_NAMES = { zh: '中文', en: 'English', ja: '日本語' };

    // 三語預設範本：和卡片的隊伍頻道句子同一個句型，前面加站號
    static PRESETS = {
        zh: '/p <序號>/<總數> <寶圖等級> <地區> <座標> 最近：<傳送點>',
        en: '/p <序號>/<總數> <寶圖等級> <地區_en> <座標> Nearest: <傳送點_en>',
        ja: '/p <序號>/<總數> <寶圖等級> <地區_ja> <座標> 最寄り：<傳送點_ja>'
    };

    // 這一站查不到傳送點時，預設範本改用這一份：整段拿掉「最近：<傳送點>」，不留下句尾的冒號
    static PRESETS_NO_AETHERYTE = {
        zh: '/p <序號>/<總數> <寶圖等級> <地區> <座標>',
        en: '/p <序號>/<總數> <寶圖等級> <地區_en> <座標>',
        ja: '/p <序號>/<總數> <寶圖等級> <地區_ja> <座標>'
    };

    // 隊伍版預設範本的句尾：這張圖有主人、而且範本就是預設範本時，render() 當下接在句子最後（不存進存檔，所以存著的範本不變）。
    // 中文、日文用全形括號，直接接在句子後面；英文用半形括號，前面要有一個空格。中文的名字後面還有一個空格（名字是英文字母時才分得開）
    static OWNER_SUFFIX = {
        zh: '（<寶圖主人> 的圖）',
        en: " (<寶圖主人>'s map)",
        ja: '（<寶圖主人>の地図）'
    };

    // 舊版（傳送點和寶圖各一行的時代）的三個預設寶圖範本，只用來認出舊存檔裡的 map
    static LEGACY_MAP_PRESETS = {
        zh: '/p 下一個 <寶圖等級> - <地區> <座標>',
        en: '/p Next <寶圖等級> - <地區_en> <座標>',
        ja: '/p 次 <寶圖等級> - <地區_ja> <座標>'
    };

    // 格式區塊裡有按鈕的七個變數，以及只在說明文字裡列出的四個；render() 認得的就是這十一個
    static BUTTON_VARIABLES = ['<序號>', '<總數>', '<寶圖等級>', '<地區>', '<座標>', '<傳送點>', '<寶圖主人>'];
    static MORE_VARIABLES = ['<地區_en>', '<地區_ja>', '<傳送點_en>', '<傳送點_ja>'];

    /**
     * 範本是不是某個語言的預設範本（要一字不差，多一個空白就不是；接上 OWNER_SUFFIX 的隊伍版也不是，它只在 render() 當下組）
     * @param {string} template
     * @returns {'zh'|'en'|'ja'|null} 不是預設範本是 null
     */
    static presetLanguage(template) {
        return CopyFormat.LANGUAGES.find(language => CopyFormat.PRESETS[language] === template) ?? null;
    }

    /**
     * 目前生效的範本：存過的照存的（不管它是不是預設範本，也不跟著介面語言變），沒存過才跟著介面語言
     * @param {string|null} saved - read() 的結果
     * @param {string} uiLanguage - 介面語言；不是三種語言之一時用中文
     * @returns {string}
     */
    static activeTemplate(saved, uiLanguage) {
        return saved ?? CopyFormat.PRESETS[uiLanguage] ?? CopyFormat.PRESETS.zh;
    }

    /**
     * 存著的格式算哪一種，格式區塊收起時旁邊的名稱看這個
     * @param {string|null} saved - read() 的結果
     * @returns {{kind: 'follow'}|{kind: 'preset', language: string}|{kind: 'custom'}}
     *   follow：沒存過，跟著介面語言；preset：存的是某個語言的預設範本；custom：其他
     */
    static describe(saved) {
        if (saved === null || saved === undefined) return { kind: 'follow' };
        const language = CopyFormat.presetLanguage(saved);
        return language ? { kind: 'preset', language } : { kind: 'custom' };
    }

    /**
     * 把一站的資料填進範本，同一個變數出現幾次就換幾次。
     * 範本就是某個語言的預設範本時，依這一站的狀況組出那個語言的句子，兩種情況可以疊加：
     * 沒有傳送點（stop.aetheryte 是 null）改用拿掉傳送點那一段的版本；有主人（stop.owner 是非空字串）句尾再接上 OWNER_SUFFIX。
     * 這是隊伍版預設範本，只在這裡組、不存，所以 presetLanguage()、describe() 和存著的範本都不變。
     * 自訂範本不猜意思：傳送點、主人的變數沒有值就換成空字串，不改範本、也不接句尾。
     * 只有範本裡出現的變數換成了空字串，才把連續的空格收成一個並去掉頭尾空白，
     * 否則使用者自己打的空白一律不動。換行不收：全部複製是一站一行，範本裡使用者自己換的行要留著
     * @param {string} template
     * @param {{index: number, total: number, grade: string, zone: {zh: string, en: string, ja: string}, coords: string, aetheryte: {zh: string, en: string, ja: string}|null, owner?: string|null}} stop
     *   index 是站號（從 1 開始），coords 是 CoordinateUtils.formatPair() 的結果；
     *   owner 是這張圖的主人的名字（<寶圖主人>），不在隊伍裡或沒有主人時是 null，沒給（undefined）和空字串也都當作沒有主人；
     *   名字裡的換行與控制字元換成空格（見函式開頭）
     * @returns {string}
     */
    static render(template, stop) {
        const zone = stop.zone || {};
        const aetheryte = stop.aetheryte || {};
        // 名字是隊員自己取的，伺服器只檢查長度：換行與其他控制字元（Cc，以及 Unicode 的行、段落分隔字元）換成一個空格再去掉頭尾空白，
        // 名字就不會讓這一站多出一行（貼進巨集時那一行會變成另一個指令）。範本裡使用者自己換的行不受影響；只剩控制字元就當作沒有主人
        const owner = String(stop.owner ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim();
        // 只有範本和某個語言的預設範本一字不差，才有「沒有傳送點」與「有主人」的版本
        const language = CopyFormat.presetLanguage(template);
        let source = template;
        if (language) {
            if (!stop.aetheryte) source = CopyFormat.PRESETS_NO_AETHERYTE[language];
            if (owner !== '') source += CopyFormat.OWNER_SUFFIX[language];
        }

        const values = {
            '<序號>': stop.index,
            '<總數>': stop.total,
            '<寶圖等級>': stop.grade,
            '<地區>': zone.zh,
            '<地區_en>': zone.en,
            '<地區_ja>': zone.ja,
            '<座標>': stop.coords,
            '<傳送點>': aetheryte.zh,
            '<傳送點_en>': aetheryte.en,
            '<傳送點_ja>': aetheryte.ja,
            '<寶圖主人>': owner
        };
        // 一次換完：換進去的文字不會再被當成變數換第二次，也不會被當成取代語法（值裡有 $& 之類的字也照原樣）
        const variables = new RegExp(Object.keys(values).join('|'), 'g');
        let emptied = false;
        const filled = source.replace(variables, variable => {
            const value = values[variable] ?? '';
            if (value === '') emptied = true;
            return String(value);
        });
        return emptied ? filled.replace(/[ \t]{2,}/g, ' ').trim() : filled;
    }

    /**
     * 讀出存著的範本，順便把舊格式轉成新格式並寫回。
     * 舊格式是 { teleport, map }：以前傳送點和寶圖各一行，現在每一站一行、傳送點是每一站的 <傳送點>，所以 teleport 不再使用；
     * map 若是舊的三個預設寶圖範本之一，換成同語言的新預設範本（照樣固定語言），否則 map 原文就是新的範本
     * @param {Storage|null} storage - 取不到或不能用時傳 null
     * @returns {string|null} 範本；沒存過、JSON 壞掉、形狀不對、讀不到都是 null（當作沒存過）
     */
    static read(storage) {
        let data;
        try {
            const raw = storage?.getItem(CopyFormat.STORAGE_KEY);
            if (!raw) return null;
            data = JSON.parse(raw);
        } catch {
            return null;
        }
        if (!data || typeof data !== 'object') return null;

        const isFilled = value => typeof value === 'string' && value.trim() !== '';
        if (data.version === 2) return isFilled(data.template) ? data.template : null;
        if (!isFilled(data.map)) return null;

        const language = CopyFormat.LANGUAGES.find(lang => CopyFormat.LEGACY_MAP_PRESETS[lang] === data.map);
        const template = language ? CopyFormat.PRESETS[language] : data.map;
        // 寫回只是讓下次不用再轉；寫不進去也照樣回傳轉好的範本
        CopyFormat.write(storage, template);
        return template;
    }

    /**
     * 存範本。瀏覽器不讓寫入（封鎖網站資料、空間滿了）時不丟例外，由回傳值告訴呼叫端
     * @param {Storage|null} storage
     * @param {string} template
     * @returns {boolean} 寫入成功 true；失敗（包括沒有 storage）false
     */
    static write(storage, template) {
        if (!storage) return false;
        try {
            storage.setItem(CopyFormat.STORAGE_KEY, JSON.stringify({ version: 2, template }));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 刪掉存著的範本，之後跟著介面語言走
     * @param {Storage|null} storage
     */
    static remove(storage) {
        try {
            storage?.removeItem(CopyFormat.STORAGE_KEY);
        } catch { /* 封鎖網站資料時刪不掉：這次照常使用，只是重新整理後會讀回存著的格式 */ }
    }

    /**
     * 在文字的游標位置插入一段字，取代選取的部分，給變數按鈕用
     * @param {string} value - textarea 目前的內容
     * @param {number} start - 選取的開頭（selectionStart）
     * @param {number} end - 選取的結尾（selectionEnd）。任何一個不是整數（例如 undefined、null）就當作不知道游標在哪，接在最後
     * @param {string} text - 要插入的字
     * @returns {{value: string, caret: number}} caret 是插入的字後面的位置，和 selectionStart 一樣以 UTF-16 計算
     */
    static insertAtCursor(value, start, end, text) {
        const known = Number.isInteger(start) && Number.isInteger(end);
        const from = known ? start : value.length;
        const to = known ? end : value.length;
        return { value: value.slice(0, from) + text + value.slice(to), caret: from + text.length };
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) module.exports = CopyFormat;
