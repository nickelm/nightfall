// TEAM SURVIVAL (client): hotbar, inventory and crafting screen (E), quick-craft
// keys, the target highlight, and the health display.
// Item icons come from registerDrawer('item:<name>', ...) (Art draws them); items
// without one show as a colored square with their initial.
import { registries, registerClientSystem, registerHud } from '../../shared/registry.js';
import { TILE_PX } from '../../shared/config.js';
import { safely } from '../../shared/safe.js';
import { canCraft, orderRecipes, recipeCategory, CRAFT_CATEGORIES } from './crafting-order.js';
import './tool-art.js';
import './cabin-art.js';
import './fantasy-buildings-art.js';
import { xpForLevel } from '../player/progression.js';
import { drawBuildingPreview } from './building-preview.js';

const SLOTS = 9, SLOT = 46, GAP = 4;
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

let synced = false;   // took our selected slot from the server once
let picked = null;    // item clicked in the inventory, waiting for a hotbar slot
let shownAt = 0;      // when the selection last changed (shows the item's name)

// ------------------------------------------------------------------ layout ----

function hotbarSlot(i, w, h) {
  const total = SLOTS * (SLOT + GAP) - GAP;
  return { x: (w - total) / 2 + i * (SLOT + GAP), y: h - SLOT - 44, w: SLOT, h: SLOT };
}

export function inventoryLayout(game, w, h) {
  const inventory = game.me?.inventory || {}, items = Object.keys(inventory);
  const allRecipes = orderRecipes(registries.recipes.values(), inventory, registries.items);
  const selected = CRAFT_CATEGORIES.includes(game._craftCategory) ? game._craftCategory : 'All';
  const recipes = allRecipes.filter(r => selected === 'All' || recipeCategory(r, registries.items) === selected);
  const pw = Math.min(1120, w - 24), ph = Math.max(200, Math.min(600, h - 200));
  const x = (w - pw) / 2, y = Math.max(12, hotbarSlot(0, w, h).y - ph - 56);
  const compact = pw < 760, inventoryWidth = Math.floor(pw * (compact ? .34 : .32));
  const categoryWidth = compact ? 0 : 144;
  const craftX = x + inventoryWidth + categoryWidth + 12;
  const craftWidth = pw - inventoryWidth - categoryWidth - 28;
  const categoryCols = Math.max(2, Math.floor(craftWidth / 100));
  const cycleCategories = compact && ph < 320;
  const categoryRows = compact ? cycleCategories ? 1 : Math.ceil(CRAFT_CATEGORIES.length / categoryCols) : 0;
  const recipeY = y + 68 + categoryRows * 30;
  const itemCols = Math.max(1, Math.floor((inventoryWidth - 24) / (SLOT + GAP)));
  const rows = Math.ceil(items.length / itemCols);
  const visibleItemRows = Math.max(1, Math.floor((ph - 108) / (SLOT + GAP)));
  const visible = Math.max(1, Math.floor((y + ph - 40 - recipeY) / 52));
  const maxScroll = Math.max(0, recipes.length - visible);
  const maxItemScroll = Math.max(0, rows - visibleItemRows);
  game._recipeScroll = Math.max(0, Math.min(maxScroll, game._recipeScroll || 0));
  game._itemScroll = Math.max(0, Math.min(maxItemScroll, game._itemScroll || 0));
  return {
    x, y, pw, ph, selected, compact, inventoryWidth, categoryWidth, craftX, craftWidth, recipeY,
    maxScroll, visible, maxItemScroll, visibleItemRows,
    itemArea: { x, y, w: inventoryWidth, h: ph },
    recipeArea: { x: craftX, y: recipeY, w: craftWidth, h: visible * 52 },
    categories: (cycleCategories ? [selected] : CRAFT_CATEGORIES).map((name, i) => {
      const group = allRecipes.filter(r => name === 'All' || recipeCategory(r, registries.items) === name);
      return { name: cycleCategories ? CRAFT_CATEGORIES[(CRAFT_CATEGORIES.indexOf(selected) + 1) % CRAFT_CATEGORIES.length] : name,
        label: cycleCategories ? `${selected} >` : name, current: cycleCategories,
        count: group.length, ready: group.filter(r => canCraft(r, inventory)).length,
        x: compact ? craftX + (i % categoryCols) * (craftWidth / categoryCols) : x + inventoryWidth + 8,
        y: compact ? y + 62 + Math.floor(i / categoryCols) * 30 : y + 64 + i * 36,
        w: compact ? cycleCategories ? craftWidth : craftWidth / categoryCols - 4 : categoryWidth - 12, h: compact ? 26 : 32 };
    }),
    items: items.slice(game._itemScroll * itemCols, (game._itemScroll + visibleItemRows) * itemCols).map((name, i) => ({ name, x: x + 12 + (i % itemCols) * (SLOT + GAP), y: y + 64 + Math.floor(i / itemCols) * (SLOT + GAP), w: SLOT, h: SLOT })),
    recipes: recipes.slice(game._recipeScroll, game._recipeScroll + visible).map((r, i) => ({ r, x: craftX, y: recipeY + i * 52, w: craftWidth, h: 48 })),
  };
}

const inside = (m, r) => m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
const affordable = (game, r) => canCraft(r, game.me?.inventory || {});

function select(game, slot) {
  game.selectedSlot = (slot + SLOTS) % SLOTS;
  shownAt = performance.now();
  game.sendAction('select', { slot: game.selectedSlot });
}

// ------------------------------------------------------------------- input ----

registerClientSystem('survival-input', (game) => {
  const me = game.me;
  if (!me) return;
  const k = game.input, m = k.mouse;
  if (!synced) { synced = true; game.selectedSlot = me.selected || 0; }

  if (k.pressed('KeyE') || k.pressed('Tab')) {
    if (!game.ui) { game.ui = 'inventory'; game._recipeScroll = 0; }
    else if (game.ui === 'inventory') game.ui = null;
  }
  if (game.ui !== 'inventory') picked = null;

  if (game.ui === 'inventory') {
    let L = inventoryLayout(game, game.screen.w, game.screen.h);
    if (k.wheel() && inside(m, L.recipeArea)) {
      game._recipeScroll = Math.max(0, Math.min(L.maxScroll, game._recipeScroll + Math.sign(k.wheel())));
      L = inventoryLayout(game, game.screen.w, game.screen.h);
    } else if (k.wheel() && inside(m, L.itemArea)) {
      game._itemScroll = Math.max(0, Math.min(L.maxItemScroll, game._itemScroll + Math.sign(k.wheel())));
      L = inventoryLayout(game, game.screen.w, game.screen.h);
    }
    const hovered = L.items.find((r) => inside(m, r))?.name;
    DIGITS.forEach((code, i) => { if (k.pressed(code) && hovered) game.sendAction('hotbar', { slot: i, item: hovered }); });
    if (k.clicked(0)) {
      const category = L.categories.find(r => inside(m, r));
      if (category) { game._craftCategory = category.name; game._recipeScroll = 0; return; }
      const recipe = L.recipes.find((r) => inside(m, r));
      const slot = [...Array(SLOTS).keys()].find((i) => inside(m, hotbarSlot(i, game.screen.w, game.screen.h)));
      if (recipe) game.sendAction('craft', { recipe: recipe.r.name });
      else if (hovered) picked = picked === hovered ? null : hovered;
      else if (slot !== undefined && picked) { game.sendAction('hotbar', { slot, item: picked }); picked = null; }
      else picked = null;
    }
    return;
  }
  if (game.ui) return;

  DIGITS.forEach((code, i) => { if (k.pressed(code)) select(game, i); });
  if (k.wheel()) select(game, game.selectedSlot + Math.sign(k.wheel()));
  if (k.pressed('KeyC')) game.sendAction('craft', { recipe: 'campfire' });
  if (k.pressed('KeyV')) game.sendAction('craft', { recipe: 'shield' });
});

// --------------------------------------------------------------------- HUD ----

function drawItem(ctx, game, name, cx, cy, size) {
  const def = registries.items.get(name);
  const drawer = registries.drawers.get(`item:${name}`);
  if (drawer) return safely(`drawer item:${name}`, drawer, ctx, def, cx, cy, size, game);
  ctx.fillStyle = def?.color || '#ccc';
  ctx.fillRect(cx - size * 0.3, cy - size * 0.3, size * 0.6, size * 0.6);
  ctx.fillStyle = '#000';
  ctx.font = game.font(size * 0.4);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name[0].toUpperCase(), cx, cy + 1);
}

function drawSlot(ctx, game, r, name, count, highlight) {
  const C = game.theme.colors;
  ctx.fillStyle = C.panel;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = highlight ? C.pumpkin : 'rgba(195,166,240,0.35)';
  ctx.lineWidth = highlight ? 3 : 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  if (!name) return;
  ctx.save();
  drawItem(ctx, game, name, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.8);
  ctx.restore();
  if (count > 1) {
    ctx.font = game.font(14);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#000';
    ctx.fillText(count, r.x + r.w - 3, r.y + r.h - 1);
    ctx.fillStyle = C.bone;
    ctx.fillText(count, r.x + r.w - 4, r.y + r.h - 2);
  }
}

function heart(ctx, x, y, s, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.75, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.75, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.35);
  ctx.fill();
}

// Outline what right or left click would act on; a ghost shows where a held block would go.
registerHud('target', (ctx, game) => {
  const me = game.me;
  if (!me || game.ui) return;
  const def = registries.items.get(me.hotbar?.[game.selectedSlot]);
  if (def && drawBuildingPreview(ctx, game, def.name, game.targetTile(2.5), TILE_PX)) return;
  if (def && (def.places || def.placesTile)) {
    const t = game.targetTile(2.5), p = game.worldToScreen(t.x, t.y);
    const busy = [...game.entities.values()].some((e) => Math.abs(e.x - t.x - 0.5) < 0.85 && Math.abs(e.y - t.y - 0.5) < 0.85);
    if (!game.world.isSolid(t.x, t.y) && !busy) {
      const drawer = def.placesTile && registries.drawers.get(`tile:${def.placesTile}`);
      ctx.globalAlpha = 0.45;
      if (drawer) safely(`drawer tile:${def.placesTile}`, drawer, ctx, registries.tileByName.get(def.placesTile), p.x, p.y, TILE_PX, t.x, t.y, game);
      else { ctx.fillStyle = game.theme.colors.pumpkin; ctx.fillRect(p.x, p.y, TILE_PX, TILE_PX); }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = game.theme.colors.pumpkin;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, p.y + 1, TILE_PX - 2, TILE_PX - 2);
      return;
    }
  }
  const t = game.targetTile();
  const useful = game.world.tile(t.x, t.y)?.harvest || game.world.tile(t.x, t.y)?.interact ||
    [...game.entities.values()].some((e) => e.interactive && Math.floor(e.x) === t.x && Math.floor(e.y) === t.y);
  const p = game.worldToScreen(t.x, t.y);
  ctx.strokeStyle = useful ? 'rgba(255,224,138,0.85)' : 'rgba(255,224,138,0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x + 1, p.y + 1, TILE_PX - 2, TILE_PX - 2);
});

registerHud('hotbar', (ctx, game, w, h) => {
  const me = game.me;
  if (!me) return;
  const C = game.theme.colors, bar = me.hotbar || [], inv = me.inventory || {};
  for (let i = 0; i < SLOTS; i++) {
    const r = hotbarSlot(i, w, h);
    drawSlot(ctx, game, r, bar[i], inv[bar[i]] || 0, i === game.selectedSlot);
    ctx.font = game.font(11);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.ash;
    ctx.fillText(i + 1, r.x + 3, r.y + 1);
  }

  // health: one heart per point
  const first = hotbarSlot(0, w, h);
  for (let i = 0; i < Math.min(20, me.maxHp || 0); i++) heart(ctx, first.x + 8 + i * 18, first.y - 22, 15, i < me.hp ? C.blood : 'rgba(60,30,60,0.8)');
  if (me.level) {
    const current = xpForLevel(me.level), next = xpForLevel(me.level + 1);
    const width = SLOTS * (SLOT + GAP) - GAP, y = first.y - 12;
    ctx.fillStyle = '#30243e'; ctx.fillRect(first.x, y, width, 4);
    ctx.fillStyle = C.candle; ctx.fillRect(first.x, y, width * Math.max(0, Math.min(1, (me.xp - current) / (next - current))), 4);
    ctx.font = game.font(12); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = C.candle;
    ctx.fillText(`Lv.${me.level} ${me.title} | XP ${me.xp - current}/${next - current} | HP ${Math.ceil(me.hp)}/${me.maxHp} | Kills ${me.kills}`, first.x, first.y - 35);
  }

  // the held item's name, briefly after switching
  const age = performance.now() - shownAt, name = bar[game.selectedSlot];
  if (name && age < 1500) {
    ctx.globalAlpha = Math.min(1, (1500 - age) / 400);
    ctx.font = game.font(18);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = C.candle;
    ctx.fillText(name, w / 2, first.y - 28);
    ctx.globalAlpha = 1;
  }
});

registerHud('inventory-screen', (ctx, game, w, h) => {
  if (game.ui !== 'inventory' || !game.me) return;
  const C = game.theme.colors, inv = game.me.inventory || {}, m = game.input.mouse;
  const L = inventoryLayout(game, w, h);
  ctx.fillStyle = C.panel;
  ctx.fillRect(L.x, L.y, L.pw, L.ph);
  ctx.strokeStyle = C.purple;
  ctx.lineWidth = 2;
  ctx.strokeRect(L.x, L.y, L.pw, L.ph);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = game.font(30, 'display');
  ctx.fillStyle = C.pumpkin;
  ctx.fillText('Inventory', L.x + 16, L.y + 30);
  ctx.fillText('Crafting', L.craftX, L.y + 30);
  ctx.font = game.font(11);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.ash;
  ctx.fillText('ready first · best gear first', L.x + L.pw - 16, L.y + 52);

  ctx.strokeStyle = 'rgba(195,166,240,0.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(L.x + L.inventoryWidth, L.y + 12); ctx.lineTo(L.x + L.inventoryWidth, L.y + L.ph - 36); ctx.stroke();
  for (const category of L.categories) {
    const active = category.current || category.name === L.selected;
    ctx.fillStyle = active ? 'rgba(255,122,26,0.22)' : inside(m, category) ? 'rgba(195,166,240,0.12)' : 'rgba(0,0,0,0.16)';
    ctx.fillRect(category.x, category.y, category.w, category.h);
    ctx.font = game.font(L.compact ? 12 : 14); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = active ? C.candle : C.bone;
    ctx.fillText(category.label, category.x + 7, category.y + category.h / 2, category.w - 35);
    ctx.font = game.font(11); ctx.textAlign = 'right'; ctx.fillStyle = category.ready ? C.candle : C.ash;
    ctx.fillText(category.count, category.x + category.w - 6, category.y + category.h / 2);
  }

  for (const r of L.items) drawSlot(ctx, game, r, r.name, inv[r.name], r.name === picked || inside(m, r));
  if (L.maxItemScroll) {
    const track = L.visibleItemRows * (SLOT + GAP), thumb = track * L.visibleItemRows / (L.visibleItemRows + L.maxItemScroll);
    ctx.fillStyle = C.violet; ctx.fillRect(L.x + L.inventoryWidth - 8, L.y + 64, 3, track);
    ctx.fillStyle = C.pumpkin; ctx.fillRect(L.x + L.inventoryWidth - 8, L.y + 64 + (track - thumb) * game._itemScroll / L.maxItemScroll, 3, thumb);
  }
  if (!L.items.length) {
    ctx.font = game.font(15);
    ctx.fillStyle = C.ash;
    ctx.fillText('Empty. Mine trees and stone.', L.x + 16, L.y + 80);
  }

  for (const row of L.recipes) {
    const ok = affordable(game, row.r);
    if (inside(m, row) && ok) { ctx.fillStyle = 'rgba(255,122,26,0.15)'; ctx.fillRect(row.x, row.y, row.w, row.h); }
    ctx.save();
    ctx.globalAlpha = ok ? 1 : 0.4;
    const out = Object.keys(row.r.output || {})[0] || row.r.places;
    if (out) drawItem(ctx, game, out, row.x + 18, row.y + row.h / 2, 30);
    ctx.restore();
    ctx.globalAlpha = ok ? 1 : 0.5;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = game.font(16);
    ctx.fillStyle = C.bone;
    ctx.fillText(row.r.name, row.x + 40, row.y + 14, row.w - 48);
    ctx.textAlign = 'left';
    ctx.font = game.font(12);
    ctx.fillStyle = ok ? C.candle : C.ash;
    ctx.fillText(Object.entries(row.r.inputs).map(([item, n]) => `${inv[item] || 0}/${n} ${item}`).join(' · '), row.x + 40, row.y + 34, row.w - 48);
    ctx.globalAlpha = 1;
  }

  if (!L.recipes.length) {
    ctx.font = game.font(14); ctx.fillStyle = C.ash; ctx.textAlign = 'left';
    ctx.fillText('No recipes in this category.', L.craftX, L.recipeY + 18, L.craftWidth);
  }
  if (L.maxScroll) {
    const track = L.visible * 52;
    ctx.fillStyle = C.violet;
    ctx.fillRect(L.x + L.pw - 9, L.recipeY, 3, track);
    ctx.fillStyle = C.pumpkin;
    const thumb = track * L.visible / (L.visible + L.maxScroll);
    ctx.fillRect(L.x + L.pw - 9, L.recipeY + (track - thumb) * game._recipeScroll / L.maxScroll, 3, thumb);
  }

  ctx.textAlign = 'center';
  ctx.font = game.font(13);
  ctx.fillStyle = C.ash;
  ctx.fillText(picked ? `now click a hotbar slot for ${picked}` : '1-9: equip hovered item · click category / recipe · scroll lists · E: close',
    L.x + L.pw / 2, L.y + L.ph - 18);
});
