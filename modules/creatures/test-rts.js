// RTS mode: peasants mine near an order and deliver to the nearest chest; move, stop,
// build a chest and train peasants; peasants stay when the owner goes back to the hero.
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
process.env.PORT = '8127'; process.env.SEED = '4242'; process.env.START_TIME = '10';
process.env.STATE_FILE = path.join(os.tmpdir(), `nightfall-test-rts-${process.pid}.json`);
const { game } = await import('../../server/index.js');
const { registries } = await import('../../shared/registry.js');
const { RTS } = await import('./shared.js');

const act = (name, player, data) => { for (const h of registries.actions.get(name)) h.fn(game, player, data); };
const tick = (seconds) => { for (let t = 0; t < seconds; t += 0.05) for (const s of registries.systems) s.fn(game, 0.05); };
const grove = () => { for (let y = 55; y < 58; y++) for (let x = 85; x < 88; x++) game.setTile(x, y, 'tree'); };
try {
  for (const e of [...game.entities.values()]) game.despawn(e.id);
  for (let y = 40; y < 80; y++) for (let x = 40; x < 100; x++) game.setTile(x, y, 'grass');
  grove();
  const a = game.spawn('player', { name: 'A', x: 50.5, y: 50.5, inventory: {}, hp: 10, maxHp: 10 });
  const b = game.spawn('player', { name: 'B', x: 52.5, y: 50.5, inventory: {}, hp: 10, maxHp: 10 });
  const near = game.spawn('chest', { x: 70.5, y: 60.5 });
  const far = game.spawn('chest', { x: 45.5, y: 75.5 });
  const peasants = () => [...game.entities.values()].filter((e) => e.type === 'peasant' && e.owner === a.id);

  act('rts', a, { on: true });
  assert.equal(peasants().length, RTS.peasants, 'three peasants appear');
  game.damage(a, 5);
  assert.equal(a.hp, 10, 'the hidden hero cannot be hurt');

  act('rtsOrder', a, { kind: 'auto', x: 86.5, y: 56.5 }); // right on a tree: mine
  tick(60);
  const wood = near.inventory.wood || 0;
  assert.ok(wood >= 4, `wood went into the nearest chest (${wood})`);
  assert.equal(far.inventory.wood || 0, 0, 'the far chest got nothing');
  assert.equal((a.inventory.wood || 0) + (b.inventory.wood || 0), 0, 'nothing went straight to the players');
  console.log(`PASS peasants mined and delivered ${wood} wood to the nearest chest`);

  const [p1, p2] = peasants();
  act('rtsOrder', a, { ids: [p1.id], kind: 'auto', x: 50.5, y: 45.5 }); // open ground: move
  tick(15);
  assert.ok(Math.hypot(p1.x - 50.5, p1.y - 45.5) < 0.6 && p1.task === 'idle', `the selected peasant walked there (${p1.task})`);
  assert.ok(Math.hypot(p2.x - 50.5, p2.y - 45.5) > 2, 'the others stayed');
  console.log('PASS an order moves only the selected peasant');

  grove();
  act('rtsOrder', a, { ids: [p2.id], kind: 'mine', x: 86.5, y: 56.5 });
  tick(1);
  act('rtsOrder', a, { ids: [p2.id], kind: 'stop' });
  tick(1);
  assert.ok(p2.task === 'idle' && !p2.area, 'stop makes it idle');
  console.log('PASS stop');

  game.give(near, 'wood', 9 - (near.inventory.wood || 0)); // exactly 9
  act('rtsOrder', a, { ids: [p1.id], kind: 'build', x: 66.5, y: 60.5 });
  assert.equal(near.inventory.wood, 1, 'the chest paid for the new chest');
  tick(15);
  assert.ok([...game.entities.values()].some((e) => e.type === 'chest' && e.x === 66.5 && e.y === 60.5), 'the new chest was built');
  console.log('PASS a peasant builds a chest, paid from the chests');

  game.give(near, 'wood', RTS.trainCost.wood);
  const before = peasants().length;
  act('rtsTrain', a, {});
  assert.equal(a.rtsQueue, 1, 'a peasant is queued');
  tick(RTS.trainTime + 1);
  assert.equal(peasants().length, before + 1, 'a peasant was trained');
  console.log('PASS training a peasant');

  act('rts', a, { on: false });
  tick(1);
  assert.equal(peasants().length, before + 1, 'peasants stay when the hero comes back');
  act('rts', a, { on: true });
  assert.equal(peasants().length, before + 1, 'and no free peasants on the way back in');
  console.log('PASS peasants stay between RTS sessions');

  for (const c of [...game.entities.values()].filter((e) => e.type === 'chest')) game.despawn(c.id);
  grove();
  act('rtsOrder', a, { kind: 'mine', x: 86.5, y: 56.5 });
  tick(20);
  assert.ok(peasants().some((e) => e.task === 'waiting' && e.carry), 'without a chest peasants wait with their load');
  console.log('PASS without a chest the peasants wait');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { setTimeout(() => process.exit(process.exitCode || 0), 100); }
