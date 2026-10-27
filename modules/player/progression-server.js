import { onEvent, registerSystem } from '../../shared/registry.js';
import { levelFromXp, titleForLevel } from './progression.js';

function update(p) {
  p.xp ??= 0; p.kills ??= 0; p.killCounts ??= {};
  p._baseMaxHp ??= p.maxHp || 10;
  const level = levelFromXp(p.xp), oldMax = p.maxHp || p._baseMaxHp;
  p.level = level; p.title = titleForLevel(level);
  p.maxHp = p._baseMaxHp + level - 1;
  if (p.hp > 0 && p.maxHp > oldMax) p.hp = Math.min(p.maxHp, p.hp + p.maxHp - oldMax);
}

onEvent('playerJoined', (game, p) => update(p));
registerSystem('progression', game => { for (const p of game.players()) update(p); });
onEvent('damage', (game, hit) => {
  if (!(hit.target.hostile || hit.target.predator) || hit.source?.type !== 'player' || hit.cancelled) return;
  hit.target._lastHunter = hit.source.id; hit.target._lastHunterAt = game.time;
});
onEvent('killed', (game, victim, source) => {
  if (!(victim.hostile || victim.predator) || victim._xpAwarded) return;
  const hunter = source?.type === 'player' ? source :
    game.time - (victim._lastHunterAt ?? -Infinity) <= 30 ? game.entities.get(victim._lastHunter) :
    victim._lightHunterAt === game.time ? game.entities.get(victim._lightHunter) : null;
  if (!hunter || hunter.type !== 'player') return;
  victim._xpAwarded = true;
  update(hunter); const before = hunter.level;
  const amount = Math.round(10 * Math.max(1, victim.threat || 1));
  hunter.xp += amount; hunter.kills++;
  hunter.killCounts[victim.type] = (hunter.killCounts[victim.type] || 0) + 1;
  update(hunter);
  game.sendTo(hunter.id, 'xpGained', { amount, level: hunter.level, leveled: hunter.level > before, title: hunter.title });
});
