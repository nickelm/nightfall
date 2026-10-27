// TEAM PLAYER (server helper): mana and spells. Owning a staff gives a mana pool;
// with the staff in hand the client sends `cast { spell, target }` (fireball,
// firestorm, heal), `cast { spell, x, y }` (fireball or firestorm at empty ground),
// or `shell { target }` / `shell { stop }` (hold to protect a friend).
// Every spell needs line of sight to its target (sight.js). Spell numbers live in
// the registerSpell calls in shared.js.
import { registries, onAction, onEvent, registerSystem } from '../../shared/registry.js';
import { relation, clearLine } from './sight.js';

const MAX_MANA = 20;
const MANA_REGEN = 2.5;  // per second, paused while channeling a shell
const HIT_RADIUS = 0.5;  // tiles: a fireball explodes this close to a foe
const SUBSTEPS = 3;

const isFoe = (e) => relation({ id: null }, e) === 'foe';
const holdsStaff = (p) => p.hotbar?.[p.selected] === 'staff';

// Why `p` may not aim `spell` at `target` (an entity) or at `point` (empty ground)
// right now, or null if it may. Cooldown and mana are checked separately (a held
// shell skips the cooldown). A fireball at empty ground is just a direction.
function blocked(game, p, spell, target, point = null) {
  if (!(p.hp > 0) || !holdsStaff(p)) return 'Hold the staff to cast';
  if (p.shelled) return 'You cannot cast inside a shell';
  if (!spell) return 'No target';
  if (target ? ![].concat(spell.on).includes(relation(p, target)) : !(point && spell.free)) return 'No target';
  if (!target && spell.free === 'direction') return null;
  const at = target || point;
  if (Math.hypot(at.x - p.x, at.y - p.y) > spell.range) return 'Out of range';
  if (!clearLine(game.world, p.x, p.y, at.x, at.y)) return 'No line of sight';
  return null;
}

function fail(game, p, reason) { game.sendTo(p.id, 'spellFail', { reason }); }

// A burst of light where something explodes, plus the client-side fireworks.
function explode(game, x, y, size, colors = {}) {
  game.spawn('blast', { x, y, peak: size === 'big' ? 4.5 : 3.2, ...colors });
  game.broadcast('boom', { x, y, size, kind: colors.kind || 'fire' });
}

const CASTS = {
  // Homes in on a target; aimed at empty ground, it flies straight out to its range.
  fireball(game, p, spell, target, at) {
    const dx = at.x - p.x, dy = at.y - p.y, len = Math.hypot(dx, dy) || 1;
    game.spawn('fireball', {
      x: p.x + (dx / len) * 0.5, y: p.y + (dy / len) * 0.5,
      vx: (dx / len) * spell.speed, vy: (dy / len) * spell.speed,
      target: target?.id ?? null, owner: p.id, damage: spell.damage, ttl: (spell.range + (target ? 4 : 0)) / spell.speed,
    });
  },
  firestorm(game, p, spell, target, at) {
    game.spawn('firestorm', { x: at.x, y: at.y, radius: spell.radius, owner: p.id, ttl: spell.duration + 0.3, _next: 0.3, _age: 0 });
  },
  // Every foe in reach and in sight takes a heavy hit and is flung away; friends
  // inside take some too (the caster does not), so mind who stands next to you.
  nova(game, p, spell) {
    for (const e of game.near(p.x, p.y, spell.radius, isFoe)) {
      if (!clearLine(game.world, p.x, p.y, e.x, e.y)) continue;
      if (game.damage(e, spell.damage, p)) game.knockback(e, p.x, p.y, 1.5);
    }
    for (const f of game.near(p.x, p.y, spell.radius, (e) => e.type === 'player' && e.hp > 0 && e !== p)) {
      if (clearLine(game.world, p.x, p.y, f.x, f.y)) game.damage(f, spell.friendDamage, p);
    }
    game.spawn('blast', { x: p.x, y: p.y, peak: 6, ttl: 0.8, hot: '#e8c0ff', cool: '#7a3fb0' });
    game.broadcast('nova', { id: p.id, x: p.x, y: p.y, radius: spell.radius });
  },
  heal(game, p, spell, target) {
    target.hp = Math.min(target.maxHp, target.hp + spell.amount);
    explode(game, target.x, target.y, 'small', { hot: '#fff2b0', cool: '#ffc040', kind: 'heal', peak: 2.5 });
  },
};

onAction('cast', (game, p, { spell: name, target: id, x, y } = {}) => {
  const spell = registries.spells.get(name);
  if (!CASTS[name] || !spell) return;
  const target = id != null ? game.entities.get(id) : null;
  const point = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  const reason = blocked(game, p, spell, target, point);
  if (reason) return fail(game, p, reason);
  p._spellReady ||= {};
  if (game.time < (p._spellReady[name] || 0)) return; // still cooling down: ignore quietly
  if ((p.mana || 0) < spell.cost) return fail(game, p, 'Not enough mana');
  if (name === 'heal' && target && target.hp >= target.maxHp) return fail(game, p, `${target.name || 'They'} is unhurt`);
  p.mana -= spell.cost;
  p._spellReady[name] = game.time + spell.cooldown;
  const at = target || point;
  CASTS[name](game, p, spell, target, at);
  game.broadcast('cast', { spell: name, id: p.id, x: p.x, y: p.y, target: target?.id ?? null, tx: at.x, ty: at.y, amount: spell.amount });
});

onAction('shell', (game, p, { target: id, stop } = {}) => {
  if (stop) { p._shellTarget = null; p.channeling = null; return; }
  const spell = registries.spells.get('shell');
  const target = game.entities.get(id);
  const reason = blocked(game, p, spell, target);
  if (reason) return fail(game, p, reason);
  if ((p.mana || 0) < spell.cost) return fail(game, p, 'Not enough mana');
  p.mana -= spell.cost;
  p._shellTarget = target.id;
  p.channeling = target.id;
  game.broadcast('cast', { spell: 'shell', id: p.id, x: p.x, y: p.y, target: target.id, tx: target.x, ty: target.y });
});

// Owning a staff gives a mana pool, which refills unless you are holding a shell.
registerSystem('mana', (game, dt) => {
  for (const p of game.players()) {
    p.maxMana = game.has(p, 'staff') ? MAX_MANA : 0;
    p.mana = Math.min(p.maxMana, p.mana || 0);
    if (!p._shellTarget) p.mana = Math.min(p.maxMana, p.mana + MANA_REGEN * dt);
  }
});

// Each tick, every channeling caster re-checks its target and pays for the shell;
// then `shelled` is set on exactly the players someone is still protecting.
registerSystem('shell', (game, dt) => {
  const spell = registries.spells.get('shell');
  const protectedIds = new Set();
  for (const p of game.players()) {
    if (p._shellTarget == null) { p.channeling = null; continue; }
    const target = game.entities.get(p._shellTarget);
    let reason = blocked(game, p, spell, target);
    if (!reason) {
      p.mana -= spell.drain * dt;
      if (p.mana <= 0) { p.mana = 0; reason = 'Out of mana'; }
    }
    if (reason) {
      p._shellTarget = null;
      p.channeling = null;
      fail(game, p, `Shell broke: ${reason.toLowerCase()}`);
      continue;
    }
    p.channeling = target.id;
    protectedIds.add(target.id);
  }
  for (const p of game.players()) p.shelled = protectedIds.has(p.id);
});

// A shelled player takes no damage at all.
onEvent('damage', (game, hit) => {
  if (!hit.target.shelled || hit.cancelled) return;
  hit.cancelled = true;
  game.broadcast('shellHit', { id: hit.target.id, x: hit.target.x, y: hit.target.y });
});

// Fireballs home in on their target and explode on the first foe or wall they touch.
registerSystem('fireballs', (game, dt) => {
  for (const e of [...game.entities.values()]) {
    if (e.type !== 'fireball') continue;
    e.ttl -= dt;
    if (e.ttl <= 0) { game.despawn(e.id); explode(game, e.x, e.y, 'small'); continue; }
    const target = game.entities.get(e.target);
    const speed = Math.hypot(e.vx, e.vy) || 1;
    if (target && target.hp > 0) { // steer most of the way toward where the target is now
      const dx = target.x - e.x, dy = target.y - e.y, len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dt * 10);
      e.vx += ((dx / len) * speed - e.vx) * k;
      e.vy += ((dy / len) * speed - e.vy) * k;
      const s = Math.hypot(e.vx, e.vy) || 1;
      e.vx *= speed / s; e.vy *= speed / s;
    }
    const owner = game.entities.get(e.owner) || null;
    for (let i = 0; i < SUBSTEPS; i++) {
      e.x += (e.vx * dt) / SUBSTEPS;
      e.y += (e.vy * dt) / SUBSTEPS;
      const hit = game.near(e.x, e.y, HIT_RADIUS, isFoe)[0];
      if (hit) {
        if (game.damage(hit, e.damage, owner)) game.knockback(hit, e.x - e.vx, e.y - e.vy, 0.5);
      }
      if (hit || game.world.isSolid(e.x, e.y)) {
        game.despawn(e.id);
        explode(game, e.x, e.y, 'small');
        break;
      }
    }
  }
});

// A firestorm rains meteors on random spots in its radius, then burns out.
registerSystem('firestorms', (game, dt) => {
  const spell = registries.spells.get('firestorm');
  for (const e of [...game.entities.values()]) {
    if (e.type !== 'firestorm') continue;
    e._age = (e._age || 0) + dt;
    e._next ??= 0;
    const every = spell.duration / spell.meteors;
    while (e._age >= e._next && e._next < e.ttl) {
      e._next += every;
      const a = Math.random() * Math.PI * 2, r = e.radius * Math.sqrt(Math.random());
      const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
      const owner = game.entities.get(e.owner) || null;
      for (const t of game.near(x, y, spell.splash, isFoe)) {
        if (game.damage(t, spell.damage, owner)) game.knockback(t, x, y, 0.4);
      }
      explode(game, x, y, 'big');
    }
    if (e._age >= e.ttl) game.despawn(e.id);
  }
});

// Blasts swell and fade: yellow-white at first, deep red as they die.
registerSystem('blasts', (game, dt) => {
  for (const e of [...game.entities.values()]) {
    if (e.type !== 'blast') continue;
    e.age += dt;
    if (e.age >= e.ttl) { game.despawn(e.id); continue; }
    e.light = e.peak * Math.sin((Math.PI * e.age) / e.ttl);
    e.lightColor = e.age < e.ttl * 0.45 ? e.hot : e.cool;
  }
});
