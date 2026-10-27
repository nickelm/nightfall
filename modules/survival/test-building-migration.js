import assert from 'node:assert/strict';
process.env.PORT='8145';process.env.SEED='4242';process.env.START_TIME='10';
const {game}=await import('../../server/index.js');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
 for(let y=205;y<=210;y++)for(let x=196;x<=204;x++)game.setTile(x,y,x===200&&y===210?'door-open':y===205||y===210||x===196||x===204?'hanok-wall':'hanok-floor');
 const old=game.spawn('hanok',{x:200.5,y:207.5,owner:999});
 const p=game.spawn('player',{x:220.5,y:220.5,inventory:{hanok:2,'rohan-hall':1},hotbar:['hanok',null],name:'Legacy'});
 game._rohanTilesMigrated=false;
 await sleep(200);
 assert.equal(old.type,'rohan-hall');assert.ok(game.entities.has(old.id));
 assert.equal(game.world.tile(196,205).name,'rohan-wall');assert.equal(game.world.tile(197,206).name,'rohan-floor');
 assert.equal(p.inventory['rohan-hall'],3);assert.ok(!p.inventory.hanok);assert.equal(p.hotbar[0],'rohan-hall');
 await sleep(150);assert.equal(p.inventory['rohan-hall'],3);assert.ok(game.entities.has(old.id));
 console.log('PASS legacy hanok buildings, tiles, inventory and hotbar migrate to Rohan once');
}catch(error){console.error(error);process.exitCode=1;}
finally{process.exit(process.exitCode||0);}
