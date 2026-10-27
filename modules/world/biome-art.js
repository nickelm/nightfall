import { registerDrawer } from '../../shared/registry.js';
import { hash2 } from '../../shared/rng.js';

registerDrawer('tile:snow', (ctx, tile, x, y, size, tx, ty) => {
  ctx.fillStyle = tile.color; ctx.fillRect(x, y, size, size);
  for (let i = 0; i < 5; i++) {
    const px = x + hash2(tx * 7 + i, ty, 41) * (size - 3);
    const py = y + hash2(tx, ty * 7 + i, 42) * (size - 3);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(89,125,150,0.14)';
    ctx.fillRect(px, py, 3, 2);
  }
});

registerDrawer('tile:snow-tree', (ctx, tile, x, y, size, tx, ty) => {
  ctx.fillStyle = '#cedfe4'; ctx.fillRect(x, y, size, size);
  const cx = x + size / 2, cy = y + size / 2;
  ctx.fillStyle = 'rgba(28,54,64,0.25)'; ctx.beginPath(); ctx.arc(cx + 2, cy + 3, size * 0.43, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#375f53';
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + hash2(tx, ty, 9);
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * size * 0.14, cy + Math.sin(a) * size * 0.14, size * 0.26, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#e6f1f0';
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + hash2(tx, ty, 9);
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * size * 0.16, cy + Math.sin(a) * size * 0.16, size * 0.18, size * 0.08, a, 0, Math.PI * 2); ctx.fill();
  }
});

registerDrawer('tile:desert-tree', (ctx, tile, x, y, size, tx, ty) => {
  ctx.fillStyle = '#c9b77e'; ctx.fillRect(x, y, size, size);
  const cx = x + size / 2, cy = y + size / 2, offset = hash2(tx, ty, 21) * 6;
  ctx.strokeStyle = '#765631'; ctx.lineWidth = Math.max(2, size * 0.08); ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = offset + i * Math.PI / 3;
    ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * size * 0.37, cy + Math.sin(a) * size * 0.37);
  }
  ctx.stroke(); ctx.fillStyle = '#8c6539'; ctx.beginPath(); ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2); ctx.fill();
});

for (const name of ['granite', 'sandstone', 'froststone']) {
  registerDrawer(`tile:${name}-rock`, (ctx, tile, x, y, size, tx, ty) => {
    ctx.fillStyle = '#55545a'; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = tile.color; ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(x + 2, y + 2, size - 4, 3);
    ctx.strokeStyle = 'rgba(41,38,42,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
    const shift = hash2(tx, ty, 19) * size * 0.15;
    ctx.moveTo(x + size * 0.28 + shift, y + size * 0.22);
    ctx.lineTo(x + size * 0.52, y + size * 0.5);
    ctx.lineTo(x + size * 0.4 + shift, y + size * 0.79); ctx.stroke();
  });
  registerDrawer(`tile:${name}-block`, (ctx, tile, x, y, size) => {
    ctx.fillStyle = '#514c4e'; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = tile.color;
    ctx.fillRect(x + 2, y + 2, size / 2 - 3, size / 2 - 3);
    ctx.fillRect(x + size / 2 + 1, y + 2, size / 2 - 3, size / 2 - 3);
    ctx.fillRect(x + 2, y + size / 2 + 1, size - 4, size / 2 - 3);
  });
  registerDrawer(`item:${name}`, (ctx, item, x, y, size) => {
    ctx.fillStyle = item.color; ctx.beginPath();
    ctx.moveTo(x - size * 0.3, y + size * 0.2); ctx.lineTo(x - size * 0.24, y - size * 0.2);
    ctx.lineTo(x + size * 0.05, y - size * 0.33); ctx.lineTo(x + size * 0.3, y - size * 0.08);
    ctx.lineTo(x + size * 0.24, y + size * 0.22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - size * 0.17, y - size * 0.2, size * 0.25, size * 0.07);
  });
}
