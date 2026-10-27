// Giant potion: its icon, and giant players drawn GIANT.scale times as big with a
// countdown above them. Art owns the player drawer, so we wrap whatever is registered.
import { registries, registerDrawer, registerClientSystem, onEvent } from '../../shared/registry.js';
import { GIANT } from './shared.js';

registerDrawer('item:giant-potion', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = '#d9cfe8';
  ctx.fillRect(cx - s * 0.06, cy - s * 0.34, s * 0.12, s * 0.12); // neck
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(cx - s * 0.08, cy - s * 0.4, s * 0.16, s * 0.07);  // cork
  ctx.fillStyle = item?.color || '#d23cff';
  ctx.beginPath(); ctx.arc(cx, cy + s * 0.06, s * 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.arc(cx - s * 0.09, cy - s * 0.02, s * 0.06, 0, Math.PI * 2); ctx.fill();
});

function giantDrawer(inner) {
  const fn = (ctx, e, x, y, T, game) => {
    const left = (e.giantUntil || 0) - game.time;
    if (left <= 0) return inner(ctx, e, x, y, T, game);
    ctx.save();
    inner(ctx, e, x, y, T * GIANT.scale, game);
    ctx.restore();
    const label = Math.ceil(left).toString();
    ctx.font = game.font(Math.round(T * 0.5), 'display');
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = '#000';
    const ty = y - T * 0.45 * GIANT.scale - 14; // above the body and the name tag
    ctx.strokeText(label, x, ty);
    ctx.fillStyle = left < 3 ? game.theme.colors.blood : '#e59bff';
    ctx.fillText(label, x, ty);
  };
  Object.assign(fn, inner); // keep the other wrappers' marks, so nobody wraps twice
  fn._giant = true;
  return fn;
}

// Art loads after us, so wrap the player drawer once it is there (and again if replaced).
registerClientSystem('giant-drawer', () => {
  const d = registries.drawers.get('player');
  if (d && !d._giant) registerDrawer('player', giantDrawer(d));
});

onEvent('net:giant', (game, { id }) => {
  if (id === game.myId) game.notify(`Giant for ${GIANT.seconds} seconds!`, 2, '#e59bff');
});
