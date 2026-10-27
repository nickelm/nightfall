import { registries } from '../../shared/registry.js';
import { safely } from '../../shared/safe.js';
import { buildings, buildingPlan } from './building-plan.js';

export function drawBuildingPreview(ctx, game, kind, target, size) {
  if (!buildings[kind]) return false;
  const plan = buildingPlan(game.world, game.entities.values(), game.me, kind, target.x, target.y);
  ctx.save();
  for (const cell of plan.cells) {
    const p = game.worldToScreen(cell.x, cell.y), tile = registries.tileByName.get(cell.tile);
    const drawer = registries.drawers.get(`tile:${cell.tile}`);
    ctx.globalAlpha = .45;
    if (drawer) safely(`preview:${cell.tile}`, drawer, ctx, tile, p.x, p.y, size, cell.x, cell.y, game);
    else { ctx.fillStyle = tile.color; ctx.fillRect(p.x, p.y, size, size); }
    ctx.globalAlpha = cell.blocked ? .45 : .18;
    ctx.fillStyle = cell.blocked || !plan.valid ? '#ef6572' : '#67edb2';
    ctx.fillRect(p.x, p.y, size, size);
    ctx.globalAlpha = .9; ctx.lineWidth = cell.blocked ? 2.5 : 1;
    ctx.strokeStyle = cell.blocked || !plan.valid ? '#ef6572' : '#67edb2';
    ctx.strokeRect(p.x + 1, p.y + 1, size - 2, size - 2);
  }
  const door = game.worldToScreen(target.x, target.y), approach = game.worldToScreen(target.x, target.y + 1);
  ctx.globalAlpha = 1; ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3;
  ctx.strokeRect(door.x + 3, door.y + 3, size - 6, size - 6);
  ctx.strokeStyle = plan.approachBlocked ? '#ef6572' : '#ffe08a'; ctx.lineWidth = 2;
  ctx.strokeRect(approach.x + 5, approach.y + 5, size - 10, size - 10);
  const label = `${plan.spec.name} ${plan.spec.width} x ${plan.spec.height} - ${plan.valid ? 'RMB: build' : !plan.inReach ? 'too far' : 'blocked'}`;
  ctx.font = game.font(14); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.lineWidth = 4; ctx.strokeStyle = '#171020';
  ctx.strokeText(label, door.x + size / 2, approach.y + size + 4);
  ctx.fillStyle = plan.valid ? '#67edb2' : '#ef6572'; ctx.fillText(label, door.x + size / 2, approach.y + size + 4);
  ctx.restore(); return true;
}
