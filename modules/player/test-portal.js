import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
process.env.PORT = '8134'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { const end = Date.now() + 8000; while (Date.now() < end) { if (fn()) return; await sleep(25); } assert.ok(fn(), 'condition reached'); }
const sockets = [];
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8134'), c = { ws }; sockets.push(ws);
  c.action = (name, data = {}) => ws.send(JSON.stringify({ t: 'action', name, data }));
  c.move = (x, y) => ws.send(JSON.stringify({ t: 'move', x, y, dir: { x: 1, y: 0 } }));
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'welcome') c.id = m.id; if (m.t === 'snap') c.snap = m; });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'hello', name })); await until(() => c.me()); return c;
}
try {
  const a = await connect('Traveler'), b = await connect('Observer'); let p = game.entities.get(a.id);
  for (let y = 235; y <= 245; y++) for (let x = 237; x <= 255; x++) game.setTile(x, y, 'grass');
  b.move(235.5, 235.5); a.move(239.5, 240.5); await until(() => p.x === 239.5 && game.entities.get(b.id).x === 235.5);
  game.give(p, 'diamond', 5); a.action('craft', { recipe: 'portal' }); await until(() => p.inventory.portal === 1);
  assert.ok(!p.inventory.diamond, 'craft costs five diamonds');
  a.action('hotbar', { slot: 0, item: 'portal' }); a.action('select', { slot: 0 }); await until(() => p.hotbar[0] === 'portal');
  a.action('use', { x: 240, y: 240 });
  await until(() => [...game.entities.values()].some(e => e.type === 'portal'));
  const first = [...game.entities.values()].find(e => e.type === 'portal');
  assert.ok(!p.inventory.portal);
  const second = game.spawn('portal', { x: 246.5, y: 240.5 });
  const third = game.spawn('portal', { x: 252.5, y: 240.5 });
  game.setTile(400, 240, 'grass');
  const distant = game.spawn('portal', { x: 400.5, y: 240.5 });
  game.spawn('portal', { x: 240.5, y: 236.5 });
  a.action('interact', { x: 240, y: 240 }); await until(() => p.portalId === first.id);
  await until(() => b.snap.entities.find(e => e.id === p.id)?.portalId === first.id);
  a.move(239.5, 240.5); await sleep(100); assert.equal(p.x, first.x, 'normal movement is ignored in portal mode');
  a.action('portalMove', { direction: 'right' }); await until(() => p.portalId === second.id);
  assert.equal(p.x, 246.5, 'nearest portal in direction is chosen');
  await sleep(250); a.action('portalMove', { direction: 'down' }); await sleep(100);
  assert.equal(p.portalId, second.id, 'no wrong-direction jumps');
  a.ws.close(); await until(() => !game.entities.has(a.id));
  const c = await connect('Traveler'); p = game.entities.get(c.id);
  assert.equal(p.portalId, second.id, 'portal mode survives reconnect');
  await sleep(250); c.action('portalMove', { direction: 'right' }); await until(() => p.portalId === third.id);
  await sleep(250); c.action('portalMove', { direction: 'right' }); await until(() => p.portalId === distant.id);
  assert.equal(p.x, 400.5, 'portals more than 80 tiles away remain reachable');
  await sleep(250); c.action('portalMove', { direction: 'left' }); await until(() => p.portalId === third.id);
  await sleep(250); c.action('portalMove', { direction: 'left' }); await until(() => p.portalId === second.id);
  for (let y = 239; y <= 241; y++) for (let x = 245; x <= 247; x++) if (x !== 246 || y !== 240) game.setTile(x, y, 'wood-wall');
  c.action('portalExit'); await sleep(150);
  assert.equal(p.portalId, second.id, 'cannot exit into blocked terrain');
  game.setTile(246, 241, 'grass');
  c.action('portalExit'); await until(() => p.portalId == null && p.y === 241.5);
  game.setTile(247, 241, 'grass');
  c.move(247.5, 241.5); await until(() => p.x === 247.5);
  console.log('PASS portal crafting, placement, multiplayer entry, directional travel, reconnect and safe exit');
} catch (err) { console.error(err); process.exitCode = 1; }
finally { sockets.forEach(ws => ws.close()); setTimeout(() => process.exit(process.exitCode || 0), 100); }
