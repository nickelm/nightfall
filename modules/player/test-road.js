import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { registries } from '../../shared/registry.js';
import './client.js';
process.env.PORT = '8136'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { const end = Date.now() + 8000; while (Date.now() < end) { if (fn()) return; await sleep(25); } assert.ok(fn(), 'condition reached'); }
const sockets = [];
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8136'), c = { ws }; sockets.push(ws);
  c.action = (name, data = {}) => ws.send(JSON.stringify({ t: 'action', name, data }));
  c.move = (x, y) => ws.send(JSON.stringify({ t: 'move', x, y, dir: { x: 1, y: 0 } }));
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'welcome') c.id = m.id; if (m.t === 'snap') c.snap = m; });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'hello', name })); await until(() => c.me()); return c;
}
try {
  const a = await connect('Builder'), b = await connect('Observer'), p = game.entities.get(a.id);
  for (let y = 238; y <= 242; y++) for (let x = 238; x <= 243; x++) game.setTile(x, y, 'grass');
  b.move(230.5, 230.5); a.move(239.5, 240.5); await until(() => p.x === 239.5 && game.entities.get(b.id).x === 230.5);
  game.give(p, 'stone', 2); a.action('craft', { recipe: 'road' }); await until(() => p.inventory.road === 1);
  assert.ok(!p.inventory.stone, 'a road costs two stones');
  a.action('hotbar', { slot: 0, item: 'road' }); a.action('select', { slot: 0 }); await until(() => p.hotbar[0] === 'road');
  game.setTile(240, 240, 'cabin-floor'); a.action('use', { x: 240, y: 240 }); await sleep(150);
  assert.equal(game.world.tile(240, 240).name, 'cabin-floor'); assert.equal(p.inventory.road, 1);
  game.setTile(240, 240, 'grass'); a.action('use', { x: 240, y: 240 });
  await until(() => game.world.tile(240, 240).name === 'road' && !p.inventory.road);
  assert.ok(!game.world.blocked(240.5, 240.5));
  const movement = registries.clientSystems.find(s => s.name.endsWith('/movement')).fn;
  const input = { mouse: { active: false }, down: key => key === 'KeyD', pressed: () => false, mouseDown: () => false, clicked: () => false };
  function travel(tile) {
    const me = { x: 0, y: 0, speed: 5, stamina: 4, dir: { x: 1, y: 0 } };
    const fake = { me, input, ui: null, settings: { movement: 'screen' }, _movementControl: { button: { style: {}, dataset: { mode: 'screen' } }, label: {}, hint: {} }, world: { tile: () => tile, blocked: () => false }, entities: new Map(), send() {}, sendAction() {} };
    movement(fake, .1); return me.x;
  }
  assert.equal(travel(registries.tileByName.get('grass')), .5);
  assert.equal(travel(registries.tileByName.get('road')), .75, 'walking on the road is 1.5 times as fast');
  game.give(p, 'diamond-pickaxe', 1); a.action('hotbar', { slot: 0, item: 'diamond-pickaxe' }); await until(() => p.hotbar[0] === 'diamond-pickaxe');
  a.action('mine', { x: 240, y: 240 }); await until(() => p.inventory.road === 1);
  assert.equal(game.world.tile(240, 240).name, 'gravel');
  console.log('PASS road crafting, safe placement, 1.5x walking speed, and recovery');
} catch (err) { console.error(err); process.exitCode = 1; }
finally { sockets.forEach(ws => ws.close()); setTimeout(() => process.exit(process.exitCode || 0), 100); }
