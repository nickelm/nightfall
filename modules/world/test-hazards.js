// Glass, thorns, and lava on a real server.
// Run: node modules/world/test-hazards.js
import assert from 'node:assert/strict';
import { registries } from '../../shared/registry.js';

process.env.PORT = '8111';
process.env.SEED = '4242';
process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(25); }
  assert.ok(fn(), 'condition reached before timeout');
}
const lavaCells = (cell) => {
  const cells = new Set();
  for (let y = 0; y < game.world.h; y++) for (let x = 0; x < game.world.w; x++) {
    if (game.world.tile(x, y).name === 'lava') cells.add(`${x - x % cell},${y - y % cell}`);
  }
  return cells;
};
const glows = () => [...game.entities.values()].filter(e => e.type === 'lava-glow');

let failed = false;
try {
  const glass = registries.tileByName.get('glass');
  assert.ok(glass.solid && !glass.opaque, 'glass blocks movement but not sight');
  assert.equal(registries.items.get('glass').placesTile, 'glass');
  assert.equal(registries.items.get('thorns').placesTile, 'thorns');
  assert.equal(registries.tileByName.get('sand').harvest.item, 'sand');
  console.log('PASS  glass is solid and see-through; glass and thorns are placeable');

  const spawn = game.world.findWalkable();
  assert.ok(!game.world.tile(spawn.x, spawn.y).hurts, 'the spawn tile is safe');
  console.log('PASS  players do not spawn on a hazard');

  await until(() => game._lavaGlowReady);
  const cells = lavaCells(4);
  assert.ok(cells.size > 0, 'seed 4242 has lava');
  assert.equal(glows().length, cells.size, 'one glow per 4x4 cell with lava');
  for (const g of glows()) assert.ok(cells.has(g._cell.join(',')) && g.light > 0, 'glows sit on lava cells');
  console.log(`PASS  ${glows().length} lava glows cover the island's lava`);

  for (let y = 78; y <= 84; y++) for (let x = 76; x <= 86; x++) game.setTile(x, y, 'grass');
  game.setTile(78, 80, 'lava');
  game.setTile(84, 80, 'thorns');
  game.setTile(81, 83, 'glass');
  const burnt = game.spawn('slime', { x: 78.5, y: 80.5, speed: 0, aggro: 0 });
  const pricked = game.spawn('slime', { x: 84.5, y: 80.5, speed: 0, aggro: 0 });
  await until(() => !game.entities.has(burnt.id), 3000);
  assert.ok(game.entities.has(pricked.id) && pricked.hp < 3, 'thorns hurt more slowly than lava');
  console.log('PASS  lava kills a slime quickly; thorns wear it down');
  await until(() => !game.entities.has(pricked.id), 4000);
  console.log('PASS  thorns eventually kill a slime too');

  game.setTile(81, 83, 'gravel');
  assert.ok(!game.world.blocked(81.5, 83.5), 'harvested glass leaves walkable gravel');

  // Stone on lava: fills it even under a glow, costs one stone, and removes the glow.
  for (let y = 88; y <= 95; y++) for (let x = 88; x <= 95; x++) game.setTile(x, y, 'grass');
  game.setTile(88, 88, 'lava'); game.setTile(89, 88, 'lava');
  const glow = game.spawn('lava-glow', { x: 88.5, y: 88.5, _cell: [88, 88] });
  const mason = game.spawn('player', { x: 89.5, y: 90.5, name: 'Mason', inventory: { stone: 3 }, hotbar: ['stone'], selected: 0 });
  const use = (x, y) => { for (const h of registries.actions.get('use')) h.fn(game, mason, { x, y }); };
  use(88, 88);
  assert.equal(game.world.tile(88, 88).name, 'stone', 'stone on lava turns it into rock');
  assert.equal(mason.inventory.stone, 2, 'filling lava costs exactly one stone');
  const blocker = game.spawn('slime', { x: 89.5, y: 88.5, speed: 0, aggro: 0, hp: 99 });
  use(89, 88);
  assert.equal(game.world.tile(89, 88).name, 'lava', 'cannot fill lava under a creature');
  game.despawn(blocker.id);
  assert.ok(game.entities.has(glow.id), 'glow stays while its cell still has lava');
  use(89, 88);
  assert.equal(mason.inventory.stone, 1);
  await until(() => !game.entities.has(glow.id), 1000);
  game.despawn(mason.id);
  console.log('PASS  stone fills lava, and the glow goes out once the pool is gone');
} catch (err) { failed = true; console.error(err); }
console.log(failed ? 'Hazard checks failed' : 'All hazard checks passed');
process.exit(failed ? 1 : 0);
