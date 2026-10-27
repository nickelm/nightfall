// Real-server regression checks for field ores, tool progression, and wooden doors.
// Run: node modules/survival/test-progression.js
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { World } from '../../shared/world.js';
import { registries } from '../../shared/registry.js';

process.env.PORT = '8101';
process.env.SEED = '4242';
process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const clients = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (fn()) return; await sleep(25); }
  assert.ok(fn(), 'condition reached before timeout');
}
function check(label, fn) { fn(); console.log(`PASS  ${label}`); }
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8101');
  const c = { ws, send: msg => ws.send(JSON.stringify(msg)) };
  clients.push(c);
  c.action = (name, data) => c.send({ t: 'action', name, data });
  c.move = (x, y) => c.send({ t: 'move', x, y, dir: { x: 1, y: 0 } });
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') { c.id = m.id; c.world = World.generate(m.w, m.h, m.seed); c.world.applyEdits(m.edits); }
    if (m.t === 'snap') c.snap = m;
    if (m.t === 'tile') c.world.edit(m.x, m.y, m.id);
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  c.send({ t: 'hello', name });
  await until(() => c.me());
  return c;
}
async function equip(c, item) {
  c.action('hotbar', { slot: 0, item }); c.action('select', { slot: 0 });
  await until(() => c.me().hotbar[0] === item && c.me().selected === 0);
}

let failed = false;
try {
  for (const seed of [42, 1234, 4242, 699005729]) {
    const a = World.generate(160, 160, seed), b = World.generate(160, 160, seed);
    assert.deepEqual(a.tiles, b.tiles);
    for (const ore of ['iron', 'gold', 'diamond']) {
      const id = registries.tileByName.get(`${ore}-ore`).id;
      assert.ok(a.tiles.filter(tile => tile === id).length >= 3, `${ore} available on seed ${seed}`);
    }
    for (let y = 75; y <= 85; y++) for (let x = 75; x <= 85; x++) {
      if (Math.hypot(x - 80, y - 80) < 6) assert.ok(!a.tile(x, y).name.endsWith('-ore'));
    }
  }
  console.log('PASS  four island seeds generate identical maps with all ores and a clear spawn area');

  const a = await connect('Miner'), b = await connect('Observer');
  const player = game.entities.get(a.id);
  for (const [name, n] of Object.entries({ wood: 20, iron: 3, gold: 3, diamond: 3, pickaxe: 1, axe: 1 })) game.give(player, name, n);
  for (const item of ['iron-pickaxe', 'gold-pickaxe', 'diamond-pickaxe', 'door']) {
    a.action('craft', { recipe: item });
    await until(() => a.me().inventory[item] === 1);
  }
  check('crafting all new tools and the door consumes the correct resources', () => {
    assert.equal(player.inventory.wood, 12);
    for (const name of ['iron', 'gold', 'diamond']) assert.ok(!player.inventory[name]);
  });
  a.action('craft', { recipe: 'diamond-pickaxe' });
  await sleep(100);
  assert.equal(player.inventory['diamond-pickaxe'], 1, 'cannot craft without materials');

  for (let y = 78; y <= 85; y++) for (let x = 77; x <= 85; x++) game.setTile(x, y, 'grass');
  b.move(70.5, 70.5); a.move(80.5, 80.5);
  await until(() => player.x === 80.5 && player.y === 80.5);
  for (const ore of ['iron', 'gold', 'diamond']) {
    game.setTile(81, 80, `${ore}-ore`);
    await equip(a, `${ore}-pickaxe`);
    a.action('mine', { x: 81, y: 80 });
    await until(() => a.me().inventory[ore] === 1);
    await until(() => b.world.tile(81, 80).name === 'gravel');
  }
  console.log('PASS  all three ores are mined into resources and tile edits reach the other client');

  const times = [];
  for (const tool of ['pickaxe', 'iron-pickaxe', 'gold-pickaxe', 'diamond-pickaxe']) {
    game.setTile(81, 80, 'stone');
    await equip(a, tool);
    const started = performance.now(), before = player.inventory.stone || 0;
    a.action('mine', { x: 81, y: 80 });
    await until(() => (a.me().inventory.stone || 0) === before + 1);
    times.push(performance.now() - started);
  }
  check(`pickaxe upgrades mine progressively faster (${times.map(t => Math.round(t)).join(', ')} ms)`, () => {
    for (let i = 1; i < times.length; i++) assert.ok(times[i] < times[i - 1]);
  });

  a.move(80.5, 82.5); await until(() => player.y === 82.5);
  await equip(a, 'door');
  a.action('use', { x: 81, y: 82 });
  await until(() => b.world.tile(81, 82).name === 'door-closed');
  assert.ok(game.world.blocked(81.5, 82.5));
  a.action('interact', { x: 81, y: 82 });
  await until(() => b.world.tile(81, 82).name === 'door-open');
  assert.ok(!game.world.blocked(81.5, 82.5));
  a.move(81.5, 82.5); await until(() => player.x === 81.5);
  a.action('interact', { x: 81, y: 82 }); await sleep(100);
  assert.equal(game.world.tile(81, 82).name, 'door-open');
  a.move(80.5, 82.5); await until(() => player.x === 80.5);
  a.action('interact', { x: 81, y: 82 });
  await until(() => b.world.tile(81, 82).name === 'door-closed');
  console.log('PASS  wooden door places, opens, closes, syncs, and refuses to close on a player');

  // A walled corridor forces the monster to face the door rather than walk around it.
  for (let x = 77; x <= 85; x++) { game.setTile(x, 81, 'wood-wall'); game.setTile(x, 83, 'wood-wall'); }
  const slime = game.spawn('slime', { x: 83.5, y: 82.5 });
  await sleep(1800);
  check('a closed door blocks the monster and survives its approach', () => {
    assert.ok(slime.x >= 82.3);
    assert.equal(game.world.tile(81, 82).name, 'door-closed');
    assert.equal(player.hp, player.maxHp);
  });
  a.action('interact', { x: 81, y: 82 });
  await until(() => slime.x < 81.3);
  console.log('PASS  opening the door lets the same monster pass through');
  game.despawn(slime.id);
  await equip(a, 'axe');
  a.action('mine', { x: 81, y: 82 });
  await until(() => a.me().inventory.door === 1);
  assert.equal(game.world.tile(81, 82).name, 'gravel');
  console.log('PASS  a player can reclaim an open door with an axe');
} catch (err) { failed = true; console.error(err); }
finally { clients.forEach(c => c.ws.close()); }
console.log(failed ? 'Progression checks failed' : 'All progression checks passed');
process.exit(failed ? 1 : 0);
