// 拖动端到端验证（紧凑版，数秒内跑完以避开真实鼠标干扰）
// 用法: node scripts/test-drag.js <猫屏幕坐标X> <猫屏幕坐标Y> [onLaptop]
// 需先以 --remote-debugging-port=9222 启动应用
const http = require('http');
const { execSync } = require('child_process');

const TARGET_X = Number(process.argv[2]) || 0;
const TARGET_Y = Number(process.argv[3]) || 0;
const ON_LAPTOP = process.argv.includes('--laptop');
const CROSS = process.argv.includes('--cross');   // 从当前窗口位置把窗口拖到目标点（可跨屏）
const SF = ON_LAPTOP ? 1.5 : 1.0;   // 该屏的缩放系数
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cursor = (cmd) => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cursor.ps1 "${cmd}"`).toString().trim();

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let s = '';
      res.on('data', (d) => (s += d));
      res.on('end', () => resolve(JSON.parse(s)));
    }).on('error', reject);
  });
}

(async () => {
  const targets = await getTargets();
  const pet = targets.find((t) => t.type === 'page' && !/管理面板/.test(t.title));
  const ws = new WebSocket(pet.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((resolve) => {
    const m = ++id;
    pending.set(m, resolve);
    ws.send(JSON.stringify({ id: m, method, params }));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception));
    return r.result.result.value;
  };
  const input = (type) => send('Input.dispatchMouseEvent', { type, x: 280, y: 460, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });

  console.log(`== 目标点(${TARGET_X},${TARGET_Y}) 该屏缩放 ${SF}${CROSS ? ' [跨屏模式]' : ''} ==`);
  // 光标移到猫身（setget 同进程确认），读窗口位置
  const c0 = cursor(`setget ${TARGET_X} ${TARGET_Y}`).split(',').map(Number);
  const w0 = await evalJs('({x:window.screenX,y:window.screenY})');
  await input('mousePressed');
  await sleep(150);

  if (CROSS) {
    // 跨屏：先一口气把光标移到目标屏（窗口应跟过去），再在该屏做小位移与静止测试
    cursor(`set ${TARGET_X} ${TARGET_Y}`);
    await sleep(700);
    const wCross = await evalJs('({x:window.screenX,y:window.screenY})');
    console.log(`跨屏后窗口: (${wCross.x},${wCross.y})`);
  }

  // 拖动：光标 +60,+40 物理
  const cBase = cursor('get').split(',').map(Number);
  cursor(`set ${cBase[0] + 60} ${cBase[1] + 40}`);
  await sleep(400);
  const c1 = cursor('get').split(',').map(Number);
  const w1 = await evalJs('({x:window.screenX,y:window.screenY})');
  const wBase = CROSS ? await evalJs('({x:window.screenX,y:window.screenY})') : w0;
  const winDelta = { x: w1.x - wBase.x, y: w1.y - wBase.y };
  const curDip = { x: (c1[0] - cBase[0]) / SF, y: (c1[1] - cBase[1]) / SF };
  const cursorMoved = !(c1[0] === cBase[0] && c1[1] === cBase[1]);
  const moveOk = cursorMoved && Math.abs(winDelta.x - curDip.x) <= 1 && Math.abs(winDelta.y - curDip.y) <= 1;

  // 静止 1.2s：光标完全不动
  const wHold0 = await evalJs('({x:window.screenX,y:window.screenY})');
  await sleep(1200);
  const cHold = cursor('get').split(',').map(Number);
  const wHold1 = await evalJs('({x:window.screenX,y:window.screenY})');
  const drift = { x: wHold1.x - wHold0.x, y: wHold1.y - wHold0.y };
  const cursorStill = cHold[0] === cBase[0] + 60 && cHold[1] === cBase[1] + 40;
  const noDrift = drift.x === 0 && drift.y === 0;

  // 结束
  await input('mouseReleased');
  await sleep(200);
  const wEnd = await evalJs('({x:window.screenX,y:window.screenY})');

  console.log('拖动前窗口:', JSON.stringify(w0));
  console.log(`光标位移: 物理(${c1[0] - cBase[0]},${c1[1] - cBase[1]}) = DIP(${curDip.x.toFixed(1)},${curDip.y.toFixed(1)})`);
  console.log(`窗口位移: (${winDelta.x},${winDelta.y}) → ${moveOk ? '✓ 与光标一致' : cursorMoved ? '✗ 不一致' : '⚠ 光标被外部移动，本次无效'}`);
  console.log(`静止期: 光标${cursorStill ? '未动' : '被动过(漂移数据仅供参考)'} | 窗口漂移(${drift.x},${drift.y}) → ${noDrift ? '✓ 零漂移' : '✗ 有漂移'}`);
  console.log(`松开后窗口: (${wEnd.x},${wEnd.y})`);
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('失败:', e.message); process.exit(1); });
