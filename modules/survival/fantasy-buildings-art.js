import { registerDrawer } from '../../shared/registry.js';

for (const name of ['rohan-hall', 'minas-tirith']) registerDrawer(name, () => {});
function timber(ctx, tile, x, y, size) {
  ctx.fillStyle = '#90713f'; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#ccb47b'; ctx.fillRect(x + size * .12, y + size * .13, size * .76, size * .65);
  ctx.strokeStyle = '#503a25'; ctx.lineWidth = size * .09;
  ctx.strokeRect(x + size * .07, y + size * .07, size * .86, size * .76);
  ctx.beginPath(); ctx.moveTo(x + size * .12, y + size * .13); ctx.lineTo(x + size * .88, y + size * .78); ctx.moveTo(x + size * .88, y + size * .13); ctx.lineTo(x + size * .12, y + size * .78); ctx.stroke();
  ctx.fillStyle = '#36543c'; ctx.fillRect(x + size * .36, y + size * .2, size * .28, size * .45);
  ctx.fillStyle = '#d9c68a'; ctx.fillRect(x + size * .47, y + size * .29, size * .06, size * .2);
  ctx.fillStyle = '#817b6d'; ctx.fillRect(x, y + size * .86, size, size * .14);
}
function timberFloor(ctx, tile, x, y, size) {
  ctx.fillStyle = '#aa804b'; ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#775430'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + size * i / 4); ctx.lineTo(x + size, y + size * i / 4); ctx.stroke(); }
}
for (const name of ['rohan-wall', 'hanok-wall']) registerDrawer(`tile:${name}`, timber);
for (const name of ['rohan-floor', 'hanok-floor']) registerDrawer(`tile:${name}`, timberFloor);
function rohanRoof(ctx, x, y, w, h, tile) {
  ctx.fillStyle = '#493927'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#9e8e4e'; ctx.fillRect(x + tile * .08, y + tile * .08, w - tile * .16, h - tile * .16);
  ctx.strokeStyle = '#c6b56d'; ctx.lineWidth = Math.max(1, tile * .035);
  for (let i = tile * .15; i < w; i += tile * .14) {
    ctx.beginPath(); ctx.moveTo(x + i, y + tile * .1); ctx.lineTo(x + i + tile * .08, y + h / 2); ctx.lineTo(x + i, y + h - tile * .1); ctx.stroke();
  }
  ctx.fillStyle = '#62482c'; ctx.fillRect(x, y + h / 2 - tile * .11, w, tile * .22);
  ctx.strokeStyle = '#e0bf6a'; ctx.lineWidth = Math.max(1, tile * .05);
  ctx.beginPath(); ctx.moveTo(x + tile * .2, y + h / 2); ctx.lineTo(x + w - tile * .2, y + h / 2); ctx.stroke();
  for (const side of [-1, 1]) {
    const end = side < 0 ? x + tile * .15 : x + w - tile * .15;
    ctx.beginPath(); ctx.moveTo(end, y + h / 2); ctx.quadraticCurveTo(end - side * tile * .4, y + h / 2 - tile * .55, end - side * tile * .6, y + h / 2 - tile * .25); ctx.stroke();
  }
  ctx.fillStyle = '#2e4b34'; ctx.fillRect(x + w / 2 - tile * .25, y + h / 2 + tile * .11, tile * .5, tile * .7);
  ctx.fillStyle = '#f2e5bb'; ctx.fillRect(x + w / 2 - tile * .04, y + h / 2 + tile * .23, tile * .08, tile * .35);
}
registerDrawer('roof:rohan-hall', rohanRoof);
registerDrawer('tile:white-city-wall', (ctx, tile, x, y, size) => {
  ctx.fillStyle = '#939eaa'; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#e4e6dd'; ctx.fillRect(x + size * .04, y + size * .13, size * .92, size * .82);
  ctx.strokeStyle = '#abb3ba'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + size * i / 4); ctx.lineTo(x + size, y + size * i / 4); ctx.stroke(); }
  ctx.fillStyle = '#f7f4df'; for (let i = 0; i < 3; i++) ctx.fillRect(x + i * size / 3, y, size * .22, size * .22);
});
registerDrawer('tile:white-city-floor', (ctx, tile, x, y, size) => {
  ctx.fillStyle = '#c8cecd'; ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#a5afb3'; ctx.lineWidth = 1; ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
  ctx.beginPath(); ctx.moveTo(x + size / 2, y); ctx.lineTo(x + size / 2, y + size); ctx.stroke();
});
function city(ctx, x, y, w, h, tile) {
  ctx.fillStyle = '#8e9eab'; ctx.fillRect(x, y, w, h);
  for (let ring = 0; ring < 7; ring++) {
    const scale = 1 - ring * .115;
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * .54, w * .48 * scale, h * .45 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = ring % 2 ? '#b6c1c7' : '#ced5d5'; ctx.fill();
    ctx.strokeStyle = '#f2f1e5'; ctx.lineWidth = tile * .14; ctx.stroke();
  }
  ctx.fillStyle = '#eaece3'; ctx.fillRect(x + w * .475, y + h * .4, w * .05, h * .59);
  ctx.fillStyle = '#faf9e8'; ctx.fillRect(x + w * .465, y + h * .08, w * .07, h * .38);
  ctx.fillStyle = '#8e9daa'; ctx.fillRect(x + w * .49, y + h * .13, w * .02, h * .22);
  ctx.fillStyle = '#d9bf72'; ctx.fillRect(x + w * .455, y + h * .07, w * .09, tile * .1);
  ctx.fillStyle = '#eefaff'; ctx.beginPath(); ctx.moveTo(x+w*.5,y+h*.01);ctx.lineTo(x+w*.52,y+h*.045);ctx.lineTo(x+w*.5,y+h*.08);ctx.lineTo(x+w*.48,y+h*.045);ctx.closePath();ctx.fill();
}
registerDrawer('roof:minas-tirith', city);
registerDrawer('item:rohan-hall', (ctx, item, x, y, size) => {
  ctx.fillStyle = '#b99459'; ctx.fillRect(x - size * .33, y, size * .66, size * .28);
  rohanRoof(ctx, x - size * .44, y - size * .32, size * .88, size * .4, size * .3);
});
registerDrawer('item:minas-tirith', (ctx, item, x, y, size) => city(ctx, x - size * .4, y - size * .36, size * .8, size * .7, size * .25));
