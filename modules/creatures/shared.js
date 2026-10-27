// TEAM CREATURES: monsters, animals, villagers/NPCs, quests.
import { registerEntityType, registerItem, registerKeyHint, registerRecipe } from '../../shared/registry.js';

registerEntityType('slime', { hp: 3, color: '#8fdc4a', speed: 1.6, damage: 1, hostile: true, windup: false, aggro: 8, threat: 1 });
// hostile + hp: counted by the game director; threat: how much of its budget one costs.

// Blood slime: a red slime twice the size and with twice the life. Same slime AI;
// `size` scales its body, collision, and bite reach (slimes are size 1).
// splitsInto / splitCount: when killed, it bursts into that many of that type.
registerEntityType('blood-slime', { hp: 6, size: 2, color: '#c0262f', speed: 1.6, damage: 1, hostile: true, windup: false, aggro: 8, threat: 2, splitsInto: 'slime', splitCount: 2 });

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

// Dynamite: three lava make one stick; right click places it, and it explodes after
// `fuse` seconds, dealing `damage` to everything within `radius` tiles (dynamite-server.js).
export const DYNAMITE = { fuse: 3, damage: 20, radius: 2 };
registerItem('dynamite', { color: '#b3241c', places: 'dynamite' });
registerRecipe('dynamite', { inputs: { lava: 3 }, output: { dynamite: 1 } });
registerEntityType('dynamite', { light: 1, lightColor: '#ffb347' });
registerKeyHint('RMB dynamite', 'light the fuse');

// Giant potion: large monsters (size 2 or more) may drop it. Right click to drink: for
// `seconds` the player is drawn twice as big and deals twice the damage (giant-potion-server.js).
// The player carries `giantUntil` (game time) while it lasts; clients draw the countdown.
export const GIANT = { seconds: 10, scale: 2, damage: 2, dropChance: 0.5 };
registerItem('giant-potion', { color: '#d23cff', use: true });
registerKeyHint('RMB giant potion', 'drink: giant for 10 s');
