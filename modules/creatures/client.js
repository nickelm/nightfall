// TEAM CREATURES (client): horde warnings and the director debug view (F3).
// Quest logs and NPC dialogue boxes would go here too.
import { registries, registerClientSystem, registerHud, registerDrawer, onEvent } from '../../shared/registry.js';
import './farm-art.js';
import './dynamite-art.js';
import './monsters-art.js';
import './first-person.js';

// Blood slime: the slime drawing (from Art) scaled up by `size`, in the slime's own red.
// Art can register its own 'blood-slime' drawer to replace this.
registerDrawer('blood-slime', (ctx, e, x, y, T, game) => {
  const slime = registries.drawers.get('slime');
  if (slime) return slime(ctx, e, x, y, T * (e.size || 2), game);
  ctx.fillStyle = e.color;
  ctx.beginPath(); ctx.arc(x, y, T * 0.3 * (e.size || 2), 0, Math.PI * 2); ctx.fill();
});

// Loot on the ground: the item's own icon, bobbing above a small shadow.
registerDrawer('drop', (ctx, e, x, y, T, game) => {
  const bob = Math.sin(performance.now() / 300 + e.id) * T * 0.05;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x, y + T * 0.18, T * 0.16, T * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  const icon = registries.drawers.get(`item:${e.item}`);
  if (icon) { icon(ctx, registries.items.get(e.item), x, y - bob, T * 0.6, game); return; }
  ctx.fillStyle = registries.items.get(e.item)?.color || '#ccc';
  ctx.fillRect(x - T * 0.15, y - bob - T * 0.15, T * 0.3, T * 0.3);
});

// Placeholder icon for monster goo (Art may replace it): a green blob with a shine.
registerDrawer('item:monster-goo', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = item?.color || '#8fdc4a';
  ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.06, s * 0.28, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + s * 0.12, cy - s * 0.14, s * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.arc(cx - s * 0.1, cy - s * 0.02, s * 0.06, 0, Math.PI * 2); ctx.fill();
});

onEvent('net:pickedUp', (game, { item, count }) => game.notify(`+${count} ${item.replace(/-/g, ' ')}`, 1.5, game.theme.colors.candle));

onEvent('net:lightBurn', (game, { x, y }) => {
  (game._lightBurnEffects ||= []).push({ x, y, until: performance.now() + 700 });
});
registerHud('light-burn-effects', (ctx, game) => {
  if (game.settings.view === 'first') return; // world-space effect: not in first person
  const now = performance.now();
  game._lightBurnEffects = (game._lightBurnEffects || []).filter(effect => effect.until > now);
  for (const effect of game._lightBurnEffects) {
    if (!game.canSee(effect.x, effect.y)) continue;
    const p = game.worldToScreen(effect.x, effect.y), rise = (700 - (effect.until - now)) / 35;
    ctx.save(); ctx.globalAlpha = Math.min(1, (effect.until - now) / 250);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = game.font(15, 'display');
    ctx.fillStyle = '#ffe08a'; ctx.fillText('AAH!', p.x, p.y - 24 - rise);
    ctx.restore();
  }
});

let debug = false;
let last = null;

onEvent('net:waveWarn', (game, { from }) => game.notify(`Something stirs in the ${from}...`, 4, game.theme.colors.moon));
onEvent('net:horde', (game, { from, count, target, wave, of }) => {
  const label = wave && of > 1 ? `Wave ${wave}/${of}: ` : '';
  game.notify(`${label}a horde of ${count} approaches from the ${from}!`, 5, '#f96');
  if (target === game.myId) game.notify('...and it is coming for you', 4, '#f66');
});
onEvent('net:raid', (game, { from, count, bloodMoon }) => {
  if (bloodMoon) game.notify('BLOOD MOON', 6, game.theme.colors.blood);
  game.notify(`RAID! ${count} of the dead march on your base from the ${from}`, 6, game.theme.colors.blood);
});
onEvent('net:raidOver', (game, { dawn }) => {
  game.notify(dawn ? 'Dawn breaks the raid' : 'The raid is broken!', 4, game.theme.colors.candle);
});
onEvent('net:director', (game, d) => { last = d; });

registerClientSystem('director-toggle', (game) => {
  if (game.input.pressed('F3')) debug = !debug;
});

registerHud('director-debug', (ctx, game, w, h) => {
  if (!debug) return;
  const lines = last
    ? [
        `director: ${last.state}`,
        `threat ${last.threat.toFixed(1)} / budget ${last.budget.toFixed(1)}`,
        `intensity ${last.intensity.toFixed(2)}`,
        ...Object.entries(last.factors || {}).map(([k, v]) => `  ${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`),
        `waves left: ${(last.hordes || []).map((x) => x.toFixed(2)).join(', ') || 'none'}`,
        ...(last.pulses || []).map((p) => `  pulse ${p.kind} x${p.n} in ${p.in.toFixed(0)}s`),
        `raid: ${last.raid ? `on (${last.raid.count})` : last.raidAt != null ? `at ${last.raidAt.toFixed(2)}` : 'none'}${last.bloodMoon ? ' (blood moon)' : ''}`,
        `alive: ${Object.entries(last.census || {}).map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}`,
      ]
    : ['director: no data yet'];
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(8, h - 70 - lines.length * 17, 260, lines.length * 17 + 10);
  ctx.fillStyle = '#9f9';
  ctx.font = '13px ui-monospace, monospace';
  lines.forEach((l, i) => ctx.fillText(l, 16, h - 65 - lines.length * 17 + i * 17));
});
