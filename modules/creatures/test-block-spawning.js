// Verify director and blood-slime split spawns against built tiles.
import assert from 'node:assert/strict';
import { World } from '../../shared/world.js';
process.env.PORT = '8124'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const { spawnSlime } = await import('./server.js');
const world = new World(40, 40, 1);
for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) world.set(x, y, 'grass');
const fake = { world, entities: new Map(), timeOfDay: () => ({ day: 1 }), spawn: (type, fields) => ({ type, ...fields }) };
const player = { x: 10.5, y: 10.5 };
const random = Math.random;
try {
  Math.random = () => 0; // predictable blood-slime footprint, regular x=19.5, horde x=23.5
  assert.ok(spawnSlime(fake, player, { horde: false }), 'natural grass allows spawning');
  for (const tile of ['door-open', 'redstone-wire-grass', 'redstone-wire-grass-powered', 'thorns']) {
    world.edit(19, 10, tile);
    assert.equal(spawnSlime(fake, player, { horde: false }), null, `${tile} blocks director spawns`);
    world.edit(19, 10, 'grass');
  }
  world.edit(20, 10, 'door-open');
  assert.equal(spawnSlime(fake, player, { horde: false }), null, 'large monster footprint cannot overlap an adjacent block');
  world.edit(20, 10, 'gravel');
  assert.ok(spawnSlime(fake, player, { horde: false }), 'ground restored after mining remains spawnable');
  world.edit(23, 10, 'redstone-wire-grass');
  assert.equal(spawnSlime(fake, player, { horde: true, angle: 0.5 }), null, 'horde spawn respects built tiles');
  world.edit(23, 10, 'grass');
  assert.ok(spawnSlime(fake, player, { horde: true, angle: 0.5 }), 'horde still spawns on ordinary ground');
  console.log('PASS normal and horde spawns avoid constructed walkable blocks and their full footprint');
} finally { Math.random = random; }
try {
  for (let y = 78; y <= 82; y++) for (let x = 78; x <= 82; x++) game.setTile(x, y, 'door-open');
  const blocked = game.spawn('blood-slime', { x: 80.5, y: 80.5, hp: 1, speed: 0 });
  game.damage(blocked, 1);
  assert.equal([...game.entities.values()].filter(e => e.type === 'slime').length, 0, 'splits cannot appear on blocks');
  for (let y = 78; y <= 82; y++) for (let x = 78; x <= 82; x++) game.setTile(x, y, 'grass');
  const normal = game.spawn('blood-slime', { x: 80.5, y: 80.5, hp: 1, speed: 0 });
  game.damage(normal, 1);
  assert.equal([...game.entities.values()].filter(e => e.type === 'slime').length, 2, 'splitting still works on ground');
  console.log('PASS blood-slime split spawns respect blocks and still work on ordinary ground');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { setTimeout(() => process.exit(process.exitCode || 0), 100); }
