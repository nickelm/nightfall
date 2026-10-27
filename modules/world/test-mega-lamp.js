// Real-server multiplayer checks for the four-lamp upgrade.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
process.env.PORT = '8121'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const { spawnSlime } = await import('../creatures/server.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 7000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(20); }
  assert.ok(fn(), 'condition reached before timeout');
}
const sockets = [];
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8121'), c = { ws };
  sockets.push(ws); c.action = (name, data) => ws.send(JSON.stringify({ t: 'action', name, data }));
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'welcome') c.id = m.id; if (m.t === 'snap') c.snap = m; });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'hello', name })); await until(() => c.me()); return c;
}
async function equip(c, item) {
  c.action('hotbar', { slot: 0, item }); c.action('select', { slot: 0 });
  await until(() => c.me().hotbar[0] === item && c.me().selected === 0);
}
async function emptyHand(c) {
  const slot = c.me().hotbar.findIndex(item => !item); assert.notEqual(slot, -1);
  c.action('select', { slot }); await until(() => c.me().selected === slot);
}
try {
  const a = await connect('MegaBuilder'), b = await connect('MegaObserver');
  const p = game.entities.get(a.id); game._animalSpawnAt = Infinity;
  await until(() => game._lavaGlowReady);
  for (const e of [...game.entities.values()]) if (e.type === 'lava-glow' || e.animal) game.despawn(e.id);
  for (let y = 77; y <= 84; y++) for (let x = 78; x <= 100; x++) game.setTile(x, y, 'grass');
  a.ws.send(JSON.stringify({ t: 'move', x: 81.5, y: 79.5, dir: { x: 1, y: 0 } }));
  b.ws.send(JSON.stringify({ t: 'move', x: 70.5, y: 70.5, dir: { x: 1, y: 0 } }));
  await until(() => p.x === 81.5 && p.y === 79.5);
  game.give(p, 'redstone-lamp', 3); a.action('craft', { recipe: 'mega-lamp' }); await sleep(200);
  assert.ok(!p.inventory['mega-lamp']); assert.equal(p.inventory['redstone-lamp'], 3);
  game.give(p, 'redstone-lamp', 1); a.action('craft', { recipe: 'mega-lamp' });
  await until(() => p.inventory['mega-lamp'] === 1); assert.ok(!p.inventory['redstone-lamp']);
  console.log('PASS four lamps craft one mega lamp and fewer than four cannot');
  await equip(a, 'mega-lamp'); a.action('use', { x: 82, y: 80 });
  await until(() => [...game.entities.values()].some(e => e.lampItem === 'mega-lamp' && e.light === 15));
  const lamp = [...game.entities.values()].find(e => e.lampItem === 'mega-lamp');
  assert.equal(lamp.type, 'redstone-lamp'); assert.equal(lamp.on, true);
  await until(() => b.snap.entities.some(e => e.id === lamp.id && e.light === 15));
  game.give(p, 'redstone-wire', 1); await equip(a, 'redstone-wire'); a.action('use', { x: 83, y: 80 });
  await until(() => game.world.tile(83, 80).powered);
  console.log('PASS the mega lamp is self-powered, lights radius 15, powers wire, and synchronizes');
  const savedRandom = Math.random;
  try {
    Math.random = () => 0;
    const fake = { entities: new Map([[lamp.id, lamp]]), world: { blocked: () => false }, timeOfDay: () => ({ day: 1 }), spawn: () => ({}) };
    assert.equal(spawnSlime(fake, { x: 83.5, y: 80.5 }, { horde: false }), null, 'monster spawn at radius 10 is blocked');
  } finally { Math.random = savedRandom; }
  const slime = game.spawn('slime', { x: 92.5, y: 80.5, hp: 3, speed: 0, stunnedUntil: game.time + 15 });
  await until(() => !game.entities.has(slime.id), 5000);
  console.log('PASS the expanded radius blocks monster spawning and burns monsters beyond ordinary lamp range');
  await emptyHand(a); a.action('interact', { x: 82, y: 80 });
  await until(() => !lamp.on && lamp.light === 0 && !game.world.tile(83, 80).powered);
  await until(() => b.snap.entities.some(e => e.id === lamp.id && e.light === 0));
  game.give(p, 'pickaxe', 1); await equip(a, 'pickaxe'); a.action('interact', { x: 82, y: 80 });
  await until(() => !game.entities.has(lamp.id) && p.inventory['mega-lamp'] === 1);
  console.log('PASS switching off and reclaiming returns the mega lamp');
} catch (err) { console.error(err); process.exitCode = 1; }
finally { sockets.forEach(ws => ws.close()); setTimeout(() => process.exit(process.exitCode || 0), 100); }
