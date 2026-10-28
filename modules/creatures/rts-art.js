// RTS mode (client): F4 hides your hero and turns the view into a free camera over your
// three peasants (rts-server.js). WASD, the arrow keys or the screen edge pan; a left or
// right click sends the peasants to mine around that spot. F4 or Esc brings the hero back.
//
// The camera follows your own player entity, so while this mode is on the (hidden) hero
// floats along with the camera. game.ui = 'rts' keeps the other teams' world input and
// overlays out of the way; Esc clears it, which we take as "leave RTS mode".
import { registries, registerClientSystem, registerHud, registerDrawer, onEvent } from '../../shared/registry.js';
import { saveSetting } from '../../client/core/settings.js';
import { RTS } from './shared.js';

const PAN = 16;     // camera speed, tiles per second
const EDGE = 18;    // pixels from the screen edge that pan the camera
const TASKS = { idle: 'idle', seek: 'looking', toMine: 'walking', mining: 'mining', return: 'heading home',
  toHall: 'delivering', waiting: 'waiting for a chest' };

function enter(game) {
  const me = game.me, s = game._rts;
  s.on = true; s.x = me.x; s.y = me.y; s.home = { x: me.x, y: me.y };
  game.ui = 'rts';
  if (game.settings.view === 'first') saveSetting(game, 'view', 'top');
  game.sendAction('rts', { on: true });
  game.notify('RTS mode: click to send your peasants mining', 3, game.theme.colors.candle);
}

function leave(game) {
  const me = game.me, s = game._rts;
  s.on = false;
  if (game.ui === 'rts') game.ui = null;
  if (s.home) { me.x = s.home.x; me.y = s.home.y; game.send({ t: 'move', x: me.x, y: me.y, dir: me.dir }); }
  game.sendAction('rts', { on: false });
}

// Hide players who are in RTS mode (wrapped like giant-potion-art.js does).
function hideInRts(inner) {
  const fn = (ctx, e, ...rest) => { if (!e.rts) inner(ctx, e, ...rest); };
  Object.assign(fn, inner);
  fn._rts = true;
  return fn;
}

registerClientSystem('rts', (game, dt) => {
  const d = registries.drawers.get('player');
  if (d && !d._rts) registerDrawer('player', hideInRts(d));

  const me = game.me, k = game.input;
  if (!me || !game.world) return;
  const s = (game._rts ||= { on: false, x: me.x, y: me.y, ping: null, adopted: false });
  if (!s.adopted) { s.adopted = true; if (me.rts && !game.ui) enter(game); } // still on after a reload
  if (k.pressed('F4')) {
    if (s.on) leave(game);
    else if (!game.ui) enter(game);
  }
  if (!s.on) return;
  if (game.ui !== 'rts') { if (!game.ui) leave(game); return; } // Esc

  // --- pan the camera ---
  const m = k.mouse, { w, h } = game.screen;
  let dx = (k.down('KeyD') || k.down('ArrowRight') ? 1 : 0) - (k.down('KeyA') || k.down('ArrowLeft') ? 1 : 0);
  let dy = (k.down('KeyS') || k.down('ArrowDown') ? 1 : 0) - (k.down('KeyW') || k.down('ArrowUp') ? 1 : 0);
  if (m.active && document.hasFocus()) {
    if (m.x < EDGE) dx = -1; else if (m.x > w - EDGE) dx = 1;
    if (m.y < EDGE) dy = -1; else if (m.y > h - EDGE) dy = 1;
  }
  s.x = Math.max(0, Math.min(game.world.w, s.x + dx * PAN * dt));
  s.y = Math.max(0, Math.min(game.world.h, s.y + dy * PAN * dt));
  me.x = s.x; me.y = s.y; // the camera follows our own entity

  // --- orders ---
  if (m.active && (k.clicked(0) || k.clicked(2))) {
    const p = game.screenToWorld(m.x, m.y);
    game.sendAction('rtsOrder', { x: p.x, y: p.y });
    s.ping = { x: p.x, y: p.y, at: performance.now() };
  }
});

onEvent('net:rtsNote', (game, { text }) => game.notify(text, 3, game.theme.colors.moon));

// A small villager in a hood: walks, swings a pickaxe while mining, and carries a sack
// tinted like the item it hauls. Your own peasants stand on a green ring.
registerDrawer('peasant', (ctx, e, x, y, T, game) => {
  const C = game.theme.colors, now = performance.now() / 1000;
  const moving = e.task === 'toMine' || e.task === 'toHall';
  const bob = moving ? Math.abs(Math.sin(now * 10 + e.id)) * T * 0.05 : 0;
  const face = (e.dir?.x ?? 0) < 0 ? -1 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x, y + T * 0.22, T * 0.2, T * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  if (e.owner === game.myId) {
    ctx.strokeStyle = '#7dff7a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y + T * 0.22, T * 0.27, T * 0.11, 0, 0, Math.PI * 2); ctx.stroke();
  }
  const by = y - bob;
  // legs
  ctx.fillStyle = '#3d2a1c';
  const step = moving ? Math.sin(now * 10 + e.id) * T * 0.05 : 0;
  ctx.fillRect(x - T * 0.09 + step, by + T * 0.08, T * 0.07, T * 0.13);
  ctx.fillRect(x + T * 0.02 - step, by + T * 0.08, T * 0.07, T * 0.13);
  // tunic and belt
  ctx.fillStyle = '#8a6a43';
  ctx.beginPath(); ctx.roundRect(x - T * 0.13, by - T * 0.1, T * 0.26, T * 0.22, T * 0.05); ctx.fill();
  ctx.fillStyle = '#4a3322'; ctx.fillRect(x - T * 0.13, by + T * 0.03, T * 0.26, T * 0.03);
  // head and hood
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath(); ctx.arc(x, by - T * 0.17, T * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b4f2e';
  ctx.beginPath(); ctx.arc(x, by - T * 0.19, T * 0.1, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.fillStyle = '#2a1d14'; ctx.fillRect(x + face * T * 0.04 - T * 0.01, by - T * 0.18, T * 0.025, T * 0.025);
  // pickaxe, swinging while mining
  const swing = e.task === 'mining' ? Math.sin(now * 9 + e.id) * 0.9 : 0.4;
  ctx.save();
  ctx.translate(x + face * T * 0.12, by - T * 0.02);
  ctx.scale(face, 1); ctx.rotate(-0.6 + swing);
  ctx.strokeStyle = '#7a5530'; ctx.lineWidth = T * 0.04;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -T * 0.26); ctx.stroke();
  ctx.strokeStyle = '#b8b8c0'; ctx.lineWidth = T * 0.045;
  ctx.beginPath(); ctx.arc(0, -T * 0.16, T * 0.11, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();
  ctx.restore();
  // the load on its back
  if (e.carry) {
    ctx.fillStyle = registries.items.get(e.carry)?.color || C.bone;
    ctx.strokeStyle = '#2a1d14'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x - face * T * 0.13, by - T * 0.06, T * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // mining progress
  if (e.task === 'mining' && e.work > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - T * 0.2, by - T * 0.38, T * 0.4, T * 0.05);
    ctx.fillStyle = C.candle; ctx.fillRect(x - T * 0.2, by - T * 0.38, T * 0.4 * e.work, T * 0.05);
  }
});

registerHud('rts', (ctx, game, w, h) => {
  const s = game._rts;
  if (!s?.on || game.ui !== 'rts') return;
  const C = game.theme.colors, T = game.worldToScreen(1, 0).x - game.worldToScreen(0, 0).x;
  const mine = [...game.entities.values()].filter((e) => e.type === 'peasant' && e.owner === game.myId);

  // work area and the last click
  const area = mine.find((e) => e.area)?.area;
  if (area) {
    const p = game.worldToScreen(area.x, area.y);
    ctx.strokeStyle = 'rgba(125,255,122,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(p.x, p.y, RTS.radius * T, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (s.ping) {
    const age = (performance.now() - s.ping.at) / 600;
    if (age < 1) {
      const p = game.worldToScreen(s.ping.x, s.ping.y);
      ctx.strokeStyle = `rgba(125,255,122,${1 - age})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, T * (0.2 + age * 0.6), T * (0.1 + age * 0.3), 0, 0, Math.PI * 2); ctx.stroke();
    } else s.ping = null;
  }

  // panel: controls and what each peasant is doing
  const lines = mine.map((e, i) => `Peasant ${i + 1}: ${TASKS[e.task] || e.task}${e.carry ? ` (${e.carryCount} ${e.carry.replace(/-/g, ' ')})` : ''}`);
  const help = ['Click: mine around there', 'WASD / edges: move camera', 'F4 / Esc: back to your hero'];
  const ph = 44 + (lines.length + help.length) * 18 + 8;
  ctx.fillStyle = C.panel; ctx.fillRect(12, 12, 280, ph);
  ctx.strokeStyle = C.pumpkin; ctx.lineWidth = 1; ctx.strokeRect(12.5, 12.5, 279, ph - 1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = game.font(22, 'display'); ctx.fillStyle = C.pumpkin; ctx.fillText('Command view', 24, 18);
  ctx.font = game.font(14);
  ctx.fillStyle = C.bone;
  lines.forEach((l, i) => ctx.fillText(l, 24, 50 + i * 18));
  ctx.fillStyle = 'rgba(239,230,210,0.6)';
  help.forEach((l, i) => ctx.fillText(l, 24, 50 + (lines.length + i) * 18 + 6));
});
