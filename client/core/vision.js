// Fog of war. Owned by: Integration.
// Sight is shared: each client shows the union of what every player sees,
// while the camera stays on its own player. Each client tracks per tile:
//   seen     some player has seen this tile at some point (drawn dimmed)
//   visible  some player sees it right now (drawn normally; entities show)
// A tile is visible when it is within VIEW_RADIUS of a player, in line of sight (tiles
// with `opaque: true` block the view), and, once it gets dark, lit by some
// entity with a `light` radius (your torch, campfires, other players' torches).

export const VIEW_RADIUS = 13;
const NEEDS_LIGHT_ABOVE = 0.45; // darkness level where unlit tiles stop being visible

export function createVision(world) {
  return { seen: new Uint8Array(world.w * world.h), visible: new Uint8Array(world.w * world.h), list: [] };
}

function lineOfSight(world, x0, y0, x1, y1) {
  const tx1 = Math.floor(x1), ty1 = Math.floor(y1);
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2.5);
  let lastX = Math.floor(x0), lastY = Math.floor(y0);
  for (let i = 1; i < steps; i++) {
    const tx = Math.floor(x0 + ((x1 - x0) * i) / steps), ty = Math.floor(y0 + ((y1 - y0) * i) / steps);
    if (tx === lastX && ty === lastY) continue;
    lastX = tx; lastY = ty;
    if (tx === tx1 && ty === ty1) return true; // the target itself may be opaque: you see the wall
    if (world.tile(tx, ty)?.opaque) return false;
  }
  return true;
}

// Mark every tile one viewer at (cx, cy) can see.
function markVisibleFrom(world, v, cx, cy, lights, needLight) {
  const R = VIEW_RADIUS;
  for (let ty = Math.floor(cy - R); ty <= Math.ceil(cy + R); ty++) {
    for (let tx = Math.floor(cx - R); tx <= Math.ceil(cx + R); tx++) {
      if (!world.inBounds(tx, ty)) continue;
      const i = ty * world.w + tx;
      if (v.visible[i]) continue; // another player already sees it
      const px = tx + 0.5, py = ty + 0.5;
      if ((px - cx) ** 2 + (py - cy) ** 2 > R * R) continue;
      if (needLight && !lights.some((l) => (l.x - px) ** 2 + (l.y - py) ** 2 <= l.r2)) continue;
      if (!lineOfSight(world, cx, cy, px, py)) continue;
      v.visible[i] = 1;
      v.seen[i] = 1;
      v.list.push(i);
    }
  }
}

export function updateVision(game) {
  const v = game.vision, world = game.world;
  if (!v || !game.me) return;
  for (const i of v.list) v.visible[i] = 0;
  v.list.length = 0;

  const needLight = game.timeOfDay().darkness > NEEDS_LIGHT_ABOVE;
  const lights = [];
  if (needLight) {
    for (const e of game.entities.values()) {
      if (e.light > 0) lights.push({ x: e._rx ?? e.x, y: e._ry ?? e.y, r2: (e.light * 0.85) ** 2 });
    }
  }

  for (const e of game.entities.values()) {
    if (e.type === 'player') markVisibleFrom(world, v, e._rx ?? e.x, e._ry ?? e.y, lights, needLight);
  }
}

/** Can any player see world position (x, y) right now? */
export function canSee(game, x, y) {
  const w = game.world;
  if (!game.vision || !w.inBounds(Math.floor(x), Math.floor(y))) return false;
  return game.vision.visible[Math.floor(y) * w.w + Math.floor(x)] === 1;
}
