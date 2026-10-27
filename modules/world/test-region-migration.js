// Restore a legacy 160x160 save, then save and restart again without shifting twice.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { loadModules } from '../../shared/loader.js';
import { World } from '../../shared/world.js';
import { registries } from '../../shared/registry.js';
await loadModules('shared', p => import(`../${p}`));
const file = path.join(os.tmpdir(), `nightfall-regions-${process.pid}.json`);
const old = World.generate(160,160,4242,{region:'original'}), spawn = old.findWalkable();
const oldBits = Buffer.alloc(Math.ceil(160*160/8)), index = 20*160+10;
oldBits[index>>3] |= 1 << (index & 7);
fs.writeFileSync(file, JSON.stringify({seed:4242,time:10,nextId:1000,edits:[[81,80,'wood-wall']],
  entities:[{id:2,type:'team-map',x:-100,y:-100,_seen:oldBits.toString('base64')},
            {id:3,type:'animal-pen',x:82.5,y:80.5,animal:'cow',feed:30,growth:0.5,stock:1}],
  players:[{id:1,type:'player',name:'LegacyPlayer',x:spawn.x,y:spawn.y,inventory:{wood:9},
    hotbar:['wood',null,null,null,null,null,null,null,null],selected:0,_kitVersion:2}]}));
let child, logs=''; const sockets=[]; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(25)}assert.ok(fn(),'condition reached')}
async function start(){logs=''; child=fork('server/index.js',[],{env:{...process.env,PORT:'8126',RESTORE:'1',STATE_FILE:file},stdio:['ignore','pipe','pipe','ipc']});child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);await until(()=>logs.includes('local:')||child.exitCode!==null);assert.ok(logs.includes('local:'),logs)}
async function stop(){if(!child||child.exitCode!==null)return;const c=child;const done=new Promise(r=>c.once('exit',r));c.send('save-and-exit');await done;child=null}
async function connect(){const ws=new WebSocket('ws://localhost:8126'),c={ws};sockets.push(ws);c.me=()=>c.snap?.entities.find(e=>e.id===c.id);ws.on('message',raw=>{let m=JSON.parse(raw);if(m.t==='welcome')c.welcome=m;if(m.t==='welcome')c.id=m.id;if(m.t==='snap')c.snap=m;if(m.t==='event'&&m.name==='teamMap')c.bits=m.data.bits});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});ws.send(JSON.stringify({t:'hello',name:'LegacyPlayer'}));await until(()=>c.me()&&c.bits);return c}
function check(c){
  assert.equal(c.welcome.w,480);assert.equal(c.welcome.h,480);
  assert.equal(c.me().x,spawn.x+160);assert.equal(c.me().y,spawn.y+160);assert.equal(c.me().inventory.wood,9);
  const edit=c.welcome.edits.find(([x,y])=>x===241&&y===240);assert.equal(registries.tiles[edit[2]].name,'wood-wall');
  const pen=c.snap.entities.find(e=>e.type==='animal-pen');assert.equal(pen.x,242.5);assert.equal(pen.y,240.5);assert.equal(pen.animal,'cow');assert.equal(pen.stock,1);
  const holder=c.snap.entities.find(e=>e.type==='team-map');assert.equal(holder.x,-100);
  const bits=Buffer.from(c.bits,'base64'), moved=180*480+170;assert.ok(bits[moved>>3]&(1<<(moved&7)),'explored map bit migrates to the centre');
}
try {
  await start();const a=await connect();check(a);await stop();
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(saved.worldWidth,480);assert.equal(saved.worldHeight,480);
  await start();const b=await connect();check(b);await stop();
  console.log('PASS legacy player, buildings, animals and explored map shift once into the centre and survive another restart');
} catch(error){console.error(error);process.exitCode=1}
finally{sockets.forEach(ws=>ws.close());try{await stop()}catch(e){console.error(e);process.exitCode=1}fs.rmSync(file,{force:true});fs.rmSync(`${file}.tmp`,{force:true});process.exit(process.exitCode||0)}
