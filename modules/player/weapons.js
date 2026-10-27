// TEAM PLAYER (server helper): attack kinds. An item's `weapon.kind` picks one of
// these; items without a `weapon` field use melee. A new weapon of an existing kind
// is just data in shared.js; a new kind is one more function here.
import { registries } from '../../shared/registry.js';
import { relation, clearLine } from './sight.js';

const SUBSTEPS = 3; // per tick, so fast arrows cannot skip past a slime
const TAUNT_RADIUS = 5;  // tiles: a sword swing draws every foe this close that can see you
const TAUNT_SECONDS = 4; // creature AI chases `tauntedBy` until `tauntedUntil` (modules/creatures)

// Mark foes within reach and sight as taunted: they go after this player instead
// of whoever is nearest, which lets a sword fighter shield the mages behind them.
function taunt(game, player) {
  const foes = game.near(player.x, player.y, TAUNT_RADIUS, (e) => relation(player, e) === 'foe' && clearLine(game.world, player.x, player.y, e.x, e.y));
  for (const e of foes) {
    e.tauntedBy = player.id;
    e.tauntedUntil = game.time + TAUNT_SECONDS;
  }
  if (foes.length) game.broadcast('taunt', { id: player.id, x: player.x, y: player.y, count: foes.length });
}

export const ATTACKS = {
  // Hit everything with hp in a short arc in front of the player.
  melee(game, player, def) {
    const reach = def?.weapon?.reach ?? 0.9;
    const cx = player.x + player.dir.x * 0.8, cy = player.y + player.dir.y * 0.8;
    for (const e of game.near(cx, cy, reach, (e) => e.hp > 0 && e.type !== 'player')) {
      if (game.damage(e, def?.damage ?? 1, player)) game.knockback(e, player.x, player.y, 0.6);
    }
    if (def?.weapon?.kind === 'melee') taunt(game, player); // swords taunt; tools and fists do not
    game.broadcast('swing', { id: player.id });
  },

  // Spend one ammo item and launch a projectile in the aim direction.
  ranged(game, player, def) {
    const w = def.weapon;
    if (!game.has(player, w.ammo)) {
      game.sendTo(player.id, 'noAmmo', { item: w.ammo });
      return;
    }
    game.give(player, w.ammo, -1);
    const ammo = registries.items.get(w.ammo)?.ammo || {};
    const speed = w.speed ?? 14;
    game.spawn(w.projectile || 'arrow', {
      x: player.x + player.dir.x * 0.5, y: player.y + player.dir.y * 0.5,
      vx: player.dir.x * speed, vy: player.dir.y * speed,
      damage: ammo.damage ?? 1, owner: player.id, ttl: (w.range ?? 12) / speed,
    });
    game.broadcast('shot', { id: player.id, item: def.name });
  },
};

// Move every projectile (an entity with vx, vy, and ttl); it stops at the first
// solid tile or the first damageable non-player it touches.
export function stepProjectiles(game, dt) {
  for (const e of [...game.entities.values()]) {
    if (e.type !== 'arrow') continue;
    e.ttl -= dt;
    if (e.ttl <= 0) { game.despawn(e.id); continue; }
    const owner = game.entities.get(e.owner) || null;
    for (let i = 0; i < SUBSTEPS; i++) {
      e.x += e.vx * dt / SUBSTEPS;
      e.y += e.vy * dt / SUBSTEPS;
      if (game.world.isSolid(e.x, e.y)) { game.despawn(e.id); break; }
      const target = game.near(e.x, e.y, 0.45, (t) => t.hp > 0 && t.type !== 'player' && t.id !== e.id)[0];
      if (target) {
        if (game.damage(target, e.damage, owner)) game.knockback(target, e.x - e.vx, e.y - e.vy, 0.3);
        game.despawn(e.id);
        break;
      }
    }
  }
}
