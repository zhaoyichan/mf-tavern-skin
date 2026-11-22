#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/check_boot_sync.js
   检查 index.js 里的「首屏骨架」MF_SKIN_BOOT 与 skin.css 的 :root 变量
   是否一致 —— 两者不一致的话，冷启动第一帧和完整皮肤的配色会不一样
   （首帧偏一下再跳），主人一眼就能看出来。

   用法：node tools/check_boot_sync.js
   退出码：0 = 一致；1 = 不一致（会列出差异项）
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexJs = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const skinCss = fs.readFileSync(path.join(root, 'skin.css'), 'utf8');

/* ── 从 index.js 里抠出 MF_SKIN_BOOT 的字符串数组 ──
   ★ 不能用 split(',') —— CSS 值里带逗号（rgba(179, 164, 136, .34)）会被切碎。
     按单引号边界切才安全。 */
const m = indexJs.match(/var MF_SKIN_BOOT\s*=\s*\[([\s\S]*?)\]\.join\(''\)/);
if (!m) {
    console.error('✗ 在 index.js 里找不到 MF_SKIN_BOOT');
    process.exit(1);
}
const boot = (m[1].match(/'[^']*'/g) || [])
    .map(x => x.slice(1, -1))
    .join('');

/* ── 值归一化：去掉所有空白，rgba(179, 164, 136, .34) 与 rgba(179,164,136,.34) 视为相同 ── */
function norm(v) {
    return String(v).replace(/\/\*.*?\*\//g, '').replace(/\s+/g, '').trim();
}

/* ── 从 skin.css 里抽出 :root 块里定义的 --mf-* 变量 ── */
const cssVars = {};
const re = /(--mf-[a-z0-9-]+)\s*:\s*([^;}]+)/gi;
let vm;
while ((vm = re.exec(skinCss)) !== null) {
    /* 一个变量可能被多次定义（不同 :root 块），取**最后一个**（层叠后生效的那个） */
    cssVars[vm[1]] = vm[2].trim();
}

/* ── 从骨架里抽出 --mf-* 变量 ── */
const bootVars = {};
const re2 = /(--mf-[a-z0-9-]+)\s*:\s*([^;}]+)/gi;
let bm;
while ((bm = re2.exec(boot)) !== null) bootVars[bm[1]] = bm[2].trim();

/* ── 对比 ── */
const keys = Array.from(new Set([...Object.keys(cssVars), ...Object.keys(bootVars)])).sort();
const diffs = [];

for (const k of keys) {
    const a = cssVars[k];
    const b = bootVars[k];
    if (a === undefined) { diffs.push(`  ${k}: 骨架里有、skin.css 里没有 → ${b}`); continue; }
    if (b === undefined) { diffs.push(`  ${k}: skin.css 里有、骨架里没有 → ${a}`); continue; }
    /* 归一化后再比（去注释、去空格） */
    if (norm(a) !== norm(b)) diffs.push(`  ${k}: skin.css=${a}  骨架=${b}`);
}

console.log(`骨架大小：${boot.length} 字符`);
console.log(`--mf-* 变量：skin.css ${Object.keys(cssVars).length} 个 / 骨架 ${Object.keys(bootVars).length} 个`);

if (diffs.length) {
    console.log('\n✗ 骨架与 skin.css 不一致（会导致首屏配色跳变）：');
    diffs.forEach(d => console.log(d));
    console.log('\n修法：把 skin.css 里对应的值同步到 index.js 的 MF_SKIN_BOOT 数组里。');
    process.exit(1);
}
console.log('\n✓ 骨架与 skin.css 的 --mf-* 变量完全一致。');
