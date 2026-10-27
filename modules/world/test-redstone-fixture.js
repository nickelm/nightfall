// Isolated fixture for test-redstone-restore.js; not loaded by the game.
const { game } = await import('../../server/index.js');
game._animalSpawnAt = Infinity;
game.bus.on('playerJoined', p => {
  if (p._redstoneTestKit) return;
  p._redstoneTestKit = true;
  for (let y = 79; y <= 81; y++) for (let x = 81; x <= 86; x++) game.setTile(x, y, 'grass');
  game.give(p, 'power-crystal', 1);
  game.give(p, 'redstone-wire', 2);
  game.give(p, 'redstone-lamp', 1);
});
