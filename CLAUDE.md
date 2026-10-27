# Instructions for coding agents

You are helping one team of two or three people during a two-hour game jam with 10 to 13 people. Five teams work in parallel on the same repo, on Windows, macOS, and Linux, and commit straight to `main`. Read `DESIGN.md` for the game design, the full API, and the event list. The rules below keep five teams from breaking each other's work.

## Hard rules

1. **Work only in your team's folder:** `modules/world/`, `modules/player/`, `modules/survival/`, `modules/creatures/`, or `modules/art/`. Ask the user which team they are on if it is not obvious. Do not edit `shared/`, `server/`, `client/`, or another team's folder; if a change there is truly needed, stop and tell the user to ask the integration lead.
2. **Each team folder has exactly three entry files:** `shared.js` (loaded on server and client), `server.js`, and `client.js`. You may add helper files in the folder and import them from these three. Name new files in lowercase and write import paths with the exact case and the `.js` extension: Windows and macOS forgive a wrong case, but the shared server may run Linux, which does not.
3. **Register tiles, items, recipes, entity types, spells, world passes, and key hints only in `shared.js`,** unconditionally, at the top level. Tile ids depend on registration order.
4. **The server decides gameplay.** Clients may only change their own player's `x`, `y`, and `dir`. Anything else (health, inventory, tiles, creatures) changes in `server.js` through `onAction` handlers and `registerSystem` systems.
5. **World passes must be deterministic.** Use the `rng` argument and `fbm` / `valueNoise` / `hash2` from `shared/rng.js`. Never `Math.random()` or `Date.now()` in a world pass.
6. **Entity defaults are plain JSON data.** No functions or class instances on entities. Fields starting with `_` are private to the side that sets them (AI state, cooldowns, animation timers).
7. **No new npm packages, no build tools, no TypeScript, no frameworks.** Plain JavaScript ES modules and Canvas 2D.
8. **Hurt things only with `game.damage(target, amount, source)`.** Never subtract `hp` directly: blocking and parrying hook into the `damage` event it emits.
9. **Coordinate with other teams through events and entity fields,** never by importing their files. Prefer adding a field (`e.burning = true`) or an event (`game.bus.emit('itemDropped', ...)`) that another team can pick up.
10. **Keep state on entities or on `game`, never in module-level variables,** and never use `setInterval`/`setTimeout` in server code (use `registerSystem`). `npm run dev` hot-swaps `server.js` files in place, which resets module variables and would leave old timers running.
11. **Keep changes small** and make sure the game still starts after each one.

## Files

```
server/index.js        server: static files, WebSocket, game loop, server `game` object, persistence
server/dev.js          `npm run dev`: hot-swaps server.js changes, restarts (keeping state) for the rest
server/hot-hooks.js    loader hook that makes hot swaps reload helper files too
client/main.js         client entry, client `game` object, frame loop
client/core/           input.js, net.js (snapshots, reconnect), render.js (tiles, entities,
                       lighting, fog, HUD), vision.js (fog of war, line of sight)
shared/registry.js     all register* functions        shared/world.js   World class
shared/rng.js          seeded random + noise          shared/time.js    day/night clock
shared/config.js       world size, tile size, tick rate, day length
modules/manifest.js    module load order
modules/<team>/        shared.js, server.js, client.js
```

Coordinates are in tiles (floats). Tile `(tx, ty)` covers `tx ≤ x < tx + 1`. Entity `x, y` is the entity's center. Use `game.world.blocked(x, y, r)` for collision and `game.world.tile(x, y)` to read a tile definition.

Entity fields with meaning across teams:

| Field | Meaning |
|---|---|
| `light` | Radius in tiles. Lights the night and decides what players can see after dusk (fog of war). Players carry `light: 2.5` (their torch). |
| `lightColor` | Tint of the glow around a light (default warm orange). Jack-o-lanterns use `'#ff8a1a'`. |
| `repels` | With `light`, monsters stay out of 80% of the light radius. Burning campfires set it; embers do not. |
| `scares` | A number n: a system keeps `repels` on only while at most n hostiles are near. Jack-o-lanterns have `scares: 2`. |
| `interactive` | Right click at this entity sends `interact` (campfires: feed wood). |
| `hotbar`, `selected` | Player only: nine item names (or null) and the slot in hand. The held item is `hotbar[selected]`. |
| `mining` | Player only: `{ x, y, p }` while mining a tile, `p` from 0 to 1 (Art draws the cracks). |
| `hp`, `maxHp` | Makes an entity damageable through `game.damage()`. Non-players despawn at 0. |
| `stunnedUntil` | Game time until which a creature does nothing. Set by parries. |
| `guarding` | Player is holding guard (block with a shield, parry without). |
| `windup` | Creature is about to attack: the visual cue players parry on. |
| `inventory` | `{ itemName: count }`; change it only with `game.give()`. |
| `hostile`, `threat` | A monster the game director counts against its budget, and how much it costs (default 1). |
| `aggro` | Tiles within which a creature notices players (slimes 8, horde members 25). |

Item flags: `gear` (a number) or `equip` adds to the group's gear score, which raises the director's budget. `damage` is melee damage while held (default 1). `tool` (`'axe'`, `'pickaxe'`) and `power` divide the mining time of tiles with the same `tool`. `places: 'entityType'` or `placesTile: 'tileName'` lets right click place the item; `use: true` makes right click send a `use` action that your own `onAction('use', ...)` handles.

Tile flags: `solid` blocks movement, `opaque` blocks line of sight, `structure` counts toward the settlement, `harvest: { item, count, becomes }` makes a tile minable by holding the left button, `hardness` is the seconds that takes by hand (default 1), `tool` names the tool that mines it faster, and `interact: true` makes right click send `interact` at it (doors).

Halloween art direction: draw with `game.theme.colors` (pumpkin, candle, bone, ash, purple, moon, toxic, blood, night, panel) and write text with `game.font(px)` or `game.font(px, 'display')`, both from `client/core/theme.js`. While `game.ui` is set (inventory, settings), skip world input and world overlays.

The game director (`modules/creatures/director.js`) decides when and where monsters spawn at night. A new monster type spawns through it: give the type `hostile: true`, `hp`, and a `threat` cost, and add a spawn function like `spawnSlime` in `modules/creatures/server.js`. Tuning numbers live in `TUNING`; F3 in the browser shows the live state.

## Patterns

**A new harvestable tile** (`shared.js`):

```js
import { registerTile, registerItem } from '../../shared/registry.js';
registerItem('iron', { color: '#b0a090' });
registerTile('iron-ore', { color: '#6d5f55', solid: true, opaque: true, harvest: { item: 'iron', becomes: 'gravel' }, hardness: 8, tool: 'pickaxe' });
```

**An item that does something on right click** (`shared.js`, then `server.js`):

```js
registerItem('candy', { color: '#f6c', use: true });           // shared.js
onAction('use', (game, player, { x, y }) => {                  // server.js
  if (player.hotbar[player.selected] !== 'candy') return;      // every 'use' handler runs: skip items that are not ours
  game.give(player, 'candy', -1);
  player.hp = Math.min(player.maxHp, player.hp + 2);
});
```

**A new creature** (type in `shared.js`, behavior in `server.js`, look in `modules/art/client.js` or your own `client.js`):

```js
// shared.js
registerEntityType('bat', { hp: 1, speed: 3, color: '#535' });

// server.js
import { registerSystem } from '../../shared/registry.js';
registerSystem('bat-ai', (game, dt) => {
  for (const e of game.entities.values()) {
    if (e.type !== 'bat') continue;
    e._t = (e._t || 0) + dt;
    e.x += Math.cos(e._t * 3) * e.speed * dt;
  }
});

// client.js
import { registerDrawer } from '../../shared/registry.js';
registerDrawer('bat', (ctx, e, sx, sy, T) => {
  ctx.fillStyle = e.color;
  ctx.fillRect(sx - T * 0.2, sy - T * 0.1, T * 0.4, T * 0.2);
});
```

**Damage and reactions** (`server.js`):

```js
game.damage(target, 2, attacker);                // the only way to hurt things
onEvent('damage', (game, hit) => {               // armor: halve damage for anyone wearing it
  if (game.has(hit.target, 'armor')) hit.amount = Math.ceil(hit.amount / 2);
});
onEvent('killed', (game, victim, killer) => {    // loot
  if (victim.type === 'slime') game.spawn('drop', { x: victim.x, y: victim.y, item: 'goo' });
});
```

**A new player action** (key in `client.js`, effect in `server.js`):

```js
// client.js
registerClientSystem('cast-input', (game) => {
  if (game.input.pressed('KeyF')) game.sendAction('cast', { spell: 'firebolt' });
});

// server.js
onAction('cast', (game, player, { spell }) => {
  game.spawn('firebolt', { x: player.x, y: player.y, vx: player.dir.x * 8, vy: player.dir.y * 8, owner: player.id, light: 2 });
});
```

**Feedback on every client** (server → client):

```js
game.broadcast('exploded', { x, y });                       // server.js
onEvent('net:exploded', (game, { x, y }) => { /* ... */ }); // client.js
```

An entity with a numeric `light` field lights up the night automatically. On the client, `game.canSee(x, y)` tells you whether any player can see a position right now (fog of war; sight is shared), and `game.targetTile()` gives the tile the player is aiming at with the mouse. Item icons for the hotbar come from `registerDrawer('item:<name>', (ctx, item, cx, cy, size, game) => ...)`.

## Testing

- `npm run dev`, then open `http://localhost:8080/?name=A` and `http://localhost:8080/?name=B` in two tabs. Saving `server.js` hot-swaps it into the running game; saving `client.js` reloads the browsers; saving `shared.js` restarts the server and restores the game state. Never restart anything by hand. If saved state no longer fits a changed data model, type `f` + Enter in the dev terminal for a fresh world.
- `npm run dev:night` starts at dusk with three-minute days, so you can test night features right away. Other settings go after `node server/dev.js` as `NAME=value` arguments, which work in every shell: `node server/dev.js SEED=1234` fixes the island, and `START_PHASE`, `DAY_LENGTH`, and `PORT` work the same way.
- Do not start `npm run dev` yourself: the user keeps it running in their own terminal. Tell them what to look at instead.
- `npm test` runs headless tests of the core loop, combat, fire, the director, and live code updates. Run it before pushing anything that touches harvesting, crafting, combat, or spawning.
- `window.game` in the browser console exposes the client state.
- Errors inside systems, handlers, and drawers are caught and logged (at most once every five seconds per site), so check the server terminal and the browser console after each change.
