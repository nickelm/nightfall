// The tile world. Generated deterministically from a seed on server and
// clients; only tile edits travel over the network. Owned by: Integration.
import { registries } from './registry.js';
import { mulberry32, hashString } from './rng.js';
import { safely } from './safe.js';
import { generateExpandedWorld } from '../modules/world/regions.js';

export class World {
  constructor(w, h, seed) {
    this.w = w;
    this.h = h;
    this.seed = seed;
    this.tiles = new Uint16Array(w * h);
    this.edits = new Map(); // "x,y" -> tile id, changes since generation
  }

  static generate(w, h, seed, options = {}) {
    if (w === 480 && h === 480 && !options.region) return generateExpandedWorld(World, seed);
    const world = new World(w, h, seed);
    world.regionKind = options.region || null;
    const passes = [...registries.worldPasses].sort((a, b) => a.order - b.order);
    for (const pass of passes) {
      const rng = mulberry32(seed ^ hashString(pass.name));
      safely(`${pass.module}/worldPass:${pass.name}`, pass.fn, world, rng);
    }
    return world;
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  /** tile id at integer coords, or -1 outside the world */
  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    return this.inBounds(x, y) ? this.tiles[y * this.w + x] : -1;
  }

  /** tile definition at coords, or null outside the world */
  tile(x, y) {
    const id = this.get(x, y);
    return id < 0 ? null : registries.tiles[id];
  }

  /** raw write for world passes (not sent over the network) */
  set(x, y, idOrName) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y)) return;
    this.tiles[y * this.w + x] = typeof idOrName === 'string' ? registries.tileByName.get(idOrName).id : idOrName;
  }

  /** gameplay write: recorded so late joiners receive it */
  edit(x, y, idOrName) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y)) return;
    this.set(x, y, idOrName);
    this.edits.set(`${x},${y}`, this.tiles[y * this.w + x]);
  }

  editList() { return [...this.edits].map(([k, id]) => [...k.split(',').map(Number), id]); }

  applyEdits(list) { for (const [x, y, id] of list) this.edit(x, y, id); }

  /** outside the world counts as solid */
  isSolid(x, y) {
    const t = this.tile(x, y);
    return !t || !!t.solid;
  }

  /** box collision for a circle-ish entity of radius r centered at (x, y) */
  blocked(x, y, r = 0.3) {
    return this.isSolid(x - r, y - r) || this.isSolid(x + r, y - r) ||
           this.isSolid(x - r, y + r) || this.isSolid(x + r, y + r);
  }

  /** nearest walkable tile center to (cx, cy), searching outward */
  findWalkable(cx = this.w / 2, cy = this.h / 2, maxR = 60) {
    cx = Math.floor(cx); cy = Math.floor(cy);
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.isSolid(cx + dx, cy + dy)) return { x: cx + dx + 0.5, y: cy + dy + 0.5 };
        }
      }
    }
    return { x: cx + 0.5, y: cy + 0.5 };
  }
}
