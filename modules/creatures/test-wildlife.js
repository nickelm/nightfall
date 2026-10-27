// Headless checks for daytime wildlife: node modules/creatures/test-wildlife.js
import assert from 'node:assert/strict';
import { registries } from '../../shared/registry.js';
import '../world/shared.js';
import './shared.js';
import './server.js';
import { biomeAt, spawnGroup } from './wildlife-server.js';

const T = (name) => registries.tileByName.get(name);

// A world filled with `ground`, optionally a different tile left of x = split.
function mockGame(ground, { left, split = -Infinity } = {}) {
  const tile = (x) => (x < split ? T(left) : T(ground));
  const solid = (x, y) => !!tile(x, y).solid;
  const game = {
    time: 0,
    entities: new Map(),
    world: {
      tile, isSolid: solid, inBounds: () => true,
      blocked: (x, y, r = 0.3) => solid(x - r, y - r) || solid(x + r, y - r) || solid(x - r, y + r) || solid(x + r, y + r),
    },
    timeOfDay: () => ({ day: 2, isNight: false }),
    players: () => [...game.entities.values()].filter((e) => e.type === 'player'),
    spawn(type, props) {
      const e = { id: game.entities.size + 1, type, ...JSON.parse(JSON.stringify(registries.entityTypes.get(type)?.defaults || {})), ...props };
      game.entities.set(e.id, e);
      return e;
    },
    despawn(id) { game.entities.delete(id); },
    broadcast: () => {},
    hits: [],
    damage(target, amount, source) { game.hits.push({ target: target.id, amount, source: source.type }); target.hp -= amount; return amount; },
    knockback: () => {},
  };
  return game;
}
const ai = registries.systems.find((s) => s.name.endsWith('/wildlife-ai')).fn;
const run = (game, seconds) => { for (let t = 0; t < seconds; t += 0.05) { ai(game, 0.05); game.time += 0.05; } };

assert.equal(biomeAt(mockGame('snow').world, 50, 50), 'snow');
assert.equal(biomeAt(mockGame('sand').world, 50, 50), 'desert');
assert.equal(biomeAt(mockGame('grass').world, 50, 50), 'temperate');
assert.equal(biomeAt(mockGame('sand', { left: 'grass', split: 50 }).world, 50, 50), 'temperate', 'a beach by the grass is not a desert');
assert.equal(biomeAt(mockGame('water').world, 50, 50), null, 'nothing spawns at sea');
console.log('PASS biomes are read from the ground');

for (const [ground, types] of [['snow', ['snow-wolf', 'polar-bear']], ['sand', ['lion']], ['grass', ['wolf', 'bear']]]) {
  for (let i = 0; i < 20; i++) {
    const game = mockGame(ground);
    const group = spawnGroup(game, { x: 100, y: 100 });
    assert.ok(group.length >= 1 && group.every((e) => types.includes(e.type) && e.predator), `${ground} brings ${types.join(' or ')}`);
    assert.ok(group.every((e) => Math.hypot(e.x - 100, e.y - 100) > 20), 'out of sight');
  }
}
{
  const game = mockGame('grass');
  game.spawn('campfire', { x: 100, y: 100, repels: true, light: 5 });
  for (let i = 0; i < 20; i++) for (const e of spawnGroup(game, { x: 100, y: 100 })) assert.ok(Math.hypot(e.x - 100, e.y - 100) >= 15, 'never near a fire');
}
console.log('PASS each biome spawns its own predators, out of sight and away from fires');

{ // one wolf spots a player: the whole pack comes, and the first to arrive bites after a windup
  const game = mockGame('grass');
  const p = game.spawn('player', { x: 10, y: 10, hp: 10 });
  const wolves = [0, 1, 2].map((i) => game.spawn('wolf', { x: 16 + i * 1.5, y: 10, _pack: 'a', _home: { x: 17, y: 10 } }));
  run(game, 0.1);
  assert.ok(wolves.every((w) => w._target === p.id), 'the pack joins the hunt');
  run(game, 3);
  assert.ok(game.hits.some((h) => h.source === 'wolf'), 'wolves bite');
  console.log('PASS wolves hunt as a pack and bite');
}

{ // a wolf gives up when the chase drags it past its leash
  const game = mockGame('grass');
  const p = game.spawn('player', { x: 10, y: 10, hp: 1000 });
  const w = game.spawn('wolf', { x: 14, y: 10, _home: { x: 14, y: 10 } });
  run(game, 0.5);
  assert.equal(w._target, p.id);
  p.x = -40; w.x = -10;                          // dragged 24 tiles from home
  run(game, 0.1);
  assert.equal(w._target, null, 'it lets the player go');
  console.log('PASS predators give up past their leash');
}

{ // a lion stalks, then charges
  const game = mockGame('sand');
  game.spawn('player', { x: 10, y: 10, hp: 1000 });
  const lion = game.spawn('lion', { x: 19, y: 10, _home: { x: 19, y: 10 } });
  run(game, 0.2);
  assert.ok(lion.stalking && !lion.charging, 'stalking from afar');
  let charged = false;
  for (let i = 0; i < 100 && !charged; i++) { run(game, 0.05); charged = lion.charging; }
  assert.ok(charged, 'charges when close');
  console.log('PASS lions stalk, then charge');
}

{ // a badly hurt wolf runs
  const game = mockGame('grass');
  game.spawn('player', { x: 10, y: 10, hp: 1000 });
  const w = game.spawn('wolf', { x: 12, y: 10, hp: 1, _home: { x: 12, y: 10 } });
  run(game, 0.5);
  assert.ok(w.fleeing && w.x > 12, 'it flees');
  console.log('PASS hurt wolves flee');
}
