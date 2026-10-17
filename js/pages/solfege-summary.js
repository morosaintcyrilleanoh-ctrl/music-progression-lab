// Bloc « Solfège » : résultats enregistrés depuis le volet /solfege
// (fiche élève côté formateur et tableau de bord de l'élève)
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { getSolfegeSessions, getSolfegeCourses, getSolfegeProgress } from '../data.js';
import { syncSolfege } from '../solfege-sync.js';

const LABS = ['lecture-des-notes', 'rythme', 'tonalites', 'intervalles'];
const pct = (c, n) => (n ? Math.round((c / n) * 100) : 0);
const fmt = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// Formations de solfège de l'élève : leçons terminées / total (vide si rien à montrer)
async function coursesProgress(userId) {
  try {
    const [courses, progress] = await Promise.all([getSolfegeCourses(), getSolfegeProgress(userId)]);
    const done = new Set(progress.map((p) => p.lesson_id));
    const list = courses.filter((c) => c.lessons.length && (!c.student_id || c.student_id === userId));
    if (!list.length) return '';
    return String(html`<h3 style="font-size:1rem;margin:18px 0 6px">${t('sol.formations')}</h3>
      <ul class="skills">${list.map((c) => {
        const d = c.lessons.filter((l) => done.has(l.id)).length;
        const n = c.lessons.length;
        return html`<li><div class="skill-head"><span>${c.title}</span><span class="muted">${t('sol.lessons_progress', { d, n })}</span></div>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(d, n)}" aria-label="${c.title}"><span style="width:${pct(d, n)}%"></span></div></li>`;
      })}</ul>`);
  } catch { return ''; } // espace solfège pas encore activé : on n'affiche rien
}

/** Affiche le bloc dans `el`. `own` : c'est l'élève connecté (on envoie d'abord ses séances). */
export async function renderSolfege(el, userId, { own = false } = {}) {
  const labNames = t('solfege.labs');
  let sessions;
  const courses = coursesProgress(userId);
  try {
    if (own) await syncSolfege().catch(() => null);
    sessions = await getSolfegeSessions(userId);
  } catch (err) {
    if (!document.contains(el)) return;
    const missing = err?.code === '42P01' || err?.code === 'PGRST205';
    if (!missing) console.error(err);
    el.innerHTML = String(html`<h2 style="font-size:1.15rem">🎼 ${t('solfege.title')}</h2>
      <p class="muted" style="margin:0">${missing ? t('solfege.not_ready') : t('errors.load')}</p>`);
    return;
  }
  if (!document.contains(el)) return;

  if (!sessions.length) {
    el.innerHTML = String(html`<h2 style="font-size:1.15rem">🎼 ${t('solfege.title')}</h2>
      <p class="muted">${own ? t('solfege.empty_own') : t('solfege.empty_trainer')}</p>
      ${own ? html`<a class="btn btn-sm" href="/solfege/">${t('solfege.open')}</a>` : ''}`);
    el.insertAdjacentHTML('beforeend', await courses);
    return;
  }

  const placement = sessions.find((s) => s.lab === 'positionnement');
  const byLab = LABS.map((lab) => {
    const list = sessions.filter((s) => s.lab === lab);
    const correct = list.reduce((a, s) => a + s.correct, 0);
    const total = list.reduce((a, s) => a + s.total, 0);
    const evals = list.filter((s) => s.mode === 'evaluation');
    return { lab, count: list.length, total, rate: pct(correct, total), lastEval: evals[0] };
  }).filter((l) => l.count);
  const recent = sessions.filter((s) => s.lab !== 'positionnement').slice(0, 8);

  el.innerHTML = String(html`
    <div class="row" style="justify-content:space-between;align-items:baseline">
      <h2 style="font-size:1.15rem;margin:0">🎼 ${t('solfege.title')}</h2>
      ${placement ? html`<span class="small muted">${t('solfege.placement', { level: t('solfege.levels')[placement.level] ?? placement.level, d: fmt(placement.started_at) })}</span>` : ''}
    </div>
    <ul class="skills" style="margin-top:12px">
      ${byLab.map((l) => html`<li>
        <div class="skill-head"><span>${labNames[l.lab]}</span><span class="muted">${l.rate} % · ${t('solfege.sessions_n', { n: l.count })}</span></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${l.rate}" aria-label="${labNames[l.lab]}"><span style="width:${l.rate}%"></span></div>
        ${l.lastEval ? html`<div class="muted small" style="margin-top:4px">${t('solfege.last_eval', { score: `${l.lastEval.correct}/${l.lastEval.total}`, d: fmt(l.lastEval.started_at) })}</div>` : ''}
      </li>`)}
    </ul>
    ${recent.length ? html`<h3 style="font-size:1rem;margin:18px 0 6px">${t('solfege.recent')}</h3>
      <ul class="plain-list small">${recent.map((s) => html`<li>
        ${s.mode === 'evaluation' ? '📝' : '🎯'} <strong>${labNames[s.lab]}</strong> — ${s.correct}/${s.total} (${pct(s.correct, s.total)} %)
        <span class="muted">· ${t(s.mode === 'evaluation' ? 'solfege.mode_eval' : 'solfege.mode_training')} · ${fmt(s.started_at)}${s.finished_at ? '' : ' · ' + t('solfege.unfinished')}</span></li>`)}</ul>` : ''}
    ${own ? html`<p class="muted small" style="margin:12px 0 0">${t('solfege.own_hint')} <a href="/solfege/">${t('solfege.open')}</a></p>` : ''}`);
  el.insertAdjacentHTML('beforeend', await courses);
}
