// Headless checks for the night monsters and the director's new tricks:
// node modules/creatures/test-monsters.js
import assert from 'node:assert/strict';
import { registries } from '../../shared/registry.js';
import '../world/shared.js';
import './shared.js';
import { pickType, findBase } from './director.js';
import { isLit } from './light.js';
import { spawnMonster } from './server.js';

const tileId = (name) => registries.tileByName.get(name).id;

// A tiny world: grass everywhere, with whatever tiles the test places.
function mockGame(tiles = {}) {
  const tile = (x, y) => registries.tiles[tiles[`${Math.floor(x)},${Math.floor(y)}`] ?? tileId('grass')];
  const solid = (x, y) => !!tile(x, y).solid;
  const game = {
    time: 0,
    entities: new Map(),
    world: {
      tile, isSolid: solid, inBounds: () => true,
      blocked: (x, y, r = 0.3) => solid(x - r, y - r) || solid(x + r, y - r) || solid(x - r, y + r) || solid(x + r, y + r),
      edits: new Map(Object.entries(tiles)),
    },
    timeOfDay: () => ({ day: 1 }),
    players: () => [...game.entities.values()].filter((e) => e.type === 'player'),
    spawn(type, props) {
      const e = { id: game.entities.size + 1, type, ...JSON.parse(JSON.stringify(registries.entityTypes.get(type)?.defaults || {})), ...props };
      game.entities.set(e.id, e);
      return e;
    },
    despawn(id) { game.entities.delete(id); },
    setTile(x, y, name) { tiles[`${x},${y}`] = tileId(name); },
    broadcast: () => {},
    damage: () => 0,
  };
  return game;
}

for (let i = 0; i < 200; i++) assert.equal(pickType(1), 'slime', 'night 1 is slimes only');
const late = new Set(Array.from({ length: 400 }, () => pickType(4)));
for (const t of ['slime', 'spider', 'zombie', 'skeleton']) assert.ok(late.has(t), `later nights bring ${t}s`);
console.log('PASS monster table: slimes on night 1, the full cast later');

{ // light stops at opaque walls, so the far side of a wall is dark
  const game = mockGame({ '5,0': tileId('stone-block') });
  const light = { x: 0.5, y: 0.5, light: 20 };
  assert.ok(isLit(game, 3.5, 0.5, [light]), 'open ground in range is lit');
  assert.ok(!isLit(game, 8.5, 0.5, [light]), 'behind a wall is dark');
}
{
  const game = mockGame();
  const player = game.spawn('player', { x: 0.5, y: 0.5, hp: 5, light: 20 });
  for (let i = 0; i < 20; i++) { // no dark tile in reach: it comes from out of sight instead
    const e = spawnMonster(game, player, { dark: true, type: 'zombie' });
    assert.ok(Math.hypot(e.x - player.x, e.y - player.y) >= 9, 'no dark spawns in open light');
  }
  player.light = 0;
  assert.ok(spawnMonster(game, player, { dark: true, type: 'zombie' }), 'dark spawns appear in the dark');
  console.log('PASS darkness spawns: only on tiles no light reaches');
}

{ // the base is the fire with the most structures around it
  const walls = {};
  for (let i = 0; i < 6; i++) walls[`${50 + i},50`] = tileId('wood-wall');
  walls['10,10'] = tileId('wood-wall');
  const game = mockGame(walls);
  game.spawn('campfire', { x: 10, y: 12, repels: true, light: 5 });
  game.spawn('campfire', { x: 52, y: 52, repels: true, light: 5 });
  assert.deepEqual(findBase(game), { x: 52, y: 52 });
  assert.equal(findBase(mockGame()), null, 'no base without fires or structures');
  console.log('PASS findBase picks the fire with the most structures');
}

{ // a zombie walking into a closed door bashes it open in about two seconds
  const tiles = { '5,0': tileId('door-closed') };
  const game = mockGame(tiles);
  game.spawn('player', { x: 8.5, y: 0.5, hp: 5 });
  const z = game.spawn('zombie', { x: 4.5, y: 0.5 });
  const ai = registries.systems.find((s) => s.name.endsWith('/zombie-ai')).fn;
  let t = 0;
  while (t < 3 && tiles['5,0'] === tileId('door-closed')) { ai(game, 0.05); game.time = t += 0.05; }
  assert.equal(tiles['5,0'], tileId('door-open'), 'the door is forced open');
  assert.ok(t > 1.8 && t < 2.6, `it takes about two seconds (${t.toFixed(2)})`);
  assert.ok(z.x < 5, 'the zombie stays on its side while bashing');
  console.log('PASS zombies bash doors open');
}
