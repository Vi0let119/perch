// 扫描已安装资源包的 Live2D 贴图，检测是否残留水印横幅（大片不透明近黑像素）
// 用法: node scripts/scan-watermark.js
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const packsDir = path.join(process.env.APPDATA, 'Perch', 'packs');
const S = 8; // 8px 网格聚合，避免逐像素过慢

function scanPng(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const gw = Math.ceil(png.width / S), gh = Math.ceil(png.height / S);
  const grid = new Uint32Array(gw * gh);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];
      // 近黑且不透明
      if (a > 200 && r < 40 && g < 40 && b < 40) grid[Math.floor(y / S) * gw + Math.floor(x / S)]++;
    }
  }
  // 找最大连通暗区（水印横幅是大块实心矩形；角色暗色部分是零散细线）
  const seen = new Uint8Array(gw * gh);
  let best = { cells: 0, bbox: null };
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const idx = gy * gw + gx;
      if (seen[idx] || grid[idx] <= S * S * 0.3) continue;
      // BFS
      const stack = [[gx, gy]];
      seen[idx] = 1;
      let cells = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
      while (stack.length) {
        const [x, y] = stack.pop();
        cells++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (seen[ni] || grid[ni] <= S * S * 0.3) continue;
          seen[ni] = 1;
          stack.push([nx, ny]);
        }
      }
      if (cells > best.cells) {
        best = {
          cells,
          bbox: [minX * S, minY * S, (maxX + 1) * S, (maxY + 1) * S],
          fill: cells / ((maxX - minX + 1) * (maxY - minY + 1)),
        };
      }
    }
  }
  return { w: png.width, h: png.height, ...best };
}

if (!fs.existsSync(packsDir)) {
  console.log('未找到资源包目录:', packsDir);
  process.exit(0);
}
for (const id of fs.readdirSync(packsDir)) {
  const dir = path.join(packsDir, id);
  if (!fs.statSync(dir).isDirectory()) continue;
  const mf = path.join(dir, 'manifest.json');
  if (!fs.existsSync(mf)) continue;
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  if (manifest.type !== 'live2d') continue;
  const modelPath = path.join(dir, manifest.model);
  const desc = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  for (const tex of (desc.FileReferences && desc.FileReferences.Textures) || []) {
    const f = path.join(path.dirname(modelPath), tex);
    if (!fs.existsSync(f)) continue;
    const r = scanPng(f);
    // 水印横幅特征：连通的实心矩形暗块（填充率 > 0.6 且面积够大）
    const banner = r.cells > 1500 && (r.fill || 1) > 0.6;
    console.log(`${manifest.name || id} | ${tex} | ${r.w}x${r.h} | 最大连通暗块 ${r.cells} 格 填充率 ${(r.fill || 0).toFixed(2)}${banner ? '  ← 疑似水印横幅 ' + JSON.stringify(r.bbox) : '  (无水印特征)'}`);
  }
}
