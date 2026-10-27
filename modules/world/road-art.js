import { registerDrawer } from '../../shared/registry.js';

function stones(ctx, x, y, size) {
  ctx.fillStyle = '#555459'; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#929196';
  for (let row = 0; row < 3; row++) for (let col = -1; col < 3; col++) {
    const left = Math.max(0, col * size * .5 + (row % 2) * size * .25);
    const right = Math.min(size, col * size * .5 + (row % 2) * size * .25 + size * .47);
    if (right > left) ctx.fillRect(x + left, y + row * size / 3 + size * .025, right - left, size * .28);
  }
}
registerDrawer('tile:road', (ctx, tile, x, y, size) => stones(ctx, x, y, size));
registerDrawer('item:road', (ctx, item, x, y, size) => stones(ctx, x - size * .33, y - size * .33, size * .66));
