// 渲染进程桥接：window.api
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  // 计划
  getPlans: () => ipcRenderer.invoke('plans:get'),
  addPlan: (mode, raw) => ipcRenderer.invoke('plan:add', mode, raw),
  updatePlan: (id, raw) => ipcRenderer.invoke('plan:update', id, raw),
  deletePlan: (id) => ipcRenderer.invoke('plan:delete', id),
  setChecked: (id, dk, val) => ipcRenderer.invoke('checked:set', id, dk, val),
  getDay: (dk) => ipcRenderer.invoke('day:get', dk),
  getMonth: (y, m) => ipcRenderer.invoke('month:get', y, m),
  exportPlans: () => ipcRenderer.invoke('plans:export'),
  importPlans: (text, strategy) => ipcRenderer.invoke('plans:import', text, strategy),
  importPlansFile: () => ipcRenderer.invoke('plans:import-file'),
  exportPlansFile: (text) => ipcRenderer.invoke('plans:export-file', text),

  // 资源包
  listPacks: () => ipcRenderer.invoke('packs:list'),
  packManifest: (id) => ipcRenderer.invoke('packs:manifest', id),
  importPack: () => ipcRenderer.invoke('packs:import'),
  deletePack: (id) => ipcRenderer.invoke('packs:delete', id),
  setActivePack: (id) => ipcRenderer.invoke('packs:set-active', id),
  // 皮肤自定义（参数开关 + 位置微调）
  getPackCustomParams: (id) => ipcRenderer.invoke('packs:custom-params', id),
  getPackUserConfig: (id) => ipcRenderer.invoke('packs:user-config', id),
  setPackUserParam: (id, paramId, value) => ipcRenderer.invoke('packs:set-user-param', id, paramId, value),
  setPackUserFit: (id, fit) => ipcRenderer.invoke('packs:set-user-fit', id, fit),
  reportParamMeta: (id, meta) => ipcRenderer.invoke('packs:report-param-meta', id, meta),

  // 空闲提醒
  testReminder: () => ipcRenderer.invoke('reminder:test'),
  resetReminder: () => ipcRenderer.invoke('reminder:reset'),
  getBubbleState: () => ipcRenderer.invoke('bubble:state'),

  // 桌宠运行时
  petRuntime: () => ipcRenderer.invoke('pet:runtime'),
  petClick: () => ipcRenderer.invoke('pet:click'),
  dragStart: (sx, sy) => ipcRenderer.send('pet:drag-start', sx, sy),
  dragMove: (sx, sy) => ipcRenderer.send('pet:drag-move', sx, sy),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  setClickThrough: (v) => ipcRenderer.send('pet:set-clickthrough', v),
  fixTransparency: () => ipcRenderer.send('pet:fix-transparency'),
  petContextMenu: () => ipcRenderer.send('pet:context-menu'),

  // 其他
  autostartGet: () => ipcRenderer.invoke('autostart:get'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  openDataDir: () => ipcRenderer.invoke('app:open-data'),

  // 事件订阅
  on(channel, fn) {
    const listener = (e, payload) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
