// TEAM CREATURES (server): spawning and AI. Creatures are server-owned entities;
// moving them here moves them on every client automatically.
import { registries, registerSystem, onEvent } from '../../shared/registry.js';
import { updateDirector, noteDamage } from './director.js';
import './farm-server.js';
import { dropLoot, updateDrops } from './loot.js';
const WINDUP = 0.4; // seconds of visible wind-up before a bite lands: the parry cue
const SLIMES = new Set(['slime', 'blood-slime']); // types that run the slime AI below

// Share of director spawns that are blood slimes: rare on the first night, more later.
const bloodChance = (game, horde) => horde ? 0.1 : Math.min(0.4, 0.1 + 0.08 * (game.timeOfDay().day - 1));

// Burning campfires (entities with repels: true) keep monsters out of most of their light.
const fires = (game) => [...game.entities.values()].filter((e) => e.repels);
const fireAt = (list, x, y, pad = 0) => list.find((f) => Math.hypot(f.x - x, f.y - y) < f.light * 0.8 + pad);

const bodyRadius = (size) => 0.3 * (size || 1); // collision radius in tiles; slimes are size 1
const typeSize = (type) => registries.entityTypes.get(type)?.defaults?.size || 1;

// Where and when monsters appear is up to the game director (director.js).
// This is how it spawns one slime near a player: out of sight and out of protected light.
// Horde members spawn further out, all from the same direction, and hunt from afar.
export function spawnSlime(game, player, { horde, angle }) {
  const fl = fires(game);
  // Electric lamps prevent spawning throughout their illuminated radius without
  // repelling monsters that have already spawned. An unpowered lamp has light 0.
  const lamps = [...game.entities.values()].filter((e) => e.type === 'redstone-lamp' && e.light > 0);
  for (let tries = 0; tries < 12; tries++) {
    const a = horde ? angle + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
    const d = horde ? 13 + Math.random() * 3 : 9 + Math.random() * 5;
    const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
    const type = Math.random() < bloodChance(game, horde) ? 'blood-slime' : 'slime';
    if (!game.world.blocked(x, y, bodyRadius(typeSize(type))) && !fireAt(fl, x, y, 1) &&
        !lamps.some((lamp) => Math.hypot(lamp.x - x, lamp.y - y) < lamp.light)) {
      return game.spawn(type, { x, y, ...(horde ? { aggro: 25 } : {}) });
    }
  }
  return null;
}

registerSystem('director', (game, dt) => updateDirector(game, dt, spawnSlime));
onEvent('damage', (game, hit) => noteDamage(game, hit));

// Debug view for tuning: clients press F3 to see this.
registerSystem('director-debug', (game) => {
  const d = game.director;
  if (!d || game.time - (d._sentAt || 0) < 1) return;
  d._sentAt = game.time;
  game.broadcast('director', { state: d.state, budget: d.budget, threat: d.threat, intensity: d.intensity, factors: d.factors, hordes: d.hordes });
});

// Chase the nearest player within `aggro` tiles (8; hordes 25), otherwise wander. Never step into
// fire light; flee it if caught inside (a fire can burn out or be lit nearby).
// Bites are telegraphed: `windup` is public so clients can draw it.
registerSystem('slime-ai', (game, dt) => {
  const fl = fires(game);
  for (const s of game.entities.values()) {
    if (!SLIMES.has(s.type)) continue;
    const size = s.size || 1, r = bodyRadius(size);
    if ((s.stunnedUntil || 0) > game.time) { s.windup = false; continue; }

    let target = null, best = s.aggro || 8;
    for (const p of game.players()) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < best) { best = d; target = p; }
    }

    let dx, dy, speed = s.speed;
    const inside = fireAt(fl, s.x, s.y);
    if (inside) { dx = s.x - inside.x; dy = s.y - inside.y; speed *= 1.3; }
    else if (target) { dx = target.x - s.x; dy = target.y - s.y; }
    else {
      if (!s._wander || Math.random() < 0.01) s._wander = { x: Math.random() - 0.5, y: Math.random() - 0.5 };
      dx = s._wander.x; dy = s._wander.y; speed *= 0.4;
    }

    if (!s.windup) {
      const ok = (x, y) => !game.world.blocked(x, y, r) && (inside || !fireAt(fl, x, y));
      const base = Math.atan2(dy, dx), step = speed * dt;
      // try straight ahead first, then veer left/right around obstacles
      for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
        const nx = s.x + Math.cos(base + turn) * step, ny = s.y + Math.sin(base + turn) * step;
        if (ok(nx, ny)) { s.x = nx; s.y = ny; break; }
      }
    }

    // keep a little distance from other slimes so packs spread out instead of stacking
    for (const o of game.entities.values()) {
      if (o === s || !SLIMES.has(o.type)) continue;
      const ox = s.x - o.x, oy = s.y - o.y, dist = Math.hypot(ox, oy);
      if (dist > 0 && dist < 0.3 * (size + (o.size || 1))) {
        const nx = s.x + (ox / dist) * dt, ny = s.y + (oy / dist) * dt;
        if (!game.world.blocked(nx, ny, r)) { s.x = nx; s.y = ny; }
      }
    }

    // bite: wind up, then land the hit if the target is still in reach
    if (target && !s.windup && best < 0.7 + r - 0.3 && (s._nextBite || 0) < game.time) {
      s.windup = true;
      s._biteAt = game.time + WINDUP;
    }
    if (s.windup && game.time >= s._biteAt) {
      s.windup = false;
      s._nextBite = game.time + 1;
      if (target && Math.hypot(target.x - s.x, target.y - s.y) < 0.9 + r - 0.3) game.damage(target, s.damage, s);
    }
  }
});

// Killed monsters drop loot (tables in loot.js); players walk over drops to pick them up.
onEvent('killed', (game, victim) => dropLoot(game, victim));
registerSystem('drops', updateDrops);

// Slimes (blood slimes too) melt at dawn.
onEvent('dawn', (game) => {
  for (const e of [...game.entities.values()]) if (SLIMES.has(e.type)) game.despawn(e.id);
});
