// TEAM PLAYER (client helper): casting with the staff in hand. What is under the
// cursor picks the spell (sight.js): on a foe or empty ground, left click throws a
// fireball and right click calls a firestorm; on a friend, holding left keeps a focus
// shell on them and holding right keeps healing them (no need to stay on target); on
// yourself, holding left keeps healing you and right click sets off a nova. Right click on something interactive (a
// campfire, a door) still interacts. The server checks everything again; this side
// only aims and shows a ring or a reticle.
import { registries, registerHud, onEvent } from '../../shared/registry.js';
import { TILE_PX } from '../../shared/config.js';
import { relation, clearLine, SPELL_FOR } from './sight.js';

const PICK_RADIUS = 0.6; // tiles from the cursor to a target's center (scaled by its size)

let leftLock = null;  // { shell } or { heal, next } from a left press that cast, until released
let rightLock = false; // a right press that cast, until released (so it does not start a guard);
                       // { heal, next } while holding a heal on a friend
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

/** Can a spell reach world point (x, y): in range, and in line of sight if it needs it? */
function reachable(game, x, y, name = 'fireball') {
  const me = game.me, spell = registries.spells.get(name);
  return Math.hypot(x - me.x, y - me.y) <= (spell?.range ?? 11) &&
    (spell?.sight === false || clearLine(game.world, me.x, me.y, x, y));
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
    leftLock = a.spell === 'heal' ? healLock(a.target) : { shell: a.spell === 'shell' };
  } else if (leftLock?.heal != null) {
    keepHealing(game, leftLock);
  }
  if (k.clicked(2) && !interacting()) {
    const a = aim('right');
    game.sendAction('cast', a);
    rightLock = a.spell === 'heal' ? healLock(a.target) : true;
  } else if (rightLock?.heal != null) {
    keepHealing(game, rightLock);
  }
  return { left: !!leftLock, right: !!rightLock };
}

// Just past the heal cooldown, so the server never drops a repeat as too early.
const healEvery = () => (registries.spells.get('heal')?.cooldown ?? 0.6) * 1000 + 60;
const healLock = (id) => ({ heal: id, next: performance.now() + healEvery() });

// Holding the button heals the same player again each cooldown while they are hurt.
function keepHealing(game, lock) {
  if (performance.now() < lock.next) return;
  const t = game.entities.get(lock.heal);
  if (!t || !(t.hp > 0) || t.hp >= t.maxHp) return;
  game.sendAction('cast', { spell: 'heal', target: lock.heal });
  lock.next = performance.now() + healEvery();
}

// A ring around whatever the staff would hit, with the two spells it would cast; over
// empty ground, a reticle with the firestorm's reach. Grey and dashed when the target
// is out of range or out of sight (a fireball at empty ground flies anyway).
registerHud('spell-target', (ctx, game) => {
  if (game.ui || !game.me || !holdsStaff(game) || !game.input.mouse.active) return;
  const hover = hoverTarget(game), C = game.theme.colors;
  const healing = game.entities.get(leftLock?.heal ?? rightLock?.heal);
  if (healing) { // the player we keep healing, wherever the cursor goes
    const p = game.worldToScreen(healing._rx, healing._ry), pulse = 1 + 0.08 * Math.sin(performance.now() / 90);
    ctx.strokeStyle = C.candle;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, TILE_PX * 0.55 * pulse, 0, Math.PI * 2); ctx.stroke();
    if (hover?.e === healing) return;
  }
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
  const left = SPELL_FOR.left[rel], right = SPELL_FOR.right[rel];
  const canLeft = reachable(game, e._rx, e._ry, left), canRight = reachable(game, e._rx, e._ry, right);
  const ok = canLeft || canRight;
  const p = game.worldToScreen(e._rx, e._ry), r = TILE_PX * 0.5 * (e.size || 1);
  const color = !ok ? C.ash : rel === 'foe' ? C.pumpkin : rel === 'self' ? C.moon : C.candle;
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
  const label = !ok ? 'out of sight or range' : [canLeft && `LMB ${left}`, canRight && `RMB ${right}`].filter(Boolean).join('  ·  ');
  ctx.fillText(label, p.x, p.y + r + 4);
});

onEvent('net:spellFail', (game, { reason }) => {
  if (performance.now() - lastFail < 1000) return;
  lastFail = performance.now();
  game.notify(reason, 1.5, game.theme.colors.blood);
});
