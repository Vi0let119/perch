// 扫描守岸人 8192 贴图集，按红色像素聚类定位水印图案区域
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const TEX = process.argv[2] || path.join('build-tests', 'userdata', 'packs', 'skin-e640267f', 'cat_model', 'cat.8192', 'texture_00.png');
const png = PNG.sync.read(fs.readFileSync(TEX));
console.log('贴图:', png.width + 'x' + png.height);

// 扫描红色系像素（水印文字为红色）：R 明显高于 G/B
const S = 16; // 16px 网格聚合
const gw = Math.ceil(png.width / S), gh = Math.ceil(png.height / S);
const grid = new Uint32Array(gw * gh);
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4;
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];
    if (a > 100 && r > 120 && r > g * 1.8 && r > b * 1.8) {
      grid[Math.floor(y / S) * gw + Math.floor(x / S)]++;
    }
  }
}

// 输出热点（阈值以上的网格，聚合为簇）
const hot = [];
for (let gy = 0; gy < gh; gy++) {
  for (let gx = 0; gx < gw; gx++) {
    const c = grid[gy * gw + gx];
    if (c > 8) hot.push([gx * S, gy * S, c]);
  }
}
console.log('红色热点网格数:', hot.length);
// 简单聚类：相邻 64px 内合并
const clusters = [];
for (const [x, y, c] of hot) {
  let found = null;
  for (const cl of clusters) {
    if (x >= cl.x0 - 64 && x <= cl.x1 + 64 && y >= cl.y0 - 64 && y <= cl.y1 + 64) { found = cl; break; }
  }
  if (found) {
    found.x0 = Math.min(found.x0, x); found.y0 = Math.min(found.y0, y);
    found.x1 = Math.max(found.x1, x); found.y1 = Math.max(found.y1, y);
    found.n += c;
  } else clusters.push({ x0: x, y0: y, x1: x, y1: y, n: c });
}
clusters.sort((a, b) => b.n - a.n);
for (const cl of clusters.slice(0, 12)) {
  console.log(`簇: (${cl.x0},${cl.y0}) - (${cl.x1},${cl.y1})  大小 ${cl.x1 - cl.x0}x${cl.y1 - cl.y0}  红像素 ${cl.n}`);
}
