// RTS mode (server), Warcraft-style. Peasants are units their owner commands from the RTS
// view (rts-ui.js):
//   'rts'       { on }                  hide or show the hero; the first time, three peasants appear
//   'rtsOrder'  { ids, kind, x, y }     kind: 'auto' (mine if there is a resource there, else move),
//                                       'mine', 'move', 'stop', 'return' (the load) or 'build' (a chest)
//   'rtsTrain'  {}                      queue a peasant at the nearest Minas Tirith or chest
// Peasants walk a tile path (4-way BFS), mine the nearest unclaimed harvestable tile around
// their work area, and carry each load to the nearest chest (Survival's). Costs come out of
// the chests first, nearest first, then the owner's own pack. Peasants stay in the world and
// keep working while their owner plays the hero; they wait while the owner is offline, and
// `ownerName` gives them back to the owner on rejoining.
import { registries, registerSystem, onAction, onEvent } from '../../shared/registry.js';
import { RTS } from './shared.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SPREAD = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2]];
const peasantsOf = (game, id) => [...game.entities.values()].filter((e) => e.type === 'peasant' && e.owner === id);
const halls = (game) => [...game.entities.values()].filter((e) => e.type === RTS.hall);
const chests = (game) => [...game.entities.values()].filter((e) => e.type === 'chest');
const nearest = (list, x, y) => list.reduce((best, e) => (!best || Math.hypot(e.x - x, e.y - y) < Math.hypot(best.x - x, best.y - y) ? e : best), null);
// Peasants mine anything harvestable except what players built.
const minable = (tile) => !!tile?.harvest && !tile.structure;
const chestCost = () => registries.recipes.get('chest')?.inputs || { wood: 8 };
const costText = (cost) => Object.entries(cost).map(([item, n]) => `${n} ${item.replace(/-/g, ' ')}`).join(', ');
const tell = (game, player, text) => game.sendTo(player.id, 'rtsNote', { text });

// Breadth-first search over walkable tiles from (sx, sy) until goal(x, y) holds. Returns the
// tile centers to walk through (empty if already there), or null. With `towards`, a goal that
// cannot be reached gives the path to the reachable tile closest to that point instead.
function findPath(world, sx, sy, goal, towards = null, limit = 40000) {
  sx = Math.floor(sx); sy = Math.floor(sy);
  const W = world.w, start = sy * W + sx;
  const from = new Map([[start, -1]]);
  const queue = [start];
  let best = start, bestD = Infinity, found = -1;
  for (let head = 0; head < queue.length && head < limit; head++) {
    const i = queue[head], x = i % W, y = (i - x) / W;
    if (goal(x, y)) { found = i; break; }
    if (towards) {
      const d = Math.hypot(x + 0.5 - towards.x, y + 0.5 - towards.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, n = ny * W + nx;
      if (from.has(n) || !world.inBounds(nx, ny) || world.isSolid(nx, ny)) continue;
      from.set(n, i);
      queue.push(n);
    }
  }
  if (found < 0 && !towards) return null;
  const path = [];
  for (let j = found < 0 ? best : found; j !== start; j = from.get(j)) path.push([(j % W) + 0.5, Math.floor(j / W) + 0.5]);
  return path.reverse();
}

// Walk along e._path; true while there is still some way to go.
function walk(game, e, dt) {
  let step = e.speed * dt;
  while (e._path.length && step > 0) {
    const [tx, ty] = e._path[0];
    if (game.world.isSolid(tx, ty)) { // something was built in the way: plan again
      e._path = [];
      if (e.task === 'toMine') e.task = 'seek';
      if (e.task === 'toChest') e.task = 'return';
      return false;
    }
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d > 0.01) e.dir = { x: dx / d, y: dy / d };
    if (d <= step) { e.x = tx; e.y = ty; step -= d; e._path.shift(); }
    else { e.x += (dx / d) * step; e.y += (dy / d) * step; step = 0; }
  }
  return e._path.length > 0;
}

// Tell an owner something about their peasants, at most once every few seconds.
function note(game, e, text) {
  const owner = game.entities.get(e.owner);
  if (!owner || (owner._rtsNoteAt ?? -1e9) > game.time - 4) return;
  owner._rtsNoteAt = game.time;
  tell(game, owner, text);
}

// --- paying: chests first (nearest first), then the owner's own pack ---
function payers(game, owner, x, y) {
  const list = chests(game).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  return owner ? [...list, owner] : list;
}
function canAfford(game, owner, cost, x, y) {
  const list = payers(game, owner, x, y);
  return Object.entries(cost).every(([item, n]) => list.reduce((sum, e) => sum + (e.inventory?.[item] || 0), 0) >= n);
}
function pay(game, owner, cost, x, y) {
  if (!canAfford(game, owner, cost, x, y)) return false;
  for (const [item, n] of Object.entries(cost)) {
    let left = n;
    for (const e of payers(game, owner, x, y)) {
      const take = Math.min(left, e.inventory?.[item] || 0);
      if (take) { game.give(e, item, -take); left -= take; }
      if (!left) break;
    }
  }
  return true;
}
function refund(game, owner, cost, x, y) {
  const to = nearest(chests(game), x, y) || owner;
  if (to) for (const [item, n] of Object.entries(cost)) game.give(to, item, n);
}

// A tile a chest can go on: walkable, and nothing but peasants and hidden heroes on it.
function siteFree(game, x, y) {
  if (!game.world.inBounds(x, y) || game.world.isSolid(x, y)) return false;
  return ![...game.entities.values()].some((e) => e.type !== 'peasant' && !e.rts &&
    Math.abs(e.x - x - 0.5) < 0.85 && Math.abs(e.y - y - 0.5) < 0.85);
}

// Back to whatever the peasant was doing before it was asked to build.
const resume = (e) => { e.task = e.carry ? 'return' : e.area ? 'seek' : 'idle'; e.work = 0; };

function cancelSite(game, e, why) {
  const s = e.site;
  if (!s) return;
  e.site = null;
  refund(game, game.entities.get(e.owner), s.paid, s.x, s.y);
  if (why) note(game, e, `${why} (refunded)`);
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
    e.task = 'idle'; e._job = null; e.area = null;
    note(game, e, 'Your peasants find nothing more to mine there');
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
  e._path = path; e.task = 'toChest'; e._chest = chest.id;
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
    case 'toChest': {
      const chest = game.entities.get(e._chest);
      if (chest?.type !== 'chest' || Math.hypot(chest.x - e.x, chest.y - e.y) > 1.6) { goHome(game, e); break; } // picked up or moved
      if (e.carry) game.give(chest, e.carry, e.carryCount);
      e.carry = null; e.carryCount = 0; e._chest = null;
      resume(e);
      break;
    }
    case 'moving': {
      const g = e._goal;
      const path = g && Math.hypot(g.x - e.x, g.y - e.y) > 0.3 &&
        findPath(game.world, e.x, e.y, (x, y) => x === Math.floor(g.x) && y === Math.floor(g.y), g);
      if (path?.length) e._path = path;
      else { e.task = 'idle'; e._goal = null; } // arrived, or as close as it gets
      break;
    }
    case 'toBuild': {
      const s = e.site;
      if (!s) { resume(e); break; }
      const next = (x, y) => Math.abs(x - s.x) <= 1 && Math.abs(y - s.y) <= 1;
      if (next(Math.floor(e.x), Math.floor(e.y))) { e.task = 'building'; e._t = 0; break; }
      const path = findPath(game.world, e.x, e.y, next);
      if (path) e._path = path;
      else { cancelSite(game, e, 'Your peasant cannot reach the building site'); resume(e); }
      break;
    }
    case 'building': {
      const s = e.site;
      if (!s) { resume(e); break; }
      if (!siteFree(game, s.x, s.y)) { cancelSite(game, e, 'The building site is blocked'); resume(e); break; }
      e.dir = { x: s.x + 0.5 - e.x, y: s.y + 0.5 - e.y };
      e._t += dt;
      e.work = Math.min(1, Math.round((e._t / RTS.buildTime) * 100) / 100);
      if (e._t < RTS.buildTime) break;
      game.spawn(s.kind, { x: s.x + 0.5, y: s.y + 0.5, owner: e.owner });
      game.broadcast('placed', { x: s.x, y: s.y, item: s.kind, by: e.owner });
      e.site = null;
      resume(e);
      break;
    }
  }
}

registerSystem('peasants', (game, dt) => {
  for (const e of game.entities.values()) {
    if (e.type !== 'peasant' || !game.entities.get(e.owner)) continue; // owner offline: wait for them
    think(game, e, dt);
  }
});

// --- training: at the nearest Minas Tirith (by its door), else the nearest chest ---
function trainSite(game, player) {
  const hall = nearest(halls(game), player.x, player.y);
  if (hall) return { x: hall.x, y: hall.y + RTS.hallH / 2 + 1 };
  const chest = nearest(chests(game), player.x, player.y);
  return chest && { x: chest.x, y: chest.y + 1 };
}
function spawnPeasant(game, player, at, i = 0) {
  const [dx, dy] = SPREAD[i % SPREAD.length];
  const spot = game.world.findWalkable(at.x + dx, at.y + dy, 20);
  return game.spawn('peasant', { x: spot.x, y: spot.y, owner: player.id, ownerName: player.name });
}

registerSystem('peasant-training', (game, dt) => {
  for (const p of game.players()) {
    if (!(p.rtsQueue > 0)) continue;
    p.rtsTrainT = Math.min(1, (p.rtsTrainT || 0) + dt / RTS.trainTime);
    const at = p.rtsTrainT >= 1 && trainSite(game, p);
    if (!at) continue; // still training, or nowhere to appear: wait
    p.rtsTrainT = 0; p.rtsQueue--;
    spawnPeasant(game, p, at, peasantsOf(game, p.id).length);
    tell(game, p, 'Peasant ready');
  }
});

onAction('rts', (game, player, { on }) => {
  player.rts = !!on;
  if (!player.rts || peasantsOf(game, player.id).length || player.rtsQueue > 0) return;
  const at = trainSite(game, player) || { x: player.x, y: player.y };
  for (let i = 0; i < RTS.peasants; i++) spawnPeasant(game, player, at, i);
});

onAction('rtsTrain', (game, player) => {
  const at = trainSite(game, player);
  if (!at) return tell(game, player, 'Build Minas Tirith or place a chest to train peasants');
  if (peasantsOf(game, player.id).length + (player.rtsQueue || 0) >= RTS.maxPeasants) return tell(game, player, `At most ${RTS.maxPeasants} peasants`);
  if (!pay(game, player, RTS.trainCost, at.x, at.y)) return tell(game, player, `A peasant costs ${costText(RTS.trainCost)}`);
  player.rtsQueue = (player.rtsQueue || 0) + 1;
});

// Some harvestable tile right where the player clicked?
function resourceAt(game, x, y) {
  for (let ty = Math.floor(y) - 1; ty <= Math.floor(y) + 1; ty++) for (let tx = Math.floor(x) - 1; tx <= Math.floor(x) + 1; tx++) {
    if (minable(game.world.tile(tx, ty)) && Math.hypot(tx + 0.5 - x, ty + 0.5 - y) < 1.2) return true;
  }
  return false;
}

function orderBuild(game, player, units, x, y) {
  if (!siteFree(game, x, y)) return tell(game, player, 'Cannot build a chest there');
  const builder = nearest(units, x + 0.5, y + 0.5);
  cancelSite(game, builder);
  const cost = chestCost();
  if (!pay(game, player, cost, x + 0.5, y + 0.5)) return tell(game, player, `A chest costs ${costText(cost)}`);
  Object.assign(builder, { site: { x, y, kind: 'chest', paid: cost }, task: 'toBuild', _path: [], _job: null, work: 0 });
}

onAction('rtsOrder', (game, player, { ids, kind = 'auto', x, y }) => {
  if (!player.rts) return;
  const mine = peasantsOf(game, player.id);
  const units = Array.isArray(ids) ? mine.filter((e) => ids.includes(e.id)) : mine;
  const at = Number.isFinite(x) && Number.isFinite(y);
  if (!units.length || (!at && kind !== 'stop' && kind !== 'return')) return;
  if (kind === 'auto') kind = resourceAt(game, x, y) ? 'mine' : 'move';
  if (kind === 'build') return orderBuild(game, player, units, Math.floor(x), Math.floor(y));
  units.forEach((e, i) => {
    if (kind === 'return') { if (e.carry && e.task !== 'toChest') { e._path = []; e.task = 'return'; } return; }
    cancelSite(game, e); // any other order calls off a building job
    Object.assign(e, { _path: [], _job: null, _goal: null, work: 0 });
    if (kind === 'stop') { e.task = 'idle'; e.area = null; return; }
    if (kind === 'mine') { e.area = { x, y }; e.task = e.carry ? 'return' : 'seek'; return; }
    // move: spread out a little so a group does not stack on one tile
    const [dx, dy] = SPREAD[i % SPREAD.length];
    e.area = null;
    e._goal = { x: Math.floor(x) + dx + 0.5, y: Math.floor(y) + dy + 0.5 };
    e.task = 'moving';
  });
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
// A player who comes back gets a new id: hand their peasants back to them by name.
onEvent('playerJoined', (game, p) => {
  for (const e of game.entities.values()) if (e.type === 'peasant' && e.ownerName === p.name) e.owner = p.id;
});
