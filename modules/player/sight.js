// TEAM PLAYER (helper for both sides): who a spell may target, and whether the
// caster can see it. Server and client run the same checks, so the target ring
// on the client agrees with what the server allows.

// Which spell each mouse button casts on a foe, a friend, or yourself while holding the staff.
export const SPELL_FOR = {
  left: { foe: 'fireball', friend: 'mend', self: 'mend' },
  right: { foe: 'firestorm', friend: 'heal', self: 'nova' },
};

/** 'foe' (monsters and predators), 'friend' (another living player), 'self', or null. */
export function relation(caster, e) {
  if (!e || !(e.hp > 0)) return null;
  if (e.id === caster.id) return 'self';
  if (e.hostile || e.predator) return 'foe';
  if (e.type === 'player') return 'friend';
  return null;
}

/** True when no `opaque` tile lies between the two points (the target tile itself
 *  never blocks). The same walk as lineOfSight in client/core/vision.js. */
export function clearLine(world, x0, y0, x1, y1) {
  const tx1 = Math.floor(x1), ty1 = Math.floor(y1);
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2.5);
  let lastX = Math.floor(x0), lastY = Math.floor(y0);
  for (let i = 1; i < steps; i++) {
    const tx = Math.floor(x0 + ((x1 - x0) * i) / steps), ty = Math.floor(y0 + ((y1 - y0) * i) / steps);
    if (tx === lastX && ty === lastY) continue;
    lastX = tx; lastY = ty;
    if (tx === tx1 && ty === ty1) return true;
    if (world.tile(tx, ty)?.opaque) return false;
  }
  return true;
}
