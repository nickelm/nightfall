// TEAM CREATURES (server helper): spiders, zombies, skeletons, and bone arrows.
// Each one asks a different question of the players:
//   spider    leaps in from a few tiles away, even over walls: watch for the crouch
//   zombie    slow and tough; bashes doors open and wood walls down: build in stone
//   skeleton  keeps its distance and shoots: close in, or block with a shield
// All of them honor stunnedUntil, show `windup` before every attack, and hurt only
// through game.damage. Raiders (`raider`, `raid: { x, y }`) march on the base first.
import { registerSystem } from '../../shared/registry.js';
import { lineClear } from './light.js';

const R = 0.3; // body radius in tiles
const TURNS = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8];

const SPIDER = { leapMin: 0.5, leapMax: 4, windup: 0.35, speed: 9, hitRadius: 0.6, cooldown: 1.5 };
const ZOMBIE = { windup: 0.5, reach: 0.9, cooldown: 1.2 };
const SKELETON = { near: 5, far: 8, range: 9, windup: 0.6, cooldown: 2, arrowSpeed: 9, arrowRange: 12 };
// What a zombie can break, how long it takes, and what is left.
const BASH = { 'door-closed': { seconds: 2, becomes: 'door-open' }, 'wood-wall': { seconds: 5, becomes: 'gravel' } };

const fires = (game) => [...game.entities.values()].filter((e) => e.repels);
const fireAt = (list, x, y, pad = 0) => list.find((f) => Math.hypot(f.x - x, f.y - y) < f.light * 0.8 + pad);

function nearestPlayer(game, e, range) {
  let best = null, bestD = range;
  for (const p of game.players()) {
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (p.hp > 0 && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

// Who a monster is after and where it is heading. Raiders march on the base and only turn
// on players who come within 6 tiles; once they reach it, they hunt anyone within 25.
function goal(game, e) {
  if (e.raid) {
    const near = nearestPlayer(game, e, 6);
    if (near) return { target: near, x: near.x, y: near.y };
    if (Math.hypot(e.raid.x - e.x, e.raid.y - e.y) > 3) return { target: null, x: e.raid.x, y: e.raid.y };
    e.raid = null;
    e.aggro = 25;
  }
  const target = nearestPlayer(game, e, e.aggro || 8);
  return target && { target, x: target.x, y: target.y };
}

function stunned(game, e) {
  if ((e.stunnedUntil || 0) <= game.time) return false;
  e.windup = false;
  if (e.bashing) e.bashing = false;
  return true;
}

// Heading for this tick: flee firelight if caught inside (raiders do not care), else the goal,
// else wander. Returns { dx, dy, speed, free } where free(x, y) says whether a step is allowed.
function heading(game, e, g, fl) {
  const inside = !e.raider && fireAt(fl, e.x, e.y);
  const free = (x, y) => !game.world.blocked(x, y, R) && (e.raider || inside || !fireAt(fl, x, y));
  if (inside) return { dx: e.x - inside.x, dy: e.y - inside.y, speed: e.speed * 1.3, free };
  if (g) return { dx: g.x - e.x, dy: g.y - e.y, speed: e.speed, free };
  if (!e._wander || Math.random() < 0.01) e._wander = { x: Math.random() - 0.5, y: Math.random() - 0.5 };
  return { dx: e._wander.x, dy: e._wander.y, speed: e.speed * 0.4, free };
}

// Step along (dx, dy), veering around obstacles. Returns false if every direction is blocked.
function steer(e, { dx, dy, speed, free }, dt) {
  const base = Math.atan2(dy, dx), step = speed * dt;
  for (const turn of TURNS) {
    const nx = e.x + Math.cos(base + turn) * step, ny = e.y + Math.sin(base + turn) * step;
    if (free(nx, ny)) { e.x = nx; e.y = ny; return true; }
  }
  return false;
}

// Monsters of one type keep a little distance so packs spread out instead of stacking.
function spread(game, e, dt) {
  for (const o of game.entities.values()) {
    if (o === e || o.type !== e.type) continue;
    const ox = e.x - o.x, oy = e.y - o.y, dist = Math.hypot(ox, oy);
    if (dist > 0 && dist < 2 * R) {
      const nx = e.x + (ox / dist) * dt, ny = e.y + (oy / dist) * dt;
      if (!game.world.blocked(nx, ny, R)) { e.x = nx; e.y = ny; }
    }
  }
}

// --- spider: skitter close, crouch (windup), leap ------------------------------------------

function land(game, s) {
  s.leaping = false;
  if (!game.world.blocked(s.x, s.y, R)) return;
  // came down inside something solid: slide back along the leap until there is room
  for (let i = 1; i <= 20; i++) {
    const x = s.x - s._vx * 0.02 * i, y = s.y - s._vy * 0.02 * i;
    if (!game.world.blocked(x, y, R)) { s.x = x; s.y = y; return; }
  }
  s.x = s._from.x; s.y = s._from.y;
}

registerSystem('spider-ai', (game, dt) => {
  const fl = fires(game);
  for (const s of game.entities.values()) {
    if (s.type !== 'spider') continue;
    if (stunned(game, s)) { if (s.leaping) land(game, s); continue; }

    if (s.leaping) { // airborne: fly over anything, bite the first player we touch
      s.x += s._vx * dt; s.y += s._vy * dt;
      s._leapLeft -= dt;
      const hit = !s._bit && game.players().find((p) => p.hp > 0 && Math.hypot(p.x - s.x, p.y - s.y) < SPIDER.hitRadius);
      if (hit) { s._bit = true; game.damage(hit, s.damage, s); }
      if (s._leapLeft <= 0 || !game.world.inBounds(s.x, s.y)) land(game, s);
      continue;
    }

    const g = goal(game, s), t = g?.target;
    if (s.windup) { // crouched: jump at where the target is now
      if (game.time < s._leapAt) continue;
      s.windup = false;
      s._nextLeap = game.time + SPIDER.cooldown + Math.random() * 0.5;
      if (!t) continue;
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.hypot(dx, dy) || 1;
      s._vx = (dx / dist) * SPIDER.speed; s._vy = (dy / dist) * SPIDER.speed;
      s._leapLeft = (dist + 0.3) / SPIDER.speed;
      s._from = { x: s.x, y: s.y };
      s._bit = false;
      s.leaping = true;
      continue;
    }

    const dist = t ? Math.hypot(t.x - s.x, t.y - s.y) : Infinity;
    if (t && dist >= SPIDER.leapMin && dist <= SPIDER.leapMax && (s._nextLeap || 0) < game.time) {
      s.windup = true;
      s._leapAt = game.time + SPIDER.windup;
      continue;
    }
    steer(s, heading(game, s, g, fl), dt);
    spread(game, s, dt);
  }
});

// --- zombie: shamble, bash through doors and wood walls, bite -----------------------------

function bashAhead(game, z, angle, dt) {
  const tx = Math.floor(z.x + Math.cos(angle) * (R + 0.4)), ty = Math.floor(z.y + Math.sin(angle) * (R + 0.4));
  const tile = game.world.tile(tx, ty), rule = tile && BASH[tile.name];
  if (!rule) return false;
  const key = `${tx},${ty}`;
  if (z._bashKey !== key) { z._bashKey = key; z._bash = 0; }
  z._bash += dt;
  z.bashing = true;
  if (z._bash >= rule.seconds) {
    game.setTile(tx, ty, rule.becomes);
    game.broadcast('bash', { x: tx + 0.5, y: ty + 0.5, broke: tile.name });
    z._bash = 0;
    z.bashing = false;
  }
  return true;
}

registerSystem('zombie-ai', (game, dt) => {
  const fl = fires(game);
  for (const z of game.entities.values()) {
    if (z.type !== 'zombie') continue;
    if (stunned(game, z)) continue;
    const g = goal(game, z), t = g?.target;

    if (!z.windup) {
      const h = heading(game, z, g, fl), angle = Math.atan2(h.dy, h.dx);
      const straight = h.free(z.x + Math.cos(angle) * h.speed * dt, z.y + Math.sin(angle) * h.speed * dt);
      // something breakable in the way of where we want to go: smash it instead of walking around
      if (!(g && !straight && bashAhead(game, z, angle, dt))) {
        z.bashing = false;
        steer(z, h, dt);
      }
      spread(game, z, dt);
    }

    const dist = t ? Math.hypot(t.x - z.x, t.y - z.y) : Infinity;
    if (t && !z.windup && dist < ZOMBIE.reach && (z._nextBite || 0) < game.time) {
      z.windup = true;
      z.bashing = false;
      z._biteAt = game.time + ZOMBIE.windup;
    }
    if (z.windup && game.time >= z._biteAt) {
      z.windup = false;
      z._nextBite = game.time + ZOMBIE.cooldown;
      if (t && dist < ZOMBIE.reach + 0.2) game.damage(t, z.damage, z);
    }
  }
});

// --- skeleton: keep 5 to 8 tiles away, draw (windup), shoot ------------------------------

registerSystem('skeleton-ai', (game, dt) => {
  const fl = fires(game);
  for (const s of game.entities.values()) {
    if (s.type !== 'skeleton') continue;
    if (stunned(game, s)) continue;
    const g = goal(game, s), t = g?.target;

    if (s.windup) { // drawing the bow: stand still, then loose at where the target is now
      if (game.time < s._shootAt) continue;
      s.windup = false;
      s._nextShot = game.time + SKELETON.cooldown;
      if (t && lineClear(game.world, s, t)) shoot(game, s, t);
      continue;
    }

    const h = heading(game, s, g, fl);
    if (t && !fireAt(fl, s.x, s.y)) {
      const dist = Math.hypot(t.x - s.x, t.y - s.y), sees = lineClear(game.world, s, t);
      if (dist < SKELETON.near) { h.dx = -h.dx; h.dy = -h.dy; }   // too close: back off
      else if (dist <= SKELETON.far && sees) h.speed = 0;        // in the sweet spot: hold
      if (sees && dist <= SKELETON.range && (s._nextShot || 0) < game.time) {
        s.windup = true;
        s._shootAt = game.time + SKELETON.windup;
        s.aim = { x: (t.x - s.x) / dist, y: (t.y - s.y) / dist }; // public, so the bow points at you
        continue;
      }
    }
    if (h.speed > 0) steer(s, h, dt);
    spread(game, s, dt);
  }
});

function shoot(game, s, t) {
  const dx = t.x - s.x, dy = t.y - s.y, dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist, uy = dy / dist;
  s.aim = { x: ux, y: uy };
  game.spawn('bone-arrow', {
    x: s.x + ux * 0.4, y: s.y + uy * 0.4,
    vx: ux * SKELETON.arrowSpeed, vy: uy * SKELETON.arrowSpeed,
    damage: s.damage, owner: s.id, ttl: SKELETON.arrowRange / SKELETON.arrowSpeed,
  });
  game.broadcast('boneShot', { id: s.id, x: s.x, y: s.y });
}

// Bone arrows fly straight, stop at walls, and hit players only. The arrow is the damage
// source, so a shield blocks it when the player faces the arrow.
registerSystem('bone-arrows', (game, dt) => {
  const players = game.players();
  for (const a of [...game.entities.values()]) {
    if (a.type !== 'bone-arrow') continue;
    a.ttl -= dt;
    if (a.ttl <= 0) { game.despawn(a.id); continue; }
    for (let i = 0; i < 3; i++) {
      a.x += a.vx * dt / 3;
      a.y += a.vy * dt / 3;
      if (game.world.isSolid(a.x, a.y)) { game.despawn(a.id); break; }
      const p = players.find((pl) => pl.hp > 0 && Math.hypot(pl.x - a.x, pl.y - a.y) < 0.45);
      if (p) { game.damage(p, a.damage, a); game.despawn(a.id); break; }
    }
  }
});
