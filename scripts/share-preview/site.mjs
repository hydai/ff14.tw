/**
 * 分享預覽與主畫面：從網站現有的檔案讀出資料，算出每一頁 <head> 裡有標記的那一段與 14 個 manifest。
 *
 * 這個模組不寫檔案、不連網路。資料都來自網站自己的檔案，不另外抄一份：
 *   登錄表（assets/js/components/tools-registry.js）、首頁翻譯（assets/js/i18n/translations/index.js 的 zh）、
 *   每一頁自己的 <title> 與說明、tokens.css 淺色的顏色。
 * 腳本裡只有兩份自己的資料：工具 → 顏色 token 的對照表（TOOL_COLORS）、攻略 7 個主題的檔名（GUIDE_TOPICS）。
 *
 * 指令在 scripts/share-preview.mjs。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SITE_ORIGIN = 'https://ff14.tw';

// 那一段的開頭與結尾註解（腳本靠它們找到這一段，一字不差）
export const BLOCK_START = '<!-- 分享預覽與主畫面：由 scripts/share-preview.mjs 產生，改了分頁標題或說明後重跑 -->';
export const BLOCK_END = '<!-- /分享預覽與主畫面 -->';

// 手機瀏覽器網址列與 Discord 預覽卡色帶用的頁首起點色（tokens.css 淺色、深色各一個值）
export const BAR_TOKEN = '--color-browser-bar';

// 站長的 logo 原檔，與它的底色（logo 沒有透明，manifest 的 background_color 與留邊版圖示都用這個底色）
export const LOGO_FILE = 'assets/images/ff14tw-logo.png';
export const LOGO_BACKGROUND = '#0e171f';

// 每個工具的底色用 tokens.css 的哪個 token（值讀淺色的）。新增工具時要在這裡加一行，沒加 loadSite() 會報錯
export const TOOL_COLORS = Object.freeze({
    'mini-cactpot': '--color-danger-text',
    'wondrous-tails': '--color-brand-b',
    'dungeon-database': '--color-heading',
    'character-card': '--color-danger-text',
    'faux-hollows-foxes': '--color-heading',
    'treasure-map-finder': '--color-success',
    'lodestone-lookup': '--color-primary',
    'timed-gathering': '--color-warning-text',
    'guide': '--color-brand-b',
    'chocobo-color': '--color-warning-text',
    'report-generator': '--color-info',
    'macro-converter': '--color-primary',
    'weather-forecast': '--color-info'
});

// 攻略資料的 7 個主題（tools/guide/<主題>.html），順序就是頁面與預覽圖的順序
export const GUIDE_TOPICS = Object.freeze(['guild', 'grand-company', 'dungeon', 'party', 'aether', 'sightseeing', 'chocobo']);

const ROOT_PAGES = ['index.html', 'about.html', 'changelog.html', 'copyright.html'];
const NOT_FOUND_PAGE = '404.html';
const TOUCH_ICON = 'assets/images/icons/apple-touch-icon.png';
// 預覽圖的大小（og:image:width／height，也是 images 指令畫圖的大小）
export const IMAGE_WIDTH = 1200;
export const IMAGE_HEIGHT = 630;
const INDENT = '    ';

// 三個 manifest 圖示（檔案由 images 指令從 logo 縮出來）
const MANIFEST_ICONS = Object.freeze([
    Object.freeze({ src: '/assets/images/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }),
    Object.freeze({ src: '/assets/images/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }),
    Object.freeze({ src: '/assets/images/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' })
]);

// ---------- 小工具 ----------

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (text, part) => text.split(part).length - 1;
const readText = (root, file) => fs.readFileSync(path.join(root, ...file.split('/')), 'utf8');

// 屬性值與文字裡要跳脫的四個字元（屬性一律用雙引號包起來）
export function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// 解開 <title> 與說明裡的 HTML 實體。不認得的實體丟錯：留著 &copy; 的話，寫回去會變成 &amp;copy;，預覽就和頁面對不上
function decodeEntities(text) {
    return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]*));/gi, (whole, decimal, hex, name) => {
        if (name !== undefined) {
            if (!Object.hasOwn(NAMED_ENTITIES, name)) throw new Error(`不認得的 HTML 實體 ${whole}（site.mjs 的 NAMED_ENTITIES 加上它）`);
            return NAMED_ENTITIES[name];
        }
        return String.fromCodePoint(decimal !== undefined ? Number(decimal) : parseInt(hex, 16));
    });
}

// ---------- tokens.css ----------

function blockOf(css, selector) {
    const match = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`).exec(css);
    if (!match) throw new Error(`tokens.css 找不到 ${selector} 區塊`);
    return match[1];
}

function definitions(block) {
    const map = new Map();
    for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) map.set(match[1], match[2].trim());
    return map;
}

// 展開值裡的 var(--x)：先找這個主題自己的定義，沒有就用淺色的定義（深色沒有重新指定的 token 就是淺色的），
// 找到的值照同一個主題再展開一次（瀏覽器也是這樣算的）
function expandValue(value, own, fallback, trail) {
    const expanded = value.replace(/var\(\s*(--[a-z0-9-]+)\s*\)/g, (whole, name) => {
        if (trail.includes(name)) throw new Error(`token 循環引用：${[...trail, name].join(' → ')}`);
        const raw = own.get(name) ?? fallback?.get(name);
        if (raw === undefined) throw new Error(`token ${name} 沒有定義（${trail[0]} 用到它）`);
        return expandValue(raw, own, fallback, [...trail, name]);
    });
    if (expanded.includes('var(')) throw new Error(`token ${trail[0]} 的值有看不懂的 var()：${value}`);
    return expanded;
}

/**
 * 讀出 tokens.css 的顏色等 token。:root { … } 是淺色，[data-theme="dark"] { … } 是深色（只有深色自己定義的）；
 * 值裡的 var(--x) 都已經展開成實際的值。
 * @param {string} cssText
 * @returns {{ light: Map<string, string>, dark: Map<string, string> }}
 */
export function readTokens(cssText) {
    const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const lightRaw = definitions(blockOf(css, ':root'));
    const darkRaw = definitions(blockOf(css, '[data-theme="dark"]'));
    const expandAll = (raw, fallback) => new Map([...raw].map(([name, value]) => [name, expandValue(value, raw, fallback, [name])]));
    return { light: expandAll(lightRaw, null), dark: expandAll(darkRaw, lightRaw) };
}

// ---------- 頁面的標題與說明 ----------

const META_TAG = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

// 一個標籤的屬性（名稱轉小寫，同名取第一個）
function parseAttributes(tag) {
    const attributes = new Map();
    const inner = tag.replace(/^<[^\s>/]+/, '').replace(/\/?>$/, '');
    for (const match of inner.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
        const name = match[1].toLowerCase();
        if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
    }
    return attributes;
}

/**
 * 讀出一頁的分頁標題與頁面說明（<head> 裡的 <title> 與 <meta name="description">），HTML 實體已解開。
 * @param {string} html
 * @returns {{ title: string, description: string }} 沒有說明時 description 是 ''
 */
export function pageText(html) {
    const headEnd = html.search(/<\/head\s*>/i);
    const head = headEnd === -1 ? html : html.slice(0, headEnd);
    const title = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i.exec(head);
    let description = '';
    for (const tag of head.match(META_TAG) ?? []) {
        const attributes = parseAttributes(tag);
        if (attributes.get('name')?.toLowerCase() === 'description') {
            description = attributes.get('content') ?? '';
            break;
        }
    }
    return { title: title ? decodeEntities(title[1]) : '', description: decodeEntities(description) };
}

// 一頁的標題與說明，兩個都一定要有（沒有的話預覽會是空的）：點名是哪一頁
function requirePageText(root, file) {
    let text;
    try {
        text = pageText(readText(root, file));
    } catch (error) {
        throw new Error(`${file}：${error.message}`);
    }
    if (!text.title) throw new Error(`${file}：沒有 <title>`);
    if (!text.description) throw new Error(`${file}：沒有 <meta name="description">，分享預覽需要頁面說明`);
    return text;
}

// ---------- 預覽卡的字 ----------

/**
 * 預覽圖的替代文字：「（標籤・）名稱：說明」，就是圖上的字。
 * @param {{ label: string, name: string, sentence: string }} card
 */
export function cardAlt(card) {
    return (card.label ? `${card.label}・` : '') + `${card.name}：${card.sentence}`;
}

// ---------- 載入整個網站的資料 ----------

// 首頁翻譯檔是給瀏覽器的腳本（頂層 const，最後呼叫 window.i18n.loadTranslations），在 vm 裡執行並接住傳給它的物件
function readHomeTranslations(root) {
    const file = path.join(root, 'assets/js/i18n/translations/index.js');
    let loaded = null;
    const context = vm.createContext({ window: { i18n: { loadTranslations: (name, data) => { loaded = data; } } } });
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
    if (!loaded?.zh) throw new Error(`${file} 沒有載入 zh 翻譯`);
    return loaded.zh;
}

// 登錄表有 module.exports（給 Node 測試用）。每次都重新載入，不留 require 的快取（測試會在暫存複本上改它）
function readRegistry(root) {
    const require = createRequire(import.meta.url);
    const file = path.join(root, 'assets/js/components/tools-registry.js');
    delete require.cache[require.resolve(file)];
    return require(file);
}

function toolEntry(tool, home, tokens) {
    if (!Object.hasOwn(TOOL_COLORS, tool.id)) {
        throw new Error(`工具 ${tool.id} 不在 TOOL_COLORS（scripts/share-preview/site.mjs）裡，請替它加一行顏色 token`);
    }
    const colorToken = TOOL_COLORS[tool.id];
    const color = tokens.light.get(colorToken);
    if (!color) throw new Error(`工具 ${tool.id} 的顏色 token ${colorToken} 不在 tokens.css 的 :root 裡`);
    const descriptionKey = tool.i18nKey.replace(/_title$/, '_desc');
    const sentence = home[descriptionKey];
    if (!sentence) throw new Error(`工具 ${tool.id} 的首頁卡片說明 ${descriptionKey} 不在 translations/index.js 的 zh 裡`);
    return { id: tool.id, name: tool.name, icon: tool.icon, sentence, colorToken, color };
}

/**
 * 讀出整個網站的資料：13 個工具、7 個攻略主題、21 張預覽卡、25 頁、14 個 manifest。
 * 缺什麼就丟錯並指出是哪個工具、哪個 token、哪一頁，不默默跳過。
 * @param {string} [root] 網站根目錄，預設是這個 repo
 */
export function loadSite(root = REPO_ROOT) {
    const tokens = readTokens(readText(root, 'assets/css/tokens.css'));
    const barColor = tokens.light.get(BAR_TOKEN);
    if (!barColor) throw new Error(`assets/css/tokens.css 的 :root 沒有 ${BAR_TOKEN}`);

    const home = readHomeTranslations(root);
    const registry = readRegistry(root);
    const tools = registry.tools.filter((tool) => !tool.external).map((tool) => toolEntry(tool, home, tokens));
    const guide = tools.find((tool) => tool.id === 'guide');
    if (!guide) throw new Error('登錄表裡沒有 guide（攻略資料）');

    const texts = new Map();
    const textOf = (file) => {
        if (!texts.has(file)) texts.set(file, requirePageText(root, file));
        return texts.get(file);
    };

    // 攻略主題：名稱是那一頁 <title> 去掉「 - 攻略資料 - FF14.tw」，說明是那一頁的說明
    const titleSuffix = ` - ${guide.name} - FF14.tw`;
    const topics = GUIDE_TOPICS.map((slug) => {
        const file = `tools/guide/${slug}.html`;
        const { title, description } = textOf(file);
        if (!title.endsWith(titleSuffix)) throw new Error(`${file}：<title> 要以「${titleSuffix}」結尾（現在是「${title}」）`);
        return { slug, name: title.slice(0, -titleSuffix.length), description };
    });

    const heroTitle = home.hero_title;
    if (!heroTitle) throw new Error('translations/index.js 的 zh 沒有 hero_title');

    // 預覽卡（= 預覽圖）：工具 13 張、攻略主題 7 張、網站 1 張
    const siteCard = { key: 'site', name: 'FF14.tw', label: '', sentence: heroTitle, icon: '', color: null };
    const cards = [
        ...tools.map((tool) => ({ key: tool.id, name: tool.name, label: '', sentence: tool.sentence, icon: tool.icon, color: tool.color })),
        ...topics.map((topic) => ({ key: `guide-${topic.slug}`, name: topic.name, label: guide.name, sentence: topic.description, icon: guide.icon, color: guide.color })),
        siteCard
    ];
    const cardOf = (key) => cards.find((card) => card.key === key);

    const makePage = ({ file, card, appleTitle, manifestHref, touchIconHref }) => ({
        file, ...textOf(file), imageKey: card.key, imageAlt: cardAlt(card), manifestHref, touchIconHref, appleTitle
    });
    const pages = [
        ...ROOT_PAGES.map((file) => makePage({
            file, card: siteCard, appleTitle: siteCard.name,
            manifestHref: 'manifest.webmanifest', touchIconHref: TOUCH_ICON
        })),
        // 404 會出現在任何打錯的網址上，所以資源一律用根目錄的絕對路徑
        makePage({
            file: NOT_FOUND_PAGE, card: siteCard, appleTitle: siteCard.name,
            manifestHref: '/manifest.webmanifest', touchIconHref: `/${TOUCH_ICON}`
        }),
        ...tools.map((tool) => makePage({
            file: `tools/${tool.id}/index.html`, card: cardOf(tool.id), appleTitle: tool.name,
            manifestHref: 'manifest.webmanifest', touchIconHref: `../../${TOUCH_ICON}`
        })),
        ...topics.map((topic) => makePage({
            file: `tools/guide/${topic.slug}.html`, card: cardOf(`guide-${topic.slug}`), appleTitle: guide.name,
            manifestHref: 'manifest.webmanifest', touchIconHref: `../../${TOUCH_ICON}`
        }))
    ];

    // manifest：根目錄 1 個、13 個工具各 1 個（攻略資料的 7 個主題用 tools/guide 的）
    const makeManifest = ({ file, id, page, shortName }) => ({
        file,
        data: {
            id,
            name: page.title,
            short_name: shortName,
            description: page.description,
            lang: 'zh-Hant',
            start_url: id,
            scope: id,
            display: 'browser',
            background_color: LOGO_BACKGROUND,
            theme_color: barColor,
            icons: MANIFEST_ICONS.map((icon) => ({ ...icon }))
        }
    });
    const pageOf = (file) => pages.find((page) => page.file === file);
    const manifests = [
        makeManifest({ file: 'manifest.webmanifest', id: '/', page: pageOf('index.html'), shortName: siteCard.name }),
        ...tools.map((tool) => makeManifest({
            file: `tools/${tool.id}/manifest.webmanifest`, id: `/tools/${tool.id}/`, page: pageOf(`tools/${tool.id}/index.html`), shortName: tool.name
        }))
    ];

    return { tools, topics, heroTitle, tokens, cards, pages, manifests };
}

// ---------- 每一頁 <head> 裡的那一段 ----------

/**
 * 那一段的文字（含開頭、結尾註解），每行縮 4 格，用 \n 相接、結尾不加換行。
 * 每一頁都不寫 og:url：Facebook 把它當正式網址，分享出去的 ?room=（隊伍邀請）、?maps=、#… 會被導回沒有狀態的頁面；Discord、LINE、X 本來就用貼上的網址。
 * @param {{ title: string, description: string, imageKey: string, imageAlt: string,
 *   manifestHref: string, touchIconHref: string, appleTitle: string }} page
 * @param {string} barColor 網址列顏色（淺色的值）
 */
export function headBlock(page, barColor) {
    const lines = [
        BLOCK_START,
        '<meta property="og:site_name" content="FF14.tw">',
        '<meta property="og:type" content="website">',
        '<meta property="og:locale" content="zh_TW">',
        `<meta property="og:title" content="${escapeHtml(page.title)}">`,
        `<meta property="og:description" content="${escapeHtml(page.description)}">`,
        `<meta property="og:image" content="${SITE_ORIGIN}/assets/images/og/${escapeHtml(page.imageKey)}.png">`,
        `<meta property="og:image:width" content="${IMAGE_WIDTH}">`,
        `<meta property="og:image:height" content="${IMAGE_HEIGHT}">`,
        `<meta property="og:image:alt" content="${escapeHtml(page.imageAlt)}">`,
        '<meta name="twitter:card" content="summary_large_image">',
        `<meta name="theme-color" content="${escapeHtml(barColor)}">`,
        `<meta name="apple-mobile-web-app-title" content="${escapeHtml(page.appleTitle)}">`,
        `<link rel="manifest" href="${escapeHtml(page.manifestHref)}">`,
        `<link rel="apple-touch-icon" href="${escapeHtml(page.touchIconHref)}">`,
        BLOCK_END
    ];
    return lines.map((line) => INDENT + line).join('\n');
}

// favicon 那一整行（含換行）：<link … rel="icon" …> 單獨一行
const FAVICON_LINE = /^[ \t]*<link\b[^>\n]*\brel=["']icon["'][^>\n]*>[ \t]*(?:\n|$)/m;

/**
 * 把那一段放進頁面：已經有就換成新的（其他部分一字不動），沒有就插在 favicon（<link rel="icon" …>）那一行的下一行。
 * 開頭、結尾註解對不上，或找不到 favicon 那一行時丟錯（訊息有檔名），不默默跳過。
 * @param {string} html
 * @param {string} block headBlock() 的結果
 * @param {string} file 檔名，只用在錯誤訊息
 */
export function applyHeadBlock(html, block, file) {
    const starts = count(html, BLOCK_START);
    const ends = count(html, BLOCK_END);
    if (starts === 0 && ends === 0) {
        const favicon = FAVICON_LINE.exec(html);
        if (!favicon) throw new Error(`${file}：找不到 <link rel="icon" …> 那一行，沒辦法決定把分享預覽那一段放在哪裡`);
        const lineEnd = favicon.index + favicon[0].length;
        const lineBreak = favicon[0].endsWith('\n') ? '' : '\n';
        return `${html.slice(0, lineEnd)}${lineBreak}${block}\n${html.slice(lineEnd)}`;
    }
    const existing = new RegExp(`^[ \\t]*${escapeRegExp(BLOCK_START)}[ \\t]*\\n[\\s\\S]*?^[ \\t]*${escapeRegExp(BLOCK_END)}[ \\t]*$`, 'm');
    const match = starts === 1 && ends === 1 ? existing.exec(html) : null;
    if (!match) throw new Error(`${file}：分享預覽那一段的開頭、結尾註解對不上（開頭 ${starts} 個、結尾 ${ends} 個），請手動整理成一段`);
    return html.slice(0, match.index) + block + html.slice(match.index + match[0].length);
}

// ---------- manifest ----------

/** manifest 檔案的文字：2 格縮排的 JSON，結尾一個換行 */
export function manifestJson(data) {
    return `${JSON.stringify(data, null, 2)}\n`;
}
