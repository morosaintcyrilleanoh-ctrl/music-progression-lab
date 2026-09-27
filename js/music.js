// =====================================================================
// Outils musicaux : notes, fréquences, intervalles
// Convention MIDI : 60 = Do central (Do4), 69 = La 440 Hz
// =====================================================================

export const NOTE_NAMES_FR = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const LETTER_TO_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteName(midi) {
  return NOTE_NAMES_FR[((midi % 12) + 12) % 12];
}

// "C", "F#", "Bb" -> numéro de note dans l'octave choisie
export function letterToMidi(letter, baseMidi) {
  const m = /^([A-G])([#b]?)$/.exec(letter);
  if (!m) return baseMidi;
  let pc = LETTER_TO_PC[m[1]];
  if (m[2] === '#') pc += 1;
  if (m[2] === 'b') pc -= 1;
  return baseMidi + pc;
}

// Octave de chant selon la voix choisie : grave = Do3, aiguë = Do4
export function voiceBase(voiceRange) {
  return voiceRange === 'grave' ? 48 : 60;
}

export const INTERVAL_NAMES_FR = {
  0: 'unisson', 1: 'seconde mineure', 2: 'seconde majeure', 3: 'tierce mineure', 4: 'tierce majeure',
  5: 'quarte juste', 6: 'triton', 7: 'quinte juste', 8: 'sixte mineure', 9: 'sixte majeure',
  10: 'septième mineure', 11: 'septième majeure', 12: 'octave'
};

// Petits outils de hasard
export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
