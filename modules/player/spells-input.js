// TEAM PLAYER (client helper): casting with a staff or a mace in hand. The item, the
// button, and what is under the cursor pick the spell (SPELLS_BY_ITEM in sight.js):
//   staff  LMB fireball at a foe or empty ground (at yourself: nova), RMB firestorm
//   mace   LMB heal, RMB mend (heal over time while held), on a friend or yourself
// Holding LMB with the mace repeats the heal; holding RMB keeps the mend going. Once a
// heal or mend starts it stays on that player while the button is held. A button with
// no spell for what is under the cursor does its usual thing (swing, mine, guard), and
// right click on something interactive (a campfire, a door) still interacts. The
// server checks everything again; this side only aims and shows a ring or a reticle.
import { registries, registerHud, onEvent } from '../../shared/registry.js';
import { TILE_PX } from '../../shared/config.js';
import { relation, clearLine, SPELLS_BY_ITEM } from './sight.js';

const PICK_RADIUS = 0.6; // tiles from the cursor to a target's center (scaled by its size)

// What a button press that cast holds on to until the button is released (so it does
// not also swing or guard): {} for a one-off, { heal, next } for a repeating heal,
// { mend } for a held mend.
let leftLock = null;
let rightLock = null;
let lastFail = 0;

/** The casting item in hand ('staff', 'mace') or null. */
const castingItem = (game) => {
  const name = game.me?.hotbar?.[game.selectedSlot];
  return SPELLS_BY_ITEM[name] ? name : null;
};

/** The entity under the cursor that the item has a spell for and that we can see, as { e, rel }, or null. */
function hoverTarget(game, item) {
  const me = game.me, m = game.input.mouse, table = SPELLS_BY_ITEM[item];
  if (!m.active) return null;
  const p = game.screenToWorld(m.x, m.y);
  let best = null, bestD = Infinity;
  for (const e of game.entities.values()) {
    const rel = relation(me, e);
    if (!rel || !(table.left[rel] || table.right[rel]) || !game.canSee(e._rx, e._ry)) continue;
    const d = Math.hypot(e._rx - p.x, e._ry - p.y);
    if (d < PICK_RADIUS * (e.size || 1) && d < bestD) { best = { e, rel }; bestD = d; }
  }
  return best;
}

/** Can a spell reach world point (x, y): in range, and in line of sight if it needs it? */
function reachable(game, x, y, name) {
  const me = game.me, spell = registries.spells.get(name);
  return !!spell && Math.hypot(x - me.x, y - me.y) <= spell.range &&
    (spell.sight === false || clearLine(game.world, me.x, me.y, x, y));
}

const cursor = (game) => game.screenToWorld(game.input.mouse.x, game.input.mouse.y);

// The cast a button would make now: at the target under the cursor, else at empty ground
// if the item has a spell for that, else null (the button keeps its usual job).
function aim(game, item, side, hover) {
  const table = SPELLS_BY_ITEM[item][side];
  if (hover) return table[hover.rel] ? { spell: table[hover.rel], target: hover.e.id } : null;
  if (!table.ground) return null;
  const me = game.me, p = game.input.mouse.active ? cursor(game) : { x: me.x + me.dir.x * 3, y: me.y + me.dir.y * 3 };
  return { spell: table.ground, x: p.x, y: p.y };
}

function press(game, a) {
  if (a.spell === 'mend') { game.sendAction('mend', { target: a.target }); return { mend: a.target }; }
  game.sendAction('cast', a);
  return a.spell === 'heal' ? { heal: a.target, next: performance.now() + healEvery() } : {};
}

function release(game, lock) {
  if (lock?.mend != null) game.sendAction('mend', { stop: true });
}

/** Call once per frame from the movement system. Returns which mouse buttons casting
 *  took this frame, so the caller skips mining, swinging, and guarding for them.
 *  `interacting()`: true when the right button should interact with what is aimed at instead. */
export function updateCasting(game, free, interacting = () => false) {
  const k = game.input, item = castingItem(game);
  const active = free && !!item;
  if (leftLock && (!active || !k.mouseDown(0))) { release(game, leftLock); leftLock = null; }
  if (rightLock && (!active || !k.mouseDown(2))) { release(game, rightLock); rightLock = null; }
  if (!active) return { left: false, right: false };

  const hover = hoverTarget(game, item);
  if (k.clicked(0)) {
    const a = aim(game, item, 'left', hover);
    if (a) leftLock = press(game, a);
  } else if (leftLock?.heal != null) {
    keepHealing(game, leftLock);
  }
  if (k.clicked(2) && !interacting()) {
    const a = aim(game, item, 'right', hover);
    if (a) rightLock = press(game, a);
  } else if (rightLock?.heal != null) {
    keepHealing(game, rightLock);
  }
  return { left: !!leftLock, right: !!rightLock };
}

// Just past the heal cooldown, so the server never drops a repeat as too early.
const healEvery = () => (registries.spells.get('heal')?.cooldown ?? 0.6) * 1000 + 60;

// Holding the button heals the same player again each cooldown while they are hurt.
function keepHealing(game, lock) {
  if (performance.now() < lock.next) return;
  const t = game.entities.get(lock.heal);
  if (!t || !(t.hp > 0) || t.hp >= t.maxHp) return;
  game.sendAction('cast', { spell: 'heal', target: lock.heal });
  lock.next = performance.now() + healEvery();
}

// A ring around whatever the item would cast at, with the spells it would cast; with
// the staff over empty ground, a reticle with the firestorm's reach. Grey and dashed
// when the target is out of range or out of sight (a fireball at empty ground flies anyway).
registerHud('spell-target', (ctx, game) => {
  const item = castingItem(game);
  if (game.ui || !game.me || !item || !game.input.mouse.active) return;
  const hover = hoverTarget(game, item), C = game.theme.colors, table = SPELLS_BY_ITEM[item];
  const healing = game.entities.get(leftLock?.heal ?? leftLock?.mend ?? rightLock?.heal ?? rightLock?.mend);
  if (healing) { // the player we keep healing, wherever the cursor goes
    const p = game.worldToScreen(healing._rx, healing._ry), pulse = 1 + 0.08 * Math.sin(performance.now() / 90);
    ctx.strokeStyle = C.candle;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, TILE_PX * 0.55 * pulse, 0, Math.PI * 2); ctx.stroke();
    if (hover?.e === healing) return;
  }
  if (!hover) {
    if (!table.right.ground) return;
    const c = cursor(game), p = game.worldToScreen(c.x, c.y);
    const ok = reachable(game, c.x, c.y, table.right.ground);
    ctx.strokeStyle = ok ? C.pumpkin : C.ash;
    ctx.lineWidth = 1.5;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.beginPath(); ctx.moveTo(p.x + dx * 4, p.y + dy * 4); ctx.lineTo(p.x + dx * 10, p.y + dy * 10); ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([4, 6]);
    const r = (registries.spells.get(table.right.ground)?.radius ?? 2.5) * TILE_PX;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    return;
  }
  const { e, rel } = hover;
  const left = table.left[rel], right = table.right[rel];
  const canLeft = left && reachable(game, e._rx, e._ry, left), canRight = right && reachable(game, e._rx, e._ry, right);
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
