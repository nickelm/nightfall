// TEAM ART & SOUND (client): every sprite is drawn in code (no image files,
// no licensing questions) and every sound is synthesized with WebAudio.
// The camera looks straight down: characters rotate freely toward where they
// aim, and trees and rocks are seen from above. Replace and extend freely;
// anything without a drawer falls back to a circle.
// Art direction: Halloween. Pumpkin orange, candle yellow, bone, and violet on a
// purple-black night; use game.theme.colors and game.font() (client/core/theme.js).
import { registries, registerDrawer, registerHud, registerClientSystem, onEvent } from '../../shared/registry.js';
import { hash2, valueNoise } from '../../shared/rng.js';
import { TILE_PX } from '../../shared/config.js';
import './minimap.js';
import './indicators.js';
import './touch.js';

const now = () => performance.now();
const flashing = (e) => (e._flashUntil || 0) > now();
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

// ------------------------------------------------------------- the look ----
// One ink outline around every sprite and solid block, light from the top left,
// shadows to the bottom right, and an autumn palette: this is what makes five
// teams' content read as one game. New art should use INK, outline() and shadow().

const INK = '#1a0f22';
const TAU = Math.PI * 2;
function outline(ctx, w = 2) { ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.stroke(); } // strokes the current path
function blob(ctx, x, y, rx, ry, color, w = 2) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  outline(ctx, w);
}
function shadow(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(10,4,16,0.3)';
  ctx.beginPath(); ctx.ellipse(x + 3, y + 4, r, r * 0.8, 0, 0, TAU); ctx.fill();
}
// A fallen leaf: a diamond of length 2s along angle a.
function leaf(ctx, x, y, s, color, a) {
  const c = Math.cos(a) * s, sn = Math.sin(a) * s;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - c, y - sn); ctx.lineTo(x - sn * 0.45, y + c * 0.45); ctx.lineTo(x + c, y + sn); ctx.lineTo(x + sn * 0.45, y - c * 0.45);
  ctx.fill();
}
// A little bone: on beaches, and inside slimes.
function bone(ctx, x, y, s, a, color) {
  const c = Math.cos(a) * s, sn = Math.sin(a) * s;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.5;
  ctx.beginPath(); ctx.moveTo(x - c, y - sn); ctx.lineTo(x + c, y + sn); ctx.stroke();
  ctx.fillStyle = color;
  for (const k of [-1, 1]) {
    circle(ctx, x + k * c - sn * 0.3, y + k * sn + c * 0.3, s * 0.32);
    circle(ctx, x + k * c + sn * 0.3, y + k * sn - c * 0.3, s * 0.32);
  }
}

// ---------------------------------------------------------------- tiles ----
// Tile drawers run for about a thousand tiles every frame: only fills and short
// paths here, no gradients. The last argument, `game`, gives the neighbors, which
// lets rocks, walls, and shores join up instead of showing the grid.

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];             // sides: top, right, bottom, left
const ROCK = new Set(['stone', ...registries.tiles.filter((t) => t.oreColor).map((t) => t.name)]); // stone and every ore
const WALL = new Set(['wood-wall', 'stone-block', 'door-closed', 'door-open', 'glass']);
const GRASSY = new Set(['grass', 'tree', 'pumpkin']);
const TALL = new Set([...ROCK, 'wood-wall', 'stone-block', 'door-closed']); // cast a shadow onto the ground

const neighbor = (game, tx, ty) => game?.world.tile(tx, ty)?.name;
/** Bit mask of the sides whose neighbor is not in `set`: 1 top, 2 right, 4 bottom, 8 left. */
function openSides(game, tx, ty, set) {
  let m = 0;
  for (let s = 0; s < 4; s++) if (!set.has(neighbor(game, tx + DX[s], ty + DY[s]))) m |= 1 << s;
  return m;
}
function edgeRect(ctx, s, px, py, T, d) {
  if (s === 0) ctx.fillRect(px, py, T, d);
  else if (s === 1) ctx.fillRect(px + T - d, py, d, T);
  else if (s === 2) ctx.fillRect(px, py + T - d, T, d);
  else ctx.fillRect(px, py, d, T);
}
function edgeTo(ctx, s, px, py, T, u, d) { // point u (0..1) along side s, d pixels inward
  ctx.lineTo(s === 1 ? px + T - d : s === 3 ? px + d : px + u * T, s === 0 ? py + d : s === 2 ? py + T - d : py + u * T);
}

// Tall neighbors above and to the left cast a soft shadow onto this tile.
function contactShadow(ctx, game, px, py, T, tx, ty) {
  ctx.fillStyle = 'rgba(10,4,16,0.22)';
  if (TALL.has(neighbor(game, tx, ty - 1))) ctx.fillRect(px, py, T, T * 0.16);
  if (TALL.has(neighbor(game, tx - 1, ty))) ctx.fillRect(px, py, T * 0.12, T);
}

// Grass creeping over the edges this tile shares with grassy neighbors.
function fringe(ctx, game, px, py, T, tx, ty) {
  for (let s = 0; s < 4; s++) {
    if (!GRASSY.has(neighbor(game, tx + DX[s], ty + DY[s]))) continue;
    ctx.fillStyle = GROUND;
    ctx.beginPath();
    edgeTo(ctx, s, px, py, T, 0, 0);
    for (let k = 0; k < 6; k++) {
      edgeTo(ctx, s, px, py, T, (k + 0.5) / 6, 2 + hash2(tx * 3 + k, ty * 5 + s, 13) * 5);
      edgeTo(ctx, s, px, py, T, (k + 1) / 6, 1);
    }
    edgeTo(ctx, s, px, py, T, 1, 0);
    ctx.fill();
  }
}

function speckle(ctx, px, py, T, tx, ty, color, n) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(px + hash2(tx * 7 + i, ty * 3) * (T - 3), py + hash2(ty * 5 - i, tx * 11) * (T - 3), 3, 3);
}

const GRASS = ['#3b6632', '#3f6b35', '#43703a'];          // close shades in smooth patches, so the grid does not show
const GROUND = GRASS[1];                                    // the grass under trees, rocks, and pumpkins
const AUTUMN = ['#c8641e', '#a8321c', '#d89a2a'];

function grass(ctx, px, py, T, tx, ty, game, detail = true) {
  const n = valueNoise(tx / 5, ty / 5, 3), v = hash2(tx, ty, 77);
  ctx.fillStyle = GRASS[n < 0.4 ? 0 : n < 0.62 ? 1 : 2];
  ctx.fillRect(px, py, T, T);
  if (!detail) return;
  for (let i = 0; i < 3; i++) {                             // tufts of three blades
    const x = px + 3 + hash2(tx * 7 + i, ty * 3, 1) * (T - 12), y = py + 5 + hash2(ty * 5 - i, tx * 11, 2) * (T - 12);
    ctx.fillStyle = '#33602b';
    ctx.fillRect(x, y + 1, 2, 5); ctx.fillRect(x + 3, y - 1, 2, 7); ctx.fillRect(x + 6, y + 2, 2, 4);
    ctx.fillStyle = '#5a8a45';
    ctx.fillRect(x + 3, y - 1, 2, 2);
  }
  const ax = px + T * (0.2 + hash2(tx, ty, 5) * 0.6), ay = py + T * (0.2 + hash2(ty, tx, 6) * 0.6);
  if (v > 0.9) leaf(ctx, ax, ay, T * 0.08, AUTUMN[(hash2(tx, ty, 7) * 3) | 0], v * 40);
  else if (v < 0.012) {                                     // a toadstool seen from above
    ctx.fillStyle = INK; circle(ctx, ax, ay, T * 0.1 + 1.5);
    ctx.fillStyle = '#a8321c'; circle(ctx, ax, ay, T * 0.1);
    ctx.fillStyle = '#efe6d2'; ctx.fillRect(ax - 3, ay - 2, 2, 2); ctx.fillRect(ax + 1, ay + 1, 2, 2);
  } else if (v < 0.05) {                                    // pale ghost flowers
    ctx.fillStyle = '#e4d8f0';
    for (let i = 0; i < 3; i++) ctx.fillRect(ax + i * 5 - 5, ay + (i % 2) * 4, 3, 3);
  }
  contactShadow(ctx, game, px, py, T, tx, ty);
}

registerDrawer('tile:grass', (ctx, tile, px, py, T, tx, ty, game) => grass(ctx, px, py, T, tx, ty, game));

registerDrawer('tile:sand', (ctx, tile, px, py, T, tx, ty, game) => {
  ctx.fillStyle = tile.color;
  ctx.fillRect(px, py, T, T);
  ctx.strokeStyle = 'rgba(120,90,40,0.28)';                 // wind ripples
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const y = py + T * (0.3 + i * 0.4) + hash2(tx, ty + i, 31) * 4, x = px + T * (0.1 + hash2(ty, tx + i, 32) * 0.2);
    ctx.moveTo(x, y); ctx.quadraticCurveTo(x + T * 0.3, y - 4, x + T * 0.6, y);
  }
  ctx.stroke();
  speckle(ctx, px, py, T, tx, ty, 'rgba(120,90,40,0.18)', 3);
  if (hash2(tx, ty, 33) > 0.96) bone(ctx, px + T / 2, py + T / 2, T * 0.12, hash2(tx, ty, 34) * 6, '#e6dcc4');
  fringe(ctx, game, px, py, T, tx, ty);
  contactShadow(ctx, game, px, py, T, tx, ty);
});

registerDrawer('tile:gravel', (ctx, tile, px, py, T, tx, ty, game) => {
  ctx.fillStyle = tile.color;
  ctx.fillRect(px, py, T, T);
  for (let i = 0; i < 6; i++) {                             // pebbles, lit from the top left
    const x = px + 4 + hash2(tx * 7 + i, ty * 3, 41) * (T - 8), y = py + 4 + hash2(ty * 5 - i, tx * 11, 42) * (T - 8), r = 1.5 + hash2(tx + i, ty, 43) * 2.5;
    ctx.fillStyle = '#3e3a36'; circle(ctx, x + 1, y + 1, r);
    ctx.fillStyle = i % 2 ? '#7a746c' : '#6b655e'; circle(ctx, x, y, r);
  }
  fringe(ctx, game, px, py, T, tx, ty);
  contactShadow(ctx, game, px, py, T, tx, ty);
});

registerDrawer('tile:water', (ctx, tile, px, py, T, tx, ty, game) => {
  ctx.fillStyle = tile.color;
  ctx.fillRect(px, py, T, T);
  const t = now() / 900;
  ctx.fillStyle = 'rgba(200,225,255,0.13)';                 // drifting ripples
  for (let i = 0; i < 2; i++) {
    const off = Math.sin(t + tx * 0.7 + ty * 1.3 + i * 2) * 4;
    ctx.fillRect(px + T * (0.1 + 0.45 * hash2(tx, ty, i)) + off, py + T * (0.25 + i * 0.45), T * 0.28, 2);
  }
  for (let s = 0; s < 4; s++) {                             // shallows and foam along the shore
    const n = neighbor(game, tx + DX[s], ty + DY[s]);
    if (!n || n === 'water') continue;
    ctx.fillStyle = '#3a72aa'; edgeRect(ctx, s, px, py, T, T * 0.3);
    ctx.fillStyle = '#4a88bf'; edgeRect(ctx, s, px, py, T, T * 0.14);
    ctx.fillStyle = 'rgba(230,242,255,0.75)'; edgeRect(ctx, s, px, py, T, 2.5 + 1.5 * Math.sin(t * 2 + tx + ty * 0.7 + s));
  }
});

// Trees from above: a canopy of lobes in one of four autumn palettes (rim, body, light), or bare.
const CANOPY = [
  ['#1b3518', '#24461f', '#2f5a28'],
  ['#2c3f16', '#3d5420', '#4f6a2a'],
  ['#6e3210', '#a24d16', '#d0742a'],
  ['#5a1712', '#8a2a1c', '#b0402a'],
];

registerDrawer('tile:tree', (ctx, tile, px, py, T, tx, ty, game) => {
  grass(ctx, px, py, T, tx, ty, game, false);
  const cx = px + T / 2, cy = py + T / 2 - 1, v = hash2(tx, ty, 9);
  ctx.fillStyle = 'rgba(10,4,16,0.35)';                     // shadow
  circle(ctx, cx + 4, cy + 5, T * 0.42);
  if (v > 0.88) {                                           // a dead tree: crooked bare branches
    for (const [color, width] of [[INK, 5], ['#4a3a2e', 3]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = v * 40 + i * 1.26, r = T * (0.28 + hash2(tx + i, ty, 4) * 0.14), k = (hash2(tx, ty + i, 8) - 0.5) * 0.8;
        const mx = cx + Math.cos(a) * r * 0.55, my = cy + Math.sin(a) * r * 0.55;
        ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.lineTo(cx + Math.cos(a + k) * r, cy + Math.sin(a + k) * r);
        ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a - 0.9) * r * 0.35, my + Math.sin(a - 0.9) * r * 0.35);
      }
      ctx.stroke();
    }
    blob(ctx, cx, cy, T * 0.1, T * 0.1, '#4a3a2e');
    return;
  }
  const [rim, body, light] = CANOPY[v < 0.36 ? 0 : v < 0.6 ? 1 : v < 0.77 ? 2 : 3];
  if (v >= 0.6) for (let i = 0; i < 2; i++) leaf(ctx, px + T * (0.15 + 0.7 * hash2(tx + i, ty, 10)), py + T * 0.88, T * 0.06, body, i * 2 + v * 9);
  for (let pass = 0; pass < 3; pass++) {                    // ink, then rim, then the sunlit body
    ctx.fillStyle = pass === 0 ? INK : pass === 1 ? rim : body;
    for (let i = 0; i < 5; i++) {
      const a = v * 6 + i * 1.257, r = T * (0.2 + hash2(tx + i, ty, 11) * 0.05);
      const shift = pass === 2 ? -T * 0.04 : 0;
      circle(ctx, cx + Math.cos(a) * T * 0.16 + shift, cy + Math.sin(a) * T * 0.16 + shift, pass === 0 ? r + 2 : pass === 1 ? r : r * 0.78);
    }
  }
  ctx.fillStyle = light;                                    // sun from the top left
  circle(ctx, cx - T * 0.13, cy - T * 0.12, T * 0.11);
  circle(ctx, cx + T * 0.04, cy - T * 0.2, T * 0.06);
});

// Rocks join with rocky neighbors into one mass: an ink rim and a cliff face only on open sides.
const OUTER = [], INNER = [];                               // roundRect corner radii for each open-side mask
for (let m = 0; m < 16; m++) {
  const k = [(m & 9) === 9, (m & 3) === 3, (m & 6) === 6, (m & 12) === 12]; // top-left, top-right, bottom-right, bottom-left
  OUTER.push(k.map((on) => (on ? 10 : 0)));
  INNER.push(k.map((on) => (on ? 8 : 0)));
}

function rock(ctx, px, py, T, tx, ty, game) {
  const m = openSides(game, tx, ty, ROCK), t = m & 1, r = m & 2, b = m & 4, l = m & 8;
  if (m) grass(ctx, px, py, T, tx, ty, game, false);
  const x0 = px + (l ? 3 : 0), x1 = px + T - (r ? 3 : 0), y0 = py + (t ? 2 : 0), y1 = py + T - (b ? 1 : 0);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, OUTER[m]); ctx.fill();
  const i0 = x0 + (l ? 2 : 0), i1 = x1 - (r ? 2 : 0), j0 = y0 + (t ? 2 : 0), j1 = y1 - (b ? 2 : 0), k1 = j1 - (b ? T * 0.28 : 0);
  ctx.fillStyle = '#3e3a48';                                // cliff face
  ctx.beginPath(); ctx.roundRect(i0, j0, i1 - i0, j1 - j0, INNER[m]); ctx.fill();
  ctx.fillStyle = '#75707e';                                // top
  ctx.beginPath(); ctx.roundRect(i0, j0, i1 - i0, k1 - j0, INNER[m]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  if (t) ctx.fillRect(i0 + (l ? 5 : 0), j0, i1 - i0 - (l ? 5 : 0) - (r ? 5 : 0), 2);
  if (l) ctx.fillRect(i0, j0 + (t ? 5 : 0), 2, k1 - j0 - (t ? 5 : 0) - (b ? 5 : 0));
  if (b) {
    ctx.fillStyle = 'rgba(10,4,16,0.4)';                    // ledge and strata on the cliff
    ctx.fillRect(i0 + (l ? 4 : 0), k1 - 1, i1 - i0 - (l ? 4 : 0) - (r ? 4 : 0), 2);
    for (let i = 0; i < 3; i++) ctx.fillRect(px + T * (0.2 + 0.25 * i + hash2(tx + i, ty, 3) * 0.1), k1 + 3, 1.5, T * 0.16);
  }
  speckle(ctx, px + 3, py + 3, T - 8, tx, ty, 'rgba(10,4,16,0.22)', 3);
  ctx.strokeStyle = 'rgba(10,4,16,0.35)';                   // a crack
  ctx.lineWidth = 1;
  ctx.beginPath();
  const a = hash2(tx, ty, 3);
  ctx.moveTo(px + T * (0.25 + a * 0.4), py + T * 0.22);
  ctx.lineTo(px + T * 0.5, py + T * (0.4 + a * 0.15));
  ctx.lineTo(px + T * (0.65 - a * 0.3), py + T * 0.6);
  ctx.stroke();
}

registerDrawer('tile:stone', (ctx, tile, px, py, T, tx, ty, game) => rock(ctx, px, py, T, tx, ty, game));

// A cut gem or nugget: shared by ore veins and the ore items.
function gem(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.9, y - s * 0.1); ctx.lineTo(x + s * 0.2, y + s); ctx.lineTo(x - s * 0.85, y + s * 0.2);
  ctx.closePath(); ctx.fill();
  outline(ctx, Math.max(1.5, s * 0.18));
  ctx.fillStyle = 'rgba(10,4,16,0.25)';                     // shaded lower facet
  ctx.beginPath(); ctx.moveTo(x + s * 0.9, y - s * 0.1); ctx.lineTo(x + s * 0.2, y + s); ctx.lineTo(x - s * 0.1, y + s * 0.05); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(x - s * 0.35, y - s * 0.35, Math.max(2, s * 0.3), Math.max(2, s * 0.3));
}

for (const ore of registries.tiles.filter((t) => t.oreColor)) {
  registerDrawer(`tile:${ore.name}`, (ctx, tile, px, py, T, tx, ty, game) => {
    rock(ctx, px, py, T, tx, ty, game);
    if (tile.name === 'lava-ore') {                               // molten cracks glowing through the rock
      for (const [color, width] of [['#ff681c', 3.5], ['#ffe08a', 1.5]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(px + T * 0.15, py + T * (0.3 + hash2(tx, ty, 97) * 0.3));
        ctx.lineTo(px + T * 0.4, py + T * 0.45); ctx.lineTo(px + T * 0.55, py + T * 0.25); ctx.lineTo(px + T * 0.85, py + T * (0.35 + hash2(ty, tx, 98) * 0.2));
        ctx.moveTo(px + T * 0.4, py + T * 0.45); ctx.lineTo(px + T * 0.45, py + T * 0.62);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 4; i++) {
      gem(ctx, px + T * (0.22 + hash2(tx + i * 3, ty, 43) * 0.56), py + T * (0.2 + hash2(tx, ty + i * 5, 51) * 0.42), T * 0.08, tile.oreColor);
    }
  });
}

// Walls join with walls and doors. A wall shows its top, and its front face when nothing stands below it.
function inkEdges(ctx, px, py, T, m, h) {
  ctx.fillStyle = INK;
  if (m & 1) ctx.fillRect(px, py, T, 2);
  if (m & 2) ctx.fillRect(px + T - 2, py, 2, T);
  if (m & 4) ctx.fillRect(px, py + T - 2, T, 2);
  if (m & 8) ctx.fillRect(px, py, 2, T);
  if (h < T) ctx.fillRect(px, py + h - 1, T, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  if (m & 1) ctx.fillRect(px + (m & 8 ? 2 : 0), py + 2, T - (m & 8 ? 2 : 0) - (m & 2 ? 2 : 0), 2);
}

registerDrawer('tile:wood-wall', (ctx, tile, px, py, T, tx, ty, game) => {
  const m = openSides(game, tx, ty, WALL), h = m & 4 ? Math.round(T * 0.68) : T; // h: depth of the top; below it, the front
  ctx.fillStyle = '#4a2f1a';
  ctx.fillRect(px, py, T, h);
  for (let i = 0; i < 3; i++) {                             // boards on top
    ctx.fillStyle = (tx + ty + i) % 2 ? '#7a5230' : '#6e4a2b';
    ctx.fillRect(px, py + 1 + i * (h / 3), T, h / 3 - 2);
    ctx.fillStyle = 'rgba(10,4,16,0.22)';
    ctx.fillRect(px + hash2(tx + i, ty, 61) * T * 0.6, py + i * (h / 3) + h / 6, T * 0.3, 1);
  }
  if (h < T) {                                              // front: upright planks with nails
    ctx.fillStyle = '#3a2414';
    ctx.fillRect(px, py + h, T, T - h);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#5e3d22' : '#674428';
      ctx.fillRect(px + i * (T / 4) + 1, py + h + 1, T / 4 - 2, T - h - 2);
      ctx.fillStyle = INK;
      ctx.fillRect(px + i * (T / 4) + T / 8 - 1, py + h + 4, 2, 2);
    }
  }
  inkEdges(ctx, px, py, T, m, h);
});

registerDrawer('tile:stone-block', (ctx, tile, px, py, T, tx, ty, game) => {
  const m = openSides(game, tx, ty, WALL), h = m & 4 ? Math.round(T * 0.68) : T;
  ctx.fillStyle = '#4a4654';                                // mortar
  ctx.fillRect(px, py, T, T);
  ctx.fillStyle = '#8a8594';                                // capstones on top, two offset rows
  const r = h / 2 - 2;
  ctx.fillRect(px + 1, py + 1, T / 2 - 2, r);
  ctx.fillRect(px + T / 2 + 1, py + 1, T / 2 - 2, r);
  ctx.fillRect(px + 1, py + h / 2 + 1, T / 4 - 2, r);
  ctx.fillRect(px + T / 4 + 1, py + h / 2 + 1, T / 2 - 2, r);
  ctx.fillRect(px + (T * 3) / 4 + 1, py + h / 2 + 1, T / 4 - 2, r);
  if (h < T) {                                              // front: darker bricks
    ctx.fillStyle = '#353140';
    ctx.fillRect(px, py + h, T, T - h);
    ctx.fillStyle = '#5f5a6b';
    const bh = (T - h) / 2 - 1;
    for (let i = 0; i < 2; i++) ctx.fillRect(px + 1 + i * (T / 2), py + h + 1, T / 2 - 2, bh);
    for (let i = 0; i < 3; i++) ctx.fillRect(px + 1 + Math.max(0, i * (T / 2) - T / 4), py + h + bh + 2, i === 1 ? T / 2 - 2 : T / 4 - 2, bh);
  }
  speckle(ctx, px, py, T, tx, ty, 'rgba(10,4,16,0.18)', 2);
  inkEdges(ctx, px, py, T, m, h);
});

// A door in its frame. Drawn for a wall running left to right; rotated when the wall runs up and down.
for (const name of ['door-closed', 'door-open']) {
  registerDrawer(`tile:${name}`, (ctx, tile, px, py, T, tx, ty, game) => {
    const upright = WALL.has(neighbor(game, tx, ty - 1)) && WALL.has(neighbor(game, tx, ty + 1)) && !WALL.has(neighbor(game, tx - 1, ty));
    ctx.save();
    if (upright) { ctx.translate(px + T, py); ctx.rotate(Math.PI / 2); px = 0; py = 0; }
    ctx.fillStyle = '#4e463c';                              // threshold
    ctx.fillRect(px, py, T, T);
    ctx.fillStyle = 'rgba(10,4,16,0.3)';
    ctx.fillRect(px, py + T * 0.42, T, T * 0.16);
    const post = T * 0.14, inner = T - 2 * post;
    for (const x of [px, px + T - post]) {                  // posts
      ctx.fillStyle = INK; ctx.fillRect(x, py, post, T);
      ctx.fillStyle = '#6e4a2b'; ctx.fillRect(x + 2, py + 2, post - 4, T - 4);
    }
    const width = name === 'door-closed' ? inner : T * 0.16, top = py + T * 0.2, height = T * 0.6;
    ctx.fillStyle = INK;
    ctx.fillRect(px + post - 1, top - 2, width + 2, height + 4);
    for (let i = 0; i < 4; i++) {                           // planks
      ctx.fillStyle = i % 2 ? '#8b5a2b' : '#7d5026';
      ctx.fillRect(px + post + (i * width) / 4, top, width / 4 - 1, height);
    }
    ctx.fillStyle = '#353039';                              // iron bands
    ctx.fillRect(px + post, top + height * 0.15, width, 3);
    ctx.fillRect(px + post, top + height * 0.75, width, 3);
    if (name === 'door-closed') {
      ctx.fillStyle = INK; circle(ctx, px + post + width * 0.78, top + height / 2, 3.5);
      ctx.fillStyle = '#ffe08a'; circle(ctx, px + post + width * 0.78, top + height / 2, 2);
    }
    ctx.restore();
  });
}

// A pumpkin seen from above: ribbed lobes around a stem. Shared by the tile, the lantern, and icons.
function pumpkin(ctx, x, y, r, v = 0.5) {
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.ellipse(x, y, r + 2, r * 0.88 + 2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b5520f';
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.88, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8761e';
  for (const dx of [-0.42, 0, 0.42]) { ctx.beginPath(); ctx.ellipse(x + dx * r, y, r * 0.4, r * 0.8, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#f59a3c';                                // sunlit ribs
  for (const dx of [-0.5, -0.08]) { ctx.beginPath(); ctx.ellipse(x + dx * r, y - r * 0.12, r * 0.14, r * 0.5, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = INK;                                      // stem
  ctx.fillRect(x - r * 0.12 - 1, y - r * 0.18 - v * 2 - 1, r * 0.24 + 2, r * 0.34 + 2);
  ctx.fillStyle = '#5b6d2a';
  ctx.fillRect(x - r * 0.12, y - r * 0.18 - v * 2, r * 0.24, r * 0.34);
}

// The carved face, glowing from the candle inside.
function face(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {                             // triangle eyes
    ctx.beginPath();
    ctx.moveTo(x + side * r * 0.5, y - r * 0.05);
    ctx.lineTo(x + side * r * 0.15, y - r * 0.05);
    ctx.lineTo(x + side * r * 0.32, y - r * 0.4);
    ctx.fill();
  }
  ctx.beginPath();                                          // jagged grin
  ctx.moveTo(x - r * 0.6, y + r * 0.2);
  for (let i = 1; i <= 6; i++) ctx.lineTo(x - r * 0.6 + i * r * 0.2, y + r * (i % 2 ? 0.38 : 0.24));
  ctx.lineTo(x + r * 0.45, y + r * 0.55);
  ctx.lineTo(x - r * 0.45, y + r * 0.55);
  ctx.fill();
}

registerDrawer('tile:pumpkin', (ctx, tile, px, py, T, tx, ty, game) => {
  grass(ctx, px, py, T, tx, ty, game);
  const v = hash2(tx, ty, 21), cx = px + T * (0.42 + v * 0.16), cy = py + T * (0.45 + hash2(ty, tx, 5) * 0.12);
  ctx.strokeStyle = '#2d4a1c';                              // vine with two leaves
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx + T * 0.18, cy - T * 0.2, T * 0.14, v * 6, v * 6 + 4); ctx.stroke();
  leaf(ctx, cx + T * 0.3, cy - T * 0.3, T * 0.09, '#3d5a20', v * 5);
  leaf(ctx, cx - T * 0.28, cy + T * 0.22, T * 0.08, '#35501c', v * 9);
  shadow(ctx, cx, cy, T * 0.28);
  pumpkin(ctx, cx, cy, T * (0.25 + v * 0.06), v);
});

// ------------------------------------------------------------- entities ----

// Held tools and weapons, drawn along +x from the hand in local coordinates.
// Every item with `tool: 'axe'` or `tool: 'pickaxe'` gets a head in its own color, every
// melee weapon a blade in its color, every ranged weapon a bow.
// Returns false for items that are not tools (those show their icon in the hand).
function drawHeld(ctx, name, T) {
  const item = registries.items.get(name);
  ctx.lineJoin = 'round';
  if (item?.weapon?.kind === 'ranged') { bow(ctx, T); return true; }
  if (name === 'sword' || item?.weapon?.kind === 'melee') {
    ctx.fillStyle = INK;                                      // grip and pommel
    ctx.fillRect(-T * 0.13, -2.5, T * 0.13, 5);
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(-T * 0.12, -1.5, T * 0.12, 3);
    blob(ctx, -T * 0.14, 0, 2.5, 2.5, '#c9a04a', 1.5);
    ctx.fillStyle = item?.color || '#d8dce4';                 // blade
    ctx.beginPath();
    ctx.moveTo(1, -2.5); ctx.lineTo(T * 0.5, -2.5); ctx.lineTo(T * 0.6, 0); ctx.lineTo(T * 0.5, 2.5); ctx.lineTo(1, 2.5);
    ctx.closePath(); ctx.fill();
    outline(ctx, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(3, -1.5, T * 0.44, 1);
    ctx.fillStyle = INK;                                      // crossguard
    ctx.fillRect(-3, -7, 6, 14);
    ctx.fillStyle = '#c9a04a';
    ctx.fillRect(-2, -6, 4, 12);
    return true;
  }
  if (item?.tool !== 'axe' && item?.tool !== 'pickaxe') return false;
  ctx.fillStyle = INK;                                        // handle
  ctx.fillRect(-T * 0.05, -3, T * 0.55, 6);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-T * 0.05 + 1, -2, T * 0.55 - 2, 4);
  const metal = item.color === '#b08850' ? '#b9bec7' : item.color; // the stone-age axe registers a wooden color
  if (item.tool === 'axe') {
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.moveTo(T * 0.3, -2); ctx.lineTo(T * 0.46, -2); ctx.lineTo(T * 0.54, -T * 0.22); ctx.quadraticCurveTo(T * 0.4, -T * 0.16, T * 0.26, -T * 0.2);
    ctx.closePath(); ctx.fill();
    outline(ctx, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(T * 0.3, -T * 0.19, T * 0.2, 1.5);
  } else {
    ctx.lineCap = 'round';
    for (const [color, width] of [[INK, 7], [metal, 4.5]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath(); ctx.arc(T * 0.64, 0, T * 0.22, Math.PI - 0.95, Math.PI + 0.95); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(T * 0.64, 0, T * 0.22, Math.PI - 0.7, Math.PI - 0.1); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  return true;
}

function drawIcon(ctx, name, cx, cy, size, game) {
  const drawer = registries.drawers.get(`item:${name}`);
  if (drawer) { ctx.save(); drawer(ctx, registries.items.get(name), cx, cy, size, game); ctx.restore(); return; }
  ctx.fillStyle = registries.items.get(name)?.color || '#ccc';
  ctx.fillRect(cx - size * 0.3, cy - size * 0.3, size * 0.6, size * 0.6);
}

// A flame licking upward (the camera looks down, but flames read better pointing up).
function flame(ctx, x, y, s, color, wobble) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + wobble, y - s * 1.9);
  ctx.quadraticCurveTo(x + s * 1.1, y - s * 0.7, x + s, y);
  ctx.arc(x, y, s, 0, Math.PI);
  ctx.quadraticCurveTo(x - s * 1.1, y - s * 0.7, x + wobble, y - s * 1.9);
  ctx.fill();
}

// Characters are drawn in local coordinates facing +x, then rotated to aim.
registerDrawer('player', (ctx, e, x, y, T, game) => {
  const d = e.dir || { x: 0, y: 1 };
  const aim = Math.atan2(d.y, d.x);
  const hasShield = !!e.inventory?.shield;
  const held = e.hotbar?.[e.id === game.myId ? game.selectedSlot : e.selected];
  const cloak = flashing(e) ? '#fff' : e.color;

  if (e.sailing) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(aim);
    ctx.fillStyle = '#513421'; ctx.beginPath(); ctx.ellipse(0, 0, T * 0.48, T * 0.31, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a66f3e'; ctx.beginPath(); ctx.ellipse(0, 0, T * 0.39, T * 0.23, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#dfaf71'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }

  shadow(ctx, x, y, T * 0.3);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(aim);

  // held item in the right hand (+y is the right side when facing +x); mining chops in a loop
  const swung = Math.max(0, (e._swingUntil || 0) - now()) / 150;  // 1 -> 0 during a swing
  const swing = swung > 0 ? swung : e.mining ? 1 - (now() % 300) / 300 : 0;
  const parrying = e.guarding && !hasShield;
  let swordAngle = 0.6, hx = T * 0.18, hy = T * 0.27;
  if (swing > 0) swordAngle = 1.1 - 2.2 * (1 - swing);            // sweep from right to left across the front
  if (parrying) { swordAngle = -Math.PI / 2; hx = T * 0.34; hy = T * 0.22; } // blade held crosswise
  else if (registries.items.get(held)?.weapon?.kind === 'ranged') { swordAngle = 0; hx = T * 0.32; hy = T * 0.1; } // a bow aims ahead
  if (swung > 0) {
    ctx.strokeStyle = `rgba(255,240,200,${0.55 * swung})`;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, T * 0.75, swordAngle, 1.1); ctx.stroke();
  }
  if (held) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(swordAngle);
    if (!drawHeld(ctx, held, T)) { ctx.rotate(-swordAngle - aim); drawIcon(ctx, held, 0, 0, T * 0.34, game); }
    ctx.restore();
  }

  // torch in the left hand
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(T * 0.16, -T * 0.27); ctx.lineTo(T * 0.4, -T * 0.32); ctx.stroke();
  ctx.strokeStyle = '#5b3a1e';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  const fl = Math.sin(now() / 60 + e.id);
  ctx.fillStyle = 'rgba(255,160,60,0.25)';
  circle(ctx, T * 0.44, -T * 0.33, T * 0.17);
  ctx.fillStyle = fl > 0 ? '#ff9a2a' : '#ff7a1a';
  circle(ctx, T * 0.44, -T * 0.33, T * (0.09 + fl * 0.01));
  ctx.fillStyle = '#ffe08a';
  circle(ctx, T * 0.45, -T * 0.33, T * 0.045);

  // cloak over the shoulders, shaded on the back
  ctx.fillStyle = cloak;
  ctx.beginPath(); ctx.ellipse(-T * 0.02, 0, T * 0.18, T * 0.3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(10,4,16,0.28)';
  ctx.beginPath(); ctx.ellipse(-T * 0.08, 0, T * 0.11, T * 0.26, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-T * 0.02, 0, T * 0.18, T * 0.3, 0, 0, TAU);
  outline(ctx);
  blob(ctx, hx, hy, T * 0.065, T * 0.065, '#f1c9a0', 1.5);        // right hand
  blob(ctx, T * 0.16, -T * 0.27, T * 0.065, T * 0.065, '#f1c9a0', 1.5); // left hand

  // a round shield on the left forearm, swung to the front while guarding
  if (hasShield) {
    const sx = e.guarding ? T * 0.36 : T * 0.06, sy = e.guarding ? -T * 0.06 : -T * 0.36;
    blob(ctx, sx, sy, T * 0.09, T * 0.21, '#8a5a2e');
    ctx.strokeStyle = '#b9bec7';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, sy, T * 0.09 - 2.5, T * 0.21 - 2.5, 0, 0, TAU); ctx.stroke();
    blob(ctx, sx, sy, T * 0.035, T * 0.05, '#b9bec7', 1.5);
  }

  // head from above: the face toward the front, a hood in the cloak's color over the crown
  ctx.fillStyle = INK;
  circle(ctx, T * 0.035, 0, T * 0.13 + 2);
  circle(ctx, -T * 0.035, 0, T * 0.115 + 2);
  ctx.fillStyle = '#f1c9a0';
  circle(ctx, T * 0.035, 0, T * 0.13);
  ctx.fillStyle = cloak;
  circle(ctx, -T * 0.035, 0, T * 0.115);
  ctx.fillStyle = 'rgba(10,4,16,0.3)';
  circle(ctx, -T * 0.035, 0, T * 0.115);
  ctx.fillStyle = cloak;
  circle(ctx, -T * 0.04, -T * 0.02, T * 0.09);
  ctx.restore();

  ctx.font = game.font(14);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeText(e.name, x, y - T * 0.5);
  ctx.fillStyle = game.theme.colors.bone;
  ctx.fillText(e.name, x, y - T * 0.5);
  if (e.level) {
    const rank = `Lv.${e.level} ${e.title || 'Wanderer'}`;
    ctx.font = game.font(11); ctx.fillStyle = game.theme.colors.candle;
    ctx.strokeText(rank, x, y - T * .5 - 17); ctx.fillText(rank, x, y - T * .5 - 17);
  }
});

// A gooey slime with a bone it swallowed. It flushes red and bares its fangs on the wind-up.
function drawSlime(ctx, e, x, y, T, game) {
  const stunned = (e.stunnedUntil || 0) > game.time;
  const pulse = stunned ? 0 : Math.sin(now() / 160 + e.id) * 0.06;
  const swell = e.windup ? 1.25 : 1;                              // wind-up before a bite: the cue to parry
  const rx = T * 0.3 * swell * (1 + pulse), ry = T * 0.28 * swell * (1 - pulse);
  const me = game.me;
  const a = me ? Math.atan2(me.y - e._ry, me.x - e._rx) : Math.PI / 2; // eyes look at you
  shadow(ctx, x, y, rx);
  ctx.fillStyle = flashing(e) ? '#fff' : e.windup ? '#e0652a' : e.color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(10,30,0,0.3)';                            // darker rim at the bottom right
  ctx.fill();
  ctx.fillStyle = flashing(e) ? '#fff' : e.windup ? '#e0652a' : e.color;
  ctx.beginPath(); ctx.ellipse(x - rx * 0.1, y - ry * 0.12, rx * 0.84, ry * 0.8, 0, 0, TAU); ctx.fill();
  bone(ctx, x - rx * 0.2, y + ry * 0.25, T * 0.07, e.id, 'rgba(239,230,210,0.45)');
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  outline(ctx);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';                       // glossy highlight
  ctx.beginPath(); ctx.ellipse(x - rx * 0.45, y - ry * 0.45, rx * 0.2, ry * 0.11, -0.6, 0, TAU); ctx.fill();
  ctx.fillRect(x - rx * 0.15, y - ry * 0.68, 2, 2);
  const fx = Math.cos(a), fy = Math.sin(a);
  if (e.windup) {                                                 // open mouth with two fangs
    const mx = x + fx * T * 0.2, my = y + fy * T * 0.2;
    blob(ctx, mx, my, T * 0.07, T * 0.07, '#3a0a10', 1.5);
    ctx.fillStyle = '#efe6d2';
    for (const k of [-1, 1]) ctx.fillRect(mx - fy * k * T * 0.035 - 1, my + fx * k * T * 0.035 - 1, 2.5, 2.5);
  }
  for (const side of [-1, 1]) {
    const ex = x + fx * T * 0.12 - fy * side * T * 0.1, ey = y + fy * T * 0.12 + fx * side * T * 0.1;
    if (stunned) {                                                // dazed: x eyes
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex - 3, ey - 3); ctx.lineTo(ex + 3, ey + 3); ctx.moveTo(ex + 3, ey - 3); ctx.lineTo(ex - 3, ey + 3); ctx.stroke();
      continue;
    }
    blob(ctx, ex, ey, T * 0.06, T * 0.06, '#f4f0e0', 1.5);
    ctx.fillStyle = INK;
    circle(ctx, ex + fx * T * 0.025, ey + fy * T * 0.025, T * 0.03);
  }
  if (stunned) {                                                  // circling stars
    ctx.fillStyle = game.theme.colors.candle;
    for (let i = 0; i < 3; i++) {
      const s = now() / 200 + (i * TAU) / 3, sx = x + Math.cos(s) * T * 0.34, sy = y - T * 0.1 + Math.sin(s) * T * 0.14;
      ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 1.5, sy - 1.5); ctx.lineTo(sx + 5, sy); ctx.lineTo(sx + 1.5, sy + 1.5);
      ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 1.5, sy + 1.5); ctx.lineTo(sx - 5, sy); ctx.lineTo(sx - 1.5, sy - 1.5); ctx.fill();
    }
  }
}
registerDrawer('slime', drawSlime);
registerDrawer('blood-slime', (ctx, e, x, y, T, game) => drawSlime(ctx, e, x, y, T * (e.size || 2), game)); // `size` scales its body

registerDrawer('campfire', (ctx, e, x, y, T, game) => {
  const t = now() / 1000;
  for (let i = 0; i < 8; i++) {                                   // ring of stones
    const a = (i / 8) * TAU;
    blob(ctx, x + Math.cos(a) * T * 0.31, y + Math.sin(a) * T * 0.27, T * 0.075, T * 0.06, i % 2 ? '#6d6976' : '#7d7986', 1.5);
  }
  ctx.lineCap = 'round';                                          // crossed logs with cut ends
  for (const [color, width] of [[INK, 8], ['#5b3a1e', 5]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x - T * 0.2, y - T * 0.1); ctx.lineTo(x + T * 0.2, y + T * 0.12);
    ctx.moveTo(x - T * 0.2, y + T * 0.12); ctx.lineTo(x + T * 0.2, y - T * 0.1);
    ctx.stroke();
  }
  ctx.fillStyle = '#c49a64';
  for (const [dx, dy] of [[-0.2, -0.1], [0.2, 0.12], [-0.2, 0.12], [0.2, -0.1]]) circle(ctx, x + dx * T, y + dy * T, 2);
  if (e.fuel > 0) {
    const size = 0.5 + 0.5 * Math.min(1, e.fuel / 30);
    const f = 1 + Math.sin(now() / 70 + e.id) * 0.1;
    ctx.fillStyle = 'rgba(255,140,40,0.2)';
    circle(ctx, x, y, T * 0.36 * size);
    flame(ctx, x, y + T * 0.06, T * 0.17 * size * f, '#e8461a', Math.sin(t * 7 + e.id) * 3);
    flame(ctx, x, y + T * 0.07, T * 0.12 * size, '#ff9a2a', Math.sin(t * 9 + e.id + 1) * 2.5);
    flame(ctx, x, y + T * 0.08, T * 0.06 * size * f, '#ffe08a', Math.sin(t * 11 + e.id + 2) * 1.5);
    for (let i = 0; i < 5; i++) {                                 // embers rising
      const p = (t * 0.7 + i * 0.37 + e.id * 0.13) % 1;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = i % 2 ? '#ffb347' : '#ffe08a';
      ctx.fillRect(x + Math.sin(p * 6 + i * 2) * T * 0.14 - 1, y - T * 0.15 - p * T * 0.75 * size, 2.5, 2.5);
    }
    ctx.globalAlpha = 1;
  } else {                                                        // ash, glowing coals, and a wisp of smoke
    blob(ctx, x, y, T * 0.13, T * 0.11, '#3c3640', 1.5);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = Math.sin(now() / 400 + e.id + i * 2) > 0 ? '#c0262f' : '#7a1a1a';
      circle(ctx, x + (i - 1) * T * 0.06, y + ((i % 2) - 0.5) * T * 0.05, 2.5);
    }
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.4 + i / 3 + e.id * 0.17) % 1;
      ctx.fillStyle = `rgba(150,140,160,${0.35 * (1 - p)})`;
      circle(ctx, x + Math.sin(p * 4 + i) * T * 0.1, y - p * T * 0.7, T * (0.05 + p * 0.08));
    }
  }
  const frac = Math.max(0, Math.min(1, e.fuel / e.maxFuel));      // fuel bar
  const C = game.theme.colors;
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.roundRect(x - T * 0.4 - 1.5, y - T * 0.62 - 1.5, T * 0.8 + 3, 8, 4); ctx.fill();
  ctx.fillStyle = frac > 0.33 ? C.ember : C.blood;
  if (frac > 0) { ctx.beginPath(); ctx.roundRect(x - T * 0.4, y - T * 0.62, Math.max(5, T * 0.8 * frac), 5, 2.5); ctx.fill(); }
});

// A carved pumpkin with a candle inside. When a pack of monsters is brave enough
// to ignore it (repels turns false), the candle gutters to a dim red.
registerDrawer('jack-o-lantern', (ctx, e, x, y, T) => {
  shadow(ctx, x, y, T * 0.32);
  pumpkin(ctx, x, y, T * 0.32);
  const flicker = Math.sin(now() / 90 + e.id * 3) * 0.5 + Math.sin(now() / 37 + e.id) * 0.5;
  const guttering = e.repels === false;
  face(ctx, x, y + T * 0.03, T * 0.31, guttering ? '#3a0a10' : '#7a2a08');  // the carved cut, then the light within
  face(ctx, x, y + T * 0.02, T * 0.28, guttering ? '#a8321c' : flicker > 0.2 ? '#ffe08a' : '#ffb347');
});

// Item icons for the hotbar and inventory: fn(ctx, item, cx, cy, size).
const toolIcon = (name) => (ctx, item, cx, cy, s) => {
  ctx.translate(cx - s * 0.3, cy + s * 0.3);
  ctx.rotate(-Math.PI / 4);
  drawHeld(ctx, name, s * 1.4);
};
for (const [name, item] of registries.items) if (name === 'sword' || item.tool || item.weapon) registerDrawer(`item:${name}`, toolIcon(name));

for (const ore of ['iron', 'gold', 'diamond']) {
  registerDrawer(`item:${ore}`, (ctx, item, cx, cy, s) => {
    if (ore === 'diamond') { gem(ctx, cx, cy, s * 0.32, item.color); return; }
    gem(ctx, cx - s * 0.1, cy + s * 0.08, s * 0.22, item.color);   // a pile of nuggets
    gem(ctx, cx + s * 0.14, cy - s * 0.06, s * 0.18, item.color);
  });
}
registerDrawer('item:wood', (ctx, item, cx, cy, s) => {
  for (const dy of [0.12, -0.12]) {                               // two logs, cut ends to the right
    ctx.fillStyle = INK;
    ctx.fillRect(cx - s * 0.36 - 1.5, cy + dy * s - s * 0.12 - 1.5, s * 0.6 + 3, s * 0.24 + 3);
    ctx.fillStyle = '#6e4a2b';
    ctx.fillRect(cx - s * 0.36, cy + dy * s - s * 0.12, s * 0.6, s * 0.24);
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(cx - s * 0.3, cy + dy * s - s * 0.02, s * 0.4, 1.5);
    blob(ctx, cx + s * 0.24, cy + dy * s, s * 0.08, s * 0.12, '#c49a64', 1.5);
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx + s * 0.24, cy + dy * s, s * 0.035, s * 0.06, 0, 0, TAU); ctx.stroke();
  }
});
registerDrawer('item:stone', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = '#8a8590';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.32, cy + s * 0.2); ctx.lineTo(cx - s * 0.2, cy - s * 0.22); ctx.lineTo(cx + s * 0.15, cy - s * 0.28);
  ctx.lineTo(cx + s * 0.34, cy + s * 0.05); ctx.lineTo(cx + s * 0.18, cy + s * 0.28);
  ctx.closePath(); ctx.fill();
  ctx.lineJoin = 'round';
  outline(ctx);
  ctx.fillStyle = 'rgba(10,4,16,0.25)';
  ctx.beginPath(); ctx.moveTo(cx + s * 0.34, cy + s * 0.05); ctx.lineTo(cx + s * 0.18, cy + s * 0.28); ctx.lineTo(cx - s * 0.05, cy + s * 0.05); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(cx - s * 0.15, cy - s * 0.16, s * 0.2, s * 0.06);
});
registerDrawer('item:pumpkin', (ctx, item, cx, cy, s) => pumpkin(ctx, cx, cy, s * 0.34));
registerDrawer('item:jack-o-lantern', (ctx, item, cx, cy, s) => { pumpkin(ctx, cx, cy, s * 0.36); face(ctx, cx, cy + s * 0.02, s * 0.32, '#ffe08a'); });
registerDrawer('item:campfire', (ctx, item, cx, cy, s) => {
  ctx.lineCap = 'round';
  for (const [color, width] of [[INK, Math.max(5, s * 0.16)], ['#5b3a1e', Math.max(3, s * 0.1)]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.3, cy + s * 0.3); ctx.lineTo(cx + s * 0.3, cy + s * 0.12);
    ctx.moveTo(cx - s * 0.3, cy + s * 0.12); ctx.lineTo(cx + s * 0.3, cy + s * 0.3);
    ctx.stroke();
  }
  flame(ctx, cx, cy + s * 0.08, s * 0.17, '#e8461a', 1);
  flame(ctx, cx, cy + s * 0.1, s * 0.11, '#ff9a2a', -1);
  flame(ctx, cx, cy + s * 0.12, s * 0.05, '#ffe08a', 0);
});
registerDrawer('item:shield', (ctx, item, cx, cy, s) => {
  blob(ctx, cx, cy, s * 0.32, s * 0.32, '#8a5a2e');
  ctx.strokeStyle = '#6e4423';                                    // planks
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.1, cy - s * 0.3); ctx.lineTo(cx - s * 0.1, cy + s * 0.3); ctx.moveTo(cx + s * 0.1, cy - s * 0.3); ctx.lineTo(cx + s * 0.1, cy + s * 0.3); ctx.stroke();
  ctx.strokeStyle = '#b9bec7';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.32 - 3, 0, TAU); ctx.stroke();
  blob(ctx, cx, cy, s * 0.09, s * 0.09, '#b9bec7', 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(cx - s * 0.04, cy - s * 0.04, 2, 2);
});
registerDrawer('item:door', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.roundRect(cx - s * 0.27, cy - s * 0.38, s * 0.54, s * 0.76, [s * 0.2, s * 0.2, 2, 2]); ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? '#8b5a2b' : '#7d5026';
    ctx.fillRect(cx - s * 0.23 + (i * s * 0.46) / 3, cy - s * 0.3, s * 0.46 / 3 - 1, s * 0.64);
  }
  ctx.fillStyle = '#353039';
  for (const dy of [-0.18, 0.18]) ctx.fillRect(cx - s * 0.23, cy + s * dy, s * 0.46, 2.5);
  ctx.fillStyle = '#ffe08a';
  circle(ctx, cx + s * 0.13, cy + s * 0.02, 2);
});

// ---------------------------------------------- hazards, glass, redstone ----

const LAVA = new Set(['lava']);

// Molten rock: drifting dark crust, a bubble that swells and pops, and a basalt rim along the shore.
registerDrawer('tile:lava', (ctx, tile, px, py, T, tx, ty, game) => {
  const t = now() / 1000, m = openSides(game, tx, ty, LAVA);
  ctx.fillStyle = tile.color;
  ctx.fillRect(px, py, T, T);
  ctx.fillStyle = '#ff8a1a';                                      // hot veins
  ctx.fillRect(px + T * hash2(tx, ty, 90) * 0.5, py + T * 0.3, T * 0.5, 2);
  ctx.fillRect(px + T * 0.2, py + T * (0.6 + hash2(ty, tx, 90) * 0.2), T * 0.6, 2);
  ctx.fillStyle = '#8a2410';                                      // crust
  for (let i = 0; i < 2; i++) {
    circle(ctx, px + T * (0.2 + 0.6 * hash2(tx + i, ty, 91)) + Math.sin(t * 0.4 + i * 2 + tx) * 2,
      py + T * (0.2 + 0.6 * hash2(tx, ty + i, 92)) + Math.cos(t * 0.3 + i + ty) * 2, T * (0.08 + hash2(tx, ty, 93 + i) * 0.06));
  }
  const p = (t * 0.45 + hash2(tx, ty, 94)) % 1, bx = px + T * (0.25 + hash2(tx, ty, 95) * 0.5), by = py + T * (0.25 + hash2(ty, tx, 96) * 0.5);
  ctx.fillStyle = p < 0.85 ? '#ffd27a' : 'rgba(255,224,138,0.4)';  // a bubble
  circle(ctx, bx, by, T * (p < 0.85 ? 0.03 + p * 0.07 : 0.12));
  for (let s = 0; s < 4; s++) {
    if (!(m & (1 << s))) continue;
    ctx.fillStyle = '#ffb347'; edgeRect(ctx, s, px, py, T, 7);
    ctx.fillStyle = '#2e2028'; edgeRect(ctx, s, px, py, T, 5);
    ctx.fillStyle = INK; edgeRect(ctx, s, px, py, T, 2);
  }
});

function thorn(ctx, x, y, a, s) {
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  ctx.lineTo(x + Math.cos(a + 2.4) * s * 0.4, y + Math.sin(a + 2.4) * s * 0.4);
  ctx.lineTo(x + Math.cos(a - 2.4) * s * 0.4, y + Math.sin(a - 2.4) * s * 0.4);
  ctx.closePath(); ctx.fill();
  outline(ctx, 1);
}

// A bramble of twisted vines bristling with bone-white thorns, with a drop of someone's blood.
function bramble(ctx, cx, cy, r, seed) {
  ctx.lineCap = 'round';
  for (const [color, width] of [[INK, r * 0.2], ['#4a2e26', r * 0.11]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = seed * 6 + i * 1.6;
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.quadraticCurveTo(cx + Math.cos(a + 1.2) * r * 0.2, cy + Math.sin(a + 1.2) * r * 0.2, cx + Math.cos(a + 2.7) * r * 0.9, cy + Math.sin(a + 2.7) * r * 0.9);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#efe6d2';
  for (let i = 0; i < 7; i++) {
    const a = hash2(i, seed * 1000, 71) * TAU, d = r * (0.2 + hash2(seed * 1000, i, 72) * 0.65);
    thorn(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, a + 0.8, r * 0.28);
  }
  ctx.fillStyle = '#c0262f';
  circle(ctx, cx + r * 0.25, cy - r * 0.1, Math.max(1.5, r * 0.07));
}

registerDrawer('tile:thorns', (ctx, tile, px, py, T, tx, ty, game) => {
  grass(ctx, px, py, T, tx, ty, game, false);
  ctx.fillStyle = 'rgba(10,4,16,0.3)';
  circle(ctx, px + T / 2 + 3, py + T / 2 + 4, T * 0.4);
  bramble(ctx, px + T / 2, py + T / 2, T * 0.42, hash2(tx, ty, 70));
});

// A glass block: the floor shows through a leaded pane. Joins with walls like any other block.
function pane(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(159,212,224,0.5)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#4c5866';                                      // leading
  ctx.fillRect(x + w / 2 - 1, y, 2, h);
  ctx.fillRect(x, y + h / 2 - 1, w, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';                       // glint
  ctx.beginPath();
  ctx.moveTo(x + w * 0.12, y + h * 0.42); ctx.lineTo(x + w * 0.34, y + h * 0.1); ctx.lineTo(x + w * 0.42, y + h * 0.1); ctx.lineTo(x + w * 0.2, y + h * 0.42);
  ctx.fill();
}

registerDrawer('tile:glass', (ctx, tile, px, py, T, tx, ty, game) => {
  const m = openSides(game, tx, ty, WALL), h = m & 4 ? Math.round(T * 0.68) : T;
  ctx.fillStyle = '#4e463c';
  ctx.fillRect(px, py, T, T);
  pane(ctx, px, py, T, h);
  if (h < T) { ctx.fillStyle = 'rgba(110,170,195,0.65)'; ctx.fillRect(px, py + h, T, T - h); }
  inkEdges(ctx, px, py, T, m, h);
});

// Redstone wire over its own ground, linking to wires and devices next to it; it pulses while powered.
for (const wire of registries.tiles.filter((t) => t.redstoneWire)) {
  registerDrawer(`tile:${wire.name}`, (ctx, tile, px, py, T, tx, ty, game) => {
    registries.drawers.get(`tile:${tile.wireGround}`)?.(ctx, registries.tileByName.get(tile.wireGround), px, py, T, tx, ty, game);
    const cx = px + T / 2, cy = py + T / 2, on = tile.powered;
    ctx.lineCap = 'round';
    for (const [color, width] of [[INK, T * 0.19], [on ? '#ff4a3a' : '#6e2420', T * 0.1]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let s = 0; s < 4; s++) {
        const nx = tx + DX[s], ny = ty + DY[s];
        if (!game.world.tile(nx, ny)?.redstoneWire && !game._redstoneDevices?.has(`${nx},${ny}`)) continue;
        ctx.moveTo(cx, cy); ctx.lineTo(cx + DX[s] * T * 0.5, cy + DY[s] * T * 0.5);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    blob(ctx, cx, cy, T * 0.1, T * 0.1, on ? '#ff8b69' : '#8c2e26', 1.5);
    if (on) {
      ctx.fillStyle = `rgba(255,230,190,${0.5 + 0.5 * Math.sin(now() / 160 + tx + ty)})`;
      circle(ctx, cx, cy, T * 0.04);
    }
  });
}

// A power crystal: violet when it gives power, dull when switched off.
function crystal(ctx, x, y, s, on) {
  if (on) {
    ctx.fillStyle = `rgba(169,154,242,${0.18 + 0.08 * Math.sin(now() / 300)})`;
    circle(ctx, x, y - s * 0.1, s * 0.42);
  }
  ctx.fillStyle = on ? '#baabff' : '#5e5578';
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.42); ctx.lineTo(x + s * 0.2, y - s * 0.1); ctx.lineTo(x + s * 0.13, y + s * 0.16);
  ctx.lineTo(x - s * 0.13, y + s * 0.16); ctx.lineTo(x - s * 0.2, y - s * 0.1);
  ctx.closePath(); ctx.fill();
  ctx.lineJoin = 'round';
  outline(ctx, Math.max(1.5, s * 0.05));
  ctx.fillStyle = 'rgba(10,4,16,0.25)';                           // shaded facet
  ctx.beginPath(); ctx.moveTo(x, y - s * 0.42); ctx.lineTo(x + s * 0.2, y - s * 0.1); ctx.lineTo(x + s * 0.13, y + s * 0.16); ctx.lineTo(x, y + s * 0.16); ctx.fill();
  ctx.fillStyle = on ? '#f4efff' : '#9a90a8';
  ctx.fillRect(x - s * 0.1, y - s * 0.15, Math.max(2, s * 0.05), s * 0.18);
}

registerDrawer('power-source', (ctx, e, x, y, T) => {
  shadow(ctx, x, y + T * 0.05, T * 0.28);
  blob(ctx, x, y + T * 0.14, T * 0.28, T * 0.14, '#4a4654');      // pedestal
  ctx.fillStyle = '#6b6675';
  ctx.beginPath(); ctx.ellipse(x, y + T * 0.11, T * 0.22, T * 0.09, 0, 0, TAU); ctx.fill();
  crystal(ctx, x, y, T, e.on);
  if (e.on) {
    ctx.fillStyle = '#e4dcff';                                    // sparkles circling
    for (let i = 0; i < 3; i++) {
      const a = now() / 500 + (i * TAU) / 3;
      ctx.fillRect(x + Math.cos(a) * T * 0.3 - 1, y - T * 0.1 + Math.sin(a) * T * 0.12 - 1, 2.5, 2.5);
    }
  }
});

// A lamp block: an iron cage around glass that glows while powered; the nub shows its switch.
function lamp(ctx, x, y, s, lit, on = lit) {
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.roundRect(x - s * 0.34, y - s * 0.34, s * 0.68, s * 0.68, s * 0.08); ctx.fill();
  ctx.fillStyle = '#4a4654';
  ctx.fillRect(x - s * 0.34 + 2, y - s * 0.34 + 2, s * 0.68 - 4, s * 0.68 - 4);
  ctx.fillStyle = lit ? '#ffe08a' : '#5f5546';
  ctx.fillRect(x - s * 0.22, y - s * 0.22, s * 0.44, s * 0.44);
  if (lit) { ctx.fillStyle = '#fff5c2'; ctx.fillRect(x - s * 0.12, y - s * 0.12, s * 0.24, s * 0.24); }
  ctx.fillStyle = '#2e2a36';                                      // cage bars
  ctx.fillRect(x - 1, y - s * 0.22, 2, s * 0.44);
  ctx.fillRect(x - s * 0.22, y - 1, s * 0.44, 2);
  ctx.fillStyle = on ? '#8fdc4a' : '#7a1a1a';
  circle(ctx, x + s * 0.26, y - s * 0.26, Math.max(1.5, s * 0.05));
}

registerDrawer('redstone-lamp', (ctx, e, x, y, T) => {
  if (e.powered) { ctx.fillStyle = 'rgba(255,224,138,0.25)'; circle(ctx, x, y, T * 0.55); }
  shadow(ctx, x, y, T * 0.3);
  lamp(ctx, x, y, T, e.powered, e.on);
});

// ------------------------------------------------------ farm and loot ----

// Livestock from above, head toward +x after rotating to `a`. Shared by animals, icons, and pens.
function drawAnimal(ctx, species, x, y, s, a = -Math.PI / 2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a + Math.PI / 2);                                    // drawn with the head up (-y)
  ctx.lineJoin = 'round';
  if (species === 'sheep') {
    ctx.fillStyle = INK;
    for (const [dx, dy] of [[-0.15, -0.08], [0.15, -0.08], [-0.15, 0.14], [0.15, 0.14], [0, 0.22], [0, -0.04]]) circle(ctx, dx * s, dy * s, s * 0.15 + 2);
    ctx.fillStyle = '#eee8d9';
    for (const [dx, dy] of [[-0.15, -0.08], [0.15, -0.08], [-0.15, 0.14], [0.15, 0.14], [0, 0.22], [0, -0.04]]) circle(ctx, dx * s, dy * s, s * 0.15);
    ctx.fillStyle = '#ffffff';
    circle(ctx, -s * 0.1, -s * 0.05, s * 0.07);
    blob(ctx, -s * 0.13, -s * 0.26, s * 0.08, s * 0.04, '#3d3634', 1.5); // ears
    blob(ctx, s * 0.13, -s * 0.26, s * 0.08, s * 0.04, '#3d3634', 1.5);
    blob(ctx, 0, -s * 0.28, s * 0.11, s * 0.13, '#3d3634');
  } else if (species === 'chicken') {
    blob(ctx, 0, s * 0.04, s * 0.17, s * 0.22, '#f6ebd6');
    blob(ctx, -s * 0.15, s * 0.06, s * 0.07, s * 0.14, '#e3d3b8', 1.5); // wings
    blob(ctx, s * 0.15, s * 0.06, s * 0.07, s * 0.14, '#e3d3b8', 1.5);
    blob(ctx, 0, -s * 0.2, s * 0.1, s * 0.1, '#f6ebd6');
    blob(ctx, 0, -s * 0.24, s * 0.04, s * 0.07, '#d74637', 1.5);  // comb
    ctx.fillStyle = '#edaa46';                                    // beak
    ctx.beginPath(); ctx.moveTo(-s * 0.04, -s * 0.29); ctx.lineTo(0, -s * 0.37); ctx.lineTo(s * 0.04, -s * 0.29); ctx.fill();
    outline(ctx, 1);
  } else {
    const cow = species === 'cow';
    const body = cow ? '#ece4d8' : '#eaa6a9', head = cow ? '#ece4d8' : '#f1b9b8';
    ctx.strokeStyle = INK;                                        // tail
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (cow) { ctx.moveTo(0, s * 0.32); ctx.lineTo(s * 0.05, s * 0.44); } else ctx.arc(0, s * 0.36, s * 0.05, -1, 3.6);
    ctx.stroke();
    blob(ctx, 0, s * 0.04, s * 0.24, s * 0.3, body);
    if (cow) {
      ctx.fillStyle = '#3a3436';                                  // patches
      circle(ctx, -s * 0.1, -s * 0.04, s * 0.09);
      circle(ctx, s * 0.11, s * 0.15, s * 0.08);
      ctx.fillStyle = '#efe6d2';                                  // horns
      ctx.beginPath(); ctx.moveTo(-s * 0.12, -s * 0.3); ctx.lineTo(-s * 0.24, -s * 0.36); ctx.lineTo(-s * 0.1, -s * 0.24); ctx.fill(); outline(ctx, 1);
      ctx.beginPath(); ctx.moveTo(s * 0.12, -s * 0.3); ctx.lineTo(s * 0.24, -s * 0.36); ctx.lineTo(s * 0.1, -s * 0.24); ctx.fill(); outline(ctx, 1);
    } else {
      blob(ctx, -s * 0.12, -s * 0.33, s * 0.06, s * 0.05, '#d4878f', 1.5); // ears
      blob(ctx, s * 0.12, -s * 0.33, s * 0.06, s * 0.05, '#d4878f', 1.5);
    }
    blob(ctx, 0, -s * 0.26, s * 0.15, s * 0.13, head);
    blob(ctx, 0, -s * 0.36, s * 0.09, s * 0.06, cow ? '#dbaaa6' : '#d78288', 1.5); // muzzle or snout
    ctx.fillStyle = '#633b3f';
    ctx.fillRect(-s * 0.04 - 1, -s * 0.37, 2, 2); ctx.fillRect(s * 0.04 - 1, -s * 0.37, 2, 2);
  }
  if (species !== 'sheep') {                                      // eyes
    ctx.fillStyle = INK;
    const ey = species === 'chicken' ? -s * 0.22 : -s * 0.28;
    ctx.fillRect(-s * 0.07 - 1, ey, 2.5, 2.5); ctx.fillRect(s * 0.07 - 1.5, ey, 2.5, 2.5);
  }
  ctx.restore();
}

// Animals face where they walk: the client remembers the last position to find the heading.
for (const [species, type] of registries.entityTypes) {
  if (!type.defaults.animal) continue;
  registerDrawer(species, (ctx, e, x, y, T) => {
    const dx = e._rx - (e._lastX ?? e._rx), dy = e._ry - (e._lastY ?? e._ry);
    if (dx * dx + dy * dy > 1e-6) e._face = Math.atan2(dy, dx);
    e._lastX = e._rx; e._lastY = e._ry;
    const walking = (dx || dy) ? Math.sin(now() / 90 + e.id) * 0.06 : 0;
    shadow(ctx, x, y, T * 0.24);
    drawAnimal(ctx, species, x, y, T * 0.9, (e._face ?? Math.PI / 2) + walking);
  });
  registerDrawer(`item:${species}`, (ctx, item, cx, cy, s) => drawAnimal(ctx, species, cx, cy + s * 0.04, s * 0.95));
}

// A small fenced pen with straw, the animal inside, and its products waiting by the gate.
function pen(ctx, e, x, y, s) {
  ctx.fillStyle = '#7a6a3e';
  ctx.fillRect(x - s * 0.42, y - s * 0.4, s * 0.84, s * 0.8);
  ctx.fillStyle = '#a08a4f';                                      // straw
  for (let i = 0; i < 6; i++) ctx.fillRect(x - s * 0.34 + i * s * 0.12, y - s * 0.3 + (i % 3) * s * 0.2, s * 0.1, 2);
  if (e.animal) drawAnimal(ctx, e.animal, x, y, s * 0.6, -Math.PI / 2 + Math.sin(now() / 900 + (e.id || 0)) * 0.4);
  for (const [color, width] of [[INK, Math.max(4, s * 0.09)], ['#9b6b3d', Math.max(2, s * 0.05)]]) {
    ctx.strokeStyle = color;                                      // rails
    ctx.lineWidth = width;
    ctx.strokeRect(x - s * 0.42, y - s * 0.4, s * 0.84, s * 0.8);
  }
  for (const dx of [-0.42, 0.42]) for (const dy of [-0.4, 0.4]) blob(ctx, x + dx * s, y + dy * s, s * 0.06, s * 0.06, '#6e4a2b', 1.5); // posts
  for (let i = 0; i < Math.min(5, e.stock || 0); i++) blob(ctx, x - s * 0.3 + i * s * 0.12, y + s * 0.3, s * 0.04, s * 0.05, '#f7e8bf', 1); // stock to collect
}
registerDrawer('animal-pen', (ctx, e, x, y, T) => { shadow(ctx, x, y, T * 0.4); pen(ctx, e, x, y, T); });
registerDrawer('item:animal-pen', (ctx, item, cx, cy, s) => pen(ctx, {}, cx, cy, s * 0.9));

// Loot on the ground: its icon bobbing over a pulsing ring, so drops are easy to spot.
registerDrawer('drop', (ctx, e, x, y, T, game) => {
  const t = now() / 300 + e.id, bob = Math.sin(t) * T * 0.05;
  ctx.fillStyle = 'rgba(10,4,16,0.3)';
  ctx.beginPath(); ctx.ellipse(x, y + T * 0.18, T * 0.16, T * 0.06, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(255,224,138,${0.35 + 0.2 * Math.sin(t * 1.5)})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y + T * 0.18, T * 0.26, T * 0.1, 0, 0, TAU); ctx.stroke();
  drawIcon(ctx, e.item, x, y - bob, T * 0.6, game);
  ctx.fillStyle = '#fff5c2';                                      // a glint now and then
  if (Math.sin(t * 0.7) > 0.92) ctx.fillRect(x + T * 0.12, y - bob - T * 0.16, 3, 3);
});

// ------------------------------------------------- bow and arrows ----

// A bow held by the grip at the origin, bending toward +x, with an arrow nocked.
function bow(ctx, T) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(232,224,208,0.9)';                      // string
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-T * 0.14, -T * 0.27); ctx.lineTo(-T * 0.14, T * 0.27); ctx.stroke();
  arrowShape(ctx, -T * 0.14, 0, T * 0.5);
  for (const [color, width] of [[INK, 6], ['#8b5a2b', 3.5]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(-T * 0.28, 0, T * 0.3, -1.1, 1.1); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// An arrow along +x from (x, y), `len` long: fletching, shaft, iron head.
function arrowShape(ctx, x, y, len) {
  ctx.fillStyle = INK;
  ctx.fillRect(x, y - 2, len * 0.85, 4);
  ctx.fillStyle = '#d8c8a0';
  ctx.fillRect(x + 1, y - 1, len * 0.85 - 2, 2);
  ctx.fillStyle = '#c0262f';                                      // fletching
  for (const k of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * 0.22, y); ctx.lineTo(x + len * 0.1, y + k * len * 0.12); ctx.lineTo(x - len * 0.04, y + k * len * 0.12);
    ctx.closePath(); ctx.fill(); outline(ctx, 1);
  }
  ctx.fillStyle = '#cfd3da';                                      // head
  ctx.beginPath(); ctx.moveTo(x + len, y); ctx.lineTo(x + len * 0.8, y - len * 0.09); ctx.lineTo(x + len * 0.8, y + len * 0.09); ctx.closePath(); ctx.fill();
  outline(ctx, 1.5);
}

registerDrawer('arrow', (ctx, e, x, y, T) => {
  const a = Math.atan2(e.vy, e.vx);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.strokeStyle = 'rgba(255,217,160,0.35)';                     // streak behind it
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-T * 0.8, 0); ctx.lineTo(-T * 0.3, 0); ctx.stroke();
  arrowShape(ctx, -T * 0.3, 0, T * 0.62);
  ctx.restore();
});

// ------------------------------------------------------- new item icons ----

registerDrawer('item:bow', (ctx, item, cx, cy, s) => {
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.translate(-s * 0.12, 0);
  bow(ctx, s * 1.1);
});

registerDrawer('item:arrow', (ctx, item, cx, cy, s) => {
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  arrowShape(ctx, -s * 0.38, 0, s * 0.76);
});
registerDrawer('item:sand', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.36, cy + s * 0.22); ctx.quadraticCurveTo(cx - s * 0.1, cy - s * 0.38, cx + s * 0.36, cy + s * 0.22);
  ctx.closePath(); ctx.fill();
  ctx.lineJoin = 'round';
  outline(ctx);
  ctx.fillStyle = 'rgba(120,90,40,0.5)';
  for (let i = 0; i < 5; i++) ctx.fillRect(cx - s * 0.18 + i * s * 0.09, cy + s * (0.1 - (i % 2) * 0.12), 2, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(cx - s * 0.12, cy - s * 0.08, s * 0.1, 2);
});
registerDrawer('item:glass', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = INK;
  ctx.fillRect(cx - s * 0.32, cy - s * 0.32, s * 0.64, s * 0.64);
  ctx.fillStyle = '#4e463c';
  ctx.fillRect(cx - s * 0.29, cy - s * 0.29, s * 0.58, s * 0.58);
  pane(ctx, cx - s * 0.29, cy - s * 0.29, s * 0.58, s * 0.58);
});
registerDrawer('item:thorns', (ctx, item, cx, cy, s) => bramble(ctx, cx, cy, s * 0.36, 0.3));
registerDrawer('item:redstone', (ctx, item, cx, cy, s) => {
  for (const [dx, dy, r] of [[-0.12, 0.08, 0.17], [0.12, 0.1, 0.15], [0, -0.06, 0.16]]) blob(ctx, cx + dx * s, cy + dy * s, r * s, r * s * 0.8, item.color, 1.5);
  ctx.fillStyle = '#ffb0a0';                                      // sparkles in the dust
  for (const [dx, dy] of [[-0.14, 0.04], [0.06, -0.1], [0.14, 0.12]]) ctx.fillRect(cx + dx * s, cy + dy * s, 2, 2);
});
registerDrawer('item:power-crystal', (ctx, item, cx, cy, s) => crystal(ctx, cx, cy + s * 0.06, s * 0.95, true));
registerDrawer('item:redstone-lamp', (ctx, item, cx, cy, s) => lamp(ctx, cx, cy, s * 0.95, true));
registerDrawer('item:redstone-wire', (ctx, item, cx, cy, s) => {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [color, width] of [[INK, Math.max(5, s * 0.17)], ['#dc4942', Math.max(2.5, s * 0.09)]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.32, cy + s * 0.22); ctx.bezierCurveTo(cx - s * 0.3, cy - s * 0.3, cx, cy + s * 0.3, cx + s * 0.05, cy - s * 0.05);
    ctx.bezierCurveTo(cx + s * 0.1, cy - s * 0.35, cx + s * 0.32, cy - s * 0.1, cx + s * 0.3, cy - s * 0.3);
    ctx.stroke();
  }
});
registerDrawer('item:monster-goo', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.3, cy + s * 0.2);
  ctx.quadraticCurveTo(cx - s * 0.32, cy - s * 0.24, cx, cy - s * 0.26);
  ctx.quadraticCurveTo(cx + s * 0.34, cy - s * 0.2, cx + s * 0.3, cy + s * 0.2);
  ctx.quadraticCurveTo(cx + s * 0.12, cy + s * 0.3, cx + s * 0.05, cy + s * 0.2);
  ctx.quadraticCurveTo(cx, cy + s * 0.36, cx - s * 0.08, cy + s * 0.2);
  ctx.closePath(); ctx.fill();
  outline(ctx);
  ctx.fillStyle = 'rgba(10,30,0,0.3)';
  circle(ctx, cx + s * 0.1, cy + s * 0.04, s * 0.06);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.ellipse(cx - s * 0.12, cy - s * 0.1, s * 0.07, s * 0.04, -0.6, 0, TAU); ctx.fill();
});
registerDrawer('item:egg', (ctx, item, cx, cy, s) => {
  blob(ctx, cx, cy, s * 0.21, s * 0.28, item.color);
  ctx.fillStyle = 'rgba(160,120,70,0.5)';
  ctx.fillRect(cx + s * 0.05, cy + s * 0.05, 2, 2); ctx.fillRect(cx - s * 0.08, cy + s * 0.12, 2, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(cx - s * 0.1, cy - s * 0.14, 2.5, s * 0.1);
});
registerDrawer('item:wool', (ctx, item, cx, cy, s) => {
  const puffs = [[-0.14, 0.06], [0.14, 0.06], [0, -0.1], [0, 0.12], [-0.06, -0.02], [0.08, -0.02]];
  ctx.fillStyle = INK;
  for (const [dx, dy] of puffs) circle(ctx, cx + dx * s, cy + dy * s, s * 0.14 + 2);
  ctx.fillStyle = item.color;
  for (const [dx, dy] of puffs) circle(ctx, cx + dx * s, cy + dy * s, s * 0.14);
  ctx.fillStyle = '#ffffff';
  circle(ctx, cx - s * 0.06, cy - s * 0.12, s * 0.05);
});
registerDrawer('item:truffle', (ctx, item, cx, cy, s) => {
  blob(ctx, cx, cy + s * 0.04, s * 0.26, s * 0.22, item.color);
  ctx.fillStyle = '#5a3e30';
  for (const [dx, dy] of [[-0.1, 0], [0.08, 0.1], [0.06, -0.08], [-0.04, 0.14]]) circle(ctx, cx + dx * s, cy + dy * s, s * 0.04);
  ctx.fillStyle = '#ab8261';
  circle(ctx, cx - s * 0.08, cy - s * 0.06, s * 0.04);
});
registerDrawer('item:milk', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = INK;                                            // a glass bottle with a cork
  ctx.beginPath(); ctx.roundRect(cx - s * 0.18, cy - s * 0.18, s * 0.36, s * 0.52, s * 0.08); ctx.fill();
  ctx.fillRect(cx - s * 0.09, cy - s * 0.34, s * 0.18, s * 0.2);
  ctx.fillStyle = item.color;
  ctx.beginPath(); ctx.roundRect(cx - s * 0.15, cy - s * 0.15, s * 0.3, s * 0.46, s * 0.06); ctx.fill();
  ctx.fillRect(cx - s * 0.06, cy - s * 0.24, s * 0.12, s * 0.12);
  ctx.fillStyle = '#9b6b3d';
  ctx.fillRect(cx - s * 0.07, cy - s * 0.32, s * 0.14, s * 0.09);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(cx - s * 0.1, cy - s * 0.08, 2.5, s * 0.28);
});

// ------------------------------------------- lava, obsidian, dynamite ----

registerDrawer('item:lava', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = 'rgba(255,104,28,0.3)';                         // a molten glob, too hot to hold
  circle(ctx, cx, cy, s * 0.36);
  blob(ctx, cx, cy + s * 0.04, s * 0.26, s * 0.22, item.color);
  ctx.fillStyle = '#8a2410';
  circle(ctx, cx + s * 0.09, cy + s * 0.08, s * 0.07);
  ctx.fillStyle = '#ffe08a';
  circle(ctx, cx - s * 0.08, cy - s * 0.04, s * 0.07);
  circle(ctx, cx + s * 0.12, cy - s * 0.1, s * 0.03);
});
registerDrawer('item:obsidian', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = '#2a1d3d';                                      // a shard of black volcanic glass
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.3, cy + s * 0.18); ctx.lineTo(cx - s * 0.16, cy - s * 0.3); ctx.lineTo(cx + s * 0.16, cy - s * 0.36);
  ctx.lineTo(cx + s * 0.34, cy); ctx.lineTo(cx + s * 0.14, cy + s * 0.3);
  ctx.closePath(); ctx.fill();
  ctx.lineJoin = 'round';
  outline(ctx);
  ctx.fillStyle = '#4a3570';
  ctx.beginPath(); ctx.moveTo(cx - s * 0.16, cy - s * 0.3); ctx.lineTo(cx + s * 0.16, cy - s * 0.36); ctx.lineTo(cx + s * 0.02, cy + s * 0.04); ctx.fill();
  ctx.strokeStyle = item.color;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.12, cy - s * 0.2); ctx.lineTo(cx + s * 0.1, cy - s * 0.26); ctx.stroke();
});

// Three red sticks bound with twine, and a fuse. `lit` adds the sputtering spark.
function dynamite(ctx, cx, cy, s, lit) {
  for (const dx of [-0.13, 0.13, 0]) {
    const x = cx + dx * s, y = cy + (dx ? 0.03 : -0.02) * s;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.roundRect(x - s * 0.1, y - s * 0.24, s * 0.2, s * 0.5, s * 0.05); ctx.fill();
    ctx.fillStyle = '#b3241c';
    ctx.beginPath(); ctx.roundRect(x - s * 0.08, y - s * 0.22, s * 0.16, s * 0.46, s * 0.04); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x - s * 0.05, y - s * 0.18, s * 0.03, s * 0.36);
  }
  ctx.fillStyle = '#e8d9b0';                                      // twine
  ctx.fillRect(cx - s * 0.23, cy + s * 0.02, s * 0.46, s * 0.06);
  ctx.strokeStyle = '#2e2a36';                                    // fuse
  ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.24); ctx.quadraticCurveTo(cx + s * 0.14, cy - s * 0.34, cx + s * 0.08, cy - s * 0.44); ctx.stroke();
  if (!lit) return;
  const t = now();
  ctx.fillStyle = 'rgba(255,179,71,0.35)';
  circle(ctx, cx + s * 0.08, cy - s * 0.44, s * 0.12);
  ctx.fillStyle = '#ffe08a';
  circle(ctx, cx + s * 0.08, cy - s * 0.44, s * 0.05);
  for (let i = 0; i < 5; i++) {                                   // sparks spitting off the fuse
    const a = hash2(i, Math.floor(t / 80), 99) * TAU, d = s * (0.08 + hash2(Math.floor(t / 80), i, 100) * 0.12);
    ctx.fillRect(cx + s * 0.08 + Math.cos(a) * d - 1, cy - s * 0.44 + Math.sin(a) * d - 1, 2, 2);
  }
}

registerDrawer('item:dynamite', (ctx, item, cx, cy, s) => dynamite(ctx, cx, cy + s * 0.06, s * 0.9, false));

// Placed dynamite shakes harder and its countdown turns red as the fuse burns down.
registerDrawer('dynamite', (ctx, e, x, y, T, game) => {
  const left = Math.max(0, (e.explodeAt ?? game.time + 3) - game.time);
  const shake = left < 1 ? Math.sin(now() / 25) * 1.5 : 0;
  shadow(ctx, x, y, T * 0.22);
  dynamite(ctx, x + shake, y, T * 0.9, true);
  const label = left.toFixed(1), C = game.theme.colors;
  ctx.font = game.font(Math.round(T * 0.45 + (left < 1 ? 4 : 0)), 'display');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  ctx.strokeText(label, x, y - T * 0.52);
  ctx.fillStyle = left < 1 ? C.blood : C.candle;
  ctx.fillText(label, x, y - T * 0.52);
});

// --------------------------------------------------------- mining cracks ----

registerHud('mining-cracks', (ctx, game) => {
  if (game.ui) return;
  const T = TILE_PX;
  for (const e of game.entities.values()) {
    const m = e.mining;
    if (!m || !game.canSee(m.x + 0.5, m.y + 0.5)) continue;
    const p = game.worldToScreen(m.x + 0.5, m.y + 0.5);
    ctx.strokeStyle = 'rgba(10,4,16,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0, n = Math.ceil(m.p * 7); i < n; i++) {
      const a = hash2(m.x * 13 + i, m.y * 7, 2) * Math.PI * 2, len = T * (0.15 + 0.3 * m.p), kink = (hash2(m.x, m.y + i, 8) - 0.5) * 0.9;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(a) * len * 0.5, p.y + Math.sin(a) * len * 0.5);
      ctx.lineTo(p.x + Math.cos(a + kink) * len, p.y + Math.sin(a + kink) * len);
    }
    ctx.stroke();
  }
});

// -------------------------------------------- short-lived effects (sparks) ----

const effects = [];
function spark(x, y, color, ms = 250) { effects.push({ x, y, color, until: now() + ms, ms }); }

registerHud('effects', (ctx, game) => {
  if (game.ui) return;
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i], left = fx.until - now();
    if (left <= 0) { effects.splice(i, 1); continue; }
    const p = game.worldToScreen(fx.x, fx.y), r = 6 + 18 * (1 - left / fx.ms);
    ctx.strokeStyle = fx.color;
    ctx.globalAlpha = left / fx.ms;
    ctx.lineWidth = 3;
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * r * 0.4, p.y + Math.sin(a) * r * 0.4);
      ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      ctx.stroke();
    }
  }
});

// ---------------------------------------------------------------- sound ----

let audio = null;
const unlockAudio = () => { // browsers only allow audio after a user gesture
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (AC) audio ||= new AC();
};
addEventListener('keydown', unlockAudio, { once: true });
addEventListener('mousedown', unlockAudio, { once: true });

/** Simple synth blip: frequency in Hz, duration in s, oscillator type, volume, end frequency */
export function blip(freq = 440, dur = 0.1, type = 'square', vol = 0.08, endFreq = freq) {
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + dur);
}

onEvent('net:hit', (game, { id }) => {
  const e = game.entities.get(id);
  if (e) e._flashUntil = now() + 120;
  blip(id === game.myId ? 120 : 220, 0.12, 'square', 0.08, 60);
});
onEvent('net:swing', (game, { id }) => {
  const e = game.entities.get(id);
  if (e) e._swingUntil = now() + 150;
  if (id === game.myId) blip(600, 0.06, 'triangle', 0.05, 300);
});
onEvent('net:parry', (game, { x, y }) => { spark(x, y, '#ffe680', 300); blip(1400, 0.15, 'triangle', 0.1, 900); });
onEvent('net:block', (game, { x, y }) => { spark(x, y, '#d9b26f', 200); blip(180, 0.1, 'square', 0.08, 120); });
onEvent('net:harvested', (game, { by }) => { if (by === game.myId) blip(300, 0.08, 'square', 0.06, 180); });
onEvent('net:placed', (game, { by, item }) => {
  if (by !== game.myId) return;
  if (registries.items.get(item)?.places) blip(520, 0.3, 'sine', 0.06, 780); // a light comes alive
  else blip(170, 0.08, 'square', 0.07, 110);
});

// Mining ticks while you hold the button: a thunk on wood, a clink on stone.
let mineTick = 0;
registerClientSystem('mining-sound', (game, dt) => {
  const m = game.me?.mining;
  if (!m) { mineTick = 0; return; }
  if ((mineTick -= dt) > 0) return;
  mineTick = 0.3;
  const tool = game.world.tile(m.x, m.y)?.tool;
  if (tool === 'pickaxe') blip(950, 0.05, 'square', 0.035, 620);
  else if (tool === 'axe') blip(150, 0.07, 'triangle', 0.09, 90);
  else blip(320, 0.05, 'triangle', 0.05, 220);
});
onEvent('net:fed', (game, { id }) => {
  const e = game.entities.get(id);
  if (e) spark(e.x, e.y - 0.2, '#fa3', 300);
  blip(250, 0.3, 'sawtooth', 0.04, 500);
});
onEvent('net:fireOut', () => blip(160, 0.6, 'sine', 0.08, 60));
onEvent('net:crafted', () => blip(500, 0.25, 'triangle', 0.07, 900));
onEvent('net:dusk', () => blip(110, 1.5, 'sine', 0.12, 55));
onEvent('net:dawn', () => blip(330, 1.0, 'sine', 0.08, 660));
onEvent('net:died', () => blip(200, 0.8, 'sawtooth', 0.08, 40));
onEvent('net:horde', () => { blip(98, 1.2, 'sawtooth', 0.09, 92); setTimeout(() => blip(73, 1.6, 'sawtooth', 0.09, 70), 900); }); // war horn
