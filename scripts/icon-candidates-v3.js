// v3 · 日轮飞鸟：奶油底 + 橙红日轮 + 抽象弧线飞鸟笔触（用户要求：抽象线条代替具象鸟）
// 用法: node scripts/icon-candidates-v3.js [--preview]
const fs = require('fs');
const path = require('path');
const lib = require('./icon-lib');

const OUT_DIR = path.join(__dirname, '..', 'icon-candidates');
const SHOW_PREVIEW = process.argv.includes('--preview');
const u = (v) => lib.u(v);

// 书法弧线笔触：二次贝塞尔打点，中段粗两端细（毛笔感）
function strokeArc(buf, x0, y0, x1, y1, bulge, rMax, color) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - bulge;
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
    const w = Math.sin(t * Math.PI);
    lib.circle(buf, u(x), u(y), u(rMax * Math.max(w, 0.22)), color);
  }
}

// 一只抽象飞鸟 = 两道下弯弧组成的浅 V
function birdStroke(buf, cx, cy, w, rMax, color) {
  strokeArc(buf, cx - w / 2, cy + w * 0.16, cx, cy + w * 0.30, w * 0.22, rMax, color);
  strokeArc(buf, cx, cy + w * 0.30, cx + w / 2, cy + w * 0.16, w * 0.22, rMax, color);
}

function sunriseAbstract(buf) {
  // 奶油底
  lib.gradientRoundRect(buf, u(6), u(6), u(250), u(250), u(54), [246, 240, 229], [236, 226, 209]);
  // 日轮（同心三层）
  lib.circle(buf, u(128), u(104), u(58), [240, 122, 92, 255]);
  lib.circle(buf, u(128), u(104), u(45), [233, 92, 66, 255]);
  lib.circle(buf, u(128), u(104), u(32), [224, 70, 48, 255]);
  // 抽象飞鸟三只（大小渐变：最大的一只压在日轮前，深炭色在橙上最清晰）
  const INK = [44, 39, 36, 255];
  birdStroke(buf, 118, 86, 56, 5.5, INK);
  birdStroke(buf, 174, 60, 38, 4.2, INK);
  birdStroke(buf, 206, 44, 26, 3.2, INK);
  // 地平线
  lib.roundRect(buf, u(40), u(176), u(216), u(181), u(2.5), INK);
  // 日轮在水面上的倒影（三道渐短的横线，极简海报常用语言）
  lib.roundRect(buf, u(88), u(190), u(168), u(193), u(1.5), [224, 70, 48, 150]);
  lib.roundRect(buf, u(102), u(200), u(154), u(202.5), u(1.5), [224, 70, 48, 110]);
  lib.roundRect(buf, u(114), u(210), u(142), u(212), u(1.5), [224, 70, 48, 80]);
}

const buf = lib.createCanvas();
sunriseAbstract(buf);
const png = lib.downscale(buf, 256);
const out = path.join(OUT_DIR, 'v3-sunrise-abstract.png');
fs.writeFileSync(out, png);
console.log('已生成', out);

if (SHOW_PREVIEW) console.log(lib.asciiPreview(png));
