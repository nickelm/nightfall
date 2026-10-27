import { onAction, registerSystem } from '../../shared/registry.js';

// The clicked tile is the entrance; the 5x4 cabin extends north from it.
onAction('use', (game, player, { x, y }) => {
  if (player.hotbar?.[player.selected] !== 'cabin' || !game.has(player, 'cabin')) return;
  if (!Number.isInteger(x) || !Number.isInteger(y) || Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y) > 2.5) return;
  const ground = new Set(['grass', 'gravel', 'sand', 'snow']);
  const fail = () => game.sendTo(player.id, 'cabinMessage', { text: 'Need clear 5 x 4 ground north of the entrance and an open approach.' });
  for (let ty = y - 3; ty <= y; ty++) for (let tx = x - 2; tx <= x + 2; tx++) {
    const tile = game.world.tile(tx, ty);
    if (!tile || !ground.has(tile.name) || tile.structure || tile.hurts) return fail();
  }
  const approach = game.world.tile(x, y + 1);
  if (!approach || approach.solid || approach.hurts) return fail();
  for (const e of game.entities.values()) {
    if (!(e.type === 'player' || e.hp > 0 || e.animal || e.interactive || e.type === 'cabin')) continue;
    const r = 0.3 * (e.size || 1);
    if (e.x + r >= x - 2 && e.x - r < x + 3 && e.y + r >= y - 3 && e.y - r < y + 1) return fail();
  }
  for (let ty = y - 3; ty <= y; ty++) for (let tx = x - 2; tx <= x + 2; tx++) {
    const edge = ty === y - 3 || ty === y || tx === x - 2 || tx === x + 2;
    game.setTile(tx, ty, tx === x && ty === y ? 'door-closed' : edge ? 'wood-wall' : 'cabin-floor');
  }
  game.give(player, 'cabin', -1);
  game.spawn('cabin', { x: x + 0.5, y: y - 1.5, owner: player.id });
  game.sendTo(player.id, 'cabinMessage', { text: 'Cabin built. Right-click the door to enter.' });
});

// A dismantled cabin no longer has an intact roof, light or protection.
registerSystem('cabin-integrity', game => {
  for (const e of game.entities.values()) {
    if (e.type !== 'cabin') continue;
    const x = Math.floor(e.x), y = Math.floor(e.y) + 2;
    let intact = true;
    for (let ty = y - 3; ty <= y; ty++) for (let tx = x - 2; tx <= x + 2; tx++) {
      if (!(ty === y - 3 || ty === y || tx === x - 2 || tx === x + 2)) continue;
      const name = game.world.tile(tx, ty)?.name;
      if (tx === x && ty === y ? name !== 'door-open' && name !== 'door-closed' : name !== 'wood-wall') intact = false;
    }
    if (!intact) game.despawn(e.id);
  }
});
