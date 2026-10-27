// New stone types and circuits on snow in a real multiplayer world.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
process.env.PORT='8127'; process.env.SEED='4242'; process.env.START_TIME='10';
const {game}=await import('../../server/index.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=5000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(25)}assert.ok(fn(),'condition reached')}
const sockets=[];
async function connect(name){const ws=new WebSocket('ws://localhost:8127'),c={ws};sockets.push(ws);c.action=(name,data={})=>ws.send(JSON.stringify({t:'action',name,data}));c.move=(x,y)=>ws.send(JSON.stringify({t:'move',x,y,dir:{x:1,y:0}}));c.me=()=>c.snap?.entities.find(e=>e.id===c.id);ws.on('message',raw=>{let m=JSON.parse(raw);if(m.t==='welcome')c.id=m.id;if(m.t==='snap')c.snap=m});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});ws.send(JSON.stringify({t:'hello',name}));await until(()=>c.me());return c}
async function equip(c,item){c.action('hotbar',{slot:0,item});c.action('select',{slot:0});await until(()=>c.me().hotbar[0]===item)}
try{
 const a=await connect('Explorer'),b=await connect('Observer'),p=game.entities.get(a.id);game._animalSpawnAt=Infinity;
 for(let y=238;y<=242;y++)for(let x=238;x<=246;x++)game.setTile(x,y,'snow');
 a.move(240.5,239.5);b.move(230.5,230.5);await until(()=>p.x===240.5&&p.y===239.5);
 game.give(p,'obsidian-pickaxe',1);
 for(const [name,ground] of [['granite','gravel'],['sandstone','sand'],['froststone','snow']]){
   game.setTile(241,240,`${name}-rock`);await equip(a,'obsidian-pickaxe');a.action('mine',{x:241,y:240});
   await until(()=>p.inventory[name]===1);assert.equal(game.world.tile(241,240).name,ground);
   await equip(a,name);a.action('use',{x:241,y:240});await until(()=>game.world.tile(241,240).name===`${name}-block`);
   await equip(a,'obsidian-pickaxe');a.action('mine',{x:241,y:240});await until(()=>p.inventory[name]===1);
   assert.equal(game.world.tile(241,240).name,ground);
 }
 console.log('PASS granite, sandstone and froststone can be mined, built, and recovered');
 game.give(p,'redstone-lamp',1);game.give(p,'redstone-wire',1);a.move(242.5,239.5);await until(()=>p.x===242.5);
 await equip(a,'redstone-lamp');a.action('use',{x:243,y:240});await until(()=>a.snap.entities.some(e=>e.type==='redstone-lamp'&&e.light===6));
 a.move(243.5,239.5);await until(()=>p.x===243.5);await equip(a,'redstone-wire');a.action('use',{x:244,y:240});
 await until(()=>game.world.tile(244,240).name==='redstone-wire-snow-powered');
 await equip(a,'obsidian-pickaxe');a.action('mine',{x:244,y:240});await until(()=>game.world.tile(244,240).name==='snow');
 await until(()=>b.snap.entities.some(e=>e.type==='redstone-lamp'&&e.light===6));
 console.log('PASS snow supports lamps and powered wire, and removing wire restores snow for both players');
}catch(error){console.error(error);process.exitCode=1}
finally{sockets.forEach(ws=>ws.close());setTimeout(()=>process.exit(process.exitCode||0),100)}
