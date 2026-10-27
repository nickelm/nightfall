// Game server: serves the client files and runs the authoritative simulation.
// Owned by: Integration.
//   npm start      plain server (env: PORT, SEED, DAY_LENGTH, START_PHASE)
//   npm run dev    same server under server/dev.js, which hot-swaps team server
//                  code in place and restarts (keeping state) for everything else
import http from 'node:http';
import * as nodeModule from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { WORLD_W, WORLD_H, TICK_HZ, PRIVATE_PREFIX } from '../shared/config.js';
import { registries, _attachListeners, _setCurrentModule } from '../shared/registry.js';
import { MODULES } from '../modules/manifest.js';
import { World } from '../shared/world.js';
import { createBus } from '../shared/events.js';
import { timeOfDay, clock } from '../shared/time.js';
import { safely } from '../shared/safe.js';
import { loadModules } from '../shared/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const STATE_FILE = process.env.STATE_FILE || path.join(ROOT, '.nightfall-state.json');
const PLAYER_COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe'];

clock.dayLength = Number(process.env.DAY_LENGTH) || clock.dayLength;
nodeModule.register?.('./hot-hooks.js', import.meta.url); // lets hotSwap() reload helper files too

const failed = await loadModules('server', (p) => import(`../modules/${p}`));

// Saved state from the previous run, when restarted by the dev supervisor.
let saved = null;
if (process.env.RESTORE && fs.existsSync(STATE_FILE)) {
  try { saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (err) { console.error('[restore] unreadable state file', err); }
}
const SEED = saved?.seed ?? (Number(process.env.SEED) || Math.floor(Math.random() * 1e9));

// ---------------------------------------------------------------------------
// The server-side game object. Systems and action handlers receive it.
// ---------------------------------------------------------------------------
const sockets = new Map();        // playerId -> ws
const offlinePlayers = new Map(); // name -> player entity, restored when that name rejoins

export const game = {
  world: World.generate(WORLD_W, WORLD_H, SEED),
  entities: new Map(),
  bus: createBus(),
  // START_PHASE is a fraction of the day: 0 sunrise, 0.6 dusk, 0.7 night, 0.95 dawn
  time: Number(process.env.START_TIME) || (Number(process.env.START_PHASE) || 0) * clock.dayLength,
  nextId: 1,

  timeOfDay() { return timeOfDay(this.time); },

  /** Create an entity of a registered type. props override the type defaults. */
  spawn(type, props = {}) {
    const def = registries.entityTypes.get(type);
    if (!def) console.warn(`[spawn] unknown entity type "${type}"`);
    const e = { id: this.nextId++, type, x: 0, y: 0, ...JSON.parse(JSON.stringify(def?.defaults || {})), ...props };
    this.entities.set(e.id, e);
    this.bus.emit('spawned', e);
    return e;
  },

  despawn(id) {
    const e = this.entities.get(id);
    if (!e) return;
    this.entities.delete(id);
    this.bus.emit('despawned', e);
  },

  players() { return [...this.entities.values()].filter((e) => e.type === 'player'); },

  /** All entities within radius r of (x, y), optionally filtered */
  near(x, y, r, filter = () => true) {
    const out = [];
    for (const e of this.entities.values()) {
      if (Math.hypot(e.x - x, e.y - y) <= r && filter(e)) out.push(e);
    }
    return out;
  },

  /** The one way to hurt anything. Listeners on the 'damage' event may change
   *  hit.amount or set hit.cancelled (blocking, parrying, armor, ...).
   *  Non-player entities despawn at 0 hp; players respawn (player module). */
  damage(target, amount, source = null) {
    if (!target || !(target.hp > 0)) return 0;
    const hit = { target, amount, source, cancelled: false };
    this.bus.emit('damage', hit);
    if (hit.cancelled || hit.amount <= 0) return 0;
    target.hp -= hit.amount;
    this.broadcast('hit', { id: target.id, x: target.x, y: target.y, amount: hit.amount });
    if (target.hp <= 0) {
      this.bus.emit('killed', target, source);
      if (target.type !== 'player') this.despawn(target.id);
    }
    return hit.amount;
  },

  /** Change a tile for everyone (recorded for late joiners). */
  setTile(x, y, idOrName) {
    this.world.edit(x, y, idOrName);
    const id = this.world.get(x, y);
    if (id >= 0) broadcast({ t: 'tile', x: Math.floor(x), y: Math.floor(y), id });
  },

  /** Fire a client-side event on every client: game.bus 'net:<name>'. */
  broadcast(name, data = {}) { broadcast({ t: 'event', name, data }); },

  /** Fire a client-side event on one player's client. */
  sendTo(playerId, name, data = {}) { send(sockets.get(playerId), { t: 'event', name, data }); },

  /** Move a player (clients own their position, so we must tell them). */
  teleport(player, x, y) {
    player.x = x; player.y = y;
    send(sockets.get(player.id), { t: 'teleport', x, y });
  },

  /** Push any entity; players are teleported, others just move. Respects walls. */
  knockback(e, fromX, fromY, dist) {
    const dx = e.x - fromX, dy = e.y - fromY, len = Math.hypot(dx, dy) || 1;
    let x = e.x, y = e.y;
    for (let i = 0; i < 6; i++) { // step so we never tunnel through walls
      const nx = x + (dx / len) * (dist / 6), ny = y + (dy / len) * (dist / 6);
      if (this.world.blocked(nx, ny)) break;
      x = nx; y = ny;
    }
    if (e.type === 'player') this.teleport(e, x, y); else { e.x = x; e.y = y; }
  },

  /** Inventory helpers: entity.inventory is { itemName: count } */
  give(entity, item, count = 1) {
    entity.inventory ||= {};
    entity.inventory[item] = (entity.inventory[item] || 0) + count;
    if (entity.inventory[item] <= 0) delete entity.inventory[item];
  },
  has(entity, item, count = 1) { return (entity.inventory?.[item] || 0) >= count; },
};

// ---------------------------------------------------------------------------
// Persistence: the dev supervisor asks us to save before restarting, and we
// autosave every few seconds in case we crash. Edits are stored by tile NAME,
// so adding or reordering tiles between runs is safe.
// ---------------------------------------------------------------------------
function saveState() {
  const tiles = registries.tiles;
  const state = {
    seed: SEED,
    worldWidth: game.world.w,
    worldHeight: game.world.h,
    time: game.time,
    nextId: game.nextId,
    edits: game.world.editList().map(([x, y, id]) => [x, y, tiles[id]?.name]),
    entities: [...game.entities.values()].filter((e) => e.type !== 'player'),
    players: [...game.players(), ...offlinePlayers.values()],
  };
  fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify(state));
  fs.renameSync(STATE_FILE + '.tmp', STATE_FILE);
}

// New fields added to an entity type since the state was saved get their
// default values; existing values are left alone. This covers the most common
// data-model change without a fresh start.
function backfillDefaults(e) {
  const defaults = registries.entityTypes.get(e.type)?.defaults || {};
  for (const k in defaults) if (!(k in e)) e[k] = JSON.parse(JSON.stringify(defaults[k]));
  return e;
}

if (saved) {
  const oldW = saved.worldWidth ?? 160, oldH = saved.worldHeight ?? 160;
  const shiftX = Math.floor((game.world.w - oldW) / 2), shiftY = Math.floor((game.world.h - oldH) / 2);
  function migrate(e) {
    if (e.type === 'team-map' && typeof e._seen === 'string' && (shiftX || shiftY)) {
      const old = Buffer.from(e._seen, 'base64'), bits = Buffer.alloc(Math.ceil(game.world.w * game.world.h / 8));
      for (let y = 0; y < oldH; y++) for (let x = 0; x < oldW; x++) {
        const i = y * oldW + x;
        if (old[i >> 3] & (1 << (i & 7))) {
          const j = (y + shiftY) * game.world.w + x + shiftX;
          bits[j >> 3] |= 1 << (j & 7);
        }
      }
      e._seen = bits.toString('base64');
    } else if (e.type !== 'team-map') {
      if (Number.isFinite(e.x)) e.x += shiftX;
      if (Number.isFinite(e.y)) e.y += shiftY;
      if (Array.isArray(e._cell)) e._cell = [e._cell[0] + shiftX, e._cell[1] + shiftY];
      delete e._mine; e.mining = null;
    }
    return backfillDefaults(e);
  }
  for (const [x, y, name] of saved.edits || []) if (registries.tileByName.has(name)) game.world.edit(x + shiftX, y + shiftY, name);
  for (const e of saved.entities || []) game.entities.set(e.id, migrate(e));
  for (const p of saved.players || []) offlinePlayers.set(p.name, migrate(p));
  game.time = saved.time ?? game.time;
  game.nextId = saved.nextId ?? game.nextId;
  console.log(`[restore] ${saved.entities?.length || 0} entities, ${saved.players?.length || 0} players, ${saved.edits?.length || 0} tile edits`);
}

_attachListeners(game);

// ---------------------------------------------------------------------------
// Hot swap: reload every modules/<team>/server.js (and the helpers it imports)
// in place. Entities, tiles, players and connections stay untouched; only the
// systems, action handlers and event listeners are replaced. State kept in
// module-level variables is lost, so keep anything that matters on entities or
// on `game`. shared.js changes need a restart (dev.js handles that).
// ---------------------------------------------------------------------------
let hotVersion = 0;
async function hotSwap() {
  hotVersion++;
  const old = { systems: [...registries.systems], actions: new Map(registries.actions), listeners: [...registries.listeners] };
  registries.systems.length = 0;
  registries.actions.clear();
  registries.listeners.length = 0;
  const failedNow = [];
  for (const name of MODULES) {
    _setCurrentModule(name);
    try {
      await import(`../modules/${name}/server.js?hot=${hotVersion}`);
    } catch (err) {
      failedNow.push(name);
      console.error(`[hot] modules/${name}/server.js failed to load; keeping its previous version:`, err);
      // fall back to the old registrations of that module so the game keeps working
      registries.systems.push(...old.systems.filter((s) => s.name.startsWith(`${name}/`)));
      registries.listeners.push(...old.listeners.filter((l) => l.name.startsWith(`${name}/`)));
      for (const [action, hs] of old.actions) {
        const mine = hs.filter((h) => h.name.startsWith(`${name}/`));
        if (mine.length) registries.actions.set(action, [...(registries.actions.get(action) || []), ...mine]);
      }
    }
  }
  _setCurrentModule('core');
  game.bus = createBus();
  _attachListeners(game);
  game.bus.emit('hotSwapped');
  game.broadcast('hotswap', { failed: failedNow });
  console.log(`[hot] swapped server code (v${hotVersion})${failedNow.length ? `, kept old: ${failedNow.join(', ')}` : ''}`);
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------
function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const ws of sockets.values()) if (ws.readyState === 1) ws.send(s);
}

function publicView(e) {
  const out = {};
  for (const k in e) if (!k.startsWith(PRIVATE_PREFIX)) out[k] = e[k];
  return out;
}

function join(ws, rawName) {
  const name = String(rawName || 'player').slice(0, 16);
  const nameOnline = game.players().some((p) => p.name === name);
  let p;
  if (!nameOnline && offlinePlayers.has(name)) {
    // returning player (page reload, Wi-Fi drop, server restart): keep their stuff
    p = backfillDefaults({ ...offlinePlayers.get(name), id: game.nextId++, guarding: false });
    offlinePlayers.delete(name);
    if (game.world.blocked(p.x, p.y) && !(p.sailing && game.world.tile(p.x, p.y)?.name === 'water')) Object.assign(p, game.world.findWalkable(p.x, p.y));
    game.entities.set(p.id, p);
  } else {
    const spawn = game.world.findWalkable();
    p = game.spawn('player', {
      x: spawn.x, y: spawn.y, dir: { x: 0, y: 1 }, name,
      color: PLAYER_COLORS[game.players().length % PLAYER_COLORS.length],
      inventory: {},
    });
  }
  ws.playerId = p.id;
  sockets.set(p.id, ws);
  send(ws, { t: 'welcome', id: p.id, seed: SEED, w: WORLD_W, h: WORLD_H, edits: game.world.editList(), time: game.time,
    dayLength: clock.dayLength });
  game.bus.emit('playerJoined', p);
  console.log(`[join] ${p.name} (#${p.id}), ${sockets.size} online`);
}

function onMessage(ws, msg) {
  const player = game.entities.get(ws.playerId);
  switch (msg.t) {
    case 'hello':
      if (!player) join(ws, msg.name);
      break;
    case 'move': {
      if (!player || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      player.x = msg.x;
      player.y = msg.y;
      if (msg.dir && Number.isFinite(msg.dir.x) && Number.isFinite(msg.dir.y)) player.dir = { x: msg.dir.x, y: msg.dir.y };
      break;
    }
    case 'action': {
      if (!player) return;
      const handlers = registries.actions.get(msg.name);
      if (!handlers) return console.warn(`[action] nobody handles "${msg.name}"`);
      for (const h of handlers) safely(h.name, h.fn, game, player, msg.data || {});
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Static file server (client/, shared/, modules/ only)
// ---------------------------------------------------------------------------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const PUBLIC = ['client', 'shared', 'modules'].map((d) => path.join(ROOT, d) + path.sep);

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.resolve(ROOT, '.' + (urlPath === '/' ? '/client/index.html' : urlPath));
  if (!PUBLIC.some((dir) => file.startsWith(dir))) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    safely(`message "${msg?.t}"`, onMessage, ws, msg);
  });
  ws.on('close', () => {
    const p = game.entities.get(ws.playerId);
    sockets.delete(ws.playerId);
    if (p) {
      game.bus.emit('playerLeft', p);
      game.despawn(p.id);
      offlinePlayers.set(p.name, p);
      console.log(`[leave] ${p.name}, ${sockets.size} online`);
    }
  });
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let wasNight = game.timeOfDay().isNight;
let last = performance.now();

setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  game.time += dt;

  const tod = game.timeOfDay();
  if (tod.isNight !== wasNight) {
    wasNight = tod.isNight;
    const name = tod.isNight ? 'dusk' : 'dawn';
    game.bus.emit(name, tod);
    game.broadcast(name, { day: tod.day });
  }

  for (const s of registries.systems) safely(s.name, s.fn, game, dt);

  if (sockets.size) broadcast({ t: 'snap', time: game.time, entities: [...game.entities.values()].map(publicView) });
}, 1000 / TICK_HZ);

// Under the dev supervisor (server/dev.js), talk to it over IPC.
if (process.send) {
  process.on('message', (m) => {
    if (m === 'save-and-exit') { safely('save', saveState); process.exit(0); }
    if (m === 'reload-clients') broadcast({ t: 'reload' });
    if (m === 'hot-swap') hotSwap().catch((err) => console.error('[hot] swap failed', err));
  });
  process.on('disconnect', () => process.exit(0));
  setInterval(() => safely('autosave', saveState), 5000);
}

server.listen(PORT, () => {
  console.log(`\nNightfall server, seed ${SEED}${failed.length ? `, FAILED modules: ${failed.join(', ')}` : ''}`);
  console.log(`  local:   http://localhost:${PORT}/?name=YourName`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  network: http://${a.address}:${PORT}/?name=YourName`);
  }
});
