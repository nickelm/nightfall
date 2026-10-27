// TEAM CREATURES (server): spawning and AI. Creatures are server-owned entities;
// moving them here moves them on every client automatically.
import { registries, registerSystem, onEvent } from '../../shared/registry.js';
import { updateDirector, noteDamage, pickType, TUNING } from './director.js';
import { lightReaches, isLit } from './light.js';
import './farm-server.js';
import './dynamite-server.js';
import './monsters-server.js';
import { dropLoot, updateDrops } from './loot.js';
const WINDUP = 0.4; // seconds of visible wind-up before a bite lands: the parry cue
const SLIMES = new Set(['slime', 'blood-slime']); // types that run the slime AI below
// Everything that crawls out at night and is gone by morning.
const NIGHT_MONSTERS = new Set([...SLIMES, 'spider', 'zombie', 'skeleton', 'bone-arrow']);

// Share of slime spawns that are blood slimes: rare on the first night, more later.
const bloodChance = (game, horde) => horde ? 0.1 : Math.min(0.4, 0.1 + 0.08 * (game.timeOfDay().day - 1));

// Burning campfires (entities with repels: true) keep monsters out of most of their light.
const fires = (game) => [...game.entities.values()].filter((e) => e.repels);
const fireAt = (list, x, y, pad = 0) => list.find((f) => Math.hypot(f.x - x, f.y - y) < f.light * 0.8 + pad);

const bodyRadius = (size) => 0.3 * (size || 1); // collision radius in tiles; slimes are size 1
const typeSize = (type) => registries.entityTypes.get(type)?.defaults?.size || 1;
const protectedFromSpawns = (entities, x, y) => entities.some(e => e.spawnProtection > 0 && Math.hypot(e.x - x, e.y - y) < e.spawnProtection);

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
// This is how it spawns one monster near a player: out of sight and out of protected light.
//   horde  further out, all from the same direction (`angle`), and hunting from afar
//   raid   `player` is the base: raiders gather `raidDistance` tiles out and march on it
//   dark   on any unlit tile a few tiles from the player, even inside walls
// `type` defaults to the director's table for tonight; slimes may come out as blood slimes.
export function spawnMonster(game, player, { horde, angle, type, dark, raid } = {}) {
  type ||= pickType(game.timeOfDay().day);
  if (type === 'slime' && Math.random() < bloodChance(game, horde)) type = 'blood-slime';
  const fl = fires(game);
  // Electric lamps prevent spawning throughout their illuminated radius without
  // repelling monsters that have already spawned. An unpowered lamp has light 0.
  const lamps = [...game.entities.values()].filter((e) => e.type === 'redstone-lamp' && e.light > 0);
  const shelters = [...game.entities.values()].filter((e) => e.spawnProtection > 0);
  const lights = dark ? [...game.entities.values()].filter((e) => e.light > 0) : null;
  const r = bodyRadius(typeSize(type));
  for (let tries = 0; tries < 12; tries++) {
    let x, y;
    if (raid) {
      const a = angle + (Math.random() - 0.5) * 0.8, d = TUNING.raidDistance + Math.random() * 4;
      x = player.x + Math.cos(a) * d; y = player.y + Math.sin(a) * d;
    } else if (dark) {
      const a = Math.random() * Math.PI * 2, d = TUNING.darkMin + Math.random() * (TUNING.darkMax - TUNING.darkMin);
      x = Math.floor(player.x + Math.cos(a) * d) + 0.5; y = Math.floor(player.y + Math.sin(a) * d) + 0.5;
    } else {
      const a = horde ? angle + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
      const d = horde ? 13 + Math.random() * 3 : 9 + Math.random() * 5;
      x = player.x + Math.cos(a) * d; y = player.y + Math.sin(a) * d;
    }
    if (game.world.blocked(x, y, r) || overlapsBuiltBlock(game.world, x, y, r) || (!raid && fireAt(fl, x, y, 1)) ||
        lamps.some((lamp) => Math.hypot(lamp.x - x, lamp.y - y) < lamp.light) ||
        protectedFromSpawns(shelters, x, y)) continue;
    if (dark && isLit(game, x, y, lights)) continue;
    const props = { x, y };
    if (horde) props.aggro = 25;
    if (raid) Object.assign(props, { raider: true, raid: { x: player.x, y: player.y } });
    const e = game.spawn(type, props);
    if (dark) game.broadcast('darkSpawn', { x, y, type });
    return e;
  }
  // no dark tile nearby (a well-lit base): come from out of sight the usual way instead
  return dark ? spawnMonster(game, player, { horde, angle, type, raid }) : null;
}

/** A slime (or blood slime) the way the director places any monster. */
export const spawnSlime = (game, player, opts = {}) => spawnMonster(game, player, { ...opts, type: 'slime' });

registerSystem('director', (game, dt) => updateDirector(game, dt, spawnMonster));
onEvent('damage', (game, hit) => noteDamage(game, hit));

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
  const census = {};
  for (const e of game.entities.values()) if (e.hostile && e.hp > 0) census[e.type] = (census[e.type] || 0) + 1;
  game.broadcast('director', {
    state: d.state, budget: d.budget, threat: d.threat, intensity: d.intensity, factors: d.factors, hordes: d.hordes,
    pulses: (d.pulses || []).map((p) => ({ in: p.at - game.time, n: p.n, kind: p.kind })),
    raidAt: d.raidAt ?? null, raid: d.raid || null, bloodMoon: !!d.bloodMoon, census,
  });
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
  const shelters = [...game.entities.values()].filter(e => e.spawnProtection > 0);
  let spawned = 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random();
    let x = victim.x + Math.cos(a) * 0.4, y = victim.y + Math.sin(a) * 0.4;
    if (game.world.blocked(x, y, r) || overlapsBuiltBlock(game.world, x, y, r)) { x = victim.x; y = victim.y; }
    if (game.world.blocked(x, y, r) || overlapsBuiltBlock(game.world, x, y, r) || protectedFromSpawns(shelters, x, y)) continue;
    game.spawn(victim.splitsInto, { x, y, aggro: victim.aggro, _nextBite: game.time + 0.8 });
    spawned++;
  }
  if (spawned) game.broadcast('split', { id: victim.id, x: victim.x, y: victim.y, into: victim.splitsInto, count: spawned });
});
registerSystem('drops', updateDrops);

// Night monsters (and their arrows) are gone at dawn.
onEvent('dawn', (game) => {
  for (const e of [...game.entities.values()]) if (NIGHT_MONSTERS.has(e.type)) game.despawn(e.id);
});
