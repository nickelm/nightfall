// TEAM CREATURES: monsters, animals, villagers/NPCs, quests.
import { registerEntityType, registerItem, registerKeyHint, registerRecipe } from '../../shared/registry.js';

registerEntityType('slime', { hp: 3, color: '#8fdc4a', speed: 1.6, damage: 1, hostile: true, windup: false, aggro: 8, threat: 1 });
// hostile + hp: counted by the game director; threat: how much of its budget one costs.

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
