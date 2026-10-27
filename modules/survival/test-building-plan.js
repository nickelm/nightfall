import assert from 'node:assert/strict';
import { loadModules } from '../../shared/loader.js';
import { World } from '../../shared/world.js';
import { buildings, buildingPlan } from './building-plan.js';
await loadModules('shared', path => import(`../${path}`));
const world = new World(80,80,42);
for(let y=0;y<80;y++)for(let x=0;x<80;x++)world.set(x,y,'grass');
const player={type:'player',x:40.5,y:41.5};
for(const [kind,spec] of Object.entries(buildings)) {
 const plan=()=>buildingPlan(world,[player],player,kind,40,40);
 let p=plan(); assert.ok(p.valid);assert.equal(p.cells.length,spec.width*spec.height);
 assert.equal(p.cells.find(c=>c.x===40&&c.y===40).tile,'door-closed');
 assert.equal(p.cells.filter(c=>c.tile===(spec.floor||'cabin-floor')).length,(spec.width-2)*(spec.height-2));
 const corner=p.cells[0]; world.set(corner.x,corner.y,'water');
 p=plan(); assert.ok(!p.valid&&p.cells[0].blocked);world.set(corner.x,corner.y,'grass');
 world.set(40,41,'wood-wall');assert.ok(plan().approachBlocked);world.set(40,41,'grass');
 const occupied=buildingPlan(world,[player,{type:'pig',animal:true,x:40.5,y:39.5}],player,kind,40,40);
 assert.ok(!occupied.valid&&occupied.cells.some(c=>c.blocked),'animals block both preview and placement');
 assert.ok(!buildingPlan(world,[],{x:50,y:50},kind,40,40).valid,'out-of-reach sites are invalid');
 assert.ok(!buildingPlan(world,[],player,kind,0,0).valid,'off-map footprint is invalid');
}
console.log('PASS all building footprints, entrances, obstruction highlights, range and map edges');
