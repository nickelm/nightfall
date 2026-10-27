// TEAM PLAYER (server): melee, blocking, parrying, death and respawn.
// All damage goes through game.damage(), which emits a 'damage' event first;
// the guard logic below cancels hits by listening to it.
import { registries, onAction, onEvent, registerSystem } from '../../shared/registry.js';
import { ATTACKS, stepProjectiles } from './weapons.js';

const PARRY_WINDOW = 0.25;   // seconds after pressing guard (no shield)
const PARRY_COOLDOWN = 0.6;  // so mashing RMB does not parry everything
const STUN = 1.2;            // seconds a parried attacker stays stunned

// Attack with the held item: its `weapon.kind` picks the attack in weapons.js
// (melee arc, ranged shot); items without a `weapon` field swing in melee.
onAction('attack', (game, player) => {
  if ((player._attackCooldown || 0) > game.time || player.guarding) return;
  const def = registries.items.get(player.hotbar?.[player.selected]);
  const w = def?.weapon;
  const attack = ATTACKS[w?.kind] || ATTACKS.melee;
  player._attackCooldown = game.time + (w?.cooldown ?? 0.35);
  attack(game, player, def);
});

registerSystem('projectiles', stepProjectiles);

onAction('guard', (game, player, { on }) => {
  player.guarding = !!on;
  if (on && game.time >= (player._parryReadyAt || 0)) {
    player._parryUntil = game.time + PARRY_WINDOW;
    player._parryReadyAt = game.time + PARRY_COOLDOWN;
  }
});

// Guarding players cancel hits that come from the front.
onEvent('damage', (game, hit) => {
  const t = hit.target, src = hit.source;
  if (t.type !== 'player' || !t.guarding || !src || !t.dir) return;
  const dx = src.x - t.x, dy = src.y - t.y, len = Math.hypot(dx, dy) || 1;
  if ((dx / len) * t.dir.x + (dy / len) * t.dir.y < 0.35) return; // attack from the side or behind

  if (game.has(t, 'shield')) {
    hit.cancelled = true;
    game.knockback(src, t.x, t.y, 0.4);
    game.broadcast('block', { id: t.id, x: (t.x + src.x) / 2, y: (t.y + src.y) / 2 });
  } else if (game.time < (t._parryUntil || 0)) {
    hit.cancelled = true;
    game.knockback(src, t.x, t.y, 1.5);
    src.stunnedUntil = game.time + STUN; // public, so clients can draw it; creature AI respects it
    game.broadcast('parry', { id: t.id, target: src.id, x: (t.x + src.x) / 2, y: (t.y + src.y) / 2 });
  }
});

// Starting kit: a sword, plus a bow with 10 arrows. Bump KIT_VERSION to hand a new
// part of the kit to returning players too (they keep what they have).
const KIT_VERSION = 2;
onEvent('playerJoined', (game, p) => {
  const v = p._kitVersion || (p._kit ? 1 : 0);
  if (v < 1) game.give(p, 'sword');
  if (v < 2) { game.give(p, 'bow'); game.give(p, 'arrow', 10); }
  p._kit = true;
  p._kitVersion = KIT_VERSION;
});

// Respawn dead players at the island center with full health.
registerSystem('respawn', (game) => {
  for (const p of game.players()) {
    if (p.hp > 0) continue;
    p.hp = p.maxHp;
    const spot = game.world.findWalkable();
    game.teleport(p, spot.x, spot.y);
    game.sendTo(p.id, 'died', {});
  }
});
