// 从用户的「洛茜」皮肤源目录生成内置 Live2D 资源包 luoxi
// （经典白猫 PNG 包已按需求移除；历史版本可用 git 或备份找回）
// 用法: node scripts/build-preset-pack.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const L2D_SRC = path.join(ROOT, '模型', '洛茜桌宠【无表情】', '洛茜桌宠【请看下面的说明，使用Word打开】', 'img', 'gamepad', 'cat_model');
const DEST = path.join(ROOT, 'assets', 'packs', 'luoxi');

const AUTHOR = '皮肤：优恩Moral / 程序：@MMmmmoko_想要画得好看-（仅限个人使用，禁止商用）';

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.cpSync(L2D_SRC, path.join(DEST, 'cat_model'), { recursive: true });
fs.writeFileSync(
  path.join(DEST, 'manifest.json'),
  JSON.stringify(
    {
      format: 1,
      type: 'live2d',
      driveBreath: true,
      name: '洛茜',
      author: AUTHOR,
      version: '2.0.0',
      canvas: { width: 612, height: 354 },
      model: 'cat_model/cat.model3.json',
      params: {
        handLeftDown: 'CatParamLeftHandDown',
        handRightDown: 'CatParamRightHandDown',
      },
      remindParams: {
        ParamEyeLSmile: 1,
        ParamEyeRSmile: 1,
        ParamMouthOpen: 0.7,
      },
      idle: { minInterval: 2500, maxInterval: 6000, pressMs: 260 },
    },
    null,
    2
  )
);
console.log('已生成 Live2D 包:', DEST);
