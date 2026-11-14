// Bloc « Oreille musicale » : nouvelles activités, examens, défi du jour, programmes
// (fiche élève côté formateur et tableau de bord de l'élève)
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { getEarResults, getProgramProgress } from '../data.js';
import { ACTIVITIES } from '../ear/activities.js';
import { PROGRAMS } from '../ear/programs.js';
import { HARMONY_ACTIVITIES, harmonyText } from './harmony.js';

const T = (k, v) => t('earp.' + k, v);
const pct = (c, n) => (n ? Math.round((c / n) * 100) : 0);

export async function renderEarPlus(el, userId, { own = false } = {}) {
  let rows, progress;
  try {
    [rows, progress] = await Promise.all([getEarResults(userId), getProgramProgress(userId)]);
  } catch (err) {
    if (!document.contains(el)) return;
    const missing = err?.code === '42P01' || err?.code === 'PGRST205';
    if (!missing) console.error(err);
    el.innerHTML = String(html`<h2 style="font-size:1.15rem">👂 ${T('title')}</h2><p class="muted" style="margin:0">${missing ? T('summary_not_ready') : t('errors.load')}</p>`);
    return;
  }
  if (!document.contains(el)) return;
  const acts = [...ACTIVITIES, ...HARMONY_ACTIVITIES].map((a) => {
    const list = rows.filter((r) => r.activity === a.id && r.kind !== 'examen');
    if (!list.length) return null;
    const c = list.reduce((x, r) => x + r.correct, 0), n = list.reduce((x, r) => x + r.total, 0);
    return { a, count: list.length, rate: pct(c, n), level: Math.max(...list.map((r) => r.level ?? 1)) };
  }).filter(Boolean);
  const exams = rows.filter((r) => r.kind === 'examen');
  const defis = new Set(rows.filter((r) => r.kind === 'defi').map((r) => r.day));
  const titleOf = (a) => T('act')[a.id]?.title ?? harmonyText(a.id)?.title ?? t('ear.modes')[a.earMode]?.title ?? a.id;
  const programs = PROGRAMS.map((p) => ({ p, n: progress.filter((x) => x.program === p.slug).length })).filter((x) => x.n);
  if (!acts.length && !exams.length && !defis.size && !programs.length) {
    el.innerHTML = String(html`<h2 style="font-size:1.15rem">👂 ${T('title')}</h2>
      <p class="muted" style="margin:0">${own ? T('summary_empty_own') : T('summary_empty')}</p>
      ${own ? html`<a class="btn btn-sm" style="margin-top:10px" href="#/oreille">${T('summary_open')}</a>` : ''}`);
    return;
  }
  el.innerHTML = String(html`
    <h2 style="font-size:1.15rem">👂 ${T('title')}</h2>
    <p class="small" style="margin:0 0 10px">⚡ ${T('summary_defi', { n: defis.size })}</p>
    ${acts.length ? html`<ul class="skills">${acts.map((x) => html`<li>
      <div class="skill-head"><span>${x.a.icon} ${titleOf(x.a)}</span><span class="muted">${x.rate} % · ${T('level_n', { n: x.level })}</span></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${x.rate}" aria-label="${titleOf(x.a)}"><span style="width:${x.rate}%"></span></div></li>`)}</ul>` : ''}
    ${exams.length ? html`<h3 style="font-size:1rem;margin:16px 0 6px">${T('exams')}</h3><ul class="plain-list small">${exams.slice(0, 10).map((r) => html`<li>${r.passed ? '🏅' : '📝'}
      <strong>${T('exam')[r.activity.replace('examen-', '')] ?? r.activity}</strong> — ${r.correct}/${r.total} <span class="muted">· ${new Date(r.created_at).toLocaleDateString('fr-FR')}${r.passed ? ' · ' + T('summary_passed') : ''}</span></li>`)}</ul>` : ''}
    ${programs.length ? html`<h3 style="font-size:1rem;margin:16px 0 6px">${T('programs')}</h3><ul class="plain-list small">${programs.map((x) => html`<li>${x.p.icon} ${T('program')[x.p.slug].title} — ${T('days_done', { n: x.n })}</li>`)}</ul>` : ''}`);
}
