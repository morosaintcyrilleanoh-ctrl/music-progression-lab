// =====================================================================
// Détection de la hauteur de la voix (micro)
// Algorithme YIN (de Cheveigné & Kawahara, 2002), programmé ici sans
// bibliothèque externe. Résultat INDICATIF : il peut être perturbé par le
// bruit, la qualité du micro ou la distance.
// =====================================================================
import { unlockAudio } from './audio.js';

// ---------- Calcul pur (testable sans navigateur) ----------
export function detectPitch(buffer, sampleRate, { minFreq = 70, maxFreq = 1100, threshold = 0.15, minRms = 0.01 } = {}) {
  const n = buffer.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / n);
  if (rms < minRms) return null; // silence

  const maxTau = Math.min(Math.floor(sampleRate / minFreq), Math.floor(n / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const w = n - maxTau;
  const d = new Float32Array(maxTau + 1);

  // 1. Fonction de différence
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) { const diff = buffer[i] - buffer[i + tau]; sum += diff * diff; }
    d[tau] = sum;
  }
  // 2. Différence normalisée cumulée
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }
  // 3. Premier creux sous le seuil
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null; // pas de note claire (souffle, bruit…)

  // 4. Interpolation parabolique pour plus de précision
  let better = tau;
  if (tau > 1 && tau < maxTau) {
    const s0 = cmnd[tau - 1], s1 = cmnd[tau], s2 = cmnd[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) better = tau + (s2 - s0) / denom;
  }
  return { freq: sampleRate / better, clarity: 1 - cmnd[tau], rms };
}

export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

// Écart en cents entre la voix et la cible, ramené à la même octave
// (une voix d'homme qui chante une note écrite pour voix aiguë reste "juste")
export function centsFromTarget(freq, targetMidi) {
  let cents = (freqToMidi(freq) - targetMidi) * 100;
  let octave = 0;
  while (cents > 600) { cents -= 1200; octave++; }
  while (cents < -600) { cents += 1200; octave--; }
  return { cents, octave };
}

// ---------- Micro ----------
let stream = null, analyser = null, buf = null, sampleRate = 44100;

export const micSupported = () =>
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext !== false;

// Renvoie 'ok' | 'denied' | 'no_device' | 'unsupported' | 'error'
export async function startMic() {
  if (analyser) return 'ok';
  if (!micSupported()) return 'unsupported';
  const ac = unlockAudio();
  if (!ac) return 'unsupported';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
  } catch (err) {
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) return 'denied';
    if (err && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) return 'no_device';
    return 'error';
  }
  const source = ac.createMediaStreamSource(stream);
  analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser); // pas relié aux haut-parleurs : pas d'écho
  buf = new Float32Array(analyser.fftSize);
  sampleRate = ac.sampleRate;
  return 'ok';
}

export function readPitch() {
  if (!analyser) return null;
  analyser.getFloatTimeDomainData(buf);
  return detectPitch(buf, sampleRate);
}

export function stopMic() {
  if (stream) stream.getTracks().forEach((tr) => tr.stop());
  stream = null; analyser = null; buf = null;
}

// Choix de l'élève pour cette visite : 'mic' | 'self' | null (pas encore choisi)
let mode = null;
export const getSingMode = () => mode;
export const setSingMode = (m) => { mode = m; };
