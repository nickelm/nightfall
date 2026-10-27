// Verify ores stay in natural rock and form deterministic veins.
// Run: node modules/world/test-ore.js
import assert from 'node:assert/strict';
import { loadModules } from '../../shared/loader.js';
import { registries } from '../../shared/registry.js';
import { World } from '../../shared/world.js';
import { hashString, mulberry32 } from '../../shared/rng.js';

await loadModules('shared', p => import(`../${p}`));
const terrain = registries.worldPasses.find(pass => pass.name === 'terrain');
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
for (const seed of [1, 2, 42, 1234, 4242, 699005729, 999999]) {
  const base = new World(160, 160, seed);
  terrain.fn(base, mulberry32(seed ^ hashString('terrain')));
  const world = World.generate(160, 160, seed);
  const otherClient = World.generate(160, 160, seed);
  assert.deepEqual(world.tiles, otherClient.tiles, `seed ${seed} generates identically`);
  const counts = { 'iron-ore': 0, 'gold-ore': 0, 'diamond-ore': 0 };
  let connected = 0, ores = 0;
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    const name = world.tile(x, y).name;
    if (!(name in counts)) continue;
    counts[name]++; ores++;
    assert.equal(base.tile(x, y).name, 'stone', `${name} at ${x},${y} replaces natural rock`);
    assert.ok(Math.hypot(x - 80, y - 80) >= 6, 'spawn area remains clear of ores');
    const rockNeighbors = directions.filter(([dx, dy]) => base.tile(x + dx, y + dy)?.name === 'stone').length;
    assert.ok(rockNeighbors >= 2, 'ore is inside a rocky area');
    if (directions.some(([dx, dy]) => world.tile(x + dx, y + dy)?.name === name)) connected++;
  }
  assert.ok(counts['iron-ore'] >= 6 && counts['gold-ore'] >= 3 && counts['diamond-ore'] >= 3,
    `seed ${seed} has enough ore for crafting`);
  assert.ok(connected / ores >= 0.75, `most ore belongs to a vein (seed ${seed})`);
  console.log(`PASS seed ${seed}: ${counts['iron-ore']} iron, ${counts['gold-ore']} gold, ${counts['diamond-ore']} diamond; ${Math.round(connected / ores * 100)}% in veins`);
}
console.log('All ore placement checks passed');
