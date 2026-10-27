# Team 4: Creatures

**Folder:** `modules/creatures/` · **You own:** monsters, animals, villagers and quests, the game director

## Mission

You decide what lives on the island and how frightening each night becomes. The director is the heart of the game's pacing: it should make a night with three players and a night with ten both feel tense, and it should punish a group that grows comfortable. Your monsters should each ask a different question of the players: slimes test whether they keep their fires burning; your next monster should test something else.

## What already exists

- `shared.js`: the `slime` entity type (`hp: 3`, `hostile: true`, `threat: 1`, `aggro: 8`) and the F3 key hint.
- `server.js`: `spawnSlime` (spawns out of sight and outside firelight), the slime AI (chases the nearest player within `aggro` tiles, never steps into burning firelight, flees it if caught inside, keeps a little distance from other slimes, telegraphs each bite with a 0.4 s `windup`, respects `stunnedUntil`), slimes melting at dawn, and the director hookup.
- `director.js`: the game director. At night it keeps a threat budget that scales with players, gear, settlement, and night number, cycles through build-up, peak, and relax, and sends hordes (DESIGN.md has the formula). All tuning numbers live in `TUNING`. Its state lives on `game.director`, so it survives hot swaps.
- `client.js`: horde warnings and the F3 debug panel.

Powered redstone lamps prevent director spawns within their full light radius.
Turning a lamp off removes that protection. Lamps do not repel existing monsters,
which can still walk into the lit area.

All hostile creatures take one damage per second while exposed to an entity's
light (including player torches, lamps, fires, and lava glow). Multiple lights do
not stack; opaque walls block the effect. Ordinary hit, kill, and loot rules apply.

## Raising animals

Pigs, sheep, chickens, and cows appear in the field. Right-click one to catch it as a
carried item. Craft an `animal-pen` from five wood and place it with right-click; each
pen holds one animal. Hold the caught animal and right-click the pen to put it inside.

Hold a pumpkin and right-click an occupied pen to feed it for 60 seconds. While fed,
the animal grows for 30 seconds and then produces one item every 20 seconds, up to
five stored items. Pigs produce truffles, sheep produce wool, chickens produce eggs,
and cows produce milk. These products are currently collectible items.

Right-click with an empty hotbar slot to collect the products; if none are waiting,
the same action retrieves the animal. Its growth, feed, and production progress are
preserved when it is moved. Right-click an empty tile while holding a caught animal to
release it back into the field. An empty pen can also be picked up with an empty hand.

## Goals, in priority order

1. **A second monster (by 0:45).** Give it its own `threat` cost and a spawn function, and let the director choose between monster types with a weighted table that changes with the night number. A good candidate: a **snuffer** (threat 3) that ignores firelight, walks to the nearest burning campfire, and drains its fuel. It punishes turtling and forces someone to step out and fight. Draw a placeholder in your `client.js`.
2. **Animals and tuning (by 1:35).**
   - Daytime animals (a deer or boar) that wander, flee from players, and drop `meat` when killed (`onEvent('killed', ...)`). Register the `meat` item with a `food` value; Survival makes it edible and cookable. Animals are not `hostile`, so the director ignores them.
   - **Tune the director while others play.** Keep F3 open during the integration sessions and adjust `TUNING` in `director.js`: saving it hot-swaps the change into the running game. Aim for a midnight that feels dangerous but survivable.
3. **Stretch.** Villagers in World's villages (`game.world.features`, type `village`) who hand out procedural quests when a player right-clicks them ("bring 5 pumpkins", reward: a shield). Give villagers `interactive: true` so right click sends `interact`, and add your own `interact` handler that ignores targets that are not villagers. A blood-moon raid every third night (bigger hordes; ask Art for a red tint). A dungeon boss at the `dungeon` feature.

## What other teams expect from you

- **Survival** turns your `meat` into food. Agree on the name early.
- **World** records villages, caves, and the dungeon in `game.world.features`; read them, do not hard-code positions.
- **Player** relies on monsters honoring `stunnedUntil` and showing `windup` before every attack. Keep both for every new monster.
- All your damage must go through `game.damage(target, amount, source)`, with the monster as the source, so blocking and parrying work.
- **Art** draws your monsters; tell them the type names as you register them.

## Rules that matter most for you

- Spawn hostile monsters only through the director, so the budget stays honest.
- Keep all AI state on the entity as `_private` fields, and director state on `game.director`. Never use `setInterval`.
- Monster `light` would light the dark and reveal them; leave it off unless that is the point.

## Testing

Run `npm run dev:night` (dusk start, three-minute days), press F3, and watch threat against budget through a night. Join from a second tab and check that the budget rises. Give yourself a shield to see the gear factor move.

## Starter prompt for your agent

> Read CLAUDE.md, DESIGN.md, and modules/creatures/BRIEF.md. We are the Creatures team and work only in modules/creatures/. First, add a snuffer monster as the brief describes, with its own threat cost, spawn function, and AI that walks to the nearest burning campfire and drains its fuel. Then let the director pick between slimes and snuffers with a weighted table that favors snuffers on later nights.
