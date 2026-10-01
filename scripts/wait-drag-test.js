// 守候式拖动验证：等待光标静止（无人使用电脑）后自动运行拖动测试
// 用法: node scripts/wait-drag-test.js   结果写入 build-tests/drag-result.json
const fs = require('fs');
const { execSync } = require('child_process');

const IDLE_MS = 20000;      // 光标静止这么久才视为无人使用
const TIMEOUT_MS = 30 * 60 * 1000;  // 最多等 30 分钟
const cursorPos = () => {
  const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cursor.ps1 "get"`).toString().trim();
  const [x, y] = out.split(',').map(Number);
  return { x, y };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const started = Date.now();
  process.stdout.write('等待光标静止');
  let last = cursorPos();
  let lastMove = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    await sleep(2000);
    const cur = cursorPos();
    if (cur.x !== last.x || cur.y !== last.y) {
      last = cur;
      lastMove = Date.now();
      process.stdout.write('.');
      continue;
    }
    if (Date.now() - lastMove >= IDLE_MS) break;   // 静止够了
  }
  if (Date.now() - started >= TIMEOUT_MS) {
    fs.writeFileSync('build-tests/drag-result.json', JSON.stringify({ ok: false, reason: 'timeout' }));
    process.exit(1);
  }
  console.log('\n电脑空闲，开始拖动验证…');

  // 确定沙箱窗口位置（通过远程调试端口读 window.screenX）
  const http = require('http');
  const targets = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let s = '';
      res.on('data', (d) => (s += d));
      res.on('end', () => resolve(JSON.parse(s)));
    }).on('error', reject);
  });
  const pet = targets.find((t) => t.type === 'page' && !/管理面板/.test(t.title));
  if (!pet) { fs.writeFileSync('build-tests/drag-result.json', JSON.stringify({ ok: false, reason: 'no pet page' })); process.exit(1); }

  // 读窗口位置与尺寸
  const ws = new WebSocket(pet.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const win = await new Promise((resolve) => {
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 1) resolve(msg.result.result.value);
    });
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '({x:window.screenX,y:window.screenY,w:window.innerWidth,h:window.innerHeight})', returnByValue: true } }));
  });
  // 猫的命中点：窗口下半部中心
  const petX = win.x + Math.round(win.w / 2) + 30;
  const petY = win.y + win.h - 60;
  ws.close();

  // 检测窗口在哪块屏（主屏 1.0 / 笔记本屏 1.5）
  const onLaptop = petX < 0;
  // 跨屏测试：把窗口从当前位置拖到笔记本屏（物理 = DIP × 1.5，笔记本屏在主屏左侧负坐标区）
  // 若窗口已在笔记本屏则直接在该屏测试
  const targetArg = onLaptop
    ? `${petX} ${petY}`
    : `${Math.round(-1000 * 1.5)} ${Math.round(900 * 1.5)}`;
  const flags = [onLaptop ? '--laptop' : '', '--cross'].filter(Boolean).join(' ');

  // 跑测试（复用 test-drag.js）
  const out = execSync(`node scripts/test-drag.js ${targetArg} ${flags}`, { encoding: 'utf8', cwd: process.cwd() });
  fs.writeFileSync('build-tests/drag-result.json', JSON.stringify({ ok: true, screen: onLaptop ? 'laptop(1.5x)' : 'primary(1.0x)', output: out }, null, 2));
  console.log('验证完成，结果已写入 build-tests/drag-result.json');
  process.exit(0);
})().catch((e) => {
  fs.writeFileSync('build-tests/drag-result.json', JSON.stringify({ ok: false, reason: e.message }));
  process.exit(1);
});
