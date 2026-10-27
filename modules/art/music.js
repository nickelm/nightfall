// TEAM ART (client helper): the background music, "Spooky Game Loop".
//
// How it loops without a seam: the loop is 32 bars at 125 BPM, exactly 61.44 s, cut
// from the original track (bars 3 to 34, skipping the intro and the fade-out) with its
// last half beat crossfaded into the audio that leads into bar 3. The file holds that
// loop twice in a row, and we loop the 61.44 s window in the middle. Since the sound
// repeats exactly with that period, the MP3 encoder's padding at the file's edges and
// any resampling to the device's rate cannot put a gap or a click at the loop point.
import { registerClientSystem, registerSetting } from '../../shared/registry.js';
import { sound, load } from './audio.js';

const URL_ = new URL('./music/spooky-game-loop.mp3', import.meta.url).href;
const LOOP = 61.44;    // seconds (32 bars at 125 BPM; a whole number of samples at every common rate)
const VOLUME = 0.32;   // music sits under the effects
const FADE_IN = 3;     // seconds

registerSetting('music', { label: 'Music', options: [true, false], default: true, names: { true: 'on', false: 'off' } });

const music = { source: null, starting: false };

async function start() {
  music.starting = true;
  const buffer = await load(URL_);
  const ctx = sound.ctx;
  if (!buffer || !ctx) { music.starting = false; return; }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  if (buffer.duration >= LOOP * 1.5 + 0.1) {                  // the window in the middle of the two copies
    src.loopStart = LOOP / 2;
    src.loopEnd = LOOP * 1.5;
  }
  src.connect(sound.music);
  sound.music.gain.setValueAtTime(0, ctx.currentTime);
  src.start(ctx.currentTime + 0.05, 0.25);                     // skip the encoder's lead-in at the very start
  music.source = src;
  music.starting = false;
}

registerClientSystem('music', (game) => {
  const ctx = sound.ctx;
  if (!ctx || ctx.state !== 'running') return;                 // waits for the first tap, click, or key
  const on = game.settings.music !== false;
  if (on && !music.source && !music.starting) start();
  if (music.source) sound.music.gain.setTargetAtTime(on ? VOLUME : 0, ctx.currentTime, on ? FADE_IN / 3 : 0.3);
});
