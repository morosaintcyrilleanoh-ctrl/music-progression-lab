// =====================================================================
// Harmonie : théorie des accords (orthographe des notes, accords,
// degrés de la gamme majeure, renversements). Aucun son ici.
// =====================================================================

// Les 7 lettres (Do = 0) et leur hauteur en demi-tons
const LETTERS = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const LETTERS_EN = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ACC = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
const ACC_EN = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' };
const mod = (n, m) => ((n % m) + m) % m;

// Une note « écrite » : { letter (0-6), acc (-2..2) }
export const spell = (n) => LETTERS[n.letter] + ACC[n.acc];
export const spellEn = (n) => LETTERS_EN[n.letter] + ACC_EN[n.acc];
export const pcOf = (n) => mod(LETTER_PC[n.letter] + n.acc, 12);

// Les 12 notes de départ proposées (orthographe usuelle)
export const ROOTS = [
  { letter: 0, acc: 0 }, { letter: 0, acc: 1 }, { letter: 1, acc: 0 }, { letter: 2, acc: -1 },
  { letter: 2, acc: 0 }, { letter: 3, acc: 0 }, { letter: 3, acc: 1 }, { letter: 4, acc: 0 },
  { letter: 5, acc: -1 }, { letter: 5, acc: 0 }, { letter: 6, acc: -1 }, { letter: 6, acc: 0 },
];
export const WHITE_ROOTS = ROOTS.filter((r) => r.acc === 0);
// Ordre du cycle des quintes (Do, Sol, Ré, La, Mi, Si, Fa♯, Ré♭, La♭, Mi♭, Si♭, Fa)
export const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5].map((pc) =>
  pc === 1 ? { letter: 1, acc: -1 } : ROOTS.find((r) => pcOf(r) === pc));
export const rootKey = (n) => `${n.letter}${n.acc}`;
export const rootFromKey = (k) => ROOTS.find((r) => rootKey(r) === k) ?? (k === '1-1' ? { letter: 1, acc: -1 } : null);

// Note située `semis` demi-tons et `steps` lettres au-dessus de `root`
export function above(root, semis, steps) {
  const letter = mod(root.letter + steps, 7);
  const acc = mod(pcOf(root) + semis - LETTER_PC[letter] + 6, 12) - 6;
  return { letter, acc };
}

// Intervalles : [demi-tons, écart de lettres]
export const INTERVALS = {
  '2m': [1, 1], '2M': [2, 1], '3m': [3, 2], '3M': [4, 2], '4': [5, 3], 'triton': [6, 3],
  '5': [7, 4], '6m': [8, 5], '6M': [9, 5], '7m': [10, 6], '7M': [11, 6], '8': [12, 7],
};

// Types d'accords : intervalles depuis la fondamentale [demi-tons, lettres], symbole, formule
export const CHORD_TYPES = {
  maj: { iv: [[0, 0], [4, 2], [7, 4]], sym: '', formula: '1 – 3 – 5' },
  min: { iv: [[0, 0], [3, 2], [7, 4]], sym: 'm', formula: '1 – ♭3 – 5' },
  dim: { iv: [[0, 0], [3, 2], [6, 4]], sym: '°', formula: '1 – ♭3 – ♭5' },
  aug: { iv: [[0, 0], [4, 2], [8, 4]], sym: '+', formula: '1 – 3 – ♯5' },
  sus2: { iv: [[0, 0], [2, 1], [7, 4]], sym: 'sus2', formula: '1 – 2 – 5' },
  sus4: { iv: [[0, 0], [5, 3], [7, 4]], sym: 'sus4', formula: '1 – 4 – 5' },
  6: { iv: [[0, 0], [4, 2], [7, 4], [9, 5]], sym: '6', formula: '1 – 3 – 5 – 6' },
  m6: { iv: [[0, 0], [3, 2], [7, 4], [9, 5]], sym: 'm6', formula: '1 – ♭3 – 5 – 6' },
  7: { iv: [[0, 0], [4, 2], [7, 4], [10, 6]], sym: '7', formula: '1 – 3 – 5 – ♭7' },
  maj7: { iv: [[0, 0], [4, 2], [7, 4], [11, 6]], sym: 'maj7', formula: '1 – 3 – 5 – 7' },
  m7: { iv: [[0, 0], [3, 2], [7, 4], [10, 6]], sym: 'm7', formula: '1 – ♭3 – 5 – ♭7' },
  m7b5: { iv: [[0, 0], [3, 2], [6, 4], [10, 6]], sym: 'm7♭5', formula: '1 – ♭3 – ♭5 – ♭7' },
  dim7: { iv: [[0, 0], [3, 2], [6, 4], [9, 6]], sym: '°7', formula: '1 – ♭3 – ♭5 – 𝄫7' },
  9: { iv: [[0, 0], [4, 2], [7, 4], [10, 6], [14, 1]], sym: '9', formula: '1 – 3 – 5 – ♭7 – 9' },
  m9: { iv: [[0, 0], [3, 2], [7, 4], [10, 6], [14, 1]], sym: 'm9', formula: '1 – ♭3 – 5 – ♭7 – 9' },
  add9: { iv: [[0, 0], [4, 2], [7, 4], [14, 1]], sym: 'add9', formula: '1 – 3 – 5 – 9' },
};
// Ordre d'affichage (les noms « 6 », « 7 », « 9 » seraient sinon rangés en premier)
export const TYPE_IDS = ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '6', 'm6', '7', 'maj7', 'm7', 'm7b5', 'dim7', '9', 'm9', 'add9'];

// Un accord : notes écrites et hauteurs (MIDI) à partir d'une fondamentale `rootMidi`
export function chord(root, type, rootMidi = 60 + pcOf(root)) {
  const iv = CHORD_TYPES[type].iv;
  return {
    root, type,
    names: iv.map(([s, l]) => spell(above(root, s, l))),
    pcs: iv.map(([s]) => mod(pcOf(root) + s, 12)),
    midis: iv.map(([s]) => rootMidi + s),
    symbol: spellEn(root) + CHORD_TYPES[type].sym,
  };
}

// Renversement n : les n notes les plus graves montent d'une octave
export function invert(midis, n) {
  const out = [...midis].sort((a, b) => a - b);
  for (let i = 0; i < n; i++) out.push(out.shift() + 12);
  return out;
}

// Gamme majeure : degrés 1 à 7 → accord de 3 ou 4 sons
const MAJOR = [[0, 0], [2, 1], [4, 2], [5, 3], [7, 4], [9, 5], [11, 6]];
export const DEGREE_TRIADS = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
export const DEGREE_SEVENTHS = ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'];
export const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
export const ROMAN7 = ['Imaj7', 'iim7', 'iiim7', 'IVmaj7', 'V7', 'vim7', 'viim7♭5'];
export const degreeRoot = (key, d) => above(key, MAJOR[d - 1][0], MAJOR[d - 1][1]);
export const scaleNames = (key) => MAJOR.map(([s, l]) => spell(above(key, s, l)));
// Accord du degré d dans la tonalité `key`, joué autour du Do central
export function degreeChord(key, d, { seventh = false } = {}) {
  const r = degreeRoot(key, d);
  const kpc = pcOf(key);
  const base = 48 + kpc + (kpc > 5 ? 0 : 12); // tonique entre Fa3 et Mi4
  const midi = base + MAJOR[d - 1][0];
  return chord(r, (seventh ? DEGREE_SEVENTHS : DEGREE_TRIADS)[d - 1], midi > 67 ? midi - 12 : midi);
}
// Version jouée : basse + accord (comme au piano main gauche / main droite)
export const voiced = (c) => [c.midis[0] - 12, ...c.midis];

// Tonalités majeures « simples » utilisées dans les exercices
export const EASY_KEYS = [
  { letter: 0, acc: 0 }, { letter: 4, acc: 0 }, { letter: 3, acc: 0 }, { letter: 1, acc: 0 },
  { letter: 6, acc: -1 }, { letter: 5, acc: 0 }, { letter: 2, acc: -1 },
];
