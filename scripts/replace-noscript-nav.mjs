#!/usr/bin/env node
/**
 * 把每個頁面 <noscript> 內的 <nav style="..."> / <a style="..."> 改成
 * class="noscript-nav" / class="noscript-nav-link"（樣式定義在 common.css）。
 * 可重複執行：已是目標格式的頁面會被跳過。
 * 用法：node scripts/replace-noscript-nav.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['api', 'node_modules', 'docs', '.git', '.claude', '.superpowers']);

// 逐字比對舊版 <nav style="..."> 區塊：4 個連結、文字固定（首頁／版權聲明／GitHub／關於）
const OLD_NAV_RE = /<nav style="padding: 1rem; background: #667eea; color: white; text-align: center;">\s*<a href="\/" style="color: white; margin: 0 1rem;">首頁<\/a>\s*<a href="\/copyright\.html" style="color: white; margin: 0 1rem;">版權聲明<\/a>\s*<a href="https:\/\/github\.com\/hydai\/ff14\.tw" target="_blank" rel="noopener noreferrer" style="color: white; margin: 0 1rem;">GitHub<\/a>\s*<a href="\/about\.html" style="color: white; margin: 0 1rem;">關於<\/a>\s*<\/nav>/;

function buildReplacement(indent) {
    return [
        `<nav class="noscript-nav">`,
        `${indent}    <a href="/" class="noscript-nav-link">首頁</a>`,
        `${indent}    <a href="/copyright.html" class="noscript-nav-link">版權聲明</a>`,
        `${indent}    <a href="https://github.com/hydai/ff14.tw" target="_blank" rel="noopener noreferrer" class="noscript-nav-link">GitHub</a>`,
        `${indent}    <a href="/about.html" class="noscript-nav-link">關於</a>`,
        `${indent}</nav>`,
    ].join('\n');
}

function listPages(dir = ROOT, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) listPages(full, out);
        else if (entry.name.endsWith('.html')) out.push(full);
    }
    return out;
}

let changed = 0;
let skipped = 0;
for (const page of listPages()) {
    const original = fs.readFileSync(page, 'utf8');
    const match = original.match(/^([ \t]*)<nav style="padding: 1rem; background: #667eea/m);
    if (!match) {
        skipped++; // 已是目標格式，或這個頁面沒有 noscript nav
        continue;
    }
    const next = original.replace(OLD_NAV_RE, buildReplacement(match[1]));
    if (next === original) {
        console.error(`略過（找到開頭但整段沒對上，需人工檢查）：${path.relative(ROOT, page)}`);
        continue;
    }
    fs.writeFileSync(page, next);
    changed++;
    console.log(`已更新：${path.relative(ROOT, page)}`);
}
console.log(`完成，共更新 ${changed} 頁，${skipped} 頁已是目標格式或無需處理。`);
