#!/usr/bin/env node
/**
 * 分享預覽與主畫面的產生腳本（Node 24，沒有任何套件）。
 *
 * 用法：
 *   node scripts/share-preview.mjs pages    重寫 25 頁 <head> 裡的分享預覽那一段，並寫出 14 個 manifest。
 *                                           不用 Chrome、不連網路，可以重跑；內容沒變的檔案不會重寫。
 *   node scripts/share-preview.mjs images   畫 21 張預覽圖（assets/images/og/）與 4 張主畫面圖示（assets/images/icons/）。
 *                                           要本機的 Chrome（預設 macOS 的路徑，可以用環境變數 CHROME_PATH 換）與網路（Google Fonts）；
 *                                           每張圖記著「是照什麼畫的」的雜湊，沒變的不重畫；字放不下、字型沒載入時報錯，不產生任何圖。
 *
 * 改了某一頁的分頁標題或說明、新增工具、改了首頁卡片的說明、logo 或卡片範本之後重跑。
 * 資料都從網站現有的檔案讀（見 scripts/share-preview/site.mjs）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { CARD_TEMPLATE, ICONS, ICON_DIR, OG_DIR, cardBackground, cardHash, cardHtml, iconHash, iconHtml, sha256Hex, templateHash } from './share-preview/cards.mjs';
import { SOURCE_KEYWORD, readPngInfo, recompressPng, withTextChunk } from './share-preview/png.mjs';
import { renderPngs } from './share-preview/render.mjs';
import { BAR_TOKEN, IMAGE_HEIGHT, IMAGE_WIDTH, LOGO_FILE, REPO_ROOT, applyHeadBlock, headBlock, loadSite, manifestJson } from './share-preview/site.mjs';

const USAGE = `用法：node scripts/share-preview.mjs <指令>
  pages    重寫每一頁 <head> 裡的分享預覽那一段，並寫出 14 個 manifest（不連網路，可以重跑）
  images   畫 21 張預覽圖與 4 張主畫面圖示，內容沒變的不重畫（要本機的 Chrome 與網路；CHROME_PATH 可以指定 Chrome 的路徑）`;

const pathOf = (file) => path.join(REPO_ROOT, ...file.split('/'));

// 先把每個檔案的新內容全部算好，有任何一頁出錯就一個檔案都不寫；只寫內容有變的檔案，回傳寫了哪些
function writeAll(updates) {
    const changed = [];
    for (const { file, next } of updates) {
        const target = pathOf(file);
        const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
        if (previous === next) continue;
        fs.writeFileSync(target, next);
        changed.push(file);
    }
    return changed;
}

function pages() {
    const site = loadSite();
    const barColor = site.tokens.light.get(BAR_TOKEN);
    const updates = [
        ...site.pages.map((page) => {
            const html = fs.readFileSync(pathOf(page.file), 'utf8');
            return { file: page.file, next: applyHeadBlock(html, headBlock(page, barColor), page.file) };
        }),
        ...site.manifests.map(({ file, data }) => ({ file, next: manifestJson(data) }))
    ];
    const changed = writeAll(updates);
    if (changed.length === 0) {
        console.log(`沒有檔案需要更新（${site.pages.length} 頁、${site.manifests.length} 個 manifest 都是最新的）`);
        return;
    }
    console.log(`更新了 ${changed.length} 個檔案：`);
    for (const file of changed) console.log(`  ${file}`);
}

// 這張圖照現在的內容畫過了嗎：檔案在、大小對、tEXt 記的雜湊等於現在算出來的
function isFresh({ file, width, height, hash }) {
    try {
        const info = readPngInfo(fs.readFileSync(pathOf(file)));
        return info.width === width && info.height === height && info.text.get(SOURCE_KEYWORD) === hash;
    } catch {
        return false; // 沒有這個檔案，或檔案壞了（readPngInfo 擋得住 CRC 不符與被截斷）：重畫
    }
}

async function images() {
    const site = loadSite();
    if (!fs.existsSync(pathOf(LOGO_FILE))) throw new Error(`找不到 logo 原檔 ${LOGO_FILE}`);
    const logo = fs.readFileSync(pathOf(LOGO_FILE));
    const template = fs.readFileSync(pathOf(CARD_TEMPLATE), 'utf8');
    const logoSha256 = sha256Hex(logo);
    const templateSha256 = templateHash(template); // 換行 \r\n 與 \n 的複本雜湊一樣
    const logoDataUri = `data:image/png;base64,${logo.toString('base64')}`;

    // 21 張預覽圖與 4 張圖示：檔案、大小、照現在的內容算出來的雜湊，與（要畫時才組的）頁面
    const items = [
        ...site.cards.map((card) => {
            const background = cardBackground(card, site.tokens);
            return {
                name: card.key, file: `${OG_DIR}/${card.key}.png`, width: IMAGE_WIDTH, height: IMAGE_HEIGHT,
                hash: cardHash(card, { background, logoSha256, templateSha256 }),
                html: () => cardHtml(card, { template, background, logoDataUri })
            };
        }),
        ...ICONS.map((icon) => ({
            name: icon.file, file: `${ICON_DIR}/${icon.file}`, width: icon.size, height: icon.size,
            hash: iconHash(icon, { logoSha256 }),
            html: () => iconHtml(icon, { logoDataUri })
        }))
    ];
    const stale = items.filter((item) => !isFresh(item));
    const skipped = items.length - stale.length;

    if (stale.length > 0) {
        console.log(`要畫 ${stale.length} 張（跳過 ${skipped} 張沒變的）：`);
        for (const item of stale) console.log(`  ${item.file}`);
    }
    // 先全部畫完、壓好，再寫檔、刪檔：畫到一半出錯（字放不下、字型沒載入、找不到 Chrome）時，什麼檔案都不動
    const rendered = stale.length === 0 ? new Map() : await renderPngs(stale.map(({ name, width, height, html }) => ({ name, width, height, html: html() })));
    const outputs = stale.map((item) => ({ file: item.file, png: withTextChunk(recompressPng(rendered.get(item.name)), SOURCE_KEYWORD, item.hash) }));

    const ogDir = pathOf(OG_DIR);
    const wanted = new Set(site.cards.map((card) => `${card.key}.png`));
    const unused = fs.existsSync(ogDir) ? fs.readdirSync(ogDir).filter((name) => name.endsWith('.png') && !wanted.has(name)).sort() : [];

    for (const { file, png } of outputs) {
        fs.mkdirSync(path.dirname(pathOf(file)), { recursive: true });
        fs.writeFileSync(pathOf(file), png);
    }
    for (const name of unused) fs.rmSync(path.join(ogDir, name));
    console.log(`畫了 ${stale.length} 張、跳過 ${skipped} 張`);
    if (unused.length > 0) {
        console.log(`刪掉了 ${unused.length} 張不屬於這 ${site.cards.length} 張的圖：`);
        for (const name of unused) console.log(`  ${OG_DIR}/${name}`);
    }
}

const COMMANDS = { pages, images };

async function main(argv) {
    const [command, ...rest] = argv;
    if (!Object.hasOwn(COMMANDS, command) || rest.length > 0) {
        console.error(USAGE);
        return 1;
    }
    try {
        await COMMANDS[command]();
        return 0;
    } catch (error) {
        // 缺顏色、缺說明、找不到 favicon 這類是預期的錯誤，訊息已經指出是哪一個，不用印出呼叫堆疊
        console.error(error.name === 'Error' ? `錯誤：${error.message}` : error);
        return 1;
    }
}

process.exitCode = await main(process.argv.slice(2));
