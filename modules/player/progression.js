export const xpForLevel = level => 5 * (level - 1) * (level + 2);
export function levelFromXp(xp) {
  return Math.max(1, Math.floor((-1 + Math.sqrt(9 + Math.max(0, xp) * .8)) / 2));
}
export function titleForLevel(level) {
  if (level >= 20) return 'Dragon Lord';
  if (level >= 15) return 'Paladin';
  if (level >= 10) return 'Dawn Warden';
  if (level >= 5) return 'Knight';
  if (level >= 3) return 'Squire';
  return 'Wanderer';
}
