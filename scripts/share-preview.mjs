#!/usr/bin/env node
/**
 * 分享預覽與主畫面的產生腳本（Node 24，沒有任何套件）。
 *
 * 用法：
 *   node scripts/share-preview.mjs pages   重寫 25 頁 <head> 裡的分享預覽那一段，並寫出 14 個 manifest。
 *                                          不用 Chrome、不連網路，可以重跑；內容沒變的檔案不會重寫。
 *
 * 改了某一頁的分頁標題或說明、新增工具之後重跑。資料都從網站現有的檔案讀（見 scripts/share-preview/site.mjs）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { BAR_TOKEN, REPO_ROOT, applyHeadBlock, headBlock, loadSite, manifestJson } from './share-preview/site.mjs';

const USAGE = `用法：node scripts/share-preview.mjs pages
  pages   重寫每一頁 <head> 裡的分享預覽那一段，並寫出 14 個 manifest（不連網路，可以重跑）`;

// 先把每個檔案的新內容全部算好，有任何一頁出錯就一個檔案都不寫；只寫內容有變的檔案，回傳寫了哪些
function writeAll(updates) {
    const changed = [];
    for (const { file, next } of updates) {
        const target = path.join(REPO_ROOT, ...file.split('/'));
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
            const html = fs.readFileSync(path.join(REPO_ROOT, ...page.file.split('/')), 'utf8');
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

const COMMANDS = { pages };

function main(argv) {
    const [command, ...rest] = argv;
    if (!Object.hasOwn(COMMANDS, command) || rest.length > 0) {
        console.error(USAGE);
        return 1;
    }
    try {
        COMMANDS[command]();
        return 0;
    } catch (error) {
        // 缺顏色、缺說明、找不到 favicon 這類是預期的錯誤，訊息已經指出是哪一個，不用印出呼叫堆疊
        console.error(error.name === 'Error' ? `錯誤：${error.message}` : error);
        return 1;
    }
}

process.exitCode = main(process.argv.slice(2));
