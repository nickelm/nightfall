// World, entity, lighting and HUD rendering. Owned by: Integration.
// Teams customize visuals through registerDrawer / registerHud, not here.
import { TILE_PX } from '../../shared/config.js';
import { registries } from '../../shared/registry.js';
import { safely } from '../../shared/safe.js';
import { THEME, font } from './theme.js';
import { drawSettings } from './settings.js';

const lightCanvas = document.createElement('canvas');
const lctx = lightCanvas.getContext('2d');
const fogCanvas = document.createElement('canvas'); // one pixel per tile, scaled up smoothly
const fctx = fogCanvas.getContext('2d');
const FOG_SEEN = 170;   // alpha over tiles seen before but not visible now
const FOG_UNSEEN = 255; // alpha over tiles never seen

function resetText(ctx) {
  ctx.font = font(14);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.globalAlpha = 1;
}

function defaultDrawer(ctx, e, sx, sy, size, game) {
  const def = registries.entityTypes.get(e.type)?.defaults;
  ctx.fillStyle = e.color || def?.color || '#ccc';
  ctx.beginPath();
  ctx.arc(sx, sy, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

export function render(game, ctx, w, h) {
  const T = TILE_PX;
  const me = game.me;
  const cam = game.camera;
  if (me) { cam.x = me.x; cam.y = me.y; }

  ctx.fillStyle = THEME.colors.night;
  ctx.fillRect(0, 0, w, h);
  if (!game.world) return drawStatus(ctx, w, h, 'Connecting...');

  // --- tiles ---
  const x0 = Math.floor(cam.x - w / 2 / T) - 1, x1 = Math.ceil(cam.x + w / 2 / T) + 1;
  const y0 = Math.floor(cam.y - h / 2 / T) - 1, y1 = Math.ceil(cam.y + h / 2 / T) + 1;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const tile = game.world.tile(tx, ty);
      if (!tile) continue;
      const px = Math.floor((tx - cam.x) * T + w / 2);
      const py = Math.floor((ty - cam.y) * T + h / 2);
      const drawer = registries.drawers.get(`tile:${tile.name}`);
      if (drawer) safely(`drawer tile:${tile.name}`, drawer, ctx, tile, px, py, T, tx, ty, game);
      else { ctx.fillStyle = tile.color; ctx.fillRect(px, py, T, T); }
    }
  }

  // Roofs lift for the local player inside, revealing the real walkable interior.
  for (const cabin of game.entities.values()) {
    if (cabin.type !== 'cabin') continue;
    if (me && me.x >= cabin.x - 1.5 && me.x < cabin.x + 1.5 &&
        me.y >= cabin.y - 0.5 && me.y < cabin.y + 1.5) continue;
    const x = (cabin.x - 2.5 - cam.x) * T + w / 2;
    const y = (cabin.y - 1.5 - cam.y) * T + h / 2;
    if (x > w || y > h || x + 5 * T < 0 || y + 3 * T < 0) continue;
    ctx.fillStyle = '#56352e'; ctx.fillRect(x - T * .08, y - T * .08, T * 5.16, T * 3.16);
    ctx.fillStyle = '#855544'; ctx.fillRect(x, y, T * 5, T * 3);
    ctx.strokeStyle = '#624033'; ctx.lineWidth = Math.max(1, T * .04);
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x, y + T * i / 2); ctx.lineTo(x + T * 5, y + T * i / 2); ctx.stroke(); }
    ctx.fillStyle = '#b07d5c'; ctx.fillRect(x, y + T * 1.46, T * 5, T * .08);
  }

  // --- entities, back to front (only what we can see) ---
  const list = [...game.entities.values()].sort((a, b) => a._ry - b._ry);
  for (const e of list) {
    if (e.id !== game.myId && !game.canSee(e._rx, e._ry)) continue;
    const sx = (e._rx - cam.x) * T + w / 2;
    const sy = (e._ry - cam.y) * T + h / 2;
    if (sx < -2 * T || sy < -2 * T || sx > w + 2 * T || sy > h + 2 * T) continue;
    const drawer = registries.drawers.get(e.type) || defaultDrawer;
    ctx.save();
    resetText(ctx);
    safely(`drawer ${e.type}`, drawer, ctx, e, sx, sy, T, game);
    ctx.restore();
  }

  // --- night: darkness with holes cut by entities that have `light` (radius in tiles) ---
  const { darkness } = game.timeOfDay();
  if (darkness > 0.01) {
    if (lightCanvas.width !== w || lightCanvas.height !== h) { lightCanvas.width = w; lightCanvas.height = h; }
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, w, h);
    lctx.fillStyle = `rgba(${THEME.nightTint.join(',')}, ${darkness})`;
    lctx.fillRect(0, 0, w, h);
    lctx.globalCompositeOperation = 'destination-out';
    for (const e of list) {
      if (!e.light) continue;
      const sx = (e._rx - cam.x) * T + w / 2, sy = (e._ry - cam.y) * T + h / 2;
      const r = e.light * T * (1 + 0.03 * Math.sin(performance.now() / 120 + e.id)); // slight flicker
      const g = lctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.85)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.fillRect(sx - r, sy - r, 2 * r, 2 * r);
    }
    ctx.drawImage(lightCanvas, 0, 0);

    // warm glow around each light, tinted by its lightColor (jack-o-lanterns, fires, torches)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22 * darkness;
    for (const e of list) {
      if (!e.light) continue;
      const sx = (e._rx - cam.x) * T + w / 2, sy = (e._ry - cam.y) * T + h / 2;
      const r = e.light * T * 0.9;
      if (sx < -r || sy < -r || sx > w + r || sy > h + r) continue;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, e.lightColor || THEME.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - r, sy - r, 2 * r, 2 * r);
    }
    ctx.restore();
  }

  // --- fog of war ---
  if (game.vision) {
    const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
    if (fogCanvas.width !== cols || fogCanvas.height !== rows) { fogCanvas.width = cols; fogCanvas.height = rows; }
    const img = fctx.createImageData(cols, rows);
    const { seen, visible } = game.vision;
    const W = game.world.w, fog = THEME.fog;
    const visibleRoofs = [...game.entities.values()].filter(cabin => {
      if (cabin.type !== 'cabin') return false;
      if (me && me.x >= cabin.x - 1.5 && me.x < cabin.x + 1.5 && me.y >= cabin.y - 0.5 && me.y < cabin.y + 1.5) return false;
      const x = Math.floor(cabin.x), y = Math.floor(cabin.y) + 2;
      return game.world.inBounds(x, y) && visible[y * W + x];
    });
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = x0 + c, ty = y0 + r, o = (r * cols + c) * 4;
        let a = FOG_UNSEEN;
        if (game.world.inBounds(tx, ty)) {
          const i = ty * W + tx;
          const roof = visibleRoofs.some(cabin => tx >= cabin.x - 2.5 && tx < cabin.x + 2.5 && ty >= cabin.y - 1.5 && ty < cabin.y + 1.5);
          a = visible[i] || roof ? 0 : seen[i] ? FOG_SEEN : FOG_UNSEEN;
        }
        img.data[o] = fog[0]; img.data[o + 1] = fog[1]; img.data[o + 2] = fog[2]; img.data[o + 3] = a;
      }
    }
    fctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fogCanvas, (x0 - cam.x) * T + w / 2, (y0 - cam.y) * T + h / 2, cols * T, rows * T);
  }

  // --- HUDs ---
  for (const hud of registries.huds) {
    ctx.save();
    resetText(ctx);
    safely(hud.name, hud.fn, ctx, game, w, h);
    ctx.restore();
  }
  ctx.save();
  drawCoreHud(ctx, game, w, h);
  ctx.restore();
  ctx.save();
  resetText(ctx);
  drawSettings(ctx, game, w, h);
  ctx.restore();
}

function drawCoreHud(ctx, game, w, h) {
  const tod = game.timeOfDay();
  const players = [...game.entities.values()].filter((e) => e.type === 'player');
  const C = THEME.colors;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.panel;
  ctx.fillRect(w - 190, 8, 182, 34 + players.length * 18);
  ctx.font = font(22, 'display');
  ctx.fillStyle = tod.isNight ? C.moon : C.pumpkin;
  ctx.fillText(`${tod.isNight ? 'Night' : 'Day'} ${tod.day}  ${tod.clock}`, w - 16, 12);
  ctx.font = font(14);
  ctx.fillStyle = C.bone;
  players.forEach((p, i) => ctx.fillText(`${p.name}${p.id === game.myId ? ' (you)' : ''}`, w - 16, 42 + i * 18));

  // key hints, wrapped onto as many lines as the screen width needs
  ctx.font = font(12);
  const lines = [''];
  for (const k of registries.keyHints) {
    const part = `${k.key} ${k.label}`;
    const next = lines[lines.length - 1] ? `${lines[lines.length - 1]}   ${part}` : part;
    if (ctx.measureText(next).width > w - 40 && lines[lines.length - 1]) lines.push(part);
    else lines[lines.length - 1] = next;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(239,230,210,0.6)';
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h - 8 - (lines.length - 1 - i) * 15));

  // notices (game.notify)
  game.notices = game.notices.filter((n) => n.until > performance.now());
  ctx.font = font(24, 'display');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  game.notices.slice(-4).forEach((n, i) => {
    ctx.globalAlpha = Math.min(1, (n.until - performance.now()) / 600);
    ctx.fillStyle = C.panel;
    const tw = ctx.measureText(n.text).width;
    ctx.fillRect(w / 2 - tw / 2 - 14, 12 + i * 36, tw + 28, 32);
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, w / 2, 29 + i * 36);
  });
  ctx.globalAlpha = 1;
  ctx.font = font(14);

  if (game.failedModules.length) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = C.blood;
    ctx.fillText(`Failed to load: ${game.failedModules.join(', ')} (see console)`, 10, h - 50);
  }
  if (!game.connected) drawStatus(ctx, w, h, 'Connection lost. Reconnecting...');
}

function drawStatus(ctx, w, h, text) {
  ctx.fillStyle = THEME.colors.panel;
  ctx.fillRect(0, h / 2 - 60, w, 110);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.colors.pumpkin;
  ctx.font = font(48, 'display');
  ctx.fillText('Nightfall', w / 2, h / 2 - 22);
  ctx.fillStyle = THEME.colors.bone;
  ctx.font = font(18);
  ctx.fillText(text, w / 2, h / 2 + 24);
}
