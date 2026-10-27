// Real-server regression for light damage, shadows, and ordinary kills.
import assert from 'node:assert/strict';
process.env.PORT = '8118'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(20); }
  assert.ok(fn(), 'condition reached before timeout');
}
try {
  await until(() => game._lavaGlowReady);
  for (const e of [...game.entities.values()]) if (e.type === 'lava-glow') game.despawn(e.id);
  for (let y = 76; y <= 84; y++) for (let x = 76; x <= 85; x++) game.setTile(x, y, 'grass');
  const lamp = game.spawn('redstone-lamp', { x: 80.5, y: 80.5, on: true });
  const animal = game.spawn('pig', { x: 82.5, y: 79.5, hp: 4, speed: 0 });
  const slime = game.spawn('slime', { x: 82.5, y: 80.5, speed: 0, stunnedUntil: game.time + 30 });
  let kills = 0; game.bus.on('killed', e => { if (e.id === slime.id) kills++; });
  await until(() => slime.hp === 2);
  assert.equal(animal.hp, 4, 'non-hostile animals are safe');
  const second = game.spawn('redstone-lamp', { x: 83.5, y: 80.5, on: true });
  await sleep(350); assert.equal(slime.hp, 2, 'overlapping lights do not stack');
  await until(() => !game.entities.has(slime.id), 3500);
  assert.equal(kills, 1, 'normal killed event fires once');
  console.log('PASS exposed monsters burn to death, overlapping lights do not stack, and animals stay safe');
  game.despawn(second.id); lamp.on = false; await until(() => lamp.light === 0);
  const dark = game.spawn('blood-slime', { x: 82.5, y: 80.5, speed: 0, stunnedUntil: game.time + 30 });
  await sleep(1300); assert.equal(dark.hp, 6, 'unpowered lamp does not burn');
  lamp.on = true; game.setTile(81, 80, 'stone');
  await sleep(1300); assert.equal(dark.hp, 6, 'opaque wall blocks light');
  game.setTile(81, 80, 'glass');
  await until(() => dark.hp === 5);
  lamp.on = false; await sleep(1200); assert.equal(dark.hp, 5, 'turning light off stops damage');
  console.log('PASS unpowered lamps and opaque walls stop damage; glass transmits it');
  game.despawn(dark.id);
  const torch = game.spawn('player', { x: 80.5, y: 80.5 });
  const torchTarget = game.spawn('slime', { x: 82.5, y: 80.5, speed: 0, stunnedUntil: game.time + 10 });
  await until(() => torchTarget.hp === 2);
  console.log('PASS the player torch burns monsters');
  game.despawn(torch.id);
} catch (err) { console.error(err); process.exitCode = 1; }
finally { setTimeout(() => process.exit(process.exitCode || 0), 100); }
