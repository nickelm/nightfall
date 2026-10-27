// TEAM CREATURES (server helper): the game director.
//
// Inspired by the pacing directors in Left 4 Dead and Darktide: instead of a
// fixed spawn rate, the director keeps a THREAT BUDGET that scales with how
// strong the group is, and cycles through three moods so nights have shape:
//
//   build-up  monsters trickle in until the live threat reaches the budget
//   peak      the players are under pressure (or a horde just hit): hold it
//   relax     no new spawns; let people breathe, feed fires, regroup
//
// Budget = base (2)
//        × players^0.8                  more people, more monsters (sublinear)
//        × (1 + 0.35 × average gear)    shields etc. (item.gear, or 1 per `equip` item)
//        × (1 + 0.08 × settlement)      burning fires + structure tiles / 10
//        × (1 + 0.25 × (night - 1))     every night is harder than the last
//        × ramp(night progress)         quiet at dusk, worst around midnight
//        capped at maxBudget (40)
//
// Intensity (0..1) per player rises when they take damage or have monsters
// close, and decays over time. The group's intensity is the highest one.
//
// On top of that:
//   monster table  which types spawn, weighted by night (MONSTERS)
//   darkness       some spawns crawl out of any unlit tile near a player, even inside the base
//   waves          the scheduled hordes, announced a few seconds early and sent in three
//                  pulses from one direction: spider runners, a main body, skeletons at the back
//   raids          every third night (blood moon), and sometimes on others, a war party of
//                  zombies, skeletons, and spiders marches on the base instead of a player
//
// All state lives on game.director, so it survives hot swaps.
import { registries } from '../../shared/registry.js';

export const TUNING = {
  base: 2,
  playerExponent: 0.8,
  perGear: 0.35,
  perSettlement: 0.08,
  maxBudget: 40,          // hard cap on live threat, for fun and for the server
  perNight: 0.25,
  spawnInterval: 0.7,     // seconds between spawns during build-up
  peakIntensity: 0.7,     // group intensity that tips build-up into peak
  peakSeconds: 15,
  relaxSeconds: 20,
  hordeShare: 0.8,        // horde size as a fraction of the budget
  damageIntensity: 0.15,  // per point of damage taken
  closeIntensity: 0.06,   // per second per monster within 3 tiles
  intensityDecay: 0.08,   // per second
  darkShare: 0.35,        // share of ambient spawns that crawl out of unlit tiles near a player
  darkMin: 4,             // tiles from the player
  darkMax: 10,
  waveWarn: 6,            // seconds of warning before a wave
  wavePulseGap: 5,        // seconds between a wave's three pulses
  raidEvery: 3,           // blood moon: a raid is certain every this many nights
  raidChance: 0.25,       // chance of a raid on other nights, from night 2
  raidAt: 0.6,            // night progress when the raid sets out
  raidShare: 1.2,         // raid size as a fraction of the budget
  raidMax: 30,
  raidDistance: 20,       // tiles from the base where the raiders gather
};

// Ambient and main-body spawns, weighted per night; the last row covers every later night.
export const MONSTERS = [
  { slime: 1 },                                         // night 1
  { slime: 4, spider: 2, zombie: 2, skeleton: 1 },      // night 2
  { slime: 3, spider: 2.5, zombie: 2.5, skeleton: 2 },  // night 3 and later
];

export function pickType(night) {
  const table = MONSTERS[Math.max(1, Math.min(night, MONSTERS.length)) - 1];
  const entries = Object.entries(table).filter(([type]) => registries.entityTypes.get(type));
  let r = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [type, w] of entries) if ((r -= w) < 0) return type;
  return 'slime';
}

// Raid parties are half zombies (they break in), then skeletons, then spiders.
const raidType = () => { const r = Math.random(); return r < 0.5 ? 'zombie' : r < 0.8 ? 'skeleton' : 'spider'; };

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const compass = (angle) => COMPASS[(Math.round((((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4))) % 8];

export function director(game) {
  return (game.director ||= { state: 'idle', since: game.time, budget: 0, threat: 0, intensity: 0, hordes: [], pulses: [], nextSpawn: 0, factors: {} });
}

/** Where the settlement is: the burning fire with the most structures around it, else the
 *  densest cluster of structure tiles. null when nobody has built anything. */
export function findBase(game) {
  const structures = [];
  for (const [key, id] of game.world.edits) {
    if (!registries.tiles[id]?.structure) continue;
    const [x, y] = key.split(',').map(Number);
    structures.push({ x: x + 0.5, y: y + 0.5 });
  }
  const around = (p) => structures.filter((s) => Math.hypot(s.x - p.x, s.y - p.y) < 10).length;
  const fires = [...game.entities.values()].filter((e) => e.repels);
  let best = null, bestN = 0;
  for (const c of fires.length ? fires : structures) {
    const n = around(c) + (fires.length ? 1 : 0);
    if (n > bestN) { best = c; bestN = n; }
  }
  return best && { x: best.x, y: best.y };
}

const isHostile = (e) => e.hostile && e.hp > 0;
const threatOf = (e) => registries.entityTypes.get(e.type)?.defaults?.threat ?? 1;

function gearScore(players) {
  if (!players.length) return 0;
  let total = 0;
  for (const p of players) {
    for (const [name, n] of Object.entries(p.inventory || {})) {
      const item = registries.items.get(name);
      if (n > 0 && item) total += item.gear ?? (item.equip ? 1 : 0);
    }
  }
  return total / players.length;
}

function settlementScore(game, d) {
  if (game.time - (d._settlementAt || -99) > 2) { // structures are expensive to count; refresh every 2 s
    let structures = 0;
    for (const id of game.world.edits.values()) if (registries.tiles[id]?.structure) structures++;
    d._structures = structures;
    d._settlementAt = game.time;
  }
  const fires = [...game.entities.values()].filter((e) => e.repels).length;
  return fires + d._structures / 10;
}

export function computeBudget(game, tod = game.timeOfDay()) {
  const players = game.players();
  const f = {
    players: players.length,
    gear: gearScore(players),
    settlement: settlementScore(game, director(game)),
    night: tod.day,
    ramp: 0.6 + 0.7 * Math.sin(Math.PI * tod.nightProgress),
  };
  const T = TUNING;
  const budget = T.base * Math.pow(f.players, T.playerExponent) * (1 + T.perGear * f.gear) *
    (1 + T.perSettlement * f.settlement) * (1 + T.perNight * (f.night - 1)) * f.ramp;
  return { budget: players.length ? Math.min(T.maxBudget, budget) : 0, factors: f };
}

/** Call from an onEvent('damage') listener. */
export function noteDamage(game, hit) {
  if (hit.cancelled || hit.target.type !== 'player') return;
  hit.target._intensity = Math.min(1, (hit.target._intensity || 0) + hit.amount * TUNING.damageIntensity);
}

/** Call at dusk: plan tonight's waves (fractions of the night) and maybe a raid. */
export function planNight(game, tod) {
  const d = director(game);
  d.hordes = tod.day >= 3 ? [0.25, 0.5, 0.75] : tod.day === 2 ? [0.3, 0.7] : [0.5];
  d.wave = 0;
  d.waveAngle = Math.random() * Math.PI * 2;
  d.warned = false;
  d.pulses = [];
  d.bloodMoon = tod.day % TUNING.raidEvery === 0;
  d.raidAt = d.bloodMoon || (tod.day >= 2 && Math.random() < TUNING.raidChance) ? TUNING.raidAt : null;
  setState(game, 'build-up');
}

function setState(game, state) {
  const d = director(game);
  if (d.state !== state) { d.state = state; d.since = game.time; }
}

const calmest = (players) => players.reduce((best, p) => (p._intensity || 0) < (best._intensity || 0) ? p : best);

// A wave: the planned size goes out in three pulses from one direction, aimed at the calmest
// player. Spiders run ahead, the main body follows, skeletons bring up the rear.
function launchWave(game, d, budget, tod, players, spawnFn) {
  d.hordes.shift();
  d.wave = (d.wave || 0) + 1;
  d.warned = false;
  const target = calmest(players);
  const angle = d.waveAngle ?? Math.random() * Math.PI * 2;
  d.waveAngle = Math.random() * Math.PI * 2; // the next wave comes from somewhere else
  const size = Math.max(3, Math.round(budget * TUNING.hordeShare));
  const runners = Math.max(1, Math.round(size * 0.25)), rear = Math.round(size * 0.25), main = size - runners - rear;
  const gap = TUNING.wavePulseGap;
  (d.pulses ||= []).push(
    { at: game.time + gap, target: target.id, angle, n: main, kind: 'main' },
    { at: game.time + 2 * gap, target: target.id, angle, n: rear, kind: 'rear' },
  );
  spawnPulse(game, { target: target.id, angle, n: runners, kind: 'runners' }, tod.day, players, spawnFn);
  game.broadcast('horde', { from: compass(angle), count: size, target: target.id, wave: d.wave, of: d.wave + d.hordes.length });
  setState(game, 'peak');
}

function spawnPulse(game, pulse, night, players, spawnFn) {
  const target = game.entities.get(pulse.target) || calmest(players);
  let n = 0;
  for (let i = 0; i < pulse.n; i++) {
    const type = pulse.kind === 'runners' ? 'spider' : pulse.kind === 'rear' ? (night >= 2 ? 'skeleton' : 'slime') : pickType(night);
    if (spawnFn(game, target, { horde: true, angle: pulse.angle, type })) n++;
  }
  return n;
}

// A raid marches on the base. Without a base, it turns into an extra wave right away.
function launchRaid(game, d, budget, tod, spawnFn) {
  d.raidAt = null;
  const base = findBase(game);
  if (!base) { d.hordes.unshift(tod.nightProgress); return; }
  const size = Math.min(TUNING.raidMax, Math.max(5, Math.round(budget * TUNING.raidShare)));
  const angle = Math.random() * Math.PI * 2;
  let n = 0;
  for (let i = 0; i < size; i++) if (spawnFn(game, base, { raid: true, angle, type: raidType() })) n++;
  d.raid = { x: base.x, y: base.y, count: n, bloodMoon: !!d.bloodMoon };
  game.broadcast('raid', { from: compass(angle), count: n, x: base.x, y: base.y, bloodMoon: !!d.bloodMoon });
  setState(game, 'peak');
}

/** Call every tick. spawnFn(game, player, { horde, angle, type, dark, raid }) must spawn one
 *  monster or return null; with `raid`, `player` is the base it marches on. */
export function updateDirector(game, dt, spawnFn) {
  const d = director(game);
  const tod = game.timeOfDay();
  const players = game.players();

  // intensity bookkeeping (also during the day, so it decays)
  const hostiles = [...game.entities.values()].filter(isHostile);
  d.intensity = 0;
  for (const p of players) {
    const close = hostiles.filter((h) => Math.hypot(h.x - p.x, h.y - p.y) < 3).length;
    p._intensity = Math.max(0, Math.min(1, (p._intensity || 0) + (close * TUNING.closeIntensity - TUNING.intensityDecay) * dt));
    d.intensity = Math.max(d.intensity, p._intensity);
  }

  // the raid is over once every raider is dead (or melted at dawn)
  if (d.raid && !hostiles.some((h) => h.raider)) {
    game.broadcast('raidOver', { dawn: !tod.isNight });
    d.raid = null;
  }

  if (!tod.isNight || !players.length) { setState(game, 'idle'); d.budget = 0; d.pulses = []; return; }
  if (d.state === 'idle') planNight(game, tod);

  const { budget, factors } = computeBudget(game, tod);
  d.budget = budget;
  d.factors = factors;
  d.threat = hostiles.reduce((sum, h) => sum + threatOf(h), 0);
  const inState = game.time - d.since;

  // the rest of a wave arrives in pulses
  for (const pulse of (d.pulses ||= []).filter((p) => game.time >= p.at)) spawnPulse(game, pulse, tod.day, players, spawnFn);
  d.pulses = d.pulses.filter((p) => game.time < p.at);

  if (d.raidAt != null && tod.nightProgress >= d.raidAt) { launchRaid(game, d, budget, tod, spawnFn); return; }

  // waves: a warning first, then the first pulse
  if (d.hordes.length) {
    d.waveAngle ??= Math.random() * Math.PI * 2;
    if (!d.warned && tod.nightProgress >= d.hordes[0] - TUNING.waveWarn / tod.nightLength) {
      d.warned = true;
      game.broadcast('waveWarn', { from: compass(d.waveAngle), wave: (d.wave || 0) + 1, of: (d.wave || 0) + d.hordes.length });
    }
    if (tod.nightProgress >= d.hordes[0]) { launchWave(game, d, budget, tod, players, spawnFn); return; }
  }

  const ambient = () => {
    d.nextSpawn = game.time + TUNING.spawnInterval;
    spawnFn(game, players[Math.floor(Math.random() * players.length)], { horde: false, dark: Math.random() < TUNING.darkShare });
  };
  switch (d.state) {
    case 'build-up':
      if (d.intensity >= TUNING.peakIntensity) { setState(game, 'peak'); break; }
      if (d.threat < budget && game.time >= d.nextSpawn) ambient();
      break;
    case 'peak':
      if (d.threat < budget && game.time >= d.nextSpawn) ambient();
      if (inState > TUNING.peakSeconds) setState(game, 'relax');
      break;
    case 'relax':
      if (inState > TUNING.relaxSeconds && d.intensity < 0.3) setState(game, 'build-up');
      break;
  }
}
