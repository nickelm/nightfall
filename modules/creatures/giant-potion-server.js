// Giant potion: dropped by slimes (GIANT.dropChance of the time), drunk with right click. While a player's
// `giantUntil` lies ahead, every hit they land (melee or their arrows) does GIANT.damage times as much.
import { onAction, onEvent, registerSystem } from '../../shared/registry.js';
import { GIANT } from './shared.js';

onEvent('killed', (game, victim) => {
  if (!GIANT.droppedBy.includes(victim.type) || Math.random() >= GIANT.dropChance) return;
  game.spawn('drop', { x: victim.x, y: victim.y, item: 'giant-potion', count: 1 });
});

onAction('use', (game, player) => {
  if (player.hotbar?.[player.selected] !== 'giant-potion' || !game.has(player, 'giant-potion')) return;
  game.give(player, 'giant-potion', -1);
  player.giantUntil = Math.max(player.giantUntil || 0, game.time) + GIANT.seconds;
  game.broadcast('giant', { id: player.id, x: player.x, y: player.y });
});

onEvent('damage', (game, hit) => {
  const src = hit.source;
  if (src?.type === 'player' && src.giantUntil > game.time) hit.amount *= GIANT.damage;
});

registerSystem('giant-potion', (game) => {
  for (const p of game.players()) if (p.giantUntil && p.giantUntil <= game.time) delete p.giantUntil;
});
