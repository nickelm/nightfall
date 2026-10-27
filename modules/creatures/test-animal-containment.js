// Animal movement must not tunnel through a closed enclosure, even with a long tick.
import assert from 'node:assert/strict';
import { loadModules } from '../../shared/loader.js';
import { registries } from '../../shared/registry.js';
import { World } from '../../shared/world.js';
import { ANIMALS } from './shared.js';

await loadModules('server', path => import(`../${path}`));
const wander = registries.systems.find(system => system.name.endsWith('/animal-wander')).fn;
const world = new World(12, 12, 1);
for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) world.set(x, y, 'grass');
for (let i = 3; i <= 8; i++) {
  world.set(i, 3, 'wood-wall'); world.set(i, 8, 'wood-wall');
  world.set(3, i, 'wood-wall'); world.set(8, i, 'wood-wall');
}
const game = { world, time: 1, entities: new Map(), near: () => [] };
for (const species of Object.keys(ANIMALS)) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const animal = { type: species, animal: true, x: 5.5, y: 5.5, speed: 5, _walk: { x: dx, y: dy, until: Infinity } };
    game.entities = new Map([[1, animal]]);
    wander(game, 2); // would cross the enclosure and land beyond the far wall without swept collision
    assert.ok(animal.x >= 4.3 && animal.x <= 7.7 && animal.y >= 4.3 && animal.y <= 7.7,
      `${species} stays in the enclosure while moving ${dx},${dy}`);
    assert.ok(!world.blocked(animal.x, animal.y), 'animal never ends inside a wall');
  }
}
console.log('PASS all four animals stay inside solid walls and corners, including during long ticks');

world.set(8, 5, 'door-closed');
const pig = { type: 'pig', animal: true, x: 7.4, y: 5.5, speed: 1, _walk: { x: 1, y: 0, until: Infinity } };
game.entities = new Map([[1, pig]]); wander(game, 3);
assert.ok(pig.x < 7.7, 'closed door blocks the animal');
world.set(8, 5, 'door-open'); pig._walk.until = Infinity; wander(game, 3);
assert.ok(pig.x > 8.3, 'open door lets the animal out intentionally');
console.log('PASS closed doors hold animals; open doors allow passage');

const pen = { type: 'animal-pen', animal: 'cow', x: 5.5, y: 5.5, growth: 0.5 };
game.entities = new Map([[1, pen]]);
for (let i = 0; i < 100; i++) wander(game, 10);
assert.equal(pen.animal, 'cow'); assert.equal(game.entities.size, 1);
console.log('PASS an animal housed in a pen stays stored there while wandering runs');
