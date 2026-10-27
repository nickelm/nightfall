// Animal capture and husbandry. All mutable state lives on the game or entities.
import { onAction, registerSystem } from '../../shared/registry.js';
import { ANIMALS } from './shared.js';

const GROW_SECONDS = 30;
const PRODUCT_SECONDS = 20;
const FEED_SECONDS = 60;
const MAX_FEED = 120;
const MAX_STOCK = 5;
const ANIMAL_MOVE_STEP = 0.1; // never skip across a one-tile wall, even on a long tick
const names = Object.keys(ANIMALS);
const held = p => p.hotbar?.[p.selected] || null;
const atTile = (e, x, y) => Math.floor(e.x) === x && Math.floor(e.y) === y;
const validTarget = (p, x, y, reach) => Number.isInteger(x) && Number.isInteger(y) &&
  Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= reach;
const message = (game, player, text) => game.sendTo(player.id, 'animalMessage', { text });
const emptyState = () => ({ growth: 0, feed: 0, stock: 0, production: 0 });
const stateFromPen = pen => ({ growth: pen.growth, feed: pen.feed, stock: pen.stock, production: pen._production || 0 });

// Item counts are stackable; this private queue preserves each animal's progress.
function remember(player, species, state) {
  player._livestock ||= {};
  (player._livestock[species] ||= []).push(state || emptyState());
}
function recall(player, species) {
  return player._livestock?.[species]?.shift() || emptyState();
}
function resetPen(pen) {
  pen.animal = null; pen.growth = 0; pen.feed = 0; pen.stock = 0; pen._production = 0;
}

onAction('interact', (game, player, { x, y }) => {
  if (!validTarget(player, x, y, 2)) return;
  const targets = [...game.entities.values()].filter(e => e.interactive && atTile(e, x, y));
  const pen = targets.find(e => e.type === 'animal-pen');
  if (pen) {
    const item = held(player);
    if (!pen.animal) {
      if (!item) {
        game.give(player, 'animal-pen', 1); game.despawn(pen.id);
        message(game, player, 'Picked up the empty animal pen.'); return;
      }
      if (!ANIMALS[item] || !game.has(player, item)) {
        message(game, player, 'Hold a captured animal to house it, or use an empty slot to pick up the pen.'); return;
      }
      game.give(player, item, -1);
      const state = recall(player, item);
      pen.animal = item; pen.growth = state.growth; pen.feed = state.feed;
      pen.stock = state.stock; pen._production = state.production;
      message(game, player, `${item} housed. Hold a pumpkin and right-click to feed it.`);
      return;
    }
    if (item === 'pumpkin' && game.has(player, 'pumpkin')) {
      if (pen.feed >= MAX_FEED) { message(game, player, 'This pen already has plenty of feed.'); return; }
      game.give(player, 'pumpkin', -1);
      pen.feed = Math.min(MAX_FEED, pen.feed + FEED_SECONDS);
      message(game, player, `Fed ${pen.animal}. It will grow and produce while fed.`);
      return;
    }
    if (item) { message(game, player, 'Use a pumpkin to feed; use an empty hotbar slot to collect or retrieve.'); return; }
    if (pen.stock > 0) {
      const product = ANIMALS[pen.animal].product, amount = pen.stock;
      game.give(player, product, amount); pen.stock = 0;
      message(game, player, `Collected ${amount} ${product}.`);
      return;
    }
    const species = pen.animal;
    remember(player, species, stateFromPen(pen));
    game.give(player, species, 1); resetPen(pen);
    message(game, player, `Retrieved ${species}. Its progress is saved.`);
    return;
  }

  const animal = targets.find(e => e.animal && ANIMALS[e.type]);
  if (!animal) return;
  remember(player, animal.type, animal._farmState);
  game.give(player, animal.type, 1);
  game.despawn(animal.id);
  message(game, player, `Caught ${animal.type}. Hold it and right-click an empty pen.`);
});

// A carried animal can also be released onto an empty tile and caught again.
onAction('use', (game, player, { x, y }) => {
  const species = held(player);
  if (!ANIMALS[species] || !game.has(player, species) || !validTarget(player, x, y, 2.6)) return;
  const cx = x + 0.5, cy = y + 0.5;
  if (game.world.blocked(cx, cy) || game.near(cx, cy, 0.9).length) return;
  const state = recall(player, species);
  game.give(player, species, -1);
  game.spawn(species, { x: cx, y: cy, _farmState: state });
  message(game, player, `Released ${species}. Right-click it to catch it again.`);
});

// Replenish a small population near players, accounting for penned and carried animals.
registerSystem('animal-population', (game) => {
  const players = game.players();
  if (!players.length || game.time < (game._animalSpawnAt || 0)) return;
  game._animalSpawnAt = game.time + 20;
  for (const species of names) {
    const worldCount = [...game.entities.values()].filter(e => e.type === species ||
      (e.type === 'animal-pen' && e.animal === species)).length;
    const carried = players.reduce((n, p) => n + (p.inventory?.[species] || 0), 0);
    if (worldCount + carried >= 2) continue;
    const p = players[Math.floor(Math.random() * players.length)];
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2, distance = 6 + Math.random() * 7;
      const x = p.x + Math.cos(angle) * distance, y = p.y + Math.sin(angle) * distance;
      if (game.world.blocked(x, y) || game.near(x, y, 1).length) continue;
      game.spawn(species, { x, y });
      break;
    }
  }
});

registerSystem('animal-wander', (game, dt) => {
  for (const animal of game.entities.values()) {
    if (!animal.animal || !ANIMALS[animal.type]) continue;
    if (!animal._walk || game.time >= animal._walk.until) {
      const angle = Math.random() * Math.PI * 2;
      animal._walk = { x: Math.cos(angle), y: Math.sin(angle), until: game.time + 2 + Math.random() * 4 };
    }
    const dx = animal._walk.x * animal.speed * dt, dy = animal._walk.y * animal.speed * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / ANIMAL_MOVE_STEP));
    for (let i = 0; i < steps; i++) {
      const x = animal.x + dx / steps, y = animal.y + dy / steps;
      if (game.world.blocked(x, y) || game.near(x, y, 0.8, e => e.interactive && e !== animal).length) {
        animal._walk.until = 0;
        break;
      }
      animal.x = x; animal.y = y;
    }
  }
});

registerSystem('animal-care', (game, dt) => {
  for (const pen of game.entities.values()) {
    if (pen.type !== 'animal-pen' || !ANIMALS[pen.animal] || pen.feed <= 0) continue;
    const fed = Math.min(dt, pen.feed);
    pen.feed = Math.max(0, pen.feed - fed);
    const growing = Math.min(fed, Math.max(0, (1 - pen.growth) * GROW_SECONDS));
    pen.growth = Math.min(1, pen.growth + growing / GROW_SECONDS);
    if (pen.stock >= MAX_STOCK) { pen._production = 0; continue; }
    pen._production = (pen._production || 0) + fed - growing;
    const made = Math.floor(pen._production / PRODUCT_SECONDS);
    if (made) {
      pen.stock = Math.min(MAX_STOCK, pen.stock + made);
      pen._production = pen.stock >= MAX_STOCK ? 0 : pen._production % PRODUCT_SECONDS;
    }
  }
});
