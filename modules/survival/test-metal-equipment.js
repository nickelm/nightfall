// Real-server crafting, combat and tree-harvesting checks.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
process.env.PORT = '8113'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (fn()) return; await sleep(20); }
  assert.ok(fn(), 'condition reached before timeout');
}
const ws = new WebSocket('ws://localhost:8113');
let id, snapshot;
const action = (name, data = {}) => ws.send(JSON.stringify({ t: 'action', name, data }));
const me = () => snapshot?.entities.find(e => e.id === id);
ws.on('message', raw => {
  const m = JSON.parse(raw);
  if (m.t === 'welcome') id = m.id;
  if (m.t === 'snap') snapshot = m;
});
try {
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'hello', name: 'Smith' }));
  await until(() => me());
  const player = game.entities.get(id);
  for (const [item, count] of Object.entries({ wood: 9, iron: 5, gold: 5, diamond: 5 })) game.give(player, item, count);
  for (const metal of ['iron', 'gold', 'diamond']) for (const kind of ['axe', 'sword']) {
    const item = `${metal}-${kind}`;
    action('craft', { recipe: item });
    await until(() => me().inventory[item] === 1);
  }
  for (const material of ['wood', 'iron', 'gold', 'diamond']) assert.ok(!player.inventory[material], `${material} consumed`);
  action('craft', { recipe: 'gold-sword' }); await sleep(150);
  assert.equal(player.inventory['gold-sword'], 1, 'crafting needs materials');
  console.log('PASS all six items craft and consume their matching materials');
  for (let y = 78; y <= 82; y++) for (let x = 78; x <= 83; x++) game.setTile(x, y, 'grass');
  ws.send(JSON.stringify({ t: 'move', x: 80.5, y: 80.5, dir: { x: 1, y: 0 } }));
  await until(() => player.x === 80.5 && player.y === 80.5);
  async function equip(item) { action('hotbar', { slot: 0, item }); action('select', { slot: 0 }); await until(() => me().hotbar[0] === item); }
  for (const [metal, damage] of [['iron', 3], ['gold', 4], ['diamond', 5]]) {
    await equip(`${metal}-sword`);
    const slime = game.spawn('slime', { x: 81.25, y: 80.5, hp: 100, speed: 0, aggro: 0, stunnedUntil: game.time + 10 });
    await sleep(400); action('attack');
    await until(() => slime.hp < 100);
    assert.equal(slime.hp, 100 - damage, `${metal} sword deals ${damage} damage`);
    game.despawn(slime.id);
  }
  console.log('PASS each sword deals its stated damage through real combat');
  for (const metal of ['iron', 'gold', 'diamond']) {
    await equip(`${metal}-axe`); game.setTile(81, 80, 'tree');
    const before = player.inventory.wood || 0;
    action('mine', { x: 81, y: 80 });
    await until(() => (me().inventory.wood || 0) === before + 1);
    assert.equal(game.world.tile(81, 80).name, 'grass');
  }
  console.log('PASS all three axes harvest trees');
} catch (err) { console.error(err); process.exitCode = 1; }
finally { ws.close(); setTimeout(() => process.exit(process.exitCode || 0), 100); }
