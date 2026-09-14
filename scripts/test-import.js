// 验证皮肤导入：直接调用 PackManager.installFromPath，不启动 GUI
// 用法: node scripts/test-import.js <皮肤文件夹或zip路径>
const path = require('path');
const fs = require('fs');
const { PackManager } = require('../src/main/packs');

const target = process.argv[2] || path.join('模型', '守岸人-无表情版', 'A-守岸人');
const sandboxUser = path.join(__dirname, '..', 'build-tests', 'user-packs');
fs.rmSync(sandboxUser, { recursive: true, force: true });

const pm = new PackManager(path.join(__dirname, '..', 'assets', 'packs'), sandboxUser);
const r = pm.installFromPath(target);

console.log('=== 导入结果 ===');
console.log(JSON.stringify(r, null, 2));

if (r.ok) {
  const dest = path.join(sandboxUser, r.id);
  console.log('\n=== 安装内容 ===');
  const list = [];
  (function walk(d, prefix) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { console.log(prefix + e.name + '/'); walk(p, prefix + '  '); }
      else list.push([prefix + e.name, fs.statSync(p).size]);
    }
  })(dest, '');
  for (const [f, s] of list) console.log(String(s).padStart(10), f);

  const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
  console.log('\n=== 校验 ===');
  const errs = pm.validateManifest(manifest, dest);
  console.log('manifest 校验:', errs.length ? '失败 ' + errs.join('；') : '通过');
  console.log('resolveFile 模型文件:', pm.resolveFile(r.id, manifest.model) ? 'OK' : '失败');
  const total = list.reduce((a, [, s]) => a + s, 0);
  console.log('包体积:', (total / 1024 / 1024).toFixed(1) + 'MB');
}
