// 生成 Perch 应用图标：奶油底 + 橙红日轮 + 抽象飞鸟笔触 + 水面倒影（纯代码绘制，无第三方素材）
// 输出 assets/icon.png（256）与 assets/icon.ico（16/32/48/64/128/256）
// 用法: node scripts/build-icon.js [--preview]
const fs = require('fs');
const path = require('path');
const lib = require('./icon-lib');

const OUT_PNG = path.join(__dirname, '..', 'assets', 'icon.png');
const OUT_ICO = path.join(__dirname, '..', 'assets', 'icon.ico');
const SHOW_PREVIEW = process.argv.includes('--preview');
const u = (v) => lib.u(v);

const buf = lib.createCanvas();

// 奶油底
lib.gradientRoundRect(buf, u(6), u(6), u(250), u(250), u(54), [246, 240, 229], [236, 226, 209]);
// 日轮（同心三层）
lib.circle(buf, u(128), u(104), u(58), [240, 122, 92, 255]);
lib.circle(buf, u(128), u(104), u(45), [233, 92, 66, 255]);
lib.circle(buf, u(128), u(104), u(32), [224, 70, 48, 255]);
// 抽象飞鸟三只（书法弧线笔触，中段粗两端细；大小渐变，飞离太阳）
const INK = [44, 39, 36, 255];
function strokeArc(x0, y0, x1, y1, bulge, rMax) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - bulge;
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
    const w = Math.sin(t * Math.PI);
    lib.circle(buf, u(x), u(y), u(rMax * Math.max(w, 0.22)), INK);
  }
}
function birdStroke(cx, cy, w, rMax) {
  strokeArc(cx - w / 2, cy + w * 0.16, cx, cy + w * 0.30, w * 0.22, rMax);
  strokeArc(cx, cy + w * 0.30, cx + w / 2, cy + w * 0.16, w * 0.22, rMax);
}
birdStroke(118, 86, 56, 5.5);    // 大鸟（压在日轮前）
birdStroke(174, 60, 38, 4.2);    // 中鸟（跨日轮边缘）
birdStroke(206, 44, 26, 3.2);    // 小鸟（飞出画面）
// 地平线
lib.roundRect(buf, u(40), u(176), u(216), u(181), u(2.5), INK);
// 日轮在水面上的倒影（三道渐短横线）
lib.roundRect(buf, u(88), u(190), u(168), u(193), u(1.5), [224, 70, 48, 150]);
lib.roundRect(buf, u(102), u(200), u(154), u(202.5), u(1.5), [224, 70, 48, 110]);
lib.roundRect(buf, u(114), u(210), u(142), u(212), u(1.5), [224, 70, 48, 80]);

// 输出
const png256 = lib.downscale(buf, 256);
fs.writeFileSync(OUT_PNG, png256);
console.log('已生成', OUT_PNG);

const sizes = [16, 32, 48, 64, 128, 256];
const ico = lib.packIco(sizes.map((s) => ({ size: s, data: lib.downscale(buf, s) })));
fs.writeFileSync(OUT_ICO, ico);
console.log('已生成', OUT_ICO, `（${sizes.join('/')}）`);

if (SHOW_PREVIEW) console.log(lib.asciiPreview(png256));
