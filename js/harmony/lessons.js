// =====================================================================
// Harmonie : 8 leçons, chacune avec une série d'exercices sur 3 niveaux
// (niveau 1 et 2 : théorie avec le son, niveau 3 : à l'oreille).
// Chaque leçon : { id, icon, levels, questions, examples, quiz(level) → question }
// Les questions suivent le format de runQuiz (js/ear/engine.js).
// =====================================================================
import { t } from '../i18n.js';
import { playNote, sleep } from '../audio.js';
import { pick, randInt } from '../music.js';
import { shuffled } from '../ear/engine.js';
import { playChords } from '../ear/sounds.js';
import {
  spell, pcOf, above, chord, invert, voiced, rootKey, INTERVALS, CHORD_TYPES, ROOTS, WHITE_ROOTS, EASY_KEYS,
  ROMAN, ROMAN7, degreeChord, degreeRoot,
} from './theory.js';

const H = (k, v) => t('harm.' + k, v);
export const typeName = (type) => t('chords.types')[type];
// « mineur 7 (m7) » : nom + symbole pour les accords de 4 sons et plus
export const typeLabel = (type) => (CHORD_TYPES[type].iv.length > 3 && !/^add/.test(CHORD_TYPES[type].sym) ? `${typeName(type)} (${CHORD_TYPES[type].sym})` : typeName(type));
export const chordName = (c) => `${spell(c.root)} ${typeName(c.type)}`;
export const chordShort = (c) => spell(c.root) + CHORD_TYPES[c.type].sym;
export const chordLabel = (c) => `${chordName(c)} (${c.symbol})`;
export const notesLine = (names) => names.join(' – ');

// Choix : la bonne réponse + jusqu'à n-1 autres, dans le désordre
function choices(answer, pool, labelOf, n = 4) {
  const others = shuffled(pool.filter((v) => String(v) !== String(answer))).slice(0, n - 1);
  return shuffled([answer, ...others]).map((v) => ({ value: String(v), label: labelOf(v), text: labelOf(v) }));
}

// ---------- Sons ----------
const midiOf = (root, low = 55) => low + ((pcOf(root) - low) % 12 + 12) % 12; // fondamentale entre Sol3 et Fa♯4
export async function hearChord(midis, { arp = true } = {}) {
  if (arp) {
    midis.forEach((m, i) => playNote(m, { when: i * 0.32, duration: 0.6, volume: 0.42 }));
    await sleep(midis.length * 320 + 150);
  }
  await playChords([midis], 1.6);
}
const hearTwo = async (a, b) => {
  playNote(a, { duration: 0.8 }); playNote(b, { when: 0.8, duration: 0.8 });
  playNote(a, { when: 1.7, duration: 1.2, volume: 0.38 }); playNote(b, { when: 1.7, duration: 1.2, volume: 0.38 });
  await sleep(3200);
};
const hearDegrees = (key, degrees, opts) => playChords(degrees.map((d) => voiced(degreeChord(key, d, opts))), 1.1);

// ---------- 1. Intervalles ----------
const IV_LEVELS = [['3m', '3M', '4', '5'], ['2M', '3m', '3M', '4', '5', '6m', '6M', '8'], Object.keys(INTERVALS)];
function intervalQ(level) {
  const list = IV_LEVELS[level - 1];
  const name = pick(list);
  const root = level === 1 ? pick(WHITE_ROOTS) : pick(ROOTS);
  const [s, l] = INTERVALS[name];
  const top = above(root, s, l);
  const low = midiOf(root);
  const ear = level === 3;
  const play = () => hearTwo(low, low + s);
  return {
    prompt: ear ? H('q_iv_ear') : H('q_iv', { a: spell(root), b: spell(top) }),
    play, answer: name, choices: choices(name, list, (v) => H('iv')[v]),
    explain: () => H('iv_why', { a: spell(root), b: spell(top), name: H('iv')[name], n: s }),
    compare: (v) => hearTwo(low, low + INTERVALS[v][0]), tip: H('tip_iv'),
  };
}

// ---------- 2. Construire un accord ----------
const BASIC = ['maj', 'min', 'dim', 'aug'];
function buildQ(level) {
  const root = level === 1 ? pick(WHITE_ROOTS) : pick(ROOTS);
  const type = level === 1 ? pick(['maj', 'min']) : pick(BASIC);
  const c = chord(root, type, midiOf(root));
  const play = () => hearChord(voiced(c));
  const why = () => H('build_why', { name: chordName(c), notes: notesLine(c.names), f: CHORD_TYPES[type].formula, recipe: H('recipe')[type] });
  const compare = (v) => hearChord(voiced(chord(root, v, midiOf(root))));
  if (level === 1) {
    return {
      prompt: H('q_build_notes', { name: chordName(c) }), play, answer: type,
      choices: choices(type, BASIC, (v) => notesLine(chord(root, v).names)), explain: why, compare, tip: H('tip_build'),
    };
  }
  return {
    prompt: level === 2 ? H('q_build_name', { notes: notesLine(c.names) }) : H('q_build_ear'),
    play, answer: type, choices: choices(type, BASIC, (v) => (level === 2 ? `${spell(root)} ${typeName(v)}` : typeLabel(v))),
    explain: why, compare, tip: H('tip_build'),
  };
}

// ---------- 3. Les accords d'une gamme ----------
function degreesQ(level) {
  const key = level === 1 ? EASY_KEYS[0] : pick(EASY_KEYS);
  const d = randInt(1, 7);
  const c = degreeChord(key, d);
  const play = () => hearDegrees(key, [1, d]);
  const why = () => H('degree_why', { key: spell(key), roman: ROMAN[d - 1], name: chordName(c), notes: notesLine(c.names) });
  if (level < 3) {
    // Mauvaises réponses : même fondamentale avec une autre couleur, ou un autre degré
    const pool = [...new Set([...BASIC.slice(0, 3).map((ty) => `${rootKey(c.root)}|${ty}`), ...[1, 2, 3, 4, 5, 6, 7].filter((x) => x !== d).map((x) => {
      const o = degreeChord(key, x); return `${rootKey(o.root)}|${o.type}`;
    })])];
    const answer = `${rootKey(c.root)}|${c.type}`;
    const byValue = (v) => { const [rk, ty] = v.split('|'); const r = [c.root, ...[1, 2, 3, 4, 5, 6, 7].map((x) => degreeRoot(key, x))].find((x) => rootKey(x) === rk); return chordLabel(chord(r, ty)); };
    const top = shuffled(pool.filter((v) => v !== answer)).slice(0, 3);
    return {
      prompt: H('q_degree', { key: spell(key), roman: ROMAN[d - 1] }), play, answer,
      choices: shuffled([answer, ...top]).map((v) => ({ value: v, label: byValue(v), text: byValue(v) })), explain: why, tip: H('tip_degree'),
    };
  }
  return {
    prompt: H('q_degree_rev', { key: spell(key), name: chordName(c) }), play, answer: d,
    choices: choices(d, [1, 2, 3, 4, 5, 6, 7], (v) => ROMAN[v - 1]), explain: why, tip: H('tip_degree'),
  };
}

// ---------- 4. Fonctions ----------
const FUNC = { 1: 'T', 2: 'SD', 3: 'T', 4: 'SD', 5: 'D', 6: 'T', 7: 'D' };
function functionQ(level) {
  const key = level === 1 ? EASY_KEYS[0] : pick(EASY_KEYS);
  const d = level === 3 ? pick([1, 4, 5]) : pick([1, 2, 4, 5, 6, 7]);
  const f = FUNC[d];
  const c = degreeChord(key, d);
  const play = () => hearDegrees(key, [1, 4, 5, 1, d]);
  const prompt = level === 1 ? H('q_func', { roman: ROMAN[d - 1] })
    : level === 2 ? H('q_func_key', { key: spell(key), name: chordName(c) }) : H('q_func_ear');
  return {
    prompt, play: level === 3 ? () => hearDegrees(key, [1, d]) : play, answer: f,
    choices: choices(f, ['T', 'SD', 'D'], (v) => H('func')[v], 3),
    explain: () => H('func_why', { roman: ROMAN[d - 1], name: chordName(c), f: H('func')[f], why: H('func_feel')[f] }),
    compare: level === 3 ? (v) => hearDegrees(key, [1, { T: 1, SD: 4, D: 5 }[v]]) : undefined, tip: H('tip_func'),
  };
}

// ---------- 5. Renversements ----------
function inversionQ(level) {
  const root = level === 1 ? pick(WHITE_ROOTS) : pick(ROOTS);
  const type = level === 1 ? 'maj' : pick(['maj', 'min']);
  const c = chord(root, type, midiOf(root, 53));
  const n = randInt(0, 2);
  const names = [...c.names.slice(n), ...c.names.slice(0, n)];
  const midis = invert(c.midis, n);
  const play = () => hearChord(midis);
  const why = () => H('inv_why', { name: chordName(c), inv: H('inv')[n], notes: notesLine(names), bass: names[0], role: H('bass_role')[n] });
  if (level === 2 && Math.random() < 0.5) {
    return {
      prompt: H('q_inv_bass', { inv: H('inv')[n], name: chordName(c) }), play, answer: c.names[n],
      choices: choices(c.names[n], c.names, (v) => v, 3), explain: why, tip: H('tip_inv'),
    };
  }
  return {
    prompt: level === 3 ? H('q_inv_ear') : H('q_inv', { notes: notesLine(names), name: chordName(c) }), play, answer: n,
    choices: choices(n, [0, 1, 2], (v) => H('inv')[v], 3), explain: why,
    compare: (v) => hearChord(invert(c.midis, Number(v))), tip: H('tip_inv'),
  };
}

// ---------- 6. Cadences ----------
const CADENCES = { parfaite: [5, 1], plagale: [4, 1], demi: [4, 5], rompue: [5, 6] };
function cadenceQ(level) {
  const key = level === 1 ? EASY_KEYS[0] : pick(EASY_KEYS);
  const name = pick(Object.keys(CADENCES));
  const [a, b] = CADENCES[name];
  const play = () => hearDegrees(key, [1, a, b]);
  const prompt = level === 1 ? H('q_cad', { a: ROMAN[a - 1], b: ROMAN[b - 1] })
    : level === 2 ? H('q_cad_key', { key: spell(key), a: chordShort(degreeChord(key, a)), b: chordShort(degreeChord(key, b)) }) : H('q_cad_ear');
  return {
    prompt, play, answer: name, choices: choices(name, Object.keys(CADENCES), (v) => H('cad')[v]),
    explain: () => H('cad_why', { name: H('cad')[name], a: ROMAN[a - 1], b: ROMAN[b - 1], why: H('cad_feel')[name] }),
    compare: (v) => hearDegrees(key, [1, ...CADENCES[v]]), tip: H('tip_cad'),
  };
}

// ---------- 7. Progressions célèbres ----------
const PROGRESSIONS = { pop: [1, 5, 6, 4], jazz: [2, 5, 1], rock: [1, 4, 5, 1], annees50: [1, 6, 4, 5] };
const progRoman = (p) => PROGRESSIONS[p].map((d) => ROMAN[d - 1]).join(' – ');
const progChords = (key, p) => PROGRESSIONS[p].map((d) => chordShort(degreeChord(key, d))).join(' – ');
function progressionQ(level) {
  const key = level === 1 ? EASY_KEYS[0] : pick(EASY_KEYS);
  const p = pick(Object.keys(PROGRESSIONS));
  const play = () => hearDegrees(key, PROGRESSIONS[p]);
  const list = Object.keys(PROGRESSIONS);
  const why = () => H('prog_why', { roman: progRoman(p), key: spell(key), chords: progChords(key, p), style: H('prog')[p] });
  if (level < 3) {
    return {
      prompt: H('q_prog', { key: spell(key), roman: progRoman(p) }), play, answer: p,
      choices: choices(p, list, (v) => progChords(key, v)), explain: why, tip: H('tip_prog'),
    };
  }
  return {
    prompt: H('q_prog_ear'), play, answer: p, choices: choices(p, list, (v) => `${progRoman(v)} (${H('prog')[v]})`),
    explain: why, compare: (v) => hearDegrees(key, PROGRESSIONS[v]), tip: H('tip_prog'),
  };
}

// ---------- 8. Accords de 7e ----------
const SEVENTHS = ['maj7', '7', 'm7', 'm7b5'];
function seventhQ(level) {
  if (level === 2) {
    const key = pick(EASY_KEYS);
    const d = randInt(1, 7);
    const c = degreeChord(key, d, { seventh: true });
    return {
      prompt: H('q_7_degree', { key: spell(key), roman: ROMAN[d - 1] }), play: () => hearDegrees(key, [1, d], { seventh: true }), answer: c.type,
      choices: choices(c.type, SEVENTHS, (v) => chordLabel(chord(c.root, v))),
      explain: () => H('seventh_degree_why', { key: spell(key), roman: ROMAN7[d - 1], name: chordName(c), notes: notesLine(c.names) }), tip: H('tip_7'),
    };
  }
  const root = level === 1 ? pick(WHITE_ROOTS) : pick(ROOTS);
  const type = level === 1 ? pick(['maj7', '7', 'm7']) : pick(SEVENTHS);
  const c = chord(root, type, midiOf(root, 53));
  const why = () => H('build_why', { name: chordName(c), notes: notesLine(c.names), f: CHORD_TYPES[type].formula, recipe: H('recipe')[type] });
  return {
    prompt: level === 1 ? H('q_build_notes', { name: chordName(c) }) : H('q_7_ear'), play: () => hearChord(voiced(c)), answer: type,
    choices: choices(type, SEVENTHS, (v) => (level === 1 ? notesLine(chord(root, v).names) : typeLabel(v))), explain: why,
    compare: (v) => hearChord(voiced(chord(root, v, midiOf(root, 53)))), tip: H('tip_7'),
  };
}

// ---------- Exemples sonores des leçons (boutons « Écouter ») ----------
const C = EASY_KEYS[0];
const ex = (label, fn) => ({ label, play: fn });
const exChord = (type, root = C) => () => hearChord(voiced(chord(root, type, midiOf(root, 53))));

export const LESSONS = [
  { id: 'harmonie-intervalles', icon: '1️⃣', levels: 3, questions: 8, quiz: intervalQ,
    examples: () => [ex(H('ex.3M'), () => hearTwo(60, 64)), ex(H('ex.3m'), () => hearTwo(60, 63)), ex(H('ex.5'), () => hearTwo(60, 67)), ex(H('ex.8'), () => hearTwo(60, 72))] },
  { id: 'harmonie-accords', icon: '2️⃣', levels: 3, questions: 8, quiz: buildQ,
    examples: () => BASIC.map((ty) => ex(`Do ${typeName(ty)}`, exChord(ty))) },
  { id: 'harmonie-degres', icon: '3️⃣', levels: 3, questions: 8, quiz: degreesQ,
    examples: () => [ex(H('ex.scale_chords'), () => hearDegrees(C, [1, 2, 3, 4, 5, 6, 7, 1]))] },
  { id: 'harmonie-fonctions', icon: '4️⃣', levels: 3, questions: 8, quiz: functionQ,
    examples: () => [ex(H('ex.func_rest'), () => hearDegrees(C, [1, 4, 5, 1])), ex(H('ex.func_tension'), () => hearDegrees(C, [1, 4, 5]))] },
  { id: 'harmonie-renversements', icon: '5️⃣', levels: 3, questions: 8, quiz: inversionQ,
    examples: () => [0, 1, 2].map((n) => ex(H('inv')[n], () => hearChord(invert(chord(C, 'maj', 60).midis, n)))) },
  { id: 'harmonie-cadences', icon: '6️⃣', levels: 3, questions: 8, quiz: cadenceQ,
    examples: () => Object.keys(CADENCES).map((k) => ex(H('cad')[k], () => hearDegrees(C, [1, ...CADENCES[k]]))) },
  { id: 'harmonie-progressions', icon: '7️⃣', levels: 3, questions: 8, quiz: progressionQ,
    examples: () => Object.keys(PROGRESSIONS).map((k) => ex(`${progRoman(k)} · ${H('prog')[k]}`, () => hearDegrees(C, PROGRESSIONS[k]))) },
  { id: 'harmonie-septiemes', icon: '8️⃣', levels: 3, questions: 8, quiz: seventhQ,
    examples: () => ['maj7', '7', 'm7', 'm7b5'].map((ty) => ex(`Do ${typeName(ty)}`, exChord(ty))) },
];
export const lessonById = (id) => LESSONS.find((l) => l.id === id);
