// TEAM CREATURES (server helper): light and line of sight. Opaque walls cast shadows;
// glass and other transparent tiles do not.

/** True if no opaque tile lies strictly between a and b. */
export function lineClear(world, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const steps = Math.ceil(Math.hypot(dx, dy) * 2.5);
  let lastX = Math.floor(a.x), lastY = Math.floor(a.y);
  for (let i = 1; i < steps; i++) {
    const x = Math.floor(a.x + dx * i / steps), y = Math.floor(a.y + dy * i / steps);
    if (x === lastX && y === lastY) continue;
    lastX = x; lastY = y;
    if (x === Math.floor(b.x) && y === Math.floor(b.y)) return true;
    if (world.tile(x, y)?.opaque) return false;
  }
  return true;
}

export function lightReaches(world, source, target) {
  const dx = target.x - source.x, dy = target.y - source.y;
  if (dx * dx + dy * dy > source.light * source.light) return false;
  return lineClear(world, source, target);
}

/** Is (x, y) inside the light of any of `lights` (entities with light > 0)? */
export function isLit(game, x, y, lights = [...game.entities.values()].filter((e) => e.light > 0)) {
  return lights.some((l) => lightReaches(game.world, l, { x, y }));
}
