// TEAM SURVIVAL: items, equipment, crafting, building, hunger, fire.
import { registerTile, registerItem, registerRecipe, registerEntityType, registerKeyHint } from '../../shared/registry.js';

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
// Match the existing pickaxe tiers; swords use the player's standard melee attack.
for (const tier of [
  { name: 'iron', color: '#b7c7d4', power: 8, damage: 3, gear: 1 },
  { name: 'gold', color: '#edc451', power: 12, damage: 4, gear: 2 },
  { name: 'diamond', color: '#5de2e7', power: 20, damage: 5, gear: 3 },
]) {
  registerItem(`${tier.name}-axe`, { color: tier.color, tool: 'axe', power: tier.power, gear: tier.gear });
  registerItem(`${tier.name}-sword`, { color: tier.color, damage: tier.damage, gear: tier.gear,
    weapon: { kind: 'melee', reach: 0.9, cooldown: 0.35 } });
  registerRecipe(`${tier.name}-axe`, { inputs: { wood: 2, [tier.name]: 3 }, output: { [`${tier.name}-axe`]: 1 } });
  registerRecipe(`${tier.name}-sword`, { inputs: { wood: 1, [tier.name]: 2 }, output: { [`${tier.name}-sword`]: 1 } });
}
registerItem('door', { color: '#8b5a2b', placesTile: 'door-closed' });
registerTile('cabin-floor', { color: '#a77c50', structure: true });
registerItem('cabin', { color: '#a06d42', use: true });
registerRecipe('cabin', { inputs: { wood: 20, stone: 5 }, output: { cabin: 1 } });
registerEntityType('cabin', { light: 5, lightColor: '#ffca78', spawnProtection: 10 });
registerItem('house', { color: '#ad9b88', use: true });
registerRecipe('house', { inputs: { wood: 40, stone: 15 }, output: { house: 1 } });
registerEntityType('house', { light: 7, lightColor: '#ffca78', spawnProtection: 14 });
registerTile('hanok-wall', { color: '#e0d1ad', solid: true, opaque: true, structure: true,
  harvest: { item: 'wood', becomes: 'gravel' }, hardness: 4, tool: 'axe' });
registerTile('hanok-floor', { color: '#ba9060', structure: true });
registerItem('hanok', { color: '#64717b', use: true });
registerEntityType('hanok', { light: 7, lightColor: '#ffd79c', spawnProtection: 14 });
// Legacy hanok definitions above keep old saves readable until migration.
registerTile('rohan-wall', { color: '#a78450', solid: true, opaque: true, structure: true,
  harvest: { item: 'wood', becomes: 'gravel' }, hardness: 4, tool: 'axe' });
registerTile('rohan-floor', { color: '#a27b47', structure: true });
registerItem('rohan-hall', { color: '#a6a15b', use: true });
registerRecipe('rohan-hall', { inputs: { wood: 50, stone: 20 }, output: { 'rohan-hall': 1 } });
registerEntityType('rohan-hall', { light: 7, lightColor: '#ffd79c', spawnProtection: 14 });
registerTile('white-city-wall', { color: '#deded7', solid: true, opaque: true, structure: true,
  harvest: { item: 'stone', becomes: 'gravel' }, hardness: 8, tool: 'pickaxe' });
registerTile('white-city-floor', { color: '#c4c8c6', structure: true });
registerItem('minas-tirith', { color: '#eef0df', use: true });
registerRecipe('minas-tirith', { inputs: { stone: 200, gold: 10, diamond: 5 }, output: { 'minas-tirith': 1 } });
registerEntityType('minas-tirith', { light: 10, lightColor: '#f2efd4', spawnProtection: 22 });

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
registerKeyHint('RMB with cabin', 'build north of entrance');
registerKeyHint('RMB with house', 'build north of entrance');
registerKeyHint('C', 'campfire (5 wood)');
registerKeyHint('V', 'shield (3 wood 2 stone)');

// TODO(survival team): hunger and food, chests.
