// 资源包管理：内置包 + 用户安装包（文件夹 / zip / Bongo Cat Mver 皮肤自动识别）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

class PackManager {
  constructor(builtinDir, userDir) {
    this.builtinDir = builtinDir;
    this.userDir = userDir;
    fs.mkdirSync(this.userDir, { recursive: true });
  }

  packDir(packId) {
    const user = path.join(this.userDir, packId);
    if (fs.existsSync(path.join(user, 'manifest.json'))) return user;
    return path.join(this.builtinDir, packId);
  }

  // 读取 PNG 尺寸（解析 IHDR）
  readPngSize(file) {
    const buf = fs.readFileSync(file);
    if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null; // 'IHDR'
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  validateManifest(manifest, dir) {
    const errors = [];
    if (manifest.format !== 1) errors.push(`format 必须为 1（当前：${manifest.format}）`);
    if (!manifest.name || typeof manifest.name !== 'string') errors.push('缺少 name（资源包名称）');
    if (!manifest.canvas || !Number.isInteger(manifest.canvas.width) || !Number.isInteger(manifest.canvas.height)) {
      errors.push('缺少 canvas: { width, height }');
    }
    const need = (rel, label) => {
      if (!rel) { errors.push(`缺少 ${label}`); return; }
      if (!fs.existsSync(path.join(dir, rel))) errors.push(`文件不存在：${rel}`);
    };
    if (manifest.type === 'live2d') {
      need(manifest.model, 'model（cat.model3.json）');
      return errors;
    }
    need(manifest.body, 'body（猫身体图片）');
    if (Array.isArray(manifest.faces)) manifest.faces.forEach((f, i) => need(f && f.file, `faces[${i}].file`));
    for (const side of ['handLeft', 'handRight']) {
      const h = manifest[side];
      if (!h) continue;
      need(h.up, `${side}.up`);
      (h.down || []).forEach((f, i) => need(f, `${side}.down[${i}]`));
    }
    return errors;
  }

  loadPack(packId) {
    const dir = this.packDir(packId);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const errors = this.validateManifest(manifest, dir);
      return { manifest, dir, errors };
    } catch (e) {
      return { manifest: null, dir, errors: ['manifest.json 读取失败：' + e.message] };
    }
  }

  listPacks() {
    const out = [];
    for (const [rootId, root, isBuiltin] of [
      [null, this.builtinDir, true],
      [null, this.userDir, false],
    ]) {
      let entries = [];
      try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const dir = path.join(root, e.name);
        if (!fs.existsSync(path.join(dir, 'manifest.json'))) continue;
        const { manifest, errors } = this.loadPack(e.name);
        if (!manifest) continue;
        out.push({
          id: e.name,
          name: manifest.name,
          author: manifest.author || '',
          version: manifest.version || '1.0.0',
          type: manifest.type === 'live2d' ? 'live2d' : 'png',
          isBuiltin,
          errors,
          canvas: manifest.canvas,
          faceCount: Array.isArray(manifest.faces) ? manifest.faces.length : 0,
        });
      }
    }
    return out;
  }

  _sanitizeId(name) {
    let id = String(name || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    // 中文名等无法 ASCII 化（或净化后过短/纯数字，如 "2"）时，用名称哈希生成稳定 id，
    // 保证同一个皮肤重复导入时走覆盖更新而不是堆积
    if (!id || id.length < 3 || /^[0-9-]+$/.test(id)) {
      id = 'skin-' + crypto.createHash('md5').update(String(name || '')).digest('hex').slice(0, 8);
    }
    // 避免遮蔽内置包
    if (fs.existsSync(path.join(this.builtinDir, id, 'manifest.json'))) id += '-custom';
    return id;
  }

  // 从文件夹或 zip 安装。返回 { ok, id, name, warnings } 或 { ok:false, errors }
  installFromPath(srcPath) {
    let root = null;       // 解析出的包根目录
    const warnings = [];
    let tmpDir = null;

    try {
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        root = srcPath;
      } else if (/\.zip$/i.test(srcPath)) {
        tmpDir = path.join(this.userDir, '.tmp-' + crypto.randomBytes(4).toString('hex'));
        const zip = new AdmZip(srcPath);
        zip.extractAllTo(tmpDir, true);
        root = tmpDir;
      } else {
        return { ok: false, errors: ['仅支持文件夹或 .zip 文件'] };
      }

      // 1) 标准 manifest.json
      let conv = null;
      let detected = null;
      if (fs.existsSync(path.join(root, 'manifest.json'))) {
        conv = { dir: root, manifest: JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')) };
      } else {
        // 2) 自动探测 Bongo Cat 皮肤结构
        detected = this._detectMver(root);
        if (!detected) {
          return { ok: false, errors: ['未找到 manifest.json，也未识别出 Bongo Cat 皮肤结构（需要 cat_model/cat.model3.json 或 cat.png + lefthand/righthand 图层）'] };
        }
        detected.mverConfig = this._findMverConfig(detected.dir);
        conv = this._convertMver(detected, srcPath);
        warnings.push(detected.style === 'live2d' ? '已识别为 Live2D 皮肤（取完整版模型）' : '已按 Bongo Cat Mver 分层 PNG 结构自动转换');
      }

      const { dir, manifest, validateDir } = conv;
      const errors = this.validateManifest(manifest, validateDir || dir);
      if (errors.length) return { ok: false, errors };

      const id = manifest.id && /^[a-z0-9-]+$/.test(manifest.id) ? manifest.id : this._sanitizeId(manifest.name || path.basename(srcPath));
      const dest = path.join(this.userDir, id);
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (detected && detected.style === 'live2d') {
        // Live2D 包只保留 cat_model 目录
        fs.cpSync(dir, path.join(dest, 'cat_model'), { recursive: true });
      } else {
        fs.cpSync(dir, dest, { recursive: true });
      }
      delete manifest.id;
      manifest.version = manifest.version || '1.0.0';
      fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
      return { ok: true, id, name: manifest.name, warnings };
    } catch (e) {
      return { ok: false, errors: ['安装失败：' + e.message] };
    } finally {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 在目录树中（最多 4 层）探测皮肤结构。
  // 社区皮肤包的真实模型是 Live2D cat_model/（cat.png 白猫只是 Mver 程序的默认兜底素材），
  // 因此只要存在 cat_model/cat.model3.json 就优先走 Live2D 导入，多个候选取 moc3 最大的完整版。
  _detectMver(root) {
    const live2dCandidates = []; // cat_model 目录
    const pngCandidates = [];    // 含 cat.png 的目录
    const walk = (dir, depth) => {
      if (depth > 4) return;
      const modelDescriptor = path.join(dir, 'cat_model', 'cat.model3.json');
      if (fs.existsSync(modelDescriptor)) {
        live2dCandidates.push({ dir: path.join(dir, 'cat_model'), moc3Size: this._moc3Size(modelDescriptor) });
        return; // cat_model 内部不再下探
      }
      if (fs.existsSync(path.join(dir, 'cat.png'))) pngCandidates.push(dir);
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
    };
    walk(root, 0);

    if (live2dCandidates.length) {
      live2dCandidates.sort((a, b) => b.moc3Size - a.moc3Size);
      const best = live2dCandidates[0].dir;
      return { dir: best, style: 'live2d' };
    }
    if (!pngCandidates.length) return null;
    const keyboardStyle = pngCandidates.find((d) => fs.existsSync(path.join(d, 'lefthand')) || fs.existsSync(path.join(d, 'righthand')));
    return { dir: keyboardStyle || pngCandidates[0], style: keyboardStyle ? 'keyboard' : 'standard' };
  }

  // 从 model3.json 解析 moc3 的实际大小（字节）；解析失败返回 0
  _moc3Size(modelDescriptorPath) {
    try {
      const desc = JSON.parse(fs.readFileSync(modelDescriptorPath, 'utf8'));
      const moc = desc.FileReferences && desc.FileReferences.Moc;
      if (!moc) return 0;
      return fs.statSync(path.join(path.dirname(modelDescriptorPath), moc)).size;
    } catch {
      return 0;
    }
  }

  // 向上查找 Mver config.json，提取模型校准信息（l2d_correct/offset/flip）
  _findMverConfig(catModelDir) {
    let d = path.dirname(catModelDir);
    for (let i = 0; i < 4; i++, d = path.dirname(d)) {
      const cfgPath = path.join(d, 'config.json');
      if (!fs.existsSync(cfgPath)) continue;
      try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        const modeDir = path.basename(path.dirname(catModelDir)); // standard/keyboard/gamepad
        const dec = cfg.decoration || {};
        if (dec.l2d_correct === undefined && !dec.l2d_offset && dec.l2d_horizontal_flip === undefined) return null;
        return {
          mode: modeDir,
          correct: dec.l2d_correct ?? null,
          offsetX: Array.isArray(dec.l2d_offset) ? (dec.l2d_offset[0] ?? null) : null,
          offsetY: Array.isArray(dec.l2d_offset) ? (dec.l2d_offset[1] ?? null) : null,
          flip: !!dec.l2d_horizontal_flip,
        };
      } catch { return null; }
    }
    return null;
  }

  // 皮肤显示名：文件夹名去掉括号符号与“-无表情版”等后缀
  _skinName(srcPath) {
    return String(path.basename(srcPath))
      .replace(/[\s]*[（(]\d+[)）]\s*$/, '')   // 去掉 " (2)" / "（2）" 之类的副本后缀
      .replace(/[【】\[\]()（）]/g, '')          // 去掉名称里的括号符号
      .replace(/[-_\s]*无表情版?$/, '')          // 去掉 "无表情版" / "无表情" 后缀
      .replace(/^A-/, '')                          // 去掉角色编号前缀
      .trim() || '导入的皮肤';
  }

  // Mver 皮肤 → 本应用资源包结构。found: { dir, style }
  _convertMver(found, srcPath) {
    if (found.style === 'live2d') return this._convertLive2d(found.dir, srcPath, found.mverConfig);
    return this._convertPngLayers(found.dir, found.style, srcPath);
  }

  // Live2D 皮肤：拷贝整个 cat_model，manifest 指向其中描述文件
  _convertLive2d(catModelDir, srcPath, mverConfig) {
    const ids = this._cdiParamIds(catModelDir);
    const manifest = {
      format: 1,
      type: 'live2d',
      name: this._skinName(srcPath),
      author: '',
      version: '1.0.0',
      canvas: { width: 612, height: 354 },
      model: 'cat_model/cat.model3.json',
      // 手部按下参数：只写模型真实存在的（多数社区皮肤没有右手参数）
      params: this._inferPawParams(ids),
      remindParams: this._inferRemindParams(catModelDir, ids),
      // 装饰开关默认打开（猫耳等）+ 水印默认隐藏
      defaultParams: this._inferDefaultParams(catModelDir, ids),
      idle: { minInterval: 2500, maxInterval: 6000, pressMs: 260 },
    };
    if (mverConfig) manifest.mverConfig = mverConfig;
    return { dir: catModelDir, manifest, validateDir: path.dirname(catModelDir) };
  }

  // 读取 cdi3 的全部参数 Id（读不到返回空数组）
  _cdiParamIds(catModelDir) {
    try {
      const desc = JSON.parse(fs.readFileSync(path.join(catModelDir, 'cat.model3.json'), 'utf8'));
      const cdiRel = desc.FileReferences && desc.FileReferences.DisplayInfo;
      if (!cdiRel) return [];
      const info = JSON.parse(fs.readFileSync(path.join(catModelDir, cdiRel), 'utf8'));
      return (info.Parameters || []).map((p) => p.Id);
    } catch {
      return [];
    }
  }

  // 手部按下参数：仅当模型确实声明了对应参数时才写入（否则桌宠会往不存在的参数写值）
  _inferPawParams(ids) {
    const out = {};
    if (ids.includes('CatParamLeftHandDown')) out.handLeftDown = 'CatParamLeftHandDown';
    if (ids.includes('CatParamRightHandDown')) out.handRightDown = 'CatParamRightHandDown';
    return out;
  }

  // 从 cdi3 推断提醒时可用的表情参数（眼睛眯起 + 张嘴），没有就用空集
  _inferRemindParams(catModelDir, ids) {
    const remind = {};
    const list = ids && ids.length ? ids : this._cdiParamIds(catModelDir);
    if (!list.length) return remind;
    if (list.includes('ParamEyeLSmile') && list.includes('ParamEyeRSmile')) {
      remind.ParamEyeLSmile = 1;
      remind.ParamEyeRSmile = 1;
    }
    const mouth = list.includes('ParamMouthOpenY') ? 'ParamMouthOpenY' : list.includes('ParamMouthOpen') ? 'ParamMouthOpen' : null;
    if (mouth) remind[mouth] = 0.7;
    return remind;
  }

  // 从 cdi3 推断默认参数：装饰开关（猫耳等）置 1；水印置 0（默认不显示水印）
  _inferDefaultParams(catModelDir, ids) {
    const out = {};
    try {
      const desc = JSON.parse(fs.readFileSync(path.join(catModelDir, 'cat.model3.json'), 'utf8'));
      const cdiRel = desc.FileReferences && desc.FileReferences.DisplayInfo;
      if (!cdiRel) return out;
      const cdi = JSON.parse(fs.readFileSync(path.join(catModelDir, cdiRel), 'utf8'));
      for (const p of cdi.Parameters || []) {
        const name = p.Name || '';
        if (/水印|watermark/i.test(name)) out[p.Id] = 0;        // 默认隐藏水印
        else if (/猫(?:咪)?耳/.test(name)) out[p.Id] = 1;        // 猫耳等装饰默认打开
      }
    } catch { /* cdi 缺失时静默降级 */ }
    return out;
  }

  // 分层 PNG 皮肤：keyboard 风格（lefthand/righthand 独立手帧）或 standard 风格（仅身体）
  _convertPngLayers(dir, style, srcPath) {
    const manifest = {
      format: 1,
      name: this._skinName(srcPath),
      author: '',
      version: '1.0.0',
      canvas: { width: 612, height: 354 },
      defaultFace: 0,
      idle: { minInterval: 2500, maxInterval: 6000, pressMs: 240 },
    };
    const rel = (p) => path.relative(dir, p).replace(/\\/g, '/');
    const canvasOf = (p) => this.readPngSize(p);
    const bodySize = canvasOf(path.join(dir, 'cat.png')) || { width: 612, height: 354 };
    manifest.canvas = bodySize;
    manifest.body = rel(path.join(dir, 'cat.png'));
    if (fs.existsSync(path.join(dir, 'bg.png'))) manifest.bg = rel(path.join(dir, 'bg.png'));

    if (style === 'keyboard') {
      const faceDir = path.join(dir, 'face');
      if (fs.existsSync(faceDir)) {
        const faces = fs.readdirSync(faceDir).filter((f) => /\.png$/i.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
        manifest.faces = faces.map((f, i) => ({ file: rel(path.join(faceDir, f)), name: `表情${i}` }));
      }
      for (const [side, folder, upName] of [['handLeft', 'lefthand', 'leftup'], ['handRight', 'righthand', 'rightup']]) {
        const d = path.join(dir, folder);
        if (!fs.existsSync(d)) continue;
        const frames = fs.readdirSync(d).filter((f) => /\.png$/i.test(f) && !f.startsWith(upName)).sort((a, b) => parseInt(a) - parseInt(b));
        const upFile = fs.existsSync(path.join(d, upName + '.png')) ? rel(path.join(d, upName + '.png')) : (frames[0] ? rel(path.join(d, frames[0])) : null);
        manifest[side] = { up: upFile, down: frames.map((f) => rel(path.join(d, f))) };
      }
    }
    return { dir, manifest };
  }

  deletePack(packId) {
    const dir = path.join(this.userDir, packId);
    if (!fs.existsSync(path.join(dir, 'manifest.json'))) return { ok: false, error: '内置资源包或不存在，无法删除' };
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true };
  }

  // 提取 Live2D 包的可自定义参数（按分组通用规则，适配任意皮肤）：
  // 排除 按键/物理 分组和机械命名参数，保留作者标注中文名的可调项
  listCustomParams(packId) {
    const { manifest, dir } = this.loadPack(packId);
    if (!manifest || manifest.type !== 'live2d') return [];
    try {
      const modelPath = path.join(dir, manifest.model);
      const desc = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      const refs = desc.FileReferences || {};
      const cdiRel = refs.DisplayInfo;
      if (!cdiRel) return [];
      const cdi = JSON.parse(fs.readFileSync(path.join(path.dirname(modelPath), cdiRel), 'utf8'));
      const groupNames = {};
      for (const g of cdi.ParameterGroups || []) groupNames[g.Id] = g.Name || '';
      const EXCLUDE_ID = /^(ParamBreath|ParamAngle|ParamEye|ParamMouth|ParamMouse|ParamBrow|ParamHair|ParamEar|ParamEyeBall|CatParam)/;
      const EXCLUDE_NAME = /(-?[XY][12]?|晃动|摆动|拉伸|轨迹|扇翅)$/;
      const EXCLUDE_NAME_CN = /^(右眼|左眼|眼珠|嘴巴|角度|腮红|眉毛| blush)/;
      const CJK = /[一-鿿]/;
      const meta = this.loadParamMeta(packId);
      return (cdi.Parameters || [])
        .filter((p) => {
          const name = p.Name || '';
          if (/水印|watermark/i.test(name)) return false;          // 水印不开放自定义（默认已隐藏）
          if (!CJK.test(name)) return false;                       // 只保留作者标注中文名的参数
          const gname = groupNames[p.GroupId] || '';
          if (/按键|物理/.test(gname)) return false;               // 排除按键驱动组与物理组
          if (EXCLUDE_ID.test(p.Id) || EXCLUDE_NAME.test(name) || EXCLUDE_NAME_CN.test(name)) return false;
          if (/头发|胸部|heartbeat/i.test(name)) return false;
          return true;
        })
        .map((p) => {
          const m = meta[p.Id] || {};
          return {
            id: p.Id,
            name: p.Name,
            min: typeof m.min === 'number' ? m.min : 0,
            max: typeof m.max === 'number' ? m.max : 1,
            default: typeof m.default === 'number' ? m.default : 0,
          };
        });
    } catch {
      return [];
    }
  }

  // ---- 参数元数据缓存（由渲染层加载模型后上报真实 min/max/默认值）----
  paramMetaFile() {
    return path.join(this.userDir, 'param-meta.json');
  }

  loadParamMeta(packId) {
    try {
      const all = JSON.parse(fs.readFileSync(this.paramMetaFile(), 'utf8'));
      return (packId && all[packId]) || {};
    } catch {
      return {};
    }
  }

  saveParamMeta(packId, meta) {
    if (!packId || !meta || typeof meta !== 'object') return;
    let all = {};
    try { all = JSON.parse(fs.readFileSync(this.paramMetaFile(), 'utf8')) || {}; } catch { all = {}; }
    all[packId] = meta;
    try {
      const tmp = this.paramMetaFile() + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(all, null, 2), 'utf8');
      fs.renameSync(tmp, this.paramMetaFile());
    } catch { /* 写入失败不影响主流程 */ }
  }

  // ---- 已安装包的启动迁移 ----
  // 早期导入的包缺少两项新逻辑：① 水印默认隐藏 ② 手部参数只保留模型真实存在的。
  // 这里就地补全，用户无需重新导入。
  migratePacks() {
    const roots = [this.builtinDir, this.userDir];
    let changed = 0;
    for (const root of roots) {
      let entries = [];
      try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const dir = path.join(root, e.name);
        const mf = path.join(dir, 'manifest.json');
        if (!fs.existsSync(mf)) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
          if (manifest.type !== 'live2d') continue;
          const modelPath = path.join(dir, manifest.model);
          const desc = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
          const refs = desc.FileReferences || {};
          if (!refs.DisplayInfo) continue;
          const cdi = JSON.parse(fs.readFileSync(path.join(path.dirname(modelPath), refs.DisplayInfo), 'utf8'));
          const ids = (cdi.Parameters || []).map((p) => p.Id);
          const names = {};
          for (const p of cdi.Parameters || []) names[p.Id] = p.Name || '';

          let dirty = false;
          const dp = { ...(manifest.defaultParams || {}) };
          // 水印：默认隐藏
          for (const id of ids) {
            if (/水印|watermark/i.test(names[id]) && !Object.prototype.hasOwnProperty.call(dp, id)) {
              dp[id] = 0; dirty = true;
            }
          }
          // 猫耳等装饰：仍保持默认打开（仅当模型有该参数且未设置过）
          for (const id of ids) {
            if (/猫(?:咪)?耳/.test(names[id]) && !Object.prototype.hasOwnProperty.call(dp, id)) {
              dp[id] = 1; dirty = true;
            }
          }
          if (dirty) manifest.defaultParams = dp;

          // 手部参数：剔除模型不存在的
          const pp = { ...(manifest.params || {}) };
          for (const key of ['handLeftDown', 'handRightDown']) {
            if (pp[key] && !ids.includes(pp[key])) { delete pp[key]; dirty = true; }
          }
          if (!pp.handLeftDown && ids.includes('CatParamLeftHandDown')) { pp.handLeftDown = 'CatParamLeftHandDown'; dirty = true; }
          if (!pp.handRightDown && ids.includes('CatParamRightHandDown')) { pp.handRightDown = 'CatParamRightHandDown'; dirty = true; }
          if (dirty) manifest.params = pp;

          if (dirty) {
            fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));
            changed++;
          }
        } catch { /* 单个包迁移失败不影响其他包 */ }
      }
    }
    if (changed) console.log(`[packs] 已迁移 ${changed} 个资源包（水印默认隐藏 / 手部参数校正）`);
    return changed;
  }

  // 供自定义协议使用：安全解析包内文件
  resolveFile(packId, relPath) {
    const dir = this.packDir(packId);
    const file = path.resolve(dir, relPath);
    if (!file.startsWith(path.resolve(dir) + path.sep) && file !== path.resolve(dir)) return null;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    return file;
  }
}

module.exports = { PackManager };
