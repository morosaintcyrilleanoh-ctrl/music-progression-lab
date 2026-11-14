// =====================================================================
// Accords au piano : clavier qui montre un accord, et 4 entraînements
// (jouer l'accord, le reconnaître en voyant les notes, à l'oreille,
// les 12 tonalités). Même format que les activités de l'oreille.
// =====================================================================
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { playNote } from '../audio.js';
import { pick } from '../music.js';
import { askChoice, set, waitAction } from '../exercises/common.js';
import { keyboardHtml, shuffled } from '../ear/engine.js';
import { chord, voiced, rootKey, pcOf, ROOTS, WHITE_ROOTS, CIRCLE, TYPE_IDS } from './theory.js';
import { chordName, chordLabel, notesLine, typeLabel, hearChord } from './lessons.js';

const C = (k, v) => t('chords.' + k, v);
const mod12 = (n) => ((n % 12) + 12) % 12;

// Clavier assez large pour l'accord (2 octaves au moins, à partir d'un Do)
export function keyboardFor(midis) {
  const low = 12 * Math.floor(Math.min(...midis) / 12);
  const high = Math.max(low + 23, 12 * Math.ceil((Math.max(...midis) + 1) / 12) - 1);
  return { low, high, view: keyboardHtml(low, high, { names: false }) };
}
// Allume les touches de l'accord, avec le nom de chaque note
export function markKeys(root, midis, names = []) {
  root.querySelectorAll('.ear-key').forEach((k) => { k.classList.remove('is-on'); if (k.classList.contains('black')) k.textContent = ''; else k.querySelector('span').textContent = ''; });
  midis.forEach((m, i) => {
    const k = root.querySelector(`.ear-key[data-key="${m}"]`);
    if (!k) return;
    k.classList.add('is-on');
    const label = names[i] ?? '';
    if (k.classList.contains('black')) k.textContent = label; else k.querySelector('span').textContent = label;
  });
}
// Fondamentale autour du Do central (Fa3 à Mi4) pour que l'accord tienne sur le clavier
export const rootMidi = (r) => 53 + mod12(pcOf(r) - 53);

// Accords proposés selon le niveau
const LEVEL_TYPES = [['maj', 'min'], ['maj', 'min', 'dim', 'aug', 'sus4'], ['7', 'maj7', 'm7', 'm7b5'], TYPE_IDS];
const TOUR_TYPES = ['maj', 'min', '7', 'maj7'];

// L'élève touche les notes de l'accord (n'importe quelle octave), puis « Vérifier »
function playOnKeyboard(target) {
  return async (zone) => {
    const { view } = keyboardFor([60, 83]);
    set(zone, html`<p class="small muted center" style="margin:0 0 8px">${C('play_hint')}</p>
      <p class="center" data-picked style="min-height:1.6em;font-weight:700;margin:0 0 6px"></p>
      ${view}
      <div class="row" style="justify-content:center;margin-top:12px">
        <button class="btn btn-ghost btn-sm" type="button" data-action="clear">⌫ ${C('clear')}</button>
        <button class="btn" type="button" data-action="check" disabled>${t('earp.check')}</button>
      </div>`);
    const picked = new Set();
    const render = () => {
      zone.querySelectorAll('.ear-key').forEach((k) => k.classList.toggle('is-sel', picked.has(Number(k.dataset.key))));
      zone.querySelector('[data-picked]').textContent = [...picked].sort((a, b) => a - b).map((m) => noteOf(m, target)).join(' – ');
      zone.querySelector('[data-action="check"]').disabled = picked.size < 3;
    };
    const onKey = (e) => {
      const k = e.target.closest('[data-key]');
      if (!k || k.disabled) return;
      const m = Number(k.dataset.key);
      if (picked.has(m)) picked.delete(m); else { picked.add(m); playNote(m, { duration: 0.6 }); }
      render();
    };
    zone.addEventListener('click', onKey);
    for (;;) {
      const a = await waitAction(zone, ['clear', 'check'], { Enter: 'check' });
      if (a === 'clear') { picked.clear(); render(); continue; }
      if (picked.size >= 3) break;
    }
    zone.removeEventListener('click', onKey);
    zone.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const want = new Set(target.pcs);
    const got = new Set([...picked].map(mod12));
    const ok = got.size === want.size && [...want].every((p) => got.has(p));
    // Correction sur le clavier : bonnes notes allumées, notes en trop en rouge
    zone.querySelectorAll('.ear-key').forEach((k) => {
      const m = Number(k.dataset.key);
      k.classList.toggle('is-ko', picked.has(m) && !want.has(mod12(m)));
    });
    // Les bonnes notes, à partir de la fondamentale (la 9e se montre une octave plus bas)
    const rootM = 60 + target.pcs[0];
    markKeys(zone, target.pcs.map((p) => (60 + p < rootM ? 72 + p : 60 + p)), target.names);
    return { ok, given: [...picked].map((m) => noteOf(m, target)).join(' '), text: C('play_was', { name: chordName(target), notes: notesLine(target.names) }) };
  };
}
// Nom d'une touche : celui de l'accord si la note en fait partie (Mi♭ plutôt que Ré♯)
function noteOf(m, target) {
  const i = target.pcs.indexOf(mod12(m));
  return i >= 0 ? target.names[i] : ['Do', 'Do♯', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'][mod12(m)];
}

// Une question « joue l'accord » ; le son n'est donné qu'après la réponse
function playQuestion(c) {
  let answered = false;
  const ask = playOnKeyboard(c);
  return {
    prompt: C('q_play', { name: chordLabel(c) }),
    play: async () => { if (answered) await hearChord(voiced(c)); },
    ask: async (zone, o) => { const r = await ask(zone, o); answered = true; return r; },
  };
}
const randomChord = (level) => { const r = level === 1 ? pick(WHITE_ROOTS) : pick(ROOTS); const ty = pick(LEVEL_TYPES[level - 1]); return chord(r, ty, rootMidi(r)); };

// Reconnaître un accord dessiné sur le clavier
function seeQuestion(level) {
  const c = randomChord(level);
  const value = (x) => `${rootKey(x.root)}|${x.type}`;
  const pool = [...LEVEL_TYPES[level - 1].filter((ty) => ty !== c.type).map((ty) => chord(c.root, ty)), ...shuffled(ROOTS.filter((r) => rootKey(r) !== rootKey(c.root))).slice(0, 2).map((r) => chord(r, c.type))];
  const opts = shuffled([c, ...shuffled(pool).slice(0, 3)]).map((x) => ({ value: value(x), label: chordLabel(x), text: chordLabel(x) }));
  const Q = {
    prompt: C('q_see'), play: () => hearChord(voiced(c), { arp: false }),
    async ask(zone, { replay }) {
      const { view } = keyboardFor(c.midis);
      set(zone, html`${view}<div data-z="choices" style="margin-top:14px"></div>`);
      markKeys(zone, c.midis, level === 1 ? c.names : []);
      const { value: v } = await askChoice(zone.querySelector('[data-z="choices"]'), opts, { onReplay: replay });
      const ok = v === value(c);
      markKeys(zone, c.midis, c.names);
      const given = opts.find((o) => o.value === v)?.text ?? v;
      Q.title = ok ? `${t('ex.correct')} — ${chordLabel(c)}` : t('ear.wrong_title', { a: chordLabel(c) });
      return { ok, given, text: `${ok ? '' : t('ear.you_said', { b: given }) + ' '}${C('see_why', { name: chordName(c), notes: notesLine(c.names) })}` };
    },
  };
  return Q;
}

// À l'oreille : quelle couleur d'accord ?
const EAR_TYPES = [['maj', 'min'], ['maj', 'min', 'dim', 'aug'], ['maj7', '7', 'm7'], ['maj7', '7', 'm7', 'm7b5', 'dim7', 'sus4']];
function earQuestion(level) {
  const r = pick(ROOTS);
  const list = EAR_TYPES[level - 1];
  const type = pick(list);
  const make = (ty) => chord(r, ty, rootMidi(r));
  const c = make(type);
  return {
    prompt: C('q_ear'), play: () => hearChord(voiced(c)), answer: type,
    choices: shuffled(list).map((ty) => ({ value: ty, label: typeLabel(ty), text: typeLabel(ty) })),
    explain: () => C('ear_why', { name: chordName(c), notes: notesLine(c.names), feel: C('feel')[type] ?? '' }),
    compare: (ty) => hearChord(voiced(make(ty))), tip: C('tip_ear'),
  };
}

export const PRACTICE = [
  { id: 'accords-jouer', icon: '👆', levels: 4, questions: 8, quiz: (level) => playQuestion(randomChord(level)) },
  { id: 'accords-nom', icon: '👀', levels: 4, questions: 8, quiz: seeQuestion },
  { id: 'accords-oreille', icon: '👂', levels: 4, questions: 8, quiz: earQuestion },
  // Les 12 accords d'un type, dans l'ordre du cycle des quintes
  { id: 'accords-tonalites', icon: '📈', levels: 4, questions: 12, ordered: true,
    quiz: (level, q) => { const r = CIRCLE[(q - 1) % 12]; return playQuestion(chord(r, TOUR_TYPES[level - 1], rootMidi(r))); } },
];
export const practiceById = (id) => PRACTICE.find((p) => p.id === id);
