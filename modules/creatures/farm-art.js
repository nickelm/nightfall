import { onEvent, registerDrawer, registerHud } from '../../shared/registry.js';
import { ANIMALS } from './shared.js';

function ellipse(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

// Top-down animals, shared between world sprites, item icons, and occupied pens.
function drawAnimal(ctx, species, x, y, size) {
  const s = size;
  ctx.save();
  ctx.translate(x, y);
  ellipse(ctx, s * 0.04, s * 0.08, s * 0.34, s * 0.36, 'rgba(0,0,0,0.25)');
  for (const side of [-1, 1]) for (const row of [-1, 1]) {
    ellipse(ctx, side * s * 0.22, row * s * 0.17, s * 0.09, s * 0.1,
      species === 'cow' || species === 'sheep' ? '#514943' : species === 'chicken' ? '#d5a04c' : '#b5777a');
  }
  if (species === 'sheep') {
    for (const [dx, dy] of [[-0.18,-0.1],[0,-0.2],[0.18,-0.1],[-0.18,0.13],[0,0.2],[0.18,0.13],[0,0]])
      ellipse(ctx, dx*s, dy*s, s*0.16, s*0.17, '#eee8d9');
    ellipse(ctx, 0, -s*0.28, s*0.17, s*0.14, '#534b48');
    ellipse(ctx, -s*0.15, -s*0.28, s*0.09, s*0.05, '#534b48');
    ellipse(ctx, s*0.15, -s*0.28, s*0.09, s*0.05, '#534b48');
  } else if (species === 'chicken') {
    ellipse(ctx, 0, 0, s*0.23, s*0.29, '#f6ebd6');
    ellipse(ctx, -s*0.19, 0, s*0.10, s*0.18, '#e8dbc4');
    ellipse(ctx, s*0.19, 0, s*0.10, s*0.18, '#e8dbc4');
    ellipse(ctx, 0, -s*0.26, s*0.14, s*0.13, '#f6ebd6');
    ellipse(ctx, 0, -s*0.37, s*0.07, s*0.10, '#d74637');
    ellipse(ctx, 0, -s*0.33, s*0.06, s*0.06, '#edaa46');
  } else if (species === 'cow') {
    ellipse(ctx, 0, 0, s*0.28, s*0.34, '#e9e1d5');
    ellipse(ctx, -s*0.14, -s*0.08, s*0.12, s*0.13, '#403b3b');
    ellipse(ctx, s*0.12, s*0.15, s*0.11, s*0.12, '#403b3b');
    ellipse(ctx, 0, -s*0.29, s*0.19, s*0.16, '#e9e1d5');
    ellipse(ctx, -s*0.18, -s*0.33, s*0.07, s*0.07, '#c5b78d');
    ellipse(ctx, s*0.18, -s*0.33, s*0.07, s*0.07, '#c5b78d');
    ellipse(ctx, 0, -s*0.35, s*0.13, s*0.09, '#dbaaa6');
  } else {
    ellipse(ctx, 0, 0, s*0.28, s*0.34, '#eaa6a9');
    ellipse(ctx, -s*0.18, -s*0.29, s*0.10, s*0.08, '#d4878f');
    ellipse(ctx, s*0.18, -s*0.29, s*0.10, s*0.08, '#d4878f');
    ellipse(ctx, 0, -s*0.28, s*0.18, s*0.15, '#f1b9b8');
    ellipse(ctx, 0, -s*0.35, s*0.12, s*0.08, '#d78288');
    ellipse(ctx, -s*0.04, -s*0.35, s*0.018, s*0.018, '#633b3f');
    ellipse(ctx, s*0.04, -s*0.35, s*0.018, s*0.018, '#633b3f');
  }
  if (species !== 'chicken') {
    ellipse(ctx, -s*0.09, -s*0.25, s*0.025, s*0.025, '#2b2426');
    ellipse(ctx, s*0.09, -s*0.25, s*0.025, s*0.025, '#2b2426');
  }
  ctx.restore();
}

for (const species of Object.keys(ANIMALS)) {
  registerDrawer(species, (ctx, animal, x, y, size) => drawAnimal(ctx, species, x, y, size));
  registerDrawer(`item:${species}`, (ctx, item, x, y, size) => drawAnimal(ctx, species, x, y, size));
}

function drawPen(ctx, pen, x, y, size) {
  const s = size;
  ctx.save();
  ctx.fillStyle = '#47321f'; ctx.fillRect(x-s*0.47, y-s*0.43, s*0.94, s*0.86);
  ctx.fillStyle = '#927647'; ctx.fillRect(x-s*0.39, y-s*0.35, s*0.78, s*0.70);
  ctx.strokeStyle = 'rgba(240,206,120,0.30)'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(x-s*0.3+i*s*0.14, y+s*0.26);
    ctx.lineTo(x-s*0.24+i*s*0.14, y-s*0.22); ctx.stroke();
  }
  if (pen.animal && ANIMALS[pen.animal]) drawAnimal(ctx, pen.animal, x, y, s*0.72);
  ctx.strokeStyle = '#bc8954'; ctx.lineWidth = Math.max(2, s*0.085);
  ctx.strokeRect(x-s*0.43, y-s*0.40, s*0.86, s*0.80);
  ctx.fillStyle = '#644224';
  for (const dx of [-0.42, 0.42]) for (const dy of [-0.39, 0.39])
    ctx.fillRect(x+dx*s-s*0.06, y+dy*s-s*0.06, s*0.12, s*0.12);
  ctx.restore();
}

registerDrawer('animal-pen', (ctx, pen, x, y, size) => drawPen(ctx, pen, x, y, size));
registerDrawer('item:animal-pen', (ctx, item, x, y, size) => drawPen(ctx, {}, x, y, size));

for (const [name, color] of [['truffle','#755341'],['wool','#f2eadb'],['egg','#f7e8bf'],['milk','#e8f0ed']]) {
  registerDrawer(`item:${name}`, (ctx, item, x, y, size) => {
    ctx.save();
    if (name === 'milk') {
      ctx.fillStyle = '#9cb5b9'; ctx.fillRect(x-size*0.17, y-size*0.36, size*0.34, size*0.72);
      ctx.fillStyle = color; ctx.fillRect(x-size*0.13, y-size*0.26, size*0.26, size*0.52);
      ctx.fillStyle = '#684e34'; ctx.fillRect(x-size*0.12, y-size*0.41, size*0.24, size*0.07);
    } else {
      ellipse(ctx, x, y, size*(name === 'egg' ? 0.22 : 0.30), size*(name === 'egg' ? 0.32 : 0.25), color);
      if (name === 'wool') for (const dx of [-0.16, 0, 0.16]) ellipse(ctx, x+dx*size, y-size*0.1, size*0.14, size*0.14, color);
      if (name === 'truffle') for (const dx of [-0.12, 0.12]) ellipse(ctx, x+dx*size, y-size*0.04, size*0.06, size*0.06, '#ab8261');
    }
    ctx.restore();
  });
}

onEvent('net:animalMessage', (game, { text }) => game.notify(text, 4, game.theme.colors.candle));

registerHud('animal-pen-info', (ctx, game, w) => {
  if (!game.me || game.ui) return;
  const tile = game.targetTile(2);
  const pen = [...game.entities.values()].find(e => e.type === 'animal-pen' &&
    Math.floor(e.x) === tile.x && Math.floor(e.y) === tile.y);
  if (!pen) return;
  const animal = ANIMALS[pen.animal];
  const line1 = animal
    ? `${pen.animal}  ·  growth ${Math.floor(pen.growth * 100)}%  ·  feed ${Math.ceil(pen.feed)}s  ·  ${animal.product} ${pen.stock}`
    : 'Empty animal pen';
  const line2 = animal
    ? 'Pumpkin + right-click: feed  ·  Empty hand + right-click: collect / retrieve'
    : 'Hold a caught animal to house it  ·  Empty hand: pick up the pen';
  const width = Math.min(w - 24, 540), x = (w - width) / 2;
  ctx.fillStyle = game.theme.colors.panel; ctx.fillRect(x, 88, width, 50);
  ctx.strokeStyle = game.theme.colors.pumpkin; ctx.strokeRect(x, 88, width, 50);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = game.theme.colors.candle; ctx.font = game.font(16); ctx.fillText(line1, w/2, 104);
  ctx.fillStyle = game.theme.colors.bone; ctx.font = game.font(13); ctx.fillText(line2, w/2, 124, width-12);
});
