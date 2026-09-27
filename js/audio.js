// =====================================================================
// Moteur audio : produit les sons directement dans le navigateur
// (aucun fichier à télécharger). Utilise la Web Audio API.
// =====================================================================
import { midiToFreq } from './music.js';

let ctx = null;
let master = null;

// Le navigateur n'autorise le son qu'après un clic de l'utilisateur
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const audioSupported = () => !!(window.AudioContext || window.webkitAudioContext);
export const now = () => (ctx ? ctx.currentTime : 0);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Une note "type piano doux" ----------
export function playNote(midi, { duration = 0.9, when = 0, volume = 0.5 } = {}) {
  const ac = unlockAudio();
  if (!ac) return;
  const t = ac.currentTime + when;
  const freq = midiToFreq(midi);
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(volume, t + 0.015);
  env.gain.exponentialRampToValueAtTime(volume * 0.45, t + 0.25);
  env.gain.setValueAtTime(volume * 0.45, t + Math.max(0.26, duration - 0.15));
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.25);
  env.connect(master);

  const partials = [[1, 'triangle', 1], [2, 'sine', 0.25], [3, 'sine', 0.08]];
  partials.forEach(([mult, type, gain]) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq * mult;
    g.gain.value = gain;
    osc.connect(g).connect(env);
    osc.start(t);
    osc.stop(t + duration + 0.3);
  });
}

// Joue plusieurs notes à la suite ; renvoie une promesse terminée à la fin
export async function playSequence(midis, { noteDuration = 0.7, gap = 0.1 } = {}) {
  midis.forEach((m, i) => playNote(m, { duration: noteDuration, when: i * (noteDuration + gap) }));
  await sleep((midis.length * (noteDuration + gap) + 0.3) * 1000);
}

// ---------- Clic de métronome / percussion bois ----------
export function playClick({ when = 0, accent = false, volume = 0.6 } = {}) {
  const ac = unlockAudio();
  if (!ac) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1760 : 1200;
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = accent ? 1800 : 1300;
  osc.connect(filter).connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.06);
}

// ---------- Petite batterie / basse / nappe pour l'écoute active ----------
export function playKick(when = 0) {
  const ac = unlockAudio(); if (!ac) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator(); const g = ac.createGain();
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  osc.connect(g).connect(master); osc.start(t); osc.stop(t + 0.32);
}

export function playHat(when = 0) {
  const ac = unlockAudio(); if (!ac) return;
  const t = ac.currentTime + when;
  const buffer = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(); src.buffer = buffer;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(hp).connect(g).connect(master); src.start(t);
}

export function playBass(midi, { when = 0, duration = 0.5 } = {}) {
  const ac = unlockAudio(); if (!ac) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = midiToFreq(midi);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(lp).connect(g).connect(master); osc.start(t); osc.stop(t + duration + 0.05);
}

export function playPad(midis, { when = 0, duration = 2 } = {}) {
  const ac = unlockAudio(); if (!ac) return;
  const t = ac.currentTime + when;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.3);
  g.gain.setValueAtTime(0.12, t + duration - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + duration);
  g.connect(master);
  midis.forEach((m) => {
    const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = midiToFreq(m);
    osc.connect(g); osc.start(t); osc.stop(t + duration + 0.05);
  });
}
