// TEAM CREATURES (server helper): monster loot. When a creature is killed, each of
// its `rolls` picks one entry from its table by `weight` and drops `min`..`max` of
// that item on the ground as a `drop` entity; players walk over drops to pick them up.
//
// To make something drop, add a row to a table (or a new table for a new monster
// type). An entry without `item` is "nothing". Items that are not registered (say,
// another team renamed one) are skipped, so a stale row never breaks a kill.
// Saving this file hot-swaps the new tables into the running game.
import { registries } from '../../shared/registry.js';

export const LOOT = {
  slime: {
    rolls: 1,
    table: [
      { weight: 4 },                                       // nothing
      { item: 'monster-goo', weight: 4, min: 1, max: 2 },
      { item: 'arrow', weight: 2, min: 1, max: 3 },
    ],
  },
  'blood-slime': {
    rolls: 2,
    table: [
      { weight: 1 },
      { item: 'monster-goo', weight: 4, min: 2, max: 3 },
      { item: 'arrow', weight: 3, min: 2, max: 4 },
    ],
  },
  spider: {
    rolls: 1,
    table: [
      { weight: 3 },
      { item: 'monster-goo', weight: 2, min: 1, max: 1 },
    ],
  },
  zombie: {
    rolls: 2,
    table: [
      { weight: 2 },
      { item: 'monster-goo', weight: 3, min: 1, max: 2 },
      { item: 'wood', weight: 2, min: 1, max: 2 },
    ],
  },
  skeleton: {
    rolls: 1,
    table: [
      { weight: 1 },
      { item: 'arrow', weight: 4, min: 2, max: 5 },
    ],
  },
};

export const DROP_SECONDS = 90; // drops left on the ground vanish after this long
const PICKUP_RADIUS = 0.8;

function pick(table) {
  const total = table.reduce((sum, e) => sum + (e.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const entry of table) if ((r -= entry.weight ?? 1) < 0) return entry;
  return null;
}

/** Spawn the loot for a killed entity, scattered a little around where it fell. */
export function dropLoot(game, victim) {
  const loot = LOOT[victim.type];
  if (!loot) return;
  for (let i = 0; i < (loot.rolls ?? 1); i++) {
    const entry = pick(loot.table);
    if (!entry?.item || !registries.items.get(entry.item)) continue;
    const min = entry.min ?? 1, max = entry.max ?? min;
    const count = min + Math.floor(Math.random() * (max - min + 1));
    if (count <= 0) continue;
    const a = Math.random() * Math.PI * 2, d = Math.random() * 0.4;
    let x = victim.x + Math.cos(a) * d, y = victim.y + Math.sin(a) * d;
    if (game.world.isSolid(x, y)) { x = victim.x; y = victim.y; }
    game.spawn('drop', { x, y, item: entry.item, count });
  }
}

/** Players pick up drops they walk over; old drops vanish. Call every tick. */
export function updateDrops(game) {
  const players = game.players().filter((p) => p.hp > 0);
  for (const d of [...game.entities.values()]) {
    if (d.type !== 'drop') continue;
    d._expiresAt ??= game.time + DROP_SECONDS;
    const p = players.find((pl) => Math.hypot(pl.x - d.x, pl.y - d.y) < PICKUP_RADIUS);
    if (p) {
      game.give(p, d.item, d.count);
      game.sendTo(p.id, 'pickedUp', { item: d.item, count: d.count });
      game.despawn(d.id);
    } else if (game.time > d._expiresAt) {
      game.despawn(d.id);
    }
  }
}
