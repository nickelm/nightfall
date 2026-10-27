// TEAM PLAYER (client): local movement, aiming, and mouse input. We own our
// own position; the server trusts it, so movement feels instant on bad Wi-Fi.
//   left mouse / Space (hold)  mine the targeted tile, or swing when there is nothing to mine
//   right mouse                interact with what you aim at (feed a fire), else use the
//                              held item (place a block, a jack-o-lantern), else guard
//   Shift (hold)               always guards
import { registries, registerClientSystem, registerHud, registerDrawer, onEvent } from '../../shared/registry.js';
import { TILE_PX } from '../../shared/config.js';
import { updateMovementControl } from './movement-control.js';

const REACH = 1.8;       // tiles: mining and swinging
const PLACE_REACH = 2.5; // tiles: right-click use and place
const AIM_DEAD_ZONE = 0.4; // tiles around the player where the cursor does not turn us
const RUN_MULT = 1.6;    // speed factor while running

let sendTimer = 0;
let guarding = false;
let running = false;
let mining = null;  // the tile we asked the server to mine, or null
let useTimer = 0;   // right-click repeat while held

const heldItem = (game) => registries.items.get(game.me?.hotbar?.[game.selectedSlot]);
const usable = (def) => !!(def && (def.places || def.placesTile || def.use));

// Where the player is aiming, in world coordinates.
function aimPoint(game) {
  const me = game.me, m = game.input.mouse;
  return m.active ? game.screenToWorld(m.x, m.y) : { x: me.x + me.dir.x * 0.8, y: me.y + me.dir.y * 0.8 };
}

// A tile flagged `interact`, or an entity flagged `interactive`, at the targeted tile.
function interactTarget(game) {
  const t = game.targetTile(2);
  if (game.world.tile(t.x, t.y)?.interact) return t;
  for (const e of game.entities.values()) {
    if (e.interactive && Math.floor(e.x) === t.x && Math.floor(e.y) === t.y) return t;
  }
  return null;
}

registerClientSystem('movement', (game, dt) => {
  updateMovementControl(game);
  const me = game.me;
  if (!me) return;
  const k = game.input;
  const free = !game.ui; // a panel (inventory, settings) takes the mouse

  // --- face the mouse first, so facing-relative movement uses this frame's aim ---
  if (free && k.mouse.active) {
    const m = game.screenToWorld(k.mouse.x, k.mouse.y);
    const ax = m.x - me.x, ay = m.y - me.y, len = Math.hypot(ax, ay);
    if (len > AIM_DEAD_ZONE) me.dir = { x: ax / len, y: ay / len };
  }

  // --- right mouse: interact, use the held item, or guard ---
  let rightGuard = false;
  useTimer -= dt;
  if (free && k.mouseDown(2)) {
    const it = interactTarget(game);
    const def = heldItem(game);
    if (it) {
      if (k.clicked(2)) game.sendAction('interact', it);
    } else if (usable(def)) {
      if (k.clicked(2) || useTimer <= 0) { useTimer = 0.25; game.sendAction('use', game.targetTile(PLACE_REACH)); }
    } else {
      rightGuard = true;
    }
  }

  // --- read movement keys first: Shift runs while moving and guards when still ---
  const fwd = (k.down('KeyW') || k.down('ArrowUp') ? 1 : 0) - (k.down('KeyS') || k.down('ArrowDown') ? 1 : 0);
  const side = (k.down('KeyD') || k.down('ArrowRight') ? 1 : 0) - (k.down('KeyA') || k.down('ArrowLeft') ? 1 : 0);
  const moving = !!(fwd || side);
  const shift = free && (k.down('ShiftLeft') || k.down('ShiftRight'));

  // --- guard (block with a shield, parry without one) ---
  const guard = rightGuard || (shift && !moving);
  if (guard !== guarding) {
    guarding = guard;
    me.guarding = guard;
    game.sendAction('guard', { on: guard });
  }

  // --- run while stamina lasts (the server drains it and sets `winded` when it runs out) ---
  const run = shift && moving && !guard && !me.winded && (me.stamina ?? 0) > 0;
  if (run !== running) {
    running = run;
    me.running = run;
    game.sendAction('run', { on: run });
  }

  // --- move: relative to facing (W toward the cursor) or to the screen, see Esc settings ---
  let dx = side, dy = -fwd;
  if (game.settings.movement !== 'screen' && k.mouse.active) {
    const d = me.dir; // right of facing is (-d.y, d.x) with y pointing down the screen
    dx = d.x * fwd - d.y * side;
    dy = d.y * fwd + d.x * side;
  }
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    const step = (me.speed || 5) * (guarding ? 0.5 : running ? RUN_MULT : 1) * dt;
    // move each axis separately so we slide along walls
    if (!game.world.blocked(me.x + dx * step, me.y)) me.x += dx * step;
    if (!game.world.blocked(me.x, me.y + dy * step)) me.y += dy * step;
    if (!k.mouse.active) me.dir = { x: dx, y: dy };
  }

  sendTimer -= dt;
  if (sendTimer <= 0) {
    sendTimer = 0.05;
    game.send({ t: 'move', x: me.x, y: me.y, dir: me.dir });
  }

  // --- left mouse / Space: mine a harvestable tile, otherwise swing ---
  const holding = free && (k.mouseDown(0) || k.down('Space'));
  let target = null;
  if (holding) {
    const p = aimPoint(game);
    const monster = [...game.entities.values()].some((e) => e.hostile && e.hp > 0 && Math.hypot(e._rx - p.x, e._ry - p.y) < 0.7);
    const t = game.targetTile(REACH);
    if (!monster && game.world.tile(t.x, t.y)?.harvest) target = t;
  }
  if (target && (!mining || mining.x !== target.x || mining.y !== target.y)) {
    mining = target;
    game.sendAction('mine', target);
  } else if (!target && mining) {
    mining = null;
    game.sendAction('mine', { stop: true });
  }
  if (free && !target && (k.clicked(0) || k.pressed('Space'))) game.sendAction('attack', {});
});

// A faint wedge in front of your character: where swings, mining, and placing land.
// With a ranged weapon in hand, a dashed line out to its range instead.
registerHud('aim', (ctx, game) => {
  const me = game.me;
  if (!me || game.ui || !game.settings.showAim) return;
  const p = game.worldToScreen(me.x, me.y), a = Math.atan2(me.dir.y, me.dir.x), r = REACH * TILE_PX, half = 0.35;
  const w = heldItem(game)?.weapon;
  if (w?.kind === 'ranged') {
    const len = (w.range ?? 12) * TILE_PX;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,122,26,0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * TILE_PX * 0.5, p.y + Math.sin(a) * TILE_PX * 0.5);
    ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(255,122,26,0.10)';
  ctx.strokeStyle = 'rgba(255,122,26,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(a) * TILE_PX * 0.35, p.y + Math.sin(a) * TILE_PX * 0.35);
  ctx.arc(p.x, p.y, r, a - half, a + half);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
});

onEvent('net:noAmmo', (game, { item }) => game.notify(`Out of ${item}s`, 2, game.theme.colors.blood));

// Placeholder looks for the bow and arrows; Art may override them (it loads last).
registerDrawer('arrow', (ctx, e, sx, sy, T) => {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.atan2(e.vy, e.vx));
  ctx.strokeStyle = '#d8c8a0';
  ctx.lineWidth = Math.max(1.5, T * 0.06);
  ctx.beginPath(); ctx.moveTo(-T * 0.3, 0); ctx.lineTo(T * 0.2, 0); ctx.stroke();
  ctx.fillStyle = '#cfd3da';
  ctx.beginPath(); ctx.moveTo(T * 0.32, 0); ctx.lineTo(T * 0.18, -T * 0.07); ctx.lineTo(T * 0.18, T * 0.07); ctx.fill();
  ctx.restore();
});

registerDrawer('item:bow', (ctx, item, cx, cy, s) => {
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = Math.max(2, s * 0.08);
  ctx.beginPath(); ctx.arc(cx - s * 0.12, cy, s * 0.32, -1.2, 1.2); ctx.stroke();
  ctx.strokeStyle = '#e8e0d0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12 + Math.cos(-1.2) * s * 0.32, cy + Math.sin(-1.2) * s * 0.32);
  ctx.lineTo(cx - s * 0.12 + Math.cos(1.2) * s * 0.32, cy + Math.sin(1.2) * s * 0.32);
  ctx.stroke();
});

registerDrawer('item:arrow', (ctx, item, cx, cy, s) => {
  ctx.strokeStyle = '#d8c8a0';
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath(); ctx.moveTo(cx - s * 0.3, cy + s * 0.3); ctx.lineTo(cx + s * 0.22, cy - s * 0.22); ctx.stroke();
  ctx.fillStyle = '#cfd3da';
  ctx.beginPath(); ctx.moveTo(cx + s * 0.32, cy - s * 0.32); ctx.lineTo(cx + s * 0.12, cy - s * 0.24); ctx.lineTo(cx + s * 0.24, cy - s * 0.12); ctx.fill();
});
