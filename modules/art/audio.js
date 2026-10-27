// TEAM ART (client helper): the sound system shared by the music and the sound effects.
// One AudioContext, unlocked by the first tap, click, or key press (browsers allow no
// sound before that), with a master bus and separate music and effects buses. Audio
// files are fetched once per browser and kept in IndexedDB, so the page reloads that
// every client.js save triggers do not download them again.
// F4 mutes everything; Esc settings has rows for music and for sound effects.
import { registerClientSystem, registerSetting } from '../../shared/registry.js';

const CACHE_VERSION = 1; // bump when an audio file is replaced, so browsers fetch it again

registerSetting('sounds', { label: 'Sound effects', options: [true, false], default: true, names: { true: 'on', false: 'off' } });

export const sound = { ctx: null, master: null, music: null, sfx: null, muted: false };
let ready;                                                    // resolves with the context once unlocked
const whenReady = new Promise((resolve) => { ready = resolve; });

function unlock() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  if (!sound.ctx) {
    const ctx = (sound.ctx = new AC({ latencyHint: 'interactive' }));
    sound.master = ctx.createGain();
    sound.master.connect(ctx.destination);
    sound.music = ctx.createGain();
    sound.music.connect(sound.master);
    sound.sfx = ctx.createGain();
    sound.sfx.connect(sound.master);
    ready(ctx);
  }
  if (sound.ctx.state !== 'running') sound.ctx.resume().catch(() => {});
}
// keep listening: phones suspend audio when the page is backgrounded, and the next tap resumes it
for (const type of ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown']) addEventListener(type, unlock, { capture: true, passive: true });

// ---------------------------------------------------------- file cache ----

let db;
function store() {
  return (db ||= new Promise((resolve) => {
    try {
      const req = indexedDB.open('nightfall-audio', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }                                  // private windows may refuse: just fetch every time
  }));
}
async function cached(key) {
  const d = await store();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction('files').objectStore('files').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function keep(key, bytes) {
  const d = await store();
  try { d?.transaction('files', 'readwrite').objectStore('files').put(bytes, key); } catch { /* full or refused: fine */ }
}
async function fileBytes(url) {
  const key = `${url}#${CACHE_VERSION}`;
  const hit = await cached(key);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bytes = await res.arrayBuffer();
  keep(key, bytes);
  return bytes;
}

const buffers = new Map();                                    // url -> Promise<AudioBuffer | null>
/** Fetch (or take from the cache) and decode an audio file; resolves once sound is unlocked. */
export function load(url) {
  if (!buffers.has(url)) {
    buffers.set(url, Promise.all([fileBytes(url), whenReady])
      .then(([bytes, ctx]) => ctx.decodeAudioData(bytes.slice(0)))
      .catch((err) => { console.warn('[audio] could not load', url, err); return null; }));
  }
  return buffers.get(url);
}
const decoded = new Map();                                    // url -> AudioBuffer, once loaded
export const loaded = (url) => decoded.get(url);
export async function preload(urls) {
  await Promise.all(urls.map(async (url) => { const b = await load(url); if (b) decoded.set(url, b); }));
}

// ---------------------------------------------------------- playback ----

const lastPlayed = new Map();
/**
 * Play a decoded sound on the effects bus. Options: vol (0..1), rate (playback speed),
 * pan (-1 left .. 1 right), delay (seconds), key (sounds with the same key at most every
 * 40 ms, so a crowd of hits does not stack into one loud blast).
 */
export function playBuffer(buffer, { vol = 0.5, rate = 1, pan = 0, delay = 0, key = null } = {}) {
  const ctx = sound.ctx;
  if (!buffer || !ctx || ctx.state !== 'running' || vol <= 0.001) return;
  if (key) {
    const t = performance.now();
    if (t - (lastPlayed.get(key) || 0) < 40) return;
    lastPlayed.set(key, t);
  }
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  gain.gain.value = vol;
  let out = src.connect(gain);
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); out = out.connect(p); }
  out.connect(sound.sfx);
  src.start(ctx.currentTime + delay);
}

// mute (F4) and the effects setting, applied smoothly
registerClientSystem('audio-mix', (game) => {
  if (game.input.pressed('F4')) {
    sound.muted = !sound.muted;
    game.notify(sound.muted ? 'Sound muted (F4)' : 'Sound on', 1.5, game.theme.colors.candle);
  }
  if (!sound.ctx) return;
  const t = sound.ctx.currentTime;
  sound.master.gain.setTargetAtTime(sound.muted ? 0 : 1, t, 0.05);
  sound.sfx.gain.setTargetAtTime(game.settings.sounds === false ? 0 : 1, t, 0.05);
});
