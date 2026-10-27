// Electrical devices and wires. All gameplay state is stored on the world or entities.
import { onAction, registerSystem, registries } from '../../shared/registry.js';

const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const GROUNDS = new Set(['grass', 'sand', 'gravel']);
const key = (x, y) => `${x},${y}`;
const position = e => ({ x: Math.floor(e.x), y: Math.floor(e.y) });
const selected = p => p.hotbar?.[p.selected];
const inReach = (p, x, y, reach) => Number.isInteger(x) && Number.isInteger(y) &&
  Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= reach;
const wireName = (ground, powered) => `redstone-wire-${ground}${powered ? '-powered' : ''}`;
const say = (game, p, text) => game.sendTo(p.id, 'circuitMessage', { text });

// A powered wire carries power to all orthogonally connected wire tiles. Devices
// receive power from an adjacent wire or source, but lamps do not relay power.
function updateCircuit(game) {
  const wires = new Map();
  for (const [xy, id] of game.world.edits) {
    const tile = registries.tiles[id];
    if (!tile?.redstoneWire) continue;
    const [x, y] = xy.split(',').map(Number);
    wires.set(xy, { x, y, tile });
  }
  const sources = [...game.entities.values()].filter(e => e.type === 'power-source' && e.on);
  const activeSources = new Set(sources.map(e => { const p = position(e); return key(p.x, p.y); }));
  const powered = new Set(), queue = [];
  for (const source of sources) {
    const { x, y } = position(source);
    for (const [dx, dy] of DIRECTIONS) {
      const k = key(x + dx, y + dy);
      if (wires.has(k) && !powered.has(k)) { powered.add(k); queue.push(wires.get(k)); }
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    for (const [dx, dy] of DIRECTIONS) {
      const k = key(x + dx, y + dy);
      if (wires.has(k) && !powered.has(k)) { powered.add(k); queue.push(wires.get(k)); }
    }
  }
  for (const [xy, wire] of wires) {
    const on = powered.has(xy);
    if (wire.tile.powered !== on) game.setTile(wire.x, wire.y, wireName(wire.tile.wireGround, on));
  }
  for (const e of game.entities.values()) {
    if (e.type !== 'redstone-lamp') continue;
    const { x, y } = position(e);
    const on = DIRECTIONS.some(([dx, dy]) => powered.has(key(x + dx, y + dy)) || activeSources.has(key(x + dx, y + dy)));
    e.powered = on;
    e.light = on ? 6 : 0;
  }
}

onAction('use', (game, p, { x, y }) => {
  const item = selected(p);
  if (!['redstone-wire', 'power-crystal', 'redstone-lamp'].includes(item) || !game.has(p, item) || !inReach(p, x, y, 2.6)) return;
  const tile = game.world.tile(x, y);
  if (!tile || !GROUNDS.has(tile.name)) { say(game, p, 'Place circuits on grass, sand, or gravel.'); return; }
  const occupants = [...game.entities.values()].filter(e => Math.floor(e.x) === x && Math.floor(e.y) === y);
  if (item === 'redstone-wire') {
    if (occupants.some(e => e.type !== 'player' && e.interactive)) return;
    game.setTile(x, y, wireName(tile.name, false));
  } else {
    const overlap = e => Math.abs(e.x - x - 0.5) < 0.85 && Math.abs(e.y - y - 0.5) < 0.85;
    if (game.world.isSolid(x, y) || [...game.entities.values()].some(overlap)) return;
    game.spawn(item === 'power-crystal' ? 'power-source' : 'redstone-lamp', { x: x + 0.5, y: y + 0.5 });
  }
  game.give(p, item, -1);
  game.broadcast('placed', { x, y, item, by: p.id });
  updateCircuit(game);
});

onAction('interact', (game, p, { x, y }) => {
  if (!inReach(p, x, y, 2)) return;
  const device = [...game.entities.values()].find(e => ['power-source', 'redstone-lamp'].includes(e.type) &&
    Math.floor(e.x) === x && Math.floor(e.y) === y);
  if (!device) return;
  const tool = registries.items.get(selected(p));
  if (tool?.tool === 'pickaxe') {
    const item = device.type === 'power-source' ? 'power-crystal' : 'redstone-lamp';
    game.despawn(device.id); game.give(p, item, 1);
    say(game, p, `Picked up ${item}.`);
  } else if (device.type === 'power-source') {
    device.on = !device.on;
    say(game, p, `Power crystal ${device.on ? 'on' : 'off'}.`);
  } else {
    say(game, p, device.powered ? 'Lamp is powered.' : 'Connect a lamp to an active crystal with redstone wire.');
  }
  updateCircuit(game);
});

// Mining wire and state restoration are handled elsewhere, so refresh periodically.
registerSystem('redstone-circuit', (game) => {
  if (game.time < (game._redstoneNextAt || 0)) return;
  game._redstoneNextAt = game.time + 0.2;
  updateCircuit(game);
});
