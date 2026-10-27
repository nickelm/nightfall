import { onAction, registerSystem, registries } from '../../shared/registry.js';

const lavaTools = new Set(['diamond-pickaxe', 'obsidian-pickaxe']);

// The ordinary mining handler still receives the action. Our system consumes
// its lava job and handles it here so it cannot bypass the tool requirement.
onAction('mine', (game, p, { x, y, stop }) => {
  if (stop || !Number.isInteger(x) || !Number.isInteger(y) || game.world.tile(x, y)?.name !== 'lava-ore') {
    delete p._lavaMine;
    return;
  }
  if (p._lavaMine?.x === x && p._lavaMine?.y === y) return;
  p._lavaMine = { x, y, t: 0 };
});

registerSystem('lava-mining', (game, dt) => {
  for (const p of game.players()) {
    const job = p._lavaMine;
    if (!job) continue;
    if (p._mine?.x === job.x && p._mine?.y === job.y) delete p._mine;
    const held = p.hotbar?.[p.selected];
    if (!lavaTools.has(held) || !game.has(p, held)) {
      delete p._lavaMine; p.mining = null;
      game.sendTo(p.id, 'circuitMessage', { text: 'Lava requires a diamond or obsidian pickaxe.' });
      continue;
    }
    if (p.hp <= 0 || game.world.tile(job.x, job.y)?.name !== 'lava-ore' ||
        Math.hypot(job.x + 0.5 - p.x, job.y + 0.5 - p.y) > 2.2) {
      delete p._lavaMine; p.mining = null; continue;
    }
    job.t += dt;
    const time = 20 / (registries.items.get(held)?.power || 1);
    p.mining = { x: job.x, y: job.y, p: Math.min(1, Math.round(job.t / time * 100) / 100) };
    if (job.t < time) continue;
    game.give(p, 'lava', 1);
    game.setTile(job.x, job.y, 'gravel');
    game.broadcast('harvested', { x: job.x, y: job.y, item: 'lava', by: p.id });
    delete p._lavaMine; p.mining = null;
  }
});
