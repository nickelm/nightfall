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
  ctx.save(); ctx.translate(x, y);
  const ellipse = (cx, cy, rx, ry, color) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  const tower = (cx, cy, radius, height) => {
    ctx.fillStyle = '#a9b5b8'; ctx.fillRect(cx - radius, cy - height, radius * 2, height);
    ellipse(cx, cy, radius, radius * .4, '#adb8bb');
    ellipse(cx, cy - height, radius, radius * .4, '#f5f3e8');
    ctx.fillStyle = '#e9e9de'; ctx.fillRect(cx - radius, cy - height, radius * .7, height);
    ctx.fillStyle = '#485960'; ctx.fillRect(cx - radius * .15, cy - height * .7, radius * .3, height * .32);
    ctx.fillStyle = '#f8f5e7';
    for (const dx of [-.8, 0, .8]) ctx.fillRect(cx + dx * radius - radius * .18, cy - height - radius * .35, radius * .36, radius * .55);
  };
  // A mountain-backed, rising city silhouette rather than flat concentric rings.
  ctx.fillStyle = '#55616a'; ctx.beginPath(); ctx.moveTo(w*.23,h*.53);ctx.lineTo(w*.37,h*.06);ctx.lineTo(w*.47,h*.16);ctx.lineTo(w*.58,0);ctx.lineTo(w*.78,h*.51);ctx.closePath();ctx.fill();
  ctx.fillStyle = '#6e7b82'; ctx.beginPath();ctx.moveTo(w*.58,0);ctx.lineTo(w*.51,h*.46);ctx.lineTo(w*.78,h*.51);ctx.closePath();ctx.fill();
  for (let level = 0; level < 7; level++) {
    const rx = w * (.475 - level * .053), ry = h * (.095 - level * .008);
    const cy = h * (.81 - level * .096), face = h * .068;
    // Pale rampart faces, shadowed below each terrace, make the height readable.
    ellipse(w/2, cy + face, rx, ry, '#89999f');
    ctx.fillStyle = '#bdc7c8'; ctx.fillRect(w/2-rx, cy, rx*2, face);
    ellipse(w/2, cy + face*.78, rx, ry, '#d1d7d5');
    ellipse(w/2, cy, rx, ry, '#9ba9ad');
    // Small pitched roofs and houses occupy the terraces.
    const houses = Math.max(4, 16-level*2);
    for (let i=0;i<houses;i++) {
      const u=(i+.5)/houses, hx=w/2-rx*.86+rx*1.72*u;
      const hy=cy+ry*.72 + ((i%3)-1)*ry*.06, bw=Math.max(w*.012,rx*.07), bh=h*.024;
      ctx.fillStyle='#e9e9df';ctx.fillRect(hx-bw/2,hy,bw,bh);
      ctx.fillStyle='#677d87';ctx.beginPath();ctx.moveTo(hx-bw*.65,hy);ctx.lineTo(hx,hy-bh*.55);ctx.lineTo(hx+bw*.65,hy);ctx.closePath();ctx.fill();
    }
    ctx.strokeStyle='#f8f6e9';ctx.lineWidth=Math.max(1,tile*.055);
    ctx.beginPath();ctx.ellipse(w/2,cy,rx,ry,0,0,Math.PI);ctx.stroke();
    const merlons = Math.max(10, 38-level*4);
    for (let i=0;i<=merlons;i++) {
      const angle=i/merlons*Math.PI, px=w/2+Math.cos(angle)*rx, py=cy+Math.sin(angle)*ry;
      ctx.fillStyle='#f0f0e4';ctx.fillRect(px-w*.004,py-h*.012,w*.008,h*.022);
      if(i%3===1){ctx.fillStyle='#60737b';ctx.fillRect(px-w*.002,py+face*.34,w*.004,h*.019);}
    }
    tower(w/2-rx*.91,cy+ry*.35,w*.014,h*.06);
    tower(w/2+rx*.91,cy+ry*.35,w*.014,h*.06);
  }
  // The huge dark stone keel splits the tiers and points out toward the plain.
  ctx.fillStyle='#8c999e';ctx.beginPath();ctx.moveTo(w*.46,h*.17);ctx.lineTo(w*.55,h*.23);ctx.lineTo(w*.57,h*.70);ctx.lineTo(w*.51,h*.86);ctx.lineTo(w*.455,h*.59);ctx.closePath();ctx.fill();
  ctx.fillStyle='#b5bfbc';ctx.beginPath();ctx.moveTo(w*.46,h*.17);ctx.lineTo(w*.51,h*.42);ctx.lineTo(w*.51,h*.86);ctx.lineTo(w*.455,h*.59);ctx.closePath();ctx.fill();
  // Upper court and the unmistakable tall white tower of the citadel.
  ellipse(w*.5,h*.24,w*.12,h*.04,'#e8e9dd');
  tower(w*.5,h*.24,w*.022,h*.20);
  ctx.fillStyle='#f9f6e7';ctx.beginPath();ctx.moveTo(w*.475,h*.04);ctx.lineTo(w*.5,h*.005);ctx.lineTo(w*.525,h*.04);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#f7f4df';ctx.lineWidth=Math.max(1,tile*.035);ctx.beginPath();ctx.moveTo(w*.57,h*.25);ctx.lineTo(w*.57,h*.20);ctx.moveTo(w*.57,h*.22);ctx.lineTo(w*.55,h*.20);ctx.moveTo(w*.57,h*.22);ctx.lineTo(w*.59,h*.19);ctx.moveTo(w*.57,h*.215);ctx.lineTo(w*.565,h*.19);ctx.stroke();
  // The main gate is aligned with the actual entrance at the centre of the building.
  const gateY=h*.94;
  ctx.fillStyle='#e7e9df';ctx.fillRect(w*.455,gateY-h*.07,w*.09,h*.095);
  ctx.fillStyle='#34434b';ctx.beginPath();ctx.moveTo(w*.48,gateY+h*.025);ctx.lineTo(w*.48,gateY-h*.015);ctx.quadraticCurveTo(w*.5,gateY-h*.06,w*.52,gateY-h*.015);ctx.lineTo(w*.52,gateY+h*.025);ctx.closePath();ctx.fill();
  tower(w*.445,gateY,w*.021,h*.095);tower(w*.555,gateY,w*.021,h*.095);
  ctx.restore();
}
registerDrawer('roof:minas-tirith', city);
registerDrawer('item:rohan-hall', (ctx, item, x, y, size) => {
  ctx.fillStyle = '#b99459'; ctx.fillRect(x - size * .33, y, size * .66, size * .28);
  rohanRoof(ctx, x - size * .44, y - size * .32, size * .88, size * .4, size * .3);
});
registerDrawer('item:minas-tirith', (ctx, item, x, y, size) => city(ctx, x - size * .4, y - size * .36, size * .8, size * .7, size * .25));
