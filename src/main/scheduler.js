// 分钟级调度：计算气泡展示内容（进行中 + 全天 + 已过期 + 下一条预告）+ 空闲随机提醒
const schema = require('../shared/schema');
const { FitnessManager } = require('./fitness');

class Scheduler {
  constructor(planManager, settings, fitness) {
    this.pm = planManager;
    this.settings = settings;
    this.fitness = fitness;
    this.lastCurrentIds = new Set();
    this.timer = null;
    this.listeners = new Set();
    this.reminderListeners = new Set();
    this.lastStateJson = '';      // 状态去重：内容未变则不重复推送
    this.nextReminderAt = 0;      // 下一次空闲提醒的时间戳
  }

  start() {
    this.scheduleNextReminder();
    this.tick();
    this.timer = setInterval(() => this.tick(), 15 * 1000);
  }

  stop() {
    clearInterval(this.timer);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onReminder(fn) {
    this.reminderListeners.add(fn);
    return () => this.reminderListeners.delete(fn);
  }

  // 强制立刻重算（计划/勾选/设置变化后调用）；ignoringCache 时即使内容未变也推送
  refresh() {
    this.tick(true);
  }

  reminderConfig() {
    const r = this.settings.get().idleReminder || {};
    return {
      enabled: r.enabled !== false,
      minMinutes: Math.max(1, Number(r.minMinutes) || 30),
      maxMinutes: Math.max(1, Number(r.maxMinutes) || 60),
      messages: Array.isArray(r.messages) && r.messages.length ? r.messages : ['多喝水 💧'],
    };
  }

  scheduleNextReminder() {
    const { minMinutes, maxMinutes } = this.reminderConfig();
    const lo = Math.min(minMinutes, maxMinutes);
    const hi = Math.max(minMinutes, maxMinutes);
    const minutes = lo + Math.random() * (hi - lo);
    this.nextReminderAt = Date.now() + minutes * 60 * 1000;
  }

  // 手动触发一次（面板"立即测试"）
  fireReminderNow() {
    const { messages } = this.reminderConfig();
    this.emitReminder(messages[Math.floor(Math.random() * messages.length)]);
  }

  emitReminder(text) {
    for (const fn of this.reminderListeners) fn({ text, at: Date.now() });
  }

  compute() {
    const now = new Date();
    const dk = this.pm.dateKey(now);
    const minutes = this.pm.nowMinutes(now);
    const items = this.pm.resolveDay(dk);
    // 健身轮换：启用时当天始终显示当前部位（全天任务；勾选完成由 checked:set 推进指针）
    const fit = this.fitness && this.fitness.dayItem(this.pm, dk);
    if (fit) items.push(fit);
    const pending = items.filter((i) => !i.checked);

    const timed = pending.filter((i) => !i.allDay);
    const currentTimed = timed.filter((i) => schema.timeToMinutes(i.start) <= minutes && minutes < schema.timeToMinutes(i.end));
    const allDay = pending.filter((i) => i.allDay);
    // 已过期（结束时间已过但未勾选）：此前落在"进行中"与"未来"的过滤缝隙里被丢弃
    const overdue = timed
      .filter((i) => schema.timeToMinutes(i.end) <= minutes)
      .sort((a, b) => schema.timeToMinutes(a.end) - schema.timeToMinutes(b.end))
      .map((i) => ({ ...i, overdue: true }));
    const upcoming = timed
      .filter((i) => schema.timeToMinutes(i.start) > minutes)
      .sort((a, b) => schema.timeToMinutes(a.start) - schema.timeToMinutes(b.start));

    const currentIds = new Set(currentTimed.map((i) => i.id));
    const justStarted = timed.filter((i) => i.start && schema.timeToMinutes(i.start) === minutes).map((i) => i.id);
    this.lastCurrentIds = currentIds;

    const s = this.settings.get();
    const shown = [...currentTimed, ...allDay, ...overdue];
    const MAX = 8;
    return {
      dateKey: dk,
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      bubbleEnabled: s.bubbleEnabled !== false,
      current: shown.slice(0, MAX),
      currentOverflow: Math.max(0, shown.length - MAX),
      next: upcoming[0] || null,
      upcomingCount: upcoming.length,
      overdueCount: overdue.length,
      justStartedIds: justStarted,
      remindFace: s.remindFace !== false,
    };
  }

  tick(force) {
    const state = this.compute();
    // 空闲提醒：仅在完全空闲（无任何计划展示）且到达随机时间点时触发
    const cfg = this.reminderConfig();
    if (cfg.enabled && !state.current.length && !state.next && Date.now() >= this.nextReminderAt) {
      this.emitReminder(cfg.messages[Math.floor(Math.random() * cfg.messages.length)]);
      this.scheduleNextReminder();
    }

    // 去重：内容与关键字段未变化时不重复推送（避免每 15 秒重建气泡 DOM）
    const fingerprint = JSON.stringify([
      state.current.map((i) => [i.id, i.checked, i.overdue ? 1 : 0]),
      state.next ? state.next.id : null,
      state.bubbleEnabled,
      state.upcomingCount,
    ]);
    if (!force && fingerprint === this.lastStateJson) return;
    this.lastStateJson = fingerprint;
    for (const fn of this.listeners) fn(state);
  }
}

module.exports = { Scheduler };
