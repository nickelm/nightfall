// TEAM ART (client helper): sound effects from recorded samples.
// The samples in ./sfx are by Kenney (https://kenney.nl), CC0 (public domain), taken
// from https://www.soundcn.xyz. See ./sfx/CREDITS.md.
//
// Sounds in the world fade with distance from you and pan left or right. Each event
// picks one of several takes at a slightly random speed, so repeats do not sound robotic.
// Synth blips in client.js still cover events without a fitting sample.
import { registries, registerClientSystem, onEvent } from '../../shared/registry.js';
import { sound, preload, loaded, playBuffer } from './audio.js';

const takes = (base, n, from = 0) => Array.from({ length: n }, (_, i) => `${base}-00${i + from}`);
const SOUNDS = {
  swing: ['knife-slice', 'knife-slice-2'],
  hit: takes('impact-punch-medium', 5),
  hurt: takes('impact-punch-heavy', 5),
  slime: ['slime-000'],
  parry: ['impact-metal-heavy-000', 'impact-metal-heavy-001', 'impact-metal-heavy-003'],
  block: takes('impact-wood-heavy', 3),
  mineStone: takes('impact-mining', 5),
  mineWood: takes('impact-wood-medium', 5),
  mineSoft: takes('impact-soft-medium', 5),
  chop: ['chop'],
  glass: ['glass-001', 'glass-004'],
  crumble: takes('impact-soft-heavy', 3),
  placeWood: takes('impact-plank-medium', 3),
  placeStone: takes('impact-plate-light', 3),
  placeGlass: ['impact-glass-medium-000'],
  placeThing: takes('impact-wood-light', 3),
  doorOpen: ['door-open-000'],
  doorClose: ['door-close-000'],
  craft: ['confirmation-002'],
  explosion: ['explosion-crunch-001', 'explosion-crunch-003'],
  rumble: ['low-frequency-explosion-001'],
  bell: ['impact-bell-heavy-000', 'impact-bell-heavy-001'],
  twang: ['pluck-001', 'pluck-002'],
  spell: ['power-up-6'],
  bigSpell: ['power-up-3'],
  coins: ['handle-coins-2'],
  bagOpen: ['cloth-2'],
  bagClose: ['cloth-4'],
  tick: ['tick-001'],
  spotted: ['low-down'],
  error: ['error-004'],
  creak: ['creak-1', 'creak-2', 'creak-3'],
  stepGrass: takes('footstep-grass', 5),
  stepStone: takes('footstep-concrete', 5),
  stepSand: takes('footstep-snow', 5),
  stepWood: takes('footstep-wood', 5),
};
const url = (name) => new URL(`./sfx/${name}.mp3`, import.meta.url).href;
const ALL = [...new Set(Object.values(SOUNDS).flat())].map(url);
let preloading = false;

const HEAR = 18; // tiles: beyond this a sound in the world is silent

/** Play one take of a sound. `at` ({x, y}) places it in the world relative to you. */
function sfx(game, name, { vol = 0.5, at = null, range = HEAR, rate = 1, vary = 0.08, delay = 0 } = {}) {
  const list = SOUNDS[name], buffer = list && loaded(url(list[Math.floor(Math.random() * list.length)]));
  if (!buffer) return;
  let pan = 0;
  const me = game.me;
  if (at && me) {
    const dx = at.x - me.x, dy = at.y - me.y, d = Math.hypot(dx, dy);
    if (d > range) return;
    vol *= d < 3 ? 1 : 1 - (d - 3) / (range - 3);
    pan = Math.max(-0.8, Math.min(0.8, dx / 10));
  }
  playBuffer(buffer, { vol, pan, delay, rate: rate * (1 + (Math.random() * 2 - 1) * vary), key: name });
}

// start loading as soon as sound is unlocked (the files are small and cached afterwards)
registerClientSystem('sfx-preload', () => {
  if (preloading || !sound.ctx) return;
  preloading = true;
  preload(ALL);
});

// ------------------------------------------------------------- combat ----

const isSlime = (e) => /slime/.test(e?.type || '');
onEvent('net:hit', (game, { id, x, y }) => {
  const e = game.entities.get(id);
  if (id === game.myId) sfx(game, 'hurt', { vol: 0.6 });
  else sfx(game, 'hit', { vol: 0.45, at: { x, y } });
  if (isSlime(e)) sfx(game, 'slime', { vol: 0.4, at: { x, y }, rate: 1.2, vary: 0.15 });
});
onEvent('net:swing', (game, { id }) => {
  const e = game.entities.get(id);
  if (e) sfx(game, 'swing', { vol: id === game.myId ? 0.32 : 0.2, at: id === game.myId ? null : e, rate: 1.1, vary: 0.1 });
});
onEvent('net:parry', (game, { x, y }) => sfx(game, 'parry', { vol: 0.7, at: { x, y } }));
onEvent('net:block', (game, { x, y }) => sfx(game, 'block', { vol: 0.6, at: { x, y } }));
onEvent('net:shot', (game, { id }) => {
  const e = game.entities.get(id), at = id === game.myId ? null : e;
  sfx(game, 'twang', { vol: 0.55, at, rate: 0.55 });
  sfx(game, 'swing', { vol: 0.15, at, rate: 1.7 });
});
onEvent('net:split', (game, { x, y }) => sfx(game, 'slime', { vol: 0.6, at: { x, y }, rate: 0.8 }));
onEvent('net:bash', (game, { x, y, broke }) => sfx(game, broke ? 'crumble' : 'block', { vol: 0.55, at: { x, y }, rate: 0.85 }));
onEvent('net:roar', (game, { x, y }) => sfx(game, 'rumble', { vol: 0.45, at: { x, y }, range: 26, rate: 0.7 }));
onEvent('net:cast', (game, { x, y }) => sfx(game, 'spell', { vol: 0.3, at: { x, y } }));
onEvent('net:nova', (game, { x, y }) => sfx(game, 'bigSpell', { vol: 0.35, at: { x, y } }));
onEvent('net:exploded', (game, { x, y }) => {
  sfx(game, 'explosion', { vol: 0.8, at: { x, y }, range: 30 });
  sfx(game, 'rumble', { vol: 0.6, at: { x, y }, range: 30 });
});
onEvent('net:boom', (game, { x, y, size }) => sfx(game, 'explosion', { vol: Math.min(0.8, 0.4 + (size || 1) * 0.15), at: { x, y }, range: 26 }));

// a monster notices you: a low falling tone, at most every few seconds
onEvent('net:spotted', (game, { id }) => {
  const e = game.entities.get(id);
  if (!e || !game.canSee(e._rx ?? e.x, e._ry ?? e.y) || performance.now() - (game._spottedAt || 0) < 4000) return;
  game._spottedAt = performance.now();
  sfx(game, 'spotted', { vol: 0.35, at: e, vary: 0 });
});

// ------------------------------------------------- building and gathering ----

onEvent('net:harvested', (game, { x, y, item }) => {
  const at = { x: x + 0.5, y: y + 0.5 };
  if (item === 'wood') { sfx(game, 'chop', { vol: 0.6, at }); sfx(game, 'block', { vol: 0.35, at, rate: 0.8 }); }
  else if (item === 'glass') sfx(game, 'glass', { vol: 0.55, at });
  else if (item === 'pumpkin') sfx(game, 'slime', { vol: 0.5, at, rate: 1.4 });
  else if (item === 'sand') sfx(game, 'stepSand', { vol: 0.6, at, rate: 0.8 });
  else sfx(game, 'crumble', { vol: 0.55, at });
});
onEvent('net:placed', (game, { x, y, item }) => {
  const def = registries.items.get(item), at = { x: x + 0.5, y: y + 0.5 };
  if (def?.placesTile === 'door-closed') return;               // the door sound plays when its tile appears
  if (def?.places) sfx(game, 'placeThing', { vol: 0.5, at });
  else if (def?.placesTile === 'glass') sfx(game, 'placeGlass', { vol: 0.45, at });
  else if (def?.placesTile === 'wood-wall') sfx(game, 'placeWood', { vol: 0.45, at });
  else sfx(game, 'placeStone', { vol: 0.4, at });
});
onEvent('tileChanged', (game, x, y, id) => {
  const name = registries.tiles[id]?.name, at = { x: x + 0.5, y: y + 0.5 };
  if (name === 'door-open') sfx(game, 'doorOpen', { vol: 0.5, at });
  else if (name === 'door-closed') sfx(game, 'doorClose', { vol: 0.5, at });
});
onEvent('net:crafted', (game, { by }) => { if (by === game.myId) sfx(game, 'craft', { vol: 0.4 }); });
onEvent('net:fed', (game, { id }) => sfx(game, 'placeThing', { vol: 0.4, at: game.entities.get(id) }));
onEvent('net:pickedUp', (game) => sfx(game, 'coins', { vol: 0.45 }));
onEvent('net:noAmmo', (game) => sfx(game, 'error', { vol: 0.4, vary: 0 }));

// ------------------------------------------------------ night and death ----

const toll = (game, times) => { for (let i = 0; i < times; i++) sfx(game, 'bell', { vol: 0.55, rate: 0.7, vary: 0.02, delay: i * 1.6 }); };
onEvent('net:horde', (game) => toll(game, 2));
onEvent('net:raid', (game) => toll(game, 3));
onEvent('net:waveWarn', (game) => toll(game, 1));
onEvent('net:died', (game) => sfx(game, 'bell', { vol: 0.6, rate: 0.55, vary: 0 }));

// -------------------------------------------- mining, steps, panels, night ----

registerClientSystem('sfx-loops', (game, dt) => {
  const me = game.me;
  if (!me || !sound.ctx) return;

  // mining: a pick on stone, an axe on wood, bare hands on anything else (anyone close enough)
  for (const e of game.entities.values()) {
    if (e.type !== 'player') continue;
    if (!e.mining) { e._mineTick = 0; continue; }
    const tool = game.world.tile(e.mining.x, e.mining.y)?.tool;
    if ((e._mineTick = (e._mineTick || 0) - dt) > 0) continue;
    e._mineTick = tool === 'pickaxe' ? 0.45 : 0.32;
    const at = e.id === game.myId ? null : { x: e.mining.x + 0.5, y: e.mining.y + 0.5 };
    sfx(game, tool === 'pickaxe' ? 'mineStone' : tool === 'axe' ? 'mineWood' : 'mineSoft', { vol: at ? 0.25 : 0.4, at, range: 12 });
  }

  // footsteps on whatever is underfoot
  const moved = Math.hypot(me.x - (game._stepX ?? me.x), me.y - (game._stepY ?? me.y));
  game._stepX = me.x; game._stepY = me.y;
  if (moved > 0.001 && moved < 1 && !me.sailing) {
    game._stepDist = (game._stepDist || 0) + moved;
    if (game._stepDist > (me.running ? 1.1 : 0.85)) {
      game._stepDist = 0;
      const t = game.world.tile(me.x, me.y)?.name || '';
      const kind = /sand/.test(t) ? 'stepSand' : /door|wood|plank|floor/.test(t) ? 'stepWood'
        : /gravel|stone|ore|block|lava|obsidian/.test(t) ? 'stepStone' : 'stepGrass';
      sfx(game, kind, { vol: kind === 'stepStone' ? 0.3 : 0.16, vary: 0.12 });
    }
  }

  // panels and the hotbar
  if (game.ui !== game._sfxUi) {
    if (game.ui === 'inventory') sfx(game, 'bagOpen', { vol: 0.35 });
    else if (game._sfxUi === 'inventory') sfx(game, 'bagClose', { vol: 0.35 });
    else sfx(game, 'tick', { vol: 0.3, vary: 0 });
    game._sfxUi = game.ui;
  }
  if (game.selectedSlot !== game._sfxSlot) {
    if (game._sfxSlot !== undefined) sfx(game, 'tick', { vol: 0.25 });
    game._sfxSlot = game.selectedSlot;
  }

  // the old wood of the island creaks now and then at night
  if (game.timeOfDay().isNight) {
    if ((game._creakIn = (game._creakIn ?? 12) - dt) <= 0) {
      game._creakIn = 18 + Math.random() * 30;
      const a = Math.random() * Math.PI * 2;
      sfx(game, 'creak', { vol: 0.2, at: { x: me.x + Math.cos(a) * 7, y: me.y + Math.sin(a) * 7 }, rate: 0.8, vary: 0.15 });
    }
  }
});
