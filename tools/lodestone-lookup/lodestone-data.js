/**
 * Lodestone 角色查詢 - 靜態資料
 *
 * 頁面（lodestone-model.js 與 script.js）讀這四份，都是深層凍結的全域：
 * - LODESTONE_JOBS：34 個職業，官方順序，附分組、三種語言的官方名稱、圖示與是否為限定職業
 * - LODESTONE_BASE_CLASSES：基本職業 → 它的職業（頁面把基本職業放在職業那一格）
 * - LODESTONE_WORLDS：搜尋的伺服器選單，11 個資料中心與 85 個伺服器，值就是官網 worldname 的值
 * - LODESTONE_TERMS：官網的英文與日文原文 → 官方繁中（部隊活動重點、招募對象、大國防聯軍、聲望、開始城市）
 *
 * 職業與伺服器的資料在共用的 assets/js/ff14-game-data.js（FF14_JOBS、FF14_WORLDS），這裡不複製，
 * 只把 LODESTONE_JOBS、LODESTONE_WORLDS 指到同一份，所以 index.html 要先載入共用檔。
 */

// ==================== 頁面用的資料 ====================
// 深層凍結。包在立即執行的函式裡，不多出全域的名稱：只有下面四個掛到 window 上。
(() => {
    // 嚴格模式：想改凍結的資料時會丟 TypeError，不會被默默忽略
    'use strict';

    const deepFreeze = (value) => {
        for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
        return Object.freeze(value);
    };

    // 職業與伺服器選單：共用檔裡已經深層凍結的同一份，欄位與值的說明也在那個檔案
    window.LODESTONE_JOBS = window.FF14_JOBS;
    window.LODESTONE_WORLDS = window.FF14_WORLDS;

    /**
     * 基本職業 → 它的職業。Worker 的職業回答裡，還沒轉職的職業那一列寫的是基本職業（例如騎士那一列寫 Gladiator），
     * 目前職業也可能是基本職業；網站沒有基本職業的圖示，所以把它放在職業那一格，顯示職業的名稱與圖示。
     */
    window.LODESTONE_BASE_CLASSES = deepFreeze({
        Gladiator: 'Paladin',
        Marauder: 'Warrior',
        Conjurer: 'WhiteMage',
        Arcanist: 'Summoner',
        Pugilist: 'Monk',
        Lancer: 'Dragoon',
        Rogue: 'Ninja',
        Archer: 'Bard',
        Thaumaturge: 'BlackMage'
    });

    /**
     * 官網的原文 → 官方繁中。官網依「名稱與成就顯示」送來英文或日文，兩種原文放在同一張表裡；
     * 只有中文介面才換（見 LodestoneModel.term），認不得的原文照舊顯示。
     * 用語照 TERMINOLOGY.md：大國防聯軍的名稱、開始城市（大國防聯軍的總部所在），部隊活動重點的「迷宮」「討伐殲滅戰」
     * 「大型任務」「公會令」是它的副本類型；「硬派」不在裡面，是這個網站自己選的用詞。
     * 聲望的日文只收在 Lodestone 日文部隊頁看過的「中立」「盟友」，其他四級只有英文原文。
     */
    window.LODESTONE_TERMS = deepFreeze({
        // 部隊的活動重點
        focus: {
            'Role-playing': '角色扮演', 'ロールプレイ': '角色扮演',
            'Leveling': '練級', 'レベリング': '練級',
            'Casual': '休閒', 'カジュアル': '休閒',
            'Hardcore': '硬派', 'ハードコア': '硬派',
            'Dungeons': '迷宮', 'ダンジョン': '迷宮',
            'Guildhests': '公會令', 'ギルドオーダー': '公會令',
            'Trials': '討伐殲滅戰', '討伐・討滅戦': '討伐殲滅戰',
            'Raids': '大型任務', 'レイド': '大型任務',
            'PvP': 'PvP'
        },
        // 部隊的招募對象
        seeking: {
            'Tank': '坦克', 'TANK': '坦克',
            'Healer': '治療', 'HEALER': '治療',
            'DPS': '輸出',
            'Crafter': '生產職', 'CRAFTER': '生產職',
            'Gatherer': '採集職', 'GATHERER': '採集職'
        },
        // 大國防聯軍
        grandCompany: {
            'Maelstrom': '黑渦團', '黒渦団': '黑渦團',
            'Order of the Twin Adder': '雙蛇黨', '双蛇党': '雙蛇黨',
            'Immortal Flames': '不滅隊', '不滅隊': '不滅隊'
        },
        // 大國防聯軍的聲望
        reputation: {
            'Neutral': '中立', '中立': '中立',
            'Friendly': '友好',
            'Trusted': '信賴',
            'Respected': '敬重',
            'Honored': '崇敬',
            'Allied': '同盟', '盟友': '同盟'
        },
        // 開始城市
        town: {
            'Limsa Lominsa': '利姆薩·羅敏薩', 'リムサ・ロミンサ': '利姆薩·羅敏薩',
            'Gridania': '格里達尼亞', 'グリダニア': '格里達尼亞',
            "Ul'dah": '烏爾達哈', 'ウルダハ': '烏爾達哈'
        }
    });
})();
