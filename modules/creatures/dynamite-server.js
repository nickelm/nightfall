// Dynamite: placed with right click, explodes FUSE seconds later, hurting everything
// with hp within RADIUS tiles (players too, the one who lit it included).
import { registerSystem } from '../../shared/registry.js';
import { DYNAMITE } from './shared.js';

registerSystem('dynamite', (game) => {
  for (const e of [...game.entities.values()]) {
    if (e.type !== 'dynamite') continue;
    if (e.explodeAt == null) e.explodeAt = game.time + DYNAMITE.fuse; // public: clients draw the countdown
    if (game.time < e.explodeAt) continue;
    game.despawn(e.id);
    const owner = game.entities.get(e.owner) || null;
    for (const t of game.near(e.x, e.y, DYNAMITE.radius, (t) => t.hp > 0)) game.damage(t, DYNAMITE.damage, owner);
    game.broadcast('exploded', { x: e.x, y: e.y, radius: DYNAMITE.radius });
  }
});
