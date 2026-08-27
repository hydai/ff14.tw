#!/usr/bin/env node
/**
 * 移除所有頁面 <head> 裡的 assets/css/dark-mode-tools.css <link>。
 * 可重複執行：找不到該 <link> 的頁面會被跳過。
 * 用法：node scripts/remove-dark-mode-links.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['api', 'node_modules', 'docs', '.git', '.claude', '.superpowers']);

function listPages(dir = ROOT, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) listPages(full, out);
        else if (entry.name.endsWith('.html')) out.push(full);
    }
    return out;
}

// 只認 <link>，且 href 精準比對檔名
function isDarkModeToolsLink(line) {
    return /<link\b/i.test(line) && /href="[^"]*assets\/css\/dark-mode-tools\.css"/.test(line);
}

let changed = 0;
for (const page of listPages()) {
    const original = fs.readFileSync(page, 'utf8');
    const lines = original.split('\n');
    const kept = lines.filter((line) => !isDarkModeToolsLink(line));
    if (kept.length === lines.length) continue;
    fs.writeFileSync(page, kept.join('\n'));
    changed++;
    console.log(`已移除連結：${path.relative(ROOT, page)}`);
}
console.log(`完成，共處理 ${changed} 頁。`);
