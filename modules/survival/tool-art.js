import { registerDrawer } from '../../shared/registry.js';

for (const material of ['iron', 'gold', 'diamond']) {
  registerDrawer(`item:${material}-axe`, (ctx, item, x, y, size) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.55);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(-size * 0.05, -size * 0.25, size * 0.1, size * 0.68);
    ctx.fillStyle = item.color;
    ctx.beginPath(); ctx.moveTo(0, -size * 0.3); ctx.lineTo(size * 0.3, -size * 0.38);
    ctx.lineTo(size * 0.32, -size * 0.04); ctx.lineTo(0, -size * 0.12); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
  registerDrawer(`item:${material}-sword`, (ctx, item, x, y, size) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.55);
    ctx.fillStyle = item.color;
    ctx.beginPath(); ctx.moveTo(0, -size * 0.45); ctx.lineTo(size * 0.12, -size * 0.28);
    ctx.lineTo(size * 0.09, size * 0.16); ctx.lineTo(-size * 0.09, size * 0.16);
    ctx.lineTo(-size * 0.12, -size * 0.28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9b7439'; ctx.fillRect(-size * 0.2, size * 0.13, size * 0.4, size * 0.07);
    ctx.fillStyle = '#6f452c'; ctx.fillRect(-size * 0.045, size * 0.2, size * 0.09, size * 0.22);
    ctx.restore();
  });
}

for (const name of ['iron-pickaxe', 'gold-pickaxe', 'diamond-pickaxe']) {
  registerDrawer(`item:${name}`, (ctx, item, x, y, size) => {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.55);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(-size * 0.05, -size * 0.18, size * 0.1, size * 0.6);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = size * 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-size * 0.35, -size * 0.08);
    ctx.quadraticCurveTo(0, -size * 0.5, size * 0.35, -size * 0.08);
    ctx.stroke();
    ctx.restore();
  });
}

registerDrawer('item:door', (ctx, item, x, y, size) => {
  ctx.fillStyle = '#3a271b';
  ctx.fillRect(x - size * 0.3, y - size * 0.4, size * 0.6, size * 0.8);
  ctx.fillStyle = item.color;
  ctx.fillRect(x - size * 0.24, y - size * 0.34, size * 0.48, size * 0.68);
  ctx.fillStyle = '#353039';
  for (const offset of [-0.2, 0.18]) ctx.fillRect(x - size * 0.24, y + size * offset, size * 0.48, size * 0.06);
  ctx.fillStyle = '#ffe08a';
  ctx.fillRect(x + size * 0.1, y - size * 0.02, size * 0.07, size * 0.07);
});
