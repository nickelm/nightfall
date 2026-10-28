// TEAM PLAYER: movement, combat, magic, health, death.
import { registerEntityType, registerItem, registerRecipe, registerKeyHint, registerSpell } from '../../shared/registry.js';

// `light` is the torch every player carries: enough to see by, too weak to keep monsters away.
// hotbar: 9 item names (or null) pointing into the inventory; the held item is hotbar[selected].
// stamina: seconds of running (Shift while moving); the server drains and refills it.
// mana: spell power; maxMana is 0 until the player owns a staff (spells-server.js).
// mended: someone is healing this player over time (clients draw a bubble).
// channeling: id of the player this one is mending, or null.
registerEntityType('player', { hp: 10, maxHp: 10, light: 2.5, speed: 5, stamina: 4, maxStamina: 4, mana: 0, maxMana: 0, mended: false, channeling: null, hotbar: [null, null, null, null, null, null, null, null, null], selected: 0 });

// Weapons. `damage` is how hard a held item hits in melee (default 1). The optional
// `weapon` field picks an attack kind from modules/player/weapons.js and tunes it;
// items without it swing like a melee weapon. Ranged weapons spend `ammo` items,
// whose `ammo.damage` decides how hard each projectile hits.
registerItem('sword', { color: '#cfd3da', damage: 2, weapon: { kind: 'melee', reach: 0.9, cooldown: 0.35 } });
registerItem('bow',   { color: '#8b5a2b', weapon: { kind: 'ranged', ammo: 'arrow', projectile: 'arrow', speed: 14, range: 12, cooldown: 0.5 } });
registerItem('arrow', { color: '#d8c8a0', ammo: { damage: 1 } });
registerItem('boat', { color: '#9d663b', use: true });
registerRecipe('boat', { inputs: { wood: 5 }, output: { boat: 1 } });
registerItem('portal', { color: '#72e5f1', places: 'portal' });
registerRecipe('portal', { inputs: { diamond: 5 }, output: { portal: 1 } });
registerEntityType('portal', { interactive: true, color: '#72e5f1' });
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
registerKeyHint('RMB portal', 'enter; WASD travel, Space exit');

// Magic. Craft a staff (offensive) or a mace (defensive, a cleric's) to get a mana bar;
// with one in hand, the mouse button and what is under the cursor pick the spell
// (SPELLS_BY_ITEM in sight.js). `item`: what you must hold to cast it. Spells need line
// of sight to their target unless they say `sight: false` (heals and firestorms reach
// around walls). `free`: cast at empty ground too, as a shot in that direction or at that point.
registerItem('staff', { color: '#6a3fa0', gear: 2, damage: 1 }); // damage: the default, but it files the staff under Weapons
registerRecipe('staff', { inputs: { wood: 3, 'monster-goo': 3 }, output: { staff: 1 } });
registerItem('mace', { color: '#e8c25a', gear: 2, damage: 2 }); // swings like a sword, but never taunts
registerRecipe('mace', { inputs: { wood: 2, stone: 2, 'monster-goo': 3 }, output: { mace: 1 } });
registerSpell('fireball',  { item: 'staff', on: 'foe',    free: 'direction', cost: 3,  cooldown: 0.5, range: 11, damage: 3, speed: 11 });
registerSpell('firestorm', { item: 'staff', on: 'foe',    free: 'point',     sight: false, cost: 10, cooldown: 5,   range: 11, damage: 2, radius: 2.5, meteors: 10, duration: 1.8, splash: 1 });
registerSpell('heal',      { item: 'mace',  on: ['friend', 'self'],          sight: false, cost: 1,  cooldown: 0.6, range: 22, amount: 2 }); // cheap and far-reaching: hold to keep healing
registerSpell('mend',      { item: 'mace',  on: ['friend', 'self'],          sight: false, cost: 1,  cooldown: 0,   range: 22, drain: 1, rate: 2 }); // held: drain mana/s, rate hp/s
// A purple nova bursting out of the caster: huge damage to every foe in reach, but it
// also hurts any friend caught in it; the caster is unharmed.
// Cheap and quick to repeat: the danger is to the people standing next to you.
registerSpell('nova',      { item: 'staff', on: 'self',                      cost: 3,  cooldown: 1,   range: 1,  radius: 3.5, damage: 8, friendDamage: 2 });

// A homing fireball; a short-lived burst of light where something explodes (blast);
// meteors raining on an area (firestorm). All carry `light`, so they light the night.
registerEntityType('fireball', { vx: 0, vy: 0, target: null, owner: null, damage: 3, ttl: 2, light: 2.2, lightColor: '#ff6a1a' });
registerEntityType('blast', { light: 0, lightColor: '#ffe070', age: 0, ttl: 0.6, peak: 3.5, hot: '#ffe070', cool: '#ff3a10' });
registerEntityType('firestorm', { radius: 2.5, ttl: 1.8, owner: null, light: 3, lightColor: '#ff3a10' });

registerKeyHint('Staff', 'LMB fireball (on yourself: nova) · RMB firestorm');
registerKeyHint('Mace', 'LMB heal · RMB mend (hold), on a friend or yourself');
registerKeyHint('Sword', 'swings taunt nearby foes');
