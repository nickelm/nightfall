// TEAM ART (client helper): touch controls for phones and tablets.
//   bottom left    joystick; hearts and Bag / Map / Menu above it
//   bottom right   the hotbar as a 3x3 grid of slots (tap to hold that item),
//                  with Run / Use / Hit above it
//   the world      tap to turn and swing there, hold to mine where your finger is
// With the inventory open the slots become one row along the bottom: tap an item,
// then a slot, to put it in that slot.
//
// The controls drive the game through the same input the desktop uses: synthetic
// key events (WASD, Space, Shift, E, M, Esc, 1-9) and the mouse buttons. So nothing
// in the player or survival code needs to know about touch. On a touch screen they
// also tidy the screen: the canvas hotbar, the keyboard hints, and the movement-mode
// button give way to the controls (display only; restored when touch is off).
// Shown on touch screens; Esc settings has a row to force them on or off, and
// ?touch=1 in the URL forces them on (handy for testing on a laptop).
import { registries, registerClientSystem, registerHud, registerSetting } from '../../shared/registry.js';

registerSetting('touch', { label: 'Touch controls', options: ['auto', 'on', 'off'], default: 'auto',
  names: { auto: 'on touch screens', on: 'always shown', off: 'hidden' } });

const STICK = 130, KNOB = 56, CELL = 50, GAP = 6, EDGE = 16, ROW = 36;
const ACTIONS = [['Run', 'guard still', 'hold', 'ShiftLeft'], ['Use', 'place', 'right'], ['Hit', 'mine', 'hold', 'Space']];
const MENU = [['Bag', 'KeyE'], ['Map', 'KeyM'], ['Menu', 'Escape']];

const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
const tap = (code) => { key('keydown', code); key('keyup', code); };
const bottom = (px) => `calc(${px}px + env(safe-area-inset-bottom, 0px))`;

function wanted(game) {
  const mode = game.settings.touch;
  if (mode === 'on' || /[?&]touch=1/.test(location.search)) return true;
  return mode !== 'off' && matchMedia('(pointer: coarse)').matches; // phones and tablets, not touch-screen laptops
}

function el(tag, style, parent) {
  const e = document.createElement(tag);
  Object.assign(e.style, { position: 'fixed', zIndex: '3', touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none', ...style });
  (parent || document.body).append(e);
  return e;
}

// A button that does something on press (and on release, for held ones).
function button(game, parent, label, caption, onDown, onUp, accent) {
  const C = game.theme.colors;
  const b = document.createElement('div');
  Object.assign(b.style, {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '10px',
    background: accent ? 'rgba(122,63,176,0.72)' : 'rgba(20,8,32,0.68)', border: `2px solid ${accent ? C.pumpkin : C.purple}`,
    color: C.candle, font: game.font(16), lineHeight: '1', touchAction: 'none',
  });
  b.innerHTML = caption ? `<span>${label}</span><span style="font:${game.font(10)};color:${C.ash};margin-top:2px">${caption}</span>` : label;
  const lit = (on) => { b.style.filter = on ? 'brightness(1.6)' : ''; b.style.transform = on ? 'scale(0.94)' : ''; };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); lit(true); onDown(); });
  const up = () => { lit(false); onUp?.(); };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  parent.append(b);
  return b;
}

function build(game) {
  const C = game.theme.colors, mouse = game.input.mouse;
  const t = { on: false, held: new Set(), pointer: 'touch', world: null, slotKey: '', mode: '', saved: null };
  const press = (code, on) => {
    if (t.held.has(code) === on) return;
    if (on) t.held.add(code); else t.held.delete(code);
    key(on ? 'keydown' : 'keyup', code);
  };

  // hide the movement-mode button (it has no meaning with a joystick)
  const style = document.createElement('style');
  style.textContent = 'body.nf-touch > button[aria-pressed] { display: none !important; }';
  document.head.append(style);

  // --- joystick ---
  t.stick = el('div', {
    left: `${EDGE}px`, bottom: bottom(EDGE), width: `${STICK}px`, height: `${STICK}px`, borderRadius: '50%',
    background: 'rgba(20,8,32,0.45)', border: `2px solid ${C.purple}`,
  });
  const knob = el('div', {
    position: 'absolute', left: `${(STICK - KNOB) / 2 - 2}px`, top: `${(STICK - KNOB) / 2 - 2}px`, width: `${KNOB}px`, height: `${KNOB}px`,
    borderRadius: '50%', background: 'rgba(122,63,176,0.75)', border: `2px solid ${C.pumpkin}`, pointerEvents: 'none',
  }, t.stick);
  let stickId = null;
  const steer = (e) => {
    const r = t.stick.getBoundingClientRect(), max = STICK / 2 - KNOB / 2;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max, ny = dy / max;                         // eight directions, like WASD
    press('KeyA', nx < -0.4); press('KeyD', nx > 0.4); press('KeyW', ny < -0.4); press('KeyS', ny > 0.4);
  };
  t.release = () => {
    stickId = null;
    knob.style.transform = '';
    for (const code of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) press(code, false);
  };
  t.stick.addEventListener('pointerdown', (e) => { e.preventDefault(); t.stick.setPointerCapture(e.pointerId); stickId = e.pointerId; steer(e); });
  t.stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) steer(e); });
  t.stick.addEventListener('pointerup', (e) => { if (e.pointerId === stickId) t.release(); });
  t.stick.addEventListener('pointercancel', (e) => { if (e.pointerId === stickId) t.release(); });

  // --- Bag / Map / Menu ---
  t.menu = el('div', { left: `${EDGE}px`, display: 'grid', gap: `${GAP}px`, gridTemplateColumns: `repeat(3, 44px)`, gridAutoRows: `${ROW}px` });
  for (const [label, code] of MENU) button(game, t.menu, label, '', () => tap(code));

  // --- Run / Use / Hit ---
  t.actions = el('div', { right: `${EDGE}px`, bottom: bottom(EDGE + 3 * CELL + 2 * GAP + GAP), display: 'grid', gap: `${GAP}px`,
    gridTemplateColumns: `repeat(3, ${CELL}px)`, gridAutoRows: '46px' });
  for (const [label, caption, kind, code] of ACTIONS) {
    button(game, t.actions, label, caption,
      () => { if (kind === 'hold') press(code, true); else { mouse.down.add(2); mouse.clicked.add(2); } },
      () => { if (kind === 'hold') press(code, false); else mouse.down.delete(2); }, label !== 'Run');
  }

  // --- the hotbar slots ---
  t.slots = el('div', { right: `${EDGE}px`, bottom: bottom(EDGE), display: 'grid', gap: `${GAP}px` });
  t.cells = [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    Object.assign(cell.style, { position: 'relative', borderRadius: '8px', background: 'rgba(20,8,32,0.9)', border: `2px solid ${C.purple}`, touchAction: 'none' });
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    cell.append(canvas);
    cell.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(`Digit${i + 1}`); });
    cell.addEventListener('contextmenu', (e) => e.preventDefault());
    t.slots.append(cell);
    t.cells.push({ cell, canvas });
  }
  t.label = el('div', { right: `${EDGE}px`, bottom: bottom(EDGE + 3 * CELL + 3 * GAP + 46 + 4), width: `${3 * CELL + 2 * GAP}px`,
    textAlign: 'center', font: game.font(15), color: C.candle, textShadow: '0 0 3px #1a0f22, 0 0 3px #1a0f22', pointerEvents: 'none' });

  // --- the world: tap to swing, hold to mine, where the finger is ---
  t.canvas = document.getElementById('game');
  t.canvas?.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !t.on || game.ui) return;
    e.preventDefault();                                         // no compatibility mouse events
    t.world = e.pointerId;
    mouse.x = e.offsetX; mouse.y = e.offsetY; mouse.active = true;
    mouse.down.add(0); mouse.clicked.add(0);
  });
  t.canvas?.addEventListener('pointermove', (e) => {
    if (e.pointerId !== t.world) return;
    mouse.x = e.offsetX; mouse.y = e.offsetY;
  });
  const lift = (e) => { if (e.pointerId === t.world) { t.world = null; mouse.down.delete(0); } };
  t.canvas?.addEventListener('pointerup', lift);
  t.canvas?.addEventListener('pointercancel', lift);

  addEventListener('pointerdown', (e) => { t.pointer = e.pointerType; }, true);
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') t.pointer = 'mouse'; }, true);
  return t;
}

// Draw the slots again only when what they show changes.
function paintSlots(game, t) {
  const me = game.me, bar = me.hotbar || [], inv = me.inventory || {}, sel = game.selectedSlot;
  const k = `${t.mode}|${sel}|${bar.map((n) => `${n}:${inv[n] || 0}`).join(',')}`;
  if (k === t.slotKey) return;
  t.slotKey = k;
  const C = game.theme.colors, dpr = devicePixelRatio || 1, size = t.mode === 'row' ? ROW : CELL;
  t.cells.forEach(({ cell, canvas }, i) => {
    cell.style.borderColor = i === sel ? C.pumpkin : C.purple;
    cell.style.background = i === sel ? 'rgba(74,36,110,0.94)' : 'rgba(20,8,32,0.9)';
    canvas.width = canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const name = bar[i];
    if (name) {
      const drawer = registries.drawers.get(`item:${name}`);
      ctx.save();
      if (drawer) drawer(ctx, registries.items.get(name), size / 2, size / 2, size * 0.78, game);
      else { ctx.fillStyle = registries.items.get(name)?.color || '#ccc'; ctx.fillRect(size * 0.3, size * 0.3, size * 0.4, size * 0.4); }
      ctx.restore();
      const n = inv[name] || 0;
      if (n > 1) {
        ctx.font = game.font(12); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3; ctx.strokeStyle = '#1a0f22'; ctx.strokeText(n, size - 3, size - 1);
        ctx.fillStyle = C.bone; ctx.fillText(n, size - 3, size - 1);
      }
    }
    ctx.font = game.font(10); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.ash;
    ctx.fillText(i + 1, 3, 2);
  });
  const held = bar[sel];
  t.label.textContent = held ? `${held.replace(/-/g, ' ')}${(inv[held] || 0) > 1 ? `  ×${inv[held]}` : ''}` : '';
}

// The canvas hotbar and the keyboard hints give way to the controls while touch is on.
function tidy(game, t, on) {
  document.body.classList.toggle('nf-touch', on);
  const hud = registries.huds.find((h) => h.name === 'survival/hotbar');
  if (hud && !hud.fn.touchAware) {
    const draw = hud.fn;
    hud.fn = (ctx, g, w, h) => { if (!g._touch?.on) draw(ctx, g, w, h); };
    hud.fn.touchAware = true;
  }
  if (on) {
    t.saved = { hints: registries.keyHints.splice(0), movement: game.settings.movement };
    game.settings.movement = 'screen';                          // the joystick moves relative to the screen
  } else if (t.saved) {
    registries.keyHints.push(...t.saved.hints);
    game.settings.movement = t.saved.movement;
    t.saved = null;
  }
}

registerClientSystem('touch-controls', (game) => {
  const on = wanted(game) && !!game.me;
  if (!on && !game._touch) return;
  const t = (game._touch ||= build(game));
  if (on !== t.on) {
    t.on = on;
    tidy(game, t, on);
    if (t.canvas) t.canvas.style.touchAction = on ? 'none' : '';
    if (!on) { t.release(); for (const code of [...t.held]) { t.held.delete(code); key('keyup', code); } }
  }
  const show = (e, visible, display = 'grid') => { e.style.display = visible ? display : 'none'; };
  const inventory = game.ui === 'inventory';
  show(t.stick, on && !game.ui, 'block');
  show(t.actions, on && !game.ui);
  show(t.label, on && !game.ui, 'block');
  show(t.menu, on);
  show(t.slots, on && (!game.ui || inventory));
  if (!on) return;
  if (game.ui) t.release();                                     // stop walking while a panel is open

  // a 3x3 grid beside the joystick, or one row along the bottom under the inventory
  const mode = inventory ? 'row' : 'grid';
  if (mode !== t.mode) {
    t.mode = mode;
    const row = mode === 'row', size = row ? ROW : CELL, cols = row ? 9 : 3;
    Object.assign(t.slots.style, { gridTemplateColumns: `repeat(${cols}, ${size}px)`, gridAutoRows: `${size}px`, gap: `${row ? 4 : GAP}px`,
      right: row ? '' : `${EDGE}px`, left: row ? '50%' : '', transform: row ? 'translateX(-50%)' : '' });
    t.menu.style.bottom = bottom(row ? EDGE + ROW + 10 : EDGE + STICK + 12);
  }
  paintSlots(game, t);

  // Without a finger on the world, aim follows the joystick. A real mouse keeps aiming as usual.
  if (t.world === null && t.pointer !== 'mouse') game.input.mouse.active = false;
  if (game.settings.movement !== 'screen') { t.saved.movement = game.settings.movement; game.settings.movement = 'screen'; }
});

// Hearts above the Bag / Map / Menu buttons (the canvas hotbar that usually shows them is hidden).
registerHud('touch-hearts', (ctx, game) => {
  const t = game._touch, me = game.me;
  if (!t?.on || !me || game.ui) return;
  const r = t.menu.getBoundingClientRect(), C = game.theme.colors;
  const n = me.maxHp || 0, size = Math.min(15, (r.width + 30) / Math.max(1, n));
  for (let i = 0; i < n; i++) {
    const x = r.left + i * size + size / 2, y = r.top - 14;
    ctx.fillStyle = i < me.hp ? C.blood : 'rgba(60,30,60,0.85)';
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.35);
    ctx.bezierCurveTo(x - size * 0.6, y - size * 0.1, x - size * 0.3, y - size * 0.55, x, y - size * 0.2);
    ctx.bezierCurveTo(x + size * 0.3, y - size * 0.55, x + size * 0.6, y - size * 0.1, x, y + size * 0.35);
    ctx.fill();
    ctx.strokeStyle = '#1a0f22'; ctx.lineWidth = 1.5; ctx.stroke();
  }
});
