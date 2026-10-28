// RTS mode: peasants mine near a click and deliver to the nearest chest.
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
process.env.PORT = '8127'; process.env.SEED = '4242'; process.env.START_TIME = '10';
process.env.STATE_FILE = path.join(os.tmpdir(), `nightfall-test-rts-${process.pid}.json`);
const { game } = await import('../../server/index.js');
const { registries } = await import('../../shared/registry.js');

const act = (name, player, data) => { for (const h of registries.actions.get(name)) h.fn(game, player, data); };
const tick = (seconds) => { for (let t = 0; t < seconds; t += 0.05) for (const s of registries.systems) s.fn(game, 0.05); };
try {
  for (const e of [...game.entities.values()]) game.despawn(e.id);
  for (let y = 40; y < 80; y++) for (let x = 40; x < 100; x++) game.setTile(x, y, 'grass');
  for (let y = 55; y < 58; y++) for (let x = 85; x < 88; x++) game.setTile(x, y, 'tree');
  const a = game.spawn('player', { name: 'A', x: 50.5, y: 50.5, inventory: {}, hp: 10, maxHp: 10 });
  const b = game.spawn('player', { name: 'B', x: 52.5, y: 50.5, inventory: {}, hp: 10, maxHp: 10 });
  const near = game.spawn('chest', { x: 70.5, y: 60.5 });
  const far = game.spawn('chest', { x: 45.5, y: 75.5 });

  act('rts', a, { on: true });
  const peasants = () => [...game.entities.values()].filter((e) => e.type === 'peasant' && e.owner === a.id);
  assert.equal(peasants().length, 3, 'three peasants appear');
  game.damage(a, 5);
  assert.equal(a.hp, 10, 'the hidden hero cannot be hurt');

  act('rtsOrder', a, { x: 86.5, y: 56.5 });
  tick(60);
  const wood = near.inventory.wood || 0;
  assert.ok(wood >= 4, `wood went into the nearest chest (${wood})`);
  assert.equal(far.inventory.wood || 0, 0, 'the far chest got nothing');
  assert.equal((a.inventory.wood || 0) + (b.inventory.wood || 0), 0, 'nothing went straight to the players');
  console.log(`PASS peasants mined and delivered ${wood} wood to the nearest chest`);

  game.despawn(near.id); game.despawn(far.id);
  for (let y = 55; y < 58; y++) for (let x = 85; x < 88; x++) game.setTile(x, y, 'tree'); // regrow the grove
  act('rtsOrder', a, { x: 86.5, y: 56.5 });
  tick(20);
  assert.ok(peasants().some((e) => e.task === 'waiting' && e.carry), 'without a chest peasants wait with their load');
  console.log('PASS without a chest the peasants wait');

  act('rts', a, { on: false });
  tick(0.1);
  assert.equal(peasants().length, 0, 'peasants leave with RTS mode');
  console.log('PASS leaving RTS mode removes the peasants');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { setTimeout(() => process.exit(process.exitCode || 0), 100); }
