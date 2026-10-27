import { registerDrawer, registerHud } from '../../shared/registry.js';

registerHud('lava-hint', (ctx, game, w) => {
  if (!game.me || game.ui) return;
  const target = game.targetTile(2.2);
  if (game.world.tile(target.x, target.y)?.name !== 'lava-ore') return;
  const width = Math.min(w - 24, 500), x = (w - width) / 2;
  ctx.save(); ctx.fillStyle = game.theme.colors.panel; ctx.fillRect(x, 145, width, 28);
  ctx.strokeStyle = game.theme.colors.pumpkin; ctx.strokeRect(x, 145, width, 28);
  ctx.fillStyle = game.theme.colors.candle; ctx.font = game.font(14);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Lava vein: mine with a diamond or obsidian pickaxe', w / 2, 159, width - 14);
  ctx.restore();
});

registerDrawer('item:obsidian', (ctx, item, x, y, size) => {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#35264d';
  ctx.beginPath(); ctx.moveTo(-size * 0.3, size * 0.18); ctx.lineTo(-size * 0.18, -size * 0.3);
  ctx.lineTo(size * 0.15, -size * 0.36); ctx.lineTo(size * 0.34, 0);
  ctx.lineTo(size * 0.15, size * 0.3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = item.color; ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.beginPath(); ctx.moveTo(-size * 0.18, -size * 0.18); ctx.lineTo(size * 0.12, -size * 0.26); ctx.lineTo(0, size * 0.1); ctx.stroke();
  ctx.restore();
});

for (const kind of ['pickaxe', 'axe', 'sword']) registerDrawer(`item:obsidian-${kind}`, (ctx, item, x, y, size) => {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.55);
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-size * 0.05, -size * 0.2, size * 0.1, size * 0.62);
  ctx.fillStyle = item.color; ctx.strokeStyle = item.color;
  if (kind === 'pickaxe') {
    ctx.lineWidth = size * 0.12; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(-size * 0.35, -size * 0.08); ctx.quadraticCurveTo(0, -size * 0.5, size * 0.35, -size * 0.08); ctx.stroke();
  } else if (kind === 'axe') {
    ctx.beginPath(); ctx.moveTo(0, -size * 0.3); ctx.lineTo(size * 0.3, -size * 0.38);
    ctx.lineTo(size * 0.32, -size * 0.04); ctx.lineTo(0, -size * 0.12); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(0, -size * 0.45); ctx.lineTo(size * 0.12, -size * 0.28);
    ctx.lineTo(size * 0.09, size * 0.16); ctx.lineTo(-size * 0.09, size * 0.16);
    ctx.lineTo(-size * 0.12, -size * 0.28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9b7439'; ctx.fillRect(-size * 0.2, size * 0.13, size * 0.4, size * 0.07);
  }
  ctx.restore();
});
