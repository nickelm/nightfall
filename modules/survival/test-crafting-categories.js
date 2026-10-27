import assert from 'node:assert/strict';
import { loadModules } from '../../shared/loader.js';
import { registries } from '../../shared/registry.js';
import { inventoryLayout } from './client.js';
import { recipeCategory, canCraft } from './crafting-order.js';
await loadModules('shared', path => import(`../${path}`));
const actions = [];
const game = { me: { inventory: { wood: 30, stone: 10, diamond: 3 } }, _craftCategory: 'Buildings', ui: 'inventory', screen: { w: 1280, h: 720 }, sendAction: (name, data) => actions.push({name,data}) };
let layout = inventoryLayout(game,1280,720);
assert.equal(layout.pw,1120,'desktop panel uses additional horizontal space');
assert.ok(layout.recipes.every(row => recipeCategory(row.r,registries.items)==='Buildings'));
let unavailable = false;
for (const row of layout.recipes) { if (!canCraft(row.r,game.me.inventory)) unavailable=true; else assert.ok(!unavailable,'ready recipes stay ahead of unavailable recipes'); }
for (const [w,h] of [[1280,720],[800,600],[390,844],[390,360]]) {
  const view=inventoryLayout(game,w,h);
  for(const r of [...view.items,...view.categories,...view.recipes]) {
    assert.ok(r.x>=view.x && r.x+r.w<=view.x+view.pw+1,'controls fit panel width');
    assert.ok(r.y>=view.y && r.y+r.h<=view.y+view.ph,'controls fit panel height');
  }
}
game._recipeScroll=50;
layout=inventoryLayout(game,1280,720);
const travel=layout.categories.find(c=>c.name==='Travel');
game.input={mouse:{x:travel.x+10,y:travel.y+10},pressed:()=>false,wheel:()=>0,clicked:()=>true};
const input=registries.clientSystems.find(s=>s.name.endsWith('/survival-input')).fn;
input(game); assert.equal(game._craftCategory,'Travel'); assert.equal(game._recipeScroll,0); assert.equal(actions.length,0,'category selection does not craft');
layout=inventoryLayout(game,1280,720);assert.deepEqual(new Set(layout.recipes.map(row=>row.r.name)),new Set(['boat','portal']));
const row=layout.recipes[0];game.input.mouse={x:row.x+10,y:row.y+10};input(game);
assert.deepEqual(actions.at(-1),{name:'craft',data:{recipe:row.r.name}});
console.log('PASS crafting categories, ready-first ordering, responsive layout and category/recipe clicks');
