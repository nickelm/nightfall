// TEAM ART & SOUND (client): every sprite is drawn in code (no image files,
// no licensing questions) and every sound is synthesized with WebAudio.
// The camera looks straight down: characters rotate freely toward where they
// aim, and trees and rocks are seen from above. Replace and extend freely;
// anything without a drawer falls back to a circle.
// Art direction: Halloween. Pumpkin orange, candle yellow, bone, and violet on a
// purple-black night; use game.theme.colors and game.font() (client/core/theme.js).
import { registries, registerDrawer, registerHud, registerClientSystem, onEvent } from '../../shared/registry.js';
import { hash2 } from '../../shared/rng.js';
import { TILE_PX } from '../../shared/config.js';
import './minimap.js';

const now = () => performance.now();
const flashing = (e) => (e._flashUntil || 0) > now();
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

// ---------------------------------------------------------------- tiles ----

function speckle(ctx, px, py, T, tx, ty, color, n) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(px + hash2(tx * 7 + i, ty * 3) * (T - 3), py + hash2(ty * 5 - i, tx * 11) * (T - 3), 3, 3);
}

registerDrawer('tile:grass', (ctx, tile, px, py, T, tx, ty) => {
  ctx.fillStyle = tile.color;
  ctx.fillRect(px, py, T, T);
  speckle(ctx, px, py, T, tx, ty, 'rgba(255,255,255,0.05)', 3);
  speckle(ctx, px, py, T, tx + 50, ty, 'rgba(0,0,0,0.06)', 2);
});

registerDrawer('tile:sand', (ctx, tile, px, py, T, tx, ty) => {
  ctx.fillStyle = tile.color;
  ctx.fillRect(px, py, T, T);
  speckle(ctx, px, py, T, tx, ty, 'rgba(120,90,40,0.15)', 4);
});

registerDrawer('tile:gravel', (ctx, tile, px, py, T, tx, ty) => {
  ctx.fillStyle = tile.color;
  ctx.fillRect(px, py, T, T);
  speckle(ctx, px, py, T, tx, ty, 'rgba(255,255,255,0.10)', 5);
  speckle(ctx, px, py, T, tx + 9, ty, 'rgba(0,0,0,0.15)', 4);
});

const GROUND = '#3f6b35'; // the grass under trees and pumpkins

registerDrawer('tile:tree', (ctx, tile, px, py, T, tx, ty) => {
  ctx.fillStyle = GROUND;
  ctx.fillRect(px, py, T, T);
  const cx = px + T / 2, cy = py + T / 2, v = hash2(tx, ty, 9);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';                          // shadow
  circle(ctx, cx + 3, cy + 4, T * 0.46);
  if (v > 0.88) {                                               // a dead tree: bare branches from above
    ctx.strokeStyle = '#3d3029';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = v * 40 + i * 1.05, r = T * (0.3 + hash2(tx + i, ty, 4) * 0.15);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.fillStyle = '#4a3a2e';
    circle(ctx, cx, cy, T * 0.11);
    return;
  }
  ctx.fillStyle = v < 0.45 ? '#20401b' : '#25481f';             // canopy seen from above: a few lobes
  for (let i = 0; i < 4; i++) {
    const a = v * 6 + i * 1.6;
    circle(ctx, cx + Math.cos(a) * T * 0.14, cy + Math.sin(a) * T * 0.14, T * (0.26 + hash2(tx + i, ty) * 0.06));
  }
  ctx.fillStyle = v < 0.45 ? '#2a5424' : '#2f5a28';
  circle(ctx, cx - T * 0.06, cy - T * 0.06, T * 0.22);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';                     // sun from the top left
  circle(ctx, cx - T * 0.12, cy - T * 0.12, T * 0.1);
});

// A pumpkin seen from above: ribbed lobes around a stem. Shared by the tile, the lantern, and icons.
function pumpkin(ctx, x, y, r, v = 0.5) {
  ctx.fillStyle = '#b5520f';
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.88, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8761e';
  for (const dx of [-0.42, 0, 0.42]) { ctx.beginPath(); ctx.ellipse(x + dx * r, y, r * 0.42, r * 0.82, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,220,150,0.18)';
  circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.25);
  ctx.fillStyle = '#4b5d22';                                    // stem
  ctx.fillRect(x - r * 0.1, y - r * 0.15 - v * 2, r * 0.2, r * 0.3);
}

// The carved face, glowing from the candle inside.
function face(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {                                 // triangle eyes
    ctx.beginPath();
    ctx.moveTo(x + side * r * 0.5, y - r * 0.05);
    ctx.lineTo(x + side * r * 0.15, y - r * 0.05);
    ctx.lineTo(x + side * r * 0.32, y - r * 0.4);
    ctx.fill();
  }
  ctx.beginPath();                                              // jagged grin
  ctx.moveTo(x - r * 0.6, y + r * 0.2);
  for (let i = 1; i <= 6; i++) ctx.lineTo(x - r * 0.6 + i * r * 0.2, y + r * (i % 2 ? 0.38 : 0.24));
  ctx.lineTo(x + r * 0.45, y + r * 0.55);
  ctx.lineTo(x - r * 0.45, y + r * 0.55);
  ctx.fill();
}

registerDrawer('tile:pumpkin', (ctx, tile, px, py, T, tx, ty) => {
  ctx.fillStyle = GROUND;
  ctx.fillRect(px, py, T, T);
  const v = hash2(tx, ty, 21), cx = px + T * (0.42 + v * 0.16), cy = py + T * (0.45 + hash2(ty, tx, 5) * 0.12);
  ctx.strokeStyle = '#2d4a1c';                                  // vine
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx + T * 0.18, cy - T * 0.2, T * 0.14, v * 6, v * 6 + 4); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  circle(ctx, cx + 3, cy + 4, T * 0.3);
  pumpkin(ctx, cx, cy, T * (0.26 + v * 0.06), v);
});

registerDrawer('tile:wood-wall', (ctx, tile, px, py, T, tx, ty) => {
  ctx.fillStyle = '#4a311c';
  ctx.fillRect(px, py, T, T);
  for (let i = 0; i < 3; i++) {                                 // three planks
    ctx.fillStyle = (tx + ty + i) % 2 ? '#7a5230' : '#6e4a2b';
    ctx.fillRect(px + 1, py + 1 + i * (T / 3), T - 2, T / 3 - 2);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(px + 1, py + 1, T - 2, 2);
  ctx.fillStyle = '#2b2b2b';                                    // nails
  for (let i = 0; i < 3; i++) { ctx.fillRect(px + 4, py + 4 + i * (T / 3), 2, 2); ctx.fillRect(px + T - 6, py + 4 + i * (T / 3), 2, 2); }
});

registerDrawer('tile:stone-block', (ctx, tile, px, py, T) => {
  ctx.fillStyle = '#4c4852';
  ctx.fillRect(px, py, T, T);
  const h = T / 2 - 2;                                          // two rows of offset bricks
  ctx.fillStyle = tile.color;
  ctx.fillRect(px + 1, py + 1, T / 2 - 2, h);
  ctx.fillRect(px + T / 2 + 1, py + 1, T / 2 - 2, h);
  ctx.fillRect(px + 1, py + T / 2 + 1, T / 4 - 2, h);
  ctx.fillRect(px + T / 4 + 1, py + T / 2 + 1, T / 2 - 2, h);
  ctx.fillRect(px + (T * 3) / 4 + 1, py + T / 2 + 1, T / 4 - 2, h);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(px + 1, py + 1, T - 2, 2);
});

registerDrawer('tile:stone', (ctx, tile, px, py, T, tx, ty) => {
  ctx.fillStyle = '#5f5f64';
  ctx.fillRect(px, py, T, T);
  ctx.fillStyle = tile.color;
  ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(px + 2, py + 2, T - 4, 3);
  ctx.fillRect(px + 2, py + 2, 3, T - 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';                         // a crack
  ctx.lineWidth = 1;
  ctx.beginPath();
  const a = hash2(tx, ty, 3);
  ctx.moveTo(px + T * (0.2 + a * 0.5), py + T * 0.25);
  ctx.lineTo(px + T * 0.5, py + T * (0.5 + a * 0.2));
  ctx.lineTo(px + T * (0.7 - a * 0.3), py + T * 0.8);
  ctx.stroke();
});

registerDrawer('tile:water', (ctx, tile, px, py, T, tx, ty) => {
  ctx.fillStyle = tile.color;
  ctx.fillRect(px, py, T, T);
  const t = now() / 900;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  const off = Math.sin(t + tx * 0.7 + ty * 1.3) * 4;
  ctx.fillRect(px + 6 + off, py + T * 0.4, T * 0.35, 2);
});

// ------------------------------------------------------------- entities ----

// Held tools and weapons, drawn along +x from the hand in local coordinates.
// Returns false for items that are not tools (those show their icon in the hand).
function drawHeld(ctx, name, T) {
  if (name === 'sword') {
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, -2, T * 0.55, 4);                             // blade
    ctx.fillStyle = '#8a6a2a';
    ctx.fillRect(-2, -6, 4, 12);                                  // crossguard
    return true;
  }
  if (name === 'axe' || name === 'pickaxe') {
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-T * 0.04, -2, T * 0.5, 4);                      // handle
    if (name === 'axe') {
      ctx.fillStyle = '#b9bec7';
      ctx.beginPath();
      ctx.moveTo(T * 0.32, -2); ctx.lineTo(T * 0.46, -2); ctx.lineTo(T * 0.52, -T * 0.2); ctx.lineTo(T * 0.28, -T * 0.17);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#9aa0aa';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(T * 0.64, 0, T * 0.22, Math.PI - 0.95, Math.PI + 0.95); ctx.stroke();
    }
    return true;
  }
  return false;
}

function drawIcon(ctx, name, cx, cy, size, game) {
  const drawer = registries.drawers.get(`item:${name}`);
  if (drawer) { ctx.save(); drawer(ctx, registries.items.get(name), cx, cy, size, game); ctx.restore(); return; }
  ctx.fillStyle = registries.items.get(name)?.color || '#ccc';
  ctx.fillRect(cx - size * 0.3, cy - size * 0.3, size * 0.6, size * 0.6);
}

// Characters are drawn in local coordinates facing +x, then rotated to aim.
registerDrawer('player', (ctx, e, x, y, T, game) => {
  const d = e.dir || { x: 0, y: 1 };
  const aim = Math.atan2(d.y, d.x);
  const hasShield = !!e.inventory?.shield;
  const held = e.hotbar?.[e.id === game.myId ? game.selectedSlot : e.selected];

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  circle(ctx, x + 3, y + 4, T * 0.3);

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
  if (swung > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * swung})`;
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
  ctx.strokeStyle = '#5b3a1e';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(T * 0.16, -T * 0.27); ctx.lineTo(T * 0.4, -T * 0.32); ctx.stroke();
  ctx.fillStyle = Math.sin(now() / 60 + e.id) > 0 ? '#ffb030' : '#ff8a1a';
  circle(ctx, T * 0.44, -T * 0.33, T * 0.09);
  ctx.fillStyle = '#ffe680';
  circle(ctx, T * 0.44, -T * 0.33, T * 0.04);

  // shoulders and arms
  ctx.fillStyle = flashing(e) ? '#fff' : e.color;
  ctx.beginPath(); ctx.ellipse(0, 0, T * 0.17, T * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f1c9a0';
  circle(ctx, hx, hy, T * 0.07);                                  // right hand
  circle(ctx, T * 0.16, -T * 0.27, T * 0.07);                     // left hand

  // shield on the left forearm, swung to the front while guarding
  if (hasShield) {
    const sx = e.guarding ? T * 0.36 : T * 0.06, sy = e.guarding ? -T * 0.06 : -T * 0.36;
    ctx.fillStyle = '#a0703a';
    ctx.strokeStyle = '#d9b26f';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, sy, T * 0.08, T * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // head from above: face toward the front, hair on the crown
  ctx.fillStyle = '#f1c9a0';
  circle(ctx, T * 0.03, 0, T * 0.14);
  ctx.fillStyle = '#4a3020';
  circle(ctx, -T * 0.02, 0, T * 0.12);
  ctx.restore();

  ctx.font = game.font(14);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(e.name, x + 1, y - T * 0.5 + 1);
  ctx.fillStyle = game.theme.colors.bone;
  ctx.fillText(e.name, x, y - T * 0.5);
});

registerDrawer('slime', (ctx, e, x, y, T, game) => {
  const stunned = (e.stunnedUntil || 0) > game.time;
  const pulse = stunned ? 0 : Math.sin(now() / 160 + e.id) * 0.06;
  const swell = e.windup ? 1.25 : 1;                              // wind-up before a bite: the cue to parry
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  circle(ctx, x + 3, y + 4, T * 0.3 * swell);
  ctx.fillStyle = flashing(e) ? '#fff' : e.windup ? '#d94' : e.color;
  ctx.beginPath(); ctx.ellipse(x, y, T * 0.3 * swell * (1 + pulse), T * 0.3 * swell * (1 - pulse), 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  circle(ctx, x - T * 0.1, y - T * 0.1, T * 0.08);
  // eyes look at you
  const me = game.me;
  const a = me ? Math.atan2(me.y - e._ry, me.x - e._rx) : 0;
  ctx.fillStyle = '#111';
  for (const side of [-1, 1]) {
    circle(ctx, x + Math.cos(a) * T * 0.14 + Math.cos(a + Math.PI / 2) * side * T * 0.09,
               y + Math.sin(a) * T * 0.14 + Math.sin(a + Math.PI / 2) * side * T * 0.09, T * 0.04);
  }
  if (stunned) { // circling stars
    ctx.fillStyle = '#ff6';
    for (let i = 0; i < 3; i++) {
      const s = now() / 200 + (i * Math.PI * 2) / 3;
      ctx.fillRect(x + Math.cos(s) * T * 0.3 - 2, y + Math.sin(s) * T * 0.3 - 2, 4, 4);
    }
  }
});

registerDrawer('campfire', (ctx, e, x, y, T) => {
  ctx.fillStyle = '#6d6d70';                                      // ring of stones
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    circle(ctx, x + Math.cos(a) * T * 0.3, y + Math.sin(a) * T * 0.3, T * 0.08);
  }
  ctx.strokeStyle = '#5b3a1e';                                    // crossed logs
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - T * 0.2, y - T * 0.12); ctx.lineTo(x + T * 0.2, y + T * 0.12);
  ctx.moveTo(x - T * 0.2, y + T * 0.12); ctx.lineTo(x + T * 0.2, y - T * 0.12);
  ctx.stroke();
  if (e.fuel > 0) {
    const size = 0.5 + 0.5 * Math.min(1, e.fuel / 30);
    const f = 1 + Math.sin(now() / 70 + e.id) * 0.12;
    ctx.fillStyle = '#f60';
    circle(ctx, x, y, T * 0.2 * size * f);
    ctx.fillStyle = '#fa3';
    circle(ctx, x, y, T * 0.13 * size * f);
    ctx.fillStyle = '#ffe680';
    circle(ctx, x, y, T * 0.06 * size);
  } else {                                                        // embers
    ctx.fillStyle = Math.sin(now() / 400 + e.id) > 0 ? '#a33' : '#822';
    circle(ctx, x, y, T * 0.08);
  }
  const frac = Math.max(0, Math.min(1, e.fuel / e.maxFuel));      // fuel bar
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - T * 0.4, y - T * 0.6, T * 0.8, 5);
  ctx.fillStyle = frac > 0.33 ? '#fa3' : '#e33';
  ctx.fillRect(x - T * 0.4, y - T * 0.6, T * 0.8 * frac, 5);
});

// A carved pumpkin with a candle inside. When a pack of monsters is brave enough
// to ignore it (repels turns false), the candle gutters to a dim red.
registerDrawer('jack-o-lantern', (ctx, e, x, y, T) => {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  circle(ctx, x + 3, y + 4, T * 0.32);
  pumpkin(ctx, x, y, T * 0.32);
  const flicker = Math.sin(now() / 90 + e.id * 3) * 0.5 + Math.sin(now() / 37 + e.id) * 0.5;
  face(ctx, x, y + T * 0.02, T * 0.3, e.repels === false ? '#a8321c' : flicker > 0.2 ? '#ffe08a' : '#ffb347');
});

// Item icons for the hotbar and inventory: fn(ctx, item, cx, cy, size).
const toolIcon = (name) => (ctx, item, cx, cy, s) => {
  ctx.translate(cx - s * 0.3, cy + s * 0.3);
  ctx.rotate(-Math.PI / 4);
  drawHeld(ctx, name, s * 1.4);
};
registerDrawer('item:sword', toolIcon('sword'));
registerDrawer('item:axe', toolIcon('axe'));
registerDrawer('item:pickaxe', toolIcon('pickaxe'));
registerDrawer('item:wood', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = '#6e4a2b';
  ctx.fillRect(cx - s * 0.36, cy - s * 0.16, s * 0.6, s * 0.32);
  ctx.fillStyle = '#c49a64';
  ctx.beginPath(); ctx.ellipse(cx + s * 0.24, cy, s * 0.1, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(cx + s * 0.24, cy, s * 0.05, s * 0.08, 0, 0, Math.PI * 2); ctx.stroke();
});
registerDrawer('item:stone', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = '#8a8590';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.32, cy + s * 0.2); ctx.lineTo(cx - s * 0.2, cy - s * 0.22); ctx.lineTo(cx + s * 0.15, cy - s * 0.28);
  ctx.lineTo(cx + s * 0.34, cy + s * 0.05); ctx.lineTo(cx + s * 0.18, cy + s * 0.28);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(cx - s * 0.15, cy - s * 0.16, s * 0.2, s * 0.06);
});
registerDrawer('item:pumpkin', (ctx, item, cx, cy, s) => pumpkin(ctx, cx, cy, s * 0.34));
registerDrawer('item:jack-o-lantern', (ctx, item, cx, cy, s) => { pumpkin(ctx, cx, cy, s * 0.36); face(ctx, cx, cy, s * 0.32, '#ffe08a'); });
registerDrawer('item:campfire', (ctx, item, cx, cy, s) => {
  ctx.strokeStyle = '#5b3a1e';
  ctx.lineWidth = Math.max(3, s * 0.1);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.3, cy + s * 0.25); ctx.lineTo(cx + s * 0.3, cy + s * 0.05);
  ctx.moveTo(cx - s * 0.3, cy + s * 0.05); ctx.lineTo(cx + s * 0.3, cy + s * 0.25);
  ctx.stroke();
  ctx.fillStyle = '#f60';
  circle(ctx, cx, cy, s * 0.2);
  ctx.fillStyle = '#ffe680';
  circle(ctx, cx, cy + s * 0.03, s * 0.09);
});
registerDrawer('item:shield', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = '#a0703a';
  ctx.strokeStyle = '#d9b26f';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.26, s * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
