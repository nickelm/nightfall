import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { levelFromXp, xpForLevel, titleForLevel } from './progression.js';
process.env.PORT = '8141'; process.env.SEED = '4242'; process.env.START_TIME = '10';
const { game } = await import('../../server/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { const end = Date.now() + 6000; while(Date.now()<end) { if(fn()) return; await sleep(25); } assert.ok(fn()); }
const sockets=[];
async function connect(name) {
 const ws=new WebSocket('ws://localhost:8141'), c={ws}; sockets.push(ws);
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.t==='welcome') c.id=m.id;});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 ws.send(JSON.stringify({t:'hello',name})); await until(()=>c.id!=null); return c;
}
try {
 for(let level=1;level<=100;level++) { assert.equal(levelFromXp(xpForLevel(level)),level); if(level>1) assert.equal(levelFromXp(xpForLevel(level)-1),level-1); }
 const a=await connect('Hunter'),b=await connect('Other'); let p=game.entities.get(a.id); const other=game.entities.get(b.id);
 await until(()=>p.level===1); p.light=other.light=0;
 assert.equal(p.xp,0); assert.equal(p.kills,0);
 const kill=(type,props={},source=p)=>{const e=game.spawn(type,{x:20.5,y:20.5,hp:1,speed:0,...props});game.damage(e,1,source);return e;};
 const first=kill('slime'); game.damage(first,1,p); assert.equal(p.xp,10); assert.equal(p.kills,1);
 p.hp=6; kill('blood-slime'); assert.equal(p.level,2); assert.equal(p.maxHp,11); assert.equal(p.hp,7);
 kill('bear',{predator:true,threat:3}); assert.equal(p.xp,60); assert.equal(p.level,3); assert.equal(p.maxHp,12); assert.equal(p.title,'Squire');
 kill('pig',{animal:true}); assert.equal(p.kills,3,'passive animals do not grant combat XP');
 kill('slime',{},other); assert.equal(other.xp,10); assert.equal(p.xp,60,'only the hunter receives XP');
 kill('slime',{},null); assert.equal(p.xp,60,'unclaimed environment kills do not grant XP');
 const wounded=game.spawn('zombie',{x:20.5,y:20.5,hp:2,speed:0}); game.damage(wounded,1,p); game.damage(wounded,1,null);
 assert.equal(p.xp,80,'recent damage credits a finishing hazard kill');
 const expected={xp:p.xp,kills:p.kills,level:p.level,maxHp:p.maxHp,title:p.title};
 await sleep(150); assert.equal(p.maxHp,expected.maxHp,'stat refresh does not stack health');
 a.ws.close(); await until(()=>!game.entities.has(a.id));const c=await connect('Hunter');p=game.entities.get(c.id);
 for(const [key,value] of Object.entries(expected)) assert.equal(p[key],value,`${key} survives reconnect`);
 assert.equal(p.killCounts.slime,1); assert.equal(p.killCounts.zombie,1);
 assert.equal(titleForLevel(20),'Dragon Lord');
 console.log('PASS XP thresholds, kill attribution, titles, gradual health growth, no duplicate rewards and reconnect');
} catch(error) {console.error(error);process.exitCode=1;}
finally{sockets.forEach(ws=>ws.close());setTimeout(()=>process.exit(process.exitCode||0),100);}
