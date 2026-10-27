# Team 1: World

**Folder:** `modules/world/` · **You own:** terrain, biomes, villages, caves and dungeons, resources

## Mission

You decide what players find when they explore. Your world passes run on the server and on every client with the same seed, so the island comes out identical everywhere and only tile changes travel over the network. A good island gives people reasons to leave the campfire: a village on the far shore, a cave full of ore, berries at the edge of the forest.

## What already exists

- `shared.js` registers the terrain tiles (`water`, `sand`, `grass`, `tree`, `stone`, `gravel`), a `pumpkin` tile, ores, doors, and the blocks players place with right click (`wood-wall`, `stone-block`). The `terrain` pass (order 0) builds an island from elevation and moisture noise, `ores` (order 100) grows iron, gold, and diamond veins inside rock, and `pumpkins` (order 150) scatters pumpkin patches on open grass. Ore never replaces grass or forest.
- Trees, stone, and pumpkins are `solid` (block movement); trees and stone are also `opaque` (block line of sight). All are mined by holding the left button. A tile's `hardness` is the seconds that takes by hand (tree 1.8, stone 5, pumpkin 0.6), and its `tool` (`'axe'` or `'pickaxe'`) names the tool that mines it four times faster.
- Players spawn at the walkable tile nearest the island center.
- Hazards and glass: `glass` (solid but not opaque, so sight and light pass), `thorns` (walkable spike pit), and `lava` (walkable, glows at night). A tile flag `hurts: { damage, every }` makes `hazards-server.js` call `game.damage(e, damage, null)` every `every` seconds on anything with `hp` standing on it (thorns 1 per 0.8 s, lava 2 per 0.5 s). The `lava` pass (order 120, after the ores) turns plain stone in mountain cores into lava pools, and the `thorns` pass (order 160) puts brambles along forest edges. Invisible `lava-glow` entities light the pools. Sand is minable (gives `sand`); recipes: `glass` from 2 sand, `thorns` from 2 wood and 1 stone. Both are placed with right click (`placesTile`).
- `server.js` loads the redstone circuit and hazard systems; `client.js` loads the world-resource, circuit, and hazard drawings.

## Redstone lights

Mine redstone in rock to craft wire (one redstone makes four) and lamps (two
redstone and two stone). Right-click to place wire or a lamp on grass, sand, or
gravel. A newly placed lamp is on and supplies its own power; right-click it to
switch its power supply on or off. It powers adjacent wire, which conducts in the
four cardinal directions. A switched-off lamp lights up when fed by another active
lamp or an older power crystal, so all connected sources must be off to darken it.
Lamps prevent monster spawning within their light, but do not repel monsters.
Hold a pickaxe and right-click a lamp or older power crystal to pick it up; mine
wire to retrieve it and restore its ground. Existing crystal ores and sources are
preserved for compatibility with saved worlds; crystals are not needed for lamps.

## Lava and obsidian

Solid lava veins and hazardous lava pools generate in rocky terrain, without
replacing existing ores. Pools damage players and monsters; veins are solid. Mine
either kind with a diamond or obsidian pickaxe;
one lava and one diamond craft one obsidian. An obsidian pickaxe or axe requires
three obsidian and two wood and has mining power 40. An obsidian sword requires
two obsidian and one wood and deals 10 damage. The pickaxe can also mine lava.

## Goals, in priority order

1. **Building tiles and villages (by 0:45).** Register `wall` (solid, opaque, `structure: true`, harvest gives `stone`, becomes `floor`), `door-closed` (solid, opaque, `structure: true`), `door-open` (`structure: true`), and `floor` (walkable). Survival depends on these names, so register them first and commit early. Then add a `villages` pass (order 200) that places two to four villages on open grass away from the spawn point: small houses of about 5 by 4 tiles with walls, a floor, and a door gap, joined by gravel paths. Push each village onto `world.features` as `{ type: 'village', x, y, w, h }`.
2. **Caves and ore (by 1:35).** Carve tunnels into stone areas (a few steps of cellular automata with the `rng` argument work well), and scatter ore tiles worth mining inside them, for example `iron-ore` (harvest gives `iron`) and `crystal`. Give each ore a `hardness` (8 to 12 seconds by hand) and `tool: 'pickaxe'`, so a pickaxe pays off. Register the ore items too. Record each cave in `world.features` as `{ type: 'cave', ... }`, and mark one large cave as `type: 'dungeon'` for the Creatures team's boss.
3. **Stretch.** It is Halloween: a graveyard pass (gravestone tiles, a dead-tree grove, gravel paths) near a village makes a good destination at night. A `berry-bush` tile (harvest gives `berry`, becomes `grass`) at forest edges; register the `berry` item with `food: 20`. Biomes from a temperature noise field (snow in the north, desert in the south). Trees that regrow: a `server.js` system that occasionally turns a harvested `grass` tile back into `tree` with `game.setTile()`, away from players.

## What other teams expect from you

- **Survival** places `wall`, `door-closed`, `door-open`, and `floor` by name. Do not rename them.
- **Creatures** reads `game.world.features` to place villagers and the dungeon boss.
- **Survival** turns `berry` into food.
- **Survival** places `wood-wall` and `stone-block` (the `placesTile` of wood and stone). Do not rename them.
- **Art** will draw your new tiles; tell them the names as soon as you register them. Until then, tiles show their `color`. Pick colors that fit the Halloween palette in `client/core/theme.js`.

## Rules that matter most for you

- Use only the `rng` argument and `fbm`, `valueNoise`, and `hash2` from `shared/rng.js`. One `Math.random()` gives every player a different island.
- Register tiles unconditionally at the top level of `shared.js`.
- Keep the area around the island center walkable: players spawn there.
- Keep passes fast. Every client runs them on joining; aim for well under 200 ms.
- Changing `shared.js` restarts the server and regenerates the island from the same seed, with everyone's tile edits reapplied on top. That is how you see your changes. Type `f` + Enter in the dev terminal for a completely fresh world.

## Testing

Run `node server/dev.js SEED=1234` (a fixed seed) and open two tabs: both must show the same villages in the same places. Walk to a village and through its door.

## Starter prompt for your agent

> Read CLAUDE.md, DESIGN.md, and modules/world/BRIEF.md. We are the World team and work only in modules/world/. First, register the building tiles wall, door-closed, door-open, and floor exactly as the brief describes. Then add a deterministic `villages` world pass (order 200) that places two to four small villages on open grass away from the island center and records each in world.features.
