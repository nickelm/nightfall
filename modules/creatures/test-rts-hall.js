// HALL=1 dev mode: a Minas Tirith appears next to the first player and survives integrity checks.
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
process.env.PORT = '8128'; process.env.SEED = '4242'; process.env.START_TIME = '10'; process.env.HALL = '1';
process.env.STATE_FILE = path.join(os.tmpdir(), `nightfall-test-rts-hall-${process.pid}.json`);
const { game } = await import('../../server/index.js');
const { registries } = await import('../../shared/registry.js');

const tick = (seconds) => { for (let t = 0; t < seconds; t += 0.05) for (const s of registries.systems) s.fn(game, 0.05); };
try {
  for (const e of [...game.entities.values()]) game.despawn(e.id);
  game._devHall = false;
  const a = game.spawn('player', { name: 'A', x: 200.5, y: 200.5, inventory: {}, hp: 10, maxHp: 10 });
  tick(1);
  const halls = [...game.entities.values()].filter((e) => e.type === 'minas-tirith');
  assert.equal(halls.length, 1, 'one Minas Tirith was built');
  assert.ok(!game.world.blocked(a.x, a.y), 'the player stands on open ground');
  tick(1);
  assert.equal([...game.entities.values()].filter((e) => e.type === 'minas-tirith').length, 1, 'only once, and it stays');
  console.log(`PASS HALL=1 built Minas Tirith at ${halls[0].x}, ${halls[0].y}`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally { setTimeout(() => process.exit(process.exitCode || 0), 100); }
