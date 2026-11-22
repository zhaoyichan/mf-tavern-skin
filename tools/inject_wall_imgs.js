/* 把 img/wall-default-*.jpg 转成 base64 data URI，填进 index.js 的占位符。
   用法：node tools/inject_wall_imgs.js
   ★ 为什么需要它：这个客户端不提供 third-party 扩展的静态资源路由
     （/scripts/extensions/third-party/<name>/x.jpg → 404），
     图片只能内联成 data URI。 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const idx = path.join(root, 'index.js');
let src = fs.readFileSync(idx, 'utf8');

let n = 0;
for (const [ph, file] of [['__MF_WALL_IMG_1__', 'wall-default-1.jpg'], ['__MF_WALL_IMG_2__', 'wall-default-2.jpg']]) {
    const p = path.join(root, 'img', file);
    const b64 = fs.readFileSync(p).toString('base64');
    const uri = 'data:image/jpeg;base64,' + b64;
    if (!src.includes(ph)) {
        console.log('skip (already injected or missing):', ph);
        continue;
    }
    src = src.replace(ph, uri);
    n++;
    console.log('injected', ph, '←', file, (b64.length / 1024).toFixed(1) + 'KB base64');
}

fs.writeFileSync(idx, src, 'utf8');
console.log('done, replaced', n, 'placeholder(s)');
