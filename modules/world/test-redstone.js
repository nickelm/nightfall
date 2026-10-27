// Real-server multiplayer regression for redstone wiring and light.
// Run: node modules/world/test-redstone.js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WebSocket } from 'ws';
import { World } from '../../shared/world.js';
import { registries } from '../../shared/registry.js';
import { hashString, mulberry32 } from '../../shared/rng.js';

process.env.PORT = '8108';
process.env.SEED = '4242';
process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const clients = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(25); }
  assert.ok(fn(), 'condition reached before timeout');
}
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8108');
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
async function emptyHand(c) {
  const slot = c.me().hotbar.findIndex(item => !item);
  assert.notEqual(slot, -1, 'an empty hotbar slot is available');
  c.action('select', { slot }); await until(() => c.me().selected === slot);
}

let failed = false;
try {
  const oldOreHashes = new Map([
    [42, '6c592ef9aae03cab41b7d5b2c03d2cd88f86c6948bf555e362b5ce32acea4658'],
    [1234, '4265ec711adc80c8911d32328dbc85ae97f1029ad3250feb09e6b01e780bbf49'],
    [4242, '0c4d1249cc2e2967a2bedb73399cd9705f1e9236d4ecbb4971754ffcdb4ae62d'],
    [699005729, 'a2b23c0dd2645e350af042daa50dac29836b887cf502bbcff4fcf14b8d68dd34'],
  ]);
  const terrain = registries.worldPasses.find(pass => pass.name === 'terrain');
  for (const [seed, expected] of oldOreHashes) {
    const base = new World(160, 160, seed);
    terrain.fn(base, mulberry32(seed ^ hashString('terrain')));
    const a = World.generate(160, 160, seed), b = World.generate(160, 160, seed);
    assert.deepEqual(a.tiles, b.tiles);
    const old = [], counts = { 'redstone-ore': 0, 'power-crystal-ore': 0 };
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const name = a.tile(x, y).name;
      if (['iron-ore', 'gold-ore', 'diamond-ore'].includes(name)) old.push(`${x},${y}:${name}`);
      if (name in counts) { counts[name]++; assert.equal(base.tile(x, y).name, 'stone'); }
    }
    assert.equal(createHash('sha256').update(old.join('|')).digest('hex'), expected, 'existing ore positions remain stable');
    assert.ok(counts['redstone-ore'] >= 8 && counts['power-crystal-ore'] >= 3, 'both new ores exist inside rock');
  }
  console.log('PASS new ores generate deterministically in rock without moving existing ore');

  const a = await connect('Engineer'), b = await connect('Observer');
  const p = game.entities.get(a.id);
  game._animalSpawnAt = Infinity;
  for (const e of [...game.entities.values()]) if (e.animal) game.despawn(e.id);
  for (let y = 77; y <= 84; y++) for (let x = 78; x <= 89; x++) game.setTile(x, y, 'grass');
  game.setTile(84, 80, 'sand');
  b.move(70.5, 70.5); a.move(81.5, 79.5);
  await until(() => p.x === 81.5 && p.y === 79.5);
  game.give(p, 'pickaxe', 1);
  await until(() => a.me().inventory.pickaxe === 1);
  await equip(a, 'pickaxe');
  for (const item of ['redstone', 'power-crystal']) {
    game.setTile(81, 80, `${item}-ore`);
    a.action('mine', { x: 81, y: 80 });
    await until(() => a.me().inventory[item] === 1);
    await until(() => b.world.tile(81, 80).name === 'gravel');
  }
  console.log('PASS both new minerals can be mined and synchronize with the other player');
  for (const [item, n] of Object.entries({ redstone: 7, stone: 4, 'power-crystal': 1 })) game.give(p, item, n);
  a.action('craft', { recipe: 'redstone-wire' });
  await until(() => a.me().inventory['redstone-wire'] === 4);
  a.action('craft', { recipe: 'redstone-lamp' });
  a.action('craft', { recipe: 'redstone-lamp' });
  await until(() => a.me().inventory['redstone-lamp'] === 2);
  assert.equal(p.inventory.redstone, 3); assert.ok(!p.inventory.stone);
  console.log('PASS wire and lamps craft with the stated materials');

  await equip(a, 'power-crystal');
  a.action('use', { x: 82, y: 80 });
  await until(() => [...game.entities.values()].some(e => e.type === 'power-source'));
  const source = [...game.entities.values()].find(e => e.type === 'power-source');
  assert.equal(source.on, true);
  await equip(a, 'redstone-wire');
  a.action('use', { x: 83, y: 80 });
  await until(() => game.world.tile(83, 80).powered);
  a.move(83.5, 79.5); await until(() => p.x === 83.5);
  a.action('use', { x: 84, y: 80 });
  await until(() => game.world.tile(84, 80).powered);
  assert.equal(game.world.tile(84, 80).wireGround, 'sand');
  a.move(84.5, 79.5); await until(() => p.x === 84.5);
  await equip(a, 'redstone-lamp');
  a.action('use', { x: 85, y: 80 });
  await until(() => [...game.entities.values()].some(e => e.type === 'redstone-lamp' && e.powered));
  const lamp1 = [...game.entities.values()].find(e => e.type === 'redstone-lamp');
  assert.equal(lamp1.light, 6); assert.ok(!lamp1.repels, 'electric light does not repel monsters');
  await until(() => b.snap.entities.find(e => e.id === lamp1.id)?.powered && b.world.tile(84, 80)?.powered);
  console.log('PASS a connected source powers wire and a visible lamp for both players');

  a.move(84.5, 82.5); await until(() => p.y === 82.5);
  a.action('use', { x: 85, y: 81 });
  await until(() => [...game.entities.values()].filter(e => e.type === 'redstone-lamp').length === 2);
  const lamp2 = [...game.entities.values()].find(e => e.type === 'redstone-lamp' && e.id !== lamp1.id);
  assert.equal(lamp2.powered, false, 'diagonal wire and a neighboring lamp do not conduct');
  await equip(a, 'redstone-wire');
  a.action('use', { x: 84, y: 81 });
  await until(() => lamp1.powered && lamp2.powered);
  console.log('PASS branching wires power both lamps while diagonal connections do not');

  a.move(82.5, 79.5); await until(() => p.x === 82.5 && p.y === 79.5);
  await emptyHand(a);
  a.action('interact', { x: 82, y: 80 });
  await until(() => !source.on && !lamp1.powered && !lamp2.powered && !game.world.tile(83, 80).powered);
  await until(() => b.snap.entities.find(e => e.id === lamp1.id)?.light === 0 && !b.world.tile(84, 80).powered);
  console.log('PASS switching the crystal off turns off the full network on both clients');

  a.move(85.5, 82.5); await until(() => p.x === 85.5 && p.y === 82.5);
  await equip(a, 'power-crystal');
  a.action('use', { x: 84, y: 82 });
  await until(() => [...game.entities.values()].filter(e => e.type === 'power-source').length === 2 && lamp1.powered && lamp2.powered);
  await equip(a, 'pickaxe');
  a.action('interact', { x: 84, y: 82 });
  await until(() => [...game.entities.values()].filter(e => e.type === 'power-source').length === 1 && !lamp1.powered && !lamp2.powered);
  assert.equal(p.inventory['power-crystal'], 1, 'the picked-up crystal returns to inventory');
  console.log('PASS a second source powers the network and can be recovered with a pickaxe');

  a.move(82.5, 79.5); await until(() => p.x === 82.5 && p.y === 79.5);
  await emptyHand(a);
  a.action('interact', { x: 82, y: 80 });
  await until(() => source.on && lamp1.powered && lamp2.powered);
  a.move(83.5, 79.5); await until(() => p.x === 83.5);
  await equip(a, 'pickaxe');
  const before = p.inventory['redstone-wire'] || 0;
  a.action('mine', { x: 84, y: 80 });
  await until(() => game.world.tile(84, 80).name === 'sand' && (p.inventory['redstone-wire'] || 0) === before + 1);
  await until(() => !lamp1.powered && !lamp2.powered && !game.world.tile(84, 81).powered);
  await until(() => b.world.tile(84, 80).name === 'sand');
  assert.ok(game.world.tile(83, 80).powered, 'the wire still connected to the crystal stays powered');
  console.log('PASS removing wire breaks the circuit and restores the original ground');

  a.move(84.5, 79.5); await until(() => p.x === 84.5);
  a.action('interact', { x: 85, y: 80 });
  await until(() => !game.entities.has(lamp1.id) && a.me().inventory['redstone-lamp'] === 1);
  console.log('PASS lamps can be picked up with a pickaxe');
} catch (err) { failed = true; console.error(err); }
finally { clients.forEach(c => c.ws.close()); }
console.log(failed ? 'Redstone checks failed' : 'All redstone checks passed');
process.exit(failed ? 1 : 0);
