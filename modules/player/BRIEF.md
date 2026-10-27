# Team 2: Player

**Folder:** `modules/player/` · **You own:** movement, combat, magic, health, death

## Mission

You decide how it feels to be a person on this island: to move, to swing, to block a bite at the last moment, and to throw fire into the dark. Combat should be readable and fair. Every monster attack has a visible wind-up, so a skilled player can parry it, and players should feel that skill.

## What already exists

Craft a boat from five wood. Hold it and right-click water within reach to board;
WASD sails across water and land while walls still block movement. Reach open land
to disembark and recover the boat automatically. Reconnecting at sea preserves it.

Craft a portal from five diamonds and right-click to place it on clear ground.
Right-click a placed portal to enter. While inside, press W/A/S/D to travel to
the nearest portal in that screen direction within 80 tiles; Space exits onto a
safe adjacent tile. Portal mode and location survive reconnecting.

- `shared.js`: the `player` entity type (`hp: 10`, `light: 2.5` for the torch, `speed: 5`) and the key hints.
- `client.js`: WASD movement with wall sliding, relative to facing by default (W walks toward the cursor; the Esc settings switch to screen-relative), the character turning toward the mouse, and all mouse input. Left button or Space: mine the targeted tile (`mine` action), or swing when there is nothing to mine. Right button: `interact` on interactive things, else `use` for a held item with `places`, `placesTile`, or `use`, else guard. Shift always guards. An aim wedge shows your reach. Clients own their own position, so movement is instant.
- `server.js`: the melee swing (a 0.9-tile arc in front, 0.35 s cooldown, knockback, damage from the held item's `damage`, default 1); a starter sword (`damage: 2`) for every new player; guard handling (with a shield, block hits from the front; without one, a 0.25 s parry window that cancels the hit, knocks the attacker back, and stuns it for 1.2 s); and respawn at the island center.
- All damage goes through `game.damage(target, amount, source)`, which emits a `damage` event first. Your guard logic is a listener on that event.

## Goals, in priority order

1. **Combat feel (by 0:45).**
   - Health bars over damaged entities: a `registerHud` in `client.js` that draws a small bar above every visible entity with `hp < maxHp` (use `game.worldToScreen()` and `game.canSee()`).
   - Invulnerability frames: half a second after a player takes a hit, further hits are cancelled. Do it in your `damage` listener, after the guard checks.
   - A dodge roll on **Q**: a short, fast dash in the movement direction on the client, plus an action that grants 0.3 s of invulnerability on the server, with a one-second cooldown.
2. **Magic with mana (by 1:35).** Add `mana` and `maxMana` to the player defaults (players already in the game get them automatically on the restart). Add a `firebolt` entity type that flies in the aim direction, carries `light: 2` (so it lights up the dark and reveals what it passes), hurts the first hostile it touches through `game.damage()`, and disappears on hitting a solid tile. Make each spell an item with `use: true` (for example a `firebolt-wand` crafted from wood and something rare): it sits in the hotbar, and right click with it in hand sends `use`, which your `onAction('use', ...)` turns into a cast (check `player.hotbar[player.selected]` first). **F** can cast the held spell too. A second spell could heal, or plant a short-lived light that also `repels`. Regenerate mana slowly and show a mana bar.
3. **Stretch.** Weapon types as items with `damage` and a `gear` value (a spear with longer reach, a heavy club that knocks back further); experience from kills (`onEvent('killed', ...)`) and levels that raise `maxHp`.

## What other teams expect from you

- **Everyone** relies on `game.damage()` and the `damage` event. Keep the order inside your listener: guard checks first, invulnerability last.
- **Creatures** relies on `stunnedUntil` freezing their monsters and on `windup` being the parry cue.
- **Art** draws the player. Draw a placeholder for your new entities (the firebolt) in your own `client.js`; Art may override it later.
- Items you add with a `gear` value make the director send more monsters. That is intended.

## Rules that matter most for you

- Only `x`, `y`, and `dir` of the player may change on the client. Mana, health, cooldowns, and spell effects change on the server.
- Keys: you have Q and F in addition to the existing controls. 1–9 and the wheel are the hotbar, E and Tab the inventory, Esc the settings; C, V, B, N, R, M, F3, and F4 belong to other teams. Skip your input while `game.ui` is set (a panel is open).
- Keep cooldowns and timers as `_private` fields on the player entity, not in module variables: saving `server.js` hot-swaps it and resets module variables.

## Testing

Run `npm run dev:night` (dusk start, three-minute days) and fight slimes in two tabs. Check that a parry timed on the orange wind-up stuns the slime, and that health bars appear only for entities you can see.

## Starter prompt for your agent

> Read CLAUDE.md, DESIGN.md, and modules/player/BRIEF.md. We are the Player team and work only in modules/player/. First, add health bars above damaged visible entities as a HUD in client.js. Then add half a second of invulnerability after a player is hit, in the existing damage listener in server.js, after the guard checks.
