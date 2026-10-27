import { registerDrawer, onEvent } from '../../shared/registry.js';

function drawPortal(ctx, x, y, size) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#25354c'; ctx.beginPath(); ctx.ellipse(0, size * .16, size * .39, size * .25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#69e7ee'; ctx.lineWidth = size * .085; ctx.beginPath(); ctx.ellipse(0, -size * .04, size * .29, size * .38, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#8064ce'; ctx.beginPath(); ctx.ellipse(0, -size * .04, size * .23, size * .32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d8f9ff'; ctx.lineWidth = size * .025; ctx.beginPath(); ctx.arc(0, -size * .04, size * .12, .2, Math.PI * 1.7); ctx.stroke();
  ctx.restore();
}
registerDrawer('portal', (ctx, e, x, y, size) => drawPortal(ctx, x, y, size));
registerDrawer('item:portal', (ctx, item, x, y, size) => drawPortal(ctx, x, y, size * .9));
onEvent('net:portalMessage', (game, { text }) => game.notify(text, 4, game.theme.colors.candle));
