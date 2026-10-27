import { onAction, registerSystem } from '../../shared/registry.js';

onAction('use', (game, p, { x, y }) => {
  if (p.sailing || p.hotbar?.[p.selected] !== 'boat' || !game.has(p, 'boat')) return;
  if (!Number.isInteger(x) || !Number.isInteger(y) || Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > 2.5) return;
  if (game.world.tile(x, y)?.name !== 'water') return;
  if (game.near(x + 0.5, y + 0.5, 0.6, e => e.id !== p.id && (e.type === 'player' || e.interactive)).length) return;
  game.give(p, 'boat', -1); p.sailing = true;
  game.teleport(p, x + 0.5, y + 0.5);
  game.sendTo(p.id, 'boatMessage', { text: 'Boat boarded. Sail to land to leave automatically.' });
});

function disembark(game, p, notifyAtSea = false) {
  if (!p.sailing) return;
  if (game.world.blocked(p.x, p.y)) {
    if (notifyAtSea) game.sendTo(p.id, 'boatMessage', { text: 'Reach open land before leaving the boat.' });
    return;
  }
  p.sailing = false; game.give(p, 'boat', 1);
  game.sendTo(p.id, 'boatMessage', { text: 'Boat returned to your inventory.' });
}

onAction('disembark', (game, p) => disembark(game, p, true));
registerSystem('boat-landing', game => {
  for (const p of game.players()) disembark(game, p);
});
