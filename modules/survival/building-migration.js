import { onEvent, registerSystem } from '../../shared/registry.js';

export function migrateRohanPlayer(game, p) {
  const count = p.inventory?.hanok || 0;
  if (count > 0) { game.give(p, 'rohan-hall', count); game.give(p, 'hanok', -count); }
  if (p.hotbar?.includes('hanok')) p.hotbar = p.hotbar.map(item => item === 'hanok' ? 'rohan-hall' : item);
}
onEvent('playerJoined', migrateRohanPlayer);
registerSystem('rohan-migration', game => {
  for (const e of game.entities.values()) {
    if (e.type === 'hanok') e.type = 'rohan-hall';
    if (e.type === 'player') migrateRohanPlayer(game, e);
  }
  if (game._rohanTilesMigrated) return;
  for (const [x, y] of game.world.editList()) {
    const name = game.world.tile(x, y)?.name;
    if (name === 'hanok-wall') game.setTile(x, y, 'rohan-wall');
    if (name === 'hanok-floor') game.setTile(x, y, 'rohan-floor');
  }
  game._rohanTilesMigrated = true;
});
