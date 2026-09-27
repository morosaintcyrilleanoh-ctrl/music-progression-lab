// =====================================================================
// Page "Séance" : déroule les exercices d'une journée du programme
// Intro → exercices (un par un) → bilan + validation
// =====================================================================
import { html, mount, toast } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { unlockAudio, audioSupported } from '../audio.js';
import { voiceBase } from '../music.js';
import { registry } from '../exercises/index.js';
import { stopMic } from '../pitch.js';
import { set } from '../exercises/common.js';
import {
  getProgramDay, getDayExercises, getProfile, getUserProgram, updateVoiceRange, getExerciseBySlug,
  startSession, recordAttempt, completeSession, getBadgesSince, getBestDayScore
} from '../data.js';

function errorView(message) {
  mount(html`<div class="container dash" style="max-width:760px">
    <div class="alert alert-error" role="alert">${message}</div>
    <div><a class="btn" href="#/tableau-de-bord">${t('session.back_dashboard')}</a></div></div>`);
}

export async function sessionPage({ jour }) {
  const user = getUser();
  const n = Number.parseInt(jour, 10);
  let dayData, exercises, profile, userProgram;
  try {
    dayData = Number.isInteger(n) ? await getProgramDay(n) : null;
    if (!dayData) return errorView(t('program.not_found'));
    [exercises, profile, userProgram] = await Promise.all([
      getDayExercises(dayData.day.id),
      getProfile(user.id),
      getUserProgram(user.id, dayData.program.id)
    ]);
  } catch (err) { console.error(err); return errorView(t('errors.load')); }

  const { day, program } = dayData;
  const currentDay = userProgram?.status === 'completed' ? program.duration_days : (userProgram?.current_day ?? 1);

  // On avance dans l'ordre : pas de jour 5 avant d'avoir validé le jour 4
  if (n > currentDay) {
    mount(html`<div class="container dash center" style="max-width:640px">
      <h1>${t('session.locked_title')}</h1>
      <p class="muted">${t('session.locked_text', { n: currentDay })}</p>
      <div><a class="btn" href="#/seance/${currentDay}">${t('session.go_day', { n: currentDay })}</a></div></div>`);
    return;
  }

  // ---------------- Écran d'introduction ----------------
  const steps = Array.isArray(day.steps) ? day.steps : [];
  const needsVoice = exercises.some((e) => e.type.startsWith('sing') || e.type === 'melody_sing' || e.type === 'assessment');
  mount(html`
    <div class="container dash" style="max-width:760px">
      <div>
        <a href="#/programme" class="small">← ${t('program.back')}</a>
        <p class="eyebrow" style="margin-top:16px">${t('program.day', { n: day.day_number })} / ${program.duration_days} · ${t('common.minutes_short', { n: day.duration_minutes })}</p>
        <h1>${day.title}</h1>
        <p style="font-size:1.1rem;margin:0">${day.objective}</p>
      </div>
      ${!audioSupported() ? html`<div class="alert alert-error" role="alert">${t('session.no_audio')}</div>` : ''}
      ${day.safety_note ? html`<div class="alert alert-info" role="note"><strong>${t('program.safety')} :</strong> ${day.safety_note}</div>` : ''}
      <section class="card">
        <h2 style="font-size:1.15rem">${t('session.today_program')}</h2>
        <ol class="ex-list">
          ${exercises.map((e) => html`<li><strong>${e.title}</strong>${e.objective ? html` — <span class="muted">${e.objective}</span>` : ''}</li>`)}
        </ol>
        ${day.materials ? html`<p class="small muted" style="margin:12px 0 0">${t('program.materials')} : ${day.materials}</p>` : ''}
        <p class="small muted" style="margin:6px 0 0">${t('session.headphones')}</p>
      </section>
      ${needsVoice && !profile?.voice_range ? html`
        <section class="card" id="voice-card">
          <h2 style="font-size:1.15rem">${t('dashboard.voice_title')}</h2>
          <p class="muted">${t('dashboard.voice_lead')}</p>
          <div class="choice-row">
            <button class="btn btn-ghost" type="button" data-voice="grave">${t('dashboard.voice_grave')}</button>
            <button class="btn btn-ghost" type="button" data-voice="aigu">${t('dashboard.voice_aigu')}</button>
          </div>
        </section>` : ''}
      <details class="card">
        <summary><strong>${t('program.steps')}</strong></summary>
        <ol class="steps" style="margin-top:12px">
          ${steps.map((s) => html`<li><span class="min">${t('common.minutes_short', { n: s.minutes })}</span><span>${s.text}</span></li>`)}
        </ol>
      </details>
      <button class="btn btn-lg btn-block" type="button" id="start-btn">▶ ${t('session.start')}</button>
    </div>`);

  let voice = profile?.voice_range ?? null;
  document.querySelectorAll('[data-voice]').forEach((btn) => btn.addEventListener('click', async () => {
    voice = btn.dataset.voice;
    document.querySelectorAll('[data-voice]').forEach((b) => b.classList.toggle('is-picked', b === btn));
    try { await updateVoiceRange(user.id, voice); toast(t('dashboard.voice_saved'), 'success'); } catch (err) { console.error(err); }
  }));

  document.getElementById('start-btn').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    unlockAudio();
    let sessionId;
    try { sessionId = await startSession(day.id); }
    catch (err) { console.error(err); return errorView(t('errors.generic')); }
    runSession({ user, day, program, exercises, sessionId, voice, xpBefore: profile?.xp ?? null });
  });
}

// ---------------- Déroulé des exercices ----------------
async function runSession({ user, day, program, exercises, sessionId, voice, xpBefore }) {
  const startedIso = new Date(Date.now() - 5000).toISOString();
  const results = {};          // par exercice (slug)
  let notebook = null;
  let recordErrors = 0;
  const exerciseCache = new Map();

  mount(html`
    <div class="container dash session" style="max-width:760px">
      <div class="session-head">
        <p class="eyebrow" id="session-step"></p>
        <div class="bar" aria-hidden="true"><span id="session-bar" style="width:0%"></span></div>
      </div>
      <h1 id="ex-title" style="font-size:1.6rem"></h1>
      <section class="card ex-stage" id="ex-stage" aria-live="polite"></section>
    </div>`);
  const stepEl = document.getElementById('session-step');
  const barEl = document.getElementById('session-bar');
  const titleEl = document.getElementById('ex-title');
  const stage = document.getElementById('ex-stage');

  const recordFor = (exercise, item) => {
    recordAttempt(sessionId, exercise.id, item).catch((err) => { recordErrors++; console.error(err); });
  };

  for (let i = 0; i < exercises.length; i++) {
    if (!document.contains(stage)) { stopMic(); return; } // l'utilisateur a quitté la page
    const exercise = exercises[i];
    const module = registry[exercise.type];
    stepEl.textContent = t('session.step', { n: i + 1, total: exercises.length });
    barEl.style.width = `${Math.round((i / exercises.length) * 100)}%`;
    titleEl.textContent = exercise.title;
    titleEl.focus?.({ preventScroll: true });
    if (!module) { continue; }

    const ctx = {
      exercise, params: exercise.params ?? {}, day, voiceBase: voiceBase(voice),
      record: (item) => (module.assess ? recordFor(exercise, item) : null),
      recordFor,
      loadExercise: async (slug) => {
        if (!exerciseCache.has(slug)) exerciseCache.set(slug, await getExerciseBySlug(slug));
        return exerciseCache.get(slug);
      }
    };
    let r;
    try { r = await module.run(stage, ctx); }
    catch (err) { console.error(err); r = { total: 0, correct: 0, scoreSum: 0, done: 0 }; }
    if (r.notebook) notebook = { ...(notebook ?? {}), ...r.notebook };
    const b = (results[exercise.slug] ??= { total: 0, correct: 0, scoreSum: 0, done: 0 });
    b.total += r.total; b.correct += r.correct; b.scoreSum += r.scoreSum; b.done += r.done;
    if (r.selfCheck) b.selfCheck = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  stopMic(); // on coupe le micro dès la fin des exercices
  if (!document.contains(stage)) return;
  barEl.style.width = '100%';

  // ---------------- Bilan ----------------
  const assessed = Object.values(results).filter((r) => r.total > 0);
  const totalQ = assessed.reduce((s, r) => s + r.total, 0);
  const score = totalQ ? Math.round((assessed.reduce((s, r) => s + r.scoreSum, 0) / totalQ) * 100) : null;
  const validated = evaluateRule(day.validation_rule, results, notebook);

  set(stage, html`<div class="center"><div class="spinner" role="status" aria-label="${t('common.loading')}"></div></div>`);
  try { await completeSession(sessionId, { score, notebook, validated }); }
  catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  const [after, badges, day1Score] = await Promise.all([
    getProfile(user.id).catch(() => null),
    getBadgesSince(user.id, startedIso).catch(() => []),
    day.day_number === 7 ? findDay1Score(user.id) : Promise.resolve(null)
  ]);

  titleEl.textContent = validated ? t('session.validated_title') : t('session.not_validated_title');
  stepEl.textContent = `${t('program.day', { n: day.day_number })} · ${day.title}`;
  const xpGained = after && xpBefore !== null ? Math.max(0, after.xp - xpBefore) : null;
  const isLast = day.day_number >= program.duration_days;

  set(stage, html`
    <div class="summary">
      ${score !== null ? html`<div class="big-score" aria-label="${t('session.score')}"><span>${score}</span>%</div>` : ''}
      <p class="${validated ? '' : 'muted'}" style="text-align:center">${validated ? t('session.validated_text') : t('session.not_validated_text', { rule: day.validation })}</p>
      <ul class="result-list">
        ${exercises.filter((e, i, all) => results[e.slug]?.total > 0 && all.findIndex((x) => x.slug === e.slug) === i)
          .map((e) => { const r = results[e.slug]; return html`<li><span>${e.title}</span><strong>${r.correct} / ${r.total}${r.selfCheck ? html` <span class="muted small">(${t('session.self_check')})</span>` : ''}</strong></li>`; })}
      </ul>
      <div class="grid grid-2" style="margin-top:16px">
        ${xpGained !== null ? html`<div class="mini-stat"><span>${t('session.xp_gained')}</span><strong>+${xpGained} XP</strong></div>` : ''}
        ${after ? html`<div class="mini-stat"><span>${t('dashboard.streak')}</span><strong>${t('dashboard.streak_unit', { n: after.current_streak })}</strong></div>` : ''}
      </div>
      ${badges.length ? html`<div class="alert alert-success" style="margin-top:16px">🏅 ${t('session.new_badges')} : <strong>${badges.map((b) => b.achievement?.title).filter(Boolean).join(', ')}</strong></div>` : ''}
      ${day1Score !== null && score !== null ? html`<div class="alert alert-info" style="margin-top:16px">${t('session.compare_day1', { d1: Math.round(day1Score), d7: score })}</div>` : ''}
      ${day.challenge ? html`<div class="challenge"><strong>🎯 ${t('program.challenge')} :</strong> ${day.challenge}</div>` : ''}
      ${recordErrors ? html`<div class="alert alert-error" style="margin-top:16px">${t('session.record_errors')}</div>` : ''}
      <div class="row" style="margin-top:20px">
        ${validated && !isLast ? html`<a class="btn" href="#/tableau-de-bord">${t('session.back_dashboard')}</a>` : ''}
        ${!validated ? html`<a class="btn" href="#/seance/${day.day_number}" data-restart>${t('session.retry')}</a>` : ''}
        ${validated && isLast ? html`<a class="btn" href="#/tableau-de-bord">${t('session.back_dashboard')}</a>` : ''}
        ${!validated ? html`<a class="btn btn-ghost" href="#/tableau-de-bord">${t('session.later')}</a>` : html`<a class="btn btn-ghost" href="#/seance/${day.day_number}" data-restart>${t('session.redo')}</a>`}
      </div>
      ${validated && !isLast ? html`<p class="muted small" style="margin-top:12px">${t('session.come_back_tomorrow', { n: day.day_number + 1 })}</p>` : ''}
    </div>`);
}

async function findDay1Score(userId) {
  try {
    const d1 = await getProgramDay(1);
    return d1 ? await getBestDayScore(userId, d1.day.id) : null;
  } catch { return null; }
}

// ---------------- Règles de validation (définies dans la base) ----------------
export function evaluateRule(rule, results, notebook) {
  if (!rule || !rule.type) return true;
  const r = (slug) => results[slug] ?? { total: 0, correct: 0, done: 0 };
  switch (rule.type) {
    case 'all': return (rule.rules ?? []).every((sub) => evaluateRule(sub, results, notebook));
    case 'min_correct': {
      const x = r(rule.exercise);
      if (rule.or_self_check && x.selfCheck && x.done >= x.total && x.total > 0) return true;
      return x.correct >= rule.min;
    }
    case 'min_rate': {
      const x = r(rule.exercise);
      if (rule.or_self_check && x.selfCheck && x.done >= x.total && x.total > 0) return true;
      return x.total > 0 && x.correct / x.total >= rule.min_rate;
    }
    case 'min_done': return r(rule.exercise).done >= rule.min;
    case 'notebook_filled': return !!notebook && Object.values(notebook).some((v) => String(v ?? '').trim().length > 0);
    default: return true;
  }
}
