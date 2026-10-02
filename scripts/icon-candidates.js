// 生成 4 个图标候选到 icon-candidates/（供用户挑选）
// 用法: node scripts/icon-candidates.js [--preview]
const fs = require('fs');
const path = require('path');
const lib = require('./icon-lib');

const OUT_DIR = path.join(__dirname, '..', 'icon-candidates');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SHOW_PREVIEW = process.argv.includes('--preview');
const BG_TOP = [255, 178, 200], BG_BOTTOM = [229, 102, 146];
const PAD = 6, RADIUS = 54;
const WHITE = [255, 255, 255, 255];

// 公共背景：粉色渐变圆角方块
function background(buf) {
  lib.gradientRoundRect(buf, lib.u(PAD), lib.u(PAD), lib.u(256 - PAD), lib.u(256 - PAD), lib.u(RADIUS), BG_TOP, BG_BOTTOM);
}

// ---------- 候选 1：哑铃 ----------
function drawDumbbell(buf) {
  background(buf);
  const WHITE2 = [255, 255, 255, 255];
  // 45° 斜置：杆从左下到右上
  const cx = 128, cy = 128, angle = -Math.PI / 4;
  const len = 62, thick = 9;                 // 杆半长/半厚
  const plateOff = 44, plateR = 24;          // 配重中心偏移/半径
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // 杆
  lib.rotatedRect(buf, lib.u(cx), lib.u(cy), lib.u(len), lib.u(thick), angle, WHITE2);
  // 配重：杆两端的圆（垂直于杆的方向再外扩一点点做双盘效果）
  for (const sign of [-1, 1]) {
    const px = cx + cos * plateOff * sign, py = cy + sin * plateOff * sign;
    lib.circle(buf, lib.u(px), lib.u(py), lib.u(plateR), WHITE2);
  }
  // 高光点
  lib.circle(buf, lib.u(84), lib.u(66), lib.u(7), [255, 225, 235, 230]);
}

// ---------- 候选 2：精修小鸟 ----------
function drawBird(buf) {
  // 底部投影（半透明深粉椭圆 → 用扁圆模拟）
  lib.circle(buf, lib.u(134), lib.u(206), lib.u(52), [150, 40, 80, 70]);
  lib.circle(buf, lib.u(134), lib.u(202), lib.u(46), [170, 50, 95, 60]);

  // 尾巴（斜向左下）
  lib.triangle(buf, lib.u(104), lib.u(140), lib.u(52), lib.u(176), lib.u(112), lib.u(170), WHITE);

  // 身体（大圆）
  lib.circle(buf, lib.u(136), lib.u(126), lib.u(58), WHITE);
  // 肚子（浅暖白，下前方）
  lib.circle(buf, lib.u(150), lib.u(146), lib.u(34), [244, 240, 236, 255]);

  // 翅膀（浅灰粉，身体中后部，用两层圆做羽毛层次）
  lib.circle(buf, lib.u(112), lib.u(120), lib.u(26), [226, 218, 214, 255]);
  lib.circle(buf, lib.u(106), lib.u(128), lib.u(18), [214, 204, 199, 255]);

  // 喙（橙黄，两层三角）
  lib.triangle(buf, lib.u(178), lib.u(108), lib.u(206), lib.u(120), lib.u(178), lib.u(134), [245, 166, 35, 255]);
  lib.triangle(buf, lib.u(178), lib.u(122), lib.u(196), lib.u(129), lib.u(178), lib.u(134), [225, 140, 20, 255]);

  // 眼睛（深色 + 白高光）
  lib.circle(buf, lib.u(158), lib.u(104), lib.u(8), [40, 36, 38, 255]);
  lib.circle(buf, lib.u(161), lib.u(101), lib.u(2.6), [255, 255, 255, 255]);

  // 腮红
  lib.circle(buf, lib.u(172), lib.u(124), lib.u(9), [250, 170, 180, 180]);

  // 顶部呆毛（两根小三角）
  lib.triangle(buf, lib.u(128), lib.u(74), lib.u(136), lib.u(58), lib.u(142), lib.u(74), WHITE);
  lib.triangle(buf, lib.u(142), lib.u(74), lib.u(150), lib.u(62), lib.u(152), lib.u(78), WHITE);

  // 腿：身体与横杆之间
  lib.roundRect(buf, lib.u(120), lib.u(168), lib.u(130), lib.u(184), lib.u(5), WHITE);
  lib.roundRect(buf, lib.u(146), lib.u(168), lib.u(156), lib.u(184), lib.u(5), WHITE);

  // 横杆
  lib.roundRect(buf, lib.u(40), lib.u(180), lib.u(216), lib.u(192), lib.u(7), WHITE);

}

// ---------- 候选 3：字母 P 徽标 ----------
function drawP(buf) {
  background(buf);
  const cx = 118, cyTop = 64, stemW = 30, stemH = 132, bowlR = 44, bowlThick = 26;
  // 竖笔
  lib.roundRect(buf, lib.u(cx - stemW / 2), lib.u(cyTop), lib.u(cx + stemW / 2), lib.u(cyTop + stemH), lib.u(12), WHITE);
  // 碗形：沿上半圆打点画粗弧（外半径 bowlR，厚 bowlThick）
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / steps;   // -90° → +90°（右半圆）
    const px = cx + stemW / 2 - 2 + Math.cos(a) * bowlR * 0.92;
    const py = cyTop + bowlR * 0.92 + Math.sin(a) * bowlR * 0.92;
    lib.circle(buf, lib.u(px), lib.u(py), lib.u(bowlThick / 2 + 1), WHITE);
  }
  // 高光小点
  lib.circle(buf, lib.u(78), lib.u(52), lib.u(6), [255, 222, 234, 220]);
}

// ---------- 候选 4：爪印 ----------
function drawPaw(buf) {
  background(buf);
  // 四趾（上扇形排列，间距拉开）
  lib.circle(buf, lib.u(64), lib.u(86), lib.u(17), WHITE);
  lib.circle(buf, lib.u(110), lib.u(64), lib.u(18), WHITE);
  lib.circle(buf, lib.u(160), lib.u(66), lib.u(18), WHITE);
  lib.circle(buf, lib.u(206), lib.u(94), lib.u(16), WHITE);
  // 大肉垫：三圆叠合成垫（与趾留出间隙）
  lib.circle(buf, lib.u(104), lib.u(160), lib.u(28), WHITE);
  lib.circle(buf, lib.u(152), lib.u(160), lib.u(28), WHITE);
  lib.circle(buf, lib.u(128), lib.u(176), lib.u(32), WHITE);
  // 高光
  lib.circle(buf, lib.u(90), lib.u(78), lib.u(5), [255, 222, 234, 200]);
}

const candidates = [
  { file: 'candidate-1-dumbbell.png', draw: drawDumbbell },
  { file: 'candidate-2-bird.png', draw: drawBird },
  { file: 'candidate-3-p.png', draw: drawP },
  { file: 'candidate-4-paw.png', draw: drawPaw },
];

for (const c of candidates) {
  const buf = lib.createCanvas();
  c.draw(buf);
  const png = lib.downscale(buf, 256);
  fs.writeFileSync(path.join(OUT_DIR, c.file), png);
  console.log('已生成', path.join(OUT_DIR, c.file));
  if (SHOW_PREVIEW) {
    console.log(`---- ${c.file} ----`);
    console.log(lib.asciiPreview(png));
  }
}
console.log('\n候选已生成到 icon-candidates/，预览后告诉我用哪个（1-4）');
