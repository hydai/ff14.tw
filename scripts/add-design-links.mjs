#!/usr/bin/env node
/**
 * 為每一個頁面補上 tokens.css 與 Google Fonts 連結，並把字重統一為 400/500/600/700。
 * 可重複執行：已符合的頁面不會被改動。
 * 用法：node scripts/add-design-links.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['api', 'node_modules', 'docs', '.git', '.claude', '.superpowers']);
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap';

function listPages(dir = ROOT, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) listPages(full, out);
        else if (entry.name.endsWith('.html')) out.push(full);
    }
    return out;
}

const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

// 只認 <link>，且 href 的主機名稱要完全等於 Google Fonts 的網域（不是子字串比對）
function isFontLink(line) {
    if (!/<link\b/i.test(line)) return false;
    const match = line.match(/href="([^"]+)"/);
    if (!match) return false;
    try {
        return FONT_HOSTS.has(new URL(match[1]).hostname);
    } catch {
        return false;
    }
}

function isTokensLink(line) {
    return /<link\b/i.test(line) && /href="[^"]*assets\/css\/tokens\.css"/.test(line);
}

let changed = 0;
for (const page of listPages()) {
    const original = fs.readFileSync(page, 'utf8');
    const lines = original.split('\n');

    // 1. 找到 common.css 那一行，記下縮排與相對路徑前綴（'' 或 '../../'）
    const commonIndex = lines.findIndex((line) => /<link[^>]+href="[^"]*assets\/css\/common\.css"/.test(line));
    if (commonIndex === -1) {
        console.error(`略過（找不到 common.css）：${path.relative(ROOT, page)}`);
        continue;
    }
    const indent = lines[commonIndex].match(/^\s*/)[0];
    const prefix = lines[commonIndex].match(/href="([^"]*)assets\/css\/common\.css"/)[1];

    // 2. 移除舊的字型與 tokens 連結（之後統一重插）
    const kept = lines.filter((line) => !(isFontLink(line) || isTokensLink(line)));

    // 3. 在 common.css 前插入：preconnect ×2、字型、tokens.css
    const insertAt = kept.findIndex((line) => /<link[^>]+href="[^"]*assets\/css\/common\.css"/.test(line));
    const block = [
        `${indent}<link rel="preconnect" href="https://fonts.googleapis.com">`,
        `${indent}<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
        `${indent}<link href="${FONT_HREF}" rel="stylesheet">`,
        `${indent}<link rel="stylesheet" href="${prefix}assets/css/tokens.css">`,
    ];
    kept.splice(insertAt, 0, ...block);

    const next = kept.join('\n');
    if (next !== original) {
        fs.writeFileSync(page, next);
        changed++;
        console.log(`已更新：${path.relative(ROOT, page)}`);
    }
}
console.log(`完成，共更新 ${changed} 頁`);
