import { registerDrawer } from '../../shared/registry.js';

registerDrawer('hanok', () => {});
registerDrawer('tile:hanok-wall', (ctx, tile, x, y, size) => {
  ctx.fillStyle = '#b0aaa0'; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#e8d9b5'; ctx.fillRect(x + size * .08, y + size * .08, size * .84, size * .75);
  ctx.strokeStyle = '#ac8d62'; ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(x + size * i / 5, y + size * .14); ctx.lineTo(x + size * i / 5, y + size * .76); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + size * .12, y + size * i / 6); ctx.lineTo(x + size * .88, y + size * i / 6); ctx.stroke();
  }
  ctx.fillStyle = '#68432e'; ctx.fillRect(x, y, size * .1, size * .86); ctx.fillRect(x + size * .9, y, size * .1, size * .86);
  ctx.fillRect(x, y, size, size * .09); ctx.fillRect(x, y + size * .77, size, size * .09);
});
registerDrawer('tile:hanok-floor', (ctx, tile, x, y, size) => {
  ctx.fillStyle = tile.color; ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#96683e'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + size * i / 4, y); ctx.lineTo(x + size * i / 4, y + size); ctx.stroke(); }
  ctx.strokeRect(x, y, size, size);
});

function roof(ctx, x, y, w, h, tile) {
  // Swept corners, grey ceramic tiles, and a raised horizontal ridge.
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y + tile * .45, x + w, y);
  ctx.lineTo(x + w - tile * .12, y + h / 2); ctx.lineTo(x + w, y + h);
  ctx.quadraticCurveTo(x + w / 2, y + h - tile * .45, x, y + h); ctx.lineTo(x + tile * .12, y + h / 2); ctx.closePath();
  ctx.fillStyle = '#35414c'; ctx.fill(); ctx.save(); ctx.clip();
  ctx.strokeStyle = '#7e8c93'; ctx.lineWidth = Math.max(1, tile * .035);
  for (let i = 0; i <= w; i += tile * .24) {
    ctx.beginPath(); ctx.moveTo(x + i, y); ctx.quadraticCurveTo(x + i + tile * .06, y + h / 4, x + i, y + h / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + i, y + h / 2); ctx.quadraticCurveTo(x + i - tile * .06, y + h * .75, x + i, y + h); ctx.stroke();
  }
  ctx.strokeStyle = '#26313a';
  for (let i = tile * .4; i < h; i += tile * .4) { ctx.beginPath(); ctx.moveTo(x, y + i); ctx.lineTo(x + w, y + i); ctx.stroke(); }
  ctx.fillStyle = '#a0adb0'; ctx.fillRect(x, y + h / 2 - tile * .08, w, tile * .16);
  ctx.fillStyle = '#596b76'; ctx.fillRect(x, y + h / 2 - tile * .02, w, tile * .04);
  ctx.restore();
}
registerDrawer('roof:hanok', roof);
registerDrawer('item:hanok', (ctx, item, x, y, size) => {
  ctx.fillStyle = '#e8d9b5'; ctx.fillRect(x - size * .33, y, size * .66, size * .28);
  ctx.fillStyle = '#68432e';
  for (const dx of [-.33, -.08, .08, .29]) ctx.fillRect(x + size * dx, y, size * .04, size * .28);
  roof(ctx, x - size * .45, y - size * .3, size * .9, size * .35, size * .3);
});
