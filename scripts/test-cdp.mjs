import { spawn } from 'child_process';
import fs from 'fs';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'D:\\ReferralSystem\\.tmp_edge_profile';

async function testEdge() {
  console.log('Starting Edge headless with CDP...');
  const edge = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  // Wait for 9222 to be ready
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) {
        ready = true;
        break;
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (!ready) {
    console.error('Edge failed to open port 9222');
    edge.kill();
    process.exit(1);
  }

  console.log('Edge is listening on 9222. Creating new tab...');
  const targetRes = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
  const target = await targetRes.json();
  console.log('Tab created. Connecting WebSocket:', target.webSocketDebuggerUrl);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  console.log('WebSocket connected successfully!');
  
  let msgId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  const evalRes = await send('Runtime.evaluate', { expression: 'navigator.userAgent' });
  console.log('User Agent in headless Edge:', evalRes.result.value);

  ws.close();
  edge.kill();
  console.log('Test CDP passed successfully!');
}

testEdge().catch(err => {
  console.error('Error testing Edge CDP:', err);
  process.exit(1);
});

