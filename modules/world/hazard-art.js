// Glass, thorns, and lava tiles, their item icons, and the invisible lava-glow light.
import { registerDrawer } from '../../shared/registry.js';
import { hash2 } from '../../shared/rng.js';

function spike(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath(); ctx.fill();
}

registerDrawer('tile:glass', (ctx, tile, x, y, size) => {
  ctx.fillStyle = '#5e5a55';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = 'rgba(159,212,224,0.35)';
  ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
  ctx.strokeStyle = '#c9e6ee';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.25, y + size * 0.7); ctx.lineTo(x + size * 0.7, y + size * 0.25);
  ctx.moveTo(x + size * 0.45, y + size * 0.8); ctx.lineTo(x + size * 0.8, y + size * 0.45);
  ctx.stroke();
});

registerDrawer('tile:thorns', (ctx, tile, x, y, size, tx, ty, game) => {
  ctx.fillStyle = '#3f6b35';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#1a1114';
  ctx.fillRect(x + size * 0.08, y + size * 0.08, size * 0.84, size * 0.84);
  ctx.fillStyle = tile.color;
  ctx.fillRect(x + size * 0.14, y + size * 0.14, size * 0.72, size * 0.72);
  ctx.fillStyle = game.theme.colors.bone;
  for (let i = 0; i < 5; i++) {
    const px = x + size * (0.25 + hash2(tx + i * 7, ty, 71) * 0.5);
    const py = y + size * (0.4 + hash2(tx, ty + i * 3, 73) * 0.42);
    spike(ctx, px, py, size * 0.14, size * 0.3);
  }
  ctx.fillStyle = game.theme.colors.blood;
  ctx.fillRect(x + size * (0.3 + hash2(tx, ty, 79) * 0.4), y + size * 0.3, 2, 2);
});

registerDrawer('tile:lava', (ctx, tile, x, y, size, tx, ty, game) => {
  const C = game.theme.colors, t = performance.now() / 1000;
  ctx.fillStyle = '#7a1a0e';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = tile.color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  for (let i = 0; i < 3; i++) {
    const phase = hash2(tx + i, ty, 83) * Math.PI * 2;
    const px = x + size * (0.5 + 0.3 * Math.sin(t * 0.6 + phase));
    const py = y + size * (0.5 + 0.3 * Math.cos(t * 0.45 + phase * 1.3));
    ctx.fillStyle = i === 0 ? C.candle : C.pumpkin;
    ctx.beginPath();
    ctx.arc(px, py, size * (0.1 + 0.05 * Math.sin(t * 2 + phase)), 0, Math.PI * 2);
    ctx.fill();
  }
});

// Only a light source: draw nothing so the default circle does not show.
registerDrawer('lava-glow', () => {});

registerDrawer('item:sand', (ctx, item, x, y, size) => {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.34, y + size * 0.22);
  ctx.quadraticCurveTo(x, y - size * 0.4, x + size * 0.34, y + size * 0.22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - size * 0.15 + i * size * 0.1, y + size * (0.05 - (i % 2) * 0.1), 2, 2);
});

registerDrawer('item:glass', (ctx, item, x, y, size) => {
  ctx.fillStyle = 'rgba(159,212,224,0.55)';
  ctx.fillRect(x - size * 0.3, y - size * 0.3, size * 0.6, size * 0.6);
  ctx.strokeStyle = '#c9e6ee';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - size * 0.3, y - size * 0.3, size * 0.6, size * 0.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.15, y + size * 0.12); ctx.lineTo(x + size * 0.12, y - size * 0.15);
  ctx.stroke();
});

registerDrawer('item:thorns', (ctx, item, x, y, size, game) => {
  ctx.fillStyle = item.color;
  ctx.fillRect(x - size * 0.32, y + size * 0.08, size * 0.64, size * 0.18);
  ctx.fillStyle = game.theme.colors.bone;
  for (let i = -1; i <= 1; i++) spike(ctx, x + i * size * 0.2, y + size * 0.1, size * 0.16, size * 0.38);
});
