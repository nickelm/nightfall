// Real-server mining, crafting, combat, and world-generation regression checks.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { World } from '../../shared/world.js';
import { registries } from '../../shared/registry.js';
import { hashString, mulberry32 } from '../../shared/rng.js';
process.env.PORT = '8115'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (fn()) return; await sleep(20); }
  assert.ok(fn(), 'condition reached before timeout');
}
for (const seed of [1, 42, 1234, 4242, 699005729]) {
  const world = World.generate(160, 160, seed), again = World.generate(160, 160, seed);
  const before = new World(160, 160, seed);
  for (const pass of [...registries.worldPasses].sort((a, b) => a.order - b.order)) {
    if (pass.name !== 'lava-veins') pass.fn(before, mulberry32(seed ^ hashString(pass.name)));
  }
  assert.deepEqual(world.tiles, again.tiles);
  let lava = 0;
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    if (world.tile(x, y).name === 'lava-ore') {
      lava++; assert.ok(['stone', 'granite-rock', 'sandstone-rock', 'froststone-rock'].includes(before.tile(x, y).name));
    }
    else assert.equal(world.tile(x, y).name, before.tile(x, y).name, 'other tiles remain unchanged');
  }
  assert.ok(lava >= 8, `lava available on seed ${seed}`);
}
console.log('PASS lava veins are deterministic, appear in rock, and preserve earlier ore locations');
const ws = new WebSocket('ws://localhost:8115');
let id, snap;
const action = (name, data = {}) => ws.send(JSON.stringify({ t: 'action', name, data }));
const me = () => snap?.entities.find(e => e.id === id);
ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'welcome') id = m.id; if (m.t === 'snap') snap = m; });
try {
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'hello', name: 'ObsidianTester' })); await until(() => me());
  const p = game.entities.get(id); game._animalSpawnAt = Infinity;
  for (let y = 78; y <= 82; y++) for (let x = 78; x <= 83; x++) game.setTile(x, y, 'grass');
  ws.send(JSON.stringify({ t: 'move', x: 80.5, y: 80.5, dir: { x: 1, y: 0 } }));
  await until(() => p.x === 80.5 && p.y === 80.5);
  for (const item of ['pickaxe', 'iron-pickaxe', 'gold-pickaxe', 'diamond-pickaxe']) game.give(p, item, 1);
  async function equip(item) { action('hotbar', { slot: 0, item }); action('select', { slot: 0 }); await until(() => me().hotbar[0] === item); }
  game.setTile(81, 80, 'lava-ore');
  for (const item of ['pickaxe', 'iron-pickaxe', 'gold-pickaxe']) {
    await equip(item); action('mine', { x: 81, y: 80 }); await sleep(300);
    assert.equal(game.world.tile(81, 80).name, 'lava-ore'); assert.ok(!p.inventory.lava);
    action('mine', { stop: true });
  }
  await equip('diamond-pickaxe'); action('mine', { x: 81, y: 80 });
  await until(() => p.inventory.lava === 1);
  assert.equal(game.world.tile(81, 80).name, 'gravel');
  console.log('PASS only diamond-tier tools mine lava and the resource is granted');
  game.give(p, 'diamond', 8); game.give(p, 'lava', 7); game.give(p, 'wood', 5);
  for (let i = 1; i <= 8; i++) { action('craft', { recipe: 'obsidian' }); await until(() => p.inventory.obsidian === i); }
  assert.ok(!p.inventory.diamond && !p.inventory.lava);
  for (const kind of ['pickaxe', 'axe', 'sword']) {
    action('craft', { recipe: `obsidian-${kind}` }); await until(() => p.inventory[`obsidian-${kind}`] === 1);
  }
  assert.ok(!p.inventory.obsidian && !p.inventory.wood);
  action('craft', { recipe: 'obsidian-sword' }); await sleep(150); assert.equal(p.inventory['obsidian-sword'], 1);
  console.log('PASS lava and diamond craft obsidian and all three items consume the stated materials');
  await equip('obsidian-sword');
  const slime = game.spawn('slime', { x: 81.25, y: 80.5, hp: 100, speed: 0, stunnedUntil: game.time + 10 });
  action('attack'); await until(() => slime.hp < 100); assert.equal(slime.hp, 90); game.despawn(slime.id);
  await equip('obsidian-axe'); game.setTile(81, 80, 'tree'); action('mine', { x: 81, y: 80 });
  await until(() => p.inventory.wood === 1); assert.equal(game.world.tile(81, 80).name, 'grass');
  await equip('obsidian-pickaxe'); game.setTile(81, 80, 'lava-ore'); action('mine', { x: 81, y: 80 });
  await until(() => p.inventory.lava === 1); assert.equal(game.world.tile(81, 80).name, 'gravel');
  game.setTile(81, 80, 'lava');
  await equip('gold-pickaxe'); action('mine', { x: 81, y: 80 }); await sleep(300);
  assert.equal(game.world.tile(81, 80).name, 'lava');
  action('mine', { stop: true }); await equip('diamond-pickaxe'); action('mine', { x: 81, y: 80 });
  await until(() => p.inventory.lava === 2); assert.equal(game.world.tile(81, 80).name, 'gravel');
  assert.equal(registries.items.get('obsidian-axe').power, 40);
  assert.equal(registries.items.get('obsidian-pickaxe').power, 40);
  console.log('PASS obsidian sword and axe work, and lava pools also require a diamond-tier pickaxe');
} catch (err) { console.error(err); process.exitCode = 1; }
finally { ws.close(); setTimeout(() => process.exit(process.exitCode || 0), 100); }
