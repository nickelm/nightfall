import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { spawnMonster } from '../creatures/server.js';
import { World } from '../../shared/world.js';

process.env.PORT = '8137'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { const end = Date.now() + 8000; while (Date.now() < end) { if (fn()) return; await sleep(25); } assert.ok(fn(), 'condition reached'); }
const sockets = [];
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8137'), c = { ws }; sockets.push(ws);
  c.action = (name, data = {}) => ws.send(JSON.stringify({ t: 'action', name, data }));
  c.move = (x, y) => ws.send(JSON.stringify({ t: 'move', x, y, dir: { x: 0, y: -1 } }));
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'welcome') { c.id = m.id; c.world = World.generate(m.w, m.h, m.seed); c.world.applyEdits(m.edits); } if (m.t === 'snap') c.snap = m; if (m.t === 'tile') c.world.edit(m.x, m.y, m.id); });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'hello', name })); await until(() => c.me()); return c;
}
try {
  const a = await connect('Builder'), b = await connect('Observer'), p = game.entities.get(a.id);
  game._animalSpawnAt = Infinity;
  for (let y = 237; y <= 246; y++) for (let x = 236; x <= 244; x++) game.setTile(x, y, 'grass');
  b.move(230.5, 230.5); a.move(240.5, 245.5); await until(() => p.y === 245.5 && game.entities.get(b.id).x === 230.5);
  game.give(p, 'wood', 40); game.give(p, 'stone', 15);
  a.action('craft', { recipe: 'house' }); await until(() => p.inventory.house === 1);
  assert.ok(!p.inventory.wood && !p.inventory.stone);
  a.action('hotbar', { slot: 0, item: 'house' }); a.action('select', { slot: 0 }); await until(() => p.hotbar[0] === 'house');
  game.setTile(237, 239, 'water'); a.action('use', { x: 240, y: 244 }); await sleep(150);
  assert.equal(p.inventory.house, 1, 'failed placement keeps the item');
  game.setTile(237, 239, 'grass'); a.action('use', { x: 240, y: 244 });
  await until(() => !p.inventory.house && b.world.tile(240, 244).name === 'door-closed');
  const house = [...game.entities.values()].find(e => e.type === 'house');
  assert.ok(house && house.light === 7 && house.spawnProtection === 14);
  assert.equal(game.world.tile(237, 239).name, 'stone-block');
  assert.equal(game.world.tile(238, 240).name, 'cabin-floor');
  assert.equal(game.world.tile(242, 243).name, 'cabin-floor');
  a.action('interact', { x: 240, y: 244 }); await until(() => b.world.tile(240, 244).name === 'door-open');
  assert.ok(!game.world.blocked(240.5, 243.5));
  a.move(240.5, 243.5); await until(() => p.y === 243.5);
  const random = Math.random; Math.random = () => 0;
  try {
    const fake = { entities: new Map([[1, { ...house, x: 9, y: 0 }]]), world: { blocked: () => false }, timeOfDay: () => ({ day: 1 }), spawn: (type, fields) => ({ type, ...fields }) };
    assert.equal(spawnMonster(fake, { x: 0, y: 0 }, { type: 'slime' }), null);
    fake.entities.get(1).x = 30;
    assert.ok(spawnMonster(fake, { x: 0, y: 0 }, { type: 'slime' }));
  } finally { Math.random = random; }
  game.setTile(237, 239, 'gravel'); await until(() => !game.entities.has(house.id));
  console.log('PASS house crafting, placement, multiplayer entry, stone walls, light, spawn protection and dismantling');
} catch (err) { console.error(err); process.exitCode = 1; }
finally { sockets.forEach(ws => ws.close()); setTimeout(() => process.exit(process.exitCode || 0), 100); }
