import { onAction, registerSystem } from '../../shared/registry.js';

const RANGE = 80;
const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const tell = (game, p, text) => game.sendTo(p.id, 'portalMessage', { text });
const safe = (game, x, y) => !game.world.blocked(x, y) && !game.world.tile(x, y)?.hurts;

onAction('interact', (game, p, { x, y }) => {
  if (p.portalId != null || p.sailing || !Number.isInteger(x) || !Number.isInteger(y)) return;
  if (Math.hypot(x + .5 - p.x, y + .5 - p.y) > 2) return;
  const portal = [...game.entities.values()].find(e => e.type === 'portal' && Math.floor(e.x) === x && Math.floor(e.y) === y);
  if (!portal || !safe(game, portal.x, portal.y)) return;
  p.portalId = portal.id; p.running = false; p.guarding = false;
  game.teleport(p, portal.x, portal.y);
  tell(game, p, 'Portal: WASD travels to a nearby portal; Space exits.');
});

onAction('portalMove', (game, p, { direction }) => {
  const dir = directions[direction], from = game.entities.get(p.portalId);
  if (!dir || !from || from.type !== 'portal' || (p._portalNext || 0) > game.time) return;
  const candidates = [...game.entities.values()].filter(e => {
    if (e.type !== 'portal' || e.id === from.id || !safe(game, e.x, e.y)) return false;
    const dx = e.x - from.x, dy = e.y - from.y, d = Math.hypot(dx, dy);
    return d <= RANGE && d > 0 && (dx * dir[0] + dy * dir[1]) >= d * Math.SQRT1_2;
  }).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y) || a.id - b.id);
  if (!candidates.length) { tell(game, p, 'No reachable portal in that direction within 80 tiles.'); return; }
  const target = candidates[0]; p.portalId = target.id; p._portalNext = game.time + .2;
  game.teleport(p, target.x, target.y);
});

onAction('portalExit', (game, p) => {
  const portal = game.entities.get(p.portalId);
  if (!portal || portal.type !== 'portal') return;
  for (const [dx, dy] of [[0,1],[1,0],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
    const x = portal.x + dx, y = portal.y + dy;
    if (!safe(game, x, y) || game.near(x, y, .6, e => e.type === 'player' && e.id !== p.id).length) continue;
    delete p.portalId; game.teleport(p, x, y);
    tell(game, p, 'Left the portal.'); return;
  }
  tell(game, p, 'Clear a safe space next to the portal to exit.');
});

registerSystem('portal-state', game => {
  for (const p of game.players()) if (p.portalId != null && game.entities.get(p.portalId)?.type !== 'portal') delete p.portalId;
});
