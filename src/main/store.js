// JSON 持久化：原子写入（临时文件 + rename）
const fs = require('fs');
const path = require('path');

// 递归补齐缺失的默认值（已有值优先，保证升级后新增的配置项自动获得默认值）
function fillDefaults(target, defaults) {
  const out = { ...target };
  for (const [k, v] of Object.entries(defaults)) {
    const cur = out[k];
    if (cur === undefined || cur === null) {
      out[k] = v && typeof v === 'object' && !Array.isArray(v) ? fillDefaults({}, v) : v;
    } else if (v && typeof v === 'object' && !Array.isArray(v) && typeof cur === 'object' && !Array.isArray(cur)) {
      out[k] = fillDefaults(cur, v);
    }
  }
  return out;
}

class Store {
  constructor(dir, name, defaults) {
    this.file = path.join(dir, name);
    this.defaults = defaults;
    this.data = null;
  }

  load() {
    try {
      const text = fs.readFileSync(this.file, 'utf8');
      this.data = JSON.parse(text);
    } catch {
      this.data = null;
    }
    const defaults = typeof this.defaults === 'function' ? this.defaults() : this.defaults;
    if (!this.data || typeof this.data !== 'object') {
      this.data = JSON.parse(JSON.stringify(defaults));
      this.save();
      return this.data;
    }
    // 旧版本创建的配置文件缺少后来新增的键：补齐并落盘，避免读取端各自兜底
    const filled = fillDefaults(this.data, defaults);
    if (JSON.stringify(filled) !== JSON.stringify(this.data)) {
      this.data = filled;
      this.save();
    }
    return this.data;
  }

  get() {
    if (this.data === null) this.load();
    return this.data;
  }

  update(patch) {
    if (this.data === null) this.load();
    Object.assign(this.data, patch);
    this.save();
    return this.data;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
