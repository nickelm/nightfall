import { onAction, registerSystem } from '../../shared/registry.js';

import { buildings, buildingPlan } from './building-plan.js';
import './building-migration.js';

onAction('use', (game, player, { x, y }) => {
  const kind = player.hotbar?.[player.selected], spec = buildings[kind];
  if (!spec || !game.has(player, kind)) return;
  if (!Number.isInteger(x) || !Number.isInteger(y) || Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y) > 2.5) return;
  const plan = buildingPlan(game.world, game.entities.values(), player, kind, x, y);
  if (!plan.valid) {
    game.sendTo(player.id, 'cabinMessage', { text: `Need clear ${spec.width} x ${spec.height} ground north of the entrance and an open approach.` });
    return;
  }
  for (const cell of plan.cells) game.setTile(cell.x, cell.y, cell.tile);
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
