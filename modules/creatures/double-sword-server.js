// Double swords: large monsters drop one DOUBLE_SWORD.dropChance of the time. Weaker
// kinds are more likely (chance proportional to 1 / damage). Damage, reach and the slower
// swing are plain item data (shared.js) that the player's melee attack already reads.
import { registries, onEvent } from '../../shared/registry.js';
import { DOUBLE_SWORD } from './shared.js';

onEvent('killed', (game, victim) => {
  if (!DOUBLE_SWORD.droppedBy.includes(victim.type) || Math.random() >= DOUBLE_SWORD.dropChance) return;
  const kinds = [...registries.items.values()].filter((i) => i.doubleSword);
  let r = Math.random() * kinds.reduce((sum, i) => sum + 1 / i.damage, 0);
  const item = kinds.find((i) => (r -= 1 / i.damage) < 0) || kinds[0];
  if (item) game.spawn('drop', { x: victim.x, y: victim.y, item: item.name, count: 1 });
});
