// TEAM ART (server helper): the shared team map. Every client reports the tiles it
// has seen (`explored` action); the server merges them into one bitmap, tells every
// client about new ones (`net:explored`), and sends the whole map to each player who
// joins (`net:teamMap`). So explored ground is shared by the whole team, survives
// page reloads, and is there for latecomers.
//
// State lives on game.teamMap (survives hot swaps) and is copied into a hidden
// `team-map` entity every few seconds (survives restarts; a fresh world clears it).
import { onAction, onEvent, registerSystem } from '../../shared/registry.js';
import { WORLD_W, WORLD_H } from '../../shared/config.js';

const N = WORLD_W * WORLD_H;
const MAX_PER_REPORT = 8000;
const BROADCAST_EVERY = 0.5; // seconds
const SAVE_EVERY = 5;        // seconds

function teamMap(game) {
  if (game.teamMap && game.entities.has(game.teamMap.holder.id)) return game.teamMap;
  let holder = [...game.entities.values()].find((e) => e.type === 'team-map');
  holder ||= game.spawn('team-map', { x: -100, y: -100 });
  const bits = new Uint8Array(Math.ceil(N / 8));
  if (typeof holder._seen === 'string') Buffer.from(holder._seen, 'base64').copy(bits);
  game.teamMap = { holder, bits, pending: [], dirty: false, sentAt: 0, savedAt: 0 };
  return game.teamMap;
}

const encode = (bits) => Buffer.from(bits).toString('base64');

onAction('explored', (game, player, { tiles }) => {
  if (!Array.isArray(tiles)) return;
  const m = teamMap(game);
  for (const i of tiles.slice(0, MAX_PER_REPORT)) {
    if (!Number.isInteger(i) || i < 0 || i >= N) continue;
    const byte = i >> 3, bit = 1 << (i & 7);
    if (m.bits[byte] & bit) continue;
    m.bits[byte] |= bit;
    m.pending.push(i);
    m.dirty = true;
  }
});

onEvent('playerJoined', (game, p) => game.sendTo(p.id, 'teamMap', { bits: encode(teamMap(game).bits) }));

registerSystem('team-map', (game) => {
  const m = teamMap(game);
  if (m.pending.length && game.time - m.sentAt >= BROADCAST_EVERY) {
    game.broadcast('explored', { tiles: m.pending });
    m.pending = [];
    m.sentAt = game.time;
  }
  if (m.dirty && game.time - m.savedAt >= SAVE_EVERY) {
    m.holder._seen = encode(m.bits);
    m.dirty = false;
    m.savedAt = game.time;
  }
});
