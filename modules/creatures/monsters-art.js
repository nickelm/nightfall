// TEAM CREATURES (client helper): placeholder looks for spiders, zombies, skeletons, and bone
// arrows, plus the bash and darkness-spawn effects and the red edge while a raid is on.
// Art can register its own drawers for these types to replace them.
import { registerDrawer, registerHud, onEvent } from '../../shared/registry.js';

const now = () => performance.now();
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
const stunned = (e, game) => (e.stunnedUntil || 0) > game.time;

function stars(ctx, x, y, T) {
  ctx.fillStyle = '#ff6';
  for (let i = 0; i < 3; i++) {
    const s = now() / 200 + (i * Math.PI * 2) / 3;
    ctx.fillRect(x + Math.cos(s) * T * 0.3 - 2, y - T * 0.3 + Math.sin(s) * T * 0.1 - 2, 4, 4);
  }
}

// Spider: a dark body with eight legs and toxic eyes. It crouches low (windup) before a leap,
// and while airborne it is drawn bigger, high above its shadow.
registerDrawer('spider', (ctx, e, x, y, T, game) => {
  const c = game.theme.colors;
  const lift = e.leaping ? T * 0.35 : 0, scale = e.leaping ? 1.3 : e.windup ? 0.85 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x, y + T * 0.12, T * 0.22, T * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  const by = y - lift;
  ctx.strokeStyle = e.color; ctx.lineWidth = Math.max(1.5, T * 0.04);
  const step = Math.sin(now() / 60 + e.id) * T * 0.04;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const ly = by + (i - 1.5) * T * 0.08 * scale, wiggle = (i % 2 ? step : -step);
      ctx.beginPath();
      ctx.moveTo(x + side * T * 0.08, ly);
      ctx.lineTo(x + side * T * 0.24 * scale, ly - T * 0.1 + wiggle);
      ctx.lineTo(x + side * T * 0.32 * scale, ly + T * 0.06 + wiggle);
      ctx.stroke();
    }
  }
  ctx.fillStyle = e.windup ? c.blood : e.color;
  circle(ctx, x, by + T * 0.04, T * 0.15 * scale);
  circle(ctx, x, by - T * 0.12 * scale, T * 0.09 * scale);
  ctx.fillStyle = c.toxic;
  for (const side of [-1, 1]) circle(ctx, x + side * T * 0.04, by - T * 0.14 * scale, T * 0.025);
  if (stunned(e, game)) stars(ctx, x, by, T);
});

// Zombie: a hunched grey-green figure with its arms out. It shakes while bashing.
registerDrawer('zombie', (ctx, e, x, y, T, game) => {
  const c = game.theme.colors;
  const shake = e.bashing ? Math.sin(now() / 25) * T * 0.05 : 0;
  const sway = Math.sin(now() / 300 + e.id) * T * 0.03;
  const facing = game.me && game.me.x < (e._rx ?? 0) ? -1 : 1;
  x += shake;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x, y + T * 0.3, T * 0.2, T * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3d3a4a';                                          // legs
  ctx.fillRect(x - T * 0.1, y + T * 0.08, T * 0.08, T * 0.22);
  ctx.fillRect(x + T * 0.02, y + T * 0.08, T * 0.08, T * 0.22);
  ctx.fillStyle = '#4b5a3a';                                          // torn shirt
  ctx.fillRect(x - T * 0.14, y - T * 0.18 + sway, T * 0.28, T * 0.3);
  ctx.fillStyle = e.windup ? c.blood : e.color;                       // arms reach forward
  const reach = e.windup ? T * 0.36 : T * 0.26;
  ctx.fillRect(facing > 0 ? x + T * 0.06 : x - T * 0.06 - reach, y - T * 0.14 + sway, reach, T * 0.07);
  ctx.fillRect(facing > 0 ? x + T * 0.06 : x - T * 0.06 - reach, y - T * 0.03 + sway, reach, T * 0.07);
  circle(ctx, x + facing * T * 0.04, y - T * 0.28 + sway, T * 0.13); // head
  ctx.fillStyle = c.blood;
  circle(ctx, x + facing * T * 0.09, y - T * 0.3 + sway, T * 0.025);
  if (stunned(e, game)) stars(ctx, x, y - T * 0.2, T);
});

// Skeleton: a bone figure with a bow that points where it aims; the string pulls back during windup.
registerDrawer('skeleton', (ctx, e, x, y, T, game) => {
  const c = game.theme.colors;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x, y + T * 0.3, T * 0.18, T * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = e.color; ctx.lineWidth = Math.max(1.5, T * 0.05); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - T * 0.15); ctx.lineTo(x, y + T * 0.08);                          // spine
  ctx.moveTo(x, y + T * 0.08); ctx.lineTo(x - T * 0.08, y + T * 0.28);               // legs
  ctx.moveTo(x, y + T * 0.08); ctx.lineTo(x + T * 0.08, y + T * 0.28);
  for (let i = 0; i < 3; i++) { const ry = y - T * 0.1 + i * T * 0.06; ctx.moveTo(x - T * 0.09, ry); ctx.lineTo(x + T * 0.09, ry); } // ribs
  ctx.stroke();
  ctx.fillStyle = e.color;
  circle(ctx, x, y - T * 0.27, T * 0.12);
  ctx.fillStyle = e.windup ? c.blood : '#1a1020';
  for (const side of [-1, 1]) circle(ctx, x + side * T * 0.045, y - T * 0.28, T * 0.03);
  // the bow, pointed along `aim`
  const aim = e.aim || { x: 1, y: 0 }, a = Math.atan2(aim.y, aim.x);
  ctx.save();
  ctx.translate(x + aim.x * T * 0.15, y - T * 0.05 + aim.y * T * 0.15);
  ctx.rotate(a);
  ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = Math.max(1.5, T * 0.04);
  ctx.beginPath(); ctx.arc(0, 0, T * 0.2, -Math.PI / 2.3, Math.PI / 2.3); ctx.stroke();
  const pull = e.windup ? -T * 0.12 : 0;
  ctx.strokeStyle = c.bone; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.cos(Math.PI / 2.3) * T * 0.2, -Math.sin(Math.PI / 2.3) * T * 0.2);
  ctx.lineTo(pull, 0);
  ctx.lineTo(Math.cos(Math.PI / 2.3) * T * 0.2, Math.sin(Math.PI / 2.3) * T * 0.2);
  ctx.stroke();
  ctx.restore();
  if (stunned(e, game)) stars(ctx, x, y - T * 0.2, T);
});

registerDrawer('bone-arrow', (ctx, e, x, y, T, game) => {
  const len = Math.hypot(e.vx, e.vy) || 1, ux = e.vx / len, uy = e.vy / len;
  ctx.strokeStyle = game.theme.colors.bone; ctx.lineWidth = Math.max(1.5, T * 0.05); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - ux * T * 0.3, y - uy * T * 0.3); ctx.lineTo(x + ux * T * 0.2, y + uy * T * 0.2); ctx.stroke();
  ctx.fillStyle = game.theme.colors.ash;
  circle(ctx, x + ux * T * 0.22, y + uy * T * 0.22, T * 0.05);
});

// Short-lived effects at a world position.
const effects = (game) => (game._monsterEffects ||= []);
onEvent('net:bash', (game, { x, y, broke }) => {
  effects(game).push({ kind: 'bash', x, y, text: broke === 'door-closed' ? 'SLAM!' : 'CRACK!', until: now() + 900 });
});
onEvent('net:darkSpawn', (game, { x, y }) => effects(game).push({ kind: 'dark', x, y, until: now() + 900 }));

registerHud('monster-effects', (ctx, game) => {
  const t = now();
  game._monsterEffects = effects(game).filter((f) => f.until > t);
  for (const f of game._monsterEffects) {
    if (!game.canSee(f.x, f.y)) continue;
    const p = game.worldToScreen(f.x, f.y), age = 1 - (f.until - t) / 900;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age);
    if (f.kind === 'bash') {
      ctx.fillStyle = '#8b5a2b';                                   // splinters
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05;
        ctx.fillRect(p.x + Math.cos(a) * age * 30, p.y + Math.sin(a) * age * 30 + age * age * 20, 4, 2);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = game.font(18, 'display');
      ctx.fillStyle = game.theme.colors.ember; ctx.fillText(f.text, p.x, p.y - 20 - age * 20);
    } else {
      ctx.fillStyle = game.theme.colors.purple;                    // a puff of shadow
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + f.x;
        circle(ctx, p.x + Math.cos(a) * age * 18, p.y + Math.sin(a) * age * 12 - age * 10, 6 + age * 8);
      }
    }
    ctx.restore();
  }
});

// While a raid is on, the screen edge pulses blood red.
onEvent('net:raid', (game) => { game._raidOn = true; });
onEvent('net:raidOver', (game) => { game._raidOn = false; });
onEvent('net:dawn', (game) => { game._raidOn = false; });

registerHud('raid-vignette', (ctx, game, w, h) => {
  if (!game._raidOn || game.ui) return;
  const pulse = 0.25 + 0.15 * Math.sin(now() / 400);
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, 'rgba(192,38,47,0)');
  g.addColorStop(1, `rgba(192,38,47,${pulse})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});
