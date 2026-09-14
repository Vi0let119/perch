// 计划 CRUD、按日解析、勾选状态、导入导出
const fs = require('fs');
const crypto = require('crypto');
const { Store } = require('./store');
const schema = require('../shared/schema');

const CHECK_KEEP_DAYS = 120; // 勾选记录保留天数

class PlanManager {
  constructor(userDataDir) {
    this.plansStore = new Store(userDataDir, 'plans.json', { daily: [], weekly: [], once: [] });
    this.stateStore = new Store(userDataDir, 'state.json', { checked: {} });
    const firstRun = !fs.existsSync(this.plansStore.file);
    this.plansStore.load();
    this.stateStore.load();
    if (firstRun) this._seedSamples();
    this._pruneChecked();
  }

  // 首次启动写入示例计划，方便理解格式
  _seedSamples() {
    const today = new Date();
    const dk = this.dateKey(today);
    const plusDays = (n) => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return this.dateKey(d);
    };
    this.plans.daily.push(
      { id: this.newId(), title: '喝水 100ml', start: '10:00', end: '10:10', note: '起来走动一下' },
      { id: this.newId(), title: '午休', start: '13:00', end: '13:40', note: '' },
      { id: this.newId(), title: '记得记录今天的花销', start: '', end: '', note: '' }
    );
    this.plans.weekly.push({ id: this.newId(), title: '周总结', weekdays: [5], start: '17:00', end: '18:00', note: '' });
    this.plans.once.push(
      { id: this.newId(), title: '示例便签：今天试试给猫猫打勾！', date: dk, start: '', end: '', note: '点击气泡或面板里的 ✓' },
      { id: this.newId(), title: '示例：三天后的待办', date: plusDays(3), start: '', end: '', note: '单次计划只会在指定日期出现' }
    );
    this.plansStore.save();
  }

  get plans() {
    return this.plansStore.get();
  }

  dateKey(d = new Date()) {
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  nowMinutes(d = new Date()) {
    return d.getHours() * 60 + d.getMinutes();
  }

  newId() {
    return crypto.randomBytes(6).toString('hex');
  }

  _pruneChecked() {
    const checked = this.stateStore.get().checked;
    const cutoff = Date.now() - CHECK_KEEP_DAYS * 86400e3;
    for (const pid of Object.keys(checked)) {
      for (const dk of Object.keys(checked[pid])) {
        if (new Date(dk + 'T00:00:00').getTime() < cutoff) delete checked[pid][dk];
      }
      if (Object.keys(checked[pid]).length === 0) delete checked[pid];
    }
    this.stateStore.save();
  }

  // ---- CRUD ----
  addPlan(mode, raw) {
    const r = schema.normalizePlan(mode, raw);
    if (!r.ok) return { ok: false, error: r.error };
    r.plan.id = this.newId();
    this.plans[mode].push(r.plan);
    this.plansStore.save();
    return { ok: true, plan: r.plan };
  }

  updatePlan(id, raw) {
    for (const mode of schema.MODES) {
      const idx = this.plans[mode].findIndex((p) => p.id === id);
      if (idx === -1) continue;
      const r = schema.normalizePlan(mode, { ...this.plans[mode][idx], ...raw });
      if (!r.ok) return { ok: false, error: r.error };
      r.plan.id = id;
      this.plans[mode][idx] = r.plan;
      this.plansStore.save();
      return { ok: true, plan: r.plan };
    }
    return { ok: false, error: '计划不存在' };
  }

  deletePlan(id) {
    for (const mode of schema.MODES) {
      const idx = this.plans[mode].findIndex((p) => p.id === id);
      if (idx !== -1) {
        this.plans[mode].splice(idx, 1);
        delete this.stateStore.get().checked[id];
        this.plansStore.save();
        this.stateStore.save();
        return { ok: true };
      }
    }
    return { ok: false, error: '计划不存在' };
  }

  // ---- 勾选 ----
  isChecked(id, dk) {
    return !!(this.stateStore.get().checked[id] && this.stateStore.get().checked[id][dk]);
  }

  setChecked(id, dk, val) {
    const checked = this.stateStore.get().checked;
    if (val) {
      if (!checked[id]) checked[id] = {};
      checked[id][dk] = true;
    } else if (checked[id]) {
      delete checked[id][dk];
      if (Object.keys(checked[id]).length === 0) delete checked[id];
    }
    this.stateStore.save();
  }

  // ---- 按日解析 ----
  // 返回该日期的全部计划条目（含勾选状态），全天在前、时间段按开始时间排序
  resolveDay(dk) {
    const d = new Date(dk + 'T00:00:00');
    const weekday = d.getDay();
    const items = [];
    for (const p of this.plans.daily) {
      items.push(this._item(p, 'daily', dk));
    }
    for (const p of this.plans.weekly) {
      if (p.weekdays.includes(weekday)) items.push(this._item(p, 'weekly', dk));
    }
    for (const p of this.plans.once) {
      if (p.date === dk) items.push(this._item(p, 'once', dk));
    }
    items.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return schema.timeToMinutes(a.start || '00:00') - schema.timeToMinutes(b.start || '00:00');
    });
    return items;
  }

  _item(p, mode, dk) {
    return {
      id: p.id,
      mode,
      title: p.title,
      start: p.start || '',
      end: p.end || '',
      allDay: !p.start,
      note: p.note || '',
      weekdays: p.weekdays,
      checked: this.isChecked(p.id, dk),
    };
  }

  // 日历月视图：{ "2026-09-13": {count, allDayCount} }
  resolveMonth(year, month) {
    const days = new Date(year, month, 0).getDate(); // month: 1-12
    const map = {};
    for (let day = 1; day <= days; day++) {
      const dk = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const items = this.resolveDay(dk);
      if (items.length) {
        map[dk] = { count: items.length, allDayCount: items.filter((i) => i.allDay).length };
      }
    }
    return map;
  }

  // ---- 导入 / 导出 ----
  exportJson() {
    const out = { version: 1, daily: [], weekly: [], once: [] };
    for (const mode of schema.MODES) {
      out[mode] = this.plans[mode].map((p) => {
        const o = {};
        if (mode === 'weekly') o.weekdays = p.weekdays;
        if (mode === 'once') o.date = p.date;
        o.title = p.title;
        o.start = p.start || '';
        o.end = p.end || '';
        o.note = p.note || '';
        return o;
      });
    }
    return JSON.stringify(out, null, 2);
  }

  // strategy: 'merge' | 'replace'
  importJson(text, strategy) {
    let input;
    try {
      input = JSON.parse(text);
    } catch (e) {
      return { ok: false, errors: ['JSON 解析失败：' + e.message] };
    }
    const v = schema.validatePlansData(input);
    if (!v.ok) return { ok: false, errors: v.errors };

    if (strategy === 'replace') {
      this.plans.daily = [];
      this.plans.weekly = [];
      this.plans.once = [];
      this.stateStore.get().checked = {};
    }
    let count = 0;
    for (const mode of schema.MODES) {
      for (const plan of v.data[mode]) {
        if (plan.id && this.plans[mode].some((p) => p.id === plan.id)) {
          // 同 id 覆盖
          const idx = this.plans[mode].findIndex((p) => p.id === plan.id);
          this.plans[mode][idx] = plan;
        } else {
          plan.id = this.newId();
          this.plans[mode].push(plan);
        }
        count++;
      }
    }
    this.plansStore.save();
    this.stateStore.save();
    return { ok: true, count };
  }

  exportFile() {
    return JSON.stringify(this.plans, null, 2);
  }
}

module.exports = { PlanManager };
