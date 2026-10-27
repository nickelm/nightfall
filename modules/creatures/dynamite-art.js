// Dynamite: a red stick with a sparking fuse and a countdown above it, plus the blast.
import { registerDrawer, registerHud, onEvent } from '../../shared/registry.js';
import { TILE_PX } from '../../shared/config.js';

function stick(ctx, cx, cy, s) {
  ctx.fillStyle = '#b3241c';
  ctx.fillRect(cx - s * 0.12, cy - s * 0.25, s * 0.24, s * 0.5);
  ctx.fillStyle = '#e8d9b0';
  ctx.fillRect(cx - s * 0.12, cy - s * 0.05, s * 0.24, s * 0.08);
  ctx.strokeStyle = '#ccc'; ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.25); ctx.quadraticCurveTo(cx + s * 0.1, cy - s * 0.35, cx + s * 0.05, cy - s * 0.42); ctx.stroke();
}

registerDrawer('item:dynamite', (ctx, item, cx, cy, s) => stick(ctx, cx, cy, s));

registerDrawer('dynamite', (ctx, e, x, y, T, game) => {
  stick(ctx, x, y, T);
  const left = Math.max(0, (e.explodeAt ?? game.time + 3) - game.time);
  // fuse spark, flickering faster as it burns down
  if (Math.sin(performance.now() / (40 + left * 30)) > 0) {
    ctx.fillStyle = game.theme.colors.candle;
    ctx.beginPath(); ctx.arc(x + T * 0.05, y - T * 0.42, T * 0.07, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = game.font(Math.round(T * 0.45), 'display');
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3; ctx.strokeStyle = '#000';
  const label = left.toFixed(1);
  ctx.strokeText(label, x, y - T * 0.5);
  ctx.fillStyle = left < 1 ? game.theme.colors.blood : game.theme.colors.bone;
  ctx.fillText(label, x, y - T * 0.5);
});

// The blast: an expanding, fading ring of fire where the dynamite was.
onEvent('net:exploded', (game, { x, y, radius }) => {
  (game.blasts ||= []).push({ x, y, radius, t: performance.now() });
});

registerHud('dynamite-blasts', (ctx, game) => {
  if (!game.blasts?.length) return;
  const now = performance.now();
  game.blasts = game.blasts.filter((b) => now - b.t < 500);
  for (const b of game.blasts) {
    const k = (now - b.t) / 500, p = game.worldToScreen(b.x, b.y);
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = game.theme.colors.pumpkin;
    ctx.beginPath(); ctx.arc(p.x, p.y, b.radius * TILE_PX * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = game.theme.colors.candle;
    ctx.beginPath(); ctx.arc(p.x, p.y, b.radius * TILE_PX * 0.5 * (1 - k), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
});
