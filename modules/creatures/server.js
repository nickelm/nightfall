// TEAM CREATURES (server): spawning and AI. Creatures are server-owned entities;
// moving them here moves them on every client automatically.
import { registries, registerSystem, onEvent } from '../../shared/registry.js';
import { updateDirector, noteDamage } from './director.js';
import './farm-server.js';
import './dynamite-server.js';
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

// A spawn footprint must avoid player-built tiles, including walkable ones such
// as open doors, wires and placed thorns. Ordinary mined ground is still valid.
function overlapsBuiltBlock(world, x, y, radius) {
  for (let ty = Math.floor(y - radius); ty <= Math.floor(y + radius); ty++) {
    for (let tx = Math.floor(x - radius); tx <= Math.floor(x + radius); tx++) {
      const tile = world.tile?.(tx, ty);
      if (!tile) continue;
      if (tile.structure || tile.redstoneWire) return true;
      if (world.edits?.has(`${tx},${ty}`) &&
          [...registries.items.values()].some(item => item.placesTile === tile.name)) return true;
    }
  }
  return false;
}

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
    const radius = bodyRadius(typeSize(type));
    if (!game.world.blocked(x, y, radius) && !overlapsBuiltBlock(game.world, x, y, radius) && !fireAt(fl, x, y, 1) &&
        !lamps.some((lamp) => Math.hypot(lamp.x - x, lamp.y - y) < lamp.light)) {
      return game.spawn(type, { x, y, ...(horde ? { aggro: 25 } : {}) });
    }
  }
  return null;
}

registerSystem('director', (game, dt) => updateDirector(game, dt, spawnSlime));
onEvent('damage', (game, hit) => noteDamage(game, hit));

// Opaque walls cast shadows; glass and other transparent tiles do not.
function lightReaches(world, source, target) {
  const dx = target.x - source.x, dy = target.y - source.y;
  if (dx * dx + dy * dy > source.light * source.light) return false;
  const steps = Math.ceil(Math.hypot(dx, dy) * 2.5);
  let lastX = Math.floor(source.x), lastY = Math.floor(source.y);
  for (let i = 1; i < steps; i++) {
    const x = Math.floor(source.x + dx * i / steps), y = Math.floor(source.y + dy * i / steps);
    if (x === lastX && y === lastY) continue;
    lastX = x; lastY = y;
    if (x === Math.floor(target.x) && y === Math.floor(target.y)) return true;
    if (world.tile(x, y)?.opaque) return false;
  }
  return true;
}

// All actual light sources burn hostiles once per second, regardless of overlap.
// Use game.damage so normal hit feedback, kills, and loot remain intact.
registerSystem('light-burn', game => {
  const entities = [...game.entities.values()];
  const lights = entities.filter(e => e.light > 0);
  for (const monster of entities) {
    if (!monster.hostile || !(monster.hp > 0)) continue;
    const lit = lights.some(light => light !== monster && lightReaches(game.world, light, monster));
    if (!lit) { delete monster._lightBurnAt; continue; }
    if (monster._lightBurnAt == null) { monster._lightBurnAt = game.time + 1; continue; }
    if (game.time < monster._lightBurnAt) continue;
    monster._lightBurnAt = game.time + 1;
    const { x, y } = monster;
    if (game.damage(monster, 1, null)) game.broadcast('lightBurn', { x, y });
  }
});

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

// Monsters with `splitsInto` burst into `splitCount` smaller ones when killed (not when
// they melt at dawn). The young keep the parent's aggro, so horde members keep hunting,
// and wait a moment before their first bite.
onEvent('killed', (game, victim) => {
  if (!victim.splitsInto || !registries.entityTypes.get(victim.splitsInto)) return;
  const n = victim.splitCount ?? 2, r = bodyRadius(typeSize(victim.splitsInto));
  let spawned = 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random();
    let x = victim.x + Math.cos(a) * 0.4, y = victim.y + Math.sin(a) * 0.4;
    if (game.world.blocked(x, y, r) || overlapsBuiltBlock(game.world, x, y, r)) { x = victim.x; y = victim.y; }
    if (game.world.blocked(x, y, r) || overlapsBuiltBlock(game.world, x, y, r)) continue;
    game.spawn(victim.splitsInto, { x, y, aggro: victim.aggro, _nextBite: game.time + 0.8 });
    spawned++;
  }
  if (spawned) game.broadcast('split', { id: victim.id, x: victim.x, y: victim.y, into: victim.splitsInto, count: spawned });
});
registerSystem('drops', updateDrops);

// Slimes (blood slimes too) melt at dawn.
onEvent('dawn', (game) => {
  for (const e of [...game.entities.values()]) if (SLIMES.has(e.type)) game.despawn(e.id);
});
