// TEAM CREATURES (client helper): placeholder looks for wildlife, item icons for meat and
// fur, and the "!" when a predator spots you and the roar of a charging lion.
// Art can register its own drawers for these types to replace them.
import { registerDrawer, registerHud, onEvent } from '../../shared/registry.js';

const now = () => performance.now();
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

// Body sizes in tiles, and extras per species.
const LOOK = {
  wolf:         { len: 0.42, h: 0.16, leg: 0.14, ears: true, tail: 0.2 },
  'snow-wolf':  { len: 0.44, h: 0.17, leg: 0.14, ears: true, tail: 0.2 },
  bear:         { len: 0.6,  h: 0.3,  leg: 0.14, ears: true, tail: 0.04 },
  'polar-bear': { len: 0.68, h: 0.32, leg: 0.15, ears: true, tail: 0.04 },
  lion:         { len: 0.52, h: 0.2,  leg: 0.16, mane: '#7a4a1e', tail: 0.3 },
};

// Which way an animal faces: the way it last moved (kept on the client entity), else toward me.
function facing(e, game) {
  const x = e._rx ?? e.x;
  if (e._lastX != null && Math.abs(x - e._lastX) > 0.01) e._face = x > e._lastX ? 1 : -1;
  e._lastX = x;
  return e._face ?? (game.me && game.me.x < x ? -1 : 1);
}

// A four-legged animal seen from the side. Crouched while stalking, stretched while charging,
// jaws open and red during the windup before a bite.
function beast(ctx, e, x, y, T, game) {
  const look = LOOK[e.type] || LOOK.wolf, f = facing(e, game);
  const crouch = e.stalking ? 0.6 : 1, stretch = e.charging ? 1.25 : 1;
  const L = look.len * T * stretch, H = look.h * T * crouch, leg = look.leg * T * crouch;
  const moving = e._face != null ? Math.sin(now() / (e.charging ? 50 : 110) + e.id) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x, y + leg + H * 0.3, L * 0.6, T * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  const body = (e._flashUntil || 0) > now() ? '#fff' : e.color; // Art sets the flash on hits
  // legs
  ctx.fillStyle = body;
  for (const [lx, phase] of [[-0.35, 1], [-0.2, -1], [0.25, -1], [0.38, 1]]) {
    ctx.fillRect(x + lx * L * 2 * 0.5 * f - T * 0.03 + moving * phase * T * 0.03, y, T * 0.06, leg + H * 0.3);
  }
  // body, tail
  ctx.beginPath(); ctx.ellipse(x, y, L / 2, H / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = body; ctx.lineWidth = Math.max(2, T * 0.05); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - f * L * 0.45, y - H * 0.1);
  ctx.lineTo(x - f * (L * 0.45 + look.tail * T), y - H * (e.fleeing ? -0.3 : 0.5)); ctx.stroke();
  // head
  const hx = x + f * L * 0.5, hy = y - H * 0.45, hr = T * (look.h * 0.55 + 0.04);
  if (look.mane) { ctx.fillStyle = look.mane; circle(ctx, hx, hy, hr * 1.5); }
  ctx.fillStyle = body;
  circle(ctx, hx, hy, hr);
  ctx.beginPath(); ctx.ellipse(hx + f * hr * 0.9, hy + hr * 0.25, hr * 0.6, hr * (e.windup ? 0.55 : 0.4), 0, 0, Math.PI * 2); ctx.fill();
  if (look.ears) {
    ctx.beginPath();
    ctx.moveTo(hx - f * hr * 0.4, hy - hr * 0.6); ctx.lineTo(hx - f * hr * 0.1, hy - hr * 1.5); ctx.lineTo(hx + f * hr * 0.3, hy - hr * 0.7);
    ctx.fill();
  }
  if (e.windup) { ctx.fillStyle = game.theme.colors.blood; circle(ctx, hx + f * hr * 1.1, hy + hr * 0.35, hr * 0.25); }
  ctx.fillStyle = e.windup || e.charging ? game.theme.colors.blood : '#111';
  circle(ctx, hx + f * hr * 0.35, hy - hr * 0.15, Math.max(1.5, T * 0.025));
  if ((e.stunnedUntil || 0) > game.time) {
    ctx.fillStyle = '#ff6';
    for (let i = 0; i < 3; i++) {
      const s = now() / 200 + (i * Math.PI * 2) / 3;
      ctx.fillRect(hx + Math.cos(s) * T * 0.2 - 2, hy - T * 0.15 + Math.sin(s) * T * 0.07 - 2, 4, 4);
    }
  }
}
for (const type of Object.keys(LOOK)) registerDrawer(type, beast);

registerDrawer('item:meat', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = item?.color || '#b5483b';
  ctx.beginPath(); ctx.ellipse(cx - s * 0.05, cy, s * 0.26, s * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#efe6d2';                                         // the bone
  ctx.fillRect(cx + s * 0.1, cy - s * 0.04, s * 0.22, s * 0.08);
  circle(ctx, cx + s * 0.33, cy - s * 0.05, s * 0.06);
  circle(ctx, cx + s * 0.33, cy + s * 0.05, s * 0.06);
});
registerDrawer('item:fur', (ctx, item, cx, cy, s) => {
  ctx.fillStyle = item?.color || '#8a6f55';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.3, cy - s * 0.2); ctx.lineTo(cx + s * 0.3, cy - s * 0.2);
  ctx.lineTo(cx + s * 0.22, cy + s * 0.25); ctx.lineTo(cx - s * 0.22, cy + s * 0.25);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * s * 0.1, cy - s * 0.15); ctx.lineTo(cx + i * s * 0.08, cy + s * 0.2); ctx.stroke(); }
});

// "!" over a predator that has just picked you (or a pack mate) out, and ROAR for a lion's charge.
const marks = (game) => (game._wildlifeMarks ||= []);
onEvent('net:spotted', (game, { id }) => marks(game).push({ id, text: '!', until: now() + 1200 }));
onEvent('net:roar', (game, { id }) => marks(game).push({ id, text: 'ROAR!', until: now() + 900 }));

registerHud('wildlife-marks', (ctx, game) => {
  const t = now();
  game._wildlifeMarks = marks(game).filter((m) => m.until > t);
  for (const m of game._wildlifeMarks) {
    const e = game.entities.get(m.id);
    if (!e) continue;
    const ex = e._rx ?? e.x, ey = e._ry ?? e.y;
    if (!game.canSee(ex, ey)) continue;
    const p = game.worldToScreen(ex, ey), rise = (1 - (m.until - t) / 1200) * 10;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = game.font(m.text === '!' ? 26 : 18, 'display');
    ctx.lineWidth = 3; ctx.strokeStyle = '#000';
    ctx.strokeText(m.text, p.x, p.y - 26 - rise);
    ctx.fillStyle = m.text === '!' ? game.theme.colors.candle : game.theme.colors.ember;
    ctx.fillText(m.text, p.x, p.y - 26 - rise);
    ctx.restore();
  }
});
