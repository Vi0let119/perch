// 健身轮换计划：部位序列按完成度推进（勾选完成才到下一个，没练完自动搁置）
const path = require('path');
const { Store } = require('./store');

// 健身任务在计划系统中的固定 id（resolveDay / 勾选推进都靠它识别）
const FITNESS_ID = 'fitness';

class FitnessManager {
  constructor(userDataDir) {
    this.store = new Store(userDataDir, 'fitness.json', {
      enabled: true,
      items: [],   // [{ name: '练胸', note: '' }, ...]，可含「休息」项
      index: 0,    // 当前轮到的下标
    });
  }

  get() {
    return this.store.get();
  }

  // 整体保存（面板组装好的配置）
  set(patch) {
    const cur = this.store.get();
    const next = { ...cur, ...patch };
    // 约束 index 在有效范围内
    const n = (next.items || []).length;
    next.index = Math.min(Math.max(0, Math.min(next.index ?? 0, n - 1)), Math.max(0, n - 1));
    if (n === 0) next.index = 0;
    this.store.data = next;
    this.store.save();
    return next;
  }

  isActive() {
    const f = this.store.get();
    return !!(f.enabled && f.items && f.items.length);
  }

  // 当天应显示的轮换项（未启用/无项返回 null）
  currentItem() {
    if (!this.isActive()) return null;
    const f = this.store.get();
    const item = f.items[Math.min(f.index, f.items.length - 1)];
    return { index: f.index, name: item.name, note: item.note || '' };
  }

  // 推进到下一个（勾选完成时调用）；dir: +1/-1（面板手动微调用）
  advance(dir = 1) {
    const f = this.store.get();
    const n = (f.items || []).length;
    if (!n) return f;
    f.index = ((f.index + dir) % n + n) % n;
    this.store.save();
    return f;
  }

  setIndex(i) {
    const f = this.store.get();
    const n = (f.items || []).length;
    if (!n) return f;
    f.index = ((i % n) + n) % n;
    this.store.save();
    return f;
  }

  reset() {
    return this.setIndex(0);
  }

  // 当天的健身任务对象（未启用/无项返回 null）；pm: PlanManager（读勾选状态）
  dayItem(pm, dk) {
    const f = this.currentItem();
    if (!f) return null;
    return {
      id: FITNESS_ID,
      mode: 'fitness',
      title: `🏋️ ${f.name}`,
      start: '',
      end: '',
      allDay: true,
      note: f.note || '',
      checked: pm.isChecked(FITNESS_ID, dk),
    };
  }
}

module.exports = { FitnessManager, FITNESS_ID };
