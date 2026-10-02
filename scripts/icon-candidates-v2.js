// 极简艺术风图标候选 v2（4 个方向，非粉色主调）
// 用法: node scripts/icon-candidates-v2.js [--preview]
const fs = require('fs');
const path = require('path');
const lib = require('./icon-lib');

const OUT_DIR = path.join(__dirname, '..', 'icon-candidates');
fs.mkdirSync(OUT_DIR, { recursive: true });
const SHOW_PREVIEW = process.argv.includes('--preview');

const u = (v) => lib.u(v);

// ========== v2-1 夜色栖鸟（Nocturne）==========
// 深蓝夜空 + 暖月 + 枝上鸟剪影 —— 极简海报构图
function nocturne(buf) {
  lib.gradientRoundRect(buf, u(6), u(6), u(250), u(250), u(54), [22, 32, 58], [42, 58, 102]);
  // 月亮（暖白大圆，居中偏右 —— 鸟剪影完全压在月上才可见）
  lib.circle(buf, u(160), u(100), u(64), [246, 238, 216, 255]);
  lib.circle(buf, u(178), u(84), u(10), [228, 216, 188, 90]);    // 月面暗斑
  lib.circle(buf, u(146), u(118), u(7), [228, 216, 188, 70]);
  // 星星（够亮才可见）
  lib.circle(buf, u(50), u(54), u(3), [235, 240, 252, 240]);
  lib.circle(buf, u(92), u(38), u(2.2), [235, 240, 252, 200]);
  lib.circle(buf, u(216), u(186), u(2.6), [235, 240, 252, 220]);
  lib.circle(buf, u(36), u(152), u(2), [235, 240, 252, 170]);
  // 枝（暗色细杆横穿月亮下缘）
  lib.roundRect(buf, u(56), u(148), u(216), u(154), u(3), [12, 18, 34, 255]);
  // 鸟剪影（完全在月亮范围内）
  const SIL = [15, 21, 40, 255];
  lib.circle(buf, u(146), u(124), u(22), SIL);          // 身体
  lib.circle(buf, u(166), u(102), u(14), SIL);          // 头
  lib.triangle(buf, u(118), u(114), u(104), u(126), u(122), u(132), SIL);   // 尾
  lib.triangle(buf, u(178), u(98), u(188), u(102), u(178), u(106), SIL);    // 喙
  // 腿（与枝相连）
  lib.roundRect(buf, u(140), u(142), u(146), u(150), u(2), SIL);
  lib.roundRect(buf, u(154), u(142), u(160), u(150), u(2), SIL);
}

// ========== v2-2 日轮小鸟（Sunrise）==========
// 奶油底 + 橙红大日轮 + 极简鸟剪影 —— 日式海报风
function sunrise(buf) {
  lib.gradientRoundRect(buf, u(6), u(6), u(250), u(250), u(54), [246, 240, 229], [236, 226, 209]);
  // 日轮（同心三层，中上部）
  lib.circle(buf, u(128), u(94), u(52), [240, 122, 92, 255]);
  lib.circle(buf, u(128), u(94), u(40), [233, 92, 66, 255]);
  lib.circle(buf, u(128), u(94), u(28), [224, 70, 48, 255]);
  // 地平线（深炭细杆，贴日轮下缘）
  lib.roundRect(buf, u(40), u(148), u(216), u(153), u(2.5), [42, 38, 36, 255]);
  // 鸟剪影停在线上
  const SIL = [42, 38, 36, 255];
  lib.circle(buf, u(126), u(130), u(15), SIL);
  lib.circle(buf, u(142), u(114), u(10), SIL);
  lib.triangle(buf, u(108), u(122), u(80), u(138), u(106), u(138), SIL);
  lib.triangle(buf, u(149), u(110), u(158), u(114), u(149), u(118), SIL);
  // 腿
  lib.roundRect(buf, u(120), u(141), u(126), u(149), u(2), SIL);
  lib.roundRect(buf, u(130), u(141), u(136), u(149), u(2), SIL);
  // 远处海鸥
  lib.triangle(buf, u(54), u(70), u(64), u(63), u(68), u(70), [90, 82, 76, 200]);
  lib.triangle(buf, u(68), u(70), u(72), u(63), u(82), u(70), [90, 82, 76, 200]);
}

// ========== v2-3 墨绿线鸟（Botanical）==========
// 深墨绿底 + 白色几何鸟停在细枝，右上两片叶
function botanical(buf) {
  lib.gradientRoundRect(buf, u(6), u(6), u(250), u(250), u(54), [30, 59, 47], [20, 42, 34]);
  const W = [244, 242, 234, 255];
  // 细枝
  lib.roundRect(buf, u(52), u(152), u(212), u(158), u(3), W);
  // 鸟：身体 + 头 + 尾 + 喙（几何白）
  lib.circle(buf, u(126), u(118), u(30), W);
  lib.circle(buf, u(152), u(94), u(18), W);
  lib.triangle(buf, u(100), u(130), u(64), u(152), u(108), u(148), W);
  lib.triangle(buf, u(168), u(88), u(186), u(94), u(168), u(102), [255, 176, 92, 255]);   // 喙用暖橙点缀
  // 眼（底色小点）
  lib.circle(buf, u(155), u(92), u(3.4), [30, 59, 47, 255]);
  // 枝上两片叶（椭圆感：两段圆叠）
  lib.triangle(buf, u(196), u(140), u(224), u(120), u(206), u(148), W);
  lib.triangle(buf, u(206), u(120), u(232), u(106), u(214), u(132), W);
  // 星尘
  lib.circle(buf, u(56), u(64), u(2), W);
  lib.circle(buf, u(210), u(56), u(1.6), W);
}

// ========== v2-4 暗色哑铃（Iron）==========
// 炭黑底 + 暖橙渐变哑铃 + 高光弧 —— 运动品牌风
function iron(buf) {
  lib.gradientRoundRect(buf, u(6), u(6), u(250), u(250), u(54), [36, 36, 40], [24, 24, 27]);
  const ORANGE = [255, 138, 61, 255], ORANGE_D = [232, 96, 42, 255];
  const cx = 130, cy = 130, angle = -Math.PI / 4;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // 杆
  lib.rotatedRect(buf, u(cx), u(cy), u(62), u(9), angle, ORANGE);
  // 配重（双盘：外盘深橙 + 内盘亮橙）
  for (const sign of [-1, 1]) {
    const px = cx + cos * 48 * sign, py = cy + sin * 48 * sign;
    lib.circle(buf, u(px), u(py), u(28), ORANGE_D);
    lib.circle(buf, u(px - cos * 7 * sign), u(py - sin * 7 * sign), u(21), ORANGE);
  }
  // 底部三个小点（节奏感）
  lib.circle(buf, u(112), u(206), u(3.2), [255, 138, 61, 150]);
  lib.circle(buf, u(130), u(206), u(3.2), [255, 138, 61, 220]);
  lib.circle(buf, u(148), u(206), u(3.2), [255, 138, 61, 150]);
}

const candidates = [
  { file: 'v2-1-nocturne.png', name: '夜色栖鸟', draw: nocturne },
  { file: 'v2-2-sunrise.png', name: '日轮小鸟', draw: sunrise },
  { file: 'v2-3-botanical.png', name: '墨绿线鸟', draw: botanical },
  { file: 'v2-4-iron.png', name: '暗色哑铃', draw: iron },
];

for (const c of candidates) {
  const buf = lib.createCanvas();
  c.draw(buf);
  const png = lib.downscale(buf, 256);
  fs.writeFileSync(path.join(OUT_DIR, c.file), png);
  console.log('已生成', path.join(OUT_DIR, c.file), `（${c.name}）`);
  if (SHOW_PREVIEW) {
    console.log(`---- ${c.name} ----`);
    console.log(lib.asciiPreview(png));
  }
}
console.log('\nv2 候选已生成到 icon-candidates/');
