import { onEvent, registerClientSystem, registerDrawer, registerHud, registries } from '../../shared/registry.js';
import { TILE_PX } from '../../shared/config.js';

const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x, y) => `${x},${y}`;
const current = game => game.me?.hotbar?.[game.selectedSlot];

// Build once per frame so drawing a wire does not scan every entity per neighbor.
registerClientSystem('redstone-draw-cache', game => {
  game._redstoneDevices = new Set();
  for (const e of game.entities.values()) {
    if (e.type === 'power-source' || e.type === 'redstone-lamp') game._redstoneDevices.add(key(Math.floor(e.x), Math.floor(e.y)));
  }
});

for (const ground of ['grass', 'sand', 'gravel']) for (const powered of [false, true]) {
  const name = `redstone-wire-${ground}${powered ? '-powered' : ''}`;
  registerDrawer(`tile:${name}`, (ctx, tile, x, y, size, tx, ty, game) => {
    ctx.save();
    const base = registries.tileByName.get(ground), drawer = registries.drawers.get(`tile:${ground}`);
    if (drawer) drawer(ctx, base, x, y, size, tx, ty, game);
    else { ctx.fillStyle = base.color; ctx.fillRect(x, y, size, size); }
    const cx = x + size / 2, cy = y + size / 2;
    ctx.lineCap = 'round'; ctx.lineWidth = size * 0.13;
    ctx.strokeStyle = powered ? '#ff5748' : '#772620';
    for (const [dx, dy] of DIRECTIONS) {
      const nx = tx + dx, ny = ty + dy;
      if (!game.world.tile(nx, ny)?.redstoneWire && !game._redstoneDevices?.has(key(nx, ny))) continue;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * size * 0.5, cy + dy * size * 0.5); ctx.stroke();
    }
    ctx.fillStyle = powered ? '#ff8b69' : '#9c342b';
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

function crystal(ctx, x, y, size, on) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#4a3a61'; ctx.fillRect(-size * 0.3, size * 0.18, size * 0.6, size * 0.14);
  ctx.fillStyle = on ? '#baabff' : '#675d82';
  ctx.beginPath(); ctx.moveTo(0, -size * 0.42); ctx.lineTo(size * 0.26, -size * 0.08);
  ctx.lineTo(size * 0.18, size * 0.2); ctx.lineTo(-size * 0.18, size * 0.2);
  ctx.lineTo(-size * 0.26, -size * 0.08); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = on ? '#eee4ff' : '#aaa0bc'; ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath(); ctx.moveTo(0, -size * 0.35); ctx.lineTo(-size * 0.09, -size * 0.02); ctx.lineTo(0, size * 0.13); ctx.stroke();
  ctx.restore();
}

function lamp(ctx, x, y, size, on) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#403843'; ctx.fillRect(-size * 0.34, -size * 0.34, size * 0.68, size * 0.68);
  ctx.fillStyle = on ? '#ffe08a' : '#746a58'; ctx.fillRect(-size * 0.25, -size * 0.25, size * 0.5, size * 0.5);
  ctx.fillStyle = on ? '#fff5c2' : '#9b8b6f'; ctx.fillRect(-size * 0.16, -size * 0.18, size * 0.32, size * 0.1);
  ctx.strokeStyle = '#51443b'; ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.strokeRect(-size * 0.25, -size * 0.25, size * 0.5, size * 0.5);
  ctx.restore();
}

registerDrawer('power-source', (ctx, e, x, y, size) => crystal(ctx, x, y, size, e.on));
registerDrawer('redstone-lamp', (ctx, e, x, y, size) => lamp(ctx, x, y, size, e.powered));
registerDrawer('item:redstone-lamp', (ctx, item, x, y, size) => lamp(ctx, x, y, size, true));
registerDrawer('item:redstone-wire', (ctx, item, x, y, size) => {
  ctx.save(); ctx.strokeStyle = '#dc4942'; ctx.lineWidth = Math.max(2, size * 0.12); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - size * 0.32, y + size * 0.25); ctx.lineTo(x - size * 0.12, y - size * 0.18);
  ctx.lineTo(x + size * 0.12, y + size * 0.15); ctx.lineTo(x + size * 0.32, y - size * 0.28); ctx.stroke(); ctx.restore();
});

onEvent('net:circuitMessage', (game, { text }) => game.notify(text, 4, game.theme.colors.candle));

registerHud('redstone-hints', (ctx, game, w) => {
  if (!game.me || game.ui) return;
  const target = game.targetTile(2);
  const device = [...game.entities.values()].find(e => (e.type === 'power-source' || e.type === 'redstone-lamp') &&
    Math.floor(e.x) === target.x && Math.floor(e.y) === target.y);
  const tile = game.world.tile(target.x, target.y);
  let text;
  if (device?.type === 'power-source') text = `Power crystal: ${device.on ? 'ON' : 'OFF'}  ·  Right-click: switch  ·  Pickaxe + right-click: pick up`;
  else if (device?.type === 'redstone-lamp') text = `Lamp switch: ${device.on ? 'ON' : 'OFF'} · Light: ${device.powered ? 'ON' : 'OFF'} · RMB: switch · Pickaxe + RMB: pick up`;
  else if (tile?.redstoneWire) text = `Redstone wire: ${tile.powered ? 'powered' : 'unpowered'}  ·  Hold left-click to pick up`;
  if (!text) return;
  const width = Math.min(w - 24, 560), x = (w - width) / 2;
  ctx.fillStyle = game.theme.colors.panel; ctx.fillRect(x, 145, width, 28);
  ctx.strokeStyle = game.theme.colors.pumpkin; ctx.strokeRect(x, 145, width, 28);
  ctx.fillStyle = game.theme.colors.candle; ctx.font = game.font(14);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, 159, width - 14);
});

// Ghosts make right-click placement visible for the custom wire/device actions.
registerHud('redstone-placement', (ctx, game) => {
  const item = current(game);
  if (!game.me || game.ui || !['redstone-wire', 'power-crystal', 'redstone-lamp'].includes(item)) return;
  const target = game.targetTile(2.5), tile = game.world.tile(target.x, target.y);
  if (!tile || !['grass', 'sand', 'gravel'].includes(tile.name)) return;
  const p = game.worldToScreen(target.x, target.y), cx = p.x + TILE_PX / 2, cy = p.y + TILE_PX / 2;
  ctx.save(); ctx.globalAlpha = 0.45;
  if (item === 'power-crystal') crystal(ctx, cx, cy, TILE_PX, true);
  else if (item === 'redstone-lamp') lamp(ctx, cx, cy, TILE_PX, true);
  else { ctx.strokeStyle = '#ff5748'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, TILE_PX * 0.12, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
});
