// Real multiplayer server: craft, board, reconnect at sea, sail and disembark.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { boatBlocked } from './client.js';
process.env.PORT = '8125'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; await sleep(25); } assert.ok(fn(), 'condition reached'); }
const sockets = [];
async function connect(name) {
  const ws = new WebSocket('ws://localhost:8125'), c = { ws }; sockets.push(ws);
  c.action = (name, data = {}) => ws.send(JSON.stringify({ t: 'action', name, data }));
  c.move = (x, y) => ws.send(JSON.stringify({ t: 'move', x, y, dir: { x: 1, y: 0 } }));
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'welcome') c.id = m.id; if (m.t === 'snap') c.snap = m; });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'hello', name })); await until(() => c.me()); return c;
}
try {
  const a = await connect('Sailor'), b = await connect('Observer'); let p = game.entities.get(a.id);
  for (let y=238;y<=242;y++) for(let x=238;x<=245;x++) game.setTile(x,y,'grass');
  game.setTile(241,240,'water'); game.setTile(242,240,'water'); game.setTile(244,240,'wood-wall');
  a.move(240.5,240.5); await until(() => p.x===240.5 && p.y===240.5);
  game.give(p,'wood',5); a.action('craft',{recipe:'boat'}); await until(()=>a.me().inventory.boat===1);
  assert.ok(!p.inventory.wood);
  a.action('hotbar',{slot:0,item:'boat'}); a.action('select',{slot:0}); await until(()=>a.me().hotbar[0]==='boat');
  a.action('use',{x:241,y:240}); await until(()=>p.sailing && p.x===241.5 && p.y===240.5);
  assert.ok(!p.inventory.boat); await until(()=>b.snap.entities.find(e=>e.id===p.id)?.sailing);
  assert.ok(game.world.blocked(242.5,240.5), 'water blocks walking');
  assert.equal(boatBlocked(game.world,242.5,240.5),false,'boat crosses water');
  assert.equal(boatBlocked(game.world,244.5,240.5),true,'boat respects solid walls');
  a.action('disembark'); await sleep(150); assert.ok(p.sailing && !p.inventory.boat,'cannot leave at sea');
  a.ws.close(); await until(()=>!game.entities.has(a.id));
  const c = await connect('Sailor'); p = game.entities.get(c.id);
  assert.ok(p.sailing && p.x===241.5 && p.y===240.5,'reconnecting at sea keeps boat and position');
  c.move(243.5,240.5); await until(()=>p.x===243.5);
  c.action('disembark'); await until(()=>!p.sailing && p.inventory.boat===1);
  assert.equal(game.world.tile(p.x,p.y).name,'grass');
  console.log('PASS boat crafting, boarding, water movement, walls, at-sea reconnect and safe disembark');
} catch (err) { console.error(err); process.exitCode=1; }
finally { sockets.forEach(ws=>ws.close()); setTimeout(()=>process.exit(process.exitCode||0),100); }
