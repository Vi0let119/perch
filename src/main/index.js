// 主进程入口
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, clipboard } = require('electron');
const { pathToFileURL } = require('url');
const { Store } = require('./store');
const { PlanManager } = require('./plans');
const { PackManager } = require('./packs');
const { Scheduler } = require('./scheduler');
const { WindowManager } = require('./windows');
const { TrayManager } = require('./tray');

// petpack:// 自定义协议（资源包图片）
protocol.registerSchemesAsPrivileged([
  { scheme: 'petpack', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

// 规避第三方注入（如 Nahimic）与驱动异常导致的 GPU 进程崩溃掉样式问题。
// 是否禁用硬件加速由用户设置「兼容模式」决定，必须在 app ready 之前读取。
function readDisableGpu() {
  try {
    const dir = process.env.BP_USER_DATA ? path.resolve(process.env.BP_USER_DATA) : app.getPath('userData');
    const s = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
    return s.disableGpu !== false; // 默认开启兼容模式
  } catch {
    return true;
  }
}
if (readDisableGpu()) app.disableHardwareAcceleration();
// WebGL 软件回退授权（硬件加速不可用或已禁用时 Live2D 仍可渲染）
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
// 测试隔离：BP_USER_DATA 指定独立数据目录，可与正在运行的实例并存
if (process.env.BP_USER_DATA) app.setPath('userData', path.resolve(process.env.BP_USER_DATA));

// 改名迁移：应用原名「猫猫计划桌宠」，userData 目录随之从旧路径变为 %APPDATA%\Perch。
// 首次以新名字启动时，把旧目录里的数据（计划/勾选/设置/资源包）复制过来，避免用户数据"消失"。
// 采用复制而非移动，旧目录保留作备份。
function migrateUserData() {
  if (process.env.BP_USER_DATA) return; // 测试沙箱不迁移
  const newDir = app.getPath('userData');
  const oldDir = path.join(path.dirname(newDir), '猫猫计划桌宠');
  try {
    if (newDir === oldDir) return;
    if (fs.existsSync(path.join(newDir, 'plans.json'))) return; // 新目录已有数据
    if (!fs.existsSync(oldDir)) return;
    fs.mkdirSync(newDir, { recursive: true });
    for (const name of ['plans.json', 'state.json', 'settings.json', 'param-meta.json']) {
      const from = path.join(oldDir, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(newDir, name));
    }
    const oldPacks = path.join(oldDir, 'packs');
    if (fs.existsSync(oldPacks)) {
      fs.cpSync(oldPacks, path.join(newDir, 'packs'), { recursive: true });
    }
    console.log('[migrate] 已从旧数据目录迁移:', oldDir, '->', newDir);
  } catch (e) {
    console.error('[migrate] 迁移失败（将使用全新数据目录）:', e.message);
  }
}
migrateUserData();

process.on('uncaughtException', (e) => console.error('[main] uncaught:', e));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  boot();
}

function boot() {
  const ROOT = path.join(__dirname, '..', '..');
  const settings = new Store(app.getPath('userData'), 'settings.json', {
    packId: 'luoxi',
    petScale: 0.55,
    alwaysOnTop: true,
    bubbleEnabled: true,
    remindFace: true,
    pawAnimation: true,      // 爪子在键盘上敲击的空闲动画
    disableGpu: true,        // 兼容模式：禁用硬件加速（改为 false 可大幅降低 CPU，但可能白底）
    position: null,
    idleReminder: {
      enabled: true,
      minMinutes: 30,
      maxMinutes: 60,
      messages: ['多喝水 💧', '起来走走活动一下 🚶', '看看远方，让眼睛休息一下 👀', '站起来伸个懒腰 🙆'],
    },
  });

  let planManager, packManager, scheduler, win, tray;
  let quitting = false;

  app.on('second-instance', () => win && win.showPanel('plans'));
  app.on('before-quit', () => { quitting = true; win && win.savePetPosition(); });
  app.on('window-all-closed', () => { /* 保持后台运行，由托盘退出 */ });

  app.whenReady().then(() => {
    const userData = app.getPath('userData');
    const builtinPacks = app.isPackaged ? path.join(process.resourcesPath, 'packs') : path.join(ROOT, 'assets', 'packs');
    planManager = new PlanManager(userData);
    packManager = new PackManager(builtinPacks, path.join(userData, 'packs'));
    packManager.migratePacks();   // 补全早期导入的包（水印默认隐藏 / 手部参数校正）
    // 启动时校验激活的资源包是否仍存在（被删除则回退到内置 luoxi）
    {
      const s = settings.get();
      const check = packManager.loadPack(s.packId);
      if (!check.manifest) settings.update({ packId: 'luoxi' });
    }
    scheduler = new Scheduler(planManager, settings);
    win = new WindowManager({
      settings,
      scheduler,
      planManager,
      packManager,
      assetsDir: path.join(ROOT, 'assets'),
      app,
      isQuitting: () => quitting,
      quitApp,
      applyAutostart,
      applyAlwaysOnTop,
      showPanel: (t) => win.showPanel(t),
    });
    tray = new TrayManager({ assetsDir: path.join(ROOT, 'assets'), win, app, applyAutostart, quitApp });

    // ---- petpack 协议 ----
    protocol.handle('petpack', (req) => {
      try {
        const u = new URL(req.url);
        const file = packManager.resolveFile(u.hostname, decodeURIComponent(u.pathname.slice(1)));
        if (!file) return new Response(null, { status: 404 });
        return net.fetch(pathToFileURL(file).toString());
      } catch {
        return new Response(null, { status: 500 });
      }
    });

    registerIpc();
    win.createPet();
    win.createPanel();
    tray.create();
    // 先注册监听再启动：否则首次 tick 的状态会被去重逻辑吞掉，气泡收不到初始内容
    scheduler.onChange((state) => win.broadcast('bubble', state));
    // 空闲随机提醒（多喝水等）
    scheduler.onReminder((payload) => win.broadcast('idle-reminder', payload));
    scheduler.start();

    win.showPanel('today');
  });

  function quitApp() {
    quitting = true;
    win.savePetPosition();
    app.quit();
  }

  function applyAutostart(val) {
    app.setLoginItemSettings({
      openAtLogin: !!val,
      path: process.execPath,
      args: app.isPackaged ? [] : [path.resolve(process.argv[1] || '.')],
    });
    tray.rebuild();
  }

  function applyAlwaysOnTop(val) {
    settings.update({ alwaysOnTop: !!val });
    if (win.petWin) win.petWin.setAlwaysOnTop(!!val);
    tray.rebuild();
  }

  function changed() {
    scheduler.refresh();
    if (win.panelWin && win.panelWin.isVisible()) win.panelWin.webContents.send('plans-changed');
  }

  // ---- IPC ----
  function registerIpc() {
    const ok = (data) => ({ ok: true, ...data });

    ipcMain.handle('settings:get', () => settings.get());
    ipcMain.handle('settings:set', (e, patch) => {
      const before = settings.get();
      settings.update(patch);
      if (patch.alwaysOnTop !== undefined && patch.alwaysOnTop !== before.alwaysOnTop) applyAlwaysOnTop(patch.alwaysOnTop);
      if (patch.autostart !== undefined && patch.autostart !== before.autostart) applyAutostart(patch.autostart);
      win.broadcast('settings-changed', settings.get());
      scheduler.refresh();
      return ok();
    });

    ipcMain.handle('plans:get', () => planManager.plans);
    ipcMain.handle('plan:add', (e, mode, raw) => {
      const r = planManager.addPlan(mode, raw);
      if (r.ok) changed();
      return r;
    });
    ipcMain.handle('plan:update', (e, id, raw) => {
      const r = planManager.updatePlan(id, raw);
      if (r.ok) changed();
      return r;
    });
    ipcMain.handle('plan:delete', (e, id) => {
      const r = planManager.deletePlan(id);
      if (r.ok) changed();
      return r;
    });
    ipcMain.handle('checked:set', (e, id, dk, val) => {
      planManager.setChecked(id, dk, val);
      changed();
      return ok();
    });
    ipcMain.handle('day:get', (e, dk) => planManager.resolveDay(dk));
    ipcMain.handle('month:get', (e, y, m) => planManager.resolveMonth(y, m));
    ipcMain.handle('plans:export', () => planManager.exportJson());

    ipcMain.handle('plans:import', (e, text, strategy) => {
      const r = planManager.importJson(text, strategy === 'replace' ? 'replace' : 'merge');
      if (r.ok) changed();
      return r;
    });

    ipcMain.handle('plans:import-file', async () => {
      const r = await dialog.showOpenDialog(win.panelWin, {
        title: '导入计划 JSON',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      });
      if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
      try {
        return { ok: true, text: fs.readFileSync(r.filePaths[0], 'utf8'), path: r.filePaths[0] };
      } catch (err) {
        return { ok: false, errors: ['读取失败：' + err.message] };
      }
    });

    ipcMain.handle('plans:export-file', async (e, text) => {
      const r = await dialog.showSaveDialog(win.panelWin, {
        title: '导出计划 JSON',
        defaultPath: 'plans.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(r.filePath, text, 'utf8');
      return ok({ path: r.filePath });
    });

    // ---- 资源包 ----
    ipcMain.handle('packs:list', () => {
      const packs = packManager.listPacks();
      const s = settings.get();
      // 当前激活包若已被删除，回退到内置 luoxi
      if (!packs.some((p) => p.id === s.packId)) {
        settings.update({ packId: 'luoxi' });
      }
      return { packs, activeId: settings.get().packId };
    });

    ipcMain.handle('packs:import', async () => {
      const r = await dialog.showOpenDialog(win.panelWin, {
        title: '导入资源包（文件夹或 zip）',
        properties: ['openFile', 'openDirectory'],
      });
      if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
      const res = packManager.installFromPath(r.filePaths[0]);
      if (res.ok) win.broadcast('packs-changed');
      return res;
    });

    ipcMain.handle('packs:delete', (e, id) => {
      const r = packManager.deletePack(id);
      if (!r.ok) return r;
      if (settings.get().packId === id) settings.update({ packId: 'luoxi' });
      scheduler.refresh();
      win.broadcast('pack-changed');
      return ok();
    });

    ipcMain.handle('packs:set-active', (e, id) => {
      const { errors } = packManager.loadPack(id);
      if (errors && errors.length) return { ok: false, errors };
      settings.update({ packId: id });
      scheduler.refresh();
      win.broadcast('pack-changed');
      return ok();
    });

    ipcMain.handle('packs:manifest', (e, id) => {
      const { manifest, errors } = packManager.loadPack(id);
      return { manifest, errors };
    });

    // ---- 皮肤自定义（模型参数开关 + 位置微调，按皮肤持久化）----
    ipcMain.handle('packs:custom-params', (e, id) => packManager.listCustomParams(id));

    ipcMain.handle('packs:user-config', (e, id) => {
      const s = settings.get();
      return {
        params: (s.packParams && s.packParams[id]) || {},
        fit: (s.packFit && s.packFit[id]) || {},
      };
    });

    ipcMain.handle('packs:set-user-param', (e, id, paramId, value) => {
      const s = settings.get();
      const packParams = { ...(s.packParams || {}) };
      packParams[id] = { ...(packParams[id] || {}), [paramId]: value };
      settings.update({ packParams });
      if (win.petWin && !win.petWin.isDestroyed()) {
        win.petWin.webContents.send('pack-user-config', { packId: id, params: packParams[id] });
      }
      return { ok: true };
    });

    ipcMain.handle('packs:set-user-fit', (e, id, fit) => {
      const s = settings.get();
      const packFit = { ...(s.packFit || {}) };
      packFit[id] = fit;
      settings.update({ packFit });
      if (win.petWin && !win.petWin.isDestroyed()) {
        win.petWin.webContents.send('pack-user-config', { packId: id, fit, fitChanged: true });
      }
      return { ok: true };
    });

    // 渲染层上报参数元数据（真实 min/max/默认值）→ 面板用它显示开关的真实状态与取值
    ipcMain.handle('packs:report-param-meta', (e, id, meta) => {
      packManager.saveParamMeta(id, meta);
      return { ok: true };
    });

    // ---- 空闲提醒 ----
    ipcMain.handle('reminder:test', () => {
      scheduler.fireReminderNow();
      return { ok: true };
    });
    ipcMain.handle('reminder:reset', () => {
      scheduler.scheduleNextReminder();
      return { ok: true };
    });
    // 桌宠加载完成时主动拉取当前气泡状态（不必等下一次 tick）
    ipcMain.handle('bubble:state', () => scheduler.compute());

    // ---- 桌宠运行时（渲染层加载模型用）----
    ipcMain.handle('pet:runtime', () => {
      const s = settings.get();
      const { manifest, errors } = packManager.loadPack(s.packId);
      return {
        packId: s.packId,
        scale: s.petScale,
        manifest,
        errors,
        settings: {
          pawAnimation: s.pawAnimation !== false,
          bubbleEnabled: s.bubbleEnabled !== false,
          remindFace: s.remindFace !== false,
          disableGpu: s.disableGpu !== false,
        },
      };
    });

    ipcMain.handle('pet:click', () => win.showPanel('today'));
    ipcMain.handle('autostart:get', () => app.getLoginItemSettings().openAtLogin);
    ipcMain.handle('app:quit', () => quitApp());
    ipcMain.handle('app:open-data', () => shell.openPath(app.getPath('userData')));
  }
}
