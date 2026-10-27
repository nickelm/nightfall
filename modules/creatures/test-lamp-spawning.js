import assert from 'node:assert/strict';
import { spawnSlime } from './server.js';

// Fix the director's random choices so every attempt targets a known position.
const random = Math.random;
Math.random = () => 0;
try {
  const lamp = { type: 'redstone-lamp', x: 9, y: 0, light: 6 };
  const game = {
    entities: new Map([[1, lamp]]),
    world: { blocked: () => false },
    timeOfDay: () => ({ day: 1 }),
    spawn: (type, fields) => ({ type, ...fields }),
  };
  const player = { x: 0, y: 0 };
  const normal = { horde: false };
  assert.equal(spawnSlime(game, player, normal), null, 'powered lamp blocks regular spawns');
  lamp.light = 0;
  assert.ok(spawnSlime(game, player, normal), 'unpowered lamp allows regular spawns');
  lamp.light = 6;
  lamp.x = 15.1;
  assert.ok(spawnSlime(game, player, normal), 'spawning remains possible outside the light radius');
  lamp.x = 13;
  assert.equal(spawnSlime(game, player, { horde: true, angle: 0.5 }), null, 'powered lamp also blocks horde spawns');
  lamp.light = 0;
  assert.ok(spawnSlime(game, player, { horde: true, angle: 0.5 }), 'unpowered lamp allows horde spawns');
  console.log('PASS powered lamps block regular and horde spawning within their radius; unpowered lamps do not');
} finally {
  Math.random = random;
}
