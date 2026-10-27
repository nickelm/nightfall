// TEAM SURVIVAL: items, equipment, crafting, building, hunger, fire.
import { registerItem, registerRecipe, registerEntityType, registerKeyHint } from '../../shared/registry.js';

// placesTile / places: right click with the item in hand puts it into the world.
registerItem('wood',   { color: '#8b5a2b', placesTile: 'wood-wall' });
registerItem('stone',  { color: '#999', placesTile: 'stone-block' });
registerItem('shield', { color: '#a0703a', equip: 'offhand' });
registerItem('pumpkin', { color: '#e8761e' });

// Tools: mining a tile whose `tool` matches takes hardness / power seconds instead of hardness.
registerItem('axe',     { color: '#b08850', tool: 'axe', power: 4 });
registerItem('pickaxe', { color: '#9aa0aa', tool: 'pickaxe', power: 4 });
registerItem('iron-pickaxe', { color: '#b7c7d4', tool: 'pickaxe', power: 8, gear: 1 });
registerItem('gold-pickaxe', { color: '#edc451', tool: 'pickaxe', power: 12, gear: 2 });
registerItem('diamond-pickaxe', { color: '#5de2e7', tool: 'pickaxe', power: 20, gear: 3 });
registerItem('door', { color: '#8b5a2b', placesTile: 'door-closed' });

registerItem('campfire',       { color: '#f80', places: 'campfire' });
registerItem('jack-o-lantern', { color: '#ff8a1a', places: 'jack-o-lantern' });

// A recipe either gives items (output) or places an entity in front of the player (places).
registerRecipe('campfire',       { inputs: { wood: 5 }, output: { campfire: 1 } });
registerRecipe('jack-o-lantern', { inputs: { pumpkin: 1, wood: 1 }, output: { 'jack-o-lantern': 1 } });
registerRecipe('axe',            { inputs: { wood: 3 }, output: { axe: 1 } });
registerRecipe('pickaxe',        { inputs: { wood: 4 }, output: { pickaxe: 1 } });
registerRecipe('shield',         { inputs: { wood: 3, stone: 2 }, output: { shield: 1 } });
registerRecipe('iron-pickaxe', { inputs: { wood: 2, iron: 3 }, output: { 'iron-pickaxe': 1 } });
registerRecipe('gold-pickaxe', { inputs: { wood: 2, gold: 3 }, output: { 'gold-pickaxe': 1 } });
registerRecipe('diamond-pickaxe', { inputs: { wood: 2, diamond: 3 }, output: { 'diamond-pickaxe': 1 } });
registerRecipe('door', { inputs: { wood: 2 }, output: { door: 1 } });

// fuel is in seconds of burn time. A burning fire (repels: true) keeps monsters
// out of its light; its light shrinks as the fuel runs low. interactive: right
// click on it sends 'interact' (feeding it wood).
registerEntityType('campfire', { fuel: 45, maxFuel: 90, light: 6, repels: true, interactive: true, color: '#f80' });

// Jack-o-lanterns never burn out. They scare monsters off (repels) unless more
// than `scares` hostiles are close: a pack of three is brave enough to walk in.
registerEntityType('jack-o-lantern', { light: 3.5, lightColor: '#ff8a1a', repels: true, scares: 2, color: '#e8761e' });

registerKeyHint('1-9/wheel', 'hotbar');
registerKeyHint('E', 'inventory & crafting');
registerKeyHint('RMB on fire', 'feed it');
registerKeyHint('RMB on door', 'open / close');
registerKeyHint('C', 'campfire (5 wood)');
registerKeyHint('V', 'shield (3 wood 2 stone)');

// TODO(survival team): hunger and food, chests.
