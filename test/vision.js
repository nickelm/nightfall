import assert from 'node:assert/strict';
import { createVision, updateVision, canSee } from '../client/core/vision.js';

const wall = new Set();
const world = { w: 300, h: 300, inBounds: (x, y) => x >= 0 && y >= 0 && x < 300 && y < 300,
  tile: (x, y) => ({ opaque: wall.has(`${x},${y}`) }) };
const viewer = { id: 1, type: 'player', x: 100.5, y: 100.5, light: 2.5 };
const remote = { id: 2, type: 'player', x: 200.5, y: 200.5, light: 2.5 };
const edgeLight = { id: 3, x: 127, y: 100.5, light: 18 };
const lights = new Map([[1, viewer], [2, remote], [3, edgeLight]]);
for (let i = 0; i < 500; i++) lights.set(i + 10, { x: 260 + i % 30, y: 260 + i % 30, light: 2.6 });
let darkness = 0.8;
const game = { world, vision: createVision(world), entities: lights, me: viewer, timeOfDay: () => ({ darkness }) };
updateVision(game);
assert.ok(canSee(game, 112, 100), 'a distant, large light can reach the edge of the view');
assert.ok(canSee(game, 200, 200), 'each player contributes to shared vision');
assert.ok(!canSee(game, 108, 108), 'unlit ground is hidden at night');
wall.add('105,100'); updateVision(game);
assert.ok(!canSee(game, 112, 100), 'opaque tiles block sight');
wall.clear(); darkness = 0; updateVision(game);
assert.ok(canSee(game, 108, 108), 'daylight does not require a light source');
viewer.x = 120.5; updateVision(game);
assert.ok(game.vision.seen[100 * world.w + 100], 'exploration stays recorded after moving');
console.log('PASS shared vision, distant lights, walls, day/night and explored tiles');
