/**
 * 預覽圖與主畫面圖示：算出每張圖要畫的 HTML，與「這張圖是照什麼畫的」的雜湊。
 *
 * 這個模組不讀檔、不寫檔、不開 Chrome：讀檔、決定哪幾張要重畫是 scripts/share-preview.mjs 的 images 指令，
 * 開 Chrome 畫圖是 render.mjs。卡片（loadSite().cards）的字與顏色來自 site.mjs，範本是 scripts/share-preview/card.html。
 */
import { createHash } from 'node:crypto';
import { LOGO_BACKGROUND, escapeHtml } from './site.mjs';

// 預覽圖的範本（相對於 repo 根目錄），與預覽圖、圖示放的資料夾
export const CARD_TEMPLATE = 'scripts/share-preview/card.html';
export const OG_DIR = 'assets/images/og';
export const ICON_DIR = 'assets/images/icons';

/**
 * 四張主畫面圖示，都從 logo 縮出來：size 是邊長（像素），scale 是 logo 佔畫布的比例。
 * 留邊版（maskable）縮成 84%、四周補 logo 的底色：Android 會把圖示裁成圓形或圓角方形，
 * 只保證中心直徑 80% 的圓不被裁到，外圈金色圓與「ff14.tw」字樣要都在那個圓裡。
 */
export const ICONS = Object.freeze([
    Object.freeze({ file: 'apple-touch-icon.png', size: 180, scale: 1 }),
    Object.freeze({ file: 'icon-192.png', size: 192, scale: 1 }),
    Object.freeze({ file: 'icon-512.png', size: 512, scale: 1 }),
    Object.freeze({ file: 'icon-maskable-512.png', size: 512, scale: 0.84 })
]);

// 網站那張預覽圖的背景用淺色的品牌漸層；工具的背景是它的顏色往右下漸暗到「70% 那個顏色加 30% 黑」
const BRAND_GRADIENT_TOKEN = '--gradient-brand';
const DARKEN_WITH = '#000000';

// 範本裡 {{名稱}} 的位置：每一個都要有，也不能有不認得的
const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;
const PLACEHOLDERS = ['BACKGROUND', 'LOGO', 'LAYOUT', 'LABEL', 'ICON', 'NAME', 'SENTENCE'];

export const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');

// 範本的換行一律當成 \n：Windows 上 git 可能把 card.html 換成 \r\n，換行不同的複本要得到同一個雜湊、同一張圖
const withLfNewlines = (text) => text.replace(/\r\n/g, '\n');

/**
 * 範本的雜湊（要交給 cardHash() 的 templateSha256）：範本的文字把 \r\n 換成 \n 之後的 SHA-256。
 * 換行本來就是 \n 的檔案，它就是檔案位元組的 SHA-256。
 * @param {string} text card.html 的文字
 */
export function templateHash(text) {
    return sha256Hex(withLfNewlines(text));
}

// 欄位要是字串。JSON.stringify 會把陣列裡的 undefined 悄悄變成 null，少了欄位雜湊也算得出來，所以要先擋下
function requireStrings(owner, names, what) {
    for (const name of names) {
        if (typeof owner?.[name] !== 'string') {
            throw new Error(`${what}的 ${name} 要是字串，現在是 ${owner?.[name] === undefined ? '沒有這個欄位' : typeof owner[name]}`);
        }
    }
}

/**
 * 一張預覽圖的背景（CSS 的 background 值）。
 * @param {{ key: string, color: string | null }} card color 是 null 的是網站那張
 * @param {{ light: Map<string, string> }} tokens readTokens() 的結果
 * @returns {string}
 */
export function cardBackground(card, tokens) {
    if (card.color === null) {
        const gradient = tokens.light.get(BRAND_GRADIENT_TOKEN);
        if (!gradient) throw new Error(`assets/css/tokens.css 的 :root 沒有 ${BRAND_GRADIENT_TOKEN}（網站那張預覽圖的背景）`);
        return gradient;
    }
    if (typeof card.color !== 'string' || card.color === '') throw new Error(`卡片 ${card.key} 沒有顏色（card.color 要是字串，網站那張才是 null）`);
    return `linear-gradient(135deg, ${card.color} 0%, color-mix(in srgb, ${card.color} 70%, ${DARKEN_WITH}) 100%)`;
}

/**
 * 預覽圖是照什麼畫的：[key, name, label, sentence, icon, background, logoSha256, templateSha256] 的 JSON 的 SHA-256。
 * 圖裡的 tEXt 記這個雜湊；內容沒變就不用重畫。
 * @param {{ key: string, name: string, label: string, sentence: string, icon: string }} card
 * @param {{ background: string, logoSha256: string, templateSha256: string }} sources
 */
export function cardHash(card, { background, logoSha256, templateSha256 } = {}) {
    requireStrings(card, ['key', 'name', 'label', 'sentence', 'icon'], '卡片');
    requireStrings({ background, logoSha256, templateSha256 }, ['background', 'logoSha256', 'templateSha256'], 'cardHash 的選項');
    return sha256Hex(JSON.stringify([card.key, card.name, card.label, card.sentence, card.icon, background, logoSha256, templateSha256]));
}

/**
 * 圖示是照什麼畫的：[file, size, scale, logo 的底色, logoSha256, 圖示頁面的 HTML] 的 JSON 的 SHA-256。
 * 圖示頁面（iconHtml()，logo 用空的 data URI 代替：logo 的內容已經由 logoSha256 涵蓋）也算進去：
 * 只改頁面的樣式或檢查、沒動到上面幾個欄位時，4 張圖示照樣會被當成過期、重畫。
 * @param {{ file: string, size: number, scale: number }} icon
 * @param {{ logoSha256: string }} sources
 */
export function iconHash(icon, { logoSha256 } = {}) {
    requireStrings(icon, ['file'], '圖示');
    for (const name of ['size', 'scale']) {
        if (!Number.isFinite(icon[name])) throw new Error(`圖示 ${icon.file} 的 ${name} 要是數字，現在是 ${icon[name]}`);
    }
    requireStrings({ logoSha256 }, ['logoSha256'], 'iconHash 的選項');
    const page = iconHtml(icon, { logoDataUri: '' });
    return sha256Hex(JSON.stringify([icon.file, icon.size, icon.scale, LOGO_BACKGROUND, logoSha256, page]));
}

/**
 * 把範本的 {{…}} 換成這張卡片的字，回傳要交給 Chrome 的完整頁面。名稱、說明、標籤與圖示照 HTML 跳脫；
 * 一次換完（說明裡剛好有 {{NAME}} 這幾個字時照字面留著）。沒有圖示的卡片（網站那張）用網站版型（is-site），其他是工具版型（is-tool）。
 * 範本少了某個 {{…}}、多了不認得的 {{…}}，或缺了選項，都丟錯。範本的換行 \r\n 先換成 \n（和 templateHash() 一樣：同一個雜湊就畫出同一個頁面）。
 * @param {{ name: string, label: string, sentence: string, icon: string }} card
 * @param {{ template: string, background: string, logoDataUri: string }} options template 是 card.html 的文字，background 是 cardBackground() 的結果
 */
export function cardHtml(card, options) {
    requireStrings(card, ['name', 'label', 'sentence', 'icon'], '卡片');
    requireStrings(options, ['template', 'background', 'logoDataUri'], 'cardHtml 的選項');
    const { background, logoDataUri } = options;
    const template = withLfNewlines(options.template);
    const found = new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1]));
    for (const name of found) {
        if (!PLACEHOLDERS.includes(name)) throw new Error(`預覽圖的範本（${CARD_TEMPLATE}）有不認得的 {{${name}}}`);
    }
    for (const name of PLACEHOLDERS) {
        if (!found.has(name)) throw new Error(`預覽圖的範本（${CARD_TEMPLATE}）少了 {{${name}}}`);
    }
    const values = {
        BACKGROUND: background,
        LOGO: logoDataUri,
        LAYOUT: card.icon === '' ? 'is-site' : 'is-tool',
        LABEL: escapeHtml(card.label),
        ICON: escapeHtml(card.icon),
        NAME: escapeHtml(card.name),
        SENTENCE: escapeHtml(card.sentence)
    };
    return template.replace(PLACEHOLDER, (whole, name) => values[name]);
}

/**
 * 一張圖示的頁面：畫布是 size×size、底色是 logo 的底色，logo 縮成 scale 放在正中間。
 * 頁面自己定義 window.__problems()（render.mjs 會呼叫），檢查 logo 真的載入了。
 * @param {{ file: string, size: number, scale: number }} icon
 * @param {{ logoDataUri: string }} options
 */
export function iconHtml(icon, options) {
    requireStrings(options, ['logoDataUri'], 'iconHtml 的選項');
    // logo 的邊長取偶數：四周補的邊兩邊一樣寬，logo 才會落在整數的像素上，不會有一條半個像素的接縫
    const inner = Math.round((icon.size * icon.scale) / 2) * 2;
    return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>${escapeHtml(icon.file)}</title>
<style>
html, body { margin: 0; width: ${icon.size}px; height: ${icon.size}px; overflow: hidden; background: ${LOGO_BACKGROUND}; }
body { display: grid; place-items: center; }
img { display: block; width: ${inner}px; height: ${inner}px; }
</style>
</head>
<body>
<img src="${options.logoDataUri}" alt="">
<script>
window.__problems = () => {
    const logo = document.querySelector('img');
    return logo.complete && logo.naturalWidth > 0 ? [] : ['logo 沒有載入'];
};
</script>
</body>
</html>
`;
}
