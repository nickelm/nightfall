// Real multiplayer server: craft a staff, then fireball, line of sight, heal, focus shell, firestorm.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
process.env.PORT = '8138'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const { nearestPlayer } = await import('../creatures/monsters-server.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; await sleep(25); } assert.ok(fn(), 'condition reached'); }
const sockets = [];
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8138'), c = { ws, events: [] }; sockets.push(ws);
  c.action = (name, data = {}) => ws.send(JSON.stringify({ t: 'action', name, data }));
  c.move = (x, y) => ws.send(JSON.stringify({ t: 'move', x, y, dir: { x: 1, y: 0 } }));
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'welcome') c.id = m.id; if (m.t === 'snap') c.snap = m; if (m.t === 'event') c.events.push(m); });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'hello', name })); await until(() => c.me()); return c;
}
const frozen = (x, y) => game.spawn('zombie', { x, y, stunnedUntil: 1e9 }); // stunned monsters stand still
try {
  const a = await connect('Mage'), b = await connect('Friend');
  const pa = game.entities.get(a.id), pb = game.entities.get(b.id);
  for (let y = 234; y <= 246; y++) for (let x = 228; x <= 252; x++) game.setTile(x, y, 'grass');
  a.move(232.5, 240.5); b.move(234.5, 238.5);
  await until(() => pa.x === 232.5 && pb.x === 234.5);
  const byMage = []; // damage dealt by the mage's spells (light from any source also burns monsters)
  game.bus.on('damage', hit => { if (hit.source === pa && !hit.cancelled) byMage.push(hit); });

  // craft the staff: a mana pool appears
  game.give(pa, 'wood', 3); game.give(pa, 'monster-goo', 3);
  a.action('craft', { recipe: 'staff' }); await until(() => a.me().inventory.staff === 1);
  a.action('hotbar', { slot: 0, item: 'staff' }); a.action('select', { slot: 0 });
  await until(() => a.me().maxMana === 20 && a.me().hotbar[0] === 'staff');
  pa.mana = 20;

  // fireball
  const z1 = frozen(238.5, 240.5);
  a.action('cast', { spell: 'fireball', target: z1.id });
  await until(() => byMage.some(h => h.target === z1));
  assert.ok(pa.mana < 20, 'fireball costs mana');
  await until(() => a.events.some(m => m.name === 'boom')); // the fireball explodes

  // a wall blocks line of sight: no cast, no mana spent
  game.setTile(236, 240, 'stone-block');
  await sleep(600); pa.mana = 20;
  a.action('cast', { spell: 'fireball', target: z1.id });
  await until(() => a.events.some(m => m.name === 'spellFail' && m.data.reason === 'No line of sight'));
  assert.equal(pa.mana, 20, 'a blocked cast costs nothing');
  game.setTile(236, 240, 'grass');

  // a fireball at empty ground flies straight on and hits whatever is in the way
  await sleep(600); pa.mana = 20;
  const hits = byMage.length;
  a.action('cast', { spell: 'fireball', x: 235, y: 240.5 });
  await until(() => byMage.slice(hits).some(h => h.target === z1));

  // heal a hurt friend
  pb.hp = 4;
  a.action('cast', { spell: 'heal', target: pb.id });
  const heal = (await import('../../shared/registry.js')).registries.spells.get('heal');
  await until(() => pb.hp === 4 + heal.amount);
  assert.ok(heal.cost <= 2, 'healing stays cheap');
  await sleep(heal.cooldown * 1000 + 100);
  a.action('cast', { spell: 'heal', target: pb.id }); // held RMB repeats the cast each cooldown
  await until(() => pb.hp === 4 + 2 * heal.amount);
  pb.hp = 8;

  // focus shell: the friend takes no damage and cannot attack until released
  pa.mana = 20;
  a.action('shell', { target: pb.id }); await until(() => pb.shelled && pa.channeling === pb.id);
  assert.equal(game.damage(pb, 3, null), 0, 'shelled players take no damage');
  assert.equal(pb.hp, 8);
  const cooldown = pb._attackCooldown;
  b.action('attack'); await sleep(150);
  assert.equal(pb._attackCooldown, cooldown, 'shelled players cannot attack');
  assert.ok(pa.mana < 20 - 2, 'holding a shell drains mana');
  a.action('shell', { stop: true }); await until(() => !pb.shelled && pa.channeling == null);
  assert.equal(game.damage(pb, 3, null), 3, 'damage lands again after the shell');

  // a sword swing taunts nearby foes: they go after the fighter, not the nearest player
  const zt = frozen(233.5, 241.5); // nearer the mage than the fighter
  b.action('attack'); await until(() => zt.tauntedBy === pb.id);
  assert.equal(nearestPlayer(game, zt, 8), pb, 'taunted foes chase the fighter');
  assert.ok(b.events.some(m => m.name === 'taunt'));
  zt.tauntedUntil = 0;
  assert.equal(nearestPlayer(game, zt, 8), pa, 'once the taunt ends, the nearest player again');

  // firestorm at a point rains meteors on a pack
  pa.mana = 20;
  const pack = [frozen(240, 240), frozen(241, 240), frozen(240, 241), frozen(241, 241)];
  const booms = a.events.length;
  a.action('cast', { spell: 'firestorm', x: 240.5, y: 240.5 });
  await until(() => a.events.slice(booms).filter(m => m.name === 'boom' && m.data.size === 'big').length >= 10, 4000);
  assert.ok(byMage.some(h => pack.includes(h.target)), 'firestorm hurts the pack');
  await until(() => ![...game.entities.values()].some(e => e.type === 'firestorm' || e.type === 'blast'), 2000); // storm and blasts burn out
  // heal yourself (LMB on self)
  pa.hp = 5; await sleep(heal.cooldown * 1000 + 100);
  a.action('cast', { spell: 'heal', target: pa.id });
  await until(() => pa.hp === 5 + heal.amount);

  // nova (RMB on self): a heavy hit on every foe around, a lighter one on friends, none on the caster
  const nova = (await import('../../shared/registry.js')).registries.spells.get('nova');
  pa.mana = 20; pa.hp = 10; pb.hp = pb.maxHp;
  const hpB = pb.hp, before = byMage.length;
  a.action('cast', { spell: 'nova', target: pa.id });
  await until(() => byMage.slice(before).some(h => h.target === zt && h.amount === nova.damage));
  assert.ok(pa.hp >= 10, 'the nova spares its caster'); // a kill may level them up, which adds health
  assert.equal(pb.hp, hpB - nova.friendDamage, 'and friends caught in it');
  assert.ok(a.events.some(m => m.name === 'nova'));
  console.log('PASS staff, mana, fireball (target and direction), line of sight, heal (friend and self), focus shell, sword taunt, firestorm at a point, nova');
} catch (err) { console.error(err); process.exitCode = 1; }
finally { sockets.forEach(ws => ws.close()); setTimeout(() => process.exit(process.exitCode || 0), 100); }
