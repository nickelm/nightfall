// TEAM PLAYER: movement, combat, magic, health, death.
import { registerEntityType, registerItem, registerRecipe, registerKeyHint } from '../../shared/registry.js';

// `light` is the torch every player carries: enough to see by, too weak to keep monsters away.
// hotbar: 9 item names (or null) pointing into the inventory; the held item is hotbar[selected].
// stamina: seconds of running (Shift while moving); the server drains and refills it.
registerEntityType('player', { hp: 10, maxHp: 10, light: 2.5, speed: 5, stamina: 4, maxStamina: 4, hotbar: [null, null, null, null, null, null, null, null, null], selected: 0 });

// Weapons. `damage` is how hard a held item hits in melee (default 1). The optional
// `weapon` field picks an attack kind from modules/player/weapons.js and tunes it;
// items without it swing like a melee weapon. Ranged weapons spend `ammo` items,
// whose `ammo.damage` decides how hard each projectile hits.
registerItem('sword', { color: '#cfd3da', damage: 2, weapon: { kind: 'melee', reach: 0.9, cooldown: 0.35 } });
registerItem('bow',   { color: '#8b5a2b', weapon: { kind: 'ranged', ammo: 'arrow', projectile: 'arrow', speed: 14, range: 12, cooldown: 0.5 } });
registerItem('arrow', { color: '#d8c8a0', ammo: { damage: 1 } });
registerItem('boat', { color: '#9d663b', use: true });
registerRecipe('boat', { inputs: { wood: 5 }, output: { boat: 1 } });
registerRecipe('arrow', { inputs: { wood: 1 }, output: { arrow: 3 } });

// A flying arrow. ttl is seconds left in the air; a faint light shows it at night.
registerEntityType('arrow', { vx: 0, vy: 0, damage: 1, owner: null, ttl: 1, light: 0.6, lightColor: '#ffd9a0' });

registerKeyHint('WASD', 'move');
registerKeyHint('LMB/Space', 'mine / attack');
registerKeyHint('RMB', 'place / guard');
registerKeyHint('Shift', 'run (guard when still)');
registerKeyHint('Esc', 'settings');
registerKeyHint('RMB water with boat', 'board');
registerKeyHint('Boat', 'lands automatically');

// TODO(player team): spells, e.g.
// registerSpell('firebolt', { cost: 2, cooldown: 1 });
