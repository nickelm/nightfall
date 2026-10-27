# Team 3: Survival

**Folder:** `modules/survival/` · **You own:** items, equipment, crafting, building, hunger, fire

## Mission

You decide what players make and what they need. The central tension of the game is yours: light keeps you safe, fire eats wood, and wood lies out in the dark. Building turns a campfire into a camp, and hunger keeps people from turtling in that camp forever.

## What already exists

Cabins cost 20 wood and 5 stone. Select the crafted cabin and right-click the
entrance tile: the clear 5x4 footprint extends north, with an open approach to
the south. The door opens normally; the roof lifts while the local player is
inside. A cabin emits light (radius 5) and prevents monster spawning within 10
tiles, including raids. Breaking any wall or the door removes the roof, light,
and protection; the remaining walls and floor stay in the world.

Iron, gold and diamond axes require 2 wood and 3 of their matching mineral;
their mining powers are 8, 12 and 20. Matching swords require 1 wood and 2
minerals and deal 3, 4 and 5 damage respectively. The starter sword deals 2.

Crafting sorts recipes that are affordable first. Within each group, higher
equipment tiers come first, then damage and tool power; ties retain their original
order. The list updates as inventory changes and remains scrollable.

- `shared.js`: items `wood` and `stone` (right click places them as `wood-wall` and `stone-block` through `placesTile`), `pumpkin`, `shield` (`equip: 'offhand'`), the tools `axe` and `pickaxe` (`tool`, `power: 4`), and the placeable `campfire` and `jack-o-lantern` (`places`). Recipes: campfire (5 wood), jack-o-lantern (1 pumpkin, 1 wood), axe (3 wood), pickaxe (4 wood), shield (3 wood, 2 stone). Entity types `campfire` (`fuel: 45`, `maxFuel: 90`, `light: 6`, `repels: true`, `interactive: true`) and `jack-o-lantern` (`light: 3.5`, `scares: 2`).
- `server.js`: the `mine` action and `mining` system (time = tile `hardness`, divided by the tool's `power` when the tool matches); the `use` action (place the held item if the tile is free); `interact` (right click on a campfire feeds it wood, +20 s of fuel); `craft`; the hotbar (`select` and `hotbar` actions, and a system that fills free slots with new items); the `fire` system; and `lantern-courage`, which turns a jack-o-lantern's `repels` off while more than two monsters are near.
- `client.js`: 1–9 and the wheel select a hotbar slot, E or Tab opens the inventory and crafting screen, C and V quick-craft; the hotbar, hearts, the target outline, and a ghost where a held block would go.
- Inventories are `{ itemName: count }` on the entity. Change them only with `game.give(entity, item, n)` and check them with `game.has(entity, item, n)`.

## Goals, in priority order

1. **Doors and better tools (by 0:45).** Walls already work (right click with wood or stone). World registers `door-closed` and `door-open`; add a `door` item with `placesTile: 'door-closed'` and a recipe (2 wood), and have World flag both door tiles `interact: true` so right click on them sends `interact`. In your `interact` handler, swap `door-closed` and `door-open` with `game.setTile()` (return early for other tiles). Then stone tools: `stone-axe` and `stone-pickaxe` with a higher `power` (8) and a `gear` value, crafted from wood and stone. Slimes respect walls and closed doors automatically because they use `world.blocked()`, and every wall counts toward the director's settlement score.
2. **Hunger and fire upgrades (by 1:35).**
   - Add `hunger` (start 100) to the player defaults and a system that lowers it slowly (empty after about one full day). At zero, hurt the player with `game.damage(player, 1, null)` every few seconds. Show a hunger bar.
   - Eating: give food items `use: true` and a `food` field (how much hunger they restore), and handle `use` when the held item has `food`; **R** can eat the best food in the inventory too. `berry` comes from World, `meat` from Creatures, and pumpkins are food as well. Cooking: right click a burning campfire with `meat` in hand (extend your `interact` handler) to get `cooked-meat`, which restores more.
   - A `stone fire pit` recipe that places a fire with a higher `maxFuel`. Generalize the `fire` system to every entity with a `fuel` field, so new fire types work without copying code.
   - Craftable lanterns: an equipped `lantern` raises the player's `light` from 2.5 to 4.
3. **Stretch.** Chests (an `interactive` entity with its own inventory, shown as a panel with `game.ui = 'chest'`); farming (plant pumpkin seeds); tools that yield more (`harvest.count`).

## What other teams expect from you

- **World** registers the building tiles and `berry`; **Creatures** registers `meat`. You give these items their meaning.
- You define what item fields mean: `food` (hunger restored) and `gear` (director gear score). Add both to the item table in DESIGN.md through the integration lead.
- **Creatures** may also handle `interact` (to talk to villagers), and **Player** handles `use` for spells. Every handler runs, so return early when the target or the held item is not yours.
- **Art** draws your entities and items. Draw placeholders in your `client.js` until they do.

## Rules that matter most for you

- Recipes, items, and entity types live in `shared.js`; changing it restarts the server (state is kept). Handlers and systems live in `server.js`, which hot-swaps without a restart.
- Keys: you have B, N, and R in addition to E, Tab, C, V, 1–9, and the wheel. Skip input while another panel has `game.ui` set.
- Keep per-player timers (hunger ticks, cooldowns) as `_private` fields on the player.

## Testing

Run `npm run dev:night` (dusk start, three-minute days), build a ring of walls around a campfire before night falls, and watch the slimes fail to get in. Open F3 to see the settlement score rise with every wall.

## Starter prompt for your agent

> Read CLAUDE.md, DESIGN.md, and modules/survival/BRIEF.md. We are the Survival team and work only in modules/survival/. First, add a door item with placesTile: 'door-closed' and a recipe, and let right click on a door (an interact action on a tile flagged interact: true) open and close it. Then add a stone axe and a stone pickaxe with a higher power.
