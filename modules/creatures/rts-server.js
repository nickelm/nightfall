// RTS mode (server): the 'rts' action swaps a player's hero for three peasants, and
// 'rtsOrder' sends them to mine around a spot. Each peasant walks a tile path (4-way BFS)
// to the nearest unclaimed harvestable tile in its area, mines it, and carries the load to
// the nearest chest (Survival's), where anyone can take it out.
import { registerSystem, onAction, onEvent } from '../../shared/registry.js';
import { RTS } from './shared.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const peasantsOf = (game, id) => [...game.entities.values()].filter((e) => e.type === 'peasant' && e.owner === id);
const halls = (game) => [...game.entities.values()].filter((e) => e.type === RTS.hall);
const chests = (game) => [...game.entities.values()].filter((e) => e.type === 'chest');
const nearest = (list, x, y) => list.reduce((best, e) => (!best || Math.hypot(e.x - x, e.y - y) < Math.hypot(best.x - x, best.y - y) ? e : best), null);
// Peasants mine anything harvestable except what players built.
const minable = (tile) => !!tile?.harvest && !tile.structure;

// Breadth-first search over walkable tiles from (sx, sy) until goal(x, y) holds.
// Returns the tile centers to walk through (empty if already there), or null.
function findPath(world, sx, sy, goal, limit = 40000) {
  sx = Math.floor(sx); sy = Math.floor(sy);
  const W = world.w, start = sy * W + sx;
  const from = new Map([[start, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length && head < limit; head++) {
    const i = queue[head], x = i % W, y = (i - x) / W;
    if (goal(x, y)) {
      const path = [];
      for (let j = i; j !== start; j = from.get(j)) path.push([(j % W) + 0.5, Math.floor(j / W) + 0.5]);
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, n = ny * W + nx;
      if (from.has(n) || !world.inBounds(nx, ny) || world.isSolid(nx, ny)) continue;
      from.set(n, i);
      queue.push(n);
    }
  }
  return null;
}

// Walk along e._path; true while there is still some way to go.
function walk(game, e, dt) {
  let step = e.speed * dt;
  while (e._path.length && step > 0) {
    const [tx, ty] = e._path[0];
    if (game.world.isSolid(tx, ty)) { e._path = []; e.task = e.carry ? 'return' : 'seek'; return true; } // something was built in the way
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d > 0.01) e.dir = { x: dx / d, y: dy / d };
    if (d <= step) { e.x = tx; e.y = ty; step -= d; e._path.shift(); }
    else { e.x += (dx / d) * step; e.y += (dy / d) * step; step = 0; }
  }
  return e._path.length > 0;
}

// Tell an owner something, at most once every few seconds.
function note(game, e, text) {
  const owner = game.entities.get(e.owner);
  if (!owner || (owner._rtsNoteAt ?? -1e9) > game.time - 4) return;
  owner._rtsNoteAt = game.time;
  game.sendTo(owner.id, 'rtsNote', { text });
}


function seek(game, e) {
  const { world } = game, area = e.area;
  if (!area) { e.task = 'idle'; return; }
  const claimed = new Set(peasantsOf(game, e.owner).filter((o) => o !== e && o._job).map((o) => `${o._job.x},${o._job.y}`));
  let job = null;
  const path = findPath(world, e.x, e.y, (x, y) => {
    let best = null;
    for (const [dx, dy] of DIRS) {
      const jx = x + dx, jy = y + dy, d = Math.hypot(jx + 0.5 - area.x, jy + 0.5 - area.y);
      if (d > RTS.radius || claimed.has(`${jx},${jy}`) || !minable(world.tile(jx, jy))) continue;
      if (!best || d < best.d) best = { x: jx, y: jy, d };
    }
    if (best) job = { x: best.x, y: best.y };
    return !!best;
  });
  if (!path) {
    e.task = 'idle'; e._job = null;
    note(game, e, 'Your peasants find nothing to mine there');
    return;
  }
  e._job = job; e._path = path; e.task = 'toMine';
}

// Head for the nearest chest: any walkable tile next to it (or under it) will do.
function goHome(game, e) {
  const chest = nearest(chests(game), e.x, e.y);
  const path = chest && findPath(game.world, e.x, e.y, (x, y) =>
    Math.abs(x + 0.5 - chest.x) <= 1.1 && Math.abs(y + 0.5 - chest.y) <= 1.1);
  if (!path) {
    e.task = 'waiting'; e._retry = 2;
    note(game, e, chest ? 'Your peasants cannot reach a chest' : 'Place a chest so your peasants can deliver');
    return;
  }
  e._path = path; e.task = 'toHall'; e._chest = chest.id;
}

function think(game, e, dt) {
  e._path ||= [];
  if (e._path.length && walk(game, e, dt)) return;
  switch (e.task) {
    case 'seek': seek(game, e); break;
    case 'toMine': {
      if (!minable(game.world.tile(e._job?.x, e._job?.y))) { e.task = 'seek'; break; } // someone got there first
      e.task = 'mining'; e._t = 0;
      e.dir = { x: e._job.x + 0.5 - e.x, y: e._job.y + 0.5 - e.y };
      break;
    }
    case 'mining': {
      const job = e._job, tile = game.world.tile(job?.x, job?.y);
      if (!minable(tile)) { e.task = 'seek'; e.work = 0; break; }
      const time = Math.min(RTS.maxMine, (tile.hardness ?? 1) * RTS.mineSlow);
      e._t += dt;
      e.work = Math.min(1, Math.round((e._t / time) * 100) / 100);
      if (e._t < time) break;
      e.carry = tile.harvest.item; e.carryCount = tile.harvest.count || 1;
      game.setTile(job.x, job.y, tile.harvest.becomes);
      game.broadcast('harvested', { x: job.x, y: job.y, item: tile.harvest.item, by: e.owner });
      e._job = null; e.work = 0;
      goHome(game, e);
      break;
    }
    case 'return': goHome(game, e); break;
    case 'waiting':
      if ((e._retry -= dt) <= 0) goHome(game, e);
      break;
    case 'toHall': {
      const chest = game.entities.get(e._chest);
      if (chest?.type !== 'chest' || Math.hypot(chest.x - e.x, chest.y - e.y) > 1.6) { goHome(game, e); break; } // picked up or moved
      if (e.carry) game.give(chest, e.carry, e.carryCount);
      e.carry = null; e.carryCount = 0; e._chest = null;
      e.task = e.area ? 'seek' : 'idle';
      break;
    }
  }
}

registerSystem('peasants', (game, dt) => {
  for (const e of game.entities.values()) {
    if (e.type !== 'peasant') continue;
    if (!game.entities.get(e.owner)?.rts) { game.despawn(e.id); continue; } // owner left RTS mode or the game
    think(game, e, dt);
  }
});

onAction('rts', (game, player, { on }) => {
  on = !!on;
  if (on === !!player.rts && (!on || peasantsOf(game, player.id).length)) return; // (after a restart the peasants are gone)
  player.rts = on;
  for (const e of peasantsOf(game, player.id)) game.despawn(e.id);
  if (!on) return;
  const chest = nearest(chests(game), player.x, player.y);
  // Next to the nearest chest if there is one, else where the hero stood.
  const cx = chest ? chest.x : player.x, cy = chest ? chest.y + 1 : player.y;
  for (let i = 0; i < RTS.peasants; i++) {
    const spot = game.world.findWalkable(cx + i - 1, cy, 20);
    game.spawn('peasant', { x: spot.x, y: spot.y, owner: player.id });
  }
});

onAction('rtsOrder', (game, player, { x, y }) => {
  if (!player.rts || !Number.isFinite(x) || !Number.isFinite(y)) return;
  for (const e of peasantsOf(game, player.id)) {
    e.area = { x, y };
    if (e.carry) continue; // finish the delivery first, then head out
    e.task = 'seek'; e._path = []; e._job = null; e.work = 0;
  }
});

// Dev mode: `node server/dev.js HALL=1` builds a Minas Tirith just north of the first player
// to join when there is none yet, clearing whatever stands in its way, and puts a chest
// beside its door for the peasants (unless a chest exists already). The layout matches
// Survival's (walls around, floor inside, a door in the middle of the south wall), so its
// building-integrity check keeps it. Once per server run.
const HALL_TILES = { wall: 'white-city-wall', floor: 'white-city-floor', door: 'door-closed', clear: 'grass' };
registerSystem('dev-hall', (game) => {
  if (!process.env.HALL || game._devHall) return;
  const p = game.players()[0];
  if (!p) return;
  game._devHall = true;
  if (halls(game).length) { // an old world: just make sure there is a chest
    const spot = game.world.findWalkable(p.x + 1, p.y, 10);
    if (!chests(game).length) game.spawn('chest', { x: spot.x, y: spot.y, owner: p.id });
    return;
  }
  const half = (RTS.hallW - 1) / 2;
  const x = Math.min(game.world.w - half - 3, Math.max(half + 2, Math.floor(p.x)));
  const y = Math.min(game.world.h - 4, Math.max(RTS.hallH + 1, Math.floor(p.y) - 2)); // the door row
  const top = y - RTS.hallH + 1;
  for (let ty = top - 1; ty <= y + 2; ty++) for (let tx = x - half - 1; tx <= x + half + 1; tx++) {
    const inside = ty >= top && ty <= y && tx >= x - half && tx <= x + half;
    const edge = ty === top || ty === y || tx === x - half || tx === x + half;
    const tile = game.world.tile(tx, ty);
    if (inside) game.setTile(tx, ty, tx === x && ty === y ? HALL_TILES.door : edge ? HALL_TILES.wall : HALL_TILES.floor);
    else if (tile && (tile.solid || tile.hurts || tile.structure)) game.setTile(tx, ty, HALL_TILES.clear); // a clear path around it
  }
  game.spawn(RTS.hall, { x: x + 0.5, y: y - (RTS.hallH - 1) / 2, owner: p.id });
  if (!chests(game).length) game.spawn('chest', { x: x + 2.5, y: y + 1.5, owner: p.id });
  game.teleport(p, x + 0.5, y + 1.5); // in front of the door
  console.log(`[dev] HALL=1: built Minas Tirith with its door at ${x},${y}, and a chest`);
});

// The hidden hero cannot be hurt while its owner plays the RTS view.
onEvent('damage', (game, hit) => { if (hit.target?.rts) hit.cancelled = true; });
onEvent('playerLeft', (game, p) => { p.rts = false; });
