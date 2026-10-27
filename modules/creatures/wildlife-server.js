// TEAM CREATURES (server helper): wildlife, the daytime danger. Predators roam out of sight
// of the players, picked by the biome they spawn in:
//   temperate  wolf packs (fast: run, or stand together) and bears (slow, territorial, hit hard)
//   snow       snow-wolf packs and polar bears
//   desert     lions that stalk low and slow, then charge
// A predator hunts players within `aggro`, calls its pack when it spots or is hurt by one,
// and gives up when it is `leash` tiles from home. Wolves and lions run when badly hurt.
// They spawn only by day, but whatever is out at dusk keeps hunting. Campfires keep them out.
import { registerSystem, onEvent } from '../../shared/registry.js';
import { PREDATORS } from './shared.js';
import { stunned, heading, steer, spread, nearestPlayer, taunter } from './monsters-server.js';

export const WILDLIFE = {
  every: 5,               // seconds between population checks
  perPlayer: 4,           // predators allowed within `range` of a player (half on day 1)
  range: 45,
  spawnMin: 22,           // tiles from the player: out of sight
  spawnMax: 32,
  fireGap: 15,            // no spawns this close to a burning fire
  despawn: 70,            // predators this far from every player vanish
  packCall: 15,           // tiles within which pack mates join the hunt
  biomes: {
    temperate: [{ type: 'wolf', weight: 3, group: [2, 4] }, { type: 'bear', weight: 1, group: [1, 1] }],
    snow:      [{ type: 'snow-wolf', weight: 2, group: [2, 4] }, { type: 'polar-bear', weight: 2, group: [1, 1] }],
    desert:    [{ type: 'lion', weight: 1, group: [1, 2] }],
  },
};

const LION_CHARGE = { range: 4.5, seconds: 0.9, every: 5 };

const fires = (game) => [...game.entities.values()].filter((e) => e.repels);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The biome around (x, y), read from the ground: mostly snow or frost is snow, mostly
// desert sand is desert (a beach next to grass is not), mostly water is nothing.
const SNOWY = /snow|frost/, SANDY = /^(sand|desert-tree|sandstone-rock)$/;
export function biomeAt(world, x, y) {
  let snow = 0, sand = 0, land = 0;
  for (let dy = -6; dy <= 6; dy += 2) {
    for (let dx = -6; dx <= 6; dx += 2) {
      const t = world.tile(x + dx, y + dy);
      if (!t || t.name === 'water') continue;
      land++;
      if (SNOWY.test(t.name)) snow++;
      else if (SANDY.test(t.name)) sand++;
    }
  }
  if (land < 20) return null; // of 49 samples
  if (snow / land > 0.5) return 'snow';
  if (sand / land > 0.6) return 'desert';
  return 'temperate';
}

function pick(table) {
  let r = Math.random() * table.reduce((sum, e) => sum + e.weight, 0);
  for (const entry of table) if ((r -= entry.weight) < 0) return entry;
  return table[0];
}

/** Spawn one group (a pack, a bear, a pride) somewhere out of sight of `player`. */
export function spawnGroup(game, player) {
  const fl = fires(game);
  for (let tries = 0; tries < 10; tries++) {
    const a = Math.random() * Math.PI * 2, d = WILDLIFE.spawnMin + Math.random() * (WILDLIFE.spawnMax - WILDLIFE.spawnMin);
    const x = Math.floor(player.x + Math.cos(a) * d) + 0.5, y = Math.floor(player.y + Math.sin(a) * d) + 0.5;
    if (game.world.blocked(x, y) || game.world.tile(x, y)?.structure || fl.some((f) => dist(f, { x, y }) < WILDLIFE.fireGap)) continue;
    const biome = biomeAt(game.world, x, y);
    if (!biome) continue;
    const { type, group } = pick(WILDLIFE.biomes[biome]);
    const n = group[0] + Math.floor(Math.random() * (group[1] - group[0] + 1));
    const pack = n > 1 ? `${type}@${Math.floor(x)},${Math.floor(y)},${Math.floor(game.time)}` : null;
    const out = [];
    for (let i = 0; i < n; i++) {
      let sx = x + (Math.random() - 0.5) * 2, sy = y + (Math.random() - 0.5) * 2;
      if (game.world.blocked(sx, sy)) { sx = x; sy = y; }
      out.push(game.spawn(type, { x: sx, y: sy, _home: { x, y }, ...(pack ? { _pack: pack } : {}) }));
    }
    return out;
  }
  return [];
}

registerSystem('wildlife-population', (game) => {
  if (game.time < (game._wildlifeAt || 0)) return;
  game._wildlifeAt = game.time + WILDLIFE.every;
  const players = game.players();
  const predators = [...game.entities.values()].filter((e) => e.predator);
  for (const e of predators) if (!players.some((p) => dist(p, e) < WILDLIFE.despawn)) game.despawn(e.id);
  const tod = game.timeOfDay();
  if (tod.isNight || !players.length) return;
  const player = players[Math.floor(Math.random() * players.length)];
  const cap = tod.day <= 1 ? Math.ceil(WILDLIFE.perPlayer / 2) : WILDLIFE.perPlayer;
  if (predators.filter((e) => game.entities.has(e.id) && dist(e, player) < WILDLIFE.range).length < cap) spawnGroup(game, player);
});

// Set a predator (and its pack) on a player.
function alert(game, e, target) {
  if (e._target !== target.id) game.broadcast('spotted', { id: e.id });
  for (const o of game.entities.values()) {
    if (o === e || (e._pack && o._pack === e._pack && !o.fleeing && dist(o, e) < WILDLIFE.packCall)) o._target = target.id;
  }
}

// Fight back when hurt, and bring the pack.
onEvent('damage', (game, hit) => {
  const e = hit.target;
  if (!e.predator || hit.cancelled || hit.source?.type !== 'player' || e.fleeing) return;
  e._calmUntil = 0;
  alert(game, e, hit.source);
});

registerSystem('wildlife-ai', (game, dt) => {
  const fl = fires(game);
  for (const e of game.entities.values()) {
    const def = e.predator && PREDATORS[e.type];
    if (!def) continue;
    if (stunned(game, e)) { e.charging = false; continue; }
    e._home ||= { x: e.x, y: e.y };
    const fromHome = dist(e, e._home);

    // badly hurt: run for a while, then go home and leave people alone
    if (!e._fled && def.fleeAt && e.hp <= e.maxHp * def.fleeAt) {
      e._fled = true; e.fleeing = true; e._fleeUntil = game.time + 6;
      e._target = null; e.windup = false; e.charging = false;
    }
    if (e.fleeing && game.time > e._fleeUntil) { e.fleeing = false; e._calmUntil = game.time + 30; }

    const taunted = !e.fleeing && taunter(game, e); // a sword swing turns predators on the fighter
    if (taunted) e._target = taunted.id;
    let t = e._target != null ? game.entities.get(e._target) : null;
    if (t && (!(t.hp > 0) || fromHome > def.leash)) { // lost interest
      t = null; e._target = null; e._calmUntil = game.time + 6;
    }
    if (!t && !e.fleeing && game.time > (e._calmUntil || 0)) {
      t = nearestPlayer(game, e, e.aggro);
      if (t) alert(game, e, t);
    }

    let g = null;
    if (e.fleeing) {
      const p = nearestPlayer(game, e, 30);
      if (p) g = { x: 2 * e.x - p.x, y: 2 * e.y - p.y };
    } else if (t) g = t;
    else if (fromHome > def.leash * 0.5) g = e._home;

    const d = t ? dist(e, t) : Infinity;
    e.stalking = false;
    if (!e.windup) {
      const h = heading(game, e, g, fl);
      if (e.fleeing) h.speed = e.speed * 1.2;
      else if (!t && g) h.speed = e.speed * 0.5;           // trotting home
      else if (def.charge && t) {                           // lions: stalk, then charge
        if (!e.charging && d < LION_CHARGE.range && game.time > (e._nextCharge || 0)) {
          e.charging = true;
          e._chargeUntil = game.time + LION_CHARGE.seconds;
          e._nextCharge = game.time + LION_CHARGE.every;
          game.broadcast('roar', { id: e.id, x: e.x, y: e.y });
        }
        if (e.charging && game.time > e._chargeUntil) e.charging = false;
        if (e.charging) h.speed = def.charge; else e.stalking = true;
      }
      steer(e, h, dt);
      spread(game, e, dt);
    }

    // bite (bears maul and knock you back)
    const reach = def.knock ? 1.1 : 0.9;
    if (t && !e.windup && !e.fleeing && d < reach && (e._nextBite || 0) < game.time) {
      e.windup = true;
      e.charging = false;
      e._biteAt = game.time + def.bite;
    }
    if (e.windup && game.time >= e._biteAt) {
      e.windup = false;
      e._nextBite = game.time + def.cooldown;
      if (t && d < reach + 0.2 && game.damage(t, e.damage, e) && def.knock) game.knockback(t, e.x, e.y, def.knock);
    }
  }
});
