// 隊伍名字模組：這台機器的預設名字（光之戰士＋3 碼字串）、自己改過的名字怎麼記，以及每張寶圖是誰的（清單、路線、複製句子）。
// 不碰 DOM；storage 與 getText 從外面傳進來，不讀任何全域（randomTag 預設的亂數來源 crypto 除外，可以換掉）
class PartyNames {
    // 字串可用的字元：數字 2～9 加上不含 I、L、O 的大寫字母，共 31 個，不會把 0／O、1／I／L 看錯
    static TAG_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    // 字串長度：3 碼共 29,791 種；英文預設名字 Warrior of Light K7Q 剛好 20 字，所以只能 3 碼
    static TAG_LENGTH = 3;

    // localStorage 的 key：這台機器的字串（一台一組，產生後一直用）、玩家自己改過的名字（只有「改名」會寫）
    static TAG_KEY = 'ff14tw_nickname_tag';
    static NICKNAME_KEY = 'ff14tw_user_nickname';

    // 名字最多幾字：和伺服器一致，它數的是去掉頭尾空白後的 length
    static MAX_NICKNAME = 20;

    // 三種語言的預設名字開頭
    static BASES = { zh: '光之戰士', en: 'Warrior of Light', ja: '光の戦士' };

    // 舊版的預設名字樣式（光之戰士、光之戰士1、Warrior of Light 2…）：舊版的改名對話框按「確認」不改也會存，
    // 所以存值可能是這種樣子，它不算玩家自己取的名字
    static LEGACY_DEFAULT = /^(光之戰士|Warrior of Light|光の戦士) ?\d*$/;

    /**
     * 產生一組字串：3 個 TAG_ALPHABET 裡的字元。
     * 每次用 fillRandom 填一個 16 位元組的 Uint8Array，依序取位元組，只收 < 248（31 × 8）的，字元是 TAG_ALPHABET[byte % 31]。
     * 256 不是 31 的倍數，直接取餘數會讓前面幾個字元比較容易出現；只收 248 個，每個字元剛好對到 8 個位元組，機率就一樣。
     * 湊滿 3 個就停，不夠就再填一次
     * @param {function(Uint8Array): *} fillRandom - 就地把亂數填進收到的位元組，回傳值不看；預設是 crypto.getRandomValues
     * @returns {string}
     */
    static randomTag(fillRandom = bytes => crypto.getRandomValues(bytes)) {
        const alphabet = PartyNames.TAG_ALPHABET;
        // 不超過 256 的、31 的最大倍數（248）
        const limit = alphabet.length * Math.floor(256 / alphabet.length);
        let tag = '';
        while (tag.length < PartyNames.TAG_LENGTH) {
            const bytes = new Uint8Array(16);
            fillRandom(bytes);
            for (const byte of bytes) {
                if (byte >= limit) continue;
                tag += alphabet[byte % alphabet.length];
                if (tag.length === PartyNames.TAG_LENGTH) break;
            }
        }
        return tag;
    }

    /**
     * 是不是合格的字串：剛好 3 個 TAG_ALPHABET 裡的字元（不去空白，小寫不算）
     * @param {*} value
     * @returns {boolean}
     */
    static isTag(value) {
        return typeof value === 'string'
            && value.length === PartyNames.TAG_LENGTH
            && [...value].every(char => PartyNames.TAG_ALPHABET.includes(char));
    }

    /**
     * 這台機器的字串：存著的是合格字串就直接用（不重寫），否則產生新的、試著存起來
     * @param {Storage|null} storage - 取不到或不能用時傳 null
     * @param {function(): string} generate - 產生新字串的函式，預設是 randomTag()
     * @returns {string} 讀不到、存不進去（封鎖網站資料）時照樣回傳新產生的，只是下次會再換一組
     */
    static readTag(storage, generate = () => PartyNames.randomTag()) {
        try {
            const saved = storage?.getItem(PartyNames.TAG_KEY);
            if (PartyNames.isTag(saved)) return saved;
        } catch { /* 讀不到就當作沒存過 */ }
        const tag = generate();
        try {
            storage?.setItem(PartyNames.TAG_KEY, tag);
        } catch { /* 封鎖網站資料時存不下來：這次照用，只是記不住 */ }
        return tag;
    }

    /**
     * 預設名字：該語言的開頭接上字串。中文、日文直接接，英文中間一個空格
     * @param {string} language - 不是三種語言之一時用中文
     * @param {string} tag
     * @returns {string} 例：光之戰士K7Q、光の戦士K7Q、Warrior of Light K7Q
     */
    static defaultName(language, tag) {
        const base = PartyNames.BASES[language] ?? PartyNames.BASES.zh;
        return language === 'en' ? `${base} ${tag}` : `${base}${tag}`;
    }

    /**
     * 玩家自己改過的名字
     * @param {Storage|null} storage
     * @returns {string|null} 去掉頭尾空白後；沒存過、讀不到、是空的、超過 20 字、是舊版的預設名字樣式都是 null
     */
    static savedNickname(storage) {
        let saved;
        try {
            saved = storage?.getItem(PartyNames.NICKNAME_KEY);
        } catch {
            return null;
        }
        if (typeof saved !== 'string') return null;
        const name = saved.trim();
        if (name === '' || name.length > PartyNames.MAX_NICKNAME || PartyNames.LEGACY_DEFAULT.test(name)) return null;
        return name;
    }

    /**
     * 名字像不像預設名字：舊版的預設名字樣式，或是這台機器的字串接在任何一種語言的開頭後面
     * @param {string} name - 去掉頭尾空白後比較
     * @param {string} tag - 這台機器的字串
     * @returns {boolean}
     */
    static isDefaultLike(name, tag) {
        const trimmed = name.trim();
        return PartyNames.LEGACY_DEFAULT.test(trimmed)
            || Object.keys(PartyNames.BASES).some(language => PartyNames.defaultName(language, tag) === trimmed);
    }

    /**
     * 建立、加入隊伍時用的名字：玩家自己改過的優先，沒有就是這個語言的預設名字
     * @param {Storage|null} storage
     * @param {string} language
     * @param {string} tag
     * @returns {string}
     */
    static resolveNickname(storage, language, tag) {
        return PartyNames.savedNickname(storage) ?? PartyNames.defaultName(language, tag);
    }

    /**
     * 改名之後記住新名字，只有「改名」會寫 NICKNAME_KEY。
     * 名字沒變就什麼都不寫；改成預設名字（isDefaultLike）就刪掉存值，下次組隊回到預設名字，開頭跟著介面語言；其他名字存起來
     * @param {Storage|null} storage
     * @param {string} name - 新名字，去掉頭尾空白後比較、儲存
     * @param {{previous: string, tag: string}} context - previous 是改名前的名字；tag 是這台機器的字串
     */
    static rememberRename(storage, name, { previous, tag }) {
        const trimmed = name.trim();
        if (trimmed === previous) return;
        try {
            if (PartyNames.isDefaultLike(trimmed, tag)) storage?.removeItem(PartyNames.NICKNAME_KEY);
            else storage?.setItem(PartyNames.NICKNAME_KEY, trimmed);
        } catch { /* 封鎖網站資料時寫不進去：這次照常改名，只是記不住 */ }
    }

    /**
     * 驗證「看過的成員名字」（id → 名字），從 localStorage 讀回來的資料不能直接信
     * @param {*} value
     * @returns {Object<string, string>} 新的物件：value 不是一般物件回 {}；只留 key 是 1～64 字、值去掉頭尾空白後是 1～20 字的字串的項目
     *   （值存去掉頭尾空白的），合格的項目最多留前 64 筆
     */
    static validKnownMembers(value) {
        const MAX_ID_LENGTH = 64;
        const MAX_ENTRIES = 64;
        if (Object.prototype.toString.call(value) !== '[object Object]') return {};
        const entries = Object.entries(value)
            .map(([id, name]) => [id, typeof name === 'string' ? name.trim() : ''])
            .filter(([id, name]) => id.length >= 1 && id.length <= MAX_ID_LENGTH
                && name.length >= 1 && name.length <= PartyNames.MAX_NICKNAME);
        return Object.fromEntries(entries.slice(0, MAX_ENTRIES));
    }

    /**
     * 一張寶圖是誰加的
     * @param {{addedBy?: string}|null} map - 隊伍清單裡的寶圖；addedBy 是加進去的成員 id
     * @param {{members: Array<{id: string, nickname: string}>, knownMembers: Object<string, string>, meId: string}} context
     *   members 是現在隊伍裡的成員（伺服器回的陣列）；knownMembers 是看過的 id → 名字（validKnownMembers 驗證過的）；meId 是自己的成員 id
     * @returns {{kind: 'me'|'member'|'left', id: string, name: string|null}|null}
     *   addedBy 是空的回 null。me：自己的圖，name 是自己現在的名字；member：還在隊伍裡的隊友，name 是他現在的名字；
     *   left：已經不在隊伍裡，name 是看過的名字，沒看過是 null
     */
    static ownerOf(map, { members, knownMembers, meId }) {
        const id = map?.addedBy;
        if (!id) return null;
        const member = Array.isArray(members) ? members.find(item => item?.id === id) : undefined;
        const nickname = typeof member?.nickname === 'string' ? member.nickname : null;
        if (id === meId) return { kind: 'me', id, name: nickname };
        if (member) return { kind: 'member', id, name: nickname };
        // 只收字串：id 剛好叫 constructor 之類的名字時，不會取到 Object 原型上的東西
        const known = knownMembers?.[id];
        return { kind: 'left', id, name: typeof known === 'string' ? known : null };
    }

    /**
     * 清單與路線上「誰的圖」那一行的字
     * @param {{kind: string, name: string|null}|null} owner - ownerOf() 的結果
     * @param {function(string, string, Object=): string} getText - 簽名同 FF14Utils.getI18nText(key, 中文預設文字, params)
     * @returns {string|null} owner 是 null（不顯示這一行）或認不得的 kind 回 null
     */
    static ownerLabel(owner, getText) {
        if (!owner) return null;
        switch (owner.kind) {
            case 'me':
                return getText('treasure_map_owner_me', '你的圖');
            case 'member':
                return getText('treasure_map_owner_member', '{name} 的圖', { name: owner.name ?? '' });
            case 'left':
                return owner.name
                    ? getText('treasure_map_owner_left', '{name}（已離開）的圖', { name: owner.name })
                    : getText('treasure_map_owner_left_unknown', '已離開隊員的圖');
            default:
                return null;
        }
    }

    /**
     * 複製句子裡的主人：句子是貼到隊伍頻道給全隊看的，自己的圖寫自己的名字（不寫「你」）；
     * 主人已經離開時不管有沒有看過名字，一律寫「已離開隊員」，提醒大家這張圖的主人已經不在隊上
     * @param {{kind: string, name: string|null}|null} owner - ownerOf() 的結果
     * @param {function(string, string, Object=): string} getText - 簽名同 FF14Utils.getI18nText
     * @returns {string|null} owner 是 null 回 null；me、member 沒有可用的名字時也是 null
     */
    static sentenceOwner(owner, getText) {
        if (!owner) return null;
        if (owner.kind === 'left') return getText('treasure_map_owner_former', '已離開隊員');
        return owner.name;
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) module.exports = PartyNames;
if (typeof window !== 'undefined') window.PartyNames = PartyNames;
