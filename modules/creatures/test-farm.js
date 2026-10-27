// Real-server multiplayer regression for capture, pen care, and moving animals.
// Run: node modules/creatures/test-farm.js
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { registries } from '../../shared/registry.js';

process.env.PORT = '8103';
process.env.SEED = '4242';
process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const { ANIMALS } = await import('./shared.js');
const clients = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(25); }
  assert.ok(fn(), 'condition reached before timeout');
}
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8103');
  const c = { ws, send: msg => ws.send(JSON.stringify(msg)), events: [] };
  clients.push(c);
  c.action = (name, data) => c.send({ t: 'action', name, data });
  c.move = (x, y) => c.send({ t: 'move', x, y, dir: { x: 1, y: 0 } });
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.id = m.id;
    if (m.t === 'snap') c.snap = m;
    if (m.t === 'event') c.events.push(m);
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  c.send({ t: 'hello', name });
  await until(() => c.me());
  return c;
}
async function equip(c, item) {
  c.action('hotbar', { slot: 0, item }); c.action('select', { slot: 0 });
  await until(() => c.me().hotbar[0] === item && c.me().selected === 0);
}
async function emptyHand(c) {
  const slot = c.me().hotbar.findIndex(item => !item);
  assert.notEqual(slot, -1, 'an empty hotbar slot is available');
  c.action('select', { slot });
  await until(() => c.me().selected === slot);
}

let failed = false;
try {
  const a = await connect('Farmer'), b = await connect('Observer');
  const player = game.entities.get(a.id);
  // Normal spawning runs on the real server; retry the next population tick if
  // a random placement happens to fall entirely on blocked terrain.
  for (let i = 0; i < 8 && !Object.keys(ANIMALS).every(type => [...game.entities.values()].some(e => e.type === type)); i++) {
    game._animalSpawnAt = 0; await sleep(150);
  }
  for (const type of Object.keys(ANIMALS)) assert.ok([...game.entities.values()].some(e => e.type === type), `${type} spawns in the field`);
  console.log('PASS  all four animals spawn naturally in the field');
  game._animalSpawnAt = Infinity;
  for (const entity of [...game.entities.values()]) if (entity.animal) game.despawn(entity.id);

  for (let y = 78; y <= 82; y++) for (let x = 78; x <= 84; x++) game.setTile(x, y, 'grass');
  b.move(70.5, 70.5); a.move(80.5, 80.5);
  await until(() => player.x === 80.5 && player.y === 80.5);
  game.give(player, 'wood', 5);
  a.action('craft', { recipe: 'animal-pen' });
  await until(() => a.me().inventory['animal-pen'] === 1);
  assert.ok(!player.inventory.wood, 'wood is consumed when the pen is crafted');
  await equip(a, 'animal-pen');
  a.action('use', { x: 82, y: 80 });
  await until(() => [...game.entities.values()].some(e => e.type === 'animal-pen'));
  const pen = [...game.entities.values()].find(e => e.type === 'animal-pen');
  await until(() => b.snap.entities.some(e => e.id === pen.id));
  console.log('PASS  a wooden pen can be crafted, placed, and seen by another player');

  const care = registries.systems.find(s => s.name.endsWith('/animal-care')).fn;
  for (const [species, info] of Object.entries(ANIMALS)) {
    const animal = game.spawn(species, { x: 81.5, y: 80.5, speed: 0 });
    a.move(70.5, 70.5); await until(() => player.x === 70.5);
    a.action('interact', { x: 81, y: 80 }); await sleep(100);
    assert.ok(game.entities.has(animal.id), 'a distant animal cannot be caught');
    a.move(80.5, 80.5); await until(() => player.x === 80.5);
    a.action('interact', { x: 81, y: 80 });
    await until(() => a.me().inventory[species] === 1 && !game.entities.has(animal.id));
    await equip(a, species);
    a.action('interact', { x: 82, y: 80 });
    await until(() => pen.animal === species && !a.me().inventory[species]);
    await until(() => b.snap.entities.find(e => e.id === pen.id)?.animal === species);
    assert.equal(pen.growth, 0);
    care(game, 60);
    assert.equal(pen.growth, 0, 'an unfed animal does not grow or produce');
    assert.equal(pen.stock, 0);

    game.give(player, 'pumpkin', 1);
    await until(() => a.me().inventory.pumpkin === 1);
    await equip(a, 'pumpkin');
    a.action('interact', { x: 82, y: 80 });
    await until(() => pen.feed > 0 && !a.me().inventory.pumpkin);
    care(game, 50);
    assert.ok(pen.growth >= 0.999, 'fed animal becomes fully grown');
    assert.equal(pen.stock, 1, 'grown animal produces its first item');
    await until(() => b.snap.entities.find(e => e.id === pen.id)?.stock === 1);
    await emptyHand(a);
    a.action('interact', { x: 82, y: 80 });
    await until(() => a.me().inventory[info.product] === 1 && pen.stock === 0);
    assert.equal(pen.animal, species, 'collecting a product leaves the animal in the pen');
    // Newly collected items may automatically fill the selected empty slot.
    await emptyHand(a);
    a.action('interact', { x: 82, y: 80 });
    await until(() => a.me().inventory[species] === 1 && !pen.animal);
    await equip(a, species);
    a.action('use', { x: 81, y: 80 });
    await until(() => [...game.entities.values()].some(e => e.type === species) && !a.me().inventory[species]);
    const released = [...game.entities.values()].find(e => e.type === species);
    released.speed = 0;
    a.action('interact', { x: 81, y: 80 });
    await until(() => a.me().inventory[species] === 1 && !game.entities.has(released.id));
    await equip(a, species);
    a.action('interact', { x: 82, y: 80 });
    await until(() => pen.animal === species);
    assert.ok(pen.growth >= 0.999, 'growth survives retrieval, release, and recapture');
    await emptyHand(a);
    a.action('interact', { x: 82, y: 80 });
    await until(() => !pen.animal && a.me().inventory[species] === 1);
    game.give(player, species, -1);
    game.give(player, info.product, -1);
    await until(() => !a.me().inventory[species] && !a.me().inventory[info.product]);
    console.log(`PASS  ${species}: capture, feeding, growth, ${info.product}, release, and progress preservation`);
  }
  await emptyHand(a);
  a.action('interact', { x: 82, y: 80 });
  await until(() => !game.entities.has(pen.id) && a.me().inventory['animal-pen'] === 1);
  console.log('PASS  empty pens can be picked up and moved');

  // Exercise the live tick loop, not just the movement helper: all species stay
  // within a closed wall enclosure as they wander and both clients see them.
  for (let y = 90; y <= 98; y++) for (let x = 92; x <= 100; x++) {
    game.setTile(x, y, x === 92 || x === 100 || y === 90 || y === 98 ? 'wood-wall' : 'grass');
  }
  const enclosed = Object.keys(ANIMALS).map((species, i) => game.spawn(species, {
    x: 97.5, y: 92.5 + i, speed: 4, _walk: { x: 1, y: 0, until: game.time + 60 },
  }));
  const end = Date.now() + 2000;
  while (Date.now() < end) {
    for (const animal of enclosed) {
      assert.ok(animal.x > 93 && animal.x < 100 && animal.y > 91 && animal.y < 98,
        `${animal.type} stays inside the walls`);
    }
    await sleep(25);
  }
  await until(() => enclosed.every(animal => b.snap.entities.some(e => e.id === animal.id)));
  enclosed.forEach(animal => game.despawn(animal.id));
  console.log('PASS  all four species remain inside a closed enclosure on the live server');
} catch (err) { failed = true; console.error(err); }
finally { clients.forEach(c => c.ws.close()); }
console.log(failed ? 'Animal checks failed' : 'All animal checks passed');
process.exit(failed ? 1 : 0);
