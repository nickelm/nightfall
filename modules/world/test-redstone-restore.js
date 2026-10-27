// Verify real save/restart/reconnect preserves an operational circuit.
// Run: node modules/world/test-redstone-restore.js
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { World } from '../../shared/world.js';
import { loadModules } from '../../shared/loader.js';

await loadModules('shared', p => import(`../${p}`));
const stateFile = path.join(os.tmpdir(), `nightfall-redstone-${process.pid}.json`);
const clients = [];
let child = null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(25); }
  assert.ok(fn(), 'condition reached before timeout');
}
async function start(restore) {
  let log = '';
  child = fork('modules/world/test-redstone-fixture.js', [], {
    env: { ...process.env, PORT: '8109', SEED: '4242', START_TIME: '10', STATE_FILE: stateFile, RESTORE: restore ? '1' : '' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  await until(() => log.includes('local:') || child.exitCode !== null);
  assert.ok(log.includes('local:'), `fixture failed to start: ${log}`);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const running = child;
  const exited = new Promise(resolve => running.once('exit', resolve));
  running.send('save-and-exit');
  const timedOut = await Promise.race([exited.then(() => false), sleep(3000).then(() => true)]);
  if (timedOut) { running.kill('SIGKILL'); await exited; throw new Error('server did not save and stop'); }
  child = null;
}
async function connect() {
  const ws = new WebSocket('ws://localhost:8109');
  const c = { ws, send: msg => ws.send(JSON.stringify(msg)) };
  clients.push(c);
  c.action = (name, data) => c.send({ t: 'action', name, data });
  c.move = (x, y) => c.send({ t: 'move', x, y, dir: { x: 1, y: 0 } });
  c.me = () => c.snap?.entities.find(e => e.id === c.id);
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') { c.id = m.id; c.world = World.generate(m.w, m.h, m.seed); c.world.applyEdits(m.edits); }
    if (m.t === 'snap') c.snap = m;
    if (m.t === 'tile') c.world.edit(m.x, m.y, m.id);
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  c.send({ t: 'hello', name: 'CircuitRestore' });
  await until(() => c.me());
  return c;
}
async function equip(c, item) {
  c.action('hotbar', { slot: 0, item }); c.action('select', { slot: 0 });
  await until(() => c.me().hotbar[0] === item && c.me().selected === 0);
}

let failed = false;
try {
  await start(false);
  const a = await connect();
  await until(() => a.me().inventory['redstone-wire'] === 2 && a.me().inventory['redstone-lamp'] === 1);
  a.move(81.5, 79.5); await until(() => a.me().x === 81.5 && a.me().y === 79.5);
  await equip(a, 'power-crystal');
  a.action('use', { x: 82, y: 80 });
  await until(() => a.snap.entities.some(e => e.type === 'power-source'));
  await equip(a, 'redstone-wire');
  a.action('use', { x: 83, y: 80 });
  await until(() => a.world.tile(83, 80).powered);
  a.move(83.5, 79.5); await until(() => a.me().x === 83.5);
  a.action('use', { x: 84, y: 80 });
  await until(() => a.world.tile(84, 80).powered);
  a.move(84.5, 79.5); await until(() => a.me().x === 84.5);
  await equip(a, 'redstone-lamp');
  a.action('use', { x: 85, y: 80 });
  await until(() => a.snap.entities.some(e => e.type === 'redstone-lamp' && e.powered));
  const empty = a.me().hotbar.findIndex(item => !item);
  assert.notEqual(empty, -1);
  a.action('select', { slot: empty }); await until(() => a.me().selected === empty);
  a.action('interact', { x: 85, y: 80 });
  await until(() => a.snap.entities.some(e => e.type === 'redstone-lamp' && !e.on && e.powered));

  await stop();
  assert.ok(fs.existsSync(stateFile), 'server saved its state');
  await start(true);
  const b = await connect();
  await until(() => b.world.tile(83, 80).powered && b.world.tile(84, 80).powered &&
    b.snap.entities.some(e => e.type === 'redstone-lamp' && e.powered && e.light === 6));
  assert.equal(b.snap.entities.filter(e => e.type === 'power-source').length, 1);
  console.log('PASS powered wire, crystal, lamp, and light survive a real server restart');

  b.move(82.5, 79.5); await until(() => b.me().x === 82.5);
  const slot = b.me().hotbar.findIndex(item => !item);
  assert.notEqual(slot, -1);
  b.action('select', { slot }); await until(() => b.me().selected === slot);
  b.action('interact', { x: 82, y: 80 });
  await until(() => !b.world.tile(83, 80).powered && !b.world.tile(84, 80).powered &&
    b.snap.entities.some(e => e.type === 'redstone-lamp' && !e.powered && e.light === 0));
  console.log('PASS the restored power source still switches the complete circuit off');
  b.move(84.5, 79.5); await until(() => b.me().x === 84.5);
  b.action('interact', { x: 85, y: 80 });
  await until(() => b.world.tile(83, 80).powered && b.snap.entities.some(e => e.type === 'redstone-lamp' && e.on && e.light === 6));
  await stop();
  await start(true);
  const c = await connect();
  await until(() => c.world.tile(83, 80).powered && c.snap.entities.some(e => e.type === 'redstone-lamp' && e.on && e.light === 6));
  c.action('interact', { x: 85, y: 80 });
  await until(() => !c.world.tile(83, 80).powered && c.snap.entities.some(e => e.type === 'redstone-lamp' && !e.on && e.light === 0));
  console.log('PASS a self-powered lamp remains on after restart and can still switch off');
} catch (err) { failed = true; console.error(err); }
finally {
  clients.forEach(c => c.ws.close());
  try { await stop(); } catch (err) { failed = true; console.error(err); }
  fs.rmSync(stateFile, { force: true });
  fs.rmSync(`${stateFile}.tmp`, { force: true });
}
console.log(failed ? 'Redstone restart checks failed' : 'All redstone restart checks passed');
process.exit(failed ? 1 : 0);
