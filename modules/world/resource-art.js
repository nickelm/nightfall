import { registerDrawer } from '../../shared/registry.js';
import { hash2 } from '../../shared/rng.js';

for (const name of ['iron', 'gold', 'diamond']) {
  registerDrawer(`tile:${name}-ore`, (ctx, tile, x, y, size, tx, ty) => {
    ctx.fillStyle = '#3e424e';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = tile.color;
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(x + 2, y + 2, size - 4, 3);
    for (let i = 0; i < 5; i++) {
      const px = x + size * (0.17 + hash2(tx + i * 3, ty, 43) * 0.58);
      const py = y + size * (0.17 + hash2(tx, ty + i * 5, 51) * 0.58);
      ctx.fillStyle = tile.oreColor;
      ctx.beginPath();
      ctx.moveTo(px, py - size * 0.1);
      ctx.lineTo(px + size * 0.11, py);
      ctx.lineTo(px, py + size * 0.12);
      ctx.lineTo(px - size * 0.09, py);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(px - 1, py - 2, 2, 2);
    }
  });

  registerDrawer(`item:${name}`, (ctx, item, x, y, size) => {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.32, y - size * 0.15);
    ctx.lineTo(x + size * 0.15, y - size * 0.3);
    ctx.lineTo(x + size * 0.34, y + size * 0.1);
    ctx.lineTo(x - size * 0.1, y + size * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.28, y - size * 0.12);
    ctx.lineTo(x + size * 0.12, y - size * 0.24);
    ctx.lineTo(x + size * 0.05, y + size * 0.05);
    ctx.stroke();
  });
}

for (const name of ['door-closed', 'door-open']) {
  registerDrawer(`tile:${name}`, (ctx, tile, x, y, size) => {
    ctx.fillStyle = '#5e5a55';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#3a271b';
    ctx.fillRect(x, y, size * 0.12, size);
    ctx.fillRect(x + size * 0.88, y, size * 0.12, size);
    const width = name === 'door-closed' ? size * 0.76 : size * 0.16;
    ctx.fillStyle = tile.color;
    ctx.fillRect(x + size * 0.12, y + 1, width, size - 2);
    ctx.strokeStyle = '#54351e';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const px = x + size * 0.12 + width * i / 4;
      ctx.beginPath(); ctx.moveTo(px, y + 2); ctx.lineTo(px, y + size - 2); ctx.stroke();
    }
    ctx.fillStyle = '#353039';
    ctx.fillRect(x + size * 0.12, y + size * 0.2, width, size * 0.08);
    ctx.fillRect(x + size * 0.12, y + size * 0.72, width, size * 0.08);
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(x + size * 0.12 + width * 0.72, y + size * 0.48, 3, 3);
  });
}
