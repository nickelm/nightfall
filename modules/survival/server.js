// TEAM SURVIVAL (server): mining, placing, the hotbar, crafting, fire fuel.
import { registries, onAction, registerSystem } from '../../shared/registry.js';

const FUEL_PER_WOOD = 20; // seconds of burn time per wood
const MINE_REACH = 2.2;   // tiles from the player to the mined tile's center
const PLACE_REACH = 2.6;
const SLOTS = 9;

const heldDef = (player) => registries.items.get(player.hotbar?.[player.selected]);
const dist = (player, x, y) => Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y);

// Right click on an interactive thing: feed a campfire standing there.
onAction('interact', (game, player, { x, y }) => {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return;
  if (dist(player, x, y) > 2) return; // too far
  const tile = game.world.tile(x, y);
  if (tile?.name === 'door-closed' || tile?.name === 'door-open') {
    const closing = tile.name === 'door-open';
    // Never close a solid door on a player or creature standing in the opening.
    if (closing && [...game.entities.values()].some(e =>
      Math.abs(e.x - x - 0.5) < 0.85 && Math.abs(e.y - y - 0.5) < 0.85)) return;
    game.setTile(x, y, closing ? 'door-closed' : 'door-open');
    return;
  }
  const fire = game.near(x + 0.5, y + 0.5, 0.9, (e) => e.type === 'campfire')[0];
  if (!fire || !game.has(player, 'wood') || fire.fuel >= fire.maxFuel) return;
  game.give(player, 'wood', -1);
  fire.fuel = Math.min(fire.maxFuel, fire.fuel + FUEL_PER_WOOD);
  game.broadcast('fed', { id: fire.id, by: player.id });
});

// Holding left click on a harvestable tile starts mining it; letting go stops.
onAction('mine', (game, player, { x, y, stop }) => {
  if (stop || !Number.isInteger(x) || !Number.isInteger(y)) { delete player._mine; player.mining = null; return; }
  if (player._mine?.x === x && player._mine?.y === y) return;
  player._mine = { x, y, t: 0 };
});

// Mining takes the tile's hardness in seconds by hand, divided by the held
// tool's power when the tool matches (an axe on trees, a pickaxe on stone).
registerSystem('mining', (game, dt) => {
  for (const p of game.players()) {
    const job = p._mine;
    if (!job) continue;
    const tile = game.world.tile(job.x, job.y);
    if (!tile?.harvest || p.hp <= 0 || dist(p, job.x, job.y) > MINE_REACH) { delete p._mine; p.mining = null; continue; }
    const held = heldDef(p);
    const time = (tile.hardness ?? 1) / (held?.tool && held.tool === tile.tool ? held.power || 1 : 1);
    job.t += dt;
    p.mining = { x: job.x, y: job.y, p: Math.min(1, Math.round((job.t / time) * 100) / 100) };
    if (job.t < time) continue;
    game.give(p, tile.harvest.item, tile.harvest.count || 1);
    game.setTile(job.x, job.y, tile.harvest.becomes);
    game.broadcast('harvested', { x: job.x, y: job.y, item: tile.harvest.item, by: p.id });
    delete p._mine;
    p.mining = null;
  }
});

// Right click with a placeable item: put it on the targeted tile.
onAction('use', (game, player, { x, y }) => {
  const def = heldDef(player);
  if (!def || !(def.places || def.placesTile) || !Number.isInteger(x) || !Number.isInteger(y)) return;
  if (!game.has(player, def.name) || dist(player, x, y) > PLACE_REACH) return;
  // no room: a solid tile, or anything (a player, a slime, a fire) overlapping the tile
  const overlaps = (e) => Math.abs(e.x - x - 0.5) < 0.85 && Math.abs(e.y - y - 0.5) < 0.85;
  if (game.world.isSolid(x, y) || [...game.entities.values()].some(overlaps)) return;
  if (def.placesTile) game.setTile(x, y, def.placesTile);
  else game.spawn(def.places, { x: x + 0.5, y: y + 0.5, owner: player.id });
  game.give(player, def.name, -1);
  game.broadcast('placed', { x, y, item: def.name, by: player.id });
});

onAction('craft', (game, player, { recipe }) => {
  const r = registries.recipes.get(recipe);
  if (!r) return;
  for (const [item, n] of Object.entries(r.inputs)) if (!game.has(player, item, n)) return;

  if (r.places) {
    const tx = Math.floor(player.x + player.dir.x), ty = Math.floor(player.y + player.dir.y);
    if (game.world.isSolid(tx, ty) || game.near(tx + 0.5, ty + 0.5, 0.5).length) return; // no room
    game.spawn(r.places, { x: tx + 0.5, y: ty + 0.5, owner: player.id });
  }
  for (const [item, n] of Object.entries(r.inputs)) game.give(player, item, -n);
  for (const [item, n] of Object.entries(r.output || {})) game.give(player, item, n);
  game.broadcast('crafted', { recipe, by: player.id });
});

// --- hotbar: nine slots that point into the inventory ---

onAction('select', (game, player, { slot }) => {
  if (Number.isInteger(slot) && slot >= 0 && slot < SLOTS) player.selected = slot;
});

// Put an item you own into a slot; if it already sits in another slot, the two swap.
onAction('hotbar', (game, player, { slot, item }) => {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS || !game.has(player, item)) return;
  const bar = player.hotbar;
  const from = bar.indexOf(item);
  if (from >= 0) bar[from] = bar[slot];
  bar[slot] = item;
});

// Keep hotbars in step with inventories: empty slots whose item is used up,
// and put newly picked-up items into the first free slot.
registerSystem('hotbar', (game) => {
  for (const p of game.players()) {
    if (!Array.isArray(p.hotbar) || p.hotbar.length !== SLOTS) p.hotbar = Array(SLOTS).fill(null);
    const bar = p.hotbar;
    for (let i = 0; i < SLOTS; i++) if (bar[i] && !game.has(p, bar[i])) bar[i] = null;
    for (const item of Object.keys(p.inventory || {})) {
      if (bar.includes(item)) continue;
      const free = bar.indexOf(null);
      if (free < 0) break;
      bar[free] = item;
    }
  }
});

// --- light and fire ---

// Campfires burn down. Light (and the monster-free zone) shrinks in the last
// 30 seconds; at zero fuel the fire is embers that no longer repel anything.
registerSystem('fire', (game, dt) => {
  for (const e of game.entities.values()) {
    if (e.type !== 'campfire') continue;
    const wasBurning = e.fuel > 0;
    e.fuel = Math.max(0, e.fuel - dt);
    e.repels = e.fuel > 0;
    e.light = e.fuel > 0 ? 2.5 + 3.5 * Math.min(1, e.fuel / 30) : 0.7;
    if (wasBurning && !e.repels) game.broadcast('fireOut', { id: e.id, x: e.x, y: e.y });
  }
});

// Jack-o-lanterns (and anything with `scares: n`) keep monsters away only
// while at most n hostiles are close; a bigger pack walks right in.
registerSystem('lantern-courage', (game) => {
  for (const e of game.entities.values()) {
    if (typeof e.scares !== 'number') continue;
    const near = game.near(e.x, e.y, (e.light || 0) * 0.8 + 3, (m) => m.hostile && m.hp > 0).length;
    e.repels = near <= e.scares;
  }
});
