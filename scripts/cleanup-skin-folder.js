// 清理角色皮肤文件夹：保留 standard/cat_model（完整模型）+ 使用声明.txt，其余删除并追加记录
// 用法: node scripts/cleanup-skin-folder.js <文件夹名...>
const fs = require('fs');
const path = require('path');

const ROOT = '模型';

for (const folder of process.argv.slice(2)) {
  const base = path.join(ROOT, folder);
  if (!fs.existsSync(base)) { console.log('跳过（不存在）:', folder); continue; }

  // 找到 A-xxx 子目录（或目录本身）下的 standard/cat_model
  const keep = [];
  const del = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (/img\/standard\/cat_model$/.test(p)) { keep.push(p); continue; } // 保留完整模型目录（不下探）
        walk(p);
      } else {
        if (/使用声明\.txt$/.test(p) || /config\.json$/.test(p)) keep.push(p); // 声明 + 模型校准配置（导入器使用）
        else del.push(p);
      }
    }
  })(base);

  console.log(`[${folder}] 保留 ${keep.length} 个，删除 ${del.length} 个`);
  for (const p of del) fs.rmSync(p);
  (function prune(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { prune(p); if (fs.readdirSync(p).length === 0) fs.rmdirSync(p); }
    }
  })(base);

  // 追加记录
  const groups = new Map();
  for (const p of del) {
    const rel = p.slice(base.length + 1);
    const parts = rel.split('/');
    const key = parts.length <= 1 ? '(根目录)' : parts.slice(0, Math.min(2, parts.length)).join('/');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rel);
  }
  let md = `\n\n---\n\n# ${folder} 清理记录\n\n清理时间：${new Date().toLocaleString('zh-CN')}；删除 ${del.length} 个文件，保留 ${keep.length} 个\n\n## 保留\n\n${keep.map((k) => '- ' + k).join('\n')}\n\n> 保留的 standard/cat_model 为完整人物模型（已导入应用，水印贴图已擦除）。\n\n## 已删除（无关资源：Mver 程序/白猫兜底素材/辅助小模型/按键变体）\n`;
  for (const [key, files] of groups) {
    md += `\n### ${key}（${files.length} 个）\n`;
    for (const f of files) md += `- ${f}\n`;
  }
  fs.appendFileSync(path.join(ROOT, '清理记录.md'), md);
  console.log('记录已追加');
}
