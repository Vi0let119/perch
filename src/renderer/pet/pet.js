// 桌宠渲染层：Live2D 图层合成 + 空闲动画 + 计划气泡 + 空闲提醒
const $ = (id) => document.getElementById(id);
const layers = {
  bg: $('layer-bg'),
  body: $('layer-body'),
  face: $('layer-face'),
  left: $('layer-left'),
  right: $('layer-right'),
};

let manifest = null;
let packId = '';
let scale = 0.55;
let currentFaceIdx = -1;          // 当前表情索引
let remindTimer = null;           // 提醒表情恢复计时
let idleTimer = null;             // 空闲动画定时器（单链，避免换肤/缩放时累积）
const pawBusy = { left: false, right: false };
let lastBubbleIds = '';

// Live2D 运行时
let l2d = null; // { app, model, modelUrl, params, remindParams, userFit, userParams }

// 缓存的应用设置（pawAnimation / bubbleEnabled 等）
let appSettings = { pawAnimation: true, bubbleEnabled: true, remindFace: true };
// 模型未就绪时暂存的用户自定义参数/位置，就绪后重放
let pendingParams = null;
let pendingFit = null;

// 渲染暂停（拖动中 / 窗口隐藏）
const pauseReasons = new Set();

// 气泡「关闭」状态：记住被关闭的计划，新计划开始时自动重新弹出
let dismissedIds = new Set();
let dismissedUpcoming = [];   // [{id, startMin}] 关闭时预告项，到点自动解除
let reminderMode = false;     // 当前气泡展示的是空闲提醒
let reminderTimer = null;
let lastBubbleState = null;

// ---------- 工具 ----------
function packUrl(rel) {
  return `petpack://${packId}/${rel}`;
}

function setImg(img, rel) {
  if (rel) {
    img.src = packUrl(rel);
    img.classList.remove('hidden');
  } else {
    img.removeAttribute('src');
    img.classList.add('hidden');
  }
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function toMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

// ---------- 渲染暂停控制 ----------
function setPaused(reason, paused) {
  if (paused) pauseReasons.add(reason);
  else pauseReasons.delete(reason);
  const shouldPause = pauseReasons.size > 0;
  if (!l2d || !l2d.app) return;
  try {
    if (shouldPause) {
      l2d.app.ticker.stop();
      PIXI.Ticker.shared.stop();
    } else {
      l2d.app.ticker.start();
      PIXI.Ticker.shared.start();
    }
  } catch { /* 忽略 */ }
}

// ---------- 模型加载 ----------
async function loadModel() {
  const rt = await window.api.petRuntime();
  manifest = rt.manifest;
  packId = rt.packId;
  scale = rt.scale || 0.55;
  if (rt.settings) appSettings = { ...appSettings, ...rt.settings };

  const errEl = $('err');
  if (!manifest) {
    errEl.textContent = '资源包加载失败：' + (rt.errors || []).join('；');
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.toggle('hidden', !(rt.errors || []).length);
  if (rt.errors && rt.errors.length) errEl.textContent = rt.errors.join('；');

  const c = manifest.canvas;
  const pet = $('pet');
  pet.style.width = c.width * scale + 'px';
  pet.style.height = c.height * scale + 'px';

  if (manifest.type === 'live2d') {
    for (const img of Object.values(layers)) img.classList.add('hidden');
    const url = packUrl(manifest.model);
    if (l2d && l2d.modelUrl === url) {
      // 仅缩放变化：重设画布尺寸并重新适配模型，不重建渲染器（避免透明窗口变白底）
      resizeLive2D();
      return;
    }
    await loadLive2D(url);
    return;
  }
  destroyLive2D();
  for (const img of Object.values(layers)) img.classList.remove('hidden');

  setImg(layers.bg, manifest.bg || null);
  setImg(layers.body, manifest.body);
  currentFaceIdx = (manifest.faces && manifest.faces.length)
    ? (manifest.defaultFace ?? 0)
    : -1;
  applyFace(currentFaceIdx);
  setImg(layers.left, manifest.handLeft && manifest.handLeft.up);
  setImg(layers.right, manifest.handRight && manifest.handRight.up);
  scheduleIdle();
}

// ---------- Live2D 渲染 ----------
// 软件渲染（兼容模式）下用更低帧率：CPU 显著下降，慢速呼吸/物理动画观感几乎无损
function l2dMaxFps() {
  return appSettings.disableGpu === false ? 24 : 18;
}

function fitLive2dModel(w, h) {
  if (!l2d || !l2d.model) return;
  const model = l2d.model;
  const uf = l2d.userFit || {};
  const mc = manifest.mverConfig || {};
  // 用模型原始画布尺寸（internalModel）而非 model.width/height：后者随当前 scale 变化，
  // 会导致重复适配时缩放来回跳变（0.146 ↔ 1.0）
  const iw = (model.internalModel && model.internalModel.width) || 1400;
  const ih = (model.internalModel && model.internalModel.height) || 1400;
  // 缩放系数只用用户设置：皮肤 config 的 l2d_correct 是配合 Mver 窗口尺寸的系数，
  // 直接套用会让模型放大约 2 倍（超出画布），仅在面板作为建议值展示
  const scaleMul = Number.isFinite(uf.scaleMul) ? uf.scaleMul : 1;
  const flip = uf.flip ?? mc.flip ?? false;
  const fitScale = Math.min(w / iw, h / ih) * (manifest.fit ? manifest.fit.scale || 1 : 1.05) * scaleMul;
  model.scale.set(flip ? -fitScale : fitScale);
  const ox = (manifest.fit && manifest.fit.offsetX) || 0;
  const oy = (manifest.fit && manifest.fit.offsetY) || 0;
  const mx = (mc.offsetX || 0) * w; // config 的 l2d_offset 为画布比例
  const my = (mc.offsetY || 0) * h;
  model.position.set(w / 2 + ox + (uf.offsetX || 0) + mx, h + oy + (uf.offsetY || 0) + my);
}

function resizeLive2D() {
  const c = manifest.canvas;
  const w = Math.round(c.width * scale);
  const h = Math.round(c.height * scale);
  l2d.app.renderer.resize(w, h);
  fitLive2dModel(w, h);
}

async function loadLive2D(modelUrl) {
  try {
    const c = manifest.canvas;
    const w = Math.round(c.width * scale);
    const h = Math.round(c.height * scale);

    // 渲染器常驻：首次创建，之后换肤只替换模型，避免反复重建 WebGL 上下文
    // （软渲染环境下反复重建易触发 GPU 进程重启，导致透明窗口变白底）
    if (!l2d) {
      PIXI.Ticker.shared.maxFPS = l2dMaxFps();
      const app = new PIXI.Application({
        width: w,
        height: h,
        backgroundAlpha: 0,
        antialias: false,
        autoStart: true,
      });
      app.ticker.maxFPS = l2dMaxFps();
      app.view.classList.add('layer', 'layer2d');
      $('pet').appendChild(app.view);

      l2d = { app, model: null, modelUrl: '', params: {}, remindParams: {}, userFit: null, userParams: {} };
    }

    // 移除旧模型（换肤）
    if (l2d.model) {
      l2d.app.stage.removeChild(l2d.model);
      l2d.model.destroy();
      l2d.model = null;
    }

    const model = await PIXI.live2d.Live2DModel.from(modelUrl, { autoInteract: true });
    model.anchor.set(0.5, 1);
    l2d.model = model;
    l2d.modelUrl = modelUrl;
    l2d.params = manifest.params || {};
    l2d.remindParams = manifest.remindParams || {};
    l2d.app.stage.addChild(model);

    // 上报参数元数据（真实 min/max/默认值）给主进程缓存，供外观页显示开关真实状态
    reportParamMeta(model);

    // 模型默认参数（manifest.defaultParams）：猫耳等装饰默认打开、水印默认隐藏
    if (manifest.defaultParams) {
      const core = model.internalModel.coreModel;
      for (const [id, v] of Object.entries(manifest.defaultParams)) {
        try { core.setParameterValueById(id, v); } catch { /* 参数不存在则忽略 */ }
      }
    }

    // 用户自定义参数（外观页保存的）最后应用，显式选择优先于模型默认
    try {
      const uc = await window.api.getPackUserConfig(packId);
      l2d.userFit = (uc && uc.fit) || null;
      l2d.userParams = (uc && uc.params) || {};
    } catch { l2d.userFit = null; l2d.userParams = {}; }
    applyUserParams();

    // 加载期间收到的参数修改：重放
    if (pendingParams) { l2d.userParams = { ...l2d.userParams, ...pendingParams }; pendingParams = null; applyUserParams(); }
    if (pendingFit) { l2d.userFit = { ...(l2d.userFit || {}), ...pendingFit }; pendingFit = null; }

    fitLive2dModel(w, h);

    // 渲染器/模型变化后重新确保窗口透明（防透明失效变白底的兜底）
    window.api.fixTransparency();

    scheduleIdle();
  } catch (e) {
    const errEl = $('err');
    errEl.textContent = 'Live2D 加载失败：' + (e && e.message ? e.message : e);
    errEl.classList.remove('hidden');
  }
}

function destroyLive2D() {
  if (!l2d) return;
  try {
    l2d.app.destroy(false, { children: true, texture: true, baseTexture: true });
  } catch { /* 忽略销毁异常 */ }
  l2d = null;
}

// 参数元数据：min/max/默认值（用于外观页显示开关真实状态与取值）
function reportParamMeta(model) {
  try {
    const core = model.internalModel.coreModel;
    // CoreModel 包装层没有「按索引取 id」的公开方法，用内部 id 数组（与索引同序）
    let ids = null;
    try { if (typeof core.getParameterIds === 'function') ids = core.getParameterIds(); } catch { ids = null; }
    if (!ids || !ids.length) ids = core._parameterIds || [];
    const meta = {};
    for (const id of ids) {
      const i = core.getParameterIndex(id);
      if (i < 0) continue;
      meta[id] = {
        min: core.getParameterMinimumValue(i),
        max: core.getParameterMaximumValue(i),
        default: core.getParameterDefaultValue(i),
      };
    }
    if (Object.keys(meta).length) window.api.reportParamMeta(packId, meta);
  } catch { /* 元数据可缺失，不影响渲染 */ }
}

// 参数读取/写入（按索引，避免不存在的参数报错）
function paramIndex(id) {
  if (!l2d || !l2d.model || !id) return -1;
  try { return l2d.model.internalModel.coreModel.getParameterIndex(id); } catch { return -1; }
}

function l2dSetParam(id, value) {
  const idx = paramIndex(id);
  if (idx < 0) return false;
  try {
    l2d.model.internalModel.coreModel.setParameterValueByIndex(idx, value);
    return true;
  } catch { return false; }
}

// 应用用户自定义参数（外观页修改 / 换肤恢复），一次性赋值
function applyUserParams() {
  if (!l2d || !l2d.model || !l2d.userParams) return;
  for (const [id, v] of Object.entries(l2d.userParams)) l2dSetParam(id, v);
}

// 提醒表情：读-改-还原（不再写死 0，避免把参数恢复成非默认值导致部件异常）
function l2dRemind(on) {
  if (!l2d || !l2d.model) return;
  const core = l2d.model.internalModel.coreModel;
  if (on) {
    l2d.remindBackup = {};
    for (const [id, v] of Object.entries(l2d.remindParams)) {
      const idx = paramIndex(id);
      if (idx < 0) continue;
      l2d.remindBackup[id] = core.getParameterValueByIndex(idx);
      try { core.setParameterValueByIndex(idx, v); } catch { /* 忽略 */ }
    }
  } else {
    for (const [id, v] of Object.entries(l2d.remindBackup || {})) l2dSetParam(id, v);
    l2d.remindBackup = null;
  }
}

function applyFace(idx) {
  if (manifest && manifest.type === 'live2d') return;
  currentFaceIdx = idx;
  if (!manifest || !manifest.faces || !manifest.faces.length || idx < 0) {
    layers.face.classList.add('hidden');
    return;
  }
  setImg(layers.face, manifest.faces[idx].file);
}

function remindFace() {
  if (!manifest || appSettings.remindFace === false) return;
  if (manifest.type === 'live2d') {
    l2dRemind(true);
    clearTimeout(remindTimer);
    remindTimer = setTimeout(() => l2dRemind(false), 8000);
    return;
  }
  if (!manifest.faces || !manifest.faces.length) return;
  const idx = manifest.remindFace;
  if (idx === undefined || idx === null || !manifest.faces[idx]) return;
  applyFace(idx);
  clearTimeout(remindTimer);
  remindTimer = setTimeout(() => applyFace(manifest.defaultFace ?? 0), 8000);
}

// ---------- 空闲爪子动画 ----------
function randInt(a, b) {
  return Math.floor(a + Math.random() * (b - a));
}

// 爪子按下：先记录参数原值，动作结束后还原原值。
// 之前实现是「设 1 → 260ms 后设 0」，但社区皮肤的该参数默认值不是 0（手本来就在键盘上），
// 设回 0 等于把手收起来且永久保持 —— 这就是"手部消失"的原因。
function pressPaw(side) {
  if (!manifest || appSettings.pawAnimation === false) return;
  if (pawBusy[side]) return;
  pawBusy[side] = true;
  const release = () => { pawBusy[side] = false; };

  if (manifest.type === 'live2d') {
    const key = side === 'left' ? 'handLeftDown' : 'handRightDown';
    const id = (l2d && l2d.params && l2d.params[key]) || null;
    const idx = paramIndex(id);
    if (idx < 0) { release(); return; }   // 该皮肤没有对应手部参数 → 不做动画
    const core = l2d.model.internalModel.coreModel;
    let before = 0;
    let down = 1;
    try {
      before = core.getParameterValueByIndex(idx);
      const max = core.getParameterMaximumValue(idx);
      down = max >= 1 ? 1 : max;
    } catch { /* 读不到就用默认值 */ }
    l2dSetParam(id, down);
    setTimeout(() => {
      l2dSetParam(id, before);   // 还原原值，而非写死 0
      release();
    }, (manifest.idle && manifest.idle.pressMs) || 260);
    return;
  }

  const hand = manifest[`hand${side === 'left' ? 'Left' : 'Right'}`];
  const img = layers[side];
  if (!hand || !hand.down || !hand.down.length) {
    release();
    return;
  }
  const frame = hand.down[randInt(0, hand.down.length)];
  setImg(img, frame);
  setTimeout(() => {
    setImg(img, hand.up);
    release();
  }, (manifest.idle && manifest.idle.pressMs) || 240);
}

// 单链定时器：换肤/缩放重复调用不会累积多条链（旧实现的 CPU 泄漏点之一）
function scheduleIdle() {
  clearTimeout(idleTimer);
  if (!manifest || appSettings.pawAnimation === false) return;
  const idle = manifest.idle || {};
  const delay = randInt(idle.minInterval ?? 2500, idle.maxInterval ?? 6000);
  idleTimer = setTimeout(() => {
    if (manifest && pauseReasons.size === 0) pressPaw(Math.random() < 0.5 ? 'left' : 'right');
    scheduleIdle();
  }, delay);
}

// ---------- 气泡 ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 关闭弹窗：记住当前展示的计划，新计划开始时自动重新弹出
// 直接从 DOM 读取 id（不依赖缓存的状态对象，避免渲染时序导致的丢失）
function dismissBubble() {
  const ids = new Set();
  for (const row of document.querySelectorAll('#bubble-list .task-row')) {
    if (row.dataset.id) ids.add(row.dataset.id);
  }
  const nextEl = $('bubble-next');
  const upcoming = [];
  if (nextEl && nextEl.dataset.id) {
    upcoming.push({ id: nextEl.dataset.id, startMin: Number(nextEl.dataset.startMin) || -1 });
    ids.add(nextEl.dataset.id);
  }
  dismissedIds = ids.size > 200 ? new Set([...ids].slice(-100)) : ids;
  dismissedUpcoming = upcoming;
  hideReminder();
  $('bubble').classList.add('hidden');
}

// 预告项到点后解除关闭状态（让它重新弹出）
function pruneDismissals() {
  if (!dismissedUpcoming.length) return;
  const mins = nowMinutes();
  dismissedUpcoming = dismissedUpcoming.filter((u) => {
    if (mins >= u.startMin) { dismissedIds.delete(u.id); return false; }
    return true;
  });
}

function hideReminder() {
  reminderMode = false;
  clearTimeout(reminderTimer);
  const r = $('bubble-reminder');
  if (r) { r.classList.add('hidden'); r.textContent = ''; }
  $('bubble-list').classList.remove('hidden');
}

// 空闲随机提醒
function renderReminder(payload) {
  if (appSettings.bubbleEnabled === false || !payload || !payload.text) return;
  reminderMode = true;
  clearTimeout(reminderTimer);
  lastBubbleState = null;
  const bubble = $('bubble');
  $('bubble-title').textContent = '💡 小提醒';
  $('bubble-count').textContent = '';
  const list = $('bubble-list');
  list.innerHTML = '';
  list.classList.add('hidden');
  $('bubble-next').classList.add('hidden');
  const r = $('bubble-reminder');
  r.textContent = payload.text;
  r.classList.remove('hidden');
  bubble.classList.remove('hidden');
  bubble.classList.remove('bounce');
  void bubble.offsetWidth;
  bubble.classList.add('bounce');
  remindFace();
  pressPaw('left');
  setTimeout(() => pressPaw('right'), 300);
  // 60 秒后自动收起
  reminderTimer = setTimeout(() => {
    hideReminder();
    if (lastBubbleState) renderBubble(lastBubbleState);
    else bubble.classList.add('hidden');
  }, 60 * 1000);
}

function renderBubble(state) {
  lastBubbleState = state;
  const bubble = $('bubble');
  if (!state.bubbleEnabled) {
    hideReminder();
    bubble.classList.add('hidden');
    return;
  }

  pruneDismissals();
  const current = (state.current || []).filter((i) => !dismissedIds.has(i.id));
  const next = state.next && !dismissedIds.has(state.next.id) ? state.next : null;

  // 无内容可显示时：若正在展示提醒则保留提醒，否则隐藏
  if (!current.length && !next) {
    if (reminderMode) return;
    bubble.classList.add('hidden');
    return;
  }
  if (reminderMode) hideReminder();

  const ids = current.map((i) => i.id).join(',') + '|' + (next ? next.id : '');
  const isNewContent = ids !== lastBubbleIds;
  lastBubbleIds = ids;

  // 标题
  const running = current.filter((i) => !i.allDay && !i.overdue);
  const overdueCount = current.filter((i) => i.overdue).length;
  $('bubble-title').textContent = running.length ? '🐱 进行中'
    : current.some((i) => !i.allDay) ? '📋 今日待办'
    : current.length ? '📋 今日待办' : '⏰ 即将开始';
  const parts = [];
  if (state.upcomingCount) parts.push(`稍后 ${state.upcomingCount} 条`);
  if (overdueCount) parts.push(`${overdueCount} 条已过时间`);
  $('bubble-count').textContent = parts.join(' · ');

  // 列表
  const list = $('bubble-list');
  list.innerHTML = '';
  for (const item of current) {
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.id = item.id;

    const time = document.createElement('span');
    time.className = 'task-time' + (item.allDay ? ' allday' : item.overdue ? ' overdue' : '');
    time.textContent = item.allDay ? '全天' : `${item.start}–${item.end}`;
    if (item.overdue) time.title = '已过时间段，尚未打勾';
    row.appendChild(time);

    const main = document.createElement('div');
    main.className = 'task-main';
    const title = document.createElement('div');
    title.className = 'task-title' + (item.overdue ? ' overdue' : '');
    title.textContent = item.title;
    title.title = item.title + (item.note ? '\n' + item.note : '');
    main.appendChild(title);
    if (item.note) {
      const note = document.createElement('div');
      note.className = 'task-note';
      note.textContent = item.note;
      main.appendChild(note);
    }
    row.appendChild(main);

    const check = document.createElement('div');
    check.className = 'task-check';
    check.textContent = '✓';
    check.title = '完成！勾选后不再显示';
    check.addEventListener('click', async (e) => {
      e.stopPropagation();
      row.remove();
      await window.api.setChecked(item.id, state.dateKey, true);
    });
    row.appendChild(check);

    list.appendChild(row);
  }

  // 下一条预告
  const nextEl = $('bubble-next');
  if (next) {
    nextEl.innerHTML = `稍后 <b>${next.start}</b> · ${escapeHtml(next.title)}`;
    nextEl.dataset.id = next.id;
    nextEl.dataset.startMin = String(toMin(next.start));
    nextEl.classList.remove('hidden');
  } else {
    nextEl.textContent = '';
    delete nextEl.dataset.id;
    delete nextEl.dataset.startMin;
    nextEl.classList.add('hidden');
  }

  bubble.classList.remove('hidden');

  // 新计划开始：弹跳 + 提醒表情 + 双爪按下
  if (isNewContent && state.justStartedIds && state.justStartedIds.length) {
    bubble.classList.remove('bounce');
    void bubble.offsetWidth;
    bubble.classList.add('bounce');
    remindFace();
    pressPaw('left');
    setTimeout(() => pressPaw('right'), 300);
  }
}

// ---------- 交互：拖拽 / 点击 / 右键 / 点击穿透 ----------
function initInteraction() {
  const pet = $('pet');
  let dragging = false;
  let moved = 0;
  let lastX = 0, lastY = 0;
  let dragRaf = 0;
  let pendingDrag = null;
  let clickthrough = true;
  let lastClientX = 0, lastClientY = 0;

  const updateClickthrough = (want) => {
    if (want === clickthrough) return;
    clickthrough = want;
    window.api.setClickThrough(want);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
    pendingDrag = null;
    window.api.dragEnd();
    setPaused('drag', false);
    // 拖动中指针可能已离开猫身，结束后重新按当前位置判定穿透
    const el = document.elementFromPoint(lastClientX, lastClientY);
    updateClickthrough(!(el && el.closest('#pet, #bubble')));
    if (moved < 6) window.api.petClick();
  };

  pet.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = 0;
    lastX = e.screenX;
    lastY = e.screenY;
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    window.api.dragStart(e.screenX, e.screenY);
    setPaused('drag', true);   // 拖动时暂停 Live2D 渲染，画面静止（消除拖动卡顿）
  });

  window.addEventListener('mousemove', (e) => {
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    if (dragging) {
      moved += Math.abs(e.screenX - lastX) + Math.abs(e.screenY - lastY);
      lastX = e.screenX;
      lastY = e.screenY;
      // rAF 节流合并：高回报率鼠标也不会把主线程打满
      pendingDrag = { x: e.screenX, y: e.screenY };
      if (!dragRaf) {
        dragRaf = requestAnimationFrame(() => {
          dragRaf = 0;
          if (dragging && pendingDrag) window.api.dragMove(pendingDrag.x, pendingDrag.y);
        });
      }
      return;   // 拖动期间不切换点击穿透（否则会丢失 mouseup，导致窗口无限漂移）
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    updateClickthrough(!(el && el.closest('#pet, #bubble')));
  });

  // 多重结束兜底：任何一条路径触发都收尾，避免拖动状态卡死
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('blur', endDrag);
  window.addEventListener('pointercancel', endDrag);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endDrag();
  });

  pet.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.api.petContextMenu();
  });

  const closeBtn = $('bubble-close');
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); dismissBubble(); });
}

// ---------- 启动 ----------
window.api.on('bubble', renderBubble);
window.api.on('idle-reminder', renderReminder);
window.api.on('drag-stopped', () => { /* 主进程看门狗收尾，仅用于重置内部态 */ });
window.api.on('pack-changed', () => {
  lastBubbleIds = '';
  dismissedIds = new Set();
  dismissedUpcoming = [];
  hideReminder();
  loadModel();
});
// 外观页修改自定义参数/位置：实时应用（模型未就绪时暂存，就绪后重放）
window.api.on('pack-user-config', (cfg) => {
  if (!cfg || cfg.packId !== packId || !manifest || manifest.type !== 'live2d') return;
  if (!l2d || !l2d.model) {
    if (cfg.params) pendingParams = { ...(pendingParams || {}), ...cfg.params };
    if (cfg.fit) pendingFit = { ...(pendingFit || {}), ...cfg.fit };
    return;
  }
  if (cfg.params) l2d.userParams = cfg.params;
  if (cfg.fit) l2d.userFit = cfg.fit;
  applyUserParams();
  if (cfg.fitChanged) {
    const c = manifest.canvas;
    fitLive2dModel(Math.round(c.width * scale), Math.round(c.height * scale));
  }
});
window.api.on('settings-changed', (s) => {
  appSettings = { ...appSettings, ...s };
  if (s.petScale !== scale) {
    scale = s.petScale;
    loadModel(); // 尺寸变化直接重建（对 Live2D 与图层渲染都成立）
  }
  if (s.pawAnimation === false) {
    clearTimeout(idleTimer);
    idleTimer = null;
  } else if (!idleTimer && manifest) {
    scheduleIdle();
  }
});

// 窗口隐藏时暂停渲染（降低后台 CPU 占用）
document.addEventListener('visibilitychange', () => setPaused('hidden', document.hidden));

initInteraction();
window.api.getSettings().then((s) => { if (s) appSettings = { ...appSettings, ...s }; }).catch(() => {});
loadModel();
// 主动拉取一次当前气泡状态：不必等下一次 15 秒 tick
window.api.getBubbleState().then((st) => { if (st) renderBubble(st); }).catch(() => {});
