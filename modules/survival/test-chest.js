import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

process.env.PORT = '8143'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { const end = Date.now() + 8000; while (Date.now() < end) { if (fn()) return; await sleep(25); } assert.ok(fn(), 'condition reached'); }
const sockets = [];
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8143'), c = { ws, events: [] }; sockets.push(ws);
  c.action = (name, data = {}) => ws.send(JSON.stringify({ t: 'action', name, data }));
  c.move = (x, y) => ws.send(JSON.stringify({ t: 'move', x, y, dir: { x: 0, y: -1 } }));
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'welcome') c.id = m.id; if (m.t === 'snap') c.snap = m; if (m.t === 'event') c.events.push(m); });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'hello', name })); await until(() => c.me()); return c;
}
try {
  const a = await connect('Keeper'), b = await connect('Visitor'), p = game.entities.get(a.id);
  for (let y = 240; y <= 246; y++) for (let x = 237; x <= 243; x++) game.setTile(x, y, 'grass');
  a.move(240.5, 245.5); await until(() => p.y === 245.5);
  for (const e of game.near(240.5, 243.5, 1.5, e => e.type !== 'player')) game.despawn(e.id);
  game.give(p, 'wood', 20); game.give(p, 'stone', 3);
  a.action('craft', { recipe: 'chest' }); await until(() => p.inventory.chest === 1 && p.inventory.wood === 12);
  a.action('hotbar', { slot: 0, item: 'chest' }); a.action('select', { slot: 0 }); await until(() => p.hotbar[0] === 'chest' && p.selected === 0);
  a.action('use', { x: 240, y: 244 });
  await until(() => !p.inventory.chest && [...game.entities.values()].some(e => e.type === 'chest'));
  const chest = [...game.entities.values()].find(e => e.type === 'chest');
  assert.ok(chest.interactive && chest.x === 240.5 && chest.y === 244.5);

  a.action('interact', { x: 240, y: 244 });
  await until(() => a.events.some(m => m.name === 'chestOpen' && m.data.id === chest.id));
  await sleep(100);
  assert.ok(!b.events.some(m => m.name === 'chestOpen'), 'only the player who clicked opens the chest');

  a.action('chest', { id: chest.id, item: 'wood', put: true }); await until(() => chest.inventory.wood === 12);
  assert.equal(p.inventory.wood, undefined, 'a left click stores the whole stack');
  a.action('chest', { id: chest.id, item: 'wood', count: 1 }); await until(() => p.inventory.wood === 1);
  assert.equal(chest.inventory.wood, 11, 'a right click takes one');
  a.action('chest', { id: chest.id, item: 'gold', put: true }); a.action('chest', { id: chest.id, item: '__proto__', put: true });
  await sleep(150);
  assert.deepEqual(chest.inventory, { wood: 11 }, 'items the player lacks are not stored');
  await until(() => b.snap.entities.find(e => e.id === chest.id)?.inventory.wood === 11);

  a.action('chest', { id: chest.id, pickup: true }); await sleep(150);
  assert.ok(game.entities.has(chest.id), 'a full chest cannot be picked up');

  a.move(240.5, 248.5); await until(() => p.y === 248.5);
  a.action('chest', { id: chest.id, item: 'wood' }); a.action('interact', { x: 240, y: 244 }); await sleep(150);
  assert.equal(chest.inventory.wood, 11, 'out of reach requests do nothing');
  assert.equal(a.events.filter(m => m.name === 'chestOpen').length, 1, 'out of reach chests do not open');

  a.move(240.5, 245.5); await until(() => p.y === 245.5);
  a.action('chest', { id: chest.id, item: 'wood' }); await until(() => p.inventory.wood === 12);
  a.action('chest', { id: chest.id, pickup: true }); await until(() => !game.entities.has(chest.id) && p.inventory.chest === 1);
  console.log('PASS chest crafting, placing, private opening, stack and single transfers, reach, and pickup');
} catch (err) { console.error(err); process.exitCode = 1; }
finally { sockets.forEach(ws => ws.close()); setTimeout(() => process.exit(process.exitCode || 0), 100); }
