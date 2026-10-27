// TEAM PLAYER (server): melee, blocking, parrying, death and respawn.
// All damage goes through game.damage(), which emits a 'damage' event first;
// the guard logic below cancels hits by listening to it.
import { registries, onAction, onEvent, registerSystem } from '../../shared/registry.js';

const PARRY_WINDOW = 0.25;   // seconds after pressing guard (no shield)
const PARRY_COOLDOWN = 0.6;  // so mashing RMB does not parry everything
const STUN = 1.2;            // seconds a parried attacker stays stunned
const STAMINA_REGEN = 1;     // stamina per second while not running
const REGEN_DELAY = 0.8;     // seconds after running stops before stamina refills
const WINDED_UNTIL = 0.3;    // after running dry, no running until this fraction of maxStamina
const HEALTH_REGEN_INTERVAL = 10; // seconds between recovered health points

// Melee: hit everything with hp in a short arc in front of the player.
// The held item's `damage` decides how hard (the sword: 2, anything else: 1).
onAction('attack', (game, player) => {
  if ((player._attackCooldown || 0) > game.time || player.guarding) return;
  player._attackCooldown = game.time + 0.35;
  const held = registries.items.get(player.hotbar?.[player.selected]);
  const cx = player.x + player.dir.x * 0.8, cy = player.y + player.dir.y * 0.8;
  for (const e of game.near(cx, cy, 0.9, (e) => e.hp > 0 && e.type !== 'player')) {
    if (game.damage(e, held?.damage ?? 1, player)) game.knockback(e, player.x, player.y, 0.6);
  }
  game.broadcast('swing', { id: player.id });
});

onAction('guard', (game, player, { on }) => {
  player.guarding = !!on;
  if (on && game.time >= (player._parryReadyAt || 0)) {
    player._parryUntil = game.time + PARRY_WINDOW;
    player._parryReadyAt = game.time + PARRY_COOLDOWN;
  }
});

// Running: the client moves faster while `running`; stamina here decides whether it may.
onAction('run', (game, player, { on }) => {
  player.running = !!on && !player.winded && player.stamina > 0;
});

registerSystem('stamina', (game, dt) => {
  for (const p of game.players()) {
    const max = p.maxStamina ?? 4;
    p.stamina ??= max;
    if (p.running) {
      p.stamina -= dt;
      p._staminaRegenAt = game.time + REGEN_DELAY;
      if (p.stamina <= 0) { p.stamina = 0; p.running = false; p.winded = true; }
    } else if (game.time >= (p._staminaRegenAt || 0) && p.stamina < max) {
      p.stamina = Math.min(max, p.stamina + STAMINA_REGEN * dt);
    }
    if (p.winded && p.stamina >= max * WINDED_UNTIL) p.winded = false;
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

// New players start with a sword (once per name; returning players keep what they have).
onEvent('playerJoined', (game, p) => {
  if (p._kit) return;
  p._kit = true;
  game.give(p, 'sword');
});

// Respawn dead players at the island center with full health.
registerSystem('respawn', (game) => {
  for (const p of game.players()) {
    if (p.hp > 0) continue;
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.running = p.winded = false;
    const spot = game.world.findWalkable();
    game.teleport(p, spot.x, spot.y);
    game.sendTo(p.id, 'died', {});
  }
});

// Recover one health point at a time while alive, without exceeding maxHp.
registerSystem('health-regen', (game, dt) => {
  for (const p of game.players()) {
    if (!(p.hp > 0) || !(p.hp < p.maxHp)) {
      p._healthRegen = 0;
      continue;
    }
    p._healthRegen = (p._healthRegen || 0) + dt;
    if (p._healthRegen >= HEALTH_REGEN_INTERVAL) {
      const points = Math.floor(p._healthRegen / HEALTH_REGEN_INTERVAL);
      p.hp = Math.min(p.maxHp, p.hp + points);
      p._healthRegen = p.hp >= p.maxHp ? 0 : p._healthRegen % HEALTH_REGEN_INTERVAL;
    }
  }
});
