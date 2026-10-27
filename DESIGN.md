# Nightfall: Design Document

*Nightfall is a working title.* CA3 Retreat 2026 · vibe-coding jam · 2 hours · 10 to 13 people in 5 teams of two or three

## Pitch

Nightfall is a Halloween-themed multiplayer top-down survival game on a small procedural island. By day, players explore, cut trees, mine stone, pick pumpkins, and build. At night, the island goes dark and slimes crawl out of the shadows. Everyone carries a torch, but a torch only lets you see the monsters coming; the only safe ground lies within the light of a burning campfire, and campfires eat wood. Carved jack-o-lanterns frighten off stragglers, but not a pack. A game director watches how strong the group has become and sends trouble to match. The game borrows ideas from Minicraft (a top-down tile world you can mine and rebuild), Don't Starve (darkness as the enemy, fires you must keep fed), Left 4 Dead and Darktide (a director that paces the threat), and classic top-down action adventures (melee, shields, villages, dungeons). Everything we make stays original: no borrowed names, sprites, or music.

## Design pillars

1. **The night is the clock.** A full day lasts eight minutes by default, and the last quarter of it is night: two minutes of darkness after a dusk of about fifty seconds. All players face the same night at the same moment, which gives everyone a shared rhythm of preparation and panic.
2. **Light is the resource.** Torches let you see; fires keep you safe; wood keeps fires burning. Every night poses the same question: do we have enough wood?
3. **The threat grows with you.** More players, better gear, and a bigger settlement bring bigger nights. Safety is never permanent.
4. **The world is the material.** Every tile can turn into something else. Trees become wood, stone becomes tunnels, and wood becomes walls.
5. **Small and playable beats big and broken.** Every feature should be playable within 20 minutes of starting work on it.

The core loop: explore, harvest, craft and build, survive the night around the fire, watch the slimes melt at dawn, and start again with better tools.

## Controls

| Input | Action |
|---|---|
| WASD or arrows | Move. By default W walks toward the cursor, S backs away, and A and D strafe; the Esc settings switch to screen-relative movement (W is up) |
| Mouse | Aim: the character turns freely toward the cursor |
| Left mouse or Space (hold) | Mine the targeted tile; with nothing to mine (or a monster under the cursor), swing |
| Right mouse | Interact with what you aim at (feed wood to a campfire); otherwise use the held item (place a block, campfire, or jack-o-lantern); with a sword, tool, or empty hand, guard |
| Shift (hold) | Guard: block with a shield, otherwise parry |
| 1–9 or mouse wheel | Select a hotbar slot |
| E (or Tab) | Inventory and crafting screen: hover an item and press 1–9 to put it in that slot; click a recipe to craft |
| C / V | Quick-craft a campfire (5 wood) / a shield (3 wood, 2 stone) |
| Esc | Settings: movement mode, aim indicator |
| F3 | Director debug panel |

The targeted tile is the one under the cursor when it is within reach, otherwise the tile in front of the player; an outline marks it, and a translucent ghost shows where a held block would go. Space mirrors the left button for people on trackpads.

## What the skeleton already does

The repo runs out of the box and contains one thin vertical slice through every team's area:

- **World.** A seeded island with water, sand, grass, forests (with the odd dead tree), stone, and pumpkin patches, generated identically on server and clients.
- **Mining.** Hold the left button on a tree, rock, or pumpkin; cracks spread until it breaks. Each tile has a `hardness` (seconds by hand: a tree 1.8, stone 5, a pumpkin 0.6), and the matching tool divides it by its `power`: an axe chops a tree in under half a second, a pickaxe breaks stone in about a second.
- **Hotbar, inventory, and crafting.** Nine hotbar slots fill up as you pick things up; 1–9 or the wheel picks the held item, which shows in your character's hand. E opens the inventory with a crafting list: campfire, jack-o-lantern, axe, pickaxe, shield. New players start with a sword (2 damage; everything else hits for 1).
- **Building.** Right click with wood or stone places a wall block (`wood-wall`, `stone-block`; `structure: true`, so they count toward the settlement). Mining a block gives it back.
- **Jack-o-lanterns.** Carve one from a pumpkin and a piece of wood and place it with right click. It never burns out and lights a radius of 3.5 tiles. One or two monsters keep out of its light; a pack of three or more walks right in, and its candle gutters red.
- **True top-down view.** The camera looks straight down. Characters rotate freely toward the cursor, with a torch in the left hand and a sword in the right; trees, rocks, slimes, and fires are all drawn from above.
- **Fog of war, shared sight.** Every frame each client computes every player's line of sight (up to 13 tiles, blocked by trees and stone) and shows the union, while the camera stays on your own player. You see every monster that any player can see. Tiles any player has seen before stay on screen, dimmed; tiles no one has seen stay black. After dusk a player sees only what some light source illuminates: their torch, other players' torches, and campfires.
- **Torch.** Every player carries a torch with a light radius of 2.5 tiles. It reveals monsters but does not keep them away.
- **Campfires.** Craft one (5 wood) and place it with right click. It starts with 45 seconds of fuel (maximum 90) and shows a fuel bar. Each wood fed by right-clicking it adds 20 seconds. Its light shrinks during the last 30 seconds; at zero it turns to embers that no longer protect anyone.
- **Monsters and fire.** Slimes never step into the light of a burning campfire. They gather at its edge, and a slime caught inside when a new fire starts flees. A fire that burns out lets them in.
- **Combat.** Swing with the left mouse button; two sword hits (three with anything else) kill a slime, with a little knockback. Slimes telegraph each bite: they swell and turn orange for 0.4 seconds. Holding guard with a shield blocks every hit from the front. Without a shield, guard parries: pressing it in the 0.25 seconds before a hit cancels the hit, knocks the attacker back, and stuns it for 1.2 seconds. Hits from the side or behind always land.
- **Game director.** A director paces each night through build-up, peak, and relax phases and sends a horde around midnight (two hordes from the third night on). The size of the threat scales with the number of players, their gear, the settlement, and the night number. See the section below.
- **Death.** Dead players respawn at the island center with full health and keep their inventory.
- **Presentation.** A Halloween look: the Creepster and Grenze fonts, a pumpkin, candle, bone, and violet palette (`client/core/theme.js`), a purple-black night, and a warm glow around every light. Code-drawn sprites, sparks on parries and blocks, on-screen notices (nightfall, dawn, hordes, code updates), synthesized sound effects, a hotbar with hearts, and an Esc settings panel stored per browser.
- **Live code updates.** `npm run dev` swaps new server code into the running game without disconnecting anyone, and restarts (keeping all state) only when the data model changes. See "Development workflow".

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Client | Plain JavaScript ES modules, Canvas 2D | No build step and no framework conventions to fight. LLM agents write Canvas code reliably. |
| Server | Node.js 20+ with one dependency (`ws`) | The same process serves the game files and the WebSocket. |
| Shared code | `shared/` and `modules/*/shared.js` | The same files run in Node and in the browser. |
| Art | Drawn in code | No asset pipeline, no licensing questions. |
| Sound | WebAudio synthesis (`blip()` in `modules/art/client.js`) | No audio files needed. |

## Architecture

```
                 SERVER (Node, authoritative, 20 Hz)
     ┌──────────────────────────────────────────────────┐
     │  world: seed + tile edits     clock: day/night   │
     │  entities: players, slimes, campfires, ...       │
     │  systems (every tick)   action handlers          │
     │  game director (game.director)                   │
     └──────────────────────────────────────────────────┘
          ▲  hello, move, action        │  welcome, snap, tile,
          │                             ▼  event, teleport, reload
     ┌──────────────────────────────────────────────────┐
     │  CLIENT (browser) × 10                           │
     │  generates world from seed · moves own player    │
     │  own line of sight and fog · drawers · HUDs      │
     └──────────────────────────────────────────────────┘
```

The server owns everything except each player's own position. Clients simulate their own movement locally, so walking feels instant even on poor Wi-Fi, and report it with `move` messages. Everything else (inventories, health, creatures, tiles, fuel, time) changes only on the server; clients request changes through **actions**.

Six ideas hold the design together:

- **Deterministic world.** Server and clients run the same world passes with the same seed, so the network carries only tile edits, never the map. World passes must use the `rng` they receive and the noise helpers in `shared/rng.js`; a single `Math.random()` call desynchronizes everyone.
- **Registries.** Teams add content by calling `registerTile`, `registerItem`, `registerSystem`, and so on from their own folder. Nobody edits a central list, so merge conflicts nearly vanish.
- **Entities as plain objects (ECS-lite).** An entity is `{ id, type, x, y, ...components }`, for example `{ id: 7, type: 'slime', x: 81.5, y: 90.2, hp: 3, speed: 1.6 }`. Systems are functions that run every tick over the entities they care about. Fields that start with `_` stay private to the side that set them and never travel over the network.
- **Shared fields as interfaces.** A few fields carry meaning across teams. On entities: `light` (radius in tiles) lights the night and defines what players can see, and `lightColor` tints its glow; `repels: true` keeps monsters out of 80% of that radius, and `scares: n` makes it hold only while at most n monsters are near; `hostile` and `threat` tell the director what counts as a monster and how much; `stunnedUntil` freezes a creature; `hp` makes an entity damageable; `interactive: true` makes right click send `interact` at it. On items, `gear` (or `equip`) counts toward the group's gear score, `damage` is melee damage while held, `tool` and `power` speed up mining, and `places`, `placesTile`, or `use: true` make right click use the item. On tiles, `structure: true` counts toward the settlement, `hardness` and `tool` set mining time, and `interact: true` works like `interactive`. On players, `hotbar` (nine item names) and `selected` say what is in hand: `hotbar[selected]`.
- **One damage pipeline.** All damage goes through `game.damage(target, amount, source)`, which first emits a `damage` event. Listeners can lower `hit.amount` or set `hit.cancelled`, which is how blocking and parrying work, and how armor, buffs, or friendly-fire rules would work.
- **Error isolation.** Every system, handler, drawer, and HUD runs inside a `try/catch`. A bug in one team's code logs an error at most every five seconds; the game keeps running.

## The game director

The director lives in `modules/creatures/director.js` and runs only at night. It keeps a **threat budget**: the total `threat` of live hostile creatures it allows at once (a slime costs 1).

```
budget = 2
       × players ^ 0.8                more people, more monsters, but sublinear
       × (1 + 0.35 × average gear)    item.gear, or 1 per item with `equip` (a shield)
       × (1 + 0.08 × settlement)      burning campfires + structure tiles / 10
       × (1 + 0.25 × (night − 1))     each night is harder than the last
       × ramp                         0.6 at nightfall, 1.3 at midnight, 0.6 at dawn
       capped at 40
```

At midnight of the first night, three unequipped players around one fire face a budget of about 7. Ten players, half of them with shields, around three fires and twenty wall tiles face about 27. By the fourth night a fully shielded, walled-in group of ten hits the cap of 40.

Each player also has an **intensity** between 0 and 1. It rises with damage taken and with monsters within three tiles, and decays by 0.08 per second. The group's intensity is the highest individual value. The director moves through three moods:

| Mood | Behavior | Leaves when |
|---|---|---|
| Build-up | Spawns a monster every 0.7 s near a random player while the live threat is under budget | group intensity reaches 0.7, or a horde arrives |
| Peak | Keeps topping up to the budget | after 15 s |
| Relax | Spawns nothing; players can regroup and feed fires | after 20 s, once intensity falls below 0.3 |

At midnight (at 35% and 75% of the night from the third night on), a **horde** of 80% of the budget spawns from one compass direction, aimed at the calmest player, and hunts from 25 tiles away. Every client gets a warning and a war horn. All numbers live in `TUNING` at the top of `director.js`, and F3 shows the live state, so the Creatures team can tune the curve while everyone plays.

## The contract

### Registry functions (`shared/registry.js`)

| Function | Call from | Purpose |
|---|---|---|
| `registerTile(name, { color, solid, opaque, structure, harvest, hardness, tool, interact })` | `shared.js` | New tile type. `solid` blocks movement, `opaque` blocks sight, `structure` counts toward the settlement, `harvest: { item, count, becomes }` makes it minable with the left button, `hardness` is the seconds that takes by hand (default 1), `tool` (`'axe'`, `'pickaxe'`) names the tool that mines it faster, `interact` makes right click send `interact` at it. |
| `registerItem(name, { gear, equip, damage, tool, power, places, placesTile, use, ... })` | `shared.js` | New item type. `gear` (or `equip`) adds to the gear score; `damage` is melee damage while held (default 1); `tool` and `power` divide the mining time of matching tiles; `places` (entity type) or `placesTile` (tile name) lets right click place it; `use: true` makes right click send `use` for your own handler. |
| `registerRecipe(name, { inputs, output, places })` | `shared.js` | Crafting recipe. `places` spawns an entity in front of the player. |
| `registerEntityType(type, defaults)` | `shared.js` | New entity type. Defaults must be plain data. Monsters need `hostile: true`, `hp`, and optionally `threat`. |
| `registerSpell(name, def)` | `shared.js` | New spell definition. |
| `registerWorldPass(name, fn(world, rng), { order })` | `shared.js` | World generation step. Terrain runs at order 0. |
| `registerKeyHint(key, label)` | `shared.js` | Adds a hint to the help line. |
| `registerSystem(name, fn(game, dt))` | `server.js` | Runs every server tick. |
| `onAction(name, fn(game, player, data))` | `server.js` | Handles `game.sendAction(name, data)` from a client. |
| `onEvent(name, fn(game, ...args))` | `server.js`, `client.js` | Listens on that side's event bus. |
| `registerClientSystem(name, fn(game, dt))` | `client.js` | Runs every frame in the browser. |
| `registerDrawer(type, 'tile:name', or 'item:name', fn)` | `client.js` | Draws an entity type, a tile type, or an item icon (hotbar, inventory, a player's hand). |
| `registerHud(name, fn(ctx, game, w, h))` | `client.js` | Draws in screen space, after the world and the fog. |
| `registerSetting(key, { label, options, default, names })` | `client.js` | Adds a row to the Esc settings panel, stored per browser; read it as `game.settings[key]`. |

### The `game` object

On the **server**, systems and handlers receive `game` with `world`, `entities`, `time`, `bus`, `director`, and these helpers: `spawn(type, props)`, `despawn(id)`, `players()`, `near(x, y, r, filter)`, `damage(target, amount, source)`, `knockback(entity, fromX, fromY, dist)`, `setTile(x, y, name)`, `broadcast(name, data)`, `sendTo(playerId, name, data)`, `teleport(player, x, y)`, `give(entity, item, n)`, `has(entity, item, n)`, and `timeOfDay()`.

On the **client**, `game` has `world`, `entities`, `me`, `myId`, `input`, `camera`, `vision`, and the helpers `sendAction(name, data)`, `notify(text, seconds, color)`, `targetTile(reach)`, `facingTile()`, `canSee(x, y)`, `screenToWorld(sx, sy)`, `worldToScreen(x, y)`, and `timeOfDay()`. Input uses key codes: `game.input.down('KeyW')` while held, `game.input.pressed('KeyE')` once per press, `game.input.clicked(0)` once per left click, `game.input.mouseDown(2)` while the right button is held, and `game.input.wheel()` for wheel steps this frame. It also has `theme` (colors) and `font(px, 'ui' | 'display')` for the Halloween look, `settings` (this viewer's Esc settings), `ui` (the name of an open panel such as `'inventory'`; world input pauses while it is set), and `selectedSlot` (the hotbar slot in hand, ahead of the server's `me.selected`).

`timeOfDay()` returns `{ phase, darkness, isNight, nightProgress, nightLength, day, clock }`.

### Events

| Event | Side | Arguments | Emitted by |
|---|---|---|---|
| `playerJoined`, `playerLeft` | server | player | core |
| `spawned`, `despawned` | server | entity | core |
| `dusk`, `dawn` | server | timeOfDay | core |
| `damage` | server | hit `{ target, amount, source, cancelled }` | core, before damage applies |
| `killed` | server | victim, killer | core |
| `hotSwapped` | server | none | core, after new server code loads |
| `net:dusk`, `net:dawn` | client | `{ day }` | core |
| `net:hit` | client | `{ id, x, y, amount }` | core |
| `net:hotswap` | client | `{ failed }` | core |
| `net:swing` | client | `{ id }` | player |
| `net:parry`, `net:block` | client | `{ id, x, y }` (parry also `target`) | player |
| `net:died` | client | `{}` (to the victim only) | player |
| `net:harvested` | client | `{ x, y, item, by }` (a mined tile broke) | survival |
| `net:placed` | client | `{ x, y, item, by }` | survival |
| `net:crafted` | client | `{ recipe, by }` | survival |
| `net:fed`, `net:fireOut` | client | `{ id, ... }` | survival |
| `net:horde` | client | `{ from, count, target }` | creatures (director) |
| `net:director` | client | director state, once per second | creatures (director) |
| `ready`, `disconnected` | client | none | core |
| `tileChanged` | client | x, y, id | core |
| `entityAppeared`, `entityGone` | client | entity | core |

Actions handled today: `attack` and `guard` (player); `mine {x, y}` or `mine {stop}`, `use {x, y}`, `interact {x, y}`, `craft {recipe}`, `select {slot}`, and `hotbar {slot, item}` (survival). Every handler of an action runs, so a handler for `use` or `interact` returns early when the held item or the target is not its own. When you add an event or action, tell the integration lead so it lands in this table.

## Teams

| # | Team | Folder | Owns | Goal by integration 1 (0:45) | Goal by freeze (1:35) | Stretch |
|---|---|---|---|---|---|---|
| 1 | World | `modules/world` | Terrain, biomes, villages, dungeons, resources | Villages: small houses built from wall tiles (`structure: true`), with paths between them | Caves or dungeons with ore tiles worth mining | New biomes (snow, desert), trees that regrow, berries to forage |
| 2 | Player | `modules/player` | Movement, combat, magic, health, death | Weapon feel: a health bar over damaged entities, invulnerability frames, a dodge roll | Two or three spells with mana, held in the hotbar and cast with right click, such as a firebolt projectile that carries `light` | Weapon types (items with `damage` and `gear`), experience and levels |
| 3 | Survival | `modules/survival` | Items, equipment, crafting, building, mining, hunger, fire | Doors (`placesTile`, opened and closed with right click); better tools (stone axe and pickaxe) | Hunger and food; craftable torches that burn out; a stone fire pit that burns longer | Chests, farming, tools that yield more |
| 4 | Creatures | `modules/creatures` | Monsters, animals, NPCs, quests, the director | A second monster with its own `threat` cost, for example one that ignores fire or snuffs out campfires | Tune the director with F3 while others play; villagers with procedural quests ("bring 5 wood") | A blood-moon raid every third night; a dungeon boss |
| 5 | Integration and art | core files and `modules/art` | Server, netcode, merging, sprites, sound | Clean merge with everyone on the shared server | A sprite and sound for every new tile and entity | A music loop, particles, screen shake, a minimap of explored tiles |

If fewer than ten people take part, staff teams in this order: World, Player, and Integration first, then Survival and Creatures. Art folds into Integration.

With eleven to thirteen people, extra people form trios, in this order: **Creatures** (monsters, or director tuning and villagers), **Survival** (building, or hunger and fire), **Player** (combat, or spells).

### Working as a trio

- The third person owns one helper file in the team folder, for example `modules/creatures/villagers.js`, `modules/survival/hunger.js`, or `modules/player/spells.js`, imported from `server.js` or `client.js`.
- Registrations (tiles, items, entity types, spells) stay in `shared.js`. The dev server hot-swaps helper files instead of restarting, so a tile registered in a helper would leave the server and clients out of step.
- The whole team shares one `shared.js`. Ship small and sync often (`/ship`, `/sync`) so edits to it rarely collide.

### Signup

| Team | Person A | Person B | Person C |
|---|---|---|---|
| 1 World | | | |
| 2 Player | | | |
| 3 Survival | | | |
| 4 Creatures | | | |
| 5 Integration and art | | | |

## Rules

1. **Edit only your own folder.** If you need a change in `shared/`, `server/`, or `client/`, ask the integration lead.
2. **Register content in `shared.js`.** Tiles, items, recipes, entity types, spells, world passes, and key hints go there, because both server and clients must load them in the same order.
3. **Decide gameplay on the server.** Clients send actions; they never change health, inventories, or tiles themselves.
4. **Hurt things only with `game.damage()`,** so blocking, parrying, and future armor keep working.
5. **Keep state on entities or on `game`, not in module-level variables.** Hot swaps reload module code and reset its variables; entities and `game.director`-style objects survive.
6. **Never call `Math.random()` in a world pass.** Use the `rng` argument.
7. **Keep entity defaults to plain data,** and prefix private fields with `_`. No `setInterval` or `setTimeout` in server code: use `registerSystem`, so hot swaps do not leave old timers running.
8. **Add no npm packages and no build step.**
9. **Talk to other teams through events and entity fields,** not imports.

## Development workflow

Use `npm run dev` for all development, both locally and on the shared server. It reacts to every saved change with the lightest update that is safe:

| What changed | What happens | Who notices |
|---|---|---|
| `modules/*/client.js`, `client/` | Browsers reload; the server keeps running | A one-second reload |
| `modules/*/server.js` | **Hot swap**: the new server code replaces the old in the running game | Nobody; a "Server code updated" notice appears |
| Other files in `modules/<team>/` (helpers) | Hot swap and browser reload | A one-second reload |
| `modules/*/shared.js`, `shared/`, `server/`, `manifest.js` | **Restart with state**: the server saves, restarts, and restores; browsers reconnect and reload | A one- to two-second reconnect |

A hot swap replaces systems, action handlers, and event listeners, while entities, tiles, players, and connections stay as they are. If the new code fails to load, the module's previous version keeps running and every player sees a red notice. Changes to `shared.js` need a restart because they define the **data model**: tiles, items, and entity types. A restart restores saved state by name: tile edits are stored by tile name, and entities saved before a new field existed get that field's default value. When a change breaks saved state anyway (a renamed type, a field whose meaning changed), type `f` and Enter in the dev terminal to start a fresh world. Other commands: `h` hot-swaps on demand, `r` restarts keeping state.

Reloading the page or losing Wi-Fi also keeps your player: the name in the URL (`?name=Ada`) is your identity, so pick a unique one.

## Git workflow

Everyone clones the repo and commits directly to `main`. Pull requests would cost too much time, and folder ownership already prevents most conflicts.

- Commit small and often, roughly every 10 to 15 minutes, whenever something works.
- In Claude Code, type `/ship` to commit your team folder, pull everyone else's work, and push, and `/sync` to pull without pushing. `CLAUDE.md` spells out the steps, so other agents follow the same routine when you say "ship" or "sync".
- By hand: `git add modules/<team>/`, `git commit`, `git pull --rebase --autostash`, `git push`.
- Each team runs its own local `npm run dev` while developing: two browser tabs give you two players.
- The integration lead runs the **shared server** with `npm run dev` from their own checkout. The server sends its own copy of the game files to every browser, so all players run the same version. A `git pull` on that checkout deploys itself, mostly by hot swap.
- If `main` breaks and the fix is not obvious within five minutes, `git revert` the commit and fix it locally.

## Running the game

```
npm install
npm run dev                          # http://localhost:8080/?name=You, live code updates
npm start                            # plain server, fresh world each start
npm run dev:night                    # start at dusk with three-minute days
node server/dev.js START_PHASE=0.65  # start at dusk (0 sunrise, 0.6 dusk, 0.7 night, 0.95 dawn)
node server/dev.js DAY_LENGTH=180    # three-minute days for testing night features
node server/dev.js SEED=1234         # the same island every time
node server/dev.js PORT=9000
npm test                             # headless tests: core loop, combat, fire, director, live updates
```

Settings go after `node server/dev.js` as `NAME=value` arguments, so the same commands work in PowerShell, cmd, and bash. Ctrl+C and `npm run dev` again also gives a fresh world: the first start never restores saved state.

The server prints its network address at startup. Eduroam often blocks connections between laptops, so test the shared server before the session. Fallbacks: a phone hotspot or travel router, or a small cloud or department VM. The first time the shared server starts, Windows and macOS ask whether node may accept incoming connections: allow it on private networks. Run the shared server from a clone outside Dropbox or other synced folders, because the autosaved `.nightfall-state.json` and git's own files change constantly and cause sync conflicts and file locks.

## Day length

Minecraft's twenty-minute day with a night of about seven minutes suits players who stay for hours. Tonight's constraint is different: two hours of building and one ten-minute final session. The default eight-minute day gives two minutes of night plus fifty seconds of dusk, so the director's build-up, midnight horde, and relax phases each last long enough to feel. Developers testing night features should run `DAY_LENGTH=180` (45 seconds of night) or start at dusk with `START_PHASE`. For the final session, `node server/dev.js DAY_LENGTH=600 START_PHASE=0.4` gives about four minutes to prepare, a minute of dusk, and two and a half minutes of night with a horde in the middle.

## Schedule

| Time | Activity |
|---|---|
| 0:00 to 0:10 | Demo the skeleton on the projector. Teams confirm their goal for integration 1. |
| 0:10 to 0:45 | Sprint 1: each team builds its first goal against the existing slice. |
| 0:45 to 0:55 | Integration 1: the lead pulls; the server updates itself; everyone plays for five minutes; each team names one bug and one hook it needs from another team. |
| 0:55 to 1:35 | Sprint 2: cross-team features (enemies drop items, villagers request crafted goods, spells light the dark), director tuning. |
| 1:35 to 1:50 | Feature freeze: bug fixes and polish only. |
| 1:50 to 2:00 | Final session: everyone survives one night together on the projector. |

## Vibe-coding tips

- Start every agent session with: "Read CLAUDE.md and DESIGN.md, then work only in `modules/<your team>/`."
- Ask for one small, testable change at a time, and test it in two tabs before asking for the next.
- Ship each working state with `/ship`. Throw away failed attempts quickly with `git restore modules/<team>/` rather than prompting the agent into deeper holes.
- If you stay stuck for more than ten minutes, swap drivers or ask the integration lead.

## Open questions

- The final name.
- Do we fix the seed so the demo island is known in advance?
- Do we want a goal, such as a score for nights survived or a boss to defeat on the last night?
- Should explored tiles be shared between players (a team map) or stay personal as now?
