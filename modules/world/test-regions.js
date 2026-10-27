// Nine-region generation, accessibility, and island separation across seeds.
import assert from 'node:assert/strict';
import { loadModules } from '../../shared/loader.js';
import { World } from '../../shared/world.js';
import { registries } from '../../shared/registry.js';
import { hash2, hashString, mulberry32 } from '../../shared/rng.js';
await loadModules('shared', path => import(`../${path}`));
for (const seed of [1, 2, 42, 1234, 4242, 699005729]) {
  const world = World.generate(480, 480, seed), again = World.generate(480, 480, seed);
  const original = World.generate(160, 160, seed, { region: 'original' });
  assert.deepEqual(world.tiles, again.tiles, 'server and clients generate the same world');
  let changedLand = 0; const counts = {}, island = {};
  for (let y = 0; y < 480; y++) for (let x = 0; x < 480; x++) {
    const name = world.tile(x, y).name;
    counts[name] = (counts[name] || 0) + 1;
    if (x >= 320 && y < 160) island[name] = (island[name] || 0) + 1;
    if (x >= 160 && x < 320 && y >= 160 && y < 320) {
      const old = original.tile(x - 160, y - 160).name;
      if (old !== name && old !== 'water') changedLand++;
      if (old.endsWith('-ore')) assert.equal(name, old, 'old central ore stays in place');
    }
  }
  assert.ok(changedLand < 30, `bridges alter little original land (${changedLand})`);
  for (const tile of ['snow', 'sand', 'granite-rock', 'sandstone-rock', 'froststone-rock']) assert.ok(counts[tile] > 0, `${tile} exists`);
  for (const ore of ['iron-ore', 'gold-ore', 'diamond-ore', 'redstone-ore']) assert.ok(island[ore] >= 50, `${ore} is abundant on the mineral island`);
  const islandSeed = Math.floor(hash2(2, 0, seed + 903) * 0xffffffff) || 1;
  const beforeRedstone = new World(160, 160, islandSeed); beforeRedstone.regionKind = 'mineral';
  for (const pass of [...registries.worldPasses].sort((a, b) => a.order - b.order)) {
    if (pass.order < 110) pass.fn(beforeRedstone, mulberry32(islandSeed ^ hashString(pass.name)));
  }
  let eligible = 0;
  for (let y = 1; y < 159; y++) for (let x = 1; x < 159; x++) {
    if (Math.hypot(x - 80, y - 80) < 6 || beforeRedstone.tile(x, y).name !== 'stone') continue;
    if ([[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy]) => beforeRedstone.tile(x+dx,y+dy)?.name === 'stone').length >= 2) eligible++;
  }
  const earlierTarget = Math.min(eligible, Math.max(150, Math.round(eligible * 0.15)));
  assert.ok(island['redstone-ore'] / earlierTarget >= 1.65 && island['redstone-ore'] / earlierTarget <= 1.75,
    'mineral island redstone is approximately 1.7 times the previous target');
  for (let i = 0; i < 160; i++) for (let d = 0; d < 8; d++) {
    assert.equal(world.tile(320 + d, i).name, 'water');
    assert.equal(world.tile(320 + i, 159 - d).name, 'water');
  }
  const p = world.findWalkable(), queue = [[Math.floor(p.x), Math.floor(p.y)]], seen = new Uint8Array(480 * 480), reached = new Set();
  seen[queue[0][1] * 480 + queue[0][0]] = 1;
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]; reached.add(`${Math.floor(x / 160)},${Math.floor(y / 160)}`);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx, ny=y+dy, index=ny*480+nx;
      if (!world.inBounds(nx,ny) || seen[index] || world.isSolid(nx,ny) || world.tile(nx,ny).hurts) continue;
      seen[index]=1; queue.push([nx,ny]);
    }
  }
  assert.equal(reached.size, 8, 'all seven ordinary regions and the centre are connected by land');
  assert.ok(!reached.has('2,0'), 'mineral island cannot be reached on foot');
  const boatQueue = [[Math.floor(p.x), Math.floor(p.y)]], boatSeen = new Uint8Array(480 * 480);
  boatSeen[boatQueue[0][1] * 480 + boatQueue[0][0]] = 1;
  let landed = false;
  for (let i = 0; i < boatQueue.length && !landed; i++) {
    const [x, y] = boatQueue[i], tile = world.tile(x, y);
    if (x >= 328 && x < 472 && y >= 8 && y < 152 && tile.name !== 'water') { landed = true; break; }
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx, ny=y+dy, index=ny*480+nx, t=world.tile(nx,ny);
      if (!world.inBounds(nx,ny) || boatSeen[index] || !t || (t.solid && t.name !== 'water') || t.hurts) continue;
      boatSeen[index]=1; boatQueue.push([nx,ny]);
    }
  }
  assert.ok(landed, 'the mineral island has a landing reachable by boat');
  console.log(`PASS seed ${seed}: nine regions, connected land, isolated ore island, diverse biomes, preserved centre`);
}
