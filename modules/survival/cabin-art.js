import { registerDrawer, onEvent } from '../../shared/registry.js';

// Roofs are drawn above terrain by the renderer, while this entity supplies light.
registerDrawer('cabin', () => {});
registerDrawer('tile:cabin-floor', (ctx, tile, x, y, size) => {
  ctx.fillStyle = tile.color; ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#785338'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + size * i / 4); ctx.lineTo(x + size, y + size * i / 4); ctx.stroke(); }
});
registerDrawer('item:cabin', (ctx, item, x, y, size) => {
  ctx.fillStyle = '#a5784b'; ctx.fillRect(x - size * .3, y, size * .6, size * .3);
  ctx.fillStyle = '#663d30'; ctx.beginPath(); ctx.moveTo(x - size * .4, y); ctx.lineTo(x, y - size * .32); ctx.lineTo(x + size * .4, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#39291e'; ctx.fillRect(x - size * .07, y + size * .08, size * .14, size * .22);
});
onEvent('net:cabinMessage', (game, { text }) => game.notify(text, 4, game.theme.colors.candle));
