// Chests: right click opens one for that player only; the 'chest' action moves
// items between the chest and the player, or picks up an empty chest.
import { onAction } from '../../shared/registry.js';

const CHEST_REACH = 2.5; // tiles from the player to the chest's center

const reachable = (player, chest) => chest?.type === 'chest' && Math.hypot(chest.x - player.x, chest.y - player.y) <= CHEST_REACH;

onAction('interact', (game, player, { x, y }) => {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return;
  const chest = game.near(x + 0.5, y + 0.5, 0.9, (e) => e.type === 'chest')[0];
  if (reachable(player, chest)) game.sendTo(player.id, 'chestOpen', { id: chest.id });
});

onAction('chest', (game, player, { id, item, count, put, pickup }) => {
  const chest = game.entities.get(id);
  if (!reachable(player, chest)) return;
  if (pickup) {
    if (Object.keys(chest.inventory || {}).length) return; // empty it first
    game.despawn(chest.id);
    game.give(player, 'chest', 1);
    return;
  }
  const from = put ? player : chest, to = put ? chest : player;
  const owned = Object.hasOwn(from.inventory || {}, item) ? from.inventory[item] : 0;
  const n = Number.isInteger(count) && count > 0 ? Math.min(count, owned) : owned;
  if (!(n > 0)) return;
  game.give(from, item, -n);
  game.give(to, item, n);
});
