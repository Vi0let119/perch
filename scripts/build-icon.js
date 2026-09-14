// 生成应用图标：Perch —— 粉色圆角方块 + 白色小鸟停在横杆上（纯代码绘制，无第三方素材）
// 输出 assets/icon.png（256）与 assets/icon.ico（多尺寸）
// 用法: node scripts/build-icon.js  [--preview]  （--preview 额外打印 ASCII 缩略图便于检查造型）
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const OUT_PNG = path.join(ROOT, 'assets', 'icon.png');
const OUT_ICO = path.join(ROOT, 'assets', 'icon.ico');
const SHOW_PREVIEW = process.argv.includes('--preview');

const MASTER = 1024;
const OUT = 256;

const buf = new Float32Array(MASTER * MASTER * 4);
const u = (v) => (v / 256) * MASTER;   // 以 256 为设计基准

function blendAt(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= MASTER || y >= MASTER || a <= 0) return;
  const i = (y * MASTER + x) * 4;
  const sa = a / 255, da = buf[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  buf[i] = (r * sa + buf[i] * da * (1 - sa)) / oa;
  buf[i + 1] = (g * sa + buf[i + 1] * da * (1 - sa)) / oa;
  buf[i + 2] = (b * sa + buf[i + 2] * da * (1 - sa)) / oa;
  buf[i + 3] = oa * 255;
}

function inRoundRect(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || y < y0 || x >= x1 || y >= y1) return false;
  const cx = x < x0 + radius ? x0 + radius : x >= x1 - radius ? x1 - radius - 1 : x;
  const cy = y < y0 + radius ? y0 + radius : y >= y1 - radius ? y1 - radius - 1 : y;
  if (cx === x && cy === y) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function roundRect(x0, y0, x1, y1, radius, color) {
  const [r, g, b, a = 255] = color;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      if (inRoundRect(x, y, x0, y0, x1, y1, radius)) blendAt(x, y, r, g, b, a);
    }
  }
}

function circle(cx, cy, radius, color) {
  const [r, g, b, a = 255] = color;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= radius * radius) blendAt(x, y, r, g, b, a);
    }
  }
}

function triangle(ax, ay, bx, by, cx, cy, color) {
  const [r, g, b, a = 255] = color;
  const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(d) < 1e-6) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w1 = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / d;
      const w2 = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / d;
      if (w1 >= 0 && w2 >= 0 && 1 - w1 - w2 >= 0) blendAt(x, y, r, g, b, a);
    }
  }
}

function gradientRoundRect(x0, y0, x1, y1, radius, top, bottom) {
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    const t = (y - y0) / (y1 - y0);
    const r = top[0] + (bottom[0] - top[0]) * t;
    const g = top[1] + (bottom[1] - top[1]) * t;
    const b = top[2] + (bottom[2] - top[2]) * t;
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      if (inRoundRect(x, y, x0, y0, x1, y1, radius)) blendAt(x, y, r, g, b, 255);
    }
  }
}

// ==== 造型参数（256 设计基准）====
const WHITE = [255, 255, 255, 255];
const BODY = { x: 130, y: 118, r: 56 };
const BAR = { x0: 34, y0: 170, x1: 222, y1: 188, r: 8 };
const EYE = { x: 156, y: 100, r: 7 };

// 背景
const pad = 6;
gradientRoundRect(u(pad), u(pad), u(256 - pad), u(256 - pad), u(54), [255, 178, 200], [229, 102, 146]);

// 横杆
roundRect(u(BAR.x0), u(BAR.y0), u(BAR.x1), u(BAR.y1), u(BAR.r), WHITE);

// 尾巴：从身体左下方伸出，斜向左下
triangle(u(102), u(130), u(42), u(174), u(120), u(166), WHITE);

// 身体
circle(u(BODY.x), u(BODY.y), u(BODY.r), WHITE);

// 喙：短而圆钝，指向右
triangle(u(172), u(106), u(208), u(119), u(172), u(132), WHITE);

// 眼睛（挖背景色）
circle(u(EYE.x), u(EYE.y), u(EYE.r), [214, 88, 130, 255]);

// ==== 降采样 ====
function downscale(size) {
  const s = MASTER / size;
  const out = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const n = s * s;
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          const i = ((y * s + dy) * MASTER + (x * s + dx)) * 4;
          const av = buf[i + 3] / 255;
          r += buf[i] * av; g += buf[i + 1] * av; b += buf[i + 2] * av; a += av;
        }
      }
      const di = (y * size + x) * 4;
      if (a <= 0) { out.data[di] = out.data[di + 1] = out.data[di + 2] = out.data[di + 3] = 0; continue; }
      out.data[di] = Math.round(r / a);
      out.data[di + 1] = Math.round(g / a);
      out.data[di + 2] = Math.round(b / a);
      out.data[di + 3] = Math.round((a / n) * 255);
    }
  }
  return PNG.sync.write(out);
}

fs.writeFileSync(OUT_PNG, downscale(OUT));
console.log('已生成', OUT_PNG);

const sizes = [16, 32, 48, 64, 128, 256];
const images = sizes.map((s) => ({ size: s, data: downscale(s) }));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = 6 + images.length * 16;
const dir = Buffer.alloc(images.length * 16);
images.forEach((img, i) => {
  const o = i * 16;
  dir.writeUInt8(img.size >= 256 ? 0 : img.size, o);
  dir.writeUInt8(img.size >= 256 ? 0 : img.size, o + 1);
  dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
  dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(img.data.length, o + 8); dir.writeUInt32LE(offset, o + 12);
  offset += img.data.length;
});
fs.writeFileSync(OUT_ICO, Buffer.concat([header, dir, ...images.map((i) => i.data)]));
console.log('已生成', OUT_ICO, `（${sizes.join('/')}）`);

// ==== ASCII 预览（检查造型用）====
if (SHOW_PREVIEW) {
  const png = PNG.sync.read(fs.readFileSync(OUT_PNG));
  const N = 46, step = png.width / N;
  let art = '';
  for (let gy = 0; gy < N; gy++) {
    let row = '';
    for (let gx = 0; gx < N; gx++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = Math.floor(gy * step); y < Math.floor((gy + 1) * step); y++) {
        for (let x = Math.floor(gx * step); x < Math.floor((gx + 1) * step); x++) {
          const i = (y * png.width + x) * 4;
          r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; a += png.data[i + 3]; n++;
        }
      }
      r /= n; g /= n; b /= n; a /= n;
      row += a < 60 ? ' ' : r > 230 && g > 230 && b > 230 ? '#' : a > 200 ? '.' : '+';
    }
    art += row + '\n';
  }
  console.log(art + '图例: 空格=透明  .=粉底  #=白色(小鸟/横杆)');
}
