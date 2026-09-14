// 窗口管理：桌宠窗（透明置顶可拖拽）+ 管理面板窗
const path = require('path');
const { BrowserWindow, Menu, screen, ipcMain, app } = require('electron');

const PET_W = 460;
const PET_H = 520;

class WindowManager {
  constructor(ctx) {
    this.ctx = ctx; // { settings, scheduler, planManager, packManager }
    this.petWin = null;
    this.panelWin = null;
    this.drag = null;
  }

  iconPath() {
    return path.join(this.ctx.assetsDir, 'icon.png');
  }

  // 渲染进程异常退出时自动重载，避免白屏/掉样式后无法恢复
  // 连续崩溃 2 次才重载（单次崩溃交给 WebContents 自恢复），避免打字途中被重载吞掉输入
  guardRenderer(win, name) {
    let goneCount = 0;
    win.webContents.on('render-process-gone', (e, details) => {
      console.error(`[${name}] renderer gone:`, details.reason);
      if (details.reason === 'clean-exit') return;
      goneCount++;
      if (goneCount >= 2) {
        goneCount = 0;
        setTimeout(() => !win.isDestroyed() && win.reload(), 1500);
      }
    });
    win.webContents.on('unresponsive', () => console.error(`[${name}] renderer unresponsive`));
  }

  createPet() {
    const s = this.ctx.settings.get();
    const wa = screen.getPrimaryDisplay().workArea;
    let pos = s.position || { x: wa.x + wa.width - PET_W - 24, y: wa.y + wa.height - PET_H - 24 };
    // 边界校正：保存的位置不在当前可见屏幕内时（换分辨率/显示器），回退默认位置
    const displays = screen.getAllDisplays();
    const onScreen = displays.some((d) => {
      const a = d.workArea;
      return pos.x + 60 >= a.x && pos.x + PET_W - 60 <= a.x + a.width && pos.y + 60 >= a.y && pos.y + PET_H - 60 <= a.y + a.height;
    });
    if (!onScreen) pos = { x: wa.x + wa.width - PET_W - 24, y: wa.y + wa.height - PET_H - 24 };

    this.petWin = new BrowserWindow({
      width: PET_W,
      height: PET_H,
      x: pos.x,
      y: pos.y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false, // 手动实现拖动，避免与点击检测冲突
      focusable: false, // 桌宠只需鼠标事件，不要抢走面板输入框的键盘焦点
      hasShadow: false,
      skipTaskbar: true,
      alwaysOnTop: s.alwaysOnTop !== false,
      icon: this.iconPath(),
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.petWin.setIgnoreMouseEvents(true, { forward: true });
    this.petWin.webContents.setFrameRate(24); // 软渲染限帧，降低 CPU 占用
    this.petWin.loadFile(path.join(__dirname, '..', 'renderer', 'pet', 'index.html'));
    this.guardRenderer(this.petWin, 'pet');
    this.petWin.on('closed', () => { this.petWin = null; });

    // ---- 拖拽：渲染进程提供光标屏幕坐标，主进程按「按下时的窗口位置 + 位移增量」定位 ----
    // 不用 screen.getCursorScreenPoint() 轮询：异步采样偏差会造成拖动滞后与边缘漂移
    ipcMain.on('pet:drag-start', (e, sx, sy) => {
      if (!this.petWin) return;
      this.drag = { sx: Number(sx) || 0, sy: Number(sy) || 0, pos: this.petWin.getPosition() };
      this.touchDragWatchdog();
    });
    ipcMain.on('pet:drag-move', (e, sx, sy) => {
      if (!this.drag || !this.petWin) return;
      const x = this.drag.pos[0] + (Number(sx) || 0) - this.drag.sx;
      const y = this.drag.pos[1] + (Number(sy) || 0) - this.drag.sy;
      this.petWin.setPosition(Math.round(x), Math.round(y));
      this.touchDragWatchdog();
    });
    ipcMain.on('pet:drag-end', () => this.endDrag());
    ipcMain.on('pet:set-clickthrough', (e, val) => {
      if (this.petWin) this.petWin.setIgnoreMouseEvents(!!val, { forward: true });
    });
    // 重新确保透明窗口属性（GPU 进程重启或渲染器重载后透明可能失效变白底）
    ipcMain.on('pet:fix-transparency', () => {
      if (this.petWin && !this.petWin.isDestroyed()) {
        try { this.petWin.setBackgroundColor('#00000000'); } catch { /* 忽略 */ }
      }
    });
    ipcMain.on('pet:context-menu', () => this.petContextMenu());
    return this.petWin;
  }

  // 拖动看门狗：渲染进程若因穿透/失焦等原因漏发 drag-end，600ms 无消息即自动收尾，
  // 避免窗口无限跟随光标缓慢漂移
  touchDragWatchdog() {
    clearTimeout(this.dragWatchdog);
    this.dragWatchdog = setTimeout(() => this.endDrag(), 600);
  }

  endDrag() {
    clearTimeout(this.dragWatchdog);
    if (!this.drag) return;
    this.drag = null;
    if (this.petWin && !this.petWin.isDestroyed()) {
      const [x, y] = this.petWin.getPosition();
      this.ctx.settings.update({ position: { x, y } });
    }
    if (this.petWin && !this.petWin.isDestroyed()) {
      this.petWin.webContents.send('drag-stopped');
    }
  }

  petContextMenu() {
    if (!this.petWin) return;
    const s = this.ctx.settings.get();
    const menu = Menu.buildFromTemplate([
      { label: '今日计划', click: () => this.showPanel('today') },
      { label: '管理面板', click: () => this.showPanel('plans') },
      { type: 'separator' },
      { label: '窗口置顶', type: 'checkbox', checked: s.alwaysOnTop !== false, click: (item) => this.ctx.applyAlwaysOnTop(item.checked) },
      { type: 'separator' },
      { label: '退出', click: () => this.ctx.quitApp() },
    ]);
    menu.popup({ window: this.petWin });
  }

  createPanel() {
    this.panelWin = new BrowserWindow({
      width: 1000,
      height: 700,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#f6f4f0',
      title: 'Perch · 管理面板',
      icon: this.iconPath(),
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    // 无可见菜单栏，但保留编辑加速键（Ctrl+C/V/X/Z/A）——否则面板输入框"点了没反应"
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' },
          { role: 'selectAll', label: '全选' },
        ],
      },
    ]));
    this.panelWin.loadFile(path.join(__dirname, '..', 'renderer', 'panel', 'index.html'));
    this.guardRenderer(this.panelWin, 'panel');
    // 关闭 = 隐藏到托盘
    this.panelWin.on('close', (e) => {
      if (!this.ctx.isQuitting()) {
        e.preventDefault();
        this.panelWin.hide();
      }
    });
    // 面板在前台时取消桌宠置顶：避免置顶的桌宠窗口遮挡面板、吞掉面板上的点击
    this.panelWin.on('focus', () => this.setPetTopmostSuspended(true));
    this.panelWin.on('blur', () => this.setPetTopmostSuspended(false));
    this.panelWin.on('hide', () => this.setPetTopmostSuspended(false));
    return this.panelWin;
  }

  // 临时让出桌宠的置顶权（面板需要在其上方交互时）
  setPetTopmostSuspended(suspend) {
    if (!this.petWin || this.petWin.isDestroyed()) return;
    const s = this.ctx.settings.get();
    try {
      this.petWin.setAlwaysOnTop(suspend ? false : s.alwaysOnTop !== false);
    } catch { /* 忽略 */ }
  }

  showPanel(tab) {
    if (!this.panelWin) this.createPanel();
    if (this.panelWin.isMinimized()) this.panelWin.restore();
    this.panelWin.show();
    this.panelWin.focus();
    if (tab) this.panelWin.webContents.send('panel:navigate', tab);
  }

  broadcast(channel, payload) {
    if (this.petWin && !this.petWin.isDestroyed()) this.petWin.webContents.send(channel, payload);
    if (this.panelWin && !this.panelWin.isDestroyed() && this.panelWin.isVisible()) {
      this.panelWin.webContents.send(channel, payload);
    }
  }

  savePetPosition() {
    if (this.petWin && !this.petWin.isDestroyed()) {
      const [x, y] = this.petWin.getPosition();
      this.ctx.settings.update({ position: { x, y } });
    }
  }
}

module.exports = { WindowManager, PET_W, PET_H };
