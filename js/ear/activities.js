// =====================================================================
// Oreille+ : les activités (écoute, voix, rythme)
// Chaque activité : { id, cat, icon, levels, quiz(level) → question } pour
// les séries de questions, ou { run(stage, { level }) → { correct, total } }.
// =====================================================================
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { playNote, playClick, sleep, now, unlockAudio } from '../audio.js';
import { pick, randInt, diatonicTriad, INTERVAL_NAMES_FR, voiceBase } from '../music.js';
import { EAR_LEVELS, makeQuestion as earQuestion } from '../exercises/ear-quiz.js';
import { chooseMode, singWithMic, micFeedbackText } from '../exercises/sing.js';
import { getLatency } from '../exercises/rhythm.js';
import { askChoice, feedback, next, set, waitAction } from '../exercises/common.js';
import { runQuiz, keyboardDictation, staffSvg, rhythmSvg, CELLS, shuffled, noteFr } from './engine.js';
import { INSTRUMENTS, playPhrase, playChords, drumLow, drumHigh } from './sounds.js';

const T = (k, v) => t('earp.' + k, v);
const DIATONIC = [60, 62, 64, 65, 67, 69, 71, 72];

// Mélodie (marche aléatoire) pour la dictée et le solfège chanté
function melody(level) {
  const len = [3, 4, 5, 6][level - 1];
  const maxStep = [1, 2, 4, 7][level - 1];
  const chromatic = level === 4;
  const scale = chromatic ? [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72] : DIATONIC;
  const step = chromatic ? maxStep * 2 - 2 : maxStep;
  let i = level <= 2 ? 0 : randInt(0, scale.length - 1);
  const out = [scale[i]];
  while (out.length < len) {
    let j;
    do { j = i + randInt(-step, step); } while (j === i || j < 0 || j >= scale.length);
    i = j;
    out.push(scale[i]);
  }
  return out;
}
async function playMelody(notes, step = 0.6) {
  notes.forEach((m, i) => playNote(m, { when: i * step, duration: step * 0.95 }));
  await sleep((notes.length * step + 0.5) * 1000);
}

// ---------- Dictée rythmique ----------
const RHYTHM_CELLS = [['q', 'h', 'r'], ['q', 'h', 'r', 'e2'], ['q', 'h', 'r', 'e2', 'dq', 's4'], ['q', 'r', 'e2', 'dq', 's4', 'syn']];
function rhythmPattern(level) {
  const allowed = RHYTHM_CELLS[level - 1];
  for (;;) {
    const cells = [];
    let beats = 0;
    while (beats < 4) {
      const c = pick(allowed.filter((x) => CELLS[x].beats <= 4 - beats));
      cells.push(c); beats += CELLS[c].beats;
    }
    if (cells[0] !== 'r' || level > 1) return cells;
  }
}
async function playRhythm(cells, bpm = 80) {
  unlockAudio();
  const beat = 60 / bpm;
  for (let b = 0; b < 4; b++) playClick({ when: b * beat, accent: b === 0, volume: 0.45 });
  const start = 4 * beat;
  let pos = 0;
  for (const c of cells) {
    for (const [off] of CELLS[c].hits) playNote(72, { when: start + (pos + off) * beat, duration: 0.18, volume: 0.6 });
    pos += CELLS[c].beats;
  }
  for (let b = 0; b < 4; b++) playClick({ when: start + b * beat, volume: 0.15 });
  await sleep((start + 4 * beat + 0.4) * 1000);
}

// ---------- Cadences ----------
const CADENCES = { parfaite: [1, 4, 5, 1], demi: [1, 4, 1, 5], plagale: [1, 5, 4, 1], rompue: [1, 4, 5, 6] };
const CADENCE_LEVELS = [['parfaite', 'demi'], ['parfaite', 'demi', 'plagale'], ['parfaite', 'demi', 'plagale', 'rompue']];
const cadenceChords = (tonic, name) => CADENCES[name].map((d) => { const { notes, bass } = diatonicTriad(tonic, d); return [bass, ...notes]; });

// ---------- Instruments ----------
const INSTRUMENT_LEVELS = [['piano', 'guitare', 'flute'], ['piano', 'guitare', 'flute', 'cordes', 'cuivres'], INSTRUMENTS];

// Choix → objets attendus par runQuiz (texte en clair pour les corrections)
const choicesOf = (list, labelOf) => list.map((v) => ({ value: String(v), label: labelOf(v), text: labelOf(v) }));

// ---------------------------------------------------------------------
export const ACTIVITIES = [
  {
    id: 'dictee-melodique', cat: 'ecoute', icon: '🎹', levels: 4, questions: 6,
    quiz(level) {
      const notes = melody(level);
      return { prompt: T('q_dictee', { n: notes.length }), play: () => playMelody(notes), ask: keyboardDictation(notes), tip: T('tip_dictee') };
    },
  },
  {
    id: 'dictee-rythmique', cat: 'rythme', icon: '🥁', levels: 4, questions: 6,
    quiz(level) {
      const answer = rhythmPattern(level);
      const options = [answer];
      for (let k = 0; options.length < 4 && k < 60; k++) {
        const o = rhythmPattern(level);
        if (!options.some((x) => x.join() === o.join())) options.push(o);
      }
      const order = shuffled(options);
      const letters = ['A', 'B', 'C', 'D'];
      const correct = letters[order.indexOf(answer)];
      return {
        prompt: T('q_rythme'), play: () => playRhythm(answer), answer: correct,
        choices: order.map((cells, i) => ({ value: letters[i], label: html`<span class="ear-opt">${letters[i]}</span>${rhythmSvg(cells)}`, text: T('option', { l: letters[i] }) })),
        explain: () => T('rhythm_was', { cells: answer.map((c) => T('cells')[c]).join(', ') }),
        compare: (v) => playRhythm(order[letters.indexOf(v)] ?? answer), tip: T('tip_rythme'),
      };
    },
  },
  {
    id: 'cadences', cat: 'ecoute', icon: '🎼', levels: 3, questions: 8,
    quiz(level) {
      const names = CADENCE_LEVELS[level - 1];
      const answer = pick(names);
      const tonic = pick([55, 57, 60, 62, 64]);
      return {
        prompt: T('q_cadence', { k: noteFr(tonic) }), play: () => playChords(cadenceChords(tonic, answer)), answer,
        choices: choicesOf(names, (n) => T('cadence')[n]), explain: (n) => T('cadence_why')[n],
        compare: (n) => playChords(cadenceChords(tonic, n)), tip: T('tip_cadence'),
      };
    },
  },
  {
    id: 'instruments', cat: 'ecoute', icon: '🎻', levels: 3, questions: 8,
    quiz(level) {
      const names = INSTRUMENT_LEVELS[level - 1];
      const answer = pick(names);
      const notes = melody(2).map((m) => (answer === 'basse' ? m - 12 : m));
      return {
        prompt: T('q_instrument'), play: () => playPhrase(answer, notes), answer,
        choices: choicesOf(names, (n) => T('instrument')[n]), explain: (n) => T('instrument_why')[n],
        compare: (n) => playPhrase(n, notes), tip: T('tip_instrument'),
      };
    },
  },
  // Les 5 exercices d'écoute existants, en mode « difficulté qui s'adapte »
  ...['interval', 'chord', 'scale', 'degree', 'progression'].map((mode) => ({
    id: `adaptatif-${mode}`, cat: 'adaptatif', icon: t('ear.modes')[mode].icon, levels: EAR_LEVELS[mode].length, questions: 12, adaptiveOnly: true, earMode: mode,
    quiz(level) {
      const cfg = EAR_LEVELS[mode][level - 1];
      const Q = earQuestion(mode, cfg, null);
      const parse = (v) => cfg.choices.find((c) => String(c) === String(v));
      return {
        prompt: Q.prompt, play: () => Q.sound(Q.answer), answer: String(Q.answer),
        choices: choicesOf(cfg.choices, (c) => Q.label(c)), explain: (v) => Q.describe(parse(v)),
        compare: (v) => Q.sound(parse(v)), tip: Q.tip,
      };
    },
  })),
  // ---------- Voix (micro) ----------
  { id: 'chant-intervalle', cat: 'voix', icon: '🎤', levels: 4, questions: 6, run: (stage, o) => singIntervals(stage, o) },
  { id: 'chant-gamme', cat: 'voix', icon: '🎶', levels: 4, questions: 1, run: (stage, o) => singScale(stage, o) },
  { id: 'solfege-chante', cat: 'voix', icon: '📖', levels: 4, questions: 4, run: (stage, o) => sightSing(stage, o) },
  // ---------- Rythme (taper) ----------
  { id: 'tempo-progressif', cat: 'rythme', icon: '⏩', levels: 4, questions: 1, run: (stage, o) => tempoRamp(stage, o) },
  { id: 'polyrythmie', cat: 'rythme', icon: '🪘', levels: 4, questions: 6, run: (stage, o) => polyrhythm(stage, o) },
];
export const activityById = (id) => ACTIVITIES.find((a) => a.id === id);

// Série de questions d'une activité « quiz »
export function runActivityQuiz(stage, a, { level, adaptive, total, timeLimit, showLevel = true }) {
  return runQuiz(stage, { makeQuestion: (l) => a.quiz(l), total: total ?? a.questions, level, maxLevel: a.levels, adaptive, timeLimit, showLevel });
}

// ---------------------------------------------------------------------
// Voix : chanter un intervalle
// ---------------------------------------------------------------------
const SING_INTERVALS = [[12, 7], [12, 7, 4, 5], [12, 7, 5, 4, 3, 2, 9], [-12, -7, -5, -4, -3]];
async function singIntervals(stage, { level, voice, total = 6 }) {
  const mode = await chooseMode(stage);
  const res = { correct: 0, total, items: [] };
  set(stage, html`<div data-z="counter"></div><p class="ex-prompt" data-z="prompt"></p><div data-z="stage"></div><div data-z="answer"></div><div data-z="feedback"></div>`);
  const z = (n) => stage.querySelector(`[data-z="${n}"]`);
  for (let q = 1; q <= total && document.contains(stage); q++) {
    set(z('counter'), html`<p class="ex-counter">${t('ex.question', { n: q, total })}</p>`);
    set(z('feedback'), ''); set(z('answer'), '');
    const semis = pick(SING_INTERVALS[level - 1]);
    const base = voiceBase(voice) + (semis < 0 ? 12 : 0) + pick([0, 2, 5, 7]);
    const target = base + semis;
    const name = INTERVAL_NAMES_FR[Math.abs(semis)];
    z('prompt').textContent = T(semis < 0 ? 'q_sing_down' : 'q_sing_up', { i: name, n: noteFr(base) });
    set(z('stage'), html`<p class="sing-step">🎧 ${t('ex.sing.listen')}</p>`);
    playNote(base, { duration: 1.4 });
    await sleep(1600);
    let ok;
    if (mode === 'mic') {
      const r = await singWithMic(z('stage'), target, { tolerance: 50, holdMs: 900 });
      ok = r.ok;
      set(z('stage'), '');
      feedback(z('feedback'), { ok, title: ok ? T('sing_ok', { n: noteFr(target) }) : t('ex.mic.almost'), text: micFeedbackText(r, target), tip: ok ? null : T('tip_sing_interval', { i: name }) });
    } else {
      ok = await selfCheck(z, () => (playNote(target, { duration: 1.2 }), sleep(1400)));
      feedback(z('feedback'), { ok, title: ok ? T('sing_ok', { n: noteFr(target) }) : T('sing_ko'), text: T('target_was', { n: noteFr(target), i: name }) });
    }
    if (ok) res.correct++;
    res.items.push({ q, ok, interval: semis });
    await next(z('feedback'), q === total ? t('ex.finish') : t('ex.next'), { onReplay: () => playMelody([base, target], 0.9) });
  }
  return res;
}

// Sans micro : l'élève chante, écoute la bonne note puis s'auto-évalue
async function selfCheck(z, playTarget) {
  for (let s = 3; s >= 1; s--) { set(z('stage'), html`<p class="sing-step is-singing">🎤 ${t('ex.sing.now')} <span class="muted">${s}</span></p>`); await sleep(1000); }
  set(z('stage'), html`<p class="sing-step">🔁 ${t('ex.sing.compare')}</p>`);
  await playTarget();
  set(z('stage'), '');
  const { value } = await askChoice(z('answer'), [{ value: 'pareil', label: t('ex.sing.same') }, { value: 'different', label: t('ex.sing.different') }], { onReplay: playTarget });
  return value === 'pareil';
}

// ---------------------------------------------------------------------
// Voix : chanter une gamme (justesse de chaque degré)
// ---------------------------------------------------------------------
const SCALE_SING = [[0, 2, 4, 5, 7], [0, 2, 4, 5, 7, 9, 11, 12], [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0], [0, 2, 3, 5, 7, 8, 10, 12]];
async function singScale(stage, { level, voice }) {
  const mode = await chooseMode(stage);
  const tonic = voiceBase(voice) + (level === 4 ? -3 : 0); // La mineur au niveau 4
  const notes = SCALE_SING[level - 1].map((s) => tonic + s);
  set(stage, html`<p class="ex-prompt">${T(level === 4 ? 'q_scale_minor' : 'q_scale', { n: noteFr(tonic) })}</p>
    <div class="ear-degrees" data-z="degrees">${notes.map((m, i) => html`<span class="ear-degree" data-i="${i}">${noteFr(m)}</span>`)}</div>
    <div data-z="stage"></div><div data-z="answer"></div><div data-z="feedback"></div>`);
  const z = (n) => stage.querySelector(`[data-z="${n}"]`);
  const deg = (i) => stage.querySelector(`.ear-degree[data-i="${i}"]`);
  set(z('stage'), html`<p class="sing-step">🎧 ${T('tonic_ref', { n: noteFr(tonic) })}</p>`);
  playNote(tonic, { duration: 1.6 });
  await sleep(1800);
  const res = { correct: 0, total: notes.length, items: [] };
  if (mode === 'mic') {
    for (let i = 0; i < notes.length && document.contains(stage); i++) {
      deg(i).classList.add('is-current');
      const r = await singWithMic(z('stage'), notes[i], { tolerance: 50, holdMs: 600, timeoutMs: 9000 });
      deg(i).classList.remove('is-current');
      deg(i).classList.add(r.ok ? 'is-ok' : 'is-ko');
      if (r.cents !== null) deg(i).insertAdjacentHTML('beforeend', String(html`<small>${r.cents > 0 ? '+' : ''}${Math.round(r.cents)}</small>`));
      if (r.ok) res.correct++;
      res.items.push({ degree: i + 1, ok: r.ok, cents: r.cents === null ? null : Math.round(r.cents) });
    }
    set(z('stage'), '');
    feedback(z('feedback'), { ok: res.correct === res.total, title: T('scale_score', { c: res.correct, n: res.total }), text: T('scale_legend'), tip: res.correct < res.total ? T('tip_scale') : null });
  } else {
    const ok = await selfCheck(z, () => playMelody(notes, 0.5));
    res.correct = ok ? res.total : 0;
    feedback(z('feedback'), { ok, title: ok ? T('sing_ok_scale') : T('sing_ko'), text: T('scale_was', { notes: notes.map(noteFr).join(' – ') }) });
  }
  await next(z('feedback'), t('ex.finish'), { onReplay: () => playMelody(notes, 0.5) });
  return res;
}

// ---------------------------------------------------------------------
// Voix : solfège chanté (lire la portée et chanter)
// ---------------------------------------------------------------------
async function sightSing(stage, { level, total = 4 }) {
  const mode = await chooseMode(stage);
  const res = { correct: 0, total: 0, items: [] };
  for (let q = 1; q <= total && document.contains(stage); q++) {
    const notes = melody(level);
    const done = [];
    set(stage, html`<p class="ex-counter">${t('ex.question', { n: q, total })}</p>
      <p class="ex-prompt">${T('q_sight')}</p><div data-z="staff" class="ear-staff-wrap"></div>
      <div data-z="stage"></div><div data-z="answer"></div><div data-z="feedback"></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);
    const draw = (cur) => set(z('staff'), staffSvg(notes, { current: cur, done }));
    draw(-1);
    set(z('stage'), html`<p class="sing-step">🎧 ${T('do_ref')}</p>`);
    playNote(60, { duration: 1.4 });
    await sleep(1600);
    if (mode === 'mic') {
      for (let i = 0; i < notes.length && document.contains(stage); i++) {
        draw(i);
        const r = await singWithMic(z('stage'), notes[i], { tolerance: 60, holdMs: 600, timeoutMs: 9000 });
        done[i] = r.ok;
        res.total++; if (r.ok) res.correct++;
      }
      draw(-1);
      set(z('stage'), '');
      const okAll = done.every(Boolean);
      feedback(z('feedback'), { ok: okAll, title: T('sight_score', { c: done.filter(Boolean).length, n: notes.length }), text: T('melody_was', { notes: notes.map(noteFr).join(' – ') }), tip: okAll ? null : T('tip_sight') });
    } else {
      const ok = await selfCheck(z, () => playMelody(notes));
      res.total += notes.length; if (ok) res.correct += notes.length;
      feedback(z('feedback'), { ok, title: ok ? T('sing_ok_scale') : T('sing_ko'), text: T('melody_was', { notes: notes.map(noteFr).join(' – ') }) });
    }
    res.items.push({ q, notes: notes.map(noteFr).join(' '), ok: done.every(Boolean) });
    await next(z('feedback'), q === total ? t('ex.finish') : t('ex.next'), { onReplay: () => playMelody(notes) });
  }
  if (!res.total) res.total = 1;
  return res;
}

// ---------------------------------------------------------------------
// Rythme : taper (pavé + barre d'espace), comparaison aux temps prévus
// ---------------------------------------------------------------------
function tapZone(zone, label) {
  set(zone, html`<button type="button" class="tap-pad" data-tap aria-label="${label}">👏 ${label}</button>`);
  const taps = [];
  const pad = zone.querySelector('[data-tap]');
  const add = () => { taps.push(now() - getLatency() / 1000); pad.classList.add('is-hit'); setTimeout(() => pad.classList.remove('is-hit'), 90); };
  const onDown = (e) => { e.preventDefault(); add(); };
  const onKey = (e) => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); add(); } };
  pad.addEventListener('pointerdown', onDown);
  document.addEventListener('keydown', onKey);
  return { taps, stop: () => { pad.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); pad.disabled = true; } };
}
// Pour chaque temps attendu, une frappe assez proche ?
function matchTaps(expected, taps, windowSec) {
  const used = new Set();
  let hits = 0, offsets = [];
  for (const e of expected) {
    let best = -1, bestD = Infinity;
    taps.forEach((tp, i) => { const d = Math.abs(tp - e); if (!used.has(i) && d < bestD) { bestD = d; best = i; } });
    if (best >= 0 && bestD <= windowSec) { used.add(best); hits++; offsets.push(taps[best] - e); }
  }
  const avg = offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : 0;
  return { hits, extra: taps.length - used.size, avgMs: Math.round(avg * 1000) };
}

const RAMPS = [[60, 8], [70, 10], [80, 12], [90, 15]];
async function tempoRamp(stage, { level }) {
  const [start, inc] = RAMPS[level - 1];
  const segments = 4, beatsPer = 8;
  set(stage, html`<p class="ex-prompt">${T('q_tempo', { a: start, b: start + inc * (segments - 1) })}</p>
    <p class="muted small">${T('tempo_hint')}</p><div data-z="info" class="ear-tempo"></div><div data-z="pad"></div><div data-z="feedback"></div>
    <button class="btn btn-lg btn-block" type="button" data-action="go">▶ ${T('start')}</button>`);
  const z = (n) => stage.querySelector(`[data-z="${n}"]`);
  await waitAction(stage, ['go']);
  stage.querySelector('[data-action="go"]').remove();
  unlockAudio();
  const t0 = now() + 0.3;
  const expected = [];
  const melodyNotes = [60, 64, 67, 72, 71, 67, 65, 62];
  let time = t0;
  const marks = [];
  // Décompte de 4 temps, puis 4 parties de 8 temps de plus en plus rapides
  const countBeat = 60 / start;
  for (let b = 0; b < 4; b++) playClick({ when: time - now() + b * countBeat, accent: b === 0, volume: 0.6 });
  time += 4 * countBeat;
  for (let s = 0; s < segments; s++) {
    const bpm = start + inc * s;
    const beat = 60 / bpm;
    marks.push({ at: time, bpm });
    for (let b = 0; b < beatsPer; b++) {
      expected.push(time);
      playNote(melodyNotes[(s * beatsPer + b) % melodyNotes.length] - (b % 2 ? 0 : 12), { when: time - now(), duration: beat * 0.8, volume: b % 4 === 0 ? 0.5 : 0.38 });
      if (s === 0) playClick({ when: time - now(), volume: 0.2 });
      time += beat;
    }
  }
  const pad = tapZone(z('pad'), T('tap'));
  const end = time + 0.4;
  while (now() < end && document.contains(stage)) {
    const cur = [...marks].reverse().find((m) => now() >= m.at);
    z('info').textContent = cur ? `♩ = ${cur.bpm}` : T('count_in');
    await sleep(100);
  }
  pad.stop();
  const m = matchTaps(expected, pad.taps, Math.min(0.12, (60 / (start + inc * 3)) * 0.3));
  const ok = m.hits / expected.length >= 0.8;
  feedback(z('feedback'), { ok, title: T('tap_score', { c: m.hits, n: expected.length }), text: T(Math.abs(m.avgMs) < 30 ? 'tap_center' : m.avgMs < 0 ? 'tap_early' : 'tap_late', { ms: Math.abs(m.avgMs) }), tip: ok ? null : T('tip_tempo') });
  await next(z('feedback'), t('ex.finish'));
  return { correct: m.hits, total: expected.length, items: [{ avgMs: m.avgMs, extra: m.extra }] };
}

// ---------------------------------------------------------------------
// Rythme : polyrythmie (2 contre 3)
// ---------------------------------------------------------------------
async function playPoly(kind, cycles = 2, cycle = 1.8) {
  unlockAudio();
  const layers = { '3:2': [3, 2], '4:3': [4, 3], unisson: [3, 3] }[kind];
  for (let c = 0; c < cycles; c++) {
    const base = 0.2 + c * cycle;
    for (let i = 0; i < layers[0]; i++) drumHigh(base + (i * cycle) / layers[0]);
    for (let i = 0; i < layers[1]; i++) drumLow(base + (i * cycle) / layers[1]);
  }
  await sleep((0.2 + cycles * cycle + 0.4) * 1000);
}
const POLY_TAP = [null, { play: 2, tap: 3, cycle: 1.8 }, { play: 3, tap: 2, cycle: 1.8 }, { play: 2, tap: 3, cycle: 1.3 }];
async function polyrhythm(stage, { level }) {
  if (level === 1) {
    const kinds = ['3:2', '4:3', 'unisson'];
    return runQuiz(stage, {
      total: 6, level: 1, maxLevel: 1, adaptive: false,
      makeQuestion: () => {
        const answer = pick(kinds);
        return { prompt: T('q_poly'), play: () => playPoly(answer), answer, choices: choicesOf(kinds, (k) => T('poly')[k]), explain: (k) => T('poly_why')[k], compare: (k) => playPoly(k), tip: T('tip_poly') };
      },
    });
  }
  const { play, tap, cycle } = POLY_TAP[level - 1];
  const cycles = 6;
  set(stage, html`<p class="ex-prompt">${T('q_poly_tap', { p: play, t: tap })}</p>
    <p class="muted small">${T(tap === 3 ? 'poly_tap_hint3' : 'poly_tap_hint2')}</p>
    <div class="row" style="justify-content:center"><button class="btn btn-ghost btn-sm" type="button" data-action="demo">▶ ${T('demo')}</button></div>
    <div data-z="pad"></div><div data-z="feedback"></div>
    <button class="btn btn-lg btn-block" type="button" data-action="go">▶ ${T('start')}</button>`);
  const z = (n) => stage.querySelector(`[data-z="${n}"]`);
  for (;;) {
    const a = await waitAction(stage, ['demo', 'go']);
    if (a === 'demo') { await playPoly('3:2', 2, cycle); continue; }
    break;
  }
  stage.querySelector('[data-action="go"]').remove();
  unlockAudio();
  const t0 = now() + 0.3 + cycle; // 1 cycle d'écoute avant de taper
  const expected = [];
  for (let c = -1; c < cycles; c++) {
    const base = t0 + c * cycle;
    for (let i = 0; i < play; i++) (play === 2 ? drumLow : drumHigh)(base + (i * cycle) / play - now());
    if (c >= 0) for (let i = 0; i < tap; i++) expected.push(base + (i * cycle) / tap);
    if (c === -1) for (let i = 0; i < tap; i++) (tap === 3 ? drumHigh : drumLow)(base + (i * cycle) / tap - now()); // modèle
  }
  const pad = tapZone(z('pad'), T('tap'));
  const end = t0 + cycles * cycle + 0.3;
  while (now() < end && document.contains(stage)) await sleep(100);
  pad.stop();
  const m = matchTaps(expected, pad.taps, Math.min(0.11, (cycle / tap) * 0.25));
  const ok = m.hits / expected.length >= 0.75;
  feedback(z('feedback'), { ok, title: T('tap_score', { c: m.hits, n: expected.length }), text: T(Math.abs(m.avgMs) < 30 ? 'tap_center' : m.avgMs < 0 ? 'tap_early' : 'tap_late', { ms: Math.abs(m.avgMs) }), tip: ok ? null : T('tip_poly_tap') });
  await next(z('feedback'), t('ex.finish'));
  return { correct: m.hits, total: expected.length, items: [{ avgMs: m.avgMs, extra: m.extra }] };
}
