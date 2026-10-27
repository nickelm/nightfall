// TEAM CREATURES (client): horde warnings and the director debug view (F3).
// Quest logs and NPC dialogue boxes would go here too.
import { registerClientSystem, registerHud, onEvent } from '../../shared/registry.js';
import './farm-art.js';

let debug = false;
let last = null;

onEvent('net:horde', (game, { from, count, target }) => {
  game.notify(`A horde of ${count} approaches from the ${from}!`, 5, '#f96');
  if (target === game.myId) game.notify('...and it is coming for you', 4, '#f66');
});
onEvent('net:director', (game, d) => { last = d; });

registerClientSystem('director-toggle', (game) => {
  if (game.input.pressed('F3')) debug = !debug;
});

registerHud('director-debug', (ctx, game, w, h) => {
  if (!debug) return;
  const lines = last
    ? [
        `director: ${last.state}`,
        `threat ${last.threat.toFixed(1)} / budget ${last.budget.toFixed(1)}`,
        `intensity ${last.intensity.toFixed(2)}`,
        ...Object.entries(last.factors || {}).map(([k, v]) => `  ${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`),
        `hordes left: ${(last.hordes || []).map((x) => x.toFixed(2)).join(', ') || 'none'}`,
      ]
    : ['director: no data yet'];
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(8, h - 70 - lines.length * 17, 260, lines.length * 17 + 10);
  ctx.fillStyle = '#9f9';
  ctx.font = '13px ui-monospace, monospace';
  lines.forEach((l, i) => ctx.fillText(l, 16, h - 65 - lines.length * 17 + i * 17));
});
