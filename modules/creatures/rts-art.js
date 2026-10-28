// RTS mode (client) look: peasants, and players hidden while they command from the RTS view.
// The view itself (camera, selection, console) is in rts-ui.js.
import { registries, registerClientSystem, registerDrawer } from '../../shared/registry.js';
import './rts-ui.js';

const WALKING = new Set(['toMine', 'toChest', 'moving', 'toBuild']);

// Hide players who are in RTS mode (wrapped like giant-potion-art.js does).
function hideInRts(inner) {
  const fn = (ctx, e, ...rest) => { if (!e.rts) inner(ctx, e, ...rest); };
  Object.assign(fn, inner);
  fn._rts = true;
  return fn;
}
registerClientSystem('rts-hide-hero', () => {
  const d = registries.drawers.get('player');
  if (d && !d._rts) registerDrawer('player', hideInRts(d));
});

// A small villager in a hood: walks, swings a pickaxe while mining or building, and carries
// a sack tinted like the item it hauls. Your own peasants stand on a faint green ring that
// turns bright while they are selected in the RTS view. Portraits pass `_portrait: true`.
registerDrawer('peasant', (ctx, e, x, y, T, game) => {
  const C = game.theme.colors, now = performance.now() / 1000;
  const moving = WALKING.has(e.task);
  const bob = moving ? Math.abs(Math.sin(now * 10 + e.id)) * T * 0.05 : 0;
  const face = (e.dir?.x ?? 0) < 0 ? -1 : 1;
  if (!e._portrait) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + T * 0.22, T * 0.2, T * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    const selected = game._rts?.on && game._rts.sel?.has(e.id);
    if (selected || e.owner === game.myId) {
      ctx.strokeStyle = selected ? '#7dff7a' : 'rgba(125,255,122,0.45)'; ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.beginPath(); ctx.ellipse(x, y + T * 0.22, T * 0.28, T * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  const by = y - bob;
  // legs
  ctx.fillStyle = '#3d2a1c';
  const step = moving ? Math.sin(now * 10 + e.id) * T * 0.05 : 0;
  ctx.fillRect(x - T * 0.09 + step, by + T * 0.08, T * 0.07, T * 0.13);
  ctx.fillRect(x + T * 0.02 - step, by + T * 0.08, T * 0.07, T * 0.13);
  // tunic and belt
  ctx.fillStyle = '#8a6a43';
  ctx.beginPath(); ctx.roundRect(x - T * 0.13, by - T * 0.1, T * 0.26, T * 0.22, T * 0.05); ctx.fill();
  ctx.fillStyle = '#4a3322'; ctx.fillRect(x - T * 0.13, by + T * 0.03, T * 0.26, T * 0.03);
  // head and hood
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath(); ctx.arc(x, by - T * 0.17, T * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b4f2e';
  ctx.beginPath(); ctx.arc(x, by - T * 0.19, T * 0.1, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.fillStyle = '#2a1d14'; ctx.fillRect(x + face * T * 0.04 - T * 0.01, by - T * 0.18, T * 0.025, T * 0.025);
  // pickaxe, swinging while mining or building
  const swing = e.task === 'mining' || e.task === 'building' ? Math.sin(now * 9 + e.id) * 0.9 : 0.4;
  ctx.save();
  ctx.translate(x + face * T * 0.12, by - T * 0.02);
  ctx.scale(face, 1); ctx.rotate(-0.6 + swing);
  ctx.strokeStyle = '#7a5530'; ctx.lineWidth = T * 0.04;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -T * 0.26); ctx.stroke();
  ctx.strokeStyle = '#b8b8c0'; ctx.lineWidth = T * 0.045;
  ctx.beginPath(); ctx.arc(0, -T * 0.16, T * 0.11, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();
  ctx.restore();
  // the load on its back
  if (e.carry) {
    ctx.fillStyle = registries.items.get(e.carry)?.color || C.bone;
    ctx.strokeStyle = '#2a1d14'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x - face * T * 0.13, by - T * 0.06, T * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // mining or building progress
  if (!e._portrait && e.work > 0 && (e.task === 'mining' || e.task === 'building')) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - T * 0.2, by - T * 0.38, T * 0.4, T * 0.05);
    ctx.fillStyle = C.candle; ctx.fillRect(x - T * 0.2, by - T * 0.38, T * 0.4 * e.work, T * 0.05);
  }
});
