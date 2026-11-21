import { bus } from '../bus.js';

export function initAudio() {
  const KEY = 'str.muted';
  let muted = false;
  try { muted = localStorage.getItem(KEY) === 'true'; } catch {}
  let audio;
  const setup = () => {
    if (!audio) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) audio = new Audio();
    }
    if (audio?.state === 'suspended') audio.resume().catch(() => {});
  };
  const toggle = () => {
    muted = !muted;
    try { localStorage.setItem(KEY, String(muted)); } catch {}
    updateButton();
  };
  const updateButton = () => {
    const button = document.getElementById('mute-button');
    if (!button) return;
    button.textContent = muted ? '♪̸' : '♫';
    button.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    button.setAttribute('aria-pressed', String(muted));
  };
  document.addEventListener('pointerdown', setup, { once: true });
  document.addEventListener('keydown', setup, { once: true });
  document.addEventListener('click', e => { if (e.target.closest('#mute-button')) toggle(); });
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'm' && !e.repeat && !e.target.matches('input,textarea')) toggle();
  });
  queueMicrotask(updateButton);
  function note(freq, at = 0, duration = 0.09, type = 'square', volume = 0.045, filterFreq = 0) {
    if (muted || !audio) return;
    const t = audio.currentTime + at;
    const osc = audio.createOscillator(); const gain = audio.createGain();
    osc.type = type; osc.frequency.setValueAtTime(Math.max(30, freq), t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    if (filterFreq) {
      const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = filterFreq;
      osc.connect(filter); filter.connect(gain);
    } else osc.connect(gain);
    gain.connect(audio.destination); osc.start(t); osc.stop(t + duration + 0.015);
  }
  bus.on('item:slice', ({ kind, combo = 0 }) => {
    if (kind === 'correct') { note(460 + Math.min(8, combo) * 70, 0, 0.09, 'triangle'); note(700 + combo * 35, 0.065, 0.09, 'square', 0.025); }
    else if (kind === 'brainrot') { note(88, 0, 0.26, 'sawtooth', 0.065, 340); note(54, 0.05, 0.24, 'square', 0.025, 180); }
    else { note(170, 0, 0.22, 'sawtooth', 0.04, 650); note(135, 0.08, 0.19, 'square', 0.03); }
  });
  bus.on('item:miss', () => { note(370,0,0.13,'triangle'); note(260,0.12,0.19,'triangle'); });
  bus.on('round:start', () => { [392,523,659,784].forEach((f,i)=>note(f,i*0.09,0.13,'square',0.028)); });
  bus.on('game:over', () => { [523,440,349,220].forEach((f,i)=>note(f,i*0.16,0.23,'triangle',0.042)); });
}
