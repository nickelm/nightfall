// RTS command view (client), Warcraft-style. F4 hides your hero and turns the screen into a
// free camera over your peasants (rts-server.js) with a command console:
//   left click / drag   select peasants (Shift adds); click a chest or a hall to inspect it
//   right click         order the selection: onto a resource they mine around it, onto a
//                       chest they bring their loads, anywhere else they walk there
//   S R B T             stop, return the load, build a chest, train a peasant
//   Q / I               select all peasants / the next idle one
//   arrows, screen edge pan the camera; F4 or Esc goes back to the hero
// Top bar: what the chests hold. Bottom console: buildings and peasants (click to jump there),
// the selection, and the command card.
//
// The camera follows your own player entity, so while this view is on the (hidden) hero
// floats along with the camera. game.ui = 'rts' keeps the other teams' world input and
// overlays out of the way; Esc clears it, which we take as "cancel placing, else leave".
import { registries, registerClientSystem, registerHud, onEvent } from '../../shared/registry.js';
import { TILE_PX } from '../../shared/config.js';
import { saveSetting } from '../../client/core/settings.js';
import { RTS } from './shared.js';

const PAN = 16;          // camera speed, tiles per second
const EDGE = 18;         // pixels from the screen edge that pan the camera
const CONSOLE_H = 156;   // height of the bottom console in pixels
const TASKS = { idle: 'Idle', seek: 'Looking for work', toMine: 'Going to mine', mining: 'Mining', return: 'Heading to a chest',
  toChest: 'Delivering', waiting: 'Waiting for a chest', moving: 'Moving', toBuild: 'Going to build', building: 'Building' };
const BUILDINGS = { 'minas-tirith': 'Minas Tirith', 'rohan-hall': 'Rohan Hall', house: 'House', cabin: 'Cabin', chest: 'Chest',
  campfire: 'Campfire', 'animal-pen': 'Animal pen', 'jack-o-lantern': 'Jack-o-lantern' };
const FOOTPRINT = { 'minas-tirith': [RTS.hallW, RTS.hallH], 'rohan-hall': [9, 6], house: [7, 6], cabin: [5, 4] }; // w x h tiles

const mine = (game) => [...game.entities.values()].filter((e) => e.type === 'peasant' && e.owner === game.myId);
const chests = (game) => [...game.entities.values()].filter((e) => e.type === 'chest');
const nice = (name) => name.replace(/-/g, ' ');
const chestCost = () => registries.recipes.get('chest')?.inputs || { wood: 8 };
const costText = (cost) => Object.entries(cost).map(([item, n]) => `${n} ${nice(item)}`).join(', ');
const inside = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

// Items some tile yields when mined: these are the "resources" in the top bar.
const resources = (game) => (game._rtsResources ||= new Set(registries.tiles.filter((t) => t?.harvest).map((t) => t.harvest.item)));
function stock(game) {
  const total = {};
  for (const c of chests(game)) for (const [item, n] of Object.entries(c.inventory || {})) total[item] = (total[item] || 0) + n;
  return total;
}
// Costs come out of the chests, then your own pack (the server decides; this is the preview).
function affordable(game, cost) {
  const st = stock(game), inv = game.me?.inventory || {};
  return Object.entries(cost).every(([item, n]) => (st[item] || 0) + (inv[item] || 0) >= n);
}

// --- entering and leaving ---
function enter(game) {
  const me = game.me, s = game._rts;
  s.on = true; s.x = me.x; s.y = me.y; s.home = { x: me.x, y: me.y };
  game.ui = 'rts';
  if (game.settings.view === 'first') saveSetting(game, 'view', 'top');
  game.sendAction('rts', { on: true });
  game.notify('Command view: drag to select peasants, right click to order', 3, game.theme.colors.candle);
}
function leave(game) {
  const me = game.me, s = game._rts;
  s.on = false; s.placing = null; s.drag = null;
  if (game.ui === 'rts') game.ui = null;
  if (s.home) { me.x = s.home.x; me.y = s.home.y; game.send({ t: 'move', x: me.x, y: me.y, dir: me.dir }); }
  game.sendAction('rts', { on: false });
}

// --- layout: computed the same way for input and drawing ---
// The core HUD draws the key hints along the bottom; keep the console above them.
const measure = document.createElement('canvas').getContext('2d');
function hintsHeight(game, w) {
  const cache = game._rtsHints;
  if (cache?.w === w && cache.n === registries.keyHints.length) return cache.h;
  measure.font = game.font(12);
  let lines = 1, line = '';
  for (const k of registries.keyHints) {
    const part = `${k.key} ${k.label}`, next = line ? `${line}   ${part}` : part;
    if (measure.measureText(next).width > w - 40 && line) { lines++; line = part; } else line = next;
  }
  game._rtsHints = { w, n: registries.keyHints.length, h: lines * 15 + 8 };
  return game._rtsHints.h;
}
function layout(game) {
  const { w, h } = game.screen, pad = 8;
  const y = h - hintsHeight(game, w) - 6 - CONSOLE_H;
  const cardW = Math.min(3 * 84 + 12, w * 0.36), bw = Math.min(220, w * 0.24);
  const iy = y + pad, ih = CONSOLE_H - 2 * pad;
  return {
    top: { x: 8, y: 8, w: Math.max(240, w - 214), h: 32 },
    console: { x: 8, y, w: w - 16, h: CONSOLE_H },
    buildings: { x: 8 + pad, y: iy, w: bw, h: ih },
    card: { x: w - 8 - pad - cardW, y: iy, w: cardW, h: ih },
    info: { x: 8 + 2 * pad + bw, y: iy, w: w - 16 - 4 * pad - bw - cardW, h: ih },
  };
}

function commands(game) {
  const s = game._rts, all = mine(game), sel = all.filter((e) => s.sel.has(e.id));
  const idle = all.filter((e) => e.task === 'idle'), count = all.length + (game.me?.rtsQueue || 0);
  return [
    { hot: 'S', code: 'KeyS', label: 'Stop', tip: 'Stop what they are doing', on: sel.length > 0, run: () => order(game, 'stop') },
    { hot: 'R', code: 'KeyR', label: 'Return', tip: 'Take the load to the nearest chest', on: sel.some((e) => e.carry), run: () => order(game, 'return') },
    { hot: 'B', code: 'KeyB', label: 'Build chest', tip: 'Place a chest; the nearest selected peasant builds it', cost: chestCost(),
      on: sel.length > 0, run: () => { s.placing = 'chest'; } },
    { hot: 'T', code: 'KeyT', label: 'Train', tip: `Train a peasant at Minas Tirith or a chest (${count}/${RTS.maxPeasants}, ${RTS.trainTime} s)`,
      cost: RTS.trainCost, on: count < RTS.maxPeasants, run: () => game.sendAction('rtsTrain') },
    { hot: 'Q', code: 'KeyQ', label: 'Select all', tip: 'Select all your peasants', on: all.length > 0,
      run: () => { s.sel = new Set(all.map((e) => e.id)); s.building = null; } },
    { hot: 'I', code: 'KeyI', label: 'Idle', tip: `Select the next idle peasant (${idle.length} idle)`, on: idle.length > 0,
      run: () => { const e = idle[(s.idle = (s.idle + 1) % idle.length)]; s.sel = new Set([e.id]); s.building = null; center(game, e); } },
  ];
}
function buttons(game, L) {
  const gap = 6, bw = (L.card.w - 2 * gap) / 3, bh = (L.card.h - gap) / 2;
  return commands(game).map((c, i) => ({ ...c, x: L.card.x + (i % 3) * (bw + gap), y: L.card.y + Math.floor(i / 3) * (bh + gap), w: bw, h: bh }));
}
function buildingRows(game, L) {
  const groups = new Map();
  for (const e of game.entities.values()) if (BUILDINGS[e.type]) groups.set(e.type, [...(groups.get(e.type) || []), e]);
  const rows = [{ type: 'peasant', label: 'Peasants', list: mine(game) }, ...[...groups].map(([type, list]) => ({ type, label: BUILDINGS[type], list }))];
  const rh = 19, top = L.buildings.y + 26;
  return rows.slice(0, Math.max(1, Math.floor((L.buildings.h - 28) / rh))).map((r, i) => ({ ...r, x: L.buildings.x, y: top + i * rh, w: L.buildings.w, h: rh }));
}
function portraits(game, L) {
  const s = game._rts, sel = mine(game).filter((e) => s.sel.has(e.id));
  if (sel.length < 2) return [];
  const size = 40, gap = 6, cols = Math.max(1, Math.floor((L.info.w - 16 + gap) / (size + gap)));
  return sel.map((e, i) => ({ e, x: L.info.x + 8 + (i % cols) * (size + gap), y: L.info.y + 30 + Math.floor(i / cols) * (size + gap), w: size, h: size }));
}

// --- picking things in the world ---
function pickPeasant(game, sx, sy) {
  let best = null, bestD = TILE_PX * 0.5;
  for (const e of mine(game)) {
    const p = game.worldToScreen(e._rx, e._ry - 0.1), d = Math.hypot(p.x - sx, p.y - sy);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}
function pickBuilding(game, p) {
  for (const e of game.entities.values()) {
    if (!BUILDINGS[e.type]) continue;
    const size = FOOTPRINT[e.type];
    if (size) {
      const left = e.x - size[0] / 2, top = e.y - (size[1] - 1) / 2;
      if (p.x >= left && p.x < left + size[0] && p.y >= top && p.y < top + size[1]) return e;
    } else if (Math.hypot(e.x - p.x, e.y - p.y) < 0.6) return e;
  }
  return null;
}
// Where a chest can go: open ground with nothing but peasants and hidden heroes on it.
function siteFree(game, x, y) {
  if (!game.world.inBounds(x, y) || game.world.isSolid(x, y)) return false;
  return ![...game.entities.values()].some((e) => e.type !== 'peasant' && !e.rts && Math.abs(e.x - x - 0.5) < 0.85 && Math.abs(e.y - y - 0.5) < 0.85);
}

function center(game, e) {
  const s = game._rts, size = FOOTPRINT[e.type];
  s.x = e.x; s.y = size ? e.y + 0.5 : e.y;
}
function order(game, kind, p = {}) {
  const s = game._rts;
  game.sendAction('rtsOrder', { ids: [...s.sel], kind, x: p.x, y: p.y });
}

function finishDrag(game, from, m, shift) {
  const s = game._rts;
  if (Math.abs(m.x - from.x) < 6 && Math.abs(m.y - from.y) < 6) { // a click
    const e = pickPeasant(game, m.x, m.y);
    if (e) {
      if (!shift) s.sel = new Set([e.id]);
      else if (s.sel.has(e.id)) s.sel.delete(e.id); else s.sel.add(e.id);
      s.building = null;
      return;
    }
    const b = !shift && pickBuilding(game, game.screenToWorld(m.x, m.y));
    if (b) { s.sel = new Set(); s.building = b.id; return; }
    if (!shift) { s.sel = new Set(); s.building = null; }
    return;
  }
  const x0 = Math.min(from.x, m.x), x1 = Math.max(from.x, m.x), y0 = Math.min(from.y, m.y), y1 = Math.max(from.y, m.y);
  const picked = mine(game).filter((e) => {
    const p = game.worldToScreen(e._rx, e._ry);
    return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  }).map((e) => e.id);
  if (!shift) s.sel = new Set(picked); else for (const id of picked) s.sel.add(id);
  s.building = null;
}

function rightClick(game, m) {
  const s = game._rts;
  if (!s.sel.size) return game.notify('Select peasants first (Q selects all)', 2, game.theme.colors.moon);
  const p = game.screenToWorld(m.x, m.y), b = pickBuilding(game, p);
  order(game, b?.type === 'chest' ? 'return' : 'auto', p);
  s.ping = { x: p.x, y: p.y, at: performance.now() };
}

function clickUi(game, L, m, shift) {
  const s = game._rts;
  for (const b of buttons(game, L)) if (inside(m, b)) { if (b.on) b.run(); return; }
  for (const r of buildingRows(game, L)) {
    if (!inside(m, r) || !r.list.length) continue;
    const i = (s.cycle[r.type] = ((s.cycle[r.type] ?? -1) + 1) % r.list.length), e = r.list[i];
    if (r.type === 'peasant') { s.sel = new Set(r.list.map((p) => p.id)); s.building = null; }
    else { s.sel = new Set(); s.building = e.id; }
    center(game, e);
    return;
  }
  for (const p of portraits(game, L)) {
    if (!inside(m, p)) continue;
    if (shift) s.sel.delete(p.e.id); else s.sel = new Set([p.e.id]);
    return;
  }
}

registerClientSystem('rts', (game, dt) => {
  const me = game.me, k = game.input;
  if (!me || !game.world) return;
  // HUDs draw in the order they were added and Art loads after us: add ours once everything
  // has loaded, so the console covers the hotbar and other HUDs instead of the other way round.
  if (!game._rtsHud) { game._rtsHud = true; registerHud('rts', drawView); }
  const s = (game._rts ||= { on: false, x: me.x, y: me.y, sel: new Set(), building: null, drag: null, placing: null,
    ping: null, cycle: {}, idle: -1, adopted: false });
  if (!s.adopted) { s.adopted = true; if (me.rts && !game.ui) enter(game); } // still on after a reload
  if (k.pressed('F4')) {
    if (s.on) leave(game);
    else if (!game.ui) enter(game);
  }
  if (!s.on) return;
  if (game.ui !== 'rts') { // Esc cleared it: cancel placing first, else leave
    if (game.ui) return;
    if (s.placing) { s.placing = null; game.ui = 'rts'; } else leave(game);
    return;
  }

  // --- forget what is gone ---
  const ids = new Set(mine(game).map((e) => e.id));
  for (const id of s.sel) if (!ids.has(id)) s.sel.delete(id);
  if (s.building != null && !game.entities.has(s.building)) s.building = null;

  // --- pan the camera (arrows or the screen edge; letters are commands here) ---
  const m = k.mouse, { w, h } = game.screen;
  let dx = (k.down('ArrowRight') ? 1 : 0) - (k.down('ArrowLeft') ? 1 : 0);
  let dy = (k.down('ArrowDown') ? 1 : 0) - (k.down('ArrowUp') ? 1 : 0);
  if (m.active && document.hasFocus() && !s.drag) {
    if (m.x < EDGE) dx = -1; else if (m.x > w - EDGE) dx = 1;
    if (m.y < EDGE) dy = -1; else if (m.y > h - EDGE) dy = 1;
  }
  s.x = Math.max(0, Math.min(game.world.w, s.x + dx * PAN * dt));
  s.y = Math.max(0, Math.min(game.world.h, s.y + dy * PAN * dt));
  me.x = s.x; me.y = s.y; // the camera follows our own entity

  // --- mouse ---
  const L = layout(game), shift = k.down('ShiftLeft') || k.down('ShiftRight');
  const overUi = m.active && (inside(m, L.console) || inside(m, L.top));
  if (k.clicked(0) && m.active) {
    if (overUi) clickUi(game, L, m, shift);
    else if (s.placing) {
      const p = game.screenToWorld(m.x, m.y);
      order(game, 'build', { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 });
      if (!shift) s.placing = null; // Shift keeps placing
    } else s.drag = { x: m.x, y: m.y };
  }
  if (s.drag && !k.mouseDown(0)) { finishDrag(game, s.drag, m, shift); s.drag = null; }
  if (k.clicked(2) && m.active && !overUi) {
    if (s.placing) s.placing = null;
    else rightClick(game, m);
  }

  // --- command hotkeys ---
  for (const c of commands(game)) if (k.pressed(c.code) && c.on) c.run();
});

onEvent('net:rtsNote', (game, { text }) => game.notify(text, 3, game.theme.colors.moon));

// --- drawing ---
function panel(ctx, game, r) {
  ctx.fillStyle = game.theme.colors.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = 'rgba(255,138,26,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}
function icon(ctx, game, item, cx, cy, size) {
  const draw = registries.drawers.get(`item:${item}`), def = registries.items.get(item);
  if (draw) { ctx.save(); draw(ctx, def, cx, cy, size, game); ctx.restore(); return; }
  ctx.fillStyle = def?.color || '#ccc'; ctx.fillRect(cx - size * 0.3, cy - size * 0.3, size * 0.6, size * 0.6);
}
function bar(ctx, x, y, w, h, p, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, p)), h);
}
function portrait(ctx, game, e, x, y, size, active) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y, size, size);
  ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  registries.drawers.get('peasant')?.(ctx, { ...e, _portrait: true }, x + size / 2, y + size * 0.62, size * 1.5, game);
  ctx.restore();
  ctx.strokeStyle = active ? '#7dff7a' : 'rgba(239,230,210,0.35)'; ctx.lineWidth = active ? 2 : 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

function drawWorld(ctx, game, s, L) {
  const T = TILE_PX, m = game.input.mouse, all = mine(game), sel = all.filter((e) => s.sel.has(e.id));
  // work areas of the selection
  const areas = new Map(sel.filter((e) => e.area).map((e) => [`${e.area.x},${e.area.y}`, e.area]));
  ctx.strokeStyle = 'rgba(125,255,122,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
  for (const a of areas.values()) {
    const p = game.worldToScreen(a.x, a.y);
    ctx.beginPath(); ctx.arc(p.x, p.y, RTS.radius * T, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]);
  // building sites: a ghost chest that fills in as it is built
  for (const e of all) {
    if (!e.site) continue;
    const p = game.worldToScreen(e.site.x, e.site.y);
    ctx.fillStyle = 'rgba(122,79,42,0.35)'; ctx.fillRect(p.x + T * 0.15, p.y + T * 0.25, T * 0.7, T * 0.55);
    ctx.strokeStyle = '#ffd27a'; ctx.setLineDash([4, 3]); ctx.strokeRect(p.x + T * 0.15, p.y + T * 0.25, T * 0.7, T * 0.55); ctx.setLineDash([]);
    if (e.task === 'building') bar(ctx, p.x + T * 0.1, p.y + T * 0.05, T * 0.8, 5, e.work, game.theme.colors.candle);
  }
  // the selected building
  const b = s.building != null && game.entities.get(s.building);
  if (b) {
    const size = FOOTPRINT[b.type] || [1, 1];
    const left = b.x - size[0] / 2, top = size[0] > 1 ? b.y - (size[1] - 1) / 2 : b.y - 0.5;
    const p = game.worldToScreen(left, top);
    ctx.strokeStyle = '#7dff7a'; ctx.lineWidth = 2; ctx.strokeRect(p.x, p.y, size[0] * T, size[1] * T);
  }
  // placing a chest: green where it fits, red where it does not
  if (s.placing && m.active && !inside(m, L.console) && !inside(m, L.top)) {
    const w = game.screenToWorld(m.x, m.y), tx = Math.floor(w.x), ty = Math.floor(w.y), p = game.worldToScreen(tx, ty);
    const ok = siteFree(game, tx, ty) && affordable(game, chestCost());
    ctx.fillStyle = ok ? 'rgba(125,255,122,0.3)' : 'rgba(255,80,80,0.35)'; ctx.fillRect(p.x, p.y, T, T);
    ctx.strokeStyle = ok ? '#7dff7a' : '#ff5050'; ctx.lineWidth = 2; ctx.strokeRect(p.x + 1, p.y + 1, T - 2, T - 2);
    ctx.font = game.font(13); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = ok ? game.theme.colors.bone : '#ff8080';
    ctx.fillText(`Chest: ${costText(chestCost())}`, p.x + T / 2, p.y - 4);
  }
  // drag box and the last order
  if (s.drag) {
    const x = Math.min(s.drag.x, m.x), y = Math.min(s.drag.y, m.y), w = Math.abs(m.x - s.drag.x), h = Math.abs(m.y - s.drag.y);
    ctx.fillStyle = 'rgba(125,255,122,0.12)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#7dff7a'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }
  if (s.ping) {
    const age = (performance.now() - s.ping.at) / 600;
    if (age < 1) {
      const p = game.worldToScreen(s.ping.x, s.ping.y);
      ctx.strokeStyle = `rgba(125,255,122,${1 - age})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, T * (0.2 + age * 0.6), T * (0.1 + age * 0.3), 0, 0, Math.PI * 2); ctx.stroke();
    } else s.ping = null;
  }
}

// Top bar: what the chests hold (resources first), and the peasant count.
function drawTop(ctx, game, r) {
  const C = game.theme.colors, me = game.me, all = mine(game), st = stock(game), res = resources(game);
  panel(ctx, game, r);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = game.font(15);
  const right = `Peasants ${all.length + (me.rtsQueue || 0)}/${RTS.maxPeasants}` + (me.rtsQueue ? `  (training ${Math.round((me.rtsTrainT || 0) * 100)}%)` : '');
  const rightW = ctx.measureText(right).width;
  ctx.fillStyle = C.bone; ctx.fillText(right, r.x + r.w - 12 - rightW, r.y + r.h / 2);
  const items = Object.entries(st).filter(([item]) => res.has(item)).sort((a, b) => b[1] - a[1]);
  let x = r.x + 10;
  if (!chests(game).length) { ctx.fillStyle = C.moon; ctx.fillText('No chests yet: build one (B) or place one as the hero', x, r.y + r.h / 2); return; }
  if (!items.length) { ctx.fillStyle = 'rgba(239,230,210,0.6)'; ctx.fillText('Chests are empty', x, r.y + r.h / 2); return; }
  for (const [item, n] of items) {
    const label = String(n), w = 22 + ctx.measureText(label).width + 14;
    if (x + w > r.x + r.w - rightW - 24) { ctx.fillStyle = C.bone; ctx.fillText('…', x, r.y + r.h / 2); break; }
    icon(ctx, game, item, x + 9, r.y + r.h / 2, 20);
    ctx.fillStyle = C.candle; ctx.fillText(label, x + 22, r.y + r.h / 2);
    x += w;
  }
}

function drawBuildings(ctx, game, L) {
  const C = game.theme.colors, m = game.input.mouse, r = L.buildings;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = game.font(17, 'display'); ctx.fillStyle = C.pumpkin; ctx.fillText('Settlement', r.x + 4, r.y + 2);
  ctx.font = game.font(14); ctx.textBaseline = 'middle';
  for (const row of buildingRows(game, L)) {
    if (inside(m, row) && row.list.length) { ctx.fillStyle = 'rgba(255,138,26,0.18)'; ctx.fillRect(row.x, row.y, row.w, row.h); }
    const idle = row.type === 'peasant' ? row.list.filter((e) => e.task === 'idle').length : 0;
    ctx.fillStyle = row.list.length ? C.bone : 'rgba(239,230,210,0.4)';
    ctx.fillText(row.label + (idle ? ` (${idle} idle)` : ''), row.x + 6, row.y + row.h / 2, row.w - 44);
    ctx.textAlign = 'right'; ctx.fillStyle = C.candle;
    ctx.fillText(String(row.list.length), row.x + row.w - 6, row.y + row.h / 2);
    ctx.textAlign = 'left';
  }
}

function drawInfo(ctx, game, L) {
  const C = game.theme.colors, s = game._rts, me = game.me, r = L.info, m = game.input.mouse;
  const sel = mine(game).filter((e) => s.sel.has(e.id)), b = s.building != null && game.entities.get(s.building);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const title = (text) => { ctx.font = game.font(17, 'display'); ctx.fillStyle = C.pumpkin; ctx.fillText(text, r.x + 8, r.y + 2, r.w - 16); ctx.font = game.font(14); };
  if (b) {
    title(BUILDINGS[b.type] || nice(b.type));
    const owner = game.entities.get(b.owner)?.name;
    ctx.fillStyle = 'rgba(239,230,210,0.6)';
    if (owner) ctx.fillText(`Built by ${owner}`, r.x + 8, r.y + 24, r.w - 16);
    if (b.type === 'chest') {
      const items = Object.entries(b.inventory || {});
      if (!items.length) { ctx.fillStyle = C.bone; ctx.fillText('Empty', r.x + 8, r.y + 46); }
      const cols = Math.max(1, Math.floor((r.w - 16) / 64));
      items.slice(0, cols * 2).forEach(([item, n], i) => {
        const x = r.x + 8 + (i % cols) * 64, y = r.y + 46 + Math.floor(i / cols) * 34;
        icon(ctx, game, item, x + 13, y + 13, 26);
        ctx.fillStyle = C.candle; ctx.textBaseline = 'middle'; ctx.fillText(String(n), x + 30, y + 13, 32); ctx.textBaseline = 'top';
      });
      if (items.length > cols * 2) { ctx.fillStyle = C.bone; ctx.fillText(`+${items.length - cols * 2} more`, r.x + 8, r.y + 46 + 68); }
    } else if (b.type === RTS.hall) {
      ctx.fillStyle = C.bone;
      ctx.fillText(me.rtsQueue ? `Training ${me.rtsQueue} peasant${me.rtsQueue > 1 ? 's' : ''}` : `Trains peasants (T): ${costText(RTS.trainCost)}`, r.x + 8, r.y + 46, r.w - 16);
      if (me.rtsQueue) bar(ctx, r.x + 8, r.y + 68, Math.min(220, r.w - 16), 8, me.rtsTrainT || 0, C.candle);
    }
    return;
  }
  if (sel.length === 1) {
    const e = sel[0], size = Math.min(84, r.h - 8);
    portrait(ctx, game, e, r.x + 8, r.y + 4, size, true);
    const x = r.x + size + 20, tw = r.w - size - 28;
    ctx.font = game.font(17, 'display'); ctx.fillStyle = C.pumpkin; ctx.fillText('Peasant', x, r.y + 4, tw);
    ctx.font = game.font(14); ctx.fillStyle = C.bone;
    ctx.fillText(TASKS[e.task] || e.task, x, r.y + 28, tw);
    ctx.fillStyle = 'rgba(239,230,210,0.7)';
    ctx.fillText(e.carry ? `Carrying ${e.carryCount} ${nice(e.carry)}` : 'Carrying nothing', x, r.y + 48, tw);
    if (e.site) ctx.fillText(`Building a ${nice(e.site.kind)}`, x, r.y + 68, tw);
    if (e.work > 0 && (e.task === 'mining' || e.task === 'building')) bar(ctx, x, r.y + 90, Math.min(200, tw), 8, e.work, C.candle);
    return;
  }
  if (sel.length > 1) {
    title(`${sel.length} peasants`);
    for (const p of portraits(game, L)) {
      if (p.y + p.h > r.y + r.h) break;
      portrait(ctx, game, p.e, p.x, p.y, p.w, inside(m, p));
      if (p.e.carry) { ctx.fillStyle = registries.items.get(p.e.carry)?.color || C.bone; ctx.fillRect(p.x + p.w - 9, p.y + 3, 6, 6); }
    }
    return;
  }
  title('Command view');
  ctx.fillStyle = 'rgba(239,230,210,0.75)';
  ['Drag or click to select peasants (Shift adds)', 'Right click: mine a resource, walk, or deliver to a chest',
    'Click a building to inspect it; arrows or edges move the camera', 'F4 or Esc: back to your hero']
    .forEach((line, i) => ctx.fillText(line, r.x + 8, r.y + 28 + i * 20, r.w - 16));
}

function drawCard(ctx, game, L) {
  const C = game.theme.colors, m = game.input.mouse;
  let hover = null;
  for (const b of buttons(game, L)) {
    const over = inside(m, b);
    if (over) hover = b;
    ctx.fillStyle = !b.on ? 'rgba(40,30,40,0.6)' : over ? 'rgba(255,138,26,0.35)' : 'rgba(255,138,26,0.15)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.on ? 'rgba(255,138,26,0.7)' : 'rgba(239,230,210,0.2)'; ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.font = game.font(12);
    ctx.fillStyle = b.on ? C.pumpkin : 'rgba(239,230,210,0.3)'; ctx.fillText(b.hot, b.x + 5, b.y + 4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = game.font(14);
    ctx.fillStyle = b.on ? C.bone : 'rgba(239,230,210,0.35)'; ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 - (b.cost ? 6 : 0), b.w - 8);
    if (b.cost) {
      ctx.font = game.font(11); ctx.fillStyle = affordable(game, b.cost) ? C.candle : '#ff8080';
      ctx.fillText(costText(b.cost), b.x + b.w / 2, b.y + b.h / 2 + 12, b.w - 8);
    }
  }
  if (!hover) return;
  // tooltip above the card
  ctx.font = game.font(13);
  const lines = [hover.tip, hover.cost ? `Cost: ${costText(hover.cost)} (from chests, then your pack)` : null].filter(Boolean);
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16, th = lines.length * 18 + 8;
  const x = Math.max(8, Math.min(L.card.x + L.card.w - tw, game.screen.w - 8 - tw)), y = L.console.y - th - 6;
  panel(ctx, game, { x, y, w: tw, h: th });
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.bone;
  lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 5 + i * 18));
}

function drawView(ctx, game) {
  const s = game._rts;
  if (!s?.on || game.ui !== 'rts' || !game.me) return;
  const L = layout(game);
  drawWorld(ctx, game, s, L);
  drawTop(ctx, game, L.top);
  panel(ctx, game, L.console);
  drawBuildings(ctx, game, L);
  drawInfo(ctx, game, L);
  drawCard(ctx, game, L);
}
