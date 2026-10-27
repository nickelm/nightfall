// Double swords: a blade DOUBLE_SWORD.scale times as long in the player's hand, following
// the same swing and parry poses as Art's normal sword, and a "3x" mark on the icon.
// Art owns the player drawer and the item icons, so we wrap what it registered.
import { registries, registerDrawer, registerClientSystem } from '../../shared/registry.js';
import { DOUBLE_SWORD } from './shared.js';

const S = DOUBLE_SWORD.scale;

function bigBlade(ctx, item, T) {
  ctx.fillStyle = '#1a0f1e';                             // grip
  ctx.fillRect(-T * 0.3, -T * 0.05, T * 0.3, T * 0.1);
  ctx.fillStyle = item?.color || '#d8dce4';              // blade
  ctx.beginPath();
  ctx.moveTo(2, -T * 0.09); ctx.lineTo(T * 0.5 * S, -T * 0.09); ctx.lineTo(T * 0.6 * S, 0);
  ctx.lineTo(T * 0.5 * S, T * 0.09); ctx.lineTo(2, T * 0.09); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1a0f1e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(6, -T * 0.02, T * 0.45 * S, 2);
  ctx.fillStyle = '#1a0f1e';                             // crossguard
  ctx.fillRect(-T * 0.06, -T * 0.25, T * 0.12, T * 0.5);
  ctx.fillStyle = '#c9a04a';
  ctx.fillRect(-T * 0.04, -T * 0.23, T * 0.08, T * 0.46);
}

function doubleSwordDrawer(inner) {
  const fn = (ctx, e, x, y, T, game) => {
    const slot = e.id === game.myId ? game.selectedSlot : e.selected;
    const item = registries.items.get(e.hotbar?.[slot]);
    if (!item?.doubleSword) return inner(ctx, e, x, y, T, game);
    // Art draws the player empty-handed; we add the big blade in the same pose.
    ctx.save();
    inner(ctx, { ...e, hotbar: e.hotbar.map((h, i) => (i === slot ? null : h)) }, x, y, T, game);
    ctx.restore();
    const d = e.dir || { x: 0, y: 1 };
    const swung = Math.max(0, (e._swingUntil || 0) - performance.now()) / 150; // 1 -> 0 during a swing
    let angle = 0.6, hx = T * 0.18, hy = T * 0.27;
    if (swung > 0) angle = 1.1 - 2.2 * (1 - swung);
    if (e.guarding && !e.inventory?.shield) { angle = -Math.PI / 2; hx = T * 0.34; hy = T * 0.22; }
    ctx.save();
    ctx.translate(x, y); ctx.rotate(Math.atan2(d.y, d.x));
    if (swung > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * swung})`; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(0, 0, T * 0.6 * S, angle, 1.1); ctx.stroke();
    }
    ctx.translate(hx, hy); ctx.rotate(angle);
    bigBlade(ctx, item, T);
    ctx.restore();
  };
  Object.assign(fn, inner); // keep the other wrappers' marks, so nobody wraps twice
  fn._double = true;
  return fn;
}

function iconWithMark(inner) {
  const fn = (ctx, item, cx, cy, s, game) => {
    ctx.save(); inner(ctx, item, cx, cy, s, game); ctx.restore();
    ctx.font = `bold ${Math.round(s * 0.3)}px sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(`${S}x`, cx + s * 0.48, cy + s * 0.5);
    ctx.fillStyle = '#ffe08a'; ctx.fillText(`${S}x`, cx + s * 0.48, cy + s * 0.5);
  };
  fn._double = true;
  return fn;
}

// Art loads after us: wrap its drawers once they exist (and again if they are replaced).
registerClientSystem('double-sword-drawers', () => {
  const p = registries.drawers.get('player');
  if (p && !p._double) registerDrawer('player', doubleSwordDrawer(p));
  for (const item of registries.items.values()) {
    if (!item.doubleSword) continue;
    const key = `item:${item.name}`, icon = registries.drawers.get(key);
    if (icon && !icon._double) registerDrawer(key, iconWithMark(icon));
  }
});
