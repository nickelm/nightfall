// TEAM CREATURES: monsters, animals, villagers/NPCs, quests.
import { registries, registerEntityType, registerItem, registerKeyHint, registerRecipe } from '../../shared/registry.js';

registerEntityType('slime', { hp: 3, color: '#8fdc4a', speed: 1.6, damage: 1, hostile: true, windup: false, aggro: 8, threat: 1 });
// hostile + hp: counted by the game director; threat: how much of its budget one costs.

// Blood slime: a red slime twice the size and with twice the life. Same slime AI;
// `size` scales its body, collision, and bite reach (slimes are size 1).
// splitsInto / splitCount: when killed, it bursts into that many of that type.
registerEntityType('blood-slime', { hp: 6, size: 2, color: '#c0262f', speed: 1.6, damage: 1, hostile: true, windup: false, aggro: 8, threat: 2, splitsInto: 'slime', splitCount: 2 });

// Night monsters with their own AI (monsters-server.js). All honor stunnedUntil and show
// `windup` before every attack. Spiders leap (`leaping` while airborne) and can clear walls;
// zombies are slow and tough, and bash doors open and wood walls down (`bashing`);
// skeletons keep their distance and shoot bone arrows.
registerEntityType('spider',   { hp: 2,  color: '#3a3340', speed: 2.4, damage: 1, hostile: true, windup: false, leaping: false, aggro: 10, threat: 1 });
registerEntityType('zombie',   { hp: 10, color: '#6f8f5a', speed: 0.9, damage: 2, hostile: true, windup: false, bashing: false, aggro: 12, threat: 2 });
registerEntityType('skeleton', { hp: 4,  color: '#e8e2d0', speed: 1.3, damage: 1, hostile: true, windup: false, aggro: 14, threat: 2 });
registerEntityType('bone-arrow', { vx: 0, vy: 0, damage: 1, owner: null, ttl: 1, light: 0.5, lightColor: '#e8e2d0' });

// Wildlife: predators that roam by day, picked by biome (wildlife-server.js). They are
// `predator`, not `hostile`: the night director does not count them and light does not burn
// them, but campfires still keep them out. Players walk at 5 and run at 8.
//   bite      seconds of windup before a bite (the parry cue); cooldown between bites
//   leash     tiles from home before a predator gives up the chase
//   fleeAt    share of hp at which it runs away (0: fights to the death)
//   knock     bears knock you back this many tiles
//   charge    lions stalk slowly, then charge at this speed for a moment
export const PREDATORS = {
  wolf:         { hp: 4,  speed: 5.5, damage: 1, aggro: 8,  leash: 20, fleeAt: 0.3,  bite: 0.35, cooldown: 1.0, color: '#7d7468' },
  'snow-wolf':  { hp: 5,  speed: 5.5, damage: 1, aggro: 9,  leash: 20, fleeAt: 0.3,  bite: 0.35, cooldown: 1.0, color: '#dfe4ec' },
  bear:         { hp: 12, speed: 4,   damage: 3, aggro: 5,  leash: 12, fleeAt: 0,    bite: 0.7,  cooldown: 1.8, knock: 1, color: '#5a3d26' },
  'polar-bear': { hp: 16, speed: 4.5, damage: 3, aggro: 7,  leash: 14, fleeAt: 0,    bite: 0.7,  cooldown: 1.8, knock: 1.2, color: '#f2efe6' },
  lion:         { hp: 8,  speed: 2.2, damage: 2, aggro: 11, leash: 22, fleeAt: 0.25, bite: 0.3,  cooldown: 1.4, charge: 9, color: '#c8964a' },
};
for (const [name, p] of Object.entries(PREDATORS)) {
  registerEntityType(name, { hp: p.hp, maxHp: p.hp, speed: p.speed, damage: p.damage, aggro: p.aggro, color: p.color,
    predator: true, windup: false, stalking: false, charging: false, fleeing: false });
}
// Meat and fur drop from predators. `food` is for Survival to make meat edible and cookable.
registerItem('meat', { color: '#b5483b', food: 20 });
registerItem('fur', { color: '#8a6f55' });

// Loot (tables in loot.js): monster goo, and an item lying on the ground until someone walks over it.
registerItem('monster-goo', { color: '#8fdc4a' });
registerEntityType('drop', { item: null, count: 1 });

// Livestock are non-hostile and can be carried as items or raised in a pen.
export const ANIMALS = {
  pig:     { color: '#eaa6a9', product: 'truffle', productColor: '#755341', speed: 0.55 },
  sheep:   { color: '#e8e2d4', product: 'wool',    productColor: '#f2eadb', speed: 0.50 },
  chicken: { color: '#f4e5c4', product: 'egg',     productColor: '#f7e8bf', speed: 0.65 },
  cow:     { color: '#d4c9b9', product: 'milk',    productColor: '#e8f0ed', speed: 0.45 },
};
for (const [name, animal] of Object.entries(ANIMALS)) {
  registerEntityType(name, { animal: true, interactive: true, color: animal.color, speed: animal.speed });
  registerItem(name, { animal: name, color: animal.color, use: true });
  registerItem(animal.product, { color: animal.productColor });
}
registerItem('animal-pen', { color: '#9b6b3d', places: 'animal-pen' });
registerRecipe('animal-pen', { inputs: { wood: 5 }, output: { 'animal-pen': 1 } });
registerEntityType('animal-pen', { interactive: true, animal: null, growth: 0, feed: 0, stock: 0 });

registerKeyHint('RMB animal', 'catch');
registerKeyHint('RMB pen', 'house / feed / collect');

registerKeyHint('F3', 'director debug');
registerKeyHint('F4', 'RTS mode');

// RTS mode (rts-server.js, rts-art.js): F4 hides your hero and gives you `peasants` workers.
// A click sends them to mine the harvestable tiles within `radius` of that spot; each load
// goes to the nearest Minas Tirith (`hall`, `hallW` x `hallH` tiles) and is split equally
// among everyone online. Mining takes the tile's hardness times `mineSlow`, at most `maxMine` s.
export const RTS = { peasants: 3, speed: 3, radius: 7, mineSlow: 1.5, maxMine: 8, hall: 'minas-tirith', hallW: 13, hallH: 10 };
registerEntityType('peasant', { owner: null, speed: RTS.speed, task: 'idle', carry: null, carryCount: 0, work: 0, area: null,
  dir: { x: 0, y: 1 }, light: 1.5, lightColor: '#ffd27a' });

// Dynamite: three lava make one stick; right click places it, and it explodes after
// `fuse` seconds, dealing `damage` to everything within `radius` tiles (dynamite-server.js).
export const DYNAMITE = { fuse: 3, damage: 20, radius: 2 };
registerItem('dynamite', { color: '#b3241c', places: 'dynamite' });
registerRecipe('dynamite', { inputs: { lava: 3 }, output: { dynamite: 1 } });
registerEntityType('dynamite', { light: 1, lightColor: '#ffb347' });
registerKeyHint('RMB dynamite', 'light the fuse');

// Giant potion: slimes and blood slimes drop it one time in five. Right click to drink: for
// `seconds` the player is drawn twice as big and deals twice the damage (giant-potion-server.js).
// The player carries `giantUntil` (game time) while it lasts; clients draw the countdown.
export const GIANT = { seconds: 10, scale: 2, damage: 2, dropChance: 0.2, droppedBy: ['slime', 'blood-slime'] };
registerItem('giant-potion', { color: '#d23cff', use: true });
registerKeyHint('RMB giant potion', 'drink: giant for 10 s');

// Double swords: for every sword the other teams registered before us (world, player and
// survival load first), a `double-<sword>` three times as big and as strong but twice as
// slow. Its recipe costs twice the normal sword's. Large monsters drop one now and then
// (double-sword-server.js); the big blade is drawn in double-sword-art.js.
export const DOUBLE_SWORD = { scale: 3, damage: 3, slower: 2, cost: 2, dropChance: 0.1, droppedBy: ['blood-slime', 'zombie'] };
const swords = [...registries.items.values()].filter((i) => i.weapon?.kind === 'melee' && /(^|-)sword$/.test(i.name));
for (const sword of swords) {
  const name = `double-${sword.name}`, w = sword.weapon;
  registerItem(name, { color: sword.color, gear: sword.gear, doubleSword: sword.name,
    damage: (sword.damage ?? 1) * DOUBLE_SWORD.damage,
    weapon: { ...w, reach: (w.reach ?? 0.9) * DOUBLE_SWORD.scale, cooldown: (w.cooldown ?? 0.35) * DOUBLE_SWORD.slower } });
  const recipe = registries.recipes.get(sword.name);
  if (recipe) registerRecipe(name, { inputs: Object.fromEntries(Object.entries(recipe.inputs).map(([k, n]) => [k, n * DOUBLE_SWORD.cost])), output: { [name]: 1 } });
}
