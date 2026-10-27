// TEAM WORLD: terrain, biomes, villages, dungeons, resource placement.
// Runs on server AND every client with the same seed, so use ONLY the `rng`
// argument and the noise helpers in shared/rng.js (never Math.random).
import { registerTile, registerItem, registerWorldPass } from '../../shared/registry.js';
import { fbm, hash2 } from '../../shared/rng.js';

// --- tiles (ids are assigned in registration order; never register conditionally) ---
// solid: blocks movement.  opaque: blocks line of sight (fog of war).
// harvest: mined by holding left click; hardness = seconds by hand, `tool` mines it faster.
registerTile('water',  { color: '#2b5d9b', solid: true });
registerTile('sand',   { color: '#c9b77e' });
registerTile('grass',  { color: '#3f6b35' });
registerTile('tree',   { color: '#2f5e25', solid: true, opaque: true, harvest: { item: 'wood', becomes: 'grass' }, hardness: 1.8, tool: 'axe' });
registerTile('stone',  { color: '#7b7b80', solid: true, opaque: true, harvest: { item: 'stone', becomes: 'gravel' }, hardness: 5, tool: 'pickaxe' });
registerTile('gravel', { color: '#5e5a55' });
registerTile('pumpkin', { color: '#e8761e', solid: true, harvest: { item: 'pumpkin', becomes: 'grass' }, hardness: 0.6 });
// blocks players place with right click (wood and stone items carry placesTile); structure: counts as settlement
registerTile('wood-wall',   { color: '#7a5230', solid: true, opaque: true, structure: true, harvest: { item: 'wood', becomes: 'gravel' }, hardness: 2.5, tool: 'axe' });
registerTile('stone-block', { color: '#8a8590', solid: true, opaque: true, structure: true, harvest: { item: 'stone', becomes: 'gravel' }, hardness: 6, tool: 'pickaxe' });

const ORES = [
  { name: 'iron', color: '#b7c7d4', hardness: 8, chance: 0.20, minimum: 6 },
  { name: 'gold', color: '#edc451', hardness: 12, chance: 0.06, minimum: 3 },
  { name: 'diamond', color: '#5de2e7', hardness: 18, chance: 0.014, minimum: 3 },
];
for (const ore of ORES) {
  registerItem(ore.name, { color: ore.color });
  registerTile(`${ore.name}-ore`, {
    color: '#555866', oreColor: ore.color, solid: true, opaque: true,
    harvest: { item: ore.name, becomes: 'gravel' }, hardness: ore.hardness, tool: 'pickaxe',
  });
}

// Doors are tiles, not damageable entities: monsters can neither open nor break them.
registerTile('door-closed', { color: '#8b5a2b', solid: true, opaque: true, structure: true, interact: true,
  harvest: { item: 'door', becomes: 'gravel' }, hardness: 2.5, tool: 'axe' });
registerTile('door-open', { color: '#8b5a2b', structure: true, interact: true,
  harvest: { item: 'door', becomes: 'gravel' }, hardness: 2.5, tool: 'axe' });

// --- pass 1: island terrain from elevation and moisture noise ---
registerWorldPass('terrain', (world, rng) => {
  const s = world.seed;
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const nx = x / world.w - 0.5, ny = y / world.h - 0.5;
      const falloff = Math.hypot(nx, ny) * 1.9;                 // edges sink into the sea
      const elev = fbm(x / 28, y / 28, s, 5) - falloff * falloff * 0.9 + 0.15;
      const moist = fbm(x / 20, y / 20, s + 7, 3);
      let tile = 'grass';
      if (elev < 0.30) tile = 'water';
      else if (elev < 0.34) tile = 'sand';
      else if (elev > 0.64) tile = 'stone';
      else if (moist > 0.56 && hash2(x, y, s) < 0.45) tile = 'tree';   // forests
      else if (hash2(x, y, s + 1) < 0.02) tile = 'tree';               // lone trees
      world.set(x, y, tile);
    }
  }
}, { order: 0 });

// Mountain deposits plus small outcrops in the field; leave the spawn area clear.
registerWorldPass('ores', (world, rng) => {
  const candidates = [], counts = Object.fromEntries(ORES.map(ore => [ore.name, 0]));
  const rareFirst = [...ORES].reverse();
  for (let y = 1; y < world.h - 1; y++) {
    for (let x = 1; x < world.w - 1; x++) {
      if (Math.hypot(x - world.w / 2, y - world.h / 2) < 6) continue;
      const name = world.tile(x, y).name;
      if (name !== 'stone' && name !== 'grass') continue;
      candidates.push({ x, y });
      const roll = rng(), scale = name === 'stone' ? 1 : 0.07;
      const ore = rareFirst.find(ore => roll < ore.chance * scale);
      if (ore) { world.set(x, y, `${ore.name}-ore`); counts[ore.name]++; }
    }
  }
  // Even a small island supplies enough of every material to craft its pickaxe.
  for (const ore of ORES) {
    const start = Math.floor(rng() * candidates.length);
    for (let i = 0; i < candidates.length && counts[ore.name] < ore.minimum; i++) {
      const { x, y } = candidates[(start + i) % candidates.length];
      if (!['grass', 'stone'].includes(world.tile(x, y).name)) continue;
      world.set(x, y, `${ore.name}-ore`); counts[ore.name]++;
    }
  }
}, { order: 100 });

// --- pass 2: pumpkin patches on open grass (it is Halloween) ---
registerWorldPass('pumpkins', (world) => {
  const s = world.seed, cx = world.w / 2, cy = world.h / 2;
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (Math.hypot(x - cx, y - cy) < 4 || world.tile(x, y).name !== 'grass') continue; // keep spawn walkable
      if (fbm(x / 9, y / 9, s + 31, 2) > 0.7 && hash2(x, y, s + 5) < 0.25) world.set(x, y, 'pumpkin');
    }
  }
}, { order: 150 });

// TODO(world team): more passes, e.g.
// registerWorldPass('villages', (world, rng) => { ... }, { order: 200 });
// registerWorldPass('dungeons', (world, rng) => { ... }, { order: 300 });
// Keep the area around the island center walkable: players spawn there.
