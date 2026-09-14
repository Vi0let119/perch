// 计划数据校验 —— 主进程与渲染进程共用（UMD）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PetSchema = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIME_RE = /^(\d{1,2}):(\d{2})$/;
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const MODES = ['daily', 'weekly', 'once'];

  function normalizeTime(s) {
    if (s === undefined || s === null) return '';
    const str = String(s).trim();
    if (str === '') return '';
    const m = TIME_RE.exec(str);
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  }

  function timeToMinutes(t) {
    const m = TIME_RE.exec(t);
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function isValidDate(s) {
    const m = DATE_RE.exec(String(s || '').trim());
    if (!m) return false;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
  }

  function cleanText(v, maxLen) {
    if (v === undefined || v === null) return '';
    return String(v).trim().slice(0, maxLen);
  }

  // 校验并规范化一条计划。返回 { ok, plan, error }
  // mode: daily | weekly | once；raw 为用户输入对象
  function normalizePlan(mode, raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: '不是有效的对象' };
    const title = cleanText(raw.title, 100);
    if (!title) return { ok: false, error: '标题不能为空' };

    const start = normalizeTime(raw.start);
    const end = normalizeTime(raw.end);
    if (raw.start && start === null) return { ok: false, error: `开始时间「${raw.start}」格式应为 HH:MM` };
    if (raw.end && end === null) return { ok: false, error: `结束时间「${raw.end}」格式应为 HH:MM` };
    if (start && !end) return { ok: false, error: '填写了开始时间时，结束时间也必填' };
    if (!start && end) return { ok: false, error: '填写了结束时间时，开始时间也必填' };
    if (start && end && timeToMinutes(end) <= timeToMinutes(start)) {
      return { ok: false, error: '结束时间必须晚于开始时间（不支持跨天）' };
    }

    const plan = { title, start, end, note: cleanText(raw.note, 500) };
    if (raw.id !== undefined && raw.id !== null && raw.id !== '') plan.id = String(raw.id);

    if (mode === 'weekly') {
      let wd = raw.weekdays;
      if (!Array.isArray(wd) || wd.length === 0) return { ok: false, error: '每周计划必须提供 weekdays 数组（0=周日 … 6=周六）' };
      wd = [...new Set(wd.map(Number))].sort((a, b) => a - b);
      if (wd.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) {
        return { ok: false, error: 'weekdays 只能是 0-6 的数字（0=周日 … 6=周六）' };
      }
      plan.weekdays = wd;
    } else if (mode === 'once') {
      const date = String(raw.date || '').trim();
      if (!isValidDate(date)) return { ok: false, error: `日期「${raw.date}」无效，应为 YYYY-MM-DD` };
      plan.date = date;
    }
    return { ok: true, plan };
  }

  // 校验一整份导入/导出的计划数据
  // 返回 { ok, errors:[string], data:{daily,weekly,once} }
  function validatePlansData(input) {
    const errors = [];
    const data = { daily: [], weekly: [], once: [] };
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, errors: ['顶层必须是一个 JSON 对象 { "daily": [...], "weekly": [...], "once": [...] }'], data };
    }
    for (const mode of MODES) {
      const arr = input[mode];
      if (arr === undefined) continue;
      if (!Array.isArray(arr)) {
        errors.push(`「${mode}」必须是数组`);
        continue;
      }
      arr.forEach((raw, i) => {
        const r = normalizePlan(mode, raw);
        if (r.ok) data[mode].push(r.plan);
        else errors.push(`${mode}[${i}] ${r.error}`);
      });
    }
    const unknown = Object.keys(input).filter((k) => !MODES.includes(k) && k !== 'version');
    if (unknown.length) errors.push(`未知字段：${unknown.join('、')}（允许的字段：version/daily/weekly/once）`);
    return { ok: errors.length === 0, errors, data };
  }

  const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const MODE_NAMES = { daily: '每日', weekly: '每周', once: '单次' };

  return {
    MODES,
    MODE_NAMES,
    WEEKDAY_NAMES,
    normalizeTime,
    normalizePlan,
    timeToMinutes,
    isValidDate,
    validatePlansData,
  };
});
