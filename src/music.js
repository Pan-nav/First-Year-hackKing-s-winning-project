// OWNER: looping arcade background music, generated with WebAudio (no audio files, per the brief).
// An original 4-bar chiptune: square-wave lead, triangle bass, noise hi-hats, at 140 bpm.
// Starts on the first click or key press (browsers block audio before that) and follows the Partner's
// mute toggle, which stores 'true' in localStorage 'str.muted' (button or M key).
import { CONFIG } from './config.js';

const BPM = 140;
const STEP = 60 / BPM / 4; // a sixteenth note, in seconds
const VOLUME = 0.05;

// A minor - F - C - G, one chord per bar. Notes as semitones from A3 (220 Hz); null = rest.
const LEAD = [
  [12, null, 15, 19, 24, null, 19, 15, 12, null, 15, 19, 22, 19, 15, null],
  [8, null, 12, 15, 20, null, 15, 12, 8, null, 12, 15, 17, 15, 12, null],
  [3, null, 7, 10, 15, null, 10, 7, 3, null, 7, 10, 12, 10, 7, null],
  [10, null, 14, 17, 22, null, 17, 14, 22, 19, 17, 14, 12, 14, 17, 19],
];
const BASS = [-12, -16, -9, -14]; // A2, F2, C3, G2: the root of each bar
const freq = (semis) => 220 * 2 ** (semis / 12);

export function initMusic() {
  if (!CONFIG.music) return;
  let ctx = null;
  let master = null;
  let noise = null;
  let step = 0;
  let nextTime = 0;

  const muted = () => {
    try {
      return localStorage.getItem('str.muted') === 'true';
    } catch {
      return false;
    }
  };

  function tone(type, f, at, dur, vol) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function hat(at) {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    src.buffer = noise;
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    gain.gain.setValueAtTime(0.25, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    src.connect(filter).connect(gain).connect(master);
    src.start(at);
    src.stop(at + 0.05);
  }

  // Schedule a little ahead of time on a timer, so the music keeps steady time even when frames stutter.
  function schedule() {
    master.gain.setTargetAtTime(muted() ? 0 : VOLUME, ctx.currentTime, 0.05);
    while (nextTime < ctx.currentTime + 0.12) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      const lead = LEAD[bar][s];
      if (lead !== null) tone('square', freq(lead), nextTime, STEP * 0.9, 0.35);
      if (s % 4 === 0) tone('triangle', freq(BASS[bar]), nextTime, STEP * 3.5, 0.6);
      if (s % 2 === 0) hat(nextTime);
      nextTime += STEP;
      step++;
    }
  }

  function start() {
    if (ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    nextTime = ctx.currentTime + 0.1;
    setInterval(schedule, 50);
  }

  document.addEventListener('pointerdown', start, { once: true });
  document.addEventListener('keydown', start, { once: true });
}
