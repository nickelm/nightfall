// TEAM ART (client helper): the shared team map and the minimap (M).
// Tiles any teammate has explored are merged into game.vision.seen, so they show
// dimmed in the main view too, and the minimap draws them in their tile colors with
// players, fires, and visible monsters on top. See team-map-server.js for the sync.
import { registries, registerClientSystem, registerHud, registerDrawer, onEvent } from '../../shared/registry.js';

const SIZE = 182;          // minimap side in pixels (matches the clock panel's width)
const REPORT_EVERY = 1;    // seconds between reports of newly seen tiles
const REDRAW_EVERY = 0.4;  // seconds between minimap image refreshes
const MAX_PER_REPORT = 8000;

function state(game) {
  return (game._teamMap ||= { show: true, known: null, queue: [], bits: null, report: 0, redraw: 0, canvas: null, colors: [] });
}

// Make sure our arrays match the world, then apply anything the server sent.
function sync(game) {
  const m = state(game), v = game.vision;
  if (!v) return null;
  if (!m.known || m.known.length !== v.seen.length) m.known = new Uint8Array(v.seen.length);
  if (m.bits) {
    const raw = atob(m.bits);
    for (let byte = 0; byte < raw.length; byte++) {
      const b = raw.charCodeAt(byte);
      if (!b) continue;
      for (let k = 0; k < 8; k++) {
        const i = byte * 8 + k;
        if (b & (1 << k) && i < v.seen.length) { v.seen[i] = 1; m.known[i] = 1; }
      }
    }
    m.bits = null;
  }
  for (const i of m.queue) if (i < v.seen.length) { v.seen[i] = 1; m.known[i] = 1; }
  m.queue.length = 0;
  return m;
}

registerDrawer('team-map', () => {}); // the holder entity is bookkeeping, never drawn

onEvent('net:teamMap', (game, { bits }) => { state(game).bits = bits; });
onEvent('net:explored', (game, { tiles }) => { state(game).queue.push(...tiles); });

registerClientSystem('team-map', (game, dt) => {
  const m = sync(game);
  if (!m) return;
  if (!game.ui && game.input.pressed('KeyM')) m.show = !m.show;
  m.redraw -= dt;
  if (m.show && (m.redraw <= 0 || !m.canvas)) { m.redraw = REDRAW_EVERY; repaint(game, m); }

  // tell the server about tiles we have seen that it does not know about yet
  m.report -= dt;
  if (m.report > 0) return;
  m.report = REPORT_EVERY;
  const seen = game.vision.seen, fresh = [];
  for (let i = 0; i < seen.length && fresh.length < MAX_PER_REPORT; i++) {
    if (seen[i] && !m.known[i]) { fresh.push(i); m.known[i] = 1; }
  }
  if (fresh.length) game.sendAction('explored', { tiles: fresh });
});

// '#rgb' / '#rrggbb' -> [r, g, b]; anything else falls back to grey.
function rgb(color) {
  const h = typeof color === 'string' && color[0] === '#' ? color.slice(1) : '';
  if (h.length === 3) return [...h].map((c) => parseInt(c + c, 16));
  if (h.length === 6) return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  return [128, 128, 128];
}

// Repaint the world-sized image: explored tiles in their colors, dimmer where nobody looks now.
function repaint(game, m) {
  const w = game.world.w, h = game.world.h, { seen, visible } = game.vision;
  if (!m.canvas || m.canvas.width !== w || m.canvas.height !== h) {
    m.canvas = document.createElement('canvas');
    m.canvas.width = w; m.canvas.height = h;
  }
  const c = m.canvas.getContext('2d'), img = c.createImageData(w, h), px = img.data;
  for (let i = 0; i < w * h; i++) {
    if (!seen[i]) continue;
    const id = game.world.get(i % w, Math.floor(i / w));
    const col = (m.colors[id] ||= rgb(registries.tiles[id]?.color));
    const k = visible[i] ? 1 : 0.6;
    px[i * 4] = col[0] * k; px[i * 4 + 1] = col[1] * k; px[i * 4 + 2] = col[2] * k; px[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

registerHud('minimap', (ctx, game, w) => {
  const m = game._teamMap, me = game.me;
  if (!m?.show || !m.canvas || !me || game.ui || !game.vision) return;

  // just below the clock and player list (core HUD, top right)
  const players = [...game.entities.values()].filter((e) => e.type === 'player');
  const x = w - 190, y = 8 + 34 + players.length * 18 + 8, s = SIZE / game.world.w;
  const C = game.theme.colors;

  ctx.fillStyle = C.panel;
  ctx.fillRect(x - 4, y - 4, SIZE + 8, SIZE * (game.world.h / game.world.w) + 8);
  ctx.fillStyle = C.night;
  ctx.fillRect(x, y, SIZE, SIZE * (game.world.h / game.world.w));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(m.canvas, x, y, game.world.w * s, game.world.h * s);
  ctx.imageSmoothingEnabled = true;

  const dot = (e, r, color) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x + (e._rx ?? e.x) * s, y + (e._ry ?? e.y) * s, r, 0, Math.PI * 2); ctx.fill();
  };
  for (const e of game.entities.values()) {
    if (!game.world.inBounds(Math.floor(e.x), Math.floor(e.y))) continue;
    if (e.light && e.type !== 'player' && game.vision.seen[Math.floor(e.y) * game.world.w + Math.floor(e.x)]) {
      dot(e, 2, e.repels ? C.pumpkin : C.ash);                             // fires and lanterns we know of
    } else if (e.hostile && e.hp > 0 && game.canSee(e._rx ?? e.x, e._ry ?? e.y)) {
      dot(e, 1.6, C.blood);                                                 // monsters someone sees now
    }
  }
  for (const p of players) {
    if (p.id === game.myId) continue;
    dot(p, 2.4, p.color || C.bone);
  }
  // you: a bright dot with a tick in the direction you face
  const mx = x + me.x * s, my = y + me.y * s, d = me.dir || { x: 0, y: 1 };
  ctx.strokeStyle = C.bone; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + d.x * 7, my + d.y * 7); ctx.stroke();
  dot(me, 3, C.candle);

  ctx.strokeStyle = 'rgba(239,230,210,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, SIZE + 1, SIZE * (game.world.h / game.world.w) + 1);
  ctx.fillStyle = C.ash; ctx.font = game.font(11); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText('M  team map', x + SIZE, y + SIZE * (game.world.h / game.world.w) + 6);
});
