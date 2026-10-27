// Build nine deterministic 160x160 regions. The old world occupies the centre;
// the north-east mineral island is surrounded by water and has no land bridge.
import { hash2 } from '../../shared/rng.js';

const SIDE = 160;
const LAYOUT = [
  ['snow', 'snow', 'mineral'],
  ['forest', 'original', 'desert'],
  ['highlands', 'forest', 'desert'],
];
const DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function accessible(tile) { return tile && !tile.solid && !tile.hurts; }

function anchors(world) {
  const start = world.findWalkable(SIDE / 2, SIDE / 2), sx = Math.floor(start.x), sy = Math.floor(start.y);
  const seen = new Uint8Array(SIDE * SIDE);
  function component(x, y) {
    const q = [[x, y]]; seen[y * SIDE + x] = 1;
    for (let i = 0; i < q.length; i++) {
      const [cx, cy] = q[i];
      for (const [dx, dy] of DIR) {
        const nx = cx + dx, ny = cy + dy, index = ny * SIDE + nx;
        if (!world.inBounds(nx, ny) || seen[index] || !accessible(world.tile(nx, ny))) continue;
        seen[index] = 1; q.push([nx, ny]);
      }
    }
    return q;
  }
  let queue = component(sx, sy);
  if (world.regionKind !== 'original') {
    for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) {
      if (seen[y * SIDE + x] || !accessible(world.tile(x, y))) continue;
      const candidate = component(x, y);
      if (candidate.length > queue.length) queue = candidate;
    }
  }
  const out = {};
  for (const [name, dx, dy] of [['east', 1, 0], ['west', -1, 0], ['south', 0, 1], ['north', 0, -1]]) {
    // Search from the whole accessible landmass. Water has a small bridge cost;
    // cutting rock or trees is far more expensive and cutting ore is last resort.
    const previous = new Int32Array(SIDE * SIDE).fill(-2), distance = new Float64Array(SIDE * SIDE).fill(Infinity);
    const heap = [];
    const push = (index, cost) => {
      let i = heap.length; heap.push({ index, cost });
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p].cost <= cost) break; heap[i] = heap[p]; i = p; }
      heap[i] = { index, cost };
    };
    const pop = () => {
      const first = heap[0], last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let c = i * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1].cost < heap[c].cost) c++;
          if (heap[c].cost >= last.cost) break;
          heap[i] = heap[c]; i = c;
        }
        heap[i] = last;
      }
      return first;
    };
    for (const [x, y] of queue) { const i = y * SIDE + x; previous[i] = -1; distance[i] = 0; push(i, 0); }
    let edge = -1;
    while (heap.length) {
      const { index: current, cost } = pop();
      if (cost !== distance[current]) continue;
      const x = current % SIDE, y = Math.floor(current / SIDE);
      if ((dx === 1 && x === SIDE - 1) || (dx === -1 && x === 0) ||
          (dy === 1 && y === SIDE - 1) || (dy === -1 && y === 0)) { edge = current; break; }
      for (const [ox, oy] of DIR) {
        const nx = x + ox, ny = y + oy, next = ny * SIDE + nx;
        if (!world.inBounds(nx, ny)) continue;
        const t = world.tile(nx, ny);
        const step = t.name === 'water' ? 1 : accessible(t) ? 0 : t.name.endsWith('-ore') ? 1000000 : 10000;
        const candidate = cost + step;
        if (candidate >= distance[next]) continue;
        distance[next] = candidate; previous[next] = current;
        push(next, candidate);
      }
    }
    if (edge < 0) throw new Error(`No accessible ${name} shore for ${world.regionKind} region (${world.seed}, ${queue.length} land tiles)`);
    const path = [];
    for (let i = edge; i >= 0; i = previous[i]) path.push({ x: i % SIDE, y: Math.floor(i / SIDE) });
    out[name] = { ...path[0], path };
  }
  return out;
}

export function generateExpandedWorld(World, seed) {
  const world = new World(SIDE * 3, SIDE * 3, seed), regions = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const kind = LAYOUT[row][col];
    const localSeed = kind === 'original' ? seed : Math.floor(hash2(col, row, seed + 903) * 0xffffffff) || 1;
    const local = World.generate(SIDE, SIDE, localSeed, { region: kind });
    for (let y = 0; y < SIDE; y++) {
      const from = y * SIDE, to = (row * SIDE + y) * world.w + col * SIDE;
      world.tiles.set(local.tiles.subarray(from, from + SIDE), to);
    }
    regions.push({ row, col, kind, local, anchors: kind === 'mineral' ? null : anchors(local) });
  }
  const region = (col, row) => regions.find(r => r.col === col && r.row === row);
  const point = (r, side) => ({ x: r.col * SIDE + r.anchors[side].x, y: r.row * SIDE + r.anchors[side].y });
  const carve = (x, y) => {
    const t = world.tile(x, y);
    if (t?.name === 'water' || t?.solid || t?.hurts) world.set(x, y, 'sand');
  };
  const line = (x1, y1, x2, y2) => {
    const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    let x = x1, y = y1; carve(x, y);
    while (x !== x2 || y !== y2) { x += dx; y += dy; carve(x, y); }
  };
  function connect(a, b) {
    const cutPath = (r, side) => {
      for (const p of r.anchors[side].path) carve(r.col * SIDE + p.x, r.row * SIDE + p.y);
    };
    if (a.row === b.row) {
      cutPath(a, 'east'); cutPath(b, 'west');
      const p = point(a, 'east'), q = point(b, 'west'), seam = b.col * SIDE - (b.kind === 'original' ? 1 : 0);
      line(p.x, p.y, seam, p.y); line(seam, p.y, seam, q.y); line(seam, q.y, q.x, q.y);
    } else {
      cutPath(a, 'south'); cutPath(b, 'north');
      const p = point(a, 'south'), q = point(b, 'north'), seam = b.row * SIDE - (b.kind === 'original' ? 1 : 0);
      line(p.x, p.y, p.x, seam); line(p.x, seam, q.x, seam); line(q.x, seam, q.x, q.y);
    }
  }
  // A spanning tree connects every ordinary region, without touching the island.
  for (const [ax, ay, bx, by] of [[1,0,1,1],[1,1,1,2],[0,1,1,1],[1,1,2,1],[0,0,1,0],[0,1,0,2],[1,2,2,2]]) {
    connect(region(ax, ay), region(bx, by));
  }
  // Keep a continuous moat within the mineral region, even if noise reaches an edge.
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) {
    if (x < 8 || y < 8 || x >= SIDE - 8 || y >= SIDE - 8) world.set(2 * SIDE + x, y, 'water');
  }
  return world;
}
