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
const CITY = { ink: '#201a29', mortar: '#58515f', stone: '#a8a1a6', light: '#d5cebc', face: '#736977', floor: '#79717c', roof: '#484452' };
registerDrawer('tile:white-city-wall', (ctx, tile, x, y, T, tx, ty, game) => {
  const connected = (dx,dy) => game?.world.tile(tx+dx,ty+dy)?.name === 'white-city-wall';
  const front = !connected(0,1), cap = front ? Math.round(T*.68) : T;
  ctx.fillStyle=CITY.mortar;ctx.fillRect(x,y,T,T);
  ctx.fillStyle=CITY.stone;
  for(let row=0;row<2;row++)for(let col=-1;col<3;col++){
    const left=Math.max(1,col*T/2+(row%2)*T/4+1),right=Math.min(T-1,col*T/2+(row%2)*T/4+T/2-1);
    if(right>left)ctx.fillRect(x+left,y+row*cap/2+1,right-left,cap/2-2);
  }
  ctx.fillStyle=CITY.light;ctx.fillRect(x+2,y+2,T-4,2);
  if(front){ctx.fillStyle=CITY.face;ctx.fillRect(x,y+cap,T,T-cap);ctx.fillStyle=CITY.mortar;ctx.fillRect(x,y+cap+Math.round((T-cap)/2),T,1);}
  ctx.strokeStyle=CITY.ink;ctx.lineWidth=2;
  for(const [dx,dy,x1,y1,x2,y2] of [[0,-1,0,0,T,0],[1,0,T,0,T,T],[0,1,0,T,T,T],[-1,0,0,0,0,T]])if(!connected(dx,dy)){ctx.beginPath();ctx.moveTo(x+x1,y+y1);ctx.lineTo(x+x2,y+y2);ctx.stroke();}
});
registerDrawer('tile:white-city-floor', (ctx, tile, x, y, T, tx, ty) => {
  ctx.fillStyle=(tx+ty)%2 ? '#89818b' : '#827a85';ctx.fillRect(x,y,T,T);
  ctx.strokeStyle='#69616f';ctx.lineWidth=1;ctx.strokeRect(x+1,y+1,T-2,T-2);
  ctx.beginPath();ctx.moveTo(x+T/2,y);ctx.lineTo(x+T/2,y+T);ctx.stroke();
  ctx.fillStyle='rgba(239,230,210,.12)';ctx.fillRect(x+3,y+3,T/3,1);
});
function paintCity(ctx, x, y, w, h, T) {
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.lineJoin='round';ctx.lineCap='square';
  const outline=Math.max(1,Math.round(T*.055));
  const polygon=(points,fill,stroke=CITY.ink,width=outline)=>{
    ctx.beginPath();points.forEach(([px,py],i)=>i?ctx.lineTo(Math.round(px),Math.round(py)):ctx.moveTo(Math.round(px),Math.round(py)));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
  };
  const arcPoints=(cx,cy,rx,ry)=>Array.from({length:25},(_,i)=>{const a=i/24*Math.PI;return [cx+Math.cos(a)*rx,cy+Math.sin(a)*ry];});
  const squareTower=(cx,cy,size)=>{
    const left=Math.round(cx-size/2),top=Math.round(cy-size/2),depth=Math.max(2,Math.round(size*.25));
    ctx.fillStyle=CITY.ink;ctx.fillRect(left-1,top-1,size+2,size+depth+2);
    ctx.fillStyle=CITY.face;ctx.fillRect(left,top+depth,size,size);
    ctx.fillStyle=CITY.stone;ctx.fillRect(left,top,size,size);
    ctx.fillStyle=CITY.light;ctx.fillRect(left+2,top+2,size-4,2);ctx.fillRect(left+2,top+2,2,size-4);
    ctx.fillStyle=CITY.roof;ctx.fillRect(left+size*.3,top+size*.3,size*.4,size*.4);
    ctx.fillStyle=CITY.light;for(let i=0;i<3;i++){ctx.fillRect(left+i*size/3,top,Math.max(2,size*.16),Math.max(2,size*.15));ctx.fillRect(left+i*size/3,top+size-Math.max(2,size*.15),Math.max(2,size*.16),Math.max(2,size*.15));}
  };
  // Plan-view stonework: the same chunky caps, south faces and ink as world tiles.
  const cx=w*.5,cy=h*.16;
  polygon([[w*.22,h*.03],[w*.77,h*.03],[w*.92,h*.28],[w*.98,h*.9],[w*.91,h*.98],[w*.08,h*.98],[w*.02,h*.9],[w*.08,h*.3]],CITY.floor);
  for(let tier=0;tier<7;tier++){
    const rx=w*(.47-tier*.052),ry=h*(.77-tier*.083),curve=arcPoints(cx,cy,rx,ry);
    const depth=Math.max(3,T*.18);
    polygon(curve.map(([px,py])=>[px,py+depth]),CITY.face);
    polygon(curve,tier%2?'#938a91':'#8a828d');
    ctx.save();ctx.beginPath();curve.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.clip();
    ctx.strokeStyle='rgba(32,26,41,.18)';ctx.lineWidth=1;
    for(let row=0;row<h/(T*.5);row++){
      const py=row*T*.5;ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(w,py);ctx.stroke();
      for(let col=0;col<w/T;col++){const px=col*T+(row%2)*T*.5;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px,py+T*.5);ctx.stroke();}
    }
    ctx.restore();
    ctx.beginPath();curve.forEach(([px,py],i)=>i?ctx.lineTo(Math.round(px),Math.round(py)):ctx.moveTo(Math.round(px),Math.round(py)));
    ctx.strokeStyle=CITY.ink;ctx.lineWidth=T*.22;ctx.stroke();
    ctx.strokeStyle=CITY.stone;ctx.lineWidth=T*.14;ctx.stroke();
    ctx.strokeStyle=CITY.light;ctx.lineWidth=Math.max(1,T*.035);ctx.stroke();
    const count=Math.max(8,28-tier*3);
    for(let i=0;i<=count;i++){
      const a=i/count*Math.PI,px=Math.round(cx+Math.cos(a)*rx),py=Math.round(cy+Math.sin(a)*ry),s=Math.max(2,Math.round(T*.13));
      ctx.fillStyle=CITY.ink;ctx.fillRect(px-s/2-1,py-s/2-1,s+2,s+2);ctx.fillStyle=CITY.light;ctx.fillRect(px-s/2,py-s/2,s,s);
    }
    squareTower(cx-rx,cy,T*.48);squareTower(cx+rx,cy,T*.48);
    // A few tile-scale slate roofs, instead of miniature buildings in perspective.
    if(tier<5)for(const side of [-1,1]){
      const px=cx+side*rx*.64,py=cy+ry*.66,bw=T*.7,bh=T*.45;
      polygon([[px-bw/2,py],[px,py-bh/2],[px+bw/2,py],[px,py+bh/2]],CITY.roof);
      ctx.strokeStyle='#81788b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px-bw/2,py);ctx.lineTo(px+bw/2,py);ctx.stroke();
    }
  }
  // Faceted rock, drawn like the natural boulders, with a pointed central spur.
  polygon([[w*.39,h*.01],[w*.59,h*.01],[w*.64,h*.23],[w*.55,h*.42],[w*.52,h*.84],[w*.45,h*.69],[w*.43,h*.28]],'#615c69');
  polygon([[w*.39,h*.01],[w*.49,h*.04],[w*.51,h*.39],[w*.52,h*.84],[w*.45,h*.69],[w*.43,h*.28]],'#817b87',null);
  ctx.strokeStyle='#a29aa4';ctx.lineWidth=outline;ctx.beginPath();ctx.moveTo(w*.41,h*.03);ctx.lineTo(w*.45,h*.27);ctx.lineTo(w*.48,h*.48);ctx.stroke();
  ctx.strokeStyle='#514b59';ctx.lineWidth=outline;
  for(const [px,py] of [[.46,.21],[.48,.36],[.49,.56],[.50,.67]]){ctx.beginPath();ctx.moveTo(w*px,h*py);ctx.lineTo(w*(px+.025),h*(py+.025));ctx.lineTo(w*(px+.01),h*(py+.08));ctx.stroke();}
  ctx.fillStyle='rgba(32,26,41,.2)';for(let i=0;i<12;i++)ctx.fillRect(w*(.46+(i%3)*.012),h*(.1+i*.05),Math.max(1,T*.04),Math.max(1,T*.04));
  // Citadel cap and long white tower, aligned to the world's top-down axis.
  squareTower(w*.5,h*.17,T*.9);
  polygon([[w*.48,h*.17],[w*.48,h*.03],[w*.52,h*.03],[w*.52,h*.17]],CITY.light);
  ctx.fillStyle=CITY.face;ctx.fillRect(w*.51,h*.04,w*.012,h*.12);
  polygon([[w*.47,h*.035],[w*.5,h*.005],[w*.53,h*.035],[w*.5,h*.055]],'#dfd6bf');
  // Gatehouse sits immediately above the real door in the southern wall.
  squareTower(w*.44,h*.92,T*.65);squareTower(w*.56,h*.92,T*.65);
  polygon([[w*.475,h*.89],[w*.525,h*.89],[w*.525,h*.985],[w*.475,h*.985]],CITY.stone);
  ctx.fillStyle=CITY.ink;ctx.fillRect(w*.488,h*.935,w*.024,h*.055);
  ctx.restore();
}
// Static architecture is rasterized once, like a sprite, instead of rebuilding
// hundreds of masonry paths for every frame. Bound cached variants on resize.
const citySprites = new Map();
function city(ctx, x, y, w, h, T) {
  const key = `${w}:${h}:${T}`;
  let sprite = citySprites.get(key);
  if (!sprite) {
    sprite = document.createElement('canvas'); sprite.width = Math.ceil(w); sprite.height = Math.ceil(h);
    paintCity(sprite.getContext('2d'), 0, 0, w, h, T);
    if (citySprites.size >= 4) citySprites.delete(citySprites.keys().next().value);
    citySprites.set(key, sprite);
  }
  ctx.drawImage(sprite, Math.round(x), Math.round(y));
}
registerDrawer('roof:minas-tirith', city);
registerDrawer('item:rohan-hall', (ctx, item, x, y, size) => {
  ctx.fillStyle = '#b99459'; ctx.fillRect(x - size * .33, y, size * .66, size * .28);
  rohanRoof(ctx, x - size * .44, y - size * .32, size * .88, size * .4, size * .3);
});
registerDrawer('item:minas-tirith', (ctx, item, x, y, size) => {
  ctx.save();ctx.translate(x,y);ctx.strokeStyle=CITY.ink;ctx.lineWidth=Math.max(1,size*.06);
  ctx.fillStyle=CITY.face;ctx.fillRect(-size*.34,-size*.06,size*.68,size*.37);
  for(const [dx,top,width] of [[-.3,-.18,.18],[-.09,-.4,.18],[.16,-.18,.18]]){
    ctx.fillStyle=CITY.stone;ctx.fillRect(dx*size,top*size,width*size,(.29-top)*size);ctx.strokeRect(dx*size,top*size,width*size,(.29-top)*size);
    ctx.fillStyle=CITY.light;ctx.fillRect((dx+.03)*size,(top+.03)*size,(width-.06)*size,size*.05);
  }
  ctx.fillStyle=CITY.ink;ctx.fillRect(-size*.055,size*.11,size*.11,size*.2);ctx.restore();
});
