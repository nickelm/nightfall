// One footprint and placement check shared by construction and its preview.
export const buildings = {
  cabin: { width: 5, height: 4, wall: 'wood-wall', name: 'Cabin' },
  house: { width: 7, height: 6, wall: 'stone-block', name: 'House' },
  hanok: { width: 9, height: 6, wall: 'hanok-wall', floor: 'hanok-floor', name: 'Hanok' },
};
const ground = new Set(['grass', 'gravel', 'sand', 'snow']);

export function buildingPlan(world, entities, player, kind, x, y) {
  const spec = buildings[kind];
  if (!spec || !Number.isInteger(x) || !Number.isInteger(y)) return { valid: false, cells: [] };
  const half = (spec.width - 1) / 2, left = x - half, top = y - spec.height + 1;
  const cells = [];
  for (let ty = top; ty <= y; ty++) for (let tx = left; tx <= x + half; tx++) {
    const tile = world.tile(tx, ty), edge = ty === top || ty === y || tx === left || tx === x + half;
    cells.push({ x: tx, y: ty, tile: tx === x && ty === y ? 'door-closed' : edge ? spec.wall : spec.floor || 'cabin-floor',
      blocked: !tile || !ground.has(tile.name) || !!tile.structure || !!tile.hurts });
  }
  for (const e of entities) {
    if (!(e.type === 'player' || e.hp > 0 || e.animal || e.interactive || buildings[e.type])) continue;
    const r = .3 * (e.size || 1);
    if (e.x + r < left || e.x - r >= x + half + 1 || e.y + r < top || e.y - r >= y + 1) continue;
    for (const cell of cells) {
      if (e.x + r >= cell.x && e.x - r < cell.x + 1 && e.y + r >= cell.y && e.y - r < cell.y + 1) cell.blocked = true;
    }
  }
  const approach = world.tile(x, y + 1);
  const approachBlocked = !approach || !!approach.solid || !!approach.hurts;
  const inReach = Math.hypot(x + .5 - player.x, y + .5 - player.y) <= 2.5;
  return { spec, cells, approachBlocked, inReach, valid: inReach && !approachBlocked && !cells.some(cell => cell.blocked) };
}
