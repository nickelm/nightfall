// TEAM PLAYER (client helper): how magic looks and sounds. Explosions, fireball
// trails, heal motes, the focus shell bubble and beam, the mana bar, health bars
// over other players and wounded creatures, and placeholder drawers (Art may
// override the drawers; it loads last). Glowing particles draw in a HUD with
// additive blending, so they burn bright over the night's darkness.
import { registries, registerClientSystem, registerHud, registerDrawer, onEvent } from '../../shared/registry.js';
import { TILE_PX } from '../../shared/config.js';

const T = TILE_PX;
const now = () => performance.now();
const rand = (a, b) => a + Math.random() * (b - a);

// --------------------------------------------------------------- particles ----
// Positions and speeds in tiles; life and max in seconds.
const particles = [];
const washes = []; // full-screen flashes from nearby big explosions: { x, y, life, max, delay, inner, outer }

function add(p) { particles.push({ vx: 0, vy: 0, drag: 0, grow: 0, ...p, max: p.life }); }

// Fire color by remaining life t (1 -> 0): white-yellow, orange, then deep red.
const fire = (t, a = 1) => `hsla(${Math.round(8 + 47 * t)}, 100%, ${Math.round(42 + 48 * t)}%, ${a})`;
const gold = (t, a = 1) => `hsla(${Math.round(40 + 12 * t)}, 100%, ${Math.round(55 + 35 * t)}%, ${a})`;
const violet = (t, a = 1) => `hsla(${Math.round(268 + 22 * t)}, 100%, ${Math.round(50 + 42 * t)}%, ${a})`;

function burst(x, y, size, kind) {
  const big = size === 'big', heal = kind === 'heal';
  const color = heal ? gold : fire;
  add({ kind: 'core', x, y, life: big ? 0.3 : 0.22, size: big ? 1.2 : 0.7, color });
  add({ kind: 'ring', x, y, life: big ? 0.4 : 0.3, size: 0.2, grow: big ? 6 : 3.5, color });
  const n = heal ? 18 : big ? 46 : 24;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = big ? rand(2.5, 9) : rand(1.5, 6);
    add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (heal ? 1.5 : 0), drag: 3.5,
      life: rand(0.3, big ? 0.9 : 0.6), size: rand(0.04, 0.09), color });
  }
  if (heal) return;
  for (let i = 0; i < (big ? 7 : 3); i++) {
    add({ kind: 'smoke', x: x + rand(-0.3, 0.3), y: y + rand(-0.3, 0.3), vx: rand(-0.4, 0.4), vy: rand(-0.8, -0.2),
      life: rand(0.8, 1.5), size: rand(0.25, 0.45), grow: 0.6 });
  }
  for (let i = 0; i < (big ? 6 : 2); i++) { // embers that drift and glow for a while
    add({ kind: 'spark', x, y, vx: rand(-1.5, 1.5), vy: rand(-2.5, -0.5), drag: 1.2, life: rand(1, 1.8), size: 0.05, color: fire });
  }
}

registerClientSystem('spell-particles', (game, dt) => {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.delay > 0) { p.delay -= dt; continue; } // waiting for its turn (staggered rings)
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k; p.vy *= k;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.size += p.grow * dt;
  }
  for (let i = washes.length - 1; i >= 0; i--) {
    const wsh = washes[i];
    if (wsh.delay > 0) wsh.delay -= dt;
    else if ((wsh.life -= dt) <= 0) washes.splice(i, 1);
  }
  if (craters.some((c) => now() - c.born > CRATER_SECONDS * 1000)) {
    const keep = craters.filter((c) => now() - c.born <= CRATER_SECONDS * 1000);
    craters.length = 0;
    craters.push(...keep);
    indexCraters();
  }

  // flame trails behind every fireball we can see
  for (const e of game.entities.values()) {
    if (e.type !== 'fireball' || !game.canSee(e._rx, e._ry)) continue;
    const len = Math.hypot(e.vx, e.vy) || 1;
    for (let i = 0; i < Math.ceil(dt * 120); i++) {
      add({ kind: 'spark', x: e._rx + rand(-0.08, 0.08), y: e._ry + rand(-0.08, 0.08),
        vx: (-e.vx / len) * rand(0.5, 2) + rand(-0.6, 0.6), vy: (-e.vy / len) * rand(0.5, 2) + rand(-0.6, 0.6),
        drag: 2, life: rand(0.15, 0.4), size: rand(0.05, 0.12), color: fire });
    }
  }
});

registerHud('spell-fx', (ctx, game, w, h) => {
  if (game.ui) return;
  // smoke darkens, so it draws normally first
  for (const p of particles) {
    if (p.kind !== 'smoke' || p.delay > 0) continue;
    const s = game.worldToScreen(p.x, p.y), t = p.life / p.max;
    ctx.fillStyle = `rgba(28,16,30,${0.45 * t})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, p.size * T, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const wsh of washes) {
    if (wsh.delay > 0) continue;
    const s = game.worldToScreen(wsh.x, wsh.y), a = (wsh.strength ?? 0.32) * (wsh.life / wsh.max), r = Math.max(w, h) * 0.7;
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    g.addColorStop(0, `rgba(${wsh.inner || '255,150,40'},${a})`);
    g.addColorStop(0.4, `rgba(${wsh.outer || '220,40,10'},${a * 0.5})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  for (const p of particles) {
    if (p.delay > 0) continue;
    const s = game.worldToScreen(p.x, p.y), t = p.life / p.max;
    if (p.kind === 'spark') {
      const r = Math.max(1, p.size * T * (0.5 + t));
      ctx.fillStyle = p.color(t, 0.35);
      ctx.beginPath(); ctx.arc(s.x, s.y, r * 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color(t);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'core') {
      const r = p.size * T * (1.4 - 0.6 * t);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      g.addColorStop(0, `rgba(255,255,235,${t})`);
      g.addColorStop(0.35, p.color(t, 0.9 * t));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - r, s.y - r, 2 * r, 2 * r);
    } else if (p.kind === 'ring') {
      ctx.strokeStyle = p.color(t, t);
      ctx.lineWidth = 2 + 6 * t;
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, p.size) * T, 0, Math.PI * 2); ctx.stroke();
    } else if (p.kind === 'streak') { // a meteor's tail, ending where it struck
      ctx.strokeStyle = fire(t, t);
      ctx.lineWidth = 2 + 4 * t;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x - 1.2 * T * t, s.y - 3 * T * t); ctx.lineTo(s.x, s.y); ctx.stroke();
    } else if (p.kind === 'text') {
      ctx.font = game.font(20, 'display');
      ctx.textAlign = 'center';
      ctx.fillStyle = gold(t, Math.min(1, t * 2));
      ctx.fillText(p.text, s.x, s.y);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
});

// ---------------------------------------------------------------- craters ----
// Scorch marks where fire lands. They are part of the ground: every tile drawer is
// wrapped (once all modules have registered theirs, on 'ready') to paint the craters
// over its tile, so they lie under creatures and players and night and fog dim them
// like the tiles. Each one smoulders for a moment, then fades over CRATER_SECONDS.
const CRATER_SECONDS = 20, CRATER_FADE = 8, EMBER_SECONDS = 3, MAX_CRATERS = 150;
const craters = [];            // { x, y, r, born, seed }
const craterTiles = new Map(); // 'tx,ty' -> craters overlapping that tile

function indexCraters() {
  craterTiles.clear();
  for (const c of craters) {
    for (let ty = Math.floor(c.y - c.r); ty <= Math.floor(c.y + c.r); ty++) {
      for (let tx = Math.floor(c.x - c.r); tx <= Math.floor(c.x + c.r); tx++) {
        const key = `${tx},${ty}`;
        if (!craterTiles.has(key)) craterTiles.set(key, []);
        craterTiles.get(key).push(c);
      }
    }
  }
}

function addCrater(x, y, size) {
  const r = size === 'nova' ? 1.5 : size === 'big' ? 0.85 : 0.55;
  const old = craters.find((c) => Math.hypot(c.x - x, c.y - y) < 0.3); // a fresh hit on an old crater
  if (old) { old.born = now(); old.r = Math.max(old.r, r); }
  else craters.push({ x, y, r, born: now(), seed: rand(0, Math.PI * 2) });
  if (craters.length > MAX_CRATERS) craters.shift();
  indexCraters();
}

function drawCraters(ctx, list, px, py, size, tx, ty) {
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, size, size); ctx.clip(); // the neighbours paint their own part
  for (const c of list) {
    const age = (now() - c.born) / 1000, a = Math.min(1, (CRATER_SECONDS - age) / CRATER_FADE);
    if (a <= 0) continue;
    const cx = px + (c.x - tx) * size, cy = py + (c.y - ty) * size, r = c.r * size;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(10,5,3,${0.8 * a})`);
    g.addColorStop(0.5, `rgba(28,14,8,${0.6 * a})`);
    g.addColorStop(0.8, `rgba(55,30,18,${0.35 * a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, size, size);
    ctx.strokeStyle = `rgba(8,4,2,${0.55 * a})`; // cracks splaying out from the blast
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      const ang = c.seed + k * 1.05 + Math.sin(c.seed * 7 + k) * 0.3, len = r * (0.9 + 0.35 * Math.sin(c.seed * 3 + k * 2));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r * 0.3, cy + Math.sin(ang) * r * 0.3);
      ctx.lineTo(cx + Math.cos(ang + 0.15) * len, cy + Math.sin(ang + 0.15) * len);
      ctx.stroke();
    }
    if (age < EMBER_SECONDS) { // still smouldering
      const e = 1 - age / EMBER_SECONDS;
      const h = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.6);
      h.addColorStop(0, `rgba(255,130,40,${0.7 * e})`);
      h.addColorStop(1, 'rgba(200,30,0,0)');
      ctx.fillStyle = h;
      ctx.fillRect(px, py, size, size);
    }
  }
  ctx.restore();
}

onEvent('ready', () => {
  for (const tile of registries.tiles) {
    const key = `tile:${tile.name}`, inner = registries.drawers.get(key);
    if (inner?.craters || /water|lava/.test(tile.name)) continue;
    const wrapped = (ctx, t, px, py, size, tx, ty, game) => {
      if (inner) inner(ctx, t, px, py, size, tx, ty, game);
      else { ctx.fillStyle = t.color; ctx.fillRect(px, py, size, size); } // what render.js does without a drawer
      const list = craterTiles.get(`${tx},${ty}`);
      if (list) drawCraters(ctx, list, px, py, size, tx, ty);
    };
    wrapped.craters = true;
    registries.drawers.set(key, wrapped);
  }
});

// ------------------------------------------------------------------ sound ----
// A tiny synth of our own (Art's blip lives in another team's folder).
let audio = null;
const unlock = () => { const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (AC) audio ||= new AC(); };
globalThis.addEventListener?.('keydown', unlock, { once: true }); // absent when tests import client.js in Node
globalThis.addEventListener?.('mousedown', unlock, { once: true });

function tone(freq, dur, type, vol, end = freq) {
  if (!audio || vol <= 0.001) return;
  const t = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(audio.destination);
  osc.start(t); osc.stop(t + dur);
}

function rumble(dur, vol, cutoff) {
  if (!audio || vol <= 0.001) return;
  const t = audio.currentTime, len = Math.floor(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, len, audio.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
  src.buffer = buf;
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start(t);
}

const loudness = (game, x, y) => (game.me ? Math.max(0, 1 - Math.hypot(x - game.me.x, y - game.me.y) / 18) : 0);

// ----------------------------------------------------------------- events ----
onEvent('net:boom', (game, { x, y, size, kind }) => {
  const v = loudness(game, x, y);
  if (kind === 'heal') tone(660, 0.4, 'triangle', 0.06 * v, 1320);
  else if (size === 'big') { rumble(0.6, 0.35 * v, 500); tone(80, 0.4, 'sine', 0.12 * v, 35); }
  else { rumble(0.3, 0.22 * v, 900); tone(140, 0.2, 'sine', 0.06 * v, 50); }
  if (kind !== 'heal') addCrater(x, y, size);
  if (!game.canSee(x, y)) return;
  burst(x, y, size, kind);
  if (size === 'big') {
    add({ kind: 'streak', x, y, life: 0.22, size: 0 });
    if (v > 0.5) washes.push({ x, y, life: 0.35, max: 0.35 });
  }
});

onEvent('net:cast', (game, { spell, x, y, tx, ty, amount }) => {
  const v = loudness(game, x, y);
  const a = Math.atan2(ty - y, tx - x), hx = x + Math.cos(a) * 0.5, hy = y + Math.sin(a) * 0.5;
  const color = spell === 'heal' || spell === 'shell' ? gold : fire;
  if (game.canSee(hx, hy)) { // a flare at the tip of the staff
    add({ kind: 'core', x: hx, y: hy, life: 0.18, size: 0.45, color });
    for (let i = 0; i < 10; i++) {
      const b = a + rand(-0.7, 0.7), s = rand(2, 5);
      add({ kind: 'spark', x: hx, y: hy, vx: Math.cos(b) * s, vy: Math.sin(b) * s, drag: 5, life: rand(0.15, 0.35), size: 0.05, color });
    }
  }
  if (spell === 'fireball') { rumble(0.25, 0.08 * v, 2500); tone(220, 0.2, 'sawtooth', 0.03 * v, 660); }
  if (spell === 'firestorm') {
    tone(110, 0.9, 'sawtooth', 0.05 * v, 55);
    if (game.canSee(tx, ty)) add({ kind: 'ring', x: tx, y: ty, life: 0.5, size: 2.8, grow: -4, color: fire });
  }
  if (spell === 'shell') tone(220, 0.5, 'sine', 0.06 * v, 440);
  if (spell === 'heal' && game.canSee(tx, ty)) {
    for (let i = 0; i < 16; i++) {
      add({ kind: 'spark', x: tx + rand(-0.4, 0.4), y: ty + rand(-0.2, 0.4), vx: rand(-0.2, 0.2), vy: rand(-2, -0.8),
        life: rand(0.6, 1.1), size: rand(0.04, 0.07), color: gold });
    }
    add({ kind: 'text', text: `+${amount}`, x: tx, y: ty - 0.7, vy: -1.2, drag: 1, life: 1.1 });
  }
});

onEvent('net:shellHit', (game, { id }) => {
  const e = game.entities.get(id);
  if (!e || !game.canSee(e._rx, e._ry)) return;
  add({ kind: 'ring', x: e._rx, y: e._ry, life: 0.3, size: 0.55, grow: 1.2, color: gold });
  tone(1200, 0.12, 'triangle', 0.05 * loudness(game, e.x, e.y), 900);
});

// A nova: the caster flashes purple-white and rings of violet fire roll out to its
// radius, three in a row, while the whole screen strobes violet if you are close.
onEvent('net:nova', (game, { x, y, radius }) => {
  const v = loudness(game, x, y);
  rumble(0.9, 0.4 * v, 350);
  tone(70, 0.8, 'sine', 0.16 * v, 28);
  tone(1400, 0.6, 'triangle', 0.05 * v, 220);
  addCrater(x, y, 'nova');
  if (!game.canSee(x, y)) return;
  add({ kind: 'core', x, y, life: 0.4, size: 1.6, color: violet });
  for (let i = 0; i < 3; i++) {
    add({ kind: 'ring', x, y, life: 0.45, size: 0.3, grow: radius / 0.4, color: i === 1 ? fire : violet, delay: i * 0.12 });
  }
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2), s = rand(radius * 1.5, radius * 3.2);
    add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 2.5, life: rand(0.3, 0.8), size: rand(0.05, 0.1),
      color: i % 4 ? violet : fire, delay: rand(0, 0.15) });
  }
  if (v > 0.4) {
    for (let i = 0; i < 3; i++) {
      washes.push({ x, y, life: 0.09, max: 0.09, delay: i * 0.13, strength: 0.45, inner: '230,170,255', outer: '120,40,200' });
    }
  }
});

// A sword swing that taunts: a red shout ring from the fighter.
onEvent('net:taunt', (game, { x, y }) => {
  if (!game.canSee(x, y)) return;
  add({ kind: 'ring', x, y, life: 0.35, size: 0.4, grow: 9, color: (t, a = 1) => `rgba(220,40,40,${a * 0.7})` });
});

// ------------------------------------------------- focus shell: bubble, beam ----
registerHud('spell-shell', (ctx, game) => {
  if (game.ui) return;
  const t = now() / 1000;
  ctx.globalCompositeOperation = 'lighter';
  for (const caster of game.entities.values()) { // the beam from caster to friend
    if (caster.type !== 'player' || caster.channeling == null) continue;
    const target = game.entities.get(caster.channeling);
    if (!target || (!game.canSee(caster._rx, caster._ry) && !game.canSee(target._rx, target._ry))) continue;
    const a = game.worldToScreen(caster._rx, caster._ry), b = game.worldToScreen(target._rx, target._ry);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (const [width, alpha, wave] of [[10, 0.18, 6], [4, 0.45, 4], [1.5, 0.95, 2]]) {
      ctx.strokeStyle = `rgba(255,${alpha > 0.9 ? 250 : 200},${alpha > 0.9 ? 220 : 90},${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const f = i / 24, off = Math.sin(f * 14 - t * 12) * wave * Math.sin(f * Math.PI);
        const px = a.x + dx * f + nx * off, py = a.y + dy * f + ny * off;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  }
  for (const e of game.entities.values()) { // the bubble around each shelled player
    if (e.type !== 'player' || !e.shelled || !game.canSee(e._rx, e._ry)) continue;
    const p = game.worldToScreen(e._rx, e._ry), r = T * (0.62 + 0.03 * Math.sin(t * 6));
    const g = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r);
    g.addColorStop(0, 'rgba(255,200,80,0)');
    g.addColorStop(0.85, 'rgba(255,190,60,0.22)');
    g.addColorStop(1, 'rgba(255,230,140,0.5)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,236,170,0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { // glints sliding around the surface
      const s = t * 2 + (i * Math.PI * 2) / 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, s, s + 0.6); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
});

// ----------------------------------------------------- health and mana bars ----
const maxHpOf = (e) => e.maxHp ?? registries.entityTypes.get(e.type)?.defaults?.hp ?? e.hp;

// A bar over every other player we can see (above the name and level line Art writes),
// and over any wounded creature. A creature taunted by a sword also gets a red "!".
const NAME_PX = 16, RANK_PX = 13;
registerHud('health-bars', (ctx, game) => {
  if (game.ui) return;
  const C = game.theme.colors;
  for (const e of game.entities.values()) {
    if (e.id === game.myId || !(e.hp > 0)) continue;
    const max = maxHpOf(e);
    const isPlayer = e.type === 'player';
    const taunted = (e.tauntedUntil || 0) > game.time;
    if (!isPlayer && !(e.hp < max) && !taunted) continue;
    if (!game.canSee(e._rx, e._ry)) continue;
    const p = game.worldToScreen(e._rx, e._ry);
    const bw = T * 0.8, bh = 5, x = p.x - bw / 2;
    const above = NAME_PX + (e.level ? RANK_PX : 0) + (e.maxMana > 0 ? 3 : 0); // name, then Art's level and title line
    const y = isPlayer ? p.y - T * 0.5 - above - bh : p.y - T * 0.62 * (e.size || 1) - bh;
    if (taunted) {
      ctx.font = game.font(18, 'display');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = C.blood;
      ctx.fillText('!', p.x, y - 2 + Math.sin(now() / 120) * 1.5);
    }
    if (!isPlayer && !(e.hp < max)) continue;
    ctx.fillStyle = C.panel;
    ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2 + (e.maxMana > 0 ? 3 : 0));
    ctx.fillStyle = C.blood;
    ctx.fillRect(x, y, bw * Math.max(0, Math.min(1, e.hp / max)), bh);
    if (e.maxMana > 0) {
      ctx.fillStyle = C.moon;
      ctx.fillRect(x, y + bh + 1, bw * Math.max(0, e.mana / e.maxMana), 2);
    }
    if (e.shelled) {
      ctx.strokeStyle = C.candle;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 1.5, y - 1.5, bw + 3, bh + 3 + (e.maxMana > 0 ? 3 : 0));
    }
  }
});

// Our own mana, right-aligned above the hotbar (mirrors hotbarSlot in survival/client.js).
const SLOTS = 9, SLOT = 46, GAP = 4;
registerHud('mana-bar', (ctx, game, w, h) => {
  const me = game.me;
  if (!me || !(me.maxMana > 0)) return;
  const C = game.theme.colors;
  const total = SLOTS * (SLOT + GAP) - GAP, right = (w + total) / 2, top = h - SLOT - 44 - 28;
  const bw = 150, bh = 12, x = right - bw, f = Math.max(0, Math.min(1, me.mana / me.maxMana));
  ctx.fillStyle = C.panel;
  ctx.fillRect(x - 2, top - 2, bw + 4, bh + 4);
  const g = ctx.createLinearGradient(x, 0, x + bw, 0);
  g.addColorStop(0, C.purple);
  g.addColorStop(1, C.moon);
  ctx.fillStyle = g;
  ctx.fillRect(x, top, bw * f, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, top + 1, bw * f, 3);
  ctx.font = game.font(11);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.bone;
  ctx.fillText(`mana ${Math.floor(me.mana)}/${me.maxMana}`, x + bw / 2, top + bh / 2 + 1);
});

// ---------------------------------------------------------------- drawers ----
registerDrawer('fireball', (ctx, e, sx, sy, size) => {
  const a = Math.atan2(e.vy, e.vx), fl = Math.sin(now() / 40 + e.id) * 0.04;
  ctx.translate(sx, sy);
  ctx.rotate(a);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.55);
  g.addColorStop(0, 'rgba(255,140,40,0.7)');
  g.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5a1a'; // a flame streaming back from the head
  ctx.beginPath();
  ctx.moveTo(size * 0.2, 0);
  ctx.quadraticCurveTo(0, -size * (0.22 + fl), -size * 0.55, 0);
  ctx.quadraticCurveTo(0, size * (0.22 - fl), size * 0.2, 0);
  ctx.fill();
  ctx.fillStyle = '#ffd040';
  ctx.beginPath(); ctx.arc(size * 0.05, 0, size * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fffbe0';
  ctx.beginPath(); ctx.arc(size * 0.07, 0, size * 0.08, 0, Math.PI * 2); ctx.fill();
});

registerDrawer('blast', () => {}); // only light and particles: no body

// Scorched ground under a firestorm, with an ember ring marking its edge.
registerDrawer('firestorm', (ctx, e, sx, sy, size) => {
  const r = e.radius * size, pulse = 0.5 + 0.5 * Math.sin(now() / 90);
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  g.addColorStop(0, 'rgba(40,8,0,0.55)');
  g.addColorStop(0.8, 'rgba(120,20,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(255,${80 + 80 * pulse},20,${0.5 + 0.4 * pulse})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([size * 0.2, size * 0.15]);
  ctx.lineDashOffset = -now() / 30;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
});

// A dark wooden staff with a glowing orb, also shown in the player's hand.
registerDrawer('item:staff', (ctx, item, cx, cy, s) => {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a0f0a';
  ctx.lineWidth = Math.max(3, s * 0.13);
  ctx.beginPath(); ctx.moveTo(cx - s * 0.32, cy + s * 0.34); ctx.lineTo(cx + s * 0.18, cy - s * 0.16); ctx.stroke();
  ctx.strokeStyle = '#5b3a1e';
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  ctx.stroke();
  ctx.strokeStyle = item.color; // a violet band under the orb
  ctx.lineWidth = Math.max(2, s * 0.1);
  ctx.beginPath(); ctx.moveTo(cx + s * 0.08, cy - s * 0.06); ctx.lineTo(cx + s * 0.14, cy - s * 0.12); ctx.stroke();
  const ox = cx + s * 0.24, oy = cy - s * 0.22, r = s * 0.15, pulse = 0.85 + 0.15 * Math.sin(now() / 200);
  const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 2.2 * pulse);
  g.addColorStop(0, 'rgba(255,170,60,0.6)');
  g.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(ox, oy, r * 2.2 * pulse, 0, Math.PI * 2); ctx.fill();
  const o = ctx.createRadialGradient(ox - r * 0.3, oy - r * 0.3, 0, ox, oy, r);
  o.addColorStop(0, '#fff3b0');
  o.addColorStop(0.5, '#ff7a1a');
  o.addColorStop(1, '#c0262f');
  ctx.fillStyle = o;
  ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.fill();
});
