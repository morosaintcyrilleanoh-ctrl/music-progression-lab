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

// ---------------------------------------------------------------------
// Théorie pour les exercices d'oreille (intervalles, accords, gammes…)
// ---------------------------------------------------------------------

// Formules d'accords (en demi-tons au-dessus de la fondamentale)
export const CHORDS = {
  maj: { name: 'Majeur', notes: [0, 4, 7] },
  min: { name: 'Mineur', notes: [0, 3, 7] },
  dim: { name: 'Diminué', notes: [0, 3, 6] },
  aug: { name: 'Augmenté', notes: [0, 4, 8] },
  sus4: { name: 'Suspendu (sus4)', notes: [0, 5, 7] },
  dom7: { name: 'Septième (7)', notes: [0, 4, 7, 10] },
  maj7: { name: 'Majeur 7 (maj7)', notes: [0, 4, 7, 11] },
  min7: { name: 'Mineur 7 (m7)', notes: [0, 3, 7, 10] },
  inv0: { name: 'État fondamental', notes: [0, 4, 7] },
  inv1: { name: '1er renversement', notes: [4, 7, 12] },
  inv2: { name: '2e renversement', notes: [7, 12, 16] }
};

// Gammes (en demi-tons, octave comprise)
export const SCALES = {
  majeure: { name: 'Majeure', steps: [0, 2, 4, 5, 7, 9, 11, 12] },
  mineure: { name: 'Mineure naturelle', steps: [0, 2, 3, 5, 7, 8, 10, 12] },
  penta_maj: { name: 'Pentatonique majeure', steps: [0, 2, 4, 7, 9, 12] },
  penta_min: { name: 'Pentatonique mineure', steps: [0, 3, 5, 7, 10, 12] },
  mineure_harm: { name: 'Mineure harmonique', steps: [0, 2, 3, 5, 7, 8, 11, 12] },
  blues: { name: 'Blues', steps: [0, 3, 5, 6, 7, 10, 12] },
  dorien: { name: 'Mode dorien', steps: [0, 2, 3, 5, 7, 9, 10, 12] },
  mixolydien: { name: 'Mode mixolydien', steps: [0, 2, 4, 5, 7, 9, 10, 12] }
};

export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

// Accord de 3 sons construit sur un degré (1 à 7) de la gamme majeure
export function diatonicTriad(tonic, degree) {
  const idx = (n) => tonic + MAJOR_STEPS[n % 7] + 12 * Math.floor(n / 7);
  const d = degree - 1;
  let notes = [idx(d), idx(d + 2), idx(d + 4)];
  if (notes[0] > tonic + 5) notes = notes.map((n) => n - 12); // reste dans une zone confortable
  let bass = tonic - 12 + MAJOR_STEPS[d];
  if (bass > tonic - 6) bass -= 12;
  return { notes, bass };
}
