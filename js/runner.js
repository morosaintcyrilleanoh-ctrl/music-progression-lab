// =====================================================================
// Lanceur d'exercices générique (diagnostic, entraînement personnalisé,
// devoirs). Affiche les exercices un par un et renvoie les résultats.
// =====================================================================
import { html, mount } from './ui.js';
import { t } from './i18n.js';
import { registry } from './exercises/index.js';
import { voiceBase } from './music.js';
import { stopMic } from './pitch.js';
import { recordAttempt, getExerciseBySlug } from './data.js';

export async function runExercises({ title, exercises, sessionId = null, voice = null, record = true }) {
  mount(html`
    <div class="container dash session" style="max-width:760px">
      <div class="session-head">
        <p class="eyebrow" id="session-step"></p>
        <div class="bar" aria-hidden="true"><span id="session-bar" style="width:0%"></span></div>
      </div>
      <h1 id="ex-title" style="font-size:1.6rem">${title}</h1>
      <section class="card ex-stage" id="ex-stage" aria-live="polite"></section>
    </div>`);
  const stepEl = document.getElementById('session-step');
  const barEl = document.getElementById('session-bar');
  const titleEl = document.getElementById('ex-title');
  const stage = document.getElementById('ex-stage');
  const results = {};
  const cache = new Map();
  let recordErrors = 0;

  const recordFor = (exercise, item) => {
    const b = (results[exercise.slug] ??= { total: 0, correct: 0, scoreSum: 0, done: 0, skill: exercise.skill_id });
    b.items = (b.items ?? 0) + 1;
    if (record) recordAttempt(sessionId, exercise.id, item).catch((err) => { recordErrors++; console.error(err); });
  };

  for (let i = 0; i < exercises.length; i++) {
    if (!document.contains(stage)) { stopMic(); return null; }
    const exercise = exercises[i];
    const module = registry[exercise.type];
    stepEl.textContent = t('session.step', { n: i + 1, total: exercises.length });
    barEl.style.width = `${Math.round((i / exercises.length) * 100)}%`;
    titleEl.textContent = exercise.title;
    if (!module) continue;
    let r;
    try {
      r = await module.run(stage, {
        exercise, params: exercise.params ?? {}, day: null, voiceBase: voiceBase(voice),
        record: (item) => (module.assess ? recordFor(exercise, item) : null),
        recordFor,
        loadExercise: async (slug) => {
          if (!cache.has(slug)) cache.set(slug, await getExerciseBySlug(slug));
          return cache.get(slug);
        }
      });
    } catch (err) { console.error(err); r = { total: 0, correct: 0, scoreSum: 0, done: 0 }; }
    const b = (results[exercise.slug] ??= { total: 0, correct: 0, scoreSum: 0, done: 0, skill: exercise.skill_id });
    b.total += r.total; b.correct += r.correct; b.scoreSum += r.scoreSum; b.done += r.done;
    if (r.selfCheck) b.selfCheck = true;
    if (r.notebook) b.notebook = r.notebook;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  stopMic();
  if (!document.contains(stage)) return null;
  barEl.style.width = '100%';

  const assessed = Object.values(results).filter((r) => r.total > 0);
  const totalQ = assessed.reduce((s, r) => s + r.total, 0);
  const score = totalQ ? Math.round((assessed.reduce((s, r) => s + r.scoreSum, 0) / totalQ) * 100) : null;
  return { results, score, stage, titleEl, stepEl, recordErrors };
}
