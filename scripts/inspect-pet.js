// 通过 Chrome DevTools Protocol 读取渲染层的真实 DOM 状态（用于自动化验证）
// 用法: node scripts/inspect-pet.js "<JS表达式>" [--panel]
const http = require('http');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let s = '';
      res.on('data', (d) => (s += d));
      res.on('end', () => {
        try { resolve(JSON.parse(s)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const args = process.argv.slice(2);
const wantPanel = args.includes('--panel');
const expr = args.find((a) => !a.startsWith('--')) || '1';

(async () => {
  const targets = await getTargets();
  // 桌宠页：标题不含"管理面板"；面板页：标题含"管理面板"
  const page = targets.find((t) => t.type === 'page' && (/管理面板/.test(t.title) === wantPanel));
  if (!page) {
    console.log('未找到目标渲染页:', targets.map((t) => t.title));
    process.exit(1);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  await new Promise((r) => ws.addEventListener('open', r));
  const res = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  const r = res.result || {};
  if (r.exceptionDetails) console.log('执行异常:', JSON.stringify(r.exceptionDetails.exception));
  else console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('失败:', e.message); process.exit(1); });
