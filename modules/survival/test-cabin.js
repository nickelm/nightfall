import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { spawnMonster } from '../creatures/server.js';
import { World } from '../../shared/world.js';

process.env.PORT = '8132'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { const end = Date.now() + 8000; while (Date.now() < end) { if (fn()) return; await sleep(25); } assert.ok(fn(), 'condition reached'); }
const sockets = [];
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8132'), c = { ws }; sockets.push(ws);
  c.action = (name, data = {}) => ws.send(JSON.stringify({ t: 'action', name, data }));
  c.move = (x, y) => ws.send(JSON.stringify({ t: 'move', x, y, dir: { x: 0, y: -1 } }));
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'welcome') { c.id = m.id; c.world = World.generate(m.w, m.h, m.seed); c.world.applyEdits(m.edits); } if (m.t === 'snap') c.snap = m; if (m.t === 'tile') c.world.edit(m.x, m.y, m.id); });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'hello', name })); await until(() => c.me()); return c;
}
try {
  const a = await connect('Builder'), b = await connect('Observer'), p = game.entities.get(a.id);
  for (let y = 240; y <= 246; y++) for (let x = 237; x <= 243; x++) game.setTile(x, y, 'grass');
  a.move(240.5, 245.5); await until(() => p.y === 245.5);
  game.give(p, 'wood', 20); game.give(p, 'stone', 5);
  a.action('craft', { recipe: 'cabin' }); await until(() => p.inventory.cabin === 1);
  a.action('hotbar', { slot: 0, item: 'cabin' }); a.action('select', { slot: 0 }); await until(() => p.hotbar[0] === 'cabin');
  game.setTile(238, 241, 'water'); a.action('use', { x: 240, y: 244 }); await sleep(150);
  assert.equal(p.inventory.cabin, 1, 'invalid site does not consume the cabin');
  game.setTile(238, 241, 'grass'); a.action('use', { x: 240, y: 244 });
  await until(() => !p.inventory.cabin && b.world.tile(240, 244).name === 'door-closed');
  const cabin = [...game.entities.values()].find(e => e.type === 'cabin');
  assert.ok(cabin && cabin.light === 5 && cabin.spawnProtection === 10);
  assert.equal(game.world.tile(240, 243).name, 'cabin-floor');
  assert.ok(game.world.blocked(240.5, 244.5));
  a.action('interact', { x: 240, y: 244 }); await until(() => b.world.tile(240, 244).name === 'door-open');
  assert.ok(!game.world.blocked(240.5, 243.5), 'the cabin has a walkable interior');
  a.move(240.5, 243.5); await until(() => p.y === 243.5);
  const random = Math.random; Math.random = () => 0;
  try {
    const fake = { entities: new Map([[1, { ...cabin, x: 9, y: 0 }]]), world: { blocked: () => false }, timeOfDay: () => ({ day: 1 }), spawn: (type, fields) => ({ type, ...fields }) };
    assert.equal(spawnMonster(fake, { x: 0, y: 0 }, { type: 'slime' }), null, 'cabin blocks nearby spawns');
    fake.entities.get(1).x = 30;
    assert.ok(spawnMonster(fake, { x: 0, y: 0 }, { type: 'slime' }), 'spawns outside the radius remain possible');
  } finally { Math.random = random; }
  const before = [...game.entities.values()].filter(e => e.type === 'slime').length;
  const blood = game.spawn('blood-slime', { x: 245.5, y: 242.5, hp: 1, speed: 0 });
  game.damage(blood, 1);
  assert.equal([...game.entities.values()].filter(e => e.type === 'slime').length, before, 'slime splitting cannot spawn inside protection');
  game.setTile(238, 241, 'gravel'); await until(() => !game.entities.has(cabin.id));
  console.log('PASS cabin crafting, safe placement, multiplayer door and interior, light, spawn protection, and dismantling');
} catch (err) { console.error(err); process.exitCode = 1; }
finally { sockets.forEach(ws => ws.close()); setTimeout(() => process.exit(process.exitCode || 0), 100); }
