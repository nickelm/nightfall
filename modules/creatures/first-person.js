// First-person view (first version): F2 or the Esc settings switch between the normal
// top-down view and a raycast view from your own eyes. Solid and opaque tiles are walls,
// the floor shows the tiles you stand on, entities are their usual drawers as billboards,
// and darkness, light and fog of war follow the same rules as the top-down view.
//
// Controls: click to capture the mouse, move it sideways to turn; W/S walk, A/D strafe.
// The player module aims at the mouse, so while this view is on we park the (virtual)
// mouse just ahead of the player: aiming, mining and placing then hit what you look at.
import { registries, registerClientSystem, registerHud, registerSetting } from '../../shared/registry.js';
import { saveSetting } from '../../client/core/settings.js';
import { safely } from '../../shared/safe.js';

registerSetting('view', { label: 'View (F2)', options: ['top', 'first'], default: 'top', names: { top: 'top-down', first: 'first person' } });

const FOV = 0.66;        // half-width of the camera plane: about 66 degrees
const MAX_DIST = 16;     // tiles; past this everything is fog
const AIM_AHEAD = 1.2;   // where the virtual mouse sits, in tiles ahead of the player
const TURN = 0.0035;     // radians per pixel of mouse movement
const RES_W = 320;       // width of the low-resolution scene buffer
const WORLD_OVERLAYS = ['/aim', '/target', '/redstone-placement', '/dynamite-blasts']; // earlier HUDs drawn in world space

const on = (game) => game.settings.view === 'first' && game.me && game.world;

// --- colors ---
const rgbCache = new Map();
function rgb(color) {
  let c = rgbCache.get(color);
  if (c) return c;
  let h = String(color || '#888').replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(color, c);
  return c;
}
const isWall = (t) => !!t && (t.solid || t.opaque);

// --- turning and the virtual mouse ---
function parkMouse(game) {
  const me = game.me, m = game.input.mouse;
  const p = game.worldToScreen(me.x + me.dir.x * AIM_AHEAD, me.y + me.dir.y * AIM_AHEAD);
  m.x = p.x; m.y = p.y; m.active = true;
}

const canvas = document.getElementById('game');
// Registered after input.js's own listener, so this runs second and wins.
canvas.addEventListener('mousemove', (ev) => {
  const game = window.game;
  if (!game || !on(game) || game.ui) return;
  if (document.pointerLockElement === canvas && ev.movementX) {
    const me = game.me, a = Math.atan2(me.dir.y, me.dir.x) + ev.movementX * TURN;
    me.dir = { x: Math.cos(a), y: Math.sin(a) };
  }
  parkMouse(game);
});
canvas.addEventListener('mousedown', () => {
  const game = window.game;
  if (game && on(game) && !game.ui && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});

registerClientSystem('first-person', (game) => {
  if (game.input.pressed('F2')) {
    saveSetting(game, 'view', game.settings.view === 'first' ? 'top' : 'first');
    game.notify(game.settings.view === 'first' ? 'First person: click to capture the mouse' : 'Top-down view', 2, game.theme.colors.candle);
  }
  if (!on(game)) {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    return;
  }
  if (game.ui) { if (document.pointerLockElement === canvas) document.exitPointerLock?.(); return; }
  parkMouse(game);
});

// --- light at a point: daylight, or the brightest light source reaching it ---
function lightAt(x, y, day, lights) {
  let b = day;
  for (const l of lights) {
    const d2 = (x - l.x) ** 2 + (y - l.y) ** 2;
    if (d2 >= l.r2) continue;
    const v = 1 - Math.sqrt(d2) / l.r;
    if (v > b) b = v;
  }
  return b;
}

// --- the scene ---
const buf = document.createElement('canvas');
const bctx = buf.getContext('2d');
let img = null;

registerHud('first-person', (ctx, game, w, h) => {
  if (!on(game)) return;
  const me = game.me, world = game.world, vis = game.vision;
  const RW = RES_W, RH = Math.max(60, Math.round((RES_W * h) / w));
  if (buf.width !== RW || buf.height !== RH) { buf.width = RW; buf.height = RH; img = null; }
  img ||= bctx.createImageData(RW, RH);
  const px = img.data;

  const { darkness } = game.timeOfDay();
  const day = 1 - darkness * 0.92;
  const lights = [];
  for (const e of game.entities.values()) {
    if (!e.light) continue;
    const r = e.light * 1.15;
    lights.push({ x: e._rx ?? e.x, y: e._ry ?? e.y, r, r2: r * r });
  }
  const fog = game.theme.colors.night, fogC = rgb(fog);
  const shadeOf = (tx, ty, dist, wx, wy) => {
    if (!world.inBounds(tx, ty)) return 0;
    const i = ty * world.w + tx;
    const seen = vis ? (vis.visible[i] ? 1 : vis.seen[i] ? 0.35 : 0) : 1;
    return seen * lightAt(wx, wy, day, lights) * Math.max(0, 1 - dist / MAX_DIST);
  };
  const put = (o, c, s) => {
    px[o] = c[0] * s + fogC[0] * (1 - s);
    px[o + 1] = c[1] * s + fogC[1] * (1 - s);
    px[o + 2] = c[2] * s + fogC[2] * (1 - s);
    px[o + 3] = 255;
  };

  const dx = me.dir.x, dy = me.dir.y;
  const rx = -dy * FOV, ry = dx * FOV; // camera plane: right of facing
  const half = RH / 2;

  // sky: dusk purple by day, night at night
  const skyDay = rgb('#6d5a8e'), skyNight = rgb('#120a20');
  for (let y = 0; y < half; y++) {
    const t = y / half, s = 1 - darkness;
    const c = [0, 1, 2].map((k) => (skyDay[k] * s + skyNight[k] * (1 - s)) * (0.6 + 0.4 * t));
    for (let x = 0; x < RW; x++) put((y * RW + x) * 4, c, 1);
  }

  // floor: cast each row of pixels onto the ground
  for (let y = Math.ceil(half); y < RH; y++) {
    const rowDist = half / (y - half + 0.5);
    let fx = me.x + rowDist * (dx - rx), fy = me.y + rowDist * (dy - ry);
    const sx = (rowDist * 2 * rx) / RW, sy = (rowDist * 2 * ry) / RW;
    for (let x = 0; x < RW; x++, fx += sx, fy += sy) {
      const tx = Math.floor(fx), ty = Math.floor(fy);
      const t = world.tile(tx, ty);
      const o = (y * RW + x) * 4;
      if (!t) { put(o, fogC, 1); continue; }
      const grain = ((tx * 7 + ty * 13) & 3) * 0.03; // a little checker so motion reads
      put(o, rgb(t.color), shadeOf(tx, ty, rowDist, fx, fy) * (0.85 + grain));
    }
  }

  // walls: one DDA ray per column
  const zbuf = new Float32Array(RW);
  for (let x = 0; x < RW; x++) {
    const cam = (2 * x) / RW - 1;
    const rdx = dx + rx * cam, rdy = dy + ry * cam;
    let mx = Math.floor(me.x), my = Math.floor(me.y);
    const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
    const stepX = rdx < 0 ? -1 : 1, stepY = rdy < 0 ? -1 : 1;
    let sdx = (rdx < 0 ? me.x - mx : mx + 1 - me.x) * ddx;
    let sdy = (rdy < 0 ? me.y - my : my + 1 - me.y) * ddy;
    let side = 0, dist = MAX_DIST, hit = null;
    while (true) {
      if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
      const d = side === 0 ? sdx - ddx : sdy - ddy;
      if (d > MAX_DIST) break;
      const t = world.tile(mx, my);
      if (!t) { dist = d; break; }
      if (isWall(t)) { hit = t; dist = d; break; }
    }
    zbuf[x] = dist;
    if (!hit) continue;
    const lineH = RH / Math.max(dist, 0.05);
    const y0 = Math.max(0, Math.floor(half - lineH / 2)), y1 = Math.min(RH, Math.ceil(half + lineH / 2));
    const wx = me.x + rdx * dist, wy = me.y + rdy * dist;
    // light the wall from the open side the ray came from
    const s = shadeOf(mx, my, dist, wx - stepX * 0.05 * (1 - side), wy - stepY * 0.05 * side) * (side ? 0.78 : 1);
    const c = rgb(hit.color);
    for (let y = y0; y < y1; y++) {
      const edge = y === y0 || y === y1 - 1 ? 0.7 : 1;
      put((y * RW + x) * 4, c, s * edge);
    }
  }

  bctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0, w, h);
  ctx.imageSmoothingEnabled = true;

  // entities: their usual drawers as billboards, far to near, hidden behind walls
  const sprites = [];
  for (const e of game.entities.values()) {
    if (e.id === game.myId || !registries.entityTypes.has(e.type)) continue;
    const ex = (e._rx ?? e.x) - me.x, ey = (e._ry ?? e.y) - me.y;
    const depth = ex * dx + ey * dy;
    if (depth < 0.2 || depth > MAX_DIST) continue;
    if (!game.canSee(e._rx ?? e.x, e._ry ?? e.y)) continue;
    const lateral = ex * -dy + ey * dx;
    const sx = (w / 2) * (1 + lateral / (depth * FOV));
    const col = Math.floor((sx / w) * RW);
    if (col < 0 || col >= RW || zbuf[col] < depth) continue;
    sprites.push({ e, depth, sx });
  }
  sprites.sort((a, b) => b.depth - a.depth);
  for (const { e, depth, sx } of sprites) {
    const size = (h / depth) * 0.9; // a tile seen at this depth
    const sy = h / 2 + h / (2 * depth) - size * 0.4;
    const drawer = registries.drawers.get(e.type);
    ctx.save();
    ctx.globalAlpha = Math.max(0.25, 1 - depth / MAX_DIST);
    if (drawer) safely(`first-person ${e.type}`, drawer, ctx, e, sx, sy, size, game);
    else {
      ctx.fillStyle = e.color || registries.entityTypes.get(e.type)?.defaults?.color || '#ccc';
      ctx.beginPath(); ctx.arc(sx, sy, size * 0.35, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Teams loaded before us (hotbar, inventory, hints) drew their HUDs under the scene:
  // draw the screen-space ones again on top. World-space overlays would be in the wrong place.
  for (const hud of registries.huds) {
    if (hud.name.endsWith('/first-person')) break;
    if (WORLD_OVERLAYS.some((n) => hud.name.endsWith(n))) continue;
    ctx.save();
    ctx.font = game.font(14); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.globalAlpha = 1;
    safely(hud.name, hud.fn, ctx, game, w, h);
    ctx.restore();
  }

  // crosshair and hint
  const C = game.theme.colors;
  ctx.strokeStyle = C.candle; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 8, h / 2); ctx.lineTo(w / 2 + 8, h / 2);
  ctx.moveTo(w / 2, h / 2 - 8); ctx.lineTo(w / 2, h / 2 + 8);
  ctx.stroke();
  if (document.pointerLockElement !== canvas) {
    ctx.font = game.font(16); ctx.textAlign = 'center'; ctx.fillStyle = C.bone;
    ctx.fillText('Click to look around with the mouse · F2 for top-down', w / 2, h / 2 + 24);
  }
});
