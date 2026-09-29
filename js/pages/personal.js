// =====================================================================
// Diagnostic de niveau + entraînement personnalisé (répétition espacée)
// =====================================================================
import { html, mount, toast } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { unlockAudio } from '../audio.js';
import { runExercises } from '../runner.js';
import {
  getProfile, getExerciseBySlug, saveDiagnostic, getLastDiagnostic, getStarterProgram, getSkillScores,
  updateVoiceRange, startSession, completeSession
} from '../data.js';

// Quel exercice sert à travailler quelle compétence
export const SKILL_EXERCISES = {
  hauteur: { slug: 'aigu-grave-identique', params: { questions: 10 } },
  justesse: { slug: 'chanter-une-note', params: { notes: ['C', 'E', 'G'] } },
  rythme: { slug: 'rythme-miroir', params: { patterns: 4 } },
  melodie: { slug: 'dessin-melodie', params: { questions: 6 } },
  ecoute: { slug: 'ecoute-3-ecoutes', params: {} }
};

const DIAG_PLAN = [
  { skill: 'hauteur', slug: 'aigu-grave-identique', params: { questions: 8, start_semitones: 5, min_semitones: 1 } },
  { skill: 'justesse', slug: 'chanter-une-note', params: { notes: ['C', 'E', 'G'] } },
  { skill: 'rythme', slug: 'rythme-miroir', params: { patterns: 4 } },
  { skill: 'melodie', slug: 'dessin-melodie', params: { questions: 6 } },
  { skill: 'ecoute', slug: 'ecoute-3-ecoutes', params: {} }
];

export function levelLabel(pct) {
  if (pct < 40) return t('diag.lv1');
  if (pct < 60) return t('diag.lv2');
  if (pct < 75) return t('diag.lv3');
  if (pct < 90) return t('diag.lv4');
  return t('diag.lv5');
}

function voiceChooser() {
  return html`<section class="card" id="voice-card">
    <h2 style="font-size:1.15rem">${t('dashboard.voice_title')}</h2>
    <p class="muted">${t('dashboard.voice_lead')}</p>
    <div class="choice-row">
      <button class="btn btn-ghost" type="button" data-voice="grave">${t('dashboard.voice_grave')}</button>
      <button class="btn btn-ghost" type="button" data-voice="aigu">${t('dashboard.voice_aigu')}</button>
    </div></section>`;
}
function bindVoice(userId, onPick) {
  document.querySelectorAll('[data-voice]').forEach((btn) => btn.addEventListener('click', async () => {
    document.querySelectorAll('[data-voice]').forEach((b) => b.classList.toggle('is-picked', b === btn));
    onPick(btn.dataset.voice);
    try { await updateVoiceRange(userId, btn.dataset.voice); } catch (err) { console.error(err); }
  }));
}

async function loadExercises(plan) {
  const out = [];
  for (const p of plan) {
    const ex = await getExerciseBySlug(p.slug);
    if (ex) out.push({ ...ex, params: { ...(ex.params ?? {}), ...p.params } });
  }
  return out;
}

// ---------------------------------------------------------------------
// DIAGNOSTIC
// ---------------------------------------------------------------------
export async function diagnosticPage() {
  const user = getUser();
  let profile, last;
  try { [profile, last] = await Promise.all([getProfile(user.id), getLastDiagnostic(user.id)]); }
  catch (err) { console.error(err); profile = null; last = null; }
  let voice = profile?.voice_range ?? null;

  mount(html`
    <div class="container dash" style="max-width:760px">
      <div>
        <p class="eyebrow">${t('diag.eyebrow')}</p>
        <h1>${t('diag.title')}</h1>
        <p class="muted" style="margin:0">${t('diag.lead')}</p>
      </div>
      ${last ? html`<div class="alert alert-info">${t('diag.already', { d: new Date(last.taken_at).toLocaleDateString('fr-FR') })} <a href="#/diagnostic/resultat">${t('diag.see_last')}</a></div>` : ''}
      <section class="card">
        <h2 style="font-size:1.15rem">${t('diag.what')}</h2>
        <ul class="plain-list">${DIAG_PLAN.map((p) => html`<li>🎯 <strong>${t('stats.skill_names')[p.skill]}</strong> — ${t('diag.what_' + p.skill)}</li>`)}</ul>
        <p class="small muted" style="margin:12px 0 0">${t('diag.tips')}</p>
      </section>
      ${voice ? '' : voiceChooser()}
      <button class="btn btn-lg btn-block" type="button" id="diag-start">▶ ${t('diag.start')}</button>
    </div>`);
  bindVoice(user.id, (v) => { voice = v; });

  document.getElementById('diag-start').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    unlockAudio();
    let exercises;
    try { exercises = await loadExercises(DIAG_PLAN); } catch (err) { console.error(err); toast(t('errors.load'), 'error'); return; }
    const out = await runExercises({ title: t('diag.title'), exercises, voice });
    if (!out) return;

    // Score par compétence
    const results = {};
    for (const p of DIAG_PLAN) {
      const r = out.results[p.slug];
      if (r && r.total > 0) {
        results[p.skill] = Math.round((r.scoreSum / r.total) * 100);
        if (r.selfCheck) results[p.skill + '_auto'] = true; // chanté sans micro : résultat moins fiable
      }
    }
    let saved = null;
    try {
      const program = await getStarterProgram();
      saved = await saveDiagnostic(user.id, results, program?.id ?? null);
    } catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
    showDiagnosticResult(out.stage, out.titleEl, results, saved);
  });
}

function planFor(results) {
  const sorted = Object.entries(results).filter(([k]) => !k.endsWith('_auto')).sort((a, b) => a[1] - b[1]);
  const weak = sorted.filter(([, v]) => v < 75).slice(0, 2).map(([k]) => t('stats.skill_names')[k]);
  const avg = sorted.length ? sorted.reduce((s, [, v]) => s + v, 0) / sorted.length : 0;
  return { weak, avg: Math.round(avg) };
}

function showDiagnosticResult(stage, titleEl, results, saved) {
  if (titleEl) titleEl.textContent = t('diag.result_title');
  const { weak, avg } = planFor(results);
  stage.innerHTML = String(html`
    <div class="summary">
      <p class="center" style="margin:0">${t('diag.result_lead')}</p>
      <ul class="result-list">
        ${Object.entries(results).filter(([k]) => !k.endsWith('_auto')).map(([k, v]) => html`<li><span>${t('stats.skill_names')[k]}</span><strong>${levelLabel(v)} <span class="muted small">(${v} %${results[k + '_auto'] ? ' · ' + t('diag.auto') : ''})</span></strong></li>`)}
      </ul>
      <div class="card card-highlight" style="margin-top:16px">
        <h2 style="font-size:1.15rem">${t('diag.plan_title')}</h2>
        <ol class="plain-list">
          <li>${avg >= 85 ? t('diag.plan_fast') : t('diag.plan_week1')}</li>
          ${weak.length ? html`<li>${t('diag.plan_focus', { skills: weak.join(' et ') })}</li>` : ''}
          <li>${t('diag.plan_then')}</li>
        </ol>
      </div>
      ${saved ? '' : html`<div class="alert alert-error">${t('diag.not_saved')}</div>`}
      <div class="row" style="margin-top:16px">
        <a class="btn" href="#/tableau-de-bord">${t('session.back_dashboard')}</a>
        <a class="btn btn-ghost" href="#/entrainement">${t('train.title')}</a>
      </div>
    </div>`);
}

export async function diagnosticResultPage() {
  const user = getUser();
  let last = null;
  try { last = await getLastDiagnostic(user.id); } catch (err) { console.error(err); }
  mount(html`<div class="container dash" style="max-width:760px"><h1 id="diag-title">${t('diag.result_title')}</h1><section class="card" id="diag-stage"></section></div>`);
  const stage = document.getElementById('diag-stage');
  if (!last) { stage.innerHTML = String(html`<p style="margin:0">${t('diag.none')} <a href="#/diagnostic">${t('diag.start')}</a></p>`); return; }
  showDiagnosticResult(stage, null, last.results ?? {}, last);
}

// ---------------------------------------------------------------------
// ENTRAÎNEMENT PERSONNALISÉ
// Choisit les compétences à revoir aujourd'hui (date de révision dépassée)
// et les plus faibles, puis compose une séance d'environ 10 minutes.
// ---------------------------------------------------------------------
export function pickSkills(scores, max = 3) {
  const now = new Date();
  const known = scores.filter((s) => SKILL_EXERCISES[s.skill_id]);
  const due = known.filter((s) => new Date(s.next_review_at) <= now).sort((a, b) => a.score - b.score);
  const rest = known.filter((s) => !due.includes(s)).sort((a, b) => a.score - b.score);
  const missing = Object.keys(SKILL_EXERCISES).filter((k) => !known.some((s) => s.skill_id === k)).map((k) => ({ skill_id: k, score: 0, reason: 'new' }));
  return [...due.map((s) => ({ ...s, reason: 'due' })), ...missing, ...rest.map((s) => ({ ...s, reason: 'weak' }))].slice(0, max);
}

export async function trainingPage() {
  const user = getUser();
  let profile, scores;
  try { [profile, scores] = await Promise.all([getProfile(user.id), getSkillScores(user.id)]); }
  catch (err) { console.error(err); mount(html`<div class="container dash"><div class="alert alert-error">${t('errors.load')}</div></div>`); return; }
  const chosen = pickSkills(scores.map((s) => ({ ...s, score: Number(s.score) })));
  let voice = profile?.voice_range ?? null;
  const names = t('stats.skill_names');

  mount(html`
    <div class="container dash" style="max-width:760px">
      <div>
        <p class="eyebrow">${t('train.eyebrow')}</p>
        <h1>${t('train.title')}</h1>
        <p class="muted" style="margin:0">${t('train.lead')}</p>
      </div>
      ${scores.length ? '' : html`<div class="alert alert-info">${t('train.no_data')} <a href="#/diagnostic">${t('diag.start')}</a></div>`}
      <section class="card">
        <h2 style="font-size:1.15rem">${t('train.today')}</h2>
        <ul class="plain-list">${chosen.map((s) => html`<li><strong>${names[s.skill_id]}</strong> <span class="muted small">— ${t('train.reason_' + s.reason)}${s.reason !== 'new' ? ` (${Math.round(s.score)} %)` : ''}</span></li>`)}</ul>
      </section>
      ${chosen.some((s) => s.skill_id === 'justesse') && !voice ? voiceChooser() : ''}
      <button class="btn btn-lg btn-block" type="button" id="train-start">▶ ${t('train.start')}</button>
    </div>`);
  bindVoice(user.id, (v) => { voice = v; });

  document.getElementById('train-start').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    unlockAudio();
    let exercises, sessionId = null;
    try {
      exercises = await loadExercises(chosen.map((s) => SKILL_EXERCISES[s.skill_id]));
      sessionId = await startSession(null);
    } catch (err) { console.error(err); toast(t('errors.generic'), 'error'); return; }
    const xpBefore = profile?.xp ?? 0;
    const out = await runExercises({ title: t('train.title'), exercises, sessionId, voice });
    if (!out) return;
    try { await completeSession(sessionId, { score: out.score, validated: true }); } catch (err) { console.error(err); }
    const after = await getProfile(user.id).catch(() => null);
    out.titleEl.textContent = t('train.done_title');
    out.stage.innerHTML = String(html`
      <div class="summary">
        ${out.score !== null ? html`<div class="big-score"><span>${out.score}</span>%</div>` : ''}
        <ul class="result-list">${exercises.map((ex) => { const r = out.results[ex.slug]; return r && r.total ? html`<li><span>${ex.title}</span><strong>${r.correct} / ${r.total}</strong></li>` : ''; })}</ul>
        ${after ? html`<div class="grid grid-2" style="margin-top:16px">
          <div class="mini-stat"><span>${t('session.xp_gained')}</span><strong>+${Math.max(0, after.xp - xpBefore)} XP</strong></div>
          <div class="mini-stat"><span>${t('dashboard.streak')}</span><strong>${t('dashboard.streak_unit', { n: after.current_streak })}</strong></div></div>` : ''}
        <p class="muted small" style="margin-top:12px">${t('train.explain_next')}</p>
        <div class="row" style="margin-top:16px">
          <a class="btn" href="#/tableau-de-bord">${t('session.back_dashboard')}</a>
          <a class="btn btn-ghost" href="#/statistiques">${t('nav.stats')}</a>
        </div>
      </div>`);
  });
}
