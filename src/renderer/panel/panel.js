// 管理面板逻辑
const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const rpc = window.api;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MODE_NAME = { daily: '每日', weekly: '每周', once: '单次' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
function toast(msg, isErr) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function toMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

// ================= 页签切换 =================
let activeTab = 'today';
const renderedOnce = {};

function switchTab(tab) {
  activeTab = tab;
  $$('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('section.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + tab));
  refreshTab(tab, true);
}

async function refreshTab(tab, force) {
  if (force && renderedOnce[tab]) renderedOnce[tab] = false;
  if (renderedOnce[tab]) return;
  renderedOnce[tab] = true;
  if (tab === 'today') await renderToday();
  if (tab === 'calendar') await renderCalendar();
  if (tab === 'plans') await renderPlanLists();
  if (tab === 'json') await renderJson();
  if (tab === 'packs') await renderPacks();
  if (tab === 'settings') await renderSettings();
}

// ================= 今日计划 =================
function taskLine(item, dk, opts = {}) {
  const row = document.createElement('div');
  row.className = 'task-line' + (item.checked ? ' done' : '') + (opts.now ? ' now' : '');

  const chip = document.createElement('span');
  chip.className = 'chip ' + (item.allDay ? 'allday' : 'time');
  chip.textContent = item.allDay ? '全天' : `${item.start}–${item.end}`;
  row.appendChild(chip);

  const mode = document.createElement('span');
  mode.className = 'chip mode';
  mode.textContent = MODE_NAME[item.mode] + (item.mode === 'weekly' && item.weekdays ? '·' + item.weekdays.map((w) => WEEKDAYS[w]).join('') : '');
  row.appendChild(mode);

  const main = document.createElement('div');
  main.className = 't-main';
  const title = document.createElement('div');
  title.className = 't-title';
  title.textContent = item.title;
  main.appendChild(title);
  if (item.note) {
    const note = document.createElement('div');
    note.className = 't-note';
    note.textContent = item.note;
    main.appendChild(note);
  }
  row.appendChild(main);

  if (!opts.noCheck) {
    const check = document.createElement('button');
    check.className = 'check-btn';
    check.textContent = '✓';
    check.title = item.checked ? '取消完成' : '标记完成';
    check.addEventListener('click', async () => {
      await rpc.setChecked(item.id, dk, !item.checked);
      refreshTab('today', true);
      if (activeTab === 'calendar') refreshTab('calendar', true);
    });
    row.appendChild(check);
  }

  if (opts.onEdit) {
    const edit = document.createElement('button');
    edit.className = 'icon-btn';
    edit.textContent = '编辑';
    edit.addEventListener('click', () => opts.onEdit(item));
    row.appendChild(edit);
  }

  if (opts.onDelete) {
    const del = document.createElement('button');
    del.className = 'icon-btn danger';
    del.textContent = '删除';
    del.addEventListener('click', async () => {
      if (!confirm(`删除「${item.title}」？`)) return;
      await opts.onDelete(item);
    });
    row.appendChild(del);
  }
  return row;
}

async function renderToday() {
  const now = new Date();
  const dk = dateKey(now);
  const items = await rpc.getDay(dk);
  const done = items.filter((i) => i.checked).length;

  $('today-title').textContent = `${now.getMonth() + 1}月${now.getDate()}日 · ${WEEKDAYS[now.getDay()]} —— 今日计划`;
  $('today-sub').textContent = items.length ? `共 ${items.length} 条，已完成 ${done} 条` : '今天还没有安排，去「计划管理」或「日历便签」添加吧';
  $('today-progress').style.width = items.length ? (done / items.length) * 100 + '%' : '0%';

  const allDay = items.filter((i) => i.allDay);
  const timed = items.filter((i) => !i.allDay);
  $('today-allday-num').textContent = allDay.length ? String(allDay.length) : '';
  $('today-timed-num').textContent = timed.length ? String(timed.length) : '';

  const mins = timeNow();
  const fill = (el, list) => {
    el.innerHTML = '';
    if (!list.length) {
      el.innerHTML = '<div class="empty">（无）</div>';
      return;
    }
    for (const item of list) {
      const nowItem = !item.allDay && !item.checked && toMin(item.start) <= mins && mins < toMin(item.end);
      el.appendChild(taskLine(item, dk, { now: nowItem }));
    }
  };
  fill($('today-allday'), allDay);
  fill($('today-timed'), timed);
}

// ================= 日历便签 =================
let calY = new Date().getFullYear();
let calM = new Date().getMonth() + 1;
let monthData = {};
let selectedDk = dateKey(new Date());
let editingOnceId = null;

async function renderCalendar() {
  monthData = await rpc.getMonth(calY, calM);
  $('cal-label').textContent = `${calY}年${calM}月`;

  const grid = $('cal-grid');
  grid.innerHTML = '';
  for (const d of WEEKDAYS) {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    grid.appendChild(el);
  }

  const first = new Date(calY, calM - 1, 1);
  const startOffset = first.getDay(); // 0=周日
  const prevDays = new Date(calY, calM - 1, 0).getDate();
  const daysInMonth = new Date(calY, calM, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const today = dateKey(new Date());

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    const dayNum = i - startOffset + 1;
    let dk;
    if (dayNum < 1) {
      dk = `${calM === 1 ? calY - 1 : calY}-${String(calM === 1 ? 12 : calM - 1).padStart(2, '0')}-${String(prevDays + dayNum).padStart(2, '0')}`;
      cell.classList.add('other');
    } else if (dayNum > daysInMonth) {
      dk = `${calM === 12 ? calY + 1 : calY}-${String(calM === 12 ? 1 : calM + 1).padStart(2, '0')}-${String(dayNum - daysInMonth).padStart(2, '0')}`;
      cell.classList.add('other');
    } else {
      dk = `${calY}-${String(calM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }
    if (dk === today) cell.classList.add('today');
    if (dk === selectedDk) cell.classList.add('selected');

    const num = document.createElement('div');
    num.className = 'cal-num';
    num.textContent = Number(dk.slice(8));
    cell.appendChild(num);

    const info = monthData[dk];
    if (info) {
      const dots = document.createElement('div');
      dots.className = 'cal-dots';
      const alldayDots = Math.min(info.allDayCount, 4);
      for (let d = 0; d < Math.min(info.count, 4); d++) {
        const dot = document.createElement('i');
        if (d < alldayDots) dot.classList.add('allday');
        dots.appendChild(dot);
      }
      if (info.count > 4) {
        const more = document.createElement('span');
        more.className = 'more';
        more.textContent = `+${info.count - 4}`;
        dots.appendChild(more);
      }
      cell.appendChild(dots);
    }

    cell.addEventListener('click', () => {
      selectedDk = dk;
      if (dayNum < 1 || dayNum > daysInMonth) {
        calY = Number(dk.slice(0, 4));
        calM = Number(dk.slice(5, 7));
        renderCalendar();
      } else {
        $$('.cal-cell').forEach((c) => c.classList.remove('selected'));
        cell.classList.add('selected');
      }
      editingOnceId = null;
      renderDayEditor();
    });
    grid.appendChild(cell);
  }
  renderDayEditor();
}

async function renderDayEditor() {
  const d = new Date(selectedDk + 'T00:00:00');
  $('day-title').textContent = `${Number(selectedDk.slice(5, 7))}月${Number(selectedDk.slice(8))}日 · ${WEEKDAYS[d.getDay()]}`;

  const items = await rpc.getDay(selectedDk);
  const box = $('day-items');
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = '<div class="empty">这一天还没有内容</div>';
  } else {
    for (const item of items) {
      box.appendChild(
        taskLine(item, selectedDk, {
          onEdit:
            item.mode === 'once'
              ? (it) => {
                  editingOnceId = it.id;
                  fillOnceForm('once', it);
                  renderDayEditor();
                  toast('正在编辑，改完点「保存修改」');
                }
              : null,
          onDelete:
            item.mode === 'once'
              ? async (it) => {
                  if (!confirm(`删除「${it.title}」？`)) return;
                  await rpc.deletePlan(it.id);
                  refreshTab('calendar', true);
                }
              : null,
        })
      );
    }
  }

  // 表单日期跟随选择
  $('once-date').value = selectedDk;
  const save = $('once-save');
  save.textContent = editingOnceId ? '保存修改' : '添加到这一天';
  $('once-cancel').classList.toggle('hidden', !editingOnceId);
}

function readOnceForm(prefix) {
  const title = $(prefix + '-title').value.trim();
  const date = $(prefix + '-date').value;
  const start = $(prefix + '-start').value;
  const end = $(prefix + '-end').value;
  const note = $(prefix + '-note').value.trim();
  return { title, date, start, end, note };
}

function fillOnceForm(prefix, item) {
  $(prefix + '-title').value = item.title;
  $(prefix + '-date').value = item.date || selectedDk;
  $(prefix + '-start').value = item.start || '';
  $(prefix + '-end').value = item.end || '';
  $(prefix + '-note').value = item.note || '';
}

// ================= 计划管理 =================
let editing = { daily: null, weekly: null, once2: null };

function buildWeekdayPicker() {
  const box = $('weekly-days');
  box.innerHTML = '';
  WEEKDAYS.forEach((name, idx) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = idx;
    const span = document.createElement('span');
    span.textContent = name;
    label.appendChild(input);
    label.appendChild(span);
    box.appendChild(label);
  });
}

function getWeekdaySelection() {
  return $$('#weekly-days input:checked').map((i) => Number(i.value)).sort((a, b) => a - b);
}

function setWeekdaySelection(days) {
  $$('#weekly-days input').forEach((i) => (i.checked = (days || []).includes(Number(i.value))));
}

async function renderPlanLists() {
  const plans = await rpc.getPlans();
  $('num-daily').textContent = plans.daily.length || '';
  $('num-weekly').textContent = plans.weekly.length || '';
  $('num-once').textContent = plans.once.length || '';

  const rowFor = (mode, p) => {
    const item = {
      id: p.id,
      mode,
      title: p.title,
      start: p.start || '',
      end: p.end || '',
      allDay: !p.start,
      note: p.note || '',
      weekdays: p.weekdays,
      date: p.date,
    };
    return taskLine(item, dateKey(new Date()), {
      noCheck: true,
      onDelete: async (it) => {
        await rpc.deletePlan(it.id);
        refreshTab('plans', true);
      },
      // 编辑按钮通过 extra 附加
    });
  };

  const attachEdit = (row, formKey, p) => {
    const edit = document.createElement('button');
    edit.className = 'icon-btn';
    edit.textContent = '编辑';
    edit.addEventListener('click', () => startEdit(formKey, p));
    row.appendChild(edit);
    return row;
  };

  // formKey 是表单的键（daily/weekly/once2），planMode 是计划的类型（daily/weekly/once）——
  // 两者对「单次计划」不同，混用会导致点"编辑"实际执行新增
  const mk = (formKey, planMode, listEl, arr) => {
    listEl.innerHTML = '';
    if (!arr.length) {
      listEl.innerHTML = '<div class="empty">（暂无）</div>';
      return;
    }
    for (const p of arr) listEl.appendChild(attachEdit(rowFor(planMode, p), formKey, p));
  };
  mk('daily', 'daily', $('list-daily'), plans.daily);
  mk('weekly', 'weekly', $('list-weekly'), plans.weekly);
  mk('once2', 'once', $('list-once'), [...plans.once].sort((a, b) => (a.date || '').localeCompare(b.date || '')));

  // 编辑状态下的按钮文案
  for (const mode of ['daily', 'weekly', 'once2']) {
    $(mode + '-save').textContent = editing[mode] ? '保存修改' : '添加';
  }
}

function startEdit(mode, p) {
  editing[mode] = p.id;
  if (mode === 'daily') {
    $('daily-title').value = p.title;
    $('daily-start').value = p.start || '';
    $('daily-end').value = p.end || '';
    $('daily-note').value = p.note || '';
  } else if (mode === 'weekly') {
    $('weekly-title').value = p.title;
    $('weekly-start').value = p.start || '';
    $('weekly-end').value = p.end || '';
    $('weekly-note').value = p.note || '';
    setWeekdaySelection(p.weekdays);
  } else {
    fillOnceForm('once2', { ...p, date: p.date });
  }
  $(mode + '-save').textContent = '保存修改';
}

async function saveSection(mode) {
  const collect = {
    daily: () => ({
      title: $('daily-title').value.trim(),
      start: $('daily-start').value,
      end: $('daily-end').value,
      note: $('daily-note').value.trim(),
    }),
    weekly: () => ({
      title: $('weekly-title').value.trim(),
      weekdays: getWeekdaySelection(),
      start: $('weekly-start').value,
      end: $('weekly-end').value,
      note: $('weekly-note').value.trim(),
    }),
    once2: () => {
      const f = readOnceForm('once2');
      return { ...f, date: f.date || $('once2-date').value };
    },
  };
  const raw = collect[mode]();
  const id = editing[mode];
  const r = id ? await rpc.updatePlan(id, raw) : await rpc.addPlan(mode === 'once2' ? 'once' : mode, raw);
  if (!r.ok) {
    toast(r.error, true);
    return;
  }
  editing[mode] = null;
  // 清空表单
  for (const key of ['title', 'start', 'end', 'note', 'date', 'days']) {
    const el = $(mode + '-' + key);
    if (el) el.value = '';
  }
  if (mode === 'weekly') setWeekdaySelection([]);
  if (mode === 'once2') $('once2-date').value = dateKey(new Date());
  toast(id ? '已保存修改' : '已添加');
  refreshTab('plans', true);
  renderedOnce.today = false;
}

// ================= JSON =================
async function renderJson() {
  const ta = $('json-text');
  if (!ta.value.trim()) ta.value = await rpc.exportPlans();
}

function jsonMsg(text, ok) {
  const el = $('json-msg');
  el.textContent = text;
  el.className = ok ? 'ok' : 'bad';
}

// ================= 外观（资源包） =================
const l2dPreviewApps = [];

// 外观页底部：当前 Live2D 皮肤的自定义参数开关 + 位置微调
async function renderPackCustom(activeId, activeType) {
  const box = $('pack-custom');
  if (!box) return;
  if (activeType !== 'live2d') {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');

  const [list, uc, { manifest }] = await Promise.all([
    rpc.getPackCustomParams(activeId),
    rpc.getPackUserConfig(activeId),
    rpc.packManifest(activeId),
  ]);
  const mc = (manifest && manifest.mverConfig) || null;
  const defaults = (manifest && manifest.defaultParams) || {};
  $('custom-count').textContent = list.length ? String(list.length) : '';
  const container = $('custom-params');
  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = '<div class="empty">该皮肤没有可自定义的参数</div>';
  }
  for (const p of list) {
    const saved = uc.params && Object.prototype.hasOwnProperty.call(uc.params, p.id);
    // 真实初值：用户已保存值 > 导入时的默认值 > 参数自身默认值
    const effective = saved ? uc.params[p.id]
      : Object.prototype.hasOwnProperty.call(defaults, p.id) ? defaults[p.id]
        : (typeof p.default === 'number' ? p.default : 0);
    const min = typeof p.min === 'number' ? p.min : 0;
    const max = typeof p.max === 'number' ? p.max : 1;
    const isToggle = max - min <= 1.5;   // 0/1 类开关用开关控件，跨度大的用滑块

    const row = document.createElement('div');
    row.className = 'set-row';
    const label = document.createElement('div');
    label.className = 'set-label';
    label.innerHTML = `<b>${esc(p.name)}</b><span>${esc(p.id)}${isToggle ? '' : ` · ${min}~${max}`}</span>`;
    row.appendChild(label);

    if (isToggle) {
      const sw = document.createElement('label');
      sw.className = 'switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = effective > (min + max) / 2;
      const onValue = max >= 1 ? 1 : max;
      const offValue = min <= 0 ? 0 : min;
      input.addEventListener('change', () => rpc.setPackUserParam(activeId, p.id, input.checked ? onValue : offValue));
      sw.appendChild(input);
      sw.appendChild(document.createElement('i'));
      row.appendChild(sw);
    } else {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;max-width:220px';
      const range = document.createElement('input');
      range.type = 'range';
      range.min = min; range.max = max; range.step = (max - min) / 100;
      range.value = effective;
      range.style.flex = '1';
      const val = document.createElement('span');
      val.style.cssText = 'font-size:12px;color:var(--ink-3);width:34px;text-align:right';
      val.textContent = Number(effective).toFixed(2);
      range.addEventListener('input', () => { val.textContent = Number(range.value).toFixed(2); });
      range.addEventListener('change', () => rpc.setPackUserParam(activeId, p.id, Number(range.value)));
      wrap.appendChild(range);
      wrap.appendChild(val);
      row.appendChild(wrap);
    }
    container.appendChild(row);
  }

  // config.json 对应项：缩放修正 / 水平翻转（每个皮肤的 config 值不同，按皮肤显示）
  const cfgBox = $('pack-custom-cfg');
  cfgBox.classList.toggle('hidden', !mc);
  if (mc) {
    const scaleEl = $('cfg-correct');
    const flipEl = $('cfg-flip');
    // 滑块显示实际生效值（不自动套用 config 建议值），建议值以按钮形式提供
    scaleEl.value = Number.isFinite(uc.fit.scaleMul) ? uc.fit.scaleMul : 1;
    $('cfg-correct-val').textContent = Number(scaleEl.value).toFixed(2) + '×';
    flipEl.checked = !!(uc.fit.flip ?? mc.flip);
  }

  // 位置微调 + config 校准项（合并为一份按皮肤保存的 fit）
  const fx = $('fit-x'), fy = $('fit-y');
  const scaleEl = $('cfg-correct'), flipEl = $('cfg-flip');
  fx.value = (uc.fit && uc.fit.offsetX) || 0;
  fy.value = (uc.fit && uc.fit.offsetY) || 0;
  $('fit-x-val').textContent = fx.value;
  $('fit-y-val').textContent = fy.value;
  const pushFit = () => {
    rpc.setPackUserFit(activeId, {
      offsetX: Number(fx.value),
      offsetY: Number(fy.value),
      scaleMul: Number(scaleEl.value),
      flip: flipEl.checked,
    });
  };
  fx.oninput = () => { $('fit-x-val').textContent = fx.value; };
  fy.oninput = () => { $('fit-y-val').textContent = fy.value; };
  scaleEl.oninput = () => { $('cfg-correct-val').textContent = Number(scaleEl.value).toFixed(2) + '×'; };
  fx.onchange = pushFit;
  fy.onchange = pushFit;
  scaleEl.onchange = pushFit;
  flipEl.onchange = pushFit;
  $('fit-reset').onclick = () => {
    fx.value = 0; fy.value = 0;
    $('fit-x-val').textContent = '0';
    $('fit-y-val').textContent = '0';
    pushFit();
  };

  // config 建议缩放：仅提示，点击才套用
  // （该系数是配合 Mver 窗口尺寸的，直接套用会让模型放大约 2 倍并超出画布）
  const hint = $('cfg-suggest');
  if (hint) {
    if (mc && Number.isFinite(mc.correct)) {
      hint.textContent = '  ' + Number(mc.correct).toFixed(3) + '×（点此套用 config 建议值）';
      hint.classList.remove('hidden');
      hint.onclick = () => {
        scaleEl.value = mc.correct;
        $('cfg-correct-val').textContent = Number(mc.correct).toFixed(2) + '×';
        pushFit();
      };
    } else {
      hint.classList.add('hidden');
      hint.onclick = null;
    }
  }
}

async function renderPacks() {
  // 销毁上一轮 Live2D 预览的渲染器，避免 GL 上下文泄漏
  while (l2dPreviewApps.length) {
    try { l2dPreviewApps.pop().destroy(false, { children: true, texture: true, baseTexture: true }); } catch { /* noop */ }
  }
  const { packs, activeId } = await rpc.listPacks();
  const settings = await rpc.getSettings();
  $('scale-range').value = settings.petScale;
  $('scale-val').textContent = Math.round(settings.petScale * 100) + '%';

  const list = $('pack-list');
  list.innerHTML = '';
  for (const p of packs) {
    const card = document.createElement('div');
    card.className = 'pack-card' + (p.id === activeId ? ' active' : '');

    const preview = document.createElement('div');
    preview.className = 'pack-preview';
    const canvas = document.createElement('canvas');
    preview.appendChild(canvas);
    // 只渲染当前激活皮肤的模型预览（每张卡片都创建 WebGL 上下文会显著占用 CPU 并易触发崩溃），
    // 其余卡片显示占位提示，点"使用"切换后即会渲染
    if (p.id === activeId) {
      await drawPreview(canvas, p);
    } else {
      drawPlaceholder(canvas, p);
    }
    card.appendChild(preview);

    const info = document.createElement('div');
    info.className = 'pack-info';
    const kindTag = p.type === 'live2d' ? ' · Live2D' : '';
    info.innerHTML = `
      <div class="pack-name">${esc(p.name)}
        <span class="pack-tag ${p.isBuiltin ? 'builtin' : 'custom'}">${p.isBuiltin ? '内置' : '自定义'}</span>
      </div>
      <div class="pack-meta">${esc(p.author || '佚名')}${p.author ? ' · ' : ''}v${esc(p.version)}${kindTag} · 表情 ${p.faceCount} 个</div>`;
    card.appendChild(info);

    if (p.errors && p.errors.length) {
      const err = document.createElement('div');
      err.className = 'pack-err';
      err.textContent = '⚠ ' + p.errors.join('；');
      card.appendChild(err);
    }

    const ops = document.createElement('div');
    ops.className = 'pack-ops';
    const useBtn = document.createElement('button');
    useBtn.className = 'btn' + (p.id === activeId ? ' ghost' : '');
    useBtn.textContent = p.id === activeId ? '使用中' : '使用';
    useBtn.disabled = p.id === activeId;
    useBtn.addEventListener('click', async () => {
      const r = await rpc.setActivePack(p.id);
      if (r.ok) toast(`已切换为「${p.name}」`);
      else toast((r.errors || ['切换失败']).join('；'), true);
      refreshTab('packs', true);
    });
    ops.appendChild(useBtn);

    if (!p.isBuiltin) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn danger';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`删除资源包「${p.name}」？`)) return;
        const r = await rpc.deletePack(p.id);
        if (r.ok) toast('已删除');
        refreshTab('packs', true);
      });
      ops.appendChild(delBtn);
    }
    card.appendChild(ops);
    list.appendChild(card);
  }

  // 当前激活皮肤的自定义面板
  const activePack = packs.find((p) => p.id === activeId);
  await renderPackCustom(activeId, activePack ? activePack.type : 'png');
}

// 非激活皮肤的占位预览（避免为每张卡片创建 WebGL 上下文）
function drawPlaceholder(canvas, pack) {
  const W = 232;
  canvas.width = W;
  canvas.height = 134;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, canvas.height);
  ctx.fillStyle = '#d9d4cc';
  ctx.font = '13px "Microsoft YaHei UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('点击「使用」后预览', W / 2, canvas.height / 2 - 2);
  ctx.font = '11px "Microsoft YaHei UI", sans-serif';
  ctx.fillStyle = '#b3ada4';
  ctx.fillText(pack.type === 'live2d' ? 'Live2D 皮肤' : '分层 PNG 皮肤', W / 2, canvas.height / 2 + 16);
}

// 预览：png 包按图层顺序叠画；live2d 包用 PIXI 渲染一帧
async function drawPreview(canvas, pack) {
  const { manifest } = await rpc.packManifest(pack.id);
  if (!manifest) return;
  const c = manifest.canvas;
  const W = 232;
  canvas.width = W;
  canvas.height = Math.round((W * c.height) / c.width);
  const ctx = canvas.getContext('2d');

  if (manifest.type === 'live2d') {
    try { await drawL2dPreview(canvas, pack.id, manifest); } catch { /* 预览失败静默 */ }
    return;
  }

  const stack = [manifest.bg, manifest.body];
  const face = Array.isArray(manifest.faces) && manifest.faces.length ? manifest.faces[manifest.defaultFace ?? 0] : null;
  if (face) stack.push(face.file);
  if (manifest.handLeft) stack.push(manifest.handLeft.up);
  if (manifest.handRight) stack.push(manifest.handRight.up);

  for (const rel of stack) {
    if (!rel) continue;
    // eslint-disable-next-line no-await-in-loop
    const img = await loadImg(`petpack://${pack.id}/${rel}`);
    if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
}

async function drawL2dPreview(canvas, packId, manifest) {
  const W = canvas.width, H = canvas.height;
  const app = new PIXI.Application({ width: W, height: H, backgroundAlpha: 0, antialias: false, autoStart: false });
  l2dPreviewApps.push(app);
  canvas.replaceWith(app.view);
  app.view.style.maxWidth = '88%';
  app.view.style.maxHeight = '88%';

  const model = await PIXI.live2d.Live2DModel.from(`petpack://${packId}/${manifest.model}`, { autoInteract: false, autoUpdate: false });
  model.autoUpdate = false;
  model.anchor.set(0.5, 1);

  // 与桌宠一致地应用参数：否则预览会显示模型默认的水印等未隐藏部件
  let appliedCount = 0;
  try {
    const core = model.internalModel.coreModel;
    const uc = await rpc.getPackUserConfig(packId);
    const merged = { ...(manifest.defaultParams || {}), ...((uc && uc.params) || {}) };
    for (const [id, v] of Object.entries(merged)) {
      const idx = core.getParameterIndex(id);
      if (idx >= 0) { core.setParameterValueByIndex(idx, v); appliedCount++; }
    }
  } catch { /* 参数应用失败时按模型默认渲染 */ }
  app.view.dataset.paramsApplied = String(appliedCount);

  const uf = (await rpc.getPackUserConfig(packId).catch(() => null)) || {};
  const fit = uf.fit || {};
  const mc = manifest.mverConfig || {};
  const scaleMul = Number.isFinite(fit.scaleMul) ? fit.scaleMul : 1;
  const flip = fit.flip ?? mc.flip ?? false;
  const iw = (model.internalModel && model.internalModel.width) || 1400;
  const ih = (model.internalModel && model.internalModel.height) || 1400;
  const fitScale = Math.min(W / iw, H / ih) * (manifest.fit ? manifest.fit.scale || 1 : 1.05) * scaleMul;
  model.scale.set(flip ? -fitScale : fitScale);
  const mx = (mc.offsetX || 0) * W;
  const my = (mc.offsetY || 0) * H;
  model.position.set(W / 2 + ((manifest.fit && manifest.fit.offsetX) || 0) + (fit.offsetX || 0) + mx,
    H + ((manifest.fit && manifest.fit.offsetY) || 0) + (fit.offsetY || 0) + my);
  app.stage.addChild(model);
  // 手动推进两帧并渲染静态预览后停止（不常驻渲染，降低 CPU）
  model.update(16);
  app.render();
  model.update(16);
  app.render();
  try { PIXI.Ticker.shared.stop(); } catch { /* 忽略 */ }
}

function loadImg(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ================= 设置 =================
async function renderSettings() {
  const s = await rpc.getSettings();
  $('set-top').checked = s.alwaysOnTop !== false;
  $('set-bubble').checked = s.bubbleEnabled !== false;
  $('set-remindface').checked = s.remindFace !== false;
  $('set-paw').checked = s.pawAnimation !== false;
  $('set-gpu').checked = s.disableGpu !== false;
  $('set-autostart').checked = await rpc.autostartGet();

  const r = s.idleReminder || {};
  $('set-reminder').checked = r.enabled !== false;
  $('rm-min').value = r.minMinutes ?? 30;
  $('rm-max').value = r.maxMinutes ?? 60;
  $('rm-messages').value = (Array.isArray(r.messages) ? r.messages : []).join('\n');
}

// ================= 事件绑定 =================
function bind() {
  $$('nav button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  $('cal-prev').addEventListener('click', () => {
    calM--;
    if (calM < 1) { calM = 12; calY--; }
    refreshTab('calendar', true);
  });
  $('cal-next').addEventListener('click', () => {
    calM++;
    if (calM > 12) { calM = 1; calY++; }
    refreshTab('calendar', true);
  });
  $('cal-today').addEventListener('click', () => {
    const d = new Date();
    calY = d.getFullYear();
    calM = d.getMonth() + 1;
    selectedDk = dateKey(d);
    refreshTab('calendar', true);
  });

  $('once-save').addEventListener('click', async () => {
    const raw = readOnceForm('once');
    if (editingOnceId) {
      const r = await rpc.updatePlan(editingOnceId, raw);
      if (!r.ok) return toast(r.error, true);
      toast('已保存修改');
    } else {
      const r = await rpc.addPlan('once', raw);
      if (!r.ok) return toast(r.error, true);
      toast('已添加，当天会提醒');
      ['title', 'start', 'end', 'note'].forEach((k) => ($('once-' + k).value = ''));
    }
    editingOnceId = null;
    refreshTab('calendar', true);
    renderedOnce.today = false;
  });
  $('once-cancel').addEventListener('click', () => {
    editingOnceId = null;
    ['title', 'start', 'end', 'note'].forEach((k) => ($('once-' + k).value = ''));
    renderDayEditor();
  });

  for (const mode of ['daily', 'weekly', 'once2']) {
    $(mode + '-save').addEventListener('click', () => saveSection(mode));
  }

  $('json-load').addEventListener('click', async () => {
    $('json-text').value = await rpc.exportPlans();
    jsonMsg('已载入当前计划', true);
  });
  $('json-file').addEventListener('click', async () => {
    const r = await rpc.importPlansFile();
    if (r.canceled) return;
    if (!r.ok) return jsonMsg((r.errors || ['读取失败']).join('\n'), false);
    $('json-text').value = r.text;
    jsonMsg('文件已载入，检查无误后点「应用到应用」', true);
  });
  $('json-apply').addEventListener('click', async () => {
    const text = $('json-text').value;
    const strategy = $('json-strategy').value;
    const r = await rpc.importPlans(text, strategy);
    if (!r.ok) return jsonMsg('导入失败：\n' + (r.errors || []).join('\n'), false);
    jsonMsg(`导入成功，共 ${r.count} 条（${strategy === 'replace' ? '已替换全部' : '已合并'}）`, true);
    toast('计划已更新，猫猫马上生效');
    renderedOnce.today = false;
    renderedOnce.plans = false;
    renderedOnce.calendar = false;
  });
  $('json-save').addEventListener('click', async () => {
    const r = await rpc.exportPlansFile($('json-text').value);
    if (r.ok) toast('已导出到 ' + r.path);
  });
  $('json-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('json-text').value);
      toast('已复制到剪贴板');
    } catch {
      toast('复制失败，请手动选择复制', true);
    }
  });

  $('pack-import').addEventListener('click', async () => {
    const r = await rpc.importPack();
    if (r.canceled) return;
    if (!r.ok) return toast((r.errors || ['导入失败']).join('；'), true);
    toast(`资源包「${r.name}」导入成功${(r.warnings || []).length ? '（' + r.warnings.join('；') + '）' : ''}`);
    refreshTab('packs', true);
  });
  $('scale-range').addEventListener('input', () => {
    $('scale-val').textContent = Math.round(Number($('scale-range').value) * 100) + '%';
  });
  $('scale-range').addEventListener('change', async () => {
    await rpc.setSettings({ petScale: Number($('scale-range').value) });
  });

  $('set-top').addEventListener('change', (e) => rpc.setSettings({ alwaysOnTop: e.target.checked }));
  $('set-bubble').addEventListener('change', (e) => rpc.setSettings({ bubbleEnabled: e.target.checked }));
  $('set-remindface').addEventListener('change', (e) => rpc.setSettings({ remindFace: e.target.checked }));
  $('set-paw').addEventListener('change', (e) => rpc.setSettings({ pawAnimation: e.target.checked }));
  $('set-autostart').addEventListener('change', (e) => rpc.setSettings({ autostart: e.target.checked }));
  $('set-gpu').addEventListener('change', async (e) => {
    await rpc.setSettings({ disableGpu: e.target.checked });
    toast('已保存，重启应用后生效', false);
  });

  // ---- 空闲提醒 ----
  $('set-reminder').addEventListener('change', async (e) => {
    const s = await rpc.getSettings();
    const r = { ...(s.idleReminder || {}), enabled: e.target.checked };
    await rpc.setSettings({ idleReminder: r });
    await rpc.resetReminder();
    toast(e.target.checked ? '已启用空闲提醒' : '已关闭空闲提醒');
  });
  $('rm-test').addEventListener('click', async () => {
    await rpc.testReminder();
    toast('已发送一条随机提醒（看桌宠气泡）');
  });
  $('rm-save').addEventListener('click', async () => {
    const messages = $('rm-messages').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 50);
    let min = Math.max(1, Number($('rm-min').value) || 30);
    let max = Math.max(1, Number($('rm-max').value) || 60);
    if (min > max) [min, max] = [max, min];
    const s = await rpc.getSettings();
    const r = { ...(s.idleReminder || {}), minMinutes: min, maxMinutes: max, messages: messages.length ? messages : ['多喝水 💧'] };
    await rpc.setSettings({ idleReminder: r });
    await rpc.resetReminder();
    $('rm-min').value = min;
    $('rm-max').value = max;
    await renderSettings();
    toast('提醒设置已保存');
  });
  $('open-data').addEventListener('click', () => rpc.openDataDir());
  $('quit-app').addEventListener('click', () => rpc.quitApp());

  rpc.on('panel:navigate', (tab) => switchTab(tab));
  rpc.on('plans-changed', () => {
    renderedOnce.today = false;
    renderedOnce.plans = false;
    renderedOnce.calendar = false;
    refreshTab(activeTab, true);
  });
  rpc.on('settings-changed', async () => {
    if (activeTab === 'settings') await renderSettings();
  });

  // 面板隐藏到托盘时销毁 Live2D 预览渲染器（不留后台渲染开销）
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    while (l2dPreviewApps.length) {
      try { l2dPreviewApps.pop().destroy(false, { children: true, texture: true, baseTexture: true }); } catch { /* noop */ }
    }
    renderedOnce.packs = false; // 再次打开外观页时重新渲染预览
  });
}

buildWeekdayPicker();
bind();
renderedOnce.today = false;
switchTab('today');
