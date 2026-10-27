// TEAM PLAYER: movement, combat, magic, health, death.
import { registerEntityType, registerItem, registerKeyHint } from '../../shared/registry.js';

// `light` is the torch every player carries: enough to see by, too weak to keep monsters away.
// hotbar: 9 item names (or null) pointing into the inventory; the held item is hotbar[selected].
// stamina: seconds of running (Shift while moving); the server drains and refills it.
registerEntityType('player', { hp: 10, maxHp: 10, light: 2.5, speed: 5, stamina: 4, maxStamina: 4, hotbar: [null, null, null, null, null, null, null, null, null], selected: 0 });

// Every new player starts with a sword. `damage` is how hard a held item hits (default 1).
registerItem('sword', { color: '#cfd3da', damage: 2 });

registerKeyHint('WASD', 'move (W toward cursor)');
registerKeyHint('LMB/Space', 'mine / attack');
registerKeyHint('RMB', 'place / guard');
registerKeyHint('Shift', 'run (guard when still)');
registerKeyHint('Esc', 'settings');

// TODO(player team): spells, e.g.
// registerSpell('firebolt', { cost: 2, cooldown: 1 });
