// 图标绘制原语库：纯像素几何绘制（无第三方素材），供 build-icon.js / icon-candidates.js 使用
// 设计基准 256，在 MASTER(1024) 上绘制后降采样获得抗锯齿
const fs = require('fs');
const { PNG } = require('pngjs');

const MASTER = 1024;
const u = (v) => (v / 256) * MASTER;   // 256 设计基准 → 主画布坐标

function createCanvas() {
  return new Float32Array(MASTER * MASTER * 4);
}

function blendAt(buf, x, y, r, g, b, a) {
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

function roundRect(buf, x0, y0, x1, y1, radius, color) {
  const [r, g, b, a = 255] = color;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      if (inRoundRect(x, y, x0, y0, x1, y1, radius)) blendAt(buf, x, y, r, g, b, a);
    }
  }
}

function circle(buf, cx, cy, radius, color) {
  const [r, g, b, a = 255] = color;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= radius * radius) blendAt(buf, x, y, r, g, b, a);
    }
  }
}

function triangle(buf, ax, ay, bx, by, cx, cy, color) {
  const [r, g, b, a = 255] = color;
  const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(d) < 1e-6) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w1 = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / d;
      const w2 = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / d;
      if (w1 >= 0 && w2 >= 0 && 1 - w1 - w2 >= 0) blendAt(buf, x, y, r, g, b, a);
    }
  }
}

function gradientRoundRect(buf, x0, y0, x1, y1, radius, top, bottom) {
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    const t = (y - y0) / (y1 - y0);
    const r = top[0] + (bottom[0] - top[0]) * t;
    const g = top[1] + (bottom[1] - top[1]) * t;
    const b = top[2] + (bottom[2] - top[2]) * t;
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      if (inRoundRect(x, y, x0, y0, x1, y1, radius)) blendAt(buf, x, y, r, g, b, 255);
    }
  }
}

// 旋转矩形（绕中心 angle 弧度）—— 哑铃等斜置元素用
function rotatedRect(buf, cx, cy, halfLen, halfThick, angle, color) {
  const [r, g, b, a = 255] = color;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const R = Math.sqrt(halfLen * halfLen + halfThick * halfThick) + 2;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const px = x + 0.5 - cx, py = y + 0.5 - cy;
      // 逆旋转变换到局部坐标
      const lx = px * cos + py * sin;
      const ly = -px * sin + py * cos;
      if (Math.abs(lx) <= halfLen && Math.abs(ly) <= halfThick) blendAt(buf, x, y, r, g, b, a);
    }
  }
}

// 降采样输出 PNG Buffer
function downscale(buf, size) {
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

// 打包 ICO（多尺寸，PNG 负载）
function packIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);
  let offset = 6 + pngBuffers.length * 16;
  const dir = Buffer.alloc(pngBuffers.length * 16);
  pngBuffers.forEach((img, i) => {
    const o = i * 16;
    const s = img.size;
    dir.writeUInt8(s >= 256 ? 0 : s, o);
    dir.writeUInt8(s >= 256 ? 0 : s, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(img.data.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += img.data.length;
  });
  return Buffer.concat([header, dir, ...pngBuffers.map((i) => i.data)]);
}

// ASCII 缩略图（检查造型用）
function asciiPreview(pngBuffer, cols = 46) {
  const png = PNG.sync.read(pngBuffer);
  const step = png.width / cols;
  const rows = Math.round(png.height / step);
  let art = '';
  for (let gy = 0; gy < rows; gy++) {
    let row = '';
    for (let gx = 0; gx < cols; gx++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = Math.floor(gy * step); y < Math.floor((gy + 1) * step); y++) {
        for (let x = Math.floor(gx * step); x < Math.floor((gx + 1) * step); x++) {
          if (y >= png.height || x >= png.width) continue;
          const i = (y * png.width + x) * 4;
          r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; a += png.data[i + 3]; n++;
        }
      }
      r /= n; g /= n; b /= n; a /= n;
      if (a < 50) { row += ' '; continue; }
      const lum = (r * 0.3 + g * 0.6 + b * 0.1);
      // 按亮度分级：适用于任何底色
      row += lum > 235 ? '#' : lum > 190 ? 'O' : lum > 150 ? 'o' : lum > 110 ? '+' : lum > 70 ? '-' : '@';
    }
    art += row + '\n';
  }
  return art + '亮度: @最暗 - 暗 + 中 o 亮 O 很亮 # 白';
}

module.exports = {
  MASTER, u, createCanvas, blendAt, roundRect, circle, triangle,
  gradientRoundRect, rotatedRect, downscale, packIco, asciiPreview,
};
