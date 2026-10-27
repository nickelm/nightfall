// TEAM ART (client helper): arrows at the edge of the screen pointing to teammates
// who are out of view, in their colors, with their name and distance (1 tile = 1 m).
import { registerHud } from '../../shared/registry.js';
import { minimapSize, minimapTopLeft } from './minimap.js';

const INK = '#1a0f22';
const EDGE = 38;     // pixels from the screen edge
const BOTTOM = 140;  // keep clear of the hotbar and hearts (or of the touch controls, see below)

registerHud('teammate-arrows', (ctx, game, w, h) => {
  const me = game.me;
  if (!me || game.ui) return;
  const cx = w / 2, cy = h / 2, pulse = 0.85 + 0.15 * Math.sin(performance.now() / 250);
  // the clock, player list, and minimap fill the top right corner and draw over us: stay out of it
  const players = [...game.entities.values()].filter((e) => e.type === 'player').length;
  const corner = 8 + 34 + players * 18 + (game._teamMap?.show && game._teamMap.canvas && !minimapTopLeft(game, h) ? 8 + minimapSize(w, h) + 26 : 0);
  const bottom = game._touch?.on ? 290 : BOTTOM;
  for (const p of game.entities.values()) {
    if (p.type !== 'player' || p.id === game.myId) continue;
    const s = game.worldToScreen(p._rx ?? p.x, p._ry ?? p.y);
    if (s.x > 0 && s.x < w && s.y > 0 && s.y < h) continue;     // on screen: their name label is enough
    const dx = s.x - cx, dy = s.y - cy;
    const kx = dx > 0 ? (w - EDGE - cx) / dx : dx < 0 ? (EDGE - cx) / dx : Infinity;
    const ky = dy > 0 ? (h - bottom - cy) / dy : dy < 0 ? (EDGE - cy) / dy : Infinity;
    const k = Math.min(kx, ky), a = Math.atan2(dy, dx);
    let ax = cx + dx * k, ay = cy + dy * k;
    const left = w - Math.max(190, minimapSize(w, h) + 8) - 10;
    if (ax > left - EDGE && ay < corner + EDGE) {
      if (Math.abs(dx) / w > Math.abs(dy) / h) ay = corner + EDGE; else ax = left - EDGE;
    }

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(-11, -13); ctx.lineTo(-4, 0); ctx.lineTo(-11, 13);
    ctx.closePath();
    ctx.fillStyle = p.color || game.theme.colors.bone;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();

    // name and distance, on the inner side of the arrow
    const lx = ax - Math.cos(a) * 34, ly = ay - Math.sin(a) * 26;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.fillStyle = game.theme.colors.bone;
    ctx.font = game.font(18, 'display');
    ctx.textBaseline = 'bottom';
    const dist = `${Math.round(Math.hypot(p.x - me.x, p.y - me.y))}m`;
    ctx.strokeText(dist, lx, ly + 2);
    ctx.fillText(dist, lx, ly + 2);
    ctx.font = game.font(13);
    ctx.textBaseline = 'top';
    ctx.strokeText(p.name, lx, ly + 2);
    ctx.fillText(p.name, lx, ly + 2);
  }
});
