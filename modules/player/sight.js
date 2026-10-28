// TEAM PLAYER (helper for both sides): which spell each casting item fires, who a
// spell may target, and whether the caster can see it. Server and client run the
// same checks, so the target ring on the client agrees with what the server allows.

// Per casting item and mouse button: the spell cast at a foe, a friend, yourself, or
// empty ground. A button with nothing for what is under the cursor does its usual
// thing (swing, mine, guard). Staff: offensive magic. Mace: defensive (cleric) magic.
export const SPELLS_BY_ITEM = {
  staff: {
    left: { foe: 'fireball', self: 'nova', ground: 'fireball' },
    right: { foe: 'firestorm', ground: 'firestorm' },
  },
  mace: {
    left: { friend: 'heal', self: 'heal' },
    right: { friend: 'mend', self: 'mend' },
  },
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
