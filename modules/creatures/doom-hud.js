// Doom-style skin for the first-person view (first-person.js calls in here): a chunky
// pixel weapon in your hand that bobs while you walk and kicks when you attack, a grey
// stone status bar (ammo, health %, arms, a face, stamina, resources), red flashes when
// you are hurt, gold flashes and "picked up" lines when your inventory grows.
// Everything is drawn at 320 pixels across and scaled up without smoothing.
import { registries } from '../../shared/registry.js';

const PW = 320;   // pixel-art width of the status bar; it is 32 of those pixels high
const BAR = 32;
const scaleOf = (w, h) => Math.min(w / PW, (h * 0.22) / BAR);
/** Screen pixels the core key hints take at the bottom (same wrapping as client/core/render.js). */
export function hintHeight(ctx, game, w) {
  ctx.save();
  ctx.font = game.font(12);
  let lines = 1, line = '';
  for (const k of registries.keyHints) {
    const part = `${k.key} ${k.label}`, next = line ? `${line}   ${part}` : part;
    if (ctx.measureText(next).width > w - 40 && line) { lines++; line = part; } else line = next;
  }
  ctx.restore();
  return registries.keyHints.length ? lines * 15 + 10 : 0;
}
/** Height in screen pixels of the 3D view above the status bar. */
export const viewHeight = (w, h) => Math.floor(h - BAR * scaleOf(w, h));

// --- a 3x5 pixel font: each glyph is five rows of three bits ---
const GLYPHS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001111', '%': '101001010100101', ' ': '000000000000000',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '.': '000000000000010', '-': '000000111000000',
  '!': '010010010000010', ':': '000010000010000', '/': '001001010100100',
};
function text(c, str, x, y, s, color, shadow = '#000') {
  str = String(str).toUpperCase();
  for (const pass of shadow ? [0, 1] : [1]) {
    c.fillStyle = pass ? color : shadow;
    const o = pass ? 0 : Math.max(1, s / 2);
    for (let i = 0; i < str.length; i++) {
      const g = GLYPHS[str[i]] || GLYPHS[' '];
      for (let b = 0; b < 15; b++) if (g[b] === '1') c.fillRect(x + o + (i * 4 + (b % 3)) * s, y + o + Math.floor(b / 3) * s, s, s);
    }
  }
}
const textW = (str, s) => String(str).length * 4 * s - s;

// --- per-frame state lives on game._doom ---
function stateOf(game) {
  const me = game.me;
  const d = (game._doom ||= { t: performance.now(), bob: 0, moving: 0, swingAt: -9, hurt: 0, gold: 0,
    hp: me.hp, inv: { ...(me.inventory || {}) }, msgs: [], held: null, raise: 1, lookAt: 0, look: 0, grinUntil: 0, ouchUntil: 0 });
  const now = performance.now(), dt = Math.min(0.1, (now - d.t) / 1000);
  d.t = now; d.dt = dt;
  // walking: bob while the position changes
  const moved = d.px === undefined ? 0 : Math.hypot(me.x - d.px, me.y - d.py) / Math.max(dt, 1e-3);
  d.px = me.x; d.py = me.y;
  d.moving += ((moved > 0.5 ? 1 : 0) - d.moving) * Math.min(1, dt * 8);
  d.bob += dt * (me.running ? 13 : 9) * d.moving;
  // hurt and pickups
  if (me.hp < d.hp) { d.hurt = Math.min(0.75, d.hurt + 0.25 + (d.hp - me.hp) * 0.08); d.ouchUntil = now + (d.hp - me.hp >= 4 ? 900 : 500); }
  d.hp = me.hp;
  const inv = me.inventory || {};
  for (const [name, n] of Object.entries(inv)) {
    const gain = n - (d.inv[name] || 0);
    if (gain <= 0) continue;
    d.gold = Math.min(0.35, d.gold + 0.18);
    d.msgs.push({ text: gain > 1 ? `Picked up ${gain} ${name.replace(/-/g, ' ')}.` : `Picked up a ${name.replace(/-/g, ' ')}.`, until: now + 2600 });
    if (registries.items.get(name)?.weapon || /sword|axe|staff|bow/.test(name)) d.grinUntil = now + 1500;
  }
  d.inv = { ...inv };
  if (d.msgs.length > 4) d.msgs.splice(0, d.msgs.length - 4);
  d.msgs = d.msgs.filter((m) => m.until > now);
  d.hurt = Math.max(0, d.hurt - dt * 0.9);
  d.gold = Math.max(0, d.gold - dt * 0.8);
  // weapon swap: lower the old one, raise the new one
  const held = me.hotbar?.[me.selected] || null;
  if (held !== d.held) { d.held = held; d.raise = 1; }
  d.raise = Math.max(0, d.raise - dt * 4);
  // the face glances left and right now and then
  if (now > d.lookAt) { d.look = [-1, 0, 0, 1][Math.floor(Math.random() * 4)]; d.lookAt = now + 600 + Math.random() * 1400; }
  return d;
}

/**
 * Call once per frame from the client system. A press attacks through the player module;
 * holding Space or the left button keeps attacking here, once per weapon cooldown.
 * Holding at a harvestable tile mines instead, and a staff casts spells instead.
 */
export function noteInput(game, aim) {
  const d = game._doom, me = game.me;
  if (!d || game.ui) return;
  const k = game.input, now = performance.now();
  const held = me.hotbar?.[me.selected], w = registries.items.get(held)?.weapon;
  const cd = (w?.cooldown ?? 0.35) * 1000 + 30; // a little slack so the server's cooldown has passed
  if (k.clicked(0) || k.pressed('Space')) { d.swingAt = now; return; } // the player module sends this one
  if (!(k.mouseDown(0) || k.down('Space')) || now - d.swingAt < cd) return;
  if (/staff|wand/.test(held || '') || me.guarding || !(me.hp > 0)) return;
  const monster = [...game.entities.values()].some((e) => e.hostile && e.hp > 0 && Math.hypot(e._rx - aim.x, e._ry - aim.y) < 0.7);
  const t = game.targetTile(1.8);
  if (!monster && game.world.tile(t.x, t.y)?.harvest) return;
  d.swingAt = now;
  game.sendAction('attack', {});
}

// --- which weapon sprite goes with the held item ---
function kindOf(name) {
  const def = registries.items.get(name);
  if (!name || !def) return 'fist';
  if (def.weapon?.kind === 'ranged') return 'shotgun';
  if (def.tool === 'axe') return 'chainsaw';
  if (def.tool === 'pickaxe') return 'pickaxe';
  if (/staff|wand/.test(name)) return 'staff';
  if (def.weapon?.kind === 'melee' || /sword/.test(name)) return 'sword';
  return 'item';
}

// --- the weapon, drawn into a 320-wide buffer ---
const wbuf = document.createElement('canvas');
const wctx = wbuf.getContext('2d');

const shade = (hex, f) => {
  let h = String(hex || '#888').replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  const k = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${k((n >> 16) & 255)},${k((n >> 8) & 255)},${k(n & 255)})`;
};

function glove(c, x, y, s = 1) {        // a green-grey armoured glove, fingers up
  c.fillStyle = '#3c4a2c'; c.fillRect(x - 12 * s, y, 24 * s, 40 * s);
  c.fillStyle = '#56683c'; c.fillRect(x - 10 * s, y + 2 * s, 20 * s, 36 * s);
  c.fillStyle = '#6f8650'; c.fillRect(x - 8 * s, y + 4 * s, 6 * s, 30 * s);
  c.fillStyle = '#2a3320';
  for (let i = 0; i < 3; i++) c.fillRect(x - 5 * s + i * 6 * s, y, 1 * s, 10 * s);
}

function drawWeapon(c, kind, item, t, swing, mining, game, H) {
  const flash = kind === 'shotgun' ? swing < 0.12 : kind === 'staff' ? swing < 0.2 : false;
  if (kind === 'fist') {
    // one fist punches up from the bottom right
    const p = swing < 1 ? Math.sin(Math.min(1, swing / 0.35) * Math.PI) : 0;
    const x = 210 - p * 50, y = H - 48 - p * 40;
    c.fillStyle = '#c98f6a'; c.fillRect(x - 22, y, 44, 34);
    c.fillStyle = '#e8b08a'; c.fillRect(x - 18, y + 3, 36, 10);
    c.fillStyle = '#8a5a3e';
    for (let i = 0; i < 4; i++) c.fillRect(x - 20 + i * 11, y + 14, 1, 10);
    c.fillStyle = '#3c4a2c'; c.fillRect(x - 20, y + 32, 40, 30);
    c.fillStyle = '#56683c'; c.fillRect(x - 16, y + 34, 12, 28);
    return;
  }
  if (kind === 'shotgun' || kind === 'chainsaw') {   // two-handed: drawn half again as large
    c.save(); c.translate(160, H); c.scale(1.5, 1.5); c.translate(-160, -H);
    drawHeavy(c, kind, item, t, swing, mining, H, flash);
    c.restore();
    return;
  }
  drawSwung(c, kind, item, t, swing, mining, game, H, flash);
}

function drawHeavy(c, kind, item, t, swing, mining, H, flash) {
  if (kind === 'shotgun') {
    const kick = swing < 0.5 ? Math.sin(Math.min(1, swing / 0.5) * Math.PI) : 0;
    const x = 160, y = H - 56 + kick * 10;
    if (flash) {
      c.fillStyle = '#fff6a0'; c.beginPath(); c.arc(x, y - 6, 22, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffb030'; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + t; c.fillRect(x + Math.cos(a) * 20 - 3, y - 6 + Math.sin(a) * 14 - 3, 7, 7); }
      c.fillStyle = '#ffffff'; c.fillRect(x - 8, y - 12, 16, 12);
    }
    c.fillStyle = '#1e1e22'; c.fillRect(x - 12, y, 24, 70);             // barrels
    c.fillStyle = '#3a3a44'; c.fillRect(x - 10, y, 9, 70); c.fillRect(x + 1, y, 9, 70);
    c.fillStyle = '#6a6a78'; c.fillRect(x - 8, y + 2, 3, 66); c.fillRect(x + 3, y + 2, 3, 66);
    c.fillStyle = '#000'; c.fillRect(x - 8, y, 5, 3); c.fillRect(x + 3, y, 5, 3);
    c.fillStyle = shade(item?.color || '#8b5a2b', 0.8); c.fillRect(x - 16, y + 30, 32, 40); // wooden pump
    c.fillStyle = shade(item?.color || '#8b5a2b', 1.1); c.fillRect(x - 14, y + 32, 8, 36);
    c.fillStyle = shade(item?.color || '#8b5a2b', 0.55);
    for (let i = 0; i < 5; i++) c.fillRect(x - 16, y + 36 + i * 7, 32, 1);
    glove(c, x + 20, y + 40); glove(c, x - 22, y + 46);
    return;
  }
  if (kind === 'chainsaw') {
    const buzz = mining || swing < 0.6 ? 1 : 0.3, jx = (Math.random() - 0.5) * 3 * buzz, jy = (Math.random() - 0.5) * 3 * buzz;
    const x = 166 + jx, y = H - 52 + jy;
    c.fillStyle = '#9aa0a8'; c.fillRect(x - 10, y - 30, 20, 60);            // bar
    c.fillStyle = '#d8dce2'; c.fillRect(x - 8, y - 28, 5, 56);
    c.fillStyle = '#222';                                                     // running teeth
    const off = Math.floor(t * 40 * buzz) % 6;
    for (let i = -32; i < 32; i += 6) { c.fillRect(x - 13, y + i + off, 3, 3); c.fillRect(x + 10, y + i + 3 - off, 3, 3); }
    c.fillStyle = shade(item?.color || '#c63', 0.9); c.fillRect(x - 26, y + 26, 52, 46); // body in the tier color
    c.fillStyle = shade(item?.color || '#c63', 1.25); c.fillRect(x - 22, y + 30, 18, 10);
    c.fillStyle = '#1c1c1c'; c.fillRect(x - 30, y + 36, 6, 30); c.fillRect(x + 24, y + 40, 8, 24);
    glove(c, x - 34, y + 58); glove(c, x + 30, y + 62);
  }
}

function drawSwung(c, kind, item, t, swing, mining, game, H, flash) {
  // swung weapons: sword, pickaxe, staff, held items. They arc down-left when swung.
  const active = mining ? (t * 3) % 1 : swing < 0.4 ? swing / 0.4 : 1;
  const p = active < 1 ? Math.sin(active * Math.PI) : 0;
  c.save();
  c.translate(220 - p * 70, H - 30 + p * 10);
  c.rotate(-0.35 - p * 0.9);
  if (kind === 'sword') {
    const col = item?.color || '#cfd3da', big = item?.doubleSword ? 1.4 : 1;
    c.fillStyle = shade(col, 0.7); c.fillRect(-6 * big, -110 * big, 12 * big, 100 * big);
    c.fillStyle = shade(col, 1.15); c.fillRect(-3 * big, -108 * big, 4 * big, 96 * big);
    c.fillStyle = shade(col, 0.45); c.fillRect(-6 * big, -114 * big, 12 * big, 4 * big);
    c.fillStyle = '#7a5a20'; c.fillRect(-18, -12, 36, 8);                  // guard
    c.fillStyle = '#c9a040'; c.fillRect(-18, -12, 36, 2);
    c.fillStyle = '#4a2c18'; c.fillRect(-4, -4, 8, 26);                   // grip
  } else if (kind === 'pickaxe') {
    c.fillStyle = '#6b4424'; c.fillRect(-4, -90, 8, 110);                 // handle
    c.fillStyle = '#8b5a2b'; c.fillRect(-2, -88, 3, 106);
    const col = item?.color || '#9aa0aa';
    c.fillStyle = shade(col, 0.75); c.fillRect(-46, -98, 92, 12);         // head
    c.fillStyle = shade(col, 1.2); c.fillRect(-44, -97, 88, 3);
    c.fillStyle = shade(col, 0.5); c.fillRect(-52, -92, 8, 8); c.fillRect(44, -92, 8, 8);
  } else if (kind === 'staff') {
    c.fillStyle = '#3a2416'; c.fillRect(-4, -100, 8, 130);
    const g = 0.6 + 0.4 * Math.sin(t * 6) + (flash ? 1 : 0);
    c.fillStyle = `rgba(160,90,255,${Math.min(1, 0.35 * g)})`; c.beginPath(); c.arc(0, -108, 22 + g * 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = item?.color || '#6a3fa0'; c.fillRect(-10, -118, 20, 20);
    c.fillStyle = '#e6d0ff'; c.fillRect(-4, -112, 8, 8);
  } else {
    const drawer = registries.drawers.get(`item:${item?.name}`);
    c.save(); c.translate(0, -30);
    if (drawer) { try { drawer(c, item, 0, 0, 56, game); } catch { /* the regular hotbar logs drawer errors */ } }
    else { c.fillStyle = item?.color || '#888'; c.fillRect(-20, -20, 40, 40); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(-20, -20, 40, 6); }
    c.restore();
  }
  c.restore();
  glove(c, 220 - p * 70 + 8, H - 24 + p * 10, 1);
}

// --- the face: original grim mug, bloodier as health drops ---
function drawFace(c, x, y, hpFrac, d, now, dead) {
  const look = now < d.ouchUntil ? 0 : d.look;
  const ouch = now < d.ouchUntil, grin = now < d.grinUntil;
  c.fillStyle = '#1a120c'; c.fillRect(x - 13, y - 1, 26, 30);
  c.fillStyle = '#5b3a1e'; c.fillRect(x - 12, y, 24, 7);                  // hair
  c.fillStyle = dead ? '#8a6a5a' : '#c98f6a'; c.fillRect(x - 11, y + 5, 22, 22);
  c.fillStyle = '#e1a982'; c.fillRect(x - 9 + look, y + 6, 8, 4);
  c.fillStyle = '#5b3a1e'; c.fillRect(x - 12, y + 4, 3, 8); c.fillRect(x + 9, y + 4, 3, 8);
  // brows and eyes
  c.fillStyle = '#3a2412';
  c.fillRect(x - 8, y + 10, 6, 1 + (ouch ? 1 : 0)); c.fillRect(x + 2, y + 10, 6, 1 + (ouch ? 1 : 0));
  if (dead) {
    c.fillStyle = '#300';
    for (const ex of [x - 6, x + 4]) { c.fillRect(ex, y + 12, 1, 1); c.fillRect(ex + 2, y + 12, 1, 1); c.fillRect(ex + 1, y + 13, 1, 1); c.fillRect(ex, y + 14, 1, 1); c.fillRect(ex + 2, y + 14, 1, 1); }
  } else {
    c.fillStyle = '#fff'; c.fillRect(x - 7, y + 12, 4, ouch ? 4 : 3); c.fillRect(x + 3, y + 12, 4, ouch ? 4 : 3);
    c.fillStyle = '#2a4a8a'; const ex = Math.max(-1, Math.min(1, look)) + 1;
    c.fillRect(x - 7 + ex, y + 12, 2, 2); c.fillRect(x + 3 + ex, y + 12, 2, 2);
  }
  c.fillStyle = '#a8705a'; c.fillRect(x - 1, y + 15, 2, 4);              // nose
  c.fillStyle = '#4a1a12';                                                // mouth
  if (dead) c.fillRect(x - 4, y + 22, 8, 2);
  else if (ouch) c.fillRect(x - 3, y + 21, 6, 4);
  else if (grin) { c.fillRect(x - 6, y + 21, 12, 2); c.fillStyle = '#fff'; c.fillRect(x - 5, y + 21, 10, 1); }
  else if (hpFrac < 0.4) { c.fillRect(x - 4, y + 22, 8, 1); c.fillRect(x - 5, y + 23, 1, 1); c.fillRect(x + 4, y + 23, 1, 1); }
  else c.fillRect(x - 4, y + 22, 8, 1);
  // blood: more streaks the lower your health
  c.fillStyle = '#9a1010';
  const wounds = dead ? 5 : Math.floor((1 - hpFrac) * 5);
  const spots = [[-10, 6, 3, 9], [6, 18, 3, 7], [-4, 24, 3, 4], [8, 6, 2, 10], [-11, 16, 4, 6]];
  for (let i = 0; i < wounds; i++) { const [sx, sy, sw, sh] = spots[i]; c.fillRect(x + sx, y + sy, sw, sh); }
}

// --- the status bar, drawn into the same 320-wide buffer ---
function panel(c, x, y, w, h) {
  c.fillStyle = '#4e4a46'; c.fillRect(x, y, w, h);
  c.fillStyle = '#6a655e'; c.fillRect(x, y, w, 1); c.fillRect(x, y, 1, h);
  c.fillStyle = '#2a2724'; c.fillRect(x, y + h - 1, w, 1); c.fillRect(x + w - 1, y, 1, h);
}

function drawBar(c, game, d, y0, bh, now, left, fullW) {
  const me = game.me;
  // stone base with grit, across the whole screen width
  c.fillStyle = '#5d5852'; c.fillRect(0, y0, fullW, bh);
  for (let i = 0; i < fullW; i++) {
    const h = (i * 2654435761) >>> 0;
    c.fillStyle = h & 1 ? '#6b665f' : '#4a4641';
    c.fillRect(h % fullW, y0 + ((h >> 9) % bh), 2, 1);
  }
  c.fillStyle = '#2a2724'; c.fillRect(0, y0, fullW, 1);

  const s = 3;                                              // digit pixel size
  const held = me.hotbar?.[me.selected];
  const def = registries.items.get(held);
  // AMMO: arrows for a bow, mana for a staff, otherwise the stack in hand
  let ammo = '';
  if (def?.weapon?.ammo) ammo = me.inventory?.[def.weapon.ammo] || 0;
  else if (me.maxMana > 0 && /staff|wand/.test(held || '')) ammo = Math.floor(me.mana || 0);
  else if (held && !def?.weapon && !def?.tool) ammo = me.inventory?.[held] || 0;
  const sections = [
    { w: 48, label: 'AMMO', value: ammo },
    { w: 56, label: 'HEALTH', value: `${Math.max(0, Math.round((me.hp / (me.maxHp || 10)) * 100))}%` },
    { w: 52, label: 'ARMS' },
    { w: 36, face: true },
    { w: 56, label: 'STAMINA', value: `${Math.round(((me.stamina ?? 4) / (me.maxStamina ?? 4)) * 100)}%` },
    { w: 72, stock: true },
  ];
  let x = left;
  for (const sec of sections) {
    panel(c, x + 1, y0 + 2, sec.w - 2, bh - 3);
    const cx = x + sec.w / 2;
    if (sec.label && sec.label !== 'ARMS') {
      const v = String(sec.value);
      text(c, v, Math.round(cx - textW(v, s) / 2), y0 + 4, s, '#d02018', '#3a0a08');
      text(c, sec.label, Math.round(cx - textW(sec.label, 1) / 2), y0 + bh - 8, 1, '#d8d0c0', '#000');
    } else if (sec.label === 'ARMS') {
      for (let i = 0; i < 9; i++) {
        const has = !!me.hotbar?.[i], sel = i === me.selected;
        const gx = x + 6 + (i % 5) * 9, gy = y0 + 4 + Math.floor(i / 5) * 8;
        text(c, i + 1, gx, gy, 1, sel ? '#ffd040' : has ? '#e0d8c8' : '#6e6860', null);
        if (sel) { c.fillStyle = '#ffd040'; c.fillRect(gx - 1, gy + 6, 5, 1); }
      }
      text(c, 'ARMS', Math.round(cx - textW('ARMS', 1) / 2), y0 + bh - 8, 1, '#d8d0c0', '#000');
    } else if (sec.face) {
      c.fillStyle = '#1a120c'; c.fillRect(x + 2, y0 + 2, sec.w - 4, bh - 3);
      drawFace(c, Math.round(cx), y0 + 2, Math.max(0, me.hp / (me.maxHp || 10)), d, now, !(me.hp > 0));
    } else if (sec.stock) {
      const rows = [['wood', 'WOOD'], ['stone', 'STONE'], ['arrow', 'ARROW'], ['meat', 'MEAT']];
      rows.forEach(([item, label], i) => {
        const yy = y0 + 4 + i * 6;
        text(c, label, x + 4, yy, 1, '#d8d0c0', null);
        const n = String(me.inventory?.[item] || 0);
        text(c, n, x + sec.w - 5 - textW(n, 1), yy, 1, '#ffd040', null);
      });
    }
    x += sec.w;
  }
}

/**
 * Draw weapon, flashes, messages and the status bar over the scene.
 * viewH is the height of the 3D view; the bar fills the rest of the screen.
 */
export function drawDoomHud(ctx, game, w, h, viewH) {
  const me = game.me, d = stateOf(game), now = performance.now();
  const scale = scaleOf(w, h), BW = Math.ceil(w / scale), VH = Math.ceil(viewH / scale), left = Math.floor((BW - PW) / 2);
  if (wbuf.width !== BW || wbuf.height !== VH + BAR) { wbuf.width = BW; wbuf.height = VH + BAR; }
  wctx.setTransform(1, 0, 0, 1, 0, 0);
  wctx.clearRect(0, 0, BW, VH + BAR);

  // screen flashes: red when hurt, gold on pickups
  if (d.hurt > 0) { ctx.fillStyle = `rgba(200,0,0,${d.hurt * 0.55})`; ctx.fillRect(0, 0, w, viewH); }
  if (d.gold > 0) { ctx.fillStyle = `rgba(255,210,80,${d.gold * 0.5})`; ctx.fillRect(0, 0, w, viewH); }

  // weapon: bobs in a figure-eight while walking, dips when swapped
  if (me.hp > 0 && !game.ui) {
    const kind = kindOf(d.held), item = registries.items.get(d.held);
    const swing = (now - d.swingAt) / 1000;
    const bx = Math.cos(d.bob) * 8 * d.moving, by = Math.abs(Math.sin(d.bob)) * 6 * d.moving + d.raise * 60;
    wctx.save();
    wctx.beginPath(); wctx.rect(0, 0, BW, VH); wctx.clip();
    wctx.translate(left + Math.round(bx), Math.round(by));
    drawWeapon(wctx, kind, item, now / 1000, swing, !!me.mining, game, VH);
    wctx.restore();
    // muzzle flash lights the room
    if ((kind === 'shotgun' && swing < 0.1) || (kind === 'staff' && swing < 0.15)) {
      ctx.fillStyle = kind === 'staff' ? 'rgba(170,110,255,0.18)' : 'rgba(255,230,150,0.2)';
      ctx.fillRect(0, 0, w, viewH);
    }
  }

  drawBar(wctx, game, d, VH, BAR, now, left, BW);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(wbuf, 0, 0, BW, VH + BAR, 0, h - (VH + BAR) * scale, BW * scale, (VH + BAR) * scale);
  ctx.imageSmoothingEnabled = true;

  // pickup messages, top left, in the pixel font
  const ms = Math.max(2, Math.round(scale * 0.9));
  d.msgs.forEach((m, i) => text(ctx, m.text, 10, 10 + i * 7 * ms, ms, '#e03028', '#300'));

  if (!(me.hp > 0)) {
    ctx.fillStyle = 'rgba(120,0,0,0.35)'; ctx.fillRect(0, 0, w, viewH);
    const big = Math.max(4, Math.round(scale * 3)), msg = 'YOU DIED';
    text(ctx, msg, Math.round(w / 2 - textW(msg, big) / 2), Math.round(viewH / 2 - big * 3), big, '#d02018', '#200');
  }
}

/** A wall texel brightness for texture coordinates u, v in [0, 1) on a tile. */
export function wallTexel(name, u, v, tx, ty) {
  const hash = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
  const iu = Math.floor(u * 16), iv = Math.floor(v * 16);
  const grit = (((iu * 31 + iv * 17 + hash) * 2654435761) >>> 28) / 15 * 0.12;
  if (/wood|door|cabin|plank/.test(name)) {               // vertical planks with nails
    const seam = iu % 4 === 0 ? 0.55 : 1;
    const nail = (iv === 2 || iv === 13) && iu % 4 === 2 ? 0.5 : 1;
    return seam * nail * (0.9 + grit);
  }
  if (/tree|trunk|log|bush|pine|oak/.test(name)) {         // bark: wavy dark stripes
    const stripe = ((iu + ((iv >> 2) & 1)) % 3 === 0) ? 0.65 : 1;
    return stripe * (0.85 + grit * 1.5);
  }
  if (/glass/.test(name)) return (iu + iv) % 7 === 0 ? 1.4 : 0.9;
  // default: stone bricks, four rows per tile, alternate rows offset by half a brick
  const row = Math.floor(v * 4), off = row & 1 ? 0.25 : 0;
  const bu = (u + off) * 2 % 1, bv = (v * 4) % 1;
  const mortar = bv < 0.12 || bu < 0.06 ? 0.55 : 1;
  const tone = 0.88 + (((row * 7 + Math.floor((u + off) * 2) * 3 + hash) & 3) * 0.05);
  return mortar * tone * (0.92 + grit);
}
