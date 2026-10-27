import { registerDrawer } from '../../shared/registry.js';

// Placeholder chest until Art draws one: a plank box with a lid seam and a brass latch.
function chest(ctx, x, y, size) {
  const w = size * 0.7, h = size * 0.5, left = x - w / 2, top = y - h / 2;
  ctx.fillStyle = '#1a1020'; ctx.fillRect(left - 2, top - 2, w + 4, h + 4);
  ctx.fillStyle = '#7a4f2a'; ctx.fillRect(left, top, w, h);
  ctx.fillStyle = '#93623a'; ctx.fillRect(left, top, w, h * 0.38);
  ctx.fillStyle = '#4a2e18';
  ctx.fillRect(left, top + h * 0.38, w, Math.max(1, h * 0.06));
  ctx.fillRect(left + w * 0.12, top, Math.max(1, w * 0.06), h);
  ctx.fillRect(left + w * 0.82, top, Math.max(1, w * 0.06), h);
  ctx.fillStyle = '#e6b84a'; ctx.fillRect(x - w * 0.07, top + h * 0.3, w * 0.14, h * 0.24);
}

registerDrawer('chest', (ctx, e, x, y, T) => chest(ctx, x, y, T));
registerDrawer('item:chest', (ctx, item, x, y, size) => chest(ctx, x, y, size));
