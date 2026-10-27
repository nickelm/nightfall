// Hazard tiles (thorns, lava) and the glow over lava pools. State lives on entities and `game`.
import { registerSystem } from '../../shared/registry.js';

const GLOW_CELL = 4;        // one lava-glow light per 4x4 cell that contains lava
const GLOW_RECHECK = 5;     // seconds between checks for glows whose lava is gone

// Anything with hp standing on a tile with `hurts` takes damage on entry and then
// every `hurts.every` seconds. No source, so guarding cannot block it.
registerSystem('hazards', (game) => {
  for (const e of [...game.entities.values()]) {
    if (!(e.hp > 0)) continue;
    const hurts = game.world.tile(e.x, e.y)?.hurts;
    if (!hurts || game.time < (e._hurtAt || 0)) continue;
    e._hurtAt = game.time + hurts.every;
    game.damage(e, hurts.damage, null);
  }
});

function cellHasLava(world, cx, cy) {
  for (let y = cy; y < cy + GLOW_CELL; y++) for (let x = cx; x < cx + GLOW_CELL; x++) {
    if (world.tile(x, y)?.name === 'lava') return true;
  }
  return false;
}

// Tiles cannot shine, so invisible lights sit over lava. The first run after a
// (re)start replaces any restored glows; a hot swap keeps `game` and skips this.
registerSystem('lava-glow', (game) => {
  const world = game.world;
  if (!game._lavaGlowReady) {
    for (const e of [...game.entities.values()]) if (e.type === 'lava-glow') game.despawn(e.id);
    for (let cy = 0; cy < world.h; cy += GLOW_CELL) {
      for (let cx = 0; cx < world.w; cx += GLOW_CELL) {
        let n = 0, sx = 0, sy = 0;
        for (let y = cy; y < cy + GLOW_CELL; y++) for (let x = cx; x < cx + GLOW_CELL; x++) {
          if (world.tile(x, y)?.name === 'lava') { n++; sx += x + 0.5; sy += y + 0.5; }
        }
        if (n) game.spawn('lava-glow', { x: sx / n, y: sy / n, _cell: [cx, cy] });
      }
    }
    game._lavaGlowReady = true;
    game._lavaGlowCheckAt = game.time + GLOW_RECHECK;
  }
  if (game.time < game._lavaGlowCheckAt) return;
  game._lavaGlowCheckAt = game.time + GLOW_RECHECK;
  for (const e of [...game.entities.values()]) {
    if (e.type === 'lava-glow' && e._cell && !cellHasLava(world, e._cell[0], e._cell[1])) game.despawn(e.id);
  }
});
