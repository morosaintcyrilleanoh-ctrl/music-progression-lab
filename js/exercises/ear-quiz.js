// =====================================================================
// Exercices d'oreille : intervalles, accords, gammes, degrés, suites d'accords.
// Un seul moteur, réglé par params.mode et params.level.
// Réussir un niveau à 80 % ou plus débloque le niveau suivant.
// =====================================================================
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { playNote, playBass, sleep } from '../audio.js';
import {
  randInt, pick, noteName, INTERVAL_NAMES_FR, CHORDS, SCALES, MAJOR_STEPS, diatonicTriad
} from '../music.js';
import { askChoice, feedback, next, counter, set, waitAction } from './common.js';
import { unlockEarLevel } from '../data.js';

// ---------- Contenu de chaque niveau ----------
export const EAR_LEVELS = {
  interval: [
    { choices: [2, 4, 7, 12], dir: 'up' },
    { choices: [2, 3, 4, 5, 7, 12], dir: 'up' },
    { choices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], dir: 'up' },
    { choices: [2, 3, 4, 5, 7, 9, 12], dir: 'down' },
    { choices: [3, 4, 5, 7, 8, 9, 12], dir: 'harm' }
  ],
  chord: [
    { choices: ['maj', 'min'] },
    { choices: ['maj', 'min', 'dim', 'aug'] },
    { choices: ['dom7', 'maj7', 'min7'] },
    { choices: ['maj', 'min', 'dim', 'aug', 'sus4', 'dom7', 'maj7', 'min7'] },
    { choices: ['inv0', 'inv1', 'inv2'], inversions: true }
  ],
  scale: [
    { choices: ['majeure', 'mineure'] },
    { choices: ['majeure', 'mineure', 'penta_maj', 'penta_min'] },
    { choices: ['majeure', 'mineure', 'mineure_harm', 'blues', 'penta_min'] },
    { choices: ['majeure', 'mineure', 'dorien', 'mixolydien', 'mineure_harm'] }
  ],
  degree: [
    { choices: [1, 3, 5] },
    { choices: [1, 2, 3, 4, 5] },
    { choices: [1, 2, 3, 4, 5, 6, 7] }
  ],
  progression: [
    { choices: [4, 5], next: true },
    { choices: [2, 4, 5, 6], next: true },
    { choices: ['I-IV-V-I', 'I-V-vi-IV', 'ii-V-I', 'I-vi-IV-V'] },
    { choices: ['I-IV-V-I', 'I-V-vi-IV', 'ii-V-I', 'I-vi-IV-V', 'vi-IV-I-V', 'I-IV-V-vi'] }
  ]
};
export const EAR_MODES = Object.keys(EAR_LEVELS);
export const maxLevel = (mode) => EAR_LEVELS[mode]?.length ?? 1;

const ROMAN = { I: 1, ii: 2, iii: 3, IV: 4, V: 5, vi: 6 };
const ROMAN_OF = { 1: 'I', 2: 'ii', 3: 'iii', 4: 'IV', 5: 'V', 6: 'vi', 7: 'vii°' };
const KEYS = [60, 62, 55, 57, 52]; // Do, Ré, Sol, La, Mi : tonalités sans bémol (noms de notes exacts)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const progLabel = (p) => p.split('-').join(' – ');

// ---------- Petits outils de son ----------
function chordAt(notes, { when = 0, duration = 1, bass = null, volume = 0.22 } = {}) {
  notes.forEach((n) => playNote(n, { when, duration, volume }));
  if (bass !== null) playBass(bass, { when, duration: duration * 0.95 });
}
function chordName(tonic, degree) {
  const root = noteName(tonic + MAJOR_STEPS[degree - 1]);
  return [2, 3, 6].includes(degree) ? `${root}m` : root;
}

// ---------- Fabrique une question (son + réponses possibles) ----------
function makeQuestion(mode, cfg, prev) {
  let answer = pick(cfg.choices);
  if (answer === prev && cfg.choices.length > 2) answer = pick(cfg.choices); // évite trop de répétitions
  const T = t('ear');

  if (mode === 'interval') {
    const base = randInt(53, 64);
    const sound = async (semis) => {
      if (cfg.dir === 'harm') {
        playNote(base, { duration: 1.4, volume: 0.35 }); playNote(base + semis, { duration: 1.4, volume: 0.35 });
        await sleep(1700);
      } else {
        const [a, b] = cfg.dir === 'down' ? [base + semis, base] : [base, base + semis];
        playNote(a, { duration: 0.8 }); await sleep(900); playNote(b, { duration: 0.9 }); await sleep(1100);
      }
    };
    const label = (v) => cap(INTERVAL_NAMES_FR[v]);
    const tip = cfg.dir === 'down' ? T.tip_down : cfg.dir === 'harm' ? T.tip_harm : (T.interval[answer].s ? `Repère : ${T.interval[answer].s}` : null);
    return {
      answer, prompt: T.prompt.interval, sound, label, describe: (v) => T.interval[v].d, tip,
      detail: { note_depart: noteName(base), sens: cfg.dir }
    };
  }

  if (mode === 'chord') {
    const root = randInt(53, 62);
    const sound = async (key) => {
      const notes = CHORDS[key].notes.map((n) => root + n);
      chordAt(notes, { duration: 1.3, volume: 0.24 });
      await sleep(1500);
      notes.forEach((n, i) => playNote(n, { when: i * 0.38, duration: 0.6, volume: 0.35 }));
      await sleep(notes.length * 380 + 500);
    };
    return {
      answer, prompt: cfg.inversions ? T.prompt.chord_inv : T.prompt.chord, sound,
      label: (k) => CHORDS[k].name, describe: (k) => T.chord[k], tip: T.tip_chord,
      detail: { fondamentale: noteName(root) }
    };
  }

  if (mode === 'scale') {
    const root = randInt(55, 62);
    const sound = async (key) => {
      const steps = SCALES[key].steps;
      steps.forEach((s, i) => playNote(root + s, { when: i * 0.36, duration: 0.42, volume: 0.4 }));
      await sleep(steps.length * 360 + 600);
    };
    return {
      answer, prompt: T.prompt.scale, sound, label: (k) => SCALES[k].name, describe: (k) => T.scale[k],
      tip: T.tip_scale, detail: { tonique: noteName(root) }
    };
  }

  if (mode === 'degree') {
    const tonic = pick(KEYS);
    const cadence = async () => {
      [1, 4, 5, 1].forEach((d, i) => { const c = diatonicTriad(tonic, d); chordAt(c.notes, { when: i * 0.7, duration: 0.65, bass: c.bass }); });
      await sleep(4 * 700 + 500);
    };
    let first = true;
    const sound = async (deg) => {
      if (first) { await cadence(); first = false; } // la tonalité complète au début de la question
      else { const c = diatonicTriad(tonic, 1); chordAt(c.notes, { duration: 0.8, bass: c.bass }); await sleep(1100); }
      playNote(tonic + MAJOR_STEPS[deg - 1], { duration: 1.2, volume: 0.5 });
      await sleep(1400);
    };
    return {
      answer, prompt: T.prompt.degree, sound, label: (d) => T.degree[d].n,
      describe: (d) => `${T.degree[d].d} (${noteName(tonic + MAJOR_STEPS[d - 1])} en ${noteName(tonic)} majeur)`,
      tip: T.tip_degree, detail: { tonalite: `${noteName(tonic)} majeur` },
      replay: async () => { first = true; await sound(answer); }
    };
  }

  // Suites d'accords
  const tonic = pick(KEYS);
  const degreesOf = (v) => (cfg.next ? [1, v] : v.split('-').map((r) => ROMAN[r]));
  const sound = async (v) => {
    const ds = degreesOf(v);
    const dur = cfg.next ? 1.1 : 0.95;
    ds.forEach((d, i) => { const c = diatonicTriad(tonic, d); chordAt(c.notes, { when: i * dur, duration: dur - 0.08, bass: c.bass }); });
    await sleep(ds.length * dur * 1000 + 500);
  };
  return {
    answer, prompt: cfg.next ? T.prompt.progression_next : T.prompt.progression, sound,
    label: (v) => (cfg.next ? ROMAN_OF[v] : progLabel(v)),
    describe: (v) => `${T.prog[v]} ${t('ear.in_key', { k: noteName(tonic) + ' majeur' })} (${degreesOf(v).map((d) => chordName(tonic, d)).join(' – ')})`,
    tip: T.tip_prog, detail: { tonalite: `${noteName(tonic)} majeur` }
  };
}

// ---------- Écran d'introduction : écouter chaque réponse possible ----------
async function intro(stage, mode, cfg, level, total) {
  const demo = makeQuestion(mode, cfg, null);
  set(stage, html`
    <p class="eyebrow">${t('ear.level_n', { n: level })} · ${t('ear.levels')[mode][level - 1]}</p>
    <h2 style="font-size:1.15rem;margin:0">${t('ear.intro_title')}</h2>
    <p class="muted" style="margin:0">${t('ear.intro_demo')}</p>
    <div class="ear-demo">
      ${cfg.choices.map((c) => html`<button class="btn btn-ghost btn-sm" type="button" data-demo="${c}">▶ ${demo.label(c)}</button>`)}
    </div>
    <button class="btn btn-lg btn-block" type="button" data-action="start">${t('ear.intro_start', { n: total })}</button>`);
  let busy = false;
  stage.querySelectorAll('[data-demo]').forEach((btn) => btn.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    stage.querySelectorAll('[data-demo]').forEach((b) => b.classList.toggle('is-picked', b === btn));
    const raw = btn.dataset.demo;
    const value = cfg.choices.find((c) => String(c) === raw);
    try { await demo.sound(value); } finally { busy = false; }
  }));
  await waitAction(stage, ['start'], { Enter: 'start' });
}

export default {
  assess: true,
  async run(stage, ctx) {
    const mode = EAR_LEVELS[ctx.params.mode] ? ctx.params.mode : 'interval';
    const level = Math.min(Math.max(1, Number(ctx.params.level) || 1), maxLevel(mode));
    const cfg = EAR_LEVELS[mode][level - 1];
    const total = ctx.params.questions ?? 10;
    const res = { total: 0, correct: 0, scoreSum: 0, done: 0 };
    const modeTitle = t('ear.modes')[mode].title;

    if (ctx.params.intro !== false) await intro(stage, mode, cfg, level, total);
    if (!document.contains(stage)) return res;

    set(stage, html`<div data-z="counter"></div><p class="ex-prompt" data-z="prompt"></p>
      <div data-z="answer"></div><div data-z="feedback"></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);

    let prev = null;
    for (let q = 1; q <= total; q++) {
      if (!document.contains(stage)) return res;
      counter(z('counter'), q, total);
      set(z('feedback'), '');
      const Q = makeQuestion(mode, cfg, prev);
      prev = Q.answer;
      z('prompt').textContent = Q.prompt;
      set(z('answer'), html`<p class="muted center">${t('ex.listening')}</p>`);
      await Q.sound(Q.answer);

      const choices = cfg.choices.map((c) => ({ value: String(c), label: Q.label(c) }));
      const { value, ms } = await askChoice(z('answer'), choices, { onReplay: Q.replay ?? (() => Q.sound(Q.answer)) });
      const picked = cfg.choices.find((c) => String(c) === value);
      const ok = picked === Q.answer;

      if (ok) {
        feedback(z('feedback'), { ok, title: `${t('ex.correct')} — ${Q.label(Q.answer)}`, text: Q.describe(Q.answer) });
      } else {
        feedback(z('feedback'), {
          ok, title: t('ear.wrong_title', { a: Q.label(Q.answer) }),
          text: `${t('ear.you_said', { b: Q.label(picked) })} ${Q.describe(Q.answer)}`, tip: Q.tip
        });
        // Comparer la bonne réponse et la réponse donnée
        const cmp = document.createElement('div');
        cmp.className = 'ear-compare';
        cmp.innerHTML = String(html`<span class="muted small">${t('ear.compare')}</span>
          <button class="btn btn-ghost btn-sm" type="button" data-cmp="good">${t('ear.hear_good')} · ${Q.label(Q.answer)}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-cmp="yours">${t('ear.hear_yours')} · ${Q.label(picked)}</button>`);
        let busy = false;
        cmp.querySelectorAll('[data-cmp]').forEach((b) => b.addEventListener('click', async () => {
          if (busy) return;
          busy = true;
          try { await Q.sound(b.dataset.cmp === 'good' ? Q.answer : picked); } finally { busy = false; }
        }));
        z('feedback').appendChild(cmp);
      }

      res.total++; res.done++; if (ok) res.correct++; res.scoreSum += ok ? 1 : 0;
      ctx.record({
        is_correct: ok, score: ok ? 1 : 0, response_ms: ms,
        error_type: ok ? null : t('ear.err', { mode: modeTitle, a: Q.label(Q.answer).toLowerCase(), b: Q.label(picked).toLowerCase() }),
        expected: { exercice: mode, niveau: level, reponse: String(Q.answer), ...Q.detail },
        answer: { reponse: value }
      });
      await next(z('feedback'), q === total ? t('ex.finish') : t('ex.next'));
    }

    // 80 % ou plus : le niveau suivant se débloque
    if (res.total > 0 && res.correct / res.total >= 0.8 && level < maxLevel(mode)) {
      try { await unlockEarLevel(mode, level + 1); res.unlocked = level + 1; } catch (err) { console.error(err); }
    }
    return res;
  }
};
