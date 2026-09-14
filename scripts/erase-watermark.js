// 从 Live2D 贴图集中擦除水印文字块（置为全透明）
// 用法: node scripts/erase-watermark.js <贴图路径...> [X0 Y0 X1 Y1]
// 不带区域参数时使用守岸人 8192 贴图的实测坐标；其他贴图请先目视测定区域
const fs = require('fs');
const { PNG } = require('pngjs');

// 守岸人 8192 贴图的实测区域（外加 8px 余量）
const DEF = { X0: 5469, Y0: 2301, X1: 6834, Y1: 3516 };
const all = process.argv.slice(2);
const nums = all.filter((a) => /^\d+$/.test(a)).map(Number);
const files = all.filter((a) => !/^\d+$/.test(a));
const { X0, Y0, X1, Y1 } = nums.length === 4
  ? { X0: nums[0], Y0: nums[1], X1: nums[2], Y1: nums[3] }
  : DEF;
console.log('擦除区域:', `(${X0},${Y0})-(${X1},${Y1})`);

for (const file of files) {
  const png = PNG.sync.read(fs.readFileSync(file));
  if (png.width < X1 || png.height < Y1) {
    console.log('跳过（尺寸不足）:', file);
    continue;
  }
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      const i = (y * png.width + x) * 4;
      png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
    }
  }
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log('已擦除水印:', file);
}
