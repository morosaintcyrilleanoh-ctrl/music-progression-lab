// =====================================================================
// Oreille+ : sons fabriqués (instruments, accords, percussions)
// Le piano est enregistré (audio.js) ; les autres instruments sont des
// imitations synthétisées, reconnaissables à leur timbre.
// =====================================================================
import { audioOut, playNote, playKick, playClick, sleep } from '../audio.js';

import { midiToFreq } from '../music.js';

// Corde pincée (algorithme de Karplus-Strong) : guitare, basse
const pluckCache = new Map();
function pluckBuffer(ac, freq, seconds, brightness) {
  const key = `${Math.round(freq * 10)}:${seconds}:${brightness}`;
  if (pluckCache.has(key)) return pluckCache.get(key);
  const n = Math.round(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  const period = Math.max(2, Math.round(ac.sampleRate / freq));
  const ring = new Float32Array(period).map(() => Math.random() * 2 - 1);
  let i = 0;
  for (let k = 0; k < n; k++) {
    const a = ring[i], b = ring[(i + 1) % period];
    d[k] = a;
    ring[i] = (a * brightness + b * (1 - brightness)) * 0.996;
    i = (i + 1) % period;
  }
  pluckCache.set(key, buf);
  return buf;
}

function env(ac, out, t, { attack, peak, decay, sustain = 0, release, dur }) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  if (sustain) g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * sustain), t + attack + decay);
  else g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  if (sustain) {
    g.gain.setValueAtTime(Math.max(0.0002, peak * sustain), t + Math.max(attack + decay, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + decay, dur) + release);
  }
  g.connect(out);
  return g;
}

function vibrato(ac, osc, t, rate, depth, delay = 0.15) {
  const lfo = ac.createOscillator();
  const lg = ac.createGain();
  lfo.frequency.value = rate;
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(depth, t + delay + 0.2);
  lfo.connect(lg).connect(osc.frequency);
  lfo.start(t);
  return lfo;
}

export const INSTRUMENTS = ['piano', 'guitare', 'flute', 'cordes', 'cuivres', 'orgue', 'balafon', 'basse'];

/** Joue une note (midi) avec l'instrument choisi, `when` secondes après maintenant. */
export function playInstrument(name, midi, when = 0, dur = 0.6) {
  if (name === 'piano') return playNote(midi, { when, duration: dur, volume: 0.5 });
  const o = audioOut();
  if (!o) return;
  const { ac, out } = o;
  const t = ac.currentTime + when + 0.02;
  const f = midiToFreq(midi);
  const stopAt = t + dur + 0.6;

  if (name === 'guitare' || name === 'basse') {
    const src = ac.createBufferSource();
    src.buffer = pluckBuffer(ac, name === 'basse' ? f / 2 : f, 2, name === 'basse' ? 0.3 : 0.5);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = name === 'basse' ? 900 : 4000;
    const g = env(ac, out, t, { attack: 0.004, peak: name === 'basse' ? 1.4 : 0.9, decay: 1.6, release: 0.1, dur });
    src.connect(lp).connect(g);
    src.start(t); src.stop(stopAt);
    return;
  }
  if (name === 'balafon') {
    // Lames de bois : partiels inharmoniques, extinction rapide
    [[1, 0.9, 0.55], [3.9, 0.35, 0.18], [9.2, 0.12, 0.08]].forEach(([mult, level, decay]) => {
      const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = f * mult;
      const g = env(ac, out, t, { attack: 0.002, peak: level, decay, release: 0.05, dur });
      osc.connect(g); osc.start(t); osc.stop(t + 0.8);
    });
    // Petit choc de la mailloche
    const click = ac.createOscillator(); click.type = 'triangle'; click.frequency.value = f * 16;
    const cg = env(ac, out, t, { attack: 0.001, peak: 0.08, decay: 0.02, release: 0.01, dur });
    click.connect(cg); click.start(t); click.stop(t + 0.05);
    return;
  }
  if (name === 'orgue') {
    const g = env(ac, out, t, { attack: 0.02, peak: 0.28, decay: 0.05, sustain: 0.9, release: 0.08, dur });
    const trem = ac.createGain(); trem.gain.value = 1;
    const lfo = ac.createOscillator(); lfo.frequency.value = 6;
    const lg = ac.createGain(); lg.gain.value = 0.12;
    lfo.connect(lg).connect(trem.gain); lfo.start(t); lfo.stop(stopAt);
    trem.connect(g);
    [[1, 1], [2, 0.7], [3, 0.5], [4, 0.35], [6, 0.25], [8, 0.2]].forEach(([mult, level]) => {
      const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = f * mult;
      const lv = ac.createGain(); lv.gain.value = level;
      osc.connect(lv).connect(trem); osc.start(t); osc.stop(stopAt);
    });
    return;
  }
  if (name === 'flute') {
    const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
    const h2 = ac.createOscillator(); h2.type = 'sine'; h2.frequency.value = f * 2;
    const h2g = ac.createGain(); h2g.gain.value = 0.18;
    const g = env(ac, out, t, { attack: 0.09, peak: 0.55, decay: 0.1, sustain: 0.85, release: 0.12, dur });
    osc.connect(g); h2.connect(h2g).connect(g);
    const l1 = vibrato(ac, osc, t, 5, f * 0.006); const l2 = vibrato(ac, h2, t, 5, f * 0.012);
    // Souffle
    const noise = ac.createBufferSource();
    const nb = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    nb.getChannelData(0).forEach((_, i, a) => { a[i] = (Math.random() * 2 - 1) * 0.5; });
    noise.buffer = nb; noise.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
    const ng = env(ac, out, t, { attack: 0.03, peak: 0.08, decay: 0.15, sustain: 0.35, release: 0.1, dur });
    noise.connect(bp).connect(ng);
    [osc, h2, noise].forEach((n) => { n.start(t); n.stop(stopAt); });
    [l1, l2].forEach((l) => l.stop(stopAt)); // déjà démarrés par vibrato()
    return;
  }
  // Cordes frottées et cuivres : dents de scie filtrées
  const brass = name === 'cuivres';
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = brass ? 2 : 0.7;
  lp.frequency.setValueAtTime(brass ? 500 : 2500, t);
  if (brass) { lp.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 8), t + 0.06); lp.frequency.exponentialRampToValueAtTime(Math.min(3500, f * 5), t + 0.3); }
  const g = env(ac, out, t, brass ? { attack: 0.035, peak: 0.32, decay: 0.15, sustain: 0.8, release: 0.08, dur } : { attack: 0.16, peak: 0.26, decay: 0.2, sustain: 0.9, release: 0.25, dur });
  lp.connect(g);
  const voices = brass ? [1] : [1, 1.006, 0.994];
  voices.forEach((det) => {
    const osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f * det;
    const l = vibrato(ac, osc, t, brass ? 5.5 : 5.8, f * (brass ? 0.004 : 0.008), brass ? 0.25 : 0.12);
    osc.connect(lp); osc.start(t); osc.stop(stopAt); l.stop(stopAt);
  });
}

/** Une petite mélodie jouée par un instrument ; attend la fin. */
export async function playPhrase(name, notes, step = 0.42) {
  notes.forEach((m, i) => playInstrument(name, m, i * step, step * 0.9));
  await sleep((notes.length * step + 0.8) * 1000);
}

/** Accords (listes de notes midi) joués au piano avec la basse ; attend la fin. */
export async function playChords(chords, dur = 0.95) {
  chords.forEach((notes, i) => notes.forEach((m, k) => playNote(m, { when: i * dur, duration: dur * 0.95, volume: k === 0 ? 0.32 : 0.24 })));
  await sleep((chords.length * dur + 0.6) * 1000);
}

/** Percussions : grave (tambour) et aiguë (bois). */
export const drumLow = (when) => playKick(when);
export const drumHigh = (when) => playClick({ when, accent: true, volume: 0.5 });
