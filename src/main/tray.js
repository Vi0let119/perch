// 系统托盘
const path = require('path');
const { Tray, Menu, nativeImage } = require('electron');

class TrayManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.tray = null;
  }

  create() {
    const icon = nativeImage.createFromPath(path.join(this.ctx.assetsDir, 'icon.png')).resize({ width: 16, height: 16 });
    this.tray = new Tray(icon);
    this.tray.setToolTip('Perch · 桌面计划伴侣');
    this.rebuild();
  }

  rebuild() {
    if (!this.tray) return;
    const autostart = this.ctx.app.getLoginItemSettings().openAtLogin;
    const menu = Menu.buildFromTemplate([
      { label: '今日计划', click: () => this.ctx.win.showPanel('today') },
      { label: '管理面板', click: () => this.ctx.win.showPanel('plans') },
      { type: 'separator' },
      { label: '开机自启', type: 'checkbox', checked: autostart, click: (item) => this.ctx.applyAutostart(item.checked) },
      { type: 'separator' },
      { label: '退出', click: () => this.ctx.quitApp() },
    ]);
    this.tray.setContextMenu(menu);
  }
}

module.exports = { TrayManager };
