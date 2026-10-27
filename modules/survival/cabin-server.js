import { onAction, registerSystem } from '../../shared/registry.js';

// The clicked tile is the entrance; each building extends north from it.
const buildings = {
  cabin: { width: 5, height: 4, wall: 'wood-wall', name: 'Cabin' },
  house: { width: 7, height: 6, wall: 'stone-block', name: 'House' },
  hanok: { width: 9, height: 6, wall: 'hanok-wall', floor: 'hanok-floor', name: 'Hanok' },
};

onAction('use', (game, player, { x, y }) => {
  const kind = player.hotbar?.[player.selected], spec = buildings[kind];
  if (!spec || !game.has(player, kind)) return;
  if (!Number.isInteger(x) || !Number.isInteger(y) || Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y) > 2.5) return;
  const half = (spec.width - 1) / 2, top = y - spec.height + 1;
  const ground = new Set(['grass', 'gravel', 'sand', 'snow']);
  const fail = () => game.sendTo(player.id, 'cabinMessage', { text: `Need clear ${spec.width} x ${spec.height} ground north of the entrance and an open approach.` });
  for (let ty = top; ty <= y; ty++) for (let tx = x - half; tx <= x + half; tx++) {
    const tile = game.world.tile(tx, ty);
    if (!tile || !ground.has(tile.name) || tile.structure || tile.hurts) return fail();
  }
  const approach = game.world.tile(x, y + 1);
  if (!approach || approach.solid || approach.hurts) return fail();
  for (const e of game.entities.values()) {
    if (!(e.type === 'player' || e.hp > 0 || e.animal || e.interactive || buildings[e.type])) continue;
    const r = 0.3 * (e.size || 1);
    if (e.x + r >= x - half && e.x - r < x + half + 1 && e.y + r >= top && e.y - r < y + 1) return fail();
  }
  for (let ty = top; ty <= y; ty++) for (let tx = x - half; tx <= x + half; tx++) {
    const edge = ty === top || ty === y || tx === x - half || tx === x + half;
    game.setTile(tx, ty, tx === x && ty === y ? 'door-closed' : edge ? spec.wall : spec.floor || 'cabin-floor');
  }
  game.give(player, kind, -1);
  game.spawn(kind, { x: x + 0.5, y: y - (spec.height - 1) / 2, owner: player.id });
  game.sendTo(player.id, 'cabinMessage', { text: `${spec.name} built. Right-click the door to enter.` });
});

// A dismantled building no longer has an intact roof, light or protection.
registerSystem('building-integrity', game => {
  for (const e of game.entities.values()) {
    const spec = buildings[e.type];
    if (!spec) continue;
    const x = Math.floor(e.x), y = Math.floor(e.y) + spec.height / 2;
    const half = (spec.width - 1) / 2, top = y - spec.height + 1;
    let intact = true;
    for (let ty = top; ty <= y; ty++) for (let tx = x - half; tx <= x + half; tx++) {
      if (!(ty === top || ty === y || tx === x - half || tx === x + half)) continue;
      const name = game.world.tile(tx, ty)?.name;
      if (tx === x && ty === y ? name !== 'door-open' && name !== 'door-closed' : name !== spec.wall) intact = false;
    }
    if (!intact) game.despawn(e.id);
  }
});
