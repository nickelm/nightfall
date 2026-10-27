// TEAM PLAYER (client helper): casting with the staff in hand. What is under the
// cursor picks the spell (sight.js): on a foe or empty ground, left click throws a
// fireball and right click calls a firestorm; on a friend, holding left keeps a focus
// shell on them and right click heals. Right click on something interactive (a
// campfire, a door) still interacts. The server checks everything again; this side
// only aims and shows a ring or a reticle.
import { registries, registerHud, onEvent } from '../../shared/registry.js';
import { TILE_PX } from '../../shared/config.js';
import { relation, clearLine, SPELL_FOR } from './sight.js';

const PICK_RADIUS = 0.6; // tiles from the cursor to a target's center (scaled by its size)

let leftLock = null;  // { shell } from a left press that cast, until the button is released
let rightLock = false; // a right press that cast, until released (so it does not start a guard)
let lastFail = 0;

const holdsStaff = (game) => game.me?.hotbar?.[game.selectedSlot] === 'staff';

/** The foe or friend under the cursor that we can see, as { e, rel }, or null. */
function hoverTarget(game) {
  const me = game.me, m = game.input.mouse;
  if (!m.active) return null;
  const p = game.screenToWorld(m.x, m.y);
  let best = null, bestD = Infinity;
  for (const e of game.entities.values()) {
    const rel = relation(me, e);
    if (!rel || !game.canSee(e._rx, e._ry)) continue;
    const d = Math.hypot(e._rx - p.x, e._ry - p.y);
    if (d < PICK_RADIUS * (e.size || 1) && d < bestD) { best = { e, rel }; bestD = d; }
  }
  return best;
}

/** Can a spell reach world point (x, y): in range and in line of sight? */
function reachable(game, x, y, spell = 'fireball') {
  const me = game.me, range = registries.spells.get(spell)?.range ?? 11;
  return Math.hypot(x - me.x, y - me.y) <= range && clearLine(game.world, me.x, me.y, x, y);
}

const cursor = (game) => game.screenToWorld(game.input.mouse.x, game.input.mouse.y);

/** Call once per frame from the movement system. Returns which mouse buttons casting
 *  took this frame, so the caller skips mining, swinging, and guarding for them.
 *  `interacting()`: true when the right button should interact with what is aimed at instead. */
export function updateCasting(game, free, interacting = () => false) {
  const k = game.input;
  const active = free && holdsStaff(game);
  if (leftLock && (!active || !k.mouseDown(0))) {
    if (leftLock.shell) game.sendAction('shell', { stop: true });
    leftLock = null;
  }
  if (rightLock && (!active || !k.mouseDown(2))) rightLock = false;
  if (!active) return { left: false, right: false };

  const hover = hoverTarget(game);
  // aimed at a foe or a friend: that target; at empty ground: the point under the cursor
  const aim = (side) => {
    if (hover) return { spell: SPELL_FOR[side][hover.rel], target: hover.e.id };
    const p = k.mouse.active ? cursor(game) : { x: game.me.x + game.me.dir.x * 3, y: game.me.y + game.me.dir.y * 3 };
    return { spell: SPELL_FOR[side].foe, x: p.x, y: p.y };
  };
  if (k.clicked(0)) {
    const a = aim('left');
    if (a.spell === 'shell') game.sendAction('shell', { target: a.target });
    else game.sendAction('cast', a);
    leftLock = { shell: a.spell === 'shell' };
  }
  if (k.clicked(2) && !interacting()) {
    game.sendAction('cast', aim('right'));
    rightLock = true;
  }
  return { left: !!leftLock, right: rightLock };
}

// A ring around whatever the staff would hit, with the two spells it would cast; over
// empty ground, a reticle with the firestorm's reach. Grey and dashed when the target
// is out of range or out of sight (a fireball at empty ground flies anyway).
registerHud('spell-target', (ctx, game) => {
  if (game.ui || !game.me || !holdsStaff(game) || !game.input.mouse.active) return;
  const hover = hoverTarget(game), C = game.theme.colors;
  if (!hover) {
    const c = cursor(game), p = game.worldToScreen(c.x, c.y);
    const ok = reachable(game, c.x, c.y, 'firestorm');
    ctx.strokeStyle = ok ? C.pumpkin : C.ash;
    ctx.lineWidth = 1.5;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.beginPath(); ctx.moveTo(p.x + dx * 4, p.y + dy * 4); ctx.lineTo(p.x + dx * 10, p.y + dy * 10); ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([4, 6]);
    const r = (registries.spells.get('firestorm')?.radius ?? 2.5) * TILE_PX;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    return;
  }
  const { e, rel } = hover;
  const ok = reachable(game, e._rx, e._ry, SPELL_FOR.left[rel]);
  const p = game.worldToScreen(e._rx, e._ry), r = TILE_PX * 0.5 * (e.size || 1);
  const color = !ok ? C.ash : rel === 'foe' ? C.pumpkin : C.candle;
  const spin = performance.now() / 600;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(ok ? [] : [4, 5]);
  for (let i = 0; i < 4; i++) { // four arcs that slowly turn
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, spin + (i * Math.PI) / 2, spin + (i * Math.PI) / 2 + 1.1);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.font = game.font(12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  const label = ok ? `LMB ${SPELL_FOR.left[rel]}  ·  RMB ${SPELL_FOR.right[rel]}` : 'out of sight or range';
  ctx.fillText(label, p.x, p.y + r + 4);
});

onEvent('net:spellFail', (game, { reason }) => {
  if (performance.now() - lastFail < 1000) return;
  lastFail = performance.now();
  game.notify(reason, 1.5, game.theme.colors.blood);
});
